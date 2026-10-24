// npm test: every track finishes with nothing blowing up, and the races replay exactly as recorded in golden.json.
// node test/sim.test.mjs --update   rewrites golden.json (only after checking the change is intended)
import fs from 'node:fs';
import { loadSim } from './harness.mjs';
import { runAll } from './pool.mjs';

const GOLDEN = new URL('./golden.json', import.meta.url), update = process.argv.includes('--update');
const sim = await loadSim();
const golden = !update && fs.existsSync(GOLDEN) ? JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) : {};
const jobs = [];
// four different racers per grid: step through the cast by a stride that shares no factor with its size (3 with 8 racers)
const nC = sim.CHARACTERS.length, gcd = (a, b) => b ? gcd(b, a % b) : a, stride = [3, 2, 5, 7].find(k => gcd(k, nC) === 1);
for (let track = 0; track < sim.TRACKS.length; track++) for (const level of [0, 1, 2]) for (const seed of [1, 2]) {
  const idxs = [0, 1, 2, 3].map(i => (i * stride + seed + track + level) % nC);
  jobs.push({ key: `${track}:${sim.TRACKS[track].name}:L${level}:s${seed}`, track, seed, level, idxs });
}
const t0 = Date.now(), results = await runAll(jobs), out = {}, fails = [];
// every item has a weight for each of the 4 position tiers, and every tier has something to roll
const pair = w => Array.isArray(w) && w.length === 2 && w.every(x => x >= 0);
const okW = w => typeof w === 'number' ? w >= 0 : pair(w) || (w && typeof w === 'object' && w.from >= 0 && w.from < 1 && pair(w.w));   // a weight, [close, far], or { from, w: [a, b] }
for (const [id, it] of Object.entries(sim.ITEMS)) for (const [t, w] of Object.entries(it.odds)) if (!sim.TIERS.includes(t) || !okW(w)) fails.push(`${id}: odds.${t} must be a weight, [close, far] or { from, w: [a, b] } with weights >= 0, got ${JSON.stringify(w)}`);
for (const t of sim.TIERS) for (const g of [0, 1]) if (!Object.keys(sim.itemChances(t, g)).length) fails.push(`${t} at gap ${g}: no item can be rolled`);
// every single box a track asks for (singleBoxes, geometry.js) is placed: on a road, near a row (a layout change can move it off)
const { buildTrack, makeCourseBoxes } = await import('../js/geometry.js');
for (const def of sim.TRACKS) if (def.singleBoxes) {
  const T = buildTrack(def), boxes = makeCourseBoxes(T.routes || [T]), sc = def.scale || 1.5;
  for (const [x, y, u] of def.singleBoxes) if (!boxes.some(b => !b.gold && [...b.on.values()].some(o => Math.abs(o.lat - u * def.width / 2) < def.width * 0.2) && Math.hypot(b.x - x * sc, b.y - y * sc) < def.width)) fails.push(`${def.name}: single box at [${x},${y}] isn't placed (not on a road, or no box row near it)`);
}
// every "Watch how" clip in the menu (js/clip.js) still does what it shows: its scripted keys take the kart into the secret
const { CLIPS, clipStart, clipStep } = await import('../js/clip.js');
for (const [name, d] of Object.entries(CLIPS)) { const k = clipStart(d); while (!k.done) clipStep(k); if (!k.takenT || !k.backT) fails.push(`clip ${name}: its keys no longer take the kart into the secret (retune it in js/clip.js)`); }
for (const { key, order, times, picks, hash, bad, unfinished } of results.sort((a, b) => jobs.findIndex(j => j.key === a.key) - jobs.findIndex(j => j.key === b.key))) {
  out[key] = { order, times, picks, hash };
  if (bad) fails.push(`${key}: ${bad}`);
  if (unfinished.length) fails.push(`${key}: did not finish in time: ${unfinished.join(', ')}`);
  if (golden[key] && JSON.stringify(golden[key]) !== JSON.stringify(out[key])) fails.push(`${key}: differs from golden\n    was ${JSON.stringify(golden[key])}\n    now ${JSON.stringify(out[key])}`);
}
if (!update) for (const k in golden) if (!out[k]) fails.push(`${k}: in golden but not run`);
const n = Object.keys(out).length;
if (update) { fs.writeFileSync(GOLDEN, JSON.stringify(out, null, 1) + '\n'); console.log(`wrote golden for ${n} races`); }
else if (!Object.keys(golden).length) fails.push('no golden.json: run with --update first');
console.log(`${n} races in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (fails.length) { console.error(fails.map(f => 'FAIL ' + f).join('\n')); process.exit(1); }
console.log('ok');
