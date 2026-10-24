// A plug-in fighter's shape, as a small working example (js/kits/index.js documents every field). Not imported: copy it
// to js/kits/<id>.js, rename the id, the kits (`do`), the object kinds and the events, then make the moves your own.
// Three big moves (move1..3 on the light, heavy and special keys) and an evade (the guard key), each with a tell (what
// gives it away) and an answer (how to beat it: step out of it, evade it, or punish its recovery). DOM-free, deterministic.
import { angDiff, dist, inside, mine, open, segDist, setPh, spawn, toward } from './lib.js';

const ID = 'sample';
const fighter = {
  id: ID, name: 'Sample', lang: 'Example', role: 'Template', kit3: true,
  blurb: 'One line about who they are and how they fight.', passive: 'What they\'re good at.', balance: 'Not tuned for balance yet.',
  hp: 110, weight: 1, walk: 1.1, accel: 30, friction: 30, kbDecay: 3.1, radius: 16, slipMul: 0.2, reachBar: 0.6,
  moves: {
    // a lunge along a line: the tell is the crouch, the answer is to step off the line (or punish the stumble)
    move1: { name: 'Lunge', short: 'Lunge', do: 'smpLunge', icon: 'smpLunge', hold: null,
      blurb: 'Crouches, then lunges along a line.', tell: 'The crouch.', answer: 'Step off the line; a miss leaves them open.',
      startup: 0.35, active: 0.3, recovery: 0.3, miss: 0.6, cooldown: 1, damage: 14, kb: 220, kd: true, speed: 420, reach: 4 },
    // a spot under the foe that bursts a moment later (a world object)
    move2: { name: 'Burst', short: 'Burst', do: 'smpBurst', icon: 'smpBurst', hold: null,
      blurb: 'A spot on the floor bursts a moment later.', tell: 'The spot darkens.', answer: 'Walk off it.',
      startup: 0.25, active: 0.05, recovery: 0.3, cooldown: 1.5, damage: 12, kb: 200, kd: true, r: 36, delay: 0.7 },
    move3: { name: 'Shove', short: 'Shove', do: 'smpShove', icon: 'smpShove', hold: null,
      blurb: 'A short shove right in front.', tell: 'Arms back.', answer: 'Keep out of reach.',
      startup: 0.3, active: 0.08, recovery: 0.3, cooldown: 0.8, damage: 9, kb: 260, reach: 26, arc: 120 },
    evade: { name: 'Hop', short: 'Hop', do: 'smpHop', icon: 'smpHop', hold: null,
      blurb: 'A short hop the held way, untouchable for it.', tell: 'None.', answer: 'Punish the landing.',
      startup: 0, active: 0.3, recovery: 0.2, cooldown: 1.5, dist: 90 },
  },
  phPose: { crouch: 'wind', lunge: 'strike', stumble: 'hurt', cast: 'wind', arms: 'wind', shove: 'strike', hop: 'air', land: 'stand' },
  phFade: ['shove'],
  fields: {},
};
fighter.clips = {
  move1: { x: [-90, 40], len: 2.2, cam: { x: -20, w: 280 }, a: [[0.3, 0.38, { light: 1 }]] },
  move2: { x: [-80, 40], len: 2.2, cam: { x: -20, w: 280 }, a: [[0.3, 0.38, { heavy: 1 }]] },
  move3: { x: [-30, 30], len: 2, cam: { x: 0, w: 240 }, a: [[0.3, 0.38, { special: 1 }]] },
  evade: { x: [-60, 60], len: 2, cam: { x: 0, w: 260 }, a: [[0.5, 0.56, { guard: 1, y: -1 }]], b: [[0.3, 0.38, { light: 1 }]] },
};

const kits = {
  smpLunge: {
    moves: true,
    press(F, f) { setPh(f, 'crouch'); },
    start(F, f) { setPh(f, 'lunge'); F.ev('smpLunge', f.x, f.y, 0.6, f.i, { move: 'move1' }); },
    step(F, f, o, mv) {
      f.vx = Math.cos(f.face) * mv.speed; f.vy = Math.sin(f.face) * mv.speed;
      if (!f.hit && open(o) && dist(f, o) <= f.r + o.r + mv.reach && F.hitF(f, o, mv, { dir: f.face })) { f.hit = true; f.vx *= 0.3; f.vy *= 0.3; F.go(f, 'recover', mv.recovery); }
    },
    end(F, f, o, mv) { setPh(f, 'stumble'); F.go(f, 'recover', mv.miss); return true; },
    wall(F, f) { f.vx = f.vy = 0; setPh(f, 'stumble'); F.go(f, 'recover', f.stats.moves.move1.miss); return true; },
  },
  smpBurst: {
    can(F, f) { return !mine(F, f, 'smpSpot'); },
    press(F, f, o, mv) { setPh(f, 'cast'); const [x, y] = inside(F, o.x, o.y, mv.r * 0.5); spawn(F, f, { kind: 'smpSpot', x, y, r: mv.r, ph: 'grow', mv: null }); },
    start(F, f) { setPh(f, 'cast'); },
  },
  smpShove: {
    press(F, f) { setPh(f, 'arms'); },
    start(F, f, o, mv) {
      setPh(f, 'shove');
      const d = dist(f, o), a = toward(f, o);
      if (open(o) && d - f.r - o.r <= mv.reach && Math.abs(angDiff(a, f.face)) < mv.arc * Math.PI / 360) f.hit = F.hitF(f, o, mv, { dir: a });
    },
  },
  smpHop: {
    moves: true,
    start(F, f, o, mv) {
      const c = F.ctl(f), a = c.mag > 0.3 ? c.dirA : toward(o, f);
      setPh(f, 'hop'); f.inv = Math.max(f.inv, 2 / 60); f.vx = Math.cos(a) * mv.dist / mv.active; f.vy = Math.sin(a) * mv.dist / mv.active;
      F.ev('smpHop', f.x, f.y, 0.4, f.i, { move: 'evade' });
    },
    step(F, f, o, mv) { f.inv = Math.max(f.inv, 2 / 60); f.z = Math.sin(Math.PI * Math.min(1, f.t / mv.active)) * 14; },
    end(F, f, o, mv) { f.inv = 0; f.z = 0; f.vx *= 0.2; f.vy *= 0.2; setPh(f, 'land'); F.go(f, 'recover', mv.recovery); return true; },
  },
};

const objs = {
  // the spot: darkens for its delay, then bursts once (from below: no block), then fades
  smpSpot(F, ob, dt, own, foe, M) {
    const mv = M.move2;
    if (ob.ph === 'grow' && ob.t >= mv.delay) {
      ob.ph = 'burst'; ob.life = ob.t + 0.3; F.ev('smpBurst', ob.x, ob.y, 0.8, ob.owner, { move: 'move2' });
      const d = Math.hypot(foe.x - ob.x, foe.y - ob.y);
      if (open(foe) && d - foe.r * 0.5 <= ob.r) F.hitF(own, foe, mv, { dir: Math.atan2(foe.y - ob.y, foe.x - ob.x), obj: true, unblockable: true, noFlank: true, move: 'move2' });
    }
  },
};

const ai = {
  want: 150,
  // what this fighter throws at the other bot: [key, T, dur, way out, how far]
  threats(F, i, me, o) {
    const out = [];
    for (const b of F.objs) {
      if (b.kind !== 'smpSpot' || b.owner === i || b.t < o.age || b.ph !== 'grow') continue;
      const need = b.r + me.r * 0.5 + 4 - Math.hypot(me.x - b.x, me.y - b.y);
      if (need > 0) out.push(['s' + b.id, F.f[b.owner].stats.moves.move2.delay - b.t, 0.05, Math.atan2(me.y - b.y, me.x - b.x), need]);
    }
    if (o.move === 'move1' && o.state === 'wind') {   // the lunge coming: off its line, sideways
      const ow = F.f[1 - i], x1 = o.x + Math.cos(o.face) * 200, y1 = o.y + Math.sin(o.face) * 200, [d] = segDist(me.x, me.y, o.x, o.y, x1, y1);
      const need = me.r + ow.r + 10 - d; if (need > 0) out.push(['l' + o.T, Math.max(0, o.left) + Math.hypot(me.x - o.x, me.y - o.y) / ow.stats.moves.move1.speed, 0.1, o.face + Math.PI / 2, need]);
    }
    return out;
  },
  punish(F, i, me, o, C, w) {
    const M = me.stats.moves;
    if (w.line && C.ready(0) && w.fits(M.move1.startup + Math.max(0, C.g.gap) / M.move1.speed)) { C.fire(0); return C.unit(C.g.toFoe); }
    return null;
  },
  neutral(F, i, me, o, C, w) {
    const { dist: d, toFoe } = C.g;
    w.add(0, w.line && d < 220 ? 0.15 : 0, C.unit(toFoe));
    w.add(1, d < 260 ? (w.busy ? 0.4 : 0.12) : 0, [0, 0]);
    w.add(2, C.g.gap < 30 ? 0.3 : 0, C.unit(toFoe));
  },
};
export default { id: ID, fighter, kits, objs, ai };
