// One matchup in depth, from a's side: damage by move both ways, time poisoned, how far apart they fight, events.
// For finding WHY a matchup is lopsided before changing a kit.
//   node test/fight-dig.mjs <a> <b> <level 0-2> [fights, default 20]
import { Fight } from '../js/fight.js';
import { ARENA_ORDER } from '../js/fight-arenas.js';
const [A, B, lv, N0] = process.argv.slice(2); const N = +N0 || 20;
const dmg = [{}, {}], st = { psn: [0, 0], live: 0, d: [0, 0, 0, 0], flies: 0, hp: [0, 0], ev: {} }; let wins = 0;
for (let s = 1; s <= N; s++) {
  const side = s % 2, ids = side ? [B, A] : [A, B], me = side ? 1 : 0;
  const F = new Fight({ ids, bots: [+lv, +lv], seed: s * 1013 + 7, arena: ARENA_ORDER[s % 4] });
  let n = 0; const hp = F.f.map(f => f.hp); let round = F.round;
  while (F.phase !== 'over' && n < 60 * 600) {
    F.step(); n++;
    for (const e of F.events) {
      if (e.kind === 'hit' && e.to != null) { const k = e.to === me ? 0 : 1; dmg[k][e.move] = (dmg[k][e.move] || 0) + (e.dmg || 0); }
      if (e.who === me) st.ev[e.kind] = (st.ev[e.kind] || 0) + 1;
    }
    F.events.length = 0;
    if (F.round !== round) { round = F.round; F.f.forEach((f, i) => hp[i] = f.hp); continue; }
    F.f.forEach((f, i) => { const d = hp[i] - f.hp; if (d > 0 && d < 200) st.hp[i === me ? 0 : 1] += d; hp[i] = f.hp; });
    if (F.phase === 'fight' || F.phase === 'sudden') {
      st.live++; const a = F.f[me], b = F.f[1 - me];
      if (a.psnT > 0) st.psn[0]++; if (b.psnT > 0) st.psn[1]++;
      const g = Math.hypot(a.x - b.x, a.y - b.y); st.d[g < 60 ? 0 : g < 120 ? 1 : g < 200 ? 2 : 3]++;
      st.flies += F.objs.filter(o => o.kind === 'cpfly' && o.st === 'stuck').length;
    }
  }
  if (F.winner === me) wins++;
}
const r = x => Math.round(x);
console.log(`${A} vs ${B} L${lv}: ${A} wins ${wins}/${N}`);
console.log(`dmg taken by ${A} (total ${r(st.hp[0])}):`, Object.fromEntries(Object.entries(dmg[0]).map(([k, v]) => [k, r(v)])));
console.log(`dmg taken by ${B} (total ${r(st.hp[1])}):`, Object.fromEntries(Object.entries(dmg[1]).map(([k, v]) => [k, r(v)])));
console.log(`poisoned ${A} ${r(100 * st.psn[0] / st.live)}% ${B} ${r(100 * st.psn[1] / st.live)}%; dist <60/<120/<200/200+:`, st.d.map(x => r(100 * x / st.live) + '%').join(' '), ' flies stuck avg', (st.flies / st.live).toFixed(2), ' live s', r(st.live / 60));
console.log(`${A} events:`, JSON.stringify(st.ev));
