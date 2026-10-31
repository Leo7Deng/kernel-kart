// Kernel Kart art: Neon Overflow (theme 'neon'): a rainy cyber-city at night from above, lit by itself, not the sun
// (neon trim, lit windows, signs pooling colour), and the rain (race-rain.js): the road turning to a mirror as it gets
// wet, puddles in the dips, and the darker dry line the karts squeegee into it.
//   baked (drawTrack): neonGround (the city), neonSlab (the Spiral and Skyway raised off the ground), neonStatic (road markings)
//   live: wetRoad (render.js, right after the baked layer), neonUnder (spray, drops, wakes, monorail shadow),
//         neonOver (rain, monorail, holograms, steam, lightning)
// Everything live comes from synced race fields and the clock, culled to the screen.
import { STEP, TAU, clamp, mulberry } from '../core.js';
import { trackSample, wrapS } from '../geometry.js';
import { elevAt } from '../race-elevation.js';
import { BIN, DRY_MAX, LANES, LEVELS, puddleDepth, rainAt, wetAt } from '../race-rain.js';
import { alpha, circ, ell, linear, poly, radial, shade } from './paint.js';
import { clearingsOf, findClearings } from './props.js';
import { distField } from './track.js';

const NEON = ['#00e5ff', '#ff2bd6', '#ffe14d', '#7c4dff', '#39ff88', '#ff6a3d'];
const GROUND = 25;                  // the city's street level (race-elevation.js heights): the Spiral and the Skyway stand above it
const LIFT = 0.55, LIFT_MAX = 44;   // a building's roof sits this far up the screen per unit of height
const PITCH = 380, STREET = 64;     // the city grid: a block every PITCH, streets STREET wide between them
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
function makeCanvas(w, h) { if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; } return new OffscreenCanvas(w, h); }

// a closed ribbon along a route between offsets a(i) and b(i) (+ = left of travel)
function ribbon(R, a, b, step = 2, i0 = 0, i1 = R.N - 1, p = new Path2D()) {
  const at = (i, o) => { const j = ((i % R.N) + R.N) % R.N; return [R.pts[j][0] - R.tan[j][1] * o(j), R.pts[j][1] + R.tan[j][0] * o(j)]; };
  for (let i = i0; i <= i1; i += step) { const [x, y] = at(i, a); i === i0 ? p.moveTo(x, y) : p.lineTo(x, y); }
  for (let i = i1; i >= i0; i -= step) { const [x, y] = at(i, b); p.lineTo(x, y); }
  p.closePath(); return p;
}
// the runs of samples (i0..i1, wrapping round the lap) where pred(i) holds
function runsOf(R, pred) {
  const out = []; let start = -1;
  for (let i = 0; i < R.N; i++) { if (pred(i)) { if (start < 0) start = i; } else if (start >= 0) { out.push([start, i - 1]); start = -1; } }
  if (start >= 0) { if (out.length && out[0][0] === 0) out[0] = [start - R.N, out[0][1]]; else out.push([start, R.N - 1]); }
  return out;
}
const upAt = (T, i) => T.mech && T.mech.elev ? T.mech.elev.h[i] - GROUND : 0;   // how far up off the street the road is here

// ---------------------------------------------------------------- the car park and the roofs over the Gap
// (city.garage, city.roofs, layout [x0, y0, x1, y1]): the Corkscrew climbs inside an open car park, onto its top deck
// (roof 0, at the road's height) and across the Gap to a lower roof (roof 1). The road over a roof is flush with it: no
// pillars, shadow or deck faces (neonSlab, slabFaces skip it); the roof's own face hangs below its front edge.
const plotCache = new WeakMap();
export function plotsOf(T) {
  if (plotCache.has(T)) return plotCache.get(T);
  const C = T.def.city || {}, sc = T.def.scale || 1, rect = r => ({ x0: r[0] * sc, y0: r[1] * sc, x1: r[2] * sc, y1: r[3] * sc });
  const hAt = (x, y) => { let bi = 0, bd = 1e18; for (let i = 0; i < T.N; i += 2) { const d = (T.pts[i][0] - x) ** 2 + (T.pts[i][1] - y) ** 2; if (d < bd) { bd = d; bi = i; } } return elevAt(T, bi * STEP); };
  const roofs = (C.roofs || []).map(r => { const R = rect(r); R.h = hAt((R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2); R.face = Math.min(LIFT_MAX, Math.max(0, R.h - GROUND) * LIFT); return R; });
  // the slip road at the Merge (city.slip: a quadratic from the street via a control point to the freeway's edge,
  // layout units), sampled with its height up to the freeway's
  let slip = null;
  if (C.slip) {
    const [a, b, c] = C.slip.map(([x, y]) => [x * sc, y * sc]), h1 = hAt(c[0], c[1]);
    slip = [];
    for (let k = 0; k <= 40; k++) { const u = k / 40, v = 1 - u, x = v * v * a[0] + 2 * u * v * b[0] + u * u * c[0], y = v * v * a[1] + 2 * u * v * b[1] + u * u * c[1], tx = 2 * v * (b[0] - a[0]) + 2 * u * (c[0] - b[0]), ty = 2 * v * (b[1] - a[1]) + 2 * u * (c[1] - b[1]), l = Math.hypot(tx, ty) || 1; slip.push({ x, y, tx: tx / l, ty: ty / l, h: GROUND + (h1 - GROUND) * (u * u * (3 - 2 * u)) }); }
  }
  const P = { garage: C.garage ? rect(C.garage) : null, roofs, slip };
  plotCache.set(T, P); return P;
}
const inRect = (R, x, y, m = 0) => x > R.x0 - m && x < R.x1 + m && y > R.y0 - m && y < R.y1 + (R.face || 0) + m;
const onRoof = (T, x, y) => plotsOf(T).roofs.some(R => x > R.x0 && x < R.x1 && y > R.y0 && y < R.y1);   // (the roof's top, not its face)
const inGap = (T, i) => T.gaps.some(g => i * STEP > g.s0 - 4 && i * STEP < g.s1 + 4);   // (sample i is over the Gap: nothing of the road's there)

// ---------------------------------------------------------------- the city plan (worked out once per track)
// buildings on a street grid wherever there's room off the road, pavements, plazas, Spire and pylons; signs, vents,
// the monorail. T.keepOut keeps the scattered props off the buildings, leaving them on pavements and plazas.
const plans = new WeakMap();
export function cityOf(T) {
  if (plans.has(T)) return plans.get(T);
  const d = T.def, sc = d.scale || 1, C = d.city || {}, dist = distField(T), rng = mulberry(T.N * 31 + 7), B = T.bbox;
  const side = (d.runoff || 46) + 20;    // the pavement past the road's edge
  const marks = findClearings(T, dist, 'neon');   // the plazas (cached: the landmarks go there)
  const spire = C.spire ? { x: C.spire[0] * sc, y: C.spire[1] * sc, r: C.spire[2] * sc } : null;
  const mono = (C.monorail || []).map(([x, y]) => [x * sc, y * sc]);
  const pylons = [];
  for (let k = 0; k + 1 < mono.length; k++) { const [ax, ay] = mono[k], [bx, by] = mono[k + 1], L = Math.hypot(bx - ax, by - ay); for (let u = k ? 0 : 60; u < L; u += 300) { const x = ax + (bx - ax) * u / L, y = ay + (by - ay) * u / L; if (dist(x, y, 120) > 30) pylons.push({ x, y }); } }
  const plots = plotsOf(T);
  const free = (x0, y0, w, h, lift) => {
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      const x = x0 + w * i / 4, y = y0 + h * j / 4;
      if (dist(x, y, side + 60) < side + 8 || dist(x, y - lift, side + 60) < side - 10) return false;
      for (const m of marks) if (Math.hypot(m.x - x, m.y - y) < m.r * 0.92) return false;
      if (spire && Math.hypot(spire.x - x, spire.y - y) < spire.r + 30) return false;
      for (const p of pylons) if (Math.hypot(p.x - x, p.y - y) < 26) return false;
      if (plots.garage && inRect(plots.garage, x, y, 30)) return false;
      for (const R of plots.roofs) if (inRect(R, x, y, 30) || inRect(R, x, y - lift, 30)) return false;
      if (plots.slip) for (const q of plots.slip) if (Math.hypot(q.x - x, q.y - y) < 80 || Math.hypot(q.x - x, q.y - y + lift) < 80) return false;
    }
    return true;
  };
  const blds = [], X0 = Math.floor((B.x - 420) / PITCH) * PITCH, Y0 = Math.floor((B.y - 420) / PITCH) * PITCH;
  const tryB = (x, y, w, h, depth) => {
    const ht = 16 + rng() * 64 * (0.4 + 0.6 * rng()) + (rng() < 0.1 ? 40 : 0), lift = Math.min(LIFT_MAX, ht * LIFT);
    if (free(x, y, w, h, lift)) { blds.push({ x, y, w, h, ht, lift, v: rng(), c: NEON[Math.floor(rng() * NEON.length)], kind: ROOF[Math.floor(rng() * ROOF.length)], trim: rng() < 0.4, blade: rng() < 0.35 }); return; }
    if (depth > 1 || w < 110 || h < 110) return;
    const g = 8;   // a narrow alley between the parts
    tryB(x, y, w / 2 - g, h / 2 - g, depth + 1); tryB(x + w / 2 + g, y, w / 2 - g, h / 2 - g, depth + 1);
    tryB(x, y + h / 2 + g, w / 2 - g, h / 2 - g, depth + 1); tryB(x + w / 2 + g, y + h / 2 + g, w / 2 - g, h / 2 - g, depth + 1);
  };
  for (let gy = Y0; gy < B.y + B.h + 420; gy += PITCH) for (let gx = X0; gx < B.x + B.w + 420; gx += PITCH) {
    const x0 = gx + STREET / 2, y0 = gy + STREET / 2, w = PITCH - STREET, inset = 12;
    // a block: one, two or three buildings
    const split = rng(), cut = 0.35 + rng() * 0.3, alley = 10;
    if (split < 0.3) tryB(x0 + inset, y0 + inset, w - inset * 2, w - inset * 2, 0);
    else if (split < 0.65) { const a = (w - inset * 2) * cut; tryB(x0 + inset, y0 + inset, a - alley / 2, w - inset * 2, 0); tryB(x0 + inset + a + alley / 2, y0 + inset, w - inset * 2 - a - alley / 2, w - inset * 2, 0); }
    else { const a = (w - inset * 2) * cut; tryB(x0 + inset, y0 + inset, w - inset * 2, a - alley / 2, 0); tryB(x0 + inset, y0 + inset + a + alley / 2, (w - inset * 2) * 0.5 - alley / 2, w - inset * 2 - a - alley / 2, 0); tryB(x0 + inset + (w - inset * 2) * 0.5 + alley / 2, y0 + inset + a + alley / 2, (w - inset * 2) * 0.5 - alley / 2, w - inset * 2 - a - alley / 2, 0); }
  }
  blds.sort((a, b) => (a.y + a.h) - (b.y + b.h));
  const lots = [];   // the car park and the roofs keep the props off them too (as rows of circles)
  for (const R of [plots.garage, ...plots.roofs]) if (R) for (let y = R.y0; y <= R.y1 + (R.face || 0); y += 70) for (let x = R.x0; x <= R.x1; x += 70) lots.push([x, y, 60]);
  if (plots.slip) for (const q of plots.slip) lots.push([q.x, q.y, 70]);
  T.keepOut = [...(T.keepOut || []), ...blds.map(b => [b.x + b.w / 2, b.y + b.h / 2 - b.lift / 2, Math.hypot(b.w, b.h + b.lift) / 2]), ...(spire ? [[spire.x, spire.y, spire.r + 20]] : []), ...pylons.map(p => [p.x, p.y, 24]), ...lots];
  // signs: neon totems along the road's pavements (and their glow smeared across the road when it's wet)
  const signs = [];
  for (const R of T.routes || [T]) for (let s = 140; s < R.L; s += 210 + rng() * 140) {
    const q = trackSample(R, s), sd = rng() < 0.5 ? 1 : -1, o = sd * (q.hw + side - 10), x = q.x + q.nx * o, y = q.y + q.ny * o;
    if (dist(x, y, side + 40) < side - 24 || (R.mech && R.mech.elev && elevAt(R, s) > GROUND + 8)) continue;   // (none on the Skyway)
    signs.push({ x, y, a: Math.atan2(q.ty, q.tx), s, sd, rx: q.x + q.nx * sd * q.hw * 0.35, ry: q.y + q.ny * sd * q.hw * 0.35, c: NEON[Math.floor(rng() * NEON.length)], k: Math.floor(rng() * 4), v: rng() });
  }
  // vents: steam out of the manholes, on the pavements by the road
  const vents = [];
  for (let s = 400; s < T.L; s += 900 + rng() * 700) { const q = trackSample(T, s), sd = rng() < 0.5 ? 1 : -1, o = sd * (q.hw + side * 0.55), x = q.x + q.nx * o, y = q.y + q.ny * o; if (dist(x, y, side) > side * 0.3 && !(plots.garage && inRect(plots.garage, x, y)) && !plots.roofs.some(R => inRect(R, x, y))) vents.push({ x, y, v: rng() }); }
  const P = { blds, signs, vents, marks, spire, mono, pylons, side };
  plans.set(T, P); return P;
}

// ---------------------------------------------------------------- the ground (drawTrack: track.js ground, tex 'city')
export function neonGround(g, T, X0, Y0, W, H, rng, dist, D) {
  const P = cityOf(T), routes = T.routes || [T];
  g.fillStyle = '#10131f'; g.fillRect(X0, Y0, W, H);
  // the blocks' pavements and the streets between them
  const gx0 = Math.floor(X0 / PITCH) * PITCH, gy0 = Math.floor(Y0 / PITCH) * PITCH;
  for (let gy = gy0; gy < Y0 + H; gy += PITCH) for (let gx = gx0; gx < X0 + W; gx += PITCH) {
    g.fillStyle = '#1d2234'; g.fillRect(gx + STREET / 2, gy + STREET / 2, PITCH - STREET, PITCH - STREET);
    g.strokeStyle = '#3a4260'; g.lineWidth = 2; g.strokeRect(gx + STREET / 2 + 1, gy + STREET / 2 + 1, PITCH - STREET - 2, PITCH - STREET - 2);   // the kerb
    if (D > 0.5) { g.strokeStyle = 'rgba(255,255,255,0.03)'; g.lineWidth = 1; g.beginPath(); for (let k = 20; k < PITCH - STREET; k += 20) { g.moveTo(gx + STREET / 2 + k, gy + STREET / 2); g.lineTo(gx + STREET / 2 + k, gy + PITCH - STREET / 2); g.moveTo(gx + STREET / 2, gy + STREET / 2 + k); g.lineTo(gx + PITCH - STREET / 2, gy + STREET / 2 + k); } g.stroke(); }   // paving slabs
  }
  if (D > 0.5) {   // the streets' centre lines and crossings
    g.strokeStyle = 'rgba(255,214,90,0.22)'; g.lineWidth = 2; g.setLineDash([16, 18]); g.beginPath();
    for (let gy = gy0; gy < Y0 + H; gy += PITCH) { g.moveTo(X0, gy); g.lineTo(X0 + W, gy); }
    for (let gx = gx0; gx < X0 + W; gx += PITCH) { g.moveTo(gx, Y0); g.lineTo(gx, Y0 + H); }
    g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(230,236,255,0.14)';
    for (let gy = gy0; gy < Y0 + H; gy += PITCH) for (let gx = gx0; gx < X0 + W; gx += PITCH) for (let k = -3; k <= 3; k++) { g.fillRect(gx + STREET / 2 + 4, gy + k * 8 - 2.5, 12, 5); g.fillRect(gx + k * 8 - 2.5, gy + STREET / 2 + 4, 5, 12); }
  }
  // the road's pavements out to a kerb (its run-off; the road goes over it), not under the raised Spiral and Skyway
  for (const R of routes) {
    const lim = P.side, pave = new Path2D(), kerb = new Path2D();
    for (const [i0, i1] of runsOf(R, i => upAt(R, i) < 10)) {
      ribbon(R, i => R.hw[i] + lim, i => -R.hw[i] - lim, 2, i0, i1, pave);
      for (const sd of [-1, 1]) { const o = i => sd * (R.hw[i] + lim); for (let i = i0; i <= i1; i += 2) { const j = ((i % R.N) + R.N) % R.N, x = R.pts[j][0] - R.tan[j][1] * o(j), y = R.pts[j][1] + R.tan[j][0] * o(j); i === i0 ? kerb.moveTo(x, y) : kerb.lineTo(x, y); } }
    }
    g.fillStyle = '#262c40'; g.fill(pave);
    g.strokeStyle = '#4a5476'; g.lineWidth = 3; g.stroke(kerb);
  }
  // light pooling on the ground: the signs' colours, the street lamps
  if (D > 0.5) {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const s of P.signs) { const r = 90; g.fillStyle = radial(g, s.x, s.y, 0, s.x, s.y, r, [[0, alpha(s.c, 0.16)], [1, alpha(s.c, 0)]]); g.fillRect(s.x - r, s.y - r, r * 2, r * 2); }
    for (let i = 0; i < W * H / 90000; i++) { const x = X0 + rng() * W, y = Y0 + rng() * H, r = 60 + rng() * 60; if (dist(x, y, 200) < 60) continue; const c = rng() < 0.6 ? '#ffcf7a' : NEON[Math.floor(rng() * NEON.length)]; g.fillStyle = radial(g, x, y, 0, x, y, r, [[0, alpha(c, 0.09)], [1, alpha(c, 0)]]); g.fillRect(x - r, y - r, r * 2, r * 2); }
    g.restore();
  }
  // the monorail's pylons (the beam over them is drawn live, over the karts)
  for (const p of P.pylons) { g.fillStyle = 'rgba(0,0,0,0.35)'; ell(g, p.x + 10, p.y + 12, 18, 12); g.fill(); g.fillStyle = '#3b4258'; g.fillRect(p.x - 9, p.y - 9, 18, 18); g.fillStyle = '#545d7c'; g.fillRect(p.x - 9, p.y - 9, 18, 5); }
  for (const b of P.blds) building(g, b, D);
  { const L = plotsOf(T), r = mulberry(T.N + 404); if (L.garage) carPark(g, L.garage, r, D); L.roofs.forEach((R, k) => roofBlock(g, R, k, r, D)); if (L.slip) slipRoad(g, L.slip, D); }
  for (const sg of P.signs) totem(g, sg, D);
  if (P.spire) spire(g, P.spire, D);
  for (const v of P.vents) { circ(g, v.x, v.y, 11); g.fillStyle = '#2b3146'; g.fill(); g.strokeStyle = '#151927'; g.lineWidth = 2; g.stroke(); g.beginPath(); for (let k = -6; k <= 6; k += 4) { g.moveTo(v.x - 8, v.y + k); g.lineTo(v.x + 8, v.y + k); } g.stroke(); }
}

// a building from above at night: its roof up the screen by its height, the lit face toward us below it. Roof kinds:
// plain, skylights, stepped tower, garden, helipad, billboard, water tanks.
const ROOF = ['plain', 'plain', 'plain', 'skylight', 'skylight', 'tiers', 'tiers', 'billboard', 'billboard', 'garden', 'helipad', 'tanks'];
function face(g, x, y0, w, y1, c, r, D) {
  g.fillStyle = linear(g, 0, y0, 0, y1, [[0, '#171c30'], [1, '#0b0e18']]); g.fillRect(x, y0, w, y1 - y0);
  if (D <= 0.5) return;
  const tint = r() < 0.5 ? 'rgba(255,208,130,' : 'rgba(140,220,255,';
  for (let wy = y0 + 3; wy < y1 - 3; wy += 6) for (let wx = x + 3; wx < x + w - 4; wx += 6) {
    const u = r(); if (u > 0.5) continue;
    g.fillStyle = u < 0.3 ? tint + (0.45 + u).toFixed(2) + ')' : u < 0.4 ? alpha(c, 0.7) : 'rgba(255,255,255,0.18)'; g.fillRect(wx, wy, 3.5, 3);
  }
}
function building(g, b, D) {
  const { x, y, w, h, lift } = b, r = mulberry(Math.floor(b.v * 1e6)), top = y - lift, kind = b.kind;
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x + 5, y + 7, w, h);   // its foot: a soft dark edge on the pavement
  if (lift > 2) face(g, x, top + h, w, y + h, b.c, r, D);
  // the roof
  const tone = 22 + Math.floor(b.v * 16), hue = Math.floor(b.v * 37) % 3;
  const base = hue === 0 ? [tone + 8, tone + 12, tone + 30] : hue === 1 ? [tone + 14, tone + 8, tone + 30] : [tone + 4, tone + 16, tone + 26];
  g.fillStyle = linear(g, x, top, x + w, top + h, [[0, `rgb(${base[0] + 10},${base[1] + 10},${base[2] + 12})`], [1, `rgb(${base[0]},${base[1]},${base[2]})`]]); g.fillRect(x, top, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 1, top + h); g.lineTo(x + 1, top + 1); g.lineTo(x + w, top + 1); g.stroke();   // lit edges, top left
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.strokeRect(x + 5, top + 5, w - 10, h - 10);   // the parapet
  if (D > 0.5) {
    if (kind === 'helipad' && w > 64 && h > 64) {
      const cx = x + w / 2, cy = top + h / 2, rr = Math.min(w, h) * 0.32;
      circ(g, cx, cy, rr); g.fillStyle = '#2a3048'; g.fill(); g.strokeStyle = '#ffe14d'; g.lineWidth = 2; g.stroke();
      g.strokeStyle = 'rgba(240,244,255,0.8)'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - rr * 0.35, cy - rr * 0.45); g.lineTo(cx - rr * 0.35, cy + rr * 0.45); g.moveTo(cx + rr * 0.35, cy - rr * 0.45); g.lineTo(cx + rr * 0.35, cy + rr * 0.45); g.moveTo(cx - rr * 0.35, cy); g.lineTo(cx + rr * 0.35, cy); g.stroke();
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; circ(g, cx + Math.cos(a) * rr * 1.15, cy + Math.sin(a) * rr * 1.15, 2); g.fillStyle = '#ff5a3c'; g.fill(); }
    } else if (kind === 'garden' && w > 50) {
      g.fillStyle = '#1b3a30'; g.fillRect(x + 7, top + 7, w - 14, h - 14);
      for (let k = 0; k < w * h / 900; k++) { const px = x + 14 + r() * (w - 28), py = top + 14 + r() * (h - 28), pr = 5 + r() * 7; g.fillStyle = 'rgba(0,0,0,0.3)'; circ(g, px + 3, py + 4, pr); g.fill(); circ(g, px, py, pr); g.fillStyle = r() < 0.5 ? '#2c5c48' : '#38704f'; g.fill(); circ(g, px - pr * 0.3, py - pr * 0.3, pr * 0.4); g.fillStyle = 'rgba(160,230,180,0.25)'; g.fill(); }
      g.strokeStyle = 'rgba(255,214,140,0.5)'; g.lineWidth = 1; g.setLineDash([2, 6]); g.strokeRect(x + 9, top + 9, w - 18, h - 18); g.setLineDash([]);   // fairy lights round it
    } else if (kind === 'skylight' && w > 40 && h > 40) {
      const nx = Math.max(1, Math.floor((w - 20) / 22)), ny = Math.max(1, Math.floor((h - 20) / 22)), cw = (w - 20) / nx, ch = (h - 20) / ny;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const lit = r() < 0.55; g.fillStyle = lit ? 'rgba(150,200,255,0.35)' : 'rgba(10,14,26,0.6)'; g.fillRect(x + 10 + i * cw + 2, top + 10 + j * ch + 2, cw - 4, ch - 4); if (lit) { g.fillStyle = 'rgba(220,240,255,0.25)'; g.fillRect(x + 10 + i * cw + 2, top + 10 + j * ch + 2, cw - 4, 2); } }
    } else if (kind === 'tiers' && w > 60 && h > 60) {   // a stepped tower: a smaller block standing on the roof, its own face and roof
      const iw = w * 0.55, ih = h * 0.5, ix = x + (w - iw) * (0.3 + 0.4 * r()), iy = top + (h - ih) * 0.5, l2 = Math.min(26, lift * 0.7 + 8);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(ix + 4, iy + 5, iw, ih);
      face(g, ix, iy - l2 + ih, iw, iy + ih, b.c, r, D);
      g.fillStyle = `rgb(${base[0] + 14},${base[1] + 14},${base[2] + 18})`; g.fillRect(ix, iy - l2, iw, ih);
      g.save(); g.shadowColor = b.c; g.shadowBlur = 10; g.strokeStyle = alpha(b.c, 0.85); g.lineWidth = 2; g.strokeRect(ix + 2, iy - l2 + 2, iw - 4, ih - 4); g.restore();
      b.beacon = [ix + iw / 2, iy - l2 + ih / 2];   // an aircraft light (it blinks: neonOver)
    } else if (kind === 'billboard') {   // a big screen on the roof, facing down the street: a gradient and a shape on it
      const bw = Math.min(w * 0.8, 120), bx = x + (w - bw) / 2, by = top + h * 0.35, bh = Math.max(10, Math.min(24, h * 0.25)), c2 = NEON[(NEON.indexOf(b.c) + 2) % NEON.length];
      g.fillStyle = '#0b0e18'; g.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
      g.save(); g.shadowColor = b.c; g.shadowBlur = 16; g.fillStyle = linear(g, bx, 0, bx + bw, 0, [[0, alpha(b.c, 0.95)], [1, alpha(c2, 0.95)]]); g.fillRect(bx, by, bw, bh); g.restore();
      g.fillStyle = 'rgba(255,255,255,0.75)'; const sh = Math.floor(b.v * 101) % 3;
      if (sh === 0) { circ(g, bx + bw * 0.25, by + bh / 2, bh * 0.32); g.fill(); g.fillRect(bx + bw * 0.45, by + bh * 0.3, bw * 0.45, bh * 0.14); g.fillRect(bx + bw * 0.45, by + bh * 0.56, bw * 0.3, bh * 0.14); }
      else if (sh === 1) { poly(g, [[bx + bw * 0.12, by + bh * 0.8], [bx + bw * 0.25, by + bh * 0.2], [bx + bw * 0.38, by + bh * 0.8]]); g.fill(); for (let k = 0; k < 4; k++) g.fillRect(bx + bw * (0.48 + k * 0.12), by + bh * 0.3, bw * 0.08, bh * 0.4); }
      else { g.font = `700 ${bh * 0.8}px ui-monospace, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(['</>', '0x7F', '>_', '{ }', '::'][Math.floor(b.v * 50) % 5], bx + bw / 2, by + bh / 2 + 1); }
      g.fillStyle = '#2a2f44'; g.fillRect(bx + bw * 0.2, by + bh + 3, 4, 8); g.fillRect(bx + bw * 0.8, by + bh + 3, 4, 8);
    } else if (kind === 'tanks') {
      for (let k = 0; k < 3; k++) { const px = x + w * (0.25 + 0.25 * k), py = top + h * (0.35 + 0.3 * r()), pr = Math.min(w, h) * 0.12; g.fillStyle = 'rgba(0,0,0,0.35)'; circ(g, px + 3, py + 4, pr); g.fill(); circ(g, px, py, pr); g.fillStyle = '#4b4560'; g.fill(); circ(g, px - pr * 0.25, py - pr * 0.25, pr * 0.55); g.fillStyle = '#5e5878'; g.fill(); }
    }
    if (kind === 'plain' || kind === 'tanks' || kind === 'billboard') {
      if (r() < 0.6 && w > 50 && h > 50) { const sw = 22, sx = x + 8 + r() * (w - sw - 16), sy = top + 8 + r() * (h - sw - 16); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(sx + 3, sy + 4, sw, sw * 0.7); g.fillStyle = `rgb(${base[0] + 18},${base[1] + 18},${base[2] + 22})`; g.fillRect(sx, sy, sw, sw * 0.7); g.fillStyle = 'rgba(255,208,130,0.6)'; g.fillRect(sx + sw * 0.35, sy + sw * 0.7 - 3, sw * 0.3, 3); }   // a stair hut, its door lit
      for (let k = 0; k < w * h / 1800; k++) {   // air conditioners and vents
        const ax = x + 8 + r() * (w - 26), ay = top + 8 + r() * (h - 22), t = r();
        if (t < 0.65) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(ax + 2, ay + 3, 12, 9); g.fillStyle = '#4a5270'; g.fillRect(ax, ay, 12, 9); g.strokeStyle = '#2a2f44'; g.lineWidth = 1; circ(g, ax + 6, ay + 4.5, 3); g.stroke(); }
        else { g.fillStyle = '#3a4058'; g.fillRect(ax, ay, 6, 14); g.fillStyle = '#2a2f44'; g.fillRect(ax + 1, ay + 1, 4, 2); }
      }
    }
  }
  if (b.trim) { g.save(); g.shadowColor = b.c; g.shadowBlur = 12; g.strokeStyle = alpha(b.c, 0.9); g.lineWidth = 2; g.strokeRect(x + 1.5, top + 1.5, w - 3, h - 3); g.restore(); }
  if (lift > 14 && b.blade && D > 0.5) {   // a blade sign hanging off its face, glyphs down it
    const bx = x + w * (0.15 + 0.7 * r()), y0 = top + h + 2, bh = Math.min(lift - 4, 40);
    g.save(); g.shadowColor = b.c; g.shadowBlur = 14; g.fillStyle = alpha(b.c, 0.95); g.fillRect(bx - 4, y0, 8, bh); g.restore();
    g.fillStyle = 'rgba(12,14,24,0.85)'; for (let k = y0 + 3; k < y0 + bh - 5; k += 7) g.fillRect(bx - 2.5, k, 5, 4);
  }
}
// a parked car seen from above: body, glass, a highlight along it, tail lights; facing a (radians)
function parked(g, x, y, a, c, r) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.roundRect(-17, -8, 38, 20, 5); g.fill();
  g.fillStyle = c; g.beginPath(); g.roundRect(-19, -10, 38, 20, 5); g.fill();
  g.fillStyle = 'rgba(14,18,32,0.85)'; g.beginPath(); g.roundRect(-6, -8, 13, 16, 3); g.fill();   // the glass
  g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(-17, -9, 34, 2.5);
  g.fillStyle = r() < 0.3 ? '#ff4d5e' : 'rgba(255,90,90,0.55)'; g.fillRect(-19, -8, 2, 4); g.fillRect(-19, 4, 2, 4);   // tail lights
  g.restore();
}
const CAR_COLS = ['#3c4b6e', '#6e3c4f', '#c9ccd6', '#2f5f55', '#5b4a7a', '#8a6a3a', '#24283a', '#b3b8c6'];
// the car park's ground floor round the Corkscrew (the ramps go over it): bays with parked cars, pillars, a lit P
function carPark(g, R, r, D) {
  const { x0, y0, x1, y1 } = R, w = x1 - x0, h = y1 - y0;
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.roundRect(x0 + 6, y0 + 8, w, h, 18); g.fill();
  g.fillStyle = linear(g, x0, y0, x1, y1, [[0, '#2b3146'], [1, '#22273a']]); g.beginPath(); g.roundRect(x0, y0, w, h, 18); g.fill();
  if (D > 0.5) {
    g.strokeStyle = 'rgba(255,255,255,0.035)'; g.lineWidth = 1; g.beginPath(); for (let x = x0 + 40; x < x1; x += 40) { g.moveTo(x, y0 + 6); g.lineTo(x, y1 - 6); } g.stroke();   // the slab's joints
    // rows of bays, nose to nose, a car in most
    for (let y = y0 + 34; y < y1 - 30; y += 92) for (const sd of [-1, 1]) for (let x = x0 + 24; x < x1 - 24; x += 30) {
      const by = y + sd * 21;
      g.strokeStyle = 'rgba(230,236,255,0.28)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - 15, by - 21); g.lineTo(x - 15, by + 21); g.stroke();
      if (r() < 0.62) parked(g, x, by, sd < 0 ? -Math.PI / 2 : Math.PI / 2, CAR_COLS[Math.floor(r() * CAR_COLS.length)], r);
    }
    for (let y = y0 + 80; y < y1 - 40; y += 184) for (let x = x0 + 60; x < x1 - 40; x += 150) { g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x + 3, y + 4, 14, 14); g.fillStyle = '#4a5270'; g.fillRect(x, y, 14, 14); g.fillStyle = '#5e6890'; g.fillRect(x, y, 14, 4); }   // pillars
  }
  // the kerb: yellow and black, and a soft cyan strip light along it
  g.save(); g.beginPath(); g.roundRect(x0 + 4, y0 + 4, w - 8, h - 8, 15); g.lineWidth = 6; g.setLineDash([14, 10]); g.strokeStyle = '#e7c23a'; g.stroke(); g.lineDashOffset = 12; g.strokeStyle = '#191c28'; g.setLineDash([10, 14]); g.stroke(); g.restore();
  g.save(); g.shadowColor = '#00e5ff'; g.shadowBlur = D > 0.5 ? 14 : 0; g.strokeStyle = 'rgba(0,229,255,0.75)'; g.lineWidth = 2; g.beginPath(); g.roundRect(x0 + 11, y0 + 11, w - 22, h - 22, 12); g.stroke(); g.restore();
  // the P: a lit sign on the slab's corner by the street
  const px = x1 - 46, py = y1 - 46;
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.roundRect(px - 26 + 5, py - 26 + 7, 52, 52, 8); g.fill();
  g.fillStyle = '#123a8c'; g.beginPath(); g.roundRect(px - 26, py - 26, 52, 52, 8); g.fill();
  g.save(); g.shadowColor = '#4da3ff'; g.shadowBlur = D > 0.5 ? 18 : 0; g.strokeStyle = '#8cc8ff'; g.lineWidth = 3; g.stroke(); g.restore();
  g.fillStyle = '#ffffff'; g.font = '900 40px ui-sans-serif, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('P', px, py + 2);
}
// the slip road climbing onto the freeway at the Merge: shadow, pillars, deck face, deck, parapet lights (the freeway
// covers its far end)
function slipRoad(g, S, D) {
  const HW = 34, up = q => Math.max(0, q.h - GROUND), at = (q, o, dy = 0) => [q.x - q.ty * o, q.y + q.tx * o + dy];
  const band = (o0, o1, dy) => { const p = new Path2D(); S.forEach((q, k) => { const [x, y] = at(q, o0, dy(q)); k ? p.lineTo(x, y) : p.moveTo(x, y); }); for (let k = S.length - 1; k >= 0; k--) { const [x, y] = at(S[k], o1, dy(S[k])); p.lineTo(x, y); } p.closePath(); return p; };
  g.save();
  g.fillStyle = 'rgba(2,3,10,0.55)'; g.translate(0, 0); { const p = new Path2D(); S.forEach((q, k) => { const o = up(q) * SH_K; const [x, y] = at(q, HW + 6); k ? p.lineTo(x + o * 0.6, y + o) : p.moveTo(x + o * 0.6, y + o); }); for (let k = S.length - 1; k >= 0; k--) { const q = S[k], o = up(q) * SH_K, [x, y] = at(q, -HW - 6); p.lineTo(x + o * 0.6, y + o); } p.closePath(); g.fill(p); }
  for (let k = 6; k < S.length - 4; k += 8) { const q = S[k], h = up(q), f = Math.min(FACE_MAX, h * FACE_K); if (h < 16) continue; g.fillStyle = '#353c58'; g.fillRect(q.x - 6, q.y + f, 12, h * 0.9 - f); }   // pillars
  for (const sd of [-1, 1]) { g.fillStyle = '#3e4664'; g.fill(band(sd * HW, sd * HW, q => Math.min(FACE_MAX, 3 + up(q) * FACE_K) * Math.max(0, sd * S[0].tx))); }   // the face under the down-screen edge
  g.fillStyle = '#2e3346'; g.fill(band(HW, -HW, () => 0));
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.setLineDash([14, 14]); g.beginPath(); S.forEach((q, k) => k ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)); g.stroke(); g.setLineDash([]);
  for (const sd of [-1, 1]) { g.strokeStyle = '#6a7396'; g.lineWidth = 5; g.beginPath(); S.forEach((q, k) => { const [x, y] = at(q, sd * (HW - 2)); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); if (D > 0.5) { g.save(); g.strokeStyle = 'rgba(255,43,214,0.85)'; g.shadowColor = '#ff2bd6'; g.shadowBlur = 8; g.lineWidth = 1.5; g.stroke(); g.restore(); } }
  g.restore();
}
// a roof the road runs across: its face down to the street, the roof at the road's height, a parapet; k 0 the car
// park's top deck, k 1 the next building's
function roofBlock(g, R, k, r, D) {
  const { x0, y0, x1, y1, face: f } = R, w = x1 - x0, h = y1 - y0;
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x0 + 8, y0 + 10 + f, w, h);   // its foot
  face(g, x0, y1, w, y1 + f, k ? '#ff2bd6' : '#00e5ff', r, D);
  g.fillStyle = linear(g, x0, y0, x1, y1, k ? [[0, '#323650'], [1, '#262a40']] : [[0, '#363d58'], [1, '#2a3048']]); g.fillRect(x0, y0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 + 1, y1); g.lineTo(x0 + 1, y0 + 1); g.lineTo(x1, y0 + 1); g.stroke();   // lit edges, top left
  g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 4; g.strokeRect(x0 + 5, y0 + 5, w - 10, h - 10);   // the parapet
  if (D > 0.5) {
    if (!k) {   // the top deck: bays down both sides, cars, lamp posts
      for (const yy of [y0 + 28, y1 - 28]) for (let x = x0 + 30; x < x1 - 20; x += 30) {
        g.strokeStyle = 'rgba(230,236,255,0.3)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - 15, yy - 20); g.lineTo(x - 15, yy + 20); g.stroke();
        if (r() < 0.45) parked(g, x, yy, yy < (y0 + y1) / 2 ? -Math.PI / 2 : Math.PI / 2, CAR_COLS[Math.floor(r() * CAR_COLS.length)], r);
      }
      for (let x = x0 + 70; x < x1 - 30; x += 140) for (const yy of [y0 + 12, y1 - 12]) { g.fillStyle = 'rgba(255,214,140,0.16)'; circ(g, x, yy, 26); g.fill(); g.fillStyle = '#5a6383'; circ(g, x, yy, 3.5); g.fill(); }
    } else {    // an office roof: air conditioners, a stair hut
      for (let n = 0; n < w * h / 2200; n++) {
        const ax = x0 + 12 + r() * (w - 30), ay = y0 + 12 + r() * (h - 28); if (ay > y0 + h * 0.3 && ay < y0 + h * 0.7) continue;   // (the road runs across the middle)
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(ax + 2, ay + 3, 14, 10); g.fillStyle = '#4a5270'; g.fillRect(ax, ay, 14, 10); g.strokeStyle = '#2a2f44'; g.lineWidth = 1; circ(g, ax + 7, ay + 5, 3.2); g.stroke();
      }
      const sx = x1 - 60, sy = y0 + 16; g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(sx + 4, sy + 5, 36, 26); g.fillStyle = '#3d4462'; g.fillRect(sx, sy, 36, 26); g.fillStyle = 'rgba(255,208,130,0.65)'; g.fillRect(sx + 12, sy + 23, 12, 3);
    }
  }
  g.save(); g.shadowColor = k ? '#ff2bd6' : '#00e5ff'; g.shadowBlur = D > 0.5 ? 12 : 0; g.strokeStyle = alpha(k ? '#ff2bd6' : '#00e5ff', 0.85); g.lineWidth = 2; g.strokeRect(x0 + 1.5, y0 + 1.5, w - 3, h - 3); g.restore();
}
// the Gap (track.js gaps, over the road): the alley down at the street between the two roofs. Returns its outline
// (props keep off it)
export function neonGap(g, T, gp) {
  const L = plotsOf(T), a = trackSample(T, gp.s0), b = trackSample(T, gp.s1);
  const R0 = L.roofs.find(R => inRect(R, a.x - 8, a.y)), R1 = L.roofs.find(R => inRect(R, b.x + 8, b.y));
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(R0 ? R0.y0 : a.y - 180, R1 ? R1.y0 : a.y - 180), y1 = Math.max(R0 ? R0.y1 + R0.face : a.y + 180, R1 ? R1.y1 + R1.face : a.y + 180);
  const w = x1 - x0, h = y1 - y0, r = mulberry(Math.round(gp.s));
  g.save();
  g.fillStyle = linear(g, 0, y0, 0, y1, [[0, '#0b0e18'], [1, '#121626']]); g.fillRect(x0, y0, w, h);
  g.strokeStyle = 'rgba(120,140,200,0.07)'; g.lineWidth = 1; g.beginPath(); for (let y = y0 + 6; y < y1; y += 9) { g.moveTo(x0, y); g.lineTo(x1, y); } g.stroke();   // the cobbles, wet
  // a gutter down the middle, a puddle with a sign's glow in it, a lamp's pool, a dumpster against the wall
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0 + w * 0.55, y0); g.lineTo(x0 + w * 0.55, y1); g.stroke();
  const py = y0 + h * (0.25 + 0.2 * r()), sg = NEON[Math.floor(r() * NEON.length)];
  g.fillStyle = radial(g, x0 + w * 0.5, py, 0, x0 + w * 0.5, py, w * 0.6, [[0, alpha(sg, 0.35)], [1, alpha(sg, 0)]]); g.fillRect(x0, py - w, w, w * 2);
  g.fillStyle = 'rgba(30,40,80,0.6)'; ell(g, x0 + w * 0.5, py, w * 0.3, 9); g.fill();
  const ly = y0 + h * 0.72; g.fillStyle = radial(g, x0 + w * 0.3, ly, 0, x0 + w * 0.3, ly, w * 0.8, [[0, 'rgba(255,207,122,0.28)'], [1, 'rgba(255,207,122,0)']]); g.fillRect(x0, ly - w, w, w * 2);
  g.fillStyle = '#2c4a3c'; g.fillRect(x1 - 26, y0 + h * 0.58, 20, 30); g.fillStyle = '#365c4a'; g.fillRect(x1 - 26, y0 + h * 0.58, 20, 6);
  g.strokeStyle = '#3c4462'; g.lineWidth = 2;   // the fire escape down the left wall: landings and a zigzag of stairs
  for (let y = y0 + 20; y < y1 - 20; y += 46) { g.strokeRect(x0 + 3, y, 14, 22); g.beginPath(); g.moveTo(x0 + 4, y + 22); g.lineTo(x0 + 16, y + 46); g.stroke(); }
  // the near roof's shadow across the alley (light from the top left), deepest by its wall
  g.fillStyle = linear(g, x0, 0, x1, 0, [[0, 'rgba(0,0,0,0.6)'], [0.45, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(x0, y0, w, h);
  for (const [x, R] of [[x0, R0], [x1, R1]]) { if (!R) continue; g.fillStyle = '#4a5374'; g.fillRect(x - 3, R.y0, 6, R.y1 - R.y0); g.fillStyle = '#1a1e2e'; g.fillRect(x - 3, R.y1, 6, R.face); }   // the roofs' edges
  g.restore();
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

// the neon totems along the road's pavements: a post and a glowing panel along the road, glyph blocks on it
function totem(g, s, D) {
  g.save(); g.translate(s.x, s.y); g.rotate(s.a);
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(-22 + 4, -5 + 6, 44, 10);
  g.fillStyle = '#0c0f1a'; g.fillRect(-24, -6, 48, 12);
  g.shadowColor = s.c; g.shadowBlur = D > 0.5 ? 16 : 0; g.fillStyle = alpha(s.c, 0.95); g.fillRect(-21, -3.5, 42, 7); g.shadowBlur = 0;
  g.fillStyle = 'rgba(12,14,24,0.8)';
  if (s.k === 0) for (let k = 0; k < 5; k++) g.fillRect(-18 + k * 8, -2, 5, 4);
  else if (s.k === 1) { g.fillRect(-16, -2, 12, 4); g.fillRect(2, -2, 5, 4); g.fillRect(10, -2, 6, 4); }
  else if (s.k === 2) { poly(g, [[-14, 2.5], [-8, -2.5], [-2, 2.5]]); g.fill(); g.fillRect(4, -1, 12, 2); }
  else { circ(g, -10, 0, 2.5); g.fill(); circ(g, 0, 0, 2.5); g.fill(); circ(g, 10, 0, 2.5); g.fill(); }
  g.restore();
}
// the Spire: the tower inside the Spiral, an octagon stepping in toward its top, lit windows, a crown of light
function spire(g, S, D) {
  const { x, y, r } = S;
  g.fillStyle = 'rgba(0,0,0,0.45)'; circ(g, x + 8, y + 12, r * 1.05); g.fill();
  const oct = (k, dy) => { const p = []; for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * TAU; p.push([x + Math.cos(a) * r * k, y - dy + Math.sin(a) * r * k]); } return p; };
  for (const [k, dy, c] of [[1, 0, '#171c2e'], [0.82, 18, '#1f2540'], [0.62, 34, '#283056'], [0.4, 46, '#323b6a']]) {
    poly(g, oct(k, dy)); g.fillStyle = c; g.fill();
    if (D > 0.5) { g.save(); g.shadowColor = k > 0.5 ? '#00e5ff' : '#ff2bd6'; g.shadowBlur = 10; g.strokeStyle = k > 0.5 ? 'rgba(0,229,255,0.8)' : 'rgba(255,43,214,0.85)'; g.lineWidth = 2; poly(g, oct(k, dy)); g.stroke(); g.restore(); }
  }
  if (D > 0.5) for (let i = 0; i < 40; i++) { const a = i / 40 * TAU, k = 0.7 + (i % 3) * 0.08; g.fillStyle = i % 4 ? 'rgba(255,214,140,0.7)' : 'rgba(130,230,255,0.7)'; g.fillRect(x + Math.cos(a) * r * k - 1.5, y + Math.sin(a) * r * k - 1.5 - 9, 3, 3); }
  circ(g, x, y - 46, r * 0.14); g.fillStyle = '#ffffff'; g.fill();
}

// the scattered props, on the pavements and in the plazas (props.js drawProp, theme 'neon')
export function neonProp(g, d, shadowPass) {
  const { x, y, r, v } = d, c = NEON[Math.floor(v * 97) % NEON.length], t = Math.floor(v * 5);
  if (t === 0) {   // a vending machine glowing in the rain
    if (shadowPass) { g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x - r * 0.4 + 4, y - r * 0.3 + 5, r * 0.8, r * 0.6); return; }
    g.fillStyle = '#1a1f33'; g.fillRect(x - r * 0.4, y - r * 0.3, r * 0.8, r * 0.6);
    g.save(); g.shadowColor = c; g.shadowBlur = 12; g.fillStyle = alpha(c, 0.9); g.fillRect(x - r * 0.32, y + r * 0.12, r * 0.64, r * 0.1); g.restore();
    g.fillStyle = radial(g, x, y + r * 0.4, 0, x, y + r * 0.4, r, [[0, alpha(c, 0.25)], [1, alpha(c, 0)]]); g.fillRect(x - r, y - r * 0.6, r * 2, r * 2);
  } else if (t === 1) {   // a cyber-palm in a planter: a glowing trunk ring, dark fronds
    if (shadowPass) { g.fillStyle = 'rgba(0,0,0,0.35)'; ell(g, x + 6, y + 8, r * 0.9, r * 0.6); g.fill(); return; }
    circ(g, x, y, r * 0.35); g.fillStyle = '#2a3048'; g.fill();
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + v * 3; g.fillStyle = k % 2 ? '#1e4a44' : '#286058'; ell(g, x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.5, r * 0.16, a); g.fill(); }
    g.save(); g.shadowColor = c; g.shadowBlur = 10; g.strokeStyle = c; g.lineWidth = 2; circ(g, x, y, r * 0.18); g.stroke(); g.restore();
  } else if (t === 2) {   // a noodle stand: an awning, a red paper lantern
    if (shadowPass) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x - r * 0.6 + 5, y - r * 0.4 + 6, r * 1.2, r * 0.8); return; }
    for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#e8e2d6' : '#c8323c'; g.fillRect(x - r * 0.6 + k * r * 0.2, y - r * 0.4, r * 0.2, r * 0.8); }
    g.fillStyle = radial(g, x + r * 0.5, y, 0, x + r * 0.5, y, r * 0.9, [[0, 'rgba(255,90,60,0.35)'], [1, 'rgba(255,90,60,0)']]); g.fillRect(x - r * 0.4, y - r, r * 1.8, r * 2);
    circ(g, x + r * 0.62, y, r * 0.16); g.fillStyle = '#ff5a3c'; g.fill();
  } else if (t === 3) {   // a parked hover-scooter
    if (shadowPass) { g.fillStyle = 'rgba(0,0,0,0.3)'; ell(g, x + 4, y + 6, r * 0.6, r * 0.3, v * 3); g.fill(); return; }
    g.save(); g.translate(x, y); g.rotate(v * 6);
    g.fillStyle = '#2b3150'; g.beginPath(); g.roundRect(-r * 0.55, -r * 0.2, r * 1.1, r * 0.4, r * 0.18); g.fill();
    g.save(); g.shadowColor = c; g.shadowBlur = 8; g.fillStyle = c; g.fillRect(-r * 0.5, -r * 0.24, r, 2); g.fillRect(-r * 0.5, r * 0.22, r, 2); g.restore();
    g.restore();
  } else {   // a holo pylon: a dark post with a glowing ring
    if (shadowPass) { circ(g, x, y, r * 1.2); g.fillStyle = radial(g, x, y, 1, x, y, r * 1.2, [[0, alpha(c, 0.3)], [1, alpha(c, 0)]]); g.fill(); return; }
    circ(g, x, y, r * 0.4); g.fillStyle = '#0b0e1a'; g.fill(); g.save(); g.strokeStyle = c; g.lineWidth = 3; g.shadowColor = c; g.shadowBlur = 12; circ(g, x, y, r * 0.4); g.stroke(); g.restore();
    circ(g, x, y, r * 0.13); g.fillStyle = '#ffffff'; g.fill();
  }
}
// the plazas (props.js drawLandmark): paving round a hologram projector (the hologram is live), benches, trees; the
// second a night market
export function neonLandmark(g, c, i) {
  const { x, y } = c, r = Math.min(c.r, 200), rng = mulberry(Math.floor(c.v * 1e6) + 3);
  circ(g, x, y, r); g.fillStyle = '#242a40'; g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1.5; for (let k = 20; k < r; k += 22) { circ(g, x, y, k); g.stroke(); }
  g.strokeStyle = '#3e4766'; g.lineWidth = 3; circ(g, x, y, r); g.stroke();
  if (i % 2 === 0) {
    const R = Math.min(70, r * 0.4);
    circ(g, x, y, R); g.fillStyle = '#151a2a'; g.fill();
    g.save(); g.shadowColor = '#00e5ff'; g.shadowBlur = 18; g.strokeStyle = '#00e5ff'; g.lineWidth = 4; circ(g, x, y, R); g.stroke(); g.strokeStyle = '#ff2bd6'; g.shadowColor = '#ff2bd6'; g.lineWidth = 2; circ(g, x, y, R * 0.75); g.stroke(); g.restore();
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; circ(g, x + Math.cos(a) * R * 0.88, y + Math.sin(a) * R * 0.88, 3); g.fillStyle = '#e6fbff'; g.fill(); }
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.3, d = r * 0.78; g.fillStyle = 'rgba(0,0,0,0.35)'; circ(g, x + Math.cos(a) * d + 5, y + Math.sin(a) * d + 7, 14); g.fill(); circ(g, x + Math.cos(a) * d, y + Math.sin(a) * d, 13); g.fillStyle = k % 2 ? '#24584e' : '#2f6d5f'; g.fill(); }
  } else {
    for (let k = 0; k < 7; k++) {   // stalls under striped awnings
      const a = k / 7 * TAU + rng(), d = r * (0.35 + rng() * 0.4), sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d, col = NEON[k % NEON.length];
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(sx - 18 + 4, sy - 12 + 6, 36, 24);
      for (let j = 0; j < 4; j++) { g.fillStyle = j % 2 ? '#e9e4da' : shade(col, -0.25); g.fillRect(sx - 18 + j * 9, sy - 12, 9, 24); }
      g.fillStyle = radial(g, sx, sy + 16, 0, sx, sy + 16, 40, [[0, alpha(col, 0.22)], [1, alpha(col, 0)]]); g.fillRect(sx - 40, sy - 24, 80, 80);
    }
    g.strokeStyle = 'rgba(40,30,30,0.7)'; g.lineWidth = 1;   // strings of lanterns across it
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI; g.beginPath(); g.moveTo(x - Math.cos(a) * r * 0.9, y - Math.sin(a) * r * 0.9); g.quadraticCurveTo(x, y + 10, x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9); g.stroke(); for (let j = 1; j < 8; j++) { const u = j / 8, lx = x - Math.cos(a) * r * 0.9 * (1 - 2 * u), ly = y - Math.sin(a) * r * 0.9 * (1 - 2 * u) + 10 * 4 * u * (1 - u); circ(g, lx, ly, 3.2); g.fillStyle = j % 2 ? '#ff5a3c' : '#ffcf5a'; g.fill(); } }
  }
}

// ---------------------------------------------------------------- the Spiral and the Skyway, up off the ground
// (drawTrack, before the road): the road's shadow cast down-right by its height, a face under each down-screen edge
// (thicker the higher), pillars
const SH_K = 0.5, FACE_K = 0.32, FACE_MAX = 26, DECK = 16;   // shadow offset and face depth per unit of height; the deck's edge past the tarmac (the verge)
export function neonSlab(g, T, D) {
  const E = T.mech && T.mech.elev; if (!E) return;
  const R = T, up = i => Math.max(0, upAt(R, i));
  const sh = new Path2D(), pil = [];
  for (let i = 0; i + 3 < R.N; i += 3) {
    const ha = up(i), hb = up(i + 3); if (ha < 2 && hb < 2) continue;
    const a = R.pts[i], b = R.pts[i + 3], ta = R.tan[i], tb = R.tan[i + 3], wa = R.hw[i] + DECK, wb = R.hw[i + 3] + DECK;
    if (onRoof(T, a[0], a[1]) || onRoof(T, b[0], b[1]) || inGap(T, i)) continue;   // (on a roof the road lies on it: the building is drawn in neonGround)
    const oa = ha * SH_K, ob = hb * SH_K;
    sh.moveTo(a[0] - ta[1] * wa + oa * 0.6, a[1] + ta[0] * wa + oa); sh.lineTo(b[0] - tb[1] * wb + ob * 0.6, b[1] + tb[0] * wb + ob); sh.lineTo(b[0] + tb[1] * wb + ob * 0.6, b[1] - tb[0] * wb + ob); sh.lineTo(a[0] + ta[1] * wa + oa * 0.6, a[1] - ta[0] * wa + oa); sh.closePath();
    if (i % 60 === 0 && ha > 16) for (const sd of [-1, 1]) { const o = sd * R.hw[i] * 0.55; pil.push([a[0] - ta[1] * o, a[1] + ta[0] * o, ha]); }
  }
  g.fillStyle = 'rgba(2,3,10,0.6)'; g.fill(sh);
  // the pillars: from the street (straight down the screen from the deck, by its height) up to the deck's underside
  for (const [x, y, h] of pil) { const f = Math.min(FACE_MAX, h * FACE_K), y0 = y + f, y1 = y + h * 0.9; if (y1 <= y0 + 2) continue; g.fillStyle = linear(g, x - 7, 0, x + 7, 0, [[0, '#4a5272'], [1, '#262b40']]); g.fillRect(x - 7, y0, 14, y1 - y0); g.fillStyle = 'rgba(0,0,0,0.4)'; ell(g, x + 4, y1 + 2, 12, 5); g.fill(); }
}
// the deck's face under each down-screen edge (thicker the higher), drawn after the road from the verge out so the
// tarmac never covers it
function slabFaces(g, T, D) {
  const E = T.mech && T.mech.elev; if (!E) return;
  const R = T, up = i => Math.max(0, upAt(R, i)), faces = new Map(), glow = new Path2D(), seams = new Path2D();
  for (let i = 0; i + 3 < R.N; i += 3) {
    const ha = up(i), hb = up(i + 3); if (ha < 3 && hb < 3) continue;
    const a = R.pts[i], b = R.pts[i + 3], ta = R.tan[i], tb = R.tan[i + 3], wa = R.hw[i] + DECK, wb = R.hw[i + 3] + DECK;
    if (onRoof(T, a[0], a[1]) || onRoof(T, b[0], b[1]) || inGap(T, i) || inGap(T, i + 3)) continue;
    for (const sd of [-1, 1]) {
      const nx = -ta[1] * sd, ny = ta[0] * sd; if (ny < 0.1) continue;
      const fa = Math.min(FACE_MAX, 3 + ha * FACE_K) * ny, fb = Math.min(FACE_MAX, 3 + hb * FACE_K) * ny;
      const ax = a[0] + nx * wa, ay = a[1] + ny * wa, bx = b[0] - tb[1] * sd * wb, by = b[1] + tb[0] * sd * wb;
      const lit = Math.round((nx * -0.7 + 0.3) * 4); let P = faces.get(lit); if (!P) faces.set(lit, P = new Path2D());
      P.moveTo(ax, ay); P.lineTo(bx, by); P.lineTo(bx, by + fb); P.lineTo(ax, ay + fa); P.closePath();
      glow.moveTo(ax, ay + fa - 2); glow.lineTo(bx, by + fb - 2);
      if (i % 24 === 0) { seams.moveTo(ax, ay); seams.lineTo(ax, ay + fa); }
    }
  }
  for (const [k, P] of faces) { const v = 0.85 + 0.08 * k; g.fillStyle = `rgb(${Math.round(70 * v)},${Math.round(78 * v)},${Math.round(104 * v)})`; g.fill(P); }
  g.strokeStyle = 'rgba(10,12,22,0.5)'; g.lineWidth = 1.5; g.stroke(seams);
  g.save(); g.strokeStyle = 'rgba(0,229,255,0.9)'; g.shadowColor = '#00e5ff'; g.shadowBlur = D > 0.5 ? 12 : 0; g.lineWidth = 2.5; g.stroke(glow); g.restore();
}

// ---------------------------------------------------------------- on the road (draw-mechanics.js, static)
// chevrons, crosswalks, drains in the dips, the Skyway's rails
export function neonStatic(g, T) {
  const M = T.mech, E = M.elev, R = T;
  slabFaces(g, T, 1);
  // the deck itself: concrete a touch lighter and bluer than the street's tarmac, expansion joints across it
  const deck = new Path2D(), joints = new Path2D();
  for (const [i0, i1] of runsOf(R, i => upAt(R, i) > 6 && !inGap(T, ((i % R.N) + R.N) % R.N))) {
    ribbon(R, i => R.hw[i], i => -R.hw[i], 2, i0, i1, deck);
    for (let i = i0 + 20; i < i1 - 10; i += 36) { const j = ((i % R.N) + R.N) % R.N, q = R.pts[j], t = R.tan[j], hw = R.hw[j]; joints.moveTo(q[0] + t[1] * hw, q[1] - t[0] * hw); joints.lineTo(q[0] - t[1] * hw, q[1] + t[0] * hw); }
  }
  g.fillStyle = 'rgba(120,140,230,0.07)'; g.fill(deck);
  g.strokeStyle = 'rgba(8,10,20,0.55)'; g.lineWidth = 3; g.stroke(joints); g.save(); g.translate(-1.5, -1.5); g.strokeStyle = 'rgba(200,210,255,0.12)'; g.lineWidth = 1; g.stroke(joints); g.restore();
  // the Skyway's and the Spiral's parapets: a low wall along the deck's outer edge with a strip of light on it
  if (E) for (const sd of [-1, 1]) {
    const p = new Path2D(); let on = false;
    for (let i = 0; i < R.N; i += 2) {
      const hi = E.h[i] - GROUND > 10 && !inGap(T, i) && !onRoof(T, R.pts[i][0], R.pts[i][1]), q = R.pts[i], t = R.tan[i], o = sd * (R.hw[i] + DECK - 3), x = q[0] - t[1] * o, y = q[1] + t[0] * o;
      if (!hi) { on = false; continue; } on ? p.lineTo(x, y) : p.moveTo(x, y); on = true;
    }
    g.strokeStyle = '#6a7396'; g.lineWidth = 7; g.stroke(p); g.strokeStyle = '#2a3048'; g.lineWidth = 2.5; g.stroke(p);
    g.save(); g.strokeStyle = 'rgba(255,43,214,0.9)'; g.shadowColor = '#ff2bd6'; g.shadowBlur = 10; g.lineWidth = 1.5; g.stroke(p); g.restore();
  }
  // the car park's levels painted on its ramps (P2, P3, ... as the Corkscrew climbs past each floor), ROOF on its top deck
  const Lp = plotsOf(T);
  if (Lp.garage && E) {
    let lvl = 1;
    const paint = (i, text) => { const q = R.pts[i], t = R.tan[i]; g.save(); g.translate(q[0], q[1]); g.rotate(Math.atan2(t[1], t[0]) + Math.PI / 2); g.fillStyle = 'rgba(235,240,255,0.32)'; g.font = '900 30px ui-sans-serif, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 0, 0); g.restore(); };
    for (let i = 1; i < R.N; i++) {
      const q = R.pts[i]; if (!inRect(Lp.garage, q[0], q[1])) continue;
      const k = Math.floor((E.h[i] - GROUND + 6) / 18) + 1; if (k > lvl) { lvl = k; paint(i, 'P' + k); }
    }
    for (const Rf of Lp.roofs.slice(0, 1)) { let bi = -1; for (let i = 0; i < R.N; i++) if (onRoof(T, R.pts[i][0], R.pts[i][1]) && (bi < 0 || R.pts[i][0] < R.pts[bi][0])) bi = i; if (bi >= 0) paint((bi + 40) % R.N, 'ROOF'); }
  }
  // chevrons before the two hairpins (the tightest corners after the fastest stretches)
  for (let i = 0; i < R.N; i += 4) {
    const k = Math.abs(R.curv[i]); if (k < 1 / 140) continue;
    if (Math.abs(R.curv[(i - 70 + R.N) % R.N]) > 1 / 400) continue;   // only where a straight runs into it
    for (let j = 1; j <= 3; j++) {
      const q = trackSample(R, i * STEP - 70 - j * 46), a = Math.atan2(q.ty, q.tx);
      g.save(); g.translate(q.x, q.y); g.rotate(a); g.strokeStyle = 'rgba(255,225,77,0.55)'; g.lineWidth = 6; g.lineCap = 'butt';
      g.beginPath(); g.moveTo(-10, -q.hw * 0.6); g.lineTo(6, 0); g.lineTo(-10, q.hw * 0.6); g.stroke(); g.restore();
    }
    i += 120;
  }
  // the drains in the dips: grates across the road at each puddle's low point
  for (const P of M.rain.puddles) {
    const q = trackSample(R, P.s), a = Math.atan2(q.ty, q.tx);
    for (const sd of [-1, 1]) {
      g.save(); g.translate(q.x + q.nx * sd * (q.hw - 12), q.y + q.ny * sd * (q.hw - 12)); g.rotate(a);
      g.fillStyle = '#14182a'; g.fillRect(-16, -7, 32, 14); g.strokeStyle = '#5a6383'; g.lineWidth = 1.5; for (let k = -12; k <= 12; k += 4) { g.beginPath(); g.moveTo(k, -6); g.lineTo(k, 6); g.stroke(); } g.restore();
    }
  }
}

// ---------------------------------------------------------------- the wet road (render.js, right after the baked layer)
// the visible stretch of road, sampled every 16, cached per track
const roadSamples = new WeakMap();
function samplesOf(T) {
  if (roadSamples.has(T)) return roadSamples.get(T);
  const S = []; for (let s = 0; s < T.L; s += 16) S.push(trackSample(T, s));
  roadSamples.set(T, S); return S;
}
let VIEW = { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 };
function viewOf(ctx) {
  if (!ctx.getTransform || !ctx.canvas) return VIEW;
  const m = ctx.getTransform().inverse(), w = ctx.canvas.width, h = ctx.canvas.height, xs = [], ys = [];
  for (const [px, py] of [[0, 0], [w, 0], [0, h], [w, h]]) { xs.push(m.a * px + m.c * py + m.e); ys.push(m.b * px + m.d * py + m.f); }
  return (VIEW = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
}
const inView = (x, y, m) => x > VIEW.x0 - m && x < VIEW.x1 + m && y > VIEW.y0 - m && y < VIEW.y1 + m;
// a soft glow, made once per colour (drawn stretched for the reflections)
const glows = new Map();
function glowSprite(c) {
  if (glows.has(c)) return glows.get(c);
  const n = 64, cv = makeCanvas(n, n), x = cv.getContext('2d');
  x.fillStyle = radial(x, n / 2, n / 2, 0, n / 2, n / 2, n / 2, [[0, alpha(c, 1)], [0.35, alpha(c, 0.45)], [1, alpha(c, 0)]]); x.fillRect(0, 0, n, n);
  glows.set(c, cv); return cv;
}
export function wetRoad(ctx, race) {
  const T = race.track, R = T.mech.rain; if (!R) return;
  const t = race.time, w = wetAt(race, t); if (w < 0.02) return;
  viewOf(ctx);
  const S = samplesOf(T), P = cityOf(T), n = S.length;
  // the visible runs of road
  const runs = []; let cur = null;
  for (let i = 0; i <= n; i++) { const q = S[i % n]; if (inView(q.x, q.y, 160) && !inGap(T, (i % n) * 16 / STEP)) { if (!cur) runs.push(cur = []); cur.push(i % n); } else cur = null; }   // (none over the Gap)
  if (!runs.length) return;
  ctx.save();
  // wet tarmac: darker, and a cold sheen of the sky down it
  const road = new Path2D();
  for (const run of runs) { if (run.length < 2) continue; for (let k = 0; k < run.length; k++) { const q = S[run[k]]; k ? road.lineTo(q.x + q.nx * q.hw, q.y + q.ny * q.hw) : road.moveTo(q.x + q.nx * q.hw, q.y + q.ny * q.hw); } for (let k = run.length - 1; k >= 0; k--) { const q = S[run[k]]; road.lineTo(q.x - q.nx * q.hw, q.y - q.ny * q.hw); } road.closePath(); }
  ctx.fillStyle = `rgba(6,10,26,${0.32 * w})`; ctx.fill(road);
  ctx.clip(road);
  // the signs' colours smeared across the wet road, shimmering with the rain
  ctx.globalCompositeOperation = 'lighter';
  for (const s of P.signs) {
    if (!inView(s.rx, s.ry, 140)) continue;
    const fl = 0.75 + 0.25 * Math.sin(t * (3 + s.v * 5) + s.v * 20) * (hash(Math.floor(t * 9), s.v) < 0.06 ? 0 : 1);
    ctx.globalAlpha = 0.85 * w * fl; ctx.save(); ctx.translate(s.rx, s.ry); ctx.rotate(s.a + Math.PI / 2 + Math.sin(t * 0.7 + s.v * 9) * 0.05); ctx.drawImage(glowSprite(s.c), -34, -120, 68, 240); ctx.drawImage(glowSprite(s.c), -10, -60, 20, 120); ctx.restore();
  }
  ctx.globalAlpha = 0.09 * w; ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 14; ctx.lineJoin = 'round'; ctx.beginPath();   // the kerbs' neon mirrored just inside them
  for (const run of runs) for (const sd of [-1, 1]) run.forEach((i, k) => { const q = S[i], o = sd * (q.hw - 14); k ? ctx.lineTo(q.x + q.nx * o, q.y + q.ny * o) : ctx.moveTo(q.x + q.nx * o, q.y + q.ny * o); });
  ctx.stroke();
  ctx.globalAlpha = 0.2 * w; ctx.strokeStyle = '#c8d8ff'; ctx.lineWidth = 3; ctx.beginPath();   // long thin glints along the road
  for (const run of runs) for (let k = 0; k < run.length; k += 3) { const i = run[k], q = S[i]; if (hash(i, 3) > 0.35) continue; const o = (hash(i, 4) * 2 - 1) * q.hw * 0.85, l = 20 + hash(i, 5) * 60; ctx.moveTo(q.x + q.nx * o, q.y + q.ny * o); ctx.lineTo(q.x + q.nx * o + q.tx * l, q.y + q.ny * o + q.ty * l); }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  // the dry line: matte and darker where the tyres have pushed the water off (no reflections there)
  const Q = race.dryQ;
  if (Q) {
    const paths = Array.from({ length: 6 }, () => new Path2D()), sub = 4;   // 6 shades, each one path
    for (const run of runs) for (let k = 0; k + 1 < run.length; k++) {
      const i = run[k], q = S[i], q2 = S[(i + 1) % n], s = i * 16, c = Math.min(Math.floor(wrapS(T, s) / BIN), R.nb - 1), c2 = Math.min(Math.floor(wrapS(T, s + 16) / BIN), R.nb - 1);
      const lw = 2 * q.hw / LANES;
      for (let j = 0; j < LANES; j++) {
        const a = (Q.charCodeAt(c * LANES + j) - 48) / (LEVELS - 1), b = (Q.charCodeAt(c2 * LANES + j) - 48) / (LEVELS - 1), f = (s % BIN) / BIN, d = a + (b - a) * f;
        if (d < 0.08) continue;
        const o = -q.hw + (j + 0.5) * lw, o2 = -q2.hw + (j + 0.5) * (2 * q2.hw / LANES), p = paths[Math.min(5, Math.floor(d * 6))];
        p.moveTo(q.x + q.nx * o, q.y + q.ny * o); p.lineTo(q2.x + q2.nx * o2, q2.y + q2.ny * o2);
      }
    }
    ctx.lineCap = 'butt';
    paths.forEach((p, k) => { ctx.strokeStyle = `rgba(4,6,14,${(0.12 + 0.1 * k) * DRY_MAX * Math.min(1, w * 1.6)})`; ctx.lineWidth = 2 * T.halfW / LANES + 1; ctx.stroke(p); });
    ctx.lineCap = 'round';
  }
  ctx.restore();
  drawPuddles(ctx, race, R, t, w);
}

// ---------------------------------------------------------------- the puddles (wetRoad; their wakes in neonUnder)
// A puddle covers exactly where you can aquaplane (race-rain.js: s0..s1, kerb to kerb): a film over all of it and a
// deep pool round the dip's low point that grows with wetness (puddleDepth), so its fill reads at a glance. Each depth
// step is baked once into two sprites (water, mirror); live: the mirror wobbling, drop rings, wakes.
const PUD_RES = 1.25, PUD_STEPS = 20, PUD_SOFT = 14;   // sprite pixels per unit; depth steps baked; the edges' softness (units each way)
const pudGeos = new WeakMap();
function puddleGeo(T, k) {
  let L = pudGeos.get(T); if (!L) pudGeos.set(T, L = []);
  if (L[k]) return L[k];
  const Pd = T.mech.rain.puddles[k], ha = Pd.s - Pd.s0, hb = Pd.s1 - Pd.s, du = 6, u0 = -ha - 60, S = [];
  for (let u = u0; u <= hb + 60; u += du) S.push(trackSample(T, Pd.s + u));
  // a point u along the road from the low point, f across it (a share of the half-width, + as q.nx)
  const at = (u, f) => {
    const x = clamp((u - u0) / du, 0, S.length - 1.001), i = Math.floor(x), e = x - i, a = S[i], b = S[i + 1], o = (a.hw + (b.hw - a.hw) * e) * f;
    return [a.x + (b.x - a.x) * e + (a.nx + (b.nx - a.nx) * e) * o, a.y + (b.y - a.y) * e + (a.ny + (b.ny - a.ny) * e) * o];
  };
  const sA = k * 2.1 + 0.4, sB = k * 1.3 + 2.2;
  const end = (f, sd, seed, inset) => sd * ((sd > 0 ? hb : ha) + 8 * Math.sin(f * 3.1 + seed) + 4 * Math.sin(f * 6.7 + 2 * seed) + 16 * f ** 4 - inset);   // uneven, and further along the gutters
  // the film: kerb to kerb, its ends `inset` in from the hazard's (negative: out)
  const film = inset => {
    const p = [], side = 0.995 - Math.max(0, inset) * 0.003, n = 28, uA = f => end(f, -1, sA, inset), uB = f => end(f, 1, sB, inset);
    for (let u = uA(side); u < uB(side); u += du) p.push(at(u, side));
    for (let j = 0; j <= n; j++) { const f = side - 2 * side * j / n; p.push(at(uB(f), f)); }
    for (let u = uB(-side); u > uA(-side); u -= du) p.push(at(u, -side));
    for (let j = 0; j <= n; j++) { const f = -side + 2 * side * j / n; p.push(at(uA(f), f)); }
    return p;
  };
  // the deep pool round the low point: a rounded blob along the road, bigger the deeper; sc scales it (the soft edge)
  const poolDims = dep => ({ cu: (hb - ha) / 2, Lu: (ha + hb) / 2 * (0.3 + 0.58 * dep), Lf: 0.32 + 0.56 * dep, e: 2 / (2.4 + 1.8 * dep) });
  const pool = (dep, sc) => {
    const p = [], D = poolDims(dep);
    for (let j = 0; j < 48; j++) {
      const th = j / 48 * TAU, c = Math.cos(th), s = Math.sin(th), wob = sc * (1 + 0.08 * Math.sin(3 * th + sA) + 0.05 * Math.sin(5 * th + sB));
      p.push(at(D.cu + D.Lu * Math.sign(c) * Math.abs(c) ** D.e * wob, clamp(D.Lf * Math.sign(s) * Math.abs(s) ** D.e * wob, -0.97, 0.97)));
    }
    return p;
  };
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of film(-PUD_SOFT - 4)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const toPath = pts => { const P = new Path2D(); pts.forEach(([x, y], i) => i ? P.lineTo(x, y) : P.moveTo(x, y)); P.closePath(); return P; };
  return (L[k] = { Pd, k, ha, hb, at, film, pool, poolDims, toPath, x0: x0 - 4, y0: y0 - 4, w: x1 - x0 + 8, h: y1 - y0 + 8, edge: toPath(film(-PUD_SOFT)), lv: -1 });
}
// bake the water and its mirror for depth step lv
function bakePuddle(G, T, lv) {
  const dep = lv / PUD_STEPS, W = Math.ceil(G.w * PUD_RES), H = Math.ceil(G.h * PUD_RES);
  const mk = () => { const c = G.lv < 0 || !G.spare ? makeCanvas(W, H) : G.spare.pop(), g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, W, H); g.setTransform(PUD_RES, 0, 0, PUD_RES, -G.x0 * PUD_RES, -G.y0 * PUD_RES); return [c, g]; };
  if (G.lv >= 0) G.spare = [G.body, G.refl, G.tmp, G.mask];   // (reuse the last step's canvases)
  const N = 8, filmL = [], poolL = [];
  for (let i = 0; i < N; i++) { filmL.push(G.toPath(G.film(-PUD_SOFT + 2 * PUD_SOFT * i / (N - 1)))); poolL.push(G.toPath(G.pool(dep, 1.16 - 0.32 * i / (N - 1)))); }
  const soft = (g, list, a) => { g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(255,255,255,${a / list.length})`; for (const p of list) g.fill(p); g.globalCompositeOperation = 'source-over'; };   // stacked fills: a soft edge
  const tint = (g, col) => { g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(G.x0, G.y0, G.w, G.h); g.globalCompositeOperation = 'source-over'; };
  const put = (g, c, op) => { g.globalCompositeOperation = op; g.drawImage(c, G.x0, G.y0, W / PUD_RES, H / PUD_RES); g.globalCompositeOperation = 'source-over'; };
  // the water: the film, the deep pool darker over it, a cold sky tint across both
  const [body, b] = mk(), [tmp, tg] = mk();
  soft(b, filmL, 1); tint(b, `rgba(6,9,26,${0.58 + 0.16 * dep})`);
  soft(tg, poolL, 1); tint(tg, `rgba(5,8,28,${0.7 + 0.2 * dep})`); put(b, tmp, 'source-over');
  b.globalCompositeOperation = 'source-atop';
  b.fillStyle = linear(b, G.x0, G.y0, G.x0 + G.w, G.y0 + G.h, [[0, 'rgba(70,105,210,0.3)'], [0.5, 'rgba(36,48,130,0.16)'], [1, 'rgba(150,60,190,0.24)']]); b.fillRect(G.x0, G.y0, G.w, G.h);
  b.strokeStyle = 'rgba(150,185,255,0.14)'; b.lineWidth = 5; b.lineJoin = 'round'; b.stroke(G.toPath(G.film(PUD_SOFT * 0.35)));   // a faint sheen where the water meets the road
  b.globalCompositeOperation = 'source-over';
  // the mirror: the signs beside the puddle as columns of broken dashes across it, from their side of the road
  const [refl, r] = mk(), P = cityOf(T), Pd = G.Pd;
  const near = P.signs.map(sg => { let d = sg.s - Pd.s; if (!T.open) d = ((d % T.L) + T.L * 1.5) % T.L - T.L / 2; return { sg, d }; }).filter(o => o.d > -G.ha - 120 && o.d < G.hb + 120);
  const cols = near.map(({ sg, d }) => ({ u: clamp(d, -G.ha * 0.7, G.hb * 0.7), sd: sg.sd, c: sg.c, v: sg.v }));
  for (let i = 0; cols.length < 3; i++) cols.push({ u: (hash(i, G.k + 5) * 2 - 1) * G.ha * 0.6, sd: i % 2 ? 1 : -1, c: NEON[(G.k * 3 + i * 2) % NEON.length], v: hash(i, G.k) });
  r.lineCap = 'round';
  for (const o of cols) {
    const [sx, sy] = G.at(o.u, o.sd * 0.95), [ex, ey] = G.at(o.u, -o.sd * 0.5), ang = Math.atan2(ey - sy, ex - sx), len = Math.hypot(ex - sx, ey - sy);
    r.save(); r.translate(sx, sy); r.rotate(ang); r.globalAlpha = 0.55; r.drawImage(glowSprite(o.c), -len * 0.15, -16, len * 1.15, 32); r.restore();   // its light, smeared toward us
    for (let j = 0; j < 4; j++) {   // and a few broken bright dashes in it
      const f = o.sd * (0.82 - j * 0.24), lh = (13 - j * 2.5) * (0.7 + 0.5 * hash(j, o.v * 9)), u = o.u + (hash(j + 3, o.v * 9) - 0.5) * 8;
      const [ax, ay] = G.at(u - lh, f), [bx, by] = G.at(u + lh, f);
      r.strokeStyle = alpha(o.c, 0.75 - j * 0.15); r.lineWidth = 2.4 - j * 0.3; r.beginPath(); r.moveTo(ax, ay); r.lineTo(bx, by); r.stroke();
    }
  }
  // a glossy highlight along the deep pool's upper-left edge (the city's light from the top left, like everything else)
  const hl = G.pool(dep, 0.8), cx = hl.reduce((s, p) => s + p[0], 0) / hl.length, cy = hl.reduce((s, p) => s + p[1], 0) / hl.length;
  let best = 0, bd = -2; hl.forEach(([x, y], i) => { const l = Math.hypot(x - cx, y - cy) || 1, d = -(x - cx + y - cy) / (l * Math.SQRT2); if (d > bd) { bd = d; best = i; } });
  {   // a cartoon shine: a short stroke along the edge and a dot after it
    const [bx, by] = hl[best], [px, py] = hl[(best + 47) % 48], [nx, ny] = hl[(best + 1) % 48], x = cx + (bx - cx) * 0.72, y = cy + (by - cy) * 0.72, l = Math.hypot(nx - px, ny - py) || 1, tx = (nx - px) / l, ty = (ny - py) / l;
    r.strokeStyle = 'rgba(235,245,255,0.6)'; r.lineWidth = 4; r.beginPath(); r.moveTo(x - tx * 11, y - ty * 11); r.lineTo(x + tx * 9, y + ty * 9); r.stroke();
    r.fillStyle = 'rgba(235,245,255,0.55)'; r.beginPath(); r.arc(x + tx * 19, y + ty * 19, 2.2, 0, TAU); r.fill();
  }
  // the mirror only shows in the water: faint in the film, clear in the deep pool
  const [mask, m] = mk(); soft(m, filmL, 0.4); soft(m, poolL, 1); put(r, mask, 'destination-in');
  Object.assign(G, { lv, body, refl, tmp, mask, bw: W / PUD_RES, bh: H / PUD_RES, dims: G.poolDims(dep) });
}
function drawPuddles(ctx, race, R, t, w) {
  const dep = puddleDepth(w); if (dep <= 0) return;
  const T = race.track, rain = rainAt(race.rainT, t), lv = Math.max(1, Math.round(dep * PUD_STEPS));
  R.puddles.forEach((Pd, k) => {
    const G = puddleGeo(T, k); if (!inView(G.x0 + G.w / 2, G.y0 + G.h / 2, Math.max(G.w, G.h) / 2 + 20)) return;
    if (G.lv !== lv) bakePuddle(G, T, lv);
    ctx.save(); ctx.globalAlpha = clamp(0.4 + dep * 6, 0, 1);   // (the first film of water fades in)
    ctx.drawImage(G.body, G.x0, G.y0, G.bw, G.bh);
    // the mirror, in thin slices that sway a little: the rain stirring the water
    ctx.globalCompositeOperation = 'lighter';
    const sl = 6, amp = 0.5 + 1.5 * rain;
    for (let y = 0; y < G.bh; y += sl) {
      const sy = y * PUD_RES, sh = Math.min(sl * PUD_RES, G.refl.height - sy); if (sh <= 0) break;
      const dx = Math.sin(t * 2.1 + (G.y0 + y) * 0.11) * amp + Math.sin(t * 3.4 - (G.y0 + y) * 0.27) * amp * 0.4;
      ctx.drawImage(G.refl, 0, sy, G.refl.width, sh, G.x0 + dx, G.y0 + y, G.bw, sh / PUD_RES);
    }
    ctx.globalCompositeOperation = 'source-over';
    // raindrops: a handful of small rings spreading and fading, mostly on the deep water
    if (rain > 0.05) {
      const D = G.dims; ctx.lineWidth = 1.1;
      for (let j = 0; j < 7; j++) {
        const u = t * 0.95 + hash(j, 11 + k), pass = Math.floor(u), f = u - pass; if (hash(j, pass + 0.2) > rain * 1.15) continue;
        const [x, y] = G.at(D.cu + (hash(j, pass + 0.4) * 2 - 1) * D.Lu * 0.85, (hash(j, pass + 0.7) * 2 - 1) * Math.min(0.85, D.Lf + 0.15) * 0.85);
        const a = 0.42 * (1 - f) ** 1.6, rr = 1.5 + f * 13;
        ctx.strokeStyle = `rgba(210,228,255,${a})`; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); if (f > 0.2) { ctx.moveTo(x + rr * 0.5, y); ctx.arc(x, y, rr * 0.5, 0, TAU); } ctx.stroke();
      }
    }
    ctx.restore();
  });
}
// a kart through a puddle: a wake of rings behind it (positions kept here: drawing only), nose foam and side sheets,
// more the faster (and far more aquaplaning)
const wakes = new WeakMap(), WAKE_T = 0.7;
function puddleWakes(ctx, race, t, dep) {
  const T = race.track, R = T.mech.rain, on = [];
  for (const c of race.cars) {
    const k = dep > 0 && c.air <= 0 && c.speed > 40 && Math.abs(c.lat) < T.halfW + 4 ? R.puddles.findIndex(P => c.s > P.s0 - 4 && c.s < P.s1 + 4) : -1;
    let Wk = wakes.get(c);
    if (k >= 0) {
      if (!Wk) wakes.set(c, Wk = { pts: [], at: -9 });
      if (t - Wk.at > 0.06 || t < Wk.at) { Wk.at = t; Wk.pts.push({ x: c.x - Math.cos(c.heading) * c.L * 0.3, y: c.y - Math.sin(c.heading) * c.L * 0.3, t, v: c.speed, k, W: c.W }); if (Wk.pts.length > 14) Wk.pts.shift(); }
      if (inView(c.x, c.y, 100)) on.push(c);
    }
    if (Wk) Wk.pts = Wk.pts.filter(p => t - p.t < WAKE_T && p.t <= t);
  }
  // the wakes, kept to the water
  R.puddles.forEach((Pd, k) => {
    const G = puddleGeo(T, k); if (!inView(G.x0 + G.w / 2, G.y0 + G.h / 2, Math.max(G.w, G.h) / 2 + 20)) return;
    ctx.save(); ctx.clip(G.edge);
    for (const c of race.cars) {
      const Wk = wakes.get(c); if (!Wk) continue;
      for (const p of Wk.pts) {
        if (p.k !== k) continue;
        const a = (t - p.t) / WAKE_T, kv = clamp(p.v / 420, 0.35, 1);
        ctx.strokeStyle = `rgba(215,232,255,${0.4 * kv * (1 - a) ** 1.5})`; ctx.lineWidth = 0.8 + 1.6 * (1 - a);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.W * 0.45 + a * (18 + p.v * 0.07), 0, TAU); ctx.stroke();
      }
    }
    ctx.restore();
  });
  // the splash at the kart itself
  for (const c of on) {
    const kv = clamp(c.speed / 420, 0.2, 1) * (c.aquaT > 0 ? 1.5 : 1), hx = Math.cos(c.heading), hy = Math.sin(c.heading);
    const nx = c.x + hx * (c.L * 0.5 + 3), ny = c.y + hy * (c.L * 0.5 + 3);
    ctx.strokeStyle = `rgba(232,243,255,${0.55 * Math.min(1, kv)})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(nx - hx * c.W * 0.3, ny - hy * c.W * 0.3, c.W * 0.62, c.heading - 1.05, c.heading + 1.05); ctx.stroke();
    ctx.fillStyle = '#e8f3ff';
    for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) {
      const f = (t * 3.6 + i / 6 + c.idx * 0.37 + (sd > 0 ? 0.08 : 0)) % 1, out = c.W * 0.5 + f * (8 + 26 * kv), back = -c.L * 0.25 + f * f * (18 + 44 * kv), rr = (1 - f) * 2.4 * Math.min(1.3, kv + 0.4) + 0.7;
      ctx.globalAlpha = 0.75 * (1 - f) * Math.min(1, kv + 0.2);
      ctx.beginPath(); ctx.arc(c.x - hx * back - hy * out * sd, c.y - hy * back + hx * out * sd, rr, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
// ---------------------------------------------------------------- under the karts (draw-mechanics.js)
// spray off the karts on a wet road, rain splashing on the ground, the monorail's shadow, the vents' glow
export function neonUnder(ctx, race) {
  const T = race.track, t = race.time, w = wetAt(race, t), rain = rainAt(race.rainT, t), P = cityOf(T);
  viewOf(ctx);
  ctx.save();
  if (w > 0.1) for (const c of race.cars) {   // spray: a fine mist off the back wheels and a few droplets, longer the faster
    if (c.speed < 120 || c.air > 0 || !inView(c.x, c.y, 120)) continue;
    const k = Math.min(1, (c.speed - 120) / 300) * Math.min(1, w * 1.4) * (c.aquaT > 0 ? 1.6 : 1), hx = Math.cos(c.heading), hy = Math.sin(c.heading), len = 26 + 46 * k, wid = 12 + 8 * k;
    for (const sd of [-1, 1]) {
      ctx.save(); ctx.translate(c.x - hx * c.L * 0.42 - hy * sd * c.W * 0.32, c.y - hy * c.L * 0.42 + hx * sd * c.W * 0.32); ctx.rotate(c.heading + Math.PI);
      ctx.globalAlpha = 0.3 * Math.min(1, k); ctx.drawImage(glowSprite('#dfe9ff'), -len * 0.15, -wid / 2, len, wid); ctx.restore();
    }
    ctx.fillStyle = '#e4eeff';
    for (let i = 0; i < 6; i++) {
      const ph = (t * 4.2 + i / 6 + c.idx * 0.23) % 1, sd = i % 2 ? 1 : -1, back = c.L * 0.5 + ph * (24 + 40 * k), side = sd * (c.W * 0.35 + ph * 9);
      ctx.globalAlpha = 0.55 * Math.min(1, k) * (1 - ph); ctx.beginPath(); ctx.arc(c.x - hx * back - hy * side, c.y - hy * back + hx * side, 0.6 + 1.6 * (1 - ph), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (rain > 0.05) {   // raindrops landing: tiny rings, quick and faint
    ctx.strokeStyle = 'rgba(200,220,250,0.22)'; ctx.lineWidth = 1; ctx.beginPath();
    const W = VIEW.x1 - VIEW.x0, H = VIEW.y1 - VIEW.y0;
    for (let k = 0; k < 120; k++) { const u = t * 3 + hash(k, 0), pass = Math.floor(u), ph = u - pass; if (ph > 0.25 || hash(k, pass + 0.7) > rain) continue; const x = VIEW.x0 + hash(k, pass) * W, y = VIEW.y0 + hash(k, pass + 0.5) * H, r = 1 + ph / 0.25 * 3.5; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
    ctx.stroke();
  }
  if (T.mech.rain) puddleWakes(ctx, race, t, puddleDepth(w));   // karts through the puddles: wakes and splashes
  // the monorail's shadow, and its train's, far down-right on the ground
  if (P.mono.length > 1) {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 14; ctx.beginPath(); P.mono.forEach(([x, y], i) => i ? ctx.lineTo(x + 36, y + 52) : ctx.moveTo(x + 36, y + 52)); ctx.stroke();
    const tr = trainAt(P, t); if (tr) { ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 22; ctx.beginPath(); ctx.moveTo(tr.x0 + 36, tr.y0 + 52); ctx.lineTo(tr.x1 + 36, tr.y1 + 52); ctx.stroke(); }
  }
  for (const v of P.vents) { if (!inView(v.x, v.y, 60)) continue; const f = 0.5 + 0.5 * Math.sin(t * 2 + v.v * 9); ctx.fillStyle = radial(ctx, v.x, v.y, 0, v.x, v.y, 30, [[0, `rgba(255,140,60,${0.25 * f})`], [1, 'rgba(255,140,60,0)']]); ctx.fillRect(v.x - 30, v.y - 30, 60, 60); }
  ctx.restore();
}

// the monorail's train: where it is on the line at time t (it runs end to end, rests out of sight, comes back)
const TRAIN_V = 520, TRAIN_LEN = 260, TRAIN_REST = 6;
function trainAt(P, t) {
  const pts = P.mono; let L = 0; const seg = []; for (let k = 0; k + 1 < pts.length; k++) { const l = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]); seg.push(l); L += l; }
  const run = (L + TRAIN_LEN) / TRAIN_V, cyc = 2 * (run + TRAIN_REST), u = t % cyc, back = u > cyc / 2, v = back ? u - cyc / 2 : u;
  if (v > run) return null;
  let head = v * TRAIN_V; if (back) head = L + TRAIN_LEN - head;
  const at = d => { d = clamp(d, 0, L); for (let k = 0; k < seg.length; k++) { if (d <= seg[k] || k === seg.length - 1) { const f = seg[k] ? d / seg[k] : 0; return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f]; } d -= seg[k]; } return pts[0]; };
  const a = back ? head - TRAIN_LEN : head, b = back ? head : head - TRAIN_LEN;
  if (Math.max(a, b) < 0 || Math.min(a, b) > L) return null;
  const [x0, y0] = at(a), [x1, y1] = at(b); return { x0, y0, x1, y1, back };
}

// ---------------------------------------------------------------- over the karts (draw-mechanics.js)
// the monorail on its beam, holograms over the plazas and the Spire, steam from the vents, the rain, lightning
export function neonOver(ctx, race) {
  const T = race.track, t = race.time, P = cityOf(T), rain = rainAt(race.rainT, t);
  viewOf(ctx);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // steam: soft puffs rising out of the vents (up the screen), drifting
  for (const v of P.vents) {
    if (!inView(v.x, v.y, 160)) continue;
    for (let k = 0; k < 6; k++) { const ph = (t * 0.45 + k / 6 + v.v) % 1, x = v.x + Math.sin(ph * 5 + k + v.v * 9) * 10 + ph * 20, y = v.y - ph * 110, r = 10 + ph * 34; ctx.globalAlpha = 0.3 * Math.sin(Math.PI * ph); ctx.drawImage(glowSprite('#d2d7e6'), x - r * 1.3, y - r * 1.3, r * 2.6, r * 2.6); }
    ctx.globalAlpha = 1;
  }
  // the monorail: a beam on its pylons, the train gliding along it, its windows lit
  if (P.mono.length > 1) {
    ctx.strokeStyle = '#2c3248'; ctx.lineWidth = 16; ctx.beginPath(); P.mono.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    ctx.strokeStyle = '#4b5476'; ctx.lineWidth = 6; ctx.stroke();
    ctx.save(); ctx.strokeStyle = 'rgba(0,229,255,0.7)'; ctx.lineWidth = 1.5; ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 6; ctx.translate(0, 7); ctx.stroke(); ctx.restore();
    const tr = trainAt(P, t);
    if (tr) {
      const a = Math.atan2(tr.y1 - tr.y0, tr.x1 - tr.x0), L = Math.hypot(tr.x1 - tr.x0, tr.y1 - tr.y0);
      ctx.save(); ctx.translate(tr.x0, tr.y0); ctx.rotate(a);
      ctx.fillStyle = '#d8dde8'; ctx.beginPath(); ctx.roundRect(0, -11, L, 22, 10); ctx.fill();
      ctx.fillStyle = '#9aa3b8'; ctx.fillRect(0, 5, L, 6);
      for (let x = 14; x < L - 14; x += 14) { ctx.fillStyle = hash(x, 7) < 0.8 ? 'rgba(255,220,150,0.95)' : 'rgba(120,220,255,0.95)'; ctx.fillRect(x, -7, 9, 5); }
      for (let x = 60; x < L; x += 65) { ctx.fillStyle = '#5c6580'; ctx.fillRect(x, -11, 2, 22); }
      ctx.fillStyle = '#ff2bd6'; ctx.fillRect(0, -2, L, 2);
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glowSprite('#fff4d0'), tr.back ? L - 20 : -60, -30, 80, 60);   // its headlight
      ctx.restore();
    }
  }
  // holograms: over each plaza a big slow-turning figure of light (a wireframe globe, a koi), and a ring round the Spire's crown
  ctx.globalCompositeOperation = 'lighter';
  (clearingsOf(T) || P.marks).forEach((m, i) => { if (i % 2 === 0 && inView(m.x, m.y - 140, 260)) hologram(ctx, m.x, m.y - 120, Math.min(90, m.r * 0.5), t, i); });
  if (P.spire && inView(P.spire.x, P.spire.y, 260)) { const S = P.spire, y = S.y - 60; for (let k = 0; k < 3; k++) { ctx.strokeStyle = k % 2 ? 'rgba(255,43,214,0.45)' : 'rgba(0,229,255,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(S.x, y - k * 12, S.r * (0.7 - k * 0.15), S.r * (0.24 - k * 0.05), 0, t * (k % 2 ? -1 : 1) * 0.8, t * (k % 2 ? -1 : 1) * 0.8 + TAU * 0.8); ctx.stroke(); } }
  ctx.globalCompositeOperation = 'source-over';
  // the rain: streaks falling down the screen, a little slanted, in the light of the city
  if (rain > 0.03) {
    const W = VIEW.x1 - VIEW.x0, H = VIEW.y1 - VIEW.y0;
    for (const [lo, hi, al, lw] of [[0, 0.65, 0.24, 1.1], [0.65, 1, 0.42, 1.6]]) {
      ctx.strokeStyle = `rgba(200,215,245,${al})`; ctx.lineWidth = lw; ctx.beginPath();
      for (let k = 0; k < 520; k++) {
        const v = hash(k, 2); if (v < lo || v >= hi || hash(k, 9) > rain) continue;
        const u = t * 3.2 + hash(k, 0), pass = Math.floor(u), ph = u - pass, x = VIEW.x0 + hash(k, pass) * W, y = VIEW.y0 + hash(k, pass + 0.5) * H;
        const fall = (1 - ph) * 110, l = 14 + 22 * v, px = x - 0.25 * fall, py = y - fall;
        ctx.moveTo(px - 0.25 * l, py - l); ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  // lightning: a flash over the whole city as each spell of rain comes in (with the thunder)
  for (const sp of race.rainT || []) { const dt = t - sp[0]; if (dt > 0 && dt < 0.5 && sp[0] > 0) { const f = (dt < 0.08 ? 1 : dt > 0.16 && dt < 0.24 ? 0.7 : 0) * 0.22; if (f) { ctx.fillStyle = `rgba(210,225,255,${f})`; ctx.fillRect(VIEW.x0, VIEW.y0, VIEW.x1 - VIEW.x0, VIEW.y1 - VIEW.y0); } } }
  ctx.restore();
}
// a hologram turning over a plaza: a wireframe globe (even plazas) or a koi swimming round in a circle, with scan lines
function hologram(ctx, x, y, R, t, i) {
  const fl = hash(Math.floor(t * 12), i) < 0.05 ? 0.3 : 1;
  ctx.globalAlpha = 0.85 * fl;
  ctx.fillStyle = radial(ctx, x, y + R * 1.3, 0, x, y + R * 1.3, R * 1.4, [[0, 'rgba(0,229,255,0.18)'], [1, 'rgba(0,229,255,0)']]); ctx.beginPath(); ctx.moveTo(x - R * 0.35, y + R * 1.3); ctx.lineTo(x - R, y); ctx.lineTo(x + R, y); ctx.lineTo(x + R * 0.35, y + R * 1.3); ctx.fill();   // the beam up from the projector
  if (i % 4 === 0) {
    ctx.strokeStyle = 'rgba(0,229,255,0.55)'; ctx.lineWidth = 1.6;
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI + t * 0.6, rx = Math.abs(Math.cos(a)) * R; ctx.beginPath(); ctx.ellipse(x, y, rx + 0.1, R, 0, 0, TAU); ctx.stroke(); }
    for (let k = -2; k <= 2; k++) { const yy = k / 3 * R, rx = Math.sqrt(Math.max(0, R * R - yy * yy)); ctx.beginPath(); ctx.ellipse(x, y + yy, rx, rx * 0.25, 0, 0, TAU); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,43,214,0.6)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(x, y, R * 1.25, R * 0.3, Math.sin(t * 0.4) * 0.2, 0, TAU); ctx.stroke();
  } else {
    const a = t * 0.8;
    for (let k = 0; k < 2; k++) {
      const ang = a + k * Math.PI, cx = x + Math.cos(ang) * R * 0.6, cy = y + Math.sin(ang) * R * 0.3, dir = ang + Math.PI / 2;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(dir); ctx.strokeStyle = k ? 'rgba(255,43,214,0.7)' : 'rgba(255,225,77,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, R * 0.42, R * 0.17, 0, 0, TAU); ctx.moveTo(-R * 0.42, 0); ctx.lineTo(-R * 0.7, -R * 0.16); ctx.lineTo(-R * 0.66, 0); ctx.lineTo(-R * 0.7, R * 0.16); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(R * 0.22, -R * 0.05, 2.5, 0, TAU); ctx.stroke(); ctx.restore();
    }
  }
  ctx.strokeStyle = 'rgba(160,240,255,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); const s0 = (t * 30) % 6; for (let yy = y - R * 1.1 + s0; yy < y + R * 1.1; yy += 6) { ctx.moveTo(x - R * 1.1, yy); ctx.lineTo(x + R * 1.1, yy); } ctx.stroke();
  ctx.globalAlpha = 1;
}
