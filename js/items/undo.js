// Ctrl+Z: rewinds the car ahead.
import { lerp } from '../core.js';
import { blockedByShield, phased } from '../rules.js';

export default {
  id: 'undo', name: 'Ctrl+Z', col: '#7c6cff',
  short: 'rewinds the car ahead',
  desc: 'Undoes the last 1.25 s of the car directly ahead: they snap back to where they were, and slower.',
  odds: { front: [12, 5], back: [12, 4], last: [12, 3] }, pack: 0.5,   // a fight with the car just ahead, not a catch-up
  // fired; return true to keep holding it (charges left)
  use(race, c, sorted) {
    const t = sorted.filter(o => o !== c && !o.finished && o.rank < c.rank).pop() || null;
    if (!t) { c.boost = 1.0; race.fxBoost(c); return; }   // nobody ahead: a nitro instead
    if (blockedByShield(race, t) || phased(t)) { race.fxFizzle(c); return; }
    const h = t.hist && t.hist[Math.max(0, t.hist.length - 25)];   // 1.25 s back
    if (h) {
      race.fxRingIn(t.x, t.y, '#7c6cff', 70, 0.45, 6); race.fxSparks(t.x, t.y, 8, '#b3a8ff', 140); for (let k = 0; k < 8; k++) { const f = k / 7; race.fxStars(lerp(t.x, h.x, f), lerp(t.y, h.y, f), 1, '#7c6cff', 30, 0.7); }
      Object.assign(t, { x: h.x, y: h.y, s: h.s, lat: h.lat, heading: h.heading, lap: h.lap, lapStart: h.lapStart, prevLat: h.lat, lineS: h.lat, T: h.T || t.T }); t.speed *= 0.65; t.hist = []; t.kCmd = 0;
      t.progress = race.progressOf(t); race.fxRing(t.x, t.y, '#7c6cff', 60, 0.5, 6); race.fxFlash(t.x, t.y, '#d6d0ff', 36, 0.15); race.sound('use_undo', t, 0.7); race.feed('hit', 'undo', c, t);
    }
  },
  // a bot holding it: fire now?
  wantUse(race, c, sorted) {
    const ahead = sorted[c.rank - 2];
    if (!ahead) return c.itemT > 2; const ds = ahead.progress - c.progress; return (ds > 0 && ds < 700) || c.itemT > 4;
  },
};
