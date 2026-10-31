// Fight fighters' art plug-ins: js/art/kit-<id>.js, the twin of js/kits/<id>.js (the sim). To add one, copy
// kit-_template.js and add an import below. Cosmetic only: reads plain fight state and events, never changes the sim
// (frnd/Math.random fine). Classic Flat first; soft natural tells (no outlines, arrows or player-coloured marks), no words.
//
// The default export is { id, ...hooks }, all optional, called by draw-moves.js, draw-kits.js and fight-ui.js
// (v: the drawer's view: v.t time, v.fx particles, v.shake; few: Reduce effects; g in world units, y down):
//   anim(F, v, f)            this fighter in a move (f.ph, f.pht): { pose, sx, sy, hop, spin, lean, fwd, wx, alpha, s,
//                            mood } or null; animBase() is the plain one
//   ground(g, F, v, o)       one of its world objects, flat on the floor
//   floor(g, F, v)           once a frame under everyone: its marks that outlive a move, kept on v
//   things(F, v, g, o, out)  one of its standing objects: out.push({ y, d }) (y-sorted)
//   stand(F, v, g, out)      once a frame, standing things that aren't world objects: out.push({ y, d })
//   behind(g, F, v, f)       before fighter f's model (either fighter); return 'hide' to hide it
//   over(g, F, v, f)         after f's model, lifted with it
//   tint(F, v, f)            a colour over f's model, or null
//   sink(F, v, f)            f sunk into the floor: { d (units lower, cut at the floor), wx } or null
//   event(v, F, e, few)      its events (e.who is this fighter): particles; true if handled
//   fx(g, F, v, p, k, dt)    its own particle kinds (p.k prefixed with its id), k 0..1 age; true if drawn
//   icon(g, kind, r, col)    its moves' icons at (0, 0), size r; true if drawn
//   sound(e)                 its events' sounds: [[name, volume], ...] or null
//   cues(F, play)            once a frame: sounds for beats that aren't events, from the state (so online hears them)
//   sounds                   { name: lib => (v, t) => ... } new synthesised sounds, added to audio.js once
import { sfx } from '../audio.js';
import gopher from './kit-gopher.js';
import ferris from './kit-ferris.js';
import pyth from './kit-pyth.js';
import octo from './kit-octo.js';
import docky from './kit-docky.js';
import swifty from './kit-swifty.js';
import cpp from './kit-cpp.js';
import droid from './kit-droid.js';
import tux from './kit-tux.js';
import { STATUS_SOUNDS } from './status.js';

export const ARTS = [gopher, ferris, pyth, octo, docky, swifty, cpp, droid, tux];
export const ART = Object.fromEntries(ARTS.map(a => [a.id, a]));
export const artsIn = F => { const out = []; for (const f of F.f || []) { const a = ART[f.id]; if (a && !out.includes(a)) out.push(a); } return out; };
export const animBase = () => ({ sx: 1, sy: 1, hop: 0, spin: 0, lean: 0, fwd: 0, wx: 0, alpha: 1, s: 1, mood: undefined });
// an own move's recovery as a calm settle, not a stun: k s in, dur long, from the move's last pose (held for `hold` s)
// back to stand with a soft squash and a breath; A.pose replaces the sim's pose
export function settleAnim(k, dur, from = 'stand', hold = dur / 3) {
  const A = animBase(), u = Math.min(1, Math.max(0, k / Math.max(0.05, dur))), e = Math.exp(-k * 9) * Math.cos(k * 16), sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
  sq(0.05 * e + 0.012 * Math.sin(u * Math.PI));
  A.pose = k < hold ? from : 'stand'; A.fwd = 1.5 * (1 - Math.exp(-k * 6));
  return A;
}
for (const a of ARTS) for (const k in a.sounds || {}) if (sfx.define) sfx.define(k, a.sounds[k]);
for (const k in STATUS_SOUNDS) if (sfx.define) sfx.define(k, STATUS_SOUNDS[k]);   // shared statuses (status.js)
