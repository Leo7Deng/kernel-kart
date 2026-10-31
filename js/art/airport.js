// Kernel Kart art: Gateway 8080, a sunny airport (theme deco 'airport'): ground, runway, terminal, gates, tower,
// hangar, blast fence, and what moves: taxiing and departing jets with their blast (race-jets.js), crossing lights,
// walkways (race-belts.js), the luggage carousel, windsocks. Heavy parts are baked or cached sprites; the animated
// layers are a few strokes and blits from the race clock.
import { TAU, clamp, mulberry } from '../core.js';
import { trackSample } from '../geometry.js';
import { BODY_L, BX, BY, EXHAUST, PH, PK, PV, PX, PY, PZ, SX, SY, TAXI_K, blastAt, crossingLit, jetAt } from '../race-jets.js';
import { circ, ell, linear, poly, radial, shade } from './paint.js';
import { distField } from './track.js';

const SHADOW = 'rgba(24,30,40,0.24)';
const K_UP = 0.8;             // a height h is drawn this many units up the screen
const GRASS = '#8cc46a', GRASS_DK = '#7db65c', CONCRETE = '#c9cbc4', TARMAC = '#4d5158', TARMAC_LT = '#5b6068', PAINT_Y = '#f4c430', FLOOR = '#ece6d8';
const LIVERY = [   // tail, cheatline, engines
  { tail: '#ff6a3d', line: '#24346e', eng: '#d9dde3', body: '#fbfcfd' },
  { tail: '#2ea8e0', line: '#0f4f7a', eng: '#2ea8e0', body: '#fbfcfd' },
  { tail: '#7a4fd1', line: '#3a2a6a', eng: '#c9ced6', body: '#eef0f4' },
  { tail: '#24a35a', line: '#155a34', eng: '#e2e6ea', body: '#fbfcfd' },
];

// ------------------------------------------------------------------------------------------------ the airport's plan
// world-space rects and the like from the definition (layout units, scaled), cached per track
const plans = new WeakMap();
export function planOf(T) {
  let P = plans.get(T); if (P) return P;
  const d = T.def.airport || {}, sc = T.def.scale, J = T.mech.jets;
  const R = r => ({ x0: r[0] * sc, y0: r[1] * sc, x1: r[2] * sc, y1: r[3] * sc });
  P = { J, sc, terminal: d.terminal ? R(d.terminal) : null, aprons: (d.aprons || []).map(R),
    gates: (d.gates || []).map(([x, y, a]) => ({ x: x * sc, y: y * sc, a: a * Math.PI / 180 })), parked: (d.parked || []).map(([x, y, a], i) => ({ x: x * sc, y: y * sc, a: a * Math.PI / 180, liv: (i + 1) % LIVERY.length })),
    tower: d.tower ? { x: d.tower[0] * sc, y: d.tower[1] * sc } : null, hangar: d.hangar ? { x: d.hangar[0] * sc, y: d.hangar[1] * sc } : null };
  // the walkways, each on the first road it lies on
  P.belts = [];
  for (const R2 of T.routes || [T]) for (const b of R2.mech ? R2.mech.belts : []) {
    const q = trackSample(R2, (b.s0 + b.s1) / 2);
    if (!P.belts.some(o => Math.hypot(o.mx - q.x, o.my - q.y) < 30)) P.belts.push({ ...b, R: R2, mx: q.x, my: q.y });
  }
  // windsocks: at the ends of the runway and by the tower
  const W = J.runway;
  P.socks = [{ x: W.ax - W.uy * (W.hw + 120), y: W.ay + W.ux * (W.hw + 120) + 90 }, { x: W.bx + 60, y: W.by - W.hw - 150 }];
  if (P.tower) P.socks.push({ x: P.tower.x + 150, y: P.tower.y + 40 });
  plans.set(T, P); return P;
}
const inRect = (r, x, y, m = 0) => x > r.x0 - m && x < r.x1 + m && y > r.y0 - m && y < r.y1 + m;

// ------------------------------------------------------------------------------------------------ the ground
// grass, aprons, terminal floor, taxiways and runway. Called from art/track.js before the road; also sets T.keepOut
// (where props and landmarks don't go)
export function airportGround(g, T, X0, Y0, W, H, rng, dist, D) {
  const P = planOf(T), J = P.J;
  g.fillStyle = GRASS; g.fillRect(X0, Y0, W, H);
  // mowing stripes: wide diagonal bands, a touch lighter and darker
  g.save(); g.translate(X0 + W / 2, Y0 + H / 2); g.rotate(-0.5);
  const big = Math.hypot(W, H);
  for (let k = -big; k < big; k += 180) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(k, -big, 90, big * 2); }
  g.restore();
  g.lineCap = 'round';
  for (let i = 0; i < W * H / 900 * D; i++) {
    const x = X0 + rng() * W, y = Y0 + rng() * H, l = 3 + rng() * 3, a = -1.2 + rng() * 0.5;
    g.strokeStyle = rng() < 0.5 ? GRASS_DK : '#9fd27c'; g.globalAlpha = 0.35; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  g.globalAlpha = 1;
  // the aprons: concrete slabs
  for (const r of P.aprons) slab(g, r, CONCRETE);
  if (P.terminal) floor(g, P.terminal);
  // the taxiways: a tarmac band along each jet's path (the part on the map), a yellow line down the middle, blue lights
  for (const Wy of J.taxi) {
    const pts = []; for (let i = 0; i < Wy.x.length; i += 3) pts.push([Wy.x[i], Wy.y[i]]);
    stroke(g, pts, 112, '#9fa39c'); stroke(g, pts, 96, TARMAC_LT);
    g.setLineDash([26, 18]); stroke(g, pts, 4, PAINT_Y); g.setLineDash([]);
    for (let i = 0; i < Wy.x.length; i += 22) for (const sd of [-1, 1]) { const a = Wy.h[i] + Math.PI / 2; circ(g, Wy.x[i] + Math.cos(a) * 52 * sd, Wy.y[i] + Math.sin(a) * 52 * sd, 2.6); g.fillStyle = '#3d7bff'; g.fill(); }
  }
  // the gates' stands: a yellow lead-in line to each nose
  for (const s of P.gates) { g.strokeStyle = PAINT_Y; g.lineWidth = 4; g.beginPath(); g.moveTo(s.x, s.y + 40); g.lineTo(s.x, s.y + 300); g.stroke(); g.fillStyle = PAINT_Y; g.fillRect(s.x - 30, s.y - 150, 60, 5); }
  runway(g, J.runway, D);
  // where the props and landmarks may not go: the runway, the taxiways, the aprons, the terminal, the tower and hangar
  const k = [];
  const W2 = J.runway; for (let d = -200; d < Math.hypot(W2.ax - W2.bx, W2.ay - W2.by) + 200; d += 120) k.push([W2.bx + W2.ux * d, W2.by + W2.uy * d, W2.hw + 70]);
  for (const Wy of J.taxi) for (let i = 0; i < Wy.x.length; i += 25) k.push([Wy.x[i], Wy.y[i], 90]);
  for (const r of [...P.aprons, ...(P.terminal ? [P.terminal] : [])]) for (let x = r.x0; x <= r.x1; x += 140) for (let y = r.y0; y <= r.y1; y += 140) k.push([x, y, 110]);
  if (P.tower) k.push([P.tower.x, P.tower.y, 170]);
  if (P.hangar) k.push([P.hangar.x, P.hangar.y, 260]);
  if (J.fence) k.push([(J.fence.x0 + J.fence.x1) / 2, (J.fence.y0 + J.fence.y1) / 2, 200]);
  T.keepOut = k;
}
function stroke(g, P, w, col) { g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.beginPath(); P.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); }
function slab(g, r, col) {
  g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(r.x0 + 4, r.y0 + 6, r.x1 - r.x0, r.y1 - r.y0);
  g.fillStyle = col; g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
  g.strokeStyle = 'rgba(90,92,88,0.22)'; g.lineWidth = 1.5; g.beginPath();
  for (let x = r.x0 + 60; x < r.x1; x += 60) { g.moveTo(x, r.y0); g.lineTo(x, r.y1); }
  for (let y = r.y0 + 60; y < r.y1; y += 60) { g.moveTo(r.x0, y); g.lineTo(r.x1, y); }
  g.stroke();
  // stains, darker patches
  const rng = mulberry(Math.round(r.x0 + r.y0 * 7));
  for (let i = 0; i < (r.x1 - r.x0) * (r.y1 - r.y0) / 30000; i++) { const x = r.x0 + rng() * (r.x1 - r.x0), y = r.y0 + rng() * (r.y1 - r.y0), rr = 14 + rng() * 30; g.fillStyle = radial(g, x, y, 0, x, y, rr, [[0, 'rgba(60,60,60,0.12)'], [1, 'rgba(60,60,60,0)']]); g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
}
// the terminal's floor: big pale tiles with a polished sheen
function floor(g, r) {
  g.fillStyle = FLOOR; g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
  g.strokeStyle = 'rgba(150,140,120,0.22)'; g.lineWidth = 1; g.beginPath();
  for (let x = r.x0; x < r.x1; x += 40) { g.moveTo(x, r.y0); g.lineTo(x, r.y1); }
  for (let y = r.y0; y < r.y1; y += 40) { g.moveTo(r.x0, y); g.lineTo(r.x1, y); }
  g.stroke();
  g.fillStyle = linear(g, r.x0, r.y0, r.x1, r.y1, [[0, 'rgba(255,255,255,0.25)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(120,100,80,0.08)']]); g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
}
// the runway: tarmac, shoulders, threshold bars, numbers, centreline, touchdown marks, edge lights, blast-pad chevrons
function runway(g, W, D) {
  const len = Math.hypot(W.ax - W.bx, W.ay - W.by), a = Math.atan2(W.uy, W.ux);
  g.save(); g.translate(W.bx, W.by); g.rotate(a);   // +x: the way the jets roll, from the far end (b) toward a
  g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(-60 + 5, -W.hw - 16 + 7, len + 120, W.hw * 2 + 32);
  g.fillStyle = '#9b9e97'; g.fillRect(-60, -W.hw - 16, len + 120, W.hw * 2 + 32);   // the shoulders
  g.fillStyle = TARMAC; g.fillRect(-60, -W.hw, len + 120, W.hw * 2);
  // rubber where the wheels touch down, and the long grain of it
  for (const [x0, x1] of [[60, 700], [len - 700, len - 60]]) { g.fillStyle = linear(g, x0, 0, x1, 0, [[0, 'rgba(0,0,0,0)'], [0.3, 'rgba(0,0,0,0.16)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(x0, -W.hw * 0.45, x1 - x0, W.hw * 0.9); }
  const rng = mulberry(77);
  g.strokeStyle = 'rgba(255,255,255,0.03)'; g.lineWidth = 1; for (let i = 0; i < 80 * D; i++) { const y = (rng() * 2 - 1) * W.hw; g.beginPath(); g.moveTo(rng() * len, y); g.lineTo(rng() * len, y); g.stroke(); }
  g.fillStyle = '#f4f4f0';
  // threshold bars ("piano keys") at both ends
  for (const [x, dir] of [[20, 1], [len - 20, -1]]) for (let k = -5; k <= 5; k++) { if (!k) continue; const y = k * W.hw / 6.2; g.fillRect(dir > 0 ? x : x - 130, y - 7, 130, 14); }
  // the numbers: 27 at the far end (they roll west), 09 at this one. Upright for a jet rolling in
  for (const [x, txt, rot] of [[200, '27', Math.PI / 2], [len - 200, '09', -Math.PI / 2]]) { g.save(); g.translate(x, 0); g.rotate(rot); g.font = '900 92px "Bungee", "Fredoka", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 0, 0); g.restore(); }
  // centreline dashes, touchdown zone bars, aiming points, the edge lines
  for (let x = 320; x < len - 320; x += 110) g.fillRect(x, -3, 60, 6);
  for (const [x0, dir] of [[340, 1], [len - 340, -1]]) for (let k = 0; k < 4; k++) for (const sd of [-1, 1]) g.fillRect(x0 + dir * k * 120 - (dir < 0 ? 50 : 0), sd * W.hw * 0.55 - 5, 50, 10);
  for (const [x0, dir] of [[760, 1], [len - 760, -1]]) for (const sd of [-1, 1]) g.fillRect(x0 - (dir < 0 ? 110 : 0), sd * W.hw * 0.42 - 9, 110, 18);
  g.fillRect(-60, -W.hw + 6, len + 120, 3); g.fillRect(-60, W.hw - 9, len + 120, 3);
  // edge lights
  for (let x = 0; x <= len; x += 70) for (const sd of [-1, 1]) { circ(g, x, sd * (W.hw + 6), 3.2); g.fillStyle = '#fffbe6'; g.fill(); circ(g, x, sd * (W.hw + 6), 1.6); g.fillStyle = '#ffd46b'; g.fill(); }
  g.fillStyle = '#f4f4f0';
  // past the far end, under the blast: a pad with yellow chevrons
  g.fillStyle = '#6a6e74'; g.fillRect(-260, -W.hw, 200, W.hw * 2);
  g.strokeStyle = PAINT_Y; g.lineWidth = 8;
  for (let x = -240; x < -70; x += 50) { g.beginPath(); g.moveTo(x, -W.hw + 10); g.lineTo(x + 40, 0); g.lineTo(x, W.hw - 10); g.stroke(); }
  g.restore();
}

// ------------------------------------------------------------------------------------------------ after the road
// taxiway paint where the jets cross the road, crossing posts, blast fence, terminal inside, gates, jets, hangar, tower
export function airportStatic(g, T) {
  const P = planOf(T), J = P.J;
  // where a taxiway crosses the road: its yellow line carried across, a hold line each side, the posts
  for (const Wy of J.taxi) for (const x of Wy.cross) {
    const a = Wy.h[Math.round(x.u / 4)];
    g.save(); g.translate(x.x, x.y); g.rotate(a);
    g.setLineDash([22, 16]); g.strokeStyle = PAINT_Y; g.lineWidth = 4; g.beginPath(); g.moveTo(-140, 0); g.lineTo(140, 0); g.stroke(); g.setLineDash([]);
    g.restore();
    for (const p of crossPosts(T, x)) post(g, p.x, p.y);
  }
  if (J.fence) fence(g, J.fence);
  if (P.terminal) terminalInside(g, T, P);
  for (const s of P.gates) gate(g, s);
  for (const s of P.parked) { jetShadow(g, s.x, s.y, s.a, 0); drawJet(g, s.x, s.y, s.a, s.liv, 0, 1); }
  if (P.hangar) hangar(g, P.hangar.x, P.hangar.y);
  if (P.tower) tower(g, P.tower.x, P.tower.y);
  for (const s of P.socks) { g.fillStyle = SHADOW; g.fillRect(s.x + 3, s.y + 2, 26, 5); g.fillStyle = '#9aa0a8'; g.fillRect(s.x - 2, s.y - 40, 4, 42); circ(g, s.x, s.y, 5); g.fillStyle = '#6d737b'; g.fill(); }
}
// the four posts at a crossing: on both edges of the road, either side of the taxiway
export function crossPosts(T, x) {
  const q = trackSample(T, x.s), out = [];
  for (const along of [-1, 1]) for (const sd of [-1, 1]) out.push({ x: q.x + q.tx * along * 70 + q.nx * sd * (q.hw + 18), y: q.y + q.ty * along * 70 + q.ny * sd * (q.hw + 18), along, sd });
  return out;
}
function post(g, x, y) {
  g.fillStyle = SHADOW; g.fillRect(x + 2, y, 18, 5);
  g.fillStyle = '#e8e8e8'; g.fillRect(x - 2.5, y - 34, 5, 36);
  g.fillStyle = '#26282d'; g.beginPath(); g.roundRect(x - 11, y - 44, 22, 13, 5); g.fill();
  for (const sd of [-1, 1]) { circ(g, x + sd * 5.5, y - 37.5, 4); g.fillStyle = '#5a1a1a'; g.fill(); }
  g.fillStyle = '#e83a2c'; g.fillRect(x - 9, y - 26, 18, 4);
}
// the blast fence: a slanted corrugated steel deflector on a frame, its face toward the runway
function fence(g, F) {
  const dx = F.x1 - F.x0, dy = F.y1 - F.y0, L = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
  g.save(); g.translate(F.x0, F.y0); g.rotate(a);
  g.fillStyle = SHADOW; g.fillRect(0, 8, L, 48);
  g.fillStyle = '#7d848d'; g.fillRect(0, -6, L, 30);
  for (let x = 0; x < L; x += 12) { g.fillStyle = x % 24 ? '#aab1ba' : '#8b929b'; g.fillRect(x, -6, 6, 30); }
  g.fillStyle = '#5d636b'; g.fillRect(0, 20, L, 6);
  for (let x = 20; x < L; x += 60) { g.fillStyle = '#4d5359'; g.fillRect(x, 24, 5, 16); }
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, -6, L, 3);
  g.restore();
}
// inside the terminal (all off the road): check-in, seats, shops, departures board, baggage carousel
function terminalInside(g, T, P) {
  const r = P.terminal, dist = distField(T), rng = mulberry(8080);
  const free = (x, y, m) => dist(x, y, m + 30) > m && inRect(r, x, y, -40);
  // the carousel in the Carousel hairpin: a round island the belt runs round
  const C = carouselOf(T); if (C) carouselIsland(g, C);
  for (let i = 0; i < 260; i++) {
    const x = r.x0 + rng() * (r.x1 - r.x0), y = r.y0 + rng() * (r.y1 - r.y0), k = rng();
    if (C && Math.hypot(x - C.x, y - C.y) < C.r + 120) continue;
    if (k < 0.3) { if (!free(x, y, 46)) continue; seats(g, x, y, rng); }
    else if (k < 0.5) { if (!free(x, y, 52)) continue; checkin(g, x, y, rng); }
    else if (k < 0.65) { if (!free(x, y, 60)) continue; shop(g, x, y, rng); }
    else if (k < 0.9) { if (!free(x, y, 22)) continue; planter(g, x, y, 12 + rng() * 8); }
    else { if (!free(x, y, 30)) continue; board(g, x, y); }
  }
}
function seats(g, x, y, rng) {
  const n = 3 + Math.floor(rng() * 3), vert = rng() < 0.5;
  for (let row = 0; row < 2; row++) for (let k = 0; k < n; k++) {
    const sx = x + (vert ? row * 16 : k * 15), sy = y + (vert ? k * 15 : row * 16);
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(sx + 2, sy + 3, 13, 13);
    g.fillStyle = row ? '#2e6fb5' : '#3f86d1'; g.beginPath(); g.roundRect(sx, sy, 13, 13, 3); g.fill();
  }
}
function checkin(g, x, y, rng) {
  g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x + 4, y + 6, 80, 24);
  g.fillStyle = '#d6dbe2'; g.fillRect(x, y, 80, 24);
  g.fillStyle = '#3a4250'; g.fillRect(x, y, 80, 7);
  for (let k = 0; k < 4; k++) { g.fillStyle = ['#ff6a3d', '#2ea8e0', '#24a35a', '#f4c430'][Math.floor(rng() * 4)]; g.fillRect(x + 4 + k * 19, y + 10, 14, 10); }
  for (let k = 0; k < 4; k++) { circ(g, x + 10 + k * 19, y + 34, 5); g.fillStyle = ['#e35d6a', '#5b8def', '#f2b84b', '#6bc28d'][k]; g.fill(); }   // people queueing
}
function shop(g, x, y, rng) {
  const w = 70 + rng() * 40, h = 50;
  g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x + 5, y + 7, w, h);
  g.fillStyle = ['#ffd7a8', '#cfe8ff', '#ffd1e0', '#d9f2d0'][Math.floor(rng() * 4)]; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(x + 4, y + 4, w - 8, 10);
  g.fillStyle = ['#e85d3f', '#2e86de', '#a55eea', '#20bf6b'][Math.floor(rng() * 4)]; g.fillRect(x, y + h - 8, w, 8);
  for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x + 8 + k * (w - 16) / 3, y + 20, (w - 16) / 3 - 6, 18); }
}
function planter(g, x, y, r) {
  circ(g, x + 3, y + 4, r + 3); g.fillStyle = SHADOW; g.fill();
  circ(g, x, y, r + 3); g.fillStyle = '#b9b2a4'; g.fill();
  circ(g, x, y, r); g.fillStyle = radial(g, x - r * 0.3, y - r * 0.3, 1, x, y, r, [[0, '#7fd06a'], [1, '#2f8a3a']]); g.fill();
}
function board(g, x, y) {
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 4, y + 5, 56, 20);
  g.fillStyle = '#1b2230'; g.fillRect(x, y, 56, 20);
  g.fillStyle = '#f4c430'; for (let k = 0; k < 3; k++) g.fillRect(x + 4, y + 4 + k * 5, 30 + (k * 7) % 14, 2.5);
  g.fillStyle = '#5be08c'; for (let k = 0; k < 3; k++) g.fillRect(x + 42, y + 4 + k * 5, 10, 2.5);
}
// the Carousel hairpin's middle: where the carousel goes (the centre of the baggage belt's turn)
const carousels = new WeakMap();
export function carouselOf(T) {
  if (carousels.has(T)) return carousels.get(T);
  const P = planOf(T), b = P.belts.find(b => b.ring); let C = null;
  if (b) { const R = b.R, sm = (b.s0 + b.s1) / 2, q = trackSample(R, sm), k = q.k || 1e-4, rr = Math.abs(1 / k), sd = Math.sign(k) || 1; C = { x: q.x + q.nx * sd * rr, y: q.y + q.ny * sd * rr, r: Math.max(40, rr - R.hw[Math.floor(sm / 2)] - 26), b }; }
  carousels.set(T, C); return C;
}
function carouselIsland(g, C) {
  const { x, y, r } = C;
  circ(g, x + 6, y + 8, r + 6); g.fillStyle = SHADOW; g.fill();
  circ(g, x, y, r + 6); g.fillStyle = '#9aa1aa'; g.fill();
  circ(g, x, y, r); g.fillStyle = '#3a3f47'; g.fill();
  circ(g, x, y, r * 0.55); g.fillStyle = radial(g, x - r * 0.15, y - r * 0.2, 2, x, y, r * 0.55, [[0, '#e4e8ee'], [1, '#aeb6c0']]); g.fill();
  g.fillStyle = '#1b2230'; g.fillRect(x - r * 0.38, y - 10, r * 0.76, 20);
  g.fillStyle = '#f4c430'; g.font = `700 ${Math.round(r * 0.16)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BAGGAGE 8', x, y + 1);
}
// a gate: the jet bridge reaching out from the terminal wall to the parked jet's door, and the jet
function gate(g, s) {
  const ca = Math.cos(s.a), sa = Math.sin(s.a), dx = s.x + ca * 120 - 60, dy = s.y + sa * 120 - 30;
  jetShadow(g, s.x, s.y, s.a, 0); drawJet(g, s.x, s.y, s.a, Math.round(Math.abs(s.x)) % LIVERY.length, 0, 1);
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(dx - 10 + 6, dy - 150 + 8, 24, 150);
  g.fillStyle = '#c4cad2'; g.fillRect(dx - 10, dy - 150, 24, 150);
  g.fillStyle = '#9aa2ad'; g.fillRect(dx - 10, dy - 150, 24, 5); g.fillRect(dx - 13, dy - 6, 30, 14);
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(dx - 8, dy - 148, 4, 140);
}
// the hangar: a big curved roof, doors open toward the runway, a jet inside with its nose out
function hangar(g, x, y) {
  const w = 300, h = 220;
  g.fillStyle = SHADOW; g.fillRect(x - w / 2 + 12, y - h / 2 + 18, w, h);
  drawJet(g, x, y + h / 2 + 10, -Math.PI / 2, 2, 0, 0.82);
  g.fillStyle = linear(g, x - w / 2, 0, x + w / 2, 0, [[0, '#d7dce3'], [0.35, '#f4f6f9'], [0.6, '#c8ced6'], [1, '#9aa2ad']]); g.fillRect(x - w / 2, y - h / 2, w, h);
  g.strokeStyle = 'rgba(70,80,95,0.25)'; g.lineWidth = 2; for (let k = 1; k < 10; k++) { g.beginPath(); g.moveTo(x - w / 2 + k * w / 10, y - h / 2); g.lineTo(x - w / 2 + k * w / 10, y + h / 2); g.stroke(); }
  g.fillStyle = '#2b3240'; g.fillRect(x - w / 2, y + h / 2 - 8, w, 8);
  g.fillStyle = '#e85d3f'; g.fillRect(x - 70, y - 20, 140, 26);
  g.fillStyle = '#fff'; g.font = '800 18px "Bungee", "Fredoka", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HANGAR 8', x, y - 6);
}
// the control tower: its foot, a tall shaft (height is up the screen), the glass cab, the radar on the roof
function tower(g, x, y) {
  const H = 170;
  g.fillStyle = SHADOW; poly(g, [[x - 26, y + 6], [x + 26, y + 6], [x + 26 + H * 0.55, y + 6 + H * 0.4], [x - 26 + H * 0.55, y + 6 + H * 0.4]]); g.fill();
  ell(g, x + H * 0.55, y + H * 0.4, 52, 30); g.fillStyle = SHADOW; g.fill();
  g.fillStyle = '#bfc5cd'; g.fillRect(x - 70, y - 20, 140, 40);   // the base building
  g.fillStyle = '#9aa2ad'; g.fillRect(x - 70, y + 14, 140, 6);
  g.fillStyle = linear(g, x - 20, 0, x + 20, 0, [[0, '#f2f4f7'], [0.6, '#d7dce3'], [1, '#a7afb9']]); g.fillRect(x - 20, y - H * K_UP, 40, H * K_UP);   // the shaft
  const cy = y - H * K_UP;
  poly(g, [[x - 50, cy - 6], [x + 50, cy - 6], [x + 40, cy + 22], [x - 40, cy + 22]]); g.fillStyle = '#7d8793'; g.fill();
  poly(g, [[x - 48, cy - 38], [x + 48, cy - 38], [x + 52, cy - 6], [x - 52, cy - 6]]); g.fillStyle = linear(g, x - 50, 0, x + 50, 0, [[0, '#5fd3c6'], [0.5, '#2b8f8a'], [1, '#1d5f60']]); g.fill();   // the cab's tinted glass
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5; for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(x + k * 14, cy - 38); g.lineTo(x + k * 15, cy - 6); g.stroke(); }
  poly(g, [[x - 54, cy - 46], [x + 54, cy - 46], [x + 48, cy - 36], [x - 48, cy - 36]]); g.fillStyle = '#e9edf2'; g.fill();
  ell(g, x, cy - 50, 26, 10); g.fillStyle = '#ffffff'; g.fill();   // the roof, the radar dome
  circ(g, x, cy - 58, 9); g.fillStyle = radial(g, x - 3, cy - 61, 1, x, cy - 58, 9, [[0, '#ffffff'], [1, '#c9d0d8']]); g.fill();
  g.fillStyle = '#e83a2c'; circ(g, x + 30, cy - 52, 3); g.fill();
}

// ------------------------------------------------------------------------------------------------ the jets
// a jet from above, nose toward +x, BODY_L long, fin in its airline's colour. Sprites cached per livery.
const sprites = new Map();
function jetSprite(liv, shadow = false) {
  const key = liv + (shadow ? 's' : ''); let s = sprites.get(key); if (s) return s;
  const S = 1.6, w = Math.ceil((BODY_L + 40) * S), h = Math.ceil(380 * S), c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d'); g.translate(w / 2, h / 2); g.scale(S, S); jetShape(g, LIVERY[liv], shadow);
  s = { c, w: w / S, h: h / S }; sprites.set(key, s); return s;
}
function jetShape(g, L, shadow) {
  const F = BODY_L / 2, R = 19;
  const fill = (col) => { g.fillStyle = shadow ? '#000' : col; g.fill(); };
  // wings and tailplane (under the fuselage)
  for (const sd of [-1, 1]) {
    poly(g, [[42, sd * R * 0.8], [-58, sd * 162], [-86, sd * 162], [-54, sd * R * 0.8]]);
    if (shadow) fill('#000'); else { g.fillStyle = linear(g, 0, 0, 0, sd * 162, [[0, '#e6e9ee'], [1, '#c9ced6']]); g.fill(); g.strokeStyle = 'rgba(90,100,115,0.35)'; g.lineWidth = 1.2; g.stroke(); }
    if (!shadow) { g.fillStyle = L.tail; poly(g, [[-58, sd * 162], [-86, sd * 162], [-90, sd * 170], [-64, sd * 170]]); g.fill(); }   // winglets
    poly(g, [[-122, sd * R * 0.5], [-152, sd * 66], [-170, sd * 66], [-158, sd * R * 0.4]]); fill('#dfe3e8');
    // the engine under the wing: a nacelle with its dark intake in front and the exhaust cone behind
    g.beginPath(); g.roundRect(-14, sd * 68 - 12, 66, 24, 11); fill(L.eng);
    if (!shadow) { ell(g, 52, sd * 68, 4, 10); g.fillStyle = '#1f242c'; g.fill(); ell(g, -16, sd * 68, 5, 7); g.fillStyle = '#7d848d'; g.fill(); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(4, sd * 68 - 9, 40, 3); }
  }
  // the fuselage
  g.beginPath(); g.moveTo(F - R, -R); g.quadraticCurveTo(F + 4, -R, F + 4, 0); g.quadraticCurveTo(F + 4, R, F - R, R); g.lineTo(-F + 40, R); g.quadraticCurveTo(-F + 6, R * 0.6, -F, 2); g.lineTo(-F, -2); g.quadraticCurveTo(-F + 6, -R * 0.6, -F + 40, -R); g.closePath();
  if (shadow) { fill('#000'); return; }
  g.fillStyle = linear(g, 0, -R, 0, R, [[0, shade(L.body, -0.12)], [0.35, L.body], [0.55, '#ffffff'], [1, shade(L.body, -0.18)]]); g.fill();
  g.strokeStyle = 'rgba(80,90,105,0.4)'; g.lineWidth = 1.2; g.stroke();
  g.fillStyle = L.line; g.fillRect(-F + 30, -R + 2, F * 2 - 70, 3); g.fillRect(-F + 30, R - 5, F * 2 - 70, 3);   // the cheatlines
  g.fillStyle = '#3b4352'; for (let x = -F + 50; x < F - 40; x += 9) { g.fillRect(x, -R + 6, 4, 2.4); g.fillRect(x, R - 8.4, 4, 2.4); }   // windows
  g.fillStyle = '#1e2633'; g.beginPath(); g.moveTo(F - 14, -11); g.quadraticCurveTo(F - 4, -8, F - 2, 0); g.quadraticCurveTo(F - 4, 8, F - 14, 11); g.lineTo(F - 20, 9); g.lineTo(F - 20, -9); g.closePath(); g.fill();   // cockpit
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(F - 16, -6, 3, 4);
  // the fin, from above: a ridge in the airline's colour, and its logo on the roof
  g.fillStyle = L.tail; g.beginPath(); g.moveTo(-F + 70, -3); g.lineTo(-F + 2, -6); g.lineTo(-F + 2, 6); g.lineTo(-F + 70, 3); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(-F + 6, -1.5, 60, 1.5);
  circ(g, F * 0.25, 0, 7); g.fillStyle = L.tail; g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-F + 50, -R + 3, F * 2 - 90, 4);   // sunlight on the top left
}
// a jet at (x, y), heading a, up z: the sprite, lifted up the screen and a little bigger with height
export function drawJet(g, x, y, a, liv, z = 0, k = 1) {
  const s = jetSprite(liv), sc = k * (1 + z / 500);
  g.save(); g.translate(x, y - z * K_UP); g.rotate(a); g.scale(sc, sc); g.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h); g.restore();
}
function jetShadow(g, x, y, a, z, k = 1) {
  const s = jetSprite(0, true), sc = k * (1 - z / 900), off = 16 + z * 0.9;
  g.save(); g.globalAlpha = 0.22 * clamp(1 - z / 700, 0.25, 1); g.translate(x + off * 0.7, y + off); g.rotate(a); g.scale(sc, sc); g.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h); g.restore();
}

// ------------------------------------------------------------------------------------------------ animated, under the cars
// the walkways moving, luggage round the carousel, the crossings' lights, the jets' shadows and their blast on the ground
export function airportUnder(ctx, race) {
  const T = race.track, P = planOf(T), J = P.J, t = race.time;
  for (const b of P.belts) belt(ctx, b, t);
  const C = carouselOf(T); if (C) luggage(ctx, C, t);
  // the crossings: red lights flashing turn about on the posts while a jet's coming or going over
  for (const Wy of J.taxi) for (const x of Wy.cross) {
    if (!crossingLit(J, race.planes, Wy, x, t)) continue;
    const on = Math.floor(t * 3) % 2;
    for (const p of crossPosts(T, x)) for (const sd of [-1, 1]) {
      if ((sd > 0) !== !!on) continue;
      const lx = p.x + sd * 5.5, ly = p.y - 37.5;
      ctx.fillStyle = radial(ctx, lx, ly, 0, lx, ly, 26, [[0, 'rgba(255,60,40,0.55)'], [1, 'rgba(255,60,40,0)']]); ctx.fillRect(lx - 26, ly - 26, 52, 52);
      circ(ctx, lx, ly, 4.5); ctx.fillStyle = '#ff4a35'; ctx.fill(); circ(ctx, lx - 1, ly - 1, 1.8); ctx.fillStyle = '#ffd0c4'; ctx.fill();
    }
    // the stop bar across the taxiway each side of the road
    const q = trackSample(T, x.s);
    for (const sd of [-1, 1]) for (let k = -3; k <= 3; k++) { const lx = q.x + q.nx * sd * (q.hw + 34) + q.tx * k * 16, ly = q.y + q.ny * sd * (q.hw + 34) + q.ty * k * 16; circ(ctx, lx, ly, 3); ctx.fillStyle = on ? '#ff5a45' : '#b7261b'; ctx.fill(); }
  }
  for (const Pl of race.planes || []) {
    if (!jetAt(J, Pl, t)) continue;
    blast(ctx, J, Pl, t);
    jetShadow(ctx, PX, PY, PH, PZ);
  }
  for (const c of race.cars) if (c.blast > 0) windOn(ctx, race, J, c, t);
  P.aprons.forEach((r, i) => { for (let k = 0; k < 3; k++) vehicle(ctx, r, i * 3 + k, t); });
}
// the apron's traffic: tugs pulling luggage carts, a fuel truck, a follow-me car, each going round its apron's edge
function vehicle(ctx, r, n, t) {
  const m = 46, w = r.x1 - r.x0 - m * 2, h = r.y1 - r.y0 - m * 2, per = 2 * (w + h), v = [70, 55, 95][n % 3], u = ((t * v + n * per / 3.3) % per + per) % per;
  let x, y, a;
  if (u < w) { x = r.x0 + m + u; y = r.y0 + m; a = 0; } else if (u < w + h) { x = r.x1 - m; y = r.y0 + m + u - w; a = Math.PI / 2; } else if (u < 2 * w + h) { x = r.x1 - m - (u - w - h); y = r.y1 - m; a = Math.PI; } else { x = r.x0 + m; y = r.y1 - m - (u - 2 * w - h); a = -Math.PI / 2; }
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  const kind = n % 3;
  if (kind === 0) {   // a tug and three luggage carts
    for (let k = 0; k < 3; k++) { const cx = -30 - k * 24; ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(cx - 9, -6, 20, 16); ctx.fillStyle = '#5d636b'; ctx.fillRect(cx - 10, -8, 20, 16); for (let j = 0; j < 2; j++) { ctx.fillStyle = ['#e85d3f', '#2e86de', '#f4c430', '#20bf6b'][(n + k + j) % 4]; ctx.fillRect(cx - 8 + j * 9, -6, 7, 12); } }
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(-9, -7, 22, 18); ctx.fillStyle = '#f4c430'; ctx.beginPath(); ctx.roundRect(-11, -9, 22, 18, 3); ctx.fill(); ctx.fillStyle = '#2b2f38'; ctx.fillRect(-4, -7, 8, 14);
  } else if (kind === 1) {   // a fuel truck
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(-36, -9, 64, 22); ctx.fillStyle = '#e9edf2'; ctx.beginPath(); ctx.roundRect(-40, -11, 56, 22, 9); ctx.fill(); ctx.fillStyle = '#24a35a'; ctx.fillRect(-40, -2, 56, 4); ctx.fillStyle = '#2e6fb5'; ctx.fillRect(18, -10, 14, 20); ctx.fillStyle = 'rgba(200,230,255,0.8)'; ctx.fillRect(28, -8, 4, 16);
  } else {   // the follow-me car, its light bar flashing
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(-12, -6, 28, 16); ctx.fillStyle = '#f4c430'; ctx.beginPath(); ctx.roundRect(-14, -8, 28, 16, 4); ctx.fill();
    for (let k = 0; k < 4; k++) { ctx.fillStyle = '#1b1d21'; ctx.fillRect(-12 + k * 6, k % 2 ? -8 : 2, 6, 6); }
    ctx.fillStyle = Math.floor(t * 4 + n) % 2 ? '#ff9f1c' : '#ffd166'; ctx.fillRect(-3, -7, 4, 14);
  }
  ctx.restore();
}
// a walkway: a dark rubber band with steel edges, slats running along it at its speed, chevrons showing which way
function belt(ctx, b, t) {
  const R = b.R, step = 6, half = b.half;
  const edge = (lat, from, to) => { ctx.beginPath(); for (let s = from; s <= to; s += step) { const q = trackSample(R, s); s === from ? ctx.moveTo(q.x + q.nx * lat, q.y + q.ny * lat) : ctx.lineTo(q.x + q.nx * lat, q.y + q.ny * lat); } };
  const lo = b.lat - half, hi = b.lat + half;
  ctx.beginPath();
  for (let s = b.s0; s <= b.s1; s += step) { const q = trackSample(R, s); s === b.s0 ? ctx.moveTo(q.x + q.nx * lo, q.y + q.ny * lo) : ctx.lineTo(q.x + q.nx * lo, q.y + q.ny * lo); }
  for (let s = b.s1; s >= b.s0; s -= step) { const q = trackSample(R, s); ctx.lineTo(q.x + q.nx * hi, q.y + q.ny * hi); }
  ctx.closePath(); ctx.fillStyle = b.v < 0 ? '#3a2a30' : '#2c3036'; ctx.fill();
  // the slats, moving
  const sp = 15, off = ((t * b.v) % sp + sp) % sp;
  ctx.strokeStyle = b.v < 0 ? 'rgba(255,150,140,0.28)' : 'rgba(200,210,225,0.3)'; ctx.lineWidth = 2; ctx.beginPath();
  for (let s = b.s0 + off; s <= b.s1; s += sp) { const q = trackSample(R, s); ctx.moveTo(q.x + q.nx * (lo + 3), q.y + q.ny * (lo + 3)); ctx.lineTo(q.x + q.nx * (hi - 3), q.y + q.ny * (hi - 3)); }
  ctx.stroke();
  // chevrons every so often, moving with it: amber with you, red against you
  const cs = 110, co = ((t * b.v) % cs + cs) % cs, dir = Math.sign(b.v), w = Math.min(half * 0.7, 26);
  ctx.strokeStyle = b.v < 0 ? '#ff5a4a' : '#ffc94a'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let s = b.s0 + co + 20; s <= b.s1 - 20; s += cs) {
    const q = trackSample(R, s), c = { x: q.x + q.nx * b.lat, y: q.y + q.ny * b.lat };
    for (const k of b.full ? [-0.5, 0.5] : [0]) {
      const cx = c.x + q.nx * k * half, cy = c.y + q.ny * k * half;
      ctx.beginPath(); ctx.moveTo(cx - q.tx * dir * 9 - q.nx * w, cy - q.ty * dir * 9 - q.ny * w); ctx.lineTo(cx + q.tx * dir * 9, cy + q.ty * dir * 9); ctx.lineTo(cx - q.tx * dir * 9 + q.nx * w, cy - q.ty * dir * 9 + q.ny * w); ctx.stroke();
    }
  }
  // steel edges (handrails on the full-width one), comb plates at the ends
  ctx.strokeStyle = b.full ? '#1b1d21' : '#aeb5be'; ctx.lineWidth = b.full ? 7 : 3;
  edge(lo, b.s0, b.s1); ctx.stroke(); edge(hi, b.s0, b.s1); ctx.stroke();
  if (b.full) { ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2; edge(lo + 1, b.s0, b.s1); ctx.stroke(); edge(hi - 1, b.s0, b.s1); ctx.stroke(); }
  for (const s of [b.s0, b.s1]) { const q = trackSample(R, s); ctx.strokeStyle = '#c9ced6'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(q.x + q.nx * lo, q.y + q.ny * lo); ctx.lineTo(q.x + q.nx * hi, q.y + q.ny * hi); ctx.stroke(); }
}
// suitcases going round the carousel at the baggage belt's speed
function luggage(ctx, C, t) {
  const n = 16, rr = C.r * 0.78, w = C.b.v / rr;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2; circ(ctx, C.x, C.y, rr); ctx.stroke();
  for (let k = 0; k < n; k++) {
    if (k % 5 === 3) continue;
    const a = k / n * TAU - t * w, x = C.x + Math.cos(a) * rr, y = C.y + Math.sin(a) * rr;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a + (k % 3) * 0.4);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-7, -4, 16, 12);
    ctx.fillStyle = ['#e85d3f', '#2e86de', '#f4c430', '#20bf6b', '#a55eea', '#2d3436'][k % 6]; ctx.beginPath(); ctx.roundRect(-9, -6, 16, 11, 2.5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-7, -5, 12, 2);
    ctx.restore();
  }
}
// a jet's blast on the ground: a shimmering cone strongest at the engines, dust, streaks rushing back
function blast(ctx, J, Pl, t) {
  if (PZ > 60 || PK < TAXI_K - 0.01) return;
  const ch = Math.cos(PH), sh = Math.sin(PH), ex = PX - ch * EXHAUST, ey = PY - sh * EXHAUST, R = 260 + 1450 * PK, k = PK * (1 - PZ / 60);
  ctx.save();
  if (J.fence) {   // nothing past the blast fence (it only stops what's behind its own span)
    const F = J.fence, dx = F.x1 - F.x0, dy = F.y1 - F.y0, fl = Math.hypot(dx, dy), ux = dx / fl, uy = dy / fl;
    const nx = uy, ny = -ux, side = Math.sign((ex - F.x0) * nx + (ey - F.y0) * ny), rel = (ex - F.x0) * ux + (ey - F.y0) * uy;
    if (rel > -500 && rel < fl + 500) {
      const L = 5000; ctx.beginPath(); ctx.moveTo(F.x0 - ux * L, F.y0 - uy * L); ctx.lineTo(F.x1 + ux * L, F.y1 + uy * L);
      ctx.lineTo(F.x1 + ux * L + nx * side * L, F.y1 + uy * L + ny * side * L); ctx.lineTo(F.x0 - ux * L + nx * side * L, F.y0 - uy * L + ny * side * L); ctx.closePath(); ctx.clip();
    }
  }
  ctx.translate(ex, ey); ctx.rotate(PH + Math.PI);   // +x: back from the engines
  const Rv = R * 0.75, w1 = 95 + 0.42 * Rv;
  ctx.beginPath(); ctx.moveTo(0, -95); ctx.lineTo(Rv, -w1); ctx.lineTo(Rv, w1); ctx.lineTo(0, 95); ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, 0, Rv, 0, [[0, `rgba(255,240,215,${0.28 * k})`], [0.3, `rgba(255,255,255,${0.09 * k})`], [1, 'rgba(255,255,255,0)']]); ctx.fill();
  // heat ripples spreading back from the engines
  ctx.save(); ctx.clip();
  for (let i = 0; i < 4; i++) { const f = (t * 1.6 + i / 4) % 1, rr = 60 + f * Rv * 0.5; ctx.strokeStyle = `rgba(255,255,255,${(1 - f) * 0.16 * k})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-40, 0, rr, -0.5, 0.5); ctx.stroke(); }
  ctx.restore();
  // dust kicked up behind the engines, rolling back
  for (let i = 0; i < 6; i++) {
    const f = ((t * (0.9 + 0.4 * k) + i / 6) % 1), d = 40 + f * 380 * k, r = 14 + f * 40, a = (1 - f) * 0.22 * k;
    for (const sd of [-1, 1]) { ctx.fillStyle = `rgba(214,206,186,${a})`; circ(ctx, d, sd * (60 + f * 50), r); ctx.fill(); }
  }
  // streaks rushing back down it, most near its middle
  const rng = mulberry(Pl.id * 97 + 3), n = Math.round(6 + 12 * k);
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const u = rng() * 2 - 1, lane = u * Math.abs(u) * 0.75, sp = 900 + rng() * 600, ph = rng(), d = ((t * sp / Rv + ph) % 1) * Rv, len = 50 + 80 * k, wd = 95 + 0.42 * d;
    const a = (1 - d / Rv) * k * 0.55; if (a < 0.03) continue;
    ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 1.5 + 1.5 * k;
    ctx.beginPath(); ctx.moveTo(d, lane * wd); ctx.lineTo(d + len, lane * (wd + 0.42 * len)); ctx.stroke();
  }
  ctx.restore();
}
// a kart in a jet's blast: wind streaming past it the way the blast blows
function windOn(ctx, race, J, c, t) {
  if (blastAt(J, race.planes, c.x, c.y, t) < 0.12) return;
  const g = Math.hypot(BX, BY), ux = BX / g, uy = BY / g, k = Math.min(1, g + 1.5 * Math.hypot(SX, SY));   // (a slingshot shows the most)
  ctx.save(); ctx.lineCap = 'round';
  for (let i = 0, n = Math.round(6 + 8 * k); i < n; i++) {
    const f = (t * 3.6 + i * 0.29 + c.idx * 0.21) % 1, off = ((i * 37) % 9 - 4) * 8, d = -60 + f * 140, len = 26 + 44 * k;
    const x = c.x + ux * d - uy * off, y = c.y + uy * d + ux * off;
    ctx.globalAlpha = Math.sin(f * Math.PI) * (0.5 + 0.5 * k);
    ctx.strokeStyle = 'rgba(70,80,95,0.35)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - ux * len + 1, y - uy * len + 2); ctx.lineTo(x + 1, y + 2); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 + 1.5 * k; ctx.beginPath(); ctx.moveTo(x - ux * len, y - uy * len); ctx.lineTo(x, y); ctx.stroke();
  }
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ over the cars
// the jets themselves (they're taller than any kart), the heat haze behind their engines, the windsocks
export function airportOver(ctx, race) {
  const T = race.track, P = planOf(T), J = P.J, t = race.time;
  for (const Pl of race.planes || []) {
    if (!jetAt(J, Pl, t)) continue;
    const x = PX, y = PY, a = PH, z = PZ, k = PK;
    // engines glowing hot as it runs up and rolls
    if (k > 0.5 && z < 120) for (const sd of [-1, 1]) {
      const ex = x + Math.cos(a) * -18 - Math.sin(a) * sd * 68, ey = y + Math.sin(a) * -18 + Math.cos(a) * sd * 68 - z * K_UP, r = 30 + 40 * k;
      ctx.fillStyle = radial(ctx, ex, ey, 0, ex, ey, r, [[0, `rgba(255,214,150,${0.45 * (k - 0.4)})`], [1, 'rgba(255,214,150,0)']]); ctx.fillRect(ex - r, ey - r, r * 2, r * 2);
    }
    drawJet(ctx, x, y, a, Pl.id % LIVERY.length, z);
    if (z < 2 && PV > 1) {   // the wheels' tiny wake of dust on the taxiway
      for (const sd of [-1, 1]) { const bx = x - Math.cos(a) * 30 - Math.sin(a) * sd * 22, by = y - Math.sin(a) * 30 + Math.cos(a) * sd * 22; circ(ctx, bx, by, 3); ctx.fillStyle = 'rgba(40,40,40,0.35)'; ctx.fill(); }
    }
    // beacon and strobes
    const fl = Math.floor(t * 1.4 + Pl.id) % 2;
    if (fl) { const bx = x, by = y - z * K_UP; circ(ctx, bx, by, 5); ctx.fillStyle = '#ff3b30'; ctx.fill(); }
  }
  // windsocks: orange and white, streaming out with the breeze, flapping
  for (const [i, s] of P.socks.entries()) {
    const a = 0.25 + Math.sin(t * 0.7 + i) * 0.12, fl = Math.sin(t * 9 + i * 2) * 3;
    ctx.save(); ctx.translate(s.x, s.y - 40); ctx.rotate(a);
    for (let k = 0; k < 5; k++) { const x0 = k * 9, w0 = 7 - k * 0.8; ctx.fillStyle = k % 2 ? '#ffffff' : '#ff6a1f'; ctx.beginPath(); ctx.moveTo(x0, -w0 + fl * k / 5); ctx.lineTo(x0 + 9, -w0 + 0.8 + fl * (k + 1) / 5); ctx.lineTo(x0 + 9, w0 - 0.8 + fl * (k + 1) / 5); ctx.lineTo(x0, w0 + fl * k / 5); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------------ roofs over the road
// the runway where the road tunnels under it, and the terminal's glass roof: { x, y, w, h, draw(g) } in world units,
// cached by render.js and laid over the cars
export function airportRoofs(T) {
  const P = planOf(T), J = P.J, out = [], W = J.runway;
  for (const R of [T]) for (const [s0, s1] of R.mech.jets.under) {
    const qa = trackSample(R, s0), qb = trackSample(R, s1), xs = [qa.x, qb.x], ys = [qa.y, qb.y];
    const x0 = Math.min(...xs) - 260, x1 = Math.max(...xs) + 260, y0 = Math.min(...ys) - 260, y1 = Math.max(...ys) + 260;
    out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, draw: g => {
      // the runway over the road: clipped to the tarmac and its shoulders, so it lines up with the ground under it
      g.save(); g.translate(W.bx, W.by); g.rotate(Math.atan2(W.uy, W.ux)); g.beginPath(); g.rect(-60, -W.hw - 16, Math.hypot(W.ax - W.bx, W.ay - W.by) + 120, W.hw * 2 + 32); g.restore();
      g.save(); g.clip(); g.beginPath();   // ...and only over the road itself (its edges hide the seam)
      for (let s = s0 - 40; s <= s1 + 40; s += 6) { const q = trackSample(R, s); s === s0 - 40 ? g.moveTo(q.x + q.nx * (q.hw + 12), q.y + q.ny * (q.hw + 12)) : g.lineTo(q.x + q.nx * (q.hw + 12), q.y + q.ny * (q.hw + 12)); }
      for (let s = s1 + 40; s >= s0 - 40; s -= 6) { const q = trackSample(R, s); g.lineTo(q.x - q.nx * (q.hw + 12), q.y - q.ny * (q.hw + 12)); }
      g.closePath(); g.clip(); runway(g, W, 1);
      g.restore();
      // the tunnel's mouths at the runway's edges: dark, with a concrete lip
      for (const [s, sd] of [[s0, -1], [s1, 1]]) {
        const q = trackSample(R, s);
        g.save(); g.translate(q.x, q.y); g.rotate(Math.atan2(q.ty, q.tx));
        g.fillStyle = linear(g, 0, 0, sd * -60, 0, [[0, 'rgba(10,12,16,0.75)'], [1, 'rgba(10,12,16,0)']]); g.fillRect(sd < 0 ? 0 : -60, -q.hw - 6, 60, q.hw * 2 + 12);
        g.restore();
      }
    } });
  }
  if (P.terminal) {
    const r = P.terminal;
    out.push({ x: r.x0 - 30, y: r.y0 - 60, w: r.x1 - r.x0 + 60, h: r.y1 - r.y0 + 90, draw: g => glassRoof(g, r) });
  }
  return out;
}
// a glass roof on a white steel frame: faintly blue panes you see straight through, the frame's lines, a solid rim
function glassRoof(g, r) {
  const w = r.x1 - r.x0, h = r.y1 - r.y0;
  g.fillStyle = 'rgba(170,215,255,0.13)'; g.fillRect(r.x0, r.y0, w, h);
  g.fillStyle = linear(g, r.x0, r.y0, r.x0 + w * 0.6, r.y0 + h * 0.6, [[0, 'rgba(255,255,255,0.16)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(r.x0, r.y0, w, h);
  g.strokeStyle = 'rgba(245,248,252,0.42)'; g.lineWidth = 2; g.beginPath();
  for (let x = r.x0 + 90; x < r.x1; x += 90) { g.moveTo(x, r.y0); g.lineTo(x, r.y1); }
  for (let y = r.y0 + 90; y < r.y1; y += 90) { g.moveTo(r.x0, y); g.lineTo(r.x1, y); }
  g.stroke();
  g.strokeStyle = 'rgba(245,248,252,0.18)'; g.lineWidth = 1; g.beginPath();
  for (let x = r.x0 + 45; x < r.x1; x += 90) { g.moveTo(x, r.y0); g.lineTo(x, r.y1); }
  g.stroke();
  for (let x = r.x0 + 90; x < r.x1; x += 90) for (let y = r.y0 + 90; y < r.y1; y += 90) { circ(g, x, y, 3.5); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fill(); }
  // sun glinting off a few panes
  for (let k = 0; k < 6; k++) { const x = r.x0 + ((k * 337) % 900) / 900 * w, y = r.y0 + ((k * 523) % 700) / 700 * h; g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, y, 90, 90); }
  // the rim: a solid steel edge, its shadow outside it
  g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(r.x0 + 8, r.y1, w, 14); g.fillRect(r.x1, r.y0 + 10, 12, h);
  g.strokeStyle = '#e9edf2'; g.lineWidth = 12; g.strokeRect(r.x0, r.y0, w, h);
  g.strokeStyle = '#9aa2ad'; g.lineWidth = 2; g.strokeRect(r.x0 + 6, r.y0 + 6, w - 12, h - 12);
  g.fillStyle = '#24346e'; g.fillRect(r.x0 + w / 2 - 170, r.y0 - 40, 340, 44);
  g.fillStyle = '#ffffff'; g.font = '800 28px "Bungee", "Fredoka", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GATEWAY 8080', r.x0 + w / 2, r.y0 - 17);
}

// ------------------------------------------------------------------------------------------------ props and landmarks
// the scattered props (on the grass, off the airport's paved bits): shrubs, taxiway signs, light masts, luggage carts
export function airportProp(g, d, shadowPass) {
  const { x, y, r, v } = d, rng = mulberry(Math.floor(v * 1e6) + 7);
  if (v < 0.5) {   // a clump of shrubs
    if (shadowPass) { ell(g, x + r * 0.35, y + r * 0.45, r, r * 0.75); g.fillStyle = SHADOW; g.fill(); return; }
    for (let k = 0; k < 5; k++) { const a = rng() * TAU, dd = rng() * r * 0.5, rr = r * (0.35 + rng() * 0.3), px = x + Math.cos(a) * dd, py = y + Math.sin(a) * dd; circ(g, px, py, rr); g.fillStyle = radial(g, px - rr * 0.3, py - rr * 0.35, 1, px, py, rr, [[0, '#8fd26a'], [1, '#3c8b3a']]); g.fill(); }
  } else if (v < 0.68) {   // a taxiway sign: yellow on black, on short legs
    if (shadowPass) { g.fillStyle = SHADOW; g.fillRect(x - 20 + 6, y + 4, 40, 8); return; }
    g.fillStyle = '#1b1d21'; g.fillRect(x - 22, y - 18, 44, 18); g.fillStyle = PAINT_Y; g.fillRect(x - 20, y - 16, 20, 14);
    g.fillStyle = '#1b1d21'; g.font = '800 11px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(['B', 'C', 'A', 'D'][Math.floor(rng() * 4)], x - 10, y - 9);
    g.fillStyle = PAINT_Y; g.fillText('→', x + 11, y - 9);
  } else if (v < 0.82) {   // a light mast
    if (shadowPass) { g.fillStyle = SHADOW; g.fillRect(x, y, 70, 4); return; }
    g.fillStyle = '#b9c0c8'; g.fillRect(x - 2, y - 60, 4, 62); g.fillStyle = '#e9edf2'; g.fillRect(x - 12, y - 66, 24, 8); g.fillStyle = '#fff6c9'; g.fillRect(x - 10, y - 60, 20, 2);
  } else {   // luggage carts in a train
    if (shadowPass) { g.fillStyle = SHADOW; g.fillRect(x - 30 + 4, y - 8 + 6, 80, 18); return; }
    for (let k = 0; k < 3; k++) { const cx = x - 30 + k * 26; g.fillStyle = '#5d636b'; g.fillRect(cx, y - 8, 22, 16); for (let j = 0; j < 2; j++) { g.fillStyle = ['#e85d3f', '#2e86de', '#f4c430', '#20bf6b'][Math.floor(rng() * 4)]; g.fillRect(cx + 2 + j * 10, y - 6, 8, 11); } }
    g.fillStyle = '#f4c430'; g.fillRect(x - 52, y - 9, 18, 18);
  }
}
// the landmarks in the biggest clearings: the car park, the fuel farm
export function airportLandmark(g, c, i) {
  const { x, y, r } = c, rng = mulberry(Math.floor(c.v * 1e6));
  if (i % 2 === 0) {   // a car park: bays and cars
    const w = Math.min(r * 1.4, 360), h = Math.min(r * 1.1, 260);
    g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(x - w / 2 + 5, y - h / 2 + 7, w, h);
    g.fillStyle = '#6a6e75'; g.fillRect(x - w / 2, y - h / 2, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2;
    for (let row = 0; row < 3; row++) for (let k = 0; k <= Math.floor(w / 30); k++) { const bx = x - w / 2 + k * 30, by = y - h / 2 + 10 + row * (h - 20) / 3; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx, by + 34); g.stroke();
      if (k < Math.floor(w / 30) && rng() < 0.7) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(bx + 6, by + 6, 20, 30); g.fillStyle = ['#e85d3f', '#ffffff', '#2e86de', '#2d3436', '#f4c430', '#c9ced6'][Math.floor(rng() * 6)]; g.beginPath(); g.roundRect(bx + 4, by + 3, 20, 30, 5); g.fill(); g.fillStyle = 'rgba(30,40,60,0.5)'; g.fillRect(bx + 6, by + 8, 16, 6); } }
  } else {   // the fuel farm: round white tanks in a bund
    const n = 3;
    g.fillStyle = '#b6b09f'; g.fillRect(x - r * 0.8, y - r * 0.45, r * 1.6, r * 0.9);
    for (let k = 0; k < n; k++) { const tx = x - r * 0.5 + k * r * 0.5, tr = r * 0.2; circ(g, tx + 8, y + 10, tr); g.fillStyle = SHADOW; g.fill(); circ(g, tx, y, tr); g.fillStyle = radial(g, tx - tr * 0.3, y - tr * 0.35, 2, tx, y, tr, [[0, '#ffffff'], [1, '#c9ced6']]); g.fill(); g.strokeStyle = 'rgba(120,130,140,0.4)'; g.lineWidth = 2; circ(g, tx, y, tr * 0.6); g.stroke(); }
  }
}
