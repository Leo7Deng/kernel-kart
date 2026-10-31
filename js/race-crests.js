// Kernel Kart: the Apennine Crests (Moonshot). In the Moon's weak gravity you go light over a crest: faster means less
// grip (`crestGrip`), and past its float speed you leave the road, flying straight on until you land. Each crest leads
// into a turn: lift before it to make the turn, or float over and land pointing the wrong way. Each crest is shaped
// differently. Heights along the road (crests.h, world units: cosine bumps); slopes act on the ground.
// Per kart (plain numbers): c.crestJ (floating off crest index +1), c.crestV (landing speed).
import { Math } from './detmath.js';   // deterministic maths, the same on every computer (detmath.js)
import { STEP, clamp } from './core.js';
import { curvAt, vmaxAt } from './geometry.js';
import { nearestS } from './race-mechanics.js';

export const CREST_G = 260;    // the Moon's gravity here (world units/s²): on the slopes and in the air
const K_LAND = 0.85, SOFT = 60;   // a landing loses this share of the speed into the ground beyond the first SOFT
const LIGHT_MIN = 0.3;         // the least grip going light over a crest leaves you (as a share)
const TURN_K = 1 / 700;        // where a crest's turn starts: the road bends tighter than this (world units)
const MARGIN = 40;             // a clean crest comes down at least this far short of its turn

// crests: [{ at: [x, y], w, h }]: top (layout units), half-length along the road, height (world units)
export function buildCrests(T) {
  const d = T.def.crests; if (!d) return null;
  const sc = T.def.scale, Z = { list: [] };
  for (const [i, e] of d.entries()) {
    const s = nearestS(T, e.at[0] * sc, e.at[1] * sc), w = e.w, h = e.h;
    Z.list.push({ i, s, w, h, s0: s - w, s1: s + w, kTop: h * Math.PI * Math.PI / (2 * w * w) });
  }
  Z.s0 = Math.min(...Z.list.map(C => C.s0)) - 20; Z.s1 = Math.max(...Z.list.map(C => C.s1)) + 20;
  const n = Math.ceil((Z.s1 - Z.s0) / STEP) + 1;
  Z.h = new Float32Array(n); Z.g1 = new Float32Array(n); Z.g2 = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const s = Z.s0 + k * STEP;
    for (const C of Z.list) {
      const x = s - C.s; if (Math.abs(x) >= C.w) continue;
      const a = Math.PI * x / C.w;
      Z.h[k] += C.h * (1 + Math.cos(a)) / 2; Z.g1[k] += -C.h * Math.PI / (2 * C.w) * Math.sin(a); Z.g2[k] += -C.h * Math.PI * Math.PI / (2 * C.w * C.w) * Math.cos(a);
    }
  }
  // each crest's float speed (v² × top curvature = gravity), its turn (where the road first bends hard), and its window:
  // the fastest that still lands MARGIN short of the turn (gauge, bots)
  for (const C of Z.list) {
    C.vFloat = Math.sqrt(CREST_G / C.kTop);
    C.turn = C.s1 + 600; for (let s = C.s; s < C.s1 + 600; s += 4) if (Math.abs(curvAt(T, s)) > TURN_K) { C.turn = s; break; }
    C.vOk = C.vFloat;
    for (let v = Math.floor(C.vFloat); v <= 700; v += 2) { const F = takeoff(Z, C.s0, C.s1, v); if (F && F.s > C.turn - MARGIN) break; C.vOk = v; }
  }
  return Z;
}
const at = (Z, A, s) => { const k = Math.round((s - Z.s0) / STEP); return k < 0 || k >= A.length ? 0 : A[k]; };
export const crestH = (Z, s) => at(Z, Z.h, s);
export const crestGr = (Z, s) => at(Z, Z.g1, s);
const crestK = (Z, s) => at(Z, Z.g2, s);
// leaving the road at s at v: airtime (t), landing s, landing speed (v), how hard (into); null if the road stops falling
// away before you're clear (just over the float speed)
export function flight(Z, s, v) {
  let z = crestH(Z, s), vz = v * crestGr(Z, s), t = 0, up = false;
  const h = 1 / 240;
  for (let n = 0; n < 2400; n++) {
    t += h; s += v * h; vz -= CREST_G * h; z += vz * h;
    const g = crestH(Z, s);
    if (!up) { if (z <= g) { if (v * v * crestK(Z, s) >= -CREST_G) return null; z = g; vz = v * crestGr(Z, s); } else if (z > g + 0.5) up = true; continue; }   // pressed to the road until it falls away clear of you
    if (z <= g) {
      const m = crestGr(Z, s), b = Math.atan(m), along = v * Math.cos(b) + vz * Math.sin(b), into = Math.max(0, -(-v * Math.sin(b) + vz * Math.cos(b)));
      return { t, s, v: Math.max(0.5 * v, along - K_LAND * Math.max(0, into - SOFT)), into };
    }
  }
  return { t, s, v, into: 0 };
}
// held at v from a to b: where (if anywhere) it floats off, and its flight
function takeoff(Z, a, b, v) {
  for (let s = a; s < b; s += STEP) if (v * v * crestK(Z, s) < -CREST_G) return flight(Z, s, v);
  return null;
}
// how much grip going light over a crest leaves you (1 off them, or in a hollow)
export function crestGrip(c) {
  const Z = c.T.mech && c.T.mech.crests; if (!Z || c.s < Z.s0 || c.s > Z.s1 || c.air > 0) return 1;
  return clamp(1 + c.speed * c.speed * crestK(Z, c.s) / CREST_G, LIGHT_MIN, 1);
}

// one car, one frame: the slopes on the ground, floating off, the landings
export function crestsCar(c, dt) {
  const Z = c.T.mech.crests; if (!Z) return;
  if (c.crestJ && c.air <= 0) {   // down: the landing
    const k = c.crestV0 > 1 ? c.speed / c.crestV0 : 1;
    c.speed = c.crestV * k; c.crestJ = 0;
    if (c.crestIn > 120) { this.jolt(c, Math.min(0.6, c.crestIn / 400)); for (let i = 0; i < 5; i++) this.fxPuff(c.x + (i - 2) * 9, c.y + (i % 2) * 8, '#d3d0c8', 14, 0.8, (i - 2) * 30, 20); }
    else this.fxRing(c.x, c.y, '#e8e4da', 46, 0.35, 4);
  }
  if (c.s < Z.s0 || c.s > Z.s1 || c.finished) return;
  if (c.air <= 0 && c.ff <= 0 && !(c.oc > 0 && c.ocT) && c.frozen <= 0 && c.bubbled <= 0) c.speed = Math.max(0, c.speed - CREST_G * crestGr(Z, c.s) * dt);   // up slows, down speeds up
  if (c.air > 0 || c.ff > 0 || c.oc > 0 || c.off || c.jumpCd > 0 || c.speed < 60) return;
  if (c.human) { const C = Z.list[0], ds = C.s0 - c.s; if (ds > 300 && ds < 900 && c.crestWarn !== c.lap + 1) { c.crestWarn = c.lap + 1; this.feed('warn', 'lowg', c); } }
  if (c.speed * c.speed * crestK(Z, c.s) < -CREST_G) {   // the road falls away faster than you do: off you float
    const F = flight(Z, c.s, c.speed), C = Z.list.find(C => c.s > C.s0 - 4 && c.s < C.s1 + 4); if (!F) return;
    c.air = c.airT = F.t; c.jumpAt = c.s; c.jumpCd = F.t + 0.2; c.landS = null; c.trick = false;
    c.crestJ = (C ? C.i : 0) + 1; c.crestV = F.v; c.crestV0 = c.speed; c.crestIn = F.into;
    this.sound('jump', c, c.human ? 0.6 : 0.3);
  }
}
// a bot takes each crest at most at its window's top (worse bots a little under, and off by their own luck once a crest),
// slowing before it goes light; no boosts into one
export function crestsAI(c, skill, brake, plan) {
  const Z = c.T.mech.crests; if (!Z) return;
  c.ai.crestNear = false;
  for (const C of Z.list) {
    const ds = C.s - C.w * 0.6 - c.s; if (ds < -C.w * 0.7 || ds > 1100) continue;
    const E = c.ai.crestE || (c.ai.crestE = {});
    if (E[C.i] === undefined) E[C.i] = (c.rng() * 2 - 1) * clamp((1.1 - skill) * 0.25, 0.01, 0.05);
    // and slow enough for the turn: floating, it can't lift, so it must be down to the turn's speed (less what it can lift after landing) before the crest
    let vT = 1e4; for (let s = C.turn; s < C.turn + 300; s += 16) vT = Math.min(vT, vmaxAt(c.T, s, c.grip * (plan.grip ? plan.grip(s) : 1)) * skill);
    const vC = Math.sqrt(vT * vT + 2 * brake * Math.max(0, C.turn - C.s - C.w * 0.6));
    plan.caps.push({ ds: Math.max(0, ds - 60), v: Math.min(C.vOk * clamp(0.95 + (skill - 1) * 0.3, 0.88, 1), Math.max(vC, C.vFloat * 0.98)) * (1 + E[C.i]) });
    c.ai.crestNear = true;   // race-timed.js sets c.hazNear from it (no boosts)
    break;
  }
}
