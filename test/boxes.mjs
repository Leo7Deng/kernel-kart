// npm run boxes: who takes each single item box (a track's `singleBoxes`, geometry.js).
// Solo: one kart steered like a player (no bot weave) with its hands emptied every frame, so every box is open to it,
// driven by a throttle policy: flat out, or the bots' throttle at a skill (1.15 lifts late and carries speed, 0.75
// lifts early and tucks in). Share of its passes that took the box. A single that everyone takes is no choice (a box on
// a straight: the line drifts onto it), one nobody takes is a dead box.
// In a race: four bots with items, every level; share of the passes with a hand free that took it (a box a kart just
// ahead had taken is left out).
// node test/boxes.mjs [track,track...] [seeds=3] [--jobs=N]   (runs spread over N workers, default every core: test/pool.mjs)
import { loadSim, mulberry, runRace } from './harness.mjs';
import { mapPool, poolWorker, serve } from './pool.mjs';
const { Input } = await import('../js/input.js');
const sim = await loadSim();
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null, seeds = +(process.argv[3] || 3), DT = 1 / 60;
const POL = [['flat', null], ['1.15', 1.15], ['1.0', 1.0], ['0.85', 0.85], ['0.75', 0.75]];
const pct = (a, n) => n ? `${Math.round(100 * a / n)}%`.padStart(4) : '   -';
// the single boxes in a race, each with the route it's checked on and where it sits on it
const singlesIn = (r, def) => def.singleBoxes.map(([x, y, u]) => {
  const sc = def.scale || 1.5, b = r.boxes.filter(b => !b.gold).sort((p, q) => Math.hypot(p.x - x * sc, p.y - y * sc) - Math.hypot(q.x - x * sc, q.y - y * sc))[0];
  const [R, o] = [...b.on.entries()][0]; return { b, R, s: o.s };
});
const passed = (c, R, s, s0) => c.T === R && s0 < s && c.s >= s && c.s - s0 < 100;
const took = (r, c, b) => c.boxAt && r.time - c.boxAt[1] < 0.4 && r.boxes[c.boxAt[0]] === b;   // (race.js: boxAt is [which box, when])
// one run (a job): per single box [took, passes]. Solo: one kart with a throttle policy; race: four bots at a level.
function soloRun({ ti, sk, seed }) {
  const def = sim.TRACKS[ti];
  sim.setRandom(mulberry(seed * 7919 + ti * 104729 + 5));
  const r = new sim.Race(ti, { racers: [{ ch: sim.CHARACTERS[(seed + 2) % sim.CHARACTERS.length], human: true, pIndex: 0 }], laps: 3, autoUse: false, aiLevel: 1 });
  r.countdown = 0.01; const c = r.cars[0]; c.ai.skill = sk || 1;
  const here = singlesIn(r, def), out = here.map(() => [0, 0]);
  for (let f = 0; !c.finished && f * DT < 300; f++) {
    c.item = null; c.item2 = null;
    Input.pressed[0] = sk === null ? true : r.aiThrottle(c, DT, null);
    const s0 = c.s, T0 = c.T; r.update(DT);
    if (c.T === T0 && c.lap >= 1) here.forEach((o, k) => { if (passed(c, o.R, o.s, s0)) { out[k][1]++; if (took(r, c, o.b)) out[k][0]++; } });
  }
  Input.pressed[0] = false;
  return out;
}
function raceRun({ ti, level, seed }) {
  const def = sim.TRACKS[ti];
  let here = null, out = null; const prev = new Map(), free = new Map();
  runRace(sim, { track: ti, seed: seed + 200, level, idxs: [0, 1, 2, 3].map(i => (i * 3 + seed + level) % sim.CHARACTERS.length), onStart: r => { here = singlesIn(r, def); out = here.map(() => [0, 0]); }, onFrame: r => {
    for (const c of r.cars) {
      const p = prev.get(c), h = free.get(c) || []; h.push(!c.item2); if (h.length > 30) h.shift(); free.set(c, h); prev.set(c, { s: c.s, T: c.T });
      if (!p || p.T !== c.T || c.finished || c.lap < 1) continue;
      here.forEach((o, k) => { if (!passed(c, o.R, o.s, p.s)) return; const got = took(r, c, o.b); if (!got && (!h[0] || o.b.t > 0)) return; const q = out[k]; q[1]++; if (got) q[0]++; });
    }
  } });
  return out;
}
if (poolWorker(import.meta.url)) serve(job => job.kind === 'solo' ? soloRun(job) : raceRun(job));
else {
  const tracks = sim.TRACKS.map((def, ti) => ti).filter(ti => !(only && !only.includes(ti)) && sim.TRACKS[ti].singleBoxes), jobs = [];
  for (const ti of tracks) {
    for (const [pn, sk] of POL) for (let seed = 1; seed <= seeds; seed++) jobs.push({ kind: 'solo', ti, pn, sk, seed });
    for (let level = 0; level < 3; level++) for (let seed = 1; seed <= seeds * 2; seed++) jobs.push({ kind: 'race', ti, level, seed });
  }
  const res = await mapPool(import.meta.url, jobs);
  for (const ti of tracks) {
    const def = sim.TRACKS[ti], S = def.singleBoxes.map(([x, y, u]) => ({ at: [x, y], u, solo: {}, race: [[0, 0], [0, 0], [0, 0]] }));
    jobs.forEach((j, i) => {
      if (j.ti !== ti) return;
      res[i].forEach(([got, n], k) => {
        if (j.kind === 'solo') { if (!n) return; const p = S[k].solo[j.pn] || (S[k].solo[j.pn] = [0, 0]); p[0] += got; p[1] += n; }
        else { S[k].race[j.level][0] += got; S[k].race[j.level][1] += n; }
      });
    });
    console.log(`\n${def.name}   solo: ${POL.map(([p]) => p.padStart(4)).join(' ')}   race: L0   L1   L2`);
    for (const o of S) console.log(`  [${o.at}] ${(o.u > 0 ? '+' : '') + o.u}`.padEnd(22) + '        ' + POL.map(([p]) => pct(...(o.solo[p] || [0, 0]))).join(' ') + '        ' + o.race.map(q => pct(...q)).join(' '));
  }
}
