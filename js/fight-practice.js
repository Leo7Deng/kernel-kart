// @ts-check
// Fight mode's training room: you (fighter 0) against a dummy
// (fighter 1, any fighter) in a Fight with cfg.practice (js/fight.js: no intro, no clock, no KO, health refills). This
// file is the room's logic, DOM-free (test/fight-practice.test.mjs runs it in Node); js/fight-practice-ui.js is its
// overlay and fight-ui.js starts it. It only uses the Fight's API: setInput, step (one fixed step at a time, so it can
// count frames), events, the plain state, and cfg.bots[1] (the dummy is a bot only in 'bot' mode).
//   modes      what the dummy does (MODES): stand, walk (circles you), evade (its evade, by a chance, as your move's tell
//              comes out), bot (a Normal bot: fights back), replay (press T: you play the dummy for REC_T s, then it does
//              that over and over)
//   watching   from the events and the state, every fixed step: the last hit you landed (damage, stagger, knockdown,
//              counter or ground hit), the combo (hits while the dummy never got free), the frame data of your last move
//              as it ran (startup, active, recovery in 60 Hz frames, the frames you were ahead or behind once it was over,
//              and on a whiff whether the dummy's fastest move fits in your recovery), and the checklist (TRIALS)
//   trials     your fighter's combo trials (js/fight-trials.js COMBOS): every one followed at once from the events (prog:
//              the step each is at), the one picked (trial: pickTrial, which sets the dummy's mode) gives a hint when an
//              attempt breaks (hint: the step, why). Done ones are ticked with the checklist (done, their keys 'c:...').
//              trialDemo / demoFrame / demoStep play a trial's demo: a practice fight of its own with scripted inputs for
//              both, checked by the same code (test/fight-practice.test.mjs: every demo completes its trial)
// Randomness (the evade's chance, the walk's turns) is the room's own seeded stream: nothing here touches the fight's.
import { Math } from './detmath.js';
import { Fight, FIXED } from './fight.js';
import { FIGHTERS, MOVE_KEYS } from './fight-chars.js';
import { clamp, mulberry } from './core.js';
import { inputAt } from './fight-clips.js';
import { DEMO_ARENA, DEMO_VS, GAP, combosOf } from './fight-trials.js';

export const KEYS = [...MOVE_KEYS, 'evade'];
export const MODES = [
  ['stand', 'Stand', 'Stands still: try your moves and your combos'],
  ['walk', 'Walk', 'Circles you, now one way, now the other: aim and lead'],
  ['evade', 'Evade', 'Evades half your moves as their tell comes out: bait it, then punish'],
  ['bot', 'Fight back', 'A Normal bot: it attacks and answers you'],
  ['replay', 'Replay', 'T records: you play the dummy for 5 s, then it does that again and again'],
];
export const REC_T = 5;            // s you play the dummy for when recording
export const EVADE_P = 0.5;        // the evade mode's chance to evade each of your moves
const WALK_R = 150;                // the walk mode's distance from you
const STUCK = new Set(['hurt', 'stagger', 'down', 'getup', 'grabbed', 'frozen', 'dizzy', 'ko']);   // (can't act: a combo goes on)
const FREE = new Set(['idle', 'walk']);
const BLANK = { x: 0, y: 0, light: false, heavy: false, special: false, guard: false };
// the checklist: the same for every fighter, from the fight's events (a kit's own events are its own; these are the core's)
export const TRIALS = [
  ['move1', 'Land your first move'], ['move2', 'Land your second move'], ['move3', 'Land your special'],
  ['counter', 'A counter hit: catch them in their tell'], ['combo3', 'A 3-hit combo'], ['ground', 'Hit them while they\'re down'],
  ['wall', 'Slam them into a wall'], ['punish', 'Punish a move as it recovers'], ['dodge', 'Make them miss: evade an attack (Fight back)'],
];
const f60 = s => Math.ceil(s * 60 - 1e-6);   // (s in 60 Hz steps: a state lasts until its time is up, so a part frame is a whole one)

export class Practice {
  /** @param {import('./fight.js').Fight} F @param {{ seed?: number, done?: string[], mode?: string, trial?: string }} [o] */
  constructor(F, o = {}) {
    this.F = F; this.rng = mulberry(o.seed ?? 7);
    this.mode = 'stand'; this.acc = 0; this.n = 0;   // n: sim frames run (not counting a hit's freeze)
    this.rec = []; this.recT = 0; this.recording = false; this.play = 0;
    this.done = new Set(o.done || []);   // the trials ticked
    this.fresh = [];                     // trials ticked this frame (the overlay's tick sound)
    this.combos = combosOf(F.f[0].id);   // your fighter's combo trials (fight-trials.js)
    this.trial = null; this.prog = {}; this.hint = null; this.won = null;
    this.clear();
    this.setMode(o.mode || 'stand');
    if (o.trial) this.pickTrial(o.trial, false);
  }
  // pick a combo trial (null: none): its attempts give hints; mode: also set the dummy to the trial's
  pickTrial(k, mode = true) {
    const T = this.combos.find(t => t.k === k) || null;
    this.trial = T ? T.k : null; this.hint = null; this.prog = {};
    if (T && mode && T.mode) this.setMode(T.mode);
  }
  clear() {
    this.last = null; this.taken = null; this.combo = { n: 0, dmg: 0, live: false, t: -9, best: 0 };
    this.cur = null; this.fd = null; this.wait = null; this.evAt = -1; this.evMs = -1; this.evHold = 0;
    this.walkDir = 1; this.walkT = 2; this.freeAt = 0;
  }
  setMode(m) {
    if (!MODES.some(([k]) => k === m)) m = 'stand';
    this.mode = m; this.F.cfg.bots[1] = m === 'bot' ? 1 : null;
    if (m !== 'replay') this.recording = false;
    this.F.setInput(1, BLANK);
  }
  // T: start recording (you play the dummy for REC_T s), or stop early and replay what's there
  record() {
    if (this.recording) { this.recording = false; this.play = 0; return; }
    this.setMode('replay'); this.rec = []; this.recT = 0; this.recording = true; this.play = 0;
  }
  // both back where a round starts, full health, cooldowns ready (the recording is kept)
  reset() {
    const F = this.F;
    F.resetRound(); F.ai = [{}, {}]; F.hitstop = 0; F.acc = 0; F.setInput(0, BLANK); F.setInput(1, BLANK);
    this.clear(); this.play = 0; if (this.recording) { this.rec = []; this.recT = 0; }
  }
  // a frame: inp is your input; the fight runs in fixed steps (its events gathered over the frame, as F.update does)
  frame(dt, inp) {
    const F = this.F; F.events.length = 0; this.fresh = [];
    this.acc += clamp(dt || 0, 0, 0.25);
    while (this.acc >= FIXED) { this.acc -= FIXED; this.stepOnce(inp || BLANK); }
  }
  // one fixed step; dInp: the dummy's input instead of its mode's (a demo's script)
  stepOnce(inp, dInp) {
    const F = this.F, n0 = F.events.length, me = F.f[0], d = F.f[1], froze = F.hitstop > 0, dState = d.state, myMove = me.move;
    if (this.recording) {
      F.setInput(0, BLANK); F.setInput(1, inp); this.rec.push({ ...BLANK, ...inp }); this.recT += FIXED;
      if (this.recT >= REC_T) { this.recording = false; this.play = 0; }
    } else {
      F.setInput(0, inp);
      if (this.mode !== 'bot') F.setInput(1, dInp || this.dummy());
    }
    F.step();
    if (!froze) this.n++;
    this.watch(F.events.slice(n0), froze, dState, myMove);
  }

  // ------------------------------------------------------------ the dummy
  dummy() {
    const F = this.F, me = F.f[1], you = F.f[0];
    if (this.mode === 'replay') return this.rec.length ? this.rec[this.play++ % this.rec.length] : BLANK;
    if (this.mode === 'walk') return this.walk(me, you);
    if (this.mode === 'evade') return this.evade(me, you);
    return BLANK;
  }
  // round you at WALK_R, turning the other way now and then or at a wall
  walk(me, you) {
    const F = this.F;
    this.walkT -= FIXED;
    const dx = me.x - you.x, dy = me.y - you.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const tx = -uy * this.walkDir, ty = ux * this.walkDir, rad = clamp((WALK_R - d) / 70, -1, 1);
    let x = tx + ux * rad, y = ty + uy * rad; const l = Math.hypot(x, y) || 1; x /= l; y /= l;
    if (this.walkT <= 0 || F.contactsAll(me.x + x * 40, me.y + y * 40, me.r).length) { this.walkDir *= -1; this.walkT = 1.5 + this.rng() * 2.5; }
    return { ...BLANK, x: x * 0.85, y: y * 0.85 };
  }
  // once per move of yours, with EVADE_P, evade just before it strikes (sideways from you)
  evade(me, you) {
    const F = this.F, mv = you.move && you.stats.moves[you.move];
    if (mv && you.move !== 'evade' && you.ms !== this.evMs && (you.state === 'wind' || you.state === 'strike')) {
      this.evMs = you.ms;
      const at = you.state === 'strike' ? 0 : Math.max(0.1, (mv.startup || 0) - 0.12 - you.t);
      this.evAt = this.rng() < EVADE_P ? this.n + f60(at) : -1;
    }
    if (this.evAt >= 0 && this.n >= this.evAt) { this.evAt = -1; this.evHold = 3; this.evSide = this.rng() < 0.5 ? 1 : -1; }
    if (this.evHold > 0) {
      this.evHold--;
      const a = Math.atan2(me.y - you.y, me.x - you.x) + this.evSide * Math.PI * 0.4;
      return { ...BLANK, x: Math.cos(a), y: Math.sin(a), guard: true };
    }
    return BLANK;
  }

  // ------------------------------------------------------------ watching
  watch(evs, froze, dState, myMove) {
    const F = this.F, me = F.f[0], d = F.f[1];
    for (const e of evs) {
      if (e.kind === 'hit' && e.who === 0 && e.to === 1) {
        const mv = me.stats.moves[e.move], kd = d.state === 'down' || evs.some(x => x.kind === 'down' && x.who === 1);
        this.last = { move: e.move, name: mv ? mv.name : e.move, dmg: e.dmg || 0, counter: !!e.counter, ground: !!e.ground, kd, stun: !kd && (d.state === 'hurt' || d.state === 'stagger') ? d.dur : 0, t: F.time, n: 0 };
        if (!this.combo.live) { this.combo.n = 0; this.combo.dmg = 0; }
        this.combo.n++; this.combo.dmg += e.dmg || 0; this.combo.live = true; this.combo.t = F.time;
        this.combo.best = Math.max(this.combo.best, this.combo.n);
        if (this.cur) this.cur.hit = true;
        this.tick(e.move);
        if (e.counter) this.tick('counter');
        if (e.ground) this.tick('ground');
        if (this.combo.n >= 3) this.tick('combo3');
        if (dState === 'recover') this.tick('punish');
      } else if (e.kind === 'hit' && e.who === 1 && e.to === 0) this.taken = { dmg: e.dmg || 0, name: (d.stats.moves[e.move] || {}).name || '', t: F.time };
      else if (e.kind === 'iso' && e.who === 0) this.last = { move: e.move, name: (me.stats.moves[e.move] || {}).name || '', dmg: 0, iso: true, t: F.time };
      else if (e.kind === 'wall' && e.who === 1 && e.power > 0.3 && STUCK.has(d.state)) this.tick('wall');
      else if (e.kind === 'whiff' && e.who === 1 && me.move === 'evade') this.tick('dodge');
    }
    if (!STUCK.has(d.state)) { if (this.combo.live) this.freeAt = this.n; this.combo.live = false; }
    this.trials(evs);
    if (froze) return;
    // your move as it runs: frames in each state, then what it left you with
    const go = me.move && (me.state === 'wind' || me.state === 'strike' || me.state === 'recover');
    if (this.cur && !(go && me.move === this.cur.move && me.ms === this.cur.ms)) this.finish(me, d);
    if (go && !this.cur) this.cur = { move: me.move, ms: me.ms, f: { wind: 0, strike: 0, recover: 0 }, hit: false, n0: this.n };
    if (this.cur) this.cur.f[me.state]++;
    // ahead or behind: your move's over (you can act); the frames till the dummy can too
    if (this.wait && !STUCK.has(d.state)) { this.fd.adv = this.n - this.wait; this.wait = null; }
    else if (this.wait && this.n - this.wait > 240) { this.fd.adv = null; this.wait = null; }
  }
  finish(me, d) {
    const c = this.cur; this.cur = null;
    const mv = me.stats.moves[c.move] || {}, cut = STUCK.has(me.state);
    // the dummy's quickest move: does it fit in your recovery (an opening, what "unsafe" means without blocking here)
    const fast = KEYS.filter(k => k !== 'evade').map(k => d.stats.moves[k]).filter(Boolean).sort((a, b) => a.startup - b.startup)[0];
    this.fd = { move: c.move, name: mv.name || c.move, startup: c.f.wind, active: c.f.strike, recovery: c.f.recover, hit: c.hit, cut,
      data: { startup: f60(mv.startup || 0), active: f60(mv.active || 0), recovery: f60(mv.recovery || 0) },
      adv: null, fast: fast ? { name: fast.name, f: f60(fast.startup) } : null, evade: c.move === 'evade' };
    // ahead / behind: on a hit, the dummy still stuck: counted in watch till it's free; already free: behind by how long
    if (c.hit && !cut) { if (STUCK.has(d.state)) this.wait = this.n; else this.fd.adv = Math.max(this.freeAt, c.n0) - this.n; }
  }
  tick(k) { if ((TRIALS.some(t => t[0] === k) || this.combos.some(t => t.k === k)) && !this.done.has(k)) { this.done.add(k); this.fresh.push(k); } }

  // ------------------------------------------------------------ the combo trials
  // every trial's attempt: step 1 starts it, each next step in order within its gap; a near miss (the step's event, but
  // not as it should be), a whiff of the step's move or the gap running out breaks it (the picked one's hint)
  trials(evs) {
    const F = this.F;
    for (const T of this.combos) {
      let p = this.prog[T.k] || (this.prog[T.k] = { i: 0, t: 0, got: [] });
      const reset = () => { p.i = 0; p.got = []; };
      if (p.i > 0 && F.time - p.t > gapOf(T, p.i) + 1e-9) { this.fail(T, p.i, 'late'); reset(); }
      for (const e of evs) {
        if (p.i > 0) {
          const st = T.steps[p.i];
          if (isOf(st, e)) {
            if (!st.ok || st.ok(e, F, p.got)) { p.got.push(e); p.i++; p.t = F.time; if (p.i >= T.steps.length) { this.complete(T); reset(); } continue; }
            this.fail(T, p.i, 'near'); reset();
          } else if (e.who === 0 && (e.kind === 'whiff' ? e.move === st.m : st.miss && e.kind === st.miss)) { this.fail(T, p.i, 'miss'); reset(); continue; }
        }
        const s0 = T.steps[0];
        if (isOf(s0, e) && (!s0.ok || s0.ok(e, F, []))) { p.i = 1; p.got = [e]; p.t = F.time; if (T.steps.length === 1) { this.complete(T); reset(); } }
      }
    }
  }
  complete(T) { this.won = { k: T.k, t: this.F.time }; if (this.trial === T.k) this.hint = null; this.tick(T.k); }
  fail(T, i, why) { if (this.trial === T.k) this.hint = { k: T.k, i, why, t: this.F.time }; }

  // ------------------------------------------------------------ for the overlay
  // your fighter's moves: [{ k, name, cd (s left), ready, charges, data frames }]
  moves() {
    const f = this.F.f[0];
    return KEYS.map((k, j) => {
      const mv = f.stats.moves[k]; if (!mv) return null;
      const ch = k === 'evade' && mv.charges;
      return { k, mv, name: mv.name, short: mv.short || mv.name, cd: ch ? (f.ev > 0 ? 0 : f.evT) : f.cd[j] || 0, full: ch ? mv.recharge : mv.cooldown, charges: ch ? f.ev : null, maxCh: ch ? mv.charges : 0,
        f: [f60(mv.startup || 0), f60(mv.active || 0), f60(mv.recovery || 0)], dmg: mv.damage ?? (mv.hit && mv.hit.damage), kd: !!(mv.kd || (mv.last && mv.last.kd)) };
    }).filter(Boolean);
  }
}
export const fighterName = id => (FIGHTERS[id] || {}).name || id;
const gapOf = (T, i) => T.steps[i].gap ?? T.gap ?? GAP;
const isOf = (st, e) => e.kind === st.ev && e.who === (st.by ?? 0) && (e.to == null || e.to === 1);
// the hint's words for a broken attempt (P.hint): which step, and why
export function hintText(T, h) {
  const st = T.steps[h.i]; if (!st) return '';
  const why = h.why === 'late' ? 'too late' : h.why === 'miss' ? 'it missed' : 'not quite';
  return `Step ${h.i + 1}, ${st.what}: ${why}.${st.tip ? ' ' + st.tip : ''}`;
}

// ---------------------------------------------------------------- a trial's demo
// a practice fight of its own (DEMO_VS on DEMO_ARENA, where the demo says they stand) with the trial picked; demoStep
// runs one fixed step of the script (both fighters' inputs), demoFrame a frame's worth (its events gathered, as frame)
export function trialDemo(id, k) {
  const T = combosOf(id).find(t => t.k === k); if (!T) return null;
  const sc = T.demo, F = new Fight({ ids: [id, sc.vs || DEMO_VS(id)], bots: [null, null], seed: 7, practice: true, arena: sc.arena || DEMO_ARENA });
  F.f.forEach((f, i) => { f.x = sc.x[i]; f.y = sc.y ? sc.y[i] : 0; f.face = i ? Math.PI : 0; });
  const P = new Practice(F, { seed: sc.seed || 7, trial: k, mode: sc.mode || 'stand' });
  return { id, T, sc, F, P, n: 0, len: Math.round(sc.len * 60), acc: 0 };
}
export function demoStep(c) {
  const t = c.n * FIXED; c.n++;
  c.P.stepOnce(inputAt(c.sc.a, t), c.sc.mode ? null : inputAt(c.sc.b, t));
  return c.n >= c.len;
}
// a frame of it: true once it's over (start a fresh one to loop)
export function demoFrame(c, dt) {
  c.F.events.length = 0; c.P.fresh = [];
  c.acc += clamp(dt || 0, 0, 0.1);
  while (c.acc >= FIXED && c.n < c.len) { c.acc -= FIXED; demoStep(c); }
  return c.n >= c.len;
}
