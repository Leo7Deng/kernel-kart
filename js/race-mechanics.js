// Kernel Kart: the track mechanics that only some tracks have (wormholes, low-gravity ramps, stamping presses, the slag
// tide, the hurricane, banked corners, jackpots, the boulder run, tunnels, the giant crab, the logic gate, the lava river, the drawbridge, secret shortcuts, the clocktower's hand, pendulum and strike, jets and moving walkways, the Tinder Grove's thicket and the Kicker Park, the rocket to the Moon, the timed obstacles, the Moon's crests, its canyon and its mass driver). Each lives in its own race-<name>.js; this file builds their data for a track, runs
// them for each car, and tells the bots what they mean for the throttle. All of it is keyed off the track definition,
// so a track without them never gets here (T.mech is null) and plays exactly as before.
import { LIFT_DECEL, STEP } from './core.js';
import { vmaxAt, wrapS } from './geometry.js';
import { buildWormholes, wormholeAI, wormholeCar } from './race-wormhole.js';
import { buildLowG, lowgAI, lowgCar, moonOrbit } from './race-lowg.js';
import { buildPresses, pressAI, pressCar } from './race-presses.js';
import { buildSlag, slagAI, slagCar, slagLine, slagUpdate } from './race-slag.js';
import { buildVolcano, lavaSink, volcanoAI, volcanoCar, volcanoLine, volcanoUpdate } from './race-volcano.js';
import { buildWaves, wavesAI, wavesCar, wavesUpdate } from './race-waves.js';
import { buildHurricane, hurricaneAI, hurricaneCar, hurricaneLine, hurricaneUpdate } from './race-hurricane.js';
import { bankAI, bankCar, bankGripAt, bankLine, buildBanks } from './race-banks.js';
import { buildJackpots, jackpotAI, jackpotCar, jackpotSpin } from './race-jackpot.js';
import { boulderAI, boulderCar, boulderUpdate, buildBoulders } from './race-boulders.js';
import { buildTunnels } from './race-tunnel.js';
import { buildCrab, crabAI, crabCar, crabUpdate } from './race-crab.js';
import { buildGates, gateAI, gateCar, gateGuess, gateLine, gateUpdate } from './race-gate.js';
import { buildRivers, riverAI, riverCar, riverUpdate } from './race-river.js';
import { buildDrawbridges, drawbridgeAI, drawbridgeCar, drawbridgeUpdate } from './race-drawbridge.js';
import { buildSecrets, secretAI, secretCar, secretRide, secretRunoff } from './race-secret.js';
import { G_SLOPE, buildElevation, elevAt, elevCar } from './race-elevation.js';
import { buildCliffs, cliffAI, cliffCar, torrentRide } from './race-cliff.js';
import { buildClock, chimeNow, clockAI, clockCar, clockUpdate } from './race-clock.js';
import { buildRain, rainAI, rainCar, rainGrip, rainUpdate } from './race-rain.js';
import { buildJets, jetsAI, jetsCar, jetsLine, jetsUpdate } from './race-jets.js';
import { beltLine, beltsAI, beltsCar, buildBelts } from './race-belts.js';
import { buildThickets, thicketAI, thicketCar, thicketGuess, thicketLine, thicketUpdate } from './race-thicket.js';
import { buildKickers, kickerAI, kickerCar, kickerLine } from './race-kickers.js';
import { buildRocket, layoutFor, offCol, rocketAI, rocketCar, rocketGrip, rocketLine, rocketPlan, rocketRide, rocketUpdate, skipLimit } from './race-rocket.js';
import { buildTimed, timedAI, timedCar, timedLine } from './race-timed.js';
import { buildCrests, crestGrip, crestsAI, crestsCar } from './race-crests.js';
import { buildCanyon, canyonCar, canyonRunoff } from './race-canyon.js';
import { buildDriver, driverAI, driverCar } from './race-driver.js';
import { driftGrip } from './race-drift.js';
import { buildSki, skiAI, skiCar, skiGrip, skiLine } from './race-ski.js';


// the nearest point on the centreline to a world position, as a distance along the lap
export function nearestS(T, x, y) { let bi = 0, bd = 1e18; for (let i = 0; i < T.N; i++) { const d = (T.pts[i][0] - x) ** 2 + (T.pts[i][1] - y) ** 2; if (d < bd) { bd = d; bi = i; } } return bi * STEP; }

// called once when the track is built (geometry.js): null for a track with none of these
export function buildMechanics(T) {
  const d = T.def;
  if (!d.wormholes && !d.lowg && !d.presses && !d.slag && !d.hurricane && !d.banks && !d.volcano && !d.waves && !d.jackpots && !d.boulders && !d.tunnels && !d.crab && !d.gates && !d.river && !d.drawbridges && !d.elev && !d.cliffs && !d.secrets && !d.clock && !d.jets && !d.rain && !d.belts && !d.thickets && !d.kickers && !d.rocket && !d.ski && !d.timed && !d.crests && !d.canyon && !d.driver) return null;
  const M = T.mech = { elev: buildElevation(T) };   // (first: a cliff's flight comes down on the road's heights)
  Object.assign(M, { cliffs: buildCliffs(T), wormholes: buildWormholes(T), lowg: buildLowG(T), presses: buildPresses(T), slag: buildSlag(T), hurricane: buildHurricane(T), banks: buildBanks(T), volcano: buildVolcano(T), waves: buildWaves(T), jackpots: buildJackpots(T), boulders: buildBoulders(T), tunnels: buildTunnels(T), crab: buildCrab(T), gates: buildGates(T), drawbridges: buildDrawbridges(T), secrets: buildSecrets(T), clock: buildClock(T), rain: buildRain(T), jets: buildJets(T), belts: buildBelts(T), thickets: buildThickets(T), kickers: buildKickers(T), rocket: buildRocket(T), ski: buildSki(T), timed: buildTimed(T), crests: buildCrests(T), canyon: buildCanyon(T), driver: buildDriver(T) });
  M.rivers = buildRivers(T, M.volcano);
  // places the item boxes keep away from (distance along the lap; the volcano's bombs land anywhere, so not those)
  M.avoid = [...M.wormholes.flatMap(w => [w.sA, w.sB]), ...M.lowg.flatMap(g => [g.sR, g.c0, (g.c0 + g.c1) / 2, g.c1]), ...M.presses.map(p => p.s), ...M.slag.flatMap(z => [z.s0, (z.s0 + z.s1) / 2, z.s1]), ...M.banks.flatMap(z => { if (!z.bowl) return [(z.s0 + z.s1) / 2]; const o = []; for (let s = z.s0 - 300; s <= z.s1 + 300; s += 200) o.push(s); return o; }),   // (a crater bowl: none anywhere round it, a box would draw your line off the wall)
     ...M.waves.map(w => w.s), ...M.jackpots.flatMap(J => [J.s0, J.s, J.s1]), ...M.boulders.flatMap(z => { const o = []; for (let s = z.s0; s <= z.s1; s += 250) o.push(s); return o; }), ...M.tunnels.flatMap(u => [u.s0, (u.s0 + u.s1) / 2, u.s1]), ...M.crab.flatMap(z => [z.s0, (z.s0 + z.s1) / 2, z.s1]), ...M.gates.flatMap(z => [z.sw.s, ...(z.gate ? [z.gate.s] : [])]), ...M.rivers.flatMap(r => r.fords.filter(f => !f.bridge).map(f => f.s)), ...M.drawbridges.flatMap(z => [z.sH, z.sTip]), ...M.secrets.map(z => z.sOut), ...(M.rain ? M.rain.puddles.map(P => P.s) : []), ...M.cliffs.flatMap(z => { const o = []; for (let s = z.sLip - 300; s <= z.sFlat + 200; s += 200) o.push(s); return o; }), ...(M.jets ? M.jets.taxi.flatMap(W => W.cross.map(x => x.s)) : []), ...M.thickets.filter(z => z.wall).map(z => z.wall.s), ...M.kickers.map(k => k.s), ...(M.clock ? [...M.clock.hands.flatMap(H => [H.s0, (H.s0 + H.s1) / 2, H.s1]), ...M.clock.pendulums.map(P => P.s)] : []), ...(M.rocket ? rocketAvoid(M.rocket) : []), ...(M.ski ? M.ski.avoid : []), ...M.timed.flatMap(o => [o.s0, o.s, o.s1]), ...(M.crests ? (() => { const o = []; for (let s = M.crests.s0 - 200; s <= M.crests.s1 + 100; s += 200) o.push(s); return o; })() : []), ...(M.driver ? (() => { const o = []; for (let s = M.driver.s0 - 600; s <= M.driver.s1 + 300; s += 200) o.push(s); return o; })() : [])];   // (none on the mass driver's run-in or its rail)   // (no boxes down a boulder run: you'd be steering for them under it)
  return M;
}

// the Launch Row, the rides' stretches (nobody drives them), the landing field's gate, the capsule pad and the slipway
function rocketAvoid(z) { const R = layoutFor(z, 10), o = []; for (let s = R.sRow0 - 500; s <= z.sGate + 200; s += 200) o.push(s); for (let s = R.sRet0 - 500; s <= z.sOut + 200; s += 200) o.push(s); return o; }   // (as many bays as a row can have, and the run in to them)

// roughly when a bot would reach a point ds ahead driving as it normally does (accelerating, lifting for corners)
export function eta(c, ds, skill) {
  const T = c.T, h = 0.05; let s = 0, v = Math.max(c.speed, 20), t = 0;
  while (s < ds && t < 12) {
    const b = LIFT_DECEL(v) * 0.9; let lim = c.top;
    for (let d = 0; d < 360; d += 24) { const vm = vmaxAt(T, c.s + s + d, c.grip) * skill; lim = Math.min(lim, Math.sqrt(vm * vm + 2 * b * d)); }
    v = v < lim ? Math.min(lim, v + c.acc * h) : Math.max(lim, v - b * h);
    s += v * h; t += h;
  }
  return t - (s - ds) / Math.max(v, 1);
}

export const mechanics = {
  // once a frame, after the cars: anything a mechanic runs for the whole race (the volcano's eruptions, the waves, the pour's roar, the hurricanes, the boulders, the crab, the gate shutting, the lava river's surges)
  mechUpdate(dt) { this.hurricaneUpdate(); this.volcanoUpdate(dt); this.wavesUpdate(dt); this.slagUpdate(dt); this.boulderUpdate(dt); this.crabUpdate(dt); this.gateUpdate(dt); this.riverUpdate(dt); this.drawbridgeUpdate(dt); this.clockUpdate(dt); this.rainUpdate(dt); this.jetsUpdate(); this.thicketUpdate(); this.rocketUpdate(dt); },   // (the thicket after the volcano: an eruption may light it)
  // one car, one frame: each mechanic's rule (after the car has moved; prevS is where it was)
  mechCar(c, dt, prevS) {
    if (!this.started) return;
    this.wormholeCar(c, dt, prevS); this.lowgCar(c, dt, prevS); this.pressCar(c, dt); this.slagCar(c, dt); this.hurricaneCar(c, dt); this.bankCar(c); this.volcanoCar(c, dt); this.wavesCar(c, dt); this.jackpotCar(c, dt); this.boulderCar(c, dt); this.crabCar(c); this.gateCar(c, dt, prevS); this.riverCar(c, dt); this.drawbridgeCar(c, dt); this.secretCar(c); this.cliffCar(c, dt, prevS); this.clockCar(c); this.elevCar(c, dt); this.rainCar(c, dt, prevS); this.jetsCar(c, dt); this.beltsCar(c, dt); this.thicketCar(c, dt, prevS); this.kickerCar(c); this.rocketCar(c, dt, prevS); this.skiCar(c, dt); this.timedCar(c, dt); this.crestsCar(c, dt); this.canyonCar(c, dt); this.driverCar(c, dt, prevS);
  },
  // where the steering aims across the road (tgt: + = left of travel), for corners with their own line
  // (and round a hot lava puddle; and off the logic gate's road while it's shut)
  mechLine(c, tgt, prof, edgeIn) { return this.skiLine(c, rocketLine.call(this, c, timedLine(c, this.kickerLine(c, this.thicketLine(c, this.beltLine(c, this.jetsLine(c, this.gateLine(c, this.volcanoLine(c, this.hurricaneLine(c, this.bankLine(c, this.slagLine(c, tgt, prof, edgeIn), edgeIn), edgeIn))), edgeIn), prof, edgeIn)))), prof, edgeIn)); },   // (last: a ski glade's weave, race-ski.js)
  // the car's grip here, as a multiple of its own (a banked corner: more the higher you ride)
  mechGrip(c) { return this.bankGripAt(c) * this.rainGrip(c) * this.rocketGrip(c) * this.skiGrip(c) * this.crestGrip(c); },   // (and the rain: race-rain.js; the Moon: race-rocket.js; going light over a crest: race-crests.js)
  // a bot's throttle: `allowed` is the speed it would aim for from the corners ahead. Each mechanic can add to a plan:
  //   remap: from ds on, the road that matters is somewhere else (a wormhole's exit)
  //   cut:   past ds the road doesn't matter (a low-gravity ramp: you're in the air)
  //   caps:  be no faster than v by ds ahead (a press to wait for, a ramp to hit at the right speed, a lava bomb to let land,
  //          a jackpot to tuck in for, a boulder to follow or to let go first)
  //   grip:  a function of s: the grip the bot expects there, as a share of its own (the rain)
  //   zones: between s0 and s1 aim for v instead of the corner speed (the slag: carry speed to stay out of it; the
  //          banking: carry speed to ride up it)
  mechAllowed(c, allowed, skill, brake) {
    const plan = { remap: null, cut: Infinity, caps: [], zones: [] };
    c.ai.carry = false;
    this.wormholeAI(c, skill, brake, plan); this.lowgAI(c, skill, brake, plan); this.slagAI(c, skill, brake, plan); this.hurricaneAI(c, skill, brake, plan); this.bankAI(c, skill, brake, plan); this.volcanoAI(c, skill, brake, plan); this.wavesAI(c, skill, brake, plan); this.jackpotAI(c, skill, brake, plan); this.boulderAI(c, skill, brake, plan); this.gateAI(c, skill, brake, plan); this.secretAI(c, skill, brake, plan); this.cliffAI(c, skill, brake, plan); this.rainAI(c, skill, brake, plan); this.beltsAI(c, skill); this.thicketAI(c, skill, brake, plan); this.kickerAI(c, skill, brake, plan); rocketPlan(c, plan); this.skiAI(c, skill, brake, plan); this.crestsAI(c, skill, brake, plan);
    if (plan.remap || plan.cut < Infinity || plan.zones.length || plan.grip) {
      const T = c.T, ahead = c.speed * c.speed / (2 * brake) + 40, elev = T.mech.elev, h0 = elev ? elevAt(T, c.s) : 0;
      allowed = 1e4;
      for (let d = 0; d <= ahead && d <= plan.cut; d += 8) {
        const s = wrapS(T, plan.remap && d >= plan.remap.ds ? plan.remap.to + d - plan.remap.ds : c.s + d);
        let vm = vmaxAt(T, s, (plan.grip ? c.grip * plan.grip(s) : c.grip) * (c.ai.dz ? driftGrip(c, s) : 1)) * skill;   // (grip: the rain, race-rain.js; and a corner it's drifting, race-drift.js)
        for (const z of plan.zones) if (s >= z.s0 && s <= z.s1) vm = Math.min(Math.max(vm, z.v), z.vMax);
        allowed = Math.min(allowed, elev ? Math.sqrt(Math.max(0, vm * vm + 2 * brake * d + 2 * G_SLOPE * (elevAt(T, s) - h0))) : Math.sqrt(vm * vm + 2 * brake * d));   // (on a slope: race-elevation.js)
      }
    }
    for (const cp of plan.caps) allowed = Math.min(allowed, Math.sqrt(cp.v * cp.v + 2 * brake * Math.max(0, cp.ds)));
    return this.driverAI(c, skill, brake, this.timedAI(c, skill, brake, this.rocketAI(c, skill, brake, this.jetsAI(c, skill, brake, this.clockAI(c, skill, brake, this.drawbridgeAI(c, skill, brake, this.riverAI(c, skill, brake, this.crabAI(c, skill, brake, this.pressAI(c, skill, brake, allowed)))))))));   // last: the presses, the crab's claws, the lava river's fords, the drawbridge and the clock's hand and pendulum pick the fastest speed that gets through clean
  },
  wormholeCar, wormholeAI, lowgCar, lowgAI, moonOrbit, pressCar, pressAI, slagCar, slagAI, slagLine, slagUpdate, hurricaneUpdate, hurricaneCar, hurricaneAI, hurricaneLine, bankCar, bankAI, bankLine, bankGripAt,
  volcanoUpdate, volcanoCar, volcanoAI, volcanoLine, lavaSink, wavesUpdate, wavesCar, wavesAI, jackpotCar, jackpotAI, jackpotSpin,
  boulderUpdate, boulderCar, boulderAI,
  crabUpdate, crabCar, crabAI,
  gateUpdate, gateCar, gateLine, gateAI, gateGuess,
  riverUpdate, riverCar, riverAI,
  drawbridgeUpdate, drawbridgeCar, drawbridgeAI,
  secretCar, secretRide, secretAI, secretRunoff,
  cliffCar, cliffAI, elevCar, torrentRide,
  clockUpdate, clockCar, clockAI, chimeNow,
  rainUpdate, rainCar, rainGrip, rainAI,
  jetsUpdate, jetsCar, jetsLine, jetsAI, beltsCar, beltLine, beltsAI,
  thicketUpdate, thicketCar, thicketLine, thicketGuess, thicketAI, kickerCar, kickerAI, kickerLine,
  rocketUpdate, rocketCar, rocketRide, rocketGrip, rocketAI, skipLimit, offCol,
  skiCar, skiLine, skiGrip, skiAI,
  timedCar, timedAI, crestsCar, crestsAI, crestGrip, canyonCar, driverCar, driverAI,
  // the run-off's limit past the road's middle (lim; hw: the road's half-width): a secret's pocket (race-secret.js), a canyon's walls (race-canyon.js)
  mechRunoff(c, lim, hw) { return canyonRunoff(c, secretRunoff(c, lim), hw); },
};
