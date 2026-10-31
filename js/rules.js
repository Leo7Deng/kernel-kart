// Kernel Kart: who an effect can touch. One place for the rules every hazard, item and the run-off share.

// No hazard (projectile, mine, slick, bot, train, Ctrl+Z, Panic) touches a phased kart or a malloc giant.
// Car-vs-car and Mega Ducks have their own rules (collideCars, updateHazards).
export const untouchable = c => phased(c) || c.grow > 0;   // grow: a malloc giant
// items pass straight through these; a malloc giant isn't phased, it tanks them (blockedByShield)
export const phased = c => c.ghost > 0 || c.ff > 0 || c.loopT > 0 || c.secretT > 0 || c.sweptT > 0 || c.flyT > 0;   // flyT: in a rocket or a capsule (race-rocket.js); loopT: up an Infinite Loop; secretT: away on a secret shortcut (race-secret.js); sweptT: down a torrent (race-cliff.js)
// the run-off bleeds speed and grip, except for a ghost or an overclocked kart
export const grassSlows = c => c.off && c.ghost <= 0 && c.oc <= 0 && !(c.grow > 0);   // nor a malloc giant
// true if a Firewall soaked the hit (and is used up); a malloc giant soaks every hit and stays big
export function blockedByShield(race, c) {
  if (c.grow > 0 && c.shield <= 0) { race.fxBlock(c); return true; }
  if (c.shield <= 0) return false;
  c.shield = 0; race.fxBlock(c);
  return true;
}
// C++'s undefined behaviour: knock-out timers (spin, freeze, bubble, stall...) wear off `fragile` times slower.
// updateCar counts them down by this instead of dt; for everyone else it's exactly dt.
export const shakeOff = (c, dt) => dt / (c.ch.fragile || 1);
