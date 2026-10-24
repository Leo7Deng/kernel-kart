// Bugdroid (Android) for Fight, rebuilt 2026-10-24 (three big moves and an evade: js/kits/index.js has the plug-in
// shape, the drawing is js/art/kit-droid.js). The gadget robot: sturdy, a little slow, all apps and batteries.
//   move1 Battery Beam (drBeam, hold to charge and aim): his antennae glow while a faint line of light motes shows
//         where he's pointing; held, it charges (stronger) and the held direction turns it. Let go and the line settles
//         for a moment, then the beam fires down it: a stagger, a knockdown when well charged. Tell: the glowing
//         antennae and the line; it settles just before it fires. Answer: step off the line. Two battery cells.
//   move2 Sideload (drCube): he plugs a little app cube into the floor in front of him; it boots, then turns and pops
//         slow pellets at you for a few seconds. Tell: the cube booting and turning to you. Answer: sidestep the
//         pellets, keep a pillar between you, or walk into the cube and kick it over.
//   move3 Factory Reset (drReset): he crouches, antennae sparking, static pulling in round him; then an EMP shockwave
//         knocks down anyone near. His battery comes back full. Tell: the crouch and the sparks. Answer: back off, or
//         evade the wave. He reboots after: open.
//   evade Airplane Mode (drAir): he goes see-through, arms out like wings, untouchable, and can still walk slowly.
// Passive Battery (kept from the old kit): Battery Beam runs on two cells (pips by his feet), each back battery.recharge s
// after it's spent; Factory Reset fills them.
// Phases (f.ph): charge, lock, beam, cool · plug, plugged · crouch, emp, reboot · airplane, online. Objects: drbeam (the
// line: a, len, w, ch (charge 0..1), ph 'aim' | 'lock' | 'fire' | 'fade'), drcube (a: its aim, ph 'boot' | 'live' | 'off'
// | 'broke', nx: its next shot), drpel (a pellet: vx, vy, run). Events: drBeam (x2, y2, hit), drCube, drPew (a shot),
// drPop (a pellet bursting: hit), drCubeOff, drCubeBreak (to: who kicked it), drEmp (hit), drReboot, drAir, drOn.
import { angDiff, clamp, dist, gone, inside, landing, mine, open, segDist, setPh, spawn, toward, turnTo } from './lib.js';

const ID = 'droid';
const fighter = {
  id: ID, name: 'Bugdroid', lang: 'Android', role: 'Gadgeteer', kit3: true,
  blurb: 'A sturdy green robot full of gadgets: a battery beam from across the arena, a sideloaded turret that pelts you, and a factory reset that floors everyone near.',
  passive: 'Battery: his beam runs on two cells, each back 3.2 s after it\'s used; Factory Reset fills them.',
  balance: 'Not tuned for balance yet (2026-10-24, the user: "dont even think about balancing for now").',
  hp: 114, weight: 1.08, walk: 0.98, accel: 26, friction: 28, kbDecay: 3, radius: 17, slipMul: 0.2, reachBar: 1, powerBar: 0.72,
  battery: { max: 2, recharge: 3.2 },
  moves: {
    move1: { name: 'Battery Beam', short: 'Beam', do: 'drBeam', icon: 'drBeam', hold: 'aim',
      blurb: 'Charges up, antennae glowing, while a faint line of light shows where he\'s pointing; holding the key charges it and turns it. Let go and a beam fires down the line.',
      tell: 'His antennae glow and a faint line of light motes runs along the floor. It settles for a moment just before it fires.',
      answer: 'Step off the line (it turns slowly). A well charged one knocks you down. He has two battery cells.',
      // the charge (startup at least, up to holdMax more while held: ch 0..1), turning aimTurn rad/s the held way; let
      // go: the line settles lock s, then the beam (fire s) out to reach from his edge (stopped by walls and pillars),
      // w half-wide: damage x up to full at full charge, a stun-s stagger, knocks down from kdAt charge
      startup: 0.5, active: 0.46, recovery: 0.4, cooldown: 0.7, holdMax: 0.7,
      damage: 11, kb: 180, stun: 0.45, full: 1.6, kdAt: 0.7, reach: 330, w: 9, aimTurn: 1.3, lock: 0.26, fire: 0.2 },
    move2: { name: 'Sideload', short: 'Sideload', do: 'drCube', icon: 'drCube', hold: null,
      blurb: 'Plugs a little app cube into the floor in front of him. It boots, then turns and pops slow pellets at you for a few seconds.',
      tell: 'The cube booting (its light filling up), then turning to face you before each pellet.',
      answer: 'Sidestep the pellets, keep a pillar between you, or walk into the cube and kick it over.',
      // the plug (startup), the cube ahead units in front; it boots boot s, then for up s turns to you (turn rad/s)
      // and fires every every s a pellet (radius pr, speed u/s, range): each a small staggering hit
      startup: 0.36, active: 0.06, recovery: 0.3, cooldown: 3.6,
      ahead: 26, r: 9, boot: 0.5, up: 3.2, every: 0.8, turn: 5, pr: 5, speed: 195, range: 380,
      hit: { damage: 5, kb: 110, stun: 0.32 } },
    move3: { name: 'Factory Reset', short: 'Reset', do: 'drReset', icon: 'drReset', hold: null,
      blurb: 'Crouches, antennae sparking, then an EMP shockwave knocks down anyone near. His battery comes back full; then he reboots.',
      tell: 'He crouches, his antennae spark and static pulls in round him.',
      answer: 'Back off out of the static, or evade the wave. He reboots after: hit him then.',
      // the crouch (startup), the wave R round him (to their middle, + half their radius); then reboot (recovery: open)
      startup: 0.62, active: 0.08, recovery: 0.6, cooldown: 4.2,
      damage: 16, kb: 250, kd: true, R: 86 },
    evade: { name: 'Airplane Mode', short: 'Airplane', do: 'drAir', icon: 'drAir', hold: null,
      blurb: 'Goes see-through, arms out like wings: untouchable, and he can still walk, slowly.',
      tell: 'A see-through robot gliding about.', answer: 'Wait for him to come back online, then hit him: a short moment open.',
      // see-through active s (untouchable), walking walk x his speed the held way; then back online (recovery s)
      startup: 0, active: 0.5, recovery: 0.16, cooldown: 2, walk: 0.6 },
  },
  phPose: { charge: 'charge', lock: 'charge', beam: 'beam', cool: 'beam', plug: 'plug', plugged: 'plug', crouch: 'crouch', emp: 'emp', reboot: 'reboot', airplane: 'airplane', online: 'stand' },
  phFade: ['cool', 'plugged'],
  show: ['stand', 'charge', 'beam', 'stand', 'plug', 'stand', 'crouch', 'emp'], cheer: 'emp',
  // Battery: a beam waits for a cell (its key's cooldown shows the wait)
  tick(F, f) { const B = f.stats.battery; if (f.bat < 1) f.cd[0] = Math.max(f.cd[0], (1 - f.bat) * B.recharge); if (f.move !== 'evade') f.ghost = 0; },
  fields: { ghost: 0 },   // (ghost: see-through, bodies pass through him: fight.js collide)
};
const P = (a, b, inp) => [a, b, inp];
fighter.clips = {
  move1: { x: [-110, 60], len: 2.6, cam: { x: -20, w: 320 }, a: [P(0.3, 1.0, { light: 1 })] },   // (charged a while)
  move2: { x: [-100, 80], len: 3.2, cam: { x: -10, w: 320 }, a: [P(0.3, 0.38, { heavy: 1 })] },
  move3: { x: [-40, 30], len: 2.6, cam: { x: 0, w: 260 }, a: [P(0.3, 0.38, { special: 1 })] },
  evade: { x: [-40, 110], len: 2.4, cam: { x: 10, w: 300 }, a: [P(0.82, 0.88, { guard: 1, x: 0, y: -1 }), P(0.88, 1.4, { x: 0, y: -1 })], b: [P(0.3, 0.38, { light: 1 })] },   // (out of Tux's toboggan)
};

// how far the beam gets from his edge before a wall or a pillar stops it
function reachOf(F, f, a, mv) {
  const c = Math.cos(a), s = Math.sin(a);
  for (let d = 6; d <= mv.reach; d += 6) if (F.contactsAll(f.x + c * (f.r + d), f.y + s * (f.r + d), 2).length) return d;
  return mv.reach;
}
function line(F, f, mv) {
  const ln = mine(F, f, 'drbeam');
  if (ln && (ln.ph === 'aim' || ln.ph === 'lock')) { ln.x = f.x; ln.y = f.y; ln.a = f.face; ln.len = f.r + reachOf(F, f, f.face, mv); }
  return ln;
}
const cube = (F, f) => F.objs.find(b => b.kind === 'drcube' && b.owner === f.i && (b.ph === 'boot' || b.ph === 'live') && b.t < b.life);
const grounded = o => o.z < 6 && !o.gone && !o.air && !['ko', 'down', 'getup', 'grabbed'].includes(o.state);

const kits = {
  drBeam: {
    moves: true,
    can(F, f) { return f.bat >= 1; },
    press(F, f, o, mv) {
      setPh(f, 'charge'); f.bat -= 1; f.tick = 0;
      spawn(F, f, { kind: 'drbeam', a: f.face, len: f.r + reachOf(F, f, f.face, mv), w: mv.w, ch: 0, ph: 'aim' });
    },
    wind(F, f, o, mv, dt, c) {   // charging: turning the held way, the line with him
      f.vx = f.vy = 0;
      if (c.mag > 0.3 && Math.abs(angDiff(c.dirA, toward(f, o))) < Math.PI * 0.8) f.face = turnTo(f.face, c.dirA, mv.aimTurn * dt);
      f.tick = clamp((f.t - mv.startup) / mv.holdMax, 0, 1);
      const ln = line(F, f, mv); if (ln) ln.ch = Math.round(f.tick * 100) / 100;
    },
    hold(F, f, o, mv) { return !f.rel && f.t < mv.startup + mv.holdMax; },
    start(F, f, o, mv) { setPh(f, 'lock'); f.vx = f.vy = 0; const ln = line(F, f, mv); if (ln) { ln.ph = 'lock'; ln.lt = ln.t; } },
    step(F, f, o, mv) {
      f.vx = f.vy = 0;
      const ln = mine(F, f, 'drbeam');
      if (f.ph === 'lock') {
        if (f.t < mv.lock - 1e-9) return;
        setPh(f, 'beam');
        if (ln) { ln.ph = 'fire'; ln.ft = ln.t; ln.len = f.r + reachOf(F, f, f.face, mv); }
        F.ev('drBeam', f.x, f.y, 0.6 + 0.3 * f.tick, f.i, { move: 'move1', x2: f.x + Math.cos(f.face) * (ln ? ln.len : 100), y2: f.y + Math.sin(f.face) * (ln ? ln.len : 100), ch: f.tick });
      }
      if (f.hit || !ln) return;
      const x1 = f.x + Math.cos(f.face) * ln.len, y1 = f.y + Math.sin(f.face) * ln.len, [d] = segDist(o.x, o.y, f.x, f.y, x1, y1);
      if (d <= ln.w + o.r && open(o) && !o.under) {
        const ch = f.tick, m = 1 + (mv.full - 1) * ch;
        if (F.hitF(f, o, mv, { dir: f.face, obj: true, dmgMul: m, kbMul: 0.8 + 0.4 * ch, kd: ch >= mv.kdAt, noFlank: true, move: 'move1' })) { f.hit = true; ln.hit = 1; }
      }
    },
    end(F, f, o, mv) {
      const ln = mine(F, f, 'drbeam'); if (ln) { ln.ph = 'fade'; ln.life = ln.t + 0.3; }
      setPh(f, 'cool'); F.go(f, 'recover', mv.recovery); return true;
    },
    phases: mv => [['charge', 'wind', `${mv.startup} (+ up to ${mv.holdMax} held)`, 'charge', `antennae glowing; the line turns ${mv.aimTurn} rad/s the held way`], ['lock', 'strike', mv.lock, 'charge', 'the line settles'],
      ['beam', 'strike', mv.fire, 'beam', `out to ${mv.reach}, ${mv.w * 2} wide: x1-${mv.full} damage by charge, down from ${mv.kdAt}`], ['cool', 'recover', mv.recovery, 'beam', '']],
  },
  drCube: {
    can(F, f) { return !cube(F, f); },
    press(F, f) { setPh(f, 'plug'); },
    start(F, f, o, mv) {
      setPh(f, 'plugged');
      const [x, y] = inside(F, f.x + Math.cos(f.face) * (f.r + mv.ahead), f.y + Math.sin(f.face) * (f.r + mv.ahead), mv.r + 4);
      spawn(F, f, { kind: 'drcube', x, y, r: mv.r, a: f.face, ph: 'boot', nx: mv.boot, shots: 0, mv: null, life: mv.boot + mv.up + 0.4 });
      F.ev('drCube', x, y, 0.5, f.i, { move: 'move2' });
    },
    phases: mv => [['plug', 'wind', mv.startup, 'plug', 'crouched, plugging the cube in'], ['plugged', 'strike', mv.active, 'plug', `the cube ${mv.ahead} ahead`], ['plugged', 'recover', mv.recovery, 'plug', ''],
      ['(the cube)', '', mv.boot + mv.up, '', `boots ${mv.boot} s, then a pellet every ${mv.every} s at ${mv.speed} u/s; walk into it to kick it over`]],
  },
  drReset: {
    moves: true,
    press(F, f) { setPh(f, 'crouch'); },
    wind(F, f) { f.vx = f.vy = 0; },
    start(F, f, o, mv) {
      setPh(f, 'emp'); f.vx = f.vy = 0;
      const d = dist(f, o);
      let hit = false;
      if (open(o) && !o.under && d - o.r * 0.5 <= mv.R) hit = F.hitF(f, o, mv, { dir: d > 2 ? toward(f, o) : f.face, obj: true, unblockable: true, noFlank: true, move: 'move3' }) && F.lastRes === 'hit';
      f.hit = hit; f.bat = f.stats.battery.max; f.cd[0] = Math.min(f.cd[0], f.stats.moves.move1.cooldown);
      F.ev('drEmp', f.x, f.y, 0.9, f.i, { move: 'move3', hit, R: mv.R });
    },
    step(F, f) { f.vx = f.vy = 0; },
    end(F, f, o, mv) { setPh(f, 'reboot'); F.go(f, 'recover', mv.recovery); F.ev('drReboot', f.x, f.y, 0.3, f.i, { move: 'move3' }); return true; },
    phases: mv => [['crouch', 'wind', mv.startup, 'crouch', 'antennae sparking, static pulling in'], ['emp', 'strike', mv.active, 'emp', `the wave R ${mv.R}; his battery full`], ['reboot', 'recover', mv.recovery, 'reboot', 'rebooting: open']],
  },
  drAir: {
    moves: true,
    start(F, f, o, mv) { setPh(f, 'airplane'); f.inv = Math.max(f.inv, 2 / 60); f.ghost = 1; F.ev('drAir', f.x, f.y, 0.4, f.i, { move: 'evade' }); },
    step(F, f, o, mv, dt) {
      f.inv = Math.max(f.inv, 2 / 60);
      const c = F.ctl(f), sp = 150 * f.stats.walk * mv.walk * (c.mag > 0.3 ? c.mag : 0), k = Math.min(1, 12 * dt);
      f.vx += (Math.cos(c.dirA) * sp - f.vx) * k; f.vy += (Math.sin(c.dirA) * sp - f.vy) * k;
    },
    end(F, f, o, mv) { f.inv = 0; f.ghost = 0; f.vx *= 0.4; f.vy *= 0.4; setPh(f, 'online'); F.go(f, 'recover', mv.recovery); F.ev('drOn', f.x, f.y, 0.3, f.i, { move: 'evade' }); return true; },
    phases: mv => [['airplane', 'strike', mv.active, 'airplane', `see-through: untouchable, walking x${mv.walk}`], ['online', 'recover', mv.recovery, 'stand', 'back online: open']],
  },
};

const objs = {
  drbeam(F, ob, dt, own) {   // (gone if he's hit out of it)
    if ((ob.ph === 'aim' || ob.ph === 'lock' || ob.ph === 'fire') && !(own.move === 'move1' && own.ms === ob.ms && (own.state === 'wind' || own.state === 'strike'))) { ob.ph = 'fade'; ob.life = ob.t + 0.2; }
  },
  // the app cube: booting, then turning to them and popping pellets; walked into (kicked), it tips over
  drcube(F, ob, dt, own, foe, M) {
    const mv = M.move2;
    if (ob.ph !== 'boot' && ob.ph !== 'live') return;
    if (grounded(foe) && Math.hypot(foe.x - ob.x, foe.y - ob.y) < ob.r + foe.r + 1) {
      ob.ph = 'broke'; ob.life = ob.t + 0.45; ob.ka = Math.atan2(ob.y - foe.y, ob.x - foe.x);
      F.ev('drCubeBreak', ob.x, ob.y, 0.5, ob.owner, { move: 'move2', to: foe.i }); return;
    }
    if (ob.ph === 'boot') { if (ob.t >= mv.boot) ob.ph = 'live'; else return; }
    if (ob.t >= mv.boot + mv.up) { ob.ph = 'off'; ob.life = ob.t + 0.4; F.ev('drCubeOff', ob.x, ob.y, 0.3, ob.owner, { move: 'move2' }); return; }
    if (foe.state !== 'ko') ob.a = turnTo(ob.a, Math.atan2(foe.y - ob.y, foe.x - ob.x), mv.turn * dt);
    if (ob.t >= ob.nx) {
      ob.nx += mv.every; ob.shots++;
      const c = Math.cos(ob.a), s = Math.sin(ob.a);
      spawn(F, own, { kind: 'drpel', x: ob.x + c * (ob.r + 3), y: ob.y + s * (ob.r + 3), z: 12, vx: c * mv.speed, vy: s * mv.speed, r: mv.pr, run: 0, mv: null, life: mv.range / mv.speed + 0.1 });
      F.ev('drPew', ob.x + c * ob.r, ob.y + s * ob.r, 0.3, ob.owner, { move: 'move2' });
    }
  },
  // a pellet: straight on; a wall or a pillar pops it; it hits once
  drpel(F, ob, dt, own, foe, M) {
    const mv = M.move2;
    ob.x += ob.vx * dt; ob.y += ob.vy * dt; ob.run += mv.speed * dt;
    if (ob.run >= mv.range || F.contactsAll(ob.x, ob.y, ob.r).length) { gone(ob); F.ev('drPop', ob.x, ob.y, 0.2, ob.owner, { move: 'move2' }); return; }
    if (open(foe) && !foe.under && Math.hypot(foe.x - ob.x, foe.y - ob.y) <= ob.r + foe.r) {
      const ok = F.hitF(own, foe, mv.hit, { dir: Math.atan2(ob.vy, ob.vx), obj: true, move: 'move2' });
      if (ok) { gone(ob); F.ev('drPop', ob.x, ob.y, 0.5, ob.owner, { move: 'move2', hit: F.lastRes === 'hit' }); }
    }
  },
};

// ---------------------------------------------------------------- the bot
const ai = {
  want: 185,
  // Bugdroid's tells, for the other bot: the beam's line, the pellets flying at them, the reset's crouch
  threats(F, i, me, o) {
    const out = [], ow = F.f[1 - i], M = ow.stats.moves;
    for (const b of F.objs) {
      if (b.owner === i || b.t < o.age || b.t >= b.life) continue;
      if (b.kind === 'drbeam' && b.ph !== 'fade') {
        const x1 = b.x + Math.cos(b.a) * b.len, y1 = b.y + Math.sin(b.a) * b.len, [lat, u] = segDist(me.x, me.y, b.x, b.y, x1, y1);
        const need = b.w + me.r + (b.ph === 'aim' ? 20 : 6) - lat;   // (still turning: well clear)
        if (need <= 0 || u >= 0.999) continue;
        const side = Math.sign(Math.sin(Math.atan2(me.y - b.y, me.x - b.x) - b.a)) || 1;
        const T = b.ph === 'aim' ? Math.max(0.15, ow.state === 'wind' ? ow.dur - ow.t : 0) + M.move1.lock : b.ph === 'lock' ? Math.max(0, M.move1.lock - (b.t - (b.lt || 0))) : 0;
        out.push(['b' + b.id + b.ph[0], T, M.move1.fire, b.a + side * Math.PI / 2, need]);
      } else if (b.kind === 'drpel') {
        const d = Math.hypot(me.x - b.x, me.y - b.y), a = Math.atan2(b.vy, b.vx), off = Math.atan2(me.y - b.y, me.x - b.x) - a;
        if (Math.cos(off) < 0.6 || d > 220) continue;
        const lat = Math.abs(Math.sin(off)) * d, need = b.r + me.r + 4 - lat;
        if (need > 0) out.push(['p' + b.id, Math.max(0, d - me.r) / M.move2.speed, 0.05, a + (Math.sin(off) >= 0 ? 1 : -1) * Math.PI / 2, need]);
      }
    }
    if (o.move === 'move3' && o.state === 'wind') {   // the reset coming: out of reach
      const d = Math.hypot(me.x - o.x, me.y - o.y), need = M.move3.R + me.r * 0.5 + 10 - d;
      if (need > 0) out.push(['r' + o.T, Math.max(0, o.left), 0.1, Math.atan2(me.y - o.y, me.x - o.x), need]);
    }
    return out;
  },
  // the beam aimed where they'll be, let go once it's on them (charged a while, the better the bot the longer); the
  // evade: away from them
  stick(F, i, me, o, C) {
    const K = C.K;
    if (me.move === 'move1' && me.state === 'wind') {
      const mv = me.stats.moves.move1;
      if (K.bFor !== me.ms) { K.bFor = me.ms; K.bch = mv.holdMax * Math.min(1, C.rng() * (0.4 + 0.8 * C.L.smart)); }
      const lead = mv.lock + 0.1, x = o.x + o.vx * lead * 0.5, y = o.y + o.vy * lead * 0.5, a = Math.atan2(y - me.y, x - me.x);
      if (me.t >= mv.startup + K.bch - 1e-9 && Math.abs(angDiff(me.face, a)) < 0.08) { C.m.hold.light = 0; C.m.queue.light = 0; }
      return [Math.cos(a), Math.sin(a)];
    }
    if (me.move === 'evade') { const a = Math.atan2(me.y - o.y, me.x - o.x); return [Math.cos(a), Math.sin(a)]; }
    return [0, 0];
  },
  punish(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, toFoe } = C.g;
    if (C.ready(2) && d - o.r * 0.5 < M.move3.R - 10 && w.fits(M.move3.startup + 0.02)) { C.fire(2); return [0, 0]; }
    if (C.ready(0) && w.line && d < M.move1.reach && w.fits(M.move1.startup + M.move1.lock + 0.02)) { C.fire(0, 3); return C.unit(toFoe); }
    return null;
  },
  neutral(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, toFoe } = C.g;
    w.add(0, w.line && d > 90 && d < M.move1.reach ? (w.busy ? 0.3 : 0.15) : 0, [0, 0], 48);
    w.add(1, d > 110 && !cube(F, me) ? (w.busy ? 0.2 : 0.1) : 0, C.unit(toFoe));
    w.add(2, d - o.r * 0.5 < M.move3.R - 6 ? (w.busy || w.spent ? 0.55 : 0.32) : 0, [0, 0]);
  },
  evadeWhen(T, dur, E) { return [T > 0.02 && T + dur < E.active - 0.04, T + dur < E.active - 0.04]; },
};

export default { id: ID, fighter, kits, objs, ai };
