// Fight bots, a round robin at one level (analysis only). Every pair, mirrors included, sides alternating. Records:
//   - win % per fighter (mirrors left out) and per pairing (row's wins over column, mirrors as played)
//   - round length (per fighter and overall)
//   - each move's use (per round) and land rate (landed per throw: a clean hit, a freeze, Ferris's lock, Cpp's goo)
//   - how often a move that didn't land (judged 3 s on) was punished: hit while still in its recovery, by a later throw
//   - per defender vs each attacker move: the quickest punish seen (from recovery start to the hit) and with what
//   node test/fight-roundrobin.mjs <level 0|1|2> [arenas, comma separated, default ring] [fights per pair, default 30]
//     [--only=id,id] [--json=path] [--quiet] [--jobs=N]
//   (run it with nice -n 19: the full one is thousands of fights, spread over N workers, default every core: test/pool.mjs)
import { writeFileSync } from 'node:fs';
import { ARENA_ORDER, ARENAS } from '../js/fight-arenas.js';
import { Fight } from '../js/fight.js';
import { FIGHTERS, FIGHT_ORDER } from '../js/fight-chars.js';
import { mapPool, poolWorker, serve } from './pool.mjs';

const args = process.argv.slice(2), flag = k => { const a = args.find(x => x.startsWith('--' + k)); return a ? (a.split('=')[1] ?? true) : null; };
const pos = args.filter(a => !a.startsWith('--'));
const LVL = +(pos[0] ?? 0), ARS = (pos[1] || 'ring').split(',').filter(a => ARENAS[a]), N = +pos[2] || 30;
const IDS = flag('only') ? String(flag('only')).split(',').filter(id => FIGHT_ORDER.includes(id)) : FIGHT_ORDER;
const NAMES = ['Chill', 'Normal', 'Ruthless'];
const LANDS = new Set(['hit', 'freeze', 'feLocked', 'cpGoo', 'cpStick', 'cpBite']);
const STUCK = new Set(['recover', 'dizzy']);
const FREE = new Set(['idle', 'walk', 'hurt', 'down', 'getup', 'ko', 'win', 'stagger', 'frozen']);   // (the throw is over)
const MK = ['move1', 'move2', 'move3', 'evade'];
const mvName = (id, k) => FIGHTERS[id].moves[k] ? FIGHTERS[id].moves[k].name : k;

// one fight, step by step, with its moves followed one throw at a time
export function fightRecord(cfg, R) {
  const F = new Fight(cfg), cap = (F.cfg.roundTime + 64) * 60 * F.cfg.bestOf * 3;
  const cur = [null, null], last = [{}, {}];   // (each fighter's move in progress; the last throw of each move)
  const prev = F.f.map(f => ({ state: f.state, move: f.move, ms: f.ms }));
  const mv = (id, k) => { const a = R.moves[id] || (R.moves[id] = {}); return a[k] || (a[k] = { go: 0, land: 0, open: 0, evaded: 0, punished: 0 }); };
  // a throw counts as not landed only 3 s on (a trap or a thing in flight can still land)
  const pend = [];
  const count = (id, c) => { if (c.landed || c.cut) return; const s = mv(id, c.move); s.open++; if (c.evaded) s.evaded++; if (c.punished) s.punished++; };
  const close = i => { const c = cur[i]; if (!c) return; cur[i] = null; pend.push([F.time + 3, F.f[i].id, c]); };
  const settle = all => { for (let j = pend.length - 1; j >= 0; j--) if (all || pend[j][0] <= F.time || pend[j][2].landed) { count(pend[j][1], pend[j][2]); pend.splice(j, 1); } };
  let n = 0;
  while (F.phase !== 'over' && n < cap) {
    F.step(); n++;
    for (let i = 0; i < 2; i++) {
      const f = F.f[i], o = F.f[1 - i];
      // a new throw (fresh move start), or the old one over (free again, or hit out of it)
      if (f.ms !== prev[i].ms && f.move) { close(i); cur[i] = { move: f.move, ms: f.ms, landed: false, evaded: false, punished: false, cut: false, recT: -1, t0: F.time }; last[i][f.move] = cur[i]; mv(f.id, f.move).go++; }
      const c = cur[i];
      if (c) {
        if ((f.state === 'wind' || f.state === 'strike') && o.move === 'evade' && o.state === 'strike' && c.move !== 'evade') c.evaded = true;
        if (STUCK.has(f.state) && c.recT < 0) c.recT = F.time;
      }
    }
    for (const e of F.events) {
      if (e.who == null) continue;
      if (LANDS.has(e.kind) && e.move && last[e.who][e.move] && !last[e.who][e.move].landed) { last[e.who][e.move].landed = true; mv(F.f[e.who].id, e.move).land++; }
      if (e.kind === 'clink' && e.move && last[e.who][e.move]) last[e.who][e.move].evaded = true;
      if (e.kind === 'hit' && e.to != null) {   // a hit on someone stuck in a move that didn't land: punished
        const v = e.to, c = cur[v], p = prev[v];
        if (c && (p.state === 'wind' || p.state === 'strike')) c.cut = true;   // (hit out of it: not a miss)
        const hb = e.move && last[e.who][e.move];   // (the punishing throw: one started after the throw it punishes, not a thing left lying from before)
        if (c && !c.landed && STUCK.has(p.state) && p.ms === F.f[v].ms && hb && hb.t0 >= c.t0) {
          c.punished = true;
          const dt = F.time - (c.recT >= 0 ? c.recT : F.time), key = F.f[e.who].id + '>' + F.f[v].id + ':' + c.move, b = R.fast[key];
          if (!b || dt < b.dt) R.fast[key] = { dt, by: e.move };
        }
      }
    }
    F.events.length = 0;
    for (let i = 0; i < 2; i++) {
      const f = F.f[i];
      if (cur[i] && (f.ms !== cur[i].ms || FREE.has(f.state))) close(i);
      prev[i].state = f.state; prev[i].move = f.move; prev[i].ms = f.ms;
    }
    if (pend.length) settle(false);
  }
  close(0); close(1); settle(true);
  return F;
}

// (keep(a, b): only those pairings, seeds as in the full run.) Fights are tallied alone (rrFight) and added in order
// (rrAdd), so a worker pool gives exactly what one core does.
export function rrFights(lvl, arenas, ids, n, keep) {
  const out = [];
  ids.forEach((a, ka) => ids.forEach((b, kb) => {
    if (kb < ka || (keep && !keep(a, b))) return;   // (each pairing once; its fights alternate sides)
    for (const ar of arenas) for (let s = 1; s <= n; s++) {
      const side = s % 2;
      out.push({ a, b, side, cfg: { ids: side ? [b, a] : [a, b], bots: [lvl, lvl], seed: s * 7919 + ka * 131 + kb * 17 + ARENA_ORDER.indexOf(ar) * 100003 + lvl, arena: ar } });
    }
  }));
  return out;
}
export function rrFight({ cfg }) {
  const T = { moves: {}, fast: {} }, F = fightRecord(cfg, T);
  let rt = 0; for (const r of F.rounds) rt += r.time;
  return { over: F.phase === 'over', winner: F.winner, rounds: F.rounds.length, rt, moves: T.moves, fast: T.fast };
}
export function rrNew(lvl, arenas, n, ids) {
  const R = { lvl, arenas, n, ids, pair: {}, fighter: {}, moves: {}, fast: {}, rounds: 0, roundT: 0, fights: 0, unfinished: 0 };
  for (const id of ids) R.fighter[id] = { w: 0, g: 0, rounds: 0, roundT: 0 };
  return R;
}
export function rrAdd(R, { a, b, side }, x) {
  const P = R.pair[a + ':' + b] || (R.pair[a + ':' + b] = { w: 0, l: 0, rounds: 0, roundT: 0 });
  for (const id in x.moves) { const M = R.moves[id] || (R.moves[id] = {}); for (const k in x.moves[id]) { const m = M[k] || (M[k] = { go: 0, land: 0, open: 0, evaded: 0, punished: 0 }), v = x.moves[id][k]; for (const f in v) m[f] += v[f]; } }
  for (const key in x.fast) { const b0 = R.fast[key], v = x.fast[key]; if (!b0 || v.dt < b0.dt) R.fast[key] = v; }   // (the first quickest, as one core sees it)
  R.fights++;
  if (!x.over) { R.unfinished++; return; }
  const aWon = x.winner === (side ? 1 : 0);
  if (aWon) P.w++; else P.l++;
  P.rounds += x.rounds; P.roundT += x.rt; R.rounds += x.rounds; R.roundT += x.rt;
  for (const id of new Set([a, b])) { R.fighter[id].rounds += x.rounds; R.fighter[id].roundT += x.rt; }
  if (a !== b) { R.fighter[a].g++; R.fighter[b].g++; R.fighter[aWon ? a : b].w++; }
}
// (log: a line per pairing once its fights are all in)
const rrLog = (fights, log) => (i, R) => { const f = fights[i], g = fights[i + 1]; if (log && (!g || g.a !== f.a || g.b !== f.b)) { const P = R.pair[f.a + ':' + f.b]; log(`${f.a} v ${f.b}: ${P.w}-${P.l}`); } };
export function roundRobin(lvl, arenas, n, ids, log, keep) {
  const R = rrNew(lvl, arenas, n, ids), fights = rrFights(lvl, arenas, ids, n, keep), say = rrLog(fights, log);
  fights.forEach((f, i) => { rrAdd(R, f, rrFight(f)); say(i, R); });
  return R;
}
// the same, the fights spread over worker threads (jobs: test/pool.mjs)
export async function roundRobinPool(lvl, arenas, n, ids, log, keep, jobs) {
  const R = rrNew(lvl, arenas, n, ids), fights = rrFights(lvl, arenas, ids, n, keep), say = rrLog(fights, log);
  const res = await mapPool(import.meta.url, fights, jobs ? { jobs } : {});
  fights.forEach((f, i) => { rrAdd(R, f, res[i]); say(i, R); });
  return R;
}
if (poolWorker(import.meta.url)) serve(rrFight);

const pc = (a, b) => b ? (100 * a / b).toFixed(0) + '%' : '-';
export function report(R) {
  const out = [], p = s => out.push(s), ids = R.ids;
  p(`## ${NAMES[R.lvl]} v ${NAMES[R.lvl]}: ${R.arenas.map(a => ARENAS[a].name).join(' + ')}, ${R.n} fights per pair per arena (${R.fights} fights, ${R.rounds} rounds${R.unfinished ? `, ${R.unfinished} unfinished` : ''}), round ${(R.roundT / R.rounds).toFixed(1)} s on average\n`);
  p('### Win % per fighter (mirrors left out)\n');
  p('| Fighter | Win % | Fights | Round length |'); p('|---|---|---|---|');
  for (const id of [...ids].sort((x, y) => R.fighter[y].w / (R.fighter[y].g || 1) - R.fighter[x].w / (R.fighter[x].g || 1))) {
    const f = R.fighter[id]; p(`| ${FIGHTERS[id].name} | ${pc(f.w, f.g)} | ${f.g} | ${(f.roundT / (f.rounds || 1)).toFixed(1)} s |`);
  }
  p('\n### Per pairing (the row fighter\'s win %)\n');
  p('| | ' + ids.map(id => FIGHTERS[id].name).join(' | ') + ' |'); p('|---|' + ids.map(() => '---').join('|') + '|');
  for (const a of ids) p(`| ${FIGHTERS[a].name} | ` + ids.map(b => { const P = R.pair[a + ':' + b], Q = R.pair[b + ':' + a]; return P ? pc(P.w, P.w + P.l) : Q ? pc(Q.l, Q.w + Q.l) : '-'; }).join(' | ') + ' |');
  p('\n### Moves: use per round, land rate, and how often a throw that didn\'t land was punished\n');
  p('| Fighter | Move | Per round | Landed | Didn\'t land | of those evaded | Punished (of didn\'t land) |'); p('|---|---|---|---|---|---|---|');
  for (const id of ids) {
    const rounds = R.fighter[id].rounds || 1;
    for (const k of MK) { const s = (R.moves[id] || {})[k]; if (!s) continue; p(`| ${FIGHTERS[id].name} | ${mvName(id, k)} (${k}) | ${(s.go / rounds).toFixed(2)} | ${pc(s.land, s.go)} | ${s.open} | ${pc(s.evaded, s.open)} | ${pc(s.punished, s.open)} |`); }
  }
  p('\n### Quickest punish seen (defender > attacker\'s move left open: time from its recovery starting to the hit, and the move)\n');
  p('| Defender | Against | Quickest | With |'); p('|---|---|---|---|');
  for (const key of Object.keys(R.fast).sort()) {
    const [pair, k] = key.split(':'), [d, a] = pair.split('>'), b = R.fast[key];
    p(`| ${FIGHTERS[d].name} | ${FIGHTERS[a].name} ${mvName(a, k)} | ${b.dt.toFixed(2)} s | ${b.by ? mvName(d, b.by) : '?'} |`);
  }
  return out.join('\n');
}

if (!poolWorker(import.meta.url) && import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  const R = await roundRobinPool(LVL, ARS.length ? ARS : ['ring'], N, IDS, flag('quiet') ? null : s => process.stderr.write(s + '\n'));
  console.log(report(R));
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (flag('json')) writeFileSync(String(flag('json')), JSON.stringify(R));
}
