// Fight mode's simulation: two mascots 1v1 in an arena (js/fight-arenas.js, cfg.arena). Health only: knock their health
// to zero (the user: "only based on health and not knock off the map"). The arena's edge is a solid wall: a fighter
// knocked into it fast enough bounces off it, takes a little extra damage and is knocked down. When the clock runs out
// it's sudden death: every hit does more and more damage until someone goes down.
//
// A real fight, not a Smash-style one (2026-10-23, the user: "no more smash like perfect frames and etc, i want it more
// real fighting. yes shield just in front is good for now"). Footwork, angles, stamina and clean hits:
//   - Controls: every press is remembered for RULES.buffer (8 frames) and fires on the first frame you can act (one
//     buffered action, the newest wins). Walking is near-instant; backing away is slower. A move aims when it starts
//     (the held direction within RULES.aim of the foe, else straight at them) and keeps that facing (whiffs are real).
//     Heavy winds up the moment it's pressed; held past its startup it charges (up to maxCharge), letting go or full
//     charge fires it.
//   - The shield covers your front only (f.guardArc): a hit from further round lands as if you weren't blocking. While
//     blocking you walk slowly and turn slowly. A blocked hit chips RULES.chip of its damage, pushes you back and costs
//     stamina. No perfect block, no pool, no breaking.
//   - Stamina (f.stam 0..1): attacks, steps and blocked hits spend it, it grows back after a moment. Empty (f.gassed s
//     left): your attacks start slower, you walk slower, and a blocked hit staggers you open. That's how a turtle loses.
//   - Clean hits: a counter hit (in their startup or charge) and a flank (from the side or behind) do more and stun longer.
//   - Steps (Guard + a direction at the press): a quick step that way, no invincibility; a light or heavy during a forward
//     step is a lunging jab or a running heavy.
//   - Knockdowns, never launches: a full charge, a finisher on a counter or a flank, a wall slam, a kit's big hit or big
//     knockback put them down (untouchable) then up (untouchable); everything else staggers ('hurt'), by the move.
//   - Combos: lights chain, a light that hits cancels into heavy or special (buffered); combos decay; moves go stale.
//   - Two contact moves active and in reach both land (a trade). Armor where a kit needs it. No generic grab.
// Three big moves, no jab (2026-10-23, the user: "no more basic fast attack for everyone. maybe 3 ish unique moves to
// everyone"): a fighter with `kit3` (Tux and Duke, the only pickable ones) has no lights, heavy or super. The light,
// heavy and special keys fire its move1, move2 and move3 (startMove -> 'wind': the move's tell, its kit's press/wind/hold
// hooks; then 'strike' and 'recover' as any move), each with its own stamina cost and a cooldown that runs once it's
// over (f.cd). A move's phase is f.ph (the drawer's pose key, f.pht its time). Duke's Stop the World freezes ('frozen':
// hits store their knockback till the thaw). And no shield (2026-10-23, the user: "no shield, and just have
// dodges/dashes/evades... 4 buttons"): for them the guard key is their own evade (move 'evade': Tux's Ice Block, hits
// clink off; Duke's Garbage Collect, a blink with two charges, f.ev / f.evT), and there are no steps, no stamina and no
// flank bonus (counter hits stay). Tux's fork() penguins shield him: a hit at him through one pops it instead. The
// phases, objects, events and poses: docs/fight-api-tux-duke.md. The other eight still run the
// light/heavy/special/super, shield, step and stamina rules above (unpickable, kept for their own rebuild).
// DOM-free, loads in Node, deterministic: fixed 60 Hz steps, randomness only from seeded streams kept as plain numbers
// on the fight (never Math.random). Everything the drawer reads is plain data.
//
// Units like the race's: world units (a mascot ~46 tall), x right, y down the screen, the arena centred on (0, 0).
// The fighters' numbers live in js/fight-chars.js, the kits in js/fight-kits.js, the bots in js/fight-ai.js, the maps in
// js/fight-arenas.js.
import { TAU, clamp, mulberry } from './core.js';
import { FIGHTERS, MOVE_KEYS, armorOf } from './fight-chars.js';
import { fightAI } from './fight-ai.js';
import { ARENAS, arenaBox, arenaOf, contacts, heatState, sd, within } from './fight-arenas.js';
import { KITS, OBJ, countering, kitOf, setPh, shoveCrate } from './fight-kits.js';

export const ARENA = { r: ARENAS.ring.bounds.r };   // (the first arena's radius: kept for old readers)
export const FIXED = 1 / 60;
export const GRAV = 1500;              // units/s² (what's still thrown through the air: Duke's cup)
export const WALL_V = 170;             // speed into a wall from which a knocked fighter bounces off it (and goes down)
export const WALL_E = 0.5;             // how much of that speed the bounce gives back
export const WALL_DMG = 0.035;         // a hard wall-bounce's extra damage, a share of max health (scaled down for softer ones)
export const SD_MUL = [1.5, 3], SD_RAMP = 20;   // sudden death: every hit's damage times 1.5, rising to 3 over 20 s
const D2R = Math.PI / 180;
const WALK = 150;                      // walk speed for walk 1.0
const TURN = 12;                       // facing turn rate toward the foe when free (rad/s)
// The combat rules' numbers (one object, so tuning scripts can try others)
export const RULES = {
  buffer: 8 / 60,                      // a press is remembered this long
  aim: 60 * D2R,                       // a move aims the held way if it's within this of the foe
  backWalk: 0.75,                      // walking straight away from the foe: this much of the speed
  guardArc: 70 * D2R,                  // the shield's half-angle round your facing (Ferris: his own)
  guardWalk: 0.4, guardTurn: 3,        // blocking: walk this much of the speed, turn this fast (rad/s)
  chargeTurn: 2.5,                     // charging a heavy: turn this fast toward the foe
  chip: 0.1,                           // a blocked hit's damage that gets through
  blockStam: 0.018,                    // stamina a blocked hit costs, per point of its damage
  stamRegen: 0.3, stamWait: 0.5,       // stamina back a second, after this long without spending
  blockRegen: 0.5,                     // ...this much of it while holding a block
  gasT: 1.2, gasTo: 0.3,               // empty: gassed this long, coming back to this much
  gasStartup: 1.35, gasWalk: 0.7, gasStagger: 0.35,   // gassed: startups x, walk x, a blocked hit staggers you this long
  cost: { light: 0.08, heavy: 0.16, charge: 0.06, special: 0.12, super: 0, step: 0.1, whiff: 0.04 },
  counter: 1.4, side: 1.2, back: 1.4, bonusCap: 1.8,   // a counter hit's and a flank's damage
  sideArc: 70 * D2R, backArc: 120 * D2R,              // off their facing by this much: a side hit, a hit from behind
  counterStun: 1.35, backStun: 1.2,                    // and their stagger x this
  stepT: 0.22, stepDist: 90, stepCd: 0.45,             // a step: how long, how far (round them: a sideways step circles them), how soon again
  stepReach: 14, stepStartup: 0.03,                    // a step attack: this much more reach and startup
  downT: 0.7, getupT: 0.35,                            // a knockdown: down this long (sliding), then getting up (untouchable)
  downKb: 230,                                         // knockback (after weight) that knocks down by itself
  trade: 0.7,                                          // a trade: each hit's knockback x this
  cancelStartup: 0.75,                                 // a heavy or special cancelled out of a landed light starts this much quicker
  stale: 0.1, staleN: 5,                               // each time the same move is among your last 5 landed hits: 10 % less (at most half off)
  comboDecay: 0.1, comboMin: 0.5,                      // hitstun x (1 - 0.1 per hit already in the combo), at least x0.5
};
const R = RULES;
const INTRO = 1.6, ROUND_END = 2;
const BLANK = Object.freeze({ x: 0, y: 0, light: false, heavy: false, special: false, guard: false });
const blank = () => ({ x: 0, y: 0, light: false, heavy: false, special: false, guard: false });
const FREE = new Set(['idle', 'walk', 'block']);
// the states Pyth's coil can wrap someone up in (not mid-swing, not down)
export const GRABBABLE = new Set(['idle', 'walk', 'block', 'charge', 'wind', 'recover', 'dizzy', 'frozen', 'stagger', 'step']);
const KNOCKED = new Set(['hurt', 'stagger', 'down', 'ko', 'dizzy', 'float']);   // the states a wall bounces you back from
// a three-move fighter's keys: which move each fires, and back
export const MOVE_OF = { light: 'move1', heavy: 'move2', special: 'move3' };
const KEY_OF = { move1: 'light', move2: 'heavy', move3: 'special', evade: 'guard' };
const CD_KEYS = ['move1', 'move2', 'move3', 'evade'];   // (f.cd's order)
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const turnTo = (a, b, max) => { const d = angDiff(b, a); return a + clamp(d, -max, max); };

// the kits' per-fighter state (js/fight-kits.js), all plain numbers: thr ('special' while Pyth's coil holds someone),
// gd0 (how far off the coil caught them), under (Gopher underground), lockT (Ferris's Ownership: their special locked
// this long), bat (Bugdroid's battery charges), iso (Docky's Isolation unspent), unhit, healed and lastHp (Gopher's
// Garbage Collector), field, fieldT and fieldCd (standing in a Boot Loop, for how long, the rest after a stun), seg
// (Swifty's dive in her chain), tick (Merge Conflict's next spin), floatH (antigravity's height)
const kitFields = s => ({ thr: '', gd0: 0, under: 0, lockT: 0, bat: s.battery ? s.battery.max : 0, iso: s.isolation ? 1 : 0, unhit: 0, healed: 0, lastHp: s.hp,
  field: 0, fieldT: 0, fieldCd: 0, seg: 0, tick: 0, floatH: 0 });
// a round's fresh fighter state (the API the drawer reads: stam, gassed, guardArc, stepCd, counter, flankT/flankSide, down)
const roundFields = s => ({ z: 0, vx: 0, vy: 0, vz: 0, hp: s.hp, guardHp: 1, wallT: 9,
  state: 'idle', move: null, t: 0, dur: 0, mt: 0, charge: 0, pose: '', flash: 0, inv: 0, slip: 0, ice: 0, heatCd: 0, padCd: 0, jit: 0,
  jitT: 9, spCd: 0, hit: false, conf: false, hold: -1, frozenT: 0,
  stun: 0, combo: 0, recent: [],
  stam: 1, stamT: 9, gassed: 0, guardArc: s.guardArc || R.guardArc, stepCd: 0, stepA: 0, stepRel: 9, stepV: 0, slideT: 0,
  counter: 0, flankT: 0, flankSide: '', down: false,
  bufK: '', bufT: 0, bufA: 0, rel: true, stepAtk: false, cancel: false,
  // three-move fighters (docs/fight-api-tux-duke.md): the move's phase and its time, each move's cooldown, the move's
  // count (ms: a world object tied to one go of a move dies when it's cut short), Duke gone between portals, Tux up out
  // of shot, the toboggan's wall bounces; frozen: the knockback stored till the thaw (fzx, fzy, fzkd, x fzMul, by fzBy)
  ph: '', pht: 0, cd: [0, 0, 0, 0], ev: s.moves.evade ? s.moves.evade.charges || 0 : 0, evT: 0, bx: 0, by: 0, ms: 0, gone: 0, air: 0, bnc: 0, fzx: 0, fzy: 0, fzkd: 0, fzMul: 0.5, fzBy: -1,
  ...kitFields(s), ...s.fields });

// a mulberry32 stream whose state is a plain number in st[k] (same generator as core.js mulberry)
function rnext(st, k) {
  const s = st[k] = st[k] + 0x6D2B79F5 | 0;
  let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

export class Fight {
  constructor(cfg = {}) {
    this.cfg = cfg = { ids: ['tux', 'duke'], bots: [null, 1], seed: 1, supers: true, bestOf: 3, roundTime: 60, ...cfg };
    cfg.arena = arenaOf(cfg.arena).id;
    Object.defineProperty(this, 'A', { value: ARENAS[cfg.arena], enumerable: false });   // the arena (static data, js/fight-arenas.js)
    const m = mulberry(cfg.seed | 0);
    this.rs = [m() * 4294967296 | 0, m() * 4294967296 | 0, m() * 4294967296 | 0];   // rng states: bot 0, bot 1, the fight
    Object.defineProperty(this, 'rngs', { value: [0, 1, 2].map(k => () => rnext(this.rs, k)), enumerable: false });
    this.f = cfg.ids.map((id, i) => this.mkFighter(id, i));
    this.objs = []; this.events = []; this.oid = 0;   // oid: each world object's id (obj.id), for an online view to follow it
    this.inp = [blank(), blank()]; this.prev = [blank(), blank()];
    this.ai = [{}, {}];                // the bots' memory (plain data, fight-ai.js)
    this.round = 1; this.wins = [0, 0];
    this.time = 0; this.hitstop = 0; this.acc = 0;
    this.roundWinner = null; this.winner = null;
    this.rounds = [];                  // history: { round, winner, how: 'ko'|'double', time (s of fighting) }
    this.resetRound();
  }

  mkFighter(id, i) {
    const s = FIGHTERS[id];
    if (!s) throw new Error(`no fighter ${id}`);
    return { id, i, x: 0, y: 0, face: 0, maxHp: s.hp, meter: 0, wins: 0, walkDist: 0, r: s.radius, stats: s, ...roundFields(s) };
  }

  resetRound() {
    for (const f of this.f) {
      const [x, y] = this.A.spawns[f.i], [ox, oy] = this.A.spawns[1 - f.i];
      Object.assign(f, { x, y, face: Math.atan2(oy - y, ox - x), ...roundFields(f.stats) }); f.hp = f.maxHp;
      if (!this.cfg.supers) f.meter = 0;
    }
    this.objs.length = 0;
    const B = arenaBox(this.A);
    this.rim = Math.max(-B.x0, B.x1, -B.y0, B.y1);   // (constant: the arena's half size, for old readers)
    this.clock = this.cfg.roundTime; this.rt = 0; this.dmgMul = 1;
    this.phase = 'intro'; this.pt = 0; this.roundWinner = null;
  }

  setInput(i, inp) { const d = this.inp[i]; d.x = clamp(+inp.x || 0, -1, 1); d.y = clamp(+inp.y || 0, -1, 1); d.light = !!inp.light; d.heavy = !!inp.heavy; d.special = !!inp.special; d.guard = !!inp.guard; }

  update(dt) {
    this.events.length = 0;
    this.acc += clamp(dt || 0, 0, 0.25);
    while (this.acc >= FIXED) { this.acc -= FIXED; this.step(); }
  }

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

  // the input buffer: a fresh press of light, heavy or special, or of guard with a direction held (a step), is
  // remembered for RULES.buffer; the newest wins
  presses(f, live) {
    if (!live) { f.bufK = ''; f.bufT = 0; return; }
    const inp = this.inp[f.i], pv = this.prev[f.i], pr = k => inp[k] && !pv[k];
    const mag = Math.hypot(inp.x, inp.y);
    if (pr('guard') && f.stats.kit3) { f.bufK = 'evade'; f.bufT = R.buffer; }   // (Tux and Duke: guard is their evade)
    else if (pr('guard') && mag > 0.5) { f.bufK = 'step'; f.bufT = R.buffer; f.bufA = Math.atan2(inp.y, inp.x); }
    for (const k of ['light', 'heavy', 'special']) if (pr(k)) { f.bufK = k; f.bufT = R.buffer; }
  }

  phaseStep(dt) {
    this.pt += dt;
    if (this.phase === 'intro') {
      if (this.pt >= INTRO) { this.phase = 'fight'; this.pt = 0; this.ev('round', 0, 0, 0, null, { round: this.round }); }
    } else if (this.phase === 'fight') {
      this.rt += dt; this.clock = Math.max(0, this.clock - dt);
      if (this.clock <= 0) { this.phase = 'sudden'; this.pt = 0; this.ev('sudden', 0, 0, 0, null); }
    } else if (this.phase === 'sudden') {
      // every hit's damage grows (dmgMul, plain data: the HUD can show it)
      this.rt += dt; this.dmgMul = SD_MUL[0] + (SD_MUL[1] - SD_MUL[0]) * Math.min(1, this.pt / SD_RAMP);
    } else if (this.phase === 'roundEnd') {
      const w = this.roundWinner != null ? this.f[this.roundWinner] : null;
      if (w && w.z <= 0 && !['ko', 'win', 'grabbed', 'down', 'getup'].includes(w.state)) this.go(w, 'win');
      if (this.pt >= ROUND_END) {
        const need = Math.ceil(this.cfg.bestOf / 2), best = this.wins[0] === this.wins[1] ? null : this.wins[0] > this.wins[1] ? 0 : 1;
        if (best != null && (this.wins[best] >= need || this.round >= this.cfg.bestOf * 3)) {
          this.phase = 'over'; this.pt = 0; this.winner = best;
          const f = this.f[best]; this.go(f, 'win'); f.move = null; f.pose = ''; f.down = false; f.z = 0;
          this.ev('win', f.x, f.y, 1, best);
        } else { this.round++; this.resetRound(); }
      }
    }
  }

  checkEnd() {
    const lost = this.f.filter(f => f.state === 'ko');
    if (!lost.length) return;
    const how = lost.length > 1 ? 'double' : 'ko';
    this.roundWinner = lost.length > 1 ? null : 1 - lost[0].i;
    if (this.roundWinner != null) { this.wins[this.roundWinner]++; this.f[this.roundWinner].wins = this.wins[this.roundWinner]; }
    this.rounds.push({ round: this.round, winner: this.roundWinner, how, time: this.rt });
    this.phase = 'roundEnd'; this.pt = 0;
  }

  go(f, state, dur = 0) { f.state = state; f.t = 0; f.dur = dur; }

  // stamina: spend some (empty: gassed for RULES.gasT, event 'gassed')
  spend(f, c) {
    if (!(c > 0) || f.stats.kit3) return;   // (Tux and Duke: no stamina since 2026-10-23, their cooldowns are the resource)
    f.stam -= c; f.stamT = 0;
    if (f.stam <= 0) { f.stam = 0; if (f.gassed <= 0) { f.gassed = R.gasT; this.ev('gassed', f.x, f.y, 0.6, f.i); } }
  }

  startup(f, mv) {
    let s = mv.startup * (f.stats.jit ? 1 - 0.1 * f.jit : 1);
    if (f.gassed > 0) s *= R.gasStartup;
    if (f.cancel) s *= R.cancelStartup;
    if (f.stepAtk) s += R.stepStartup;
    return s;
  }
  // where a move starting now faces: the held way if it's within RULES.aim of the foe, else straight at them
  aim(f, o) {
    const inp = this.inp[f.i], toFoe = Math.atan2(o.y - f.y, o.x - f.x);
    if (Math.hypot(inp.x, inp.y) > 0.3) { const a = Math.atan2(inp.y, inp.x); if (Math.abs(angDiff(a, toFoe)) <= R.aim) return a; }
    return toFoe;
  }
  // start move id (a light, the heavy, the special or the super): aimed, paid for, winding up. opt: { stepAtk, cancel }
  startMove(f, id, opt = {}) {
    const mv = f.stats.moves[id], o = this.f[1 - f.i];
    f.move = id; f.mt = 0; f.hit = false; f.conf = false; f.charge = 0; f.rel = true; f.ms++;
    f.stepAtk = !!opt.stepAtk; f.cancel = !!opt.cancel;
    f.face = this.aim(f, o);
    const kind = mv.kind;
    this.spend(f, mv.cost ?? R.cost[kind] ?? 0);
    this.go(f, 'wind', this.startup(f, mv));
    if (f.stats.kit3) {   // a three-move move: its tell begins (the kit's press), held or not; an evade goes at once
      f.rel = !this.inp[f.i][KEY_OF[id]]; f.ph = ''; f.bnc = 0;
      const K = KITS[mv.do]; if (K && K.press) K.press(this, f, o, mv, this.ctl(f));
      if (id === 'evade') this.strikeStart(f, o); else this.ev('tell', f.x, f.y, 0.5, f.i, { move: id });
    }
  }
  // the held input as the kits read it
  ctl(f) { const inp = this.inp[f.i]; return { inp, mag: Math.min(1, Math.hypot(inp.x, inp.y)), dirA: Math.atan2(inp.y, inp.x) }; }
  // the buffered action, if f can take it now: true if something started
  act(f, o) {
    const k = f.bufK, s = f.stats, M = s.moves;
    if (!k) return false;
    const take = () => { f.bufK = ''; f.bufT = 0; };
    if (k === 'step') {
      if (f.stepCd > 0) return false;   // (kept a moment: it may still come off cooldown in time)
      take(); this.stepStart(f, f.bufA); return true;
    }
    if (s.kit3) {   // three moves and the evade: the key's, once it's off cooldown (kept a moment: it may come off in time)
      const mk = k === 'evade' ? 'evade' : MOVE_OF[k], ix = CD_KEYS.indexOf(mk), mv = mk && M[mk];
      if (!mv) { take(); return false; }
      if (f.cd[ix] > 0) return false;
      if (f.lockT > 0 && mk !== 'evade') return false;   // (locked: Ferris's Ownership Lock: walking and the evade only)
      take();
      const K = KITS[mv.do]; if (K && K.can && !K.can(this, f, mv)) return false;
      this.startMove(f, mk); f.cd[ix] = mv.cooldown || 0;
      return true;
    }
    if (k === 'special') {
      take();
      if (f.lockT > 0) return false;   // (Ferris's Ownership locks it)
      if (this.cfg.supers && f.meter >= 1) { f.meter = 0; this.startMove(f, 'super'); this.ev('super', f.x, f.y, 1, f.i, { move: 'super' }); return true; }
      if (f.spCd <= 0 && (!s.battery || f.bat >= 1)) { if (s.battery) f.bat -= 1; this.startMove(f, 'special'); f.spCd = M.special.cooldown || 0; return true; }
      return false;
    }
    if (k === 'heavy') { take(); this.startMove(f, 'heavy'); f.rel = !this.inp[f.i].heavy; this.ev('charge', f.x, f.y, 0, f.i, { move: 'heavy' }); return true; }
    if (k === 'light') { take(); this.startMove(f, 'light1'); return true; }
    return false;
  }
  // a step: quick, that way, no invincibility (Pyth's Slither: further and sooner again). The way is kept relative to
  // the foe (f.stepRel), so a sideways step circles round them and a forward one goes at them; orbit false: a straight
  // line (a bounce pad). f.stepA is the way it's going right now (the drawer's lean)
  stepStart(f, a, dist = R.stepDist * (f.stats.step ? f.stats.step.dist : 1), dur = R.stepT, orbit = true) {
    const v = dist / dur, o = this.f[1 - f.i];
    f.stepA = a; f.stepV = v; f.stepRel = orbit && !o.air && !o.gone ? angDiff(a, Math.atan2(o.y - f.y, o.x - f.x)) : 9; f.stepCd = R.stepCd * (f.stats.step ? f.stats.step.cd : 1); f.move = null; f.charge = 0;
    f.vx = Math.cos(a) * v; f.vy = Math.sin(a) * v;
    this.spend(f, R.cost.step);
    this.go(f, 'step', dur); this.ev('step', f.x, f.y, 0.3, f.i, { a });
  }

  fighterStep(f, dt, live) {
    const s = f.stats, M = s.moves, o = this.f[1 - f.i], inp = live ? this.inp[f.i] : BLANK;
    f.t += dt; f.mt += dt;
    f.flash = Math.max(0, f.flash - dt); f.inv = Math.max(0, f.inv - dt);
    f.spCd = Math.max(0, f.spCd - dt); f.stepCd = Math.max(0, f.stepCd - dt); f.slideT = Math.max(0, f.slideT - dt);
    f.counter = Math.max(0, f.counter - dt); f.flankT = Math.max(0, f.flankT - dt);
    f.pht += dt;
    for (let k = 0; k < 4; k++) if (f.cd[k] > 0 && f.move !== CD_KEYS[k]) f.cd[k] = Math.max(0, f.cd[k] - dt);   // (a cooldown runs once the move's over)
    if (f.bufT > 0) { f.bufT -= dt; if (f.bufT <= 1e-9) { f.bufT = 0; f.bufK = ''; } }
    f.jitT += dt; if (f.jitT > 1) f.jit = 0;
    this.stamina(f, dt);
    this.passives(f, s, dt, live);
    if (!KNOCKED.has(f.state) && f.state !== 'grabbed' && f.state !== 'frozen') f.combo = 0;   // (back on their feet: the next hit starts a new combo)
    f.slip = 0; f.ice = 0; f.heatCd = Math.max(0, (f.heatCd || 0) - dt); f.padCd = Math.max(0, (f.padCd || 0) - dt);
    f.field = 0;
    if (f.z <= 0) for (const p of this.objs) {
      if ((p.kind === 'puddle' || p.slick) && Math.hypot(f.x - p.x, f.y - p.y) < p.r + f.r * 0.4) f.slip = 1;   // (slick: a plug-in's own puddle, Octo's ink)
      else if (p.kind === 'ice' && Math.hypot(f.x - p.x, f.y - p.y) < p.r) f.ice = f.ice ? Math.min(f.ice, p.grip) : p.grip;   // (Tux's ice patch)
      else if (p.kind === 'field' && p.owner !== f.i && Math.hypot(f.x - p.x, f.y - p.y) < p.r) f.field = 1;
    }
    if (f.z <= 0 && !f.gone && this.A.hazards.length && live) this.hazards(f, dt);
    const mag = Math.min(1, Math.hypot(inp.x, inp.y)), dirA = Math.atan2(inp.y, inp.x);
    const toFoe = Math.atan2(o.y - f.y, o.x - f.x);
    let decay = s.kbDecay, glide = false;   // glide: the state sets its own velocity (no ground friction)

    switch (f.state) {
      case 'idle': case 'walk': case 'block':
        if (f.state === 'block' && f.stun > 0) { f.stun = Math.max(0, f.stun - dt); break; }   // held in the guard by a blocked hit
        break;
      case 'step': {
        glide = true;
        if (f.stepRel !== 9 && !o.air && !o.gone) {   // (round them; not round someone up out of shot or between portals: a straight line)
          f.stepA = toFoe + f.stepRel; f.vx = Math.cos(f.stepA) * f.stepV; f.vy = Math.sin(f.stepA) * f.stepV; }
        // a forward step: a light or heavy now lunges (more reach, a little more startup)
        const fwd = !s.kit3 && Math.abs(angDiff(f.stepA, toFoe)) < R.aim;   // (the three-move fighters have no step attacks)
        if (fwd && (f.bufK === 'light' || f.bufK === 'heavy')) {
          const k = f.bufK; f.bufK = ''; f.bufT = 0;
          f.vx *= 0.6; f.vy *= 0.6;
          this.startMove(f, k === 'light' ? 'light1' : 'heavy', { stepAtk: true });
          if (k === 'heavy') this.ev('charge', f.x, f.y, 0, f.i, { move: 'heavy' });
          glide = false; break;
        }
        if (f.t >= f.dur) {
          const sl = s.stepSlide || 0;   // (Tux: slides on after a step)
          f.vx *= sl ? 0.7 : 0.15; f.vy *= sl ? 0.7 : 0.15; f.slideT = sl;
          this.go(f, 'idle'); glide = false;
        }
        break;
      }
      case 'wind': {
        if (s.kit3) {   // a three-move move's tell: the kit's wind (aiming, the ring growing), held past its startup if it holds
          const mv = M[f.move], K = KITS[mv.do], c = { inp, mag, dirA };
          if (!inp[KEY_OF[f.move]]) f.rel = true;
          if (K && K.wind) K.wind(this, f, o, mv, dt, c);
          if (f.state === 'wind' && f.t >= f.dur && !(K && K.hold && K.hold(this, f, o, mv, c))) this.strikeStart(f, o);
          break;
        }
        if (f.move === 'heavy') {
          if (!inp.heavy) f.rel = true;
          if (f.t >= f.dur) {
            // still held at the end of its startup (and not a step's or a cancel's quick heavy): it charges
            if (!f.rel && M.heavy.maxCharge && !f.stepAtk && !f.cancel) { this.go(f, 'charge'); f.charge = 0; }
            else this.strikeStart(f, o);
          }
        } else if (f.t >= f.dur) this.strikeStart(f, o);
        break;
      }
      case 'charge': {
        const mv = M.heavy, was = f.charge;
        f.charge = Math.min(1, f.t / mv.maxCharge);
        if (was < 1 && f.charge >= 1) this.ev('charge', f.x, f.y, 1, f.i, { move: 'heavy' });
        f.face = turnTo(f.face, toFoe, R.chargeTurn * dt);
        if (!inp.heavy || f.charge >= 1) { this.spend(f, R.cost.charge * f.charge); this.strikeStart(f, o); }
        break;
      }
      case 'strike': {
        if (this.confirm(f)) break;
        glide = this.strikeMoves(f);
        this.strikeStep(f, o, dt, inp, mag, dirA);
        if (f.state === 'strike' && f.t >= f.dur) this.strikeEnd(f, o);
        break;
      }
      case 'recover': {
        if (this.confirm(f)) break;
        if (chains(f) && f.bufK === 'light') { f.bufK = ''; f.bufT = 0; this.startMove(f, 'light' + (+f.move.slice(5) + 1)); break; }
        if (f.t >= f.dur) { this.go(f, 'idle'); f.move = null; f.charge = 0; f.ph = ''; }
        break;
      }
      case 'grab': {
        // Pyth's coil holding them: drawn in from where it caught them, squeezed, then tossed the held way (or on)
        const mv = M.special, g = this.f[f.hold];
        if (!g || g.state !== 'grabbed') { this.release(f); this.go(f, 'recover', 0.25); f.move = 'special'; break; }
        const snug = f.r + g.r + 2, gd = snug + Math.max(0, f.gd0 - snug) * Math.max(0, 1 - f.t / 0.22);
        g.x = f.x + Math.cos(f.face) * gd; g.y = f.y + Math.sin(f.face) * gd; g.vx = g.vy = 0; g.z = 0; this.keepIn(g);
        if (f.t >= mv.hold) {
          const a = mag > 0.3 ? dirA : f.face;
          f.face = a; g.x = f.x + Math.cos(a) * gd; g.y = f.y + Math.sin(a) * gd; this.keepIn(g);
          f.hold = -1; g.hold = -1; this.go(g, 'idle');
          this.hitF(f, g, mv, { dir: a, unblockable: true, hold: true, kd: true, move: 'special', noFlank: true });
          f.move = 'special'; f.thr = ''; this.go(f, 'recover', 0.25);
        }
        break;
      }
      case 'grabbed': break;
      case 'hurt': case 'stagger': if (f.t >= f.dur) this.go(f, 'idle'); break;
      case 'down': if (f.t >= f.dur) { this.go(f, 'getup', R.getupT); f.inv = R.getupT; f.vx *= 0.2; f.vy *= 0.2; this.ev('getup', f.x, f.y, 0.3, f.i); } break;
      case 'getup': f.inv = Math.max(f.inv, dt); if (f.t >= f.dur) { this.go(f, 'idle'); f.inv = 0; } break;
      case 'float': {   // Pyth's antigravity: drifting up to floatH and hanging there, helpless; then gently down
        const end = f.t >= f.dur - 0.2;
        f.z += ((end ? 0 : f.floatH + Math.sin(f.t * 5) * 2) - f.z) * Math.min(1, 6 * dt);
        if (f.t >= f.dur) { f.z = 0; this.go(f, 'hurt', 0.12); }
        break;
      }
      case 'dizzy': if (f.t >= f.dur) this.go(f, 'idle'); break;
      case 'frozen': f.vx = f.vy = 0; if (f.t >= f.dur) this.thaw(f); break;
      case 'ko': break;
      case 'win': break;
    }
    f.down = f.state === 'down';
    if (!f.move) { f.ph = ''; f.gone = 0; f.air = 0; }   // (out of a move, however it ended)
    // off the floor only while a move lifts you (a hop, a dive) or antigravity holds you: cut short, you drop back down
    if (f.z > 0 && f.state !== 'strike' && f.state !== 'float') f.z = Math.max(0, f.z - 400 * dt);

    // free: the buffered action, else a block while guard is held, else walking
    let walking = false;
    if (FREE.has(f.state) && !(f.state === 'block' && f.stun > 0)) {
      if (!(live && this.act(f, o))) {
        if (live && inp.guard && !s.kit3) { if (f.state !== 'block') this.go(f, 'block'); }
        else if (f.state === 'block') this.go(f, 'idle');
        walking = true;
      }
    }

    // facing: toward the foe when free (slowly while blocking), and while stepping
    if (f.state === 'idle' || f.state === 'walk' || f.state === 'step') f.face = turnTo(f.face, toFoe, TURN * dt);
    else if (f.state === 'block') f.face = turnTo(f.face, toFoe, R.guardTurn * dt);

    // ground movement: walking is near-instant (accel/friction ~30/s), slower backing away, blocking, gassed
    const slipF = Math.min(f.slip ? s.slipMul : 1, f.ice || 1);
    if (walking && FREE.has(f.state)) {
      let sp = WALK * s.walk * (f.field ? 0.6 : 1) * (f.gassed > 0 ? R.gasWalk : 1) * (f.state === 'block' ? R.guardWalk : 1);
      if (mag > 0.1 && !o.air && !o.gone) sp *= 1 - (1 - R.backWalk) * Math.max(0, -Math.cos(angDiff(dirA, toFoe)));
      const tx = mag > 0.1 ? Math.cos(dirA) * sp * mag : 0, ty = mag > 0.1 ? Math.sin(dirA) * sp * mag : 0;
      const grip = f.slideT > 0 ? (s.slide || 3) : mag > 0.1 ? s.accel * (f.slip || f.ice ? 0.4 * slipF + 0.1 : 1) : s.friction * slipF;
      const k = Math.min(1, grip * dt);
      f.vx += (tx - f.vx) * k; f.vy += (ty - f.vy) * k;
      if (f.state !== 'block') { const ns = mag > 0.1 ? 'walk' : 'idle'; if (f.state !== ns) this.go(f, ns); }
    } else if (!glide && f.state !== 'frozen' && f.state !== 'grabbed') {
      const k = Math.exp(-(f.state === 'strike' || f.state === 'wind' || f.state === 'recover' || f.state === 'charge' ? s.friction * 0.35 : decay) * slipF * dt); f.vx *= k; f.vy *= k;
    }
    if (f.state === 'frozen' || f.state === 'grabbed') return;
    f.x += f.vx * dt; f.y += f.vy * dt;
    if (f.state === 'walk' || f.state === 'idle' || f.state === 'block' || f.state === 'step') f.walkDist += Math.hypot(f.vx, f.vy) * dt;   // for the drawer's walk cycle
    this.walls(f, true);
  }

  // stamina back after a moment without spending (slower while blocking); gassed: back to gasTo over gasT
  stamina(f, dt) {
    f.stamT += dt;
    if (f.gassed > 0) {
      f.gassed = Math.max(0, f.gassed - dt);
      f.stam = Math.min(1, f.stam + R.gasTo / R.gasT * dt);
      if (f.gassed <= 0) f.stam = Math.max(f.stam, R.gasTo);
    } else if (f.stamT >= R.stamWait && f.stam < 1) f.stam = Math.min(1, f.stam + R.stamRegen * (f.state === 'block' ? R.blockRegen : 1) * (f.stats.stamRegen || 1) * dt);
  }

  // a light that landed clean cancels into the heavy or the special (pressed, or buffered); true if it did
  confirm(f) {
    if (!f.conf || !/^light/.test(f.move || '') || (f.bufK !== 'heavy' && f.bufK !== 'special')) return false;
    const k = f.bufK, s = f.stats;
    if (k === 'special') {
      if (f.lockT > 0) return false;
      const sup = this.cfg.supers && f.meter >= 1;
      if (!sup && (f.spCd > 0 || (s.battery && f.bat < 1))) return false;
      f.bufK = ''; f.bufT = 0;
      if (sup) { f.meter = 0; this.startMove(f, 'super', { cancel: true }); this.ev('super', f.x, f.y, 1, f.i, { move: 'super' }); return true; }
      if (s.battery) f.bat -= 1;
      this.startMove(f, 'special', { cancel: true }); f.spCd = s.moves.special.cooldown || 0;
      return true;
    }
    f.bufK = ''; f.bufT = 0;
    this.startMove(f, 'heavy', { cancel: true }); this.ev('charge', f.x, f.y, 0, f.i, { move: 'heavy' });
    return true;
  }

  release(f) {   // let go of whoever f holds (or is held by: Pyth's coil)
    if (f.hold >= 0) { const o = this.f[f.hold]; o.hold = -1; if (o.state === 'grabbed' || o.state === 'grab') { this.go(o, 'idle'); o.move = null; o.thr = ''; } f.hold = -1; f.thr = ''; }
  }

  // the passives and the kits' timers, every step: Ownership's lock, the Boot Loop's rest, Bugdroid's battery charging,
  // Gopher's Garbage Collector (after regen.wait s unhit, regen.rate a second, at most regen.cap a round)
  passives(f, s, dt, live) {
    f.under = 0;   // (Gopher's Dig sets it again every step he's underground)
    if (f.lockT > 0) f.lockT = Math.max(0, f.lockT - dt);
    if (f.fieldCd > 0) f.fieldCd = Math.max(0, f.fieldCd - dt);
    if (s.battery && f.bat < s.battery.max) f.bat = Math.min(s.battery.max, f.bat + dt / s.battery.recharge);
    if (s.tick) s.tick(this, f, dt, live);   // (a plug-in fighter's own timers: js/kits/<id>.js)
    const E = s.moves.evade;
    if (E && E.charges && f.ev < E.charges) {   // (Duke's Garbage Collect: a charge back recharge s after it's spent, one at a time)
      f.evT -= dt;
      if (f.evT <= 0) { f.ev++; f.evT = f.ev < E.charges ? E.recharge : 0; }
    }
    if (s.regen) {
      if (f.hp < f.lastHp - 1e-9) f.unhit = 0; else f.unhit += dt;
      const G = s.regen;
      if (live && f.unhit >= G.wait && f.hp > 0 && f.hp < f.maxHp && f.healed < G.cap && f.state !== 'ko') { const h = Math.min(G.rate * dt, G.cap - f.healed, f.maxHp - f.hp); f.hp += h; f.healed += h; }
      f.lastHp = f.hp;
    }
  }

  // the arena's floor hazards under a grounded fighter (fight-arenas.js): ice (f.ice: its grip), a heat vent burning
  // (it knocks you down), a bounce pad (a boost: a long step the way you were going), a conveyor belt
  hazards(f, dt) {
    for (const h of this.A.hazards) {
      if (!within(h, f.x, f.y, h.kind === 'heat' ? -f.r * 0.5 : 0)) continue;
      if (h.kind === 'ice') f.ice = f.ice ? Math.min(f.ice, h.grip) : h.grip;
      else if (h.kind === 'belt') { if (f.state !== 'grabbed' && f.state !== 'frozen') { f.x += h.vx * dt; f.y += h.vy * dt; } }
      else if (h.kind === 'heat') {
        if (heatState(h, this.rt) !== 2 || f.heatCd > 0 || f.state === 'ko' || f.state === 'grabbed' || f.inv > 0 || f.state === 'down') continue;
        f.heatCd = h.on + 0.2; this.release(f); f.move = null; f.charge = 0; f.flash = 0.2;
        f.hp = Math.max(0, f.hp - h.dmg * f.maxHp * this.dmgMul);   // (a share of their health: as hard on the light as on the heavy)
        const a = Math.atan2(f.y - (h.y || 0), f.x - (h.x || 0)) || 0;
        this.ev('burn', f.x, f.y, 0.7, f.i);
        if (f.hp <= 0) { f.vx = Math.cos(a) * h.kb * 0.5; f.vy = Math.sin(a) * h.kb * 0.5; this.go(f, 'ko'); this.ev('ko', f.x, f.y, 1, f.i); }
        else this.knockDown(f, a, h.kb * 0.6, -1);
      } else if (h.kind === 'pad') {
        if (f.padCd > 0 || !['idle', 'walk', 'hurt', 'stagger', 'step', 'recover', 'dizzy'].includes(f.state)) continue;
        f.padCd = 0.6; f.move = null;
        const sp = Math.hypot(f.vx, f.vy), a = sp > 20 ? Math.atan2(f.vy, f.vx) : f.face;
        this.stepStart(f, a, (sp * 0.5 + h.push) * 0.3, 0.3, false); f.stam = Math.min(1, f.stam + R.cost.step);   // (a free one)
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
      if (bounce && f.state === 'strike') { const K = kitOf(f); if (K && K.wall && K.wall(this, f, c)) continue; }   // (a slide or a dive head first into a wall: it stops there)
      if (bounce && KNOCKED.has(f.state) && -vn > WALL_V && f.wallT > 0.2) {
        const p = clamp((-vn - WALL_V) / 500, 0, 1);
        f.vx -= (1 + WALL_E) * vn * c.nx; f.vy -= (1 + WALL_E) * vn * c.ny; f.wallT = 0;
        this.ev('wall', f.x - c.nx * f.r, f.y - c.ny * f.r, 0.3 + 0.7 * p, f.i, { nx: c.nx, ny: c.ny });
        if (f.state !== 'ko') {
          f.hp = Math.max(0, f.hp - WALL_DMG * f.maxHp * (0.35 + 0.65 * p) * this.dmgMul); f.flash = 0.15;
          this.hitstop = Math.max(this.hitstop, Math.round(3 + 3 * p) / 60);
          if (f.hp <= 0) { this.release(f); f.move = null; this.go(f, 'ko'); this.ev('ko', f.x, f.y, 1, f.i); }
          else if (f.state !== 'down' && f.state !== 'float') { f.vx *= 0.6; f.vy *= 0.6; this.knockDown(f, null, 0, 1 - f.i); }   // (slammed: down it goes)
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

  // knock f down: sliding the way a (null: as it's going) at kb, down for downT then getting up; by: who did it (-1: the map)
  knockDown(f, a, kb, by) {
    this.release(f); f.move = null; f.charge = 0; f.stun = 0; f.z = 0;
    if (a != null) { f.vx = Math.cos(a) * kb; f.vy = Math.sin(a) * kb; }
    this.go(f, 'down', R.downT * (f.stats.stunMul || 1)); f.down = true; f.combo = 0;
    this.ev('down', f.x, f.y, clamp(0.4 + kb / 600, 0, 1), f.i, { by });
  }

  strikeMoves(f) { if (f.move === 'heavy') return true; const K = kitOf(f); return !!(K && K.moves); }
  // the arena's contacts (fight-arenas.js contacts) and the containers that are down (Docky's: solids while they last;
  // a plug-in's world object with solid: 1 and a box or circle shape counts too)
  contactsAll(x, y, r) {
    const out = contacts(this.A, x, y, r);
    for (const o of this.objs) if ((o.kind === 'crate' || o.solid) && o.z <= 0) { const [e, hx, hy] = sd(o, x, y); if (e < r) out.push({ pen: r - e, nx: hx, ny: hy, solid: o }); }
    return out;
  }

  strikeStart(f, o) {
    const mv = f.stats.moves[f.move];
    this.go(f, 'strike', mv.active);
    f.hit = false;
    const K = mv.do && KITS[mv.do];   // a special's or super's own doing (fight-kits.js)
    if (K && K.start) K.start(this, f, o, mv);
  }

  strikeStep(f, o, dt, inp, mag, dirA) {
    const s = f.stats, mv = s.moves[f.move];
    if (/^light/.test(f.move)) { this.melee(f, o, mv); return; }
    switch (f.move) {
      case 'heavy': {   // a lunge
        const v = mv.lunge * (1 + 0.3 * f.charge); f.vx = Math.cos(f.face) * v; f.vy = Math.sin(f.face) * v;
        const m = this.moveMul(f); this.melee(f, o, mv, m.dmg, m.kb, { kd: f.charge >= 1 });
        return;
      }
      default: {
        const K = mv.do && KITS[mv.do];
        if (K && K.step) K.step(this, f, o, mv, dt, { inp, mag, dirA });
      }
    }
  }

  strikeEnd(f, o) {
    const mv = f.stats.moves[f.move], K = mv.do && KITS[mv.do];
    if (K && K.end && K.end(this, f, o, mv)) return;
    if (!f.hit && (mv.contact || mv.whiff)) this.whiff(f);
    this.go(f, 'recover', mv.recovery);
  }
  // a move that met nothing: missing tires you
  whiff(f, move = f.move) { this.spend(f, R.cost.whiff); this.ev('whiff', f.x, f.y, 0.2, f.i, { move }); }

  // f's current move's multipliers: a heavy's charge
  moveMul(f) {
    const mv = f.move && f.stats.moves[f.move];
    if (f.move === 'heavy' && mv) return { dmg: 1 + mv.chargeDmg * f.charge, kb: 1 + mv.chargeKb * f.charge };
    return { dmg: 1, kb: 1 };
  }
  melee(f, o, mv, dmgMul = 1, kbMul = 1, extra) {
    if (f.hit) return;
    if (this.meleeFoe(f, o, mv, dmgMul, kbMul, extra)) return;
    if (this.objs.length && shoveCrate(this, f, mv, f.move === 'heavy' ? 1.3 : 1)) f.hit = true;   // (missed them: a container in reach slides off)
  }
  meleeFoe(f, o, mv, dmgMul, kbMul, extra) {
    if (o.z > 20 && o.state !== 'float') return false;   // (afloat on antigravity: still in reach)
    if (!this.reaches(f, o, mv, 0)) return false;
    if (this.hitF(f, o, mv, { dmgMul, kbMul, ...extra })) { f.hit = true; return true; }
    return false;
  }

  // can f's move mv reach t right now (a step attack reaches further)
  reaches(f, t, mv, pad = 4) {
    const d = Math.hypot(t.x - f.x, t.y - f.y), a = Math.atan2(t.y - f.y, t.x - f.x);
    return d - f.r - t.r <= (mv.reach || 0) + (f.stepAtk ? R.stepReach : 0) + pad && Math.abs(angDiff(a, f.face)) <= (mv.arc || 360) * D2R / 2 + Math.atan2(t.r, Math.max(d, 1));
  }
  // a hit from a onto d with move mv. Returns true if it connected (blocked, soaked and traded count), false if it went
  // through nothing. opt: { dir (the push's way), from (the way the hit comes from, seen from d: default a's position,
  // or back along dir for a thing in the world), dmgMul, kbMul, move (the move's key, when a isn't doing it right now),
  // obj (a thrown thing, a shockwave, a kit's pop: never trades), unblockable, hold (Pyth's coil tossing them), kd
  // (knocks down), noFlank, trade (this is one half of a trade) }
  hitF(a, d, mv, opt = {}) {
    this.lastRes = '';   // (what it came to: 'hit', 'block', 'armor', 'catch', 'clink' (Tux's ice), 'soak' (his penguin); '' nothing)
    if (d.stats.guard) { const r = d.stats.guard(this, a, d, mv, opt); if (r !== undefined) return r; }   // (a plug-in fighter's own say first: js/kits/<id>.js)
    // Tux's Ice Block: it clinks off (a hit all the same for the one who threw it: a slide stops, a smash misses) and the
    // block shatters, its shards staggering the hitter if close (fight-kits.js iceblock.clinked)
    if (d.ph === 'iceblock' && d.state === 'strike' && d.move === 'evade') {
      this.lastRes = 'clink'; this.ev('clink', d.x, d.y, 0.6, a.i, { move: opt.move || a.move, to: d.i }); this.hitstop = Math.max(this.hitstop, 3 / 60);
      const K = KITS[d.stats.moves.evade.do]; if (K && K.clinked) K.clinked(this, a, d, opt);
      return true;
    }
    // his fork() penguins shield him: a hit at him (not from above or below) through one pops it instead
    if (!opt.unblockable && !opt.hold && d.stats.kit3 && this.objs.length && a !== d) {
      const ox = opt.obj ? d.x - Math.cos(opt.dir ?? 0) * 60 : a.x, oy = opt.obj ? d.y - Math.sin(opt.dir ?? 0) * 60 : a.y;
      for (const p of this.objs) {
        if (p.kind !== 'peng' || p.owner !== d.i || p.ph === 'wait' || p.t >= p.life) continue;
        const ex = d.x - ox, ey = d.y - oy, L = ex * ex + ey * ey || 1, u = ((p.x - ox) * ex + (p.y - oy) * ey) / L;
        if (u <= 0 || u >= 1 || Math.hypot(p.x - ox - ex * u, p.y - oy - ey * u) > p.r + 4) continue;
        p.life = p.t; p.ph = 'burst'; this.ev('peng', p.x, p.y, 0.5, d.i, { move: 'move3', how: 'soak' });
        this.lastRes = 'soak'; this.hitstop = Math.max(this.hitstop, 3 / 60);
        return true;
      }
    }
    if ((d.inv > 0 && !opt.hold) || d.state === 'ko' || d.state === 'down' || d.state === 'getup' || (d.state === 'grabbed' && !opt.hold)) return false;
    const ang = opt.dir ?? Math.atan2(d.y - a.y, d.x - a.x), key = opt.move || a.move;
    const from = opt.from ?? (opt.obj || opt.hold ? ang + Math.PI : Math.atan2(a.y - d.y, a.x - d.x));
    const direct = !opt.obj && !opt.hold && a.state === 'strike';
    const sup = this.cfg.supers, off = Math.abs(angDiff(from, d.face));
    // 0. Ferris holding his Borrow Checker, the hit from in front of him: blocked whole, and pinched back (fight-kits.js)
    if (!opt.hold && countering(d) && off <= (d.stats.moves.special.arc2 || 110) * D2R) { const r = KITS.counter.catch(this, a, d, mv, opt); this.lastRes = 'catch'; return r; }
    // 1. a trade: d's own contact move active and reaching a too: both land
    if (direct && !opt.trade && d.state === 'strike' && d.move && !d.hit) {
      const dm0 = d.stats.moves[d.move], dm = dm0 && (dm0.damage != null ? dm0 : dm0.hit);
      if (dm && dm0.contact && !dm0.hop && this.reaches(d, a, dm0)) {
        d.hit = true;
        this.ev('trade', (a.x + d.x) / 2, (a.y + d.y) / 2, 0.6, a.i, { move: key, to: d.i });
        const m2 = this.moveMul(d);
        this.hitF(d, a, dm, { trade: true, dmgMul: m2.dmg, kbMul: m2.kb * R.trade, move: d.move, kd: d.move === 'heavy' && d.charge >= 1 });
        opt = { ...opt, trade: true, kbMul: (opt.kbMul || 1) * R.trade };
      }
    }
    const stale = mv.stale === false ? 1 : Math.max(0.5, 1 - R.stale * a.recent.filter(k => k === key).length);
    let dmg = mv.damage * (opt.dmgMul || 1) * this.dmgMul * stale * (a.stats.dmgOut || 1) * (d.stats.dmgIn || 1), kb0 = mv.kb * (opt.kbMul || 1);   // (Cpp's Manual Memory)
    const landed = () => { if (mv.stale !== false) { a.recent.push(key); if (a.recent.length > R.staleN) a.recent.shift(); } };
    const ko = () => { this.release(d); d.move = null; d.charge = 0; this.go(d, 'ko'); this.ev('ko', d.x, d.y, 1, d.i); };
    const meter = k => {   // (only for a fighter who has a super)
      if (sup && a.stats.moves.super) a.meter = Math.min(1, a.meter + dmg * k * 0.008);
      if (sup && d.stats.moves.super) d.meter = Math.min(1, d.meter + dmg * k * 0.011);
    };
    // 2. armor in d's startup: takes the damage, doesn't flinch
    const ar = opt.hold ? null : armorOf(d, mv.prio ?? 1);
    if (ar) {
      d.hp = Math.max(0, d.hp - dmg); d.flash = 0.1; landed(); meter(1);
      this.ev('armor', d.x, d.y, clamp(dmg / 14, 0.2, 1), a.i, { move: key, to: d.i, armor: ar });
      this.hitstop = Math.max(this.hitstop, 4 / 60);
      if (d.hp <= 0) ko();
      this.lastRes = 'armor';
      return true;
    }
    // 3. a block, if the hit comes from inside the shield's arc: a little chip, a push back, stamina; empty, it staggers
    if (!opt.unblockable && d.state === 'block' && off <= d.guardArc) {
      const chip = dmg * R.chip;
      d.hp = Math.max(0, d.hp - chip);
      this.spend(d, R.blockStam * dmg * (d.stats.blockCost || 1));
      const push = kb0 * 0.35 / d.stats.weight; d.vx += Math.cos(ang) * push; d.vy += Math.sin(ang) * push;
      if (direct) {
        const pb = (mv.pushback || 0) / a.stats.weight; a.vx -= Math.cos(ang) * pb; a.vy -= Math.sin(ang) * pb;
        const K = kitOf(a);
        if (K && K.blocked && K.blocked(this, a, d, mv, ang)) a.hit = true;   // (a three-move move's own: the toboggan bounces off, the smash stumbles)
        else if (mv.contact) { a.hit = true; a.vx *= 0.3; a.vy *= 0.3; if (a.z > 0) a.z = 0; this.go(a, 'recover', mv.recovery); }   // (a blocked punch, lunge or slide stops there: its recovery starts)
      }
      const broke = d.stam <= 0;
      if (broke) { d.stun = 0; this.go(d, 'stagger', R.gasStagger); }   // (gassed: the guard's battered open)
      else d.stun = Math.max(d.stun, (mv.blockStun ?? 0.15) * Math.sqrt(opt.dmgMul || 1));
      meter(0.25);
      this.ev('block', d.x, d.y, clamp(kb0 / 900, 0, 1), a.i, { move: key, to: d.i, stagger: broke });
      this.hitstop = Math.max(this.hitstop, 3 / 60);
      if (d.hp <= 0) ko();
      this.lastRes = 'block';
      return true;
    }
    // 4. a clean hit: a counter hit (caught in their startup or charge) and a flank (from the side or behind) do more
    const ctr = !opt.hold && (d.state === 'wind' || d.state === 'charge') && !!d.move;
    const side = opt.noFlank || opt.hold || a.stats.kit3 || d.stats.kit3 || d.state === 'float' ? '' : off > R.backArc ? 'back' : off > R.sideArc ? 'side' : '';
    const bonus = Math.min(R.bonusCap, (ctr ? R.counter : 1) * (side === 'back' ? R.back : side === 'side' ? R.side : 1));
    dmg *= bonus;
    landed();
    const fresh = !KNOCKED.has(d.state); if (fresh) d.combo = 0;
    d.combo++;
    this.release(d);
    if (d.move === 'super' && d.state === 'wind') d.meter = 1;   // (a super hit out of its wind-up isn't spent)
    const wasFrozen = d.state === 'frozen', floating = d.state === 'float';
    if (d.iso) { d.iso = 0; dmg = 0; this.ev('iso', d.x, d.y, 0.7, a.i, { move: key, to: d.i }); }   // (Docky's Isolation: the round's first hit does no damage)
    else d.hp = Math.max(0, d.hp - dmg);
    let kb = kb0 * (1 + (bonus - 1) * 0.5) / d.stats.weight;
    if (wasFrozen) kb *= d.fzMul;   // (frozen: less knockback, so a freeze isn't a KO by itself)
    d.move = null; d.charge = 0; d.flash = 0.2; d.stun = 0; d.ph = '';
    this.lastRes = 'hit';
    if (a.move === key || opt.trade) a.conf = true;   // (a landed light can be cancelled now)
    const power = clamp(kb / 600, 0, 1);
    meter(1);
    if (a.stats.jit) { a.jit = Math.min(3, a.jit + 1); a.jitT = 0; }
    this.ev('hit', d.x, d.y, power, a.i, { move: key, to: d.i, counter: ctr, side, dmg });
    if (ctr) { d.counter = 0.5; this.ev('counter', d.x, d.y, 0.8, a.i, { move: key, to: d.i }); }
    if (side) { d.flankT = 0.5; d.flankSide = side; this.ev('flank', d.x, d.y, side === 'back' ? 0.9 : 0.6, a.i, { move: key, to: d.i, side }); }
    const finisher = /^light\d$/.test(key) && +key.slice(5) >= (a.stats.chain || 3);
    const kd = !floating && (opt.kd || mv.kd || kb >= R.downKb || (finisher && (ctr || !!side)));
    this.hitstop = Math.min(8, Math.round(3 + 3 * power + (ctr || kd ? 2 : 0) + (mv.kind === 'heavy' ? 1 : 0))) / 60;
    if (d.hp <= 0) { d.vx = Math.cos(ang) * kb; d.vy = Math.sin(ang) * kb; ko(); }
    else if (wasFrozen) { d.fzx += Math.cos(ang) * kb; d.fzy += Math.sin(ang) * kb; if (kd) { d.fzkd = 1; d.fzBy = a.i; } }   // (stopped in time: it all lands at the thaw)
    else if (floating) { d.vx = Math.cos(ang) * kb * 0.35; d.vy = Math.sin(ang) * kb * 0.35; }   // (afloat on antigravity: hits don't knock them down)
    else if (kd) this.knockDown(d, ang, kb, a.i);
    else {
      d.vx = Math.cos(ang) * kb; d.vy = Math.sin(ang) * kb;
      const stun = (mv.stun ?? (0.22 + kb / 1200)) * comboScale(d.combo) * (d.stats.stunMul || 1) * (ctr ? R.counterStun : 1) * (side === 'back' ? R.backStun : 1);
      this.go(d, 'hurt', stun);
    }
    return true;
  }

  collide() {
    const [a, b] = this.f;
    if (a.hold >= 0 || b.hold >= 0) return;
    if (a.z > 12 || b.z > 12 || a.under || b.under || a.gone || b.gone || a.ghost || b.ghost) return;   // (ghost: a plug-in's move passing through bodies, Cpp's Play Dead)
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, ov = a.r + b.r - d;
    if (ov <= 0) return;
    const wa = a.stats.weight, wb = b.stats.weight, ux = dx / d, uy = dy / d;
    const ka = wb / (wa + wb), kb = wa / (wa + wb);
    a.x -= ux * ov * ka; a.y -= uy * ov * ka; b.x += ux * ov * kb; b.y += uy * ov * kb;
    this.keepIn(a); this.keepIn(b);   // (a body push never puts you in a wall)
  }

  keepIn(f) {   // push a fighter out of the walls and solids, nothing more
    for (let it = 0; it < 3; it++) {
      const cs = this.contactsAll(f.x, f.y, f.r);
      if (!cs.length) return;
      let c = cs[0]; for (const k of cs) if (k.pen > c.pen) c = k;
      f.x += c.nx * c.pen; f.y += c.ny * c.pen;
    }
    this.inBounds(f);
  }
  // squeezed between a container and the wall (no way out of both): the wall wins, never outside the arena
  inBounds(f) {
    const [d, gx, gy] = sd(this.A.bounds, f.x, f.y);
    if (d + f.r > 0.25) { f.x -= gx * (d + f.r); f.y -= gy * (d + f.r); }
  }

  objStep(dt) {
    let dead = false;
    for (const ob of this.objs) {
      ob.t += dt;
      const own = this.f[ob.owner], foe = this.f[1 - ob.owner], M = own.stats.moves;
      if (OBJ[ob.kind]) OBJ[ob.kind](this, ob, dt, own, foe, M);   // (the kits' things: fight-kits.js)
      if (ob.t >= ob.life) { dead = true; if (ob.kind === 'gorou') this.ev('pop', ob.x, ob.y, 0.3, ob.owner, { move: 'super', gopher: ob.kind === 'gorou' ? 1 : undefined }); if (ob.kind === 'crate') this.ev('poof', ob.x, ob.y, 0.4, ob.owner, { move: ob.mk }); }
    }
    if (dead) this.objs = this.objs.filter(ob => ob.t < ob.life);
  }
}

const chains = f => /^light\d$/.test(f.move || '') && +f.move.slice(5) < (f.stats.chain || 3);   // (a light that the next press follows: Octo's go to 5)
export const comboScale = n => Math.max(R.comboMin, 1 - R.comboDecay * Math.max(0, n - 1));

// what the drawer shows for this fighter right now (also kept on fighter.pose): one of its 3D model's poses
// (art/model3d.js MODELS[id].poses), or the fight's own 'step' (a lean the step's way: f.stepA), 'down' (knocked flat)
// and 'getup'; a move's own `pose` while it strikes and early in its recovery (`wpose` for its wind-up)
// the three-move fighters' pose for each phase of a move (docs/fight-api-tux-duke.md), and the phases whose recovery
// stands back up halfway
export const PH_POSE = { crouch: 'crouch', slide: 'slide', skid: 'slide', belly: 'belly', leap: 'leap', up: 'air', high: 'air', drop: 'flop', land: 'land', dizzy: 'dizzy',
  summon: 'summon', fork: 'summon', spin: 'spin', gone: 'spin', out: 'smashup', smash: 'smash', stumble: 'stumble', raise: 'snap', snap: 'snap', stop: 'snap', throw: 'throw', toss: 'toss',
  iceblock: 'iceblock', crack: 'crack', shatter: 'burst', blinkout: 'blinkout', blinkin: 'blinkin' };
const PH_FADE = new Set(['fork', 'smash', 'stop', 'toss', 'blinkin']);
export function poseOf(f) {
  const { state, move, id } = f;
  switch (state) {
    case 'charge': return 'wind';
    case 'block': return 'block';
    case 'step': return 'step';
    case 'down': return 'down';
    case 'getup': return 'getup';
    case 'grab': return f.stats.moves.special.pose || 'grab';
    case 'grabbed': case 'hurt': case 'stagger': case 'ko': return 'hurt';
    case 'float': return 'air';
    case 'frozen': return f.pose || '';
    case 'wind': case 'strike': case 'recover': {
      const early = f.t < (f.dur || 0) * 0.5;
      if (f.stats && f.stats.kit3) return state === 'recover' && (f.stats.phFade || PH_FADE).has(f.ph) && !early ? '' : (f.stats.phPose || PH_POSE)[f.ph] ?? '';   // (Tux's and Duke's: by the move's phase; a plug-in's own table)
      const mv = move && f.stats.moves[move];
      if (mv && mv.pose) {
        if (state === 'wind') return mv.wpose || 'wind';
        if (mv.do === 'dig' && state === 'recover') return early ? 'pop' : '';   // (Gopher popping up out of his hole)
        if (mv.do === 'counter' && state === 'recover') return f.hit && early ? 'pinch' : '';   // (Ferris pinching back)
        if (mv.do === 'chain' && state === 'strike' && f.seg > 0 && f.t < mv.gap) return 'flap';   // (Swifty turning between dives)
        return state === 'strike' || early ? mv.pose : '';
      }
      if (state === 'wind') return 'wind';
      return state === 'strike' || early ? 'strike' : '';
    }
    default: return '';
  }
}
