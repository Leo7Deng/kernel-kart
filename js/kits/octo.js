// Octo (GitHub's Octocat) in Fight mode (2026-10-24): many arms, version control. Drawn by js/art/kit-octo.js:
//   move1 Pull Request (ocPull)  a tentacle coils back (a faint damp track runs out along the line), then shoots out
//                                along it: catching them, it reels them in for a slam. Answer: step off the line; a miss
//                                leaves him drooping, open
//   move2 Fork (ocFork)          a soft ink blot marks a spot beside them and a clone of Octo pops up there. It copies his
//                                next move (Pull Request or Force Push) from there: a double attack from two angles. It
//                                lasts 3 s or one move; hit it and it pops. Answer: watch both, or pop the clone
//   move3 Force Push (ocPush)    tentacles rise round him (their shadows reach out over the floor), then slam down: a
//                                shockwave shoves whoever's near hard toward the walls. Answer: evade, or be far away
//   evade Ink Jet (ocInk)        a squirt of ink and he jets back (the held way, else away from them), untouchable, leaving
//                                a slippery ink puddle where he was
// Objects (plain data): ocLine (a Pull's tell: x, y, a, len, reach, src (0: Octo, else the clone's id)), ocArm (the
// tentacle: sx, sy, a, len, reach, ph 'out' | 'reel' | 'back', res '' | 'slam' | 'miss', src), ocSpot (where the clone
// will pop up), ocClone (x, y, face, ph 'pop' | 'idle' | 'copy' | 'poof', pt, dur, cp (the move it copies), cms, how),
// ocRing (a Force Push's tell round a source: x, y, R, u, src), ocWave (its shockwave: x, y, r, R), ocInk (the puddle:
// slick, so fight.js makes it slippery). Events: ocCoil, ocShoot, ocCatch, ocSlamArm, ocDroop, ocFork, ocPop, ocRise,
// ocSlam, ocInkJet. A hit from the clone's copy counts as the Fork's (move 'move2'). DOM-free, deterministic.
import { D2R, clamp, dist, gone, inside, landing, mine, sameGo, segDist, setPh, spawn, toward, turnTo } from './lib.js';

const ID = 'octo';
const fighter = {
  id: ID, name: 'Octo', lang: 'GitHub', role: 'Controller', kit3: true,
  blurb: 'Eight busy arms and a knack for branching: reels you in from across the room, forks a copy of himself to come at you from two sides, and shoves everything near into the walls.',
  passive: 'Sticky suckers: he barely slips on puddles, even his own ink.',
  balance: 'Not tuned for balance yet (2026-10-24, the user: "dont even think about balancing for now").',
  hp: 116, weight: 1, walk: 1.05, accel: 30, friction: 30, kbDecay: 3.1, radius: 17, slipMul: 0.6, reachBar: 0.9,
  moves: {
    move1: { name: 'Pull Request', short: 'Pull', do: 'ocPull', icon: 'ocPull', hold: 'aim',
      blurb: 'A tentacle coils back, then shoots out along a line: catching them, it reels them in for a slam that knocks down.',
      tell: 'A tentacle coils back, and a faint damp track runs out along the floor where it\'ll shoot.',
      answer: 'Step off the line, or evade it. Missing, the tentacle flops back and he\'s open.',
      // the coil (startup, turning aimTurn rad/s the held way, else at them), the arm out at speed up to reach past his
      // edge (width either side; a wall stops it), a touch (grab: a hit, so an evade beats it), reeled in at reel u/s,
      // the slam (knocks down); a miss: miss s open. Active is only a cap (the arm ends it)
      startup: 0.4, active: 1.4, recovery: 0.35, miss: 0.55, cooldown: 1.3, damage: 16, kb: 200, kd: true,
      reach: 170, speed: 720, back: 900, width: 6, reel: 460, aimTurn: 2.2,
      grab: { damage: 3, kb: 0, stun: 0.2, kind: 'special', prio: 2, stale: false },
      slam: { damage: 13, kb: 200, kd: true, kind: 'special', prio: 2, stale: false } },
    move2: { name: 'Fork', short: 'Fork', do: 'ocFork', icon: 'ocFork', hold: null,
      blurb: 'A clone of him pops up beside them and copies his next move from there: two Pull Requests or two Force Pushes at once.',
      tell: 'A soft ink blot marks where the clone pops up; then it does whatever he does next.',
      answer: 'Watch both of them, or hit the clone: it pops. It lasts 3 s or one move.',
      // the blot dist from them, angle degrees round from the line to Octo (the held side, else the roomier one); the
      // clone life s, or one copied move (its hits count as the Fork's)
      startup: 0.35, active: 0.05, recovery: 0.25, cooldown: 3.5, damage: 0, kb: 0,
      dist: 105, angle: 100, life: 3 },
    move3: { name: 'Force Push', short: 'Push', do: 'ocPush', icon: 'ocPush', hold: null,
      blurb: 'Tentacles rise all round him, then slam down: a shockwave shoves whoever\'s near hard toward the walls.',
      tell: 'His tentacles rise and their shadows reach out over the floor round him: that\'s how far it goes.',
      answer: 'Evade it, or be further away than the shadows. He\'s open while the tentacles come back.',
      // the rise (startup), the slam: anyone within R (to their middle, + half their radius) is shoved away, kb falling to
      // edge x at R's edge (enough knocks them down; a wall then slams them)
      startup: 0.55, active: 0.06, recovery: 0.5, cooldown: 2, damage: 9, kb: 470, stun: 0.5, R: 118, edge: 0.6 },
    evade: { name: 'Ink Jet', short: 'Ink Jet', do: 'ocInk', icon: 'ocInk', hold: null,
      blurb: 'A squirt of ink and he jets back (the way you hold, or away from them), untouchable, leaving a slippery ink puddle where he was.',
      tell: 'None: it\'s quick. Its cooldown shows on his key.', answer: 'Don\'t chase him through the ink; he\'s open for a moment as he lands.',
      // dist units over active s, untouchable; the puddle (r puddle, puddleLife s) where he was; recovery s open
      startup: 0, active: 0.2, recovery: 0.22, cooldown: 1.8, dist: 130, puddle: 32, puddleLife: 3.5 },
  },
  phPose: { coil: 'coil', shoot: 'shoot', reel: 'reel', slam: 'slam', droop: 'droop', fork: 'fork', forked: 'fork', rise: 'rise', push: 'slam',
    squirt: 'ink', jet: 'jet', land: 'ink' },
  phFade: ['slam', 'forked', 'push', 'land'],
  fields: {},
  show: ['stand', 'coil', 'stand', 'fork', 'stand', 'rise', 'stand', 'ink'], cheer: 'rise',
};
const P = (a, b, inp) => [a, b, inp];
fighter.clips = {
  move1: { x: [-110, 40], len: 2.6, cam: { x: -30, w: 300 }, a: [P(0.3, 0.38, { light: 1 })] },
  move2: { x: [-90, 50], len: 3.2, cam: { x: -10, w: 310 }, a: [P(0.3, 0.38, { heavy: 1 }), P(1.0, 1.08, { special: 1 })] },   // (the fork, then a Force Push from both)
  move3: { x: [-50, 40], len: 2.6, cam: { x: 10, w: 330 }, a: [P(0.3, 0.38, { special: 1 })] },
  evade: { x: [-30, 110], len: 2.4, cam: { x: 10, w: 320 }, a: [P(0.6, 0.66, { guard: 1, x: 0, y: -1 })], b: [P(0.3, 0.38, { light: 1 })] },   // (out of Tux's toboggan)
};

// ---------------------------------------------------------------- helpers
const SRC_R = 14;   // (a tentacle leaves its body this far out)
// the clone ready to copy his next move (popping up or standing), or null
const cloneFree = (F, f) => F.objs.find(b => b.kind === 'ocClone' && b.owner === f.i && b.t < b.life && (b.ph === 'idle' || b.ph === 'pop')) || null;
// a source: Octo (src 0) or his clone (its id); null if the clone's gone
function srcOf(F, f, src) {
  if (!src) return f;
  return F.objs.find(b => b.id === src && b.kind === 'ocClone') || null;
}
// the clone takes up his move: it'll do it too, from where it stands
function copy(F, f, k) { const cl = cloneFree(F, f); if (cl) { cl.ph = 'copy'; cl.cp = k; cl.cms = f.ms; cl.pt = 0; } return cl; }
// where the clone pops up: beside them, angle° round from the line to Octo (the held side, else the roomier one)
function forkSpot(F, f, o, mv, c) {
  const back = toward(o, f), sides = [1, -1];
  if (c.mag > 0.3) { const s = Math.sign(Math.sin(c.dirA - toward(f, o))); if (s < 0) sides.reverse(); }
  let best = null;
  for (const s of sides) {
    const b = back + s * mv.angle * D2R, [x, y] = inside(F, o.x + Math.cos(b) * mv.dist, o.y + Math.sin(b) * mv.dist, 22);
    const ok = !F.contactsAll(x, y, 16).length, room = Math.hypot(x - o.x, y - o.y);
    if (ok && (!best || (c.mag <= 0.3 && room > best[2] + 8))) best = [x, y, room];
    if (ok && c.mag > 0.3) break;
  }
  return best ? [best[0], best[1]] : inside(F, f.x + Math.cos(back + Math.PI / 2) * 40, f.y + Math.sin(back + Math.PI / 2) * 40, 22);
}
// a Force Push's slam from (x, y): the shockwave, and the shove (credited to move k: the clone's is the Fork's)
function wave(F, f, o, mv, x, y, k) {
  spawn(F, f, { kind: 'ocWave', x, y, r: 0, R: mv.R, life: 0.4, mv: null });
  F.ev('ocSlam', x, y, 1, f.i, { move: k });
  const d = Math.hypot(o.x - x, o.y - y);
  if (d - o.r * 0.5 <= mv.R && o.z < 30 && !o.gone) {
    const kb = 1 - (1 - mv.edge) * clamp(d / mv.R, 0, 1);
    F.hitF(f, o, mv, { dir: d > 2 ? Math.atan2(o.y - y, o.x - x) : f.face, obj: true, noFlank: true, move: k, kbMul: kb });
  }
}
function poof(F, ob, how) { if (ob.ph === 'poof') return; ob.ph = 'poof'; ob.pt = 0; ob.how = how; ob.life = ob.t + 0.3; F.ev('ocPop', ob.x, ob.y, how === 'hit' ? 0.6 : 0.4, ob.owner, { move: 'move2', how }); }
// the foe's swing or thing reaching the clone (it pops): a move of theirs going on right by it and facing it, or one of
// their world things that hurts (a landing's ring, an eruption, a sliding penguin) over it
function struck(F, ob, foe) {
  if (foe.state === 'strike' && foe.move && dist(foe, ob) <= foe.r + ob.r + 24 && Math.abs(Math.atan2(Math.sin(toward(foe, ob) - foe.face), Math.cos(toward(foe, ob) - foe.face))) < 1.3) return true;
  for (const b of F.objs) {
    if (b.owner !== foe.i || b.t >= b.life) continue;
    const near = Math.hypot(b.x - ob.x, b.y - ob.y) <= (b.r || 0) + ob.r;
    if (near && (b.kind === 'shock' || (b.kind === 'geyser' && b.ph === 'erupt') || (b.kind === 'peng' && b.ph === 'slide') || b.kind === 'ocWave')) return true;
  }
  return false;
}

const kits = {
  ocPull: {
    moves: true,
    press(F, f, o, mv) {
      setPh(f, 'coil');
      spawn(F, f, { kind: 'ocLine', src: 0, a: f.face, len: 0, reach: mv.reach });
      const cl = copy(F, f, 'move1');
      if (cl) spawn(F, f, { kind: 'ocLine', src: cl.id, x: cl.x, y: cl.y, a: toward(cl, o), len: 0, reach: mv.reach });
      F.ev('ocCoil', f.x, f.y, 0.4, f.i, { move: 'move1' });
    },
    wind(F, f, o, mv, dt, c) {
      f.face = turnTo(f.face, c.mag > 0.3 ? c.dirA : toward(f, o), mv.aimTurn * dt);
      const u = clamp(f.t / Math.max(0.05, f.dur * 0.75), 0, 1);
      for (const ln of F.objs) {
        if (ln.kind !== 'ocLine' || ln.owner !== f.i || !sameGo(f, ln)) continue;
        const S = srcOf(F, f, ln.src); if (!S) { gone(ln); continue; }
        ln.x = S.x; ln.y = S.y; ln.a = ln.src ? turnTo(ln.a, toward(S, o), mv.aimTurn * dt) : f.face; ln.len = mv.reach * u;
        if (ln.src) S.face = ln.a;
      }
    },
    start(F, f, o, mv) {
      setPh(f, 'shoot'); f.vx = f.vy = 0;
      for (const ln of F.objs) {
        if (ln.kind !== 'ocLine' || ln.owner !== f.i || !sameGo(f, ln)) continue;
        spawn(F, f, { kind: 'ocArm', src: ln.src, x: ln.x, y: ln.y, sx: ln.x, sy: ln.y, a: ln.a, len: 0, reach: mv.reach, ph: 'out', res: '' });
        gone(ln);
      }
      F.ev('ocShoot', f.x, f.y, 0.6, f.i, { move: 'move1' });
    },
    step(F, f, o, mv) {
      f.vx = f.vy = 0;
      const arm = F.objs.find(b => b.kind === 'ocArm' && b.src === 0 && b.owner === f.i && b.t < b.life && sameGo(f, b));
      if (!arm) { if (f.t > 0.05) { setPh(f, 'droop'); F.go(f, 'recover', mv.miss); } return; }
      if (arm.ph === 'reel') { setPh(f, 'reel'); f.face = arm.a; }
      else if (arm.ph === 'back') {
        if (arm.res === 'slam') { setPh(f, 'slam'); F.go(f, 'recover', mv.recovery); }
        else { setPh(f, 'droop'); F.go(f, 'recover', mv.miss); F.ev('ocDroop', f.x, f.y, 0.3, f.i, { move: 'move1' }); }
      }
    },
    end(F, f, o, mv) { if (f.hold >= 0) F.release(f); setPh(f, 'droop'); F.go(f, 'recover', mv.miss); return true; },
    phases: mv => [['coil', 'wind', mv.startup, 'coil', `a tentacle coils back, turning ${mv.aimTurn} rad/s; the damp track runs out`],
      ['shoot', 'strike', `up to ${Math.round(mv.reach / mv.speed * 100) / 100}`, 'shoot', `the tentacle out ${mv.reach} at ${mv.speed} u/s, ${mv.width} either side (a wall stops it)`],
      ['reel', 'strike', 'till they\'re in', 'reel', `caught (a ${mv.grab.damage} grab): reeled in at ${mv.reel} u/s`],
      ['slam', 'recover', mv.recovery, 'slam', `the slam: ${mv.slam.damage}, knocks down`], ['droop', 'recover', mv.miss, 'droop', 'missed: the tentacle flops back, open']],
  },
  ocFork: {
    can(F, f) { return !F.objs.some(b => b.kind === 'ocClone' && b.owner === f.i && b.t < b.life); },
    press(F, f, o, mv, c) {
      setPh(f, 'fork');
      const [x, y] = forkSpot(F, f, o, mv, c);
      spawn(F, f, { kind: 'ocSpot', x, y, r: 18 });
    },
    start(F, f, o, mv) {
      setPh(f, 'forked');
      const sp = mine(F, f, 'ocSpot'), x = sp ? sp.x : f.x, y = sp ? sp.y : f.y;
      if (sp) gone(sp);
      spawn(F, f, { kind: 'ocClone', x, y, r: f.r, face: toward({ x, y }, o), ph: 'pop', pt: 0, dur: mv.life, cp: '', cms: 0, how: '', mv: null });
      F.ev('ocFork', x, y, 0.6, f.i, { move: 'move2', x0: f.x, y0: f.y });
    },
    phases: mv => [['fork', 'wind', mv.startup, 'fork', 'splits: the ink blot shows where the clone pops up'], ['forked', 'strike', mv.active, 'fork', `the clone pops up ${mv.dist} from them`],
      ['forked', 'recover', mv.recovery, 'fork', `(the clone: ${mv.life} s or his next move, copied; hit it and it pops)`]],
  },
  ocPush: {
    press(F, f, o, mv) {
      setPh(f, 'rise');
      spawn(F, f, { kind: 'ocRing', src: 0, R: mv.R, u: 0 });
      const cl = copy(F, f, 'move3');
      if (cl) spawn(F, f, { kind: 'ocRing', src: cl.id, x: cl.x, y: cl.y, R: mv.R, u: 0 });
      F.ev('ocRise', f.x, f.y, 0.5, f.i, { move: 'move3' });
    },
    wind(F, f, o, mv) {
      for (const rg of F.objs) {
        if (rg.kind !== 'ocRing' || rg.owner !== f.i || !sameGo(f, rg)) continue;
        const S = srcOf(F, f, rg.src); if (!S) { gone(rg); continue; }
        rg.x = S.x; rg.y = S.y; rg.u = clamp(f.t / Math.max(0.05, f.dur), 0, 1);
      }
    },
    start(F, f, o, mv) {
      setPh(f, 'push');
      for (const rg of F.objs) {
        if (rg.kind !== 'ocRing' || rg.owner !== f.i || !sameGo(f, rg)) continue;
        gone(rg);
        wave(F, f, o, mv, rg.x, rg.y, rg.src ? 'move2' : 'move3');
      }
    },
    phases: mv => [['rise', 'wind', mv.startup, 'rise', 'tentacles rise round him; their shadows reach out to the edge'], ['push', 'strike', mv.active, 'slam', `the slam: within ${mv.R}, ${mv.damage} and shoved (kb ${mv.kb}, x${mv.edge} at the edge)`],
      ['push', 'recover', mv.recovery, 'slam', 'the tentacles come back: open']],
  },
  ocInk: {
    moves: true,
    start(F, f, o, mv) {
      const c = F.ctl(f), a = c.mag > 0.3 ? c.dirA : toward(o, f), [x, y] = landing(F, f, o, a, mv.dist);
      spawn(F, f, { kind: 'ocInk', r: mv.puddle, life: mv.puddleLife, slick: 1, mv: null });
      f.inv = Math.max(f.inv, 2 / 60); f.vx = (x - f.x) / mv.active; f.vy = (y - f.y) / mv.active;
      setPh(f, 'jet');
      F.ev('ocInkJet', f.x, f.y, 0.5, f.i, { move: 'evade', x2: x, y2: y });
    },
    step(F, f) { f.inv = Math.max(f.inv, 2 / 60); },
    end(F, f, o, mv) { f.inv = 0; f.vx *= 0.2; f.vy *= 0.2; setPh(f, 'land'); F.go(f, 'recover', mv.recovery); return true; },
    phases: mv => [['jet', 'strike', mv.active, 'jet', `${mv.dist} the held way (none: away from them), untouchable; an ink puddle (r ${mv.puddle}, ${mv.puddleLife} s) left behind`],
      ['land', 'recover', mv.recovery, 'ink', 'landing: open']],
  },
};

const objs = {
  // a Pull's tell: gone once his coil is over (or cut short)
  ocLine(F, ob, dt, own) { if (!sameGo(own, ob) || own.state !== 'wind') gone(ob); },
  // the tentacle: out along its line; catching them, it reels them in to its source and slams them; else back it comes
  ocArm(F, ob, dt, own, foe, M) {
    const mv = M.move1, S = srcOf(F, own, ob.src), k = ob.src ? 'move2' : 'move1';
    if (S) { ob.sx = S.x; ob.sy = S.y; }
    const letGo = () => { if (own.hold === foe.i && foe.hold === own.i && foe.state === 'grabbed') F.release(own); ob.ph = 'back'; if (!ob.res) ob.res = 'miss'; };
    if (ob.ph !== 'back' && ((!ob.src && !(sameGo(own, ob) && own.state === 'strike')) || (ob.src && !S))) letGo();   // (he was hit out of it, or the clone's gone)
    if (ob.ph === 'out') {
      ob.len = Math.min(ob.reach, ob.len + mv.speed * dt);
      const c = Math.cos(ob.a), s = Math.sin(ob.a), tx = ob.sx + c * (SRC_R + ob.len), ty = ob.sy + s * (SRC_R + ob.len);
      ob.x = tx; ob.y = ty;
      const [d] = segDist(foe.x, foe.y, ob.sx + c * SRC_R, ob.sy + s * SRC_R, tx, ty);
      if (d <= foe.r + mv.width && foe.z < 30 && !foe.gone && !['grabbed', 'down', 'getup', 'ko'].includes(foe.state)) {
        if (F.hitF(own, foe, mv.grab, { dir: ob.a + Math.PI, obj: true, noFlank: true, move: k })) {
          if (F.lastRes === 'hit' && foe.state !== 'ko' && foe.hold < 0 && own.hold < 0) {
            F.release(foe); foe.move = null; foe.charge = 0; foe.vx = foe.vy = 0; foe.ph = '';
            F.go(foe, 'grabbed'); foe.hold = own.i; own.hold = foe.i;
            ob.ph = 'reel'; ob.len = Math.max(0, Math.hypot(foe.x - ob.sx, foe.y - ob.sy) - SRC_R);
            F.ev('ocCatch', foe.x, foe.y, 0.6, own.i, { move: k, to: foe.i });
          } else { ob.ph = 'back'; ob.res = 'miss'; }   // (off the ice, or into a penguin)
          return;
        }
      }
      if (F.contactsAll(tx, ty, 2).length || ob.len >= ob.reach) { ob.ph = 'back'; ob.res = 'miss'; }
    } else if (ob.ph === 'reel') {
      if (foe.state !== 'grabbed' || foe.hold !== own.i) { ob.ph = 'back'; ob.res = 'miss'; return; }
      const a = Math.atan2(foe.y - ob.sy, foe.x - ob.sx), d = Math.hypot(foe.x - ob.sx, foe.y - ob.sy), snug = SRC_R + foe.r + 2, nd = Math.max(snug, d - mv.reel * dt);
      foe.x = ob.sx + Math.cos(a) * nd; foe.y = ob.sy + Math.sin(a) * nd; foe.vx = foe.vy = 0; F.keepIn(foe);
      ob.a = a; ob.len = nd - SRC_R; ob.x = foe.x; ob.y = foe.y;
      if (S && ob.src) S.face = a;
      if (nd <= snug + 0.01) {   // in: the slam, down in front of it
        F.release(own);
        F.hitF(own, foe, mv.slam, { dir: a, unblockable: true, hold: true, kd: true, noFlank: true, move: k });
        ob.ph = 'back'; ob.res = 'slam';
        F.ev('ocSlamArm', foe.x, foe.y, 0.8, own.i, { move: k });
      }
    } else {
      ob.len -= mv.back * dt;
      ob.x = ob.sx + Math.cos(ob.a) * (SRC_R + Math.max(0, ob.len)); ob.y = ob.sy + Math.sin(ob.a) * (SRC_R + Math.max(0, ob.len));
      if (ob.len <= 0) gone(ob);
    }
  },
  // where the clone will pop up: gone if his fork is cut short
  ocSpot(F, ob, dt, own) { if (!sameGo(own, ob) || own.state !== 'wind') gone(ob); },
  // the clone: pops up, stands turned to them, copies his next move; popped by a hit, gone after it or its time
  ocClone(F, ob, dt, own, foe) {
    ob.pt += dt;
    if (ob.ph === 'poof') return;
    if (ob.ph === 'pop' && ob.pt >= 0.2) { ob.ph = 'idle'; ob.pt = 0; }
    if (ob.ph !== 'copy') ob.face = turnTo(ob.face, toward(ob, foe), 8 * dt);
    if (struck(F, ob, foe)) { poof(F, ob, 'hit'); return; }
    if (ob.ph === 'copy') {
      const busy = own.ms === ob.cms && own.move && (own.state === 'wind' || own.state === 'strike');
      const arm = F.objs.some(b => b.kind === 'ocArm' && b.src === ob.id && b.t < b.life && b.ph !== 'back');
      if (!busy && !arm && ob.pt > 0.1) poof(F, ob, 'used');
    } else if (ob.t >= ob.dur) poof(F, ob, 'old');
  },
  ocRing(F, ob, dt, own) { if (!sameGo(own, ob) || own.state !== 'wind') gone(ob); },
  ocWave(F, ob) { ob.r = ob.R * Math.min(1, ob.t / 0.16); },
  ocInk() {},
};

// ---------------------------------------------------------------- the bot
const unit = a => [Math.cos(a), Math.sin(a)];
const ai = {
  want: 150,
  // what Octo's moves (and his clone's) throw at the other bot: [key, T, dur, way out, how far]
  threats(F, i, me, o) {
    const out = [];
    for (const b of F.objs) {
      if (b.owner === i || b.t < o.age || b.t >= b.life) continue;
      const ow = F.f[b.owner], M = ow.stats.moves, left = ow.state === 'wind' ? Math.max(0, ow.dur - ow.t) : 0;
      if (b.kind === 'ocLine' || (b.kind === 'ocArm' && b.ph === 'out')) {   // a Pull Request: off its line, sideways
        const mv = M.move1, L = SRC_R + mv.reach + 10, x0 = b.kind === 'ocArm' ? b.sx : b.x, y0 = b.kind === 'ocArm' ? b.sy : b.y;
        const x1 = x0 + Math.cos(b.a) * L, y1 = y0 + Math.sin(b.a) * L, [d, u] = segDist(me.x, me.y, x0, y0, x1, y1);
        const need = me.r + mv.width + (b.kind === 'ocLine' ? 16 : 6) - d; if (need <= 0) continue;
        const side = Math.sign(Math.sin(Math.atan2(me.y - y0, me.x - x0) - b.a)) || 1;
        const T = b.kind === 'ocLine' ? left + u * L / mv.speed : Math.max(0, u * L - SRC_R - b.len) / mv.speed;
        out.push(['l' + b.id, T, 0.1, b.a + side * Math.PI / 2, need]);
      } else if (b.kind === 'ocRing') {   // a Force Push: out past its shadows
        const mv = M.move3, d = Math.hypot(me.x - b.x, me.y - b.y), need = mv.R + me.r * 0.5 + 8 - d; if (need <= 0) continue;
        out.push(['p' + b.id, left, 0.06, d > 1 ? Math.atan2(me.y - b.y, me.x - b.x) : me.face + Math.PI, need]);
      }
    }
    return out;
  },
  stick(F, i, me, o) {
    const mv = me.stats.moves[me.move];
    if (mv.do === 'ocPull' && me.state === 'wind') return unit(Math.atan2(o.y + o.vy * 0.15 - me.y, o.x + o.vx * 0.15 - me.x));
    return [0, 0];
  },
  punish(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap, toFoe } = C.g;
    if (C.ready(2) && d < M.move3.R - 12 && w.fits(M.move3.startup)) { C.fire(2); return [0, 0]; }
    if (C.ready(0) && w.line && gap < M.move1.reach - 10 && w.fits(M.move1.startup + gap / M.move1.speed)) { C.fire(0); return unit(toFoe); }
    return null;
  },
  neutral(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap, toFoe } = C.g;
    const cl = F.objs.find(b => b.kind === 'ocClone' && b.owner === i && (b.ph === 'idle' || b.ph === 'pop') && b.t < b.life);
    const clNear = cl && Math.hypot(cl.x - o.x, cl.y - o.y) < M.move3.R - 15;
    w.add(1, !cl && d > 80 && d < 300 ? (w.spent ? 0.2 : 0.11) : 0, [0, 0]);
    w.add(0, (w.line || cl) && gap > 10 && gap < M.move1.reach - 15 ? (cl ? 0.35 : w.busy ? 0.3 : 0.14) : 0, unit(toFoe));
    w.add(2, d < M.move3.R - 20 || clNear ? (clNear ? 0.45 : w.busy ? 0.4 : 0.2) : 0, [0, 0]);
  },
  evadeWhen(T) { return [T > 0.01 && T < 0.16, T < 0.16]; },
};

export default { id: ID, fighter, kits, objs, ai };
