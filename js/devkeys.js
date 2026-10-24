// Kernel Kart: a hidden key for trying the secret shortcuts (race-secret.js). S in an offline race with one human player
// puts that kart on the lap whose road the secret is on, a little before it, on a Turbo and heading for it, so you ride
// into it yourself: the phoenix at Pyth Plateau's Pyramid of the Sun (lap 3), the mine on Cron Canyon. The user asked
// for it to see the ride without having to earn it. Nothing in race.js knows about it, and it never runs online, in a
// time trial, or with two or more players at the screen (S isn't a player key with one player: Q and W are).
import { trackSample } from './geometry.js';
import { game } from './ui.js';

export function devTeleport(r) {
  if (!r || r.net || r.tt || !r.started) return false;
  const humans = r.cars.filter(c => c.human); if (humans.length !== 1) return false;
  const c = humans[0]; if (c.finished || c.secretT > 0) return false;
  for (let lap = r.laps; lap >= 1; lap--) {   // the last lap whose road has it (Pyth Plateau: lap 3)
    const R = r.routeFor(lap), z = R.mech && R.mech.secrets && R.mech.secrets[0]; if (!z) continue;
    const s = Math.max(0, z.sIn - Math.max(z.fire || 400, 300) - 150), A = trackSample(R, s);
    c.lap = lap; c.T = R; c.s = s; c.lat = c.prevLat = c.lineS = 0; c.x = A.x; c.y = A.y;
    c.heading = Math.atan2(A.ty, A.tx); c.air = 0; c.spinT = 0; c.off = false; c.skx = c.sky = 0;
    c.boost = 1.5; c.turbo = 1.5; c.speed = c.top * 1.1;   // a Turbo, just fired
    c.progress = r.progressOf(c);
    return true;
  }
  return false;
}

export function initDevKeys() {
  addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 's' || e.repeat || game.state !== 'race' || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
    if (devTeleport(game.race)) e.preventDefault();
  });
}
