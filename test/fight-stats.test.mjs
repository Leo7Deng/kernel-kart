// Fight mode's results numbers (js/fight-stats.js): a whole bot fight tallied after every update must count the hits,
// supers, counters, flanks, knockdowns and KOs the fight had (the results card once showed 0 hits after a 2:0 win).
import { Fight } from '../js/fight.js';
import { newStats, tally } from '../js/fight-stats.js';
let bad = 0;
for (let seed = 1; seed <= 6; seed++) {
  const F = new Fight({ ids: [['tux', 'duke'], ['pyth', 'octo'], ['octo', 'tux'], ['duke', 'pyth']][seed % 4], bots: [1, 1], seed }),   // (and the plug-in fighters)
    st = newStats(), hp = F.f.map(f => f.hp);
  let hits = 0, supers = 0, counters = 0, flanks = 0, downs = 0;
  for (let n = 0; n < 60 * 400 && F.phase !== 'over'; n++) {
    F.update(1 / 60); tally(st, F, hp);
    for (const e of F.events) { if (e.kind === 'hit') hits++; if (e.kind === 'super') supers++; if (e.kind === 'counter') counters++; if (e.kind === 'flank') flanks++; if (e.kind === 'down' && e.by >= 0) downs++; }
  }
  const ko = F.rounds.filter(r => r.how === 'ko' && r.winner != null).length, ro = F.rounds.filter(r => r.how === 'ringout' && r.winner != null).length;
  const ok = F.phase === 'over' && st[0].hits + st[1].hits === hits && hits > 0 && st[0].supers + st[1].supers === supers
    && st[0].ko + st[1].ko === ko && st[0].ringout + st[1].ringout === ro && st[0].dmg + st[1].dmg > 0
    && st[0].counters + st[1].counters === counters && st[0].flanks + st[1].flanks === flanks && st[0].knockdowns + st[1].knockdowns === downs && st[0].throws + st[1].throws === 0;
  if (!ok) { bad++; console.log('FAIL seed', seed, JSON.stringify({ st, hits, supers, ko, ro, phase: F.phase })); }
}
console.log(bad ? `fight-stats: ${bad} failed` : 'fight-stats: all checks passed');
process.exit(bad ? 1 : 0);
