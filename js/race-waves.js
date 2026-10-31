// Kernel Kart: waves. Now and then a breaker rolls off the sea across a stretch of road: foam builds on the sea-side
// edge (the warning), then the crest sweeps across, shoving karts toward land and slowing them. Lift and let it break,
// or floor it through. Timing from race.rng; per-race state on race.wav (T.mech is shared).
import { clamp, lerp } from './core.js';
import { halfWAt, trackSample } from './geometry.js';
import { blockedByShield, untouchable } from './rules.js';
import { eta, nearestS } from './race-mechanics.js';

export const WAVE_WARN = 2.2, WAVE_SWEEP = 1.4;   // the foam builds for WARN s, then the breaker crosses the road in SWEEP s
const PUSH = 420, SLOW = 0.78, OVER = 70;          // the shove (sideways speed), what's left of your speed, how far past each edge it runs

export function buildWaves(T) {
  const sc = T.def.scale, B = T.bbox, cx = B.x + B.w / 2, cy = B.y + B.h / 2;
  return (T.def.waves || []).map((d, i) => {
    const s = nearestS(T, d.at[0] * sc, d.at[1] * sc), p = trackSample(T, s);
    const side = d.side || Math.sign((p.x - cx) * p.nx + (p.y - cy) * p.ny) || 1;   // the sea: the side away from the track's middle
    return { i, s, len: (d.len || 420) * sc, side, every: d.every || [7, 12], first: d.first || [3, 7] };
  });
}
const along = (T, s, s0) => { let d = s - s0; if (d > T.L / 2) d -= T.L; if (d < -T.L / 2) d += T.L; return d; };
// where a wave is at race time t: null when it's calm, else { warn: 0..1 } building, or { front: lat } breaking across
export function waveState(w, st, t, T) {
  if (!st || st.t0 === null) return null;
  const u = t - st.t0; if (u < 0 || u > WAVE_WARN + WAVE_SWEEP) return null;
  if (u < WAVE_WARN) return { warn: u / WAVE_WARN };
  const hw = halfWAt(T, w.s) + OVER, f = (u - WAVE_WARN) / WAVE_SWEEP;
  return { f, front: w.side * hw * (1 - 2 * f) };
}

// once a frame: start the next set when it's due
export function wavesUpdate() {
  const list = this.track.mech.waves; if (!list.length || !this.started || this.calm) return;   // calm / time trial: flat sea, race.wav unset
  const rng = this.rng;
  const W = this.wav || (this.wav = list.map(w => ({ next: this.time + lerp(w.first[0], w.first[1], rng()), t0: null, n: 0 })));
  list.forEach((w, i) => {
    const st = W[i];
    if (this.time >= st.next) {
      st.t0 = this.time; st.n++; st.next = this.time + WAVE_WARN + WAVE_SWEEP + lerp(w.every[0], w.every[1], rng());
      const p = trackSample(this.track, w.s); this.sound('waveIn', { x: p.x + p.nx * w.side * 200, y: p.y + p.ny * w.side * 200 }, 0.8);
    }
  });
}

// a kart the breaker reaches: shoved toward land, slowed (once per wave)
export function wavesCar(c, dt) {
  if (!this.wav || c.T !== this.track || c.finished || c.air > 0 || untouchable(c)) return;
  const T = c.T;
  T.mech.waves.forEach((w, i) => {
    const st = this.wav[i], now = waveState(w, st, this.time, T); if (!now || now.front === undefined) return;
    if (Math.abs(along(T, c.s, w.s)) > w.len / 2 + c.L / 2 || c.waveHit === i * 1e4 + st.n) return;
    const was = waveState(w, st, this.time - dt, T), f0 = was && was.front !== undefined ? was.front : w.side * (halfWAt(T, w.s) + OVER);
    const lo = Math.min(f0, now.front) - c.W / 2, hi = Math.max(f0, now.front) + c.W / 2;   // the crest crossed the kart this frame
    if (c.lat < lo || c.lat > hi) return;
    c.waveHit = i * 1e4 + st.n;
    if (blockedByShield(this, c)) return;
    const p = trackSample(T, c.s);
    c.skx -= p.nx * w.side * PUSH; c.sky -= p.ny * w.side * PUSH; c.speed *= SLOW; c.hitCd = Math.max(c.hitCd, 0.6);
    this.fxHit(c, '#e0f7ff', 'wave');
  });
}

// a bot and a foaming wave ahead: through before it breaks, or arrive after (one not yet building gives no warning)
export function wavesAI(c, skill, brake, plan) {
  if (!this.wav || c.T !== this.track) return;
  const T = c.T;
  T.mech.waves.forEach((w, i) => {
    const st = this.wav[i]; if (st.t0 === null) return;
    const tS = st.t0 + WAVE_WARN - this.time, tE = tS + WAVE_SWEEP; if (tE < 0) return;
    const ds = along(T, w.s, c.s), dIn = ds - w.len / 2 - c.L / 2, dOut = ds + w.len / 2 + c.L / 2;
    if (dOut < 0 || dIn > 1400) return;
    const m = 0.12 + (1.1 - skill) * 0.5;
    if (dIn <= 0) return;                                        // already in it: keep going
    if (eta(c, dOut, skill) < tS - m) return;                    // through before it breaks
    if (eta(c, dIn, skill) > tE + m) return;                     // there after it's gone anyway
    plan.caps.push({ ds: 0, v: Math.max(30, dIn / (tE + m) * 0.95) });
  });
}
