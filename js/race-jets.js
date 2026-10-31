// Gateway 8080's jets (`jets`): an airliner every 9-14 s (race.rng timetable) taxis in off the map edge, crossing the
// road (Bravo at the chicane, Charlie on the Cargo Road), holds on the runway, runs up and takes off. Its fuselage and
// gear are solid (bowled aside and spun; crossing lights flash). Its blast is a cone behind the engines scaled by
// thrust: along the road it slingshots you past top speed (nearly full power, just behind) or holds you back; across it
// shoves you (light karts more) against the kerb to scrape, never off the road.
// The call: beat a jet across or wait (and maybe its blast too); on the Runway Straight be there as one goes, and lift in
// time for the Blast Fence turn.
// race.planes: a short list of plain-number departures (taxiway, entry time, taxi speed, hold, acceleration), added from
// race.rng and dropped once gone; positions, thrust and blast follow from those and the clock.
import { Math } from './detmath.js';   // deterministic maths, the same on every computer (detmath.js)
import { clamp } from './core.js';
import { trackSample, vmaxAt, wrapS } from './geometry.js';
import { blockedByShield, untouchable } from './rules.js';

export const BODY_L = 340;                 // a jet, nose to tail (world units; it's about as wide wingtip to wingtip)
const HIT_L = 158, HIT_W = 24;             // the solid part: the fuselage and gear (half-length, half-width)
export const EXHAUST = 30;                 // the blast starts this far behind the jet's middle (its engines)
const W0 = 95, SPREAD = 0.42;              // the blast's half-width at the engines, and how fast it widens behind
const R_IDLE = 260, R_FULL = 1450;         // how far back it reaches: R_IDLE + R_FULL x thrust
export const TAXI_K = 0.45;                // thrust taxiing (a jet's runup at the hold goes from this to 1)
const SLING = 1.0;                         // a full slingshot (slingGate) takes you to this much over your top speed...
const SLING_A = 800;                       // ...pushing you toward it this hard (per unit of it)
const SIDE_V = 340;                        // a full blast across the road shoves you sideways this fast
const SCRAPE = 420, KNOCK = 0.9;           // pressed against the kerb: speed lost per second (and the knock as you hit it)
const VR = 600, CLIMB = 0.14, VMAX = 950;  // lifting off at VR, then climbing at this slope, up to this speed
const DECEL = 90;                          // a taxiing jet stops at its hold this gently
export const WARN = 2.4;                   // a crossing's lights flash this long before a jet reaches the road
const GAP = [9, 14];                       // seconds between one jet rolling and the next
const r3 = x => Math.round(x * 1000) / 1000;   // (the snapshots round to this, so the host keeps them so too)
const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);

// ---------------------------------------------------------------- the airport's ways
// an open path through points [x, y, r] (layout units, r: the turn there), every 4 world units: x, y, heading
function buildPath(P, sc) {
  const raw = [[P[0][0] * sc, P[0][1] * sc]];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1], r = (b[2] || 60) * sc;
    const ux = a[0] - b[0], uy = a[1] - b[1], la = Math.hypot(ux, uy), vx = c[0] - b[0], vy = c[1] - b[1], lb = Math.hypot(vx, vy);
    const phi = Math.acos(clamp((ux * vx + uy * vy) / (la * lb), -1, 1)), t = Math.min(r / Math.tan(phi / 2), la * sc / 2, lb * sc / 2);
    const sx = b[0] * sc + ux / la * t, sy = b[1] * sc + uy / la * t, ex = b[0] * sc + vx / lb * t, ey = b[1] * sc + vy / lb * t;
    for (let k = 0; k <= 12; k++) { const f = k / 12, mx = b[0] * sc; const my = b[1] * sc;   // a quadratic bend from the arc's start to its end (near enough a circle for a jet)
      raw.push([(1 - f) * (1 - f) * sx + 2 * f * (1 - f) * mx + f * f * ex, (1 - f) * (1 - f) * sy + 2 * f * (1 - f) * my + f * f * ey]); }
  }
  const e = P[P.length - 1]; raw.push([e[0] * sc, e[1] * sc]);
  const xs = [], ys = [], hs = []; let prev = raw[0], acc = 0; xs.push(prev[0]); ys.push(prev[1]);
  for (let i = 1; i < raw.length; i++) {
    let q = raw[i], dx = q[0] - prev[0], dy = q[1] - prev[1], d = Math.hypot(dx, dy);
    while (acc + d >= 4) { const t = (4 - acc) / d; prev = [prev[0] + dx * t, prev[1] + dy * t]; xs.push(prev[0]); ys.push(prev[1]); dx = q[0] - prev[0]; dy = q[1] - prev[1]; d = Math.hypot(dx, dy); acc = 0; }
    acc += d; prev = q;
  }
  for (let i = 0; i < xs.length; i++) { const a = Math.max(0, i - 1), b = Math.min(xs.length - 1, i + 1); hs.push(Math.atan2(ys[b] - ys[a], xs[b] - xs[a])); }
  return { x: xs, y: ys, h: hs, L: (xs.length - 1) * 4 };
}
// where a taxiway crosses the road (each route has its own mech): u along the taxiway, s on the road
function crossingsOf(T, P) {
  const out = [];
  let inside = false, u0 = 0;
  for (let i = 0; i < P.x.length; i += 2) {
    let bd = 1e18, bi = 0; for (let j = 0; j < T.N; j += 3) { const d = Math.pow(T.pts[j][0] - P.x[i], 2) + Math.pow(T.pts[j][1] - P.y[i], 2); if (d < bd) { bd = d; bi = j; } }
    const on = Math.sqrt(bd) < T.hw[bi] + 4;
    if (on && !inside) { inside = true; u0 = i * 4; }
    if (!on && inside) { inside = false; const u = (u0 + i * 4) / 2, k = Math.round(u / 4); let b2 = 1e18, s = 0; for (let j = 0; j < T.N; j++) { const d = Math.pow(T.pts[j][0] - P.x[k], 2) + Math.pow(T.pts[j][1] - P.y[k], 2); if (d < b2) { b2 = d; s = j * 2; } } out.push({ u0, u1: i * 4, u, s, x: P.x[k], y: P.y[k] }); }
  }
  return out;
}

// called once per road (race-mechanics.js): the runway, the taxiways and where they cross this road, the blast fence
export function buildJets(T) {
  const d = T.def.jets; if (!d) return null;
  const sc = T.def.scale, [[ax, ay], [bx, by], hw] = d.runway, rl = Math.hypot(bx - ax, by - ay);
  const runway = { ax: ax * sc, ay: ay * sc, bx: bx * sc, by: by * sc, hw: hw * sc, ux: (ax - bx) / rl, uy: (ay - by) / rl };   // (u: the way a jet rolls: from the far end, b, toward a)
  const taxi = Object.keys(d.taxi).map(k => { const P = buildPath(d.taxi[k], sc); return Object.assign(P, { name: k, cross: crossingsOf(T, P) }); });
  const fence = d.fence ? { x0: d.fence[0][0] * sc, y0: d.fence[0][1] * sc, x1: d.fence[1][0] * sc, y1: d.fence[1][1] * sc } : null;
  // where this road runs under the runway (in the tunnel nothing up there touches you)
  const under = [], rl2 = Math.hypot(runway.bx - runway.ax, runway.by - runway.ay);
  let in0 = -1;
  for (let i = 0; i <= T.N; i++) {
    const p = T.pts[i % T.N], dx = p[0] - runway.bx, dy = p[1] - runway.by, a = dx * runway.ux + dy * runway.uy, w = Math.abs(-dx * runway.uy + dy * runway.ux);
    const inside = i < T.N && a > -60 && a < rl2 + 60 && w < runway.hw + 60;
    if (inside && in0 < 0) in0 = i * 2; if (!inside && in0 >= 0) { under.push([in0, i * 2]); in0 = -1; }
  }
  return { runway, taxi, fence, under };
}

// ---------------------------------------------------------------- the timetable
// a departure: taxiway k, in at t0, taxiing at vt, holding `hold` to run up, rolling at `acc`. Its taxi time to the hold:
const taxiTime = (P, vt) => (P.L - vt * vt / (2 * DECEL)) / vt + vt / DECEL;
function makeJet(J, rng, tRoll, id) {
  const k = rng() < 0.6 ? 0 : Math.min(1, J.taxi.length - 1), vt = r3(185 + 45 * rng()), hold = r3(1.8 + 1.4 * rng()), acc = Math.round(230 + 70 * rng());
  return { id, k, t0: r3(tRoll - hold - taxiTime(J.taxi[k], vt)), vt, hold, acc };
}
// the first jet rolls a few seconds after GO, each next 9-14 s after; added while the last is under 40 s away, the long
// gone dropped, so the list stays short
export function jetsUpdate() {
  const J = this.track.mech.jets; if (!J || this.calm) return;   // (calm, a time trial: no departures, race.planes unset; the jets stay at their gates)
  const L = this.planes || (this.planes = []);
  while (!L.length || rollT(J, L[L.length - 1]) < this.time + 40) {
    const last = L[L.length - 1], tr = last ? rollT(J, last) + GAP[0] + this.rng() * (GAP[1] - GAP[0]) : 3.6 + 4 + this.rng() * 5;
    L.push(makeJet(J, this.rng, tr, last ? last.id + 1 : 1));
  }
  while (L.length && rollT(J, L[0]) + 9 < this.time) L.shift();   // (gone: off the map in the climb)
  if (!this.started) return;
  // the run-up and the roll, heard from the jet: the engines spooling up at the hold, then the roar as it goes
  for (const P of L) {
    const tr = rollT(J, P);
    if (this.time >= tr - P.hold && (this.jetSpool || 0) < P.id) { this.jetSpool = P.id; jetAt(J, P, this.time); this.sound('jetSpool', { x: PX, y: PY }, 1); }
    if (this.time >= tr && (this.jetRoll || 0) < P.id) { this.jetRoll = P.id; jetAt(J, P, this.time); this.sound('jetRoar', { x: PX, y: PY }, 1); }
  }
}
export const rollT = (J, P) => P.t0 + taxiTime(J.taxi[P.k], P.vt) + P.hold;

// where jet P is at time t: PX, PY, heading PH, height PZ, thrust PK, speed PV (globals, no allocation: hot path).
// false while not on the map yet or long gone
export let PX = 0, PY = 0, PH = 0, PZ = 0, PK = 0, PV = 0;
export function jetAt(J, P, t) {
  const a = t - P.t0; if (a < 0) return false;
  const W = J.taxi[P.k], tt = taxiTime(W, P.vt), R = J.runway;
  if (a < tt) {                                        // taxiing (and stopping at the hold)
    const tc = tt - P.vt / DECEL, u = a < tc ? P.vt * a : P.vt * tc + P.vt * (a - tc) - 0.5 * DECEL * Math.pow(a - tc, 2);
    const f = Math.min(u, W.L) / 4, i = Math.min(Math.floor(f), W.x.length - 2), g = f - i;
    PX = W.x[i] + (W.x[i + 1] - W.x[i]) * g; PY = W.y[i] + (W.y[i + 1] - W.y[i]) * g;
    let dh = W.h[i + 1] - W.h[i]; if (dh > Math.PI) dh -= 2 * Math.PI; if (dh < -Math.PI) dh += 2 * Math.PI; PH = W.h[i] + dh * g;
    PZ = 0; PK = TAXI_K; PV = a < tc ? P.vt : Math.max(0, P.vt - DECEL * (a - tc)); return true;
  }
  const hx = W.x[W.x.length - 1], hy = W.y[W.y.length - 1];
  PH = Math.atan2(R.uy, R.ux);
  if (a < tt + P.hold) { PX = hx; PY = hy; PZ = 0; PV = 0; PK = TAXI_K + (1 - TAXI_K) * Math.pow(smooth((a - tt) / P.hold), 3); return true; }   // holding, running up (the engines spool up at the end)
  const r = a - tt - P.hold, t1 = (VMAX - 0) / P.acc, u = r < t1 ? 0.5 * P.acc * r * r : 0.5 * P.acc * t1 * t1 + VMAX * (r - t1);   // rolling
  PV = Math.min(VMAX, P.acc * r); PX = hx + R.ux * u; PY = hy + R.uy * u; PK = 1;
  const uR = VR * VR / (2 * P.acc); PZ = u > uR ? (u - uR) * CLIMB : 0;
  return u < 7000;
}

// in the tunnel under the runway?
export const underRunway = (J, s) => J.under.some(([a, b]) => s >= a && s <= b);

// ---------------------------------------------------------------- the blast
// the blast at (x, y) at time t from every jet: BX, BY (direction, strength as length up to 1), and SX, SY, the part
// that slingshots you (slingGate)
export let BX = 0, BY = 0, SX = 0, SY = 0;
export function blastAt(J, L, x, y, t) {
  BX = 0; BY = 0; SX = 0; SY = 0; if (!L) return 0;
  for (const P of L) {
    if (!jetAt(J, P, t)) continue;
    const g = plumeAt(J, x, y); if (g <= 0) continue;
    const ux = -Math.cos(PH), uy = -Math.sin(PH), k = g * slingGate();
    BX += ux * g; BY += uy * g; SX += ux * k; SY += uy * k;
  }
  return Math.hypot(BX, BY);
}
// the slingshot share of plumeAt's last look: engines near full power, within SL_R behind, not yet racing away (fades by
// SL_V). A short window: be just behind a jet as it goes
const SL_R = 1400, SL_V = 900;
export let PB = 0;   // (how far behind the engines plumeAt last looked)
export const slingGate = () => smooth((PK - 0.7) / 0.3) * smooth((SL_R - PB) / 400) * clamp(1 - PV / SL_V, 0, 1);
// the blast of the jet jetAt last placed, at (x, y): 0..1
export function plumeAt(J, x, y) {
  if (PZ > 60) return 0;
  const ch = Math.cos(PH), sh = Math.sin(PH), ex = PX - ch * EXHAUST, ey = PY - sh * EXHAUST;
  const dx = x - ex, dy = y - ey, back = -(dx * ch + dy * sh); if (back < 0) return 0;
  const R = R_IDLE + R_FULL * PK; if (back > R) return 0; PB = back;
  const w = Math.abs(-dx * sh + dy * ch), hw = W0 + SPREAD * back; if (w > hw) return 0;
  if (J.fence && cuts(J.fence, ex, ey, x, y)) return 0;   // behind the blast fence
  return PK * Math.pow(1 - back / R, 0.7) * smooth((hw - w) / (0.35 * hw)) * (1 - PZ / 60) * (1 - PV / 1300);   // (a jet racing away drags its blast after it: weaker the faster it goes)
}
// does the segment (ax, ay)-(bx, by) cross the fence?
function cuts(F, ax, ay, bx, by) {
  const d = (bx - ax) * (F.y1 - F.y0) - (by - ay) * (F.x1 - F.x0); if (Math.abs(d) < 1e-9) return false;
  const u = ((F.x0 - ax) * (F.y1 - F.y0) - (F.y0 - ay) * (F.x1 - F.x0)) / d, v = ((F.x0 - ax) * (by - ay) - (F.y0 - ay) * (bx - ax)) / d;
  return u > 0 && u < 1 && v > 0 && v < 1;
}
// is a body at (x, y) (half length l, half width w, heading h) against jet P's fuselage as jetAt last placed it?
function touches(x, y, l, w, h, m = 0) {
  if (PZ > 2) return false;
  const ch = Math.cos(PH), sh = Math.sin(PH), dx = x - PX, dy = y - PY, u = dx * ch + dy * sh, v = -dx * sh + dy * ch;
  const rel = Math.abs(Math.sin(h - PH));   // (a kart side-on to it reaches across it with its length)
  return Math.abs(u) < HIT_L + l * (1 - rel) + w * rel + m && Math.abs(v) < HIT_W + l * rel + w * (1 - rel) + m;
}

// ---------------------------------------------------------------- one kart
// what a jet does to a kart: the fuselage bowls it aside; the blast carries it on, holds it back or shoves it across
export function jetsCar(c, dt) {
  const T = c.T, J = T.mech.jets, L = this.planes; if (!J || !L || c.finished) return;
  if (c.human) jetWarn(this, c, J, L);
  if (c.air > 0 || untouchable(c) || underRunway(J, c.s)) { c.blast = 0; return; }
  const t = this.time;
  for (const P of L) {
    if (!jetAt(J, P, t) || (c.jetCd || 0) > t || !touches(c.x, c.y, c.L / 2, c.W / 2, c.heading)) continue;
    c.jetCd = t + 1.6;
    const ch = Math.cos(PH), sh = Math.sin(PH), side = Math.sign(-(c.x - PX) * sh + (c.y - PY) * ch) || 1;
    c.skx += -sh * side * 300 + ch * PV * 0.6; c.sky += ch * side * 300 + sh * PV * 0.6;
    if (blockedByShield(this, c)) { c.speed *= 0.6; continue; }
    c.speed = 0; c.spinT = Math.max(c.spinT, 2); c.hitCd = Math.max(c.hitCd, 2.5);
    this.fxHit(c, '#e3e8ef', 'jet');
  }
  if (c.oc > 0 || c.ff > 0) return;
  const g = blastAt(J, L, c.x, c.y, t); c.blast = g > 0.12 ? +g.toFixed(2) : 0;
  if (g <= 0) return;
  const q = trackSample(T, c.s), along = BX * q.tx + BY * q.ty, side = BX * q.nx + BY * q.ny, sl = SX * q.tx + SY * q.ty;
  // along the road: a slingshot toward your top speed and past it (behind a jet as it goes, on the gas), or held back
  // from it (a jet blowing against you)
  if (sl > 0 && c.gas) { const vT = c.top * (1 + SLING * sl); if (c.speed < vT) c.speed = Math.min(vT, c.speed + SLING_A * sl * dt); }
  else if (along < 0) { const vT = c.top * (1 + SLING * along); if (c.speed > vT) c.speed = Math.max(vT, c.speed + SLING_A * along * dt); }
  // across it: shoved sideways (a heavy kart less), and up against the kerb it scrapes along it
  const push = SIDE_V * side / Math.sqrt(c.weight);
  c.x += q.nx * push * dt; c.y += q.ny * push * dt; c.lat += push * dt;
  if (c.human && g > 0.35 && t - (c.blastSnd ?? -9) > 1.5) { c.blastSnd = t; this.sound('blast', c, 0.8); }
  const lim = q.hw - c.W * 0.35 - 1, out = Math.sign(c.lat);
  if (Math.abs(c.lat) <= lim || push * out <= 0 || Math.abs(c.lat - push * dt) > lim + 0.5) return;   // (only the blast's own push is stopped at the kerb)
  const back = c.lat - out * lim; c.x -= q.nx * back; c.y -= q.ny * back; c.lat = c.prevLat = out * lim;
  if (c.speed < 40) return;
  if (t - (c.jetWallT ?? -9) > 0.4) { c.speed *= KNOCK; this.fxSparks(c.x + q.nx * out * c.W * 0.5, c.y + q.ny * out * c.W * 0.5, 8, '#ffd166', 170); }
  c.jetWallT = t;
  c.speed = Math.max(0, c.speed - (SCRAPE + 2 * Math.abs(push)) * dt);
  if ((c.scrapeFx = (c.scrapeFx || 0) - dt) <= 0) {
    c.scrapeFx = 0.07; this.fxSparks(c.x + q.nx * out * c.W * 0.5, c.y + q.ny * out * c.W * 0.5, 3, '#ffd166', 120);
    if (c.human && t - (c.scrapeSnd || -9) > 0.35) { c.scrapeSnd = t; this.sound('scrape', c, 0.7); }
  }
}
// a player nearing a crossing a jet will be on (or blowing across) when they arrive: a sign; nearing a slingshot: the
// tailwind sign
function jetWarn(race, c, J, L) {
  const T = c.T, t = race.time;
  if (t - (c.slingWarn ?? -99) > 8) for (let d = 300; d <= 1100; d += 100) {
    const q = trackSample(T, c.s + d);
    if (blastAt(J, L, q.x, q.y, t + d / Math.max(c.speed, 250)) > 0.2 && SX * q.tx + SY * q.ty > 0.3) { c.slingWarn = t; race.feed('warn', 'tail', c); break; }
  }
  for (const W of J.taxi) for (const x of W.cross) {
    let ds = x.s - c.s; if (ds < 0) ds += T.L; if (ds > 900 || ds < 120) continue;
    if (c.jetWarn === x && ds > 200) continue;
    if (crossingBusy(J, L, W, x, t + ds / Math.max(c.speed, 200), 0.6)) { c.jetWarn = x; race.feed('warn', 'jet', c); }
  }
}
// a bot holding a boost: a crossing within about two boosted seconds that a jet will be on by then? Not now, it would
// launch it into the jet
export function jetShy(race, c) {
  const T = c.T, J = T.mech && T.mech.jets, L = race.planes; if (!J || !L) return false;
  for (const W of J.taxi) for (const x of W.cross) {
    let ds = x.s - c.s; if (ds < 0) ds += T.L; if (ds > c.top * 2.6) continue;
    if (crossingBusy(J, L, W, x, race.time + ds / (c.top * 1.3), 1.2)) return true;
  }
  return false;
}
// is a jet on taxiway W across crossing x (or within `pad` s of it) at time t?
export function crossingBusy(J, L, W, x, t, pad = 0) {
  const k = J.taxi.indexOf(W);
  for (const P of L) {
    if (P.k !== k) continue;
    const a = t - P.t0, u0 = x.u0 - HIT_L - 40, u1 = x.u1 + HIT_L + 40 + 300;   // (its body, then the blast trailing it)
    if (a * P.vt > u0 - pad * P.vt && a * P.vt < u1 + pad * P.vt) return true;
  }
  return false;
}
// a crossing's lights: on from WARN before a jet's nose gets to the road until its blast has blown past
export function crossingLit(J, L, W, x, t) {
  const k = J.taxi.indexOf(W);
  for (const P of L || []) {
    if (P.k !== k) continue;
    const u = (t - P.t0) * P.vt;
    if (u > x.u0 - HIT_L - P.vt * WARN && u < x.u1 + HIT_L + 420) return true;
  }
  return false;
}

// the line in a crosswind: it holds upwind of where it would be, as far as the steering can lean into it
export function jetsLine(c, tgt, edgeIn) {
  const J = c.T.mech.jets; if (!J || !this.planes || !(c.blast > 0)) return tgt;
  const q = trackSample(c.T, c.s); blastAt(J, this.planes, c.x, c.y, this.time);
  const push = SIDE_V * (BX * q.nx + BY * q.ny) / Math.sqrt(c.weight);
  return tgt - clamp(50 * push / Math.max(c.speed, 60), -edgeIn * 0.6, edgeIn * 0.6);
}

// ---------------------------------------------------------------- the bots
// A bot tries a range of speeds for the next few seconds against the known timetable and the blasts, and takes the one
// that gets furthest without hitting a jet: it waits for or beats a crossing, lifts for a strong crosswind or goes
// through, and a good one lifts a touch to catch a slingshot when that pays. c.jetNear holds its boosts while a jet's in the way.
const HZ = 4.5, H = 0.075, NSTEP = Math.round(HZ / H);
const fc = new WeakMap();   // per race: where each jet will be at each step from now (worked out once a frame)
function forecast(race, J) {
  let F = fc.get(race);
  if (F && F.t === race.time) return F;
  F = { t: race.time, jets: [] };
  for (const P of race.planes) {
    const pose = new Float32Array(NSTEP * 5); let any = false;
    for (let j = 0; j < NSTEP; j++) { if (jetAt(J, P, race.time + j * H)) { any = true; pose.set([PX, PY, PH, PZ, PK], j * 5); } else pose[j * 5 + 3] = 1e4; }
    if (any) F.jets.push(pose);
  }
  fc.set(race, F); return F;
}
export function jetsAI(c, skill, brake, allowed) {
  const T = c.T, J = T.mech.jets, L = this.planes; if (!J) return allowed;
  c.jetNear = false;
  if (!L || !L.length || c.finished) return allowed;
  const F = forecast(this, J); if (!F.jets.length) return allowed;
  // the road ahead, sampled once: where across it the bot may be (now, its line, the middle) and the corner speed limit at
  // each distance (braking in time)
  const D = Math.ceil(Math.max(c.speed, c.top) * 1.4 * HZ / 8) + 2, lim = new Float32Array(D), RX = new Float32Array(D * 4), lats = [c.lat];
  if (c.lineS !== undefined && Math.abs(c.lineS - c.lat) >= 8) lats.push(c.lineS);
  if (Math.abs(c.lat) > 12) lats.push(0);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = D - 1; i >= 0; i--) {
    const q = trackSample(T, c.s + i * 8), vm = vmaxAt(T, c.s + i * 8, c.grip) * skill;
    lim[i] = Math.min(vm, i < D - 1 ? Math.sqrt(Math.pow(lim[i + 1], 2) + 2 * brake * 8) : vm);
    RX[i * 4] = q.x; RX[i * 4 + 1] = q.y; RX[i * 4 + 2] = q.tx; RX[i * 4 + 3] = q.ty;
    x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
  }
  // the jets that can reach that stretch in the next few seconds (by their body or their blast)
  const near = F.jets.filter(p => { for (let j = 0; j < NSTEP; j += 3) { const o = j * 5; if (p[o + 3] > 60) continue; const m = 200 + (R_IDLE + R_FULL * p[o + 4]); if (p[o] > x0 - m && p[o] < x1 + m && p[o + 1] > y0 - m && p[o + 1] < y1 + m) return true; } return false; });
  if (!near.length) return allowed;
  let margin = 12 + (1.12 - skill) * 80, nearD = 1e9, felt = false, tail = false;
  const w2 = Math.sqrt(c.weight), edge = Math.max(4, halfW(T, c.s) - c.W * 0.35 - Math.abs(c.lat));
  const run = (cap, look, until = 99) => {   // (until: hold the cap that long, then as the corners allow)
    let s = 0, v = c.speed, lat = 0, scr = 0;
    for (let j = 0; j < NSTEP; j++) {
      const i = Math.min(D - 1, Math.floor(s / 8)), tgt = Math.min(j * H < until ? cap : 1e4, lim[i]);
      v = v > tgt ? Math.max(tgt, v - brake * H) : v > c.top ? Math.max(c.top, v - c.acc * 0.5 * H) : Math.min(tgt, v + c.acc * H);   // (over its top speed on the gas, it eases back)
      const qx = RX[i * 4], qy = RX[i * 4 + 1], tx = RX[i * 4 + 2], ty = RX[i * 4 + 3], x = qx - ty * c.lat, y = qy + tx * c.lat, hd = Math.atan2(ty, tx);
      let bx = 0, by = 0, sx = 0, sy = 0;
      if (!underRunway(J, c.s + s)) for (const p of near) {
        const o = j * 5; if (p[o + 3] > 60) continue;
        PX = p[o]; PY = p[o + 1]; PH = p[o + 2]; PZ = p[o + 3]; PK = p[o + 4];
        const dd = Math.abs(x - PX) + Math.abs(y - PY);
        if (look && PZ < 2) nearD = Math.min(nearD, dd);
        if (dd < HIT_L + 140 + margin) for (const l of lats) if (touches(qx - ty * l, qy + tx * l, c.L / 2, c.L / 2, hd, margin)) return -1e9 + s;
        const g = plumeAt(J, x, y); if (g > 0) { const k = g * slingGate(); bx -= Math.cos(PH) * g; by -= Math.sin(PH) * g; sx -= Math.cos(PH) * k; sy -= Math.sin(PH) * k; }
      }
      if (bx || by) {
        const along = bx * tx + by * ty, side = -bx * ty + by * tx, sl = sx * tx + sy * ty; if (look && sl > 0.15) tail = true; if (look && (sl > 0.15 || along < -0.15 || lat > edge * 0.4)) felt = true;   // (a blast that could change its mind)
        if (sl > 0) { const vT = c.top * (1 + SLING * sl); if (v < vT && v <= tgt + 1) v = Math.min(vT, v + SLING_A * sl * H); }
        else if (along < 0) { const vT = c.top * (1 + SLING * along); if (v > vT) v = Math.max(vT, v + SLING_A * along * H); }
        lat += SIDE_V * Math.abs(side) / w2 * H;
      }
      lat *= Math.exp(-2.5 * H);   // (drifting across, the steering easing it back)
      if (lat > edge) { v = Math.max(0, v - SCRAPE * H); scr += H; }
      s += v * H;
    }
    const over = v - Math.min(c.top, lim[Math.min(D - 1, Math.floor(s / 8))]);
    return s + (over > 0 ? over * over / (c.acc) : 0) - scr * 40;   // (speed carried past the horizon counts, scraping costs a little more than its speed)
  };
  const top = c.top * 1.4;   // (the corners ahead are in lim: a cap is for the jets)
  let full = run(top, true), best = top, bs = full;
  if (full > -1e8 && !felt) { if (nearD < 700) c.jetNear = true; return allowed; }   // nothing on its way to it: it just drives
  for (let tries = 0; tries < 2; tries++) {
    for (let v = top - 40; v > -20; v -= 40) {
      const cap = Math.max(0, v), sc = run(cap);
      if (sc > bs + 1) { bs = sc; best = cap; }
    }
    if (bs > -1e8) break;
    margin = 0; full = bs = run(top); best = top;   // every speed meets a jet with room to spare: then as near as it really is
  }
  if (bs < -1e8) best = 0;   // and if every speed still meets one: stop
  // a jet's blast down the road ahead: a good bot also tries lifting just a moment (to get there as it goes) then flat out
  if (tail && full > -1e8 && skill > 1) for (const until of [0.4, 0.8, 1.2, 1.6]) for (const k of [0.55, 0.75]) {
    const sc = run(c.top * k, false, until);
    if (sc > bs + 1) { bs = sc; best = c.top * k; }
  }
  // a slower speed only for a slingshot: only a good bot sees that coming, and only if it clearly pays
  if (best < top && full > -1e8) { const need = Math.max(0, (1.06 - skill) * 900) + 25; if (bs - full < need) { best = top; bs = full; } }
  // a jet coming close to its road: no boost (it would launch it at the jet); while waiting, it stops behind anyone already
  // waiting in its lane (or it would shove them in)
  if (best < top - 1 || full < -1e8 || nearD < 700) c.jetNear = true;
  if (best < top - 1) for (const o of this.cars) {
    if (o === c || o.finished || o.T !== T || o.speed > Math.max(80, c.speed * 0.6)) continue;
    let d = o.s - c.s; if (d < 0) d += T.L; if (d > 500 || Math.abs(o.lat - c.lat) > (c.W + o.W) / 2 + 12) continue;
    best = Math.min(best, Math.sqrt(o.speed * o.speed + 2 * brake * Math.max(0, d - (c.L + o.L) / 2 - 22)));
  }
  return Math.min(allowed, best);
}
const halfW = (T, s) => T.hw[Math.min(Math.floor(wrapS(T, s) / 2), T.N - 1)];
