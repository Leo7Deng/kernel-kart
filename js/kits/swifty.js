// @ts-check
// Swifty (Swift's bird) for Fight: the fastest flyer, who keeps you at a distance. Three moves and an evade, a plug-in
// (js/kits/index.js documents the shape; drawn by js/art/kit-swifty.js). DOM-free, deterministic.
// move1 do / try / catch (swCatch): her hit-and-run, the shortest cooldown. A low fast dart, beak open; bugs in her way
// (Cpp's flies, flying or stuck on her) are swallowed for a little health; reaching you, a wing clips you as she flips
// back out of reach. A miss skids, open.
// move2 Closure (swClosure): a boomerang feather out past them along a curve and back, hitting both ways (the way back
// pulls them toward her). Tell: a faint feather trail shows the loop.
// move3 Gust (swGust): her special. A wide cone of wind out in front: whoever's in it as it blows is hit and pushed
// away hard (into a wall: a slam); for the rest of the blow anyone walking into it is held back and light things (Cpp's
// flies) are blown along. Unlike Octo's Force Push (a ring round him, close) it reaches out to range. Tell: wings up,
// leaves skittering in the cone. Open as she lands.
// evade Wing Hop (swHop): a short flight the held way (away if none), untouchable in the air, a long landing. do / try
// / catch pressed during it swoops down out of the air: a quick tuck (air.tuck s, no longer untouchable), then the dart
// down over the rest of air.active.
// Passive: Lightweight (up sooner after a hit or knockdown: stunMul).
// Objects: swFeather (ph 'aim' | 'fly', the loop's x0, y0, a, out, width, side, u, ft, h1, h2), swCone (x, y, a, ph
// 'aim' | 'blow', pt).
// Phases (f.ph): crouch, dart, tuck, swoop, flip, alight, skid · cock, fling · flap, gust · hop, perch.
// Events: swCrouch, swDart (a), swClip (to, a), swGulp (id, heal), swSkid, swTuck, swFling, swSnip, swCatch (the
// feather home), swDrop, swFlap, swGust (a), swFeathers (to, a), swGustMiss, swHop, swLand.
import { Math } from '../detmath.js';
import { TAU, angDiff, angMid, clamp, dist, gone, inside, landing, mine, open, sameGo, sd, segDist, setPh, spawn, toward, turnTo } from './lib.js';
import { aimAt, botAim } from './docky.js';   // (the shared aim: a player's aim on the foe, a bot's error)

const ID = 'swifty';
/** @type {import('./index.js').FighterData} */
const fighter = {
  id: ID, name: 'Swifty', lang: 'Swift', role: 'Keep-away',
  tagline: 'Fastest flyer: darts in and out, a boomerang feather, a dive from the sky.',
  difficulty: 'hard',
  blurb: 'The fastest flyer, who keeps you at a distance: darts in to snap up bugs and clip you on the way back out, throws a feather that comes back, and blows you away with a gust of wind and leaves.',
  passive: 'Lightweight: back on her feet sooner after a hit or a knockdown. The lightest: hits push her the furthest.',
  balance: 'Keep-away (2026-10-27, the Gust back beside do / try / catch, measured on the quick knockdowns, ring, 20 fights a pair at Normal, 12 at Ruthless): about 49% at Normal and 52% at Ruthless (±5), long rounds (her darts, feather and gust from out of reach). The Gust lands about half the time, so it hits soft (5) and its wind-up is long (0.5 s): its worth is the room it buys her, pushing you back out to where her feather works, not its damage. Strong into Cpp (she eats his flies and blows his sentries away) and the slow bruisers (Docky, Bugdroid); weak into Gopher, Ferris and Octo, whose ways in and zoning reach her where she likes to stand. 2026-10-29, the approved kit changes (the Gust\'s cooldown 1.44 -> 2.16 s): about 51% at Normal and 63% at Ruthless (the ring, 16 / 12 fights a pair). 2026-10-29, the balance pass (all four arenas, 40 fights a pair, about ±5): 45% Chill, 44% Normal, 50% Ruthless (health 102 -> 108). She deals the least damage a minute and wins on keep-away, so she\'s best on the open Sky Ring (50-72%) and worst in Data Bus\'s narrow hall (30-37%); Bugdroid outranges and outlasts her (3-20%: a zoner with a longer reach and more health). 2026-10-31, every hit about 7% harder (the dart 8.5 -> 9.1, the feather 6 -> 6.4, the gust 5 -> 5.4): Normal 42 -> 47% (16 fights a pair, about ±8).',
  hp: 108, weight: 0.76, walk: 1.45, accel: 34, friction: 32, kbDecay: 3.6, radius: 14, slipMul: 0.25, stunMul: 0.9,
  moves: {
    move1: { name: 'do / try / catch', short: 'Catch', do: 'swCatch', icon: 'swCatch', hold: null,
      blurb: 'Darts in low with her beak open, snapping up any bug in her way (a little health back for each), and clips you with a wing as she flips back off you, out of reach.',
      tell: 'A quick crouch, beak open; then she\'s darting at you in a straight line. Out of a Wing Hop: she tucks in the air and swoops down.',
      answer: 'Keep out of her dash (it only goes straight), and don\'t wait where her hop comes down. Missing, she overshoots and skids: punish that.',
      // the crouch (startup), the dart (active: dash units straight on, hitting whoever's within reach of her edge and arc
      // degrees of her facing: damage, kb, stun; then she flips back off them, rebound u/s for flipT s, and alights:
      // recovery), missed: the
      // skid, miss s, open. Bugs (Cpp's flies) within snap of her while she darts, and the ones stuck on her: swallowed,
      // heal health back each. Out of a Wing Hop (air): a tuck (tuck s, no hits yet), then the dart down at them, lunge
      // units over the rest of active s
      startup: 0.12, active: 0.18, recovery: 0.3, miss: 0.55, cooldown: 1.1,
      damage: 9.1, kb: 230, stun: 0.42, reach: 24, arc: 120, dash: 105, rebound: 300, flipT: 0.18, snap: 30, heal: 1.5,
      air: { tuck: 0.14, active: 0.3, lunge: 70, reach: 22 } },
    move2: { name: 'Closure', short: 'Closure', do: 'swClosure', icon: 'swClosure', hold: 'aim',
      blurb: 'Flings a boomerang feather out on a curve: out past you, round, and back to her, hitting on both ways.',
      tell: 'A faint trail of little feathers shows the whole loop it will fly.',
      answer: 'Read the loop and stand clear of both legs: it can\'t turn. A wall or a crate stops it.',
      // the wind-up (startup: the loop turns aimTurn rad/s); the feather flies flight s round the loop (out: how far its
      // tip goes, x their distance, between near and far; width: how far round it swings on the way back, side the held
      // side (else the side they lean to)); a hit each way (back: the way home's, pulling toward her); r its size
      startup: 0.3, active: 0.06, recovery: 0.4, cooldown: 2.3,
      damage: 6.4, kb: 150, stun: 0.4, near: 120, far: 270, width: 110, flight: 1.15, r: 11.5, aimTurn: 1.8,
      back: { damage: 6.4, kb: 170, stun: 0.45, prio: 2, stale: false } },
    move3: { name: 'Gust', short: 'Gust', do: 'swGust', icon: 'swGust', hold: 'aim',
      blurb: 'Hovers and beats her wings: a wide cone of wind and leaves blows you away hard (into a wall, a slam) with a pepper of feathers, and holds back anyone walking into it while it blows.',
      tell: 'Wings up, and leaves and dust skitter over the floor in the cone in front of her.',
      answer: 'Get out of the cone: to her side, or beyond its reach. Or evade. Don\'t walk into it while it blows. She\'s open as she lands.',
      // the wings up (startup: the cone turns aimTurn rad/s, eased, docky.js aimAt), the blow (active): whoever's in
      // the cone (range, arc degrees across) takes the hit and is pushed on (push u/s a second) while in it; anyone
      // else in it is blown back at wind u/s, Cpp's flies blown along at blow u/s; then the landing (recovery, open)
      startup: 0.5, active: 0.32, recovery: 0.48, cooldown: 3.6,
      damage: 5.4, kb: 140, stun: 0.55, range: 175, arc: 70, push: 900, aimTurn: 2, wind: 200, blow: 320 },
    evade: { name: 'Wing Hop', short: 'Hop', do: 'swHop', icon: 'swHop', hold: null,
      blurb: 'A short flight the held way (away from them if none): the longest evade, untouchable in the air. Press do / try / catch in the air to swoop down at them.',
      tell: 'She takes off: a long hop, then a long landing (or a tuck in the air, and she swoops down at you).', answer: 'Follow her and punish the landing; don\'t wait right under where she comes down.',
      // up and over (active s, dist units, h high: untouchable), then the landing (recovery s, open)
      startup: 0, active: 0.32, recovery: 0.42, cooldown: 2.2, dist: 160, h: 26 },
  },
  phPose: { crouch: 'flick', dart: 'swoop', tuck: 'hover', swoop: 'swoop', flip: 'glide', alight: 'perch', skid: 'perch', cock: 'cock', fling: 'fling',
    flap: 'flap', gust: 'gust', hop: 'glide', perch: 'perch' },
  phFade: ['fling', 'perch', 'alight'],
  // hvx / hvy the hop's velocity; aimW the aim's turning speed (docky.js aimAt); tair 1: the next Catch goes from the air,
  // out of a hop; tz the height it set off from; gulp: bugs swallowed this go
  fields: { hvx: 0, hvy: 0, aimW: 0, tair: 0, tz: 0, gulp: 0 },
  show: ['stand', 'flick', 'swoop', 'stand', 'cock', 'stand', 'flap', 'glide'], cheer: 'flap',
};
const P = (a, b, inp) => [a, b, inp];
fighter.clips = {
  move1: { x: [-110, 12], len: 2.1, cam: { x: -40, w: 290 }, a: [P(0.3, 0.38, { light: 1 })] },
  move2: { x: [-90, 60], len: 2.6, cam: { x: 10, w: 330 }, a: [P(0.3, 0.38, { heavy: 1 })] },
  move3: { x: [60, 140], len: 2.4, cam: { x: 110, w: 330 }, a: [P(0.3, 0.38, { special: 1 })] },   // (near the wall: blown into it)
  // (Hop then Catch: a hop in at them, and the dart down out of the air)
  evade: { x: [-130, 30], len: 2.2, cam: { x: -30, w: 300 }, a: [P(0.3, 0.36, { guard: 1, x: 1 }), P(0.46, 0.52, { light: 1 })] },
};

// ---------------------------------------------------------------- helpers
// Hop then Catch: the Catch pressed (buffered) during the hop goes now, off its cooldown, from the air: its tell (the
// tuck) and the swoop straight on (F.startMove, F.strikeStart: the evade's cooldown runs from here). True if it did
function catchFromAir(F, f, o) {
  const mv = f.stats.moves.move1;
  if (f.bufK !== 'light' || f.cd[0] > 0 || f.lockT > 0 || f.t < 0.05) return false;
  f.bufK = ''; f.bufT = 0; f.tair = 1; f.tz = f.z; f.inv = 0;
  F.startMove(f, 'move1'); f.cd[0] = mv.cooldown || 0;
  F.strikeStart(f, o);
  return true;
}
// the beak and wing reach a body o (within reach of her edge, and arc degrees across her facing)
const clips = (f, o, reach, arc) => { const d = dist(f, o); return d - f.r - o.r <= reach && Math.abs(angDiff(toward(f, o), f.face)) <= arc * Math.PI / 360 + Math.atan2(o.r, Math.max(d, 1)); };
// a swift feeds on the wing: every bug (another fighter's fly: Cpp's) near her beak, or stuck on her, swallowed now
export const isBug = (b, i) => b.kind === 'cpfly' && b.owner !== i && b.t < b.life;
function gulp(F, f, mv) {
  for (const b of F.objs) {
    if (!isBug(b, f.i)) continue;
    const on = (b.st === 'stuck' || (b.st === 'rise' && b.was === 'stuck')) && b.on === f.i;
    if (!on && Math.hypot(b.x - f.x - Math.cos(f.face) * 6, b.y - f.y - Math.sin(f.face) * 6) > mv.snap + (b.st === 'dive' ? 8 : 0)) continue;
    gone(b); f.gulp++;
    const h = Math.min(mv.heal, f.maxHp - f.hp); if (h > 0 && f.hp > 0) f.hp += h;
    F.ev('swGulp', b.x, b.y, 0.3, f.i, { move: 'move1', id: b.id, heal: h });
  }
}
// the feather's loop at u (0..1 of its flight): a cubic curve from where it left (x0, y0), out along a (out units),
// swinging round to side x width, and home to hx, hy (her, now). Returns [x, y]
export function loopAt(b, u, hx, hy) {
  const c = Math.cos(b.a), s = Math.sin(b.a), nx = -s * b.side, ny = c * b.side;
  const p1x = b.x0 + c * b.out * 1.25 - nx * b.width * 0.3, p1y = b.y0 + s * b.out * 1.25 - ny * b.width * 0.3;
  const p2x = b.x0 + c * b.out * 1.05 + nx * b.width * 1.25, p2y = b.y0 + s * b.out * 1.05 + ny * b.width * 1.25;
  const v = 1 - u, A = v * v * v, B = 3 * v * v * u, C = 3 * v * u * u, D = u * u * u;
  return [A * b.x0 + B * p1x + C * p2x + D * hx, A * b.y0 + B * p1y + C * p2y + D * hy];
}
// its tip reaches about 0.82 x out: out set so the way out passes them
const outFor = (mv, d) => clamp(d / 0.74, mv.near, mv.far);
// the feather: where it'd be thrown from now (the loop's shape, for the tell while she winds up)
function aimLoop(F, f, o, mv, b, c) {
  const d = dist(f, o), a = f.face;
  b.x0 = f.x + Math.cos(a) * (f.r + 4); b.y0 = f.y + Math.sin(a) * (f.r + 4); b.a = a; b.out = outFor(mv, d); b.width = mv.width;
  // the side it swings round: the held side (across her facing), else the side they're moving to, else her left
  const held = c && c.mag > 0.3 ? Math.sin(c.dirA - a) : 0, lean = Math.sin(Math.atan2(o.vy, o.vx) - a) * Math.hypot(o.vx, o.vy);
  b.side = Math.abs(held) > 0.35 ? Math.sign(held) : Math.abs(lean) > 20 ? Math.sign(lean) : (b.side || -1);
}
// a solid (a pillar, a crate, a container) at (x, y): the feather flies over the arena's low wall, not through these
const solidAt = (F, x, y) => F.A.solids.some(o => sd(o, x, y)[0] < 2) || F.objs.some(o => (o.solid || o.kind === 'crate') && o.z <= 0 && sd(o, x, y)[0] < 2);
// the gust's cone follows her
const coneTo = (cn, f) => { cn.x = f.x; cn.y = f.y; cn.a = f.face; };
// in the gust's cone (range, arc across): a body of radius r at (x, y)
export function inCone(cn, mv, x, y, r) {
  const d = Math.hypot(x - cn.x, y - cn.y);
  return d - r <= mv.range && Math.abs(angDiff(Math.atan2(y - cn.y, x - cn.x), cn.a)) <= mv.arc * Math.PI / 360 + Math.atan2(r, Math.max(d, 1));
}

/** @type {Record<string, import('./index.js').Kit>} */
const kits = {
  swGust: {
    moves: true,
    press(F, f, o, mv) { setPh(f, 'flap'); f.aimW = 0; const cn = spawn(F, f, { kind: 'swCone', a: f.face, ph: 'aim', life: 99 }); coneTo(cn, f); F.ev('swFlap', f.x, f.y, 0.5, f.i, { move: 'move3' }); },
    wind(F, f, o, mv, dt, c) {
      f.vx *= 0.85; f.vy *= 0.85;
      aimAt(F, f, o, c, mv.aimTurn, dt);
      const cn = mine(F, f, 'swCone'); if (cn) coneTo(cn, f);
    },
    start(F, f, o, mv) {
      setPh(f, 'gust');
      const cn = mine(F, f, 'swCone'); if (cn) { coneTo(cn, f); cn.ph = 'blow'; cn.pt = 0; }
      F.ev('swGust', f.x, f.y, 0.8, f.i, { move: 'move3', a: f.face });
      if (cn && open(o) && !o.gone && o.z < 30 && inCone(cn, mv, o.x, o.y, o.r)) {
        f.hit = F.hitF(f, o, mv, { dir: angMid(toward(f, o), f.face), obj: true, noFlank: true, move: 'move3' }) && F.lastRes === 'hit';
        if (f.hit) F.ev('swFeathers', o.x, o.y, 0.7, f.i, { move: 'move3', to: o.i, a: f.face });
      }
    },
    step(F, f, o, mv, dt) {   // the wind blows all through the blow: whoever it hit pushed on while they reel, anyone else held back, light things blown along
      f.vx *= 0.8; f.vy *= 0.8;
      const cn = mine(F, f, 'swCone'); if (!cn) return;
      const a = toward(f, o);
      if (f.hit && o.state === 'hurt' && inCone(cn, mv, o.x, o.y, o.r + 30)) { o.vx += Math.cos(a) * mv.push * dt; o.vy += Math.sin(a) * mv.push * dt; }
      else if (!o.gone && o.z < 30 && o.inv <= 0 && o.state !== 'down' && o.state !== 'ko' && inCone(cn, mv, o.x, o.y, o.r)) { o.x += Math.cos(a) * mv.wind * dt; o.y += Math.sin(a) * mv.wind * dt; F.keepIn(o); }
      for (const b of F.objs) {   // (Cpp's flies in it: off their posts, blown out along it)
        if (!isBug(b, f.i) || b.st === 'stuck' || b.st === 'rise' || b.st === 'dive' || !inCone(cn, mv, b.x, b.y, 4)) continue;
        const ba = Math.atan2(b.y - f.y, b.x - f.x), s = mv.blow * dt;
        [b.x, b.y] = inside(F, b.x + Math.cos(ba) * s, b.y + Math.sin(ba) * s, 6);
        if (b.st === 'sentry') { b.hx = b.x; b.hy = b.y; }
      }
    },
    end(F, f) { if (!f.hit) F.ev('swGustMiss', f.x, f.y, 0.3, f.i, { move: 'move3', a: f.face }); return false; },
    phases: mv => [['flap', 'wind', mv.startup, 'flap', `wings up; leaves and dust skitter in the cone (${mv.range}, ${mv.arc}°)`], ['gust', 'strike', mv.active, 'gust', `the blow: kb ${mv.kb}, pushed ${mv.push} u/s² in it; anyone else in it held back ${mv.wind} u/s, Cpp's flies blown along`], ['gust', 'recover', mv.recovery, 'gust', 'landing: open']],
  },
  swCatch: {
    moves: true,
    press(F, f) {   // a quick crouch, beak open; out of a hop, she tucks in the air (the swoop follows at once: catchFromAir)
      f.gulp = 0;
      if (f.tair) { setPh(f, 'tuck'); F.ev('swTuck', f.x, f.y, 0.5, f.i, { move: 'move1', z: f.z }); return; }
      setPh(f, 'crouch'); F.ev('swCrouch', f.x, f.y, 0.4, f.i, { move: 'move1' });
    },
    wind(F, f) { f.vx *= 0.7; f.vy *= 0.7; },
    start(F, f, o, mv) {
      if (f.tair) { f.tair = 0; F.go(f, 'strike', mv.air.active); f.vx *= 0.3; f.vy *= 0.3; return; }   // (from the air: the tuck, then the swoop: step)
      setPh(f, 'dart'); gulp(F, f, mv);   // (the ones on her first: before her dash shakes them off)
      f.vx = Math.cos(f.face) * mv.dash / mv.active; f.vy = Math.sin(f.face) * mv.dash / mv.active;
      F.ev('swDart', f.x, f.y, 0.6, f.i, { move: 'move1', a: f.face });
    },
    step(F, f, o, mv) {
      const air = f.ph === 'tuck' || f.ph === 'swoop', A = mv.air;
      if (air) {   // from the air: hanging in the tuck, then swooping down at them, from tz to the floor
        const u = clamp((f.t - A.tuck) / (A.active - A.tuck), 0, 1);
        f.z = f.tz * (f.ph === 'tuck' ? 1 : 1 - u * u);
        if (f.ph === 'tuck') { f.vx *= 0.7; f.vy *= 0.7; gulp(F, f, mv); if (f.t < A.tuck) return; setPh(f, 'swoop'); F.ev('swDart', f.x, f.y, 0.6, f.i, { move: 'move1', a: f.face, air: 1 }); }
      }
      if (f.ph === 'flip') { const u = clamp(f.t / mv.flipT, 0, 1); f.z = f.tz * (1 - u) + 12 * Math.sin(Math.PI * u); f.vx *= 0.96; f.vy *= 0.96; return; }   // (flipping back off them, out of reach)
      if (f.hit) return;
      gulp(F, f, mv);
      const L = air ? A.lunge / (A.active - A.tuck) : mv.dash / mv.active;
      f.vx = Math.cos(f.face) * L; f.vy = Math.sin(f.face) * L;
      if (!open(o) || o.gone || o.inv > 0 || !clips(f, o, air ? A.reach : mv.reach, mv.arc)) return;
      const a = angMid(toward(f, o), f.face);
      if (F.hitF(f, o, mv, { dir: a, noFlank: true })) {
        f.hit = true;
        if (f.state !== 'strike' || f.move !== 'move1') return;   // (hit out of it meanwhile: a trade)
        f.tz = f.z; f.vx = -Math.cos(f.face) * mv.rebound; f.vy = -Math.sin(f.face) * mv.rebound;   // (a flip back off them, out of reach)
        setPh(f, 'flip'); F.go(f, 'strike', mv.flipT);
        if (F.lastRes === 'hit') { F.hitstop = Math.max(F.hitstop, 5 / 60); F.ev('swClip', o.x, o.y, 0.8, f.i, { move: 'move1', to: o.i, a }); }
      }
    },
    end(F, f, o, mv) {
      f.z = 0;
      if (f.hit) { setPh(f, 'alight'); f.vx *= 0.4; f.vy *= 0.4; F.go(f, 'recover', mv.recovery); F.ev('swLand', f.x, f.y, 0.3, f.i, { move: 'move1' }); }
      else { F.whiff(f); setPh(f, 'skid'); f.vx *= 0.35; f.vy *= 0.35; F.go(f, 'recover', mv.miss); F.ev('swSkid', f.x, f.y, 0.4, f.i, { move: 'move1', a: f.face }); }
      return true;
    },
    wall(F, f, c) { const vn = f.vx * c.nx + f.vy * c.ny; if (vn < 0) { f.vx -= vn * c.nx; f.vy -= vn * c.ny; } return true; },   // (against a wall: along it)
    phases: mv => [['crouch', 'wind', mv.startup, 'flick', 'a quick crouch, beak open (no floor tell)'], ['dart', 'strike', mv.active, 'swoop', `the dart: ${mv.dash} straight on; bugs within ${mv.snap} swallowed (+${mv.heal} each); within ${mv.reach} of her edge (${mv.arc}°): ${mv.damage}, kb ${mv.kb}, and she flips back off them (${mv.rebound} u/s)`],
      ['tuck', 'strike', mv.air.tuck, 'hover', 'out of a Wing Hop instead: a tuck in the air (no hits yet)'], ['swoop', 'strike', mv.air.active - mv.air.tuck, 'swoop', `the dart down at them: ${mv.air.lunge} forward, hitting within ${mv.air.reach}`],
      ['flip', 'strike', mv.flipT, 'glide', `hit: flipping back off them, out of reach (${mv.rebound} u/s)`], ['alight', 'recover', mv.recovery, 'perch', ''], ['skid', 'recover', mv.miss, 'perch', 'missed: overshoots and skids, open']],
  },
  swClosure: {
    can(F, f) { return !mine(F, f, 'swFeather'); },
    press(F, f, o, mv, c) {
      setPh(f, 'cock'); f.aimW = 0;
      const b = spawn(F, f, { kind: 'swFeather', ph: 'aim', a: f.face, side: 0, out: 0, width: 0, x0: f.x, y0: f.y, u: 0, r: mv.r, h1: 0, h2: 0, life: 99 });
      aimLoop(F, f, o, mv, b, c); b.x = b.x0; b.y = b.y0;
    },
    wind(F, f, o, mv, dt, c) {
      aimAt(F, f, o, c, mv.aimTurn, dt);
      const b = mine(F, f, 'swFeather'); if (b && b.ph === 'aim') { aimLoop(F, f, o, mv, b, c); b.x = b.x0; b.y = b.y0; }
    },
    start(F, f, o, mv) {
      setPh(f, 'fling');
      const b = mine(F, f, 'swFeather'); if (b) { b.ph = 'fly'; b.ft = 0; b.mv = null; }
      F.ev('swFling', f.x, f.y, 0.6, f.i, { move: 'move2' });
    },
    phases: mv => [['cock', 'wind', mv.startup, 'cock', 'the wing back; the loop shows as a trail of feathers'], ['fling', 'strike', mv.active, 'fling', 'the feather goes'], ['fling', 'recover', mv.recovery, 'fling', ''],
      ['(the feather)', '', mv.flight, '', `out (${mv.near}-${mv.far}), round (${mv.width}) and home: a hit each way`]],
  },
  swHop: {
    moves: true,
    start(F, f, o, mv) {
      const c = F.ctl(f), a = c.mag > 0.3 ? c.dirA : toward(o, f), [x, y] = landing(F, f, o, a, mv.dist);
      setPh(f, 'hop'); f.inv = Math.max(f.inv, 2 / 60); f.face = a; f.bx = x; f.by = y;
      f.hvx = f.vx = (x - f.x) / mv.active; f.hvy = f.vy = (y - f.y) / mv.active;
      F.ev('swHop', f.x, f.y, 0.5, f.i, { move: 'evade', x2: x, y2: y });
    },
    step(F, f, o, mv) { if (catchFromAir(F, f, o)) return; f.inv = Math.max(f.inv, 2 / 60); f.vx = f.hvx; f.vy = f.hvy; f.z = Math.sin(Math.PI * clamp(f.t / mv.active, 0, 1)) * mv.h; },
    end(F, f, o, mv) { if (Math.hypot(f.bx - f.x, f.by - f.y) < 12) { f.x = f.bx; f.y = f.by; F.keepIn(f); } f.inv = 0; f.z = 0; f.vx *= 0.15; f.vy *= 0.15; setPh(f, 'perch'); F.go(f, 'recover', mv.recovery); F.ev('swLand', f.x, f.y, 0.4, f.i, { move: 'evade' }); return true; },
    phases: mv => [['hop', 'strike', mv.active, 'glide', `${mv.dist} the held way (else away), up to ${mv.h}: untouchable (do / try / catch now: the swoop down out of the air)`], ['perch', 'recover', mv.recovery, 'perch', 'the landing: open']],
  },
};

/** @type {Record<string, import('./index.js').ObjStep>} */
const objs = {
  // the gust's cone: while she winds up and blows
  swCone(F, ob, dt, own) { ob.pt = (ob.pt || 0) + dt; if (!sameGo(own, ob) || (own.state !== 'wind' && own.state !== 'strike')) gone(ob); },
  // the feather: aimed while she winds up (gone if she's hit out of it), then round its loop, a hit each way; home, or
  // into a pillar or a crate, it's gone
  swFeather(F, ob, dt, own, foe, M) {
    const mv = M.move2;
    if (ob.ph === 'aim') { if (!(own.move === 'move2' && own.state === 'wind' && own.ms === ob.ms)) gone(ob); return; }
    ob.ft += dt; const u = Math.min(1, ob.ft / mv.flight), px = ob.x, py = ob.y;
    [ob.x, ob.y] = loopAt(ob, u, own.x, own.y); ob.u = u; ob.va = Math.atan2(ob.y - py, ob.x - px);
    if (u >= 1) { gone(ob); F.ev('swCatch', ob.x, ob.y, 0.4, ob.owner, { move: 'move2' }); return; }
    if (u > 0.01 && solidAt(F, ob.x, ob.y)) { gone(ob); F.ev('swDrop', ob.x, ob.y, 0.4, ob.owner, { move: 'move2' }); return; }
    const leg = u < 0.55 ? 'h1' : 'h2';
    if (!ob[leg] && open(foe) && !foe.gone && foe.inv <= 0 && segDist(foe.x, foe.y, px, py, ob.x, ob.y)[0] <= ob.r + foe.r) {
      if (F.hitF(own, foe, leg === 'h1' ? mv : mv.back, { dir: ob.va, obj: true, move: 'move2' })) { ob[leg] = 1; F.ev('swSnip', foe.x, foe.y, 0.6, ob.owner, { move: 'move2', to: foe.i, how: F.lastRes }); }
    }
  },
};

// ---------------------------------------------------------------- the bot
const unitA = a => [Math.cos(a), Math.sin(a)];
// do / try / catch's danger to the other bot (seen through perceive(): o is Swifty a moment late): her crouch or her dart
// seen with them in its line, off it sideways (or evade); and up close while it's ready, keep out of her dash
// (spacing: a fresh look every half second); her hop coming down by them, the swoop ready
function catchThreat(F, i, me, o, out) {
  const ow = F.f[1 - i], mv = ow.stats.moves.move1, d = Math.hypot(me.x - o.x, me.y - o.y), gap = d - me.r - ow.r, away = Math.atan2(me.y - o.y, me.x - o.x);
  const ahead = Math.abs(angDiff(away, o.face)) < mv.arc * Math.PI / 360 + 0.4;
  if (o.move === 'move1' && (o.state === 'wind' || o.state === 'strike')) {
    const air = o.ph === 'tuck' || o.ph === 'swoop', reach = air ? mv.air.reach : mv.reach, lunge = air ? mv.air.lunge : mv.dash, act = air ? mv.air.active : mv.active;
    const need = reach + (o.state === 'wind' ? lunge : lunge * Math.min(1, Math.max(0, o.left) / act)) + 10 - gap;
    if (need > 0 && ahead) {
      const side = Math.sign(Math.sin(away - o.face)) || 1;   // (out to her side: she only goes straight)
      out.push(['c' + o.ms, o.state === 'wind' ? Math.max(0, o.left) + 0.05 : 0, o.state === 'wind' ? act : Math.max(0.02, o.left), o.face + side * Math.PI / 2, Math.min(need, me.r + ow.r + 14)]);
    }
  } else if ((o.state === 'idle' || o.state === 'walk') && !(o.cd && o.cd[0] > 0.3) && gap < mv.reach + mv.dash * 0.7) {
    const need = mv.reach + mv.dash * 0.7 + 8 - gap, T = 0.12 + need / (150 * me.stats.walk * 0.85);   // (always walkable: it's spacing, not a dodge)
    out.push(['n' + Math.floor(F.time * 2), T, 0.05, away, need, 1]);   // (1: soft, spacing not an attack)
  } else if (o.move === 'evade' && o.ph === 'hop' && !(o.cd && o.cd[0] > 0.3)) {
    const left = Math.max(0, o.left), ex = o.x + o.vx * left, ey = o.y + o.vy * left, A = mv.air;
    const need = me.r + ow.r + A.reach + A.lunge * 0.7 + 8 - Math.hypot(me.x - ex, me.y - ey);
    if (need > 0) out.push(['h' + Math.round((o.T - o.t) * 60), Math.min(left, A.tuck + 0.05), A.active, Math.atan2(me.y - ey, me.x - ex), need, 1]);   // (soft: a swoop that may come)
  }
}
// bugs in the way of a dart from her now (Cpp's flies: sentries, flicked ones, ones on her)
function bugsAhead(F, me, a, len, snap) {
  let n = 0;
  const x1 = me.x + Math.cos(a) * len, y1 = me.y + Math.sin(a) * len;
  for (const b of F.objs) if (isBug(b, me.i) && ((b.st === 'stuck' && b.on === me.i) || segDist(b.x, b.y, me.x, me.y, x1, y1)[0] < snap)) n++;
  return n;
}
/** @type {import('./index.js').BotHooks} */
const ai = {
  want: 165,   // (keep-away: further off, where her feather works)
  // her character (js/fight-style.js): keep-away, hit and run, often a tricky bot
  persona: { keep: 0.7, styles: [0.7, 1, 1.5] },
  // Swifty's dangers to the other bot: the gust's cone, the dart, the feather's loop
  threats(F, i, me, o) {
    const out = [], ow = F.f[1 - i], M = ow.stats.moves;
    if (o.move === 'move3' && o.state === 'wind') {   // the gust: out of the cone, to her side (or back out of its reach)
      const mv = M.move3, cn = { x: o.x, y: o.y, a: o.face };
      if (inCone(cn, mv, me.x, me.y, me.r + 6)) {
        const rel = angDiff(Math.atan2(me.y - o.y, me.x - o.x), o.face), d = Math.hypot(me.x - o.x, me.y - o.y);
        const lat = (mv.arc * Math.PI / 360 - Math.abs(rel)) * d + me.r + 10, back = mv.range + me.r + 8 - d;
        const side = rel >= 0 ? 1 : -1;
        out.push(['g' + Math.round((o.T - o.t) * 60), Math.max(0, o.left), mv.active, lat < back ? o.face + side * Math.PI / 2 : Math.atan2(me.y - o.y, me.x - o.x), Math.min(lat, back)]);
      }
    }
    catchThreat(F, i, me, o, out);
    for (const b of F.objs) {
      if (b.owner === i || b.t >= b.life) continue;
      if (b.kind === 'swFeather' && b.t >= o.age && b.ph === 'fly') {   // the feather: where it'll pass in the next moment (its loop is known: the trail shows it)
        const mv = M.move2;
        for (let k = 1; k <= 14; k++) {
          const tau = k * 0.04, u = Math.min(1, (b.ft + tau) / mv.flight); if (u >= 1) break;
          const leg = u < 0.55 ? 'h1' : 'h2'; if (b[leg]) continue;
          const [x, y] = loopAt(b, u, ow.x, ow.y), d = Math.hypot(me.x - x, me.y - y), need = b.r + me.r + 8 - d;
          if (need > 0) {
            const [x2, y2] = loopAt(b, Math.min(1, u + 0.02), ow.x, ow.y), va = Math.atan2(y2 - y, x2 - x), side = Math.sign(Math.sin(Math.atan2(me.y - y, me.x - x) - va)) || 1;
            out.push(['f' + b.id + leg, tau, 0.05, va + side * Math.PI / 2, need]); break;
          }
        }
      }
    }
    return out;
  },
  // in a move: the gust's cone and the feather's loop aimed at where they'll be (the dart isn't aimed)
  stick(F, i, me, o, C) {
    // hopping: once they're in reach of a swoop from here (where it sees them, late), the dart from the air (Hop then
    // Catch), decided once a hop, keener by level
    if (me.move === 'evade') {
      const K = C.K, A = me.stats.moves.move1.air;
      if (K.swFor !== me.ms) { K.swFor = me.ms; K.swKick = C.rng() < 0.25 + 0.6 * C.L.combo; }
      const gap = Math.hypot(o.x - me.x, o.y - me.y) - me.r - o.r;
      if (K.swKick && me.state === 'strike' && C.ready(0) && me.t > 0.06 && gap < A.reach + A.lunge - 10 && open(o) && !o.gone) { K.swKick = false; C.fire(0); }
      return [0, 0];
    }
    if (me.state !== 'wind' || me.move === 'move1') return [0, 0];
    return unitA(botAim(C, me, o, me.move === 'move3' ? 0.3 : 0.2));   // (where it sees them, led partly, off by its error)
  },
  // open: the dart if they're close (it comes out at once), else the gust (blown away: room again), else the feather
  punish(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap, toFoe } = C.g;
    if (C.ready(0) && gap < M.move1.reach + M.move1.dash - 8 && w.fits(M.move1.startup + M.move1.active * Math.max(0, gap - M.move1.reach) / M.move1.dash)) { C.fire(0); return C.unit(toFoe); }
    // open a while, a dash or two away: dart in for the clip (it goes next think, from the neutral)
    if (C.ready(0) && gap < 150 && w.b - M.move1.startup - M.move1.active > (gap - M.move1.reach - M.move1.dash + 12) / (150 * me.stats.walk) + 0.3 && C.rng() < 0.5) return C.unit(toFoe);
    if (C.ready(2) && d < M.move3.range - 10 && w.fits(M.move3.startup + 0.02)) { C.fire(2); return C.unit(toFoe); }
    if (C.ready(1) && d > 60 && d < 260 && w.fits(M.move2.startup + M.move2.active + M.move2.flight * 0.3)) { C.fire(1); return C.unit(toFoe); }
    return null;
  },
  neutral(F, i, me, o, C, w) {
    const { dist: d, gap, toFoe } = C.g, M = me.stats.moves, C1 = M.move1;
    // bugs about (Cpp's flies): a dart through them, swallowing them (on her too); the sharper, the keener
    const bugs = bugsAhead(F, me, toFoe, C1.dash + 10, C1.snap + 4);
    // the dart: when they come at her (hit and run), while they're busy, or through bugs
    const long = o.left > C1.startup + C1.active * 0.5 + 0.05;   // (the wind-up or recovery seen still has a while to run)
    const inR = gap < C1.reach + C1.dash - 10;
    w.add(0, inR ? (o.state === 'wind' && long ? 0.45 : w.busy && long ? 0.4 : 0.18) : 0, C.unit(toFoe));
    if (bugs >= 1 && C.ready(0)) w.add(0, (0.12 + 0.2 * C.L.smart) * Math.min(3, bugs), C.unit(toFoe));
    w.add(1, d > 70 && d < 280 ? 0.15 : 0, C.unit(toFoe));
    // the gust: her keep-away. Keener the closer they've come (pushed back out to where her feather works), into a wall,
    // or while they're busy; now and then from further off
    const wallBehind = (() => { for (const s of [40, 80, 120]) { const x = o.x + Math.cos(toFoe) * s, y = o.y + Math.sin(toFoe) * s; if (F.contactsAll(x, y, o.r).length) return true; } return false; })();
    const close = d < 115 && (o.state === 'walk' || o.state === 'idle');
    w.add(2, d < M.move3.range - 15 ? (wallBehind ? 0.32 : w.busy ? 0.25 : close ? 0.22 : 0.06) : 0, C.unit(toFoe));
    // a hop in at them, the dart out of the air as it comes down by them (stick), when it's ready
    w.add(3, C.ready(0) && gap > 50 && gap < M.evade.dist + 20 && !w.busy ? 0.06 + 0.07 * C.L.combo : 0, C.unit(toFoe));
  },
  // the hop leaves the spot fast (and she's untouchable for it): just before it lands
  evadeWhen(T, dur, E) { return [T > 0.02 && T < E.active * 0.65, T < E.active * 0.8]; },
};

export default { id: ID, fighter, kits, objs, ai };
