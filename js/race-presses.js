// Kernel Kart: stamping presses. A row of hydraulic presses across the road, each slamming down on its own beat. Under
// one when it lands and you're flattened: stopped dead and left to crawl out. They're timed as a green wave: hold the
// right speed and you pass every one in its gap; flat out you'll beat the first and meet the next one coming down.
// So it's all throttle: floor it and gamble, or lift and ride the wave.
import { trackSample } from './geometry.js';
import { blockedByShield, untouchable } from './rules.js';
import { nearestS } from './race-mechanics.js';


export function buildPresses(T) {
  const sc = T.def.scale, out = [];
  for (const P of T.def.presses || []) {
    const ss = P.at.map(p => nearestS(T, p[0] * sc, p[1] * sc));
    // each press is offset by the time a kart at the wave speed takes to get to it from the first
    ss.forEach((s, i) => out.push({ s, len: (P.len || 80) * sc, period: P.period || 2.4, phase: (P.phase || 0) - (s - ss[0]) / (P.wave || 300), first: i === 0, wave: P.wave || 300, q: trackSample(T, s) }));
  }
  return out;
}
// the press head's height at race time t: 1 is up, 0 is slammed down on the road
export const FALL = 0.24, DOWN = 0.45, RISE = 0.55, LOW = 0.3;   // below LOW it flattens a kart
export function pressHeight(p, t) {
  const u = ((t + p.phase) % p.period + p.period) % p.period;
  if (u < FALL) return 1 - (u / FALL) ** 2;
  if (u < FALL + DOWN) return 0;
  if (u < FALL + DOWN + RISE) return (u - FALL - DOWN) / RISE;
  return 1;
}
const D0 = FALL * Math.sqrt(1 - LOW), D1 = FALL + DOWN + RISE * LOW;   // the part of each cycle it's low enough to hurt

export function pressCar(c, dt) {
  if (!this.calm) for (const p of c.T.mech.presses) {   // (calm, a time trial: they're parked up, draw-mechanics.js)
    const ds = c.s - p.s;
    if (p.first && c.human && ds < -300 && ds > -900 && c.pressWarn !== c.lap) { c.pressWarn = c.lap; this.feed('warn', 'press', c); }
    if (Math.abs(ds) > p.len / 2 + c.L * 0.4 || c.air > 0 || c.finished || untouchable(c) || (c.pressCd || 0) > this.time) continue;
    if (pressHeight(p, this.time) >= LOW) continue;
    c.pressCd = this.time + 1.4; c.hitCd = Math.max(c.hitCd, 1);
    this.fxSparks(c.x, c.y, 12, '#ffcc66', 220);
    if (blockedByShield(this, c, 'firewall vs the press')) { c.speed *= 0.5; continue; }
    // squashed out of whichever side of the head you were mostly on, stopped dead and dazed for a moment
    const out = ds < 0 ? -1 : 1, s = p.s + out * (p.len / 2 + c.L / 2 + 30), q = trackSample(c.T, s);   // clear of it even after the dazed crawl
    c.s = s; c.x = q.x + q.nx * c.lat; c.y = q.y + q.ny * c.lat; c.prevLat = c.lat; c.progress = this.progressOf(c);
    c.speed = 0; c.skx = c.sky = 0; c.stall = 0.7; c.squash = 1; c.flatT = 1.1;
    this.fxHit(c, '#ffb300', 'stamp');
  }
  if (c.flatT > 0) { c.flatT -= dt; c.squash = Math.max(c.squash, 0.9); }   // stays pancaked for a moment
}

// is press p down at any moment between t0 and t1?
function pressBlocks(p, t0, t1) {
  const P = p.period, k0 = Math.floor((t0 + p.phase - D1) / P), k1 = Math.ceil((t1 + p.phase - D0) / P);
  for (let k = k0; k <= k1; k++) { const a = k * P - p.phase + D0, b = k * P - p.phase + D1; if (a < t1 && b > t0) return true; }
  return false;
}
// would a bot get through every press ahead clean if it heads for speed v1 until it's past the first, then v2?
// (m: how much room it leaves either side, in seconds). Stopping (v1 = 0) is clean as long as it stops short.
function runClear(c, near, v1, v2, m, brake, now) {
  const h = 0.04, half = p => p.len / 2 + c.L / 2, inT = near.map(() => null);
  let s = c.s, v = c.speed, t = now, k = 0;
  for (let n = 0; n < 150 && k < near.length; n++) {
    const tgt = s < near[0].s + half(near[0]) ? v1 : v2;
    v = v < tgt ? Math.min(tgt, v + c.acc * h) : Math.max(tgt, v - brake * h);
    s += v * h; t += h;
    while (k < near.length && inT[k] === null && s >= near[k].s - half(near[k])) inT[k] = t;
    while (k < near.length && s >= near[k].s + half(near[k])) { if (pressBlocks(near[k], (inT[k] ?? now) - m, t + m)) return false; k++; }
    if (v < 1 && tgt < 1) break;
  }
  return k >= near.length || inT[k] === null || !pressBlocks(near[k], inT[k] - m, t + 1);   // stopped: fine unless it's under one
}
// the fastest speed (up to what the corners allow) that gets through every press ahead clean: either holding it all
// the way, or using it to time the first press and then riding the green wave
export function pressAI(c, skill, brake, allowed) {
  if (this.calm) return allowed;
  const near = c.T.mech.presses.filter(p => { const ds = p.s - c.s; return ds > -p.len / 2 - c.L && ds < 1300; });
  if (!near.length) return allowed;
  const m = 0.05 + (1.1 - skill) * 0.6, top = Math.min(allowed, c.top * 1.1), wave = Math.min(top, near[0].wave);
  for (let v = top; v > -12; v -= 12) {
    const v1 = Math.max(v, 0);
    if (runClear(c, near, v1, top, m, brake, this.time) || runClear(c, near, v1, wave, m, brake, this.time)) return Math.min(allowed, v1);
  }
  return allowed;   // nothing gets through clean from here: go for it
}
