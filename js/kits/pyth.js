// @ts-check
// Pyth (Python) in Fight mode: a poke-and-heal zoner. Drawn by js/art/kit-pyth.js.
//   move1 Indentation Whip (pyWhip)  his long reach: a blink's twist, then the tail sweeps a wide arc round him; a miss
//                                    carries him round, open
//   move2 Coil (pyCoil)              his close grab: drawn back into an S, his body springs out straight at them; caught, dragged
//                                    in, squeezed, tossed down poisoned (fight.js poison). A miss leaves him stretched out
//   move3 Apple (pyApple)            an apple drops on a random spot of open floor (F.rngs[2]); he heals by touching it,
//                                    anyone else squashes it. One at a time, none in sudden death
//   evade Slither (pySlither)        a fast low slide the held way (none held: sideways), untouchable
// Objects: pyArc (the swing), pyApple (x, y, z, ph 'fall' | 'sit', heal, r, cam: the camera keeps it in shot).
// Events: pyRear, pyLunge, pyCatch, pySqueeze, pyToss, pyPoison, pySprawl, pyWhip, pyBat, pyUnwind, pyCall (where it'll
// land), pyAppleLand, pyEat (heal), pySquash (by), pyRot, pySlither.
import { Math } from '../detmath.js';
import { arenaBox, clearance } from '../fight-arenas.js';
import { D2R, angDiff, angMid, clamp, dist, gone, inside, landing, mine, sameGo, sd, segDist, setPh, spawn, toward } from './lib.js';

const ID = 'pyth';
const NOGRAB = new Set(['ko', 'down', 'getup', 'grabbed', 'frozen']);
/** @type {import('./index.js').FighterData} */
const fighter = {
  id: ID, name: 'Pyth', lang: 'Python', role: 'Zoner',
  blurb: 'A python who keeps you at the end of his tail: his Indentation Whip sweeps a long arc round him, anyone who gets close is snatched up in his Coil, and between swings he calls down an apple to eat and heal.',
  tagline: 'Zoner: a long sweeping tail whip, a quick Coil up close, and apples to heal on.',
  difficulty: 'medium',
  passive: 'Venom: squeezed in his Coil, you come out poisoned a while: your feet go slow and you can\'t use your evade.',
  balance: 'Zoner: the whip\'s long sweep keeps them at its tip, the Coil snatches whoever gets close and its toss poisons; the apple heals 10 if he can reach it, so foes who rush it or pressure him deny it. Weak vs Cpp and Bugdroid, who outrange him. 2026-10-31, the whip and the Coil swap roles (the whip 94 -> 118 round him, tip 26 -> 34; the Coil 104 -> 40, quicker: startup 0.34 -> 0.24, out 0.17 -> 0.09); swapped as they were it measured 47% Chill, 60% Normal, 62% Ruthless, so the whip hits softer (11.5 -> 10.5, the tip 14 -> 12.5): 40% Chill, 48% Normal, 64% Ruthless (16 fights a pair, about ±8; was 56 / 45 / 43). A sharp bot holds the tip\'s range well, so he sits high at Ruthless.',
  hp: 110, weight: 0.86, walk: 1.25, accel: 30, friction: 30, kbDecay: 3.2, radius: 15, slipMul: 0.22,
  moves: {
    move1: { name: 'Indentation Whip', short: 'Whip', do: 'pyWhip', icon: 'pyWhip', hold: null,
      blurb: 'His long reach: he spins round and lashes his whole tail in a wide sweep, almost at once, a big arc round the front of him that knocks them flying. The tip hits hardest.',
      tell: 'For a blink his body twists away and the tail coils back behind him.',
      answer: 'Stay outside the tail\'s long reach, or get right in on him (the tip hits hardest). Missing, the swing carries him right round and he\'s open while he unwinds.',
      // the tail swings through arc degrees round the front of him, hitting anyone within r1 of his middle; the outer tipW is the sweet spot (tip)
      startup: 0.18, active: 0.16, recovery: 0.3, miss: 0.55, cooldown: 1.67, damage: 10.5, kb: 300, kd: true, contact: true,
      r1: 118, tipW: 34, arc: 240,   // (2026-10-31, the whip and the Coil swap roles: the whip his long reach again, 94 -> 118, tipW 26 -> 34)
      tip: { damage: 12.5, kb: 360, kd: true, kind: 'special', prio: 2, stale: false } },
    move2: { name: 'Coil', short: 'Coil', do: 'pyCoil', icon: 'pyCoil', hold: null,
      blurb: 'Up close his body springs out straight at you, quick: caught, you\'re dragged in, squeezed and tossed down poisoned.',
      tell: 'He draws back low into a tight S, shaking like a spring, for a blink.',
      answer: 'Keep out of its short reach (out where the whip\'s tip is, though), step off his line, or evade. A miss leaves him stretched out, open.',
      // aimed as he pressed; the head goes out over out s (a wall stops it: pyL); caught: dragged in over pull s,
      // squeezed ticks times (never the last point), tossed the held way, poisoned dose s
      startup: 0.24, active: 0.24, recovery: 0.32, miss: 0.5, cooldown: 1.9, damage: 11.6, kb: 240, kd: true,
      reach: 40, width: 10, out: 0.09, slide: 80, pull: 0.24,   // (2026-10-31, his close grab now: reach 104 -> 40, startup 0.34 -> 0.24, out 0.17 -> 0.09)
      wrapT: 0.95, ticks: 3, every: 0.24, squeeze: 1.2, dose: 2.6, slow: 0.6,
      bite: { damage: 2, kb: 0, stun: 0.2, kind: 'special', prio: 2, stale: false },
      toss: { damage: 6, kb: 240, kd: true, kind: 'special', prio: 2, stale: false } },
    move3: { name: 'Apple', short: 'Apple', do: 'pyApple', icon: 'pyApple', hold: null,
      blurb: 'An apple drops on a random spot in the arena: get to it to eat it and heal. It doesn\'t last, and if they get there first they squash it.',
      tell: 'He looks up, and a shadow grows where it\'ll land.',
      answer: 'Squash it first, or keep him too busy to reach it.',
      // lands after fall s, gone after life s; eaten only below full health; away: [from him, from them] where it drops
      startup: 0.22, active: 0.06, recovery: 0.24, cooldown: 18, heal: 10, life: 6, fall: 0.5, r: 10, away: [140, 50] },
    evade: { name: 'Slither', short: 'Slither', do: 'pySlither', icon: 'pySlither', hold: null,
      blurb: 'A fast low slide the way you hold (none held: sideways round them), untouchable while he slides.',
      tell: 'None: it\'s quick. Its cooldown shows on his key.', answer: 'He\'s open for a moment as he coils back up: bait it, then commit.',
      // dist units the held way (none: sideways, the roomier side) over active s, untouchable all of it; recovery s open
      startup: 0, active: 0.22, recovery: 0.2, cooldown: 1.5, dist: 140 },
  },
  // the 3D pose for each phase (model3d.js PYTH_POSES)
  phPose: { coilback: 'coil', lunge: 'lunge', wrap: 'wrap', toss: 'toss', sprawl: 'sprawl', pull: 'pull', whip: 'whip', recoil: 'whip', unwind: 'whip',
    call: 'cast', called: 'cast', slither: 'slither', coilup: 'coil' },
  phFade: ['toss', 'recoil', 'called', 'coilup'],
  // pyT/pyN the squeeze's clock and count, pyG where he caught them, pyL the Coil's clear reach, pyS/pyW the sweep's angle
  // and side, pyX/pyY where the slither lands
  fields: { pyT: 0, pyN: 0, pyG: 0, pyL: 0, pyS: 0, pyW: 1, pyX: 0, pyY: 0 },
  show: ['stand', 'pull', 'whip', 'stand', 'coil', 'lunge', 'stand', 'cast'], cheer: 'rear',
};
const P = (a, b, inp) => [a, b, inp];
fighter.clips = {
  move1: { x: [-78, 30], len: 2.2, cam: { x: -5, w: 300 }, a: [P(0.3, 0.38, { light: 1 })] },
  move2: { x: [-40, 40], len: 2.8, cam: { x: 0, w: 280 }, a: [P(0.3, 0.38, { heavy: 1 }), P(0.9, 1.6, { x: 1, y: 0 })] },
  // (F.pyAppleAt: the card puts the apple in view)
  move3: { x: [-70, 90], len: 3.2, cam: { x: 0, w: 300 }, set: F => { /** @type {any} */ (F).pyAppleAt = [10, 20]; F.f[0].hp -= 30; }, a: [P(0.3, 0.38, { special: 1 }), P(1.05, 1.75, { x: 1, y: 0.25 })] },
  evade: { x: [-30, 110], len: 2.4, cam: { x: 20, w: 300 }, a: [P(0.62, 0.68, { guard: 1, x: 0, y: -1 })], b: [P(0.3, 0.38, { heavy: 1 })] },
};

// ---------------------------------------------------------------- the moves
const easeOut = u => 1 - (1 - u) * (1 - u);
// the Coil's head right now: how far out from his middle (it springs out over `out`, then holds; a wall stops it, pyL)
export const headOut = (f, mv) => f.r + Math.min(mv.reach, f.pyL || mv.reach) * easeOut(clamp(f.t / mv.out, 0, 1));
// how far his way is clear for the Coil (walls, solids, crates), from his edge
function clearLen(F, f, a, L) {
  const c = Math.cos(a), s = Math.sin(a);
  for (let d = f.r + 8; d < f.r + L; d += 8) if (F.contactsAll(f.x + c * d, f.y + s * d, 2).length) return Math.max(8, d - f.r - 4);
  return L;
}
function sprawl(F, f, mv) {
  setPh(f, 'sprawl'); F.go(f, 'recover', mv.miss); f.vx *= 0.3; f.vy *= 0.3;
  const r = headOut(f, mv) * 0.8;
  F.ev('pySprawl', f.x + Math.cos(f.face) * r, f.y + Math.sin(f.face) * r, 0.4, f.i, { move: 'move2' });
}
// a squeeze: a little damage straight off them (never the last point: the toss is what knocks out)
function squeeze(F, f, g, mv) {
  const d = Math.max(0, Math.min(mv.squeeze * F.dmgMul, g.hp - 1));
  if (d > 0) { g.hp -= d; g.flash = 0.12; }
  F.ev('pySqueeze', g.x, g.y, 0.4, f.i, { move: 'move2', to: g.i, dmg: d });
}

// ---- the Apple's spot: a random point of open floor (the fight's own stream), off the walls, solids, crates and the
// hazards (ice is fine), away from both of them; asked less of if nothing fits (it always lands somewhere reachable)
const spotOk = (F, x, y) => sd(F.A.bounds, x, y)[0] < -24 && !F.contactsAll(x, y, 14).length && clearance(F.A, x, y, 0).d > 16
  && !F.A.hazards.some(h => h.kind !== 'ice' && sd(h, x, y)[0] < 12);
/** @type {(F: import('./index.js').Fight, f: import('./index.js').Fighter, o: import('./index.js').Fighter, mv: import('./index.js').Move) => number[]} */
export function appleSpot(F, f, o, mv) {
  const fix = /** @type {any} */ (F).pyAppleAt;   // (a move card's clip or a trial's demo: put where the camera shows it)
  if (fix) return fix;
  const B = arenaBox(F.A), R = F.rngs[2];
  for (const k of [1, 0.6, 0]) for (let n = 0; n < 30; n++) {
    const x = B.x0 + (B.x1 - B.x0) * R(), y = B.y0 + (B.y1 - B.y0) * R();
    if (spotOk(F, x, y) && Math.hypot(x - f.x, y - f.y) >= mv.away[0] * k && Math.hypot(x - o.x, y - o.y) >= mv.away[1] * k) return [x, y];
  }
  return inside(F, 0, 0, 30);
}
// Pyth's apple out (falling or sitting), or null
export const appleOf = (F, i) => F.objs.find(b => b.kind === 'pyApple' && b.owner === i && b.t < b.life) || null;
const FEET = new Set(['ko', 'down', 'getup', 'grabbed', 'hurt', 'stagger', 'frozen', 'dizzy']);   // (not on his feet: no eating)

/** @type {Record<string, import('./index.js').Kit>} */
const kits = {
  pyCoil: {
    moves: true,
    press(F, f, o, mv) {
      setPh(f, 'coilback'); f.vx *= 0.3; f.vy *= 0.3;
      F.ev('pyRear', f.x, f.y, 0.4, f.i, { move: 'move2' });
    },
    wind(F, f) { f.vx *= 0.8; f.vy *= 0.8; },   // (drawn back, aimed where they were as he pressed: walk off the line)
    start(F, f, o, mv) {
      setPh(f, 'lunge'); f.pyN = 0; f.pyT = 0; f.pyL = clearLen(F, f, f.face, mv.reach);
      F.ev('pyLunge', f.x, f.y, 0.6, f.i, { move: 'move2', r: f.r + f.pyL });
    },
    step(F, f, o, mv, dt, c) {
      if (f.ph === 'lunge') {
        const sl = f.t < mv.out ? mv.slide : 0;
        f.vx = Math.cos(f.face) * sl; f.vy = Math.sin(f.face) * sl;
        if (f.hit) return;
        const r = headOut(f, mv), x0 = f.x + Math.cos(f.face) * f.r * 0.5, y0 = f.y + Math.sin(f.face) * f.r * 0.5, x1 = f.x + Math.cos(f.face) * r, y1 = f.y + Math.sin(f.face) * r;
        const [d] = segDist(o.x, o.y, x0, y0, x1, y1);
        if (d > o.r + mv.width || o.z >= 30 || o.gone || NOGRAB.has(o.state) || o.safeT > 0) return;   // (just up off a knockdown: safe from the grab, fight.js safeT)
        if (!F.hitF(f, o, mv.bite, { dir: f.face, obj: true, noFlank: true, move: 'move2' })) return;   // (untouchable: on through; a bite never trades)
        f.hit = true; f.vx = f.vy = 0;
        if (f.state !== 'strike' || f.move !== 'move2') return;   // (hit out of it meanwhile)
        if (F.lastRes !== 'hit' || o.state === 'ko' || o.hold >= 0) { sprawl(F, f, mv); return; }   // (off the ice, or into a penguin: a miss all the same)
        // caught: wrapped up, dragged in from where the head caught them
        F.release(o); o.move = null; o.vx = o.vy = 0; o.ph = '';
        F.go(o, 'grabbed'); o.hold = f.i; f.hold = o.i;
        f.pyG = dist(f, o); f.face = toward(f, o); f.pyT = 0; f.pyN = 0;
        setPh(f, 'wrap'); F.go(f, 'strike', mv.pull + mv.wrapT + 0.1);
        F.ev('pyCatch', o.x, o.y, 0.6, f.i, { move: 'move2', to: o.i });
        return;
      }
      if (f.ph !== 'wrap') return;
      f.vx = f.vy = 0;
      const g = F.f[f.hold];
      if (!g || g.state !== 'grabbed' || g.hold !== f.i) { F.release(f); setPh(f, 'toss'); F.go(f, 'recover', mv.recovery); return; }
      const snug = f.r + g.r + 2, gd = snug + Math.max(0, f.pyG - snug) * Math.max(0, 1 - easeOut(clamp(f.pht / mv.pull, 0, 1)));
      g.x = f.x + Math.cos(f.face) * gd; g.y = f.y + Math.sin(f.face) * gd; g.vx = g.vy = 0; F.keepIn(g);
      if (f.pht < mv.pull) return;   // (dragged in first)
      f.pyT += dt;
      while (f.pyT >= mv.every && f.pyN < mv.ticks) { f.pyT -= mv.every; f.pyN++; squeeze(F, f, g, mv); }
      if (f.pht < mv.pull + mv.wrapT) return;
      // the toss: the held way (else on the way he faces), down they go, his venom in them
      const a = c.mag > 0.3 ? c.dirA : f.face;
      F.release(f); f.face = a;
      g.x = f.x + Math.cos(a) * snug; g.y = f.y + Math.sin(a) * snug; F.keepIn(g);
      F.hitF(f, g, mv.toss, { dir: a, unblockable: true, hold: true, kd: true, noFlank: true, move: 'move2' });
      setPh(f, 'toss'); F.go(f, 'recover', mv.recovery);
      F.ev('pyToss', g.x, g.y, 0.7, f.i, { move: 'move2', to: g.i });
      if (g.hp > 0) { F.poison(g, mv.dose, mv.slow, f.i); F.ev('pyPoison', g.x, g.y, 0.7, f.i, { move: 'move2', to: g.i, a }); }
    },
    end(F, f, o, mv) { if (f.hold >= 0) F.release(f); sprawl(F, f, mv); return true; },   // (the spring ran out: stretched out)
    wall(F, f) { f.vx = f.vy = 0; return true; },   // (into a wall: the head still goes on)
    phases: mv => [['coilback', 'wind', mv.startup, 'coil', 'drawn back low into an S, aimed as he pressed (nothing on the floor)'],
      ['lunge', 'strike', mv.active, 'lunge', `the spring: his head out ${mv.reach} past his edge in ${mv.out} s (a wall stops it; sliding ${mv.slide} u/s), ${mv.width} either side`],
      ['wrap', 'strike', mv.pull + mv.wrapT, 'wrap', `caught (a ${mv.bite.damage} bite): dragged in over ${mv.pull} s, squeezed ${mv.ticks} x ${mv.squeeze}`],
      ['toss', 'recover', mv.recovery, 'toss', `tossed the held way: ${mv.toss.damage}, knocks down, poisoned ${mv.dose} s (walking x${mv.slow}, no evade)`], ['sprawl', 'recover', mv.miss, 'sprawl', 'missed: stretched out, open']],
  },
  pyApple: {   // he looks up, it drops on a random spot: his to eat, theirs to squash
    can(F, f) { return !appleOf(F, f.i) && F.phase !== 'sudden'; },   // (one at a time; none in sudden death, so it ends)
    press(F, f) { setPh(f, 'call'); f.vx *= 0.3; f.vy *= 0.3; },
    wind(F, f) { f.vx *= 0.8; f.vy *= 0.8; },
    start(F, f, o, mv) {
      const [x, y] = appleSpot(F, f, o, mv);
      spawn(F, f, { kind: 'pyApple', x, y, z: 120, ph: 'fall', fall: mv.fall, heal: mv.heal, r: mv.r, life: mv.fall + mv.life, mv: null, ms: 0, cam: 1 });
      F.ev('pyCall', x, y, 0.5, f.i, { move: 'move3' });
    },
    step(F, f) { f.vx *= 0.8; f.vy *= 0.8; },
    end(F, f, o, mv) { setPh(f, 'called'); F.go(f, 'recover', mv.recovery); return true; },
    phases: mv => [['call', 'wind', mv.startup, 'cast', 'looks up, tongue out'], ['call', 'strike', mv.active, 'cast', `an apple drops onto a random spot of open floor (${mv.fall} s to land, there for ${mv.life} s; one at a time): his to eat (+${mv.heal}), anyone else's to squash`],
      ['called', 'recover', mv.recovery, 'cast', 'back down']],
  },
  pyWhip: {   // the baseball-bat tail swing
    moves: true,
    press(F, f) {
      setPh(f, 'pull'); f.vx *= 0.3; f.vy *= 0.3;
      f.pyW = f.pyW > 0 ? -1 : 1;   // (each swing from the other side)
    },
    wind(F, f) { f.vx *= 0.8; f.vy *= 0.8; },
    start(F, f, o, mv) {
      setPh(f, 'whip'); f.pyS = -mv.arc * D2R / 2; f.vx = f.vy = 0;
      spawn(F, f, { kind: 'pyArc', a: f.face, r0: 0, r1: mv.r1, arc: mv.arc * D2R, side: f.pyW, ph: 'go', s: f.pyS });   // (where the tail is: the drawer's)
      F.ev('pyWhip', f.x, f.y, 0.6, f.i, { move: 'move1', side: f.pyW });
    },
    step(F, f, o, mv) {
      f.vx = f.vy = 0;
      const A = mv.arc * D2R, u = clamp(f.t / mv.active, 0, 1), s = -A / 2 + A * (u * u * (3 - 2 * u)), s0 = f.pyS;
      f.pyS = s;
      const ar = mine(F, f, 'pyArc'); if (ar) { ar.s = s; ar.x = f.x; ar.y = f.y; }
      if (f.hit) return;
      const d = dist(f, o), rel = angDiff(toward(f, o), f.face) * f.pyW;   // (their angle in the swing's own sense)
      if (d - o.r * 0.5 > mv.r1 || o.z >= 30 || o.gone) return;
      const pad = Math.atan2(o.r * 0.6, Math.max(d, 1));
      if (!(rel <= s + pad && rel >= s0 - pad) || Math.abs(rel) > A / 2 + pad) return;
      const tip = d >= mv.r1 - mv.tipW, at = f.face + s * f.pyW, tan = at + f.pyW * Math.PI / 2;
      if (F.hitF(f, o, tip ? mv.tip : mv, { dir: angMid(tan, toward(f, o)), noFlank: true, move: 'move1' })) {
        f.hit = true;
        if (F.lastRes === 'hit') F.ev('pyBat', o.x, o.y, tip ? 1 : 0.8, f.i, { move: 'move1', to: o.i, a: tan, tip });
      }
    },
    end(F, f, o, mv) {   // hit: the tail comes back; missed: the swing carries him round, open
      if (f.hit) { setPh(f, 'recoil'); F.go(f, 'recover', mv.recovery); }
      else { setPh(f, 'unwind'); F.go(f, 'recover', mv.miss); F.ev('pyUnwind', f.x, f.y, 0.4, f.i, { move: 'move1' }); }
      return true;
    },
    phases: mv => [['pull', 'wind', mv.startup, 'pull', 'twists away, the tail coiled back (nothing on the floor)'], ['whip', 'strike', mv.active, 'whip', `the tail swung ${mv.arc}° round from behind him, out to ${mv.r1} from his middle (the outer ${mv.tipW}: the sweet spot, ${mv.tip.damage}, kb ${mv.tip.kb})`],
      ['recoil', 'recover', mv.recovery, 'whip', 'hit: the tail comes back'], ['unwind', 'recover', mv.miss, 'whip', 'missed: carried round, open']],
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

/** @type {Record<string, import('./index.js').ObjStep>} */
const objs = {
  // the apple: dropping for fall s (nobody can touch it up there), then on the floor: Pyth on his feet over it (and not
  // at full health) eats it, anyone else on the floor over it squashes it; unpicked, it goes at life
  pyApple(F, ob, dt, own, foe, M) {
    if (ob.ph === 'fall') {
      const u = clamp(ob.t / ob.fall, 0, 1); ob.z = 120 * (1 - u * u);
      if (u >= 1) { ob.ph = 'sit'; ob.z = 0; F.ev('pyAppleLand', ob.x, ob.y, 0.4, own.i, { move: 'move3' }); }
      return;
    }
    const near = (f, pad) => f && !f.gone && !(f.under > 0) && f.z < 20 && Math.hypot(f.x - ob.x, f.y - ob.y) < f.r + ob.r + pad;
    if (near(own, 3) && !FEET.has(own.state) && own.hp < own.maxHp - 0.5) {
      const heal = Math.min(ob.heal / Math.max(1, F.dmgMul), own.maxHp - own.hp); own.hp += heal;   // (sudden death: every hit hurts more, so an apple heals less)
      F.ev('pyEat', ob.x, ob.y, 0.6, own.i, { move: 'move3', heal, to: own.i });
      gone(ob); return;
    }
    if (near(foe, 0) && foe.state !== 'grabbed' && foe.state !== 'ko') { F.ev('pySquash', ob.x, ob.y, 0.6, own.i, { move: 'move3', by: foe.i }); gone(ob); return; }
    if (ob.t >= ob.life) F.ev('pyRot', ob.x, ob.y, 0.3, own.i, { move: 'move3' });
  },
  // the tail's swing: gone once it's over (or cut short)
  pyArc(F, ob, dt, own) { if (!sameGo(own, ob) || own.state !== 'strike') gone(ob); },
};

// ---------------------------------------------------------------- the bot
const unit = a => [Math.cos(a), Math.sin(a)];
// the Coil's reach as a gap (edge to edge) it lands from
const coilGap = mv => mv.reach + mv.slide * mv.out + mv.width - 6;
// how much an apple would heal him now (0: he's near full)
const wantsApple = (me, M) => me.maxHp - me.hp >= M.move3.heal * 0.6;
/** @type {import('./index.js').BotHooks} */
const ai = {
  want: 78,   // (the whip's tip)
  // his character (js/fight-style.js): keeps you at the end of his reach, pokes and heals
  persona: { aggr: 0.1, keep: 0.45, patient: 0.3, styles: [0.8, 1.3, 1] },
  // what Pyth's moves throw at the other bot: [key, T, dur, way out, how far]
  threats(F, i, me, o) {
    const out = [];
    // the Coil (his close grab): read off him drawing back into his S; off the line, or out of its reach
    if (o.state === 'wind' && o.move === 'move2' && o.stats.moves.move2.do === 'pyCoil') {
      const mv = o.stats.moves.move2, d = Math.hypot(me.x - o.x, me.y - o.y), need = o.r + me.r + mv.reach + mv.slide * mv.out + mv.width + 6 - d;
      const a = d > 1 ? toward(o, me) : me.face + Math.PI, side = a + (angDiff(me.face, a) > 0 ? 1 : -1) * Math.PI / 2;   // (sideways off his line is the short way out from far off)
      const off = me.r + mv.width + 8, far = d > o.r + me.r + mv.reach * 0.55;
      if (need > 0) out.push(['H' + o.ms, Math.max(0, o.left) + mv.out * clamp((d - o.r) / (mv.reach + o.r), 0.2, 1), mv.active, far ? side : a, far ? Math.min(need, off) : need]);
    }
    // the bat swing (a HIT: nothing on the floor): read off his body as it's seen, twisting away; out of the tail's reach
    if (o.state === 'wind' && o.move === 'move1' && o.stats.moves.move1.do === 'pyWhip') {
      const mv = o.stats.moves.move1, d = Math.hypot(me.x - o.x, me.y - o.y), need = mv.r1 + me.r * 0.5 + 8 - d;
      if (need > 0) out.push(['H' + o.ms, Math.max(0, o.left) + mv.active * 0.5, mv.active * 0.5, d > 1 ? toward(o, me) : me.face + Math.PI, need]);
    }
    return out;
  },
  // Pyth's apple, on the other bot (any fighter): squash it when it's cheap (they're nearer it than he is, it's not far,
  // he isn't winding up on them), decided once an apple by how sharp the bot is
  chase(F, i, me, o, C) {
    const py = C.live, ap = appleOf(F, py.i);
    if (!ap || ap.t < (o.age || 0.3) || py.hp >= py.maxHp - 3) return null;
    if (o.state === 'wind' || o.state === 'strike') return null;   // (something coming: answer it first)
    const key = 'ap' + ap.id; if (C.K[key] == null) C.K[key] = C.rng() < 0.25 + 0.65 * C.L.smart ? 1 : 0;
    if (!C.K[key]) return null;
    const dMe = Math.hypot(ap.x - me.x, ap.y - me.y), dPy = Math.hypot(ap.x - py.x, ap.y - py.y);
    const walkT = dMe / (150 * me.stats.walk * (me.psnT > 0 ? me.psnSlow : 1)), pyT = dPy / (150 * py.stats.walk);
    if (dMe > 300 || walkT > pyT + 0.25 + 0.4 * C.L.smart) return null;   // (he'd get there first: not worth the walk)
    return unit(Math.atan2(ap.y - me.y, ap.x - me.x));
  },
  // his own, first: an apple while they're down (a free moment), and going to eat one when it's safe
  first(F, i, me, o, C) {
    const M = me.stats.moves, live = C.live, down = live.state === 'down' || live.state === 'getup' || live.state === 'grabbed';
    if (down && C.ready(2) && wantsApple(me, M) && !appleOf(F, me.i)) { C.fire(2); return [0, 0]; }
    const ap = appleOf(F, me.i);
    if (!ap || !(me.hp < me.maxHp - 2)) return null;
    const dMe = Math.hypot(ap.x - me.x, ap.y - me.y), dO = Math.hypot(ap.x - live.x, ap.y - live.y);
    // safe: they're down or busy, or further from it than he is (or it's right by him)
    const busy = down || ['hurt', 'stagger', 'recover', 'dizzy', 'frozen'].includes(live.state);
    if (busy || dMe < 60 || dO > dMe + 40 - 40 * C.L.smart) {
      if (dMe > M.evade.dist * 0.7 && C.ready(3) && C.rng() < 0.25 * C.L.smart) return C.stepTo(Math.atan2(ap.y - me.y, ap.x - me.x));   // (a slither over to it)
      return unit(Math.atan2(ap.y - me.y, ap.x - me.x));
    }
    return null;
  },
  // in one of his moves: the wrap tossed toward the nearest wall (a slam)
  stick(F, i, me, o, C) {
    const mv = me.stats.moves[me.move];
    if (mv.do === 'pyCoil' && me.ph === 'wrap') { const g = C.live, oc = clearance(C.g.A, g.x, g.y, g.r); return oc.d < 170 ? [-oc.nx, -oc.ny] : unit(me.face); }
    return [0, 0];
  },
  punish(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap, toFoe } = C.g;
    const wrap = !NOGRAB.has(C.live.state) && !(C.live.safeT > 0);   // (the Coil can't pick them up off the floor)
    const cg = coilGap(M.move2), T = M.move2.startup + M.move2.out * clamp(gap / cg, 0.2, 1);
    if (wrap && C.ready(1) && w.line && gap < cg && w.fits(T)) { C.fire(1); return unit(toFoe); }   // (close: the Coil, the poison after)
    if (C.ready(0) && d < M.move1.r1 - 6 && w.fits(M.move1.startup + M.move1.active * 0.5)) { C.fire(0); return unit(toFoe); }   // (the lash, from out to its tip)
    if (wrap && C.ready(1) && w.busy && gap < cg + 50 && w.b > T + 0.1 + (gap - cg + 10) / (150 * me.stats.walk)) return unit(toFoe);   // (a little out: a step in, for the Coil)
    return null;
  },
  neutral(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap, toFoe } = C.g, live = C.live, cg = coilGap(M.move2), sm = C.L.smart;
    // the Coil: his close grab, whenever they're close; the lash from further out, keenest at its tip
    const grabbable = !NOGRAB.has(live.state) && !(live.safeT > 0);
    w.add(1, grabbable && w.line && gap < cg ? (w.busy ? 0.55 : 0.4) * (w.spent ? 1.3 : 1) : 0, unit(toFoe));
    w.add(0, d < M.move1.r1 - 8 ? (w.busy ? 0.55 : 0.4) * (d > M.move1.r1 - M.move1.tipW ? 1.3 : 0.8) : 0, unit(toFoe));
    // the apple: hurt, and they're not right on him (sharper bots wait for room)
    const ap = appleOf(F, me.i);
    if (!ap && wantsApple(me, M)) w.add(2, gap > 60 + 50 * sm ? (w.busy ? 0.45 : 0.25) * (1 + (me.maxHp - me.hp) / me.maxHp) : 0, [0, 0]);
    // their way to his apple: stand in it, the Coil ready for them (sharper bots more)
    if (ap && me.hp < me.maxHp - 2 && sm >= 0.4) {
      const dO = Math.hypot(ap.x - live.x, ap.y - live.y), dMe = Math.hypot(ap.x - me.x, ap.y - me.y);
      if (dO < dMe) { const k = Math.min(70, dO * 0.5), tx = ap.x + (live.x - ap.x) / (dO || 1) * k, ty = ap.y + (live.y - ap.y) / (dO || 1) * k, l = Math.hypot(tx - me.x, ty - me.y); if (l > 10) return [(tx - me.x) / l, (ty - me.y) / l]; }
    }
    // just out of the Coil's reach, they're stuck: a step in
    if (C.ready(1) && w.busy && gap > cg && gap < cg + 60 && Math.max(0, o.left) > (gap - cg + 10) / (150 * me.stats.walk)) return unit(toFoe);
  },
  // the slither takes him well out of the way: pressed just before it lands
  evadeWhen(T) { return [T > 0.01 && T < 0.16, T < 0.16]; },
};

export default { id: ID, fighter, kits, objs, ai };
