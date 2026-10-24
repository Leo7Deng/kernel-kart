// Fight mode's plug-in fighters' drawing (2026-10-24): one file each, js/art/kit-<id>.js, the twin of js/kits/<id>.js
// (the sim side: js/kits/index.js). To add one: copy js/art/kit-_template.js to js/art/kit-<id>.js and add one import
// line below. Cosmetic only: it reads the fight's plain state and events (offline, online and in the move cards' clips
// alike), never changes the sim, and may use frnd/fchance and Math.random. Classic Flat first (bold() and the BK palette,
// js/look.js), Classic not broken. The look (the user's): cute, cartoony, believable; tells soft and natural (shadows,
// tracks, ripples, stains, swirls: no outlines, chevrons, arrows or player-coloured floor marks), no words in effects, a
// notch calm (screen shake only on the biggest landings, and gently).
//
// An art plug-in (the default export) is { id, ...hooks }, every hook optional. draw-moves.js, draw-kits.js and
// fight-ui.js call them (v: the drawer's view of this fight: v.t the time, v.fx the particles, v.shake; few: fewer
// particles, Settings > Reduce effects; g the canvas, at world units, y down):
//   anim(F, v, f)            this fighter in a move (f.ph its phase, f.pht s in it): { pose (optional: drawn instead of the sim's), sx, sy (squash, stretch), hop, spin
//                            (added to its yaw), lean (rad), fwd (moved along its facing), wx (a wiggle on screen), alpha, s
//                            (its size), mood ('dizzy', 'happy' ... or undefined) }, or null. animBase() gives the plain one
//   ground(g, F, v, o)       one of its world objects (o.owner is this fighter), flat on the floor (tells, marks, stains)
//   things(F, v, g, o, out)  one of its objects standing among the fighters: out.push({ y, d: () => draw }) (y-sorted)
//   behind(g, F, v, f)       before fighter f's model, at its feet (f is either fighter: check f.id / f.i); 'hide' hides
//                            the model (underground, gone)
//   over(g, F, v, f)         after f's model, at its feet and lifted with it (either fighter: chains on the foe ...)
//   tint(F, v, f)            a colour laid over f's model (either fighter), or null
//   event(v, F, e, few)      one of its events (e.who is this fighter): its particles; true if handled
//   fx(g, F, v, p, k, dt)    its own particle kinds (p.k: prefix them with its id), k 0..1 their age; true if drawn
//   icon(g, kind, r, col)    its moves' icons (the keys, the HUD, the feed), round (0, 0), r the size; true if drawn
//   sound(e)                 its events' sounds: [[name, volume], ...] (audio.js names, or its own below), or null
//   sounds                   { name: lib => (v, t) => ... } new synthesised sounds (lib: { osc, hiss, arp, boom, SOUNDS }:
//                            audio.js's), added to audio.js once
import { sfx } from '../audio.js';
import gopher from './kit-gopher.js';
import ferris from './kit-ferris.js';
// (one line each: import pyth from './kit-pyth.js'; and add it to the list)
import pyth from './kit-pyth.js';
import octo from './kit-octo.js';
import docky from './kit-docky.js';
import swifty from './kit-swifty.js';
import cpp from './kit-cpp.js';
import droid from './kit-droid.js';

export const ARTS = [gopher, ferris, pyth, octo, docky, swifty, cpp, droid];
export const ART = Object.fromEntries(ARTS.map(a => [a.id, a]));
// the art plug-ins of the fighters in this fight (each once)
export const artsIn = F => { const out = []; for (const f of F.f || []) { const a = ART[f.id]; if (a && !out.includes(a)) out.push(a); } return out; };
// a move's plain animation (nothing changed)
export const animBase = () => ({ sx: 1, sy: 1, hop: 0, spin: 0, lean: 0, fwd: 0, wx: 0, alpha: 1, s: 1, mood: undefined });
// an own move's recovery as a calm settle, not a stun (2026-10-24, the user: "i also dont like the little stun animation
// after every move, just make it so theres a delay but not an actual stun"): k s into it, dur its length, from the
// move's last pose (its follow-through, held a moment) back to stand: weight landing (a soft squash springing back), a
// breath out, a slow ease back; no stars, wobble, sprawl or dazed face. A.pose is the pose to draw (anim's pose field:
// draw-fight.js draws it instead of the sim's). hold: s the follow-through is held (default a third of it)
export function settleAnim(k, dur, from = 'stand', hold = dur / 3) {
  const A = animBase(), u = Math.min(1, Math.max(0, k / Math.max(0.05, dur))), e = Math.exp(-k * 9) * Math.cos(k * 16), sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
  sq(0.05 * e + 0.012 * Math.sin(u * Math.PI));   // (the weight landing, then a breath)
  A.pose = k < hold ? from : 'stand'; A.fwd = 1.5 * (1 - Math.exp(-k * 6));
  return A;
}
for (const a of ARTS) for (const k in a.sounds || {}) if (sfx.define) sfx.define(k, a.sounds[k]);
