// Recursion Ridge art (theme 'alpine'): a height field built from the road's heights plus the track's `peaks`,
// coloured by height, hill-shaded from the top left, with contours. Road walls, the Cliff, landmarks, water, animation.
import { BODIES, STEP, TAU, clamp, mulberry } from '../core.js';
import { CAR_PAINT } from './cars.js';
import { projectToTrack, trackSample } from '../geometry.js';
import { alpha, circ, ell, linear, mix, poly, radial, star } from './paint.js';
import { elevAt, gradeAt } from '../race-elevation.js';
import { settings } from '../settings.js';
import { G_FLY, KICK, cliffVerdict, riverFor, sweptPhase, sweptU, torrentAt } from '../race-cliff.js';

const LX = -Math.SQRT1_2, LY = -Math.SQRT1_2;   // toward the sun
const SNOW = 330;                                // the snow line (world units of height), give or take the noise

// ---------------------------------------------------------------- noise
function hash(ix, iy) { let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.1 + 17, y * 2.1 + 9) * 0.3 + vnoise(x * 4.3 + 41, y * 4.3 + 23) * 0.15;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- the terrain
// H(x, y): ground height (near a road, the roads' own heights, inverse-distance weighted on a coarse grid; away from
// them the peaks plus noise). dRoad(x, y): rough distance to the nearest road's centre line.
const terrains = new WeakMap();
export function terrainOf(T) {
  if (terrains.has(T)) return terrains.get(T);
  const routes = T.routes || [T], S = [], sc = T.def.scale || 1;
  for (const R of routes) { const E = R.mech && R.mech.elev; if (!E) continue; for (let i = 0; i < R.N; i += 12) S.push(R.pts[i][0], R.pts[i][1], E.h[i]); }
  const peaks = (T.def.peaks || []).map(([x, y, r, h]) => [x * sc, y * sc, r * sc, h]);
  const B = T.bbox, M = 900, C = 40, x0 = B.x - M, y0 = B.y - M, nx = Math.ceil((B.w + M * 2) / C) + 2, ny = Math.ceil((B.h + M * 2) / C) + 2;
  const base = new Float32Array(nx * ny), dr = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * C, y = y0 + j * C; let sw = 0, sh = 0, dm = 1e18;
    for (let k = 0; k < S.length; k += 3) { const dx = S[k] - x, dy = S[k + 1] - y, d2 = dx * dx + dy * dy; if (d2 < dm) dm = d2; const w = 1 / ((d2 + 2500) * Math.sqrt(d2 + 2500)); sw += w; sh += w * S[k + 2]; }
    base[j * nx + i] = sh / sw; dr[j * nx + i] = Math.sqrt(dm);
  }
  const bil = (A, x, y) => {
    const fx = clamp((x - x0) / C, 0, nx - 1.001), fy = clamp((y - y0) / C, 0, ny - 1.001), i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, k = j * nx + i;
    return A[k] * (1 - u) * (1 - v) + A[k + 1] * u * (1 - v) + A[k + nx] * (1 - u) * v + A[k + nx + 1] * u * v;
  };
  const dRoad = (x, y) => bil(dr, x, y);
  const H = (x, y) => {
    const d = dRoad(x, y), off = smooth(110, 520, d);
    let h = bil(base, x, y);
    if (off > 0) { let p = 0; for (const [px, py, r, ph] of peaks) { const q = ((px - x) ** 2 + (py - y) ** 2) / (r * r); if (q < 9) p += ph * Math.exp(-q); } h += off * (p + (fbm(x / 420, y / 420) - 0.5) * 44); }
    return h;
  };
  const out = { H, dRoad, x0: B.x - 400, y0: B.y - 400, w: B.w + 800, h: B.h + 800 };
  // where the set pieces stand, for the props and the landmarks to keep off (art/props.js findClearings, track.js)
  const d = T.def, k = [];
  for (const [x, y] of d.stream || []) k.push([x * sc, y * sc, 70]);
  if (d.lake) k.push([d.lake[0] * sc, d.lake[1] * sc, d.lake[2] * sc * 1.3]);
  if (d.observatory) k.push([d.observatory[0] * sc, d.observatory[1] * sc, 170]);
  for (const [x, y] of d.cable || []) k.push([x * sc, y * sc, 90]);
  for (const r of torrentsOf(T)) { const P = r.pts; for (let i = 0; i < P.length; i += 3) k.push([P[i][0], P[i][1], TOR_W * 0.5 + 40]); k.push([r.pool.x, r.pool.y, Math.max(r.pool.rx, r.pool.ry) + 70]); k.push([(r.pool.x + r.out.x) / 2, (r.pool.y + r.out.y) / 2, r.pool.rx * 1.2]); k.push([P[0][0], P[0][1], 110]); }   // (the torrents, their pools and beaches)
  T.keepOut = k;
  terrains.set(T, out); return out;
}

// the colour of the ground at height h (before shading), with slope (steepness) and n (0..1 noise)
const RAMP_COL = [[-60, [140, 196, 102]], [30, [134, 192, 104]], [90, [108, 170, 88]], [160, [78, 140, 74]], [250, [70, 124, 70]], [300, [126, 138, 100]], [335, [154, 150, 138]], [370, [178, 174, 168]], [900, [196, 194, 190]]];
function groundCol(h, slope, n) {
  let k = 1; while (k < RAMP_COL.length - 1 && RAMP_COL[k][0] < h) k++;
  const [ha, a] = RAMP_COL[k - 1], [hb, b] = RAMP_COL[k], t = clamp((h - ha) / (hb - ha), 0, 1);
  let c = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rock = smooth(0.32, 0.75, slope) * (h > 40 ? 1 : 0.4);   // steep ground is bare rock
  c = c.map((v, i) => v + ([142, 136, 128][i] - v) * rock);
  const snow = smooth(SNOW - 20, SNOW + 30, h + (n - 0.5) * 90) * (1 - smooth(0.6, 1.1, slope) * 0.6);
  return c.map((v, i) => v + ([242, 246, 250][i] - v) * snow);
}

// ---------------------------------------------------------------- the ground (art/track.js ground(), case 'alpine')
export function alpineGround(g, T, X0, Y0, W, Hh, rng, dist, D) {
  const Tr = terrainOf(T), { H } = Tr, cell = D > 0.5 ? 10 : 24, gw = Math.ceil(W / cell) + 1, gh = Math.ceil(Hh / cell) + 1;
  const hs = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) hs[j * gw + i] = H(X0 + i * cell, Y0 + j * cell);
  // one pixel per cell, scaled up. Terraced every STEP_H, lit top left, ridge shadows, low ground hazier and bluer
  const oc = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(gw, gh) : Object.assign(document.createElement('canvas'), { width: gw, height: gh });
  const og = oc.getContext('2d'), img = og.createImageData(gw, gh), px = img.data, EX = 2.0;   // EX: the relief, exaggerated so the shading reads
  const reach = Math.ceil(260 / cell);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const k = j * gw + i, h = hs[k];
    const dx = (hs[j * gw + Math.min(gw - 1, i + 1)] - hs[j * gw + Math.max(0, i - 1)]) / (cell * 2), dy = (hs[Math.min(gh - 1, j + 1) * gw + i] - hs[Math.max(0, j - 1) * gw + i]) / (cell * 2);
    const slope = Math.hypot(dx, dy), n = fbm((X0 + i * cell) / 260, (Y0 + j * cell) / 260);
    const band = Math.floor(h / STEP_H), hq = (band + 0.5) * STEP_H;
    const c = groundCol(hq + (h - hq) * 0.35, slope, n);
    // the light: from the top left and a little above; a slope facing it is brighter, one facing away darker
    const nx = -dx * EX, ny = -dy * EX, nl = Math.hypot(nx, ny, 1), lit = (nx * LX * 0.62 + ny * LY * 0.62 + 0.78) / nl / 0.78;
    const white = c[0] > 225 ? 0.55 : 1;   // snow takes shading softly: reads as drifts, not cloud
    let f = (1 + (clamp(0.62 + 0.42 * lit, 0.45, 1.25) - 1) * white) * (0.97 + (hash(i, j) - 0.5) * 0.05);
    f *= 0.94 + 0.1 * (h - band * STEP_H) / STEP_H;   // each shelf a touch brighter toward its upper edge
    // cast shadow: anything up toward the sun that stands above the line of its rays (the sun about 30 degrees up)
    let over = 0;
    for (let d = 1; d <= reach; d++) { const ii = i - d, jj = j - d; if (ii < 0 || jj < 0) break; const e = hs[jj * gw + ii] - h - d * cell * 1.414 * 0.58; if (e > over) over = e; }
    const sh = smooth(0, 28, over);
    f *= 1 - 0.3 * sh;
    const cool = clamp(1 - lit, 0, 1) * 0.12 + sh * 0.12;   // shade is a little blue (sky light)
    const haze = 0.2 * (1 - smooth(0, 240, h));   // the valley floor, far below you: hazy blue
    for (let q = 0; q < 3; q++) { let v = c[q] * f * (q === 0 ? 1 - cool : q === 1 ? 1 - cool * 0.5 : 1 + cool * 0.6); v += ([168, 192, 214][q] - v) * haze; px[k * 4 + q] = clamp(v, 0, 255); }
    px[k * 4 + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(oc, X0 - cell / 2, Y0 - cell / 2, gw * cell, gh * cell); g.restore();
  // the terraces' steps (marching squares on every STEP_H): the face of each step that looks down the screen, a lit lip
  if (D > 0.3) terraces(g, hs, gw, gh, X0, Y0, cell);
  if (D <= 0.5) return;
  // the stream, its waterfall and the lake (under the forest's edge)
  stream(g, T, rng);
  torrent(g, T);
  // texture: tufts of grass low down, scree and stones up high, snow sparkle on top
  g.lineCap = 'round';
  for (let i = 0; i < W * Hh / 900; i++) {
    const x = X0 + rng() * W, y = Y0 + rng() * Hh, h = H(x, y);
    if (h < 260) { g.strokeStyle = rng() < 0.5 ? 'rgba(40,80,30,0.22)' : 'rgba(220,240,180,0.2)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1.5, y - 4); g.stroke(); }
    else if (h < SNOW + 10) { g.fillStyle = rng() < 0.5 ? 'rgba(90,86,80,0.35)' : 'rgba(230,226,218,0.35)'; g.fillRect(x, y, 2, 1.6); }
    else { g.fillStyle = rng() < 0.6 ? 'rgba(255,255,255,0.7)' : 'rgba(150,175,205,0.35)'; g.fillRect(x, y, 1.6, 1.6); }
  }
  forest(g, T, X0, Y0, W, Hh, dist, rng);
}

// Terrace steps seen from above (height reads as up the screen): where the ground rises up the screen, the step's
// face shows as a shaded band FACE_H deep below its edge; rising the other way it's just a dark edge.
export const STEP_H = 26;
const FACE_H = 15;
function terraces(g, hs, gw, gh, X0, Y0, cell) {
  const faces = new Map(), lips = new Map(), edges = new Map();
  const bucket = (m, k) => { let p = m.get(k); if (!p) m.set(k, p = new Path2D()); return p; };
  for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) {
    const a = hs[j * gw + i], b = hs[j * gw + i + 1], c = hs[(j + 1) * gw + i + 1], d = hs[(j + 1) * gw + i];
    const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d); if (hi - lo < 0.01) continue;
    const gx = ((b - a) + (c - d)) / 2, gy = ((d - a) + (c - b)) / 2, gl = Math.hypot(gx, gy) || 1, ux = gx / gl, uy = gy / gl;   // uphill, on screen
    for (let lv = Math.ceil(lo / STEP_H) * STEP_H; lv < hi; lv += STEP_H) {
      const x = X0 + i * cell, y = Y0 + j * cell, pts = [];
      const e = (h0, h1, x0, y0, x1, y1) => { if ((h0 < lv) !== (h1 < lv)) { const t = (lv - h0) / (h1 - h0); pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]); } };
      e(a, b, x, y, x + cell, y); e(b, c, x + cell, y, x + cell, y + cell); e(c, d, x + cell, y + cell, x, y + cell); e(d, a, x, y + cell, x, y);
      const segs = pts.length === 4 ? [[pts[0], pts[1]], [pts[2], pts[3]]] : pts.length >= 2 ? [[pts[0], pts[1]]] : [];
      for (const [p0, p1] of segs) {
        if (uy < -0.12) {   // the ground rises up the screen: the step's face hangs below its edge
          const lit = clamp(-ux * 0.7 - 0.2, -1, 1), key = lv * 8 + Math.round((lit + 1) * 3), fh = FACE_H * Math.min(1, -uy * 1.6);
          const P = bucket(faces, key); P.moveTo(p0[0], p0[1]); P.lineTo(p1[0], p1[1]); P.lineTo(p1[0], p1[1] + fh); P.lineTo(p0[0], p0[1] + fh); P.closePath();
          const L = bucket(lips, lv); L.moveTo(p0[0], p0[1]); L.lineTo(p1[0], p1[1]);
        } else { const E = bucket(edges, lv); E.moveTo(p0[0], p0[1]); E.lineTo(p1[0], p1[1]); }
      }
    }
  }
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [key, P] of faces) {
    const lv = Math.floor(key / 8), lit = (key - lv * 8) / 3 - 1, base = groundCol(lv - STEP_H * 0.5, 0.5, 0.5);
    const rock = Math.min(1, Math.max(0, lv) / 250), face = base.map((v, q) => v * 0.55 + ([120, 104, 86][q] * (1 - rock) + [108, 104, 100][q] * rock) * 0.45);
    const k = 0.62 + 0.18 * lit, snow = lv > SNOW + 20;
    g.fillStyle = snow ? `rgb(${Math.round(186 + 30 * lit)},${Math.round(200 + 26 * lit)},${Math.round(222 + 20 * lit)})` : `rgb(${face.map(v => Math.round(clamp(v * k, 0, 255))).join(',')})`;
    g.fill(P);
  }
  for (const [lv, P] of lips) { g.strokeStyle = lv > SNOW + 20 ? 'rgba(255,255,255,0.8)' : 'rgba(255,250,230,0.45)'; g.lineWidth = 1.6; g.stroke(P); }
  for (const [lv, P] of edges) { g.strokeStyle = lv > SNOW + 20 ? 'rgba(90,120,160,0.35)' : 'rgba(30,34,24,0.28)'; g.lineWidth = 1.4; g.stroke(P); }
  g.restore();
}

// pine forest on the middle slopes, thinning toward the tree line and in noise clearings, never on the verge
function forest(g, T, X0, Y0, W, Hh, dist, rng) {
  const { H } = terrainOf(T), trees = [], clear = T.halfW + 64;
  for (let y = Y0; y < Y0 + Hh; y += 30) for (let x = X0; x < X0 + W; x += 30) {
    const px = x + (rng() - 0.5) * 26, py = y + (rng() - 0.5) * 26, h = H(px, py);
    const dens = smooth(40, 90, h) * (1 - smooth(250, 305, h)) * smooth(0.42, 0.6, fbm(px / 330 + 7, py / 330 + 3));
    if (rng() > dens) continue;
    if (dist(px, py, clear + 40) < clear) continue;
    if ((T.keepOut || []).some(([x, y, r]) => (x - px) ** 2 + (y - py) ** 2 < r * r)) continue;   // (nor on the river)
    trees.push([px, py, (11 + rng() * 7) * (1 - 0.35 * smooth(60, 300, h)), h]);   // (smaller toward the tree line)
  }
  trees.sort((a, b) => a[1] - b[1]);
  g.fillStyle = 'rgba(10,30,14,0.28)';
  for (const [x, y, r] of trees) { ell(g, x + r * 0.55, y + r * 0.7, r * 0.95, r * 0.7); g.fill(); }
  for (const [x, y, r, h] of trees) pineTop(g, x, y, r, h > SNOW - 40, rng);
}
export function pineTop(g, x, y, r, snowy, rng) {
  const rot = rng() * TAU;
  star(g, x, y, r, 8, 0.58, rot); g.fillStyle = '#1f4a2c'; g.fill();
  star(g, x - r * 0.12, y - r * 0.14, r * 0.68, 7, 0.6, rot + 0.4); g.fillStyle = '#2f6a3c'; g.fill();
  star(g, x - r * 0.2, y - r * 0.24, r * 0.36, 6, 0.6, rot + 0.8); g.fillStyle = '#4d8a4e'; g.fill();
  if (snowy) { g.fillStyle = '#f4f8fc'; circ(g, x - r * 0.2, y - r * 0.22, r * 0.2); g.fill(); ell(g, x - r * 0.45, y - r * 0.1, r * 0.2, r * 0.1, 0.6); g.fill(); }
}

// the mountain stream (`stream`, spring to lake; `falls`: index of the waterfall's lip) and the lake
function stream(g, T, rng) {
  const d = T.def, sc = d.scale || 1; if (!d.stream) return;
  const P = d.stream.map(([x, y]) => [x * sc, y * sc]);
  const path = new Path2D(); P.forEach(([x, y], i) => i ? path.lineTo(x, y) : path.moveTo(x, y));
  if (d.lake) {   // the lake: shore, shallows, deep water, and the reflection of the sky
    const [lx, ly, lr] = [d.lake[0] * sc, d.lake[1] * sc, d.lake[2] * sc];
    ell(g, lx + 6, ly + 8, lr * 1.18, lr * 0.84); g.fillStyle = 'rgba(30,40,20,0.2)'; g.fill();
    ell(g, lx, ly, lr * 1.16, lr * 0.82); g.fillStyle = '#c9bf9a'; g.fill();
    ell(g, lx, ly, lr * 1.08, lr * 0.75); g.fillStyle = radial(g, lx - lr * 0.3, ly - lr * 0.3, lr * 0.1, lx, ly, lr * 1.1, [[0, '#5fb2d6'], [0.6, '#2f86b8'], [1, '#55a8c8']]); g.fill();
    for (let k = 0; k < 14; k++) { const a = rng() * TAU, rr = rng() * lr * 0.8; g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1.5; g.beginPath(); g.arc(lx + Math.cos(a) * rr, ly + Math.sin(a) * rr * 0.7, 6 + rng() * 8, Math.PI * 1.1, Math.PI * 1.8); g.stroke(); }
  }
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = 'rgba(40,36,30,0.35)'; g.lineWidth = 44; g.stroke(path);
  g.strokeStyle = '#8f8778'; g.lineWidth = 36; g.stroke(path);
  g.strokeStyle = '#3f8fb8'; g.lineWidth = 24; g.stroke(path);
  g.strokeStyle = '#66b7d8'; g.lineWidth = 12; g.stroke(path);
  g.setLineDash([10, 22]); g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3; g.stroke(path); g.setLineDash([]);
  // stones along the bed
  for (let i = 0; i < P.length - 1; i++) { const [ax, ay] = P[i], [bx, by] = P[i + 1], n = Math.hypot(bx - ax, by - ay) / 18; for (let k = 0; k < n; k++) { const t = rng(), s = (rng() < 0.5 ? -1 : 1) * (14 + rng() * 6), nx = -(by - ay), ny = bx - ax, l = Math.hypot(nx, ny) || 1; ell(g, ax + (bx - ax) * t + nx / l * s, ay + (by - ay) * t + ny / l * s, 3 + rng() * 3, 2 + rng() * 2, rng() * 3); g.fillStyle = rng() < 0.5 ? '#a49c8c' : '#6f685e'; g.fill(); } }
  // the waterfall: a rock step across the stream and white water pouring over it
  if (d.falls !== undefined) {
    const [fx, fy] = P[d.falls], [nx2, ny2] = P[d.falls + 1], a = Math.atan2(ny2 - fy, nx2 - fx);
    g.save(); g.translate(fx, fy); g.rotate(a);
    g.fillStyle = 'rgba(20,20,30,0.35)'; g.fillRect(-4, -36, 70, 72);
    g.fillStyle = linear(g, 0, 0, 60, 0, [[0, '#6f6a66'], [1, '#3e3a38']]); g.fillRect(0, -34, 60, 68);
    g.fillStyle = linear(g, 0, 0, 60, 0, [[0, 'rgba(255,255,255,0.95)'], [0.6, 'rgba(210,236,250,0.9)'], [1, 'rgba(255,255,255,0.9)']]); g.fillRect(0, -14, 60, 28);
    g.restore();
  }
  g.restore();
}

// The torrent below the Cliff (race-cliff.js). riverOf(T): per-track cache shared by the static layer (torrent) and
// the animation (riverFlow): the path every RIV_STEP with normal, width, steepness, boulders, waterfall, pool.
export const torrentsOf = T => { const L = []; for (const R of T.routes || [T]) for (const z of R.mech && R.mech.cliffs || []) for (const r of [z.torrent, z.spill]) if (r && !L.includes(r)) L.push(r); return L; };
export const torrentOf = T => torrentsOf(T)[0] || null;
const TOR_W = 105, RIV_STEP = 8;
const rivers = new WeakMap();
export function riverOf(T, R = torrentOf(T)) {
  if (!R) return null; if (rivers.has(R)) return rivers.get(R);
  const { H } = terrainOf(T), S = [], rng = mulberry(R.pts.length * 31 + 7);
  for (let d = 0; d <= R.len; d += RIV_STEP) {
    const P = torrentAt(R, d / R.len); S.push({ x: P.x, y: P.y, a: P.a, nx: -Math.sin(P.a), ny: Math.cos(P.a), d, h: H(P.x, P.y) });
  }
  const n = S.length;
  for (let i = 0; i < n; i++) {   // steepness: the fall over the next and last 60 along it
    const a = S[Math.max(0, i - 8)], b = S[Math.min(n - 1, i + 8)]; S[i].st = clamp((a.h - b.h) / Math.max(1, b.d - a.d) * 5, 0, 1);
  }
  for (let i = 0; i < n; i++) { let st = 0, w = 0; for (let j = -6; j <= 6; j++) { const q = S[clamp(i + j, 0, n - 1)]; st += q.st; w++; } S[i].st = st / w; }
  // a river with a head (R.iFoot, race-cliff.js): falls = sample on the lip, foot = at its foot; a stream above
  const falls = R.falls !== undefined ? clamp(Math.round(R.cum[Math.min(R.cum.length - 1, R.falls * 12)] / RIV_STEP), 4, n - 8) : -1;
  const foot = R.iFoot ? clamp(Math.round(R.cum[R.iFoot] / RIV_STEP), falls + 1, n - 8) : -1;
  if (foot > 0) for (let i = Math.max(0, falls - 4); i <= foot + 2; i++) S[i].st = Math.max(S[i].st, i < falls ? 0.6 : 1);   // (white water into the falls)
  // width: narrower where steep, a slow wobble, wider into the end pool and again below the falls
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1), head = foot < 0 ? 1 : i <= falls ? 0.42 + 0.36 * smooth(0, falls, i) : i <= foot ? 0.78 : 0.78 + 0.22 * smooth(foot, foot + 30, i);
    S[i].w = TOR_W * head * (1.05 - 0.3 * S[i].st + 0.12 * Math.sin(i * 0.11) + 0.08 * Math.sin(i * 0.37 + 1)) * (1 + 0.25 * smooth(0.9, 1, f));
  }
  // boulders midstream, most in the rapids, none in the waterfall or the pool
  const rocks = [];
  for (let i = 10; i < n - 16; i += 3) {
    const s = S[i]; if (Math.abs(i - falls) < 10 || (foot > 0 && i > falls - 10 && i < foot + 10) || i > n - 24 || rng() > 0.04 + 0.2 * s.st) continue;
    const o = (rng() < 0.5 ? -1 : 1) * (0.12 + rng() * 0.28) * s.w, r = 4 + rng() * 6 + s.st * 3;
    if (rocks.some(k => Math.hypot(k.x - (s.x + s.nx * o), k.y - (s.y + s.ny * o)) < k.r + r + 10)) continue;
    rocks.push({ x: s.x + s.nx * o, y: s.y + s.ny * o, r, a: s.a, i });
  }
  // the calm pool by the road (`shore`: where water meets sand toward the road), and the basin where you fall in
  // (whirlpool; on a river with a head, the plunge pool under its falls)
  const B0 = S[Math.max(0, foot)], pool = { ...R.pool, a: 0 }, basin = { x: B0.x, y: B0.y, rx: B0.w * 0.72, ry: B0.w * 0.6, a: B0.a };
  const spring = foot > 0 ? { x: S[0].x - Math.cos(S[0].a) * 6, y: S[0].y - Math.sin(S[0].a) * 6, rx: S[0].w * 0.85, ry: S[0].w * 0.7, a: S[0].a } : null;
  const toRoad = Math.atan2(R.out.y - pool.y, R.out.x - pool.x);
  let nd = n; for (let i = 0; i < n; i++) if (((S[i].x - pool.x) / pool.rx) ** 2 + ((S[i].y - pool.y) / pool.ry) ** 2 < 0.8) { nd = Math.min(n, i + 2); break; }   // (drawn as a river only as far as the pool)
  const out = { S, n, nd, falls, foot, spring, rocks, pool, basin, len: R.len, R, toRoad, beach: beachOf(R, pool, toRoad), curtain: null };   // curtain: the falls down the cliff's wall, set by cliffArt
  rivers.set(R, out); return out;
}
// the beach: from the pool's road side to under the road's near verge (the road covers its far edge)
const R0x = V => V.R.out.x, R0y = V => V.R.out.y;
function beachOf(R, P, a0) {
  // how far it runs from the pool toward the road
  const ex = P.x + Math.cos(a0) * P.rx, ey = P.y + Math.sin(a0) * P.ry, gap = Math.hypot(R.out.x - ex, R.out.y - ey) + 10, A = clamp(P.rx / 110, 1, 1.5), inner = [], outer = [];
  for (let j = 0; j <= 24; j++) {
    const u = -1 + 2 * j / 24, a = a0 + u * A, w = Math.cos(u * Math.PI / 2) ** 0.7, wob = 1 + 0.08 * Math.sin(j * 1.7 + 0.5) + 0.05 * Math.sin(j * 3.1);
    const px = P.x + Math.cos(a) * P.rx * 0.88, py = P.y + Math.sin(a) * P.ry * 0.88;
    inner.push([px, py]); outer.push([px + Math.cos(a) * (8 + gap * w * wob) * (0.75 + 0.25 * Math.abs(Math.cos(a - a0))), py + Math.sin(a) * (8 + gap * w * wob)]);
  }
  const pts = [...inner, ...outer.reverse()], p = new Path2D();
  // smoothed: through the midpoints, the points as controls
  const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], N = pts.length, s0 = m(pts[N - 1], pts[0]); p.moveTo(...s0);
  for (let i = 0; i < N; i++) { const q = pts[i], e = m(q, pts[(i + 1) % N]); p.quadraticCurveTo(q[0], q[1], e[0], e[1]); }
  p.closePath(); return p;
}
// the river's outline between two fractions of its width (0 the middle, 1 its edge), from sample i0 to i1
function ribbon(S, i0, i1, k, extra = 0) {
  const p = new Path2D();
  for (let i = i0; i <= i1; i++) { const s = S[i], o = s.w / 2 * k + extra; i === i0 ? p.moveTo(s.x + s.nx * o, s.y + s.ny * o) : p.lineTo(s.x + s.nx * o, s.y + s.ny * o); }
  for (let i = i1; i >= i0; i--) { const s = S[i], o = s.w / 2 * k + extra; p.lineTo(s.x - s.nx * o, s.y - s.ny * o); }
  p.closePath(); return p;
}
function pond(P, k, extra = 0) { const p = new Path2D(); for (let j = 0; j <= 40; j++) { const a = j / 40 * TAU, w = 1 + 0.08 * Math.sin(a * 3 + 1) + 0.05 * Math.sin(a * 5); const x = Math.cos(a) * (P.rx * k * w + extra), y = Math.sin(a) * (P.ry * k * w + extra); const X = P.x + x * Math.cos(P.a) - y * Math.sin(P.a), Y = P.y + x * Math.sin(P.a) + y * Math.cos(P.a); j ? p.lineTo(X, Y) : p.moveTo(X, Y); } p.closePath(); return p; }
function torrent(g, T) { for (const R of torrentsOf(T)) river(g, T, R); }
function river(g, T, Rv) {
  const V = riverOf(T, Rv); if (!V) return;
  const rng = mulberry(V.n * 13 + 5);   // own stream, so it draws the same again over the Cliff's face (cliffArt)
  const { S, falls, foot, spring, rocks, pool, basin } = V, n = V.nd;
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  // the spring it rises from, up in the snow (a river with a head): meltwater trickling down to it from the slope above
  if (spring) {
    const P = spring, ba = P.a + Math.PI;
    for (let k = 0; k < 4; k++) {   // the trickles: thin, wandering, fading out up the slope
      const a0 = ba + (k - 1.5) * 0.55, L = 70 + rng() * 60; let x = P.x + Math.cos(a0) * P.rx * 0.8, y = P.y + Math.sin(a0) * P.ry * 0.8;
      const pts = [[x, y]]; for (let m = 1; m <= 8; m++) { const a = a0 + Math.sin(m * 1.3 + k) * 0.35; x += Math.cos(a) * L / 8; y += Math.sin(a) * L / 8; pts.push([x, y]); }
      for (const [lw, col] of [[7, 'rgba(120,130,140,0.35)'], [3.2, 'rgba(110,180,215,0.85)'], [1.2, 'rgba(235,250,255,0.8)']]) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); pts.forEach(([px, py], m) => m ? g.lineTo(px, py) : g.moveTo(px, py)); g.stroke(); }
    }
  }
  // the banks: a soft shadow, then wet dark stone and pebbles at the water's edge
  const ponds = spring ? [pool, basin, spring] : [pool, basin];
  g.fillStyle = 'rgba(20,30,18,0.22)'; g.fill(ribbon(S, 0, n - 1, 1, 18)); for (const P of ponds) g.fill(pond(P, 1, 18));
  g.fillStyle = '#7d7466'; g.fill(ribbon(S, 0, n - 1, 1, 10)); for (const P of ponds) g.fill(pond(P, 1, 10));
  g.fillStyle = '#5b5348'; g.fill(ribbon(S, 0, n - 1, 1, 4)); for (const P of ponds) g.fill(pond(P, 1, 4));
  for (let i = 0; i < n; i += 1) for (const sd of [-1, 1]) {
    if (rng() > 0.55) continue;
    const s = S[i], o = sd * (s.w / 2 + 2 + rng() * 10), x = s.x + s.nx * o, y = s.y + s.ny * o, r = 1.6 + rng() * 3.2;
    ell(g, x + 0.8, y + 1, r, r * 0.75); g.fillStyle = 'rgba(20,18,14,0.35)'; g.fill();
    ell(g, x, y, r, r * 0.75, rng() * 3); g.fillStyle = ['#a59c8b', '#8a8172', '#c2b9a6', '#6e665a'][Math.floor(rng() * 4)]; g.fill();
  }
  // grass and ferns along the top of the bank
  for (let i = 0; i < n; i += 2) for (const sd of [-1, 1]) {
    if (rng() > 0.4) continue;
    const s = S[i], o = sd * (s.w / 2 + 13 + rng() * 8), x = s.x + s.nx * o, y = s.y + s.ny * o;
    if (rng() < 0.25) { const rot = rng() * TAU; g.strokeStyle = '#3f7d3a'; g.lineWidth = 1.6; for (let k = 0; k < 7; k++) { const a = rot + k / 7 * TAU; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.3) * 6, y + Math.sin(a + 0.3) * 6, x + Math.cos(a) * 10, y + Math.sin(a) * 10); g.stroke(); } }
    else { g.strokeStyle = rng() < 0.5 ? '#4f8f3f' : '#6aa64e'; g.lineWidth = 1.3; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x + k * 1.5, y); g.lineTo(x + k * 1.5 + (rng() - 0.5) * 3, y - 4 - rng() * 4); g.stroke(); } }
  }
  // the beach: sand with ripple marks, wet along the waterline, stones, reeds at either end
  { const P = pool, a0 = V.toRoad;
    g.save(); g.fillStyle = 'rgba(30,26,18,0.18)'; g.translate(3, 4); g.fill(V.beach); g.restore();
    g.save(); g.strokeStyle = 'rgba(214,198,150,0.45)'; g.lineWidth = 16; g.lineJoin = 'round'; g.stroke(V.beach); g.strokeStyle = 'rgba(214,198,150,0.6)'; g.lineWidth = 7; g.stroke(V.beach); g.restore();   // (fading into the grass)
    g.fillStyle = linear(g, P.x, P.y, R0x(V), R0y(V), [[0, '#cdb88a'], [0.45, '#dccb9f'], [1, '#e6d8b0']]); g.fill(V.beach);
    g.save(); g.clip(V.beach);
    g.fillStyle = 'rgba(120,98,62,0.5)'; g.fill(pond(P, 1, 14)); g.fillStyle = 'rgba(105,84,52,0.45)'; g.fill(pond(P, 1, 6));   // wet sand
    g.strokeStyle = 'rgba(150,128,86,0.35)'; g.lineWidth = 1.2;
    for (let k = 0; k < 22; k++) { const f = rng(), o = (rng() - 0.5) * P.rx * 2.2, cx = P.x + Math.cos(a0) * (P.ry + 18 + f * 60) - Math.sin(a0) * o, cy = P.y + Math.sin(a0) * (P.ry + 18 + f * 60) + Math.cos(a0) * o, l = 8 + rng() * 14; g.beginPath(); g.moveTo(cx - Math.sin(a0) * l, cy + Math.cos(a0) * l); g.quadraticCurveTo(cx + Math.cos(a0) * 3, cy + Math.sin(a0) * 3, cx + Math.sin(a0) * l, cy - Math.cos(a0) * l); g.stroke(); }   // ripple marks
    for (let k = 0; k < 26; k++) { const a = a0 + (rng() - 0.5) * 2.2, d = 1.02 + rng() * 0.5, x = P.x + Math.cos(a) * P.rx * d, y = P.y + Math.sin(a) * P.ry * d + rng() * 30, r = k < 6 ? 4 + rng() * 4 : 1.4 + rng() * 2;
      ell(g, x + r * 0.35, y + r * 0.45, r, r * 0.7); g.fillStyle = 'rgba(40,32,20,0.3)'; g.fill(); ell(g, x, y, r, r * 0.7, rng() * 3); g.fillStyle = ['#b9b2a6', '#9d958a', '#d6d0c4', '#8a8379'][Math.floor(rng() * 4)]; g.fill();
      ell(g, x - r * 0.3, y - r * 0.3, r * 0.4, r * 0.25); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fill(); }
    g.restore();
  }
  // the water: turquoise in the shallows, deepening to teal in the middle (deepest in the calm stretches and the pool)
  const DEEP = [[1, '#86d6cf'], [0.85, '#5fbfc6'], [0.68, '#3ea2bb'], [0.5, '#2b86ab'], [0.32, '#20709a']];
  for (const [k, col] of DEEP) { g.fillStyle = col; g.fill(ribbon(S, 0, n - 1, k)); g.fill(pond(basin, k)); if (spring) g.fill(pond(spring, k)); }
  if (spring) {   // the spring: welling up in the middle, stones and snow round its rim
    const P = spring;
    for (let k = 1; k <= 3; k++) { g.strokeStyle = `rgba(235,250,255,${0.55 - k * 0.12})`; g.lineWidth = 1.4; ell(g, P.x, P.y, P.rx * 0.18 * k, P.ry * 0.18 * k); g.stroke(); }
    ell(g, P.x, P.y, P.rx * 0.12, P.ry * 0.12); g.fillStyle = 'rgba(230,248,255,0.8)'; g.fill();
    for (let k = 0; k < 16; k++) { const a = P.a + Math.PI * 0.35 + k / 16 * Math.PI * 1.3 + (rng() - 0.5) * 0.2, x = P.x + Math.cos(a) * (P.rx + 6), y = P.y + Math.sin(a) * (P.ry + 6), r = 3 + rng() * 4;   // (round the back of it, not across where it runs out)
      ell(g, x + r * 0.35, y + r * 0.45, r, r * 0.75); g.fillStyle = 'rgba(20,18,14,0.35)'; g.fill();
      ell(g, x, y, r, r * 0.78, rng() * 3); g.fillStyle = ['#a59c8b', '#8a8172', '#c2b9a6'][Math.floor(rng() * 3)]; g.fill();
      if (rng() < 0.6) { ell(g, x - r * 0.15, y - r * 0.35, r * 0.75, r * 0.4); g.fillStyle = '#f4f8fc'; g.fill(); } }   // (snow on top)
  }
  // the pool: calm and shallow, clear turquoise over sand toward the beach, a deeper channel where the river comes in
  { const In = S[Math.max(0, n - 3)];   // each deeper layer shifted toward the inflow, so the channel shoals up toward the beach
    for (const [k, col] of [[1, '#9cdbd2'], [0.86, '#79cbc9'], [0.66, '#5ab4c3'], [0.48, '#3f97b5'], [0.3, '#2f80a6']]) { const f = (1 - k) * 0.85; g.fillStyle = col; g.fill(pond({ ...pool, x: pool.x + (In.x - pool.x) * f, y: pool.y + (In.y - pool.y) * f }, k)); } }
  { const P = pool, a0 = V.toRoad, sx = P.x + Math.cos(a0) * P.rx * 0.55, sy = P.y + Math.sin(a0) * P.ry * 0.55;
    g.save(); g.clip(pond(pool, 1)); g.fillStyle = radial(g, sx, sy + P.ry * 0.4, 4, sx, sy + P.ry * 0.4, P.rx * 1.1, [[0, 'rgba(232,214,160,0.55)'], [0.5, 'rgba(220,206,160,0.25)'], [1, 'rgba(220,206,160,0)']]); g.fillRect(P.x - P.rx * 2, P.y - P.ry * 2, P.rx * 4, P.ry * 4);   // the sand showing through
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.6;   // little waves lapping at the beach
    for (let k = 1; k <= 3; k++) { g.beginPath(); g.ellipse(P.x, P.y, P.rx * (1 - k * 0.07), P.ry * (1 - k * 0.1), 0, a0 - 0.9 + k * 0.1, a0 + 0.9 - k * 0.1); g.stroke(); }
    g.restore();
  }
  // the rapids: the deep channel paler and churned where it runs steep
  for (let i = 0; i < n - 1; i++) { const s = S[i]; if (s.st < 0.35) continue; g.fillStyle = `rgba(214,240,246,${0.28 * smooth(0.35, 0.8, s.st)})`; g.fill(ribbon(S, i, Math.min(n - 1, i + 1), 0.8)); }
  // the waterline: a thin bright edge, darker wet stone just above it
  g.strokeStyle = 'rgba(235,250,250,0.55)'; g.lineWidth = 1.6;
  for (const sd of [-1, 1]) { g.beginPath(); for (let i = 0; i < n; i++) { const s = S[i], o = sd * (s.w / 2 - 1); i ? g.lineTo(s.x + s.nx * o, s.y + s.ny * o) : g.moveTo(s.x + s.nx * o, s.y + s.ny * o); } g.stroke(); }
  // standing waves across the rapids: white crests, curved upstream
  for (let i = 6; i < n - 6; i += 4) {
    const s = S[i]; if (s.st < 0.4 || Math.abs(i - falls) < 8) continue;
    for (let k = 0; k < 3; k++) {
      const o = (rng() - 0.5) * s.w * 0.6, x = s.x + s.nx * o, y = s.y + s.ny * o, l = s.w * (0.12 + rng() * 0.12);
      g.strokeStyle = `rgba(255,255,255,${0.45 + rng() * 0.4})`; g.lineWidth = 1.6 + rng() * 2;
      g.beginPath(); g.moveTo(x - s.nx * l, y - s.ny * l); g.quadraticCurveTo(x - Math.cos(s.a) * 4, y - Math.sin(s.a) * 4, x + s.nx * l, y + s.ny * l); g.stroke();
    }
  }
  // boulders: foam piled on the upstream side, a dark eddy behind, the rock lit from the top left
  for (const k of rocks) {
    const ca = Math.cos(k.a), sa = Math.sin(k.a);
    g.fillStyle = 'rgba(16,60,84,0.35)'; ell(g, k.x + ca * k.r * 1.6, k.y + sa * k.r * 1.6, k.r * 1.6, k.r * 0.9, k.a); g.fill();   // the eddy behind it
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.4;
    for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(k.x - sa * sd * k.r, k.y + ca * sd * k.r); g.quadraticCurveTo(k.x + ca * k.r * 1.8 - sa * sd * k.r * 1.3, k.y + sa * k.r * 1.8 + ca * sd * k.r * 1.3, k.x + ca * k.r * 3.2 - sa * sd * k.r * 0.6, k.y + sa * k.r * 3.2 + ca * sd * k.r * 0.6); g.stroke(); }   // its wake, a V
    g.fillStyle = 'rgba(255,255,255,0.85)'; ell(g, k.x - ca * k.r * 0.55, k.y - sa * k.r * 0.55, k.r * 1.25, k.r * 1.05, k.a); g.fill();   // foam piled up against it
    ell(g, k.x + k.r * 0.25, k.y + k.r * 0.35, k.r, k.r * 0.8); g.fillStyle = 'rgba(10,20,30,0.4)'; g.fill();
    ell(g, k.x, k.y, k.r, k.r * 0.82, k.a); g.fillStyle = '#7a7268'; g.fill();
    ell(g, k.x - k.r * 0.25, k.y - k.r * 0.3, k.r * 0.55, k.r * 0.4, k.a); g.fillStyle = '#a69d90'; g.fill();
    ell(g, k.x - k.r * 0.35, k.y - k.r * 0.4, k.r * 0.2, k.r * 0.13, k.a); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fill();
  }
  // the waterfall: a rock lip, the curtain hanging down the screen from it (height reads as up), a plunge pool
  if (falls > 0 && foot < 0) {   // a river with a head pours over the cliff's wall instead: cliffFalls
    const s = S[falls], f2 = S[Math.min(n - 1, falls + 5)], w = s.w * 1.15;
    const px = f2.x + Math.cos(f2.a) * 6, py = f2.y + Math.sin(f2.a) * 6;
    ell(g, px, py, w * 0.95, w * 0.75, f2.a); g.fillStyle = '#5b5348'; g.fill();
    ell(g, px, py, w * 0.85, w * 0.66, f2.a); g.fillStyle = radial(g, px, py, 4, px, py, w, [[0, '#1d5f86'], [0.6, '#2b86ab'], [1, '#5fbfc6']]); g.fill();
    for (let k = 1; k <= 3; k++) { g.strokeStyle = `rgba(230,248,252,${0.5 - k * 0.12})`; g.lineWidth = 1.5; ell(g, px, py, w * (0.3 + k * 0.15), w * (0.22 + k * 0.12), f2.a); g.stroke(); }
    const lx = s.x, ly = s.y, CH = 30;   // the lip's line across, and the curtain's drop on screen
    const L0 = [lx + s.nx * w / 2, ly + s.ny * w / 2], L1 = [lx - s.nx * w / 2, ly - s.ny * w / 2];
    g.fillStyle = 'rgba(20,16,14,0.45)'; poly(g, [[L0[0] - 6, L0[1] - 4], [L1[0] - 6, L1[1] - 4], [L1[0] + 4, L1[1] + CH + 6], [L0[0] + 4, L0[1] + CH + 6]]); g.fill();   // the rock face behind
    const curtain = [[L0[0], L0[1]], [L1[0], L1[1]], [L1[0] + 2, L1[1] + CH], [L0[0] + 2, L0[1] + CH]];
    poly(g, curtain); g.fillStyle = linear(g, lx, ly, lx, ly + CH, [[0, 'rgba(240,252,255,0.98)'], [0.6, 'rgba(206,236,246,0.95)'], [1, 'rgba(255,255,255,0.98)']]); g.fill();
    g.save(); poly(g, curtain); g.clip();
    for (let k = 0; k < 16; k++) { const f = k / 15, x0 = L0[0] + (L1[0] - L0[0]) * f, y0 = L0[1] + (L1[1] - L0[1]) * f; g.strokeStyle = k % 3 ? 'rgba(150,200,222,0.55)' : 'rgba(255,255,255,0.9)'; g.lineWidth = 1.2 + (k % 2); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + 1 + (rng() - 0.5) * 2, y0 + CH); g.stroke(); }
    g.restore();
    g.strokeStyle = '#4a433b'; g.lineWidth = 4; g.beginPath(); g.moveTo(L0[0], L0[1]); g.lineTo(L1[0], L1[1]); g.stroke();   // the lip
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(L0[0], L0[1] + 1.5); g.lineTo(L1[0], L1[1] + 1.5); g.stroke();
    for (const [x, y] of [L0, L1]) { ell(g, x, y, 9, 7, rng()); g.fillStyle = '#6e665a'; g.fill(); ell(g, x - 2, y - 2, 5, 3.5, rng()); g.fillStyle = '#a49c8c'; g.fill(); }
  }
  // the whirlpool in the basin under the cliff, where a kart that came down short is pulled in
  for (let k = 0; k < 4; k++) { g.strokeStyle = `rgba(255,255,255,${0.5 - k * 0.09})`; g.lineWidth = 2.2; g.beginPath(); for (let m = 0; m <= 40; m++) { const a = m / 40 * TAU * 1.2 + k * 1.6, r = basin.rx * (0.15 + 0.75 * m / 40); const x = basin.x + Math.cos(a) * r, y = basin.y + Math.sin(a) * r * 0.8; m ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  ell(g, basin.x, basin.y, basin.rx * 0.18, basin.rx * 0.14); g.fillStyle = 'rgba(10,50,80,0.6)'; g.fill();
  // round the pool: reeds (not on the beach), lily pads, a jetty off the beach with a rowboat
  { const P = pool, a0 = V.toRoad, off = a => Math.abs(Math.atan2(Math.sin(a - a0), Math.cos(a - a0)));
    for (let k = 0; k < 34; k++) { const a = rng() * TAU; if (off(a) < 1.35) continue; const d = 0.96 + rng() * 0.12, x = P.x + Math.cos(a) * P.rx * d, y = P.y + Math.sin(a) * P.ry * d;
      g.strokeStyle = rng() < 0.5 ? '#5f8f3a' : '#7aa64a'; g.lineWidth = 1.5; for (let m = 0; m < 4; m++) { g.beginPath(); g.moveTo(x + m * 1.6 - 3, y + 2); g.lineTo(x + m * 1.6 - 3 + (rng() - 0.5) * 4, y - 6 - rng() * 7); g.stroke(); }
      if (rng() < 0.3) { ell(g, x + 1, y - 9, 1.6, 3.4); g.fillStyle = '#6b4a2b'; g.fill(); } }
    const la = a0 + Math.PI * 0.8; for (let k = 0; k < 6; k++) { const x = P.x + Math.cos(la) * P.rx * (0.55 + rng() * 0.25) + (rng() - 0.5) * 20, y = P.y + Math.sin(la) * P.ry * (0.5 + rng() * 0.3) + (rng() - 0.5) * 12, r = 4 + rng() * 3, a = rng() * TAU;
      g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, a + 0.4, a + TAU - 0.1); g.closePath(); g.fillStyle = '#4f9a48'; g.fill(); if (k % 3 === 0) { circ(g, x + 1, y - 1, 1.6); g.fillStyle = '#f7c5d9'; g.fill(); } }
    // the jetty: from the beach out over the water, planks across it, posts, its shadow on the water; a rowboat beside it
    if (V.R.jetty) {
    const ja = a0 + 0.95, jx0 = P.x + Math.cos(ja) * P.rx * 1.12, jy0 = P.y + Math.sin(ja) * P.ry * 1.12, jx1 = P.x + Math.cos(ja) * P.rx * 0.5, jy1 = P.y + Math.sin(ja) * P.ry * 0.5;
    const jl = Math.hypot(jx1 - jx0, jy1 - jy0), jr = Math.atan2(jy1 - jy0, jx1 - jx0), JW = 14;
    g.save(); g.translate(jx0, jy0); g.rotate(jr);
    g.fillStyle = 'rgba(10,40,60,0.3)'; g.fillRect(4, -JW / 2 + 6, jl, JW);
    for (const yy of [-JW / 2 + 1, JW / 2 - 1]) for (let x = 10; x <= jl; x += 18) { circ(g, x, yy, 2.4); g.fillStyle = '#4a3523'; g.fill(); }
    g.fillStyle = '#9b7652'; g.fillRect(0, -JW / 2, jl, JW);
    g.strokeStyle = 'rgba(60,40,24,0.55)'; g.lineWidth = 1; for (let x = 4; x < jl; x += 5) { g.beginPath(); g.moveTo(x, -JW / 2); g.lineTo(x, JW / 2); g.stroke(); }
    g.fillStyle = 'rgba(255,240,210,0.25)'; g.fillRect(0, -JW / 2, jl, 2);
    // the rowboat tied alongside, near the end
    g.translate(jl * 0.7, JW / 2 + 9); g.rotate(0.12);
    ell(g, 2, 3, 15, 6.5); g.fillStyle = 'rgba(10,40,60,0.3)'; g.fill();
    g.beginPath(); g.moveTo(-15, 0); g.quadraticCurveTo(-8, -7, 8, -6); g.quadraticCurveTo(16, -3, 17, 0); g.quadraticCurveTo(16, 3, 8, 6); g.quadraticCurveTo(-8, 7, -15, 0); g.closePath(); g.fillStyle = '#c0463a'; g.fill();
    g.beginPath(); g.moveTo(-12, 0); g.quadraticCurveTo(-6, -4.5, 7, -4); g.quadraticCurveTo(13, -2, 14, 0); g.quadraticCurveTo(13, 2, 7, 4); g.quadraticCurveTo(-6, 4.5, -12, 0); g.closePath(); g.fillStyle = '#8a5a36'; g.fill();
    g.fillStyle = '#6b4428'; g.fillRect(-3, -4.5, 2.5, 9); g.fillRect(5, -4, 2.5, 8);
    g.restore();
    g.strokeStyle = '#d9cfb8'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(jx0 + Math.cos(jr) * jl * 0.7, jy0 + Math.sin(jr) * jl * 0.7); g.lineTo(jx0 + Math.cos(jr) * jl * 0.7 - Math.sin(jr) * 10, jy0 + Math.sin(jr) * jl * 0.7 + Math.cos(jr) * 10); g.stroke();
    }
  }
  // pines leaning over the water: their shadows on it, then the trees on the bank
  const pines = [];
  for (let i = 8; i < n - 8; i += 5) for (const sd of [-1, 1]) if (rng() < 0.22) { const s = S[i], o = sd * (s.w / 2 + 16 + rng() * 10), x = s.x + s.nx * o, y = s.y + s.ny * o; if (((x - pool.x) / (pool.rx * 1.6)) ** 2 + ((y - pool.y) / (pool.ry * 2.2)) ** 2 < 1) continue; pines.push([x, y, 10 + rng() * 6]); }
  g.fillStyle = 'rgba(8,30,40,0.22)'; for (const [x, y, r] of pines) { ell(g, x + r * 0.9, y + r * 1.1, r * 1.2, r * 0.8); g.fill(); }
  for (const [x, y, r] of pines.sort((a, b) => a[1] - b[1])) pineTop(g, x, y, r, false, rng);
  g.restore();
}
// the flowing parts, once a frame (alpineUnder), on screen only: foam and ripples at the water's speed, waves on the
// beach, glints
export function riverFlow(ctx, race, t) { for (const R of torrentsOf(race.track)) flowOf(ctx, race, t, riverOf(race.track, R)); }
function flowOf(ctx, race, t, V) {
  if (!V) return;
  const { S, falls, pool } = V, n = V.nd, m = ctx.getTransform(), sc = Math.hypot(m.a, m.b) || 1;
  const x0 = -m.e / sc - 100, y0 = -m.f / sc - 100, x1 = x0 + ctx.canvas.width / sc + 200, y1 = y0 + ctx.canvas.height / sc + 200;
  const hid = i => V.foot > 0 && i > V.falls && i < V.foot;   // (behind the waterfall's curtain)
  const on = s => s.x > x0 && s.x < x1 && s.y > y0 && s.y < y1;
  const speed = V.len * (1 - (V.R.uFoot || 0)) / (V.R.ride * 0.85);   // as fast as it carries a kart
  ctx.save(); ctx.lineCap = 'round';
  // foam ribbons: each seeded at a fraction across the river, sliding down it
  for (let k = 0; k < 90; k++) {
    const u = (hash(k, 3) + t * speed / V.len * (0.7 + 0.6 * hash(k, 5))) % 1, i = Math.floor(u * (n - 1)), s = S[i]; if (!s || !on(s) || hid(i)) continue;
    const o = (hash(k, 7) - 0.5) * s.w * 0.75, x = s.x + s.nx * o, y = s.y + s.ny * o, st = s.st, l = 8 + st * 16;
    ctx.strokeStyle = `rgba(255,255,255,${0.18 + 0.55 * st})`; ctx.lineWidth = 1.5 + st * 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(s.a) * l, y + Math.sin(s.a) * l); ctx.stroke();
  }
  // churning patches in the rapids and soft rings in the calm stretches
  for (let k = 0; k < 40; k++) {
    const u = (hash(k, 11) + t * speed / V.len * 0.8) % 1, i = Math.floor(u * (n - 1)), s = S[i]; if (!s || !on(s) || hid(i)) continue;
    const o = (hash(k, 13) - 0.5) * s.w * 0.5, x = s.x + s.nx * o, y = s.y + s.ny * o, ph = (t * 1.3 + hash(k, 17)) % 1;
    if (s.st > 0.45) { ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - ph)})`; ctx.beginPath(); ctx.ellipse(x, y, 4 + ph * 6, 3 + ph * 4, s.a, 0, TAU); ctx.fill(); }
    else { ctx.strokeStyle = `rgba(230,250,255,${0.28 * (1 - ph)})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x, y, 3 + ph * 10, 2 + ph * 6, s.a, 0, TAU); ctx.stroke(); }
  }
  // glints of sun on the water
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 36; k++) {
    const i = Math.floor(hash(k, 19) * (n - 1)), s = S[i]; if (!on(s) || hid(i)) continue;
    const a = Math.max(0, Math.sin(t * (2 + hash(k, 23) * 3) + k)) ** 6; if (a < 0.05) continue;
    const o = (hash(k, 29) - 0.5) * s.w * 0.7, x = s.x + s.nx * o, y = s.y + s.ny * o;
    ctx.fillStyle = `rgba(255,255,240,${0.8 * a})`; ctx.fillRect(x - 3, y - 0.6, 6, 1.2); ctx.fillRect(x - 0.6, y - 2.5, 1.2, 5);
  }
  for (let k = 0; k < 10; k++) {   // and on the pool
    const a = Math.max(0, Math.sin(t * (1.5 + hash(k, 31) * 2) + k * 2)) ** 6; if (a < 0.05) continue;
    const ang = hash(k, 37) * TAU, d = hash(k, 41) * 0.7, x = pool.x + Math.cos(ang) * pool.rx * d, y = pool.y + Math.sin(ang) * pool.ry * d;
    ctx.fillStyle = `rgba(255,255,240,${0.7 * a})`; ctx.fillRect(x - 3, y - 0.6, 6, 1.2); ctx.fillRect(x - 0.6, y - 2.5, 1.2, 5);
  }
  ctx.globalCompositeOperation = 'source-over';
  // the waterfall down the cliff's wall (cliffFalls): water sliding down the curtain, spray and mist billowing off its foot
  const C = V.curtain;
  if (C && on({ x: C.x0, y: C.L[0][1] })) {
    const { L, FH } = C, N = L.length - 1;
    ctx.save(); poly(ctx, [...L, ...L.slice().reverse().map(([x, y]) => [x, y + FH])]); ctx.clip();
    for (let k = 0; k < 22; k++) {
      const j = Math.floor(hash(k, 71) * N), [x, y] = L[j], ph = (t * (1.4 + hash(k, 73)) + hash(k, 79)) % 1, l = 10 + hash(k, 83) * 16;
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * Math.sin(Math.PI * ph)})`; ctx.lineWidth = 1.5 + hash(k, 89) * 2;
      ctx.beginPath(); ctx.moveTo(x, y + ph * FH - l); ctx.lineTo(x, y + ph * FH); ctx.stroke();
    }
    ctx.restore();
    const [mx, my] = L[N >> 1], w = C.x1 - C.x0;
    for (let k = 0; k < 9; k++) {
      const ph = (t * 0.55 + k / 9) % 1, a = -Math.PI / 2 + (hash(k, 97) - 0.5) * 2.6, r = 8 + ph * (14 + w * 0.3), d = ph * (18 + w * 0.5);
      ctx.fillStyle = `rgba(255,255,255,${0.42 * (1 - ph) ** 1.3})`; ctx.beginPath(); ctx.arc(mx + Math.cos(a) * d, my + FH + 6 + Math.sin(a) * d * 0.5, r, 0, TAU); ctx.fill();
    }
  }
  // the spring: rings welling up out of it
  if (V.spring && on(V.spring)) { const P = V.spring; for (let k = 0; k < 3; k++) { const ph = (t * 0.5 + k / 3) % 1; ctx.strokeStyle = `rgba(235,252,255,${0.5 * (1 - ph)})`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(P.x, P.y, 3 + ph * P.rx * 0.8, 2 + ph * P.ry * 0.8, 0, 0, TAU); ctx.stroke(); } }
  // the whirlpool turning in the basin
  { const B = V.basin; if (on(B)) { ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2; for (let k = 0; k < 3; k++) { const a0 = -t * 2.2 + k * 2.1; ctx.beginPath(); for (let m = 0; m <= 16; m++) { const a = a0 + m / 16 * 2.2, r = B.rx * (0.2 + 0.6 * m / 16); const x = B.x + Math.cos(a) * r, y = B.y + Math.sin(a) * r * 0.8; m ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); } } }
  // the pool: little waves running up the beach and sliding back (a bright edge on the wet sand), slow rings
  if (on(pool)) {
    const P = pool, a0 = V.toRoad;
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.45 + k / 3) % 1, reach = Math.sin(Math.PI * ph), r = 0.93 + 0.13 * reach, al = 0.65 * Math.sin(Math.PI * ph);
      ctx.strokeStyle = `rgba(255,255,255,${al})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(P.x, P.y, P.rx * r, P.ry * r, 0, a0 - 0.95 + k * 0.08, a0 + 0.95 - k * 0.12); ctx.stroke();
      ctx.strokeStyle = `rgba(110,90,60,${0.25 * al})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(P.x, P.y, P.rx * (r + 0.03), P.ry * (r + 0.05), 0, a0 - 0.8, a0 + 0.8); ctx.stroke();
    }
    for (let k = 0; k < 4; k++) { const ph = (t * 0.25 + k / 4) % 1, ang = hash(k, 61) * TAU, x = P.x + Math.cos(ang) * P.rx * 0.45, y = P.y + Math.sin(ang) * P.ry * 0.45;
      ctx.strokeStyle = `rgba(235,252,255,${0.3 * (1 - ph)})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x, y, 4 + ph * 22, 2.5 + ph * 12, 0, 0, TAU); ctx.stroke(); }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- along the road (after the road, before the props)
// cuttings, guard rails and drops, snow banks, the gorge bridge, grade signs, the Cliff, landmarks
export function alpineStatic(g, T, A, D, drawRamp) {
  const { H } = terrainOf(T), routes = T.routes || [T];
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  for (const R of routes) {
    const E = R.mech.elev;
    // snow banks on both verges above the snow line
    if (D > 0.5) for (let i = 0; i < R.N; i += 5) {
      if (E.h[i] < SNOW - 40) continue;
      const k = smooth(SNOW - 40, SNOW + 20, E.h[i]), p = R.pts[i], t = R.tan[i];
      for (const sd of [-1, 1]) { const o = R.hw[i] + 18 + Math.sin(i * 0.37 + sd) * 4, x = p[0] - t[1] * sd * o, y = p[1] + t[0] * sd * o; ell(g, x + 2, y + 3, 14 * k, 8 * k, Math.atan2(t[1], t[0])); g.fillStyle = 'rgba(70,95,130,0.18)'; g.fill(); ell(g, x, y, 13 * k, 7 * k, Math.atan2(t[1], t[0])); g.fillStyle = '#f7fafd'; g.fill(); }
    }
  }
  roadTilt(g, T);
  slopeMarks(g, T);
  gorgeBridge(g, T);
  if (D > 0.5) gradeSigns(g, T);
  for (const R of routes) for (const z of R.mech.cliffs) cliffArt(g, T, R, z, A, drawRamp);
  landmarks(g, T, D);
  g.restore();
}
// The road's walls, under the road (track.js calls this first, so a road in front covers a wall's foot). Height reads
// as up the screen, so only faces looking down the screen show: a retaining wall below a road's lower edge (as tall as
// the drop), a cutting above its upper edge; otherwise just the lip. Shade on down-right faces; retaining walls cast shadows.
export function alpineWalls(g, T, D) {
  const { H } = terrainOf(T), routes = T.routes || [T], skip = bridgeSpans(T);
  const done = new Set(), key = (x, y) => Math.round(x / 20) + ',' + Math.round(y / 20);
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  slab(g, T);
  const runs = [];
  for (const R of routes) {
    const E = R.mech.elev, cl = R.mech.cliffs[0];
    for (const sd of [-1, 1]) {
      let run = null; const flush = () => { if (run && run.pts.length > 1) runs.push(run); run = null; };
      for (let i = 0; i < R.N; i += 3) {
        const s = i * STEP, p = R.pts[i], t = R.tan[i], nx = -t[1] * sd, ny = t[0] * sd, hw = R.hw[i];
        if ((cl && s > cl.sLip - 30 && s < cl.sFlat + 60) || skip(R, s)) { flush(); continue; }
        const ex = p[0] + nx * (hw + 14), ey = p[1] + ny * (hw + 14), k = key(ex, ey);
        if (done.has(k) && !run) continue; done.add(k);
        let lo = 1e9, hi = -1e9; for (let d = 34; d <= 154; d += 30) { const h = H(p[0] + nx * (hw + d), p[1] + ny * (hw + d)); lo = Math.min(lo, h); hi = Math.max(hi, h); }
        const drop = E.h[i] - lo, rise = hi - E.h[i], kind = drop > 6 && drop >= rise ? -1 : rise > 6 ? 1 : 0;
        if (!run || run.kind !== kind) { flush(); if (kind) run = { kind, pts: [] }; }
        if (run) run.pts.push([ex, ey, nx, ny, kind < 0 ? drop : rise]);
      }
      flush();
    }
  }
  for (const run of runs) oblique(g, run, D);
  g.restore();
}
// The road as a raised slab: its shadow falls down-right and its down-screen edges show a side, both growing with
// height, so switchbacks read as stacked roads
const SLAB_K = 0.045, SLAB_MAX = 16, SHADOW_K = 0.05;
function slab(g, T) {
  const routes = T.routes || [T], hi = (T.mech && T.mech.elev && T.mech.elev.hi) || 1;
  const sh = new Path2D(), faces = new Map();
  for (const R of routes) {
    const E = R.mech.elev, cl = R.mech.cliffs[0];
    for (let i = 0; i + 3 < R.N; i += 3) {
      const s = i * STEP; if (cl && s > cl.sLip - 10 && s < cl.sLand) continue;
      const a = R.pts[i], b = R.pts[i + 3], ta = R.tan[i], tb = R.tan[i + 3], ha = R.hw[i] + 14, hb = R.hw[i + 3] + 14;
      const oa = E.h[i] * SHADOW_K, ob = E.h[i + 3] * SHADOW_K;
      // the shadow: the road's outline moved down-right by its height
      sh.moveTo(a[0] - ta[1] * ha + oa * 0.75, a[1] + ta[0] * ha + oa); sh.lineTo(b[0] - tb[1] * hb + ob * 0.75, b[1] + tb[0] * hb + ob); sh.lineTo(b[0] + tb[1] * hb + ob * 0.75, b[1] - tb[0] * hb + ob); sh.lineTo(a[0] + ta[1] * ha + oa * 0.75, a[1] - ta[0] * ha + oa); sh.closePath();
      for (const sd of [-1, 1]) {
        const nx = -ta[1] * sd, ny = ta[0] * sd; if (ny < 0.15) continue;   // only the side that looks down the screen shows
        const fa = Math.min(SLAB_MAX, 3 + E.h[i] * SLAB_K) * ny, fb = Math.min(SLAB_MAX, 3 + E.h[i + 3] * SLAB_K) * ny;
        const lit = nx * LX + ny * LY, k = Math.round((lit + 1) * 4); let P = faces.get(k); if (!P) faces.set(k, P = new Path2D());
        const ax = a[0] + nx * ha, ay = a[1] + ny * ha, bx = b[0] - tb[1] * sd * hb, by = b[1] + tb[0] * sd * hb;
        P.moveTo(ax, ay); P.lineTo(bx, by); P.lineTo(bx, by + fb); P.lineTo(ax, ay + fa); P.closePath();
      }
    }
  }
  g.fillStyle = 'rgba(12,16,24,0.22)'; g.fill(sh);
  for (const [k, P] of faces) { const lit = k / 4 - 1, v = 0.8 + 0.25 * lit; g.fillStyle = `rgb(${Math.round(150 * v)},${Math.round(136 * v)},${Math.round(112 * v)})`; g.fill(P); }
}
const WALL_K = 0.85, WALL_MAX = 62;   // a wall's face on screen: this much per unit of height, at most
function oblique(g, run, D) {
  const P = run.pts, up = run.kind > 0, hOf = q => clamp(q[4] * WALL_K, 5, WALL_MAX) * smooth(6, 16, q[4]);
  // the face: between the lip and its foot (below the lip on a retaining wall, above it on a cutting), where it shows
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], vis = up ? -(a[3] + b[3]) / 2 : (a[3] + b[3]) / 2; if (vis < 0.08) continue;
    const ha = hOf(a) * (up ? -1 : 1), hb = hOf(b) * (up ? -1 : 1), nx = up ? -a[2] : a[2], ny = up ? -a[3] : a[3];   // the face's normal
    const lit = nx * LX + ny * LY, base = up ? [150, 136, 118] : [196, 190, 178], k = 0.86 + 0.24 * lit;
    poly(g, [[a[0], a[1]], [b[0], b[1]], [b[0], b[1] + hb], [a[0], a[1] + ha]]);
    g.fillStyle = `rgb(${base.map(v => Math.round(clamp(v * k, 0, 255))).join(',')})`; g.fill();
  }
  // its texture: courses of stone on a retaining wall, strata on a cutting; a dark line at the foot
  g.lineWidth = 1.2; g.strokeStyle = up ? 'rgba(50,44,38,0.4)' : 'rgba(60,56,50,0.42)';
  for (const f of up ? [0.3, 0.62] : [0.2, 0.4, 0.6, 0.8]) { g.beginPath(); let on = false; for (const q of P) { const vis = up ? -q[3] : q[3], y = q[1] + hOf(q) * f * (up ? -1 : 1); if (vis < 0.08) { on = false; continue; } on ? g.lineTo(q[0], y) : g.moveTo(q[0], y); on = true; } g.stroke(); }
  if (!up && D > 0.5) { g.beginPath(); for (let i = 0; i < P.length; i += 3) { const q = P[i]; if (q[3] < 0.08) continue; const h = hOf(q), o = (i % 6) / 6; g.moveTo(q[0], q[1] + h * (o < 0.5 ? 0 : 0.33)); g.lineTo(q[0], q[1] + h * (o < 0.5 ? 0.33 : 0.66)); } g.stroke(); }
  g.strokeStyle = 'rgba(20,18,16,0.45)'; g.lineWidth = 2; g.beginPath(); let on = false;
  for (const q of P) { const vis = up ? -q[3] : q[3]; if (vis < 0.08) { on = false; continue; } const y = q[1] + hOf(q) * (up ? -1 : 1); on ? g.lineTo(q[0], y) : g.moveTo(q[0], y); on = true; }
  g.stroke();
  if (!up) {
    // the retaining wall's shadow, cast down and to the right off its foot; then the guard rail along its lip
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], ha = Math.max(0, a[3]) * hOf(a), hb = Math.max(0, b[3]) * hOf(b), sa = hOf(a) * 0.7, sb = hOf(b) * 0.7;
      poly(g, [[a[0], a[1] + ha], [b[0], b[1] + hb], [b[0] + sb * 0.8, b[1] + hb + sb * 0.6], [a[0] + sa * 0.8, a[1] + ha + sa * 0.6]]); g.fillStyle = 'rgba(10,14,20,0.2)'; g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 3.4; g.beginPath(); P.forEach(([x, y], i) => i ? g.lineTo(x + 1.5, y + 2) : g.moveTo(x + 1.5, y + 2)); g.stroke();
    g.strokeStyle = '#eceef0'; g.lineWidth = 2.4; g.beginPath(); P.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
    if (D > 0.5) { g.fillStyle = '#5a5e66'; for (let i = 0; i < P.length; i += 4) { const [x, y] = P[i]; g.fillRect(x - 1.5, y - 1.5, 3, 3); } }
  } else {
    // a cutting's top edge: grass or snow overhanging it, catching the light
    g.strokeStyle = 'rgba(240,236,220,0.5)'; g.lineWidth = 2; g.beginPath(); let o2 = false;
    for (const q of P) { const vis = -q[3]; if (vis < 0.08) { o2 = false; continue; } const y = q[1] - hOf(q) - 1; o2 ? g.lineTo(q[0], y) : g.moveTo(q[0], y); o2 = true; }
    g.stroke();
  }
}
// the road tilted by its grade, lit top left: climbing up the screen is shaded, descending lit. Strips batched by shade.
function slopeMarks(g, T) {
  const routes = T.routes || [T], hi = (T.mech && T.mech.elev && T.mech.elev.hi) || 1;
  const lift = new Map();
  for (const R of routes) {
    const E = R.mech.elev, cl = R.mech.cliffs[0];
    for (let i = 0; i + 4 < R.N; i += 4) {   // higher: a touch brighter (more sun, less haze)
      const k = Math.round(E.h[i] / hi * 24); if (!k) continue; let P = lift.get(k); if (!P) lift.set(k, P = new Path2D());
      const a = R.pts[i], b = R.pts[i + 4], ta = R.tan[i], tb = R.tan[i + 4], ha = R.hw[i] - 1, hb = R.hw[i + 4] - 1;
      P.moveTo(a[0] - ta[1] * ha, a[1] + ta[0] * ha); P.lineTo(b[0] - tb[1] * hb, b[1] + tb[0] * hb); P.lineTo(b[0] + tb[1] * hb, b[1] - tb[0] * hb); P.lineTo(a[0] + ta[1] * ha, a[1] - ta[0] * ha); P.closePath();
    }
    // chevrons pointing uphill on steep stretches, closer together the steeper
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    for (let s = 0; s < R.L - 40;) {
      const i = Math.floor(s / STEP), gr = E.gr[i]; if (cl && s > cl.sLip - 200 && s < cl.sFlat + 40) { s += 40; continue; }
      if (Math.abs(gr) < 0.075) { s += 30; continue; }
      const q = trackSample(R, s), up = gr > 0 ? 1 : -1, ux = q.tx * up, uy = q.ty * up, w = q.hw * 0.32, d = 12;
      g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(q.x - ux * d + q.nx * w, q.y - uy * d + q.ny * w); g.lineTo(q.x + ux * d, q.y + uy * d); g.lineTo(q.x - ux * d - q.nx * w, q.y - uy * d - q.ny * w); g.stroke();
      s += clamp(150 - (Math.abs(gr) - 0.075) * 900, 70, 150);
    }
    // rumble strips along both edges, bunching up as it steepens
    g.fillStyle = 'rgba(255,255,255,0.32)';
    for (let s = 0; s < R.L - 20;) {
      const i = Math.floor(s / STEP), gr = Math.abs(E.gr[i]); if (gr < 0.06 || (cl && s > cl.sLip - 200 && s < cl.sFlat + 40)) { s += 20; continue; }
      const q = trackSample(R, s);
      for (const sd of [-1, 1]) { const o = sd * (q.hw - 10), x = q.x + q.nx * o, y = q.y + q.ny * o; g.save(); g.translate(x, y); g.rotate(Math.atan2(q.ty, q.tx)); g.fillRect(-2, -6, 4, 12); g.restore(); }
      s += clamp(46 - (gr - 0.06) * 260, 16, 46);
    }
    // a bright band across where a climb tops out (the grade turning from up to level or down)
    for (let i = 60; i + 60 < R.N; i += 10) {
      if (!(E.gr[i - 40] > 0.06 && E.gr[i + 40] < 0.02 && E.gr[i] > -0.01 && E.gr[i] < 0.03)) continue;
      const q = trackSample(R, i * STEP), a = Math.atan2(q.ty, q.tx);
      g.save(); g.translate(q.x, q.y); g.rotate(a); g.fillStyle = linear(g, -40, 0, 40, 0, [[0, 'rgba(255,250,235,0)'], [0.5, 'rgba(255,250,235,0.22)'], [1, 'rgba(255,250,235,0)']]); g.fillRect(-40, -q.hw, 80, q.hw * 2); g.restore();
      i += 60;
    }
    g.restore();
  }
  for (const [k, P] of lift) { g.fillStyle = `rgba(255,252,240,${k / 24 * 0.12})`; g.fill(P); }
}
function roadTilt(g, T) {
  const buckets = new Map();
  for (const R of T.routes || [T]) {
    const E = R.mech.elev;
    for (let i = 0; i + 4 < R.N; i += 4) {
      const t = R.tan[i], d = E.gr[i] * (t[0] * 0.7 + t[1] * 0.7), k = Math.round(clamp(d * 3.2, -0.24, 0.24) * 100); if (!k) continue;
      let P = buckets.get(k); if (!P) buckets.set(k, P = new Path2D());
      const a = R.pts[i], b = R.pts[i + 4], ta = R.tan[i], tb = R.tan[i + 4], ha = R.hw[i] - 1, hb = R.hw[i + 4] - 1;
      P.moveTo(a[0] - ta[1] * ha, a[1] + ta[0] * ha); P.lineTo(b[0] - tb[1] * hb, b[1] + tb[0] * hb); P.lineTo(b[0] + tb[1] * hb, b[1] - tb[0] * hb); P.lineTo(a[0] + ta[1] * ha, a[1] - ta[0] * ha); P.closePath();
    }
  }
  for (const [k, P] of buckets) { g.fillStyle = k > 0 ? `rgba(255,248,230,${k / 100 * 0.7})` : `rgba(10,16,34,${-k / 100})`; g.fill(P); }
  const haze = new Map();
  for (const R of T.routes || [T]) {
    const E = R.mech.elev;
    for (let i = 0; i + 4 < R.N; i += 4) {
      const k = Math.round((1 - smooth(0, 240, E.h[i])) * 30); if (!k) continue;
      let P = haze.get(k); if (!P) haze.set(k, P = new Path2D());
      const a = R.pts[i], b = R.pts[i + 4], ta = R.tan[i], tb = R.tan[i + 4], ha = R.hw[i] + 16, hb = R.hw[i + 4] + 16;
      P.moveTo(a[0] - ta[1] * ha, a[1] + ta[0] * ha); P.lineTo(b[0] - tb[1] * hb, b[1] + tb[0] * hb); P.lineTo(b[0] + tb[1] * hb, b[1] - tb[0] * hb); P.lineTo(a[0] + ta[1] * ha, a[1] - ta[0] * ha); P.closePath();
    }
  }
  for (const [k, P] of haze) { g.fillStyle = `rgba(176,198,220,${k / 30 * 0.16})`; g.fill(P); }   // (the valley road, far below the summit, through the haze)
}
// where the road is on the gorge bridge (no walls there): the stream's crossings
function bridgeSpans(T) {
  const d = T.def, sc = d.scale || 1; if (!d.stream) return () => false;
  const P = d.stream.map(([x, y]) => [x * sc, y * sc]), spans = [];
  for (const R of T.routes || [T]) for (let i = 0; i < P.length - 1; i++) for (let k = 0; k <= 20; k++) {
    const x = P[i][0] + (P[i + 1][0] - P[i][0]) * k / 20, y = P[i][1] + (P[i + 1][1] - P[i][1]) * k / 20, q = projectToTrack(R, x, y, 0, R.N);
    if (Math.abs(q.lat) < R.halfW * 0.6 && !spans.some(o => o.R === R && Math.abs(o.s - q.s) < 120)) spans.push({ R, s: q.s, x, y });
  }
  T.alpineBridges = spans;
  return (R, s) => spans.some(o => o.R === R && Math.abs(o.s - s) < 70);
}
// the stone bridge where the stream crosses the road: gorge shadow, parapets
function gorgeBridge(g, T) {
  for (const b of T.alpineBridges || []) {
    if (b.R !== (T.routes ? T.routes[0] : T) && T.alpineBridges.some(o => o !== b && Math.hypot(o.x - b.x, o.y - b.y) < 60)) continue;
    const q = trackSample(b.R, b.s), a = Math.atan2(q.ty, q.tx), hw = q.hw;
    g.save(); g.translate(q.x, q.y); g.rotate(a);
    for (const sd of [-1, 1]) {
      g.fillStyle = 'rgba(15,20,30,0.45)'; g.fillRect(-46, sd * (hw + 8) - (sd < 0 ? 28 : 0), 92, 28);   // the gorge, dark below
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-58 + 2, sd * (hw + 4) - 5 + 3, 116, 11);
      g.fillStyle = linear(g, 0, sd * (hw + 4) - 5, 0, sd * (hw + 4) + 6, [[0, '#d6cfc2'], [1, '#9c9384']]); g.fillRect(-58, sd * (hw + 4) - 5, 116, 11);
      g.strokeStyle = 'rgba(60,50,40,0.45)'; g.lineWidth = 1; for (let x = -58; x < 58; x += 14) { g.beginPath(); g.moveTo(x, sd * (hw + 4) - 5); g.lineTo(x, sd * (hw + 4) + 6); g.stroke(); }
    }
    g.restore();
  }
}
// warning signs at steep descents and climbs: red triangle with a slope drawn on it (no words), right-hand verge
function gradeSigns(g, T) {
  const routes = T.routes || [T];
  for (const R of routes) {
    const E = R.mech.elev; let last = -1e9;
    for (let i = 0; i < R.N; i += 10) {
      const s = i * STEP; if (s - last < 900 || (R !== routes[0] && (!R.split || s < R.split.a || s > R.split.b))) continue;   // (another route: only its own stretch)
      const ahead = (E.h[Math.min(R.N - 1, i + 150)] - E.h[i]) / 300;   // the grade over the next 300
      if (Math.abs(ahead) < 0.09) continue;
      last = s; const q = trackSample(R, s), o = q.hw + 30, x = q.x - q.nx * o, y = q.y - q.ny * o;
      g.fillStyle = 'rgba(0,0,0,0.25)'; poly(g, [[x + 3, y - 10], [x + 16, y + 13], [x - 10, y + 13]]); g.fill();
      poly(g, [[x, y - 14], [x + 13, y + 9], [x - 13, y + 9]]); g.fillStyle = '#d8342c'; g.fill();
      poly(g, [[x, y - 8], [x + 8, y + 6], [x - 8, y + 6]]); g.fillStyle = '#ffffff'; g.fill();
      poly(g, [[x - 6, y + 5], [x + 6, y + 5], ahead < 0 ? [x - 6, y - 2] : [x + 6, y - 2]]); g.fillStyle = '#26282d'; g.fill();
    }
  }
}

// ---------------------------------------------------------------- the Cliff
// lip to face foot: the kicker (track.js drawRamp), the rock face under the flight, scree; then the landing slope marked
// like a ski jump (blue lines, green zone, red line where the flat begins: land past it and you crash)
function cliffArt(g, T, R, z, A, drawRamp) {
  const rng = mulberry(Math.round(z.sLip) + 7), W = s => trackSample(R, s).hw + 24;
  const at = (s, o) => { const q = trackSample(R, s); return [q.x + q.nx * o, q.y + q.ny * o]; };
  const band = (s0, s1, o0, o1, step = 8) => { const L = [], Rr = []; for (let s = s0; s <= s1 + 0.1; s += step) { L.push(at(s, typeof o0 === 'function' ? o0(s) : o0)); Rr.push(at(s, typeof o1 === 'function' ? o1(s) : o1)); } return [...L, ...Rr.reverse()]; };
  const s0 = z.sLip, s1 = z.sLand, len = s1 - s0, q0 = trackSample(R, s0), q1 = trackSample(R, s1);
  // the face: covers the road and its verges, rock from the lip's cornice down to the scree
  const face = band(s0, s1, s => -W(s) - 10, s => W(s) + 10);
  poly(g, face); g.fillStyle = linear(g, q0.x, q0.y, q1.x, q1.y, [[0, '#7c7670'], [0.12, '#5f5a56'], [0.5, '#7b746c'], [0.85, '#a39a8c'], [1, '#b3aa9b']]); g.fill();
  g.save(); poly(g, face); g.clip();
  // strata across the face (contour-like ledges), darker under each one
  for (let k = 0; k < 18; k++) {
    const s = s0 + len * (0.06 + 0.9 * k / 18) + (rng() - 0.5) * 20, wob = rng() * TAU;
    const P = []; for (let o = -W(s) - 20; o <= W(s) + 20; o += 12) P.push(at(s + Math.sin(o / 30 + wob) * 8, o));
    g.strokeStyle = 'rgba(30,26,24,0.4)'; g.lineWidth = 2.2; g.beginPath(); P.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
    g.strokeStyle = 'rgba(220,214,204,0.3)'; g.lineWidth = 1.2; g.beginPath(); P.forEach(([x, y], i) => i ? g.lineTo(x - 1.5, y - 1.5) : g.moveTo(x - 1.5, y - 1.5)); g.stroke();
  }
  // boulders and scree, more toward the foot
  for (let k = 0; k < 70; k++) {
    const f = Math.sqrt(rng()), s = s0 + len * (0.15 + 0.85 * f), o = (rng() * 2 - 1) * W(s), [x, y] = at(s, o), r = 3 + rng() * (4 + f * 7);
    ell(g, x + r * 0.4, y + r * 0.5, r, r * 0.75); g.fillStyle = 'rgba(20,18,16,0.3)'; g.fill();
    ell(g, x, y, r, r * 0.8, rng() * 3); g.fillStyle = rng() < 0.5 ? '#8d857b' : '#b4ab9e'; g.fill();
    ell(g, x - r * 0.25, y - r * 0.3, r * 0.45, r * 0.3); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fill();
  }
  for (let k = 0; k < 6; k++) { const s = s0 + len * (0.3 + rng() * 0.5), [x, y] = at(s, (rng() < 0.5 ? -1 : 1) * W(s) * (0.6 + rng() * 0.4)); pineTop(g, x, y, 9 + rng() * 4, false, rng); }
  if (z.torrent) torrent(g, T);   // the torrent runs down the foot of the face, right under the flight (the ground's river, again over the face)
  g.restore();
  // height reads as up the screen, so the drop under the lip shows as a rock wall hanging below its edge, as tall as the drop
  { const hTop = elevAt(R, s0), hFoot = elevAt(R, s0 + Math.min(len * 0.25, 160)), FH = clamp((hTop - hFoot) * 0.9, 30, 110), o0 = -W(s0) - 170, o1 = W(s0) + 170;
    const top = []; for (let o = o0; o <= o1; o += 6) { const e = Math.abs(o) - W(s0), [x, y] = at(s0 + 2 - Math.max(0, e) * 0.25, o); top.push([x, y - (e > 0 ? (hash(o, 3) - 0.5) * 8 : 0)]); }   // (the lip runs on across the mountain, ragged past the road)
    const wall = [...top, ...top.slice().reverse().map(([x, y]) => [x, y + FH])];
    g.save(); poly(g, wall); g.clip();
    const [tx, ty] = at(s0, 0); g.fillStyle = linear(g, tx, ty, tx, ty + FH, [[0, '#8a837c'], [0.3, '#6b645e'], [1, '#3e3a37']]); g.fillRect(tx - 400, ty - 400, 800, 800 + FH);
    g.lineCap = 'round';
    for (let k = 0; k < 40; k++) { const [x, y] = top[Math.floor(rng() * top.length)], l = FH * (0.4 + rng() * 0.6); g.strokeStyle = rng() < 0.5 ? 'rgba(20,16,14,0.35)' : 'rgba(210,204,196,0.22)'; g.lineWidth = 1.5 + rng() * 3; g.beginPath(); g.moveTo(x, y + 2); g.lineTo(x + (rng() - 0.5) * 6, y + l); g.stroke(); }
    for (const f of [0.28, 0.55, 0.8]) { g.strokeStyle = 'rgba(20,16,14,0.3)'; g.lineWidth = 2; g.beginPath(); top.forEach(([x, y], i) => { const yy = y + FH * f + Math.sin(i * 0.9) * 2; i ? g.lineTo(x, yy) : g.moveTo(x, yy); }); g.stroke(); }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.beginPath(); top.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();   // the lip, catching the light
    poly(g, top.map(([x, y]) => [x + FH * 0.5, y + FH * 1.25]).concat(top.slice().reverse().map(([x, y]) => [x, y + FH]))); g.fillStyle = 'rgba(10,8,12,0.28)'; g.fill();
    if (z.torrent && z.torrent.iFoot) cliffFalls(g, T, z.torrent, top, FH); }
  // the lip: a snow cornice along the edge either side of the kicker
  for (const sd of [-1, 1]) { const P = band(s0 - 6, s0 + 10, sd * (q0.hw + 2), sd * W(s0) * 1.2, 4); poly(g, P); g.fillStyle = '#f2f6fa'; g.fill(); }
  drawRamp(g, R, A, { s: s0, len: 124, H: 26, cannon: true, moon: false });
  // the landing slope: the green zone, blue lines across it, the red line at its end, boards along the sides
  const sL = z.sLand, sF = z.sFlat;
  poly(g, band(sL, sF, s => -trackSample(R, s).hw + 4, s => trackSample(R, s).hw - 4)); g.fillStyle = 'rgba(80,200,120,0.16)'; g.fill();
  for (let s = sL + 4, k = 0; s < sF - 6; s += 26, k++) { poly(g, band(s, s + 4, s => -trackSample(R, s).hw + 8, s => trackSample(R, s).hw - 8, 2)); g.fillStyle = alpha(k % 2 ? '#2f6fd0' : '#4a8ee8', 0.75); g.fill(); }
  poly(g, band(sF - 6, sF + 2, s => -trackSample(R, s).hw + 2, s => trackSample(R, s).hw - 2, 2)); g.fillStyle = '#e02a2a'; g.fill();
  poly(g, band(sL - 4, sL + 2, s => -trackSample(R, s).hw + 2, s => trackSample(R, s).hw - 2, 2)); g.fillStyle = '#f2c94c'; g.fill();
  for (let s = sL - 40; s < sF + 60; s += 34) for (const sd of [-1, 1]) {   // boards: yellow before the slope, green on it, red past it
    const [x, y] = at(s, sd * (trackSample(R, s).hw + 22)), col = s < sL ? '#f2c94c' : s > sF ? '#e02a2a' : '#3fbf6a';
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 4 + 2, y - 7 + 3, 8, 14);
    g.fillStyle = col; g.fillRect(x - 4, y - 7, 8, 14); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(x - 4, y - 7, 8, 3);
  }
}

// The torrent's waterfall (a river with a head): the stream pours over the cliff's wall beside the kicker, a curtain
// FH down the screen from `top` (as cliffArt draws it), whitening as it falls, spray at the plunge pool. Stored on
// V.curtain for the animation.
function cliffFalls(g, T, R, top, FH) {
  const V = riverOf(T, R); if (!V || V.falls < 0) return;
  const rng = mulberry(V.n * 7 + 3), s = V.S[V.falls];
  const yAt = x => { for (let i = 1; i < top.length; i++) { const [ax, ay] = top[i - 1], [bx, by] = top[i]; if ((ax - x) * (bx - x) <= 0 && ax !== bx) return ay + (by - ay) * (x - ax) / (bx - ax); } return s.y; };
  // the lip: where the stream's banks cross the wall's edge
  const hw = s.w * 0.5, xa = s.x + s.nx * hw, xb = s.x - s.nx * hw, x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), L = [], N = 14;
  for (let k = 0; k <= N; k++) { const x = x0 + (x1 - x0) * k / N; L.push([x, yAt(x)]); }
  const curtain = [...L, ...L.slice().reverse().map(([x, y]) => [x, y + FH])];
  // the wet rock either side of it, darker
  poly(g, [[x0 - 5, yAt(x0 - 5)], ...L, [x1 + 5, yAt(x1 + 5)], [x1 + 9, yAt(x1 + 5) + FH], [x0 - 9, yAt(x0 - 5) + FH]]); g.fillStyle = 'rgba(20,30,36,0.35)'; g.fill();
  // the water: teal where it pours off the lip, paling to white as it falls and breaks up
  const [cx, cy] = L[N >> 1];
  poly(g, curtain); g.fillStyle = linear(g, cx, cy, cx, cy + FH, [[0, '#3ea2bb'], [0.18, '#86d6cf'], [0.5, 'rgba(214,240,246,0.97)'], [1, 'rgba(255,255,255,0.98)']]); g.fill();
  g.save(); poly(g, curtain); g.clip();
  for (let k = 0; k < 26; k++) {   // streaks down it, some white, some the deeper water showing through
    const f = rng(), x = x0 + (x1 - x0) * f, y = yAt(x), l = FH * (0.5 + rng() * 0.6), y0 = y + rng() * FH * 0.3;
    g.strokeStyle = k % 3 ? `rgba(255,255,255,${0.5 + rng() * 0.4})` : 'rgba(60,150,180,0.4)'; g.lineWidth = 1.2 + rng() * 2.2;
    g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (rng() - 0.5) * 3, y0 + l); g.stroke();
  }
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2.5; poly(g, L, false); g.stroke();   // the smooth glassy edge where it tips over
  // the foot: white water boiling up out of the plunge pool, lapping out over the river below
  for (let k = 0; k < 18; k++) { const f = rng(), x = x0 + (x1 - x0) * f + (rng() - 0.5) * 10, y = yAt(x0 + (x1 - x0) * f) + FH + rng() * 14 - 4, r = 5 + rng() * 9;
    ell(g, x, y, r, r * 0.7); g.fillStyle = `rgba(255,255,255,${0.6 + rng() * 0.35})`; g.fill(); }
  V.curtain = { L, FH, x0, x1 };
}

// ---------------------------------------------------------------- landmarks
// the observatory on the summit (`observatory`), the cable car's two stations and its pylons (`cable`, valley to summit)
function landmarks(g, T, D) {
  const d = T.def, sc = d.scale || 1;
  if (d.observatory) observatory(g, d.observatory[0] * sc, d.observatory[1] * sc);
  if (d.cable) {
    const [[ax, ay], [bx, by]] = d.cable.map(([x, y]) => [x * sc, y * sc]), L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L;
    for (let f = 380; f < L - 300; f += 420) pylon(g, ax + ux * f, ay + uy * f, Math.atan2(uy, ux));
    station(g, ax, ay, Math.atan2(uy, ux), false); station(g, bx, by, Math.atan2(uy, ux), true);
  }
}
function observatory(g, x, y) {
  // the rock platform it stands on, the building, the white dome with its slit, a radio mast
  ell(g, x + 14, y + 18, 120, 84); g.fillStyle = 'rgba(30,40,60,0.18)'; g.fill();
  ell(g, x, y, 112, 78); g.fillStyle = '#cfd3d8'; g.fill(); ell(g, x - 6, y - 6, 100, 68); g.fillStyle = '#e8ecf1'; g.fill();
  g.fillStyle = 'rgba(30,40,60,0.28)'; g.fillRect(x - 70 + 10, y + 10 + 12, 110, 46);
  g.fillStyle = linear(g, 0, y + 10, 0, y + 56, [[0, '#f2efe8'], [1, '#c9c2b6']]); g.fillRect(x - 70, y + 10, 110, 46);
  g.fillStyle = '#8f3b2e'; g.fillRect(x - 74, y + 6, 118, 8);
  for (let k = 0; k < 5; k++) { g.fillStyle = '#5c7894'; g.fillRect(x - 60 + k * 20, y + 26, 10, 12); }
  circ(g, x + 16, y + 12, 52); g.fillStyle = 'rgba(30,40,60,0.3)'; g.fill();
  circ(g, x + 4, y - 2, 50); g.fillStyle = radial(g, x - 14, y - 22, 6, x + 4, y - 2, 52, [[0, '#ffffff'], [0.6, '#dfe5ec'], [1, '#a8b3c0']]); g.fill();
  g.save(); g.translate(x + 4, y - 2); g.rotate(-0.6); g.fillStyle = '#2a3140'; g.fillRect(-7, -50, 14, 50); g.fillStyle = 'rgba(120,170,255,0.5)'; g.fillRect(-4, -46, 8, 40); g.restore();
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; circ(g, x + 4, y - 2, 50); g.stroke();
  g.strokeStyle = '#6b7380'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + 70, y + 30); g.lineTo(x + 70, y - 40); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.moveTo(x + 72, y + 32); g.lineTo(x + 110, y + 70); g.stroke();
  circ(g, x + 70, y - 42, 4); g.fillStyle = '#e02a2a'; g.fill();
}
function pylon(g, x, y, a) {
  g.save(); g.translate(x, y);
  g.strokeStyle = 'rgba(20,24,30,0.22)'; g.lineWidth = 6; g.beginPath(); g.moveTo(0, 0); g.lineTo(60, 80); g.stroke();   // its shadow, long, down-right
  g.rotate(a); g.fillStyle = '#7d848e'; g.fillRect(-7, -7, 14, 14); g.strokeStyle = '#4b5059'; g.lineWidth = 1.4; g.strokeRect(-7, -7, 14, 14);
  g.beginPath(); g.moveTo(-7, -7); g.lineTo(7, 7); g.moveTo(7, -7); g.lineTo(-7, 7); g.stroke();
  g.fillStyle = '#c9cdd3'; g.fillRect(-3, -22, 6, 44);   // the crossarm carrying both cables
  g.restore();
}
function station(g, x, y, a, top) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = 'rgba(20,24,30,0.28)'; g.fillRect(-40 + 10, -34 + 14, 80, 68);
  g.fillStyle = top ? '#e7e9ec' : '#d8cdb8'; g.fillRect(-40, -34, 80, 68);
  g.fillStyle = top ? '#8f3b2e' : '#6b4a2c'; g.fillRect(-44, -38, 88, 14); g.fillRect(-44, 24, 88, 14);
  g.fillStyle = '#3d4450'; g.fillRect(-20, -22, 50, 44); g.fillStyle = '#d8342c'; g.fillRect(-14, -14, 26, 28);
  g.restore();
}

// ---------------------------------------------------------------- props (art/props.js drawProp, kind 'alpine')
// by height (Hof): meadow trees, hay and cows low, pine clumps on the slopes, boulders and snowy rocks up high
export function alpineProp(g, d, shadowPass, Hof, rock) {
  const { x, y, r, v } = d, rng = mulberry(Math.floor(v * 1e6) + 11), h = Hof ? Hof(x, y) : 0;
  const shadow = (rx, ry) => { ell(g, x + rx * 0.4, y + ry * 0.55, rx, ry); g.fillStyle = 'rgba(14,18,28,0.24)'; g.fill(); };
  if (h > SNOW - 30) { if (shadowPass) return shadow(r * 0.75, r * 0.55); return rock(g, x, y, r * 0.75, '#8a8f97', rng, true); }
  if (h > 60) {
    if (v < 0.75) { if (shadowPass) return shadow(r * 1.1, r * 0.85); for (let k = 0; k < 3; k++) pineTop(g, x + (k - 1) * r * 0.55, y + ((k * 7) % 3 - 1) * r * 0.4, r * (0.55 + 0.1 * k), h > SNOW - 60, rng); return; }
    if (shadowPass) return shadow(r * 0.7, r * 0.5); return rock(g, x, y, r * 0.7, '#9a948c', rng, false);
  }
  if (v < 0.4) { if (shadowPass) return shadow(r * 0.9, r * 0.7); circ(g, x, y, r * 0.8); g.fillStyle = '#3f7a35'; g.fill(); circ(g, x - r * 0.15, y - r * 0.18, r * 0.6); g.fillStyle = '#5c9a45'; g.fill(); circ(g, x - r * 0.3, y - r * 0.32, r * 0.3); g.fillStyle = '#7fb85e'; g.fill(); return; }
  if (v < 0.7) {   // round hay bales
    if (shadowPass) return shadow(r * 0.8, r * 0.5);
    for (let k = 0; k < 3; k++) { const bx = x + (k - 1) * r * 0.55, by = y + (k % 2) * r * 0.3; circ(g, bx, by, r * 0.3); g.fillStyle = '#c9a85c'; g.fill(); circ(g, bx - r * 0.06, by - r * 0.06, r * 0.18); g.fillStyle = '#e2c47c'; g.fill(); }
    return;
  }
  // a cow from above: a white body with black patches, a head with horns
  if (shadowPass) return shadow(r * 0.6, r * 0.35);
  const a = v * 40;
  g.save(); g.translate(x, y); g.rotate(a);
  ell(g, 0, 0, r * 0.55, r * 0.3); g.fillStyle = '#f4f2ec'; g.fill();
  ell(g, -r * 0.15, -r * 0.05, r * 0.18, r * 0.12, 0.4); g.fillStyle = '#2a2a2e'; g.fill(); ell(g, r * 0.22, r * 0.1, r * 0.12, r * 0.08); g.fill();
  ell(g, r * 0.62, 0, r * 0.16, r * 0.13); g.fillStyle = '#e8e2d8'; g.fill();
  g.strokeStyle = '#d9cfa8'; g.lineWidth = 2; g.beginPath(); g.moveTo(r * 0.66, -r * 0.12); g.lineTo(r * 0.7, -r * 0.24); g.moveTo(r * 0.66, r * 0.12); g.lineTo(r * 0.7, r * 0.24); g.stroke();
  g.restore();
}
// a landmark in a clearing (art/props.js drawLandmark, kind 'alpine'): a mountain hut with its terrace, or a farmhouse
export function alpineLandmark(g, c, i) {
  const { x, y } = c, w = 110, hgt = 74;
  g.save(); g.translate(x, y);
  g.fillStyle = 'rgba(20,24,30,0.25)'; g.fillRect(-w / 2 + 14, -hgt / 2 + 18, w, hgt);
  // the roof: two pitches, the one facing the sun lighter, a ridge beam, snow on top up high
  poly(g, [[-w / 2, -hgt / 2], [w / 2, -hgt / 2], [w / 2, 0], [-w / 2, 0]]); g.fillStyle = i ? '#9a5a3a' : '#7a4a30'; g.fill();
  poly(g, [[-w / 2, 0], [w / 2, 0], [w / 2, hgt / 2], [-w / 2, hgt / 2]]); g.fillStyle = i ? '#7b432a' : '#5e3622'; g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.2; for (let k = -w / 2 + 8; k < w / 2; k += 10) { g.beginPath(); g.moveTo(k, -hgt / 2); g.lineTo(k, hgt / 2); g.stroke(); }
  g.fillStyle = '#4a2c1a'; g.fillRect(-w / 2, -2, w, 4);
  g.fillStyle = '#d9d2c4'; g.fillRect(w / 2 - 22, -hgt / 2 - 6, 12, 12);   // the chimney
  if (!i) {   // the terrace: tables with red parasols, and a flag
    for (let k = 0; k < 3; k++) { const px = -w / 2 + 20 + k * 34, py = hgt / 2 + 26; circ(g, px + 4, py + 5, 12); g.fillStyle = 'rgba(0,0,0,0.2)'; g.fill(); circ(g, px, py, 12); g.fillStyle = k % 2 ? '#ffffff' : '#d8342c'; g.fill(); }
    g.strokeStyle = '#6b7380'; g.lineWidth = 2; g.beginPath(); g.moveTo(-w / 2 - 14, hgt / 2 + 10); g.lineTo(-w / 2 - 14, -hgt / 2); g.stroke();
    g.fillStyle = '#d8342c'; g.fillRect(-w / 2 - 14, -hgt / 2, 22, 14); g.fillStyle = '#ffffff'; g.fillRect(-w / 2 - 6, -hgt / 2 + 3, 6, 8); g.fillRect(-w / 2 - 9, -hgt / 2 + 5, 12, 4);
  }
  g.restore();
}

// ---------------------------------------------------------------- animated
// under the karts: the waterfall's spray drifting off it
export function alpineUnder(ctx, race) {
  const d = race.track.def, sc = d.scale || 1, t = race.time;
  const TR = torrentOf(race.track);
  if (TR) {
    riverFlow(ctx, race, t);   // the torrent's water running
    for (const c of race.cars) if (c.sweptT > 0 && sweptPose(c, t).water) {   // its wake: rings spreading on the water round it
      for (let k = 0; k < 3; k++) { const ph = (t * 1.2 + k / 3) % 1; ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - ph)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(c.x, c.y, c.L * (0.5 + ph * 0.6), c.W * (0.7 + ph * 0.8), c.heading, 0, TAU); ctx.stroke(); }
    }
  }
  // gravel kicked up behind a kart grinding up a climb on the gas
  for (const c of race.cars) {
    if (!c.gas || c.air > 0 || c.off || c.speed < 40) continue;
    const gr = gradeAt(c.T, c.s); if (gr < 0.05) continue;
    const k = smooth(0.05, 0.11, gr) * (1 - smooth(0.92, 1.02, c.speed / c.top)); if (k <= 0) continue;
    const hx = Math.cos(c.heading), hy = Math.sin(c.heading);
    for (let i = 0; i < 6; i++) {
      const ph = (t * 2.6 + i / 6 + c.idx * 0.13) % 1, side = (i % 2 ? 1 : -1) * (c.W * 0.32 + hash(i, c.idx) * 6), back = c.L * 0.5 + ph * 46;
      const x = c.x - hx * back - hy * side, y = c.y - hy * back + hx * side;
      ctx.fillStyle = `rgba(150,126,96,${0.42 * k * (1 - ph)})`; ctx.beginPath(); ctx.arc(x, y, 3 + ph * 9, 0, TAU); ctx.fill();
    }
  }
  if (d.stream && d.falls !== undefined) {
    const [fx, fy] = d.stream[d.falls].map(v => v * sc), [nx, ny] = d.stream[d.falls + 1].map(v => v * sc), a = Math.atan2(ny - fy, nx - fx), cx = fx + Math.cos(a) * 64, cy = fy + Math.sin(a) * 64;
    for (let k = 0; k < 7; k++) { const ph = (t * 0.6 + k / 7) % 1, r = 14 + ph * 40, x = cx + Math.cos(a + (k - 3) * 0.3) * ph * 50, y = cy + Math.sin(a + (k - 3) * 0.3) * ph * 50; ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - ph)})`; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    ctx.save(); ctx.translate(fx, fy); ctx.rotate(a); ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let k = 0; k < 5; k++) { const ph = (t * 1.8 + k / 5) % 1; ctx.fillRect(ph * 60, -12 + k * 5, 10, 2); }
    ctx.restore();
  }
}
// over the karts: cable car, wind round a kart flying down a slope, the Cliff's speed gauge and landing mark
export function alpineOver(ctx, race, local) {
  const T = race.track, d = T.def, sc = d.scale || 1, t = race.time;
  // banks of mist hanging on the slopes below the summit, drifting
  for (const m of mistOf(T)) {
    const x = m.x + Math.sin(t * 0.05 + m.ph) * 90, y = m.y + Math.cos(t * 0.04 + m.ph) * 30, r = m.r * (1 + 0.06 * Math.sin(t * 0.3 + m.ph));
    const gr = ctx.createRadialGradient(x, y, r * 0.15, x, y, r); gr.addColorStop(0, 'rgba(244,248,252,0.3)'); gr.addColorStop(0.6, 'rgba(236,242,250,0.14)'); gr.addColorStop(1, 'rgba(236,242,250,0)');
    ctx.fillStyle = gr; ctx.save(); ctx.translate(x, y); ctx.scale(1.6, 0.8); ctx.translate(-x, -y); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
  }
  if (d.cable) {
    const [[ax, ay], [bx, by]] = d.cable.map(([x, y]) => [x * sc, y * sc]), L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L, nx = -uy, ny = ux;
    for (const sd of [-1, 1]) {   // the two cables, each with gondolas going its way, and their shadows far down-right
      const ox = nx * sd * 16, oy = ny * sd * 16;
      ctx.strokeStyle = 'rgba(15,20,30,0.12)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax + ox + 40, ay + oy + 56); ctx.lineTo(bx + ox + 40, by + oy + 56); ctx.stroke();
      for (let k = 0; k < 4; k++) {
        const f = ((t * 0.035 * sd + k / 4) % 1 + 1) % 1, x = ax + ox + (bx - ax) * f, y = ay + oy + (by - ay) * f;
        ctx.fillStyle = 'rgba(15,20,30,0.18)'; ctx.fillRect(x + 40 - 9, y + 56 - 6, 18, 12);
      }
    }
    for (const sd of [-1, 1]) {
      const ox = nx * sd * 16, oy = ny * sd * 16;
      ctx.strokeStyle = '#3a3f48'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(ax + ox, ay + oy); ctx.lineTo(bx + ox, by + oy); ctx.stroke();
      for (let k = 0; k < 4; k++) {
        const f = ((t * 0.035 * sd + k / 4) % 1 + 1) % 1, x = ax + ox + (bx - ax) * f, y = ay + oy + (by - ay) * f;
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(uy, ux));
        ctx.fillStyle = '#d8342c'; ctx.beginPath(); ctx.roundRect(-10, -7, 20, 14, 4); ctx.fill();
        ctx.fillStyle = '#9fd4f0'; ctx.fillRect(-7, -4, 14, 8); ctx.fillStyle = '#ffffff'; ctx.fillRect(-10, -7, 20, 3);
        ctx.restore();
      }
    }
  }
  for (const c of race.cars) {
    // wind streaks: flying down a slope well over your usual top speed
    const over = c.speed / c.top - 1.04, gr = c.air > 0 ? 0 : gradeAt(c.T, c.s);
    if ((over > 0 && gr < -0.04) || (c.air > 0 && c.cliffJump)) {
      const k = c.air > 0 ? 0.8 : clamp(over * 6, 0, 1), hx = Math.cos(c.heading), hy = Math.sin(c.heading);
      ctx.save(); ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const ph = (t * 3.2 + i * 0.37 + c.idx * 0.21) % 1, side = (hash(i, c.idx) - 0.5) * 70, back = 20 + ph * 110;
        const x = c.x - hx * back - hy * side, y = c.y - hy * back + hx * side, l = 26 + 40 * k;
        ctx.strokeStyle = `rgba(240,248,255,${0.9 * k * (1 - ph)})`; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - hx * l, y - hy * l); ctx.stroke();
      }
      ctx.restore();
    }
  }
  for (const c of race.cars) if (c.air > 0 && c.cliffJump) {   // a contrail off a kart flying down the cliff, at its height
    const P = cliffPose(c, t); if (!P) continue;
    const lift = P.h * LIFT_PX, hx = Math.cos(c.heading), hy = Math.sin(c.heading), x = c.x, y = c.y - lift, nx = -hy, ny = hx;
    const len = 40 + c.speed * 0.22, w = c.W * 0.32 * (1 + 0.28 * P.h);
    const g2 = ctx.createLinearGradient(x, y, x - hx * len, y - hy * len); g2.addColorStop(0, 'rgba(255,255,255,0.5)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(x + nx * w, y + ny * w); ctx.lineTo(x - hx * len, y - hy * len); ctx.lineTo(x - nx * w, y - ny * w); ctx.closePath(); ctx.fill();
  }
  for (const c of race.cars) if (c.sweptT > 0 && sweptPose(c, t).water) {   // swept down the torrent: sitting low in the water, foam breaking over it
    const W = sweptPose(c, t), V = riverOf(race.track, riverFor(c.T.mech.cliffs[0], c));
    if (W.under > 0.05) { ctx.fillStyle = `rgba(240,252,255,${0.9 * W.under})`; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + t; ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * c.L * 0.45, c.y + Math.sin(a) * c.W * 0.6, 4 + W.under * 6, 0, TAU); ctx.fill(); } }   // under for a moment: the water closing over it, spray as it pops up
    if (V) for (const r of V.rocks) if (Math.hypot(r.x - c.x, r.y - c.y) < r.r + c.L * 0.6) { for (let k = 0; k < 6; k++) { const a = Math.atan2(c.y - r.y, c.x - r.x) + (k - 2.5) * 0.4; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(r.x + Math.cos(a) * (r.r + 8 + k % 2 * 6), r.y + Math.sin(a) * (r.r + 8), 3 + k % 3, 0, TAU); ctx.fill(); } }   // knocking off a boulder: spray
    const bob = Math.sin(t * 5 + c.idx) * 2, hx = Math.cos(c.heading), hy = Math.sin(c.heading);
    ctx.save(); ctx.translate(c.x, c.y + bob); ctx.rotate(c.heading);
    ctx.fillStyle = 'rgba(44,117,163,0.62)'; ctx.beginPath(); ctx.ellipse(-c.L * 0.12, 0, c.L * 0.62, c.W * 0.78, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(-c.L * 0.12, 0, c.L * 0.62, c.W * 0.78, 0, -1.2 + Math.sin(t * 3) * 0.3, 1.2 + Math.sin(t * 3) * 0.3); ctx.stroke();
    ctx.restore();
    for (let k = 0; k < 5; k++) { const ph = (t * 2.2 + k / 5 + c.idx * 0.3) % 1, a = k * 1.3 + t, r = c.W * 0.6 + ph * 22; ctx.fillStyle = `rgba(225,245,255,${0.8 * (1 - ph)})`; ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r - ph * 18, 2.5 + (1 - ph) * 2, 0, TAU); ctx.fill(); }
  }
  for (const h of local) cliffGauge(ctx, race, h);
}
// on the Cliff road: a gauge over the kart, red (short) | green (window) | orange (long), needle at your speed.
// In the air: a ring where you'll land.
export function cliffGauge(ctx, race, c) {
  const R = c.T, M = R.mech; if (!M || !M.cliffs.length || c.finished) return;
  const z = M.cliffs[0], ds = z.sLip - c.s, t = race.time; if (z.snow) return;   // (a ski jump has no window: art/ski.js draws its flip ring instead)
  if (c.air > 0 && c.cliffJump) {
    const x = c.x + Math.cos(c.heading) * c.speed * c.air, y = c.y + Math.sin(c.heading) * c.speed * c.air, q = projectToTrack(R, x, y, c.s + c.speed * c.air, 200);
    const col = q.s < z.sLand ? '#ff4d4d' : q.s > z.sFlat ? '#ff9a3c' : '#3fe07a', r = 22 + Math.sin(t * 10) * 2;
    ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(x + 1.5, y + 2, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fillStyle = col; ctx.fill(); ctx.restore();
    return;
  }
  if (ds < 0 || ds > 1100 || c.air > 0) return;
  const fa = clamp((1100 - ds) / 200, 0, 1) * clamp(ds / 30, 0, 1), lo = z.vLo - 90, hi = z.vHi + 90, X = v => clamp((v - lo) / (hi - lo), 0, 1);
  const w = 150, h = 16, x0 = c.x - w / 2, y0 = c.y - 112;
  ctx.save(); ctx.globalAlpha = fa;
  ctx.fillStyle = 'rgba(10,14,24,0.55)'; ctx.beginPath(); ctx.roundRect(x0 - 6, y0 - 6, w + 12, h + 12, 9); ctx.fill();
  ctx.fillStyle = '#e04646'; ctx.fillRect(x0, y0, w * X(z.vLo), h);
  ctx.fillStyle = '#3fbf6a'; ctx.fillRect(x0 + w * X(z.vLo), y0, w * (X(z.vHi) - X(z.vLo)), h);
  ctx.fillStyle = '#ff9a3c'; ctx.fillRect(x0 + w * X(z.vHi), y0, w * (1 - X(z.vHi)), h);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x0, y0, w, 4);
  const v = c.speed, nx = x0 + w * X(v), ok = cliffVerdict(z, v) === 0;
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(nx, y0 - 2); ctx.lineTo(nx - 7, y0 - 12); ctx.lineTo(nx + 7, y0 - 12); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillRect(nx - 1.5, y0, 3, h);
  if (ok) { ctx.strokeStyle = `rgba(120,255,160,${0.5 + 0.5 * Math.sin(t * 12)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x0 - 6, y0 - 6, w + 12, h + 12, 9); ctx.stroke(); }
  ctx.restore();
}

// mist banks on the mid slopes (150..330 high) near the road but not on it; once per track
const mists = new WeakMap();
function mistOf(T) {
  if (mists.has(T)) return mists.get(T);
  const { H, dRoad } = terrainOf(T), B = T.bbox, out = [], rng = mulberry(T.N * 5 + 11);
  for (let k = 0; k < 600 && out.length < 12; k++) {
    const x = B.x + rng() * B.w, y = B.y + rng() * B.h, h = H(x, y), d = dRoad(x, y);
    if (h < 150 || h > 330 || d < T.halfW + 90 || d > 420 || out.some(o => Math.hypot(o.x - x, o.y - y) < 520)) continue;
    out.push({ x, y, r: 150 + rng() * 110, ph: rng() * TAU });
  }
  mists.set(T, out); return out;
}

// a kart on a track with heights (render.js scales by these): bigger higher up (nearer you), shadow further off,
// foreshortened on a slope
export function kartHill(c) {
  const T = c.T, E = T && T.mech && T.mech.elev; if (!E) return null;
  const f = clamp(elevAt(T, c.s) / (E.hi || 1), 0, 1), gr = c.air > 0 ? 0 : gradeAt(T, c.s);
  return { k: 1 + 0.12 * f, sh: 7 * f, fs: 1 - clamp(Math.abs(gr) * 1.1, 0, 0.16), nose: 0 };
}
// the camera's zoom on a track with heights (render.js trackView): in a little on a slow climb, out flying down a slope
export function hillZoom(cars) {
  let g = 0, v = 0, n = 0;
  for (const c of cars) { if (!c.T || !c.T.mech || !c.T.mech.elev) continue; g += c.air > 0 ? -0.08 : gradeAt(c.T, c.s); v += c.speed / c.top; n++; }
  if (!n) return 1; g /= n; v /= n;
  return 1 + 0.08 * smooth(0.03, 0.1, g) * (1 - smooth(0.8, 0.98, v)) - 0.16 * smooth(1.02, 1.22, v) * smooth(0.02, 0.07, -g);
}
// wind streaks from the screen edges when a player flies down a slope well over top speed (screen space; off in
// reduced effects)
export function hillScreen(ctx, race, W, H, ox, oy, sc) {
  if (settings.reduced) return;
  for (const c of race.localHumans || race.humans) {
    if (c.finished || !c.T.mech || !c.T.mech.elev) continue;
    const over = c.speed / c.top - 1.04, gr = c.air > 0 ? -0.1 : gradeAt(c.T, c.s), F = clamp(over * 5, 0, 1) * smooth(0.03, 0.07, -gr);
    if (F <= 0.02) continue;
    const cx = ox + c.x * sc, cy = oy + c.y * sc, R = Math.hypot(W, H) * 0.75, r0 = Math.min(W, H) * 0.42, seed = Math.floor(race.time * 14), hx = Math.cos(c.heading), hy = Math.sin(c.heading);
    ctx.save(); ctx.lineCap = 'round';
    for (let k = 0; k < 40; k++) {
      const r = n => { const v = Math.sin((seed * 40 + k) * 12.9898 + n * 78.233) * 43758.5453; return v - Math.floor(v); };
      if (r(5) < 0.35) continue;
      const a = (k + r(1) * 0.9) / 40 * TAU, ca = Math.cos(a), sa = Math.sin(a), along = ca * hx + sa * hy;
      const r1 = r0 * (1.05 + r(2) * 0.5), r2 = r1 + (60 + r(3) * 120) * (1 + Math.abs(along));
      ctx.globalAlpha = (0.2 + 0.32 * r(4)) * F; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5 + r(6) * 4;
      ctx.beginPath(); ctx.moveTo(cx + ca * r1, cy + sa * r1); ctx.lineTo(cx + ca * Math.min(R, r2), cy + sa * Math.min(R, r2)); ctx.stroke();
    }
    ctx.restore();
  }
}

// a kart flying off the Cliff, as render.js poses it (jumpPose), from synced fields (air, airT, cliffV, s) so every
// screen agrees. h: height above the ground under it (RAMP_LIFT units); pitch: nose up off the kicker, down on the drop;
// roll and wob: rocking in the air.
const LIFT_PX = 48, FLY_Z = 0.8;
export function cliffPose(c, t) {
  const R = c.T, z = R && R.mech && R.mech.cliffs && R.mech.cliffs[0]; if (!z) return null;
  const v = c.cliffV || c.speed, te = Math.max(0, c.airT - c.air), u = clamp(te / (c.airT || 1), 0, 1);
  const zRel = KICK * v * te - G_FLY * te * te / 2, drop = z.hLip - elevAt(R, c.s), above = Math.max(0, zRel + drop);
  const h = Math.max(0.55 * (1 - u) * (1 - u), above * FLY_Z / LIFT_PX), vz = KICK * v - G_FLY * te, env = Math.sin(Math.PI * u);
  // the wings pop out off the kicker (with overshoot), fold before touchdown; on a short flight they flap and crumple
  const short = v < z.vLo || v > z.vHi, wk = smooth(0.04, 0.24, te) * (1 + 0.16 * Math.sin(clamp((te - 0.12) / 0.35, 0, 1) * Math.PI)) * smooth(0, 0.16, c.air) * (short ? 1 - 0.55 * smooth(0.5, 0.95, u) : 1);
  return { h, pitch: clamp(Math.atan2(vz, v) * 1.8 + 0.55 * Math.exp(-te * 3), -0.75, 0.6), roll: Math.sin(t * 5.3 + c.idx) * 0.22 * env, wob: Math.sin(t * 7.1 + c.idx * 2) * 0.05 * env, u, wing: wk > 0.01 && !z.snow ? { k: wk, flap: short ? 1 : 0 } : null, flip: z.snow ? c.flipA || 0 : 0 };   // (a ski jump: no wings, flips instead: race-cliff.js FLIP)
}

// hang-glider wings for a Cliff flight, sized to the body, sail in the car's paint, banking with the roll, vapour off
// the tips. wingShape gives the sails (render.js reuses it for the shadow); W is the pose's wing ({ k, flap }), kart frame.
export function wingShape(c, W, roll, t) {
  const B = BODIES[c.ch.body] || BODIES.kart, L = B.L, Wd = B.W, flap = W.flap ? 0.62 + 0.38 * Math.sin(t * 26 + c.idx) : 1;
  const span = (Wd * 0.3 + L * 0.82) * W.k * flap, out = [];
  for (const sd of [-1, 1]) {
    const sp = span * (1 + sd * roll * 0.55), r0 = Wd * 0.3, tipY = sd * (Wd * 0.42 + sp), droop = W.flap ? (1 - flap) * L * 0.2 : 0;
    out.push({ sd, sp, front: [L * 0.2, sd * r0], tip: [-L * 0.3 - droop, tipY], mid: [-L * 0.5, sd * (Wd * 0.42 + sp * 0.5)], back: [-L * 0.4, sd * r0] });
  }
  return out;
}
export function drawWings(ctx, c, W, roll, t, turn = 0) {   // turn: how far the kart's turned from its way of travel (a trick), for the vapour trails
  const P = CAR_PAINT[c.ch.id] || { paint: '#8c939c', stripe: '#ffffff' }, S = wingShape(c, W, roll, t);
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const w of S) {
    const { sd, front, tip, mid, back } = w, lit = 1 - sd * roll * 0.9;
    // the vapour trail off the tip
    if (!W.flap && W.k > 0.5) { const l = 30 + w.sp * 0.9, ex = tip[0] - Math.cos(turn) * l, ey = tip[1] + Math.sin(turn) * l; const gr = ctx.createLinearGradient(tip[0], tip[1], ex, ey); gr.addColorStop(0, `rgba(255,255,255,${0.6 * (W.k - 0.5) * 2})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); ctx.strokeStyle = gr; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.lineTo(ex, ey); ctx.stroke(); }
    // the sail: billowing a little between the battens (the trailing edge scalloped)
    ctx.beginPath(); ctx.moveTo(...front); ctx.lineTo(...tip);
    ctx.quadraticCurveTo((tip[0] + mid[0]) / 2 + 3, (tip[1] + mid[1]) / 2, ...mid); ctx.quadraticCurveTo((mid[0] + back[0]) / 2 + 3, (mid[1] + back[1]) / 2, ...back); ctx.closePath();
    ctx.fillStyle = linear(ctx, front[0], front[1], mid[0], mid[1], [[0, mix(P.paint, '#ffffff', 0.15 * lit)], [1, mix(P.paint, '#1a1d24', 0.22 + 0.2 * (1 - lit))]]); ctx.fill();
    ctx.strokeStyle = 'rgba(20,22,28,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    // battens from the leading edge back to the trailing edge
    ctx.strokeStyle = 'rgba(20,22,28,0.22)'; ctx.lineWidth = 0.9;
    for (const f of [0.3, 0.55, 0.8]) { const lx = front[0] + (tip[0] - front[0]) * f, ly = front[1] + (tip[1] - front[1]) * f, bx = back[0] + (mid[0] - back[0]) * f * 1.6, by = back[1] + (mid[1] - back[1]) * f * 1.6; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(f < 0.6 ? bx : (mid[0] + tip[0]) / 2 + (bx - (mid[0] + tip[0]) / 2) * (1 - f), f < 0.6 ? by : (mid[1] + tip[1]) / 2 + (by - (mid[1] + tip[1]) / 2) * (1 - f)); ctx.stroke(); }
    // the leading edge: a band of the stripe colour over the tube
    ctx.strokeStyle = P.stripe; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(...front); ctx.lineTo(...tip); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(front[0] - 0.8, front[1] - 0.8); ctx.lineTo(tip[0] - 0.8, tip[1] - 0.8); ctx.stroke();
    // the strut out from the body, a little light at the tip
    ctx.strokeStyle = '#3a3f47'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-L0(c) * 0.1, front[1]); ctx.lineTo((tip[0] + mid[0]) / 2 + 4, (tip[1] + mid[1]) / 2); ctx.stroke();
    circ(ctx, tip[0], tip[1], 1.8); ctx.fillStyle = sd < 0 ? '#ff5a4f' : '#5af27a'; ctx.fill();
  }
  ctx.restore();
}
const L0 = c => (BODIES[c.ch.body] || BODIES.kart).L;

// a kart swept down the torrent, as render.js poses it, from synced sweptT and position: splash, bobbing in the water,
// grounding in the shallows, rolling up the beach with a shake. Returns face (mascot: ko in water, dizzy ashore), shake,
// h (RAMP_LIFT units), water (in the river), under (how far under).
export function sweptPose(c, t) {
  const P = sweptPhase(c);
  if (P.k === 'splash') {   // in nose first, all the way under, then up again rocking
    const f = P.f, under = 0.95 * smooth(0, 0.12, f) * (1 - smooth(0.4, 0.75, f)), bob = smooth(0.55, 1, f);
    return { h: 0.3 * Math.max(0, 1 - f / 0.08) + 0.06 * bob * Math.max(0, Math.sin(f * 30)), pitch: -0.55 * (1 - smooth(0, 0.35, f)) + bob * Math.sin(f * 22) * 0.25, roll: bob * Math.sin(f * 17 + c.idx) * 0.35, sq: 0, water: 1, under, face: 'ko' };
  }
  if (P.k === 'whirl') return { h: 0, pitch: Math.sin(t * 5) * 0.15, roll: Math.sin(t * 6 + c.idx) * 0.3, sq: 0, water: 1, under: 0.35 * Math.sin(P.f * Math.PI), face: 'ko' };
  if (P.k === 'ride') {
    const V = riverOf(c.T, riverFor(c.T.mech.cliffs[0], c)), u0 = c.sweptU0 || 0, i = V ? clamp(Math.round((u0 + (1 - u0) * sweptU(P.f)) * (V.n - 1)), 0, V.n - 1) : 0, st = V ? V.S[i].st : 0;
    const dip = smooth(0.3, 0.6, st) * Math.max(0, Math.sin(t * 1.7 + c.idx * 3)) ** 10;
    return { h: 0.04 * Math.max(0, Math.sin(t * 4 + c.idx)), pitch: Math.sin(t * 3.3 + c.idx) * 0.22, roll: Math.sin(t * 2.7 + c.idx * 2) * 0.28, sq: 0, water: 1, under: dip, face: 'ko' };
  }
  if (P.k === 'shallow') {   // drifting in, rising out of the water as it grounds, a bump at the end
    const f = P.f, bump = smooth(0.82, 0.9, f) * (1 - smooth(0.9, 1, f));
    return { h: 0.03 * Math.max(0, Math.sin(t * 3 + c.idx)) * (1 - f) + 0.12 * bump, pitch: Math.sin(t * 2.6 + c.idx) * 0.15 * (1 - f) + 0.2 * bump, roll: Math.sin(t * 2.1 + c.idx) * 0.2 * (1 - f), sq: 0.5 * bump, water: 1 - smooth(0.7, 1, f), under: 0, face: 'dizzy' };
  }
  // ashore: rolling up the beach nose up, a side-to-side shake, the mascot dizzy then clearing its head
  const f = P.f, sh = smooth(0.62, 0.7, f) * (1 - smooth(0.84, 0.92, f));
  return { h: 0.08 * Math.max(0, Math.sin(f * Math.PI * 3)) * (1 - f), pitch: 0.18 * (1 - smooth(0, 0.5, f)), roll: sh * Math.sin(t * 46) * 0.3, sq: 0, water: 0, under: 0, face: f < 0.6 ? 'dizzy' : null, shake: smooth(0.6, 0.66, f) * (1 - smooth(0.88, 0.98, f)) };
}
