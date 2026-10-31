// @ts-check
// Tux (Larry Ewing's Linux penguin) for Fight, a plug-in (shape: js/kits/index.js; drawing and sounds:
// js/art/kit-tux.js; checks: test/kits/tux.mjs). Key 3 is the setup for keys 1 and 2:
// move1 Frozen Fish (txFish): a short slap in front with a frozen fish. Slaps landed in a row build (f.fishN): the
// third is a two-flippered wallop that knocks you down. A whiff, a wallop, a clean hit on him or a few seconds without
// one, and the row is gone. Armoured, a slap freezes whoever it hits for a moment. Tell: the fish over his shoulder
// (the wallop: overhead, slower).
// move2 Belly Slide (txSlide, hold to steer): on his belly, steering the held way, bouncing off walls (a few times,
// slower each time); running into you is a knockdown. He leaves a frost streak for a few seconds and slides faster
// along his own. Armoured, hits on him don't even chip the armour. A miss leaves him on his belly, open.
// move3 Ice Armour (txArmor): every hit on him chips the armour instead of his health (no flinch), for armT s. Its last
// chip or its time out bursts it into shards that stagger whoever's right next to him. Its cooldown starts once it's
// gone. A hit while it grows is a counter hit and stops it.
// evade Snow Dive (txDive): under a puff of snow, popping out a short way off the held way (away if none held),
// untouchable.
// Passive Stable: heavy (hard to push).
// Phases (f.ph): fishout, slap, slapped, fishmiss · walup, wallop, walloped, walmiss (the third in a row) · flop,
// slide, skid, belly · armup, armset · dive, under, popup.
// Fields: fishN (slaps landed in a row, 0..2), fishT (s since the last landed), fishH (his hurtN then), arm (armour
// chips left, 0: none), armT (s of armour left), iceT, iceTo (s the one his fish froze stays stuck, and who), wal (1:
// this swing is the wallop), sv (the slide's speed now).
// Objects: txStreak (pts [[x, y], ...] the frost behind his slide, mv/ms the slide that laid it, fade: when it starts
// to go).
// Events: txFishOut (wal), txSlap (a, wal), txThwack (to, a, n: the row now, wal, frz: froze them), txFlop (a whiff: x,
// y the fish), txFlopIn (the slide's flop), txSlide (a), txRam (to, a, plow), txBounce (nx, ny), txBelly, txArmUp,
// txArmor, txChip (n: chips left, by: the hitter), txPlow (a hit shrugged off mid-slide), txShatter (why: 'break' |
// 'out', stag: who it staggered, -1 none), txDive (x2, y2: where he'll pop up), txPop.
import { Math } from '../detmath.js';
import { AIM, D2R, TAU, angDiff, clamp, dist, landing, open, sameGo, segDist, setPh, spawn, toward, turnTo } from './lib.js';

const ID = 'tux';
/** @type {import('./index.js').FighterData} */
const fighter = {
  id: ID, name: 'Tux', lang: 'Linux', role: 'Ice tank',
  blurb: 'A heavy penguin with a frozen fish: he slaps you with it (the third in a row a wallop that floors you), belly-slides into you like a truck and freezes himself into a suit of ice armour that shrugs hits off and makes his fish and his slide worse news.',
  tagline: 'Heavy penguin: fish slaps, a belly slide like a truck, ice armour.',
  difficulty: 'easy',
  passive: 'Stable: heavy, so hits push him less far.',
  balance: 'Tank: heavy, a cheap slap that builds to a knockdown and a slide that rams from mid range; his armour wins trades but only soaks two hits. Swift and Docky get round him (quick feet, a wall), Cpp\'s flies can\'t outlast him. Against everyone on the ring: 51% Chill, 56% Normal, 57% Ruthless (2026-10-27, the rebuild: 82% at Normal before the slide was slowed and the armour thinned; the old kit was 78/71/67%). 2026-10-29, the approved kit changes (the slide\'s cooldown 2.4 -> 2.8, his fish bigger): about 60% at Normal and 62% at Ruthless (the ring, 16 / 12 fights a pair). 2026-10-29, the balance pass (all four arenas, 40 fights a pair, about ±5): 31% Chill, 50% Normal, 59% Ruthless (health 112 -> 108: he topped Ruthless; a sloppy Tux now slaps nearly as keenly as a sharp one, since the Fish is his whole game up close). Sharp bots get the most out of his quick Fish, so he\'s best at Ruthless (88% against Ferris and Bugdroid, who can\'t keep him off) and weak at Chill; Docky\'s Isolation and wall still beat him (18%). 2026-10-30, the balance check (40 fights a pair, all four arenas, about ±4): 34% Chill, 52% Normal, 60% Ruthless; a sloppy bot walking in for the slap measured no change at Chill, so it stays the timing his Fish row needs. 2026-10-31, the slap 7 -> 7.5 and the Wallop 13 -> 12, so each slap that lands counts more and the row\'s finish less: 41% Chill, 47% Normal, 59% Ruthless (16 fights a pair, about ±8; was 31 / 51 / 55 in the same field). A shorter whiff instead (0.3 -> 0.24) mostly helped Ruthless (63-66%), so it stays.',
  hp: 108, weight: 1.28,
  walk: 0.92, accel: 26, friction: 26, kbDecay: 2.9, radius: 18, slipMul: 0.12,
  moves: {
    move1: { name: 'Frozen Fish', short: 'Fish', do: 'txFish', icon: 'txFish', hold: null,
      blurb: 'His quick basic hit: he whips a frozen fish out from behind his back and slaps you with it. Slaps landed in a row build up: the third is a big two-flippered wallop that knocks you down. In his Ice Armour a slap freezes you stiff for a moment.',
      tell: 'The fish coming out over his shoulder. The wallop: raised high in both flippers, a beat slower.',
      answer: 'Keep out of its short reach, above all of the wallop. Whiffing, he flops the fish about: he\'s open a moment, and the row is gone.',
      // the fish out (startup), the slap (active s: a small step in at lunge u/s; whoever's within reach of his edge in
      // his front arc degrees: damage, kb, a stun-s stagger), then 'slapped' (recovery) if it hit, 'fishmiss' (miss s,
      // open) if not. Landed slaps in a row (within row s of each other) build f.fishN; with two, the next is the wallop
      // (last: its own startup, reach, damage, a knockdown; cooldown s after it). Armoured: a slap freezes them frz s
      startup: 0.12, active: 0.08, recovery: 0.18, miss: 0.3, cooldown: 0.8, contact: true,
      damage: 7.5, kb: 130, stun: 0.45, reach: 30, arc: 140, lunge: 70, row: 3, frz: 0.8,
      last: { name: 'Wallop', startup: 0.22, active: 0.1, recovery: 0.3, miss: 0.5, cooldown: 1.1, contact: true, damage: 12, kb: 330, kd: true, reach: 34, arc: 120, lunge: 110 } },
    move2: { name: 'Belly Slide', short: 'Slide', do: 'txSlide', icon: 'txSlide', hold: 'steer',
      blurb: 'Flops onto his belly and slides, steering the way you hold, bouncing off walls; run into someone and he hits like a truck. He leaves a thin streak of frost and slides faster along it next time. In his Ice Armour he\'s unstoppable: he ploughs right through you.',
      tell: 'A little hop forward as he flops onto his belly.',
      answer: 'Step off his line (he only steers so fast). Missing, he ends up lying on his belly: hit him there.',
      // the flop (startup), the slide (active s at speed u/s, x streak on a frost streak of his own, x ice on ice;
      // turning toward the held way at most turn rad/s): ramming whoever is in his path (reach past his edge, side: their
      // radius x this off his line): damage, kb, down; then skid (recovery) if it hit, belly (open) if not. A wall head
      // on bounces him off (x bounce speed, at most bounces times, then he's stopped flat). The streak lasts streakT s
      startup: 0.2, active: 0.45, recovery: 0.3, belly: 0.55, cooldown: 2.8,
     
      damage: 11, kb: 270, kd: true, contact: true, reach: 16, side: 0.6, speed: 390, turn: 1, streak: 1.3, ice: 1.15, bounce: 0.8, bounces: 2, streakT: 3.5, plowKb: 1.15 },
    move3: { name: 'Ice Armour', short: 'Armour', do: 'txArmor', icon: 'txArmor', hold: null,
      blurb: 'Ice crystallises over him into a suit of armour for a few seconds: hits chip the armour instead of his health, and he doesn\'t flinch. When it breaks or runs out it bursts into shards that stagger anyone right next to him. While it lasts his fish freezes whoever it slaps, and his slide ploughs through anything.',
      tell: 'Ice growing over him, from his feet up. Hit him then and it\'s gone.',
      answer: 'Don\'t waste big hits on it: back off out of the burst and wait it out, or chip it off from a distance. It has a long cooldown.',
      // the ice growing (startup: a hit then is a counter hit and it's gone), then armour: chips hits soaked (one each;
      // while sliding none at all), at most last s; then it bursts: whoever's within burst of his edge takes the shards
      // (hit: a small hit and a stagger). Its cooldown runs once the armour's gone
      startup: 0.32, active: 0.05, recovery: 0.15, cooldown: 6.5,
      chips: 2, last: 3, burst: 40, hit: { damage: 4, kb: 170, stun: 0.6 } },
    evade: { name: 'Snow Dive', short: 'Dive', do: 'txDive', icon: 'txDive', hold: null,
      blurb: 'Dives head first into a puff of snow and pops out a short way off the way you hold (away from them if you hold nothing), untouchable while he\'s under.',
      tell: 'A puff of snow, and a little snowy bump running along where he\'s going.', answer: 'Be where he pops up: he\'s open a moment.',
      startup: 0, active: 0.3, recovery: 0.2, cooldown: 2, dist: 110, dive: 0.07 },
  },
  phPose: { fishout: 'fishback', slap: 'fishslap', slapped: 'fishslap', fishmiss: 'fishslap', walup: 'walup', wallop: 'wallop', walloped: 'wallop', walmiss: 'wallop',
    flop: 'crouch', slide: 'slide', skid: 'slide', belly: 'belly', armup: 'armup', armset: 'burst', dive: 'slide', under: 'slide', popup: 'leap' },
  phFade: ['slapped', 'fishmiss', 'walloped', 'walmiss', 'armset', 'popup'],
  fields: { fishN: 0, fishT: 9, fishH: 0, arm: 0, armT: 0, iceT: 0, iceTo: -1, wal: 0, sv: 0 },
  show: ['stand', 'fishback', 'stand', 'wallop', 'stand', 'armup', 'stand', 'crouch'], cheer: 'summon',
};
const P = (a, b, inp) => [a, b, inp];
fighter.clips = {
  // three slaps in a row on a Duke standing there: the third the wallop, down he goes
  move1: { x: [-26, 22], len: 3.9, cam: { x: 20, w: 280 }, a: [P(0.3, 0.36, { light: 1 }), P(0.7, 1.4, { x: 1 }), P(1.55, 1.61, { light: 1 }), P(2, 2.8, { x: 1 }), P(2.95, 3.01, { light: 1 })] },
  move2: { x: [-100, 40], len: 2.2, cam: { x: -20, w: 300 }, a: [P(0.3, 0.38, { heavy: 1 })] },
  // the armour up, Duke's jab chips it (no flinch), the fish freezes him before his second, the slide ploughs him down,
  // and the armour runs out in a burst of shards
  move3: { x: [-26, 22], len: 4.4, cam: { x: 10, w: 270 }, a: [P(0.3, 0.36, { special: 1 }), P(0.8, 0.84, { light: 1 }), P(1.45, 1.51, { heavy: 1 })], b: [P(0.8, 0.82, { light: 1 })] },
  // a dive out from under Duke's jab
  evade: { x: [-30, 25], len: 2.2, cam: { x: 10, w: 280 }, a: [P(0.9, 0.95, { guard: 1, x: 0, y: -1 })], b: [P(0.92, 0.98, { light: 1 })] },
};

// ---------------------------------------------------------------- helpers
const armoured = f => f.arm > 0;
const sliding = f => f.move === 'move2' && f.state === 'strike' && f.ph === 'slide';
// the fish swing's numbers: the slap, or (the third in a row) the wallop
const swing = (f, mv) => f.wal ? mv.last : mv;
// a human's slide aimed straight at them when the press's 8-way key is near them (it only hits what's in his path)
function aimAssist(F, f, o) {
  const k = F.inp[f.i], keys = [k.x, k.y].every(v => v === 0 || Math.abs(v) === 1), to = toward(f, o);
  if (F.cfg.bots[f.i] == null && keys && Math.abs(angDiff(f.face, to)) < 30 * D2R) f.face = to;
}
// how far from a frost streak of his own (not the one being laid now): the nearest segment, in units
function streakDist(F, f, x, y) {
  let best = 1e9;
  for (const b of F.objs) {
    if (b.kind !== 'txStreak' || b.owner !== f.i || b.t >= b.life || sameGo(f, b) || !b.pts || b.pts.length < 2) continue;
    for (let k = 1; k < b.pts.length; k++) { const [d] = segDist(x, y, b.pts[k - 1][0], b.pts[k - 1][1], b.pts[k][0], b.pts[k][1]); if (d < best) best = d; }
  }
  return best;
}
// the armour bursts (its last chip, or its time out): shards at whoever's right next to him; the cooldown starts now
function shatter(F, f, why) {
  const mv = f.stats.moves.move3, o = F.f[1 - f.i];
  f.arm = 0; f.armT = 0; f.cd[2] = Math.max(f.cd[2], mv.cooldown);
  let stag = -1;
  if (open(o) && o.inv <= 0 && !o.under && !o.ghost && !['down', 'getup'].includes(o.state) && dist(f, o) - f.r - o.r <= mv.burst) {
    const a = toward(f, o), res = F.lastRes;
    if (F.hitF(f, o, mv.hit, { dir: a, obj: true, unblockable: true, noFlank: true, move: 'move3' }) && F.lastRes === 'hit') stag = o.i;
    F.lastRes = res;
  }
  F.ev('txShatter', f.x, f.y, 0.8, f.i, { move: 'move3', why, stag });
}
// the fish's row: gone (a whiff, a clean hit on him, too long since the last)
const breakRow = f => { f.fishN = 0; f.fishT = 9; };

// ---------------------------------------------------------------- the moves
/** @type {Record<string, import('./index.js').Kit>} */
const kits = {
  // Frozen Fish: out from behind his back (the tell), a short slap in front; the third in a row the wallop
  txFish: {
    moves: true,
    press(F, f, o, mv) {
      f.wal = f.fishN >= 2 ? 1 : 0;
      const S = swing(f, mv);
      if (f.wal) F.go(f, 'wind', S.startup);   // (the wallop: wound up higher, longer)
      setPh(f, f.wal ? 'walup' : 'fishout'); f.vx *= 0.45; f.vy *= 0.45;
      F.ev('txFishOut', f.x, f.y, f.wal ? 0.8 : 0.5, f.i, { move: 'move1', wal: f.wal, arm: armoured(f) ? 1 : 0 });
    },
    wind(F, f) { f.vx *= 0.85; f.vy *= 0.85; },   // (planting himself)
    start(F, f, o, mv) {
      const S = swing(f, mv);
      setPh(f, f.wal ? 'wallop' : 'slap'); f.face = turnTo(f.face, toward(f, o), 0.5);
      F.go(f, 'strike', S.active);
      F.ev('txSlap', f.x, f.y, f.wal ? 0.8 : 0.5, f.i, { move: 'move1', a: f.face, wal: f.wal });
    },
    step(F, f, o, mv) {
      const S = swing(f, mv);
      f.vx = Math.cos(f.face) * S.lunge; f.vy = Math.sin(f.face) * S.lunge;   // (a small step into it)
      if (f.hit || !open(o) || o.under || !F.reaches(f, o, S, 2)) return;
      const a = toward(f, o);
      if (!F.hitF(f, o, S, { dir: a, move: 'move1' })) return;
      f.hit = true;
      if (F.lastRes !== 'hit') return;
      let frz = 0;
      if (f.wal) { f.fishN = 0; f.fishT = 9; F.hitstop = Math.max(F.hitstop, 8 / 60); }
      else {
        f.fishN = Math.min(2, f.fishN + 1); f.fishT = 0; f.fishH = f.hurtN; F.hitstop = Math.max(F.hitstop, 4 / 60);
        if (armoured(f) && o.state === 'hurt' && o.hp > 0) {   // (armoured: frozen stiff a moment, stuck where they stand)
          o.vx *= 0.15; o.vy *= 0.15; F.go(o, 'stagger', mv.frz); f.iceT = mv.frz; f.iceTo = o.i; frz = 1;
        }
      }
      F.ev('txThwack', o.x - Math.cos(a) * o.r * 0.5, o.y - Math.sin(a) * o.r * 0.5, f.wal ? 1 : 0.6, f.i, { move: 'move1', to: o.i, a: f.face, n: f.fishN, wal: f.wal, frz });
    },
    end(F, f, o, mv) {   // landed: the fish back over his shoulder, a calm settle; a whiff: it flops about, open, the row gone
      const S = swing(f, mv);
      f.vx *= 0.3; f.vy *= 0.3;
      if (f.hit) { setPh(f, f.wal ? 'walloped' : 'slapped'); F.go(f, 'recover', S.recovery); }
      else {
        setPh(f, f.wal ? 'walmiss' : 'fishmiss'); F.go(f, 'recover', S.miss); breakRow(f);
        F.ev('txFlop', f.x + Math.cos(f.face) * (f.r + 14), f.y + Math.sin(f.face) * (f.r + 14), 0.4, f.i, { move: 'move1', a: f.face, wal: f.wal });
      }
      if (f.wal) f.cd[0] = S.cooldown;   // (a longer cooldown after the wallop)
      return true;
    },
    phases: mv => [['fishout', 'wind', mv.startup, 'fishback', 'the fish whipped out from behind his back'], ['slap', 'strike', mv.active, 'fishslap', `the slap, a small step in (${mv.lunge} u/s): ${mv.damage}, kb ${mv.kb}, a ${mv.stun} s stagger, reach ${mv.reach} past his edge, ${mv.arc}°; armoured, frozen ${mv.frz} s`],
      ['slapped', 'recover', mv.recovery, 'fishslap', 'hit: the fish back'], ['fishmiss', 'recover', mv.miss, 'fishslap', 'whiffed: the fish flops about, open, the row gone'],
      ['walup', 'wind', mv.last.startup, 'walup', 'the third in a row: the fish raised overhead in both flippers'], ['wallop', 'strike', mv.last.active, 'wallop', `the wallop: ${mv.last.damage}, kb ${mv.last.kb}, down, reach ${mv.last.reach}`],
      ['walloped', 'recover', mv.last.recovery, 'wallop', 'hit: the bent fish back'], ['walmiss', 'recover', mv.last.miss, 'wallop', 'whiffed: open']],
  },
  // Belly Slide: the flop (the tell), then on his belly, steering the held way, bouncing off walls, ramming
  txSlide: {
    moves: true,
    press(F, f, o) { setPh(f, 'flop'); f.vx *= 0.3; f.vy *= 0.3; aimAssist(F, f, o); F.ev('txFlopIn', f.x, f.y, 0.5, f.i, { move: 'move2', a: f.face }); },
    wind(F, f) { f.vx *= 0.8; f.vy *= 0.8; },
    start(F, f, o, mv) {
      setPh(f, 'slide'); f.sv = mv.speed;
      spawn(F, f, { kind: 'txStreak', pts: [[Math.round(f.x * 10) / 10, Math.round(f.y * 10) / 10]], fade: 0 });
      F.ev('txSlide', f.x, f.y, 0.7, f.i, { move: 'move2', a: f.face, arm: armoured(f) ? 1 : 0 });
    },
    step(F, f, o, mv, dt, c) {
      if (c.mag > 0.3) f.face = turnTo(f.face, c.dirA, mv.turn * dt);   // (steered the held way, only so fast)
      const fast = streakDist(F, f, f.x, f.y) < f.r * 0.8 ? mv.streak : 1, sp = mv.speed * fast * (f.ice > 0 ? mv.ice : 1);
      f.sv += (sp - f.sv) * Math.min(1, dt * 10);
      f.vx = Math.cos(f.face) * f.sv; f.vy = Math.sin(f.face) * f.sv;
      const st = F.objs.find(b => b.kind === 'txStreak' && b.owner === f.i && sameGo(f, b));   // (the frost behind him)
      if (st) { const L = st.pts[st.pts.length - 1]; if (Math.hypot(f.x - L[0], f.y - L[1]) > 12 && st.pts.length < 48) st.pts.push([Math.round(f.x * 10) / 10, Math.round(f.y * 10) / 10]); }
      if (f.hit || !open(o) || o.under) return;
      const ax = Math.cos(f.face), ay = Math.sin(f.face), rx = o.x - f.x, ry = o.y - f.y;   // (in his path, not off his side)
      if (dist(f, o) > f.r + o.r + mv.reach || Math.abs(rx * ay - ry * ax) > f.r + o.r * mv.side || rx * ax + ry * ay <= 0) return;
      const plow = armoured(f);
      if (!F.hitF(f, o, mv, { dir: toward(f, o) + angDiff(f.face, toward(f, o)) / 2, kbMul: plow ? mv.plowKb : 1 })) return;   // (untouchable: on through)
      f.hit = true;
      if (F.lastRes === 'hit') F.ev('txRam', f.x + ax * f.r, f.y + ay * f.r, 1, f.i, { move: 'move2', to: o.i, a: f.face, plow: plow ? 1 : 0 });
      if (plow) return;   // (armoured: ploughs on through)
      if (f.state === 'strike') { f.vx *= 0.35; f.vy *= 0.35; setPh(f, 'skid'); F.go(f, 'recover', mv.recovery); }
    },
    end(F, f, o, mv) {   // ran out: if it hit, a skid to a stop; else flat on his belly, open
      if (f.hit) { setPh(f, 'skid'); F.go(f, 'recover', mv.recovery); f.vx *= 0.5; f.vy *= 0.5; }
      else { setPh(f, 'belly'); F.go(f, 'recover', mv.belly); F.ev('txBelly', f.x, f.y, 0.5, f.i, { move: 'move2' }); }
      return true;
    },
    wall(F, f, c) {
      const mv = f.stats.moves.move2, dx = Math.cos(f.face), dy = Math.sin(f.face), dn = dx * c.nx + dy * c.ny;
      if (dn > -0.35) { const vn = f.vx * c.nx + f.vy * c.ny; f.vx -= vn * c.nx; f.vy -= vn * c.ny; f.face = Math.atan2(dy - dn * c.ny, dx - dn * c.nx); return true; }   // (glancing: along it)
      if (f.bnc >= mv.bounces) {   // (bounced enough: stopped flat against it)
        f.vx *= 0.15; f.vy *= 0.15; F.ev('wall', f.x - c.nx * f.r, f.y - c.ny * f.r, 0.3, f.i, { nx: c.nx, ny: c.ny });
        setPh(f, 'belly'); F.go(f, 'recover', mv.belly); F.ev('txBelly', f.x, f.y, 0.5, f.i, { move: 'move2' });
        return true;
      }
      f.bnc++; f.face = Math.atan2(dy - 2 * dn * c.ny, dx - 2 * dn * c.nx); f.sv *= mv.bounce;   // (head on: off it, like a puck)
      f.vx = Math.cos(f.face) * f.sv; f.vy = Math.sin(f.face) * f.sv;
      F.ev('txBounce', f.x - c.nx * f.r, f.y - c.ny * f.r, 0.6, f.i, { move: 'move2', nx: c.nx, ny: c.ny });
      return true;
    },
    phases: mv => [['flop', 'wind', mv.startup, 'crouch', 'a hop forward onto his belly, pointed the way the press aimed him'],
      ['slide', 'strike', 'up to ' + mv.active, 'slide', `on his belly at ${mv.speed} u/s (x${mv.streak} on his own frost streak), steering ${mv.turn} rad/s the held way, off walls ${mv.bounces} times: ${mv.damage}, kb ${mv.kb}, down; armoured, through them`],
      ['skid', 'recover', mv.recovery, 'slide', 'hit: skids to a stop'], ['belly', 'recover', mv.belly, 'belly', 'missed, or stopped by a wall: flat, open']],
  },
  // Ice Armour: the ice growing over him (the tell), then armour (fighter.guard soaks the hits; tick runs it down)
  txArmor: {
    moves: true,
    can(F, f) { return !armoured(f); },
    press(F, f) { setPh(f, 'armup'); f.vx *= 0.3; f.vy *= 0.3; F.ev('txArmUp', f.x, f.y, 0.6, f.i, { move: 'move3' }); },
    wind(F, f) { f.vx *= 0.8; f.vy *= 0.8; },
    start(F, f, o, mv) { setPh(f, 'armset'); f.vx = f.vy = 0; f.arm = mv.chips; f.armT = mv.last; F.ev('txArmor', f.x, f.y, 0.8, f.i, { move: 'move3' }); },
    step(F, f) { f.vx = f.vy = 0; },
    phases: mv => [['armup', 'wind', mv.startup, 'armup', 'the ice growing over him (a hit now: a counter hit, and it\'s gone)'], ['armset', 'strike', mv.active, 'burst', `armoured: ${mv.chips} hits chipped off it, for ${mv.last} s`],
      ['armset', 'recover', mv.recovery, 'burst', `then it bursts: within ${mv.burst} of him, ${mv.hit.damage} and a ${mv.hit.stun} s stagger`]],
  },
  // Snow Dive: head first into a puff of snow, under it the held way (untouchable), popping out a way off
  txDive: {
    moves: true,
    start(F, f, o, mv) {
      const c = F.ctl(f), a = c.mag > 0.3 ? c.dirA : toward(o, f), [x, y] = landing(F, f, o, a, mv.dist), d = Math.hypot(x - f.x, y - f.y);
      setPh(f, 'dive'); f.inv = Math.max(f.inv, 2 / 60); f.face = a;
      f.vx = (x - f.x) / mv.active; f.vy = (y - f.y) / mv.active;
      F.ev('txDive', f.x, f.y, 0.5, f.i, { move: 'evade', x2: x, y2: y, d });
    },
    step(F, f, o, mv) {
      f.inv = Math.max(f.inv, 2 / 60);
      if (f.t >= mv.dive) { setPh(f, 'under'); f.under = 1; }
    },
    end(F, f, o, mv) { f.inv = 0; f.under = 0; f.vx *= 0.2; f.vy *= 0.2; setPh(f, 'popup'); F.go(f, 'recover', mv.recovery); F.ev('txPop', f.x, f.y, 0.6, f.i, { move: 'evade' }); return true; },
    phases: mv => [['dive', 'strike', mv.dive, 'slide', 'head first into a puff of snow: untouchable'], ['under', 'strike', Math.round((mv.active - mv.dive) * 100) / 100, '(under the snow)', `${mv.dist} the held way (away from them if nothing's held), untouchable`],
      ['popup', 'recover', mv.recovery, 'leap', 'pops out: open']],
  },
};

// a hit on him: armoured, it chips the armour (no damage, no flinch; mid-slide not even that), else as usual
fighter.guard = (F, a, d, mv, opt) => {
  if (!armoured(d) || d.state === 'ko' || (d.inv > 0 && !opt.hold) || d.under) return undefined;
  const ang = opt.dir ?? toward(a, d);
  F.hitstop = Math.max(F.hitstop, 3 / 60);
  if (sliding(d) && !opt.hold) {   // (unstoppable: ploughs through it)
    F.lastRes = 'soak'; F.ev('txPlow', d.x, d.y, 0.4, d.i, { move: 'move3', by: a.i, a: ang });
    return true;
  }
  d.arm--; d.flash = 0.06;
  d.vx += Math.cos(ang) * (mv.kb || 0) * 0.12 / d.stats.weight; d.vy += Math.sin(ang) * (mv.kb || 0) * 0.12 / d.stats.weight;
  F.ev('txChip', d.x, d.y, 0.6, d.i, { move: 'move3', n: d.arm, by: a.i, a: ang });
  if (d.arm <= 0) shatter(F, d, 'break');
  F.lastRes = 'soak';
  return true;
};
// his timers: the fish's row, the armour running down (its cooldown held till it's gone), the one his fish froze
fighter.tick = (F, f, dt, live) => {
  f.fishT += dt;
  if (f.fishN > 0 && (f.fishT > f.stats.moves.move1.row || f.hurtN !== f.fishH)) breakRow(f);
  if (armoured(f) && f.state === 'ko') { f.arm = 0; f.armT = 0; }
  if (armoured(f)) {
    f.cd[2] = Math.max(f.cd[2], f.stats.moves.move3.cooldown);
    if (live) f.armT -= dt;
    if (f.armT <= 0) shatter(F, f, 'out');
  }
  if (f.iceT > 0) { const o = F.f[f.iceTo]; f.iceT = o && o.state === 'stagger' ? Math.max(0, f.iceT - dt) : 0; if (f.iceT <= 0) f.iceTo = -1; }
};

/** @type {Record<string, import('./index.js').ObjStep>} */
const objs = {
  // the slide's frost streak: laid while the slide lasts, then fading out over a few seconds
  txStreak(F, ob, dt, own) {
    if (!ob.fade && !(sameGo(own, ob) && own.ph === 'slide')) { ob.fade = ob.t || 0.01; ob.life = ob.t + own.stats.moves.move2.streakT; }
  },
};

// ---------------------------------------------------------------- the bot
/** @type {import('./index.js').BotHooks} */
const ai = {
  want: 115,   // (close: in reach of a step and a slap, his slide well within range)
  // his character (js/fight-style.js): a tank that walks forward, mostly aggressive
  persona: { aggr: 0.35, patient: 0.2, styles: [1.5, 1, 0.7] },
  // Tux's tells, for the other bot: the slide coming (off its line, sideways), the fish coming out (back out of its
  // reach), the armour about to burst (out of the shards' reach)
  threats(F, i, me, o) {
    const out = [], ow = F.f[1 - i], M = ow.stats.moves, gap = dist(me, o) - me.r - o.r;
    if (o.move === 'move2' && (o.state === 'wind' || (o.state === 'strike' && o.ph === 'slide'))) {
      const S = M.move2, left = o.state === 'wind' ? Math.max(0, o.left) : 0, L = S.speed * (o.state === 'wind' ? S.active : Math.max(0, o.left)) + 10;
      const ex = Math.cos(o.face), ey = Math.sin(o.face), u = Math.max(0, Math.min(L, (me.x - o.x) * ex + (me.y - o.y) * ey)), dd = Math.hypot(me.x - o.x - ex * u, me.y - o.y - ey * u);
      const need = o.r + me.r + S.reach + 14 - dd;   // (a little more: he steers)
      if (need > 0) { const side = Math.sign(ex * (me.y - o.y) - ey * (me.x - o.x)) || 1; out.push(['H' + o.ms, left + u / S.speed, 0.1, o.face + side * Math.PI / 2, need]); }
    }
    if (o.move === 'move1' && o.state === 'wind') {
      const S = o.ph === 'walup' ? M.move1.last : M.move1;
      if (gap < S.reach + 12) out.push(['f' + o.ms, Math.max(0.02, o.left), S.active, toward(o, me), S.reach + 10 - gap]);
    }
    if (ow.arm > 0 && ow.armT < 0.45 && ow.armT > 0) {   // (the armour's about to go: the burst)
      const need = M.move3.burst + 10 - gap;
      if (need > 0) out.push(['b' + ow.ms, ow.armT, 0.05, toward(ow, me), need]);
    }
    return out;
  },
  // armoured: no point hitting him (it's chipped, he doesn't flinch, the burst may catch you): the other bot holds off,
  // backing out of the shards' reach (wary is read in fight-ai.js neutral and punishK: p how strongly, walk the way)
  wary(F, i, me, o) {
    const ow = F.f[1 - i];
    if (!(ow.arm > 0) || ow.armT < 0.25) return null;
    const gap = dist(me, ow) - me.r - ow.r, a = toward(ow, me);
    return { p: 0.85, walk: gap < ow.stats.moves.move3.burst + 30 ? [Math.cos(a), Math.sin(a)] : [0, 0] };
  },
  // armoured, he doesn't walk off what's coming: it only chips the armour
  brave(F, me) { return me.arm > 0 && me.armT > 0.4; },
  // in his own moves: the slide steered onto where they'll be (as seen, led, off by this go's error)
  stick(F, i, me, o, C) {
    if (me.move === 'move2' && (me.state === 'wind' || (me.state === 'strike' && me.ph === 'slide'))) {
      const S = me.stats.moves.move2, t = (me.state === 'wind' ? Math.max(0, me.dur - me.t) : 0) + Math.max(0, dist(me, o) - me.r - o.r) / S.speed;
      const [x, y] = C.aimAt('sl' + me.ms, Math.min(0.5, t)), a = Math.atan2(y - me.y, x - me.x);
      if (me.state === 'strike' && Math.abs(angDiff(a, me.face)) > 1.6) return [0, 0];   // (gone past them: on straight)
      return [Math.cos(a), Math.sin(a)];
    }
    return [0, 0];
  },
  punish(F, i, me, o, C, w) {
    const M = me.stats.moves, { gap, toFoe } = C.g, S = M.move2, Fi = me.fishN >= 2 ? M.move1.last : M.move1;
    if (C.ready(0) && gap < Fi.reach + 2 && w.fits(Fi.startup + 0.03)) { C.fire(0); return C.unit(toFoe); }   // (right there: the fish)
    if (w.line && C.ready(1) && gap > 4 && gap < S.speed * S.active * 0.85 && w.fits(S.startup + Math.max(0, gap) / S.speed)) { C.fire(1); return C.unit(toFoe); }
    if (C.ready(2) && w.a > M.move3.startup + 0.05 && gap < 140) { C.fire(2); return [0, 0]; }   // (they're down a while: the armour on as they get up)
    if (C.ready(0) && gap - Fi.reach < 150 * me.stats.walk * (w.b - Fi.startup - 0.12)) return C.unit(toFoe);   // (open a while, a step off: in for the fish)
    return null;
  },
  neutral(F, i, me, o, C, w) {
    const M = me.stats.moves, { gap, toFoe } = C.g, S = M.move2, Fi = me.fishN >= 2 ? M.move1.last : M.move1, L = C.L;
    const inSlide = w.line && gap > 10 && gap < S.speed * S.active * 0.8, inFish = gap < Fi.reach + 4, row = me.fishN > 0 && me.fishT < M.move1.row - 0.6;
    if (me.arm > 0) {   // armoured: press them (the fish freezes, the slide ploughs through), walking in
      w.add(0, inFish ? 0.7 : 0, C.unit(toFoe));
      w.add(1, inSlide ? (w.busy ? 0.6 : 0.3 + 0.2 * L.smart) : 0, C.unit(toFoe));
      return C.unit(toFoe);
    }
    if (C.live.state === 'stagger' && me.iceT > 0) { w.add(1, inSlide || gap < 40 ? 0.9 : 0, C.unit(toFoe)); w.add(0, inFish ? 0.6 : 0, C.unit(toFoe)); return C.unit(toFoe); }   // (frozen by the fish: the slide)
    w.add(2, gap < 150 ? (w.busy ? 0.35 : 0.1 + 0.12 * L.smart) : 0, [0, 0]);   // (the armour up, close enough to press with it)
    w.add(0, inFish ? (w.busy ? 0.6 : row ? 0.55 + 0.15 * L.smart : 0.35 + 0.15 * L.smart) : 0, C.unit(toFoe));
    w.add(1, inSlide ? (w.busy ? 0.4 : 0.1) : 0, C.unit(toFoe));
    if (row && !inFish && gap < 90) return C.unit(toFoe);   // (a row going: after them for the next)
    return undefined;
  },
  // armoured, no need to dive out of anything; else untouchable through it (as the dive lasts)
  evadeWhen(T, dur, E, me) { if (me && me.arm > 0) return [false, false]; return [T > 0.02 && T + dur < E.active - 0.04, T + dur < E.active - 0.04]; },
};

export default { id: ID, fighter, kits, objs, ai };
