// malloc: your kart grows huge and heavy for 4 s, tanks every hit (items break on it) and squashes anyone it runs over.
import { frnd } from '../core.js';
import { straightAhead } from '../race-ai.js';
import { untouchable } from '../rules.js';

// how big (×length and width), how heavy (× weight), for how long, and its top speed (a giant is 2% quicker). Nothing
// hurts a giant (hazards skip it, items break on it: rules.js), so it's kept in check by being short and only a touch faster, a squash that doesn't
// stop you long, and a wider kart running out of road sooner (the run-off starts at the kart's edge)
export const GROW_K = 1.75, GROW_WEIGHT = 3, GROW_T = 4, GROW_TOP = 1.02;
// and extra grip: being 1.75× wider leaves it less road for its line, so without this it steered like a barge
export const GROW_GRIP = 1.3;
// a squashed kart: this long flat, at this fraction of its top speed
export const SQUISH_T = 2.0, SQUISH_TOP = 0.5, SQUISH_STALL = 0.8;
// big enough to squash with (it takes ~0.3 s to grow)
export const isGiant = c => c.growK > 1.35;

export default {
  id: 'grow', name: 'malloc', col: '#ff5c8a',
  short: 'giant kart that tanks hits and squashes, 4 s',
  desc: 'Allocates a giant kart for 4 s: much bigger, three times as heavy, a touch faster and grippier, and you tank everything (items that hit you break on you), so you shove everyone aside, any kart you touch is squashed flat and slowed, and you roll right over it. Being huge makes the road feel narrow.',
  odds: { front: [5, 5], back: [10, 7], last: [10, 9] },   // only a little faster: the squash needs karts around you
  // fired: what happens. Return true to keep holding it (more charges left).
  use(race, c) {
    c.grow = GROW_T;
    race.fxRing(c.x, c.y, this.col, 90, 0.5, 8); race.fxStars(c.x, c.y, 10, '#ffd1dc', 160);
    for (let k = 0; k < 6; k++) race.fxPuff(c.x + frnd(-25, 25), c.y + frnd(-25, 25), '#ffffff', frnd(10, 16), 0.6, frnd(-60, 60), frnd(-60, 60));
    race.fxDebris(c.x, c.y, 14, 0, 0, ['#ff5c8a', '#ffd1dc', '#c2185b']);   // memory cells flying out as the block is claimed
    race.jolt(c, 0.35);
  },
  // a bot holding it: fire now?
  wantUse(race, c) {
    for (const o of race.cars) {                    // someone just ahead: go and squash them
      if (o === c || o.finished || untouchable(o) || o.shield > 0) continue;
      const r = race.rel(c, o); if (r.ds > 20 && r.ds < 260 && Math.abs(r.lat - c.lat) < 90) return true;
    }
    return (straightAhead(c) && c.itemT > 1.5) || c.itemT > 6;
  },
  // every frame: grow in over ~0.3 s, shrink back as it runs out; size and weight follow
  tick(race, c, dt) {
    const was = c.grow > 0; c.grow -= dt;
    if (was && c.grow <= 0) { race.fxRing(c.x, c.y, this.col, 60, 0.35, 5); race.fxDebris(c.x, c.y, 16, 0, 0, ['#ff5c8a', '#ffd1dc', '#c2185b']); race.sound('shrink', c); }   // free(): the block shatters
    const want = c.grow > 0 ? GROW_K : 1; c.growK += (want - c.growK) * (1 - Math.exp(-10 * dt)); if (Math.abs(want - c.growK) < 0.002) c.growK = want;
    const f = (c.growK - 1) / (GROW_K - 1);
    c.L = c.L0 * c.growK; c.W = c.W0 * c.growK; c.weight = c.weight0 * (1 + (GROW_WEIGHT - 1) * f);
    if (isGiant(c) && c.speed > 60) {               // stomping along: a puff and a thud every so often
      c.stompT = (c.stompT || 0) - dt;
      if (c.stompT <= 0) { c.stompT = 0.32; const bx = c.x - Math.cos(c.heading) * c.L * 0.4, by = c.y - Math.sin(c.heading) * c.L * 0.4; race.fxPuff(bx, by, '#ffffff', frnd(9, 13), 0.5); race.particles.push({ kind: 'ring', x: bx, y: by, vx: 0, vy: 0, col: 'rgba(255,92,138,0.6)', r1: 40, w: 4, life: 0.3, maxLife: 0.3 }); race.sound('stomp', c, 0.6); }
    }
  },
  // giant r ran into v: v is squashed flat
  squish(race, r, v) {
    v.squished = SQUISH_T; v.squishedBy = r; v.pinned = SQUISH_STALL; v.speed = 0; v.skx = v.sky = 0; v.hitCd = 2;   // flattened: stopped dead, then crawling; the giant rolls on over it (collideCars)
    race.fxHit(v, this.col, 'squish'); race.feed('hit', 'grow', r, v);
  },
};
