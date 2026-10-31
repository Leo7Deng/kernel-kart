// npm run frontrun: how much each track favours whoever is in front, a 0-10 score (10: leader very hard to catch) with
// a one-line reason, written to js/frontrun-data.js (shown in the menu by js/frontrun.js). Two parts:
//  1. races: seeded all-bot races, mixed levels and field sizes: hold rate at 1/3, 1/2, 2/3; lead changes a minute
//     (a leader counts after holding 2 s); the leader's margin trend; hits on the leader and what they cost.
//  2. tools: one kart alone (Octo, Docky, Bugdroid) replayed with a mine on its line, or a Turbo fired, at ~36 spots a
//     lap: what a leader can do on purpose that the bots don't.
// Score (fixed anchors, so a partial re-run stays comparable; see `score` below):
//   10 × (0.6 hold + 0.15 calm + 0.25 tools), each part 0..1:
//   hold  = the average of the three hold rates, 0.2 -> 0, 0.6 -> 1;
//   calm  = lead changes a minute, 3 -> 0, 1.2 -> 1;
//   tools = the best mine spot's cost to a chaser (2 s -> 0, 5 s -> 1) and the best Turbo spot's edge over an ordinary
//           one (0.5 s -> 0, 2.5 s -> 1), whichever is bigger.
// ± on the score: a bootstrap over the races (the tools part is held fixed).
// node test/frontrun.mjs [races per track=96] [tracks: indices or names, comma-separated; default all] [--no-write] [--no-tools] [--jobs=N] [--save=raw.json | --load=raw.json]
//   (--jobs=N: workers, default every core, test/pool.mjs). Re-run just changed tracks (`npm run frontrun -- 96 3,19`):
//   the others' entries are kept.
import fs from 'node:fs';
import { loadSim, mulberry, runRace } from './harness.mjs';
import { JOBS, mapPool, poolWorker, serve } from './pool.mjs';

// tracks being reworked as this was measured: their numbers are shown as provisional until a re-run after they land
const PROVISIONAL = ['Moonshot', 'Epoch Expressway'];
const OUT = new URL('../js/frontrun-data.js', import.meta.url);
const ITEM_HITS = new Set(['mine', 'duck', 'bubble', 'leak', 'panic', 'pull', 'sudo', 'ff', 'loop', 'squish', 'phoenix']);   // fxHit types an item (or another kart's secret) caused
const OWN = new Set(['burnout', 'drift']);   // the kart's own doing (a burnout at GO, an over-held drift): not the track's, not an item's
const HAZ_NAME = { fall: 'a jump', splash: 'a jump over water', crash: 'an overshoot', lava: 'lava', train: 'the train', stamp: 'a press', slag: 'the slag', wave: 'a wave', boulder: 'a boulder', claw: 'the crab', gate: 'the gate', drawbridge: 'the drawbridge', jet: 'a jet', hand: 'the minute hand', pendulum: 'the pendulum', gc: 'a snowplough', thicket: 'the thicket', trex: 'the T-rex', catapult: 'a catapult', hover: 'hover traffic', pad: 'a rocket bay' };
const TOOL_KARTS = [3, 6, 9];   // Octo (middling), Docky (heavy, fast), Bugdroid (light, grippy)
const H = 10, DT = 1 / 60;      // tools: progress compared H seconds after the spot

const clamp01 = v => Math.max(0, Math.min(1, v));
const lin = (v, a, b) => clamp01((v - a) / (b - a));
const toolsOf = (mineBest, turboEdge) => Math.max(lin(mineBest, 2, 5), lin(turboEdge, 0.5, 2.5));
export function score({ hold, changes, mineBest, turboEdge }) {
  return 10 * (0.6 * lin(hold, 0.2, 0.6) + 0.15 * lin(changes, 3, 1.2) + 0.25 * toolsOf(mineBest, turboEdge));
}

// ---------- 1. one all-bot race
function raceJob(sim, job) {
  const tl = [], hits = [];
  let picks = 0, p0 = null, last = null, total = 0, winT = 0, winner = -1;
  const res = runRace(sim, { ...job,
    onStart: r => {
      const fx0 = r.fxHit; r.fxHit = function (c, col, type) { if (!this.winner) hits.push({ t: this.time, v: c.idx, type: type || 'mine' }); return fx0.call(this, c, col, type); };
      const g0 = r.giveItem; r.giveItem = function (...a) { if (!this.winner) picks++; return g0.apply(this, a); };
    },
    onFrame: (r, f) => {
      if (winner >= 0) return;
      // (a kart's progress drops back a lap on the frame it finishes, so the distance is taken from the frame before)
      if (r.winner) { winner = r.winner.idx; total = last[winner] - p0; winT = r.winner.finishTime; return; }
      last = r.cars.map(c => c.progress); if (p0 === null) p0 = Math.max(...last);
      if (f % 6 === 0) tl.push([r.time, last]);
    } });
  if (res.bad || winner < 0) return null;
  const v = total / winT, n = job.idxs.length;
  const lead = ps => { let a = 0; for (let i = 1; i < ps.length; i++) if (ps[i] > ps[a]) a = i; let m = -Infinity; for (let i = 0; i < ps.length; i++) if (i !== a) m = Math.max(m, ps[i]); return [a, (ps[a] - m) / v]; };
  const L = tl.map(([t, ps]) => { const [a, m] = lead(ps); return { t, a, m, f: (Math.max(...ps) - p0) / total }; });
  // hold rates
  const holds = [1 / 3, 1 / 2, 2 / 3].map(fr => { const s = L.find(x => x.f >= fr); return s ? +(s.a === winner) : 0; });
  // lead changes (a new leader that holds it 2 s), after the first 10%
  let cur = -1, changes = 0;
  for (let i = 0; i < L.length; i++) {
    if (L[i].f < 0.1) { cur = L[i].a; continue; }
    if (L[i].a === cur) continue;
    let j = i + 1; while (j < L.length && L[j].a === L[i].a) j++;
    if ((j < L.length ? L[j].t : L[L.length - 1].t + 2) - L[i].t >= 2) { changes++; cur = L[i].a; }   // (still leading at the finish counts)
  }
  // the leader's margin over 2nd: its trend (least squares, s per 30 s) from 15% on
  const pts = L.filter(x => x.f >= 0.15); let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of pts) { sx += p.t; sy += p.m; sxx += p.t * p.t; sxy += p.t * p.m; }
  const k = pts.length, slope = k > 2 ? (k * sxy - sx * sy) / (k * sxx - sx * sx) * 30 : 0;
  // hits on whoever was leading, and what they cost: the leader's margin 3 s later against how it moves over any 3 s
  const at = t => { let lo = 0, hi = tl.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (tl[m][0] < t) lo = m + 1; else hi = m; } return lo; };
  const marginOf = (i, car) => { const ps = tl[i][1]; let m = -Infinity; for (let j = 0; j < ps.length; j++) if (j !== car) m = Math.max(m, ps[j]); return (ps[car] - m) / v; };
  let drift = 0, dn = 0;
  for (let i = 0; i + 30 < tl.length; i += 10) { const [a] = lead(tl[i][1]); drift += marginOf(i + 30, a) - marginOf(i, a); dn++; }
  drift = dn ? drift / dn : 0;
  const onLeader = { item: 0, haz: 0, itemCost: 0, hazCost: 0, types: {} };
  for (const h of hits) {
    const i = Math.max(0, at(h.t) - 1); if (i + 30 >= tl.length) continue;
    const [a] = lead(tl[i][1]); if (a !== h.v) continue;
    if (OWN.has(h.type)) continue;
    const cost = -(marginOf(i + 30, a) - marginOf(i, a) - drift), kind = ITEM_HITS.has(h.type) ? 'item' : 'haz';
    onLeader[kind]++; onLeader[kind + 'Cost'] += cost; onLeader.types[h.type] = (onLeader.types[h.type] || 0) + 1;
  }
  const byRank = [...res.cars].sort((a, b) => a.rank - b.rank);
  return { track: job.track, n, laps: res.race.laps, winT, holds, changes, perMin: changes / (winT / 60), slope, margin: byRank[1].time - byRank[0].time, onLeader, picks: picks / (n * winT / 60) };
}

// ---------- 2. a leader's tools: a mine on the line at each spot, a Turbo at each spot (one kart alone)
function toolJob(sim, job) {
  const base = { track: job.track, seed: 77, level: 1, idxs: [job.kart], skill: 1, noItems: true };
  const prog = [];
  const b = runRace(sim, { ...base, onFrame: (r, f) => { const c = r.cars[0]; prog[f] = [c.progress, c.x, c.y, c.finished]; } });
  if (b.bad || !b.cars[0].finished) return null;
  const fin = prog.findIndex(p => p && p[3]), p0 = prog[1][0], total = prog[fin - 1][0] - p0, v = total / (fin * DT), laps = b.race.laps;   // (progress drops back a lap on the finishing frame)
  const [f0, f1] = laps > 1 ? [1 / laps, 2 / laps] : [0.05, 1];
  const spots = [];
  for (let i = 0; i < 36; i++) {
    const fr = f0 + (f1 - f0) * i / 36, f = prog.findIndex(p => p && p[0] - p0 >= fr * total);
    if (f < 50 || f + H * 60 >= fin - 30) continue;
    spots.push({ fr: (fr - f0) / (f1 - f0), f });
  }
  const run = (stop, hook) => { let p = 0; const extra = { types: [], secret: false }; runRace(sim, { ...base, stopAt: stop, onStart: r => hook(r, extra), onFrame: (r, f) => { if (f === stop) p = r.cars[0].progress; if (r.cars[0].secretT > 0) extra.secret = true; } }); return [p, extra]; };
  const out = [];
  for (const { fr, f } of spots) {
    const stop = f + H * 60, p0 = prog[stop][0];
    // a mine where the kart will be at frame f, dropped 0.75 s before
    const [pm, em] = run(stop, (r, e) => {
      const fx0 = r.fxHit; r.fxHit = function (c, col, type) { e.types.push(type || 'mine'); return fx0.call(this, c, col, type); };
      const u0 = r.update; let done = false;
      r.update = function (dt) { u0.call(this, dt); if (!done && Math.round(this.time / DT) >= f - 45) { done = true; const [, x, y] = prog[f]; const pr = this.cars[0]; this.mines.push({ x, y, s: pr.s, lat: 0, T: pr.T, life: 25, arm: 0, owner: null, item: 'tomato' }); } };
    });
    // a Turbo fired at frame f, the bot driving / held flat 2.5 s
    const turbo = flat => run(stop, (r, e) => {
      const u0 = r.update, a0 = r.aiThrottle; let fired = -1;
      r.aiThrottle = function (c, dt, bh) { return flat && fired >= 0 && this.time - fired < 2.5 ? true : a0.call(this, c, dt, bh); };
      r.update = function (dt) { u0.call(this, dt); if (fired < 0 && Math.round(this.time / DT) >= f) { fired = this.time; const c = this.cars[0]; c.item = 'boost'; c.charges = 1; c.itemT = 1; this.useItem(c, this.cars); } };
    });
    const [pb, eb] = turbo(false), [pf, ef] = turbo(true);
    out.push({ fr, mine: (p0 - pm) / v, chain: em.types.slice(1), turbo: Math.max(pb, pf) / v - p0 / v, secret: eb.secret || ef.secret });
  }
  return { track: job.track, kart: job.kart, spots: out };
}

// ---------- summary per track
const stat = xs => { const n = xs.length, m = xs.reduce((a, b) => a + b, 0) / Math.max(1, n), sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, n - 1)); return { n, m, ci: 1.96 * sd / Math.sqrt(Math.max(1, n)) }; };
const top = (xs, k) => { const s = [...xs].sort((a, b) => b - a).slice(0, k); return s.reduce((a, b) => a + b, 0) / Math.max(1, s.length); };
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };
function summarise(name, races, tools) {
  const hold = r => (r.holds[0] + r.holds[1] + r.holds[2]) / 3;
  const S = { races: races.length, laps: races[0].laps,
    hold3: stat(races.map(r => r.holds[0])), hold2: stat(races.map(r => r.holds[1])), hold23: stat(races.map(r => r.holds[2])), hold: stat(races.map(hold)),
    changes: stat(races.map(r => r.perMin)), slope: stat(races.map(r => r.slope)), margin: stat(races.map(r => r.margin)),
    itemHits: stat(races.map(r => r.onLeader.item)), hazHits: stat(races.map(r => r.onLeader.haz)),
    itemCost: stat(races.map(r => r.onLeader.itemCost)), hazCost: stat(races.map(r => r.onLeader.hazCost)), picks: stat(races.map(r => r.picks)),
    winT: stat(races.map(r => r.winT)) };
  const types = {}; for (const r of races) for (const [k, n] of Object.entries(r.onLeader.types)) types[k] = (types[k] || 0) + n;
  S.itemRate = stat(races.map(r => r.onLeader.item / (r.winT / 60)));
  S.hazTop = Object.entries(types).filter(([k]) => !ITEM_HITS.has(k) && !OWN.has(k)).sort((a, b) => b[1] - a[1])[0] || null;
  // tools: each spot averaged over the karts (it has to work for all, not one lucky one), then the best 2 spots' average;
  // ± is the spread kart by kart.
  if (tools.length && tools.every(t => t.spots.length)) {
    const spots = new Map();
    for (const t of tools) for (const s of t.spots) { const k = Math.round(s.fr * 36); if (!spots.has(k)) spots.set(k, []); spots.get(k).push(s); }
    const all = [...spots.entries()].filter(([, ss]) => ss.length === tools.length).map(([k, ss]) => ({ fr: k / 36, ss,
      mine: ss.reduce((a, s) => a + s.mine, 0) / ss.length, turbo: ss.reduce((a, s) => a + s.turbo, 0) / ss.length }));
    const best = key => [...all].sort((a, b) => b[key] - a[key]).slice(0, 2);
    const perKart = (key, i) => best(key).reduce((a, sp) => a + sp.ss[i][key], 0) / 2;
    const tMed = median(all.map(s => s.turbo));
    S.mineBest = { ...stat(tools.map((_, i) => perKart('mine', i))), m: top(all.map(s => s.mine), 2) };
    S.mineMed = { m: median(all.map(s => s.mine)) };
    S.turboEdge = { ...stat(tools.map((_, i) => perKart('turbo', i) - median(all.map(s => s.ss[i].turbo)))), m: top(all.map(s => s.turbo), 2) - tMed };
    // what the best mine spots chain into, where the best one is, and whether the best Turbo spots took a secret
    const chains = {}; for (const sp of best('mine')) for (const s of sp.ss) for (const k of new Set(s.chain)) chains[k] = (chains[k] || 0) + 1;
    S.chain = Object.entries(chains).sort((a, b) => b[1] - a[1])[0] || null;
    S.secret = best('turbo').some(sp => sp.ss.some(s => s.secret));
    S.mineAt = best('mine')[0].fr;
  } else { S.mineBest = S.mineMed = S.turboEdge = { n: 0, m: 0, ci: 0 }; S.chain = null; S.secret = false; }
  const sc = races => score({ hold: races.reduce((a, r) => a + hold(r), 0) / races.length, changes: races.reduce((a, r) => a + r.perMin, 0) / races.length, mineBest: S.mineBest.m, turboEdge: S.turboEdge.m });
  S.score = sc(races);
  const rng = mulberry(races.length * 131 + name.length), boot = [];
  for (let b = 0; b < 400; b++) boot.push(sc(races.map(() => races[Math.floor(rng() * races.length)])));
  boot.sort((a, b) => a - b); S.lo = boot[10]; S.hi = boot[389];
  S.reason = reason(S);
  return S;
}
// one short line from the signals that stand out: how the lead goes, then what helps the leader or the pack most
const HAZ_LEAD = { fall: 'a missed jump', splash: 'the water', crash: 'an overshoot', lava: 'the lava', train: 'the train', stamp: 'the presses', slag: 'the slag', wave: 'the waves', boulder: 'the boulders', claw: 'the crab', gate: 'the gate', drawbridge: 'the drawbridge', jet: 'the jets', hand: 'the minute hand', pendulum: 'the pendulum', gc: 'the snowploughs', thicket: 'the thicket', trex: 'the T-rex', catapult: 'the catapults', hover: 'the hover traffic', pad: 'the rocket bays' };
function reason(S) {
  const lead = S.hold.m >= 0.48 ? 'Leaders tend to hold on' : S.hold.m <= 0.33 ? 'The lead swaps a lot' : 'The lead can change hands';
  const up = [], down = [];   // [strength, text]: what helps the leader, what helps the pack
  if (S.secret && S.turboEdge.m >= 1) up.push([S.turboEdge.m / 2, 'a Turbo at the right spot takes the secret shortcut']);
  else if (S.turboEdge.m >= 1.5) up.push([S.turboEdge.m / 2.5, 'a Turbo at the right spot gains a lot']);
  if (S.mineBest.m >= 3 && S.chain && HAZ_NAME[S.chain[0]]) up.push([S.mineBest.m / 4, `a mine before ${HAZ_NAME[S.chain[0]]} is brutal`]);
  else if (S.mineBest.m >= 3.5) up.push([S.mineBest.m / 5, 'a well-placed mine is brutal']);
  if (S.itemRate.m <= 5.8) up.push([(6.5 - S.itemRate.m) / 1.5, 'few items reach the leader']);
  if (S.itemRate.m >= 8.5) down.push([S.itemRate.m / 9, 'lots of boxes keep the leader under fire']);
  if (S.hazHits.m >= 0.4 && S.hazTop && HAZ_LEAD[S.hazTop[0]]) down.push([S.hazHits.m / 0.6, `the leader often gets caught by ${HAZ_LEAD[S.hazTop[0]]}`]);
  if (S.changes.m <= 1.5) up.push([(1.8 - S.changes.m) / 0.5, 'the order settles early']);
  if (S.changes.m >= 2.5) down.push([S.changes.m / 2.8, 'the pack keeps trading places']);
  const by = xs => xs.sort((a, b) => b[0] - a[0]).map(x => x[1]);
  const first = S.score >= 4.5 ? [...by(up), ...by(down)] : [...by(down), ...by(up)];
  if (!first.length) first.push(`${Math.round(S.hold.m * 100)}% of mid-race leaders win`);
  return `${lead}: ${first.slice(0, 2).join(', ')}.`;
}

if (!poolWorker(import.meta.url)) {
  const args = process.argv.slice(2), flags = new Set(args.filter(a => a.startsWith('--'))), pos = args.filter(a => !a.startsWith('--'));
  const N = +(pos[0] || 96), sim = await loadSim(), nC = sim.CHARACTERS.length;
  const pick = pos[1] ? pos[1].split(',').map(s => /^\d+$/.test(s) ? +s : sim.TRACKS.findIndex(t => t.name.toLowerCase() === s.toLowerCase())) : sim.TRACKS.map((_, i) => i);
  if (pick.some(i => !sim.TRACKS[i])) { console.error('unknown track in', pos[1]); process.exit(1); }
  const jobs = [];
  for (const track of pick) {
    if (!flags.has('--no-tools')) for (const kart of TOOL_KARTS) jobs.push({ kind: 'tool', track, kart });
    for (let k = 0; k < N; k++) {
      const rng = mulberry(k * 977 + track * 31 + 11), pool = [...Array(nC).keys()];
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      jobs.push({ kind: 'race', track, seed: 9000 + k, level: k % 3, idxs: pool.slice(0, [4, 6, 8][Math.floor(k / 3) % 3]) });
    }
  }
  jobs.sort((a, b) => (a.kind === 'tool' ? 0 : 1) - (b.kind === 'tool' ? 0 : 1));   // the long tool jobs first
  const t0 = Date.now(), W = +(args.find(a => a.startsWith('--workers='))?.slice(10) || JOBS), results = [];
  const opt = k => args.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  if (opt('load')) results.push(...JSON.parse(fs.readFileSync(opt('load'), 'utf8')).filter(r => pick.includes(r.track)));   // the raw results of an earlier run (--save): rescore without racing
  else results.push(...await mapPool(import.meta.url, jobs, { jobs: W, onResult: done => { if (done % 50 === 0) process.stderr.write(`  ${done}/${jobs.length} jobs, ${((Date.now() - t0) / 1000).toFixed(0)} s\n`); } }));   // (in job order)
  if (opt('save')) fs.writeFileSync(opt('save'), JSON.stringify(results));
  const old = fs.existsSync(OUT) ? (await import(OUT.href + '?' + Date.now())).default : {};
  const data = {};
  for (const t of sim.TRACKS) if (old[t.name]) data[t.name] = old[t.name];
  const rows = [];
  for (const track of pick) {
    const name = sim.TRACKS[track].name, races = results.filter(r => r && r.kind === 'race' && r.track === track).map(r => r.res).filter(Boolean);
    const tools = results.filter(r => r && r.kind === 'tool' && r.track === track).map(r => r.res).filter(Boolean);
    if (!races.length) { console.log(`${name}: no finished races`); continue; }
    const S = summarise(name, races, tools);
    if (flags.has('--no-tools') && old[name]) { S.mineBest = { m: old[name].mineBest, ci: 0 }; S.turboEdge = { m: old[name].turboEdge, ci: 0 }; }
    rows.push([name, S]);
    const r2 = v => +v.toFixed(2);
    data[name] = { score: +S.score.toFixed(1), lo: +S.lo.toFixed(1), hi: +S.hi.toFixed(1), reason: S.reason, provisional: PROVISIONAL.includes(name),
      hold: r2(S.hold.m), hold3: r2(S.hold3.m), hold2: r2(S.hold2.m), hold23: r2(S.hold23.m), changes: r2(S.changes.m), slope: r2(S.slope.m), margin: r2(S.margin.m),
      itemHits: r2(S.itemHits.m), itemRate: r2(S.itemRate.m), hazHits: r2(S.hazHits.m), itemCost: r2(S.itemCost.m), hazCost: r2(S.hazCost.m), picks: r2(S.picks.m),
      mineBest: r2(S.mineBest.m), mineMed: r2(S.mineMed.m), turboEdge: r2(S.turboEdge.m), races: S.races };
  }
  rows.sort((a, b) => b[1].score - a[1].score);
  const f = (s, d = 2) => `${s.m.toFixed(d)}±${s.ci.toFixed(d)}`;
  console.log(`Front-runner score per track (${N} bot races each, L0-L2, 4/6/8 karts; tools: ${TOOL_KARTS.length} karts alone, ~36 spots a lap)`);
  console.log('  hold: leaders at 1/3, 1/2, 2/3 of the race who win · chg: lead changes a minute · trend: the leader\'s margin, s per 30 s');
  console.log('  hits on the leader a race (items / track) and their cost to its margin (s) · picks: items a kart a minute');
  console.log('  mine: the best spots\' cost to a chaser (median spot) · turbo+: the best Turbo spots over the median one\n');
  for (const [name, S] of rows) {
    console.log(`${name.padEnd(18)} ${S.score.toFixed(1).padStart(4)} [${S.lo.toFixed(1)}..${S.hi.toFixed(1)}]${PROVISIONAL.includes(name) ? ' (provisional)' : ''}`);
    console.log(`    hold ${f(S.hold3)} / ${f(S.hold2)} / ${f(S.hold23)}  chg ${f(S.changes)}  trend ${f(S.slope)}  margin ${f(S.margin)} s  winner ${S.winT.m.toFixed(0)} s`);
    console.log(`    on leader: items ${f(S.itemHits)} (${f(S.itemCost)} s)  track ${f(S.hazHits)} (${f(S.hazCost)} s)${S.hazTop ? ' mostly ' + S.hazTop[0] : ''}  picks ${f(S.picks, 1)}`);
    console.log(`    mine ${f(S.mineBest)} s (median ${S.mineMed.m.toFixed(2)})${S.chain ? ' → ' + S.chain[0] : ''} at ${(S.mineAt ?? 0).toFixed(2)} of the lap  turbo+ ${f(S.turboEdge)} s${S.secret ? ' (secret)' : ''}`);
    console.log(`    ${S.reason}`);
  }
  if (!flags.has('--no-write')) {
    const body = Object.entries(data).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n');
    fs.writeFileSync(OUT, `// Generated by test/frontrun.mjs (npm run frontrun): how much each track favours whoever leads, 0-10, with the\n// numbers behind it. Don't edit by hand: re-run it (just the changed tracks: npm run frontrun -- 96 <index,...>).\nexport default {\n${body}\n};\n`);
    console.log(`\nwrote js/frontrun-data.js`);
  }
  console.log(`${jobs.length} jobs in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
} else {
  const sim = await loadSim();
  serve(job => ({ kind: job.kind, track: job.track, res: job.kind === 'race' ? raceJob(sim, job) : toolJob(sim, job) }));
}
