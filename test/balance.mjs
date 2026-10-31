// npm run balance: the numbers behind the README's balance claims. Slow-ish; not part of npm test.
//  1. solo pace: each racer alone on each track, no items, equal bot skill. Time vs the field's average on that track.
//  2. finishing place: random four-kart grids with equal skill. Average place per racer (2.5 is perfectly fair).
//  3. pack mode: the winner's margin over 2nd with and without the 3-4 player catch-up.
// node test/balance.mjs [races] [--drift] [--until=<±place> [--batch=80]] [--jobs=N]   (160 races default; --drift: bots
// drift; --until: add --batch grids at a time until every racer's place is within ±that (95%), capped at races, default
// 1280 then; grids run 0, 1, 2... so it prints what a plain run of that many would; --jobs: workers, default every core)
import { loadSim, mulberry } from './harness.mjs';
import { runAll } from './pool.mjs';

const DRIFT = process.argv.includes('--drift'), args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const opt = k => (process.argv.find(x => x.startsWith(`--${k}=`)) || '').split('=')[1], UNTIL = +opt('until') || 0, BATCH = +opt('batch') || 80;
const sim = await loadSim(), CAP = +(args[0] || (UNTIL ? 1280 : 160)), nT = sim.TRACKS.length, nC = sim.CHARACTERS.length;
const t0 = Date.now(), pct = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';

// 1. solo pace
const solo = [];
for (let track = 0; track < nT; track++) for (let ch = 0; ch < nC; ch++) solo.push({ key: `solo:${track}:${ch}`, track, seed: 1, idxs: [ch], skill: 1, noItems: true, drift: DRIFT });
const soloRes = await runAll(solo, { detail: true });
const dev = Array(nC).fill(0), byTrack = [...Array(nC)].map(() => []);
for (let track = 0; track < nT; track++) {
  const ts = soloRes.filter(r => r.job.track === track).map(r => [r.job.idxs[0], r.cars[0].best]);   // best lap: pace without the standing start
  const mean = ts.reduce((a, [, t]) => a + t, 0) / ts.length;
  for (const [ch, t] of ts) { const d = (t / mean - 1) * 100; dev[ch] += d / nT; byTrack[ch].push([d, sim.TRACKS[track].name]); }
}

// 2 + 3. random four-kart grids, equal skill
const grid = k => { const rng = mulberry(k * 31 + 7), pool = [...Array(nC).keys()]; for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; } return pool.slice(0, 4); };
const races = [], gridRes = [], ci = (sum, sumSq, n) => 1.96 * Math.sqrt(Math.max(0, sumSq / n - (sum / n) ** 2) / n);
const widest = () => Math.max(...sim.CHARACTERS.map(c => { const r = gridRes.filter(x => !x.job.pack).flatMap(x => x.cars.filter(y => y.ch === c.id).map(y => y.rank)); return r.length ? ci(r.reduce((a, b) => a + b, 0), r.reduce((a, b) => a + b * b, 0), r.length) : 9; }));
let N = 0;
for (;;) {
  const add = [], to = UNTIL ? Math.min(CAP, N + BATCH) : CAP;
  for (let k = N; k < to; k++) for (const pack of [false, true]) add.push({ key: `grid:${k}:${pack}`, track: k % nT, seed: 1000 + k, idxs: grid(k), skill: 1, pack, drift: DRIFT });
  gridRes.push(...await runAll(add, { detail: true })); races.push(...add); N = to;
  if (!UNTIL) break;
  const w = widest(); console.error(`(${((Date.now() - t0) / 1000).toFixed(0)} s) ${N} grids: widest place ±${w.toFixed(2)}`);
  if (w <= UNTIL || N >= CAP) break;
}
const place = Array(nC).fill(0), placeN = Array(nC).fill(0), margin = { false: [], true: [] };
for (const r of gridRes) {
  const byRank = [...r.cars].sort((a, b) => a.rank - b.rank);
  margin[r.job.pack].push(byRank[1].time - byRank[0].time);
  if (!r.job.pack) for (const c of r.cars) { const ch = sim.CHARACTERS.findIndex(x => x.id === c.ch); place[ch] += c.rank; placeN[ch]++; }
}
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;

console.log(`${DRIFT ? 'drift ON (the bots drift)\n' : ''}solo best-lap pace vs field average (${nT} tracks, no items; negative = faster):`);
console.log(`average finishing place over ${N} random grids (2.50 = fair):`);
// numbers don't have to be equal: each racer's `balance` note (js/core.js) says why it sits where it does
console.log(sim.CHARACTERS.map((c, i) => {
  const ranks = gridRes.filter(r => !r.job.pack).flatMap(r => r.cars.filter(x => x.ch === c.id).map(x => x.rank));
  const sq = ranks.reduce((a, r) => a + r * r, 0), bt = [...byTrack[i]].sort((a, b) => a[0] - b[0]);
  return `  ${c.name.padEnd(7)} pace ${pct(dev[i]).padStart(7)}   place ${(place[i] / placeN[i]).toFixed(2)} ±${ci(place[i], sq, ranks.length).toFixed(2)} (${placeN[i]} races)` +
    `\n          best ${bt.slice(0, 2).map(([d, n]) => `${n} ${pct(d)}`).join(', ')} · worst ${bt.slice(-2).map(([d, n]) => `${n} ${pct(d)}`).join(', ')}` +
    `\n          why: ${c.balance || 'MISSING: add a balance note to this racer in js/core.js'}`;
}).join('\n'));
console.log(`  pace spread ${pct(Math.min(...dev))} .. ${pct(Math.max(...dev))}   place spread ${Math.min(...place.map((p, i) => p / placeN[i])).toFixed(2)} .. ${Math.max(...place.map((p, i) => p / placeN[i])).toFixed(2)}`);
console.log(`winner's margin over 2nd: normal ${avg(margin.false).toFixed(2)} s, pack mode ${avg(margin.true).toFixed(2)} s`);
const bad = [...soloRes, ...gridRes].filter(r => r.bad || r.unfinished.length);
if (bad.length) console.log(`WARNING ${bad.length} races had a non-finite value or a car that didn't finish: ${bad.slice(0, 5).map(r => r.key).join(', ')}`);
console.log(`${solo.length + races.length} races in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
