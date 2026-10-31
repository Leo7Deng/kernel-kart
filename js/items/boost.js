// Turbo: speed burst.
import { TURBO_SCALE } from '../core.js';
import { straightAhead } from '../race-ai.js';

export default {
  id: 'boost', name: 'Turbo', col: '#ffb300',
  short: 'speed burst',
  desc: 'A 1.5 s burst of extra speed. Best used on a straight.',
  odds: { lead: 16, front: [16, 10], back: [12, 5], last: [12, 7] },   // a flat burst: worth less the more ground you need
  // fired; return true to keep holding it (charges left)
  use(race, c) {
    c.boost = 1.5; c.turbo = 1.5; c.speed = Math.max(c.speed, c.top * 1.2 * TURBO_SCALE); c.skx *= 0.2; c.sky *= 0.2; race.fxBoost(c);
    c.charges--; if (c.charges > 0) { c.itemT = 0; return true; }   // still holding it
  },
  // a bot holding it: fire now?
  wantUse(race, c) {
    return straightAhead(c) && c.itemT > 0.3;
  },
};
