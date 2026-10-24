// Fast-Forward: autopilot rocket, 2.15 s.

export const FF_T = 2.15;   // how long it lasts (fx.js fades its look in and out against this)

export default {
  id: 'ff', name: 'Fast-Forward', col: '#00b8d4',
  short: 'autopilot rocket, 2.15 s',
  desc: 'Last place only, mostly far back. 2.15 s on autopilot down the middle of the road at huge speed: you can\'t go off, nothing can hurt you, and anyone you touch gets knocked aside.',
  odds: { last: { from: 0.35, w: [11, 19] } },   // the biggest jump in the game: only once you're properly behind (~1100 units, ~3 s), then straight to a good chance
  // fired: what happens. Return true to keep holding it (more charges left).
  use(race, c) {
    // Fast-Forward: autopilot down the middle of the road, flat out, untouchable (the steering and hits are in race.js)
    c.ff = FF_T; c.skx = c.sky = 0; race.fxFF(c); race.shakeAll(0.4);   // the launch burst (fx.js); the look while it lasts is drawn from c.ff
  },
  // a bot holding it: fire now?
  wantUse(race, c) {
    return c.itemT > 0.4;
  },
};
