// Solo pace of every racer over several seeds (balance.mjs's solo pace uses one seed a track, which is noisy): each
// racer alone, no items, % off the field's mean per track, averaged; then one racer's per-track and per-seed breakdown.
//   node test/solo-pace.mjs [seeds, default 4] [--nodrift] [--who=<racer id>, default docky] [--jobs=N]
import * as H from './harness.mjs';
import * as P from './pool.mjs';
const sim = await H.loadSim(), nT = sim.TRACKS.length, nC = sim.CHARACTERS.length, S = +(process.argv.slice(2).find(a => !a.startsWith('--')) || 4), drift = !process.argv.includes('--nodrift');
const jobs = []; for (let seed = 1; seed <= S; seed++) for (let track = 0; track < nT; track++) for (let ch = 0; ch < nC; ch++) jobs.push({ key: `${seed}:${track}:${ch}`, track, seed, idxs: [ch], skill: 1, noItems: true, drift });
const who = (process.argv.find(a => a.startsWith('--who=')) || '--who=docky').slice(6);
const res = await P.runAll(jobs, { detail: true }), dev = Array(nC).fill(0), per = {}, DK = sim.CHARACTERS.findIndex(c => c.id === who);
for (let seed = 1; seed <= S; seed++) for (let track = 0; track < nT; track++) {
  const ts = res.filter(r => r.job.track === track && r.job.seed === seed).map(r => [r.job.idxs[0], r.cars[0].best]), mean = ts.reduce((a, [, t]) => a + t, 0) / ts.length;
  for (const [ch, t] of ts) { dev[ch] += (t / mean - 1) * 100 / nT / S; if (ch === DK) { per[track] = (per[track] || 0) + (t / mean - 1) * 100 / S; per['s' + seed] = (per['s' + seed] || 0) + (t / mean - 1) * 100 / nT; } }
}
console.log(sim.CHARACTERS.map((c, i) => `${c.id} ${dev[i].toFixed(2)}`).join('  '));
console.log(who, Object.entries(per).map(([k, v]) => `${isNaN(+k) ? k : sim.TRACKS[+k].name.slice(0, 10)} ${v.toFixed(1)}`).join(', '));
