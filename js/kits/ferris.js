// Ferris (Rust) for Fight, rebuilt 2026-10-24 (three big moves and an evade: js/kits/index.js has the plug-in shape, the
// drawing is js/art/kit-ferris.js). The safe, sturdy crab: ownership and borrowing.
//   move1 Borrow Claw (feClaw, hold to aim): he cocks a claw back and it snaps out a long way along a line on a springy
//         arm; it catches the foe, reels them in, holds them "borrowed" a moment, then flings them (the held way).
//         Tell: the claw opening wide and a scuffed track along the floor where it'll go (it stops turning just before
//         it shoots). Answer: step out of the line (or evade). A miss leaves the claw clamped shut on nothing: open.
//   move2 Ownership Lock (feLock): a quick clack of his claws, and a ring of chain links forms round the foe's spot. Still
//         inside when it closes: locked, no moves for a while (walking and the evade still work). Ferris is free while
//         it forms. Tell: the links forming one by one. Answer: walk out before it closes.
//   move3 unsafe { } (feUnsafe): he winds up, rattling, then goes berserk: a spinning whirl of claws that drives at the
//         foe, hitting again and again, the last spin floors them. It costs him a little health, and he's dizzy after.
//         Tell: the rattle and the dust swirling at his feet. Answer: evade it (or be faster), then punish the dizzy.
//   evade Shell Tuck (feShell): tucks into his shell and rolls a way the held way (none: away), untouchable, then pops out.
// Phases (f.ph): clawback, shoot, reel, hold, fling / clamp · decree, cast · rev, whirl, dizzy · tuck, popout. Objects:
// feclaw (the claw's line: a, len (from his middle), w, ext (how far out it is now), ph 'aim' | 'shoot' | 'hold' | 'back',
// lock 0/1), felock (the chain ring: R, ph 'form' | 'shut' | 'miss'). The foe while held: state 'grabbed' (hold: Ferris);
// locked: lockT > 0. Events: feCatch (to), feFling, feClamp, feLock (the ring starts), feLocked (to), feLockMiss,
// feUnsafe (self), feSpin (a hit of the whirl), feDizzy, feTuck (x2, y2), fePop.
import { clearance, rayClear } from '../fight-arenas.js';
import { AIM, angDiff, dist, gone, inside, landing, mine, open, sameGo, segDist, setPh, spawn, toward, turnTo } from './lib.js';

const ID = 'ferris';
const fighter = {
  id: ID, name: 'Ferris', lang: 'Rust', role: 'Controller', kit3: true,
  blurb: 'A safe, sturdy crab who owns the space round him: a claw that borrows you from across the arena, chains that lock your moves, and an unsafe whirl of claws.',
  passive: 'Sturdy: the heaviest shell in the fight after Tux, hard to push about.',
  balance: 'Not tuned for balance yet (2026-10-24, the user: "dont even think about balancing for now").',
  hp: 120, weight: 1.22, walk: 0.98, accel: 26, friction: 28, kbDecay: 3, radius: 19, slipMul: 0.2, reachBar: 0.9, powerBar: 0.72,
  moves: {
    move1: { name: 'Borrow Claw', short: 'Borrow', do: 'feClaw', icon: 'feClaw', hold: 'aim',
      blurb: 'His claw snaps out a long way on a springy arm, catches you, reels you in and holds you borrowed, then flings you.',
      tell: 'The claw opens wide and a scuffed track shows on the floor where it\'ll go.',
      answer: 'Step out of the line (it stops turning just before it shoots), or evade. Missing, the claw clamps shut on nothing: he\'s open.',
      // the cock (startup): the line turns aimTurn rad/s the held way (else at them) until lock s before it shoots; out
      // over shoot s to reach (from his edge, half-width w); caught: reeled in over reel s, held hold s, flung (damage,
      // kb, down) the held way; a miss: clamp s open
      startup: 0.5, active: 0.14, recovery: 0.32, clamp: 0.6, cooldown: 1.5,
      damage: 17, kb: 250, kd: true, reach: 150, w: 12, lock: 0.22, aimTurn: 1.6, shoot: 0.14, reel: 0.18, hold: 0.5 },
    move2: { name: 'Ownership Lock', short: 'Lock', do: 'feLock', icon: 'feLock', hold: null,
      blurb: 'A clack of his claws, and a ring of chain links forms round your feet. Still inside when it closes and your moves are locked for a while.',
      tell: 'Chain links forming in a ring round you, one by one.',
      answer: 'Walk out before it closes. Locked, you can still walk and evade (and a move you were winding up is gone).',
      // the clack (startup); the ring (R round their spot) forms over form s from the press; inside then: locked lock s
      startup: 0.28, active: 0.05, recovery: 0.3, cooldown: 3.6,
      R: 50, form: 0.85, lock: 1.6 },
    move3: { name: 'unsafe { }', short: 'unsafe', do: 'feUnsafe', icon: 'feUnsafe', hold: null,
      blurb: 'Goes berserk: a spinning whirl of claws that drives at you, hitting again and again; the last spin floors you. It hurts him a little too.',
      tell: 'He rattles in place, dust swirling round his feet.',
      answer: 'Evade the whirl (or outrun it), then punish: he\'s dizzy after.',
      // the rattle (startup), then the whirl for active s: speed u/s at them, turning turn rad/s; a hit every tick s in
      // reach (hit), the n-th or the end's one in reach the last (down); self: his own health it costs; dizzy s after
      startup: 0.42, active: 1.2, recovery: 1.0, cooldown: 4.2, contact: true,
      speed: 170, turn: 2.6, reach: 14, tick: 0.22, n: 4, self: 6, dizzy: 1.0,
      hit: { damage: 4.5, kb: 80, stun: 0.3 }, last: { damage: 10, kb: 240, kd: true } },
    evade: { name: 'Shell Tuck', short: 'Shell', do: 'feShell', icon: 'feShell', hold: null,
      blurb: 'Tucks into his shell and rolls a way the held way (or away from you), untouchable while he rolls.',
      tell: 'A rolling shell.', answer: 'Meet him where he pops out: he\'s open for a moment.',
      startup: 0, active: 0.38, recovery: 0.24, cooldown: 2, dist: 120 },
  },
  phPose: { clawback: 'clawback', shoot: 'clawshot', reel: 'clawshot', hold: 'clawhold', fling: 'fling', clamp: 'clamp', decree: 'decree', cast: 'decree', rev: 'rev', whirl: 'whirl', dizzy: 'dizzy', tuck: 'shell', popout: 'popout' },
  phFade: ['fling', 'cast', 'popout'],
  show: ['stand', 'clawback', 'stand', 'decree', 'stand', 'whirl', 'stand', 'shell'], cheer: 'decree',
};
const P = (a, b, inp) => [a, b, inp];
fighter.clips = {
  move1: { x: [-110, 40], len: 2.6, cam: { x: -20, w: 320 }, a: [P(0.3, 0.38, { light: 1 })] },
  move2: { x: [-90, 40], len: 2.8, cam: { x: -10, w: 290 }, a: [P(0.3, 0.38, { heavy: 1 }), P(1.4, 1.48, { light: 1 })] },   // (locked: then the claw)
  move3: { x: [-90, 40], len: 2.8, cam: { x: -10, w: 290 }, a: [P(0.3, 0.38, { special: 1 })] },
  evade: { x: [-40, 110], len: 2.4, cam: { x: 10, w: 300 }, a: [P(0.82, 0.88, { guard: 1, x: 0, y: -1 })], b: [P(0.3, 0.38, { light: 1 })] },   // (rolled out of Tux's toboggan)
};

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
// the whirl's hit (sub: a tick, or the last): true if it connected
function spin(F, f, o, mv, sub) {
  if (!open(o) || o.under || dist(f, o) - f.r - o.r > mv.reach) return false;
  const ok = F.hitF(f, o, sub, { dir: toward(f, o), move: 'move3' });
  if (ok) F.ev('feSpin', (f.x + o.x) / 2, (f.y + o.y) / 2, sub === mv.last ? 0.8 : 0.4, f.i, { move: 'move3', last: sub === mv.last });
  return ok;
}
function dizzy(F, f, mv) { setPh(f, 'dizzy'); f.vx *= 0.3; f.vy *= 0.3; F.go(f, 'recover', mv.dizzy); F.ev('feDizzy', f.x, f.y, 0.4, f.i, { move: 'move3' }); }

const kits = {
  feClaw: {
    moves: true,
    press(F, f) {
      setPh(f, 'clawback');
      spawn(F, f, { kind: 'feclaw', a: f.face, len: f.r + f.stats.moves.move1.reach, w: f.stats.moves.move1.w, ext: 0, ph: 'aim', lock: 0 });
    },
    wind(F, f, o, mv, dt, c) {   // turning the held way (else at them) until the lock, the line with him
      const ln = mine(F, f, 'feclaw');
      if (f.t < f.dur - mv.lock) f.face = turnTo(f.face, c.mag > 0.3 && Math.abs(angDiff(c.dirA, toward(f, o))) < Math.PI * 0.75 ? c.dirA : toward(f, o), mv.aimTurn * dt);
      else if (ln) ln.lock = 1;
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
        if (d <= mv.w + o.r && open(o) && o.inv <= 0 && !o.under && o.hold < 0 && !['down', 'getup', 'grabbed'].includes(o.state)
          && rayClear(F.A, f.x, f.y, f.face, Math.max(0, dist(f, o) - o.r), 2)) {
          // caught: borrowed (held in the claw, reeled in)
          F.release(o); o.move = null; o.charge = 0; o.ph = ''; o.vx = o.vy = 0;
          f.hold = o.i; o.hold = f.i; F.go(o, 'grabbed'); f.hit = true; f.gd0 = dist(f, o);
          setPh(f, 'reel'); F.go(f, 'strike', mv.reel + mv.hold + 0.1);
          if (ln) ln.ph = 'hold';
          F.ev('feCatch', o.x, o.y, 0.7, f.i, { move: 'move1', to: o.i });
        } else if (u >= 1) clamp(F, f, mv);
        return;
      }
      // reeling in, then holding: the borrowed one just in front of him; then the fling
      const g = F.f[f.hold];
      if (!g || g.state !== 'grabbed') { letGo(F, f); clamp(F, f, mv); return; }
      const snug = f.r + g.r + 4, gd = snug + Math.max(0, f.gd0 - snug) * Math.max(0, 1 - f.t / mv.reel);
      if (f.ph === 'reel' && f.t >= mv.reel) setPh(f, 'hold');
      if (f.ph === 'hold' && c.mag > 0.3) f.face = turnTo(f.face, c.dirA, 6 * dt);   // (turning to fling it the held way)
      g.x = f.x + Math.cos(f.face) * gd; g.y = f.y + Math.sin(f.face) * gd; g.vx = g.vy = 0; g.z = 0; F.keepIn(g);
      if (ln) { ln.ext = gd; ln.a = f.face; }
      if (f.t >= mv.reel + mv.hold) {
        const a = f.face;
        f.hold = -1; g.hold = -1; F.go(g, 'idle');
        F.hitF(f, g, mv, { dir: a, unblockable: true, hold: true, kd: true, noFlank: true, move: 'move1' });
        if (ln) gone(ln);
        setPh(f, 'fling'); F.go(f, 'recover', mv.recovery);
        F.ev('feFling', g.x, g.y, 0.7, f.i, { move: 'move1', to: g.i });
      }
    },
    end(F, f, o, mv) { letGo(F, f); clamp(F, f, mv); return true; },
    phases: mv => [['clawback', 'wind', mv.startup, 'clawback', `the line turns ${mv.aimTurn} rad/s, locked the last ${mv.lock}`], ['shoot', 'strike', mv.shoot, 'clawshot', `out to ${mv.reach}, ${mv.w * 2} wide`],
      ['reel', 'strike', mv.reel, 'clawshot', 'caught: reeled in'], ['hold', 'strike', mv.hold, 'clawhold', 'borrowed: held, turning the held way'], ['fling', 'recover', mv.recovery, 'fling', 'flung'], ['clamp', 'recover', mv.clamp, 'clamp', 'missed: open']],
  },
  feLock: {
    can(F, f) { return !mine(F, f, 'felock'); },
    press(F, f, o, mv, c) {
      setPh(f, 'decree');
      let x = o.x, y = o.y;
      if (c.mag > 0.3 && Math.abs(angDiff(c.dirA, toward(f, o))) > AIM) { x = f.x + Math.cos(c.dirA) * 110; y = f.y + Math.sin(c.dirA) * 110; }   // (held well off them: that way)
      [x, y] = inside(F, x, y, mv.R * 0.4);
      spawn(F, f, { kind: 'felock', x, y, R: mv.R, ph: 'form', bound: 1 });
      F.ev('feLock', x, y, 0.5, f.i, { move: 'move2' });
    },
    start(F, f) { setPh(f, 'cast'); const rg = mine(F, f, 'felock'); if (rg) rg.bound = 0; },
    phases: mv => [['decree', 'wind', mv.startup, 'decree', 'claws up, a clack (hit him: no ring)'], ['cast', 'strike', mv.active, 'decree', ''], ['cast', 'recover', mv.recovery, 'decree', ''], ['(the ring)', '', mv.form, '', `R ${mv.R}: inside, locked ${mv.lock} s`]],
  },
  feUnsafe: {
    moves: true,
    press(F, f) { setPh(f, 'rev'); },
    wind(F, f, o) { f.vx = f.vy = 0; f.face = turnTo(f.face, toward(f, o), 0.2); },
    start(F, f, o, mv) {
      setPh(f, 'whirl'); f.tick = mv.tick * 0.5; f.seg = 0;
      f.hp = Math.max(1, f.hp - mv.self * F.dmgMul); f.flash = 0.12;
      F.ev('feUnsafe', f.x, f.y, 0.8, f.i, { move: 'move3' });
    },
    step(F, f, o, mv, dt) {
      if (o.state !== 'ko') f.face = turnTo(f.face, toward(f, o), mv.turn * dt);
      f.vx = Math.cos(f.face) * mv.speed; f.vy = Math.sin(f.face) * mv.speed;
      f.tick -= dt;
      if (f.tick <= 0) {
        f.tick += mv.tick;
        const last = f.seg >= mv.n - 1;
        if (spin(F, f, o, mv, last ? mv.last : mv.hit)) { f.seg++; f.hit = true; if (last && f.state === 'strike') dizzy(F, f, mv); }
      }
    },
    end(F, f, o, mv) { if (f.seg < mv.n) spin(F, f, o, mv, mv.last); if (f.state === 'strike') dizzy(F, f, mv); return true; },
    phases: mv => [['rev', 'wind', mv.startup, 'rev', 'rattling'], ['whirl', 'strike', mv.active, 'whirl', `${mv.speed} u/s at them; a hit every ${mv.tick} s in reach ${mv.reach}, the ${mv.n}th (or the end's) knocks down; costs him ${mv.self}`],
      ['dizzy', 'recover', mv.dizzy, 'dizzy', 'dizzy: open']],
  },
  feShell: {
    moves: true,
    start(F, f, o, mv) {
      const c = F.ctl(f), a = c.mag > 0.3 ? c.dirA : toward(o, f), [x, y] = landing(F, f, o, a, mv.dist);
      setPh(f, 'tuck'); f.inv = Math.max(f.inv, 2 / 60);
      f.bx = x; f.by = y; f.vx = (x - f.x) / mv.active; f.vy = (y - f.y) / mv.active;
      F.ev('feTuck', f.x, f.y, 0.5, f.i, { move: 'evade', x2: x, y2: y });
    },
    step(F, f, o, mv, dt) { f.inv = Math.max(f.inv, 2 / 60); const left = Math.max(dt, f.dur - f.t + dt); f.vx = (f.bx - f.x) / left; f.vy = (f.by - f.y) / left; },   // (rolled onto the spot: it gets there)
    end(F, f, o, mv) { f.inv = 0; f.vx *= 0.15; f.vy *= 0.15; setPh(f, 'popout'); F.go(f, 'recover', mv.recovery); F.ev('fePop', f.x, f.y, 0.5, f.i, { move: 'evade' }); return true; },
    phases: mv => [['tuck', 'strike', mv.active, 'shell', `rolls ${mv.dist} the held way: untouchable`], ['popout', 'recover', mv.recovery, 'popout', 'pops out: open']],
  },
};

const objs = {
  // the claw's line: while he aims (gone if he's hit out of it), out, holding; then drawn back in
  feclaw(F, ob, dt, own) {
    if (ob.ph === 'back') { ob.ext = Math.max(0, ob.ext - 900 * dt); if (ob.ext <= own.r) gone(ob); return; }
    if (!sameGo(own, ob) || !(own.state === 'wind' || own.state === 'strike')) { ob.ph = 'back'; }
  },
  // the chain ring: links forming over form s round the spot; inside when it closes: locked (moves only)
  felock(F, ob, dt, own, foe, M) {
    const mv = M.move2;
    if (ob.ph !== 'form') return;
    if (ob.bound && !(sameGo(own, ob) && own.state === 'wind')) { ob.ph = 'miss'; ob.life = ob.t + 0.25; F.ev('feLockMiss', ob.x, ob.y, 0.3, ob.owner, { move: 'move2', broke: true }); return; }
    if (ob.t < mv.form) return;
    if (open(foe) && !foe.under && foe.inv <= 0 && !['down', 'getup'].includes(foe.state) && Math.hypot(foe.x - ob.x, foe.y - ob.y) <= ob.R) {
      foe.lockT = mv.lock; ob.ph = 'shut'; ob.life = ob.t + 0.4; ob.hit = true;
      if (foe.state === 'wind' && foe.move && foe.move !== 'evade') { foe.move = null; foe.ph = ''; foe.charge = 0; F.go(foe, 'idle'); }   // (what they were winding up is gone)
      F.ev('feLocked', foe.x, foe.y, 0.8, ob.owner, { move: 'move2', to: foe.i });
    } else { ob.ph = 'miss'; ob.life = ob.t + 0.3; F.ev('feLockMiss', ob.x, ob.y, 0.3, ob.owner, { move: 'move2' }); }
  },
};

// ---------------------------------------------------------------- the bot
const ai = {
  want: 125,
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
        if (need > 0) out.push(['l' + b.id, Math.max(0, M.move2.form - b.t), 0.05, Math.atan2(me.y - b.y, me.x - b.x), need]);
      }
    }
    // the whirl: it chases, so walking only works for the quick (a long way out); else the evade as it arrives
    if (o.move === 'move3' && (o.state === 'wind' || (o.state === 'strike' && o.ph === 'whirl'))) {
      const gap = Math.hypot(me.x - o.x, me.y - o.y) - me.r - ow.r, mv = M.move3, close = Math.max(0, gap - mv.reach);
      const T = (o.state === 'wind' ? Math.max(0, o.left) : 0) + close / Math.max(20, mv.speed - (me.stats.walk * 150 > mv.speed ? 0 : 40));
      const fast = me.stats.walk * 150 > mv.speed + 20;
      out.push(['u' + o.T, T, Math.min(0.5, o.state === 'strike' ? Math.max(0.1, o.left) : mv.active), Math.atan2(me.y - o.y, me.x - o.x), fast ? mv.reach + 40 - gap : 400]);
    }
    return out;
  },
  // in his own moves: the claw aimed at where they'll be, the borrowed one flung at the nearest wall
  stick(F, i, me, o, C) {
    if (me.ph === 'clawback') { const t = Math.max(0, me.dur - me.t), x = o.x + o.vx * t * 0.6, y = o.y + o.vy * t * 0.6, a = Math.atan2(y - me.y, x - me.x); return [Math.cos(a), Math.sin(a)]; }
    if (me.ph === 'reel' || me.ph === 'hold') {
      const g = C.live, oc = clearance(C.g.A, g.x, g.y, g.r);
      if (oc.d < 170) return [-oc.nx, -oc.ny];
      return [Math.cos(me.face), Math.sin(me.face)];
    }
    return [0, 0];
  },
  punish(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap, toFoe } = C.g;
    if (C.ready(0) && w.line && gap < M.move1.reach - 6 && w.fits(M.move1.startup + gap / (M.move1.reach / M.move1.shoot))) { C.fire(0); return C.unit(toFoe); }
    if (C.ready(2) && gap < 60 && w.fits(M.move3.startup + Math.max(0, gap - M.move3.reach) / M.move3.speed + 0.05)) { C.fire(2); return C.unit(toFoe); }
    if (C.ready(1) && w.b > M.move2.form + 0.1 && d < 300) { C.fire(1); return [0, 0]; }
    return null;
  },
  neutral(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap, toFoe } = C.g;
    const locked = (C.live.lockT || 0) > 0.4, ring = F.objs.some(b => b.kind === 'felock' && b.owner === i && b.ph === 'form');
    w.add(0, w.line && gap < M.move1.reach - 10 && gap > 20 ? (ring || locked || w.busy ? 0.4 : 0.14) : 0, C.unit(toFoe));
    w.add(1, d < 320 && !locked ? (w.busy ? 0.4 : 0.12) : 0, [0, 0]);
    w.add(2, gap < 80 ? (locked || w.spent ? 0.35 : 0.07) : 0, C.unit(toFoe));
  },
  evadeWhen(T, dur, E) { return [T > 0.02 && T + dur < E.active - 0.04, T + dur < E.active - 0.04]; },
};

export default { id: ID, fighter, kits, objs, ai };
