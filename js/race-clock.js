// Kernel Kart: the clock (Race Condition, a steampunk clocktower). Three things, all a pure function of the race clock,
// so a race replays exactly and online players work them out for themselves:
//   - the minute hand: the great clock face stands inside the Dial (a balcony sweeper round it). The tower's clock has
//     gone wrong and runs backwards, fast: its minute hand (a blade at each end, the spade and the counterweight) comes
//     round the way the karts go, a little slower than them. Each blade comes down over the entry arch at the top of
//     the East Face and sweeps right across the balcony to the far arch (`open`: past the arches it rides up clear of
//     the road). There's no lane under it: it's a race for the balcony. Get over the arch ahead of a blade and it never
//     catches you; arrive with it and it swats you; behind it, you're quicker than it, so lift and let it get well
//     ahead or you run into the back of it before it's off the balcony.
//   - the pendulum: a great bob swinging across the Pendulum Drop. Flat out between swings, or lift and pass behind it.
//   - the strike: every `every` s the tower strikes. For `dur` s every boost pad fires double (race.js).
// Caught by the hand or the bob: knocked aside and nearly stopped, with a clang (a knock, not a wreck).
// Bots simulate their run past them (like the presses, race-presses.js) and pick the speed, or the wait, that gets them
// past soonest and clean; a worse bot misjudges the hand now and then.
import { TAU, clamp } from './core.js';
import { curvAt, halfWAt, insideAt, trackSample, vmaxAt, wrapS } from './geometry.js';
import { blockedByShield, untouchable } from './rules.js';
import { nearestS } from './race-mechanics.js';
import { G_SLOPE, K_TOP, TOP_MAX, TOP_MIN, elevAt, gradeAt } from './race-elevation.js';
import { BIT_TOP } from './race-bits.js';

const SHOVE_OUT = 260, SHOVE_ON = 150, KEEP = 0.3, SPIN = 0.7;   // the hand's knock: out from the arbor, along (or back against) its sweep; the speed you keep; how long you spin
const BOB_SHOVE = 300, BOB_ON = 120, BOB_KEEP = 0.2, BOB_SPIN = 0.8;               // the bob's: across the road the way it's swinging, and on
const CD = 1.2, ARM_CD = 3;                                        // one knock per pass (and a blade that's knocked you doesn't again on the same pass: you're behind it, on your way)
const VIEW = 380;                                                  // how far past the track's box the camera may go to the west and south (the Drop runs down the map's west edge, under the minimap)

export function buildClock(T) {
  const d = T.def.clock; if (!d) return null;
  const sc = T.def.scale || 1, [ax, ay, ar] = d.dial, x = ax * sc, y = ay * sc;
  const hands = d.hands.map(h => {
    // dir: which way it turns (screen angles: +1 clockwise); arms: how many blades, evenly round the arbor
    const op = (h.open || [-180, 180]).map(a => a * Math.PI / 180);
    const H = { x, y, r0: h.r0 * sc, r1: h.len * sc, w: (h.w || 12) * sc, period: h.period, phase: h.phase || 0, dir: h.dir || 1, arms: h.arms || 1, lo: op[0], span: op[1] - op[0] };
    // the stretch of road the blades reach (where the road comes within their tips of the arbor, in the open span), around the nearest point
    const sN = nearestS(T, x, y), reach = s => { const q = trackSample(T, s); return Math.hypot(q.x - x, q.y - y) - q.hw - 40 < H.r1 && inSpan(H, Math.atan2(q.y - y, q.x - x), 0.15); };
    let s0 = sN, s1 = sN; while (reach(s0 - 8) && sN - s0 < T.L / 2) s0 -= 8; while (reach(s1 + 8) && s1 - sN < T.L / 2) s1 += 8;
    Object.assign(H, { s0, s1, sMid: sN });
    // where it's stopped in a calm race (a time trial): the angle that keeps every blade furthest out past the arches
    let best = -1; for (let a = 0; a < TAU; a += 0.01) { let m = Infinity; for (let j = 0; j < H.arms; j++) { const u = ((a + j * TAU / H.arms - H.lo) % TAU + TAU) % TAU; m = Math.min(m, u <= H.span ? -1 : Math.min(u - H.span, TAU - u)); } if (m > best) { best = m; H.rest = a; } }
    H.line = lineProfile(T, s0 - 900, s1 + 60);
    return H;
  });
  const pendulums = (d.pendulums || []).map(p => {
    const s = nearestS(T, p.at[0] * sc, p.at[1] * sc), q = trackSample(T, s);
    return { s, x: q.x, y: q.y, nx: q.nx, ny: q.ny, tx: q.tx, ty: q.ty, amp: p.amp * sc, r: p.r * sc, period: p.period, phase: p.phase || 0, line: lineProfile(T, s - 900, s + 100) };
  });
  // the camera may go further out past the west and south edges than the road's own box, so the Drop, which runs down
  // the map's west edge, is near the middle of the screen and not under the minimap with the bob hidden (render.js
  // clamps the camera to T.view; art/track.js draws the ground 400 past the box, so this stays inside that)
  const B = T.bbox; T.view = { x: B.x - VIEW, y: B.y, w: B.w + VIEW, h: B.h + VIEW / 2 };
  return { dial: { x, y, r: ar * sc }, hour: d.hour ? { len: d.hour.len * sc, period: d.hour.period } : null, hands, pendulums, chime: d.chime };
}

// the steering's line over a stretch of road (race.js): which side is the inside, and the tightest bit of corner ahead,
// so a bot can tell where its line will be at a given speed (lineAt)
function lineProfile(T, a, b) {
  const n = Math.ceil((b - a) / 8), Z = { a, n, prof: new Float32Array(n), kPk: new Float32Array(n), hw: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    const s = a + i * 8, prof = insideAt(T, s + 40); let kPk = 0;
    for (let dd = -40; dd <= 240; dd += 10) { const k = curvAt(T, s + dd); if (k * prof > 0 && Math.abs(k) > kPk) kPk = Math.abs(k); }
    Z.prof[i] = prof; Z.kPk[i] = kPk; Z.hw[i] = halfWAt(T, s);
  }
  return Z;
}

// the strike: from `every` s on, every `every` s, for `dur` s
export function chimeAt(K, t) { const C = K.chime; if (!C || t < C.every) return -1; const u = t % C.every; return u < C.dur ? u : -1; }   // how long it's been striking (-1: not)
// the minute hand's blade k at race time t (screen angle)
export const handAngle = (K, H, t, k = 0) => H.dir * TAU * (H.phase + t / H.period) + k * TAU / H.arms;
// in a calm race (a time trial) the clock is stopped, the hand up over the arches and the bob hooked back off the road
export const handRest = (H, k = 0) => H.rest + k * TAU / H.arms;
export const bobRest = P => P.amp + P.r * 0.8;
// is angle a (round the arbor) in the balcony's open span, give or take `pad`? (outside it, past the arches at its
// ends, the hand rides up over them, clear of the road)
export const inSpan = (H, a, pad = 0) => ((a - H.lo + pad) % TAU + TAU) % TAU <= H.span + 2 * pad;
export const hourAngle = (K, t) => -TAU * (0.6 + t / K.hour.period);   // (backwards too: the clock's gone wrong)
// the pendulum bob's offset across the road (+ along the road's normal) at race time t, and its speed that way
export const bobAt = (P, t) => P.amp * Math.sin(TAU * (t / P.period + P.phase));
export const bobVel = (P, t) => P.amp * TAU / P.period * Math.cos(TAU * (t / P.period + P.phase));

// distance between segments ab and cd
function segDist(ax, ay, bx, by, cx, cy, dx, dy) {
  const ux = bx - ax, uy = by - ay, vx = dx - cx, vy = dy - cy, wx = ax - cx, wy = ay - cy;
  const a = ux * ux + uy * uy, b = ux * vx + uy * vy, c = vx * vx + vy * vy, d = ux * wx + uy * wy, e = vx * wx + vy * wy, D = a * c - b * b;
  let sN, sD = D, tN, tD = D;
  if (D < 1e-9) { sN = 0; sD = 1; tN = e; tD = c; } else { sN = b * e - c * d; tN = a * e - b * d; if (sN < 0) { sN = 0; tN = e; tD = c; } else if (sN > sD) { sN = sD; tN = e + b; tD = c; } }
  if (tN < 0) { tN = 0; sN = clamp(-d, 0, a); sD = a; } else if (tN > tD) { tN = tD; sN = clamp(b - d, 0, a); sD = a; }
  const sc = Math.abs(sN) < 1e-9 ? 0 : sN / sD, tc = Math.abs(tN) < 1e-9 ? 0 : tN / tD;
  return Math.hypot(wx + sc * ux - tc * vx, wy + sc * uy - tc * vy);
}
// which of the hand's blades is on kart c now (-1: none)? (the kart as a capsule along its heading)
function handOn(K, H, c, t, skip = -1) {
  const hx = Math.cos(c.heading), hy = Math.sin(c.heading), k = Math.max(0, c.L / 2 - c.W / 2);
  if (Math.hypot(c.x - H.x, c.y - H.y) > H.r1 + H.w + c.L) return -1;
  for (let j = 0; j < H.arms; j++) {
    if (j === skip) continue;
    const a = handAngle(K, H, t, j); if (!inSpan(H, a)) continue;
    const ux = Math.cos(a), uy = Math.sin(a);
    if (segDist(H.x + ux * H.r0, H.y + uy * H.r0, H.x + ux * H.r1, H.y + uy * H.r1, c.x - hx * k, c.y - hy * k, c.x + hx * k, c.y + hy * k) < H.w + c.W / 2) return j;
  }
  return -1;
}

// does a round thing of radius r at (x, y) touch kart c's body? (its oriented box: race.js hitsCar)
function hitsCar(c, x, y, r) {
  const dx = x - c.x, dy = y - c.y, ch = Math.cos(c.heading), sh = Math.sin(c.heading);
  return Math.abs(dx * ch + dy * sh) < c.L / 2 + r && Math.abs(-dx * sh + dy * ch) < c.W / 2 + r;
}
const along = (T, s, s0) => { let d = s - s0; if (d > T.L / 2) d -= T.L; if (d < -T.L / 2) d += T.L; return d; };

// once a frame: the tower strikes
export function clockUpdate(dt) {
  const K = this.track.mech.clock; if (!K || !K.chime) return;
  if (chimeAt(K, this.time) >= 0 && chimeAt(K, this.time - dt) < 0) {
    this.cue('chime');
    const D = K.dial; this.fxRing(D.x, D.y, '#ffd27a', D.r * 2.2, 0.9, 10); this.fxRing(D.x, D.y, '#ffffff', D.r * 1.4, 0.6, 5);
    for (const h of this.humans) if (!h.finished) this.jolt(h, 0.18);
  }
}

// one car, one frame: knocked by the hand or the bob, and the warnings
export function clockCar(c) {
  const K = c.T.mech.clock; if (!K || this.calm) return;   // (calm: stopped, art/clock.js)
  const T = c.T, now = this.time;
  c.clockNear = false;
  for (const H of K.hands) {
    const ds = along(T, H.s0, c.s);
    if (c.human && ds > 250 && ds < 900 && c.handWarn !== c.lap) { c.handWarn = c.lap; this.feed('warn', 'clock', c); }
    if (ds < 600 && along(T, c.s, H.s1) < 0) c.clockNear = true;   // (no place to fire a boost: race-ai.js straightAhead)
    if ((c.clockCd || 0) > now || c.air > 0 || c.finished || untouchable(c) || ds > 0 || along(T, c.s, H.s1) > 0) continue;
    const j = handOn(K, H, c, now, (c.clockArmT || 0) > now ? c.clockArm : -1); if (j < 0) continue;
    c.clockCd = now + CD; c.hitCd = Math.max(c.hitCd, 1); c.clockArm = j; c.clockArmT = now + ARM_CD;
    if (blockedByShield(this, c)) { c.speed *= 0.75; continue; }
    // out from the arbor, and away from the blade: on along its sweep if it caught you up, back if you ran into it
    const a = handAngle(K, H, now, j), dx = c.x - H.x, dy = c.y - H.y, r = Math.hypot(dx, dy) || 1, side = Math.sign(Math.cos(a) * dy - Math.sin(a) * dx) || H.dir;
    c.skx += dx / r * SHOVE_OUT - side * Math.sin(a) * SHOVE_ON; c.sky += dy / r * SHOVE_OUT + side * Math.cos(a) * SHOVE_ON;
    c.speed *= KEEP; c.spinT = Math.max(c.spinT, SPIN); c.squash = 1;
    this.fxHit(c, '#e3b04b', 'hand');
  }
  for (const P of K.pendulums) {
    const ds = along(T, P.s, c.s);
    if (c.human && ds > 250 && ds < 900 && c.bobWarn !== c.lap) { c.bobWarn = c.lap; this.feed('warn', 'pendulum', c); }
    if (ds < 1300 && ds > -P.r - c.L) c.clockNear = true;   // (from as far up the Drop as a bot plans for it: clockAI)
    if ((c.clockCd || 0) > now || (c.bobT || 0) > now || c.air > 0 || c.finished || untouchable(c) || Math.abs(ds) > P.r + c.L) continue;
    const b = bobAt(P, now);
    if (!hitsCar(c, P.x + P.nx * b, P.y + P.ny * b, P.r)) continue;
    c.clockCd = now + CD; c.hitCd = Math.max(c.hitCd, 1); c.bobT = now + P.period * 0.8;   // (once a pass: it doesn't swing back into you while you pick yourself up)
    if (blockedByShield(this, c)) { c.speed *= 0.8; continue; }
    const way = Math.sign(bobVel(P, now)) || 1;
    c.skx += P.nx * way * BOB_SHOVE + P.tx * BOB_ON; c.sky += P.ny * way * BOB_SHOVE + P.ty * BOB_ON;
    c.speed *= BOB_KEEP; c.spinT = Math.max(c.spinT, BOB_SPIN); c.squash = 1;
    this.fxHit(c, '#e3b04b', 'pendulum');
  }
}
// the strike's double pads (race.js): is the tower striking now?
export function chimeNow() { const K = this.track.mech.clock; return !!K && chimeAt(K, this.time) >= 0; }

// ---------------------------------------------------------------- bots
// where the steering's line will be at s, driving at v (race.js: the inside of the corner, only as far in as the arc
// it can make at that speed). lift: letting go grips a bit more, so it tucks in further.
function lineAt(c, Z, s, v, lift) {
  const i = clamp(Math.round((wrapS(c.T, s - Z.a)) / 8), 0, Z.n - 1), kPk = Z.kPk[i], edgeIn = Z.hw[i] - c.W * 0.7;
  const reach = kPk > 1e-5 ? clamp((1 / kPk - 1.08 * v * v / (c.grip * (lift ? 1.25 : 1))) / edgeIn, 0, 1) : 1;
  return Z.prof[i] * reach * edgeIn;
}
// would one of the hand's blades be over a kart at (x, y) at any time in [t0, t1]? (they turn one way, so it's the
// angles in between) (rk: the kart's reach along the sweep, half its length; rw: across it, half its width)
function handSweeps(K, H, x, y, rk, rw, t0, t1) {
  const dx = x - H.x, dy = y - H.y, r = Math.hypot(dx, dy);
  if (r < H.r0 - H.w - rw || r > H.r1 + H.w + rw) return false;
  const half = Math.asin(Math.min(1, (H.w + rk) / Math.max(r, 1))), p = Math.atan2(dy, dx), du = TAU * (t1 - t0) / H.period;
  if (!inSpan(H, p, half)) return false;   // (out past the arches it rides over the road)
  for (let j = 0; j < H.arms; j++) {
    const d = ((H.dir * (p - handAngle(K, H, t0, j))) % TAU + TAU) % TAU;   // how far blade j has to turn to get to the kart
    if (d <= du + half || d >= TAU - half) return true;
  }
  return false;
}
// would a bot holding speed v1 (until time tSw, then v2) get past every hand and bob ahead clean? m: how much room it
// leaves (m.h from the hand's blades, in world units; m.b from the bob, in seconds); err: how far off its idea of the hand's timing is. Stopping is clean as long as nothing
// sweeps over it where it stops. Returns when it'd be past them (Infinity: not yet, but clean so far), or, not clean,
// minus how long until it'd be caught (so the least bad run can be told apart from the rest).
// free: ignore them (how soon it'd be past flat out)
function runClean(race, c, K, hands, bobs, v1, v2, tSw, m, err, brake, sEnd, cap, free = false) {
  const T = c.T, h = 0.05, now = race.time, rk = c.L * 0.5, rw = c.W * 0.5 + 4, top0 = c.top * (1 + BIT_TOP * c.bits);
  let s = c.s, v = c.speed, t = now, lat = c.lat, gone = 0, boost = c.boost;
  const slip = c.slip;   // (in someone's slipstream: say it lasts)
  const H0 = hands[0], P0 = bobs[0];
  for (let n = 0; n < 150; n++) {
    // as race.js drives it: on the gas up to the top speed (less uphill, more with a boost on or in a slipstream), or lifting; the corners
    // ahead (cap); the slope (race-elevation.js); and a boost pad on the way (double while the tower strikes)
    const tgt = Math.min(t < tSw ? v1 : v2, cap[Math.min(cap.length - 1, Math.max(0, Math.floor(gone / 8)))]), g = G_SLOPE * gradeAt(T, s);
    const top = top0 * (1 + (boost > 0 ? 0.32 : 0) + (slip ? 0.1 : 0)) * clamp(1 - K_TOP * gradeAt(T, s), TOP_MIN, TOP_MAX), acc = c.acc * (boost > 0 ? 1.8 : 1) * (slip ? 1.3 : 1);
    if (v < tgt) v = v < top ? Math.min(tgt, v + (acc - g) * h) : v - (acc * 0.5 + g) * h;
    else v = Math.max(tgt, v - (brake + g) * h);
    const s0 = s; s += v * h; t += h; gone += v * h; boost -= h;
    for (const pd of T.pads) { const d = along(T, pd.s, s0); if (d >= 0 && d < s - s0 + 1 && Math.abs(lat - pd.lat) < 46) { const dbl = chimeAt(K, t) >= 0; boost = Math.max(boost, dbl ? 1.8 : 0.9); v = Math.max(v, c.top * (dbl ? 1.16 : 1.08)); } }
    if (gone > sEnd) return t;
    if (free) continue;
    const Z = H0 && along(T, s, H0.s1) < 0 ? H0.line : P0 ? P0.line : null;
    if (Z) {   // (the kart follows its line slowly, and a bot rides a little to one side of it on a straight: race.js)
      const i = clamp(Math.round(wrapS(T, s - Z.a) / 8), 0, Z.n - 1), off = c.human ? 0 : (c.ai.bias + Math.sin(t * 0.35 + c.ai.noise * TAU) * 0.1) * Z.hw[i] * (1 - Math.abs(Z.prof[i]));
      lat += (lineAt(c, Z, s, v, v < c.top * 0.97 && tgt < v + 1) + off - lat) * 0.09;
    }
    const q = trackSample(T, s), x = q.x + q.nx * lat, y = q.y + q.ny * lat;
    for (const H of hands) if (handSweeps(K, H, x, y, rk + m.h, rw, t - 0.03 + err, t + 0.03 + err)) return now - t - 1e-3;
    for (const P of bobs) {
      const ds = along(T, s, P.s); if (Math.abs(ds) > P.r + c.L * 0.5 + 6) continue;
      for (const u of [t - m.b, t, t + m.b]) if (Math.abs(lat - bobAt(P, u)) < P.r + c.W * 0.5 + 6) return now - t - 1e-3;
    }
  }
  return Infinity;
}
const BOB_WAIT = 1.3;   // a bot only waits for the bob if it costs it less than a knock (about 1.6 s)
export function clockAI(c, skill, brake, allowed) {
  const K = c.T.mech.clock; if (!K || this.calm) return allowed;
  const T = c.T, hands = K.hands.filter(H => { const d = along(T, H.s0, c.s); return d < 900 && along(T, c.s, H.s1) < 0; });
  const bobs = K.pendulums.filter(P => { const d = along(T, P.s, c.s); return d < 1300 && d > -P.r - c.L * 0.5; });   // (from well up the Drop: at 500 a second, a swing takes a while to wait out)
  if (!hands.length && !bobs.length) return allowed;
  // a worse bot reads the hand a little off now and then (once per lap, from its own luck)
  if (hands.length && c.ai.clockLap !== c.lap) { c.ai.clockLap = c.lap; const e = clamp((1.07 - skill) * 1.6, 0, 0.3); c.ai.clockErr = (c.rng() * 2 - 1) * e; }
  const err = hands.length ? c.ai.clockErr || 0 : 0;
  // how much room it leaves: from the bob, in seconds; from a blade, in world units (ahead of one or behind it, it's
  // the gap that matters: they're slower than you)
  const m = { b: 0.06 + (1.1 - skill) * 0.4, h: 12 + (1.1 - skill) * 120 };
  let sEnd = 0; for (const H of hands) sEnd = Math.max(sEnd, along(T, H.s1, c.s) + 20); for (const P of bobs) sEnd = Math.max(sEnd, along(T, P.s, c.s) + P.r + c.L);
  const top = 1e4, now = this.time;   // (flat out: as fast as the kart goes, runClean)
  // the corners' speed limits along the way, as the bot brakes for them (aiThrottle), so a run isn't simulated faster
  // than it'll really go round the Dial or into the Foot
  const cap = new Float32Array(Math.ceil(sEnd / 8) + 2), h0 = elevAt(T, c.s);
  for (let i = 0; i < cap.length; i++) {
    const s0 = c.s + i * 8, e0 = elevAt(T, s0) - h0; let v = 1e4;
    for (let e = 0; e <= 480; e += 24) { const vm = vmaxAt(T, s0 + e, c.grip) * skill; v = Math.min(v, Math.sqrt(Math.max(0, vm * vm + 2 * brake * e + 2 * G_SLOPE * (elevAt(T, s0 + e) - h0 - e0)))); }
    cap[i] = v;
  }
  // just the bob: how soon we'd be past it flat out, so a wait that costs more than a knock isn't worth it
  const tFree = hands.length ? 0 : runClean(this, c, K, hands, bobs, top, top, Infinity, m, err, brake, sEnd, cap, true);
  const pick = (v1, tp) => !hands.length && tp - tFree > BOB_WAIT ? allowed : Math.min(allowed, v1);
  // of the runs that are clean with room to spare (flat out; holding a speed; holding it a while then flat out; flat out
  // a while then holding it), the one that's past soonest; if there's none (it's already too close behind a blade for
  // that), with hardly any room; and if there's still none, by a blade the run that's caught latest (the slowest of
  // those), so it's not flooring it into the back of one, and by the bob flat out
  let worst = -Infinity, vw = allowed;
  for (const mm of [m, { h: 2, b: 0.03 }]) {
    let best = Infinity, vb = -1;
    const run = (v1, v2, tSw, cmd) => { const tp = runClean(this, c, K, hands, bobs, v1, v2, tSw, mm, err, brake, sEnd, cap); if (tp >= 0) { if (tp < best - 1e-6) { best = tp; vb = cmd; } } else if (tp >= worst) { worst = tp; vw = cmd; } };
    run(top, top, Infinity, top); if (vb >= 0) return pick(vb, best);
    for (let v = Math.min(allowed, c.top * 1.35) - 30; v > -30; v -= 30) {
      const v1 = Math.max(v, 0);
      for (const w of [1.2, 0.8, 0.4]) run(top, v1, now + w, top);
      run(v1, v1, Infinity, v1);
      for (const w of [0.5, 1, 1.6, 2.4]) run(v1, top, now + w, v1);
    }
    if (vb >= 0) return pick(vb, best);
  }
  return hands.length ? Math.min(allowed, vw) : allowed;   // (the bob swings across: past it soonest is in it least)
}
