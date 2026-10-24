// Fight mode's sim checks (no balance, no win rates: 2026-10-23, the user: "dont even think about balancing for now i
// guess, dont run simulations on win percentage between characters"):
//   1. determinism: Tux v Duke at every level, the mirrors, every arena; and the old roster still runs the same twice
//   2. every fight ends by KO (health only), nobody ever outside the arena, no round past the clock plus a minute, every
//      number finite. Prints how long rounds run and how often each move is thrown and lands a round (for the feel)
//   3. the controls (the three move keys, the evade on the guard key, the buffer, cooldowns, holding to aim, walking)
//   4. the combat rules (no shield, stamina or flank bonus since 2026-10-23; counter hits, knockdowns and get-ups)
//   5. every move does what it says (its tell, its answer): the toboggan's line, walked out of, its bounce; the iceberg
//      lands where it was aimed, walked out of, dizzy on a miss, the ice; the fork's penguins (their hits, one fork at a
//      time, a hit at Tux through one pops it instead); the portal opens behind them, walked away from; the ring freezes
//      only someone inside, breaks if Duke is hit, a freeze stores the knockback; the geyser lands where it was aimed
//      (and held), walked off, leaves a puddle; Tux's Ice Block (rooted, the crack is open, a cooldown; a hit shatters it and
//      the shards stagger the hitter if close, long enough for the toboggan)
//      and Duke's Garbage Collect (a blink the held way or away, two charges coming back, out of a toboggan); no supers
//   6. (the old roster's rules: gone, 2026-10-24, once Cpp and Bugdroid were rebuilt)
//   7. every move card's clip lands (fight-clips.js script(id, k), else the fighter's own clips in fight-chars.js)
// The plug-in fighters (js/kits/<id>.js, 2026-10-24): bot fights against Tux, Duke and themselves at every level (they
// end, the same twice, every move thrown and landed), and their own checks from test/kits/<id>.mjs (each exports
// checks(T): every move does what it says, and lands: what each move card's clip must show)
//   node test/fight.test.mjs [fights a level, default 24]
import { ARENA_ORDER, ARENAS, sd } from '../js/fight-arenas.js';
import { Fight, FIXED, RULES, comboScale } from '../js/fight.js';
import { FIGHTERS, FIGHT_LEGACY, FIGHT_ORDER } from '../js/fight-chars.js';
import { fresh, inputAt, script } from '../js/fight-clips.js';
import { PLUGINS } from '../js/kits/index.js';
import { existsSync } from 'node:fs';
const KIT_TESTS = {};   // (test/kits/<id>.mjs for each plug-in fighter)
for (const p of PLUGINS) { const u = new URL(`./kits/${p.id}.mjs`, import.meta.url); if (existsSync(u)) KIT_TESTS[p.id] = await import(u.href); }

let fails = 0;
const fail = msg => { fails++; console.log('FAIL ' + msg); };

function hashState(F) {
  const s = JSON.stringify({ f: F.f.map(f => ({ ...f, stats: undefined })), objs: F.objs, phase: F.phase, round: F.round,
    clock: F.clock, dmgMul: F.dmgMul, hitstop: F.hitstop, time: F.time, rs: F.rs, ai: F.ai, wins: F.wins });
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  return h >>> 0;
}

// run a bot-vs-bot fight to the end; returns the fight, the step count, (optionally) hashes every 60 steps, and per
// fighter and move how often it was thrown (its tell) and landed (a clean hit or a freeze)
function runFight(cfg, hashes) {
  const F = new Fight(cfg), cap = (F.cfg.roundTime + 60 + 4) * 60 * F.cfg.bestOf * 3;
  let n = 0, roundSteps = 0, maxRound = 0, lastRound = F.round, outside = 0;
  const use = {};
  const u = (i, m) => { const k = F.f[i].id + ' ' + m; return use[k] || (use[k] = { go: 0, land: 0, blocked: 0 }); };
  while (F.phase !== 'over' && n < cap) {
    F.step(); n++;
    for (const e of F.events) {
      if (e.who == null || !e.move || !/^move/.test(e.move)) continue;
      if (e.kind === 'tell') u(e.who, e.move).go++;
      else if (e.kind === 'hit' || e.kind === 'freeze' || e.kind === 'feLocked' || e.kind === 'cpGoo') u(e.who, e.move).land++;   // (Ferris's Lock and Cpp's sludge land without a hit)
      else if (e.kind === 'clink' && e.who != null) u(e.who, e.move).blocked++;   // (off Tux's ice)
    }
    F.events.length = 0;
    for (const f of F.f) if (sd(F.A.bounds, f.x, f.y)[0] > 0.5) outside++;
    if (F.round !== lastRound) { lastRound = F.round; roundSteps = 0; }
    if (F.phase === 'fight' || F.phase === 'sudden') { roundSteps++; maxRound = Math.max(maxRound, roundSteps); }
    if (hashes && n % 60 === 0) hashes.push(hashState(F));
  }
  return { F, n, maxRound: maxRound * FIXED, outside, use };
}
const same = (cfg, what) => { const a = [], b = []; runFight(cfg, a); runFight(cfg, b); if (a.length !== b.length || a.some((h, k) => h !== b[k])) fail(`determinism: ${what}`); };
const checkRun = (r, what) => {
  if (r.F.phase !== 'over') { fail(`${what}: never ended (round ${r.F.round}, phase ${r.F.phase})`); return false; }
  if (r.outside) fail(`${what}: a fighter outside the arena for ${r.outside} steps`);
  if (r.maxRound > r.F.cfg.roundTime + 60) fail(`${what}: a round ran ${r.maxRound.toFixed(1)} s`);
  for (const f of r.F.f) if (![f.x, f.y, f.z, f.vx, f.vy, f.hp, f.stam].every(Number.isFinite)) fail(`${what}: non-finite fighter`);
  for (const rd of r.F.rounds) if (rd.how !== 'ko' && rd.how !== 'double') fail(`${what}: round ${rd.round} ended by ${rd.how}`);
  return true;
};

// ---------------------------------------------------------------- 0. the roster
if (FIGHT_ORDER.slice(0, 2).join() !== 'tux,duke' || FIGHT_ORDER.slice(2).some(id => !PLUGINS.some(p => p.id === id))) fail(`Tux and Duke, then the rebuilt plug-ins, are pickable (${FIGHT_ORDER})`);
for (const p of PLUGINS) if (!KIT_TESTS[p.id] && !['gopher', 'ferris'].includes(p.id)) fail(`${p.id}: no test/kits/${p.id}.mjs`);   // (Gopher's and Ferris's checks are written out in this file)
for (const id of FIGHT_LEGACY) if (FIGHT_ORDER.includes(id) || !FIGHTERS[id]) fail(`${id} isn't pickable and keeps its data`);   // (hidden from the pick since 2026-10-24, FIGHT_SOON empty; greyed out as "soon" before)
for (const id of FIGHT_ORDER) {
  const M = FIGHTERS[id].moves;
  if (!FIGHTERS[id].kit3 || M.light1 || M.heavy || M.special || M.super) fail(`${id}: three moves, no jab, heavy, special or super`);
  for (const k of ['move1', 'move2', 'move3', 'evade']) if (!M[k] || !M[k].do || !M[k].tell || !M[k].answer) fail(`${id} ${k}: a kit, a tell and an answer`);
}

// ---------------------------------------------------------------- 1. determinism
for (const seed of [1, 7, 42]) for (const lv of [0, 1, 2]) same({ bots: [lv, 2 - lv], seed, supers: seed !== 7 }, `seed ${seed} level ${lv}`);
ARENA_ORDER.forEach((arena, k) => {
  same({ ids: ['duke', 'tux'], bots: [1, 2], seed: 11 + k, arena }, `Duke v Tux in ${arena}`);
  same({ ids: ['tux', 'tux'], bots: [0, 1], seed: 21 + k, arena }, `Tux v Tux in ${arena}`);
  same({ ids: ['duke', 'duke'], bots: [2, 2], seed: 31 + k, arena }, `Duke v Duke in ${arena}`);
  same({ ids: ['gopher', 'ferris'], bots: [k % 3, 2 - k % 3], seed: 41 + k, arena }, `Gopher v Ferris in ${arena}`);   // (the plug-ins: js/kits/)
  same({ ids: ['ferris', 'tux'], bots: [1, 1], seed: 51 + k, arena }, `Ferris v Tux in ${arena}`);
  same({ ids: ['duke', 'gopher'], bots: [2, 0], seed: 61 + k, arena }, `Duke v Gopher in ${arena}`);
});
FIGHT_LEGACY.forEach((id, k) => {   // (the old roster still runs, and still the same twice)
  const cfg = { ids: [id, FIGHT_LEGACY[(k + 1) % FIGHT_LEGACY.length]], bots: [1, 1], seed: 101 + k, supers: k % 2 === 0, arena: ARENA_ORDER[k % ARENA_ORDER.length] };
  same(cfg, `${cfg.ids.join(' v ')} (the old roster)`);
  checkRun(runFight(cfg), `${cfg.ids.join(' v ')} (the old roster)`);
});

// ---------------------------------------------------------------- 2. every fight ends; how rounds run (no win rates)
const N = +process.argv[2] || 24;
{
  const len = [], use = {};
  for (const lv of [0, 1, 2]) for (let s = 1; s <= N; s++) {
    const R = FIGHT_ORDER, ids = [R[s % R.length], R[(s + Math.floor(s / R.length)) % R.length]];   // (every pairing and mirror over the seeds)
    const r = runFight({ ids, bots: [lv, lv], seed: s * 7919 + lv, supers: s % 3 === 0, arena: ARENA_ORDER[s % ARENA_ORDER.length] });
    if (!checkRun(r, `level ${lv} seed ${s} (${ids.join(' v ')})`)) continue;
    for (const rd of r.F.rounds) len.push(rd.time);
    for (const [k, v] of Object.entries(r.use)) { const w = use[k] || (use[k] = { go: 0, land: 0, blocked: 0, rounds: 0 }); w.go += v.go; w.land += v.land; w.blocked += v.blocked; }
    for (const id of new Set(ids)) for (const k of Object.keys(use)) if (k.startsWith(id + ' ')) use[k].rounds += r.F.rounds.length * ids.filter(x => x === id).length;
  }
  len.sort((a, b) => a - b);
  const q = p => len[Math.min(len.length - 1, Math.floor(len.length * p))].toFixed(0);
  console.log(`${N * 3} bot fights (every level, every arena, mirrors): rounds median ${q(0.5)} s, middle 80% ${q(0.1)}-${q(0.9)} s`);
  console.log('a fighter\'s round: ' + Object.entries(use).sort().map(([k, v]) => `${k} ${(v.go / v.rounds).toFixed(1)} thrown, ${(v.land / v.rounds).toFixed(1)} land, ${(v.blocked / v.rounds).toFixed(1)} clinked off the ice`).join(' | '));
  if (+q(0.5) < 15 || +q(0.5) > 60) fail(`rounds should run roughly 20-60 s (median ${q(0.5)} s)`);
  for (const [k, v] of Object.entries(use)) if (!(v.go > 0) || !(v.land > 0)) fail(`the bots throw and land ${k} (${v.go} thrown, ${v.land} landed)`);
}

// ---------------------------------------------------------------- 2b. the plug-in fighters' bot fights
for (const p of PLUGINS) {
  const use = {};
  [['tux', 0], ['duke', 1], [p.id, 2]].forEach(([foe, j]) => {
    for (const lv of [0, 1, 2]) for (let s = 1; s <= Math.max(2, Math.round(N / 8)); s++) {
      const ids = (s + lv) % 2 ? [p.id, foe] : [foe, p.id], cfg = { ids, bots: [lv, 2 - lv], seed: 977 * s + 31 * j + lv, supers: false, arena: ARENA_ORDER[(s + j + lv) % ARENA_ORDER.length] };
      if (s === 1 && lv === 1) same(cfg, `${ids.join(' v ')} (plug-in)`);
      const r = runFight(cfg);
      if (!checkRun(r, `${ids.join(' v ')} level ${lv} seed ${s}`)) continue;
      for (const [k, v] of Object.entries(r.use)) if (k.startsWith(p.id + ' ')) { const w = use[k] || (use[k] = { go: 0, land: 0 }); w.go += v.go; w.land += v.land; }
    }
  });
  console.log(`${p.id}'s bots: ` + Object.entries(use).sort().map(([k, v]) => `${k.slice(p.id.length + 1)} ${v.go} thrown, ${v.land} landed`).join(' | '));
  for (const k of ['move1', 'move2', 'move3']) { const v = use[p.id + ' ' + k]; if (!v || !(v.go > 0) || !(v.land > 0)) fail(`${p.id}'s bots throw and land ${k} (${v ? v.go : 0} thrown, ${v ? v.land : 0} landed)`); }
}

// ---------------------------------------------------------------- scripted humans (two of them, no bots)
const I = { x: 0, y: 0, light: false, heavy: false, special: false, guard: false };
const mk = (ids = ['tux', 'duke'], supers = false, arena) => { const F = new Fight({ ids, bots: [null, null], seed: 3, supers, roundTime: 99, arena }); F.phase = 'fight'; F.pt = 0; return F; };
const place = (F, gap, o = {}) => {
  const [a, b] = F.f, d = a.r + b.r + gap;
  Object.assign(a, { x: -d / 2, y: 0, vx: 0, vy: 0, face: 0, state: 'idle', move: null, t: 0, hold: -1, stam: 1, gassed: 0, stepCd: 0, bufK: '', cd: [0, 0, 0, 0] }, o.a);
  Object.assign(b, { x: d / 2, y: 0, vx: 0, vy: 0, face: Math.PI, state: 'idle', move: null, t: 0, hold: -1, stam: 1, gassed: 0, stepCd: 0, bufK: '', cd: [0, 0, 0, 0] }, o.b);
  F.hitstop = 0;
};
// run n steps with inputs per fighter (functions of the step number or plain objects); returns the events
const run = (F, n, a = {}, b = {}) => {
  const evs = [];
  for (let k = 0; k < n; k++) {
    F.setInput(0, { ...I, ...(typeof a === 'function' ? a(k) : a) }); F.setInput(1, { ...I, ...(typeof b === 'function' ? b(k) : b) });
    F.step(); evs.push(...F.events); F.events.length = 0;
  }
  return evs;
};
const kinds = ev => ev.map(e => e.kind).join(',');
const tap = key => k => ({ [key]: k < 2 });
const has = (ev, kind, who, extra = {}) => ev.some(e => e.kind === kind && (who == null || e.who === who) && Object.entries(extra).every(([k, v]) => e[k] === v));
const S = s => Math.ceil(s / FIXED);

// ---------------------------------------------------------------- 3. the controls
{
  const expect = (cond, msg) => { if (!cond) fail('controls: ' + msg); };
  { // the intro, then light / heavy / special fire move1 / move2 / move3 (their tells); no stamina any more
    const F = new Fight({ bots: [null, null], seed: 5 });
    run(F, Math.ceil(1.7 / FIXED));
    expect(F.phase === 'fight', `phase after intro is ${F.phase}`);
    for (const [key, mvk] of [['light', 'move1'], ['heavy', 'move2'], ['special', 'move3']]) {
      const G = mk(); place(G, 120); const me = G.f[0];
      const ev = run(G, 1, { [key]: true });
      expect(me.state === 'wind' && me.move === mvk && has(ev, 'tell', 0, { move: mvk }), `${key} -> ${me.state}/${me.move}`);
      expect(me.stam === 1, `no stamina spent (${me.stam})`);
    }
  }
  { // a cooldown: pressed again right after, nothing; once it has run out (after the move), it fires again
    const F = mk(['duke', 'tux']); place(F, 200); const me = F.f[0];
    run(F, 1, { light: true }); let n = 0; while (me.move && n++ < 120) run(F, 1);
    expect(me.cd[0] > 0, `move1 cooling down after it (${me.cd[0]})`);
    run(F, 1, { light: true }); run(F, 1);
    expect(me.move == null, `pressed on cooldown: nothing (${me.state}/${me.move})`);
    run(F, S(me.stats.moves.move1.cooldown) + 2); run(F, 1, { light: true });
    expect(me.move === 'move1', `off cooldown: fires again (${me.state}/${me.move})`);
  }
  { // the buffer: a press a few frames before a recovery ends fires on its first free frame; one long before is forgotten
    const F = mk(['duke', 'tux']); place(F, 200); const me = F.f[0];
    run(F, 1, { special: true }); let n = 0; while (me.state !== 'recover' && n++ < 120) run(F, 1);
    const left = Math.round((me.dur - me.t) / FIXED);
    run(F, Math.max(0, left - 6)); run(F, 1, { light: true });
    let fired = -1; for (let k = 0; k < 12 && fired < 0; k++) { run(F, 1); if (me.move === 'move1') fired = k; }
    expect(fired >= 0 && fired <= 6, `a press 6 frames before the recovery's end fires as it ends (${fired})`);
    const G = mk(['duke', 'tux']); place(G, 200); const g = G.f[0];
    run(G, 1, { special: true }); run(G, 2); run(G, 1, { light: true }); run(G, 60);
    expect(g.move !== 'move1' && g.bufK === '', `a press long before is forgotten (${g.move}, ${g.bufK})`);
  }
  { // holding the geyser aims it: the mark moves the held way while held, then the pot goes
    const F = mk(['duke', 'tux']); place(F, 120); const me = F.f[0];
    run(F, 1, { special: true }); const gz = F.objs.find(o => o.kind === 'geyser'), y0 = gz.y;
    run(F, 20, { special: true, x: 0, y: 1 });
    expect(gz.y > y0 + 30 && me.state === 'wind', `held: the mark moves (${(gz.y - y0).toFixed(0)}) and he keeps aiming (${me.state})`);
    run(F, 2);
    expect(me.state === 'strike' || me.state === 'recover', `let go: the throw (${me.state})`);
  }
  { // walking is near-instant; backing away is slower
    const F = mk(); place(F, 200); const me = F.f[0];
    run(F, 5, { x: 1 }); const fwd = Math.hypot(me.vx, me.vy), full = 150 * me.stats.walk;
    expect(fwd > 0.9 * full, `full speed in 5 frames (${fwd.toFixed(0)} of ${full.toFixed(0)})`);
    run(F, 5); expect(Math.hypot(me.vx, me.vy) < 0.1 * full, `stopped in 5 frames (${Math.hypot(me.vx, me.vy).toFixed(1)})`);
    run(F, 20, { x: -1 }); const back = Math.hypot(me.vx, me.vy);
    expect(Math.abs(back / fwd - RULES.backWalk) < 0.05, `backing away is slower (${(back / fwd).toFixed(2)})`);
  }
  { // the guard key is the evade, with or without a direction: no block, no step
    for (const id of ['tux', 'duke']) {
      const F = mk([id, id === 'tux' ? 'duke' : 'tux']); place(F, 120); const me = F.f[0];
      const ev = run(F, 2, { guard: true, y: 1 });
      expect(me.move === 'evade' && !has(ev, 'step') && me.state !== 'block', `${id}: guard + down -> the evade (${me.state}/${me.move})`);
      run(F, 60); place(F, 120); run(F, 20, { guard: true });
      expect(me.state !== 'block', `${id}: guard held is no block (${me.state})`);
    }
  }
  { // aiming (2026-10-24): the toboggan starts aimed at the foe and turns the held way smoothly (eased, no overshoot to
    // speak of); the iceberg's shadow and the geyser's mark start on the foe and move the held way, easing in, no faster
    // than their aim speed, diagonals (8-way keys) as fast as the straights
    const F = mk(); place(F, 100); const me = F.f[0];
    run(F, 1, { light: true, x: Math.cos(0.6), y: Math.sin(0.6) });
    expect(Math.abs(me.face) < 0.06, `the toboggan starts at them (${me.face.toFixed(2)})`);
    let peak = 0; for (let k = 0; k < 20; k++) { run(F, 1, { x: Math.cos(0.6), y: Math.sin(0.6) }); peak = Math.max(peak, me.face); }
    expect(Math.abs(me.face - 0.6) < 0.08 && peak < 0.66, `then turns the held way, settling (${me.face.toFixed(2)}, peak ${peak.toFixed(2)})`);
    const moved = (id, key, kind, inp) => {
      const G = mk([id, id === 'tux' ? 'duke' : 'tux']); place(G, 140);
      run(G, 1, { [key]: true }); const ob = G.objs.find(o => o.kind === kind), x0 = ob.x, y0 = ob.y, steps = [];
      let px = x0, py = y0; for (let k = 0; k < 18; k++) { run(G, 1, { [key]: true, ...inp }); steps.push(Math.hypot(ob.x - px, ob.y - py)); px = ob.x; py = ob.y; }
      return { ob, d: Math.hypot(ob.x - x0, ob.y - y0), steps, foe: G.f[1] };
    };
    for (const [id, key, kind, mvk] of [['tux', 'heavy', 'shadow', 'move2'], ['duke', 'special', 'geyser', 'move3']]) {
      const sp = FIGHTERS[id].moves[mvk].aimSpeed, st = moved(id, key, kind, { x: 0, y: -1 }), dg = moved(id, key, kind, { x: -1, y: -1 });
      expect(st.steps[0] < st.steps[8] && Math.max(...st.steps) <= sp / 60 + 1e-6, `${kind}: eases in, never past ${sp} u/s (${st.steps.map(v => v.toFixed(1)).join(' ')})`);
      expect(Math.abs(st.d - dg.d) < 0.06 * st.d, `${kind}: a diagonal as fast as a straight (${st.d.toFixed(1)} v ${dg.d.toFixed(1)})`);
      const G = mk([id, id === 'tux' ? 'duke' : 'tux']); place(G, 140); run(G, 1, { [key]: true, x: 0, y: 1 });
      const ob = G.objs.find(o => o.kind === kind);
      expect(ob && Math.hypot(ob.x - G.f[1].x, ob.y - G.f[1].y) < 1, `${kind}: starts on them, whatever's held`);
    }
  }
}

// ---------------------------------------------------------------- 4. the combat rules with the three moves
{
  const expect = (cond, msg) => { if (!cond) fail('combat: ' + msg); };
  { // no shield: a toboggan into someone holding guard (their evade spent) lands in full; no flank bonus from behind
    const F = mk(['tux', 'duke']); place(F, 90, { b: { face: 0, ev: 0, evT: 9 } }); const duke = F.f[1], hp = duke.hp, M = F.f[0].stats.moves.move1;
    const ev = run(F, 50, tap('light'), { guard: true });
    expect(!has(ev, 'block') && !has(ev, 'flank') && Math.abs((hp - duke.hp) - M.damage) < 1e-6 && has(ev, 'down', 1), `in full, from behind, no bonus (${(hp - duke.hp).toFixed(2)} of ${M.damage}, ${kinds(ev)})`);
    expect(duke.stam === 1 && F.f[0].stam === 1, 'no stamina either way');
  }
  { // a counter hit: the toboggan into Duke's snap (his wind-up) does x1.4 and breaks his ring
    const F = mk(['tux', 'duke']); place(F, 70); const duke = F.f[1], hp = duke.hp;
    const ev = run(F, 50, tap('light'), tap('heavy'));
    expect(has(ev, 'counter', 0), `a counter hit (${kinds(ev)})`);
    expect(Math.abs((hp - duke.hp) - F.f[0].stats.moves.move1.damage * RULES.counter) < 1e-6, `x${RULES.counter} (${(hp - duke.hp).toFixed(2)})`);
    expect(has(ev, 'ringbreak', 1), `his ring breaks (${kinds(ev)})`);
  }
  { // a knockdown: down, then getting up, untouchable throughout
    const F = mk(['tux', 'duke']); place(F, 90); const duke = F.f[1];
    const ev = run(F, 50, tap('light'));
    expect(has(ev, 'down', 1) && duke.state === 'down', `the toboggan knocks down (${duke.state})`);
    const hp = duke.hp; place(F, 6, { b: { state: 'down', t: 0, dur: 0.7, hp } }); F.f[1].down = true;
    run(F, 40, tap('light'));
    expect(duke.hp === hp, 'nothing hits them while they\'re down');
    const ev2 = run(F, 60);
    expect(has(ev2, 'getup', 1), `they get up (${kinds(ev2)})`);
  }
  expect(comboScale(1) === 1 && comboScale(3) < comboScale(2) && comboScale(99) === RULES.comboMin, 'hitstun shrinks with the combo');
}

// ---------------------------------------------------------------- 5. every move does what it says
{
  const expect = (cond, msg) => { if (!cond) fail('moves: ' + msg); };
  const segDist = (px, py, [x0, y0], [x1, y1]) => { const ex = x1 - x0, ey = y1 - y0, L = ex * ex + ey * ey || 1, t = Math.max(0, Math.min(1, ((px - x0) * ex + (py - y0) * ey) / L)); return Math.hypot(px - x0 - ex * t, py - y0 - ey * t); };
  // ---- Tux: Toboggan Torpedo
  { // the crouch shows his line, through them; he slides along it and knocks them down
    const F = mk(['tux', 'duke']); place(F, 120); const [tux, duke] = F.f;
    run(F, 4, tap('light'));
    const ln = F.objs.find(o => o.kind === 'tobline');
    expect(ln && ln.ph === 'aim' && tux.ph === 'crouch' && tux.pose === 'crouch', `crouching, the line shown (${tux.ph}, ${ln && ln.ph})`);
    expect(ln && ln.pts.some((p, k) => k && segDist(duke.x, duke.y, ln.pts[k - 1], p) < 2), 'the line runs through them');
    const ev = run(F, 50);
    expect(has(ev, 'toboggan', 0) && has(ev, 'hit', 0, { move: 'move1' }) && has(ev, 'down', 1), `it lands and knocks down (${kinds(ev)})`);
    expect(tux.ph === 'skid' || !tux.move, `skids to a stop after (${tux.ph})`);
  }
  { // out of the line (walked sideways in the crouch), and it misses: flat on his belly, open
    const F = mk(['tux', 'duke']); place(F, 150); const duke = F.f[1], hp = duke.hp;
    const ev = run(F, 110, tap('light'), k => k < 70 ? { x: 0, y: -1 } : {});
    expect(duke.hp === hp && !has(ev, 'hit', 0), `out of the line: no hit (${kinds(ev)})`);
    expect(has(ev, 'belly', 0), `he ends flat on his belly (${kinds(ev)})`);
  }
  { // off a wall once (the line bends there too), the second wall stops him
    const F = mk(['tux', 'duke']); place(F, 300, { a: { x: 0, y: 0 }, b: { x: 0, y: 200 } }); F.f[0].face = 0;
    const tux = F.f[0];
    run(F, 4, k => ({ light: k < 2, x: 1, y: 0 }));
    const ln = F.objs.find(o => o.kind === 'tobline');
    expect(ln && ln.bi.length === 1, `the line bounces once (${ln && ln.bi.length})`);
    const ev = run(F, 115, { x: 1, y: 0 });
    expect(ev.filter(e => e.kind === 'bounce' && e.who === 0).length === 1 && has(ev, 'belly', 0), `one bounce, then flat (${kinds(ev)})`);
    expect(tux.state === 'recover' || !tux.move, `stopped (${tux.state})`);
  }
  // ---- Tux: Iceberg Drop
  { // aimed the held way: the shadow from them the held way, he lands there, the floor freezes; nobody near: dizzy
    const F = mk(['tux', 'duke']); place(F, 150); const [tux, duke] = F.f;
    run(F, 1, { heavy: true, x: 0, y: 1 });
    const sh = F.objs.find(o => o.kind === 'shadow');
    run(F, 20, { x: 0, y: 1 });
    expect(tux.air && tux.z > 100 && tux.inv > 0, `up out of shot, untouchable (z ${tux.z.toFixed(0)})`);
    const ev = run(F, 60, k => k < 30 ? { x: 0, y: 1 } : {});
    const land = ev.find(e => e.kind === 'land' && e.who === 0), ice = F.objs.find(o => o.kind === 'ice');
    expect(land && sh && Math.abs(land.x - sh.x) < 0.01 && Math.abs(land.y - sh.y) < 0.01 && sh.y > duke.y + 70, `lands where the shadow was aimed (${land && land.x.toFixed(0)}, ${land && land.y.toFixed(0)})`);
    expect(ice && Math.hypot(ice.x - land.x, ice.y - land.y) < 1, 'an ice patch there');
    expect(has(ev, 'dizzy', 0) && tux.ph === 'dizzy', `hit nothing: dizzy (${tux.ph})`);
  }
  { // on them, down they go; walking out of the shadow, it misses
    const F = mk(['tux', 'duke']); place(F, 100);
    let ev = run(F, 70, tap('heavy'));
    expect(has(ev, 'land', 0, { hit: true }) && has(ev, 'down', 1), `on them: down (${kinds(ev)})`);
    const G = mk(['tux', 'duke']); place(G, 100); const d2 = G.f[1], hp = d2.hp;
    ev = run(G, 70, tap('heavy'), k => k > 10 ? { x: 1, y: 0 } : {});
    expect(has(ev, 'land', 0, { hit: false }) && d2.hp === hp, `walked out of the shadow: missed (${kinds(ev)})`);
  }
  { // on the ice: anyone slides (less grip), and his toboggan is faster across it
    const F = mk(['tux', 'duke']); place(F, 150); const [tux, duke] = F.f;
    F.objs.push({ id: ++F.oid, kind: 'ice', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 400, grip: 0.25, t: 0, life: 9, owner: 0, hit: false });
    run(F, 1); expect(duke.ice > 0 && tux.ice > 0, 'on the ice patch');
    run(F, S(tux.stats.moves.move1.startup) + 4, tap('light'));
    expect(Math.hypot(tux.vx, tux.vy) > tux.stats.moves.move1.speed * 1.2, `faster on ice (${Math.hypot(tux.vx, tux.vy).toFixed(0)})`);
  }
  // ---- Tux: fork() Bomb
  { // three penguins waddle at them and slide in: small hits, a stagger each
    const F = mk(['tux', 'duke']); place(F, 140); const duke = F.f[1];
    const ev = run(F, S(3.6), tap('special'));
    expect(has(ev, 'fork', 0) && ev.filter(e => e.kind === 'hit' && e.who === 0 && e.move === 'move3').length >= 2, `the penguins land (${kinds(ev)})`);
    expect(ev.filter(e => e.kind === 'peng').length === 3, 'all three burst');
    expect(!has(ev, 'down', 1), 'small hits: no knockdown');
  }
  { // one fork at a time; a blink lets their slides through
    const F = mk(['tux', 'duke']); place(F, 140); const [tux, duke] = F.f;
    run(F, 60, tap('special'));
    tux.cd[2] = 0; run(F, 2, tap('special'));
    expect(tux.move !== 'move3' && F.objs.filter(o => o.kind === 'peng').length >= 1, `one fork at a time (${tux.move})`);
  }
  { // they shield Tux: Duke's smash at him through one pops it instead
    const F = mk(['duke', 'tux']); place(F, 80); const [duke, tux] = F.f, hp = tux.hp;
    run(F, 2, tap('light')); for (let k = 0; k < 60 && duke.ph !== 'out'; k++) run(F, 1);   // (out of the portal: a penguin between them now)
    const pt = duke;
    F.objs.push({ id: ++F.oid, kind: 'peng', x: (pt.x + tux.x) / 2, y: (pt.y + tux.y) / 2, z: 0, vx: 0, vy: 0, vz: 0, r: 9, a: 0, ph: 'pop', pt: 0, wait: 0, t: 0, life: 9, owner: 1, hit: false });
    tux.stats = { ...tux.stats, walk: 0 };   // (stands still)
    const ev = run(F, 40);
    tux.stats = FIGHTERS.tux;
    expect(has(ev, 'peng', 1, { how: 'soak' }) && tux.hp === hp, `the penguin takes it (${ev.filter(e => e.kind === 'peng').map(e => e.how)}, ${kinds(ev)})`);
  }
  // ---- Duke: Write Once, Run Anywhere
  { // the mark opens behind them; out he comes with a smash (knocks down)
    const F = mk(['duke', 'tux']); place(F, 80); const [duke, tux] = F.f;
    let ev = run(F, S(0.25), tap('light'));
    const pt = F.objs.find(o => o.kind === 'portal');
    expect(pt && duke.gone && Math.cos(tux.face) * (pt.x - tux.x) + Math.sin(tux.face) * (pt.y - tux.y) < 0, `the mark is behind them (${pt && pt.x.toFixed(0)} vs Tux at ${tux.x.toFixed(0)}, facing ${tux.face.toFixed(2)})`);
    ev = ev.concat(run(F, 40));
    expect(has(ev, 'popout', 0) && has(ev, 'smash', 0, { hit: true }) && has(ev, 'down', 1), `the smash lands (${kinds(ev)})`);
  }
  { // walking away from the mark (Duke's quick feet): missed, he stumbles out open
    const F = mk(['duke', 'duke']); place(F, 80); const d2 = F.f[1], hp = d2.hp;
    const ev = run(F, 70, tap('light'), k => k > 14 && k < 50 ? { x: -1, y: 0 } : {});
    expect(d2.hp === hp && has(ev, 'stumble', 0) && has(ev, 'smash', 0, { hit: false }), `walked away: missed (${kinds(ev)})`);
  }
  // ---- Duke: Stop the World
  { // the ring freezes only someone inside it when it completes
    const F = mk(['duke', 'tux']); place(F, 60); const tux = F.f[1];
    let ev = run(F, S(0.4), tap('heavy'));
    const rg = F.objs.find(o => o.kind === 'ring');
    expect(rg && rg.ph === 'grow' && rg.r > 0 && rg.r < rg.R, `the ring grows (${rg && rg.r.toFixed(0)})`);
    ev = ev.concat(run(F, S(0.4)));
    expect(has(ev, 'freeze', 0) && tux.state === 'frozen', `inside: frozen (${tux.state})`);
    const G = mk(['duke', 'tux']); place(G, 60); const t2 = G.f[1];
    ev = run(G, S(0.85), tap('heavy'), k => k > 6 ? { x: 1, y: 0 } : {});
    expect(has(ev, 'stopmiss', 0) && t2.state !== 'frozen', `walked out: not frozen (${t2.state}, ${kinds(ev)})`);
  }
  { // hits on the frozen do damage but nobody moves till the thaw; then they fly, and fall if one knocked down
    const F = mk(['duke', 'tux']); place(F, 60); const tux = F.f[1];
    run(F, S(0.75), tap('heavy'));
    const x0 = tux.x, hp = tux.hp;
    let ev = run(F, S(1.1), k => k >= 16 && k < 18 ? { light: true } : {});
    expect(has(ev, 'hit', 0, { move: 'move1' }) && tux.hp < hp && Math.abs(tux.x - x0) < 0.01 && tux.state === 'frozen', `hit frozen: hurt, not moved (${tux.state}, ${(tux.x - x0).toFixed(2)})`);
    ev = run(F, S(0.6));
    expect(has(ev, 'thaw', 1) && has(ev, 'down', 1) && Math.abs(tux.x - x0) > 5, `the thaw: off they go, down (${kinds(ev)})`);
  }
  // ---- Duke: Coffee Geyser
  { // the mark on them, the pot, the eruption under them, a puddle after
    const F = mk(['duke', 'tux']); place(F, 120); const tux = F.f[1];
    run(F, 1, { special: true });
    const g = F.objs.find(o => o.kind === 'geyser');
    expect(g && Math.hypot(g.x - tux.x, g.y - tux.y) < 1, 'the mark on them');
    const ev = run(F, S(1.8));
    expect(has(ev, 'throw', 0) && has(ev, 'erupt', 0) && has(ev, 'hit', 0, { move: 'move3' }) && has(ev, 'down', 1), `it erupts under them (${kinds(ev)})`);
    expect(F.objs.some(o => o.kind === 'puddle'), 'a puddle after');
  }
  { // aimed the held way: lands there; walking off the mark, it misses
    const F = mk(['duke', 'tux']); place(F, 120); const duke = F.f[0];
    run(F, 30, { special: true, x: 0, y: -1 });
    const g = F.objs.find(o => o.kind === 'geyser');
    expect(g && g.y < duke.y - 45, `the mark the held way (${g && g.y.toFixed(0)})`);
    const G = mk(['duke', 'tux']); place(G, 120); const t2 = G.f[1], h2 = t2.hp;
    const ev = run(G, S(2), tap('special'), k => k > 20 && k < 60 ? { x: 0, y: 1 } : {});
    expect(has(ev, 'erupt', 0) && t2.hp === h2 && !has(ev, 'hit', 0), `walked off: missed (${kinds(ev)})`);
  }
  // ---- the evades
  { // Tux's Ice Block left alone: untouchable and rooted, then the crack, open; a cooldown after
    const F = mk(['tux', 'duke']); place(F, 80); const [tux] = F.f, E = tux.stats.moves.evade;
    const x0 = tux.x;
    let ev = run(F, 2, { guard: true, x: 1 });
    expect(tux.move === 'evade' && tux.ph === 'iceblock' && tux.pose === 'iceblock' && tux.inv > 0 && has(ev, 'iceblock', 0), `into the ice (${tux.ph}, ${tux.pose})`);
    ev = run(F, S(E.active) - 4, { x: 1 });
    expect(Math.abs(tux.x - x0) < 0.5, `rooted (${(tux.x - x0).toFixed(1)})`);
    ev = []; for (let k = 0; k < 30 && tux.ph !== 'crack'; k++) ev.push(...run(F, 1));
    expect(has(ev, 'crack', 0) && tux.ph === 'crack' && tux.pose === 'crack' && tux.inv <= 0, `then the crack, open (${tux.ph})`);
    run(F, S(E.recovery) + 2); run(F, 1, { guard: true }); run(F, 1);
    expect(tux.move !== 'evade' && tux.cd[3] > 0, `on cooldown after (${tux.cd[3].toFixed(2)})`);
    run(F, S(E.cooldown) + 2); run(F, 1, { guard: true });
    expect(tux.move === 'evade', 'and back');
  }
  { // hit, the ice shatters back: Duke's smash clinks off and the shards stagger him (0.75 s), Tux is out at once (no
    // crack), long enough for his toboggan to land
    const F = mk(['tux', 'duke']); place(F, 80); const [tux, duke] = F.f, E = tux.stats.moves.evade, hp = tux.hp;
    run(F, S(0.65), {}, tap('light'));
    let ev = run(F, S(0.45), k => ({ guard: k < 2 }));
    expect(has(ev, 'clink', 1, { to: 0 }) && has(ev, 'shatter', 0, { stag: true }) && tux.hp === hp, `the smash clinks off and shatters it (${kinds(ev)})`);
    expect(duke.state === 'stagger' && !duke.move && !has(ev, 'stumble', 1), `the shards stagger Duke (${duke.state})`);
    expect(tux.ph === 'shatter' || !tux.move, `Tux is out at once, no crack (${tux.ph})`);
    const st = duke.dur;
    expect(Math.abs(st - E.stagger) < 1e-9, `for ${E.stagger} s (${st})`);
    ev = run(F, S(1), k => ({ light: k < 2 }));
    expect(has(ev, 'hit', 0, { move: 'move1' }) && has(ev, 'down', 1), `the toboggan lands on the staggered Duke (${kinds(ev)})`);
  }
  { // a geyser erupting on the ice from afar shatters it but doesn't stagger Duke (out of the shatter's range); it's spent
    const F = mk(['duke', 'tux']); place(F, 150); const [duke, tux] = F.f, hp = tux.hp;
    const pot = F.f[0].stats.moves.move3, T = pot.startup + pot.active + pot.flight + pot.brew;
    const ev = run(F, S(T + 0.5), tap('special'), k => ({ guard: k >= S(T - 0.3) && k < S(T - 0.3) + 2 }));
    expect(has(ev, 'clink', 0, { to: 1 }) && has(ev, 'shatter', 1, { stag: false }) && duke.state !== 'stagger' && tux.hp === hp, `shattered, nobody staggered (${kinds(ev)}, ${duke.state})`);
  }
  { // the crack: a hit lands
    const F = mk(['tux', 'tux']); place(F, 130); const t2 = F.f[1], hp = t2.hp;
    const E = t2.stats.moves.evade, M = F.f[0].stats.moves.move1;
    const d = E.active - M.startup - 130 / M.speed + 0.05, pa = Math.max(0, Math.round(d * 60)), pb = Math.max(0, Math.round(-d * 60));   // (whichever goes first: the ice ends just before the slide gets there)
    const ev = run(F, 90, k => ({ light: k === pa }), k => ({ guard: k >= pb && k < pb + 2 }));
    expect(has(ev, 'hit', 0, { move: 'move1' }) && t2.hp < hp, `the toboggan into the crack lands (${kinds(ev)})`);
  }
  { // Duke's Garbage Collect: a blink the held way, untouchable for it; two charges, back one by one
    const F = mk(['duke', 'tux']); place(F, 120); const duke = F.f[0], E = duke.stats.moves.evade;
    const y0 = duke.y, x0 = duke.x;
    let ev = run(F, 2, { guard: true, x: 0, y: -1 });
    expect(has(ev, 'blink', 0) && duke.inv > 0 && duke.ev === 1, `blinking, untouchable, a charge spent (${duke.ev})`);
    run(F, S(E.active) + 1);
    expect(Math.abs(duke.y - (y0 - E.dist)) < 1 && Math.abs(duke.x - x0) < 1, `${E.dist} up (${(duke.y - y0).toFixed(0)})`);
    expect(duke.state === 'recover' && duke.inv <= 0, `then a short recovery, open (${duke.state})`);
    run(F, S(E.recovery) + 1);
    run(F, 2, { guard: true }); run(F, S(E.active + E.recovery) + 2);
    expect(duke.ev === 0 && duke.x < x0 - 30, `no direction: away from them (${duke.x.toFixed(0)})`);
    ev = run(F, 2, { guard: true });
    expect(duke.move !== 'evade' && !has(ev, 'blink'), 'no charges left: nothing');
    run(F, S(E.recharge) + 2);
    expect(duke.ev === 1, `a charge back (${duke.ev})`);
    run(F, S(E.recharge) + 2);
    expect(duke.ev === 2, `and the other (${duke.ev})`);
  }
  { // the blink takes him out of a toboggan's way
    const F = mk(['duke', 'tux']); place(F, 140); const duke = F.f[0], hp = duke.hp;
    const ev = run(F, 90, k => k >= 24 && k < 26 ? { guard: true, x: 0, y: -1 } : {}, tap('light'));
    expect(has(ev, 'blink', 0) && duke.hp === hp && !has(ev, 'hit', 1), `blinked out of it (${kinds(ev)})`);
  }
  // ---- Gopher (a plug-in: js/kits/gopher.js): Goroutine Rush
  { // four goroutines spread into lanes, one through them; it nips them (a stagger, no knockdown)
    const F = mk(['gopher', 'tux']); place(F, 140); const [go, tux] = F.f, hp = tux.hp;
    run(F, 3, tap('light'));
    const gs = F.objs.filter(o => o.kind === 'gorun'), M = go.stats.moves.move1;
    expect(gs.length === 4 && gs.every(o => o.ph === 'spread') && go.ph === 'whistle' && go.pose === 'whistle', `four goroutines spreading (${gs.length}, ${go.ph})`);
    run(F, S(M.startup));
    const lat = gs.map(o => Math.abs(Math.sin(o.a) * (tux.x - o.sx) - Math.cos(o.a) * (tux.y - o.sy)));
    expect(Math.min(...lat) < 2 && gs.every(o => o.ph === 'run'), `one lane runs through them (${lat.map(v => v.toFixed(0))})`);
    const ev = run(F, 60);
    expect(has(ev, 'hit', 0, { move: 'move1' }) && tux.hp < hp && !has(ev, 'down', 1), `a nip, no knockdown (${kinds(ev)})`);
  }
  { // stepping into a gap between two lanes: no hit
    for (const dir of [-1, 1]) {
      const F = mk(['gopher', 'tux']); place(F, 140); const tux = F.f[1], hp = tux.hp;
      const ev = run(F, 100, tap('light'), k => k >= 4 && k < 20 ? { x: 0, y: dir } : {});
      expect(tux.hp === hp && !has(ev, 'hit', 0), `stepped into the gap (${dir}): no hit (${kinds(ev)})`);
    }
  }
  // ---- Gopher: Dig & Pop
  { // under (untouchable), the mound tunnels to them, the cracks, the pop floors them
    const F = mk(['gopher', 'tux']); place(F, 150); const [go, tux] = F.f, M = go.stats.moves.move2;
    run(F, S(M.startup) + 4, tap('heavy'));
    expect(go.under && go.inv > 0 && go.ph === 'tunnel', `tunnelling, untouchable (${go.ph})`);
    let ev = []; for (let k = 0; k < 120 && !F.objs.some(o => o.kind === 'gocrack'); k++) ev.push(...run(F, 1));
    const ck = F.objs.find(o => o.kind === 'gocrack');
    expect(ck && Math.hypot(ck.x - tux.x, ck.y - tux.y) < M.R * 0.5 && go.ph === 'rumble', `the cracks under them (${ck && Math.hypot(ck.x - tux.x, ck.y - tux.y).toFixed(0)})`);
    ev = run(F, S(M.crack) + 4);
    expect(has(ev, 'gopop', 0, { hit: true }) && has(ev, 'down', 1) && go.ph === 'uppercut', `the pop floors them (${kinds(ev)})`);
  }
  { // walking off the cracks: missed, dazed and open
    const F = mk(['gopher', 'tux']); place(F, 150); const [go, tux] = F.f, hp = tux.hp;
    run(F, 2, tap('heavy')); for (let k = 0; k < 120 && !F.objs.some(o => o.kind === 'gocrack'); k++) run(F, 1);
    const ev = run(F, 50, { x: 1, y: 0 }, { x: 1, y: 0 });
    expect(has(ev, 'gopop', 0, { hit: false }) && tux.hp === hp && go.ph === 'dazed' && go.pose === 'dazed', `walked off: missed, dazed (${kinds(ev)}, ${go.ph})`);
  }
  // ---- Gopher: defer Slam
  { // the stake goes in front of him and goes off later, flooring them in reach; one at a time
    const F = mk(['gopher', 'tux']); place(F, 50); const [go, tux] = F.f, M = go.stats.moves.move3;
    run(F, S(M.startup) + 3, tap('special'));
    const st = F.objs.find(o => o.kind === 'gostake');
    expect(st && st.ph === 'tick' && st.x > go.x, `the stake in front (${st && st.x.toFixed(0)})`);
    run(F, S(M.recovery) + 2); go.cd[2] = 0; run(F, 2, tap('special'));
    expect(go.move !== 'move3', 'one stake at a time');
    const ev = run(F, S(M.delay - M.recovery) + 4);
    expect(has(ev, 'goboom', 0, { hit: true }) && has(ev, 'down', 1), `it goes off under them (${kinds(ev)})`);
    const G = mk(['gopher', 'tux']); place(G, 50); const t2 = G.f[1], h2 = t2.hp;
    const ev2 = run(G, S(M.startup + M.delay) + 10, tap('special'), k => k > 25 ? { x: 1, y: 0 } : {});
    expect(has(ev2, 'goboom', 0, { hit: false }) && t2.hp === h2, `out of the ring: missed (${kinds(ev2)})`);
  }
  // ---- Gopher: Burrow
  { // underground (untouchable) the held way, then up, open
    const F = mk(['gopher', 'tux']); place(F, 120); const go = F.f[0], E = go.stats.moves.evade, y0 = go.y;
    let ev = run(F, 2, { guard: true, x: 0, y: -1 });
    expect(go.move === 'evade' && go.under && go.inv > 0 && has(ev, 'goburrow', 0), `under (${go.ph})`);
    ev = run(F, S(E.active) + 1);
    expect(has(ev, 'goout', 0) && Math.abs(go.y - (y0 - E.dist)) < 6 && go.state === 'recover' && go.inv <= 0, `up ${E.dist} away, open (${(go.y - y0).toFixed(0)}, ${go.state})`);
  }
  // ---- Ferris (a plug-in: js/kits/ferris.js): Borrow Claw
  { // the line through them; the claw catches, holds (grabbed), flings (down)
    const F = mk(['ferris', 'tux']); place(F, 100); const [fe, tux] = F.f, M = fe.stats.moves.move1, hp = tux.hp;
    run(F, 3, tap('light'));
    const ln = F.objs.find(o => o.kind === 'feclaw');
    expect(ln && ln.ph === 'aim' && fe.pose === 'clawback' && Math.abs(Math.sin(ln.a) * (tux.x - ln.x) - Math.cos(ln.a) * (tux.y - ln.y)) < 2, `the line through them (${ln && ln.ph}, ${fe.pose})`);
    let ev = run(F, S(M.startup) + 6);
    expect(has(ev, 'feCatch', 0, { to: 1 }) && tux.state === 'grabbed', `caught (${kinds(ev)}, ${tux.state})`);
    ev = run(F, S(M.reel + M.hold) + 4);
    expect(has(ev, 'feFling', 0) && has(ev, 'down', 1) && Math.abs((hp - tux.hp) - M.damage) < 1e-6, `flung down (${kinds(ev)}, ${(hp - tux.hp).toFixed(1)})`);
  }
  { // walking out of the line: it clamps shut on nothing, open
    const F = mk(['ferris', 'tux']); place(F, 100); const [fe, tux] = F.f, hp = tux.hp;
    const ev = run(F, 70, tap('light'), { x: 0, y: 1 });
    expect(!has(ev, 'feCatch') && has(ev, 'feClamp', 0) && tux.hp === hp, `walked out: clamped on nothing (${kinds(ev)})`);
  }
  // ---- Ferris: Ownership Lock
  { // the ring forms round them; still inside: locked (no moves, the evade still works)
    const F = mk(['ferris', 'tux']); place(F, 80); const [fe, tux] = F.f, M = fe.stats.moves.move2;
    run(F, 2, tap('heavy'));
    const rg = F.objs.find(o => o.kind === 'felock');
    expect(rg && Math.hypot(rg.x - tux.x, rg.y - tux.y) < 1, 'the ring round them');
    const ev = run(F, S(M.form) + 2);
    expect(has(ev, 'feLocked', 0, { to: 1 }) && tux.lockT > 0, `locked (${kinds(ev)})`);
    run(F, 2, {}, tap('light')); run(F, 1);
    expect(tux.move !== 'move1', `no moves while locked (${tux.move})`);
    run(F, 2, {}, tap('guard'));
    expect(tux.move === 'evade', `the evade still works (${tux.move})`);
    run(F, S(M.lock) + 10); tux.cd = [0, 0, 0, 0]; run(F, 2, {}, tap('light'));
    expect(tux.move === 'move1', 'moves back after');
  }
  { // walking out before it closes: missed
    const F = mk(['ferris', 'tux']); place(F, 80); const tux = F.f[1], M = F.f[0].stats.moves.move2;
    const ev = run(F, S(M.form) + 6, tap('heavy'), k => k > 4 ? { x: 1, y: 0 } : {});
    expect(has(ev, 'feLockMiss', 0) && !(tux.lockT > 0), `walked out (${kinds(ev)})`);
  }
  // ---- Ferris: unsafe { }
  { // the whirl hits again and again and floors them; it costs him; dizzy after
    const F = mk(['ferris', 'tux']); place(F, 60); const [fe, tux] = F.f, M = fe.stats.moves.move3, h0 = fe.hp;
    const ev = run(F, S(M.startup + M.active) + 4, tap('special'));
    expect(ev.filter(e => e.kind === 'hit' && e.who === 0 && e.move === 'move3').length >= 2 && has(ev, 'down', 1), `hits, then down (${kinds(ev)})`);
    expect(Math.abs(h0 - fe.hp - M.self) < 1e-6 && fe.ph === 'dizzy' && fe.pose === 'dizzy', `it cost him ${M.self}, dizzy after (${(h0 - fe.hp).toFixed(1)}, ${fe.ph})`);
  }
  { // blinked out of it as it arrives: nothing
    const F = mk(['ferris', 'duke']); place(F, 120); const duke = F.f[1], hp = duke.hp, M = F.f[0].stats.moves.move3;
    const ev = run(F, S(M.startup + M.active) + 4, tap('special'), k => k >= S(M.startup) + 8 && k < S(M.startup) + 10 ? { guard: true, x: 0, y: 1 } : k > S(M.startup) + 10 ? { x: 0, y: 1 } : {});
    expect(has(ev, 'blink', 1) && !has(ev, 'down', 1), `blinked away (${kinds(ev)}, ${(hp - duke.hp).toFixed(1)})`);
  }
  // ---- Ferris: Shell Tuck
  { // rolls the held way, untouchable, then pops out open
    const F = mk(['ferris', 'tux']); place(F, 120); const fe = F.f[0], E = fe.stats.moves.evade, y0 = fe.y;
    let ev = run(F, 2, { guard: true, x: 0, y: -1 });
    expect(fe.move === 'evade' && fe.inv > 0 && fe.ph === 'tuck' && fe.pose === 'shell' && has(ev, 'feTuck', 0), `tucked (${fe.ph}, ${fe.pose})`);
    ev = run(F, S(E.active) + 1);
    expect(has(ev, 'fePop', 0) && Math.abs(fe.y - (y0 - E.dist)) < 6 && fe.inv <= 0, `rolled ${E.dist} away, open (${(fe.y - y0).toFixed(0)})`);
  }
  // ---- no supers for them, whatever the setting
  {
    const F = mk(['tux', 'duke'], true); place(F, 90);
    run(F, 200, k => ({ light: k % 100 < 2 }));
    expect(F.f.every(f => f.meter === 0), `no meter for Tux and Duke (${F.f.map(f => f.meter)})`);
  }
}

// ---------------------------------------------------------------- 5b. the plug-in fighters' moves (test/kits/<id>.mjs)
for (const [id, T] of Object.entries(KIT_TESTS)) if (T.checks) T.checks({ mk, place, run, has, kinds, tap, S, expect: (cond, msg) => { if (!cond) fail(`${id}: ${msg}`); } });

// ---------------------------------------------------------------- 6. the old roster's rules: gone with the last of it
// (2026-10-24: Cpp and Bugdroid, the last two on the old light/heavy/special/super rules, rebuilt as plug-ins)

// ---------------------------------------------------------------- 7. every move card's clip lands
// the keys: move1, move2, move3, evade (fight-clips.js script(id, k); a missing one falls back to the fighter's
// own clips in fight-chars.js). What landing means: Tux's move1 a hit, move2 a landing that hits, move3 a penguin's hit;
// Duke's move1 a smash that hits, move2 a freeze, move3 an eruption and a hit; the evade: Tux's ice clinks a hit off, Duke's
// blink takes him out of one (a blink, and no hit on him)
{
  const KS = ['move1', 'move2', 'move3', 'evade'];
  const LANDS = {
    tux: { move1: ev => has(ev, 'hit', 0, { move: 'move1' }), move2: ev => has(ev, 'land', 0, { hit: true }), move3: ev => has(ev, 'peng', 0, { how: 'hit' }), evade: ev => ev.some(e => e.kind === 'clink' && e.to === 0) && !ev.some(e => e.kind === 'hit' && e.to === 0) },
    gopher: { move1: ev => has(ev, 'hit', 0, { move: 'move1' }), move2: ev => has(ev, 'gopop', 0, { hit: true }), move3: ev => has(ev, 'goboom', 0, { hit: true }), evade: ev => has(ev, 'goburrow', 0) && !ev.some(e => e.kind === 'hit' && e.to === 0) },
    ferris: { move1: ev => has(ev, 'feFling', 0), move2: ev => has(ev, 'feLocked', 0), move3: ev => has(ev, 'hit', 0, { move: 'move3' }) && ev.some(e => e.kind === 'down' && e.by === 0), evade: ev => has(ev, 'feTuck', 0) && !ev.some(e => e.kind === 'hit' && e.to === 0) },
    duke: { move1: ev => has(ev, 'smash', 0, { hit: true }), move2: ev => has(ev, 'freeze', 0), move3: ev => has(ev, 'erupt', 0) && has(ev, 'hit', 0, { move: 'move3' }), evade: ev => has(ev, 'blink', 0) && !ev.some(e => e.kind === 'hit' && e.to === 0) },
  };
  for (const [id, T] of Object.entries(KIT_TESTS)) if (T.lands) LANDS[id] = T.lands;
  for (const id of new Set([...FIGHT_ORDER, ...Object.keys(KIT_TESTS)])) for (const k of KS) {
    let sc = null; try { sc = script(id, k); } catch { sc = null; }
    if (!sc || !sc.a) sc = FIGHTERS[id].clips && FIGHTERS[id].clips[k];
    if (!sc) { fail(`clip ${id} ${k}: none`); continue; }
    const c = { id, k, sc }; fresh(c);
    const F = c.F, ev = [];
    for (let t = 0; t < sc.len; t += 1 / 60) { F.setInput(0, inputAt(sc.a, t)); F.setInput(1, inputAt(sc.b, t)); F.step(); ev.push(...F.events); F.events.length = 0; }
    const ok = LANDS[id][k](ev);
    if (!ok) fail(`clip ${id} ${k} doesn't land (${ev.map(e => e.kind).join(',')})`);
  }
}

console.log(fails ? `\n${fails} failure(s)` : '\nfight: all checks passed');
process.exit(fails ? 1 : 0);
