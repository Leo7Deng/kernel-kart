// One fighter (or several) against every other, at chosen bot levels (0 Chill, 1 Normal, 2 Ruthless): the quick check
// while tuning a kit, much cheaper than a full fight-odds run. Prints its win share overall and in rounds, against each
// foe and on each arena.
//   node test/fight-vs-field.mjs <id[,id...]> <myLevel> <foeLevel> [fights a pair, default 24] [--until=<pp> [--batch=8]] [--jobs=N]
//   --until: add --batch fights a foe at a time until the overall's 95% interval is within ±pp (capped at the fights
//   a pair, default 80 then); seeds run 1, 2, 3..., so it prints what a plain run of that many would
import { mapPool, poolWorker, serve } from './pool.mjs';
import { Fight } from '../js/fight.js';
import { ARENA_ORDER } from '../js/fight-arenas.js';
import { FIGHT_ORDER } from '../js/fight-chars.js';
function job({ cfg }) {
  const F = new Fight(cfg), cap = (F.cfg.roundTime + 64) * 60 * F.cfg.bestOf * 3; let n = 0;
  while (F.phase !== 'over' && n < cap) { F.step(); n++; F.events.length = 0; }
  return { over: F.phase === 'over', winner: F.winner, rounds: F.rounds.map(r => r.winner) };
}
if (poolWorker(import.meta.url)) serve(job);
else {
  const a = process.argv.slice(2).filter(x => !x.startsWith('--')), opt = k => (process.argv.find(x => x.startsWith(`--${k}=`)) || '').split('=')[1];
  const IDS = a[0].split(','), ml = +a[1], fl = +a[2], UNTIL = +opt('until') || 0, BATCH = +opt('batch') || 8, N = +a[3] || (UNTIL ? 80 : 24);
  const jobs = [], res = [];
  const half = (w, n) => { const z = 1.96, p = w / n, d = 1 + z * z / n; return n ? 100 * z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d : 100; };
  const tally = x => { let w = 0, n = 0; jobs.forEach((j, i) => { if (j.x === x && res[i].over) { w += res[i].winner === (j.side ? 1 : 0); n++; } }); return [w, n]; };
  const want = Object.fromEntries(IDS.map(x => [x, UNTIL ? Math.min(BATCH, N) : N])), have = Object.fromEntries(IDS.map(x => [x, 0]));
  for (;;) {
    const add = [];
    IDS.forEach((x, kx) => { for (let s = have[x] + 1; s <= want[x]; s++) FIGHT_ORDER.forEach((y, ky) => { if (x === y) return;
      const side = s % 2, ar = ARENA_ORDER[(s + kx + ky) % ARENA_ORDER.length];
      add.push({ x, y, side, ar, cfg: { ids: side ? [y, x] : [x, y], bots: side ? [fl, ml] : [ml, fl], seed: s * 7919 + ky * 131 + 99991, arena: ar } }); }); have[x] = want[x]; });
    res.push(...await mapPool(import.meta.url, add)); jobs.push(...add);
    if (!UNTIL) break;
    const more = IDS.filter(x => half(...tally(x)) > UNTIL && want[x] < N);
    if (!more.length) break;
    for (const x of more) want[x] = Math.min(N, want[x] + BATCH);
  }
  for (const x of IDS) {
    const T = {}, A = {}; let w = 0, n = 0, rw = 0, rn = 0;
    jobs.forEach((j, i) => { if (j.x !== x) return; const r = res[i]; if (!r.over) return; const me = j.side ? 1 : 0, won = r.winner === me;
      w += won; n++; rw += r.rounds.filter(q => q === me).length; rn += r.rounds.filter(q => q === 0 || q === 1).length;
      (T[j.y] ||= [0, 0])[0] += won; T[j.y][1]++; (A[j.ar] ||= [0, 0])[0] += won; A[j.ar][1]++; });
    const p = v => Math.round(100 * v[0] / v[1]) + '%';
    console.log(`${x} L${ml} vs L${fl}: ${p([w, n])} ±${half(w, n).toFixed(1)} at ${have[x]} a foe (rounds ${p([rw, rn])})  ` + Object.entries(T).map(([k, v]) => k + ' ' + p(v)).join(' ') + '  | ' + Object.entries(A).map(([k, v]) => k + ' ' + p(v)).join(' '));
  }
}
