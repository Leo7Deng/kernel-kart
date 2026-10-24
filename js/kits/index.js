// Fight mode's plug-in fighters (2026-10-24): each rebuilt fighter past Tux and Duke is one file here, js/kits/<id>.js,
// with everything the sim and the bots need, plus one file of drawing, js/art/kit-<id>.js (registered in js/art/kits.js).
// To add a fighter: copy js/kits/_template.js to js/kits/<id>.js (and js/art/kit-_template.js to js/art/kit-<id>.js),
// add one import line below (and one in js/art/kits.js), put its 3D poses next to its mesh in js/art/model3d.js, and
// once it's done and tested add its id to FIGHT_ORDER in js/fight-chars.js. Tux and Duke stay where they were
// (fight-chars.js, fight-kits.js, fight-ai.js, draw-moves.js): they're the reference, read docs/fight-api-tux-duke.md.
//
// A plug-in (the default export of js/kits/<id>.js) is plain data and functions, DOM-free and deterministic (randomness
// only from F.rngs[2](), never Math.random). It may import ../core.js, ../fight-arenas.js and ./lib.js (the kits' small
// helpers), never fight.js, fight-kits.js, fight-chars.js or fight-ai.js (they import this: a loop). The shape:
//   id          the racer's id (core.js CHARACTERS: 'gopher', 'ferris', 'pyth' ...)
//   fighter     its FIGHTERS entry (merged into fight-chars.js FIGHTERS[id]; its moves get MOVE_KIND's defaults there):
//     id, name, lang, role, kit3: true, blurb, passive, balance, hp, weight, walk, accel, friction, kbDecay, radius,
//     slipMul (friction on a puddle, x its own), reachBar (the setup screen's reach bar, 0..1), powerBar (optional: its
//     power bar, 0..1, when its moves' damage doesn't say it: a lock, a whirl of small hits)
//     moves: { move1, move2, move3, evade } each { name, short (the key display's name), do (its kit, below), icon
//       (its icon's name: drawn by its art plug-in's icon()), hold ('aim' | 'steer' | null), blurb, tell, answer (the
//       move cards), startup, active, recovery (seconds: the fight's 'wind' (the tell: a hit then is a counter hit and
//       cancels it), 'strike' and 'recover' states), cooldown (s, once it's over: f.cd[0..3]), damage, kb, kd (knocks
//       down), stun (hitstun), and the kit's own numbers }. An evade may have charges + recharge instead of a cooldown
//       (f.ev, f.evT: Duke's Garbage Collect)
//     clips: { move1, move2, move3, evade } the move cards' clips (fight-clips.js's format: { x: [x0, x1], len, cam:
//       { x, y?, w }, a: [[from, to, input], ...], b?: [...] }; fighter 0 shows it on fighter 1, fight-clips other(id))
//     phPose: { phase: pose } the 3D pose for each phase of its moves (fight.js poseOf; f.ph is the phase, set with
//       lib.setPh). Poses must be in model3d.js MODELS[id].poses (its <ID>_POSES)
//     phFade: [phase, ...] phases whose recovery stands back up halfway (the pose drops to '' for the second half)
//     fields: { name: number } extra per-fighter state, fresh every round (plain numbers: the online snapshots carry it)
//       (f.ghost: 1 while bodies pass through this fighter, fight.js collide: Cpp's Play Dead, Bugdroid's Airplane Mode)
//     show: [8 poses] the setup screen's stage loop (fight-ui.js), cheer: its picked / results pose
//     guard(F, a, d, mv, opt)  optional: a hit from a on this fighter d (before anything else): return true / false to
//       settle it yourself (set F.lastRes), undefined to let the fight go on as usual
//     tick(F, f, dt, live)  optional: every step, this fighter's own passive timers
//   kits: { do: hooks }  its moves' behaviour, merged into fight-kits.js KITS (the names must be new: prefix if unsure).
//     The hooks (all optional; c = { inp, mag, dirA } the held input; o the other fighter, mv the move's numbers):
//     can(F, f, mv) may it start now · press(F, f, o, mv, c) pressed: its wind-up begins · wind(F, f, o, mv, dt, c)
//     every step of the wind-up · hold(F, f, o, mv, c) true: keep winding past the startup · start(F, f, o, mv) the
//     active part begins · step(F, f, o, mv, dt, c) every step of it · end(F, f, o, mv) it ran out (true: you dealt with
//     what's next, else its recovery follows) · wall(F, f, c) it meets a wall (true: dealt with) · moves: true it sets its
//     own velocity · phases(mv) its phases for the docs: [[phase, state, seconds, pose, what], ...]
//   objs: { kind(F, ob, dt, own, foe, M) }  its world objects' steps, merged into fight-kits.js OBJ (new kinds only;
//     an object dies once ob.t >= ob.life). Spawn them with lib.spawn
//   ai: the bot's hooks for this fighter (fight-ai.js kitBot calls them; C = { F, i, m, me, o (the foe as the bot sees it,
//     a moment late: perceive()), live (the real foe), L (the level's numbers: answer, smart, punish, combo, rate, steer),
//     rng (the bot's own stream), tap(key, frames), hold, K (the bot's memory for kit3), g ({ A, cl, dist, gap, toFoe,
//     toC }), fire(k) (press move k: 0..2 the moves, 3 the evade), ready(k), unit(a), stepTo(a) (press the evade with
//     the stick held that way) }):
//     threats(F, i, me, o, C)  the dangers THIS fighter's moves pose to bot i (i is the other one): a list of
//       [key (unique per thing, e.g. 'x' + ob.id), T (s until it lands), dur (how long it lasts), way out (an angle),
//       how far out (units)]. Only what's been on screen for the bot's reaction time: an object once ob.t >= o.age,
//       the fighter from o (already late). Every bot answers them: walks off, or evades
//     ready(F, me, k, mv)  false: move k can't go now (one trap at a time ...)
//     stick(F, i, me, o, C)  in one of its moves (wind or strike): the stick to hold [x, y] (aiming, steering)
//     punish(F, i, me, o, C, w)  the foe is open from w.a to w.b s from now (w.fits(T): a move landing T s from now is in
//       it; w.line: a clear line to them): fire what lands (C.fire(k)) and return the walk, else null
//     neutral(F, i, me, o, C, w)  every think, nothing coming: w.add(k, chance, walk, frames) offers move k (one roll
//       picks among them); w.busy (they can't walk off now), w.spent (their evade is spent), w.line
//     want  the distance it likes to stand at (default 160)
//     evadeWhen(T, dur, E, me)  [now, late]: whether to press the evade now for a threat landing in T s lasting dur
//       (default: untouchable through it, like Tux's ice); late: the last moment it still works
// Each plug-in's own events (F.ev kinds) are drawn and heard by its art plug-in (js/art/kits.js): name them so they
// don't clash with the fight's (hit, block, down, land, wall, ko, splash, pop ...) or the others'.
import gopher from './gopher.js';
import ferris from './ferris.js';
// (one line each: import pyth from './pyth.js'; and add it to the list)
import pyth from './pyth.js';
import octo from './octo.js';
import docky from './docky.js';
import swifty from './swifty.js';
import cpp from './cpp.js';
import droid from './droid.js';

export const PLUGINS = [gopher, ferris, pyth, octo, docky, swifty, cpp, droid];
export const PLUG = Object.fromEntries(PLUGINS.map(p => [p.id, p]));
// the plug-in of a fighter (a fighter object, or an id), or null
export const plugOf = f => PLUG[typeof f === 'string' ? f : f && f.id] || null;
