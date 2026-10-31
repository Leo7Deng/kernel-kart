// Kernel Kart: the slag pour. A ladle tips metal into a crucible on a beat; slag surges across the inside of a long
// corner, holds, drains and crusts. Caught by it: scorched (thrown out, spinning, most speed gone).
// Lifting tightens the line onto the apex, i.e. into the slag: while it's up, carry speed to stay on the dry outside
// (too much runs you off), arrive once drained, or beat the pour. A pure function of the race clock (replays, online).
import { Math } from './detmath.js';   // deterministic maths, the same on every computer (detmath.js)
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
// the pour at race time t: u = s since this pour's warning; warn 0..1 while the ladle tips; level 0..1 how far the surge
// has run across the road; pour while metal falls; since = s since it last drained (crust). `period` is the gap between
// pours, or a repeating list (7, 7, 8.5) so a lap doesn't keep meeting it at the same moment
export function slagPhase(z, t) {
  const B = z.beats; let C = 0; for (const b of B) C += b;
  let u = ((t + z.phase) % C + C) % C, i = 0; while (u >= B[i] && i < B.length - 1) u -= B[i++];
  const v = u - POUR_WARN, Pprev = B[(i + B.length - 1) % B.length];
  if (v < 0) return { u, warn: u / POUR_WARN, level: 0, pour: u > POUR_WARN - 0.35, since: u + Pprev - POUR_WARN - SURGE - HOLD - DRAIN };
  const level = v < SURGE ? easeOut(v / SURGE) : v < SURGE + HOLD ? 1 : v < SURGE + HOLD + DRAIN ? 1 - smooth((v - SURGE - HOLD) / DRAIN) : 0;
  return { u, warn: 0, level, pour: v < SURGE + HOLD * 0.7, since: v - SURGE - HOLD - DRAIN };
}
export const slagLevel = (z, t) => slagPhase(z, t).level;
// calm race (time trial): never pours
export const SLAG_REST = Object.freeze({ u: 99, warn: 0, level: 0, pour: false, since: 99 });
export const slagNow = (race, z, t) => race.calm ? SLAG_REST : slagPhase(z, t);
// how far the slag reaches across the road (world units from the inside edge) at s; tapers over the corner's ends
export const slagTaper = (z, s) => clamp(Math.min(s - z.s0, z.s1 - s) / 160, 0, 1);
export function slagWidth(z, s, hw, t) { return slagLevel(z, t) * z.cover * 2 * hw * slagTaper(z, s); }
// the most the slag is up at any moment between t0 and t1
function levelMax(z, t0, t1) { let m = 0; for (let t = t0; t <= t1 + 1e-6; t += 0.1) m = Math.max(m, slagLevel(z, t)); return m; }
// would the apex line meet the slag? Past the turn-in at about apex speed, starting tIn from now, anywhere the slag
// reaches the kart's inside wheels
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

// once a frame: the surge's roar as it overflows
export function slagUpdate(dt) {
  for (const z of this.track.mech.slag) {
    if (!z.pit || !this.started || this.calm) continue;
    const a = slagPhase(z, this.time - dt), b = slagPhase(z, this.time);
    if (a.u < POUR_WARN && b.u >= POUR_WARN) this.sound('slag', z.pit, 1);
  }
}

// the line round the Crucible: with `wide`, carry speed and it stays on the outside (lift and it tucks in); once the
// slag is down it stays on the dry side. It doesn't anticipate the surge.
export function slagLine(c, tgt, prof, edgeIn) {
  for (const z of c.T.mech.slag) {
    // sets up from SETUP before the corner, comes back in where the slag tapers off (not on the edge as the road narrows)
    const f = clamp(Math.min((c.s - (z.s0 - SETUP)) / 200, (z.s1 + 100 - c.s) / 250), 0, 1);
    if (f <= 0) continue;
    if (z.wide) tgt -= z.side * (1 - c.reach) * z.wide * edgeIn * f;
    if (c.s < z.s0 - 60 || c.s > z.s1 || this.calm) continue;
    const hw = halfWAt(c.T, c.s + 30), w = slagWidth(z, c.s + 30, hw, this.time);
    if (w > 0) tgt = z.side * Math.min(z.side * tgt, Math.max(-edgeIn, hw - w - c.W * 0.7 - 8));
  }
  return tgt;
}

// bots: if the slag will be up round the apex, carry speed to stay on the dry outside (a third of the way from the
// least that keeps out of the slag to the most that stays on the road), unless it's about to drain: then lift and
// arrive as it goes down (only pays when short; the outside lane costs over half a second). Decided at turn-in
// (c.ai.slag) and kept round the corner.
export function slagAI(c, skill, brake, plan) {
  if (this.calm) return;   // dry: the apex
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
    // (the line sits at -wide·edgeIn flat out, so it reaches in by edgeIn·(reach·(1+wide) - wide))
    const hw = halfWAt(c.T, (z.s0 + z.s1) / 2), edgeIn = hw - c.W * 0.7, margin = 12 + (1.09 - skill) * 50;
    const reachMax = (hw - z.cover * 2 * hw - c.W * 0.35 + 4 - margin + z.wide * edgeIn) / ((1 + z.wide) * edgeIn);
    if (reachMax >= 1) continue;
    const vNeed = Math.sqrt(Math.max(0, c.grip * (z.R - Math.max(0, reachMax) * edgeIn)));   // (G ≈ 1.08 × grip with the lift-and-gas, cancelling the 1.08)
    const vMax = Math.sqrt(c.grip * (z.R + hw - c.W * 0.8)) * 0.97;
    const zone = { s0: z.s0 - 120, s1: z.s1, v: Math.min(vNeed + (0.3 + (skill - 0.92) * 0.3) * (vMax - vNeed), vMax), vMax }; plan.zones.push(zone);
    if (c.s > z.s0 - SETUP) c.ai.stayWide = true;   // it means to stay out there
    if (c.s > z.s0 - 120 && c.speed < zone.v + 8) c.ai.carry = true;   // at the planned speed a slide at the limit is the plan: don't lift
  }
}
