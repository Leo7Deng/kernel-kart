// node test/timetrial.test.mjs: a bot's time trial on every track times its laps and splits, records a ghost that follows
// the lap and fits in storage, and saves and loads it. No obstacle hits, warns or is even under way (race.calm).
import { loadSim, mulberry } from './harness.mjs';

const sim = await loadSim(), fails = [];
const store = new Map();   // a small localStorage, so the save path (and dropping ghosts when it's full) runs
let quota = 1e9;
globalThis.localStorage = {
  getItem: k => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => { const used = [...store].reduce((n, [kk, vv]) => n + (kk === k ? 0 : kk.length + vv.length), 0); if (used + k.length + v.length > quota) throw new Error('QuotaExceededError'); store.set(k, String(v)); },
  removeItem: k => store.delete(k),
};
const { Input } = await import('../js/input.js');
const { TimeTrial, ttKey, ttName, ttPlan, loadRecord, loadRecords, GHOST_HZ } = await import('../js/timetrial.js');
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const DT = 1 / 60;
// what an obstacle hits you with (race.fxHit's kind) and warns of (a feed 'warn' chip): none of them in a time trial
const HAZ_HIT = new Set(['train', 'gc', 'lava', 'boulder', 'claw', 'wave', 'jet', 'stamp', 'slag', 'drawbridge', 'hand', 'pendulum', 'gate', 'thicket']);
const HAZ_WARN = new Set(['train', 'lava', 'boulder', 'crab', 'storm', 'cross', 'tail', 'head', 'jet', 'press', 'slag', 'drawbridge', 'clock', 'pendulum', 'gate', 'fire', 'gc']);

for (let ti = 0; ti < sim.TRACKS.length; ti++) {
  const def = sim.TRACKS[ti], plan = ttPlan(def), name = ttKey(ttName(def), false);   // (the records' key: a redone layout or a clear run has its own)
  for (const pass of [0, 1]) {   // the second pass races the first one's ghost
    sim.setRandom(mulberry(ti * 31 + pass + 7));
    const laps = plan.endless ? 3 : plan.laps;   // (hot laps go on until the player ends them: three here)
    const race = new sim.Race(ti, { racers: [{ ch: sim.CHARACTERS[ti % sim.CHARACTERS.length], human: false, pIndex: 0 }], laps, aiLevel: 2, calm: true });
    race.boxes = []; race.bits = []; race.countdown = 0.01;
    const rec = loadRecord(name), tt = new TimeTrial(race, plan, rec);
    check(tt.name === name, `${def.name}: records go under ${tt.name}, expected ${name}`);
    // every hit and warning (race.fxHit, race.feed): none may be an obstacle's
    const hits = [], warns = [], fxHit = race.fxHit, feed = race.feed;
    race.fxHit = function (c, col, kind) { if (HAZ_HIT.has(kind)) hits.push(kind); return fxHit.apply(this, arguments); };
    race.feed = function (k, i) { if (k === 'warn' && HAZ_WARN.has(i)) warns.push(i); return feed.apply(this, arguments); };
    if (pass === 1) check(tt.ghost && tt.ghost.s.length > 0, `${name}: no ghost loaded on the second go`);
    let frames = 0, ghostSeen = 0, ghostFar = 0, splits = 0, lastSplitAt = -1, liveN = 0, liveBad = 0, liveEnd = null;
    const ghostT = tt.ghost ? tt.ghost.t : 0;
    while (!race.cars[0].finished && frames < 60 * 400) {   // (race.over is for humans: with only a bot it ends at once)
      const before = tt.laps.length, lv = tt.live;
      race.update(DT); frames++;
      if (before === 0 && tt.laps.length === 1) liveEnd = lv;   // the live gap just before the line, against the lap's real gap
      if (tt.split && tt.split.at !== lastSplitAt) { lastSplitAt = tt.split.at; splits++; }
      const g = tt.ghostPose();
      if (g) { ghostSeen++; if (![g.x, g.y, g.h].every(Number.isFinite)) ghostFar++; }
      if (tt.live && tt.laps.length === 0) { liveN++; if (!Number.isFinite(tt.live.d) || Math.abs(tt.live.d) > 15) liveBad++; }
    }
    const c = race.cars[0];
    check(!hits.length && !warns.length, `${name} pass ${pass}: obstacles in a time trial: hit by ${[...new Set(hits)]}, warned of ${[...new Set(warns)]}`);
    const busy = [race.train && 'train', race.volc && 'volcano', race.bombs && race.bombs.length && 'globs', race.surges && 'river', race.wav && 'waves', race.storms && 'storms', race.planes && race.planes.length && 'jets',
      race.rocks && race.rocks.some(S => S.length) && 'boulders', race.lifts && race.lifts.some(S => S.length) && 'drawbridge', race.crab && race.crab.some(st => st.strikes.length || st.n) && 'crab', race.thicket && 'thicket'].filter(Boolean);
    check(!busy.length, `${name} pass ${pass}: under way in a time trial: ${busy}`);
    check(c.finished, `${name} pass ${pass}: did not finish`);
    check(tt.laps.length === laps / plan.unitLaps, `${name} pass ${pass}: ${tt.laps.length} timed attempts, expected ${laps / plan.unitLaps}`);
    if (pass === 1) {   // the live gap to the ghost: there most of the way, sane, and at the line close to what the lap really was
      check(liveN > 100 && !liveBad, `${name}: live gap shown ${liveN} frames, ${liveBad} odd`);
      check(liveEnd && Math.abs(liveEnd.d - (tt.laps[0].t - ghostT)) < 0.6, `${name}: live gap at the line ${liveEnd && liveEnd.d.toFixed(2)} vs the lap's ${(tt.laps[0].t - ghostT).toFixed(2)}`);
      // only the fastest lap (or run) counts: the record is the best of every one driven, its ghost that one
      const r = loadRecords()[name];
      check(r && Math.abs(r.t - Math.min(ghostT, tt.sessionBest)) < 0.006 && r.u === plan.unit, `${name}: record ${r && r.t} (${r && r.u}) is not the fastest ${plan.unit}, ${Math.min(ghostT, tt.sessionBest)}`);
    }
    if (plan.unitLaps === 1) for (const l of tt.laps) check(l.t > 10 && l.t < (def.laps ? 300 : 120), `${name}: odd lap time ${l.t}`);   // (a track with its own lap count runs one long lap: Moonshot)
    if (plan.unitLaps === 1) check(Math.abs(tt.sessionBest - c.bestLap) < 0.006, `${name}: best ${tt.sessionBest} vs the race's own best lap ${c.bestLap}`);
    else check(Math.abs(tt.laps[0].t - (c.finishTime - (def.open ? 0 : 0))) < 60, `${name}: odd run time ${tt.laps[0].t}`);
    if (pass === 1) check(splits >= tt.nCp, `${name}: only ${splits} splits against the ghost`);
    if (pass === 1) check(ghostSeen > 100 && !ghostFar, `${name}: ghost shown ${ghostSeen} frames, ${ghostFar} bad`);
    const r = loadRecords()[name], saved = store.get('kk-ttg:' + name);
    check(r && r.t > 0, `${name}: no record saved`);
    check(saved && saved.length < 50000, `${name}: ghost ${saved ? saved.length : 0} bytes (want < 50 KB)`);
    const back = loadRecord(name);
    check(back && back.ghost && Math.abs(back.ghost.s.length / 4 / GHOST_HZ - back.t) < 0.2, `${name}: ghost length ${back && back.ghost && back.ghost.s.length / 4 / GHOST_HZ} s vs ${back && back.t}`);
    // the ghost follows the recorded run: its first sample is where the attempt started
    if (pass === 0 && back && back.ghost) { const s = back.ghost.s; check(Number.isFinite(s[0]) && Math.abs(s[2]) <= 31416, `${name}: ghost sample 0 looks wrong`); }
    if (pass === 0) console.log(`${name.padEnd(16)} ${plan.unit} ${tt.laps.map(l => l.t.toFixed(2)).join(' ')}  ghost ${(saved.length / 1024).toFixed(1)} KB`);
  }
  // as a player (feed warnings are a player's): the bot's throttle on the key; nothing warns or hits
  {
    sim.setRandom(mulberry(ti * 31 + 5));
    const race = new sim.Race(ti, { racers: [{ ch: sim.CHARACTERS[(ti + 3) % sim.CHARACTERS.length], human: true, pIndex: 0 }], laps: plan.unitLaps, aiLevel: 2, calm: true });
    race.boxes = []; race.bits = []; race.countdown = 0.01;
    new TimeTrial(race, plan, null);
    const c = race.cars[0], hits = [], warns = [], fxHit = race.fxHit, feed = race.feed;
    race.fxHit = function (c, col, kind) { if (HAZ_HIT.has(kind)) hits.push(kind); return fxHit.apply(this, arguments); };
    race.feed = function (k, i) { if (k === 'warn' && HAZ_WARN.has(i)) warns.push(i); return feed.apply(this, arguments); };
    for (let f = 0; !c.finished && f < 60 * 200; f++) { Input.pressed[0] = race.started && race.aiThrottle(c, DT, -1); race.update(DT); }
    Input.pressed[0] = false;
    check(!hits.length && !warns.length, `${name} as a player: obstacles in a time trial: hit by ${[...new Set(hits)]}, warned of ${[...new Set(warns)]}`);
  }
}
// storage full: a new ghost pushes out the oldest other ghosts, every time stays
{
  const n = Object.keys(loadRecords()).length;
  quota = [...store].reduce((s, [k, v]) => s + k.length + v.length, 0);   // exactly full
  const name = ttKey(ttName(sim.TRACKS[0]), false), before = store.get('kk-ttg:' + name);
  const { saveRecord } = await import('../js/timetrial.js');
  const g = loadRecord(name).ghost, big = { ...g, s: Int16Array.from({ length: g.s.length * 2 }, (_, i) => g.s[i % g.s.length]) };
  saveRecord(name, { t: g.t, ch: g.ch, at: Date.now() }, big);
  check(store.get('kk-ttg:' + name) !== before, 'storage full: the new ghost was not saved');
  check(Object.keys(loadRecords()).length === n, 'storage full: a record time was lost');
  check([...store.keys()].filter(k => k.startsWith('kk-ttg:')).length < n, 'storage full: no old ghost was dropped');
}
if (fails.length) { console.error(fails.map(f => 'FAIL ' + f).join('\n')); process.exit(1); }
console.log('time trial ok');
