// @ts-check
// Docky (Docker's whale) for Fight: a close-range bruiser (plug-in shape: js/kits/index.js; drawing:
// js/art/kit-docky.js). DOMless, deterministic. Each move has one job and they feed each other: the wave gets him in,
// the wall keeps you in, the slap pays.
// move1 Tail Slap (dkSlap): the payoff. A twist with his tail cocked back (the water stirring out to its reach) as he
// lurches a short step, then he spins and the tail swings round like a bat: caught by its tip you're launched and
// knocked down long; into a wall or a container it's a slam. Inside the tip it's only his body's bump: staggered.
// Missed, he's open. Answer: back out on the tell, or hug him; punish the whiff
// move2 Tidal Wave (dkWave): he rears up, then rides a wave straight ahead: whoever it reaches is carried at its front
// and dropped staggered in front of him where it breaks (into a wall or his containers: slammed). Answer: sidestep it
// (it rolls straight on) or evade through it; missed, he wipes out, open
// move3 Compose Up (dkWall): the floor cracks behind you (following you), then a short curved wall of containers rises
// there, solid (walking, slides and thrown things stop at it); backing into it as it rises pops you toward him. Answer:
// walk round its ends or wait it out; he's open meanwhile
// evade Swim (dkSwim): he dives and swims off fast underwater the held way (none: away), untouchable and not there to
// bump into, a ripple line over him; then surfaces, open for a moment. Answer: follow the ripples
// Passive: Isolation (the first hit he takes each round does no damage: fight.js hitF's iso).
import { Math } from '../detmath.js';
import { TAU, angDiff, clamp, dist, gone, landing, mine, open, sameGo, sd, setPh, spawn, toward } from './lib.js';

const ID = 'docky';
/** @type {import('./index.js').FighterData} */
const fighter = {
  id: ID, name: 'Docky', lang: 'Docker', role: 'Bruiser',
  blurb: 'The big shipping whale: surfs in on a tidal wave, boxes you in with a wall of containers, and swings his tail like a baseball bat.',
  tagline: 'Big whale: surfs in on a wave, walls you in, swings his tail.',   // (the select screen's one line; the blurb stays on its Moves tab)
  difficulty: 'easy',   // (the select screen's Easy / Medium / Hard: how much it takes to play well)
  passive: 'Isolation: the first hit he takes each round does no damage. The heaviest: hits push him the least.',
  balance: 'Heavy and hard-hitting, lots of health and Isolation; his wave ride is short and plain to see, and his Tail Slap is his bread and butter: thrown whenever you\'re in its reach, but with a tell now (his tail cocked back, the floor rippling out to its reach), a knockdown only off its tip and a short whiff. About 56% (Chill) to 43% (Ruthless) of bot fights, 2026-10-26 (all 4 arenas, 128 fights a pair; 51 / 34 before the last pass: sharp players backed out of the slap on its tell and punished every whiff and every surfacing, so the slap winds up quicker, 0.2 -> 0.17 s, the slap\'s whiff 0.45 -> 0.41 s and the wave\'s wipe-out 0.6 -> 0.48 s are shorter, and the Swim is back sooner, 2.2 -> 1.8 s, surfacing quicker, 0.32 -> 0.24. Before that 60 / 43 with the old tell-less slap; the wave and its drop went 5 + 4 -> 4 + 2). Swifty\'s keep-away and Duke\'s blink are his worst (~14-16% at Ruthless); Tux and Pyth walk into his reach (~70-80%). 2026-10-29, the approved kit changes (the Tail Slap 21 -> 18, Compose Up quicker back): about 39% at Normal and 43% at Ruthless (the ring, 16 / 12 fights a pair). 2026-10-29, the balance pass (all four arenas, 40 fights a pair, about ±5): 61% Chill, 55% Normal, 43% Ruthless (the slap\'s recovery 0.3 -> 0.26 and miss 0.41 -> 0.38: low at Ruthless). Narrow Data Bus suits his wave (72-74% there) and the ice of Cold Boot doesn\'t (38-50%); Bugdroid\'s zoning still beats him (15-35%). 2026-10-30, the tune-up: Tail Slap 18 -> 16, the wave\'s drop staggers 0.43 s (was 0.5: the slap after it has to come at once), Data Bus\'s crates moved toward the walls (no dead-end pocket beside them; the crate position itself measured no change, his hall edge comes from the narrow hall and the wave). Measured after (16 fights a pair, about ±6): 51% Chill, 42% Normal, 39% Ruthless (was 61 / 55 / 43); on Data Bus about 55-68% at Normal against 33-49% on the others; at Ruthless he\'s the lowest (Duke 25%, Octo 19%, Swifty 13%): a candidate for the balance check. 2026-10-30, the balance check: kept out at range by the zoners at Ruthless (half the fight 120-200 off Octo, his wave answered), so a sharp bot now swims in under a shot at them instead of away (ai.evadeWay; never at Chill, now and then at Normal): Ruthless 38 -> 46%, Normal 46 -> 49% (40 fights a pair, his own run), Chill unchanged. 2026-10-31, every hit about 3% harder (the tail slap 16 -> 16.5, close 10 -> 10.3, its slam 9 -> 9.2, the wave 4 -> 4.1, its slam 6 -> 6.2, the wall 6 -> 6.2): Normal 43 -> 46% in today\'s field (16 fights a pair, about ±8; +6% damage measured 49%).',
  hp: 120, weight: 1.38, walk: 0.9, accel: 24, friction: 26, kbDecay: 2.8, radius: 20, slipMul: 0.18, isolation: true,
  moves: {
    move1: { name: 'Tail Slap', short: 'Slap', do: 'dkSlap', icon: 'dkSlap', hold: null,
      blurb: 'Cocks his big tail back and spins round on the spot, swinging it like a baseball bat: caught on the tip of it, all round him, you\'re launched and knocked down for a while (into a wall or his containers, it\'s a slam); right up close his body only bumps you off, staggered.',
      tell: 'He twists the other way and his tail cocks back high behind him, water dripping off the flukes, then the whole whale spins.',
      answer: 'Keep out of the tail\'s reach (the spray shows it), or hug him: right up close it only staggers. Missing, he\'s left unwinding and open.',
      // the twist (startup: lurching toward them at lunge u/s, stopping where the tip meets them), the spin (active:
      // his tail swings once round from behind him, hitting whoever's within reach of his edge; sent off sweep rad
      // round the swing, down down s longer than a knockdown; within tip of his edge it's only the body's bump: near,
      // staggered, no slam); hit: recovery, missed: miss s, open. Within slam.window s of the hit, them meeting a wall,
      // a pillar or a container: a slam (slam.damage more, down slam.down s longer). The bot throws it whenever it's on
      // (keen at Chill .. keenHi at Ruthless on a free foe)
      startup: 0.17, active: 0.16, recovery: 0.26, miss: 0.38, cooldown: 2,
      damage: 16.5, kb: 420, kd: true, contact: true, reach: 50, sweep: 0.5, lunge: 110, down: 0.3, tip: 12, keen: 0.35, keenHi: 1,
      near: { damage: 10.3, kb: 150, stun: 0.4 },
      slam: { damage: 9.2, down: 0.35, window: 0.6 } },
    move2: { name: 'Tidal Wave', short: 'Wave', do: 'dkWave', icon: 'dkWave', hold: null,
      blurb: 'Rears up, slams his flippers down and rides a big wave in, surfing on its back: it carries you off and drops you staggered right in front of him (or slams you into a wall).',
      tell: 'He rears up, flippers high, and the water swells up on the floor in front of him.',
      answer: 'Get out of its way sideways (it rolls straight on), or evade through it: it\'s thin. Missed, he wipes out where it breaks, open.',
      // the rear (startup: not aimed, it goes the way he faced as he pressed), the ride (active: up to run s): the wave
      // rolls from his front at speed u/s (till a wall, a pillar or a container), half units either side of its middle,
      // depth deep, and he surfs ride units behind its front. It catches whoever it reaches once (damage, kb, stun:
      // held in it) and carries them; where it breaks it drops them staggered (dump) in front of him, or slams them
      // (slam, a knockdown) if it broke on something. He lands there: caught someone, recovery, else he wipes out (miss
      // s, open)
      startup: 0.42, active: 0.92, recovery: 0.22, miss: 0.48, cooldown: 3,
      damage: 4.1, kb: 110, stun: 0.9, speed: 240, run: 0.92, half: 50, depth: 22, ride: 14,
      dump: { damage: 2, kb: 70, stun: 0.43, prio: 2, stale: false },   // (the slap after it has to come at once)
      slam: { damage: 6.2, kb: 200, kd: true, prio: 2, stale: false } },
    move3: { name: 'Compose Up', short: 'Compose', do: 'dkWall', icon: 'dkWall', hold: null,
      blurb: 'Composes a short wall of containers up out of the floor right behind you, two high: no backing off from him, and his wave and tail slam you into it.',
      tell: 'The containers pile up into a tower on his back, and the floor cracks behind you, following you.',
      answer: 'Don\'t back into it as it rises (it pops you back to him). Walk round its ends (it\'s short), or wait it out: it sinks after a few seconds. It\'s no hit: he\'s open while he builds.',
      // the stack (startup: n marks, size square, spacing apart, across the line from him to them, behind them (their
      // edge + behind, middle near .. far from him; the ends curve curve back toward him), following them), the build
      // (active): they rise out of the floor in rise s, then stand life s as solids and sink in sink s. Rising under
      // someone: popped toward him (damage, kb, stun). One wall at a time
      startup: 0.4, active: 0.1, recovery: 0.3, cooldown: 3.7,
      damage: 6.2, kb: 200, stun: 0.4, n: 3, size: 30, spacing: 30, curve: 9, behind: 6, near: 64, far: 230, rise: 0.22, life: 4.2, sink: 0.4 },
    evade: { name: 'Swim', short: 'Swim', do: 'dkSwim', icon: 'dkSwim', hold: null,
      blurb: 'Dives into a splash and swims off fast underwater the held way (or away from you), untouchable, and surfaces a good way off.',
      tell: 'A splash, then a ripple line and a trail of bubbles racing along the floor where he swims.',
      answer: 'Follow the ripples and punish him as he surfaces: he\'s open then, and nothing comes out of it.',
      // under (active s: untouchable, not there to bump into), swimming dist units the held way (none: away), stopping
      // short of walls and of them; then he surfaces (recovery s, open)
      startup: 0, active: 0.46, recovery: 0.24, cooldown: 1.8, dist: 175 },
  },
  phPose: { swell: 'swell', surf: 'ram', land: 'surge', wipe: 'surge', coil: 'coil', slap: 'slap', follow: 'slap', unwind: 'slap', stack: 'stack', build: 'surge', swim: 'dive', surface: 'breach' },
  phFade: ['land', 'wipe', 'build'],
  fields: { sx: 0, sy: 0 },   // (where the swim set off from, for the drawing)
  show: ['stand', 'slap', 'stand', 'swell', 'stand', 'stack', 'stand', 'breach'], cheer: 'breach',
};
const P = (a, b, inp) => [a, b, inp];
fighter.clips = {
  move1: { x: [-62, 18], len: 2, cam: { x: -10, w: 260 }, a: [P(0.3, 0.38, { light: 1 })] },
  move2: { x: [-150, 40], len: 2.6, cam: { x: -20, w: 340 }, a: [P(0.3, 0.38, { heavy: 1 })] },
  move3: { x: [-60, 30], len: 2.4, cam: { x: 10, w: 300 }, a: [P(0.3, 0.38, { special: 1 })], b: [P(0.5, 1.1, { x: 1 })] },   // (backing off into it as it rises: popped back)
  evade: { x: [-50, 60], len: 2, cam: { x: -10, y: -50, w: 330 }, a: [P(0.8, 0.86, { guard: 1, x: -0.3, y: -1 })], b: [P(0.53, 0.61, { heavy: 1 })] },   // (swum off out of Tux's toboggan's way)
};

// ---------------------------------------------------------------- helpers
// aiming: turn f.face toward the aim at most turn rad/s, eased in and out (f.aimW). A player (cfg.bots[i] null) aims at
// the foe by default and the held way only offsets it; a bot only turns the way it holds. (Swifty's kit uses it)
export function aimAt(F, f, o, c, turn, dt) {
  const human = !F.cfg.bots || F.cfg.bots[f.i] == null, toO = Math.atan2(o.y + o.vy * 0.15 - f.y, o.x + o.vx * 0.15 - f.x);   // (on them, a touch ahead of where they're walking)
  let want = f.face;
  if (human) want = toO + (c.mag > 0.3 ? clamp(angDiff(c.dirA, toO), -1.2, 1.2) * Math.min(1, c.mag) * 0.75 : 0);
  else if (c.mag > 0.3) want = c.dirA;
  const w = clamp(angDiff(want, f.face) * 8, -turn, turn);
  f.aimW = (f.aimW || 0) + (w - (f.aimW || 0)) * Math.min(1, dt * 12);
  f.face += f.aimW * dt;
}
// the wave's front, ahead units ahead of his edge
const front = (f, ob, ahead) => { ob.x = f.x + Math.cos(ob.a) * (f.r + ahead); ob.y = f.y + Math.sin(ob.a) * (f.r + ahead); };
// where (x, y) is from a wave's front: [along its way (+ ahead of it), across it]
export const waveRel = (ob, x, y) => { const c = Math.cos(ob.a), s = Math.sin(ob.a), dx = x - ob.x, dy = y - ob.y; return [dx * c + dy * s, -dx * s + dy * c]; };
// the tail's swing: share u (0..1) of the spin, from his back (u 0) round once the way DIR goes (+1: the way angles grow)
export const SLAP_DIR = 1;
export const tailAt = (f, u) => f.face + Math.PI + SLAP_DIR * TAU * u;
// how far the slap reaches from his edge, pressed now: the tail's reach plus the lurch in
export const slapReach = mv => mv.reach + mv.lunge * mv.startup;
// does the swing from u0 to u1 pass angle a (seen from him)
function passes(f, a, u0, u1) {
  const q = ((SLAP_DIR * angDiff(a, f.face + Math.PI)) % TAU + TAU) % TAU / TAU;
  return q >= u0 - 1e-6 && q <= u1 + 1e-6;
}
// the wave breaks (its run over, a wall, or him knocked off it): whoever it carries is dropped staggered in front of
// him, or slammed down if it broke on something
function breakWave(F, ob, own, foe, M, why) {
  if (ob.carry >= 0 && foe.state === 'hurt' && !foe.gone) {
    F.hitF(own, foe, why === 'wall' ? M.move2.slam : M.move2.dump, { dir: ob.a, obj: true, noFlank: true, unblockable: true, move: 'move2' });
    F.ev('dkDump', foe.x, foe.y, why === 'wall' ? 1 : 0.7, own.i, { move: 'move2', to: foe.i, why });
  }
  ob.carry = -1; ob.ph = 'break'; ob.bt = ob.t;
  F.ev('dkBreak', ob.x, ob.y, why === 'wall' ? 0.8 : 0.6, own.i, { move: 'move2', a: ob.a, why });
}
// off the wave: landed (it caught someone) or wiped out, where it broke
function offWave(F, f, mv, hit) {
  setPh(f, hit ? 'land' : 'wipe'); f.vx *= 0.25; f.vy *= 0.25;
  if (!hit) F.whiff(f);
  F.go(f, 'recover', hit ? mv.recovery : mv.miss);
  F.ev('dkLand', f.x, f.y, hit ? 0.5 : 0.7, f.i, { move: 'move2', hit });
}
// his containers (all of them, or the ones standing: solids)
const boxes = (F, i) => F.objs.filter(b => b.kind === 'dkBox' && b.owner === i && b.t < b.life);
export const wallUp = (F, i) => F.objs.filter(b => b.kind === 'dkBox' && b.owner === i && b.ph === 'up' && b.t < b.life);
// the wall's spots: across the line from him to them, just behind them (the ends curved back toward him); off: no room
// there (the arena's wall or a solid in the way: that one isn't built)
function wallSpots(F, f, o, mv) {
  const a = toward(f, o), c = Math.cos(a), s = Math.sin(a), dm = clamp(dist(f, o) + o.r + mv.behind + mv.size / 2, mv.near, mv.far), out = [];
  for (let k = 0; k < mv.n; k++) {
    const j = k - (mv.n - 1) / 2, u = j * mv.spacing, d = dm - Math.abs(j) * mv.curve, x = f.x + c * d - s * u, y = f.y + s * d + c * u;
    const off = sd(F.A.bounds, x, y)[0] > -mv.size * 0.55 || F.A.solids.some(q => sd(q, x, y)[0] < mv.size * 0.55);
    out.push([x, y, a, off ? 1 : 0]);
  }
  return out;
}
// a slap that landed: them meeting something within the window is a slam
const slamWatch = (F, f, o, mv) => spawn(F, f, { kind: 'dkSlam', to: o.i, life: mv.slam.window, mv: 'move1' });

/** @type {Record<string, import('./index.js').Kit>} */
const kits = {
  dkWave: {
    moves: true,
    press(F, f, o, mv) {
      setPh(f, 'swell');
      const ob = spawn(F, f, { kind: 'dkWave', ph: 'swell', a: f.face, half: mv.half, carry: -1, rt: 0, bt: 0, life: 99 }); front(f, ob, 18);
    },
    wind(F, f) {   // rearing up: he settles where he is (no turning: it goes the way he faces); the swell with him
      f.vx *= 0.8; f.vy *= 0.8;
      const ob = mine(F, f, 'dkWave'); if (ob && ob.ph === 'swell') { ob.a = f.face; front(f, ob, 18); }
    },
    start(F, f, o, mv) {
      setPh(f, 'surf');
      const ob = mine(F, f, 'dkWave'); if (ob && ob.ph === 'swell') { ob.ph = 'roll'; ob.rt = 0; front(f, ob, mv.ride); ob.x0 = ob.x; ob.y0 = ob.y; }   // (x0, y0: where it set off, for its wet trail)
      F.ev('dkSurge', f.x, f.y, 0.8, f.i, { move: 'move2', a: f.face });
    },
    // riding: kept ride units behind its front (his edge), at its speed; it broke (or it's gone): off it, there
    step(F, f, o, mv, dt) {
      const ob = mine(F, f, 'dkWave');
      if (!ob || ob.ph !== 'roll' || !sameGo(f, ob)) { offWave(F, f, mv, !!(ob && ob.hit)); return; }
      const c = Math.cos(ob.a), s = Math.sin(ob.a), tx = ob.x - c * (f.r + mv.ride), ty = ob.y - s * (f.r + mv.ride);
      f.face = ob.a;
      f.vx = c * mv.speed + clamp((tx - f.x) * 12, -200, 200); f.vy = s * mv.speed + clamp((ty - f.y) * 12, -200, 200);
    },
    end(F, f, o, mv) {   // (its run over: it breaks, he lands)
      const ob = mine(F, f, 'dkWave');
      if (ob && ob.ph === 'roll') breakWave(F, ob, f, o, f.stats.moves, 'end');
      offWave(F, f, mv, !!(ob && ob.hit));
      return true;
    },
    phases: mv => [['swell', 'wind', mv.startup, 'swell', 'rears up; the water swells on the floor in front of him'],
      ['surf', 'strike', 'up to ' + mv.run, 'ram', `the slam, then he rides it (${mv.speed} u/s, ${mv.half * 2} wide): catches whoever it reaches (${mv.damage}), carries them`],
      ['land', 'recover', mv.recovery, 'surge', `caught someone: where it breaks they're dropped staggered in front of him (${mv.dump.damage}, ${mv.dump.stun} s), or slammed down on a wall (${mv.slam.damage})`],
      ['wipe', 'recover', mv.miss, 'surge', 'caught nobody: wipes out where it breaks, open']],
  },
  dkSlap: {
    press(F, f) { setPh(f, 'coil'); F.ev('dkCoil', f.x, f.y, 0.4, f.i, { move: 'move1' }); },
    wind(F, f, o, mv) {   // the twist, lurching in a step toward them (to where his tail's tip meets them, not into them)
      const a = toward(f, o), room = dist(f, o) - f.r - o.r - mv.tip - 10, v = room > 0 ? Math.min(mv.lunge, room * 10) : 0;
      f.vx = Math.cos(a) * v; f.vy = Math.sin(a) * v;
    },
    start(F, f) { setPh(f, 'slap'); f.vx *= 0.3; f.vy *= 0.3; F.ev('dkSwing', f.x, f.y, 0.7, f.i, { move: 'move1' }); },
    step(F, f, o, mv, dt) {
      f.vx *= 0.7; f.vy *= 0.7;
      if (f.hit || !open(o) || o.gone || o.inv > 0) return;
      const u1 = clamp(f.t / mv.active, 0, 1), u0 = Math.max(0, (f.t - dt) / mv.active), a = toward(f, o);
      if (dist(f, o) - f.r - o.r > mv.reach || !passes(f, a, u0 > 0 ? u0 : -1, u1)) return;
      const tip = dist(f, o) - f.r - o.r > mv.tip;   // (off the tip of his tail: launched and down; inside it, his body's bump: staggered)
      if (F.hitF(f, o, tip ? mv : mv.near, { dir: a + SLAP_DIR * mv.sweep, noFlank: true, move: 'move1' })) {
        f.hit = true;
        if (F.lastRes === 'hit') {
          F.hitstop = Math.max(F.hitstop, (tip ? 10 : 5) / 60);
          if (tip && o.state === 'down') { o.dur += mv.down; slamWatch(F, f, o, mv); }
          F.ev('dkSmack', (f.x + o.x) / 2, (f.y + o.y) / 2, tip ? 1 : 0.5, f.i, { move: 'move1', to: o.i, a: a + SLAP_DIR * mv.sweep, tip });
        }
      }
    },
    end(F, f, o, mv) {
      if (f.hit) { setPh(f, 'follow'); F.go(f, 'recover', mv.recovery); }
      else { F.whiff(f); setPh(f, 'unwind'); F.go(f, 'recover', mv.miss); }
      return true;
    },
    phases: mv => [['coil', 'wind', mv.startup, 'coil', `twisted the other way, his tail cocked back high, lurching in at ${mv.lunge} u/s`], ['slap', 'strike', mv.active, 'slap', `the spin: his tail round once, hitting anyone within ${mv.reach} of his edge; off its tip (past ${mv.tip}): ${mv.damage}, kb ${mv.kb}, down ${mv.down} s longer (into a wall or a container: +${mv.slam.damage}, ${mv.slam.down} s more); closer: ${mv.near.damage}, staggered`],
      ['follow', 'recover', mv.recovery, 'slap', 'hit: a short settle'], ['unwind', 'recover', mv.miss, 'slap', 'missed: unwinding, open']],
  },
  dkWall: {
    press(F, f, o, mv) {
      setPh(f, 'stack');
      for (const b of boxes(F, f.i)) if (b.ph === 'up' || b.ph === 'rise') { b.ph = 'sink'; b.z = 1; b.st = b.t; b.life = b.t + mv.sink; }   // (one wall at a time: the last one sinks)
      wallSpots(F, f, o, mv).forEach(([x, y, a, off], k) => spawn(F, f, { kind: 'dkBox', shape: 'box', x, y, w: mv.size, h: mv.size, r: 3, z: 999, ph: 'mark', k, a, off, solid: 1, rt: 0, ut: 0, ct: -9, life: 99 }));
      F.ev('dkStack', f.x, f.y, 0.5, f.i, { move: 'move3' });
    },
    wind(F, f, o, mv) {   // the cracks follow them as he stacks
      f.vx *= 0.8; f.vy *= 0.8;
      const sp = wallSpots(F, f, o, mv);
      for (const b of F.objs) if (b.kind === 'dkBox' && b.owner === f.i && b.ph === 'mark' && sameGo(f, b)) [b.x, b.y, b.a, b.off] = sp[b.k];
    },
    start(F, f, o, mv) {
      setPh(f, 'build');
      let any = false;
      for (const b of F.objs) if (b.kind === 'dkBox' && b.owner === f.i && b.ph === 'mark' && sameGo(f, b)) { if (b.off) gone(b); else { b.ph = 'rise'; b.rt = 0; any = true; } }
      F.ev('dkBuild', f.x, f.y, 0.6, f.i, { move: 'move3', any });
    },
    step(F, f) { f.vx *= 0.8; f.vy *= 0.8; },
    phases: mv => [['stack', 'wind', mv.startup, 'stack', `the tower on his back; ${mv.n} cracks in the floor behind them, following them`], ['build', 'strike', mv.active, 'surge', `the wall rises out of the floor in ${mv.rise} s (${mv.n} containers, ${mv.size} square, two high); rising under someone: popped toward him (${mv.damage})`],
      ['build', 'recover', mv.recovery, 'surge', ''], ['(the wall)', '', mv.life, '', `solid; sinks in ${mv.sink} s`]],
  },
  dkSwim: {
    moves: true,
    start(F, f, o, mv) {
      const c = F.ctl(f), a = c.mag > 0.3 ? c.dirA : toward(o, f), [x, y] = landing(F, f, o, a, mv.dist);
      setPh(f, 'swim'); f.inv = Math.max(f.inv, 2 / 60); f.gone = 1; f.face = a;
      f.sx = f.x; f.sy = f.y; f.bx = x; f.by = y; f.vx = (x - f.x) / mv.active; f.vy = (y - f.y) / mv.active;
      F.ev('dkDive', f.x, f.y, 0.6, f.i, { move: 'evade', x2: x, y2: y, a });
    },
    // (steered onto the spot: it gets there)
    step(F, f, o, mv, dt) { f.inv = Math.max(f.inv, 2 / 60); f.gone = 1; const left = Math.max(dt, f.dur - f.t + dt); f.vx = (f.bx - f.x) / left; f.vy = (f.by - f.y) / left; },
    end(F, f, o, mv) {
      if (Math.hypot(f.bx - f.x, f.by - f.y) < 12) { f.x = f.bx; f.y = f.by; }
      f.inv = 0; f.gone = 0; f.vx *= 0.15; f.vy *= 0.15; setPh(f, 'surface'); F.go(f, 'recover', mv.recovery);
      F.keepIn(f);
      F.ev('dkSurface', f.x, f.y, 0.6, f.i, { move: 'evade' });
      return true;
    },
    phases: mv => [['swim', 'strike', mv.active, '(under the water)', `swims ${mv.dist} the held way (else away), fast: untouchable, not there to bump`], ['surface', 'recover', mv.recovery, 'breach', 'surfaces with a small splash: open']],
  },
};

/** @type {Record<string, import('./index.js').ObjStep>} */
const objs = {
  // the Tidal Wave: a swell on the floor while he rears up (tied to that go), then rolling out along a with him riding
  // it; it catches the foe once and carries them at its front; its run over, meeting a wall, a pillar or a container,
  // or him knocked off it, it breaks (a short splash, then gone)
  dkWave(F, ob, dt, own, foe, M) {
    const mv = M.move2;
    if (ob.ph === 'swell') { if (!(sameGo(own, ob) && own.state === 'wind')) gone(ob); return; }
    if (ob.ph === 'break') { if (ob.t - ob.bt >= 0.45) gone(ob); return; }
    if (!sameGo(own, ob) || own.state !== 'strike') { breakWave(F, ob, own, foe, M, 'end'); return; }   // (knocked off it)
    ob.rt += dt;
    const c = Math.cos(ob.a), s = Math.sin(ob.a);
    ob.x += c * mv.speed * dt; ob.y += s * mv.speed * dt;
    // whoever it carries: kept at its front, drifting a little toward its middle; out of it (slammed into a wall, or
    // the hold wore off), let go
    if (ob.carry >= 0) {
      if (foe.state !== 'hurt' || foe.gone) ob.carry = -1;
      else {
        const [al, lat] = waveRel(ob, foe.x, foe.y), push = mv.speed + clamp((foe.r * 0.5 - al) * 10, -120, 160), side = clamp(-lat * 2, -60, 60);
        foe.vx = c * push - s * side; foe.vy = s * push + c * side;
      }
    }
    if (ob.rt >= mv.run) { breakWave(F, ob, own, foe, M, 'end'); return; }
    if (F.contactsAll(ob.x + c * 4, ob.y + s * 4, 8).length) { breakWave(F, ob, own, foe, M, 'wall'); return; }
    if (ob.hit || ob.carry >= 0 || !open(foe) || foe.gone || foe.inv > 0) return;
    const [al, lat] = waveRel(ob, foe.x, foe.y);
    if (al > foe.r || al < -mv.depth - foe.r || Math.abs(lat) > ob.half + foe.r * 0.6) return;
    if (!F.hitF(own, foe, mv, { dir: ob.a, obj: true, noFlank: true, unblockable: true, move: 'move2' })) return;   // (down or getting up: it washes over them)
    ob.hit = true;
    if (F.lastRes === 'hit' && foe.state === 'hurt') { ob.carry = foe.i; F.ev('dkCatch', foe.x, foe.y, 0.7, own.i, { move: 'move2', to: foe.i }); }
  },
  // a container of Compose Up: a crack in the floor while he stacks (mark: tied to that go), rising out of the floor
  // (not solid yet), then standing (solid: rising under the foe, it pops them toward him), then sinking back (not solid)
  dkBox(F, ob, dt, own, foe, M) {
    const mv = M.move3;
    if (ob.ph === 'mark') { if (!(sameGo(own, ob) && own.state === 'wind')) gone(ob); return; }
    if (ob.ph === 'sink') return;   // (its life ends it)
    if (ob.ph === 'rise') {
      ob.rt += dt;
      if (ob.rt < mv.rise) return;
      ob.ph = 'up'; ob.z = 0; ob.ut = ob.t; ob.life = ob.t + mv.life + mv.sink;
      F.ev('dkUp', ob.x, ob.y, 0.5, ob.owner, { move: 'move3', k: ob.k });
      for (const f of F.f) {
        if (f.state === 'ko' || f.z > 20 || f.gone || sd(ob, f.x, f.y)[0] >= f.r * 0.9) continue;
        if (f === foe) {   // under it as it rises: popped toward him, out from under it
          const a = toward(foe, own);
          if (F.hitF(own, foe, mv, { dir: a, obj: true, unblockable: true, noFlank: true, move: 'move3' }) && F.lastRes === 'hit') F.ev('dkPop', foe.x, foe.y, 0.7, ob.owner, { move: 'move3', to: foe.i });
          for (let n = 0; n < 30 && sd(ob, foe.x, foe.y)[0] < foe.r; n++) { foe.x += Math.cos(a) * 2; foe.y += Math.sin(a) * 2; }
        }
        F.keepIn(f);
      }
      return;
    }
    if (ob.t >= ob.ut + mv.life) { ob.ph = 'sink'; ob.z = 1; ob.st = ob.t; F.ev('dkSink', ob.x, ob.y, 0.4, ob.owner, { move: 'move3', k: ob.k }); return; }
    // standing: the foe knocked into it (a slap, the wave, a wall bounce) clangs it
    if (ob.t - ob.ct > 0.4 && (foe.state === 'hurt' || foe.state === 'down') && Math.hypot(foe.vx, foe.vy) > 90 && sd(ob, foe.x, foe.y)[0] < foe.r + 2) {
      ob.ct = ob.t; F.ev('dkClang', ob.x, ob.y, 0.8, ob.owner, { move: 'move3', to: foe.i, k: ob.k });
    }
  },
  // a Tail Slap that knocked them down: them meeting a wall, a pillar or one of his containers while it lasts is a slam
  dkSlam(F, ob, dt, own, foe, M) {
    const S = M.move1.slam;
    if (foe.i !== ob.to || foe.state !== 'down' || foe.gone) { gone(ob); return; }
    const cs = F.contactsAll(foe.x, foe.y, foe.r + 2); if (!cs.length) return;
    let c = cs[0]; for (const k of cs) if (k.pen > c.pen) c = k;
    foe.hp = Math.max(0, foe.hp - S.damage * F.dmgMul); foe.flash = 0.2; foe.dur += S.down;
    F.hitstop = Math.max(F.hitstop, 6 / 60);
    F.ev('dkSlamIn', foe.x - c.nx * foe.r, foe.y - c.ny * foe.r, 1, own.i, { move: 'move1', to: foe.i, box: c.solid && c.solid.kind === 'dkBox' ? c.solid.id : 0, nx: c.nx, ny: c.ny });
    if (foe.hp <= 0) { F.release(foe); foe.move = null; F.go(foe, 'ko'); F.ev('ko', foe.x, foe.y, 1, foe.i); }
    gone(ob);
  },
};

// ---------------------------------------------------------------- the bot
const unitA = a => [Math.cos(a), Math.sin(a)];
// a bot's aim: at where it sees them (o: perceive(), late), led only partly (lead s x up to 0.8 by level: L.smart) and
// off to one side by a per-throw error (about 45 units at Chill, 30 at Normal, 17 at Ruthless), kept for the whole go
// (C.K, by its ms). Returns the angle. (Swifty's kit uses it)
export function botAim(C, me, o, lead) {
  const K = C.K;
  if (K.aimFor !== me.ms + ':' + me.move) { K.aimFor = me.ms + ':' + me.move; K.aimErr = (55 - 48 * C.L.smart) * (0.85 + 0.3 * C.rng()) * (C.rng() < 0.5 ? -1 : 1); }
  const q = lead * 0.8 * C.L.smart, x = o.x + o.vx * q, y = o.y + o.vy * q, a = Math.atan2(y - me.y, x - me.x);
  return Math.atan2(y + Math.cos(a) * K.aimErr - me.y, x - Math.sin(a) * K.aimErr - me.x);
}
// something solid right behind them (seen from x, y): a wall, a pillar or one of his containers within ahead units
const backed = (F, x, y, o, ahead) => { const a = Math.atan2(o.y - y, o.x - x); return F.contactsAll(o.x + Math.cos(a) * ahead, o.y + Math.sin(a) * ahead, o.r).length > 0; };
// a HIT's danger to the other bot (Tail Slap, seen through perceive(): o is Docky a moment late): his twist or his spin
// seen with them in reach, back off out of it (or evade); and up close while it's ready, keep out of his reach, lurch
// and all (spacing: a fresh look every half second)
function slapThreat(F, i, me, o, out) {
  const ow = F.f[1 - i], mv = ow.stats.moves.move1, R = slapReach(mv), gap = Math.hypot(me.x - o.x, me.y - o.y) - me.r - ow.r, away = Math.atan2(me.y - o.y, me.x - o.x);
  if (o.move === 'move1' && (o.state === 'wind' || o.state === 'strike')) {
    const need = (o.state === 'wind' ? R : mv.reach) + 14 - gap;
    if (need > 0) out.push(['k' + Math.round((o.T - o.t) * 60) + o.state, o.state === 'wind' ? Math.max(0, o.left) : 0, o.state === 'wind' ? mv.active : Math.max(0.02, o.left), away, need]);
  } else if ((o.state === 'idle' || o.state === 'walk') && !(o.cd && o.cd[0] > 0.3) && gap < R + 6) {
    const need = R + 12 - gap, T = 0.12 + need / (150 * me.stats.walk * 0.85);   // (always walkable: it's spacing, not a dodge)
    out.push(['n' + Math.floor(F.time * 2), T, 0.05, away, need, 1]);   // (1: soft, spacing not an attack)
  }
}
/** @type {import('./index.js').BotHooks} */
const ai = {
  want: 84,   // (a bruiser: close, in his tail's reach)
  // his character (js/fight-style.js): a patient bruiser, waits for the opening and makes it count
  persona: { patient: 0.35, aggr: 0.3, styles: [1.3, 1.5, 0.6], like: [1.1, 1, 1, 1] },
  // Docky's dangers to the other bot: the wave (its swell while he rears up, then rolling), the slap, the wall rising
  // under them, and being boxed in against it with him close (round its nearer end)
  threats(F, i, me, o) {
    const out = [], ow = F.f[1 - i], M = ow.stats.moves, mv = M.move2, W3 = M.move3;
    for (const b of F.objs) {
      if (b.owner === i || b.t < o.age || b.t >= b.life) continue;
      if (b.kind === 'dkWave' && b.ph !== 'break') {   // the wave: out of its way, sideways
        const [al, lat] = waveRel(b, me.x, me.y), need = b.half + me.r * 0.6 + 10 - Math.abs(lat);
        if (need <= 0 || al < -mv.depth - me.r) continue;
        const T = (b.ph === 'swell' ? Math.max(0, ow.state === 'wind' && ow.move === 'move2' ? ow.dur - ow.t : 0) : 0) + Math.max(0, al - me.r) / mv.speed;
        if (b.ph === 'roll' && T > mv.run - b.rt + 0.05) continue;   // (it breaks before it gets there)
        out.push(['w' + b.id, T, (mv.depth + 2 * me.r) / mv.speed, b.a + (lat >= 0 ? 1 : -1) * Math.PI / 2, need]);
      } else if (b.kind === 'dkBox' && (b.ph === 'mark' || b.ph === 'rise') && !b.off) {   // rising under them: off it sideways (not back)
        const c = Math.cos(b.a), s = Math.sin(b.a), dx = me.x - b.x, dy = me.y - b.y, al = dx * c + dy * s, lat = -dx * s + dy * c;
        if (Math.abs(al) > b.w / 2 + me.r * 0.9) continue;
        const need = b.w / 2 + me.r + 6 - Math.abs(lat) + (W3.n - 1) / 2 * W3.spacing * (b.k === (W3.n - 1) / 2 ? 1 : 0.4);
        if (need <= 0) continue;
        const T = (b.ph === 'mark' ? Math.max(0, ow.state === 'wind' && ow.move === 'move3' ? ow.dur - ow.t : 0) : 0) + W3.rise - b.rt;
        const side = b.k === (W3.n - 1) / 2 ? (lat >= 0 ? 1 : -1) : (b.k > (W3.n - 1) / 2 ? 1 : -1);
        out.push(['c' + b.id, T, 0.05, b.a + side * Math.PI / 2, need]);
      }
    }
    // boxed in: his wall right behind us, him close and the slap ready: round its nearer end, along it
    const up = wallUp(F, 1 - i);
    if (up.length && (o.state === 'idle' || o.state === 'walk') && Math.hypot(me.x - o.x, me.y - o.y) < me.r + ow.r + slapReach(M.move1) + 60) {
      const near = up.find(b => sd(b, me.x, me.y)[0] < me.r + 24);
      if (near) {
        const a = near.a, c = Math.cos(a), s = Math.sin(a), mx = up.reduce((q, b) => q + b.x, 0) / up.length, my = up.reduce((q, b) => q + b.y, 0) / up.length;
        const lat = -(me.x - mx) * s + (me.y - my) * c, half = up.length * W3.size / 2 + me.r + 12, side = lat >= 0 ? 1 : -1;
        out.push(['p' + Math.floor(F.time * 2), 0.35, 0.05, a + side * Math.PI / 2 - side * 0.35, Math.max(8, half - Math.abs(lat)), 1]);
      }
    }
    slapThreat(F, i, me, o, out);
    return out;   // (his Swim: nothing comes out of it; the foe's punish follows him up: fight-ai.js punishK)
  },
  // in a move: nothing to aim (the wave goes the way he faced, the slap's all round, the wall finds them)
  stick() { return [0, 0]; },
  // open: the slap if they're in his reach (it comes out at once), else the wave on a clear line (it closes in), else,
  // knocked down, the wall behind them as they get up
  punish(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap, toFoe } = C.g, R = slapReach(M.move1);
    if (C.ready(0) && gap < R - 6 && w.fits(M.move1.startup + M.move1.active * 0.5)) { C.fire(0); return [0, 0]; }
    // open a while, a step or two away: walk in for the slap (it goes next think, from the neutral)
    if (C.ready(0) && gap < 110 && w.b - M.move1.startup - M.move1.active * 0.5 > (gap - R + 8) / (150 * me.stats.walk) + 0.3 && C.rng() < 0.6) return C.unit(toFoe);
    if (w.line && C.ready(1) && d < 280 && w.fits(M.move2.startup + Math.max(0, gap - M.move2.ride) / M.move2.speed)) { C.fire(1); return [0, 0]; }
    if ((o.state === 'down' || o.state === 'getup') && C.ready(2) && !wallUp(F, i).length && d < 190 && !backed(F, me.x, me.y, o, 30) && C.rng() < 0.3 + 0.4 * C.L.smart) { C.fire(2); return [0, 0]; }
    return null;
  },
  neutral(F, i, me, o, C, w) {
    const { dist: d, gap, toFoe } = C.g, M = me.stats.moves, R = slapReach(M.move1);
    const pinned = backed(F, me.x, me.y, o, 34), walled = wallUp(F, i).length > 0;
    // the slap: his bread and butter, thrown about as often as a person would, whenever they're in its reach and it
    // isn't plainly unsafe (their own hit out now, or their wind-up about to land first); keenest pinned on something
    // (a slam) or while they're stuck
    const long = o.left > M.move1.startup + M.move1.active * 0.5 + 0.05;   // (the wind-up or recovery seen still has a while to run)
    // on a free foe in reach: a sharp player swings it whenever it's on, a casual one now and then (keen at Chill up to
    // keenHi at Ruthless, kept with the move's numbers so they're tuned with them)
    const keen = M.move1.keen + (M.move1.keenHi - M.move1.keen) * (C.L.smart - 0.2) / 0.6;
    // hugged, inside the tip (only a stagger there): the better the bot, the likelier it backs off a step to put them on
    // the tip first, as a person who knows the move would
    if (C.ready(0) && gap < M.move1.tip - 2 && (o.state === 'idle' || o.state === 'walk') && C.rng() < 0.75 * C.L.smart) return C.unit(toFoe + Math.PI);
    w.add(0, gap < R - 4 ? (o.state === 'strike' ? 0.08 : o.state === 'wind' && long ? 0.9 : pinned ? 0.9 : w.busy && long ? 0.85 : o.state === 'wind' ? 0.15 : keen) : 0, [0, 0]);
    // the wall behind them, from close-ish, when there's room behind them (not already on a wall); keener behind one
    // backing off from him, or the wave just dropped
    const backing = (o.vx * (o.x - me.x) + o.vy * (o.y - me.y)) / Math.max(1, d) > 50, waved = o.state === 'hurt' || o.state === 'stagger';
    // (the Wave, then Compose Up behind them, then the Slap: a bot keen on its setups, C.L.setup, more so)
    w.add(2, !walled && d > 60 && d < 190 && !pinned && !backed(F, me.x, me.y, o, 70) ? (w.busy ? (waved ? 0.5 * (0.6 + (C.L.setup ?? 0.5)) : 0.35) : backing ? 0.25 + 0.2 * C.L.smart : 0.12 + 0.08 * C.L.smart) : 0, [0, 0]);
    // the wave: to close in from further off, and keen when something's behind them (a slam)
    const behind = backed(F, me.x, me.y, o, 90);
    w.add(1, w.line && d > 100 && d < 260 ? (behind ? 0.4 : w.busy ? 0.32 : d > 180 ? 0.16 : 0.06) : 0, [0, 0]);
    // pinned on a wall with them close: a swim out toward the middle (it's his way out, not an attack)
    w.add(3, C.g.cl.d < 36 && gap < 70 && !pinned ? 0.12 + 0.15 * C.L.smart : 0, C.unit(C.g.toC));
    // his wall up behind them: walk in on them (they're boxed in)
    if (walled && gap > R - 10) return C.unit(toFoe);
    return null;
  },
  // under the water he's untouchable for the whole swim, and swims a good way off: through it, or out of it
  evadeWhen(T, dur, E) { return [T > 0.03 && T + dur < E.active - 0.05, T + dur < E.active - 0.05]; },
  // the Swim answering something thrown from out of his reach (a zoner's shot, a ray, a wave): a sharp player swims in
  // under it at them, to surface in his tail's reach, rather than away (where they keep him out)
  evadeWay(F, i, me, o, C, a) {
    const M = me.stats.moves, gap = C.g.gap;
    if (gap < slapReach(M.move1) + 40 || gap > M.evade.dist + slapReach(M.move1) + 20) return a;
    return C.rng() < (C.L.smart - 0.3) / 0.5 ? C.g.toFoe : a;
  },
};

export default { id: ID, fighter, kits, objs, ai };
