// Docky (Docker's whale) for Fight (2026-10-24, the rebuild): the big shipping whale. Three big moves and an evade, a
// plug-in (js/kits/index.js documents the shape; the drawing is js/art/kit-docky.js). DOMless, deterministic.
//   move1 Container Drop (dkDrop): he heaves; three container shadows lie in a line toward the foe, turning with him
//         while he heaves; then the containers come down on them one after another (each floors whoever's under it)
//         and stay a few seconds as solid crates. Tell: the shadows, darkening as each one falls. Answer: step off the
//         line (sideways), or evade as they land
//   move2 Compose Up (dkWall): containers stacked into a short wall in front of him, between him and the foe: solid
//         (walking, slides, thrown things and penguins stop at it) and a hit at him through it clangs off. Landing on
//         someone right in front, it shoves them back. Answer: go round it (it's short), or wait it out
//   move3 Ship It (dkShip): the horn blows (he puffs up, a wake shows on the floor ahead), then he rams forward like a
//         cargo ship: unstoppable while he rams (hits hurt him but don't stop him), barely turning, knocks down. His
//         own containers in the way are shoved ahead of him (they knock down whoever they hit). Missing (or into a wall)
//         he's beached, open. Answer: step aside (he can't turn), hit him during the horn, or evade
//   evade Dive (dkDive): down into a splash, untouchable but rooted, ripples where he is; then he breaches, splashing
//         anyone right next to him back a little, and he's open for a moment. Answer: back off the ripples, punish the
//         breach
// Passive: Isolation (the first hit he takes each round does no damage: fight.js hitF's iso).
import { TAU, angDiff, angMid, clamp, dist, gone, inside, mine, open, sameGo, sd, segDist, setPh, spawn, toward, turnTo } from './lib.js';

const ID = 'docky';
const fighter = {
  id: ID, name: 'Docky', lang: 'Docker', role: 'Builder', kit3: true,
  blurb: 'The big shipping whale: drops containers on you from the sky, stacks them into walls, and rams like a cargo ship.',
  passive: 'Isolation: the first hit he takes each round does no damage. The heaviest: hits push him the least.',
  balance: 'Not tuned for balance yet (2026-10-24, the user: "dont even think about balancing for now").',
  hp: 124, weight: 1.38, walk: 0.9, accel: 24, friction: 26, kbDecay: 2.8, radius: 20, slipMul: 0.18, reachBar: 0.7, isolation: true,
  moves: {
    move1: { name: 'Container Drop', short: 'Drop', do: 'dkDrop', icon: 'dkDrop', hold: 'aim',
      blurb: 'Heaves the containers off his back: they come down in a line toward you one after another, then stay a while as crates.',
      tell: 'Three container shadows on the floor in a line, darkening as each one falls.',
      answer: 'Step off the line, sideways (or evade as they land). He\'s open while he heaves and throws.',
      // the heave (startup: the line turns aimTurn rad/s toward the held way, else at them), the throw; n containers
      // (size square) at the middle one's distance (them, first + gap .. far) +- gap; each waits delay + k x every after
      // the throw, falls fall s (a hit on whoever's under it), then stays life s as a solid crate
      startup: 0.42, active: 0.1, recovery: 0.4, cooldown: 2.4,
      damage: 13, kb: 190, kd: true, n: 3, size: 34, first: 58, gap: 46, far: 190, aimTurn: 1.6, delay: 0.1, every: 0.16, fall: 0.3, life: 3 },
    move2: { name: 'Compose Up', short: 'Compose', do: 'dkWall', icon: 'dkWall', hold: null,
      blurb: 'Stacks containers into a short wall right in front of him: it blocks walking, slides, thrown things, and hits at him through it.',
      tell: 'The containers pile up into a tower on his back, and their shadows show where the wall goes.',
      answer: 'Go round it (it\'s short) or wait it out; it doesn\'t cover his back. Too close, and it shoves you back.',
      // the stack (startup), then n containers (size, spacing apart, across the way to them, at units in front) drop in
      // fall s; life s. Landing on someone: a small shove (damage, kb, stun) away from him
      startup: 0.32, active: 0.1, recovery: 0.3, cooldown: 3.6,
      damage: 6, kb: 170, stun: 0.3, n: 3, size: 28, spacing: 26, at: 52, fall: 0.18, life: 3.4 },
    move3: { name: 'Ship It', short: 'Ship It', do: 'dkShip', icon: 'dkShip', hold: 'steer',
      blurb: 'The horn blows, then he rams across the arena like a cargo ship: nothing stops him, and his own containers fly ahead of him.',
      tell: 'The horn: he puffs up, steam out of his blowhole, and a wake shows on the floor ahead of him.',
      answer: 'Step aside: he can barely turn. Hit him during the horn, or evade. Missing, he\'s beached and open.',
      // the horn (startup: turning aimTurn rad/s), the ram (active: speed u/s, steering steer rad/s; hits on him do their
      // damage but don't stop him); hit: docks (recovery); missed or into a wall: beached s, open. His containers in the
      // way: shoved at shove u/s (a cargo hit on whoever they run into)
      startup: 0.62, active: 0.9, recovery: 0.35, beached: 0.85, cooldown: 2.6,
      damage: 19, kb: 250, kd: true, contact: true, reach: 4, speed: 300, steer: 0.6, aimTurn: 1, shove: 430,
      cargo: { damage: 11, kb: 210, kd: true, prio: 2, stale: false } },
    evade: { name: 'Dive', short: 'Dive', do: 'dkDive', icon: 'dkDive', hold: null,
      blurb: 'Dives into a splash of water: untouchable but stuck there, then breaches, splashing anyone right next to him back.',
      tell: 'Ripples where he went under: they churn just before he comes up.',
      answer: 'Back off the ripples and punish him as he comes up: he\'s open then.',
      // under (active: untouchable, rooted, not there to bump into), then the breach (recovery, open): anyone within r of
      // him (their edge) takes a little splash (damage, kb, stun)
      startup: 0, active: 0.55, recovery: 0.35, cooldown: 2.4, damage: 4, kb: 190, stun: 0.3, r: 30, stale: false },
  },
  phPose: { heave: 'heave', toss: 'toss', stack: 'stack', build: 'push', horn: 'horn', ram: 'ram', dock: 'ram', beached: 'beached', under: 'dive', breach: 'breach' },
  phFade: ['toss', 'build', 'dock'],
  fields: {},
  show: ['stand', 'heave', 'stand', 'stack', 'stand', 'horn', 'stand', 'breach'], cheer: 'breach',
};
const P = (a, b, inp) => [a, b, inp];
fighter.clips = {
  move1: { x: [-110, 40], len: 2.5, cam: { x: -10, w: 320 }, a: [P(0.3, 0.38, { light: 1 })] },
  move2: { x: [-70, 70], len: 2.6, cam: { x: 0, w: 300 }, a: [P(0.3, 0.38, { heavy: 1 })], b: [P(0.55, 0.62, { light: 1 })] },   // (Tux's toboggan into the wall)
  move3: { x: [-120, 50], len: 2.6, cam: { x: -20, w: 330 }, a: [P(0.3, 0.38, { special: 1 })] },
  evade: { x: [-50, 60], len: 1.65, cam: { x: 0, w: 280 }, a: [P(0.8, 0.86, { guard: 1 })], b: [P(0.3, 0.38, { light: 1 })] },   // (under Tux's toboggan)
};

// ---------------------------------------------------------------- helpers
const MK = { move1: 1, move2: 2 };
// his containers that are down (solids)
const boxes = (F, i) => F.objs.filter(b => b.kind === 'dkBox' && b.owner === i && b.z <= 0 && b.t < b.life);
// a point clear of the solids (not his own boxes: they may be replaced), inside the arena by pad
const spot = (F, x, y, pad) => inside(F, x, y, pad);
// the Container Drop's spots: n along his facing, the middle one at their distance (first + gap .. far)
function dropSpots(F, f, o, mv) {
  const dm = clamp(dist(f, o), mv.first + mv.gap, mv.far), c = Math.cos(f.face), s = Math.sin(f.face), out = [];
  for (let k = 0; k < mv.n; k++) { const d = dm + (k - (mv.n - 1) / 2) * mv.gap; out.push(spot(F, f.x + c * d, f.y + s * d, mv.size * 0.6)); }
  return out;
}
// the wall's spots: across the way to them, at units in front
function wallSpots(F, f, mv) {
  const c = Math.cos(f.face), s = Math.sin(f.face), out = [];
  for (let k = 0; k < mv.n; k++) { const u = (k - (mv.n - 1) / 2) * mv.spacing; out.push(spot(F, f.x + c * mv.at - s * u, f.y + s * mv.at + c * u, mv.size * 0.55)); }
  return out;
}
// how far along his facing a body of his radius gets before a wall or a solid (his own containers don't count: he
// shoves them), up to len
function runLen(F, f, a, len) {
  const c = Math.cos(a), s = Math.sin(a);
  for (let d = 6; d <= len; d += 6) if (F.contactsAll(f.x + c * d, f.y + s * d, f.r).some(k => !(k.solid && k.solid.kind === 'dkBox' && k.solid.owner === f.i))) return Math.max(0, d - 6);
  return len;
}
// a hit at him from a (opt: fight.js hitF's) passing through one of his containers on the way: the segment from where
// it comes to him crosses one
function throughBox(F, a, d, opt) {
  const bs = boxes(F, d.i); if (!bs.length) return null;
  const ox = opt.obj ? d.x - Math.cos(opt.dir ?? 0) * 60 : a.x, oy = opt.obj ? d.y - Math.sin(opt.dir ?? 0) * 60 : a.y;
  for (const b of bs) for (let k = 1; k < 10; k++) { const u = k / 10, x = ox + (d.x - ox) * u, y = oy + (d.y - oy) * u; if (sd(b, x, y)[0] < 1) return b; }
  return null;
}
const beach = (F, f, mv, why) => { setPh(f, 'beached'); f.vx *= 0.15; f.vy *= 0.15; F.go(f, 'recover', mv.beached); F.ev('dkBeach', f.x, f.y, why === 'wall' ? 0.8 : 0.5, f.i, { move: 'move3', why }); const w = mine(F, f, 'dkWake'); if (w) gone(w); };
// a container falling from high up onto (x, y): wait s after now, then fall s; mk which move's
const drop = (F, f, x, y, mv, mk, wait, k, a) => spawn(F, f, { kind: 'dkBox', shape: 'box', x, y, w: mv.size, h: mv.size, r: 3, z: 999, ph: 'mark', k, a, mk, wait, fall: mv.fall, ft: 0, life: 99, solid: 1, by: -1, hit: false });

const kits = {
  dkDrop: {
    press(F, f, o, mv) {
      setPh(f, 'heave');
      for (const b of F.objs) if (b.kind === 'dkBox' && b.owner === f.i && b.mk === 'move1') { gone(b); F.ev('dkPoof', b.x, b.y, 0.4, f.i, { move: 'move1' }); }   // (the last drop's crates go)
      dropSpots(F, f, o, mv).forEach(([x, y], k) => drop(F, f, x, y, mv, 'move1', 0, k, f.face));
    },
    wind(F, f, o, mv, dt, c) {   // heaving: turning (slowly) the held way, else at them; the shadows follow
      f.face = turnTo(f.face, c.mag > 0.3 ? c.dirA : toward(f, o), mv.aimTurn * dt);
      const sp = dropSpots(F, f, o, mv);
      for (const b of F.objs) if (b.kind === 'dkBox' && b.owner === f.i && b.ph === 'mark' && sameGo(f, b)) { [b.x, b.y] = sp[b.k]; b.a = f.face; }
    },
    start(F, f, o, mv) {
      setPh(f, 'toss');
      for (const b of F.objs) if (b.kind === 'dkBox' && b.owner === f.i && b.ph === 'mark' && sameGo(f, b)) { b.ph = 'wait'; b.wait = mv.delay + b.k * mv.every; b.ft = 0; b.t0 = b.t; }
      F.ev('dkToss', f.x, f.y, 0.6, f.i, { move: 'move1' });
    },
    phases: mv => [['heave', 'wind', mv.startup, 'heave', `rears back; ${mv.n} shadows in a line toward them, turning ${mv.aimTurn} rad/s`], ['toss', 'strike', mv.active, 'toss', 'the containers go up'],
      ['toss', 'recover', mv.recovery, 'toss', ''], ['(the containers)', '', `${mv.delay} + k x ${mv.every} + ${mv.fall}`, '', `each falls on its shadow (${mv.size} square), then a crate for ${mv.life} s`]],
  },
  dkWall: {
    press(F, f, o, mv) {
      setPh(f, 'stack');
      for (const b of F.objs) if (b.kind === 'dkBox' && b.owner === f.i && b.mk === 'move2') { gone(b); F.ev('dkPoof', b.x, b.y, 0.4, f.i, { move: 'move2' }); }   // (one wall at a time)
      wallSpots(F, f, mv).forEach(([x, y], k) => drop(F, f, x, y, mv, 'move2', 0, k, f.face));
    },
    wind(F, f, o, mv) {   // (he faces them as he stacks: the wall's shadows with him)
      const sp = wallSpots(F, f, mv);
      for (const b of F.objs) if (b.kind === 'dkBox' && b.owner === f.i && b.ph === 'mark' && sameGo(f, b)) [b.x, b.y] = sp[b.k];
    },
    start(F, f, o, mv) {
      setPh(f, 'build');
      for (const b of F.objs) if (b.kind === 'dkBox' && b.owner === f.i && b.ph === 'mark' && sameGo(f, b)) { b.ph = 'wait'; b.wait = b.k * 0.04; b.ft = 0; b.t0 = b.t; }
      F.ev('dkBuild', f.x, f.y, 0.6, f.i, { move: 'move2' });
    },
    phases: mv => [['stack', 'wind', mv.startup, 'stack', 'the tower on his back; the wall\'s shadows show'], ['build', 'strike', mv.active, 'push', `${mv.n} containers drop ${mv.at} in front, across`],
      ['build', 'recover', mv.recovery, 'push', ''], ['(the wall)', '', mv.life, '', 'solid; a hit at him through it clangs off']],
  },
  dkShip: {
    moves: true,
    press(F, f, o, mv) {
      setPh(f, 'horn');
      spawn(F, f, { kind: 'dkWake', a: f.face, len: runLen(F, f, f.face, mv.speed * mv.active), ph: 'aim', life: 99 });
      F.ev('dkHorn', f.x, f.y, 0.7, f.i, { move: 'move3' });
    },
    wind(F, f, o, mv, dt, c) {
      f.vx *= 0.8; f.vy *= 0.8;
      f.face = turnTo(f.face, c.mag > 0.3 ? c.dirA : toward(f, o), mv.aimTurn * dt);
      const w = mine(F, f, 'dkWake'); if (w) { w.x = f.x; w.y = f.y; w.a = f.face; w.len = runLen(F, f, f.face, mv.speed * mv.active); }
    },
    start(F, f, o, mv) {
      setPh(f, 'ram');
      const w = mine(F, f, 'dkWake'); if (w) { w.ph = 'go'; w.x = f.x; w.y = f.y; }
      F.ev('dkRam', f.x, f.y, 0.7, f.i, { move: 'move3' });
    },
    step(F, f, o, mv, dt, c) {
      if (f.ph !== 'ram') { f.vx *= 0.85; f.vy *= 0.85; return; }
      if (c.mag > 0.3) f.face = turnTo(f.face, c.dirA, mv.steer * dt);
      f.vx = Math.cos(f.face) * mv.speed; f.vy = Math.sin(f.face) * mv.speed;
      if (!f.hit && open(o) && !o.gone && dist(f, o) <= f.r + o.r + mv.reach && F.hitF(f, o, mv, { dir: angMid(toward(f, o), f.face) })) {
        f.hit = true;
        if (f.state === 'strike') { setPh(f, 'dock'); f.vx *= 0.3; f.vy *= 0.3; F.go(f, 'recover', mv.recovery); const w = mine(F, f, 'dkWake'); if (w) gone(w); }
      }
    },
    end(F, f, o, mv) { beach(F, f, mv, 'end'); return true; },
    wall(F, f, c) {
      const mv = f.stats.moves.move3, b = c.solid;
      if (f.ph !== 'ram') return false;
      if (b && b.kind === 'dkBox' && b.owner === f.i) {   // his own container: shoved on ahead of him
        if (Math.hypot(b.vx, b.vy) < mv.shove * 0.8) { b.vx = Math.cos(f.face) * mv.shove; b.vy = Math.sin(f.face) * mv.shove; b.by = f.i; b.hit = false; b.ph = 'slide'; F.ev('dkShove', b.x, b.y, 0.6, f.i, { move: 'move3' }); }
        return true;
      }
      const dn = Math.cos(f.face) * c.nx + Math.sin(f.face) * c.ny;
      if (dn > -0.5) { const vn = f.vx * c.nx + f.vy * c.ny; f.vx -= vn * c.nx; f.vy -= vn * c.ny; return true; }   // (glancing: along it)
      F.ev('wall', f.x - c.nx * f.r, f.y - c.ny * f.r, 0.5, f.i, { nx: c.nx, ny: c.ny });
      beach(F, f, mv, 'wall'); return true;
    },
    phases: mv => [['horn', 'wind', mv.startup, 'horn', `the horn; turning ${mv.aimTurn} rad/s; the wake shows`], ['ram', 'strike', 'up to ' + mv.active, 'ram', `${mv.speed} u/s, steers ${mv.steer} rad/s; hits on him don't stop him; his containers shoved at ${mv.shove}`],
      ['dock', 'recover', mv.recovery, 'ram', 'hit'], ['beached', 'recover', mv.beached, 'beached', 'missed or into a wall: open']],
  },
  dkDive: {
    moves: true,
    start(F, f, o, mv) {
      setPh(f, 'under'); f.vx = f.vy = 0; f.inv = Math.max(f.inv, 2 / 60); f.gone = 1;
      F.ev('dkDive', f.x, f.y, 0.6, f.i, { move: 'evade' });
    },
    step(F, f) { f.vx = f.vy = 0; f.inv = Math.max(f.inv, 2 / 60); f.gone = 1; },
    end(F, f, o, mv) {
      f.inv = 0; f.gone = 0; setPh(f, 'breach'); F.go(f, 'recover', mv.recovery);
      F.keepIn(f);
      let hit = false;
      if (open(o) && !o.gone && o.inv <= 0 && dist(f, o) - o.r - f.r <= mv.r) hit = F.hitF(f, o, mv, { dir: toward(f, o), obj: true, noFlank: true, move: 'evade' }) && F.lastRes === 'hit';
      F.ev('dkBreach', f.x, f.y, 0.7, f.i, { move: 'evade', hit });
      return true;
    },
    phases: mv => [['under', 'strike', mv.active, '(under the water)', 'untouchable, rooted, not there to bump'], ['breach', 'recover', mv.recovery, 'breach', `up: splashes anyone within ${mv.r} back; open`]],
  },
};

const objs = {
  // a container: a shadow while he heaves or stacks (mark: tied to that go), waiting, falling (a hit on whoever's under
  // it as it lands), then a solid crate; shoved by his ram, it slides till it meets something (a hit on who it runs into)
  dkBox(F, ob, dt, own, foe, M) {
    const mv = M[ob.mk];
    if (ob.ph === 'mark') { if (!(sameGo(own, ob) && own.state === 'wind')) gone(ob); return; }
    if (ob.ph === 'wait') { if (ob.t - ob.t0 >= ob.wait) { ob.ph = 'fall'; ob.ft = 0; } return; }
    if (ob.ph === 'fall') {
      ob.ft += dt;
      if (ob.ft < ob.fall) return;
      ob.ph = 'down'; ob.z = 0; ob.life = ob.t + mv.life;
      F.ev('dkLand', ob.x, ob.y, ob.mk === 'move1' ? 0.7 : 0.5, ob.owner, { move: ob.mk });
      for (const f of F.f) {
        if (f.state === 'ko' || f.z > 20 || f.gone) continue;
        const [d] = sd(ob, f.x, f.y);
        if (d >= f.r * 0.6) { if (d < f.r) F.keepIn(f); continue; }
        if (f === foe) {
          const a = d > -ob.w / 2 + 2 ? Math.atan2(f.y - ob.y, f.x - ob.x) : own.face;
          const dir = ob.mk === 'move2' ? toward(own, foe) : a, ok = F.hitF(own, foe, mv, { dir, obj: true, unblockable: true, noFlank: true, move: ob.mk });
          if (ok && F.lastRes === 'hit') { ob.hit = true; F.ev('dkCrush', ob.x, ob.y, 0.8, ob.owner, { move: ob.mk, to: foe.i }); }
          for (let n = 0; n < 30 && sd(ob, f.x, f.y)[0] < f.r; n++) { f.x += Math.cos(dir) * 2; f.y += Math.sin(dir) * 2; }   // (out from under it the way it threw them, not back into it)
        }
        if (f.state !== 'grabbed') F.keepIn(f);
      }
      return;
    }
    if (ob.t >= ob.life) { F.ev('dkPoof', ob.x, ob.y, 0.4, ob.owner, { move: ob.mk }); return; }
    // sliding (shoved by the ram)
    const sp = Math.hypot(ob.vx, ob.vy);
    if (sp < 1) { ob.vx = ob.vy = 0; if (ob.ph === 'slide') ob.ph = 'down'; return; }
    ob.x += ob.vx * dt; ob.y += ob.vy * dt;
    const k = Math.exp(-2.4 * dt); ob.vx *= k; ob.vy *= k;
    const hw = ob.w / 2, hitSolid = sd(F.A.bounds, ob.x, ob.y)[0] > -hw || F.A.solids.some(o => sd(o, ob.x, ob.y)[0] < hw)
      || F.objs.some(o => o !== ob && (o.solid || o.kind === 'crate') && o.z <= 0 && o.shape === 'box' && Math.abs(o.x - ob.x) < (o.w + ob.w) / 2 && Math.abs(o.y - ob.y) < (o.h + ob.h) / 2);
    if (hitSolid) { ob.x -= ob.vx * dt; ob.y -= ob.vy * dt; ob.vx = ob.vy = 0; ob.ph = 'down'; F.ev('dkThunk', ob.x, ob.y, 0.5, ob.owner, { move: 'move3' }); return; }
    if (sp > 90 && !ob.hit && open(foe) && !foe.gone && sd(ob, foe.x, foe.y)[0] < foe.r + 1) {
      ob.hit = true;
      F.hitF(own, foe, M.move3.cargo, { dir: Math.atan2(ob.vy, ob.vx), obj: true, noFlank: true, move: 'move3' });
      ob.vx *= 0.15; ob.vy *= 0.15;
      F.ev('dkThunk', ob.x, ob.y, 0.7, ob.owner, { move: 'move3' });
    }
  },
  // Ship It's wake: the run ahead of him while the horn blows (and as he goes); gone once the move is
  dkWake(F, ob, dt, own) { if (!sameGo(own, ob) || (own.state !== 'wind' && !(own.state === 'strike' && own.ph === 'ram'))) gone(ob); },
};

// a hit on Docky: ramming, it hurts but doesn't stop him (no flinch); through one of his containers, it clangs off
function guard(F, a, d, mv, opt) {
  if (d.state === 'ko' || (d.inv > 0 && !opt.hold) || d.state === 'down' || d.state === 'getup') return undefined;
  if (!opt.unblockable && !opt.hold && a !== d) {
    const b = throughBox(F, a, d, opt);
    if (b) { F.lastRes = 'soak'; F.ev('dkClang', b.x, b.y, 0.6, d.i, { move: 'move2', to: d.i }); F.hitstop = Math.max(F.hitstop, 3 / 60); return true; }
  }
  if (d.move === 'move3' && d.state === 'strike' && d.ph === 'ram') {
    const dmg = mv.damage * (opt.dmgMul || 1) * F.dmgMul * (a.stats.dmgOut || 1) * (d.stats.dmgIn || 1);
    if (d.iso) { d.iso = 0; F.ev('iso', d.x, d.y, 0.7, a.i, { move: opt.move || a.move, to: d.i }); }
    else d.hp = Math.max(0, d.hp - dmg);
    d.flash = 0.12; F.lastRes = 'armor';
    F.ev('armor', d.x, d.y, clamp(dmg / 14, 0.2, 1), a.i, { move: opt.move || a.move, to: d.i, armor: 'super' });
    F.hitstop = Math.max(F.hitstop, 4 / 60);
    if (d.hp <= 0) { F.release(d); d.move = null; F.go(d, 'ko'); F.ev('ko', d.x, d.y, 1, d.i); }
    return true;
  }
  return undefined;
}
fighter.guard = guard;

// ---------------------------------------------------------------- the bot
const unitA = a => [Math.cos(a), Math.sin(a)];
const ai = {
  want: 150,
  // Docky's dangers to the other bot: the falling containers' shadows, the ram's run, a shoved container, the wall
  // landing on them, the breach
  threats(F, i, me, o) {
    const out = [], ow = F.f[1 - i], M = ow.stats.moves;
    for (const b of F.objs) {
      if (b.owner === i || b.t < o.age || b.t >= b.life) continue;
      if (b.kind === 'dkBox') {
        const mv = M[b.mk];
        if (b.ph === 'mark' || b.ph === 'wait' || b.ph === 'fall') {
          const dx = me.x - b.x, dy = me.y - b.y, need = b.w / 2 + me.r * 0.6 + 6 - Math.max(Math.abs(dx), Math.abs(dy));
          if (need <= 0) continue;
          const T = b.ph === 'fall' ? b.fall - b.ft : (b.ph === 'wait' ? b.wait - (b.t - b.t0) : (ow.state === 'wind' && ow.move === b.mk ? ow.dur - ow.t : 0) + (b.mk === 'move1' ? mv.delay + b.k * mv.every : b.k * 0.04)) + b.fall;
          const side = Math.sign(Math.sin(Math.atan2(dy, dx) - b.a)) || 1, way = b.mk === 'move1' ? b.a + side * Math.PI / 2 : Math.atan2(dy, dx);
          out.push(['b' + b.id, T, 0.05, way, b.mk === 'move1' ? need + 8 : need]);
        } else if (b.ph === 'slide') {   // shoved at them
          const sp = Math.hypot(b.vx, b.vy); if (sp < 90) continue;
          const va = Math.atan2(b.vy, b.vx), rel = Math.atan2(me.y - b.y, me.x - b.x), d = Math.hypot(me.x - b.x, me.y - b.y);
          if (Math.cos(rel - va) < 0.5) continue;
          const lat = Math.abs(Math.sin(rel - va)) * d, need = b.w / 2 + me.r + 4 - lat;
          if (need > 0) out.push(['c' + b.id, Math.max(0, d - b.w / 2 - me.r) / sp, 0.05, va + (Math.sin(rel - va) >= 0 ? 1 : -1) * Math.PI / 2, need]);
        }
      }
    }
    if (o.move === 'move3' && (o.state === 'wind' || (o.state === 'strike' && o.ph === 'ram'))) {   // the ram: off its line, sideways
      const mv = M.move3, left = o.state === 'wind' ? mv.active : Math.max(0, o.left), L = mv.speed * left;
      const [d, u] = segDist(me.x, me.y, o.x, o.y, o.x + Math.cos(o.face) * L, o.y + Math.sin(o.face) * L);
      const need = me.r + ow.r + mv.reach + 12 - d;
      if (need > 0 && (u > 0 || Math.hypot(me.x - o.x, me.y - o.y) < me.r + ow.r + 10)) {
        const side = Math.sign(Math.sin(Math.atan2(me.y - o.y, me.x - o.x) - o.face)) || 1;
        out.push(['s' + Math.round((o.T - o.t) * 60) + o.state, (o.state === 'wind' ? Math.max(0, o.left) : 0) + Math.max(0, u * L - me.r - ow.r) / mv.speed, 0.1, o.face + side * Math.PI / 2, need]);
      }
    }
    if (o.move === 'evade' && o.ph === 'under') {   // the breach: back off the ripples
      const need = M.evade.r + me.r + ow.r + 6 - Math.hypot(me.x - o.x, me.y - o.y);
      if (need > 0) out.push(['u' + Math.round((o.T - o.t) * 60), Math.max(0, o.left), 0.05, Math.atan2(me.y - o.y, me.x - o.x), need]);
    }
    return out;
  },
  // in a move: the drop's line and the ram aimed at where they'll be; the ram steered at them (most of the time)
  stick(F, i, me, o, C) {
    const K = C.K, lead = s => [o.x + o.vx * s, o.y + o.vy * s];
    if (me.move === 'move1' && me.state === 'wind') { const [x, y] = lead(0.5); return unitA(Math.atan2(y - me.y, x - me.x)); }
    if (me.move === 'move3') {
      if (K.dkFor !== me.ms) { K.dkFor = me.ms; K.dkSteer = C.rng() < C.L.steer; }
      if (me.state === 'wind') { const [x, y] = lead(0.25); return unitA(Math.atan2(y - me.y, x - me.x)); }
      return K.dkSteer ? unitA(toward(me, o)) : [0, 0];
    }
    return [0, 0];
  },
  punish(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap, toFoe } = C.g;
    if (w.line && C.ready(2) && d < 320 && w.fits(M.move3.startup + Math.max(0, gap) / M.move3.speed)) { C.fire(2); return C.unit(toFoe); }
    if (C.ready(0) && d < M.move1.far + 30 && w.fits(M.move1.startup + M.move1.active + M.move1.delay + M.move1.every + M.move1.fall)) { C.fire(0); return C.unit(toFoe); }
    return null;
  },
  neutral(F, i, me, o, C, w) {
    const { dist: d, gap, toFoe } = C.g, M = me.stats.moves;
    // one of his crates between him and them, lined up: ram it at them
    const lined = F.objs.some(b => b.kind === 'dkBox' && b.owner === i && b.z <= 0 && b.ph === 'down' && Math.hypot(b.x - me.x, b.y - me.y) < d && Math.abs(angDiff(Math.atan2(b.y - me.y, b.x - me.x), toFoe)) < 0.3 && Math.hypot(o.x - b.x, o.y - b.y) < 170);
    w.add(2, lined ? 0.4 : w.line && d > 90 && d < 300 ? (w.busy ? 0.3 : 0.09) : 0, C.unit(toFoe));
    w.add(0, d > 80 && d < M.move1.far + 40 ? (w.busy ? 0.35 : 0.14) : 0, C.unit(toFoe));
    w.add(1, gap < 34 ? 0.3 : (o.state === 'wind' && d < 220) ? 0.2 : d < 200 ? 0.04 : 0, [0, 0]);
  },
  // under the water he's untouchable for the whole dive (rooted): through it, like Tux's ice
  evadeWhen(T, dur, E) { return [T > 0.03 && T + dur < E.active - 0.05, T + dur < E.active - 0.05]; },
};

export default { id: ID, fighter, kits, objs, ai };
