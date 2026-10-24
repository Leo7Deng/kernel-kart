// Kernel Kart: who an effect can touch. One place for the rules every hazard, item and the run-off share.

// Ghost (phased out), Fast-Forward (on autopilot), a malloc giant, a kart going round an Infinite Loop and one on a secret ride can't be hit by any hazard: projectiles, mines, slicks, bots,
// trains, Ctrl+Z, Kernel Panic. Car-vs-car and Mega Ducks have their own rules (see collideCars and updateHazards).
export const untouchable = c => phased(c) || c.grow > 0;   // grow: a malloc giant
// what items pass straight through: a ghost, a fast-forward, a kart up an Infinite Loop. Not a malloc giant: it tanks them
// (a duck, a mine, a slick, a bubble... hits it and breaks, blockedByShield, and the giant rolls on).
export const phased = c => c.ghost > 0 || c.ff > 0 || c.loopT > 0 || c.secretT > 0 || c.sweptT > 0 || c.flyT > 0;   // flyT: in a rocket or a capsule (race-rocket.js); loopT: up an Infinite Loop; secretT: away on a secret shortcut (race-secret.js); sweptT: down a torrent (race-cliff.js)
// the run-off bleeds speed and grip, except for a ghost or an overclocked kart (it's driving across it on purpose)
export const grassSlows = c => c.off && c.ghost <= 0 && c.oc <= 0 && !(c.grow > 0);   // nor a malloc giant
// a Firewall soaks up one hit: true if it did (and it's gone, in a shatter of glass). A malloc giant shrugs off every
// hit that reaches it this way (an item, a sudo ram, a Fast-Forward), which breaks on it, and stays big.
export function blockedByShield(race, c) {
  if (c.grow > 0 && c.shield <= 0) { race.fxBlock(c); return true; }
  if (c.shield <= 0) return false;
  c.shield = 0; race.fxBlock(c);
  return true;
}
// C++'s vulnerability (undefined behaviour): whatever knocks a kart out (a spin, a freeze, a bubble, a stall, oil, a squash,
// a pin) wears off `fragile` times slower for a racer that has it (CHARACTERS in core.js). The one place it applies:
// the timers in updateCar count down by this instead of dt. Everyone else's is exactly dt (x / 1 is x).
export const shakeOff = (c, dt) => dt / (c.ch.fragile || 1);
