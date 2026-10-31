// Dev key for the secret shortcuts (race-secret.js; the user asked to see the ride without earning it): S in an offline
// race with one human puts the kart just before the secret on its lap, on a Turbo. race.js knows nothing of it; never
// online, in a time trial, or with 2+ players.
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
