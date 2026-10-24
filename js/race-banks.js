// Kernel Kart: banked corners. A long corner built like a velodrome: flat on the inside half, then the road tilts up
// toward the outside, steeper the higher you go, so the higher you ride the more grip you have. Everywhere else the
// inside line is the quick one; here, arriving hot is rewarded: carry speed and the kart rides up the banking and holds
// it, lift and it drops down to the flat apex and has to go slower. Too hot even for the top and you go over the lip
// (on a seawall, `sea`, that's into the water).
import { clamp } from './core.js';
import { curvAt, halfWAt, trackSample } from './geometry.js';
import { grassSlows } from './rules.js';
import { nearestS } from './race-mechanics.js';


export function buildBanks(T) {
  const sc = T.def.scale;
  return (T.def.banks || []).map(d => {
    const s0 = nearestS(T, d.from[0] * sc, d.from[1] * sc), s1 = nearestS(T, d.to[0] * sc, d.to[1] * sc);
    let k = 0, kMax = 1e-6; for (let s = s0; s <= s1; s += 4) { const kk = curvAt(T, s); k += kk; kMax = Math.max(kMax, Math.abs(kk)); }
    const hw = halfWAt(T, (s0 + s1) / 2);
    return { s0, s1, side: Math.sign(k) || 1, R: 1 / kMax, bank: d.bank || 0.45, sea: !!d.sea, bowl: !!d.bowl, g: d.grip || 1, hw, top: hw - 28 };   // top: the highest lane, clear of the lip; g: how well its ground grips (a crater bowl on the Moon, Moonshot: the Moon's grip, race-rocket.js), for the line and the bots
  });
}
// how much of the banking there is at distance s: 0..1. It eases in over the approach and out past the exit, so it's
// all there for the whole of the corner (the corner's bend starts all at once)
export const BANK_IN = 150, BANK_OUT = 150;
export const bankFade = (z, s) => clamp(Math.min(s - z.s0 + BANK_IN, z.s1 + BANK_OUT - s) / 150, 0, 1);
// a = how far up the banking (0 at the middle of the road, 1 in the top lane): the grip there
export const bankGrip = (z, a) => 1 + z.bank * clamp(a, 0, 1);
// how far up you have to ride at speed v to hold the corner (with `spare` grip to spare): 0 on the flat half (or
// below), > 1 if even the top won't hold you. Solves (1 + B a)(R + a top) = spare v² / G for a.
export const SPARE = 1.15;
export function bankHeight(z, v, G, spare = SPARE) {
  const Q = spare * v * v / G, B = z.bank, h = z.top;
  if (Q <= z.R) return 0;
  const b = B * z.R + h, disc = b * b - 4 * B * h * (z.R - Q);
  return (-b + Math.sqrt(Math.max(0, disc))) / (2 * B * h);
}
// the speed that holds the corner riding at height a
export const bankSpeed = (z, a, G) => Math.sqrt(G * bankGrip(z, a) * (z.R + a * z.top) / SPARE);

// the grip where the car is now (race.js multiplies the car's grip by this). Over the top edge you're on the concrete
// lip of the wall: still banked, so it keeps the top lane's grip (the run-off still slows you), and past it, the sea.
export function bankGripAt(c) {
  let m = 1;
  for (const z of c.T.mech.banks) {
    if (c.s < z.s0 - BANK_IN || c.s > z.s1 + BANK_OUT) continue;
    const a = -z.side * c.lat / z.top;
    if (c.off && a < 0) continue;
    m *= (1 + (bankGrip(z, a) - 1) * bankFade(z, c.s)) / (c.off && grassSlows(c) ? 0.7 : 1);
  }
  return m;
}
// the line: on the banking, the steering aims as high as this speed needs (and no higher), so a fast kart rides up the
// wall on a clean arc instead of sliding there; slower, it's as far in as it can hold on the flat, down to the apex.
// (The usual line can't be used here: it would think the grip up on the wall is there at the apex too.)
//
// The line is one smooth arc, not a target that jumps about with every lift: it's a lane (c.bankL) that slides across
// the banking with a sideways slope (c.bankSl, per unit along) that bends no faster than the kart can follow. Climbing
// costs nothing (you just turn a little less), but stopping a climb takes grip to spare, and at the height your speed
// needs you only have SPARE of it; so it eases up the wall early, from well before the corner where there's grip to
// burn, and settles into its lane without overshooting toward the lip. The height comes from the speed alone (the
// grip a lift adds comes and goes in a blink; the speed it costs is what moves you down).
const OUT = 1.5e-3, LR = 90;   // how quickly the line may bend outward (it only has to turn less), its approach length
export function bankLine(c, tgt, edgeIn) {
  const T = c.T;
  for (const z of T.mech.banks) {
    if (c.s < z.s0 - 350 || c.s > z.s1 + BANK_OUT + 150) continue;
    const f = clamp(Math.min((c.s - (z.s0 - 350)) / 250, (z.s1 + BANK_OUT + 150 - c.s) / 300), 0, 1);
    // (a bot on the approach climbs for the speed it plans to take the corner at, not the speed it'll brake from)
    const G = c.grip * c.gMul * z.g, v = !c.human && c.ai.bankV && c.s < z.s0 ? Math.min(c.speed, c.ai.bankV) : c.speed, Q = SPARE * v * v / G;
    const want = Q <= z.R ? z.side * Math.min(z.R - Q, edgeIn) : -z.side * Math.min(bankHeight(z, v, G), 1) * z.top;
    const goal = tgt + (want - tgt) * f;
    if (c.off || c.bankS === undefined || Math.abs(c.s - c.bankS) > 80) { c.bankL = c.off ? c.lat : c.lineS ?? goal; c.bankSl = 0; c.bankS = c.s; }   // (just arrived, or off the road)
    const ds = Math.max(0, c.s - c.bankS); c.bankS = c.s;
    // the grip to spare for turning in, here, in the lane the line is in now (on the approach: plenty)
    const k = curvAt(T, c.s + 20), kLane = k / Math.max(0.35, 1 - k * c.bankL), a = -z.side * c.bankL / z.top;
    const inn = clamp((G * (1 + (bankGrip(z, a) - 1) * bankFade(z, c.s)) / Math.max(v * v, 1) - Math.abs(kLane)), 0.25e-3, 3e-3);
    const err = goal - c.bankL, dir = Math.sign(err), stop = dir === z.side ? OUT : inn;   // stopping an outward slide takes turning in
    const sd = dir * Math.min(Math.abs(err) / LR, Math.sqrt(2 * stop * Math.abs(err)));
    const dsl = sd - c.bankSl, lim = (Math.sign(dsl) === z.side ? inn : OUT) * ds;
    c.bankSl += clamp(dsl, -lim, lim); c.bankL += c.bankSl * ds;
    tgt = c.bankL;
  }
  return tgt;
}
// in deep water: back on the road at a standstill (on the side you went in from, well clear of the edge), dazed
export function splash(race, c, sideIn) {
  race.fxHit(c, '#4fc3f7', 'splash');   // where you went in
  const T = c.T, q = trackSample(T, c.s), lat = -sideIn * q.hw * 0.25;
  c.lat = c.prevLat = c.lineS = lat; c.x = q.x + q.nx * lat; c.y = q.y + q.ny * lat; c.heading = Math.atan2(q.ty, q.tx);
  c.speed = 0; c.skx = c.sky = 0; c.spinT = 0.9; c.hitCd = 1.5; c.kCmd = 0; c.off = false; c.progress = race.progressOf(c);
}
// over the top of a seawall: into the sea
export function bankCar(c) {
  for (const z of c.T.mech.banks) {
    const ds = z.s0 - c.s;
    if (c.human && c.lap <= 1 && ds > 300 && ds < 900 && !c.bankWarn) { c.bankWarn = true; this.feed('warn', 'bank', c); }
    if (!z.sea || c.s < z.s0 || c.s > z.s1 || c.air > 0 || c.finished || c.spinT > 0 || c.oc > 0) continue;
    if (-z.side * c.lat > halfWAt(c.T, c.s) + 30) splash(this, c, -z.side);
  }
}

// a bot on the banking: rides it at a height that suits how good it is (better bots ride higher, faster), never right
// at the top
export function bankAI(c, skill, brake, plan) {
  for (const z of c.T.mech.banks) {
    const ds = z.s0 - c.s; if (ds > 1500 || c.s > z.s1) continue;
    const a = clamp(0.35 + (skill - 0.92) * 1.6, 0.25, 0.65), G = c.grip * z.g;
    plan.zones.push({ s0: z.s0 - 120, s1: z.s1, v: c.ai.bankV = bankSpeed(z, a, G), vMax: bankSpeed(z, 0.92, G) });
    if (c.s > z.s0 - 120) c.ai.carry = true;   // riding the banking is a slide at the limit by design: don't lift for it
  }
}
