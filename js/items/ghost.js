// Ghost: untouchable, 3 s.
import { TAU, frnd } from '../core.js';

export default {
  id: 'ghost', name: 'Ghost', col: '#b39ddb',
  short: 'untouchable, 3 s',
  desc: 'Phase out for 3 s: nothing can hit you, cars drive through you, and running onto the grass costs you no speed.',
  odds: { lead: 12, front: [6, 8], back: [8, 5], last: [8, 4] }, leadFade: 0.5,   // dodges for the leader; grass costs nothing, so it cuts corners too
  // fired: what happens. Return true to keep holding it (more charges left).
  use(race, c) {
    // phase out: untouchable, and the run-off costs you nothing while it lasts
    c.ghost = 3; race.fxRing(c.x, c.y, '#b39ddb', 70, 0.5, 6); for (let k = 0; k < 6; k++) race.fxPuff(c.x + frnd(-20, 20), c.y + frnd(-20, 20), '#d1c4e9', frnd(9, 14), 0.7, frnd(-30, 30), frnd(-60, -20));
  },
  // a bot holding it: fire now?
  wantUse(race, c) {
    // dodge something incoming, otherwise use it soon
    for (const p of race.projectiles) if (p.target === c && p.life > 0 && Math.hypot(p.x - c.x, p.y - c.y) < 220) return true;
    return c.itemT > 1.5 + c.ai.noise * 3;
  },
};
