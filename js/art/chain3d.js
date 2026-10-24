// Kernel Kart art: long bendy 3D bodies for Fight's moves (2026-10-24): Pyth's tail and coils, Octo's tentacles. A body
// is a chain of one short baked 3D segment (a prop from art/prop3d.js: a capsule seen at 32 headings) laid along a
// spine and drawn from the light's side across, each one turned along the spine and scaled to taper it; a second pass of the
// same segment baked without its ink line hides the joins, so the body reads as one smooth tube with one outline. Drawing only, no DOM until called; the meshes are made on the page's
// thread at the bake (propsFor in the fighter's art file).
//
//   spine(at, gap, n)  samples a spine: at(u) (u 0..1 along it) -> { x, y, d, yaw, s } (screen point, depth to sort by,
//                      the segment's heading, its scale), gap(s) the spacing on screen for a segment of scale s; n the
//                      samples used to measure it. Returns the segments.
//   floorAt(p, s)      an at(u) for a body lying on the floor: p(u) -> [x, y, z] in world units (drawn at (x, y - z), as
//                      the fighters are), s(u) its scale
//   bodyAt(p, s)       an at(u) for a body round a fighter, seen as their model is (from 28° up): p(u) -> [x, y, z] round
//                      their feet (x right, y toward you, z up), drawn at (x, y sin 28° - z cos 28°)
//   drawSegs(g, segs, id, idN, a)  the segments from the light's side across, id (inked) then idN (the same baked
//                      without its ink line: hides the joins); a body that passes in front of itself is drawn in parts
//   segReady(id)       baked yet (else draw a 2D stand-in)
//   Two shared particle kinds (prop3d.js bits): 'po:dust' a soft puff of sandy dust, 'po:sand' a few grains of sand.
import { TAU } from '../core.js';
import * as M3 from './model3d.js';
import { defBit, drawProp3D, propReady } from './prop3d.js';
import { facetBall } from './prop3d.js';

export const SE = Math.sin(M3.ELEV), CE = Math.cos(M3.ELEV);
const H = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function spine(at, gap, n = 40) {
  const P = []; let L = 0;
  for (let i = 0; i <= n; i++) { const q = at(i / n); if (i) L += Math.hypot(q.x - P[i - 1].x, q.y - P[i - 1].y); q.L = L; P.push(q); }
  const out = [P[0]];
  let want = gap(P[0].s), i = 1;
  for (let l = want; l < L; l += want) {
    while (i < n && P[i].L < l) i++;
    const a = P[i - 1], b = P[i], f = b.L > a.L ? (l - a.L) / (b.L - a.L) : 0, q = at((i - 1 + f) / n);
    out.push(q); want = Math.max(0.6, gap(q.s));
  }
  if (out[out.length - 1] !== P[n]) out.push(P[n]);
  return out;
}
const tan = (p, u) => { const e = 0.012, a = p(Math.max(0, u - e)), b = p(Math.min(1, u + e)); return [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; };
export const floorAt = (p, s) => u => {
  const q = p(u), t = tan(p, u);
  return { x: q[0], y: q[1] - q[2], d: q[1] * CE + q[2] * SE, yaw: Math.atan2(t[1] / SE, t[0]), s: typeof s === 'function' ? s(u) : s, z: q[2], fx: q[0], fy: q[1] };
};
export const bodyAt = (p, s) => u => {
  const q = p(u), t = tan(p, u);
  return { x: q[0], y: q[1] * SE - q[2] * CE, d: q[1] * CE + q[2] * SE, yaw: Math.atan2(t[1], t[0]), s: typeof s === 'function' ? s(u) : s, z: q[2], fx: q[0], fy: q[1] };
};
export function drawSegs(g, segs, id, idN, a = 1) {
  // in order from the side the light comes from (the top left) to the far side: each segment then lies over the round
  // end of the one before it with its own round end turned to the light, lit just as the tube's top is, so the joins
  // don't show (the other way round, each end would sit in shade: a rib)
  const S = segs.slice().sort((p, q) => (0.48 * p.x + 0.62 * p.y) - (0.48 * q.x + 0.62 * q.y));
  for (const pass of idN ? [id, idN] : [id]) for (const q of S) {
    if (q.s <= 0.02) continue;
    g.translate(q.x, q.y); drawProp3D(g, pass, { yaw: q.yaw, scale: q.s, alpha: a * (q.a ?? 1) }); g.translate(-q.x, -q.y);
  }
}
export const segReady = id => propReady(id);
// a soft shadow under a body on the floor: one stroke along it (cheap), fainter where it's up off the floor
export function bodyShadow(g, segs, w, a = 1) {
  if (segs.length < 2) return;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = `rgba(20,16,42,${(0.15 * a).toFixed(3)})`;
  g.lineWidth = w; g.beginPath();
  segs.forEach((q, k) => { const x = (q.fx ?? q.x) + 2 + (q.z || 0) * 0.15, y = (q.fy ?? q.y) + 2.5; k ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.stroke(); g.restore();
}

// a body's segment mesh: a capsule along x (half its straight length hl, radius R), coloured by height: col(h) at each
// vertex (h its height / R, -1 its underside: a band by height runs straight along its round ends too, and blends across
// a face, so a band's edge is soft). o its ink line (0: none: the second pass)
export function segTube(out, hl, R, col, o = 1, nu = 24) {
  const S = [];
  for (let k = 6; k >= 1; k--) { const f = k / 6 * Math.PI / 2; S.push([-hl - R * Math.sin(f), R * Math.cos(f)]); }
  for (let k = 0; k <= 2; k++) S.push([-hl + hl * k, R]);
  for (let k = 1; k <= 6; k++) { const f = k / 6 * Math.PI / 2; S.push([hl + R * Math.sin(f), R * Math.cos(f)]); }
  const G = S.map(([x, r]) => Array.from({ length: nu + 1 }, (_, j) => { const a = TAU * j / nu, cp = Math.abs(x) - hl, n = M3.norm([cp > 0 ? Math.sign(x) * cp : 0, Math.cos(a) * r, Math.sin(a) * r]); return [[x, Math.cos(a) * r, Math.sin(a) * r], n]; }));
  for (let i = 0; i < G.length - 1; i++) for (let j = 0; j < nu; j++) {
    const a = G[i][j], b = G[i + 1][j], c = G[i + 1][j + 1], d = G[i][j + 1];
    for (const p of [a, b, c, a, c, d]) M3.pushV(out, p[0], p[1], col(p[0][2] / R), M3.MATTE, Z3, o);
  }
  return out;
}
const Z3 = [0, 0, 0];

// ---------------------------------------------------------------- the shared bits
const SAND = M3.hex('#e6d6b8'), SAND2 = M3.hex('#d4bf98');
defBit('po:dust', { mesh: () => { const out = []; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU, rr = k ? 2.5 : 0; M3.ball(out, [Math.cos(a) * rr, Math.sin(a) * rr, k ? (H(k) - 0.5) * 2 : 1], k ? 2.3 + H(k + 1) : 3.1, k % 2 ? SAND2 : SAND, M3.MATTE, 0.5, 12, 8); } return out; }, ink: '#a48d68', r0: 5 });
defBit('po:sand', { mesh: () => { const out = []; for (let k = 0; k < 3; k++) facetBall(out, [(H(k) - 0.5) * 4, (H(k + 3) - 0.5) * 4, (H(k + 6) - 0.5) * 2], [1.7, 1.5, 1.3], 30 + k, 5, 3, 0.35, (n, c, i) => M3.hex(H(i + k) < 0.5 ? '#dcc69c' : '#c7ad80')); return out; }, ink: '#8a7250', r0: 3.5 });
export const SHARED_BITS = ['bit:po:dust', 'bit:po:sand'];
