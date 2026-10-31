// A plug-in fighter's drawing, as a small working example to copy (js/art/kits.js documents every hook; the sim side is
// js/kits/_template.js). Not imported: copy it to js/art/kit-<id>.js and add one import line in js/art/kits.js.
import { TAU, clamp } from '../core.js';
import { puff } from '../draw-fight.js';
import { animBase } from './kits.js';

const ID = 'sample';
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
export default {
  id: ID,
  // the move's poses played with a little squash and stretch (the pose itself is the sim's: fighter.phPose)
  anim(F, v, f) {
    const A = animBase(), k = f.pht || 0, sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
    switch (f.ph) {
      case 'crouch': sq(0.1 * ease(k / 0.12)); A.wx = Math.sin(k * 30) * 1.2; break;
      case 'lunge': sq(-0.08); A.fwd = 4; break;
      case 'stumble': A.mood = 'dizzy'; A.lean = Math.sin(k * 10) * 0.1; break;
      case 'hop': sq(-0.1); break;
      default: return null;
    }
    return A;
  },
  // the burst's spot: a soft dark patch growing darker until it bursts (no outline)
  ground(g, F, v, o) {
    if (o.kind !== 'smpSpot') return;
    const mv = F.f[o.owner].stats.moves.move2, u = clamp(o.t / mv.delay, 0, 1), a = o.ph === 'burst' ? 1 - (o.life - o.t) / 0.3 : 0;
    const gr = g.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
    gr.addColorStop(0, `rgba(30,20,40,${(0.12 + 0.3 * u) * (1 - a)})`); gr.addColorStop(1, 'rgba(30,20,40,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(o.x, o.y, o.r, o.r * 0.9, 0, 0, TAU); g.fill();
  },
  event(v, F, e, few) {
    switch (e.kind) {
      case 'smpBurst': puff(v, e.x, e.y, few ? 3 : 6, null); v.shake = Math.max(v.shake, 0.15); return true;
      case 'smpLunge': case 'smpHop': puff(v, e.x, e.y, 2, null); return true;
    }
    return false;
  },
  icon(g, kind, r, col) {
    g.fillStyle = col || '#ffffff';
    switch (kind) {
      case 'smpLunge': case 'smpBurst': case 'smpShove': case 'smpHop': g.beginPath(); g.arc(0, 0, r * 0.5, 0, TAU); g.fill(); return true;
    }
    return false;
  },
  sound(e) { return e.kind === 'smpBurst' ? [['fThud', 0.6]] : null; },
};
