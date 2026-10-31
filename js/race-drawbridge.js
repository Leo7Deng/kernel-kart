// Kernel Kart: the drawbridge (Sakura Stack). At irregular times the bell rings and the one-leaf bridge over the canal
// lifts for a boat, stands, and comes down. Low, it's a ramp: fast enough and you leap the canal (lift at the lip for a
// trick). Steeper it's a wall: you bounce off and wait at its foot. So: floor it for the leap, or lift and arrive as it
// comes down. Lift times (race.lifts, per bridge) come from race.rng; the leaf's angle is a pure function of them.
import { Math } from './detmath.js';   // deterministic maths, the same on every computer (detmath.js)
import { clamp, lerp } from './core.js';
import { halfWAt, trackSample, wrapS } from './geometry.js';
import { blockedByShield, untouchable } from './rules.js';
import { nearestS } from './race-mechanics.js';

export const DB_WARN = 1.4;    // the bell and the lamps, before the leaf starts to lift
export const DB_RISE = 1.2;    // lifting, from flat to standing up
export const DB_HOLD = 0.7;    // standing up while the boat goes through
export const DB_FALL = 1.3;    // coming back down
export const DB_UP = 0.9;      // how far it lifts (radians)
export const DB_CYCLE = DB_WARN + DB_RISE + DB_HOLD + DB_FALL;
const A_FLAT = 0.05;           // below this it's as good as down: you drive across
const A_JUMP = 0.52;           // the steepest a kart at full speed can leap (slower karts less: aJump)
const LAND = 34;               // a leap lands this far past the far end of the leaf (with the kart's tail clear of it)
const KNOCK = 50, SPIN = 0.8;  // into it at speed: knocked back this far, spinning this long
const AHEAD = 40, KEEP = 20;   // how far ahead the timetable is drawn, and how long past lifts are kept

// drawbridges: [{ at: [x, y], canal: [[x, y], ...], pools: [[x, y, r], ...], w, every: [lo, hi] }] (layout units):
// the crossing, the canal's line, its end pools (drawn only), canal width, rest between lifts (s)
export function buildDrawbridges(T) {
  const sc = T.def.scale;
  return (T.def.drawbridges || []).map(d => {
    const sM = nearestS(T, d.at[0] * sc, d.at[1] * sc), q = trackSample(T, sM), W = (d.w || 60) * sc;
    const len = W + 28, sH = wrapS(T, sM - len / 2), sTip = sH + len;   // the leaf: hinge on the near bank, tip on the far
    const canal = d.canal.map(p => [p[0] * sc, p[1] * sc]), pools = (d.pools || []).map(p => ({ x: p[0] * sc, y: p[1] * sc, r: p[2] * sc }));
    // keep the props and the scattered ponds off the canal and its pools
    const near = (x, y, m) => pools.some(p => Math.hypot(p.x - x, p.y - y) < p.r + m) || canal.some((a, i) => { const b = canal[i + 1]; if (!b) return false; const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / l2, 0, 1); return Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y) < W / 2 + m; });
    if (T.deco) for (let i = T.deco.length - 1; i >= 0; i--) { const p = T.deco[i]; if (near(p.x, p.y, p.r + 26)) T.deco.splice(i, 1); }
    if (T.ponds) for (let i = T.ponds.length - 1; i >= 0; i--) { const p = T.ponds[i]; if (near(p.x, p.y, p.r * 1.3 + 30)) T.ponds.splice(i, 1); }
    return { sM, sH, sTip, len, W, q, hw: halfWAt(T, sM), canal, pools, every: d.every || [9, 14] };
  });
}

// the timetable: when each bridge's bell rings (the lift starts DB_WARN later), from race.rng
export function liftTimes(race) {
  if (race.lifts) return race.lifts;
  if (race.calm) return (race.lifts = race.track.mech.drawbridges.map(() => []));   // calm / time trial: stays down
  return (race.lifts = race.track.mech.drawbridges.map(z => [race.time + 4 + race.rng() * z.every[0]]));
}
// the leaf's angle u seconds after the bell rang (0 is down)
function phaseAngle(u) {
  u -= DB_WARN; if (u <= 0) return 0;
  if (u < DB_RISE) return DB_UP * (1 - Math.cos(Math.PI * u / DB_RISE)) / 2;
  u -= DB_RISE; if (u < DB_HOLD) return DB_UP;
  u -= DB_HOLD; if (u < DB_FALL) return DB_UP * (1 + Math.cos(Math.PI * u / DB_FALL)) / 2;
  return 0;
}
// the leaf at race time t: { a, u (s since the bell, or -1), r (when it rang) }
export function leafAt(S, t) {
  if (S) for (const r of S) { const u = t - r; if (u >= 0 && u < DB_CYCLE) return { a: phaseAngle(u), u, r }; }
  return { a: 0, u: -1, r: -1 };
}
const angleAt = (S, t) => leafAt(S, t).a;
// the steepest leaf a kart going at v can leap (none below about half its top speed)
export const aJump = (c, v) => A_JUMP * clamp((v / c.top - 0.45) / 0.5, 0, 1);

// once a frame: keep the timetable ahead of the clock, and ring the bell
export function drawbridgeUpdate(dt) {
  const M = this.track.mech; if (!M.drawbridges.length || !this.started || this.calm) return;
  const SS = liftTimes(this), t1 = this.time, t0 = t1 - dt;
  M.drawbridges.forEach((z, i) => {
    const S = SS[i], [lo, hi] = z.every;
    while (S[S.length - 1] < this.time + AHEAD) S.push(S[S.length - 1] + DB_CYCLE + lo + this.rng() * (hi - lo));
    while (S.length > 2 && S[1] < this.time - KEEP) S.shift();
    for (const r of S) if (r > t0 && r <= t1) this.sound('bridgeBell', z.q, 0.9);
  });
}

// one car, one frame: into the leaf while it's up: leap it if low enough for your speed, else bounce and wait at its foot
export function drawbridgeCar(c, dt) {
  const T = c.T, M = T.mech; if (!M.drawbridges.length) return;
  const SS = liftTimes(this);
  M.drawbridges.forEach((z, i) => {
    const S = SS[i], L = T.L; let ds = c.s - z.sH; if (ds > L / 2) ds -= L; if (ds < -L / 2) ds += L;   // the kart's centre past the hinge
    const lf = leafAt(S, this.time);
    if (c.human && ds < -150 && ds > -1300 && lf.u >= 0 && lf.u < DB_WARN + DB_RISE && c.dbWarn !== lf.r) { c.dbWarn = lf.r; this.feed('warn', 'drawbridge', c); }
    if (lf.a < A_FLAT || c.air > 0 || c.finished || untouchable(c) || (c.oc > 0 && c.ocT)) return;
    const foot = -c.L / 2 - 6;   // where a kart waits: its nose just short of the hinge
    if (ds <= foot + 2 || ds > z.len + c.L / 2 || Math.abs(c.lat) > z.hw + c.W) return;
    if (lf.a <= aJump(c, c.speed)) {   // a ramp: leap the canal
      const landS = z.sTip + LAND + c.L / 2;   // clear of the leaf, however long the kart
      c.landS = landS; c.air = c.airT = Math.max(0.3, (landS - z.sH - ds) / Math.max(c.speed, 1)); c.jumpAt = z.sH; c.jumpCd = 1.2;
      c.trick = c.human ? (!c.gas && this.time - (c.gasOffAt === undefined ? -9 : c.gasOffAt) < 0.25) : c.rng() < clamp(0.3 + (c.ai.skill - 0.92) * 3, 0.2, 0.85);
      this.fxRing(c.x, c.y, '#ffffff', 40, 0.3, 4);
      this.sound(c.trick ? 'trick' : 'jump', c, c.human ? 1 : 0.5);
      return;
    }
    // too steep: held at its foot; at speed, knocked back spinning
    const hard = c.speed > 70 && (c.dbBonk || -9) < this.time - 0.8, shield = hard && blockedByShield(this, c);   // a Firewall takes the knock; you still wait
    const s = wrapS(T, z.sH + foot - (hard && !shield ? KNOCK : 0)), q = trackSample(T, s);
    c.s = s; c.x = q.x + q.nx * c.lat; c.y = q.y + q.ny * c.lat; c.prevLat = c.lat; c.progress = this.progressOf(c); c.speed = 0;
    if (!hard) return;
    c.dbBonk = this.time; c.hitCd = Math.max(c.hitCd, 1);
    if (shield) return;
    c.skx = c.sky = 0; c.kCmd = 0; c.spinT = Math.max(c.spinT, SPIN); c.squash = 1;
    const lx = lerp(q.x, z.q.x, 0.4), ly = lerp(q.y, z.q.y, 0.4);
    this.fxSparks(lx, ly, 10, '#ffd27a', 180);
    this.fxHit(c, '#d2452f', 'drawbridge');
  });
}

// A bot, like at the presses: tries speeds from the fastest the corners allow down to a stop, and holds the first that
// crosses clean (bridge down at the hinge and while on it, or low enough to leap). Worse bots leave more margin and now
// and then misjudge one. It keeps its boosts meanwhile (c.dbNear: race-ai.js).
export function drawbridgeAI(c, skill, brake, allowed) {
  const T = c.T, M = T.mech; if (!M.drawbridges.length) return allowed;
  c.dbNear = false; if (c.air > 0) return allowed;
  const SS = liftTimes(this);
  for (let i = 0; i < M.drawbridges.length; i++) {
    const z = M.drawbridges[i], S = SS[i], dsN = wrapS(T, z.sH - c.L / 2 - 4 - c.s);   // to where its nose reaches the hinge
    if (dsN > 1500 || dsN > T.L - 300) continue;
    const now = this.time, r0 = S.find(r => r + DB_CYCLE > now - 0.5 && r < now + 9);
    if (r0 === undefined) continue;   // no lift any time soon
    c.dbNear = angleAt(S, now) > 0 || S.some(r => r > now && r < now + 4);
    // now and then (worse bots more often) it misjudges a lift: no margin, thinks it can leap a steeper leaf
    if (!c.ai.dbBold || c.ai.dbBold.r !== r0) c.ai.dbBold = { r: r0, bold: c.rng() < clamp((1.1 - skill) * 0.7, 0, 0.3) };
    const bold = c.ai.dbBold.bold, m = bold ? 0 : 0.03 + (1.1 - skill) * 0.5, k = bold ? 1.35 : 0.96;
    const ok = (t, v) => {
      const rest = (z.len + c.L) / Math.max(v, 30);   // how long it's on the leaf if it drives across
      return [-m, 0, m].every(e => { const a = angleAt(S, t + e); return a <= aJump(c, v) * k || (a < A_FLAT && angleAt(S, t + rest + Math.max(e, 0)) < A_FLAT); });
    };
    const run = v1 => {
      let s = 0, v = c.speed, t = now; const h = 0.04;
      for (let n = 0; n < 240; n++) {
        v = v < v1 ? Math.min(v1, v + c.acc * h) : Math.max(v1, v - brake * h);
        s += v * h; t += h;
        if (s >= dsN) return ok(t, v);
        if (v < 1 && v1 < 1) return true;   // stopped short
      }
      return true;
    };
    const top = Math.min(allowed, c.top * 1.1);
    for (let v = top; v > -12; v -= 12) if (run(Math.max(v, 0))) { allowed = Math.min(allowed, Math.max(v, 0)); break; }
  }
  return allowed;
}
