// Kernel Kart: the race simulation: cars, driving physics, collisions, pickups and hazards.
import { ACCEL, BODIES, CAR_L, CAR_W, GRIP, LIFT_DECEL, STEP, TAU, TOP_SPEED, TURBO_SCALE, clamp, fchance, frnd, lerp, mulberry, rnd } from './core.js';
import { shade } from './art.js';
import { sfx } from './audio.js';
import { Input } from './input.js';
import { blockedByShield, grassSlows, shakeOff, untouchable } from './rules.js';
import { fxSpawners, updateParticles } from './fx.js';
import { RUNOFF, buildTrack, curvAt, halfWAt, insideAt, makeCourseBoxes, projectToTrack, trackSample, wrapS } from './geometry.js';
import { ITEMS } from './items/index.js';
import { GROW_GRIP, GROW_TOP, SQUISH_TOP, isGiant } from './items/grow.js';
import { PULL_GRIP } from './items/pull.js';
import { updateMines } from './items/mine.js';
import { aiThrottle, straightAhead, wantUse } from './race-ai.js';
import { crossingState, updateTrain } from './race-hazards.js';
import { dropBehind, giveItem, nextItem, useItem } from './race-items.js';
import { mechanics } from './race-mechanics.js';
import { BIT_TOP, bitRules } from './race-bits.js';
import { BLOWN, ROCKET_LATE, SPIN_T, startRules } from './race-start.js';
import { lavaAhead } from './race-volcano.js';
import { forkRules } from './race-forks.js';
import { GOLD_BACK, GOLD_R } from './race-jackpot.js';
import { elevTop } from './race-elevation.js';
import { DRIFT, driftRules } from './race-drift.js';
import { TRACKS } from './tracks.js';


// the event feed (Race.feed): how long an event stays, and how many are kept
export const FEED_T = 3.8, FEED_MAX = 8;
// a long split's two lanes: how far before its commit point (see Race.splitLane)
export const SPLIT_LANE = 560;

// ---------------------------------------------------------------- race
class Car {
  constructor(idx, ch, human, pIndex, track) {
    this.idx = idx; this.ch = ch; this.human = human; this.pIndex = pIndex;
    const st = ch.stats; this.st = st;
    this.top = TOP_SPEED(st); this.acc = ACCEL(st); this.grip = GRIP(st) * track.def.gripMul;
    const B = BODIES[ch.body] || BODIES.kart; this.L = this.L0 = B.L; this.W = this.W0 = B.W; this.weight = this.weight0 = st.weight || 1;   // L, W and weight change while it's a malloc giant
    this.s = 0; this.lat = 0; this.speed = 0; this.lap = 1; this.progress = 0; this.rank = idx + 1;
    this.heading = 0; this.drift = 0; this.slide = 0; this.vLat = 0; this.skx = 0; this.sky = 0; this.spin = 0; this.spinT = 0;
    this.item = null; this.item2 = null; this.itemT = 0; this.charges = 0;   // item: fired next; item2: held in reserve (two at most)
    this.shield = 0; this.frozen = 0; this.bubbled = 0; this.boost = 0; this.turbo = 0; this.slip = false; this.sudo = 0; this.oiled = 0; this.pull = 0; this.pullTarget = null; this.stall = 0; this.ghost = 0; this.dragged = 0; this.ff = 0; this.oc = 0; this.ocGrace = 0; this.grow = 0; this.growK = 1; this.squished = 0;
    this.air = 0; this.airT = 1; this.jumpCd = 0; this.gasAt = 0; this.wheelspin = 0; this.bits = 0;   // gasAt, wheelspin: the rocket start (race-start.js); bits: how many it holds (race-bits.js)
    this.wallCd = 0; this.hitCd = 0; this.off = false; this.turning = 0; this.bumpCd = 0; this.jx = 0; this.jy = 0; this.squash = 0; this.reach = 1; this.gMul = 1; this.kCmd = 0; this.gas = false; this.finished = false; this.finishTime = 0; this.bestLap = 0; this.lapStart = 0;
    this.ai = { skill: 1, noise: 0, timer: 0, gas: false, bias: rnd(-0.22, 0.22) };
    this.rng = mulberry(Math.floor(Math.random() * 2 ** 32));   // this car's own luck (see core.js)
    this.x = 0; this.y = 0;
  }
}
export class Projectile { constructor(type, owner, target, s, lat) { this.type = type; this.owner = owner; this.target = target; this.s = s; this.lat = lat; this.life = type === 'bubble' ? 7 : 3.2; this.x = 0; this.y = 0; } }

// a point on a long split's other road, as distance along the main road (geometry.js: R.split)
function splitS(R, s) { const { a, b, a0, b0 } = R.split; return s < a ? s + a0 - a : s > b ? s + b0 - b : a0 + (s - a) / (b - a) * (b0 - a0); }
// does a round hazard of radius r at (x, y) touch the car's body? (oriented box, in world space)
export function hitsCar(c, x, y, r) {
  const dx = x - c.x, dy = y - c.y, ch = Math.cos(c.heading), sh = Math.sin(c.heading);
  return Math.abs(dx * ch + dy * sh) < c.L / 2 + r && Math.abs(-dx * sh + dy * ch) < c.W / 2 + r;
}
// how a boost gets you up to its speed (its speed is the same): a boost of any kind (pads, the rocket start, a trick,
// the Turbo, a tow's slingshot...) or a drift's mini-turbo, from cruising speed (JUMP_FROM of your top speed) up, all but
// jumps you there, closing JUMP of the gap a second; below that it multiplies your acceleration by BOOST_ACC (so a
// launch from a standstill isn't a teleport). Overclock and Fast-Forward close on their speed at RUSH a second. Until
// 2026-10-21 a boost multiplied your acceleration by 1.8 all the way (a mini-turbo 1.6) and those two closed at 3 a
// second (the user: boosts should just about jump to the higher speed, not climb to it)
const JUMP = 9, JUMP_FROM = 0.8, BOOST_ACC = 1.8, RUSH = 8;
const SUDO_REACH = 10;   // how far off its body a sudo kart's ram reaches (collideCars)
// two boxes in the same row: on a road they share, at the same place along it (within 20)
const sameRow = (a, b) => { for (const [R, o] of a.on) { const q = b.on.get(R); if (q && Math.abs(q.s - o.s) < 20) return true; } return false; };
export class Race {
  constructor(trackIdx, cfg) {
    this.track = buildTrack(TRACKS[trackIdx]); this.trackIdx = trackIdx;
    this.routes = this.track.routes || [this.track];   // a course can change route every lap; each car follows its own lap's route
    this.laps = TRACKS[trackIdx].laps || cfg.laps; this.track.sectors = this.laps;   // a point-to-point course is split into one stage per "lap" (before the boxes: their rows are 3 a stage; set after them, a race got the last race's rows: online, a player who'd raced it before with other laps had other boxes than the host)
    this.autoUse = cfg.autoUse; this.aiLevel = cfg.aiLevel; this.drift = !!cfg.drift;   // drift: the drift button works (race-drift.js; the Drift setting)
    this.calm = !!cfg.calm;   // calm: no obstacles (a time trial, timetrial-ui.js): no trains, the GC bots parked, and every mechanic's hazards off (each race-<name>.js checks it)
    this.time = 0; this.countdown = 3.6; this.started = false; this.over = false; this.overT = 0; this.winner = null; this.winT = 0;
    this.cars = []; this.projectiles = []; this.mines = []; this.slicks = []; this.boxes = makeCourseBoxes(this.routes);
    this.train = this.track.rail && !this.calm ? { on: false, t: 4, head: 0, dir: 1, speed: this.track.rail.speed, len: 690, horn: false } : null; this.particles = []; this.ticker = []; this.tickerN = 0; this.touching = new Set();
    const T = this.track;
    this.lapLen = T.open ? T.finishS / this.laps : T.L;   // how far a lap (or stage) is, for catch-up and rubber banding
    cfg.racers.forEach((r, i) => {
      const c = new Car(i, r.ch, r.human, r.pIndex, T); c.T = T;
      c.s = T.open ? 420 - i * 96 : T.L - 90 - i * 96; c.lat = (i % 2 ? -1 : 1) * halfWAt(T, c.s) * 0.42; c.lap = T.open ? 1 : 0; // grid is just before the line; crossing it starts lap 1
      c.ai.skill = [0.92, 1.01, 1.09][cfg.aiLevel] + rnd(-0.015, 0.015); c.ai.noise = rnd(0, 1);
      const p = trackSample(T, c.s); c.heading = Math.atan2(p.ty, p.tx); c.x = p.x + p.nx * c.lat; c.y = p.y + p.ny * c.lat;
      this.cars.push(c);
    });
    this.rng = mulberry(Math.floor(Math.random() * 2 ** 32));   // the race's own randomness (train timing)
    if (this.train && T.rail.first) { const [a, b] = T.rail.first; this.train.t = a + this.rng() * (b - a); this.train.dir = this.rng() < 0.5 ? 1 : -1; }   // the first train: when, and from which end (so the pack doesn't meet it at the same crossing every race)
    this.humans = this.cars.filter(c => c.human).sort((a, b) => a.pIndex - b.pIndex);   // by player number: P1's HUD panel is always first, whatever the grid
    this.gcs = T.gc.map(g => ({ ...g, lat: 0, x: 0, y: 0, dir: 1, ang: 0 }));
    this.megas = [];   // Mega Ducks sitting on the road
    this.clones = [];  // Thread clones driving beside their owners (items/thread.js)
    this.loops = [];   // Infinite Loops standing on the road (items/loop.js)
    this.bitsInit();   // the bits on the road (race-bits.js)
  }
  // which route a car takes on a given lap, and switching to it as it crosses the line (all routes share the line)
  routeFor(lap) { return this.track.forks ? this.routes[0] : this.routes[(Math.max(1, lap) - 1) % this.routes.length]; }   // with forks every lap starts on the wide route
  // over the line forwards: a lap done (or the race), the next lap's route, and the cheers
  crossLine(c) {
    const T = c.T;
    const lt = this.time - c.lapStart; if (c.lap >= 1 && (!c.bestLap || lt < c.bestLap)) c.bestLap = lt; c.lapStart0 = c.lapStart; c.lapStart = this.time;
    c.lap++; if (c.lap <= this.laps) this.setRoute(c, true);
    if (c.lap > this.laps) { c.finished = true; c.finishTime = this.time; c.lap = this.laps;
      if (!this.winner) { this.winner = c; this.winT = 0; this.feed('fin', null, c, null, 1); this.fxConfetti(c.x, c.y, 60); this.fxRing(c.x, c.y, '#ffd166', 120, 0.8, 8); this.fxFireworks(c.x, c.y, 5); sfx.play(this.feels(c) ? 'win' : 'rivalWin'); }
      else if (c.human) { this.feed('fin', null, c, null, c.rank); this.fxFireworks(c.x, c.y, 3); this.fxConfetti(c.x, c.y, 25); if (this.feels(c)) sfx.play('finish'); } }
    else if (c.human && c.lap === this.laps && this.laps > 1) { this.feed('lap', null, c, null, c.lap); if (this.feels(c)) { sfx.tempo(1.08); sfx.play('finalLap'); } this.fxRing(c.x, c.y, '#ffd166', 90, 0.6, 7); this.fxConfetti(c.x, c.y, 18, 30); }
    else if (c.human) { if (c.lap > 1) this.feed('lap', null, c, null, c.lap); if (this.feels(c)) sfx.play('lap'); }
  }
  setRoute(c, forward) {
    const R = this.routeFor(c.lap); if (R === c.T) return;
    const pr = projectToTrack(R, c.x, c.y, c.s < c.T.L / 2 ? c.s : c.s - c.T.L, 80); c.T = R; c.lat = pr.lat; c.prevLat = pr.lat; c.lineS = pr.lat;
    // the car is right at the line: just past it going forwards, just short of it backing up (never the other side)
    c.s = forward ? (pr.s > R.L / 2 ? 0.01 : pr.s) : (pr.s < R.L / 2 ? R.L - 0.01 : pr.s);
    if (c.human && this.routes.length > 1 && !this.track.forks && c.lap <= this.laps) this.feed('warn', 'route', c);
  }
  // a point-to-point course: the next stage gate (the finish on the last stage). Anything that moves a car forward
  // past one (an Overclock warp) has to count it, or the car never finishes.
  stageGate(c) { return c.lap >= this.laps ? c.T.finishS : c.T.finishS * c.lap / this.laps; }
  // how far round the race a car is, in distance along the first route, so cars on different routes compare. On a
  // course with forks it's distance left to the line, so a shortcut counts as soon as you're on it.
  // On a long split (geometry.js) a car on the other road counts as the same share of the way through the main road's
  // stretch, since the two take about as long.
  progressOf(c) { const L0 = this.track.L, T = c.T; return T.open ? c.s : T.split ? c.lap * L0 + splitS(T, c.s) : T.forks && !this.track.splits ? (c.lap + 1) * L0 - (T.L - c.s) : (c.lap + c.s / T.L) * L0; }
  // a fork in the road: where the two roads have pulled apart, you go onto whichever one you're nearer. Hug the inside
  // through the corner and stay there and that's the sharp road; sit out in the middle or run wide and it's the sweep.
  checkForks(c, prevS) {
    const T = c.T;
    T.forks.forEach((f, k) => {
      const fs = T.forkS[k]; if (!fs) return;
      const ds = fs.s - c.s;
      if (c.human && ds > 380 && ds < 560 && c.forkWarn !== c.lap * 4 + k) { c.forkWarn = c.lap * 4 + k; this.feed('warn', 'fork', c); }
      const plain = !f.split && !f.gate && !f.thicket, at = plain ? this.forkWhere(c, k, fs, prevS) : prevS < fs.sLock && c.s >= fs.sLock ? c : null;   // (a plain fork: where the old steering would have the kart, race-forks.js)
      if (!at) return;
      const alt = this.routes[fs.alt], q = projectToTrack(alt, at.x, at.y, fs.sAlt, 120);
      if (!at.off && (f.split ? at.lat * fs.side > 0 : Math.abs(q.lat) < Math.abs(at.lat))) {   // (a long split: in its lane, the inside half)
        const qc = at === c ? q : projectToTrack(alt, c.x, c.y, fs.sAlt, 120);
        c.T = alt; c.s = qc.s; c.lat = qc.lat; c.prevLat = qc.lat; c.lineS = qc.lat; c.progress = this.progressOf(c);
        if (plain) this.forkDone(c, qc);   // (its line carries on from where the steering had it)
        this.fxRing(c.x, c.y, '#ffd166', 50, 0.4, 5); this.fxStars(c.x, c.y, 5, '#ffd166', 100); if (c.human) this.sound('forkSharp', c);
      } else { if (plain) this.forkDone(c, null); if (c.human) this.sound('forkWide', c); }
    });
  }
  // A long split (a fork with split: true, geometry.js). Over the last SPLIT_LANE before its commit point (the tip of the
  // painted gore) the road is two lanes, and your line moves into one of them: the inside road's if you're slow enough
  // for its first bend (1.3× the speed your own grip takes it at; once in, you stay in until you're 8% over that), else
  // the outside road's. At the tip you go down the road whose lane you're in. So it's all throttle: lift into the inside
  // lane, or stay on it and keep to the outside one. A bot keeps to the lane of the road it means to take (race-ai.js).
  // splitAhead: the split car c is coming up to (its commit point less than `far` ahead), if any.
  splitAhead(c, far) {
    const T = c.T; if (!T.forks || !T.forkS) return null;
    for (let k = 0; k < T.forks.length; k++) { const f = T.forks[k], fs = T.forkS[k], ds = fs ? fs.sLock - c.s : -1; if (f.split && ds >= 0 && ds <= far) return { f, fs, ds, alt: this.routes[fs.alt] }; }
    return null;
  }
  // set for the inside lane? (a bot: if it means to take that road)
  splitInside(c, fs) { return c.human ? c.speed < 1.3 * Math.sqrt(c.grip / fs.kAlt) * (c.splitIn ? 1.08 : 1) : !!c.ai.tuckIn; }
  // the steering's line, in the lanes
  splitLane(c, tgt, edgeIn) {
    const sp = this.splitAhead(c, SPLIT_LANE + 300);
    if (!sp || sp.ds > SPLIT_LANE) { c.splitIn = false; return tgt; }
    const hw = halfWAt(c.T, c.s), inside = c.splitIn = this.splitInside(c, sp.fs);
    const lane = clamp(sp.fs.side * (inside ? 0.5 : -0.4) * hw, -edgeIn, edgeIn);
    return lerp(tgt, lane, clamp((SPLIT_LANE - sp.ds) / 200, 0, 1));
  }
  // the road car c is set for at a long split coming up, for the dotted line ahead and the minimap: { fs, route, alt }
  splitGuess(c, far = 1100) {
    const sp = this.splitAhead(c, far); if (!sp) return this.forkGuess(c, far) || (this.track.mech ? this.gateGuess(c, far) || this.thicketGuess(c, far) : null);   // (or a plain fork's, race-forks.js, or a logic gate's, race-gate.js)
    return { fs: sp.fs, alt: sp.alt, route: this.splitInside(c, sp.fs) ? sp.alt : c.T };
  }
  switchRoute(c, R, sGuess) {
    const pr = projectToTrack(R, c.x, c.y, sGuess, 120);
    c.T = R; c.s = pr.s; c.lat = pr.lat; c.prevLat = pr.lat; c.lineS = pr.lat; c.progress = this.progressOf(c);
  }
  // where car o is relative to car c: distance ahead along c's road and o's offset across it. On the same route that's
  // measured along the track; on different routes (a lap apart on a changing course) it's measured in the world.
  rel(c, o) {
    if (o.T === c.T) { const L = c.T.L; let ds = o.s - c.s; if (!c.T.open) { if (ds > L / 2) ds -= L; if (ds < -L / 2) ds += L; } return { ds, lat: o.lat }; }
    const p = trackSample(c.T, c.s), dx = o.x - c.x, dy = o.y - c.y;
    return { ds: dx * p.tx + dy * p.ty, lat: c.lat + dx * p.nx + dy * p.ny };
  }
  // where a Garbage Collector bot is across the road at time t: it trundles over, waits on the verge, and comes back
  gcLat(g, t) { if (this.calm) return (this.track.halfW + 70) * (g.phase % 2 < 1 ? 1 : -1);   // (calm: parked on the verge)
    return clamp(1.35 * Math.sin(t * 0.38 + g.phase), -1, 1) * (this.track.halfW + 70); }
  // the event feed, drawn by render.js as a row of icon chips (no words). k: 'hit' (a's item i hit b), 'haz' (hazard i
  // got b), 'lap' (a starts lap n; n === laps is the last), 'fin' (a finished n-th), 'warn' (hazard i ahead of a),
  // 'panic' (a's Kernel Panic stalled n karts). a, b: cars, kept as their idx. p: whose screen it's for (a warning, a lap
  // or a hazard is only that player's; online, only theirs). Plain data, so the snapshots carry it to online players.
  // Cosmetic: the race never reads it back.
  feed(k, i, a, b = null, n = 0) {
    const who = k === 'haz' ? b : a, p = (k === 'warn' || k === 'lap' || k === 'haz') && who ? who.pIndex : undefined;
    if (p !== undefined && !who.human) return;
    if (this.humans.length && (k === 'hit' || k === 'panic') && !(a && a.human) && !(b && b.human)) return;   // bots' fights among themselves: too many to show (all of them in an all-bot race)
    this.ticker.push({ id: ++this.tickerN, t: this.time, k, i, a: a ? a.idx : -1, b: b ? b.idx : -1, n, p });
    if (this.ticker.length > FEED_MAX) this.ticker.shift();
  }
  burst(x, y, n, col, spd = 60, life = 0.5, size = 3) { for (let i = 0; i < n; i++) { const a = frnd(0, TAU), v = frnd(0.3, 1) * spd; this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, maxLife: life, col, size }); } }

  update(dt) {
    const T = this.track;
    this.time += dt;
    if (!this.started) {
      const before = Math.ceil(this.countdown); this.countdown -= dt; const after = Math.ceil(this.countdown);
      if (before !== after && after > 0 && after <= 3) sfx.play('count');
      if (this.countdown <= 0) { this.started = true; sfx.play('go'); for (const c of this.cars) c.lapStart = this.time; }
    }
    if (!this.started || this.time - (this.goT || this.time) <= ROCKET_LATE) this.startUpdate();   // the rocket start (race-start.js)
    // ----- ranks
    const bestHuman = this.humans.length ? Math.max(...this.humans.map(c => c.progress)) : -1;
    const sorted = [...this.cars].sort((a, b) => (b.finished - a.finished) || (a.finished ? a.finishTime - b.finishTime : b.progress - a.progress));
    sorted.forEach((c, i) => c.rank = i + 1);
    const leader = sorted.find(c => !c.finished) || sorted[0];

    for (const c of this.cars) this.updateCar(c, dt, sorted, leader, bestHuman);
    this.collideCars(dt);
    if (this.clones.length) ITEMS.thread.updateWorld(this, dt, sorted, leader);   // Thread clones: keep station, bump karts, pick up boxes
    this.updateProjectiles(dt);
    this.updateHazards(dt);
    // ----- particles & messages
    updateParticles(this, dt);
    if (this.ticker.length && this.time - this.ticker[0].t > FEED_T) this.ticker = this.ticker.filter(e => this.time - e.t <= FEED_T);
    if (this.winner) { this.winT += dt; if (this.winT < 2.5 && fchance(0.3)) { const w = this.winner; this.fxConfetti(w.x, w.y, 3, 40); } }
    // ----- race over?
    const humansDone = this.humans.every(c => c.finished);
    const allDone = this.cars.every(c => c.finished);
    if ((allDone && (this.overT += dt) > 2.5) || (humansDone && (this.overT += dt) > 5)) this.over = true;
  }
  // one car for one frame: throttle, slipstream, speed, steering, movement, laps, pickups, run-off, timers, items
  updateCar(c, dt, sorted, leader, bestHuman) {
    // on a ride below no item can be fired: a player's press there is dropped, not kept to go off as the ride ends (it
    // fired up to a second late, out of a loop or a rocket)
    if (c.human && (c.moonT > 0 || c.lavaT > 0 || c.loopT > 0 || c.secretT > 0 || c.sweptT > 0 || c.flyT > 0)) Input.fire[c.pIndex] = false;
    if (c.moonT > 0) { this.moonOrbit(c, dt); return; }   // caught by a moon's gravity (race-lowg.js): it moves you until you pop
    if (c.lavaT > 0) { this.lavaSink(c, dt); return; }    // sinking into a volcano's lava (race-volcano.js): then it puts you back on the road
    if (c.loopT > 0) { ITEMS.loop.ride(this, c, dt); return; }   // going round an Infinite Loop (items/loop.js)
    if (c.secretT > 0) { this.secretRide(c, dt); return; }   // taken by a secret shortcut (race-secret.js): it puts you back further up the road
    if (c.sweptT > 0) { this.torrentRide(c, dt); return; }   // swept down a torrent off a cliff (race-cliff.js): it washes you up near the finish
    if (c.flyT > 0) { this.rocketRide(c, dt); return; }   // in a rocket to the Moon or a capsule home (race-rocket.js)
    const T = c.T;
    // ----- decide throttle
    let gas = false;
    if (this.started && c.frozen <= 0 && c.bubbled <= 0 && c.spinT <= 0 && c.stall <= 0 && !(c.pinned > 0)) {
      if (c.human && !c.finished) gas = Input.pressed[c.pIndex];
      else gas = this.aiThrottle(c, dt, bestHuman);
      if (T.open && c.finished) gas = false;             // over the finish of a point-to-point course: roll to a stop in the run-out
    }
    if (c.gas && !gas) c.gasOffAt = this.time;             // when you last let go (a trick is letting go right at a ramp's lip)
    c.gas = gas;
    if (this.drift) this.driftStep(c, dt, gas);   // the drift button (race-drift.js; with drift on: a player's key, a bot's driftAI; nothing if it's never pressed)
    if (c.human && T.rail) for (const cr of T.rail.crossings) {
      let ds = cr.s - c.s; if (ds < 0) ds += T.L;
      if (ds < 600 && ds > 80 && c.trainWarn !== cr && this.crossingState(cr).warn) { c.trainWarn = cr; this.feed('warn', 'train', c); }
      if (ds > 600 && c.trainWarn === cr) c.trainWarn = null;
    }
    const hw = halfWAt(T, c.s);                           // how wide the road is here
    // ----- slipstream & catch-up
    c.slip = false;
    for (const o of this.cars) {
      if (o === c || o.secretT > 0 || o.sweptT > 0 || o.flyT > 0) continue;   // (not off a kart on a secret ride, race-secret.js, or down a torrent, race-cliff.js)
      const r = this.rel(c, o);
      if (r.ds > 25 && r.ds < 130 && Math.abs(r.lat - c.lat) < hw * 0.5 && o.speed > 40) c.slip = true;
    }
    let topMul = 1 + (c.slip ? 0.10 : 0);
    // no catch-up speed for cars behind (the user's call): they catch up with better items instead (items/index.js)
    if (c.ghost > 0) topMul += 0.06;                       // a ghost slips along a little quicker
    if (c.dragged > 0) topMul -= 0.25;                     // a pull request has hold of you (0.35 until 2026-10-19: the user found it slowed 1st a bit much)
    if (c.pull > 0 && c.pullTarget) topMul += 0.15;       // towing: a stronger slipstream, but the throttle stays yours (it won't haul you off the road)
    if (c.boost > 0) topMul += 0.32;
    if (c.turbo > 0 && c.boost > 0) topMul += 0.12;        // the Turbo item burns hotter than pads and trick boosts
    if (c.grow > 0) topMul *= GROW_TOP;                    // a malloc giant is a bit slower
    if (c.squished > 0) topMul *= SQUISH_TOP;              // squashed flat
    topMul *= 1 + BIT_TOP * c.bits;                        // the bits you hold (race-bits.js)
    if (T.mech && T.mech.elev) topMul *= elevTop(c);      // uphill you settle slower, downhill faster (race-elevation.js)
    if (c.mtT > 0) topMul += c.mtK;                        // a drift's mini-turbo (race-drift.js)
    if (c.dAmt > 0) topMul *= 1 - c.dAmt * lerp(DRIFT.CUT_S, DRIFT.CUT_C, c.dCorner || 0);   // ...and drifting costs top speed, more on a straight
    const top = c.top * topMul * (c.turbo > 0 && c.boost > 0 ? TURBO_SCALE : 1);   // a Turbo runs at the old (pre-cut) speeds
    // ----- longitudinal
    const boosted = c.boost > 0 || c.mtT > 0;
    let accel = c.acc * (c.slip ? 1.3 : 1) * (grassSlows(c) ? 0.8 : 1) * (c.wheelspin > 0 ? 0.3 : 1);   // wheelspin: a burnout at the start (race-start.js)
    if (c.oc > 0 && c.ocT) c.speed = lerp(c.speed, c.top * 1.3, 1 - Math.exp(-RUSH * dt));   // overclock: holds its own speed on the way to its point
    else if (c.ff > 0) c.speed = lerp(c.speed, c.top * (straightAhead(c) ? 1.6 : 1.5), 1 - Math.exp(-RUSH * dt));   // fast-forward: flat out, whatever you do (a touch more on a straight)
    else if (c.air > 0) { /* in the air: nothing you do changes your speed */ }
    else if (c.frozen > 0) c.speed = Math.max(0, c.speed - 500 * dt);
    else if (c.bubbled > 0) c.speed = lerp(c.speed, 55, 1 - Math.exp(-6 * dt));
    else if (c.pinned > 0) c.speed = 0;                     // squashed flat by a malloc giant: going nowhere for a moment
    else if (c.stall > 0) c.speed = lerp(c.speed, 40, 1 - Math.exp(-3 * dt));
    else if (c.wheelspin > SPIN_T - BLOWN) c.speed = 0;   // a burnout: the engine's blown, going nowhere for a moment (race-start.js)
    else if (c.dragged > 0 && c.speed > top) c.speed = lerp(c.speed, top, 1 - Math.exp(-2.5 * dt));   // dragged: bled down to the lower top speed
    else if (gas) c.speed += c.speed < top ? Math.max(accel * (boosted ? BOOST_ACC : 1) * dt, boosted && c.air <= 0 && !(c.launchB > 0) && c.speed >= c.top * JUMP_FROM ? (top - c.speed) * (1 - Math.exp(-JUMP * dt)) : 0) : -accel * 0.5 * dt;   // (a boost: from cruising speed, it just about jumps you up to its own)
    else c.speed -= LIFT_DECEL(c.speed) * (T.def.liftK || 1) * dt;   // (liftK: on snow you can't really slow down, race-ski.js)
    c.speed = Math.max(0, c.speed);
    // ----- steering. One continuous line, no lanes. The car always wants the inside of the corner, but only as far
    // in as the arc it can actually make at this speed (r = v²/grip). Lift early and the line tightens onto the apex
    // (shorter way round); arrive hot and it stays out in the middle; too hot for even that and it runs off the road.
    // Item boxes and nearby cars bend the line a little. Letting go of the gas gives extra grip straight away.
    c.gMul += ((gas ? 1 : 1.25) - c.gMul) * (1 - Math.exp(-8 * dt));
    // boosting gives a bit of extra grip, so a boost on a slightly wobbly line doesn't carry you off; fast-forward is on rails
    let G = c.grip * c.gMul * (c.sudo > 0 ? 1.9 : 1) * (c.pull > 0 ? PULL_GRIP : 1) * (c.oiled > 0 ? 0.45 : 1) * (grassSlows(c) ? 0.7 : 1) * (c.boost > 0 ? 1.12 : 1) * (c.ff > 0 ? 8 : 1) * (c.grow > 0 ? GROW_GRIP : 1);
    if (T.mech) G *= this.mechGrip(c);                                // a banked corner grips more the higher you ride (race-banks.js)
    if (c.dAmt > 0) G *= 1 + (DRIFT.GRIP - 1) * c.dAmt;             // drifting: a tighter arc than grip alone (race-drift.js)
    const edgeIn = hw - c.W * 0.7;
    const pv = clamp(c.speed * 0.17, 10, 60);                         // small preview (covers the steering's wind-on time)
    const rp = trackSample(T, c.s + 12);
    let kRoad = 0; for (let q = 1; q <= 4; q++) kRoad += curvAt(T, c.s + pv * q / 4) / 4;
    // how far in we can go: the tightest bit of the corner ahead vs the tightest arc we can make right now
    const prof = insideAt(T, c.s + pv);
    let kPk = 0; const look = clamp(c.speed * 0.7, 120, 360);
    for (let d = -40; d <= look; d += 10) { const k = curvAt(T, c.s + d); if (k * prof > 0 && Math.abs(k) > kPk) kPk = Math.abs(k); }
    const Rcan = c.speed * c.speed / G;
    const tuck = c.dAmt > 0 ? 1.08 - DRIFT.TUCK * c.dAmt : 1.08;    // (drifting: in a little further than the arc it can make, race-drift.js)
    let reach = kPk > 1e-5 ? clamp((1 / kPk - tuck * Rcan) / edgeIn, 0, 1) : 1;
    if (!c.human && c.ai.stayWide) reach *= 0.25;                     // a bot that wants the sweep at a fork stays out of the apex
    c.reach += (reach - c.reach) * (1 - Math.exp(-(reach > c.reach ? 6 : 3) * dt));   // tightens quickly when you lift
    let tgt = prof * c.reach * edgeIn;
    if (T.mech) tgt = this.mechLine(c, tgt, prof, edgeIn);           // a corner with a line of its own (race-mechanics.js)
    if (!c.human && !c.lineSet) tgt += (c.ai.bias + Math.sin(this.time * 0.35 + c.ai.noise * TAU) * 0.1) * hw * (1 - Math.abs(prof));
    const lava = T.mech && T.mech.volcano.length;                     // (a volcano's lava: the line round it stays round it)
    // a hand free: drift toward the box ahead that's nearest the line (and will still be there when you arrive), but
    // not one you'd have to cross molten lava for
    if (!c.item2 && !c.off && this.started && !(c.ai.tuckIn && !c.human)) {   // (not a bot tucking in for a long split's inside road)
      let best = null, bd = 1e9, bds = 0;
      for (const b of this.boxes) {
        const bo = b.on.get(T); if (!bo || b.gold) continue;   // (a golden box, race-jackpot.js, you have to tuck in for yourself)
        let ds = bo.s - c.s; if (ds < 0) ds += T.L; if (ds < 4 || ds > 380 || b.t > ds / Math.max(c.speed, 80)) continue;
        if (lava && lavaAhead(this, c, ds + 150, tgt, bo.lat, ds)) continue;
        const d = Math.abs(bo.lat - tgt); if (d < bd) { bd = d; best = bo; bds = ds; }
      }
      // always a slight pull, even setting up a corner, so you don't sail between the two boxes of a row
      if (best) tgt = lerp(tgt, best.lat, 0.84 * clamp((380 - bds) / 210, 0, 1) * clamp(1 - Math.abs(prof * c.reach), 0.3, 1));   // (0.8 over 220 before: the user wanted a very slight touch more aim for boxes)
    }
    if (!c.human && !c.off && this.started) tgt = this.bitLine(c, tgt, hw);   // a bot leans toward a bit near its line (race-bits.js)
    if (c.dAmt > 0 && c.dSide && !c.lineSet) tgt = lerp(tgt, c.dSide * edgeIn, DRIFT.PULL * c.dAmt * clamp(1 - Math.abs(prof) * 1.5, 0, 1));   // drifting on a straight: the line pulled over to the drift's side (in a corner the extra grip takes it in: race-drift.js)
    // ease to one side of a slower car ahead rather than sitting in its gearbox
    // (and of a Thread clone: it's solid too, items/thread.js)
    let push = 0;
    const easeBy = o => {
      if (o === c || o.secretT > 0 || o.sweptT > 0 || o.flyT > 0 || c.sudo > 0 || (o.stall > 0 && o.stallBy === c) || (o.squished > 0 && o.squishedBy === c)) return;   // sudo: you don't move over for anyone (see collideCars); nor for a kart your Kernel Panic stalled
      const r = this.rel(c, o), ds = r.ds;
      if (ds <= CAR_L * 0.5 || ds > CAR_L * 4.25 || o.speed > c.speed + 55) return;   // (very slightly earlier, and for a car only a little slower too, than before: 4 lengths, +40)
      const dl = tgt - r.lat, room = (c.W + o.W) * 0.85;
      if (Math.abs(dl) >= room) return;
      const side = Math.abs(dl) > 3 ? Math.sign(dl) : (Math.abs(r.lat) > edgeIn * 0.5 ? -Math.sign(r.lat) : (c.idx % 2 ? 1 : -1));
      push += side * (room - Math.abs(dl)) * (1 - ds / (CAR_L * 4.25)) * (c.human ? 0.65 : 0.92);
    };
    for (const o of this.cars) easeBy(o);
    for (const o of this.clones) if (o.owner !== c && o.T === T) easeBy(o);
    for (const m of this.megas) {                                   // and round a Mega Duck, on whichever side has more room
      if (m.T !== T) continue; let ds = m.s - c.s; if (!T.open) ds = ((ds % T.L) + T.L * 1.5) % T.L - T.L / 2; if (ds > 420 + m.r || ds < -m.r) continue;   // a big duck starts well before its centre
      const clear = m.r + c.W * 0.7, hwm = halfWAt(T, m.s);
      if (Math.abs(tgt - m.lat) < clear) { const side = (hwm - m.lat) > (hwm + m.lat) ? 1 : -1; tgt = lerp(tgt, clamp(m.lat + side * clear, -hwm + c.W * 0.6, hwm - c.W * 0.6), clamp(1.3 - (ds - m.r) / 380, 0, 1) * (c.human ? 0.75 : 0.95)); }
    }
    if (this.loops.length) tgt = ITEMS.loop.steer(this, c, tgt, edgeIn);   // and edge round an Infinite Loop, a little
    for (const g of this.gcs) {                                     // and pass behind a Garbage Collector bot, not in front of it
      let ds = g.s - c.s; if (ds < 0) ds += T.L; if (ds > 420) continue;
      const gl = this.gcLat(g, this.time + ds / Math.max(c.speed, 60)); if (Math.abs(gl) > hw + 30) continue;
      const behind = clamp(gl - (g.dir || 1) * CAR_W * 2.1, -edgeIn, edgeIn), w = clamp(1.4 - ds / 300, 0, 1) * (c.human ? 0.45 : 1);
      if (Math.abs(behind - gl) > CAR_W * 1.2) tgt = lerp(tgt, behind, w);
      else tgt = lerp(tgt, gl + (g.dir || 1) * CAR_W * 2.1, w);       // it's at the edge it's heading for: slip past in front
    }
    push = c.ai.tuckIn && !c.human ? 0 : clamp(push, -CAR_W * 1.5, CAR_W * 1.5);
    if (push && lava && lavaAhead(this, c, 420, tgt + push) && !lavaAhead(this, c, 420, tgt)) push = 0;   // not over into lava
    tgt = clamp(tgt + push, -edgeIn, edgeIn);
    if (T.forks && this.track.splits) tgt = this.splitLane(c, tgt, edgeIn);   // a long split ahead: into a lane
    if (c.pull > 0 && c.pullTarget) tgt = clamp(c.pullTarget.lat, -edgeIn, edgeIn);   // the tow beam hauls you onto their line
    if (c.ff > 0) tgt = 0;                                            // fast-forward runs down the middle
    // off the road: head for the nearest edge of the tarmac at a shallow angle. Back on, the line blends in from there.
    if (c.off) { tgt = Math.sign(c.lat) * (hw - c.W); c.lineS = c.lat; }
    else c.lineS = c.lineS === undefined ? tgt : c.lineS + (tgt - c.lineS) * (1 - Math.exp(-(c.dAmt > 0 ? 4 + 4 * c.dAmt : 4) * dt));   // (a drift moves over quicker)
    const lineLat = c.off ? tgt : c.lineS;
    let eH = Math.atan2(rp.ty, rp.tx) - c.heading; while (eH > Math.PI) eH -= TAU; while (eH < -Math.PI) eH += TAU;
    const Lh = c.off ? 85 : 60;                                       // how quickly it settles onto its line (in distance)
    const kFF = kRoad / Math.max(0.35, 1 - kRoad * c.lat);           // the curvature of the road at your offset from the centre
    let kReq = kFF + (Math.abs(eH) > Math.PI / 2 ? Math.sign(eH) : Math.sin(eH)) * 2 / Lh + clamp(lineLat - c.lat, -Lh * (c.lineWide ? 2.5 : 0.5), Lh * (c.lineWide ? 2.5 : 0.5)) * 2 / (Lh * Lh);   // (a line a mechanic sets itself may ask for more: race-ski.js)
    if (T.forks && !this.track.splits) kReq = this.forkSteer(c, kReq, dt);   // set for a fork's sharp road: eased onto its line (race-forks.js)
    const kMax = Math.min(G / Math.max(c.speed * c.speed, 1), c.ff > 0 ? 1 / 18 : 1 / 26); // tightest arc: grip-limited (slower = tighter), plus steering lock
    const kUse = clamp(kReq, -kMax, kMax);
    // over the limit there's no slide and no penalty: the car just drives the tightest arc it can, which is wider than
    // the road. Too fast and that arc carries you straight off the edge. (c.slide only drives the HUD and the AI.)
    c.slide = Math.abs(kReq) > kMax * 1.02 && c.speed > 30 ? Math.min(1, (Math.abs(kReq) - kMax) / kMax) : 0;
    c.kCmd += (kUse - c.kCmd) * (1 - Math.exp(-12 * dt));            // steering winds on and off quickly, but not instantly
    if (c.frozen <= 0 && c.air <= 0 && !(c.oc > 0 && c.ocT)) c.heading += clamp(c.kCmd * c.speed, c.ff > 0 ? -14 : -5.5, c.ff > 0 ? 14 : 5.5) * dt;   // airborne: you go where you were pointing
    // boosting (any boost: items, pads, tricks, slingshots) or fast-forwarding: the kart straightens up along the road
    // and settles onto its line, so a boost fired mid-wobble on a straight takes you down the straight, not off it
    // overclocked: a straight line to the point up the track it picked, across whatever's in the way
    if (c.oc > 0 && c.ocT && c.frozen <= 0 && c.air <= 0 && c.spinT <= 0) {
      let dh = Math.atan2(c.ocT.y - c.y, c.ocT.x - c.x) - c.heading; while (dh > Math.PI) dh -= TAU; while (dh < -Math.PI) dh += TAU;
      c.heading += dh * (1 - Math.exp(-7 * dt)); c.skx *= Math.exp(-4 * dt); c.sky *= Math.exp(-4 * dt);
    }
    else if ((c.boost > 0 || c.ff > 0) && !c.off && c.air <= 0 && c.frozen <= 0 && c.spinT <= 0) {
      let dh = Math.atan2(rp.ty, rp.tx) + clamp((lineLat - c.lat) / 160, -0.3, 0.3) - c.heading; while (dh > Math.PI) dh -= TAU; while (dh < -Math.PI) dh += TAU;
      c.heading += dh * (1 - Math.exp(-(c.ff > 0 ? 12 : 2.5) * dt)); if (c.ff > 0) { c.skx *= Math.exp(-6 * dt); c.sky *= Math.exp(-6 * dt); }
    }
    c.turning = Math.abs(eH);
    // ----- move (skid = sideways shove from contact, dies quickly)
    c.x += (Math.cos(c.heading) * c.speed + c.skx) * dt; c.y += (Math.sin(c.heading) * c.speed + c.sky) * dt;
    if (c.fkSh) this.forkShadow(c, dt, kMax, lineLat);   // (the kart as the old steering would have it, which decides a plain fork: race-forks.js)
    const skd = Math.exp(-3 * dt); c.skx *= skd; c.sky *= skd;
    if (c.frozen > 0) { c.x += Math.sin(this.time * 20 + c.idx) * 2 * dt; }
    // ----- where on the track are we now
    const prevS = c.s;
    const pr = projectToTrack(T, c.x, c.y, c.s, Math.ceil(((c.speed * 3 + 200) * dt + 6) / STEP)); c.s = pr.s; c.lat = pr.lat; // small window: s can't jump to another bit of track
    const p0 = trackSample(T, c.s);
    c.vLat = (c.lat - (c.prevLat === undefined ? c.lat : c.prevLat)) / dt; c.prevLat = c.lat;
    if (this.started && !c.finished) {
      // a point-to-point course: the "line" is the next stage gate (the finish on the last stage)
      const gate = T.open ? this.stageGate(c) : 0;
      if (T.open ? prevS < gate && c.s >= gate : prevS > T.L * 0.75 && c.s < T.L * 0.25) {   // crossed the line forwards
        this.crossLine(c);
      } else if (!T.open && prevS < T.L * 0.25 && c.s > T.L * 0.75) { c.lap--; if (c.lapStart0 !== undefined) c.lapStart = c.lapStart0; this.setRoute(c, false); }   // backed over it (the lap it's back on started when it did: else crossing again would time a lap of a few seconds)
      else if (T.forks) this.checkForks(c, prevS);
    }
    c.progress = this.progressOf(c);
    c.histT = (c.histT || 0) - dt;
    if (c.histT <= 0) { c.histT = 0.05; (c.hist || (c.hist = [])).push({ x: c.x, y: c.y, s: c.s, lat: c.lat, heading: c.heading, lap: c.lap, lapStart: c.lapStart, T: c.T }); if (c.hist.length > 40) c.hist.shift(); }
    // ----- item boxes: drive through one to get an item. Only if your hands are free, and only one box per car: the
    // closest one you touch. It pops and comes back shortly. A golden box spins a slot machine instead (race-jackpot.js),
    // and no other box counts until it stops. One box a row: for 2 s after taking one, its row partner (a box at the same
    // place along the road) doesn't count, or driving between a pair took both, one into each hand. A row just behind it
    // still counts (an earlier version blocked anything within 90, which caught a second row close behind).
    if (this.started && !c.finished && c.lap >= 1 && !c.item2 && !(c.slot && c.slot.t > 0)) {
      let hit = null, hd = 1e9;
      for (const b of this.boxes) {
        if (b.t > 0) continue;
        const took = c.boxAt && this.time - c.boxAt[1] < 2 && this.boxes[c.boxAt[0]];
        if (took && b !== took && sameRow(b, took)) continue;   // the row you just took from
        const d = Math.hypot(c.x - b.x, c.y - b.y);
        if (d < (b.gold ? GOLD_R : 32) && d < hd) { hit = b; hd = d; }
      }
      if (hit) { hit.t = hit.gold ? GOLD_BACK : 0.6; c.boxAt = [this.boxes.indexOf(hit), this.time]; this.giveItem(c, sorted, leader, hit.gold); this.fxPickup(c, hit); }
    }
    this.bitsCar(c);                                      // ----- bits: drive over one to take it (race-bits.js)
    // ----- jump ramps. Launch at the ramp; in the air you can't steer or change speed. A plain ramp: airtime (and so
    // distance) grows with speed. A ramp before a crevasse is a cannon: a fixed flight to the far side, if you hit it
    // above ~80% of your kart's top speed, otherwise you drop in. Let go of the gas right at the lip and it's a trick:
    // a spin in the air and a boost on landing (the lift costs a little speed on the way in: on a cannon, mind the gate).
    const wasAir = c.air > 0;
    c.air -= dt; c.jumpCd -= dt;
    if (this.started && c.jumpCd <= 0 && c.speed > 120 && !c.off && !wasAir && c.ff <= 0 && c.oc <= 0) for (const j of T.jumps) {
      let ds = c.s - j.s; if (!T.open) { if (ds > T.L / 2) ds -= T.L; if (ds < -T.L / 2) ds += T.L; }
      if (ds > -8 && ds < 30) {
        const gap = T.gaps.find(g => { let d = g.s0 - j.s; if (!T.open) d = ((d % T.L) + T.L) % T.L; return d >= 0 && d < 500; });
        c.trick = c.human ? (!c.gas && this.time - (c.gasOffAt === undefined ? -9 : c.gasOffAt) < 0.25) : c.rng() < clamp(0.3 + (c.ai.skill - 0.92) * 3, 0.2, 0.85);
        c.landS = null; c.jumpCd = 1.2; c.jumpAt = j.s;
        if (gap) { if (c.speed >= c.top * 0.78) { c.landS = gap.s1 + 40; c.air = c.airT = (c.landS - j.s) / c.speed; } else c.air = c.airT = 0.3; }
        else c.air = c.airT = clamp(c.speed / 560, 0.3, 0.9);
        this.fxRing(c.x, c.y, '#ffffff', 40, 0.3, 4);
        this.sound(c.trick ? 'trick' : 'jump', c, c.human ? 1 : 0.5);
      }
    }
    if (wasAir && c.air <= 0) {                             // landing
      if (c.landS !== null) { const pr = projectToTrack(T, c.x, c.y, c.landS, 80); c.s = pr.s; c.lat = clamp(pr.lat, -halfWAt(T, c.s) + c.W * 0.5, halfWAt(T, c.s) - c.W * 0.5); c.prevLat = c.lat; c.lineS = c.lat; const q = trackSample(T, c.s); c.x = q.x + q.nx * c.lat; c.y = q.y + q.ny * c.lat; c.landS = null; }
      if (c.trick) { c.boost = Math.max(c.boost, 0.7); c.speed = Math.max(c.speed, c.top * 1.08); this.fxBoost(c); this.fxStars(c.x, c.y, 8, '#ffd166', 160); this.fxRing(c.x, c.y, '#ffd166', 60, 0.4, 5); }
      this.sound(c.trick ? 'trickLand' : 'land', c, c.human ? 1 : 0.5);
      c.trick = false; for (let k = 0; k < 4; k++) this.fxPuff(c.x + frnd(-16, 16), c.y + frnd(-16, 16), '#ffffff', frnd(8, 12), 0.4, frnd(-50, 50), frnd(-50, 50));
    }
    if (this.started && !c.finished && c.air <= 0 && c.spinT <= 0 && c.ff <= 0 && c.oc <= 0) for (const g of T.gaps) {
      if (c.s > g.s0 && c.s < g.s1) {
        // back to well before the ramp: a long enough run-up for this kart to reach cannon speed from a standstill
        // (v² = 2·accel·d, to 85% of top speed, plus room to spare), and never less than 420
        const runUp = Math.max(420, (c.top * 0.85) ** 2 / (2 * c.acc) + 80);
        let back = g.s0 - runUp; for (const j of T.jumps) { let d = g.s0 - j.s; if (!T.open) d = ((d % T.L) + T.L) % T.L; if (d < 600) back = j.s - runUp; }
        // never on (or just past) a boost pad on the run-up: a pad fired while you're still spinning launches you off the
        // road and back into the crevasse, over and over. Start before it instead, and take it at speed
        for (const pd of T.pads) { let d = g.s0 - pd.s; if (!T.open) d = ((d % T.L) + T.L) % T.L; let db = pd.s - back; if (!T.open) db = ((db % T.L) + T.L * 1.5) % T.L - T.L / 2; if (d < 1200 && db > -120) back = pd.s - 160; }
        if (T.open) back = Math.max(back, 0);
        const q = trackSample(T, back), lat = clamp(c.lat, -q.hw + c.W, q.hw - c.W); c.x = q.x + q.nx * lat; c.y = q.y + q.ny * lat; c.s = wrapS(T, back); c.heading = Math.atan2(q.ty, q.tx);
        c.speed = 0; c.skx = c.sky = 0; c.spinT = 1.0; c.hitCd = 1.5; c.kCmd = 0; c.prevLat = c.lat; c.trick = false;
        this.fxHit(c, '#90a4ae', 'fall');
      }
    }
    // ----- boost pads
    c.padCd = (c.padCd || 0) - dt;
    if (this.started && c.padCd <= 0 && c.spinT <= 0) for (const pd of T.pads) {   // not while spinning: it would fling you off the road
      let ds = c.s - pd.s; if (!T.open) { if (ds > T.L / 2) ds -= T.L; if (ds < -T.L / 2) ds += T.L; }
      if (Math.abs(ds) < 30 && Math.abs(c.lat - pd.lat) < 46) {
        const dbl = T.mech && T.mech.clock && this.chimeNow();   // the clocktower striking: every pad fires double (race-clock.js)
        c.padCd = 0.5; c.boost = Math.max(c.boost, dbl ? 1.8 : 0.9); c.speed = Math.max(c.speed, c.top * (dbl ? 1.16 : 1.08));
        this.fxBoost(c); this.sound('pad', c, c.human ? 1 : 0.5);
      }
    }
    if (T.mech) this.mechCar(c, dt, prevS);               // this track's own mechanics (race-mechanics.js)
    // ----- no barriers: past the edge is run-off (grass/sand). It bleeds speed and grip, and the car steers itself
    // back to the nearest edge of the tarmac. The run-off is only so wide (narrower on the inside of a tight bend), so
    // you can't slide across it onto another bit of track.
    const hwNow = p0.hw, edge = hwNow - c.W * 0.35;
    const wasOff = c.off;
    c.off = c.air <= 0 && c.ff <= 0 && Math.abs(c.lat) > edge && !(T.onAnyRoad && T.onAnyRoad(c.x, c.y, hwNow - c.W * 0.35));   // another route's road is still road; in the air nothing is
    // overclocked: arrived at the point it was aiming for, so carry on from there
    if (c.oc > 0 && c.ocT && Math.hypot(c.ocT.x - c.x, c.ocT.y - c.y) < 70) {
      const s0 = c.s, q = projectToTrack(T, c.x, c.y, c.ocT.s, 30); c.s = q.s; c.lat = q.lat; c.prevLat = q.lat; c.lineS = q.lat; c.off = false; c.ocT = null;
      if (this.started && !c.finished && (T.open ? s0 < this.stageGate(c) && c.s >= this.stageGate(c) : s0 - c.s > T.L / 2)) this.crossLine(c);   // it aimed past the line (or a stage gate): that's the lap
      c.progress = this.progressOf(c);
      this.fxRing(c.x, c.y, '#ff6d00', 60, 0.4, 5); this.fxSparks(c.x, c.y, 8, '#ff9f43', 140); this.sound('shortcut', c);
    }
    // overclocked on the grass: if you've crossed onto the road further ahead on the way (not past the line), you're there
    if (c.off && c.oc > 0 && c.ocT && this.started && !c.finished) {
      let bi = 0, bd = 1e18; for (let i = 0; i < T.N; i += 2) { const q = T.pts[i], d = (q[0] - c.x) ** 2 + (q[1] - c.y) ** 2; if (d < bd) { bd = d; bi = i; } }
      const fwd = d => T.open ? d : ((d % T.L) + T.L) % T.L, sNew = bi * STEP, ahead = fwd(sNew - c.s);   // forwards, round past the line on a loop
      if (Math.sqrt(bd) < halfWAt(T, sNew) - c.W * 0.35 && ahead > 80 && ahead <= fwd(c.ocT.s - c.s) + 1) {   // only road between here and where it's aiming: never a jump past it
        const s0 = c.s, q = projectToTrack(T, c.x, c.y, sNew, 20); c.s = q.s; c.lat = q.lat; c.prevLat = q.lat; c.lineS = q.lat; c.off = false;
        if (T.open ? s0 < this.stageGate(c) && c.s >= this.stageGate(c) : s0 - c.s > T.L / 2) this.crossLine(c);   // came back onto the road past the line (or a stage gate)
        c.progress = this.progressOf(c);
      }
    }
    if (c.off) {
      const gcol = T.mech && T.mech.rocket ? this.offCol(c) : T.theme.grass;   // (what the run-off is: Moonshot's Moon is dust, race-rocket.js)
      if (!wasOff) { c.wallCd = 0.5; for (let k = 0; k < 6; k++) this.fxPuff(c.x + frnd(-14, 14), c.y + frnd(-14, 14), shade(gcol, -0.15), frnd(8, 14), 0.7, frnd(-60, 60), frnd(-60, 60)); this.fxShards(c.x, c.y, 6, [shade(gcol, -0.25), shade(gcol, 0.1)], 130, 5); this.sound('offroad', c, c.human ? 1 : 0.4); }
      const crawl = 125;   // the same for everyone (fast karts don't get a faster run-off)
      if (c.speed > crawl && grassSlows(c))   // a ghost or an overclocked kart keeps full speed on the run-off
        c.speed -= (c.speed - crawl) * 5 * dt;
      const side = Math.sign(c.lat);
      let lim = hwNow + (T.def.runoff || RUNOFF);
      if (p0.k * side > 0) lim = Math.max(hwNow + 10, Math.min(lim, 0.8 / Math.abs(p0.k)));
      if (T.mech) lim = this.mechRunoff(c, lim, hwNow);   // (a secret's pocket: further out for a kart that's blazing, race-secret.js; a canyon's walls, race-canyon.js)
      // overclocked: no boundary at all. Just after it runs out, you're eased back in rather than snapped.
      const over = c.oc > 0 ? 0 : Math.min(Math.abs(c.lat) - lim, c.ocGrace > 0 ? 350 * dt : 1e9);
      if (over > 0) {
        // at the boundary: held there, nose turned back along the track and in, and no sliding further out
        c.x -= p0.nx * side * over; c.y -= p0.ny * side * over; c.lat -= side * over;
        const vo = (c.skx * p0.nx + c.sky * p0.ny) * side; if (vo > 0) { c.skx -= p0.nx * side * vo; c.sky -= p0.ny * side * vo; }
        const fwd = Math.atan2(p0.ty, p0.tx);
        let dh = fwd - side * 0.45 - c.heading; while (dh > Math.PI) dh -= TAU; while (dh < -Math.PI) dh += TAU;
        if (Math.abs(dh) > Math.PI * 0.75) { dh = fwd + Math.PI + side * 0.45 - c.heading; while (dh > Math.PI) dh -= TAU; while (dh < -Math.PI) dh += TAU; } // going backwards: turn in the other way
        c.heading += dh * (1 - Math.exp(-10 * dt));
        c.speed *= Math.exp(-1.2 * dt);
      }
      if (fchance(0.35)) this.fxPuff(c.x - Math.cos(c.heading) * 26 + frnd(-6, 6), c.y - Math.sin(c.heading) * 26 + frnd(-6, 6), shade(T.theme.grass, -0.12), frnd(7, 11), 0.6);
    }
    c.wallCd -= dt; c.hitCd -= dt; c.trainCd = (c.trainCd || 0) - dt;
    const rec = shakeOff(c, dt);                           // how fast spins, freezes and stalls wear off (slower for a fragile kart)
    if (c.spinT > 0) { c.spinT -= rec; c.spin += 12 * dt; } else c.spin = 0;
    // ----- timers
    if (c.ghost > 0 && c.ghost <= dt) { this.fxRing(c.x, c.y, '#b39ddb', 50, 0.35, 4); this.sound('ghostEnd', c); }       // wearing off
    if (c.shield > 0 && c.shield <= dt) { this.fxShards(c.x, c.y, 6, '#40c4ff', 90, 5); this.sound('shieldDown', c, 0.7); }
    if (c.air > 0 && c.trick && fchance(0.5)) this.fxStars(c.x + frnd(-12, 12), c.y + frnd(-12, 12), 1, `hsl(${(this.time * 400) % 360},90%,65%)`, 40, 0.4);
    c.boost -= dt; c.turbo -= dt; c.shield -= dt; c.ghost -= dt; c.dragged -= dt; if (c.launchB > 0) c.launchB -= dt;
    if (c.oc > 0) { c.oc -= dt; if (c.oc <= 0) { c.ocGrace = 2; c.ocT = null; } } c.ocGrace -= dt;
    if (c.ff > 0) { c.ff -= dt; if (fchance(0.7)) this.fxPuff(c.x - Math.cos(c.heading) * 40, c.y - Math.sin(c.heading) * 40, '#80deea', frnd(7, 12), 0.45, -Math.cos(c.heading) * 90, -Math.sin(c.heading) * 90); if (c.ff <= 0) { c.boost = Math.max(c.boost, 0.6); this.fxFFEnd(c); this.sound('ffEnd', c); } } c.frozen -= rec; c.bubbled -= rec; c.itemT += dt; c.sudo -= dt; c.oiled -= rec; c.stall -= rec; c.squished -= rec; c.pinned = (c.pinned || 0) - rec;
    ITEMS.grow.tick(this, c, dt);
    if (c.pull > 0) {
      c.pull -= dt; const tg = c.pullTarget;
      if (!tg || tg.finished || tg.progress - c.progress < CAR_L * 1.2) { c.pull = 0; c.boost = Math.max(c.boost, 0.8); if (tg) tg.dragged = 0; this.fxBoost(c); this.fxRing(c.x, c.y, '#26c6da', 60, 0.4, 5); this.sound('merge', c); }
      else if (tg.off) { c.pull = 0; tg.dragged = 0; this.fxSparks(tg.x, tg.y, 8, '#26c6da', 140); this.sound('pullBreak', tg); }   // the one being pulled can break free over the grass; the puller can't lose it that way
      else if (c.pull <= 0) { c.boost = Math.max(c.boost, 0.6); this.fxBoost(c); this.sound('merge', c); }
    }
    if (c.sudo > 0 && fchance(0.15)) this.fxStars(c.x + frnd(-20, 20), c.y + frnd(-20, 20), 1, '#ffd166', 30, 0.5);
    if (c.oc > 0 && fchance(0.7)) { const bx = c.x - Math.cos(c.heading) * (c.L * 0.5 + frnd(30, 90)), by = c.y - Math.sin(c.heading) * (c.L * 0.5 + frnd(30, 90)); this.fxSparks(bx, by, 2, fchance(0.5) ? '#b388ff' : '#80d8ff', 110); }   // overclock: a trail of plasma sparks
    if (c.wheelspin > 0) { c.wheelspin -= dt; for (let k = 0; k < 2; k++) if (fchance(0.8)) this.fxPuff(c.x - Math.cos(c.heading) * c.L * 0.45 + frnd(-10, 10), c.y - Math.sin(c.heading) * c.L * 0.45 + frnd(-10, 10), fchance(0.5) ? '#3f4048' : '#7d7f88', frnd(14, 24), 1.1, -Math.cos(c.heading) * 60 + frnd(-40, 40), -Math.sin(c.heading) * 60 + frnd(-40, 40)); if (fchance(0.25)) this.fxSparks(c.x - Math.cos(c.heading) * c.L * 0.45, c.y - Math.sin(c.heading) * c.L * 0.45, 2, '#ffb347', 120); }   // a burnout: smoke pouring off the spinning wheels
    if (c.boost > 0 && fchance(0.3)) this.fxPuff(c.x - Math.cos(c.heading) * 40, c.y - Math.sin(c.heading) * 40, '#ffffff', frnd(5, 8), 0.4, -Math.cos(c.heading) * 60, -Math.sin(c.heading) * 60);
    // ----- item use
    if (c.item && this.started && !c.finished) {
      let fire = false;
      if (c.human) fire = Input.fire[c.pIndex];
      else fire = this.wantUse(c, sorted);
      if (fire) this.useItem(c, sorted);
    }
    if (c.human) Input.fire[c.pIndex] = false;
  }
  // car vs car: solid bodies. The bounce impulse happens once, on first contact; while they stay in contact
  // they're only kept apart (no repeated impulses, so nothing can build up and launch you).
  collideCars(dt) {
    const T = this.track;
    for (let i = 0; i < this.cars.length; i++) for (let j = i + 1; j < this.cars.length; j++) {
      const a = this.cars[i], b = this.cars[j], key = i * 8 + j;
      // not untouchable(): a fast-forward isn't hit by cars, it bowls them aside (next)
      if (a.ghost > 0 || b.ghost > 0 || a.moonT > 0 || b.moonT > 0) { this.touching.delete(key); continue; }   // ghosts pass through (and a kart in a moon's orbit)
      if (a.lavaT > 0 || b.lavaT > 0 || a.loopT > 0 || b.loopT > 0 || a.secretT > 0 || b.secretT > 0 || a.sweptT > 0 || b.sweptT > 0 || a.flyT > 0 || b.flyT > 0) { this.touching.delete(key); continue; }   // nor one sinking into lava, going round an Infinite Loop or on a secret ride
      if ((a.stall > 0 && a.stallBy === b) || (b.stall > 0 && b.stallBy === a)) { this.touching.delete(key); continue; }   // a Kernel Panic's firer drives through the karts it stalled
      if ((a.squished > 0 && a.squishedBy === b) || (b.squished > 0 && b.squishedBy === a)) { this.touching.delete(key); continue; }   // a malloc giant rolls over the karts it squashed
      if (a.ff > 0 || b.ff > 0) {                                                  // fast-forward bowls cars aside
        const [r, v] = a.ff > 0 ? [a, b] : [b, a]; this.touching.delete(key);
        if (v.ff > 0 || v.hitCd > 0 || Math.hypot(v.x - r.x, v.y - r.y) > (r.L + v.L) * 0.45 || !hitsCar(v, r.x, r.y, r.W * 0.6)) continue;
        const p = trackSample(r.T, r.s), side = Math.sign((v.x - r.x) * p.nx + (v.y - r.y) * p.ny) || 1;
        v.skx += p.nx * side * 260; v.sky += p.ny * side * 260; v.hitCd = 1.2;
        if (!blockedByShield(this, v)) { v.spinT = 0.6; v.speed *= 0.55; this.fxHit(v, '#00e5ff', 'ff'); this.feed('hit', 'ff', r, v); }
        continue;
      }
      if ((a.sudo > 0) !== (b.sudo > 0) && !isGiant(a.sudo > 0 ? b : a)) {      // sudo: anyone it touches, from any side, is flung away (but not a malloc giant: it squashes the sudo kart, below; 2026-10-21, the user: it was the other way round)
        const [r, v] = a.sudo > 0 ? [a, b] : [b, a];
        const dx = v.x - r.x, dy = v.y - r.y, d = Math.hypot(dx, dy) || 1;
        // within SUDO_REACH of the sudo kart's body, front, back and sides alike. (A round aura of r.L/2 + 0.4·v.L from the
        // centre fell short of a kart right behind: bumper to bumper is r.L/2 + v.L/2, and contact holds them there.)
        const q = this.rel(r, v), gap = Math.max(Math.abs(q.ds) - (r.L + v.L) / 2, Math.abs(q.lat - r.lat) - (r.W + v.W) / 2);
        if (v.hitCd <= 0 && v.ff <= 0 && gap < SUDO_REACH) {
          this.touching.delete(key); v.hitCd = 1.5;
          if (blockedByShield(this, v)) continue;
          // knocked back against its own driving: most of its speed into the shove is lost, so it really bounces back
          const into = Math.min(0, (Math.cos(v.heading) * dx + Math.sin(v.heading) * dy) / d);
          v.skx += dx / d * 520; v.sky += dy / d * 520; v.speed *= 0.75 * (1 + 0.85 * into); v.squash = 1;   // straight away from the sudo kart, no spin-out
          this.fxSudoWreck(r, v); this.feed('hit', 'sudo', r, v);
          continue;
        }
      }
      if (isGiant(a) !== isGiant(b)) {                                             // malloc: a giant squashes whoever it touches
        const [r, v] = isGiant(a) ? [a, b] : [b, a];
        const q = this.rel(r, v), touch = Math.min((r.L + v.L) / 2 - Math.abs(q.ds), (r.W + v.W) / 2 - Math.abs(q.lat - r.lat));
        if (v.hitCd <= 0 && v.ff <= 0 && touch > -3) {                             // the moment they touch, not once they're pressed deep into it
          v.hitCd = 1.5;
          if (!blockedByShield(this, v)) ITEMS.grow.squish(this, r, v);
        }
      }
      const r = this.rel(a, b), ds = r.ds, dl = r.lat - a.lat;
      const ox = (a.L + b.L) / 2 - Math.abs(ds), oy = (a.W + b.W) / 2 - Math.abs(dl);
      if (ox <= 0 || oy <= 0) { this.touching.delete(key); continue; }
      const first = !this.touching.has(key); this.touching.add(key);
      const wa = a.weight, wb = b.weight, fa = wb / (wa + wb), fb = wa / (wa + wb);
      let hard = 0, jx = 0, jy = 0;
      if (oy < ox) {
        const sgnL = dl === 0 ? 1 : Math.sign(dl);
        const sepL = oy + 0.5; const pn = trackSample(a.T, a.s); a.x -= pn.nx * sgnL * sepL * fa; a.y -= pn.ny * sgnL * sepL * fa; b.x += pn.nx * sgnL * sepL * fb; b.y += pn.ny * sgnL * sepL * fb;
        const rel = (a.vLat - b.vLat) * sgnL;
        const p = trackSample(a.T, a.s); jx = p.nx * sgnL; jy = p.ny * sgnL;
        if (first && rel > 0) { const jimp = Math.min(rel, 90) * 1.3; a.skx -= jx * jimp * fa; a.sky -= jy * jimp * fa; b.skx += jx * jimp * fb; b.sky += jy * jimp * fb; hard = rel; const yaw = Math.min(rel, 80) / 80 * 0.06; a.heading -= sgnL * yaw * (ds > 0 ? 1 : -1) * fa * 2; b.heading += sgnL * yaw * (ds > 0 ? 1 : -1) * fb * 2; }
        else if (rel > 0) { a.skx -= jx * rel * fa * 0.5; a.sky -= jy * rel * fa * 0.5; b.skx += jx * rel * fb * 0.5; b.sky += jy * rel * fb * 0.5; }
      } else {
        const back = ds > 0 ? a : b, front = ds > 0 ? b : a;
        const fBack = back === a ? fa : fb, fFront = 1 - fBack;
        const sep = ox + 0.5; const pt = trackSample(back.T, back.s); back.x -= pt.tx * sep * fBack; back.y -= pt.ty * sep * fBack; front.x += pt.tx * sep * fFront; front.y += pt.ty * sep * fFront;
        const rel = back.speed - front.speed;
        if (first && rel > 0) { const jimp = Math.min(rel, 120) * 1.3; back.speed -= jimp * fBack; front.speed += jimp * fFront; hard = rel;
          const yaw = (dl === 0 ? 0 : Math.sign(front === b ? dl : -dl)) * Math.min(rel, 80) / 80; front.heading += yaw * 0.12 * fFront * 2; back.heading -= yaw * 0.08 * fBack * 2; // a nudge to each car's nose
          const side = dl === 0 ? 0 : Math.sign(front === b ? dl : -dl); const pn2 = trackSample(back.T, back.s);
          front.skx += pn2.nx * side * Math.min(rel, 50) * 0.35; front.sky += pn2.ny * side * Math.min(rel, 50) * 0.35; back.skx -= pn2.nx * side * Math.min(rel, 50) * 0.2; back.sky -= pn2.ny * side * Math.min(rel, 50) * 0.2; }
        else if (rel > 0) { const m = (back.speed * fBack + front.speed * fFront); back.speed = front.speed = m; }
        const p = trackSample(back.T, back.s); jx = p.tx; jy = p.ty;
      }
      if (hard > 8) {
        const k = Math.min(hard, 120) * 0.08;
        a.jx -= jx * k * fa * 2; a.jy -= jy * k * fa * 2; b.jx += jx * k * fb * 2; b.jy += jy * k * fb * 2;
        a.squash = b.squash = Math.min(1, hard / 90);
        if (a.bumpCd <= 0) { a.bumpCd = b.bumpCd = 0.25; const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2; this.fxStars(x, y, 4, '#ffffff', 110, 0.4); this.fxSparks(x, y, 6, '#ffd166', 130); this.fxPuff(x, y, '#ffffff', 10, 0.4); this.sound('bump', a.human ? a : b.human ? b : { x, y }, clamp(hard / 60, 0.4, 1)); }
      }
    }
    for (const c of this.cars) { c.bumpCd -= dt; c.jx *= Math.exp(-9 * dt); c.jy *= Math.exp(-9 * dt); c.squash *= Math.exp(-7 * dt); }
  }
  // projectiles in flight: each item moves its own and decides who it hits
  updateProjectiles(dt) {
    for (const pr of this.projectiles) {
      pr.life -= dt;
      if (!pr.T) pr.T = pr.owner.T;
      ITEMS[pr.type].updateProjectile(this, pr, dt);
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0);
  }
  // things on the ground: mines, slicks, Garbage Collector bots, item boxes respawning, trains
  updateHazards(dt) {
    const T = this.track;
    updateMines(this, dt);
    ITEMS.leak.updateWorld(this, dt);   // memory-leak slicks
    // ----- Garbage Collector bots
    for (const g of this.gcs) {
      const prev = g.lat; g.lat = this.gcLat(g, this.time);
      if (Math.abs(g.lat - prev) > 1e-3) g.dir = Math.sign(g.lat - prev);
      const p = trackSample(T, g.s); g.x = p.x + p.nx * g.lat; g.y = p.y + p.ny * g.lat; g.ang = Math.atan2(p.ny * g.dir, p.nx * g.dir);
      for (const c of this.cars) {
        if (this.calm || c.finished || c.hitCd > 0 || c.spinT > 0 || untouchable(c) || (c.gcCd || 0) > this.time || !hitsCar(c, g.x, g.y, 17)) continue;
        c.hitCd = 1.3; c.gcCd = this.time + 3;   // one bump per bot pass, never pinned
        if (blockedByShield(this, c)) continue;
        c.spinT = 0.6; c.speed *= 0.5; c.skx += p.tx * 120 + p.nx * g.dir * 50; c.sky += p.ty * 120 + p.ny * g.dir * 50;
        this.fxHit(c, '#78909c', 'gc');
      }
    }
    ITEMS.mega.updateWorld(this, dt);
    if (this.loops.length) ITEMS.loop.updateWorld(this, dt);   // Infinite Loops
    for (const b of this.boxes) b.t -= dt;
    this.bitsUpdate();
    if (this.train) this.updateTrain(dt);
    if (T.mech) this.mechUpdate(dt);   // this track's own mechanics that run for the whole race (race-mechanics.js)
  }

  // ----- the train: runs along the rail on a schedule, alternating direction. Anything it touches gets spun aside.
}
// the rest of the race lives in its own files: bot driving, item use, trains, effect spawners
Object.assign(Race.prototype, fxSpawners, mechanics, startRules, bitRules, forkRules, driftRules, { aiThrottle, wantUse, dropBehind, useItem, nextItem, giveItem, updateTrain, crossingState });
