// Fight bots, level against level: every fighter at the higher level against every fighter (mirrors too) at the lower,
// sides alternating, on the first arena. Prints how often the higher level wins, per pair of
// levels and per fighter (at the higher level), so the levels stay clearly ordered (js/fight-ai.js LV).
// node test/fight-levels.mjs [fights per pairing, default 4] [arena id] [--jobs=N]   (fights spread over N workers, default every core: test/pool.mjs)
import { ARENA_ORDER, ARENAS } from '../js/fight-arenas.js';
import { Fight } from '../js/fight.js';
import { FIGHTERS, FIGHT_ORDER } from '../js/fight-chars.js';
import { mapPool, poolWorker, serve } from './pool.mjs';

const N = +process.argv[2] || 4, arena = process.argv[3] && ARENAS[process.argv[3]] ? process.argv[3] : ARENA_ORDER[0];
const NAMES = ['Chill', 'Normal', 'Ruthless'];
const EV = ['hit', 'trade', 'counter', 'down', 'rise', 'wall'];
// a pool job: one fight. kind 'lv': who won it and each round; kind 'look': the events of a fight and its rounds' lengths
function job({ kind, cfg }) {
  const F = new Fight(cfg);
  if (kind === 'lv') {
    const cap = (F.cfg.roundTime + 64) * 60 * F.cfg.bestOf * 3;
    let n = 0; while (F.phase !== 'over' && n < cap) { F.step(); n++; F.events.length = 0; }
    return { over: F.phase === 'over', winner: F.winner, rounds: F.rounds.map(r => r.winner) };
  }
  const c = Object.fromEntries(EV.map(k => [k, 0]));
  for (let n = 0; F.phase !== 'over' && n < 60 * 600; n++) { F.step(); for (const e of F.events) if (e.kind in c && (e.kind !== 'wall' || e.power > 0.25)) c[e.kind]++; F.events.length = 0; }
  return { c, times: F.rounds.map(r => r.time) };
}
if (poolWorker(import.meta.url)) serve(job);
else {
  const PAIRS = [[1, 0], [2, 1], [2, 0]], jobs = [];
  for (const [hi, lo] of PAIRS) FIGHT_ORDER.forEach((a, ka) => FIGHT_ORDER.forEach((b, kb) => {
    for (let s = 1; s <= N; s++) {
      const side = s % 2;
      jobs.push({ kind: 'lv', hi, lo, a, hiIdx: side ? 1 : 0, cfg: { ids: side ? [b, a] : [a, b], bots: side ? [lo, hi] : [hi, lo], seed: s * 7919 + ka * 131 + kb * 17 + hi * 3 + lo, arena } });
    }
  }));
  for (const lv of [0, 1, 2]) FIGHT_ORDER.forEach((a, ka) => FIGHT_ORDER.forEach((b, kb) => {
    if (a !== b) jobs.push({ kind: 'look', lv, cfg: { ids: [a, b], bots: [lv, lv], seed: 7 + ka * 13 + kb + lv * 1000, arena } });
  }));
  const res = await mapPool(import.meta.url, jobs);
  console.log(`level vs level in ${ARENAS[arena].name}, every fighter v every fighter, ${N} fights a pairing (higher level's wins; rounds)`);
  for (const [hi, lo] of PAIRS) {
    let w = 0, g = 0, rw = 0, rg = 0; const per = Object.fromEntries(FIGHT_ORDER.map(id => [id, [0, 0]]));
    jobs.forEach((j, i) => {
      if (j.kind !== 'lv' || j.hi !== hi || j.lo !== lo) return;
      const r = res[i];
      if (!r.over) return;
      g++; per[j.a][1]++;
      if (r.winner === j.hiIdx) { w++; per[j.a][0]++; }
      for (const rw0 of r.rounds) if (rw0 != null) { rg++; if (rw0 === j.hiIdx) rw++; }
    });
    console.log(`  ${NAMES[hi].padEnd(8)} v ${NAMES[lo].padEnd(6)}  ${(100 * w / g).toFixed(0).padStart(3)}% of ${g} fights, ${(100 * rw / rg).toFixed(0)}% of rounds   ` +
      FIGHT_ORDER.map(id => `${FIGHTERS[id].name} ${(100 * per[id][0] / per[id][1]).toFixed(0)}`).join(' '));
  }

  // what a round looks like at each level (bot v bot, the same level): per round, clean hits, trades, counter hits,
  // knockdowns, quick rises and hard wall bounces, and how long rounds run
  console.log('per round at each level (every pair once each way):  hits  trades  counters  downs  rises  walls   round');
  for (const lv of [0, 1, 2]) {
    const c = Object.fromEntries(EV.map(k => [k, 0])); let rounds = 0, len = 0;
    jobs.forEach((j, i) => {
      if (j.kind !== 'look' || j.lv !== lv) return;
      for (const k of EV) c[k] += res[i].c[k];
      rounds += res[i].times.length; for (const t of res[i].times) len += t;
    });
    console.log(`  ${NAMES[lv].padEnd(8)}                                     ${Object.values(c).map(v => (v / rounds).toFixed(1).padStart(6)).join('  ')}   ${(len / rounds).toFixed(1)} s`);
  }
}
