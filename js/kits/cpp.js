// @ts-check
// Cpp (Keith, the C++ rat) for Fight: a utility fighter built round his flies (plug-in shape: js/kits/index.js;
// drawing: js/art/kit-cpp.js).
// move1 Dangling Pointer (cpFlick): a fly flicked at medium range sticks to whoever it hits (a chip, then it nibbles
// for a few seconds; carrying flies, his sludge slows you harder). A miss settles over his nearest sludge as a sentry
// that darts at anyone close. Answer: step off its line; an evade (or a fast dash) swats half the flies on you off.
// move2 Use After Free (cpFree): every fly of his rises, then dives at you; each bites, two or more stagger, all used
// up. Answer: evade as they rise.
// move3 Memory Leak (cpLeak, hold to steer): he scurries off the held way laying a sludge trail that poisons (fight.js
// poison: slowed, no evade, no damage). Two trails at a time; the sludge breeds a sentry fly every few seconds.
// evade Play Dead (cpDead): untouchable on his back, a stink puff slows the foe, then he flips up in a sludge puddle,
// open for a moment.
// Passive Sewer Rat: on his own sludge he skates; everyone else wades.
// Sludge (cpleak): pts [[x, y, at (laid, the object's own time)]], r, goo (how long a blob lasts), src 'leak' (a trail)
// | 'dead' (a puddle), on (the foe in it).
// Flies (cpfly, one object each): st 'fly' (flicked: vx, vy, d travelled) | 'stuck' (oa its spot round them, sT time
// left) | 'sentry' (at hx, hy: ttl time left off his sludge, rest its re-arm) | 'dart' (dT) | 'rise' (called; was the
// state before) | 'dive' (dT, wv the call it's in); z its height.
// Fighter fields: brT (the breeding clock), uaN / uaW (bites landed in call uaW: the stagger), ghost, aimW, skT, sk.
// Phases (f.ph): flick, flung · call, sic, called · shudder, leak, leakend · dead, scramble · skate (drawing only).
// Events: cpFlick (a), cpStick (to, id), cpSettle (id, goo), cpDart (id), cpHatch (id), cpSwat (n, x, y), cpShoo,
// cpCall (n), cpDive (n), cpBite (to), cpMiss, cpSwarm (to), cpLeak, cpGoo (to), cpDead, cpUp (the splash).
import { Math } from '../detmath.js';
import { clearance } from '../fight-arenas.js';
import { AIM, angDiff, dist, gone, inside, open, sameGo, segDist, setPh, spawn, toward } from './lib.js';

const ID = 'cpp';
/** @type {import('./index.js').FighterData} */
const fighter = {
  id: ID, name: 'Cpp', lang: 'C++', role: 'Utility',
  blurb: 'Keith, a scruffy rat with no safety checks, and the sewer is his: he flicks flies that stick to you, lays sludge that poisons you (slow, no dodging) and breeds more of them, then calls the whole swarm down on you at once.',
  tagline: 'Sewer rat: sticky flies, poison sludge, then the whole swarm at once.',   // (the select screen's one line; the blurb stays on its Moves tab)
  difficulty: 'hard',   // (the select screen's Easy / Medium / Hard: how much it takes to play well)
  passive: 'Sewer Rat: he skates on his own sludge (quicker); everyone else wades.',
  balance: 'Utility (2026-10-27, rebuilt round his flies): he wants mid range, tagging you with flies and seeding sentries over his long-lasting sludge, then cashing them in with Use After Free (most of his damage: the bites); he has no quick hit up close and Play Dead is his only get-off-me, and he works his swarm far less as a sloppy bot. Those who get on him and hit hard, or whose evade swats the flies as he calls them, are his hard side (Duke, Docky, Tux, Ferris, Gopher ~5-28% at Ruthless), the keep-away and the slow who stand off in his flies his good one (Swifty, whose light pokes can\'t race his swarm, ~95-100%; Bugdroid, Octo ~60-75%). About 57% (Chill) to 43% (Ruthless) of bot fights, 2026-10-27 (all 4 arenas, 40 fights a pair). 2026-10-29, the approved kit changes (no sludge damage but the shared poison, a quicker, longer, wider leak, the swarm staggering at 2 bites and an evade swatting half the flies, a longer stink: from 19% / 26%): about 44% at Normal and 50% at Ruthless (the ring, 16 / 12 fights a pair). 2026-10-29, the balance pass (all four arenas, 40 fights a pair, about ±5): 52% Chill, 47% Normal, 60% Ruthless (a swarm\'s bite 2.5 + 1.5 a fly -> 3.5 + 0.7: a full swarm of five 42 -> 31, so the big swarms the sharp bots saved up stop deciding fights: he was 74% at Ruthless, 88-90% against Tux, Duke, Octo and Swifty). He\'s still best at Ruthless (the swarm needs upkeep) and on Pillar Court (59-77%: the pillars break up a rush at him). 2026-10-30, the balance check (40 fights a pair, all four arenas, about ±4 overall): 36% Chill, 47% Normal, 56% Ruthless; the poison lingers 0.8 s off the trail (1.2: measured no change by itself). Octo is his best matchup (80% at Normal and Ruthless): Octo\'s tentacle runs out a track first and he skates off it on his sludge (half of Octo\'s blames miss him at Ruthless, against a fifth on Bugdroid), while his flies are quick and Octo\'s Ink Jet is his only swat. 2026-10-30, the user ("sludge slightly slower, flies slightly less damage": the leak 320 -> 295 u/s, a bite 3.5 + 0.7 -> 3.25 + 0.65): about 34% Chill, 34% Normal, 50% Ruthless (40 fights a pair; the bite is what moves him, the slower leak barely does). Then a little stronger all round (the user: "buff cpp all around slightly"): 32 / 44 / 46% (fight-odds, 40 a pair); Octo now rushes him before he\'s set up (Octo 48% at Normal).',
  hp: 116, weight: 0.84, walk: 1.15, accel: 30, friction: 30, kbDecay: 3.3, radius: 15, slipMul: 0.22,
  skate: 1.45,   // (Sewer Rat: his walking on his own sludge)
  moves: {
    move1: { name: 'Dangling Pointer', short: 'Pointer', do: 'cpFlick', icon: 'cpFlick', hold: null,
      blurb: 'He flicks a fly at medium range. It sticks to you, nibbles a little and makes his sludge slow you harder; a miss settles over his sludge as a sentry that darts at anyone who comes close.',
      tell: 'He draws his paw back with a fly on it, then it zips out in a straight line.',
      answer: 'Step off its line. Your evade (or a fast dash) swats half the flies on you off, and keep clear of the sentries hovering over his sludge.',
      // startup the wind-up, active the flick: the fly flies speed u/s up to range, sticking to whoever it meets (r:
      // reach round their edge), then buzzes for stick s. Missed, it settles over his sludge within seek (else there)
      // as a sentry for sentry s (counted only off his sludge), darting at anyone within sense at dart u/s for up to
      // dartT s (rearm s after a miss). At most cap flies at once; each fly on them slows them flySlow more in his
      // sludge (up to three)
      startup: 0.15, active: 0.05, recovery: 0.22, cooldown: 1.2, damage: 2.3, kb: 0,
      speed: 440, range: 210, r: 8, stick: 4.5, buzz: 0.15, seek: 120, sentry: 9, sense: 42, dart: 340, dartT: 0.5, rearm: 1.2, cap: 5, flySlow: 0.08 },
    move2: { name: 'Use After Free', short: 'Free', do: 'cpFree', icon: 'cpFree', hold: null,
      blurb: 'He calls his swarm: every fly of his in the arena, on you or hovering as a sentry, dives at you. Each one bites, two or more together stagger you, and they\'re used up. Needs flies out.',
      tell: 'He rears up and whistles, and his flies lift off (the ones on you first), gathering over you.',
      answer: 'Evade as they lift off: it swats half the ones on you away and the rest dive into nothing. Don\'t carry flies round him; he\'s open after the call.',
      // startup the call (flies rise), then each homes at dive u/s for up to diveT s: a bite each (damage, + more per
      // other fly in the call), stagN bites in one call stagger for stagT s. Only with a fly out
      startup: 0.42, active: 0.08, recovery: 0.3, cooldown: 2.5, damage: 3.35, more: 0.67,
      kb: 70, stun: 0.2, stale: false,
      dive: 620, diveT: 1.2, stagN: 2, stagT: 0.6 },
    move3: { name: 'Memory Leak', short: 'Leak', do: 'cpLeak', icon: 'cpLeak', hold: 'steer',
      blurb: 'A quick scurry in or out, steering the way he holds, leaving a wide trail of sludge that poisons you: you wade through it slowly and can\'t use your evade, for a moment after you step out too. It lasts, two trails at a time, and it breeds flies: every few seconds a new one hatches over it. He skates on it; you wade.',
      tell: 'The trail of grey-green sludge itself, and the flies hovering over it.',
      answer: 'Walk round it and keep off it: his flies hatch and wait there. Rush him before the swarm builds. He can be hit while he scurries.',
      // startup the shudder, then he scurries speed u/s for active s, steering up to steer rad/s the held way (else
      // straight, sliding along walls); a blob (radius r) every gap units, each lasting goo s; at most trails of them
      // (a new one dries up the oldest). In it: poisoned (x slow, no evade) and psn s after. His sludge breeds a sentry
      // every breed s (twice as fast with two or more pieces)
      startup: 0.12, active: 0.95, recovery: 0.26, cooldown: 3.2, damage: 0, kb: 0,
      speed: 305, steer: 2.6, gap: 12, r: 24, goo: 12, trails: 2, slow: 0.62, psn: 0.8, breed: 8 },
    evade: { name: 'Play Dead', short: 'Play Dead', do: 'cpDead', icon: 'cpDead', hold: null,
      blurb: 'Flops onto his back, legs in the air, untouchable, and a stink puff spreads round him that slows you down. Then he flips up in a splash of sludge.',
      tell: 'A rat on his back in a green-grey stink cloud.', answer: 'Keep out of the stink and the splash; meet him as he scrambles up: he\'s open for a moment.',
      // dead active s (untouchable, rooted), then the scramble (recovery s, open) and the splash (a puddle r pr lasting
      // plife s, at most pn); the stink: r round him, life s, x the foe's walking speed in it
      startup: 0, active: 0.45, recovery: 0.2, cooldown: 2, r: 52, life: 2.4, slow: 0.5, pr: 26, plife: 9, pn: 2 },
  },
  phPose: { flick: 'wind', flung: 'strike', call: 'rear', sic: 'chomp', called: 'chomp', shudder: 'wind', leak: 'scurry', leakend: 'pant', dead: 'dead', scramble: 'wind' },
  phFade: ['flung', 'called', 'scramble', 'leakend'],
  show: ['stand', 'wind', 'strike', 'stand', 'scurry', 'stand', 'rear', 'dead'], cheer: 'gnaw',
  // (ghost: bodies pass over him: fight.js collide; aimW: the leak's turn rate; skT: the step he last skated (F.time),
  // wdT the foe last waded; sk 0..1: how much he's skating (drawing); brT: the breeding clock; uaN: bites landed in
  // call uaW)
  fields: { ghost: 0, aimW: 0, skT: -1, wdT: -1, sk: 0, brT: 0, uaN: 0, uaW: -1 },
  tick(F, f, dt) {
    if (f.move !== 'evade') f.ghost = 0;
    if (f.sk > 0) f.sk = Math.max(0, f.sk - dt * 4);
    breed(F, f, dt);
  },
};
const P = (a, b, inp) => [a, b, inp];
// a fly of fighter 0's set by hand in a clip: stuck on fighter 1, or a sentry at (x, y)
const clipFly = (F, st, x, y, k) => { const f = F.f[0]; spawn(F, f, { kind: 'cpfly', st, x, y, z: st === 'stuck' ? 26 : 22, hx: x, hy: y, on: st === 'stuck' ? 1 : -1, oa: k * 2.4, sT: 9, ttl: 9, rest: 0, dT: 0, was: '', wv: -1, wn: 0, mv: null, life: 99 }); };
fighter.clips = {
  move1: { x: [-130, 60], len: 2.4, cam: { x: -20, w: 320 }, a: [P(0.3, 0.38, { light: 1 })] },   // (a fly at Tux: it sticks and buzzes on him)
  // (two flies on Tux and two sentries over a puddle: he calls them, they rise and dive, the bites stagger Tux)
  move2: { x: [-120, 50], len: 2.6, cam: { x: -20, y: -15, w: 320 }, a: [P(0.45, 0.53, { heavy: 1 })],
    set: F => { const f = F.f[0]; spawn(F, f, { kind: 'cpleak', pts: [[-30, -70, 0], [-14, -74, 0], [2, -70, 0]], r: 20, goo: 9, src: 'dead', on: 0, mv: null, life: 9 }); clipFly(F, 'stuck', 50, 0, 0); clipFly(F, 'stuck', 50, 0, 1); clipFly(F, 'sentry', -28, -72, 2); clipFly(F, 'sentry', 0, -70, 3); } },
  move3: { x: [-120, 30], len: 2.8, cam: { x: 30, w: 380 }, a: [P(0.3, 0.38, { special: 1 }), P(0.5, 0.72, { x: 1, y: -1 }), P(0.72, 0.95, { x: 1, y: 1 }), P(1.45, 2.6, { x: -1, y: 0.5 })], b: [P(1.5, 2.1, { x: 0, y: -1 })] },   // (past Tux, then Tux walks into it, and he skates back along it)
  evade: { x: [-40, 110], len: 2.4, cam: { x: 10, w: 300 }, a: [P(0.82, 0.88, { guard: 1 })], b: [P(0.53, 0.61, { heavy: 1 })] },   // (played dead under Tux's toboggan)
};

// ---------------------------------------------------------------- sludge
// the foe can step in things right now (not down, getting up, up in the air or out)
const grounded = o => o.z < 6 && !o.gone && !o.air && !['ko', 'down', 'getup', 'grabbed'].includes(o.state);
const phased = o => o.inv > 0 || o.under || o.gone;
// a blob is wet now: laid and not dried
const wet = (ob, p) => ob.t >= p[2] && ob.t - p[2] < ob.goo;
const sludges = (F, own) => F.objs.filter(b => b.kind === 'cpleak' && b.owner === own && b.t < b.life);
// health eaten straight off (the sludge, a fly nibbling): no flinch; a KO as hitF's
function drain(F, own, o, dmg) {
  if (o.state === 'ko' || o.inv > 0) return;
  o.hp = Math.max(0, o.hp - dmg * F.dmgMul * (own.stats.dmgOut || 1) * (o.stats.dmgIn || 1));
  if (o.hp <= 0) { F.release(o); o.move = null; F.go(o, 'ko'); F.ev('ko', o.x, o.y, 1, o.i); }
}
// walking slowed (or, k > 1, sped up): this step's walk partly taken back (or added to: the sim moved them already)
function pace(F, o, k, dt) {
  if (o.z > 0 || !(o.state === 'walk' || o.state === 'idle')) return;
  o.x += o.vx * dt * (k - 1); o.y += o.vy * dt * (k - 1); F.keepIn(o);
}
// the foe's or his own middle on a wet blob of ob
const onGoo = (ob, o, k) => ob.pts.some(p => wet(ob, p) && Math.hypot(o.x - p[0], o.y - p[1]) < ob.r * (ob.src === 'leak' ? 1 : 1.05) + o.r * k);
// the nearest wet blob of his to (x, y) with at least left s to go: [distance, x, y] (or [1e9])
function nearGoo(F, own, x, y, left = 0.2) {
  let best = [1e9, 0, 0];
  for (const ob of sludges(F, own)) for (const p of ob.pts) {
    if (!wet(ob, p) || ob.goo - (ob.t - p[2]) < left) continue;
    const d = Math.hypot(x - p[0], y - p[1]); if (d < best[0]) best = [d, p[0], p[1]];
  }
  return best;
}
// a sludge object drying up now, over a moment
function dryUp(b) { for (const p of b.pts) p[2] = Math.min(p[2], b.t - b.goo + 0.3); b.life = Math.min(b.life, b.t + 0.3); }
// make room for a new piece of src: at most n of them (the oldest dries up)
function makeRoom(F, f, src, n) {
  const L = sludges(F, f.i).filter(b => b.src === src && b.pts.some(p => wet(b, p)));
  for (let k = 0; k <= L.length - n; k++) dryUp(L[k]);
}
function puddle(F, f, x, y, r, land) {
  const E = f.stats.moves.evade; makeRoom(F, f, 'dead', E.pn);
  [x, y] = inside(F, x, y, r * 0.6);
  return spawn(F, f, { kind: 'cpleak', pts: [[Math.round(x * 10) / 10, Math.round(y * 10) / 10, land]], r, goo: E.plife, src: 'dead', on: 0, mv: null, life: land + E.plife + 0.2 });
}

// ---------------------------------------------------------------- flies
const flies = (F, own) => F.objs.filter(b => b.kind === 'cpfly' && b.owner === own && b.t < b.life);
// the foe swats flies off now: in their evade, out of reach (underground, gone), or dashing fast in a move
const swatting = o => (o.move === 'evade' && (o.state === 'wind' || o.state === 'strike')) || o.under || o.gone || o.air
  || (!!o.move && o.state === 'strike' && Math.hypot(o.vx, o.vy) > 300);
const stuckOn = (F, own) => flies(F, own).filter(b => b.st === 'stuck').length;
// a fly on them that this go of their evade (or dash) swats off: every other one, fixed per go, so it's the same one
// every step
const swats = (o, ob) => swatting(o) && (ob.id + o.ms) % 2 === 0;
// room for one more fly of his: past the cap, the oldest sentry buzzes off (else, forced, the oldest of any)
function roomFly(F, f, force) {
  const L = flies(F, f.i), cap = f.stats.moves.move1.cap;
  if (L.length < cap) return true;
  const old = L.find(b => b.st === 'sentry') || (force ? L[0] : null);
  if (!old) return false;
  F.ev('cpShoo', old.x, old.y, 0.2, f.i, { move: 'move1', id: old.id }); gone(old);
  return true;
}
const newFly = (F, f, o) => spawn(F, f, { kind: 'cpfly', z: 22, hx: 0, hy: 0, on: -1, oa: 0, sT: 0, ttl: 0, rest: 0, dT: 0, was: '', wv: -1, wn: 0, mv: null, life: 99, ...o });
// a fly lands on the foe: a little nibble (no flinch), then it buzzes on them. False if it didn't take
function stick(F, own, o, ob) {
  const mv = own.stats.moves.move1;
  if (!open(o) || phased(o) || swatting(o) || o.state === 'down' || o.state === 'getup') return false;
  if (o.ph === 'iceblock' && o.state === 'strike') { F.ev('cpSwat', ob.x, ob.y, 0.3, own.i, { move: 'move1', to: o.i, id: ob.id }); gone(ob); return true; }   // (Tux's ice: it bounces off)
  drain(F, own, o, mv.damage);   // (a nibble, no flinch: it's a tag, not a hit)
  ob.st = 'stuck'; ob.on = o.i; ob.sT = mv.stick; ob.vx = ob.vy = 0;
  ob.oa = Math.round((Math.atan2(ob.y - o.y, ob.x - o.x) + 0.6 * (ob.id % 3 - 1)) * 100) / 100;
  F.ev('cpStick', o.x, o.y, 0.3, own.i, { move: 'move1', to: o.i, id: ob.id });
  return true;
}
// a fly settles as a sentry: over his sludge within seek of (x, y), else there
function settle(F, own, ob, x, y) {
  const mv = own.stats.moves.move1, [d, gx, gy] = nearGoo(F, own.i, x, y, 1);
  const on = d < mv.seek;
  [x, y] = on ? [gx, gy] : inside(F, x, y, 14);
  ob.st = 'sentry'; ob.hx = Math.round(x * 10) / 10; ob.hy = Math.round(y * 10) / 10; ob.ttl = mv.sentry; ob.rest = 0.3; ob.on = -1;
  F.ev('cpSettle', ob.hx, ob.hy, 0.2, own.i, { move: 'move1', id: ob.id, goo: on ? 1 : 0 });
}
// his sludge breeds: a sentry hatches over a wet blob every breed s (x2 with two or more pieces down), while he has room
function breed(F, f, dt) {
  const L = sludges(F, f.i).filter(b => b.pts.some(p => wet(b, p) && b.goo - (b.t - p[2]) > 2));
  if (!L.length) { f.brT = Math.max(0, f.brT - dt); return; }
  f.brT += dt * Math.min(2, L.length);
  const mv = f.stats.moves.move3;
  if (f.brT < mv.breed) return;
  f.brT = 0;
  if (flies(F, f.i).length >= f.stats.moves.move1.cap) return;
  const B = []; for (const b of L) for (const p of b.pts) if (wet(b, p) && b.goo - (b.t - p[2]) > 2) B.push(p);
  const p = B[Math.min(B.length - 1, Math.floor(F.rngs[2]() * B.length))];
  const ob = newFly(F, f, { st: 'sentry', x: p[0], y: p[1], z: 2, hx: p[0], hy: p[1], ttl: f.stats.moves.move1.sentry, rest: 0.8 });
  F.ev('cpHatch', p[0], p[1], 0.2, f.i, { move: 'move3', id: ob.id });
}

/** @type {Record<string, import('./index.js').Kit>} */
const kits = {
  cpFlick: {
    press(F, f) { setPh(f, 'flick'); },
    start(F, f, o) {
      setPh(f, 'flung');
      const c = F.ctl(f), toO = toward(f, o), a = c.mag > 0.3 && Math.abs(angDiff(c.dirA, toO)) <= AIM ? c.dirA : f.face;
      f.face = a;
      const mv = f.stats.moves.move1; roomFly(F, f, true);
      newFly(F, f, { st: 'fly', x: f.x + Math.cos(a) * (f.r + 4), y: f.y + Math.sin(a) * (f.r + 4), z: 26, vx: Math.cos(a) * mv.speed, vy: Math.sin(a) * mv.speed, dT: 0 });
      F.ev('cpFlick', f.x, f.y, 0.3, f.i, { move: 'move1', a });
    },
    phases: mv => [['flick', 'wind', mv.startup, 'wind', 'his paw back, a fly on it'], ['flung', 'strike', mv.active, 'strike', `the fly: ${mv.speed} u/s up to ${mv.range}; on them: ${mv.damage}, then ${mv.buzz}/s for ${mv.stick} s; missed: a sentry over his sludge (within ${mv.seek}) for ${mv.sentry} s off it, darting within ${mv.sense}; at most ${mv.cap} flies`],
      ['flung', 'recover', mv.recovery, 'strike', '']],
  },
  cpFree: {
    can(F, f) { return flies(F, f.i).some(b => b.st !== 'dive' && b.st !== 'rise'); },
    press(F, f) {
      setPh(f, 'call');
      let n = 0;
      for (const b of flies(F, f.i)) if (b.st !== 'dive' && b.st !== 'rise') { b.was = b.st; b.st = 'rise'; b.dT = 0; b.wv = f.ms; n++; }
      F.ev('cpCall', f.x, f.y, 0.4, f.i, { move: 'move2', n });
    },
    start(F, f) {
      setPh(f, 'sic'); f.uaN = 0; f.uaW = f.ms;
      let n = 0;
      for (const b of flies(F, f.i)) if (b.st === 'rise' && b.wv === f.ms) { b.st = 'dive'; b.dT = 0; n++; }
      for (const b of flies(F, f.i)) if (b.st === 'dive' && b.wv === f.ms) b.wn = n;   // (how many in this call: each bites harder)
      F.ev('cpDive', f.x, f.y, 0.5, f.i, { move: 'move2', n });
    },
    end(F, f, o, mv) { setPh(f, 'called'); F.go(f, 'recover', mv.recovery); return true; },
    phases: mv => [['call', 'wind', mv.startup, 'rear', 'reared up, whistling: his flies lift off'], ['sic', 'strike', mv.active, 'chomp', `they dive (${mv.dive} u/s): ${mv.damage} a bite (+${mv.more} a fly for each other one in the call), ${mv.stagN}+ in one call stagger ${mv.stagT} s`], ['called', 'recover', mv.recovery, 'chomp', '']],
  },
  cpLeak: {
    moves: true,
    press(F, f) { setPh(f, 'shudder'); },
    // the way it sets off: whatever's held, from the shudder on; nothing held: the way he faces
    wind(F, f, o, mv, dt, c) { f.vx = f.vy = 0; if (c && c.mag > 0.3) f.face = c.dirA; },
    start(F, f, o, mv) {
      const c = F.ctl(f); if (c.mag > 0.3) f.face = c.dirA;
      setPh(f, 'leak'); f.bx = f.x; f.by = f.y; f.aimW = 0;
      makeRoom(F, f, 'leak', mv.trails);   // (two trails at a time: a new one dries up the oldest)
      spawn(F, f, { kind: 'cpleak', pts: [[f.x, f.y, 0]], r: mv.r, goo: mv.goo, src: 'leak', on: 0, life: mv.goo + mv.active + 0.2 });   // (tied to this go: sameGo finds it)
      F.ev('cpLeak', f.x, f.y, 0.5, f.i, { move: 'move3' });
    },
    step(F, f, o, mv, dt, c) {
      // steered the held way, eased in and out (f.aimW its turn rate). No aim assist: it lays a trail, it isn't aimed
      const rate = c.mag > 0.3 ? Math.max(-mv.steer, Math.min(mv.steer, angDiff(c.dirA, f.face) * 6)) : 0;
      f.aimW = (f.aimW || 0) + (rate - (f.aimW || 0)) * Math.min(1, dt * 9); f.face += f.aimW * dt;
      f.vx = Math.cos(f.face) * mv.speed; f.vy = Math.sin(f.face) * mv.speed;
      const lk = F.objs.find(b => b.kind === 'cpleak' && b.owner === f.i && sameGo(f, b));
      if (lk && Math.hypot(f.x - f.bx, f.y - f.by) >= mv.gap) {
        f.bx = f.x; f.by = f.y; lk.pts.push([Math.round(f.x * 10) / 10, Math.round(f.y * 10) / 10, Math.round(lk.t * 100) / 100]);
        lk.life = Math.max(lk.life, lk.t + mv.goo + 0.2);
      }
    },
    end(F, f, o, mv) { f.vx *= 0.3; f.vy *= 0.3; setPh(f, 'leakend'); F.go(f, 'recover', mv.recovery); return true; },
    wall(F, f, c) {   // along the wall, not into it
      const vn = Math.cos(f.face) * c.nx + Math.sin(f.face) * c.ny;
      if (vn < 0) { const tx = Math.cos(f.face) - vn * c.nx, ty = Math.sin(f.face) - vn * c.ny; f.face = Math.hypot(tx, ty) > 0.05 ? Math.atan2(ty, tx) : Math.atan2(c.ny, c.nx) + Math.PI / 2; }
      return true;
    },
    phases: mv => [['shudder', 'wind', mv.startup, 'wind', 'shudders, a drip'], ['leak', 'strike', mv.active, 'scurry', `${mv.speed} u/s, steered ${mv.steer} rad/s; sludge r ${mv.r} every ${mv.gap}, lasting ${mv.goo} s, ${mv.trails} trails (poisoned: x${mv.slow} walking, no evade, ${mv.psn} s after); a fly hatches every ${mv.breed} s`], ['leakend', 'recover', mv.recovery, 'pant', '']],
  },
  cpDead: {
    moves: true,
    start(F, f, o, mv) {
      setPh(f, 'dead'); f.inv = Math.max(f.inv, 2 / 60); f.vx = f.vy = 0; f.ghost = 1;
      spawn(F, f, { kind: 'cpstink', r: mv.r, mv: null, life: mv.life });
      F.ev('cpDead', f.x, f.y, 0.5, f.i, { move: 'evade' });
    },
    step(F, f) { f.inv = Math.max(f.inv, 2 / 60); f.vx = f.vy = 0; },
    end(F, f, o, mv) {
      f.inv = 0; f.ghost = 0; setPh(f, 'scramble'); F.go(f, 'recover', mv.recovery);
      puddle(F, f, f.x, f.y, mv.pr, 0.05);
      F.ev('cpUp', f.x, f.y, 0.5, f.i, { move: 'evade' });
      return true;
    },
    phases: mv => [['dead', 'strike', mv.active, 'dead', `on his back: untouchable, rooted; the stink r ${mv.r} (x${mv.slow} walking) for ${mv.life} s`], ['scramble', 'recover', mv.recovery, 'wind', `flips up in a splash: a puddle r ${mv.pr} (${mv.plife} s, ${mv.pn} at most); open`]],
  },
};

/** @type {Record<string, import('./index.js').ObjStep>} */
const objs = {
  // sludge (a trail, a puddle): walking in it poisons you (slower with his flies on you; no evade); he skates
  cpleak(F, ob, dt, own, foe, M) {
    const L = M.move3;
    let on = 0;
    if (grounded(foe) && !phased(foe) && onGoo(ob, foe, 0.4)) on = 1;
    if (on && !ob.on) F.ev('cpGoo', foe.x, foe.y, 0.4, ob.owner, { move: ob.src === 'leak' ? 'move3' : 'evade', to: foe.i });
    ob.on = on;
    if (on && own.wdT !== F.time) {   // (once a step, however many pieces)
      own.wdT = F.time;
      F.poison(foe, L.psn, Math.max(0.3, L.slow - M.move1.flySlow * Math.min(3, stuckOn(F, own.i))), own.i);   // (the shared status: slowed, no evade)
    }
    // Sewer Rat: he skates on it (once a step, however many blobs)
    if (own.skT !== F.time && grounded(own) && !own.move && onGoo(ob, own, 0)) {
      own.skT = F.time; pace(F, own, own.stats.skate || 1, dt);
      if (Math.hypot(own.vx, own.vy) > 25) { own.sk = Math.min(1, own.sk + dt * 9); own.ph = 'skate'; }
    }
  },
  // a fly: flicked, stuck on the foe, a sentry, darting, or called in
  cpfly(F, ob, dt, own, foe, M) {
    const mv = M.move1, U = M.move2;
    switch (ob.st) {
      case 'fly': {   // straight on the way it was flicked: sticks to whoever it meets, else settles as a sentry
        const x0 = ob.x, y0 = ob.y; ob.x += ob.vx * dt; ob.y += ob.vy * dt; ob.dT += mv.speed * dt;
        if (segDist(foe.x, foe.y, x0, y0, ob.x, ob.y)[0] < foe.r + mv.r && stick(F, own, foe, ob)) return;
        if (ob.dT >= mv.range || F.contactsAll(ob.x, ob.y, 3).length) settle(F, own, ob, ob.x, ob.y);
        return;
      }
      case 'stuck': {   // on them, nibbling, until it's had its fill (then off to his sludge), or they swat it
        if (foe.state === 'ko') return;
        ob.x = foe.x + Math.cos(ob.oa) * foe.r * 0.8; ob.y = foe.y + Math.sin(ob.oa) * foe.r * 0.5; ob.z = 26;
        if (swats(foe, ob)) { F.ev('cpSwat', ob.x, ob.y, 0.3, own.i, { move: 'move1', to: foe.i, id: ob.id }); gone(ob); return; }
        if (foe.state !== 'down' && foe.state !== 'getup') drain(F, own, foe, mv.buzz * dt);
        ob.sT -= dt;
        if (ob.sT <= 0) { const [d] = nearGoo(F, own.i, ob.x, ob.y, 2); if (d < 160) settle(F, own, ob, ob.x, ob.y); else { F.ev('cpShoo', ob.x, ob.y, 0.2, own.i, { move: 'move1', id: ob.id }); gone(ob); } }
        return;
      }
      case 'sentry': {   // hovering over its spot; darts at anyone who comes close. Its time only runs off his sludge
        ob.x += (ob.hx - ob.x) * Math.min(1, dt * 6); ob.y += (ob.hy - ob.y) * Math.min(1, dt * 6); ob.z += (22 - ob.z) * Math.min(1, dt * 4);
        if (nearGoo(F, own.i, ob.hx, ob.hy)[0] > 24) { ob.ttl -= dt; if (ob.ttl <= 0) { F.ev('cpShoo', ob.x, ob.y, 0.2, own.i, { move: 'move1', id: ob.id }); gone(ob); return; } }
        if (ob.rest > 0) { ob.rest -= dt; return; }
        if (grounded(foe) && !phased(foe) && foe.state !== 'ko' && Math.hypot(foe.x - ob.hx, foe.y - ob.hy) - foe.r < mv.sense) { ob.st = 'dart'; ob.dT = 0; F.ev('cpDart', ob.x, ob.y, 0.2, own.i, { move: 'move1', id: ob.id }); }
        return;
      }
      case 'dart': {   // at them, quick and short; missed, back to its spot
        const dx = foe.x - ob.x, dy = foe.y - ob.y, d = Math.hypot(dx, dy) || 1;
        ob.vx = dx / d * mv.dart; ob.vy = dy / d * mv.dart; ob.x += ob.vx * dt; ob.y += ob.vy * dt; ob.dT += dt;
        if (d < foe.r + mv.r && stick(F, own, foe, ob)) return;
        if (ob.dT >= mv.dartT || swatting(foe) || phased(foe)) { ob.st = 'sentry'; ob.rest = mv.rearm; }
        return;
      }
      case 'rise': {   // called: lifting off (the ones on them hover just over them); the call cut short, back as they were
        if (own.move !== 'move2' || own.ms !== ob.wv) { ob.st = ob.was === 'stuck' && open(foe) && !swatting(foe) ? 'stuck' : 'sentry'; if (ob.st === 'sentry') { ob.rest = 0.5; ob.ttl = Math.max(ob.ttl, 2); } return; }
        if (ob.was === 'stuck') {
          if (swats(foe, ob)) { F.ev('cpSwat', ob.x, ob.y, 0.3, own.i, { move: 'move2', to: foe.i, id: ob.id }); gone(ob); return; }
          ob.x = foe.x + Math.cos(ob.oa) * foe.r * 1.1; ob.y = foe.y + Math.sin(ob.oa) * foe.r * 0.7;
        }
        ob.z += (62 - ob.z) * Math.min(1, dt * 8);   // (up over their head)
        return;
      }
      case 'dive': {   // homing in on them, faster and faster: a bite on arrival (several in one call stagger), used up;
        // an evade (or a dash) as it closes in swats it (too early, and the ones still on their way bite as it ends)
        ob.dT += dt;
        if ((swatting(foe) || phased(foe)) && Math.hypot(foe.x - ob.x, foe.y - ob.y) < 70) { F.ev('cpSwat', ob.x, ob.y, 0.3, own.i, { move: 'move2', to: foe.i, id: ob.id }); gone(ob); return; }
        const dx = foe.x - ob.x, dy = foe.y - ob.y, d = Math.hypot(dx, dy) || 1, v = U.dive * Math.min(1, 0.35 + ob.dT * 4);
        const s = Math.min(d, v * dt); ob.vx = dx / d * v; ob.vy = dy / d * v; ob.x += dx / d * s; ob.y += dy / d * s; ob.z += (18 - ob.z) * Math.min(1, dt * 10);
        if (d - s < foe.r + 4) {
          // a bite: health off, no flinch (one or two flies are a nibble you can fight through); the stagN-th of this call
          // a real hit that staggers them (the rest bite on into the stagger)
          let hit = false;
          if (open(foe) && !phased(foe) && !swatting(foe) && foe.state !== 'down' && foe.state !== 'getup' && !(foe.ph === 'iceblock' && foe.state === 'strike')) {
            const n = own.uaW === ob.wv ? own.uaN + 1 : 1, mul = 1 + U.more * Math.max(0, (ob.wn || 1) - 1) / U.damage;
            if (n < U.stagN || foe.state === 'stagger') { drain(F, own, foe, U.damage * mul); foe.flash = Math.max(foe.flash || 0, 0.12); hit = true; }   // (a nibble; or more on someone already staggered)
            else if (F.hitF(own, foe, U, { dir: Math.atan2(dy, dx), dmgMul: mul, obj: true, unblockable: true, noFlank: true, move: 'move2' }) && F.lastRes === 'hit') {
              hit = true;
              if (n === U.stagN && foe.hp > 0 && foe.state === 'hurt') { F.go(foe, 'stagger', U.stagT); F.ev('cpSwarm', foe.x, foe.y, 0.7, own.i, { move: 'move2', to: foe.i }); }
            }
            if (hit && own.uaW === ob.wv) own.uaN = n;
          }
          F.ev(hit ? 'cpBite' : 'cpMiss', ob.x, ob.y, hit ? 0.4 : 0.2, own.i, { move: 'move2', to: foe.i, id: ob.id });
          gone(ob); return;
        }
        if (ob.dT >= U.diveT) { F.ev('cpMiss', ob.x, ob.y, 0.2, own.i, { move: 'move2', id: ob.id }); gone(ob); }
        return;
      }
    }
  },
  // the stink: walking in it slows you
  cpstink(F, ob, dt, own, foe, M) {
    if (grounded(foe) && Math.hypot(foe.x - ob.x, foe.y - ob.y) < (ob.r + foe.r * 0.4) * Math.min(1, 0.4 + ob.t / 0.3)) { pace(F, foe, M.evade.slow, dt); ob.on = 1; } else ob.on = 0;
  },
};

// ---------------------------------------------------------------- the bot
// his flies as they stand for a call on o: [on them, sentries near enough to get there quick, all]
function swarm(F, me, o) {
  let on = 0, near = 0, all = 0;
  for (const b of flies(F, me.i)) {
    if (b.st === 'dive' || b.st === 'rise') continue;
    all++;
    if (b.st === 'stuck') on++;
    else if (Math.hypot(b.x - o.x, b.y - o.y) < 230) near++;
  }
  return [on, near, all];
}
/** @type {import('./index.js').BotHooks} */
const ai = {
  want: 170,
  // his character (js/fight-style.js): sets his traps (pointers seeding sentries, the leak) before he engages
  persona: { trap: 0.6, traps: [0, 2], trapN: 1, styles: [0.6, 1, 1.6] },
  // Cpp's tells, for the other bot: flies on them (swat them off with the evade before he calls them: more of them, or
  // his call ready, the keener), the call itself (the evade as they rise), a fly flicked their way (off its line), the
  // sentries and the sludge (keep off them), the stink
  threats(F, i, me, o) {
    const out = [], ow = F.f[1 - i];
    let on = 0, last = 0;
    for (const b of F.objs) {
      if (b.owner === i || b.t >= b.life) continue;
      if (b.kind === 'cpfly') {
        if ((b.st === 'stuck' || b.st === 'rise') && b.on === i && b.t >= o.age) { on++; last = Math.max(last, b.id); }
        else if (b.st === 'fly' && b.t >= o.age * 0.5) {   // (flicked their way: off its line, sideways)
          const sp = Math.hypot(b.vx, b.vy) || 1, ex = b.vx / sp, ey = b.vy / sp, u = (me.x - b.x) * ex + (me.y - b.y) * ey;
          if (u <= 0) continue;
          const lat = (me.x - b.x) * ey - (me.y - b.y) * ex, need = me.r + 12 - Math.abs(lat);
          if (need > 0) out.push(['p' + b.id, u / sp, 0.05, lat >= 0 ? Math.atan2(-ex, ey) : Math.atan2(ex, -ey), need]);
        } else if (b.st === 'sentry' || b.st === 'dart') {   // (keep clear of them)
          const need = ow.stats.moves.move1.sense + me.r + 10 - Math.hypot(me.x - b.hx, me.y - b.hy);
          if (need > 0) out.push(['y' + b.id, 0, 9, Math.atan2(me.y - b.hy, me.x - b.hx), need, 1]);
        }
      } else if (b.kind === 'cpleak' && b.t >= o.age) {
        let best = 1e9, bx = 0, by = 0;
        for (const p of b.pts) { if (!wet(b, p)) continue; const d = Math.hypot(me.x - p[0], me.y - p[1]); if (d < best) { best = d; bx = p[0]; by = p[1]; } }
        const need = b.r + me.r * 0.5 + 6 - best;
        if (need > 0) out.push(['g' + b.id, 0, 9, Math.atan2(me.y - by, me.x - bx), need]);   // (just off it; never an evade: it stays)
      } else if (b.kind === 'cpstink' && b.t >= o.age) {
        const need = b.r + me.r * 0.4 + 4 - Math.hypot(me.x - b.x, me.y - b.y);
        if (need > 0) out.push(['s' + b.id, 0, 9, Math.atan2(me.y - b.y, me.x - b.x), need]);
      }
    }
    const away = Math.atan2(me.y - o.y, me.x - o.x), E = me.stats.moves.evade;
    if (!E || me.psnT > 0 || (E.charges ? !(me.ev >= 1) : me.cd[3] > 0.05)) return out;   // (only the evade answers flies: walking off doesn't)
    // the call seen (him rearing up): the evade as the flies rise, whatever's on us (the dive finds nothing)
    if (o.move === 'move2' && o.state === 'wind') out.push(['u' + o.ms, Math.max(0.02, o.left) + 0.08, 0.12, away, 9999]);
    // flies on us: swat them off (only an evade does it) before he calls them, once there are two (one isn't worth
    // the evade), three if his call isn't ready
    else if (on >= 3 || (on >= 2 && !(o.cd && o.cd[1] > 0.6))) out.push(['w' + last, 0.1, 0.05, away, 9999]);
    return out;
  },
  // in his own moves: the leak curling round them (the side fixed for the go); the flick led onto where they'll be
  stick(F, i, me, o, C) {
    if (me.move === 'move3') {
      const side = me.ms % 2 ? 1 : -1, toO = Math.atan2(o.y - me.y, o.x - me.x), d = Math.hypot(o.x - me.x, o.y - me.y);
      const a = toO + side * (d > 110 ? 0.75 : 1.45);   // (in toward them, then round)
      const cl = clearance(C.g.A, me.x, me.y, me.r);
      if (cl.d < 40) return [Math.cos(a) * 0.4 + cl.nx * 0.9, Math.sin(a) * 0.4 + cl.ny * 0.9];
      return [Math.cos(a), Math.sin(a)];
    }
    if (me.move === 'move1') { const mv = me.stats.moves.move1, a = C.aimAt('cpf' + me.ms, Math.min(0.5, C.g.dist / mv.speed)); return [Math.cos(a), Math.sin(a)]; }
    return [0, 0];
  },
  punish(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, toFoe } = C.g, [on, near] = swarm(F, me, o);
    if (C.ready(1) && (on >= 1 || near >= 2) && w.fits(M.move2.startup + 0.12)) { C.fire(1); return C.unit(toFoe); }   // (open: the swarm on them)
    if (C.ready(0) && d < M.move1.range && w.fits(M.move1.startup + M.move1.active + d / M.move1.speed)) { C.fire(0); return C.unit(toFoe); }   // (a fly on them while they can't step off its line)
    return null;
  },
  neutral(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap, toFoe, cl } = C.g, [on, near, all] = swarm(F, me, o);
    const trails = sludges(F, me.i).filter(b => b.src === 'leak' && b.pts.some(p => wet(b, p))).length;
    const evading = swatting(o) || o.inv > 0;   // (as seen: no use calling them into an evade)
    // Use After Free: cash in once enough are on or near them (keener on a busy foe, or one whose evade is spent)
    const ripe = on * 1.3 + near * 0.8, sm = C.L.smart, k = 0.05 + 1.2 * sm;   // (k: a sloppier bot works his swarm far less: it's all upkeep)
    const add = (j, p, wk) => w.add(j, p * (j === 2 ? 1 : k), wk);
    // (a sloppier bot cashes in early, with whatever's there; a sharp one waits for a swarm, or an opening)
    add(1, !evading && (on >= 1 || near >= 1) ? (ripe >= 3.5 || (ripe >= 2 && (w.busy || w.spent)) ? 0.4 + 0.5 * sm : ripe >= 2 ? 0.4 - 0.2 * sm : 0.4 * (1 - sm) + (on >= 1 && all >= 4 ? 0.3 : 0.02)) : 0, C.unit(toFoe));
    // Dangling Pointer: tag them in range (a miss seeds a sentry); out of range, seed his sludge anyway now and then
    add(0, d < M.move1.range + 10 ? (w.busy ? 0.75 : 0.3 + 0.3 * sm) : all < M.move1.cap - 1 ? 0.12 : 0, C.unit(toFoe));
    // Memory Leak: paint the floor round them (a second trail too), so it breeds; or out of a rush (a scurry away)
    add(2, trails < 2 && d < 280 ? (gap < 50 ? 0.4 : w.busy ? 0.3 : 0.14) : 0.02, C.unit(toFoe));
    // where he likes to stand: off them at mid range (he skates on his sludge, they wade); backing off a rush, toward
    // the middle (a sloppier bot forgets now and then, and stands there)
    if (gap < 80) {
      if (C.K.cpKite == null || F.time > C.K.cpKiteT) { C.K.cpKite = C.rng() < 0.25 + 0.75 * sm; C.K.cpKiteT = F.time + 0.8; }
      if (!C.K.cpKite) return [0, 0];
      const a = toFoe + Math.PI, bx = Math.cos(a) + (cl.d < 60 ? Math.cos(C.g.toC) * 0.9 : 0), by = Math.sin(a) + (cl.d < 60 ? Math.sin(C.g.toC) * 0.9 : 0), l = Math.hypot(bx, by) || 1;
      return [bx / l, by / l];
    }
    return null;
  },
  // Play Dead: untouchable through it (rooted, so only while it lasts)
  evadeWhen(T, dur, E) { return [T > 0.02 && T + dur < E.active - 0.04, T + dur < E.active - 0.04]; },
};

export default { id: ID, fighter, kits, objs, ai };
