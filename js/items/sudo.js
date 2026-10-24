// sudo: super grip, and whoever you hit is knocked flying, 4 s.
import { straightAhead } from '../race-ai.js';
import { untouchable } from '../rules.js';

export default {
  id: 'sudo', name: 'sudo', col: '#f2a516',
  short: 'super grip, and you send flying whoever you hit, 4 s',
  desc: 'Root access, 4 s: huge grip, so you take corners flat out, and you don\'t move over for anyone. Run into another kart and it\'s knocked flying, often right off the road. A Firewall saves them; a Ghost or Fast-Forward can\'t be touched.',
  odds: { lead: 7, front: [8, 6], back: [10, 6], last: [10, 4] },   // flat-out corners help anywhere; the ram needs karts nearby
  // fired: what happens. Return true to keep holding it (more charges left).
  use(race, c) {
    c.sudo = 4; race.fxSudo(c);
  },
  // a bot holding it: fire now?
  wantUse(race, c) {
    for (const o of race.cars) {                    // someone just ahead on our line: ram them
      if (o === c || o.finished || untouchable(o) || o.shield > 0) continue;
      const r = race.rel(c, o); if (r.ds > 20 && r.ds < 200 && Math.abs(r.lat - c.lat) < 70) return true;
    }
    return (!straightAhead(c) && c.itemT > 0.5) || c.itemT > 6;
  },
};
