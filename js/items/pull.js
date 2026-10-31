// Pull Request: tows you to the leader.
import { Math } from '../detmath.js';
import { straightAhead } from '../race-ai.js';
import { blockedByShield, phased } from '../rules.js';
import { clonesOf, popClone } from './thread.js';

// how long the beam holds, and the extra grip while you're being towed
export const PULL_T = 2.9, PULL_GRIP = 1.5;

export default {
  id: 'pull', name: 'Pull Request', col: '#26c6da',
  short: 'tows you to the leader',
  desc: 'A 2.9 s beam onto the race leader: it drags them back and reels you in fast, then a slingshot. While towed you\'re faster and grippier, but the throttle stays yours, so it won\'t haul you off the road. Running wide doesn\'t lose it; the leader can break free by going off the road.',
  odds: { front: { from: 0.25, w: [8, 10] }, back: { from: 0.2, w: [10, 12] }, last: { from: 0.2, w: [10, 13] } }, pack: 1.25,   // reels you in to the leader: the more gap, the more it closes
  // fired; return true to keep holding it (charges left)
  use(race, c, sorted) {
    const t = sorted.find(o => o !== c && !o.finished && o.rank < c.rank) || null;   // always the leader
    const decoy = t && clonesOf(race, t).find(k => Math.hypot(k.x - c.x, k.y - c.y) < Math.hypot(t.x - c.x, t.y - c.y));
    if (decoy) { race.fxRingIn(decoy.x, decoy.y, '#26c6da', 70, 0.4, 5); popClone(race, decoy); race.sound('hit_pull', decoy); c.boost = 1.0; race.fxBoost(c); }   // the leader's Thread clone was nearer: the beam grabs that, and it snaps
    else if (t && phased(t)) { c.boost = 1.0; race.fxBoost(c); }   // nothing to grab: a nitro instead
    else if (t && blockedByShield(race, t)) race.fxFizzle(c);
    else if (t) { c.pull = PULL_T; c.pullTarget = t; t.dragged = PULL_T; t.dragBy = c; race.fxHit(t, '#26c6da', 'pull'); race.feed('hit', 'pull', c, t); }
    else { c.boost = 1.0; race.fxBoost(c); }
  },
  // a bot holding it: fire now?
  wantUse(race, c, sorted) {
    const lead = sorted[0]; if (!lead || lead === c) return c.itemT > 2; return (straightAhead(c) && lead.progress - c.progress > 150) || c.itemT > 4;
  },
};
