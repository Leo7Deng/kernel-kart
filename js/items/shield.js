// Firewall: blocks one hit, 4 s.
import { Math } from '../detmath.js';
import { trackSample } from '../geometry.js';
import { MINE_R } from './mine.js';

export default {
  id: 'shield', name: 'Firewall', col: '#40c4ff',
  short: 'blocks one hit, 4 s',
  desc: 'A 4 s shield that blocks the next thing that hits you. Time it well.',
  odds: { lead: 13, front: [10, 3], back: [4, 0] }, leadFade: 0.5,   // defence, for cars with someone right behind
  // fired; return true to keep holding it (charges left)
  use(race, c) {
    c.shield = 4; race.fxFlash(c.x, c.y, '#b3ecff', 40, 0.2); race.fxSparks(c.x, c.y, 8, '#40c4ff', 110);
  },
  // a bot holding it: fire now?
  wantUse(race, c) {
    const T = c.T;
    if (c.itemT > 3 && c.rank === 1) return true;
    for (const p of race.projectiles) if (p.target === c && p.life > 0 && Math.hypot(p.x - c.x, p.y - c.y) < 140) return true;
    { const p = trackSample(T, c.s); for (const m of race.mines) { const dx = m.x - c.x, dy = m.y - c.y, ds = dx * p.tx + dy * p.ty, dl = dx * p.nx + dy * p.ny; if (ds > 0 && ds < 70 && Math.abs(dl) < c.W / 2 + MINE_R) return true; } }
    return c.itemT > 6;
  },
};
