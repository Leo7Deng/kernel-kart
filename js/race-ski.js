// Kernel Kart: Gradient Descent, the ski run (`ski` in the track definition). A point-to-point course down a mountain,
// with real heights (race-elevation.js), where you can't really slow down: lifting bleeds speed off at `liftK` of the
// usual rate (race.js, race-ai.js), gravity keeps pulling, and only the air holds you back (DRAG past TERM of your top
// speed). On it (each a zone along the run, M.zones):
//   - Fields (`glades`): the piste opens into a huge snowfield laid along one long, gentle bend, clumps of pines all over
//     it with lanes between them (GLADE), as thick round the outside of the bend as round the inside, and trees by both
//     edges: no line through it misses them, and neither side is a free pass. Where you are across it is set by your
//     drift, not picked by the game: you're too fast to hold the bend, so off the drift you're swept toward its outside
//     (lifting barely helps), and a drift (toward the inside) carves you in; your line swings over smoothly as you press
//     and let go (FIELD), and nothing steers for you. The inside is the shorter way round, the outside longer and less
//     thick. Hidden ways (an inside, a middle and an outside one) are kept clear, for the bots to aim for. At its foot the
//     field funnels back into the piste (the track's widths) and your line runs in along its edge. With drift off,
//     lifting carves you in. Trees are solid: touch one and you crash (a spin, most of your speed gone). Bots look ahead
//     (forestPlan), aiming for a way by skill.
//   - The forest (`kind: 'forest'`, the Black Forest): the same drift-in, swept-out line, but trees from edge to edge on
//     a grid, sparse enough to thread, and lifting nearly holds your line.
//   - Whichever way a drift takes you is drawn (art/ski.js skiUnder): in a field both ways your line can go from here,
//     an arrowhead at each end, the drift's marked; in the slalom and the park an arrow on the side a drift carves to.
//   - The Slalom (`slalom`): a long run of poles down the piste, red and blue in turn, each a little to one side of the
//     middle, in a rhythm of its own (a steady run, a tight pair, a long delay gate, an offset pair, a wide one...): your
//     kart goes round the outside of each (a swerve to the next spot, one way only: drift left, right, left, the carve
//     the swerve's way). Clip a pole and it knocks you (POLE_KEEP of your speed); come past one on the wrong side (too
//     fast to get across in time) and you've missed the gate (MISS_KEEP).
//   - The Moguls (`moguls`): bumps laid out evenly down the piste in a staggered grid, no lane straight down it: you
//     weave between them with the drift, as in a field (drift off: the usual line). Run over a bump over MOG_V of your
//     top speed and it launches you (in the air, shoved off its side, tumbling, a big share of your speed and a moment's
//     grip gone); let go of the gas just before it (MOG_TIME) and your legs soften it. Under it you just roll over.
//   - The splits (`park`, `ledge`): the piste widens and an island splits it into the piste and a lane of its own on one
//     side. Hold the drift key as you cross the commit line (sLock, SPLIT.LOCK before the nose: flags across the piste,
//     art/ski.js) and you take the lane, don't and you stay on the piste (with drift off: lift under `vIn` of your top
//     speed); a bot decides once, by skill. The Park: a funbox (a kicker), a box to slide (hold the drift key across it),
//     the halfpipe (side to side, wall to wall, an air off each: pump it, drifting the way you swing, PUMP) and a big
//     kicker: let go of the gas right at a lip for a trick and you're popped on (PARK_POP, more for each in a row:
//     PARK_CHAIN) and in the flow (PARK_FLOW: the air doesn't hold you back); land one without and you scrub speed
//     (PARK_LAND) and the chain starts again: ridden well it beats the piste by 1-2 s, sloppily it's slower. The Ledge: a shelf barely wider than a kart round
//     the inside of a big bend (shorter than the piste round the outside), a rock wall on the uphill side and a sheer drop
//     on the other. It runs out round spurs of the cliff, a sharp turn at each tip (lift a touch), and the shelf leans
//     out (at speed it pushes you toward the edge: CAMBER). Run off the edge and you fall: back to the start of the shelf,
//     from a standstill. Scrape the wall and it slows you. The piste round the outside has a kicker line (`kickers`:
//     tricks pop you, KICK_POP; land one without and you scrub, KICK_LAND): tricked clean, about as quick as the Ledge.
// The Big Air's flips are race-cliff.js's (FLIP); their boost is carried here (c.skiRush: the air doesn't hold you back).
// No race state: everything is built once per track (T.mech.ski); a kart carries its own way through (c.skiW: the spot
// it came from and the one it's going to; in a field or the moguls its line across it, c.skiFL/skiFM), which lane it
// took at a split (c.skiLane), the zone it's in (c.skiZ, c.skiF), a moment's loose grip off a bump (c.skiLoose) and
// whether the race has drift off (c.skiNoDrift). A track without `ski` never gets here.
import { LIFT_DECEL, STEP, TAU, clamp, lerp, mulberry } from './core.js';
import { curvAt, halfWAt, trackSample } from './geometry.js';
import { G_SLOPE, elevAt } from './race-elevation.js';
import { nearestS } from './race-mechanics.js';
import { DRIFT } from './race-drift.js';
import { blockedByShield, untouchable } from './rules.js';

const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

export const SKI = {
  TERM: 1.3,        // past this share of your top speed the air holds you back...
  DRAG: 0.9,        // ...this hard (per second, of the speed over it)
  CARVE: 1.27,      // a drift the way the swerve turns: its grip × this (on top of the drift's own 1.5)...
  SLIDE: 0.3,       // ...the other way: × this
  KEEP: 0.32,       // into a tree: the speed you keep...
  SPIN: 0.55,       // ...and how long you spin
  SWERVE: 560,      // the widest swerve from one spot to the next that's kept clear
  WIDE: 26,         // trees keep this far off a corridor (past the kart's half-width, the widest kart's)
  POLE_KEEP: 0.75,  // a slalom pole clipped: the speed you keep
  MISS_KEEP: 0.45,  // a gate missed
  MOG_V: 0.85,      // the moguls: a bump under you over this share of your top speed (on the gas) throws you...
  MOG_LIFT: 1.08,   // ...off the gas, this much more
  MOG_HIT: [0.7, 0.35],   // a bump's under you within its radius x this + your width x this of its middle
  MOG_SCRUB: [0.3, 1.2, 0.62],   // a bump hit too fast: this share of your speed scrubbed, and this much more per share you're over (at most the last)...
  MOG_AIR: [0.3, 0.8, 0.62],     // ...launched for this long (and this much more per share over, at most the last)...
  MOG_SHOVE: 330,   // ...a shove off its side (this x (the share you're over + 0.25), at most 0.65; speed, decaying)...
  MOG_SPIN: 0.4,    // ...a tumble...
  MOG_LOOSE: 0.7,   // ...and for this long after it you grip...
  MOG_GRIP: 0.75,   // ...this much
  MOG_TIME: 0.3,    // let go of the gas this soon before a bump and your legs soak it: a smaller throw...
  MOG_ABSORB: 0.12, // ...that scrubs this share of your speed, a short hop and a third of the shove, no tumble
  MOG_ROW: 230, MOG_ACROSS: 160,   // the bumps' rows this far apart down the run, the bumps this far apart across (each row offset by half)
  MOG_LIP: 5, MOG_PEAK: 0.3,   // (the art: a hop starts at a bump's top, this high, and peaks this high: render.js jumpPose)
  PARK_LAND: 0.76,  // a park landing without a trick: the speed you keep (and the flow's gone)...
  PARK_POP: 1.42,   // ...with one, you're popped to at least this share of your top speed, and this much more for each trick (or
  PARK_CHAIN: 0.07, // the box) in a row before it (PARK_CHAIN_MAX at most: a miss starts the chain again)...
  PARK_CHAIN_MAX: 5,
  PARK_ADD: 0.08, PARK_CAP: 1.85,   // (a trick adds at least this to what you carried in, up to this)
  PARK_FLOW: 1.3,   // ...and you're in the flow for this long (seconds): the air doesn't hold you back (c.skiRush)
  PARK_BOOST: 1.0,
  GRIND: 1.0,       // a box slid all the way (drift held): a boost this long and the flow from GRIND_POP of your top speed
  GRIND_POP: 1.42,
  PUMP: 0.6,       // the halfpipe: drifting the way the line's swinging (down each wall) pumps you on at this share of your top speed a second...
  PUMP_MAX: 1.7,    // ...up to this (the air not holding you back while you pump)...
  PUMP_STRAIN: 1.6, // ...and the drift strains this much less a second (a pump is short: one swing)
  PUMP_DRAG: 0.3,  // not pumping (or drifting against the swing) on the pipe's walls scrubs this share of your speed a second
  KICK_POP: 1.36, KICK_BOOST: 0, KICK_LAND: 0.8,   // the kicker line round the Ledge: a trick pops you to this share of your top speed and this long a boost; without one you keep this
  CAMBER: 400,      // the Ledge leans out: pushes you toward the drop at this × (speed / top - 0.9) a second
  LEDGE_GRIP: 0.9,  // ...and its packed shelf grips this much
  KICK: 1.2,        // the rock wall, hit fast: kicks you out toward the edge at this × your speed over 0.95 of your top
  FALL_SPIN: 1.1,   // off the Ledge: how long you're down...
  FALL_BACK: 600,   // ...and how far back up the run you climb onto the piste
};

// ---------------------------------------------------------------- building
// glades: [{ at: [x, y], to: [x, y] (layout units: where the trees start and end), kind?: 'glade' | 'forest',
//   every?: how far apart the rows of ways are, seed? }]
// slalom: { at, to, every (the poles' spacing), pole (each pole's offset from the middle), pass (the line's) }
// moguls: { at, to }
// park / ledge: { at: [x, y] (the island's nose), to: [x, y] (where it ends), side (+1 / -1: the lane's side, as lat),
//   lane (its width), island (the island's width), vIn (lift under this share of your top speed to take it), decide }
export function buildSki(T) {
  const d = T.def.ski; if (!d) return null;
  const sc = T.def.scale || 1;
  const sAt = p => nearestS(T, p[0] * sc, p[1] * sc);
  const zones = [], ramps = [];
  (d.glades || []).forEach((g, gi) => zones.push(buildField(T, g, sAt, mulberry(T.N * 31 + gi * 977 + (g.seed || 0)))));
  if (d.slalom) zones.push(buildSlalom(T, d.slalom, sAt));
  if (d.moguls) zones.push(buildMoguls(T, d.moguls, sAt, ramps));
  let park = null, ledge = null;
  if (d.park) zones.push(park = buildSplit(T, 'park', d.park, sAt));
  if (d.ledge) zones.push(ledge = buildSplit(T, 'ledge', d.ledge, sAt));
  if (park) parkFeatures(T, park, ramps);
  if (ledge && d.ledge.kickers) pisteKickers(T, ledge, d.ledge.kickers, ramps);
  for (const z of zones) z.trees.sort((a, b) => a.s - b.s);
  zones.sort((a, b) => a.s0 - b.s0);
  const avoid = zones.flatMap(z => { const o = []; for (let s = z.s0; s <= z.s1; s += 250) o.push(s); return o; });
  return { zones, park, ledge, avoid, ramps };
}
function addTree(T, z, s, lat, r, clump) {
  const q = trackSample(T, s);
  z.trees.push({ s, lat, r, x: q.x + q.nx * lat, y: q.y + q.ny * lat, c: clump });
}
// ---------------------------------------------------------------- the fields
// A field lies along a long, gentle bend, the snowfield ~6x the piste's width. Where you are across it is yours, set by
// the drift button, not picked by the game: the bend's too fast to hold at your speed, so off the drift you're swept
// toward its outside (OUT, all of it from V1 of your top speed; lifting barely helps: LIFT), and a drift toward its
// inside carves you in (IN at a full drift); your line's slope follows that (EASE) and it moves you across smoothly.
// Nothing steers for you: your line is only your drift against the sweep (with drift off in a glade or the forest,
// lifting carves you in instead). The Pine Glade (GLADE): clumps of pines with lanes between them all over the field,
// as big and as close together round the outside of the bend (the longer way) as round the inside (the shorter way:
// round five the outside was gappier, and nearly bare, GLADE.U, TILT), and trees by both edges, so there's no line
// through it that doesn't have to dodge. Three hidden ways (z.ways: an inside, a middle and an outside one, each in a band of its
// own, GLADE.WAYS, laid out as drift on and off at NOM's slopes) are kept clear so
// there's always a way and the bots know one; nothing draws or follows them for a player. At its foot the field narrows
// back to the piste over a long funnel (the track's widths) with the trees in it, and your line runs along its edge
export const FIELD = {
  OUT: 0.34, V0: 0.5, V1: 1.1, LIFT: 0.75, IN: 0.42, EASE: 7,
  K: 1 / 600,        // the bend a drift feels in a field (race-drift.js: its side, the inside; and it's a corner, not a straight)
  EDGE: 30,          // the line keeps this far inside the field's edges
  NOM: [0.34, 0.27], // the ways: laid out drifting in at this slope and swept out at this one (a kart can do a little more)
  WS: 20,            // (a way's samples, this far apart)
};
export const GLADE = {
  ROW: 190, ACROSS: 165,   // clumps on a jittered grid this far apart, along and across...
  P: [0.5, 0.95],          // ...at this share of its spots (and as big, as close together), at U on this scale...
  U: 0.72, TILT: 0,        // ...the same right across (round five it ran from 0 at the outside edge to 1 at the inside one: the outside was bare)
  GAP: 80,                 // room between two clumps (the widest kart, 48, and a margin)
  EDGE: 8,                 // trees as close to the field's edges as this...
  BY_EDGE: 330,            // ...and one by each edge about this often
  CLEAR: 14,               // the ways kept clear by this past the widest kart's half-width (SKI.WIDE)
  WAYS: [[0.45, 0.92], [-0.22, 0.22], [-0.92, -0.45]],   // the three ways' bands (shares of the half-width, + toward the inside)
};
// the line across each kind of field (as FIELD's): the Pine Glade's; the forest's (nothing kept open round its outside, so
// the sweep is the same but lifting nearly holds your line, LIFT, and the line runs right up to its edges, EDGE); the
// Moguls' (a narrower piste: gentler both ways)
export const KINDS = {
  glade: FIELD,
  forest: { ...FIELD, OUT: 0.36, IN: 0.42, LIFT: 0.4, EDGE: 30, V0: 0.2, V1: 0.8 },
  moguls: { ...FIELD, OUT: 0.3, IN: 0.36, LIFT: 0.75, EDGE: 34 },
};
// The forest (`kind: 'forest'`): a stretch you can't go round. Trees all the way across, right up to its edges, so a kart
// swept out to the edge (never drifting) or held in against the other (drifting all the way) runs into them; nothing is
// kept open and nothing steers you: your line is only your drift (and the gas) against the sweep. Two hidden ways
// through are kept clear (so there's always a way, and the bots know one), and any two trees have room for a kart between
// them, so there are many more
export const FOREST = {
  STEP: 100,        // trees on a jittered grid this far apart, along and across...
  P: 0.5,           // ...at this share of its spots
  GAP: 76,          // room between any two (the widest kart, 48, and a margin)
  EDGE: 14,         // as close to the field's edges as this (a kart riding the edge doesn't get a free run)
  CLEAR: 10,        // the two ways kept clear by this past the widest kart's half-width (SKI.WIDE)
  NOM: [0.3, 0.27], // the ways laid out drifting in at this slope and swept out at this one
};
// how steeply car c's line wants to move across a field (+: toward the inside, × z.ins for lat), from its speed, the gas
// and its drift. In the forest with drift off (c.skiNoDrift, the race's), lifting carves you in instead
function fieldSlope(c, z, drifting) {
  const F = z.F, out = -F.OUT * smooth(F.V0, F.V1, c.speed / c.top) * (c.gas ? 1 : F.LIFT);
  if (z.kind !== 'moguls' && c.skiNoDrift) return c.gas ? out : F.IN;
  if (!(c.dAmt > 0) || !drifting) return out;
  return c.dSide === z.ins ? lerp(out, F.IN, c.dAmt) : out * (1 + 0.5 * c.dAmt);   // (a drift the wrong way: swept out faster)
}
// the bend's inside over s0..s1 (+1 / -1, as lat)
const insideOf = (T, s0, s1) => { let k = 0; for (let s = s0; s < s1; s += 20) k += T.curv[Math.min(T.N - 1, Math.floor(s / STEP))]; return Math.sign(k) || 1; };
function buildField(T, g, sAt, rng) {
  const t0 = sAt(g.at), t1 = sAt(g.to), forest = g.kind === 'forest';
  const z = { kind: forest ? 'forest' : 'glade', F: forest ? KINDS.forest : KINDS.glade, field: true, ins: insideOf(T, t0, t1), s0: t0 - 900, sF: t0 - 500, s1: t1 + 650, t0, t1, trees: [], walls: [], ways: [], outLat: 0, band: s => { const hw = halfWAt(T, s); return [-hw, hw]; } };
  const U = s => halfWAt(T, s) - z.F.EDGE;
  if (forest) {
    z.ways.push(layWay(T, z, s => -U(s) * 0.15, s => U(s) * 0.9, rng, FOREST.NOM), layWay(T, z, s => -U(s) * 0.9, s => U(s) * 0.15, rng, FOREST.NOM, 0.5));
    plantForest(T, z, rng);
  } else {
    const B = GLADE.WAYS;   // (an inside, a middle and an outside way, each in a band of its own: well apart, so they don't make one wide clear lane)
    z.ways.push(layWay(T, z, s => U(s) * B[0][0], s => U(s) * B[0][1], rng, FIELD.NOM, 0), layWay(T, z, s => U(s) * B[1][0], s => U(s) * B[1][1], rng, FIELD.NOM, 0.5), layWay(T, z, s => U(s) * B[2][0], s => U(s) * B[2][1], rng, FIELD.NOM, 1));
    plantGlade(T, z, rng);
  }
  return z;
}
// a way through: drift in and out at nom's slopes for a random while each (in a band across the field: lo..hi, as + the
// inside; starting swept out, or `out` of the time drifting in), the line's slope easing as a kart's does at about the
// speed it's taken at. Kept as lats every WS from z.sF
function layWay(T, z, lo, hi, rng, nom = FIELD.NOM, out = 0) {
  const WS = FIELD.WS, n = Math.ceil((z.t1 + 300 - z.sF) / WS) + 1, lat = new Float32Array(n), e = 1 - Math.exp(-FIELD.EASE * WS / 520);
  let u = 0, m = 0, on = out ? rng() >= out : true, seg = 200 + rng() * 200;
  for (let i = 0; i < n; i++) {
    const s = z.sF + i * WS, L = lo(s), H = hi(s);
    if (on && u >= H) { on = false; seg = 140 + rng() * 260; } else if (!on && u <= L) { on = true; seg = 140 + rng() * 260; }
    else if (seg <= 0) { on = !on; seg = 140 + rng() * 260; }
    m += ((on ? nom[0] : -nom[1]) - m) * e; u += m * WS; seg -= WS;
    const Uf = halfWAt(T, s) - z.F.EDGE - SKI.WIDE; u = clamp(u, -Uf, Uf);   // (in the field: down its funnel too)
    lat[i] = u * z.ins;
  }
  return { s0: z.sF, lat };
}
// the forest's trees: on a jittered grid from edge to edge, off its two ways, with room to pass between any two
function plantForest(T, z, rng) {
  const F = FOREST, sA = z.t0, sB = z.t1;
  const size = () => { const u = rng(); return u < 0.25 ? 12 + rng() * 4 : u < 0.85 ? 16 + rng() * 6 : 22 + rng() * 5; };
  const near = (s, lat, r) => { for (const t of z.trees) if (Math.abs(t.s - s) < 160 && Math.hypot(t.s - s, t.lat - lat) < t.r + r + F.GAP) return true; return false; };
  for (let s = sA; s < sB; s += F.STEP) {
    const hw = halfWAt(T, s);
    for (let lat = -hw + F.EDGE + rng() * F.STEP * 0.6; lat < hw - F.EDGE; lat += F.STEP * (0.8 + rng() * 0.4)) {
      if (rng() > F.P) continue;
      const r = size(), ts = s + (rng() - 0.5) * F.STEP * 0.8, B = halfWAt(T, ts) - F.EDGE - r * 0.4, tl = clamp(lat + (rng() - 0.5) * F.STEP * 0.4, -B, B);
      if (ts < sA || ts > sB) continue;
      let clear = true; for (const W of z.ways) for (const ds of [-40, -20, 0, 20, 40]) if (Math.abs(wayLat(W, ts + ds) - tl) < r + SKI.WIDE + F.CLEAR) clear = false;
      if (clear && !near(ts, tl, r)) addTree(T, z, ts, tl, r, -1);
    }
  }
}
export const wayLat = (W, s) => { const f = clamp((s - W.s0) / FIELD.WS, 0, W.lat.length - 1), i = Math.floor(f), j = Math.min(W.lat.length - 1, i + 1); return W.lat[i] + (W.lat[j] - W.lat[i]) * (f - i); };
// the clean way from spot a (or any point) to spot b: a smooth swerve, no sideways speed at either end
export const corrLat = (a, b, s) => { const u = clamp((s - a.s) / Math.max(1, b.s - a.s), 0, 1); return a.lat + (b.lat - a.lat) * (1 - Math.cos(Math.PI * u)) / 2; };
// the Pine Glade's trees: in clumps (two to six close together, too tight to pass between) on a jittered grid over the
// whole field, lanes between the clumps (GAP: room for the widest kart and a margin), the clumps as big and as close
// together right across (GLADE.U; TILT would make them thicker toward the inside); a tree now and then right by each
// edge (so riding the edge, never drifting or drifting all the way, runs into them); off the three ways (z.ways)
function plantGlade(T, z, rng) {
  const ins = z.ins, sA = z.t0, sB = z.t1, G = GLADE;
  const size = u => { const v = rng(); return v < 0.25 ? 13 + rng() * 5 : v < 0.8 ? 17 + rng() * 6 + u * 3 : 24 + rng() * 7; };
  const near = (s, lat, r, gap, k) => { for (const t of z.trees) if (Math.abs(t.s - s) < 160 && t.c !== k && Math.hypot(t.s - s, t.lat - lat) < t.r + r + gap) return true; return false; };
  const ok = (s, lat, r, k) => {
    if (s < sA || s > sB || Math.abs(lat) > halfWAt(T, s) - G.EDGE - r * 0.4) return false;
    for (const W of z.ways) for (const ds of [-36, -12, 12, 36]) if (Math.abs(wayLat(W, s + ds) - lat) < r + SKI.WIDE + G.CLEAR) return false;
    return !near(s, lat, r, G.GAP, k);
  };
  const inside = (s, lat) => { const U = halfWAt(T, s); return clamp((lat * ins + U) / (2 * U), 0, 1); };   // 0 the outside edge .. 1 the inside one
  let k = 0;
  for (let s = sA + rng() * G.ROW * 0.4; s < sB; s += G.ROW * (0.8 + rng() * 0.4)) {
    const hw = halfWAt(T, s);
    for (let lat = -hw + G.EDGE + rng() * G.ACROSS * 0.5; lat < hw - G.EDGE; lat += G.ACROSS * (0.8 + rng() * 0.4)) {
      const u = G.U + (inside(s, lat) - 0.5) * G.TILT; if (rng() > lerp(G.P[0], G.P[1], u)) continue;   // (as thick on both sides: TILT 0)
      const cs = s + (rng() - 0.5) * G.ROW * 0.5, cl = lat + (rng() - 0.5) * G.ACROSS * 0.4, n = 2 + Math.floor(rng() * (2 + 3 * u)), spread = 16 + 20 * u; k++;
      for (let j = 0; j < n; j++) {
        const an = rng() * Math.PI * 2, rr = j ? spread * (0.6 + 0.6 * rng()) : 0, r = size(u), ts = cs + Math.cos(an) * rr, tl = cl + Math.sin(an) * rr;
        if (ok(ts, tl, r, k) && !z.trees.some(t => t.c === k && Math.hypot(t.s - ts, t.lat - tl) < Math.max(t.r, r) * 0.7)) addTree(T, z, ts, tl, r, k);   // (in a clump they can overlap, not stand in one spot)
      }
    }
  }
  for (const sd of [-1, 1]) for (let s = sA + rng() * G.BY_EDGE; s < sB; s += G.BY_EDGE * (0.7 + 0.6 * rng())) {   // by the edges
    const r = size(0.5), tl = sd * (halfWAt(T, s) - G.EDGE - r * 0.4 - rng() * 24); k++;
    if (ok(s, tl, r, -1)) addTree(T, z, s, tl, r, k);
  }
}
// the Slalom: rows of one spot each, alternating sides, a pole on the inside of each turn. gates: [the gap before it,
// how far out the line passes it, the weave's middle there (0 if left out)], from `at` down the run; the pole stands
// POLE_IN inside the line
const POLE_IN = 48;
function buildSlalom(T, p, sAt) {
  const s0 = sAt(p.at), z = { kind: 'slalom', s0: s0 - 300, t0: s0, trees: [], walls: [], outLat: 0, band: s => { const hw = halfWAt(T, s); return [-hw, hw]; } };
  let last = null, sd = 1, s = s0;
  p.gates.forEach(([gap, pass, mid = 0], k) => {
    s += gap;
    const g = { s, lat: mid + sd * pass, half: 40, pole: mid + sd * (pass - POLE_IN), sd, next: [] };
    if (last) last.next = [g];
    z.walls.push({ s, gaps: [g] });
    z.trees.push({ ...poleAt(T, s, g.pole), r: 6, pole: true, sd, k });
    last = g; sd = -sd;
  });
  z.t1 = s; z.s1 = s + 400;
  return z;
}
const poleAt = (T, s, lat) => { const q = trackSample(T, s); return { s, lat, x: q.x + q.nx * lat, y: q.y + q.ny * lat }; };
// the Moguls: bumps evenly laid out over the piste in a staggered grid (rows MOG_ROW apart down the run, MOG_ACROSS apart
// across, each row offset by half from the last, as a real mogul field), to its edges: no lane runs straight down it,
// so the clean line weaves, round a bump in one row and between two in the next. Your line across it is the drift's, as
// in a field (z.F: KINDS.moguls). z.ways is just the middle (a bot's look ahead heads back toward it). Each bump is also
// a ramp for the art (own: not drawn, just the pose of a kart hopping off it: render.js jumpPose takes its lip and peak)
function buildMoguls(T, p, sAt, ramps) {
  const t0 = sAt(p.at), t1 = sAt(p.to), rng = mulberry(T.N * 7 + 11), bumps = [];
  const z = { kind: 'moguls', field: true, F: KINDS.moguls, ins: insideOf(T, t0, t1), s0: t0 - 450, sF: t0 - 200, t0, t1, s1: t1 + 300, trees: [], walls: [], ways: [], bumps, outLat: 0, band: s => { const hw = halfWAt(T, s); return [-hw, hw]; } };
  z.ways.push({ s0: z.sF, lat: new Float32Array(Math.ceil((z.t1 + 300 - z.sF) / FIELD.WS) + 1) });
  for (let s = t0 + 40, row = 0; s <= t1; s += SKI.MOG_ROW, row++) {
    const hw = halfWAt(T, s), sp = SKI.MOG_ACROSS;
    for (let lat = -hw + 38 + (row % 2) * sp / 2; lat < hw - 22; lat += sp) {
      const l = lat + (rng() - 0.5) * 8, r = 27 + rng() * 3, bs = s + (rng() - 0.5) * 8;
      bumps.push({ ...poleAt(T, bs, l), r });
    }
  }
  bumps.sort((a, b) => a.s - b.s);
  for (const b of bumps) ramps.push({ s: b.s, len: 1e-3, H: SKI.MOG_LIP, peak: SKI.MOG_PEAK, own: true, hop: true, cannon: false, moon: false, mid: b.lat, half: b.r, lat0: b.lat - b.r, lat1: b.lat + b.r });
  return z;
}
// a split: the piste and a lane of its own on `side`, an island between them from the nose (sN) to the end (sE)
function buildSplit(T, kind, p, sAt) {
  const sN = sAt(p.at), side = p.side, hwN = halfWAt(T, sN + 300);
  let sE = sAt(p.to); while (sE > sN + 400 && halfWAt(T, sE + 120) < hwN - 4) sE -= 20;   // (it ends before the piste narrows again)
  const z = { kind, split: true, s0: sN - (p.decide || 800), sDec: sN - (p.decide || 800), sLock: sN - SPLIT.LOCK, sN, sE, s1: sE + 250, t0: sN, t1: sE, side, laneW: p.lane, islandW: p.island,
    vIn: p.vIn, trees: [], walls: [], outLat: 0, wig: null };
  if (kind === 'ledge') ledgeShape(T, z);
  // the lanes, as lat across the piste (each × side: + toward the lane's own edge): `edge` the lane's outer edge (the
  // Ledge: the drop), `mid` its middle, `in` its inner edge (the wall), `far` the island's other side (the piste's edge)
  z.lane = s => {
    const hw = halfWAt(T, s), w = z.wig ? wigAt(z, s) : null, o = kind === 'ledge' ? w.v + p.lane / 2 : hw - 6;
    const nose = clamp((s - sN) / 160, 0, 1), isl = p.island * (0.25 + 0.75 * Math.sqrt(nose));
    return { edge: side * o, mid: side * (o - p.lane / 2), in: side * (o - p.lane), far: side * ((kind === 'ledge' ? LEDGE_IN + p.lane / 2 : hw - 6) - p.lane - isl), m: w ? w.m * side : 0, k: w ? w.k * side : 0 };
  };
  z.band = s => { const L = z.lane(Math.max(s, sN)), hw = halfWAt(T, s); return side > 0 ? [-hw, L.far - 8] : [L.far + 8, hw]; };
  return z;
}
// the Ledge's shape: a shelf straight across the cliff face (CHORD of the way to the straight line between its ends,
// while the piste swings round the outside of the bend), eased in and out, and out round spurs of the cliff on the way:
// each a gentle swing out toward the drop (SPUR_LG long), a sharp turn back at its tip (SPUR_LT), and a gentle swing
// in (SPUR_LG). Kept as the lane's middle (v, × side: + toward the drop), its slope (m) and its bend (k) on a grid of
// STEP*2 from its start
const LEDGE_IN = 80, CHORD = 0.75, SPUR_A = 0.065, SPUR_LG = 450, SPUR_LT = 150, EASE = 260;
function ledgeShape(T, z) {
  const side = z.side, h = STEP * 2, a = z.sN, b = z.sE, n = Math.ceil((b - a) / h) + 1, len = b - a;
  const P = s => { const q = trackSample(T, s); return q; };
  const A = P(a + 150), B = P(b - 150), ax = A.x + A.nx * side * LEDGE_IN, ay = A.y + A.ny * side * LEDGE_IN, dx = B.x + B.nx * side * LEDGE_IN - ax, dy = B.y + B.ny * side * LEDGE_IN - ay;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {   // the straight line's offset from LEDGE_IN, toward the drop
    const s = a + i * h, q = P(s), px = q.x + q.nx * side * LEDGE_IN - ax, py = q.y + q.ny * side * LEDGE_IN - ay, cn = dx * q.ny * side - dy * q.nx * side;
    raw[i] = s < a + 150 || s > b - 150 || Math.abs(cn) < 1e-6 ? 0 : Math.max(0, -(dx * py - dy * px) / cn) * CHORD;
  }
  let V = raw; const box = (X, w) => { const Y = new Float32Array(n), k = Math.round(w / h); for (let i = 0; i < n; i++) { let t = 0; for (let j = i - k; j <= i + k; j++) if (j >= 0 && j < n) t += X[j]; Y[i] = t / (2 * k + 1); } return Y; };   // (past the ends: 0, as there)
  V = box(box(V, EASE), EASE);   // (eased in and out: a smooth shelf)
  const spurs = len > 1900 ? [0.3, 0.7] : [0.5], sp = new Float32Array(n);
  const kAt = s => { let k = 0; for (const f of spurs) { const c = a + f * len, d = s - c; if (Math.abs(d) < SPUR_LT / 2) k -= 2 * SPUR_A / SPUR_LT; else if (Math.abs(d) < SPUR_LT / 2 + SPUR_LG) k += SPUR_A / SPUR_LG; } return k; };
  { let v = 0, m = 0, s = a; const dd = 0.25; for (let i = 0; i < n; i++) { const sg = a + i * h; while (s < sg) { const k = kAt(s + dd / 2); v += (m + k * dd / 2) * dd; m += k * dd; s += dd; } sp[i] = v; } }
  const Vt = new Float32Array(n), M = new Float32Array(n), K = new Float32Array(n);
  for (let i = 0; i < n; i++) Vt[i] = LEDGE_IN + V[i] + sp[i];
  for (let i = 0; i < n; i++) { const p = Vt[Math.max(0, i - 1)], q = Vt[Math.min(n - 1, i + 1)]; M[i] = (q - p) / (2 * h); K[i] = i > 0 && i < n - 1 ? (q - 2 * Vt[i] + p) / (h * h) : 0; }
  z.wig = { a, n, V: Vt, M, K, spurs: spurs.map(f => a + f * len), max: Math.max(...Vt) };
}
function wigAt(z, s) {
  const W = z.wig, f = clamp((s - W.a) / (STEP * 2), 0, W.n - 1), i = Math.floor(f), j = Math.min(W.n - 1, i + 1), t = f - i;
  return { v: W.V[i] + (W.V[j] - W.V[i]) * t, m: W.M[i] + (W.M[j] - W.M[i]) * t, k: W.K[i] + (W.K[j] - W.K[i]) * t };
}
// the Park's features down its lane (as rows of one spot each, so the kart's line weaves through them the way it does
// through the trees): the funbox (a kicker), the box, the halfpipe's walls (an air off each, side to side) and the big
// kicker. Kickers are ramps across part of the lane (art/track.js rampsOf draws them and poses the karts on them); a
// halfpipe wall is a ramp too, for the pose only (art/ski.js draws the pipe)
export const PARK = { KICK: 200, BOX: [580, 710], PIPE: [840, 2300], WALLS: [1000, 1540, 2080], WALL_A: 48, BIG: 2480, END: 2740, WALL_FLY: 190 };
function parkFeatures(T, z, ramps) {
  const L = s => z.lane(s), sN = z.sN, side = z.side, rows = [];
  const row = (s, lat, f) => { const g = { s, lat, half: 40, f, next: [] }; if (rows.length) rows[rows.length - 1].gaps[0].next = [g]; rows.push({ s, gaps: [g] }); return g; };
  const kick = (s, half, big) => { const m = L(s).mid; row(s, m, big ? 'big' : 'kick'); ramps.push({ s, len: big ? 110 : 84, H: big ? 22 : 15, cannon: false, moon: false, mid: m, half, lat0: m - half, lat1: m + half }); };
  kick(sN + PARK.KICK, 46, false);
  row(sN + PARK.BOX[0], L(sN + PARK.BOX[0]).mid, 'box0'); row(sN + PARK.BOX[1], L(sN + PARK.BOX[1]).mid, 'box1');
  PARK.WALLS.forEach((d, i) => {
    const s = sN + d, m = L(s).mid, sd = i % 2 ? 1 : -1, lat = m + sd * PARK.WALL_A;
    row(s, lat, 'wall').sd = sd;
    const l0 = Math.min(lat - sd * 30, lat + sd * 70), l1 = Math.max(lat - sd * 30, lat + sd * 70);
    ramps.push({ s, len: 150, H: 30, cannon: false, moon: false, own: true, mid: (l0 + l1) / 2, half: (l1 - l0) / 2, lat0: l0, lat1: l1 });
  });
  kick(sN + PARK.BIG, 60, true);
  z.walls = rows; z.outLat = 0;   // (out of it back toward the middle: the corner into the Big Air's inrun is just after)
  z.sE = sN + PARK.END; z.t1 = z.sE; z.s1 = z.sE + 250;
}

// ---------------------------------------------------------------- the way through
const zoneAt = (M, s) => { for (const z of M.zones) if (s >= z.s0 && s <= z.s1) return z; return null; };
const lowS = (A, s) => { let lo = 0, hi = A.length; while (lo < hi) { const m = (lo + hi) >> 1; if (A[m].s < s) lo = m + 1; else hi = m; } return lo; };
// how hard a swerve from a to b bends at its hardest (lat''; less what the room in b would let it cut, a share cut of it)
export function swerveK(a, b, W, cut = 0) {
  const room = cut * Math.max(0, (b.half || 0) - W / 2 - 12), dl = Math.max(0, Math.abs(b.lat - a.lat) - room), D = Math.max(60, b.s - a.s);
  return dl / 2 * (Math.PI / D) ** 2;
}
// the grip the kart turns with toward + lat (dir 1) or - lat: a drift carves its own way, slides the other
function gripTo(c, dir) {
  let G = c.grip;
  if (c.dAmt > 0 && c.dSide) G *= dir === c.dSide ? 1 + (1.5 * SKI.CARVE - 1) * c.dAmt : 1 - (1 - 1.5 * SKI.SLIDE) * c.dAmt;
  return G;
}
// the fastest the kart can swerve from a to b (and then on to the best spot after it)
function wayV(c, z, a, b, wi, G0) {
  const k = swerveK(a, b, c.W), dir = Math.sign(b.lat - a.lat) || 1, v1 = Math.sqrt((G0 || gripTo(c, dir)) / Math.max(k, 1e-7));
  let v2 = 1e4; const N = z.walls[wi + 1];
  if (N && b.next && b.next.length) { v2 = 0; for (const h of b.next) v2 = Math.max(v2, Math.sqrt((G0 || c.grip) / Math.max(swerveK(b, h, c.W), 1e-7))); }
  return Math.min(v1, v2 * 1.15);
}
// passing a spot (or coming into the slalom or the park): the next spot to make for (the one it can swerve to fastest,
// and of two about as quick, the nearer: every row there has one). G0: plan with this grip instead
export function skiPick(c, z, from, wi, G0) {
  const W = z.walls[wi]; if (!W) return null;
  let best = null, bv = -1;
  const next = from.gw >= 0 ? z.walls[from.gw].gaps[from.gi].next : null;
  W.gaps.forEach((g, gi) => {
    if (next && next.length && !next.includes(g)) return;   // (from a spot: only the ways kept clear from it)
    const v = wayV(c, z, from, g, wi, G0) * (1 - Math.abs(g.lat - from.lat) / 6000);
    if (v > bv) { bv = v; best = { to: gapOf(g, wi, gi), v }; }
  });
  return best;
}
// a spot as a kart keeps it (plain numbers, so the race goes online as is): where it is, and which row and spot it is
const gapOf = (g, w, i) => ({ s: g.s, lat: g.lat, half: g.half, gw: w, gi: i });
// the zone car c is in (c.skiZ: its index + 1, or 0)
export const zoneOf = c => c.skiZ ? c.T.mech.ski.zones[c.skiZ - 1] : null;
// where car c is going in zone z: c.skiW = { wi (the next row), a (from), b (the spot: gapOf) }, worked out again as it
// passes each row; past the last, back to the zone's way out. After a flight (the Park) the swerve starts where it lands
function wayOf(race, c, z) {
  let W = c.skiW;
  if (!W || W.z !== z.t0) {   // into the field: from here, to a spot in the first row ahead
    let wi = 0; while (wi < z.walls.length && z.walls[wi].s < c.s + 60) wi++;
    W = c.skiW = { z: z.t0, wi, a: { s: c.s, lat: c.lat, half: 0, gw: -1, gi: -1 }, b: null, out: null, air: false };
    const p = wi < z.walls.length ? skiPick(c, z, W.a, wi) : null; W.b = p ? p.to : null;
  }
  if (c.air > 0) W.air = true;
  else if (W.air) { W.air = false; W.a = { s: c.s, lat: c.lat, half: 0, gw: W.a.gw, gi: W.a.gi }; }   // (landed: on from here)
  if (W.b && c.s > W.b.s + 4) {   // past the spot it was making for: the next one, from there
    const wi = W.wi + 1, a = W.b;
    W.wi = wi; W.a = a; const p = wi < z.walls.length ? skiPick(c, z, a, wi) : null; W.b = p ? p.to : null;
  }
  if (!W.b) {   // past the last row: out to the zone's way out
    if (!W.out) W.out = { s: Math.max(z.t1 + 350, c.s + 400), lat: z.outLat };
    return { a: W.a, b: W.out };
  }
  return { a: W.a, b: W.b };
}

// ---------------------------------------------------------------- per car
// a split: set for its lane? A player: slow enough as you come to the nose (lift into it), with a little hysteresis;
// committed from sLock. A bot: what it decided (skiAI).
function laneWant(c, z) {
  if (!c.human) return c.ai.skiLane === z.t0;
  if (!c.skiNoDrift) return !!c.dHeld;   // (drift on: holding the drift key as you cross the commit line takes the lane, letting go the piste)
  return c.speed < z.vIn * c.top * (c.skiLane === z.kind ? 1.06 : 1);
}
// the split's commit line: this far before the island's nose (the flags across the piste, art/ski.js), and the
// shortest swerve over to a lane from wherever the kart changed its mind
export const SPLIT = { LOCK: 260, SWERVE: 300 };
// steer along a path across the piste: pl its lat here, m its slope and k its bend a little ahead. Set straight onto the
// kart's line as the point race.js's steering needs to drive the path's bend from where the kart is and how it's heading
// (it steers by 2/60 of its heading error and 2/60² of its distance off its line), with a pull back onto the path
function steer(c, pl, m, k, w, tgt) {
  const q = trackSample(c.T, c.s + 12), f = Math.max(0.3, 1 - q.k * c.lat); k /= f * f;   // (a path's bend off the middle of a bend: lat'' / (1 - k lat)²)
  const hx = Math.cos(c.heading), hy = Math.sin(c.heading), along = Math.max(0.2, hx * q.tx + hy * q.ty), mk = (hx * q.nx + hy * q.ny) / along;
  const kDes = k / (1 + m * m) ** 1.5 + clamp(pl - c.lat, -80, 80) * 2 / (70 * 70) + clamp(m - mk, -1, 1) * 2 / 70;   // (the path's bend, and back onto it)
  let eH = Math.atan2(q.ty, q.tx) - c.heading; while (eH > Math.PI) eH -= 2 * Math.PI; while (eH < -Math.PI) eH += 2 * Math.PI;
  const lat = c.lat + clamp((kDes - (Math.abs(eH) > Math.PI / 2 ? Math.sign(eH) : Math.sin(eH)) / 30) * 1800, -150, 150);
  c.lineS = lerp(c.lineS === undefined ? lat : c.lineS, lat, w); c.lineSet = c.lineWide = w > 0.5;   // (lineWide: race.js lets this line ask for a harder turn than usual)
  return lerp(tgt, lat, w);
}
// the steering's line (race-mechanics.js mechLine): in a field of trees, the slalom or the park, the swerve to the next
// spot; on the Ledge, the shelf; on the piste beside a split, the usual line kept off the island
export function skiLine(c, tgt) {
  const M = c.T.mech.ski; if (!M) return tgt;
  const z = zoneAt(M, c.s); if (!z || c.off || c.finished || !this.started) { c.skiZ = 0; c.skiW = null; c.skiF = false; return tgt; }
  c.skiZ = M.zones.indexOf(z) + 1; c.skiF = !!z.field; c.skiNoDrift = !this.drift;
  if (z.kind === 'moguls' && !this.drift) { c.skiW = null; return tgt; }   // (the moguls with drift off: the usual line; you pick your speed and time your lifts)
  if (z.field) { c.skiW = null; return fieldLine(c, z, tgt); }
  if (z.split) {
    const L = z.lane(Math.max(c.s, z.sN)), side = z.side;
    if (c.skiDecZ !== z.t0 && c.s < z.sDec + 60) { c.skiDecZ = z.t0; c.skiDecLat = c.lat; c.skiDecS = z.sDec; }   // (where it was as it came to decide)
    if (c.s < z.sLock) {
      const was = c.skiLane; c.skiLane = laneWant(c, z) ? z.kind : 'piste';
      if (was !== c.skiLane && c.skiDecZ === z.t0 && c.s > z.sDec) { c.skiDecLat = c.lat; c.skiDecS = c.s; }   // (a change of mind: the swerve over starts from here)
    }
    else if (c.s > z.sN && c.s < z.sE) c.skiLane = (c.lat - (L.in + L.far) / 2) * side > 0 ? z.kind : 'piste';   // (past the nose: whichever side of the island it's on)
    const w = smooth(z.sDec, z.sDec + 420, c.s) * (1 - smooth(z.s1 - 200, z.s1, c.s));
    if (c.skiLane === 'piste') {   // the piste: deciding, toward its middle; past the nose, the usual line off the island
      c.skiW = null; c.lineSet = true;   // (its own line: no bot wandering onto the island)
      const hw = halfWAt(c.T, c.s), B = c.s > z.sE ? [-hw + c.W * 0.7, hw - c.W * 0.7] : side > 0 ? [-hw + c.W * 0.7, L.far - c.W * 1.1] : [L.far + c.W * 1.1, hw - c.W * 0.7];   // (past the island: the whole piste)
      if (c.s < z.sN) return lerp(tgt, clamp(lerp(tgt, (B[0] + B[1]) / 2, 0.6), B[0], B[1]), w);
      return lerp(tgt, clamp(tgt, B[0], B[1]), w);
    }
    if (z.kind === 'ledge' || c.s < z.sN + 60) {   // deciding: over into the lane (a swerve from where it was), then along it
      c.skiW = null;
      const s2 = c.s + clamp(c.speed * 0.08, 0, 50);
      const own = c.skiDecZ === z.t0, a = { s: own ? c.skiDecS : z.sDec, lat: own ? c.skiDecLat : c.lat }, b = { s: Math.max(z.sN - 100, a.s + SPLIT.SWERVE), lat: L.mid };
      if (c.s < b.s || (z.kind === 'park' && c.s < z.sN + 60)) {
        const D = b.s - a.s, u = clamp((s2 - a.s) / D, 0, 1), dl = (b.lat - a.lat) / 2;
        return steer(c, corrLat(a, b, c.s), dl * Math.PI / D * Math.sin(Math.PI * u), dl * (Math.PI / D) ** 2 * Math.cos(Math.PI * u), w, tgt);
      }
      const L2 = z.lane(s2);
      return steer(c, L.mid, L2.m, L2.k, w, tgt);
    }
  }
  const { a, b } = wayOf(this, c, z), w = z.split ? 1 : smooth(z.s0, z.s0 + 220, c.s) * (1 - smooth(z.s1 - 200, z.s1, c.s));
  const s = c.s + clamp(c.speed * 0.08, 0, 50), D = Math.max(60, b.s - a.s), u = clamp((s - a.s) / D, 0, 1), dl = (b.lat - a.lat) / 2;
  return steer(c, corrLat(a, b, c.s), dl * Math.PI / D * Math.sin(Math.PI * u), dl * (Math.PI / D) ** 2 * Math.cos(Math.PI * u), w, tgt);
}
// how fast the field's edge comes in (-) or goes out (+) at s (its half-width's slope: down a funnel)
const edgeSlope = (T, s) => (halfWAt(T, s + 100) - halfWAt(T, s + 20)) / 80;   // (a little ahead: the line turns in as the edge does)
// how far across the field its line can go at s (to EDGE off its edges, and more down a funnel, where it lags the edge)
const fieldU = (T, s, F) => halfWAt(T, s) - F.EDGE + Math.min(0, edgeSlope(T, s)) * 90;
// a field: car c's own line across it (c.skiFL, as lat; its slope c.skiFM; c.skiFS where it was last worked out, c.skiFZ
// the field), moved on by how far it's come at the slope its speed, gas and drift ask for (fieldSlope, eased), kept in
// the field and near the kart (a tree or a bump can knock it off its line), and handed to race.js's steering; against an
// edge it runs along it (in down a funnel). Past the trees it eases back onto the usual line
function fieldLine(c, z, tgt) {
  const ins = z.ins, F = z.F;
  if (c.s < z.sF) { c.skiFZ = 0; return lerp(tgt, 0, smooth(z.s0, z.s0 + 250, c.s)); }   // (coming into it: down the middle, where the sweep starts)
  if (c.skiFZ !== z.t0) { c.skiFZ = z.t0; c.skiFL = c.lat; c.skiFM = 0; c.skiFS = c.s; }
  const ds = clamp(c.s - c.skiFS, 0, 80); c.skiFS = c.s;
  let mt = c.s > z.t1 ? 0 : fieldSlope(c, z, c.dOn) * ins;
  c.skiFM += (mt - c.skiFM) * (1 - Math.exp(-F.EASE * ds / Math.max(c.speed, 60)));
  const U = fieldU(c.T, c.s, F), dU = edgeSlope(c.T, c.s);
  c.skiFL = clamp(c.lat, -U, U);
  if (c.lat >= U - 2 && c.skiFM > dU) c.skiFM = dU; else if (c.lat <= -U + 2 && c.skiFM < -dU) c.skiFM = -dU;   // (against the edge: along it, in down a funnel)
  const w = 1 - smooth(z.t1, z.s1, c.s);
  return steer(c, c.skiFL, c.skiFM, 0, w, tgt);
}
// ...and the kart's heading set to that slope across the road (skiCar, after it moves), so it goes where the line says
// with no lag of its own (it isn't steering round anything: the drift is)
function fieldHeading(c, z, dt) {
  const w = smooth(z.sF, z.sF + 220, c.s) * (1 - smooth(z.t1, z.s1, c.s)); if (w <= 0) return;
  const q = trackSample(c.T, c.s), m = c.skiFM, th = Math.atan2(q.ty + m * q.ny, q.tx + m * q.nx);
  let e = th - c.heading; while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI;
  c.heading += e * w * (1 - Math.exp(-14 * dt));
}
// where car c's line across field z goes from here (the art's lines, and a bot's look ahead in the forest): n points dt
// seconds apart (at its speed now), if from now on the drift is held while hold(t) says so (t: seconds from now; or
// null: it keeps doing what it's doing). In the forest with drift off, hold is lifting. The drift builds and lets go
// as race-drift.js's does
export function fieldRun(c, z, hold, n, dt) {
  const st = runFrom(c, z), out = [];
  for (let i = 0; i < n && st.s < z.t1 + 200; i++) { runStep(c, z, st, hold ? hold(i * dt) : st.lift ? !c.gas : c.dOn, dt, !hold); out.push({ s: st.s, lat: st.L }); }
  return out;
}
// (fieldRun's state: the line, its slope, the drift's build-up, how far down the run; and one step of it)
// (k: the slope the kart's really heading at: it turns onto the line's, fieldHeading)
const runFrom = (c, z) => {
  const F = z.F, on = c.skiFZ === z.t0, q = trackSample(c.T, c.s), hx = Math.cos(c.heading), hy = Math.sin(c.heading), al = Math.max(0.2, hx * q.tx + hy * q.ty);
  return { L: c.lat, m: on ? c.skiFM : 0, k: clamp((hx * q.nx + hy * q.ny) / al, -1, 1), a: c.dAmt || 0, s: c.s, v: Math.max(c.speed, 60), sw: smooth(F.V0, F.V1, c.speed / c.top), lift: z.kind !== 'moguls' && c.skiNoDrift };
};
function runStep(c, z, st, h, dt, asIs) {
  const F = z.F; let mt;
  if (st.lift) { mt = h ? F.IN : -F.OUT * st.sw; if (h) st.v = Math.max(60, st.v - LIFT_DECEL(st.v) * (c.T.def.liftK || 1) * dt); }   // (lifting slows you a little)
  else {
    const on = h && (c.dOn || (st.v >= DRIFT.MIN_V && !c.dLock)), out0 = -F.OUT * st.sw * (c.gas ? 1 : F.LIFT);
    st.a = on ? Math.min(1, st.a + DRIFT.BUILD * dt) : 0;
    mt = !on ? out0 : asIs && c.dSide !== z.ins ? out0 * (1 + 0.5 * st.a) : lerp(out0, F.IN, st.a);   // (as is, a drift the wrong way: swept out faster)
  }
  st.m += (mt * z.ins - st.m) * (1 - Math.exp(-F.EASE * dt));
  const U = fieldU(c.T, st.s, F);
  { const dU = edgeSlope(c.T, st.s); if (st.L >= U - 2 && st.m > dU) st.m = dU; else if (st.L <= -U + 2 && st.m < -dU) st.m = -dU; }
  st.k += (st.m - st.k) * (1 - Math.exp(-14 * dt));
  const ds = st.v * dt; st.L = clamp(st.L + st.k * ds, -U - 8, U + 8); st.s += ds;
}
// the drift button's view of the swerve (race-drift.js): how hard the way on bends at s, on top of the piste's own bends;
// in a field, the bend a drift feels there (FIELD.K, toward its inside)
export function skiK(c, s) {
  if (c.skiZ && c.skiFZ && c.T.mech && c.T.mech.ski) { const z = zoneOf(c); if (z && z.field) return c.skiFZ === z.t0 && s <= z.t1 + 100 ? FIELD.K * z.ins : 0; }
  if (c.skiZ && !c.skiNoDrift && c.T.mech && c.T.mech.ski) {   // coming up to a split: a drift goes toward the lane (it's what takes you there). Only from a little ahead, so it picks the side and charges as on a straight
    const z = zoneOf(c); if (z && z.split && c.s < z.sLock + 40) return s > c.s + 100 && s < z.sN ? z.side / 600 : 0;
  }
  const W = c.skiW; if (!W || !c.skiZ || !c.T.mech || !c.T.mech.ski) return 0;   // (skiZ: in a zone)
  const b = W.b || W.out; if (!b || s > b.s) return 0;
  const a = W.a, D = Math.max(60, b.s - a.s), u = clamp((s - a.s) / D, 0, 1);
  return (b.lat - a.lat) / 2 * (Math.PI / D) ** 2 * Math.cos(Math.PI * u);
}
// the swerve car c is on (for the art: its path in the snow), or null
export const skiWay = c => c.skiW && c.skiZ ? { a: c.skiW.a, b: c.skiW.b || c.skiW.out } : null;
// grip (race-mechanics.js mechGrip): a drift on a swerve carves the way it turns and slides the other way; the moguls
// over their speed and the Ledge's shelf grip less
export function skiGrip(c) {
  const M = c.T.mech.ski; if (!M) return 1;
  let g = 1;
  if (c.skiW && c.dAmt > 0 && c.dSide) {
    const k = (skiK(c, c.s) + skiK(c, c.s + 30)) / 2;
    if (Math.abs(k) > 1 / 6000) g *= k * c.dSide > 0 ? 1 + (SKI.CARVE - 1) * c.dAmt : 1 - (1 - SKI.SLIDE) * c.dAmt;
  }
  if (c.skiLoose > 0) g *= SKI.MOG_GRIP;   // (just thrown about by a bump)
  if (c.skiLane === 'ledge' && c.skiZ && zoneOf(c).kind === 'ledge') g *= SKI.LEDGE_GRIP;
  return g;
}
const mogV = c => c.top * SKI.MOG_V * (c.gas ? 1 : SKI.MOG_LIFT);

// one car, one frame (race-mechanics.js mechCar): the air holding you back, the trees and poles, the moguls, the park's
// features, the Ledge's edge and wall
export function skiCar(c, dt) {
  const T = c.T, M = T.mech.ski; if (!M) return;
  c.lineSet = c.lineWide = false;
  const prevS = c.skiPS === undefined ? c.s : c.skiPS; c.skiPS = c.s;
  if (!this.started) return;
  // the air: past TERM of your top speed it holds you back (on the ground, nothing else holding your speed)
  if (c.skiRush > 0) {   // the Big Air's flips (race-cliff.js FLIP) and the Park's flow: carried at their speed, easing back, the air not holding you back; a crash ends it
    if (c.air <= 0 || !c.skiFlow) c.skiRush -= dt;   // (the Park's flow holds while you're in the air off a feature)
    if (c.spinT > 0 || c.frozen > 0 || c.bubbled > 0) c.skiRush = 0;
    else if (c.air <= 0 && !c.skiFlow) c.speed = Math.max(c.speed, lerp(c.top * 1.2, c.skiRushV, clamp(c.skiRush / c.skiRush0, 0, 1)));   // (the Park's flow: no floor, just no air holding you back)
  }
  const pumping = c.skiPump; c.skiPump = false;   // (pumping the halfpipe last frame: pipePump)
  if (c.skiFlow && c.skiRush > 0 && M.park && (c.s > M.park.sE + 150 || c.s < M.park.sN)) c.skiRush = 0;   // (the Park's flow ends with the park: you lift for the corner after it as usual)
  if (c.air <= 0 && c.ff <= 0 && !(c.oc > 0 && c.ocT) && c.frozen <= 0 && c.bubbled <= 0 && !(c.skiRush > 0) && !pumping) {
    const vT = c.top * SKI.TERM; if (c.speed > vT) c.speed -= (c.speed - vT) * SKI.DRAG * dt;
  }
  const z = zoneAt(M, c.s);
  c.hazNear = false;
  for (const q of M.zones) if (q.s0 - c.s < 900 && c.s < q.s1) c.hazNear = true;   // (keeps a bot's boosts off: race-ai.js)
  c.skiMog = !!(z && z.kind === 'moguls');
  if (c.skiLoose > 0) c.skiLoose -= dt;
  if (c.skiAir === 'kick' && c.air > 0 && c.air <= dt * 1.01) c.trick = false;   // (the kicker line's trick pays its own pop, below, not race.js's trick boost: cleared the frame before it lands)
  if (c.skiAir && c.air <= 0) {   // down off a park feature: a trick pops you on (on top of race.js's boost); without one you scrub speed
    const kick = c.skiAir === 'kick';   // (off the kicker line round the Ledge: its own pop and scrub)
    if (c.skiTrick) {
      if (kick) { c.speed = Math.max(c.speed, c.top * SKI.KICK_POP); c.boost = Math.max(c.boost, SKI.KICK_BOOST); }
      else { parkFlow(c, SKI.PARK_POP); c.boost = Math.max(c.boost, SKI.PARK_BOOST); }   // (the Park: popped on, more for each in a row, and in the flow)
      c.skiLandT = this.time; c.skiLandOk = 1; c.skiTricksLanded = (c.skiTricksLanded || 0) + 1;
    } else { c.speed *= kick ? SKI.KICK_LAND : SKI.PARK_LAND; if (!kick) { c.skiRush = 0; c.skiStreak = 0; } c.skiLandT = this.time; c.skiLandOk = 0; }
    c.skiAir = false;
  }
  if (c.skiHop) {   // a mogul hop: carried round the piste's bend as you fly (it's only a hop: you don't run wide off it)
    if (c.air > 0) c.heading += curvAt(T, c.s) * c.speed * dt; else c.skiHop = false;
  }
  if (c.finished || c.air > 0 || untouchable(c) || (c.oc > 0 && c.ocT)) return;
  if (!z) { c.skiStuck = 0; return; }
  if (z.kind === 'park' && c.s < z.sN) { c.skiStreak = 0; c.skiGrinds0 = c.skiGrinds; }   // (into the Park: a new chain)
  if (z.split) { if (splitCar(this, c, z, dt)) return; }
  if (z.kind === 'moguls') { if (c.skiFZ === z.t0 && c.spinT <= 0) fieldHeading(c, z, dt); mogulCar(this, c, z, prevS); return; }
  if (z.kind === 'slalom') { slalomCar(this, c, z, prevS, dt); return; }
  if (z.field && c.skiFZ === z.t0 && c.spinT <= 0 && c.skiZ) fieldHeading(c, z, dt);
  // wedged against the trees (slow and not getting anywhere): you pick yourself up and walk round to the nearest clear
  // spot a moment later (a kart can't back up)
  if (c.speed < 120 && c.touchT > 0) c.skiStuck = (c.skiStuck || 0) + dt; else c.skiStuck = Math.max(0, (c.skiStuck || 0) - dt);
  c.touchT = (c.touchT || 0) - dt;
  if (c.skiStuck > 1.2) { unstick(this, c, z); return; }
  if ((c.treeCd = (c.treeCd || 0) - dt) > 0) return;
  const t = touching(c, z.trees); if (!t) return;
  if (c.speed < 110) { c.speed *= 0.9; return; }   // (nudging it slowly: just held off it)
  c.treeCd = 0.45;
  if (blockedByShield(this, c)) { c.speed *= 0.8; return; }   // a Firewall (or a malloc giant) shrugs it off
  c.speed *= SKI.KEEP; c.spinT = Math.max(c.spinT, SKI.SPIN); c.hitCd = Math.max(c.hitCd, 0.6); c.kCmd = 0; c.skx = t.nx * 70; c.sky = t.ny * 70;
  c.treeHits = (c.treeHits || 0) + 1;
  this.fxHit(c, '#ffffff', 'tree');
}
// the kart (a capsule along its heading) against trees or poles: pushed clear and turned along it; the one it touched
function touching(c, tr) {
  const hx = Math.cos(c.heading), hy = Math.sin(c.heading), e = Math.max(0, c.L / 2 - c.W / 2), ax = c.x - hx * e, ay = c.y - hy * e, rad = c.W / 2;
  for (let i = lowS(tr, c.s - c.L - 30); i < tr.length && tr[i].s < c.s + c.L + 30; i++) {
    const t = tr[i], px = t.x - ax, py = t.y - ay, u = clamp((px * hx + py * hy) / (2 * e || 1), 0, 1), cx = ax + hx * 2 * e * u, cy = ay + hy * 2 * e * u;
    const dx = cx - t.x, dy = cy - t.y, dd = Math.hypot(dx, dy), need = t.r + rad;
    if (dd >= need) continue;
    const nx = dd > 1e-3 ? dx / dd : -hy, ny = dd > 1e-3 ? dy / dd : hx, push = need - dd + 2;   // pushed clear of it
    c.x += nx * push; c.y += ny * push; c.touchT = 0.3;
    const into = hx * nx + hy * ny; if (into < 0) { const tx = hx - nx * into, ty = hy - ny * into, tl = Math.hypot(tx, ty); if (tl > 0.2) c.heading = Math.atan2(ty, tx); }   // (glancing off it: heading along its side, not back into it)
    return { t, nx, ny };
  }
  return null;
}
function unstick(race, c, z) {
  const T = c.T, tr = z.trees, B = z.band(c.s), rad = c.W / 2 + 14;
  let best = null;
  for (let L = B[0] + c.W; L <= B[1] - c.W; L += 12) {
    if (best !== null && Math.abs(L - c.lat) >= Math.abs(best - c.lat)) continue;
    let ok = true;
    for (let i = lowS(tr, c.s - 60); i < tr.length && tr[i].s < c.s + 200 && ok; i++) if (Math.abs(tr[i].lat - L) < tr[i].r + rad) ok = false;
    if (ok) best = L;
  }
  c.skiStuck = 0; if (best === null) return;
  const q = trackSample(T, c.s);
  race.fxPuff(c.x, c.y, '#ffffff', 16, 0.7, 0, -30);
  c.lat = c.prevLat = c.lineS = best; c.x = q.x + q.nx * best; c.y = q.y + q.ny * best; c.heading = Math.atan2(q.ty, q.tx); c.speed = Math.max(c.speed, 60); c.skx = c.sky = 0; c.kCmd = 0; c.skiW = null;
  race.fxPuff(c.x, c.y, '#ffffff', 16, 0.7, 0, -30);
}
// the Slalom: a pole clipped knocks you; past a pole on the wrong side (inside it) you've missed the gate
function slalomCar(race, c, z, prevS, dt) {
  c.treeCd = (c.treeCd || 0) - dt;
  for (const w of z.walls) {
    const g = w.gaps[0]; if (!(prevS < g.s && c.s >= g.s)) continue;
    if ((c.lat - g.pole) * g.sd < 0 && Math.abs(c.lat - g.pole) > 4) {   // inside the pole: a missed gate
      c.speed *= SKI.MISS_KEEP; c.skiMiss = (c.skiMiss || 0) + 1;
      race.fxPuff(c.x, c.y, '#ffffff', 14, 0.5, 0, -20); race.sound('bump', c, c.human ? 0.8 : 0.4);
    }
  }
  if (c.treeCd > 0) return;
  const t = touching(c, z.trees); if (!t) return;
  c.treeCd = 0.4;
  if (c.speed > 110) { c.speed *= SKI.POLE_KEEP; c.skx += t.nx * 60; c.sky += t.ny * 60; c.skiPoles = (c.skiPoles || 0) + 1; race.fxPuff(t.t.x, t.t.y, '#ffffff', 10, 0.4, 0, -20); race.sound('bump', c, c.human ? 0.7 : 0.35); }
}
// the Moguls: running over a bump (its middle passing under you within MOG_HIT) over your mogul speed launches you off
// it: up in the air (MOG_AIR, the faster the longer), shoved hard off its side, tumbling, a big share of your speed gone
// and a moment's loose grip after. Let go of the gas just before it (MOG_TIME) and your legs soften it (a bot: by
// skill): a short hop, a third of the shove, a smaller share of your speed. Under your mogul speed you just roll over it
function mogulCar(race, c, z, prevS) {
  if (c.s <= prevS || c.jumpCd > 0) return;
  const B = z.bumps, [h0, h1] = SKI.MOG_HIT; let b = null;
  for (let i = lowS(B, prevS + 1e-6); i < B.length && B[i].s <= c.s; i++) if (Math.abs(B[i].lat - c.lat) < B[i].r * h0 + c.W * h1) b = B[i];
  if (!b) return;
  const v0 = mogV(c); if (c.speed <= v0) return;
  const over = c.speed / v0 - 1, q = trackSample(c.T, c.s);
  const soak = c.human ? !c.gas && race.time - (c.gasOffAt === undefined ? -9 : c.gasOffAt) < SKI.MOG_TIME : c.rng() < clamp(0.2 + (c.ai.skill - 0.92) * 3.8, 0.2, 0.85);
  c.landS = null; c.trick = false; c.jumpAt = b.s; c.skiHop = true;
  const sd = c.lat >= b.lat ? 1 : -1, k = Math.min(over + 0.25, 0.65) * SKI.MOG_SHOVE * (soak ? 1 / 3 : 1);
  c.skx += q.nx * sd * k; c.sky += q.ny * sd * k;
  if (soak) {   // softened: a short hop and on you go, a little slower
    c.air = c.airT = 0.16; c.jumpCd = c.air + 0.05; c.speed *= 1 - SKI.MOG_ABSORB; c.skiSoaks = (c.skiSoaks || 0) + 1;
    race.fxPuff(c.x, c.y, '#ffffff', 10, 0.4, 0, -20); race.sound('bump', c, c.human ? 0.5 : 0.25);
    return;
  }
  const [t0, t1, tm] = SKI.MOG_AIR; c.air = c.airT = Math.min(tm, t0 + t1 * over); c.jumpCd = c.air + 0.05;
  const [a0, a1, m] = SKI.MOG_SCRUB; c.speed *= 1 - Math.min(m, a0 + a1 * over);
  c.spinT = Math.max(c.spinT, SKI.MOG_SPIN); c.hitCd = Math.max(c.hitCd, 0.5); c.kCmd = 0;
  c.skiLoose = SKI.MOG_LOOSE; c.skiHops = (c.skiHops || 0) + 1;
  for (let j = 0; j < 8; j++) { const a = j / 8 * TAU; race.fxPuff(c.x + Math.cos(a) * 12, c.y + Math.sin(a) * 12, '#ffffff', 12 + j % 3 * 3, 0.6, Math.cos(a) * 90 + q.nx * sd * 80, Math.sin(a) * 90 + q.ny * sd * 80); }
  race.fxStars(c.x, c.y, 4, '#ffd166', 120); race.sound('bump', c, c.human ? 0.9 : 0.4);
}
// a split: the island (a rock wall on the Ledge, a fence on the Park) keeps each lane to itself; the Ledge's edge and
// wall and its lean; the Park's kickers, box and halfpipe. True if the car's been put somewhere else (a fall)
function splitCar(race, c, z, dt) {
  if (c.s < z.sN + 40 || c.s > z.sE) return false;
  const T = c.T, L = z.lane(c.s), side = z.side, q = trackSample(T, c.s), mine = (c.lat - (L.in + L.far) / 2) * side > 0;
  const shove = (to, keep) => {   // held off it (and turned along it, if heading into it: not if already steering away)
    const d = to - c.lat; c.x += q.nx * d; c.y += q.ny * d; c.lat = c.prevLat = to; if (c.speed > 100) c.speed *= 1 - (1 - keep) * 60 * dt;
    if ((Math.cos(c.heading) * q.nx + Math.sin(c.heading) * q.ny) * d >= 0) return;
    const th = Math.atan2(q.ty, q.tx); let e = th - c.heading; while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI; c.heading += e * 0.5;
  };
  if (!mine) {   // the piste: off the island
    if ((c.lat - L.far) * side > -c.W / 2) { shove(L.far - side * c.W / 2, 0.995); if (c.speed > 200) race.sound('scrape', c, c.human ? 0.5 : 0.25); }
    if (z.kicks) pisteKick(race, c, z);
    return false;
  }
  if (z.kind === 'ledge') {
    // the shelf leans out: at speed it pushes you toward the drop
    const lean = Math.max(0, c.speed / c.top - 0.9) * SKI.CAMBER * dt; c.x += q.nx * side * lean; c.y += q.ny * side * lean;
    if ((c.lat - L.edge) * side > -c.W * 0.15 && c.s > z.sN + 120) { ledgeFall(race, c, z); return true; }   // off the edge
    if ((c.lat - L.in) * side < c.W / 2) {   // into the wall: it slows you, and at speed it kicks you back out toward the edge
      shove(L.in + side * c.W / 2, 0.97);
      if (c.speed > 200 && !(c.skiKick > race.time)) { const k = Math.max(0, c.speed - c.top * 0.95) * SKI.KICK; c.skx += q.nx * side * k; c.sky += q.ny * side * k; c.skiKick = race.time + 0.3; race.sound('scrape', c, c.human ? 0.6 : 0.3); c.skiScrape = (c.skiScrape || 0) + 1; }
    }
    return false;
  }
  if ((c.lat - L.in) * side < c.W / 2) shove(L.in + side * c.W / 2, 0.96);   // the Park's fence
  if ((c.lat - L.edge) * side > -c.W / 2) shove(L.edge - side * c.W / 2, 0.96);
  parkCar(race, c, z, q, dt);
  return false;
}
// the kicker line on the piste round the outside of the Ledge (`kickers` in its definition: how far past the nose each
// is): a kicker right across the piste; let go of the gas right at its lip for a trick and you're popped off the landing
// (PARK_POP, PARK_BOOST, as in the Park), land one without and you scrub (PARK_LAND). In the air you're carried round the
// bend (a hop: skiHop). A bot tricks by skill, as in the Park
function pisteKickers(T, z, kickers, ramps) {
  z.kicks = kickers.map(d => {
    const s = z.sN + d, L = z.lane(s), hw = halfWAt(T, s), a = z.side > 0 ? -hw + 14 : L.far + 16, b = z.side > 0 ? L.far - 16 : hw - 14;
    ramps.push({ s, len: 100, H: 18, cannon: false, moon: false, mid: (a + b) / 2, half: (b - a) / 2, lat0: a, lat1: b, piste: true });
    return { s, a, b };
  });
}
function pisteKick(race, c, z) {
  if (c.jumpCd > 0 || c.speed < 120 || c.spinT > 0 || c.air > 0) return;
  for (const k of z.kicks) {
    const ds = c.s - k.s; if (ds <= -8 || ds >= 30 || c.lat < k.a - 10 || c.lat > k.b + 10) continue;
    c.trick = c.human ? (!c.gas && race.time - (c.gasOffAt === undefined ? -9 : c.gasOffAt) < 0.25) : c.rng() < clamp(0.25 + (c.ai.skill - 0.92) * 4.2, 0.2, 0.95);
    c.skiTrick = c.trick; c.skiAir = 'kick'; c.skiHop = true; c.landS = null; c.jumpAt = k.s;
    c.air = c.airT = clamp(c.speed / 760, 0.3, 0.6); c.jumpCd = c.air + 0.05; c.kCmd = 0; c.skiKicks = (c.skiKicks || 0) + 1;
    if (c.trick) c.skiTricks = (c.skiTricks || 0) + 1;
    race.fxRing(c.x, c.y, '#ffffff', 34, 0.25, 3); race.sound(c.trick ? 'trick' : 'jump', c, c.human ? 0.8 : 0.4);
    return;
  }
}
// off the Ledge: you fall, and climb back up onto the piste, FALL_BACK further up the run, from a standstill
function ledgeFall(race, c, z) {
  const T = c.T, back = Math.max(z.sN + 80, c.s - SKI.FALL_BACK), q = trackSample(T, back), L = z.lane(back), lat = L.far - z.side * (c.W + 30);
  race.fxHit(c, '#ffffff', 'skifall');
  c.s = back; c.lat = c.prevLat = c.lineS = lat; c.x = q.x + q.nx * lat; c.y = q.y + q.ny * lat; c.heading = Math.atan2(q.ty, q.tx); c.skiPS = back;
  c.speed = 0; c.skx = c.sky = 0; c.spinT = SKI.FALL_SPIN; c.hitCd = 1.4; c.kCmd = 0; c.skiLane = 'piste'; c.progress = race.progressOf(c);
  c.skiFalls = (c.skiFalls || 0) + 1;
}
// the Park: over a kicker's lip or up a halfpipe wall, into the air (let go of the gas right at it for a trick: the boost
// is race.js's, on landing); along the box with the drift held all the way, a boost off its end
// in the flow (a trick landed, the box slid): carried at pop x your top speed, easing back over PARK_FLOW, the air not
// holding you back (skiCar, c.skiRush)
function parkFlow(c, pop) {
  c.speed = Math.min(Math.max(c.speed + c.top * SKI.PARK_ADD, c.top * (pop + SKI.PARK_CHAIN * Math.min(SKI.PARK_CHAIN_MAX, c.skiStreak || 0))), Math.max(c.speed, c.top * SKI.PARK_CAP));   // (on from what you carried in: pumping pays)
  c.skiStreak = (c.skiStreak || 0) + 1;
  c.skiRush = c.skiRush0 = SKI.PARK_FLOW; c.skiRushV = c.speed; c.skiFlow = true;
}
// the halfpipe's walls: drifting the way the line swings (down each wall: the swerve's bend, skiK) pumps you on; riding
// it without (or drifting against the swing) scrubs speed. With drift off the race has no pumping and no scrub
function pipePump(race, c, z, dt) {
  const d = c.s - z.sN;
  if (c.skiNoDrift || d < PARK.PIPE[0] + 60 || d > PARK.PIPE[1] - 60 || c.air > 0) return;
  const k = skiK(c, c.s + 20);
  if (c.dOn && c.dAmt > 0.3 && Math.abs(k) > 1 / 8000 && Math.sign(k) === c.dSide) {
    c.skiPump = true; c.skiPumpT = (c.skiPumpT || 0) + dt;
    if (c.speed < c.top * SKI.PUMP_MAX) c.speed = Math.min(c.top * SKI.PUMP_MAX, c.speed + c.top * SKI.PUMP * c.dAmt * dt);
    c.dStrain = Math.max(0, (c.dStrain || 0) - SKI.PUMP_STRAIN * dt);
  } else c.speed -= c.speed * SKI.PUMP_DRAG * dt;
}
function parkCar(race, c, z, q, dt) {
  pipePump(race, c, z, dt);
  if (c.jumpCd > 0 || c.speed < 120 || c.spinT > 0) return;
  for (const w of z.walls) {
    const g = w.gaps[0], ds = c.s - g.s;
    if (g.f === 'box0') { if (ds > -10 && ds < 20 && Math.abs(c.lat - g.lat) < 40) c.skiGrind = c.dOn ? g.s : 0; continue; }
    if (g.f === 'box1') {
      if (c.skiGrind && ds > -10 && ds < 20) { const ok = c.dOn && Math.abs(c.lat - g.lat) < 40; c.skiGrind = 0; if (ok) { c.boost = Math.max(c.boost, SKI.GRIND); parkFlow(c, SKI.GRIND_POP); c.skiLandT = race.time; c.skiLandOk = 1; race.fxBoost(c); race.fxSparks(c.x, c.y, 12, '#ffd166', 160); race.sound('trickLand', c, c.human ? 0.8 : 0.4); c.skiGrinds = (c.skiGrinds || 0) + 1; } }
      else if (c.skiGrind && !c.dOn) c.skiGrind = 0;
      if (ds > 20 && c.skiBoxZ !== z.t0) { c.skiBoxZ = z.t0; if (c.skiGrinds0 === c.skiGrinds) c.skiStreak = 0; }   // (past the box without sliding it: the chain starts again)
      continue;
    }
    const wall = g.f === 'wall';
    if (ds <= -8 || ds >= 30 || (wall ? (c.lat - g.lat) * g.sd < -40 : Math.abs(c.lat - g.lat) > 46 + c.W * 0.3)) continue;
    c.trick = c.human ? (!c.gas && race.time - (c.gasOffAt === undefined ? -9 : c.gasOffAt) < 0.25) : c.rng() < clamp(0.25 + (c.ai.skill - 0.92) * 4.2, 0.2, 0.95);   // (a bot: by skill, a good one nearly every time)
    c.skiTrick = c.trick; c.skiAir = true; c.landS = null; c.jumpAt = g.s;
    { let e = Math.atan2(q.ty, q.tx) - c.heading; while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI; c.heading += e * 0.8; c.kCmd = 0; }   // (a kicker, or the pipe's wall, throws you straight down the lane)
    c.air = c.airT = wall ? clamp(PARK.WALL_FLY / c.speed, 0.26, 0.45) : clamp(c.speed / (g.f === 'big' ? 700 : 700), 0.28, g.f === 'big' ? 0.65 : 0.56);   // (off a wall: about the same way through the air however fast, so the swing to the next wall has room) c.jumpCd = c.air + 0.05;
    if (c.trick) c.skiTricks = (c.skiTricks || 0) + 1;
    race.fxRing(c.x, c.y, '#ffffff', 34, 0.25, 3);
    race.sound(c.trick ? 'trick' : 'jump', c, c.human ? 0.8 : 0.4);
    return;
  }
}

// ---------------------------------------------------------------- the bots
// In the slalom or the park the bots hold the speed their own grip can make the swerve they're on at, and the one after
// (a bot drifting it counts on some of the carve), less for a worse bot; in a field of trees they go flat out (their
// drift button picks their way: forestPlan, a look ahead, which with drift off works the
// gas instead). Over the moguls a better bot carries more speed, weaving the bumps with the same look ahead. At a split they pick a way once (the
// better the bot, the more often the lane) and hold its speed.
export function skiAI(c, skill, brake, plan) {
  const T = c.T, M = T.mech.ski; if (!M || c.finished) return;
  const h0 = elevAt(T, c.s), m = 0.9 + (skill - 0.92) * 0.9, good = clamp((skill - 0.92) / 0.17, 0, 1);
  for (const z of M.zones) {
    if (z.s0 - c.s > 2200 || c.s > z.s1) continue;
    if (z.kind === 'moguls') {   // a better bot carries more speed (down its lane with drift on) and soaks up more of the bumps it meets (mogulCar)
      const v = c.top * SKI.MOG_V * (this.drift ? lerp(1.06, MOG_CARRY, good ** 1.3) : lerp(0.96, 1.0, good));   // (just the next few rows: planned to the end, the hill's pull all the way down would have it crawl)
      if (c.s < z.t1) for (let s = Math.max(z.t0 - 100, c.s), k = 0; s <= z.t1 && k < 3; s += 150, k++) cap(plan, T, c, s, v, h0);
      continue;
    }
    if (z.field && z.kind !== 'moguls' && !this.drift && c.s > z.sF && c.s < z.t1) {   // the trees with drift off: lifting carves in, so the look ahead (forestPlan) works the gas
      c.ai.skiLift = c.speed > c.top * 0.45 && forestPlan(this, c, z, good);   // (not crawling: lifting would only stop it)
      if (c.ai.skiLift) cap(plan, T, c, c.s, 1, h0); else c.ai.carry = true;
      continue;
    }
    if (z.field) { if (c.s > z.s0 && c.s < z.s1) c.ai.carry = true; continue; }   // (a field: flat out, not lifting for the line's sweep; its drift button picks its way, skiBotDrift)
    if (z.split) {
      if (c.ai.skiLaneAt !== z.t0) { c.ai.skiLaneAt = z.t0; c.ai.skiLane = c.rng() < (z.kind === 'ledge' ? clamp(0.2 + (skill - 0.92) * 2.6, 0.12, 0.65) : clamp(0.2 + (skill - 0.92) * 3.9, 0.15, 0.9)) ? z.t0 : -1; }
      if (z.kicks && c.ai.skiLane !== z.t0 && c.s < z.sE) { plan.zones.push({ s0: z.sN - 200, s1: z.sE + 100, v: c.top * lerp(1.0, 1.3, good), vMax: 1e4 }); if (c.s > z.sN - 200 && c.s < z.sE) c.ai.carry = true; }   // (the piste round the Ledge, its kicker line: wide open, carried as fast as a good player does)
      if (c.ai.skiLane !== z.t0 && c.s < z.sLock) continue;
      if (c.s > z.sLock && c.skiLane !== z.kind) continue;
      if (c.s < z.sN) cap(plan, T, c, z.sN - 250, z.vIn * c.top * 0.94, h0);   // into it
      if (z.kind === 'ledge') {   // no faster than the shelf's lean and bends allow (with a margin: it's a drop)
        for (let s = Math.max(z.sN, c.s); s < Math.min(z.sE, c.s + 1500); s += 40) {
          cap(plan, T, c, s, c.top * (0.97 + 0.06 * good), h0);
          const L = z.lane(s), k = T.curv[Math.min(T.N - 1, Math.floor(s / 2))], f = Math.max(0.3, 1 - k * L.mid), kl = Math.abs(k / f + L.k / (f * f));
          if (kl > 1 / 8000) cap(plan, T, c, s - 60, Math.sqrt(c.grip * SKI.LEDGE_GRIP * 0.95 / kl) * m, h0);
        }
        continue;
      }
    }
    if (z.kind === 'park' && c.s > z.sN && good > 0.4) c.ai.carry = true;   // (not lifting for a slide in the swerves)
    const G = c.grip * 1.1 * (zoneOf(c) === z ? planCarve(c, skill) : 1) * (z.kind === 'park' ? 1 + PARK_CARRY * good : 1);   // (the park: a good bot rides it nearly flat out, as a good player can: the walls throw you straight down it)   // (a bot drifting this field counts on some of the carve)
    if (zoneOf(c) !== z || !c.skiW) {   // coming up to it: the speed into its first row
      let wi = 0; while (wi < z.walls.length && z.walls[wi].s < Math.max(c.s, z.t0)) wi++;
      if (z.split && c.s < z.sN) continue;
      const p = skiPick(c, z, { s: z.walls[wi] ? z.walls[wi].s - 700 : 0, lat: clamp(c.lat, -200, 200), gw: -1 }, wi, G); if (p) cap(plan, T, c, z.walls[wi].s - 400, p.v * m, h0);
      continue;
    }
    const W = c.skiW; if (!W.b) continue;
    cap(plan, T, c, W.a.s, Math.sqrt(G / Math.max(swerveK(W.a, W.b, c.W), 1e-7)) * m, h0);   // this swerve
    const N = z.walls[W.wi + 1];   // and the next
    const nx = z.walls[W.wi] && z.walls[W.wi].gaps[W.b.gi];
    if (N && nx) { let v = 0; for (const h of nx.next) v = Math.max(v, Math.sqrt(G / Math.max(swerveK(W.b, h, c.W), 1e-7))); if (v) cap(plan, T, c, W.b.s, v * m, h0); }
  }
}
// A bot's drift button in the trees, the slalom and the park (race-drift.js driftAI hands it over here, with drift on).
// The trees and the moguls: forestPlan. The slalom and the park: some bots drift the swerves (the better the bot, the more of them: decided per zone, BOT_P), pressing as the swerve
// starts to turn its way and letting go as it straightens to turn the other, a worse bot a little late either way (and
// its speed plan counts on the carve: skiAI); on the park's box it slides it by skill. Its luck is c.rng; with drift off
// this never runs.
const BOT_P = [0.15, 0.85], BOT_LATE = 0.12, MOG_CARRY = 1.4, PARK_CARRY = 1.6;   // (MOG_CARRY: the most a bot carries over the moguls, x MOG_V: about flat out)
export function skiBotDrift(race, c, skill) {
  const ai = c.ai, good = clamp((skill - 0.92) / 0.17, 0, 1), z = zoneOf(c);
  if (ai.skiDz !== z.t0) {
    ai.skiDz = z.t0; ai.skiDr = c.rng() < BOT_P[0] + (BOT_P[1] - BOT_P[0]) * good;
    if (z.field) { const u = c.rng(); ai.skiWay = z.kind !== 'glade' ? (u < 0.5 ? 0 : 1) : u < FIELD_BOT[0] + FIELD_BOT[1] * good ? 0 : u < FIELD_BOT[2] + FIELD_BOT[3] * good ? 1 : 2; ai.skiErr = c.rng() * 6.283; }   // (skiErr: no longer used, its draw kept so the luck that follows stays as it was)
  }
  if (z.field) { ai.drift = forestPlan(race, c, z, good); ai.dz = ai.drift ? { T: c.T, a: c.s, b: c.s + 400, side: z.ins, m: 1 } : null; return; }
  if (z.kind === 'park') {   // the box: slide it (held from just before it to its end)
    const b0 = c.skiW && z.walls[c.skiW.wi] && z.walls[c.skiW.wi].gaps[0];
    if (b0 && (b0.f === 'box1' || (b0.f === 'box0' && b0.s - c.s < 70))) { ai.drift = ai.skiDr && c.speed > 150; ai.dz = null; return; }
  }
  if (!ai.skiDr || c.finished || c.off || c.air > 0 || c.boost > 0 || c.spinT > 0) { ai.drift = false; ai.dz = null; return; }
  const late = (1 - good) * BOT_LATE * c.speed + 0.1 * c.speed, k = skiK(c, c.s + late), sg = Math.sign(k);
  if (c.dOn) ai.drift = sg === c.dSide && Math.abs(k) > 1 / 20000;
  else ai.drift = !ai.skiRel && Math.abs(k) > 1 / 3000 && Math.sign(skiK(c, c.s)) === sg;
  ai.skiRel = c.dOn && !ai.drift; ai.dz = ai.drift ? { T: c.T, a: c.s, b: c.s + 400, side: sg || 1, m: 1 } : null;
}
// A bot in a field picks a way per field (FIELD_BOT: in the Pine Glade the inside one by skill, [a + b × good], else
// the middle one [c + d × good], else the outside one; in the forest one of its two) for its look ahead to head for
const FIELD_BOT = [0.1, 0.65, 0.5, 0.45];
// A bot in the forest (with drift on its drift button, with drift off its gas: either way `hold` is what carves it in):
// no way to follow blindly, it looks ahead. Each decision it runs its line on (fieldRun) for a handful of plans (hold the
// whole way, let go the whole way, hold a moment then let go, let go a moment then hold), and takes the one that runs
// furthest before it'd touch a tree; of the plans that stay clear, the one that ends nearest the way it picked (z.ways,
// kept clear: so it doesn't thread itself into a dead end past what it sees), sticking with what it's doing unless
// another's clearly better. A better bot looks further (FOREST_BOT.LOOK) and gives the trees more room (ROOM); a worse
// one cuts them fine and now and then clips one. Never into a spin: it lets go as the drift strains
const FOREST_BOT = { LOOK: [0.45, 1.2], ROOM: [-6, 12], LAG: [0.06, 0], STEP: 0.15, SUB: 3 };
function forestPlan(race, c, z, good) {
  const ai = c.ai, W = z.ways[ai.skiWay] || z.ways[0];
  if (c.skiNoDrift) good = 0.35 + 0.65 * good;   // (steering with the gas: no drift to build, so a worse bot misjudges it less)
  if (c.finished || c.off || c.air > 0 || c.spinT > 0 || c.s > z.t1 || c.skiFZ !== z.t0) return false;
  if (!c.skiNoDrift && ((c.dOn && c.dStrain > 1.7) || (c.dLock && !c.dOn))) return false;   // (dLock: a drift broken off: let go, then press again)
  const F = FOREST_BOT, depth = Math.max(2, Math.round(lerp(F.LOOK[0], F.LOOK[1], good) / F.STEP)), room = lerp(F.ROOM[0], F.ROOM[1], good), tr = z.kind === 'moguls' ? z.bumps : z.trees, dt = F.STEP / F.SUB;
  const now = c.skiNoDrift ? !c.gas : !!c.dOn;
  const mog = z.kind === 'moguls', [h0, h1] = SKI.MOG_HIT;   // (the moguls: the bumps, as mogulCar finds them under you)
  const hit = mog ? (s, lat) => { for (let j = lowS(tr, s - 20); j < tr.length && tr[j].s < s + 20; j++) { const t = tr[j]; if (Math.abs(t.lat - lat) < t.r * h0 + c.W * h1 + room) return true; } return false; }
    : (s, lat) => { for (let j = lowS(tr, s - c.L / 2 - 40); j < tr.length && tr[j].s < s + c.L / 2 + 40; j++) { const t = tr[j]; if (Math.abs(t.s - s) < c.L * 0.4 + t.r && Math.abs(t.lat - lat) < c.W / 2 + t.r + room) return true; } return false; };
  // a search over hold / let go, a STEP at a time, depth steps deep: the first plan that stays clear all the way (trying
  // first, at each step, whichever heads for the way: then it keeps to it), else the one that runs furthest
  let deep = -1, first = now;
  const go = (st, d, h0) => {
    if (d > deep) { deep = d; first = h0; }
    if (d >= depth) return true;
    const toWay = (wayLat(W, st.s + 150) - st.L) * z.ins > 0;   // (+: the way's further in: holding heads for it)
    for (const h of d === 0 ? [now, !now].sort((x, y) => (x === toWay ? -1 : 0) - (y === toWay ? -1 : 0)) : [toWay, !toWay]) {
      const q = { ...st }; let ok = true;
      for (let k = 0; k < F.SUB && ok; k++) { runStep(c, z, q, h, dt, false); if (hit(q.s, q.L)) ok = false; }
      if (!ok) { if (d > deep) { deep = d; first = d === 0 ? h : h0; } continue; }
      if (go(q, d + 1, d === 0 ? h : h0)) { first = d === 0 ? h : h0; return true; }
    }
    return false;
  };
  go(runFrom(c, z), 0, now);
  // and it acts on that a moment late (a worse bot): a change of mind only once it's held LAG
  if (first === now) { ai.skiPend = null; return now; }
  if (ai.skiPend !== first) { ai.skiPend = first; ai.skiPendT = race.time; }
  return race.time - ai.skiPendT >= lerp(F.LAG[0], F.LAG[1], good) ? first : now;
}
// how much of the carve a bot's speed plan counts on in a zone it means to drift (L0 .. L2)
const planCarve = (c, skill) => c.ai.skiDr && c.ai.skiDz !== undefined && c.skiZ && c.ai.skiDz === zoneOf(c).t0 ? 1 + (1.5 * SKI.CARVE - 1) * (0.25 + 0.35 * clamp((skill - 0.92) / 0.17, 0, 1)) : 1;
// be at v by s (on a slope: the hill's pull taken into account, race-elevation.js)
function cap(plan, T, c, s, v, h0) {
  const ds = s - c.s; if (ds < -2000) return;
  const rise = elevAt(T, Math.max(s, c.s)) - h0;
  plan.caps.push({ ds: Math.max(0, ds), v: Math.sqrt(Math.max(1, v * v + 2 * G_SLOPE * rise)) });
}
