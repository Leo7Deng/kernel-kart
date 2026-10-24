// node test/drift-bots.mjs [solo|pack|both] [seeds] [tracks...]: what the bots' drift (race-drift.js driftAI) does, with
// drift on against the same races with drift off.
//  solo: one bot alone per track (no items, no bits), Octo, Ferris, Duke, Bugdroid and Swifty at each level's skill
//        (L0 0.92, L1 1.01, L2 1.09): finish time with drift on vs off, drifts, mini-turbos by tier, spin-outs.
//  pack: four-bot races with items per level: the winner's time on vs off, and per kart per race: drifts, mini-turbos
//        by tier, spin-outs; and any that didn't finish.
// BOT='{"P0":1}' tries other settings for race-drift.js BOT (the harness applies them in every worker).
import { loadSim } from './harness.mjs';
import { runAll } from './pool.mjs';

const sim = await loadSim();
const args = process.argv.slice(2);
const mode = ['solo', 'pack', 'both'].includes(args[0]) ? args.shift() : 'both';
const seeds = +(args.shift() || 2);
const tracks = args.length ? args.map(Number) : sim.TRACKS.map((_, i) => i);
const SK = [0.92, 1.01, 1.09], CH = ['octo', 'ferris', 'duke', 'droid', 'swifty'].map(id => sim.CHARACTERS.findIndex(c => c.id === id));
const bot = process.env.BOT ? JSON.parse(process.env.BOT) : null;   // BOT='{"P0":1}': other settings for race-drift.js BOT
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const f2 = v => (v >= 0 ? '+' : '') + v.toFixed(2);

if (mode !== 'pack') {
  const jobs = [];
  for (const track of tracks) for (const ch of CH) for (let lv = 0; lv < 3; lv++) for (let s = 0; s < seeds; s++) for (const drift of [false, true])
    jobs.push({ key: `solo:${track}:${ch}:${lv}:${s}:${drift}`, track, seed: 11 + s, level: lv, idxs: [ch], skill: SK[lv], noItems: true, drift, bot, k: { track, ch, lv, s } });
  const res = await runAll(jobs, { detail: true });
  const get = (track, ch, lv, s, drift) => res.find(r => r.key === `solo:${track}:${ch}:${lv}:${s}:${drift}`).cars[0];
  console.log('solo (one bot, no items): finish time drift on vs off, % (negative = drifting is quicker); drifts, turbos b/o/p, spins per race');
  const byLv = [[], [], []], byCh = {}, st = [[], [], []];
  for (const track of tracks) {
    let line = `  ${sim.TRACKS[track].name.padEnd(18)}`;
    for (let lv = 0; lv < 3; lv++) {
      const d = [];
      for (const ch of CH) for (let s = 0; s < seeds; s++) {
        const a = get(track, ch, lv, s, false), b = get(track, ch, lv, s, true);
        if (!a.finished || !b.finished) { line += ' DNF'; continue; }
        const p = (b.time / a.time - 1) * 100; d.push(p); byLv[lv].push(p); (byCh[ch] ||= [[], [], []])[lv].push(p); st[lv].push(b);
      }
      line += `  L${lv} ${f2(avg(d))}%`;
    }
    console.log(line);
  }
  for (let lv = 0; lv < 3; lv++) {
    const S = st[lv];
    console.log(`  L${lv}: ${f2(avg(byLv[lv]))}% (best ${f2(Math.min(...byLv[lv]))}, worst ${f2(Math.max(...byLv[lv]))})  drifts ${avg(S.map(c => c.drifts)).toFixed(1)}  turbos ${[0, 1, 2].map(k => avg(S.map(c => c.tiers[k])).toFixed(1)).join('/')}  spins ${avg(S.map(c => c.spins)).toFixed(2)}`);
  }
  for (const ch of CH) console.log(`  ${sim.CHARACTERS[ch].name.padEnd(9)} ${[0, 1, 2].map(lv => `L${lv} ${f2(avg(byCh[ch][lv]))}%`).join('  ')}`);
}

if (mode !== 'solo') {
  const nC = sim.CHARACTERS.length, jobs = [];
  for (const track of tracks) for (let lv = 0; lv < 3; lv++) for (let s = 0; s < seeds; s++) {
    const idxs = [0, 1, 2, 3].map(i => (track * 3 + s * 7 + lv + i * 3) % nC);
    for (const drift of [false, true]) jobs.push({ key: `pack:${track}:${lv}:${s}:${drift}`, track, seed: 500 + s, level: lv, idxs, drift, bot });
  }
  const res = await runAll(jobs, { detail: true });
  console.log(`\npack (four bots, items on, ${tracks.length} tracks x ${seeds} seeds): per level`);
  for (let lv = 0; lv < 3; lv++) {
    const R = d => res.filter(r => r.job.level === lv && r.job.drift === d);
    const win = d => avg(R(d).map(r => Math.min(...r.cars.filter(c => c.finished).map(c => c.time))));
    const C = R(true).flatMap(r => r.cars), unf = [...R(false), ...R(true)].reduce((a, r) => a + r.unfinished.length, 0);
    console.log(`  L${lv}: winner ${win(false).toFixed(2)} s -> ${win(true).toFixed(2)} s (${f2((win(true) / win(false) - 1) * 100)}%)  per kart per race: drifts ${avg(C.map(c => c.drifts)).toFixed(1)}, turbos b/o/p ${[0, 1, 2].map(k => avg(C.map(c => c.tiers[k])).toFixed(2)).join('/')}, spin-outs ${avg(C.map(c => c.spins)).toFixed(3)}${unf ? `  UNFINISHED ${unf}` : ''}`);
  }
  const bad = res.filter(r => r.bad); if (bad.length) console.log('NON-FINITE', bad.map(r => r.key + ' ' + r.bad).join('; '));
}
