// @ts-check
// Octo (GitHub's Octocat) in Fight mode: many arms, version control. Drawn by js/art/kit-octo.js. A mid-range zoner:
// nothing in the kit pulls you toward him, and up close (once his Push is spent) is his weak spot.
// move1 git blame (ocBlame): an aimed tentacle. It coils back while a damp track runs along the floor where it'll shoot
// (a human's aim starts on them and follows, the held way an offset), settles (lock s: the track darkens), then shoots.
// A hit knocks them back out to his range (keep) with a short stagger. Answer: step off the line once it settles; a
// miss leaves him open
// move2 Force Push (ocPush): tap or hold; the tentacles slam down in a close burst that barely hurts but shoves
// whoever's next to him far off their feet, into a wall if one's in the way (slam: more damage); held up to holdMax s,
// a bigger shove from further. Answer: don't rush him with it ready, keep off the walls; open while they come back
// move3 Fork (ocFork): an ink blot marks a spot beside them and a clone pops up there. It copies his next git blame
// from its own angle: two lines to step off. Its hits shove them away from Octo, never grab. It lasts life s or one
// blame; hit it and it pops
// evade Ink Jet (ocInk): he jets back (the held way, else away), untouchable, leaving a slippery ink puddle
// Objects (plain data): ocLine (a blame's tell: x, y, a, len, reach, src (0: Octo, else the clone's id), lk 1 once
// settled), ocArm (the tentacle: sx, sy, a, len, reach, ph 'out' | 'back', res '' | 'hit' | 'miss', src, hx, hy),
// ocSpot (where the clone will pop up), ocClone (x, y, face, ph 'pop' | 'idle' | 'copy' | 'poof', pt, dur, cp (the move
// it copies), cms, how), ocRing (a Push winding up: x, y, R, u), ocWave (x, y, r, R), ocShove (someone shoved, watched
// for a wall: to, ch), ocInk (the puddle: slick, so fight.js makes it slippery). Events: ocCoil, ocLock, ocShoot (x2,
// y2, src), ocWhack (to, a, src), ocFlop (x, y, src), ocFork, ocPop, ocRise, ocSlam, ocBurst (to, a), ocWallSlam (x, y,
// nx, ny, to, ch), ocInkJet. A hit from the clone counts as the Fork's (move 'move3'). DOM-free, deterministic.
import { Math } from '../detmath.js';
import { clearance } from '../fight-arenas.js';
import { D2R, angDiff, clamp, dist, gone, inside, landing, mine, sameGo, segDist, setPh, spawn, toward, turnTo } from './lib.js';


const ID = 'octo';
/** @type {import('./index.js').FighterData} */
const fighter = {
  id: ID, name: 'Octo', lang: 'GitHub', role: 'Zoner',
  blurb: 'Eight busy arms that keep you at bay: a long tentacle aimed down a damp track on the floor, a clone that blames you from a second angle, and a Force Push that sends anyone rushing in back into the walls. Get in close once his Push is spent.',
  tagline: 'Zoner: a long tentacle, a clone from a second angle, a Force Push.',
  difficulty: 'medium',
  passive: 'Sticky suckers: he barely slips on puddles, even his own ink.',
  balance: 'Zoner (2026-10-26, rebuilt round an aimed tentacle): git blame is his damage from mid range and knocks you back out to it, the Push throws off whoever rushes in, the Fork adds a second line from another angle. Up close with the Push spent he has only his Ink Jet, so the blink-in rushers and the long reach that outranges him (Duke, Pyth: 9-15% at Ruthless) are his hard side, and the slow or the ones who must come to him (Bugdroid, Cpp, Docky: 58-82%) his good one. About 60% (Chill) to 46% (Ruthless) of bot fights, 2026-10-26 (all 4 arenas, 128 fights a pair; 63 / 44 before the blame went 11 -> 10.5 and settled quicker, lock 0.1 -> 0.07, so careless players who stand on the track take less and sharp ones get less time to step off it): sharper bots step off his track more, so he does best against Chill ones. 2026-10-29, the balance pass (all four arenas, 40 fights a pair, about ±5): 63% Chill, 51% Normal, 43% Ruthless (health 116 -> 120, git blame\'s and the Push\'s misses 0.55 -> 0.45, the Ink Jet\'s recovery 0.22 -> 0.18). A zoner: careless bots walk into his tentacle (Chill), sharp ones punish his misses; Cpp and Bugdroid outrange and outlast him (10-18%). His bot rushes a set-up fighter (Cpp, Bugdroid) before its traps are out: Cpp 48% at Normal (was ~30). Overall 50 / 52 / 44% (fight-odds, 40 a pair).',
  hp: 120, weight: 1, walk: 1.05, accel: 30, friction: 30, kbDecay: 3.1, radius: 17, slipMul: 0.6,
  moves: {
    move1: { name: 'git blame', short: 'Blame', do: 'ocBlame', icon: 'ocBlame', hold: 'aim',
      blurb: 'He points the blame: a tentacle coils back while a damp track runs out over the floor where it\'ll go, then shoots out along it and knocks you back out to his range, staggered.',
      tell: 'The tentacle coils back and a damp track of sucker marks runs out along the floor, following you; when it darkens it has settled, and the tentacle comes a moment later.',
      answer: 'Step off the track once it darkens, or evade it. A miss leaves him open while the tentacle flops back.',
      // the coil (startup: the line on them, turning aimTurn rad/s, a human's following them, the held way an offset;
      // the last lock s it's settled), then the tentacle out at speed up to reach past his edge (width either side; a
      // wall stops it). A touch: hit's damage and a stun-s stagger, knocked back (away from Octo) to keep units off his
      // edge (at least minPush further), then recovery; a miss: miss s open. Active is only a cap (the arm ends it)
      startup: 0.36, lock: 0.07, active: 0.5, recovery: 0.3, miss: 0.45, cooldown: 1.1, damage: 10.5, kb: 0,
      reach: 165, speed: 760, back: 800, width: 6, aimTurn: 3.2, keep: 150, minPush: 45,
      hit: { damage: 10.5, kb: 0, stun: 0.4, kind: 'special', prio: 2, stale: false } },
    move2: { name: 'Force Push', short: 'Push', do: 'ocPush', icon: 'ocPush', hold: 'charge',
      blurb: 'His "get off me". Tap: his tentacles slam down round him at once, a burst that barely hurts but shoves whoever\'s next to him far off their feet, and hard into a wall if there\'s one behind them. Hold: more of them gather for a bigger shove from further.',
      tell: 'He bobs up and his tentacles flick up round him, their tips\' shadows on the floor where they\'ll land; held, they rise high and tremble as they gather.',
      answer: 'Don\'t rush in while it\'s ready, back off while he gathers, and keep off the walls near him. Missing, he\'s open while his tentacles come back.',
      // tap or hold: the flick (startup), held up to holdMax s more gathering (ch 0..1); the slam: anyone within R +
      // (Rmax - R) x ch (to their middle, + half their radius) takes damage x (1 + chargeDmg x ch), shoved away and
      // down, kb x (1 + chargeKb x ch) falling to edge x at the edge; meeting a wall within slamT s (fast enough to
      // bounce: fight.js walls): slam more damage x (1 + chargeDmg x ch). Then push (recovery) if it hit, gather (miss
      // s, open) if not
      startup: 0.14, active: 0.06, recovery: 0.3, miss: 0.45, cooldown: 1.4, damage: 4, kb: 470, kd: true, R: 100, edge: 0.75,
      holdMax: 0.6, Rmax: 134, chargeDmg: 0.5, chargeKb: 0.5, slam: 7, slamT: 0.9 },
    move3: { name: 'Fork', short: 'Fork', do: 'ocFork', icon: 'ocFork', hold: null,
      blurb: 'A clone of him pops up beside you and copies his next git blame from its own angle: two tentacles, two tracks to step off. The clone\'s shoves you away from him.',
      tell: 'A soft ink blot marks where the clone pops up, a branch of ink running out to it; then a second damp track runs out from the clone when he blames.',
      answer: 'Step off both tracks, or hit the clone: it pops. It lasts 3 s or one blame.',
      // the blot dist from them, angle degrees round from the line to Octo (the held side, else the roomier one); the
      // clone life s, or one copied git blame (its hit: the Fork's, knocked away from Octo, never toward him)
      startup: 0.35, active: 0.05, recovery: 0.25, cooldown: 3.5, damage: 0, kb: 0,
      dist: 100, angle: 100, life: 3,
      hit: { damage: 9, kb: 0, stun: 0.4, kind: 'special', prio: 2, stale: false } },
    evade: { name: 'Ink Jet', short: 'Ink Jet', do: 'ocInk', icon: 'ocInk', hold: null,
      blurb: 'A squirt of ink and he jets back (the way you hold, or away from them), untouchable, leaving a slippery ink puddle where he was.',
      tell: 'None: it\'s quick. Its cooldown shows on his key.', answer: 'Don\'t chase him through the ink; he\'s open for a moment as he lands.',
      // dist units over active s, untouchable; the puddle (r puddle, puddleLife s) where he was; recovery s open
      startup: 0, active: 0.2, recovery: 0.18, cooldown: 1.8, dist: 130, puddle: 32, puddleLife: 3.5 },
  },
  phPose: { coil: 'coil', shoot: 'shoot', blamed: 'shoot', droop: 'droop', fork: 'fork', forked: 'fork', rise: 'rise', push: 'slam', gather: 'slam',
    squirt: 'ink', jet: 'jet', land: 'ink' },
  phFade: ['blamed', 'forked', 'push', 'land'],
  // ocC the Force Push's gather (0..1)
  fields: { ocC: 0 },
  show: ['stand', 'coil', 'stand', 'rise', 'stand', 'fork', 'stand', 'ink'], cheer: 'rise',
};
const P = (a, b, inp) => [a, b, inp];
fighter.clips = {
  move1: { x: [-110, 40], len: 2.6, cam: { x: -30, w: 320 }, a: [P(0.3, 0.38, { light: 1 })] },
  move2: { x: [-40, 30], len: 2.4, cam: { x: 5, w: 300 }, a: [P(0.3, 0.9, { heavy: 1 })] },   // (held: the bigger slam)
  move3: { x: [-120, 40], len: 3.2, cam: { x: -20, w: 340 }, a: [P(0.3, 0.38, { special: 1 }), P(1.0, 1.08, { light: 1 })] },   // (the fork, then a blame from both)
  evade: { x: [-30, 110], len: 2.4, cam: { x: 10, w: 320 }, a: [P(0.6, 0.66, { guard: 1, x: 0, y: -1 })], b: [P(0.3, 0.38, { heavy: 1 })] },   // (out of Tux's toboggan)
};

// ---------------------------------------------------------------- helpers
export const SRC_R = 14;   // (a tentacle leaves its body this far out)
// the clone ready to copy his next move (popping up or standing), or null
const cloneFree = (F, f) => F.objs.find(b => b.kind === 'ocClone' && b.owner === f.i && b.t < b.life && (b.ph === 'idle' || b.ph === 'pop')) || null;
// a source: Octo (src 0) or his clone (its id); null if the clone's gone
function srcOf(F, f, src) {
  if (!src) return f;
  return F.objs.find(b => b.id === src && b.kind === 'ocClone' && b.ph !== 'poof') || null;
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
// a tentacle reaching them: the hit (Octo's, or the clone's: the Fork's), and they're knocked back AWAY from Octo (from
// wherever it came) out to his range, staggered. True if it connected
function whack(F, f, o, ob, k) {
  const M = f.stats.moves, mv = M.move1, H = k === 'move3' ? M.move3.hit : mv.hit;
  const d0 = Math.hypot(o.x - f.x, o.y - f.y), a = d0 > 2 ? Math.atan2(o.y - f.y, o.x - f.x) : ob.a;
  if (!F.hitF(f, o, H, { dir: a, obj: true, noFlank: true, move: k })) return false;
  if (F.lastRes === 'hit' && o.state === 'hurt' && o.hp > 0) {
    const gap = d0 - f.r - o.r, travel = Math.max(mv.minPush, mv.keep - gap), kk = o.stats.kbDecay * Math.min(o.slip ? o.stats.slipMul : 1, o.ice || 1);
    o.vx = Math.cos(a) * travel * kk; o.vy = Math.sin(a) * travel * kk;
  }
  F.ev('ocWhack', o.x, o.y, k === 'move3' ? 0.8 : 1, f.i, { move: k, to: o.i, a, src: ob.src, res: F.lastRes });
  return true;
}
// a Force Push's slam from (x, y) gathered ch (0..1): the shockwave, and the shove, away from him
export const pushR = (mv, ch) => mv.R + (mv.Rmax - mv.R) * ch;
function wave(F, f, o, mv, x, y, ch) {
  const R = pushR(mv, ch);
  spawn(F, f, { kind: 'ocWave', x, y, r: 0, R, life: 0.4 + 0.15 * ch, mv: null });
  F.ev('ocSlam', x, y, 1, f.i, { move: 'move2', ch });
  const d = Math.hypot(o.x - x, o.y - y);
  if (d - o.r * 0.5 <= R && o.z < 30 && !o.gone) {
    const kb = (1 - (1 - mv.edge) * clamp(d / R, 0, 1)) * (1 + mv.chargeKb * ch);
    if (F.hitF(f, o, mv, { dir: d > 2 ? Math.atan2(o.y - y, o.x - x) : f.face, obj: true, noFlank: true, move: 'move2', kbMul: kb, dmgMul: 1 + mv.chargeDmg * ch })) {
      if (F.lastRes === 'hit') {
        F.ev('ocBurst', o.x, o.y, 1, f.i, { move: 'move2', to: o.i, a: d > 2 ? Math.atan2(o.y - y, o.x - x) : f.face, ch });
        spawn(F, f, { kind: 'ocShove', to: o.i, ch, w: o.wallT, life: mv.slamT, mv: null });   // (watched for a wall: the slam)
      }
      return true;
    }
  }
  return false;
}
// shoved by his Push into a wall (it bounced them: fight.js walls): the slam, more damage on top of the wall's own
function wallSlam(F, f, o, mv, ch) {
  if (o.state === 'ko' || o.hp <= 0) return;
  const w = [...F.events].reverse().find(e => e.kind === 'wall' && e.who === o.i), dmg = mv.slam * (1 + mv.chargeDmg * ch) * (F.dmgMul || 1);
  o.hp = Math.max(0, o.hp - dmg); o.flash = 0.2;
  F.hitstop = Math.max(F.hitstop, 5 / 60);
  F.ev('ocWallSlam', w ? w.x : o.x, w ? w.y : o.y, 1, f.i, { move: 'move2', to: o.i, ch, nx: w ? w.nx : 0, ny: w ? w.ny : -1, dmg });
  if (o.hp <= 0) { F.release(o); o.move = null; F.go(o, 'ko'); F.ev('ko', o.x, o.y, 1, o.i); }
}
function poof(F, ob, how) { if (ob.ph === 'poof') return; ob.ph = 'poof'; ob.pt = 0; ob.how = how; ob.life = ob.t + 0.3; F.ev('ocPop', ob.x, ob.y, how === 'hit' ? 0.6 : 0.4, ob.owner, { move: 'move3', how }); }
// the foe's swing or thing reaching the clone (it pops): a move of theirs going on right by it and facing it, or one of
// their world things that hurts (a landing's ring, an eruption, Tux's stomp) over it
function struck(F, ob, foe) {
  if (foe.state === 'strike' && foe.move && dist(foe, ob) <= foe.r + ob.r + 24 && Math.abs(Math.atan2(Math.sin(toward(foe, ob) - foe.face), Math.cos(toward(foe, ob) - foe.face))) < 1.3) return true;
  for (const b of F.objs) {
    if (b.owner !== foe.i || b.t >= b.life) continue;
    const near = Math.hypot(b.x - ob.x, b.y - ob.y) <= (b.r || 0) + ob.r;
    if (near && (b.kind === 'shock' || (b.kind === 'geyser' && b.ph === 'erupt') || b.kind === 'frost' || b.kind === 'ocWave')) return true;
  }
  return false;
}
// the blame's aim (docky.js aimAt's, led further): a human's on them, led by their walk for most of the time the
// tentacle takes to get there once it settles (lead s), the held way an offset; a bot's turns the way its stick holds
function aim(F, f, o, c, turn, dt, lead) {
  const toO = Math.atan2(o.y + o.vy * lead - f.y, o.x + o.vx * lead - f.x);
  let want = f.face;
  if (F.cfg.bots[f.i] == null) want = toO + (c.mag > 0.3 ? clamp(angDiff(c.dirA, toO), -1.2, 1.2) * Math.min(1, c.mag) * 0.75 : 0);
  else if (c.mag > 0.3) want = c.dirA;
  const w = clamp(angDiff(want, f.face) * 8, -turn, turn);
  f.aimW = (f.aimW || 0) + (w - (f.aimW || 0)) * Math.min(1, dt * 12);
  f.face += f.aimW * dt;
}
// where a line from (x, y) the way a runs to, at most L (a wall or a pillar stops it): its length
function lineLen(F, x, y, a, L) {
  const c = Math.cos(a), s = Math.sin(a);
  for (let d = SRC_R + 8; d < SRC_R + L; d += 8) if (F.contactsAll(x + c * d, y + s * d, 2).length) return Math.max(0, d - SRC_R - 4);
  return L;
}

/** @type {Record<string, import('./index.js').Kit>} */
const kits = {
  ocBlame: {   // // the aimed tentacle: the coil and its damp track, the shot
    moves: true,
    press(F, f, o, mv) {
      setPh(f, 'coil'); f.aimW = 0; f.vx *= 0.3; f.vy *= 0.3;
      if (F.cfg.bots[f.i] == null) f.face = toward(f, o);   // (a human's aim starts on them)
      spawn(F, f, { kind: 'ocLine', src: 0, a: f.face, len: 0, reach: mv.reach, lk: 0 });
      const cl = copy(F, f, 'move1');
      if (cl) { cl.face = toward(cl, o); spawn(F, f, { kind: 'ocLine', src: cl.id, x: cl.x, y: cl.y, a: cl.face, len: 0, reach: mv.reach, lk: 0 }); }
      F.ev('ocCoil', f.x, f.y, 0.4, f.i, { move: 'move1' });
    },
    wind(F, f, o, mv, dt, c) {
      f.vx *= 0.8; f.vy *= 0.8;
      const lk = f.t >= f.dur - mv.lock;   // (the last lock s: settled)
      if (!lk) aim(F, f, o, c, mv.aimTurn, dt, 0.7 * (Math.max(0, f.dur - f.t) + Math.max(0, dist(f, o) - f.r - o.r) / mv.speed));
      else f.aimW = 0;
      const u = clamp(f.t / Math.max(0.05, f.dur - mv.lock), 0, 1);
      for (const ln of F.objs) {
        if (ln.kind !== 'ocLine' || ln.owner !== f.i || !sameGo(f, ln)) continue;
        const S = srcOf(F, f, ln.src); if (!S) { gone(ln); continue; }
        ln.x = S.x; ln.y = S.y;
        if (!lk) ln.a = ln.src ? turnTo(ln.a, toward(S, o), mv.aimTurn * dt) : f.face;
        if (lk && !ln.lk) { ln.lk = 1; if (!ln.src) F.ev('ocLock', f.x, f.y, 0.3, f.i, { move: 'move1' }); }
        ln.len = lineLen(F, S.x, S.y, ln.a, mv.reach * u);
        if (ln.src) S.face = ln.a;
      }
    },
    start(F, f, o, mv) {
      setPh(f, 'shoot'); f.vx = f.vy = 0;
      for (const ln of F.objs) {
        if (ln.kind !== 'ocLine' || ln.owner !== f.i || !sameGo(f, ln)) continue;
        spawn(F, f, { kind: 'ocArm', src: ln.src, x: ln.x, y: ln.y, sx: ln.x, sy: ln.y, a: ln.a, len: 0, reach: lineLen(F, ln.x, ln.y, ln.a, mv.reach), ph: 'out', res: '', hx: 0, hy: 0 });
        F.ev('ocShoot', ln.x, ln.y, ln.src ? 0.45 : 0.6, f.i, { move: 'move1', src: ln.src, x2: ln.x + Math.cos(ln.a) * (SRC_R + mv.reach), y2: ln.y + Math.sin(ln.a) * (SRC_R + mv.reach) });
        gone(ln);
      }
    },
    step(F, f) {
      f.vx = f.vy = 0;
      const arm = F.objs.find(b => b.kind === 'ocArm' && b.src === 0 && b.owner === f.i && b.t < b.life && sameGo(f, b));
      const M = f.stats.moves.move1;
      if (!arm) { if (f.t > 0.05) { setPh(f, 'droop'); F.go(f, 'recover', M.miss); } return; }
      if (arm.ph === 'back') {
        if (arm.res === 'hit') { setPh(f, 'blamed'); F.go(f, 'recover', M.recovery); }
        else { setPh(f, 'droop'); F.go(f, 'recover', M.miss); }
      }
    },
    end(F, f, o, mv) { setPh(f, 'droop'); F.go(f, 'recover', mv.miss); return true; },
    phases: mv => [['coil', 'wind', mv.startup, 'coil', `the tentacle coils back; the damp track runs out on them (turning ${mv.aimTurn} rad/s), settled for the last ${mv.lock} s`],
      ['shoot', 'strike', `up to ${Math.round(mv.reach / mv.speed * 100) / 100}`, 'shoot', `the tentacle out ${mv.reach} at ${mv.speed} u/s, ${mv.width} either side (a wall stops it)`],
      ['blamed', 'recover', mv.recovery, 'shoot', `landed: ${mv.hit.damage}, a ${mv.hit.stun} s stagger, knocked back out to ${mv.keep} off him`], ['droop', 'recover', mv.miss, 'droop', 'missed: the tentacle flops back, open']],
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
      F.ev('ocFork', x, y, 0.6, f.i, { move: 'move3', x0: f.x, y0: f.y });
    },
    phases: mv => [['fork', 'wind', mv.startup, 'fork', 'splits: the ink blot shows where the clone pops up'], ['forked', 'strike', mv.active, 'fork', `the clone pops up ${mv.dist} from them`],
      ['forked', 'recover', mv.recovery, 'fork', `(the clone: ${mv.life} s or his next git blame, copied from its angle: ${mv.hit.damage}, knocked away from him; hit it and it pops)`]],
  },
  ocPush: {   // // tap or hold: held, the tentacles gather (ocC) for a bigger slam
    press(F, f, o, mv) {
      setPh(f, 'rise'); f.ocC = 0;
      spawn(F, f, { kind: 'ocRing', src: 0, R: mv.R, u: 0 });
      F.ev('ocRise', f.x, f.y, 0.5, f.i, { move: 'move2' });
    },
    wind(F, f, o, mv) {
      if (!f.rel) f.ocC = clamp((f.t - f.dur) / mv.holdMax, 0, 1);   // (gathering while it's held past the flick; let go, it keeps what it gathered)
      const rg = F.objs.find(b => b.kind === 'ocRing' && b.owner === f.i && sameGo(f, b));
      if (rg) { rg.x = f.x; rg.y = f.y; rg.u = clamp(f.t / Math.max(0.05, f.dur), 0, 1); rg.R = pushR(mv, f.ocC); }
    },
    hold(F, f, o, mv) { return !f.rel && f.t < f.dur + mv.holdMax; },
    start(F, f, o, mv) {
      setPh(f, 'push');
      const rg = F.objs.find(b => b.kind === 'ocRing' && b.owner === f.i && sameGo(f, b)); if (rg) gone(rg);
      if (wave(F, f, o, mv, f.x, f.y, f.ocC)) f.hit = true;
    },
    end(F, f, o, mv) {   // hit: the tentacles gather back; missed: they take longer, open
      if (f.hit) F.go(f, 'recover', mv.recovery);
      else { setPh(f, 'gather'); F.go(f, 'recover', mv.miss); }
      return true;
    },
    phases: mv => [['rise', 'wind', `${mv.startup} (+ up to ${mv.holdMax} held)`, 'rise', 'he bobs up, the tentacles flick up round him; held, they rise higher and gather'], ['push', 'strike', mv.active, 'slam', `the slam: within ${mv.R} (gathered: up to ${mv.Rmax}), ${mv.damage} (up to x${1 + mv.chargeDmg}), blasted off their feet (kb ${mv.kb}, up to x${1 + mv.chargeKb}; x${mv.edge} at the edge)`],
      ['push', 'recover', mv.recovery, 'slam', 'hit: the tentacles gather back'], ['gather', 'recover', mv.miss, 'slam', 'missed: they take longer, open']],
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

/** @type {Record<string, import('./index.js').ObjStep>} */
const objs = {
  // a blame's tell: gone once his coil is over (or cut short)
  ocLine(F, ob, dt, own) { if (!sameGo(own, ob) || own.state !== 'wind') gone(ob); },
  // the tentacle: out along its line; a touch whacks them back (away from Octo), then back it comes, as on a miss
  ocArm(F, ob, dt, own, foe, M) {
    const mv = M.move1, S = srcOf(F, own, ob.src), k = ob.src ? 'move3' : 'move1';
    if (S) { ob.sx = S.x; ob.sy = S.y; }
    if (ob.ph === 'out' && ((!ob.src && !(sameGo(own, ob) && own.state === 'strike')) || (ob.src && !S))) { ob.ph = 'back'; ob.res = ob.res || 'miss'; }   // (he was hit out of it, or the clone's gone)
    if (ob.ph === 'out') {
      ob.len = Math.min(ob.reach, ob.len + mv.speed * dt);
      const c = Math.cos(ob.a), s = Math.sin(ob.a), tx = ob.sx + c * (SRC_R + ob.len), ty = ob.sy + s * (SRC_R + ob.len);
      ob.x = tx; ob.y = ty;
      const [d] = segDist(foe.x, foe.y, ob.sx + c * SRC_R, ob.sy + s * SRC_R, tx, ty);
      if (d <= foe.r + mv.width && foe.z < 30 && !foe.gone && !['grabbed', 'down', 'getup', 'ko'].includes(foe.state)) {
        if (whack(F, own, foe, ob, k)) { ob.ph = 'back'; ob.res = 'hit'; ob.hx = foe.x; ob.hy = foe.y; ob.pt = ob.t; return; }
      }
      if (ob.len >= ob.reach) { ob.ph = 'back'; ob.res = 'miss'; ob.pt = ob.t; F.ev('ocFlop', tx, ty, 0.4, own.i, { move: k, src: ob.src }); }
    } else {
      if (ob.t - (ob.pt || 0) < 0.08) return;   // (a beat out there, flat on the floor or on them, before it comes back)
      ob.len -= mv.back * dt;
      ob.x = ob.sx + Math.cos(ob.a) * (SRC_R + Math.max(0, ob.len)); ob.y = ob.sy + Math.sin(ob.a) * (SRC_R + Math.max(0, ob.len));
      if (ob.len <= 0) gone(ob);
    }
  },
  // where the clone will pop up: gone if his fork is cut short
  ocSpot(F, ob, dt, own) { if (!sameGo(own, ob) || own.state !== 'wind') gone(ob); },
  // the clone: pops up, stands turned to them, copies his next blame; popped by a hit, gone after it or its time
  ocClone(F, ob, dt, own, foe) {
    ob.pt += dt;
    if (ob.ph === 'poof') return;
    if (ob.ph === 'pop' && ob.pt >= 0.2) { ob.ph = 'idle'; ob.pt = 0; }
    if (ob.ph !== 'copy') ob.face = turnTo(ob.face, toward(ob, foe), 8 * dt);
    if (struck(F, ob, foe)) { poof(F, ob, 'hit'); return; }
    if (ob.ph === 'copy') {
      const busy = own.ms === ob.cms && own.move && (own.state === 'wind' || own.state === 'strike');
      const arm = F.objs.some(b => b.kind === 'ocArm' && b.src === ob.id && b.t < b.life);
      if (!busy && !arm && ob.pt > 0.1) poof(F, ob, 'used');
    } else if (ob.t >= ob.dur) poof(F, ob, 'old');
  },
  ocRing(F, ob, dt, own) { if (!sameGo(own, ob) || own.state !== 'wind') gone(ob); },
  ocWave(F, ob) { ob.r = ob.R * Math.min(1, ob.t / 0.16); },
  // someone his Push shoved: a bounce off a wall within its time (their wallT starts again) is the slam
  ocShove(F, ob, dt, own, foe, M) {
    const o = F.f[ob.to];
    if (!o || o.state === 'ko') { ob.life = ob.t; return; }
    if (o.wallT < ob.w - 1e-9) { ob.life = ob.t; wallSlam(F, own, o, M.move2, ob.ch); return; }
    ob.w = o.wallT;
  },
  ocInk() {},
};

// ---------------------------------------------------------------- the bot
const unit = a => [Math.cos(a), Math.sin(a)];
/** @type {import('./index.js').BotHooks} */
const ai = {
  want: 150,   // // (at the tentacle's range, out of the rushers')
  // his character (js/fight-style.js): the zoner keeps you at tentacle's length and waits, mostly patient
  persona: { keep: 0.45, patient: 0.3, rush: 1, styles: [0.7, 1.5, 1] },   // (rush: presses a set-up fighter like Cpp before its traps are out)
  // what Octo's moves (and his clone's) throw at the other bot: [key, T, dur, way out, how far]
  threats(F, i, me, o) {
    const out = [];
    for (const b of F.objs) {
      if (b.owner === i || b.t < o.age || b.t >= b.life) continue;
      const ow = F.f[b.owner], M = ow.stats.moves, left = ow.state === 'wind' ? Math.max(0, ow.dur - ow.t) : 0;
      if (b.kind === 'ocLine' || (b.kind === 'ocArm' && b.ph === 'out')) {   // a git blame (his or the clone's): off its track, sideways
        const mv = M.move1, L = SRC_R + mv.reach + 10, x0 = b.kind === 'ocArm' ? b.sx : b.x, y0 = b.kind === 'ocArm' ? b.sy : b.y;
        const x1 = x0 + Math.cos(b.a) * L, y1 = y0 + Math.sin(b.a) * L, [d, u] = segDist(me.x, me.y, x0, y0, x1, y1);
        const line = b.kind === 'ocLine', need = me.r + mv.width + (line ? (b.lk ? 12 : 22) : 6) - d; if (need <= 0 || u >= 0.999) continue;   // (still turning on them: well clear)
        const side = Math.sign(Math.sin(Math.atan2(me.y - y0, me.x - x0) - b.a)) || 1;
        const T = line ? left + u * L / mv.speed : Math.max(0, u * L - SRC_R - b.len) / mv.speed;
        out.push(['l' + b.id + (line ? '' : 'o'), T, 0.1, b.a + side * Math.PI / 2, need]);
      }
    }
    // his Push (read off his body as it's seen, a moment late): out past its reach (further while he gathers)
    const mv = o.move && o.stats.moves[o.move], d = Math.hypot(me.x - o.x, me.y - o.y), away = d > 1 ? Math.atan2(me.y - o.y, me.x - o.x) : me.face + Math.PI;
    if (mv && o.state === 'wind' && mv.do === 'ocPush') {
      const R = o.t > o.dur ? mv.Rmax : mv.R, need = R + me.r * 0.5 + 8 - d;
      if (need > 0) out.push(['H' + o.ms, Math.max(0, o.left), 0.06, away, need]);
    }
    return out;
  },
  // in one of his moves: the blame aimed where it sees them (led partly, off by its error); a held Force Push let go once
  // they're inside its reach
  stick(F, i, me, o, C) {
    const mv = me.stats.moves[me.move];
    if (mv.do === 'ocBlame' && me.state === 'wind') {   // (a thin line: off by a few units, not a cone's worth)
      const K = C.K;
      if (K.ocAim !== me.ms) { K.ocAim = me.ms; K.ocErr = (18 - 14 * C.L.smart) * (0.6 + 0.8 * C.rng()) * (C.rng() < 0.5 ? -1 : 1); }
      const q = (Math.max(0, me.dur - me.t) + Math.max(0, C.g.gap) / mv.speed) * C.L.lead, x = o.x + o.vx * q, y = o.y + o.vy * q, a = Math.atan2(y - me.y, x - me.x);
      return unit(Math.atan2(y + Math.cos(a) * K.ocErr - me.y, x - Math.sin(a) * K.ocErr - me.x));
    }
    if (mv.do === 'ocPush' && me.state === 'wind' && me.t > me.dur) {
      const R = pushR(mv, clamp((me.t - me.dur) / mv.holdMax, 0, 1));
      if (Math.hypot(o.x - me.x, o.y - me.y) - o.r * 0.5 < R - 6 && C.rng() < 0.25 + 0.5 * C.L.smart) { C.m.hold.heavy = 0; C.m.queue.heavy = 0; }
    }
    return [0, 0];
  },
  punish(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap, toFoe, A } = C.g, B = M.move1;
    if (C.ready(1) && d < M.move2.R - 10 && w.fits(M.move2.startup + M.move2.active)) { C.fire(1); return [0, 0]; }   // (right next to him: shoved off, maybe into a wall)
    if (C.ready(0) && w.line && gap < B.reach - 10 && w.fits(B.startup + gap / B.speed)) { C.fire(0, 3); return unit(toFoe); }   // (the blame, from where he is)
    const wall = clearance(A, o.x, o.y, o.r).d < 90;
    if (C.ready(1) && wall && d < M.move2.Rmax - 12 && w.fits(M.move2.startup + M.move2.holdMax * 0.5 + M.move2.active)) { C.fire(1, 2 + Math.round(M.move2.holdMax * 30)); return [0, 0]; }
    return null;
  },
  neutral(F, i, me, o, C, w) {
    const M = me.stats.moves, { dist: d, gap, toFoe, A, cl: mine0 } = C.g, B = M.move1, L = C.L;
    const cl = F.objs.find(b => b.kind === 'ocClone' && b.owner === i && (b.ph === 'idle' || b.ph === 'pop') && b.t < b.life);
    const away = Math.atan2(me.y - o.y, me.x - o.x);
    // too close: the Push to throw them off (keener the closer, into a wall behind them), else jet away when it's spent
    const wall = clearance(A, o.x, o.y, o.r).d < 80 && d < M.move2.Rmax - 12;
    w.add(1, d < M.move2.R - 14 || wall ? (wall ? (w.busy ? 0.5 : 0.35) : w.busy ? 0.3 : 0.32) : 0, [0, 0], wall ? 2 + Math.round(M.move2.holdMax * 60) : 2);
    if (gap < 40 && !C.ready(1) && C.ready(3) && !(w.rush > 0.3) && C.rng() < 0.15 + 0.35 * L.smart) {   // (in his face, no Push: out, toward the room)
      const toC = Math.atan2(-me.y, -me.x), rm = mine0.d < 60 ? toC : away;
      return C.stepTo(Math.atan2(Math.sin(away) + 0.6 * Math.sin(rm), Math.cos(away) + 0.6 * Math.cos(rm)));
    }
    // the clone (a second line on them), from mid range; then the blame from both (the crossfire)
    w.add(2, !cl && d > 100 && d < 320 ? (w.spent ? 0.24 : 0.13) : 0, [0, 0]);
    const far = (w.line || cl) && gap > 25 && gap < B.reach - 12;
    w.add(0, far ? (cl ? 0.5 : w.busy ? 0.4 : 0.17) : gap <= 25 && w.line ? 0.04 : 0, unit(toFoe), 3);
    // keep at the tentacle's range: back off a rusher (round toward the middle if the wall's behind)
    const closing = ((o.vx || 0) * (me.x - o.x) + (o.vy || 0) * (me.y - o.y)) / Math.max(1, d);
    if (gap < 90 && F.phase !== 'sudden' && !(w.rush > 0.3) && (closing > 40 || !C.ready(0))) { const toC = Math.atan2(-me.y, -me.x), k = mine0.d < 70 ? 0.9 : 0.3; return [Math.cos(away) + k * Math.cos(toC), Math.sin(away) + k * Math.sin(toC)]; }
  },
  evadeWhen(T) { return [T > 0.01 && T < 0.16, T < 0.16]; },
};

export default { id: ID, fighter, kits, objs, ai };
