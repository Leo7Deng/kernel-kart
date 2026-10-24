// Kernel Kart: moving walkways and baggage belts (Gateway 8080's terminal). A belt is a strip of the road that moves:
// on it you go as fast as you're driving plus the belt (or minus it, against one), the way you'd walk on a moving
// walkway. Most run with you, along one lane of a straight or round the inside of the Carousel hairpin (the baggage
// belt), and the steering line leans onto one a little as you come up to it (like an item box), so whether you're on it
// comes down to your line: the one along Check-in is on the outside of the Carousel (carry speed and you ride it longer),
// the Carousel's is on the inside (lift early and you ride round on it), the one before the fork is on the outside of
// the Travelator's turn-off. The Travelator itself, the shortcut through the terminal, is one wide walkway running the
// wrong way: shorter, but it holds you back, unless you're boosting (then you skim up it at full speed).
// No state: a belt is where it is and moves at its speed, so this is a pure function of where a kart is.
import { clamp, lerp } from './core.js';
import { halfWAt, trackSample } from './geometry.js';
import { nearestS } from './race-mechanics.js';

const PULL = 0.5;        // how hard the line leans onto a belt with you (an item box pulls 0.84)
const LOOK = 380;        // ...from this far before it

// belts: [{ from, to, lat, w, v }] (from/to: layout points on the road; lat: where across it, a share of the half-width,
// + the driver's right; w: its width, world units, or 'full'; v: its speed, + with the traffic). A course lists them
// all; each road takes the ones lying on it.
export function buildBelts(T) {
  const sc = T.def.scale;
  return (T.def.belts || []).flatMap(d => {
    const ax = d.from[0] * sc, ay = d.from[1] * sc, bx = d.to[0] * sc, by = d.to[1] * sc;
    const s0 = nearestS(T, ax, ay), s1 = nearestS(T, bx, by), qa = trackSample(T, s0), qb = trackSample(T, s1);
    if (Math.hypot(qa.x - ax, qa.y - ay) > qa.hw * 0.6 || Math.hypot(qb.x - bx, qb.y - by) > qb.hw * 0.6 || s1 <= s0) return [];   // (not on this road)
    const hw = halfWAt(T, (s0 + s1) / 2), full = d.w === 'full';
    return [{ s0, s1, lat: full ? 0 : d.lat * hw, half: full ? hw + 30 : d.w / 2, v: d.v, full, ring: !!d.ring }];
  });
}
// how much of kart c is on belt b (0..1)
export const onBelt = (c, b) => c.s < b.s0 || c.s > b.s1 ? 0 : clamp((b.half + c.W / 2 - Math.abs(c.lat - b.lat)) / c.W, 0, 1);

// one kart: carried along (or held back) by any belt under it
export function beltsCar(c, dt) {
  const B = c.T.mech.belts; if (!B.length) return;
  c.belt = 0;
  if (c.air > 0 || c.ff > 0 || c.oc > 0) return;
  for (const b of B) {
    if (b.v < 0 && (c.boost > 0 || c.mtT > 0)) continue;   // boosting (a drift's mini-turbo too), you skim up a wrong-way walkway: it can't hold you back
    const f = onBelt(c, b); if (f <= 0) continue;
    const q = trackSample(c.T, c.s);
    c.x += q.tx * b.v * f * dt; c.y += q.ty * b.v * f * dt;
    c.belt = Math.sign(b.v) * Math.round(f * 10) / 10;
  }
}
// the line leans onto a belt with you as you come up to it, and stays on it while you ride it (less through a corner,
// where your speed decides your line)
export function beltLine(c, tgt, prof, edgeIn) {
  const B = c.T.mech.belts; if (!B.length) return tgt;
  for (const b of B) {
    if (b.v <= 0 || b.full) continue;
    const ds = b.s0 - c.s, on = c.s >= b.s0 && c.s < b.s1 - 40;
    if (!on && (ds < 0 || ds > LOOK)) continue;
    const w = (on ? 1 : clamp((LOOK - ds) / 210, 0, 1)) * PULL * clamp(1 - Math.abs(prof * c.reach), 0.3, 1);
    tgt = lerp(tgt, clamp(b.lat, -edgeIn, edgeIn), w);
  }
  return tgt;
}

// ---------------------------------------------------------------- the bots
// the fork onto a wrong-way walkway (the Travelator): which of this road's forks, if any
function travelator(race, T) {
  if (!T.forks || !T.forkS) return [];
  const out = [];
  T.forks.forEach((f, k) => { const fs = T.forkS[k], alt = fs && race.routes[fs.alt]; if (fs && !f.split && !f.gate && !f.thicket && alt.mech && alt.mech.belts.some(b => b.v < 0)) out.push({ k, fs, alt }); });
  return out;
}
// a bot coming up to the Travelator's fork decides (before the usual fork logic, race-ai.js, would toss a coin): it
// goes up it only with a Turbo to fire up it (the better the bot, the surer), else the long way round
export function beltsAI(c, skill) {
  for (const { k, fs } of travelator(this, c.T)) {
    const ds = fs.sLock - c.s; if (ds <= 1200 || ds > 2400) continue;
    const plan = c.ai.forkPlan || (c.ai.forkPlan = {}), key = c.lap * 4 + k;
    if (plan[key] === undefined) plan[key] = c.item === 'boost' && c.rng() < clamp(0.55 + (skill - 0.92) * 2.5, 0.4, 0.95);
  }
}
// a bot holding a Turbo: up the Travelator, fire it as it gets onto the walkway; set for the Travelator, keep it till then.
// null: nothing to do with the belts (the item decides)
export function beltUse(race, c) {
  if (c.item !== 'boost') return null;
  const T = c.T;
  for (const b of T.mech ? T.mech.belts : []) if (b.v < 0) { const ds = b.s0 - c.s; if (ds < 60 && c.s < b.s1 - 200) return true; if (ds >= 60 && ds < 1500) return false; }
  for (const { k, fs } of travelator(race, T)) { const ds = fs.sLock - c.s; if (ds >= -20 && ds < 2400 && c.ai.forkPlan && c.ai.forkPlan[c.lap * 4 + k]) return false; }
  return null;
}
