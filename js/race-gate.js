// Kernel Kart: the logic gate (Silicon Circuit). A fork where the short road, the Bus, runs through a gate, and a push
// switch on the inside kerb of a corner some way before it. The gate is a one-shot timer (a 555): drive over the switch and
// the gate opens for a few seconds, for everyone who gets there in time, you and whoever's behind you. Press it again
// while it's open and it starts its time again. In its last moments the bars slide shut, and a kart that dives in then
// hits them: thrown back onto the long way round, all but stopped and spinning. Fully shut, your line keeps you out.
// So it's all throttle: lift into the switch's apex (it costs a little) and then floor it to make the gate, or let
// someone ahead press it and ride their window; at the fork, lift into the Bus while it's open, or stay on the gas and
// sweep round the long way when you won't make it.
// The gate's timer lives on the race (race.gate, plain data); T.mech only holds where things are.
import { clamp } from './core.js';
import { curvAt, halfWAt, projectToTrack, trackSample } from './geometry.js';
import { blockedByShield, untouchable } from './rules.js';
import { eta, nearestS } from './race-mechanics.js';

export const CLOSE = 0.6;      // the bars slide shut over this long at the end of the open time (and hit anyone diving in)
export const SW_R = 36;        // how close to the switch's middle a kart has to pass to press it
const KEEP = 0.2, SPIN = 0.8;  // into the bars: the speed you keep, how long you spin

// gates: [{ sw: [x, y], gate: [x, y], open }] (layout units): the switch (on the inside of the corner it's at), where the
// bars stand on the short road, and how long one press holds it open (s). The fork it guards is the track's fork with
// `gate: true`. Built per route: the switch is on the shared road (so on every route), the bars only on the short one.
export function buildGates(T) {
  const sc = T.def.scale;
  return (T.def.gates || []).map(d => {
    const s = nearestS(T, d.sw[0] * sc, d.sw[1] * sc);
    let k = 0, kW = 1e-6; for (let ds = -200; ds <= 200; ds += 4) { const kk = curvAt(T, s + ds); k += kk; kW = Math.max(kW, Math.abs(kk)); }
    const side = Math.sign(k) || 1, hw = halfWAt(T, s), lat = side * (hw - (d.inset || 22)), q = trackSample(T, s);
    const gx = d.gate[0] * sc, gy = d.gate[1] * sc, gs = nearestS(T, gx, gy), gq = trackSample(T, gs);
    const on = Math.hypot(gq.x - gx, gq.y - gy) < halfWAt(T, gs);
    return { open: d.open || 6, sw: { s, lat, side, kW, hw, x: q.x + q.nx * lat, y: q.y + q.ny * lat, q }, gate: on ? { s: gs, q: gq, hw: halfWAt(T, gs) } : null };
  });
}
// the gate's state at race time t: open (safe to go through, `left` s more), closing (the bars sliding in), or shut
export function gateState(race, t) {
  if (race.calm) { const z = race.track.mech.gates[0], full = (z ? z.open : 6) - CLOSE; return { open: true, closing: false, left: full, u: full + CLOSE }; }   // (calm, a time trial: held open, as if just pressed)
  const G = race.gate, u = G ? G.until - t : -1;
  return { open: u > CLOSE, closing: u > 0 && u <= CLOSE, left: u - CLOSE, u };
}
function gateOf(race) { return race.gate || (race.gate = { until: -9, at: -9, by: -1, shut: true }); }
// the route that runs through gate i (the short road), and its gate
export function gateRoute(race, i) { for (const R of race.routes) { const g = R.mech && R.mech.gates[i] && R.mech.gates[i].gate; if (g) return { R, g }; } return null; }
// gate i's fork on route T (from T.forkS: only routes that haven't taken it yet), or null
function forkOf(T) { if (!T.forks || !T.forkS) return null; const k = T.forks.findIndex(f => f.gate); return k >= 0 && T.forkS[k] ? T.forkS[k] : null; }

// once a frame: the bars start to slide shut (a clunk at the gate)
export function gateUpdate() {
  if (!this.track.mech.gates.length) return;
  const G = gateOf(this), st = gateState(this, this.time);
  if (!G.shut && !st.open) { G.shut = true; const gr = gateRoute(this, 0); if (gr) this.sound('gateShut', { x: gr.g.q.x, y: gr.g.q.y }); }
}

// one car, one frame: over the switch (it opens the gate), and through the bars on the short road
export function gateCar(c, dt, prevS) {
  const M = c.T.mech; if (!M.gates.length || c.finished) return;
  const G = gateOf(this);
  // run wide off one road onto the other where they split (too hot for the Bus's turn-in and you're on the long way):
  // you're on that road now (but not onto the Bus past the bars: you'd have gone round them)
  if (Math.abs(c.lat) > halfWAt(c.T, c.s) + 12 && this.routes.length > 1 && c.air <= 0) {
    const other = c.T === this.routes[0] ? this.routes[1] : this.routes[0], s = nearestS(other, c.x, c.y), q = trackSample(other, s);
    const bars = other.mech.gates.some(z => z.gate && s > z.gate.s - 40);
    if (Math.hypot(q.x - c.x, q.y - c.y) < halfWAt(other, s) && !bars) { this.switchRoute(c, other, s); prevS = c.s; }
  }
  M.gates.forEach((z, i) => {
    const sw = z.sw, ds = sw.s - c.s;
    if (c.human && !this.calm && ds > 300 && ds < 900 && c.gateWarn !== c.lap) { c.gateWarn = c.lap; this.feed('warn', 'gate', c, null, gateState(this, this.time).open ? 1 : 0); }
    if (Math.abs(ds) < 60 && c.air <= 0 && Math.hypot(c.x - sw.x, c.y - sw.y) < SW_R) {
      const fresh = this.time - G.at > 0.6;
      G.until = this.time + z.open; G.at = this.time; G.by = c.idx; G.shut = false;
      if (fresh) { this.fxRing(sw.x, sw.y, '#5dffb0', 60, 0.4, 5); this.fxSparks(sw.x, sw.y, 8, '#b9ffd9', 140); this.sound('gateSet', sw, c.human ? 1 : 0.7); }
    }
    const g = z.gate; if (!g || !(prevS < g.s && c.s >= g.s)) return;
    if (gateState(this, this.time).open || c.air > 0 || untouchable(c) || (c.oc > 0 && c.ocT) || Math.abs(c.lat) > g.hw + c.W * 0.5) return;
    if (blockedByShield(this, c)) { c.speed *= 0.6; return; }   // a Firewall smashes through
    // into the bars: thrown back onto the long way, at its inside edge, all but stopped
    const R0 = this.routes[0], pr = projectToTrack(R0, c.x, c.y, c.s, 200), hw = halfWAt(R0, pr.s), q = trackSample(R0, pr.s);
    const lat = clamp(pr.lat, -hw + c.W * 0.6, hw - c.W * 0.6);
    c.T = R0; c.s = pr.s; c.lat = c.prevLat = c.lineS = lat; c.x = q.x + q.nx * lat; c.y = q.y + q.ny * lat; c.heading = Math.atan2(q.ty, q.tx);
    c.speed *= KEEP; c.skx = c.sky = 0; c.kCmd = 0; c.spinT = Math.max(c.spinT, SPIN); c.hitCd = Math.max(c.hitCd, 1);
    c.progress = this.progressOf(c);
    this.fxSparks(g.q.x, g.q.y, 14, '#ff6b5a', 220);
    this.fxHit(c, '#ff3b30', 'gate');
  });
}

// the line for a player at the gate's fork: shut, it keeps you out of the apex (you can't go that way)
export function gateLine(c, tgt) {
  const fs = forkOf(c.T); if (!fs || !c.human) return tgt;
  const ds = fs.sLock - c.s; if (ds < -10 || ds > fs.sLock - fs.s + 450) return tgt;
  const st = gateState(this, this.time);
  return st.open || st.closing ? tgt : tgt * 0.2;
}

// the road car c is set for at the gate's fork coming up, for the dotted line ahead and the minimap (as Race.splitGuess):
// the Bus while the gate's open and you're slow enough to tuck in for it, else the long way
export function gateGuess(c, far) {
  const fs = forkOf(c.T); if (!fs || !this.track.mech.gates.length) return null;
  const ds = fs.sLock - c.s; if (ds < 0 || ds > far) return null;
  const alt = this.routes[1], open = gateState(this, this.time).open;
  return { fs, alt, route: open && c.speed < 1.35 * Math.sqrt(c.grip / fs.kAlt) ? alt : c.T };
}

// a bot: press the switch this lap? (only if the gate won't be open when it gets there anyway; better bots more often,
// and ones further back more often), then at the fork: through the gate if it'll still be open when it gets there with
// room to spare (a worse bot wants more), else round the long way
export function gateAI(c, skill, brake, plan) {
  const T = c.T, M = T.mech; if (!M.gates.length || c.finished) return;
  const fs = forkOf(T), gr = gateRoute(this, 0), m = 0.2 + (1.1 - skill) * 1.2;
  const nCars = this.cars.length, behind = nCars > 1 ? (c.rank - 1) / (nCars - 1) : 0;
  M.gates.forEach(z => {
    const sw = z.sw;
    // the fork: how far to the bars (along this road to the fork, then the short road from its fork point)
    if (fs && gr) {
      const ds = fs.sLock - c.s;
      if (ds > -20 && ds < 1500) {
        const toBars = ds + Math.max(0, gr.g.s - fs.sAlt), tArr = eta(c, toBars, skill) + 0.15;
        const plans = c.ai.gatePlan || (c.ai.gatePlan = {}), key = c.lap;
        const st = gateState(this, this.time + tArr);
        let go = st.left > m;
        if (plans[key] === true && ds < 160) go = st.u > 0.05;   // committed: it's tucked in by now
        plans[key] = go;
        if (!go) { if (ds < fs.sLock - fs.s + 300) c.ai.stayWide = true; }
        else {
          const edgeIn = halfWAt(T, fs.s) - c.W * 0.7;
          const vIn = Math.sqrt(Math.max(1, c.grip * (1 / fs.kW - 0.97 * edgeIn) / 1.08)), vAlt = Math.sqrt(c.grip / Math.max(fs.kAlt, 1e-5)) * skill;
          plan.caps.push({ ds: ds - (fs.sLock - fs.s + 220), v: Math.min(vIn, vAlt) * 0.97 });
        }
      }
    }
    // the switch
    let ds = sw.s - c.s; if (ds < -T.L / 2) ds += T.L;
    if (ds < -30 || ds > 1300 || !fs || !gr) return;
    const want = c.ai.gateSw || (c.ai.gateSw = {}), key = c.lap;
    const toBars = fs.sLock - c.s + Math.max(0, gr.g.s - fs.sAlt);
    if (gateState(this, this.time + eta(c, toBars, skill) + 0.15).left > m + 0.3) return;   // open for us anyway: no need
    if (want[key] === undefined) want[key] = c.rng() < clamp(0.45 + (skill - 0.92) * 2.5 + 0.3 * behind, 0.25, 0.95);
    if (!want[key]) return;
    const edgeIn = sw.hw - c.W * 0.7, need = clamp((Math.abs(sw.lat) - (SW_R - 10)) / edgeIn, 0, 1);
    plan.caps.push({ ds: ds - 150, v: Math.sqrt(Math.max(1, c.grip * 1.12 * (1 / sw.kW - need * edgeIn) / 1.08)) });
  });
}
