// Kernel Kart: the item registry. Each item is one module in this folder: its text, its odds, what it does when
// fired, when a bot fires it, its icon, and anything it leaves in the world (projectiles, mines, slicks, ducks).
// To add an item: write its module, import it here, and give it odds.
import boost from './boost.js';
import bubble from './bubble.js';
import duck from './duck.js';
import ff from './ff.js';
import fork from './fork.js';
import ghost from './ghost.js';
import grow from './grow.js';
import leak from './leak.js';
import loop from './loop.js';
import mega from './mega.js';
import oc from './oc.js';
import panic from './panic.js';
import pull from './pull.js';
import shield from './shield.js';
import sudo from './sudo.js';
import thread from './thread.js';
import tomato from './tomato.js';
import undo from './undo.js';
import { clamp } from '../core.js';

// in menu order
export const ITEMS = Object.fromEntries([boost, oc, shield, sudo, grow, duck, mega, undo, pull, ghost, thread, ff, tomato, fork, leak, loop, bubble, panic].map(it => [it.id, it]));
export const ITEM_ORDER = Object.keys(ITEMS);

// Odds. Your place decides which items you can get at all (the pool: lead, front half, back half, last, scaled to the
// field size); how far you trail the leader decides the chances inside it. Each item's `odds` gives, per pool it's in,
// [weight when close, weight FAR_GAP or more back] (the leader's is one number: nobody's ahead). An item's weight
// follows how much it catches up from that far back, used well: Overclock across a hairpin, Fast-Forward on a straight,
// Pull Request and Kernel Panic grow with the gap; a Mega Duck or a Rubber Duck only pays off when you're close enough
// to pass, so it's for a close 2nd, not a far last.
export const TIERS = ['lead', 'front', 'back', 'last'];
// a car's pool from its place: 1st leads, last is last (2nd of 2 too), the rest split into front and back halves
export const placeTier = (rank, nCars) => rank <= 1 ? 'lead' : rank >= nCars ? 'last' : (rank - 1) / (nCars - 1) <= 0.5 ? 'front' : 'back';
// how far a car trails the leader, 0..1: a distance on the road, the same on every track (it was a third of a lap,
// 1600..5100 units by track, so on the long tracks you almost never counted as far back). 3200 is about 8 s at full speed
// (it was 1600 for a while: the user found the odds improved too fast, 3 s back already rolled big catch-up items).
// With 3+ players (pack) you count as far back sooner, so the chasers get their catch-up items earlier.
export const FAR_GAP = 3200, PACK_GAP = 0.7;
export const gapK = (gap, pack = false) => clamp(gap / (FAR_GAP * (pack ? PACK_GAP : 1)), 0, 1);
// With 3+ players (pack) the chasers tend to fight each other while the leader drives off, so the odds lean on the leader:
// - an item's `pack` scales its weight for everyone but the leader: under 1 for items you mostly use on the car just
//   ahead (Ctrl+Z, Fork Bomb, the ducks), over 1 for items that only go for the leader (Bubble, Pull Request)
// - an item's `leadFade` thins it out of the leader's pool the further 1st is ahead of 2nd (lead, 0..1 like gapK): a big
//   lead is harder to defend (Firewall, Ghost), so the chasers' leader items land
// Items that only work on a kart right by you (a duck, something dropped behind, a shield, Ctrl+Z on the car just ahead):
// once you're well behind they're no use, so they fade out with the gap and are gone by CLOSE_GAP (of the way to far:
// 0.5 is 1600 units, about 4 s back). The user: far behind, you shouldn't still get the small duck.
const CLOSE_ONLY = new Set(['duck', 'tomato', 'leak', 'loop', 'fork', 'shield', 'undo']), CLOSE_GAP = 0.5;
// the weight of each item in pool tier with gap g (gapK). npm run odds prints these as percentages.
export function itemChances(tier, g = 0, { pack = false, lead = 0 } = {}) {
  const t = {};
  for (const k of ITEM_ORDER) {
    const it = ITEMS[k], o = it.odds[tier]; if (o === undefined) continue;
    // a number (the leader), [close, far] (slides with the gap), or { from, w: [a, b] }: none until the gap reaches `from`,
    // then it jumps straight to a and keeps climbing to b at far (the strong catch-up items: you have to be properly behind)
    let v = typeof o === 'number' ? o : Array.isArray(o) ? o[0] * (1 - g) + o[1] * g : g < o.from ? 0 : o.w[0] + (o.w[1] - o.w[0]) * (g - o.from) / (1 - o.from);
    if (pack && tier !== 'lead' && it.pack) v *= it.pack;
    if (pack && tier === 'lead' && it.leadFade) v *= 1 - it.leadFade * lead;
    if (CLOSE_ONLY.has(k)) v *= clamp(1 - g / CLOSE_GAP, 0, 1);   // too far back for it to be any use: it stops coming
    if (v > 0) t[k] = v;
  }
  return t;
}
// the chances for a car at this place (rank of nCars) and gap g. A two-kart race has only a leader and a last, so 2nd
// would only ever see the last-place pool (no Firewall, Rubber Duck, Segfault, Memory Leak or Fork Bomb, however
// close): instead it blends from the front pool when close (a scrap for the lead) to the last pool when far back.
export const DUEL_CAP = 0.8;
// An activation threshold: an item with under MIN_PCT % of the chances at this place and distance doesn't come at all (a 2%
// sliver is just noise in the roll), and the rest are scaled back up to 100%. Applied until nothing's under it.
export const MIN_PCT = 5;
function activate(t) {
  for (let pass = 0; pass < 4; pass++) {
    let sum = 0; for (const k in t) sum += t[k];
    const low = Object.keys(t).filter(k => t[k] / sum * 100 < MIN_PCT); if (!low.length || low.length === Object.keys(t).length) return t;
    for (const k of low) delete t[k];
  }
  return t;
}
export function placeChances(rank, nCars, g = 0, opts) { return activate(rawChances(rank, nCars, g, opts)); }
function rawChances(rank, nCars, g, opts) {
  if (!(nCars <= 2 && rank === 2)) return itemChances(placeTier(rank, nCars), g, opts);
  g = Math.min(g, DUEL_CAP);   // a far 2nd of 2 got Fast-Forwards and Overclocks a bit too often: it stops a little short of the full far odds
  const f = itemChances('front', g, opts), l = itemChances('last', g, opts), t = {};
  const sf = Object.values(f).reduce((a, b) => a + b, 0), sl = Object.values(l).reduce((a, b) => a + b, 0);
  for (const k of ITEM_ORDER) { const v = (f[k] || 0) / sf * (1 - g) + (l[k] || 0) / sl * g; if (v > 0) t[k] = v * 100; }
  return t;
}
// t: a chances table (placeChances); rng: the car's own stream (see core.js)
export function rollItem(t, rng = Math.random) {
  let sum = 0; for (const k in t) sum += t[k];
  let r = rng() * sum;
  for (const k in t) { r -= t[k]; if (r <= 0) return k; }
  return 'boost';
}
