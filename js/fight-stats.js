// Kernel Kart: Fight mode's results numbers (fight-ui.js's results card), tallied from the fight's events after every
// update (offline, online from the events a player's copy gets, and the dev hook's fast-forward alike). DOM-free.
// who on an event: the attacker on hit, counter, flank and super, the victim on ko, wall and down (down's `by` is who
// put them there, -1 a heat vent) (js/fight.js). Per fighter: hits (clean hits landed), dmg (damage dealt), ko, walls
// (the hard wall slams you gave the other), supers, counters (counter hits landed), flanks (hits from their side or
// behind), knockdowns (the knockdowns you scored). Ring-outs are gone (health only since 2026-10-23) and so are throws (no grabs
// since 2026-10-23): ringout and throws stay 0, for old readers.
export const newStats = () => [0, 1].map(() => ({ hits: 0, dmg: 0, ko: 0, ringout: 0, walls: 0, supers: 0, throws: 0, counters: 0, flanks: 0, knockdowns: 0 }));
export function tally(stats, F, prevHp) {
  F.f.forEach((f, i) => { const d = prevHp[i] - f.hp; if (d > 0 && d < 200) stats[1 - i].dmg += d; prevHp[i] = f.hp; });
  for (const e of F.events || []) {
    const w = e.who;
    if (e.kind === 'hit' && stats[w]) stats[w].hits++;
    else if (e.kind === 'super' && stats[w]) stats[w].supers++;
    else if (e.kind === 'counter' && stats[w]) stats[w].counters++;
    else if (e.kind === 'flank' && stats[w]) stats[w].flanks++;
    else if (e.kind === 'down' && stats[e.by]) stats[e.by].knockdowns++;
    else if (e.kind === 'ko' && stats[1 - w]) stats[1 - w].ko++;
    else if (e.kind === 'wall' && e.power > 0.25 && stats[1 - w]) stats[1 - w].walls++;
  }
  // KOs from the sim's own record of the rounds when it has one (it never misses one)
  if (Array.isArray(F.rounds)) for (let i = 0; i < 2; i++) stats[i].ko = F.rounds.filter(r => r.winner === i && r.how === 'ko').length;
}
