// npm run items: what each item is actually worth, by the position it's used from.
// For every item use in a set of seeded all-bot races, the race is replayed with just that one use skipped (the item
// vanishes), and everyone's progress a few seconds later is compared: with the item minus without it. Racing is
// chaotic (a tiny difference can change a later collision), so a control replays with nothing skipped but the user's
// car nudged half a unit sideways at that moment: that row is the noise floor. Gains are in seconds of racing (distance / the race's average speed).
// node test/items.mjs [races=112] [horizons=3,10]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { loadSim, mulberry, runRace } from './harness.mjs';

const H_DEFAULT = [3, 10];
// one race: run it once recording every use and everyone's progress, then one replay per use (and one control)
// how far round each car is, comparable after the finish too: a finished car's progress stops counting laps, so it's
// held at where it crossed the line plus the time since, at the race's average speed (finishing sooner = further on)
const tracker = () => { const atFinish = new Map(); return r => r.cars.map(c => { if (!c.finished) return [c.progress, 0]; if (!atFinish.has(c)) atFinish.set(c, c.progress); return [atFinish.get(c), r.time - c.finishTime]; }); };
const resolve = (rec, avgSpeed) => rec.map(([p, since]) => p + since * avgSpeed);
function measureRace(sim, job) {
  const uses = [], prog = [], track0 = tracker();
  const base = runRace(sim, { ...job, onStart: r => hookUses(r, uses, null), onFrame: (r, f) => { prog[f] = track0(r); } });
  if (base.bad || base.cars.some(c => !c.finished)) return [];
  const frames = base.frames, avgSpeed = Math.max(...prog[frames].map(([p]) => p)) / (base.race.winner.finishTime);
  const maxH = Math.max(...job.H) * 60, rows = [];
  const measure = (skip, nudgeAt, nudgeCar) => {
    const alt = [], tr = tracker();
    runRace(sim, { ...job, onStart: r => hookUses(r, [], skip), stopAt: (skip ? skip.frame : nudgeAt) + maxH,
      onFrame: (r, f) => { if (f === nudgeAt) { const c = r.cars[nudgeCar]; c.x += 0.5 * Math.cos(c.heading + Math.PI / 2); c.y += 0.5 * Math.sin(c.heading + Math.PI / 2); } alt[f] = tr(r); } });
    return alt;
  };
  for (const u of uses) {
    if (u.frame + maxH > frames) continue;          // too near the end to see what it did
    const alt = measure(u, -1);
    rows.push(row(u, alt));
  }
  // control: nothing skipped, the user's car nudged half a unit at a random use's frame
  if (uses.length) { const u = uses[Math.floor(mulberry(job.seed)() * uses.length)]; if (u.frame + maxH <= frames) rows.push({ ...row(u, measure(null, u.frame, u.car)), item: 'control' }); }
  return rows;
  function row(u, alt) {
    const at = {};
    for (const h of job.H) {
      const f = u.frame + h * 60;
      if (!alt[f] || !prog[f]) throw new Error(`no progress at frame ${f}: use ${JSON.stringify(u)}, replay reached ${alt.length - 1}, base reached ${prog.length - 1}, track ${job.track} seed ${job.seed}`);
      const a = resolve(prog[f], avgSpeed), b = resolve(alt[f], avgSpeed), d = a.map((p, i) => (p - b[i]) / avgSpeed);   // seconds gained by each car thanks to the use
      const others = d.filter((_, i) => i !== u.car), leader = u.leader === u.car ? null : d[u.leader];
      at[h] = { self: d[u.car], leader, othersMean: others.reduce((a, b) => a + b, 0) / others.length, worstHit: Math.min(...others) };
    }
    return { item: u.item, pos: u.pos, track: job.track, at };
  }
}
// record (or skip) item uses: frame, car, item, its race position, and who was leading
function hookUses(r, log, skip) {
  const use0 = r.useItem;
  r.useItem = function (c, sorted) {
    const frame = Math.round(this.time * 60), entry = { frame, car: c.idx, item: c.item, pos: c.rank, leader: (sorted.find(o => !o.finished) || sorted[0]).idx };
    log.push(entry);
    if (skip && skip.frame === frame && skip.car === c.idx) { this.nextItem(c); return; }   // this use never happened
    return use0.call(this, c, sorted);
  };
}

function report(rows, H, sim) {
  const stat = xs => { const n = xs.length, m = xs.reduce((a, b) => a + b, 0) / n, v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, n - 1); return { n, m, ci: 1.96 * Math.sqrt(v / n) }; };
  const fmt = s => s.n < 3 ? '      —     ' : `${(s.m >= 0 ? '+' : '') + s.m.toFixed(2)} ±${s.ci.toFixed(2)}`.padEnd(12);
  const hL = Math.max(...H), hS = Math.min(...H);
  const items = [...Object.keys(sim.ITEMS).filter(k => rows.some(r => r.item === k)), 'control'];
  console.log(`Item value, seconds of racing (with the item − without), ${hS} s and ${hL} s after it was used. ± is a 95% range.`);
  console.log(`  you: what the user gains · vs leader: what the user gains on whoever was leading (user gain − leader gain)`);
  console.log(`  rival: the average effect on the other three cars (negative = it cost them)`);
  console.log(`  control: no item, the car nudged half a unit: how much pure chaos moves things\n`);
  for (const k of items) {
    const name = k === 'control' ? 'control (noise floor)' : sim.ITEMS[k].name;
    console.log(name);
    for (let pos = 1; pos <= 4; pos++) {
      const rs = rows.filter(r => r.item === k && r.pos === pos); if (!rs.length) continue;
      const you = h => stat(rs.map(r => r.at[h].self)), rival = h => stat(rs.map(r => r.at[h].othersMean));
      const vsL = h => stat(rs.filter(r => r.at[h].leader !== null).map(r => r.at[h].self - r.at[h].leader));
      console.log(`  from ${['1st', '2nd', '3rd', '4th'][pos - 1]} (n=${String(rs.length).padStart(3)})  you ${hS}s ${fmt(you(hS))} ${hL}s ${fmt(you(hL))}  vs leader ${hS}s ${pos === 1 ? '      —     ' : fmt(vsL(hS))} ${hL}s ${pos === 1 ? '      —     ' : fmt(vsL(hL))}  rival ${hL}s ${fmt(rival(hL))}`);
    }
  }
}

if (isMainThread) {
  const N = +(process.argv[2] || 112), H = (process.argv[3] || H_DEFAULT.join(',')).split(',').map(Number);
  const sim = await loadSim(), nT = sim.TRACKS.length, nC = sim.CHARACTERS.length;
  const jobs = [];
  for (let k = 0; k < N; k++) {
    const rng = mulberry(k * 977 + 3), pool = [...Array(nC).keys()];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    jobs.push({ track: k % nT, seed: 5000 + k, idxs: pool.slice(0, 4), skill: 1, H });
  }
  const t0 = Date.now(), W = Math.min(os.availableParallelism(), 8);
  const parts = await Promise.all(Array.from({ length: W }, (_, w) => new Promise((res, rej) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: { jobs: jobs.filter((_, i) => i % W === w) } });
    wk.once('message', res); wk.once('error', rej);
  })));
  const rows = parts.flat();
  report(rows, H, sim);
  console.log(`${N} races, ${rows.length} replays in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
} else {
  const sim = await loadSim(), out = [];
  for (const job of workerData.jobs) out.push(...measureRace(sim, job));
  parentPort.postMessage(out);
}
