// Kernel Kart: rain and the dry line (Neon Overflow). Spells of rain on a per-race timetable (race.rng) wet the road
// (WET_T) and it dries after (DRY_T); `wetAt` is a pure function of timetable and clock. Wet = up to WET_LOSS less grip.
// Karts squeegee a dry line: a grid (a cell every BIN × LANES) of how much water tyres pushed off (0..1); rain washes it
// back. Puddles in the dips aquaplane you (no grip, no steering for AQ_T) above AQ_V.
// Online: race.rainT and race.dryQ (the grid as a string, republished every PUB s from the host-only accumulator
// `dryAccOf`, so snapshots never carry it and predictions never dry anything). `wetUnder` is the hook for drifting.
import { Math } from './detmath.js';   // deterministic maths, the same on every computer (detmath.js)
import { clamp, frnd, mulberry } from './core.js';
import { curvAt, halfWAt, insideAt, wrapS } from './geometry.js';
import { untouchable } from './rules.js';
import { nearestS } from './race-mechanics.js';
import { G_SLOPE, elevAt } from './race-elevation.js';


export const WET_LOSS = 0.2;   // a fully wet road: this much less grip
export const DRY_MAX = 0.85;   // the dry line at its driest takes this much of the wet away
export const BIN = 80, LANES = 5, LEVELS = 40;   // the dry-line grid: a cell every BIN along the road, LANES across; LEVELS steps per cell
const PASS = 0.35;             // a kart driving the length of a cell dries this share of the water left there
const WASH = 0.01;             // full rain washes this much of the dry line back each second
const FADE = 0.08;             // and on a dry road it fades this fast (nothing to see)
const WET_T = 3, DRY_T = 12;   // the road wets this fast in the rain (time constant, s), and dries this fast after
const PUB = 2;                 // the dry line is republished every PUB seconds (~740 bytes in a snapshot)
export const AQ_V = 340;       // aquaplaning: faster than this into a full puddle (more for a shallow one, AQ_SHALLOW)
const AQ_SHALLOW = 90;
export const AQ_T = 0.55;      // how long the tyres float (flat out; less just over the speed)
const AQ_GRIP = 0.05;          // the grip left while they do
const AQ_YAW = 0.5;            // the tail stepping out meanwhile (rad/s, the nose toward the outside of the bend)
const AQ_DRAG = 90;            // and the water dragging at the kart (speed lost per second)
export const PUDDLE_W = 0.3;   // puddles form once the road is this wet, and are full at PUDDLE_W + 0.45
const r3 = x => Math.round(x * 1000) / 1000;
const ACC = new WeakMap();     // the dry line as the host's tyres make it, per race (published as race.dryQ)
export const dryAccOf = race => ACC.get(race);

export function buildRain(T) {
  const d = T.def.rain; if (!d) return null;
  const sc = T.def.scale || 1;
  const puddles = (d.puddles || []).map(([x, y, half]) => { const s = nearestS(T, x * sc, y * sc); return { s, s0: s - half * sc, s1: s + half * sc, x: x * sc, y: y * sc }; });
  return { nb: Math.ceil(T.L / BIN), puddles, first: d.first || [3, 12], spell: d.spell || [14, 26], gap: d.gap || [9, 20], wetStart: d.wetStart ?? 0.4 };
}

// ---------------------------------------------------------------- the weather
// how hard it's raining at t (0..1): eases in over 2 s, out over 3 s (look and sound; wetness takes it as on/off)
export function rainAt(L, t) {
  let r = 0;
  for (const [a, b, k] of L || []) if (t > a && t < b + 3) r = Math.max(r, k * clamp((t - a) / 2, 0, 1) * clamp((b + 3 - t) / 3, 0, 1));
  return r;
}
// how wet the road is at t (0..1), from the timetable alone so every screen agrees (cached per race and moment)
const wetCache = new WeakMap();
export function wetAt(race, t) {
  const L = race.rainT; if (!L || !L.length) return 0;
  const C = wetCache.get(race); if (C && C.t === t && C.L === L && C.n === L.length) return C.w;
  let w = 0, at = Math.min(0, L[0][0]);
  for (const [a, b, k] of L) {
    if (a >= t) break;
    if (a > at) { w *= Math.exp(-(a - at) / DRY_T); at = a; }
    const e = Math.min(b, t); if (e > at) { w = k + (w - k) * Math.exp(-(e - at) / (w < k ? WET_T : DRY_T)); at = e; }
  }
  if (t > at) w *= Math.exp(-(t - at) / DRY_T);
  wetCache.set(race, { t, L, n: L.length, w });
  return w;
}
// how deep the puddles are (0..1) on a road this wet
export const puddleDepth = w => clamp((w - PUDDLE_W) / 0.45, 0, 1);
// the speed that floats you in a puddle this deep
export const aqSpeed = dep => AQ_V + (1 - dep) * AQ_SHALLOW;

// extend the timetable (race.rng; a time trial's from the track, so every attempt has the same weather), cue each spell,
// and republish the dry line
export function rainUpdate(dt) {
  const R = this.track.mech.rain; if (!R) return;
  if (!this.rainT) {
    const rng = this.tt ? mulberry(this.track.L | 0) : this.rng;
    this.rainRng = this.tt ? rng : null;
    this.rainT = [];
    if (rng() < R.wetStart) { const len = R.spell[0] + rng() * (R.spell[1] - R.spell[0]); this.rainT.push([r3(-30), r3(len * (0.3 + 0.5 * rng())), r3(0.6 + 0.4 * rng())]); }   // it's been raining before the start
    else { const a = R.first[0] + rng() * (R.first[1] - R.first[0]); this.rainT.push([r3(a), r3(a + R.spell[0] + rng() * (R.spell[1] - R.spell[0])), r3(0.55 + 0.45 * rng())]); }
  }
  const L = this.rainT, rng = this.rainRng || this.rng;
  while (L[L.length - 1][1] < this.time + 30) {
    const a = L[L.length - 1][1] + R.gap[0] + rng() * (R.gap[1] - R.gap[0]);
    L.push([r3(a), r3(a + R.spell[0] + rng() * (R.spell[1] - R.spell[0])), r3(0.55 + 0.45 * rng())]);
  }
  if (!this.started) return;
  const n = L.filter(s => s[0] > 0 && s[0] <= this.time).length;   // a spell starting: thunder, and a sign on every screen
  if (n > (this.rainSeen || 0)) { this.rainSeen = n; this.cue('thunder'); if (this.humans.length) this.feed('warn', 'rain', null); }
  // every PUB s: rain washes some of the dry line back (or a dry road fades it), then publish
  let acc = ACC.get(this); if (!acc) ACC.set(this, acc = new Float32Array(R.nb * LANES));
  if (this.time < (this.dryAt || 0)) return;
  this.dryAt = this.time + PUB;
  const w = wetAt(this, this.time), r = rainAt(L, this.time), loss = PUB * (WASH * r + FADE * clamp(1 - w * 3, 0, 1));
  let out = '';
  for (let i = 0; i < acc.length; i++) { acc[i] = Math.max(0, acc[i] - loss); out += String.fromCharCode(48 + Math.round(acc[i] * (LEVELS - 1))); }
  this.dryQ = out;
}

// ---------------------------------------------------------------- the road under a kart
const laneOf = (T, s, lat) => { const hw = halfWAt(T, s); return clamp(Math.floor((lat + hw) / (2 * hw) * LANES), 0, LANES - 1); };
const cellOf = (T, s) => Math.min(Math.floor(wrapS(T, s) / BIN), T.mech.rain.nb - 1);
// how dry the line is at (s, lane) (0..1), from the published grid
export function dryAt(race, T, s, lane) {
  const Q = race.dryQ; if (!Q) return 0;
  const c = Q.charCodeAt(cellOf(T, s) * LANES + lane);
  return c >= 48 ? (c - 48) / (LEVELS - 1) : 0;
}
// how wet the road is under kart c (0..1): the wetness, less what the dry line has squeegeed off there
export function wetUnder(race, c) {
  const T = c.T; if (!T.mech || !T.mech.rain) return 0;
  const w = wetAt(race, race.time); if (w <= 0.003) return 0;
  return w * (1 - DRY_MAX * dryAt(race, T, c.s, laneOf(T, c.s, c.lat)));
}
// the kart's grip here, as a share of its own (race-mechanics.js mechGrip): the wet, or nothing at all aquaplaning
export function rainGrip(c) {
  const T = c.T; if (!T.mech.rain) return 1;
  if (c.aquaT > 0) return AQ_GRIP;
  return 1 - WET_LOSS * wetUnder(this, c);
}

// one kart, one frame: its tyres dry the cells they cover (host grid), and puddles
export function rainCar(c, dt, prevS) {
  const T = c.T, R = T.mech.rain; if (!R) return;
  if (c.aquaT > 0) { c.heading += c.aquaYaw * dt; c.speed = Math.max(0, c.speed - AQ_DRAG * dt); }   // floating: the tail steps out a little, the water drags
  if (c.aquaT > -1) c.aquaT -= dt;   // stops at -1 so snapshots stop carrying it
  c.puddleNear = false;
  if (!this.rainT) return;
  const w = wetAt(this, this.time);
  // drying: the lanes the kart's body covers, by how much of each it covers, for the distance it moved
  const acc = ACC.get(this);
  if (acc && w > 0.02 && c.air <= 0 && !c.off && this.started) {
    let ds = c.s - prevS; if (!T.open) { if (ds < -T.L / 2) ds += T.L; if (ds > T.L / 2) ds -= T.L; }
    if (ds > 0) {
      const hw = halfWAt(T, c.s), lw = 2 * hw / LANES, base = cellOf(T, c.s) * LANES, k = PASS * Math.min(1, ds / BIN);
      for (let j = 0; j < LANES; j++) {
        const a = -hw + j * lw, cover = Math.min(a + lw, c.lat + c.W / 2) - Math.max(a, c.lat - c.W / 2);
        if (cover > 0) { const i = base + j; acc[i] += k * Math.min(1, cover / lw) * (1 - acc[i]); }
      }
    }
  }
  // a puddle: too fast and you float. Bots keep boosts off one coming up (race-ai.js straightAhead)
  const dep = puddleDepth(w); if (dep <= 0 || c.finished) return;
  for (const P of R.puddles) {
    let d0 = P.s0 - c.s; if (!T.open && d0 < -T.L / 2) d0 += T.L;
    if (d0 > P.s0 - P.s1 && d0 < Math.max(c.speed, 150) * 3.2) c.puddleNear = true;   // (3.2 s: a Turbo runs well over top speed for a while)
    if (c.s < P.s0 || c.s > P.s1 || c.air > 0 || c.aquaT > -0.3 || untouchable(c) || Math.abs(c.lat) > halfWAt(T, c.s)) continue;
    const vq = aqSpeed(dep);
    if (c.speed > vq) {   // the further over, the longer and harder the slide
      const k = clamp(0.45 + (c.speed - vq) / 100, 0.45, 1);
      c.aquaT = AQ_T * k; c.aquaYaw = -(Math.sign(curvAt(T, c.s + 60)) || 1) * AQ_YAW * k; c.speed *= 1 - 0.08 * k;
      for (let k = 0; k < 10; k++) { const a = c.heading + Math.PI + frnd(-1.2, 1.2), v = frnd(60, 200); this.fxPuff(c.x + frnd(-14, 14), c.y + frnd(-14, 14), '#cfe8ff', frnd(6, 12), 0.5, Math.cos(a) * v, Math.sin(a) * v); }
      this.fxRing(c.x, c.y, '#9fd8ff', 50, 0.35, 4);
      this.sound('aquaplane', c, c.human ? 1 : 0.5);
      if (c.human) this.feed('haz', 'puddle', null, c);
    }
  }
}

// ---------------------------------------------------------------- bots
// Bots plan corners on the wet grip they expect on their line (a worse bot underestimates the wet, arrives hot); at a
// puddle they decide once a lap to lift under the floating speed (better bots more often) or skate it.
export function rainAI(c, skill, brake, plan) {
  const T = c.T, R = T.mech.rain; if (!R || !this.rainT) return;
  const w = wetAt(this, this.time); if (w <= 0.02) return;
  const aware = clamp(0.6 + (skill - 0.92) * 2.4, 0.55, 1), here = laneOf(T, c.s, c.lat);
  plan.grip = s => {
    const p = insideAt(T, s), lane = Math.abs(p) < 0.3 ? here : p > 0 ? LANES - 1 : 0;
    return 1 - WET_LOSS * aware * w * (1 - DRY_MAX * dryAt(this, T, s, lane));
  };
  const dep = puddleDepth(w); if (dep <= 0) return;
  const P0 = c.ai.pud || (c.ai.pud = {});
  R.puddles.forEach((P, k) => {
    let ds = P.s0 - c.s; if (!T.open && ds < -T.L / 2) ds += T.L; if (ds < P.s0 - P.s1 || ds > 900) return;   // (and all the way through it)
    const key = c.lap * 8 + k;
    if (P0[key] === undefined) P0[key] = c.rng() < clamp(0.5 + (skill - 0.92) * 3, 0.4, 0.97);
    // margin for throttle on/off, and for a downhill run into the dip
    if (P0[key]) plan.caps.push({ ds: Math.max(0, ds - 60), v: Math.sqrt(Math.max(0, Math.pow(aqSpeed(dep) * 0.92, 2) + 2 * G_SLOPE * (elevAt(T, P.s0) - elevAt(T, c.s)))) });
  });
}
// the race clock's rain, for the drawing (art/neon.js): how hard it's raining and how wet the road is now
export const weatherNow = race => ({ rain: rainAt(race.rainT, race.time), wet: wetAt(race, race.time) });
