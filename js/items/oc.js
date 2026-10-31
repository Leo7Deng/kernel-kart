// Overclock: turbo that cuts straight across.
import { Math } from '../detmath.js';
import { trackSample, wrapS } from '../geometry.js';

// how long it burns, and how far up the road it may aim compared with the straight-line distance it can cover
export const OC_T = 1.75, OC_AHEAD = 1.15;

export default {
  id: 'oc', name: 'Overclock', col: '#ff6d00',
  short: 'turbo that cuts straight across',
  desc: 'A 1.75 s turbo that picks a point as far up the track as it can reach and drives straight there, across the grass at full speed. The shortest way, wherever that goes.',
  odds: { front: { from: 0.3, w: [9, 12] }, back: { from: 0.2, w: [13, 18] }, last: { from: 0.15, w: [12, 18] } },   // a step, not a slope: across a hairpin it cuts a huge chunk
  // fired; return true to keep holding it (charges left)
  use(race, c) {
    // a longer turbo with no grass rules (race.js, while c.oc runs), aimed at the furthest point reachable in a straight
    // line, capped at OC_AHEAD × that along the road (shaves corners, doesn't skip sections). Over the line too, unless
    // next lap is another route; never past an open course's gate
    { const T = c.T, reach = c.top * 1.3 * OC_T * 0.85, sameNext = c.lap >= race.laps || race.routeFor(c.lap + 1) === T;
      const lim = Math.min(T.open ? T.finishS - c.s - 40 : sameNext ? Infinity : T.L - c.s - 60, race.skipLimit(c)); let best = 0;   // (skipLimit: race-rocket.js)
      for (let d = 150; d <= Math.min(lim, reach * OC_AHEAD); d += 20) { const q = trackSample(T, c.s + d); if (Math.hypot(q.x - c.x, q.y - c.y) <= reach) best = d; }
      if (best > 150) { const q = trackSample(T, c.s + best); c.ocT = { s: wrapS(T, c.s + best), x: q.x, y: q.y }; } else c.ocT = null; }
    c.oc = OC_T; c.boost = OC_T; c.speed = Math.max(c.speed, c.top * 1.1); c.skx *= 0.2; c.sky *= 0.2; race.fxBoost(c); race.fxRing(c.x, c.y, '#ff6d00', 60, 0.4, 5);
    race.fxBolts(c.x, c.y, 4, '#ffab40', 40);
  },
  // a bot holding it: fire now?
  wantUse(race, c) {
    return c.itemT > 0.3 + c.ai.noise;   // it finds its own line: any time
  },
};
