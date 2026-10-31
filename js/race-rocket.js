// Moonshot's rides (`rocket`): one lap Earth -> Moon -> Earth. The Launch Row (a rocket per racer down one side, a ramp
// into each) catches you at any speed, bays taken in order (race.bayN), so the front of the race boards and leaves first;
// your rocket flies to its own pad on the Moon's field and you roll out through the gate after FLY_T + DOOR_T + ROLL_T,
// at least MIN_GAP behind the kart before (the gaps grow a little on the way). On the Moon everything grips less
// (MOON_GRIP); its bowl, rille, mass driver, crests, rover and airlock are other mechanics. The Return Row's capsules
// (race.cbayN) lift off, splash down in zones off the beach and are towed (TOW_V) to the slipway. Nothing skips a row
// (Overclock's skipLimit; a kart past the last bay is caught anyway). The ridden stretches (`spans`) aren't road and
// aren't drawn as road; lap distance runs on with the ride so places stay right.
// State is plain numbers: race.bayN/outT/outN and cbayN/coutT/coutN; per kart c.bay, c.dockT, c.rkL, c.flyOut, c.flyN,
// c.cbay, c.cdockT, c.cL, c.cSpl, c.cOut, c.cN, c.flyT (an early return in updateCar), c.flyK (0 rocket, 1 capsule),
// flyX/flyY/flyH/flyV. Bays per race = its racer count (rowsOf; layouts cached per count in z.byN).
import { Math } from './detmath.js';   // deterministic maths, the same on every computer (detmath.js)
import { clamp, lerp } from './core.js';
import { halfWAt, trackSample } from './geometry.js';
import { nearestS } from './race-mechanics.js';

export const NB = 10;              // at most this many bays a row (every racer gets one)
export const RAMP = 190;           // a bay's ramp leaves the road this far short of its pad: you're caught there
export const TOP_IN = 46;          // the ramp's top stands this far from the middle of the pad, toward the road
export const HATCH = [72, 56];     // how high its hatch is up a rocket's side, and a capsule's (world units up the screen)
const ROOM = 4;                    // a row keeps its full spacing for up to this many; more and they stand closer
export const BOARD_T = 0.6;        // caught: along the ramp and up into the hatch
export const LAUNCH_T = 1.3;       // caught to liftoff: the hatch shuts, the engines light, up it goes
export const FLY_T = 5.8;          // liftoff to touchdown on the Moon
export const DOOR_T = 0.6;         // down on the Moon: the dust settles and its door opens...
export const ROLL_T = 1.0;         // ...and out you roll, across the field to the gate
export const PAD_T = 0.05;         // ... a pad further from the gate: this much longer for each
export const MIN_GAP = 0.32;       // two karts roll out at least this far apart
const ROLL_V = 0.55, SEA_V = 0.55; // how fast you come out (share of your top speed): through the gate, up the slipway
// the capsule: aboard to liftoff, then its flight (s from liftoff): off the pad, across space, into the air (the art
// times the fire by where it is), drogue, mains, splashdown; afloat a moment, towed in, up the slipway
export const CAP_LAUNCH = 1.5;
export const CAP = { burn: 0.7, drogue: 4.3, chute: 4.7, splash: 6.2 };
const BOB = 0.5, TOW_V = 450, CLIMB_T = 0.9;
export const MOON_GRIP = 0.82;     // the Moon: low gravity, less grip
export const PAD_OFF = 150;        // a pad stands this far out past the road's edge
const END_IN = 130;                // the last pad stands this far short of the road's end
const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);

// rocket: { row: { end, gap, side }, field: { at, side }, gate, ret: { end, gap, side }, splash: { at, out, gap, side } }
// (layout units; side + is the driver's right). `out` is the top of the slipway, where the road begins again
export function buildRocket(T) {
  const d = T.def.rocket; if (!d) return null;
  const sc = T.def.scale, S = p => nearestS(T, p[0] * sc, p[1] * sc), F = d.field.at || d.field;
  const z = { T, sRowEnd: S(d.row.end), gap: (d.row.gap || 150) * sc, side: d.row.side || -1, sF: S(F), mside: d.field.side || -1, sGate: S(d.gate),
    sRetEnd: S(d.ret.end), gapR: (d.ret.gap || 150) * sc, rside: d.ret.side || -1, sZ: S(d.splash.at), sOut: S(d.splash.out), gapZ: (d.splash.gap || 170) * sc, zside: d.splash.side || -1, byN: [] };
  z.spans = [[z.sRowEnd + 20, z.sGate - 30], [z.sRetEnd + 20, z.sOut - 70]];   // (the road that isn't there: art/moonshot.js keeps it off the map)
  z.gate = at(T, z.sGate); z.field = at(T, z.sF); z.foot = at(T, z.sOut - 70); z.top = at(T, z.sOut);
  { const B = T.bbox, mx = 560, my = 300; T.view = { x: B.x - mx, y: B.y - my, w: B.w + mx * 2, h: B.h + my * 2 }; }   // (the camera may go past the box, so a kart at a row on the map's edge is in the middle of the screen; art/moonshot.js bakes that far)
  return z;
}
const at = (T, s, lat = 0) => { const q = trackSample(T, s); return { x: q.x + q.nx * lat, y: q.y + q.ny * lat, a: Math.atan2(q.ty, q.tx), hw: q.hw, s, lat, nx: q.nx, ny: q.ny }; };
// the rows for a race of n karts (once per track and count): Launch Row bays (catch point, ramp foot, pad), Moon pads,
// Return Row bays, splashdown zones, each a line down one side, nearest first. Past ROOM they stand closer so a row
// never gets longer
const spacing = (gap, n) => n <= ROOM ? gap : gap * (ROOM - 1) / (n - 1);
export function layoutFor(z, n) {
  n = clamp(n | 0, 1, NB); if (z.byN[n]) return z.byN[n];
  const T = z.T, out = { n, bays: [], mpads: [], rbays: [], zones: [] };
  const row = (sEnd, gap, side, list) => {
    const g = spacing(gap, n);
    for (let j = 0; j < n; j++) {
      const sP = sEnd - END_IN - (n - 1 - j) * g, s = sP - RAMP, hw = halfWAt(T, s), hwP = halfWAt(T, sP);
      const dock = at(T, s, side * (hw - 4)), pad = at(T, sP, side * (hwP + PAD_OFF)), d = Math.hypot(dock.x - pad.x, dock.y - pad.y) || 1;
      list.push({ j, s, sP, side, lat: side * hw * 0.45, dock, pad, top: { x: pad.x + (dock.x - pad.x) / d * TOP_IN, y: pad.y + (dock.y - pad.y) / d * TOP_IN } });   // (dock: the ramp's foot at the road's edge; top: its top, against the rocket's side)
    }
  };
  row(z.sRowEnd, z.gap, z.side, out.bays); row(z.sRetEnd, z.gapR, z.rside, out.rbays);
  // the landing field: a line down one side, the first pad the nearest the gate
  const gapM = Math.min(spacing(z.gap, n), (z.sGate - z.sF - 300) / Math.max(1, n - 1));
  for (let j = 0; j < n; j++) { const s = z.sGate - 220 - j * gapM; out.mpads.push({ j, s, side: z.mside, pad: at(T, s, z.mside * (halfWAt(T, s) + PAD_OFF)) }); }
  // the splashdown zones: a line down one side of the channel in to the slipway, the first the nearest it
  const gapZ = Math.min(spacing(z.gapZ, n), (z.sOut - 70 - z.sZ - 200) / Math.max(1, n - 1));
  for (let j = 0; j < n; j++) { const s = z.sOut - 70 - 230 - j * gapZ; out.zones.push({ j, s, side: z.zside, pad: at(T, s, z.zside * 160) }); }
  out.sRow0 = out.bays[0].s; out.sRet0 = out.rbays[0].s;
  return z.byN[n] = out;
}
export const rowsOf = race => layoutFor(race.track.mech.rocket, race.cars.length);
// on the Moon (between its gate and the Return Row)?
export const onMoon = (z, s) => s >= z.sGate - 200 && s <= z.sRetEnd + 200;
// inside one of the rides' stretches (not road)?
export const inSpan = (z, s) => z.spans.some(([a, b]) => s > a && s < b);
// the bay a kart has, or would get if it got to the row now (k 0: the Launch Row, 1: the Return Row)
export const bayOf = (race, c, k = 0) => k ? (c.cbay >= 0 ? c.cbay : Math.min(race.cars.length - 1, race.cbayN || 0)) : (c.bay >= 0 ? c.bay : Math.min(race.cars.length - 1, race.bayN || 0));
// which row a kart is heading for: 0 the Launch Row, 1 the Return Row, -1 neither (past both)
export const rowAhead = (z, s) => s < z.sRowEnd + 20 ? 0 : s < z.sRetEnd + 20 ? 1 : -1;

// once a frame: the liftoffs, the capsules' moments, nothing left on the rides' stretches
export function rocketUpdate(dt) {
  const z = this.track.mech.rocket; if (!z || !this.started) return;
  const t1 = this.time, t0 = t1 - dt, R = rowsOf(this), hit = k => k > t0 && k <= t1;
  for (const c of this.cars) {
    if (c.bay >= 0 && c.rkL > 0) {
      const P = R.bays[c.bay].pad;
      if (hit(c.rkL - 1.0)) this.sound('engines', P, c.human ? 1 : 0.6);   // the engines lighting
      if (hit(c.rkL)) { this.sound('liftoff', P, c.human ? 1 : 0.7); if (c.flyK === 0) this.jolt(c, 1.4); }   // and up it goes
      if (hit(c.rkL + FLY_T)) { this.sound('touchdown', R.mpads[c.bay].pad, c.human ? 1 : 0.5); if (c.flyK === 0) this.jolt(c, 0.5); }
    }
    if (c.cbay >= 0 && c.cL > 0) {
      const P = R.rbays[c.cbay].pad, Z = R.zones[c.cbay].pad;
      if (hit(c.cL)) { this.sound('capsule', P, c.human ? 1 : 0.6); if (c.flyK === 1) this.jolt(c, 0.9); }
      if (hit(c.cL + CAP.drogue)) this.sound('chute', Z, c.human ? 1 : 0.4);
      if (hit(c.cSpl)) { this.sound('hit_splash', Z, c.human ? 1 : 0.5); this.fxRing(Z.x, Z.y, '#ffffff', 90, 0.6, 7); this.fxRing(Z.x, Z.y, '#b3e5fc', 150, 0.9, 5); this.fxDrops(Z.x, Z.y, 34, '#e1f5fe', 260, 6); if (c.flyK === 1) this.jolt(c, 0.6); }
    }
  }
  // the rides' stretches aren't road: anything thrown along them is gone
  const gone = o => o.s !== undefined && (!o.T || o.T === this.track) && inSpan(z, o.s);
  for (const p of this.projectiles) if (gone(p)) p.life = 0;
  if (this.mines.length && this.mines.some(gone)) this.mines = this.mines.filter(o => !gone(o));
  if (this.slicks.length && this.slicks.some(gone)) this.slicks = this.slicks.filter(o => !gone(o));
  if (this.loops.length && this.loops.some(gone)) this.loops = this.loops.filter(o => !gone(o));
  if (this.megas.length && this.megas.some(gone)) this.megas = this.megas.filter(o => !gone(o));
}

// one car, one frame (after it has moved): the rows
export function rocketCar(c) {
  const T = c.T, z = T.mech.rocket; if (!z || c.finished || c.flyT > 0) return;
  const s = c.s, R = rowsOf(this);
  // a player coming up to a row: the rocket sign
  const k = rowAhead(z, s), s0 = k ? R.sRet0 : R.sRow0;
  if (k >= 0 && c.human && s > s0 - 2000 && s < s0 - 800 && c.padWarn !== k + 1) { c.padWarn = k + 1; this.feed('warn', 'rocket', c); }
  if (k < 0) return;
  // the row: the next free bay along the line catches you as you reach it, at whatever speed (and anyone somehow past
  // the row's last bay is caught anyway)
  const sEnd = k ? z.sRetEnd : z.sRowEnd, j = Math.min(R.n - 1, (k ? this.cbayN : this.bayN) || 0), B = (k ? R.rbays : R.bays)[j];
  if (s >= B.s || s >= sEnd + 10) {
    if (k) { c.cbay = j; this.cbayN = j + 1; } else { c.bay = j; this.bayN = j + 1; }
    board(this, c, k, R);
  }
}
// clear what a ride shouldn't carry: boosts, a tow, a Thread's clones, a rewind's memory
function strip(race, c) {
  c.boost = c.turbo = c.oiled = c.oc = c.ff = 0; if (c.mtT > 0) c.mtT = 0; c.ocT = null; c.spinT = 0; c.skx = c.sky = 0; c.kCmd = 0; c.slide = 0; c.trick = false; c.air = 0;
  c.pull = 0; if (c.pullTarget) c.pullTarget.dragged = 0; c.pullTarget = null; c.dragged = 0;
  for (const o of race.cars) if (o.pullTarget === c) { o.pull = 0; o.pullTarget = null; }
  for (const k of race.clones) if (k.owner === c) k.life = 0;   // (the thread snaps: items/thread.js)
  c.hist = []; c.dOn = false; c.dAmt = 0; c.dYaw = 0;
  c.flyX = c.x; c.flyY = c.y; c.flyH = c.heading; c.flyV = c.speed;
}
// aboard: the rocket goes LAUNCH_T from now and you're booked out after the kart before (PAD_T more per pad from the
// gate); the capsule goes CAP_LAUNCH from now and you're booked up the slipway after the kart before
function board(race, c, k, R) {
  strip(race, c);
  const now = race.time;
  if (k === 0) {
    c.flyK = 0; c.dockT = now; c.rkL = now + LAUNCH_T;
    c.flyOut = Math.max(c.rkL + FLY_T + DOOR_T + ROLL_T + PAD_T * c.bay, (race.outT || 0) + MIN_GAP); race.outT = c.flyOut;
    c.flyN = race.outN || 0; race.outN = c.flyN + 1;
    c.flyT = c.flyOut - now;
    race.fxRing(c.x, c.y, '#ffd166', 70, 0.4, 6);
  } else {
    const Z = R.zones[c.cbay].pad, F = race.track.mech.rocket.foot;
    c.flyK = 1; c.cdockT = now; c.cL = now + CAP_LAUNCH; c.cSpl = c.cL + CAP.splash;
    c.cOut = Math.max(c.cSpl + BOB + Math.hypot(Z.x - F.x, Z.y - F.y) / TOW_V + CLIMB_T, (race.coutT || 0) + MIN_GAP); race.coutT = c.cOut;
    c.cN = race.coutN || 0; race.coutN = c.cN + 1;
    c.flyT = c.cOut - now;
    race.fxRing(c.x, c.y, '#7df9ff', 60, 0.4, 5);
  }
  race.sound('board', c, c.human ? 1 : 0.4);
}
// the rocket's climb: 0 on the pad, 1 down on the Moon (slow off the pad, fast across, slowing for the landing)
const C1 = 0.42, C2 = 0.78, CK = 1 / (C2 - C1 + (C1 + 1 - C2) / 2);   // (speeding up off the pad until C1, flat out to C2, then braking onto the Moon)
export const climbU = f => f <= 0 ? 0 : f >= 1 ? 1 : f < C1 ? CK * f * f / (2 * C1) : f < C2 ? CK * (C1 / 2 + f - C1) : 1 - CK * Math.pow(1 - f, 2) / (2 * (1 - C2));
// the capsule's way down, e s after liftoff: 0 its Moon pad, 1 its sea zone (burn, falling faster, braking in the air, chutes)
export function capU(e) {
  if (e <= 0) return 0; if (e >= CAP.splash) return 1;
  if (e < CAP.burn) return 0.05 * Math.pow(e / CAP.burn, 2);
  if (e < CAP.drogue) return 0.05 + 0.8 * Math.pow((e - CAP.burn) / (CAP.drogue - CAP.burn), 1.3);
  if (e < CAP.chute) return 0.85 + 0.08 * ease((e - CAP.drogue) / (CAP.chute - CAP.drogue));
  return 0.93 + 0.07 * ((e - CAP.chute) / (CAP.splash - CAP.chute));
}

// The ride: replaces the car's own update until it's back on a road. Position comes from the clock alone (the same on
// every screen): x, y, heading, speed and lap distance
export function rocketRide(c, dt) {
  const T = c.T, z = T.mech.rocket, now = this.time, R = rowsOf(this);
  const P = flyPose(z, R, c, now), x0 = c.x, y0 = c.y;
  c.x = P.x; c.y = P.y; c.heading = P.a; c.s = P.s; c.lat = P.lat; c.prevLat = P.lat; c.lineS = P.lat;
  c.speed = clamp(Math.hypot(P.x - x0, P.y - y0) / Math.max(dt, 1e-4), 0, 1400);
  c.skx = c.sky = 0; c.jx = c.jy = 0; c.air = 0; c.off = false; c.progress = this.progressOf(c);
  c.flyT = (c.flyK ? c.cOut : c.flyOut) - now;
  if (c.flyT > 0) return;
  // out onto the road: through the landing field's gate onto the Moon, or up the slipway onto the beach road
  const sOut = c.flyK ? z.sOut + 10 : z.sGate + 10, q = trackSample(T, sOut), lat = ((c.flyK ? c.cN : c.flyN) % 2 ? -1 : 1) * q.hw * 0.3;
  c.flyT = 0; c.s = sOut; c.lat = c.prevLat = c.lineS = lat; c.x = q.x + q.nx * lat; c.y = q.y + q.ny * lat; c.heading = Math.atan2(q.ty, q.tx);
  c.speed = c.top * (c.flyK ? SEA_V : ROLL_V); c.kCmd = 0; c.reach = 1; c.hitCd = Math.max(c.hitCd, 0.5); c.hist = []; c.progress = this.progressOf(c);
  this.fxRing(c.x, c.y, c.flyK ? '#b3e5fc' : '#d7dbe6', 60, 0.4, 5);
}
// where a kart on a ride is at time t and how it looks: x, y, a (heading), s and lat (its place on the lap), kart (how
// much shows: 0 inside), k (size), lift (gantry arm height, world units up the screen)
export function flyPose(z, R, c, t) {
  const T = c.T, along = (s, lat = 0) => { const q = trackSample(T, s); return { x: q.x + q.nx * lat, y: q.y + q.ny * lat, a: Math.atan2(q.ty, q.tx), s, lat, kart: 0, k: 1, lift: 0 }; };
  // caught: on at your speed and heading, swinging off the road onto the ramp, up it and in through the hatch
  const boarding = (B, f, sNow, hatch) => {
    const h = c.flyH === undefined ? B.dock.a : c.flyH, L1 = clamp((c.flyV || 300) * BOARD_T * 0.4, 50, 200);
    const P0x = c.flyX, P0y = c.flyY, P1x = P0x + Math.cos(h) * L1, P1y = P0y + Math.sin(h) * L1, P2x = lerp(B.dock.x, B.top.x, 0.35), P2y = lerp(B.dock.y, B.top.y, 0.35), P3x = B.top.x, P3y = B.top.y;
    const u = 1 - Math.pow(1 - clamp(f / 0.85, 0, 1), 1.5), v = 1 - u;
    const x = v * v * v * P0x + 3 * v * v * u * P1x + 3 * v * u * u * P2x + u * u * u * P3x, y = v * v * v * P0y + 3 * v * v * u * P1y + 3 * v * u * u * P2y + u * u * u * P3y;
    const dx = 3 * v * v * (P1x - P0x) + 6 * v * u * (P2x - P1x) + 3 * u * u * (P3x - P2x), dy = 3 * v * v * (P1y - P0y) + 6 * v * u * (P2y - P1y) + 3 * u * u * (P3y - P2y);
    const up = ease((u - 0.3) / 0.7), into = ease((f - 0.8) / 0.2);   // (up the ramp; then in through the hatch)
    return { x: lerp(x, B.pad.x, into * 0.6), y, a: dx || dy ? Math.atan2(dy, dx) : h, s: sNow, lat: B.lat, kart: 1 - into, k: 1 - 0.3 * into, lift: hatch * up };
  };
  // rolling out: from a pad to the road at sOut, in lane n
  const rollOut = (P0, sOut, n, f, sNow) => {
    const G = along(sOut, (n % 2 ? -1 : 1) * halfWAt(T, sOut) * 0.3), m = { x: lerp(P0.x, G.x, 0.2), y: lerp(P0.y, G.y, 0.7) };
    const x = Math.pow(1 - f, 2) * P0.x + 2 * f * (1 - f) * m.x + f * f * G.x, y = Math.pow(1 - f, 2) * P0.y + 2 * f * (1 - f) * m.y + f * f * G.y;
    const dx = 2 * (1 - f) * (m.x - P0.x) + 2 * f * (G.x - m.x), dy = 2 * (1 - f) * (m.y - P0.y) + 2 * f * (G.y - m.y);
    return { x, y, a: Math.atan2(dy, dx) || G.a, s: sNow, lat: G.lat * f, kart: ease(f * 3), k: 0.7 + 0.3 * f, lift: 0 };
  };
  if (!c.flyK) {
    const B = R.bays[c.bay] || R.bays[0], M = R.mpads[c.bay] || R.mpads[0], tb = c.dockT, tL = c.rkL, tOut = c.flyOut;
    // where it counts as being: spread from the row's end to the Moon's gate over the ride, so dock order is kept and
    // everyone aboard is ahead of everyone still driving
    const sNow = lerp(z.sRowEnd + 10, z.sGate - 10, clamp((t - tb) / Math.max(0.1, tOut - tb), 0, 1));
    if (t < tb + BOARD_T) return boarding(B, (t - tb) / BOARD_T, sNow, HATCH[0]);
    if (t < tL) return { ...along(B.s, B.lat), x: B.pad.x, y: B.pad.y, s: sNow };   // aboard, on the pad
    if (t < tL + FLY_T) { const u = climbU((t - tL) / FLY_T); return { ...along(B.s, B.lat), x: lerp(B.pad.x, M.pad.x, u), y: lerp(B.pad.y, M.pad.y, u), a: -Math.PI / 2, s: sNow }; }   // up and over to the Moon
    const f = ease((t - (tOut - ROLL_T)) / ROLL_T);
    if (f <= 0) return { ...along(M.s), x: M.pad.x, y: M.pad.y, s: sNow };   // down on the Moon, waiting for its turn at the gate
    return rollOut(M.pad, z.sGate + 10, c.flyN, f, sNow);
  }
  const B = R.rbays[c.cbay] || R.rbays[0], Z = R.zones[c.cbay] || R.zones[0], tb = c.cdockT, tL = c.cL, tS = c.cSpl, tOut = c.cOut, F = z.foot;
  const sNow = lerp(z.sRetEnd + 10, z.sOut - 10, clamp((t - tb) / Math.max(0.1, tOut - tb), 0, 1));
  if (t < tb + BOARD_T) return boarding(B, (t - tb) / BOARD_T, sNow, HATCH[1]);
  if (t < tL) return { ...along(B.s, B.lat), x: B.pad.x, y: B.pad.y, s: sNow };
  if (t < tS) { const u = capU(t - tL); return { ...along(B.s, B.lat), x: lerp(B.pad.x, Z.pad.x, u), y: lerp(B.pad.y, Z.pad.y, u), a: Math.PI / 2, s: sNow }; }   // down to the Earth
  const tTow = tOut - CLIMB_T;
  if (t < tTow) { const f = ease((t - tS - BOB) / Math.max(0.1, tTow - tS - BOB)); return { ...along(Z.s), x: lerp(Z.pad.x, F.x, f), y: lerp(Z.pad.y, F.y, f), a: Math.atan2(F.y - Z.pad.y, F.x - Z.pad.x), s: sNow }; }   // afloat, towed in
  return rollOut(F, z.sOut + 10, c.cN, ease((t - tTow) / CLIMB_T), sNow);   // out of the hatch and up the slipway
}

// the run-off where a kart is (race.js's dust): Moon dust, else grass
export function offCol(c) { const z = c.T.mech.rocket; return z && onMoon(z, c.s) ? '#d3d0c8' : c.T.theme.grass; }
// the Moon grips less (race-mechanics.js mechGrip)
export function rocketGrip(c) { const z = c.T.mech.rocket; return !z || !onMoon(z, c.s) ? 1 : MOON_GRIP; }
// how far ahead along the road an item may take you (an Overclock's aim): never into a row
export function skipLimit(c) {
  const z = c.T.mech && c.T.mech.rocket; if (!z) return Infinity;
  const R = rowsOf(this), k = rowAhead(z, c.s); if (k < 0) return Infinity;
  return Math.max(0, (k ? R.sRet0 : R.sRow0) - 400 - c.s);
}
// the line (mechLine): nearing a row, over to your bay's side (out of the bays' lanes if heading further on)
export function rocketLine(c, tgt) {
  const z = c.T.mech && c.T.mech.rocket; if (!z || c.flyT > 0) return tgt;
  // the row catches you anywhere across the road; this just makes the swing onto the ramp short
  const k = rowAhead(z, c.s); if (k < 0) return tgt;
  const R = rowsOf(this), B = (k ? R.rbays : R.bays)[bayOf(this, c, k)], ds = B.s - c.s; if (ds > 900 || ds < -200) return tgt;
  return lerp(tgt, B.lat, clamp((900 - ds) / 500, 0, 1));
}

// a bot's plan (race-mechanics.js): the grip it expects on the Moon
export function rocketPlan(c, plan) {
  const z = c.T.mech.rocket; if (!z) return;
  if (c.s > z.sGate - 1500 && c.s < z.sRetEnd + 100) plan.grip = s => !onMoon(z, s) ? 1 : MOON_GRIP;
}
// A bot at a row: nothing to brake for; c.padNear only holds a boost until after the ride (the ride would clear it).
export function rocketAI(c, skill, brake, allowed) {
  const z = c.T.mech.rocket; c.padNear = false; if (!z) return allowed;
  const k = rowAhead(z, c.s); if (k < 0) return allowed;
  const R = rowsOf(this), B = (k ? R.rbays : R.bays)[bayOf(this, c, k)], ds = B.s - c.s;
  c.padNear = ds < 260 && ds > -200;
  return allowed;
}
