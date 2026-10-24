// Kernel Kart art: Sakura Stack's Japanese garden (theme 'sakura'), seen from above and lit from the top left (shadows
// fall down and to the right; heights go up the screen, as everywhere). DOM-free: everything takes a 2D context.
//   sakuraProp(g, d, shadowPass)      the scattered props: cherry trees, stone lanterns, maples, cloud-pruned pines, bamboo
//   sakuraLandmark(g, c, i)           the five-storey pagoda, and the raked-gravel garden
//   toriiRoofs(T)                     the torii gates over the road (render.js lays them over the cars)
//   drawbridgeStatic(g, T, z)         the koi canal and its pools, the bridge's stone sills, the bell tower
//   drawbridgeUnder(ctx, T, z, lf, t, DB)  the koi, the boat, the leaf lifting (under the cars)
//   drawbridgeOver(ctx, T, z, lf, t, DB)   the posts, their lanterns and chains (over the cars); sakuraPetals: blossom drifting
// The drawbridge's timing (race-drawbridge.js) comes in as `lf` (leafAt: the leaf's angle a, seconds u since the bell)
// and `DB` (its constants), so this file doesn't import the race.
import { TAU, clamp, lerp, mulberry } from '../core.js';
import { trackSample } from '../geometry.js';
import { circ, ell, linear, poly, radial, shade } from './paint.js';

const SHADOW = 'rgba(30,22,40,0.24)';
const shadowBlob = (g, x, y, rx, ry) => { ell(g, x + rx * 0.4, y + ry * 0.55, rx, ry); g.fillStyle = SHADOW; g.fill(); };
const VERMILION = '#d8432c', VERM_DK = '#8e2416', VERM_LT = '#f07a52', INK = '#2a2224', GOLD = '#f2c14e';
const K_UP = 0.8;   // a height h is drawn this many units up the screen per unit

// ------------------------------------------------------------------------------------------------ props
// a flowering canopy: clusters of blossom round a core, deep pink in the shade (down right), pale where the sun
// catches it (up left), a few white flecks, and petals fallen on the grass round it
function blossom(g, x, y, r, rng, cols = ['#d4658c', '#f29ab7', '#ffc9da', '#fff2f6']) {
  const [dk, md, lt, hi] = cols, n = 9, pts = [];
  for (let k = 0; k < n; k++) { const a = k / n * TAU + rng() * 0.6, d = r * (0.42 + rng() * 0.2); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.36 + rng() * 0.12)]); }
  g.fillStyle = dk; for (const [px, py, pr] of pts) { circ(g, px, py, pr); g.fill(); } circ(g, x, y, r * 0.6); g.fill();
  g.fillStyle = md; for (const [px, py, pr] of pts) { circ(g, px - pr * 0.16, py - pr * 0.2, pr * 0.8); g.fill(); } circ(g, x - r * 0.08, y - r * 0.1, r * 0.48); g.fill();
  g.fillStyle = lt; for (const [px, py, pr] of pts) if ((px - x) + (py - y) < r * 0.25) { circ(g, px - pr * 0.3, py - pr * 0.34, pr * 0.48); g.fill(); }
  g.fillStyle = hi; for (let k = 0; k < 14; k++) { const a = rng() * TAU, d = rng() * r * 0.8, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d; if ((px - x) + (py - y) < r * 0.4) { circ(g, px, py, r * (0.04 + rng() * 0.04)); g.fill(); } }
}
// a single petal: a little notched oval
function petal(g, x, y, s, a, col) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.beginPath(); g.moveTo(-s, 0); g.quadraticCurveTo(-s * 0.2, -s * 0.75, s, -s * 0.15); g.lineTo(s * 0.7, 0); g.lineTo(s, s * 0.15); g.quadraticCurveTo(-s * 0.2, s * 0.75, -s, 0);
  g.fillStyle = col; g.fill(); g.restore();
}
// a stone lantern (tōrō) from above: its hexagonal roof with upturned corners, the knob on top, and the warm light of
// the fire box spilling out under the roof
function lantern(g, x, y, r, rng) {
  const R = r * 0.62, hx = [];
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.26; hx.push([x + Math.cos(a) * R, y + Math.sin(a) * R * 0.92]); }
  g.fillStyle = radial(g, x, y + R * 0.4, 1, x, y + R * 0.4, R * 1.6, [[0, 'rgba(255,214,140,0.35)'], [1, 'rgba(255,214,140,0)']]); circ(g, x, y + R * 0.4, R * 1.6); g.fill();
  poly(g, hx.map(([px, py]) => [px + R * 0.22, py + R * 0.3])); g.fillStyle = 'rgba(30,22,40,0.3)'; g.fill();   // its shadow
  g.fillStyle = '#8a857c'; g.fillRect(x - R * 0.35, y + R * 0.2, R * 0.7, R * 0.6);                              // the fire box under the roof
  g.fillStyle = '#ffd77a'; g.fillRect(x - R * 0.2, y + R * 0.42, R * 0.4, R * 0.26);
  poly(g, hx); g.fillStyle = linear(g, x - R, y - R, x + R, y + R, [[0, '#d6d1c6'], [0.55, '#a59f94'], [1, '#77726a']]); g.fill();
  g.strokeStyle = 'rgba(70,64,58,0.45)'; g.lineWidth = 1.2; g.beginPath(); for (const [px, py] of hx) { g.moveTo(x, y); g.lineTo(px, py); } g.stroke();   // the roof's ridges
  for (const [px, py] of hx) { circ(g, px, py, R * 0.1); g.fillStyle = '#b8b2a7'; g.fill(); }                    // the curled-up corners
  circ(g, x, y, R * 0.24); g.fillStyle = '#c9c3b8'; g.fill(); circ(g, x - R * 0.06, y - R * 0.07, R * 0.12); g.fillStyle = '#ebe7df'; g.fill();   // the knob
  if (rng() < 0.6) { ell(g, x - R * 0.7, y - R * 0.5, R * 0.36, R * 0.2, -0.4); g.fillStyle = 'rgba(92,140,70,0.7)'; g.fill(); }   // moss
}
// a Japanese maple: a canopy of red and orange leaves, lit from the top left, with a few leaves fallen round it
function maple(g, x, y, r, rng) {
  blossom(g, x, y, r, rng, ['#8e2a1c', '#c9432a', '#ec7a3a', '#ffc27a']);
  g.fillStyle = 'rgba(120,30,20,0.35)'; for (let k = 0; k < 7; k++) { const a = rng() * TAU, d = rng() * r * 0.75; star(g, x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.1, 5, 0.45, a); g.fill(); }
}
function star(g, x, y, r, n, inner, rot) { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, d = i % 2 ? r * inner : r; i ? g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d) : g.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d); } g.closePath(); }
// a cloud-pruned pine (niwaki): dark pads of needles held out on bare branches
function pine(g, x, y, r, rng) {
  const pads = []; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + rng() * 0.8, d = r * (0.35 + rng() * 0.3); pads.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85, r * (0.26 + rng() * 0.1)]); }
  g.strokeStyle = '#5a4030'; g.lineWidth = r * 0.08; g.lineCap = 'round'; for (const [px, py] of pads) { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + px) / 2 + r * 0.1, (y + py) / 2 - r * 0.1, px, py); g.stroke(); }
  for (const [px, py, pr] of pads) {
    ell(g, px + pr * 0.25, py + pr * 0.35, pr * 1.05, pr * 0.8); g.fillStyle = 'rgba(20,30,20,0.28)'; g.fill();
    ell(g, px, py, pr, pr * 0.78); g.fillStyle = '#2f5a35'; g.fill();
    ell(g, px - pr * 0.18, py - pr * 0.2, pr * 0.7, pr * 0.5); g.fillStyle = '#4a7f45'; g.fill();
    ell(g, px - pr * 0.32, py - pr * 0.32, pr * 0.32, pr * 0.2); g.fillStyle = '#6fa45e'; g.fill();
  }
}
// a clump of bamboo: culm tops (rings) in a tight cluster, and narrow leaves fanning out
function bamboo(g, x, y, r, rng) {
  for (let k = 0; k < 16; k++) { const a = rng() * TAU, l = r * (0.5 + rng() * 0.5); ell(g, x + Math.cos(a) * l * 0.6, y + Math.sin(a) * l * 0.6, l * 0.42, l * 0.07, a); g.fillStyle = k % 3 ? '#6aa84f' : '#93c47d'; g.fill(); }
  for (let k = 0; k < 9; k++) { const a = rng() * TAU, d = rng() * r * 0.3, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d; circ(g, px, py, r * 0.09); g.fillStyle = '#9fbf5a'; g.fill(); circ(g, px, py, r * 0.05); g.fillStyle = '#5e7f2f'; g.fill(); }
}
export function sakuraProp(g, d, shadowPass) {
  const { x, y, r, v } = d, rng = mulberry(Math.floor(v * 1e6) + 7);
  if (v < 0.52) {   // a cherry tree in full bloom, petals fallen round it
    if (shadowPass) { shadowBlob(g, x, y, r * 1.15, r * 0.95); for (let k = 0; k < 18; k++) { const a = rng() * TAU, dd = r * (0.9 + rng() * 0.8); petal(g, x + Math.cos(a) * dd, y + Math.sin(a) * dd * 0.85, 2.6, rng() * TAU, k % 3 ? '#ffd4e2' : '#ffb3c9'); } return; }
    blossom(g, x, y, r * 1.12, rng);
  } else if (v < 0.64) { if (shadowPass) return; lantern(g, x, y, r, rng); }
  else if (v < 0.78) { if (shadowPass) { shadowBlob(g, x, y, r * 0.85, r * 0.7); for (let k = 0; k < 8; k++) { const a = rng() * TAU, dd = r * (0.8 + rng() * 0.6); star(g, x + Math.cos(a) * dd, y + Math.sin(a) * dd * 0.85, 3, 5, 0.45, a); g.fillStyle = k % 2 ? '#d2452f' : '#ef8a3a'; g.fill(); } return; } maple(g, x, y, r * 0.85, rng); }
  else if (v < 0.9) { if (shadowPass) return; pine(g, x, y, r * 0.95, rng); }
  else { if (shadowPass) return shadowBlob(g, x, y, r * 0.6, r * 0.5); bamboo(g, x, y, r * 0.85, rng); }
}

// ------------------------------------------------------------------------------------------------ landmarks
// a five-storey pagoda on its stone platform. Each storey is drawn lifted up the screen by its height: the vermilion
// wall's face under each roof, then the roof (dark tiles, hip ridges to upturned corners with little bells), smaller
// each storey, and the bronze spire with its rings on top. Its long shadow falls down and to the right.
function pagoda(g, x, y, r) {
  const S = Math.min(r * 0.42, 96), H = S * 0.07, N = 5, wallH = H * 0.6, Hs = S * 0.6;   // H: how far up the screen each storey is drawn; Hs: its real height, for the shadow
  const roofW = k => S * (1 - k * 0.17), wallW = k => roofW(k) * 0.66, lift = k => k * H;
  // the shadow: the tapering tower cast down and to the right (one union of squares, so it's one even shade), then the spire's
  g.fillStyle = 'rgba(30,22,40,0.22)'; g.beginPath();
  for (let f = 0; f <= N; f += 0.1) { const k = Math.min(N - 1, Math.floor(f)), h = f * Hs, w = roofW(k) * (f - k < 0.75 ? 0.7 : 1); g.roundRect(x - w + h * 0.5, y - w + h * 0.68, w * 2, w * 2, w * 0.25); }
  g.fill();
  g.strokeStyle = 'rgba(30,22,40,0.22)'; g.lineWidth = 5; g.lineCap = 'round'; const h0 = N * Hs, h1 = h0 + Hs * 1.6; g.beginPath(); g.moveTo(x + h0 * 0.5, y + h0 * 0.68); g.lineTo(x + h1 * 0.5, y + h1 * 0.68); g.stroke();
  // the platform: two steps of pale granite
  for (const [k, col] of [[1.22, '#b9b2a6'], [1.1, '#d6d0c4']]) { const w = S * k; g.fillStyle = col; g.beginPath(); g.roundRect(x - w, y - w, w * 2, w * 2, 6); g.fill(); }
  g.fillStyle = '#a49c90'; g.fillRect(x - S * 1.22, y + S * 1.1, S * 2.44, S * 0.12);
  for (let k = 0; k < N; k++) {
    const yb = y - lift(k), ww = wallW(k), yr = yb - wallH * K_UP;
    // the storey's wall: its south face, vermilion with white-plaster bands and a dark door
    g.fillStyle = linear(g, x - ww, 0, x + ww, 0, [[0, VERM_LT], [0.6, VERMILION], [1, VERM_DK]]); g.fillRect(x - ww, yr, ww * 2, yb - yr + ww * 0.15);
    g.fillStyle = 'rgba(255,244,230,0.85)'; g.fillRect(x - ww, yr + (yb - yr) * 0.2, ww * 2, (yb - yr) * 0.14);
    g.fillStyle = '#3b2420'; g.fillRect(x - ww * 0.22, yr + (yb - yr) * 0.42, ww * 0.44, (yb - yr) * 0.58);
    // the roof over it: a square with its edges swept in and its corners turned up
    const w = roofW(k), cy = yr - H * 0.08, c = [[x - w, cy - w], [x + w, cy - w], [x + w, cy + w], [x - w, cy + w]];
    g.save(); g.translate(5, 7); roofPath(g, c, x, cy, w); g.fillStyle = 'rgba(20,14,20,0.35)'; g.fill(); g.restore();   // its shadow on what's under it
    roofPath(g, c, x, cy, w); g.fillStyle = linear(g, x - w, cy - w, x + w, cy + w, [[0, '#7d8492'], [0.5, '#4d5360'], [1, '#2c3039']]); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1; for (let i = 1; i < 5; i++) { const f = i / 5; roofPath(g, c.map(([px, py]) => [lerp(x, px, f), lerp(cy, py, f)]), x, cy, w * f); g.stroke(); }   // rows of tiles
    g.strokeStyle = '#2a2d34'; g.lineWidth = 2.4; g.beginPath(); for (const [px, py] of c) { g.moveTo(x, cy); g.lineTo(px, py); } g.stroke();   // hip ridges
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, cy); g.lineTo(c[0][0], c[0][1]); g.stroke();
    roofPath(g, c, x, cy, w); g.strokeStyle = VERMILION; g.lineWidth = 1.6; g.stroke();   // the red bargeboards
    for (const [px, py] of c) { circ(g, px, py + 3, 2.6); g.fillStyle = GOLD; g.fill(); }   // a bell at each corner
  }
  // the spire: rings of bronze up to a jewel
  const top = y - lift(N - 1) - wallH * K_UP - H * 0.08;
  for (let k = 0; k < 9; k++) { const yy = top - k * H * 0.22, rr = S * 0.09 * (1 - k * 0.05); circ(g, x, yy, rr); g.fillStyle = k % 2 ? '#9a7a3a' : '#c9a24e'; g.fill(); }
  circ(g, x, top - 9 * H * 0.22, S * 0.08); g.fillStyle = radial(g, x - 2, top - 9 * H * 0.22 - 2, 1, x, top - 9 * H * 0.22, S * 0.08, [[0, '#fff3c4'], [1, '#d59a2a']]); g.fill();
}
// a square roof with its sides swept in towards the middle (the eaves curve up to the corners)
function roofPath(g, c, x, y, w) {
  g.beginPath(); g.moveTo(c[0][0], c[0][1]);
  for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; g.quadraticCurveTo(lerp(mx, x, 0.16), lerp(my, y, 0.16), b[0], b[1]); }
  g.closePath();
}
// a dry garden: raked gravel rings round three stones, a timber edge
function zenGarden(g, x, y, r, rng) {
  const s = r * 0.8;
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.roundRect(x - s + 6, y - s * 0.7 + 8, s * 2, s * 1.4, 10); g.fill();
  g.fillStyle = '#7a5a3a'; g.beginPath(); g.roundRect(x - s - 4, y - s * 0.7 - 4, s * 2 + 8, s * 1.4 + 8, 12); g.fill();
  g.fillStyle = '#e8e2d2'; g.beginPath(); g.roundRect(x - s, y - s * 0.7, s * 2, s * 1.4, 10); g.fill();
  g.save(); g.beginPath(); g.roundRect(x - s, y - s * 0.7, s * 2, s * 1.4, 10); g.clip();
  g.strokeStyle = 'rgba(150,140,120,0.45)'; g.lineWidth = 1.4; for (let yy = y - s * 0.7 + 6; yy < y + s * 0.7; yy += 7) { g.beginPath(); g.moveTo(x - s, yy); g.lineTo(x + s, yy); g.stroke(); }
  const stones = [[-0.4, -0.15, 0.2], [0.35, 0.2, 0.16], [0.1, -0.35, 0.1]];
  for (const [sx, sy, sr] of stones) { const px = x + sx * s, py = y + sy * s, pr = sr * s; g.fillStyle = '#e8e2d2'; circ(g, px, py, pr * 2.6); g.fill(); g.strokeStyle = 'rgba(150,140,120,0.5)'; for (let k = 1; k <= 3; k++) { circ(g, px, py, pr + k * 7); g.stroke(); } }
  g.restore();
  for (const [sx, sy, sr] of stones) stoneBlob(g, x + sx * s, y + sy * s, sr * s, rng);
}
function stoneBlob(g, x, y, r, rng, base = '#8f8a83') {
  const pts = []; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, d = r * (0.75 + rng() * 0.25); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85]); }
  ell(g, x + r * 0.3, y + r * 0.4, r, r * 0.7); g.fillStyle = 'rgba(0,0,0,0.22)'; g.fill();
  poly(g, pts); g.fillStyle = shade(base, -0.2); g.fill();
  poly(g, pts.map(([px, py]) => [x + (px - x) * 0.7 - r * 0.12, y + (py - y) * 0.65 - r * 0.15])); g.fillStyle = shade(base, 0.18); g.fill();
}
export function sakuraLandmark(g, c, i) {
  const rng = mulberry(Math.floor(c.v * 1e6));
  if (i === 0) return pagoda(g, c.x, c.y, c.r);
  zenGarden(g, c.x, c.y, c.r, rng);
}

// ------------------------------------------------------------------------------------------------ torii
// a torii over the road at each of the definition's `torii` points: two vermilion posts on black feet beside the road,
// the tie beam and the great black-capped lintel (kasagi) across the top, its ends swept up. Drawn over the cars, so you
// drive under it; its shadow falls across the road down and to the right.
const TORII_H = 74;
export function toriiRoofs(T) {
  const sc = T.def.scale, out = [];
  for (const [px, py] of T.def.torii || []) {
    let bi = 0, bd = 1e18; for (let i = 0; i < T.N; i++) { const d = (T.pts[i][0] - px * sc) ** 2 + (T.pts[i][1] - py * sc) ** 2; if (d < bd) { bd = d; bi = i; } }
    const q = trackSample(T, bi * 2), half = q.hw + 26, R = half + 60;
    out.push({ x: q.x - R, y: q.y - R - TORII_H, w: R * 2 + TORII_H, h: R * 2 + TORII_H * 1.6, draw: g => torii(g, q, half) });
  }
  return out;
}
function torii(g, q, half) {
  const H = TORII_H, up = H * K_UP, P = s => [q.x + q.nx * s, q.y + q.ny * s], sh = [H * 0.5, H * 0.68];
  const beam = (s0, s1, dy, w) => { const [ax, ay] = P(s0), [bx, by] = P(s1); g.lineWidth = w; g.beginPath(); g.moveTo(ax, ay - dy); g.lineTo(bx, by - dy); g.stroke(); };
  g.save(); g.lineCap = 'round';
  // the shadows: the posts' and the beams' across the road
  g.strokeStyle = 'rgba(30,22,40,0.22)';
  for (const s of [-half, half]) { const [x, y] = P(s); g.lineWidth = 9; g.beginPath(); g.moveTo(x, y); g.lineTo(x + sh[0], y + sh[1]); g.stroke(); }
  g.save(); g.translate(sh[0], sh[1]); beam(-half - 22, half + 22, 0, 12); beam(-half, half, -0.2 * H, 7); g.restore();
  // the posts, standing up the screen from their black feet
  for (const s of [-half, half]) {
    const [x, y] = P(s);
    ell(g, x, y, 8, 5); g.fillStyle = INK; g.fill();
    g.fillStyle = linear(g, x - 5, 0, x + 5, 0, [[0, VERM_LT], [0.5, VERMILION], [1, VERM_DK]]); g.fillRect(x - 5, y - up, 10, up);
    g.fillStyle = INK; g.fillRect(x - 6, y - 8, 12, 8);
  }
  // the tie beam, then the lintel: red under a black cap, swept up at the ends
  g.strokeStyle = VERM_DK; beam(-half - 10, half + 10, up * 0.72 - 2, 8); g.strokeStyle = VERMILION; beam(-half - 10, half + 10, up * 0.72, 6);
  const [ax, ay] = P(-half - 26), [bx, by] = P(half + 26), mx = (ax + bx) / 2, my = (ay + by) / 2 - up;
  for (const [dy, w, col] of [[0, 10, VERMILION], [-6, 9, INK], [-8, 3, '#5a4a4c']]) {
    g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(ax, ay - up + dy - 7); g.quadraticCurveTo(mx, my + dy + 3, bx, by - up + dy - 7); g.stroke();
  }
  const [cx, cy] = P(0); g.fillStyle = INK; g.fillRect(cx - 7, cy - up - 2, 14, up * 0.28); g.fillStyle = GOLD; g.fillRect(cx - 4, cy - up + 3, 8, up * 0.16);   // the name plaque
  g.restore();
}

// ------------------------------------------------------------------------------------------------ the koi canal and the drawbridge
// the canal's line, smoothed through the definition's points, every few units, with the distance along it (cached)
const canals = new WeakMap();
function canalPath(z) {
  if (canals.has(z)) return canals.get(z);
  const P = z.canal, out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)], n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 6));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t, cr = (a0, a1, a2, a3) => 0.5 * (2 * a1 + (-a0 + a2) * t + (2 * a0 - 5 * a1 + 4 * a2 - a3) * t2 + (-a0 + 3 * a1 - 3 * a2 + a3) * t3);
      out.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(P[P.length - 1]);
  let acc = 0; out.forEach((p, i) => { if (i) acc += Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]); p[2] = acc; });
  let bi = 0, bd = 1e18; out.forEach((p, i) => { const d = (p[0] - z.q.x) ** 2 + (p[1] - z.q.y) ** 2; if (d < bd) { bd = d; bi = i; } });
  const C = { pts: out, len: acc, dBridge: out[bi][2] };
  canals.set(z, C); return C;
}
// a point at distance d along the canal, and which way it runs there
function canalAt(C, d) {
  const P = C.pts; let a = 0, b = P.length - 1; d = clamp(d, 0, C.len);
  while (b - a > 1) { const m = (a + b) >> 1; if (P[m][2] <= d) a = m; else b = m; }
  const p = P[a], q = P[b], f = clamp((d - p[2]) / ((q[2] - p[2]) || 1), 0, 1), l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  return { x: lerp(p[0], q[0], f), y: lerp(p[1], q[1], f), ux: (q[0] - p[0]) / l, uy: (q[1] - p[1]) / l };
}
const stroke = (g, P, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); P.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); };
// a pool's outline: a lumpy ellipse
function poolPath(g, p, k = 1) {
  g.beginPath();
  for (let i = 0; i <= 44; i++) { const a = i / 44 * TAU, w = 1 + 0.08 * Math.sin(a * 3 + p.r) + 0.05 * Math.cos(a * 5 + 1); const x = p.x + Math.cos(a) * p.r * k * w * 1.15, y = p.y + Math.sin(a) * p.r * k * w * 0.9; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.closePath();
}
const WATER = ['#7fd0de', '#43a6c0', '#2a7f9b'];
export function drawbridgeStatic(g, T, z) {
  const C = canalPath(z), P = C.pts, W = z.W, rng = mulberry(Math.round(z.sM) + 11);
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  // the stone banks, then the water, the canal and the pools as one
  for (const p of z.pools) { poolPath(g, p, 1.1); g.fillStyle = '#c8bfa9'; g.fill(); }
  stroke(g, P, W + 20, '#c8bfa9');
  for (const p of z.pools) { poolPath(g, p, 1.04); g.fillStyle = '#8f9a88'; g.fill(); }
  stroke(g, P, W + 8, '#8f9a88');
  stroke(g, P, W, WATER[1]);
  for (const p of z.pools) { poolPath(g, p, 1); g.fillStyle = radial(g, p.x - p.r * 0.3, p.y - p.r * 0.3, 4, p.x, p.y, p.r * 1.2, [[0, WATER[0]], [0.65, WATER[1]], [1, WATER[2]]]); g.fill(); }
  stroke(g, P, W * 0.45, 'rgba(127,208,222,0.35)');
  // the cut stones along the canal's banks, and boulders and iris round the pools
  for (let d = 8; d < C.len; d += 16) {
    const q = canalAt(C, d); if (Math.hypot(q.x - z.q.x, q.y - z.q.y) < z.hw + 40) continue;
    for (const s of [-1, 1]) { const o = s * (W / 2 + 6), x = q.x - q.uy * o, y = q.y + q.ux * o; g.save(); g.translate(x, y); g.rotate(Math.atan2(q.uy, q.ux)); g.fillStyle = '#d9d2c2'; g.fillRect(-7, -4, 14, 8); g.fillStyle = 'rgba(80,70,60,0.25)'; g.fillRect(-7, 2.5, 14, 1.5); g.restore(); }
  }
  for (const p of z.pools) {
    for (let k = 0; k < 9; k++) { const a = rng() * TAU, x = p.x + Math.cos(a) * p.r * 1.16, y = p.y + Math.sin(a) * p.r * 0.94; if (Math.hypot(x - z.q.x, y - z.q.y) < z.hw + 60) continue; stoneBlob(g, x, y, 9 + rng() * 10, rng); }
    for (let k = 0; k < 6; k++) {   // lily pads, some in flower
      const a = rng() * TAU, d = p.r * (0.4 + rng() * 0.45), x = p.x + Math.cos(a) * d * 1.1, y = p.y + Math.sin(a) * d * 0.8, s = 8 + rng() * 5;
      g.beginPath(); g.moveTo(x, y); g.arc(x, y, s, 0.4 + a, TAU + a - 0.1); g.closePath(); g.fillStyle = '#5aa35a'; g.fill(); g.strokeStyle = 'rgba(0,0,0,0.15)'; g.lineWidth = 1; g.stroke();
      if (k % 2) { for (let j = 0; j < 5; j++) petal(g, x + 2 + Math.cos(j * 1.26) * 2.4, y - 2 + Math.sin(j * 1.26) * 2.4, 2.4, j * 1.26, j % 2 ? '#ffd1e3' : '#ffe8f0'); }
    }
    for (let k = 0; k < 4; k++) {   // irises at the edge
      const a = rng() * TAU, x = p.x + Math.cos(a) * p.r * 1.05, y = p.y + Math.sin(a) * p.r * 0.86;
      for (let j = 0; j < 5; j++) { const b = j / 5 * TAU; ell(g, x + Math.cos(b) * 5, y + Math.sin(b) * 5, 7, 1.8, b); g.fillStyle = '#4f8f3f'; g.fill(); }
      circ(g, x, y, 3.2); g.fillStyle = '#6d4bc2'; g.fill(); circ(g, x - 1, y - 1, 1.3); g.fillStyle = '#f2d24e'; g.fill();
    }
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2; g.beginPath(); g.arc(p.x - p.r * 0.3, p.y - p.r * 0.2, p.r * 0.38, Math.PI * 1.1, Math.PI * 1.5); g.stroke();
  }
  // the bridge's stone sills across the road at each end of the leaf (the near one with the hinge)
  const H = trackSample(T, z.sH), E = trackSample(T, z.sTip), hw = z.hw + 14;
  for (const [q, f] of [[H, 1], [E, -1]]) {
    const ax = q.x + q.nx * hw, ay = q.y + q.ny * hw, bx = q.x - q.nx * hw, by = q.y - q.ny * hw, dx = q.tx * 10 * f, dy = q.ty * 10 * f;
    poly(g, [[ax - dx, ay - dy], [bx - dx, by - dy], [bx + dx * 0.3, by + dy * 0.3], [ax + dx * 0.3, ay + dy * 0.3]]); g.fillStyle = '#cfc8b8'; g.fill();
    g.strokeStyle = 'rgba(90,80,70,0.35)'; g.lineWidth = 1; for (let k = -3; k <= 3; k++) { const o = k * hw / 3.5; g.beginPath(); g.moveTo(q.x + q.nx * o - dx, q.y + q.ny * o - dy); g.lineTo(q.x + q.nx * o + dx * 0.3, q.y + q.ny * o + dy * 0.3); g.stroke(); }
  }
  // the posts' footings, either side of the hinge
  for (const s of [-1, 1]) { const x = H.x + H.nx * s * (z.hw + 18), y = H.y + H.ny * s * (z.hw + 18); g.fillStyle = 'rgba(30,22,40,0.25)'; circ(g, x + 4, y + 5, 13); g.fill(); g.fillStyle = '#b9b2a6'; circ(g, x, y, 12); g.fill(); }
  // the bell tower beside the bridge: a little roofed frame with the bronze bell hanging in it
  bellTower(g, H.x + H.nx * (z.hw + 95) - H.tx * 70, H.y + H.ny * (z.hw + 95) - H.ty * 70);
  g.restore();
}
export function bellTowerAt(T, z) { const H = trackSample(T, z.sH); return [H.x + H.nx * (z.hw + 95) - H.tx * 70, H.y + H.ny * (z.hw + 95) - H.ty * 70]; }
function bellTower(g, x, y) {
  const w = 30, up = 40 * K_UP;
  g.fillStyle = 'rgba(30,22,40,0.25)'; g.beginPath(); g.roundRect(x - w + 18, y - w + 26, w * 2, w * 2, 6); g.fill();
  g.fillStyle = '#c9c1b1'; g.fillRect(x - w * 0.9, y - w * 0.9, w * 1.8, w * 1.8);   // its stone base
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.fillStyle = VERMILION; g.fillRect(x + sx * w * 0.7 - 3, y + sy * w * 0.7 - up, 6, up); }   // the posts
  circ(g, x, y - up * 0.55, 9); g.fillStyle = radial(g, x - 3, y - up * 0.55 - 3, 1, x, y - up * 0.55, 9, [[0, '#e0b25a'], [1, '#6e4a1c']]); g.fill();   // the bell
  const c = [[x - w, y - w - up], [x + w, y - w - up], [x + w, y + w - up], [x - w, y + w - up]];
  roofPath(g, c, x, y - up, w); g.fillStyle = linear(g, x - w, y - w - up, x + w, y + w - up, [[0, '#8a92a0'], [0.5, '#555b68'], [1, '#2c3039']]); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 1; for (let i = 1; i < 4; i++) { const f = i / 4; roofPath(g, c.map(([px, py]) => [lerp(x, px, f), lerp(y - up, py, f)]), x, y - up, w * f); g.stroke(); }
  g.strokeStyle = '#2a2d34'; g.lineWidth = 2; g.beginPath(); for (const [px, py] of c) { g.moveTo(x, y - up); g.lineTo(px, py); } g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y - up); g.lineTo(c[0][0], c[0][1]); g.stroke();
  roofPath(g, c, x, y - up, w); g.strokeStyle = VERMILION; g.lineWidth = 1.6; g.stroke();
  circ(g, x, y - up, 3.4); g.fillStyle = GOLD; g.fill();
}

// the leaf, lifted by angle a about its hinge: a point d along it (0 at the hinge) and `o` across, on the screen
function leafPt(H, d, o, a) { const c = Math.cos(a), h = d * Math.sin(a); return [H.x + H.tx * d * c + H.nx * o, H.y + H.ty * d * c + H.ny * o - h * K_UP, h]; }
// a few koi in the pools, and one or two in the canal, swimming slow circles
function koi(ctx, z, t) {
  const C = canalPath(z);
  const fish = (x, y, a, col) => { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ell(ctx, 0, 0, 8, 3.4); ctx.fillStyle = col[0]; ctx.fill(); poly(ctx, [[-7, 0], [-13, -3.5 + Math.sin(t * 8) * 1.5], [-13, 3.5 + Math.sin(t * 8) * 1.5]]); ctx.fill(); if (col[1]) { circ(ctx, 2.5, 0, 2); ctx.fillStyle = col[1]; ctx.fill(); } ctx.restore(); };
  const cols = [['#ff8a3d'], ['#f4f1ea', '#e8532b'], ['#ffd24a'], ['#f4f1ea', '#222']];
  z.pools.forEach((p, i) => { for (let k = 0; k < 3; k++) { const w = 0.25 + k * 0.07, ph = t * w + k * 2.1 + i, rx = p.r * (0.35 + k * 0.15), x = p.x + Math.cos(ph) * rx * 1.1, y = p.y + Math.sin(ph) * rx * 0.75; fish(x, y, ph + Math.PI / 2, cols[(k + i) % 4]); } });
  for (let k = 0; k < 2; k++) { const d = (t * 40 + k * C.len / 2) % (C.len * 2), dd = d > C.len ? C.len * 2 - d : d, q = canalAt(C, dd), back = d > C.len; fish(q.x - q.uy * (k ? 10 : -12), q.y + q.ux * (k ? 10 : -12), Math.atan2(q.uy, q.ux) + (back ? Math.PI : 0), cols[k + 1]); }
}
// the garden's boat: a little roofed pleasure boat poled along the canal, through the bridge while the leaf's up
const BOAT_V = 170;
function boat(ctx, z, lf, DB) {
  if (lf.u < 0) return;
  const C = canalPath(z), tc = DB.DB_WARN + DB.DB_RISE + DB.DB_HOLD * 0.5, dir = Math.floor(lf.r * 10) % 2 ? 1 : -1;
  const d = C.dBridge + dir * (lf.u - tc) * BOAT_V; if (d < 0 || d > C.len) return;
  const q = canalAt(C, d), a = Math.atan2(q.uy, q.ux) + (dir < 0 ? Math.PI : 0), fade = clamp(Math.min(d, C.len - d) / 60, 0, 1);
  ctx.save(); ctx.globalAlpha = fade; ctx.translate(q.x, q.y); ctx.rotate(a);
  ell(ctx, -26, 0, 30, 9); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();   // its wake
  ctx.fillStyle = 'rgba(10,40,60,0.3)'; ctx.beginPath(); ctx.ellipse(4, 5, 30, 12, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(34, 0); ctx.quadraticCurveTo(20, -13, -28, -11); ctx.lineTo(-30, 11); ctx.quadraticCurveTo(20, 13, 34, 0); ctx.fillStyle = '#7a4a2a'; ctx.fill();
  ctx.fillStyle = '#a8703f'; ctx.beginPath(); ctx.moveTo(30, 0); ctx.quadraticCurveTo(18, -9, -25, -8); ctx.lineTo(-26, 8); ctx.quadraticCurveTo(18, 9, 30, 0); ctx.fill();
  ctx.fillStyle = VERMILION; ctx.fillRect(-16, -9, 28, 18); ctx.fillStyle = '#3a3f4a'; ctx.beginPath(); ctx.roundRect(-18, -10.5, 32, 21, 3); ctx.fill();   // the cabin's roof
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(14, 0); ctx.stroke();
  for (const x of [-12, 8]) { circ(ctx, x, -11, 3); ctx.fillStyle = '#ff6b4a'; ctx.fill(); circ(ctx, x, 11, 3); ctx.fill(); }   // lanterns along its eaves
  circ(ctx, -26, 0, 4); ctx.fillStyle = '#2b2b30'; ctx.fill(); ctx.strokeStyle = '#c9b48a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-44, 12); ctx.stroke();   // the boatman and his pole
  ctx.restore();
}
export function drawbridgeUnder(ctx, T, z, lf, t, DB) {
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  koi(ctx, z, t);
  boat(ctx, z, lf, DB);
  const H = trackSample(T, z.sH), a = lf.a, w = z.hw + 6, L = z.len;
  // its shadow on the water as it lifts (down and to the right of each point, by its height)
  if (a > 0.01) {
    const S = (d, o) => { const [x, y, h] = leafPt(H, d, o, a); return [x + h * 0.45, y + h * K_UP + h * 0.6]; };
    poly(ctx, [S(0, -w), S(L, -w), S(L, w), S(0, w)]); ctx.fillStyle = 'rgba(10,30,45,0.28)'; ctx.fill();
  }
  // the leaf: timber decking between red rails. Lifted past upright to the view it shows its underside: dark beams.
  const A = leafPt(H, 0, -w, a), B = leafPt(H, L, -w, a), Cc = leafPt(H, L, w, a), D = leafPt(H, 0, w, a);
  const area = (B[0] - A[0]) * (D[1] - A[1]) - (B[1] - A[1]) * (D[0] - A[0]), flat = (H.tx * H.ny - H.ty * H.nx);
  const under = Math.sign(area) !== Math.sign(flat) && Math.abs(area) > 1;
  poly(ctx, [A, B, Cc, D]);
  if (under) { ctx.fillStyle = '#4a3020'; ctx.fill(); ctx.strokeStyle = '#2c1c12'; ctx.lineWidth = 4; for (let k = 1; k < 5; k++) { const p = leafPt(H, L * k / 5, -w, a), q = leafPt(H, L * k / 5, w, a); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); } }
  else {
    const lit = 1 - a * 0.35;
    ctx.fillStyle = shadeK('#b98a5a', lit); ctx.fill();
    ctx.strokeStyle = shadeK('#7a5534', lit); ctx.lineWidth = 1.2;
    for (let k = 1; k < 12; k++) { const p = leafPt(H, L * k / 12, -w, a), q = leafPt(H, L * k / 12, w, a); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }   // the planks
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3; ctx.setLineDash([14, 12]);   // the road's centre line carried across
    const m0 = leafPt(H, 6, 0, a), m1 = leafPt(H, L - 6, 0, a); ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.lineTo(m1[0], m1[1]); ctx.stroke(); ctx.setLineDash([]);
  }
  // the rails along both sides, with gold caps on their posts
  for (const o of [-w, w]) {
    const p = leafPt(H, 0, o, a), q = leafPt(H, L, o, a);
    ctx.strokeStyle = VERM_DK; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(p[0], p[1] + 2); ctx.lineTo(q[0], q[1] + 2); ctx.stroke();
    ctx.strokeStyle = VERMILION; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(p[0], p[1] - 1); ctx.lineTo(q[0], q[1] - 1); ctx.stroke();
    for (let k = 0; k <= 4; k++) { const r = leafPt(H, L * k / 4, o, a); circ(ctx, r[0], r[1] - 1, 3.4); ctx.fillStyle = GOLD; ctx.fill(); }
  }
  // the tip's edge, lit as it comes up
  if (a > 0.02) { ctx.strokeStyle = under ? '#2c1c12' : '#6b4526'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(B[0], B[1]); ctx.lineTo(Cc[0], Cc[1]); ctx.stroke(); }
  ctx.restore();
}
const shadeK = (hex, k) => shade(hex, (k - 1) * 0.9);
// the posts either side of the hinge with a paper lantern on each (they flash red while the bridge is lifting or up),
// the chains from their tops to the leaf's tip, and the bell's ring when it's struck
const POST_H = 82;
export function drawbridgeOver(ctx, T, z, lf, t, DB) {
  const H = trackSample(T, z.sH), a = lf.a, w = z.hw + 6, up = POST_H * K_UP, busy = lf.u >= 0;
  ctx.save(); ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    const x = H.x + H.nx * s * (z.hw + 18), y = H.y + H.ny * s * (z.hw + 18);
    ctx.fillStyle = linear(ctx, x - 6, 0, x + 6, 0, [[0, VERM_LT], [0.5, VERMILION], [1, VERM_DK]]); ctx.fillRect(x - 6, y - up, 12, up);
    ctx.fillStyle = INK; ctx.fillRect(x - 8, y - up - 5, 16, 6);
    // the chain from the post's top to the leaf's tip on its side
    const tip = leafPt(H, z.len, s * w, a), sag = (1 - Math.min(1, a * 1.6)) * 26;
    ctx.strokeStyle = '#3a3438'; ctx.lineWidth = 2.6; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x, y - up); ctx.quadraticCurveTo((x + tip[0]) / 2, (y - up + tip[1]) / 2 + sag, tip[0], tip[1]); ctx.stroke(); ctx.setLineDash([]);
    // its lantern: warm and steady, or flashing red, the two in turn
    const on = busy && Math.floor(t * 5) % 2 === (s > 0 ? 0 : 1), ly = y - up - 14;
    if (busy) { ctx.fillStyle = radial(ctx, x, ly, 2, x, ly, on ? 46 : 26, [[0, on ? 'rgba(255,70,40,0.55)' : 'rgba(255,120,80,0.2)'], [1, 'rgba(255,70,40,0)']]); circ(ctx, x, ly, on ? 46 : 26); ctx.fill(); }
    else { ctx.fillStyle = radial(ctx, x, ly, 2, x, ly, 24, [[0, 'rgba(255,214,140,0.35)'], [1, 'rgba(255,214,140,0)']]); circ(ctx, x, ly, 24); ctx.fill(); }
    ell(ctx, x, ly, 9, 11); ctx.fillStyle = busy ? (on ? '#ff5a3c' : '#a8321f') : '#f2a65a'; ctx.fill();
    ctx.fillStyle = INK; ctx.fillRect(x - 6, ly - 13, 12, 4); ctx.fillRect(x - 6, ly + 9, 12, 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.ellipse(x, ly + k * 4, 9 - Math.abs(k) * 1.5, 1.5, 0, 0, TAU); ctx.stroke(); }
    ell(ctx, x - 3, ly - 3, 3, 4); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
  }
  // the bell's ring: rings spreading from the tower for a moment after it's struck
  if (busy && lf.u < 1.2) { const [bx, by] = bellTowerAt(T, z); for (let k = 0; k < 2; k++) { const f = clamp((lf.u - k * 0.25) / 0.9, 0, 1); if (f <= 0 || f >= 1) continue; ctx.strokeStyle = `rgba(255,230,170,${0.7 * (1 - f)})`; ctx.lineWidth = 3; circ(ctx, bx, by - 22, 14 + f * 60); ctx.stroke(); } }
  ctx.restore();
}

// blossom drifting across the garden: a light scatter of petals over the view, each falling and fluttering on the
// breeze for a few seconds and then gone, laid out on a grid so the same petals are there wherever the camera is
export function sakuraPetals(ctx, t) {
  if (!ctx.getTransform) return;
  const m = ctx.getTransform().inverse(), cw = ctx.canvas.width, ch = ctx.canvas.height;
  const xs = [], ys = []; for (const [px, py] of [[0, 0], [cw, 0], [0, ch], [cw, ch]]) { xs.push(m.a * px + m.c * py + m.e); ys.push(m.b * px + m.d * py + m.f); }
  const x0 = Math.min(...xs) - 200, y0 = Math.min(...ys) - 200, x1 = Math.max(...xs), y1 = Math.max(...ys), G = 360, LIFE = 6;
  ctx.save();
  for (let gy = Math.floor(y0 / G); gy <= Math.floor(y1 / G); gy++) for (let gx = Math.floor(x0 / G); gx <= Math.floor(x1 / G); gx++) {
    const rng = mulberry((gx * 73856093) ^ (gy * 19349663));
    for (let k = 0; k < 2; k++) {
      const ph = rng() * LIFE, u = ((t + ph) % LIFE) / LIFE, cyc = Math.floor((t + ph) / LIFE), r2 = mulberry(cyc * 7919 + k + gx * 31 + gy * 17);
      const x = gx * G + r2() * G + u * 140 + Math.sin(t * 1.7 + ph * 3) * 14, y = gy * G + r2() * G + u * 90, al = Math.sin(u * Math.PI) * 0.85;
      ctx.globalAlpha = al; petal(ctx, x, y, 3.4, t * 2.2 + ph * 5, k ? '#ffd1e0' : '#ffb8cf');
    }
  }
  ctx.restore();
}
