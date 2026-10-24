// Kernel Kart art: Cron Canyon (theme deco 'canyon'), a red-rock desert gorge with the Cron railway running through
// it. Seen from above and lit from the top left like everything else (shadows fall down and to the right; a rock's
// height reads as up the screen, so its sunlit cliff faces show along its lower edge). On top of the sandstone ground
// (track.js 'strata'): sand drifts, sagebrush and creosote, a dry wash winding down into the chasm (the track's `wash`,
// layout units), flat-topped buttes in the open ground, a water tower by the railway and the telegraph line along it.
// The biggest clearing gets the big mesa (canyonMesa, from props.js drawLandmark).
import { TAU, mulberry } from '../core.js';
import { alpha, circ, ell, linear, poly, radial, shade } from './paint.js';

const STRATA = ['#c8693a', '#d98a52', '#b5532f', '#e3a468', '#a94a2a', '#cf7a45'];
const SHADOW = 'rgba(70,22,8,0.24)';

// an irregular closed outline round (x, y): a few low harmonics so it reads as eroded rock, not a blob
function outline(x, y, rx, ry, rng, n = 22) {
  const ph = [rng() * TAU, rng() * TAU, rng() * TAU], k = [0.1 + rng() * 0.06, 0.06 + rng() * 0.04, 0.04];
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, w = 1 + k[0] * Math.sin(2 * a + ph[0]) + k[1] * Math.sin(3 * a + ph[1]) + k[2] * Math.sin(5 * a + ph[2]) + (rng() - 0.5) * 0.05;
    pts.push([x + Math.cos(a) * rx * w, y + Math.sin(a) * ry * w]);
  }
  return pts;
}
const scaled = (pts, cx, cy, k, dx = 0, dy = 0) => pts.map(([px, py]) => [cx + (px - cx) * k + dx, cy + (py - cy) * k + dy]);
function sub(g, pts) { pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.closePath(); }

// a butte or mesa: a talus apron, a cliff of sandstone layers (lit on the left, in shade on the right, streaked with
// desert varnish), a flat cap with its own rim, cracks and scrub, and a long shadow down-right
function butte(g, x, y, r, h, rng, opts = {}) {
  const base = outline(x, y, r, r * 0.82, rng);
  // the shadow: the base outline swept from the foot to where the cap's edge throws it
  g.beginPath(); for (let f = 0; f <= 1.001; f += 0.1) sub(g, scaled(base, x, y, 1 - 0.08 * f, h * 0.85 * f, h * 1.05 * f)); g.fillStyle = SHADOW; g.fill();
  // the talus: fallen rock round the foot
  poly(g, scaled(base, x, y, 1.1, 0, r * 0.03)); g.fillStyle = '#a9583a'; g.fill();
  for (let i = 0; i < 26; i++) {
    const a = rng() * TAU, d = 1.0 + rng() * 0.14, px = x + Math.cos(a) * r * d, py = y + Math.sin(a) * r * 0.82 * d + r * 0.03, s = r * (0.02 + rng() * 0.035);
    ell(g, px + s * 0.4, py + s * 0.5, s, s * 0.7); g.fillStyle = 'rgba(60,20,6,0.3)'; g.fill();
    ell(g, px, py, s, s * 0.7, rng()); g.fillStyle = rng() < 0.5 ? '#c4714a' : '#8f4529'; g.fill();
  }
  // the cliff: layer on layer from the foot up, each a touch narrower, every one shaded across from left to right
  const n = Math.max(6, Math.round(h / 7));
  for (let i = 0; i <= n; i++) {
    const t = i / n, P = scaled(base, x, y, 1 - 0.07 * t, 0, -h * t), col = opts.strata ? opts.strata[i % opts.strata.length] : STRATA[(i + (opts.seed || 0)) % STRATA.length];
    poly(g, P); g.fillStyle = linear(g, x - r, 0, x + r, 0, [[0, shade(col, 0.12)], [0.55, col], [1, shade(col, -0.32)]]); g.fill();
  }
  // desert varnish: dark streaks down the sunlit south face
  const top = scaled(base, x, y, 0.93, 0, -h);
  g.lineCap = 'round';
  for (let i = 0; i < base.length; i++) {
    const [bx, by] = base[i], [tx, ty] = top[i]; if (by < y + r * 0.15 || rng() < 0.35) continue;
    g.strokeStyle = alpha('#4a1c0c', 0.18 + rng() * 0.18); g.lineWidth = 1.5 + rng() * 3;
    g.beginPath(); g.moveTo(tx, ty + 2); g.lineTo(lerp2(tx, bx, 0.6 + rng() * 0.4), lerp2(ty, by, 0.6 + rng() * 0.4)); g.stroke();
  }
  // the cap: a flat top with a sunlit rim on the upper left
  poly(g, top); g.fillStyle = radial(g, x - r * 0.4, y - h - r * 0.4, r * 0.1, x, y - h, r * 1.1, [[0, opts.capLt || '#efb57c'], [1, opts.cap || '#d4874f']]); g.fill();
  g.save(); poly(g, top); g.clip();
  for (let k = 1; k <= 3; k++) { poly(g, scaled(top, x, y - h, 1 - k * 0.2)); g.strokeStyle = alpha('#a9552d', 0.22); g.lineWidth = 1.6; g.stroke(); }   // eroded steps on the cap
  for (let i = 0; i < 5; i++) {   // cracks
    let cx = x + (rng() - 0.5) * r, cy = y - h + (rng() - 0.5) * r * 0.7, a = rng() * TAU;
    g.beginPath(); g.moveTo(cx, cy); for (let k = 0; k < 4; k++) { a += (rng() - 0.5) * 1.2; cx += Math.cos(a) * r * 0.12; cy += Math.sin(a) * r * 0.1; g.lineTo(cx, cy); }
    g.strokeStyle = alpha('#7a3218', 0.35); g.lineWidth = 1.2; g.stroke();
  }
  for (let i = 0; i < r / 6; i++) { const px = x + (rng() - 0.5) * r * 1.5, py = y - h + (rng() - 0.5) * r * 1.2, s = 2 + rng() * 3.5; circ(g, px + 1, py + 1.2, s); g.fillStyle = 'rgba(60,25,8,0.25)'; g.fill(); circ(g, px, py, s); g.fillStyle = rng() < 0.5 ? '#8a8a4e' : '#a3a062'; g.fill(); }   // scrub on top
  g.restore();
  poly(g, top); g.strokeStyle = alpha('#fff0d6', 0.5); g.lineWidth = 2; g.save(); g.clip(); g.translate(2, 2); poly(g, top); g.stroke(); g.restore();   // the lit lip
  poly(g, top); g.strokeStyle = alpha('#6a2a12', 0.45); g.lineWidth = 1.2; g.stroke();
  return base;
}
const lerp2 = (a, b, t) => a + (b - a) * t;

// a hoodoo: a thin pillar of soft rock under a harder cap stone
function hoodoo(g, x, y, s, h, rng) {
  ell(g, x + h * 0.5, y + h * 0.6, s * 1.1, s * 0.6, 0.7); g.fillStyle = SHADOW; g.fill();
  for (let i = 0; i <= 6; i++) { const t = i / 6, w = s * (1 - 0.3 * Math.sin(t * Math.PI * 0.9)); ell(g, x, y - h * t, w, w * 0.8); g.fillStyle = linear(g, x - w, 0, x + w, 0, [[0, '#e7a46b'], [1, i % 2 ? '#a24f2b' : '#b85d33']]); g.fill(); }
  ell(g, x - s * 0.05, y - h - s * 0.1, s * 1.1, s * 0.8); g.fillStyle = linear(g, x - s, y - h - s, x + s, y - h + s, [[0, '#d8b98c'], [1, '#8a6a4a']]); g.fill();
}

// the big mesa in the biggest clearing, with a few hoodoos standing off it
export function canyonMesa(g, c) {
  const rng = mulberry(Math.floor(c.v * 1e6) + 11), r = c.r * 0.72, h = r * 0.42;
  const hoods = [];
  for (let k = 0; k < 3; k++) { const a = 0.3 + k * 0.9 + rng() * 0.4; hoods.push([c.x + Math.cos(a) * r * 1.22, c.y + Math.sin(a) * r * 1.0, r * (0.05 + rng() * 0.02), r * (0.3 + rng() * 0.15)]); }
  for (const [hx, hy, s, hh] of hoods) if (hy < c.y) hoodoo(g, hx, hy, s, hh, rng);   // the ones behind it first
  butte(g, c.x, c.y, r, h, rng, { seed: 2 });
  for (const [hx, hy, s, hh] of hoods) if (hy >= c.y) hoodoo(g, hx, hy, s, hh, rng);
}

// the dry wash's course: a smooth path through its points (Catmull-Rom), with a width that swells and narrows
function washSpline(P) {
  const S = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let t = 0; t < 1; t += 0.05) {
      const t2 = t * t, t3 = t2 * t, f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      S.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  S.push(P[P.length - 1]);
  return { S, W: S.map((_, i) => 58 + 18 * Math.sin(i * 0.11) + 8 * Math.sin(i * 0.37)) };
}

// the dry wash: a sandy bed between low cut banks, braided channels, pebbles, cracked mud where the last water stood
function drawWash(g, P, rng, D) {
  const { S, W } = washSpline(P);
  const nrm = S.map((p, i) => { const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; });
  const ribbon = (k, dx = 0, dy = 0) => { const L = S.map((p, i) => [p[0] + nrm[i][0] * W[i] * k + dx, p[1] + nrm[i][1] * W[i] * k + dy]), R = S.map((p, i) => [p[0] - nrm[i][0] * W[i] * k + dx, p[1] - nrm[i][1] * W[i] * k + dy]); poly(g, [...L, ...R.reverse()]); };
  ribbon(1.22); g.fillStyle = alpha('#8e4426', 0.55); g.fill();          // the cut banks
  ribbon(1.12, -3, -3); g.fillStyle = '#e0995e'; g.fill();               // their sunlit lips
  ribbon(1.04, 4, 5); g.fillStyle = alpha('#6e2c14', 0.45); g.fill();    // the bank's shadow on the bed
  ribbon(1.0, 3, 4); g.fillStyle = '#d9a56c'; g.fill();                  // the sand
  // braided channels: thin darker threads wandering across the bed
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let j = 0; j < 3; j++) {
    const ph = rng() * TAU, fr = 0.05 + rng() * 0.05;
    g.beginPath(); S.forEach((p, i) => { const o = Math.sin(i * fr + ph) * 0.6 * W[i]; const x = p[0] + nrm[i][0] * o + 3, y = p[1] + nrm[i][1] * o + 4; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.strokeStyle = alpha('#b07a46', 0.6); g.lineWidth = 5; g.stroke(); g.strokeStyle = alpha('#efc994', 0.55); g.lineWidth = 1.4; g.stroke();
  }
  // cracked mud in the hollows, pebbles everywhere, a bleached log now and then
  for (let i = 8; i < S.length - 8; i += 14) {
    if (rng() < 0.4) continue;
    const [x, y] = S[i], o = (rng() - 0.5) * W[i], cx = x + nrm[i][0] * o + 3, cy = y + nrm[i][1] * o + 4, r = W[i] * (0.3 + rng() * 0.2);
    ell(g, cx, cy, r, r * 0.6, Math.atan2(nrm[i][0], -nrm[i][1])); g.fillStyle = '#c99766'; g.fill();
    g.strokeStyle = alpha('#8a5a34', 0.6); g.lineWidth = 1;
    for (let k = 0; k < 9; k++) { const a = rng() * TAU, d = rng() * r * 0.7; g.beginPath(); g.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.6); g.lineTo(cx + Math.cos(a + 1.3) * (d + r * 0.3), cy + Math.sin(a + 1.3) * (d + r * 0.3) * 0.6); g.stroke(); }
  }
  for (let i = 0; i < S.length * 3 * D; i++) {
    const k = Math.floor(rng() * S.length), [x, y] = S[k], o = (rng() - 0.5) * 1.9 * W[k], px = x + nrm[k][0] * o + 3, py = y + nrm[k][1] * o + 4, s = 1.4 + rng() * 2.6;
    ell(g, px + 0.8, py + 1, s, s * 0.7); g.fillStyle = 'rgba(80,40,15,0.3)'; g.fill();
    ell(g, px, py, s, s * 0.7, rng()); g.fillStyle = ['#b9a184', '#9a8670', '#d8c4a4', '#a65a34'][Math.floor(rng() * 4)]; g.fill();
  }
  for (let i = 20; i < S.length - 20; i += 47) {
    const [x, y] = S[i], a = rng() * TAU, l = 26 + rng() * 20;
    g.strokeStyle = 'rgba(60,25,8,0.3)'; g.lineWidth = 6; g.beginPath(); g.moveTo(x + 4 - Math.cos(a) * l, y + 5 - Math.sin(a) * l); g.lineTo(x + 4 + Math.cos(a) * l, y + 5 + Math.sin(a) * l); g.stroke();
    g.strokeStyle = '#d8ccb6'; g.lineWidth = 5; g.beginPath(); g.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    g.strokeStyle = '#f2ead8'; g.lineWidth = 1.6; g.stroke();
  }
  return S.map((p, i) => [p[0], p[1], W[i] * 1.25]);
}

// sagebrush (a grey-green dome of little leaves) and creosote (a darker, twiggier clump)
function scrub(g, x, y, r, rng) {
  ell(g, x + r * 0.45, y + r * 0.55, r * 1.05, r * 0.75); g.fillStyle = 'rgba(70,25,8,0.25)'; g.fill();
  const sage = rng() < 0.6, cols = sage ? ['#66704e', '#8b9670', '#aeb894'] : ['#4a5528', '#62702f', '#829040'];
  g.strokeStyle = '#5a3a20'; g.lineWidth = 1; g.lineCap = 'round';   // the twigs
  for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + rng() * 0.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.8); g.stroke(); }
  for (let k = 0; k < 16; k++) {   // little leaf clusters, dark on the lower right and light on the upper left
    const a = rng() * TAU, d = Math.sqrt(rng()) * r * 0.8, s = r * (0.16 + rng() * 0.14), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.85, lit = (px - x) + (py - y);
    circ(g, px, py, s); g.fillStyle = cols[lit < -r * 0.3 ? 2 : lit > r * 0.3 ? 0 : 1]; g.fill();
  }
}

// the railway's water tower: a timber tank on four legs with a spout swung out toward the line
function waterTower(g, x, y, R) {
  const s = 40, h = 62, t = (x - R.ax) * R.ux + (y - R.ay) * R.uy, ang = Math.atan2(R.ay + R.uy * t - y, R.ax + R.ux * t - x);   // (the spout points at the line)
  ell(g, x + h * 0.85, y + h * 1.0, s * 1.15, s * 0.8, 0.5); g.fillStyle = SHADOW; g.fill();   // its shadow
  g.strokeStyle = '#4a2c16'; g.lineWidth = 4; g.lineCap = 'round';
  for (const [lx, ly] of [[-0.7, -0.6], [0.7, -0.6], [-0.7, 0.6], [0.7, 0.6]]) { g.beginPath(); g.moveTo(x + lx * s * 0.95, y + ly * s * 0.75); g.lineTo(x + lx * s * 0.75, y + ly * s * 0.6 - h); g.stroke(); }   // legs
  g.strokeStyle = '#6b4423'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x - s * 0.9, y - s * 0.4); g.lineTo(x + s * 0.8, y - h * 0.5); g.moveTo(x + s * 0.9, y - s * 0.4); g.lineTo(x - s * 0.8, y - h * 0.5); g.stroke();   // bracing
  ell(g, x, y - h, s, s * 0.8); g.fillStyle = linear(g, x - s, 0, x + s, 0, [[0, '#b98250'], [0.5, '#8f5a30'], [1, '#5e3a1d']]); g.fill();   // the tank's side
  for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(x, y - h - 4 + k * 7, s * 0.99, s * 0.79, 0, 0.1, Math.PI - 0.1); g.strokeStyle = '#3a3d45'; g.lineWidth = 1.6; g.stroke(); }   // iron hoops
  ell(g, x, y - h - 12, s * 0.96, s * 0.72); g.fillStyle = radial(g, x - s * 0.3, y - h - 20, 2, x, y - h - 12, s, [[0, '#d9a066'], [1, '#9c6434']]); g.fill();   // the conical roof
  circ(g, x, y - h - 14, 3); g.fillStyle = '#5e3a1d'; g.fill();
  g.save(); g.translate(x, y - h + 4); g.rotate(ang); g.fillStyle = '#2f3238'; g.fillRect(0, -3, s * 1.5, 6); circ(g, s * 1.5, 0, 4); g.fill(); g.restore();   // the spout toward the track
}

export function canyonGround(g, T, X0, Y0, W, H, dist, D, marks = []) {
  const rng = mulberry(T.N * 13 + 7), sc = T.def.scale || 1, area = W * H, R = T.rail;
  const railOff = (x, y) => R ? Math.abs((x - R.ax) * R.uy - (y - R.ay) * R.ux) : 1e9;
  // pale wind-blown sand in drifts, and darker desert pavement
  for (let i = 0; i < area / 180000; i++) {
    const x = X0 + rng() * W, y = Y0 + rng() * H, r = 70 + rng() * 170;
    g.save(); g.translate(x, y); g.rotate(-0.3 + rng() * 0.6); g.scale(1, 0.35 + rng() * 0.3);
    const c = rng() < 0.6 ? '#e8a46c' : '#8f3f22';
    g.fillStyle = radial(g, 0, 0, 0, 0, 0, r, [[0, alpha(c, 0.32)], [1, alpha(c, 0)]]); g.fillRect(-r, -r, r * 2, r * 2); g.restore();
  }
  if (D < 0.5) return;
  const wash = T.def.wash ? drawWash(g, T.def.wash.map(([x, y]) => [x * sc, y * sc]), rng, D) : [];
  const onWash = (x, y, m) => wash.some(([wx, wy, w]) => Math.hypot(wx - x, wy - y) < w + m);
  const deco = T.deco || [];
  // buttes in the open ground, biggest first: clear of the road, the railway, the wash, the landmarks and the props
  const busy = [...marks.map(m => [m.x, m.y, m.r]), ...deco.map(d => [d.x, d.y, d.r])], works = R ? canyonRailworks(T, dist) : { trestles: [], cuts: [] };
  for (const [d0, d1] of works.cuts) for (let d = d0; d <= d1; d += 50) busy.push([R.ax + R.ux * d, R.ay + R.uy * d, 150]);   // (the railway's cutting, drawn over the rails: drawRailworks)
  const free = (x, y, cap) => {
    let d = Math.min(cap, dist(x, y, cap + 80) - 60, railOff(x, y) - 90, x - X0 - 300, X0 + W - 300 - x, y - Y0 - 300, Y0 + H - 300 - y);
    for (const [bx, by, br] of busy) d = Math.min(d, Math.hypot(bx - x, by - y) - br - 30);
    for (const [wx, wy, w] of wash) d = Math.min(d, Math.hypot(wx - x, wy - y) - w - 20);
    return d;
  };
  const B = T.bbox, tower = [];
  for (let k = 0; k < 7; k++) {
    let best = null;
    for (let gy = B.y - 60; gy < B.y + B.h + 60; gy += 40) for (let gx = B.x - 60; gx < B.x + B.w + 60; gx += 40) { const d = free(gx, gy, 260); if (!best || d > best.d) best = { x: gx, y: gy, d }; }
    if (!best || best.d < 70) break;
    const r = best.d * 0.82;
    butte(g, best.x, best.y, r, r * (0.3 + rng() * 0.15), rng, { seed: k });
    busy.push([best.x, best.y, r * 1.15 + 40]);
  }
  // the water tower: in the open beside the railway, not far from the start
  if (R) {
    let best = null;
    for (let d = 300; d < R.len; d += 40) for (const side of [-1, 1]) {
      const off = side * 120, x = R.ax + R.ux * d - R.uy * off, y = R.ay + R.uy * d + R.ux * off, room = Math.min(dist(x, y, 200) - 40, ...busy.map(([bx, by, br]) => Math.hypot(bx - x, by - y) - br - 40));
      if (room > 40 && (!best || room > best.room)) best = { x, y, room };
    }
    if (best) { waterTower(g, best.x, best.y, R); tower.push(best); }
  }
  // sagebrush and creosote, thicker along the wash
  for (let i = 0; i < area / 7000; i++) {
    const x = X0 + rng() * W, y = Y0 + rng() * H, r = 7 + rng() * 9;
    if (dist(x, y, 100) < 26 + r || railOff(x, y) < 40 + r || onWash(x, y, 0) || busy.some(([bx, by, br]) => Math.hypot(bx - x, by - y) < br + r) || tower.some(t => Math.hypot(t.x - x, t.y - y) < 60)) continue;
    if (!onWash(x, y, 90) && rng() < 0.7) continue;
    scrub(g, x, y, r, rng);
  }
  // the telegraph line along the railway: poles on the north side, three wires, gaps where a road crosses
  if (R) {
    const side = 1, off = 58, poles = [];
    for (let d = -2000; d < R.len + 2000; d += 150) {
      const x = R.ax + R.ux * d - R.uy * off * side, y = R.ay + R.uy * d + R.ux * off * side;
      poles.push(x < X0 || x > X0 + W || dist(x, y, 120) < 30 || tower.some(t => Math.hypot(t.x - x, t.y - y) < 50) || works.cuts.some(([d0, d1]) => d > d0 - 60 && d < d1 + 60) ? null : [x, y]);   // (the line goes round the cutting)
    }
    const arm = (p, k) => [p[0] - R.uy * k * 9 - 3, p[1] + R.ux * k * 9 - 22];   // the crossarm's ends, up the screen by the pole's height
    for (let i = 0; i + 1 < poles.length; i++) {
      const a = poles[i], b = poles[i + 1]; if (!a || !b) continue;
      for (const k of [-1, 0, 1]) {
        const [ax, ay] = arm(a, k), [bx, by] = arm(b, k), mx = (ax + bx) / 2, my = (ay + by) / 2 + 9;
        g.beginPath(); g.moveTo(ax + 16, ay + 26); g.quadraticCurveTo(mx + 16, my + 26, bx + 16, by + 26); g.strokeStyle = 'rgba(70,22,8,0.16)'; g.lineWidth = 1; g.stroke();   // its shadow
        g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(mx, my, bx, by); g.strokeStyle = alpha('#2a2320', 0.7); g.lineWidth = 0.9; g.stroke();
      }
    }
    for (const p of poles) {
      if (!p) continue; const [x, y] = p;
      g.strokeStyle = 'rgba(70,22,8,0.3)'; g.lineWidth = 3.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 18, y + 24); g.stroke();   // shadow
      g.strokeStyle = '#5e3a1d'; g.lineWidth = 3.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y - 22); g.stroke();
      const [a0x, a0y] = arm(p, -1.3), [a1x, a1y] = arm(p, 1.3); g.strokeStyle = '#4a2c16'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(a0x, a0y); g.lineTo(a1x, a1y); g.stroke();
      for (const k of [-1, 0, 1]) { const [ix, iy] = arm(p, k); circ(g, ix, iy - 1, 1.6); g.fillStyle = '#7fc4c9'; g.fill(); }
    }
  }
}

// ---------------------------------------------------------------- the railway's works
// Where the line runs (distances along the rail, world units): `trestles`, where it crosses the dry wash on a timber
// trestle (track.js leaves the ballast out there), and `cuts`, where it runs through a low ridge in the open ground
// well away from the road, in a cutting. Worked out once per track.
const worksOf = new WeakMap();
export function canyonRailworks(T, dist) {
  if (worksOf.has(T)) return worksOf.get(T);
  const R = T.rail, sc = T.def.scale || 1, B = T.bbox, out = { trestles: [], cuts: [] };
  if (R) {
    const wash = T.def.wash ? washSpline(T.def.wash.map(([x, y]) => [x * sc, y * sc])) : null, at = d => [R.ax + R.ux * d, R.ay + R.uy * d];
    const runs = (step, test, pad, min) => {
      const list = []; let run = null;
      for (let d = -2000; d <= R.len + 2000; d += step) {
        if (test(...at(d), d)) { if (!run) run = [d, d]; run[1] = d; } else if (run) { if (run[1] - run[0] >= min) list.push([run[0] + pad, run[1] - pad]); run = null; }
      }
      return list;
    };
    if (wash) out.trestles = runs(8, (x, y) => wash.S.some((p, i) => Math.hypot(p[0] - x, p[1] - y) < wash.W[i] * 1.22 + 6), -26, 0);
    out.cuts = runs(10, (x, y, d) => x > B.x - 150 && x < B.x + B.w + 150 && y > B.y - 150 && y < B.y + B.h + 150 && dist(x, y, 300) > 195 && !out.trestles.some(([a, b]) => d > a - 50 && d < b + 50), 30, 300);
  }
  worksOf.set(T, out); return out;
}

// drawn after the ballast and before the road: the trestles over the wash (their shadows on the sand, the timber bents,
// the deck and its ties; the rails go on top later) and the cuttings (a sandstone wall either side of the line, as tall
// as the ridge is high in the middle and running out at the ends, the sunlit one and the one in shade, with the shade
// thrown across the trackbed, talus at the foot and the ridge's lit rim on top)
export function drawRailworks(g, T, works) {
  const R = T.rail, px = -R.uy, py = R.ux, at = (d, o = 0) => [R.ax + R.ux * d + px * o, R.ay + R.uy * d + py * o];
  const band = (d0, d1, o0, o1, dx = 0, dy = 0) => { const a = at(d0, o0), b = at(d1, o0), c = at(d1, o1), e = at(d0, o1); poly(g, [[a[0] + dx, a[1] + dy], [b[0] + dx, b[1] + dy], [c[0] + dx, c[1] + dy], [e[0] + dx, e[1] + dy]]); };
  for (const [d0, d1] of works.trestles) {
    band(d0, d1, -26, 26, 14, 19); g.fillStyle = 'rgba(70,22,8,0.3)'; g.fill();                     // the deck's shadow on the bed
    for (let d = d0 + 14; d <= d1 - 10; d += 34) {                                                  // the bents: piles and a cap beam, and their long shadows
      band(d - 3, d + 3, -34, 34, 22, 30); g.fillStyle = 'rgba(70,22,8,0.22)'; g.fill();
      for (const o of [-28, -10, 10, 28]) { const [x, y] = at(d, o); g.strokeStyle = '#3e2412'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 9, y + 12); g.stroke(); }
      band(d - 3.5, d + 3.5, -35, 35); g.fillStyle = '#5e3a1d'; g.fill();
    }
    band(d0, d1, -24, 24); g.fillStyle = '#86603b'; g.fill();                                        // the deck
    g.strokeStyle = '#4d3019'; g.lineWidth = 6;                                                     // the ties
    for (let d = d0 + 6; d < d1; d += 13) { const a = at(d, -25), b = at(d, 25); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
    for (const o of [-24, 24]) { const a = at(d0, o), b = at(d1, o); g.strokeStyle = '#3a2210'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); g.strokeStyle = alpha('#c8955e', 0.8); g.lineWidth = 1.2; g.stroke(); }   // guard timbers
    for (const d of [d0, d1]) { band(d - 8, d + 8, -32, 32); g.fillStyle = '#b9a184'; g.fill(); g.strokeStyle = alpha('#5c4f42', 0.7); g.lineWidth = 1.2; g.stroke(); }   // the stone abutments
  }
  const lit = (side) => (px * -side) * -0.7 + (py * -side) * -0.7 > 0;   // a wall's face looks at the rails: toward the light (top left)?
  for (const [d0, d1] of works.cuts) {
    const n = Math.max(8, Math.round((d1 - d0) / 24)), H = d => { const f = Math.sin(Math.PI * Math.min(1, Math.max(0, (d - d0) / (d1 - d0)))); return 70 * Math.pow(f, 0.55); };
    for (const side of [-1, 1]) {
      const foot = [], top = [], rim = [];
      for (let i = 0; i <= n; i++) { const d = d0 + (d1 - d0) * i / n, h = H(d); foot.push(at(d, side * 40)); top.push(at(d, side * (42 + h * 0.75))); rim.push(at(d, side * (46 + h * 1.4))); }
      poly(g, [...top, ...rim.slice().reverse()]); g.fillStyle = alpha('#c8693a', 0.55); g.fill();          // the ridge's back, fading into the ground
      if (!lit(side)) {   // the wall in shade throws its shadow across the trackbed
        const sh = []; for (let i = 0; i <= n; i++) { const d = d0 + (d1 - d0) * i / n; sh.push(at(d, side * (40 - H(d) * 0.55))); }
        poly(g, [...foot, ...sh.reverse()]); g.fillStyle = 'rgba(70,22,8,0.26)'; g.fill();
      }
      for (let k = 0; k < 4; k++) {   // the face: sandstone layers from the foot up
        const a = [], b = [];
        for (let i = 0; i <= n; i++) { const d = d0 + (d1 - d0) * i / n, h = H(d) * 0.75; a.push(at(d, side * (40 + 2 + h * k / 4))); b.push(at(d, side * (40 + 2 + h * (k + 1) / 4))); }
        const col = STRATA[(k * 2 + (side > 0 ? 1 : 0)) % STRATA.length];
        poly(g, [...a, ...b.reverse()]); g.fillStyle = lit(side) ? shade(col, 0.12) : shade(col, -0.3); g.fill();
      }
      g.beginPath(); top.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.strokeStyle = alpha('#fff0d6', lit(side) ? 0.35 : 0.55); g.lineWidth = 2; g.stroke();   // the lip
      const rng = mulberry(Math.round(d0) * 7 + side * 3);
      for (let i = 0; i < (d1 - d0) / 14; i++) {   // talus at the foot
        const d = d0 + rng() * (d1 - d0), [x, y] = at(d, side * (39 + rng() * 8)), s = 1.6 + rng() * 2.6 * (H(d) / 70);
        ell(g, x + 0.8, y + 1, s, s * 0.7); g.fillStyle = 'rgba(60,20,6,0.3)'; g.fill();
        ell(g, x, y, s, s * 0.7, rng()); g.fillStyle = rng() < 0.5 ? '#c4714a' : '#8f4529'; g.fill();
      }
    }
  }
}
