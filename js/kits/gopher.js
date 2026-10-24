// Gopher (Go) for Fight, rebuilt 2026-10-24 (three big moves and an evade: js/kits/index.js has the plug-in shape, the
// drawing is js/art/kit-gopher.js). The busy burrower: concurrency and digging.
//   move1 Goroutine Rush (goRush): four little gophers scurry out to four lanes beside him, then run down them at the
//         foe, each nipping once. Tell: they spread into their lanes, a faint dirt track ahead of each. Answer: step
//         into a gap between two lanes (one is always on you), or evade.
//   move2 Dig & Pop (goDig): he dives into the ground and a mound tunnels after the foe; it stops, the ground cracks
//         round it, and he bursts up in an uppercut that floors whoever's on the cracks. Tell: the mound stops and the
//         cracks spread. Answer: walk off the cracks (or evade as he pops). A miss leaves him dazed in his hole.
//   move3 defer Slam (goDefer): he hammers a stake into the floor in front of him; deferred, it goes off a moment
//         later in a ring of dirt that floors anyone inside. Tell: the stake ticks and its soft ring shadow spreads to
//         its full reach. Answer: get out of the ring. A trap that zones: one stake at a time.
//   evade Burrow (goBurrow): he ducks underground (untouchable) and pops up a short way the held way (none: away).
// Phases (f.ph): whistle, send · dive, tunnel, rumble, uppercut / dazed · hammer, slam · burrow, popup. Objects: gorun (a
// goroutine: ph 'spread' | 'run'; sx, sy its lane's start, a its way, ran how far it's run), gocrack (the cracks: R),
// gostake (ph 'tick' | 'boom'). Events: gorush, gonip (x, y: one nipped or popped), godig, gocrack, gopop (hit),
// godaze, gostake, goboom (hit), goburrow (x2, y2), goout.
import { clearance } from '../fight-arenas.js';
import { dist, gone, inside, landing, mine, open, sameGo, segDist, setPh, spawn, toward, turnTo } from './lib.js';

const ID = 'gopher';
const fighter = {
  id: ID, name: 'Gopher', lang: 'Go', role: 'Burrower', kit3: true,
  blurb: 'A busy little burrower: sends goroutines scurrying down lanes at you, tunnels up under your feet, and hammers in a stake that goes off later.',
  passive: 'Quick on his feet, and slips underground out of trouble.',
  balance: 'Not tuned for balance yet (2026-10-24, the user: "dont even think about balancing for now").',
  hp: 104, weight: 0.94, walk: 1.2, accel: 30, friction: 30, kbDecay: 3.1, radius: 16, slipMul: 0.2, reachBar: 0.85,
  moves: {
    move1: { name: 'Goroutine Rush', short: 'Goroutines', do: 'goRush', icon: 'goRush', hold: null,
      blurb: 'Four little gophers scurry out into four lanes beside him, then race down them at you, each nipping once.',
      tell: 'They spread out into their lanes first, a faint dirt track ahead of each.',
      answer: 'Step into a gap between two lanes (one runs right at you), or evade. He\'s open while they spread.',
      // n goroutines (radius r) out to lanes gap apart across his front (one through the foe), over the startup; then
      // they run speed u/s down their lanes, up to len; each nips once (damage, kb, a stun-s stagger)
      startup: 0.42, active: 0.06, recovery: 0.3, cooldown: 1.7, stale: false,
      damage: 9, kb: 150, stun: 0.45, n: 4, gap: 66, r: 6, speed: 300, len: 440 },
    move2: { name: 'Dig & Pop', short: 'Dig & Pop', do: 'goDig', icon: 'goDig', hold: null,
      blurb: 'Dives into the ground and tunnels after you. The mound stops, the ground cracks, and he bursts up in an uppercut.',
      tell: 'The mound stops under you and cracks spread round it.',
      answer: 'Walk off the cracks before he pops (or evade). Missing, he\'s dazed in his hole for a moment.',
      // the dive (startup), then tunnelling (untouchable) speed u/s at them, turning turn rad/s, for up to track s or
      // until within near; the cracks (R round the mound) for crack s; the pop: everyone on them floored
      startup: 0.22, active: 1.65, recovery: 0.35, miss: 0.8, cooldown: 2.2,
      damage: 16, kb: 235, kd: true, speed: 205, turn: 5, track: 1.05, near: 8, crack: 0.5, R: 40 },
    move3: { name: 'defer Slam', short: 'defer', do: 'goDefer', icon: 'goDefer', hold: null,
      blurb: 'Hammers a stake into the floor in front of him. Deferred: a moment later it goes off in a ring of dirt that floors anyone inside.',
      tell: 'The stake ticks and a soft ring shadow spreads round it to its full reach.',
      answer: 'Get out of the ring before it goes off. One stake at a time; he\'s open while he hammers.',
      // the hammer (startup), the stake at ahead units in front; delay s later it blows: R round it
      startup: 0.32, active: 0.06, recovery: 0.32, cooldown: 2.4,
      damage: 15, kb: 230, kd: true, ahead: 34, delay: 1.2, R: 92 },
    evade: { name: 'Burrow', short: 'Burrow', do: 'goBurrow', icon: 'goBurrow', hold: null,
      blurb: 'Ducks underground, untouchable, and pops up a short way the held way (or away from you).',
      tell: 'A little mound runs along the floor.', answer: 'Watch where the mound goes: he pops up open.',
      // underground active s (untouchable), dist units the held way; popping out recovery s (open); cooldown s after
      startup: 0, active: 0.42, recovery: 0.22, cooldown: 1.8, dist: 95 },
  },
  phPose: { whistle: 'whistle', send: 'send', dive: 'dig', tunnel: 'dig', rumble: 'dig', uppercut: 'uppercut', dazed: 'dazed', hammer: 'hammer', slam: 'slam', burrow: 'dig', popup: 'pop' },
  phFade: ['send', 'slam', 'popup', 'uppercut'],
  show: ['stand', 'whistle', 'stand', 'hammer', 'stand', 'uppercut', 'stand', 'pop'], cheer: 'uppercut',
};
const P = (a, b, inp) => [a, b, inp];
fighter.clips = {
  move1: { x: [-120, 40], len: 2.4, cam: { x: -30, w: 330 }, a: [P(0.3, 0.38, { light: 1 })] },
  move2: { x: [-120, 30], len: 2.8, cam: { x: -30, w: 300 }, a: [P(0.3, 0.38, { heavy: 1 })] },
  move3: { x: [-50, 30], len: 2.6, cam: { x: 0, w: 300 }, a: [P(0.3, 0.38, { special: 1 })] },
  evade: { x: [-40, 110], len: 2.4, cam: { x: 10, w: 300 }, a: [P(0.82, 0.88, { guard: 1, x: 0, y: -1 })], b: [P(0.3, 0.38, { light: 1 })] },   // (down out of Tux's toboggan)
};

// the goroutines' lanes: offsets across his front, one of them through the foe (which side the others go: by the go)
const laneOffs = (f, mv) => [...Array(mv.n)].map((_, k) => (k - (mv.n - 1) / 2) * mv.gap + (f.ms % 2 ? 1 : -1) * mv.gap / 2);
function pop(F, f, o, mv) {   // up out of the ground: everyone on the cracks floored (from below: no block)
  const ck = mine(F, f, 'gocrack'); if (ck) gone(ck);
  f.under = 0; f.inv = 0; f.vx = f.vy = 0;
  const d = dist(f, o);
  let hit = false;
  if (open(o) && d - o.r * 0.5 <= mv.R) hit = F.hitF(f, o, mv, { dir: d > 2 ? toward(f, o) : f.face, obj: true, unblockable: true, noFlank: true, move: 'move2' }) && F.lastRes === 'hit';
  f.hit = hit;
  F.ev('gopop', f.x, f.y, 0.9, f.i, { move: 'move2', hit });
  if (hit) { setPh(f, 'uppercut'); F.go(f, 'recover', mv.recovery); }
  else { setPh(f, 'dazed'); F.go(f, 'recover', mv.miss); F.ev('godaze', f.x, f.y, 0.4, f.i, { move: 'move2' }); }
}

const kits = {
  goRush: {
    press(F, f, o, mv) {
      setPh(f, 'whistle');
      const a = f.face, c = Math.cos(a), s = Math.sin(a);
      laneOffs(f, mv).forEach((off, k) => {
        const [sx, sy] = inside(F, f.x + c * (f.r + 6) - s * off, f.y + s * (f.r + 6) + c * off, mv.r + 4);
        spawn(F, f, { kind: 'gorun', r: mv.r, a, sx, sy, ph: 'spread', k, ran: 0 });
      });
    },
    start(F, f) {
      setPh(f, 'send');
      for (const b of F.objs) if (b.kind === 'gorun' && b.owner === f.i && b.ph === 'spread' && sameGo(f, b)) { b.ph = 'run'; b.x = b.sx; b.y = b.sy; b.mv = null; }
      F.ev('gorush', f.x, f.y, 0.6, f.i, { move: 'move1' });
    },
    phases: mv => [['whistle', 'wind', mv.startup, 'whistle', `${mv.n} goroutines spread into lanes ${mv.gap} apart`], ['send', 'strike', mv.active, 'send', `they run ${mv.speed} u/s, up to ${mv.len}`], ['send', 'recover', mv.recovery, 'send', '']],
  },
  goDig: {
    moves: true,
    press(F, f) { setPh(f, 'dive'); },
    start(F, f) { setPh(f, 'tunnel'); f.under = 1; f.inv = Math.max(f.inv, 2 / 60); F.ev('godig', f.x, f.y, 0.6, f.i, { move: 'move2' }); },
    step(F, f, o, mv, dt) {
      f.under = 1; f.inv = Math.max(f.inv, 2 / 60);
      if (f.ph === 'tunnel') {
        f.face = turnTo(f.face, toward(f, o), mv.turn * dt);
        f.vx = Math.cos(f.face) * mv.speed; f.vy = Math.sin(f.face) * mv.speed;
        if (dist(f, o) <= mv.near || f.t >= mv.track) {
          f.vx = f.vy = 0; setPh(f, 'rumble');
          spawn(F, f, { kind: 'gocrack', R: mv.R, life: mv.crack + 0.3 });
          F.ev('gocrack', f.x, f.y, 0.5, f.i, { move: 'move2' });
        }
      } else if (f.ph === 'rumble') { f.vx = f.vy = 0; if (f.pht >= mv.crack - 1e-9) pop(F, f, o, mv); }
    },
    end(F, f, o, mv) { pop(F, f, o, mv); return true; },
    phases: mv => [['dive', 'wind', mv.startup, 'dig', 'dives head first'], ['tunnel', 'strike', `up to ${mv.track}`, '(a mound)', `${mv.speed} u/s at them, untouchable`], ['rumble', 'strike', mv.crack, '(a mound)', `the cracks (R ${mv.R})`],
      ['uppercut', 'recover', mv.recovery, 'uppercut', 'hit'], ['dazed', 'recover', mv.miss, 'dazed', 'missed: open']],
  },
  goDefer: {
    can(F, f) { return !mine(F, f, 'gostake'); },
    press(F, f) { setPh(f, 'hammer'); },
    start(F, f, o, mv) {
      setPh(f, 'slam');
      const [x, y] = inside(F, f.x + Math.cos(f.face) * (f.r + mv.ahead), f.y + Math.sin(f.face) * (f.r + mv.ahead), 10);
      spawn(F, f, { kind: 'gostake', x, y, R: mv.R, ph: 'tick', mv: null });
      F.ev('gostake', x, y, 0.5, f.i, { move: 'move3' });
    },
    phases: mv => [['hammer', 'wind', mv.startup, 'hammer', 'paws up: open'], ['slam', 'strike', mv.active, 'slam', 'the stake goes in'], ['slam', 'recover', mv.recovery, 'slam', ''], ['(the stake)', '', mv.delay, '', `ticks, then a ring R ${mv.R}`]],
  },
  goBurrow: {
    moves: true,
    start(F, f, o, mv) {
      const c = F.ctl(f), a = c.mag > 0.3 ? c.dirA : toward(o, f), [x, y] = landing(F, f, o, a, mv.dist);
      setPh(f, 'burrow'); f.under = 1; f.inv = Math.max(f.inv, 2 / 60); f.face = a;
      f.bx = x; f.by = y; f.vx = (x - f.x) / mv.active; f.vy = (y - f.y) / mv.active;
      F.ev('goburrow', f.x, f.y, 0.5, f.i, { move: 'evade', x2: x, y2: y });
    },
    step(F, f, o, mv, dt) { f.under = 1; f.inv = Math.max(f.inv, 2 / 60); const left = Math.max(dt, f.dur - f.t + dt); f.vx = (f.bx - f.x) / left; f.vy = (f.by - f.y) / left; },   // (steered onto the spot: it gets there)
    end(F, f, o, mv) { f.under = 0; f.inv = 0; f.vx *= 0.15; f.vy *= 0.15; setPh(f, 'popup'); F.go(f, 'recover', mv.recovery); F.ev('goout', f.x, f.y, 0.5, f.i, { move: 'evade' }); return true; },
    phases: mv => [['burrow', 'strike', mv.active, 'dig', `underground, ${mv.dist} the held way: untouchable`], ['popup', 'recover', mv.recovery, 'pop', 'pops up: open']],
  },
};

const objs = {
  // a goroutine: scurrying out to its lane's start while he whistles (gone if he's hit out of it), then down its lane
  gorun(F, ob, dt, own, foe, M) {
    const mv = M.move1;
    if (ob.ph === 'spread') {
      if (!(sameGo(own, ob) && own.state === 'wind')) { gone(ob); F.ev('gonip', ob.x, ob.y, 0.3, ob.owner, { move: 'move1' }); return; }
      const k = Math.min(1, dt * 12); ob.x += (ob.sx - ob.x) * k; ob.y += (ob.sy - ob.y) * k;
      return;
    }
    const step = mv.speed * dt;
    ob.x += Math.cos(ob.a) * step; ob.y += Math.sin(ob.a) * step; ob.ran += step;
    if (ob.ran >= mv.len || F.contactsAll(ob.x, ob.y, ob.r).length) { gone(ob); F.ev('gonip', ob.x, ob.y, 0.3, ob.owner, { move: 'move1' }); return; }
    if (!ob.hit && open(foe) && foe.inv <= 0 && !foe.under && Math.hypot(foe.x - ob.x, foe.y - ob.y) <= ob.r + foe.r) {
      if (F.hitF(own, foe, mv, { dir: ob.a, obj: true, move: 'move1' })) { ob.hit = true; gone(ob); F.ev('gonip', ob.x, ob.y, 0.6, ob.owner, { move: 'move1', hit: F.lastRes === 'hit' }); }
    }
  },
  gocrack() {},
  // the deferred stake: ticking, then the ring of dirt (once), then it fades
  gostake(F, ob, dt, own, foe, M) {
    const mv = M.move3;
    if (ob.ph !== 'tick' || ob.t < mv.delay) return;
    ob.ph = 'boom'; ob.life = ob.t + 0.45;
    const d = Math.hypot(foe.x - ob.x, foe.y - ob.y);
    let hit = false;
    if (open(foe) && !foe.under && d - foe.r * 0.5 <= ob.R) hit = F.hitF(own, foe, mv, { dir: d > 2 ? Math.atan2(foe.y - ob.y, foe.x - ob.x) : own.face, obj: true, unblockable: true, noFlank: true, move: 'move3' }) && F.lastRes === 'hit';
    ob.hit = hit;
    F.ev('goboom', ob.x, ob.y, 1, ob.owner, { move: 'move3', hit });
  },
};

// ---------------------------------------------------------------- the bot
const ai = {
  want: 150,
  // Gopher's tells, for the other bot: the goroutines' lanes, the cracks, the stake's ring
  threats(F, i, me, o) {
    const out = [], ow = F.f[1 - i], M = ow.stats.moves;
    for (const b of F.objs) {
      if (b.owner === i || b.t < o.age || b.t >= b.life) continue;
      const d = Math.hypot(me.x - b.x, me.y - b.y), away = Math.atan2(me.y - b.y, me.x - b.x);
      if (b.kind === 'gorun') {   // in its lane, ahead of it: sideways into the nearer gap
        const x0 = b.ph === 'run' ? b.x : b.sx, y0 = b.ph === 'run' ? b.y : b.sy, left = M.move1.len - b.ran;
        const x1 = x0 + Math.cos(b.a) * left, y1 = y0 + Math.sin(b.a) * left, [lat, u] = segDist(me.x, me.y, x0, y0, x1, y1);
        const need = b.r + me.r + 5 - lat;
        if (need <= 0 || u >= 1) continue;
        const side = Math.sign(Math.sin(Math.atan2(me.y - y0, me.x - x0) - b.a)) || (b.k < 2 ? -1 : 1);
        const T = (b.ph === 'spread' && ow.state === 'wind' ? Math.max(0, ow.dur - ow.t) : 0) + Math.max(0, u * left - me.r) / M.move1.speed;
        out.push(['g' + b.id, T, 0.08, b.a + side * Math.PI / 2, need]);
      } else if (b.kind === 'gocrack') {
        const need = b.R + me.r * 0.5 + 5 - d;
        if (need > 0) out.push(['c' + b.id, Math.max(0, M.move2.crack - b.t), 0.08, away, need]);
      } else if (b.kind === 'gostake' && b.ph === 'tick') {
        const need = b.R + me.r * 0.5 + 6 - d;
        if (need > 0) out.push(['k' + b.id, Math.max(0, M.move3.delay - b.t), 0.08, away, need]);
      }
    }
    return out;
  },
  punish(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap } = C.g;
    if (C.ready(0) && w.line && d < 260 && w.fits(M.move1.startup + Math.max(0, gap - 10) / M.move1.speed)) { C.fire(0); return C.unit(C.g.toFoe); }
    if (C.ready(1) && w.fits(M.move2.startup + d / M.move2.speed + M.move2.crack)) { C.fire(1); return [0, 0]; }
    if (C.ready(2) && gap < 40 && w.fits(M.move3.startup + M.move3.active + M.move3.delay)) { C.fire(2); return C.unit(C.g.toFoe); }
    return null;
  },
  neutral(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap, toFoe, A } = C.g;
    const oc = clearance(A, o.x, o.y, o.r);
    w.add(0, d > 70 && d < 330 ? (w.busy ? 0.3 : 0.17) : 0, C.unit(toFoe));
    w.add(1, d > 60 && d < 300 ? (w.busy || o.state === 'recover' ? 0.3 : 0.1) : 0, [0, 0]);
    w.add(2, gap < 70 ? 0.22 : oc.d < 60 && d < 160 ? 0.15 : 0, C.unit(toFoe));   // (in their face, or them by a wall)
  },
  // in the stake's ring himself (his own, it doesn't hurt him): nothing to fear. The burrow: untouchable through it
  evadeWhen(T, dur, E) { return [T > 0.02 && T + dur < E.active - 0.04, T + dur < E.active - 0.04]; },
};
export default { id: ID, fighter, kits, objs, ai };
