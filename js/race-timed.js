// Kernel Kart: timed obstacles (Moonshot), each a pure function of the race clock (no state: replays, online):
//   - `cross`: a vehicle shuttling across the road, waiting at each end. Into it: shoved along its way, nearly stopped.
//   - `arms`: gantry arms swinging across the road one after another (a green wave at one speed). Hit: knocked aside.
//   - `blast`: an engine test firing (igniters spark first) blowing across the road: slowed hard and shoved sideways.
//   - `doors`: airlock doors sliding shut from both edges on a beat. Caught: stopped dead behind them.
// Bots (timedAI) simulate candidate runs (hold a speed, flat out, stop short) and take the soonest clean one.
import { Math } from './detmath.js';   // deterministic maths, the same on every computer (detmath.js)
import { clamp, lerp } from './core.js';
import { trackSample, vmaxAt } from './geometry.js';
import { blockedByShield, untouchable } from './rules.js';
import { nearestS } from './race-mechanics.js';

export const BLAST_DRAG = 3.4, BLAST_PUSH = 460;   // in a full blast: speed lost (a share, per second), shoved sideways (u/s²)
const ARM_SWING = 0.45, ARM_W = 11;    // an arm's swing out (or back), its half-thickness
const DOOR_MOVE = 0.45, DOOR_D = 10;   // a door's slide shut (or open), its half-depth
const CD = 1.3;                        // one knock per pass

// timed: [{ kind, ... }] (layout units): built once per track
export function buildTimed(T) {
  const sc = T.def.scale, S = p => nearestS(T, p[0] * sc, p[1] * sc);
  return (T.def.timed || []).map((d, i) => {
    const o = { i, kind: d.kind, period: d.period, phase: d.phase || 0, look: d.look || d.kind };
    if (d.kind === 'cross') {
      const s = S(d.at), q = trackSample(T, s), a = (d.a ?? 90) * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), hw = q.hw;
      const sinA = Math.max(0.3, Math.abs(ux * q.ty - uy * q.tx));
      Object.assign(o, { s, x: q.x, y: q.y, ux, uy, len: d.len * sc, w: d.w * sc, v: d.v * sc, wait: d.wait, side: d.side || 1 });
      o.reach = hw / sinA + o.len + 40;   // parked at the end of its track it's clear of the road
      o.run = 2 * o.reach / o.v; o.period = 2 * (o.wait + o.run);
      o.s0 = s - hw - o.w - 60; o.s1 = s + hw + o.w + 60;
    } else if (d.kind === 'arms') {
      const s0 = S(d.at), n = d.n || 3, gap = d.gap * sc, side = d.side || 1;
      o.arms = []; for (let k = 0; k < n; k++) { const s = s0 + k * gap, q = trackSample(T, s), lat = side * (q.hw + 14); o.arms.push({ k, s, x: q.x + q.nx * lat, y: q.y + q.ny * lat, tx: q.tx, ty: q.ty, nx: -side * q.nx, ny: -side * q.ny }); }
      Object.assign(o, { s: s0, side, len: d.len * sc, lag: d.lag, out: d.out, s0: s0 - d.len * sc - 30, s1: s0 + (n - 1) * gap + 40 });
    } else if (d.kind === 'blast') {
      const s = S(d.at), q = trackSample(T, s);
      Object.assign(o, { s, x: q.x, y: q.y, nx: q.nx, ny: q.ny, side: d.side || 1, w: d.w * sc, warn: d.warn, fire: d.fire, s0: s - d.w * sc - 40, s1: s + d.w * sc + 40 });
    } else if (d.kind === 'doors') {
      o.doors = d.at.map((p, k) => { const s = S(p), q = trackSample(T, s); return { k, s, x: q.x, y: q.y, tx: q.tx, ty: q.ty, nx: q.nx, ny: q.ny, hw: q.hw }; });
      Object.assign(o, { s: o.doors[0].s, lag: d.lag, open: d.open, s0: o.doors[0].s - 60, s1: o.doors[o.doors.length - 1].s + 60 });
    }
    return o;
  });
}

const cyc = (o, t) => (((t + o.phase) % o.period) + o.period) % o.period;
// a crossing vehicle at time t: where along its track it is from the road's middle (d), and which way it's going (dir: 0 parked)
export function crossAt(o, t) {
  const u = cyc(o, t), W = o.wait, R = o.run;
  if (u < W) return { d: -o.reach, dir: 0 };
  if (u < W + R) return { d: -o.reach + 2 * o.reach * (u - W) / R, dir: 1 };
  if (u < 2 * W + R) return { d: o.reach, dir: 0 };
  return { d: o.reach - 2 * o.reach * (u - 2 * W - R) / R, dir: -1 };
}
// gantry arm k at time t: how far out it's swung (0 parked along the tower, 1 right across the road)
export function armAt(o, k, t) {
  const u = (((t + o.phase - k * o.lag) % o.period) + o.period) % o.period, [a, b] = o.out;   // out: when it starts swinging out, and back
  const e = x => x * x * (3 - 2 * x);
  if (u < a) return 0;
  if (u < a + ARM_SWING) return e((u - a) / ARM_SWING);
  if (u < b) return 1;
  if (u < b + ARM_SWING) return 1 - e((u - b) / ARM_SWING);
  return 0;
}
// the arm's line: from its pivot, swung from pointing back along the road (parked) to straight across it
export const armDir = (A, f) => { const th = f * Math.PI / 2; return [-A.tx * Math.cos(th) + A.nx * Math.sin(th), -A.ty * Math.cos(th) + A.ny * Math.sin(th)]; };
// the test firing at time t: 0 out, 1 full blast; warm: the igniters sparking before it lights (0..1)
export function blastAt(o, t) {
  const u = cyc(o, t), f0 = o.warn, f1 = o.warn + o.fire;
  if (u < f0 || u > f1 + 0.35) return 0;
  if (u < f0 + 0.2) return (u - f0) / 0.2;
  if (u < f1) return 1;
  return 1 - (u - f1) / 0.35;
}
export const blastWarm = (o, t) => { const u = cyc(o, t); return u < o.warn && u > o.warn - 1.4 ? (u - (o.warn - 1.4)) / 1.4 : 0; };
// door k at time t: how open it is (1 wide open, 0 shut: two leaves slide in from the road's edges to its middle)
export function doorAt(o, k, t) {
  const u = (((t + o.phase - k * o.lag) % o.period) + o.period) % o.period, a = o.open * o.period;
  if (u < a) return 1;
  if (u < a + DOOR_MOVE) return 1 - (u - a) / DOOR_MOVE;
  if (u < o.period - DOOR_MOVE) return 0;
  return (u - (o.period - DOOR_MOVE)) / DOOR_MOVE;
}

// distance between segments ab and cd (for an arm against a kart)
function segDist(ax, ay, bx, by, cx, cy, dx, dy) {
  const ux = bx - ax, uy = by - ay, vx = dx - cx, vy = dy - cy, wx = ax - cx, wy = ay - cy;
  const a = ux * ux + uy * uy, b = ux * vx + uy * vy, c = vx * vx + vy * vy, d = ux * wx + uy * wy, e = vx * wx + vy * wy, D = a * c - b * b;
  let sN, sD = D, tN, tD = D;
  if (D < 1e-9) { sN = 0; sD = 1; tN = e; tD = c; } else { sN = b * e - c * d; tN = a * e - b * d; if (sN < 0) { sN = 0; tN = e; tD = c; } else if (sN > sD) { sN = sD; tN = e + b; tD = c; } }
  if (tN < 0) { tN = 0; sN = clamp(-d, 0, a); sD = a; } else if (tN > tD) { tN = tD; sN = clamp(b - d, 0, a); sD = a; }
  const sc = Math.abs(sN) < 1e-9 ? 0 : sN / sD, tc = Math.abs(tN) < 1e-9 ? 0 : tN / tD;
  return Math.hypot(wx + sc * ux - tc * vx, wy + sc * uy - tc * vy);
}
// is a kart (centre x, y, heading h, half-length hl, half-width hw2) touching a crossing vehicle at time t (with margin m)?
function crossHits(o, t, x, y, h, hl, hw2, m) {
  const P = crossAt(o, t), cx = o.x + o.ux * P.d, cy = o.y + o.uy * P.d, rx = x - cx, ry = y - cy;
  const a = rx * o.ux + ry * o.uy, b = -rx * o.uy + ry * o.ux, ch = Math.cos(h), sh = Math.sin(h);
  const cu = Math.abs(ch * o.ux + sh * o.uy), cp = Math.abs(-ch * o.uy + sh * o.ux);
  return Math.abs(a) < o.len + cu * hl + cp * hw2 + m && Math.abs(b) < o.w + cp * hl + cu * hw2 + m ? P : null;
}
// is an arm over a kart at (x, y, heading h) at time t?
function armHits(o, t, x, y, h, hl, hw2, m) {
  const ch = Math.cos(h), sh = Math.sin(h), k0 = Math.max(0, hl - hw2);
  for (const A of o.arms) {
    if (Math.hypot(x - A.x, y - A.y) > o.len + hl + 20) continue;
    const f = armAt(o, A.k, t); if (f <= 0.02) continue;
    const [dx, dy] = armDir(A, f);
    if (segDist(A.x, A.y, A.x + dx * o.len, A.y + dy * o.len, x - ch * k0, y - sh * k0, x + ch * k0, y + sh * k0) < ARM_W + hw2 + m) return A;
  }
  return null;
}
// a door shut across a kart at s, lat (its half-width hw2) at time t?
function doorHits(o, t, s, lat, hl, hw2, m) {
  for (const D of o.doors) { if (Math.abs(s - D.s) > hl + DOOR_D + m) continue; if (Math.abs(lat) + hw2 + m > doorAt(o, D.k, t) * D.hw) return D; }
  return null;
}

// one car, one frame: knocked, stopped or blown about, and the warnings
export function timedCar(c, dt) {
  const L = c.T.mech.timed; if (!L || !L.length) return;
  c.blastF = 0; if (this.calm) return;   // calm / time trial: all parked (art/timed.js)
  const now = this.time;
  for (const o of L) {
    const ds = o.s - c.s;
    if (c.human && ds > 350 && ds < 1100 && c.tmWarn !== o.i) { c.tmWarn = o.i; this.feed('warn', o.kind === 'blast' ? 'fire' : o.kind === 'cross' ? (o.look === 'rover' ? 'gc' : 'train') : 'gate', c); }
    if (c.s < o.s0 - c.L || c.s > o.s1 + c.L || c.air > 0 || c.finished || untouchable(c)) continue;
    if (o.kind === 'blast') {
      if (Math.abs(c.s - o.s) > o.w + c.L * 0.4) continue;
      const f = blastAt(o, now); if (f <= 0) continue;
      c.blastF = f;
      c.speed *= Math.exp(-BLAST_DRAG * f * dt);
      const q = trackSample(c.T, c.s); c.skx -= q.nx * o.side * BLAST_PUSH * f * dt; c.sky -= q.ny * o.side * BLAST_PUSH * f * dt;
      if ((c.blastFx = (c.blastFx || 0) - dt) <= 0) { c.blastFx = 0.06; this.fxPuff(c.x, c.y, '#fff1d0', 12, 0.4, -q.nx * o.side * 160, -q.ny * o.side * 160); }
      if (c.human && now - (c.blastSnd ?? -9) > 1.2) { c.blastSnd = now; this.sound('blast', c, 0.9); }
      continue;
    }
    if ((c.tmCd || 0) > now) continue;
    const hl = c.L / 2, hw2 = c.W / 2;
    if (o.kind === 'cross') {
      const P = crossHits(o, now, c.x, c.y, c.heading, hl * 0.9, hw2 * 0.9, 0); if (!P) continue;
      c.tmCd = now + CD; c.hitCd = Math.max(c.hitCd, 1.2);
      if (blockedByShield(this, c)) { c.speed *= 0.6; continue; }
      const dir = P.dir || (Math.sign((c.x - o.x) * o.ux + (c.y - o.y) * o.uy) || 1), big = o.look === 'crawler', q = trackSample(c.T, c.s), back = Math.sign(c.s - o.s) || -1;
      c.skx += o.ux * dir * (big ? 200 : 180) + q.tx * back * 160; c.sky += o.uy * dir * (big ? 200 : 180) + q.ty * back * 160;   // along its way and back off it, so you're not left under it
      c.speed *= big ? 0.12 : 0.3; c.spinT = Math.max(c.spinT, big ? 1.1 : 0.8); c.squash = 1;
      this.fxHit(c, big ? '#f2a516' : '#78909c', big ? 'train' : 'gc');
    } else if (o.kind === 'arms') {
      const A = armHits(o, now, c.x, c.y, c.heading, hl, hw2, 0); if (!A) continue;
      c.tmCd = now + CD; c.hitCd = Math.max(c.hitCd, 1);
      if (blockedByShield(this, c)) { c.speed *= 0.7; continue; }
      c.skx += -A.tx * 140 + A.nx * 180; c.sky += -A.ty * 140 + A.ny * 180;
      c.speed *= 0.3; c.spinT = Math.max(c.spinT, 0.7); c.squash = 1;
      this.fxHit(c, '#ff5a3c', 'hand');
    } else if (o.kind === 'doors') {
      const D = doorHits(o, now, c.s, c.lat, hl, hw2 * 0.85, 0); if (!D) continue;
      c.tmCd = now + 0.6; c.hitCd = Math.max(c.hitCd, 0.8);
      if (blockedByShield(this, c)) { c.speed *= 0.5; }
      // stopped dead behind it (or, mostly through, pushed on out of it)
      const back = c.s < D.s + 4 ? -1 : 1, s = D.s + back * (hl + DOOR_D + 6), q = trackSample(c.T, s);
      c.s = s; c.x = q.x + q.nx * c.lat; c.y = q.y + q.ny * c.lat; c.prevLat = c.lat; c.progress = this.progressOf(c);
      c.speed = back < 0 ? 0 : Math.min(c.speed, 60); c.skx = c.sky = 0; c.stall = Math.max(c.stall, 0.35); c.squash = 1;
      this.fxHit(c, '#ffb300', 'gate');
    }
  }
}

// the line: through an airlock, down the middle (the doors close from both edges)
export function timedLine(c, tgt) {
  const L = c.T.mech && c.T.mech.timed; if (!L || !L.length) return tgt;
  for (const o of L) if (o.kind === 'doors') for (const D of o.doors) { const ds = D.s - c.s; if (ds > -40 && ds < 420) tgt = lerp(tgt, 0, clamp((420 - ds) / 260, 0, 1)); }
  return tgt;
}

// ---------------------------------------------------------------- bots
// A bot's run past the obstacles ahead: speed v1 until tSw then v2 (v1 < 0: stop short of the first and wait until
// tSw), braking for corners (cap). Returns time until past them (a firing slowing it), or minus the time until
// something hard catches it (so the least bad run can be picked).
function runPast(race, c, list, v1, v2, tSw, m, err, brake, sEnd, sStop, cap) {
  const T = c.T, h = 0.05, now = race.time, hl = c.L / 2, hw2 = c.W / 2, top = c.top * (c.slip ? 1.1 : 1);
  let s = c.s, v = c.speed, t = now, gone = 0;
  const lat0 = c.lat;
  for (let n = 0; n < 170; n++) {
    let tgt = t < tSw ? v1 : v2;
    if (tgt < 0) tgt = Math.sqrt(Math.max(0, 2 * brake * (sStop - s)));
    tgt = Math.min(tgt, cap[Math.min(cap.length - 1, Math.max(0, Math.floor(gone / 8)))]);
    if (v < tgt) v = Math.min(tgt, v + (v < top ? c.acc : -c.acc * 0.5) * h); else v = Math.max(tgt, v - brake * h);
    s += v * h; gone += v * h; t += h;
    if (gone > sEnd) return t - now;
    const q = trackSample(T, s), te = t + err;
    for (const o of list) {
      if (s < o.s0 - hl - 20 || s > o.s1 + hl + 20) continue;
      if (o.kind === 'blast') { if (Math.abs(s - o.s) < o.w + hl * 0.4) v *= Math.exp(-BLAST_DRAG * Math.max(blastAt(o, te), blastAt(o, te + m.t)) * h); continue; }   // slowed as race.js would, worse with a worse bot's margin
      let lat = lat0; if (o.kind === 'doors') lat = lerp(lat0, 0, clamp((420 - (o.doors[0].s - s)) / 260, 0, 1));
      const x = q.x + q.nx * lat, y = q.y + q.ny * lat, hd = Math.atan2(q.ty, q.tx);
      for (const u of [te - m.t, te, te + m.t]) {
        if (o.kind === 'cross' ? crossHits(o, u, x, y, hd, hl, hw2, m.d) : o.kind === 'arms' ? armHits(o, u, x, y, hd, hl, hw2, m.d) : doorHits(o, u, s, lat, hl, hw2, m.d)) return now - t - 1e-3;
      }
    }
  }
  return Infinity;
}
// the fastest speed now (up to what the corners allow) that gets the bot past the obstacles ahead soonest and clean
export function timedAI(c, skill, brake, allowed) {
  const L = c.T.mech.timed; if (!L || !L.length || this.calm) { if (c.T.mech.crests) c.hazNear = !!c.ai.crestNear; return allowed; }
  const T = c.T, list = L.filter(o => o.s1 - c.s > -c.L && o.s0 - c.s < 1300);
  c.hazNear = list.some(o => o.s0 - c.s < 700) || !!c.ai.crestNear || !!c.ai.leapNear;   // no boosts into these (race-ai.js)
  if (!list.length || c.ai.leapNear) return allowed;   // the Causeway Leap's window comes first (race-lowg.js)
  // recheck every 0.1 s (the plan holds in between)
  const ai = c.ai, now = this.time;
  if (ai.tmT !== undefined && now - ai.tmT < 0.1 && ai.tmS !== undefined && Math.abs(c.s - ai.tmS) < 80) return Math.min(allowed, ai.tmV);
  // a worse bot misjudges the timing a little now and then (once per obstacle, from its own luck)
  const first = list[0], E = ai.tmE || (ai.tmE = {});
  if (E[first.i] === undefined) E[first.i] = (c.rng() * 2 - 1) * clamp((1.07 - skill) * 1.4, 0, 0.25);
  const err = E[first.i], m = { t: 0.05 + (1.1 - skill) * 0.35, d: 4 + (1.1 - skill) * 50 };
  let sEnd = 0; for (const o of list) sEnd = Math.max(sEnd, o.s1 - c.s + c.L);
  const sStop = Math.max(c.s, first.kind === 'blast' ? first.s - first.w - c.L * 0.6 - 10 : first.s0 - c.L - 30);   // where it waits
  const cap = new Float32Array(Math.ceil(sEnd / 8) + 2), G = c.grip * (T.mech.rocket ? this.rocketGrip(c) : 1);
  for (let i = 0; i < cap.length; i++) { let v = 1e4; for (let e = 0; e <= 400; e += 25) { const vm = vmaxAt(T, c.s + i * 8 + e, G) * skill; v = Math.min(v, Math.sqrt(vm * vm + 2 * brake * e)); } cap[i] = v; }
  let best = Infinity, vb = null, worst = -1, vw = allowed;
  const run = (v1, v2, tSw, cmd) => { const tp = runPast(this, c, list, v1, v2, tSw, m, err, brake, sEnd, sStop, cap); if (tp >= 0) { if (tp < best - 1e-6) { best = tp; vb = cmd; } } else if (-tp > worst) { worst = -tp; vw = cmd; } };   // none clean: the one caught latest
  const top = 1e4, hi = Math.min(allowed, c.top * 1.2);
  run(top, top, Infinity, top);
  for (let v = hi - 25; v > 0; v -= 25) { run(v, v, Infinity, v); for (const w of [0.6, 1.2, 2, 2.8]) run(v, top, now + w, v); for (const w of [0.5, 1]) run(top, v, now + w, top); }
  for (let w = 0.3; w < 4.5; w += 0.3) run(-1, top, now + w, Math.sqrt(Math.max(0, 2 * brake * (sStop - c.s))));   // stop short and go when it's clear
  const v = vb !== null ? vb : vw;
  ai.tmT = now; ai.tmS = c.s; ai.tmV = v;
  return Math.min(allowed, v);
}
