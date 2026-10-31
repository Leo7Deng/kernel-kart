// Kernel Panic: stalls every other car, ahead and behind (the user's call).
import { blockedByShield, phased } from '../rules.js';

export default {
  id: 'panic', name: 'Kernel Panic', col: '#ff1744',
  short: 'stalls every other car',
  desc: 'Every other car on the track stalls for a moment, ahead of you or behind, and you drive straight through the stalled ones. Firewalls block it.',
  odds: { back: [5, 9], last: [9, 11] },   // a stall for every other car: it's worth most with a lot of them ahead
  // fired; return true to keep holding it (charges left)
  use(race, c) {
    race.zap = { t: 0.7, col: '#ff1744' }; race.shakeAll(0.7);   // a red flash over the screen, and a lightning bolt onto every other car
    let n = 0;
    for (const o of race.cars) {
      if (o === c || o.finished || phased(o)) continue;
      if (blockedByShield(race, o)) { race.fxStrike(o.x, o.y); continue; }   // the bolt still lands, on the shield
      o.stall = 1.02; o.stallBy = c; race.fxHit(o, '#ff4d6d', 'panic'); n++;   // stallBy: you drive straight through them (collideCars)
    }
    race.fxBolts(c.x, c.y, 5, '#ff4d6d', 44);
    if (n) race.feed('panic', 'panic', c, null, n);
  },
  // a bot holding it: fire now?
  wantUse(race, c) {
    return c.itemT > 1 + c.ai.noise * 2;
  },
};
