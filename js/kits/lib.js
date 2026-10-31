// @ts-check
// Fight mode: small helpers for the plug-in fighters' kits (js/kits/<id>.js). DOM-free and deterministic, and a leaf
// module (core.js and fight-arenas.js only), so a plug-in never imports fight.js or fight-chars.js (they
// import the plug-ins: that would be a loop). Everything a kit needs from the fight itself comes in on F (the Fight):
//   F.f[i], F.objs, F.ev(kind, x, y, power, who, extra), F.go(f, state, dur), F.hitF(a, d, mv, opt) (true if it
//   connected; F.lastRes says how: 'hit', 'clink', 'soak'...), F.knockDown(f, a, kb, by), F.release(f), F.keepIn(f),
//   F.contactsAll(x, y, r) (walls, solids, containers), F.ctl(f) (the held input: { inp, mag, dirA }), F.A (the arena),
//   F.rngs[2]() (the fight's own random stream: the only randomness a kit may use), F.hitstop, F.dmgMul
import { Math } from '../detmath.js';
import { TAU, clamp } from '../core.js';
import { sd } from '../fight-arenas.js';

export { TAU, clamp, sd };
export const D2R = Math.PI / 180;
export const AIM = 60 * D2R;   // (fight.js RULES.aim: a move aims the held way if it's within this of the foe)
export const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
export const turnTo = (a, b, max) => { const d = angDiff(b, a); return a + clamp(d, -max, max); };
export const angMid = (a, b) => b + angDiff(a, b) / 2;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const toward = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
// the move's phase (f.ph: the drawer's pose key; f.pht how long in it)
export function setPh(f, ph) { if (f.ph !== ph) { f.ph = ph; f.pht = 0; } }
// a new world object (plain data: the online snapshots carry it), owned by fighter f; o gives the rest (kind, x, y...).
// mv/ms tie it to this go of f's move (sameGo): an object that should vanish when the move is cut short checks it
export function spawn(F, f, o) {
  const ob = { x: f.x, y: f.y, z: 0, vx: 0, vy: 0, vz: 0, r: 0, t: 0, life: 99, owner: f.i, hit: false, mv: f.move, ms: f.ms, ...o };
  ob.id = ++F.oid; F.objs.push(ob); return ob;
}
export const sameGo = (f, ob) => f.move === ob.mv && f.ms === ob.ms;
// f's live object of this kind, if any
export const mine = (F, f, kind) => F.objs.find(b => b.kind === kind && b.owner === f.i && b.t < b.life);
export const gone = ob => { ob.life = ob.t; };
// a point inside the arena (pad units from its wall), clear of the solids: pulled toward the middle until it is
export function inside(F, x, y, pad) {
  for (let k = 0; k < 24; k++) {
    if (sd(F.A.bounds, x, y)[0] < -pad && !F.A.solids.some(o => sd(o, x, y)[0] < 2)) break;
    x *= 0.9; y *= 0.9;
  }
  return [x, y];
}
// a body of radius r fits at (x, y): no wall, solid or container in the way
export const fits = (F, x, y, r) => !F.contactsAll(x, y, r).length;
// how far a point is from the segment (x0,y0)-(x1,y1), and how far along it (0..1)
export function segDist(px, py, x0, y0, x1, y1) {
  const ex = x1 - x0, ey = y1 - y0, L = ex * ex + ey * ey || 1, t = clamp(((px - x0) * ex + (py - y0) * ey) / L, 0, 1);
  return [Math.hypot(px - x0 - ex * t, py - y0 - ey * t), t];
}
// the foe can be touched by a move right now (on the ground, not between portals, not down or out)
export const open = o => o.z < 20 && !o.gone && o.state !== 'ko';
// a short move along angle a by up to d, stopping short of walls and of the other fighter (an evade's destination)
export function landing(F, f, o, a, d) {
  let x = f.x + Math.cos(a) * d, y = f.y + Math.sin(a) * d;
  for (let k = 0; k < 24 && (F.contactsAll(x, y, f.r).length || Math.hypot(o.x - x, o.y - y) < f.r + o.r); k++) { x -= Math.cos(a) * d / 24; y -= Math.sin(a) * d / 24; }
  return [x, y];
}
