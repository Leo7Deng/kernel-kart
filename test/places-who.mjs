// One racer's finishing place in balance.mjs's random four-kart grids (same grids, seeds and tracks, pack mode off),
// as it is and with stat tweaks, run on the same races so the difference is paired (much less noisy than two runs).
//   node test/places-who.mjs [grids, default 640] [--who=docky] [--drift] [--try=accel=0.28,top=0.89 ...] [--jobs=N]
//   each --try is one variant: comma-separated stats keys (accel, top, grip, weight) or CHARACTERS fields (driftGrip)
import { loadSim, mulberry, runRace } from './harness.mjs';
import { mapPool, poolWorker, serve } from './pool.mjs';

if (poolWorker(import.meta.url)) {
  const sim = await loadSim(), base = sim.CHARACTERS.map(c => ({ stats: { ...c.stats }, driftGrip: c.driftGrip }));
  serve(({ job, who, set }) => {
    sim.CHARACTERS.forEach((c, i) => { c.stats = { ...base[i].stats }; c.driftGrip = base[i].driftGrip; });
    const ch = sim.CHARACTERS.find(c => c.id === who);
    for (const [k, v] of Object.entries(set)) { if (k in ch.stats) ch.stats[k] = v; else ch[k] = v; }
    return runRace(sim, job).cars.find(c => c.ch === who).rank;
  });
} else {
  const argv = process.argv.slice(2), drift = argv.includes('--drift'), N = +(argv.find(a => !a.startsWith('--')) || 640);
  const who = (argv.find(a => a.startsWith('--who=')) || '--who=docky').slice(6);
  const tries = [{}, ...argv.filter(a => a.startsWith('--try=')).map(a => Object.fromEntries(a.slice(6).split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })))];
  const sim = await loadSim(), nT = sim.TRACKS.length, nC = sim.CHARACTERS.length, W = sim.CHARACTERS.findIndex(c => c.id === who);
  const grid = k => { const rng = mulberry(k * 31 + 7), pool = [...Array(nC).keys()]; for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; } return pool.slice(0, 4); };   // as balance.mjs
  const jobs = []; for (let k = 0; k < N; k++) { const idxs = grid(k); if (idxs.includes(W)) jobs.push({ key: `grid:${k}`, track: k % nT, seed: 1000 + k, idxs, skill: 1, drift }); }
  const tasks = tries.flatMap(set => jobs.map(job => ({ job, who, set })));
  const ranks = await mapPool(import.meta.url, tasks), n = jobs.length, per = tries.map((_, t) => ranks.slice(t * n, t * n + n));
  const ci = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return [m, 1.96 * Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length / a.length)]; };
  console.log(`${who}, ${n} of ${N} grids${drift ? ', drift on' : ''}`);
  tries.forEach((set, t) => {
    const [m, e] = ci(per[t]), [d, de] = ci(per[t].map((r, i) => r - per[0][i]));
    console.log(`  ${Object.entries(set).map(([k, v]) => `${k}=${v}`).join(',') || 'as is'}: place ${m.toFixed(2)} ±${e.toFixed(2)}${t ? `, vs as is ${d >= 0 ? '+' : ''}${d.toFixed(2)} ±${de.toFixed(2)}` : ''}`);
  });
}
