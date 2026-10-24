// Swifty (Swift's bird) for Fight (2026-10-24, the rebuild): the fastest flyer. Three big moves and an evade, a plug-in
// (js/kits/index.js documents the shape; the drawing is js/art/kit-swifty.js). DOM-free, deterministic.
//   move1 Dive Bomb (swDive): she flaps up and hangs there while a shimmer on the floor marks her dive line (it turns
//         after them, slowly), then dives along it at great speed: a big hit that knocks down. Missing (or into a
//         wall) she tumbles, open. Answer: step off the line (early: she can't turn once she goes), or evade
//   move2 Gust (swGust): she hovers and beats her wings; a cone of wind blows out in front, pushing whoever's in it
//         away hard (into a wall: a slam) and peppering them with feathers. Tell: the wings up, and dust and leaves
//         skittering over the floor in the cone. Answer: get out of the cone (to her side, or beyond its reach), or evade
//   move3 Closure (swClosure): a boomerang feather flung out along a curve: out past them, round, and back to her,
//         hitting on both ways (the way back pulls them toward her). Tell: a faint trail of feathers shows its whole
//         loop. Answer: read the loop and stand clear of both legs (it can't turn)
//   evade Wing Hop (swHop): a short flight the held way (away from them if none), the longest evade, untouchable in the
//         air; but a long landing. Answer: punish the landing
// Passive: Lightweight (back on her feet sooner after a hit or a knockdown: stunMul).
import { TAU, angDiff, angMid, clamp, dist, gone, landing, mine, open, sameGo, sd, segDist, setPh, spawn, toward, turnTo } from './lib.js';

const ID = 'swifty';
const fighter = {
  id: ID, name: 'Swifty', lang: 'Swift', role: 'Rushdown', kit3: true,
  blurb: 'The fastest flyer: dive-bombs across the arena, blows you into the walls with her wings, and throws a feather that comes back.',
  passive: 'Lightweight: back on her feet sooner after a hit or a knockdown. The lightest: hits push her the furthest.',
  balance: 'Not tuned for balance yet (2026-10-24, the user: "dont even think about balancing for now").',
  hp: 98, weight: 0.8, walk: 1.45, accel: 34, friction: 32, kbDecay: 3.6, radius: 14, slipMul: 0.25, stunMul: 0.9, reachBar: 0.9,
  moves: {
    move1: { name: 'Dive Bomb', short: 'Dive', do: 'swDive', icon: 'swDive', hold: 'aim',
      blurb: 'Flaps up and hangs there, then dives along a line at great speed: a big hit that knocks down.',
      tell: 'She hangs in the air, and a faint shimmer on the floor marks her dive line.',
      answer: 'Step off the line before she dives (she can\'t turn once she goes), or evade. Missing, she tumbles, open.',
      // up (startup: the line turns aimTurn rad/s toward the held way, else at them), the dive (active: speed u/s along
      // it); hit: bounces off them (recovery); missed or into a wall: tumbles miss s, open
      startup: 0.44, active: 0.44, recovery: 0.28, miss: 0.6, cooldown: 1.6,
      damage: 15, kb: 220, kd: true, contact: true, reach: 5, speed: 540, aimTurn: 1.3 },
    move2: { name: 'Gust', short: 'Gust', do: 'swGust', icon: 'swGust', hold: 'aim',
      blurb: 'Hovers and beats her wings: a cone of wind blows you away hard (into a wall, a slam) with a pepper of feathers.',
      tell: 'Wings up, and dust and leaves skitter over the floor in the cone in front of her.',
      answer: 'Get out of the cone: to her side, or beyond its reach. Or evade. She\'s open as she lands.',
      // the wings up (startup: turning aimTurn rad/s), the blow (active): whoever's in the cone (range, arc degrees
      // across) takes the hit (damage, kb, stun) and is pushed on (push u/s a second) while they're in it
      startup: 0.4, active: 0.32, recovery: 0.36, cooldown: 2.2,
      damage: 6, kb: 180, stun: 0.55, range: 175, arc: 70, push: 1400, aimTurn: 2 },
    move3: { name: 'Closure', short: 'Closure', do: 'swClosure', icon: 'swClosure', hold: 'aim',
      blurb: 'Flings a boomerang feather out on a curve: out past you, round, and back to her, hitting on both ways.',
      tell: 'A faint trail of little feathers shows the whole loop it will fly.',
      answer: 'Read the loop and stand clear of both legs: it can\'t turn. A wall or a crate stops it.',
      // the wind-up (startup: the loop turns aimTurn rad/s); the feather flies flight s round the loop (out: how far its
      // tip goes, x their distance, between near and far; width: how far round it swings on the way back, side the held
      // side (else the side they lean to)); a hit each way (back: the way home's, pulling toward her); r its size
      startup: 0.3, active: 0.06, recovery: 0.3, cooldown: 1.8,
      damage: 7, kb: 150, stun: 0.4, near: 120, far: 270, width: 110, flight: 1.15, r: 9, aimTurn: 3,
      back: { damage: 7, kb: 170, stun: 0.45, prio: 2, stale: false } },
    evade: { name: 'Wing Hop', short: 'Hop', do: 'swHop', icon: 'swHop', hold: null,
      blurb: 'A short flight the held way (away from them if none): the longest evade, untouchable in the air.',
      tell: 'She takes off: a long hop, then a long landing.', answer: 'Follow her and punish the landing.',
      // up and over (active s, dist units, h high: untouchable), then the landing (recovery s, open)
      startup: 0, active: 0.32, recovery: 0.36, cooldown: 1.7, dist: 160, h: 26 },
  },
  phPose: { rise: 'hover', dive: 'dive', bounce: 'air', tumble: 'tumble', flap: 'flap', gust: 'gust', cock: 'cock', fling: 'fling', hop: 'glide', perch: 'perch' },
  phFade: ['fling', 'perch'],
  fields: { hvx: 0, hvy: 0 },   // (the hop's velocity)
  show: ['stand', 'hover', 'stand', 'flap', 'stand', 'cock', 'stand', 'glide'], cheer: 'flap',
};
const P = (a, b, inp) => [a, b, inp];
fighter.clips = {
  move1: { x: [-120, 50], len: 2.2, cam: { x: -20, w: 320 }, a: [P(0.3, 0.38, { light: 1 })] },
  move2: { x: [60, 140], len: 2.4, cam: { x: 110, w: 330 }, a: [P(0.3, 0.38, { heavy: 1 })] },   // (near the wall: blown into it)
  move3: { x: [-90, 60], len: 2.6, cam: { x: 10, w: 330 }, a: [P(0.3, 0.38, { special: 1 })] },
  evade: { x: [-50, 60], len: 2.2, cam: { x: 0, w: 300 }, a: [P(0.82, 0.88, { guard: 1, x: 0, y: -1 })], b: [P(0.3, 0.38, { light: 1 })] },   // (a hop out of Tux's toboggan)
};

// ---------------------------------------------------------------- helpers
// the dive's line: from her along her facing, as far as the dive goes or a wall
function diveLine(F, f, mv, ln) {
  const c = Math.cos(f.face), s = Math.sin(f.face), L = mv.speed * mv.active;
  let d = 0; for (; d < L; d += 6) if (F.contactsAll(f.x + c * (d + 6), f.y + s * (d + 6), f.r).length) break;
  ln.x = f.x; ln.y = f.y; ln.a = f.face; ln.len = d;
}
// the gust's cone follows her
const coneTo = (cn, f) => { cn.x = f.x; cn.y = f.y; cn.a = f.face; };
// in the gust's cone (range, arc across): a body of radius r at (x, y)
export function inCone(cn, mv, x, y, r) {
  const d = Math.hypot(x - cn.x, y - cn.y);
  return d - r <= mv.range && Math.abs(angDiff(Math.atan2(y - cn.y, x - cn.x), cn.a)) <= mv.arc * Math.PI / 360 + Math.atan2(r, Math.max(d, 1));
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

const kits = {
  swDive: {
    moves: true,
    press(F, f, o, mv) {
      setPh(f, 'rise');
      const ln = spawn(F, f, { kind: 'swLine', a: f.face, len: 0, ph: 'aim', life: 99 }); diveLine(F, f, mv, ln);
      F.ev('swRise', f.x, f.y, 0.5, f.i, { move: 'move1' });
    },
    wind(F, f, o, mv, dt, c) {
      f.vx *= 0.85; f.vy *= 0.85;
      f.face = turnTo(f.face, c.mag > 0.3 ? c.dirA : toward(f, o), mv.aimTurn * dt);
      const ln = mine(F, f, 'swLine'); if (ln) diveLine(F, f, mv, ln);
    },
    start(F, f, o, mv) {
      setPh(f, 'dive');
      const ln = mine(F, f, 'swLine'); if (ln) { diveLine(F, f, mv, ln); ln.ph = 'go'; }
      F.ev('swDive', f.x, f.y, 0.7, f.i, { move: 'move1' });
    },
    step(F, f, o, mv) {
      if (f.ph !== 'dive') return;
      f.vx = Math.cos(f.face) * mv.speed; f.vy = Math.sin(f.face) * mv.speed;
      if (!f.hit && open(o) && !o.gone && dist(f, o) <= f.r + o.r + mv.reach && F.hitF(f, o, mv, { dir: angMid(toward(f, o), f.face) })) {
        f.hit = true;
        if (f.state === 'strike') {
          const ln = mine(F, f, 'swLine'); if (ln) gone(ln);
          if (F.lastRes === 'hit') { setPh(f, 'bounce'); f.vx = -Math.cos(f.face) * 90; f.vy = -Math.sin(f.face) * 90; F.go(f, 'recover', mv.recovery); }
          else { setPh(f, 'tumble'); f.vx *= 0.2; f.vy *= 0.2; F.go(f, 'recover', mv.miss); F.ev('swTumble', f.x, f.y, 0.5, f.i, { move: 'move1' }); }
        }
      }
    },
    end(F, f, o, mv) { setPh(f, 'tumble'); f.vx *= 0.25; f.vy *= 0.25; F.go(f, 'recover', mv.miss); F.ev('swTumble', f.x, f.y, 0.5, f.i, { move: 'move1' }); return true; },
    wall(F, f, c) {
      if (f.ph !== 'dive') return false;
      const mv = f.stats.moves.move1, dn = Math.cos(f.face) * c.nx + Math.sin(f.face) * c.ny;
      if (dn > -0.5) { const vn = f.vx * c.nx + f.vy * c.ny; f.vx -= vn * c.nx; f.vy -= vn * c.ny; return true; }   // (glancing: along it)
      f.vx *= 0.1; f.vy *= 0.1;
      F.ev('wall', f.x - c.nx * f.r, f.y - c.ny * f.r, 0.3, f.i, { nx: c.nx, ny: c.ny });
      setPh(f, 'tumble'); F.go(f, 'recover', mv.miss + 0.1); F.ev('swTumble', f.x, f.y, 0.6, f.i, { move: 'move1' });
      return true;
    },
    phases: mv => [['rise', 'wind', mv.startup, 'hover', `up, hanging; the shimmer marks her line (turning ${mv.aimTurn} rad/s)`], ['dive', 'strike', 'up to ' + mv.active, 'dive', `${mv.speed} u/s along it`],
      ['bounce', 'recover', mv.recovery, 'air', 'hit: off them'], ['tumble', 'recover', mv.miss, 'tumble', 'missed or into a wall: open']],
  },
  swGust: {
    moves: true,
    press(F, f, o, mv) { setPh(f, 'flap'); const cn = spawn(F, f, { kind: 'swCone', a: f.face, ph: 'aim', life: 99 }); coneTo(cn, f); F.ev('swFlap', f.x, f.y, 0.5, f.i, { move: 'move2' }); },
    wind(F, f, o, mv, dt, c) {
      f.vx *= 0.85; f.vy *= 0.85;
      f.face = turnTo(f.face, c.mag > 0.3 ? c.dirA : toward(f, o), mv.aimTurn * dt);
      const cn = mine(F, f, 'swCone'); if (cn) coneTo(cn, f);
    },
    start(F, f, o, mv) {
      setPh(f, 'gust');
      const cn = mine(F, f, 'swCone'); if (cn) { coneTo(cn, f); cn.ph = 'blow'; cn.pt = 0; }
      F.ev('swGust', f.x, f.y, 0.8, f.i, { move: 'move2', a: f.face });
      if (cn && open(o) && !o.gone && o.z < 30 && inCone(cn, mv, o.x, o.y, o.r)) {
        f.hit = F.hitF(f, o, mv, { dir: angMid(toward(f, o), f.face), obj: true, noFlank: true, move: 'move2' }) && F.lastRes === 'hit';
        if (f.hit) F.ev('swFeathers', o.x, o.y, 0.7, f.i, { move: 'move2', to: o.i, a: f.face });
      }
    },
    step(F, f, o, mv, dt) {   // the wind keeps pushing whoever it hit while they're in it (and still reeling)
      f.vx *= 0.8; f.vy *= 0.8;
      const cn = mine(F, f, 'swCone');
      if (f.hit && cn && o.state === 'hurt' && inCone(cn, mv, o.x, o.y, o.r + 30)) { const a = toward(f, o); o.vx += Math.cos(a) * mv.push * dt; o.vy += Math.sin(a) * mv.push * dt; }
    },
    phases: mv => [['flap', 'wind', mv.startup, 'flap', `wings up; dust skitters in the cone (${mv.range}, ${mv.arc}°)`], ['gust', 'strike', mv.active, 'gust', `the blow: kb ${mv.kb}, pushed ${mv.push} u/s² in it`], ['gust', 'recover', mv.recovery, 'gust', 'landing: open']],
  },
  swClosure: {
    can(F, f) { return !mine(F, f, 'swFeather'); },
    press(F, f, o, mv, c) {
      setPh(f, 'cock');
      const b = spawn(F, f, { kind: 'swFeather', ph: 'aim', a: f.face, side: 0, out: 0, width: 0, x0: f.x, y0: f.y, u: 0, r: mv.r, h1: 0, h2: 0, life: 99 });
      aimLoop(F, f, o, mv, b, c); b.x = b.x0; b.y = b.y0;
    },
    wind(F, f, o, mv, dt, c) {
      f.face = turnTo(f.face, c.mag > 0.3 && Math.abs(angDiff(c.dirA, toward(f, o))) < Math.PI / 2 ? c.dirA : toward(f, o), mv.aimTurn * dt);
      const b = mine(F, f, 'swFeather'); if (b && b.ph === 'aim') { aimLoop(F, f, o, mv, b, c); b.x = b.x0; b.y = b.y0; }
    },
    start(F, f, o, mv) {
      setPh(f, 'fling');
      const b = mine(F, f, 'swFeather'); if (b) { b.ph = 'fly'; b.ft = 0; b.mv = null; }
      F.ev('swFling', f.x, f.y, 0.6, f.i, { move: 'move3' });
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
    step(F, f, o, mv) { f.inv = Math.max(f.inv, 2 / 60); f.vx = f.hvx; f.vy = f.hvy; f.z = Math.sin(Math.PI * clamp(f.t / mv.active, 0, 1)) * mv.h; },
    end(F, f, o, mv) { if (Math.hypot(f.bx - f.x, f.by - f.y) < 12) { f.x = f.bx; f.y = f.by; F.keepIn(f); } f.inv = 0; f.z = 0; f.vx *= 0.15; f.vy *= 0.15; setPh(f, 'perch'); F.go(f, 'recover', mv.recovery); F.ev('swLand', f.x, f.y, 0.4, f.i, { move: 'evade' }); return true; },
    phases: mv => [['hop', 'strike', mv.active, 'glide', `${mv.dist} the held way (else away), up to ${mv.h}: untouchable`], ['perch', 'recover', mv.recovery, 'perch', 'the landing: open']],
  },
};

const objs = {
  // the dive's shimmer: while she's up (aim) and as she dives (go); gone with the move
  swLine(F, ob, dt, own) { if (!sameGo(own, ob) || !(own.state === 'wind' || (own.state === 'strike' && own.ph === 'dive'))) gone(ob); },
  // the gust's cone: while she winds up and blows
  swCone(F, ob, dt, own) { ob.pt = (ob.pt || 0) + dt; if (!sameGo(own, ob) || (own.state !== 'wind' && own.state !== 'strike')) gone(ob); },
  // the feather: aimed while she winds up (gone if she's hit out of it), then round its loop, a hit each way; home, or
  // into a pillar or a crate, it's gone
  swFeather(F, ob, dt, own, foe, M) {
    const mv = M.move3;
    if (ob.ph === 'aim') { if (!(own.move === 'move3' && own.state === 'wind' && own.ms === ob.ms)) gone(ob); return; }
    ob.ft += dt; const u = Math.min(1, ob.ft / mv.flight), px = ob.x, py = ob.y;
    [ob.x, ob.y] = loopAt(ob, u, own.x, own.y); ob.u = u; ob.va = Math.atan2(ob.y - py, ob.x - px);
    if (u >= 1) { gone(ob); F.ev('swCatch', ob.x, ob.y, 0.4, ob.owner, { move: 'move3' }); return; }
    if (u > 0.01 && solidAt(F, ob.x, ob.y)) { gone(ob); F.ev('swDrop', ob.x, ob.y, 0.4, ob.owner, { move: 'move3' }); return; }
    const leg = u < 0.55 ? 'h1' : 'h2';
    if (!ob[leg] && open(foe) && !foe.gone && foe.inv <= 0 && segDist(foe.x, foe.y, px, py, ob.x, ob.y)[0] <= ob.r + foe.r) {
      if (F.hitF(own, foe, leg === 'h1' ? mv : mv.back, { dir: ob.va, obj: true, move: 'move3' })) { ob[leg] = 1; F.ev('swSnip', foe.x, foe.y, 0.6, ob.owner, { move: 'move3', to: foe.i, how: F.lastRes }); }
    }
  },
};

// ---------------------------------------------------------------- the bot
const unitA = a => [Math.cos(a), Math.sin(a)];
const ai = {
  want: 175,
  // Swifty's dangers to the other bot: the dive's line, the gust's cone, the feather's loop
  threats(F, i, me, o) {
    const out = [], ow = F.f[1 - i], M = ow.stats.moves;
    if (o.move === 'move1' && (o.state === 'wind' || (o.state === 'strike' && o.ph === 'dive'))) {   // the dive: off its line, sideways (well clear while she can still turn)
      const mv = M.move1, L = mv.speed * (o.state === 'wind' ? mv.active : Math.max(0, o.left));
      const [d, u] = segDist(me.x, me.y, o.x, o.y, o.x + Math.cos(o.face) * L, o.y + Math.sin(o.face) * L);
      const need = me.r + ow.r + mv.reach + (o.state === 'wind' ? 22 : 8) - d;
      if (need > 0) {
        const side = Math.sign(Math.sin(Math.atan2(me.y - o.y, me.x - o.x) - o.face)) || 1;
        out.push(['d' + Math.round((o.T - o.t) * 60) + o.state, (o.state === 'wind' ? Math.max(0, o.left) : 0) + Math.max(0, u * L - me.r - ow.r) / mv.speed, 0.08, o.face + side * Math.PI / 2, need]);
      }
    }
    if (o.move === 'move2' && o.state === 'wind') {   // the gust: out of the cone, to her side (or back out of its reach)
      const mv = M.move2, cn = { x: o.x, y: o.y, a: o.face };
      if (inCone(cn, mv, me.x, me.y, me.r + 6)) {
        const rel = angDiff(Math.atan2(me.y - o.y, me.x - o.x), o.face), d = Math.hypot(me.x - o.x, me.y - o.y);
        const lat = (mv.arc * Math.PI / 360 - Math.abs(rel)) * d + me.r + 10, back = mv.range + me.r + 8 - d;
        const side = rel >= 0 ? 1 : -1;
        out.push(['g' + Math.round((o.T - o.t) * 60), Math.max(0, o.left), mv.active, lat < back ? o.face + side * Math.PI / 2 : Math.atan2(me.y - o.y, me.x - o.x), Math.min(lat, back)]);
      }
    }
    for (const b of F.objs) {   // the feather: where it'll pass in the next moment (its loop is known: the trail shows it)
      if (b.kind !== 'swFeather' || b.owner === i || b.t < o.age || b.ph !== 'fly') continue;
      const mv = M.move3;
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
    return out;
  },
  stick(F, i, me, o) {
    if (me.state !== 'wind') return [0, 0];
    const lead = me.move === 'move1' ? 0.35 : 0.2, x = o.x + o.vx * lead, y = o.y + o.vy * lead;
    return unitA(Math.atan2(y - me.y, x - me.x));
  },
  punish(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap, toFoe } = C.g;
    if (w.line && C.ready(0) && gap < M.move1.speed * M.move1.active - 10 && w.fits(M.move1.startup + Math.max(0, gap) / M.move1.speed)) { C.fire(0); return C.unit(toFoe); }
    if (C.ready(1) && d < M.move2.range - 10 && w.fits(M.move2.startup + 0.02)) { C.fire(1); return C.unit(toFoe); }
    if (C.ready(2) && d > 60 && d < 260 && w.fits(M.move3.startup + M.move3.active + M.move3.flight * 0.3)) { C.fire(2); return C.unit(toFoe); }
    return null;
  },
  neutral(F, i, me, o, C, w) {
    const { dist: d, toFoe } = C.g, M = me.stats.moves;
    // near a wall themselves (where a gust slams them): the gust keener
    const wallBehind = (() => { for (const s of [40, 80, 120]) { const x = o.x + Math.cos(toFoe) * s, y = o.y + Math.sin(toFoe) * s; if (F.contactsAll(x, y, o.r).length) return true; } return false; })();
    w.add(0, w.line && d > 80 && d < M.move1.speed * M.move1.active ? (w.busy ? 0.35 : 0.13) : 0, C.unit(toFoe));
    w.add(1, d < M.move2.range - 15 ? (wallBehind ? 0.32 : w.busy ? 0.25 : 0.07) : 0, C.unit(toFoe));
    w.add(2, d > 70 && d < 280 ? 0.15 : 0, C.unit(toFoe));
  },
  // the hop leaves the spot fast (and she's untouchable for it): just before it lands
  evadeWhen(T, dur, E) { return [T > 0.02 && T < E.active * 0.65, T < E.active * 0.8]; },
};

export default { id: ID, fighter, kits, objs, ai };
