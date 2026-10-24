// Fight bots, level against level: every fighter at the higher level against every fighter (mirrors too) at the lower,
// sides alternating, supers on half the time, on the first arena. Prints how often the higher level wins, per pair of
// levels and per fighter (at the higher level), so the levels stay clearly ordered (js/fight-ai.js LV).
// node test/fight-levels.mjs [fights per pairing, default 4] [arena id]
import { ARENA_ORDER, ARENAS } from '../js/fight-arenas.js';
import { Fight } from '../js/fight.js';
import { FIGHTERS, FIGHT_LEGACY, FIGHT_ORDER } from '../js/fight-chars.js';

const N = +process.argv[2] || 4, arena = process.argv[3] && ARENAS[process.argv[3]] ? process.argv[3] : ARENA_ORDER[0];
const NAMES = ['Chill', 'Normal', 'Ruthless'];
function run(cfg) {
  const F = new Fight(cfg), cap = (F.cfg.roundTime + 64) * 60 * F.cfg.bestOf * 3;
  let n = 0; while (F.phase !== 'over' && n < cap) { F.step(); n++; F.events.length = 0; }
  return F;
}
console.log(`level vs level in ${ARENAS[arena].name}, every fighter v every fighter, ${N} fights a pairing (higher level's wins; rounds)`);
for (const [hi, lo] of [[1, 0], [2, 1], [2, 0]]) {
  let w = 0, g = 0, rw = 0, rg = 0; const per = Object.fromEntries(FIGHT_ORDER.map(id => [id, [0, 0]]));
  FIGHT_ORDER.forEach((a, ka) => FIGHT_ORDER.forEach((b, kb) => {
    for (let s = 1; s <= N; s++) {
      const side = s % 2, ids = side ? [b, a] : [a, b], bots = side ? [lo, hi] : [hi, lo], hiIdx = side ? 1 : 0;
      const F = run({ ids, bots, seed: s * 7919 + ka * 131 + kb * 17 + hi * 3 + lo, supers: s % 4 < 2, arena });
      if (F.phase !== 'over') continue;
      g++; per[a][1]++;
      if (F.winner === hiIdx) { w++; per[a][0]++; }
      for (const r of F.rounds) if (r.winner != null) { rg++; if (r.winner === hiIdx) rw++; }
    }
  }));
  console.log(`  ${NAMES[hi].padEnd(8)} v ${NAMES[lo].padEnd(6)}  ${(100 * w / g).toFixed(0).padStart(3)}% of ${g} fights, ${(100 * rw / rg).toFixed(0)}% of rounds   ` +
    FIGHT_ORDER.map(id => `${FIGHTERS[id].name} ${(100 * per[id][0] / per[id][1]).toFixed(0)}`).join(' '));
}

// what a round looks like at each level (bot v bot, the same level): per round, clean hits, blocked hits, counter
// hits, flanks, knockdowns, steps, gassed and hard wall bounces, and how long rounds run
console.log('per round at each level (every pair once each way):  hits  blocks  counters  flanks  downs  steps  gassed  walls   round');
for (const lv of [0, 1, 2]) {
  const c = { hit: 0, block: 0, counter: 0, flank: 0, down: 0, step: 0, gassed: 0, wall: 0 }; let rounds = 0, len = 0;
  FIGHT_ORDER.forEach((a, ka) => FIGHT_ORDER.forEach((b, kb) => {
    if (a === b) return;
    const F = new Fight({ ids: [a, b], bots: [lv, lv], seed: 7 + ka * 13 + kb + lv * 1000, supers: (ka + kb) % 2 === 0, arena });
    for (let n = 0; F.phase !== 'over' && n < 60 * 600; n++) { F.step(); for (const e of F.events) if (e.kind in c && (e.kind !== 'wall' || e.power > 0.25)) c[e.kind]++; F.events.length = 0; }
    rounds += F.rounds.length; for (const r of F.rounds) len += r.time;
  }));
  console.log(`  ${NAMES[lv].padEnd(8)}                                     ${Object.values(c).map(v => (v / rounds).toFixed(1).padStart(6)).join('  ')}   ${(len / rounds).toFixed(1)} s`);
}

// reaction time: a scripted human (fighter 0) next to the bot keeps starting a heavy charge (held 0.7 s, then a rest);
// from the charge's first frame, with the bot free (idle or walking) and within 120 units, how long until it blocks or
// steps (a reaction counts only within 1 s). Prints the median and middle 80% per level, and how often it reacted.
console.log('reaction to a charging heavy up close (s): median, middle 80%, reacted');
for (const lv of [0, 1, 2]) {
  const times = []; let tries = 0;
  for (const id of FIGHT_LEGACY)   // (the old roster's charging heavy and guard: Tux and Duke have neither since 2026-10-23)
    for (let s = 1; s <= Math.max(2, N); s++) {
    const F = new Fight({ ids: ['gopher', id], bots: [null, lv], seed: s * 31 + lv, supers: false, roundTime: 99 });
    F.phase = 'fight'; F.pt = 0;
    let cyc = 0, start = -1, armed = false;
    for (let n = 0; n < 60 * 40 && F.phase === 'fight'; n++) {
      const me = F.f[0], b = F.f[1], d = Math.hypot(b.x - me.x, b.y - me.y);
      const k = cyc % 120, held = k >= 30 && k < 72;
      F.setInput(0, { x: 0, y: 0, light: false, heavy: held, special: false, guard: false });
      F.step(); cyc++;
      if (k === 30) { armed = me.move === 'heavy' && (me.state === 'wind' || me.state === 'charge') && d < 120 && (b.state === 'idle' || b.state === 'walk'); if (armed) { start = F.time; tries++; } }
      if (armed && (b.state === 'block' || b.state === 'step')) { times.push(F.time - start); armed = false; }
      if (armed && F.time - start > 1) armed = false;
      if (me.state === 'ko' || b.state === 'ko') break;
    }
  }
  times.sort((a, b) => a - b);
  const q = p => times.length ? times[Math.min(times.length - 1, Math.floor(times.length * p))].toFixed(2) : '-';
  console.log(`  ${NAMES[lv].padEnd(8)} ${q(0.5)}  ${q(0.1)}-${q(0.9)}  ${times.length}/${tries}`);
}
