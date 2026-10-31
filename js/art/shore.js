// Crab Harbor's seaside (theme 'crab', ground 'shore'), baked into the track layer. The track's `shore` (layout
// units) lists `sea`, `harbour` (quay, `piers`, the `mole` and lighthouse) and `town`; the rest is sand. shoreProp
// draws the beach props for art/props.js.
import { TAU, clamp, mulberry } from '../core.js';
import { alpha, circ, ell, linear, mix, poly, radial, shade, smooth, star } from './paint.js';
import { canopy, findClearings } from './props.js';

// ---------------------------------------------------------------- the shore's shape
const shores = new WeakMap();
export const inPoly = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
// the polygon's real shoreline edges (not its far-off outer box) as point chains every `step`, each with its
// smoothed normal into the water and distance along the chain
function chains(P, step) {
  if (P.length < 3) return [];
  const xs = P.map(p => p[0]), ys = P.map(p => p[1]), ext = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const onBox = (a, b) => (a[0] === b[0] && (a[0] === ext[0] || a[0] === ext[1])) || (a[1] === b[1] && (a[1] === ext[2] || a[1] === ext[3]));
  const n = P.length; let start = 0;
  for (let i = 0; i < n; i++) if (onBox(P[(i + n - 1) % n], P[i])) { start = i; break; }   // (start just after a box edge, so no chain is cut at the wrap)
  const out = []; let cur = null;
  for (let k = 0; k < n; k++) {
    const a = P[(start + k) % n], b = P[(start + k + 1) % n];
    if (onBox(a, b)) { if (cur) out.push(cur); cur = null; continue; }
    if (!cur) cur = [];
    const m = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let j = cur.length ? 1 : 0; j <= m; j++) cur.push([a[0] + (b[0] - a[0]) * j / m, a[1] + (b[1] - a[1]) * j / m]);
  }
  if (cur) out.push(cur);
  return out.map(c => {
    let s = 0;
    return c.map((p, i) => {
      const a = c[Math.max(0, i - 3)], b = c[Math.min(c.length - 1, i + 3)];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      if (!inPoly(P, p[0] + nx * 8, p[1] + ny * 8)) { nx = -nx; ny = -ny; }
      if (i) s += Math.hypot(p[0] - c[i - 1][0], p[1] - c[i - 1][1]);
      return { x: p[0], y: p[1], nx, ny, s };
    });
  });
}
const nearest = pts => (x, y) => { let m = 1e12; for (const q of pts) { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < m) m = d; } return Math.sqrt(m); };
const segDist = (x, y, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, f = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1); return Math.hypot(ax + dx * f - x, ay + dy * f - y); };
const PROM = 58;   // how wide the paved quay is round the harbour

export function shoreOf(T) {
  if (shores.has(T)) return shores.get(T);
  const d = T.def.shore || {}, sc = T.def.scale || 1, P = a => (a || []).map(([x, y]) => [x * sc, y * sc]);
  const sea = P(d.sea), harbour = P(d.harbour), mole = P(d.mole), town = d.town ? d.town.map(v => v * sc) : null;
  const wet = (x, y) => (sea.length > 0 && inPoly(sea, x, y)) || (harbour.length > 0 && inPoly(harbour, x, y));
  const seaC = chains(sea, 12), harC = chains(harbour, 12);
  const seaDist = nearest(seaC.flat().filter((_, i) => i % 2 === 0)), quayDist = nearest(harC.flat().filter((_, i) => i % 2 === 0));
  // the piers: from the quay out into the basin, square to it
  const piers = (d.piers || []).map(([x, y, l]) => {
    x *= sc; y *= sc; l *= sc; let best = null;
    for (const q of harC.flat()) { const dd = Math.hypot(q.x - x, q.y - y); if (!best || dd < best.d) best = { q, d: dd }; }
    const q = best.q; return { x: q.x - q.nx * 8, y: q.y - q.ny * 8, ux: q.nx, uy: q.ny, l: l + 8, w: 30 };
  });
  // what's built on: the town, the quay, the piers and the mole (the props keep off them)
  const built = (x, y, pad = 0) => (town && x > town[0] - pad && x < town[2] + pad && y > town[1] - pad && y < town[3] + pad) || (harC.length > 0 && quayDist(x, y) < PROM + pad)
    || piers.some(p => segDist(x, y, p.x, p.y, p.x + p.ux * p.l, p.y + p.uy * p.l) < p.w / 2 + 34 + pad)
    || (mole.length === 2 && segDist(x, y, mole[0][0], mole[0][1], mole[1][0], mole[1][1]) < 70 + pad);
  const onLand = (x, y, pad = 0) => !wet(x, y) && !(pad > 0 && (wet(x + pad, y) || wet(x - pad, y) || wet(x, y + pad) || wet(x, y - pad)));
  onLand.wind = -0.6;   // (which way the palms would lean)
  onLand.built = built;
  // the crab's beach (race-crab.js keeps the props off it): the beach things stay off it too
  const crabPts = [];
  if (T.mech) for (const z of T.mech.crab) for (let s = z.s0 - 120; s <= z.s1 + 120; s += 60) { const i = Math.floor((((s % T.L) + T.L) % T.L) / T.L * T.N) % T.N, p = T.pts[i], t = T.tan[i]; crabPts.push({ x: p[0] - t[1] * z.side * z.off, y: p[1] + t[0] * z.side * z.off }); }
  const crabDist = crabPts.length ? nearest(crabPts) : () => 1e9;
  const out = { sea, harbour, mole, town, piers, seaC, harC, seaDist, quayDist, crabDist, onLand, wet, built };
  shores.set(T, out); return out;
}

// ---------------------------------------------------------------- helpers
const tracePath = P => { const p = new Path2D(); P.forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y)); p.closePath(); return p; };
// a line along the shore chains, `off` into the water (a number, or a function of the chain point)
function along(C, off) {
  const p = new Path2D();
  for (const c of C) c.forEach((q, i) => { const o = typeof off === 'function' ? off(q) : off, x = q.x + q.nx * o, y = q.y + q.ny * o; i ? p.lineTo(x, y) : p.moveTo(x, y); });
  return p;
}
// a band along the shore chains between offsets a and b
function bandAlong(C, a, b) {
  const p = new Path2D();
  for (const c of C) {
    c.forEach((q, i) => { const o = a(q), x = q.x + q.nx * o, y = q.y + q.ny * o; i ? p.lineTo(x, y) : p.moveTo(x, y); });
    for (let i = c.length - 1; i >= 0; i--) { const q = c[i], o = b(q); p.lineTo(q.x + q.nx * o, q.y + q.ny * o); }
    p.closePath();
  }
  return p;
}
const ramp = (stops, d) => { for (let i = 1; i < stops.length; i++) if (d <= stops[i][0]) { const [d0, c0] = stops[i - 1], [d1, c1] = stops[i]; return mix(c0, c1, clamp((d - d0) / (d1 - d0), 0, 1)); } return stops[stops.length - 1][1]; };
const blob = (rng, x, y, r, n = 11, sq = 0.8, j = 0.3) => { const pts = []; for (let k = 0; k < n; k++) { const a = k / n * TAU, dd = r * (1 - j / 2 + rng() * j); pts.push([x + Math.cos(a) * dd, y + Math.sin(a) * dd * sq]); } return pts; };
const scaled = (pts, x, y, k, dx = 0, dy = 0) => pts.map(([px, py]) => [x + (px - x) * k + dx, y + (py - y) * k + dy]);
// the side of a shape toward the light, in a rotated frame: the light comes from the top left of the world
const litDir = rot => [-0.6 * Math.cos(rot) - 0.8 * Math.sin(rot), 0.6 * Math.sin(rot) - 0.8 * Math.cos(rot)];

// colours
const SAND = { hollow: '#cfa76c', crest: '#fff6e0', grain: '#b48f58', wet: '#bf9a64', wetDk: '#a9844f' };
const SEA = [[0, '#bdf2e4'], [22, '#90e6d9'], [60, '#62d4d2'], [130, '#3fbad0'], [230, '#2a9fc7'], [370, '#2187ba'], [560, '#1b70a6'], [820, '#155e95']];
const HARB = [[0, '#3c9fa2'], [40, '#2f8d9c'], [140, '#26798f'], [300, '#1f6a84'], [520, '#1b5f7a']];
const ROCK = { dk: '#5f564c', md: '#867a6b', lt: '#ab9d88', top: '#cbbca4', crack: '#463f37' };

// ---------------------------------------------------------------- the ground
export function shoreGround(g, T, X0, Y0, W, H, dist, D) {
  const S = shoreOf(T), area = W * H, rng = mulberry(T.N * 13 + 5);
  const busy = [...(T.deco || []).map(p => ({ x: p.x, y: p.y, r: p.r + 10 })), ...findClearings(T, dist, 'crab').map(c => ({ x: c.x, y: c.y, r: c.r * 0.95 }))];
  const free = (x, y, r) => !S.wet(x, y) && !S.built(x, y, r) && !busy.some(b => Math.hypot(b.x - x, b.y - y) < b.r + r);
  g.lineCap = 'round'; g.lineJoin = 'round';
  sand(g, S, X0, Y0, W, H, area, rng, D);
  if (S.sea.length) wetSand(g, S, rng, D);
  if (S.harbour.length) quay(g, S, X0, Y0, W, H, rng, D);
  if (S.town) { town(g, S, rng, D); coping(g, S); }
  for (const p of S.piers) pier(g, p, rng, D);
  if (S.sea.length) sea(g, S, X0, Y0, W, H, area, rng, D);
  if (S.mole.length === 2) mole(g, S, rng, D);
  shelves(g, S, X0, Y0, W, H, area, rng, dist, free, D);
  if (D > 0.5) { fences(g, S, X0, Y0, W, H, rng, dist, free); strandline(g, S, rng, dist); grass(g, S, X0, Y0, W, H, area, rng, dist, free); shells(g, S, X0, Y0, W, H, area, rng, dist); beach(g, S, rng, dist, free); }
}

// warm sand: soft dunes lit from the top left, wind ripples in patches, grains
function sand(g, S, X0, Y0, W, H, area, rng, D) {
  for (let i = 0; i < area / 160000; i++) {   // dunes: a lit face up and to the left, a soft hollow down and to the right
    const x = X0 + rng() * W, y = Y0 + rng() * H, r = 120 + rng() * 220, a = -0.4 + rng() * 0.5, e = 0.45 + rng() * 0.3;
    if (S.wet(x, y)) continue;
    g.save(); g.translate(x, y); g.rotate(a); g.scale(1, e);
    g.fillStyle = radial(g, -r * 0.25, -r * 0.3, 0, -r * 0.2, -r * 0.25, r, [[0, alpha(SAND.crest, 0.42)], [1, alpha(SAND.crest, 0)]]); g.fillRect(-r * 1.3, -r * 1.3, r * 2.4, r * 2.4);
    g.fillStyle = radial(g, r * 0.35, r * 0.45, 0, r * 0.3, r * 0.4, r * 0.9, [[0, alpha(SAND.hollow, 0.28)], [1, alpha(SAND.hollow, 0)]]); g.fillRect(-r, -r, r * 2.4, r * 2.4);
    g.restore();
  }
  if (D > 0.5) for (let i = 0; i < area / 70000; i++) {   // wind ripples: a patch of parallel wavy crests, each a soft shadow under a lit one
    const x = X0 + rng() * W, y = Y0 + rng() * H, a = -0.35 + (rng() - 0.5) * 0.4, n = 3 + Math.floor(rng() * 5), l = 60 + rng() * 90, ca = Math.cos(a), sa = Math.sin(a);
    for (let k = 0; k < n; k++) {
      const o = (k - n / 2) * 12, ll = l * (0.5 + 0.5 * Math.sin((k + 0.5) / n * Math.PI)), cx = x - sa * o + (rng() - 0.5) * 16, cy = y + ca * o;
      for (const [dy, col, lw] of [[2, alpha(SAND.hollow, 0.16), 2.6], [0, alpha(SAND.crest, 0.4), 1.4]]) {
        g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
        for (let j = 0; j <= 8; j++) { const f = j / 8 - 0.5, px = cx + ca * ll * f, py = cy + sa * ll * f + Math.sin(j * 1.1 + k) * 2.4 + dy; j ? g.lineTo(px, py) : g.moveTo(px, py); }
        g.stroke();
      }
    }
  }
  for (let i = 0; i < area / 700 * D; i++) { g.fillStyle = rng() < 0.5 ? alpha(SAND.grain, 0.22) : alpha('#fffaf0', 0.4); g.fillRect(X0 + rng() * W, Y0 + rng() * H, 1.4, 1.4); }
}

// the beach toward the sea: darker, damp sand, glossy at the water's edge, and the line the last big wave reached
function wetSand(g, S, rng, D) {
  const C = S.seaC, E = along(C, 0);
  for (const [w, a] of [[420, 0.05], [320, 0.06], [240, 0.07], [170, 0.08], [110, 0.1], [64, 0.12]]) { g.strokeStyle = alpha(SAND.wet, a); g.lineWidth = w; g.stroke(E); }
  g.strokeStyle = alpha(SAND.wetDk, 0.35); g.lineWidth = 34; g.stroke(E);
  g.strokeStyle = alpha('#ffffff', 0.16); g.lineWidth = 16; g.stroke(along(C, -5));   // the sky in the wet sand
  // the high-water mark: a thin scalloped line of darker sand and froth left behind
  const hw = q => -(52 + 14 * Math.sin(q.s / 61) + 9 * Math.sin(q.s / 23 + 2));
  g.strokeStyle = alpha(SAND.wetDk, 0.22); g.lineWidth = 2.4; g.stroke(along(C, hw));
  g.strokeStyle = alpha('#ffffff', 0.35); g.lineWidth = 1.2; g.setLineDash([10, 7, 3, 9]); g.stroke(along(C, q => hw(q) + 2.5)); g.setLineDash([]);
}

// the open sea: shallows over sand going to deep blue, rollers coming in, the swash and its foam, sun glints
function sea(g, S, X0, Y0, W, H, area, rng, D) {
  const C = S.seaC, E = along(C, 0), P = tracePath(S.sea);
  g.save(); g.clip(P);
  g.fillStyle = SEA[SEA.length - 1][1]; g.fillRect(X0, Y0, W, H);
  for (let d = 840; d >= 6; d -= d > 240 ? 24 : 10) { g.strokeStyle = ramp(SEA, d); g.lineWidth = d * 2; g.stroke(E); }
  // sand bars showing through the shallows, and darker weed beds further out
  for (const c of C) for (let i = 0; i < c.length; i += 9) {
    if (rng() < 0.45) continue;
    const q = c[i], o = 30 + rng() * 120, x = q.x + q.nx * o, y = q.y + q.ny * o, r = 26 + rng() * 50;
    g.fillStyle = radial(g, x, y, 0, x, y, r, [[0, alpha('#d9f6e6', 0.22)], [1, alpha('#d9f6e6', 0)]]); g.fillRect(x - r, y - r, r * 2, r * 2);
    if (rng() < 0.35) { const o2 = 260 + rng() * 300, x2 = q.x + q.nx * o2, y2 = q.y + q.ny * o2, r2 = 50 + rng() * 80; g.fillStyle = radial(g, x2, y2, 0, x2, y2, r2, [[0, alpha('#0f4f73', 0.18)], [1, alpha('#0f4f73', 0)]]); g.fillRect(x2 - r2, y2 - r2, r2 * 2, r2 * 2); }
  }
  // rollers parallel to the beach, swelling in and fading along their length
  [[62, 0.55, 1.0], [136, 0.36, 0.85], [228, 0.22, 0.7], [340, 0.13, 0.6]].forEach(([d, a, wk], k) => {
    for (const c of C) for (let i = 1; i < c.length; i++) {
      const p = c[i - 1], q = c[i], f = Math.sin(q.s / (70 + k * 19) + k * 2.1) * 0.6 + Math.sin(q.s / 23 + k) * 0.4;
      if (f < 0.05) continue;
      const o = s0 => d + 9 * Math.sin(s0 / (90 + k * 23) + k * 1.7), op = o(p.s), oq = o(q.s), seg = (dd, col, lw) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(p.x + p.nx * (op + dd), p.y + p.ny * (op + dd)); g.lineTo(q.x + q.nx * (oq + dd), q.y + q.ny * (oq + dd)); g.stroke(); };
      seg(6, alpha('#0e5578', 0.1 * f), 5 * wk);
      seg(0, alpha('#ffffff', a * 0.35 * f), 7 * wk * f + 1);
      seg(-1, alpha('#ffffff', a * f), 2 * wk);
    }
  });
  // the swash: the last of a wave running up the sand, lacy at its edge, a band of fizz behind it
  const sw = q => 13 + 6 * Math.sin(q.s / 47) + 4 * Math.sin(q.s / 17 + 1);
  g.fillStyle = alpha('#ffffff', 0.32); g.fill(bandAlong(C, () => -4, q => sw(q) + 16 + 8 * Math.sin(q.s / 29)));
  g.fillStyle = alpha('#ffffff', 0.9); g.fill(bandAlong(C, () => -6, sw));
  if (D > 0.5) for (const c of C) for (let i = 0; i < c.length; i++) for (let k = 0; k < 2; k++) {   // fizz: bubbles of foam
    const q = c[i], o = sw(q) + 2 + rng() * 22, r = 0.8 + rng() * 2.2, x = q.x + q.nx * o + (rng() - 0.5) * 12, y = q.y + q.ny * o + (rng() - 0.5) * 12;
    circ(g, x, y, r); g.fillStyle = alpha('#ffffff', 0.35 + rng() * 0.4); g.fill();
  }
  // sun glints on the water
  if (D > 0.5) for (let i = 0; i < area / 2600; i++) {
    const x = X0 + rng() * W, y = Y0 + rng() * H; if (!inPoly(S.sea, x, y) || S.seaDist(x, y) < 90) continue;
    const l = 4 + rng() * 9; g.strokeStyle = alpha('#ffffff', 0.18 + rng() * 0.32); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x - l / 2, y); g.quadraticCurveTo(x, y - 2, x + l / 2, y); g.stroke();
  }
  g.restore();
  // rocks out in the shallows, the surf round them
  for (const c of C) for (let i = 20; i < c.length; i += 37) {
    if (rng() < 0.5) continue;
    const q = c[i], o = 40 + rng() * 110, x = q.x + q.nx * o, y = q.y + q.ny * o, r = 10 + rng() * 14;
    if (S.crabDist(x, y) < 260) continue;
    circ(g, x + 2, y + 2, r * 1.9); g.fillStyle = alpha('#ffffff', 0.25); g.fill();
    g.strokeStyle = alpha('#ffffff', 0.75); g.lineWidth = 2.4; g.setLineDash([8, 5]); circ(g, x, y, r * 1.35); g.stroke(); g.setLineDash([]);
    boulder(g, x, y, r, rng, true);
  }
}

// the harbour: the quay first (the water covers its far half), the basin, the coping with bollards
function quay(g, S, X0, Y0, W, H, rng, D) {
  const C = S.harC, E = along(C, 0), P = tracePath(S.harbour);
  g.strokeStyle = alpha('#6b5a42', 0.25); g.lineWidth = PROM * 2 + 10; g.stroke(E);   // the kerb where the paving meets the sand
  g.strokeStyle = '#d8ccb4'; g.lineWidth = PROM * 2; g.stroke(E);
  if (D > 0.5) {   // flagstones: rows along the quay, joints across
    for (const a of [PROM - 16, PROM - 32, PROM - 46]) { g.strokeStyle = alpha('#9c8f78', 0.6); g.lineWidth = a * 2 + 1.2; g.stroke(E); g.strokeStyle = '#d8ccb4'; g.lineWidth = a * 2 - 1.2; g.stroke(E); }
    g.lineCap = 'butt'; g.strokeStyle = alpha('#9c8f78', 0.5); g.lineWidth = PROM * 2; g.setLineDash([1.2, 26]); g.stroke(E); g.setLineDash([]); g.lineCap = 'round';
  }
  g.save(); g.clip(P);
  g.fillStyle = HARB[HARB.length - 1][1]; g.fillRect(X0, Y0, W, H);
  for (let d = 540; d >= 4; d -= d > 160 ? 20 : 8) { g.strokeStyle = ramp(HARB, d); g.lineWidth = d * 2; g.stroke(E); }
  g.strokeStyle = alpha('#0b3640', 0.35); g.lineWidth = 22; g.stroke(E);   // the quay wall's foot, in the shade, weed on it
  g.strokeStyle = alpha('#3f6f45', 0.35); g.lineWidth = 9; g.stroke(E);
  if (D > 0.5) for (let i = 0; i < 900; i++) {   // ripples
    const c = C[Math.floor(rng() * C.length)], q = c[Math.floor(rng() * c.length)], o = 30 + rng() * 420, x = q.x + q.nx * o + (rng() - 0.5) * 60, y = q.y + q.ny * o;
    g.strokeStyle = alpha('#ffffff', 0.08 + rng() * 0.16); g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 7, y - 3, x + 14, y); g.stroke();
  }
  g.restore();
  coping(g, S);
  // bollards, set back on the quay (not where a pier starts)
  for (const c of C) for (let i = 4; i < c.length - 4; i += 9) {
    const q = c[i], x = q.x - q.nx * 14, y = q.y - q.ny * 14;
    if (S.piers.some(p => Math.hypot(p.x - x, p.y - y) < 50) || S.town && x > S.town[0] - 20 && x < S.town[2] + 20 && y < S.town[3] + 20) continue;
    circ(g, x + 2, y + 3, 5.5); g.fillStyle = 'rgba(30,25,20,0.3)'; g.fill(); circ(g, x, y, 5.5); g.fillStyle = '#2d3035'; g.fill(); circ(g, x - 1.5, y - 1.5, 2.4); g.fillStyle = '#7a8088'; g.fill();
    if ((i / 9) % 4 === 1) { g.strokeStyle = '#d8c9a0'; g.lineWidth = 1.4; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.stroke(); }   // a rope round it
  }
  // fishing boats moored along the quay, and a couple at anchor out in the basin
  for (const c of C) for (let i = 10; i < c.length - 10; i += 14) {
    if (rng() < 0.62) continue;
    const q = c[i], l = 72 + rng() * 34, x = q.x + q.nx * (22 + l * 0.2), y = q.y + q.ny * (22 + l * 0.2);
    if (S.piers.some(p => Math.hypot(p.x - x, p.y - y) < 90) || !inPoly(S.harbour, x + q.nx * 20, y + q.ny * 20)) continue;
    const rot = Math.atan2(q.ny, q.nx) + Math.PI / 2 * (rng() < 0.5 ? 1 : -1);
    g.strokeStyle = '#e0d2a8'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(q.x - q.nx * 12, q.y - q.ny * 12); g.lineTo(x - q.nx * l * 0.12 + Math.cos(rot) * l * 0.3, y - q.ny * l * 0.12 + Math.sin(rot) * l * 0.3); g.stroke();
    fishingBoat(g, x, y, l, rot, rng);
  }
}

// the coping: big dressed stones along the quay's edge
function coping(g, S) {
  const C = S.harC;
  g.strokeStyle = '#8c8475'; g.lineWidth = 16; g.stroke(along(C, 0));
  g.strokeStyle = '#e4ddcc'; g.lineWidth = 11; g.stroke(along(C, -1));
  g.lineCap = 'butt'; g.strokeStyle = alpha('#8c8475', 0.8); g.lineWidth = 11; g.setLineDash([1.4, 30]); g.stroke(along(C, -1)); g.setLineDash([]); g.lineCap = 'round';
}
// a wooden pier out into the basin: its shadow on the water, piles, a plank deck, a lamp on the end; boats along it
function pier(g, p, rng, D) {
  const { x, y, ux, uy, l, w } = p, rot = Math.atan2(uy, ux);
  g.save(); g.translate(x, y); g.rotate(rot);
  // (in the pier's frame: +x out along it, +y across)
  const [lx, ly] = litDir(rot), sx = -lx * 12, sy = -ly * 12;
  g.fillStyle = 'rgba(8,40,52,0.35)'; g.fillRect(sx, -w / 2 + sy, l, w);   // its shadow on the water
  for (let d = 14; d < l; d += 34) for (const s of [-1, 1]) { circ(g, d, s * (w / 2 + 1), 4.2); g.fillStyle = '#4a3624'; g.fill(); circ(g, d - lx * 1.2, s * (w / 2 + 1) - ly * 1.2, 2.4); g.fillStyle = '#8a6a48'; g.fill(); }
  g.fillStyle = '#9b7652'; g.fillRect(0, -w / 2, l, w);
  for (let d = 0; d < l; d += 6) { const k = Math.sin(d * 12.9898) * 43758.5453 % 1; g.fillStyle = shade('#b48c63', (k - 0.5) * 0.18); g.fillRect(d + 0.6, -w / 2 + 1, 4.8, w - 2); }   // planks, each a touch different
  g.fillStyle = alpha('#5b4129', 0.85); g.fillRect(0, -w / 2, l, 2.4); g.fillRect(0, w / 2 - 2.4, l, 2.4);   // the stringers along its edges
  // the end: a lamp post and a life ring
  circ(g, l - 8, -w / 2 + 6, 3.4); g.fillStyle = '#2d3035'; g.fill(); circ(g, l - 8, -w / 2 + 6, 6.5); g.fillStyle = alpha('#ffe8a8', 0.45); g.fill(); circ(g, l - 8, -w / 2 + 6, 2.6); g.fillStyle = '#fff3c4'; g.fill();
  g.lineWidth = 3.4; g.strokeStyle = '#e8562a'; circ(g, l - 14, w / 2 - 7, 5); g.stroke(); g.strokeStyle = '#ffffff'; g.setLineDash([3, 4.85]); circ(g, l - 14, w / 2 - 7, 5); g.stroke(); g.setLineDash([]);
  // on the deck: lobster pots, a crate, a coil of rope
  if (D > 0.5) {
    const d0 = 30 + rng() * (l - 80);
    pot(g, d0, -w * 0.18, 7, 0.1); pot(g, d0 + 15, -w * 0.15, 7, -0.1);
    coil(g, d0 + 32, w * 0.2, 5);
    crate(g, d0 - 16, w * 0.16, 7, 0.1, rng);
  }
  g.restore();
  // boats tied up either side
  for (const s of [-1, 1]) for (const f of [0.38, 0.78]) {
    if (rng() < 0.3) continue;
    const bl = 70 + rng() * 30, o = w / 2 + bl * 0.19 + 5, d = l * f, bx = x + ux * d - uy * s * o, by = y + uy * d + ux * s * o;
    fishingBoat(g, bx, by, bl, rot + (rng() < 0.5 ? 0 : Math.PI), rng);
  }
}

// a fishing boat from above, bow along `rot`
const HULLS = ['#c8432f', '#2f6fa8', '#2e8b6a', '#e2b33c', '#f2efe6', '#3b5f8f'];
export function fishingBoat(g, x, y, l, rot, rng, hullCol) {
  const col = hullCol || HULLS[Math.floor(rng() * HULLS.length)], w = l * 0.34, deck = ['#b48d62', '#c9a476', '#8fb0b8', '#c98a6a'][Math.floor(rng() * 4)], roof = ['#f4f1ea', '#f4f1ea', '#e8562a', '#2f6fa8', '#f2c94c'][Math.floor(rng() * 5)];
  ell(g, x + 6, y + 8, l * 0.52, w * 0.62, rot); g.fillStyle = 'rgba(6,36,50,0.3)'; g.fill();   // shadow
  ell(g, x, y, l * 0.58, w * 0.72, rot); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fill();     // the ripple ring round it
  g.save(); g.translate(x, y); g.rotate(rot);
  const [lx, ly] = litDir(rot);
  const hull = (k) => { const L = l * k, Wd = w * k; g.beginPath(); g.moveTo(L * 0.5, 0); g.bezierCurveTo(L * 0.42, -Wd * 0.48, L * 0.05, -Wd * 0.52, -L * 0.3, -Wd * 0.49); g.lineTo(-L * 0.47, -Wd * 0.4); g.lineTo(-L * 0.47, Wd * 0.4); g.lineTo(-L * 0.3, Wd * 0.49); g.bezierCurveTo(L * 0.05, Wd * 0.52, L * 0.42, Wd * 0.48, L * 0.5, 0); g.closePath(); };
  hull(1); g.fillStyle = linear(g, lx * w * 0.5, ly * w * 0.5, -lx * w * 0.5, -ly * w * 0.5, [[0, shade(col, 0.28)], [0.5, col], [1, shade(col, -0.35)]]); g.fill();
  hull(0.9); g.fillStyle = col === '#f2efe6' ? '#c9c0ad' : '#f1ece0'; g.fill();   // the gunwale's top (cream)
  hull(0.84); g.fillStyle = deck; g.fill();   // the deck
  g.save(); hull(0.84); g.clip(); g.strokeStyle = alpha(shade(deck, -0.4), 0.45); g.lineWidth = 0.8; for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(-l * 0.5, k * w * 0.1); g.lineTo(l * 0.5, k * w * 0.1); g.stroke(); } g.restore();
  // nets aft, with floats
  const nx = -l * 0.3; ell(g, nx, 0, l * 0.11, w * 0.3); g.fillStyle = '#3e6b5c'; g.fill();
  g.strokeStyle = alpha('#9cc9b2', 0.5); g.lineWidth = 0.7; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(nx - l * 0.1, k * w * 0.1); g.lineTo(nx + l * 0.1, k * w * 0.1 + 2); g.stroke(); }
  for (let k = 0; k < 4; k++) { circ(g, nx + (k - 1.5) * l * 0.045, (k % 2 ? 1 : -1) * w * 0.17, l * 0.018 + 0.6); g.fillStyle = '#ff8a2a'; g.fill(); }
  // the wheelhouse: white walls showing under a roof, windows forward
  const hx0 = -l * 0.12, hx1 = l * 0.1, hy = w * 0.27;
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(hx0 - lx * 3, -hy - ly * 3, hx1 - hx0, hy * 2);
  g.fillStyle = '#f4f1ea'; g.fillRect(hx0, -hy, hx1 - hx0, hy * 2);
  g.fillStyle = '#25384d'; g.fillRect(hx1 - 2.4, -hy + 2, 2.4, hy * 2 - 4);
  g.fillStyle = linear(g, lx * hy, ly * hy, -lx * hy, -ly * hy, [[0, shade(roof, 0.25)], [1, shade(roof, -0.2)]]); g.fillRect(hx0 + 1.5, -hy + 1.5, hx1 - hx0 - 5, hy * 2 - 3);
  // mast forward, the boom along the deck, a crate of fish
  circ(g, l * 0.22, 0, 2.2); g.fillStyle = '#4a3624'; g.fill();
  g.strokeStyle = '#4a3624'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(l * 0.22, 0); g.lineTo(l * 0.38, 0); g.stroke();
  g.fillStyle = '#2f7fc1'; g.fillRect(l * 0.27, -w * 0.2, l * 0.08, w * 0.17); g.fillStyle = '#d9e4ea'; ell(g, l * 0.31, -w * 0.115, l * 0.03, w * 0.05); g.fill();
  g.restore();
}
// a rowing boat pulled up on the sand: its shadow, the hull, the planking inside, two thwarts and the oars across them
export function rowingBoat(g, x, y, l, rot, col) {
  const w = l * 0.42;
  ell(g, x + 5, y + 7, l * 0.5, w * 0.55, rot); g.fillStyle = 'rgba(60,40,15,0.3)'; g.fill();
  g.save(); g.translate(x, y); g.rotate(rot);
  const [lx, ly] = litDir(rot);
  const hull = k => { const L = l * k, Wd = w * k; g.beginPath(); g.moveTo(L * 0.5, 0); g.bezierCurveTo(L * 0.35, -Wd * 0.55, -L * 0.25, -Wd * 0.55, -L * 0.44, -Wd * 0.34); g.lineTo(-L * 0.44, Wd * 0.34); g.bezierCurveTo(-L * 0.25, Wd * 0.55, L * 0.35, Wd * 0.55, L * 0.5, 0); g.closePath(); };
  hull(1); g.fillStyle = linear(g, lx * w * 0.5, ly * w * 0.5, -lx * w * 0.5, -ly * w * 0.5, [[0, shade(col, 0.3)], [0.5, col], [1, shade(col, -0.35)]]); g.fill();
  hull(0.84); g.fillStyle = '#f1ece0'; g.fill();
  hull(0.76); g.fillStyle = linear(g, -lx * w * 0.4, -ly * w * 0.4, lx * w * 0.4, ly * w * 0.4, [[0, '#c79a68'], [1, '#8f6a45']]); g.fill();   // inside: the side toward the light is in shade
  g.save(); hull(0.76); g.clip(); g.strokeStyle = alpha('#6b4c2e', 0.4); g.lineWidth = 0.7; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(-l * 0.5, k * w * 0.12); g.lineTo(l * 0.5, k * w * 0.12); g.stroke(); } g.restore();
  g.fillStyle = '#a77b4f'; for (const t of [-0.12, 0.14]) g.fillRect(l * t, -w * 0.36, l * 0.07, w * 0.72);
  g.strokeStyle = '#d9b27c'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(-l * 0.3, -w * 0.12); g.lineTo(l * 0.36, -w * 0.2); g.moveTo(-l * 0.3, w * 0.12); g.lineTo(l * 0.36, w * 0.2); g.stroke();
  g.fillStyle = '#d9b27c'; ell(g, l * 0.36, -w * 0.2, l * 0.06, w * 0.06, -0.1); g.fill(); ell(g, l * 0.36, w * 0.2, l * 0.06, w * 0.06, 0.1); g.fill();
  g.restore();
}

// the mole: a rubble breakwater out into the harbour, a paved walk along its top, the lighthouse on its end
function mole(g, S, rng, D) {
  const [[ax, ay], [bx, by]] = S.mole, l = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / l, uy = (by - ay) / l, nx = -uy, ny = ux;
  // its shadow on the water, then the armour stones down both sides
  const a2x = ax + ux * 34, a2y = ay + uy * 34;   // (clear of the quay)
  g.strokeStyle = 'rgba(8,40,52,0.3)'; g.lineWidth = 92; g.lineCap = 'butt'; g.beginPath(); g.moveTo(a2x + 10, a2y + 14); g.lineTo(bx + 10, by + 14); g.stroke();
  g.strokeStyle = alpha('#ffffff', 0.35); g.lineWidth = 100; g.setLineDash([22, 14]); g.beginPath(); g.moveTo(a2x, a2y); g.lineTo(bx, by); g.stroke(); g.setLineDash([]); g.lineCap = 'round';   // surf on the stones
  for (let d = 26; d <= l; d += 15) for (const s of [-1, 1]) boulder(g, ax + ux * d + nx * s * (30 + rng() * 10), ay + uy * d + ny * s * (30 + rng() * 10), 11 + rng() * 7, rng, true);
  g.lineCap = 'butt';
  g.strokeStyle = '#a99f8f'; g.lineWidth = 44; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
  g.strokeStyle = '#cfc6b4'; g.lineWidth = 36; g.beginPath(); g.moveTo(ax - nx * 1.5, ay - ny * 1.5); g.lineTo(bx - nx * 1.5, by - ny * 1.5); g.stroke();
  g.strokeStyle = alpha('#8a8170', 0.55); g.lineWidth = 1.1; for (let d = 12; d < l; d += 20) { g.beginPath(); g.moveTo(ax + ux * d - nx * 18, ay + uy * d - ny * 18); g.lineTo(ax + ux * d + nx * 18, ay + uy * d + ny * 18); g.stroke(); }
  g.lineCap = 'round';
  // a railing along the seaward side, lamp posts
  g.strokeStyle = alpha('#3a3d42', 0.8); g.lineWidth = 1.6; g.beginPath(); g.moveTo(ax + nx * 15, ay + ny * 15); g.lineTo(bx + nx * 15 - ux * 40, by + ny * 15 - uy * 40); g.stroke();
  for (let d = 60; d < l - 60; d += 110) { const x = ax + ux * d - nx * 14, y = ay + uy * d - ny * 14; circ(g, x + 2, y + 3, 3); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill(); circ(g, x, y, 3); g.fillStyle = '#2d3035'; g.fill(); circ(g, x, y, 1.6); g.fillStyle = '#fff1c2'; g.fill(); }
  lighthouse(g, bx, by, rng);
}
// the lighthouse from above, its long shadow down-right, a faint beam
function lighthouse(g, x, y, rng) {
  for (let k = 0; k < 18; k++) { const a = k / 18 * TAU + rng() * 0.3, d = 52 + rng() * 14; boulder(g, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.9, 12 + rng() * 8, rng, true); }
  circ(g, x, y, 54); g.fillStyle = '#a69c8b'; g.fill(); circ(g, x - 3, y - 4, 49); g.fillStyle = '#d3cab8'; g.fill();
  g.strokeStyle = alpha('#9a907f', 0.6); g.lineWidth = 1; for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; g.beginPath(); g.moveTo(x - 3 + Math.cos(a) * 30, y - 4 + Math.sin(a) * 30); g.lineTo(x - 3 + Math.cos(a) * 49, y - 4 + Math.sin(a) * 49); g.stroke(); }
  g.strokeStyle = 'rgba(20,30,40,0.3)'; g.lineWidth = 50; g.beginPath(); g.moveTo(x + 6, y + 8); g.lineTo(x + 6 + 0.6 * 170, y + 8 + 0.8 * 170); g.stroke();   // the tower's shadow
  g.strokeStyle = 'rgba(20,30,40,0.18)'; g.lineWidth = 64; g.beginPath(); g.moveTo(x + 0.6 * 160, y + 0.8 * 160); g.lineTo(x + 0.6 * 176, y + 0.8 * 176); g.stroke();
  const R = 27;
  circ(g, x, y, R); g.fillStyle = radial(g, x - R * 0.45, y - R * 0.5, 2, x, y, R, [[0, '#ffffff'], [0.7, '#ece7dc'], [1, '#bdb6a8']]); g.fill();
  circ(g, x, y, R * 0.92); g.strokeStyle = '#d23a2c'; g.lineWidth = R * 0.18; g.stroke();
  circ(g, x, y, R * 0.66); g.fillStyle = '#2f3338'; g.fill();   // the gallery
  g.fillStyle = '#e9e5dc'; for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; circ(g, x + Math.cos(a) * R * 0.62, y + Math.sin(a) * R * 0.62, 1.1); g.fill(); }
  circ(g, x, y, R * 0.48); g.fillStyle = radial(g, x, y, 1, x, y, R * 0.48, [[0, '#fffbe0'], [0.6, '#ffe27a'], [1, '#e8a93a']]); g.fill();   // the lantern
  circ(g, x, y, R * 0.3); g.fillStyle = radial(g, x - R * 0.1, y - R * 0.12, 1, x, y, R * 0.3, [[0, '#ff8a73'], [0.6, '#d23a2c'], [1, '#8f2219']]); g.fill();   // its cap
  circ(g, x, y, R * 0.06); g.fillStyle = '#2f3338'; g.fill();
  g.fillStyle = radial(g, x, y, R * 0.5, x, y, R * 2.6, [[0, 'rgba(255,240,170,0.35)'], [1, 'rgba(255,240,170,0)']]); circ(g, x, y, R * 2.6); g.fill();
}

// the corner of the harbour town: square, cottages, well, lamps, the fish market
function town(g, S, rng, D) {
  const [x0, y0, x1, y1] = S.town, w = x1 - x0, h = y1 - y0, H2 = h + PROM + 18;
  g.fillStyle = alpha('#6b5a42', 0.25); g.beginPath(); g.roundRect(x0 - 4, y0 - 4, w + 8, H2 + 8, 18); g.fill();
  g.fillStyle = '#cbbb9c'; g.beginPath(); g.roundRect(x0, y0, w, H2, 16); g.fill();
  if (D > 0.5) for (let y = y0 + 5; y < y0 + H2 - 4; y += 9) for (let x = x0 + 5 + (Math.round((y - y0) / 9) % 2) * 5; x < x1 - 4; x += 10) {   // cobbles
    ell(g, x, y, 4.3, 3.5); g.fillStyle = shade('#cbbb9c', (rng() - 0.5) * 0.16); g.fill();
    ell(g, x - 1, y - 1, 2, 1.4); g.fillStyle = alpha('#ffffff', 0.2); g.fill();
  }
  const roofs = ['#c8553d', '#b8433a', '#5a7894', '#d48a3a', '#4d8a7a', '#c8553d', '#9a5a4a'];
  // the back row along the top, then a row down the left side, a yard behind some of them
  const lots = [];
  for (let x = x0 + 10; x < x1 - 70;) { const hw = 70 + rng() * 22; if (x + hw > x1 - 10) break; lots.push([x, y0 + 10 + rng() * 6, hw, 54 + rng() * 8]); x += hw + 10 + rng() * 16; }
  for (let y = y0 + 96; y < y1 - 30;) { const hh = 62 + rng() * 22; if (y + hh > y0 + H2 - 16) break; lots.push([x0 + 10 + rng() * 6, y, 54 + rng() * 6, hh]); y += hh + 10 + rng() * 12; }
  for (const [x, y, hw, hh] of lots) cottage(g, x, y, hw, hh, roofs[Math.floor(rng() * roofs.length)], rng);
  // the square: the fish market by the quay, a well, trees, lamps, barrels and a net drying
  market(g, x1 - 60, y1 + PROM * 0.25, rng);
  if (D > 0.5) {
    const sx = x0 + w * 0.55, sy = y0 + h * 0.56;
    circ(g, sx + 3, sy + 4, 13); g.fillStyle = 'rgba(30,25,20,0.3)'; g.fill(); circ(g, sx, sy, 13); g.fillStyle = '#a0968a'; g.fill(); circ(g, sx - 1, sy - 1, 11); g.fillStyle = '#c8bfb2'; g.fill(); circ(g, sx, sy, 7.5); g.fillStyle = '#1f4f5c'; g.fill(); circ(g, sx - 2, sy - 2, 2.4); g.fillStyle = alpha('#ffffff', 0.5); g.fill();   // the well
    for (const [tx, ty, tr] of [[x0 + w * 0.3, y0 + h * 0.8, 22], [x0 + w * 0.82, y0 + h * 0.5, 19]]) { ell(g, tx + tr * 0.45, ty + tr * 0.55, tr * 1.05, tr * 0.85); g.fillStyle = 'rgba(20,30,15,0.28)'; g.fill(); canopy(g, tx, ty, tr, ['#3d6e34', '#58913f', '#82b85a'], rng); }
    for (const [lx, ly] of [[x0 + w * 0.42, y1 - 4], [x1 - 14, y0 + h * 0.3]]) { circ(g, lx + 2, ly + 3, 3); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill(); circ(g, lx, ly, 6); g.fillStyle = alpha('#ffe8a8', 0.35); g.fill(); circ(g, lx, ly, 3); g.fillStyle = '#2d3035'; g.fill(); circ(g, lx, ly, 1.6); g.fillStyle = '#fff3c4'; g.fill(); }
    for (let k = 0; k < 3; k++) { const cx = x1 - 34, cy = y0 + h * 0.42 + k * 40; for (const [dx, dy] of [[-12, 4], [12, -2]]) { circ(g, cx + dx + 1, cy + dy + 2, 4); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fill(); circ(g, cx + dx, cy + dy, 4); g.fillStyle = '#5a7894'; g.fill(); } umbrella(g, cx, cy, 13, rng); }   // the café's tables under parasols
    for (let k = 0; k < 3; k++) barrel(g, x0 + w * 0.3 + k * 13, y1 + 18 + (k % 2) * 8, 6);
    net(g, x0 + w * 0.6, y1 + 30, 30, 15, rng);
    pot(g, x1 - 132, y1 + 30, 8, 0.2); pot(g, x1 - 118, y1 + 36, 8, -0.1); pot(g, x1 - 125, y1 + 20, 8, 0.05); coil(g, x1 - 148, y1 + 38, 6);
  }
}
// a cottage from above: a hipped roof, each face lit by how it faces the light
function cottage(g, x, y, w, h, col, rng) {
  g.fillStyle = 'rgba(40,30,20,0.3)'; g.fillRect(x + 9, y + 12, w, h);
  g.fillStyle = shade(col, -0.5); g.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
  const long = w >= h, r = Math.min(w, h) / 2, cx = x + w / 2, cy = y + h / 2;
  const a = long ? [x + r, cy] : [cx, y + r], b = long ? [x + w - r, cy] : [cx, y + h - r];   // the ridge
  const faces = [[[x, y], [x + w, y], b, a, [0, -1]], [[x + w, y], [x + w, y + h], b, [1, 0]], [[x + w, y + h], [x, y + h], a, b, [0, 1]], [[x, y + h], [x, y], a, [-1, 0]]];
  if (!long) { faces[0] = [[x, y], [x + w, y], a, [0, -1]]; faces[1] = [[x + w, y], [x + w, y + h], b, a, [1, 0]]; faces[2] = [[x + w, y + h], [x, y + h], b, [0, 1]]; faces[3] = [[x, y + h], [x, y], a, b, [-1, 0]]; }
  for (const f of faces) {
    const pts = f.slice(0, -1), [nx, ny] = f[f.length - 1], lit = -0.6 * nx - 0.8 * ny;
    poly(g, pts); g.fillStyle = shade(col, lit * 0.22); g.fill();
    g.save(); poly(g, pts); g.clip(); g.strokeStyle = alpha(shade(col, -0.45), 0.35); g.lineWidth = 1;   // courses of tiles, along the eave
    for (let k = 5; k < r; k += 5) { g.beginPath(); if (nx) { const ex = nx > 0 ? x + w - k : x + k; g.moveTo(ex, y); g.lineTo(ex, y + h); } else { const ey = ny > 0 ? y + h - k : y + k; g.moveTo(x, ey); g.lineTo(x + w, ey); } g.stroke(); }
    g.restore();
  }
  g.strokeStyle = shade(col, 0.32); g.lineWidth = 2.2; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.moveTo(x, y); g.lineTo(...a); g.lineTo(x, y + h); g.moveTo(x + w, y); g.lineTo(...b); g.lineTo(x + w, y + h); g.stroke();
  const chx = long ? x + w * (0.3 + rng() * 0.4) : cx + r * 0.35, chy = long ? cy + r * 0.35 : y + h * (0.3 + rng() * 0.4);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(chx + 3, chy + 4, 9, 9); g.fillStyle = '#9a8a7a'; g.fillRect(chx, chy, 9, 9); g.fillStyle = '#c4b5a3'; g.fillRect(chx, chy, 9, 2.5); g.fillStyle = '#2b2622'; g.fillRect(chx + 2.5, chy + 3, 4, 4);
}
// the fish market stall: a striped awning over the counter, its scalloped front, crates of the catch on ice
function market(g, x, y, rng) {
  const w = 86, h = 46;
  g.fillStyle = 'rgba(40,30,20,0.3)'; g.fillRect(x - w / 2 + 9, y - h / 2 + 12, w, h);
  for (let k = 0; k < 7; k++) { g.fillStyle = k % 2 ? '#f6f2e8' : '#2f78c4'; g.fillRect(x - w / 2 + k * w / 7, y - h / 2, w / 7 + 0.5, h); }
  g.fillStyle = linear(g, 0, y - h / 2, 0, y + h / 2, [[0, 'rgba(255,255,255,0.22)'], [0.48, 'rgba(255,255,255,0)'], [0.52, 'rgba(0,0,0,0.08)'], [1, 'rgba(0,0,0,0.2)']]); g.fillRect(x - w / 2, y - h / 2, w, h);
  for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(x - w / 2 + (k + 0.5) * w / 7, y + h / 2, w / 14, 0, Math.PI); g.fillStyle = k % 2 ? '#f6f2e8' : '#2f78c4'; g.fill(); }
  for (let k = 0; k < 3; k++) {   // crates of fish on ice in front
    const cx = x - w / 2 + 12 + k * 30, cy = y + h / 2 + 18;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(cx - 11 + 2, cy - 8 + 3, 24, 17); g.fillStyle = '#2f7fc1'; g.fillRect(cx - 11, cy - 8, 24, 17); g.fillStyle = '#e8f3f7'; g.fillRect(cx - 9, cy - 6, 20, 13);
    for (let j = 0; j < 4; j++) { ell(g, cx + 1 + (j % 2 ? 4 : -4), cy - 3 + j * 2.4, 6, 1.8, j % 2 ? 0.2 : -0.2); g.fillStyle = j % 2 ? '#9fb3bf' : '#c9d6dd'; g.fill(); }
    if (k === 1) { ell(g, cx + 1, cy, 5, 3.5); g.fillStyle = '#e8562a'; g.fill(); }   // a crab in this one
  }
}
const barrel = (g, x, y, r) => { circ(g, x + 2, y + 3, r); g.fillStyle = 'rgba(30,25,20,0.3)'; g.fill(); circ(g, x, y, r); g.fillStyle = '#7a5434'; g.fill(); circ(g, x, y, r * 0.78); g.fillStyle = '#a3754a'; g.fill(); circ(g, x, y, r); g.strokeStyle = '#3d3a36'; g.lineWidth = 1.2; g.stroke(); circ(g, x - r * 0.3, y - r * 0.3, r * 0.25); g.fillStyle = alpha('#ffffff', 0.2); g.fill(); };
function net(g, x, y, w, h, rng) {   // a fishing net spread out to dry, floats along its edge
  const pts = blob(rng, x, y, w, 12, h / w, 0.35);
  smooth(g, scaled(pts, x, y, 1, 4, 5)); g.fillStyle = 'rgba(30,25,20,0.18)'; g.fill();
  smooth(g, pts); g.fillStyle = alpha('#3e6b5c', 0.75); g.fill();
  g.save(); smooth(g, pts); g.clip(); g.strokeStyle = alpha('#a8d1bd', 0.55); g.lineWidth = 0.8;
  for (let k = -w; k < w; k += 5) { g.beginPath(); g.moveTo(x + k, y - h); g.lineTo(x + k + h, y + h); g.moveTo(x + k + h, y - h); g.lineTo(x + k, y + h); g.stroke(); }
  g.restore();
  pts.forEach(([px, py], i) => { if (i % 2) return; circ(g, px, py, 2.6); g.fillStyle = '#ff8a2a'; g.fill(); });
}
// a lobster pot from above (a creel): a rounded cage, its hoops lit across the netting, a rope handle
function pot(g, x, y, s, rot) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = 'rgba(30,22,14,0.3)'; g.beginPath(); g.roundRect(-s + 3, -s * 0.75 + 4, s * 2, s * 1.5, s * 0.5); g.fill();
  g.fillStyle = '#3f4a44'; g.beginPath(); g.roundRect(-s, -s * 0.75, s * 2, s * 1.5, s * 0.5); g.fill();
  g.strokeStyle = alpha('#c9d6cf', 0.45); g.lineWidth = 0.7; for (let k = -s; k < s; k += 3) { g.beginPath(); g.moveTo(k, -s * 0.7); g.lineTo(k + s * 0.4, s * 0.7); g.stroke(); }
  g.strokeStyle = '#c99d63'; g.lineWidth = s * 0.16; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * s * 0.42, -s * 0.72); g.lineTo(k * s * 0.42, s * 0.72); g.stroke(); }
  g.strokeStyle = '#e8c890'; g.lineWidth = s * 0.07; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * s * 0.42 - s * 0.03, -s * 0.72); g.lineTo(k * s * 0.42 - s * 0.03, -s * 0.05); g.stroke(); }
  g.strokeStyle = '#8a6a40'; g.lineWidth = s * 0.14; g.beginPath(); g.roundRect(-s, -s * 0.75, s * 2, s * 1.5, s * 0.5); g.stroke();
  g.restore();
}
const coil = (g, x, y, r) => { circ(g, x + 2, y + 2, r + 1); g.fillStyle = 'rgba(30,25,20,0.25)'; g.fill(); g.strokeStyle = '#c9b081'; g.lineWidth = 1.8; for (let k = 0; k < 3; k++) { circ(g, x, y, r * (0.35 + k * 0.3)); g.stroke(); } g.strokeStyle = '#e8d6a8'; g.lineWidth = 0.8; circ(g, x - 0.6, y - 0.6, r * 0.95); g.stroke(); };
function crate(g, x, y, s, rot, rng) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = 'rgba(30,22,14,0.3)'; g.fillRect(-s + 3, -s + 4, s * 2, s * 2);
  g.fillStyle = '#a77b4f'; g.fillRect(-s, -s, s * 2, s * 2); g.fillStyle = '#c99d6a'; for (let k = 0; k < 3; k++) g.fillRect(-s + 1, -s + 1 + k * s * 0.66, s * 2 - 2, s * 0.5);
  g.restore();
}
// a rounded boulder lit from the top left; `wet`: darker, with a green weed line at its foot
function boulder(g, x, y, r, rng, wet) {
  const pts = blob(rng, x, y, r, 9, 0.86, 0.35);
  smooth(g, scaled(pts, x, y, 1, r * 0.25 + 2, r * 0.32 + 3)); g.fillStyle = wet ? 'rgba(6,36,50,0.3)' : 'rgba(70,45,20,0.28)'; g.fill();
  if (wet) { smooth(g, scaled(pts, x, y, 1.08, 1, 2)); g.fillStyle = '#41502e'; g.fill(); }
  smooth(g, pts); g.fillStyle = wet ? '#544d46' : ROCK.dk; g.fill();
  smooth(g, scaled(pts, x, y, 0.8, -r * 0.1, -r * 0.13)); g.fillStyle = wet ? '#77706a' : ROCK.md; g.fill();
  ell(g, x - r * 0.32, y - r * 0.36, r * 0.32, r * 0.2, -0.5); g.fillStyle = wet ? alpha('#c9c3b8', 0.7) : ROCK.top; g.fill();
}

// rock shelves, mostly near the sea; weed round the ones by the water, tide pools in the bigger ones
function shelves(g, S, X0, Y0, W, H, area, rng, dist, free, D) {
  const placed = [];
  for (let i = 0; i < area / 9000 && placed.length < 26; i++) {
    const x = X0 + rng() * W, y = Y0 + rng() * H, r = 38 + rng() * 70, sd = S.sea.length ? S.seaDist(x, y) : 1e9;
    if (rng() > (sd < 380 ? 0.9 : 0.3)) continue;
    if (dist(x, y, r + 160) < r + 64 || !free(x, y, r) || S.crabDist(x, y) < r + 220 || S.wet(x + r, y) || S.wet(x - r, y) || S.wet(x, y + r * 0.8) || S.wet(x, y - r * 0.8) || placed.some(p => Math.hypot(p.x - x, p.y - y) < p.r + r + 30)) continue;
    placed.push({ x, y, r, sea: sd < 260 });
  }
  for (const { x, y, r, sea } of placed) shelf(g, x, y, r, rng, sea, D);
}
function shelf(g, x, y, r, rng, sea, D) {
  const a0 = rng() * TAU, pts = blob(rng, x, y, r, 13, 0.72, 0.38).map(([px, py]) => { const dx = px - x, dy = py - y; return [x + dx * Math.cos(a0 * 0.2) - dy * Math.sin(a0 * 0.2), y + dx * Math.sin(a0 * 0.2) + dy * Math.cos(a0 * 0.2)]; });
  smooth(g, scaled(pts, x, y, 1.02, 9, 12)); g.fillStyle = 'rgba(70,45,20,0.3)'; g.fill();   // shadow
  if (sea) {   // weed and a damp ring round the foot
    smooth(g, scaled(pts, x, y, 1.12, 2, 3)); g.fillStyle = alpha(SAND.wetDk, 0.45); g.fill();
    for (const [px, py] of pts) for (let k = 0; k < 3; k++) { ell(g, x + (px - x) * (1.03 + rng() * 0.06) + (rng() - 0.5) * 8, y + (py - y) * (1.03 + rng() * 0.06) + (rng() - 0.5) * 6, 4 + rng() * 5, 2.5 + rng() * 2, rng() * 3); g.fillStyle = ['#4d5a2a', '#6b6a2e', '#3f4f2c'][k]; g.fill(); }
  }
  smooth(g, pts); g.fillStyle = ROCK.dk; g.fill();
  const mid = scaled(pts, x, y, 0.9, -r * 0.05, -r * 0.07);
  smooth(g, mid); g.fillStyle = ROCK.md; g.fill();
  const top = scaled(pts, x, y, 0.66, -r * 0.13, -r * 0.16);
  smooth(g, top); g.fillStyle = ROCK.lt; g.fill();
  smooth(g, scaled(pts, x, y, 0.5, -r * 0.2, -r * 0.22)); g.fillStyle = alpha(ROCK.top, 0.6); g.fill();
  // strata: the edges of the layers, darker
  g.strokeStyle = alpha(ROCK.crack, 0.35); g.lineWidth = 1.4; smooth(g, mid); g.stroke(); smooth(g, top); g.stroke();
  // cracks
  g.strokeStyle = alpha(ROCK.crack, 0.55); g.lineWidth = 1.2;
  for (let k = 0; k < 3; k++) { let cx = x + (rng() - 0.5) * r, cy = y + (rng() - 0.5) * r * 0.6, a = rng() * TAU; g.beginPath(); g.moveTo(cx, cy); for (let j = 0; j < 3; j++) { a += rng() - 0.5; cx += Math.cos(a) * r * 0.18; cy += Math.sin(a) * r * 0.18; g.lineTo(cx, cy); } g.stroke(); }
  if (D > 0.5 && sea) for (let k = 0; k < r * 0.4; k++) { const a = rng() * TAU, d = r * (0.7 + rng() * 0.25); circ(g, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.72, 0.9 + rng() * 1.1); g.fillStyle = rng() < 0.65 ? '#e6dfd0' : '#2b2a33'; g.fill(); }   // barnacles and mussels
  if (r > 62) pool(g, x + (rng() - 0.5) * r * 0.25, y + (rng() - 0.5) * r * 0.15, r * 0.42, rng, D);
}
// a tide pool: the rim's shadow inside it on the near (top-left) side, clear water over a pale bottom, sky reflected
function pool(g, x, y, r, rng, D) {
  const pts = blob(rng, x, y, r, 10, 0.78, 0.3);
  smooth(g, scaled(pts, x, y, 1.12, -1, -1)); g.fillStyle = '#4e463d'; g.fill();
  smooth(g, pts); g.fillStyle = linear(g, x - r * 0.6, y - r * 0.6, x + r * 0.6, y + r * 0.6, [[0, '#145f6c'], [0.35, '#2a8f97'], [1, '#86d9cf']]); g.fill();
  g.save(); smooth(g, pts); g.clip();
  for (let k = 0; k < 6; k++) { ell(g, x + (rng() - 0.5) * r * 1.2, y + (rng() - 0.5) * r * 0.8, 3 + rng() * 4, 2 + rng() * 3, rng() * 3); g.fillStyle = alpha('#d8efe6', 0.25); g.fill(); }   // pebbles on the bottom
  for (let k = 0; k < 4; k++) { const a = rng() * TAU, ax = x + Math.cos(a) * r * 0.75, ay = y + Math.sin(a) * r * 0.55; g.strokeStyle = alpha('#5b9a3a', 0.8); g.lineWidth = 1.6; for (let j = 0; j < 4; j++) { const b = a + Math.PI + (j - 1.5) * 0.35; g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(ax + Math.cos(b + 0.3) * 6, ay + Math.sin(b + 0.3) * 6, ax + Math.cos(b) * 11, ay + Math.sin(b) * 11); g.stroke(); } }   // weed
  for (let k = 0; k < 2 + Math.floor(rng() * 2); k++) {   // anemones: a soft ring of tentacles round a mouth
    const a = rng() * TAU, d = rng() * r * 0.5, ax = x + Math.cos(a) * d, ay = y + Math.sin(a) * d * 0.7, ar = 3.5 + rng() * 3, col = ['#ff6f91', '#7ed957', '#ffb347', '#c38fd9'][Math.floor(rng() * 4)];
    circ(g, ax, ay, ar * 1.5); g.fillStyle = alpha(col, 0.35); g.fill();
    for (let j = 0; j < 10; j++) { const b = j / 10 * TAU; circ(g, ax + Math.cos(b) * ar * 1.15, ay + Math.sin(b) * ar * 1.15, ar * 0.32); g.fillStyle = col; g.fill(); }
    circ(g, ax, ay, ar * 0.55); g.fillStyle = shade(col, -0.35); g.fill(); circ(g, ax - ar * 0.2, ay - ar * 0.2, ar * 0.2); g.fillStyle = alpha('#ffffff', 0.5); g.fill();
  }
  const sa = rng() * TAU, sx = x + r * 0.35, sy = y - r * 0.05, ss = r * 0.3, scol = rng() < 0.6 ? '#ff7a3d' : '#9b59d0';   // a starfish
  star(g, sx + 1.5, sy + 2, ss, 5, 0.42, sa); g.fillStyle = 'rgba(0,30,40,0.3)'; g.fill();
  star(g, sx, sy, ss, 5, 0.42, sa); g.fillStyle = radial(g, sx - ss * 0.3, sy - ss * 0.3, 0, sx, sy, ss, [[0, shade(scol, 0.35)], [1, shade(scol, -0.15)]]); g.fill();
  for (let k = 0; k < 5; k++) { const b = sa + k / 5 * TAU; circ(g, sx + Math.cos(b) * ss * 0.5, sy + Math.sin(b) * ss * 0.5, ss * 0.07); g.fillStyle = alpha('#fff0d8', 0.8); g.fill(); }
  if (rng() < 0.6) { const ux = x - r * 0.4, uy = y + r * 0.2, ur = r * 0.13; g.strokeStyle = '#3d2257'; g.lineWidth = 1; for (let j = 0; j < 14; j++) { const b = j / 14 * TAU; g.beginPath(); g.moveTo(ux, uy); g.lineTo(ux + Math.cos(b) * ur * 1.6, uy + Math.sin(b) * ur * 1.6); g.stroke(); } circ(g, ux, uy, ur * 0.7); g.fillStyle = '#5b3480'; g.fill(); }   // an urchin
  g.restore();
  ell(g, x + r * 0.25, y - r * 0.2, r * 0.35, r * 0.1, -0.3); g.fillStyle = alpha('#ffffff', 0.32); g.fill();   // the sky in it
  g.strokeStyle = alpha('#d8cfbe', 0.5); g.lineWidth = 1.2; smooth(g, scaled(pts, x, y, 1.12, -1, -1)); g.stroke();
}

// the strandline: a ragged line of dried weed, shells and bits of driftwood where the high tide left them
function strandline(g, S, rng, dist) {
  for (const c of S.seaC) for (let i = 0; i < c.length; i++) {
    if (rng() < 0.35) continue;
    const q = c[i], o = -(96 + 18 * Math.sin(q.s / 140) + rng() * 22), x = q.x + q.nx * o, y = q.y + q.ny * o;
    if (dist(x, y, 80) < 50) continue;
    const t = rng();
    if (t < 0.7) { ell(g, x, y, 3 + rng() * 4, 1.4 + rng() * 1.4, rng() * 3); g.fillStyle = ['#5b5a2e', '#6e5a34', '#3f4a2a'][Math.floor(rng() * 3)]; g.fill(); }
    else if (t < 0.9) { circ(g, x, y, 1.6 + rng()); g.fillStyle = ['#fff3e6', '#ffd6c9', '#e8e1f2'][Math.floor(rng() * 3)]; g.fill(); }
    else { g.strokeStyle = '#c9b89a'; g.lineWidth = 2.2; const a = rng() * 3; g.beginPath(); g.moveTo(x - Math.cos(a) * 7, y - Math.sin(a) * 7); g.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); g.stroke(); }
  }
}
// sand fences across the dunes: lines of slats wired between posts, wandering a little, marram grass caught along them
function fences(g, S, X0, Y0, W, H, rng, dist, free) {
  let made = 0;
  for (let k = 0; k < 400 && made < 9; k++) {
    let x = X0 + rng() * W, y = Y0 + rng() * H, a = -0.3 + (rng() - 0.5) * 1.4; const pts = [];
    if ((S.sea.length && S.seaDist(x, y) < 230) || dist(x, y, 200) < 110) continue;
    for (let j = 0; j < 14; j++) { if (dist(x, y, 200) < 100 || !free(x, y, 16)) break; pts.push([x, y]); a += (rng() - 0.5) * 0.35; x += Math.cos(a) * 22; y += Math.sin(a) * 22; }
    if (pts.length < 7) continue;
    made++;
    const P = new Path2D(); pts.forEach(([px, py], i) => i ? P.lineTo(px, py) : P.moveTo(px, py));
    g.save(); g.translate(5, 7); g.strokeStyle = 'rgba(110,75,35,0.22)'; g.lineWidth = 3.5; g.stroke(P); g.restore();   // its shadow
    g.lineCap = 'butt'; g.strokeStyle = '#a48256'; g.lineWidth = 5; g.setLineDash([2.4, 2.4]); g.stroke(P); g.setLineDash([]); g.lineCap = 'round';
    g.strokeStyle = alpha('#5e4a33', 0.6); g.lineWidth = 0.7; g.stroke(P);
    pts.forEach(([px, py], i) => { circ(g, px, py, 2.4); g.fillStyle = '#6e5235'; g.fill(); circ(g, px - 0.6, py - 0.7, 1.1); g.fillStyle = '#b89a70'; g.fill(); if (rng() < 0.45) tuft(g, px + (rng() - 0.5) * 16 + 6, py + 8 + rng() * 8, 7 + rng() * 6, rng); });
  }
}
// marram grass in clumps on the dry sand, bent with the wind off the sea, and thick on a few grassy dunes
function grass(g, S, X0, Y0, W, H, area, rng, dist, free) {
  for (let i = 0, made = 0; i < 300 && made < 12; i++) {
    const x = X0 + rng() * W, y = Y0 + rng() * H, r = 90 + rng() * 90;
    if ((S.sea.length && S.seaDist(x, y) < 260) || dist(x, y, r + 120) < r * 0.6 + 60 || !free(x, y, r * 0.5)) continue;
    made++;
    g.save(); g.translate(x, y); g.scale(1, 0.7);
    g.fillStyle = radial(g, 0, 0, 0, 0, 0, r, [[0, alpha('#b9b46e', 0.3)], [0.6, alpha('#c8bd7a', 0.16)], [1, alpha('#c8bd7a', 0)]]); g.fillRect(-r, -r, r * 2, r * 2);
    g.restore();
    for (let k = 0; k < r * 0.45; k++) { const a = rng() * TAU, d = Math.sqrt(rng()) * r * 0.8, tx = x + Math.cos(a) * d, ty = y + Math.sin(a) * d * 0.7; if (dist(tx, ty, 120) > 70 && free(tx, ty, 8)) tuft(g, tx, ty, 9 + rng() * 9, rng); }
  }
  for (let i = 0; i < area / 22000; i++) {
    const x = X0 + rng() * W, y = Y0 + rng() * H;
    if ((S.sea.length && S.seaDist(x, y) < 200) || dist(x, y, 140) < 90 || !free(x, y, 30)) continue;
    const n = 3 + Math.floor(rng() * 8);
    for (let k = 0; k < n; k++) tuft(g, x + (rng() - 0.5) * 70, y + (rng() - 0.5) * 44, 8 + rng() * 8, rng);
  }
}
export function tuft(g, x, y, l, rng) {
  ell(g, x + 3, y + 3, l * 0.7, l * 0.35); g.fillStyle = alpha('#b08a50', 0.35); g.fill();
  const n = 7 + Math.floor(rng() * 5);
  for (let j = 0; j < n; j++) {
    const a = -Math.PI / 2 + (j / (n - 1) - 0.5) * 2.4 + (rng() - 0.5) * 0.3, ll = l * (0.7 + rng() * 0.5), bend = 0.5;
    g.strokeStyle = ['#7d9440', '#a7b85c', '#5f7a35', '#c2c97a'][Math.floor(rng() * 4)]; g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * ll * 0.6, y + Math.sin(a) * ll * 0.6, x + Math.cos(a + bend) * ll, y + Math.sin(a + bend) * ll); g.stroke();
  }
}
// shells and pebbles
function shells(g, S, X0, Y0, W, H, area, rng, dist) {
  for (let i = 0; i < area / 12000; i++) {
    const x = X0 + rng() * W, y = Y0 + rng() * H; if (dist(x, y, 60) < 30 || S.wet(x, y) || S.built(x, y)) continue;
    const t = rng(), r = 2.5 + rng() * 3.5, col = ['#fff3e6', '#ffd6c9', '#f2c79b', '#e8e1f2'][Math.floor(rng() * 4)];
    if (t < 0.45) {   // a scallop
      g.save(); g.translate(x, y); g.rotate(rng() * TAU);
      g.beginPath(); g.moveTo(0, r * 0.4); g.arc(0, 0, r, Math.PI * 1.1, Math.PI * 1.9); g.closePath(); g.fillStyle = 'rgba(80,55,25,0.25)'; g.save(); g.translate(1, 1.4); g.fill(); g.restore(); g.fillStyle = col; g.fill();
      g.strokeStyle = alpha('#a1785a', 0.6); g.lineWidth = 0.7; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(0, r * 0.4); g.lineTo(Math.sin(k * 0.3) * r, -Math.cos(k * 0.3) * r); g.stroke(); }
      g.restore();
    } else if (t < 0.7) { circ(g, x + 1, y + 1.4, r * 0.7); g.fillStyle = 'rgba(80,55,25,0.25)'; g.fill(); circ(g, x, y, r * 0.7); g.fillStyle = col; g.fill(); g.strokeStyle = alpha('#8a6a50', 0.6); g.lineWidth = 0.8; g.beginPath(); g.arc(x, y, r * 0.4, 0, 4.5); g.stroke(); }   // a whelk
    else { ell(g, x, y, r * 0.8, r * 0.55, rng() * 3); g.fillStyle = rng() < 0.5 ? '#8f8a84' : '#b9b2a6'; g.fill(); ell(g, x - r * 0.2, y - r * 0.15, r * 0.35, r * 0.2); g.fillStyle = alpha('#ffffff', 0.3); g.fill(); }   // a pebble
  }
}

// the beach between the road and the sea (off the crab's stretch): umbrellas, towels, sandcastles, boats
function beach(g, S, rng, dist, free) {
  const spots = [];
  for (const c of S.seaC) for (let i = 0; i < c.length; i += 3) {
    const q = c[i], o = -(55 + rng() * 80), x = q.x + q.nx * o, y = q.y + q.ny * o, r = 26;
    if (dist(x, y, 140) < 52 + r || S.crabDist(x, y) < 260 || !free(x, y, r) || spots.some(p => Math.hypot(p.x - x, p.y - y) < 95)) continue;
    spots.push({ x, y, q });
  }
  spots.forEach(({ x, y, q }, k) => {
    const t = (k * 7 + Math.floor(rng() * 3)) % 6, rot = Math.atan2(q.ny, q.nx);
    if (t === 0 || t === 3) { towel(g, x + 14, y + 10, rot + (rng() - 0.5) * 0.6, rng); umbrella(g, x - 6, y - 6, 22 + rng() * 6, rng); }
    else if (t === 1) { windbreak(g, x, y, rot, rng); towel(g, x - q.nx * 22, y - q.ny * 22, rot + 0.1, rng); }
    else if (t === 2) { sandcastle(g, x, y, 15, rng); bucket(g, x + 22, y + 12, rng); }
    else if (t === 4) { rowingBoat(g, x, y, 54, rot + Math.PI / 2 + (rng() - 0.5) * 0.5, ['#2f6fa8', '#e8562a', '#2e8b6a', '#f2efe6'][Math.floor(rng() * 4)]); }
    else { towel(g, x, y, rot + 0.3, rng); ball(g, x + 24, y - 14, 6); }
  });
}
export function umbrella(g, x, y, r, rng) {
  const c1 = ['#e8562a', '#2f78c4', '#14a39a', '#d8342c', '#f2b632'][Math.floor(rng() * 5)], c2 = '#f8f4ea';
  ell(g, x + r * 0.55, y + r * 0.7, r * 0.95, r * 0.85); g.fillStyle = 'rgba(70,45,20,0.25)'; g.fill();
  for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, k / 8 * TAU, (k + 1) / 8 * TAU); g.closePath(); g.fillStyle = k % 2 ? c2 : c1; g.fill(); }
  circ(g, x, y, r); g.fillStyle = radial(g, x - r * 0.4, y - r * 0.4, 1, x, y, r, [[0, 'rgba(255,255,255,0.35)'], [0.6, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.18)']]); g.fill();
  for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * TAU; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.96, y + Math.sin(a) * r * 0.96, r * 0.1, 0, TAU); g.fillStyle = k % 2 ? c1 : c2; g.fill(); }
  circ(g, x, y, r * 0.09); g.fillStyle = '#f2efe6'; g.fill();
}
export function towel(g, x, y, rot, rng) {
  const c = [['#2f78c4', '#ffffff'], ['#ff6f91', '#ffe08a'], ['#14a39a', '#f2efe6'], ['#f2b632', '#e8562a']][Math.floor(rng() * 4)];
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = 'rgba(70,45,20,0.2)'; g.fillRect(-15, -8, 32, 18);
  g.fillStyle = c[0]; g.fillRect(-16, -9, 32, 18); g.fillStyle = c[1]; for (let k = 0; k < 4; k++) g.fillRect(-16 + 3 + k * 8, -9, 3, 18);
  g.fillStyle = alpha('#ffffff', 0.5); for (let k = 0; k < 5; k++) { g.fillRect(-18, -8 + k * 4, 2, 1.4); g.fillRect(16, -8 + k * 4, 2, 1.4); }
  g.restore();
}
function windbreak(g, x, y, rot, rng) {
  const cols = ['#2f78c4', '#f8f4ea', '#e8562a'];
  g.save(); g.translate(x, y); g.rotate(rot + Math.PI / 2);
  g.strokeStyle = 'rgba(70,45,20,0.25)'; g.lineWidth = 6; g.beginPath(); g.moveTo(-30, 8); g.quadraticCurveTo(0, 2, 30, 8); g.stroke();
  for (let k = 0; k < 6; k++) { g.strokeStyle = cols[k % 3]; g.lineWidth = 4; g.beginPath(); g.moveTo(-30 + k * 10, Math.abs(-25 + k * 10) * 0.12); g.lineTo(-20 + k * 10, Math.abs(-15 + k * 10) * 0.12); g.stroke(); }
  g.fillStyle = '#7a5a3a'; for (let k = 0; k <= 6; k++) { circ(g, -30 + k * 10, Math.abs(-30 + k * 10) * 0.12, 1.8); g.fill(); }
  g.restore();
}
export function sandcastle(g, x, y, s, rng) {
  g.strokeStyle = alpha('#9a7a48', 0.45); g.lineWidth = 4; circ(g, x, y, s * 1.7); g.stroke();   // the moat
  g.strokeStyle = alpha('#7fd0d6', 0.5); g.lineWidth = 2; g.beginPath(); g.arc(x, y, s * 1.7, 0.4, 1.9); g.stroke();
  g.fillStyle = 'rgba(120,85,40,0.3)'; g.fillRect(x - s + 4, y - s + 5, s * 2, s * 2);
  g.fillStyle = '#d9b97c'; g.fillRect(x - s, y - s, s * 2, s * 2); g.fillStyle = '#ecd29a'; g.fillRect(x - s, y - s, s * 2, s * 0.3); g.fillRect(x - s, y - s, s * 0.3, s * 2);
  for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const tx = x + dx * s, ty = y + dy * s; circ(g, tx + 2, ty + 3, s * 0.45); g.fillStyle = 'rgba(120,85,40,0.3)'; g.fill(); circ(g, tx, ty, s * 0.45); g.fillStyle = '#c9a868'; g.fill(); circ(g, tx - 1.2, ty - 1.4, s * 0.32); g.fillStyle = '#efd7a2'; g.fill(); }
  circ(g, x, y, s * 0.55); g.fillStyle = '#d6b675'; g.fill(); circ(g, x - 1, y - 1.2, s * 0.4); g.fillStyle = '#f0d9a6'; g.fill();
  g.strokeStyle = '#5a4630'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - s * 1.2); g.stroke();
  g.fillStyle = '#e8562a'; poly(g, [[x, y - s * 1.2], [x + s * 0.7, y - s * 1.0], [x, y - s * 0.8]]); g.fill();
  for (let k = 0; k < 4; k++) { circ(g, x - s + rng() * s * 2, y + s + 2 + rng() * 3, 1.3); g.fillStyle = '#fff3e6'; g.fill(); }   // shells pressed into the front
}
function bucket(g, x, y, rng) {
  const c = ['#ffd23f', '#ff6f91', '#2f9ee0'][Math.floor(rng() * 3)];
  circ(g, x + 2, y + 3, 6.5); g.fillStyle = 'rgba(70,45,20,0.25)'; g.fill(); circ(g, x, y, 6.5); g.fillStyle = c; g.fill(); circ(g, x, y, 4.8); g.fillStyle = shade(c, -0.3); g.fill();
  g.strokeStyle = shade(c, -0.2); g.lineWidth = 1; g.beginPath(); g.arc(x, y, 7.5, -2.6, -0.5); g.stroke();
  g.strokeStyle = '#e8562a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 6, y + 8); g.lineTo(x + 16, y + 14); g.stroke(); ell(g, x + 17.5, y + 15, 3.4, 2.4, 0.5); g.fillStyle = '#e8562a'; g.fill();   // the spade
}
export function ball(g, x, y, r) {
  circ(g, x + r * 0.4, y + r * 0.55, r); g.fillStyle = 'rgba(70,45,20,0.25)'; g.fill();
  const cols = ['#e8562a', '#ffffff', '#2f78c4', '#ffffff', '#ffd23f', '#ffffff'];
  cols.forEach((c, k) => { g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, k / 6 * TAU, (k + 1) / 6 * TAU); g.closePath(); g.fillStyle = c; g.fill(); });
  circ(g, x, y, r); g.fillStyle = radial(g, x - r * 0.4, y - r * 0.45, 0, x, y, r, [[0, 'rgba(255,255,255,0.5)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.25)']]); g.fill();
}

// ---------------------------------------------------------------- props
// the scattered 'crab' props, on sand or water (from art/props.js; `land` is onLand)
export function shoreProp(g, d, shadowPass, land, littleCrab) {
  const { x, y, r, v } = d, rng = mulberry(Math.floor(v * 1e6) + 7);
  const pick = (...w) => { let s = 0; for (let i = 0; i < w.length; i++) { s += w[i]; if (v < s) return i; } return w.length - 1; };
  if (land && land.built && land.built(x, y, r)) return;   // the quay, the town, the piers and the mole are their own
  if (shadowPass) return;   // (everything here draws its own shadow)
  if (land && !land(x, y)) {   // out on the water: a fishing boat, a mooring buoy, a rock with the surf round it
    if ((v * 113) % 1 < 0.35) return;
    const t = pick(0.45, 0.3, 0.25);
    if (t === 0) fishingBoat(g, x, y, r * 2.4, v * 9, rng);
    else if (t === 1) {
      circ(g, x, y, r * 0.55); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill();
      ell(g, x + 3, y + 4, r * 0.34, r * 0.3); g.fillStyle = 'rgba(6,36,50,0.3)'; g.fill();
      circ(g, x, y, r * 0.34); g.fillStyle = radial(g, x - r * 0.12, y - r * 0.12, 1, x, y, r * 0.36, [[0, '#ff9a7a'], [0.6, '#e8452f'], [1, '#a82a1a']]); g.fill();
      g.fillStyle = alpha('#ffffff', 0.9); g.fillRect(x - r * 0.34, y - r * 0.06, r * 0.68, r * 0.12);
      if (v > 0.6) { g.strokeStyle = alpha('#e0d2a8', 0.7); g.lineWidth = 1; g.beginPath(); g.moveTo(x + r * 0.3, y); g.quadraticCurveTo(x + r, y + r * 0.4, x + r * 1.5, y + r * 0.2); g.stroke(); }
    } else {
      g.strokeStyle = alpha('#ffffff', 0.7); g.lineWidth = 2.4; g.setLineDash([8, 5]); circ(g, x, y, r * 0.9); g.stroke(); g.setLineDash([]);
      boulder(g, x, y, r * 0.6, rng, true); boulder(g, x + r * 0.45, y + r * 0.35, r * 0.3, rng, true);
    }
    return;
  }
  if (land && !land(x, y, r)) return;   // right at the water's edge: leave the surf clear
  const t = pick(0.13, 0.12, 0.14, 0.09, 0.12, 0.1, 0.1, 0.2);
  if (t === 0) {   // lobster pots stacked on the sand, a coil of rope, a float
    const n = 2 + Math.floor(v * 7) % 2;
    for (let k = 0; k < n; k++) pot(g, x + (k - (n - 1) / 2) * r * 0.7, y + (k % 2) * r * 0.4, r * 0.36, (rng() - 0.5) * 0.5);
    coil(g, x + r * 0.95, y - r * 0.45, r * 0.25);
    circ(g, x - r * 0.95, y + r * 0.45, r * 0.17); g.fillStyle = '#ff7043'; g.fill(); circ(g, x - r, y + r * 0.4, r * 0.06); g.fillStyle = '#ffd0b8'; g.fill();
  } else if (t === 1) {   // a rock in the sand, weed washed up round it
    for (let k = 0; k < 5; k++) { ell(g, x + r * (0.2 + k * 0.18), y + r * (0.55 - k * 0.05) + (rng() - 0.5) * 6, 4 + rng() * 4, 2 + rng() * 1.5, 0.3 + rng() * 0.4); g.fillStyle = ['#4d5a2a', '#6b6a2e', '#3f4f2c'][k % 3]; g.fill(); }
    boulder(g, x, y, r * 0.55, rng, false); boulder(g, x + r * 0.6, y + r * 0.25, r * 0.3, rng, false); boulder(g, x - r * 0.45, y + r * 0.35, r * 0.22, rng, false);
  } else if (t === 2) { towel(g, x + r * 0.4, y + r * 0.5, (v - 0.5) * 1.4, rng); umbrella(g, x - r * 0.15, y - r * 0.15, r * 0.85, rng); }   // an umbrella over a towel
  else if (t === 3) { sandcastle(g, x, y, r * 0.5, rng); bucket(g, x + r * 0.9, y + r * 0.5, rng); }
  else if (t === 4) {   // little crabs out on the sand (the boss's crew)
    const n = 2 + Math.floor(v * 11) % 3;
    for (let k = 0; k < n; k++) { const a = rng() * TAU, dd = rng() * r * 0.8; littleCrab(g, x + Math.cos(a) * dd, y + Math.sin(a) * dd, r * (0.22 + rng() * 0.1), rng() * TAU, rng); }
  } else if (t === 5) {   // driftwood, bleached
    g.save(); g.translate(x, y); g.rotate(v * 7); g.lineCap = 'round';
    g.strokeStyle = 'rgba(70,45,20,0.25)'; g.lineWidth = r * 0.3; g.beginPath(); g.moveTo(-r + 4, 5); g.quadraticCurveTo(4, -r * 0.15 + 5, r + 4, r * 0.05 + 5); g.stroke();
    g.strokeStyle = '#8d7a62'; g.lineWidth = r * 0.3; g.beginPath(); g.moveTo(-r, 0); g.quadraticCurveTo(0, -r * 0.15, r, r * 0.05); g.stroke();
    g.strokeStyle = '#d8ccb4'; g.lineWidth = r * 0.14; g.beginPath(); g.moveTo(-r, -r * 0.05); g.quadraticCurveTo(0, -r * 0.2, r, -r * 0.02); g.stroke();
    g.strokeStyle = '#a8977d'; g.lineWidth = r * 0.12; g.beginPath(); g.moveTo(r * 0.3, -r * 0.08); g.lineTo(r * 0.6, -r * 0.45); g.stroke();
    g.restore();
  } else if (t === 6) rowingBoat(g, x, y, r * 2.6, v * 5, ['#2f6fa8', '#e8562a', '#2e8b6a', '#f2efe6'][Math.floor(v * 41) % 4]);   // a rowing boat pulled up
  else { for (let k = 0; k < 4; k++) tuft(g, x + (rng() - 0.5) * r * 1.4, y + (rng() - 0.5) * r, 9 + rng() * 7, rng); }   // marram grass
}
