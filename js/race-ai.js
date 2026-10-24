// Kernel Kart: how the bots drive and when they use items.
import { CAR_W, LIFT_DECEL, clamp } from './core.js';
import { halfWAt, vmaxAt } from './geometry.js';
import { ITEMS } from './items/index.js';
import { lavaAhead } from './race-volcano.js';
import { rockShy } from './race-boulders.js';
import { trainShy } from './race-hazards.js';
import { secretUse } from './race-secret.js';
import { cliffShy } from './race-cliff.js';
import { G_SLOPE, elevAt } from './race-elevation.js';
import { beltUse } from './race-belts.js';
import { jetShy } from './race-jets.js';
import { driftGrip } from './race-drift.js';


// how far a kart rolls to a stop when it lets go at speed v (LIFT_DECEL: 200 + 0.85 v)
const liftStop = v => (v - 200 / 0.85 * Math.log(1 + 0.85 * v / 200)) / 0.85;
// a run of d units ahead (to a level crossing's reach at dIn, and out the far side at dOut): how soon we'd be in it and
// out of it flat out (no faster than this bot takes the corners on the way), and how late we'd be out coasting at this
// speed (slowing for those corners)
function crossRun(T, c, dIn, dOut, skill) {
  let v = c.speed, vL = Math.max(c.speed, 40), t = 0, tL = 0, tIn = 0; const vTop = Math.max(c.top * 1.02, c.speed);
  for (let d = 0; d < dOut; d += 16) {
    if (d <= dIn) tIn = t;
    const vm = vmaxAt(T, c.s + d, c.grip) * skill;
    v = Math.max(20, Math.min(Math.sqrt(v * v + 2 * c.acc * 16), vm, vTop)); t += 16 / v;
    vL = Math.max(40, Math.min(vL, vm)); tL += 16 / vL;
  }
  return { tIn: dIn <= 0 ? 0 : tIn, tOut: t, tLate: tL };
}

export function aiThrottle(c, dt, bestHuman) {
  const T = c.T;
  c.ai.timer -= dt;
  if (c.ai.timer > 0) return c.ai.gas;
  c.ai.timer = 0.03 + c.rng() * 0.05; // reaction time
  c.ai.stayWide = false; c.ai.tuckIn = false;
  // rubber band: AI eases off when far ahead of the best human, tries harder when behind
  let skill = c.ai.skill;
  if (bestHuman >= 0 && !c.finished) { const gap = (bestHuman - c.progress) / this.lapLen; skill += gap > 0 ? Math.min(gap, 0.5) * 0.12 : -Math.min(-gap * 3, 1) * 0.07; }
  const brake = LIFT_DECEL(c.speed) * 0.9 * (T.def.liftK || 1);   // (liftK: a track where lifting slows you less, race-ski.js)
  let allowed = 1e4;
  const ahead = c.speed * c.speed / (2 * brake) + 40;
  const elev = T.mech && T.mech.elev, h0 = elev ? elevAt(T, c.s) : 0;   // on a slope (race-elevation.js): uphill the hill helps stop you, downhill it doesn't
  const dz = c.ai.dz;   // a corner it means to drift (race-drift.js driftAI): planned at the drift's grip
  for (let d = 0; d <= ahead; d += 8) {
    const vm = vmaxAt(T, c.s + d, dz ? c.grip * driftGrip(c, c.s + d) : c.grip) * skill;
    const canBe = elev ? Math.sqrt(Math.max(0, vm * vm + 2 * brake * d + 2 * G_SLOPE * (elevAt(T, c.s + d) - h0))) : Math.sqrt(vm * vm + 2 * brake * d);
    if (canBe < allowed) allowed = canBe;
  }
  // a fork ahead: some bots go for the sharp road (the better the bot, the more often). That means slowing early
  // enough to be tucked right into the inside through the corner (see the steering's reach), and slow enough for the
  // sharp road's first bends.
  if (T.forks) T.forks.forEach((f, k) => {
    const fs = T.forkS[k]; if (!fs || f.gate || f.thicket) return;   // (a logic gate's fork: race-gate.js decides; a thicket's, race-thicket.js)
    const ds = fs.sLock - c.s; if (ds < -20 || ds > 1200) return;
    const plan = c.ai.forkPlan || (c.ai.forkPlan = {}), key = c.lap * 4 + k;
    if (plan[key] === undefined) plan[key] = c.rng() < (f.split ? splitOdds(this, c, skill) : clamp(0.3 + (skill - 0.92) * 2.5, 0.2, 0.8));
    if (!plan[key]) { if (ds < fs.sLock - fs.s + 260) c.ai.stayWide = true; return; }   // going for the sweep: stay out of the apex
    if (f.split && ds < fs.sLock - fs.s + 900) c.ai.tuckIn = true;   // a long split: into the inside lane (race.js splitLane), and nothing (a box, a kart alongside) draws it off
    const edgeIn = halfWAt(T, fs.s) - c.W * 0.7;
    const vIn = Math.sqrt(Math.max(1, c.grip * (1 / fs.kW - 0.97 * edgeIn) / 1.08)), vAlt = Math.sqrt(c.grip / Math.max(fs.kAlt, 1e-5)) * skill;
    const vt = Math.min(vIn, vAlt) * 0.97, lead = fs.sLock - fs.s + 220;   // be at that speed well before the apex
    const canBe = Math.sqrt(vt * vt + 2 * brake * Math.max(0, ds - lead));
    if (canBe < allowed) allowed = canBe;
  });
  if (T.mech) allowed = this.mechAllowed(c, allowed, skill, brake);   // this track's own mechanics (race-mechanics.js)
  c.ai.gas = c.speed < allowed - 2 + Math.sin(this.time * 3 + c.ai.noise * 9) * 1.5;
  if (c.slide > 0.15 && skill < 1.2 && !c.ai.carry && !c.ai.wide && !(c.dOn && !c.human)) c.ai.gas = false;   // (unless a mechanic says carry speed: the slag; nor out on Moonshot's plain, where the line swinging across isn't the limit (race-rocket.js); nor a bot drifting: a drift tucks in past the arc it can make, race-drift.js)   // at the turning limit (still unwinding out of a corner): don't add speed
  for (const g of this.gcs) {                              // a Garbage Collector bot will be in our way: lift and let it pass
    let ds = g.s - c.s; if (ds < 0) ds += T.L; if (ds < 30 || ds > 260) continue;
    const gl = this.gcLat(g, this.time + ds / Math.max(c.speed, 60));
    if (Math.abs(gl - c.lat) < CAR_W * 1.3 && Math.abs(gl) < T.halfW + 10 && c.rng() < skill * 0.8) { c.ai.gas = false; break; }
  }
  // level crossings: if we'd get there while the train's on it, and we can still stop short, lift and wait
  if (T.rail && this.train) for (const cr of T.rail.crossings) {
    let ds = cr.s - c.s; if (ds < 0) ds += T.L; if (ds > 700) continue;
    const st = this.crossingState(cr); if (st.to <= 0) continue;
    if (ds < cr.clear + 6) {   // already in the train's reach (rolled in, or knocked there): get out the far side if there's time, else hold still (the reach is measured to the far edge of the road: short of the rails is often enough)
      if (st.from < 3) { const { tOut } = crossRun(T, c, 0, ds + cr.clear, skill); c.ai.gas = tOut < st.from - 0.1; break; }
      continue;
    }
    // earliest we could get there and out (flat out, as far as the corners let us) and latest (coasting, slowing for
    // the corners): if that window touches the train's, wait
    const dIn = Math.max(0, ds - cr.clear), { tIn: tFast, tOut: tOutFast, tLate: tSlow } = crossRun(T, c, dIn, ds + cr.clear, skill);
    const margin = 0.3 + (1.05 - skill) * 2;
    const roomX = ds - cr.clear - 65; let room = roomX;                            // stop well short of the rails (further on a slanted crossing)
    for (const o of this.cars) {                                                    // and behind anyone already waiting there in our lane (or we shove them onto the rails)
      if (o === c || o.finished || o.speed > Math.max(80, c.speed)) continue; let d = o.s - c.s; if (d < 0) d += T.L;
      if (d < ds + 40 && Math.abs(o.lat - c.lat) < (c.W + o.W) / 2 + 10) room = Math.min(room, d - (c.L + o.L) / 2 - 25);
    }
    const canStop = liftStop(c.speed) < Math.max(roomX + 40, dIn - 10) || c.speed < 40;   // (or short of where the train reaches, if we rolled past the line; or nearly stopped anyway)
    if (tFast < st.to + 0.35 && tSlow > st.from - margin) {
      if (canStop || room < roomX) c.ai.gas = c.speed < Math.sqrt(2 * 180 * Math.max(room, 0)) - 8;   // (too late to stop for the rails, but someone is waiting there: brake anyway)
      else if (tOutFast > st.from - 0.15) c.ai.gas = false;   // can't stop short of it: drive on if that beats it, else lift and get there as late as we can
      break;
    }
  }
  // a ramp with a gap behind it: the only way over is flat out (a ramp on its own is just fun)
  for (const j of T.jumps) { let ds = j.s - c.s; if (!T.open && ds < 0) ds += T.L; if (ds > 0 && ds < 520 && T.gaps.some(g => { let dg = g.s - j.s; if (!T.open && dg < 0) dg += T.L; return dg < 500; })) { c.ai.gas = true; break; } }
  if (this.drift && !c.human) this.driftAI(c, skill);   // a bot's drift button (race-drift.js): which corners, when to press, when to let go
  return c.ai.gas;
}

// a long split (a fork with split: true, Kernel Pretzel): how likely a bot is to take the inside road. A bit over even
// to start with (the roads take about as long, and the volcano puts some off), then the race: lava on the way or the
// volcano about to blow (the inside road runs round it) puts it off; trailing, it gambles on it; leading, it plays safe.
// Better bots take the technical road more. Over a race that comes to about half and half.
function splitOdds(race, c, skill) {
  let p = 0.6 + (skill - 1) * 1.5;
  if (race.volc && race.volc.some(st => race.time > st.next - 3)) p -= 0.15;        // about to erupt
  if ((race.bombs && race.bombs.length) || (race.puddles && race.puddles.some(o => race.time - o.tL < 1.5))) p -= 0.15;   // lava coming down or still molten
  if (c.rank === 1 && race.cars.length > 1) p -= 0.1; else if (c.rank === race.cars.length && race.cars.length > 1) p += 0.1;
  return clamp(p, 0.15, 0.85);
}

// a bot holding an item: fire it now? (each item decides, in its module)
// (but not a burst of speed with lava on the way: at that speed the steering can't take it round, and the throttle
// can't wait for it, race-volcano.js. How far: about as far as the burst carries it, a Fast-Forward a bit past its end.)
const LAVA_SHY = { boost: 1.8, oc: 2.4, ff: 3.6 };
export function wantUse(c, sorted) {
  if (LAVA_SHY[c.item] && this.track.mech && this.track.mech.volcano.length && (lavaAhead(this, c, c.top * LAVA_SHY[c.item]) || c.riverNear)) return false;   // (or a lava river's surge on its way to a ford, race-river.js)
  if ((c.item === 'boost' || c.item === 'oc') && (rockShy(this, c) || trainShy(this, c) || jetShy(this, c))) return false;   // nor into a boulder (race-boulders.js), a train (race-hazards.js) or a jet (race-jets.js)
  if ((c.item === 'boost' || c.item === 'oc' || c.item === 'ff') && this.track.def.cliffs && cliffShy(this, c)) return false;   // nor on the way to a cliff's lip (race-cliff.js)
  if (c.item === 'boost' && c.dbNear) return false;
  if ((c.item === 'boost' || c.item === 'oc') && c.hazNear) return false;   // nor into a hazard a track's mechanic flags just ahead (c.hazNear)   // nor into a drawbridge that's lifting or up (race-drawbridge.js)
  if (c.item === 'boost' && c.ai.secretGo) { const w = secretUse(this, c); if (w !== null) return w; }   // going for a secret shortcut: held for it, then fired into the corner (race-secret.js)
  if (c.item === 'boost' && c.T.mech) { const w = beltUse(this, c); if (w !== null) return w; }   // up a wrong-way walkway: held for it, then fired up it (race-belts.js)
  return ITEMS[c.item].wantUse(this, c, sorted);
}
// no corner in the next bit of road that needs a lift, and not at the turning limit: a good place for a speed boost
// (and not into a hurricane's crosswind or its eyewall, race-hurricane.js: it would blow you straight off; nor under a crab's claw, race-crab.js; nor at a jet, race-jets.js;
// nor while tucking in for a long split's inside road: it has to arrive slow; nor into the clock's hand or pendulum, race-clock.js)
export function straightAhead(c) { for (let d = 0; d < 160; d += 16) if (vmaxAt(c.T, c.s + d, c.grip) < c.top * 1.15) return false; return c.slide <= 0 && !(c.gustNear > 0.2) && !c.crabNear && !c.riverNear && !c.jetNear && !c.clockNear && !c.puddleNear && !c.padNear && !c.hazNear && !c.ai.tuckIn; }   // (hazNear: a hazard a track's mechanic flags just ahead)
