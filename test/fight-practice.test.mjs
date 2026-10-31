// Fight's training room (js/fight-practice.js): every fighter as you and as the dummy, every dummy mode, a seeded masher.
// Checks: no rounds/clock/KO, health refills, exact replay, a clean move1's frames match its card, evade mode evades.
// Combo trials (js/fight-trials.js): 3-4 each, every demo completes its trial cleanly, not without its last press.
//   node test/fight-practice.test.mjs
import { Fight } from '../js/fight.js';
import { Practice, MODES, trialDemo, demoStep, hintText } from '../js/fight-practice.js';
import { FIGHT_ORDER, FIGHTERS } from '../js/fight-chars.js';
import { COMBOS } from '../js/fight-trials.js';
import { ARENA_ORDER } from '../js/fight-arenas.js';
import { mulberry } from '../js/core.js';

let fails = 0;
const ok = (c, what) => { if (!c) { fails++; console.log('FAIL ' + what); } };
function run(a, b, mode, seed, steps = 60 * 25) {
  const F = new Fight({ ids: [a, b], bots: [null, null], seed, practice: true, arena: ARENA_ORDER[seed % ARENA_ORDER.length] });
  const P = new Practice(F, { mode, seed });
  if (mode === 'replay') P.record();
  const r = mulberry(seed * 7 + 1); let inp = {}, kos = 0, refills = 0, low = 1;
  for (let n = 0; n < steps; n++) {
    if (r() < 0.1) inp = { x: Math.round(r() * 2 - 1), y: Math.round(r() * 2 - 1), light: r() < 0.3, heavy: r() < 0.2, special: r() < 0.15, guard: r() < 0.1 };
    P.frame(1 / 60, inp);
    for (const e of F.events) { if (e.kind === 'ko') kos++; if (e.kind === 'refill') refills++; }
    if (F.phase !== 'fight') { ok(false, `${a} v ${b} ${mode}: phase ${F.phase}`); break; }
    low = Math.min(low, F.f[1].hp / F.f[1].maxHp);
  }
  ok(!kos && !F.f.some(f => f.state === 'ko'), `${a} v ${b} ${mode}: a KO`);
  ok(F.f.every(f => Number.isFinite(f.x) && Number.isFinite(f.hp) && f.hp > 0), `${a} v ${b} ${mode}: bad state`);
  return { F, P, refills, low, sig: JSON.stringify([F.f.map(f => [f.x, f.y, f.hp, f.state]), F.rs, [...P.done]]) };
}
let n = 0, refills = 0;
for (const [k, a] of FIGHT_ORDER.entries()) for (const [j, [mode]] of MODES.entries()) {
  const b = FIGHT_ORDER[(k + 1 + j) % FIGHT_ORDER.length], R = run(a, b, mode, 11 + k * 5 + j);
  refills += R.refills; n++;
  if (j === 0) ok(run(a, b, mode, 11 + k * 5 + j).sig === R.sig, `${a} v ${b}: replays differently`);
}
ok(refills > 0, 'health never refilled');
// a clean move1 on a standing dummy, measured: the card's startup and active
for (const id of FIGHT_ORDER) {
  const F = new Fight({ ids: [id, 'tux'], bots: [null, null], seed: 5, practice: true, arena: 'ring' }), P = new Practice(F);
  for (let s = 0; s < 120 && !P.fd; s++) P.frame(1 / 60, { light: s < 2 });
  const mv = F.f[0].stats.moves.move1;
  const card = Math.ceil(mv.startup * 60 - 1e-6);
  ok(P.fd && P.fd.startup === card, `${id}: move1 startup measured ${P.fd && P.fd.startup}, card ${card}`);
}
// the evade mode: about half of a fighter's moves get evaded
{
  const F = new Fight({ ids: ['tux', 'duke'], bots: [null, null], seed: 9, practice: true, arena: 'ring' }), P = new Practice(F, { mode: 'evade' });
  let ev = 0;
  for (let s = 0; s < 60 * 30; s++) { P.frame(1 / 60, { light: s % 40 < 2 }); ev += F.events.filter(e => e.who === 1 && F.f[1].move === 'evade').length ? 1 : 0; }
  ok(ev > 0, 'the evade mode never evaded');
}
// the combo trials: each demo completes its own trial, cleanly; without its last press it doesn't, and says where it broke
let nt = 0;
const keys = new Set();
for (const id of FIGHT_ORDER) {
  const list = COMBOS[id] || [];
  ok(list.length >= 3 && list.length <= 4, `${id}: ${list.length} combo trials (3-4 wanted)`);
  for (const T of list) {
    ok(!keys.has(T.k) && T.k.startsWith('c:'), `${T.k}: a key that's taken or not 'c:...'`); keys.add(T.k);
    ok(T.steps.length >= 2 && T.steps.every(st => FIGHTERS[id].moves[st.m] && st.what && st.ev), `${T.k}: a step without a move, words or an event`);
    ok(MODES.some(([m]) => m === (T.mode || 'stand')), `${T.k}: no dummy mode ${T.mode}`);
    const c = trialDemo(id, T.k); let broke = null;
    while (!demoStep(c)) if (c.P.hint && !broke) broke = c.P.hint;
    ok(c.P.done.has(T.k), `${T.k}: its demo doesn't complete it (got to step ${((c.P.prog[T.k] || {}).i || 0) + 1} of ${T.steps.length})`);
    ok(!broke, `${T.k}: its demo broke an attempt: ${broke && hintText(T, broke)}`);
    // the last press left out: not done, and a hint
    const cut = { ...T, demo: { ...T.demo, a: T.demo.a.slice(0, -1) } }, c2 = trialDemo(id, T.k);
    c2.sc = cut.demo; c2.len += 300; while (!demoStep(c2));   // (and 5 s more: the gap runs out)
    ok(!c2.P.done.has(T.k) && c2.P.hint && /^Step \d/.test(hintText(T, c2.P.hint)), `${T.k}: without its last press it ${c2.P.done.has(T.k) ? 'still completes' : 'gives no hint'}`);
    nt++;
  }
}
console.log(fails ? `fight-practice: ${fails} failures` : `fight-practice: ok (${n} rooms, ${refills} refills, ${nt} combo trials)`);
process.exit(fails ? 1 : 0);
