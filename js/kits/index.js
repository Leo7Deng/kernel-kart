// @ts-check
// Fight mode's fighters, the kit API (the one place it's written down). Every fighter is a plug-in: one file here,
// js/kits/<id>.js, with everything the sim and the bots need, plus its drawing and sounds, js/art/kit-<id>.js
// (registered in js/art/kits.js; Duke's: js/draw-moves.js).
// The core they run on is js/fight.js (states, phases, hits, knockdowns, cooldowns, objects, arenas, rounds: its header).
// To add a fighter: copy js/kits/_template.js to js/kits/<id>.js (and js/art/kit-_template.js to js/art/kit-<id>.js),
// add one import line below (and one in js/art/kits.js), put its 3D poses next to its mesh in js/art/model3d.js, and
// once it's done and tested add its id to FIGHT_ORDER in js/fight-chars.js.
//
// A plug-in (the default export of js/kits/<id>.js) is plain data and functions, DOM-free and deterministic (randomness
// only from F.rngs[2]() in the sim and C.rng() in the bot, never Math.random). It may import ../core.js,
// ../fight-arenas.js and ./lib.js (the kits' small helpers), never fight.js, fight-chars.js or fight-ai.js (they import
// this: a loop). The shape:
//   id          the racer's id (core.js CHARACTERS: 'gopher', 'ferris', 'pyth' ...)
//   fighter     its FIGHTERS entry (fight-chars.js FIGHTERS[id]; filled in there: a move's kb 0 when it has damage and
//               none, sub-hits never stale on their own, cooldowns scaled per key, CD_MUL):
//     id, name, lang, role, tagline (the select screen's one line), difficulty ('easy' | 'medium' | 'hard'), blurb,
//     passive, balance (why it's strong or weak where it is), hp, weight, walk, accel, friction, kbDecay, radius, slipMul
//     (friction on a slick puddle, x its own); optional passives the core reads: stunMul (hitstun and time down x),
//     isolation (Docky: the round's first hit does no damage, f.iso)
//     moves: { move1, move2, move3, evade } (the same for everyone: move1 the basic move with the shortest
//       cooldown, move2 a secondary one, move3 the most special with the longest) each { name, short (the key display's
//       name), do (its kit, below), icon (its icon's name: drawn by its art's icon()), hold ('aim' | 'steer' | 'charge' |
//       null), blurb, tell, answer (the move cards), startup, active, recovery (seconds: the fight's 'wind' (the tell: a
//       hit then is a counter hit and cancels it), 'strike' and 'recover' states), cooldown (s, once it's over:
//       f.cd[0..3]), damage, kb, kd (knocks down), stun (hitstun), contact (two contact moves active and in reach trade),
//       whiff (an event 'whiff' when it meets nothing), stale (false: never weakens with repeats), and the kit's own
//       numbers; sub-hits (hit, last, boil ...: fight-chars.js SUBS) are moves of their own for hitF }. An evade may have
//       charges + recharge instead of a cooldown (f.ev, f.evT: Duke's Garbage Collect)
//     clips: { move1, move2, move3, evade } the move cards' clips (fight-clips.js's format: { x: [x0, x1], len, cam:
//       { x, y?, w }, set?(F), a: [[from, to, input], ...], b?: [...] }; fighter 0 shows it on fighter 1, other(id))
//     phPose: { phase: pose } the 3D pose for each phase of its moves (fight.js poseOf; f.ph is the phase, set with
//       lib.setPh). Poses must be in model3d.js MODELS[id].poses (its <ID>_POSES)
//     phFade: [phase, ...] phases whose recovery stands back up halfway (the pose drops to '' for the second half)
//     fields: { name: number } extra per-fighter state, fresh every round (plain numbers: the online snapshots carry it)
//       (f.ghost: 1 while bodies pass through this fighter, fight.js collide: Cpp's Play Dead, Bugdroid's Airplane Mode)
//     show: [poses] the setup screen's stage loop (fight-ui.js), cheer: its picked / results pose
//     guard(F, a, d, mv, opt)  optional: a hit from a on this fighter d (before anything else): return true / false to
//       settle it yourself (set F.lastRes), undefined to let the fight go on as usual
//     tick(F, f, dt, live)  optional: every step, this fighter's own passive timers (Bugdroid's battery, Duke's heat)
//   kits: { do: hooks }  its moves' behaviour, gathered into KITS below (the names must be new: prefix if unsure).
//     The hooks (all optional; c = { inp, mag, dirA } the held input; o the other fighter, mv the move's numbers):
//     can(F, f, mv) may it start now · press(F, f, o, mv, c) pressed: its wind-up begins · wind(F, f, o, mv, dt, c)
//     every step of the wind-up · hold(F, f, o, mv, c) true: keep winding past the startup · start(F, f, o, mv) the
//     active part begins · step(F, f, o, mv, dt, c) every step of it · end(F, f, o, mv) it ran out (true: you dealt with
//     what's next, else its recovery follows) · recover(F, f, o) every step of its recovery (true: cut short, dealt
//     with: Duke's jab out of his blink) · wall(F, f, c) it meets a wall (true: dealt with) · moves: true it sets its own
//     velocity · phases(mv) its phases for the docs (docs/fight-frames.md): [[phase, state, seconds, pose, what], ...]
//     (a hit on the fighter during one of its moves: the fighter's own guard above)
//     The fight's tools a kit uses: F.go(f, state, dur), F.ev(kind, x, y, power, who, extra), F.hitF(a, d, mv, opt)
//     and F.lastRes, F.reaches(f, t, mv, pad), F.knockDown(f, a, kb, by), F.release(f), F.startMove / F.strikeStart (a
//     move out of another), F.whiff(f), F.contactsAll / F.keepIn (walls and solids), F.ctl(f) (the held input),
//     F.hitstop, F.dmgMul, F.rngs[2], F.poison(f, dur, slow, by) (the shared poison status: f walks x slow and can't
//     evade for dur s, f.psnT / f.psnSlow; no damage by itself; the bots know: no evade on offer, a foe's counts as spent)
//   objs: { kind(F, ob, dt, own, foe, M) }  its world objects' steps, gathered into OBJ below (new kinds only; an
//     object dies once ob.t >= ob.life; solid: 1 with a box or circle shape makes it a wall). Spawn them with lib.spawn
//   ai: the bot's hooks for this fighter (fight-ai.js kitBot calls them; C = { F, i, m, me, o (the foe as the bot sees it,
//     a moment late: perceive()), live (the real foe), L (the level's numbers as this bot plays them, its style on top:
//     answer, smart, punish, combo, rate, lead, setup ...), rng (the bot's own stream), tap(key, frames), hold, K (the bot's memory), g ({ A, cl, dist, gap, toFoe,
//     toC }), fire(k) (press move k: 0..2 the moves, 3 the evade), ready(k), unit(a), stepTo(a) (press the evade with
//     the stick held that way), aimAt(key, s) (where to aim a throw: the foe as seen, led partly by s s of their walk, off
//     by an error rolled once per key, e.g. me.ms: bots aim a bit worse), link(p) (a link out of its evade:
//     true with chance p, bent the human way, js/fight-human.js humanLink; roll it once per evade), punish(w) (the shared
//     punishIn: what of ours lands in window w) }). In the order a think asks them:
//     each(F, i, me, o, C)  every think, first (Duke: the jab pressed as he lands from a blink in)
//     stick(F, i, me, o, C)  in one of its moves (wind or strike): the stick to hold [x, y] (aiming, steering)
//     chase(F, i, me, o, C)  THIS fighter's thing on bot i (the other one), before anything else: a walk, or null (Duke's
//       pot on them: chase him to pass it back)
//     first(F, i, me, o, C)  its own, before a hit on a foe on the floor: a walk or null (Duke keeping away from his pot)
//     follow(F, i, me, o, C)  its own follow-ups, after that: a walk or null (Duke's freeze string, his hot jab string)
//     threats(F, i, me, o, C)  the dangers THIS fighter's moves pose to bot i (i is the other one): a list of
//       [key (unique per thing, e.g. 'x' + ob.id), T (s until it lands), dur (how long it lasts), way out (an angle),
//       how far out (units), soft? (1: spacing or a follow-up that may come, not an attack: left out of the bots'
//       measurements)]. Only what's been on screen for the bot's reaction time: an object once ob.t >= o.age, the
//       fighter from o (already late). Every bot answers them: walks off, or evades
//     objThreats: { kind(F, i, me, o, ob, C) }  its world objects of that kind as threats to bot i (either fighter: Duke's
//       pot boiling on himself too): one threat as above, or null (gathered into OBJ_THREAT below)
//     ready(F, me, k, mv, ok)  whether move k can go now (ok: off cooldown, not locked, its kit's can willing)
//     punish(F, i, me, o, C, w)  the foe is open from w.a to w.b s from now (w.fits(T): a move landing T s from now is in
//       it; w.line: a clear line to them): fire what lands (C.fire(k)) and return the walk, else null
//     neutral(F, i, me, o, C, w)  every think, nothing coming: w.add(k, chance, walk, frames) offers move k (one roll
//       picks among them); w.busy (they can't walk off now), w.spent (their evade is spent), w.line. It may return a
//       walk [x, y] to take if no move fires (closing in for a HIT while they're open ...), or { now: walk } when it's
//       done what it does this think (Duke's blink in)
//     sane(F, me, k, g)  false: a wild press of move k (fight-human.js) makes no sense now
//     want  the distance it likes to stand at (default 160)
//     evadeWhen(T, dur, E, me, key, soft)  [now, late]: whether to press the evade now for threat key landing in T s
//       lasting dur (default: untouchable through it, like Tux's ice); late: the last moment it still works; soft: it's
//       only spacing or a follow-up that may come (Bugdroid's surge isn't worth spending on one)
//     wary(F, i, me, o, C)  optional: hitting THIS fighter is no use right now (Tux's Ice Armour): null, or { p (how
//       strongly bot i holds off, 0..1, x its level's sense), walk ([x, y] meanwhile) }: read in neutral and punishes
//     brave(F, me)  optional: true: this fighter's bot doesn't walk off what's coming (armoured: it only chips)
//     still  true: its evade goes nowhere (Bugdroid's surge): the bot never spends it to get somewhere
//     persona  its character as a bot (js/fight-style.js; plain numbers, all optional): aggr (presses in:
//       nearer, keener, on a quicker rhythm), keep (keeps away: further off, a hit and run), patient (waits for openings:
//       a little less keen, punishes more), trap + traps + trapN (sets trapN of its traps moves, keys 0..2, before it
//       engages, further off meanwhile), rush (presses in on a foe who sets traps while few are out; w.rush in
//       neutral, 0..1), like ([4] its leaning per key), styles ([aggressive, patient, tricky] weights for
//       its own style's roll). C.L.setup (0..1, Chill 0.15 .. Ruthless 0.9) is how keen the bot is on the kit's setups:
//       weigh a setup's payoff with it (Pyth's apple after a toss, Docky's wall after the wave, Ferris's Lock first)
//     evadeWay(F, i, me, o, C, a, key)  the way to hold for an evade answering threat key, whose way out is angle a
//       (default a; Gopher's burrow, untouchable underground, digs in under a thing from afar at them instead)
// Each plug-in's own events (F.ev kinds) are drawn and heard by its art (js/art/kits.js): name them so they don't
// clash with the fight's (hit, counter, trade, whiff, down, getup, rise, wall, ko, burn, pad, step, tell, thaw, iso ...)
// or the others'.
// ---- the same shape as types, for npm run typecheck (every js/kits/<id>.js annotates its fighter, kits, objs and ai
// with these). A kit's own numbers on a move, its own fields on a fighter or an object, are untyped extras.
/** @typedef {import('../fight.js').Fight} Fight */
/** @typedef {import('../fight.js').Fighter} Fighter */
/** @typedef {import('../fight.js').WorldObj} WorldObj */
/** @typedef {import('../fight.js').Ctl} Ctl */
/** @typedef {import('../fight.js').HitOpt} HitOpt */
/** A move's numbers (FIGHTERS[id].moves.move1 ...; sub-hits like hit, last, boil are moves too). Times in s.
 * @typedef {{ name?: string, short?: string, do?: string, icon?: string, hold?: 'aim' | 'steer' | 'charge' | null,
 *   blurb?: string, tell?: string, answer?: string, startup?: number, active?: number, recovery?: number,
 *   cooldown?: number, charges?: number, recharge?: number, damage?: number, kb?: number, kd?: boolean, stun?: number,
 *   contact?: boolean, whiff?: boolean, stale?: boolean, reach?: number, arc?: number, [k: string]: any }} Move */
/** @typedef {{ move1: Move, move2: Move, move3: Move, evade: Move }} Moves */
/** A move card's clip (fight-clips.js's format).
 * @typedef {{ x: number[], len: number, cam: { x: number, y?: number, w: number }, set?: (F: Fight) => void,
 *   a: any[][], b?: any[][] }} Clip */
/** A fighter's data (its plug-in's `fighter`; FIGHTERS[id]). phFade becomes a Set when fight-chars.js loads.
 * @typedef {{ id: string, name: string, lang: string, role: string, tagline?: string, difficulty?: string, blurb: string,
 *   passive: string, balance: string, hp: number, weight: number, walk: number, accel: number, friction: number,
 *   kbDecay: number, radius: number, slipMul: number, stunMul?: number, isolation?: boolean | number, moves: Moves,
 *   clips?: Partial<Record<keyof Moves, Clip>>, phPose?: Record<string, string>, phFade?: string[] | Set<string>,
 *   fields?: Record<string, number>, show?: string[], cheer?: string,
 *   guard?: (F: Fight, a: Fighter, d: Fighter, mv: Move, opt: HitOpt) => boolean | undefined,
 *   tick?: (F: Fight, f: Fighter, dt: number, live: boolean) => void, [k: string]: any }} FighterData */
/** A move's behaviour (KITS[mv.do]): every hook optional, the header above says when each runs.
 * @typedef {{ can?: (F: Fight, f: Fighter, mv: Move) => any, press?: (F: Fight, f: Fighter, o: Fighter, mv: Move, c: Ctl) => void,
 *   wind?: (F: Fight, f: Fighter, o: Fighter, mv: Move, dt: number, c: Ctl) => void,
 *   hold?: (F: Fight, f: Fighter, o: Fighter, mv: Move, c: Ctl) => any,
 *   start?: (F: Fight, f: Fighter, o: Fighter, mv: Move) => void,
 *   step?: (F: Fight, f: Fighter, o: Fighter, mv: Move, dt: number, c: Ctl) => void,
 *   end?: (F: Fight, f: Fighter, o: Fighter, mv: Move) => any, recover?: (F: Fight, f: Fighter, o: Fighter) => any,
 *   wall?: (F: Fight, f: Fighter, c: Contact) => any, moves?: boolean, phases?: (mv: Move) => any[][] }} Kit */
/** A wall or solid a body touches (fight-arenas.js contacts): the push out of it (nx, ny), how deep (pen).
 * @typedef {{ nx: number, ny: number, pen: number, [k: string]: any }} Contact */
/** A world object kind's step (OBJ[kind]): M is the owner's moves.
 * @typedef {(F: Fight, ob: WorldObj, dt: number, own: Fighter, foe: Fighter, M: Moves) => void} ObjStep */
/** A walk the bot takes: the stick [x, y].
 * @typedef {number[]} Walk */
/** A danger to a bot: [key, T (s until it lands), dur, way out (angle), how far out, soft? (1: spacing only)].
 * @typedef {[string, number, number, number, number, number?] | (string | number)[]} Threat */
/** The foe as a bot sees it (fight-ai.js perceive): a moment late, only what's on screen, plus how old the look is
 * (age, pAge), its state's time left by now (left), when it's free again (after, -1: free), stuck (in a recovery) and
 * inv (untouchable then, as seen: an evade, a quick rise, a dive under).
 * @typedef {{ T: number, x: number, y: number, z: number, vx: number, vy: number, state: string, move: string | null,
 *   t: number, dur: number, under: number, face: number, ms: number, bat: any, ph: string, gone: number, air: number,
 *   ev: number, inv: number, cd: number[] | null, stats: FighterData, r: number, i: number, age: number, pAge: number, left: number,
 *   after: number, stuck: boolean }} Seen */
/** What a bot's hooks get (fight-ai.js plugCtx; the header above lists each).
 * @typedef {{ F: Fight, i: number, m: Record<string, any>, me: Fighter, o: Seen, live: Fighter, L: Record<string, any>,
 *   rng: () => number, tap: (k: string, n?: number) => any, hold: Record<string, any>, K: Record<string, any>,
 *   g: Record<string, any>, unit: (a: number) => Walk, fire: (k: number, n?: number) => any, ready: (k: number) => boolean,
 *   stepTo: (a: number) => Walk, aimAt: (key: string, s: number) => number[], link: (p: number) => any,
 *   punish: (w: PunishWindow) => Walk | null }} BotCtx */
/** A punish window: the foe is open from a to b s from now; fits(T): a move landing T s from now is in it.
 * @typedef {{ a: number, b: number, fits: (T: number) => boolean, line?: boolean, busy?: boolean }} PunishWindow */
/** A neutral think's offer list: add(k, chance, walk, frames) offers move k; busy, spent, line: what the foe's up to.
 * @typedef {{ add: (k: number, p: number, walk?: Walk, n?: number) => void, busy: boolean, spent: boolean, line: boolean, rush?: number }} NeutralOffer */
/** A fighter's bot hooks (its plug-in's `ai`; fight-ai.js kitBot): every one optional, the header above says when.
 * @typedef {{ each?: (F: Fight, i: number, me: Fighter, o: Seen, C: BotCtx) => any,
 *   stick?: (F: Fight, i: number, me: Fighter, o: Seen, C: BotCtx) => Walk | null | undefined,
 *   chase?: (F: Fight, i: number, me: Fighter, o: Seen, C: BotCtx) => Walk | null | undefined,
 *   first?: (F: Fight, i: number, me: Fighter, o: Seen, C: BotCtx) => Walk | null | undefined,
 *   follow?: (F: Fight, i: number, me: Fighter, o: Seen, C: BotCtx) => Walk | null | undefined,
 *   threats?: (F: Fight, i: number, me: Fighter, o: Seen, C: BotCtx) => Threat[],
 *   objThreats?: Record<string, (F: Fight, i: number, me: Fighter, o: Seen, ob: WorldObj, C: BotCtx) => Threat | null>,
 *   ready?: (F: Fight, me: Fighter, k: number, mv: Move, ok: boolean) => boolean,
 *   punish?: (F: Fight, i: number, me: Fighter, o: Seen, C: BotCtx, w: PunishWindow) => Walk | null | undefined,
 *   neutral?: (F: Fight, i: number, me: Fighter, o: Seen, C: BotCtx, w: NeutralOffer) => (Walk & { now?: undefined }) | { now: Walk } | null | undefined | void,
 *   sane?: (F: Fight, me: Fighter, k: number, g: Record<string, any>) => boolean,
 *   want?: number,
 *   evadeWhen?: (T: number, dur: number, E: Move, me: Fighter, key: string, soft?: any) => any[],
 *   wary?: (F: Fight, i: number, me: Fighter, o: Seen, C: BotCtx) => { p: number, walk?: Walk } | null,
 *   brave?: (F: Fight, me: Fighter) => boolean, still?: boolean,
 *   persona?: { aggr?: number, keep?: number, patient?: number, trap?: number, traps?: number[], trapN?: number, rush?: number,
 *     like?: number[], styles?: number[] },
 *   evadeWay?: (F: Fight, i: number, me: Fighter, o: Seen, C: BotCtx, a: number, key: string) => number }} BotHooks */
/** A plug-in fighter (the default export of js/kits/<id>.js).
 * @typedef {{ id: string, fighter: FighterData, kits?: Record<string, Kit>, objs?: Record<string, ObjStep>, ai?: BotHooks }} Plugin */

import duke from './duke.js';
import gopher from './gopher.js';
import ferris from './ferris.js';
// (one line each: import pyth from './pyth.js'; and add it to the list)
import pyth from './pyth.js';
import octo from './octo.js';
import docky from './docky.js';
import swifty from './swifty.js';
import cpp from './cpp.js';
import droid from './droid.js';
import tux from './tux.js';

/** @type {Plugin[]} */
export const PLUGINS = [duke, gopher, ferris, pyth, octo, docky, swifty, cpp, droid, tux];
export const PLUG = Object.fromEntries(PLUGINS.map(p => [p.id, p]));
// the plug-in of a fighter (a fighter object, or an id), or null
/** @type {(f: Fighter | string | null | undefined) => Plugin | null} */
export const plugOf = f => PLUG[typeof f === 'string' ? f : f && f.id] || null;

// the registries: every move's behaviour by its `do` (KITS), every world object's step by its kind (OBJ), every world
// object kind's threat to a bot (OBJ_THREAT)
/** @type {Record<string, Kit>} */
export const KITS = {};
/** @type {Record<string, ObjStep>} */
export const OBJ = {};
/** @type {BotHooks['objThreats']} */
export const OBJ_THREAT = {};
for (const p of PLUGINS) {
  for (const k in p.kits || {}) { if (KITS[k]) throw new Error(`fight kit '${k}' (${p.id}) is taken`); KITS[k] = p.kits[k]; }
  for (const k in p.objs || {}) { if (OBJ[k]) throw new Error(`fight object '${k}' (${p.id}) is taken`); OBJ[k] = p.objs[k]; }
  for (const k in (p.ai && p.ai.objThreats) || {}) OBJ_THREAT[k] = p.ai.objThreats[k];
}
// the kit of fighter f's current move, or null
/** @type {(f: Fighter) => Kit | null} */
export const kitOf = f => { const mv = f.move && f.stats.moves[f.move]; return mv && mv.do ? KITS[mv.do] : null; };
// the world objects that are walls right now (solid: 1, on the floor: Docky's crates)
/** @type {(F: Fight) => WorldObj[]} */
export const solidObjs = F => F.objs.filter(o => o.solid && o.z <= 0);
