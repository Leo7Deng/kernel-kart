// Kernel Kart art: Moonshot's Earth (art/moonshot.js draws the rest): a spaceport on a tropical cape in bright afternoon
// sun, seen from above like a picture book. The ocean (deep blue out toward the planet's edge, turquoise over the sand
// near shore, white surf on the beach), the barrier island (its beach, the dunes with sea oats; the cape's sandstone sea
// cliffs, the Cliff Road along their top, the lighthouse on its point), the calm green lagoon behind it with its mangroves and seagrass, and the big island beyond: hammocks of dark
// round trees, slash pines, palmetto scrub and cabbage palms in groves, open sunny grass round the buildings, mown in
// stripes. Lit from the top left: every tree, building and rocket casts its shadow down and to the right.
// Baked (render.js): capeGround (the ground; with `rect`, only that part, the same pixels: everything's planned once
// per track, `capeOf`) and capeStatic (the set pieces: the causeways' rock armour, the press site and its countdown
// clock, the lighthouse, the turn basin and its barge, the assembly building (off the road now: its floor, the stages
// in its high bays and its glass roof, all baked), Launch Control, the rocket garden, the visitor centre, the hangar,
// car parks, the Launch Row
// (a pad for every bay, as many as racers: art/moonshot.js rowN), the fuel farm and the water tower, the slipway, the
// recovery dock and ship, the splashdown zones). Live (capeUnder): glints on the water, the surf breathing, the zones'
// buoys blinking, the countdown clock. The launch complex's timed obstacles are art/timed.js.
import { TAU, clamp, lerp, mulberry } from '../core.js';
import { trackSample } from '../geometry.js';
import { HATCH, inSpan, layoutFor } from '../race-rocket.js';
import { bold, BK } from '../look.js';
import { alpha, circ, ell, linear, mix, radial, shade, smooth } from './paint.js';
import { drawRamp, towerOf } from './rockets.js';
import { VIEW } from '../view.js';

// the palette: the sea from deep to the sand, the beach, the land's greens, the lagoon, concrete and buildings
const C = {
  deep: '#145a9a', ocean: '#1e7cc0', sea2: '#2f9ad3', shoal: '#4cbfdc', shoal2: '#7fd8e2', foam: '#ffffff',
  wet: '#d8c08a', sand: '#f2e0ad', sand2: '#e9d29a', dune: '#e2d39b',
  grass: '#86b85a', grass2: '#9cc86a', grass3: '#73a64d', lawn: '#97c964', marsh: '#a8c47a',
  lagoon: '#2f9fb0', lagoon2: '#4fbcbc', lagoonDk: '#227f93', mud: '#b9a874',
  conc: '#e7e3da', conc2: '#d2cdc1', conc3: '#bfb9ac', roof: '#f7f6f2', roof2: '#dfe3ea', face: '#c3cad6',
  shadow: 'rgba(14,40,52,0.26)', ink: '#2a3140', red: '#e2463a', orange: '#ff8a3c', navy: '#24406e', yellow: '#f4c430',
};
// greens for the trees: [dark, mid, light]
const HAMMOCK = [['#24562c', '#33733a', '#4f9447'], ['#2a5f2a', '#3d7f34', '#5e9e44'], ['#1f4f33', '#2f6b42', '#4c8d55']];
const PINE = ['#1f4a2e', '#2f6a3a', '#4e8c48'], PALMETTO = ['#56702f', '#6f8f3a', '#93b14e'], PALM = ['#3f7a2a', '#5c9b34', '#86c24a'], MANGROVE = ['#2b5a2a', '#3e7a36', '#5b9a46'];

// ------------------------------------------------------------------------------------------------ the plan
const plans = new WeakMap();
export function capeOf(T, P) {
  let E = plans.get(T); if (E) return E;
  const d = P.d, W = P.W, Wl = P.Wl, z = P.z, B = T.bbox;
  E = { coast: dense(Wl(d.coast)), lagoon: Wl(d.lagoon), sc: P.sc };   // (the coast as the smooth curve it's drawn as, so the land, the beach and the cliffs all follow the same line)
  // the cliffs: the stretch of the coast between two x's (west to east), cut out of it
  if (d.cliff) { const [xa, xb] = d.cliff.map(v => v * P.sc), C2 = E.coast, at = x => { for (let i = 0; i < C2.length - 1; i++) if (x >= C2[i][0] && x <= C2[i + 1][0]) { const f = (x - C2[i][0]) / (C2[i + 1][0] - C2[i][0]); return [x, lerp(C2[i][1], C2[i + 1][1], f)]; } return null; };
    E.cliff = [at(xa), ...C2.filter(p => p[0] > xa && p[0] < xb), at(xb)].filter(Boolean); E.cliffX = [xa, xb]; }
  // the coast's and the lagoon's ends run on out past the planet's edge (so the land and the lagoon meet the round edge
  // instead of stopping short of it in a straight line)
  { const xa = P.earth.x - P.earth.r - 600, xb = P.earth.x + P.earth.r + 600, xs = E.coast.map(p => p[0]), lo = Math.min(...xs), hi = Math.max(...xs);
    for (const L of [E.coast, E.lagoon]) for (const p of L) { if (p[0] <= lo) p[0] = xa; else if (p[0] >= hi) p[0] = xb; } }
  const bas = d.basin || [0, 0, 0, 0]; E.basin = { x: bas[0] * P.sc, y: bas[1] * P.sc, hw: bas[2] * P.sc, hh: bas[3] * P.sc };
  for (const k of ['lcc', 'press', 'lighthouse', 'dock', 'ship', 'fuel', 'tower', 'garden', 'visitor', 'hangar', 'harbour']) E[k] = W(d[k]);
  if (d.vab) E.vab = { x: d.vab[0] * P.sc, y: d.vab[1] * P.sc, hw: d.vab[2] * P.sc, hh: d.vab[3] * P.sc };
  // the land: south of the coast, down past the bottom of the map
  E.land = [...E.coast, [E.coast[E.coast.length - 1][0], B.y + B.h + 3000], [E.coast[0][0], B.y + B.h + 3000]];
  // where the driven road is (not the rides' stretches), for keeping things off it
  const pts = []; for (let s = 0; s < T.L; s += 24) if (!inSpan(z, s) && s < z.sRowEnd + 200 || s > z.sOut - 100) { const q = trackSample(T, s); if (q.y > P.earth.top) pts.push([q.x, q.y, q.hw]); }
  const G = 160, grid = new Map(); for (const p of pts) { const k = Math.floor(p[0] / G) + ',' + Math.floor(p[1] / G); let b = grid.get(k); if (!b) grid.set(k, b = []); b.push(p); }
  E.roadD = (x, y) => { let best = 600; const cx = Math.floor(x / G), cy = Math.floor(y / G); for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { const b = grid.get((cx + i) + ',' + (cy + j)); if (b) for (const p of b) { const dd = Math.hypot(p[0] - x, p[1] - y) - p[2]; if (dd < best) best = dd; } } return best; };
  // places kept clear of trees: the buildings, the pads, the dock
  const keep = [];
  if (E.vab) keep.push([E.vab.x, E.vab.y, Math.max(E.vab.hw, E.vab.hh) + 140]);
  for (const [k, r] of [['lcc', 260], ['press', 260], ['lighthouse', 170], ['dock', 260], ['fuel', 230], ['tower', 120], ['garden', 330], ['visitor', 330], ['hangar', 280]]) if (E[k]) keep.push([E[k].x, E[k].y, r]);
  keep.push([E.basin.x, E.basin.y, Math.max(E.basin.hw, E.basin.hh) + 120]);
  E.lawns = keep.map(([x, y, r]) => [x, y, r * 1.15]);   // (mown grass round the buildings)
  const R = layoutFor(z, 10); for (const b of R.bays) keep.push([b.pad.x, b.pad.y, 230]);
  E.keep = keep;
  E.free = (x, y, r) => !keep.some(([kx, ky, kr]) => (kx - x) ** 2 + (ky - y) ** 2 < (kr + r) ** 2);
  // salt marshes along the lagoon's shores: pale green flats threaded with winding creeks
  { const mr = mulberry(717); E.marshes = []; for (let i = 0; i < 600 && E.marshes.length < 9; i++) { const k = Math.floor(mr() * (E.lagoon.length - 1)), f = mr(), x = lerp(E.lagoon[k][0], E.lagoon[k + 1][0], f), y = lerp(E.lagoon[k][1], E.lagoon[k + 1][1], f) + (mr() < 0.5 ? -1 : 1) * (60 + mr() * 90), r = 110 + mr() * 120;
    if (inPoly(E.lagoon, x, y) || !inPoly(E.land, x, y) || E.roadD(x, y) < r + 40 || !E.free(x, y, r) || E.marshes.some(m => Math.hypot(m[0] - x, m[1] - y) < m[2] + r)) continue; E.marshes.push([x, y, r, mr()]); } }
  const inMarsh = (x, y) => E.marshes.some(m => Math.hypot(m[0] - x, (m[1] - y) * 1.4) < m[2]);
  // the vegetation: groves where the ground's noise says so, off the road and the buildings
  const rng = mulberry(31337), veg = [], step = 52, X0 = B.x - 300, X1 = B.x + B.w + 300, Y0 = P.earth.top, Y1 = B.y + B.h + 300;
  for (let y = Y0; y < Y1; y += step) for (let x = X0; x < X1; x += step) {
    const px = x + rng() * step, py = y + rng() * step, v = rng(), w = rng();
    if (!inPoly(E.land, px, py) || !onPlanet(P, px, py, -60)) continue;
    const dc = polyDist(E.coast, px, py), inLag = inPoly(E.lagoon, px, py), dl = polyDist(E.lagoon, px, py, true);
    const dr = E.roadD(px, py); if (dr < 46) continue;
    if (inLag) { if (dl < 55 && v < 0.5) veg.push({ k: 'mangrove', x: px, y: py, r: 22 + w * 16, v }); continue; }
    if (!E.free(px, py, 30)) continue;
    if (inMarsh(px, py)) { if (v < 0.12) veg.push({ k: 'oats', x: px, y: py, r: 12 + w * 8, v }); continue; }
    const onCliff = E.cliffX && px > E.cliffX[0] - 60 && px < E.cliffX[1] + 60;
    if (dc < (onCliff ? 30 : 50)) continue;   // the beach (or the cliff's brink)
    if (dc < 150 && !onCliff) { if (v < 0.5) veg.push({ k: 'oats', x: px, y: py, r: 10 + w * 8, v }); continue; }   // the dunes
    if (onCliff && dc < 90) { if (v < 0.25) veg.push({ k: 'palmetto', x: px, y: py, r: 12 + w * 8, v }); continue; }   // wind-cut scrub along the cliff top
    if (dl < 50 && v < 0.6) { veg.push({ k: 'mangrove', x: px, y: py, r: 24 + w * 16, v }); continue; }   // the lagoon's shore
    const h = noise(px / 900, py / 900) * 0.6 + noise(px / 300 + 7, py / 300 + 3) * 0.4, near = clamp((dr - 60) / 140, 0, 1), open = E.free(px, py, 160) ? 1 : 0.15;
    if (h > 0.5) { if (v < 0.97 * near * open) veg.push({ k: 'tree', x: px, y: py, r: 32 + w * 26, v, pal: Math.floor(w * 3) }); }   // hammocks: dark round trees, packed
    else if (h > 0.42) { if (v < 0.8 * near * open) veg.push({ k: v < 0.45 ? 'pine' : 'tree', x: px, y: py, r: 24 + w * 18, v, pal: Math.floor(w * 3) }); }   // pine flatwoods
    else if (h > 0.34) { if (v < 0.6 * near * open) veg.push({ k: v < 0.2 ? 'palm' : 'palmetto', x: px, y: py, r: 20 + w * 14, v }); }   // palmetto scrub with cabbage palms
    else if (v < 0.04 * near) veg.push({ k: 'palm', x: px, y: py, r: 20 + w * 10, v });   // open grass: a palm here and there
  }
  veg.sort((a, b) => a.y - b.y);
  E.veg = veg;
  // soft patches of a darker or lighter green, and the swells out at sea
  E.patches = []; { const PX0 = P.earth.x - P.earth.r, PW = P.earth.r * 2; for (let i = 0; i < 150; i++) E.patches.push([PX0 + rng() * PW, Y0 + rng() * (Y1 - Y0 + 3000), 160 + rng() * 360, rng()]); }   // (out to the planet's edge: a thumbnail shows all of it)
  E.swells = []; for (let i = 0; i < 260; i++) E.swells.push([X0 + rng() * (X1 - X0), Y0 + rng() * 2000, 60 + rng() * 140, rng()]);
  E.grass = []; for (let i = 0; i < 9000; i++) E.grass.push([X0 + rng() * (X1 - X0), Y0 + rng() * (Y1 - Y0), rng(), rng()]);
  plans.set(T, E); return E;
}
// is (x, y) inside the polygon?
export function inPoly(L, x, y) {
  let o = false; for (let i = 0, j = L.length - 1; i < L.length; j = i++) { const [xi, yi] = L[i], [xj, yj] = L[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) o = !o; }
  return o;
}
// how far (x, y) is from a polyline (closed: a polygon's edge)
function polyDist(L, x, y, closed = false) {
  let best = 1e9; const n = L.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [ax, ay] = L[i], [bx, by] = L[(i + 1) % n], dx = bx - ax, dy = by - ay, f = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    best = Math.min(best, Math.hypot(ax + dx * f - x, ay + dy * f - y));
  }
  return best;
}
const onPlanet = (P, x, y, m = 0) => Math.hypot(x - P.earth.x, y - P.earth.y) < P.earth.r + m;
export const inLand = (P, x, y) => { const E = plans.get(P.z.T); return !!E && inPoly(E.land, x, y) && !inPoly(E.lagoon, x, y); };
// smooth value noise, 0..1
function hash(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(x, y) { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return lerp(lerp(hash(i, j), hash(i + 1, j), u), lerp(hash(i, j + 1), hash(i + 1, j + 1), u), v); }
// a smooth closed or open path through points (open: straight to the ends)
function path(g, L, closed) {
  g.beginPath(); if (closed) { smooth(g, L); return; }
  g.moveTo(L[0][0], L[0][1]); for (let i = 1; i < L.length - 1; i++) { const [x, y] = L[i], [nx, ny] = L[i + 1]; g.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2); } g.lineTo(L[L.length - 1][0], L[L.length - 1][1]);
}

// ------------------------------------------------------------------------------------------------ the ground (baked)
// rect: only that part (the rides' stretches, painted back over the road there); null: all of it
export function capeGround(g, T, P, D, rect) {
  const E = capeOf(T, P), BD = bold(), X0 = P.earth.x - P.earth.r - 50, X1 = P.earth.x + P.earth.r + 50, Y1 = P.earth.y + P.earth.r + 50, Y0 = P.earth.top - 50;   // (the whole disc: a thumbnail shows it round)
  const inR = (x, y, m) => !rect || (x > rect.x0 - m && x < rect.x1 + m && y > rect.y0 - m && y < rect.y1 + m);
  const fx0 = rect ? rect.x0 : X0, fy0 = rect ? Math.max(rect.y0, Y0) : Y0, fx1 = rect ? rect.x1 : X1, fy1 = rect ? rect.y1 : Y1; if (fy1 <= fy0) return;
  g.save(); circ(g, P.earth.x, P.earth.y, P.earth.r); g.clip();
  // the ocean: deeper out toward the planet's edge, its long swells
  g.fillStyle = BD ? C.ocean : radial(g, P.earth.x, P.earth.y, P.earth.r - 1300, P.earth.x, P.earth.y, P.earth.r, [[0, C.ocean], [1, C.deep]]); g.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  if (!BD && D > 0.5) for (const [x, y, r, k] of E.swells) { if (!inR(x, y, r * 2)) continue; g.strokeStyle = `rgba(255,255,255,${0.05 + k * 0.05})`; g.lineWidth = 3; g.beginPath(); g.arc(x, y + r * 3, r * 3, -Math.PI / 2 - 0.25, -Math.PI / 2 + 0.25); g.stroke(); continue; g.fillStyle = radial(g, x, y, 0, x, y, r * 2, [[0, `rgba(70,160,225,${0.05 + k * 0.05})`], [1, 'rgba(70,160,225,0)']]); g.fillRect(x - r * 2, y - r * 2, r * 4, r * 4); }
  // over the sand near shore the water goes turquoise, smoothly (many thin steps); the surf; the wet sand
  g.lineJoin = 'round'; g.lineCap = 'round';
  const shore = (w, col) => { g.strokeStyle = col; g.lineWidth = w; path(g, E.coast, false); g.stroke(); };
  if (BD) { shore(520, C.sea2); shore(300, C.shoal); shore(150, C.shoal2); }
  else { for (let k = 0; k < 16; k++) { const f = k / 15; shore(1100 - f * 960, alpha(f < 0.45 ? C.sea2 : f < 0.8 ? C.shoal : C.shoal2, 0.16 + f * 0.12)); } }
  // a reef of coral heads and sea grass, darker patches in the shallows
  if (!BD && D > 0.5) { const rng = mulberry(515); for (let i = 0; i < E.coast.length - 1; i++) { const [ax, ay] = E.coast[i], [bx, by] = E.coast[i + 1], L = Math.hypot(bx - ax, by - ay); for (let f = 0; f < L; f += 70) { const x = lerp(ax, bx, f / L) + (rng() - 0.5) * 60, y = lerp(ay, by, f / L) - 130 - rng() * 300, r = 14 + rng() * 40; if (!inR(x, y, r)) continue; g.fillStyle = rng() < 0.6 ? 'rgba(30,110,140,0.08)' : 'rgba(255,255,240,0.08)'; ell(g, x, y, r * 1.6, r * 0.7, rng() * 0.6 - 0.3); g.fill(); } } }
  // sandbars: pale streaks just offshore
  if (!BD && D > 0.5) { g.save(); g.setLineDash([180, 260]); g.lineDashOffset = 40; shore(130, 'rgba(190,240,236,0.35)'); g.restore(); }
  shore(118, 'rgba(255,255,255,0.85)'); shore(100, C.wet); shore(84, C.sand2);
  // the land
  g.save(); path(g, E.land, true); g.clip();
  g.fillStyle = C.grass; g.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  for (const [x, y, r, k] of E.patches) { if (!inR(x, y, r)) continue; const col = k < 0.4 ? C.grass3 : k < 0.75 ? C.grass2 : C.marsh; if (BD) { g.fillStyle = alpha(col, 0.5); ell(g, x, y, r * 0.8, r * 0.6, k * 3); g.fill(); continue; } g.fillStyle = radial(g, x, y, 0, x, y, r, [[0, alpha(col, 0.7)], [1, alpha(col, 0)]]); g.fillRect(x - r, y - r, r * 2, r * 2); }
  // mown grass round the buildings and along the road: lighter, in stripes
  { const mown = new Path2D(); for (const [x, y, r] of E.lawns) { if (!inR(x, y, r)) continue; mown.moveTo(x + r, y); mown.ellipse(x, y, r, r * 0.85, 0, 0, TAU); }
    g.save(); g.fillStyle = alpha(C.lawn, BD ? 0.6 : 0.32); g.fill(mown);
    g.lineWidth = 2 * 130; g.strokeStyle = alpha(C.lawn, BD ? 0.6 : 0.45); g.lineJoin = 'round';
    g.clip(mown); if (D > 0.5 && !BD) { g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 50; for (let x = fx0 - 3000; x < fx1 + 3000; x += 100) { g.beginPath(); g.moveTo(x, fy0 - 200); g.lineTo(x + 2200, fy1 + 200); g.stroke(); } }
    g.restore(); }
  // grass texture: tiny blades
  if (D > 0.5) { g.lineCap = 'round'; g.lineWidth = 1.2; for (const [x, y, a, k] of E.grass) { if (!inR(x, y, 10)) continue; g.strokeStyle = k < 0.5 ? 'rgba(60,110,40,0.35)' : 'rgba(190,230,140,0.35)'; const l = 4 + a * 4, an = -1.3 + a * 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(an) * l, y + Math.sin(an) * l); g.stroke(); } }
  // the salt marshes: a pale flat, darker tussocks, creeks winding through it out to the lagoon
  for (const [x, y, r, k] of E.marshes) { if (!inR(x, y, r * 1.3)) continue; const mr = mulberry(Math.floor(k * 1e5));
    g.fillStyle = alpha(C.marsh, BD ? 0.9 : 0.75); ell(g, x, y, r * 1.15, r * 0.8); g.fill(); g.fillStyle = alpha('#c3d48c', 0.6); ell(g, x - r * 0.15, y - r * 0.1, r * 0.8, r * 0.5); g.fill();
    if (D > 0.5) for (let i = 0; i < 40; i++) { const a = mr() * TAU, d = Math.sqrt(mr()) * r * 0.95; g.fillStyle = mr() < 0.5 ? 'rgba(90,130,60,0.35)' : 'rgba(200,220,150,0.4)'; ell(g, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, 6 + mr() * 8, 3 + mr() * 4); g.fill(); }
    g.lineCap = 'round'; for (let c2 = 0; c2 < 2; c2++) { let cx = x + (mr() - 0.5) * r, cy = y + (mr() - 0.5) * r * 0.5, a = mr() * TAU; g.beginPath(); g.moveTo(cx, cy); for (let k2 = 0; k2 < 9; k2++) { a += (mr() - 0.5) * 1.4; cx += Math.cos(a) * r * 0.16; cy += Math.sin(a) * r * 0.11; g.lineTo(cx, cy); } g.strokeStyle = '#7d9b5a'; g.lineWidth = 16; g.stroke(); g.strokeStyle = C.lagoon2; g.lineWidth = 10; g.stroke(); } }
  // the beach and the dunes behind it
  g.lineCap = 'round';
  g.strokeStyle = C.dune; g.lineWidth = 300; path(g, E.coast, false); g.stroke();
  if (!BD) { g.strokeStyle = 'rgba(134,184,90,0.5)'; g.lineWidth = 330; g.globalCompositeOperation = 'source-atop'; g.globalCompositeOperation = 'source-over'; }
  g.strokeStyle = C.sand; g.lineWidth = 120; path(g, E.coast, false); g.stroke();
  if (!BD && D > 0.5) { const rng = mulberry(77); for (let i = 0; i < E.coast.length - 1; i++) { const [ax, ay] = E.coast[i], [bx, by] = E.coast[i + 1], L = Math.hypot(bx - ax, by - ay); for (let f = 0; f < L; f += 34) { const x = lerp(ax, bx, f / L), y = lerp(ay, by, f / L) + 20 + rng() * 120; if (!inR(x, y, 20)) continue; g.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(190,160,100,0.18)'; ell(g, x, y, 6 + rng() * 10, 3 + rng() * 4, rng() * 0.5); g.fill(); } } }
  if (E.cliff) cliffs(g, E, BD, D, inR, true);   // (the grass up to the cliffs' brink: in the land)
  // the lagoon: a fringe of marsh and mud, calm green-blue water, lighter over its sandy shallows, darker seagrass beds
  g.lineJoin = 'round';
  for (const [w, col] of [[170, alpha(C.marsh, 0.35)], [120, alpha(C.marsh, 0.55)], [44, alpha('#cdbb86', 0.85)], [30, '#d9c995']]) { g.strokeStyle = col; g.lineWidth = w; path(g, E.lagoon, true); g.stroke(); }
  g.save(); path(g, E.lagoon, true); g.clip();
  g.fillStyle = BD ? C.lagoon : linear(g, 0, E.lagoon[0][1], 0, E.lagoon[0][1] + 400, [[0, C.lagoon2], [0.5, C.lagoon], [1, C.lagoon2]]); g.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  g.strokeStyle = alpha(C.lagoon2, BD ? 1 : 0.8); g.lineWidth = 90; path(g, E.lagoon, true); g.stroke();
  g.strokeStyle = alpha('#8fded0', BD ? 1 : 0.7); g.lineWidth = 34; path(g, E.lagoon, true); g.stroke();
  if (!BD && D > 0.5) { const rng = mulberry(91); for (let i = 0; i < 60; i++) { const x = X0 + rng() * (X1 - X0), y = E.lagoon[0][1] + 60 + rng() * 360, r = 50 + rng() * 120; if (!inR(x, y, r) || !inPoly(E.lagoon, x, y)) continue; g.fillStyle = 'rgba(30,110,100,0.22)'; ell(g, x, y, r, r * 0.45, rng() * 0.5); g.fill(); } }
  g.restore();
  // the turn basin: a dredged rectangle with bulkheads
  { const b = E.basin; if (b.hw && inR(b.x, b.y, 300)) {
    g.fillStyle = C.conc3; g.beginPath(); g.roundRect(b.x - b.hw - 16, b.y - b.hh - 16, b.hw * 2 + 32, b.hh * 2 + 32, 18); g.fill();
    g.fillStyle = BD ? C.lagoonDk : linear(g, b.x, b.y - b.hh, b.x, b.y + b.hh, [[0, C.lagoonDk], [1, C.lagoon]]); g.beginPath(); g.roundRect(b.x - b.hw, b.y - b.hh, b.hw * 2, b.hh * 2, 10); g.fill();
    g.fillStyle = 'rgba(10,40,50,0.35)'; g.fillRect(b.x - b.hw, b.y - b.hh, b.hw * 2, 10); g.fillRect(b.x - b.hw, b.y - b.hh, 10, b.hh * 2);   // the bulkhead's shadow on the water
  } }
  // the trees and scrub: shadows first, then each from the back
  const vs = E.veg.filter(o => inR(o.x, o.y, o.r * 2));
  if (D > 0.5 || vs.length < 4000) {
    for (const o of vs) { if (o.k === 'oats') continue; g.fillStyle = o.k === 'mangrove' ? 'rgba(10,40,40,0.25)' : C.shadow; ell(g, o.x + o.r * 0.5, o.y + o.r * 0.6, o.r * (o.k === 'palm' ? 0.8 : 1.05), o.r * (o.k === 'palm' ? 0.55 : 0.75)); g.fill(); }
    for (const o of vs) plant(g, o, BD, D);
  }
  g.restore();
  if (E.cliff) cliffs(g, E, BD, D, inR, false);   // (the cliffs' faces and the sea at their foot)
  g.restore();
  // the planet's edge: a bright rim of air
  { g.strokeStyle = 'rgba(210,240,255,0.9)'; g.lineWidth = 14; circ(g, P.earth.x, P.earth.y, P.earth.r - 7); g.stroke(); if (!BD) { g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 4; circ(g, P.earth.x, P.earth.y, P.earth.r - 2); g.stroke(); } }
}
// an open path's smooth curve (path(): quadratic curves through the midpoints) as a dense polyline
function dense(L) {
  const out = [L[0]]; let p = L[0];
  for (let i = 1; i < L.length - 1; i++) { const c = L[i], m = [(c[0] + L[i + 1][0]) / 2, (c[1] + L[i + 1][1]) / 2]; for (let k = 1; k <= 8; k++) { const u = k / 8; out.push([(1 - u) ** 2 * p[0] + 2 * u * (1 - u) * c[0] + u * u * m[0], (1 - u) ** 2 * p[1] + 2 * u * (1 - u) * c[1] + u * u * m[1]]); } p = m; }
  out.push(L[L.length - 1]); return out;
}
// a polyline moved d to its left (west to east along the coast: out to sea, north), each point along the mean of its
// neighbouring segments' normals
function offsetLine(L, d) {
  return L.map((p, i) => { const a = L[Math.max(0, i - 1)], b = L[Math.min(L.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [p[0] + dy / l * d, p[1] - dx / l * d]; });
}
// the cape's sea cliffs (the Cliff Road runs along their top): where the beach would be, a sandstone face dropping into
// deep water. Its brink a pale lip with grass to it, the face in bands of warm rock (the strata, cracks down it), its
// foot in shadow, waves breaking white along it, fallen boulders and a few sea stacks standing off it
function cliffs(g, E, BD, D, inR, land) {
  const L = E.cliff, xs = L.map(p => p[0]), ys = L.map(p => p[1]); if (!inR((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, (Math.max(...xs) - Math.min(...xs)) / 2 + 600)) return;
  const line = (P, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); P.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); };
  const band = (A, B2) => { g.beginPath(); A.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); for (let i = B2.length - 1; i >= 0; i--) g.lineTo(B2[i][0], B2[i][1]); g.closePath(); };
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  // the land side: grass back over the dunes; the sea side: deep water back over the sand and the shallows
  if (land) { line(L, 320, C.grass); line(L, 120, alpha(C.grass3, 0.5)); g.restore(); return; }
  g.save(); g.beginPath(); g.rect(-1e5, -1e5, 2e5, 2e5); { const Ld = E.land, n = Ld.length, mid = i => [(Ld[i % n][0] + Ld[(i + 1) % n][0]) / 2, (Ld[i % n][1] + Ld[(i + 1) % n][1]) / 2], m0 = mid(n - 1); g.moveTo(m0[0], m0[1]); for (let i = 0; i < n; i++) { const m = mid(i); g.quadraticCurveTo(Ld[i][0], Ld[i][1], m[0], m[1]); } g.closePath(); } g.clip('evenodd'); line(L, 380, C.sea2); line(offsetLine(L, 120), 160, BD ? C.sea2 : alpha(C.ocean, 0.35)); g.restore();   // (over the sea only: the land as path() smooths it, cut out)
  // the face: from the brink out over the water (a face down to the sea, seen from above), its width wandering
  const rng = mulberry(919), W = L.map((p, i) => 54 + 16 * Math.sin(p[0] * 0.011) + 10 * Math.sin(p[0] * 0.037 + 1) + rng() * 4), out = k => L.map((p, i) => offsetLine(L, W[i] * k)[i]);
  const F0 = L, F1 = out(1), nrm = i => { const a = L[Math.max(0, i - 1)], b = L[Math.min(L.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l, Math.atan2(dy, dx)]; };
  g.fillStyle = 'rgba(10,40,60,0.35)'; band(out(0.6), offsetLine(F1, 24)); g.fill();   // the shadow at its foot, on the water
  band(F0, F1); g.fillStyle = BD ? '#c49a64' : linear(g, 0, Math.min(...ys) - 80, 0, Math.max(...ys), [[0, '#a87c4e'], [0.5, '#c39462'], [1, '#d4aa74']]); g.fill();
  g.save(); band(F0, F1); g.clip();
  // the rock in knobbly buttresses: each a bulge lit on its top left, shaded on its bottom right
  for (let i = 0; i < L.length; i += 3) { const [nx, ny, a] = nrm(i), w = W[i], x = L[i][0] + nx * w * 0.5, y = L[i][1] + ny * w * 0.5, rx = 16 + rng() * 14, ry = w * (0.42 + rng() * 0.12);
    g.fillStyle = BD ? 'rgba(120,84,50,0.32)' : 'rgba(110,76,44,0.3)'; ell(g, x + 5, y + 7, rx, ry, a); g.fill();
    g.fillStyle = BD ? '#d2a870' : rng() < 0.5 ? '#d6ad76' : '#caa06a'; ell(g, x, y, rx * 0.92, ry * 0.9, a); g.fill();
    if (!BD) { g.fillStyle = 'rgba(255,236,200,0.35)'; ell(g, x - 4, y - 5, rx * 0.45, ry * 0.4, a); g.fill(); } }
  g.save(); g.setLineDash([46, 14, 22, 18]); for (const [k, col] of [[0.34, 'rgba(110,72,40,0.35)'], [0.64, 'rgba(96,62,36,0.38)']]) line(out(k).map(([x, y], i) => [x, y + Math.sin(i * 0.9) * 3]), 3, col); g.restore();   // the strata, wavering
  band(out(0.84), F1); g.fillStyle = 'rgba(64,42,28,0.45)'; g.fill();   // its foot, darker, wet
  g.restore();
  line(F0, 7, BD ? '#e9d6a8' : '#f0dfb4'); line(offsetLine(F0, -5), 4, alpha(C.grass3, 0.9));   // the brink: a pale lip, the grass right to it
  // the surf washing along the foot, and boulders fallen into it
  line(offsetLine(F1, 8), 12, 'rgba(255,255,255,0.7)');
  g.save(); g.setLineDash([30, 22, 10, 26]); line(offsetLine(F1, 30), 4, 'rgba(255,255,255,0.55)'); g.restore();
  for (let i = 2; i < L.length - 2; i += 5 + Math.floor(rng() * 6)) { const [nx, ny] = nrm(i), w = W[i] + 4 + rng() * 10, x = L[i][0] + nx * w, y = L[i][1] + ny * w, r = 5 + rng() * 7; if (!inR(x, y, 30)) continue;
    g.fillStyle = BD ? '#8c6a46' : '#94714b'; ell(g, x, y, r, r * 0.8); g.fill(); if (!BD) { g.fillStyle = 'rgba(255,235,200,0.4)'; circ(g, x - r * 0.3, y - r * 0.3, r * 0.35); g.fill(); } }
  // sea stacks: rock pillars left standing out in the water, ringed with foam
  for (let k = 0; k < 5; k++) { const i = 1 + Math.floor(rng() * (L.length - 2)), o = offsetLine(L, W[i] + 90 + rng() * 120)[i], r = 16 + rng() * 14, x = o[0] + (rng() - 0.5) * 80, y = o[1]; if (!inR(x, y, 60)) continue;
    g.fillStyle = 'rgba(255,255,255,0.7)'; ell(g, x, y + 4, r * 1.5, r * 1.1); g.fill(); g.fillStyle = 'rgba(10,40,60,0.3)'; ell(g, x + r * 0.5, y + r * 0.6, r, r * 0.8); g.fill();
    g.fillStyle = BD ? '#b0844f' : linear(g, x - r, y - r, x + r, y + r, [[0, '#d9b07a'], [1, '#8a6440']]); smooth(g, [[x - r, y], [x - r * 0.4, y - r], [x + r * 0.6, y - r * 0.8], [x + r, y + r * 0.2], [x, y + r * 0.9]]); g.fill();
    g.fillStyle = C.grass3; circ(g, x - r * 0.15, y - r * 0.35, r * 0.4); g.fill(); }
  g.restore();
}
// one plant from above, lit from the top left
function plant(g, o, BD, D) {
  const { x, y, r, v } = o;
  if (o.k === 'tree') { const pal = HAMMOCK[o.pal || 0], rng = mulberry(Math.floor(v * 1e6));
    const lobes = []; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + rng(), d = r * (0.35 + rng() * 0.25); lobes.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85, r * (0.5 + rng() * 0.2)]); }
    g.fillStyle = pal[0]; for (const [lx, ly, lr] of lobes) { circ(g, lx, ly, lr); g.fill(); } circ(g, x, y, r * 0.7); g.fill();
    g.fillStyle = pal[1]; for (const [lx, ly, lr] of lobes) { circ(g, lx - lr * 0.15, ly - lr * 0.2, lr * 0.78); g.fill(); }
    if (!BD) { g.fillStyle = pal[2]; for (const [lx, ly, lr] of lobes) if (lx < x + r * 0.1 && ly < y + r * 0.1) { circ(g, lx - lr * 0.3, ly - lr * 0.35, lr * 0.45); g.fill(); } }
    if (v < 0.05) { g.fillStyle = '#ff8fb8'; for (let k = 0; k < 5; k++) { circ(g, x - r * 0.4 + rng() * r * 0.8, y - r * 0.4 + rng() * r * 0.7, 2.6); g.fill(); } }
    return; }
  if (o.k === 'pine') {   // a slash pine: a star of needle tufts round a dark middle
    for (const [col, k, dx] of [[PINE[0], 1, 0], [PINE[1], 0.8, -1.5], [PINE[2], 0.45, -3]]) { g.fillStyle = col; for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + v * 3; g.save(); g.translate(x + dx, y + dx); g.rotate(a); ell(g, r * k * 0.5, 0, r * k * 0.5, r * k * 0.18); g.fill(); g.restore(); } }
    circ(g, x, y, r * 0.18); g.fillStyle = '#5a3e26'; g.fill(); return; }
  if (o.k === 'palm') {   // a cabbage palm: long fronds out from the crown
    for (const [col, k, dx] of [[PALM[0], 1, 0], [PALM[1], 0.82, -1.5], [PALM[2], 0.5, -2.5]]) { g.fillStyle = col; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + v * 5; g.save(); g.translate(x + dx, y + dx); g.rotate(a); ell(g, r * k * 0.55, 0, r * k * 0.55, r * k * 0.16); g.fill(); g.restore(); } }
    circ(g, x - 1, y - 1, r * 0.13); g.fillStyle = '#7a5a34'; g.fill(); return; }
  if (o.k === 'palmetto') {   // saw palmetto: a low mound of stiff fans, darker underneath, lit on the top left
    circ(g, x, y, r * 0.62); g.fillStyle = PALMETTO[0]; g.fill();
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + v * 6, fx = x + Math.cos(a) * r * 0.32, fy = y + Math.sin(a) * r * 0.26, lit = Math.cos(a + 2.36) > 0;
      g.fillStyle = lit ? PALMETTO[2] : PALMETTO[1]; g.beginPath(); g.moveTo(x, y); g.arc(fx, fy, r * 0.42, a - 0.75, a + 0.75); g.closePath(); g.fill();
      if (!BD) { g.strokeStyle = 'rgba(40,60,20,0.35)'; g.lineWidth = 1; for (const da of [-0.4, 0, 0.4]) { g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + Math.cos(a + da) * r * 0.4, fy + Math.sin(a + da) * r * 0.4); g.stroke(); } } }
    return; }
  if (o.k === 'mangrove') { const rng = mulberry(Math.floor(v * 1e6) + 5);
    g.fillStyle = MANGROVE[0]; for (let k = 0; k < 4; k++) { circ(g, x + (rng() - 0.5) * r, y + (rng() - 0.5) * r * 0.7, r * 0.55); g.fill(); }
    g.fillStyle = MANGROVE[1]; for (let k = 0; k < 4; k++) { circ(g, x + (rng() - 0.6) * r * 0.8, y + (rng() - 0.6) * r * 0.6, r * 0.35); g.fill(); }
    if (!BD) { g.fillStyle = MANGROVE[2]; circ(g, x - r * 0.25, y - r * 0.25, r * 0.22); g.fill(); }
    return; }
  if (o.k === 'oats' && D > 0.5) { g.strokeStyle = v < 0.5 ? '#b7a467' : '#8fa255'; g.lineWidth = 1.6; g.lineCap = 'round'; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + k * 3, y - r * 0.6, x + k * 5, y - r); g.stroke(); } }
}

// ------------------------------------------------------------------------------------------------ the set pieces (baked)
const shadowRect = (g, x, y, w, h, H, r = 8) => { g.fillStyle = C.shadow; g.beginPath(); g.roundRect(x + H * 0.6, y + H * 0.8, w, h, r); g.fill(); };
// a building from above: its roof at its footprint, a face down the screen H tall below it, its shadow down-right
function box(g, x, y, w, h, H, roof, face, BD, r = 6) {
  shadowRect(g, x, y, w, h + H, H, r);
  g.fillStyle = face; g.beginPath(); g.roundRect(x, y + h - r, w, H + r, [0, 0, r, r]); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x + w * 0.55, y + h, w * 0.45, H);
  g.fillStyle = roof; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill();
  if (!BD) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + r, y + 1, w - r * 2, 3); }
  else { g.strokeStyle = BK.ink; g.lineWidth = 2.5; g.beginPath(); g.roundRect(x, y, w, h + H, r); g.stroke(); g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + w, y + h); g.stroke(); }
}
// a band along the road between lateral offsets a and b
function band(g, T, s0, s1, a, b, step = 12) {
  const L = [], R = [];
  for (let s = s0; ; s += step) { const ss = Math.min(s, s1), q = trackSample(T, ss), oa = typeof a === 'function' ? a(q) : a, ob = typeof b === 'function' ? b(q) : b; L.push([q.x + q.nx * oa, q.y + q.ny * oa]); R.push([q.x + q.nx * ob, q.y + q.ny * ob]); if (ss >= s1) break; }
  g.beginPath(); L.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]); g.closePath();
}
export function capeStatic(g, T, P, D, n) {
  const E = capeOf(T, P), z = P.z, BD = bold(), R = layoutFor(z, n);
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  causeways(g, T, P, E, BD);
  for (const lg of T.mech.lowg) if (lg.splash) causewayLeap(g, T, lg, BD);
  serviceRoads(g, T, E, BD);
  if (E.press) pressSite(g, T, E.press, BD);
  if (E.lighthouse) lighthouse(g, E.lighthouse, BD);
  if (E.harbour) harbourLight(g, E.harbour, BD);
  if (E.basin.hw) barge(g, E.basin, BD);
  if (E.vab) vab(g, E.vab, BD);
  if (E.lcc) lcc(g, E.lcc, BD);
  if (E.hangar) hangar(g, E.hangar, BD);
  if (E.visitor) visitor(g, E.visitor, BD);
  if (E.garden) rocketGarden(g, E.garden, BD);
  launchRow(g, T, z, R, BD, D);
  if (E.fuel) fuelFarm(g, E.fuel, BD);
  if (E.tower) waterTower(g, E.tower, BD);
  recovery(g, T, z, R, E, BD, P);
  beachLife(g, T, E, BD);
  g.restore();
}
// people come to watch the launches: umbrellas and towels along the beach, sailboats and motor boats offshore, a
// boardwalk over the dunes from the press site
function beachLife(g, T, E, BD) {
  const rng = mulberry(2024), C2 = E.coast, roadD = E.roadD;
  for (let i = 0; i < C2.length - 1; i++) {
    const [ax, ay] = C2[i], [bx, by] = C2[i + 1], L = Math.hypot(bx - ax, by - ay);
    for (let f = 0; f < L; f += 46) {
      const x = lerp(ax, bx, f / L) + (rng() - 0.5) * 30, y = lerp(ay, by, f / L) + 26 + rng() * 26, v = rng();
      if (v > 0.32 || x < 900 || x > 3900 || roadD(x, y) < 40 || !E.free(x, y, 40)) continue;
      const col = ['#e2463a', '#f4c430', '#2f9ad3', '#ff8fb8', '#3fbf6a', '#ffffff'][Math.floor(rng() * 6)];
      g.fillStyle = 'rgba(14,40,52,0.2)'; ell(g, x + 12, y + 10, 16, 8); g.fill();
      g.fillStyle = ['#ffffff', '#ffd3a0', '#9fd8ff'][Math.floor(rng() * 3)]; g.save(); g.translate(x + 14, y + 8); g.rotate(rng() - 0.5); g.fillRect(-9, -4, 18, 8); g.restore();   // a towel
      for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#ffffff' : col; g.beginPath(); g.moveTo(x, y); g.arc(x, y, 14, k / 6 * TAU, (k + 1) / 6 * TAU); g.closePath(); g.fill(); }
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.moveTo(x, y); g.arc(x, y, 14, 0, Math.PI); g.closePath(); g.fill();
    }
  }
  // boats out on the water, their wakes
  for (let i = 0; i < 26; i++) {
    const k = Math.floor(rng() * (C2.length - 1)), f = rng(), x = lerp(C2[k][0], C2[k + 1][0], f), y = lerp(C2[k][1], C2[k + 1][1], f) - 220 - rng() * 520, a = rng() < 0.5 ? 0 : Math.PI, sail = rng() < 0.55;
    if (x < 400 || roadD(x, y) < 300) continue;
    g.save(); g.translate(x, y); g.rotate(a + (rng() - 0.5) * 0.4);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-14, -6); g.lineTo(-60, -16); g.moveTo(-14, 6); g.lineTo(-60, 16); g.stroke();
    g.fillStyle = 'rgba(10,40,70,0.25)'; ell(g, 4, 6, 22, 9); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(-18, -8); g.lineTo(12, -8); g.quadraticCurveTo(26, 0, 12, 8); g.lineTo(-18, 8); g.closePath(); g.fill();
    if (sail) { g.restore(); g.save(); g.translate(x, y); g.fillStyle = 'rgba(14,40,60,0.18)'; g.beginPath(); g.moveTo(2, 0); g.lineTo(40, 18); g.lineTo(20, 22); g.closePath(); g.fill(); g.fillStyle = rng() < 0.5 ? '#ffffff' : '#ffe9c2'; g.beginPath(); g.moveTo(0, -2); g.lineTo(0, -44); g.lineTo(18, -6); g.closePath(); g.fill(); g.strokeStyle = '#8d939d'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -46); g.stroke(); }
    else { g.fillStyle = ['#e2463a', '#2f7fd0', '#f4c430'][i % 3]; g.fillRect(-6, -5, 10, 10); }
    g.restore();
  }
  // a boardwalk over the dunes from the press site down to the beach
  if (E.press) { const x = E.press.x - 120; let y0 = E.press.y - 60; while (y0 > E.press.y - 600 && roadD(x, y0) > 20) y0 -= 8; while (y0 > E.press.y - 600 && roadD(x, y0) < 24) y0 -= 8; let y1 = y0; while (y1 > y0 - 400 && polyDistY(C2, x, y1) > 20) y1 -= 10;
    g.fillStyle = 'rgba(14,40,52,0.2)'; g.fillRect(x - 12 + 6, y1, 24, y0 - y1 + 8); g.fillStyle = BD ? '#b48a5a' : '#c49a68'; g.fillRect(x - 12, y1, 24, y0 - y1); g.strokeStyle = 'rgba(90,60,30,0.4)'; g.lineWidth = 1.5; for (let y = y1; y < y0; y += 8) { g.beginPath(); g.moveTo(x - 12, y); g.lineTo(x + 12, y); g.stroke(); } }
}
// the coast's y at x minus y (positive: (x, y) is inland of it)
function polyDistY(L, x, y) { for (let i = 0; i < L.length - 1; i++) if (x >= L[i][0] && x <= L[i + 1][0]) { const f = (x - L[i][0]) / (L[i + 1][0] - L[i][0]); return y - lerp(L[i][1], L[i + 1][1], f); } return 999; }
// where the road crosses the lagoon (the causeways) or runs out to sea (the harbour's moles): rock armour along both
// sides and a low white railing, foam where the water meets it
function causeways(g, T, P, E, BD) {
  for (const sea of [false, true]) {
    const z = P.z, runs = []; let a = null;
    for (let s = 0; s < T.L; s += 10) { const q = trackSample(T, s), wet = !inSpan(z, s) && q.y > P.earth.top && (sea ? !inPoly(E.land, q.x, q.y) : inPoly(E.lagoon, q.x, q.y)); if (wet && a === null) a = s; if (!wet && a !== null) { runs.push([a - 40, s + 40]); a = null; } }
    g.save();
    if (sea) { g.beginPath(); g.rect(T.bbox.x - 3000, T.bbox.y - 3000, T.bbox.w + 6000, T.bbox.h + 6000); const L = E.land; g.moveTo(L[0][0], L[0][1]); for (let i = 1; i < L.length - 1; i++) g.quadraticCurveTo(L[i][0], L[i][1], (L[i][0] + L[i + 1][0]) / 2, (L[i][1] + L[i + 1][1]) / 2); g.lineTo(L[L.length - 1][0], L[L.length - 1][1]); g.closePath(); g.clip('evenodd'); }   // (over the sea only)
    else { path(g, E.lagoon, true); g.clip(); }   // (over the lagoon only)
    armour(g, T, runs, BD, sea ? 1.4 : 1);
    g.restore();
  }
}
function armour(g, T, runs, BD, big) {
  for (const [s0, s1] of runs) {
    for (const sd of [-1, 1]) {
      band(g, T, s0, s1, q => sd * (q.hw + 22), q => sd * (q.hw + 60 * big)); g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill();
      band(g, T, s0, s1, q => sd * (q.hw + 14), q => sd * (q.hw + 44 * big)); g.fillStyle = BD ? '#9a958a' : '#a39d90'; g.fill();
      const rng = mulberry(Math.round(s0) + (sd > 0 ? 1 : 2));
      for (let s = s0; s < s1; s += 9 / big) { const q = trackSample(T, s), o = sd * (q.hw + 18 + rng() * 22 * big * big), x = q.x + q.nx * o, y = q.y + q.ny * o, r = (6 + rng() * 6) * big; g.fillStyle = 'rgba(30,40,50,0.25)'; ell(g, x + 2, y + 3, r, r * 0.75); g.fill(); g.fillStyle = BD ? '#b4aea2' : rng() < 0.5 ? '#c4beb1' : '#a8a194'; ell(g, x, y, r, r * 0.75); g.fill(); if (!BD) { g.fillStyle = 'rgba(255,255,255,0.35)'; circ(g, x - r * 0.3, y - r * 0.3, r * 0.3); g.fill(); } }
      band(g, T, s0 + 30, s1 - 30, q => sd * (q.hw + 6), q => sd * (q.hw + 10)); g.fillStyle = '#f4f4f0'; g.fill();
      for (let s = s0 + 30; s < s1 - 30; s += 40) { const q = trackSample(T, s), o = sd * (q.hw + 8); g.fillStyle = '#9aa0a8'; circ(g, q.x + q.nx * o, q.y + q.ny * o, 3); g.fill(); }
    }
  }
}
// the harbour light on the end of the outer mole: a round concrete head, a little red-and-white tower, its lamp
function harbourLight(g, p, BD) {
  const { x, y } = p;
  g.fillStyle = 'rgba(14,40,52,0.26)'; circ(g, x + 10, y + 12, 46); g.fill();
  g.fillStyle = BD ? '#d2cdc1' : radial(g, x - 14, y - 14, 4, x, y, 46, [[0, '#ece8de'], [1, '#c4beb1']]); circ(g, x, y, 44); g.fill();
  g.fillStyle = 'rgba(14,40,52,0.24)'; g.beginPath(); g.moveTo(x - 8, y + 6); g.lineTo(x + 8, y + 6); g.lineTo(x + 70, y + 52); g.lineTo(x + 58, y + 60); g.closePath(); g.fill();   // its shadow
  for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#f6f5f2' : C.red; g.fillRect(x - 9 + k * 0.5, y + 6 - (k + 1) * 18, 18 - k, 18); }
  g.fillStyle = '#fff6c8'; g.fillRect(x - 6, y - 76, 12, 8); g.fillStyle = '#2a2f38'; g.beginPath(); g.moveTo(x - 10, y - 76); g.lineTo(x, y - 88); g.lineTo(x + 10, y - 76); g.closePath(); g.fill();
  if (BD) { g.strokeStyle = BK.ink; g.lineWidth = 2; g.strokeRect(x - 9, y - 66, 18, 72); }
}
// the Causeway Leap (race-lowg.js, an Earth leap: `splash`): the bascule bridge over the lagoon's channel is up, so the
// road stops at a lip and starts again across open water: the channel through the gap, its two leaves standing up
// (red and white, their undersides in shadow), the bridge piers, striped ends on the road
function causewayLeap(g, T, lg, BD) {
  const a = lg.c0 - 6, b = lg.c1 + 6;
  band(g, T, a, b, q => q.hw + 64, q => -q.hw - 64, 6); g.fillStyle = BD ? C.lagoonDk : linear(g, 0, trackSample(T, a).y, 0, trackSample(T, b).y, [[0, C.lagoonDk], [0.5, C.lagoon], [1, C.lagoonDk]]); g.fill();
  if (!BD) for (let k = 0; k < 7; k++) { const q = trackSample(T, lerp(a, b, (k + 0.5) / 7)), o = (k % 3 - 1) * q.hw * 0.6; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3; g.beginPath(); g.arc(q.x + q.nx * o, q.y + q.ny * o, 14, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
  for (const [s, dir] of [[lg.c0 - 8, -1], [lg.c1 + 8, 1]]) {
    const e = trackSample(T, s), ang = Math.atan2(e.ty, e.tx);
    // the piers either side, then the leaf standing up off the lip (drawn lifted up the screen)
    for (const sd of [-1, 1]) { const o = sd * (e.hw + 26), x = e.x + e.nx * o, y = e.y + e.ny * o; g.fillStyle = C.shadow; g.fillRect(x - 18 + 8, y - 18 + 10, 36, 36); g.fillStyle = BD ? '#bfb9ac' : '#d2cdc1'; g.fillRect(x - 18, y - 18, 36, 36); g.fillStyle = C.red; circ(g, x, y, 5); g.fill(); }
    const L = e.x + e.nx * e.hw, Ly = e.y + e.ny * e.hw, R = e.x - e.nx * e.hw, Ry = e.y - e.ny * e.hw, H = 78, back = dir * 10, bx = Math.cos(ang) * back, by = Math.sin(ang) * back;
    g.fillStyle = 'rgba(14,40,52,0.3)'; g.beginPath(); g.moveTo(L, Ly); g.lineTo(R, Ry); g.lineTo(R + H * 0.5, Ry + H * 0.3); g.lineTo(L + H * 0.5, Ly + H * 0.3); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(L, Ly); g.lineTo(R, Ry); g.lineTo(R + bx, Ry + by - H); g.lineTo(L + bx, Ly + by - H); g.closePath();
    g.fillStyle = BD ? '#e8473c' : linear(g, 0, Ly, 0, Ly - H, [[0, '#9c2a20'], [1, '#e8473c']]); g.fill();
    g.save(); g.clip(); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 10; for (let k = -6; k < 8; k++) { g.beginPath(); g.moveTo(L + (R - L) * k / 6, Ly + (Ry - Ly) * k / 6); g.lineTo(L + (R - L) * (k + 1) / 6 + bx, Ly + (Ry - Ly) * (k + 1) / 6 + by - H); g.stroke(); } g.restore();
    if (BD) { g.strokeStyle = BK.ink; g.lineWidth = 2.5; g.stroke(); }
    g.save(); g.translate(e.x, e.y); g.rotate(ang); g.fillStyle = '#ffcf33'; g.fillRect(-dir * 10 - 5, -e.hw, 10, e.hw * 2); g.fillStyle = '#1c1c20'; for (let y = -e.hw; y < e.hw; y += 16) g.fillRect(-dir * 10 - 5, y, 10, 8); g.restore();
  }
}
// pale concrete service roads between the buildings, and their car parks
function serviceRoads(g, T, E, BD) {
  const links = [[E.vab && { x: E.vab.x, y: E.vab.y + E.vab.hh }, E.lcc], [E.lcc, E.hangar], [E.garden, E.visitor], [E.press, E.press && { x: E.press.x - 380, y: E.press.y + 40 }]];
  for (const [a, b] of links) { if (!a || !b) continue; for (const [w, col] of [[44, 'rgba(120,120,100,0.25)'], [36, BD ? '#dcd8cd' : C.conc]]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(a.x, b.y); g.lineTo(b.x, b.y); g.stroke(); } g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; g.setLineDash([16, 14]); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(a.x, b.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]); }
  for (const p of [E.lcc && { x: E.lcc.x + 230, y: E.lcc.y - 20 }, E.visitor && { x: E.visitor.x - 10, y: E.visitor.y + 170 }, E.press && { x: E.press.x - 380, y: E.press.y + 20 }]) if (p) carPark(g, p.x, p.y, BD);
}
// a car park: stalls and a few cars in bright colours, a tree island
function carPark(g, x, y, BD) {
  const w = 220, h = 130, rng = mulberry(Math.round(x + y));
  g.fillStyle = BD ? '#8b9098' : '#7d828b'; g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, 12); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2;
  for (const ry of [-h / 2 + 8, h / 2 - 44]) for (let k = 0; k <= 10; k++) { const sx = x - w / 2 + 10 + k * 20; g.beginPath(); g.moveTo(sx, y + ry); g.lineTo(sx, y + ry + 36); g.stroke(); }
  for (const ry of [-h / 2 + 8, h / 2 - 44]) for (let k = 0; k < 10; k++) { if (rng() < 0.35) continue; const cx = x - w / 2 + 20 + k * 20, cy = y + ry + 18, col = ['#e8473c', '#2f7fd0', '#f4c430', '#ffffff', '#3fbf6a', '#ff8a3c', '#9b59b6'][Math.floor(rng() * 7)];
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.roundRect(cx - 6, cy - 12, 15, 28, 4); g.fill(); g.fillStyle = col; g.beginPath(); g.roundRect(cx - 7, cy - 14, 14, 28, 4); g.fill(); g.fillStyle = 'rgba(40,60,80,0.7)'; g.fillRect(cx - 5, cy - 8, 10, 6); }
  g.fillStyle = C.lawn; g.beginPath(); g.roundRect(x - w / 2 + 8, y - 6, w - 16, 12, 6); g.fill();
}
// the press site at the start: two grandstands in bright seats facing the road, flags, the countdown clock (its digits are live)
function pressSite(g, T, p, BD) {
  for (const dx of [-200, 60]) {
    const x = p.x + dx, y = p.y - 30, w = 200, h = 70;
    shadowRect(g, x, y, w, h, 18);
    for (let r = 0; r < 5; r++) { g.fillStyle = r % 2 ? '#f6f5f2' : '#dfe3ea'; g.fillRect(x, y + r * 14, w, 14); for (let k = 0; k < 18; k++) { g.fillStyle = ['#e2463a', '#2f7fd0', '#f4c430', '#3fbf6a'][(k + r * 3 + (dx > 0 ? 1 : 0)) % 4]; g.fillRect(x + 6 + k * 11, y + r * 14 + 4, 7, 6); } }
    g.fillStyle = C.navy; g.fillRect(x - 4, y - 8, w + 8, 8);
    if (BD) { g.strokeStyle = BK.ink; g.lineWidth = 2; g.strokeRect(x, y, w, h); }
  }
  for (let k = 0; k < 5; k++) { const fx = p.x - 220 + k * 120, fy = p.y + 70; g.strokeStyle = '#c9ced6'; g.lineWidth = 3; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx, fy - 70); g.stroke(); g.fillStyle = ['#e2463a', '#2f7fd0', '#f4c430', '#3fbf6a', '#ffffff'][k]; g.beginPath(); g.moveTo(fx, fy - 70); g.lineTo(fx + 26, fy - 63); g.lineTo(fx, fy - 56); g.fill(); }
  // the countdown clock's frame (its digits are live: capeUnder)
  const cx = p.x + 330, cy = p.y + 10;
  shadowRect(g, cx - 70, cy - 26, 140, 52, 20, 6);
  g.fillStyle = '#20242c'; g.beginPath(); g.roundRect(cx - 70, cy - 26, 140, 52, 6); g.fill(); g.fillStyle = '#3a404b'; g.fillRect(cx - 4, cy + 26, 8, 30);
}
// the countdown clock's digits: the race clock counting up, in big amber segments
function clockDigits(ctx, p, t) {
  const cx = p.x + 330, cy = p.y + 10, s = Math.floor(t), m = Math.floor(s / 60), d = [Math.floor(m / 10) % 10, m % 10, Math.floor((s % 60) / 10), s % 10];
  const SEG = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
  const dig = (x, y, n) => { const b = SEG[n], w = 18, h = 30, th = 4, segs = [[x + 2, y, w - 4, th], [x + w - th, y + 2, th, h / 2 - 3], [x + w - th, y + h / 2 + 1, th, h / 2 - 3], [x + 2, y + h - th, w - 4, th], [x, y + h / 2 + 1, th, h / 2 - 3], [x, y + 2, th, h / 2 - 3], [x + 2, y + h / 2 - th / 2, w - 4, th]]; segs.forEach((r, i) => { ctx.fillStyle = b >> i & 1 ? '#ffb43a' : 'rgba(255,180,58,0.08)'; ctx.fillRect(...r); }); };
  for (let k = 0; k < 4; k++) dig(cx - 60 + k * 30 + (k > 1 ? 4 : 0), cy - 15, d[k]);
  ctx.fillStyle = Math.floor(t * 2) % 2 ? '#ffb43a' : 'rgba(255,180,58,0.2)'; ctx.fillRect(cx - 2, cy - 7, 4, 4); ctx.fillRect(cx - 2, cy + 5, 4, 4);
}
// the lighthouse on the cape: black and white bands, a red lantern room, the keeper's cottage
function lighthouse(g, p, BD) {
  const { x, y } = p;
  g.fillStyle = C.conc; g.beginPath(); g.roundRect(x - 110, y - 20, 220, 120, 20); g.fill();
  box(g, x + 30, y + 10, 80, 54, 16, '#c6533e', '#ece6da', BD, 5);   // the cottage, its red roof
  g.fillStyle = 'rgba(14,40,52,0.24)'; g.beginPath(); g.moveTo(x - 14, y + 20); g.lineTo(x + 14, y + 20); g.lineTo(x + 150, y + 110); g.lineTo(x + 130, y + 120); g.closePath(); g.fill();   // its long shadow
  for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#f6f5f2' : '#262a33'; g.fillRect(x - 13 + k * 0.6, y + 20 - (k + 1) * 26, 26 - k * 1.2, 26); }
  g.fillStyle = '#c0392b'; g.beginPath(); g.roundRect(x - 12, y - 156 - 14, 24, 18, 4); g.fill();
  g.fillStyle = '#fff6c8'; g.fillRect(x - 8, y - 166, 16, 8);
  g.fillStyle = '#2a2f38'; g.beginPath(); g.moveTo(x - 14, y - 170); g.lineTo(x, y - 184); g.lineTo(x + 14, y - 170); g.closePath(); g.fill();
}
// the turn basin's barge: a rocket stage lying on its cradle, a little tug alongside
function barge(g, b, BD) {
  const x = b.x - 20, y = b.y + 10, w = 150, h = 54;
  g.fillStyle = 'rgba(10,40,50,0.3)'; g.beginPath(); g.roundRect(x - w / 2 + 8, y - h / 2 + 10, w, h, 10); g.fill();
  g.fillStyle = '#5d636d'; g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, 10); g.fill(); g.fillStyle = '#7d838d'; g.beginPath(); g.roundRect(x - w / 2 + 6, y - h / 2 + 5, w - 12, h - 10, 7); g.fill();
  // the stage: an orange tank lying along it
  g.fillStyle = BD ? C.orange : linear(g, 0, y - 18, 0, y + 18, [[0, '#ffb070'], [0.5, '#ff8a3c'], [1, '#c45a1c']]); g.beginPath(); g.roundRect(x - w * 0.42, y - 16, w * 0.84, 32, 16); g.fill();
  g.strokeStyle = 'rgba(120,50,10,0.35)'; g.lineWidth = 1.5; for (let k = 1; k < 5; k++) { const sx = x - w * 0.42 + k * w * 0.168; g.beginPath(); g.moveTo(sx, y - 16); g.lineTo(sx, y + 16); g.stroke(); }
  if (BD) { g.strokeStyle = BK.ink; g.lineWidth = 2; g.beginPath(); g.roundRect(x - w * 0.42, y - 16, w * 0.84, 32, 16); g.stroke(); }
  g.fillStyle = '#e2463a'; g.beginPath(); g.moveTo(x + w / 2 + 6, y - 14); g.lineTo(x + w / 2 + 44, y - 14); g.quadraticCurveTo(x + w / 2 + 58, y, x + w / 2 + 44, y + 14); g.lineTo(x + w / 2 + 6, y + 14); g.closePath(); g.fill();
  g.fillStyle = '#f6f5f2'; g.fillRect(x + w / 2 + 14, y - 8, 16, 16);
}
// the assembly building's floor and what stands in it (seen through its glass roof, capeRoofs): grey concrete, the high
// bays' yellow markings, rocket stages on their stands either side of the road, an orange tank lying on a cradle
function vabFloor(g, T, V, BD) {
  const x0 = V.x - V.hw, y0 = V.y - V.hh, w = V.hw * 2, h = V.hh * 2;
  g.fillStyle = C.shadow; g.fillRect(x0 + 30, y0 + 40, w + 40, h + 50);
  g.fillStyle = BD ? '#c9c5bb' : linear(g, x0, y0, x0 + w, y0 + h, [[0, '#d9d5cb'], [1, '#bdb8ad']]); g.fillRect(x0, y0, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.07)'; g.lineWidth = 2; for (let k = 40; k < w; k += 40) { g.beginPath(); g.moveTo(x0 + k, y0); g.lineTo(x0 + k, y0 + h); g.stroke(); } for (let k = 40; k < h; k += 40) { g.beginPath(); g.moveTo(x0, y0 + k); g.lineTo(x0 + w, y0 + k); g.stroke(); }
  // the road through it, painted on the floor: smooth grey concrete with yellow edge lines
  if (T) { g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip(); let a = null, b = null;
    for (let s = 0; s < T.L; s += 10) { const q = trackSample(T, s); if (q.x > x0 - 200 && q.x < x0 + w + 200 && q.y > y0 - 200 && q.y < y0 + h + 200) { if (a === null) a = s; b = s; } }
    if (a !== null) { band(g, T, a, b, q => q.hw + 10, q => -q.hw - 10); g.fillStyle = '#9da2aa'; g.fill(); band(g, T, a, b, q => q.hw, q => -q.hw); g.fillStyle = BD ? '#7d828b' : '#868b94'; g.fill();
      for (const sd of [-1, 1]) { band(g, T, a, b, q => sd * (q.hw - 6), q => sd * (q.hw - 12)); g.fillStyle = C.yellow; g.fill(); }
      for (let s = a; s < b; s += 60) { const q = trackSample(T, s); g.save(); g.translate(q.x, q.y); g.rotate(Math.atan2(q.ty, q.tx)); g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.moveTo(10, 0); g.lineTo(-6, -10); g.lineTo(-6, 10); g.closePath(); g.fill(); g.restore(); } }
    g.restore(); }
  // the high bays: two north, two south of the road
  const bays = [[x0 + w * 0.27, y0 + h * 0.2], [x0 + w * 0.73, y0 + h * 0.2], [x0 + w * 0.27, y0 + h * 0.86], [x0 + w * 0.73, y0 + h * 0.86]];
  for (const [bx, by] of bays) {
    g.strokeStyle = C.yellow; g.lineWidth = 4; g.setLineDash([14, 10]); g.strokeRect(bx - 70, by - 50, 140, 100); g.setLineDash([]);
    g.fillStyle = '#4a4f58'; g.fillRect(bx - 40, by - 34, 80, 68);   // the stand
    g.fillStyle = 'rgba(0,0,0,0.25)'; circ(g, bx + 6, by + 8, 30); g.fill();
    g.fillStyle = BD ? '#f6f5f2' : radial(g, bx - 10, by - 10, 2, bx, by, 30, [[0, '#ffffff'], [1, '#c9ced6']]); circ(g, bx, by, 30); g.fill();   // a stage seen from above: its round top
    g.fillStyle = '#2a2f38'; circ(g, bx, by, 9); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 2; circ(g, bx, by, 22); g.stroke();
  }
}
// the assembly building's glass roof (a roof layer over the karts): white walls round it, steel trusses across, glass
// over the middle where the road runs through (you see the karts and the stages under it), the flag and the doors
// painted on its south face
export function capeRoofs() { return []; }
// the assembly building, standing off the road now: its roof (vabRoof) and its south face, the trusses over its glass
function vab(g, V, BD) { g.fillStyle = C.shadow; g.fillRect(V.x - V.hw + 30, V.y - V.hh + 40, V.hw * 2 + 40, V.hh * 2 + 90); vabFloor(g, null, V, BD); vabRoof(g, V); }
function vabRoof(g, V) {
  const BD = bold(), x0 = V.x - V.hw, y0 = V.y - V.hh, w = V.hw * 2, h = V.hh * 2, H = 90, rim = 26;
  // the south face, below the footprint: a white wall with the tall door and a painted flag
  g.fillStyle = BD ? '#c3cad6' : linear(g, 0, y0 + h, 0, y0 + h + H, [[0, '#e3e7ee'], [1, '#bfc6d2']]); g.fillRect(x0, y0 + h, w, H);
  g.fillStyle = '#9aa3b0'; g.fillRect(x0 + w * 0.4, y0 + h, w * 0.2, H); for (let k = 1; k < 6; k++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x0 + w * 0.4, y0 + h + k * H / 6, w * 0.2, 2); }
  g.fillStyle = C.navy; g.fillRect(x0 + 24, y0 + h + 14, 60, 40); for (let k = 0; k < 7; k++) { g.fillStyle = k % 2 ? '#ffffff' : C.red; g.fillRect(x0 + 84, y0 + h + 14 + k * 5.7, 60, 5.7); }
  { const ex = x0 + w - 60, ey = y0 + h + 40; g.fillStyle = C.orange; circ(g, ex, ey, 28); g.fill(); g.fillStyle = C.navy; circ(g, ex, ey, 23); g.fill(); g.fillStyle = '#ffffff'; g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 6 : 14; g.lineTo(ex + Math.cos(a) * rr, ey + Math.sin(a) * rr); } g.closePath(); g.fill(); }   // the spaceport's badge: a white star on a blue disc ringed in orange
  // the roof: a white rim, glass in the middle under a grid of trusses
  g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.rect(x0 + rim, y0 + rim, w - rim * 2, h - rim * 2); g.fillStyle = BD ? '#eef0f4' : '#f4f5f8'; g.fill('evenodd'); g.restore();
  g.fillStyle = BD ? 'rgba(150,200,235,0.28)' : 'rgba(170,215,245,0.22)'; g.fillRect(x0 + rim, y0 + rim, w - rim * 2, h - rim * 2);
  if (!BD) { g.fillStyle = linear(g, x0, y0, x0 + w, y0 + h, [[0, 'rgba(255,255,255,0.25)'], [0.45, 'rgba(255,255,255,0)'], [0.55, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(x0 + rim, y0 + rim, w - rim * 2, h - rim * 2); }
  g.strokeStyle = BD ? '#8f97a3' : 'rgba(110,120,135,0.85)'; g.lineWidth = 5;
  for (let k = 1; k < 6; k++) { const xx = x0 + rim + (w - rim * 2) * k / 6; g.beginPath(); g.moveTo(xx, y0 + rim); g.lineTo(xx, y0 + h - rim); g.stroke(); }
  g.lineWidth = 2; for (let k = 1; k < 8; k++) { const yy = y0 + rim + (h - rim * 2) * k / 8; g.beginPath(); g.moveTo(x0 + rim, yy); g.lineTo(x0 + w - rim, yy); g.stroke(); }
  // the bridge cranes: two yellow beams across, high up
  for (const f of [0.22, 0.78]) { const yy = y0 + h * f; g.fillStyle = C.yellow; g.fillRect(x0 + rim, yy - 7, w - rim * 2, 14); g.fillStyle = '#2a2f38'; g.fillRect(x0 + w * 0.45, yy - 11, 26, 22); }
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 3; g.strokeRect(x0 + rim, y0 + rim, w - rim * 2, h - rim * 2);
  if (BD) { g.strokeStyle = BK.ink; g.lineWidth = 3; g.strokeRect(x0, y0, w, h + H); }
}
// Launch Control: a long white block with a band of windows facing the pads, a bridge across to the assembly building
function lcc(g, p, BD) {
  box(g, p.x - 170, p.y - 70, 340, 120, 40, C.roof, C.face, BD, 8);
  g.fillStyle = '#4f6a8a'; g.fillRect(p.x - 160, p.y + 52, 320, 18); g.fillStyle = 'rgba(255,255,255,0.4)'; for (let k = 0; k < 16; k++) g.fillRect(p.x - 156 + k * 20, p.y + 54, 10, 3);
  for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.beginPath(); g.roundRect(p.x - 140 + k * 74, p.y - 50, 50, 40, 6); g.fill(); }
  for (const [dx, r] of [[-110, 22], [110, 30]]) { g.fillStyle = 'rgba(0,0,0,0.2)'; circ(g, p.x + dx + 8, p.y - 30 + 10, r); g.fill(); g.fillStyle = '#f6f5f2'; circ(g, p.x + dx, p.y - 30, r); g.fill(); g.fillStyle = '#c9ced6'; circ(g, p.x + dx + r * 0.2, p.y - 30 + r * 0.2, r * 0.6); g.fill(); g.strokeStyle = '#8d939d'; g.lineWidth = 2; g.beginPath(); g.moveTo(p.x + dx, p.y - 30); g.lineTo(p.x + dx - r * 0.6, p.y - 30 - r * 0.6); g.stroke(); }   // dishes on its roof
}
// the hangar: a long curved roof with ribs, a big door
function hangar(g, p, BD) {
  const x = p.x - 150, y = p.y - 80, w = 300, h = 150;
  shadowRect(g, x, y, w, h + 30, 30, 20);
  g.fillStyle = C.face; g.fillRect(x, y + h - 10, w, 40); g.fillStyle = '#7a828e'; g.fillRect(x + w * 0.2, y + h, w * 0.6, 30);
  g.fillStyle = BD ? '#e7eaef' : linear(g, x, y, x, y + h, [[0, '#ffffff'], [0.6, '#dfe3ea'], [1, '#b9c0cc']]); g.beginPath(); g.roundRect(x, y, w, h, 20); g.fill();
  g.strokeStyle = 'rgba(80,90,105,0.25)'; g.lineWidth = 2; for (let k = 1; k < 10; k++) { g.beginPath(); g.moveTo(x + k * w / 10, y + 4); g.lineTo(x + k * w / 10, y + h - 4); g.stroke(); }
  if (BD) { g.strokeStyle = BK.ink; g.lineWidth = 2.5; g.beginPath(); g.roundRect(x, y, w, h + 30, 20); g.stroke(); }
}
// the visitor centre: a round glass atrium, two wings, a fountain plaza
function visitor(g, p, BD) {
  box(g, p.x - 220, p.y - 60, 150, 100, 26, C.roof, C.face, BD, 10); box(g, p.x + 70, p.y - 60, 150, 100, 26, C.roof, C.face, BD, 10);
  g.fillStyle = C.shadow; circ(g, p.x + 20, p.y + 26, 86); g.fill();
  g.fillStyle = BD ? '#9fd3ef' : radial(g, p.x - 30, p.y - 30, 6, p.x, p.y, 86, [[0, '#e6f6ff'], [0.6, '#8fcdf0'], [1, '#4a8fc2']]); circ(g, p.x, p.y, 84); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + Math.cos(k / 8 * TAU) * 84, p.y + Math.sin(k / 8 * TAU) * 84); g.stroke(); }
  circ(g, p.x, p.y, 84); g.strokeStyle = '#f4f5f8'; g.lineWidth = 6; g.stroke();
  g.fillStyle = C.conc; circ(g, p.x, p.y + 150, 60); g.fill(); g.fillStyle = '#5ac8e8'; circ(g, p.x, p.y + 150, 30); g.fill(); g.fillStyle = '#ffffff'; circ(g, p.x, p.y + 150, 8); g.fill();
}
// the rocket garden: historic rockets standing round a plaza, each lit from the top left, their shadows long
function rocketGarden(g, p, BD) {
  g.fillStyle = C.conc; circ(g, p.x, p.y, 230); g.fill(); g.fillStyle = C.conc2; circ(g, p.x, p.y, 220); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 3; for (const r of [80, 160]) { circ(g, p.x, p.y, r); g.stroke(); }
  const rk = [[-120, -40, 150, '#ffffff'], [-40, -110, 200, '#ffffff'], [70, -90, 120, '#e2e6ec'], [130, 10, 170, '#ffffff'], [40, 90, 110, '#f6f5f2'], [-100, 80, 130, '#ffffff']];
  for (const [dx, dy, H] of rk) { g.fillStyle = 'rgba(14,40,52,0.22)'; g.save(); g.translate(p.x + dx, p.y + dy); g.rotate(0.5); g.beginPath(); g.roundRect(0, -9, H * 0.9, 18, 9); g.fill(); g.restore(); }
  rk.sort((a, b) => a[1] - b[1]);
  for (const [dx, dy, H, col] of rk) {
    const x = p.x + dx, y = p.y + dy, w = H * 0.09;
    for (const sd of [-1, 1]) { g.fillStyle = C.red; g.beginPath(); g.moveTo(x + sd * w, y - H * 0.18); g.lineTo(x + sd * w * 2.1, y); g.lineTo(x + sd * w, y); g.closePath(); g.fill(); }
    g.fillStyle = BD ? col : linear(g, x - w, 0, x + w, 0, [[0, '#ffffff'], [0.5, col], [1, '#aeb5c0']]); g.beginPath(); g.moveTo(x - w, y); g.lineTo(x - w, y - H * 0.78); g.quadraticCurveTo(x, y - H * 1.02, x + w, y - H * 0.78); g.lineTo(x + w, y); g.closePath(); g.fill();
    g.fillStyle = '#20242c'; g.fillRect(x - w, y - H * 0.55, w * 2, H * 0.05); g.fillStyle = C.red; g.fillRect(x - w, y - H * 0.35, w * 2, H * 0.04);
    if (BD) { g.strokeStyle = BK.ink; g.lineWidth = 2; g.stroke(); }
  }
}
// the Launch Row: an apron of concrete as long as the line the race needs, and for each bay (as many as racers, in one
// line down one side of the road) its pad out past the road's edge (the hardstand on a mound, the flame trench out away
// from the road, the service tower behind, the lightning mast), the boarding ramp from the road's edge up to the
// rocket's hatch (art/rockets.js drawRamp), and on the road, chevrons and the bay's number leading onto it
function launchRow(g, T, z, R, BD, D) {
  const ap = s => trackSample(T, s), A0 = R.sRow0 - 260, A1 = z.sRowEnd + 40;
  // the road's concrete shoulders through the row, and for each bay a slab under its ramp out to its pad
  for (const [w, col] of [[44, C.conc3], [38, C.conc]]) { band(g, T, A0, A1, q => q.hw + w, q => -q.hw - w, 20); g.fillStyle = col; g.fill(); }
  for (const B of R.bays) { const p = B.pad, d = B.dock, a = Math.atan2(p.y - d.y, p.x - d.x), L2 = Math.hypot(p.x - d.x, p.y - d.y);
    g.save(); g.translate((p.x + d.x) / 2, (p.y + d.y) / 2); g.rotate(a);
    g.fillStyle = C.shadow; g.fillRect(-L2 / 2 + 10, -70 + 14, L2, 140); g.fillStyle = C.conc3; g.fillRect(-L2 / 2 - 6, -76, L2 + 12, 152); g.fillStyle = C.conc; g.fillRect(-L2 / 2, -70, L2, 140);
    g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 2; for (let k = -L2 / 2 + 50; k < L2 / 2; k += 60) { g.beginPath(); g.moveTo(k, -70); g.lineTo(k, 70); g.stroke(); }
    g.restore(); }
  band(g, T, A0, z.sRowEnd, q => q.hw, q => -q.hw, 20); g.fillStyle = T.theme.road; g.fill();
  const end = ap(z.sRowEnd); g.fillStyle = T.theme.road; circ(g, end.x, end.y, end.hw * 1.05); g.fill();
  g.strokeStyle = C.yellow; g.lineWidth = 6; g.setLineDash([18, 14]); circ(g, end.x, end.y, end.hw * 0.8); g.stroke(); g.setLineDash([]);
  for (let s = A0 + 30; s < z.sRowEnd - 20; s += 70) { const q = ap(s), o = -z.side * q.hw * 0.25; g.fillStyle = 'rgba(255,255,255,0.75)'; g.save(); g.translate(q.x + q.nx * o, q.y + q.ny * o); g.rotate(Math.atan2(q.ty, q.tx)); g.fillRect(-18, -3, 36, 6); g.restore(); }
  for (const B of R.bays) {
    const p = B.pad, ox = p.x - B.dock.x, oy = p.y - B.dock.y, d = Math.hypot(ox, oy) || 1, ux = ox / d, uy = oy / d;
    // the trench: out from under the rocket away from the road, scorched where it vents
    g.save(); g.translate(p.x, p.y); g.rotate(Math.atan2(uy, ux));
    g.fillStyle = '#3a3e45'; g.beginPath(); g.roundRect(-10, -32, 250, 64, 10); g.fill(); g.fillStyle = '#23262b'; g.beginPath(); g.roundRect(-4, -22, 242, 44, 8); g.fill();
    for (let k = 10; k < 230; k += 16) { g.fillStyle = '#4b5058'; g.fillRect(k, -22, 6, 44); }
    g.fillStyle = 'rgba(40,36,34,0.16)'; ell(g, 262, 0, 40, 34); g.fill();
    g.restore();
    // the mound it stands on: a low hill of sand and scrub
    g.fillStyle = 'rgba(14,40,52,0.12)'; ell(g, p.x + 30, p.y + 40, 170, 140); g.fill();
    g.fillStyle = BD ? '#e2d39b' : radial(g, p.x - 60, p.y - 60, 20, p.x, p.y, 180, [[0, '#f0e2ae'], [0.75, '#e0cf95'], [1, 'rgba(224,207,149,0)']]); ell(g, p.x, p.y, 180, 150); g.fill();
    // the hardstand
    g.fillStyle = C.shadow; g.beginPath(); g.roundRect(p.x - 84, p.y - 74, 180, 180, 18); g.fill();
    g.fillStyle = BD ? '#cfcbc1' : radial(g, p.x - 40, p.y - 40, 10, p.x, p.y, 124, [[0, '#ebe8e0'], [1, '#c4c0b5']]); g.beginPath(); g.roundRect(p.x - 90, p.y - 90, 180, 180, 18); g.fill();
    g.fillStyle = BD ? 'rgba(60,56,56,0.3)' : radial(g, p.x, p.y, 0, p.x, p.y, 80, [[0, 'rgba(60,54,52,0.5)'], [1, 'rgba(60,54,52,0)']]); circ(g, p.x, p.y, 80); g.fill();
    g.strokeStyle = C.yellow; g.lineWidth = 5; circ(g, p.x, p.y, 60); g.stroke();
    circ(g, p.x, p.y, 40); g.fillStyle = '#9aa0a8'; g.fill(); circ(g, p.x, p.y, 29); g.fillStyle = '#5c626b'; g.fill();
    for (const [cx2, cy2] of [[-72, -72], [72, -72], [-72, 72], [72, 72]]) { g.fillStyle = C.red; circ(g, p.x + cx2, p.y + cy2, 5); g.fill(); }
    // the service tower: a red lattice standing behind the rocket, away from the ramp
    const tw = towerOf(B);
    g.fillStyle = C.shadow; g.save(); g.translate(tw.x, tw.y + 66); g.rotate(0.5); g.fillRect(0, -10, 150, 20); g.restore();
    g.fillStyle = '#a9aeb6'; g.fillRect(tw.x - 20, tw.y + 60, 40, 16);
    g.fillStyle = '#c0392b'; g.fillRect(tw.x - 14, tw.y - 130, 28, 196);
    g.strokeStyle = '#8e2a20'; g.lineWidth = 2.5; for (let k = 0; k < 9; k++) { const y0 = tw.y + 60 - k * 22; g.beginPath(); g.moveTo(tw.x - 14, y0); g.lineTo(tw.x + 14, y0 - 22); g.moveTo(tw.x + 14, y0); g.lineTo(tw.x - 14, y0 - 22); g.stroke(); }
    g.fillStyle = '#8e2a20'; g.fillRect(tw.x - 18, tw.y - 136, 36, 8); g.fillStyle = C.red; circ(g, tw.x, tw.y - 140, 5); g.fill();
    // the lightning mast out past the trench
    const mx = p.x + ux * 150 - uy * 110, my = p.y + uy * 150 + ux * 110;
    g.fillStyle = C.shadow; g.save(); g.translate(mx, my); g.rotate(0.5); g.fillRect(0, -3, 180, 6); g.restore();
    g.fillStyle = '#9aa0a8'; g.fillRect(mx - 3, my - 230, 6, 230); g.fillStyle = C.red; circ(g, mx, my - 232, 5); g.fill();
    // on the road: chevrons sweeping over onto the ramp, and the bay's number
    rampLane(g, T, B, C.yellow, BD);
    drawRamp(g, B, HATCH[0], BD);
  }
}
// on the road before a bay's ramp: a lane of chevrons sweeping over to the ramp's foot, and the bay's number (shared by
// the Return Row, art/moon.js)
export function rampLane(g, T, B, col, BD) {
  const side = B.side;
  for (let s = B.s - 190, k = 0; s < B.s - 10; s += 40, k++) { const q = trackSample(T, s), f = (s - (B.s - 190)) / 180, o = side * q.hw * (0.15 + 0.6 * f), a = Math.atan2(q.ty, q.tx) + side * 0.5;
    g.save(); g.translate(q.x + q.nx * o, q.y + q.ny * o); g.rotate(a); g.strokeStyle = alpha(col, 0.5 + 0.4 * f); g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(-10, -16); g.lineTo(4, 0); g.lineTo(-10, 16); g.stroke(); g.restore(); }
  const q = trackSample(T, B.s - 230), o = -side * q.hw * 0.45;
  g.save(); g.translate(q.x + q.nx * o, q.y + q.ny * o);
  g.font = 'bold 44px "Bungee", "Fredoka", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = alpha(col, 0.85); g.fillText(String(B.j + 1), 0, 0);
  g.restore();
}
// the fuel farm: two big spheres (liquid oxygen, white; liquid hydrogen, white), pipe runs
function fuelFarm(g, p, BD) {
  g.fillStyle = C.conc; g.beginPath(); g.roundRect(p.x - 150, p.y - 100, 300, 200, 18); g.fill();
  g.strokeStyle = '#9aa0a8'; g.lineWidth = 6; g.beginPath(); g.moveTo(p.x - 140, p.y + 60); g.lineTo(p.x + 140, p.y + 60); g.stroke(); g.strokeStyle = C.yellow; g.lineWidth = 3; g.stroke();
  for (const [dx, r] of [[-70, 62], [75, 56]]) {
    const x = p.x + dx, y = p.y - 6;
    g.fillStyle = C.shadow; ell(g, x + r * 0.5, y + r * 0.65, r * 1.05, r * 0.8); g.fill();
    for (const sd of [-0.7, 0, 0.7]) { g.fillStyle = '#8d939d'; g.fillRect(x + sd * r - 3, y, 6, r * 0.9); }
    g.fillStyle = BD ? '#eef0f3' : radial(g, x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r, [[0, '#ffffff'], [0.7, '#e2e6ec'], [1, '#aab2be']]); circ(g, x, y, r); g.fill();
    if (BD) { g.strokeStyle = BK.ink; g.lineWidth = 2; g.stroke(); }
  }
}
// the water tower: a white ball on legs with a red band, for the pads' deluge
function waterTower(g, p, BD) {
  const { x, y } = p;
  g.fillStyle = C.shadow; g.save(); g.translate(x, y); g.rotate(0.5); g.beginPath(); g.ellipse(120, 0, 130, 30, 0, 0, TAU); g.fill(); g.restore();
  g.strokeStyle = '#9aa0a8'; g.lineWidth = 6; for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(x + sd * 30, y); g.lineTo(x + sd * 15, y - 130); g.stroke(); }
  g.fillStyle = BD ? '#eef0f3' : radial(g, x - 20, y - 175, 4, x, y - 160, 54, [[0, '#ffffff'], [1, '#b9c0ca']]); circ(g, x, y - 160, 50); g.fill(); g.fillStyle = C.red; g.fillRect(x - 50, y - 164, 100, 9);
  if (BD) { g.strokeStyle = BK.ink; g.lineWidth = 2; circ(g, x, y - 160, 50); g.stroke(); }
}
// recovery: the slipway up out of the sea onto the beach road, the dock with its crane and the ship tied up, the
// channel's buoys and the splashdown zones, one for every racer (the first the nearest the slipway)
function recovery(g, T, z, R, E, BD, P) {
  const inEarth = (x, y) => !P || Math.hypot(x - P.earth.x, y - P.earth.y) < P.earth.r - 60;
  const top = z.top, foot = z.foot, a = Math.atan2(top.y - foot.y, top.x - foot.x), len = Math.hypot(top.x - foot.x, top.y - foot.y) + 60;
  g.save(); g.translate(foot.x, foot.y); g.rotate(a);
  g.fillStyle = 'rgba(10,40,60,0.3)'; g.fillRect(-40, -top.hw - 4, len + 30, top.hw * 2 + 22);
  g.fillStyle = BD ? '#c9c5bb' : linear(g, -40, 0, len, 0, [[0, '#8d9aa0'], [0.4, '#c9c5bb'], [1, '#dcd8ce']]); g.fillRect(-40, -top.hw - 10, len + 20, top.hw * 2 + 20);
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 3; for (let k = -30; k < len; k += 18) { g.beginPath(); g.moveTo(k, -top.hw - 8); g.lineTo(k, top.hw + 8); g.stroke(); }
  for (const sd of [-1, 1]) { g.fillStyle = C.yellow; g.fillRect(-40, sd * (top.hw + 6) - 3, len + 20, 6); }
  g.restore();
  // the dock and its crane
  if (E.dock) { const d = E.dock;
    g.fillStyle = C.shadow; g.fillRect(d.x - 150 + 14, d.y - 70 + 18, 260, 140);
    g.fillStyle = BD ? '#b8a27e' : '#c2ab84'; g.fillRect(d.x - 150, d.y - 70, 260, 140); g.strokeStyle = 'rgba(80,60,30,0.3)'; g.lineWidth = 2; for (let k = 0; k < 13; k++) { g.beginPath(); g.moveTo(d.x - 150 + k * 20, d.y - 70); g.lineTo(d.x - 150 + k * 20, d.y + 70); g.stroke(); }
    for (let k = 0; k < 6; k++) { g.fillStyle = '#5a4630'; circ(g, d.x - 150 + k * 52, d.y - 70, 6); g.fill(); }
    g.fillStyle = C.yellow; g.fillRect(d.x - 40, d.y - 30, 50, 50); g.strokeStyle = C.yellow; g.lineWidth = 8; g.beginPath(); g.moveTo(d.x - 15, d.y - 5); g.lineTo(d.x + 60, d.y - 170); g.stroke(); g.strokeStyle = '#2a2f38'; g.lineWidth = 2; g.beginPath(); g.moveTo(d.x + 60, d.y - 170); g.lineTo(d.x + 60, d.y - 90); g.stroke();
  }
  // the recovery ship: a big blue-and-white vessel with a helipad aft and a crane
  if (E.ship) { const s = E.ship, x = s.x, y = s.y, L = 360, Wd = 90;
    g.fillStyle = 'rgba(10,40,60,0.3)'; g.beginPath(); g.ellipse(x + 20, y + 30, L / 2 + 10, Wd / 2 + 6, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(x - L * 0.55, y + 6, 70, 14, 0, 0, TAU); g.fill();
    g.fillStyle = BD ? C.navy : linear(g, 0, y - Wd / 2, 0, y + Wd / 2, [[0, '#2f5a94'], [1, '#1c3560']]); g.beginPath(); g.moveTo(x - L / 2, y - Wd / 2); g.lineTo(x + L * 0.32, y - Wd / 2); g.quadraticCurveTo(x + L / 2 + 20, y, x + L * 0.32, y + Wd / 2); g.lineTo(x - L / 2, y + Wd / 2); g.closePath(); g.fill();
    g.fillStyle = '#e8ebf0'; g.beginPath(); g.moveTo(x - L / 2 + 10, y - Wd / 2 + 10); g.lineTo(x + L * 0.3, y - Wd / 2 + 10); g.quadraticCurveTo(x + L / 2, y, x + L * 0.3, y + Wd / 2 - 10); g.lineTo(x - L / 2 + 10, y + Wd / 2 - 10); g.closePath(); g.fill();
    box(g, x - 10, y - 32, 110, 64, 22, '#ffffff', '#c9ced6', BD, 8); g.fillStyle = '#2a3a52'; g.fillRect(x + 76, y - 26, 16, 52);
    g.fillStyle = '#5d636d'; circ(g, x - L * 0.32, y, 34); g.fill(); g.strokeStyle = C.yellow; g.lineWidth = 3; circ(g, x - L * 0.32, y, 26); g.stroke(); g.fillStyle = C.yellow; g.fillRect(x - L * 0.32 - 3, y - 12, 6, 24);
    g.fillStyle = C.red; g.fillRect(x + 30, y - 52, 12, 18);
  }
  // the channel's buoys: red on one side, green on the other, in pairs up to the field
  for (let s = z.sZ; s < z.sOut - 120; s += 220) { const q = trackSample(T, s); for (const sd of [-1, 1]) { const o = sd * 70, x = q.x + q.nx * o, y = q.y + q.ny * o; if (!inEarth(x, y)) continue; g.fillStyle = 'rgba(10,40,60,0.3)'; circ(g, x + 4, y + 6, 9); g.fill(); g.fillStyle = sd < 0 ? C.red : '#2fb36a'; circ(g, x, y, 9); g.fill(); g.fillStyle = 'rgba(255,255,255,0.6)'; circ(g, x - 3, y - 3, 3); g.fill(); } }
  // the zones: a ring of orange floats round each, a target of lighter water
  for (const Zn of R.zones) { const { x, y } = Zn.pad;
    g.fillStyle = 'rgba(255,255,255,0.12)'; circ(g, x, y, 80); g.fill();
    for (let k = 0; k < 12; k++) { const a2 = k / 12 * TAU, bx = x + Math.cos(a2) * 58, by = y + Math.sin(a2) * 48; g.fillStyle = 'rgba(10,40,60,0.25)'; circ(g, bx + 2, by + 3, 6); g.fill(); g.fillStyle = C.orange; circ(g, bx, by, 6); g.fill(); }
  }
}

// ------------------------------------------------------------------------------------------------ live
// glints on the water, the surf breathing along the beach, the zones' lamps, the countdown clock
export function capeUnder(ctx, race, P) {
  const T = race.track, E = capeOf(T, P), t = race.time, V = VIEW, BD = bold();
  if (!BD) {
    const rng = mulberry(Math.floor(t * 2) * 7 + 3), f = (t * 2) % 1, a = Math.sin(Math.PI * f) * 0.8;
    ctx.strokeStyle = `rgba(255,255,255,${a * 0.8})`; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = 0; i < 26; i++) { const x = V.x0 + rng() * (V.x1 - V.x0), y = V.y0 + rng() * (V.y1 - V.y0), l = 6 + rng() * 10; if (!onPlanet(P, x, y) || (inPoly(E.land, x, y) && !inPoly(E.lagoon, x, y))) continue; ctx.moveTo(x - l, y); ctx.lineTo(x + l, y); }
    ctx.stroke();
    // the surf: a line of foam washing up and back along the beach
    const w = 0.5 + 0.5 * Math.sin(t * 1.3);
    ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.3 * w})`; ctx.lineWidth = 6 + 6 * w; ctx.lineCap = 'round'; ctx.setLineDash([60, 40]); ctx.lineDashOffset = -t * 20; ctx.translate(0, -50 - 10 * w); path(ctx, E.coast, false); ctx.stroke(); ctx.restore();
  }
  // the zones' lamps blink
  const R = rowsOfRace(race);
  for (const Zn of R.zones) { const { x, y } = Zn.pad; if (x < V.x0 - 100 || x > V.x1 + 100 || y < V.y0 - 100 || y > V.y1 + 100) continue; const on = Math.floor(t * 2 + Zn.j * 0.37) % 2; ctx.fillStyle = on ? '#fff3b0' : 'rgba(255,243,176,0.25)'; for (const k of [0, 6]) { const a2 = k / 12 * TAU; circ(ctx, x + Math.cos(a2) * 72, y + Math.sin(a2) * 60 - 6, 4); ctx.fill(); } }
  if (E.press && Math.abs(E.press.x + 330 - V.cx) < 1500 && Math.abs(E.press.y - V.cy) < 1000) clockDigits(ctx, E.press, t);
}
const rowsOfRace = race => layoutFor(race.track.mech.rocket, race.cars.length);
export { mix, shade };
