// Kernel Kart: the mass driver (Moonshot's Moon). A magnetic launch rail: a line of coil rings over a long straight,
// charging and firing on a beat (a pure function of the race clock: no race state, every screen works it out the same).
//   - charging (amber): the rings light one after another from the far end back to the entry, so you can see how long
//     until it fires. Drive in now and nothing happens: it's a straight like any other.
//   - firing (green, `fire` s): drive in through the first ring now and you're launched, flung up to LAUNCH × your top
//     speed and carried down the rail by its coils (your speed held, easing off a little toward its end).
//   - discharging (red, `red` s): the field reverses as it dumps its charge. Drive in now and it grabs you: most of your
//     speed gone and a wobble.
// So the call out of the corner before it: floor it if you'll make the green, lift a little to arrive just as it turns
// green (lift too much and you're into the red; too little and it's still charging, the lift for nothing), or don't
// bother and drive through while it charges. Bots (driverAI) simulate their run in at a few speeds and take whichever
// is quickest counting the launch's gain and the red's cost, with a timing error by skill.
// Per kart (plain numbers, online-safe): c.mdV (the launch speed it's carried at while on the rail), c.mdT (when).
import { clamp } from './core.js';
import { trackSample, vmaxAt } from './geometry.js';
import { blockedByShield, phased } from './rules.js';
import { nearestS } from './race-mechanics.js';

export const LAUNCH = 1.85;       // launched to this × your own top speed
const HOLD_END = 0.9;             // the coils hold you at the launch speed, easing to this share of it by the rail's end
const RED_KEEP = 0.35, RED_SPIN = 0.55;   // into the red: this share of your speed kept, and a wobble
const GAIN = 1.2, PEN = 1.8;      // what a bot reckons a launch is worth and the red costs (s; measured: see docs/tracks.md)
const LOOK = 800;                 // a bot plans its run in from this far out (the corner before it: further back it can't judge it)

// driver: { from, to, period, fire, red, phase, rings } (layout units): the first ring (the entry) and the rail's end
export function buildDriver(T) {
  const d = T.def.driver; if (!d) return null;
  const sc = T.def.scale, s0 = nearestS(T, d.from[0] * sc, d.from[1] * sc), s1 = nearestS(T, d.to[0] * sc, d.to[1] * sc), n = d.rings || 9;
  const o = { s0, s1, period: d.period || 5, fire: d.fire || 0.9, red: d.red || 1.1, phase: d.phase || 0, n, rings: [] };
  o.charge = o.period - o.fire - o.red;
  for (let k = 0; k < n; k++) { const s = s0 + (s1 - s0) * k / (n - 1), q = trackSample(T, s); o.rings.push({ k, s, x: q.x, y: q.y, tx: q.tx, ty: q.ty, nx: q.nx, ny: q.ny, hw: q.hw }); }
  return o;
}
// where in its cycle the driver is at time t: st 0 charging (f: how far through), 1 firing, 2 red; u: seconds into the cycle
export function driverAt(o, t) {
  const u = (((t + o.phase) % o.period) + o.period) % o.period;
  if (u < o.charge) return { st: 0, f: u / o.charge, u };
  if (u < o.charge + o.fire) return { st: 1, f: (u - o.charge) / o.fire, u };
  return { st: 2, f: (u - o.charge - o.fire) / o.red, u };
}
// how far a cycle phase u (seconds) is from the middle of the green, signed (-period/2..period/2)
const fromGreen = (o, u) => { let d = u - (o.charge + o.fire / 2); d -= Math.round(d / o.period) * o.period; return d; };

// one car, one frame: through the first ring (launched, or grabbed by the red), and carried down the rail
export function driverCar(c, dt, prevS) {
  const o = c.T.mech.driver; if (!o || c.finished) return;
  if (c.mdV > 0) {
    if (c.s < o.s0 - 40 || c.s > o.s1 || c.spinT > 0) c.mdV = 0;   // off the end of the rail (or knocked off it)
    else if (c.air <= 0 && !c.off) { const f = clamp((c.s - o.s0) / (o.s1 - o.s0), 0, 1); c.speed = Math.max(c.speed, c.mdV * (1 - (1 - HOLD_END) * f)); }
    return;
  }
  if (!(prevS < o.s0 && c.s >= o.s0) || c.air > 0 || phased(c) || c.oc > 0) return;
  const P = driverAt(o, this.time);
  if (P.st === 1) {   // launched
    c.mdV = c.top * LAUNCH; c.mdT = this.time; c.speed = Math.max(c.speed, c.mdV);
    this.fxBoost(c); this.fxRing(c.x, c.y, '#5cf2a0', 80, 0.4, 6); this.fxSparks(c.x, c.y, 12, '#9dffcf', 220);
    this.sound('launchRail', c, c.human ? 1 : 0.5);
  } else if (P.st === 2) {   // grabbed by the red
    c.hitCd = Math.max(c.hitCd, 0.8);
    if (blockedByShield(this, c)) { c.speed *= 0.7; return; }
    c.speed *= RED_KEEP; c.spinT = Math.max(c.spinT, RED_SPIN); c.squash = 1;
    this.fxHit(c, '#ff4d4d', 'zap');
  }
}

// ---------------------------------------------------------------- the player's gauge, and the bots
// when a kart would get to the first ring flat out from here (as far as the corners allow; ds: how far it is), and the
// cycle phase then. Pure: the art uses it for the gauge.
export function arrival(c, o, now, v1 = Infinity, v2 = Infinity, tSw = Infinity, grip = 1, brake = 400, cap = null) {
  const T = c.T, h = 1 / 30, top = c.top * (c.slip ? 1.1 : 1);
  let s = c.s, v = c.speed, t = 0;
  for (let n = 0; n < 400 && s < o.s0; n++) {
    let tgt = t < tSw ? v1 : v2;
    if (cap) tgt = Math.min(tgt, cap[Math.min(cap.length - 1, Math.max(0, Math.floor((s - c.s) / 8)))]);
    else { const vm = vmaxAt(T, s + Math.min(60, v * 0.3), c.grip * grip); tgt = Math.min(tgt, vm); }
    if (v < tgt) v = Math.min(tgt, v + (v < top ? c.acc : -c.acc * 0.5) * h); else v = Math.max(tgt, v - brake * h);
    s += v * h; t += h;
  }
  return { t, u: driverAt(o, now + t).u, v };
}
// a bot: the speed to hold now so it arrives at the first ring when it pays most (rechecked every 0.1 s)
export function driverAI(c, skill, brake, allowed) {
  const o = c.T.mech.driver; if (!o) return allowed;
  const ds = o.s0 - c.s; if (ds < 0 || ds > LOOK || c.mdV > 0) return allowed;
  c.hazNear = c.hazNear || ds < 700;   // (no boosts just before it: a boost fired after the launch is wasted anyway)
  const ai = c.ai, now = this.time;
  if (ai.mdT !== undefined && now - ai.mdT < 0.1 && Math.abs(c.s - ai.mdS) < 80) return Math.min(allowed, ai.mdV);
  if (ai.mdE === undefined) ai.mdE = (c.rng() * 2 - 1) * clamp((1.08 - skill) * 1.2, 0.02, 0.22);   // its timing error (s), once
  const m = 0.06 + (1.1 - skill) * 0.5;   // how far inside the green it wants to be (s)
  const cap = new Float32Array(Math.ceil(ds / 8) + 2), G = c.grip * this.rocketGrip(c);
  for (let i = 0; i < cap.length; i++) { let v = 1e4; for (let e = 0; e <= 400; e += 25) { const vm = vmaxAt(c.T, c.s + i * 8 + e, G) * skill; v = Math.min(v, Math.sqrt(vm * vm + 2 * brake * e)); } cap[i] = v; }
  let best = Infinity, vb = allowed;
  const score = (v1, v2, tSw, cmd) => {
    const A = arrival(c, o, now + ai.mdE, v1, v2, tSw, 1, brake, cap), d = fromGreen(o, A.u), hw = o.fire / 2;
    let sc = A.t;
    if (Math.abs(d) < hw - m) sc -= GAIN;   // in the green
    else if (d > -hw - m && d < o.red + hw + m && d > 0) sc += PEN;   // into (or too near) the red
    else if (d >= -hw - m && d <= 0) sc += PEN * 0.6;   // just before it fires: too close to call
    if (sc < best - 1e-6) { best = sc; vb = cmd; }
  };
  const top = 1e4;
  score(top, top, Infinity, top);
  for (let v = Math.min(allowed, c.top * 1.1) - 20; v > 40; v -= 20) { score(v, v, Infinity, v); for (const w of [0.5, 1, 1.5, 2.2]) score(v, top, w, v); }
  ai.mdT = now; ai.mdS = c.s; ai.mdV = vb;
  return Math.min(allowed, vb);
}
