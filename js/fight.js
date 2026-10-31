// @ts-check
// Fight mode's simulation: two mascots 1v1 in an arena (js/fight-arenas.js, cfg.arena). Health only: knock their health
// to zero (no ring-outs). The arena's edge is a solid wall: a fighter knocked into it fast enough bounces off, takes a
// little extra damage and goes down. When the clock runs out it's sudden death: every hit does more and more damage.
//
// Every fighter is a kit: js/kits/<id>.js, its shape in js/kits/index.js. This file is the small core every kit runs on:
//   - Keys: light, heavy and special fire the fighter's move1, move2 and move3 (MOVE_OF), guard its evade. Every press is
//     remembered for RULES.buffer and fires on the first frame you can act (one buffered press, the newest wins), once
//     that move is off its cooldown (f.cd, running once the move's over) and not locked (f.lockT: the evade only).
//     Walking is near-instant; backing away is slower. A move aims when it starts (the held way within RULES.aim of the
//     foe, else straight at them).
//   - A move's states: 'wind' (its tell: the kit's press, wind and hold hooks; a hit then is a counter hit, x
//     RULES.counter, a longer stagger, and the move is gone), 'strike' (the kit's start and step hooks; end when it runs
//     out) and 'recover' (open). f.ph is the move's phase (the drawer's pose key, f.pht its time), f.ms counts the goes.
//   - Hits (hitF): the target's own guard hook first (armour, soaks...), then a hit on someone down (groundHit), a trade
//     (two contact moves both active and in reach: both land, softer), the hit itself: damage (stale moves weaken,
//     sudden death's dmgMul), knockback / weight, hitstun shrinking over a combo, a knockdown when the move says so or
//     the knockback is big (RULES.downKb). A frozen fighter (Duke's Stop the World) stores the knockback till the thaw.
//   - Knockdowns, never launches: down RULES.downT, getting up RULES.getupT (untouchable), then safe RULES.safeT (a hit
//     staggers instead). Someone down can be hit (groundHit: half damage, a short slide, at most RULES.groundN a
//     knockdown) and can roll up early (rise: any key after RULES.riseMin, the held way).
//   - Statuses: poison (F.poison(f, dur, slow, by): f.psnT s left, f.psnSlow): a poisoned fighter walks x psnSlow and can't use their evade till it wears off (event
//     'cure'). It does no damage by itself; Pyth's Coil and Cpp's sludge give it.
//   - World objects (F.objs, plain data with an id): each kit's own, stepped by its objs hooks; solid: 1 ones are walls.
//   - Arenas: walls and solids (walls), floor hazards (hazards: ice, belts, heat vents, bounce pads).
//   - Rounds: intro, fight, sudden death, roundEnd, over; best of cfg.bestOf, cfg.roundTime s each. The menus and the
//     online room offer a match as "first to N rounds won" (FIRST_TO) with a round's time (ROUND_TIMES): matchCfg(n, s)
//     turns that into bestOf (2n - 1) and roundTime; winsToTake(cfg) is how many rounds take the match.
//   - cfg.practice (the training room, js/fight-practice.js): no intro, no clock, no KO, no rounds. A fighter knocked to
//     zero is knocked down instead with full health (its 'ko' events dropped), and a fighter's health refills once it's
//     been on its feet and unhurt for PRACTICE_REFILL s (event 'refill'). Plain data in F.prac.
// The kits' phases, objects, events and poses: docs/fight-frames.md (regenerated) and each js/kits/<id>.js header.
// DOM-free, loads in Node, deterministic: fixed 60 Hz steps, randomness only from seeded streams kept as plain numbers
// on the fight (never Math.random). Everything the drawer reads is plain data (online snapshots carry it).
//
// Units like the race's: world units (a mascot ~46 tall), x right, y down the screen, the arena centred on (0, 0).
// The fighters (their data, their kits, their bots) live in js/kits/ (the kit API: js/kits/index.js), gathered by
// js/fight-chars.js (FIGHTERS) and js/kits/index.js (KITS, OBJ); the shared bot in js/fight-ai.js, the maps in
// js/fight-arenas.js.
import { Math } from './detmath.js';
import { TAU, clamp, mulberry } from './core.js';
import { FIGHTERS } from './fight-chars.js';
import { fightAI } from './fight-ai.js';
import { ARENAS, arenaBox, arenaOf, contacts, heatState, sd, within } from './fight-arenas.js';
import { KITS, OBJ, kitOf } from './kits/index.js';

// ---- the shapes other modules share (npm run typecheck; the kit API's own: js/kits/index.js)
/** @typedef {import('./kits/index.js').Move} Move */
/** @typedef {import('./kits/index.js').FighterData} FighterData */
/** @typedef {import('./fight-arenas.js').Arena} Arena */
/** The fight's config (new Fight(cfg)): what's left out comes from the defaults in the constructor. arena: an ARENAS
 * id (settled on there); practice: the training room (js/fight-practice.js); supers, seats, names: the online room's.
 * @typedef {{ ids?: string[], bots?: (number | null)[], seed?: number, bestOf?: number, roundTime?: number, arena?: string,
 *   practice?: boolean, supers?: boolean, seats?: number[], names?: string[] }} FightConfig */
/** One fighter's held keys (Fight.inp[i], setInput): the stick -1..1 and the four keys.
 * @typedef {{ x: number, y: number, light: boolean, heavy: boolean, special: boolean, guard: boolean }} FightInput */
/** The held input as the kits read it (Fight.ctl): inp, its length 0..1, its angle.
 * @typedef {{ inp: FightInput, mag: number, dirA: number }} Ctl */
/** A fighter in the fight (Fight.f[i]): mkFighter + roundFields below say what each field is. Plain data (the online
 * snapshots carry it). A kit's own per-fighter state (its fighter's `fields`) rides on it too: those are untyped.
 * @typedef {{ id: string, i: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, face: number,
 *   r: number, hp: number, maxHp: number, wins: number, walkDist: number, stats: FighterData, wallT: number,
 *   state: string, t: number, dur: number, move: string | null, pose: string, flash: number, inv: number, slip: number,
 *   ice: number, heatCd: number, padCd: number, hit: boolean, hold: number, frozenT: number, stun: number, combo: number,
 *   recent: string[], hurtN: number, stepA: number, down: boolean, safeT: number, gh: number, roll: number, rollA: number,
 *   bufK: string, bufT: number, rel: boolean, ph: string, pht: number, cd: number[], ev: number, evT: number, bx: number,
 *   by: number, ms: number, gone: number, air: number, bnc: number, fzx: number, fzy: number, fzkd: number,
 *   fzMul: number, fzBy: number, under: number, lockT: number, psnT: number, psnSlow: number, psnBy: number,
 *   iso?: number, ghost?: number, [k: string]: any }} Fighter */
/** A world object (Fight.objs; lib.js spawn): plain data stepped by its kind's OBJ hook, gone once t >= life. owner:
 * the fighter index; mv, ms: the go of the owner's move it belongs to; solid: 1 makes it a wall (with a Shape's fields);
 * slick: a puddle. A kit's own fields ride on it too.
 * @typedef {{ id: number, kind: string, x: number, y: number, z: number, vx: number, vy: number, vz: number, r: number,
 *   t: number, life: number, owner: number, hit: boolean, mv: string | null, ms: number, ph?: string, solid?: number,
 *   slick?: number, [k: string]: any }} WorldObj */
/** An event this step (Fight.events, F.ev): the drawer and the sounds read them. who: the fighter index it's from (or
 * null); move: the move key; extra fields per kind (to, counter, dmg, ground ...).
 * @typedef {{ kind: string, x: number, y: number, power: number, who: number | null, move: string | null, [k: string]: any }} FightEvent */
/** hitF's options (its comment says what each does).
 * @typedef {{ dir?: number, dmgMul?: number, kbMul?: number, move?: string, obj?: boolean, hold?: boolean, kd?: boolean,
 *   trade?: boolean, unblockable?: boolean, noFlank?: boolean, [k: string]: any }} HitOpt */

export const FIXED = 1 / 60;
export const WALL_V = 170;             // speed into a wall from which a knocked fighter bounces off it (and goes down)
export const WALL_E = 0.5;             // how much of that speed the bounce gives back
export const WALL_DMG = 0.035;         // a hard wall-bounce's extra damage, a share of max health (scaled down for softer ones)
// a match's length, as the menus offer it: first to 1, 2, 3 or 5 rounds won; a round 40, 60 or 90 s before sudden death
export const FIRST_TO = [1, 2, 3, 5], ROUND_TIMES = [40, 60, 90];
/** @param {number} [firstTo] @param {number} [time] @returns {{ bestOf: number, roundTime: number }} */
export const matchCfg = (firstTo, time) => ({ bestOf: 2 * (FIRST_TO.includes(firstTo) ? firstTo : 2) - 1, roundTime: ROUND_TIMES.includes(time) ? time : 60 });
/** @param {FightConfig} cfg @returns {number} */
export const winsToTake = cfg => Math.ceil(((cfg && cfg.bestOf) || 3) / 2);
export const SD_MUL = [1.5, 3], SD_RAMP = 20;   // sudden death: every hit's damage times 1.5, rising to 3 over 20 s
const D2R = Math.PI / 180;
const WALK = 150;                      // walk speed for walk 1.0
const TURN = 12;                       // facing turn rate toward the foe when free (rad/s)
// the combat rules' numbers (one object, so tuning scripts can try others)
export const RULES = {
  buffer: 8 / 60,                      // a press is remembered this long
  aim: 60 * D2R,                       // a move aims the held way if it's within this of the foe
  backWalk: 0.75,                      // walking straight away from the foe: this much of the speed
  counter: 1.4, counterStun: 1.35,     // a counter hit (caught in their tell): damage and stagger x this
  downT: 0.4, getupT: 0.15,            // a knockdown: down this long (sliding), then getting up (untouchable)
  groundDmg: 0.5, groundN: 2, groundKb: 0.3, groundKbMax: 110,   // a hit on someone down: this much damage, at most this many a knockdown, a short slide (knockback x, at most)
  riseMin: 0.12, rollT: 0.2, rollDist: 62,             // a quick rise: pressed this long into a knockdown at the earliest, a roll this long and far (untouchable)
  safeT: 0.4,                                          // then safe on their feet this long (no wake-up loops): no knockdown or wall slam (a hit staggers instead); a move of their own ends it
  downKb: 230,                                         // knockback (after weight) that knocks down by itself
  trade: 0.7,                                          // a trade: each hit's knockback x this
  stale: 0.1, staleN: 5,                               // each time the same move is among your last 5 landed hits: 10 % less (at most half off)
  comboDecay: 0.1, comboMin: 0.5,                      // hitstun x (1 - 0.1 per hit already in the combo), at least x0.5
};
const R = RULES;
const INTRO = 1.6, ROUND_END = 2;
export const PRACTICE_REFILL = 1;   // cfg.practice: s on their feet, unhurt, before a fighter's health refills
const CALM = new Set(['idle', 'walk', 'wind', 'strike', 'recover', 'win']);   // (cfg.practice: the states that count as on their feet)
const BLANK = Object.freeze({ x: 0, y: 0, light: false, heavy: false, special: false, guard: false });
const blank = () => ({ x: 0, y: 0, light: false, heavy: false, special: false, guard: false });
const FREE = new Set(['idle', 'walk']);
// the states a hold (Pyth's coil, Ferris's claw) can wrap someone up in (not mid-swing, not down)
export const GRABBABLE = new Set(['idle', 'walk', 'wind', 'recover', 'dizzy', 'frozen', 'stagger', 'step']);
const KNOCKED = new Set(['hurt', 'stagger', 'down', 'ko', 'dizzy']);   // the states a wall bounces you back from
// the keys: which move each fires, and back
export const MOVE_OF = { light: 'move1', heavy: 'move2', special: 'move3' };
const KEY_OF = { move1: 'light', move2: 'heavy', move3: 'special', evade: 'guard' };
const CD_KEYS = ['move1', 'move2', 'move3', 'evade'];   // (f.cd's order)
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const turnTo = (a, b, max) => { const d = angDiff(b, a); return a + clamp(d, -max, max); };

// a round's fresh fighter state, all plain numbers (the drawer and the online snapshots read it):
//   z, vx, vy, vz, hp, wallT (s since the last wall slam)
//   state, t, dur (the state's time and length), move (move1..3, evade, or null), pose (poseOf), flash, inv
//   (untouchable s), slip, ice (the floor's grip: a slick object, an ice patch), heatCd, padCd (the hazards' rests)
//   hit (this move connected), hold (the index of whoever this one holds or is held by, -1), frozenT
//   stun, combo (hits in the current combo), recent (the last landed moves: stale), hurtN (hits taken this round)
//   wins, down, safeT, gh (ground hits this knockdown), roll, rollA (a quick rise's roll)
//   bufK, bufT (the buffered press), rel (the move's key let go)
//   ph, pht (the move's phase and its time), cd [move1, move2, move3, evade] (cooldowns), ev, evT (an evade with charges:
//   charges left, the next one back in), bx, by (a kit's target point), ms (the move's count: a world object tied to one
//   go of a move dies when it's cut short), gone (between places: Duke's blink, Docky's swim), air (up out of shot), bnc
//   (wall bounces this move), fzx, fzy, fzkd, fzMul, fzBy (frozen: the knockback stored till the thaw, x fzMul, by whom)
//   under (Gopher underground, set every step), lockT (locked: walking and the evade only, Ferris's Ownership)
//   step: stepA (a bounce pad's glide, 'step': its way)
//   psnT, psnSlow, psnBy (poisoned: s left, walking x this, by whom: F.poison)
// plus the kit's own (its fighter's fields), and iso (Docky's Isolation) where the fighter has it
const roundFields = s => ({ z: 0, vx: 0, vy: 0, vz: 0, hp: s.hp, wallT: 9,
  state: 'idle', move: null, t: 0, dur: 0, pose: '', flash: 0, inv: 0, slip: 0, ice: 0, heatCd: 0, padCd: 0,
  hit: false, hold: -1, frozenT: 0, stun: 0, combo: 0, recent: [], hurtN: 0,
  stepA: 0, down: false, safeT: 0, gh: 0, roll: 0, rollA: 0, bufK: '', bufT: 0, rel: true,
  ph: '', pht: 0, cd: [0, 0, 0, 0], ev: s.moves.evade ? s.moves.evade.charges || 0 : 0, evT: 0, bx: 0, by: 0, ms: 0, gone: 0, air: 0, bnc: 0, fzx: 0, fzy: 0, fzkd: 0, fzMul: 0.5, fzBy: -1,
  under: 0, lockT: 0, psnT: 0, psnSlow: 1, psnBy: -1, ...(s.isolation ? { iso: 1 } : null), ...s.fields });

// a mulberry32 stream whose state is a plain number in st[k] (same generator as core.js mulberry)
function rnext(st, k) {
  const s = st[k] = st[k] + 0x6D2B79F5 | 0;
  let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

export class Fight {
  /** @param {FightConfig} [cfg] */
  constructor(cfg = {}) {
    /** @type {FightConfig} */
    this.cfg = cfg = { ids: ['tux', 'duke'], bots: [null, 1], seed: 1, bestOf: 3, roundTime: 60, ...cfg };
    cfg.arena = arenaOf(cfg.arena).id;
    Object.defineProperty(this, 'A', { value: ARENAS[cfg.arena], enumerable: false });   // the arena (static data, js/fight-arenas.js)
    const m = mulberry(cfg.seed | 0);
    this.rs = [m() * 4294967296 | 0, m() * 4294967296 | 0, m() * 4294967296 | 0];   // rng states: bot 0, bot 1, the fight
    Object.defineProperty(this, 'rngs', { value: [0, 1, 2].map(k => () => rnext(this.rs, k)), enumerable: false });
    /** @type {Fighter[]} */
    this.f = cfg.ids.map((id, i) => this.mkFighter(id, i));
    /** @type {WorldObj[]} */ this.objs = [];
    /** @type {FightEvent[]} */ this.events = [];
    this.oid = 0;   // oid: each world object's id (obj.id), for an online view to follow it
    this.inp = [blank(), blank()]; this.prev = [blank(), blank()];
    /** @type {Record<string, any>[]} */
    this.ai = [{}, {}];                // the bots' memory (plain data, fight-ai.js)
    this.round = 1; this.wins = [0, 0];
    this.time = 0; this.hitstop = 0; this.acc = 0;
    /** @type {number | null} */ this.roundWinner = null;
    /** @type {number | null} */ this.winner = null;
    /** @type {{ round: number, winner: number | null, how: string, time: number }[]} */
    this.rounds = [];                  // history: { round, winner, how: 'ko'|'double', time (s of fighting) }
    this.resetRound();
  }

  /** @param {string} id @param {number} i @returns {Fighter} */
  mkFighter(id, i) {
    const s = FIGHTERS[id];
    if (!s) throw new Error(`no fighter ${id}`);
    return { id, i, x: 0, y: 0, face: 0, maxHp: s.hp, wins: 0, walkDist: 0, r: s.radius, stats: s, ...roundFields(s) };
  }

  resetRound() {
    for (const f of this.f) {
      const [x, y] = this.A.spawns[f.i], [ox, oy] = this.A.spawns[1 - f.i];
      Object.assign(f, { x, y, face: Math.atan2(oy - y, ox - x), ...roundFields(f.stats) }); f.hp = f.maxHp;
    }
    this.objs.length = 0;
    this.clock = this.cfg.roundTime; this.rt = 0; this.dmgMul = 1;
    this.phase = 'intro'; this.pt = 0; this.roundWinner = null;
    if (this.cfg.practice) { this.phase = 'fight'; this.pt = 9; this.prac = { calm: [0, 0], hp: this.f.map(f => f.hp) }; }   // (the training room: straight in, the start's burst skipped)
  }

  /** @param {number} i @param {Partial<FightInput>} inp */
  setInput(i, inp) { const d = this.inp[i]; d.x = clamp(+inp.x || 0, -1, 1); d.y = clamp(+inp.y || 0, -1, 1); d.light = !!inp.light; d.heavy = !!inp.heavy; d.special = !!inp.special; d.guard = !!inp.guard; }

  update(dt) {
    this.events.length = 0;
    this.acc += clamp(dt || 0, 0, 0.25);
    while (this.acc >= FIXED) { this.acc -= FIXED; this.step(); }
  }

  /** @param {string} kind @param {number} x @param {number} y @param {number} power @param {number | null} who
   * @param {Record<string, any>} [extra] @returns {FightEvent} */
  ev(kind, x, y, power, who, extra) { const e = { kind, x, y, power: clamp(power || 0, 0, 1), who, move: null }; if (extra) Object.assign(e, extra); this.events.push(e); return e; }

  step() {
    const dt = FIXED;
    this.time += dt;
    const live = this.phase === 'fight' || this.phase === 'sudden';
    if (this.hitstop > 0) {
      // the world holds still, but a human's presses still count (a tap inside a hit's freeze isn't lost)
      this.hitstop = Math.max(0, this.hitstop - dt);
      for (let i = 0; i < 2; i++) if (this.cfg.bots[i] == null) { this.presses(this.f[i], live); Object.assign(this.prev[i], this.inp[i]); }
      return;
    }
    for (let i = 0; i < 2; i++) {
      if (this.cfg.bots[i] != null) {
        if (live) this.setInput(i, fightAI(this, i, this.rngs[i])); else this.setInput(i, BLANK);
      }
    }
    this.phaseStep(dt);
    for (let i = 0; i < 2; i++) { this.presses(this.f[i], live); Object.assign(this.prev[i], this.inp[i]); }
    for (let i = 0; i < 2; i++) this.fighterStep(this.f[i], dt, live);
    this.collide();
    this.objStep(dt);
    for (const f of this.f) if (f.state !== 'frozen') f.pose = poseOf(f);
    if (live) this.checkEnd();
  }

  // the input buffer: a fresh press of a key is remembered for RULES.buffer (the guard key's as 'evade'); the newest wins
  presses(f, live) {
    if (!live) { f.bufK = ''; f.bufT = 0; return; }
    const inp = this.inp[f.i], pv = this.prev[f.i], pr = k => inp[k] && !pv[k];
    if (pr('guard')) { f.bufK = 'evade'; f.bufT = R.buffer; }
    for (const k of ['light', 'heavy', 'special']) if (pr(k)) { f.bufK = k; f.bufT = R.buffer; }
  }

  phaseStep(dt) {
    this.pt += dt;
    if (this.phase === 'intro') {
      if (this.pt >= INTRO) { this.phase = 'fight'; this.pt = 0; this.ev('round', 0, 0, 0, null, { round: this.round }); }
    } else if (this.phase === 'fight') {
      this.rt += dt; if (!this.cfg.practice) this.clock = Math.max(0, this.clock - dt);
      if (this.clock <= 0) { this.phase = 'sudden'; this.pt = 0; this.ev('sudden', 0, 0, 0, null); }
    } else if (this.phase === 'sudden') {
      // every hit's damage grows (dmgMul, plain data: the HUD can show it)
      this.rt += dt; this.dmgMul = SD_MUL[0] + (SD_MUL[1] - SD_MUL[0]) * Math.min(1, this.pt / SD_RAMP);
    } else if (this.phase === 'roundEnd') {
      const w = this.roundWinner != null ? this.f[this.roundWinner] : null;
      if (w && w.z <= 0 && !['ko', 'win', 'grabbed', 'down', 'getup'].includes(w.state)) this.go(w, 'win');
      if (this.pt >= ROUND_END) {
        const need = winsToTake(this.cfg), best = this.wins[0] === this.wins[1] ? null : this.wins[0] > this.wins[1] ? 0 : 1;
        if (best != null && (this.wins[best] >= need || this.round >= this.cfg.bestOf * 3)) {
          this.phase = 'over'; this.pt = 0; this.winner = best;
          const f = this.f[best]; this.go(f, 'win'); f.move = null; f.pose = ''; f.down = false; f.z = 0;
          this.ev('win', f.x, f.y, 1, best);
        } else { this.round++; this.resetRound(); }
      }
    }
  }

  checkEnd() {
    if (this.cfg.practice) return this.practiceStep();
    const lost = this.f.filter(f => f.state === 'ko');
    if (!lost.length) return;
    const how = lost.length > 1 ? 'double' : 'ko';
    this.roundWinner = lost.length > 1 ? null : 1 - lost[0].i;
    if (this.roundWinner != null) { this.wins[this.roundWinner]++; this.f[this.roundWinner].wins = this.wins[this.roundWinner]; }
    this.rounds.push({ round: this.round, winner: this.roundWinner, how, time: this.rt });
    this.phase = 'roundEnd'; this.pt = 0;
  }

  // cfg.practice, every step: a fighter knocked out is knocked down instead, back to full health; one on its feet and
  // unhurt for PRACTICE_REFILL s gets its health back
  practiceStep() {
    const P = this.prac;
    if (this.events.some(e => e.kind === 'ko')) { const k = this.events.filter(e => e.kind !== 'ko'); this.events.length = 0; this.events.push(...k); }
    for (const f of this.f) {
      if (f.state === 'ko') { f.state = 'hurt'; f.hp = f.maxHp; f.safeT = 0; const v = Math.hypot(f.vx, f.vy); this.knockDown(f, v > 1 ? Math.atan2(f.vy, f.vx) : null, v, 1 - f.i); P.calm[f.i] = 0; P.hp[f.i] = f.hp; this.ev('refill', f.x, f.y, 1, f.i); continue; }
      const hurt = f.hp < P.hp[f.i]; P.hp[f.i] = f.hp;   // (any damage, a poison's tick too, starts the wait again)
      if (hurt || !CALM.has(f.state) || f.hp >= f.maxHp) { P.calm[f.i] = 0; continue; }
      P.calm[f.i] += FIXED;
      if (P.calm[f.i] >= PRACTICE_REFILL) { f.hp = P.hp[f.i] = f.maxHp; P.calm[f.i] = 0; this.ev('refill', f.x, f.y, 0.5, f.i); }
    }
  }

  /** @param {Fighter} f @param {string} state @param {number} [dur] */
  go(f, state, dur = 0) { f.state = state; f.t = 0; f.dur = dur; }

  // where a move starting now faces: the held way if it's within RULES.aim of the foe, else straight at them
  aim(f, o) {
    const inp = this.inp[f.i], toFoe = Math.atan2(o.y - f.y, o.x - f.x);
    if (Math.hypot(inp.x, inp.y) > 0.3) { const a = Math.atan2(inp.y, inp.x); if (Math.abs(angDiff(a, toFoe)) <= R.aim) return a; }
    return toFoe;
  }
  // start move id (move1..3 or evade): aimed, its tell begins (the kit's press), held or not; an evade goes at once
  /** @param {Fighter} f @param {string} id */
  startMove(f, id) {
    const mv = f.stats.moves[id], o = this.f[1 - f.i];
    f.move = id; f.hit = false; f.ms++;
    if (id !== 'evade') f.safeT = 0;   // (swinging out of a get-up: no longer safe)
    f.face = this.aim(f, o);
    this.go(f, 'wind', mv.startup);
    f.rel = !this.inp[f.i][KEY_OF[id]]; f.ph = ''; f.bnc = 0;
    const K = KITS[mv.do]; if (K && K.press) K.press(this, f, o, mv, this.ctl(f));
    if (id === 'evade') this.strikeStart(f, o); else this.ev('tell', f.x, f.y, 0.5, f.i, { move: id });
  }
  // the held input as the kits read it
  /** @param {Fighter} f @returns {Ctl} */
  ctl(f) { const inp = this.inp[f.i]; return { inp, mag: Math.min(1, Math.hypot(inp.x, inp.y)), dirA: Math.atan2(inp.y, inp.x) }; }
  // the buffered press, if f can take it now: its move, once off cooldown (kept a moment: it may come off in time) and
  // not locked (Ferris's Ownership Lock: walking and the evade only), if its kit's can lets it. True if something started
  act(f, o) {
    const k = f.bufK, M = f.stats.moves;
    if (!k) return false;
    const take = () => { f.bufK = ''; f.bufT = 0; };
    const mk = k === 'evade' ? 'evade' : MOVE_OF[k], ix = CD_KEYS.indexOf(mk), mv = mk && M[mk];
    if (!mv) { take(); return false; }
    if (f.cd[ix] > 0) return false;
    if (f.lockT > 0 && mk !== 'evade') return false;
    if (f.psnT > 0 && mk === 'evade') return false;   // (poisoned: no evade till it wears off)
    take();
    const K = KITS[mv.do]; if (K && K.can && !K.can(this, f, mv)) return false;
    this.startMove(f, mk); f.cd[ix] = mv.cooldown || 0;
    return true;
  }
  // a bounce pad's boost: a quick glide that way ('step', no friction), the drawer leaning into it (f.stepA)
  boost(f, a, dist, dur) {
    const v = dist / dur;
    f.stepA = a; f.move = null;
    f.vx = Math.cos(a) * v; f.vy = Math.sin(a) * v;
    this.go(f, 'step', dur); this.ev('step', f.x, f.y, 0.3, f.i, { a });
  }

  fighterStep(f, dt, live) {
    const s = f.stats, M = s.moves, o = this.f[1 - f.i], inp = live ? this.inp[f.i] : BLANK;
    f.t += dt;
    f.flash = Math.max(0, f.flash - dt); f.inv = Math.max(0, f.inv - dt); f.safeT = Math.max(0, f.safeT - dt);
    f.pht += dt;
    for (let k = 0; k < 4; k++) if (f.cd[k] > 0 && f.move !== CD_KEYS[k]) f.cd[k] = Math.max(0, f.cd[k] - dt);   // (a cooldown runs once the move's over)
    if (f.bufT > 0) { f.bufT -= dt; if (f.bufT <= 1e-9) { f.bufT = 0; f.bufK = ''; } }
    this.passives(f, s, dt, live);
    if (!KNOCKED.has(f.state) && f.state !== 'grabbed' && f.state !== 'frozen') f.combo = 0;   // (back on their feet: the next hit starts a new combo)
    f.slip = 0; f.ice = 0; f.heatCd = Math.max(0, (f.heatCd || 0) - dt); f.padCd = Math.max(0, (f.padCd || 0) - dt);
    if (f.z <= 0) for (const p of this.objs) if (p.slick && Math.hypot(f.x - p.x, f.y - p.y) < p.r + f.r * 0.4) f.slip = 1;   // (a kit's slick puddle: Octo's ink)
    if (f.z <= 0 && !f.gone && this.A.hazards.length && live) this.hazards(f, dt);
    const mag = Math.min(1, Math.hypot(inp.x, inp.y)), dirA = Math.atan2(inp.y, inp.x);
    const toFoe = Math.atan2(o.y - f.y, o.x - f.x);
    let glide = false;   // glide: the state sets its own velocity (no ground friction)

    switch (f.state) {
      case 'idle': case 'walk': break;
      case 'step':   // a bounce pad's glide
        glide = true;
        if (f.t >= f.dur) { f.vx *= 0.15; f.vy *= 0.15; this.go(f, 'idle'); glide = false; }
        break;
      case 'wind': {   // the move's tell: the kit's wind (aiming, the ring growing), held past its startup if it holds
        const mv = M[f.move], K = KITS[mv.do], c = { inp, mag, dirA };
        if (!inp[KEY_OF[f.move]]) f.rel = true;
        if (K && K.wind) K.wind(this, f, o, mv, dt, c);
        if (f.state === 'wind' && f.t >= f.dur && !(K && K.hold && K.hold(this, f, o, mv, c))) this.strikeStart(f, o);
        break;
      }
      case 'strike': {
        const mv = M[f.move], K = KITS[mv.do];
        glide = !!(K && K.moves);
        if (K && K.step) K.step(this, f, o, mv, dt, { inp, mag, dirA });
        if (f.state === 'strike' && f.t >= f.dur) this.strikeEnd(f, o);
        break;
      }
      case 'recover': {
        { const K = kitOf(f); if (K && K.recover && K.recover(this, f, o)) break; }   // (a kit's recovery cut short: Duke's jab out of his blink)
        if (f.t >= f.dur) { this.go(f, 'idle'); f.move = null; f.ph = ''; }
        break;
      }
      case 'grabbed': break;   // (held by a kit's move: it moves them)
      case 'hurt': case 'stagger': if (f.t >= f.dur) this.go(f, 'idle'); break;
      case 'down':
        if (live && f.bufK && f.t >= R.riseMin && f.hp > 0) { this.rise(f, o, inp, mag, dirA); glide = true; break; }   // (a quick rise: any key pressed, rolled up that way)
        if (f.t >= f.dur) { this.go(f, 'getup', R.getupT); f.inv = R.getupT; f.roll = 0; f.vx *= 0.2; f.vy *= 0.2; this.ev('getup', f.x, f.y, 0.3, f.i); }
        break;
      case 'getup':
        f.inv = Math.max(f.inv, dt);
        if (f.roll) { glide = true; const v = R.rollDist / R.rollT; f.vx = Math.cos(f.rollA) * v; f.vy = Math.sin(f.rollA) * v; }   // (the roll: its own speed, no friction)
        if (f.t >= f.dur) { this.go(f, 'idle'); f.inv = 0; f.safeT = R.safeT; if (f.roll) { f.vx *= 0.25; f.vy *= 0.25; } f.roll = 0; }
        break;
      case 'dizzy': if (f.t >= f.dur) this.go(f, 'idle'); break;
      case 'frozen': f.vx = f.vy = 0; if (f.t >= f.dur) this.thaw(f); break;
      case 'ko': break;
      case 'win': break;
    }
    f.down = f.state === 'down';
    if (!f.move) { f.ph = ''; f.gone = 0; f.air = 0; }   // (out of a move, however it ended)
    // off the floor only while a move lifts you (a hop, a dive): cut short, you drop back down
    if (f.z > 0 && f.state !== 'strike') f.z = Math.max(0, f.z - 400 * dt);

    // free: the buffered press, else walking
    let walking = false;
    if (FREE.has(f.state) && !(live && this.act(f, o))) walking = true;

    // facing: toward the foe when free, and while gliding
    if (f.state === 'idle' || f.state === 'walk' || f.state === 'step') f.face = turnTo(f.face, toFoe, TURN * dt);

    // ground movement: walking is near-instant (accel/friction ~30/s), slower backing away
    const slipF = Math.min(f.slip ? s.slipMul : 1, f.ice || 1);
    if (walking && FREE.has(f.state)) {
      let sp = WALK * s.walk * (f.psnT > 0 ? f.psnSlow : 1);   // (poisoned: slower)
      if (mag > 0.1 && !o.air && !o.gone) sp *= 1 - (1 - R.backWalk) * Math.max(0, -Math.cos(angDiff(dirA, toFoe)));
      const tx = mag > 0.1 ? Math.cos(dirA) * sp * mag : 0, ty = mag > 0.1 ? Math.sin(dirA) * sp * mag : 0;
      const grip = mag > 0.1 ? s.accel * (f.slip || f.ice ? 0.4 * slipF + 0.1 : 1) : s.friction * slipF;
      const k = Math.min(1, grip * dt);
      f.vx += (tx - f.vx) * k; f.vy += (ty - f.vy) * k;
      const ns = mag > 0.1 ? 'walk' : 'idle'; if (f.state !== ns) this.go(f, ns);
    } else if (!glide && f.state !== 'frozen' && f.state !== 'grabbed') {
      const k = Math.exp(-(f.state === 'strike' || f.state === 'wind' || f.state === 'recover' ? s.friction * 0.35 : s.kbDecay) * slipF * dt); f.vx *= k; f.vy *= k;
    }
    if (f.state === 'frozen' || f.state === 'grabbed') return;
    f.x += f.vx * dt; f.y += f.vy * dt;
    if (f.state === 'walk' || f.state === 'idle' || f.state === 'step') f.walkDist += Math.hypot(f.vx, f.vy) * dt;   // for the drawer's walk cycle
    this.walls(f, true);
  }

  // poison f for dur s (Pyth's venom, Cpp's sludge): walking x slow and no evade while it
  // lasts. Poisoned again: the longer of the two times, the stronger of the two slows. by: who did it. Returns true if it's new
  /** @param {Fighter} f @param {number} dur @param {number} slow @param {number} by */
  poison(f, dur, slow, by) {
    if (f.state === 'ko' || !(dur > 0)) return false;
    const fresh = !(f.psnT > 0);
    f.psnT = Math.max(f.psnT, dur); f.psnSlow = fresh ? slow : Math.min(f.psnSlow, slow); f.psnBy = by;
    return fresh;
  }

  /** @param {Fighter} f */
  release(f) {   // let go of whoever f holds (or is held by)
    if (f.hold >= 0) { const o = this.f[f.hold]; o.hold = -1; if (o.state === 'grabbed') { this.go(o, 'idle'); o.move = null; } f.hold = -1; }
  }

  // every step: the lock running out, the kit's own timers (its tick), an evade's charges coming back one at a time
  passives(f, s, dt, live) {
    f.under = 0;   // (Gopher's dig sets it again every step he's underground)
    if (f.lockT > 0) f.lockT = Math.max(0, f.lockT - dt);
    if (f.psnT > 0) { f.psnT = Math.max(0, f.psnT - dt); if (f.psnT <= 0 || f.state === 'ko') { f.psnT = 0; f.psnSlow = 1; this.ev('cure', f.x, f.y, 0.3, f.psnBy, { to: f.i }); f.psnBy = -1; } }
    if (s.tick) s.tick(this, f, dt, live);   // (a fighter's own timers: js/kits/<id>.js)
    const E = s.moves.evade;
    if (E && E.charges && f.ev < E.charges) {   // (Duke's Garbage Collect: a charge back recharge s after it's spent, one at a time)
      f.evT -= dt;
      if (f.evT <= 0) { f.ev++; f.evT = f.ev < E.charges ? E.recharge : 0; }
    }
  }

  // the arena's floor hazards under a grounded fighter (fight-arenas.js): ice (f.ice: its grip), a heat vent burning
  // (it knocks you down), a bounce pad (a boost: a glide the way you were going), a conveyor belt
  hazards(f, dt) {
    for (const h of this.A.hazards) {
      if (!within(h, f.x, f.y, h.kind === 'heat' ? -f.r * 0.5 : 0)) continue;
      if (h.kind === 'ice') f.ice = f.ice ? Math.min(f.ice, h.grip) : h.grip;
      else if (h.kind === 'belt') { if (f.state !== 'grabbed' && f.state !== 'frozen') { f.x += h.vx * dt; f.y += h.vy * dt; } }
      else if (h.kind === 'heat') {
        if (heatState(h, this.rt) !== 2 || f.heatCd > 0 || f.state === 'ko' || f.state === 'grabbed' || f.inv > 0 || f.state === 'down') continue;
        f.heatCd = h.on + 0.2; this.release(f); f.move = null; f.flash = 0.2;
        f.hp = Math.max(0, f.hp - h.dmg * f.maxHp * this.dmgMul);   // (a share of their health: as hard on the light as on the heavy)
        const a = Math.atan2(f.y - (h.y || 0), f.x - (h.x || 0)) || 0;
        this.ev('burn', f.x, f.y, 0.7, f.i);
        if (f.hp <= 0) { f.vx = Math.cos(a) * h.kb * 0.5; f.vy = Math.sin(a) * h.kb * 0.5; this.go(f, 'ko'); this.ev('ko', f.x, f.y, 1, f.i); }
        else this.knockDown(f, a, h.kb * 0.6, -1);
      } else if (h.kind === 'pad') {
        if (f.padCd > 0 || !['idle', 'walk', 'hurt', 'stagger', 'step', 'recover', 'dizzy'].includes(f.state)) continue;
        f.padCd = 0.6; f.move = null;
        const sp = Math.hypot(f.vx, f.vy), a = sp > 20 ? Math.atan2(f.vy, f.vx) : f.face;
        this.boost(f, a, (sp * 0.5 + h.push) * 0.3, 0.3);
        this.ev('pad', f.x, f.y, 0.6, f.i);
      }
    }
  }

  // the arena's walls and solids: push a fighter out of them. Knocked into one fast enough, a fighter bounces back off
  // it, takes a little damage and goes down; otherwise they just stop against it (sliding along)
  walls(f, bounce) {
    f.wallT += FIXED;
    for (let it = 0; it < 3; it++) {
      const cs = this.contactsAll(f.x, f.y, f.r);
      if (!cs.length) return;
      let c = cs[0]; for (const k of cs) if (k.pen > c.pen) c = k;
      f.x += c.nx * c.pen; f.y += c.ny * c.pen;
      const vn = f.vx * c.nx + f.vy * c.ny;
      if (vn >= 0) continue;
      if (bounce && f.state === 'strike') { const K = kitOf(f); if (K && K.wall && K.wall(this, f, c)) continue; }   // (a slide or a dive head first into a wall: the kit's)
      if (bounce && KNOCKED.has(f.state) && -vn > WALL_V && f.wallT > 0.2 && !(f.safeT > 0)) {   // (just up: no wall slam, they stop against it)
        const p = clamp((-vn - WALL_V) / 500, 0, 1);
        f.vx -= (1 + WALL_E) * vn * c.nx; f.vy -= (1 + WALL_E) * vn * c.ny; f.wallT = 0;
        this.ev('wall', f.x - c.nx * f.r, f.y - c.ny * f.r, 0.3 + 0.7 * p, f.i, { nx: c.nx, ny: c.ny });
        if (f.state !== 'ko') {
          f.hp = Math.max(0, f.hp - WALL_DMG * f.maxHp * (0.35 + 0.65 * p) * this.dmgMul); f.flash = 0.15;
          this.hitstop = Math.max(this.hitstop, Math.round(3 + 3 * p) / 60);
          if (f.hp <= 0) { this.release(f); f.move = null; this.go(f, 'ko'); this.ev('ko', f.x, f.y, 1, f.i); }
          else if (f.state !== 'down') { f.vx *= 0.6; f.vy *= 0.6; this.knockDown(f, null, 0, 1 - f.i); }   // (slammed: down it goes)
        }
      } else { f.vx -= vn * c.nx; f.vy -= vn * c.ny; }
    }
    if (this.objs.length) this.inBounds(f);
  }

  // the end of a freeze (Stop the World): off with the knockback the hits stored, down if any of them knocked down
  thaw(f) {
    const v = Math.hypot(f.fzx, f.fzy), a = Math.atan2(f.fzy, f.fzx);
    this.ev('thaw', f.x, f.y, 0.5, f.i);
    if (f.fzkd) this.knockDown(f, a, v, f.fzBy);
    else if (v > 1) { f.vx = f.fzx; f.vy = f.fzy; this.go(f, 'hurt', 0.22); }
    else this.go(f, 'idle');
    f.fzx = f.fzy = 0; f.fzkd = 0; f.frozenT = 0;
  }

  // a quick rise: down a moment (RULES.riseMin), any key
  // pressed (buffered: an evade's press spends nothing, its charges and cooldown untouched) rolls them up the held way
  // (nothing held: away from the foe), untouchable through the roll ('getup' with f.roll), then safe on their feet
  rise(f, o, inp, mag, dirA) {
    const a = mag > 0.3 ? dirA : Math.atan2(f.y - o.y, f.x - o.x);
    f.bufK = ''; f.bufT = 0;
    this.go(f, 'getup', R.rollT); f.inv = R.rollT; f.roll = 1; f.rollA = a;
    const v = R.rollDist / R.rollT; f.vx = Math.cos(a) * v; f.vy = Math.sin(a) * v;
    this.ev('rise', f.x, f.y, 0.4, f.i, { a });
  }
  // knock f down: sliding the way a (null: as it's going) at kb, down for downT then getting up; by: who did it (-1: the map)
  /** @param {Fighter} f @param {number | null} a @param {number} kb @param {number} by */
  knockDown(f, a, kb, by) {
    if (f.state === 'down') return;   // (already down: never floored again, the time down not stretched: a ground hit's own slide)
    if (f.safeT > 0 && f.state !== 'ko' && f.hp > 0) {   // (just up off a knockdown: staggered, not floored again)
      this.release(f); f.move = null; f.z = 0;
      if (a != null) { f.vx = Math.cos(a) * kb * 0.6; f.vy = Math.sin(a) * kb * 0.6; }
      this.go(f, 'hurt', 0.25);
      return;
    }
    this.release(f); f.move = null; f.stun = 0; f.z = 0;
    if (a != null) { f.vx = Math.cos(a) * kb; f.vy = Math.sin(a) * kb; }
    this.go(f, 'down', R.downT * (f.stats.stunMul || 1)); f.down = true; f.combo = 0; f.gh = 0; f.roll = 0; f.bufK = ''; f.bufT = 0;   // (only a press from now on rolls them up)
    this.ev('down', f.x, f.y, clamp(0.4 + kb / 600, 0, 1), f.i, { by });
  }

  // the arena's contacts (fight-arenas.js contacts) and the world objects that are walls (solid: 1, a box or circle
  // shape, on the floor: Docky's crates)
  /** @param {number} x @param {number} y @param {number} r */
  contactsAll(x, y, r) {
    const out = contacts(this.A, x, y, r);
    for (const o of this.objs) if (o.solid && o.z <= 0) { const [e, hx, hy] = sd(o, x, y); if (e < r) out.push({ pen: r - e, nx: hx, ny: hy, solid: o }); }
    return out;
  }

  /** @param {Fighter} f @param {Fighter} o */
  strikeStart(f, o) {
    const mv = f.stats.moves[f.move];
    this.go(f, 'strike', mv.active);
    f.hit = false;
    const K = KITS[mv.do];
    if (K && K.start) K.start(this, f, o, mv);
  }

  strikeEnd(f, o) {
    const mv = f.stats.moves[f.move], K = KITS[mv.do];
    if (K && K.end && K.end(this, f, o, mv)) return;
    if (!f.hit && (mv.contact || mv.whiff)) this.whiff(f);
    this.go(f, 'recover', mv.recovery);
  }
  // a move that met nothing (event 'whiff')
  /** @param {Fighter} f @param {string | null} [move] */
  whiff(f, move = f.move) { this.ev('whiff', f.x, f.y, 0.2, f.i, { move }); }

  // can f's move mv reach t right now (reach from the bodies' edges, arc degrees round f's facing)
  /** @param {Fighter} f @param {{ x: number, y: number, r: number }} t @param {Move} mv @param {number} [pad] */
  reaches(f, t, mv, pad = 4) {
    const d = Math.hypot(t.x - f.x, t.y - f.y), a = Math.atan2(t.y - f.y, t.x - f.x);
    return d - f.r - t.r <= (mv.reach || 0) + pad && Math.abs(angDiff(a, f.face)) <= (mv.arc || 360) * D2R / 2 + Math.atan2(t.r, Math.max(d, 1));
  }
  // a hit from a onto d with move mv (a move's numbers: damage, kb, kd, stun, stale). Returns true if it connected (a
  // hit, or settled by d's guard hook), false if it went through nothing. F.lastRes says what it came to: 'hit',
  // 'ground' (on someone down), or a guard hook's own ('soak' ...); '' nothing. opt: { dir (the push's way), dmgMul, kbMul,
  // move (the move's key, when a isn't doing it right now), obj (a thing in the world, not a's body: never trades), hold
  // (a hold letting go of them: Pyth's toss), kd (knocks down), trade (this is one half of a trade) }
  /** @param {Fighter} a @param {Fighter} d @param {Move} mv @param {HitOpt} [opt] @returns {boolean} */
  hitF(a, d, mv, opt = {}) {
    /** @type {string} */
    this.lastRes = '';
    if (d.stats.guard) { const r = d.stats.guard(this, a, d, mv, opt); if (r !== undefined) return r; }   // (the fighter's own say first: js/kits/<id>.js)
    if (d.state === 'down' && !opt.hold && !(d.inv > 0) && d.hp > 0) return this.groundHit(a, d, mv, opt);   // (on the floor: a lighter hit, at most RULES.groundN)
    if ((d.inv > 0 && !opt.hold) || d.state === 'ko' || d.state === 'down' || d.state === 'getup' || (d.state === 'grabbed' && !opt.hold)) return false;
    const ang = opt.dir ?? Math.atan2(d.y - a.y, d.x - a.x), key = opt.move || a.move;
    // a trade: d's own contact move active and reaching a too: both land
    if (!opt.obj && !opt.hold && a.state === 'strike' && !opt.trade && d.state === 'strike' && d.move && !d.hit) {
      const dm0 = d.stats.moves[d.move], dm = dm0 && (dm0.damage != null ? dm0 : dm0.hit);
      if (dm && dm0.contact && !dm0.hop && this.reaches(d, a, dm0)) {
        d.hit = true;
        this.ev('trade', (a.x + d.x) / 2, (a.y + d.y) / 2, 0.6, a.i, { move: key, to: d.i });
        this.hitF(d, a, dm, { trade: true, dmgMul: 1, kbMul: R.trade, move: d.move });
        opt = { ...opt, trade: true, kbMul: (opt.kbMul || 1) * R.trade };
      }
    }
    const stale = mv.stale === false ? 1 : Math.max(0.5, 1 - R.stale * a.recent.filter(k => k === key).length);
    let dmg = mv.damage * (opt.dmgMul || 1) * this.dmgMul * stale;
    const kb0 = mv.kb * (opt.kbMul || 1);
    // a counter hit: caught in their tell
    const ctr = !opt.hold && d.state === 'wind' && !!d.move;
    const bonus = ctr ? R.counter : 1;
    dmg *= bonus;
    if (mv.stale !== false) { a.recent.push(key); if (a.recent.length > R.staleN) a.recent.shift(); }
    if (KNOCKED.has(d.state)) d.combo++; else d.combo = 1;
    this.release(d);
    const wasFrozen = d.state === 'frozen';
    d.hurtN++;   // (hits taken this round: Duke's Hot Java hops back onto him when it goes up while the pot's on them)
    if (d.iso) { d.iso = 0; dmg = 0; this.ev('iso', d.x, d.y, 0.7, a.i, { move: key, to: d.i }); }   // (Docky's Isolation: the round's first hit does no damage)
    else d.hp = Math.max(0, d.hp - dmg);
    let kb = kb0 * (1 + (bonus - 1) * 0.5) / d.stats.weight;
    if (wasFrozen) kb *= d.fzMul;   // (frozen: less knockback, so a freeze isn't a KO by itself)
    d.move = null; d.flash = 0.2; d.stun = 0; d.ph = '';
    this.lastRes = 'hit';
    const power = clamp(kb / 600, 0, 1);
    this.ev('hit', d.x, d.y, power, a.i, { move: key, to: d.i, counter: ctr, dmg });
    if (ctr) this.ev('counter', d.x, d.y, 0.8, a.i, { move: key, to: d.i });
    const kd = opt.kd || mv.kd || kb >= R.downKb;
    this.hitstop = Math.min(8, Math.round(3 + 3 * power + (ctr || kd ? 2 : 0))) / 60;
    if (d.hp <= 0) { d.vx = Math.cos(ang) * kb; d.vy = Math.sin(ang) * kb; this.release(d); d.move = null; this.go(d, 'ko'); this.ev('ko', d.x, d.y, 1, d.i); }
    else if (wasFrozen) { d.fzx += Math.cos(ang) * kb; d.fzy += Math.sin(ang) * kb; if (kd) { d.fzkd = 1; d.fzBy = a.i; } }   // (stopped in time: it all lands at the thaw)
    else if (kd) this.knockDown(d, ang, kb, a.i);
    else {
      d.vx = Math.cos(ang) * kb; d.vy = Math.sin(ang) * kb;
      const stun = (mv.stun ?? (0.22 + kb / 1200)) * comboScale(d.combo) * (d.stats.stunMul || 1) * (ctr ? R.counterStun : 1);
      this.go(d, 'hurt', stun);
    }
    return true;
  }

  // a hit on someone knocked down: RULES.groundDmg
  // of the damage (no counter bonus), a short slide, never floored again nor kept down longer, at most RULES.groundN a
  // knockdown (then it goes through). A hold (opt.hold) never takes them. lastRes 'ground' (a kit's
  // follow-up on a 'hit' doesn't run); event 'hit' with ground: true (a lighter impact)
  groundHit(a, d, mv, opt) {
    if (d.gh >= R.groundN || !(mv.damage > 0)) return false;
    const key = opt.move || a.move, stale = mv.stale === false ? 1 : Math.max(0.5, 1 - R.stale * a.recent.filter(k => k === key).length);
    let dmg = mv.damage * (opt.dmgMul || 1) * this.dmgMul * stale * R.groundDmg;
    if (d.iso) { d.iso = 0; dmg = 0; this.ev('iso', d.x, d.y, 0.7, a.i, { move: key, to: d.i }); }
    else d.hp = Math.max(0, d.hp - dmg);
    d.gh++; d.hurtN++; d.flash = 0.12;
    if (mv.stale !== false) { a.recent.push(key); if (a.recent.length > R.staleN) a.recent.shift(); }
    const ang = opt.dir ?? Math.atan2(d.y - a.y, d.x - a.x), kb = Math.min(R.groundKbMax, (mv.kb || 0) * (opt.kbMul || 1) * R.groundKb / d.stats.weight);
    d.vx = Math.cos(ang) * kb; d.vy = Math.sin(ang) * kb;
    this.lastRes = 'ground';
    this.ev('hit', d.x, d.y, clamp(kb / 600, 0, 0.25), a.i, { move: key, to: d.i, dmg, ground: true, n: d.gh });
    this.hitstop = Math.max(this.hitstop, 2 / 60);
    if (d.hp <= 0) { d.vx = Math.cos(ang) * kb * 1.5; d.vy = Math.sin(ang) * kb * 1.5; this.release(d); d.move = null; this.go(d, 'ko'); this.ev('ko', d.x, d.y, 1, d.i); }
    return true;
  }

  collide() {
    const [a, b] = this.f;
    if (a.hold >= 0 || b.hold >= 0) return;
    if (a.z > 12 || b.z > 12 || a.under || b.under || a.gone || b.gone || a.ghost || b.ghost) return;   // (ghost: a kit's move passing through bodies, Cpp's Play Dead)
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, ov = a.r + b.r - d;
    if (ov <= 0) return;
    const wa = a.stats.weight, wb = b.stats.weight, ux = dx / d, uy = dy / d;
    const ka = wb / (wa + wb), kb = wa / (wa + wb);
    a.x -= ux * ov * ka; a.y -= uy * ov * ka; b.x += ux * ov * kb; b.y += uy * ov * kb;
    this.keepIn(a); this.keepIn(b);   // (a body push never puts you in a wall)
  }

  /** @param {Fighter} f */
  keepIn(f) {   // push a fighter out of the walls and solids, nothing more
    for (let it = 0; it < 3; it++) {
      const cs = this.contactsAll(f.x, f.y, f.r);
      if (!cs.length) return;
      let c = cs[0]; for (const k of cs) if (k.pen > c.pen) c = k;
      f.x += c.nx * c.pen; f.y += c.ny * c.pen;
    }
    this.inBounds(f);
  }
  // squeezed between a solid object and the wall (no way out of both): the wall wins, never outside the arena
  inBounds(f) {
    const [d, gx, gy] = sd(this.A.bounds, f.x, f.y);
    if (d + f.r > 0.25) { f.x -= gx * (d + f.r); f.y -= gy * (d + f.r); }
  }

  // the world objects: each kind's step (its kit's objs), gone once ob.t >= ob.life
  objStep(dt) {
    let dead = false;
    for (const ob of this.objs) {
      ob.t += dt;
      const own = this.f[ob.owner], foe = this.f[1 - ob.owner];
      if (OBJ[ob.kind]) OBJ[ob.kind](this, ob, dt, own, foe, own.stats.moves);
      if (ob.t >= ob.life) dead = true;
    }
    if (dead) this.objs = this.objs.filter(ob => ob.t < ob.life);
  }
}

export const comboScale = n => Math.max(R.comboMin, 1 - R.comboDecay * Math.max(0, n - 1));

// what the drawer shows for this fighter right now (also kept on fighter.pose): one of its 3D model's poses
// (art/model3d.js MODELS[id].poses), or the fight's own 'step' (a pad's glide: a lean its way, f.stepA), 'down' (knocked
// flat), 'getup' and 'hurt'. In a move, the pose of its phase (the fighter's phPose: { phase: pose }); in the recovery of a
// phase in its phFade, back to standing ('') for the second half
export function poseOf(f) {
  switch (f.state) {
    case 'step': return 'step';
    case 'down': return 'down';
    case 'getup': return 'getup';
    case 'grabbed': case 'hurt': case 'stagger': case 'ko': return 'hurt';
    case 'frozen': return f.pose || '';
    case 'wind': case 'strike': case 'recover': {
      const S = f.stats;
      if (f.state === 'recover' && S.phFade.has(f.ph) && f.t >= (f.dur || 0) * 0.5) return '';
      return S.phPose[f.ph] ?? '';
    }
    default: return '';
  }
}
