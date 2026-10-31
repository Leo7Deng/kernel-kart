// Kernel Kart: a canyon (Moonshot's Hadley Rille): rock walls both sides, no run-off; run wide and you scrape along the
// rock. Only the run-off's limit changes (canyonRunoff, via race.js's run-off hook).
import { Math } from './detmath.js';   // deterministic maths, the same on every computer (detmath.js)
import { frnd } from './core.js';
import { nearestS } from './race-mechanics.js';

export const WALL = 6;   // how far past the road's edge the rock is (world units)
const KNOCK = 0.82, GRIND = 1.2;   // hitting the wall keeps this share of your speed; grinding along it loses this share a second

// canyon: [{ from, to }] (layout points on the road): built once per track
export function buildCanyon(T) {
  const sc = T.def.scale;
  return (T.def.canyon || []).map(d => ({ s0: nearestS(T, d.from[0] * sc, d.from[1] * sc), s1: nearestS(T, d.to[0] * sc, d.to[1] * sc) }));
}
export const inCanyon = (T, s) => T.mech.canyon.some(z => s >= z.s0 && s <= z.s1);
// the run-off's limit (lim, past the road's middle) here: the wall, in a canyon
export function canyonRunoff(c, lim, hw) {
  const L = c.T.mech.canyon; if (!L.length || !inCanyon(c.T, c.s)) return lim;
  return Math.min(lim, hw + WALL);
}
// against the wall: a knock as you hit it, then grinding along it (on top of the run-off's crawl), sparks and grit
export function canyonCar(c, dt) {
  const L = c.T.mech.canyon; if (!L.length) return;
  if (!c.off || c.air > 0 || !inCanyon(c.T, c.s) || c.ghost > 0 || c.oc > 0) { c.onWall = false; return; }
  if (!c.onWall) { c.onWall = true; if (c.speed > 150) { c.speed *= KNOCK; this.jolt(c, 0.35); } }
  c.speed *= Math.exp(-GRIND * dt);
  if (c.speed > 60) {
    const sd = Math.sign(c.lat) || 1, ch = Math.cos(c.heading), sh = Math.sin(c.heading), x = c.x - sh * sd * c.W * 0.5, y = c.y + ch * sd * c.W * 0.5;
    if ((c.wallFx = (c.wallFx || 0) - dt) <= 0) { c.wallFx = 0.07; this.fxSparks(x, y, 3, '#ffd27a', 150); this.fxPuff(x, y, '#cfc9bd', frnd(7, 11), 0.5, -ch * 40, -sh * 40); }
    if (c.human && this.time - (c.wallSnd ?? -9) > 0.6) { c.wallSnd = this.time; this.sound('scrape', c, 0.7); }
  }
}
