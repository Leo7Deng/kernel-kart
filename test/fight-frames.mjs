// Fight mode's frame-data tables (docs/fight-frames.md), from js/fight-chars.js and js/fight-kits.js: Tux's and Duke's
// three moves and evade phase by phase (each kit's phases(mv)) with their numbers, then the old roster's moves (unpickable since
// 2026-10-23) with their phases, armor, damage, stamina, knockdown, block stun and on-block advantage, in 60 Hz frames.
//   node test/fight-frames.mjs   (paste the output into docs/fight-frames.md, below its introduction)
import { FIGHTERS, FIGHT_LEGACY, FIGHT_ORDER, MOVE_KEYS, frameData } from '../js/fight-chars.js';
import { KITS } from '../js/fight-kits.js';
import { RULES } from '../js/fight.js';

const fr = s => s == null ? '-' : String(Math.round(s * 60));
const sec = s => typeof s === 'number' ? `${s} s (${Math.round(s * 60)} f)` : String(s);
const sg = s => s == null ? '-' : (s >= 0 ? '+' : '') + Math.round(s * 60) + ` (${s >= 0 ? '+' : ''}${s.toFixed(2)} s)`;
for (const id of FIGHT_ORDER) {
  const st = FIGHTERS[id];
  console.log(`\n### ${st.name} (${st.hp} health, walks ${Math.round(150 * st.walk)} u/s)\n`);
  for (const k of [...MOVE_KEYS, 'evade']) {
    const mv = st.moves[k], K = KITS[mv.do], key = ['light', 'heavy', 'special', 'guard'][[...MOVE_KEYS, 'evade'].indexOf(k)];
    const hit = k === 'evade' ? (mv.charges ? `${mv.charges} charges, each back ${mv.recharge} s after it's spent` : `cooldown ${mv.cooldown} s after it`)
      : (mv.do === 'stopworld' ? `freezes ${mv.freeze} s (hits on them: knockback x${mv.kbMul}, stored till the thaw)` : `${mv.damage} damage, kb ${mv.kb}${mv.kd ? ', knocks down' : ''}${mv.stun ? `, a ${mv.stun} s stagger` : ''}`) + `; cooldown ${mv.cooldown} s after it`;
    console.log(`**${mv.name}** (${k}, the ${key} key): ${hit}.${mv.hold ? ` Held: ${mv.hold === 'aim' ? 'aims it' : 'the held direction steers it'}.` : ''}\n`);
    console.log('| Phase | State | Time | Pose | What |');
    console.log('|---|---|---|---|---|');
    for (const [ph, state, t, pose, what] of K.phases(mv)) console.log(`| ${ph} | ${state} | ${sec(t)} | ${pose} | ${what} |`);
    console.log(`\nTell: ${mv.tell} Answer: ${mv.answer}\n`);
  }
}
console.log('\n## The old roster (unpickable since 2026-10-23, kept for their rebuild)');
for (const id of FIGHT_LEGACY) {
  const st = FIGHTERS[id];
  console.log(`\n### ${st.name} (${st.hp} health)\n`);
  console.log('| Move | Key | Kind | Startup | Active | Recovery | Armor | Damage | Stamina | Knocks down | Block stun | On block |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of frameData(st)) {
    const cost = r.cost ?? RULES.cost[r.kind] ?? 0, kd = r.kd ? 'yes' : r.key === 'heavy' ? 'full charge' : r.key === 'light' + (st.chain || 3) ? 'on a counter or flank' : '-';
    console.log(`| ${r.name} | ${r.key} | ${r.kind} | ${fr(r.startup)} | ${fr(r.active)} | ${fr(r.recovery)} | ${r.armor || '-'} | ${r.damage ?? '-'} | ${cost} | ${kd} | ${fr(r.blockStun)} | ${r.note && r.onBlock == null ? r.note : r.blockStun == null ? '-' : r.onBlock != null ? sg(r.onBlock) : 'thrown'} |`);
  }
}
