// Kernel Kart: the lava river (Duke's Volcano). A channel crosses the road at two fords (crusted between eruptions).
// An eruption often (SURGE_P) sends a surge down it, flooding each ford in turn for FLOOD s; on a ford while molten you
// melt down (race-volcano.js lavaSink). Floor it before the front arrives, or let it pass and go once it crusts.
// Spills are drawn from race.rng; surges under way live on the race (race.surges: per river, eruption times), since T.mech is shared.
import { Math } from './detmath.js';   // deterministic maths, the same on every computer (detmath.js)
import { STEP, clamp, lerp } from './core.js';
import { vmaxAt, trackSample } from './geometry.js';
import { blockedByShield, untouchable } from './rules.js';
import { SINK_T } from './race-volcano.js';

export const FLOW_V = 320;        // how fast a surge's front runs down the channel (world units/s)
export const FLOOD = 1.3;         // how long a surge takes to pass any one point (molten: deadly on a ford)
export const COOL_T = 2.6;        // then the crust it leaves behind glows for this long (only for show)
const WAIT = 24;                  // a bot waiting for a surge to pass stops this far short of the ford
const SURGE_P = 0.55;             // how often an eruption sends a surge down the channel
const WARN_T = 3.5;               // a player is warned of a surge due at a ford they're about to reach this far ahead

// the channel: from the crater lip down the cone (draw-mechanics.js), then through the definition's points; each road
// crossing is a ford (past the first `fords`, a bridge)
export function buildRivers(T, volcanoes) {
  const sc = T.def.scale;
  return (T.def.river || []).map(d => {
    const v = volcanoes[d.volcano || 0], a = d.from, W = (d.w || 34) * sc;
    const head = [];
    for (let k = 0; k <= 10; k++) { const f = k / 10, rr = lerp(v.rTop * 0.9, v.R * 1.12, f), aa = a + Math.sin(f * 5 + a * 3) * 0.06; head.push([v.x + Math.cos(aa) * rr, lerp(v.y - v.H, v.y, f) + Math.sin(aa) * rr]); }
    const P = [...head, ...d.pts.map(p => [p[0] * sc, p[1] * sc])];
    // Catmull-Rom through the points, every few units, with the distance down the channel
    const path = []; let iHead = 0;
    for (let i = 0; i < P.length - 1; i++) {
      if (i === head.length - 1) iHead = path.length;   // where it leaves the cone
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)], n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 8));
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t, cr = (a0, a1, a2, a3) => 0.5 * (2 * a1 + (-a0 + a2) * t + (2 * a0 - 5 * a1 + 4 * a2 - a3) * t2 + (-a0 + 3 * a1 - 3 * a2 + a3) * t3);
        path.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    path.push(P[P.length - 1]);
    let acc = 0; path.forEach((p, i) => { if (i) acc += Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]); p[2] = acc; });
    // where it crosses the road's centreline
    const fords = [];
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, ay] = path[i], [bx, by] = path[i + 1];
      for (let j = 0; j < T.N; j++) {
        const [cx, cy] = T.pts[j], [ex, ey] = T.pts[(j + 1) % T.N];
        if (Math.max(cx, ex) < Math.min(ax, bx) - 1 || Math.min(cx, ex) > Math.max(ax, bx) + 1 || Math.max(cy, ey) < Math.min(ay, by) - 1 || Math.min(cy, ey) > Math.max(ay, by) + 1) continue;
        const rx = bx - ax, ry = by - ay, qx = ex - cx, qy = ey - cy, den = rx * qy - ry * qx; if (Math.abs(den) < 1e-9) continue;
        const t = ((cx - ax) * qy - (cy - ay) * qx) / den, u = ((cx - ax) * ry - (cy - ay) * rx) / den;
        if (t < 0 || t >= 1 || u < 0 || u >= 1) continue;
        const s = (j + u) * STEP; if (fords.some(o => Math.abs(o.s - s) < 60)) continue;
        const q = trackSample(T, s), rl = Math.hypot(rx, ry), sin = Math.abs((rx * q.ty - ry * q.tx) / rl);
        fords.push({ s, x: ax + rx * t, y: ay + ry * t, d: lerp(path[i][2], path[i + 1][2], t), hl: W / Math.max(sin, 0.35), ux: rx / rl, uy: ry / rl, bridge: fords.length >= (d.fords ?? 2) });
      }
    }
    const lake = d.lake ? { x: d.lake[0] * sc, y: d.lake[1] * sc, r: d.lake[2] * sc } : null;
    // props off the channel and lake; ground and camera out to the lake
    if (T.deco) for (let i = T.deco.length - 1; i >= 0; i--) {
      const p = T.deco[i];
      if (path.some(q => Math.hypot(q[0] - p.x, q[1] - p.y) < W + p.r + 24) || (lake && Math.hypot(lake.x - p.x, lake.y - p.y) < lake.r + p.r + 30)) T.deco.splice(i, 1);
    }
    if (lake) { const B = T.bbox, x0 = Math.min(B.x, lake.x - lake.r - 60), y0 = Math.min(B.y, lake.y - lake.r - 60); Object.assign(B, { x: x0, y: y0, w: Math.max(B.x + B.w, lake.x + lake.r + 60) - x0, h: Math.max(B.y + B.h, lake.y + lake.r + 60) - y0 }); }
    return { vi: d.volcano || 0, w: W, path, len: acc, head: path[iHead][2], fords, lake };
  });
}

const along = (T, s, s0) => { let d = s - s0; if (d > T.L / 2) d -= T.L; if (d < -T.L / 2) d += T.L; return d; };
// how molten the channel is d down it at time t from surges ts: 1 in a surge, 0 not (and how hot the crust is, for drawing)
export function surgeAt(ts, d, t) {
  let m = 0, h = 0;
  for (const t0 of ts) { const a = t - t0 - d / FLOW_V; if (a >= 0 && a < FLOOD) m = 1; else if (a >= FLOOD && a < FLOOD + COOL_T) h = Math.max(h, 1 - (a - FLOOD) / COOL_T); }
  return { m, h };
}
const melt = (race, c) => {
  c.hitCd = 1.5;
  if (blockedByShield(race, c)) { c.speed *= 0.6; c.hitCd = 2; return; }
  c.lavaT = SINK_T; c.lavaS = c.s; c.lavaBy = 'river'; c.speed = 0; c.skx = c.sky = 0; c.spinT = 0; c.trick = false;
  race.fxHit(c, '#ff6d00', 'lava');
};

// once a frame (after the volcano): new eruptions send surges down each river; the roar at a ford
export function riverUpdate(dt) {
  const list = this.track.mech.rivers; if (!list.length || !this.volc || this.calm) return;   // calm: no surges, race.surges stays unset
  const S = this.surges || (this.surges = list.map(() => [])), seen = this.surgeSeen || (this.surgeSeen = list.map(() => -99));
  list.forEach((r, i) => {
    const st = this.volc[r.vi], ts = S[i];
    // a new eruption: maybe a spill into the channel
    if (st && st.last !== seen[i]) { seen[i] = st.last; if (st.last > 0 && this.rng() < SURGE_P) ts.push(st.last); }
    for (const f of r.fords) for (const t0 of ts) { const tA = t0 + f.d / FLOW_V; if (this.time >= tA && this.time - dt < tA) this.sound('lavaLand', f, f.bridge ? 0.4 : 0.8); }
    while (ts.length && this.time - ts[0] > r.len / FLOW_V + FLOOD + COOL_T) ts.shift();
  });
}

// one car: on a ford while a surge runs through it, it melts down; players get a warning
export function riverCar(c, dt) {
  if (!this.surges || c.finished) return;
  const T = c.T, now = this.time;
  T.mech.rivers.forEach((r, i) => {
    const ts = this.surges[i]; if (!ts.length && !c.human) return;
    for (const f of r.fords) {
      if (f.bridge) continue;
      const d = along(T, f.s, c.s);
      if (c.human && d > 150 && d < 1100) {
        const due = ts.find(t0 => t0 + f.d / FLOW_V + FLOOD > now && t0 + f.d / FLOW_V < now + WARN_T);
        if (due !== undefined && c.fordWarn !== due) { c.fordWarn = due; this.feed('warn', 'lava', c); }
      }
      if (Math.abs(d) > f.hl + c.L * 0.4 || c.air > 0 || c.lavaT > 0 || c.hitCd > 0 || untouchable(c)) continue;
      if (surgeAt(ts, f.d, now).m) melt(this, c);
    }
  });
}

// a bot and a surge heading for a ford ahead: the fastest speed (up to the corners' limit) that crosses before the front
// or after it passes: held all the way, or until it passes then flat out. Worse bots now and then miss one.
export function riverAI(c, skill, brake, allowed) {
  c.riverNear = false;
  if (!this.surges || c.T !== this.track) return allowed;
  const T = c.T, now = this.time, near = [];
  T.mech.rivers.forEach((r, i) => {
    const ts = this.surges[i];
    r.fords.forEach((f, fi) => {
      if (f.bridge) return;
      const d = along(T, f.s, c.s), half = f.hl + c.L * 0.4 + 4;
      if (d < -half || d > 1500) return;
      for (const t0 of ts) {
        const tA = t0 + f.d / FLOW_V, tE = tA + FLOOD;
        if (now > tE || (Math.abs(d) <= half && now >= tA)) continue;   // gone by, or on it already: nothing to be done
        const key = t0.toFixed(3) + ':' + i + ':' + fi, seen = c.ai.fords || (c.ai.fords = {});
        if (seen[key] === undefined) seen[key] = c.rng() < clamp(0.86 + (skill - 0.92) * 1.2, 0.8, 0.97);
        if (seen[key]) near.push({ d, half, tA, tE });
      }
    });
  });
  if (!near.length) return allowed;
  c.riverNear = true;
  const m = 0.1 + (1.1 - skill) * 0.5, top = Math.min(allowed, c.top * 1.1), tGo = Math.max(...near.map(n => n.tE)) + m;
  // what the corners allow from here on (every 16 units)
  const far = Math.max(...near.map(n => n.d + n.half)) + 40, lim = [];
  for (let s = 0; s <= far; s += 16) {
    let v = 1e4; for (let e = 0; e <= 480; e += 24) v = Math.min(v, Math.sqrt(Math.pow(vmaxAt(T, c.s + s + e, c.grip) * skill, 2) + 2 * brake * e));
    lim.push(v);
  }
  const clear = (v1, v2) => {
    const h = 0.04, inT = near.map(() => null), outT = near.map(() => null);
    let s = 0, v = c.speed, t = now;
    while (t < tGo + 2 && s < far) {
      const tgt = Math.min(t < tGo ? v1 : v2, lim[Math.min(lim.length - 1, Math.floor(s / 16))]);
      v = v < tgt ? Math.min(tgt, v + c.acc * h) : Math.max(tgt, v - brake * h);
      s += v * h; t += h;
      near.forEach((n, j) => { if (inT[j] === null && s > n.d - n.half - WAIT) inT[j] = t; if (outT[j] === null && s > n.d + n.half) outT[j] = t; });
      if (outT.every(x => x !== null)) break;
    }
    return near.every((n, j) => inT[j] === null || (outT[j] ?? Infinity) < n.tA - m || inT[j] > n.tE + m);
  };
  let v = top;
  for (; v > -12; v -= 12) if (clear(Math.max(v, 0), Math.max(v, 0)) || clear(Math.max(v, 0), top)) break;
  if (v <= -12) v = allowed;   // nothing gets through clean from here: go for it
  // no faster than a kart waiting ahead allows (a bump from behind would shove it in)
  for (const o of this.cars) {
    if (o === c || o.T !== T || o.finished || o.lavaT > 0) continue;
    const g = along(T, o.s, c.s) - (c.L + o.L) / 2 - 22;
    if (g > -20 && g < 300 && o.speed < c.speed && Math.abs(o.lat - c.lat) < (o.W + c.W) * 0.6 + 8) v = Math.min(v, Math.sqrt(o.speed * o.speed + 2 * brake * Math.max(0, g)));
  }
  return Math.min(allowed, Math.max(v, 0));
}
