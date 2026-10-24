// Kernel Kart art: Pyth Plateau (theme deco 'plateau'), a ceremonial city of painted step pyramids on a dry, sunny
// highland, with the farms and villages that feed it. Lit from the top left like everything else: golden grass and red
// earth, plaster plazas, pyramids in red plaster with cream terraces, and the feathered serpent everywhere in Pyth's own
// blue and yellow. Buildings are seen from above and a little from the south, like the Sun Gate (heights go up the
// screen, so you see their south faces and doorways), shadows falling down and to the right. Here: the ground (grass,
// ruins of old compounds, villages of thatched houses with their maize, terraced fields, a market, cenotes, birds), the
// props (agave, prickly pear, organ-pipe cactus, carved serpent heads, shrines, braziers, stelae, houses, rocks), the
// landmarks (the Pyramid of the Sun, the serpent temple with Pyth's mosaic on its plaza, the ball court) and the Sun Gate.
import { TAU, mulberry } from '../core.js';
import { alpha, circ, ell, linear, poly, radial, shade, star } from './paint.js';
import { trackSample } from '../geometry.js';

const BLUE = '#3776ab', BLUE_LT = '#5d9bd1', BLUE_DK = '#1f4d78', YEL = '#ffd43b', YEL_DK = '#d9a300', INK = '#122b44';
const RED = '#b8462f', CREAM = '#efe1c2', PLASTER = '#e6d6b2', STONE = '#cdb78c', JADE = '#2f9a8a';
const SHADOW = 'rgba(60,30,10,0.26)';

// ------------------------------------------------------------------------------------------------ projection
// A point z up is drawn z * ZK up the screen; its shadow falls on the ground SH per unit of height down and to the right.
const ZK = 0.9, SH = [0.28, 0.38], TAL = 0.72;   // (TAL: how much of each tier's step in is the sloping talud, the rest its terrace)
const lift = (pts, z) => pts.map(([x, y]) => [x, y - z * ZK]);
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
function hull(pts) {   // convex hull (monotone chain)
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], hi = [];
  for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length > 1 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
// the shadow on the ground of something standing on the convex footprint `foot` whose top (`top`, by default the same
// outline) is z high
function castShadow(g, foot, z, top = foot, col = 'rgba(60,30,10,0.28)') {
  poly(g, hull([...foot, ...top.map(([x, y]) => [x + z * SH[0], y + z * SH[1]])])); g.fillStyle = col; g.fill();
}
// a convex block standing on `foot` (clockwise on screen) from z0 to z1: the faces turned toward us (the more they face
// west the more sun they get), then its top. Hex colours.
function prism(g, foot, z0, z1, top, side, edge = 0.22) {
  const n = foot.length;
  for (let i = 0; i < n; i++) {
    const a = foot[i], b = foot[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1, nx = ey / L, ny = -ex / L;
    if (ny < 0.02) continue;
    poly(g, [[a[0], a[1] - z0 * ZK], [b[0], b[1] - z0 * ZK], [b[0], b[1] - z1 * ZK], [a[0], a[1] - z1 * ZK]]);
    g.fillStyle = shade(side, -nx * 0.3); g.fill();
  }
  poly(g, lift(foot, z1)); g.fillStyle = top; g.fill();
  if (edge) { g.strokeStyle = alpha('#3a1a0a', edge); g.lineWidth = 0.8; g.stroke(); }
}
const box = (g, x0, y0, x1, y1, z0, z1, top, side, edge) => prism(g, rect(x0, y0, x1, y1), z0, z1, top, side, edge);

// ------------------------------------------------------------------------------------------------ ground
// dry highland from above: patches of bare red earth, tussocks of golden grass, pebbles and grains; then, clear of the
// road, the landmarks and the props, the life of the plateau: ruined compounds, villages, fields, a market, cenotes
export function plateauGround(g, rng, X0, Y0, W, H, n, dist, D, T, marks = []) {
  const area = W * H;
  for (let i = 0; i < area / 160000; i++) {   // bare red earth showing through the grass, in soft blotches
    const x = X0 + rng() * W, y = Y0 + rng() * H, r = 60 + rng() * 160;
    g.save(); g.translate(x, y); g.rotate(rng() * TAU); g.scale(1, 0.5 + rng() * 0.4);
    g.fillStyle = radial(g, 0, 0, 0, 0, 0, r, [[0, alpha('#b9683e', 0.4)], [0.7, alpha('#b9683e', 0.18)], [1, alpha('#b9683e', 0)]]); g.fillRect(-r, -r, r * 2, r * 2);
    g.restore();
  }
  g.lineCap = 'round';
  for (let i = 0; i < n * 0.5; i++) {   // grass blades, mostly leaning one way in the wind
    const x = X0 + rng() * W, y = Y0 + rng() * H, l = 3 + rng() * 5, a = -1.1 + rng() * 0.7;
    g.strokeStyle = rng() < 0.55 ? alpha('#a4893e', 0.45) : alpha('#f4e3a6', 0.5); g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  for (let i = 0; i < area / 9000 * (0.3 + 0.7 * D); i++) {   // tussocks: a dark core and blades fanning out of it
    const x = X0 + rng() * W, y = Y0 + rng() * H; if (dist(x, y, 90) < 30) continue;
    const r = 5 + rng() * 7;
    ell(g, x + r * 0.35, y + r * 0.4, r * 0.9, r * 0.55); g.fillStyle = 'rgba(80,50,15,0.18)'; g.fill();
    for (let k = 0; k < 11; k++) { const a = k / 11 * TAU + rng() * 0.4, l = r * (0.7 + rng() * 0.5); g.strokeStyle = Math.cos(a + 2.4) > 0 ? '#f1dc94' : '#b49543'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.85); g.stroke(); }
  }
  for (let i = 0; i < area / 14000 * D; i++) {   // pebbles
    const x = X0 + rng() * W, y = Y0 + rng() * H, r = 1.2 + rng() * 2.4;
    ell(g, x + 0.8, y + 0.9, r, r * 0.7); g.fillStyle = 'rgba(70,40,15,0.3)'; g.fill();
    ell(g, x, y, r, r * 0.7); g.fillStyle = rng() < 0.5 ? '#c9a77a' : '#e3cfa8'; g.fill();
  }
  for (let i = 0; i < n / 3; i++) { g.fillStyle = rng() < 0.5 ? alpha('#8a5a2a', 0.25) : alpha('#fff3cf', 0.3); g.fillRect(X0 + rng() * W, Y0 + rng() * H, 1.4, 1.4); }
  if (D < 0.5) return;
  // the places, each in its own spot: clear of the road and its run-off, the landmarks, the props, the secret, each other
  const sc = T.def.scale || 1, keep = [...marks.map(m => [m.x, m.y, m.r * 0.95]), ...(T.deco || []).map(d => [d.x, d.y, d.r + 6]), ...(T.def.secrets || []).flatMap(s => [s.at, s.to, s.via].filter(Boolean).map(([x, y]) => [x * sc, y * sc, 120]))];
  const places = [['village', 120], ['terraces', 115], ['market', 105], ['cenote', 62], ['village', 110], ['ruin', 85], ['terraces', 100], ['ruin', 80], ['cenote', 55], ['village', 100], ['ruin', 75], ['ruin', 75]];
  const B = T.bbox;
  for (const [kind, R] of places) {
    for (let tries = 0; tries < 80; tries++) {
      const x = B.x + 60 + rng() * (B.w - 120), y = B.y + 60 + rng() * (B.h - 120);
      if (dist(x, y, R + 200) < R + 105 || keep.some(([kx, ky, kr]) => Math.hypot(kx - x, ky - y) < kr + R)) continue;
      keep.push([x, y, R + 30]);
      const q = mulberry(Math.floor(rng() * 1e9));
      if (kind === 'village') village(g, x, y, R, q); else if (kind === 'terraces') terraces(g, x, y, R, q); else if (kind === 'market') market(g, x, y, R, q); else if (kind === 'cenote') cenote(g, x, y, R, q); else ruin(g, x, y, R, q);
      break;
    }
  }
  for (let i = 0; i < area / 26000; i++) {   // small agaves and prickly pears dotted about the grass
    const x = X0 + rng() * W, y = Y0 + rng() * H; if (dist(x, y, 90) < 34 || keep.some(([kx, ky, kr]) => Math.hypot(kx - x, ky - y) < kr)) continue;
    const r = 7 + rng() * 6;
    ell(g, x + r * 0.35, y + r * 0.4, r, r * 0.75); g.fillStyle = SHADOW; g.fill();
    if (rng() < 0.7) agave(g, x, y, r, rng); else nopal(g, x, y, r * 1.3, rng);
  }
  for (let i = 0; i < 5; i++) {   // a few birds of prey riding the thermals, their shadows far below on the grass
    const x = X0 + rng() * W, y = Y0 + rng() * H, a = rng() * TAU, s = 9 + rng() * 4;
    if (dist(x, y, 200) < 120 || dist(x + 70, y + 95, 200) < 60) continue;
    bird(g, x + 70, y + 95, s, a, 'rgba(60,30,10,0.22)'); bird(g, x, y, s, a);
  }
}

// ------------------------------------------------------------------------------------------------ places
// a ruined compound: the stumps of stone walls round rooms and a courtyard, some standing a little higher than others,
// broken in places with the stones tumbled out round them, packed-earth floors, a grinding stone left behind
function ruin(g, x, y, R, q) {
  const rooms = [], w = R * (0.7 + q() * 0.3), h = R * (0.55 + q() * 0.25);
  rooms.push([-w, -h, w * 0.1, h * 0.2]);
  rooms.push([w * 0.1, -h, w, -h * 0.05]);
  if (q() < 0.8) rooms.push([-w * 0.55, h * 0.2, w * 0.45, h]);
  g.save(); g.translate(x, y);
  for (const [x0, y0, x1, y1] of rooms) { g.fillStyle = alpha('#b98a58', 0.32); g.fillRect(x0, y0, x1 - x0, y1 - y0); }
  const T = 4.5, walls = [];
  for (const [x0, y0, x1, y1] of rooms) {
    const door = q() * 4 | 0;
    [[x0, y0, x1, y0], [x1, y0, x1, y1], [x0, y1, x1, y1], [x0, y0, x0, y1]].forEach(([ax, ay, bx, by], k) => {
      const len = Math.hypot(bx - ax, by - ay); let f = 0;
      while (f < 1) {   // the wall in stretches: some standing, some broken off, a doorway in one side
        const step = (22 + q() * 30) / len, f1 = Math.min(1, f + step);
        if (!(k === door && f < 0.6 && f1 > 0.4) && q() < 0.82) walls.push([ax + (bx - ax) * f, ay + (by - ay) * f, ax + (bx - ax) * f1, ay + (by - ay) * f1, 3 + q() * 7]);
        f = f1 + (q() < 0.3 ? 6 / len : 0);
      }
    });
  }
  const foot = ([ax, ay, bx, by]) => ax === bx ? rect(ax - T / 2, Math.min(ay, by), ax + T / 2, Math.max(ay, by)) : rect(Math.min(ax, bx), ay - T / 2, Math.max(ax, bx), ay + T / 2);
  for (const wl of walls) castShadow(g, foot(wl), wl[4], foot(wl), 'rgba(60,30,10,0.24)');
  for (let i = 0; i < walls.length * 2; i++) {   // tumbled stones
    const wl = walls[q() * walls.length | 0], f = q(), sx = wl[0] + (wl[2] - wl[0]) * f + (q() - 0.5) * 14, sy = wl[1] + (wl[3] - wl[1]) * f + (q() - 0.5) * 14, r = 1.5 + q() * 2;
    ell(g, sx + 0.8, sy + 1, r, r * 0.75); g.fillStyle = 'rgba(60,30,10,0.3)'; g.fill(); ell(g, sx, sy, r, r * 0.75); g.fillStyle = q() < 0.5 ? '#d8c6a0' : '#bfa67c'; g.fill();
  }
  walls.sort((a, b) => Math.max(a[1], a[3]) - Math.max(b[1], b[3]));
  for (const wl of walls) {
    prism(g, foot(wl), 0, wl[4], '#e9dbb8', '#b49a70', 0.3);
    const [x0, y0, x1, y1] = [Math.min(wl[0], wl[2]), Math.min(wl[1], wl[3]), Math.max(wl[0], wl[2]), Math.max(wl[1], wl[3])];   // coursed stone: joints on the top
    g.strokeStyle = alpha('#8a6e46', 0.45); g.lineWidth = 0.7;
    if (y0 === y1) for (let u = x0 + 5; u < x1; u += 6) { g.beginPath(); g.moveTo(u, y0 - T / 2 - wl[4] * ZK); g.lineTo(u, y0 + T / 2 - wl[4] * ZK); g.stroke(); }
    else for (let u = y0 + 5; u < y1; u += 6) { g.beginPath(); g.moveTo(x0 - T / 2, u - wl[4] * ZK); g.lineTo(x0 + T / 2, u - wl[4] * ZK); g.stroke(); }
  }
  const [mx, my] = [rooms[0][0] * 0.4 + rooms[0][2] * 0.6, (rooms[0][1] + rooms[0][3]) / 2];   // a metate and its hand stone
  ell(g, mx + 2, my + 2.5, 7, 4.5); g.fillStyle = 'rgba(60,30,10,0.3)'; g.fill(); ell(g, mx, my, 7, 4.5); g.fillStyle = '#8f8576'; g.fill(); ell(g, mx - 0.5, my - 0.8, 5, 2.8); g.fillStyle = '#b3a996'; g.fill();
  ell(g, mx + 1, my - 1, 4, 1.4); g.fillStyle = '#6f6658'; g.fill();
  g.restore();
}
// a house of the plateau, its long side to the south: whitewashed adobe walls with a dark doorway, under a steep hipped
// roof of brown thatch that hangs well over them (half-sizes w, d of the walls)
function house(g, x, y, w, d, q, shadowOnly) {
  const zw = 9, ov = 4, zr = zw + (d + ov) * 1.25, W = w + ov, D = d + ov, rx = Math.max(0, W - D);
  if (shadowOnly !== false) castShadow(g, rect(x - W, y - D, x + W, y + D), zr, [[x - rx, y], [x + rx, y]]);
  if (shadowOnly) return;
  // the walls show under the eaves on the south side
  g.fillStyle = '#efe6d2'; g.fillRect(x - w, y + d - zw * ZK, w * 2, zw * ZK);
  g.fillStyle = alpha('#a07a50', 0.6); g.fillRect(x - w, y + d - 1.6, w * 2, 1.6);
  g.fillStyle = '#3a2418'; g.fillRect(x - w * 0.18 + (q() - 0.5) * w * 0.6, y + d - zw * ZK * 0.85, w * 0.3, zw * ZK * 0.85);   // the doorway
  const E = (sx, sy) => [x + sx * W, y + sy * D - zw * ZK], Rg = sx => [x + sx * rx, y - zr * ZK];
  const thatch = '#a87a42';
  const faces = [[[E(-1, -1), E(1, -1), Rg(1), Rg(-1)], 0.16], [[E(-1, -1), Rg(-1), E(-1, 1)], 0.12], [[E(1, -1), E(1, 1), Rg(1)], -0.3], [[E(-1, 1), Rg(-1), Rg(1), E(1, 1)], -0.04]];
  for (const [pts, l] of faces) { poly(g, pts); g.fillStyle = shade(thatch, l); g.fill(); }
  // straw: strokes down the south slope and the hips from the ridge to the eaves, ragged at the hem
  g.save(); poly(g, faces[3][0]); g.clip();
  g.lineCap = 'round';
  for (let u = -W; u <= W; u += 1.6) {
    const t = (u + W) / (2 * W), top = y - zr * ZK + (Math.abs(u) > rx ? (Math.abs(u) - rx) / (W - rx || 1) * (D * 2 + (zr - zw) * ZK) : 0);
    g.strokeStyle = q() < 0.5 ? alpha('#d8b06a', 0.55) : alpha('#6e4a22', 0.45); g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(x + u, top); g.lineTo(x + u + (t - 0.5) * 2, y + D - zw * ZK + q() * 1.5); g.stroke();
  }
  g.restore();
  for (const sx of [-1, 1]) { g.save(); poly(g, faces[sx < 0 ? 1 : 2][0]); g.clip(); for (let k = 0; k < 14; k++) { const t = k / 13; g.strokeStyle = alpha(sx < 0 ? '#e6c27e' : '#5a3a1a', 0.45); g.lineWidth = 0.8; g.beginPath(); g.moveTo(...Rg(sx)); g.lineTo(x + sx * W, y - D - zw * ZK + t * D * 2); g.stroke(); } g.restore(); }
  g.strokeStyle = '#5e3e1c'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(...Rg(-1)); g.lineTo(...Rg(1)); g.stroke();   // the ridge, bound with a darker roll
  g.strokeStyle = alpha('#f0d496', 0.6); g.lineWidth = 0.8; g.beginPath(); g.moveTo(Rg(-1)[0], Rg(-1)[1] - 1); g.lineTo(Rg(1)[0], Rg(1)[1] - 1); g.stroke();
  poly(g, [E(-1, 1), E(1, 1)], false); g.strokeStyle = alpha('#4a2e12', 0.7); g.lineWidth = 1.4; g.stroke();   // the hem of the eaves
}
// a cuexcomatl: a granary like a big clay jar with a little cap of thatch
function granary(g, x, y, r) {
  const h = r * 2.1;
  castShadow(g, [[x - r, y], [x + r, y], [x, y + r * 0.6], [x, y - r * 0.6]], h);
  g.fillStyle = linear(g, x - r, 0, x + r, 0, [[0, '#d99a62'], [0.4, '#c47a45'], [1, '#86502a']]);
  g.beginPath(); g.moveTo(x - r * 0.7, y); g.bezierCurveTo(x - r * 1.25, y - h * 0.35, x - r * 1.1, y - h * 0.7, x - r * 0.75, y - h * 0.78); g.lineTo(x + r * 0.75, y - h * 0.78); g.bezierCurveTo(x + r * 1.1, y - h * 0.7, x + r * 1.25, y - h * 0.35, x + r * 0.7, y); g.closePath(); g.fill();
  ell(g, x, y, r * 0.7, r * 0.25); g.fill();
  const cy = y - h * 0.78;   // the cap: a low cone of straw
  ell(g, x, cy, r * 1.05, r * 0.42); g.fillStyle = '#7a5428'; g.fill();
  poly(g, [[x - r * 1.05, cy], [x, cy - r * 0.95], [x + r * 1.05, cy], [x, cy + r * 0.42]]); g.fillStyle = linear(g, x - r, 0, x + r, 0, [[0, '#d0a560'], [0.5, '#a87a42'], [1, '#6e4a22']]); g.fill();
  g.strokeStyle = alpha('#5a3a1a', 0.4); g.lineWidth = 0.7; for (let k = -4; k <= 4; k++) { g.beginPath(); g.moveTo(x, cy - r * 0.95); g.lineTo(x + k * r * 0.25, cy + r * 0.35 - Math.abs(k) * r * 0.05); g.stroke(); }
}
// a patch of maize: rows of plants seen from above, each a little star of leaves
function maize(g, x0, y0, x1, y1, q, col = ['#4f8a34', '#7fb84a', '#a7d36a']) {
  g.fillStyle = alpha('#8a5230', 0.45); g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.lineCap = 'round';
  for (let yy = y0 + 4; yy < y1 - 2; yy += 7) {
    g.strokeStyle = alpha('#6a3a1e', 0.5); g.lineWidth = 1.2; g.beginPath(); g.moveTo(x0 + 2, yy + 2); g.lineTo(x1 - 2, yy + 2); g.stroke();   // the furrow
    for (let xx = x0 + 4 + q() * 2; xx < x1 - 2; xx += 6 + q() * 2) {
      const a0 = q() * TAU, l = 3.2 + q() * 1.5;
      for (let k = 0; k < 5; k++) { const a = a0 + k * TAU / 5; g.strokeStyle = col[Math.cos(a + 2.4) > 0.3 ? 2 : Math.cos(a + 2.4) > -0.3 ? 1 : 0]; g.lineWidth = 1.3; g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + Math.cos(a) * l, yy + Math.sin(a) * l * 0.8); g.stroke(); }
      if (q() < 0.25) { circ(g, xx, yy - 0.5, 0.9); g.fillStyle = '#f4dc7a'; g.fill(); }   // a tassel
    }
  }
}
// a village: a few thatched houses round a swept yard with its hearth and granary, and the family's maize beside it
function village(g, x, y, R, q) {
  const yard = R * 0.55;
  g.fillStyle = radial(g, x, y, 0, x, y, yard * 1.3, [[0, alpha('#e8cf9c', 0.85)], [0.7, alpha('#e2c48e', 0.55)], [1, alpha('#e2c48e', 0)]]); g.fillRect(x - yard * 1.4, y - yard * 1.4, yard * 2.8, yard * 2.8);
  const side = q() < 0.5 ? -1 : 1, fx0 = x + side * R * 0.45 - R * 0.42, fy0 = y - R * 0.75;   // the milpa, off to one side behind the houses
  maize(g, fx0, fy0, fx0 + R * 0.84, fy0 + R * 0.5, q);
  for (let u = fx0; u < fx0 + R * 0.84; u += 3.2) for (const yy of [fy0 - 1.5, fy0 + R * 0.5 + 1.5]) { circ(g, u, yy, 1.4); g.fillStyle = q() < 0.5 ? '#cdbb96' : '#a8916a'; g.fill(); }   // a dry-stone wall round it
  const spots = [[-R * 0.42, -R * 0.08, 0], [R * 0.3, -R * 0.05, 1], [-R * 0.05, R * 0.4, 2], [R * 0.55, R * 0.42, 3]].slice(0, 3 + (q() < 0.5 ? 1 : 0));
  const hs = spots.map(([dx, dy]) => [x + dx + (q() - 0.5) * R * 0.14, y + dy + (q() - 0.5) * R * 0.1, 12 + q() * 7, 8 + q() * 3]);
  const gx = x - side * R * 0.55, gy = y + R * 0.4;
  for (const [hx, hy, w, d] of hs) house(g, hx, hy, w, d, q, true);
  castShadow(g, [[gx - 6, gy], [gx + 6, gy]], 14);
  const items = [...hs.map(h => ['h', h]), ['g', [gx, gy]], ['f', [x + R * 0.12, y + R * 0.12]]].sort((a, b) => a[1][1] - b[1][1]);
  for (const [k, [hx, hy, w, d]] of items) {
    if (k === 'h') house(g, hx, hy, w, d, q, false);
    else if (k === 'g') granary(g, hx, hy, 6.5);
    else hearth(g, hx, hy);
  }
}
function hearth(g, x, y) {   // three stones round the embers of a cooking fire, a comal on top, a wisp of smoke
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + 0.4; ell(g, x + Math.cos(a) * 4.5 + 0.8, y + Math.sin(a) * 3.6 + 1, 2.2, 1.7); g.fillStyle = 'rgba(40,20,10,0.35)'; g.fill(); ell(g, x + Math.cos(a) * 4.5, y + Math.sin(a) * 3.6, 2.2, 1.7); g.fillStyle = '#8a8072'; g.fill(); }
  circ(g, x, y, 2.6); g.fillStyle = radial(g, x, y, 0, x, y, 2.6, [[0, '#fff0a0'], [0.5, '#ff9a2a'], [1, '#b8401a']]); g.fill();
  for (let k = 0; k < 3; k++) { ell(g, x + 4 + k * 5, y - 4 - k * 2, 3 + k * 1.4, 2 + k, 0.5); g.fillStyle = `rgba(250,248,240,${0.35 - k * 0.09})`; g.fill(); }
}
// a hill farmed in terraces: rings of fields following the contours up to a tree on top, each held up by a dry-stone
// retaining wall that shows on its south side. Maize in most rings, one of red amaranth, one left fallow.
function terraces(g, x, y, R, q) {
  const n = 5, wallH = 6, f1 = q() * TAU, f2 = q() * TAU, amar = 1 + (q() * 3 | 0), fallow = (amar + 2) % n;
  const ring = (k, z, grow = 0) => { const out = [], rk = R * (1 - k / n * 0.82) + grow; for (let i = 0; i < 64; i++) { const a = i / 64 * TAU, w = 1 + 0.07 * Math.sin(3 * a + f1) + 0.025 * Math.sin(5 * a + f2); out.push([x + Math.cos(a) * rk * w, y + Math.sin(a) * rk * w * 0.7 - z * ZK]); } return out; };
  poly(g, ring(0, 0, 4).map(([px, py]) => [px + 10, py + 13])); g.fillStyle = 'rgba(70,40,15,0.2)'; g.fill();
  for (let k = 0; k < n; k++) {
    const z = k * wallH;
    poly(g, ring(k, z - wallH)); g.fillStyle = '#a58c64'; g.fill();   // the retaining wall, its face showing below the ring
    const top = ring(k, z), col = k === amar ? '#9b4252' : k === fallow ? '#b47a4c' : ['#7d9a42', '#6f9040', '#88a64c'][k % 3];
    g.save(); poly(g, ring(k, z - wallH)); g.clip();   // its courses of stone
    g.setLineDash([2.5, 2]); g.strokeStyle = alpha('#5a4630', 0.55); g.lineWidth = 0.8; poly(g, ring(k, z - wallH * 0.45)); g.stroke(); g.setLineDash([]);
    g.restore();
    poly(g, top); g.fillStyle = col; g.fill();
    g.save(); poly(g, top); g.clip();
    g.lineCap = 'round';
    for (let rr = R * (1 - k / n * 0.82) - 3; rr > R * (1 - (k + 1) / n * 0.82) - 4; rr -= 4) {   // the crop in rows along the contour
      const rowR = rr;
      for (let i = 0; i < Math.max(24, rowR * 1.2); i++) {
        const a = i / Math.max(24, rowR * 1.2) * TAU + q() * 0.05, w = 1 + 0.07 * Math.sin(3 * a + f1) + 0.025 * Math.sin(5 * a + f2), px = x + Math.cos(a) * rowR * w, py = y + Math.sin(a) * rowR * w * 0.7 - z * ZK;
        if (k === amar) { circ(g, px, py, 1.5); g.fillStyle = q() < 0.5 ? '#c8456a' : '#7e2a3a'; g.fill(); }
        else if (k === fallow) { if (q() < 0.3) { g.fillStyle = alpha('#6e3a1e', 0.45); g.fillRect(px, py, 2.2, 1); } }
        else { g.strokeStyle = q() < 0.5 ? '#b6d870' : '#4b7428'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(px - 1.4, py + 0.9); g.lineTo(px + 1.4, py - 0.9); g.stroke(); }
      }
    }
    g.restore();
    g.strokeStyle = alpha('#fff3d0', 0.45); g.lineWidth = 1; poly(g, top); g.stroke();   // the lip of the terrace catching the light
  }
  // a tree on the hilltop: a round crown lit from the top left, its shadow down the slope
  const zt = (n - 1) * wallH, tx = x, ty = y - zt * ZK, cr = R * 0.2, cz = 16;
  ell(g, tx + cz * SH[0] + 3, ty + cz * SH[1] + 3, cr, cr * 0.7); g.fillStyle = 'rgba(40,40,10,0.3)'; g.fill();
  g.strokeStyle = '#5a3a1e'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx, ty - cz * ZK); g.stroke();
  for (const [dx, dy, s, c] of [[0, 0, 1, '#3f6e2a'], [-0.25, -0.2, 0.75, '#5b8c36'], [-0.35, -0.35, 0.42, '#86b54e']]) { circ(g, tx + dx * cr, ty - cz * ZK + dy * cr, cr * s); g.fillStyle = c; g.fill(); }
  for (let k = 0; k < 6; k++) { circ(g, tx + (q() - 0.5) * cr * 1.4, ty - cz * ZK + (q() - 0.5) * cr * 1.2, 1.6); g.fillStyle = '#e86aa8'; g.fill(); }   // in flower
}
// a market (tianguis) on a swept plaza: two rows of stalls under striped cloth awnings, wares laid out on mats
function market(g, x, y, R, q) {
  const hw = R * 0.95, hh = R * 0.62;
  g.fillStyle = 'rgba(70,40,15,0.16)'; g.beginPath(); g.roundRect(x - hw + 3, y - hh + 4, hw * 2, hh * 2, 14); g.fill();
  g.fillStyle = '#e6cf9f'; g.beginPath(); g.roundRect(x - hw, y - hh, hw * 2, hh * 2, 14); g.fill();
  g.strokeStyle = alpha('#9c7c50', 0.35); g.lineWidth = 1.5; g.stroke();
  const cloths = [[RED, CREAM], [BLUE, '#f4f0e0'], [YEL, '#e8742a'], ['#2f9a6a', CREAM], ['#d6406a', '#ffe9c0'], ['#e8742a', YEL]];
  const wares = ['#e8452f', '#f2c12e', '#5aa33a', '#e8742a', '#7a3a8a', '#f4f0e0', '#c47a45'];
  const cols = 4, sw = hw * 2 / cols, stalls = [];
  for (const [ry, dir] of [[-hh * 0.48, 1], [hh * 0.5, -1]]) for (let c = 0; c < cols; c++) stalls.push([x - hw + sw * (c + 0.5), y + ry, dir]);
  for (const [sx, sy, dir] of stalls) {   // wares in front of each stall, toward the lane between the rows
    for (let k = 0; k < 3; k++) {
      const wx = sx - sw * 0.3 + k * sw * 0.3, wy = sy + dir * 15, wc = wares[q() * wares.length | 0];
      g.fillStyle = q() < 0.5 ? '#c9a46a' : '#b48a52'; g.fillRect(wx - 5, wy - 3.5, 10, 7);   // a petate (a woven mat)
      for (let j = 0; j < 5; j++) { circ(g, wx + (q() - 0.5) * 6, wy + (q() - 0.5) * 4, 1.5); g.fillStyle = wc; g.fill(); }
    }
  }
  stalls.sort((a, b) => a[1] - b[1]);
  for (const [sx, sy] of stalls) {
    const w = sw * 0.42, d = 10, z = 15, [c1, c2] = cloths[q() * cloths.length | 0];
    castShadow(g, rect(sx - w, sy - d, sx + w, sy + d), z, rect(sx - w, sy - d, sx + w, sy + d), 'rgba(60,30,10,0.22)');
    g.strokeStyle = '#5a3a1e'; g.lineWidth = 1.2; for (const px of [sx - w + 1, sx + w - 1]) { g.beginPath(); g.moveTo(px, sy + d); g.lineTo(px, sy + d - z * ZK); g.stroke(); }   // the front poles
    const top = lift(rect(sx - w, sy - d, sx + w, sy + d), z);
    poly(g, top); g.fillStyle = c1; g.fill();
    g.save(); poly(g, top); g.clip(); g.fillStyle = c2; for (let u = sx - w + 3; u < sx + w; u += 7) g.fillRect(u, sy - d - z * ZK, 3.5, d * 2);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(sx - w, sy - d - z * ZK, w * 2, d * 0.6); g.fillStyle = 'rgba(40,20,10,0.16)'; g.fillRect(sx - w, sy + d * 0.4 - z * ZK, w * 2, d * 0.6);
    g.restore();
    g.strokeStyle = alpha('#3a1a0a', 0.35); g.lineWidth = 0.8; poly(g, top); g.stroke();
    for (let u = sx - w; u < sx + w - 0.1; u += w / 3) { poly(g, [[u, sy + d - z * ZK], [u + w / 3, sy + d - z * ZK], [u + w / 6, sy + d - z * ZK + 3]]); g.fillStyle = c1; g.fill(); }   // a scalloped valance
  }
}
// a cenote: a round sinkhole in the limestone, a pool of clear turquoise water far down, the rock wall showing on its far
// (north) side, vines hanging into it, a wooden ladder down
function cenote(g, x, y, R, q) {
  const r = R * 0.62, deep = 16;
  circ(g, x + 2, y + 3, r * 1.32); g.fillStyle = 'rgba(70,40,15,0.18)'; g.fill();
  const rim = []; for (let k = 0; k < 18; k++) { const a = k / 18 * TAU, d = r * (1.2 + q() * 0.14); rim.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.92]); }
  poly(g, rim); g.fillStyle = '#d9cbaa'; g.fill(); g.strokeStyle = alpha('#9c8460', 0.6); g.lineWidth = 1.2; g.stroke();
  for (let k = 0; k < 16; k++) { const a = q() * TAU, d = r * (1.02 + q() * 0.15); ell(g, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.92, 2.5 + q() * 2.5, 1.8 + q() * 1.5); g.fillStyle = q() < 0.5 ? '#e8dcc0' : '#bfae88'; g.fill(); }
  g.save(); ell(g, x, y, r, r * 0.88); g.clip();
  g.fillStyle = linear(g, 0, y - r, 0, y + r * 0.4, [[0, '#7a6a52'], [1, '#4a3e30']]); g.fillRect(x - r, y - r, r * 2, r * 2);   // the far wall
  g.strokeStyle = alpha('#2a2018', 0.4); g.lineWidth = 1; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(x - r, y - r * 0.85 + k * 4); g.lineTo(x + r, y - r * 0.85 + k * 4 + (q() - 0.5) * 4); g.stroke(); }
  ell(g, x, y + deep * ZK, r * 0.98, r * 0.86); g.fillStyle = radial(g, x - r * 0.2, y + deep * ZK - r * 0.1, 1, x, y + deep * ZK, r, [[0, '#5fe0d0'], [0.55, '#21a8a8'], [1, '#0d5f6e']]); g.fill();
  ell(g, x - r * 0.25, y + deep * ZK - r * 0.35, r * 0.95, r * 0.7); g.fillStyle = 'rgba(10,30,40,0.28)'; g.fill();   // the rim's shadow across the water
  g.strokeStyle = alpha('#ffffff', 0.45); g.lineWidth = 1; for (let k = 0; k < 4; k++) { const a = q() * 1.2 + 0.2, rr2 = r * (0.3 + q() * 0.4); g.beginPath(); g.ellipse(x + r * 0.1, y + deep * ZK + r * 0.15, rr2, rr2 * 0.6, 0, a, a + 0.8); g.stroke(); }
  g.lineCap = 'round';
  for (let k = 0; k < 9; k++) {   // vines hanging down the far wall
    const vx = x - r * 0.75 + q() * r * 1.5, l = 8 + q() * 16; g.strokeStyle = q() < 0.5 ? '#3f7a2c' : '#5e9a3a'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(vx, y - r * 0.9); g.quadraticCurveTo(vx + 3, y - r * 0.9 + l / 2, vx - 1, y - r * 0.9 + l); g.stroke();
    for (let j = 0; j < 3; j++) { circ(g, vx + (q() - 0.5) * 3, y - r * 0.9 + q() * l, 1.4); g.fillStyle = '#6fae44'; g.fill(); }
  }
  g.restore();
  const lx = x + r * 0.45;   // the ladder, from the rim on the south side down to the water... seen from above, poking up out of it
  g.strokeStyle = '#6e4a26'; g.lineWidth = 1.5; for (const dx of [-3, 3]) { g.beginPath(); g.moveTo(lx + dx, y + r * 0.95); g.lineTo(lx + dx, y + r * 0.25); g.stroke(); }
  g.lineWidth = 1; for (let yy = y + r * 0.3; yy < y + r * 0.95; yy += 4) { g.beginPath(); g.moveTo(lx - 3, yy); g.lineTo(lx + 3, yy); g.stroke(); }
  for (let k = 0; k < 3; k++) { const a = -2.2 + k * 0.5, d = r * 1.32; agave(g, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.9, 7 + k, q); }
}
// a bird of prey soaring, wings spread, seen from above (also its shadow, in a flat colour)
function bird(g, x, y, s, a, flat) {
  g.save(); g.translate(x, y); g.rotate(a);
  const wing = sy => { g.beginPath(); g.moveTo(s * 0.15, 0); g.quadraticCurveTo(s * 0.25, sy * s * 0.5, -s * 0.05, sy * s * 1.15); g.lineTo(-s * 0.25, sy * s * 1.05); g.quadraticCurveTo(-s * 0.15, sy * s * 0.5, -s * 0.3, sy * s * 0.12); g.closePath(); };
  for (const sy of [-1, 1]) { wing(sy); g.fillStyle = flat || (sy < 0 ? '#6a4a2e' : '#4a3220'); g.fill(); }
  ell(g, -s * 0.05, 0, s * 0.42, s * 0.12); g.fillStyle = flat || '#5a3e26'; g.fill();
  poly(g, [[-s * 0.4, 0], [-s * 0.65, -s * 0.14], [-s * 0.65, s * 0.14]]); g.fill();
  if (!flat) { circ(g, s * 0.36, 0, s * 0.09); g.fillStyle = '#f2ead8'; g.fill(); for (const sy of [-1, 1]) { ell(g, -s * 0.12, sy * s * 1.08, s * 0.1, s * 0.05, 0.3 * sy); g.fillStyle = '#2a1a10'; g.fill(); } }
  g.restore();
}

// ------------------------------------------------------------------------------------------------ buildings
// A talud-tablero step pyramid centred at 0,0: half-size s at the foot, n tiers up to height Z. Each tier is a sloping
// talud (its west face in the sun, the east in shade, the south face toward us), the upright tablero panel on its south
// face (a moulded frame round a recessed panel, painted by P.panel), and the terrace on top. Returns the top platform.
function pyramid(g, s, n, Z, tf, P) {
  const d = s * (1 - tf) / n, zH = Z / n, ink = alpha('#2a0f06', 0.28);
  let h = s, z = 0, m = s;
  for (let k = 0; k < n; k++) {
    m = h - d * TAL; const z1 = z + zH * 0.58, z2 = z + zH;
    const A = (x, y, zz) => [x, y - zz * ZK];
    const faces = [
      [[A(-h, -h, z), A(h, -h, z), A(m, -m, z1), A(-m, -m, z1)], 0.22],
      [[A(-h, -h, z), A(-m, -m, z1), A(-m, m, z1), A(-h, h, z)], 0.14],
      [[A(h, -h, z), A(h, h, z), A(m, m, z1), A(m, -m, z1)], -0.3],
      [[A(-h, h, z), A(h, h, z), A(m, m, z1), A(-m, m, z1)], -0.06],
    ];
    for (const [q, l] of faces) { poly(g, q); const ys = q.map(p => p[1]); g.fillStyle = linear(g, 0, Math.min(...ys), 0, Math.max(...ys) + 0.5, [[0, shade(P.talud, l + 0.07)], [1, shade(P.talud, l - 0.07)]]); g.fill(); g.strokeStyle = ink; g.lineWidth = 0.7; g.stroke(); }
    // the talud's sloping faces get a little texture: courses of stone under the plaster
    g.strokeStyle = alpha('#2a0f06', 0.08); g.lineWidth = 0.6;
    for (let f = 0.33; f < 1; f += 0.33) { const hh = h + (m - h) * f, zz = z + (z1 - z) * f; poly(g, [A(-hh, hh, zz), A(hh, hh, zz)], false); g.stroke(); poly(g, [A(-hh, -hh, zz), A(-hh, hh, zz)], false); g.stroke(); poly(g, [A(hh, -hh, zz), A(hh, hh, zz)], false); g.stroke(); }
    const yb = m - z1 * ZK, yt = m - z2 * ZK, fh = Math.max(1, (yb - yt) * 0.2);
    g.fillStyle = P.tablero; g.fillRect(-m, yt, m * 2, yb - yt);   // the tablero: frame, recessed panel, a lit cornice
    g.fillStyle = shade(P.tablero, -0.28); g.fillRect(-m + fh * 1.6, yt + fh, m * 2 - fh * 3.2, yb - yt - fh * 2);
    if (P.panel) P.panel(g, -m + fh * 1.6, yt + fh, m - fh * 1.6, yb - fh, k);
    g.fillStyle = alpha('#2a0f06', 0.3); g.fillRect(-m, yb - 0.8, m * 2, 0.8);
    poly(g, lift(rect(-m, -m, m, m), z2)); g.fillStyle = P.terrace; g.fill(); g.strokeStyle = ink; g.lineWidth = 0.7; g.stroke();
    g.fillStyle = alpha('#ffffff', 0.35); g.fillRect(-m, yt - 1, m * 2, 1);   // the terrace's front edge catches the light
    h = m - d * (1 - TAL); z = z2;
  }
  // the light over the whole mass: warmer and brighter toward the top left, deeper toward the bottom right
  g.save(); poly(g, hull([...rect(-s, -s, s, s), ...lift(rect(-m, -m, m, m), z)])); g.clip();
  g.fillStyle = linear(g, -s, -s - z * ZK, s, s, [[0, 'rgba(255,246,220,0.2)'], [0.5, 'rgba(255,240,210,0)'], [1, 'rgba(40,12,4,0.16)']]); g.fillRect(-s, -s - z * ZK, s * 2, s * 2 + z * ZK);
  g.restore();
  return { t: m, Z: z };
}
// the great stair up the south face, from the foot (y0, on the ground) to the top platform's edge (y1, Z up), between two
// balustrades; P.rail paints them (plain plaster, or the feathered serpent)
function stair(g, w, b, y0, y1, Z, P) {
  const ya = y1 - Z * ZK, yb = y0;
  g.fillStyle = 'rgba(40,15,5,0.28)'; poly(g, [[w + b, ya], [w + b + 7, ya + 6], [w + b + 7, yb + 2], [w + b, yb]]); g.fill();   // its shadow on the face, to the right
  g.fillStyle = P.riser || '#cdb894'; g.fillRect(-w, ya, w * 2, yb - ya);
  const n = Math.max(4, Math.round((yb - ya) / 3.2)), sp = (yb - ya) / n;
  for (let k = 0; k < n; k++) { const yy = ya + k * sp; g.fillStyle = P.tread || '#f4e9cf'; g.fillRect(-w, yy, w * 2, sp * 0.45); g.fillStyle = 'rgba(60,30,10,0.18)'; g.fillRect(-w, yy + sp * 0.45, w * 2, 0.6); }
  g.fillStyle = linear(g, 0, ya, 0, yb, [[0, 'rgba(255,255,255,0.12)'], [1, 'rgba(60,30,10,0.1)']]); g.fillRect(-w, ya, w * 2, yb - ya);
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -w - b : w;
    if (P.rail) P.rail(g, x0, ya, b, yb - ya, sx); else { g.fillStyle = sx < 0 ? '#f1e4c6' : '#c9b18a'; g.fillRect(x0, ya, b, yb - ya); }
    g.strokeStyle = alpha('#2a0f06', 0.3); g.lineWidth = 0.7; g.strokeRect(x0, ya, b, yb - ya);
  }
}
// a temple on a platform z0 up: plastered walls with a doorway and a painted frieze toward us, under a flat roof (top),
// optional roof comb. Footprint x -w..w, y -d0..d1.
function shrine(g, w, d0, d1, z0, zw, roof, frieze, merlon) {
  castShadow(g, lift(rect(-w, -d0, w, d1), z0), zw, lift(rect(-w, -d0, w, d1), z0), 'rgba(40,15,5,0.3)');
  const yb = d1 - z0 * ZK, yt = d1 - (z0 + zw) * ZK;
  g.fillStyle = linear(g, 0, yt, 0, yb, [[0, '#fbf3e0'], [1, '#e3d3b0']]); g.fillRect(-w, yt, w * 2, yb - yt);
  const fz = (yb - yt) * 0.28;
  for (let k = 0, n = Math.max(4, Math.round(w / 3)); k < n; k++) { g.fillStyle = frieze[k % frieze.length]; g.fillRect(-w + k * w * 2 / n, yt, w * 2 / n + 0.3, fz); }
  g.fillStyle = alpha('#2a0f06', 0.25); g.fillRect(-w, yt + fz, w * 2, 0.8);
  // three doorways, the middle one widest, between square pillars
  for (const [cx, dw] of [[0, w * 0.22], [-w * 0.58, w * 0.12], [w * 0.58, w * 0.12]]) { g.fillStyle = '#2e1a12'; g.fillRect(cx - dw, yt + fz + 1.5, dw * 2, yb - yt - fz - 1.5); g.fillStyle = 'rgba(255,190,90,0.18)'; g.fillRect(cx - dw, yb - 2, dw * 2, 2); }
  poly(g, lift(rect(-w - 2, -d0 - 2, w + 2, d1 + 2), z0 + zw)); g.fillStyle = roof; g.fill(); g.strokeStyle = alpha('#2a0f06', 0.35); g.lineWidth = 0.8; g.stroke();   // the roof slab overhanging a little
  g.fillStyle = shade(roof.startsWith('#') ? roof : '#9a3a24', -0.25); g.fillRect(-w - 2, d1 + 2 - (z0 + zw) * ZK, w * 2 + 4, 2);
  g.fillStyle = alpha('#ffffff', 0.25); g.fillRect(-w - 2, -d0 - 2 - (z0 + zw) * ZK, w * 2 + 4, 1);
  if (merlon) {   // a row of stepped merlons along the roof's front edge, against the sky
    const yr = d1 + 2 - (z0 + zw) * ZK, n = Math.max(3, Math.round((w * 2 + 4) / 6.5)), sp = (w * 2 + 4) / n;
    for (let k = 0; k < n; k++) { const mx = -w - 2 + (k + 0.5) * sp; poly(g, [[mx - 2.4, yr], [mx - 2.4, yr - 3], [mx - 1.2, yr - 3], [mx - 1.2, yr - 5.5], [mx + 1.2, yr - 5.5], [mx + 1.2, yr - 3], [mx + 2.4, yr - 3], [mx + 2.4, yr]]); g.fillStyle = merlon; g.fill(); g.strokeStyle = alpha('#2a0f06', 0.35); g.lineWidth = 0.6; g.stroke(); }
  }
  return z0 + zw;
}
// a banner pole: a striped paper banner (pantli) flying from the top, its pole and shadow
function banner(g, x, y, h, c1, c2) {
  g.strokeStyle = 'rgba(60,30,10,0.25)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + h * SH[0], y + h * SH[1]); g.stroke();
  ell(g, x + h * SH[0] + 5, y + h * SH[1] + 2, 6, 3); g.fillStyle = 'rgba(60,30,10,0.2)'; g.fill();
  ell(g, x, y, 3, 1.8); g.fillStyle = '#8a7a62'; g.fill();
  g.strokeStyle = '#5a3a1e'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h * ZK); g.stroke();
  const tx = x, ty = y - h * ZK + 1, fw = 11, fh = 13;
  g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx + fw * 0.5, ty - 2, tx + fw, ty + 1); g.lineTo(tx + fw, ty + fh + 1); g.quadraticCurveTo(tx + fw * 0.5, ty + fh - 2, tx, ty + fh); g.closePath();
  g.fillStyle = c1; g.fill();
  g.save(); g.clip(); g.fillStyle = c2; for (let k = 1; k < 4; k += 2) g.fillRect(tx, ty + k * fh / 4 - 1, fw, fh / 4); g.restore();
  g.strokeStyle = alpha('#2a0f06', 0.4); g.lineWidth = 0.7; g.stroke();
  circ(g, x, y - h * ZK - 1.5, 2); g.fillStyle = YEL; g.fill();
}
// a carved serpent head seen from above, pointing along a, with a collar of feathers behind it: painted in Pyth's blue,
// yellow belly showing at the jaw (look 0), or the other way round (look 1)
export function serpentHead(g, x, y, k, a, look = 0) {
  const body = look ? YEL : BLUE, lt = look ? '#ffe68a' : BLUE_LT, dk = look ? YEL_DK : BLUE_DK, jaw = look ? BLUE : YEL;
  g.save(); g.translate(x, y); g.rotate(a);
  ell(g, k * 0.15, k * 0.25, k * 0.95, k * 0.7); g.fillStyle = SHADOW; g.fill();
  for (let j = 0; j < 9; j++) {   // the feather collar, fanned round the back of the head
    const fa = Math.PI * 0.55 + j / 8 * Math.PI * 0.9;
    ell(g, Math.cos(fa) * k * 0.55 - k * 0.15, Math.sin(fa) * k * 0.55, k * 0.32, k * 0.13, fa);
    g.fillStyle = j % 2 ? '#2f9a6a' : jaw; g.fill(); g.strokeStyle = alpha(INK, 0.5); g.lineWidth = 0.8; g.stroke();
  }
  g.beginPath(); g.moveTo(-k * 0.35, -k * 0.38); g.quadraticCurveTo(k * 0.55, -k * 0.42, k * 0.85, -k * 0.12); g.quadraticCurveTo(k * 0.95, 0, k * 0.85, k * 0.12); g.quadraticCurveTo(k * 0.55, k * 0.42, -k * 0.35, k * 0.38); g.closePath();
  g.fillStyle = radial(g, -k * 0.05, -k * 0.2, 1, k * 0.2, 0, k * 0.8, [[0, lt], [0.6, body], [1, dk]]); g.fill(); g.strokeStyle = INK; g.lineWidth = Math.max(0.8, k * 0.06); g.stroke();
  g.beginPath(); g.moveTo(k * 0.15, k * 0.3); g.quadraticCurveTo(k * 0.6, k * 0.3, k * 0.82, k * 0.12); g.lineTo(k * 0.15, k * 0.18); g.closePath(); g.fillStyle = jaw; g.fill();   // the jaw's edge
  for (const sy of [-1, 1]) {   // brow ridges and eyes, nostrils at the snout
    ell(g, k * 0.1, sy * k * 0.24, k * 0.17, k * 0.12); g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = INK; g.lineWidth = Math.max(0.7, k * 0.04); g.stroke();
    circ(g, k * 0.14, sy * k * 0.24, k * 0.07); g.fillStyle = INK; g.fill();
    circ(g, k * 0.72, sy * k * 0.07, k * 0.04); g.fillStyle = INK; g.fill();
  }
  g.restore();
}
// pilgrims on a plaza, tiny from up here: a shadow, a body in white, red, ochre or blue cotton, a head; some in pairs
function pilgrims(g, cx, cy, hw, hh, n, seed) {
  const rng = mulberry(Math.floor(Math.abs(seed)) + 77), cols = ['#f6f1e4', '#f6f1e4', '#c8452c', '#e0a040', '#3776ab', '#2f9a8a'];
  for (let k = 0; k < n; k++) {
    const x = cx + (rng() - 0.5) * 2 * hw, y = cy + (rng() - 0.5) * 2 * hh, c = cols[Math.floor(rng() * cols.length)];
    for (const dx of rng() < 0.3 ? [-3.2, 3.2] : [0]) {
      ell(g, x + dx + 2.2, y + 2.6, 3, 1.5); g.fillStyle = 'rgba(60,30,10,0.28)'; g.fill();
      g.fillStyle = c; g.beginPath(); g.roundRect(x + dx - 1.9, y - 5, 3.8, 5.2, 1.6); g.fill(); g.strokeStyle = alpha('#2a0f06', 0.45); g.lineWidth = 0.5; g.stroke();
      circ(g, x + dx, y - 6.4, 1.5); g.fillStyle = '#6b4128'; g.fill();
    }
  }
}
// a plaza: a low platform of plaster with a step down on its south side, a painted border, faint joints in the stucco
function plaza(g, x, y, hw, hh, floor = ['#efe2c2', '#ddc9a0'], border = RED) {
  const z = 7;
  castShadow(g, rect(x - hw, y - hh, x + hw, y + hh + z * ZK), z * 0.6);
  g.fillStyle = shade(PLASTER, -0.22); g.fillRect(x - hw, y + hh, hw * 2, z * ZK);
  g.fillStyle = shade(PLASTER, -0.1); for (let u = x - hw + 12; u < x + hw; u += 12) g.fillRect(u, y + hh, 0.8, z * ZK);
  g.fillStyle = linear(g, x - hw, y - hh, x + hw, y + hh, [[0, floor[0]], [1, floor[1]]]); g.fillRect(x - hw, y - hh, hw * 2, hh * 2);
  g.strokeStyle = alpha('#9c8460', 0.16); g.lineWidth = 1;
  for (let u = x - hw + 32; u < x + hw; u += 32) { g.beginPath(); g.moveTo(u, y - hh); g.lineTo(u, y + hh); g.stroke(); }
  for (let u = y - hh + 32; u < y + hh; u += 32) { g.beginPath(); g.moveTo(x - hw, u); g.lineTo(x + hw, u); g.stroke(); }
  g.strokeStyle = alpha(border, 0.75); g.lineWidth = 3; g.strokeRect(x - hw + 6, y - hh + 6, hw * 2 - 12, hh * 2 - 12);
  g.strokeStyle = alpha('#fff8e8', 0.7); g.lineWidth = 1; g.beginPath(); g.moveTo(x - hw, y + hh); g.lineTo(x - hw, y - hh); g.lineTo(x + hw, y - hh); g.stroke();
  for (let k = 0; k < 2; k++) { g.fillStyle = k ? '#e9dbb8' : '#d6c398'; g.fillRect(x - 24 + k * 3, y + hh + k * z * ZK * 0.5, 48 - k * 6, z * ZK * 0.5); }   // steps down in the middle of the south side
}
function rock(g, x, y, r, base, rng) {
  const pts = []; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + rng() * 0.4, d = r * (0.7 + rng() * 0.3); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85]); }
  poly(g, pts.map(([px, py]) => [px + r * 0.25, py + r * 0.3])); g.fillStyle = SHADOW; g.fill();
  poly(g, pts); g.fillStyle = shade(base, -0.25); g.fill();
  poly(g, pts.map(([px, py]) => [x + (px - x) * 0.82 - r * 0.08, y + (py - y) * 0.78 - r * 0.1])); g.fillStyle = base; g.fill();
  poly(g, [[x - r * 0.1, y - r * 0.12], ...pts.slice(4, 7).map(([px, py]) => [x + (px - x) * 0.7 - r * 0.1, y + (py - y) * 0.66 - r * 0.12])]); g.fillStyle = shade(base, 0.2); g.fill();
}
// an agave from above: a rosette of long blue-green leaves with pale margins and dark spines at the tips
function agave(g, x, y, r, rng) {
  const n = 15, a0 = rng() * TAU;
  for (let ring = 0; ring < 2; ring++) for (let k = 0; k < n; k++) {
    const a = a0 + (k + ring * 0.5) / n * TAU + (rng() - 0.5) * 0.2, l = r * (ring ? 0.62 : 1) * (0.85 + rng() * 0.25), w = r * (ring ? 0.13 : 0.16);
    const lit = Math.cos(a + Math.PI * 0.75), ca = Math.cos(a), sa = Math.sin(a);
    poly(g, [[x - sa * w, y + ca * w], [x + ca * l, y + sa * l], [x + sa * w, y - ca * w]]);
    g.fillStyle = lit > 0.3 ? '#9cc3b2' : lit > -0.3 ? '#6f9d8f' : '#4b766b'; g.fill();
    g.strokeStyle = alpha('#f2e7a8', 0.55); g.lineWidth = 0.8; g.stroke();
    if (r > 12) { circ(g, x + ca * l, y + sa * l, 0.9); g.fillStyle = '#3a2a1a'; g.fill(); }
  }
  circ(g, x, y, r * 0.12); g.fillStyle = '#c4dccd'; g.fill();
}
// a prickly pear: flat pads on pads, spines in dots, red fruit on the top edges
function nopal(g, x, y, r, rng) {
  const pads = [[0, 0, 0.36, 0], [-0.32, -0.3, 0.3, -0.7], [0.34, -0.26, 0.28, 0.6], [0.05, -0.6, 0.24, 0.1], [-0.55, 0.2, 0.24, -1.4], [0.5, 0.3, 0.22, 1.3]];
  for (const [dx, dy, s, a] of pads) {
    const px = x + dx * r, py = y + dy * r;
    ell(g, px + r * 0.12, py + r * 0.16, s * r, s * r * 0.7, a); g.fillStyle = SHADOW; g.fill();
    ell(g, px, py, s * r, s * r * 0.7, a); g.fillStyle = radial(g, px - s * r * 0.4, py - s * r * 0.4, 1, px, py, s * r, [[0, '#a6c96a'], [0.6, '#6f9a45'], [1, '#4c7330']]); g.fill();
    g.strokeStyle = '#3f6128'; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#f3efd0'; for (let k = 0; k < 6; k++) { const q = rng() * TAU, d = rng() * s * r * 0.7; g.fillRect(px + Math.cos(q) * d, py + Math.sin(q) * d * 0.7, 1.2, 1.2); }
  }
  for (const [dx, dy] of [[0.05, -0.86], [-0.5, -0.55], [0.52, -0.5]]) { ell(g, x + dx * r, y + dy * r, r * 0.08, r * 0.1); g.fillStyle = '#d6336c'; g.fill(); circ(g, x + dx * r - 1, y + dy * r - 1.5, r * 0.03); g.fillStyle = '#ff8fb3'; g.fill(); }
}
// an organ-pipe cactus: a clump of tall ribbed columns standing up out of the grass, white flowers on a few tips
function organCactus(g, x, y, r, rng, shadowPass) {
  const cols = []; for (let k = 0; k < 7; k++) { const a = rng() * TAU, d = rng() * r * 0.45; cols.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, r * (0.9 + rng() * 1.1), 2.6 + rng() * 1.4, rng()]); }
  if (shadowPass) { g.lineCap = 'round'; g.strokeStyle = SHADOW; for (const [cx, cy, h, w] of cols) { g.lineWidth = w * 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + h * SH[0], cy + h * SH[1]); g.stroke(); } return; }
  cols.sort((a, b) => a[1] - b[1]);
  for (const [cx, cy, h, w, f] of cols) {
    const top = cy - h * ZK;
    g.fillStyle = linear(g, cx - w, 0, cx + w, 0, [[0, '#8fc070'], [0.45, '#5b9444'], [1, '#2f5a2a']]);
    g.beginPath(); g.moveTo(cx - w, cy); g.lineTo(cx - w, top); g.arc(cx, top, w, Math.PI, 0); g.lineTo(cx + w, cy); g.closePath(); g.fill();
    g.strokeStyle = alpha('#1f3a1a', 0.45); g.lineWidth = 0.6; for (const dx of [-w * 0.35, w * 0.35]) { g.beginPath(); g.moveTo(cx + dx, top); g.lineTo(cx + dx, cy); g.stroke(); }
    ell(g, cx - w * 0.15, top - w * 0.2, w * 0.6, w * 0.45); g.fillStyle = '#a8d488'; g.fill();
    if (f < 0.35) { circ(g, cx, top - w * 0.6, 1.6); g.fillStyle = '#fff6f0'; g.fill(); circ(g, cx, top - w * 0.6, 0.6); g.fillStyle = YEL; g.fill(); }
  }
}
// a stela: a tall carved slab with a ruler in a feather headdress and columns of glyphs on its face (toward us), traces of
// red paint, a round altar stone in front of it
function stela(g, x, y, r, shadowPass) {
  const w = r * 0.32, d = r * 0.12, h = r * 1.5;
  if (shadowPass) { castShadow(g, rect(x - w, y - d, x + w, y + d), h); circ(g, x + 2, y + r * 0.45 + 2, r * 0.3); g.fillStyle = SHADOW; g.fill(); return; }
  box(g, x - w, y - d, x + w, y + d, 0, h, '#d8c8a4', '#bba57c', 0.35);
  const yt = y + d - h * ZK, yb = y + d;
  g.save(); g.beginPath(); g.rect(x - w, yt, w * 2, yb - yt); g.clip();
  g.fillStyle = linear(g, x - w, 0, x + w, 0, [[0, 'rgba(255,255,255,0.18)'], [1, 'rgba(60,30,10,0.12)']]); g.fillRect(x - w, yt, w * 2, yb - yt);
  const ink = alpha('#5e4628', 0.75), cx = x, H = yb - yt;
  g.strokeStyle = ink; g.lineWidth = 0.8;
  g.beginPath(); for (let k = 0; k < 5; k++) { const a = Math.PI + k / 4 * Math.PI; g.moveTo(cx + Math.cos(a) * w * 0.3, yt + H * 0.22 + Math.sin(a) * w * 0.3); g.lineTo(cx + Math.cos(a) * w * 0.75, yt + H * 0.22 + Math.sin(a) * w * 0.75); } g.stroke();   // the headdress
  circ(g, cx, yt + H * 0.24, w * 0.24); g.stroke();   // the face
  g.strokeRect(cx - w * 0.3, yt + H * 0.34, w * 0.6, H * 0.3);   // the body
  for (let k = 0; k < 3; k++) { g.strokeRect(x - w * 0.8, yt + H * (0.68 + k * 0.1), w * 0.7, H * 0.08); g.strokeRect(x + w * 0.1, yt + H * (0.68 + k * 0.1), w * 0.7, H * 0.08); }   // glyph blocks
  g.fillStyle = alpha(RED, 0.3); g.fillRect(x - w, yt + H * 0.3, w * 2, H * 0.08);
  g.restore();
  g.strokeStyle = alpha('#3a2a10', 0.4); g.lineWidth = 0.8; g.strokeRect(x - w, yt, w * 2, yb - yt);
  const ay = y + r * 0.45;   // the altar stone: a drum, its top carved with a ring
  g.fillStyle = '#a8946e'; g.fillRect(x - r * 0.28, ay - 4 * ZK, r * 0.56, 4 * ZK); ell(g, x, ay, r * 0.28, r * 0.12); g.fill();
  ell(g, x, ay - 4 * ZK, r * 0.28, r * 0.12); g.fillStyle = '#d8c8a4'; g.fill(); ell(g, x, ay - 4 * ZK, r * 0.16, r * 0.06); g.strokeStyle = ink; g.stroke();
}

// a copal brazier: a stone drum on a step, a bowl of embers, a curl of white incense smoke drifting off
function brazier(g, x, y, r, shadowPass) {
  const s = r * 0.42, h = r * 0.55;
  if (shadowPass) { castShadow(g, rect(x - s, y - s * 0.5, x + s, y + s * 0.5), h); return; }
  box(g, x - s * 1.25, y - s * 0.7, x + s * 1.25, y + s * 0.7, 0, 3, '#cdb88f', '#a8916a', 0.3);
  const yb = y + s * 0.5 - 3 * ZK, yt = yb - h * ZK;
  g.fillStyle = linear(g, x - s, 0, x + s, 0, [[0, '#c4ad86'], [0.45, '#a8916a'], [1, '#6e5a42']]); g.fillRect(x - s, yt, s * 2, yb - yt); ell(g, x, yb, s, s * 0.45); g.fill();
  g.strokeStyle = alpha(RED, 0.7); g.lineWidth = 1.6; g.beginPath(); g.moveTo(x - s, yt + (yb - yt) * 0.4); g.lineTo(x + s, yt + (yb - yt) * 0.4); g.stroke();
  ell(g, x, yt, s * 1.15, s * 0.55); g.fillStyle = '#8a765c'; g.fill(); ell(g, x, yt, s * 0.9, s * 0.4); g.fillStyle = radial(g, x, yt, 0, x, yt, s * 0.9, [[0, '#fff2a8'], [0.4, '#ffb238'], [1, '#c4401c']]); g.fill();
  for (let k = 0; k < 4; k++) { ell(g, x + r * (0.2 + k * 0.28), yt - r * (0.3 + k * 0.14), r * (0.18 + k * 0.07), r * (0.12 + k * 0.04), 0.6); g.fillStyle = `rgba(250,248,240,${0.5 - k * 0.1})`; g.fill(); }
}

// ------------------------------------------------------------------------------------------------ props
export function plateauProp(g, d, shadowPass) {
  const { x, y, r, v } = d, rng = mulberry(Math.floor(v * 1e6) + 13);
  const t = [0.17, 0.28, 0.37, 0.44, 0.52, 0.6, 0.67, 0.75, 0.88, 1].findIndex(e => v < e);
  if (t === 0) { if (shadowPass) { ell(g, x + r * 0.4, y + r * 0.45, r * 1.05, r * 0.8); g.fillStyle = SHADOW; g.fill(); return; } agave(g, x, y, r * 1.15, rng); return; }
  if (t === 1) { if (shadowPass) return; nopal(g, x, y, r * 1.35, rng); return; }
  if (t === 2) { organCactus(g, x, y, r, rng, shadowPass); return; }
  if (t === 3) {   // a clump of tall dry grass round a flowering shrub
    if (shadowPass) { ell(g, x + r * 0.3, y + r * 0.35, r * 0.85, r * 0.6); g.fillStyle = SHADOW; g.fill(); return; }
    g.lineCap = 'round';
    for (let k = 0; k < 40; k++) { const a = rng() * TAU, l = r * (0.4 + rng() * 0.6); g.strokeStyle = Math.cos(a + 2.4) > 0 ? '#f3dd92' : rng() < 0.5 ? '#b59645' : '#cdb064'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.85); g.stroke(); }
    for (let k = 0; k < 9; k++) { circ(g, x + (rng() - 0.5) * r * 0.9, y + (rng() - 0.5) * r * 0.7, 2); g.fillStyle = rng() < 0.5 ? '#f08a24' : '#ffe14d'; g.fill(); }
    return;
  }
  if (t === 4) {   // a carved serpent head on a stone plinth, looking out across the land
    const s = r * 0.5, z = r * 0.45;
    if (shadowPass) { castShadow(g, rect(x - s, y - s, x + s, y + s), z + r * 0.3); return; }
    box(g, x - s, y - s, x + s, y + s, 0, z, '#dccaa2', '#b39a70', 0.35);
    g.strokeStyle = alpha('#6e5530', 0.4); g.lineWidth = 0.8; g.strokeRect(x - s + 2, y + s - z * ZK + 2, s * 2 - 4, z * ZK - 4);   // a carved panel on its face
    serpentHead(g, x, y - z * ZK, r * 0.62, [0, Math.PI / 2, Math.PI][Math.round(v * 40) % 3], v * 97 % 1 < 0.5 ? 0 : 1);
    return;
  }
  if (t === 5) {   // a little shrine: a two-tier platform with a stair up its south face and copal smoking on top
    const s = r * 0.9, Z = s * 0.6;
    if (shadowPass) { castShadow(g, rect(x - s, y - s, x + s, y + s), Z, rect(x - s * 0.45, y - s * 0.45, x + s * 0.45, y + s * 0.45)); return; }
    g.save(); g.translate(x, y);
    const P = pyramid(g, s, 2, Z, 0.45, { talud: RED, tablero: '#a83f2a', terrace: CREAM });
    stair(g, s * 0.16, s * 0.07, s + 1, P.t, P.Z, {});
    const cy = -P.Z * ZK;
    circ(g, 0, cy, P.t * 0.42); g.fillStyle = '#6e5a46'; g.fill(); circ(g, 0, cy, P.t * 0.3); g.fillStyle = radial(g, 0, cy, 0, 0, cy, P.t * 0.3, [[0, '#fff2a8'], [0.5, '#ff9a2a'], [1, '#a8401a']]); g.fill();
    for (let k = 0; k < 3; k++) { ell(g, s * (0.15 + k * 0.22), cy - s * (0.2 + k * 0.12), s * (0.16 + k * 0.05), s * (0.1 + k * 0.03), 0.5); g.fillStyle = `rgba(250,248,240,${0.45 - k * 0.12})`; g.fill(); }
    g.restore(); return;
  }
  if (t === 6) { brazier(g, x, y, r, shadowPass); return; }
  if (t === 7) { stela(g, x, y, r, shadowPass); return; }
  if (t === 8) {   // a house, with a cooking fire by its door
    const w = r * 0.62, dd = r * 0.42, q = mulberry(Math.floor(v * 1e6) + 5);
    if (shadowPass) { house(g, x, y - dd * 0.3, w, dd, q, true); return; }
    hearth(g, x + w * 0.9, y + dd * 1.4);
    house(g, x, y - dd * 0.3, w, dd, q, false);
    return;
  }
  if (shadowPass) return;   // weathered rocks
  rock(g, x, y, r * 0.75, '#c49a6c', rng); rock(g, x + r * 0.65, y + r * 0.35, r * 0.38, '#b0855a', rng);
}

// ------------------------------------------------------------------------------------------------ the grand pyramids
// A great stepped pyramid in the same oblique view as everything else (heights straight up the screen, ZK): each tier a
// sloped stone frustum whose west face catches the sun, its south face toward us in half light and its east face in
// shade, built of coursed blocks with weathering, a painted plaster band on its front, a ledge on top with grass in the
// cracks. The great stair climbs the south face as real steps (lit treads, shadowed risers) between two balustrades;
// a temple stands on top (walls with depth, a glowing doorway, a stone roof with a roof comb or a thatched one).
// Centred on 0,0 at ground level. Returns where things are (local, on screen) for the lights (art/phoenix.js).
const PDY = 0.6;   // the pyramids' plan depth on screen: seen three-quarters from the south, a square footprint is drawn this deep
function grandPyramid(g, o) {
  const { s, n, Z, tf, C } = o, rng = mulberry(o.seed), step = s * (1 - tf) / n, zH = Z / n, ledge = step * 0.3;
  const A = (x, y, z) => [x, y * PDY - z * ZK], geo = { lips: [], glyphs: [], braziers: [] }, R = (x0, y0, x1, y1) => rect(x0, y0 * PDY, x1, y1 * PDY);
  const quad = (pts, fill) => { poly(g, pts); g.fillStyle = fill; g.fill(); };
  const mixPt = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  // the drop shadow, down and to the right over the plaza
  castShadow(g, R(-s, -s, s, s), Z, R(-s * tf, -s * tf, s * tf, s * tf), 'rgba(70,35,12,0.32)');
  // the tiers' sizes first (base and top half-size, heights): the sides are drawn as one plane each, the tiers' fronts over them
  const tiers = []; { let hb = s, z0 = 0; for (let k = 0; k < n; k++) { const ht = hb - (step - ledge), z1 = z0 + zH; tiers.push({ hb, ht, z0, z1 }); hb = ht - ledge; z0 = z1; } }
  const tTop = tiers[n - 1].ht;
  // coursed blocks on a face F (quad: bottom-left, bottom-right, top-right, top-left): courses, staggered joints, weathered stones
  const courses = (F, al, nc) => {
    g.lineWidth = 0.7;
    for (let q = 1; q < nc; q++) { const f = q / nc, a = mixPt(F[0], F[3], f), b = mixPt(F[1], F[2], f); g.strokeStyle = `rgba(70,35,12,${al})`; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    for (let q = 0; q < nc; q++) {
      const fa = q / nc, fb = (q + 1) / nc, l0 = mixPt(F[0], F[3], fa), r0 = mixPt(F[1], F[2], fa), l1 = mixPt(F[0], F[3], fb), r1 = mixPt(F[1], F[2], fb);
      const len = Math.hypot(r0[0] - l0[0], r0[1] - l0[1]), nj = Math.max(1, Math.round(len / 11));
      for (let j = 0; j < nj; j++) {
        const f = (j + (q % 2 ? 0.5 : 0)) / nj; if (f <= 0.02 || f >= 0.98) continue;
        const a = mixPt(l0, r0, f), b = mixPt(l1, r1, f); g.strokeStyle = `rgba(70,35,12,${al * 0.8})`; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
        if (rng() < 0.12) { const c = mixPt(mixPt(l0, r0, f), mixPt(l1, r1, Math.min(1, f + 0.5 / nj)), 0.5); g.fillStyle = `rgba(80,45,20,${0.08 + rng() * 0.08})`; g.fillRect(c[0] - 4, c[1] - 1.5, 8, 3); }
      }
    }
  };
  // the two sides, each one continuous sloped plane from the foot to the top: the west in the sun, the east in shade, with
  // a soft gradient and faint coursing; the steps are thin lines across them (below)
  const WS = [A(-s, -s, 0), A(-s, s, 0), A(-tTop, tTop, Z), A(-tTop, -tTop, Z)], ES = [A(s, -s, 0), A(s, s, 0), A(tTop, tTop, Z), A(tTop, -tTop, Z)];
  quad(WS, linear(g, WS[1][0], WS[1][1], WS[3][0], WS[3][1], [[0, shade(C.lit, -0.06)], [1, shade(C.lit, 0.1)]]));
  quad(ES, linear(g, ES[1][0], ES[1][1], ES[3][0], ES[3][1], [[0, shade(C.shade, -0.12)], [1, shade(C.shade, 0.04)]]));
  courses([WS[1], WS[0], WS[3], WS[2]], 0.07, n * 3); courses([ES[0], ES[1], ES[2], ES[3]], 0.09, n * 3);
  for (const [k, T1] of tiers.entries()) if (k < n - 1) {   // the step lines: where each tier's ledge meets the side, a lit line with a soft shadow under it
    const f = T1.z1 / Z, wa = mixPt(WS[0], WS[3], f), wb = mixPt(WS[1], WS[2], f), ea = mixPt(ES[0], ES[3], f), eb = mixPt(ES[1], ES[2], f);
    g.lineWidth = 2; g.strokeStyle = 'rgba(70,35,12,0.14)'; g.beginPath(); g.moveTo(wa[0], wa[1] + 1.5); g.lineTo(wb[0], wb[1] + 1.5); g.moveTo(ea[0], ea[1] + 1.5); g.lineTo(eb[0], eb[1] + 1.5); g.stroke();
    g.lineWidth = 1; g.strokeStyle = 'rgba(255,248,228,0.6)'; g.beginPath(); g.moveTo(wa[0], wa[1]); g.lineTo(wb[0], wb[1]); g.stroke();
    g.strokeStyle = 'rgba(255,240,215,0.28)'; g.beginPath(); g.moveTo(ea[0], ea[1]); g.lineTo(eb[0], eb[1]); g.stroke();
  }
  g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,248,230,0.6)'; g.beginPath(); g.moveTo(...WS[1]); g.lineTo(...WS[2]); g.stroke();   // the sunlit corner
  g.strokeStyle = 'rgba(60,28,10,0.45)'; g.beginPath(); g.moveTo(...ES[1]); g.lineTo(...ES[2]); g.stroke();                       // the shaded one
  for (let k = 0; k < n; k++) {
    const { hb, ht, z0, z1 } = tiers[k];
    const S = [A(-hb, hb, z0), A(hb, hb, z0), A(ht, ht, z1), A(-ht, ht, z1)];
    quad(S, linear(g, 0, S[0][1], 0, S[2][1], [[0, shade(C.front, -0.1)], [1, shade(C.front, 0.06)]]));
    courses(S, 0.16, Math.max(3, Math.round(zH / 4.2)));
    // the painted band across the front (plaster over the stone), worn at the corners, with its motifs
    if (C.band) {
      const f0 = 0.5, f1 = 0.82, a0 = mixPt(S[0], S[3], f0), b0 = mixPt(S[1], S[2], f0), a1 = mixPt(S[0], S[3], f1), b1 = mixPt(S[1], S[2], f1), inset = (b0[0] - a0[0]) * 0.03;
      const B = [[a0[0] + inset, a0[1]], [b0[0] - inset, b0[1]], [b1[0] - inset, b1[1]], [a1[0] + inset, a1[1]]];
      quad(B, C.band); g.strokeStyle = C.bandLine; g.lineWidth = 1.2; poly(g, B); g.stroke();
      if (o.motif) { const ym = (a0[1] + a1[1]) / 2, hh = a0[1] - a1[1], nm = Math.max(2, Math.round((b0[0] - a0[0]) / 26)); for (let q = 0; q < nm; q++) { const mx = a0[0] + inset + (q + 0.5) * (b0[0] - a0[0] - inset * 2) / nm; if (Math.abs(mx) < o.stairW * 1.6) continue; o.motif(g, mx, ym, hh * 0.42, k, q); geo.glyphs.push([mx, ym, hh * 0.42]); } }
    }
    // the ledge in front of the next tier (just its front strip: the sides are the planes), or the top platform
    if (k < n - 1) {
      const nb = tiers[k + 1].hb, L = [A(-ht, ht, z1), A(ht, ht, z1), A(nb, nb, z1), A(-nb, nb, z1)];
      quad(L, linear(g, -ht, 0, ht, 0, [[0, shade(C.top, 0.06)], [1, shade(C.top, -0.08)]]));
      for (let q = 0; q < 5; q++) { const tx = -ht + rng() * ht * 2, ty = ht - rng() * ledge * 0.8; if (Math.abs(tx) < o.stairW * 1.4) continue; tuft(g, tx, ty * PDY - z1 * ZK, 2.4 + rng() * 1.6, rng); }
    } else { const top = lift(R(-ht, -ht, ht, ht), z1); quad(top, linear(g, -ht, top[0][1], ht, top[2][1], [[0, shade(C.top, 0.06)], [1, shade(C.top, -0.06)]])); }
    g.strokeStyle = 'rgba(255,250,235,0.85)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(...A(-ht, ht, z1)); g.lineTo(...A(ht, ht, z1)); g.stroke();
    geo.lips.push([A(-ht, ht, z1), A(ht, ht, z1)]);
  }

  // the great stair: from a landing out in front of the foot, up the south face to the top platform's front edge
  const w = o.stairW, b = w * 0.32, y0 = s + step * 0.9, y1 = tTop, at = u => (y0 + (y1 - y0) * u) * PDY - Z * u * ZK;
  const ya = at(0), yb = at(1), N = Math.max(10, Math.round((ya - yb) / 3.4));
  g.fillStyle = 'rgba(50,22,8,0.3)'; poly(g, [[w + b, yb], [w + b + 9, yb + 6], [w + b + 9, ya + 4], [w + b, ya]]); g.fill();   // its shadow on the face, to the right
  for (let q = 0; q < N; q++) {
    const yA = at(q / N), yB = at((q + 1) / N), h = yA - yB;
    g.fillStyle = shade(C.stair, -0.2); g.fillRect(-w, yB + h * 0.38, w * 2, h * 0.62);   // the riser, in shade
    g.fillStyle = shade(C.stair, 0.1); g.fillRect(-w, yB, w * 2, h * 0.38);               // the tread, lit
    g.fillStyle = 'rgba(50,22,8,0.22)'; g.fillRect(-w, yA - 0.7, w * 2, 0.7);
  }
  geo.stair = { w, ya, yb };
  for (const sx of [-1, 1]) {   // the balustrades: sloped ramps either side, capped, lit on the west, shaded on the east
    const x0 = sx < 0 ? -w - b : w;
    poly(g, [[x0, ya], [x0 + b, ya], [x0 + b, yb], [x0, yb]]); g.fillStyle = linear(g, x0, 0, x0 + b, 0, sx < 0 ? [[0, shade(C.rail, 0.12)], [1, C.rail]] : [[0, shade(C.rail, -0.1)], [1, shade(C.rail, -0.25)]]); g.fill();
    g.strokeStyle = 'rgba(60,28,10,0.4)'; g.lineWidth = 0.8; g.stroke();
    g.fillStyle = C.cap; g.fillRect(x0, yb, b, 2.5);
    if (o.railDeco) o.railDeco(g, x0, ya, b, ya - yb, sx);
  }
  // the landing at the stair's foot: a low platform reaching out onto the plaza
  box(g, -w - b - 6, (y0 - 3) * PDY, w + b + 6, (y0 + step * 0.7) * PDY, 0, 4, shade(C.top, 0.05), C.front, 0.3);
  geo.foot = [0, (y0 + step * 0.35) * PDY - 4 * ZK];
  // the temple on top
  const tw = tTop * 0.62, td0 = tTop * 0.55, td1 = tTop * 0.3, zt = Z, zw = Math.max(14, Z * 0.2), ty0 = -td0, ty1 = td1;
  castShadow(g, lift(R(-tw, ty0, tw, ty1), zt), zw, lift(R(-tw, ty0, tw, ty1), zt), 'rgba(50,22,8,0.3)');
  for (const sx of [-1, 1]) { const bx = sx * tTop * 0.82, by = tTop * 0.62 * PDY - zt * ZK; brazier(g, bx, by, 12, true); brazier(g, bx, by, 12, false); geo.braziers.push([bx, by - 12 * 0.55 * ZK - 3]); }
  const Wl = [A(-tw, ty0, zt), A(-tw, ty1, zt), A(-tw, ty1, zt + zw), A(-tw, ty0, zt + zw)], Er = [A(tw, ty0, zt), A(tw, ty1, zt), A(tw, ty1, zt + zw), A(tw, ty0, zt + zw)];
  quad(Wl, shade(C.wall, 0.08)); quad(Er, shade(C.wall, -0.25));
  const fy0 = ty1 * PDY - zt * ZK, fy1 = ty1 * PDY - (zt + zw) * ZK;
  g.fillStyle = linear(g, 0, fy1, 0, fy0, [[0, shade(C.wall, 0.06)], [1, shade(C.wall, -0.08)]]); g.fillRect(-tw, fy1, tw * 2, fy0 - fy1);
  const fz = (fy0 - fy1) * 0.26;
  for (let q = 0, nf = Math.max(4, Math.round(tw / 4)); q < nf; q++) { g.fillStyle = C.frieze[q % C.frieze.length]; g.fillRect(-tw + q * tw * 2 / nf, fy1, tw * 2 / nf + 0.3, fz); }
  const dw = tw * 0.24, dh = (fy0 - fy1 - fz) * 0.85;
  g.fillStyle = '#2a160c'; g.beginPath(); g.roundRect(-dw, fy0 - dh, dw * 2, dh, [dw * 0.5, dw * 0.5, 0, 0]); g.fill();
  g.fillStyle = 'rgba(255,170,70,0.35)'; g.fillRect(-dw * 0.8, fy0 - dh * 0.35, dw * 1.6, dh * 0.35);   // a fire inside
  geo.door = { x: 0, y: fy0 - dh / 2, w: dw, h: dh };
  for (const sx of [-1, 1]) { g.fillStyle = shade(C.wall, -0.15); g.fillRect(sx * dw * 1.35 - 1.5, fy0 - dh, 3, dh); }
  g.strokeStyle = 'rgba(60,28,10,0.35)'; g.lineWidth = 0.8; g.strokeRect(-tw, fy1, tw * 2, fy0 - fy1);
  let roofTop;
  if (o.roof === 'thatch') {   // a steep thatched roof, its ridge along the length, straw in rows
    const eave = 4, ry = fy1 - 2, rh = zw * 1.15 * ZK, rx0 = -tw - eave, rx1 = tw + eave, back = ty0 * PDY - (zt + zw) * ZK - 2;
    poly(g, [[rx0 + 6, ry - rh], [rx1 - 6, ry - rh], [rx1 - 10, back - rh * 0.3], [rx0 + 10, back - rh * 0.3]]); g.fillStyle = '#f2d894'; g.fill();
    poly(g, [[rx0, ry + 3], [rx1, ry + 3], [rx1 - 6, ry - rh], [rx0 + 6, ry - rh]]); g.fillStyle = linear(g, 0, ry - rh, 0, ry + 3, [[0, '#e8c77a'], [1, '#b98d44']]); g.fill();
    g.strokeStyle = 'rgba(110,70,20,0.45)'; g.lineWidth = 0.8; for (let u = rx0 + 3; u < rx1; u += 3.2) { g.beginPath(); g.moveTo(u, ry + 3); g.lineTo(u + (u < 0 ? 1.8 : -1.8), ry - rh); g.stroke(); }
    for (let q = 1; q < 3; q++) { const yy = ry + 3 - (rh + 3) * q / 3; g.strokeStyle = 'rgba(120,80,25,0.5)'; g.beginPath(); g.moveTo(rx0 + 2 * q, yy); g.lineTo(rx1 - 2 * q, yy); g.stroke(); }
    g.fillStyle = '#7a5424'; g.fillRect(rx0 + 8, back - rh * 0.3 - 2, rx1 - rx0 - 16, 3);
    roofTop = [0, back - rh * 0.3 - 4];
  } else {   // a stone roof slab with a pierced roof comb along its middle, a gold sun standing on it
    const sl = lift(R(-tw - 3, ty0 - 3, tw + 3, ty1 + 3), zt + zw);
    quad(sl, shade(C.wall, 0.12)); g.strokeStyle = 'rgba(60,28,10,0.35)'; g.lineWidth = 0.8; poly(g, sl); g.stroke();
    g.fillStyle = shade(C.wall, -0.2); g.fillRect(-tw - 3, (ty1 + 3) * PDY - (zt + zw) * ZK, tw * 2 + 6, 3);
    const cw = tw * 0.8, cyb = (ty0 + ty1) / 2 * PDY - (zt + zw) * ZK, cyt = cyb - zw * 0.9 * ZK;
    g.fillStyle = 'rgba(50,22,8,0.25)'; g.fillRect(-cw + 3, cyb, cw * 2, 3);
    g.fillStyle = linear(g, 0, cyt, 0, cyb, [[0, shade(C.comb, 0.1)], [1, shade(C.comb, -0.1)]]); g.fillRect(-cw, cyt, cw * 2, cyb - cyt);
    g.fillStyle = 'rgba(40,18,6,0.7)'; for (let u = -cw + 4; u < cw - 4; u += 6) if (Math.abs(u + 1.5) > 7) g.fillRect(u, cyt + 4, 3, cyb - cyt - 7);
    g.strokeStyle = 'rgba(60,28,10,0.4)'; g.lineWidth = 0.8; g.strokeRect(-cw, cyt, cw * 2, cyb - cyt);
    roofTop = [0, cyt - 2];
    if (o.crown) roofTop = o.crown(g, 0, cyt) || roofTop;
  }
  geo.top = roofTop;
  // rubble and tufts of grass round the foot
  for (let q = 0; q < 30; q++) {
    const side = q % 3, f = rng() * 2 - 1, x = side === 0 ? f * s : (side === 1 ? -s - 3 : s + 3) + rng() * 4, y = (side === 0 ? s + 4 + rng() * 6 : f * s) * PDY;
    if (side === 0 && Math.abs(x) < w + b + 12) continue;
    if (rng() < 0.55) tuft(g, x, y, 3 + rng() * 2.5, rng); else { const r = 1.8 + rng() * 2.4; ell(g, x + 1, y + 1.2, r, r * 0.6); g.fillStyle = 'rgba(60,30,10,0.25)'; g.fill(); ell(g, x, y, r, r * 0.7); g.fillStyle = shade(C.front, -0.1 + rng() * 0.2); g.fill(); }
  }
  return geo;
}
// a tuft of dry grass
function tuft(g, x, y, r, rng) {
  g.lineCap = 'round'; g.lineWidth = 1.1;
  for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + (rng() - 0.5) * 1.8, l = r * (0.6 + rng() * 0.5); g.strokeStyle = k % 2 ? '#b59a4a' : '#8f9a3e'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
}
// where the Pyramid of the Sun stands on a track, and where its stair, ledges, doorway, braziers, glyphs and top are (world
// coordinates, on screen): set when the track layer draws it, read by the secret shortcut's lights (art/phoenix.js)
const sunGeo = new WeakMap();
export const sunPyramidOf = T => sunGeo.get(T) || null;
// the phoenix's secret on a track (on a course: on any of its routes), or null
function phoenixOf(T) { for (const R of T.routes || [T]) for (const z of R.mech ? R.mech.secrets : []) if (z.kind === 'phoenix') return z; return null; }
// the sun altar at the stair's foot: a low round dais of stone with a gold sun set in it, facing the road (the secret's
// trigger: art/phoenix.js lights it up)
function sunAltar(g, x, y, r) {
  ell(g, x + 4, y + 5, r * 1.15, r * 0.75); g.fillStyle = 'rgba(70,35,12,0.3)'; g.fill();
  g.fillStyle = '#b48a5c'; g.beginPath(); g.ellipse(x, y + 2.5, r * 1.1, r * 0.72, 0, 0, Math.PI); g.fill();
  ell(g, x, y, r * 1.1, r * 0.72); g.fillStyle = linear(g, x - r, y - r, x + r, y + r, [[0, '#f1dcb4'], [1, '#cfae80']]); g.fill(); g.strokeStyle = 'rgba(90,50,20,0.55)'; g.lineWidth = 1.1; g.stroke();
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; g.save(); g.translate(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.56); g.fillStyle = k % 2 ? BLUE : '#2f8f86'; g.fillRect(-2, -1.4, 4, 2.8); g.restore(); }
  g.save(); g.translate(x, y); g.scale(1, 0.66);
  star(g, 0, 0, r * 0.66, 8, 0.45, -Math.PI / 2); g.fillStyle = linear(g, -r, -r, r, r, [[0, '#ffe680'], [0.5, '#f5b31a'], [1, '#b67a00']]); g.fill(); g.strokeStyle = '#7a5200'; g.lineWidth = 1.2; g.stroke();
  circ(g, 0, 0, r * 0.32); g.fillStyle = radial(g, -r * 0.08, -r * 0.1, 1, 0, 0, r * 0.32, [[0, '#fff3a6'], [0.6, YEL], [1, '#d99a00']]); g.fill(); g.stroke();
  g.restore();
}
const shiftGeo = (geo, dx, dy) => ({
  lips: geo.lips.map(([a, b]) => [[a[0] + dx, a[1] + dy], [b[0] + dx, b[1] + dy]]), glyphs: geo.glyphs.map(([x, y, r]) => [x + dx, y + dy, r]),
  braziers: geo.braziers.map(([x, y]) => [x + dx, y + dy]), stair: { x: dx, w: geo.stair.w, ya: geo.stair.ya + dy, yb: geo.stair.yb + dy },
  foot: [geo.foot[0] + dx, geo.foot[1] + dy], door: { ...geo.door, x: geo.door.x + dx, y: geo.door.y + dy }, top: [geo.top[0] + dx, geo.top[1] + dy],
});

// ------------------------------------------------------------------------------------------------ landmarks
// i: which landmark this is (the biggest clearing first): the serpent temple, the Pyramid of the Sun, the ball court
// The two pyramids swapped places (the user's call): the Pyramid of the Sun stands by the Temple Hairpin, where the sun
// stone of the secret shortcut lies at its foot (race-secret.js, art/phoenix.js), and the serpent temple where the Pyramid
// of the Sun used to be: the biggest clearing (i 0) gets the serpent temple, the next (i 1) the Pyramid of the Sun.
export function plateauLandmark(g, c, i, T) {
  const { x, y, r } = c, kind = i === 0 ? 1 : i === 1 ? 0 : i;
  if (kind === 0) {   // the Pyramid of the Sun: five tiers of warm sandstone with red plaster bands and gold suns, the great stair, a sanctuary under a gold sun; at its foot the sun altar (the secret shortcut's trigger)
    const ph = r * 0.7, s = r * 0.56, n = 5, tf = 0.3, Z = s * 0.62, step = s * (1 - tf) / n;
    // where it stands: on a track with the phoenix's secret, its stair comes down right onto the sun altar (race-secret.js)
    let px = x, py = y - r * 0.12; const z = T ? phoenixOf(T) : null;
    if (z && Math.hypot(z.x - x, z.y - y) < r * 1.6) { px = z.x; py = z.y - z.r * 0.35 - (s + step * 1.25) * PDY; }
    const qx = px, qy = py - s * PDY * 0.35, qh = ph * 0.78;   // the plaza round it (centred on the pyramid, not the clearing)
    plaza(g, qx, qy, ph, qh);
    pilgrims(g, qx - ph * 0.62, qy + qh * 0.5, ph * 0.22, qh * 0.3, 7, x + y); pilgrims(g, qx + ph * 0.62, qy + qh * 0.5, ph * 0.22, qh * 0.3, 7, x - y);
    for (const [bx, by] of [[-1, -1], [1, -1]]) banner(g, qx + bx * (ph - 16), qy + by * (qh - 16), 34, bx < 0 ? YEL : RED, '#e8742a');
    if (z) sunAltar(g, z.x, z.y - z.r * 0.1, z.r * 0.5);
    g.save(); g.translate(px, py);
    const sunMotif = (g, mx, my, rr) => { star(g, mx, my, rr, 8, 0.55, 0); g.fillStyle = YEL_DK; g.fill(); circ(g, mx, my, rr * 0.5); g.fillStyle = '#ffe680'; g.fill(); g.strokeStyle = 'rgba(120,70,0,0.6)'; g.lineWidth = 0.6; g.stroke(); };
    const geo = grandPyramid(g, {
      s, n, Z, tf, seed: 7, stairW: s * 0.12, roof: 'stone',
      C: { lit: '#f0c793', front: '#cc9058', shade: '#9a6234', top: '#f1d29e', band: '#b5573b', bandLine: 'rgba(250,236,205,0.85)', stair: '#e6c48f', rail: '#d9a468', cap: YEL, wall: '#f0dfbb', frieze: [YEL, '#b5573b', YEL, '#e8742a'], comb: '#dfa05a' },
      motif: sunMotif,
      railDeco: (g, x0, ya, b, len) => { for (let yy = ya - 8; yy > ya - len + 6; yy -= 13) { circ(g, x0 + b / 2, yy, b * 0.32); g.fillStyle = YEL; g.fill(); g.strokeStyle = '#8a5a00'; g.lineWidth = 0.6; g.stroke(); } },
      crown: (g, cx, cyt) => {   // the gold sun standing on the roof comb, its face to the south
        const sr = 15, sy = cyt - sr * 0.9;
        g.fillStyle = '#6e4a1a'; g.fillRect(cx - 1.5, sy, 3, cyt - sy);
        star(g, cx, sy, sr, 12, 0.72, 0); g.fillStyle = YEL_DK; g.fill(); g.strokeStyle = '#8a5a00'; g.lineWidth = 1; g.stroke();
        circ(g, cx, sy, sr * 0.62); g.fillStyle = radial(g, cx - sr * 0.2, sy - sr * 0.25, 1, cx, sy, sr * 0.62, [[0, '#fff3a6'], [0.6, YEL], [1, YEL_DK]]); g.fill(); g.stroke();
        g.fillStyle = '#8a5a00'; for (const ex of [-1, 1]) { circ(g, cx + ex * sr * 0.2, sy - sr * 0.08, sr * 0.07); g.fill(); }
        g.strokeStyle = '#8a5a00'; g.lineWidth = 1; g.beginPath(); g.arc(cx, sy + sr * 0.06, sr * 0.22, 0.3, Math.PI - 0.3); g.stroke();
        return [cx, sy - sr];
      },
    });
    for (const sx of [-1, 1]) for (const sp of [true, false]) brazier(g, sx * (s * 0.12 * 1.32 + 22), (s + step * 1.2) * PDY, 20, sp);   // copal burning either side of the stair's foot
    for (const sx of [-1, 1]) serpentHead(g, sx * s * 0.12 * 1.16, (s + step * 0.95) * PDY, s * 0.075, Math.PI / 2, sx < 0 ? 0 : 1);
    g.restore();
    if (T) sunGeo.set(T, shiftGeo(geo, px, py));
    for (const [bx, by] of [[-1, 1], [1, 1]]) banner(g, qx + bx * (ph - 16), qy + by * (qh - 22), 34, bx < 0 ? RED : YEL, '#e8742a');
    return;
  }
  if (kind === 1) {   // the serpent temple: a steep four-tier pyramid of pale stone faced with feathered serpents, its stair between two serpent balustrades, and Pyth coiled in mosaic on its plaza
    const s = r * 0.48, py = y - r * 0.12, ph = r * 0.7;
    plaza(g, x, y, ph, ph, ['#dcc08c', '#cba875'], JADE);
    // the mosaic: a round medallion with a coiled serpent in blue tesserae, a yellow belly stripe, its head raised at the end
    const mx = x, my = y + r * 0.47, R0 = r * 0.22;
    ell(g, mx, my, R0 * 1.12, R0 * 0.72); g.fillStyle = '#c99a58'; g.fill(); g.strokeStyle = RED; g.lineWidth = 3; g.stroke();
    ell(g, mx, my, R0 * 1.02, R0 * 0.64); g.fillStyle = '#f1e4c4'; g.fill(); g.strokeStyle = alpha(JADE, 0.8); g.lineWidth = 1.5; g.stroke();
    const pts = [];
    for (let k = 0; k <= 90; k++) { const f = k / 90, a = -Math.PI / 2 + f * 1.8 * TAU, d = R0 * 0.85 * (0.18 + 0.82 * f); pts.push([mx + Math.cos(a) * d, my + Math.sin(a) * d * 0.62]); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    poly(g, pts, false); g.strokeStyle = BLUE_DK; g.lineWidth = r * 0.075; g.stroke(); g.strokeStyle = BLUE; g.lineWidth = r * 0.06; g.stroke();
    g.strokeStyle = YEL; g.lineWidth = r * 0.02; g.stroke();
    g.fillStyle = alpha('#ffffff', 0.35); for (let k = 2; k < pts.length; k += 3) { circ(g, pts[k][0] - r * 0.012, pts[k][1] - r * 0.012, r * 0.008); g.fill(); }
    const [hx, hy] = pts[pts.length - 1], [qx, qy] = pts[pts.length - 3];
    serpentHead(g, hx, hy, r * 0.08, Math.atan2(hy - qy, hx - qx), 0);
    pilgrims(g, x, y + r * 0.47, R0 * 2.4, R0 * 0.9, 10, x * 3 + y);
    for (const [bx, by] of [[-1, -1], [1, -1]]) banner(g, x + bx * (ph - 16), y + by * (ph - 16), 34, bx < 0 ? '#2f9a6a' : BLUE, YEL);
    g.save(); g.translate(x, py);
    const geo1 = grandPyramid(g, {
      s, n: 4, Z: s * 0.86, tf: 0.34, seed: 11, stairW: s * 0.14, roof: 'thatch',
      C: { lit: '#f2eadb', front: '#d9cfb8', shade: '#a99c82', top: '#f8f3e7', band: '#2f8f86', bandLine: 'rgba(244,240,228,0.9)', stair: '#ede5d2', rail: BLUE, cap: YEL, wall: '#f4eddc', frieze: [JADE, BLUE, YEL, BLUE], comb: '#e9dcbc' },
      motif: (g, mx, my, rr, k, q) => {   // a little feathered serpent, coiled, in blue with a gold belly and jade feathers
        g.lineCap = 'round'; g.beginPath(); for (let u = -1; u <= 1.001; u += 0.1) { const xx = mx + u * rr * 1.6, yy = my + Math.sin(u * Math.PI * 1.5 + q) * rr * 0.45; u === -1 ? g.moveTo(xx, yy) : g.lineTo(xx, yy); }
        g.strokeStyle = BLUE_DK; g.lineWidth = rr * 0.75; g.stroke(); g.strokeStyle = BLUE; g.lineWidth = rr * 0.55; g.stroke(); g.strokeStyle = YEL; g.lineWidth = rr * 0.16; g.stroke();
        for (const u of [-0.6, 0, 0.6]) { ell(g, mx + u * rr * 1.6, my - rr * 0.55, rr * 0.28, rr * 0.14, -0.5); g.fillStyle = '#3fbf8f'; g.fill(); }
      },
      railDeco: (g, x0, ya, b, len) => { for (let yy = ya - 3; yy > ya - len + 2; yy -= 6) { poly(g, [[x0, yy], [x0 + b / 2, yy - 3], [x0 + b, yy]], false); g.strokeStyle = YEL; g.lineWidth = 1.1; g.stroke(); } },
    });
    for (const sx of [-1, 1]) serpentHead(g, sx * s * 0.14 * 1.16, (s + s * 0.66 / 4 * 1.1) * PDY, s * 0.13, Math.PI / 2, 0);   // the balustrades' great serpent heads at the foot
    for (const sx of [-1, 1]) for (const sp of [true, false]) brazier(g, sx * s * 0.5, (s + s * 0.22) * PDY, 20, sp);   // copal at the stair's foot
    g.restore();
    return;
  }
  // the ball court: an I-shaped court, a narrow alley between two long buildings with sloping benches and a wider end
  // zone at each end, walled low, reaching out past the buildings; a stone ring set high in the middle of each wall,
  // banners along the tops, the rubber ball in the alley
  const L = r * 0.5, hw = r * 0.11, bench = r * 0.055, outer = r * 0.25, endW = r * 0.4, endD = r * 0.24, Zw = r * 0.17, zb = Zw * 0.38, ew = 5, ez = 7;
  const PW = L + endD + ew + 18, PH = endW + ew + 18;
  plaza(g, x, y, PW, PH);
  g.save(); g.translate(x, y);
  for (const sy of [-1, 1]) castShadow(g, rect(-L, sy < 0 ? -outer : hw, L, sy < 0 ? -hw : outer), Zw);
  // the floor of the I: the end zones and the alley, plastered and painted, a line across the middle, three markers
  const I = [[-L - endD, -endW], [-L, -endW], [-L, -hw], [L, -hw], [L, -endW], [L + endD, -endW], [L + endD, endW], [L, endW], [L, hw], [-L, hw], [-L, endW], [-L - endD, endW]];
  poly(g, I); g.fillStyle = '#dcae72'; g.fill();
  g.save(); poly(g, I); g.clip();
  g.fillStyle = alpha('#ffffff', 0.18); g.fillRect(-L - endD, -endW, L * 2 + endD * 2, 6);
  g.restore();
  g.strokeStyle = alpha(RED, 0.8); g.lineWidth = 2; g.beginPath(); g.moveTo(0, -hw); g.lineTo(0, hw); g.stroke();
  for (const ex of [-1, 1]) { g.strokeStyle = alpha(RED, 0.55); g.lineWidth = 1.5; g.beginPath(); g.moveTo(ex * L, -endW + 4); g.lineTo(ex * L, endW - 4); g.stroke(); }
  for (const mx of [-L * 0.6, 0, L * 0.6]) { circ(g, mx, 0, 5); g.fillStyle = '#d7c49a'; g.fill(); g.strokeStyle = alpha('#6e5530', 0.6); g.lineWidth = 1; g.stroke(); circ(g, mx, 0, 2); g.fillStyle = alpha(JADE, 0.9); g.fill(); }
  // the low walls round the end zones: the far (north) ones first
  const wall = (x0, y0, x1, y1) => box(g, x0, y0, x1, y1, 0, ez, CREAM, '#c7ab7e');
  for (const ex of [-1, 1]) { const a = ex * L, b = ex * (L + endD + ew); wall(Math.min(a, b), -endW - ew, Math.max(a, b), -endW); wall(ex < 0 ? -L - ew : L, -endW, ex < 0 ? -L : L + ew, -outer); }
  // the north building: its bench sloping up from the alley, its wall with the ring, its top
  poly(g, [[-L, -hw], [L, -hw], [L, -hw - bench - zb * ZK], [-L, -hw - bench - zb * ZK]]); g.fillStyle = linear(g, 0, -hw - bench - zb * ZK, 0, -hw, [[0, '#f2e2bc'], [1, '#d8bf8f']]); g.fill();
  const wb = -hw - bench - zb * ZK, wt = -hw - bench - Zw * ZK;
  g.fillStyle = linear(g, 0, wt, 0, wb, [[0, '#c95c40'], [1, '#a63e28']]); g.fillRect(-L, wt, L * 2, wb - wt);
  g.fillStyle = alpha('#2a0f06', 0.3); g.fillRect(-L, wb - 1, L * 2, 1);
  poly(g, lift(rect(-L, -outer, L, -hw - bench), Zw)); g.fillStyle = CREAM; g.fill(); g.strokeStyle = alpha('#2a0f06', 0.3); g.lineWidth = 0.8; g.stroke();
  g.strokeStyle = alpha(RED, 0.75); g.lineWidth = 2; g.strokeRect(-L + 4, -outer + 4 - Zw * ZK, L * 2 - 8, outer - hw - bench - 8);
  const ry = (wt + wb) / 2, rr = (wb - wt) * 0.62;   // the ring, face-on: a stone ring carved with a serpent, standing proud of the wall
  circ(g, 2, ry + 3, rr); g.fillStyle = 'rgba(40,15,5,0.35)'; g.fill();
  circ(g, 0, ry, rr); g.fillStyle = radial(g, -rr * 0.3, ry - rr * 0.3, 1, 0, ry, rr, [[0, '#e6e0d0'], [1, '#8f8778']]); g.fill(); g.strokeStyle = '#4f4b43'; g.lineWidth = 1; g.stroke();
  circ(g, 0, ry, rr * 0.72); g.strokeStyle = BLUE; g.lineWidth = 1.6; g.stroke();
  circ(g, 0, ry, rr * 0.42); g.fillStyle = '#2a2622'; g.fill();
  // in the alley: the ball, bouncing toward the far ring
  const bx = -L * 0.28, by = -hw * 0.15;
  ell(g, bx + 4, by + 5, 4.5, 2.5); g.fillStyle = 'rgba(40,15,5,0.3)'; g.fill();
  circ(g, bx, by - 4, 4.6); g.fillStyle = radial(g, bx - 1.6, by - 5.6, 0.5, bx, by - 4, 4.6, [[0, '#7a7a7a'], [1, '#141414']]); g.fill();
  // the side walls between the buildings and the near end zones, then the south building (it hides a strip of the alley):
  // the other ring over its top, edge-on, its south wall toward us with a panel along it
  for (const ex of [-1, 1]) wall(ex < 0 ? -L - ew : L, outer, ex < 0 ? -L : L + ew, endW);
  poly(g, lift(rect(-L, hw + bench, L, outer), Zw)); g.fillStyle = CREAM; g.fill(); g.strokeStyle = alpha('#2a0f06', 0.3); g.lineWidth = 0.8; g.stroke();
  g.strokeStyle = alpha(RED, 0.75); g.lineWidth = 2; g.strokeRect(-L + 4, hw + bench + 4 - Zw * ZK, L * 2 - 8, outer - hw - bench - 8);
  g.fillStyle = linear(g, 0, outer - Zw * ZK, 0, outer, [[0, '#c95c40'], [1, '#a63e28']]); g.fillRect(-L, outer - Zw * ZK, L * 2, Zw * ZK);
  g.fillStyle = shade(RED, -0.3); g.fillRect(-L + 6, outer - Zw * ZK * 0.66, L * 2 - 12, Zw * ZK * 0.38);
  for (let u = -L + 14; u < L - 8; u += 16) { circ(g, u, outer - Zw * ZK * 0.47, 2); g.fillStyle = JADE; g.fill(); }
  const ty = hw + bench - Zw * ZK;
  ell(g, 0, ty - 2, rr, 3); g.fillStyle = '#a49c8c'; g.fill(); g.strokeStyle = '#4f4b43'; g.lineWidth = 0.8; g.stroke();
  ell(g, 0, ty - 2, rr * 0.4, 1.1); g.fillStyle = '#2a2622'; g.fill();
  for (const ex of [-1, 1]) { const a = ex * L, b = ex * (L + endD + ew); wall(Math.min(a, b), endW, Math.max(a, b), endW + ew); wall(ex < 0 ? -L - endD - ew : L + endD, -endW - ew, ex < 0 ? -L - endD : L + endD + ew, endW + ew); }
  for (const bx of [-0.66, 0, 0.66]) banner(g, bx * L, -outer + 7 - Zw * ZK, 24, bx ? BLUE : RED, YEL);
  g.restore();
}

// ------------------------------------------------------------------------------------------------ the Sun Gate
// A gateway over the Sun Road (lap 1) where it comes out of the long sweeper at the T, on the run-up to the Sun Ramp:
// two pillars of red plaster with cream bands, a lintel across the road faced with Pyth's blue and yellow, and a gold
// sun standing on top. Seen like the other buildings: from above and a little from the south, heights up the screen.
// Its shadow is baked into the track layer (sunGateShadow); the gate itself is a roof layer over the karts (sunGate).
const GATE = { up: 320, post: 22, pw: 15, pd: 13, H: 70, lh: 22, ld: 15, sun: 19 };   // up: how far before the ramp's lip
function gateFrame(T) {
  const R = T.routes && T.routes[0];
  if (!R || !R.jumps || !R.jumps.length) return null;
  const q = trackSample(R, R.jumps[0].s - GATE.up), hw = q.hw;
  // a point lat across the road, al along it, z up
  return { q, hw, P: (lat, al, z) => [q.x + q.nx * lat + q.tx * al, q.y + q.ny * lat + q.ty * al - z] };
}
const SUN_SHADOW = [0.28, 0.38];   // a shadow's offset per unit of height (down and to the right)
export function sunGateShadow(g, T) {
  const F = gateFrame(T); if (!F) return;
  const { P, hw } = F, { post, pw, pd, H, lh, ld } = GATE, path = new Path2D();
  const quad = (pts, z) => { const [dx, dy] = [z * SUN_SHADOW[0], z * SUN_SHADOW[1]]; pts.forEach(([x, y], i) => i ? path.lineTo(x + dx, y + dy) : path.moveTo(x + dx, y + dy)); path.closePath(); };
  for (const sd of [-1, 1]) { const c = sd * (hw + post); for (let k = 0; k <= 8; k++) quad([P(c - pw, -pd, 0), P(c + pw, -pd, 0), P(c + pw, pd, 0), P(c - pw, pd, 0)], H * k / 8); }   // each pillar, swept up its height
  const L = hw + post + pw + 8;
  for (let k = 0; k <= 3; k++) quad([P(-L, -ld, 0), P(L, -ld, 0), P(L, ld, 0), P(-L, ld, 0)], H + lh * k / 3);   // the lintel
  g.fillStyle = 'rgba(60,30,10,0.26)'; g.fill(path, 'nonzero');
}
export function sunGate(T) {
  const F = gateFrame(T); if (!F) return [];
  const { q, hw } = F, r = hw + 90, up = GATE.H + GATE.lh + GATE.sun * 2 + 30;
  return [{ x: q.x - r, y: q.y - r - up, w: r * 2, h: r * 2 + up, draw: g => drawSunGate(g, F) }];
}
function drawSunGate(g, F) {
  const { P, hw } = F, { post, pw, pd, H, lh, ld, sun } = GATE, L = hw + post + pw + 8;
  const quad = (pts, col) => { poly(g, pts); g.fillStyle = col; g.fill(); };
  g.lineJoin = 'round';
  for (const sd of [-1, 1]) {   // the pillars: the shaded east face, the south face (bands of cream), the top
    const c = sd * (hw + post), a = c - pw, b = c + pw;
    quad([P(b, -pd, 0), P(b, pd, 0), P(b, pd, H), P(b, -pd, H)], shade(RED, -0.35));
    quad([P(a, -pd, 0), P(b, -pd, 0), P(b, -pd, H), P(a, -pd, H)], RED);
    for (const [z0, z1] of [[4, 10], [H - 16, H - 10]]) quad([P(a, -pd, z0), P(b, -pd, z0), P(b, -pd, z1), P(a, -pd, z1)], CREAM);
    quad([P(a, -pd, 0), P(a + 4, -pd, 0), P(a + 4, -pd, H), P(a, -pd, H)], alpha('#ffffff', 0.18));   // the lit west edge
    quad([P(a, -pd, H), P(b, -pd, H), P(b, pd, H), P(a, pd, H)], PLASTER);
  }
  // the lintel: its shaded east end, the south face with a fret of blue and yellow, the top lit along its south edge
  quad([P(L, -ld, H), P(L, ld, H), P(L, ld, H + lh), P(L, -ld, H + lh)], shade(RED, -0.4));
  quad([P(-L, -ld, H), P(L, -ld, H), P(L, -ld, H + lh), P(-L, -ld, H + lh)], shade(RED, -0.08));
  const n = 14, seg = (2 * L - 12) / n;
  for (let k = 0; k < n; k++) { const x0 = -L + 6 + k * seg; quad([P(x0 + 1, -ld, H + 5), P(x0 + seg - 1, -ld, H + 5), P(x0 + seg - 1, -ld, H + lh - 5), P(x0 + 1, -ld, H + lh - 5)], k % 2 ? YEL : BLUE); }
  quad([P(-L, -ld, H), P(L, -ld, H), P(L, -ld, H + 2), P(-L, -ld, H + 2)], 'rgba(40,15,5,0.35)');
  quad([P(-L, -ld, H + lh), P(L, -ld, H + lh), P(L, ld, H + lh), P(-L, ld, H + lh)], CREAM);
  quad([P(-L, -ld, H + lh), P(L, -ld, H + lh), P(L, -ld + 3, H + lh), P(-L, -ld + 3, H + lh)], '#fff6df');
  // the sun standing on the middle of the lintel: gold rays round a disc with a face
  const [sx, sy] = P(0, 0, H + lh + sun + 2);
  g.save(); g.translate(sx, sy);
  ell(g, 5, sun + 6, sun * 0.9, 4); g.fillStyle = 'rgba(60,30,10,0.25)'; g.fill();
  star(g, 0, 0, sun * 1.0, 12, 0.72, 0); g.fillStyle = YEL_DK; g.fill(); g.strokeStyle = '#8a5a00'; g.lineWidth = 1.2; g.stroke();
  circ(g, 0, 0, sun * 0.66); g.fillStyle = radial(g, -sun * 0.25, -sun * 0.3, 1, 0, 0, sun * 0.66, [[0, '#fff3a6'], [0.6, YEL], [1, YEL_DK]]); g.fill(); g.stroke();
  g.fillStyle = '#8a5a00'; for (const ex of [-1, 1]) { circ(g, ex * sun * 0.22, -sun * 0.1, sun * 0.07); g.fill(); }
  g.strokeStyle = '#8a5a00'; g.lineWidth = 1.4; g.beginPath(); g.arc(0, sun * 0.08, sun * 0.24, 0.3, Math.PI - 0.3); g.stroke();
  g.restore();
}
