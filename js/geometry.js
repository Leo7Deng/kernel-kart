// Kernel Kart: turning track definitions into geometry: centreline, curvature, the inside line, props, bridges, and lookups along the track.
import { CAR_L, STEP, TAU, WORLD_SCALE, clamp, lerp, mulberry } from './core.js';
import { buildMechanics } from './race-mechanics.js';
import { seatVolcano } from './race-volcano.js';


// Turn a rounded polygon into a smooth closed path: straight edges joined by circular fillets. An open path (a
// point-to-point course) keeps its first and last points as plain ends.
function roundedPolygon(P, closed = true) {
  const n = P.length, raw = [];
  const fil = [];
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n];
    const ax = p0[0] - p1[0], ay = p0[1] - p1[1], bx = p2[0] - p1[0], by = p2[1] - p1[1];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    const ux = ax / la, uy = ay / la, vx = bx / lb, vy = by / lb;
    const phi = Math.acos(clamp(ux * vx + uy * vy, -1, 1)); // interior angle
    const straight = phi > Math.PI - 0.01;                // the road goes straight through this vertex: no arc at all
    let r = straight ? 0 : (p1[2] || 80);
    let t = straight ? 0 : r / Math.tan(phi / 2);         // distance from vertex to each tangent point
    const tmax = Math.min(la, lb) * 0.5;
    if (t > tmax) { t = tmax; r = t * Math.tan(phi / 2); }
    fil.push({ p1, ux, uy, vx, vy, t, r, phi, straight });
  }
  if (!closed) raw.push([P[0][0], P[0][1]]);
  for (let i = 0; i < fil.length; i++) {
    const f = fil[i];
    const sx = f.p1[0] + f.ux * f.t, sy = f.p1[1] + f.uy * f.t;   // arc start (on incoming edge)
    const ex = f.p1[0] + f.vx * f.t, ey = f.p1[1] + f.vy * f.t;   // arc end (on outgoing edge)
    if (f.straight) raw.push([f.p1[0], f.p1[1]]);
    else {
      // arc centre: along the bisector
      let bxn = f.ux + f.vx, byn = f.uy + f.vy; const bl = Math.hypot(bxn, byn) || 1; bxn /= bl; byn /= bl;
      const d = f.r / Math.sin(f.phi / 2);
      const cx = f.p1[0] + bxn * d, cy = f.p1[1] + byn * d;
      let a0 = Math.atan2(sy - cy, sx - cx), a1 = Math.atan2(ey - cy, ex - cx);
      let da = a1 - a0; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      const steps = Math.max(4, Math.ceil(Math.abs(da) * f.r / 3));
      for (let k = 0; k <= steps; k++) { const a = a0 + da * k / steps; raw.push([cx + Math.cos(a) * f.r, cy + Math.sin(a) * f.r]); }
    }
    // straight to next fillet start (or, on an open path, to the end)
    const g = fil[(i + 1) % fil.length], last = !closed && i === fil.length - 1;
    const nsx = last ? P[n - 1][0] : g.p1[0] + g.ux * g.t, nsy = last ? P[n - 1][1] : g.p1[1] + g.uy * g.t;
    const segs = Math.max(2, Math.ceil(Math.hypot(nsx - ex, nsy - ey) / 3));
    for (let k = 1; k < segs; k++) raw.push([lerp(ex, nsx, k / segs), lerp(ey, nsy, k / segs)]);
  }
  if (!closed) raw.push([P[n - 1][0], P[n - 1][1]]);
  return raw;
}

// resample a point list to even STEP spacing and work out tangents and (smoothed) curvature
function resample(raw, closed) {
  const pts = [[raw[0][0], raw[0][1]]];
  let prev = raw[0], acc = 0;
  for (let i = 1; i < raw.length + (closed ? 1 : 0); i++) {
    const q = raw[i % raw.length];
    let dx = q[0] - prev[0], dy = q[1] - prev[1], d = Math.hypot(dx, dy);
    while (acc + d >= STEP) { const t = (STEP - acc) / d; prev = [prev[0] + dx * t, prev[1] + dy * t]; pts.push([prev[0], prev[1]]); dx = q[0] - prev[0]; dy = q[1] - prev[1]; d = Math.hypot(dx, dy); acc = 0; }
    acc += d; prev = q;
  }
  if (closed && Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]) < STEP * 0.6) pts.pop();
  const N = pts.length, at = i => closed ? pts[(i + N) % N] : pts[clamp(i, 0, N - 1)];
  const tan = new Array(N), curv = new Float32Array(N), rawK = new Float32Array(N);
  for (let i = 0; i < N; i++) { const a = at(i - 1), b = at(i + 1), dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; tan[i] = [dx / l, dy / l]; }
  for (let i = 0; i < N; i++) { const a = tan[i], b = tan[closed ? (i + 1) % N : Math.min(i + 1, N - 1)]; rawK[i] = Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]) / STEP; }
  const W = 4;
  for (let i = 0; i < N; i++) { let s = 0; for (let j = -W; j <= W; j++) s += rawK[closed ? (i + j + N) % N : clamp(i + j, 0, N - 1)]; curv[i] = s / (2 * W + 1); }
  return { pts, tan, curv, N, L: closed ? N * STEP : (N - 1) * STEP };
}
// A course whose route changes every lap: each route is a full closed track (they share the start/finish straight),
// built separately; the first one carries the shared scenery and a list of all of them.
function buildCourse(def) {
  const routes = def.routes.map((r, k) => Object.assign(buildTrack({ ...def, routes: undefined, pts: r.pts, noScatter: true }), { routeName: r.name, idx: k, bits: r.bits ?? k }));   // bits: the forks this road has taken (by default its index; a road can say, when not every combination is a road: Kernel Pretzel's Ash Run)
  const main = routes[0];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const R of routes) { x0 = Math.min(x0, R.bbox.x); y0 = Math.min(y0, R.bbox.y); x1 = Math.max(x1, R.bbox.x + R.bbox.w); y1 = Math.max(y1, R.bbox.y + R.bbox.h); }
  const pad = (def.bboxPad || [0, 0, 0, 0]).map(v => v * (def.scale || WORLD_SCALE));   // (a track can ask for more ground round its roads, left, top, right, bottom: so the camera can centre a set piece near the edge)
  const bbox = { x: x0 - pad[0], y: y0 - pad[1], w: x1 - x0 + pad[0] + pad[2], h: y1 - y0 + pad[1] + pad[3] };
  const all = routes.flatMap(R => R.pts.filter((_, i) => i % 4 === 0));
  const distTo = (x, y) => { let md = 1e9; for (const p of all) { const d = Math.hypot(p[0] - x, p[1] - y); if (d < md) md = d; } return md; };
  const { ponds, deco } = scatter(def, distTo, main.halfW, bbox, mulberry(def.name.length * 7919 + def.routes.length));
  // a coarse grid of every road point, to ask "is this spot on any of the roads?"
  const cell = 80, grid = new Map();
  routes.forEach((R, k) => R.pts.forEach((p, i) => { if (i % 2) return; const key = Math.floor(p[0] / cell) + ',' + Math.floor(p[1] / cell); if (!grid.has(key)) grid.set(key, []); grid.get(key).push(p); }));
  const onAnyRoad = (x, y, margin) => { const cx = Math.floor(x / cell), cy = Math.floor(y / cell); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const L = grid.get((cx + i) + ',' + (cy + j)); if (L) for (const p of L) if ((p[0] - x) ** 2 + (p[1] - y) ** 2 < margin * margin) return true; } return false; };
  for (const R of routes) Object.assign(R, { bbox, routes, onAnyRoad });
  // forks: a corner where the roads split. Each route that hasn't taken fork k knows where, on it, the other road has
  // pulled half a road's width away just past the apex (sLock): crossing that point, a car goes onto whichever
  // centreline it's nearer. Tucked into the apex and that's the sharp road; out in the middle and it's the sweep.
  if (def.forks) {
    const sc = def.scale || WORLD_SCALE;
    const forks = def.forks.map((f, k) => ({ x: f.at[0] * sc, y: f.at[1] * sc, bit: 1 << k, ...(f.split ? { split: true } : {}), ...(f.gate ? { gate: true } : {}), ...(f.thicket ? { thicket: true } : {}) }));
    const nearest = (R, x, y) => { let bi = 0, bd = 1e18; for (let i = 0; i < R.N; i++) { const d = (R.pts[i][0] - x) ** 2 + (R.pts[i][1] - y) ** 2; if (d < bd) { bd = d; bi = i; } } return bi * STEP; };
    for (const R of routes) {
      R.forks = forks;
      R.forkS = forks.map(f => {
        if (R.bits & f.bit) return null;
        const ai = routes.findIndex(Q => Q.bits === (R.bits | f.bit)); if (ai < 0) return null;   // (no road for that combination: this road never meets the fork)
        const alt = routes[ai], s0 = nearest(R, f.x, f.y);
        let sLock = s0 + 600, sAlt = nearest(alt, f.x, f.y), kW = 0, q = null;
        for (let s = s0 - 200; s < s0 + 1500; s += 4) {
          const p = trackSample(R, s); q = projectToTrack(alt, p.x, p.y, q ? q.s : sAlt, 60);
          if (s >= s0 - 150) kW = Math.max(kW, Math.abs(curvAt(R, s)));
          if (s > s0 && Math.abs(q.lat) >= R.halfW * (f.split ? 0.9 : 0.55)) { sLock = s; sAlt = q.s; break; }   // (a long split: further on, where it's clear which road you're on)
        }
        let kAlt = 0; for (let d = 0; d < 400; d += 10) kAlt = Math.max(kAlt, Math.abs(curvAt(alt, sAlt + d)));
        return { s: s0, sLock, sAlt, side: Math.sign(curvAt(R, s0)) || 1, kW, kAlt, alt: ai };
      });
    }
    // a long split (a fork with split: true): two very different roads that take about as long and meet again. Each
    // other route knows its own stretch [a, b] and the main road's [a0, b0] (where the two leave each other and meet
    // again), so a car on it counts as that share of the way along the main road's stretch (race.js progressOf): who's
    // ahead is who's further through it, not who's on the shorter road.
    if (def.forks.some(f => f.split)) main.splits = true;
    if (main.splits) for (const R of routes) {
      // no item boxes where you choose: one would draw your line off the inside (or onto it) just as it decides
      R.keepClear = forks.flatMap((f, k) => { if (!def.forks[k].split) return []; const s = nearest(R, f.x, f.y); return [s - 200, s + 100, s + 400]; });
      if (!R.idx) continue;
      const near = (T, x, y) => { let bi = 0, bd = 1e18; for (let i = 0; i < T.N; i++) { const d = (T.pts[i][0] - x) ** 2 + (T.pts[i][1] - y) ** 2; if (d < bd) { bd = d; bi = i; } } return [bi * STEP, Math.sqrt(bd)]; };
      let a = null, b = null;
      for (let i = 0; i < R.N; i++) if (near(main, R.pts[i][0], R.pts[i][1])[1] > 2) { if (a === null) a = i * STEP; b = i * STEP; }
      if (a === null) continue;
      R.split = { a, b, a0: near(main, ...R.pts[a / STEP])[0], b0: near(main, ...R.pts[b / STEP])[0] };
    }
  }
  Object.assign(main, { deco, ponds });
  // a volcano on a course: its cone keeps the props off it and widens the shared box, and a random glob can land on any
  // of the roads in reach (the main road, and the bits of the others that aren't on it)
  if (main.mech) for (const v of main.mech.volcano) {
    seatVolcano(main, v);
    const spots = [];
    routes.forEach((R, k) => { for (let s = 0; s < R.L; s += 40) { const q = trackSample(R, s), d = Math.hypot(q.x - v.x, q.y - v.y); if (d < v.reach && (!k || distToMain(main, q.x, q.y) > main.halfW) && !routes.slice(1, k).some(Q => distToMain(Q, q.x, q.y) < Q.halfW)) spots.push({ k, s, d }); } });
    v.spots = spots.sort((a, b) => a.d - b.d).map(({ k, s }) => ({ k, s }));
  }
  return main;
}
function distToMain(T, x, y) { let bd = 1e18; for (let i = 0; i < T.N; i += 4) { const d = (T.pts[i][0] - x) ** 2 + (T.pts[i][1] - y) ** 2; if (d < bd) bd = d; } return Math.sqrt(bd); }
// each track is built once and reused: building is deterministic, and a race only sets T.sectors (again, every race)
const built = new WeakMap();
export function buildTrack(def) { if (!built.has(def)) built.set(def, buildOnce(def)); return built.get(def); }
function buildOnce(def) {
  if (def.routes) return buildCourse(def);
  const sc = def.scale || WORLD_SCALE;   // a track can be built bigger than the rest: same layout, more room relative to the karts
  const open = !!def.open;   // a point-to-point course: it has a start and an end instead of a line you cross each lap
  const raw = roundedPolygon(def.pts.map(p => [p[0] * sc, p[1] * sc, (p[2] || 80) * sc]), !open);
  const { pts, tan, curv, N, L } = resample(raw, !open);
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (const p of pts) { minx = Math.min(minx, p[0]); miny = Math.min(miny, p[1]); maxx = Math.max(maxx, p[0]); maxy = Math.max(maxy, p[1]); }
  const halfW = def.width / 2;
  // the road's half-width along the track: the track's width, except on listed stretches ([x, y, multiplier, half-length]
  // in layout units) where it blends to something else over 120 units at each end
  const hw = new Float32Array(N).fill(halfW);
  for (const [wx, wy, mul, half, rampL] of def.widths || []) {   // rampL (optional): how long it takes to widen or narrow
    let bi = 0, bd = 1e18; for (let i = 0; i < N; i++) { const d = (pts[i][0] - wx * sc) ** 2 + (pts[i][1] - wy * sc) ** 2; if (d < bd) { bd = d; bi = i; } }
    if (def.noScatter && bd > (halfW * 2) ** 2) continue;   // one route of a course: only the stretches on its own road
    const span = half * sc, ramp = rampL ? rampL * sc : 120;
    for (let d = -span - ramp; d <= span + ramp; d += STEP) { const i = open ? clamp(bi + Math.round(d / STEP), 0, N - 1) : (bi + Math.round(d / STEP) + N * 4) % N; const t = clamp((span + ramp - Math.abs(d)) / ramp, 0, 1); hw[i] = lerp(hw[i], halfW * mul, t * t * (3 - 2 * t)); }
  }
  const halfWMax = Math.max(...hw);
  const bbox = { x: minx - halfWMax - 40, y: miny - halfWMax - 40, w: maxx - minx + halfWMax * 2 + 80, h: maxy - miny + halfWMax * 2 + 80 };
  const distTo = (x, y) => { let md = 1e9; for (let i = 0; i < N; i += 4) { const d = Math.hypot(pts[i][0] - x, pts[i][1] - y); if (d < md) md = d; } return md; };
  const { ponds, deco } = def.noScatter ? { ponds: [], deco: [] } : scatter(def, distTo, halfWMax, bbox, mulberry(def.name.length * 7919 + def.pts.length));
  // item boxes: rows of 3 around the lap
  // railway: a straight line across the map; crossings are where it cuts the road
  let rail = null;
  if (def.rail) {
    const [a, b] = def.rail.map(p => [p[0] * sc, p[1] * sc]), len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    // ext: how far past its two ends the railway goes on (default: right across the map; 0: it ends in tunnels at its two ends)
    const ext = def.train && def.train.ext !== undefined ? def.train.ext : 2000;
    rail = { ax: a[0], ay: a[1], ux, uy, len, ext, crossings: [], speed: def.train ? def.train.speed : 520, rest: def.train ? def.train.rest : [2.5, 5], first: def.train && def.train.first };   // the train's speed, and how long it rests between runs (s)
    const side = q => (q[0] - a[0]) * uy - (q[1] - a[1]) * ux, alongR = q => (q[0] - a[0]) * ux + (q[1] - a[1]) * uy;
    for (let i = 0; i < N; i++) {
      const p = pts[i], q = pts[(i + 1) % N];
      if (Math.sign(side(p)) !== Math.sign(side(q)) && alongR(p) > -ext - 300 && alongR(p) < len + ext + 300) {
        // clear: how far before (and after) the crossing, along the road, the train can reach a kart at the road's edge
        // (a crossing at a slant reaches further up the road on one side; race-hazards.js hits within 24 + 0.45 L of the rail),
        // and span: how far the road reaches along the rail either side of the middle
        const sinA = Math.max(0.3, Math.abs(tan[i][0] * uy - tan[i][1] * ux)), cosA = Math.sqrt(1 - sinA * sinA);
        rail.crossings.push({ s: i * STEP, d: (p[0] - a[0]) * ux + (p[1] - a[1]) * uy, x: p[0], y: p[1], tx: tan[i][0], ty: tan[i][1], clear: (24 + 0.45 * CAR_L + hw[i] * cosA) / sinA, span: hw[i] / sinA });
      }
    }
    // keep scenery off the tracks
    for (let i = deco.length - 1; i >= 0; i--) { const at = alongR([deco[i].x, deco[i].y]); if (Math.abs(side([deco[i].x, deco[i].y])) < 50 + deco[i].r && at > -ext - 100 && at < len + ext + 100) deco.splice(i, 1); }
  }
  // the inside of each bit of track: +1 hugs the left edge, -1 the right, 0 on straights. Smoothed so the line moves
  // over just before a corner and stays tucked in through it; a quick left-right flick averages out to going straight.
  const ins = new Float32Array(N), tmp = new Float32Array(N), Wn = 30;
  for (let i = 0; i < N; i++) ins[i] = clamp(curv[i] * 320, -1, 1);
  for (let pass = 0; pass < 2; pass++) {
    let acc = 0; for (let j = -Wn; j <= Wn; j++) acc += ins[(j + N) % N];
    for (let i = 0; i < N; i++) { tmp[i] = acc / (2 * Wn + 1); acc += ins[(i + Wn + 1) % N] - ins[(i - Wn + N) % N]; }
    ins.set(tmp);
  }
  for (let i = 0; i < N; i++) ins[i] = clamp(ins[i] * 1.4, -1, 1);
  // bridges where the track crosses itself: find every crossing and mark a stretch of one pass as the upper deck
  // ('first': the earlier pass round the lap goes over; 'second': the later one; 'high', on a track with heights:
  // whichever pass is higher there, set once the heights are built below)
  const bridges = [];
  if (def.bridge) {
    const seg = (a, b, c, d) => { const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]], den = r[0] * q[1] - r[1] * q[0]; if (Math.abs(den) < 1e-9) return false;
      const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den; return t >= 0 && t <= 1 && u >= 0 && u <= 1; };
    // (every pair of samples within 8 of each other, in the same order as going through them all, i then j: but only
    // looking in the cells of a grid round each one, or a very long lap takes many seconds)
    const G = 16, cells = new Map(), key = (x, y) => Math.floor(x / G) * 65536 + Math.floor(y / G);
    for (let j = 0; j < N; j++) { const k = key(pts[j][0], pts[j][1]); let L = cells.get(k); if (!L) cells.set(k, L = []); L.push(j); }
    for (let i = 0; i < N; i++) {
      const jEnd = N - (i < 60 && !open ? 60 - i : 0), near = [], cx = Math.floor(pts[i][0] / G), cy = Math.floor(pts[i][1] / G);
      for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) { const L = cells.get((cx + u) * 65536 + cy + v); if (L) for (const j of L) if (j >= i + 60 && j < jEnd) near.push(j); }
      near.sort((p, q) => p - q);
      for (const j of near) {
      const a = pts[i], c = pts[j]; if (Math.abs(a[0] - c[0]) > 8 || Math.abs(a[1] - c[1]) > 8) continue;
      if (bridges.some(b => Math.abs(b.i - i) < 60 || Math.abs(b.j - j) < 60)) continue;
      if (seg(a, pts[Math.min(i + 1, N - 1)], c, pts[open ? Math.min(j + 1, N - 1) : (j + 1) % N])) {
        const ti = tan[i], tj = tan[j], sinA = Math.abs(ti[0] * tj[1] - ti[1] * tj[0]);
        const up = def.bridge === 'second' ? j : i, down = up === i ? j : i, span = halfW / Math.max(sinA, 0.3) + 150;
        bridges.push({ i, j, s: up * STEP, sUnder: down * STEP, s0: up * STEP - span, s1: up * STEP + span, x: a[0], y: a[1] });
      }
      }
    }
  }
  const nearestS = (x, y) => { let bi = 0, bd = 1e18; for (let i = 0; i < N; i++) { const d = (pts[i][0] - x) ** 2 + (pts[i][1] - y) ** 2; if (d < bd) { bd = d; bi = i; } } return bi * STEP; };
  const pads = (def.pads || []).map(p => { const s = nearestS(p[0] * sc, p[1] * sc), q = trackSampleRaw(pts, tan, N, s); return Math.hypot(q[0] - p[0] * sc, q[1] - p[1] * sc) < halfW ? { s, lat: (p[2] || 0) * halfW } : null; }).filter(Boolean);
  const gc = (def.gc || []).map(p => ({ s: nearestS(p[0] * sc, p[1] * sc), phase: p[2] || 0 }));
  // jump ramps (you fly, no steering, how far depends on speed) and gaps in the road (clear them in the air or fall in)
  // (one route of a course only takes the ones on its own road)
  const mine = p => { if (!def.noScatter) return true; const q = trackSampleRaw(pts, tan, N, nearestS(p[0] * sc, p[1] * sc)); return Math.hypot(q[0] - p[0] * sc, q[1] - p[1] * sc) < halfW * 2; };
  const jumps = (def.jumps || []).filter(mine).map(p => { const s = nearestS(p[0] * sc, p[1] * sc), q = trackSampleRaw(pts, tan, N, s); return { s, x: q[0], y: q[1], tx: q[2], ty: q[3] }; });
  const gaps = (def.gaps || []).filter(mine).map(p => { const s = nearestS(p[0] * sc, p[1] * sc), half = (p[2] || 120) * sc / 2; return { s0: s - half, s1: s + half, s }; });
  // keep props off the GC bots' patrol paths
  for (const g of gc) { const q = trackSampleRaw(pts, tan, N, g.s); for (let i = deco.length - 1; i >= 0; i--) { const dx = deco[i].x - q[0], dy = deco[i].y - q[1]; if (Math.abs(dx * q[2] + dy * q[3]) < 60 && Math.hypot(dx, dy) < halfW + 140) deco.splice(i, 1); } }
  const T = { def, pts, tan, curv, ins, N, L, halfW, hw, bbox, deco, ponds, rail, bridges, pads, gc, jumps, gaps, theme: def.theme, open, finishS: open ? L - 600 : L, sectors: 3 };
  T.mech = buildMechanics(T);   // wormholes, low gravity, presses, slag (race-mechanics.js): null on a track without them
  if (def.bridge === 'high' && T.mech && T.mech.elev) for (const b of bridges) {   // the higher pass is the deck
    const h = T.mech.elev.h, span = b.s1 - b.s;
    if (h[b.sUnder / STEP] > h[b.s / STEP]) Object.assign(b, { s: b.sUnder, sUnder: b.s, s0: b.sUnder - span, s1: b.sUnder + span });
  }
  return T;
}
// ponds in the biggest open spaces, then a few chunky props well clear of the road(s) and of each other
function scatter(def, distTo, halfW, bbox, rng) {
  // ponds: in the biggest open spaces
  const ponds = [];
  for (let k = 0; k < (def.ponds || 0); k++) {
    let best = null;
    for (let gy = bbox.y + 120; gy < bbox.y + bbox.h - 120; gy += 40) for (let gx = bbox.x + 120; gx < bbox.x + bbox.w - 120; gx += 40) {
      let d = Math.min(distTo(gx, gy) - halfW, gx - bbox.x, bbox.x + bbox.w - gx, gy - bbox.y + 60, bbox.y + bbox.h - gy + 60); for (const p of ponds) d = Math.min(d, Math.hypot(p.x - gx, p.y - gy) - p.r * 1.3);
      if (!best || d > best.d) best = { x: gx, y: gy, d };
    }
    if (best && best.d > 150) ponds.push({ x: best.x, y: best.y, r: Math.min(best.d - 90, 210) / 1.25 });
  }
  // props: a few chunky ones, well clear of the road and of each other
  const deco = [], want = def.props || clamp(bbox.w * bbox.h / 52000, 24, 64);   // (a track can ask for more: `props`)
  for (let k = 0; k < 1500 && deco.length < want; k++) {
    const r = 17 + rng() * 13, x = bbox.x + r + 12 + rng() * (bbox.w - r * 2 - 24), y = bbox.y + r + 12 + rng() * (bbox.h - r * 2 - 24);
    if (distTo(x, y) < halfW + 46 + r) continue;
    if (deco.some(d => Math.hypot(d.x - x, d.y - y) < (d.r + r) * 1.25)) continue;
    if (ponds.some(p => Math.hypot((p.x - x) / 1.25, (p.y - y) / 0.9) < p.r + r + 20)) continue;
    deco.push({ x, y, r, v: rng() });
  }
  return { ponds, deco };
}
function trackSampleRaw(pts, tan, N, s) { const i = Math.min(Math.floor(s / STEP), N - 1); return [pts[i][0], pts[i][1], tan[i][0], tan[i][1]]; }
// a position along the track: wraps round on a loop, stops at the ends of a point-to-point course
export const wrapS = (tr, s) => { const L = tr.L; return tr.open ? clamp(s, 0, L) : ((s % L) + L) % L; };
export function trackSample(tr, s) {
  s = wrapS(tr, s);
  const f = s / STEP, i = Math.min(Math.floor(f), tr.N - 1), j = tr.open ? Math.min(i + 1, tr.N - 1) : (i + 1) % tr.N, t = f - Math.floor(f);
  const a = tr.pts[i], b = tr.pts[j], ta = tr.tan[i], tb = tr.tan[j];
  const tx = lerp(ta[0], tb[0], t), ty = lerp(ta[1], tb[1], t), tl = Math.hypot(tx, ty) || 1;
  return { x: lerp(a[0], b[0], t), y: lerp(a[1], b[1], t), tx: tx / tl, ty: ty / tl, nx: -ty / tl, ny: tx / tl, k: lerp(tr.curv[i], tr.curv[j], t), hw: lerp(tr.hw[i], tr.hw[j], t) };
}
// nearest point on the centreline near a previous s (local search keeps it continuous through corners)
export function projectToTrack(tr, x, y, sGuess, win = 70) {
  const N = tr.N; const i0 = Math.min(Math.floor(wrapS(tr, sGuess) / STEP), N - 1);
  let best = i0, bd = 1e18;
  // small bias toward the previous spot, so a car far off-road doesn't flicker between two bits of track
  for (let j = -win; j <= win; j++) { let i = i0 + j; if (tr.open) { if (i < 0 || i >= N) continue; } else i = (i + N) % N; const p = tr.pts[i]; const d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y) + j * j * 1.5; if (d < bd) { bd = d; best = i; } }
  const p = tr.pts[best], t = tr.tan[best], dx = x - p[0], dy = y - p[1];
  const along = clamp(dx * t[0] + dy * t[1], -STEP, STEP), lat = dx * -t[1] + dy * t[0];
  return { s: wrapS(tr, best * STEP + along), lat };
}
// Item boxes: three rows of two per lap (more on a very long lap), each on the straightest bit of track near 1/6, 1/2
// and 5/6 of the way round. A point-to-point course gets three rows per stage. A track can ask for more (`boxRows`) and
// for wider rows (`boxLanes`: where across the road each box of a row sits, -1..1), and a track with jackpots
// (race-jackpot.js) gets its clusters of golden boxes on top. On a few tracks the second row sits instead out wide on
// the exit of a fast corner (radius WIDE_R) near its spot: one box on the outside (two only where the road there is
// wide), so carry speed out of the corner and you run wide through it, lift and the line tucks in past it. Only where
// such a corner is close by, so most tracks keep plain rows (the user: very few). A track with its own `boxLanes` keeps
// all its rows as they are. A track can also keep its rows to one stretch of the lap (`boxZone: [[x, y], [x, y]]`, from
// and to in layout points): they go evenly along it instead of round the whole lap (Pharaoh's Jackpot: the Strip).
// About a third of the pair rows are a single box instead, chosen per track (`singleBoxes`, singlesOf below).
const WIDE_ROW = 1, WIDE_R = [200, 300], WIDE_AT = 60;
// Single boxes (`singleBoxes: [[x, y, lat], ...]` in the definition, chosen per track): the plain row nearest the
// layout point (x, y) becomes one box there, `lat` across the road (share of the half-width, + is the driver's right).
// A box on a straight is everyone's (the line drifts onto it), so a single sits where the line commits to a side: in
// or at a corner, on the inside you only reach by lifting early, or the outside only a kart carrying speed runs to.
// The point has to be on this road (a course: only the routes that pass there) and within a row's spacing of a row.
function singlesOf(tr, sc, gap) {
  const out = [];
  for (const [x, y, u] of tr.def.singleBoxes || []) {
    let bi = 0, bd = 1e18; for (let i = 0; i < tr.N; i++) { const p = tr.pts[i], d = (p[0] - x * sc) ** 2 + (p[1] - y * sc) ** 2; if (d < bd) { bd = d; bi = i; } }
    if (Math.sqrt(bd) < tr.halfW) out.push({ s: bi * STEP, u, gap });
  }
  return out;
}
function wideSpot(tr, s0, s1, away, busy) {
  let best = null, bk = 0;
  for (let s = s0; s < s1; s += 10) {
    if (busy(s)) continue;
    let behind = 0, ahead = 0, kMax = 0;
    for (let d = 20; d <= 200; d += 10) { const k = Math.abs(curvAt(tr, s - d)); behind += k / 19; kMax = Math.max(kMax, k); }   // a fast corner just behind...
    for (let d = 0; d <= 80; d += 10) ahead += Math.abs(curvAt(tr, s + d)) / 9;       // ...and the road straightening out here
    if (1 / kMax < WIDE_R[0] || 1 / kMax > WIDE_R[1] || behind < 1 / 600 || ahead > behind * 0.35) continue;
    if (behind > bk) { bk = behind; best = s; }
  }
  return best === null ? null : { s: best, side: -Math.sign(insideAt(tr, best - 100)) || 1 };
}
// a track's box zone (`boxZone`) on this road: where it starts and how long it is, or null
export function boxZoneOf(tr) {
  const Z = !tr.open && tr.def.boxZone; if (!Z) return null;
  const sc = tr.def.scale || WORLD_SCALE, at = ([x, y]) => { let b = 0, bd = 1e18; for (let i = 0; i < tr.N; i++) { const p = tr.pts[i], d = (p[0] - x * sc) ** 2 + (p[1] - y * sc) ** 2; if (d < bd) { bd = d; b = i; } } return b * STEP; };
  const s0 = at(Z[0]); return { s0, len: wrapS(tr, at(Z[1]) - s0) };
}
function makeBoxes(tr) {
  const boxes = [], rowList = [], rows = tr.def.boxRows || (tr.open ? 3 * tr.sectors : Math.max(3, Math.round(tr.L / 2600)));   // a very long lap gets more rows
  const Z = boxZoneOf(tr), base = Z ? Z.s0 : 0, span = Z ? Z.len : tr.open ? tr.finishS : tr.L;   // (a box zone: the rows go along that stretch only)
  const away = (s, b) => tr.open ? Math.abs(s - b) : Math.abs(((s - b) % tr.L + tr.L * 1.5) % tr.L - tr.L / 2);
  // a track can keep its rows off stretches of its own (`noBoxes: [[x, y, half-length]]`, layout units: Neon Overflow's
  // corkscrew and hairpin, where a box would pull the line off the apex)
  const sc = tr.def.scale || WORLD_SCALE, noBoxes = (tr.def.noBoxes || []).flatMap(([x, y, half]) => { let bi = 0, bd = 1e18; for (let i = 0; i < tr.N; i++) { const p = tr.pts[i], d = (p[0] - x * sc) ** 2 + (p[1] - y * sc) ** 2; if (d < bd) { bd = d; bi = i; } } const o = []; for (let d = -half * sc; d <= half * sc; d += 150) o.push(wrapS(tr, bi * STEP + d)); return o; });
  const busy = s => [...tr.bridges.flatMap(b => [b.s, b.sUnder]), ...tr.pads.map(p => p.s), ...tr.gc.map(g => g.s), ...tr.jumps.map(j => j.s), ...tr.gaps.map(g => g.s), ...(tr.mech ? tr.mech.avoid : []), ...(tr.keepClear || []), ...noBoxes, ...(tr.rail ? tr.rail.crossings.map(c => c.s) : [])].some(b => away(s, b) < 300);   // (nor where karts queue for a train)
  // a track can place its rows by hand instead (`boxAt: [[x, y], ...]`, layout points: Moonshot, where the rides' long
  // stretches and the mechanics leave the even spacing nowhere good to go)
  if (tr.def.boxAt) for (const [x, y] of tr.def.boxAt) { let bi = 0, bd = 1e18; for (let i = 0; i < tr.N; i++) { const p = tr.pts[i], d = (p[0] - x * sc) ** 2 + (p[1] - y * sc) ** 2; if (d < bd) { bd = d; bi = i; } } rowList.push({ s: bi * STEP }); }
  for (let r = 0; r < (tr.def.boxAt ? 0 : rows); r++) {
    const f = (r + 0.5) / rows, s0 = base + (f - 0.08 / rows * 3) * span, s1 = base + (f + 0.08 / rows * 3) * span;
    const wide = r === WIDE_ROW && !tr.def.boxLanes && wideSpot(tr, s0, s1, away, busy);
    if (wide) {
      const s = wrapS(tr, wide.s + WIDE_AT), p = trackSample(tr, s);
      if (!busy(s)) { rowList.push({ s, wide: (p.hw > tr.halfW * 1.3 ? [0.35, 0.8] : [0.75]).map(u => wide.side * u) }); continue; }
    }
    let best = base + f * span, bk = 1e9;
    for (let s = s0; s < s1; s += 10) { if (busy(s)) continue; let k = 0; for (let d = -60; d <= 60; d += 10) k += Math.abs(curvAt(tr, s + d)); if (k < bk) { bk = k; best = s; } }
    if (bk === 1e9) {   // the whole stretch is taken (a cliff's flight, race-cliff.js): the nearest free spot past it, either way
      let d = 10; while (d < span * 0.25 && busy(s1 + d) && busy(s0 - d)) d += 10;
      if (d >= span * 0.25) continue;
      best = busy(s1 + d) ? s0 - d : s1 + d;
    }
    if (Z) best = wrapS(tr, best);
    rowList.push({ s: best });
  }
  // a deliberate single (singlesOf) takes the place of the plain row nearest it; the others are pairs (or the track's own lanes)
  const singles = tr.def.boxLanes ? [] : singlesOf(tr, sc, span / rows * 0.6);
  for (const row of rowList) {
    const one = !row.wide && singles.find(o => away(o.s, row.s) < o.gap && rowList.every(q => away(o.s, q.s) >= away(o.s, row.s)));
    const s = one ? one.s : row.s, p = trackSample(tr, s);
    for (const u of row.wide || tr.def.boxLanes || (one ? [one.u] : [-0.4, 0.4])) { const lat = u * p.hw; boxes.push({ s, lat, x: p.x + p.nx * lat, y: p.y + p.ny * lat, t: 0 }); }
  }
  if (tr.mech) for (const J of tr.mech.jackpots) for (const g of J.boxes) { const p = trackSample(tr, g.s); boxes.push({ s: g.s, lat: g.lat, x: p.x + p.nx * g.lat, y: p.y + p.ny * g.lat, t: 0, gold: true }); }
  return boxes;
}
// item boxes for every route of a course: where two routes share a box (on the common straight) it's one box, and
// each box remembers where it sits on each route it belongs to
export function makeCourseBoxes(routes) {
  const boxes = [];
  for (const R of routes) for (const b of makeBoxes(R)) {
    // the same box seen from another route on a shared stretch sits on top of it; the two boxes of a row are ~56 apart, so
    // matching within 60 (as this did) merged every row down to one box on multi-route tracks
    const same = !b.gold && boxes.find(o => !o.gold && Math.hypot(o.x - b.x, o.y - b.y) < 12);
    if (same) { if (!same.on.has(R)) same.on.set(R, { s: b.s, lat: b.lat }); continue; }
    b.on = new Map([[R, { s: b.s, lat: b.lat }]]); boxes.push(b);
  }
  // a box on a shared stretch belongs to every route that passes over it
  for (const b of boxes) for (const R of routes) if (!b.on.has(R)) { const q = projectToTrack(R, b.x, b.y, b.on.values().next().value.s, 120); if (Math.abs(q.lat) < R.halfW - 10) { const p = trackSample(R, q.s); if (Math.hypot(p.x + p.nx * q.lat - b.x, p.y + p.ny * q.lat - b.y) < 8) b.on.set(R, { s: q.s, lat: q.lat }); } }
  if (routes.length < 2) return boxes;
  // on a course, a row only one road passes over is a single box down the middle (the user found pairs everywhere too
  // many there); rows on the stretches roads share keep their pair
  const out = [];
  for (const b of boxes) {
    if (b.gold || b.on.size !== 1) { out.push(b); continue; }
    const [R, o] = b.on.entries().next().value;
    const mate = out.find(m => !m.gold && m.on.size === 1 && m.on.has(R) && Math.abs(m.on.get(R).s - o.s) < 1);
    if (!mate) { out.push(b); continue; }
    const p = trackSample(R, o.s); mate.lat = 0; mate.x = p.x; mate.y = p.y; mate.on.set(R, { s: o.s, lat: 0 });
  }
  return out;
}
export const halfWAt = (tr, s) => tr.hw[Math.min(Math.floor(wrapS(tr, s) / STEP), tr.N - 1)];
export const curvAt = (tr, s) => tr.curv[Math.min(Math.floor(wrapS(tr, s) / STEP), tr.N - 1)];
export const insideAt = (tr, s) => tr.ins[Math.min(Math.floor(wrapS(tr, s) / STEP), tr.N - 1)];
export const RUNOFF = 75;                  // how far past the road edge the run-off goes
export const vmaxAt = (tr, s, grip) => { const k = Math.abs(curvAt(tr, s)); return k < 1e-4 ? 1e4 : Math.sqrt(grip / k); };
// is distance s along T on a bridge deck? (things there are drawn over the road below)
export const onBridge = (T, s) => T.bridges.some(b => { let d = s - b.s; if (!T.open) d = ((d % T.L) + T.L * 1.5) % T.L - T.L / 2; return Math.abs(d) < b.s1 - b.s; });
