// Overclock: turbo that cuts straight across.
import { trackSample, wrapS } from '../geometry.js';

// how long it burns, and how far up the road it may aim compared with the straight-line distance it can cover
export const OC_T = 1.75, OC_AHEAD = 1.15;

export default {
  id: 'oc', name: 'Overclock', col: '#ff6d00',
  short: 'turbo that cuts straight across',
  desc: 'A 1.75 s turbo that picks a point as far up the track as it can reach and drives straight there, across the grass at full speed. The shortest way, wherever that goes.',
  odds: { front: { from: 0.3, w: [9, 12] }, back: { from: 0.2, w: [13, 18] }, last: { from: 0.15, w: [12, 18] } },   // a step, not a slope: behind enough and it's there   // aimed across a hairpin or a loop it cuts a huge chunk: a big catch-up
  // fired: what happens. Return true to keep holding it (more charges left).
  use(race, c) {
    // Overclock: a longer turbo; the grass rules are lifted in race.js while c.oc runs
    // aim: the furthest point up the track you can reach in a straight line before it runs out, but no more than OC_AHEAD × that
    // distance along the road (it shaves corners, it doesn't skip sections). Over the line too (it counts the lap: race.js
    // crossLine), unless next lap is on another route (a new road every lap); never past a point-to-point course's gate
    { const T = c.T, reach = c.top * 1.3 * OC_T * 0.85, sameNext = c.lap >= race.laps || race.routeFor(c.lap + 1) === T;
      const lim = Math.min(T.open ? T.finishS - c.s - 40 : sameNext ? Infinity : T.L - c.s - 60, race.skipLimit(c)); let best = 0;   // (skipLimit: never into Moonshot's Launch Row or onto the capsule pad, race-rocket.js)
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
