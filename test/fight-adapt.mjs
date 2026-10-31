// Fight bots against a predictable player: does a bot notice what you keep doing? The script throws move1 in reach,
// evades every swing it sees (0.25 s late) and always rolls away. Per level: the player's move1 landing early vs late in
// a round, the bot's hits on its evades and rolls, the bot's wins.
//   node test/fight-adapt.mjs [fights per pairing, default 6] [--base=<dir with js/>] [--jobs=N]
import { mapPool, poolWorker, serve } from './pool.mjs';

const args = process.argv.slice(2), base = (args.find(a => a.startsWith('--base=')) || '').slice(7) || new URL('..', import.meta.url).pathname;
const N = +(args.find(a => !a.startsWith('--')) || 6);
const SPAM = ['tux', 'docky', 'duke', 'pyth', 'gopher'];

async function run({ lv, me, bot, seed, base }) {
  const { Fight } = await import(base + '/js/fight.js');
  const F = new Fight({ ids: [me, bot], bots: [null, lv], seed, arena: 'ring' });
  const P = F.f[0], B = F.f[1], mv = P.stats.moves.move1, rch = mv.reach != null && mv.reach < 120 ? mv.reach : mv.r1 ? mv.r1 - P.r - B.r : 30;
  const R = { early: [0, 0], late: [0, 0], evades: 0, evPun: 0, rolls: 0, rollPun: 0, win: 0 };
  let seenWind = -1, evT = -9, rollT = -9, ms = -1, rt0 = 0, n = 0, rnd = F.round;
  const cap = (F.cfg.roundTime + 64) * 60 * F.cfg.bestOf * 3;
  while (F.phase !== 'over' && n++ < cap) {
    if (F.round !== rnd) { rnd = F.round; rt0 = F.time; }
    const gap = Math.hypot(B.x - P.x, B.y - P.y) - P.r - B.r, toB = Math.atan2(B.y - P.y, B.x - P.x);
    const inp = { x: Math.cos(toB), y: Math.sin(toB), light: false, heavy: false, special: false, guard: false };
    if (B.state === 'wind' && B.move !== 'evade') { if (seenWind < 0) seenWind = F.time; } else seenWind = -1;
    if (P.state === 'down') { if (P.t > 0.13) { inp.guard = (n & 1) === 0; inp.x = -Math.cos(toB); inp.y = -Math.sin(toB); } }
    else if (seenWind >= 0 && F.time - seenWind > 0.25 && gap < 140 && P.cd[3] <= 0) { inp.guard = (n & 1) === 0; inp.x = -Math.cos(toB); inp.y = -Math.sin(toB); }
    else if (gap < rch - 2 && P.cd[0] <= 0) inp.light = (n & 1) === 0;
    F.setInput(0, inp);
    F.step();
    if (P.ms !== ms && P.move) { ms = P.ms; if (P.move === 'move1') (F.time - rt0 < 20 ? R.early : R.late)[0]++; if (P.move === 'evade') { R.evades++; evT = F.time; } }
    for (const e of F.events) {
      if (e.kind === 'hit' && e.who === 0 && e.move === 'move1') { const h = F.time - rt0 < 20 ? R.early : R.late; h[1]++; }
      if (e.kind === 'hit' && e.who === 1) { if (F.time - evT < 0.9) R.evPun++; if (F.time - rollT < 0.8) R.rollPun++; }
      if (e.kind === 'rise' && e.who === 0) { R.rolls++; rollT = F.time; }
    }
    F.events.length = 0;
  }
  R.win = F.winner === 1 ? 1 : 0;
  return R;
}
if (poolWorker(import.meta.url)) serve(run);

if (!poolWorker(import.meta.url) && import.meta.url === `file://${process.argv[1]}`) {
  const { FIGHT_ORDER } = await import(base + '/js/fight-chars.js');
  for (const lv of [0, 1, 2]) {
    const tasks = [];
    for (const me of SPAM) for (const bot of FIGHT_ORDER) for (let s = 1; s <= N; s++) tasks.push({ lv, me, bot, seed: s * 101 + lv, base });
    const res = await mapPool(import.meta.url, tasks), T = { early: [0, 0], late: [0, 0], evades: 0, evPun: 0, rolls: 0, rollPun: 0, win: 0 };
    for (const r of res) { for (const k in T) { if (Array.isArray(T[k])) { T[k][0] += r[k][0]; T[k][1] += r[k][1]; } else T[k] += r[k]; } }
    const pc = (a, b) => b ? (100 * a / b).toFixed(0) + '%' : '-';
    console.log(`${['Chill', 'Normal', 'Ruthless'][lv]}: the player's move1 lands ${pc(T.early[1], T.early[0])} in a round's first 20 s, ${pc(T.late[1], T.late[0])} after; its evades punished ${pc(T.evPun, T.evades)}, its rolls ${pc(T.rollPun, T.rolls)}; bot wins ${pc(T.win, res.length)} (${res.length} fights)`);
  }
}
