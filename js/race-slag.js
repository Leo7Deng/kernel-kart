// Kernel Kart: the slag pour. A long corner wraps round a crucible, and a ladle on a crane over it tips a fresh charge
// of metal in on a beat. The ladle tips (the warning), the crucible overflows, and a surge of molten slag sweeps out
// across the inside of the corner, holds, then drains back and crusts over. Caught in it and you're scorched: thrown
// out of it, spinning, most of your speed gone.
// The call is all about the inside line, which is much the shorter way round and exactly where lifting puts you (the
// line tightens onto the apex as you slow). Dry: lift and take the apex. Pouring while you're in the corner: carry speed
// and the line stays out on the dry outside lane (too much and you run off the outside), lift to arrive once it has
// drained, or floor it and beat the pour round the apex. Once the slag is down, the steering keeps you out of it; it's
// the surge that catches you, and it comes faster than you can move over.
// It's a pure function of the race clock (period, phase), so a race replays exactly and every screen agrees online.
import { clamp } from './core.js';
import { curvAt, halfWAt, trackSample } from './geometry.js';
import { blockedByShield, untouchable } from './rules.js';
import { eta, nearestS } from './race-mechanics.js';

export const POUR_WARN = 1.4, SURGE = 0.45, HOLD = 1.5, DRAIN = 1.3;   // the ladle tipping, the surge running out, full, draining (s)
const SPEED_LEFT = 0.4, THROW = 240, HIT_CD = 3;                         // scorched: what's left of your speed, the shove out of it, once a pour
const SETUP = 350;                                                       // the wide line starts setting up this far before the corner

export function buildSlag(T) {
  const sc = T.def.scale;
  return (T.def.slag || []).map(d => {
    const s0 = nearestS(T, d.from[0] * sc, d.from[1] * sc), s1 = nearestS(T, d.to[0] * sc, d.to[1] * sc);
    let k = 0, kMax = 1e-6; for (let s = s0; s <= s1; s += 4) { const kk = curvAt(T, s); k += kk; kMax = Math.max(kMax, Math.abs(kk)); }
    return { s0, s1, side: Math.sign(k) || 1, R: 1 / kMax, cover: d.cover || 0.5, beats: [].concat(d.period || 8), phase: d.phase || 0, wide: d.wide || 0,
      pit: d.pit ? { x: d.pit[0] * sc, y: d.pit[1] * sc, r: d.pit[2] * sc } : null, crane: d.crane ? { x: d.crane[0] * sc, y: d.crane[1] * sc } : null };
  });
}
const smooth = x => x * x * (3 - 2 * x), easeOut = x => 1 - (1 - x) * (1 - x);
// where the pour is at race time t: u = seconds since this pour's warning began; warn 0..1 while the ladle tips; level
// 0..1 how far the surge has run out across the road (molten wherever it reaches); pour while metal is falling from the
// ladle; since = seconds since it last drained (for the crust it leaves). The beat (`period`) is the time from one pour
// to the next, or a list of them that repeats (7, 7, 8.5: a longer wait every third pour, so a lap doesn't keep
// meeting it at the same moment)
export function slagPhase(z, t) {
  const B = z.beats; let C = 0; for (const b of B) C += b;
  let u = ((t + z.phase) % C + C) % C, i = 0; while (u >= B[i] && i < B.length - 1) u -= B[i++];
  const v = u - POUR_WARN, Pprev = B[(i + B.length - 1) % B.length];
  if (v < 0) return { u, warn: u / POUR_WARN, level: 0, pour: u > POUR_WARN - 0.35, since: u + Pprev - POUR_WARN - SURGE - HOLD - DRAIN };
  const level = v < SURGE ? easeOut(v / SURGE) : v < SURGE + HOLD ? 1 : v < SURGE + HOLD + DRAIN ? 1 - smooth((v - SURGE - HOLD) / DRAIN) : 0;
  return { u, warn: 0, level, pour: v < SURGE + HOLD * 0.7, since: v - SURGE - HOLD - DRAIN };
}
export const slagLevel = (z, t) => slagPhase(z, t).level;
// in a calm race (a time trial) it never pours: the ladle hangs level, the corner dry (drawn from this, draw-mechanics.js)
export const SLAG_REST = Object.freeze({ u: 99, warn: 0, level: 0, pour: false, since: 99 });
export const slagNow = (race, z, t) => race.calm ? SLAG_REST : slagPhase(z, t);
// how far the slag reaches across the road (world units from the inside edge) at distance s along the lap; it tapers
// in and out over the ends of the corner
export const slagTaper = (z, s) => clamp(Math.min(s - z.s0, z.s1 - s) / 160, 0, 1);
export function slagWidth(z, s, hw, t) { return slagLevel(z, t) * z.cover * 2 * hw * slagTaper(z, s); }
// the most the slag is up at any moment between t0 and t1
function levelMax(z, t0, t1) { let m = 0; for (let t = t0; t <= t1 + 1e-6; t += 0.1) m = Math.max(m, slagLevel(z, t)); return m; }
// would the apex line meet the slag? Round the corner past the turn-in (from there on the line hugs the inside) at
// about the apex speed, starting tIn from now: anywhere the slag is out as far as the kart's inside wheels
function apexMeets(race, c, z, tIn) {
  const T = c.T, s0 = Math.max(c.s, z.s0 + (z.s1 - z.s0) * 0.12), s1 = z.s1 - 40, v = Math.sqrt(c.grip * z.R * 0.55);
  for (let s = s0; s <= s1; s += 30) {
    const t = race.time + tIn + (s - Math.max(c.s, z.s0)) / v, hw = halfWAt(T, s);
    if (slagWidth(z, s, hw, t) > c.W * 0.8) return true;
  }
  return false;
}

export function slagCar(c, dt) {
  if (this.calm) return;
  for (const z of c.T.mech.slag) {
    const ds = z.s0 - c.s;
    if (c.human && ds > 250 && ds < 1000 && c.slagWarn !== c.lap) {
      const v = Math.max(c.speed, 150), t0 = this.time + ds / v;
      if (levelMax(z, t0, t0 + (z.s1 - z.s0) / Math.max(v * 0.7, 150)) > 0.3) { c.slagWarn = c.lap; this.feed('warn', 'slag', c); }
    }
    if (c.s < z.s0 || c.s > z.s1 || c.air > 0 || untouchable(c)) continue;
    const hw = halfWAt(c.T, c.s), w = slagWidth(z, c.s, hw, this.time); if (w <= 0) continue;
    const depth = z.side * c.lat + c.W * 0.35 - (hw - w);   // how far your inside wheels are into it
    if (depth <= 0) continue;
    if (this.time - (c.slagHit ?? -9) > HIT_CD) {
      // scorched: thrown out toward the dry side, spinning, most of your speed gone
      c.slagHit = this.time;
      if (blockedByShield(this, c)) continue;
      const q = trackSample(c.T, c.s);
      c.speed *= SPEED_LEFT; c.spinT = Math.max(c.spinT, 0.5); c.hitCd = Math.max(c.hitCd, 0.8);
      c.skx -= q.nx * z.side * THROW; c.sky -= q.ny * z.side * THROW;
      this.fxHit(c, '#ff8f00', 'slag');
    } else if (c.speed > 90) c.speed -= (c.speed - 90) * 3 * dt;   // still wading out of it
    if (Math.floor(this.time * 20) % 2) this.fxPuff(c.x - Math.cos(c.heading) * 22, c.y - Math.sin(c.heading) * 22, '#4e342e', 11, 0.7);
  }
}

// once a frame: the surge's roar from the crucible as it overflows (for whoever's near enough to hear it)
export function slagUpdate(dt) {
  for (const z of this.track.mech.slag) {
    if (!z.pit || !this.started || this.calm) continue;
    const a = slagPhase(z, this.time - dt), b = slagPhase(z, this.time);
    if (a.u < POUR_WARN && b.u >= POUR_WARN) this.sound('slag', z.pit, 1);
  }
}

// the line round the Crucible: with `wide`, carry speed and it sets up on the outside and stays out there (lift and it
// tucks in to the apex as usual); and once the slag is down, it stays on the dry side of it. It doesn't see the surge
// coming: that's yours to read.
export function slagLine(c, tgt, prof, edgeIn) {
  for (const z of c.T.mech.slag) {
    // (it sets up out there down the approach, from SETUP before the corner, once the corner's in view; and comes back
    // in over the end of the corner, where the slag tapers off, so it's not on the outer edge as the road narrows)
    const f = clamp(Math.min((c.s - (z.s0 - SETUP)) / 200, (z.s1 + 100 - c.s) / 250), 0, 1);
    if (f <= 0) continue;
    if (z.wide) tgt -= z.side * (1 - c.reach) * z.wide * edgeIn * f;
    if (c.s < z.s0 - 60 || c.s > z.s1 || this.calm) continue;
    const hw = halfWAt(c.T, c.s + 30), w = slagWidth(z, c.s + 30, hw, this.time);
    if (w > 0) tgt = z.side * Math.min(z.side * tgt, Math.max(-edgeIn, hw - w - c.W * 0.7 - 8));
  }
  return tgt;
}

// a bot coming to the Crucible. If the slag will be up while it's round the apex (the surge, or already up), it carries
// speed so its line stays out on the dry outside lane: a third of the way from the least that keeps it out of the slag
// to the most that keeps it on the road. Unless the slag is about to drain as it gets there: then it lifts and arrives
// just as it goes down (a wait only pays when it's short: the outside lane costs well over half a second). It makes
// up its mind as it turns in (c.ai.slag) and sticks to it round the corner: changing its mind halfway round would have
// it lifting off the outside lane, or flooring it off the apex.
export function slagAI(c, skill, brake, plan) {
  if (this.calm) return;   // (dry the whole way round: the apex)
  for (const z of c.T.mech.slag) {
    const ds = z.s0 - c.s; if (ds > 1500 || c.s > z.s1) continue;
    const tIn = ds > 0 ? eta(c, ds, skill) : 0;
    let m = c.ai.slag; if (m && m.lap !== c.lap) m = null;
    if (!m || !m.locked) {
      const ph = slagPhase(z, this.time + tIn), left = ph.level > 0 ? POUR_WARN + SURGE + HOLD + DRAIN - ph.u : 0;
      const mode = !apexMeets(this, c, z, tIn) ? 'apex' : left > 0 && left < 0.2 + (skill - 0.92) * 1.0 ? 'wait' : 'wide';
      m = c.ai.slag = { lap: c.lap, mode, locked: ds < 120 };
    }
    if (m.mode === 'apex') continue;   // dry the whole way round: the apex
    if (m.mode === 'wait') {   // while it's draining or just about to, a short wait at the entry buys the apex
      const ph = slagPhase(z, this.time + tIn), left = ph.level > 0 ? POUR_WARN + SURGE + HOLD + DRAIN - ph.u : 0;
      if (ds > 60 && left > 0) plan.caps.push({ ds: Math.max(0, ds - 40), v: Math.max(60, ds / (tIn + left + 0.15 + (1.1 - skill) * 0.6)) });
      continue;
    }
    // the steering tucks in by (1/k - 1.08 v²/G) of the way to the inside edge: keep that short of the slag
    // (the line sits out at -wide·edgeIn when flat out, so it reaches in by edgeIn·(reach·(1+wide) - wide))
    const hw = halfWAt(c.T, (z.s0 + z.s1) / 2), edgeIn = hw - c.W * 0.7, margin = 12 + (1.09 - skill) * 50;
    const reachMax = (hw - z.cover * 2 * hw - c.W * 0.35 + 4 - margin + z.wide * edgeIn) / ((1 + z.wide) * edgeIn);
    if (reachMax >= 1) continue;
    const vNeed = Math.sqrt(Math.max(0, c.grip * (z.R - Math.max(0, reachMax) * edgeIn)));   // (G ≈ 1.08 × grip with the lift-and-gas, cancelling the 1.08)
    const vMax = Math.sqrt(c.grip * (z.R + hw - c.W * 0.8)) * 0.97;
    const zone = { s0: z.s0 - 120, s1: z.s1, v: Math.min(vNeed + (0.3 + (skill - 0.92) * 0.3) * (vMax - vNeed), vMax), vMax }; plan.zones.push(zone);
    if (c.s > z.s0 - SETUP) c.ai.stayWide = true;   // and it means to stay out there (it knows the pour is coming)
    if (c.s > z.s0 - 120 && c.speed < zone.v + 8) c.ai.carry = true;   // in the corner at the planned speed: a slide at the limit is the plan, don't lift for it
  }
}
