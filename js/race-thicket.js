// Kernel Kart: the Tinder Grove (Kernel Pretzel). A shortcut down the volcano's flank, the Ash Run, is choked by a
// thicket of dead, bone-dry trees and thornbush. Now and then, as the volcano erupts, it lobs a fireball at it instead
// of the road (you see it coming: a flaming glob arcing over and a ring of fire marked on the thicket). The thicket goes
// up in flames for a moment, and leaves a charred gap you can drive through, its embers glowing and dimming as the
// burnt trunks either side creak and lean in. Then they topple across it and it's shut again, until the next fireball.
// The fork into it is like the logic gate's (race-gate.js): lift to tuck in on the inside and you take the Ash Run.
// While it's shut your line keeps you out; from the moment the fireball's in the air it lets you in, so it's all
// timing: arrive while it's still burning, or once the trunks are coming down, and you plough into it, bounced back
// onto the long way all but stopped. So: lift into the gap if you'll be there while it's open (the embers are the
// timer), else stay on the gas and take the Long Way round.
// The thicket's timer lives on the race (race.thicket: when the last fireball was thrown and when it landed, plain
// data, from race.rng); T.mech only holds where things are. Nothing here runs on a track without `thickets`.
import { clamp } from './core.js';
import { halfWAt, projectToTrack, trackSample } from './geometry.js';
import { blockedByShield, untouchable } from './rules.js';
import { eta, nearestS } from './race-mechanics.js';

export const BURN = 1.4;      // it burns this long after the fireball lands (blocked, and on fire)
export const CLOSE = 0.75;    // the burnt trunks topple across the gap over this long at the end of its open time
const KEEP = 0.2, SPIN = 0.9; // into the thicket: the speed you keep, how long you spin
const LIGHT = 0.75, FLIGHT = 2.4, OPEN = 7;   // defaults: the chance an eruption lights it (while it's shut), the fireball's flight, and how long it stays open (from the fire going out to the trunks down)

// thickets: [{ at: [x, y], open, light, flight }] (layout units): where it stands across the shortcut's road. The fork it
// blocks is the track's fork with `thicket: true`. Built per route: the wall only on the road it's on (the Ash Run);
// every route keeps the entry, so the indices line up.
export function buildThickets(T) {
  const sc = T.def.scale;
  return (T.def.thickets || []).map(d => {
    const x = d.at[0] * sc, y = d.at[1] * sc, s = nearestS(T, x, y), q = trackSample(T, s);
    const on = Math.hypot(q.x - x, q.y - y) < halfWAt(T, s);
    return { x, y, open: d.open || OPEN, light: d.light ?? LIGHT, flight: d.flight || FLIGHT, wall: on ? { s, q, hw: halfWAt(T, s) } : null };
  });
}
// thicket i's state at race time t: 'shut', 'incoming' (a fireball on its way: lands in u s), 'burning' (u s more),
// 'open' (left s until the trunks start to fall), 'closing' (they're falling: down in u s)
export function thicketState(race, i, t) {
  const st = race.thicket && race.thicket[i], z = race.track.mech.thickets[i];
  if (race.calm) return { k: 'open', left: z.open - CLOSE, u: z.open };   // (calm, a time trial: the charred gap stays open, as the logic gate does)
  if (!st || t < st.tT) return { k: 'shut' };
  if (t < st.tL) return { k: 'incoming', u: st.tL - t };
  const a = t - st.tL; if (a < BURN) return { k: 'burning', u: BURN - a };
  const u = BURN + z.open - a;
  return u > CLOSE ? { k: 'open', left: u - CLOSE, u } : u > 0 ? { k: 'closing', u } : { k: 'shut' };
}
// the fork into thicket i on route T (only a road that hasn't taken it yet), and the road the thicket stands on
function forkOf(T) { if (!T.forks || !T.forkS) return null; const k = T.forks.findIndex(f => f.thicket); return k >= 0 && T.forkS[k] ? { k, fs: T.forkS[k], f: T.forks[k] } : null; }
export function thicketRoute(race, i) { for (const R of race.routes) { const w = R.mech && R.mech.thickets[i] && R.mech.thickets[i].wall; if (w) return { R, w }; } return null; }

// once a frame (after the volcano: race-volcano.js): an eruption while the thicket's shut may throw a fireball at it
// instead of the road; then its landing (it goes up in flames) and the trunks coming down
export function thicketUpdate() {
  const M = this.track.mech; if (!M.thickets.length || !this.started || this.calm) return;
  const S = this.thicket || (this.thicket = M.thickets.map(() => ({ tT: -99, tL: -99, seen: -99, fx: 2 })));
  const V = this.volc, last = V && V.length ? V[0].last : -99;
  S.forEach((st, i) => {
    const z = M.thickets[i];
    if (last > st.seen) {
      st.seen = last;
      if (thicketState(this, i, this.time).k === 'shut' && this.rng() < z.light) { st.tT = this.time; st.tL = this.time + z.flight; st.fx = 0; }
    }
    const k = thicketState(this, i, this.time).k;
    if (st.fx < 1 && this.time >= st.tL) {   // it lands: up in flames
      st.fx = 1; this.sound('ignite', z); this.fxBoom(z.x, z.y, 1.2); this.fxSparks(z.x, z.y, 18, '#ffb300', 260);
      for (const c of this.humans) { const f = forkOf(c.T); if (f && f.fs.sLock - c.s > 0 && f.fs.sLock - c.s < 2400) this.feed('warn', 'fire', c, null, 1); }
    }
    if (st.fx < 2 && k === 'closing') { st.fx = 2; this.sound('timber', z); }
    if (st.fx < 3 && st.fx >= 2 && k === 'shut' && this.time > st.tL) { st.fx = 3; for (let n = 0; n < 5; n++) this.fxPuff(z.x + (n - 2) * 22, z.y, '#5a4a4e', 18, 1, (n - 2) * 20, -30); }
  });
}

// one car, one frame: through the thicket's mouth on the Ash Run (only while it's open: else you plough into it)
export function thicketCar(c, dt, prevS) {
  const M = c.T.mech; if (!M.thickets.length || c.finished) return;
  // run wide off the Ash Run's turn-in onto the long way where they split: you're on that road now
  const w0 = M.thickets[0].wall;
  if (w0 && c.s < w0.s + 200 && Math.abs(c.lat) > halfWAt(c.T, c.s) + 12 && c.air <= 0) {
    const R0 = longWay(this, c.T), s = nearestS(R0, c.x, c.y), q = trackSample(R0, s);
    if (Math.hypot(q.x - c.x, q.y - c.y) < halfWAt(R0, s)) { this.switchRoute(c, R0, s); return; }
  }
  M.thickets.forEach((z, i) => {
    const w = c.T.mech.thickets[i].wall;
    if (!w || !(prevS < w.s && c.s >= w.s)) return;
    const st = thicketState(this, i, this.time);
    if (st.k === 'open' || c.air > 0 || untouchable(c) || (c.oc > 0 && c.ocT) || Math.abs(c.lat) > w.hw + c.W * 0.5) return;
    if (blockedByShield(this, c)) { c.speed *= 0.6; return; }   // a Firewall smashes through
    // into the thicket: bounced back onto the long way, at its inside edge, all but stopped
    const R0 = longWay(this, c.T);
    const pr = projectToTrack(R0, c.x, c.y, nearestS(R0, c.x, c.y), 200), hw = halfWAt(R0, pr.s), q = trackSample(R0, pr.s);
    const lat = clamp(pr.lat, -hw + c.W * 0.6, hw - c.W * 0.6);
    c.T = R0; c.s = pr.s; c.lat = c.prevLat = c.lineS = lat; c.x = q.x + q.nx * lat; c.y = q.y + q.ny * lat; c.heading = Math.atan2(q.ty, q.tx);
    c.speed *= KEEP; c.skx = c.sky = 0; c.kCmd = 0; c.spinT = Math.max(c.spinT, SPIN); c.hitCd = Math.max(c.hitCd, 1);
    c.progress = this.progressOf(c);
    if (st.k === 'burning') this.fxSparks(w.q.x, w.q.y, 16, '#ffb300', 240);
    this.fxHit(c, st.k === 'burning' ? '#ff7a1a' : '#8a6a4a', 'thicket');
  });
}
// the road the Ash Run leaves (the same forks taken, but not the thicket's)
function longWay(race, T) { const k = T.forks.findIndex(f => f.thicket), b = T.bits & ~T.forks[k].bit; return race.routes.find(Q => Q.bits === b) || race.routes[0]; }

// the line for a player at the thicket's fork: shut (and no fireball on its way), it keeps you out of the apex
export function thicketLine(c, tgt) {
  const F = forkOf(c.T); if (!F || !c.human) return tgt;
  const fs = F.fs, ds = fs.sLock - c.s; if (ds < -10 || ds > fs.sLock - fs.s + 450) return tgt;
  return thicketState(this, 0, this.time).k === 'shut' ? tgt * 0.2 : tgt;
}
// the road car c is set for at the thicket's fork coming up, for the dotted line ahead and the minimap (as Race.splitGuess)
export function thicketGuess(c, far) {
  const F = forkOf(c.T); if (!F || !this.track.mech.thickets.length) return null;
  const fs = F.fs, ds = fs.sLock - c.s; if (ds < 0 || ds > far) return null;
  const alt = this.routes[fs.alt], k = thicketState(this, 0, this.time).k;
  return { fs, alt, route: k !== 'shut' && c.speed < 1.35 * Math.sqrt(c.grip / fs.kAlt) ? alt : c.T };
}

// a bot at the thicket's fork: through the gap if it'll be open when it gets there (out by a skill-dependent margin
// either side: the fire out, the trunks still up), committed once tucked in; else round the long way
export function thicketAI(c, skill, brake, plan) {
  const F = forkOf(c.T); if (!F || c.finished) return;
  const fs = F.fs, ds = fs.sLock - c.s; if (ds < -20 || ds > 1500) return;
  const tr = thicketRoute(this, 0); if (!tr) return;
  const toWall = ds + Math.max(0, tr.w.s - fs.sAlt), m = 0.25 + (1.1 - skill) * 1.2;
  const plans = c.ai.thPlan || (c.ai.thPlan = {}), key = c.lap;
  const tArr = eta(c, toWall, skill) + 0.1, st = thicketState(this, 0, this.time + tArr);
  let go = st.k === 'open' && st.left > m && thicketState(this, 0, this.time + tArr - m).k === 'open';
  if (plans[key] === true && ds < 160) go = st.k === 'open';   // committed: it's tucked in by now
  plans[key] = go;
  if (!go) { if (ds < fs.sLock - fs.s + 300) c.ai.stayWide = true; return; }
  const edgeIn = halfWAt(c.T, fs.s) - c.W * 0.7;
  const vIn = Math.sqrt(Math.max(1, c.grip * (1 / fs.kW - 0.97 * edgeIn) / 1.08)), vAlt = Math.sqrt(c.grip / Math.max(fs.kAlt, 1e-5)) * skill;
  plan.caps.push({ ds: ds - (fs.sLock - fs.s + 220), v: Math.min(vIn, vAlt) * 0.97 });
}
