// node test/drift.mjs [tracks...]: what the drift button (race-drift.js) is worth (and, first, that with drift off nothing
// changes, a player holding the key or the bots, and that with it on the bots drift). One human kart alone (no boxes, no bits),
// its gas from the bots' own speed plan at a sharp skill, driven three ways: never drifting, drifting the slow corners
// (press as a tight corner comes up, let go on its exit), and sloppy (drifting at random, long and on straights too).
// The speed plan knows a drift's extra grip while one is on. Prints the 3-lap time, best lap, drifts, mini-turbos by tier and spin-outs.
import { loadSim, mulberry } from './harness.mjs';
const sim = await loadSim();
const { Input } = await import('../js/input.js');
const { DRIFT } = await import('../js/race-drift.js');
const { vmaxAt, curvAt } = await import('../js/geometry.js');

const DT = 1 / 60;
const args = process.argv.slice(2).map(Number).filter(n => !isNaN(n));
const tracks = args.length ? args : [2, 4, 0];
const chars = ['octo', 'ferris', 'duke'];
const SEEDS = [1, 2, 3];
const HP = +(process.env.HP || 0.58);   // a corner slower than this share of top speed is one the 'good' driver drifts

function run(ti, ci, seed, mode) {
  sim.setRandom(mulberry(seed * 7919 + ti * 104729 + ci));
  const ch = sim.CHARACTERS.find(c => c.id === chars[ci]);
  const race = new sim.Race(ti, { racers: [{ ch, human: true, pIndex: 0 }], laps: 3, aiLevel: 2, drift: true });
  race.boxes = []; race.bits = []; race.countdown = 0.01;
  const c = race.cars[0]; c.ai.skill = 1.04;
  Input.reset(); Input.humans = 1;
  const rng = mulberry(seed * 13 + 5);
  let frames = 0, drifts = 0, wasOn = false, sloppyT = 0;
  const tiers = [0, 0, 0, 0];
  const tight = (d0, d1, thr) => { for (let d = d0; d <= d1; d += 10) if (vmaxAt(c.T, c.s + d, c.grip) < c.top * thr) return true; return false; };
  let armed = true, inBend = false;
  while (!c.finished && frames < 60 * 400) {
    // the gas: the bots' speed plan, with a drift's grip when it means to drift the corner coming (good) or is drifting
    const plan = mode === 'good' && c.dOn;
    const g0 = c.grip; if (plan || c.dAmt > 0) c.grip *= 1 + (DRIFT.GRIP - 1) * (plan ? 0.9 : c.dAmt * 0.9);
    const sl0 = c.slide; if (plan) c.slide = 0;   // (a drift tucks in past the arc it can make: that's the point, not a reason to lift)
    const gas = race.started ? race.aiThrottle(c, DT, -1) : true; c.slide = sl0;
    if (process.env.ALLOW && seed === 1 && ci === +(process.env.CI || 0) && mode !== 'sloppy' && c.lap === 1 && c.s > 1800 && c.s < 2150 && frames % 3 === 0) { const brake = 0.9 * (200 + 0.85 * c.speed); let al = 1e4, at = 0; for (let q = 0; q <= c.speed * c.speed / (2 * brake) + 40; q += 8) { const vm = vmaxAt(c.T, c.s + q, c.grip) * 1.04; const cb = Math.sqrt(vm * vm + 2 * brake * q); if (cb < al) { al = cb; at = q; } } console.log(mode, 's', c.s.toFixed(0), 'v', c.speed.toFixed(0), 'allowed', al.toFixed(0), 'at', at, 'grip', c.grip.toFixed(0), 'gas', gas, 'slide', c.slide.toFixed(2), 'timer', c.ai.timer.toFixed(3)); }
    c.grip = g0;
    Input.pressed[0] = gas;
    let d = false;
    if (mode === 'good') {
      if (!tight(-60, 200, HP + 0.05)) armed = true;   // past the corner: ready for the next one
      if (c.dOn) {
        let k = 0; for (let q = 0; q <= 60; q += 20) k += curvAt(c.T, c.s + q) / 4;
        if (k * c.dSide > 1 / 650) inBend = true;
        let back = false; for (let q = 40; q <= 200; q += 20) if (curvAt(c.T, c.s + q) * c.dSide < -1 / 500) back = true;
        let safe = true; for (let q = 0; q <= 160; q += 10) if (vmaxAt(c.T, c.s + q, c.grip) < c.speed * 1.03) safe = false;   // (the kart can make the rest of it without the drift's grip)
        d = (inBend ? k * c.dSide > 1 / 650 || !safe : c.dT < 1.2) && !back && c.dT < 3;   // let go as the road straightens out, or before it bends the other way
      } else if (armed && c.speed > DRIFT.MIN_V) {
        let at = -1; for (let q = 20; q <= 250 && at < 0; q += 10) if (vmaxAt(c.T, c.s + q, c.grip) < c.top * HP) at = q;
        if (at >= 0) {
          const sd = Math.sign(curvAt(c.T, c.s + at)); let sBend = false;
          for (let q = at; q <= at + 220; q += 20) if (curvAt(c.T, c.s + q) * sd < -1 / 500) sBend = true;
          armed = false; if (!sBend) { d = true; inBend = false; }   // (an S: left alone)
        }
      }
    } else if (mode === 'sloppy') {
      sloppyT -= DT; if (sloppyT <= 0) sloppyT = 0.5 + rng() * 2.5;
      d = Input.drift[0] ? sloppyT > 0.3 || rng() < 0.97 : rng() < 0.012;
    }
    Input.drift[0] = d;
    race.update(DT); race.over = false; frames++;
    if (process.env.SPLITS && seed === 1 && ci === 0 && mode !== 'sloppy') { const L = c.T.L, k = Math.floor((c.progress) / 500); if (k !== c._k) { c._k = k; (globalThis.SPL ||= {})[mode] ||= []; globalThis.SPL[mode][k] = race.time; } }
    if (process.env.TRACE && seed === 1 && ci === +(process.env.CI || 0) && mode !== 'sloppy' && c.lap === 1) { const [a0, a1] = process.env.TRACE.split(',').map(Number); if (c.s > a0 && c.s < a1 && frames % 4 === 0) console.log(mode, 't', race.time.toFixed(2), 's', c.s.toFixed(0), 'v', c.speed.toFixed(0), 'lat', c.lat.toFixed(0), 'gas', gas ? 1 : 0, 'drift', c.dOn ? 1 : 0, 'amt', (c.dAmt || 0).toFixed(2), 'mt', (c.mtT || 0).toFixed(2), 'off', c.off ? 1 : 0, 'slide', c.slide.toFixed(2)); }
    if (process.env.DEBUG && seed === 1 && ci === +(process.env.CI || 0) && mode === 'good') { if (c.dOn && !wasOn) console.log('  drift on at s', c.s.toFixed(0), 'v', c.speed.toFixed(0)); if (!c.dOn && wasOn) console.log('  off at s', c.s.toFixed(0), 'v', c.speed.toFixed(0), 'dT', c.dT.toFixed(2), 'tier', c.mtTier, 'mt', (c.mtT||0).toFixed(2), 'off', c.off, 'spin', c.spinT > 0); }
    if (c.dOn && !wasOn) drifts++;
    if (!c.dOn && wasOn && c.mtT > 0 && c.mtTier) tiers[c.mtTier]++;
    wasOn = c.dOn;
  }
  Input.reset();
  return { t: c.finishTime, best: c.bestLap, drifts, tiers, spins: c.dSpins || 0, fin: c.finished };
}

// drift off (the Drift setting): holding the key changes nothing, so the race is the classic one to the last digit
{
  const once = press => {
    sim.setRandom(mulberry(42)); Input.reset(); Input.humans = 1;
    const race = new sim.Race(3, { racers: [{ ch: sim.CHARACTERS[0], human: true, pIndex: 0 }, { ch: sim.CHARACTERS[1], human: false, pIndex: -1 }], laps: 1, aiLevel: 1, drift: false });
    race.countdown = 0.01; const c = race.cars[0], rng = mulberry(7);
    for (let f = 0; f < 60 * 25; f++) { Input.pressed[0] = race.started ? race.aiThrottle(c, DT, -1) : true; Input.drift[0] = press && rng() < 0.5; race.update(DT); race.over = false; }
    Input.reset(); return race.cars.map(k => [k.x, k.y, k.speed, k.lap].join(',')).join(';');
  };
  if (once(false) !== once(true)) { console.error('FAIL drift off: holding the drift key changed the race'); process.exit(1); }
  console.log('drift off: holding the key changes nothing (ok)');
}
// the bots drift (race-drift.js driftAI) only with drift on: off, no bot ever presses it or plans for it (so those races
// replay as before, test/golden.json); on, they do drift, fire mini-turbos and finish
for (const drift of [false, true]) {
  let drifts = 0, turbos = 0, planned = 0, unfinished = 0;
  for (const ti of [2, 4, 12]) {
    sim.setRandom(mulberry(99 + ti)); Input.reset();
    const race = new sim.Race(ti, { racers: [0, 3, 5, 9].map((i, k) => ({ ch: sim.CHARACTERS[i], human: false, pIndex: k })), laps: 2, aiLevel: 2, drift });
    race.countdown = 0.01; const was = new Map();
    for (let f = 0; f < 60 * 200 && !race.cars.every(c => c.finished); f++) {
      race.update(DT); race.over = false;
      for (const c of race.cars) { if (c.dOn && !was.get(c)) drifts++; if (c.mtT > 0 && !(was.get(c.idx) > 0)) turbos++; was.set(c, c.dOn); was.set(c.idx, c.mtT || 0); if (c.ai.dz || c.ai.drift || c.dAmt > 0) planned++; }
    }
    unfinished += race.cars.filter(c => !c.finished).length;
  }
  if (!drift && (drifts || turbos || planned)) { console.error(`FAIL drift off: the bots drifted (${drifts} drifts, ${planned} frames planning one)`); process.exit(1); }
  if (drift && (drifts < 20 || turbos < 10)) { console.error(`FAIL drift on: the bots hardly drift (${drifts} drifts, ${turbos} mini-turbos in 3 races)`); process.exit(1); }
  if (unfinished) { console.error(`FAIL bots with drift ${drift ? 'on' : 'off'}: ${unfinished} didn't finish`); process.exit(1); }
  console.log(drift ? `drift on: the bots drift (${drifts} drifts, ${turbos} mini-turbos in 3 races of 4, ok)` : 'drift off: the bots never touch it (ok)');
}
if (process.env.SPLITS) { for (const ti of tracks) { globalThis.SPL = {}; run(ti, 0, 1, 'none'); run(ti, 0, 1, 'good'); const A = globalThis.SPL.none, B = globalThis.SPL.good; let line = ''; for (let k = 0; k < A.length; k++) if (A[k] && B[k]) line += `${k * 500}:${(B[k] - A[k]).toFixed(2)} `; console.log(sim.TRACKS[ti].name, 'L', sim.TRACKS[ti].name, line); } process.exit(0); }
for (const ti of tracks) {
  console.log(`\n${sim.TRACKS[ti].name}`);
  for (let ci = 0; ci < chars.length; ci++) {
    const row = {};
    for (const mode of ['none', 'good', 'sloppy']) {
      const rs = SEEDS.map(s => run(ti, ci, s, mode));
      const avg = k => rs.reduce((a, r) => a + r[k], 0) / rs.length;
      row[mode] = { t: avg('t'), best: avg('best'), drifts: avg('drifts'), spins: avg('spins'), tiers: [1, 2, 3].map(k => rs.reduce((a, r) => a + r.tiers[k], 0) / rs.length), fin: rs.every(r => r.fin) };
    }
    const b = row.none.t;
    for (const mode of ['none', 'good', 'sloppy']) {
      const r = row[mode], dv = r.t - b;
      console.log(`  ${chars[ci].padEnd(7)} ${mode.padEnd(7)} 3 laps ${r.t.toFixed(2)} s (${dv >= 0 ? '+' : ''}${dv.toFixed(2)}, ${(dv / b * 100).toFixed(1)}%)  best lap ${r.best.toFixed(2)}  drifts/race ${r.drifts.toFixed(1)}  turbos b/o/p ${r.tiers.map(x => x.toFixed(1)).join('/')}  spins ${r.spins.toFixed(1)}${r.fin ? '' : '  DNF'}`);
    }
  }
}
