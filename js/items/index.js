// The item registry and roll odds. Each item is one module here (text, odds, use, wantUse, world objects).
import { Math } from '../detmath.js';
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

// Place picks the pool (lead, front, back, last); the gap to the leader picks chances inside it. `odds` per pool:
// [weight close, weight at FAR_GAP+] (the leader's is one number), following how much the item catches up from there.
export const TIERS = ['lead', 'front', 'back', 'last'];
// a car's pool from its place: 1st leads, last is last (2nd of 2 too), the rest split into front and back halves
export const placeTier = (rank, nCars) => rank <= 1 ? 'lead' : rank >= nCars ? 'last' : (rank - 1) / (nCars - 1) <= 0.5 ? 'front' : 'back';
// how far a car trails the leader, 0..1, in road units (same on every track); 3200 is about 8 s. With 3+ players
// (pack) you count as far back sooner.
export const FAR_GAP = 3200, PACK_GAP = 0.7;
export const gapK = (gap, pack = false) => clamp(gap / (FAR_GAP * (pack ? PACK_GAP : 1)), 0, 1);
// Pack (3+ players) leans the odds on the leader: `pack` scales a chaser's weight (<1 for items used on the car just
// ahead, >1 for leader-only ones); `leadFade` thins the leader's pool as 1st pulls away from 2nd (lead 0..1).
// CLOSE_ONLY items only work on a kart right by you: they fade with the gap and are gone by CLOSE_GAP (~4 s back).
const CLOSE_ONLY = new Set(['duck', 'tomato', 'leak', 'loop', 'fork', 'shield', 'undo']), CLOSE_GAP = 0.5;
// the weight of each item in pool tier with gap g (gapK). npm run odds prints these as percentages.
export function itemChances(tier, g = 0, { pack = false, lead = 0 } = {}) {
  const t = {};
  for (const k of ITEM_ORDER) {
    const it = ITEMS[k], o = it.odds[tier]; if (o === undefined) continue;
    // a number (leader), [close, far] (slides with the gap), or { from, w: [a, b] }: none below `from`, then a rising to b
    let v = typeof o === 'number' ? o : Array.isArray(o) ? o[0] * (1 - g) + o[1] * g : g < o.from ? 0 : o.w[0] + (o.w[1] - o.w[0]) * (g - o.from) / (1 - o.from);
    if (pack && tier !== 'lead' && it.pack) v *= it.pack;
    if (pack && tier === 'lead' && it.leadFade) v *= 1 - it.leadFade * lead;
    if (CLOSE_ONLY.has(k)) v *= clamp(1 - g / CLOSE_GAP, 0, 1);
    if (v > 0) t[k] = v;
  }
  return t;
}
// chances at this place (rank of nCars) and gap g. 2nd of 2 blends the front pool (close) into the last pool (far),
// or it would only ever see the last pool.
export const DUEL_CAP = 0.8;
// items under MIN_PCT % of the chances are dropped (noise in the roll), repeated until none is under it
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
  g = Math.min(g, DUEL_CAP);   // stops short of the full far odds (too many Fast-Forwards otherwise)
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
