// Fight mode's frame-data tables (docs/fight-frames.md), from js/fight-chars.js and the kits (js/kits/index.js KITS):
// every fighter's three moves and evade phase by phase (each kit's phases(mv)) with their numbers, in seconds and 60 Hz
// frames.
//   node test/fight-frames.mjs   (paste the output into docs/fight-frames.md, below its introduction)
import { FIGHTERS, FIGHT_ORDER, MOVE_KEYS } from '../js/fight-chars.js';
import { KITS } from '../js/kits/index.js';

const sec = s => typeof s === 'number' ? `${s} s (${Math.ceil(s * 60 - 1e-6)} f)` : String(s);   // (a state lasts ceil(s x 60) fixed steps, as the sim and the practice room count)
for (const id of FIGHT_ORDER) {
  const st = FIGHTERS[id];
  console.log(`\n### ${st.name} (${st.hp} health, walks ${Math.round(150 * st.walk)} u/s)\n`);
  for (const k of [...MOVE_KEYS, 'evade']) {
    const mv = st.moves[k], K = KITS[mv.do], key = ['light', 'heavy', 'special', 'guard'][[...MOVE_KEYS, 'evade'].indexOf(k)];
    const hit = k === 'evade' ? (mv.charges ? `${mv.charges} charges, each back ${mv.recharge} s after it's spent` : `cooldown ${mv.cooldown} s after it`)
      : (mv.do === 'hotjava' ? `a ${mv.hit.damage} tap that sticks the pot on them; ${mv.fuse} s later it boils over: ${mv.boil.damage}, kb ${mv.boil.kb}, knocks down (on someone down: x${mv.boil.downMul}, no knockdown); a hit on Duke first passes it back onto him` : mv.do === 'jab' ? `${mv.hit.damage} then ${mv.last.damage} (kb ${mv.hit.kb}, ${mv.last.kb}), x(1 + ${mv.hot.step} x heat) as it heats up (each landed jab +1, at most ${mv.hot.max}; a statue x${mv.hot.frozen}); the second jab at full heat boils over: ${mv.boil.damage} x${1 + mv.hot.step * mv.hot.max}, kb ${mv.boil.kb}, knocks down` : mv.do === 'stopworld' ? `freezes ${mv.freeze} s (hits on them: knockback x${mv.kbMul}, stored till the thaw)` : mv.hit && mv.last ? `${mv.hit.damage} damage a quick hit (kb ${mv.hit.kb}), the last ${mv.last.damage} (kb ${mv.last.kb}${mv.last.kd ? ', knocks down' : ''})${mv.stop ? `; held, Stop the World: freezes ${mv.stop.freeze} s (knockback x${mv.stop.kbMul}, stored till the thaw), its own cooldown ${mv.stop.cooldown} s` : ''}` : `${mv.damage} damage, kb ${mv.kb}${mv.kd ? ', knocks down' : ''}${mv.stun ? `, a ${mv.stun} s stagger` : ''}`) + `; cooldown ${mv.cooldown} s after it`;
    console.log(`**${mv.name}** (${k}, the ${key} key): ${hit}.${mv.hold ? ` Held: ${mv.hold === 'aim' ? 'aims it' : mv.hold === 'charge' ? 'charges it' : 'the held direction steers it'}.` : ''}\n`);
    console.log('| Phase | State | Time | Pose | What |');
    console.log('|---|---|---|---|---|');
    for (const [ph, state, t, pose, what] of K.phases(mv)) console.log(`| ${ph} | ${state} | ${sec(t)} | ${pose} | ${what} |`);
    console.log(`\nTell: ${mv.tell} Answer: ${mv.answer}\n`);
  }
}
