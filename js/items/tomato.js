// Segfault: mine behind you.
import { MINE_R } from './mine.js';

export default {
  id: 'tomato', name: 'Segfault', col: '#e53935',
  short: 'mine behind you',
  desc: 'Drops a mine behind you. Whoever drives over it spins out.',
  odds: { lead: 16, front: [5, 0] },   // dropped behind: for cars being chased
  // fired; return true to keep holding it (charges left)
  use(race, c) {
    race.mines.push(race.dropBehind(c, MINE_R, { life: 25, arm: 1, owner: c }));
  },
  // a bot holding it: fire now?
  wantUse(race, c) {
    for (const o of race.cars) { if (o === c) continue; const d = c.progress - o.progress; if (d > 0 && d < 90) return true; } return c.itemT > 4;
  },
};
