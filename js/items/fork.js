// Fork Bomb: 3 mines across the road.
import { trackSample } from '../geometry.js';
import { MINE_R } from './mine.js';

export default {
  id: 'fork', name: 'Fork Bomb', col: '#ff7a59',
  short: '3 mines across the road',
  desc: 'Forks a mine into three, spread across the road behind you. Hard to dodge.',
  odds: { front: [7, 2], back: [5, 0] }, pack: 0.5,   // dropped behind: for cars being chased
  // fired; return true to keep holding it (charges left)
  use(race, c) {
    const T = c.T;
    const m = race.dropBehind(c, MINE_R, {});
    for (const u of [-0.55, 0, 0.55]) { const p = trackSample(T, m.s - Math.abs(u) * 30), lat = u * (p.hw - 14); race.mines.push({ x: p.x + p.nx * lat, y: p.y + p.ny * lat, s: m.s, lat, life: 22, arm: 1, owner: c, item: 'fork', T }); }
  },
  // a bot holding it: fire now?
  wantUse(race, c) {
    for (const o of race.cars) { if (o === c) continue; const d = c.progress - o.progress; if (d > 0 && d < 160) return true; } return c.itemT > 4;
  },
};
