// Kernel Kart: the drift button (experimental). A third key per player (core.js KEYSETS, Input.drift).
//
// Held, the kart drifts toward one side, picked as you press it: the inside of the next corner (within DRIFT.LOOK). The
// rear steps out (c.dYaw: the body turned into the corner, drawn by render.js; the hitbox stays put), its grip grows to
// DRIFT.GRIP (a tighter arc at the same speed, or the same arc faster) and in a corner its line goes in further than
// even that grip would take it (DRIFT.TUCK, in race.js's reach). On a straight it moves your line over to the drift
// side's edge instead (DRIFT.PULL: a box or a bit on that side), fading out as the corner comes. It isn't a steering
// wheel: it only ever pulls toward the inside of the corner coming, and you pay for it: it bleeds speed and cuts your
// top speed (DRIFT.BLEED_*, DRIFT.CUT_*: a little in a corner taken near the limit, more on a straight or against the
// bend), and held too long near top speed it strains (c.dStrain) until the kart spins out. Drifting charges it
// (c.dCharge; fastest in a corner on the gas): the sparks from the rear wheels go blue, then orange, then purple
// (DRIFT.TIERS), and letting go fires a mini-turbo that grows with the tier (c.mtT, c.mtK: extra top speed, a kick of
// acceleration). Running off the road, a hit or a jump loses the charge.
//
// Only in a race with drift on (race.drift: the Drift setting, settings.js; online the host's, in the room's cfg). Bots
// drift too (driftAI, below): the same button through the same rules, held by their own decision instead of a key.
// Nothing here runs for a kart that has never pressed it: a race nobody drifts in, or one with drift off, plays exactly
// as the game did before drifting (test/golden.json).
import { clamp, lerp } from './core.js';
import { curvAt, vmaxAt } from './geometry.js';
import { Input } from './input.js';
import { wetUnder } from './race-rain.js';
import { SKI, skiBotDrift, skiK } from './race-ski.js';

export const DRIFT = {
  MIN_V: 120,        // a drift starts at this speed or more...
  KEEP_V: 85,        // ...and ends below this
  LOOK: 900,         // which side: the inside of the first real corner within this far ahead
  GRIP: 1.5,         // grip × this at a full drift: a tighter arc
  PULL: 0.7,         // on a straight the line moves this share of the way to the drift side's edge (a full drift)...
  TUCK: 0.3,         // ...and in a corner it goes in as far as an arc this much (share) tighter than the kart can make (1.08 normally)
  BLEED_C: 0.04,     // speed lost per second, as a share of speed, drifting in a corner the drift's way...
  BLEED_S: 0.2,      // ...and on a straight (or against the bend)
  CUT_C: 0.03,       // and top speed cut while drifting (share), in a corner...
  CUT_S: 0.1,        // ...and on a straight: flat out down a straight, a drift bleeds you down to 90%
  SLIDE_C: 0.5,      // how far the body turns into it (rad) in a corner, and on a straight
  SLIDE_S: 0.24,
  BUILD: 4.5, FADE: 6,   // how fast a drift sets in and lets go (per second)
  STRAIN_V: 0.75,    // over this share of top speed a drift strains...
  STRAIN_K: 4,       // ...this fast (per second, per unit over)...
  STRAIN_MAX: 2.4,   // ...and spins you out here
  // mini-turbo tiers: charge needed (seconds of drifting in a corner on the gas; a straight charges at 25%, off the gas 60%), boost seconds, extra
  // top speed (share), speed kick on release, spark colour
  TIERS: [[0.4, 0.5, 0.12, 25, '#4fc3ff'], [0.85, 0.8, 0.17, 40, '#ff9a2e'], [1.4, 1.1, 0.22, 55, '#c77dff']],
  // on a wet road (race-rain.js, Neon Overflow), at full wet: the tail slides out this much further and lets go this much
  // slower, it charges this much faster, and it strains (and spins out) this much sooner
  WET_SLIDE: 0.5, WET_FADE: 0.45, WET_CHARGE: 0.6, WET_STRAIN: 0.9,
};
export const driftTier = c => { let t = 0; for (let i = 0; i < DRIFT.TIERS.length; i++) if (c.dCharge >= DRIFT.TIERS[i][0]) t = i + 1; return t; };
export const tierCol = t => t > 0 ? DRIFT.TIERS[t - 1][4] : '#ffffff';
// drawing a drift (render.js, fx.js): the body turns by c.dYaw about a point near its nose, so the rear steps out.
// driftPt: a point on the body (lx forward, ly to the side, in world units) where it is in the world, slide and all.
export const DRIFT_PIVOT = 0.28;   // (share of the length ahead of the centre)
export function driftPt(c, lx, ly) {
  const y = c.dYaw || 0, px = c.L * DRIFT_PIVOT, cy = Math.cos(y), sy = Math.sin(y), ax = lx - px;
  const bx = px + ax * cy - ly * sy, by = ax * sy + ly * cy, ch = Math.cos(c.heading), sh = Math.sin(c.heading);
  return [c.x + bx * ch - by * sh, c.y + bx * sh + by * ch];
}
// the inside of the next corner ahead (+1 / -1: the side of the road, as lat), or the side we're on if none
// (on a ski run, race-ski.js: a glade's weave counts as bends too)
const kAt = (T, c, s) => curvAt(T, s) + (T.mech && T.mech.ski ? skiK(c, s) : 0);
function nextSide(T, c) {
  for (let d = 0; d <= DRIFT.LOOK; d += 15) { const k = kAt(T, c, c.s + d); if (Math.abs(k) > 1 / 700) return Math.sign(k); }
  return c.lat >= 0 ? 1 : -1;
}
// how much of a corner the drift is in, the drift's way: how hard the bend asks this kart to turn at this speed, against
// its own grip (0 a straight, a gentle bend taken slowly or a bend the other way .. 1 a corner taken near the limit)
function cornerness(T, c) {
  let k = 0; for (let d = 0; d <= 90; d += 30) k += kAt(T, c, c.s + d) / 4;
  return clamp((k * c.dSide * c.speed * c.speed / c.grip - 0.15) / 0.45, 0, 1);
}

export const driftRules = {
  // once a frame for a human kart, after the throttle: the drift's state, its cost and its payoff
  driftStep(c, dt, gas) {
    const held = this.started && !c.finished && !!(c.human ? Input.drift[c.pIndex] : c.ai.drift);   // (a bot holds it by its own decision: driftAI)
    if (!held && !c.dOn && !(c.dAmt > 0) && !(c.mtT > -1) && !(c.dYaw)) { c.dHeld = false; c.dLock = false; return; }   // (never touched: nothing changes; letting go always unlocks, or a drift broken off while held and let go once it had faded locked it for good)
    c.dHeld = held;
    const T = c.T, free = c.spinT <= 0 && c.frozen <= 0 && c.bubbled <= 0 && c.stall <= 0 && !(c.pinned > 0) && c.ff <= 0 && !(c.oc > 0) && !(c.squished > 0);
    if (c.dOn) {
      if (!held) {   // let go: the mini-turbo, if it charged
        const t = c.off ? 0 : driftTier(c);
        if (t) { const [, s, k, kick] = DRIFT.TIERS[t - 1]; c.mtT = s; c.mtK = k; c.mtTier = t; c.speed += kick; this.fxDriftBoost(c, t); this.sound('driftBoost' + t, c); }
        c.dOn = false; c.dCharge = 0;
      } else if (!free || c.off || c.speed < DRIFT.KEEP_V) { c.dOn = false; c.dCharge = 0; c.dLock = true; }   // broken off: no turbo, and press it again for a new one
    } else if (held && !c.dLock && free && !c.off && c.air <= 0 && c.speed >= DRIFT.MIN_V) {
      c.dOn = true; c.dSide = !c.human && c.ai.dz ? c.ai.dz.side : nextSide(T, c); c.dCharge = 0; c.dStrain = c.dStrain || 0; c.dT = 0;   // (a bot knows which corner it pressed it for: driftAI)
      this.sound('driftStart', c, 0.8);
    }
    if (!held) c.dLock = false;
    const corner = c.dOn ? cornerness(T, c) : c.dCorner || 0, wet = T.mech && T.mech.rain ? wetUnder(this, c) : 0;   // (how wet the road is under it: race-rain.js)
    c.dCorner = corner;
    c.dAmt = clamp((c.dAmt || 0) + (c.dOn ? DRIFT.BUILD : -DRIFT.FADE * (1 - DRIFT.WET_FADE * wet)) * dt, 0, 1);
    if (c.dOn) {
      c.dT += dt;
      if (c.air <= 0) {   // charging: quicker in a corner than on a straight, and on the gas than off it
        const t0 = driftTier(c); c.dCharge += dt * (0.25 + 0.75 * corner) * (gas ? 1 : 0.6) * (1 + DRIFT.WET_CHARGE * wet); const t1 = driftTier(c);
        if (t1 > t0) { this.sound('driftSpark' + t1, c, 0.7); this.fxDriftTier(c, t1); }
      }
      if (c.air <= 0) c.speed -= c.speed * c.dAmt * lerp(DRIFT.BLEED_S, DRIFT.BLEED_C, corner) * dt;   // it costs speed: more on a straight
      // too long near top speed: it strains, and then it spins
      c.dStrain += dt * Math.max(0, c.speed / (c.top * (T.mech && T.mech.ski ? SKI.TERM : 1)) - DRIFT.STRAIN_V) * DRIFT.STRAIN_K * (1.4 - 0.6 * corner) * (1 + DRIFT.WET_STRAIN * wet);
      if (c.dStrain > DRIFT.STRAIN_MAX) {
        c.dOn = false; c.dCharge = 0; c.dLock = true; c.dStrain = 0; c.dAmt = 0;
        c.spinT = 0.5; c.speed *= 0.7; c.dSpins = (c.dSpins || 0) + 1; c.hitCd = Math.max(c.hitCd, 0.6); this.fxHit(c, '#e6e6ea', 'drift');
      }
    } else c.dStrain = Math.max(0, (c.dStrain || 0) - dt * 2);
    const yaw = c.dOn ? c.dSide * c.dAmt * lerp(DRIFT.SLIDE_S, DRIFT.SLIDE_C, corner) * (1 + DRIFT.WET_SLIDE * wet) * (1 + 0.08 * Math.sin(this.time * 31) * clamp(c.dStrain - 1.2, 0, 1)) : 0;   // (a shudder as it strains)
    c.dYaw = (c.dYaw || 0) + (yaw - (c.dYaw || 0)) * (1 - Math.exp(-(c.dOn ? 7 : 9) * dt));
    if (Math.abs(c.dYaw) < 1e-3 && !c.dOn) c.dYaw = 0;
    if (c.mtT > -1) c.mtT -= dt;   // (on below 0 for a moment: a secret shortcut still counts it as a boost just after, race-secret.js)
  },
  // a bot's drift button, once per throttle decision (aiThrottle, with race.drift): sets c.ai.drift (held) and c.ai.dz
  // (the corner it's drifting, for its speed plan: driftGrip)
  driftAI(c, skill) {
    if (c.skiZ && (c.skiW || c.skiF)) return skiBotDrift(this, c, skill);   // (in a ski run's trees, slalom or park: race-ski.js)
    const ai = c.ai, T = c.T, now = this.time;
    const busy = !this.started || c.finished || c.off || c.air > 0 || ai.stayWide || ai.tuckIn || ai.carry || ai.secretGo || c.boost > 0 || c.ff > 0 || c.oc > 0 || c.pull > 0 || c.dragged > 0 || c.grow > 0 ||
      c.gustNear > 0.2 || c.crabNear || c.riverNear || c.jetNear || c.clockNear || c.puddleNear || c.hazNear || c.dbNear;
    const good = clamp((skill - 0.92) / 0.17, 0, 1);   // 0 at L0's skill .. 1 at L2's
    if (c.dLock && !c.dOn) { ai.drift = false; ai.dz = null; return; }   // broken off (a hit, a spin): let go, then it's free again
    if (c.dOn) {
      const z = ai.dz;
      let k = 0; for (let q = 0; q <= 60; q += 20) k += curvAt(T, c.s + q) / 4;
      if (k * c.dSide > 1 / 650) ai.dIn = true;
      if (ai.dOver) { if (busy || c.dT > ai.dOver) { ai.drift = false; ai.dz = null; } return; }   // forgot it's held: until the strain spins it (or something else comes up)
      let back = false; for (let q = 40; q <= 200; q += 20) if (curvAt(T, c.s + q) * c.dSide < -1 / 500) back = true;
      let safe = true; for (let q = 0; q <= 160; q += 10) if (vmaxAt(T, c.s + q, c.grip) * skill < c.speed * BOT.SAFE) { safe = false; break; }
      const left = z ? ahead(T, c.s, z.b) : 0, past = left < -30;   // (how much of the corner it planned is left)
      let go = busy || back || c.dT > 3.2 || !z || c.dSide !== z.side || (!ai.dIn && c.dT > 1.2);
      if (!go && ai.dIn && ((k * c.dSide <= 1 / 650 && left < 120) || past) && (safe || ai.dSloppy)) {   // (straightening out at its end: not a kink in the middle of it)
        const nx = DRIFT.TIERS[driftTier(c)];
        go = !(nx && ai.dPatient && nx[0] - c.dCharge < BOT.WAIT && c.dCorner > 0.3);   // (the next tier a moment away, still in the bend: hang on for it)
        if (go && !busy) { if (ai.dGoT === undefined) ai.dGoT = now; if (ai.dGoT + ai.dLate > now) go = false; }   // (a worse bot lets go a little late)
      }
      if (go) { ai.drift = false; ai.dz = null; }
      return;
    }
    if (ai.drift && now - ai.dPressT > 0.35) { ai.drift = false; ai.dz = null; }   // pressed but it never started (too slow): let go
    if (ai.drift) return;
    if (busy || c.speed < DRIFT.MIN_V) { ai.dz = null; return; }
    // the next corner: decide once, then plan for it and press as it comes
    const m = 1 + (DRIFT.GRIP - 1) * lerp(BOT.PLAN0, BOT.PLAN1, good);
    if (ai.dz && (ai.dz.T !== T || ahead(T, c.s, ai.dz.a) < -(ai.dz.b - ai.dz.a) * 0.5)) ai.dz = null;   // (gone past it)
    if (!ai.dz) {
      const K = nextCorner(T, c, skill, m, ai.dNextT !== T ? 10 : Math.max(10, ahead(T, c.s, ai.dNext))); if (!K) return;
      ai.dNext = wrapLap(T, c.s + K.b + 20); ai.dNextT = T;   // (each corner decided once)
      let ok = K.dur >= BOT.DUR && !K.sBend;
      for (let q = K.a - 200; ok && q <= K.b + 150; q += 50) if (inZone(T, c.s + q)) ok = false;
      if (!ok || c.rng() >= lerp(BOT.P0, BOT.P1, good ** 1.5)) return;
      ai.dz = { T, a: c.s + K.a, b: c.s + K.b, side: K.side, m, vr: K.vr, dur: K.dur };
    }
    const z = ai.dz, ds = ahead(T, c.s, z.a);
    if (ds <= Math.max(30, c.speed * BOT.PRESS)) {
      ai.drift = true; ai.dPressT = now; ai.dIn = false; ai.dGoT = undefined;
      ai.dPatient = c.rng() < lerp(BOT.PAT0, 1, good);
      ai.dLate = c.rng() * (1 - good) * BOT.LATE;
      ai.dSloppy = c.rng() < lerp(BOT.SLOPPY, 0.01, good);
      ai.dOver = c.rng() < BOT.OVER * (1 - good) ? 4 + c.rng() * 2 : 0;
    }
  },
};

// ---------------------------------------------------------------- the bots' drift (only with race.drift)
// A bot drifts the slow corners it can charge a mini-turbo in, through the same driftStep as a player (c.ai.drift is its
// button). Per corner, once (c.ai.dNext: past the last one decided): is it slow enough (its slowest point under BOT.SLOW of the kart's top speed at
// its own grip and skill), long enough to charge the first tier (BOT.DUR, worked out at the drift's speed), not an S, and
// clear of every mechanic, fork, ramp and level crossing (noDriftZones)? Then it drifts it with a chance by skill
// (BOT.P0 at L0 .. BOT.P1 at L2, rising slowly at first: about half the corners at L1). Its speed plan then takes the corner at the drift's grip (driftGrip: aiThrottle's
// corner pass and mechAllowed's re-plan), it presses BOT.PRESS seconds before the corner and lets go once the rest of
// it can be made on its own grip as the road straightens (a good bot hangs on for a tier BOT.WAIT away). A worse bot
// plans with less of the drift's grip (BOT.PLAN0), lets go late (up to BOT.LATE s), sometimes early, before it has the
// grip for the rest (BOT.SLOPPY: it runs wide), and now and then (BOT.OVER) forgets it's holding it until the strain
// spins it out. It lets go at once for anything else: a hazard plan, a fork to tuck into, a boost, off the road, in the air.
// All its luck is c.rng; with drift off none of this runs (and c.rng is never drawn), so those races replay as before.
export const BOT = {
  SLOW: 0.9,       // a corner slower than this share of the kart's top speed is one to drift
  EDGE: 0.92,      // the corner runs as far as it bends harder than this share of top speed would need
  DUR: 0.45,       // at least this much charge in it (driftStep's; the first tier is 0.4)
  PRESS: 0.22,     // press this long (s) before the corner
  LOOK: 650,       // see a corner this far ahead
  SAFE: 1.02,      // let go once the rest of the corner can be made at this share over the speed on the kart's own grip
  WAIT: 0.12,      // a good bot holds on for the next tier if it's this little charge away
  PLAN0: 0.35, PLAN1: 0.95,   // how much of the drift's extra grip its speed plan counts on (L0 .. L2)
  P0: 0.25, P1: 0.9,          // the chance it drifts a corner worth drifting (L0 .. L2)
  PAT0: 0.2,                  // how often it hangs on for a tier that's a moment away (L0; L2 always)
  LATE: 0.25, SLOPPY: 0.18, OVER: 0.035,   // a worse bot's mistakes (at L0): up to this late, this often early, this often held into a spin
  ZONE_PRE: 650, ZONE_POST: 250,   // keep this far before and past a mechanic's spot
};
const relS = (T, s, from) => T.open ? s - from : ((s - from) % T.L + T.L) % T.L;
const ahead = (T, s, to) => { if (T.open) return to - s; const r = relS(T, to, s); return r < T.L / 2 ? r : r - T.L; };   // (signed: + ahead)
const wrapLap = (T, s) => T.open ? s : ((s % T.L) + T.L) % T.L;
// where a bot never drifts: round every mechanic's spot (T.mech.avoid, and the whole of any zone with an s0..s1), a fork
// or a long split (from well before its corner to past where you're committed), a ramp, a level crossing
const ZONES = new WeakMap();
function noDriftZones(T) {
  let Z = ZONES.get(T); if (Z) return Z;
  Z = []; const P = BOT.ZONE_PRE, Q = BOT.ZONE_POST, M = T.mech;
  if (M) {
    for (const s of M.avoid) Z.push([s - P, s + Q]);
    for (const k in M) if (Array.isArray(M[k])) for (const z of M[k]) if (z && typeof z === 'object' && typeof z.s0 === 'number' && typeof z.s1 === 'number') Z.push([z.s0 - P, z.s1 + Q]);
  }
  if (T.forks && T.forkS) T.forkS.forEach(fs => { if (fs) Z.push([fs.s - 1300, fs.sLock + 300]); });
  for (const j of T.jumps || []) Z.push([j.s - 700, j.s + 200]);
  if (T.rail) for (const cr of T.rail.crossings) Z.push([cr.s - 800, cr.s + 200]);
  ZONES.set(T, Z); return Z;
}
const inZone = (T, s) => noDriftZones(T).some(([a, b]) => T.open ? s >= a && s <= b : relS(T, s, a) <= b - a);
// the grip a bot's speed plan counts on at s (a share of its own): the drift's, through the corner it's going to drift
export function driftGrip(c, s) {
  const z = c.ai.dz; if (!z || z.T !== c.T) return 1;
  const r = ahead(c.T, z.a - 40, s); return r >= 0 && r <= z.b - z.a + 40 ? z.m : 1;
}
// the next corner to drift from `from` to BOT.LOOK ahead, or null: { at (its first point that slow), a, b (where it starts and ends,
// as distances ahead), side, dur (the charge it'd build drifting it), sBend (a bend the other way right after) }
function nextCorner(T, c, skill, m, from) {
  let at = -1;
  for (let d = from; d <= BOT.LOOK; d += 10) if (vmaxAt(T, c.s + d, c.grip) * skill < c.top * BOT.SLOW) { at = d; break; }
  if (at < 0) return null;
  const side = Math.sign(curvAt(T, c.s + at)), vE = c.top * BOT.EDGE, kE = c.grip / (vE * vE);
  let a = at, b = at, vMin = vmaxAt(T, c.s + at, c.grip);
  while (a > at - 400 && curvAt(T, c.s + a - 10) * side > kE) a -= 10;
  while (b < at + 1600 && curvAt(T, c.s + b + 10) * side > kE) { b += 10; vMin = Math.min(vMin, vmaxAt(T, c.s + b, c.grip)); }
  let sBend = false; for (let q = b; q <= b + 220; q += 20) if (curvAt(T, c.s + q) * side < -1 / 500) sBend = true;
  // the charge it'd build (driftStep: 0.25 a second on a straight .. 1 in a corner taken at the limit), at the drift's speed through it
  const vD = Math.max(60, Math.min(c.top, vMin * Math.sqrt(m) * skill)); let chg = 0;
  for (let q = a; q < b; q += 10) chg += 10 / vD * (0.25 + 0.75 * clamp((curvAt(T, c.s + q) * side * vD * vD / c.grip - 0.15) / 0.45, 0, 1));
  return { at, a, b, side, dur: chg, sBend, vr: vMin * skill / c.top };
}
