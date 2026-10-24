// Cpp (Keith, the C++ rat) for Fight, rebuilt 2026-10-24 (three big moves and an evade: js/kits/index.js has the
// plug-in shape, the drawing is js/art/kit-cpp.js). The scruffy trap-layer with no safety checks.
//   move1 Segfault (cpMine): he crouches and flicks a little tin mine onto the floor ahead of him. It settles and arms
//         (its lamp lights, a soot stain spreads round it); armed, it clicks when the foe steps near and blows a moment
//         later, flooring them. Two at most. Tell: the armed mine, its stain and the click. Answer: walk round it (or
//         out of it on the click), or evade over it: untouchable, you set it off harmlessly.
//   move2 Memory Leak (cpLeak, hold to steer): he shudders and scurries off for over a second, steering the held way,
//         leaving a trail of grey-green sludge that slows anyone walking in it and slowly eats their health. Tell: the
//         trail itself. Answer: don't follow him through it; walk round. He's open while he scurries.
//   move3 Gnaw Frenzy (cpGnaw): three lunging chomps in a row, each with its own tell: he rears back while soft bite
//         marks show on the floor where he'll land, then lunges. He only turns a little between chomps, and a chomp that
//         lands staggers into the next; the third floors you. Answer: step aside before the first (or between them), or
//         evade. Three misses leave him panting, open.
//   evade Play Dead (cpDead): he flops onto his back, legs in the air, untouchable, and a stink puff spreads round him
//         that slows the foe; then he scrambles up (open).
// Passive Manual Memory (kept from the old kit): he deals 15% more damage, and takes 15% more (fight.js hitF's dmgOut,
// dmgIn; his sludge too).
// Phases (f.ph): fiddle, flick · shudder, leak, leakend · rear, chomp, pant, chew · dead, scramble. Objects: cpmine
// (ph 'arm' | 'live' | 'click' | 'boom' | 'dud' | 'fizz'; trig, R), cpleak (pts [[x, y, t laid]], r, on: the foe in it now),
// cpbite (a chomp's tell: a, k, ph 'aim' | 'snap'), cpstink (r). Events: cpFlick, cpArm, cpClick, cpBoom (hit), cpDud,
// cpFizz, cpLeak, cpGoo (to: the foe stepped in), cpChomp (k, hit), cpPant, cpDead, cpUp.
import { clearance } from '../fight-arenas.js';
import { angDiff, dist, gone, inside, mine, open, sameGo, segDist, setPh, spawn, toward, turnTo } from './lib.js';

const ID = 'cpp';
const fighter = {
  id: ID, name: 'Cpp', lang: 'C++', role: 'Trap-layer', kit3: true,
  blurb: 'Keith, a scruffy rat with no safety checks: mines on the floor, a trail of leaking sludge behind him, and a frenzy of chomps when you get close.',
  passive: 'Manual Memory: he deals 15% more damage, and takes 15% more.',
  balance: 'Not tuned for balance yet (2026-10-24, the user: "dont even think about balancing for now").',
  hp: 104, weight: 0.84, walk: 1.32, accel: 30, friction: 30, kbDecay: 3.3, radius: 15, slipMul: 0.22, reachBar: 0.6, powerBar: 0.8,
  dmgOut: 1.15, dmgIn: 1.15,
  moves: {
    move1: { name: 'Segfault', short: 'Segfault', do: 'cpMine', icon: 'cpMine', hold: null,
      blurb: 'Flicks a little tin mine onto the floor ahead. Once it arms, it clicks when you step near and blows a moment later, knocking you down. Two at most.',
      tell: 'The mine settles and arms: its lamp lights and a soot stain spreads round it. Step near and it clicks.',
      answer: 'Walk round it, or off it the moment it clicks. Or evade over it: untouchable, you set it off harmlessly.',
      // the fiddle (startup), the mine at ahead (min..max, short of them) along his facing; it arms after arm s; armed,
      // the foe within trig (to their middle, + half their radius) clicks it, and fuse s later it blows R round it; it
      // fizzles after life s; at most max of his at once
      startup: 0.3, active: 0.05, recovery: 0.25, cooldown: 1.0,
      damage: 13, kb: 220, kd: true, min: 28, max: 80, arm: 0.55, trig: 26, fuse: 0.42, R: 44, life: 10, n: 2 },
    move2: { name: 'Memory Leak', short: 'Leak', do: 'cpLeak', icon: 'cpLeak', hold: 'steer',
      blurb: 'Scurries off for over a second, steering the way he holds, leaving a trail of sludge that slows anyone walking in it and slowly eats their health.',
      tell: 'The trail of grey-green sludge itself.',
      answer: 'Don\'t follow him through it: walk round. He can be hit while he scurries.',
      // the shudder (startup), then he scurries speed u/s for active s, steering up to steer rad/s the held way (else
      // straight on, sliding along walls); a blob of sludge (radius r) every gap units, each lasting goo s. Walking in
      // it: slow (x your speed), dps damage a second
      startup: 0.2, active: 1.35, recovery: 0.3, cooldown: 3.2,
      speed: 245, steer: 3.4, gap: 12, r: 15, goo: 3.8, slow: 0.45, dps: 6 },
    move3: { name: 'Gnaw Frenzy', short: 'Gnaw', do: 'cpGnaw', icon: 'cpGnaw', hold: null,
      blurb: 'Three lunging chomps in a row, each with its own tell. A chomp that lands staggers you into the next; the third knocks you down.',
      tell: 'He rears back, jaws open, and soft bite marks show on the floor where he\'ll land. He only turns a little between chomps.',
      answer: 'Step aside before the first, or between them (or evade). Three misses leave him panting, open.',
      // the first rear (startup), then n chomps: each a lunge (lunge s at speed u/s: the bite reach in front, arc
      // degrees), the next rear rear s (turning up to turn rad/s at them, still the last lock s); hit: the chomp's
      // stagger; the last floors. Missed them all: pant s open, else chew s
      startup: 0.36, active: 0.88, recovery: 0.32, pant: 0.65, cooldown: 2.2, contact: true,
      n: 3, lunge: 0.1, rear: 0.29, speed: 420, turn: 2.6, lock: 0.08, reach: 15, arc: 110,
      hit: { damage: 7, kb: 70, stun: 0.46 }, last: { damage: 13, kb: 230, kd: true } },
    evade: { name: 'Play Dead', short: 'Play Dead', do: 'cpDead', icon: 'cpDead', hold: null,
      blurb: 'Flops onto his back, legs in the air, untouchable, and a stink puff spreads round him that slows you down. Then he scrambles up.',
      tell: 'A rat on his back in a green-grey stink cloud.', answer: 'Keep out of the stink and meet him as he scrambles up: he\'s open for a moment.',
      // dead active s (untouchable, rooted), then the scramble (recovery s, open); the stink: r round him, life s, x
      // the foe's walking speed in it
      startup: 0, active: 0.55, recovery: 0.32, cooldown: 2.2, r: 52, life: 1.8, slow: 0.5 },
  },
  phPose: { fiddle: 'lay', flick: 'lay', shudder: 'wind', leak: 'scurry', leakend: 'pant', rear: 'rear', chomp: 'chomp', pant: 'pant', chew: 'gnaw', dead: 'dead', scramble: 'wind' },
  phFade: ['flick', 'chew', 'scramble', 'leakend'],
  show: ['stand', 'lay', 'stand', 'scurry', 'stand', 'rear', 'gnaw', 'dead'], cheer: 'gnaw',
  fields: { ghost: 0 },   // (ghost: lying there, bodies pass over him: fight.js collide)
  tick(F, f) { if (f.move !== 'evade') f.ghost = 0; },
};
const P = (a, b, inp) => [a, b, inp];
fighter.clips = {
  move1: { x: [-90, 60], len: 2.6, cam: { x: -10, w: 300 }, a: [P(0.3, 0.38, { light: 1 })], b: [P(1.0, 1.6, { x: -1 })] },   // (Tux walks into the armed mine)
  move2: { x: [-120, 30], len: 2.8, cam: { x: 30, w: 380 }, a: [P(0.3, 0.38, { heavy: 1 }), P(0.5, 0.72, { x: 1, y: -1 }), P(0.72, 0.95, { x: 1, y: 1 })], b: [P(1.5, 2.1, { x: 0, y: -1 })] },   // (past Tux, then Tux walks into it)
  move3: { x: [-60, 30], len: 2.6, cam: { x: -10, w: 260 }, a: [P(0.3, 0.38, { special: 1 })] },
  evade: { x: [-40, 110], len: 2.4, cam: { x: 10, w: 300 }, a: [P(0.82, 0.88, { guard: 1 })], b: [P(0.3, 0.38, { light: 1 })] },   // (played dead under Tux's toboggan)
};

const LIVE = new Set(['arm', 'live', 'click']);
const mines = (F, f) => F.objs.filter(b => b.kind === 'cpmine' && b.owner === f.i && LIVE.has(b.ph) && b.t < b.life);
// the foe can step on things right now (not down, getting up, up in the air or out)
const grounded = o => o.z < 6 && !o.gone && !o.air && !['ko', 'down', 'getup', 'grabbed'].includes(o.state);
const phased = o => o.inv > 0 || o.under || o.gone;
// health eaten straight off (the sludge): no flinch, Manual Memory counts; a KO as hitF's
function drain(F, own, o, dmg) {
  if (o.state === 'ko' || o.inv > 0) return;
  o.hp = Math.max(0, o.hp - dmg * F.dmgMul * (own.stats.dmgOut || 1) * (o.stats.dmgIn || 1));
  if (o.hp <= 0) { F.release(o); o.move = null; o.charge = 0; F.go(o, 'ko'); F.ev('ko', o.x, o.y, 1, o.i); }
}
// walking slowed: this step's walk partly taken back (the sim moved them already)
function slow(F, o, k, dt) {
  if (o.z > 0 || !(o.state === 'walk' || o.state === 'idle')) return;
  o.x -= o.vx * dt * (1 - k); o.y -= o.vy * dt * (1 - k); F.keepIn(o);
}
// where a chomp's bite lands: the lunge's end plus the reach
const biteAt = (f, mv) => { const d = f.r + mv.speed * mv.lunge + mv.reach * 0.5; return [f.x + Math.cos(f.face) * d, f.y + Math.sin(f.face) * d]; };
function biteTell(F, f, mv) {
  for (const b of F.objs) if (b.kind === 'cpbite' && b.owner === f.i && b.ph === 'aim') gone(b);
  const [x, y] = biteAt(f, mv);
  spawn(F, f, { kind: 'cpbite', x, y, a: f.face, k: f.seg, ph: 'aim', mv: null, life: 9 });
}
function biteMove(F, f, mv) { const b = F.objs.find(o => o.kind === 'cpbite' && o.owner === f.i && o.ph === 'aim'); if (b) { [b.x, b.y] = biteAt(f, mv); b.a = f.face; } return b; }
function chomp(F, f, o, mv) {   // one bite, in reach and in front: true if it connected
  if (!open(o) || o.under || dist(f, o) - f.r - o.r > mv.reach || Math.abs(angDiff(toward(f, o), f.face)) > mv.arc * Math.PI / 360 + 0.2) return false;
  const last = f.seg >= mv.n - 1, sub = last ? mv.last : mv.hit;
  return F.hitF(f, o, sub, { dir: f.face, move: 'move3' });
}

const kits = {
  cpMine: {
    can(F, f, mv) { return mines(F, f).length < mv.n; },
    press(F, f) { setPh(f, 'fiddle'); },
    start(F, f, o, mv) {
      setPh(f, 'flick');
      const d = Math.max(mv.min, Math.min(mv.max, dist(f, o) - o.r - 30)), [x, y] = inside(F, f.x + Math.cos(f.face) * (f.r + d), f.y + Math.sin(f.face) * (f.r + d), 12);
      spawn(F, f, { kind: 'cpmine', x, y, r: 7, trig: mv.trig, R: mv.R, ph: 'arm', ct: 0, fx: Math.round(f.x), fy: Math.round(f.y), mv: null, life: mv.life });
      F.ev('cpFlick', x, y, 0.4, f.i, { move: 'move1', x0: f.x, y0: f.y });
    },
    phases: mv => [['fiddle', 'wind', mv.startup, 'lay', 'crouched, fiddling with a mine'], ['flick', 'strike', mv.active, 'lay', `flicked ${mv.min}-${mv.max} ahead`], ['flick', 'recover', mv.recovery, 'lay', ''],
      ['(the mine)', '', mv.arm, '', `arms; then trig ${mv.trig} clicks it, ${mv.fuse} s later R ${mv.R}; at most ${mv.n}`]],
  },
  cpLeak: {
    moves: true,
    press(F, f) { setPh(f, 'shudder'); },
    wind(F, f) { f.vx = f.vy = 0; },
    start(F, f, o, mv) {
      setPh(f, 'leak'); f.bx = f.x; f.by = f.y;
      spawn(F, f, { kind: 'cpleak', pts: [[f.x, f.y, 0]], r: mv.r, on: 0, life: mv.goo + mv.active + 0.2 });   // (tied to this go: sameGo finds it)
      F.ev('cpLeak', f.x, f.y, 0.5, f.i, { move: 'move2' });
    },
    step(F, f, o, mv, dt, c) {
      if (c.mag > 0.3) f.face = turnTo(f.face, c.dirA, mv.steer * dt);
      f.vx = Math.cos(f.face) * mv.speed; f.vy = Math.sin(f.face) * mv.speed;
      const lk = F.objs.find(b => b.kind === 'cpleak' && b.owner === f.i && sameGo(f, b));
      if (lk && Math.hypot(f.x - f.bx, f.y - f.by) >= mv.gap) {
        f.bx = f.x; f.by = f.y; lk.pts.push([Math.round(f.x * 10) / 10, Math.round(f.y * 10) / 10, Math.round(lk.t * 100) / 100]);
        lk.life = lk.t + mv.goo + 0.2;
      }
    },
    end(F, f, o, mv) { f.vx *= 0.3; f.vy *= 0.3; setPh(f, 'leakend'); F.go(f, 'recover', mv.recovery); return true; },
    wall(F, f, c) {   // along the wall, not into it
      const vn = Math.cos(f.face) * c.nx + Math.sin(f.face) * c.ny;
      if (vn < 0) { const tx = Math.cos(f.face) - vn * c.nx, ty = Math.sin(f.face) - vn * c.ny; f.face = Math.hypot(tx, ty) > 0.05 ? Math.atan2(ty, tx) : Math.atan2(c.ny, c.nx) + Math.PI / 2; }
      return true;
    },
    phases: mv => [['shudder', 'wind', mv.startup, 'wind', 'shudders, a drip'], ['leak', 'strike', mv.active, 'scurry', `${mv.speed} u/s, steered ${mv.steer} rad/s; sludge r ${mv.r} every ${mv.gap}, lasting ${mv.goo} s (x${mv.slow} walking, ${mv.dps}/s)`], ['leakend', 'recover', mv.recovery, 'pant', '']],
  },
  cpGnaw: {
    moves: true,
    press(F, f, o, mv) { setPh(f, 'rear'); f.seg = 0; f.tick = 0; biteTell(F, f, mv); },
    wind(F, f, o, mv, dt) {   // rearing: turned at them a little, the bite marks with him
      f.vx = f.vy = 0;
      if (f.t < f.dur - mv.lock && open(o)) f.face = turnTo(f.face, toward(f, o), mv.turn * dt);
      biteMove(F, f, mv);
    },
    start(F, f, o, mv) { f.seg = 0; f.tick = 0; f.hit = false; lunge(F, f, mv); },
    step(F, f, o, mv, dt) {
      f.tick += dt;
      if (f.ph === 'chomp') {
        f.vx = Math.cos(f.face) * mv.speed; f.vy = Math.sin(f.face) * mv.speed;
        if (!f.bit && chomp(F, f, o, mv)) { f.bit = 1; f.hit = true; f.vx *= 0.2; f.vy *= 0.2; F.ev('cpChomp', f.x + Math.cos(f.face) * f.r, f.y + Math.sin(f.face) * f.r, 0.7, f.i, { move: 'move3', k: f.seg, hit: true }); }
        if (f.tick >= mv.lunge - 1e-9) {
          const b = F.objs.find(q => q.kind === 'cpbite' && q.owner === f.i && q.ph === 'aim'); if (b) { b.ph = 'snap'; b.life = b.t + 0.3; b.hit = f.bit; }
          if (!f.bit) F.ev('cpChomp', f.x + Math.cos(f.face) * f.r, f.y + Math.sin(f.face) * f.r, 0.4, f.i, { move: 'move3', k: f.seg, hit: false });
          if (f.seg >= mv.n - 1 || o.state === 'down' || o.state === 'ko') { finish(F, f, mv); return; }
          f.seg++; f.tick = 0; f.vx = f.vy = 0; setPh(f, 'rear'); biteTell(F, f, mv);
        }
      } else {   // the next rear: a little turn at them, then the lunge
        f.vx = f.vy = 0;
        if (f.tick < mv.rear - mv.lock && open(o)) f.face = turnTo(f.face, toward(f, o), mv.turn * dt);
        biteMove(F, f, mv);
        if (f.tick >= mv.rear - 1e-9) lunge(F, f, mv);
      }
    },
    end(F, f, o, mv) { finish(F, f, mv); return true; },
    wall(F, f) { f.vx = f.vy = 0; return true; },
    phases: mv => [['rear', 'wind', mv.startup, 'rear', 'rears back, jaws open; the bite marks show'], ['chomp', 'strike', mv.lunge, 'chomp', `lunges ${mv.speed * mv.lunge}, bites (reach ${mv.reach})`],
      ['rear', 'strike', mv.rear, 'rear', `the next one (${mv.n} in all), turning ${mv.turn} rad/s`], ['chew', 'recover', mv.recovery, 'gnaw', 'landed'], ['pant', 'recover', mv.pant, 'pant', 'missed them all: open']],
  },
  cpDead: {
    moves: true,
    start(F, f, o, mv) {
      setPh(f, 'dead'); f.inv = Math.max(f.inv, 2 / 60); f.vx = f.vy = 0; f.ghost = 1;
      spawn(F, f, { kind: 'cpstink', r: mv.r, mv: null, life: mv.life });
      F.ev('cpDead', f.x, f.y, 0.5, f.i, { move: 'evade' });
    },
    step(F, f) { f.inv = Math.max(f.inv, 2 / 60); f.vx = f.vy = 0; },
    end(F, f, o, mv) { f.inv = 0; f.ghost = 0; setPh(f, 'scramble'); F.go(f, 'recover', mv.recovery); F.ev('cpUp', f.x, f.y, 0.4, f.i, { move: 'evade' }); return true; },
    phases: mv => [['dead', 'strike', mv.active, 'dead', `on his back: untouchable, rooted; the stink r ${mv.r} (x${mv.slow} walking) for ${mv.life} s`], ['scramble', 'recover', mv.recovery, 'wind', 'scrambles up: open']],
  },
};
function lunge(F, f, mv) { setPh(f, 'chomp'); f.tick = 0; f.bit = 0; F.ev('cpLunge', f.x, f.y, 0.4, f.i, { move: 'move3', k: f.seg }); }
function finish(F, f, mv) {
  f.vx *= 0.2; f.vy *= 0.2;
  for (const b of F.objs) if (b.kind === 'cpbite' && b.owner === f.i && b.ph === 'aim') gone(b);
  if (f.hit) { setPh(f, 'chew'); F.go(f, 'recover', mv.recovery); }
  else { setPh(f, 'pant'); F.go(f, 'recover', mv.pant); F.ev('cpPant', f.x, f.y, 0.4, f.i, { move: 'move3' }); }
}

const objs = {
  // the mine: arming, then live; the foe near: a click (untouchable: a harmless pop), then the blast; old: it fizzles
  cpmine(F, ob, dt, own, foe, M) {
    const mv = M.move1;
    if (!LIVE.has(ob.ph)) return;
    if (ob.ph === 'arm') { if (ob.t >= mv.arm) { ob.ph = 'live'; F.ev('cpArm', ob.x, ob.y, 0.3, ob.owner, { move: 'move1' }); } return; }
    const d = Math.hypot(foe.x - ob.x, foe.y - ob.y);
    if (ob.ph === 'live') {
      if (ob.t >= ob.life - 0.3) { ob.ph = 'fizz'; ob.life = ob.t + 0.3; F.ev('cpFizz', ob.x, ob.y, 0.2, ob.owner, { move: 'move1' }); return; }
      if (!grounded(foe) || d - foe.r * 0.5 > ob.trig) return;
      if (phased(foe)) { ob.ph = 'dud'; ob.life = ob.t + 0.35; F.ev('cpDud', ob.x, ob.y, 0.4, ob.owner, { move: 'move1', to: foe.i }); return; }
      ob.ph = 'click'; ob.ct = ob.t; F.ev('cpClick', ob.x, ob.y, 0.4, ob.owner, { move: 'move1' });
      return;
    }
    if (ob.t - ob.ct < mv.fuse - 1e-9) return;
    ob.ph = 'boom'; ob.life = ob.t + 0.45;
    let hit = false;
    if (open(foe) && !foe.under && d - foe.r * 0.5 <= ob.R) hit = F.hitF(own, foe, mv, { dir: d > 2 ? Math.atan2(foe.y - ob.y, foe.x - ob.x) : own.face, obj: true, unblockable: true, noFlank: true, move: 'move1' }) && F.lastRes === 'hit';
    ob.hit = hit;
    F.ev('cpBoom', ob.x, ob.y, 0.9, ob.owner, { move: 'move1', hit });
  },
  // the sludge trail: walking in it slows you and eats your health (each blob gone goo s after it was laid)
  cpleak(F, ob, dt, own, foe, M) {
    const mv = M.move2;
    let on = 0;
    if (grounded(foe) && !phased(foe)) for (const [x, y, at] of ob.pts) if (ob.t - at < mv.goo && Math.hypot(foe.x - x, foe.y - y) < ob.r + foe.r * 0.4) { on = 1; break; }
    if (on && !ob.on) F.ev('cpGoo', foe.x, foe.y, 0.4, ob.owner, { move: 'move2', to: foe.i });
    ob.on = on;
    if (on) { slow(F, foe, mv.slow, dt); drain(F, own, foe, mv.dps * dt); }
  },
  cpbite() {},
  // the stink: walking in it slows you
  cpstink(F, ob, dt, own, foe, M) {
    if (grounded(foe) && Math.hypot(foe.x - ob.x, foe.y - ob.y) < (ob.r + foe.r * 0.4) * Math.min(1, 0.4 + ob.t / 0.3)) { slow(F, foe, M.evade.slow, dt); ob.on = 1; } else ob.on = 0;
  },
};

// ---------------------------------------------------------------- the bot
// the other bot's view of a sludge trail: the nearest live blob, if it's on it (or about to walk into it)
function nearGoo(b, me, mv) {
  let best = 1e9, bx = 0, by = 0;
  for (const [x, y, at] of b.pts) { if (b.t - at >= mv.goo - 0.2) continue; const d = Math.hypot(me.x - x, me.y - y); if (d < best) { best = d; bx = x; by = y; } }
  return [best, bx, by];
}
const ai = {
  want: 130,
  // Cpp's tells, for the other bot: armed mines (and clicking ones), the sludge under them, the chomps' line
  threats(F, i, me, o) {
    const out = [], ow = F.f[1 - i], M = ow.stats.moves;
    for (const b of F.objs) {
      if (b.owner === i || b.t < o.age || b.t >= b.life) continue;
      const d = Math.hypot(me.x - b.x, me.y - b.y), away = Math.atan2(me.y - b.y, me.x - b.x);
      if (b.kind === 'cpmine' && LIVE.has(b.ph)) {   // (a click: out of the blast; armed or arming: off the trigger)
        const click = b.ph === 'click', need = (click ? b.R : b.trig) + me.r * 0.5 + 8 - d;
        if (need > 0) out.push(['m' + b.id + (click ? 'c' : ''), click ? Math.max(0, M.move1.fuse - (b.t - b.ct)) : b.ph === 'arm' ? Math.max(0, M.move1.arm - b.t) + 0.1 : 0.12, 0.06, away, need]);
      } else if (b.kind === 'cpleak') {   // (on the sludge: off it, the nearest way; never an evade: it stays)
        const [dd, bx, by] = nearGoo(b, me, M.move2), need = b.r + me.r * 0.4 + 6 - dd;
        if (need > 0) out.push(['g' + b.id, 0, 9, Math.atan2(me.y - by, me.x - bx), need]);
      } else if (b.kind === 'cpstink') {
        const need = b.r + me.r * 0.4 + 4 - d;
        if (need > 0) out.push(['s' + b.id, 0, 9, away, need]);
      }
    }
    // the frenzy coming: off its line, sideways (each chomp turns only a little)
    if (o.move === 'move3' && (o.state === 'wind' || o.state === 'strike')) {
      const mv = M.move3, L = ow.r + (mv.speed * mv.lunge + mv.reach) * (mv.n - (o.state === 'strike' ? 1 : 0)) + 10;
      const x1 = o.x + Math.cos(o.face) * L, y1 = o.y + Math.sin(o.face) * L, [lat, u] = segDist(me.x, me.y, o.x, o.y, x1, y1), need = me.r + mv.reach + 12 - lat;
      if (need > 0 && u < 0.999) {
        const side = Math.sign(Math.sin(Math.atan2(me.y - o.y, me.x - o.x) - o.face)) || 1;
        out.push(['f' + o.T, (o.state === 'wind' ? Math.max(0, o.left) : 0) + mv.lunge * 0.6, mv.lunge + 0.05, o.face + side * Math.PI / 2, need]);
      }
    }
    return out;
  },
  // in his own moves: the leak curling round them (the side fixed for the go), the gnaw aims itself
  stick(F, i, me, o, C) {
    if (me.move === 'move2') {
      const side = me.ms % 2 ? 1 : -1, toO = Math.atan2(o.y - me.y, o.x - me.x), d = Math.hypot(o.x - me.x, o.y - me.y);
      const a = toO + side * (d > 110 ? 0.75 : 1.45);   // (in toward them, then round)
      const cl = clearance(C.g.A, me.x, me.y, me.r);
      if (cl.d < 40) return [Math.cos(a) * 0.4 + cl.nx * 0.9, Math.sin(a) * 0.4 + cl.ny * 0.9];
      return [Math.cos(a), Math.sin(a)];
    }
    return [0, 0];
  },
  punish(F, i, me, o, C, w) {
    const M = me.stats.moves, { gap, toFoe } = C.g;
    if (C.ready(2) && w.line && gap < 70 && w.fits(M.move3.startup + Math.max(0, gap - M.move3.reach) / M.move3.speed + 0.03)) { C.fire(2); return C.unit(toFoe); }
    if (C.ready(0) && gap > 40 && gap < 140 && w.b > M.move1.startup + M.move1.arm + 0.3) { C.fire(0); return C.unit(toFoe); }   // (a long opening: a mine where they'll get up)
    return null;
  },
  neutral(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap, toFoe } = C.g, n = mines(F, me).length;
    w.add(0, d > 70 && d < 280 && n < M.move1.n ? (w.busy ? 0.3 : n ? 0.08 : 0.16) : 0, C.unit(toFoe));
    w.add(1, d > 60 && d < 240 ? (w.busy ? 0.2 : 0.09) : 0, C.unit(toFoe));
    w.add(2, w.line && gap < 75 ? (w.spent || w.busy ? 0.4 : 0.22) : 0, C.unit(toFoe));
  },
  // Play Dead: untouchable through it (rooted, so only while it lasts)
  evadeWhen(T, dur, E) { return [T > 0.02 && T + dur < E.active - 0.04, T + dur < E.active - 0.04]; },
};

export default { id: ID, fighter, kits, objs, ai };
