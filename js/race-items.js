// Kernel Kart: firing items. What each one does is in its own module in items/.
import { projectToTrack } from './geometry.js';
import { ITEMS, gapK, placeChances, rollItem } from './items/index.js';


export function dropBehind(c, r, o) {
  const d = c.L / 2 + r + 6, x = c.x - Math.cos(c.heading) * d, y = c.y - Math.sin(c.heading) * d;
  const pr = projectToTrack(c.T, x, y, c.s);
  return Object.assign(o, { x, y, s: pr.s, lat: pr.lat, T: c.T });   // (T: its route on a course, for drawing it on or under a bridge)
}
// fire the item car c is holding (sorted: the cars in race order)
export function useItem(c, sorted) {
  this.fxUse(c, c.item);
  if (ITEMS[c.item].use(this, c, sorted)) return;   // still holding it (more charges)
  this.nextItem(c);
}
// car c's item is gone: the one in reserve moves up
export function nextItem(c) {
  c.item = c.item2; c.item2 = null; c.itemT = 0; c.charges = c.item ? 1 : 0;
}
// car c drove through an item box (or its Thread clone did): roll it an item from its place and how far it trails the
// leader, into its free hand (sorted: the cars in race order; leader: the first one still racing). gold: a jackpot's
// golden box, which spins its slot machine instead and rolls from the same table (race-jackpot.js)
export function giveItem(c, sorted, leader, gold = false) {
  const gap = leader ? leader.progress - c.progress : 0, second = sorted.find(o => o !== c && !o.finished);
  const lead = c === leader && second ? gapK(c.progress - second.progress, this.packMode) : 0;   // how far 1st is clear of 2nd
  const tab = placeChances(c.rank, this.cars.length, gapK(gap, this.packMode), { pack: this.packMode, lead });
  if (gold) { this.jackpotSpin(c, () => rollItem(tab, c.rng)); return; }
  const it = rollItem(tab, c.rng);
  if (c.item) c.item2 = it; else { c.item = it; c.itemT = 0; c.charges = 1; }
}
