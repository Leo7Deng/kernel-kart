// Pyth (Python) in Fight mode (2026-10-24): the long, reaching snake. Everything he does works from further out than
// anyone else, and each of it shows it's coming as part of the floor (drawn by js/art/kit-pyth.js):
//   move1 Coil (pyCoil)            rears up hissing (a soft S-shaped scuff runs out along the line), lunges along it and
//                                  wraps up whoever it touches: squeezes them a few times, then tosses them down the held
//                                  way. Answer: step off the line, or evade. Missing, he's left sprawled out, open
//   move2 import antigravity (pyAnti)  a soft warm glow under them; still on it when it's done, they float up helpless
//                                  ('float', fight.js) for a moment while he follows up. Answer: walk off the glow (or hit
//                                  him during his short cast: it fizzles)
//   move3 Indentation Whip (pyWhip) the tail pulls back while a faint swept band shows its arc, then sweeps it: a huge
//                                  reach, and the tip knocks down. Answer: get inside it (hug him) or outside it, or evade
//   evade Slither (pySlither)      a fast low slide the held way (none held: sideways round them), untouchable for it
// Objects (plain data, carried online): pyHiss (the Coil's line: x, y, a, len, reach, ph 'aim' | 'go'), pyGlow (x, y, r,
// ph 'cast' | 'grow' | 'lift' | 'fizz', to), pyArc (x, y, a, r0, r1, arc, side, ph 'aim' | 'go', s the sweep's angle).
// Events: pyRear, pyLunge, pyCatch, pySqueeze, pyToss, pySprawl, pyCast, pyLift, pyFizzle, pyWhip, pySlither.
// DOM-free, deterministic.
import { clearance } from '../fight-arenas.js';
import { D2R, angDiff, angMid, clamp, dist, gone, inside, landing, mine, sameGo, segDist, setPh, spawn, toward, turnTo } from './lib.js';

const ID = 'pyth';
const NOGRAB = new Set(['ko', 'down', 'getup', 'grabbed', 'frozen']);
const fighter = {
  id: ID, name: 'Pyth', lang: 'Python', role: 'Long reach', kit3: true,
  blurb: 'A long snake who fights from further away than anyone: lunges across the room to wrap you up, floats you off the floor, and sweeps a huge arc with his tail.',
  passive: 'Long reach: every one of his moves works from further out than anyone else\'s.',
  balance: 'Not tuned for balance yet (2026-10-24, the user: "dont even think about balancing for now").',
  hp: 104, weight: 0.86, walk: 1.15, accel: 30, friction: 30, kbDecay: 3.2, radius: 15, slipMul: 0.22, reachBar: 1,
  moves: {
    move1: { name: 'Coil', short: 'Coil', do: 'pyCoil', icon: 'pyCoil', hold: 'aim',
      blurb: 'Rears up hissing, then lunges a long way along a line: whoever it touches gets wrapped up, squeezed and tossed down.',
      tell: 'He rears up hissing, and a soft S-shaped scuff runs out along the floor where he\'ll strike.',
      answer: 'Step off the line, or evade the lunge. Missing, he\'s left sprawled out on the floor, open.',
      // the rear (startup: turning aimTurn rad/s the held way, else at them), the lunge (out s to full reach, sliding
      // slide u/s), the bite (a touch: a hit, so an evade or Tux's ice beats it), then the wrap: pulled in, squeezed ticks
      // times (squeeze each, never the last point of health), tossed the held way after wrapT s (toss: knocks down)
      startup: 0.42, active: 0.24, recovery: 0.32, miss: 0.6, cooldown: 1.4, damage: 18, kb: 240, kd: true,
      reach: 84, width: 7, out: 0.16, slide: 120, aimTurn: 2.2, wrapT: 0.95, ticks: 4, every: 0.22, squeeze: 2,
      bite: { damage: 2, kb: 0, stun: 0.2, kind: 'special', prio: 2, stale: false },
      toss: { damage: 8, kb: 240, kd: true, kind: 'special', prio: 2, stale: false } },
    move2: { name: 'import antigravity', short: 'antigravity', do: 'pyAnti', icon: 'pyAnti', hold: null,
      blurb: 'A soft warm glow under them: still on it when it\'s done, they float up off the floor, helpless, while he follows up.',
      tell: 'A soft warm glow spreads on the floor under you, little motes rising off it.',
      answer: 'Walk off the glow before it\'s done, or hit him while he casts it.',
      // the glow appears at the press on them (at most range away), kept inside the arena; delay s later, anyone in r (to
      // their middle, + half their radius) takes the lift's small hit and floats float s at h up ('float': helpless, hits
      // on them don't knock down); one glow at a time
      startup: 0.22, active: 0.05, recovery: 0.3, cooldown: 2.6, damage: 4, kb: 0, stun: 0.2,
      r: 38, delay: 0.75, range: 240, float: 1.2, h: 16 },
    move3: { name: 'Indentation Whip', short: 'Whip', do: 'pyWhip', icon: 'pyWhip', hold: null,
      blurb: 'The tail pulls back, then sweeps a huge arc in front of him: the longest reach in the game, and the tip knocks down.',
      tell: 'The tail pulls back and a faint swept band shows the arc on the floor, darker toward its edge.',
      answer: 'Get inside it (right up against him) or outside it, or evade. He\'s open while the tail comes back.',
      // the pull (startup, turning aimTurn rad/s at them), the sweep (active: arc degrees, from one side to the other),
      // hitting between r0 and r1 from his middle; the last tipW of it is the tip (tip: knocks down)
      startup: 0.45, active: 0.22, recovery: 0.42, cooldown: 1.5, damage: 8, kb: 170, stun: 0.35,
      r0: 52, r1: 150, tipW: 38, arc: 170, aimTurn: 1.6,
      tip: { damage: 14, kb: 230, kd: true, kind: 'special', prio: 2, stale: false } },
    evade: { name: 'Slither', short: 'Slither', do: 'pySlither', icon: 'pySlither', hold: null,
      blurb: 'A fast low slide the way you hold (none held: sideways round them), untouchable while he slides.',
      tell: 'None: it\'s quick. Its cooldown shows on his key.', answer: 'He\'s open for a moment as he coils back up: bait it, then commit.',
      // dist units the held way (none: sideways, the roomier side) over active s, untouchable all of it; recovery s open
      startup: 0, active: 0.22, recovery: 0.2, cooldown: 1.5, dist: 140 },
  },
  // the 3D pose for each phase (model3d.js PYTH_POSES)
  phPose: { rear: 'rear', lunge: 'lunge', wrap: 'wrap', toss: 'toss', sprawl: 'sprawl', cast: 'cast', pull: 'pull', whip: 'whip', recoil: 'whip',
    slither: 'slither', coilup: 'coil' },
  phFade: ['toss', 'cast', 'recoil', 'coilup'],
  // pyT the squeeze's clock, pyN squeezes so far, pyG how far off he caught them, pyS the sweep's last angle (from its
  // start, signed), pyW the next sweep's side (+1 / -1: it alternates), pyX / pyY where the slither lands
  fields: { pyT: 0, pyN: 0, pyG: 0, pyS: 0, pyW: 1, pyX: 0, pyY: 0 },
  show: ['stand', 'rear', 'stand', 'cast', 'stand', 'pull', 'stand', 'lunge'], cheer: 'rear',
};
const P = (a, b, inp) => [a, b, inp];
fighter.clips = {
  move1: { x: [-100, 30], len: 2.8, cam: { x: -25, w: 290 }, a: [P(0.3, 0.38, { light: 1 }), P(0.9, 1.7, { x: 1, y: 0 })] },
  move2: { x: [-90, 60], len: 3, cam: { x: -15, w: 290 }, a: [P(0.3, 0.38, { heavy: 1 }), P(1.35, 1.43, { special: 1 })] },   // (and the whip at them, afloat)
  move3: { x: [-80, 40], len: 2.4, cam: { x: -10, w: 300 }, a: [P(0.3, 0.38, { special: 1 })] },
  evade: { x: [-30, 110], len: 2.4, cam: { x: 20, w: 300 }, a: [P(0.62, 0.68, { guard: 1, x: 0, y: -1 })], b: [P(0.3, 0.38, { light: 1 })] },   // (out of Tux's toboggan)
};

// ---------------------------------------------------------------- the moves
const easeOut = u => 1 - (1 - u) * (1 - u);
// the Coil's head right now: how far out from his middle (it shoots out over `out`, then holds)
const headOut = (f, mv) => f.r + mv.reach * easeOut(clamp(f.t / mv.out, 0, 1));
function sprawl(F, f, mv) {
  setPh(f, 'sprawl'); F.go(f, 'recover', mv.miss); f.vx *= 0.3; f.vy *= 0.3;
  F.ev('pySprawl', f.x + Math.cos(f.face) * 40, f.y + Math.sin(f.face) * 40, 0.4, f.i, { move: 'move1' });
}
// a squeeze: a little damage straight off them (never the last point: the toss is what knocks out)
function squeeze(F, f, g, mv) {
  const d = Math.max(0, Math.min(mv.squeeze * F.dmgMul, g.hp - 1));
  if (d > 0) { g.hp -= d; g.flash = 0.12; }
  F.ev('pySqueeze', g.x, g.y, 0.4, f.i, { move: 'move1', to: g.i, dmg: d });
}

const kits = {
  pyCoil: {
    moves: true,
    press(F, f, o, mv) {
      setPh(f, 'rear');
      spawn(F, f, { kind: 'pyHiss', a: f.face, len: 0, reach: f.r + mv.reach + mv.slide * mv.out, ph: 'aim' });
      F.ev('pyRear', f.x, f.y, 0.4, f.i, { move: 'move1' });
    },
    wind(F, f, o, mv, dt, c) {   // reared up, swaying: turning (slowly) the held way, else at them; the line runs out
      f.face = turnTo(f.face, c.mag > 0.3 ? c.dirA : toward(f, o), mv.aimTurn * dt);
      const h = mine(F, f, 'pyHiss'); if (h) { h.x = f.x; h.y = f.y; h.a = f.face; h.len = h.reach * clamp(f.t / Math.max(0.05, f.dur * 0.7), 0, 1); }
    },
    start(F, f) {
      setPh(f, 'lunge'); f.pyN = 0; f.pyT = 0;
      const h = mine(F, f, 'pyHiss'); if (h) h.ph = 'go';
      F.ev('pyLunge', f.x, f.y, 0.6, f.i, { move: 'move1' });
    },
    step(F, f, o, mv, dt, c) {
      if (f.ph === 'lunge') {
        const sl = f.t < mv.out ? mv.slide : 0;
        f.vx = Math.cos(f.face) * sl; f.vy = Math.sin(f.face) * sl;
        if (f.hit) return;
        const r = headOut(f, mv), x0 = f.x + Math.cos(f.face) * f.r * 0.5, y0 = f.y + Math.sin(f.face) * f.r * 0.5, x1 = f.x + Math.cos(f.face) * r, y1 = f.y + Math.sin(f.face) * r;
        const [d] = segDist(o.x, o.y, x0, y0, x1, y1);
        if (d > o.r + mv.width || o.z >= 30 || o.gone || NOGRAB.has(o.state)) return;
        if (!F.hitF(f, o, mv.bite, { dir: f.face, obj: true, noFlank: true, move: 'move1' })) return;   // (untouchable: on through; a bite never trades)
        f.hit = true; f.vx = f.vy = 0;
        if (f.state !== 'strike' || f.move !== 'move1') return;   // (hit out of it meanwhile)
        if (F.lastRes !== 'hit' || o.state === 'ko' || o.hold >= 0) { sprawl(F, f, mv); return; }   // (off the ice, or into a penguin: a miss all the same)
        // caught: wrapped up, drawn in from where the head caught them
        F.release(o); o.move = null; o.charge = 0; o.vx = o.vy = 0; o.ph = '';
        F.go(o, 'grabbed'); o.hold = f.i; f.hold = o.i;
        f.pyG = dist(f, o); f.face = toward(f, o); f.pyT = 0; f.pyN = 0;
        setPh(f, 'wrap'); F.go(f, 'strike', mv.wrapT + 0.1);
        const h = mine(F, f, 'pyHiss'); if (h) gone(h);
        F.ev('pyCatch', o.x, o.y, 0.6, f.i, { move: 'move1', to: o.i });
        return;
      }
      if (f.ph !== 'wrap') return;
      f.vx = f.vy = 0;
      const g = F.f[f.hold];
      if (!g || g.state !== 'grabbed' || g.hold !== f.i) { F.release(f); setPh(f, 'toss'); F.go(f, 'recover', mv.recovery); return; }
      const snug = f.r + g.r + 2, gd = snug + Math.max(0, f.pyG - snug) * Math.max(0, 1 - f.pht / 0.2);
      g.x = f.x + Math.cos(f.face) * gd; g.y = f.y + Math.sin(f.face) * gd; g.vx = g.vy = 0; F.keepIn(g);
      f.pyT += dt;
      while (f.pyT >= mv.every && f.pyN < mv.ticks) { f.pyT -= mv.every; f.pyN++; squeeze(F, f, g, mv); }
      if (f.pht < mv.wrapT) return;
      // the toss: the held way (else on the way he faces), down they go
      const a = c.mag > 0.3 ? c.dirA : f.face;
      F.release(f); f.face = a;
      g.x = f.x + Math.cos(a) * snug; g.y = f.y + Math.sin(a) * snug; F.keepIn(g);
      F.hitF(f, g, mv.toss, { dir: a, unblockable: true, hold: true, kd: true, noFlank: true, move: 'move1' });
      setPh(f, 'toss'); F.go(f, 'recover', mv.recovery);
      F.ev('pyToss', g.x, g.y, 0.7, f.i, { move: 'move1', to: g.i });
    },
    end(F, f, o, mv) { if (f.hold >= 0) F.release(f); sprawl(F, f, mv); return true; },   // (the lunge ran out: sprawled)
    wall(F, f) { f.vx = f.vy = 0; return true; },   // (into a wall: the head still goes on)
    phases: mv => [['rear', 'wind', mv.startup, 'rear', `rears up hissing, turning ${mv.aimTurn} rad/s; the line runs out`],
      ['lunge', 'strike', mv.active, 'lunge', `the head out ${mv.reach} past his edge in ${mv.out} s (sliding ${mv.slide} u/s), ${mv.width} either side`],
      ['wrap', 'strike', mv.wrapT, 'wrap', `caught (a ${mv.bite.damage} bite): drawn in, squeezed ${mv.ticks} x ${mv.squeeze}`],
      ['toss', 'recover', mv.recovery, 'toss', `tossed the held way: ${mv.toss.damage}, knocks down`], ['sprawl', 'recover', mv.miss, 'sprawl', 'missed: sprawled out, open']],
  },
  pyAnti: {
    can(F, f) { return !mine(F, f, 'pyGlow'); },
    press(F, f, o, mv) {
      setPh(f, 'cast');
      const d = Math.min(dist(f, o), mv.range), a = toward(f, o);
      const [x, y] = inside(F, f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, mv.r * 0.5);
      spawn(F, f, { kind: 'pyGlow', x, y, r: mv.r, ph: 'cast', to: -1 });
    },
    start(F, f) {
      setPh(f, 'cast');
      const gl = mine(F, f, 'pyGlow'); if (gl) gl.ph = 'grow';
      F.ev('pyCast', f.x, f.y, 0.4, f.i, { move: 'move2' });
    },
    phases: mv => [['cast', 'wind', mv.startup, 'cast', 'looks up, tongue out: the glow appears on them (hit him now: it fizzles)'], ['cast', 'strike', mv.active, 'cast', ''], ['cast', 'recover', mv.recovery, 'cast', 'open'],
      ['(the glow)', '', mv.delay, '', `r ${mv.r}: still on it, they float ${mv.float} s, helpless (${mv.damage} damage)`]],
  },
  pyWhip: {
    moves: true,
    press(F, f, o, mv) {
      setPh(f, 'pull');
      f.pyW = f.pyW > 0 ? -1 : 1;   // (each whip from the other side)
      spawn(F, f, { kind: 'pyArc', a: f.face, r0: mv.r0, r1: mv.r1, arc: mv.arc * D2R, side: f.pyW, ph: 'aim', s: -mv.arc * D2R / 2 });
    },
    wind(F, f, o, mv, dt) {
      f.face = turnTo(f.face, toward(f, o), mv.aimTurn * dt);
      const ar = mine(F, f, 'pyArc'); if (ar) { ar.x = f.x; ar.y = f.y; ar.a = f.face; }
    },
    start(F, f, o, mv) {
      setPh(f, 'whip'); f.pyS = -mv.arc * D2R / 2; f.vx = f.vy = 0;
      const ar = mine(F, f, 'pyArc'); if (ar) ar.ph = 'go';
      F.ev('pyWhip', f.x, f.y, 0.6, f.i, { move: 'move3', side: f.pyW });
    },
    step(F, f, o, mv) {
      f.vx = f.vy = 0;
      const A = mv.arc * D2R, u = clamp(f.t / mv.active, 0, 1), s = -A / 2 + A * (u * u * (3 - 2 * u)), s0 = f.pyS;
      f.pyS = s;
      const ar = mine(F, f, 'pyArc'); if (ar) { ar.s = s; ar.x = f.x; ar.y = f.y; }
      if (f.hit) return;
      const d = dist(f, o), rel = angDiff(toward(f, o), f.face) * f.pyW;   // (their angle in the sweep's own sense)
      if (d - o.r * 0.5 > mv.r1 || d + o.r * 0.5 < mv.r0 || o.z >= 30 || o.gone) return;
      const pad = Math.atan2(o.r * 0.6, Math.max(d, 1));
      if (!(rel <= s + pad && rel >= s0 - pad) || Math.abs(rel) > A / 2 + pad) return;
      const tip = d >= mv.r1 - mv.tipW, at = f.face + s * f.pyW, tan = at + f.pyW * Math.PI / 2;
      if (F.hitF(f, o, tip ? mv.tip : mv, { dir: angMid(tan, toward(f, o)), obj: true, noFlank: true, move: 'move3' })) f.hit = true;
    },
    end(F, f) { setPh(f, 'recoil'); return false; },
    phases: mv => [['pull', 'wind', mv.startup, 'pull', 'the tail pulls back; the swept band shows the arc'], ['whip', 'strike', mv.active, 'whip', `sweeps ${mv.arc}° between ${mv.r0} and ${mv.r1} from his middle (the outer ${mv.tipW}: the tip, ${mv.tip.damage}, knocks down)`],
      ['recoil', 'recover', mv.recovery, 'whip', 'the tail comes back: open']],
  },
  pySlither: {
    moves: true,
    start(F, f, o, mv) {
      const c = F.ctl(f);
      let a;
      if (c.mag > 0.3) a = c.dirA;
      else {   // sideways round them, whichever side has more room
        const t = toward(f, o), l = landing(F, f, o, t + Math.PI / 2, mv.dist), r = landing(F, f, o, t - Math.PI / 2, mv.dist);
        a = Math.hypot(l[0] - f.x, l[1] - f.y) >= Math.hypot(r[0] - f.x, r[1] - f.y) - 1 ? t + Math.PI / 2 : t - Math.PI / 2;
      }
      const [x, y] = landing(F, f, o, a, mv.dist);
      f.pyX = x; f.pyY = y; f.face = a; f.inv = Math.max(f.inv, 2 / 60);
      f.vx = (x - f.x) / mv.active; f.vy = (y - f.y) / mv.active;
      setPh(f, 'slither');
      F.ev('pySlither', f.x, f.y, 0.4, f.i, { move: 'evade', x2: x, y2: y });
    },
    step(F, f, o, mv) {
      f.inv = Math.max(f.inv, 2 / 60);
      const left = Math.max(1 / 60, mv.active - f.t); f.vx = (f.pyX - f.x) / left; f.vy = (f.pyY - f.y) / left;
    },
    end(F, f, o, mv) { f.inv = 0; f.vx *= 0.15; f.vy *= 0.15; setPh(f, 'coilup'); F.go(f, 'recover', mv.recovery); return true; },
    phases: mv => [['slither', 'strike', mv.active, 'slither', `${mv.dist} the held way (none: sideways round them), untouchable`], ['coilup', 'recover', mv.recovery, 'coil', 'coiling back up: open']],
  },
};

const objs = {
  // the Coil's line: gone once his rear or lunge is over (or cut short)
  pyHiss(F, ob, dt, own) { if (!sameGo(own, ob) || own.state !== (ob.ph === 'aim' ? 'wind' : 'strike') || own.ph === 'wrap') gone(ob); },
  // the glow: while he casts (hit out of it: it fizzles), then growing; done, whoever's on it floats
  pyGlow(F, ob, dt, own, foe, M) {
    const mv = M.move2;
    if (ob.ph === 'cast') { if (!(sameGo(own, ob) && own.state === 'wind')) { ob.ph = 'fizz'; ob.life = ob.t + 0.35; F.ev('pyFizzle', ob.x, ob.y, 0.3, ob.owner, { move: 'move2' }); } return; }
    if (ob.ph !== 'grow' || ob.t < mv.delay) return;
    const d = Math.hypot(foe.x - ob.x, foe.y - ob.y);
    if (d - foe.r * 0.5 <= ob.r && foe.z < 20 && !foe.gone && !NOGRAB.has(foe.state) && foe.state !== 'float'
      && F.hitF(own, foe, mv, { dir: d > 2 ? Math.atan2(foe.y - ob.y, foe.x - ob.x) : own.face, obj: true, unblockable: true, noFlank: true, move: 'move2' }) && F.lastRes === 'hit' && foe.state !== 'ko') {
      F.release(foe); foe.move = null; foe.charge = 0; foe.vx = foe.vy = 0; foe.ph = ''; foe.floatH = mv.h;
      F.go(foe, 'float', mv.float);
      ob.ph = 'lift'; ob.to = foe.i; ob.life = ob.t + mv.float;
      F.ev('pyLift', foe.x, foe.y, 0.8, ob.owner, { move: 'move2', to: foe.i });
    } else { ob.ph = 'fizz'; ob.life = ob.t + 0.35; F.ev('pyFizzle', ob.x, ob.y, 0.3, ob.owner, { move: 'move2' }); }
  },
  // the whip's arc: while he pulls back (cut short: gone) and sweeps
  pyArc(F, ob, dt, own) { if (!sameGo(own, ob) || own.state !== (ob.ph === 'aim' ? 'wind' : 'strike')) gone(ob); },
};

// ---------------------------------------------------------------- the bot
const unit = a => [Math.cos(a), Math.sin(a)];
const ai = {
  want: 125,
  // what Pyth's moves throw at the other bot: [key, T, dur, way out, how far]
  threats(F, i, me, o) {
    const out = [];
    for (const b of F.objs) {
      if (b.owner === i || b.t < o.age || b.t >= b.life) continue;
      const ow = F.f[b.owner], M = ow.stats.moves, left = ow.state === 'wind' ? Math.max(0, ow.dur - ow.t) : 0;
      if (b.kind === 'pyHiss' && b.ph === 'aim') {   // the Coil: off its line, sideways (he still turns a little)
        const mv = M.move1, L = b.reach + 10, x1 = b.x + Math.cos(b.a) * L, y1 = b.y + Math.sin(b.a) * L, [d, u] = segDist(me.x, me.y, b.x, b.y, x1, y1);
        const need = me.r + mv.width + 16 - d; if (need <= 0) continue;
        const side = Math.sign(Math.sin(toward(b, me) - b.a)) || 1;
        out.push(['c' + b.id, left + mv.out * u, 0.12, b.a + side * Math.PI / 2, need]);
      } else if (b.kind === 'pyGlow' && (b.ph === 'cast' || b.ph === 'grow')) {   // antigravity: off the glow
        const mv = M.move2, d = Math.hypot(me.x - b.x, me.y - b.y), need = b.r + me.r * 0.5 + 6 - d; if (need <= 0) continue;
        out.push(['g' + b.id, mv.delay - b.t, 0.05, d > 1 ? toward(b, me) : me.face + Math.PI, need]);
      } else if (b.kind === 'pyArc' && b.ph === 'aim') {   // the whip: inside it (hugging him) or outside it, whichever's nearer
        const mv = M.move3, d = Math.hypot(me.x - b.x, me.y - b.y), rel = angDiff(toward(b, me), b.a);
        if (Math.abs(rel) > b.arc / 2 + 0.3 || d - me.r * 0.5 > b.r1 + 6 || d + me.r * 0.5 < b.r0 - 4) continue;
        const nOut = b.r1 + me.r * 0.5 + 10 - d, nIn = d + me.r * 0.5 - (b.r0 - 6), inward = nIn < nOut * 0.6 && b.r0 - 6 - me.r * 0.5 > ow.r + me.r;
        const T = left + mv.active * clamp((rel * b.side + b.arc / 2) / b.arc, 0, 1);
        out.push(['w' + b.id, T, 0.08, inward ? toward(me, b) : toward(b, me), inward ? nIn : nOut]);
      }
    }
    return out;
  },
  // in one of his moves: the Coil aimed at them; the wrap tossed toward the nearest wall (a slam)
  stick(F, i, me, o, C) {
    const mv = me.stats.moves[me.move];
    if (mv.do === 'pyCoil' && me.state === 'wind') return unit(Math.atan2(o.y + o.vy * 0.15 - me.y, o.x + o.vx * 0.15 - me.x));
    if (mv.do === 'pyCoil' && me.ph === 'wrap') { const g = C.live, oc = clearance(C.g.A, g.x, g.y, g.r); return oc.d < 170 ? [-oc.nx, -oc.ny] : unit(me.face); }
    return [0, 0];
  },
  punish(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap, toFoe } = C.g;
    if (C.ready(0) && w.line && gap < M.move1.reach - 4 && w.fits(M.move1.startup + M.move1.out * clamp(gap / M.move1.reach, 0, 1))) { C.fire(0); return unit(toFoe); }
    if (C.ready(2) && d > M.move3.r0 + 6 && d < M.move3.r1 - 6 && w.fits(M.move3.startup + M.move3.active * 0.5)) { C.fire(2); return unit(toFoe); }
    if (C.ready(1) && d < M.move2.range && w.fits(M.move2.delay)) { C.fire(1); return [0, 0]; }
    return null;
  },
  neutral(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap, toFoe } = C.g;
    if (o.state === 'float') {   // afloat on our antigravity: the follow-up
      w.add(0, w.line && gap < M.move1.reach - 6 ? 0.9 : 0, unit(toFoe));
      w.add(2, d > M.move3.r0 + 4 && d < M.move3.r1 - 8 ? 0.7 : 0, unit(toFoe));
      return;
    }
    w.add(0, w.line && gap > 8 && gap < M.move1.reach - 6 ? (w.busy ? 0.35 : 0.14) : 0, unit(toFoe));
    w.add(1, d < M.move2.range - 20 ? (w.busy ? 0.3 : w.spent ? 0.16 : 0.08) : 0, [0, 0]);
    w.add(2, d > M.move3.r0 + 12 && d < M.move3.r1 - 12 ? (w.busy ? 0.3 : 0.12) : 0, unit(toFoe));
  },
  // the slither takes him well out of the way: pressed just before it lands
  evadeWhen(T) { return [T > 0.01 && T < 0.16, T < 0.16]; },
};

export default { id: ID, fighter, kits, objs, ai };
