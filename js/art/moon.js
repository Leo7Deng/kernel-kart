// Kernel Kart art: Moonshot's Moon (art/moonshot.js draws the rest): the bottom of the Moon, seen from above in hard,
// low sunlight from the top left, so every crater is half lit and half in deep blue-black shadow. Bright cratered
// highlands, the dark smooth maria, craters at every size (the big ones terraced, with central peaks), a fresh crater's
// bright rays, boulders. The road: dark sintered basalt in hexagonal tiles with cyan edge lines and blue-and-white
// kerbs. The crater bowl (race-banks.js `bowl`): a crater round it, its wall banked up under the road's outer half
// with a velodrome's lines; the Apennine Crests (race-crests.js): mounds shaded by their slopes, their tops and where
// they go light marked; Hadley Rille's walls (art/rille.js) and the mass driver's rail (art/massdriver.js). The landing field (a pad for every racer's rocket, art/moonshot.js rowN), the base (white domes in orange and
// teal, a greenhouse, solar arrays) and the hab over the road (a roof layer), the observatory, the Return Row (a pad
// for every racer's capsule). The base's rover and airlock are art/timed.js.
// Baked: moonGround (with `rect`, only that part, the same pixels: everything's planned once per track, moonOf) and
// moonStatic. Live (moonLive): the field's and the rows' lights. moonDust: the dust thrown in slow arcs behind the karts.
import { TAU, clamp, frnd, lerp, mulberry } from '../core.js';
import { curvAt, trackSample } from '../geometry.js';
import { crestGr } from '../race-crests.js';
import { HATCH, inSpan, layoutFor } from '../race-rocket.js';
import { rampLane } from './cape.js';
import { drawRamp } from './rockets.js';
import { bold, BK } from '../look.js';
import { alpha, circ, ell, linear, radial, smooth } from './paint.js';
import { VIEW } from '../view.js';
import { canyonStatic } from './rille.js';
import { driverStatic } from './massdriver.js';

const M = {
  reg: '#cdc8bd', reg2: '#bdb7ab', high: '#ddd8cd', mare: '#8c8e96', mare2: '#9a9ca3', shadow: '#1b1d33', sh: 'rgba(22,22,44,0.5)', sh2: 'rgba(22,22,44,0.28)',
  road: '#4d5161', road2: '#5a5f71', tile: 'rgba(255,255,255,0.06)', edge: '#7df9ff', kerb: ['#3f7fd9', '#f4f6fa'],
  white: '#f4f3ef', orange: '#ff8a3c', teal: '#33c4bc', gold: '#e0a93a', panel: '#2d4f9e',
};
function makeCanvas(w, h) { if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; } return new OffscreenCanvas(w, h); }

// the regolith's grain: a tile of fine light and dark specks, used as a pattern
let GRAIN = null;
function grain() {
  if (GRAIN) return GRAIN;
  const n = 256, cv = makeCanvas(n, n), x = cv.getContext('2d'), rng = mulberry(31);
  for (let i = 0; i < 4200; i++) { const r = rng(); x.fillStyle = r < 0.5 ? `rgba(255,255,255,${0.1 + rng() * 0.25})` : `rgba(30,30,46,${0.07 + rng() * 0.16})`; const s = rng() < 0.85 ? 1 : 2; x.fillRect(Math.floor(rng() * n), Math.floor(rng() * n), s, s); }
  for (let i = 0; i < 60; i++) { const px = rng() * n, py = rng() * n, r = 3 + rng() * 12; const gr = x.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, rng() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(30,30,50,0.07)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(px - r, py - r, r * 2, r * 2); }
  return GRAIN = cv;
}
const pattern = (g, k) => { const p = g.createPattern(grain(), 'repeat'); if (p.setTransform) p.setTransform(new DOMMatrix().scale(k)); return p; };

// ------------------------------------------------------------------------------------------------ the plan
const plans = new WeakMap();
export function moonOf(T, P) {
  let O = plans.get(T); if (O) return O;
  const d = P.d, sc = P.sc, z = P.z, B = T.bbox, W = p => p && { x: p[0] * sc, y: p[1] * sc };
  O = { maria: (d.maria || []).map(L => L.map(p => [p[0] * sc, p[1] * sc])), rille: (d.rille || []).map(p => [p[0] * sc, p[1] * sc]), base: W(d.base), obs: W(d.obs) };
  if (d.ray) O.ray = { x: d.ray[0] * sc, y: d.ray[1] * sc, r: d.ray[2] * sc };
  // the driven Moon road (not the rides' stretches) on a grid, for keeping craters and rocks off it
  const pts = []; for (let s = z.sGate - 300; s < z.sRetEnd + 300; s += 20) if (!inSpan(z, s)) { const q = trackSample(T, s); pts.push([q.x, q.y, q.hw]); }
  const G = 160, grid = new Map(); for (const p of pts) { const k = Math.floor(p[0] / G) + ',' + Math.floor(p[1] / G); let b = grid.get(k); if (!b) grid.set(k, b = []); b.push(p); }
  O.roadD = (x, y) => { let best = 800; const cx = Math.floor(x / G), cy = Math.floor(y / G); for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) { const b = grid.get((cx + i) + ',' + (cy + j)); if (b) for (const p of b) { const dd = Math.hypot(p[0] - x, p[1] - y) - p[2]; if (dd < best) best = dd; } } return best; };
  const R10 = layoutFor(z, 10), keep = [];
  for (const b of R10.mpads) keep.push([b.pad.x, b.pad.y, 200]);
  for (const b of R10.rbays) keep.push([b.pad.x, b.pad.y, 200]);
  if (O.base) keep.push([O.base.x, O.base.y, 560]);
  if (O.obs) keep.push([O.obs.x, O.obs.y, 220]);
  if (O.ray) keep.push([O.ray.x, O.ray.y, O.ray.r * 1.4]);
  O.free = (x, y, r) => !keep.some(([kx, ky, kr]) => (kx - x) ** 2 + (ky - y) ** 2 < (kr + r) ** 2);
  O.inMare = (x, y) => O.maria.some(L => inPoly(L, x, y));
  // craters: many small ones, fewer big ones; fewer on the maria; none on the road or the set pieces
  const rng = mulberry(5150), cr = [], X0 = B.x - 1700, X1 = B.x + B.w + 1700, Y0 = B.y - 1500, Y1 = P.moon.bottom;
  const area = (X1 - X0) * (Y1 - Y0);
  for (let i = 0; i < area / 8000; i++) {
    const x = X0 + rng() * (X1 - X0), y = Y0 + rng() * (Y1 - Y0), r = 6 + (rng() ** 4.5) * 240, mare = O.inMare(x, y);
    if (mare && rng() < 0.7) continue;
    if (r > 24 && r < 90 && rng() < 0.55) continue;   // (fewer middling ones: a few big, many little)
    if (Math.hypot(x - P.moon.x, y - P.moon.y) > P.moon.r - r) continue;
    if (O.roadD(x, y) < r * 1.2 + 20 || !O.free(x, y, r) || rilleD(O.rille, x, y) < r + 150) continue;
    if (cr.some(([cx, cy, rr]) => (rr > 18 || r > 18) && Math.hypot(cx - x, cy - y) < (rr + r) * 1.05)) continue;
    cr.push([x, y, r, rng(), rng() < 0.1]);
  }
  cr.sort((a, b) => b[2] - a[2]);
  O.craters = cr;
  O.rocks = []; for (let i = 0; i < area / 26000; i++) { const x = X0 + rng() * (X1 - X0), y = Y0 + rng() * (Y1 - Y0), r = 5 + rng() ** 2 * 18; if (O.roadD(x, y) < r + 24 || !O.free(x, y, r) || Math.hypot(x - P.moon.x, y - P.moon.y) > P.moon.r - 20) continue; O.rocks.push([x, y, r, rng()]); }
  // hills: a few broad rounded massifs in the open (the highlands' bones), each catching the sun on its top left
  O.hills = []; for (let i = 0; i < 400 && O.hills.length < 14; i++) { const x = X0 + rng() * (X1 - X0), y = Y0 + rng() * (Y1 - Y0), r = 160 + rng() * 260; if (O.roadD(x, y) < r + 60 || !O.free(x, y, r) || O.inMare(x, y) || Math.hypot(x - P.moon.x, y - P.moon.y) > P.moon.r - r || O.hills.some(h => Math.hypot(h[0] - x, h[1] - y) < h[2] + r)) continue; O.hills.push([x, y, r, rng()]); }
  O.blobs = []; for (let i = 0; i < 90; i++) O.blobs.push([X0 + rng() * (X1 - X0), Y0 + rng() * (Y1 - Y0), 200 + rng() * 500, rng()]);
  plans.set(T, O); return O;
}
function rilleD(L, x, y) { let best = 1e9; for (let i = 0; i < L.length - 1; i++) { const [ax, ay] = L[i], [bx, by] = L[i + 1], dx = bx - ax, dy = by - ay, f = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1); best = Math.min(best, Math.hypot(ax + dx * f - x, ay + dy * f - y)); } return best; }
function inPoly(L, x, y) { let o = false; for (let i = 0, j = L.length - 1; i < L.length; j = i++) { const [xi, yi] = L[i], [xj, yj] = L[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) o = !o; } return o; }

// ------------------------------------------------------------------------------------------------ craters and rocks
// a crater from above in low sun from the top left: a bright ejecta blanket (a fresh one), the raised rim (its top
// left lit, its bottom right shaded, casting a shadow out down-right), the bowl: a crescent of deep shadow under the
// top-left rim, the far wall in full sun; terraces and a central peak in the big ones
export function crater(g, x, y, r, { fresh = false, deep = 0.5, BD = bold(), terr = r > 170 } = {}) {
  if (r < 5) return;
  if (fresh && !BD) { g.fillStyle = radial(g, x, y, r, x, y, r * 2.2, [[0, 'rgba(250,248,242,0.38)'], [1, 'rgba(250,248,242,0)']]); circ(g, x, y, r * 2.2); g.fill(); }
  g.fillStyle = 'rgba(22,22,44,0.18)'; circ(g, x + r * 0.14, y + r * 0.18, r * 1.1); g.fill();   // the rim's shadow out on the ground
  g.fillStyle = BD ? '#e2ddd3' : linear(g, x - r, y - r, x + r, y + r, [[0, '#f7f4ec'], [0.5, '#d9d3c7'], [1, '#aaa498']]); circ(g, x, y, r * 1.09); g.fill();
  g.save(); circ(g, x, y, r); g.clip();
  g.fillStyle = BD ? '#bfb9ad' : '#bdb7ab'; g.fillRect(x - r, y - r, r * 2, r * 2);   // the bowl's floor
  g.fillStyle = BD ? '#ddd7cb' : linear(g, x - r * 0.2, y - r * 0.2, x + r * 0.8, y + r * 0.8, [[0, 'rgba(240,236,226,0)'], [1, 'rgba(244,240,230,0.95)']]); g.beginPath(); g.arc(x, y, r, 0, TAU); g.arc(x - r * 0.28, y - r * 0.32, r * 1.0, 0, TAU, true); g.fill('evenodd');   // the far wall, in the sun
  if (terr) for (let k = 1; k <= 3; k++) { g.strokeStyle = `rgba(255,255,250,${0.22 - k * 0.04})`; g.lineWidth = r * 0.03; circ(g, x + r * 0.05 * k, y + r * 0.06 * k, r * (1 - k * 0.14)); g.stroke(); g.strokeStyle = 'rgba(30,30,50,0.15)'; circ(g, x + r * 0.05 * k + 2, y + r * 0.06 * k + 2, r * (1 - k * 0.14)); g.stroke(); }
  // the shadow: a crescent under the top-left rim, deepest at the rim, deep and blue-black
  const a0 = 0.5 + deep * 0.2;
  g.fillStyle = BD ? 'rgba(38,40,70,0.5)' : linear(g, x - r * 0.75, y - r * 0.75, x + r * 0.2, y + r * 0.25, [[0, `rgba(30,32,62,${a0})`], [0.7, `rgba(30,32,62,${a0 * 0.85})`], [1, `rgba(30,32,62,${a0 * 0.4})`]]);
  g.beginPath(); g.arc(x, y, r * 1.02, 0, TAU); g.arc(x + r * 0.34, y + r * 0.4, r * 1.02, 0, TAU, true); g.fill('evenodd');
  if (r > 150) { const px = x + r * 0.1, py = y + r * 0.12, pr = r * 0.14;   // a central peak, its own shadow down-right
    g.fillStyle = 'rgba(24,25,48,0.4)'; ell(g, px + pr * 0.9, py + pr * 0.9, pr * 1.3, pr * 0.6, 0.75); g.fill();
    g.fillStyle = BD ? '#e2ddd3' : linear(g, px - pr, py - pr, px + pr, py + pr, [[0, '#fbf8f0'], [1, '#9e988c']]); smooth(g, [[px - pr, py + pr * 0.35], [px - pr * 0.25, py - pr * 0.9], [px + pr * 0.55, py - pr * 0.45], [px + pr, py + pr * 0.45], [px, py + pr * 0.75]]); g.fill(); }
  g.restore();
  if (BD) { g.strokeStyle = 'rgba(40,40,60,0.3)'; g.lineWidth = Math.max(1.5, r * 0.035); circ(g, x, y, r); g.stroke(); }
}
// a hill from above: a soft lumpy mound, its top left in the sun, its shadow stretched down-right
function hill(g, x, y, r, k, BD) {
  const rng = mulberry(Math.floor(k * 1e5)), pts = []; for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, d = r * (0.8 + rng() * 0.3); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8]); }
  g.save(); g.translate(r * 0.35, r * 0.4); g.fillStyle = 'rgba(24,25,48,0.22)'; smooth(g, pts); g.fill(); g.restore();
  g.fillStyle = BD ? '#d2ccc0' : radial(g, x - r * 0.4, y - r * 0.4, r * 0.1, x + r * 0.1, y + r * 0.1, r * 1.1, [[0, '#f3efe5'], [0.55, '#cbc5b9'], [1, '#a29c90']]); smooth(g, pts); g.fill();
  if (!BD) { g.globalAlpha = 0.5; g.fillStyle = pattern(g, 2.4); smooth(g, pts); g.fill(); g.globalAlpha = 1; }
}
// a little pit: just a crescent of shadow and a lit far lip
function pit(g, x, y, r, BD) {
  g.fillStyle = 'rgba(255,253,245,0.55)'; circ(g, x + r * 0.15, y + r * 0.2, r); g.fill();
  g.fillStyle = BD ? 'rgba(27,29,51,0.5)' : 'rgba(24,25,48,0.45)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.arc(x + r * 0.45, y + r * 0.5, r, 0, TAU, true); g.fill('evenodd');
}
// an old crater, worn soft by everything since: a shallow dish, its rim low, a soft shadow
function oldCrater(g, x, y, r, BD) {
  if (BD) { g.fillStyle = 'rgba(80,76,90,0.14)'; circ(g, x, y, r); g.fill(); g.strokeStyle = 'rgba(255,253,245,0.35)'; g.lineWidth = r * 0.1; g.beginPath(); g.arc(x, y, r, 0.2, Math.PI * 1.3); g.stroke(); return; }
  g.fillStyle = radial(g, x - r * 0.3, y - r * 0.35, r * 0.2, x, y, r * 1.1, [[0, 'rgba(24,25,48,0.28)'], [0.7, 'rgba(24,25,48,0.08)'], [1, 'rgba(24,25,48,0)']]); circ(g, x, y, r * 1.1); g.fill();
  g.strokeStyle = linear(g, x - r, y - r, x + r, y + r, [[0, 'rgba(24,25,48,0.18)'], [1, 'rgba(255,253,245,0.4)']]); g.lineWidth = r * 0.12; circ(g, x, y, r); g.stroke();
}
// a boulder, lit from the top left, its long shadow down-right
function boulder(g, x, y, r, rng, BD) {
  const pts = []; for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + rng() * 0.5, d = r * (0.75 + rng() * 0.35); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8]); }
  g.fillStyle = M.sh; g.save(); g.translate(r * 0.9, r * 1.0); smooth(g, pts); g.fill(); g.restore();
  g.fillStyle = BD ? '#aba599' : linear(g, x - r, y - r, x + r, y + r, [[0, '#efebe2'], [0.55, '#b1ab9f'], [1, '#7d776c']]); smooth(g, pts); g.fill();
  if (!BD) { g.fillStyle = 'rgba(255,255,255,0.4)'; circ(g, x - r * 0.3, y - r * 0.32, r * 0.26); g.fill(); }
}
// a band along the road between lat a(q) and lat b(q)
function band(g, T, s0, s1, a, b, step = 10) {
  const L = [], R = [];
  for (let s = s0; ; s += step) { const ss = Math.min(s, s1), q = trackSample(T, ss), oa = typeof a === 'function' ? a(q, ss) : a, ob = typeof b === 'function' ? b(q, ss) : b; L.push([q.x + q.nx * oa, q.y + q.ny * oa]); R.push([q.x + q.nx * ob, q.y + q.ny * ob]); if (ss >= s1) break; }
  g.beginPath(); L.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]); g.closePath();
}
const at = (T, s, lat) => { const q = trackSample(T, s); return [q.x + q.nx * lat, q.y + q.ny * lat]; };
function line(g, L) { g.beginPath(); g.moveTo(L[0][0], L[0][1]); for (let i = 1; i < L.length - 1; i++) { const [x, y] = L[i], [nx, ny] = L[i + 1]; g.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2); } g.lineTo(L[L.length - 1][0], L[L.length - 1][1]); }

// ------------------------------------------------------------------------------------------------ the ground (baked)
export function moonGround(g, T, P, D, rect) {
  const O = moonOf(T, P), BD = bold(), Mo = P.moon, B = T.bbox;
  const inR = (x, y, m) => !rect || (x > rect.x0 - m && x < rect.x1 + m && y > rect.y0 - m && y < rect.y1 + m);
  const fx0 = rect ? rect.x0 : Mo.x - Mo.r, fx1 = rect ? rect.x1 : Mo.x + Mo.r, fy0 = rect ? rect.y0 : Mo.y - Mo.r, fy1 = rect ? Math.min(rect.y1, Mo.bottom + 20) : Mo.bottom + 20; if (fy1 <= fy0) return;
  g.save(); circ(g, Mo.x, Mo.y, Mo.r); g.clip();
  g.fillStyle = BD ? M.reg : linear(g, 0, B.y, 0, Mo.bottom, [[0, '#d9d4c9'], [1, '#c3bdb1']]); g.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  for (const [x, y, r, k] of O.blobs) { if (!inR(x, y, r)) continue; const col = k < 0.5 ? 'rgba(255,253,245,' : 'rgba(110,104,96,'; if (BD) { g.fillStyle = col + '0.12)'; ell(g, x, y, r * 0.8, r * 0.6, k * 3); g.fill(); continue; } g.fillStyle = radial(g, x, y, 0, x, y, r, [[0, col + '0.16)'], [1, col + '0)']]); g.fillRect(x - r, y - r, r * 2, r * 2); }
  // the maria: dark smooth plains of old lava, soft-edged
  for (const L of O.maria) { const cx = L.reduce((a, p) => a + p[0], 0) / L.length, cy = L.reduce((a, p) => a + p[1], 0) / L.length;
    for (const [k, a] of BD ? [[1, 0.55]] : [[1.1, 0.18], [1.03, 0.25], [0.96, 0.32], [0.88, 0.25]]) { g.fillStyle = alpha(M.mare, a); g.save(); g.translate(cx, cy); g.scale(k, k); g.translate(-cx, -cy); smooth(g, L); g.fill(); g.restore(); } }
  if (D > 0.5) { g.globalAlpha = BD ? 0.4 : 0.75; g.fillStyle = pattern(g, 2.4); g.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0); g.globalAlpha = 1; }
  for (const [x, y, r, k] of O.hills) if (inR(x, y, r * 1.6)) hill(g, x, y, r, k, BD);
  // the rille: a winding canyon, its far (south-east) wall lit, its near wall a deep shadow, a dark floor
  if (O.rille.length > 1 && inR(O.rille[0][0], (O.rille[0][1] + O.rille[O.rille.length - 1][1]) / 2, 3000)) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = BD ? '#e2ddd3' : 'rgba(250,247,238,0.7)'; g.lineWidth = 250; line(g, O.rille); g.stroke();   // the raised lips
    g.strokeStyle = BD ? '#9e988c' : '#a39d91'; g.lineWidth = 200; line(g, O.rille); g.stroke();
    g.save(); g.translate(-16, -18); g.strokeStyle = M.shadow; g.lineWidth = 170; line(g, O.rille); g.stroke(); g.restore();   // the near wall's shadow
    g.save(); g.translate(22, 24); g.strokeStyle = BD ? '#d8d2c6' : '#e2dccf'; g.lineWidth = 120; line(g, O.rille); g.stroke(); g.restore();   // the far wall in the sun
    g.strokeStyle = BD ? '#5a5866' : '#5f5c68'; g.lineWidth = 80; line(g, O.rille); g.stroke();   // the floor
    g.save(); g.translate(-6, -8); g.strokeStyle = 'rgba(20,20,40,0.6)'; g.lineWidth = 60; line(g, O.rille); g.stroke(); g.restore();
    if (D > 0.5) { const rng = mulberry(66); for (let i = 0; i < O.rille.length - 1; i++) { const [ax, ay] = O.rille[i], [bx, by] = O.rille[i + 1], L = Math.hypot(bx - ax, by - ay); for (let f = 0; f < L; f += 30) { const x = lerp(ax, bx, f / L) + (rng() - 0.5) * 50, y = lerp(ay, by, f / L) + (rng() - 0.5) * 30; if (inR(x, y, 20)) boulder(g, x, y, 5 + rng() * 7, rng, BD); } } }
  }
  // the fresh crater's rays
  if (O.ray && !BD && inR(O.ray.x, O.ray.y, 2200)) { const t = O.ray, rng = mulberry(9); for (let k = 0; k < 22; k++) { const a = k / 22 * TAU + rng() * 0.25, r0 = t.r * 1.1, r1 = r0 + 400 + rng() * 1200, w = 10 + rng() * 26; g.strokeStyle = linear(g, t.x + Math.cos(a) * r0, t.y + Math.sin(a) * r0, t.x + Math.cos(a) * r1, t.y + Math.sin(a) * r1, [[0, 'rgba(255,255,252,0.42)'], [1, 'rgba(255,255,252,0)']]); g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(t.x + Math.cos(a) * r0, t.y + Math.sin(a) * r0); g.lineTo(t.x + Math.cos(a) * r1, t.y + Math.sin(a) * r1); g.stroke(); } }
  // craters, the biggest first
  for (const [x, y, r, k, fresh] of O.craters) if (inR(x, y, r * 2.3)) { if (r < 16) pit(g, x, y, r, BD); else if (k < 0.2 && !fresh && r > 30) oldCrater(g, x, y, r, BD); else crater(g, x, y, r, { fresh, deep: k, BD }); }
  if (O.ray && inR(O.ray.x, O.ray.y, O.ray.r * 2.5)) crater(g, O.ray.x, O.ray.y, O.ray.r, { fresh: true, deep: 0.8, BD });
  const rng = mulberry(77);
  if (D > 0.5) for (const [x, y, r] of O.rocks) if (inR(x, y, r * 3)) boulder(g, x, y, r, rng, BD);
  g.restore();
  // the Moon's edge: lit at its bottom, toward the Earth's light
  { g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 10; circ(g, Mo.x, Mo.y, Mo.r - 5); g.stroke(); }
}
// ------------------------------------------------------------------------------------------------ the set pieces (baked)
export function moonStatic(g, T, P, D, n) {
  const O = moonOf(T, P), z = P.z, BD = bold(), R = layoutFor(z, n);
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  bowlCraters(g, T, BD, D);   // the crater bowls round the banked corners (race-banks.js `bowl`), then the road over them,
  moonRoad(g, T, z, O, D, BD);
  bowlWalls(g, T, BD);         // then their walls' banking shaded over the road, and its lines
  canyonStatic(g, T, BD, D);   // Hadley Rille's walls (art/rille.js)
  driverStatic(g, T, BD);      // the mass driver's bed (art/massdriver.js)
  if (T.mech.crests) crestsArt(g, T, T.mech.crests, BD, D);   // the Apennine Crests (race-crests.js)
  landingField(g, T, z, R, BD);
  returnRow(g, T, z, R, BD);
  if (O.base) base(g, O.base, BD, D);
  for (const u of T.mech.tunnels) habShadow(g, T, u);
  if (O.obs) observatory(g, O.obs, BD);
  g.restore();
}
// the Moon's roads: dark sintered basalt in hexagonal tiles, a berm of pushed-up dust either side (lit on the top left,
// in shadow on the bottom right), cyan dashed edge lines, kerbs in blue and white where it bends; not on the rides'
// stretches
function moonRoad(g, T, z, O, D, BD) {
  const cuts = [[z.spans[0][0], z.sGate + 10], [z.sRetEnd - 2, T.L * 2]];
  const runs = []; let s = z.sGate + 10; for (const [a, b] of cuts) { if (b < s) continue; if (a > s) runs.push([s, a]); s = Math.max(s, b); }
  for (const [a, b] of runs) {
    band(g, T, a, b, q => q.hw + 30, q => -q.hw - 30); g.fillStyle = M.sh2; g.save(); g.translate(8, 10); g.fill(); g.restore();
    band(g, T, a, b, q => q.hw + 26, q => -q.hw - 26); g.fillStyle = BD ? '#e4dfd4' : '#e8e3d8'; g.fill();   // the berm, lit
    band(g, T, a, b, q => q.hw + 6, q => -q.hw - 6); g.fillStyle = '#3a3d4a'; g.fill();
    band(g, T, a, b, q => q.hw, q => -q.hw); g.fillStyle = BD ? M.road : linear(g, 0, T.bbox.y, 0, z.gate.y, [[0, M.road2], [1, M.road]]); g.fill();
    if (D > 0.5) { g.save(); g.clip(); hexes(g, T, a, b); g.globalAlpha = 0.25; g.fillStyle = pattern(g, 1.4); g.fillRect(-1e5, -1e5, 2e5, 2e5); g.globalAlpha = 1; g.restore(); }
    for (let s2 = a + 6; s2 < b - 6; s2 += 8) {
      const q = trackSample(T, s2), k = curvAt(T, s2);
      for (const sd of [-1, 1]) {
        if (Math.abs(k) > 1 / 520 && Math.sign(k) * sd > 0 === false) { const kk = Math.floor(s2 / 24) % 2, o2 = sd * (q.hw - 5); g.fillStyle = M.kerb[kk]; g.beginPath(); g.arc(q.x + q.nx * o2, q.y + q.ny * o2, 6.5, 0, TAU); g.fill(); }
        else if (Math.floor(s2 / 32) % 2 === 0) { const o = sd * (q.hw - 10); g.fillStyle = BD ? M.edge : 'rgba(125,249,255,0.8)'; g.beginPath(); g.arc(q.x + q.nx * o, q.y + q.ny * o, 2.6, 0, TAU); g.fill(); }
      }
    }
  }
}
// ------------------------------------------------------------------------------------------------ the crater bowls
// a bowl's circle: the middle of the bend it's built round, its radius, its road's half-width, and where along the lap
const bowlsOf = T => T.mech.banks.filter(b => b.bowl).map(b => { const s = (b.s0 + b.s1) / 2, q = trackSample(T, s), k = curvAt(T, s); return { b, x: q.x + q.nx / k, y: q.y + q.ny / k, R: Math.abs(1 / k), hw: q.hw }; });
// the crater each bowl is: a raised rim round it (lit on its top left, its shadow cast down-right), the ejecta skirt
// outside it, and the floor inside the road's inner edge (terraced, with a few boulders and a little central peak)
function bowlCraters(g, T, BD, D) {
  for (const C of bowlsOf(T)) {
    const { x, y, R, hw } = C, rIn = R - hw, rOut = R + hw, rim = rOut + 34;
    if (!BD) { g.fillStyle = radial(g, x, y, rim, x, y, rim + 260, [[0, 'rgba(250,247,238,0.35)'], [1, 'rgba(250,247,238,0)']]); circ(g, x, y, rim + 260); g.fill(); }   // the ejecta, bright
    g.fillStyle = 'rgba(22,22,44,0.22)'; circ(g, x + 22, y + 28, rim + 26); g.fill();   // the rim's shadow, down-right
    g.fillStyle = BD ? '#e6e1d6' : linear(g, x - rim, y - rim, x + rim, y + rim, [[0, '#fbf8f0'], [0.5, '#ddd7cb'], [1, '#a8a296']]); circ(g, x, y, rim + 22); g.fill();   // the rim, its outer slope
    g.fillStyle = BD ? '#bfb9ad' : '#c3bdb1'; circ(g, x, y, rim); g.fill();
    // the floor: a shallow dish, a crescent of shadow under its top-left wall, terraces, a little peak
    g.save(); circ(g, x, y, rIn); g.clip();
    g.fillStyle = BD ? '#b6b0a4' : linear(g, x - rIn, y - rIn, x + rIn, y + rIn, [[0, '#a29c90'], [1, '#d6d0c4']]); g.fillRect(x - rIn, y - rIn, rIn * 2, rIn * 2);
    if (!BD) { g.globalAlpha = 0.5; g.fillStyle = pattern(g, 2.4); g.fillRect(x - rIn, y - rIn, rIn * 2, rIn * 2); g.globalAlpha = 1; }
    for (let k = 1; k <= 2; k++) { g.strokeStyle = 'rgba(255,255,250,0.25)'; g.lineWidth = 5; circ(g, x + k * 3, y + k * 4, rIn * (1 - k * 0.18)); g.stroke(); }
    g.fillStyle = BD ? 'rgba(38,40,70,0.32)' : 'rgba(30,32,62,0.38)'; g.beginPath(); g.arc(x, y, rIn * 1.02, 0, TAU); g.arc(x + rIn * 0.22, y + rIn * 0.26, rIn * 1.02, 0, TAU, true); g.fill('evenodd');
    { const pr = rIn * 0.16; g.fillStyle = 'rgba(24,25,48,0.35)'; ell(g, x + pr, y + pr, pr * 1.4, pr * 0.65, 0.75); g.fill(); g.fillStyle = BD ? '#e2ddd3' : linear(g, x - pr, y - pr, x + pr, y + pr, [[0, '#fbf8f0'], [1, '#9e988c']]); smooth(g, [[x - pr, y + pr * 0.35], [x - pr * 0.25, y - pr * 0.9], [x + pr * 0.55, y - pr * 0.45], [x + pr, y + pr * 0.45], [x, y + pr * 0.75]]); g.fill(); }
    if (D > 0.5) { const rng = mulberry(Math.round(x)); for (let k = 0; k < 18; k++) { const a = rng() * TAU, d = rIn * (0.35 + rng() * 0.55); boulder(g, x + Math.cos(a) * d, y + Math.sin(a) * d, 4 + rng() * 7, rng, BD); } }
    g.restore();
    // the inner lip: a pale edge where the floor meets the road's inner edge
    g.strokeStyle = BD ? '#e2ddd3' : 'rgba(250,247,238,0.8)'; g.lineWidth = 8; circ(g, x, y, rIn + 2); g.stroke();
  }
}
// over a bowl's road: its outer half is the crater's inner wall, banked up toward the rim. Shaded by which way it faces
// (the wall on the bowl's bottom right faces the sun on the top left: lit; on its top left, in shadow) and darker up
// toward the rim; the velodrome's lines: the blue band where the floor meets the wall, a red line up it, a blue one higher
function bowlWalls(g, T, BD) {
  for (const C of bowlsOf(T)) {
    const z = C.b, sd = -z.side;   // (the outside of the bend, as a lateral sign)
    // (a conic gradient round the bowl's middle: its colour turns with the way the wall faces, no seams; four bands up it)
    const conic = !!g.createConicGradient, lit = a => (Math.cos(a) + Math.sin(a)) / Math.SQRT2;   // (the wall faces in: lit where the bowl's bottom right is)
    const col = (l, up, f = 1) => l > 0 ? `rgba(255,252,240,${(0.05 + 0.12 * l * up) * f})` : `rgba(18,20,44,${(0.08 + 0.22 * -l * up) * f})`;
    for (let k = 0; k < 4; k++) {
      const a0 = 0.08 + k * 0.23, a1 = a0 + 0.23, up = (k + 1) / 4;
      if (conic) {
        const P = [], Q = []; for (let s = z.s0 - 60; s <= z.s1 + 60; s += 8) { const q = trackSample(T, s); P.push([q.x + q.nx * sd * q.hw * a0, q.y + q.ny * sd * q.hw * a0]); Q.push([q.x + q.nx * sd * q.hw * a1, q.y + q.ny * sd * q.hw * a1]); }
        const grad = g.createConicGradient(0, C.x, C.y); for (let i = 0; i <= 24; i++) grad.addColorStop(i / 24, col(lit(i / 24 * Math.PI * 2), up));
        g.beginPath(); P.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); for (let i = Q.length - 1; i >= 0; i--) g.lineTo(Q[i][0], Q[i][1]); g.closePath(); g.fillStyle = grad; g.fill();
        continue;
      }
      for (let s = z.s0 - 60; s < z.s1 + 60; s += 12) {   // (no conic gradients: in pieces)
        const q = trackSample(T, s), q2 = trackSample(T, s + 12), d = Math.hypot(q.x - C.x, q.y - C.y) || 1, a = sd * q.hw * a0, b2 = sd * q.hw * a1;
        g.beginPath(); g.moveTo(q.x + q.nx * a, q.y + q.ny * a); g.lineTo(q2.x + q2.nx * a, q2.y + q2.ny * a); g.lineTo(q2.x + q2.nx * b2, q2.y + q2.ny * b2); g.lineTo(q.x + q.nx * b2, q.y + q.ny * b2); g.closePath();
        g.fillStyle = col(((q.x - C.x) + (q.y - C.y)) / d / Math.SQRT2, up); g.fill();
      }
    }
    // the lines round the bowl
    const ring = (o, w, col, dash) => { g.strokeStyle = col; g.lineWidth = w; if (dash) g.setLineDash(dash); g.beginPath(); for (let s = z.s0; s <= z.s1; s += 10) { const q = trackSample(T, s), off = sd * q.hw * o; s === z.s0 ? g.moveTo(q.x + q.nx * off, q.y + q.ny * off) : g.lineTo(q.x + q.nx * off, q.y + q.ny * off); } g.stroke(); g.setLineDash([]); };
    ring(0.04, 16, BD ? '#4f9fe8' : 'rgba(80,160,235,0.55)');
    ring(0.4, 4, BD ? '#ff5a4a' : 'rgba(255,90,74,0.8)');
    ring(0.72, 4, BD ? '#3fa7ff' : 'rgba(63,167,255,0.75)', [26, 14]);
  }
}
// ------------------------------------------------------------------------------------------------ the Apennine Crests
// the crests: each a long round mound across the road and well out into the dust either side, shaded along its length by
// its slope (rising toward the sun on the top left lit, falling away from it in shadow), ripples across it; a pale line
// over its top, and amber chevrons up the road's edges where it starts to go light
function crestsArt(g, T, Z, BD, D) {
  const sunOf = q => -(q.tx + q.ty) / Math.SQRT2;   // (how far the way you drive points toward the sun on the top left)
  for (const C of Z.list) {
    const a = C.s0 - 30, b = C.s1 + 30, q = trackSample(T, C.s), qa = trackSample(T, a), qb = trackSample(T, b), rx = (b - a) / 2 + 30, ry = q.hw + 210;
    const grad = g.createLinearGradient(qa.x, qa.y, qb.x, qb.y);
    for (let s2 = a; s2 <= b; s2 += 10) { const v = clamp(-crestGr(Z, s2) * sunOf(trackSample(T, s2)) * 5, -1, 1); grad.addColorStop((s2 - a) / (b - a), v > 0 ? `rgba(255,252,242,${(BD ? 0.55 : 0.5) * v})` : `rgba(20,22,48,${(BD ? 0.5 : 0.46) * -v})`); }
    g.fillStyle = grad; ell(g, q.x, q.y, rx, ry, Math.atan2(q.ty, q.tx)); g.fill();
    if (D > 0.5 && !BD) { g.save(); ell(g, q.x, q.y, rx, ry, Math.atan2(q.ty, q.tx)); g.clip(); g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 3;   // ripples in the dust, across its slope
      for (let s2 = a; s2 <= b; s2 += 26) { const p = trackSample(T, s2); g.beginPath(); for (let o = -ry; o <= ry; o += 20) { const w = Math.sin(o * 0.03 + s2) * 6; const x = p.x + p.nx * o + p.tx * w, y = p.y + p.ny * o + p.ty * w; o === -ry ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); } g.restore(); }
    // the top: a pale line across the road
    const ang = Math.atan2(q.ty, q.tx);
    g.save(); g.translate(q.x, q.y); g.rotate(ang); g.fillStyle = BD ? 'rgba(244,243,239,0.85)' : 'rgba(255,253,245,0.7)'; g.fillRect(-3, -q.hw - 30, 6, (q.hw + 30) * 2); g.restore();
    // where it starts to go light: amber chevrons up both edges of the road
    for (const f of [0.75, 0.5]) {
      const p = trackSample(T, C.s - C.w * f), pa = Math.atan2(p.ty, p.tx);
      for (const sd of [-1, 1]) { const o = sd * (p.hw - 16); g.save(); g.translate(p.x + p.nx * o, p.y + p.ny * o); g.rotate(pa); g.strokeStyle = BD ? BK.ink : 'rgba(30,30,50,0.5)'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(-8, -12); g.lineTo(6, 0); g.lineTo(-8, 12); g.stroke(); g.strokeStyle = '#ffb43a'; g.lineWidth = 5; g.stroke(); g.restore(); }
    }
  }
}
// the road's hexagonal tiles: a faint honeycomb of seams across it (clipped to it by the caller)
function hexes(g, T, a, b) {
  const R = 22, w = R * Math.sqrt(3);
  const q0 = trackSample(T, a), q1 = trackSample(T, b), x0 = Math.min(q0.x, q1.x) - 600, y0 = Math.min(q0.y, q1.y) - 600, x1 = Math.max(q0.x, q1.x) + 600, y1 = Math.max(q0.y, q1.y) + 600;
  g.strokeStyle = M.tile; g.lineWidth = 2; g.beginPath();
  for (let y = y0, row = 0; y < y1; y += R * 1.5, row++) for (let x = x0 + (row % 2) * w / 2; x < x1; x += w) { for (let k = 0; k < 6; k++) { const a1 = Math.PI / 6 + k * Math.PI / 3, a2 = a1 + Math.PI / 3; g.moveTo(x + Math.cos(a1) * R, y + Math.sin(a1) * R); g.lineTo(x + Math.cos(a2) * R, y + Math.sin(a2) * R); } }
  g.stroke();
}
// fused-regolith shoulders along a stretch of the road (lit on the top left), and a slab from the road out to each pad
function apron(g, T, s0, s1, pads, BD) {
  band(g, T, s0, s1, q => q.hw + 46, q => -(q.hw + 46), 20); g.fillStyle = M.sh2; g.save(); g.translate(8, 12); g.fill(); g.restore();
  g.fillStyle = BD ? '#c2beb5' : '#cbc7be'; g.fill();
  for (const B of pads) { const q = trackSample(T, B.s), a = Math.atan2(q.ty, q.tx), p = B.pad, d = B.dock || { x: q.x + q.nx * B.side * q.hw, y: q.y + q.ny * B.side * q.hw }, L2 = Math.hypot(p.x - d.x, p.y - d.y);
    g.save(); g.translate((p.x + d.x) / 2, (p.y + d.y) / 2); g.rotate(a);
    g.fillStyle = M.sh2; g.fillRect(-80 + 10, -L2 / 2 + 12, 160, L2); g.fillStyle = BD ? '#c2beb5' : '#cbc7be'; g.fillRect(-80, -L2 / 2, 160, L2); g.fillStyle = BD ? '#d2cec5' : '#d6d2c9'; g.fillRect(-70, -L2 / 2 + 6, 140, L2 - 12);
    g.strokeStyle = 'rgba(0,0,0,0.07)'; g.lineWidth = 2; for (let k = -60; k < 70; k += 40) { g.beginPath(); g.moveTo(k, -L2 / 2); g.lineTo(k, L2 / 2); g.stroke(); }
    g.restore(); }
}
// a landing pad: a ring of fused dust, a yellow circle, its lights, scorched in the middle
function pad(g, p, BD, ring = '#f4c430') {
  g.fillStyle = M.sh; circ(g, p.x + 14, p.y + 18, 100); g.fill();
  g.fillStyle = BD ? '#a8a9ad' : radial(g, p.x - 30, p.y - 30, 5, p.x, p.y, 100, [[0, '#c6c6ca'], [1, '#9a9ba0']]); circ(g, p.x, p.y, 96); g.fill();
  g.fillStyle = BD ? 'rgba(40,38,50,0.35)' : radial(g, p.x, p.y, 0, p.x, p.y, 72, [[0, 'rgba(30,28,36,0.6)'], [1, 'rgba(30,28,36,0)']]); circ(g, p.x, p.y, 72); g.fill();
  g.strokeStyle = ring; g.lineWidth = 6; circ(g, p.x, p.y, 62); g.stroke();
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.fillStyle = '#3d4249'; circ(g, p.x + Math.cos(a) * 84, p.y + Math.sin(a) * 84, 5); g.fill(); }
}
// the landing field: an apron along the road up to the gate, a pad for each rocket, the gate's arch
function landingField(g, T, z, R, BD) {
  const s0 = Math.min(...R.mpads.map(m => m.s)) - 200, s1 = z.sGate + 60;
  apron(g, T, s0, s1, R.mpads, BD);
  band(g, T, s0 + 40, z.sGate + 30, q => q.hw, q => -q.hw, 20); g.fillStyle = M.road; g.fill();
  for (let s = s0 + 60; s < z.sGate; s += 60) { const [x, y] = at(T, s, 0), q = trackSample(T, s); g.fillStyle = 'rgba(255,214,60,0.8)'; g.save(); g.translate(x, y); g.rotate(Math.atan2(q.ty, q.tx)); g.fillRect(-14, -3, 28, 6); g.restore(); }
  for (const Mp of R.mpads) pad(g, Mp.pad, BD);
  gate(g, z.gate, BD);
}
// a gate: two pylons and an arch over the road (its lamps are live)
function gate(g, G, BD) {
  const a = Math.atan2(G.ny, G.nx), L = G.hw + 30;
  g.fillStyle = M.sh2; g.save(); g.translate(G.x + 30, G.y + 30); g.rotate(a); g.fillRect(-L, -8, L * 2, 16); g.restore();
  for (const sd of [-1, 1]) { const x = G.x + G.nx * sd * L, y = G.y + G.ny * sd * L; g.fillStyle = BD ? '#5c626b' : linear(g, x - 12, 0, x + 12, 0, [[0, '#9aa0aa'], [1, '#4b5059']]); g.beginPath(); g.roundRect(x - 12, y - 90, 24, 92, 6); g.fill(); g.fillStyle = '#2b2f38'; g.fillRect(x - 8, y - 84, 16, 36); }
}
// the Return Row: an apron along the road to its end, a pad for each capsule in one line down one side (the capsules on
// their stands are live: art/moonshot.js), each with its boarding ramp up from the road's edge and the lane onto it
function returnRow(g, T, z, R, BD) {
  const s0 = R.sRet0 - 300, s1 = z.sRetEnd + 40;
  apron(g, T, s0, s1, R.rbays, BD);
  band(g, T, s0 + 20, z.sRetEnd, q => q.hw, q => -q.hw, 20); g.fillStyle = M.road; g.fill();
  const end = trackSample(T, z.sRetEnd); g.fillStyle = M.road; circ(g, end.x, end.y, end.hw * 1.05); g.fill(); g.strokeStyle = M.edge; g.lineWidth = 5; g.setLineDash([16, 12]); circ(g, end.x, end.y, end.hw * 0.8); g.stroke(); g.setLineDash([]);
  for (const B of R.rbays) { pad(g, B.pad, BD, M.edge); rampLane(g, T, B, M.edge, BD); drawRamp(g, B, HATCH[1], BD, { steel: '#d6d8dc', edge: M.edge }); }
}
// the base: white domes in orange and teal trim joined by tubes, a greenhouse dome full of green, banks of solar
// panels, a dish, the flag, rover tracks round it
function base(g, p, BD, D) {
  if (D > 0.5) { g.strokeStyle = 'rgba(90,86,80,0.25)'; g.lineWidth = 3; for (let k = 0; k < 3; k++) { const r = 330 + k * 90; g.beginPath(); for (let a = 0; a <= TAU + 0.01; a += 0.08) { const rr = r + Math.sin(a * 3 + k) * 40; g.lineTo(p.x + Math.cos(a) * rr * 1.25, p.y + Math.sin(a) * rr * 0.8); } g.stroke(); } }
  const domes = [[-250, -250, 92, M.orange], [150, -230, 74, M.teal], [-240, 240, 72, M.teal], [230, 250, 88, M.orange], [-40, -330, 54, M.teal]];
  for (const [x, y] of domes) { const ty = Math.sign(y) * 110; g.strokeStyle = '#a9adb5'; g.lineWidth = 30; g.beginPath(); g.moveTo(p.x + x * 0.6, p.y + ty); g.lineTo(p.x + x, p.y + y); g.stroke(); g.strokeStyle = '#e3e7ee'; g.lineWidth = 20; g.stroke(); }
  // the hub the tubes meet at: a long low module across the middle
  g.fillStyle = M.sh; g.beginPath(); g.roundRect(p.x - 170 + 24, p.y - 110 + 30, 340, 220, 60); g.fill();
  g.fillStyle = BD ? '#eef1f5' : linear(g, p.x - 170, p.y - 110, p.x + 170, p.y + 110, [[0, '#ffffff'], [1, '#c9cfd8']]); g.beginPath(); g.roundRect(p.x - 170, p.y - 110, 340, 220, 60); g.fill();
  g.strokeStyle = M.orange; g.lineWidth = 12; g.beginPath(); g.roundRect(p.x - 158, p.y - 98, 316, 196, 50); g.stroke();
  for (let k = -2; k <= 2; k++) { g.fillStyle = '#7fd3ff'; circ(g, p.x + k * 56, p.y - 30, 12); g.fill(); }
  g.fillStyle = M.teal; g.beginPath(); g.roundRect(p.x - 60, p.y + 20, 120, 50, 12); g.fill();
  if (BD) { g.strokeStyle = BK.ink; g.lineWidth = 2.5; g.beginPath(); g.roundRect(p.x - 170, p.y - 110, 340, 220, 60); g.stroke(); }
  for (const [x, y, r, col] of domes) {
    const cx = p.x + x, cy = p.y + y;
    g.fillStyle = M.sh; ell(g, cx + r * 0.5, cy + r * 0.55, r * 1.05, r * 0.9); g.fill();
    g.fillStyle = BD ? '#eef1f5' : radial(g, cx - r * 0.38, cy - r * 0.42, r * 0.08, cx, cy, r, [[0, '#ffffff'], [0.7, '#e3e7ee'], [1, '#a9b1bd']]); circ(g, cx, cy, r); g.fill();
    g.strokeStyle = col; g.lineWidth = r * 0.12; circ(g, cx, cy, r * 0.94); g.stroke();
    g.strokeStyle = 'rgba(120,130,145,0.4)'; g.lineWidth = 2; for (let k = 1; k < 3; k++) { circ(g, cx, cy, r * k / 3); g.stroke(); }
    g.fillStyle = '#7fd3ff'; circ(g, cx - r * 0.28, cy - r * 0.3, r * 0.18); g.fill(); g.fillStyle = 'rgba(255,255,255,0.8)'; circ(g, cx - r * 0.33, cy - r * 0.36, r * 0.06); g.fill();
    if (BD) { g.strokeStyle = BK.ink; g.lineWidth = 2.5; circ(g, cx, cy, r); g.stroke(); }
  }
  // the greenhouse: a glass dome full of plants
  { const cx = p.x - 20, cy = p.y + 420, r = 80; g.fillStyle = M.sh; ell(g, cx + 40, cy + 45, r * 1.05, r * 0.9); g.fill(); g.fillStyle = '#4c9a4a'; circ(g, cx, cy, r); g.fill(); const rng = mulberry(5); for (let k = 0; k < 14; k++) { g.fillStyle = k % 3 ? '#6cc05a' : '#ffd84a'; circ(g, cx + (rng() - 0.5) * r * 1.4, cy + (rng() - 0.5) * r * 1.4, 8 + rng() * 10); g.fill(); }
    g.fillStyle = BD ? 'rgba(180,230,255,0.25)' : radial(g, cx - r * 0.4, cy - r * 0.4, 4, cx, cy, r, [[0, 'rgba(255,255,255,0.6)'], [0.5, 'rgba(180,230,255,0.15)'], [1, 'rgba(180,230,255,0.35)']]); circ(g, cx, cy, r); g.fill(); g.strokeStyle = '#e3e7ee'; g.lineWidth = 5; g.stroke(); }
  // solar arrays
  for (let k = 0; k < 8; k++) {
    const x = p.x - 560 + (k % 4) * 82, y = p.y - 620 + Math.floor(k / 4) * 110;
    g.fillStyle = M.sh; g.fillRect(x + 14, y + 16, 70, 90);
    g.fillStyle = BD ? M.panel : linear(g, x, y, x + 70, y + 90, [[0, '#4a70d0'], [0.5, '#22397e'], [1, '#2e4a9a']]); g.fillRect(x, y, 70, 90);
    g.strokeStyle = 'rgba(160,190,255,0.6)'; g.lineWidth = 1.5; for (let j = 1; j < 4; j++) { g.beginPath(); g.moveTo(x, y + j * 22.5); g.lineTo(x + 70, y + j * 22.5); g.stroke(); } g.beginPath(); g.moveTo(x + 35, y); g.lineTo(x + 35, y + 90); g.stroke();
    if (!BD) { g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 26, y); g.lineTo(x, y + 30); g.fill(); }
    g.strokeStyle = '#d6d9de'; g.lineWidth = 3; g.strokeRect(x, y, 70, 90);
  }
  // the dish and the flag
  const dx = p.x - 260, dy = p.y + 430;
  g.fillStyle = M.sh; ell(g, dx + 40, dy + 20, 54, 18, 0.4); g.fill();
  g.fillStyle = '#9aa0a8'; g.fillRect(dx - 4, dy - 60, 8, 60);
  g.save(); g.translate(dx, dy - 70); g.rotate(-0.5); ell(g, 0, 0, 46, 28); g.fillStyle = '#eef1f5'; g.fill(); ell(g, 4, 3, 36, 20); g.fillStyle = '#cdd3dc'; g.fill(); g.strokeStyle = '#8b939e'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -34); g.stroke(); circ(g, 0, -36, 4); g.fillStyle = '#e8473c'; g.fill(); g.restore();
  const fx = p.x + 160, fy = p.y + 420;
  g.fillStyle = M.sh; g.save(); g.translate(fx, fy); g.rotate(0.5); g.fillRect(0, -2, 110, 4); g.restore();
  g.fillStyle = '#9aa0a8'; g.fillRect(fx, fy - 110, 4, 110); g.fillStyle = '#ffd23f'; g.fillRect(fx + 4, fy - 110, 56, 34); g.fillStyle = '#2f7fd0'; circ(g, fx + 32, fy - 93, 10); g.fill(); g.fillStyle = '#ffffff'; circ(g, fx + 28, fy - 96, 3.5); g.fill();
  // the old lander, left from the first visit, and its footprints
  oldLander(g, { x: p.x + 520, y: p.y + 240 }, BD);
}
function oldLander(g, p, BD) {
  g.fillStyle = 'rgba(80,76,72,0.3)'; for (let k = 0; k < 40; k++) { const a = k * 0.4, r = 70 + k * 3; ell(g, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.7, 3, 2, a); g.fill(); }
  g.fillStyle = M.sh; ell(g, p.x + 34, p.y + 34, 64, 42); g.fill();
  g.strokeStyle = '#8b939e'; g.lineWidth = 5; for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.moveTo(p.x + dx * 22, p.y + dy * 18); g.lineTo(p.x + dx * 58, p.y + dy * 50); g.stroke(); circ(g, p.x + dx * 58, p.y + dy * 50, 9); g.fillStyle = '#c9ced6'; g.fill(); }
  g.fillStyle = BD ? M.gold : linear(g, p.x - 32, 0, p.x + 32, 0, [[0, '#f6d27a'], [0.5, '#d9a43a'], [1, '#a8741f']]); g.beginPath(); g.moveTo(p.x - 32, p.y - 20); g.lineTo(p.x - 20, p.y - 30); g.lineTo(p.x + 20, p.y - 30); g.lineTo(p.x + 32, p.y - 20); g.lineTo(p.x + 32, p.y + 22); g.lineTo(p.x - 32, p.y + 22); g.closePath(); g.fill();
  g.fillStyle = '#6b6f78'; g.fillRect(p.x - 18, p.y - 34, 36, 6);
  if (BD) { g.strokeStyle = BK.ink; g.lineWidth = 2.5; g.strokeRect(p.x - 32, p.y - 30, 64, 52); }
}
// the observatory: a big white telescope dome on a ring of fused regolith, its slit open, a radio dish beside it
function observatory(g, p, BD) {
  g.fillStyle = BD ? '#cdc9c1' : '#d2cec5'; circ(g, p.x, p.y, 150); g.fill();
  g.fillStyle = M.sh; ell(g, p.x + 50, p.y + 60, 100, 80); g.fill();
  g.fillStyle = BD ? '#eef1f5' : radial(g, p.x - 40, p.y - 40, 6, p.x, p.y, 92, [[0, '#ffffff'], [0.7, '#e3e7ee'], [1, '#a9b1bd']]); circ(g, p.x, p.y, 90); g.fill();
  g.fillStyle = '#2a2f3a'; g.save(); g.translate(p.x, p.y); g.rotate(-0.7); g.fillRect(-10, -90, 20, 90); g.restore();
  if (BD) { g.strokeStyle = BK.ink; g.lineWidth = 2.5; circ(g, p.x, p.y, 90); g.stroke(); }
}
// the base's hab over the road (race-tunnel.js: its roof hides the road and the karts inside): a long white module,
// rounded at its ends, orange bands round it, a row of portholes down each side, solar panels along its back, its side
// down the screen. A roof layer (render.js caches it, over the karts); its shadow is baked (habShadow)
const habBox = (T, u) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let s = u.s0; s <= u.s1; s += 10) { const q = trackSample(T, s); for (const sd of [-1, 1]) { const x = q.x + q.nx * sd * q.hw, y = q.y + q.ny * sd * q.hw; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } } return { x0: x0 - 40, y0: y0 - 50, x1: x1 + 30, y1: y1 + 40 }; };
export function moonRoofs(T) { return T.mech.tunnels.map(u => { const B = habBox(T, u), H = 34; return { x: B.x0 - 10, y: B.y0 - 10, w: B.x1 - B.x0 + 20, h: B.y1 - B.y0 + H + 20, draw: g => hab(g, B, H) }; }); }
function hab(g, B, H) {
  const BD = bold(), w = B.x1 - B.x0, h = B.y1 - B.y0, r = Math.min(70, h / 2);
  g.fillStyle = BD ? '#c3cad6' : linear(g, 0, B.y1, 0, B.y1 + H, [[0, '#d9dee6'], [1, '#aab2be']]); g.beginPath(); g.roundRect(B.x0, B.y0 + H, w, h, r); g.fill();   // its side
  g.fillStyle = BD ? '#eef1f5' : linear(g, B.x0, B.y0, B.x0, B.y1, [[0, '#ffffff'], [1, '#dfe4eb']]); g.beginPath(); g.roundRect(B.x0, B.y0, w, h, r); g.fill();
  g.save(); g.beginPath(); g.roundRect(B.x0, B.y0, w, h, r); g.clip();
  for (const f of [0.18, 0.82]) { g.fillStyle = M.orange; g.fillRect(B.x0, B.y0 + h * f - 7, w, 14); }   // the bands
  g.fillStyle = BD ? M.panel : linear(g, B.x0, B.y0, B.x1, B.y1, [[0, '#4a70d0'], [0.5, '#22397e'], [1, '#2e4a9a']]);
  for (let x = B.x0 + r; x < B.x1 - r - 40; x += 58) { g.fillRect(x, B.y0 + h * 0.3, 48, h * 0.4); }   // the solar panels on its back
  g.strokeStyle = 'rgba(160,190,255,0.5)'; g.lineWidth = 1.5; for (let x = B.x0 + r; x < B.x1 - r - 40; x += 58) { g.beginPath(); g.moveTo(x + 24, B.y0 + h * 0.3); g.lineTo(x + 24, B.y0 + h * 0.7); g.stroke(); }
  g.restore();
  g.fillStyle = '#7fd3ff'; for (let x = B.x0 + r * 0.8; x < B.x1 - r * 0.8; x += 36) { circ(g, x, B.y1 + H * 0.45, 7); g.fill(); }   // portholes down its side
  for (const ex of [B.x0, B.x1]) { g.fillStyle = M.teal; circ(g, ex + (ex === B.x0 ? r * 0.55 : -r * 0.55), B.y0 + h / 2, r * 0.32); g.fill(); }   // its end caps
  if (BD) { g.strokeStyle = BK.ink; g.lineWidth = 3; g.beginPath(); g.roundRect(B.x0, B.y0, w, h + H, r); g.stroke(); }
}
function habShadow(g, T, u) { const B = habBox(T, u); g.fillStyle = M.sh2; g.beginPath(); g.roundRect(B.x0 + 30, B.y0 + 60, B.x1 - B.x0, B.y1 - B.y0, 60); g.fill(); }

// ------------------------------------------------------------------------------------------------ live
// the plain's beacons (amber, a light chasing along each edge the way you drive), the gates' lamps, the pads' lights
export function moonLive(ctx, race, P) {
  const T = race.track, z = T.mech.rocket, t = race.time, BD = bold(), V = VIEW, x0 = V.x0, x1 = V.x1, y0 = V.y0, y1 = V.y1;
  const G = z.gate, L = G.hw + 30;
  for (const sd of [-1, 1]) { const x = G.x + G.nx * sd * L, y = G.y + G.ny * sd * L; for (let k = 0; k < 3; k++) { const on = Math.floor(t * 3 - k) % 3 === 0; ctx.fillStyle = on ? '#38e07b' : '#1d4a2e'; circ(ctx, x, y - 76 + k * 11, 4); ctx.fill(); } }
  // the pads' lights: a slow chase round each ring
  const R = layoutFor(z, race.cars.length);
  for (const p of [...R.mpads.map(m => m.pad), ...R.rbays.map(b => b.pad)]) { if (p.x < x0 - 120 || p.x > x1 + 120 || p.y < y0 - 120 || p.y > y1 + 120) continue; const k0 = Math.floor(t * 4) % 8; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; ctx.fillStyle = k === k0 ? '#fff6c0' : 'rgba(255,214,90,0.4)'; circ(ctx, p.x + Math.cos(a) * 84, p.y + Math.sin(a) * 84, k === k0 ? 5 : 3.5); ctx.fill(); } }
}
// moon dust: kicked up behind a kart on the Moon, thrown in a slow low-gravity arc that settles (particles with gz)
export function moonDust(race, c, heavy) {
  const n = heavy ? 2 : 1, mare = heavy;
  for (let k = 0; k < n; k++) race.particles.push({ kind: 'drop', x: c.x - Math.cos(c.heading) * c.L * 0.45 + frnd(-10, 10), y: c.y - Math.sin(c.heading) * c.L * 0.45 + frnd(-10, 10), vx: -Math.cos(c.heading) * c.speed * frnd(0.12, 0.3) + frnd(-30, 30), vy: -Math.sin(c.heading) * c.speed * frnd(0.12, 0.3) + frnd(-30, 30), z: 2, vz: frnd(60, 140) * (mare ? 1.3 : 1), gz: 150, col: mare ? '#c8c4bb' : '#d3d0c9', size: frnd(2.2, 4.2), life: frnd(1.4, 2.2), maxLife: 2.2 });
}
