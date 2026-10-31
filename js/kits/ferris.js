// @ts-check
// Ferris (Rust) for Fight: three moves and an evade (plug-in shape: js/kits/index.js; drawing: js/art/kit-ferris.js). A
// Controller, the borrow checker: the Lock takes your moves and drags at your feet so the claw (the only aimed
// line-grab) lands; unsafe is his punish up close, and out of his Shell Tuck after a dodge.
// move1 Borrow Claw (feClaw, hold to aim): a claw snaps out along a line, catches, reels in, holds them "borrowed",
// then flings them the held way. Tell: the claw opening and a scuffed track where it'll go (it stops turning just
// before it shoots). A miss leaves it clamped shut: open.
// move2 unsafe { } (feUnsafe): a hit. A twist, then one spin, claws out, launching whoever's in reach all round; costs
// him a little health. Answer: spacing. A miss: open.
// move3 Ownership Lock (feLock): a ring of chain links forms round the foe's spot; inside when it closes: no moves (the
// evade still works) and slowed by a ball and chain. On someone locked the claw homes on them (lockTurn), catches lockW
// wider, the chain pulls taut and the fling does x owned.
// evade Shell Tuck (feShell): rolls the held way (none: away), untouchable. unsafe pressed while rolling bursts him out
// into the spin there (the shell judders: open, unsafe's startup).
// Phases (f.ph): clawback, shoot, reel, hold, fling / clamp · decree, cast · brace (or burst), spin, spun / spent ·
// tuck, popout. Objects: feclaw (a, len from his middle, w, ext, ph 'aim' | 'shoot' | 'hold' | 'back', lock 0/1),
// felock (R, ph 'form' | 'shut' | 'miss'), fechain (to, bx/by the ball, ph 'on' | 'off'). Held: state 'grabbed' (hold:
// Ferris); locked: lockT > 0. Events: feCatch (to), feFling, feClamp, feLock, feLocked (to), feLockMiss, feBrace,
// feBurst, feUnsafe (self), feSpin (hit), feSpent, feTuck (x2, y2), fePop, feUnchain.
import { Math } from '../detmath.js';
import { clearance, rayClear } from '../fight-arenas.js';
import { AIM, TAU, angDiff, dist, gone, inside, landing, mine, open, sameGo, sd, segDist, setPh, spawn, toward, turnTo } from './lib.js';
const clamp01 = x => Math.max(0, Math.min(1, x));

const ID = 'ferris';
/** @type {import('./index.js').FighterData} */
const fighter = {
  id: ID, name: 'Ferris', lang: 'Rust', role: 'Controller',
  blurb: 'A safe, sturdy crab and the borrow checker: his chains lock your moves and drag at your feet, then his claw borrows you from across the arena and he spins you round in it; dodge into his shell and he bursts out of it in one brutal unsafe spin.',
  tagline: 'Armoured crab: chains that lock your moves, a claw that grabs from afar.',
  difficulty: 'medium',
  passive: 'Sturdy: the heaviest shell in the fight after Tux, hard to push about.',
  balance: 'A slow, heavy target with no quick poke, so his round is the Lock then the claw, and a catch is his big moment: with unsafe { } ready he spins them round in the claw for 22 (2026-10-29: 28 -> 23, and the claw slower and narrower; the fling alone 19, x1.35 on someone locked). About 49% (Chill) to 54% (Ruthless) of bot fights, 2026-10-26 (was 36 / 51: the fling had nothing to follow it; Chill bots only find the spin about a quarter of the time, Ruthless ones four times in five). Pyth\'s reach keeps him off (~19% at Ruthless); Tux and Duke get caught (~60-80%). 2026-10-29, the approved kit changes (the claw slower, narrower and shorter (0.36 s, 15 wide, 140), open 0.75 s on a miss, the claw-spin 28 -> 23, unsafe 17 -> 20): about 38% at Normal and 41% at Ruthless (the ring, 16 / 12 fights a pair). 2026-10-29, the balance pass (all four arenas, 40 fights a pair, about ±5): 47% Chill, 51% Normal, 45% Ruthless (unsafe { } quicker and safer: startup 0.12 -> 0.1, recovery 0.32 -> 0.26, a miss 0.6 -> 0.45, 20 -> 21 damage; the claw\'s miss 0.75 -> 0.65; Shell Tuck back sooner (recovery 0.24 -> 0.18, cooldown 2 -> 1.7): he was bottom at Ruthless, 36-39%). Slow and close, the quick ones (Tux 13% at Ruthless) and Docky get to him first; he drags the zoners in (Bugdroid 80-88%). 2026-10-31, a very slight trim (the user: harder and punishable is right, just slightly too much): the claw\'s startup 0.36 -> 0.34 and recovery 0.32 -> 0.31, the Lock\'s 0.28 / 0.3 -> 0.27 / 0.29, peak damage about 5% lower (the fling 19 -> 18, the claw-spin 23 -> 22, unsafe 21 -> 20), misses as open as before: 42% Chill, 47% Normal, 44% Ruthless (16 / 24 / 16 fights a pair, about ±7-8; untrimmed 47% at Normal in the same field).',
  hp: 128, weight: 1.22, walk: 0.98, accel: 26, friction: 28, kbDecay: 3, radius: 19, slipMul: 0.2,
  moves: {
    move1: { name: 'Borrow Claw', short: 'Borrow', do: 'feClaw', icon: 'feClaw', hold: 'aim',
      blurb: 'His grab: the claw snaps out a long way on a springy arm, catches you, reels you in and holds you borrowed, then flings you down a short way off. Press unsafe { } while he holds you and he heaves you up and spins with you still in his claw, slamming you down hard. On someone locked it homes in on them, the chain holds them still, and the fling hits harder.',
      tell: 'The claw opens wide and a scuffed track shows on the floor where it\'ll go.',
      answer: 'Step out of the line (it stops turning just before it shoots), or evade. Locked, walking won\'t save you: evade it. Missing, the claw clamps shut on nothing: he\'s open. Caught, there\'s no way out: it\'s the claw you have to beat.',
      // the cock (startup): the line turns aimTurn rad/s the held way (else at them) until lock s before it shoots; out
      // over shoot s to reach (from his edge, half-width w); caught: reeled in over reel s, held holdT s, flung
      // (damage, kb, down) the held way; a miss: clamp s open. On someone locked the line homes at lockTurn rad/s,
      // lockW wider, and the fling does x owned. unsafe pressed while holding (its cooldown ready): heaved up
      // (spin.heave s) and spun once round (spin.time s), slammed out (the claw's and the spin's hit); costs unsafe's
      // self and its cooldown.
      startup: 0.34, active: 0.14, recovery: 0.31, clamp: 0.65, cooldown: 1.5,
      damage: 18, kb: 170, kd: true, reach: 140, w: 15, lock: 0.22, aimTurn: 0.9, shoot: 0.14, reel: 0.18, holdT: 0.5, lockTurn: 4, lockW: 10, owned: 1.35,
      spin: { damage: 22, kb: 260, kd: true, heave: 0.12, time: 0.34 } },
    move2: { name: 'unsafe { }', short: 'unsafe', do: 'feUnsafe', icon: 'feUnsafe', hold: null,
      blurb: 'His punish up close: he goes berserk for one brutal spin, both claws out, smashing anyone close all the way round him. It costs him a sliver of health. Pressed while his claw holds you, he spins with you in it instead.',
      tell: 'He twists back for an instant, claws cocked to one side. It comes out almost at once.',
      answer: 'Keep out of his reach (it hits all round him, but not far). Missing, he spins past and has to settle: hit him then.',
      // the twist (startup), then one spin over active s, drifting drift u/s on: whoever's within reach of his edge, any
      // side, is launched (damage, kb, down) once; self: the health it costs him; a hit: recovery s, a miss: miss s open
      startup: 0.1, active: 0.24, recovery: 0.26, miss: 0.45, cooldown: 1.8, contact: true,
      damage: 20, kb: 310, kd: true, reach: 36, drift: 50, self: 2 },
    move3: { name: 'Ownership Lock', short: 'Lock', do: 'feLock', icon: 'feLock', hold: null,
      blurb: 'He swings a coil of chain round his claw and flings it at your feet, where it pays out into a ring of links. Still inside when it closes and your moves are locked for a while, a ball and chain dragging at your feet: then the claw comes.',
      tell: 'The coil swinging round his raised claw, a shadow on the floor under you, then the coil landing and paying out into a ring round you.',
      answer: 'Walk out before it closes. Locked, you walk slowly (not at all while his claw comes) but can still evade (and a move you were winding up is gone): keep your evade for his claw.',
      // the clack (startup); the ring (R round their spot) forms over form s; inside then: locked lock s, walking at x
      // slow; reaches range from him
      startup: 0.27, active: 0.05, recovery: 0.29, cooldown: 3,
      R: 58, form: 0.7, lock: 2, slow: 0.5, range: 300 },
    evade: { name: 'Shell Tuck', short: 'Shell', do: 'feShell', icon: 'feShell', hold: null,
      blurb: 'Tucks into his shell and rolls a way the held way (or away from you), untouchable while he rolls. Press unsafe { } while he rolls to burst out of the shell into the spin right there.',
      tell: 'A rolling shell; it stops dead and judders if he\'s about to burst out.', answer: 'Meet him where he pops out: he\'s open for a moment. Back off a shell that stops close to you.',
      startup: 0, active: 0.38, recovery: 0.18, cooldown: 1.7, dist: 120 },
  },
  phPose: { clawback: 'clawback', shoot: 'clawshot', reel: 'clawshot', hold: 'clawhold', heave: 'clawhold', clawspin: 'whirl', slung: 'whirl', fling: 'fling', clamp: 'clamp', decree: 'decree', cast: 'decree', brace: 'brace', burst: 'shell', spin: 'whirl', spun: 'whirl', spent: 'dizzy', tuck: 'shell', popout: 'popout' },
  phFade: ['fling', 'cast', 'popout', 'spun', 'slung'],
  fields: { aimW: 0, shelled: 0, owned: 0, homed: 0, sp0: 0, spA: 0, gd0: 0 },   // // (gd0: how far off the claw caught them; sp0, spA: when the claw's spin was pressed and his facing then; aimW: the aim's eased turn rate; shelled: the next unsafe bursts out of the shell; owned: the claw caught someone locked; homed: this claw homes, 0 once they evade)
  show: ['stand', 'clawback', 'stand', 'whirl', 'stand', 'decree', 'stand', 'shell'], cheer: 'decree',
};
const P = (a, b, inp) => [a, b, inp];
fighter.clips = {
  move1: { x: [-110, 40], len: 2.6, cam: { x: -20, w: 320 }, a: [P(0.3, 0.38, { light: 1 })] },
  move2: { x: [-26, 22], len: 2.2, cam: { x: 0, w: 230 }, a: [P(0.3, 0.38, { heavy: 1 })] },   // (point-blank)
  move3: { x: [-90, 40], len: 2.8, cam: { x: -10, w: 290 }, a: [P(0.3, 0.38, { special: 1 }), P(1.4, 1.48, { light: 1 })] },   // (locked: then the claw)
  evade: { x: [-40, 110], len: 2.4, cam: { x: 10, w: 300 }, a: [P(0.82, 0.88, { guard: 1, x: 0, y: -1 })], b: [P(0.53, 0.61, { heavy: 1 })] },   // (rolled out of Tux's toboggan)
};

// the aim: eased (f.aimW its turn rate), at most max rad/s. A human's sticks to the foe, the held way only an offset
// (holding nothing aims well); a bot's goes only the way its stick holds (ai.stick)
function aimStep(F, f, o, max, dt, c) {
  const toO = toward(f, o);
  let want = f.face;
  if (F.cfg.bots[f.i] == null) want = toO + (c.mag > 0.3 ? Math.max(-2.4, Math.min(2.4, angDiff(c.dirA, toO))) * 0.6 * Math.min(1, c.mag) : 0);
  else if (c.mag > 0.3 && Math.abs(angDiff(c.dirA, toO)) < Math.PI * 0.75) want = c.dirA;
  if (F.cfg.bots[f.i] == null) max *= 0.5;   // // (a human's line trails a walker, so a sidestep gets out)
  const rate = Math.max(-max, Math.min(max, angDiff(want, f.face) * 6));
  f.aimW = (f.aimW || 0) + (rate - (f.aimW || 0)) * Math.min(1, dt * 9);
  f.face += f.aimW * dt;
}
// where a bot aims (its stick): where it sees them (late: perceive()), leading partly, a per-throw miss to one side
// that shrinks with level (Chill ~47 units, Normal ~31, Ruthless ~16)
function botAim(C, me, o, t) {
  const K = C.K, L = C.L;
  const key = me.state === 'wind' ? me.ms : me.ms + 1;   // (asked as it throws: the go about to start)
  if (K.aimFor !== key) { K.aimFor = key; K.aimErr = (C.rng() < 0.5 ? -1 : 1) * (47 - 52 * (L.smart - 0.2)) * (0.85 + 0.3 * C.rng()); }
  const lead = 0.2 + 0.6 * L.smart, x = o.x + o.vx * t * lead, y = o.y + o.vy * t * lead, a = Math.atan2(y - me.y, x - me.x);
  return Math.atan2(y + Math.cos(a) * K.aimErr - me.y, x - Math.sin(a) * K.aimErr - me.x);
}
// the claw's line follows his facing while he aims
function clawLine(F, f, mv) { const ln = mine(F, f, 'feclaw'); if (ln) { ln.x = f.x; ln.y = f.y; ln.a = f.face; } return ln; }
function letGo(F, f) {   // the held one goes free (the claw cut short)
  if (f.hold >= 0) F.release(f);
}
function clamp(F, f, mv) {
  setPh(f, 'clamp'); F.go(f, 'recover', mv.clamp); f.vx = f.vy = 0;
  const ln = mine(F, f, 'feclaw'); if (ln) { ln.ph = 'back'; ln.bt = ln.t; }
  F.ev('feClamp', f.x + Math.cos(f.face) * (ln ? ln.ext : 30), f.y + Math.sin(f.face) * (ln ? ln.ext : 30), 0.4, f.i, { move: 'move1' });
}
// Shell then unsafe: unsafe pressed (buffered) while he rolls goes now, off its cooldown, out of the shell (its startup
// the shell juddering; the evade's cooldown runs from here). True if it did
function burstOut(F, f) {
  const mv = f.stats.moves.move2;
  if (f.bufK !== 'heavy' || f.cd[1] > 0 || f.lockT > 0) return false;
  f.bufK = ''; f.bufT = 0; f.shelled = 1; f.inv = 0;
  F.startMove(f, 'move2'); f.cd[1] = mv.cooldown || 0;
  return true;
}
// walking slowed: this step's walk partly taken back (the sim moved them already)
function slowWalk(F, o, k, dt) {
  if (o.z > 0 || !(o.state === 'walk' || o.state === 'idle')) return;
  o.x -= o.vx * dt * (1 - k); o.y -= o.vy * dt * (1 - k); F.keepIn(o);
}
// unsafe's spin: whoever's within reach of his edge, any side (true if it connected)
function spin(F, f, o, mv) {
  if (!open(o) || o.under || dist(f, o) - f.r - o.r > mv.reach) return false;
  if (!F.hitF(f, o, mv, { dir: toward(f, o), move: 'move2' })) return false;
  const hit = F.lastRes === 'hit';
  if (hit) F.hitstop = Math.max(F.hitstop, 8 / 60);   // (a solid smack)
  F.ev('feSpin', (f.x + o.x) / 2, (f.y + o.y) / 2, hit ? 1 : 0.5, f.i, { move: 'move2', hit, a: toward(f, o) });
  return true;
}

/** @type {Record<string, import('./index.js').Kit>} */
const kits = {
  feClaw: {
    moves: true,
    press(F, f, o) {
      setPh(f, 'clawback'); f.aimW = 0; f.homed = 1;
      if (F.cfg.bots[f.i] == null) f.face = toward(f, o);   // (a human's aim starts on them)
      spawn(F, f, { kind: 'feclaw', a: f.face, len: f.r + f.stats.moves.move1.reach, w: f.stats.moves.move1.w, ext: 0, ph: 'aim', lock: 0 });
    },
    wind(F, f, o, mv, dt, c) {   // aiming (a human's sticking to them, the held way an offset) until the lock, the line with him
      const ln = mine(F, f, 'feclaw');
      if (o.move === 'evade') f.homed = 0;   // (evaded: it stops homing, this throw)
      if (o.lockT > 0 && f.homed) { f.aimW = 0; f.face = turnTo(f.face, toward(f, o), mv.lockTurn * dt); if (ln) ln.lock = 1; }   // (locked: it homes on them)
      else if (f.t < f.dur - mv.lock) aimStep(F, f, o, mv.aimTurn, dt, c);
      else { f.aimW = 0; if (ln) ln.lock = 1; }
      f.vx = f.vy = 0; clawLine(F, f, mv);
    },
    start(F, f) {
      setPh(f, 'shoot'); f.vx = f.vy = 0;
      const ln = clawLine(F, f); if (ln) { ln.ph = 'shoot'; ln.lock = 1; }
      F.ev('feShoot', f.x, f.y, 0.5, f.i, { move: 'move1' });
    },
    step(F, f, o, mv, dt, c) {
      f.vx = f.vy = 0;
      const ln = mine(F, f, 'feclaw');
      if (f.ph === 'shoot') {
        const u = Math.min(1, f.t / mv.shoot), tip = f.r + mv.reach * u;
        if (ln) { ln.ext = tip; ln.x = f.x; ln.y = f.y; }
        const x1 = f.x + Math.cos(f.face) * tip, y1 = f.y + Math.sin(f.face) * tip, [d] = segDist(o.x, o.y, f.x, f.y, x1, y1);
        if (o.move === 'evade') f.homed = 0;
        if (d <= mv.w + (o.lockT > 0 && f.homed ? mv.lockW : 0) + o.r && open(o) && o.inv <= 0 && !(o.safeT > 0) && !o.under && o.hold < 0 && !['down', 'getup', 'grabbed'].includes(o.state)
          && rayClear(F.A, f.x, f.y, f.face, Math.max(0, dist(f, o) - o.r), 2)) {
          // caught: borrowed (held in the claw, reeled in)
          F.release(o); o.move = null; o.ph = ''; o.vx = o.vy = 0;
          f.hold = o.i; o.hold = f.i; f.owned = o.lockT > 0 ? 1 : 0; F.go(o, 'grabbed'); f.hit = true; f.gd0 = dist(f, o);
          setPh(f, 'reel'); F.go(f, 'strike', mv.reel + mv.holdT + 0.1);
          if (ln) ln.ph = 'hold';
          F.ev('feCatch', o.x, o.y, 0.7, f.i, { move: 'move1', to: o.i });
        } else if (u >= 1) clamp(F, f, mv);
        return;
      }
      // reeling in, then holding: the borrowed one just in front of him; then the fling
      const g = F.f[f.hold];
      if (!g || g.state !== 'grabbed') { letGo(F, f); clamp(F, f, mv); return; }
      const snug = f.r + g.r + 4, U = f.stats.moves.move2, S = mv.spin;
      let gd = snug + Math.max(0, f.gd0 - snug) * Math.max(0, 1 - f.t / mv.reel);
      if (f.ph === 'reel' && f.t >= mv.reel) setPh(f, 'hold');
      // unsafe pressed while he holds them (its cooldown ready): the heave, then the spin with them in his claw
      if ((f.ph === 'reel' || f.ph === 'hold') && f.bufK === 'heavy' && !(f.cd[1] > 0)) {
        f.bufK = ''; f.bufT = 0; f.cd[1] = U.cooldown || 0; f.sp0 = f.t; f.spA = f.face;
        f.hp = Math.max(1, f.hp - U.self * F.dmgMul); f.flash = 0.12;
        f.dur = f.t + S.heave + S.time + 0.1;
        setPh(f, 'heave'); F.ev('feHeave', g.x, g.y, 0.6, f.i, { move: 'move2', to: g.i });
      }
      if (f.ph === 'heave' && f.t - f.sp0 >= S.heave) { setPh(f, 'clawspin'); F.ev('feUnsafe', f.x, f.y, 0.8, f.i, { move: 'move2', held: 1 }); }
      if (f.ph === 'heave' || f.ph === 'clawspin') {   // heaved up off the floor, then swung once right round at the claw's length
        const u = f.ph === 'clawspin' ? clamp01((f.t - f.sp0 - S.heave) / S.time) : 0;
        gd = snug + 8 * clamp01((f.t - f.sp0) / S.heave);
        f.face = f.spA + TAU * u * u * (3 - 2 * u);
      } else if (f.ph === 'hold' && c.mag > 0.3) f.face = turnTo(f.face, c.dirA, 6 * dt);   // (turning to fling it the held way)
      g.x = f.x + Math.cos(f.face) * gd; g.y = f.y + Math.sin(f.face) * gd; g.vx = g.vy = 0; F.keepIn(g);
      g.z = f.ph === 'heave' || f.ph === 'clawspin' ? 12 * clamp01((f.t - f.sp0) / S.heave) : 0;   // (heaved up off the floor, swung round in the air)
      if (ln) { ln.ext = gd; ln.a = f.face; }
      if (f.ph === 'clawspin' && f.t - f.sp0 >= S.heave + S.time) {   // round once: slammed out, the claw's hit and the spin's together
        const a = f.face + 0.5;   // (slung out along the swing)
        f.hold = -1; g.hold = -1; g.z = 0; F.go(g, 'idle');
        F.hitF(f, g, S, { dir: a, unblockable: true, hold: true, kd: true, noFlank: true, move: 'move2' });
        if (ln) gone(ln);
        F.hitstop = Math.max(F.hitstop, 9 / 60);
        setPh(f, 'slung'); F.go(f, 'recover', U.recovery);
        F.ev('feSpin', (f.x + g.x) / 2, (f.y + g.y) / 2, 1, f.i, { move: 'move2', hit: true, held: 1, a });
        return;
      }
      if (f.ph !== 'heave' && f.ph !== 'clawspin' && f.t >= mv.reel + mv.holdT) {
        const a = f.face;
        f.hold = -1; g.hold = -1; F.go(g, 'idle');
        F.hitF(f, g, mv, { dir: a, unblockable: true, hold: true, kd: true, noFlank: true, move: 'move1', dmgMul: f.owned ? mv.owned : 1 });
        if (ln) gone(ln);
        setPh(f, 'fling'); F.go(f, 'recover', mv.recovery);
        F.ev('feFling', g.x, g.y, 0.7, f.i, { move: 'move1', to: g.i });
      }
    },
    end(F, f, o, mv) { letGo(F, f); clamp(F, f, mv); return true; },
    phases: mv => [['clawback', 'wind', mv.startup, 'clawback', `the line turns ${mv.aimTurn} rad/s, locked the last ${mv.lock}`], ['shoot', 'strike', mv.shoot, 'clawshot', `out to ${mv.reach}, ${mv.w * 2} wide`],
      ['reel', 'strike', mv.reel, 'clawshot', 'caught: reeled in'], ['hold', 'strike', mv.holdT, 'clawhold', 'borrowed: held, turning the held way'], ['heave', 'strike', mv.spin.heave, 'clawhold', 'unsafe pressed while he holds them: heaved up'], ['clawspin', 'strike', mv.spin.time, 'whirl', `spun once round in his claw, slammed out (${mv.spin.damage}, down; unsafe's self and cooldown)`], ['slung', 'recover', 'unsafe\'s recovery', 'whirl', ''], ['fling', 'recover', mv.recovery, 'fling', `not pressed: flung, down a short way off (${mv.damage})`], ['clamp', 'recover', mv.clamp, 'clamp', 'missed: open']],
  },
  feLock: {
    can(F, f) { return !mine(F, f, 'felock'); },
    press(F, f, o, mv, c) {
      setPh(f, 'decree');
      const [x, y] = lockSpot(F, f, o, mv, c);
      spawn(F, f, { kind: 'felock', x, y, R: mv.R, ph: 'form', bound: 1 });
      F.ev('feLock', x, y, 0.5, f.i, { move: 'move3' });
    },
    start(F, f) { setPh(f, 'cast'); const rg = mine(F, f, 'felock'); if (rg) rg.bound = 0; },
    phases: mv => [['decree', 'wind', mv.startup, 'decree', 'claws up, a clack (hit him: no ring)'], ['cast', 'strike', mv.active, 'decree', ''], ['cast', 'recover', mv.recovery, 'decree', ''], ['(the ring)', '', mv.form, '', `R ${mv.R}, up to ${mv.range} off him: inside, locked ${mv.lock} s`]],
  },
  feUnsafe: {
    moves: true,
    press(F, f) {   // the twist; out of the shell, the shell stops dead and judders (open: he's coming out)
      const sh = f.shelled; f.shelled = 0;
      if (sh) { setPh(f, 'burst'); f.vx = f.vy = 0; F.ev('feBurst', f.x, f.y, 0.5, f.i, { move: 'move2' }); }
      else { setPh(f, 'brace'); F.ev('feBrace', f.x, f.y, 0.4, f.i, { move: 'move2' }); }
    },
    wind(F, f) { f.vx = f.vy = 0; },
    start(F, f, o, mv) {
      setPh(f, 'spin');
      f.hp = Math.max(1, f.hp - mv.self * F.dmgMul); f.flash = 0.12;
      F.ev('feUnsafe', f.x, f.y, 0.8, f.i, { move: 'move2' });
    },
    step(F, f, o, mv) {
      const u = Math.min(1, f.t / mv.active);
      f.vx = Math.cos(f.face) * mv.drift * (1 - u); f.vy = Math.sin(f.face) * mv.drift * (1 - u);
      if (!f.hit && spin(F, f, o, mv)) { f.hit = true; f.vx = f.vy = 0; setPh(f, 'spun'); F.go(f, 'recover', mv.recovery); }
    },
    end(F, f, o, mv) { f.vx *= 0.3; f.vy *= 0.3; setPh(f, 'spent'); F.go(f, 'recover', mv.miss); F.ev('feSpent', f.x, f.y, 0.4, f.i, { move: 'move2' }); return true; },
    wall(F, f) { f.vx = f.vy = 0; return true; },
    phases: mv => [['brace', 'wind', mv.startup, 'brace', 'twisted back, claws cocked'], ['burst', 'wind', mv.startup, 'shell', 'out of a Shell Tuck instead: the shell stops dead and judders, open'], ['spin', 'strike', mv.active, 'whirl', `one spin, reach ${mv.reach} all round: launches; costs him ${mv.self}`],
      ['spun', 'recover', mv.recovery, 'whirl', 'hit'], ['spent', 'recover', mv.miss, 'dizzy', 'missed: spun past, settling, open']],
  },
  feShell: {
    moves: true,
    start(F, f, o, mv) {
      const c = F.ctl(f), a = c.mag > 0.3 ? c.dirA : toward(o, f), [x, y] = landing(F, f, o, a, mv.dist);
      setPh(f, 'tuck'); f.inv = Math.max(f.inv, 2 / 60);
      f.bx = x; f.by = y; f.vx = (x - f.x) / mv.active; f.vy = (y - f.y) / mv.active;
      F.ev('feTuck', f.x, f.y, 0.5, f.i, { move: 'evade', x2: x, y2: y });
    },
    step(F, f, o, mv, dt) { if (burstOut(F, f)) return; f.inv = Math.max(f.inv, 2 / 60); const left = Math.max(dt, f.dur - f.t + dt); f.vx = (f.bx - f.x) / left; f.vy = (f.by - f.y) / left; },   // (rolled onto the spot: it gets there)
    end(F, f, o, mv) { f.inv = 0; f.vx *= 0.15; f.vy *= 0.15; setPh(f, 'popout'); F.go(f, 'recover', mv.recovery); F.ev('fePop', f.x, f.y, 0.5, f.i, { move: 'evade' }); return true; },
    phases: mv => [['tuck', 'strike', mv.active, 'shell', `rolls ${mv.dist} the held way: untouchable (unsafe now: out of the shell into the spin right there)`], ['popout', 'recover', mv.recovery, 'popout', 'pops out: open']],
  },
};

// where Ownership Lock's ring goes: on them within range, else as far as it reaches toward them; within range and held
// well off them (more than AIM), that way, as far as they are. Kept in the arena by pulling it back along the line to
// him (not toward the middle: near a wall that dropped it under him, which looked like a misaim)
export function lockSpot(F, f, o, mv, c) {
  const D = dist(f, o), at = toward(f, o), d = Math.min(D, mv.range), pad = mv.R * 0.4;
  const ok = (x, y) => sd(F.A.bounds, x, y)[0] < -pad && !F.A.solids.some(s => sd(s, x, y)[0] < 2);
  const along = (a, min) => { for (let r = d; r >= min; r -= 6) { const x = f.x + Math.cos(a) * r, y = f.y + Math.sin(a) * r; if (ok(x, y)) return [x, y]; } return null; };
  // (held away into a wall: if it would land under half their distance off him, at them instead)
  const held = D <= mv.range && c && c.mag > 0.3 && Math.abs(angDiff(c.dirA, at)) > AIM ? along(c.dirA, d / 2) : null;
  return held || along(at, 0) || inside(F, f.x + Math.cos(at) * d, f.y + Math.sin(at) * d, pad);
}

/** @type {Record<string, import('./index.js').ObjStep>} */
const objs = {
  // the claw's line: while he aims (gone if he's hit out of it), out, holding; then drawn back in
  feclaw(F, ob, dt, own) {
    if (ob.ph === 'back') { ob.ext = Math.max(0, ob.ext - 900 * dt); if (ob.ext <= own.r) gone(ob); return; }
    if (!sameGo(own, ob) || !(own.state === 'wind' || own.state === 'strike')) { ob.ph = 'back'; }
  },
  // the chain ring: links forming over form s round the spot; inside when it closes: locked (moves only)
  felock(F, ob, dt, own, foe, M) {
    const mv = M.move3;
    if (ob.ph !== 'form') return;
    if (ob.bound && !(sameGo(own, ob) && own.state === 'wind')) { ob.ph = 'miss'; ob.life = ob.t + 0.25; F.ev('feLockMiss', ob.x, ob.y, 0.3, ob.owner, { move: 'move3', broke: true }); return; }
    if (ob.t < mv.form) return;
    if (open(foe) && !foe.under && foe.inv <= 0 && !['down', 'getup'].includes(foe.state) && Math.hypot(foe.x - ob.x, foe.y - ob.y) <= ob.R) {
      foe.lockT = mv.lock; ob.ph = 'shut'; ob.life = ob.t + 0.4; ob.hit = true;
      for (const b of F.objs) if (b.kind === 'fechain' && b.owner === ob.owner) gone(b);
      spawn(F, own, { kind: 'fechain', x: foe.x, y: foe.y, to: foe.i, bx: foe.x - Math.cos(foe.face) * (foe.r + 12), by: foe.y - Math.sin(foe.face) * (foe.r + 12), ph: 'on', mv: null, life: mv.lock + 2 });
      if (foe.state === 'wind' && foe.move && foe.move !== 'evade') { foe.move = null; foe.ph = ''; F.go(foe, 'idle'); }   // (what they were winding up is gone)
      F.ev('feLocked', foe.x, foe.y, 0.8, ob.owner, { move: 'move3', to: foe.i });
    } else { ob.ph = 'miss'; ob.life = ob.t + 0.3; F.ev('feLockMiss', ob.x, ob.y, 0.3, ob.owner, { move: 'move3' }); }
  },
  // the ball and chain on whoever's locked: their walk dragged to x slow, the ball trailing on its chain behind them;
  // the lock over, it falls off (a moment fading)
  fechain(F, ob, dt, own, foe, M) {
    if (ob.ph === 'off') return;
    if (!(foe.lockT > 0) || foe.state === 'ko') { ob.ph = 'off'; ob.life = ob.t + 0.5; F.ev('feUnchain', ob.bx, ob.by, 0.4, ob.owner, { move: 'move3' }); return; }
    slowWalk(F, foe, own.move === 'move1' && own.homed && (own.state === 'wind' || own.state === 'strike') && own.ph !== 'fling' ? 0 : M.move3.slow, dt);   // (his claw coming: the chain pulled taut)
    ob.x = foe.x; ob.y = foe.y;
    const dx = ob.bx - foe.x, dy = ob.by - foe.y, d = Math.hypot(dx, dy), L = foe.r + 12;   // (the ball dragged along on its chain)
    if (d > L) { ob.bx = foe.x + dx / d * L; ob.by = foe.y + dy / d * L; }
  },
};

// ---------------------------------------------------------------- the bot
/** @type {import('./index.js').BotHooks} */
const ai = {
  want: 140,   // // (close: unsafe is point-blank, the claw still reaches from here)
  // his character (js/fight-style.js): the controller, patient, his Lock out before he commits
  persona: { patient: 0.45, trap: 0.4, traps: [2], trapN: 1, styles: [0.8, 1.6, 1] },
  // Ferris's tells, for the other bot: the claw's line, the chain ring, the whirl coming
  threats(F, i, me, o) {
    const out = [], ow = F.f[1 - i], M = ow.stats.moves;
    for (const b of F.objs) {
      if (b.owner === i || b.t < o.age || b.t >= b.life) continue;
      if (b.kind === 'feclaw' && (b.ph === 'aim' || b.ph === 'shoot')) {
        const x1 = b.x + Math.cos(b.a) * b.len, y1 = b.y + Math.sin(b.a) * b.len, [lat, u] = segDist(me.x, me.y, b.x, b.y, x1, y1);
        const need = b.w + me.r + (b.lock ? 6 : 22) - lat;   // (not locked yet: it follows, so well clear)
        if (need <= 0 || u >= 0.999) continue;
        const side = Math.sign(Math.sin(Math.atan2(me.y - b.y, me.x - b.x) - b.a)) || 1;
        const T = (b.ph === 'aim' && ow.state === 'wind' ? Math.max(0, ow.dur - ow.t) : 0) + u * b.len / (M.move1.reach / M.move1.shoot);
        out.push(['c' + b.id, T, 0.06, b.a + side * Math.PI / 2, need]);
      } else if (b.kind === 'felock' && b.ph === 'form') {
        const need = b.R + 6 - Math.hypot(me.x - b.x, me.y - b.y);
        if (need > 0) out.push(['l' + b.id, Math.max(0, M.move3.form - b.t), 0.05, Math.atan2(me.y - b.y, me.x - b.x), need]);
      }
    }
    // unsafe: a hit all round him, no floor tell. His twist seen (late, at human speed, so spacing is the real answer):
    // back out of reach
    const mv = M.move2, d = Math.hypot(me.x - o.x, me.y - o.y), need = ow.r + me.r + mv.reach + 10 - d;
    if (need > 0 && o.move === 'move2' && (o.state === 'wind' || o.state === 'strike')) out.push(['h' + Math.round((o.T - o.t) * 60), o.state === 'wind' ? Math.max(0, o.left) : 0, o.state === 'wind' ? mv.active : Math.max(0.02, o.left), Math.atan2(me.y - o.y, me.x - o.x), need]);
    // his shell rolling in (seen late: o): unsafe can burst out where it stops. Back off out of reach of the end of its
    // roll
    if (o.move === 'evade' && o.state === 'strike' && o.ph === 'tuck') {
      const left = Math.max(0, o.left), ex = o.x + o.vx * left, ey = o.y + o.vy * left, n2 = ow.r + me.r + mv.reach + 12 - Math.hypot(me.x - ex, me.y - ey);
      if (n2 > 0) out.push(['s' + Math.round((o.T - o.t) * 60), Math.min(left, mv.startup), mv.active + 0.05, Math.atan2(me.y - ey, me.x - ex), n2, 1]);   // (soft: a burst that may come)
    }
    return out;
  },
  // in his own moves: the claw aimed at where they'll be, the borrowed one flung at the nearest wall
  stick(F, i, me, o, C) {
    if (me.move === 'evade' && me.ph === 'tuck') {   // Shell then unsafe: decided once a roll (the human way: C.link); once they're in reach, out of the shell
      const K = C.K, mv = me.stats.moves.move2, gap = Math.hypot(o.x - me.x, o.y - me.y) - me.r - o.r;
      if (K.feFor !== me.ms) { K.feFor = me.ms; K.feOut = C.ready(1) && C.link(0.25 + 0.6 * C.L.combo); }
      if (K.feOut && C.ready(1) && me.t > 0.06 && gap < mv.reach - 2 && open(o) && !['down', 'getup'].includes(o.state)) { K.feOut = false; C.fire(1); }
      return [0, 0];
    }
    if (me.ph === 'clawback') { const a = botAim(C, me, o, Math.max(0, me.dur - me.t) + me.stats.moves.move1.shoot); return [Math.cos(a), Math.sin(a)]; }
    if (me.ph === 'reel' || me.ph === 'hold') {
      // caught someone: the spin with them in the claw, decided once a catch (higher levels more reliably; C.link),
      // pressed a moment into the hold (a person's reaction time)
      const K = C.K;
      if (K.feSpinFor !== me.ms) { K.feSpinFor = me.ms; K.feSpinGo = C.ready(1) && C.link(0.5 + 0.45 * C.L.combo); }
      if (K.feSpinGo && me.ph === 'hold' && C.ready(1)) { K.feSpinGo = false; C.fire(1); return [0, 0]; }
      const g = C.live, oc = clearance(C.g.A, g.x, g.y, g.r);
      if (oc.d < 170) return [-oc.nx, -oc.ny];
      return [Math.cos(me.face), Math.sin(me.face)];
    }
    return [0, 0];
  },
  punish(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap, toFoe } = C.g;
    if (C.ready(1) && gap < M.move2.reach + 2 && w.fits(M.move2.startup + 0.04)) { C.fire(1); return C.unit(toFoe); }   // (right there: the spin)
    if (C.ready(1) && gap < 80 && w.b > (gap - M.move2.reach + 4) / (150 * me.stats.walk) + M.move2.startup + 0.15 && C.rng() < 0.3 + 0.5 * C.L.smart) return C.unit(toFoe);   // (open a while: walk in, the next think throws it)
    if (C.ready(0) && w.line && gap < M.move1.reach - 6 && w.fits(M.move1.startup + gap / (M.move1.reach / M.move1.shoot))) { C.fire(0); return C.unit(botAim(C, me, o, M.move1.startup + M.move1.shoot)); }   // (aimed a little off: botAim)
    if (C.ready(2) && w.b > M.move3.form + 0.1 && d < 300) { C.fire(2); return [0, 0]; }
    return null;
  },
  neutral(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap, toFoe } = C.g;
    const locked = (C.live.lockT || 0) > M.move1.startup + 0.1, ring = F.objs.some(b => b.kind === 'felock' && b.owner === i && b.ph === 'form');
    // locked: the claw (it homes on them), walking into its reach; the ring forming: the claw kept for it
    if (locked && C.ready(0)) {
      if (w.line && gap < M.move1.reach - 12) w.add(0, 0.9, C.unit(toFoe));
      return C.unit(toFoe);
    }
    w.add(0, w.line && gap < M.move1.reach - 10 && gap > 20 && !ring ? (locked || w.busy ? 0.45 : gap < 110 ? 0.12 : 0.07) : 0, C.unit(botAim(C, me, o, M.move1.startup + M.move1.shoot)));
    w.add(2, d < 320 && !locked ? (w.busy ? 0.4 : (me.cd[0] || 0) < M.move3.form ? 0.22 * (0.6 + (C.L.setup ?? 0.5)) : 0.06) : 0, [0, 0]);   // // (C.L.setup: keener on setups; the opener: mostly with the claw back by the time it closes)
    w.add(1, gap < M.move2.reach ? (locked || w.busy || w.spent ? 0.55 : 0.32) : 0, C.unit(toFoe));   // (point-blank only)
    // a roll in at them, the shell stopping by them (unsafe bursts out of it: stick), when the spin is ready
    w.add(3, C.ready(1) && gap > 40 && gap < M.evade.dist + 10 && !w.busy ? 0.05 + 0.07 * C.L.combo : 0, C.unit(toFoe));
  },
  evadeWhen(T, dur, E) { return [T > 0.02 && T + dur < E.active - 0.04, T + dur < E.active - 0.04]; },
};

export default { id: ID, fighter, kits, objs, ai };
