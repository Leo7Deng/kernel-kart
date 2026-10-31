// Fight odds for the select screen (js/fight-ui.js): bot round robins, written to js/fight-matchup-data.js with the
// commit and kit signatures (js/fight-sig.js). One run gives:
//   - every pairing's wins per level: the VS matchup bar, strength meter, best and worst matchups
//   - per fighter (Normal): damage dealt/taken a minute, speed on its own feet, damage-weighted range: the card's bars
//   - skill floor/ceiling: played by a Chill / Ruthless bot vs every other at Normal (head-on alone is too character
//     based); floor and spread (ceiling - floor) give the Easy / Medium / Hard
//   nice -n 19 node test/fight-odds.mjs [fights per pair per level, default 24] [--levels=0,1,2] [--no-skill] [--no-write]
//     [--full] [--until=<pp> [--batch=8]] [--jobs=N]
// Incremental: every cell (a pair at a level, or an ordered pair's floor/ceiling) is kept in test/fight-odds-cache.json
// with the source signatures it was measured on (test/fight-src-sig.mjs: each fighter's kit file, the shared core).
// A cell whose two kits are unchanged is reused (extended if more fights are asked for); a changed kit re-measures its
// cells. A changed shared core is probed: the first PROBE fights of each cell are re-run and the cell kept if they end
// exactly as before (else re-measured). --full: measure everything.
// --until=<pp>: add --batch fights a pair at a time until every row (a fighter's overall at a level, its floor, its
// ceiling) has a 95% interval within ±pp, capped at N (default 80 then). Seeds always run 1, 2, 3...: the same numbers
// as a plain run of that many.
// (--no-skill keeps the data file's last floor/ceiling. Sides alternate, arenas take turns, no mirrors; ~0.12 s a
// fight, spread over N workers, default every core: test/pool.mjs)
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ARENA_ORDER } from '../js/fight-arenas.js';
import { Fight } from '../js/fight.js';
import { FIGHTERS, FIGHT_ORDER } from '../js/fight-chars.js';
import { kitSig } from '../js/fight-sig.js';
import { mapPool, poolWorker, serve } from './pool.mjs';
import { hash, srcSigs } from './fight-src-sig.mjs';

const OUT = new URL('../js/fight-matchup-data.js', import.meta.url), CACHE = new URL('./fight-odds-cache.json', import.meta.url);
const METHOD = 1;   // (bump when what a fight job measures or its seeds change: the whole cache goes stale)
const PROBE = 4;    // (fights re-run per cell when the shared core changed: 4 seeds cover every arena and both sides)
const args = process.argv.slice(2), flag = k => { const a = args.find(x => x.startsWith('--' + k)); return a ? (a.split('=')[1] ?? true) : null; };
const UNTIL = flag('until') ? +flag('until') : 0, BATCH = +flag('batch') || 8;
const N = +args.find(a => !a.startsWith('--')) || (UNTIL ? 80 : 24);
const LEVELS = String(flag('levels') || '0,1,2').split(',').map(Number).filter(l => [0, 1, 2].includes(l));
const NAMES = ['chill', 'normal', 'ruthless'];
const IDS = FIGHT_ORDER;
const OFF_FEET = new Set(['hurt', 'down', 'getup', 'ko', 'stagger', 'frozen', 'dizzy', 'win']);   // (moved by the other, not by choice)
const LIVE = new Set(['fight', 'sudden']);
const ST = ['dmg', 'taken', 'dist', 'frames', 'rangeW', 'rounds'];

// one fight, with its two fighters' tallies (S[id], keys ST) and a fingerprint of how it ended
function fight(cfg) {
  const F = new Fight(cfg), cap = (F.cfg.roundTime + 64) * 60 * F.cfg.bestOf * 3;
  const hp = F.f.map(f => f.hp), at = F.f.map(f => [f.x, f.y]), S = {};
  for (const f of F.f) S[f.id] = [0, 0, 0, 0, 0, 0];
  let n = 0, round = F.round;
  while (F.phase !== 'over' && n < cap) {
    F.step(); n++; F.events.length = 0;
    if (F.round !== round) { round = F.round; F.f.forEach((f, i) => { hp[i] = f.hp; at[i] = [f.x, f.y]; }); continue; }   // (a new round: fresh health and spots)
    const live = LIVE.has(F.phase), gap = Math.hypot(F.f[0].x - F.f[1].x, F.f[0].y - F.f[1].y);
    F.f.forEach((f, i) => {
      const s = S[f.id], o = S[F.f[1 - i].id], d = hp[i] - f.hp;
      if (d > 0 && d < 200) { o[0] += d; s[1] += d; o[4] += d * gap; }   // (the other dealt it, from this far)
      hp[i] = f.hp;
      if (live) { s[3]++; if (!OFF_FEET.has(f.state)) s[2] += Math.hypot(f.x - at[i][0], f.y - at[i][1]); }
      at[i] = [f.x, f.y];
    });
  }
  if (F.phase === 'over') F.f.forEach(f => { S[f.id][5] += F.rounds.length; });
  const fp = hash([n, F.phase, F.winner, F.rounds.map(r => r.winner), ...F.f.map(f => [f.hp, f.x, f.y])].join('|'));
  return { over: F.phase === 'over', winner: F.winner, rounds: F.rounds.map(r => r.winner), S, fp };
}
if (poolWorker(import.meta.url)) serve(fight);
else {
const t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0);
const statLv = LEVELS.includes(1) ? 1 : LEVELS[0];
const SKILL = flag('no-skill') ? [] : [['floor', 0], ['ceiling', 2]];
// the groups and their cells: a cell's fight s is always the same fight (its seed, sides and arena come from s)
const groups = [];
for (const lvl of LEVELS) groups.push({ g: NAMES[lvl], cells: IDS.flatMap((a, ka) => IDS.map((b, kb) => kb <= ka ? null : { key: a + ':' + b, a, b,
  cfg: s => { const side = s % 2; return { side, cfg: { ids: side ? [b, a] : [a, b], bots: [lvl, lvl], seed: s * 7919 + ka * 131 + kb * 17 + lvl * 100003, arena: ARENA_ORDER[(s + ka + kb) % ARENA_ORDER.length] } }; } })).filter(Boolean) });
SKILL.forEach(([mode, xl], km) => groups.push({ g: mode, skill: true, cells: IDS.flatMap((x, kx) => IDS.map((y, ky) => x === y ? null : { key: x + '>' + y, a: x, b: y,
  cfg: s => { const side = s % 2; return { side, cfg: { ids: side ? [y, x] : [x, y], bots: side ? [1, xl] : [xl, 1], seed: s * 7919 + kx * 131 + ky * 17 + (km + 3) * 100003 + 50021, arena: ARENA_ORDER[(s + kx + ky + km) % ARENA_ORDER.length] } }; } })).filter(Boolean) }));

// what's stored, and what changed since
const sig = srcSigs(IDS), core = hash(JSON.stringify([METHOD, sig.core]));
let cache = null;
try { cache = JSON.parse(readFileSync(CACHE, 'utf8')); } catch { }
const old = cache && cache.method === METHOD && !flag('full') ? cache : null;
const why = flag('full') ? '--full' : !cache ? 'no cache yet (test/fight-odds-cache.json)' : cache.method !== METHOD ? 'the measuring changed (METHOD)' : '';
const changedCore = old ? Object.keys({ ...sig.core, ...old.coreFiles }).filter(p => sig.core[p] !== old.coreFiles[p]) : [];
const changedKits = old ? IDS.filter(id => sig.fighters[id] !== (old.fighters || {})[id]) : IDS;
if (why) console.error(`full run: ${why}`);
else {
  console.error(changedKits.length ? `kits changed: ${changedKits.join(', ')}` : 'no kit changed');
  if (changedCore.length) console.error(`shared core changed (${changedCore.join(', ')}): probing ${PROBE} fights of every cell whose kits are unchanged; those that end differently are re-measured`);
}
// a cell in memory: n fights done, tot (level: [a's wins, b's wins]; skill: [won, fights, rounds won, rounds]), st (per
// fighter tallies, level cells), fps (the first PROBE fights' fingerprints, while they're being run), probe (their hash)
const fresh = () => ({ n: 0, tot: [0, 0, 0, 0], st: {}, fps: [] });
const cells = [];
for (const G of groups) for (const C of G.cells) {
  const o = old && old.cells[G.g + '|' + C.key];
  C.G = G; C.state = 'new'; C.r = fresh();
  if (o && o.a === sig.fighters[C.a] && o.b === sig.fighters[C.b] && (UNTIL || o.n <= N)) {
    C.r = { n: o.n, tot: o.tot, st: o.st || {}, fps: [], probe: o.probe };
    C.state = o.core === core ? 'kept' : o.n >= PROBE && o.probe ? 'probe' : 'new';
    if (C.state === 'new') C.r = fresh();
  }
  if (C.state === 'kept' && !UNTIL && C.r.n > N) { C.state = 'new'; C.r = fresh(); }
  cells.push(C);
}
let ran = 0;
const add = (C, s, r) => {
  const R = C.r, { side } = C.cfg(s);
  if (s <= PROBE) R.fps[s - 1] = r.fp;
  if (C.G.skill) {
    if (r.over) { const me = side ? 1 : 0; R.tot[0] += r.winner === me ? 1 : 0; R.tot[1]++; R.tot[2] += r.rounds.filter(w => w === me).length; R.tot[3] += r.rounds.filter(w => w === 0 || w === 1).length; }
  } else {
    for (const id in r.S) { const t = R.st[id] || (R.st[id] = [0, 0, 0, 0, 0, 0]); r.S[id].forEach((v, k) => { t[k] += v; }); }
    if (r.over) R.tot[r.winner === (side ? 1 : 0) ? 0 : 1]++;
  }
  R.n = s;
  if (s === PROBE) R.probe = hash(R.fps.join(','));
};
const run = async list => {   // list: [cell, seed] in order; results added in that order
  const res = await mapPool(import.meta.url, list.map(([C, s]) => C.cfg(s).cfg));
  ran += list.length; return res;
};
// the probes: re-run fights 1..PROBE of a cell whose kits are unchanged; same endings -> the stored cell stands
const probes = cells.filter(C => C.state === 'probe');
if (probes.length) {
  const list = probes.flatMap(C => Array.from({ length: PROBE }, (_, k) => [C, k + 1]));
  const res = await run(list), got = new Map();
  list.forEach(([C, s], i) => { if (!got.has(C)) got.set(C, []); got.get(C)[s - 1] = res[i]; });
  let same = 0;
  for (const C of probes) {
    const fps = got.get(C).map(r => r.fp);
    if (hash(fps.join(',')) === C.r.probe) { C.state = 'kept'; same++; continue; }
    C.state = 'new'; C.r = fresh(); got.get(C).forEach((r, k) => add(C, k + 1, r));   // (the probe fights are its first ones now)
  }
  console.error(`probed ${probes.length} cells (${sec()} s): ${same} end exactly as before, ${probes.length - same} re-measured`);
}
const remeasured = new Set(cells.filter(C => C.state === 'new').flatMap(C => [C.a, C.b]));
// the rows a --until run watches, and their 95% interval (Wilson), in points
const half = (w, n) => { if (!n) return 100; const z = 1.96, p = w / n, d = 1 + z * z / n; return 100 * z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; };
const rowsOf = G => IDS.map(id => { let w = 0, n = 0; for (const C of G.cells) {
  const t = C.r.tot; if (G.skill) { if (C.a === id) { w += t[0]; n += t[1]; } } else if (C.a === id) { w += t[0]; n += t[0] + t[1]; } else if (C.b === id) { w += t[1]; n += t[0] + t[1]; } }
  return half(w, n); });
// each group's fights a pair: N, or under --until from what's stored (or a batch) up in batches till its rows are tight
for (const G of groups) G.n = UNTIL ? Math.min(N, Math.max(BATCH, ...G.cells.filter(C => C.state === 'kept').map(C => C.r.n))) : N;
for (;;) {
  const list = [];
  for (const G of groups) for (const C of G.cells) { if (C.r.n < G.n && C.state === 'kept') C.state = 'extended'; for (let s = C.r.n + 1; s <= G.n; s++) list.push([C, s]); }
  if (list.length) { const res = await run(list); list.forEach(([C, s], i) => add(C, s, res[i])); }
  if (!UNTIL) break;
  for (const G of groups) G.pm = Math.max(...rowsOf(G));
  console.error(`(${sec()} s) widest row: ` + groups.map(G => `${G.g} ±${G.pm.toFixed(1)} at ${G.n} a pair`).join(', '));
  const more = groups.filter(G => G.pm > UNTIL && G.n < N);
  if (!more.length) break;
  for (const G of more) G.n = Math.min(N, G.n + BATCH);
}
const nOf = g => (groups.find(G => G.g === g) || {}).n;
const count = st => cells.filter(C => C.state === st).length;
console.error(`re-measured: ${remeasured.size ? [...remeasured].join(', ') : 'nothing'}; cells kept ${count('kept')}, extended ${count('extended')}, new ${count('new')}; ${ran} fights in ${sec()} s`);

// added up in order: level by level, pair by pair
const levels = {}, S = {};
for (const id of IDS) S[id] = [0, 0, 0, 0, 0, 0];
for (const G of groups) {
  if (G.skill) continue;
  const L = levels[G.g] = { pair: {}, overall: {} };
  for (const id of IDS) L.overall[id] = [0, 0];
  for (const C of G.cells) {
    const [wa, wb] = C.r.tot; L.pair[C.key] = [wa, wb];
    L.overall[C.a][0] += wa; L.overall[C.a][1] += wa + wb; L.overall[C.b][0] += wb; L.overall[C.b][1] += wa + wb;
    if (G.g === NAMES[statLv]) for (const id in C.r.st) C.r.st[id].forEach((v, k) => { S[id][k] += v; });
  }
}
const skill = { floor: {}, ceiling: {}, vs: { floor: {}, ceiling: {} } };
for (const G of groups) if (G.skill) for (const C of G.cells) {
  const T = skill[G.g][C.a] || (skill[G.g][C.a] = [0, 0, 0, 0]); C.r.tot.forEach((v, k) => { T[k] += v; });
  (skill.vs[G.g][C.a] || (skill.vs[G.g][C.a] = {}))[C.b] = [...C.r.tot];
}
const r1 = x => Math.round(x * 10) / 10;
const stats = {};
for (const id of IDS) {
  const [dmg, taken, dist, frames, rangeW] = S[id], t = frames / 60, ov = (levels[NAMES[statLv]] || {}).overall[id] || [0, 1];
  stats[id] = { win: Math.round(1000 * ov[0] / (ov[1] || 1)) / 1000, dmg: r1(dmg / (t || 1) * 60), taken: r1(taken / (t || 1) * 60), speed: r1(dist / (t || 1)), range: r1(rangeW / (dmg || 1)) };
}

// the table, for a look
console.log(`\nPer fighter (${NAMES[statLv]}): win %, damage dealt and taken a minute of fighting, own movement (u/s), where its damage lands from (u)`);
console.log('fighter   win  dmg/min tkn/min  speed  range' + LEVELS.map(l => NAMES[l].padStart(9)).join(''));
for (const id of [...IDS].sort((x, y) => stats[y].win - stats[x].win)) {
  const s = stats[id];
  console.log(id.padEnd(8) + `${Math.round(s.win * 100)}%`.padStart(5) + String(s.dmg).padStart(9) + String(s.taken).padStart(9) + String(s.speed).padStart(7) + String(s.range).padStart(7)
    + LEVELS.map(l => { const o = levels[NAMES[l]].overall[id]; return `${Math.round(100 * o[0] / (o[1] || 1))}%`.padStart(9); }).join(''));
}
for (const lvl of LEVELS) {
  const L = levels[NAMES[lvl]];
  console.log(`\n${NAMES[lvl]} (row's win %, ${nOf(NAMES[lvl])} fights a pair)`);
  console.log('        ' + IDS.map(id => id.slice(0, 6).padStart(7)).join(''));
  for (const a of IDS) console.log(a.padEnd(8) + IDS.map(b => {
    if (a === b) return '      -';
    const P = L.pair[a + ':' + b], Q = L.pair[b + ':' + a], v = P ? P[0] / (P[0] + P[1] || 1) : Q[1] / (Q[0] + Q[1] || 1);
    return (Math.round(v * 100) + '%').padStart(7);
  }).join(''));
}
if (SKILL.length) {
  const pc = v => v && v[1] ? v[0] / v[1] : NaN, nm = (levels.normal || {}).overall || {};
  console.log(`\nSkill floor / ceiling (row's win % played by a Chill / a Ruthless bot against every other at Normal, ${nOf('floor')} fights a pair each way)`);
  console.log('fighter  normal  floor  ceiling  spread   (rounds: floor ceiling)');
  for (const id of [...IDS].sort((x, y) => pc(skill.floor[y]) - pc(skill.floor[x]))) {
    const f = pc(skill.floor[id]), c = pc(skill.ceiling[id]), q = x => isNaN(x) ? '   -' : `${Math.round(x * 100)}%`;
    console.log(id.padEnd(8) + q(pc(nm[id])).padStart(7) + q(f).padStart(7) + q(c).padStart(9) + String(Math.round((c - f) * 100)).padStart(8)
      + q(skill.floor[id][2] / (skill.floor[id][3] || 1)).padStart(13) + q(skill.ceiling[id][2] / (skill.ceiling[id][3] || 1)).padStart(8));
  }
}
// the cache: every cell this run has, on top of the ones it didn't touch (other levels, --no-skill)
const keep = cache && cache.method === METHOD ? cache.cells : {};
for (const C of cells) keep[C.G.g + '|' + C.key] = { a: sig.fighters[C.a], b: sig.fighters[C.b], core, n: C.r.n, probe: C.r.probe, tot: C.r.tot.slice(0, C.G.skill ? 4 : 2), ...(C.G.skill ? {} : { st: C.r.st }) };
writeFileSync(CACHE, `{"method":${METHOD},"coreFiles":${JSON.stringify(sig.core)},"fighters":${JSON.stringify(sig.fighters)},"cells":{\n${Object.entries(keep).map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(',\n')}}}\n`);

if (!flag('no-write')) {
  let commit = 'unknown';
  try { commit = execSync('git rev-parse --short HEAD', { cwd: new URL('..', import.meta.url) }).toString().trim() + (execSync('git status --porcelain js', { cwd: new URL('..', import.meta.url) }).toString().trim() ? '+' : ''); } catch { }
  const measured = { commit, day: new Date().toISOString().slice(0, 10), fights: nOf(NAMES[statLv]), n: Object.fromEntries(groups.map(G => [G.g, G.n])), arenas: ARENA_ORDER, statLevel: NAMES[statLv], sig: Object.fromEntries(IDS.map(id => [id, kitSig(id)])) };
  if (!SKILL.length) {   // (not measured this time: the last run's, as they were)
    try { const old = (await import(OUT.href)).default; if (old.skill) Object.assign(skill, old.skill, { kept: true }); } catch { }
  }
  const sk = skill.floor && Object.keys(skill.floor).length ? `,
  "skill": {
    "floor": ${JSON.stringify(skill.floor)},
    "ceiling": ${JSON.stringify(skill.ceiling)},
    "vs": {
${['floor', 'ceiling'].map(m => `      ${JSON.stringify(m)}: {\n${IDS.filter(id => skill.vs[m][id]).map(id => `        ${JSON.stringify(id)}: ${JSON.stringify(skill.vs[m][id])}`).join(',\n')}}`).join(',\n')}}${skill.kept ? `,\n    "kept": true` : ''}}` : '';
  const lv = Object.entries(levels).map(([k, L]) => `    ${JSON.stringify(k)}: {"overall":${JSON.stringify(L.overall)},"pair":{\n${Object.entries(L.pair).map(([p, v]) => `      ${JSON.stringify(p)}:${JSON.stringify(v)}`).join(',\n')}}}`);
  writeFileSync(OUT, `// Generated by test/fight-odds.mjs (npm run matchups): bot round robins, every fighter against every other.
// measured: the commit ('+': with uncommitted edits), the day, fights a pairing per level, and each fighter's kit
// signature then (js/fight-sig.js: the select screen marks a matchup "measured on an earlier version" once a kit differs).
// levels[lv].pair['a:b'] = [a's wins, b's wins] (a before b in FIGHT_ORDER; mirrors are even), overall[id] = [wins, fights].
// stats[id] (the Normal fights): win share, dmg and taken (damage dealt / taken a minute of fighting), speed (u/s on its own feet),
// range (how far from the other its damage lands, damage-weighted). The select screen (js/fight-ui.js) shows all of it.
// skill (cross-skill): floor[id] = [fights won, fights, rounds won, rounds] played by a Chill bot against every other at
// Normal, ceiling[id] the same by a Ruthless bot; vs.floor[x][y] / vs.ceiling[x][y] the same per opponent. The select screen's
// Easy / Medium / Hard and its Ease bar come from floor and spread (ceiling - floor). kept: carried over from an older run.
// Don't edit by hand: re-run it.
export default {
  "measured": ${JSON.stringify(measured)},
  "levels": {
${lv.join(',\n')}},
  "stats": {
${IDS.map(id => `    ${JSON.stringify(id)}: ${JSON.stringify(stats[id])}`).join(',\n')}}${sk}
};
`);
  console.error('wrote js/fight-matchup-data.js');
}
}
