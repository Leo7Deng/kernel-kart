// @ts-check
// Bugdroid (Android) for Fight (plug-in shape: js/kits/index.js; drawing: js/art/kit-droid.js). The gadget robot:
// sturdy, a little slow, all apps and batteries.
// move1 Battery Beam (drBeam, hold to charge and aim): his antennae glow and a faint line of motes shows where he's
// pointing; held, it charges and turns the held way. Let go: the line settles a moment, then the beam fires down it (a
// stagger, a knockdown when well charged). Answer: step off the line. Two battery cells.
// move2 Background Service (drSvc): a trap, not a hit. He flicks an app tile across the floor the held way (none: at
// them), out to where they stand; it beds in, arms, then waits a few seconds. Stepping on it shocks you (locked up just
// long enough for his beam) and gives him a battery cell back. Two at a time. Answer: step off before it arms, then
// walk round it. Why: the beam wants them still and the turret wants them boxed in; a floor trap does both from range
// move3 Sideload (drCube): an app cube plugged into the floor in front of him boots, then turns and pops slow pellets
// at you. A fence too: whoever walks up is zapped away, then it recharges, and walking into it meanwhile kicks it over.
// Answer: sidestep, use a pillar, or kick it over.
// evade Power Surge (drSurge): rooted, sparks gather (the tell, not yet safe), then lightning is live: a hit on him is
// soaked and a thrower within near of him (a body, a grab) is shocked and locked up; a thing from afar fizzles. Soaked,
// he's quickly back; nothing came, he's drained and open a while. A long cooldown.
// Passive Battery: Battery Beam runs on two cells (shown over his head), each back battery.recharge s after it's spent;
// a service shocking someone sends a cell back.
// Phases (f.ph): charge, lock, beam, cool · plug, plugged · flick, flung · gather, surge, drained, surged.
// Objects: drbeam (a, len, w, ch (charge 0..1), ph 'aim' | 'lock' | 'fire' | 'fade'), drcube (a: its aim, ph 'boot' |
// 'live' | 'off' | 'broke', nx: its next shot), drpel (a pellet: vx, vy, run), drsvc (x0, y0 -> x1, y1, ph 'slide' |
// 'arm' | 'live' | 'zap' | 'off', to: who it shocked), drzap (a surge's shock on to, due next step).
// Events: drBeam (x2, y2, hit), drCube, drPew, drPop (hit), drCubeOff, drCubeBreak (to), drFlick (a), drSvcArm,
// drSvcZap (to), drSvcOff, drGather, drSurge, drSoak (by, near: the thrower shocked, else it fizzles), drShocked (to),
// drDrained.
import { Math } from '../detmath.js';
import { AIM, angDiff, clamp, dist, gone, inside, landing, mine, open, segDist, setPh, spawn, toward, turnTo } from './lib.js';

const ID = 'droid';
/** @type {import('./index.js').FighterData} */
const fighter = {
  id: ID, name: 'Bugdroid', lang: 'Android', role: 'Gadgeteer',
  blurb: 'A sturdy green robot full of gadgets: a battery beam from across the arena, a sideloaded turret that pelts you, and a hidden background service on the floor that locks you up for the beam; up close he wraps himself in lightning.',
  tagline: 'Gadget robot: a battery beam, a turret, a trap on the floor, a lightning surge.',   // (the select screen's one line; the blurb stays on its Moves tab)
  difficulty: 'easy',   // (the select screen's Easy / Medium / Hard: how much it takes to play well)
  passive: 'Battery: his beam runs on two cells, each back 3.2 s after it\'s used; a Background Service shocking you sends one back.',
  balance: 'A zoner who wins at range with the beam, the cube and his trap (2026-10-29: Hot Plug, his only close hit, swapped for Background Service, and Airplane Mode for Power Surge: up close he has the cube\'s zap and the surge, which punishes a careless swing but leaves him open if nothing comes); before that the quick Hot Plug and the cube\'s zap kept rush-down off him, and the plug paid his battery back (2026-10-25: he won 37% of Chill and 17% of Ruthless bot fights; the beam quicker and less open, the plug quicker and longer, the cube a fence). About 55% (Chill) to 41% (Ruthless), 2026-10-26 (all 4 arenas, 128 fights a pair), the beam settling quicker before it fires (lock 0.2 -> 0.15 -> 0.12: 39% at Ruthless at 0.15) so sharp players get less time to step off it, while careless ones never step off anyway. The quick ones who get through (Octo, Duke, Swifty, Pyth: ~20-30% at Ruthless) are his weak side; Tux can\'t get to him (~83%). 2026-10-29, the approved kit changes (Hot Plug gone for Background Service, Airplane Mode for Power Surge, health 114 -> 124; the sharp bots wait his surge out and punish the drain, the weak side at Ruthless (Tux, Duke, Pyth)): about 60% at Normal and 34% at Ruthless (the ring, 16 / 12 fights a pair). 2026-10-29, the balance pass (all four arenas, 40 fights a pair, about ±5): 69% Chill, 52% Normal, 44% Ruthless (health 124 -> 130, Power Surge\'s sparks gather 0.12 -> 0.07 s (the jab and the fish came out before it was live), Background Service 12 -> 11, the cube back 2.16 -> 2.7 s; his bot sets gadgets less when sloppy and now and then raises the surge ahead of a rusher\'s swing, and the other bot holds off his live lightning less surely: he was 72% at Chill and 3-5% against Tux and Duke at Ruthless). Still a zoner\'s shape: careless bots walk onto his traps (Chill), the rush-down beats him at Ruthless (Duke 8%, Tux 13%), and he beats the other zoners (Swifty, Octo 80-98%). 2026-10-30, the tune-up (the user: "should counter and be weak to what it does right now, but ... a slightly better balance"): Power Surge drained 0.28 -> 0.15 s and a surge that ends unhit lets off a last crackle that shoves a foe right next to him off (40 units, a tiny hit, never a counter); the beam\'s reach 330 -> 280 (the zoners get closer). Measured after (16 fights a pair, about ±6, ±12 a pair): 67% Chill, 49% Normal, 47% Ruthless (was 69 / 52 / 44); his extremes only moved a little (Normal: Ferris and Duke 0-13% .. Swifty 88%; Ruthless: Tux and Duke 13% .. Octo 88%; were 18 .. 93 and 8 .. 93): the rushers still run him down at Ruthless, and the surge changes alone don\'t reach 25/75. Small close-range outs, not a full answer (the user\'s call): the service flicked at someone on him hops him back, the surge\'s last crackle shoves further. 63 / 57 / 47% (fight-odds, 40 a pair); the rushers still win (Normal: Duke 77%, Tux 65%, Ferris 67%; Ruthless Tux 92%, Duke 97%).',
  hp: 130, weight: 1.08,
    // (no hit up close: he soaks the way in)
  walk: 0.98, accel: 26, friction: 28, kbDecay: 3, radius: 17, slipMul: 0.2,
  battery: { max: 2, recharge: 3.2 },
  moves: {
    move1: { name: 'Battery Beam', short: 'Beam', do: 'drBeam', icon: 'drBeam', hold: 'aim',
      blurb: 'Charges up, antennae glowing, while a faint line of light shows where he\'s pointing; holding the key charges it, and the line follows you (the held way nudges it off you). Let go and a beam fires down the line.',
      tell: 'His antennae glow and a faint line of light motes runs along the floor. It settles for a moment just before it fires.',
      answer: 'Step off the line (it follows slowly, and settles before it fires). A well charged one knocks you down. He has two battery cells.',
      // the charge (startup at least, up to holdMax more while held: ch 0..1), turning aimTurn rad/s the held way; let
      // go: the line settles lock s, then the beam (fire s) out to reach from his edge (stopped by walls and pillars),
      // w half-wide: damage x up to full at full charge, a stun-s stagger, knocks down from kdAt charge
      startup: 0.35, active: 0.4, recovery: 0.28, cooldown: 1, holdMax: 0.7,
      // (a human's aim sticks to them)
      damage: 11, kb: 180, stun: 0.45, full: 1.6, kdAt: 0.7, reach: 280, w: 15, aimTurn: 1, lock: 0.12, fire: 0.2 },
    move2: { name: 'Background Service', short: 'Service', do: 'drSvc', icon: 'drSvc', hold: null,
      blurb: 'Flicks a little app tile across the floor to where you stand (right on him, he hops back off you). It arms, then runs quietly in the background, a faint light blinking: step on it and a shock locks you up a moment, just long enough for his beam. Two at a time.',
      tell: 'The tile sliding out along the floor, its light blinking faster as it arms. Then only a faint blink.',
      answer: 'Step off it before it arms, then walk round it (they last a few seconds). Shocked, you\'re stuck in his beam\'s line.',
      // the flick (startup), the tile sliding out over active s the aimed way to min(range, how far they are) (at least
      // minD), bedding in; it arms over arm s, then lives life s: whoever's middle comes within r of it (on the floor,
      // touchable) gets damage and a stun-s lock (no knockdown), and he gets a battery cell back. At most max of them
      // (a new one switches off the oldest)
      startup: 0.2, active: 0.25, recovery: 0.22, cooldown: 3.2, damage: 11, kb: 40, stun: 0.9, stale: false,
      range: 180, minD: 45, r: 12, arm: 0.3, life: 7, max: 2, hopD: 40, hop: 210 },   // (hop: u/s back when they're within hopD)
    move3: { name: 'Sideload', short: 'Sideload', do: 'drCube', icon: 'drCube', hold: null,
      blurb: 'Plugs a little app cube into the floor in front of him. It boots, then turns and pops slow pellets at you for a few seconds, and zaps you away if you walk up to it.',
      tell: 'The cube booting (its light filling up), then turning to face you before each pellet.',
      answer: 'Sidestep the pellets or keep a pillar between you. Walk up to it and it zaps you away, but then it needs a moment: walk into it again and kick it over.',
      // the plug (startup), the cube ahead units in front; it boots boot s, then for up s turns to you (turn rad/s) and
      // fires every every s a pellet (radius pr, speed u/s, range): each a small staggering hit
      startup: 0.36, active: 0.06, recovery: 0.3, cooldown: 4.5,
      ahead: 26, r: 9, boot: 0.5, up: 3.2, every: 0.8, turn: 5, pr: 5, speed: 195, range: 380,
      hit: { damage: 4, kb: 110, stun: 0.32 },
      // (a fence against rush-down) whoever comes within zap.R of its edge is zapped (a staggering shove away from it),
      // then it recharges zap.every s: walk into it meanwhile and you kick it over
      zap: { R: 8, every: 2, damage: 4, kb: 260, stun: 0.4, prio: 2, stale: false } },
    evade: { name: 'Power Surge', short: 'Surge', do: 'drSurge', icon: 'drSurge', hold: null,
      blurb: 'Rooted, he wraps himself in crackling lightning for a moment: hit him then and the hit\'s soaked, and if you threw it from close by you\'re shocked and locked up. Nothing comes, and a last little crackle shoves anyone right next to him off, then he\'s drained and open a moment.',
      tell: 'Sparks gathering round him for a blink before the lightning\'s live: he can\'t move while it\'s up.',
      answer: 'Don\'t swing into the lightning: wait it out a step back (a shot from afar just fizzles on it; right next to him, its last crackle shoves you off). Drained afterwards, he\'s open a moment: hit him then.',
      // rooted: the sparks gather gather s (not yet safe), then the lightning's live (the rest of active): a hit on him
      // is soaked (drSoak); its thrower within near of his edge is shocked (shock: locked up stun s); from further it
      // fizzles. Soaked: recovery s; nothing came: drained miss s, open, rooted, and a last crackle (nudge) shoves
      // whoever is within nudge.R of his edge, on their feet, off him (a tiny hit)
      startup: 0, active: 0.6, recovery: 0.15, miss: 0.15, cooldown: 2.8, gather: 0.06, near: 70,
      nudge: { R: 48, damage: 1, kb: 250, stun: 0.16, kind: 'special', prio: 2, stale: false },   // (gather short: the quick swings, Duke's jab and Tux's fish, landed before it was live)
      shock: { damage: 5, kb: 90, stun: 0.6, kind: 'special', prio: 2, stale: false } },
  },
  phPose: { charge: 'charge', lock: 'charge', beam: 'beam', cool: 'beam', plug: 'plug', plugged: 'plug', flick: 'twist', flung: 'plugout', gather: 'emp', surge: 'emp', drained: 'reboot', surged: 'emp' },
  phFade: ['cool', 'plugged', 'flung', 'surged'],
  show: ['stand', 'charge', 'beam', 'stand', 'plug', 'stand', 'twist', 'emp'], cheer: 'emp',
  // Battery: a beam waits for a cell (its key's cooldown shows the wait)
  tick(F, f, dt) { const B = f.stats.battery; if (f.bat < B.max) f.bat = Math.min(B.max, f.bat + dt / B.recharge); if (f.bat < 1) f.cd[0] = Math.max(f.cd[0], (1 - f.bat) * B.recharge); },
  fields: { aimW: 0, bat: 2, tick: 0, soak: 0 },   // (bat: battery cells, battery.max; tick: the beam's charge 0..1; aimW: the beam's aim, its turn rate; soak: the surge soaked a hit this go)
};
const P = (a, b, inp) => [a, b, inp];
fighter.clips = {
  move1: { x: [-110, 60], len: 2.6, cam: { x: -20, w: 320 }, a: [P(0.3, 1.0, { light: 1 })] },   // (charged a while)
  move2: { x: [-120, 40], len: 3, cam: { x: -30, w: 330 }, a: [P(0.3, 0.38, { heavy: 1 })], b: [P(0.45, 0.85, { x: 1, y: 0 }), P(1.35, 2.0, { x: -1, y: 0 })] },   // (flicked to Tux's feet; he steps back off it, then walks back onto it once it's armed: shocked)
  move3: { x: [-100, 80], len: 3.2, cam: { x: -10, w: 320 }, a: [P(0.3, 0.38, { special: 1 })] },
  evade: { x: [-30, 20], len: 2.4, cam: { x: 0, w: 260 }, a: [P(0.3, 0.36, { guard: 1 })], b: [P(0.42, 0.5, { light: 1 })] },   // (Tux's fish into the lightning: shocked)
};

// the aim: eased (f.aimW its turn rate), at most max rad/s. A human's sticks to the foe, the held way only an offset
// (holding nothing is a good aim); a bot's goes only the way its stick holds (where it sees them, late, and a little
// off: ai.stick)
function aimStep(F, f, o, max, dt, c) {
  const toO = toward(f, o);
  let want = f.face;
  if (F.cfg.bots[f.i] == null) want = toO + (c.mag > 0.3 ? clamp(angDiff(c.dirA, toO), -2.4, 2.4) * 0.6 * Math.min(1, c.mag) : 0);
  else if (c.mag > 0.3 && Math.abs(angDiff(c.dirA, toO)) < Math.PI * 0.8) want = c.dirA;
  const rate = clamp(angDiff(want, f.face) * 6, -max, max);
  f.aimW = (f.aimW || 0) + (rate - (f.aimW || 0)) * Math.min(1, dt * 9);
  f.face += f.aimW * dt;
}
// where a bot aims (its stick): at where it sees them (late: perceive()), leading them only partly, a per-throw miss
// off to one side that shrinks with its level (Chill ~47 units, Normal ~31, Ruthless ~16)
function botAim(C, me, o, t) {
  const K = C.K, L = C.L;
  const key = me.state === 'wind' ? me.ms : me.ms + 1;   // (asked as it throws: the go about to start)
  if (K.aimFor !== key) { K.aimFor = key; K.aimErr = (C.rng() < 0.5 ? -1 : 1) * (47 - 52 * (L.smart - 0.2)) * (0.85 + 0.3 * C.rng()); }
  const lead = 0.2 + 0.6 * L.smart, x = o.x + o.vx * t * lead, y = o.y + o.vy * t * lead, a = Math.atan2(y - me.y, x - me.x);
  return Math.atan2(y + Math.cos(a) * K.aimErr - me.y, x - Math.sin(a) * K.aimErr - me.x);
}
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

/** @type {Record<string, import('./index.js').Kit>} */
const kits = {
  drBeam: {
    moves: true,
    can(F, f) { return f.bat >= 1; },
    press(F, f, o, mv) {
      setPh(f, 'charge'); f.bat -= 1; f.tick = 0; f.aimW = 0;
      if (F.cfg.bots[f.i] == null) f.face = toward(f, o);   // (a human's aim starts on them)
      spawn(F, f, { kind: 'drbeam', a: f.face, len: f.r + reachOf(F, f, f.face, mv), w: mv.w, ch: 0, ph: 'aim' });
    },
    wind(F, f, o, mv, dt, c) {   // charging: aiming (a human's sticking to them, the held way an offset), the line with him
      f.vx = f.vy = 0;
      aimStep(F, f, o, mv.aimTurn, dt, c);
      f.tick = clamp((f.t - mv.startup) / mv.holdMax, 0, 1);
      const ln = line(F, f, mv); if (ln) ln.ch = Math.round(f.tick * 100) / 100;
    },
    hold(F, f, o, mv) { return !f.rel && f.t < mv.startup + mv.holdMax; },
    start(F, f, o, mv) { setPh(f, 'lock'); f.vx = f.vy = 0; f.aimW = 0; const ln = line(F, f, mv); if (ln) { ln.ph = 'lock'; ln.lt = ln.t; } },
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
      F.ev('drCube', x, y, 0.5, f.i, { move: 'move3' });
    },
    phases: mv => [['plug', 'wind', mv.startup, 'plug', 'crouched, plugging the cube in'], ['plugged', 'strike', mv.active, 'plug', `the cube ${mv.ahead} ahead`], ['plugged', 'recover', mv.recovery, 'plug', ''],
      ['(the cube)', '', mv.boot + mv.up, '', `boots ${mv.boot} s, then a pellet every ${mv.every} s at ${mv.speed} u/s; walk into it to kick it over`]],
  },
  drSvc: {   // Background Service: the flick, the tile sliding out to its spot; it arms and waits (drsvc)
    moves: true,
    press(F, f) { setPh(f, 'flick'); f.vx *= 0.3; f.vy *= 0.3; },
    wind(F, f) { f.vx *= 0.8; f.vy *= 0.8; },
    start(F, f, o, mv) {
      setPh(f, 'flung'); f.vx = f.vy = 0;
      const c = F.ctl(f), toO = toward(f, o), a = c.mag > 0.3 && Math.abs(angDiff(c.dirA, toO)) <= AIM ? c.dirA : f.face;
      f.face = a;
      if (dist(f, o) - f.r - o.r < mv.hopD) { f.vx = -Math.cos(a) * mv.hop; f.vy = -Math.sin(a) * mv.hop; }   // (flicked at someone right on him: a hop back off it)
      const d = clamp(dist(f, o), mv.minD, mv.range);
      const [x1, y1] = inside(F, f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, mv.r + 4);
      const L = F.objs.filter(b => b.kind === 'drsvc' && b.owner === f.i && b.t < b.life && b.ph !== 'zap' && b.ph !== 'off');
      for (let k = 0; k <= L.length - mv.max; k++) { L[k].ph = 'off'; L[k].zt = L[k].t; L[k].life = L[k].t + 0.3; }   // (two at a time: the oldest switches off)
      spawn(F, f, { kind: 'drsvc', x: f.x + Math.cos(a) * (f.r + 6), y: f.y + Math.sin(a) * (f.r + 6), x0: f.x + Math.cos(a) * (f.r + 6), y0: f.y + Math.sin(a) * (f.r + 6), x1: Math.round(x1 * 10) / 10, y1: Math.round(y1 * 10) / 10, r: mv.r, ph: 'slide', to: -1, mv: null, life: mv.active + mv.arm + mv.life });
      F.ev('drFlick', f.x, f.y, 0.4, f.i, { move: 'move2', a });
    },
    step(F, f) { f.vx *= 0.85; f.vy *= 0.85; },
    end(F, f, o, mv) { setPh(f, 'flung'); f.vx = f.vy = 0; F.go(f, 'recover', mv.recovery); return true; },
    phases: mv => [['flick', 'wind', mv.startup, 'twist', 'a flick of the wrist, the tile in his hand'], ['flung', 'strike', mv.active, 'plugout', `the tile slides out to where they stand (${mv.minD}-${mv.range} off)`], ['flung', 'recover', mv.recovery, 'plugout', ''],
      ['(the service)', '', mv.arm + mv.life, '', `arms ${mv.arm} s, then waits ${mv.life} s: stepped on (within ${mv.r}), ${mv.damage} and locked up ${mv.stun} s; a battery cell back; ${mv.max} at a time`]],
  },
  drSurge: {   // Power Surge: rooted; sparks gathering, then the lightning live; soaked or drained
    moves: true,
    start(F, f) { setPh(f, 'gather'); f.vx = f.vy = 0; f.soak = 0; F.ev('drGather', f.x, f.y, 0.4, f.i, { move: 'evade' }); },
    step(F, f, o, mv) {
      f.vx = f.vy = 0;
      if (f.ph === 'gather' && f.t >= mv.gather - 1e-9) { setPh(f, 'surge'); F.ev('drSurge', f.x, f.y, 0.6, f.i, { move: 'evade' }); }
    },
    end(F, f, o, mv) {
      if (f.soak) { setPh(f, 'surged'); F.go(f, 'recover', mv.recovery); }
      else {
        setPh(f, 'drained'); F.go(f, 'recover', mv.miss); F.ev('drDrained', f.x, f.y, 0.3, f.i, { move: 'evade' });
        const N = mv.nudge;   // (the last of the charge crackling off: a close foe shoved off him; hold: never a counter hit, it's a
        // nudge, not a punish, and the checks hold skips are made here)
        if (N && grounded(o) && open(o) && !o.under && o.inv <= 0 && dist(f, o) - f.r - o.r < N.R
          && F.hitF(f, o, N, { dir: toward(f, o), obj: true, noFlank: true, hold: true, move: 'evade' }) && F.lastRes === 'hit') F.ev('drNudge', o.x, o.y, 0.5, f.i, { move: 'evade', to: o.i, x2: f.x, y2: f.y });
      }
      return true;
    },
    recover(F, f) { f.vx = f.vy = 0; },   // (drained: rooted while it lasts)
    phases: mv => [['gather', 'strike', mv.gather, 'emp', 'rooted, sparks gathering (not yet safe)'], ['surge', 'strike', Math.round((mv.active - mv.gather) * 100) / 100, 'emp', `lightning round him: a hit soaked; its thrower within ${mv.near} shocked (${mv.shock.damage}, locked up ${mv.shock.stun} s), from further it fizzles`],
      ['surged', 'recover', mv.recovery, 'emp', 'soaked one: back quickly'], ['drained', 'recover', mv.miss, 'reboot', `nothing came: drained, rooted, open (a last crackle shoves anyone within ${mv.nudge.R} off him)`]],
  },
};

// a hit on him while his lightning's live: soaked; the one who threw it, from close by, shocked (next step, once their
// own move's done with the hit: a drzap); from afar it fizzles
const surging = d => d.move === 'evade' && d.state === 'strike' && d.ph === 'surge';
fighter.guard = (F, a, d, mv, opt) => {
  if (!surging(d) || d.state === 'ko') return undefined;
  const E = d.stats.moves.evade, gap = dist(a, d) - a.r - d.r, near = a !== d && gap < E.near && !a.gone && !a.under && a.z < 20 && a.state !== 'ko';
  d.soak = 1; F.lastRes = 'soak'; F.hitstop = Math.max(F.hitstop, 4 / 60);
  if (near && !F.objs.some(b => b.kind === 'drzap' && b.to === a.i && b.t < b.life)) spawn(F, d, { kind: 'drzap', to: a.i, mv: null, life: 0.05 });
  F.ev('drSoak', d.x, d.y, near ? 0.8 : 0.4, d.i, { move: 'evade', by: a.i, near: near ? 1 : 0, x2: a.x, y2: a.y });
  return true;
};

/** @type {Record<string, import('./index.js').ObjStep>} */
const objs = {
  // Background Service: sliding out, arming, then waiting; stepped on: a shock (a hit, no knockdown), a cell back
  drsvc(F, ob, dt, own, foe, M) {
    const mv = M.move2;
    if (ob.ph === 'slide') {
      const u = clamp(ob.t / mv.active, 0, 1), e = 1 - (1 - u) * (1 - u);
      ob.x = ob.x0 + (ob.x1 - ob.x0) * e; ob.y = ob.y0 + (ob.y1 - ob.y0) * e;
      if (u >= 1) { ob.ph = 'arm'; F.ev('drSvcArm', ob.x, ob.y, 0.3, ob.owner, { move: 'move2' }); }
      return;
    }
    if (ob.ph === 'arm') { if (ob.t >= mv.active + mv.arm) ob.ph = 'live'; return; }
    if (ob.ph !== 'live') return;
    if (ob.t >= ob.life - 0.3) { ob.ph = 'off'; ob.zt = ob.t; F.ev('drSvcOff', ob.x, ob.y, 0.2, ob.owner, { move: 'move2' }); return; }
    if (!grounded(foe) || !open(foe) || foe.under || foe.inv > 0 || Math.hypot(foe.x - ob.x, foe.y - ob.y) > ob.r + foe.r * 0.6) return;
    if (!F.hitF(own, foe, mv, { dir: Math.atan2(foe.y - ob.y, foe.x - ob.x), obj: true, noFlank: true, move: 'move2' })) return;
    const hit = F.lastRes === 'hit';
    ob.ph = 'zap'; ob.to = foe.i; ob.zt = ob.t; ob.life = ob.t + 0.45;
    if (hit) { foe.vx *= 0.2; foe.vy *= 0.2; own.bat = Math.min(own.stats.battery.max, own.bat + 1); }   // (locked up on the spot; the charge back to him)
    F.ev('drSvcZap', foe.x, foe.y, hit ? 0.8 : 0.4, ob.owner, { move: 'move2', to: foe.i, hit, x2: ob.x, y2: ob.y });
  },
  // Power Surge's shock on whoever hit into it (the step after: their own move's done with the hit)
  drzap(F, ob, dt, own) {
    if (ob.done) return; ob.done = 1;
    const a = F.f[ob.to]; if (!a || a.state === 'ko') return;
    if (F.hitF(own, a, own.stats.moves.evade.shock, { dir: Math.atan2(a.y - own.y, a.x - own.x), obj: true, noFlank: true, move: 'evade' }) && F.lastRes === 'hit') F.ev('drShocked', a.x, a.y, 0.8, own.i, { move: 'evade', to: a.i });
  },
  drbeam(F, ob, dt, own) {   // (gone if he's hit out of it)
    if ((ob.ph === 'aim' || ob.ph === 'lock' || ob.ph === 'fire') && !(own.move === 'move1' && own.ms === ob.ms && (own.state === 'wind' || own.state === 'strike'))) { ob.ph = 'fade'; ob.life = ob.t + 0.2; }
  },
  // the app cube: booting, then turning to them and popping pellets; walked into (kicked), it tips over
  drcube(F, ob, dt, own, foe, M) {
    const mv = M.move3;
    if (ob.ph !== 'boot' && ob.ph !== 'live') return;
    const dd = Math.hypot(foe.x - ob.x, foe.y - ob.y);
    if (grounded(foe) && open(foe) && !foe.under && foe.inv <= 0 && dd < ob.r + foe.r + mv.zap.R && ob.t - (ob.zt ?? -9) >= mv.zap.every) {   // (the fence: zapped away)
      if (F.hitF(own, foe, mv.zap, { dir: Math.atan2(foe.y - ob.y, foe.x - ob.x), obj: true, noFlank: true, move: 'move3' })) { ob.zt = ob.t; F.ev('drCubeZap', foe.x, foe.y, 0.6, ob.owner, { move: 'move3', to: foe.i, x2: ob.x, y2: ob.y, hit: F.lastRes === 'hit' }); return; }
    }
    if (grounded(foe) && dd < ob.r + foe.r + 1) {
      ob.ph = 'broke'; ob.life = ob.t + 0.45; ob.ka = Math.atan2(ob.y - foe.y, ob.x - foe.x);
      F.ev('drCubeBreak', ob.x, ob.y, 0.5, ob.owner, { move: 'move3', to: foe.i }); return;
    }
    if (ob.ph === 'boot') { if (ob.t >= mv.boot) ob.ph = 'live'; else return; }
    if (ob.t >= mv.boot + mv.up) { ob.ph = 'off'; ob.life = ob.t + 0.4; F.ev('drCubeOff', ob.x, ob.y, 0.3, ob.owner, { move: 'move3' }); return; }
    if (foe.state !== 'ko') ob.a = turnTo(ob.a, Math.atan2(foe.y - ob.y, foe.x - ob.x), mv.turn * dt);
    if (ob.t >= ob.nx) {
      ob.nx += mv.every; ob.shots++;
      const c = Math.cos(ob.a), s = Math.sin(ob.a);
      spawn(F, own, { kind: 'drpel', x: ob.x + c * (ob.r + 3), y: ob.y + s * (ob.r + 3), z: 12, vx: c * mv.speed, vy: s * mv.speed, r: mv.pr, run: 0, mv: null, life: mv.range / mv.speed + 0.1 });
      F.ev('drPew', ob.x + c * ob.r, ob.y + s * ob.r, 0.3, ob.owner, { move: 'move3' });
    }
  },
  // a pellet: straight on; a wall or a pillar pops it; it hits once
  drpel(F, ob, dt, own, foe, M) {
    const mv = M.move3;
    ob.x += ob.vx * dt; ob.y += ob.vy * dt; ob.run += mv.speed * dt;
    if (ob.run >= mv.range || F.contactsAll(ob.x, ob.y, ob.r).length) { gone(ob); F.ev('drPop', ob.x, ob.y, 0.2, ob.owner, { move: 'move3' }); return; }
    if (open(foe) && !foe.under && Math.hypot(foe.x - ob.x, foe.y - ob.y) <= ob.r + foe.r) {
      const ok = F.hitF(own, foe, mv.hit, { dir: Math.atan2(ob.vy, ob.vx), obj: true, move: 'move3' });
      if (ok) { gone(ob); F.ev('drPop', ob.x, ob.y, 0.5, ob.owner, { move: 'move3', hit: F.lastRes === 'hit' }); }
    }
  },
};

// ---------------------------------------------------------------- the bot
const SURGE_EARLY = 0.5;   // (how keen, times the bot's smarts)
/** @type {import('./index.js').BotHooks} */
const ai = {
  want: 185,
  // its character (js/fight-style.js): a gadgeteer, its service or cube down first, then it fights from range
  persona: { trap: 0.6, traps: [1, 2], trapN: 1, keep: 0.3, styles: [0.8, 1.4, 1] },
  // Bugdroid's tells, for the other bot: the beam's line, the pellets flying at them, the cube's fence, his services on the floor
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
        out.push(['b' + b.id, T, M.move1.fire, b.a + side * Math.PI / 2, need]);
      } else if (b.kind === 'drcube' && (b.ph === 'boot' || b.ph === 'live') && b.t - (b.zt ?? -9) >= M.move3.zap.every - 0.2) {   // (the fence: not into its zap)
        const need = b.r + me.r + M.move3.zap.R + 6 - Math.hypot(me.x - b.x, me.y - b.y);
        if (need > 0) out.push(['z' + b.id + '.' + Math.round((b.zt ?? 0) * 10), 0.05, 0.05, Math.atan2(me.y - b.y, me.x - b.x), need]);
      } else if (b.kind === 'drpel') {
        const d = Math.hypot(me.x - b.x, me.y - b.y), a = Math.atan2(b.vy, b.vx), off = Math.atan2(me.y - b.y, me.x - b.x) - a;
        if (Math.cos(off) < 0.6 || d > 220) continue;
        const lat = Math.abs(Math.sin(off)) * d, need = b.r + me.r + 4 - lat;
        if (need > 0) out.push(['p' + b.id, Math.max(0, d - me.r) / M.move3.speed, 0.05, a + (Math.sin(off) >= 0 ? 1 : -1) * Math.PI / 2, need]);
      }
    }
    // his services on the floor (once seen: the faint blink): walk round them, never onto them (they're static: off
    // them the shortest way)
    for (const b of F.objs) {
      if (b.kind !== 'drsvc' || b.owner === i || b.t < o.age || b.ph === 'zap' || b.ph === 'off' || b.t >= b.life) continue;
      const need = b.r + me.r * 0.6 + 8 - Math.hypot(me.x - b.x, me.y - b.y);
      if (need > 0) out.push(['s' + b.id, b.ph === 'live' ? 0.05 : Math.max(0.05, M.move2.active + M.move2.arm - b.t), 9, Math.atan2(me.y - b.y, me.x - b.x) || 0, need]);
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
      const a = botAim(C, me, o, mv.lock + 0.1);
      if (me.t >= mv.startup + K.bch - 1e-9 && Math.abs(angDiff(me.face, a)) < 0.08) { C.m.hold.light = 0; C.m.queue.light = 0; }
      return [Math.cos(a), Math.sin(a)];
    }
    if (me.move === 'move2' && me.state === 'wind') { const a = C.aimAt('dsv' + me.ms, 0.5); return [Math.cos(a), Math.sin(a)]; }   // (the service led onto where they're going)
    return [0, 0];
  },
  punish(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap, toFoe } = C.g;
    if (C.ready(0) && w.line && d < M.move1.reach && w.fits(M.move1.startup + M.move1.lock + 0.02)) { C.fire(0, 3); return C.unit(botAim(C, me, o, M.move1.startup + M.move1.lock)); }   // (aimed a little off: botAim)
    // open a long while, close: a service at their feet (they have to step off it as they come out)
    if (C.ready(1) && gap < 90 && w.b > M.move2.startup + M.move2.active + M.move2.arm - 0.1 && C.rng() < 0.3 + 0.5 * C.L.smart) { C.fire(1); return C.unit(toFoe); }
    return null;
  },
  neutral(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap, toFoe } = C.g, sm = C.L.smart;
    const svcs = F.objs.filter(b => b.kind === 'drsvc' && b.owner === me.i && (b.ph === 'slide' || b.ph === 'arm' || b.ph === 'live')).length;
    // (the beam mostly at a busy or recovering foe, a free one now and then)
    w.add(0, w.line && d > 90 && d < M.move1.reach ? (w.busy ? 0.34 : 0.11) : 0, C.unit(botAim(C, me, o, M.move1.startup + M.move1.lock)), 48);
    const tk = 0.55 + 0.55 * sm;
    w.add(2, !cube(F, me) ? (d > 110 ? (w.busy ? 0.2 : 0.1) : gap > 24 ? 0.02 + 0.08 * sm : 0) * tk : 0, C.unit(toFoe));   // (close: planted as a fence, it zaps them)
    // the service: on their way in (a rush: right at them), or seeding the floor between them at mid range
    const coming = (o.vx * (me.x - o.x) + o.vy * (me.y - o.y)) / Math.max(1, d) > 40;
    // a rusher right on him, free and with a swing ready: now and then the lightning up ahead of it (the quick ones,
    // Duke's jab or Tux's fish, come out before the sparks could gather in answer)
    if (SURGE_EARLY && C.ready(3) && gap < M.evade.near - 25 && (o.state === 'idle' || o.state === 'walk') && o.cd && o.cd.slice(0, 3).some(c => c <= 0.05)) {
      if (!(F.time < (C.K.dsT || -9))) { C.K.dsT = F.time + 0.45; if (C.rng() < SURGE_EARLY * sm) { C.fire(3); return [0, 0]; } }
    }
    w.add(1, svcs < M.move2.max && d < M.move2.range + 40 ? (coming || gap < M.move2.hopD ? 0.35 + 0.2 * sm : w.busy ? 0.3 : 0.12) * tk : 0, C.unit(toFoe));   // (right on him: it hops him back off them too)
    return null;
  },
  // the other bot holds off his live lightning (hitting into it shocks them): it waits it out, then punishes the drain
  wary(F, i, me, o) {
    const ow = F.f[1 - i];
    if (!(ow.move === 'evade' && ow.state === 'strike' && (ow.ph === 'gather' || ow.ph === 'surge'))) return null;
    const gap = dist(me, ow) - me.r - ow.r, a = toward(ow, me);
    return { p: 0.35, walk: gap < ow.stats.moves.evade.near ? [Math.cos(a), Math.sin(a)] : [0, 0] };
  },
  still: true,   // (the surge goes nowhere: never spent to get somewhere)
  // the surge: pressed so the lightning's live as it lands (after the gather), short of its end
  evadeWhen(T, dur, E, me, key, soft) { return soft ? [false, false] : [T > E.gather + 0.01 && T < E.gather + 0.14, T > E.gather && T < E.gather + 0.26]; },   // (only once it's about to land: the lightning wasted is a drain)
};
export default { id: ID, fighter, kits, objs, ai };
