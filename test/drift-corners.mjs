// node test/drift-corners.mjs [tracks...]: which corners a bot's drift pays in (race-drift.js driftAI). One bot alone (no
// items, no bits) drives each track with drift on and with it off; every drift's stretch (from 300 before the press to
// 500 past the release, by progress) is timed in both runs. Prints the gain per drift binned by how slow the corner is
// (vr: its slowest speed × skill as a share of top speed) and how long it'd be drifting (dur), plus per track.
// Env: BOT='{"SLOW":0.8,"DUR":0}' overrides race-drift.js BOT; CH=octo,duke; LV=0,1,2; SEEDS=2; JSON=1 dumps every drift.
import { loadSim, mulberry } from './harness.mjs';
const sim = await loadSim();
const { BOT } = await import('../js/race-drift.js');
if (process.env.BOT) Object.assign(BOT, JSON.parse(process.env.BOT));
const DT = 1 / 60, SK = [0.92, 1.01, 1.09];
const args = process.argv.slice(2).map(Number).filter(n => !isNaN(n));
const tracks = args.length ? args : sim.TRACKS.map((_, i) => i);
const chars = (process.env.CH || 'octo,ferris,duke,droid,swifty').split(',');
const lvs = (process.env.LV || '0,1,2').split(',').map(Number), seeds = +(process.env.SEEDS || 2);

function run(ti, ch, lv, seed, drift) {
  sim.setRandom(mulberry(seed * 7919 + ti * 104729 + lv));
  const race = new sim.Race(ti, { racers: [{ ch: sim.CHARACTERS.find(c => c.id === ch), human: false, pIndex: 0 }], laps: 3, aiLevel: lv, drift });
  race.boxes = []; race.bits = []; race.countdown = 0.01;
  const c = race.cars[0]; c.ai.skill = SK[lv];
  const P = [], drifts = []; let was = false, cur = null, f = 0;
  while (!c.finished && f < 60 * 400) {
    race.update(DT); race.over = false; f++;
    P.push([race.time, c.progress]);
    if (c.dOn && !was) cur = { p0: c.progress, vr: c.ai.dz ? c.ai.dz.vr : NaN, dur: c.ai.dz ? c.ai.dz.dur : NaN, v0: c.speed / c.top };
    if (!c.dOn && was && cur) { cur.p1 = c.progress; cur.tier = c.mtTier && c.mtT > 0 ? c.mtTier : 0; cur.spin = c.spinT > 0; cur.dT = c.dT; drifts.push(cur); cur = null; }
    was = c.dOn;
  }
  return { P, drifts, t: c.finishTime, fin: c.finished };
}
const tAt = (P, p) => { let lo = 0, hi = P.length - 1; if (P[hi][1] < p) return NaN; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m][1] < p) lo = m; else hi = m; } const [t0, p0] = P[lo], [t1, p1] = P[hi]; return p1 > p0 ? t0 + (t1 - t0) * (p - p0) / (p1 - p0) : t1; };
const all = [];
for (const ti of tracks) {
  const tr = [];
  for (const ch of chars) for (const lv of lvs) for (let s = 0; s < seeds; s++) {
    const on = run(ti, ch, lv, 21 + s, true), off = run(ti, ch, lv, 21 + s, false);
    for (const d of on.drifts) {
      const a = d.p0 - 300, b = d.p1 + 500;
      const g = (tAt(on.P, b) - tAt(on.P, a)) - (tAt(off.P, b) - tAt(off.P, a));
      if (Number.isFinite(g) && Math.abs(g) < 3) { const r = { ...d, g, ti, ch, lv }; tr.push(r); all.push(r); }
    }
  }
  const n = tr.length, sum = tr.reduce((x, r) => x + r.g, 0);
  console.log(`${sim.TRACKS[ti].name.padEnd(18)} drifts ${String(n).padStart(4)}  gain/drift ${(sum / Math.max(1, n)).toFixed(3)} s  paid ${(tr.filter(r => r.g < 0).length / Math.max(1, n) * 100).toFixed(0)}%  ` + lvs.map(lv => { const q = tr.filter(r => r.lv === lv); return `L${lv} ${(q.reduce((x, r) => x + r.g, 0) / Math.max(1, q.length)).toFixed(3)}`; }).join(' '));
}
const bin = (key, edges) => { for (let i = 0; i < edges.length - 1; i++) { const q = all.filter(r => r[key] >= edges[i] && r[key] < edges[i + 1]); if (q.length) console.log(`  ${key} ${edges[i]}..${edges[i + 1]}: n ${String(q.length).padStart(4)}  gain ${(q.reduce((x, r) => x + r.g, 0) / q.length).toFixed(3)} s  paid ${(q.filter(r => r.g < 0).length / q.length * 100).toFixed(0)}%  tiers ${[0, 1, 2, 3].map(t => q.filter(r => r.tier === t).length).join('/')}`); } };
console.log(`\nall: ${all.length} drifts, gain ${(all.reduce((x, r) => x + r.g, 0) / Math.max(1, all.length)).toFixed(3)} s a drift, spins ${all.filter(r => r.spin).length}`);
bin('vr', [0, 0.35, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.9, 2]);
bin('dur', [0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.5, 3, 10]);
bin('tier', [0, 1, 2, 3, 4]);
for (const ch of chars) { const q = all.filter(r => r.ch === ch); console.log(`  ${ch.padEnd(7)} n ${q.length} gain ${(q.reduce((x, r) => x + r.g, 0) / Math.max(1, q.length)).toFixed(3)}`); }
if (process.env.JSON) console.log(JSON.stringify(all.map(r => [r.ti, r.ch, r.lv, +r.vr.toFixed(3), +r.dur.toFixed(2), r.tier, +r.g.toFixed(3)])));
