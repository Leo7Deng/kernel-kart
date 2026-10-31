// Kernel Kart: the boulder run. A stone serpent idol over a long straight drops boulders at irregular times (eyes glow
// WARN s first); each rolls down the run faster than any kart, flattens anyone it catches, fills the road (no passing),
// and goes straight on into the gorge at the hairpin. The call: get through well ahead, or let it go first and follow.
// Release times come from race.rng; boulder positions are a pure function of time since release (nothing kept per frame).
import { Math } from './detmath.js';   // deterministic maths, the same on every computer (detmath.js)
import { LIFT_DECEL, clamp } from './core.js';
import { trackSample, vmaxAt, wrapS } from './geometry.js';
import { blockedByShield, untouchable } from './rules.js';
import { nearestS } from './race-mechanics.js';


export const WARN = 2.2;   // how long the idol's eyes glow before it lets a boulder go
// the path every boulder takes: from the jaws down the road's centre to the hairpin, then straight on to the gorge,
// sampled every few units with the distance along it
export function buildBoulders(T) {
  const sc = T.def.scale;
  return (T.def.boulders || []).map(d => {
    const s0 = nearestS(T, d.from[0] * sc, d.from[1] * sc), s1 = nearestS(T, d.to[0] * sc, d.to[1] * sc);
    const A = trackSample(T, s0), R = (d.r || 30) * sc;
    const head = { x: A.x, y: A.y, a: Math.atan2(A.ty, A.tx), r: A.hw + 40 };   // the idol straddles the road
    const P = [], push = (x, y) => { const l = P.length ? P[P.length - 1] : null; P.push({ x, y, d: l ? l.d + Math.hypot(x - l.x, y - l.y) : 0 }); };
    for (let s = s0; s <= s1; s += 6) { const q = trackSample(T, s); push(q.x, q.y); }
    const B = trackSample(T, s1), dRoad0 = 0, dRoad1 = P[P.length - 1].d;
    const gorge = { x: d.gorge[0] * sc, y: d.gorge[1] * sc, r: d.gorge[2] * sc };
    const fly = Math.max(60, (gorge.x - B.x) * B.tx + (gorge.y - B.y) * B.ty);   // straight on until it's over the middle of the gorge
    for (let f = 8; f <= fly; f += 8) push(B.x + B.tx * f, B.y + B.ty * f);
    // rolls out at v0, gathers speed at acc, up to vMax
    const v0 = d.v0 || 110, acc = d.acc || 150, vMax = d.vMax || 560;
    // widen the bbox (camera, ground) to take in the gorge and the idol
    const Bx = T.bbox, e = 40, x0 = Math.min(Bx.x, gorge.x - gorge.r - e), y0 = Math.min(Bx.y, gorge.y - gorge.r - e, head.y - head.r * 1.6);
    Object.assign(Bx, { x: x0, y: y0, w: Math.max(Bx.x + Bx.w, gorge.x + gorge.r + e) - x0, h: Math.max(Bx.y + Bx.h, gorge.y + gorge.r + e) - y0 });
    return { s0, s1, head, R, P, dRoad0, dRoad1, dEnd: P[P.length - 1].d, gorge, v0, acc, vMax, every: d.every || [6, 10], tCap: (vMax - v0) / acc };
  });
}
// how far a boulder has rolled a seconds after it was let go, and how fast it's going
export function rolled(z, a) {
  if (a <= z.tCap) return { d: z.v0 * a + z.acc * a * a / 2, v: z.v0 + z.acc * a };
  return { d: z.v0 * z.tCap + z.acc * z.tCap * z.tCap / 2 + z.vMax * (a - z.tCap), v: z.vMax };
}
// how long after it was let go a boulder reaches distance d along its path
export function rollTime(z, d) {
  const dCap = z.v0 * z.tCap + z.acc * z.tCap * z.tCap / 2;
  return d <= dCap ? (-z.v0 + Math.sqrt(z.v0 * z.v0 + 2 * z.acc * d)) / z.acc : z.tCap + (d - dCap) / z.vMax;
}
export const rollEnd = z => rollTime(z, z.dEnd);   // when it drops into the gorge

// the release timetable, one list per idol, from race.rng: kept AHEAD s ahead and trimmed KEEP s behind so the online
// snapshot stays short
const AHEAD = 40, KEEP = 20;
export function boulderTimes(race) {
  if (race.rocks) return race.rocks;
  if (race.calm) return (race.rocks = race.track.mech.boulders.map(() => []));   // calm / time trial: no boulders
  return (race.rocks = race.track.mech.boulders.map(z => [race.time + 3 + race.rng() * z.every[0]]));
}
export function boulderUpdate(dt) {
  if (!this.track.mech.boulders.length || !this.started || this.calm) return;
  const SS = boulderTimes(this), t1 = this.time, t0 = t1 - dt, past = x => x > t0 && x <= t1;
  this.track.mech.boulders.forEach((z, i) => {
    const S = SS[i], [lo, hi] = z.every;
    while (S[S.length - 1] < this.time + AHEAD) S.push(S[S.length - 1] + lo + this.rng() * (hi - lo));
    while (S.length > 2 && S[1] < this.time - KEEP) S.shift();
    // sounds: eyes lighting, the drop, the splash in the gorge
    for (const r of S) {
      if (past(r - WARN)) this.sound('idolWake', z.head, 0.9);
      if (past(r)) { this.sound('rockOut', z.head); }
      if (past(r + rollEnd(z))) this.sound('rockSplash', z.gorge);
    }
  });
}
// where a point is along the path at distance d: position and the way it's rolling
function along(z, d) {
  const P = z.P; let a = 0, b = P.length - 1;
  if (d <= 0) return { x: P[0].x, y: P[0].y, ux: P[1].x - P[0].x, uy: P[1].y - P[0].y };
  while (b - a > 1) { const m = (a + b) >> 1; if (P[m].d <= d) a = m; else b = m; }
  const p = P[a], q = P[b], f = clamp((d - p.d) / ((q.d - p.d) || 1), 0, 1), l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, ux: (q.x - p.x) / l, uy: (q.y - p.y) / l };
}
// every boulder of idol z at race time t: { x, y, ux, uy, v, d, a (s since release), s (lap position while on the road, else null) }
export function boulders(z, S, t) {
  const out = []; if (!S) return out;
  const life = rollEnd(z);
  for (const r of S) {
    const a = t - r; if (a > life) continue; if (a < 0) break;
    const k = rolled(z, a), p = along(z, k.d);
    out.push({ ...p, v: k.v, d: k.d, a, s: k.d >= z.dRoad0 && k.d <= z.dRoad1 ? z.s0 + (k.d - z.dRoad0) : null });
  }
  return out;
}
export function nextRelease(S, t) { if (!S) return Infinity; for (const r of S) if (r >= t) return r; return Infinity; }

// one car: flattened by a boulder that runs into it, held back by one it runs into from behind
export function boulderCar(c, dt) {
  const T = c.T; if (!T.mech.boulders.length) return;
  if (c.flatT > 0) { c.flatT -= dt; c.squash = Math.max(c.squash, 0.9); if (c.flatT > 0.4) c.speed = c.skx = c.sky = 0; }   // pancaked, then crawling off
  const SS = boulderTimes(this);
  T.mech.boulders.forEach((z, i) => {
    const S = SS[i], ds = wrapS(T, z.s0 - c.s);
    if (c.human && ds > 300 && ds < 1300 && c.rockWarn !== c.lap) {
      const tIn = ds / Math.max(c.speed, 200), r = nextRelease(S, this.time - 0.6);
      if (r < this.time + tIn + 1.5) { c.rockWarn = c.lap; this.feed('warn', 'boulder', c); }
    }
    if (c.air > 0 || c.finished || untouchable(c) || (c.rockCd || 0) > this.time) return;
    for (const b of boulders(z, S, this.time)) {
      const dx = c.x - b.x, dy = c.y - b.y;
      if (dx * dx + dy * dy > Math.pow(z.R + c.L, 2)) continue;
      // circle vs the kart's oriented box
      const ch = Math.cos(c.heading), sh = Math.sin(c.heading), lx = -dx * ch - dy * sh, ly = dx * sh - dy * ch;
      const px = clamp(lx, -c.L / 2, c.L / 2), py = clamp(ly, -c.W / 2, c.W / 2);
      if (Math.pow(lx - px, 2) + Math.pow(ly - py, 2) > z.R * z.R) continue;
      const ahead = dx * b.ux + dy * b.uy;
      if (ahead < -z.R * 0.3) {   // behind it: held at its pace
        const back = -(z.R + c.L * 0.5 + 2) - ahead;
        c.x += b.ux * back; c.y += b.uy * back; c.speed = Math.min(c.speed, b.v * 0.92);
        const vo = c.skx * b.ux + c.sky * b.uy; if (vo > 0) { c.skx -= b.ux * vo; c.sky -= b.uy * vo; }
        if (this.time - (c.rockBump || -9) > 0.6) { c.rockBump = this.time; c.squash = Math.max(c.squash, 0.4); this.fxSparks(c.x + b.ux * c.L * 0.5, c.y + b.uy * c.L * 0.5, 5, '#d7ccc8', 110); this.sound('bump', c, 0.6); }
        continue;
      }
      // it rolls over us
      c.rockCd = this.time + 1.5; c.hitCd = Math.max(c.hitCd, 1);
      if (blockedByShield(this, c)) { c.speed *= 0.6; c.skx += b.ux * 160; c.sky += b.uy * 160; return; }
      c.speed = 0; c.skx = c.sky = 0; c.stall = 1.8; c.squash = 1; c.flatT = 2.0;
      this.fxHit(c, '#8d7b68', 'boulder');
      return;
    }
  });
}

// For the bots a boulder is a position along the road from the release point down.
export const roadPos = (z, d) => z.s0 + d - z.dRoad0;
const PRE = 200;   // how far before the release point a kart can be caught by one rolling out
// the times a bot would reach points down the run (every `step` from PRE before the release point) driving normally
function runTimes(c, z, skill, step) {
  const T = c.T, h = 0.04, out = [];
  let s = 0, v = Math.max(c.speed, 30), t = 0, k = 0;
  const ds0 = wrapS(T, z.s0 - c.s) - PRE, end = ds0 + PRE + (z.s1 - z.s0) + 60;
  while (s < end && t < 14) {
    const b = LIFT_DECEL(v) * 0.9; let lim = c.top;
    for (let d = 0; d < 360; d += 24) { const vm = vmaxAt(T, c.s + s + d, c.grip) * skill; lim = Math.min(lim, Math.sqrt(vm * vm + 2 * b * d)); }
    v = v < lim ? Math.min(lim, v + c.acc * h) : Math.max(lim, v - b * h);
    s += v * h; t += h;
    while (s >= ds0 + k * step && ds0 + k * step <= end) { out.push(ds0 + k * step >= 0 ? t - (s - ds0 - k * step) / Math.max(v, 1) : 0); k++; }
  }
  return out;
}
// bots: follow a boulder ahead at its pace (a gap behind); approaching the idol, if the next one would catch us before
// the hairpin, wait at a line short of the jaws until it's out and a kart's length down the road
export function boulderAI(c, skill, brake, plan) {
  const T = c.T; if (!T.mech.boulders.length) return;
  const SS = boulderTimes(this);
  T.mech.boulders.forEach((z, i) => {
    const S = SS[i], gap = 14 + (1.1 - skill) * 40;
    for (const b of boulders(z, S, this.time)) {
      if (b.d > z.dRoad1) continue;   // off the road and away into the gorge
      const ahead = wrapS(T, roadPos(z, b.d) - c.s); if (ahead > 900) continue;
      plan.caps.push({ ds: Math.max(0, ahead - z.R - c.L * 0.5 - gap), v: b.v }); c.ai.rockT = this.time;
    }
    const ds = wrapS(T, z.s0 - c.s), hold = z.R + c.L * 0.5 + 30;   // the line to wait at, short of where it drops
    if (ds > 1500) return;
    const margin = 0.12 + (1.1 - skill) * 0.8, step = 50, R0 = this.time;
    let tk = null;
    for (const r of S) {
      if (r < R0) continue; if (r > R0 + 12) break;   // (one already out is handled by the caps above)
      tk = tk || runTimes(c, z, skill, step);
      if (!tk.length) break;
      // in its way if, anywhere from before the idol to the hairpin, we'd be on a spot while it rolls over it (± margin);
      // arriving after it has passed is fine (following)
      let hit = false;
      const reach = z.R + c.L * 0.5;
      for (let k = 0; k < tk.length && !hit; k++) {
        const x = z.dRoad0 - PRE + k * step, tK = R0 + tk[k];   // our spot, as a distance along its path
        if (x + reach < 0) continue;
        if (tK > r + rollTime(z, Math.max(0, x - reach)) - margin && tK < r + rollTime(z, x + reach + gap) + 0.1) hit = true;
      }
      if (!hit) break;   // clear (later ones are later still)
      // wait: arrive at the release point just as it's a kart's length down the road (a long wait is a stop at the line)
      const tGo = r + rollTime(z, z.dRoad0 + z.R + c.L) + margin * 0.5 - R0;
      const v = ds > hold ? hold / Math.max(tGo - (ds - hold) / Math.max(c.speed, 60), 0.05) : ds / Math.max(tGo, 0.05);
      plan.caps.push({ ds: Math.max(0, ds - hold), v: Math.min(c.top, v) }); c.ai.rockT = this.time;
      break;
    }
  });
}
// a bot keeps its boost while waiting for or following a boulder, or with one about to drop ahead
export function rockShy(race, c) {
  if (c.ai.rockT > race.time - 0.3) return true;
  const M = c.T.mech; if (!M || !M.boulders.length) return false;
  const SS = boulderTimes(race);
  return M.boulders.some((z, i) => { const ds = wrapS(c.T, z.s0 - c.s); return ds < c.top * 3 && nextRelease(SS[i], race.time) < race.time + ds / c.top + 3; });
}
