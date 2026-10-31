// @ts-check
// Gopher (Go) for Fight: three moves and an evade (plug-in shape: js/kits/index.js; drawing: js/art/kit-gopher.js). The
// busy burrower: concurrency, digging and getting you stuck.
// move1 Dig & Pop (goDig): a hit. A crouch, paws scrabbling (0.16 s), then a huge uppercut out of the ground under
// whoever's right in front: launched and floored. No aim, no floor tell. Answer: spacing (point-blank only). A miss:
// open in his hole. Harder (pitDmg) on someone stuck in Deadlock's hole.
// move2 Goroutine Rush (goRush): four little gophers scurry out to four lanes, then run down them at the foe, each
// nipping once. Tell: a faint dirt track ahead of each. Answer: step into a gap (one lane is always on you), or evade.
// move3 Deadlock (goLock): he rears up (aimed like Octo's blame) and slams the ground; a crack races along the floor
// that way (speed u/s, up to len). It reaches them: they sink to the waist, stuck (state 'dizzy': no walking, no evade)
// for stuck s. His payoff: over to them and Dig & Pop up under them; from afar the goroutines. Anything that hits them
// knocks them out. Answer: step off its straight line, or evade over it. A miss: panting, open (miss s). Not on someone
// just up off a knockdown (fight.js safeT) or just out of one of his holes (free s: no chains); hitting him stops it.
// evade Burrow (goBurrow): underground (untouchable), tunnelling the held way (none: away), steered as he goes, up to
// its cap, then he pops up, open. Burrow then Pop: Dig & Pop pressed underground cancels into the uppercut where he is
// (the mound stops and rumbles: still untouchable, Dig & Pop's startup). Answer: back off a mound that stops close, or
// meet him where it ends. Underground nothing touches him (f.under and f.inv: hitF turns every hit, throw, wave and
// gust away), so his bot digs in under zoners' shots at them (ai.evadeWay). Not a hiding place: it ends on its own and
// he surfaces slowly, open. Out of the ground Dig & Pop hits harder and wider.
// Phases (f.ph): scoop (or rumble), pop, uppercut / whiff · whistle, send · rear, slam, pant · burrow, popup. Objects:
// gocrack (the heave where he bursts out: R; drawing only), gorun (a goroutine: ph 'spread' | 'run'; sx, sy lane start,
// a, ran), godl (the crack: x0, y0, a, ran, x, y its head; ph 'run' | 'caught' | 'out'), gopit (the hole: to, ph
// 'stuck' | 'open', x, y). Events: goscoop, gorumble, goburst (x, y), gopop (hit), gorush, gonip (x, y), goslam, gocave
// (to), gofizz, goclimb (to, hit), goburrow (x2, y2), goout.
import { Math } from '../detmath.js';
import { clearance } from '../fight-arenas.js';
import { D2R, angDiff, clamp, dist, gone, inside, open, sameGo, segDist, setPh, spawn, toward } from './lib.js';

const ID = 'gopher';
/** @type {import('./index.js').FighterData} */
const fighter = {
  id: ID, name: 'Gopher', lang: 'Go', role: 'Burrower',
  blurb: 'A busy little burrowing ambusher: tunnels under you and bursts up out of the ground in an uppercut, sends goroutines scurrying down lanes at you, and cracks the floor open under your feet to get you stuck.',
  tagline: 'Burrowing ambusher: uppercuts from underground, goroutines, a crack in the floor.',
  difficulty: 'medium',
  passive: 'Quick on his feet, and slips underground out of trouble.',
  balance: 'Burrower: the goroutines take the space, Deadlock gets you stuck in the ground and the Dig & Pop (harder out of a Burrow, and on someone in a hole) is his payoff up close. Careless players walk into the lanes and the crack, so he does better against them: about 47% (Chill) to 48% (Ruthless) of bot fights, 2026-10-26 (all 4 arenas, 24 fights a pair; 56 / 40 with defer Slam before it). Duke\'s mitt and quick feet are his worst matchup (~5% at Ruthless). 2026-10-29, the balance pass (all four arenas, 40 fights a pair, about ±5): 66% Chill, 55% Normal, 45% Ruthless (health 104 -> 107, Dig & Pop missed 0.55 -> 0.45 s open, Burrow\'s pop-up 0.4 -> 0.3, Deadlock\'s pant 0.4 -> 0.3: he was bottom at Ruthless, where every miss got punished). Careless bots still walk into his lanes and cracks, so he\'s best at Chill.',
  hp: 107, weight: 0.94, walk: 1.2, accel: 30, friction: 30, kbDecay: 3.1, radius: 16, slipMul: 0.2,
  moves: {
    move1: { name: 'Dig & Pop', short: 'Dig & Pop', do: 'goDig', icon: 'goDig', hold: null,
      blurb: 'Digs in at his feet for an instant, then bursts up out of the ground in a huge uppercut that launches you. Close range only; harder on someone stuck in a hole.',
      tell: 'He drops into a crouch, paws scrabbling, earth flying back off them. It comes out almost at once. Out of a Burrow: the mound stops and rumbles.',
      answer: 'Keep out of his reach: it only hits in front of him, a little way out (back off a mound that stops close). Missing, he\'s left standing in his hole, open.',
      // the crouch (startup), then the uppercut over active s, rising rise u/s ahead: whoever's within reach of his edge
      // and in front of him (arc degrees) is launched (damage, kb, down); a hit: recovery s, a miss: miss s open
      // (deepDmg, deepReach: bursting up out of a burrow, harder and wider; pitDmg more on someone stuck in Deadlock's hole)
      startup: 0.16, active: 0.1, recovery: 0.3, miss: 0.45, cooldown: 1.5, contact: true,
      damage: 15, kb: 300, kd: true, reach: 36, arc: 150, rise: 110, deepDmg: 21, deepReach: 50, pitDmg: 6 },
    move2: { name: 'Goroutine Rush', short: 'Goroutines', do: 'goRush', icon: 'goRush', hold: null,
      blurb: 'Four little gophers scurry out into four lanes beside him, then race down them at you, each nipping once.',
      tell: 'They spread out into their lanes first, a faint dirt track ahead of each.',
      answer: 'Step into a gap between two lanes (one runs right at you), or evade. He\'s open while they spread.',
      // n goroutines (radius r) out to lanes gap apart across his front (one through the foe), over the startup; then
      // they run speed u/s down their lanes, up to len; each nips once (damage, kb, a stun-s stagger)
      startup: 0.42, active: 0.06, recovery: 0.3, cooldown: 1.7, stale: false,
      damage: 7.5, kb: 150, stun: 0.45, n: 4, gap: 62, r: 6, speed: 300, len: 440 },
    move3: { name: 'Deadlock', short: 'Deadlock', do: 'goLock', icon: 'goLock', hold: null,
      blurb: 'He slams his paws into the ground and a crack races along the floor at you. If it reaches you the ground caves in round your feet: stuck in it to the waist for a moment while he comes for you.',
      tell: 'He rears up, paws high, then slams them down: a crack of splitting earth comes racing along the floor in a straight line.',
      answer: 'Step off its line (or evade over it) before it reaches you. If it runs out he\'s left panting, open.',
      // the rear (startup: aimed, turning aimTurn rad/s, a player's on them with the held way an offset; settled the last
      // lock s), then the crack from his edge at speed u/s, up to len (a wall stops it): it catches whoever it reaches
      // within w of its line (+ 0.6 of their radius): damage, then stuck s in the hole (no re-sticking for free s after).
      // He holds his paws in the ground while it runs: caught, recovery s; it runs out, miss s panting. Active: only a cap
      startup: 0.4, lock: 0.1, active: 0.8, recovery: 0.12, miss: 0.3, cooldown: 2.8, aimTurn: 3.4,
      damage: 5, kb: 0, stun: 0.1, speed: 450, len: 300, w: 15, stuck: 1.2, free: 1.6 },
    evade: { name: 'Burrow', short: 'Burrow', do: 'goBurrow', icon: 'goBurrow', hold: null,
      blurb: 'Ducks underground, untouchable (shots and gusts pass over him), and tunnels off the held way (or away from you), steering as he goes. Press Dig & Pop while he\'s under to burst up into a harder uppercut right there.',
      tell: 'A mound runs along the floor, turning where he steers it, loose earth left behind it; it stops and rumbles if he\'s about to burst up.',
      answer: 'Watch where the mound goes and back off one that comes at you: it can only run so far, and he pops up slowly at the end, shaking the dirt off: hit him then. Don\'t let it stop right next to you.',
      // underground active s (untouchable), dist units at most, set off the held way and steered up to steer rad/s
      // (eased: f.aimW); popping out recovery s (open); cooldown s after
      startup: 0, active: 0.75, recovery: 0.3, cooldown: 1.7, dist: 174, steer: 3.2 },
  },
  phPose: { scoop: 'scoop', rumble: 'dig', pop: 'uppercut', uppercut: 'uppercut', whiff: 'dazed', whistle: 'whistle', send: 'send', rear: 'rear', slam: 'slam', pant: 'pant', burrow: 'dig', popup: 'pop' },
  phFade: ['send', 'slam', 'popup', 'uppercut'],
  // (dug: the next Dig & Pop comes up out of a burrow; aimW: the burrow's steering and Deadlock's aim turn rate; dlNo:
  // s left that his crack can't catch anyone)
  fields: { dug: 0, aimW: 0, deep: 0, dlNo: 0 },
  tick(F, f, dt) { if (f.dlNo > 0) f.dlNo = Math.max(0, f.dlNo - dt); },
  show: ['stand', 'whistle', 'stand', 'rear', 'stand', 'uppercut', 'stand', 'pop'], cheer: 'uppercut',
};
const P = (a, b, inp) => [a, b, inp];
fighter.clips = {
  move1: { x: [-24, 22], len: 2.2, cam: { x: 0, w: 230 }, a: [P(0.3, 0.38, { light: 1 })] },   // (point-blank)
  move2: { x: [-120, 40], len: 2.4, cam: { x: -30, w: 330 }, a: [P(0.3, 0.38, { heavy: 1 })] },
  // (the crack reaches them; he burrows over and bursts up under them while they're stuck)
  move3: { x: [-110, 40], len: 3.2, cam: { x: -30, w: 330 }, a: [P(0.3, 0.38, { special: 1 }), P(1.3, 1.36, { guard: 1, x: 1 }), P(1.82, 1.9, { light: 1 })] },
  // (Burrow then Pop: under, the mound runs in at them and stops, and he bursts up into the uppercut)
  evade: { x: [-100, 30], len: 2.2, cam: { x: -25, w: 280 }, a: [P(0.3, 0.36, { guard: 1, x: 1 }), P(0.66, 0.72, { light: 1 })] },
};
// Burrow then Pop: Dig & Pop pressed (buffered) while he's underground goes now, off its cooldown, out of the burrow
// (the evade's cooldown runs from here). True if it did
function popOut(F, f) {
  const mv = f.stats.moves.move1;
  if (f.bufK !== 'light' || f.cd[0] > 0 || f.lockT > 0) return false;
  f.bufK = ''; f.bufT = 0; f.dug = 1;
  F.startMove(f, 'move1'); f.cd[0] = mv.cooldown || 0;
  return true;
}

// the goroutines' lanes: offsets across his front, one of them through the foe (which side the others go: by the go)
const laneOffs = (f, mv) => [...Array(mv.n)].map((_, k) => (k - (mv.n - 1) / 2) * mv.gap + (f.ms % 2 ? 1 : -1) * mv.gap / 2);
// the hole fighter o is stuck in right now (Deadlock's), if any
export const pitOf = (F, o) => F.objs.find(b => b.kind === 'gopit' && b.ph === 'stuck' && b.to === o.i && b.t < b.life) || null;
// Dig & Pop's uppercut: whoever's within reach of his edge and in front of him (true if it connected); out of a burrow
// deepDmg and deepReach, on someone in a hole pitDmg more
const popMv = (F, f, o, mv) => { const m = f.deep ? { ...mv, damage: mv.deepDmg, reach: mv.deepReach } : mv; return pitOf(F, o) ? { ...m, damage: m.damage + mv.pitDmg } : m; };
function upper(F, f, o, mv0) {
  if (!open(o) || o.under) return false;
  const mv = popMv(F, f, o, mv0);
  const d = dist(f, o);
  if (d - f.r - o.r > mv.reach || Math.abs(angDiff(toward(f, o), f.face)) > mv.arc * D2R / 2 + Math.atan2(o.r, Math.max(d, 1))) return false;
  const pit = !!pitOf(F, o);
  if (!F.hitF(f, o, mv, { dir: f.face, move: 'move1' })) return false;
  const hit = F.lastRes === 'hit';
  if (hit) F.hitstop = Math.max(F.hitstop, (pit ? 11 : 8) / 60);   // (a solid smack; out of a hole, a bigger one)
  F.ev('gopop', o.x, o.y, hit ? 1 : 0.5, f.i, { move: 'move1', hit, pit });
  return true;
}
// Deadlock: can the crack catch o now (on the ground and touchable, not just up off a knockdown or out of a hole of his)
const STUCKLESS = new Set(['down', 'getup', 'grabbed', 'frozen', 'ko', 'dizzy', 'win']);
const catchable = (own, o) => open(o) && o.z < 6 && !o.air && o.inv <= 0 && !o.under && !(o.safeT > 0) && !(own.dlNo > 0) && !STUCKLESS.has(o.state);
// the crack's aim while he rears (as Octo's blame): a player's on them, led a little, the held way an offset; a bot's
// turns the way its stick holds
function aimLock(F, f, o, c, turn, dt, lead) {
  const toO = Math.atan2(o.y + o.vy * lead - f.y, o.x + o.vx * lead - f.x);
  let want = f.face;
  if (F.cfg.bots[f.i] == null) want = toO + (c.mag > 0.3 ? clamp(angDiff(c.dirA, toO), -1.2, 1.2) * Math.min(1, c.mag) * 0.75 : 0);
  else if (c.mag > 0.3) want = c.dirA;
  const w = clamp(angDiff(want, f.face) * 8, -turn, turn);
  f.aimW = (f.aimW || 0) + (w - (f.aimW || 0)) * Math.min(1, dt * 12);
  f.face += f.aimW * dt;
}

/** @type {Record<string, import('./index.js').Kit>} */
const kits = {
  goDig: {
    moves: true,
    press(F, f) {   // the crouch; out of a burrow, the mound stops and rumbles (he stays under: untouchable)
      const dug = f.dug; f.dug = 0; f.deep = dug ? 1 : 0;
      if (dug) { setPh(f, 'rumble'); f.under = 1; f.inv = Math.max(f.inv, 2 / 60); f.vx = f.vy = 0; F.ev('gorumble', f.x, f.y, 0.5, f.i, { move: 'move1' }); }
      else { setPh(f, 'scoop'); F.ev('goscoop', f.x, f.y, 0.4, f.i, { move: 'move1' }); }
    },
    wind(F, f) { f.vx = f.vy = 0; if (f.ph === 'rumble') { f.under = 1; f.inv = Math.max(f.inv, 2 / 60); } },
    start(F, f, o, mv0) {   // up out of the ground: the earth heaving up in front of him
      const mv = popMv(F, f, o, mv0);
      if (f.ph === 'rumble') { f.under = 0; f.inv = 0; F.ev('goout', f.x, f.y, 0.6, f.i, { move: 'move1' }); }
      setPh(f, 'pop');
      const a = f.face, [x, y] = inside(F, f.x + Math.cos(a) * (f.r + mv.reach * 0.7), f.y + Math.sin(a) * (f.r + mv.reach * 0.7), 4);
      spawn(F, f, { kind: 'gocrack', x, y, R: mv.reach + 6, life: 0.6, mv: null });
      F.ev('goburst', x, y, 0.8, f.i, { move: 'move1' });
    },
    step(F, f, o, mv) {
      const u = Math.min(1, f.t / mv.active);
      f.vx = Math.cos(f.face) * mv.rise * (1 - u); f.vy = Math.sin(f.face) * mv.rise * (1 - u);
      if (!f.hit && upper(F, f, o, mv)) { f.hit = true; f.vx = f.vy = 0; setPh(f, 'uppercut'); F.go(f, 'recover', mv.recovery); }
    },
    end(F, f, o, mv) { f.vx *= 0.2; f.vy *= 0.2; setPh(f, 'whiff'); F.go(f, 'recover', mv.miss); F.ev('gopop', f.x, f.y, 0.3, f.i, { move: 'move1', hit: false }); return true; },
    wall(F, f) { f.vx = f.vy = 0; return true; },
    phases: mv => [['scoop', 'wind', mv.startup, 'scoop', 'a crouch, paws scrabbling at the ground'], ['rumble', 'wind', mv.startup, '(underground)', 'out of a Burrow instead: the mound stops and rumbles, untouchable'], ['pop', 'strike', mv.active, 'uppercut', `bursts up, ${Math.round(mv.rise * mv.active / 2)} ahead: reach ${mv.reach}, ${mv.arc}° in front, launches (${mv.pitDmg} more on someone stuck in a hole)`],
      ['uppercut', 'recover', mv.recovery, 'uppercut', 'hit'], ['whiff', 'recover', mv.miss, 'dazed', 'missed: standing in his hole, open']],
  },
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
      F.ev('gorush', f.x, f.y, 0.6, f.i, { move: 'move2' });
    },
    phases: mv => [['whistle', 'wind', mv.startup, 'whistle', `${mv.n} goroutines spread into lanes ${mv.gap} apart`], ['send', 'strike', mv.active, 'send', `they run ${mv.speed} u/s, up to ${mv.len}`], ['send', 'recover', mv.recovery, 'send', '']],
  },
  goLock: {
    moves: true,
    press(F, f, o) {
      setPh(f, 'rear'); f.aimW = 0; f.vx *= 0.3; f.vy *= 0.3;
      if (F.cfg.bots[f.i] == null) f.face = toward(f, o);   // (a player's aim starts on them)
    },
    wind(F, f, o, mv, dt, c) {
      f.vx *= 0.8; f.vy *= 0.8;
      if (f.t < f.dur - mv.lock) aimLock(F, f, o, c, mv.aimTurn, dt, 0.5 * (Math.max(0, f.dur - f.t) + Math.max(0, dist(f, o) - f.r - o.r) / mv.speed));
      else f.aimW = 0;
    },
    start(F, f, o, mv) {   // paws in: the crack sets off from his edge
      setPh(f, 'slam'); f.vx = f.vy = 0;
      const c = Math.cos(f.face), s = Math.sin(f.face), x0 = f.x + c * (f.r + 4), y0 = f.y + s * (f.r + 4);
      spawn(F, f, { kind: 'godl', x0, y0, x: x0, y: y0, a: f.face, ran: 0, ph: 'run' });
      F.ev('goslam', x0, y0, 0.7, f.i, { move: 'move3', a: f.face });
    },
    step(F, f) {   // paws held in the ground while it runs: caught, quickly up; it ran out, panting
      f.vx = f.vy = 0;
      const ob = F.objs.find(b => b.kind === 'godl' && b.owner === f.i && sameGo(f, b));
      if (ob && ob.ph === 'run') return;
      const mv = f.stats.moves.move3;
      if (ob && ob.ph === 'caught') F.go(f, 'recover', mv.recovery);
      else { setPh(f, 'pant'); F.go(f, 'recover', mv.miss); }
    },
    end(F, f, o, mv) { setPh(f, 'pant'); F.go(f, 'recover', mv.miss); return true; },
    wall(F, f) { f.vx = f.vy = 0; return true; },
    phases: mv => [['rear', 'wind', mv.startup, 'rear', `paws up, aimed (${mv.aimTurn} rad/s, settled the last ${mv.lock} s)`], ['slam', 'strike', `up to ${(mv.len / mv.speed).toFixed(2)}`, 'slam', `the crack races ${mv.speed} u/s, up to ${mv.len}: who it reaches sinks in, stuck ${mv.stuck} s`],
      ['slam', 'recover', mv.recovery, 'slam', 'it caught them: up'], ['pant', 'recover', mv.miss, 'pant', 'it ran out: panting, open']],
  },
  goBurrow: {
    moves: true,
    start(F, f, o, mv) {
      const c = F.ctl(f), a = c.mag > 0.3 ? c.dirA : toward(o, f);
      setPh(f, 'burrow'); f.under = 1; f.inv = Math.max(f.inv, 2 / 60); f.face = a; f.aimW = 0;
      const sp = mv.dist / mv.active; f.vx = Math.cos(a) * sp; f.vy = Math.sin(a) * sp;
      F.ev('goburrow', f.x, f.y, 0.5, f.i, { move: 'evade', x2: f.x + Math.cos(a) * mv.dist, y2: f.y + Math.sin(a) * mv.dist });
    },
    step(F, f, o, mv, dt, c) {   // tunnelling on, steered the held way (eased, like Cpp's leak), at most dist all told
      if (popOut(F, f)) return;
      f.under = 1; f.inv = Math.max(f.inv, 2 / 60);
      const rate = c.mag > 0.3 ? Math.max(-mv.steer, Math.min(mv.steer, angDiff(c.dirA, f.face) * 6)) : 0;
      f.aimW = (f.aimW || 0) + (rate - (f.aimW || 0)) * Math.min(1, dt * 9); f.face += f.aimW * dt;
      const sp = mv.dist / mv.active; f.vx = Math.cos(f.face) * sp; f.vy = Math.sin(f.face) * sp;
    },
    wall(F, f, c) {   // along the wall, not into it
      const vn = Math.cos(f.face) * c.nx + Math.sin(f.face) * c.ny;
      if (vn < 0) { const tx = Math.cos(f.face) - vn * c.nx, ty = Math.sin(f.face) - vn * c.ny; f.face = Math.hypot(tx, ty) > 0.05 ? Math.atan2(ty, tx) : Math.atan2(c.ny, c.nx) + Math.PI / 2; }
      return true;
    },
    end(F, f, o, mv) { f.under = 0; f.inv = 0; f.vx *= 0.15; f.vy *= 0.15; setPh(f, 'popup'); F.go(f, 'recover', mv.recovery); F.ev('goout', f.x, f.y, 0.5, f.i, { move: 'evade' }); return true; },
    phases: mv => [['burrow', 'strike', mv.active, 'dig', `underground, up to ${mv.dist} (${Math.round(mv.dist / mv.active)} u/s), steered ${mv.steer} rad/s: untouchable (Dig & Pop now: up into the uppercut right there)`], ['popup', 'recover', mv.recovery, 'pop', 'pops up: open']],
  },
};

/** @type {Record<string, import('./index.js').ObjStep>} */
const objs = {
  gocrack() {},
  // a goroutine: scurrying out to its lane's start while he whistles (gone if he's hit out of it), then down its lane
  gorun(F, ob, dt, own, foe, M) {
    const mv = M.move2;
    if (ob.ph === 'spread') {
      if (!(sameGo(own, ob) && own.state === 'wind')) { gone(ob); F.ev('gonip', ob.x, ob.y, 0.3, ob.owner, { move: 'move2' }); return; }
      const k = Math.min(1, dt * 12); ob.x += (ob.sx - ob.x) * k; ob.y += (ob.sy - ob.y) * k;
      return;
    }
    const step = mv.speed * dt;
    ob.x += Math.cos(ob.a) * step; ob.y += Math.sin(ob.a) * step; ob.ran += step;
    if (ob.ran >= mv.len || F.contactsAll(ob.x, ob.y, ob.r).length) { gone(ob); F.ev('gonip', ob.x, ob.y, 0.3, ob.owner, { move: 'move2' }); return; }
    if (!ob.hit && open(foe) && foe.inv <= 0 && !foe.under && Math.hypot(foe.x - ob.x, foe.y - ob.y) <= ob.r + foe.r) {
      if (F.hitF(own, foe, mv, { dir: ob.a, obj: true, move: 'move2' })) { ob.hit = true; gone(ob); F.ev('gonip', ob.x, ob.y, 0.6, ob.owner, { move: 'move2', hit: F.lastRes === 'hit' }); }
    }
  },
  // Deadlock's crack: racing on from his paws (gone quiet if he's hit out of it), catching whoever it reaches near its
  // line (the ground caves in under them: a gopit), else running out at its length or a wall; then it lingers, fading
  godl(F, ob, dt, own, foe, M) {
    if (ob.ph !== 'run') return;
    const mv = M.move3, out = () => { ob.ph = 'out'; ob.life = ob.t + 0.8; F.ev('gofizz', ob.x, ob.y, 0.4, ob.owner, { move: 'move3' }); };
    if (!(sameGo(own, ob) && own.state === 'strike')) { out(); return; }
    const c = Math.cos(ob.a), s = Math.sin(ob.a), from = ob.ran, step = Math.min(mv.speed * dt, mv.len - ob.ran);
    ob.ran += step; ob.x = ob.x0 + c * ob.ran; ob.y = ob.y0 + s * ob.ran;
    const rx = foe.x - ob.x0, ry = foe.y - ob.y0, along = rx * c + ry * s, lat = Math.abs(-rx * s + ry * c);
    if (along >= from - foe.r && along <= ob.ran + foe.r * 0.5 && lat <= mv.w + foe.r * 0.6 && catchable(own, foe)) {
      const ok = F.hitF(own, foe, mv, { dir: ob.a, obj: true, unblockable: true, noFlank: true, move: 'move3' });
      if (ok && F.lastRes === 'hit' && foe.state !== 'ko') {   // (the ground caves in under them: stuck, pinned in the hole)
        F.release(foe); foe.move = null; foe.ph = ''; foe.vx = foe.vy = 0;
        const [x, y] = inside(F, foe.x, foe.y, foe.r);
        foe.x = x; foe.y = y; F.go(foe, 'dizzy', mv.stuck);
        ob.ph = 'caught'; ob.hit = true; ob.ran = Math.max(0, along); ob.x = ob.x0 + c * ob.ran; ob.y = ob.y0 + s * ob.ran; ob.life = ob.t + mv.stuck + 0.6;
        spawn(F, own, { kind: 'gopit', x, y, to: foe.i, ph: 'stuck', r: foe.r, mv: null });
        F.ev('gocave', x, y, 0.9, ob.owner, { move: 'move3', to: foe.i });
        return;
      }
      if (ok) { out(); return; }   // (it connected with something that took it: an ice block, a guard: it breaks there)
    }
    if (ob.ran >= mv.len - 1e-6 || F.contactsAll(ob.x, ob.y, 3).length) out();
  },
  // the hole they're stuck in: holding them in place while they're stuck; knocked out of it (or free), it stays open a
  // moment, and his crack can't catch them again for free s
  gopit(F, ob, dt, own) {
    if (ob.ph !== 'stuck') return;
    const o = F.f[ob.to], mv = own.stats.moves.move3;
    if (o.state === 'dizzy' && ob.t < mv.stuck + 0.05) { o.x = ob.x; o.y = ob.y; o.vx = o.vy = 0; return; }
    ob.ph = 'open'; ob.life = ob.t + 1.2; own.dlNo = mv.free;
    F.ev('goclimb', ob.x, ob.y, 0.5, ob.owner, { move: 'move3', to: o.i, hit: o.state !== 'idle' && o.state !== 'walk' });
  },
};

// ---------------------------------------------------------------- the bot
// his crack got them stuck (he knows at once): over and up under them with Dig & Pop (a Burrow if walking won't make
// it), or the goroutines from too far off; whether at all, decided once a hole (C.link). The walk, or null
function pitFollow(F, i, me, o, C) {
  const live = C.live, pit = pitOf(F, live); if (!pit || pit.owner !== i) return null;
  const K = C.K, M = me.stats.moves, P1 = M.move1, E = M.evade, left = M.move3.stuck - pit.t;
  if (K.dlFor !== pit.id) { K.dlFor = pit.id; K.dlGo = C.link(0.55 + 0.45 * C.L.combo); }
  if (!K.dlGo || left < 0.12) return null;
  const dx = live.x - me.x, dy = live.y - me.y, d = Math.hypot(dx, dy), gap = d - me.r - live.r, a = Math.atan2(dy, dx);
  if (C.ready(0) && gap < P1.reach - 4) { if (left > P1.startup + 0.04) C.fire(0); return C.unit(a); }
  const walkT = Math.max(0, gap - P1.reach + 8) / (150 * me.stats.walk);
  if (C.ready(0) && C.ready(3) && walkT > left - P1.startup - 0.1 && gap < E.dist + P1.deepReach - 10 && (gap - P1.deepReach) / (E.dist / E.active) + P1.startup + 0.1 < left) { K.dlBur = me.ms + 1; return C.stepTo(a); }   // (a burrow over, Dig & Pop up out of it under them: stick)
  if (C.ready(1) && gap > 90 && M.move2.startup + gap / M.move2.speed < left + 0.1) { C.fire(1); return C.unit(a); }   // (too far: the goroutines)
  return C.ready(0) ? C.unit(a) : null;
}
/** @type {import('./index.js').BotHooks} */
const ai = {
  want: 150,   // // (out of the brawlers' reach where the goroutines work; the burrow takes him in)
  // his character (js/fight-style.js): the burrower, a tricky one, Deadlock's crack down before he digs in
  persona: { trap: 0.25, traps: [2], trapN: 1, styles: [1, 0.8, 1.8] },
  // Gopher's tells, for the other bot: the goroutines' lanes, Deadlock's crack (and his paws going up for it)
  threats(F, i, me, o) {
    const out = [], ow = F.f[1 - i], M = ow.stats.moves, D = M.move3;
    for (const b of F.objs) {
      if (b.owner === i || b.t < o.age || b.t >= b.life) continue;
      if (b.kind === 'gorun') {   // in its lane, ahead of it: sideways into the nearer gap
        const x0 = b.ph === 'run' ? b.x : b.sx, y0 = b.ph === 'run' ? b.y : b.sy, left = M.move2.len - b.ran;
        const x1 = x0 + Math.cos(b.a) * left, y1 = y0 + Math.sin(b.a) * left, [lat, u] = segDist(me.x, me.y, x0, y0, x1, y1);
        const need = b.r + me.r + 5 - lat;
        if (need <= 0 || u >= 1) continue;
        const side = Math.sign(Math.sin(Math.atan2(me.y - y0, me.x - x0) - b.a)) || (b.k < 2 ? -1 : 1);
        const T = (b.ph === 'spread' && ow.state === 'wind' ? Math.max(0, ow.dur - ow.t) : 0) + Math.max(0, u * left - me.r) / M.move2.speed;
        out.push(['g' + b.id, T, 0.08, b.a + side * Math.PI / 2, need]);
      } else if (b.kind === 'godl' && b.ph === 'run') {   // the crack coming: off its line, sideways (the nearer way)
        const left = D.len - b.ran, x1 = b.x + Math.cos(b.a) * left, y1 = b.y + Math.sin(b.a) * left, [lat, u] = segDist(me.x, me.y, b.x, b.y, x1, y1);
        const need = D.w + me.r * 0.6 + 8 - lat;
        if (need <= 0 || u >= 1) continue;
        const side = Math.sign(Math.sin(Math.atan2(me.y - b.y, me.x - b.x) - b.a)) || 1;
        out.push(['c' + b.id, Math.max(0, u * left - me.r) / D.speed, 0.06, b.a + side * Math.PI / 2, need]);
      }
    }
    // Deadlock's paws going up (seen late: o): off the line he's facing, before the crack sets off
    if (o.move === 'move3' && o.state === 'wind') {
      const x1 = o.x + Math.cos(o.face) * (D.len + ow.r), y1 = o.y + Math.sin(o.face) * (D.len + ow.r), [lat, u] = segDist(me.x, me.y, o.x, o.y, x1, y1);
      const need = D.w + me.r * 0.6 + 14 - lat;
      if (need > 0 && u < 1) { const side = Math.sign(Math.sin(Math.atan2(me.y - o.y, me.x - o.x) - o.face)) || 1; out.push(['H' + o.ms, Math.max(0, o.left) + Math.max(0, u * (D.len + ow.r) - ow.r - me.r) / D.speed, 0.06, o.face + side * Math.PI / 2, need]); }
    }
    // Dig & Pop: a hit, no floor tell. His crouch seen (late, at human speed, so spacing is the real answer): back out
    // of reach
    const mv = M.move1, d = Math.hypot(me.x - o.x, me.y - o.y), need = ow.r + me.r + (o.ph === 'rumble' ? mv.deepReach : mv.reach) + 10 - d;
    if (need > 0 && o.move === 'move1' && (o.state === 'wind' || o.state === 'strike')) out.push(['h' + Math.round((o.T - o.t) * 60), o.state === 'wind' ? Math.max(0, o.left) : 0, o.state === 'wind' ? mv.active : Math.max(0.02, o.left), Math.atan2(me.y - o.y, me.x - o.x), need]);
    // his mound running in (seen late: o): the uppercut can burst out where it stops. Back off out of reach of the end
    // of its run
    if (o.move === 'evade' && o.state === 'strike' && o.under) {
      const left = Math.max(0, o.left), ex = o.x + o.vx * left, ey = o.y + o.vy * left, n2 = ow.r + me.r + mv.deepReach + 12 - Math.hypot(me.x - ex, me.y - ey);
      if (n2 > 0) out.push(['b' + Math.round((o.T - o.t) * 60), Math.min(left, mv.startup), mv.active + 0.05, Math.atan2(me.y - ey, me.x - ex), n2]);
    }
    return out;
  },
  // in a move: Deadlock aimed where it sees them (led partly, off by its error); burrowing: decided once a burrow
  // (keener by level, C.link; always toward someone stuck in his hole), the mound steered at them (where he knows they
  // are, late), and right by them Dig & Pop bursts him up (Burrow then Pop); else it runs on the way it set off
  stick(F, i, me, o, C) {
    const K = C.K, mv = me.stats.moves.move1;
    if (me.move === 'move3' && me.state === 'wind') {
      const D = me.stats.moves.move3;
      if (K.dlAim !== me.ms) { K.dlAim = me.ms; K.dlErr = (20 - 15 * C.L.smart) * (0.6 + 0.8 * C.rng()) * (C.rng() < 0.5 ? -1 : 1); }
      const q = (Math.max(0, me.dur - me.t) + Math.max(0, C.g.gap) / D.speed) * C.L.lead, x = o.x + o.vx * q, y = o.y + o.vy * q, a = Math.atan2(y - me.y, x - me.x);
      return C.unit(Math.atan2(y + Math.cos(a) * K.dlErr - me.y, x - Math.sin(a) * K.dlErr - me.x));
    }
    if (me.move !== 'evade' || me.state !== 'strike' || !me.under) return [0, 0];
    const pit = pitOf(F, C.live), mine = pit && pit.owner === i;
    if (K.goFor !== me.ms) {
      K.goFor = me.ms;
      K.goUnder = F.time - (K.goIn || -9) < 0.25;   // (dug in under something thrown from afar: on in at them)
      K.goPop = (mine && K.dlBur === me.ms) || (C.ready(0) && C.link((K.goUnder ? 0.45 : 0.25) + 0.6 * C.L.combo));
    }
    const tg = mine ? C.live : o, gap = Math.hypot(tg.x - me.x, tg.y - me.y) - me.r - tg.r;
    if (K.goPop && C.ready(0) && me.t > 0.08 && gap < mv.deepReach - (mine ? 14 : 6) && open(tg)) { K.goPop = false; C.fire(0); }
    if (K.goPop || (K.goUnder && gap > 50)) { const a = Math.atan2(tg.y - me.y, tg.x - me.x); return [Math.cos(a), Math.sin(a)]; }
    const cl = clearance(C.g.A, me.x, me.y, me.r);
    if (cl.d < 50) return [Math.cos(me.face) * 0.4 + cl.nx * 0.9, Math.sin(me.face) * 0.4 + cl.ny * 0.9];
    return [Math.cos(me.face), Math.sin(me.face)];
  },
  punish(F, i, me, o, C, w) {
    const f = pitFollow(F, i, me, o, C); if (f) return f;
    const M = me.stats.moves, { dist: d, gap } = C.g, mv = M.move1, D = M.move3;
    if (C.ready(0) && gap < mv.reach + 2 && w.fits(mv.startup + 0.03)) { C.fire(0); return C.unit(C.g.toFoe); }   // (right there: the uppercut)
    if (C.ready(0) && gap < 90 && w.b > (gap - mv.reach + 4) / (150 * me.stats.walk) + mv.startup + 0.15 && C.rng() < 0.3 + 0.5 * C.L.smart) return C.unit(C.g.toFoe);   // (open a while: walk in, the next think throws it)
    if (C.ready(1) && w.line && d < 260 && w.fits(M.move2.startup + Math.max(0, gap - 10) / M.move2.speed)) { C.fire(1); return C.unit(C.g.toFoe); }
    if (C.ready(2) && w.line && gap > 30 && gap < D.len - 30 && w.fits(D.startup + gap / D.speed)) { C.fire(2, 3); return C.unit(C.g.toFoe); }   // (open long enough: the crack gets them stuck)
    return null;
  },
  neutral(F, i, me, o, C, w) {
    const f = pitFollow(F, i, me, o, C); if (f) return f;
    const M = me.stats.moves, { dist: d, gap, toFoe } = C.g;
    w.add(1, d > 70 && d < 330 ? (w.busy ? 0.3 : 0.17) : 0, C.unit(toFoe));
    w.add(0, gap < M.move1.reach ? (w.busy || w.spent ? 0.55 : 0.32) : 0, C.unit(toFoe));   // (point-blank only: never thrown from out of reach)
    // Deadlock: a clear line, in its length but not on top of them (keener once they can't walk off it, or their evade's spent)
    w.add(2, w.line && gap > 40 && gap < M.move3.len - 40 ? (w.busy ? 0.4 : w.spent ? 0.16 : 0.05 + 0.03 * C.L.smart) : 0, C.unit(toFoe), 3);
    // a burrow in at them, its mound stopping by them (the uppercut bursts out of it: stick), when the pop is ready
    w.add(3, C.ready(0) && gap > 40 && gap < M.evade.dist + 10 && !w.busy ? 0.07 + 0.08 * C.L.combo + (gap > 130 ? 0.06 + 0.06 * C.L.smart : 0) : 0, C.unit(toFoe));   // (kept out at range: more often)
  },
  // the burrow: untouchable through it
  evadeWhen(T, dur, E) { return [T > 0.02 && T + dur < E.active - 0.04, T + dur < E.active - 0.04]; },
  // the burrow answering something: from out of his reach (a zoner's shot, wind, a wave), dug in under it at them
  // (stick steers the mound on in and pops him up into the uppercut by them); up close, away as before
  evadeWay(F, i, me, o, C, a) {
    if (C.g.gap < me.stats.moves.move1.reach + 50) return a;
    C.K.goIn = F.time; return C.g.toFoe;
  },
};
export default { id: ID, fighter, kits, objs, ai };
