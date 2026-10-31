// Kernel Kart: the Kicker Park (Kernel Pretzel). On a wide straight before a hairpin, kickers fill the right lanes and
// a clear lane runs by the left kerb. On the gas your line rides them (airborne off each; tap off at a lip for a trick
// boost); lift longer than a tap (LANE_T) and the line moves to the clear lane. The call is the last one: fly it fast
// and you land hot at the hairpin. A kicker is a partial-width ramp: launch and lanes here, landing in race.js. No race state.
import { Math } from './detmath.js';   // deterministic maths, the same on every computer (detmath.js)
import { clamp, lerp } from './core.js';
import { halfWAt, trackSample, vmaxAt } from './geometry.js';
import { nearestS } from './race-mechanics.js';

export const KICK_LEN = 84, KICK_H = 15;   // length along the road, height at the lip (drawing, posing)
export const airOf = v => clamp(v / 700, 0.25, 0.56);   // how long you fly off one at speed v
const LANE_T = 0.3;   // off the gas this long (longer than a trick's tap) and your line goes round the next kicker
const PARK = 320;     // the lanes start this far before the first kicker

// kickers: [[x, y, a, b, clear], ...] (layout units): a road point, the span it covers (a to b, shares of the half-width,
// + driver's right) and its clear lane. Built per route (only its own).
export function buildKickers(T) {
  const sc = T.def.scale;
  return (T.def.kickers || []).map(([x, y, a, b, clear]) => {
    const s = nearestS(T, x * sc, y * sc), q = trackSample(T, s), hw = halfWAt(T, s);
    if (Math.hypot(q.x - x * sc, q.y - y * sc) > hw) return null;
    return { s, lat0: a * hw, lat1: b * hw, mid: (a + b) / 2 * hw, clear: clear * hw };
  }).filter(Boolean);
}
const ahead = (T, s0, s) => { let d = s - s0; if (d > T.L / 2) d -= T.L; if (d < -T.L / 2) d += T.L; return d; };
// the next kicker car c's line is for (the one ahead, or the one it's just over), or null outside the park
function nextKicker(c) {
  const K = c.T.mech.kickers; if (!K.length) return null;
  let best = null, bd = 1e9;
  for (const k of K) { const d = ahead(c.T, c.s, k.s); if (d > -12 && d < bd) { bd = d; best = k; } }
  if (!best) return null;
  const first = K.reduce((m, k) => Math.min(m, ahead(c.T, c.s, k.s)), 1e9);
  return first > PARK && bd === first ? null : { k: best, d: bd };
}
// over the next kicker, or round it? A player: over unless they've really lifted. A bot: what it planned (kickerAI).
const over = (race, c, k) => c.human ? c.gas || race.time - (c.gasOffAt ?? -9) < LANE_T : c.ai.kickRound !== k.s;

// one car, one frame: over a kicker's lip (any part of the kart on it), into the air
export function kickerCar(c) {
  const K = c.T.mech.kickers; if (!K.length || !this.started) return;
  if (c.air > 0 || c.jumpCd > 0 || c.speed < 120 || c.off || c.ff > 0 || c.oc > 0 || c.spinT > 0) return;
  for (const k of K) {
    const ds = ahead(c.T, k.s, c.s);
    if (ds <= -8 || ds >= 30 || c.lat < k.lat0 - c.W * 0.3 || c.lat > k.lat1 + c.W * 0.3) continue;
    c.trick = c.human ? (!c.gas && this.time - (c.gasOffAt === undefined ? -9 : c.gasOffAt) < 0.25) : c.rng() < clamp(0.3 + (c.ai.skill - 0.92) * 3, 0.2, 0.85);
    c.landS = null; c.jumpAt = k.s; c.air = c.airT = airOf(c.speed); c.jumpCd = c.air + 0.05;
    this.fxRing(c.x, c.y, '#ffffff', 34, 0.25, 3);
    this.sound(c.trick ? 'trick' : 'jump', c, c.human ? 0.8 : 0.4);
    return;
  }
}

// the steering's line in the park: the kicker lane, or the clear lane once you've lifted
export function kickerLine(c, tgt) {
  const n = c.T.mech.kickers.length && nextKicker(c); if (!n) return tgt;
  const lane = over(this, c, n.k) ? n.k.mid : n.k.clear, w = clamp((PARK + 60 - n.d) / 160, 0, 1);
  return lerp(tgt, lane, w);
}

// a bot: over a kicker if it can land and still make the next corner (no braking in the air), else round it (worse bots
// now and then fly it anyway). Once round one it's off the gas there, so no cap.
export function kickerAI(c, skill, brake, plan) {
  const n = c.T.mech.kickers.length && nextKicker(c); if (!n || c.air > 0) return;
  const T = c.T, { k, d } = n, key = c.lap * 64 + c.T.mech.kickers.indexOf(k);
  if (c.ai.kickKey === key) return;   // decided already
  if (d > 260) return;
  const v = Math.max(c.speed, 60), dl = d + v * airOf(v);
  let ok = true; for (let q = 0; q <= 520 && ok; q += 20) { const vm = vmaxAt(T, c.s + dl + q, c.grip) * skill; if (v > Math.sqrt(vm * vm + 2 * brake * q)) ok = false; }
  const bold = c.rng() < clamp(0.3 - (skill - 0.92) * 2, 0.04, 0.35);   // misjudges it: flies it anyway
  c.ai.kickKey = key; c.ai.kickRound = ok || bold ? null : k.s;
}
