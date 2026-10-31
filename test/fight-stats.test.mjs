// Fight mode's results numbers (js/fight-stats.js): a whole bot fight tallied after every update must count the hits,
// counters, knockdowns and KOs the fight had.
import { Fight } from '../js/fight.js';
import { newStats, tally } from '../js/fight-stats.js';
let bad = 0;
for (let seed = 1; seed <= 6; seed++) {
  const F = new Fight({ ids: [['tux', 'duke'], ['pyth', 'octo'], ['octo', 'tux'], ['duke', 'pyth']][seed % 4], bots: [1, 1], seed }),   // (and the plug-in fighters)
    st = newStats(), hp = F.f.map(f => f.hp);
  let hits = 0, counters = 0, downs = 0;
  for (let n = 0; n < 60 * 400 && F.phase !== 'over'; n++) {
    F.update(1 / 60); tally(st, F, hp);
    for (const e of F.events) { if (e.kind === 'hit') hits++; if (e.kind === 'counter') counters++; if (e.kind === 'down' && e.by >= 0) downs++; }
  }
  const ko = F.rounds.filter(r => r.how === 'ko' && r.winner != null).length;
  const ok = F.phase === 'over' && st[0].hits + st[1].hits === hits && hits > 0
    && st[0].ko + st[1].ko === ko && st[0].dmg + st[1].dmg > 0
    && st[0].counters + st[1].counters === counters && st[0].knockdowns + st[1].knockdowns === downs;
  if (!ok) { bad++; console.log('FAIL seed', seed, JSON.stringify({ st, hits, ko, phase: F.phase })); }
}
console.log(bad ? `fight-stats: ${bad} failed` : 'fight-stats: all checks passed');
process.exit(bad ? 1 : 0);
