// @ts-check
// Fight mode's bots: fightAI(fight, i, rng) returns fighter i's held input for this step, like a player's.
//
// They react at human speed: a bot decides from what
// the foe was doing a moment ago (`see` s, plus up to `seeJit`, rolled again each think: a ring of the foe's last steps
// on fight.ai[i], perceive()), its own state it knows at once, and where the foe is it follows closer (`track` s behind,
// carried on by their walk). So a move has to have been on screen for its reaction time before the bot answers it.
// Something new seen (a wind-up, a recovery, a hit...) makes it think again once it's seen; otherwise it thinks every
// `think` s (plus up to `jitter`). Every level sees and thinks at the same speed: levels differ in decisions only.
//
// One bot for every fighter (kitBot below), each fighter's own say through its plug-in's ai hooks (js/kits/<id>.js; the
// hooks are listed in js/kits/index.js). It answers each move's tell once it's been on screen for its reaction time
// (the foe's ai.threats and ai.objThreats): walks off it, or evades. It punishes a recovery or a freeze with whatever lands in the time left, hits a foe on the
// floor (groundBot), rolls up early off a knockdown (riseBot), uses its moves in the open by range and minds the walls.
// `answer` (how often a tell is answered), `smart` (the better answer), `punish`, `combo`, `rate` (how keen on moves)
// and `edge` differ by level. On top of that each bot has a play style (js/fight-style.js: its level's
// persona, a style of its own rolled from its rng, its fighter's character; m.P, and m.L the level's numbers as it plays
// them): Chill's favourite move, telegraphed throws, breaks and forgotten evades; Ruthless reading what you keep doing
// (anticipate, the spacing in neutral, the forced answers), baiting evades, punishing missed moves, waiting out rolls and
// meeting you as you're up (groundBot), its kit's setups (C.L.setup); how each gets up (riseBot).
// Their aim: every aimed throw is off by a fixed error rolled for it (`aimErr`, units:
// Chill 40-55, Normal 25-35, Ruthless 12-20) and leads a walking foe only partly (`lead`), re-aiming only off what
// perceive() shows them (aimAt below); the sim's aim assist is for humans only.
// Every bot's decisions go through js/fight-human.js (the human side: habits, noise, hesitation, misreads, uneven
// punishing, strongest at Chill). Memory lives on fight.ai[i] as plain data; randomness only from rng (the bot's own
// stream, seeded from the fight's seed).
import { Math } from './detmath.js';
import { clearance, heatState, rayClear, sd } from './fight-arenas.js';
import { RULES } from './fight.js';
import { KITS, OBJ_THREAT, plugOf, solidObjs } from './kits/index.js';
import { onBreak, levelOf, rangeOf, readFoe, habitOf, evadeHabit, riseHabit, risePlan, rollWay, styleOf } from './fight-style.js';   // (each bot's play style: js/fight-style.js)
import { HUMAN_CFG, humanAnswer, humanFace, humanFree, humanGo, humanLink, humanMisread, humanPick, humanPunish, humanPunTry, humanSee, humanTap, humanTick, humanWatch } from './fight-human.js';   // (the human side of every bot's decisions)

export const LV = [   // per level (exported for tuning scripts)
  { see: 0.3, seeJit: 0.1, track: 0.12, think: 0.22, jitter: 0.1, punish: 0.25,
    edge: 0.6, combo: 0.3, answer: 0.45, smart: 0.2, rate: 0.6, aimErr: [40, 55], lead: 0.25 },
  { see: 0.3, seeJit: 0.1, track: 0.12, think: 0.22, jitter: 0.1, punish: 0.6,
    edge: 0.8, combo: 0.65, answer: 0.72, smart: 0.5, rate: 0.85, aimErr: [25, 35], lead: 0.5 },
  { see: 0.3, seeJit: 0.1, track: 0.12, think: 0.22, jitter: 0.1, punish: 0.85,
    edge: 1, combo: 0.9, answer: 0.9, smart: 0.8, rate: 1, aimErr: [12, 20], lead: 0.75 },
];
const KEYS = ['light', 'heavy', 'special', 'guard'];
const SEEN = 48;                   // the foe's last 48 steps (0.8 s): what the bot can be seeing now
const WALKING = new Set(['idle', 'walk', 'step']);   // (where the foe is now: where it was plus its walk since)
// what's worth a second look the moment it's seen (a walk or a stop isn't)
const NOTICE = new Set(['wind', 'strike', 'recover', 'step', 'hurt', 'stagger', 'down', 'getup', 'dizzy', 'frozen', 'grabbed']);
const OUT = ['grabbed', 'hurt', 'stagger', 'frozen', 'dizzy', 'ko', 'win', 'down', 'getup'];   // (no moves of our own: just the quick rise off a knockdown)
const snap = (o, T) => ({ T, x: o.x, y: o.y, z: o.z, vx: o.vx, vy: o.vy, state: o.state, move: o.move, t: o.t, dur: o.dur, under: o.under,
  face: o.face, ms: o.ms, bat: o.bat, ph: o.ph, gone: o.gone, air: o.air, ev: o.ev, inv: o.inv, cd: o.cd ? [...o.cd] : null });

// the foe as the bot sees it now: the step from m.lag ago (never older than the last one it saw), with `age` (how old)
// and `left` (its state's time left, by now); its position carried on by its walk since
function perceive(F, m, o, L) {
  if (!m.seen || m.rnd !== F.round) { m.seen = []; m.sk = 0; m.rnd = F.round; m.pT = -1; }
  const s = snap(o, F.time);
  if (m.seen.length < SEEN) m.seen.push(s); else { m.seen[m.sk] = s; m.sk = (m.sk + 1) % SEEN; }
  const want = Math.max(F.time - m.lag, m.pT) + 1e-9, wantP = F.time - L.track + 1e-9;
  let e = null, p = null, old = null;
  for (const q of m.seen) {
    if (q.T <= want && (!e || q.T > e.T)) e = q;
    if (q.T <= wantP && (!p || q.T > p.T)) p = q;
    if (!old || q.T < old.T) old = q;
  }
  if (!e) e = old; if (!p) p = old;   // (the round just began: the first look)
  m.pT = e.T;
  const age = F.time - e.T, pa = F.time - p.T, P = { ...e, stats: o.stats, r: o.r, i: o.i, age, pAge: pa, left: e.dur - e.t - age };
  P.x = p.x; P.y = p.y; P.z = p.z; P.vx = p.vx; P.vy = p.vy;
  if (WALKING.has(p.state)) { P.x += p.vx * pa; P.y += p.vy * pa; }
  // a move seen (its wind-up, its swing or its recovery): by the frame data, how long until they're free again (`after`)
  // and whether by now it's over and they're stuck in its recovery (`stuck`: we know it didn't hit us)
  const mv = e.move && o.stats.moves[e.move], rec = mv ? mv.recovery || 0 : 0;
  P.after = e.state === 'recover' ? P.left : !mv ? -1 : e.state === 'strike' ? P.left + rec : e.state === 'wind' ? P.left + (mv.active || 0) + rec : -1;
  P.stuck = P.after > 0 && P.after <= rec + 1e-6;
  return P;
}

/** The bot's input for fighter i this step (Fight.step calls it).
 * @param {import('./fight.js').Fight} F @param {number} i @param {() => number} rng @returns {Partial<import('./fight.js').FightInput>} */
export function fightAI(F, i, rng) {
  const m = F.ai[i], me = F.f[i], live = F.f[1 - i], lv = F.cfg.bots[i] ?? 1, L0 = LV[lv] || LV[1];
  if (!m.init) {
    Object.assign(m, { init: 1, next: 0, mx: 0, my: 0, hold: { light: 0, heavy: 0, special: 0, guard: 0 }, queue: { light: 0, heavy: 0, special: 0, guard: 0 },
      last: { light: false, heavy: false, special: false, guard: false }, lag: L0.see + rng() * L0.seeJit, nk: '', stepNow: 0, stepDir: 0 });
    m.P = styleOf(LV[lv] ? lv : 1, (plugOf(me).ai || {}).persona, rng); m.L = levelOf(L0, m.P);   // (its play style, once: js/fight-style.js)
    m.sc = { tele: 0, brk: 0, bait: 0, forget: 0, read: 0, space: 0, wait: 0, trap: 0, run: 0 };   // (what its style did, for the measurements: test/fight-bot-style.mjs)
  }
  const L = m.L;
  const o = perceive(F, m, live, L);   // (the foe, a moment late)
  readFoe(F, m, me, o, live);   // (what the foe keeps doing: js/fight-style.js)
  humanWatch(F, m, me, live, ready(F, me, 3), F.ai[1 - i]);   // (the measurements only: js/fight-human.js)
  const hpSum = me.hp + live.hp; if (hpSum !== m.hpS || m.hpT == null || F.phase === 'intro') { m.hpS = hpSum; m.hpT = F.time; }
  const tap = (k, n = 2) => { m.queue[k] = n; };
  const hold = (k, n) => { if (m.hold[k] > 0) m.hold[k] = Math.max(m.hold[k], n); else m.queue[k] = n; };
  const cs = F.objs.length ? solidObjs(F) : null, A = cs && cs.length ? { ...F.A, solids: [...F.A.solids, ...cs] } : F.A;
  const dx = o.x - me.x, dy = o.y - me.y, dist = Math.hypot(dx, dy) || 1, gap = dist - me.r - o.r, toFoe = Math.atan2(dy, dx);
  // the walls: how much room we have and which way is open (away from the nearest wall, leaning toward the middle)
  const cl = clearance(A, me.x, me.y, me.r), dc = Math.hypot(me.x, me.y) || 1, wk = clamp01(1 - cl.d / 90);
  const toC = Math.atan2(-me.y / dc * (1 - wk) + cl.ny * wk * 1.5, -me.x / dc * (1 - wk) + cl.nx * wk * 1.5);
  const g = { A, cl, dist, gap, toFoe, toC };
  let mx = m.mx, my = m.my;
  // something new seen (a wind-up, a recovery, a hit...): think again now
  const start = Math.round((o.T - o.t) * 60), nk = o.state + ':' + o.move + ':' + start;
  if (nk !== m.nk) { m.nk = nk; if (NOTICE.has(o.state)) m.next = Math.min(m.next, F.time); }

  if (me.state !== 'down') m.wasDown = 0;
  { const d = live.state === 'down'; if (d && !m.fdW) m.fdN = (m.fdN || 0) + 1; m.fdW = d; }   // (the foe's knockdowns, counted)
  if (OUT.includes(me.state)) {
    mx = 0; my = 0; m.next = Math.min(m.next, F.time + 0.05);
    if (me.state === 'down') { const r = riseBot(F, i, m, me, live, L, rng, tap, g); if (r) [mx, my] = r; }   // (rolling up early: below)
  } else [mx, my] = kitBot(F, i, m, me, o, L, rng, tap, hold, g, mx, my);
  m.mx = mx; m.my = my;   // (what we want; the steering below is redone every step)
  if (me.z <= 0 && (me.state === 'idle' || me.state === 'walk')) {
    // off a heat vent that's about to flare (or burning), the sooner the better the bot
    for (const h of A.hazards) if (h.kind === 'heat') {
      const s = heatState(h, F.rt), [d, gx, gy] = sd(h, me.x, me.y);
      if ((s === 2 || s > 0.35) && d < me.r + 18) { const w = L.edge; mx = mx * (1 - w) + gx * w; my = my * (1 - w) + gy * w; }
    }
    [mx, my] = steer(A, me, i, mx, my);   // round the pillars and solid objects, not into them
  }
  // never walk into a wall (the sim stops you, but don't push into it)
  if (me.z <= 0 && cl.d < 6) { const into = -(mx * cl.nx + my * cl.ny); if (into > 0) { mx += into * cl.nx; my += into * cl.ny; } }
  const out = { x: mx, y: my, light: false, heavy: false, special: false, guard: false };
  for (const k of KEYS) {
    if (m.hold[k] > 0) { out[k] = true; m.hold[k]--; }
    else if (m.queue[k] > 0 && !m.last[k]) { out[k] = true; m.hold[k] = m.queue[k] - 1; m.queue[k] = 0; }
    m.last[k] = out[k];
  }
  // the evade's press, with its way held
  if (out.guard && m.stepNow) { out.x = Math.cos(m.stepDir); out.y = Math.sin(m.stepDir); m.stepNow = 0; }
  return out;
}

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const unit = a => [Math.cos(a), Math.sin(a)];
// where a bot aims a throw: the foe as seen (o: perceive's), led by its walk for s seconds (only partly: the
// level's lead), off by this go's error (rolled once per go: key, e.g. the move's ms, or 'next' for one about to be
// pressed). Returns [x, y]
/** @param {Record<string, any>} K @param {string} key @param {import('./kits/index.js').Seen} o @param {number} s
 * @param {Record<string, any>} L @param {() => number} rng @returns {number[]} */
export function aimAt(K, key, o, s, L, rng) {
  if (K.errFor !== key) { K.errFor = key; const a = rng() * Math.PI * 2, d = L.aimErr[0] + rng() * (L.aimErr[1] - L.aimErr[0]); K.err = [Math.cos(a) * d, Math.sin(a) * d]; }
  const k = s * L.lead;
  return [o.x + (o.vx || 0) * k + K.err[0], o.y + (o.vy || 0) * k + K.err[1]];
}

// walking (mx, my): a solid just ahead turns the walk along its side (the side the walk already leans to; head-on, a
// fixed side per fighter), easing off it as we get close
function steer(A, me, i, mx, my) {
  const mag = Math.hypot(mx, my); if (mag < 0.1 || !A.solids.length) return [mx, my];
  const ux = mx / mag, uy = my / mag, ahead = me.r + 22;
  const c = clearance(A, me.x + ux * ahead, me.y + uy * ahead, me.r, true);
  if (c.d > 6) return [mx, my];
  let tx = -c.ny, ty = c.nx; const dot = tx * ux + ty * uy;
  if (Math.abs(dot) < 0.15) { if (i) { tx = -tx; ty = -ty; } } else if (dot < 0) { tx = -tx; ty = -ty; }
  const push = clamp01((6 - c.d) / 24) * 0.7, sx = tx + c.nx * push, sy = ty + c.ny * push, l = Math.hypot(sx, sy) || 1;
  return [sx / l * mag, sy / l * mag];
}
// a step that way (an angle) on the next guard press
// the evade that way (an angle) on the next guard press
function stepTo(m, tap, a) { m.stepNow = 1; m.stepDir = a; m.hold.guard = 0; tap('guard', 2); return unit(a); }


// ---------------------------------------------------------------- the bot (three moves and an evade, every fighter)
const CDK = ['move1', 'move2', 'move3', 'evade'];   // (fighter.cd's order)
const KEY = { move1: 'light', move2: 'heavy', move3: 'special', evade: 'guard' };
const BUSY = new Set(['wind', 'recover', 'hurt', 'stagger', 'dizzy', 'frozen']);   // (the foe can't walk off right now)
// fighter i's held input as a three-move bot: in a move, the stick that aims or steers it; free, an answer to what's
// coming (walking off it, or the evade timed to it), a punish timed to the foe's opening, or (every think) where to
// stand and which move to throw out. Returns the walk (the keys already queued)
function kitBot(F, i, m, me, o, L, rng, tap, hold, g, mx, my) {
  const K = m.k3 || (m.k3 = { ans: {}, seenT: {}, steer: false, aimT: 0 });
  tap = humanTap(F, i, m, rng, tap, k => ready(F, me, k));   // (now and then the wrong key: js/fight-human.js)
  { const t0 = tap; tap = (k, n) => { m.why = K.ctx; m.whyT = F.time; return t0(k, n); }; }   // (why it pressed, for the measurements: the foe's humanWatch)
  K.ctx = 'pun';
  const MA = plugOf(me).ai || {}, FA = plugOf(F.f[1 - i]).ai || {};   // (the fighters' own bot hooks: js/kits/<id>.js ai)
  PC = plugCtx(F, i, m, me, o, L, rng, tap, hold, K, g);
  humanTick(F, i, m, me, F.f[1 - i], rng);
  if (MA.each) MA.each(F, i, me, o, PC);   // (every think: Duke's jab pressed as he lands from a blink in)
  if (me.move && me.ms !== K.trMs) { K.trMs = me.ms; if (m.P.traps.includes(CDK.indexOf(me.move))) { K.trN = (K.trN || 0) + 1; if (K.trGo && K.trN <= m.P.trapN) m.sc.trap++; } }   // (a trap of its kit's set)
  if (me.move && (me.state === 'wind' || me.state === 'strike')) return (MA.stick && MA.stick(F, i, me, o, PC)) || [0, 0];
  // the foe floored while we're still in our move's recovery: the ground hit pressed in its last moment (the press is
  // buffered: it comes out on the first frame we're free), as a player would
  if (me.state === 'recover' && F.f[1 - i].state === 'down') {
    const lv = F.f[1 - i]; gdPlan(F, m, K, lv, rng);
    const wait = me.dur - me.t, gap = Math.hypot(lv.x - me.x, lv.y - me.y) - me.r - lv.r;
    if (K.gdGo && lv.gh < RULES.groundN && wait < RULES.buffer - 0.02 && gap <= m.P.gReach && !lv.gone) {
      const k = floorMove(F, me, lv, gap, lv.dur - lv.t, wait, g);
      if (k >= 0 && K.gdBuf !== m.fdN) { K.gdBuf = m.fdN; fire(tap, k); }
    }
  }
  if (!(me.state === 'idle' || me.state === 'walk')) return [0, 0];
  const P = m.P, live = F.f[1 - i];
  // what it's landed since the last step (a break after it at Chill, a hit and run for a keep-away kit), its traps set
  const landed = K.fhp != null && live.hp < K.fhp - 1e-9 && K.fhr === F.round; K.fhp = live.hp; K.fhr = F.round;
  if (landed && P.hitRun && F.time > (K.lhT || -9) + 0.6 && rng() < P.hitRun) { K.runT = F.time + 0.5 + rng() * 0.4; m.sc.run++; }
  if (landed) K.lhT = F.time;
  if (K.trR !== F.round || live.state === 'down') { K.trR = F.round; K.trN = 0; K.trGo = P.trap > 0 && rng() < P.trap; }
  const brk = onBreak(F, K, P, rng, landed);   // (Chill: a breather now and then)
  if (brk && !K.brkWas) m.sc.brk++; K.brkWas = brk;
  { const r = FA.chase && FA.chase(F, i, me, o, PC); if (r) return r; }   // (the foe's thing on us first: Duke's Hot Java, chase him to pass it back)
  { const r = MA.first && MA.first(F, i, me, o, PC); if (r) return r; }   // (our own first: Duke keeping away while his pot's on them)
  if (!brk) { const gb = groundBot(F, i, m, me, o, L, rng, tap, K, g); if (gb) return gb; }   // (the foe on the floor: a hit on them there)
  { const r = MA.follow && MA.follow(F, i, me, o, PC); if (r) return r; }   // (our own follow-ups: Duke's freeze string, his hot jab string)
  K.ctx = 'ans'; const t = answer(F, i, m, me, o, L, rng, tap, K, g); if (t) return t;
  if (!brk) { K.ctx = 'pun'; const p = punishK(F, i, m, me, o, L, rng, tap, K, g); if (p) return humanPunTry(F, m, F.f[1 - i], p); }
  // a throw telegraphed (Chill): it stood facing them a moment, now it goes (if it still can)
  if (K.tele) {
    const q = K.tele;
    if (F.time > q.at + 0.5 || brk) K.tele = null;
    else if (F.time >= q.at) { K.tele = null; K.ctx = 'neu'; if (ready(F, me, q.k)) { fire(tap, q.k, q.n); return q.walk; } }
    else return g.gap > 30 ? [Math.cos(g.toFoe) * 0.35, Math.sin(g.toFoe) * 0.35] : [Math.cos(g.toFoe) * 0.05, Math.sin(g.toFoe) * 0.05];   // (a slow step in, squared up)
  }
  if (brk) return breather(me, o, g, P);
  { const r = anticipate(F, i, m, me, o, rng, tap, K, g); if (r) return r; }   // (a reading bot: their usual move coming)
  K.ctx = 'neu'; const h = humanFree(F, i, m, me, o, rng, { ready: k => ready(F, me, k), evade: a => evade(m, tap, a), toFoe: g.toFoe, gap: g.gap, still: !!(plugOf(me).ai && plugOf(me).ai.still), pocket: () => inPocket(F, me, o, g.gap) }); if (h) return h;
  if (F.time >= m.next) {
    m.next = F.time + L.think + rng() * L.jitter; m.lag = L.see + rng() * L.seeJit;
    for (const k in K.ans) if (!(K.seenT[k] >= F.time - 0.5)) { delete K.ans[k]; delete K.seenT[k]; }   // (the answers to things not seen for a moment: gone)
    return neutral(F, i, m, me, o, L, rng, tap, K, g);
  }
  return [mx, my];
}
// knocked down (js/fight-style.js risePlan): planned once a knockdown, a
// quick rise (the evade's key: it spends nothing down there) at the plan's moment and way, or staying down
function riseBot(F, i, m, me, live, L, rng, tap, g) {
  if (!m.wasDown) { m.wasDown = 1; m.rp = risePlan(F, m, me, live, m.P, rng); }
  const rp = m.rp;
  if (!rp.go || me.t < rp.at || me.t >= me.dur - 0.03) return null;
  rp.go = false;
  return stepTo(m, tap, rollWay(rp, me, live, g.cl, g.toC));
}
// the foe knocked down (we see it at once: it was our hit, or we watched it coming): one of ours that lands on them
// before they're up (fight.js groundHit), decided once a knockdown (its style's `ground`, only within its `gReach`),
// until the cap is reached. A bot that's read them rolling up (`wait`) leaves the floor alone and stands off where the
// roll will end; any bot not going for it may time a hit for the moment they're up (`meaty`: they're only staggered
// then, but it's a free hit)
function groundBot(F, i, m, me, o, L, rng, tap, K, g) {
  const live = F.f[1 - i], P = m.P;
  const up = live.state === 'getup' && !live.roll;   // (getting up where they lay: the meaty's moment is known)
  if (!(live.state === 'down' || up) || live.gone || live.z > 20) return null;
  gdPlan(F, m, K, live, rng);
  const dx = live.x - me.x, dy = live.y - me.y, dist = Math.hypot(dx, dy) || 1, gap = dist - me.r - live.r, toFoe = Math.atan2(dy, dx);
  const gg = { ...g, dist, gap, toFoe };
  const line = rayClear(g.A, me.x, me.y, toFoe, Math.max(0, gap), me.r * 0.8);
  const hit = (P0, a, b) => {
    const pc0 = PC; if (PC) PC = { ...PC, o: P0, g: gg };   // (a plug-in's own punish: where they lie now)
    const r = punishIn(F, i, m, me, P0, L, rng, tap, K, gg, { a, b, fits: T => T >= a - 0.02 && T <= b - 0.03, line, busy: true });
    PC = pc0; return r;
  };
  const P0 = { ...o, x: live.x, y: live.y, vx: live.vx, vy: live.vy, z: live.z, state: live.state, t: live.t, dur: live.dur, left: live.dur - live.t, after: -1, stuck: false, gh: live.gh };
  if (live.state === 'down') {
    const b = live.dur - live.t;
    if (K.gdGo && live.gh < RULES.groundN && gap <= P.gReach && b >= 0.04) {   // (committed to it: nothing else meanwhile)
      if (live.t < 0.06) return gap > 20 ? unit(toFoe) : [0, 0];
      const q0 = m.queue.light + m.queue.heavy + m.queue.special;
      let r = hit(P0, 0, b);
      if (!(m.queue.light + m.queue.heavy + m.queue.special > q0)) {   // (the kit had nothing: any close move of ours that lands in time)
        const k = floorMove(F, me, live, gap, b, 0, gg); if (k >= 0 && ready(F, me, k)) { fire(tap, k); r = unit(toFoe); }
      }
      if (r) return r;
      return gap > 20 ? unit(toFoe) : [0, 0];   // (in at them: the next step it may fit)
    }
    if (K.gdWait) {   // where the roll usually ends: a step off it, facing it
      const away = Math.atan2(live.y - me.y, live.x - me.x), ra = away + (K.gdSide || 0) * Math.PI / 2;
      const ex = live.x + Math.cos(ra) * RULES.rollDist, ey = live.y + Math.sin(ra) * RULES.rollDist;
      const tx = ex - Math.cos(ra) * (me.r + live.r + 30) * (K.gdSide ? 0 : 1), ty = ey - Math.sin(ra) * (me.r + live.r + 30) * (K.gdSide ? 0 : 1);
      const ddx = tx - me.x, ddy = ty - me.y, dd = Math.hypot(ddx, ddy);
      return dd < 10 ? [0, 0] : [ddx / dd, ddy / dd];
    }
    if (K.gdMeaty) {   // staying down: the hit timed for as they're up
      const a = b + RULES.getupT, r = hit({ ...P0, state: 'getup' }, a, a + RULES.safeT - 0.05); if (r) return r;
      if (gap > 60 && gap < 160) return unit(toFoe);
    }
    return null;
  }
  // getting up in place: the meaty
  if (K.gdMeaty && K.gdFor === m.fdN) { const a = live.dur - live.t; return hit(P0, a, a + RULES.safeT - 0.05); }
  return null;
}
// a knockdown of the foe's: what to do about it, decided once (groundBot)
function gdPlan(F, m, K, live, rng) {
  if (live.state !== 'down' || K.gdFor === m.fdN) return;
  const P = m.P; K.gdFor = m.fdN;
  const rh = P.read ? riseHabit(m.rd) : null;
  K.gdWait = !!(rh && rh.roll > 0.5 && rng() < P.wait * rh.roll); K.gdSide = rh ? rh.side : null;
  K.gdGo = !K.gdWait && rng() < P.ground; K.gdMeaty = rng() < P.meaty; if (K.gdWait) m.sc.wait++;
}
// how far a move of ours reaches past the edges (its reach, a sweep's radius less the bodies, a line's range), or -1
// in the pocket: one of our quick close moves ready and them inside its reach (the moment a close fighter waits for:
// js/fight-human.js lets a Chill bot take it instead of dithering, HUMAN pocket)
function inPocket(F, me, o, gap) { const M = me.stats.moves; for (let k = 0; k < 3; k++) { const mv = M[CDK[k]]; if (quickClose(mv, me, o) && ready(F, me, k) && gap < reachOf(mv, me, o) - 4) return true; } return false; }
// a quick close move: out fast and only lands right up close (a jab, a lunge, a coil), the kind a pause costs most
function quickClose(mv, me, o) { if (!mv || mv.speed || (mv.startup || 0) > 0.22) return false; const r = reachOf(mv, me, o); return r >= 0 && r <= 80; }
function reachOf(mv, me, o) { return mv.reach != null ? Math.min(mv.reach, 300) : mv.r1 ? mv.r1 - me.r - o.r : mv.range ? Math.min(mv.range, 300) : -1; }
// the close moves of ours that land on someone on the floor gap away within b s, after `wait` s more of our own move:
// the first, or -1
function floorMove(F, me, live, gap, b, wait, gg) {
  const M = me.stats.moves, A = plugOf(me).ai || {};
  for (let k = 0; k < 3; k++) {
    const mv = M[CDK[k]], rch = mv.reach != null && mv.reach < 120 ? reachOf(mv, me, live) : mv.r1 ? reachOf(mv, me, live) : -1;
    if (rch < 0 || !(mv.contact || mv.damage > 0) || me.cd[k] > wait || (me.lockT > 0) || (A.sane && !A.sane(F, me, k, gg))) continue;
    if (gap < rch - 4 && wait + mv.startup + Math.min(mv.active, 0.1) <= b - 0.03) return k;
  }
  return -1;
}
// one of ours ready (k 0..2 the moves, 3 the evade): off cooldown, not locked, its kit willing (a Garbage Collect
// charge left), unless its fighter's ai.ready says otherwise
function ready(F, me, k) {
  const mv = me.stats.moves[CDK[k]];
  if (!mv || me.cd[k] > 0) return false;
  if (me.lockT > 0 && k < 3) return false;   // (locked by Ferris's Ownership Lock: the evade only)
  if (k === 3 && me.psnT > 0) return false;   // (poisoned: no evade, fight.js poison)
  const Kt = KITS[mv.do], ok = !(Kt && Kt.can && !Kt.can(F, me, mv)), A = plugOf(me).ai;
  return A && A.ready ? A.ready(F, me, k, mv, ok) : ok;
}
const fire = (tap, k, n = 2) => tap(KEY[CDK[k]], n);
// the evade, with the way held (Duke blinks that way)
const evade = (m, tap, a) => stepTo(m, tap, a);
// answers to the foe's tells, seen (on screen for our reaction time). Each threat: when it lands (T s from now), how
// long it lasts, the way out and how far that is. Decided once each: walk off it, walk and evade if that won't make it,
// evade (timed: a plug-in's evade by its own evadeWhen; Duke's blink just before), or (missed) nothing.
// The most urgent one is answered. Returns the walk, or null
function answer(F, i, m, me, o, L, rng, tap, K, g) {
  const { toC, cl } = g, E = me.stats.moves.evade, W = 150 * me.stats.walk, MP = plugOf(me);
  if (MP.ai && MP.ai.brave && MP.ai.brave(F, me)) return null;   // (nothing worth walking off: Tux in his Ice Armour)
  const off = a => { const w = clamp01(1 - cl.d / 70) * 0.8; const x = Math.cos(a) + Math.cos(toC) * w, y = Math.sin(a) + Math.sin(toC) * w, l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
  const th = [];   // [key, T, dur, way out, how far]
  for (const b of F.objs) { const h = OBJ_THREAT[b.kind]; if (h) { const t = h(F, i, me, o, b, PC); if (t) th.push(t); } }   // (the fighters' world objects as threats: Duke's pot and ring)
  const FA = plugOf(F.f[1 - i]).ai; if (FA && FA.threats) th.push(...(FA.threats(F, i, me, o, PC) || []));   // (the foe's own tells)
  if (!th.length) return null;
  const evOk = ready(F, me, 3);
  for (const t of th) { K.seenT[t[0]] = F.time; humanSee(F, m, me, t[0], t[1], t[2], t[5], t[4] <= W * Math.max(0, t[1] - 0.05) * 0.9 || (evOk && t[1] > 0.03)); }   // (the measurements: did a seen attack get it; could it have got out of it)
  th.sort((x, y) => x[1] - y[1]);
  const [key, T, dur, a, need, soft] = th[0];
  humanFace(m, F.round + ':' + o.ms, soft);   // (what this is: one go of their move, noticed or not as a whole; soft: spacing)
  const walkable = need <= W * Math.max(0, T - 0.05) * 0.9;
  if (!(key in K.ans)) {
    const P = m.P, smart = walkable ? (rng() < 0.3 + 0.6 * L.smart ? 'walk+' : 'walk') : 'evade';
    let c = humanAnswer(F, i, m, rng, !HUMAN_CFG.on && rng() >= L.answer ? 'none' : smart, ready(F, me, 3), key);
    // the move they keep throwing (a reading bot): seen coming every time, answered the better way
    const hb = P.read && o.move ? habitOf(m.rd) : null;
    if (hb && CDK[hb.k] === o.move && (c === 'none' || c === 'wrong' || c === 'early') && rng() < P.read * hb.share * 1.6) { c = smart === 'walk' ? 'walk+' : smart; m.sc.read++; }
    // Chill forgets it has an evade: on foot, even when that won't make it
    if ((c === 'evade' || c === 'walk+') && P.forget && rng() < P.forget) { c = 'walk'; m.sc.forget++; }
    K.ans[key] = c;
  }
  { const hm = humanMisread(F, m, K, key, a, me); if (hm === 'evade') { if (ready(F, me, 3)) return evade(m, tap, a); } else if (hm != null) return off(hm); }   // (a misread: into it, or the evade burnt early)
  const c = K.ans[key];
  if (c === 'none' || c === 'done') return null;
  // the evade: at its fighter's own moment (ai.evadeWhen: Duke's blink just before), else untouchable through it
  const MA = MP.ai || {}, [now, late] = MA.evadeWhen ? MA.evadeWhen(T, dur, E, me, key, soft) : [T > 0.02 && T + dur < E.active - 0.03, T + dur < E.active - 0.03];
  if ((c === 'evade' || (c === 'walk+' && !walkable && late)) && ready(F, me, 3) && (now || late)) { K.ans[key] = 'done'; return evade(m, tap, MA.evadeWay ? MA.evadeWay(F, i, me, o, PC, a, key) : a); }   // (its own way: Gopher digs in under it at them)
  return off(a);
}
// the foe open (a recovery, a freeze, a stagger, a long tell, down and getting up): one of ours timed
// to land while they're open (seen), once per thing seen
function punishK(F, i, m, me, o, L, rng, tap, K, g) {
  const { A, dist, gap, toFoe } = g, M = me.stats.moves;
  if (o.z > 30 || o.gone || m.punFor === m.nk) return null;
  // the window they're open in, [a, b] s from now
  let a = 0, b = 0;
  if (o.state === 'down' || o.state === 'getup') { a = Math.max(0, o.left) + (o.state === 'down' ? RULES.getupT : 0); b = Math.max(a, o.left + (o.state === 'down' ? RULES.getupT : 0)) + RULES.safeT - 0.05; }   // (as they're up, safe: a hit staggers them; groundBot hits them on the floor)
  else if (BUSY.has(o.state)) b = o.left;
  else return null;
  if (b < 0.12) return null;
  m.punFor = m.nk;
  { const wy = wary(F, i, me, o); if (wy && rng() < wy.p * (0.35 + 0.6 * L.smart)) return null; }   // (no use hitting them now: Tux's Ice Armour)
  // a missed move's recovery (or an evade we baited), punished nearly always by a sharp bot (P.unsafe)
  const unsafe = (o.state === 'recover' || o.state === 'dizzy') && (rng() < m.P.unsafe || (o.move === 'evade' && F.time < (K.baitT || -9) + 1.4));
  if (!humanPunish(F, i, m, rng, unsafe || rng() < (o.state === 'frozen' || o.state === 'hurt' ? L.combo : L.punish), b, o) && !unsafe) return null;
  const fits = T => T >= a - 0.02 && T <= b - 0.02;
  const line = rayClear(A, me.x, me.y, toFoe, Math.max(0, dist - o.r - me.r), me.r * 0.8);
  return punishIn(F, i, m, me, o, L, rng, tap, K, g, { a, b, fits, line });
}
// what of ours lands in a window [w.a, w.b] s from now (w.fits(T), w.line: a clear line to them): fired, and the walk;
// else null (a punish, and the chase to pass Duke's pot back): the fighter's own ai.punish
function punishIn(F, i, m, me, o, L, rng, tap, K, g, w) {
  const MP = plugOf(me); return MP.ai && MP.ai.punish ? MP.ai.punish(F, i, me, o, PC, w) || null : null;
}
// every think, free and nothing coming: where to stand (mid range, the open side of them, off the walls) and now and
// then a move, by range and what they're doing. Keener once their evade is spent (bait it, then commit)
function neutral(F, i, m, me, o, L, rng, tap, K, g) {
  const { A, cl, dist, toFoe, toC } = g, M = me.stats.moves;
  const go = humanGo(F, i, m, o, rng);   // (going in on its own rhythm: nearer, keener: js/fight-human.js)
  const MA = plugOf(me).ai || {}, P = m.P;
  let want = (MA.want || 160) * P.want * (1 - go);   // (where it likes to stand: Duke in blink range; its style's distance)
  const setting = K.trGo && K.trN < P.trapN;   // (its traps first: further off while it sets them)
  if (setting) want += 80;
  const rush = rushOf(F, me, P);
  if (F.time < (K.runT || -9) && rush < 0.3) want = Math.max(want, 210);   // (a hit and run: off again)
  if (rush > 0) want *= 1 - 0.85 * rush;
  // the move they keep throwing (a reading bot): now and then it hovers just outside where they throw it from, to make
  // it miss and punish it (decided every 1.2 s or so); only a close or mid one (hovering
  // outside a long-range move, Cpp's flies or Octo's tentacle, is standing where it wants you)
  const hb = P.read ? habitOf(m.rd) : null;
  if (hb && hb.gap < SPACE_MAX) {
    if (!(F.time < K.spT)) { K.spT = F.time + 0.9 + rng() * 0.6; K.spOn = rng() < P.read * hb.share * 0.6; if (K.spOn) m.sc.space++; }
    if (K.spOn && o.cd && !(o.cd[hb.k] > 0.3)) want = Math.max(want, hb.gap + me.r + o.r + 28);
  }
  // the spot: on the far side of them from the nearest wall (their open side), mostly the side we're on
  const oc = clearance(A, o.x, o.y, o.r), ow = clamp01(1 - oc.d / 160);
  let sx = Math.cos(toFoe + Math.PI) * 0.75 + oc.nx * ow * 0.5, sy = Math.sin(toFoe + Math.PI) * 0.75 + oc.ny * ow * 0.5; const sl = Math.hypot(sx, sy) || 1;
  const tx = o.x + sx / sl * want, ty = o.y + sy / sl * want, ddx = tx - me.x, ddy = ty - me.y, dd = Math.hypot(ddx, ddy);
  let walk = dd < 8 ? [0, 0] : [ddx / dd, ddy / dd];
  if (dist - me.r - o.r > want + 60 && P.chase < 1 && rush < 0.3) {   // (they've gone off: not chased hard; a close fighter, who has to get there, chases harder: P.chaseClose)
    const ch = P.chase + (1 - P.chase) * P.chaseClose * clamp01((150 - (MA.want || 160)) / 50);
    walk = [walk[0] * ch, walk[1] * ch];
  }
  // pinned on a wall with them coming: round them, toward the middle
  if (cl.d < 30 + 30 * L.edge && (cl.nx * (o.x - me.x) + cl.ny * (o.y - me.y)) / dist > 0.2) {
    let tA = toC + Math.PI / 2; if (Math.cos(tA) * (o.x - me.x) + Math.sin(tA) * (o.y - me.y) > 0) tA += Math.PI;
    walk = [Math.cos(toC) * 0.6 + Math.cos(tA) * 0.8, Math.sin(toC) * 0.6 + Math.sin(tA) * 0.8];
  }
  if (o.state === 'down' || o.state === 'getup' || o.gone || o.air) return walk;
  { const wy = wary(F, i, me, o); if (wy && rng() < wy.p * (0.35 + 0.6 * L.smart)) return wy.walk || walk; }   // (no use hitting them now, Tux's Ice Armour: back off, wait it out)
  const busy = BUSY.has(o.state), spent = o.psnT > 0.3 || (o.stats.moves.evade ? (o.stats.moves.evade.charges ? !(o.ev >= 1) : o.cd && o.cd[3] > 0.5) : false);   // (poisoned: their evade's out too)
  // the moves that make sense now, each with its chance this think (x the level's keenness); one roll picks
  // (each bent by its style: a kit's liking, Chill's favourite, its traps first)
  // (a sharp bot mixes it up: the move it threw the last two times is less likely a third, P.mix)
  const tm = k => (!setting ? 1 : P.traps.includes(k) ? 2.5 : 0.4) * (K.nk1 === k && K.nk2 === k ? P.mix : 1);
  const opts = [], add = (k, p, walkTo, n = 2) => { p *= (P.like[k] || 1) * tm(k); if (p > 0 && ready(F, me, k)) opts.push([k, p, walkTo, n]); };
  if (MA.neutral) {   // (its own moves on offer; a walk of its own: closing in for a HIT...; { now }: done this think, Duke's blink in)
    const wk = MA.neutral(F, i, me, o, PC, { add, busy, spent, rush, line: rayClear(A, me.x, me.y, toFoe, Math.max(0, dist - o.r - me.r), me.r * 0.8) });
    if (wk && wk.now) return wk.now;
    if (Array.isArray(wk)) walk = wk;
  }
  const sane = k => ready(F, me, k) && !(MA.sane && !MA.sane(F, me, k, g));   // (a wild press its fighter allows: Duke's freeze or pot only with them near)
  // a feint to bait out an evade they keep using on its swings (or now and then, a tricky one): its quickest move from
  // just outside, then punishK has the evade's recovery
  if (P.bait && !spent && !busy && g.gap > 30 && g.gap < 150 && rng() < P.bait * (evadeHabit(m.rd) >= 0.3 ? 1 : 0.2)) {
    let q = -1; for (let k = 0; k < 3; k++) if (sane(k) && (q < 0 || (M['move' + (k + 1)].cooldown || 0) < (M['move' + (q + 1)].cooldown || 0))) q = k;
    if (q >= 0) { K.baitT = F.time; m.sc.bait++; fire(tap, q, 2); return [0, 0]; }
  }
  const pick = humanPick(F, i, m, rng, opts, rng() / L.rate / (spent ? 1 + L.smart : 1), sane);   // (one roll picks, the human way: js/fight-human.js)
  if (pick && pick.wild != null) { fire(tap, pick.wild, 2); return unit(toFoe); }
  if (pick >= 0) {
    const [k, , walkTo, n] = opts[pick];
    // Chill telegraphs it: a moment stood facing them first (kitBot throws it then, if it still can)
    // (a quick close move, a jab or a lunge, pays for that moment far more than a trap or a shot from range does: seldom
    // telegraphed, and only briefly: P.teleQ)
    const q = quickClose(M[CDK[k]], me, o), tq = q ? P.teleQ : 1;
    if (P.tele && rng() < P.tele * tq && g.gap < 200) { K.tele = { k, n, walk: walkTo, at: F.time + rangeOf(rng, P.teleT) * (q ? P.teleQT : 1) }; m.sc.tele++; return [Math.cos(toFoe) * 0.2, Math.sin(toFoe) * 0.2]; }
    K.nk2 = K.nk1; K.nk1 = k;
    if (n > 2) K.aimT = F.time + 0.25 + rng() * 0.25; fire(tap, k, n); return walkTo;
  }
  return walk;
}
// the move they keep throwing, ready, and them walking into its range (a reading bot sees it coming before it starts,
// every step): beat them to it (one of ours that lands as they arrive: a counter hit into their wind-up), else step off
// its range so it whiffs, and punishK has the recovery. Returns the walk, or null
const SPACE_MAX = 120;   // (the spacing read: their usual move's gap, at most this)
function anticipate(F, i, m, me, o, rng, tap, K, g) {
  const P = m.P, hb = P.read ? habitOf(m.rd) : null; if (!hb || !o.cd || o.cd[hb.k] > 0.05 || !(o.state === 'idle' || o.state === 'walk')) return null;
  const M = me.stats.moves, toFoe = g.toFoe, gp = g.gap, close = -((o.vx || 0) * Math.cos(toFoe) + (o.vy || 0) * Math.sin(toFoe));   // (how fast they're coming)
  if (!(close > 25 && gp < hb.gap + close * 0.35 + 20 && gp > hb.gap - 25)) return null;
  const key = o.ms + ':' + Math.round(F.time * 2);
  if (K.antFor === key) return K.antWalk || null;
  K.antFor = key; K.antWalk = null;
  if (!(rng() < P.read * hb.share)) return null;
  m.sc.ant = (m.sc.ant || 0) + 1;
  const MA = plugOf(me).ai || {};
  for (let k = 0; k < 3; k++) {
    const mv = M[CDK[k]], r = reachOf(mv, me, o); if (r < 0 || !ready(F, me, k) || (MA.sane && !MA.sane(F, me, k, g))) continue;
    if (gp - close * mv.startup < r - 4 && mv.startup < 0.3) { fire(tap, k, 2); return unit(toFoe); }
  }
  K.antWalk = unit(toFoe + Math.PI + (i ? 0.6 : -0.6));
  return K.antWalk;
}
// rush (persona): against a foe whose persona sets traps, press in while few of its things are out (half as hard at
// RUSH_N or more), keenest in the first RUSH_T s of a round; no hit and run meanwhile. 0..1
const RUSH_N = 8, RUSH_T = 10;
function rushOf(F, me, P) {
  if (!(P.rush > 0)) return 0;
  const j = 1 - me.i, FP = plugOf(F.f[j]).ai, pe = FP && FP.persona; if (!pe || !(pe.trap > 0)) return 0;
  let n = 0; for (const b of F.objs) if (b.owner === j && b.t < b.life) n++;
  return P.rush * (0.5 + 0.5 * clamp01(1 - n / RUSH_N)) * (F.rt < RUSH_T ? 1 : 0.7);
}
// a breather (Chill's break): back off to a comfortable distance, slowly, and wait there
function breather(me, o, g, P) {
  const gap = g.gap; if (gap > 200) return [0, 0];
  const a = g.toFoe + Math.PI, w = clamp01(1 - g.cl.d / 90), x = Math.cos(a) * (1 - w) + Math.cos(g.toC) * w, y = Math.sin(a) * (1 - w) + Math.sin(g.toC) * w, l = Math.hypot(x, y) || 1;
  return [x / l * 0.55, y / l * 0.55];
}

// a foe it's no use hitting right now (its plug-in's ai.wary: Tux in his Ice Armour): null, or { p, walk }
function wary(F, i, me, o) { const FP = plugOf(F.f[1 - i]); return FP && FP.ai && FP.ai.wary ? FP.ai.wary(F, i, me, o, PC) : null; }
// the plug-in fighters' bots (js/kits/<id>.js ai): what their hooks get (js/kits/index.js lists it); PC is this step's
let PC = null;
/** @returns {import('./kits/index.js').BotCtx} */
function plugCtx(F, i, m, me, o, L, rng, tap, hold, K, g) {
  return { F, i, m, me, o, live: F.f[1 - i], L, rng, tap, hold, K, g, unit, fire: (k, n) => fire(tap, k, n), ready: k => ready(F, me, k), stepTo: a => evade(m, tap, a), aimAt: (key, s) => aimAt(K, key, o, s, L, rng),
    link: p => humanLink(F, i, m, rng, rng() < p),   // (a link out of the evade, the human way: js/fight-human.js)
    punish: w => punishIn(F, i, m, me, o, L, rng, tap, K, g, w) };   // (what of ours lands in a window: Duke's chase after his pot)
}
