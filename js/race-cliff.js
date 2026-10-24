// Kernel Kart: the cliff jump (`cliffs`, Recursion Ridge). A road that runs straight off the edge of a cliff: at the lip
// (a kicker) you leave the ground and fly down the face, a long way, and come down on a steep landing slope cut into
// the mountain below. Where you come down is how fast you left (the flight follows the road's real heights,
// race-elevation.js, under a floaty flight gravity): too slow and you hit the rocks of the face (and climb back up to
// try again from a standstill, well back up the run-up), too fast and you sail past the landing slope onto the flat
// below it, a crash landing (a spin and most of your speed gone). Between the two (vLo..vHi, worked out when the track
// is built, the same speeds for everyone) you land clean on the slope and run on down. In the air you can't steer or
// change speed, so the whole call is how fast you hit the lip. Bots aim for the middle of the window, a worse bot less
// precisely (car.rng, once per lap).
import { STEP, TAU, clamp, frnd } from './core.js';
import { projectToTrack, trackSample, wrapS } from './geometry.js';
import { G_SLOPE, elevAt } from './race-elevation.js';
import { nearestS } from './race-mechanics.js';
import { Input } from './input.js';

// A ski jump (a cliff with `snow`, Gradient Descent's Big Air) has no window: whatever your speed off the kicker, the
// flight carries you down onto the landing hill (it's flown at a speed inside vLo..vHi, and you land at your own). In the
// air, each press of the drift key (with drift off, the gas) turns you a third of a flip (FLIP.ONE, spun at FLIP.W):
// land on a whole number of flips (presses a multiple of 3) and you're boosted off the landing (FLIP.RUSH: from V0 + VF
// a flip of your top speed, at most MAX flips' worth, easing back over T0 + TF a flip seconds); land on a third (on your
// side or upside down) and you crash (most of your speed gone, a spin). Bots count their presses (flipPlan).
export const FLIP = { ONE: TAU / 3, W: 18, V0: 1.2, VF: 0.1, MAX: 8, T0: 0.7, TF: 0.5, KEEP: 0.28, SPIN: 1.0 };
const flipHeld = (race, c) => c.human ? !!(race.drift ? Input.drift[c.pIndex] : Input.pressed[c.pIndex]) : false;


export const G_FLY = 92;      // flight gravity (floatier than the road's G_SLOPE: you fly down the face on your wings, you don't drop)
export const KICK = 0.1;      // the kicker throws you up at this share of your speed
const FLY_DT = 1 / 120;
const HOLD = 160, BIAS = 20;   // a bot is at its speed this far before the lip and holds it there (on and off the gas leaves it about 12 under what it aims for); it aims a little over the middle, since coming down short (into the torrent) costs far more than long

export function buildCliffs(T) {
  const sc = T.def.scale || 1;
  const on = p => { const s = nearestS(T, p[0] * sc, p[1] * sc), q = trackSample(T, s); return Math.hypot(q.x - p[0] * sc, q.y - p[1] * sc) < T.halfW ? s : null; };
  return (T.def.cliffs || []).map(d => {
    const sLip = on(d.lip), sLand = on(d.land), sFlat = on(d.flat); if (sLip === null || sLand === null || sFlat === null) return null;   // (on a course: only the route it's on)
    const z = { sLip, sLand, sFlat, A: trackSample(T, sLip), vLo: 0, vHi: 0, vMid: 0, hLip: elevAt(T, sLip), short: d.short, snow: !!d.snow };
    // the window, from the middle of the lip pointing down the road
    for (let v = 100; v <= 800; v += 2) {
      const f = flight(T, z, z.A.x, z.A.y, Math.atan2(z.A.ty, z.A.tx), v);
      if (!z.vLo) { if (f.s >= sLand) z.vLo = v; else continue; }
      if (f.s <= sFlat) z.vHi = v; else break;
    }
    z.vMid = (z.vLo + z.vHi) / 2;
    // where the run-up starts: just out of the corner before the lip (a respawn never goes back round it)
    z.s0 = sLip - 700; for (let s = sLip - 60; s > sLip - 1600; s -= STEP) if (Math.abs(T.curv[Math.floor(wrapS(T, s) / STEP)]) > 1 / 400) { z.s0 = s + 120; break; }
    if (d.torrent) z.torrent = buildTorrent(T, d.torrent, sc);
    if (d.spill) z.spill = buildTorrent(T, d.spill, sc);   // (the river past the landing slope, for an overshoot)
    return z;
  }).filter(Boolean);
}

// a flight off the lip of cliff z from (x, y) on heading h at speed v: where you come down (s along the road, lat
// across it) and after how long. Straight on (no steering in the air) over the road's own heights.
export function flight(T, z, x, y, h, v) {
  const ux = Math.cos(h) * v, uy = Math.sin(h) * v;
  let t = 0, px = x, py = y, pz = z.hLip, vz = v * KICK, s = z.sLip, lat = 0;
  while (t < 6) {
    t += FLY_DT; px += ux * FLY_DT; py += uy * FLY_DT; vz -= G_FLY * FLY_DT; pz += vz * FLY_DT;
    const q = projectToTrack(T, px, py, s, 30); s = q.s; lat = q.lat;
    if (pz <= elevAt(T, s) && t > 0.05) break;
  }
  return { s, lat, t };
}

// how a flight from here at speed v comes out: -1 short (the rocks), 0 clean, 1 long (the flat)
export const cliffVerdict = (z, v) => v < z.vLo ? -1 : v > z.vHi ? 1 : 0;

export function cliffCar(c, dt, prevS) {
  const T = c.T;
  for (const z of T.mech.cliffs) {
    const ds = z.sLip - c.s;
    if (c.human && ds > 300 && ds < 900 && c.cliffWarn !== c.lap) { c.cliffWarn = c.lap; this.feed('warn', 'cliff', c); }
    // the lip: off you go
    if (prevS < z.sLip && c.s >= z.sLip && c.air <= 0 && c.speed > 60 && !c.off && c.ff <= 0 && c.oc <= 0 && !c.finished && z.snow) {   // a ski jump: down onto the hill whatever your speed; flips in the air
      const vf = clamp(c.speed, z.vLo + 10, z.vHi - 10), f = flight(T, z, c.x, c.y, c.heading, vf);
      c.trick = false; c.landS = null; c.jumpCd = 1.2; c.jumpAt = z.sLip; c.air = c.airT = f.t; c.cliffJump = true; c.cliffV = vf; c.flipV = c.speed;
      c.flipN = 0; c.flipA = 0; c.flipHeld = flipHeld(this, c);
      if (!c.human) flipPlan(c, f.t);
      this.fxRing(c.x, c.y, '#ffffff', 50, 0.4, 5); this.sound('jump', c, c.human ? 1 : 0.5);
      { const hx = Math.cos(c.heading), hy = Math.sin(c.heading); for (let i = 0; i < 14; i++) { const sd = i % 2 ? 1 : -1, f = frnd(0.2, 1); this.fxPuff(c.x - hy * sd * c.W * 0.5, c.y + hx * sd * c.W * 0.5, '#ffffff', frnd(9, 20), frnd(0.5, 0.9), hx * c.speed * 0.35 * f - hy * sd * frnd(40, 130), hy * c.speed * 0.35 * f + hx * sd * frnd(40, 130)); } }   // take-off spray off the lip (cosmetic: frnd)
      continue;
    }
    if (prevS < z.sLip && c.s >= z.sLip && c.air <= 0 && c.speed > 60 && !c.off && c.ff <= 0 && c.oc <= 0 && !c.finished) {
      c.trick = c.human ? (!c.gas && this.time - (c.gasOffAt === undefined ? -9 : c.gasOffAt) < 0.25) : c.rng() < clamp(0.3 + (c.ai.skill - 0.92) * 3, 0.2, 0.85);
      const f = flight(T, z, c.x, c.y, c.heading, c.speed);
      c.landS = null; c.jumpCd = 1.2; c.jumpAt = z.sLip; c.air = c.airT = f.t; c.cliffJump = true; c.cliffV = c.speed;
      this.fxRing(c.x, c.y, '#ffffff', 50, 0.4, 5); this.sound(c.trick ? 'trick' : 'jump', c, c.human ? 1 : 0.5);
      continue;
    }
    if (c.cliffJump && c.air > 0) c.speed = c.cliffV;   // in the air nothing changes your speed (not even a boost fired up there)
    if (z.snow && c.cliffJump && c.air > 0) {   // a ski jump's flips: a third of one a press, spun round smoothly
      const held = c.human ? flipHeld(this, c) : botFlip(c, dt);
      if (held && !c.flipHeld) { c.flipN++; if (!(c.flipN % 3)) c.flipAt = this.time; this.sound(c.flipN % 3 ? 'jump' : 'trick', c, c.human ? 0.6 : 0.3); }
      c.flipHeld = held;
      c.flipA = Math.min(c.flipN * FLIP.ONE, c.flipA + FLIP.W * dt);
    }
    if (z.snow && c.cliffJump && c.air <= 0) {   // down on the hill: on a whole number of flips, a boost for each; on a third, a crash
      c.cliffJump = false; c.speed = c.flipV || c.speed;
      const n = c.flipN || 0, F = Math.min(FLIP.MAX, n / 3);
      this.fxRing(c.x, c.y, '#ffffff', 80, 0.5, 6); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; this.fxPuff(c.x + Math.cos(a) * 18, c.y + Math.sin(a) * 18, '#ffffff', 12 + k % 3 * 3, 0.7, Math.cos(a) * 110, Math.sin(a) * 110); }
      if (n % 3) {
        c.speed *= FLIP.KEEP; c.spinT = FLIP.SPIN; c.hitCd = 1.2; c.kCmd = 0; c.boost = 0; c.flipCrash = (c.flipCrash || 0) + 1;
        this.fxHit(c, '#ffffff', 'skicrash'); c.flipLandT = this.time; c.flipLandOk = 0;
      } else if (F > 0) {
        c.flipLandT = this.time; c.flipLandOk = 1; c.flipLandF = F;   // (art/ski.js landBadge)
        c.skiRush = c.skiRush0 = FLIP.T0 + FLIP.TF * F; c.skiFlow = false; c.skiRushV = c.top * (FLIP.V0 + FLIP.VF * F);
        c.speed = Math.max(c.speed, c.skiRushV); c.boost = Math.max(c.boost, c.skiRush); c.flips = (c.flips || 0) + F;
        this.fxBoost(c); this.fxStars(c.x, c.y, 6 + 2 * F, '#ffd166', 160 + 20 * F); this.fxRing(c.x, c.y, '#ffd166', 60 + 10 * F, 0.5, 5);
        this.sound('trickLand', c, c.human ? 1 : 0.5);
      } else this.sound('land', c, c.human ? 1 : 0.5);
      c.flipN = 0; c.flipA = 0;
      continue;
    }
    // down: on the slope is clean; past it, on the flat, a crash landing
    if (c.cliffJump && c.air <= 0) {
      c.cliffJump = false;
      if (c.s >= z.sLand) { this.fxRing(c.x, c.y, '#e8dcc4', 80, 0.5, 6); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; this.fxPuff(c.x + Math.cos(a) * 18, c.y + Math.sin(a) * 18, '#d9cbb0', 12 + k % 3 * 3, 0.7, Math.cos(a) * 110, Math.sin(a) * 110); } }   // touchdown: a burst of dust
      if (c.s > z.sFlat && c.s < z.sFlat + 900 && !c.finished && z.spill) {   // past it with a river beside: thrown off the road into it
        this.fxHit(c, '#ffffff', 'crash'); sweepInto(c, z, z.spill, 1); continue;
      }
      if ((c.s > z.sFlat && c.s < z.sFlat + 900 || (z.short === 'crash' && c.s < z.sLand)) && !c.finished) {   // (a cliff with short: 'crash', a ski jump: come down short and you crash on the knoll)
        c.trick = false; c.boost = 0; c.speed *= 0.3; c.spinT = 0.9; c.hitCd = 1.2; c.kCmd = 0;
        this.fxHit(c, '#ffffff', z.snow ? 'skicrash' : 'crash');
      }
    }
    // on the ground in the face (came down short, or rolled off the lip too slowly): into the torrent at its foot, which
    // sweeps you all the way down the mountain (torrentRide); a cliff without one: into the rocks, and back up the run-up
    // to try again from a standstill (room to reach the window from there, but never back round the corner before it)
    if (c.air <= 0 && c.s > z.sLip + 6 && c.s < z.sLand && !c.finished && c.ff <= 0 && c.oc <= 0 && z.torrent) {
      sweepInto(c, z, z.torrent, 0);   // (the river right under where it lands)
      this.fxHit(c, '#b3e5fc', 'splash'); this.fxRing(c.x, c.y, '#ffffff', 110, 0.7, 8); this.fxRing(c.x, c.y, '#b3e5fc', 170, 1, 4); this.fxDrops(c.x, c.y, 26, '#e1f5fe', 260, 5); c.ai.cliffErr *= 0.3;   // (straight into the river under the jump: a big splash)
      continue;
    }
    if (c.air <= 0 && c.s > z.sLip + 6 && c.s < z.sLand && !c.finished && c.ff <= 0 && c.oc <= 0 && z.short !== 'crash') {
      const runUp = Math.max(420, (z.vLo * 1.15) ** 2 / (2 * (c.acc + G_SLOPE * 0.04)) + 80), back = wrapS(T, Math.max(z.sLip - runUp, z.s0));
      const q = trackSample(T, back), lat = clamp(c.lat, -q.hw + c.W, q.hw - c.W);
      c.s = back; c.lat = c.prevLat = c.lineS = lat; c.x = q.x + q.nx * lat; c.y = q.y + q.ny * lat; c.heading = Math.atan2(q.ty, q.tx);
      c.speed = 0; c.skx = c.sky = 0; c.spinT = 1.0; c.hitCd = 1.5; c.kCmd = 0; c.trick = false; c.cliffJump = false; c.progress = this.progressOf(c);
      this.fxHit(c, '#a1887f', 'fall'); c.ai.cliffErr *= 0.3;   // (a bot has another go, more carefully)
    }
  }
}

// A bot off a ski jump: how many flips it goes for (by skill: a good bot as many as its air allows at its pace, a worse
// one one or two) and how fast it presses (FLIP_BOT.GAP: seconds between presses, L0 .. L2), done FLIP_BOT.SAFE before
// touchdown; now and then a worse bot miscounts by one (MISS) and crashes. Its luck is c.rng
const FLIP_BOT = { GAP: [0.22, 0.12], GOAL: [1.4, 7], SAFE: 0.3, MISS: 0.14, FIRST: 0.2 };
function flipPlan(c, airT) {
  const good = clamp((c.ai.skill - 0.92) / 0.17, 0, 1), gap = FLIP_BOT.GAP[0] + (FLIP_BOT.GAP[1] - FLIP_BOT.GAP[0]) * good;
  const most = Math.floor((airT - FLIP_BOT.FIRST - FLIP_BOT.SAFE) / gap / 3) + 0;
  let F = Math.max(1, Math.min(most, Math.floor(FLIP_BOT.GOAL[0] + (FLIP_BOT.GOAL[1] - FLIP_BOT.GOAL[0]) * good + c.rng() * 1.2)));
  let n = most >= 1 ? 3 * F : 0;
  if (n && c.rng() < FLIP_BOT.MISS * (1 - good)) n += c.rng() < 0.5 ? -1 : 1;   // (lost count)
  c.ai.flipLeft = n; c.ai.flipGap = gap; c.ai.flipT = FLIP_BOT.FIRST;
}
// a bot's drift key in the air: a press each flipGap (down for a frame) until it's done its count
function botFlip(c, dt) {
  const ai = c.ai; if (!(ai.flipLeft > 0)) return false;
  ai.flipT -= dt;
  if (ai.flipT <= 0) { ai.flipT += ai.flipGap; ai.flipLeft--; return true; }
  return false;
}
// a bot hits the lip at a speed inside the window: the middle of it, give or take its aim (worse bots aim worse: drawn
// once per lap from its own luck). The road past the lip doesn't matter, it's in the air. On a slope the speed it can
// carry to the lip takes the hill into account (race-elevation.js).
export function cliffAI(c, skill, brake, plan) {
  const T = c.T;
  for (const z of T.mech.cliffs) {
    const ds = z.sLip - c.s; if (ds < 0 || ds > 1500 || z.snow) continue;   // (a ski jump: no window, flat out)
    const ai = c.ai; if (ai.cliffLap !== c.lap) { ai.cliffLap = c.lap; ai.cliffErr = (c.rng() + c.rng() + c.rng() - 1.5) / 1.5 * cliffSpread(skill) * (z.vHi - z.vLo) / 2; }
    const vT = z.vMid + ai.cliffErr + BIAS, rise = z.hLip - elevAt(T, c.s);
    plan.cut = Math.min(plan.cut, ds); plan.caps.push({ ds: Math.max(0, ds - HOLD), v: Math.sqrt(Math.max(0, vT * vT + 2 * G_SLOPE * rise)) });
  }
}
// how far a bot's aim strays, as a share of the window's half-width (at its edge it still lands, just): measured so the
// cliff and the ramp road come out about even over a race (README, CLAUDE.md)
export const cliffSpread = skill => clamp(2.6 - (skill - 0.92) * 11, 0.8, 2.6);
// a bot holding a burst of speed (Turbo, Overclock, Fast-Forward) keeps it from a little before the split to the lip
// when it's going for the Cliff: it has to hit the lip at the window's speed, and a boost there flings it off the
// turn-off or over the landing slope
export function cliffShy(race, c) {
  const T = c.T, M = T.mech; if (!M) return false;
  if (c.cliffJump && c.air > 0) return true;   // (in the air it would be wasted)
  for (const z of M.cliffs) if (!z.snow && c.s > z.s0 - 900 && c.s < z.sLip) return true;   // on the Cliff road, before the lip (a ski jump has no window to miss)
  if (!T.forks || !c.ai.forkPlan || !c.ai.forkPlan[c.lap * 4]) return false;
  const sp = race.splitAhead(c, 1600); return !!(sp && sp.alt.mech && sp.alt.mech.cliffs.length);   // set for it at the split coming up
}

// ---------------------------------------------------------------- the torrent
// Come down short off a cliff that has one (`torrent` in the cliff's definition: layout points from its spring up the
// mountain, over the cliff's wall in a waterfall (`falls`) and down the face, to a pool by the road, `pool`:
// [x, y, rx, ry] the calm pool it ends in, `out`: the road beside the pool, short of the line) and you drop into a mountain river: it sweeps you all the way down it (SWEPT_T seconds: no control, nobody can
// touch you, the camera follows), slows into the pool, carries you into the shallows and you roll up its beach, back
// on the road at a standstill. The whole way down you count as driving down the road (your s runs from where you fell
// to `out`), so the places and the lap stay right and you never skip the line. It costs far more than a clean flight
// or an overshoot (README, CLAUDE.md: measured). `ride` in the definition: a river's own ride time (SWEPT_T if not).
export const SWEPT_T = 13.5;
function buildTorrent(T, d, sc) {
  const P = d.pts.map(([x, y]) => [x * sc, y * sc]), pts = [];
  // a smooth line through the points (Catmull-Rom), then even spacing, with the distance along it
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], e = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < 12; k++) { const t = k / 12, t2 = t * t, t3 = t2 * t;
      pts.push([0, 1].map(q => 0.5 * (2 * b[q] + (-a[q] + c[q]) * t + (2 * a[q] - 5 * b[q] + 4 * c[q] - e[q]) * t2 + (-a[q] + 3 * b[q] - 3 * c[q] + e[q]) * t3))); }
  }
  pts.push(P[P.length - 1]);
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const sOut = nearestS(T, d.out[0] * sc, d.out[1] * sc), B = trackSample(T, sOut), e = pts[pts.length - 1];
  const pool = d.pool ? { x: d.pool[0] * sc, y: d.pool[1] * sc, rx: d.pool[2] * sc, ry: d.pool[3] * sc } : { x: e[0], y: e[1], rx: 60, ry: 40 };
  // where you come back onto the road: a quarter of the way across, on the pool's side; and where the beach meets the
  // water on the way there (the shore: the pool's edge on the line from its middle to there)
  const outLat = B.hw * 0.25 * (((pool.x - B.x) * B.nx + (pool.y - B.y) * B.ny) < 0 ? -1 : 1), ox = B.x + B.nx * outLat, oy = B.y + B.ny * outLat;
  const a = Math.atan2(oy - pool.y, ox - pool.x), shore = { x: pool.x + Math.cos(a) * pool.rx * 0.92, y: pool.y + Math.sin(a) * pool.ry * 0.92 };
  // a river with a head (`falls`: the index of the point on the lip of a waterfall it pours over, the next one its foot)
  // comes from further up the mountain: a kart only ever falls into it below the falls (iFoot, nearestU)
  const iFoot = d.falls !== undefined ? Math.min(pts.length - 1, (d.falls + 1) * 12) : 0;
  return { pts, cum, len: cum[cum.length - 1], sOut, outLat, out: { x: ox, y: oy }, pool, shore, ride: d.ride || SWEPT_T, quick: d.quick || 1, skid: d.skid || 0, jetty: d.jetty !== false, falls: d.falls, iFoot, uFoot: cum[iFoot] / cum[cum.length - 1] };
}
// a point along the torrent, u from 0 (its spring) to 1 (the pool): { x, y, a (its heading) }
export function torrentAt(R, u) {
  const d = clamp(u, 0, 1) * R.len; let i = 1; while (i < R.cum.length - 1 && R.cum[i] < d) i++;
  const a = R.pts[i - 1], b = R.pts[i], f = (d - R.cum[i - 1]) / Math.max(1e-6, R.cum[i] - R.cum[i - 1]);
  return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, a: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}
// the ride's phases, in seconds from the fall (the river's ride time in all, c.sweptT0): the splash (dunked under where
// you came down, then up again in the current), the eddy that spins you round and turns you downstream, the ride down
// the river into its pool, the shallows (the last of the current drifting you onto the beach, a bump as you ground) and
// ashore (rolling up the beach dripping, a shake, back onto the road). sweptPhase(c) tells the art where you are.
export const SPLASH = 1.4, WHIRL = 1.0, SHALLOW = 1.3, ASHORE = 1.5, RIDE0 = SPLASH + WHIRL;
// the river a kart is riding (cliff z's `torrent`, or its `spill` for an overshoot: c.sweptR)
export const riverFor = (z, c) => (c.sweptR && z.spill) || z.torrent;
// how far down the river (0..1) the point nearest (x, y) is (below its falls, if it has a head up the mountain)
export function nearestU(R, x, y) { let bi = R.iFoot || 0, bd = 1e18; for (let i = bi; i < R.pts.length; i++) { const d = (R.pts[i][0] - x) ** 2 + (R.pts[i][1] - y) ** 2; if (d < bd) { bd = d; bi = i; } } return R.cum[bi] / R.len; }
// A river can run its phases quicker (`quick`, a factor on all of them but the ride) and start with a skid (`skid` s:
// a crash landing on the road that throws the kart off the side into the river). The phase times come back with it.
export function sweptPhase(c) {
  const T0 = c.sweptT0 || SWEPT_T, q = c.sweptQ || 1, sk = c.sweptSk || 0, e = clamp(T0 - c.sweptT, 0, T0);
  const t1 = sk + SPLASH * q, t2 = sk + RIDE0 * q, R1 = T0 - (SHALLOW + ASHORE) * q, R2 = R1 + SHALLOW * q, at = { e, R1, R2, t1, sk, q };
  if (e < sk) return { k: 'skid', f: e / sk, ...at };
  if (e < t1) return { k: 'splash', f: (e - sk) / (t1 - sk), ...at };
  if (e < t2) return { k: 'whirl', f: (e - t1) / (t2 - t1), ...at };
  if (e < R1) return { k: 'ride', f: (e - t2) / (R1 - t2), ...at };
  if (e < R2) return { k: 'shallow', f: (e - R1) / (R2 - R1), ...at };
  return { k: 'ashore', f: (e - R2) / (T0 - R2), ...at };
}
export const sweptU = f => f ** 0.95;   // how far down the river the ride is (a touch quicker later on)
// into a river: from where the kart is now (c.x, c.y), at the river's nearest point
export function sweepInto(c, z, R, which) {
  c.sweptR = which; c.sweptT = c.sweptT0 = R.ride; c.sweptQ = R.quick; c.sweptSk = R.skid; c.sweptX = c.x; c.sweptY = c.y; c.sweptS = c.s; c.sweptH = c.heading; c.sweptU0 = nearestU(R, c.x, c.y);
  c.speed = 0; c.skx = c.sky = 0; c.spinT = 0; c.air = 0; c.trick = false; c.cliffJump = false; c.boost = 0; c.off = false;
}
export function torrentRide(c, dt) {
  const T = c.T, z = T.mech.cliffs[0], R = riverFor(z, c), e0 = (c.sweptT0 || SWEPT_T) - c.sweptT;
  c.sweptT -= dt;
  const P = sweptPhase(c), e1 = P.e, R1 = P.R1, R2 = P.R2, AS = (c.sweptT0 || SWEPT_T) - R2, crossed = t => e0 < t && e1 >= t, B = trackSample(T, R.sOut), lat = R.outLat, bx = R.out.x, by = R.out.y;
  const u0 = c.sweptU0 || 0, S0 = torrentAt(R, u0), L = torrentAt(R, 1), W = R.shore, t = this.time, road = Math.atan2(B.ty, B.tx);
  let x = c.x, y = c.y, h = c.heading;
  const dE = Math.hypot(c.sweptX - S0.x, c.sweptY - S0.y), E = P.sk > 0 ? { x: S0.x + (c.sweptX - S0.x) * Math.min(1, 40 / Math.max(1, dE)), y: S0.y + (c.sweptY - S0.y) * Math.min(1, 40 / Math.max(1, dE)) } : null;   // (after a skid: where it goes in, at the water's edge)
  if (P.k === 'skid') {   // a crash landing: bouncing and slewing off the side of the road, across the grass into the river
    const k = P.f, dx = E.x - c.sweptX, dy = E.y - c.sweptY; x = c.sweptX + dx * (1 - (1 - k) ** 1.6); y = c.sweptY + dy * (1 - (1 - k) ** 1.6); h = c.sweptH + k * 2.4;
    for (const b of [0.35, 0.7]) if (crossed(P.sk * b)) { for (let m = 0; m < 5; m++) this.fxPuff(x + Math.cos(m * 1.3) * 12, y + Math.sin(m * 1.3) * 12, '#a1887f', 10, 0.5, Math.cos(m * 1.3) * 60, Math.sin(m * 1.3) * 60); this.sound('land', c, 0.6); }   // dust at each bounce
    if (crossed(P.sk * 0.97)) { this.sound('hit_splash', c, 1); this.jolt(c, 0.5); this.fxRing(E.x, E.y, '#b3e5fc', 70, 0.45, 6); this.fxRing(E.x, E.y, '#ffffff', 100, 0.6, 7); this.fxDrops(E.x, E.y, 22, '#e1f5fe', 230, 5); }   // and in
  } else if (P.k === 'splash') {   // under where it came down, drifting into the middle of the current and bobbing back up
    const k = P.f * P.f * (3 - 2 * P.f), fx = E ? E.x : c.sweptX, fy = E ? E.y : c.sweptY; x = fx + (S0.x - fx) * k; y = fy + (S0.y - fy) * k; h = c.sweptH + e1 * 2.5;
    if (crossed(P.sk + (P.t1 - P.sk) * 0.55)) { this.fxDrops(x, y, 12, '#e1f5fe', 160, 4); this.fxRing(x, y, '#ffffff', 60, 0.5, 5); this.sound('hit_splash', c, 0.6); }   // (back up for air)
  } else if (P.k === 'whirl') {   // an eddy: round and round, turning to face downstream
    const k = P.f, r = 30 * (1 - k), a = c.idx + k * TAU * 1.6;
    x = S0.x + Math.cos(a) * r; y = S0.y + Math.sin(a) * r; h = a + Math.PI / 2 + (S0.a - (a + Math.PI / 2)) * k * k;
  } else if (P.k === 'ride') {   // carried down the river, drifting across the current and yawing (calming down into the pool)
    const Q = torrentAt(R, u0 + (1 - u0) * sweptU(P.f)), calm = 1 - 0.7 * clamp((P.f - 0.85) / 0.15, 0, 1), w = (Math.sin(t * 0.9 + c.idx) * 24 + Math.sin(t * 2.3 + c.idx * 2) * 8) * calm;
    x = Q.x - Math.sin(Q.a) * w; y = Q.y + Math.cos(Q.a) * w; h = Q.a + (Math.sin(t * 1.3 + c.idx) * 0.6 + Math.sin(t * 3.1) * 0.15) * calm;
  } else if (P.k === 'shallow') {   // the last of the current drifts it across the pool onto the beach, slowing
    const k = 1 - (1 - P.f) ** 2, w0 = (Math.sin(t * 0.9 + c.idx) * 24 + Math.sin(t * 2.3 + c.idx * 2) * 8) * 0.3 * (1 - k);
    x = L.x + (W.x - L.x) * k - Math.sin(L.a) * w0; y = L.y + (W.y - L.y) * k + Math.cos(L.a) * w0;
    const want = Math.atan2(W.y - L.y, W.x - L.x); h = L.a + Math.atan2(Math.sin(want - L.a), Math.cos(want - L.a)) * smooth01(P.f) + Math.sin(t * 2) * 0.12 * (1 - P.f);
  } else {   // ashore: up the beach, dripping, then a turn onto the road
    const k = smooth01(P.f), up = Math.atan2(by - W.y, bx - W.x); x = W.x + (bx - W.x) * k; y = W.y + (by - W.y) * k;
    h = up + Math.atan2(Math.sin(road - up), Math.cos(road - up)) * smooth01(clamp((P.f - 0.55) / 0.45, 0, 1));
    for (let q = 0.06; q < 0.7; q += 0.09) if (crossed(R2 + AS * q)) this.fxDrops(x - Math.cos(h) * c.L * 0.4, y - Math.sin(h) * c.L * 0.4, 3, '#b3e5fc', 40, 3);   // dripping as it goes
  }
  if (crossed(R2)) { this.fxRing(x, y, '#e1f5fe', 50, 0.4, 4); this.fxDrops(x, y, 8, '#b3e5fc', 110, 4); this.sound('land', c, 0.5); }   // grounding in the shallows
  if (crossed(R2 + AS * 0.72)) { this.fxDrops(x, y, 18, '#e1f5fe', 150, 3); this.sound('hit_splash', c, 0.25); }   // a shake: the water flying off it
  c.speed = clamp(Math.hypot(x - c.x, y - c.y) / Math.max(dt, 1e-4), 0, 600); c.x = x; c.y = y; c.heading = h;
  c.s = c.sweptS + (R.sOut - c.sweptS) * clamp(e1 / R2, 0, 1); c.progress = this.progressOf(c);   // (it counts as driving on down the road)
  c.skx = c.sky = 0; c.jx = c.jy = 0; c.air = 0;
  if (c.sweptT > 0) return;
  // back on the road beside the pool, stopped
  c.sweptT = 0; c.s = R.sOut; c.lat = c.prevLat = c.lineS = lat; c.x = bx; c.y = by; c.heading = road;
  c.speed = 0; c.spinT = 0; c.hitCd = 1.5; c.kCmd = 0; c.off = false; c.reach = 1; c.progress = this.progressOf(c);
}
const smooth01 = f => { const k = clamp(f, 0, 1); return k * k * (3 - 2 * k); };
