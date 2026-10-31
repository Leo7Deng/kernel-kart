// @ts-check
// Duke (Java) for Fight: three moves and an evade (js/kits/index.js has the shape): HotSpot Jab (move1, the light
// key), Hot Java (move2, heavy), Stop the World (move3, special), Garbage Collect (the evade, guard). His drawing and
// sounds: js/draw-moves.js (an art plug-in in all but name, called through draw-kits.js and fight-ui.js).
//   jab        HotSpot Jab: a quick one-two where he stands (out at once after a blink), his only damage; each jab that
//              lands in a row hits harder (f.hot), the second jab at full heat boils over (knocks down); a whiff cools
//              him off. Phases ready (wind), jab1, jab2 (strike), jabend / jabmiss (recover). Events jab, heat, boil, cool
//   hotjava    Hot Java: a steaming coffee pot slapped onto them from right up close: it sticks (object pot: rides on
//              whoever has it, brews for its fuse, boils over: a big knockdown, or a scald on someone down); hit him
//              first and it hops back onto him. Phases potup, slap, slapped / potmiss. Events potslap, potstick,
//              potmiss, pothop, erupt, potgone
//   stopworld  Stop the World: the arm up, a snap, a ring growing out from him (object ring); whoever its edge touches
//              as it grows: frozen (the hits on them store their knockback till the thaw: fight.js). Phases raise, snap (wind),
//              stop. Events snap, freeze, stopmiss, ringbreak
//   gc         Garbage Collect: a short blink the held way (or away from them), untouchable, two charges; the jab
//              pressed out of it comes out at once (its recovery cut short: the kit's recover hook). Phases blinkout,
//              blinkin. Event blink
// Fighter fields: hot (0..move1.hot.max), hotT (s since a jab landed), seg (the jab of the one-two that landed last).
// DOM-free, deterministic (randomness only from F.rngs and the bot's C.rng).
import { Math } from '../detmath.js';
import { clamp } from '../core.js';
import { rayClear } from '../fight-arenas.js';
import { angDiff, angMid, mine, sameGo, setPh, turnTo } from './lib.js';

const ID = 'duke';
const D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = a => [Math.cos(a), Math.sin(a)];
// a world object of his, as it always was (no defaults filled in: the objects carry exactly these fields)
const spawn = (F, o) => { o.id = ++F.oid; F.objs.push(o); return o; };

/** @type {import('./index.js').FighterData} */
const fighter = {
  id: 'duke', name: 'Duke', lang: 'Java', role: 'Assassin',
  blurb: 'A quick Java assassin with one jab that heats up the longer he keeps landing it, a steaming coffee pot he slaps on you from right up close that boils over like a ticking bomb, and a snap of the fingers that stops the world.',
  tagline: 'Fast assassin: a jab that heats up, a ticking coffee pot, a time stop.',
  difficulty: 'hard',   // (strings and setups: the freeze, a blink in, a hot string)
  passive: 'Quick feet: the fastest walker in the fight.',
  balance: 'Assassin: the fastest walker, a jab that heats up over a string, a freeze to set one up and a pot that sticks and boils over (hard to land on a mover, sure on a statue). The freeze feeds his big damage, so the slow, open ones suffer most (Octo, Docky, Bugdroid); Pyth\'s reach and Tux\'s ice hold him off best. He takes the most skill (the user: fine to sit higher when the bots are good). 2026-10-31 (the user: slightly less dashes, jab and coffee damage): about 66% Chill, 66% Normal, 73% Ruthless (40 fights a pair). 2026-10-31, a sloppy bot plays him sloppier (SLOP by level: blinks in from too far, jabs and the pot out of reach, dropped strings, a floored foe often let up), so his skill shows: 35% Chill, 51% Normal, 63% Ruthless, floor 3% and ceiling 84% (was 10 / 92; 40 fights a pair).',
  hp: 118, weight: 0.89, walk: 1.52, accel: 32, friction: 32, kbDecay: 3.4, radius: 15,
  slipMul: 0.25,
  // his own state (fresh every round): hot, how hot his jab is (0..move1.hot.max: HotSpot, a landed jab +1), hotT (s
  // since the last one landed: past hot.hold it cools off at hot.cool a second)
  fields: { hot: 0, hotT: 9, seg: 0 },   // (seg: the jab of the one-two that landed last)
  // the 3D pose for each phase of his moves (fight.js poseOf; art/model3d.js DUKE_POSES), and the recoveries that stand
  // back up halfway
  phPose: { ready: 'guard', jab1: 'jab1', jab2: 'jab2', jabend: 'jab2', jabmiss: 'jab2', raise: 'snapup', snap: 'snap', stop: 'snap',
    potup: 'potup', slap: 'slap', slapped: 'slap', potmiss: 'slap', blinkout: 'blinkout', blinkin: 'blinkin' },
  phFade: new Set(['stop', 'blinkin', 'jabend', 'slapped', 'potmiss']),
  show: ['stand', 'jab1', 'stand', 'jab2', 'stand', 'snap', 'stand', 'potup', 'stand', 'blinkin'], cheer: 'jab1',   // (the setup screen's stage loop, his cheer)
  tick(F, f, dt) {   // (HotSpot cooling off: held hot.hold s after the last jab that landed, then down at hot.cool a second)
    const H = f.stats.moves.move1.hot; f.hotT += dt;
    if (f.hot > 0 && f.hotT > H.hold) f.hot = Math.max(0, f.hot - H.cool * dt);
  },
  moves: {
    move1: { name: 'HotSpot Jab', short: 'Jab', do: 'jab', icon: 'jab', hold: null,
      blurb: 'A quick one-two from where he stands, out at once: his only damage. It heats up: every jab that lands in a row hits harder, and the second jab of a hot one-two boils over and knocks you down. A whiff cools him right off.',
      tell: 'Fists up for a blink of an eye: too quick to see coming up close. How hot he is shows on his fists: glowing warmer, then steaming like a fresh coffee.',
      answer: 'Keep out of his short reach (he doesn\'t step in: the blink is how he gets close). Back off a steaming Duke: make him whiff and he cools right down.',
      // startup (the 'ready' phase, fists up), then jab1 and jab2 (each its window s from the start of its half of
      // active, reach from his edge, arc degrees; hit / last their own damage and knockback), then recovery (one
      // landed) or miss (both whiffed: he cools off). No lunge: the blink is his movement. HotSpot (hot): each landed
      // jab x (1 + step x heat) its damage, then heat + 1 (at most max); the second jab at max heat boils over (boil:
      // knocks down, heat back to 0); heat holds hold s after the last landing, then cools cool a second; a one-two
      // that lands nothing: back to 0. On a frozen foe x frozen (no one-combo kills)
      startup: 0.06, active: 0.2, recovery: 0.14, miss: 0.48, cooldown: 0.7, reach: 22,
      arc: 110, window: 0.05, contact: true,
      hit: { damage: 4.5, kb: 40, stun: 0.34 }, last: { damage: 6.5, kb: 90, stun: 0.32 }, boil: { damage: 7.5, kb: 300, kd: true },
      hot: { step: 0.15, max: 3, hold: 1, cool: 2.5, frozen: 0.7 } },
    move2: { name: 'Hot Java', short: 'Hot Java', do: 'hotjava', icon: 'hotjava', hold: null,
      blurb: 'Slaps a steaming coffee pot onto you from right up close. It sticks, rattling and brewing like a ticking bomb, and a moment later boils over all over you: a really big hit that knocks you down. Land any hit on him before it whistles and it hops back onto him. On a statue frozen by Stop the World it always sticks and can\'t be passed back.',
      tell: 'He lifts a steaming coffee pot over his shoulder before he slaps it on: only from right next to you. Once it\'s on you it rattles, puffs steam faster and faster and whistles just before it blows.',
      answer: 'Keep out of his short reach while the pot is up (it misses a moving target easily, he\'s open after). Stuck with it: chase him and hit him to pass it back before it whistles (then it\'s yours), or evade as it blows.',
      // the pot up over his shoulder (startup s: 'potup', the tell), the slap (active s: 'slap', a little step in at
      // lunge u/s): whoever is within reach of his edge, in his front arc degrees, takes the slap (hit: a tap and a
      // short flinch) and the pot sticks on them. Then recovery ('slapped'); a miss: open miss s ('potmiss', the pot
      // dropped). The pot rides on them for fuse s (whistling the last whistle s), then boils over (boil: knocks down,
      // from above: no block; erupt s of the drawn eruption). Hit Duke before it boils and it hops back onto him (hop s
      // of the drawn hop; once), same timer. Down or getting up when it's due, it scalds them where they lie: x
      // downMul, no second knockdown
      startup: 0.12, active: 0.08, recovery: 0.2, miss: 0.5, cooldown: 4, reach: 22, arc: 110, lunge: 140, contact: true,
      hit: { damage: 1, kb: 20, stun: 0.2 }, fuse: 1.5, whistle: 0.4, boil: { damage: 25, kb: 280, kd: true, downMul: 0.6 }, erupt: 0.35, hop: 0.22, fzReach: 16 },
      // once it whistles it can't be passed back; slapped on a statue (fzReach more reach, all round) it always sticks,
      // never hops and boils over at full damage even on someone the string floored: freeze -> pot is his big combo
    move3: { name: 'Stop the World', short: 'Stop World', do: 'stopworld', icon: 'stopworld', hold: null,
      blurb: 'He snaps his fingers: a grey ripple spreads out, and whoever it touches freezes. Every jab on the statue lands and heats him up, its knockback saved for the thaw: blink in and string them.',
      tell: 'A pocket watch swings up into his raised hand, then a snap, and a grey ripple spreads out from him.',
      answer: 'Get out of its reach before the ripple gets to you, or hit him as his arm goes up. Freezing nobody leaves him open, and it comes back slowly.',
      // the arm up (startup s: 'raise', the pocket watch swinging up), then the ring grows to R over grow s (still a
      // wind-up: hit him and it breaks); inside when it completes: frozen freeze s, the hits on them storing their
      // knockback (x kbMul) till the thaw; recovery (caught) / miss; cooldown s
      startup: 0.15, grow: 0.4, active: 0.05, recovery: 0.15, miss: 0.4, cooldown: 9, R: 105, freeze: 1.3, kbMul: 0.5, touch: 0 },
      // the ripple freezes whoever its edge touches while it grows (past their middle, + touch x their radius); caught,
      // he's out of the snap at once
    evade: { name: 'Garbage Collect', do: 'gc', icon: 'gc', hold: null,
      blurb: 'Blinks a short way the held way (or away from them), untouchable for the blink. Two charges.',
      tell: 'His charges show by his feet: none left, he can\'t get away.', answer: 'Bait both charges, then commit.',
      // the blink: out (active / 2), dist units the held way (none held: away from them), in; untouchable all of it, then
      // recovery s; charges, each one back recharge s after it's spent
      startup: 0, active: 0.12, recovery: 0.18, dist: 110, charges: 2, recharge: 2.1, cooldown: 0 },
  },
};
const P = (a, b, inp) => [a, b, inp];
fighter.clips = {   // (the jab heating up over a string, the pot stuck on Tux out of a blink, the freeze set up for a string)
  move1: { x: [-110, 40], len: 2.6, cam: { x: -20, w: 280 }, a: [P(0.3, 0.35, { guard: 1, x: 1 }), P(0.38, 0.43, { light: 1 }), P(0.85, 1.2, { x: 1 }), P(1.24, 1.29, { light: 1 })] },
  move2: { x: [-110, 30], len: 3.1, cam: { x: -20, w: 300 }, a: [P(0.3, 0.35, { guard: 1, x: 1 }), P(0.52, 0.57, { heavy: 1 }), P(1.05, 1.1, { guard: 1, x: -1 })] },   // (blink in, the pot slapped on, blink out; it boils over on him)
  move3: { x: [-6, 40], len: 3.2, cam: { x: 15, w: 280 }, a: [P(0.3, 0.35, { special: 1 }), P(1.12, 1.17, { light: 1 }), P(1.5, 1.55, { light: 1 }), P(1.88, 1.93, { light: 1 })] },
  evade: { x: [-40, 110], len: 2.4, cam: { x: 10, w: 300 }, a: [P(0.82, 0.88, { guard: 1, x: 0, y: -1 })], b: [P(0.53, 0.61, { heavy: 1 })] },   // (a blink out of the toboggan's way)
};

// ---------------------------------------------------------------- his moves
// can a punch of his (reach from his edge, arc degrees) touch them right now
const canPunch = (F, f, o, reach, arc) => o.z < 20 && !o.gone && o.state !== 'ko' && F.reaches(f, o, { reach, arc }, 2);
// one punch of his landing (sub: the move's hit or last): true if it connected (a hit, or soaked by armour); after it he
// may not be striking any more (Tux's armour bursting staggers him)
function punch(F, f, o, sub, move, opt = {}) {
  if (!F.hitF(f, o, sub, { dir: angMid(Math.atan2(o.y - f.y, o.x - f.x), f.face), move, ...opt })) return false;
  f.hit = true;
  return true;
}
// Stop the World: the arm up is done, the snap: the ring starts growing out from him
function snapStart(F, f, mv) {
  setPh(f, 'snap'); F.go(f, 'wind', mv.grow);
  spawn(F, { kind: 'ring', x: f.x, y: f.y, z: 0, vx: 0, vy: 0, vz: 0, r: 0, R: mv.R, ph: 'grow', t: 0, life: 99, owner: f.i, hit: false, mv: f.move, ms: f.ms });
  F.ev('snap', f.x, f.y, 0.8, f.i, { move: 'move3' });
}
// Hot Java boiling over on someone down (or getting up): the damage where they lie, a share of it (sub.downMul), no
// knockback; it counts as a hit (the results card, the pot's land)
function scald(F, a, d, sub, move) {
  const dmg = sub.damage * (sub.downMul ?? 0.5) * F.dmgMul;
  d.hp = Math.max(0, d.hp - dmg); d.flash = 0.2; d.hurtN++;
  F.ev('hit', d.x, d.y, 0.4, a.i, { move, to: d.i, counter: false, side: '', dmg });
  if (d.hp <= 0) { F.release(d); d.move = null; F.go(d, 'ko'); F.ev('ko', d.x, d.y, 1, d.i); }
}
// can Stop the World freeze them now
const freezable = o => o.z < 30 && !o.gone && o.inv <= 0 && !['ko', 'down', 'getup', 'frozen'].includes(o.state);
// frozen by Stop the World: a statue for mv.freeze s; the hits on them store their knockback (x kbMul) till the thaw
function freezeF(F, o, mv, by) {
  F.release(o);
  o.move = null; o.ph = ''; o.gone = 0;
  o.frozenT = mv.freeze; o.fzx = 0; o.fzy = 0; o.fzkd = 0; o.fzMul = mv.kbMul ?? 0.5; o.fzBy = by;
  F.go(o, 'frozen', mv.freeze); o.vx = o.vy = o.vz = 0;
}

/** @type {Record<string, import('./index.js').Kit>} */
const kits = {
  // HotSpot Jab: a quick one-two where he stands (out at once after a blink), his only damage, heating up as it lands
  jab: {
    moves: true,
    press(F, f) { setPh(f, 'ready'); f.seg = 0; f.vx *= 0.3; f.vy *= 0.3; },
    start(F, f, o) {
      setPh(f, 'jab1'); f.face = turnTo(f.face, Math.atan2(o.y - f.y, o.x - f.x), 0.5);
      F.ev('jab', f.x, f.y, 0.4, f.i, { move: 'move1', n: 1, a: f.face, hot: Math.round(f.hot * 10) / 10 });
    },
    step(F, f, o, mv) {
      const half = mv.active / 2;
      if (f.ph === 'jab1' && f.t >= half) { setPh(f, 'jab2'); F.ev('jab', f.x, f.y, 0.4, f.i, { move: 'move1', n: 2, a: f.face, hot: Math.round(f.hot * 10) / 10 }); }
      const k = f.ph === 'jab1' ? 1 : 2, at = f.t - (k - 1) * half;
      f.vx = f.vy = 0;   // (where he stands: no lunge, the blink is how he gets in)
      if (at <= mv.window && f.seg < k && canPunch(F, f, o, mv.reach, mv.arc)) {
        f.seg = k;
        const H = mv.hot, boil = k === 2 && f.hot >= H.max - 1e-6, heat = f.hot;
        if (!punch(F, f, o, boil ? mv.boil : k === 1 ? mv.hit : mv.last, 'move1', { dmgMul: (1 + H.step * Math.min(H.max, f.hot)) * (o.state === 'frozen' ? H.frozen : 1) }) || F.lastRes !== 'hit') return;
        if (boil) { f.hot = 0; f.hotT = 9; F.ev('boil', o.x, o.y, 1, f.i, { move: 'move1', to: o.i, a: f.face }); }   // (boiled over: knocked down, and he's cooled right off)
        else { f.hot = Math.min(H.max, f.hot + 1); f.hotT = 0; F.ev('heat', o.x, o.y, clamp(f.hot / H.max, 0, 1), f.i, { move: 'move1', to: o.i, hot: f.hot, was: Math.round(heat * 10) / 10, n: k, a: f.face }); }
      }
    },
    end(F, f, o, mv) {   // one landed: a calm settle; both whiffed: open a moment, and the heat's gone
      setPh(f, f.hit ? 'jabend' : 'jabmiss'); F.go(f, 'recover', f.hit ? mv.recovery : mv.miss); f.vx *= 0.3; f.vy *= 0.3;
      if (!f.hit) { if (f.hot > 0.5) F.ev('cool', f.x, f.y, clamp(f.hot / mv.hot.max, 0, 1), f.i, { move: 'move1' }); f.hot = 0; f.hotT = 9; }
      return true;
    },
    phases: mv => [['ready', 'wind', mv.startup, 'guard', 'fists up'], ['jab1', 'strike', mv.active / 2, 'jab1', `the first jab: reach ${mv.reach}, ${mv.arc}°, where he stands`],
      ['jab2', 'strike', mv.active / 2, 'jab2', `the second (at full heat, ${mv.hot.max}: it boils over and knocks down)`], ['jabend', 'recover', mv.recovery, 'jab2', 'one landed'],
      ['jabmiss', 'recover', mv.miss, 'jab2', 'both whiffed: open, and the heat is gone']],
  },
  // Stop the World: the arm up, the snap, a ring growing out from him; inside when it completes: frozen, the hits on
  // them storing their knockback till the thaw
  stopworld: {
    moves: true,
    press(F, f) { setPh(f, 'raise'); f.vx *= 0.3; f.vy *= 0.3; },
    wind(F, f, o, mv) {
      f.vx *= 0.8; f.vy *= 0.8;
      if (f.ph === 'raise') { if (f.t >= f.dur) snapStart(F, f, mv); return; }   // (the arm's up: the snap, the ring starts)
      const rg = mine(F, f, 'ring');   // the snap: the ring growing out from him, its centre with him
      if (rg && rg.ph === 'grow') {
        rg.x = f.x; rg.y = f.y; rg.r = mv.R * clamp(f.t / Math.max(1e-6, f.dur), 0, 1);
        if (freezable(o) && D(f, o) - o.r * (mv.touch ?? 0) <= rg.r) {   // (its edge touched them: frozen now, and the snap's done)
          freezeF(F, o, mv, f.i); rg.got = 1; f.dur = f.t;
          F.ev('freeze', o.x, o.y, 1, f.i, { move: 'move3', to: o.i });
        }
      }
    },
    start(F, f, o, mv) {   // the ring completes: whoever is inside freezes
      setPh(f, 'stop'); f.vx = f.vy = 0;
      const rg = mine(F, f, 'ring'); if (rg) { rg.ph = 'done'; rg.life = rg.t + 0.25; if (!rg.got) rg.r = mv.R; }
      if (rg && rg.got) f.hit = true;   // (it caught them on its way out)
      else if (D(f, o) <= mv.R && freezable(o)) {
        freezeF(F, o, mv, f.i); f.hit = true;
        F.ev('freeze', o.x, o.y, 1, f.i, { move: 'move3', to: o.i });
      } else F.ev('stopmiss', f.x, f.y, 0.4, f.i, { move: 'move3' });
    },
    step(F, f) { f.vx = f.vy = 0; },
    end(F, f, o, mv) { F.go(f, 'recover', f.hit ? mv.recovery : mv.miss); return true; },
    phases: mv => [['raise', 'wind', mv.startup, 'snapup', 'the arm on its way up for the snap, a pocket watch swinging up into his hand'],
      ['snap', 'wind', mv.grow, 'snap', `snap! the grey ripple grows to ${mv.R} (still a wind-up: hit him and it breaks)`],
      ['stop', 'strike', mv.active, 'snap', `inside: frozen ${mv.freeze} s (hits store their knockback x${mv.kbMul} till the thaw)`], ['stop', 'recover', `${mv.recovery} / ${mv.miss} missed`, 'snap', `cooldown ${mv.cooldown} s`]],
  },
  // Hot Java: the pot up over his shoulder (the tell), then a slap from right up close with a little step in: on them
  // it sticks (OBJ pot: rides on them, brews, boils over a moment later); a miss leaves him open, the pot dropped. One
  // pot out at a time
  hotjava: {
    moves: true,
    can(F, f) { return !F.objs.some(b => b.kind === 'pot' && b.owner === f.i && b.t < b.life); },
    press(F, f) { setPh(f, 'potup'); f.vx *= 0.4; f.vy *= 0.4; },
    wind(F, f, o) { f.vx *= 0.8; f.vy *= 0.8; f.face = turnTo(f.face, Math.atan2(o.y - f.y, o.x - f.x), 0.25); },
    start(F, f, o) { setPh(f, 'slap'); f.face = turnTo(f.face, Math.atan2(o.y - f.y, o.x - f.x), 1.2); F.ev('potslap', f.x, f.y, 0.5, f.i, { move: 'move2', a: f.face }); },
    step(F, f, o, mv) {
      f.vx = Math.cos(f.face) * mv.lunge; f.vy = Math.sin(f.face) * mv.lunge;
      const fz = o.state === 'frozen';   // (a statue: it always sticks, a little further and all round)
      if (f.hit || !(fz ? canPunch(F, f, o, mv.reach + (mv.fzReach ?? 0), 360) : canPunch(F, f, o, mv.reach, mv.arc))) return;
      if (!punch(F, f, o, mv.hit, 'move2') || (F.lastRes !== 'hit' && F.lastRes !== 'armor')) return;   // (soaked by Tux's armour: no pot; its burst may stagger him)
      const hx = f.x + Math.cos(f.face) * f.r, hy = f.y + Math.sin(f.face) * f.r;
      spawn(F, { kind: 'pot', x: o.x, y: o.y, z: 0, vx: 0, vy: 0, vz: 0, r: 0, on: o.i, ph: 'ride', pt: 0, fuse: mv.fuse, hopT: 0, hx, hy, hops: 0, n: f.hurtN, fz: fz ? 1 : 0, t: 0, life: 99, owner: f.i, hit: false });
      F.ev('potstick', o.x, o.y, 0.8, f.i, { move: 'move2', to: o.i, a: f.face });
    },
    end(F, f, o, mv) {   // stuck it: a calm settle; missed: the pot dropped, open a moment
      f.vx *= 0.3; f.vy *= 0.3;
      if (f.hit) { setPh(f, 'slapped'); F.go(f, 'recover', mv.recovery); }
      else { setPh(f, 'potmiss'); F.go(f, 'recover', mv.miss); F.ev('potmiss', f.x + Math.cos(f.face) * (f.r + 10), f.y + Math.sin(f.face) * (f.r + 10), 0.4, f.i, { move: 'move2', a: f.face }); }
      return true;
    },
    phases: mv => [['potup', 'wind', mv.startup, 'potup', 'the steaming pot up over his shoulder'],
      ['slap', 'strike', mv.active, 'slap', `slapped on, a small step in (${mv.lunge} u/s): reach ${mv.reach} from his edge, ${mv.arc}°; it sticks on them (a ${mv.hit.damage} tap)`],
      ['slapped', 'recover', mv.recovery, 'slap', `stuck: it rides on them ${mv.fuse} s (whistling the last ${mv.whistle}), then boils over: ${mv.boil.damage}, kb ${mv.boil.kb}, knocks down; hit Duke first and it hops back onto him`],
      ['potmiss', 'recover', mv.miss, 'slap', 'missed: the pot dropped, open']],
  },
  // ---------------------------------------------------------------- the evades (the fourth key: fight.js 'evade')
  // Duke's Garbage Collect: a blink the held way (none held: away from them), untouchable for the blink; a charge a go
  gc: {
    moves: true,
    can(F, f) { return f.ev >= 1; },
    start(F, f, o, mv) {
      f.ev -= 1; if (f.evT <= 0) f.evT = mv.recharge;
      setPh(f, 'blinkout'); f.vx = f.vy = 0; f.inv = Math.max(f.inv, 2 / 60);
      const c = F.ctl(f), a = c.mag > 0.3 ? c.dirA : Math.atan2(f.y - o.y, f.x - o.x);
      let x = f.x + Math.cos(a) * mv.dist, y = f.y + Math.sin(a) * mv.dist;
      for (let k = 0; k < 24 && (F.contactsAll(x, y, f.r).length || Math.hypot(o.x - x, o.y - y) < f.r + o.r); k++) { x -= Math.cos(a) * mv.dist / 24; y -= Math.sin(a) * mv.dist / 24; }   // (not into a wall or onto them)
      f.bx = x; f.by = y; f.face = a;
      F.ev('blink', f.x, f.y, 0.5, f.i, { move: 'evade', x2: x, y2: y });
    },
    step(F, f, o, mv) {
      f.vx = f.vy = 0; f.inv = Math.max(f.inv, 2 / 60);
      if (f.ph === 'blinkout' && f.t >= mv.active / 2) { f.x = f.bx; f.y = f.by; setPh(f, 'blinkin'); }
    },
    end(F, f, o, mv) { f.inv = 0; if (f.ph === 'blinkout') { f.x = f.bx; f.y = f.by; } setPh(f, 'blinkin'); F.go(f, 'recover', mv.recovery); return true; },
    // landed: the jab pressed out of the blink (or just before it ends: the buffer) comes out at once, the blink's
    // recovery cut short; fight.js calls it every step of a recovery
    recover(F, f, o) { return f.bufK === 'light' && F.act(f, o); },
    phases: mv => [['blinkout', 'strike', mv.active / 2, 'blinkout', 'vanishing: untouchable'], ['blinkin', 'strike', mv.active / 2, 'blinkin', `there (${mv.dist} the held way): untouchable`],
      ['blinkin', 'recover', mv.recovery, 'blinkin', `back: open (${mv.charges} charges, each back ${mv.recharge} s after it's spent)`]],
  },

};

// ---------------------------------------------------------------- his world objects
/** @type {Record<string, import('./index.js').ObjStep>} */
const objs = {
  // Stop the World's ring: growing with Duke's snap (the stopworld kit); hit out of it, it breaks
  ring(F, ob, dt, own) {
    if (ob.ph === 'grow' && !(sameGo(own, ob) && own.state === 'wind')) { ob.ph = 'break'; ob.life = ob.t + 0.2; F.ev('ringbreak', ob.x, ob.y, 0.5, ob.owner, { move: 'move2' }); }
  },

  // Hot Java's pot (the hotjava kit): riding on whoever has it (on: their index), brewing for its fuse; a hit on Duke
  // while it's on them (his hurtN up since it stuck) hops it back onto him, once, its timer kept. Then it boils over on
  // them (from above: no block), the eruption drawn for erupt s; on someone down or getting up it scalds them where they
  // lie (x boil.downMul, no knockdown: the freeze's string that floored them doesn't get a second one). A KO, or the
  // round over, and it just goes
  pot(F, ob, dt, own, foe, M) {
    const mv = M.move2, c = F.f[ob.on];
    ob.pt += dt; ob.hopT += dt;
    if (ob.ph === 'erupt') { ob.x = c.x; ob.y = c.y; if (ob.pt >= mv.erupt) ob.life = ob.t; return; }
    if (!(F.phase === 'fight' || F.phase === 'sudden') || own.state === 'ko' || c.state === 'ko') { ob.life = ob.t; F.ev('potgone', ob.x, ob.y, 0.3, ob.owner, { move: 'move2' }); return; }
    if (ob.on !== ob.owner && own.hurtN !== ob.n && c.state !== 'frozen' && !ob.fz && ob.fuse > mv.whistle) {   // (hit Duke: back onto him it hops; never off a statue, nor one slapped on a statue, nor once it whistles)
      ob.hx = c.x; ob.hy = c.y; ob.on = ob.owner; ob.hopT = 0; ob.hops++;
      F.ev('pothop', c.x, c.y, 0.7, ob.owner, { move: 'move2', from: c.i, to: own.i, x2: own.x, y2: own.y });
    }
    const k = F.f[ob.on]; ob.x = k.x; ob.y = k.y;
    ob.fuse = Math.max(0, ob.fuse - dt);
    if (ob.fuse > 0) return;
    ob.ph = 'erupt'; ob.pt = 0;
    const back = ob.on === ob.owner, a = back ? foe : own;   // (on Duke: the one who passed it back did it)
    F.ev('erupt', k.x, k.y, 1, ob.owner, { move: 'move2', to: k.i, back: back ? 1 : 0 });
    const move = back ? 'pot' : 'move2';
    if (k.state === 'down' || k.state === 'getup' || k.safeT > 0) { scald(F, a, k, ob.fz ? { ...mv.boil, downMul: 1 } : mv.boil, move); ob.hit = true; return; }   // (just up off a knockdown too: no wake-up loop; a statue's pot: full damage all the same)
    ob.hit = F.hitF(a, k, mv.boil, { dir: Math.atan2(k.y - a.y, k.x - a.x), obj: true, unblockable: true, noFlank: true, kd: true, move }) && F.lastRes === 'hit';
  },

};

// ---------------------------------------------------------------- his bot (fight-ai.js kitBot calls these)
// the bot's helpers with the shared bot's own names
const bot = C => ({ F: C.F, i: C.i, m: C.m, me: C.me, L: C.L, rng: C.rng, tap: C.tap, K: C.K, g: C.g,
  ready: (F, me, k) => C.ready(k), fire: (tap, k, n) => C.fire(k, n), evade: (m, tap, a) => C.stepTo(a) });
// his execution by level (Chill, Normal, Ruthless): how sloppy the bot plays the blink, the string and the pot, 0 sharp.
// He takes the most skill, so a weak bot can't drive him: blinks in from too far, jabs and slaps the pot just out of
// reach (whiffs cool the heat), drops strings and freeze combos
const SLOP = [1.15, 0.6, 0.22], slop = C => SLOP[C.m.P ? C.m.P.lv : 1] ?? 0.5;
// a foe on the floor: a sloppy bot often lets the chance go, decided once a knockdown
function floorSkip(C) {
  const live = C.F.f[1 - C.i], K = C.K;
  if (live.state !== 'down' && live.state !== 'getup') return false;
  const key = Math.round((C.F.time - live.t) * 60);
  if (K.flFor !== key) { K.flFor = key; K.flSkip = C.rng() < 0.5 * slop(C); }
  return K.flSkip;
}
const HELPLESS = new Set(['hurt', 'stagger', 'dizzy', 'frozen', 'grabbed']);
// Duke's payoff: a foe frozen by his Stop the World (he takes it in a moment later, like a player): in to them (a blink
// if walking won't make it) and the jab again and again on the statue, each one-two heating up (the knockback saved for
// the thaw). Whether he goes for it is decided once a freeze (the level's combo)
function frozenFoe(C, o) {
  const { F, i, m, me, L, rng, tap, K, g, ready, fire, evade } = bot(C);
  const live = F.f[1 - i];
  if (live.state !== 'frozen' || live.z > 20) return null;
  const left = live.dur - live.t; if (live.t < 0.12 || left < 0.1) return null;   // (taken in a moment late; too late now)
  const key = live.ms + ':' + Math.round((F.time - live.t) * 60);
  if (K.fzFor !== key) { K.fzFor = key; K.fzGo = rng() < (0.65 + 0.35 * L.combo) * (1 - 0.4 * slop(C)); }
  if (!K.fzGo) return null;
  const M = me.stats.moves, J = M.move1, P = M.move2, dx = live.x - me.x, dy = live.y - me.y, dist = Math.hypot(dx, dy), gap = dist - me.r - live.r, toFoe = Math.atan2(dy, dx);
  if (K.fzPot == null || K.fzFor2 !== key) { K.fzFor2 = key; K.fzPot = rng() < (0.85 + 0.15 * L.smart) * (1 - 0.5 * slop(C)); }   // (the pot on the statue first: it boils as they thaw)
  const pot = K.fzPot && ready(F, me, 1) && left > P.startup + P.active + 0.05;
  const sl = slop(C);
  if (pot && gap < P.reach - 2 + 18 * sl) { fire(tap, 1); return unit(toFoe); }
  if (pot) { if (gap > P.reach + 30 && ready(F, me, 3) && gap < M.evade.dist + P.reach && (gap - P.reach) / (150 * me.stats.walk) > left * 0.4) { K.bj = F.time; K.bk = 'heavy'; return evade(m, tap, toFoe); } return unit(toFoe); }
  if (gap < J.reach - 3 + 12 * sl) { if (ready(F, me, 0) && left > J.startup + 0.03) fire(tap, 0); return gap < J.reach - 3 ? [0, 0] : unit(toFoe); }
  const walkT = Math.max(0, gap - J.reach + 6) / (150 * me.stats.walk);
  if (walkT > left * 0.5 && ready(F, me, 3) && gap < M.evade.dist + J.reach - 10) { K.bj = F.time; return evade(m, tap, toFoe); }   // (too far to walk: a blink in, the jab out of it)
  return unit(toFoe);
}
// Duke's HotSpot string: a jab of his just landed and he's hot: after them while it lasts, the next one-two the moment
// it's back, so the heat keeps climbing. How keen: decided once a landing (the level's combo). Not into something
// they've started (answer() deals with that)
function dukeString(C, o) {
  const { F, i, m, me, L, rng, tap, K, g, ready, fire, evade } = bot(C);
  const live = F.f[1 - i];
  if (!(me.hot > 0.3) || live.z > 20 || live.gone || !['hurt', 'stagger', 'idle', 'walk', 'recover'].includes(live.state)) return null;
  const key = Math.round((F.time - me.hotT) * 60);   // (the last landing)
  if (K.stFor !== key) { K.stFor = key; K.stGo = C.link((0.6 + 0.4 * L.combo) * (1 - 0.4 * slop(C))); }
  if (!K.stGo) return null;
  const J = me.stats.moves.move1, dx = live.x - me.x, dy = live.y - me.y, gap = Math.hypot(dx, dy) - me.r - live.r, toFoe = Math.atan2(dy, dx);
  if (gap > J.reach + 70) { K.stGo = false; return null; }   // (got away)
  if (gap < J.reach - 2 + 14 * slop(C)) { if (ready(F, me, 0)) fire(tap, 0); return [0, 0]; }
  return unit(toFoe);
}
// his Hot Java on one of us (the pot object, while it rides and brews):
//   - chase: on bot i, passed by Duke (bot i is his foe): after him to land anything on him and pass it back (how keen, decided once a
//     pot: the level's answer, the human way), what lands chosen like a punish of an opening that lasts till it boils; too
//     late for that, answer() reads it as a threat (the evade as it boils, if ours helps)
//   - keepAway: on them (bot i is Duke): keep away from them till it boils (any hit on us passes it back): back off, a blink away when
//     they get close; (passed back onto us: answer()'s evade as it boils)
function chase(C, o) {
  const { F, i, m, me, L, rng, tap, K, g, ready, fire, evade } = bot(C);
  const pt = F.objs.find(b => b.kind === 'pot' && b.ph === 'ride' && b.t < b.life);
  if (!pt) return null;
  const live = F.f[1 - i], T = pt.fuse, dx = live.x - me.x, dy = live.y - me.y, dist = Math.hypot(dx, dy) || 1, gap = dist - me.r - live.r, toFoe = Math.atan2(dy, dx);
  const Wh = live.stats.moves.move2.whistle ?? 0.4;   // (once it whistles it can't be passed back: answer()'s evade then)
  if (pt.on === i && pt.owner !== i && !pt.fz) {   // on us: chase him (a statue's pot never hops)
    if (K.potFor !== pt.id) { K.potFor = pt.id; K.potGo = C.link(0.35 + 0.6 * L.answer); K.potT = 0; }
    if (!K.potGo || T < Wh + 0.05 || live.state === 'ko' || live.z > 30) return null;
    if (live.gone || live.inv > 0) return unit(toFoe);
    if (F.time >= K.potT) {   // (a look every so often: does anything of ours land on him before it boils?)
      K.potT = F.time + 0.08 + rng() * 0.1;
      const b = T - Wh - 0.03, fits = t => t >= -0.02 && t <= b, line = rayClear(g.A, me.x, me.y, toFoe, Math.max(0, gap), me.r * 0.8);
      const r = C.punish({ a: 0, b, fits, line }); if (r) return r;
    }
    return unit(toFoe);
  }
  return null;
}
function keepAway(C, o) {
  const { F, i, m, me, L, rng, tap, K, g, ready, fire, evade } = bot(C);
  const pt = F.objs.find(b => b.kind === 'pot' && b.ph === 'ride' && b.t < b.life);
  if (!pt) return null;
  const live = F.f[1 - i], T = pt.fuse, dx = live.x - me.x, dy = live.y - me.y, dist = Math.hypot(dx, dy) || 1, gap = dist - me.r - live.r, toFoe = Math.atan2(dy, dx);
  if (pt.owner === i && pt.on !== i && !pt.fz && T > me.stats.moves.move2.whistle) {   // on them: keep away (till it whistles: then it's theirs)
    if (K.awayFor !== pt.id) { K.awayFor = pt.id; K.awayGo = rng() < 0.4 + 0.55 * L.smart; }
    if (!K.awayGo || T <= 0 || HELPLESS.has(live.state) || live.state === 'down' || live.state === 'getup') return null;
    const run = Math.atan2(-dy, -dx) + (g.cl.d < 50 ? angDiff(g.toC, Math.atan2(-dy, -dx)) * 0.6 : 0);
    if (gap < 45 && ready(F, me, 3) && T > 0.15 && rng() < 0.25 + 0.5 * L.smart) return evade(m, tap, run);
    return unit(run);
  }
  return null;
}
// Duke's tells as a bot sees them (o: him, a moment late): [key, T, dur, way out, how far] like answer()'s. The jab:
// back out of its reach (only seen in time off a long look), and the same for Hot Java's pot going up; the arm going up
// for Stop the World: out of where the ring will reach (the ring itself is an object: ai.objThreats)
function dukeThreats(o, me, g, th) {
  const M = o.stats.moves, J = M.move1, S = M.move3, P = M.move2;
  if (!J || J.do !== 'jab' || !S || S.do !== 'stopworld') return;
  const d = g.dist, gap = g.gap, from = Math.atan2(me.y - o.y, me.x - o.x), start = 'd' + Math.round((o.T - o.t) * 60);
  if (o.move === 'move3' && o.state === 'wind' && o.ph === 'raise' && d < S.R + 10) th.push(['w' + start, Math.max(0, o.left) + S.grow * clamp((d - me.r * (S.touch ?? 0)) / S.R, 0, 1), 0.05, from, S.R + 10 - d]);   // (it catches them as it reaches them)
  else if (o.move === 'move1' && o.state === 'wind' && gap < J.reach + 10) th.push(['j' + start, Math.max(0.02, o.left), J.active, from, J.reach + 8 - gap]);
  else if (P && P.do === 'hotjava' && o.move === 'move2' && o.state === 'wind' && gap < P.reach + 16) th.push(['j' + start, Math.max(0.02, o.left), P.active, from, P.reach + 14 - gap]);   // (Hot Java's pot going up: out of its tiny reach)
}
// a punish (fight-ai.js punishIn): what of his lands in the window [w.a, w.b] s from now: fired, and the walk; else null
function punish(C, o, w) {
  const { F, i, m, me, L, rng, tap, K, g, ready, fire, evade } = bot(C);
  const { dist, gap, toFoe } = g, M = me.stats.moves, { a, b, fits, line } = w;
  const J = M.move1, S = M.move3, E = M.evade, W = 150 * me.stats.walk;
  const P = M.move2;
  if (floorSkip(C)) return null;
  if (ready(F, me, 1) && gap < P.reach && b > 0.5 && fits(P.startup + 0.02) && rng() < 0.3 + 0.4 * L.smart) { fire(tap, 1); return unit(toFoe); }   // (right next to them and open a while: the pot on them)
  if (ready(F, me, 0) && gap < J.reach + 2 && fits(J.startup + 0.02)) { fire(tap, 0); return unit(toFoe); }   // (right there: the jab)
  if (ready(F, me, 2) && o.state !== 'frozen' && a < 0.05 && dist < S.R - 25 && S.startup + S.grow < b - 0.05) { fire(tap, 2); return [0, 0]; }   // (committed for long enough: freeze them, then the string)
  if (ready(F, me, 0) && ready(F, me, 3) && line && gap > J.reach && gap < E.dist + J.reach - 10 && fits(E.active + J.startup + 0.04)) { K.bj = F.time; return evade(m, tap, toFoe); }   // (a blink in, the jab out of it)
  if (ready(F, me, 0) && gap - J.reach < W * (b - J.startup - 0.12)) return unit(toFoe);   // (open a while: walk in for it)
  return null;
}
// every think, free and nothing coming (fight-ai.js neutral): blink in and jab (now and then the pot instead), the jab
// up close (keener while it's hot), Hot Java right up close (keener on a busy foe: a moving one walks out of it), the
// freeze on a busy foe in its reach (the pot and the string follow: frozenFoe)
function neutral(C, o, w) {
  const { F, i, m, me, L, rng, tap, K, g, ready, fire, evade } = bot(C);
  const { A, dist, toFoe } = g, M = me.stats.moves, { add, busy, spent } = w;
  const J = M.move1, S = M.move3, gap = g.gap, line = rayClear(A, me.x, me.y, toFoe, Math.max(0, gap), me.r * 0.8);
  if (floorSkip(C)) return null;
  const sl = ['down', 'getup'].includes(F.f[1 - i].state) ? 0 : slop(C);   // (a foe on the floor: no reaching for them)
  if (gap > 40 && gap < me.stats.moves.evade.dist + 12 + 50 * sl && ready(F, me, 3) && ready(F, me, 0) && line && rng() < (0.13 + 0.06 * L.rate) * (spent ? 1 + L.smart : 1)) { K.bj = F.time; K.bk = ready(F, me, 1) && rng() < 0.2 + 0.15 * L.smart ? 'heavy' : 'light'; return { now: evade(m, tap, toFoe) }; }   // (the blink in, the jab (or the pot) as he lands: each)
  add(2, dist < S.R - 30 && !o.air ? (busy || o.ph === 'crouch' ? 0.5 : 0.12 * L.smart) : 0, [0, 0]);   // (on someone busy, or squatting for a move)
  add(0, gap < J.reach + 4 + 12 * sl ? 0.45 * (me.hot > 1 ? 1.3 : 1) : 0, unit(toFoe));
  add(1, gap < M.move2.reach + 4 + 22 * sl ? (busy ? 0.4 : 0.1 + 0.1 * L.smart) : 0, unit(toFoe));
  return null;
}

/** @type {import('./index.js').BotHooks} */
const ai = {
  want: 120,   // (in blink range)
  // his character (js/fight-style.js): the assassin presses in, mostly an aggressive bot, fond of his jab
  persona: { aggr: 0.6, styles: [2, 1, 1], like: [1.15, 1, 1, 1] },
  // the jab pressed as he lands from a blink in (it comes out at once: the gc kit's recover), or Hot Java (buffered
  // through the blink's recovery); a blink in that's gone stale forgets it
  each(F, i, me, o, C) {
    const K = C.K, tap = C.tap;
    if (K.bj && me.move === 'evade' && me.ph === 'blinkin') { tap(K.bk || 'light', 2); K.bj = 0; K.bk = ''; }
    else if (K.bj && F.time - K.bj > 0.6) { K.bj = 0; K.bk = ''; }
  },
  chase: (F, i, me, o, C) => chase(C, o),   // (his pot on bot i: after him to pass it back)
  first: (F, i, me, o, C) => keepAway(C, o),   // (his pot on them: keep away till it boils)
  follow: (F, i, me, o, C) => frozenFoe(C, o) || dukeString(C, o),   // (a freeze of his, or a hot string)
  // his tells as bot i sees them: the jab, the pot going up, the arm going up for the snap
  threats(F, i, me, o, C) { const th = []; dukeThreats(o, me, C.g, th); return th; },
  // his objects as threats to bot i: the pot about to boil on bot i (it rides along: only an evade helps), the ring
  // growing (out before it completes)
  objThreats: {
    pot(F, i, me, o, b) { return b.on === i && b.ph === 'ride' && b.fuse < 0.6 && me.state !== 'down' ? ['p' + b.id, b.fuse, 0.05, Math.atan2(me.y - F.f[1 - i].y, me.x - F.f[1 - i].x), 9999] : null; },
    ring(F, i, me, o, b) {
      if (b.owner === i || b.t < o.age || b.t >= b.life || b.ph !== 'grow') return null;
      const d = Math.hypot(me.x - b.x, me.y - b.y), ow = F.f[b.owner], need = b.R + 10 - d, S = ow.stats.moves.move3;
      const T = ow.state === 'wind' ? Math.max(0, ow.dur * clamp((d - me.r * (S.touch ?? 0)) / b.R, 0, 1) - ow.t) : 0;   // (when its edge reaches them)
      return need > 0 ? ['r' + b.id, T, 0.05, Math.atan2(me.y - b.y, me.x - b.x), need] : null;
    },
  },
  // the blink's moment: just before (a pot boiling on him: the blink only helps while he's untouchable in it, so right
  // as it boils)
  evadeWhen(T, dur, E, me, key) { const pot = key[0] === 'p', now = pot ? T > 0.01 && T < E.active * 0.7 : T > 0.01 && T < 0.2; return [now, now]; },
  punish: (F, i, me, o, C, w) => punish(C, o, w),
  neutral: (F, i, me, o, C, w) => neutral(C, o, w),
  // a wild press (fight-human.js): even a wild freeze or pot is thrown with them near
  sane: (F, me, k, g) => !((k === 2 && g.dist > me.stats.moves.move3.R) || (k === 1 && g.gap > 60)),
  // Hot Java is ready even while a pot of his is out (its press then does nothing: the kit's can)
  ready: (F, me, k, mv, ok) => k === 1 || ok,
};

export default { id: ID, fighter, kits, objs, ai };
