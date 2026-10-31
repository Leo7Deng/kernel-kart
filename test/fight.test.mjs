// Fight mode's sim checks (no balance, no win rates):
//   1. determinism: Tux v Duke at every level, the mirrors, every arena, the plug-ins
//   2. every fight ends by KO (health only), nobody ever outside the arena, no round past the clock plus a minute, every
//      number finite. Prints how long rounds run and how often each move is thrown and lands a round (for the feel)
//   3. the controls (the three move keys, the evade on the guard key, the buffer, cooldowns, holding to aim, walking)
//   4. the combat rules (no shield, stamina or flank bonus; counter hits, knockdowns and get-ups)
//   5. every move does what it says (its tell, its answer): Tux's keys in order (his moves: test/kits/tux.mjs);
//      Duke's jab (a quick one-two, out at once after a blink, standing its ground, heating up as it lands: hot, it hits
//      harder and boils over into a knockdown; a whiff cools him off), Stop the World (the arm going up first; the ring
//      freezes only someone inside, breaks if Duke is hit; jabs on the statue land at x frozen, the knockback at the thaw;
//      a long cooldown), Hot Java (the pot up as the tell, stuck from right up close, riding and boiling over into a
//      knockdown; missed from a step off, open and punished; a hit on Duke passes it back and it boils on him; easy on a
//      statue, scalding someone down, a whole freeze string under 40%), and Duke's Garbage Collect (a blink the held way or
//      away, two charges coming back, out of Tux's slide)
//   7. every move card's clip lands (fight-clips.js script(id, k), else the fighter's own clips in fight-chars.js)
// The plug-in fighters (js/kits/<id>.js): bot fights against Tux, Duke and themselves at every level (they
// end, the same twice, every move thrown and landed), and their own checks from test/kits/<id>.mjs (each exports
// checks(T): every move does what it says, and lands: what each move card's clip must show)
//   node test/fight.test.mjs [fights a level, default 24]
import { ARENA_ORDER, ARENAS, sd } from '../js/fight-arenas.js';
import { Fight, FIXED, FIRST_TO, ROUND_TIMES, RULES, comboScale, matchCfg, winsToTake } from '../js/fight.js';
import { FIGHTERS, FIGHT_ORDER } from '../js/fight-chars.js';
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
      else if (e.kind === 'hit' || e.kind === 'freeze' || e.kind === 'feLocked' || e.kind === 'cpGoo' || e.kind === 'cpStick' || e.kind === 'cpBite' || e.kind === 'dkClang' || e.kind === 'pyEat') u(e.who, e.move).land++;   // (Pyth's apple eaten; Ferris's Lock, Cpp's sludge and flies and Docky's wall (someone knocked into it) land without a hit)
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
  for (const f of r.F.f) if (![f.x, f.y, f.z, f.vx, f.vy, f.hp].every(Number.isFinite)) fail(`${what}: non-finite fighter`);
  for (const rd of r.F.rounds) if (rd.how !== 'ko' && rd.how !== 'double') fail(`${what}: round ${rd.round} ended by ${rd.how}`);
  return true;
};

// ---------------------------------------------------------------- 0. the roster
if (FIGHT_ORDER.slice(0, 2).join() !== 'tux,duke' || FIGHT_ORDER.slice(2).some(id => !PLUGINS.some(p => p.id === id))) fail(`Tux and Duke, then the rebuilt plug-ins, are pickable (${FIGHT_ORDER})`);
for (const p of PLUGINS) if (!KIT_TESTS[p.id] && !['gopher', 'ferris', 'duke'].includes(p.id)) fail(`${p.id}: no test/kits/${p.id}.mjs`);   // (Gopher's, Ferris's and Duke's checks are written out in this file)
for (const id of FIGHT_ORDER) {
  const M = FIGHTERS[id].moves;
  if (M.light1 || M.heavy || M.special || M.super) fail(`${id}: three moves, no jab, heavy, special or super`);
  for (const k of ['move1', 'move2', 'move3', 'evade']) if (!M[k] || !M[k].do || !M[k].tell || !M[k].answer) fail(`${id} ${k}: a kit, a tell and an answer`);
}

// ---------------------------------------------------------------- 1. determinism
for (const seed of [1, 7, 42]) for (const lv of [0, 1, 2]) same({ bots: [lv, 2 - lv], seed }, `seed ${seed} level ${lv}`);
ARENA_ORDER.forEach((arena, k) => {
  same({ ids: ['duke', 'tux'], bots: [1, 2], seed: 11 + k, arena }, `Duke v Tux in ${arena}`);
  same({ ids: ['tux', 'tux'], bots: [0, 1], seed: 21 + k, arena }, `Tux v Tux in ${arena}`);
  same({ ids: ['duke', 'duke'], bots: [2, 2], seed: 31 + k, arena }, `Duke v Duke in ${arena}`);
  same({ ids: ['gopher', 'ferris'], bots: [k % 3, 2 - k % 3], seed: 41 + k, arena }, `Gopher v Ferris in ${arena}`);   // (the plug-ins: js/kits/)
  same({ ids: ['ferris', 'tux'], bots: [1, 1], seed: 51 + k, arena }, `Ferris v Tux in ${arena}`);
  same({ ids: ['duke', 'gopher'], bots: [2, 0], seed: 61 + k, arena }, `Duke v Gopher in ${arena}`);
});

// ---------------------------------------------------------------- 2. every fight ends; how rounds run (no win rates)
const N = +process.argv[2] || 24;
{
  const len = [], use = {};
  for (const lv of [0, 1, 2]) for (let s = 1; s <= N; s++) {
    const R = FIGHT_ORDER, ids = [R[s % R.length], R[(s + Math.floor(s / R.length)) % R.length]];   // (every pairing and mirror over the seeds)
    const r = runFight({ ids, bots: [lv, lv], seed: s * 7919 + lv, arena: ARENA_ORDER[s % ARENA_ORDER.length] });
    if (!checkRun(r, `level ${lv} seed ${s} (${ids.join(' v ')})`)) continue;
    for (const rd of r.F.rounds) len.push(rd.time);
    for (const [k, v] of Object.entries(r.use)) { const w = use[k] || (use[k] = { go: 0, land: 0, blocked: 0, rounds: 0 }); w.go += v.go; w.land += v.land; w.blocked += v.blocked; }
    for (const id of new Set(ids)) for (const k of Object.keys(use)) if (k.startsWith(id + ' ')) use[k].rounds += r.F.rounds.length * ids.filter(x => x === id).length;
  }
  len.sort((a, b) => a - b);
  const q = p => len[Math.min(len.length - 1, Math.floor(len.length * p))].toFixed(0);
  console.log(`${N * 3} bot fights (every level, every arena, mirrors): rounds median ${q(0.5)} s, middle 80% ${q(0.1)}-${q(0.9)} s`);
  console.log('a fighter\'s round: ' + Object.entries(use).sort().map(([k, v]) => `${k} ${(v.go / v.rounds).toFixed(1)} thrown, ${(v.land / v.rounds).toFixed(1)} land`).join(' | '));
  if (+q(0.5) < 15 || +q(0.5) > 60) fail(`rounds should run roughly 20-60 s (median ${q(0.5)} s)`);
  for (const [k, v] of Object.entries(use)) if (!(v.go > 0) || !(v.land > 0)) fail(`the bots throw and land ${k} (${v.go} thrown, ${v.land} landed)`);
}

// ---------------------------------------------------------------- 2a. the match's length: first to 1, 2, 3 or 5 rounds won,
// a round 40, 60 or 90 s (the menus' and the online room's setting, fight.js matchCfg)
{
  if (JSON.stringify(matchCfg(1, 40)) !== '{"bestOf":1,"roundTime":40}' || JSON.stringify(matchCfg(5, 90)) !== '{"bestOf":9,"roundTime":90}') fail('matchCfg: first to n is best of 2n - 1');
  if (JSON.stringify(matchCfg(7, 33)) !== JSON.stringify(matchCfg())) fail('matchCfg: anything not offered falls back to first to 2, 60 s');
  if (winsToTake({}) !== 2) fail('a fight with no setting is first to 2 (best of 3), as before');
  for (const n of FIRST_TO) {
    const t = ROUND_TIMES[n % ROUND_TIMES.length], r = runFight({ ids: ['tux', 'duke'], bots: [1, 1], seed: 40 + n, ...matchCfg(n, t) });
    if (!checkRun(r, `first to ${n}, ${t} s rounds`)) continue;
    const F = r.F, w = F.winner;
    if (F.wins[w] !== n || F.wins[1 - w] >= n || winsToTake(F.cfg) !== n) fail(`first to ${n}: ended ${F.wins.join(':')}`);
    if (F.rounds.some(rd => rd.time > t + 60)) fail(`first to ${n}: a round outran its ${t} s clock by a minute`);
  }
  const A = runFight({ ids: ['gopher', 'pyth'], bots: [2, 0], seed: 5, ...matchCfg(3, 40) }), B = runFight({ ids: ['gopher', 'pyth'], bots: [2, 0], seed: 5, ...matchCfg(3, 40) });
  if (A.n !== B.n || A.F.winner !== B.F.winner || hashState(A.F) !== hashState(B.F)) fail('determinism: first to 3, 40 s rounds');
}

// ---------------------------------------------------------------- 2b. the plug-in fighters' bot fights
for (const p of PLUGINS) {
  const use = {};
  [['tux', 0], ['duke', 1], [p.id, 2]].forEach(([foe, j]) => {
    for (const lv of [0, 1, 2]) for (let s = 1; s <= Math.max(2, Math.round(N / 8)); s++) {
      const ids = (s + lv) % 2 ? [p.id, foe] : [foe, p.id], cfg = { ids, bots: [lv, 2 - lv], seed: 977 * s + 31 * j + lv, arena: ARENA_ORDER[(s + j + lv) % ARENA_ORDER.length] };
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
const mk = (ids = ['tux', 'duke'], arena) => { const F = new Fight({ ids, bots: [null, null], seed: 3, roundTime: 99, arena }); F.phase = 'fight'; F.pt = 0; return F; };
const place = (F, gap, o = {}) => {
  const [a, b] = F.f, d = a.r + b.r + gap;
  Object.assign(a, { x: -d / 2, y: 0, vx: 0, vy: 0, face: 0, state: 'idle', move: null, t: 0, hold: -1, bufK: '', cd: [0, 0, 0, 0] }, o.a);
  Object.assign(b, { x: d / 2, y: 0, vx: 0, vy: 0, face: Math.PI, state: 'idle', move: null, t: 0, hold: -1, bufK: '', cd: [0, 0, 0, 0] }, o.b);
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
  { // the intro, then light / heavy / special fire move1 / move2 / move3 (their tells)
    const F = new Fight({ bots: [null, null], seed: 5 });
    run(F, Math.ceil(1.7 / FIXED));
    expect(F.phase === 'fight', `phase after intro is ${F.phase}`);
    for (const [key, mvk] of [['light', 'move1'], ['heavy', 'move2'], ['special', 'move3']]) {
      const G = mk(); place(G, 120); const me = G.f[0];
      const ev = run(G, 1, { [key]: true });
      expect(me.state === 'wind' && me.move === mvk && has(ev, 'tell', 0, { move: mvk }), `${key} -> ${me.state}/${me.move}`);
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
    run(F, 1, { heavy: true }); let n = 0; while (me.state !== 'recover' && n++ < 120) run(F, 1);
    const left = Math.round((me.dur - me.t) / FIXED);
    run(F, Math.max(0, left - 6)); run(F, 1, { light: true });
    let fired = -1; for (let k = 0; k < 12 && fired < 0; k++) { run(F, 1); if (me.move === 'move1') fired = k; }
    expect(fired >= 0 && fired <= 6, `a press 6 frames before the recovery's end fires as it ends (${fired})`);
    const G = mk(['duke', 'tux']); place(G, 200); const g = G.f[0];
    run(G, 1, { heavy: true }); run(G, 2); run(G, 1, { light: true }); run(G, 60);
    expect(g.move !== 'move1' && g.bufK === '', `a press long before is forgotten (${g.move}, ${g.bufK})`);
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
  { // aiming: a move starts the way the press aimed it (the held way within 60° of the foe); Tux's slide then steers
    const F = mk(); place(F, 100); const me = F.f[0];
    run(F, 1, { heavy: true, x: Math.cos(0.4), y: Math.sin(0.4) });
    expect(Math.abs(me.face - 0.4) < 0.01, `the slide goes the way the press aimed it (${me.face.toFixed(2)})`);
  }
}

// ---------------------------------------------------------------- 4. the combat rules with the three moves
{
  const expect = (cond, msg) => { if (!cond) fail('combat: ' + msg); };
  { // no shield: Tux's slide into someone holding guard (their evade spent) lands in full; no flank bonus from behind
    const F = mk(['tux', 'duke']); place(F, 90, { b: { face: 0, ev: 0, evT: 9 } }); const duke = F.f[1], hp = duke.hp, M = F.f[0].stats.moves.move2;
    const ev = run(F, 50, tap('heavy'), { guard: true });
    expect(!has(ev, 'block') && !has(ev, 'flank') && Math.abs((hp - duke.hp) - M.damage) < 1e-6 && has(ev, 'down', 1), `in full, from behind, no bonus (${(hp - duke.hp).toFixed(2)} of ${M.damage}, ${kinds(ev)})`);
  }
  { // a counter hit: Tux's slide into Duke's snap (Stop the World's wind-up) does x1.4 and breaks his ring
    // (Duke snaps a few frames after the slide starts: snapped at once, his ripple would freeze Tux on the way in)
    const F = mk(['tux', 'duke']); place(F, 70); const duke = F.f[1], hp = duke.hp;
    const ev = run(F, 50, tap('heavy'), k => ({ special: k >= 6 && k < 8 }));
    expect(has(ev, 'counter', 0), `a counter hit (${kinds(ev)})`);
    expect(Math.abs((hp - duke.hp) - F.f[0].stats.moves.move2.damage * RULES.counter) < 1e-6, `x${RULES.counter} (${(hp - duke.hp).toFixed(2)})`);
    expect(has(ev, 'ringbreak', 1), `his ring breaks (${kinds(ev)})`);
  }
  { // a knockdown: short, then getting up quickly (untouchable); hittable on the floor, lighter
    const F = mk(['tux', 'duke']); place(F, 90); const duke = F.f[1];
    const ev = run(F, 50, tap('heavy'));
    expect(has(ev, 'down', 1) && duke.state === 'down', `the slide knocks down (${duke.state})`);
    expect(RULES.downT <= 0.45 && RULES.getupT <= 0.2 && RULES.downT + RULES.getupT < 0.7, `knockdowns are short: down ${RULES.downT} s, up ${RULES.getupT} s`);
    const P = F.f[0].stats.moves.move1, hp = duke.hp;
    place(F, 6, { b: { state: 'down', t: 0, dur: RULES.downT, hp, gh: 0 } }); F.f[1].down = true;
    const ev1 = run(F, S(P.startup + P.active) + 4, tap('light'));
    const gh = ev1.find(e => e.kind === 'hit' && e.who === 0 && e.ground);
    expect(gh && Math.abs((hp - duke.hp) - P.damage * RULES.groundDmg) < 1e-6 && !has(ev1, 'down', 1) && duke.state === 'down' && Math.abs(duke.dur - RULES.downT) < 1e-9,
      `a ground hit: the fish on someone down does x${RULES.groundDmg} (${(hp - duke.hp).toFixed(2)} of ${P.damage}), never floors again, not down longer (${duke.state} ${duke.dur.toFixed(2)}, ${kinds(ev1)})`);
    const ev2 = run(F, S(RULES.downT + RULES.getupT) + 2);
    expect(has(ev2, 'getup', 1) && duke.state === 'idle' && duke.safeT > 0, `they get up, safe a moment (${kinds(ev2)}, ${duke.state})`);
  }
  { // the ground-hit cap: RULES.groundN a knockdown, then hits go through; a knockdown's knockdown, a grab's toss: nothing
    const F = mk(['tux', 'duke']); place(F, 6); const [tux, duke] = F.f, P = tux.stats.moves.move1;
    F.knockDown(duke, 0, 100, 0); const hp = duke.hp, t0 = duke.t, d0 = duke.dur;
    const res = [];
    for (let k = 0; k < RULES.groundN + 1; k++) res.push(F.hitF(tux, duke, { ...P, kd: true, stale: false }, { move: 'move1', kd: true }));
    expect(res.slice(0, RULES.groundN).every(r => r) && !res[RULES.groundN] && Math.abs((hp - duke.hp) - RULES.groundN * P.damage * RULES.groundDmg) < 1e-6,
      `ground hits: ${RULES.groundN} land at x${RULES.groundDmg}, the next goes through (${res}, ${(hp - duke.hp).toFixed(2)})`);
    expect(duke.state === 'down' && duke.t === t0 && duke.dur === d0 && duke.gh === RULES.groundN, `ground hits: a knockdown move on the floor doesn't floor them again or keep them down (${duke.state}, ${duke.dur})`);
    F.knockDown(duke, 0, 100, 0);
    expect(duke.dur === d0 && duke.gh === RULES.groundN, `knocked down while down: nothing new (${duke.dur}, ${duke.gh})`);
    const G = mk(['tux', 'duke']); place(G, 6); const g = G.f[1]; G.knockDown(g, 0, 0, 0); const h2 = g.hp;
    expect(!G.hitF(G.f[0], g, P, { move: 'move1', hold: true }) && g.hp === h2, 'ground hits: a grab or a throw never takes someone down');
    // and the bots: Ruthless ones hit a foe on the floor in reach far more often than Chill ones
    // (a bot with its moves ready next to a foe floored and lying still: does it land one before they're up)
    const grounds = (lv, ids) => { let n = 0; for (let s = 1; s <= 20; s++) {
      const B = new Fight({ ids, bots: [lv, null], seed: s, roundTime: 99 }); B.phase = 'fight';
      for (let k = 0; k < 90; k++) B.step();
      place(B, 10 + (s % 3) * 30); B.f[0].cd = [0, 0, 0, 0]; B.knockDown(B.f[1], 0, 0, 0); B.events.length = 0;
      for (let k = 0; k < S(RULES.downT); k++) { B.setInput(1, I); B.step(); if (B.events.some(e => e.kind === 'hit' && e.ground)) { n++; break; } B.events.length = 0; }
    } return n / 20; };
    for (const ids of [['duke', 'tux'], ['tux', 'duke'], ['pyth', 'tux']]) {
      const g0 = grounds(0, ids), g2 = grounds(2, ids);
      console.log(`${ids[0]}'s bots hit a foe on the floor: Chill ${(g0 * 100).toFixed(0)}%, Ruthless ${(g2 * 100).toFixed(0)}%`);
      expect(g2 > g0 + 0.15 && g2 >= 0.3 && g0 <= 0.4, `${ids[0]}'s bots hit a foe on the floor by level (Chill ${(g0 * 100).toFixed(0)}%, Ruthless ${(g2 * 100).toFixed(0)}%)`);
    }
  }
  { // a quick rise: down a moment, the evade key with a way held rolls them up that way, untouchable, spending nothing
    const F = mk(['tux', 'duke']); place(F, 40); const [tux, duke] = F.f;
    duke.bufK = 'evade'; duke.bufT = RULES.buffer;   // (a press from before the knockdown doesn't count)
    F.knockDown(duke, 0, 0, 0); const x0 = duke.x, ev0 = duke.ev, cd0 = [...duke.cd];
    run(F, S(RULES.riseMin) + 1);
    expect(duke.state === 'down', `quick rise: not off a press from before the knockdown (${duke.state})`);
    const ev = run(F, 3, {}, k => ({ guard: k < 2, x: 1 }));
    expect(has(ev, 'rise', 1) && duke.state === 'getup' && duke.roll && duke.inv > 0, `quick rise: rolling up (${kinds(ev)}, ${duke.state})`);
    expect(duke.ev === ev0 && duke.cd.every((c, k) => c <= cd0[k]), `quick rise: the evade's charges and cooldown untouched (${duke.ev}/${ev0}, ${duke.cd})`);
    const hp = duke.hp;
    expect(!F.hitF(tux, duke, tux.stats.moves.move1, { move: 'move1' }) && duke.hp === hp, 'quick rise: untouchable in the roll');
    run(F, S(RULES.rollT) + 2);
    const moved = duke.x - x0;
    expect(duke.state === 'idle' && duke.safeT > 0 && moved > RULES.rollDist * 0.7 && moved < RULES.rollDist * 1.4, `quick rise: rolled ${moved.toFixed(0)} the held way, up and safe (${duke.state})`);
    // an attack key with nothing held: up the same way, away from the foe
    const G = mk(['tux', 'duke']); place(G, 40); const g = G.f[1]; G.knockDown(g, 0, 0, 0); const gx = g.x;
    run(G, S(RULES.riseMin) + 1); run(G, S(RULES.rollT) + 4, {}, tap('heavy'));
    expect(g.x > gx + RULES.rollDist * 0.6 && g.state === 'idle' && g.cd[1] === 0, `quick rise: an attack key rolls them away from the foe, the move not thrown (${(g.x - gx).toFixed(0)}, ${g.state}, ${g.cd})`);
  }
  expect(comboScale(1) === 1 && comboScale(3) < comboScale(2) && comboScale(99) === RULES.comboMin, 'hitstun shrinks with the combo');
}

// ---------------------------------------------------------------- 5. every move does what it says
{
  const expect = (cond, msg) => { if (!cond) fail('moves: ' + msg); };
  { // the keys: the first his basic move, the quickest back; the third the special, the slowest
    const M = FIGHTERS.tux.moves;
    expect(M.move1.cooldown < M.move2.cooldown && M.move2.cooldown <= M.move3.cooldown, `Tux's cooldowns by key: ${M.move1.cooldown} < ${M.move2.cooldown} <= ${M.move3.cooldown}`);
  }
  { // safe get-ups: just up off a knockdown, a knockdown or a wall slam only staggers them for RULES.safeT;
    // after it (or once they throw a move of their own) they go down again
    const F = mk(['tux', 'duke']); place(F, 60); const d = F.f[1];
    F.knockDown(d, 0, 200, 0);
    run(F, S(RULES.downT + RULES.getupT) + 2);
    expect(d.state === 'idle' && d.safeT > 0, `safe get-up: up, and safe a moment (${d.state}, ${d.safeT.toFixed(2)})`);
    F.knockDown(d, 0, 200, 0);
    expect(d.state === 'hurt', `safe get-up: knocked down again at once, only staggered (${d.state})`);
    run(F, S(RULES.safeT) + 2);
    F.knockDown(d, 0, 200, 0);
    expect(d.state === 'down', `safe get-up: after it, down again (${d.state})`);
    const G = mk(['pyth', 'duke']); place(G, 10); const g = G.f[1];
    G.knockDown(g, 0, 0, 0); run(G, S(RULES.downT + RULES.getupT) + 1);
    const ev = run(G, 40, { light: true });
    expect(!G.f.some(f => f.state === 'grabbed') && !has(ev, 'down', 1), `safe get-up: Pyth's coil can't catch them as they get up (${kinds(ev)})`);
  }
  // ---- Duke: HotSpot Jab
  { // right there: a quick one-two, both land, no knockdown; out within its startup; cold, the first is light
    const F = mk(['duke', 'tux']); place(F, 8); const [duke, tux] = F.f, J = duke.stats.moves.move1, H = J.hot, hp = tux.hp;
    let first = -1; const ev = [];
    for (let k = 0; k < 40; k++) { const e = run(F, 1, { light: k < 2 }); ev.push(...e); if (first < 0 && has(e, 'hit', 0, { move: 'move1' })) first = k; }
    expect(first >= 0 && first <= S(J.startup) + 2, `the first jab lands at once (${first} frames)`);
    expect(ev.filter(e => e.kind === 'hit' && e.who === 0 && e.move === 'move1').length === 2 && !has(ev, 'down', 1), `a one-two, no knockdown (${kinds(ev)})`);
    const one = J.hit.damage + J.last.damage * (1 + H.step);
    expect(Math.abs((hp - tux.hp) - one) < 1e-6 && duke.hot === 2, `cold: ${J.hit.damage} + ${J.last.damage} x${1 + H.step} (${(hp - tux.hp).toFixed(2)}), heat 2 (${duke.hot})`);
    const G = mk(['duke', 'tux']); place(G, 60, { a: { hot: 2, hotT: 0 } }); const t2 = G.f[1], h2 = t2.hp;
    const ev2 = run(G, 24, tap('light'));
    expect(t2.hp === h2 && !has(ev2, 'hit', 0) && G.f[0].ph === 'jabmiss' && G.f[0].hot === 0 && has(ev2, 'cool', 0), `from further off it whiffs, open, and cools him off (${G.f[0].ph}, ${G.f[0].hot})`);
    const K = mk(['duke', 'tux']); place(K, J.reach - 4); const d3 = K.f[0], x0 = d3.x;
    const ev3 = run(K, 18, tap('light'));
    expect(has(ev3, 'hit', 0, { move: 'move1' }) && Math.abs(d3.x - x0) < 0.5, `no lunge: it lands from ${J.reach - 4} off where he stands (moved ${(d3.x - x0).toFixed(2)})`);
  }
  { // it heats up: hot, each jab hits harder; at full heat the second jab boils over (knocks down) and cools him right off;
    // left alone the heat holds a moment, then cools
    const F = mk(['duke', 'tux']); place(F, 8, { a: { hot: 2, hotT: 0 } }); const [duke, tux] = F.f, J = duke.stats.moves.move1, H = J.hot, hp = tux.hp;
    const ev = run(F, 40, tap('light'));
    const want = J.hit.damage * (1 + H.step * 2) + J.boil.damage * (1 + H.step * 3);
    expect(has(ev, 'boil', 0) && has(ev, 'down', 1) && Math.abs((hp - tux.hp) - want) < 1e-6 && duke.hot === 0, `hot: ${want.toFixed(2)} and boiled over, down (${(hp - tux.hp).toFixed(2)}, ${kinds(ev)}), cooled (${duke.hot})`);
    const G = mk(['duke', 'tux']); place(G, 200, { a: { hot: 2, hotT: 0 } }); const d2 = G.f[0];
    run(G, S(H.hold) - 2); const held = d2.hot; run(G, S(2 / H.cool) + 4);
    expect(held === 2 && d2.hot === 0, `holds ${H.hold} s, then cools (${held}, then ${d2.hot})`);
  }
  { // the blink then the jab: pressed as he lands, it comes out at once (the blink's recovery cut short) and lands
    const F = mk(['duke', 'tux']); place(F, 117); const duke = F.f[0], E = duke.stats.moves.evade;
    let started = -1; const ev = [];
    for (let k = 0; k < 40; k++) { const e = run(F, 1, { guard: k < 2, x: 1, light: k >= 5 && k < 7 }); ev.push(...e); if (started < 0 && duke.move === 'move1') started = k; }
    expect(has(ev, 'blink', 0) && started >= 0 && started <= S(E.active) + 1, `out of the blink at once (frame ${started}, the blink ${S(E.active)} + its recovery ${S(E.recovery)})`);
    expect(has(ev, 'hit', 0, { move: 'move1' }), `and it lands (${kinds(ev)})`);
  }
  // ---- Duke: Stop the World
  { // the arm goes up first (a tell you can see), then the ring grows; it freezes whoever its edge touches
    const F = mk(['duke', 'tux']); place(F, 60); const [duke, tux] = F.f, St = duke.stats.moves.move3;
    run(F, 2, tap('special'));
    expect(duke.ph === 'raise' && duke.pose === 'snapup' && duke.state === 'wind', `the arm up for the snap (${duke.ph}, ${duke.pose})`);
    let ev = run(F, S(St.startup) + S(0.2));
    const rg = F.objs.find(o => o.kind === 'ring');
    expect(rg && rg.ph === 'grow' && rg.r > 0 && rg.r < rg.R && has(ev, 'snap', 0), `the ring grows (${rg && rg.r.toFixed(0)})`);
    ev = ev.concat(run(F, S(0.4)));
    expect(has(ev, 'freeze', 0, { move: 'move3' }) && tux.state === 'frozen', `inside: frozen (${tux.state})`);
    const G = mk(['duke', 'tux']); place(G, 60); const t2 = G.f[1];
    ev = run(G, S(St.startup + St.grow + 0.1), tap('special'), k => k > 6 ? { x: 1, y: 0 } : {});
    expect(has(ev, 'stopmiss', 0) && t2.state !== 'frozen', `walked out: not frozen (${t2.state}, ${kinds(ev)})`);
    expect(G.f[0].cd[2] > St.cooldown - 1, `a long cooldown after (${G.f[0].cd[2].toFixed(2)})`);
    // caught while it grows: frozen as its edge gets there, before it completes, and he's out of the snap
    const H = mk(['duke', 'tux']); place(H, 40); const t3 = H.f[1];
    let at = -1; for (let k = 0; k < S(St.startup + St.grow) + 4 && at < 0; k++) { const e = run(H, 1, { special: k < 2 }); if (has(e, 'freeze', 0)) at = k; }
    const rg3 = H.objs.find(o => o.kind === 'ring');
    expect(at > 0 && at < S(St.startup + St.grow) - 2 && t3.state === 'frozen' && rg3 && rg3.r < rg3.R && H.f[0].state !== 'wind', `frozen as it touches him (frame ${at} of ${S(St.startup + St.grow)}, r ${rg3 && rg3.r.toFixed(0)}, Duke ${H.f[0].state})`);
  }
  { // the payoff: jabs on the statue land and heat up, their knockback saved for the thaw (a boil-over: down then), and
    // count a bit less (no one-combo kills: a whole freeze string stays well under half a health bar)
    const F = mk(['duke', 'tux']); place(F, 10); const [duke, tux] = F.f, J = duke.stats.moves.move1, H = J.hot;
    run(F, S(0.75), tap('special'));
    expect(tux.state === 'frozen', `frozen (${tux.state})`);
    for (let k = 0; k < 30 && duke.move; k++) run(F, 1);   // (the snap's settle over)
    const hp = tux.hp, x0 = tux.x;
    let ev = run(F, S(0.4), tap('light'));
    expect(has(ev, 'hit', 0, { move: 'move1' }) && tux.state === 'frozen' && Math.abs(tux.x - x0) < 0.5, `the jabs land, it stays a statue (${tux.state}, moved ${(tux.x - x0).toFixed(1)})`);
    expect(Math.abs((hp - tux.hp) - (J.hit.damage + J.last.damage * (1 + H.step)) * H.frozen) < 1e-6, `x${H.frozen} on a statue (${(hp - tux.hp).toFixed(2)})`);
    for (let k = 0; k < 6; k++) ev = ev.concat(run(F, S(0.12), tap('light')));
    ev = ev.concat(run(F, S(1)));
    expect(has(ev, 'thaw', 1) && Math.abs(tux.x - x0) > 3, `then the thaw: off it all goes (${(tux.x - x0).toFixed(1)})`);
    expect(hp - tux.hp < tux.maxHp * 0.3, `the whole string: ${(hp - tux.hp).toFixed(1)} of ${tux.maxHp}`);
  }
  // ---- Duke: Hot Java
  { // slapped on from right up close it sticks (a tap), rides on them brewing, and boils over a moment later: big, down
    const F = mk(['duke', 'tux']); place(F, 4); const [duke, tux] = F.f, P = duke.stats.moves.move2, hp = tux.hp;
    let ev = run(F, 2, tap('heavy'));
    expect(duke.ph === 'potup' && duke.pose === 'potup' && duke.state === 'wind', `the pot up first: the tell (${duke.ph}, ${duke.pose})`);
    ev = ev.concat(run(F, S(P.startup + P.active) + 2));
    const pot = F.objs.find(o => o.kind === 'pot');
    expect(has(ev, 'potstick', 0, { to: 1 }) && pot && pot.on === 1 && Math.abs((hp - tux.hp) - P.hit.damage) < 1e-6, `it sticks on him, a tap (${kinds(ev)}, ${(hp - tux.hp).toFixed(2)})`);
    run(F, 30, { x: -1 }, { x: 1 });   // (walking apart: it rides on him)
    expect(pot.on === 1 && Math.hypot(pot.x - tux.x, pot.y - tux.y) < 1e-6, `it rides on him (${pot.x.toFixed(0)} v ${tux.x.toFixed(0)})`);
    const h1 = tux.hp; ev = run(F, S(P.fuse));
    expect(has(ev, 'erupt', 0, { to: 1 }) && Math.abs((h1 - tux.hp) - P.boil.damage) < 1e-6 && has(ev, 'down', 1), `then it boils over: ${P.boil.damage}, down (${(h1 - tux.hp).toFixed(2)}, ${kinds(ev)})`);
    expect(duke.cd[1] > P.cooldown - P.fuse - 1, `a cooldown in key 2's range (${duke.cd[1].toFixed(2)})`);
  }
  { // hard to land: from a step further off it misses, and he's open a moment, punished
    const F = mk(['duke', 'tux']); place(F, 48); const duke = F.f[0], P = duke.stats.moves.move2, hp = duke.hp;
    let ev = run(F, S(P.startup + P.active) + 2, tap('heavy'));
    expect(has(ev, 'potmiss', 0) && !F.objs.some(o => o.kind === 'pot') && duke.ph === 'potmiss' && Math.abs(duke.dur - P.miss) < 1e-9, `missed: no pot, open ${P.miss} s (${duke.ph}, ${kinds(ev)})`);
    ev = run(F, 40, {}, tap('heavy'));
    expect(has(ev, 'hit', 1, { move: 'move2' }) && duke.hp < hp, `punished (${kinds(ev)})`);
  }
  { // the hot potato: a hit on Duke before it boils and it hops back onto him, boiling on him on its own timer
    const F = mk(['duke', 'tux']); place(F, 4); const [duke, tux] = F.f, P = duke.stats.moves.move2;
    let ev = run(F, S(P.startup + P.active) + 2, tap('heavy'));
    const pot = F.objs.find(o => o.kind === 'pot'), left = pot ? pot.fuse : 0;
    run(F, 16); ev = run(F, 30, {}, tap('light'));   // (over the slap's flinch: Tux's fish)
    expect(has(ev, 'hit', 1, { move: 'move1' }) && has(ev, 'pothop', 0, { from: 1, to: 0 }) && pot.on === 0, `Tux's fish passes it back (${kinds(ev)}, on ${pot && pot.on})`);
    const hp = duke.hp, th = tux.hp; let t = 46 / 60; ev = [];
    for (let k = 0; k < 200 && !has(ev, 'erupt'); k++) { ev.push(...run(F, 1)); t += 1 / 60; }
    expect(has(ev, 'erupt', 0, { to: 0, back: 1 }) && Math.abs(t - left) < 0.2 && duke.hp < hp - P.boil.damage * 0.3 && tux.hp === th, `it boils on Duke on its own timer (${t.toFixed(2)} of ${left.toFixed(2)} s, ${(hp - duke.hp).toFixed(1)})`);
    expect(ev.some(e => e.kind === 'hit' && e.who === 1 && e.to === 0 && e.move === 'pot'), `the hit counts as Tux's (${kinds(ev)})`);
  }
  { // a statue can't pass it back: Duke hit while the pot rides on a frozen foe (here by a cube's pellet), no hop
    const F = mk(['duke', 'tux']); place(F, 4); const [duke, tux] = F.f, P = duke.stats.moves.move2;
    run(F, S(P.startup + P.active) + 2, tap('heavy'));
    const pot = F.objs.find(o => o.kind === 'pot');
    F.go(tux, 'frozen', 1); tux.frozenT = 1; duke.hurtN++;
    const ev = run(F, 3);
    expect(pot && pot.on === 1 && !has(ev, 'pothop'), `no hop off a statue (on ${pot && pot.on}, ${kinds(ev)})`);
  }
  { // once it whistles it's theirs: a hit on Duke then doesn't pass it back
    const F = mk(['duke', 'tux']); place(F, 4); const [duke, tux] = F.f, P = duke.stats.moves.move2;
    run(F, S(P.startup + P.active) + 2, tap('heavy'));
    const pot = F.objs.find(o => o.kind === 'pot');
    run(F, S(P.fuse - P.whistle) + 2, {}, {}); duke.hurtN++;
    const ev = run(F, 2);
    expect(pot && pot.on === 1 && !has(ev, 'pothop'), `no hop once it whistles (on ${pot && pot.on}, fuse ${pot && pot.fuse.toFixed(2)}, ${kinds(ev)})`);
  }
  { // easy on a statue (Stop the World): it sticks; a freeze string that floors them, and it still boils over at full
    // damage where they lie (freeze -> pot is his big combo; no second knockdown), the whole thing under 55% of a bar
    const F = mk(['duke', 'tux']); place(F, 4); const [duke, tux] = F.f, P = duke.stats.moves.move2, hp = tux.hp;
    run(F, S(0.75), tap('special'));
    expect(tux.state === 'frozen', `frozen (${tux.state})`);
    let ev = [];
    for (let k = 0; k < 60 && !has(ev, 'potstick'); k++) ev.push(...run(F, 1, { heavy: k % 2 === 0 }));
    expect(has(ev, 'potstick', 0) && tux.state === 'frozen', `stuck on the statue (${kinds(ev)})`);
    for (let k = 0; k < 160 && !has(ev, 'erupt'); k++) ev.push(...run(F, 1, { light: k % 2 === 0, x: Math.hypot(tux.x - duke.x, tux.y - duke.y) - tux.r - duke.r > 6 ? 1 : 0 }));
    const er = ev.find(e => e.kind === 'erupt'), sc = ev.filter(e => e.kind === 'hit' && e.move === 'move2' && e.dmg > P.hit.damage + 1);
    expect(er && has(ev, 'boil', 0) && sc.length === 1 && Math.abs(sc[0].dmg - P.boil.damage) < 1e-6 && ev.filter(e => e.kind === 'down' && e.who === 1).length === 1, `floored by the string, boiled over in full where he lies (${sc.map(e => e.dmg.toFixed(1))}, ${kinds(ev)})`);
    expect(hp - tux.hp < tux.maxHp * 0.55, `the whole thing: ${(hp - tux.hp).toFixed(1)} of ${tux.maxHp}`);
  }
  // ---- the evades
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
  { // the blink takes him out of Tux's slide's way
    const F = mk(['duke', 'tux']); place(F, 140); const duke = F.f[0], hp = duke.hp;
    const ev = run(F, 90, k => k >= 24 && k < 26 ? { guard: true, x: 0, y: -1 } : {}, tap('heavy'));
    expect(has(ev, 'blink', 0) && duke.hp === hp && !has(ev, 'hit', 1), `blinked out of it (${kinds(ev)})`);
  }
  // ---- Gopher (a plug-in: js/kits/gopher.js): Goroutine Rush
  { // four goroutines spread into lanes, one through them; it nips them (a stagger, no knockdown)
    const F = mk(['gopher', 'tux']); place(F, 140); const [go, tux] = F.f, hp = tux.hp;
    run(F, 3, tap('heavy'));
    const gs = F.objs.filter(o => o.kind === 'gorun'), M = go.stats.moves.move2;
    expect(gs.length === 4 && gs.every(o => o.ph === 'spread') && go.ph === 'whistle' && go.pose === 'whistle', `four goroutines spreading (${gs.length}, ${go.ph})`);
    run(F, S(M.startup));
    const lat = gs.map(o => Math.abs(Math.sin(o.a) * (tux.x - o.sx) - Math.cos(o.a) * (tux.y - o.sy)));
    expect(Math.min(...lat) < 2 && gs.every(o => o.ph === 'run'), `one lane runs through them (${lat.map(v => v.toFixed(0))})`);
    const ev = run(F, 60);
    expect(has(ev, 'hit', 0, { move: 'move2' }) && tux.hp < hp && !has(ev, 'down', 1), `a nip, no knockdown (${kinds(ev)})`);
  }
  { // stepping into a gap between two lanes: no hit
    for (const dir of [-1, 1]) {
      const F = mk(['gopher', 'tux']); place(F, 140); const tux = F.f[1], hp = tux.hp;
      const ev = run(F, 100, tap('heavy'), k => k >= 4 && k < 20 ? { x: 0, y: dir } : {});
      expect(tux.hp === hp && !has(ev, 'hit', 0), `stepped into the gap (${dir}): no hit (${kinds(ev)})`);
    }
  }
  // ---- Gopher: Dig & Pop and Deadlock: test/kits/gopher.mjs
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
    ev = run(F, S(M.reel + M.holdT) + 4);
    expect(has(ev, 'feFling', 0) && has(ev, 'down', 1) && Math.abs((hp - tux.hp) - M.damage) < 1e-6, `flung down (${kinds(ev)}, ${(hp - tux.hp).toFixed(1)})`);
  }
  { // walking out of the line: it clamps shut on nothing, open
    const F = mk(['ferris', 'tux']); place(F, 100); const [fe, tux] = F.f, hp = tux.hp;
    const ev = run(F, 70, tap('light'), { x: 0, y: 1 });
    expect(!has(ev, 'feCatch') && has(ev, 'feClamp', 0) && tux.hp === hp, `walked out: clamped on nothing (${kinds(ev)})`);
  }
  // ---- Ferris: Ownership Lock
  { // the ring forms round them; still inside: locked (no moves, the evade still works)
    const F = mk(['ferris', 'tux']); place(F, 80); const [fe, tux] = F.f, M = fe.stats.moves.move3;
    run(F, 2, tap('special'));
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
    const F = mk(['ferris', 'tux']); place(F, 80); const tux = F.f[1], M = F.f[0].stats.moves.move3;
    const ev = run(F, S(M.form) + 6, tap('special'), k => k > 4 ? { x: 1, y: 0 } : {});
    expect(has(ev, 'feLockMiss', 0) && !(tux.lockT > 0), `walked out (${kinds(ev)})`);
  }
  // ---- Ferris: unsafe { } (test/kits/ferris.mjs)
  // ---- Ferris: Shell Tuck
  { // rolls the held way, untouchable, then pops out open
    const F = mk(['ferris', 'tux']); place(F, 120); const fe = F.f[0], E = fe.stats.moves.evade, y0 = fe.y;
    let ev = run(F, 2, { guard: true, x: 0, y: -1 });
    expect(fe.move === 'evade' && fe.inv > 0 && fe.ph === 'tuck' && fe.pose === 'shell' && has(ev, 'feTuck', 0), `tucked (${fe.ph}, ${fe.pose})`);
    ev = run(F, S(E.active) + 1);
    expect(has(ev, 'fePop', 0) && Math.abs(fe.y - (y0 - E.dist)) < 6 && fe.inv <= 0, `rolled ${E.dist} away, open (${(fe.y - y0).toFixed(0)})`);
  }
}

// ---------------------------------------------------------------- 4b. the close-range hits' longer reach: each lands on a still Tux standing a
// few units inside its reach (past where it used to stop), and whiffs a good way past it
{
  const expect = (cond, msg) => { if (!cond) fail('reach: ' + msg); };
  const KEYS = { move1: 'light', move2: 'heavy', move3: 'special' };
  const OLD = { 'tux move2': 5, 'gopher move1': 22, 'ferris move2': 22, 'pyth move2': 24, 'octo move1': 42, 'swifty move1': 14 };   // (the old reaches; Cpp and Bugdroid have no close-range hit)
  for (const [idk, old] of Object.entries(OLD)) {
    const [id, k] = idk.split(' ');
    const F = mk([id, 'tux']); const M = F.f[0].stats.moves[k]; place(F, M.reach - 3); const tux = F.f[1], hp = tux.hp;
    expect(M.reach >= old + 10, `${idk}: reach ${old} -> ${M.reach}`);
    const ev = run(F, 70, k2 => ({ [KEYS[k]]: k2 < 2 }));
    expect(has(ev, 'hit', 0, { move: k }) && tux.hp < hp, `${idk}: lands from ${M.reach - 3} (${kinds(ev)})`);
  }
}

// ---------------------------------------------------------------- 5b. the plug-in fighters' moves (test/kits/<id>.mjs)
for (const [id, T] of Object.entries(KIT_TESTS)) if (T.checks) T.checks({ mk, place, run, has, kinds, tap, S, expect: (cond, msg) => { if (!cond) fail(`${id}: ${msg}`); } });

// ---------------------------------------------------------------- 7. every move card's clip lands
// the keys: move1, move2, move3, evade (fight-clips.js script(id, k); a missing one falls back to the fighter's
// own clips in fight-chars.js). What landing means (Tux's: test/kits/tux.mjs lands):
// Duke's move1 a blink and a jab string boiling over (down), move2 the pot stuck and boiling over on them (no hit on
// him: he blinked away), move3 a
// freeze, hits on the statue, a boil-over and the thaw (down); the evade: Duke's blink takes him out of one (a blink, and
// no hit on him). A fighter's own extra cards (FIGHTERS[id].cards) too
{
  const LANDS = {
    gopher: { move1: ev => has(ev, 'gopop', 0, { hit: true }), move2: ev => has(ev, 'hit', 0, { move: 'move2' }), move3: ev => has(ev, 'gocave', 0), evade: ev => has(ev, 'goburrow', 0) && !ev.some(e => e.kind === 'hit' && e.to === 0) },
    ferris: { move1: ev => has(ev, 'feFling', 0), move2: ev => has(ev, 'hit', 0, { move: 'move2' }) && ev.some(e => e.kind === 'down' && e.by === 0), move3: ev => has(ev, 'feLocked', 0), evade: ev => has(ev, 'feTuck', 0) && !ev.some(e => e.kind === 'hit' && e.to === 0) },
    duke: { move1: ev => has(ev, 'blink', 0) && has(ev, 'boil', 0) && has(ev, 'down', 1), move3: ev => has(ev, 'freeze', 0) && has(ev, 'hit', 0, { move: 'move1' }) && has(ev, 'thaw', 1) && has(ev, 'down', 1),
      move2: ev => has(ev, 'potstick', 0) && has(ev, 'erupt', 0, { to: 1 }) && ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move2' && e.dmg > 5) && !ev.some(e => e.kind === 'hit' && e.to === 0), evade: ev => has(ev, 'blink', 0) && !ev.some(e => e.kind === 'hit' && e.to === 0) },
  };
  for (const [id, T] of Object.entries(KIT_TESTS)) if (T.lands) LANDS[id] = T.lands;
  for (const id of new Set([...FIGHT_ORDER, ...Object.keys(KIT_TESTS)])) for (const k of FIGHTERS[id].cards || ['move1', 'move2', 'move3', 'evade']) {
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
