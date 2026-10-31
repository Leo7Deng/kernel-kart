// Kernel Kart art: 3D mascots (settings.models3d). Each is a low-poly mesh built in code, rendered with a tiny WebGL
// pass into a sprite sheet of headings per mood (cel shaded, lit top left, tinted inverted-hull ink line); a race draws
// it as a 2D sprite, crossfading the two frames either side of the kart's yaw. Sheets are made on the bakery's queue
// (art/warm.js); till then, or with no WebGL, drawMascot3D returns false and the caller draws the 2D mascot. Fight
// mode draws its poses live (liveFrame) and its icons with portrait3D. Nothing runs at import (Node loads it).
import { TAU } from '../core.js';
import { ICONS } from './icons.js';
import { fly, koStars } from './mascots.js';
import { ell, radial } from './paint.js';
import { LATER, bakeNow, baking, offThread, prime, queueBake, runNow } from './warm.js';

const N = 64, NM = 32;                         // headings per sheet: the plain look, and a mood (blinks and knocks are brief)
const ELEV = 28 * Math.PI / 180;               // how far the camera looks down
const K = 1.0;                                 // model units to mascot units (the 2D ones are about 46 tall)
const SS = 2;                                  // rendered at twice the sheet's size, then scaled down (smooth edges)
const LIGHT = norm([-0.48, 0.62, 0.62]);       // view space (x right, y up, z toward you): from the top left
const OUTLINE = 1.35;                          // the ink line, model units

function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scl = (v, s) => v.map(x => x * s);
const rotZ = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]];
const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

// ---------------------------------------------------------------- meshes
// model space: x forward, y to its left, z up; (0, 0, 0) is the seat. Facing you, +y is the screen's right, so a 2D
// mascot's x is the model's y. A vertex: position, normal, colour, kind (0 matte, 1 eye, 2 glossy, 3/4 matte/glossy
// with colour patches, 5/6 those moved by a pose, unposed place kept in the eye coords so patches stay put), eye
// coordinates (unit sphere in the eye's frame), ink share (0 for thin bits). Plain triangles, no index.
const STRIDE = 14, Z3 = [0, 0, 0];
const MATTE = 0, EYE = 1, GLOSS = 2, PATCH = 3, PATCH_GLOSS = 4;
function pushV(out, p, n, col, kind, e, o) { out.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], kind, e[0], e[1], e[2], o); }
function grid(out, at, nu, nv, col, kind, o = 1) {
  const G = []; for (let i = 0; i <= nv; i++) { G.push([]); for (let j = 0; j <= nu; j++) G[i].push(at(i, j)); }
  for (let i = 0; i < nv; i++) for (let j = 0; j < nu; j++) {
    const a = G[i][j], b = G[i + 1][j], cc = G[i + 1][j + 1], d = G[i][j + 1];
    for (const v of [a, b, cc, a, cc, d]) pushV(out, v[0], v[1], col, kind, v[2], o);
  }
}
// an ellipsoid: centre c, axes a0 a1 a2 (orthogonal, each its radius long)
function ellipsoid(out, c, axes, col, kind = MATTE, nu = 28, nv = 18, o = 1) {
  const d2 = axes.map(a => dot(a, a));
  grid(out, (i, j) => {
    const th = Math.PI * i / nv, ph = TAU * j / nu, s = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
    const p = [0, 1, 2].map(k => c[k] + axes[0][k] * s[0] + axes[1][k] * s[1] + axes[2][k] * s[2]);
    const n = norm([0, 1, 2].map(k => axes[0][k] * s[0] / d2[0] + axes[1][k] * s[1] / d2[1] + axes[2][k] * s[2] / d2[2]));
    return [p, n, s];
  }, nu, nv, col, kind, o);
}
const ball = (out, c, r, col, kind = MATTE, o = 1, nu = 16, nv = 10) => ellipsoid(out, c, [[r, 0, 0], [0, r, 0], [0, 0, r]], col, kind, nu, nv, o);
// an ellipsoid along a segment (an arm): radius r across it
function capsule(out, p0, p1, r, col, kind = MATTE, o = 1) {
  const c = scl(add(p0, p1), 0.5), a = scl(sub(p1, p0), 0.5);
  const u = norm(a), s1 = norm(cross(u, Math.abs(u[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1])), s2 = norm(cross(u, s1));
  ellipsoid(out, c, [a, scl(s1, r), scl(s2, r)], col, kind, 18, 12, o);
}
// a flat oval lying on a surface at p facing n (a patch, a blush, a sticking plaster): r1 across, r2 up it, th thick,
// turned rot in its plane; no outline unless asked
function decal(out, p, n, r1, r2, th, col, rot = 0, o = 0, kind = MATTE) {
  n = norm(n); const t0 = norm(Math.abs(n[2]) > 0.95 ? cross([1, 0, 0], n) : cross([0, 0, 1], n)), u0 = cross(n, t0);
  const t1 = add(scl(t0, Math.cos(rot)), scl(u0, Math.sin(rot))), u1 = cross(n, t1);
  ellipsoid(out, p, [scl(n, th), scl(t1, r1), scl(u1, r2)], col, kind, 16, 10, o);
}
// rings of [point, normal] joined into quads; colour C(i, n) per quad (i the ring before it, n the quad's normal)
function skin(out, rings, C, kind, o) {
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < rings[i].length - 1; j++) {
    const a = rings[i][j], b = rings[i + 1][j], c = rings[i + 1][j + 1], d = rings[i][j + 1], cl = C(i, norm(add(a[1], c[1])));
    for (const v of [a, b, c, a, c, d]) pushV(out, v[0], v[1], cl, kind, Z3, o);
  }
}
// a tube along points (tentacle, tail, whisker): radius rad(t) (t 0..1, or a number), colour col or col(i, n);
// rounded ends
function tube(out, pts, rad, col, kind = MATTE, o = 1, sides = 10) {
  const n = pts.length, R = i => typeof rad === 'function' ? rad(i / (n - 1)) : rad, C = typeof col === 'function' ? col : () => col;
  const T = pts.map((p, i) => norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])));
  let Nn = norm(cross(T[0], Math.abs(T[0][2]) > 0.9 ? [1, 0, 0] : [0, 0, 1]));
  const rings = [];
  for (let i = 0; i < n; i++) {
    if (i) Nn = norm(sub(Nn, scl(T[i], dot(Nn, T[i]))));   // carried along (no twist)
    const B = cross(T[i], Nn), r = R(i), ring = [];
    for (let j = 0; j <= sides; j++) { const a = TAU * j / sides, nn = add(scl(Nn, Math.cos(a)), scl(B, Math.sin(a))); ring.push([add(pts[i], scl(nn, r)), nn]); }
    rings.push(ring);
  }
  skin(out, rings, C, kind, o);
  for (const i of [0, n - 1]) if (R(i) > 0.05) ball(out, pts[i], R(i), C(Math.min(i, n - 2), scl(T[i], i ? 1 : -1)), kind, o, 10, 7);
}
// a sweep along points with an oval section: rw(t) across (along T × up), rh(t) toward up; normals from the surface
// itself, so a growing section shades right; ends capped
function sweep(out, pts, rw, rh, up, col, kind = MATTE, o = 1, sides = 16) {
  const n = pts.length, F = (f, i) => Math.max(0.05, typeof f === 'function' ? f(i / (n - 1)) : f), C = typeof col === 'function' ? col : () => col;
  const T = pts.map((p, i) => norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])));
  const P = pts.map((p, i) => { const S = norm(cross(T[i], up)), U = cross(S, T[i]), a = F(rw, i), b = F(rh, i); return { S, U, a, b, ring: Array.from({ length: sides + 1 }, (_, j) => { const th = TAU * j / sides; return add(p, add(scl(S, a * Math.cos(th)), scl(U, b * Math.sin(th)))); }) }; });
  const rings = P.map((R, i) => R.ring.map((p, j) => {
    const th = TAU * j / sides, an = norm(add(scl(R.S, Math.cos(th) / R.a), scl(R.U, Math.sin(th) / R.b)));
    const along = sub(P[Math.min(n - 1, i + 1)].ring[j], P[Math.max(0, i - 1)].ring[j]), round = sub(R.ring[(j + 1) % sides], R.ring[(j + sides - 1) % sides]);
    let nn = cross(round, along); const l = Math.hypot(...nn);
    nn = l > 1e-4 ? scl(nn, 1 / l) : an; if (dot(nn, an) < 0) nn = scl(nn, -1);
    return [p, nn];
  }));
  skin(out, rings, C, kind, o);
  for (const i of [0, n - 1]) { const R = P[i]; if (Math.max(R.a, R.b) > 0.3) ellipsoid(out, pts[i], [scl(T[i], Math.min(R.a, R.b)), scl(R.S, R.a), scl(R.U, R.b)], C(Math.min(i, n - 2), scl(T[i], i ? 1 : -1)), kind, 16, 10, o); }
}
// a box with rounded edges (a superellipsoid: e 1 an ellipsoid, toward 0 a box): centre c, half sizes h (x y z)
function rbox(out, c, h, col, kind = MATTE, e = 0.28, o = 1) {
  const sp = (v, p) => Math.sign(v) * Math.abs(v) ** p;
  grid(out, (i, j) => {
    const th = Math.PI * i / 12, ph = TAU * j / 16, s = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
    return [[0, 1, 2].map(k => c[k] + h[k] * sp(s[k], e)), norm([0, 1, 2].map(k => sp(s[k], 2 - e) / h[k])), s];
  }, 16, 12, col, kind, o);
}
// a body of revolution round z: prof is [z, half-width] pole to pole, depth k × width (front half k × front).
// Returns at(az, z) -> [point, normal] (az 0 straight ahead, + to its left)
function lathe(out, prof, k, front, col, kind = MATTE, nu = 40) {
  const n = prof.length - 1, P = (i, ph) => { const [z, w] = prof[i], c = Math.cos(ph); return [w * c * (c > 0 ? k * front : k), w * Math.sin(ph), z]; };
  const mid = [0, 0, (prof[0][0] + prof[n][0]) / 2];
  grid(out, (i, j) => {
    const ph = TAU * j / nu, p = P(i, ph);
    let nn;
    if (i === 0) nn = [0, 0, -1]; else if (i === n) nn = [0, 0, 1];
    else { const dz = sub(P(i + 1, ph), P(i - 1, ph)), dp = sub(P(i, ph + 0.01), P(i, ph - 0.01)); nn = norm(cross(dp, dz)); if (dot(nn, sub(p, mid)) < 0) nn = scl(nn, -1); }
    return [p, nn, Z3];
  }, nu, n, col, kind);
  const wAt = z => { for (let i = 0; i < n; i++) { const [z0, w0] = prof[i], [z1, w1] = prof[i + 1]; if (z <= z1) return w0 + (w1 - w0) * Math.max(0, (z - z0) / (z1 - z0 || 1)); } return 0; };
  return (az, z) => { const w = wAt(z), c = Math.cos(az); return [[w * c * (c > 0 ? k * front : k), w * Math.sin(az), z], norm([c, Math.sin(az), 0.15])]; };
}
// a profile through points, smoothed (Catmull-Rom), sub samples per span
function smoothProf(pts, sub = 4) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < sub; s++) { const t = s / sub, t2 = t * t, t3 = t2 * t; out.push(p1.map((_, k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3))); }
  }
  out.push(pts[pts.length - 1]); return out;
}
// an eye: centre c, turned a from straight ahead, d deep, w wide, h tall; look: where its pupil looks, if not along a
// (the shape follows the face, the pupil peers elsewhere)
function eyeAt(out, c, a, d, w, h, col, o = 1, look = a) {
  const i0 = out.length;
  ellipsoid(out, c, [scl(rotZ([1, 0, 0], a), d), scl(rotZ([0, 1, 0], a), w), [0, 0, h]], col, EYE, 32, 22, o);
  if (look !== a) for (let i = i0; i < out.length; i += STRIDE) { const e = rotZ([out[i + 10], out[i + 11], out[i + 12]], a - look); out[i + 10] = e[0]; out[i + 11] = e[1]; out[i + 12] = e[2]; }
}
// a point on an ellipsoid (centre c, radii r) at y, z, from the front, and its normal: for things lying on a face
function onFront(c, r, y, z, lift = 0) {
  const q = 1 - ((y - c[1]) / r[1]) ** 2 - ((z - c[2]) / r[2]) ** 2, x = c[0] + r[0] * Math.sqrt(Math.max(0, q));
  const n = norm([(x - c[0]) / r[0] ** 2, (y - c[1]) / r[1] ** 2, (z - c[2]) / r[2] ** 2]);
  return [add([x, y, z], scl(n, lift)), n];
}

// the Go gopher (Renée French): pale-blue bean, goggly eyes, tan muzzle, dark nose, buck teeth, paws on the wheel
function gopherMesh(mood, pose) {
  if (pose) return gopherPosed(mood, pose);
  const out = [], B = hex('#79d0e2'), TAN = hex('#f3d3ad'), NOSE = hex('#3b2416'), WHITE = hex('#fbfbf8'), EW = hex('#ffffff');
  const prof = smoothProf([[-0.5, 0], [0.6, 9.5], [3, 14.6], [9, 16.6], [17, 17.2], [25, 16.7], [32, 15], [38, 12.2], [42.2, 8], [44.6, 3.8], [45.3, 0]]);
  lathe(out, prof, 0.86, 1.04, B);
  for (const s of [-1, 1]) {
    ellipsoid(out, [-1.5, s * 11.2, 38.6], [[3.2, 0, 0], [0, 4.3, 0], [0, 0, 4.4]], B);                                // ears
    eyeAt(out, [9.6, s * 7.5, 31], s * 0.2, 6.2, 8.1, 8.5, EW);                                                          // eyes, looking a touch apart
    capsule(out, [5, s * 15.2, 15.5], [15.5, s * 11.5, 11], 2.9, B);                                                    // arms
    ellipsoid(out, [16.6, s * 11, 10.6], [[3.3, 0, 0], [0, 3.0, 0], [0, 0, 2.6]], TAN);                                 // paws
    ellipsoid(out, [11.5, s * 8.2, 1.6], [[5.2, 0, 0], [0, 3.4, 0], [0, 0, 2.4]], TAN);                                 // feet
    ellipsoid(out, [16.9, s * 1.35, 15.3], [[1.1, 0, 0], [0, 1.3, 0], [0, 0, 2.3]], WHITE, MATTE, 12, 8);                 // teeth
  }
  ellipsoid(out, [13.4, 0, 19.6], [[4.6, 0, 0], [0, 7.6, 0], [0, 0, 4.9]], TAN);                                       // muzzle
  ellipsoid(out, [17.4, 0, 22.4], [[2.2, 0, 0], [0, 3.5, 0], [0, 0, 2.3]], NOSE, GLOSS, 18, 12);                        // nose
  ellipsoid(out, [-15.4, 0, 4], [[2.2, 0, 0], [0, 2.6, 0], [0, 0, 2.4]], B, MATTE, 12, 8);                              // tail
  return out;
}

// Tux's eye: its middle on the head's surface, turned with it, so the ink line hugs the white (sunk behind the
// surface, the outline shows as a doubled ring); the pupil peers toward the middle
const tuxEye = (out, s, k, col) => eyeAt(out, [9.6, s * 4.5, 38.6], s * 0.36, 1.6, 3.4 * k, 4.8 * k, col, 0.45, -s * 0.2);

// Tux (Larry Ewing's penguin): glossy black pear, white belly, round eyes, wide beak (open when happy, slack when
// knocked out), left flipper waving, flat orange feet
function tuxMesh(mood, pose) {
  if (pose) return tuxPosed(mood, pose);
  const out = [], BK = hex('#25272e'), Y = hex('#f7b21b'), YD = hex('#dc840e'), EW = hex('#ffffff'), MOUTH = hex('#6e1a1e'), TONGUE = hex('#e46a6f');
  const prof = smoothProf([[-0.5, 0], [0.6, 11], [3, 16.4], [10, 18.8], [17, 18.2], [26, 15.2], [34, 12.6], [41, 11], [46, 8], [48.8, 4], [49.4, 0]]);
  lathe(out, prof, 0.86, 1.06, BK, PATCH_GLOSS);   // the belly is the patch (TUX.patches)
  for (const s of [-1, 1]) {
    tuxEye(out, s, 1, EW);
    // flippers: flat, the broad side facing out; the right one hangs, the left one is up waving
    const L = s < 0 ? norm([0.12, -0.36, -0.93]) : norm([0.3, 0.72, 0.62]), sh = s < 0 ? [1, -14.6, 29] : [1, 14, 28.5];
    const thin = norm(cross(L, [1, 0, 0])), wide = cross(thin, L);
    ellipsoid(out, add(sh, scl(L, 9)), [scl(L, 10.5), scl(wide, 3.8), scl(thin, 1.7)], BK, GLOSS, 20, 12);
    // feet: flat and orange, splayed out, three toes each
    const a = s * 0.32, c = [7.4, s * 8.2, 0.9];
    ellipsoid(out, c, [scl(rotZ([1, 0, 0], a), 6.2), scl(rotZ([0, 1, 0], a), 4.4), [0, 0, 1.7]], Y, MATTE, 20, 12);
    for (const k of [-1, 0, 1]) ellipsoid(out, add(c, rotZ([5.6, k * 2.6, 0.1], a)), [scl(rotZ([1, 0, 0], a), 2), scl(rotZ([0, 1, 0], a), 1.6), [0, 0, 1.4]], Y, MATTE, 12, 8);
  }
  const drop = mood === 'happy' ? 3.4 : mood === 'ko' ? 1.7 : 0;
  if (drop) { ellipsoid(out, [10.2, 0, 31.3 - drop * 0.5], [[3.6, 0, 0], [0, 5.6, 0], [0, 0, 1 + drop * 0.5]], MOUTH, MATTE, 18, 12, 0); ellipsoid(out, [11.6, 0, 30 - drop * 0.6], [[1.6, 0, 0], [0, 3, 0], [0, 0, 0.8]], TONGUE, MATTE, 12, 8, 0); }
  ellipsoid(out, [10.9, 0, 30.2 - drop], [[4.3, 0, 0], [0, 6.6, 0], [0, 0, 1.9]], YD, MATTE, 22, 12);                 // lower beak
  ellipsoid(out, [11.6, 0, 33.2], [[4.9, 0, 0], [0, 8, 0], [0, 0, 2.6]], Y, GLOSS, 24, 14);                            // upper beak
  return out;
}

// Duke (Java): black-topped white tooth, glossy red nose, no eyes (sudo gives it some for the shades), thin arms,
// one waving
function dukeMesh(mood, pose) {
  if (pose) return dukePosed(mood, pose);
  const out = [], WH = hex('#f2f2ee'), BK = hex('#1d1d22'), RED = hex('#e8231a');
  const prof = smoothProf([[-1, 0], [-0.3, 10], [1, 16], [5, 16.9], [12, 16.1], [24, 13.6], [34.6, 9.7], [42.6, 4.9], [45.4, 2], [46, 0]]);
  lathe(out, prof, 0.72, 1, WH, PATCH);
  ball(out, [8.6, 0, 20.5], 6.6, RED, GLOSS, 1, 24, 16);
  const arm = (pts, hand) => { tube(out, smoothProf(pts, 3), 1.15, BK, MATTE, 0.35, 8); ball(out, hand, 2.3, BK, GLOSS, 0.5); };
  arm([[0, -12.6, 13], [1, -18, 15], [2, -22, 20], [2.5, -24, 26.5]], [2.6, -24.2, 28]);                               // waving
  arm([[0, 12.6, 11], [1.5, 18, 11], [2.5, 21.5, 8], [3, 22.5, 4.6]], [3, 22.6, 3.8]);
  if (mood === 'sudo') for (const s of [-1, 1]) eyeAt(out, [6.2, s * 5, 31], 0, 1.4, 3.3, 3, BK);
  return out;
}

// ---------------------------------------------------------------- fight poses (Tux and Duke here, the other eight below)
// A pose: the model with its arms built where the pose puts them, then the body leant (pitch + forward), twisted
// (yaw + turns its right side forward) and rolled (+ toward its left) round a pivot, and stood on the ground. Each pose
// is its own sheet (NM headings). Lying poses lie along +x, the ground under the body's middle at the origin.
const smooth01 = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
function rot3(v, yaw, pitch, roll) {
  v = rotZ(v, yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  v = [v[0] * cp + v[2] * sp, v[1], -v[0] * sp + v[2] * cp];
  return [v[0], v[1] * cr + v[2] * sr, -v[1] * sr + v[2] * cr];
}
// the vertices i0..i1 of out turned by ang(p) = [yaw, pitch, roll] round piv (then moved by mv); a patch part keeps its
// unposed place (kind 3/4 -> 5/6)
function turnPart(out, i0, i1, piv, ang, mv = Z3) {
  for (let i = i0; i < i1; i += STRIDE) {
    if (out[i + 9] === PATCH || out[i + 9] === PATCH_GLOSS) { out[i + 10] = out[i]; out[i + 11] = out[i + 1]; out[i + 12] = out[i + 2]; out[i + 9] += 2; }
    const p = [out[i], out[i + 1], out[i + 2]], [y, pi, r] = ang(p);
    const q = add(add(rot3(sub(p, piv), y, pi, r), piv), mv), n = rot3([out[i + 3], out[i + 4], out[i + 5]], y, pi, r);
    out[i] = q[0]; out[i + 1] = q[1]; out[i + 2] = q[2]; out[i + 3] = n[0]; out[i + 4] = n[1]; out[i + 5] = n[2];
  }
}
function extent(out, i0, i1, k) { let lo = Infinity, hi = -Infinity; for (let i = i0 + k; i < i1; i += STRIDE) { lo = Math.min(lo, out[i]); hi = Math.max(hi, out[i]); } return [lo, hi]; }
function shiftPart(out, i0, i1, d) { for (let i = i0; i < i1; i += STRIDE) for (let k = 0; k < 3; k++) out[i + k] += d[k]; }
// the body (0..i1) as pose P has it: head bent (P.bend, vertices up to bendEnd), leant round a pivot near the edge it
// tips over, lifted (lift + P.up: a walk's bob), lowest point at z0 (exactly there in the air), or lying (P.lie:
// [dx, dz]) belly down over the origin. Returns where an unposed point ends up (a hip, for planted legs).
function poseBody(out, i1, P, z0, r, bendEnd = 0, lift = 0) {
  if (P.bend) turnPart(out, 0, bendEnd, P.bend[0], p => [0, P.bend[1] * smooth01(P.bend[2], P.bend[3], p[2]), 0]);
  const pitch = P.pitch || 0, piv = P.lie ? [0, 0, r] : [Math.sign(pitch) * r * 0.6, 0, 3], ang = [P.yaw || 0, pitch, P.roll || 0], mv = [P.dx || 0, 0, lift + (P.up || 0)];
  turnPart(out, 0, i1, piv, () => ang, mv);
  const [lo] = extent(out, 0, i1, 2);
  let d = Z3;
  if (P.lie) { const [x0, x1] = extent(out, 0, i1, 0), [y0, y1] = extent(out, 0, i1, 1); d = [-(x0 + x1) / 2 + P.lie[0], -(y0 + y1) / 2, z0 - lo + P.lie[1]]; }
  else if (lo < z0 || P.air) d = [0, 0, z0 - lo];
  shiftPart(out, 0, i1, d);
  return p => add(add(add(rot3(sub(p, piv), ...ang), piv), mv), d);
}
// a foot's place: f = [forward, up, turn] for each foot [its right, its left] (P.ft), w how far apart (P.w)
const footOf = (P, s) => (P.ft || [])[s < 0 ? 0 : 1] || [0, 0, 0];

// Fight mode stands Tux and Duke on little legs (in a race the kart hides them): 'stand' is the plain look,
// 'walk0'..'walk3' the walk. Legs planted ('stay': foot at P.ft, leg from the posed hip), tucked up with the body
// ('body') or kicked back lying ('lie').
const TUX_LIFT = 8.5, DUKE_LIFT = 12.5;
// walk cycle: contact (right foot forward), passing (right foot up), contact (left), passing (left); arms swing
// against the legs, the body bobs up passing and Tux waddles over the standing foot
const walkCycle = (stride, lift, bob, waddle, swing) => [0, 1, 2, 3].map(k => {
  const s = k < 2 ? 1 : -1, pass = k % 2;   // s: +1 while the right leg leads
  return { pass, s, ft: pass ? (s > 0 ? [[0, lift, 0], [0, 0, 0]] : [[0, 0, 0], [0, lift, 0]]) : [[s * stride, 0, 0], [-s * stride, 0, 0]], up: pass ? bob : 0, roll: pass ? s * waddle : 0, yaw: pass ? 0 : -s * 0.07, sw: pass ? 0 : s * swing };
});
// Tux's poses: each flipper's direction from its shoulder [right, left] (sh: shoulders further forward), the lean,
// legs ('stay', 'body', 'lie'; ft feet, w spacing). bend: head bent back [pivot, angle, from z, to z] so lying he looks ahead
const TUX_DOWN = [[0.15, -0.5, -0.85], [0.15, 0.5, -0.85]];
const TUX_POSES = {
  stand: { fl: TUX_DOWN, feet: 'stay' },
  wind: { yaw: -0.42, pitch: -0.12, fl: [[-0.72, -0.5, 0.3], [0.55, 0.45, -0.55]], feet: 'stay', ft: [[-2.5, 0, 0], [2, 0, 0]], w: 1.15 },
  strike: { yaw: 0.22, pitch: 0.24, dx: 2, fl: [[0.97, 0.05, 0.22], [-0.45, 0.62, -0.55]], feet: 'stay', ft: [[4.5, 0, 0], [-3, 0, 0]] },
  block: { pitch: -0.1, sh: 5, fl: [[0.62, 0.74, 0.2], [0.62, -0.74, 0.34]], feet: 'stay', w: 1.35, ft: [[0.5, 0, -0.15], [0.5, 0, 0.15]] },
  hurt: { pitch: -0.36, roll: 0.16, up: -2.5, fl: [[-0.25, -0.72, 0.65], [-0.15, 0.8, 0.58]], feet: 'stay', ft: [[3.5, 3, 0], [-1, 0, 0]] },
  grab: { pitch: 0.2, dx: 2, fl: [[0.96, -0.12, 0.18], [0.96, 0.12, 0.18]], feet: 'stay', ft: [[3, 0, 0], [-2, 0, 0]], w: 1.15 },
  air: { pitch: -0.55, roll: 0.28, fl: [[0.1, -0.45, 0.89], [0.1, 0.55, 0.83]], feet: 'body', air: true, ft: [[2.5, 4, 0], [-1, 2.5, 0]] },
  slide: { lie: [2, 0], pitch: Math.PI / 2, bend: [[3, 0, 30], -1.15, 29, 40], fl: [[0.15, -0.3, -0.94], [0.15, 0.3, -0.94]], feet: 'lie' },
  flop: { lie: [0, 0], pitch: Math.PI / 2, bend: [[3, 0, 30], -0.8, 29, 40], fl: [[0.2, -0.98, 0.15], [0.2, 0.98, 0.15]], feet: 'lie', spread: 1 },
  // move keyframes (big and readable from the fight's camera): fishback/fishslap Frozen Fish (fish: art/kit-tux.js);
  // walup/wallop the wallop, fish held like a club; crouch/belly the Belly Slide and a missed one; armup/burst Ice
  // Armour; leap the Snow Dive; summon his cheer
  fishback: { yaw: -0.55, pitch: -0.12, fl: [[-0.6, -0.4, 0.7], [0.3, 0.62, -0.72]], feet: 'stay', ft: [[-3, 0, 0], [2.5, 0, 0]], w: 1.2 },
  fishslap: { yaw: 0.15, pitch: 0.22, dx: 3, fl: [[0.82, 0.42, -0.08], [-0.5, 0.62, -0.42]], feet: 'stay', ft: [[4.5, 0, 0], [-3, 0, 0]], w: 1.15 },
  walup: { pitch: -0.24, up: 1.5, fl: [[-0.35, 0.55, 0.76], [-0.35, -0.55, 0.76]], feet: 'stay', ft: [[0.8, 1.2, -0.2], [-0.8, 1.2, 0.2]], w: 1.3 },
  wallop: { pitch: 0.48, up: -3, dx: 4, fl: [[0.85, 0.45, -0.3], [0.85, -0.45, -0.3]], feet: 'stay', ft: [[4, 0, 0], [-3, 0, 0]], w: 1.3 },
  crouch: { pitch: 0.6, up: -7.5, sh: 1, fl: [[-0.76, -0.33, -0.56], [-0.76, 0.33, -0.56]], feet: 'stay', ft: [[1.5, 0, -0.3], [1.5, 0, 0.3]], w: 1.4 },
  belly: { lie: [2, 0], pitch: Math.PI / 2, bend: [[3, 0, 30], -0.4, 29, 40], fl: [[0.35, -0.78, -0.5], [0.35, 0.78, -0.5]], feet: 'lie', spread: 1 },
  armup: { pitch: -0.16, up: -1.5, fl: [[0.22, -0.84, -0.5], [0.22, 0.84, -0.5]], feet: 'stay', ft: [[0.5, 0, -0.35], [0.5, 0, 0.35]], w: 1.5 },
  burst: { pitch: -0.18, up: 1, fl: [[0.15, -0.82, 0.55], [0.15, 0.82, 0.55]], feet: 'stay', ft: [[1, 0, -0.3], [-1, 0, 0.3]], w: 1.3 },
  leap: { pitch: -0.1, up: 3, fl: [[-0.4, -0.36, 0.84], [-0.4, 0.36, 0.84]], feet: 'stay', ft: [[0.5, 1.8, 0], [-0.5, 1.8, 0]], w: 0.85 },
  summon: { pitch: -0.22, up: 1, fl: [[0.15, -0.55, 0.82], [0.15, 0.55, 0.82]], feet: 'stay', ft: [[0.5, 0, -0.2], [0.5, 0, 0.2]], w: 1.3 },
};
walkCycle(4.2, 3.2, 1.1, 0.13, 0.5).forEach((W, k) => {
  const f = W.sw;   // the right flipper swings back as the right foot goes forward
  TUX_POSES['walk' + k] = { ...W, pitch: 0.05, feet: 'stay', fl: [[-f * 0.8 + 0.12, -0.5, -0.85], [f * 0.8 + 0.12, 0.5, -0.85]] };
});
function tuxPosed(mood, pose) {
  const P = TUX_POSES[pose], out = [], BK = hex('#25272e'), Y = hex('#f7b21b'), YD = hex('#dc840e'), LEG = hex('#eda019'), EW = hex('#ffffff'), MOUTH = hex('#6e1a1e'), TONGUE = hex('#e46a6f');
  const prof = smoothProf([[-0.5, 0], [0.6, 11], [3, 16.4], [10, 18.8], [17, 18.2], [26, 15.2], [34, 12.6], [41, 11], [46, 8], [48.8, 4], [49.4, 0]]);
  lathe(out, prof, 0.86, 1.06, BK, PATCH_GLOSS);
  const eye = mood === 'ko' || mood === 'dizzy' || pose === 'hurt' ? 1.12 : 1;   // (eyes a touch wider when hit)
  for (const s of [-1, 1]) tuxEye(out, s, eye, EW);
  const drop = mood === 'happy' || pose === 'summon' ? 3.4 : mood === 'ko' ? 1.7 : pose === 'hurt' || pose === 'air' || pose === 'wallop' ? 1.6 : pose === 'strike' || pose === 'fishslap' || pose === 'walup' || pose === 'flop' || pose === 'leap' || pose === 'burst' ? 1.1 : 0;
  if (drop) { ellipsoid(out, [10.2, 0, 31.3 - drop * 0.5], [[3.6, 0, 0], [0, 5.6, 0], [0, 0, 1 + drop * 0.5]], MOUTH, MATTE, 18, 12, 0); ellipsoid(out, [11.6, 0, 30 - drop * 0.6], [[1.6, 0, 0], [0, 3, 0], [0, 0, 0.8]], TONGUE, MATTE, 12, 8, 0); }
  ellipsoid(out, [10.9, 0, 30.2 - drop], [[4.3, 0, 0], [0, 6.6, 0], [0, 0, 1.9]], YD, MATTE, 22, 12);
  ellipsoid(out, [11.6, 0, 33.2], [[4.9, 0, 0], [0, 8, 0], [0, 0, 2.6]], Y, GLOSS, 24, 14);
  const head = out.length;
  for (const s of [-1, 1]) {   // flippers: flat, the broad side out (or up, held out level)
    const L = norm(P.fl[s < 0 ? 0 : 1]), sh = [1 + (P.sh || 0), s * 14.3, 28.8];
    let thin = cross(L, [1, 0, 0]); if (Math.hypot(...thin) < 0.35) thin = cross(L, [0, 0, 1]);
    thin = norm(thin); const wide = cross(thin, L);
    ellipsoid(out, add(sh, scl(L, 9)), [scl(L, 10.5), scl(wide, 3.8), scl(thin, 1.7)], BK, GLOSS, 20, 12);
  }
  const body = out.length, H = TUX_LIFT, hip = s => [3, s * 6.8, 2.5];
  // a foot: flat and orange, three toes, centre c, toes along f, sole facing up; its stubby leg from the hip to the heel
  const foot = (c, f, up, hp) => {
    const sd = norm(cross(up, f));
    ellipsoid(out, c, [scl(f, 6.2), scl(sd, 4.4), scl(up, 1.7)], Y, MATTE, 20, 12);
    for (const k of [-1, 0, 1]) ellipsoid(out, add(c, add(scl(f, 5.6), scl(sd, k * 2.6))), [scl(f, 2), scl(sd, 1.6), scl(up, 1.4)], Y, MATTE, 12, 8);
    capsule(out, hp, add(c, add(scl(f, -2.2), scl(up, 1.2))), 2.7, LEG, MATTE);
  };
  const flat = (s, F, w = 1) => { const a = s * 0.32 + F[2], fwd = rotZ([1, 0, 0], a); return [[7.4 + F[0] - 2.4, s * 8.2 * w, 0.9 + F[1]], fwd]; };   // (2.4 back: his legs stand under him)
  if (P.feet === 'lie') {      // kicked back, soles up (built standing, laid down with him)
    for (const s of [-1, 1]) { const sp = P.spread ? 0.45 : 0.2, f = norm([0.15, s * sp, -1]); foot([-1, s * (6.5 + (P.spread ? 3 : 0)), 1.5 - H - 3], f, [1, 0, 0], hip(s)); }
    poseBody(out, out.length, P, -0.5, 16, head, H);
  } else if (P.feet === 'body') {   // tucked up, carried with him
    for (const s of [-1, 1]) { const [c, f] = flat(s, footOf(P, s), P.w); foot(add(c, [0, 0, -H]), norm(add(f, [0, 0, 0.25])), [0, 0, 1], hip(s)); }
    poseBody(out, out.length, P, -0.5, 16, head, H);
  } else {                     // planted: the body posed first, then each leg down from where its hip went
    const at = poseBody(out, body, P, -0.5, 16, head, H);
    for (const s of [-1, 1]) { const F = footOf(P, s), [c, f] = flat(s, F, P.w); foot(c, F[1] > 0.5 ? norm(add(f, [0, 0, 0.3])) : f, F[1] > 0.5 ? norm([-0.3 * f[0], -0.3 * f[1], 1]) : [0, 0, 1], at(hip(s))); }
  }
  return out;
}

// Duke's poses: each arm [upper, forearm] directions from its shoulder [right, left] (fw: shoulders further round the
// front; fist: right hand bigger; len: right arm's lengths, for a reach), the lean, legs as Tux's
const DUKE_POSES = {
  stand: { arms: [[[0.15, -0.75, -0.62], [0.45, -0.45, -0.75]], [[0.15, 0.75, -0.62], [0.45, 0.45, -0.75]]] },   // (out of his sides and down, hands a touch forward: straight out sideways they stood up behind his head like antennae)
  wind: { yaw: -0.45, pitch: -0.14, ft: [[-2.5, 0, 0], [2, 0, 0]], w: 1.15, arms: [[[-0.55, -0.6, 0.55], [-0.75, -0.05, 0.65]], [[0.55, 0.6, -0.3], [0.9, 0.05, 0.1]]] },
  strike: { yaw: 0.4, pitch: 0.3, dx: 2, fw: 0.3, fist: 1.25, ft: [[4.5, 0, 0], [-3.5, 0, 0]], arms: [[[0.85, 0.25, 0.3], [1, 0.25, 0.05]], [[-0.4, 0.75, -0.4], [-0.8, 0.3, -0.35]]] },
  block: { pitch: -0.12, fw: 0.55, w: 1.4, ft: [[0.5, 0, -0.2], [0.5, 0, 0.2]], arms: [[[0.8, 0.3, 0.55], [0.35, 0.9, 0.3]], [[0.8, -0.3, 0.62], [0.35, -0.9, 0.4]]] },
  hurt: { pitch: -0.42, roll: -0.15, up: -2.5, ft: [[3.5, 3, 0], [-1, 0, 0]], arms: [[[-0.2, -0.8, 0.55], [-0.3, -0.35, 0.88]], [[-0.25, 0.8, 0.5], [-0.35, 0.45, 0.82]]] },
  grab: { pitch: 0.16, dx: 2, fw: 0.3, ft: [[3, 0, 0], [-2, 0, 0]], w: 1.15, arms: [[[0.85, -0.3, 0.32], [1, 0.12, 0.05]], [[0.85, 0.3, 0.32], [1, -0.12, 0.05]]] },
  air: { pitch: -0.55, roll: 0.22, air: true, feet: 'body', ft: [[2, 4.5, 0], [-1, 3, 0]], arms: [[[0, -0.6, 0.8], [0.1, -0.2, 1]], [[0, 0.6, 0.8], [0.1, 0.25, 1]]] },
  butt: { pitch: 0.58, dx: 4, ft: [[-1, 0, 0], [-5, 0, 0]], arms: [[[-0.65, -0.6, 0.2], [-0.92, -0.25, 0.3]], [[-0.65, 0.6, 0.2], [-0.92, 0.25, 0.3]]] },
  // move keyframes: guard/jab1/jab2 the jab; snapup/snap Stop the World (finger up); potup/slap Hot Java (coffee pot
  // held back over his shoulder, then thrown out and down)
  guard: { pitch: 0.08, w: 1.2, fw: 0.2, fists: 1.15, ft: [[2, 0, 0], [-2, 0, 0]], arms: [[[0.55, -0.55, 0.35], [0.45, 0.35, 0.8]], [[0.55, 0.55, 0.35], [0.45, -0.35, 0.8]]] },
  jab1: { yaw: 0.3, pitch: 0.18, dx: 2, fw: 0.25, len: [9.5, 9.5], fist: 1.35, w: 1.15, ft: [[4, 0, 0], [-3, 0, 0]], arms: [[[0.95, -0.15, 0.15], [1, 0.05, 0.05]], [[0.5, 0.55, 0.35], [0.4, -0.35, 0.8]]] },
  jab2: { yaw: -0.3, pitch: 0.18, dx: 2, fw: 0.25, lens: [9.5, 9.5], len: [7.5, 7], fists: 1.3, fist: 1.15, w: 1.15, ft: [[-3, 0, 0], [4, 0, 0]], arms: [[[0.5, -0.55, 0.35], [0.4, 0.35, 0.8]], [[0.95, 0.15, 0.15], [1, -0.05, 0.05]]] },
  snapup: { pitch: -0.05, yaw: 0.15, len: [8.5, 8], finger: 1, ft: [[1, 0, 0], [-1.5, 0, 0]], arms: [[[0.3, -0.75, 0.6], [0.2, -0.3, 0.92]], [[-0.1, 0.9, -0.3], [0.5, -0.35, -0.3]]] },
  potup: { yaw: -0.5, pitch: -0.2, w: 1.2, pot: 1, ft: [[-3, 0, 0], [2.5, 0, 0]], arms: [[[-0.6, -0.55, 0.58], [-0.7, 0.05, 0.72]], [[0.6, 0.6, -0.1], [0.85, 0.1, 0.3]]] },
  slap: { pitch: 0.12, yaw: 0.3, len: [10, 9.5], fist: 1.2, ft: [[3, 0, 0], [-2.5, 0, 0]], arms: [[[0.85, -0.35, 0.4], [0.95, -0.1, 0.1]], [[-0.3, 0.85, -0.2], [-0.2, 0.75, -0.5]]] },
  snap: { pitch: -0.1, yaw: 0.22, len: [8.5, 8], finger: 1, ft: [[1, 0, 0], [-1.5, 0, 0]], arms: [[[0.15, -0.62, 0.77], [0.05, -0.15, 1]], [[-0.1, 0.9, -0.4], [0.5, -0.4, -0.3]]] },   // (the arm up and out from his side: its hand clear of his head)
  // the evade (Garbage Collect): blinkout crumpled small as he breaks into bits; blinkin back together, arms out
  blinkout: { pitch: 0.32, up: -4, w: 0.8, ft: [[0.5, 0, 0], [-0.5, 0, 0]], arms: [[[0.3, -0.4, -0.85], [0.8, 0.45, -0.2]], [[0.3, 0.4, -0.85], [0.8, -0.45, -0.2]]] },
  blinkin: { pitch: -0.12, up: 1, w: 1.25, ft: [[1.5, 0, -0.2], [-1.5, 0, 0.2]], arms: [[[0.1, -0.85, 0.5], [0.4, -0.7, 0.5]], [[0.1, 0.85, 0.5], [0.4, 0.7, 0.5]]] },
};
walkCycle(5, 3.6, 1, 0.05, 0.55).forEach((W, k) => {
  const f = W.sw;   // the right arm swings back as the right foot goes forward
  DUKE_POSES['walk' + k] = { ...W, pitch: 0.07, arms: [[[-f * 0.7 + 0.15, -0.75, -0.62], [-f * 0.9 + 0.45, -0.45, -0.75]], [[f * 0.7 + 0.15, 0.75, -0.62], [f * 0.9 + 0.45, 0.45, -0.75]]] };
});
function dukePosed(mood, pose) {
  const P = DUKE_POSES[pose], out = [], WH = hex('#f2f2ee'), BK = hex('#1d1d22'), RED = hex('#e8231a'), H = DUKE_LIFT;
  const prof = smoothProf([[-1, 0], [-0.3, 10], [1, 16], [5, 16.9], [12, 16.1], [24, 13.6], [34.6, 9.7], [42.6, 4.9], [45.4, 2], [46, 0]]);
  lathe(out, prof, 0.72, 1, WH, PATCH);
  ball(out, [8.6, 0, 20.5], pose === 'butt' ? 7.2 : 6.6, RED, GLOSS, 1, 24, 16);
  if (mood === 'sudo') for (const s of [-1, 1]) eyeAt(out, [6.2, s * 5, 31], 0, 1.4, 3.3, 3, BK);
  for (const s of [-1, 1]) {
    const [d1, d2] = P.arms[s < 0 ? 0 : 1].map(norm), a = s * (Math.PI / 2 - (P.fw || 0)), sh = [Math.cos(a) * 14 * 0.72, Math.sin(a) * 14, 19];   // (shoulder height, out of his sides)
    const [l1, l2] = s < 0 && P.len || P.lens || [7.5, 7], el = add(sh, scl(d1, l1)), hand = add(el, scl(d2, l2));
    tube(out, smoothProf([sh, add(sh, scl(d1, l1 / 2)), el, add(el, scl(d2, l2 / 2)), hand], 3), 1.35, BK, MATTE, 0.35, 12);
    const fist = 2.5 * (s < 0 && P.fist || P.fists || 1);
    ball(out, add(hand, scl(d2, 1)), fist, BK, GLOSS, 0.5, 18, 12);
    if (s < 0 && P.finger) {   // the snap: a finger and a thumb up off the hand
      const a = norm(cross(d2, Math.abs(d2[0]) > 0.9 ? [0, 0, 1] : [1, 0, 0]));
      capsule(out, add(hand, scl(d2, 2.2)), add(hand, scl(d2, 6.2)), 0.95, BK, GLOSS, 0.5);
      capsule(out, add(add(hand, scl(d2, 1.6)), scl(a, 1.6)), add(add(hand, scl(d2, 4)), scl(a, 2.8)), 0.85, BK, GLOSS, 0.5);
    }
    if (s < 0 && P.pot) {   // Hot Java's coffee pot: round blue pot, red lid, a spout
      const c = add(hand, scl(d2, fist + 4)), POT = hex('#5382a1'), LID = hex('#e8231a');
      ellipsoid(out, c, [[4.3, 0, 0], [0, 4.3, 0], [0, 0, 4.6]], POT, GLOSS, 20, 14);
      ellipsoid(out, add(c, [0, 0, 4.4]), [[2.5, 0, 0], [0, 2.5, 0], [0, 0, 1.2]], LID, GLOSS, 14, 10);
      ball(out, add(c, [0, 0, 5.8]), 1.1, LID, GLOSS, 0.5, 10, 8);
      capsule(out, add(c, [3.4, 0, 1]), add(c, [6.6, 0, 4]), 1, POT, GLOSS);
    }
  }
  // legs: short and dark, round feet (the real Duke has none: these are the fight's)
  const body = out.length, hip = s => [3.5, s * 6.4, 2.5];
  const leg = (c, f, hp) => { ellipsoid(out, add(c, scl(f, 1)), [scl(f, 4), scl(norm(cross([0, 0, 1], f)), 3.1), [0, 0, 2.3]], BK, GLOSS, 18, 12); capsule(out, hp, add(c, [-0.6 * f[0], -0.6 * f[1], 1.2]), 2, BK, MATTE); };
  const flat = (s, F, w = 1) => [[4 + F[0], s * 7.4 * w, 1.3 + F[1]], rotZ([1, 0, 0], s * 0.18 + F[2])];
  if (P.feet === 'body') {
    for (const s of [-1, 1]) { const [c, f] = flat(s, footOf(P, s), P.w); leg(add(c, [0, 0, -H]), f, hip(s)); }
    poseBody(out, out.length, P, -1, 12, 0, H);
  } else {
    const at = poseBody(out, body, P, -1, 12, 0, H);
    for (const s of [-1, 1]) { const [c, f] = flat(s, footOf(P, s), P.w); leg(c, f, at(hip(s))); }
  }
  return out;
}
// the walk frame for a phase of the stride (0..1: a whole cycle, both feet; the drawer: distance walked / stride)
export const walkPose = phase => 'walk' + (Math.floor((((phase % 1) + 1) % 1) * 4) & 3);

// Keith (C++): an obese mangy rat: paler belly, long snout, pink nose, yellowed buck teeth, thin round ears, tired
// eyes under heavy lids, scraggly whiskers, a pink foot and a bandaged stump, bare ringed tail, bald patches and sores
function cppMesh(mood, pose) {
  if (pose) return cppPosed(mood, pose);
  const out = [], F = hex('#9a907e'), MUZ = hex('#c9bea9'), PK = hex('#e9a3a4'), PD = hex('#b86a6e'), LN = hex('#2a241d');
  const prof = smoothProf([[-0.5, 0], [0.5, 10.5], [2.2, 15], [9, 17.6], [15, 17], [20, 14.6], [23.6, 10.5], [25.6, 5], [26.2, 0]]);
  const at = lathe(out, prof, 0.92, 1.14, F, PATCH);   // the belly is the patch (CPP.patches)
  // mangy tufts poking out of the sides
  for (const [az, z] of [[-1.65, 9], [-1.95, 16], [1.62, 12], [2.0, 20], [-2.5, 22], [2.8, 8]]) { const [p, n] = at(az, z); tube(out, [sub(p, n), add(p, scl(n, 3.2))], t => 2.3 * (1 - t) + 0.25, F, MATTE, 1, 7); }
  // bald patches, sores, a sticking plaster
  for (const [az, z, r1, r2] of [[-1.5, 13, 2.8, 1.9], [1.45, 6, 2.3, 1.6], [0.35, 7, 1.7, 1.2]]) { const [p, n] = at(az, z); decal(out, p, n, r1, r2, 0.5, hex('#dca096')); }
  for (const [az, z] of [[-1.42, 12.6], [-0.22, 5], [1.5, 6.4], [0.33, 15.5]]) { const [p, n] = at(az, z); decal(out, add(p, scl(n, 0.2)), n, 0.9, 0.9, 0.5, hex('#9b3a30')); }
  { const [p, n] = at(-0.55, 6.5); for (const r of [0.7, -0.7]) decal(out, add(p, scl(n, 0.25)), n, 3.2, 1.1, 0.45, hex('#e4be8a'), r); }
  // head, snout, nose, teeth
  const HC = [0.5, 0, 35], HR = [10.4, 12, 10.2];
  ellipsoid(out, HC, [[HR[0], 0, 0], [0, HR[1], 0], [0, 0, HR[2]]], F);
  ellipsoid(out, [8, 0, 30.5], [[7, 0, 0], [0, 5.4, 0], [0, 0, 4.4]], MUZ);
  ellipsoid(out, [15, 0, 31.2], [[1.8, 0, 0], [0, 2.3, 0], [0, 0, 1.7]], hex('#d76a80'), GLOSS, 16, 10);
  for (const s of [-1, 1]) ellipsoid(out, [12.4, s * 0.85, 26.6], [[0.6, 0, 0], [0, 0.78, 0], [0, 0, 1.35]], hex(s > 0 ? '#e3d394' : '#ece0a6'), MATTE, 10, 8, 0.5);
  if (mood === 'happy') ellipsoid(out, [11.6, 0, 26.4], [[2.4, 0, 0], [0, 3, 0], [0, 0, 1.9]], hex('#6e2234'), MATTE, 16, 10, 0.4);
  if (mood === 'ko' || mood === 'dizzy') ellipsoid(out, [12.3, 1.5, 25], [[1.2, 0, 0], [0, 1.3, 0], [0, 0, 1.9]], hex('#e0707e'), MATTE, 12, 8, 0.5);   // tongue lolling out
  for (const s of [-1, 1]) {
    eyeAt(out, [8.8, s * 4.8, 36], s * 0.15, 2, 3.2, 3.5, hex('#efe8c8'));
    // ears: round, thin, facing forward, pink inside
    const c = [-1.4, s * 10.6, 43.6], n = norm([1, s * 0.4, 0.1]);
    decal(out, c, n, 6.4, 6.4, 1.3, F, 0, 1);
    decal(out, add(c, scl(n, 0.9)), n, 4, 4, 0.6, hex('#e8a6a6'));
    // whiskers: long and scraggly, one of them bent
    for (const [dz, ez] of [[-0.8, 3.4], [0.4, 0.4], [1.5, -2.8]]) {
      const z = 29.6 - dz, p0 = [11.3, s * 4.4, z], end = s > 0 && dz > 1 ? [[13.6, s * 9.5, z - 0.8], [14.4, s * 12.5, z - 4]] : [[12.8, s * 9, z + ez * 0.25], [13.6, s * 14.5, z + ez]];
      tube(out, [p0, ...end], 0.26, LN, MATTE, 0, 5);
    }
    // little arms resting on the belly, pink paws
    capsule(out, [3, s * 13.5, 22], [15, s * 8.2, 21.3], 2.4, F);
    ball(out, [16.4, s * 7.4, 21.2], 2, PK, MATTE, 1, 14, 9);
  }
  for (const [y0, y1] of [[-1.5, -2.6], [1.3, 2.1]]) tube(out, [[-0.5, y0, 44.4], [-0.7, y1, 47.4]], 0.4, LN, MATTE, 0, 5);   // scruffy hairs
  // hind legs: a pink foot on its right; on its left a stump, bandaged, with blood seeping through
  ellipsoid(out, [11, -8.5, 1.2], [[5, 0, 0], [0, 2.6, 0], [0, 0, 1.6]], PK, MATTE, 16, 10);
  ellipsoid(out, [9.5, 12.4, 3.2], [[4.6, 0, 0], [0, 3.6, 0], [0, 0, 3.4]], F, MATTE, 16, 10);
  ellipsoid(out, [13, 13.6, 3], [[3, 0, 0], [0, 2.8, 0], [0, 0, 2.7]], hex('#f2eee4'), MATTE, 16, 10);
  decal(out, [15.9, 14, 3.2], [1, 0.25, 0], 1.2, 1.2, 0.5, hex('#c0392b'));
  // the tail: long, bare and pink with rings, out of the back, a limp curl at the tip
  const tail = smoothProf([[-14, 5, 3.5], [-19, 7, 2.2], [-24, 9, 2.6], [-27.6, 10, 6], [-27.4, 10.4, 10], [-24.8, 10, 11.2], [-23.2, 9.6, 9.6]], 4);
  tube(out, tail, t => 1.9 - 1.3 * t, i => i % 3 === 2 ? PD : PK, MATTE, 0.8, 8);
  return out;
}

// the Octocat (GitHub's Mona): charcoal cat head, peach face, on an octopus body with five curling tentacles
function octoMesh(mood, pose) {
  if (pose) return octoPosed(mood, pose);
  const out = [], D = hex('#2f353e'), MOUTH = hex('#7c4f42'), HC = [0, 0, 30], HR = [11, 17.8, 13.8];
  ellipsoid(out, HC, [[HR[0], 0, 0], [0, HR[1], 0], [0, 0, HR[2]]], D, PATCH, 36, 22);   // the face is the patch (OCTO.patches)
  ellipsoid(out, [0, 0, 10.5], [[8.5, 0, 0], [0, 10, 0], [0, 0, 6.5]], D, MATTE, 24, 14);
  for (const az of [0, 1.08, -1.08, 2.24, -2.24]) {   // tentacles: down and out, then curling up tighter and tighter
    const pts = [], n = 20, len = 25, turn = 4.9; let r = 6.5, z = 8.5, a = -0.62;
    for (let i = 0; i <= n; i++) { const f = i / n; pts.push([Math.cos(az) * r, Math.sin(az) * r, z]); a += turn * 3 * f * f / n; const ds = len / n * (1.35 - 0.75 * f); r += Math.cos(a) * ds; z += Math.sin(a) * ds; }
    tube(out, pts, t => 3.2 - 2.5 * t, D, MATTE, 1, 10);
  }
  for (const s of [-1, 1]) {
    tube(out, [[-1.5, s * 11.2, 38.4], [-1.8, s * 13.4, 44.4], [-2, s * 15.2, 49.4]], t => 5.4 - 4.9 * t, D, MATTE, 1, 12);   // ears
    decal(out, [1.2, s * 13.2, 43.4], [1, s * 0.15, 0.1], 1.6, 3, 0.5, hex('#4f3f48'));
    const [ep] = onFront(HC, HR, s * 6, 28.4); eyeAt(out, add(ep, [-1, 0, 0]), s * 0.1, 2, 3, 4, hex('#2e1810'), 0.5);
    const [cp, cn] = onFront(HC, HR, s * 9.8, 22.4, 0.05); decal(out, cp, cn, 2.5, 1.4, 0.4, hex('#f2a8a4'));   // cheeks
    for (const [z0, z1] of [[23.4, 24.8], [22, 21]]) { const [p0] = onFront(HC, HR, s * 9.2, z0, 0.2), [p1] = onFront(HC, HR, s * 12.6, (z0 + z1) / 2, 0.4); tube(out, [p0, p1, [p1[0] - 1.6, s * 16.4, z1]], 0.27, hex('#8a5a4a'), MATTE, 0, 5); }
  }
  ellipsoid(out, add(onFront(HC, HR, 0, 23.7)[0], [-0.5, 0, 0]), [[1.3, 0, 0], [0, 1.9, 0], [0, 0, 1.3]], hex('#e0768a'), GLOSS, 14, 10, 0.6);   // nose
  const line = f => { const pts = []; for (let i = 0; i <= 12; i++) { const y = -2.6 + 5.2 * i / 12; pts.push(onFront(HC, HR, y, f(y), 0.15)[0]); } tube(out, pts, 0.32, MOUTH, MATTE, 0, 6); };
  if (mood === 'happy') ellipsoid(out, onFront(HC, HR, 0, 20.9, -0.4)[0], [[1, 0, 0], [0, 2.6, 0], [0, 0, 1.7]], hex('#a8434f'), MATTE, 14, 10, 0.4);
  else if (mood === 'ko' || mood === 'dizzy') line(y => 20.6 + 0.6 * Math.sin(y * Math.PI / 2.4));
  else { line(y => 21.7 - 1.0 * Math.sin(Math.PI * Math.min(1, Math.abs(y) / 2.4))); tube(out, [onFront(HC, HR, 0, 22.7, 0.15)[0], onFront(HC, HR, 0, 21.7, 0.15)[0]], 0.32, MOUTH, MATTE, 0, 6); }
  return out;
}

// Ferris (Rust's crab): orange half-dome shell with rounded spikes, glossy eyes on stalks, a smile, open claws up,
// three pointed legs a side
function ferrisMesh(mood, pose) {
  if (pose) return ferrisPosed(mood, pose);
  const out = [], OR = hex('#f74c00'), DK = hex('#b03500'), LN = hex('#3a1000'), EB = hex('#121212');
  const W = 20.5, Hd = 19.5, k = 0.74, Z0 = 6;
  const at = lathe(out, smoothProf([[2.4, 0], [3, 12], [4.4, 18.5], [6, 20.5], [10, 20.1], [15, 18.2], [20, 14.3], [23.6, 8.8], [25, 4], [25.5, 0]], 3), k, 1, OR, PATCH);   // the underside is the patch (FERRIS.patches)
  const dome = (az, lat) => { const c = Math.cos(lat); return [[k * W * c * Math.cos(az), W * c * Math.sin(az), Z0 + Hd * Math.sin(lat)], norm([c * Math.cos(az) / (k * W), c * Math.sin(az) / W, Math.sin(lat) / Hd])]; };
  // spikes pointing up and out (so they stand on the outline from any side): a ring round the top (none in front,
  // at the eyes) and two over the crown
  for (const [lat, n, ph, len] of [[0.72, 11, 0.5, 4.2], [1.22, 2, 0.5, 3.8]]) for (let i = 0; i < n; i++) {
    const az = TAU * (i + ph) / n; if (Math.cos(az) > 0.84) continue;
    const [p, nn] = dome(az, lat), d = norm(add(nn, [0, 0, 1.1])); tube(out, [sub(p, nn), add(p, scl(d, len))], t => 2.6 - 2 * t, OR, MATTE, 0.75, 9);
  }
  for (const s of [-1, 1]) {
    // eyes on short stalks out of the top of the front
    const [p, nn] = dome(s * 0.42, 0.62), e = add(p, add(scl(nn, 3.2), [0.6, s * 0.4, 1.6]));
    tube(out, [sub(p, nn), sub(e, [0.5, 0, 2.6])], 1.5, OR, MATTE, 1, 8);
    eyeAt(out, e, s * 0.25, 3, 3.6, 4.6, EB);
    // arms up to the claws: a round palm, two fingers held open in a V
    tube(out, smoothProf([[2, s * 15, 9], [3, s * 22.5, 12.5], [3.5, s * 25.8, 18]], 3), 1.8, OR, MATTE, 1, 9);
    const c = [3.6, s * 26.4, 22.4];
    ellipsoid(out, c, [[4.4, 0, 0], [0, 5.4, 0], [0, 0, 5]], OR, MATTE, 22, 14);
    for (const [dy, dz, a, l, w] of [[2.3, 5.2, 0.38, 6.2, 2.9], [-2.6, 4.6, -0.5, 5.6, 2.5]]) {
      const u = [0, s * Math.sin(a), Math.cos(a)], v = [0, Math.cos(a) * s, -Math.sin(a)];
      ellipsoid(out, add(c, [0, s * dy, dz]), [scl(u, l), scl(v, w), [3.1, 0, 0]], OR, MATTE, 18, 12);
    }
    // legs: three a side, out and down to a point
    for (let i = 0; i < 3; i++) { const x = 4 - 5.5 * i, sp = 1 + 0.3 * i; tube(out, smoothProf([[x, s * 12.5, 5], [x - 1 * sp, s * 20, 4], [x - 1.6 * sp, s * 24, -0.8]], 3), t => 1.5 - 0.9 * t, DK, MATTE, 1, 8); }
  }
  // a little smile under the eyes
  const smile = []; for (let i = 0; i <= 12; i++) { const a = Math.PI * (0.2 + 0.6 * i / 12), y = 3.6 * Math.cos(a), z = 11.5 - 3.6 * Math.sin(a), [p] = at(Math.asin(y / 19.6), z); smile.push(add(p, [0.3, 0, 0])); }
  tube(out, smile, 0.42, LN, MATTE, 0, 6);
  return out;
}

// Pyth (Python): a blue snake with a yellow belly (the logo's colours) coiled twice in the seat, tail tip curling up
// on its left, a wide round head with a yellow jaw; tongue out when happy
function pythMesh(mood, pose) {
  if (pose) return pythPosed(mood, pose);
  const out = [], B = hex('#3776ab'), Y = hex('#ffd43b'), LN = hex('#122b44');
  const pts = [], rad = [], belly = [];   // the path from the tail tip to the head, its radius and which way its belly faces
  for (const [p, r] of [[[-1.6, 19.6, 10], 0.9], [[-2.2, 22.6, 9], 1.5], [[-2.2, 23.6, 5.6], 2.3], [[-0.6, 20, 3.4], 3.8]]) { pts.push(p); rad.push(r); belly.push(norm([-0.2, 0.6, -0.8])); }
  const th0 = 1.32, turns = 1.78, m = 44;
  for (let i = 0; i <= m; i++) {
    const s = i / m, u = Math.min(1, Math.max(0, (s - 0.42) / 0.4)), e = u * u * (3 - 2 * u), th = th0 - s * turns * TAU, r = 13 - 4 * e;
    pts.push([r * Math.cos(th), r * Math.sin(th), 4.8 + 6.8 * e]); rad.push(6 - 0.6 * e); belly.push(norm([Math.cos(th) * 0.8, Math.sin(th) * 0.8, -0.6]));
  }
  for (const [p, r] of [[[-2.6, 2, 15.6], 5.3], [[0.6, 0, 20.6], 5], [[2.2, 0, 26], 4.8], [[2.8, 0, 30.6], 4.8]]) { pts.push(p); rad.push(r); belly.push([1, 0, 0]); }
  const path = smoothProf(pts, 2), R = t => { const f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)); return rad[i] + (rad[i + 1] - rad[i]) * (f - i); };
  const bellyAt = i => belly[Math.min(belly.length - 1, Math.round(i / 2))];
  tube(out, path, R, (i, n) => { const b = bellyAt(i); return n && dot(n, b) > 0.42 ? Y : B; }, MATTE, 1, 16);
  // head: wide and round, the jaw yellow (PYTH.patches)
  const HC = [3.4, 0, 36], HR = [9.6, 12.6, 8.4];
  ellipsoid(out, HC, [[HR[0], 0, 0], [0, HR[1], 0], [0, 0, HR[2]]], B, PATCH, 32, 20);
  for (const s of [-1, 1]) {
    const [ep, en] = onFront(HC, HR, s * 5.2, 38.4); eyeAt(out, sub(ep, scl(en, 1.1)), s * 0.34, 2.8, 4, 4.3, hex('#ffffff'));
    const [np] = onFront(HC, HR, s * 1.9, 33.6, -0.2); ball(out, np, 0.65, LN, MATTE, 0, 8, 6);
  }
  if (mood === 'happy') {   // the forked tongue, flicking out
    const [mp] = onFront(HC, HR, 0, 31.2); const tip = add(mp, [4.6, 0, -1]);
    tube(out, [sub(mp, [1, 0, 0]), tip], 0.5, hex('#e5484d'), MATTE, 0.4, 6);
    for (const s of [-1, 1]) tube(out, [tip, add(tip, [1.8, s * 1.5, -1])], 0.42, hex('#e5484d'), MATTE, 0.4, 6);
  }
  return out;
}

// Docky (Moby Dock): chunky blue whale, white underneath, smile, pink cheeks, little flippers, tail up, a stack of
// shipping containers on its back (four, three, one; two deep); a spout when happy
function dockyMesh(mood, pose) {
  if (pose) return dockyPosed(mood, pose);
  const out = [], B = hex('#2496ed'), BD = hex('#1462ad'), LN = hex('#0a3561'), BOX = hex('#3aa6f4'), RIB = hex('#a9dcff');
  // the body: [x, centre height, half width, half height], tail to nose
  const prof = smoothProf([[-17.5, 9, 3.4, 3.2], [-13, 9.6, 6.6, 6.4], [-6, 10.8, 9.8, 10], [2, 11.4, 11.4, 11.4], [12, 11.6, 11.6, 11.6], [18.5, 11.4, 11, 11], [22.8, 11, 8.8, 8.8], [25.2, 10.6, 5.6, 5.8], [26.2, 10.3, 1.6, 1.8]], 4);
  sweep(out, prof.map(p => [p[0], 0, p[1]]), t => prof[Math.round(t * (prof.length - 1))][2], t => prof[Math.round(t * (prof.length - 1))][3], [0, 0, 1], B, PATCH, 1, 28);   // the belly is the patch (DOCKY.patches)
  const sec = x => { for (let i = 0; i < prof.length - 1; i++) if (x <= prof[i + 1][0]) { const f = (x - prof[i][0]) / (prof[i + 1][0] - prof[i][0]); return prof[i].map((v, k) => v + (prof[i + 1][k] - v) * f); } return prof[prof.length - 1]; };
  const side = (x, z) => { const [, cz, w, h] = sec(x), q = 1 - ((z - cz) / h) ** 2; return q > 0 ? w * Math.sqrt(q) : 0; };   // half width at x, z
  // tail up behind, flukes spread out flat
  sweep(out, smoothProf([[-15, 0, 9.3], [-19.5, 0, 12], [-22.6, 0, 16.6], [-24.4, 0, 21.6]], 3), t => 3.6 - 1.6 * t, t => 3.3 - 1.4 * t, [0, 1, 0], B, MATTE, 1, 12);
  for (const s of [-1, 1]) {
    const nf = norm([0.55, 0, 0.83]), L0 = [-0.35, s, 0.25], L = norm(sub(L0, scl(nf, dot(L0, nf)))), Wd = cross(nf, L);
    ellipsoid(out, add([-25, 0, 22.6], scl(L, 5.4)), [scl(L, 6.4), scl(Wd, 3.2), scl(nf, 1.2)], B, MATTE, 20, 12);
    // flippers, low on the sides
    const fl = norm([-0.6, s * 0.45, -0.66]), ft = norm(cross(fl, [0, 0, 1])), fw = cross(ft, fl);
    ellipsoid(out, [2.5, s * 11, 4.6], [scl(fl, 5.2), scl(fw, 2.3), scl(ft, 1)], BD, MATTE, 18, 10);
    // eyes, cheeks, the smile (round the front of the head to the other side)
    eyeAt(out, [15.6, s * (side(15.6, 13.6) - 0.9), 13.6], s * 1.0, 1.9, 2.7, 2.9, hex('#ffffff'));
    decal(out, [18, s * (side(18, 10.4) + 0.05), 10.4], [0.25, s, -0.15], 1.9, 1.5, 0.4, hex('#f19ac4'));
    const smile = []; for (let i = 0; i <= 10; i++) { const x = 13 + (26.05 - 13) * i / 10, z = 7.8 + 1.1 * Math.sin(Math.PI * i / 20); smile.push([x + 0.25, s * (side(x, z) + 0.25), z]); }
    tube(out, smile, 0.48, LN, MATTE, 0, 6);
  }
  // the containers: rows of four, three and one on the back, two deep, ribbed along their sides
  for (const [z, xs, ys] of [[25.4, [-5.1, 1.3, 7.7, 14.1], [-3.15, 3.15]], [30.9, [1.3, 7.7, 14.1], [-3.15, 3.15]], [36.4, [7.7], [0]]]) for (const x of xs) for (const y of ys) {
    rbox(out, [x, y, z], [2.95, 3, 2.6], BOX, MATTE);
    for (const s of y ? [Math.sign(y)] : [-1, 1]) for (const dx of [-1.4, 0, 1.4]) ellipsoid(out, [x + dx, y + s * 3, z], [[0.42, 0, 0], [0, 0.35, 0], [0, 0, 1.9]], RIB, MATTE, 8, 6, 0);
  }
  if (mood === 'happy') for (const [p, r] of [[[20.4, 0, 27.2], 1.5], [[21.6, 2.4, 31], 1.7], [[21.6, -2.4, 31], 1.7], [[20.6, 0, 34.4], 1.9]]) ball(out, p, r, hex('#bfe6ff'), GLOSS, 0.5, 12, 8);   // a spout
  return out;
}

// Swifty (Swift): the logo's swift sitting up: orange body reddening to the tail, white throat, yellow beak, a brow,
// a crest, long swept-back wings, forked tail
function swiftyMesh(mood, pose) {
  if (pose) return swiftyPosed(mood, pose);
  const out = [], OR = hex('#f67a34'), RED = hex('#d93d26'), LN = hex('#3e0e03'), YB = hex('#ffc94a'), W = hex('#fff4ec');
  const body = smoothProf([[-10, 0, 6.4, 2.4], [-5, 0, 9.4, 6.4], [0, 0, 13.6, 8.6], [5, 0, 18.6, 8.4], [9, 0, 24.4, 6.8]], 3);
  sweep(out, body.map(p => p.slice(0, 3)), t => body[Math.round(t * (body.length - 1))][3], t => body[Math.round(t * (body.length - 1))][3], [0, 1, 0], OR, PATCH, 1, 24);   // the red rear is a patch (SWIFTY.patches)
  const HC = [12, 0, 30.6], HR = [8.2, 7.6, 7.8];
  ellipsoid(out, HC, [[HR[0], 0, 0], [0, HR[1], 0], [0, 0, HR[2]]], OR, MATTE, 30, 20);
  const A = norm([0.62, 0, 0.78]), nf = norm([0.78, 0, -0.62]);
  ellipsoid(out, [9.4, 0, 17.6], [scl(A, 11.5), [0, 4.4, 0], scl(nf, 3.4)], W, MATTE, 24, 14, 0.5);                    // the white throat
  tube(out, [[18.6, 0, 30.4], [25.6, 0, 29.2]], t => 2.5 - 2.1 * t, YB, MATTE, 1, 10);                                   // beak
  tube(out, smoothProf([[9.6, 0, 37.2], [6, 0, 40.8], [3.4, 0, 40.6]], 3), t => 2.3 - 1.4 * t, hex('#f06a2e'), MATTE, 1, 9);   // crest
  for (const s of [-1, 1]) {
    const [ep, en] = onFront(HC, HR, s * 4.2, 32.2); eyeAt(out, sub(ep, scl(en, 1.3)), s * 0.55, 2.4, 3.3, 3.6, hex('#ffffff'));
    if (mood !== 'blink' && mood !== 'happy') tube(out, [onFront(HC, HR, s * 6.6, 36.6, 0.3)[0], onFront(HC, HR, s * 2.4, 35.4, 0.4)[0]], 0.7, LN, MATTE, 0, 6);   // the brow, set
    // wings: long, flat, swept back along the sides, the tips down over the tail
    sweep(out, smoothProf([[4, s * 6.4, 20.4], [-3, s * 11, 20], [-11, s * 14.2, 18.4], [-20, s * 15.6, 15.6]], 3), t => 4.4 - 3.8 * t * t, t => 1.2 - 0.8 * t, [0, 0, 1], i => i > 4 ? RED : OR, MATTE, 1, 12);
    // the forked tail
    sweep(out, smoothProf([[-8, s * 1, 7.6], [-16, s * 3.6, 8.2], [-25, s * 6.4, 9.8]], 3), t => 2.8 - 2.4 * t, t => 1 - 0.6 * t, [0, 0, 1], RED, MATTE, 1, 10);
  }
  return out;
}

// Bugdroid (Android): half-dome head with antennae and white dot eyes, a gap, a tin-can body, capsule arms, stubby
// legs. Happy: an arm up; knocked out: arms out, antennae flopped
function droidMesh(mood, pose) {
  if (pose) return droidPosed(mood, pose);
  const out = [], G = hex('#3ddc84'), W = hex('#ffffff'), arc = (zc, wc, r, a0, a1, n = 5) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [zc + r * Math.sin(a), wc + r * Math.cos(a)]; });
  lathe(out, [[2, 0], [2, 3.2], ...arc(6.6, 6.4, 4.6, -Math.PI / 2, 0), [12, 11], ...arc(22, 9.4, 1.6, 0, Math.PI / 2, 3), [23.6, 4], [23.6, 0]], 1, 1, G);
  lathe(out, [[25.2, 0], [25.2, 9], ...arc(25.8, 10.4, 0.6, -Math.PI / 2, 0, 2), ...arc(25.2, 0, 11, 0.06, Math.PI / 2, 12).slice(1)], 1, 1, G);
  const HC = [0, 0, 25.2], HR = [11, 11, 11], ko = mood === 'ko', big = ko || mood === 'dizzy' || mood === 'sudo';
  for (const s of [-1, 1]) {
    const [ep, en] = onFront(HC, HR, s * 4.7, 30.2), r = big ? 2.6 : 2.2; eyeAt(out, sub(ep, scl(en, 0.3)), s * 0.5, 0.9, r, r, W, 0.6);
    const a = 0.5 + (ko ? 1.05 : 0), b = [0, s * 5.6, 34.8];
    tube(out, [sub(b, [0, s * 1.2, 1.4]), add(b, [0, s * Math.sin(a) * 6.2, Math.cos(a) * 6.2])], 0.95, G, MATTE, 1, 9);   // antennae
    const sh = [0, s * 14.6, 20.2], d = s > 0 && mood === 'happy' ? [0, 0.52, 0.86] : ko ? [0, s * 0.25, -0.97] : [0, 0, -1];
    tube(out, [sh, add(sh, scl(d, 10))], 2.8, G, MATTE, 1, 12);                                                                    // arms
    tube(out, [[0, s * 4.6, 3.4], [0, s * 4.6, -0.4]], 2.7, G, MATTE, 1, 12);                                                     // legs
  }
  return out;
}

// ---------------------------------------------------------------- fight poses: the other eight
// Built like Tux's and Duke's (poseBody, walkCycle, footOf). Shared: BODY (lean, twist, feet) and ARMS (each arm
// [upper, fore] as [forward, out, up], out away from the body so one entry fits either side; [right, left]). Each has
// 'stand' 'wind' 'strike' 'block' 'hurt' 'grab' 'air', its signature poses and the walk. None lies down.
const armOut = (d, s) => norm([d[0], s * d[1], d[2]]);
const armOf = (P, s) => P.arms[s < 0 ? 0 : 1];
const perp = d => { const a = norm(cross(d, Math.abs(d[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1])); return [a, cross(d, a)]; };
const BOTH = a => [a, a];
const BODY = {
  stand: {},
  wind: { yaw: -0.42, pitch: -0.12, ft: [[-2.5, 0, 0], [2, 0, 0]], w: 1.15 },
  strike: { yaw: 0.3, pitch: 0.26, dx: 2, ft: [[4.5, 0, 0], [-3, 0, 0]] },
  block: { pitch: -0.1, w: 1.35, ft: [[0.5, 0, -0.15], [0.5, 0, 0.15]] },
  hurt: { pitch: -0.38, roll: 0.15, up: -2, ft: [[3.5, 3, 0], [-1, 0, 0]] },
  grab: { pitch: 0.18, dx: 2, ft: [[3, 0, 0], [-2, 0, 0]], w: 1.15 },
  air: { pitch: -0.5, roll: 0.24, air: true, feet: 'body', ft: [[2.5, 4, 0], [-1, 2.5, 0]] },
};
const ARMS = {
  stand: BOTH([[0.1, 0.85, -0.25], [0.15, 0.4, -0.9]]),
  wind: [[[-0.55, 0.6, 0.55], [-0.75, 0.05, 0.65]], [[0.55, 0.6, -0.3], [0.9, -0.05, 0.1]]],
  strike: [[[0.85, -0.1, 0.3], [1, -0.2, 0.05]], [[-0.4, 0.75, -0.4], [-0.8, 0.3, -0.35]]],
  block: BOTH([[0.8, -0.3, 0.55], [0.35, -0.9, 0.35]]),
  hurt: [[[-0.2, 0.8, 0.55], [-0.3, 0.35, 0.88]], [[-0.25, 0.8, 0.5], [-0.35, 0.45, 0.82]]],
  grab: BOTH([[0.85, 0.3, 0.32], [1, -0.12, 0.05]]),
  air: BOTH([[0, 0.6, 0.8], [0.1, 0.2, 1]]),
};
const walkArms = f => [[[-f * 0.6 + 0.1, 0.85, -0.25], [-f + 0.15, 0.4, -0.9]], [[f * 0.6 + 0.1, 0.85, -0.25], [f + 0.15, 0.4, -0.9]]];
// a character's poses: the shared ones with its arms, its own (sig), the walk (wArms(swing): arms for a frame)
function fightPoses(sig, arms = ARMS, wArms = walkArms, walk = walkCycle(4.4, 3.2, 1, 0.08, 0.5), walkPitch = 0.06) {
  const P = {};
  for (const k in BODY) P[k] = { ...BODY[k], arms: arms[k] };
  for (const k in sig) P[k] = sig[k];
  walk.forEach((W, k) => { P['walk' + k] = { ...W, pitch: walkPitch, arms: wArms(W.sw) }; });
  return P;
}
// an arm of two parts from the shoulder sh, A = [upper, fore] ([forward, out, up]), l1 l2 long; returns its end and
// the forearm's direction (for a paw)
function arm2(out, sh, A, s, l1, l2, r, col, kind = MATTE, o = 1) {
  const d1 = armOut(A[0], s), d2 = armOut(A[1], s), el = add(sh, scl(d1, l1)), end = add(el, scl(d2, l2));
  tube(out, smoothProf([sh, add(sh, scl(d1, l1 / 2)), el, add(el, scl(d2, l2 / 2)), end], 3), r, col, kind, o, 10);
  return [end, d2];
}
// the body (0..body) posed and stood on two legs H long: hip(s) where a leg leaves the body, flat(s, F, w) the foot's
// centre and toe direction, leg(c, f, hip, s) builds it. In the air (feet: 'body') legs are tucked under and posed
// with it. Returns where an unposed point ends up.
function onLegs(out, P, body, H, r, z0, hip, flat, leg) {
  if (P.feet === 'body') {
    for (const s of [-1, 1]) { const [c, f] = flat(s, footOf(P, s), P.w); leg(add(c, [0, 0, -H]), f, hip(s), s); }
    return poseBody(out, out.length, P, z0, r, 0, H);
  }
  const at = poseBody(out, body, P, z0, r, 0, H);
  for (const s of [-1, 1]) { const [c, f] = flat(s, footOf(P, s), P.w); leg(c, f, at(hip(s)), s); }
  return at;
}

// Gopher: short blue legs, paws on reaching arms. 'dig' (bent double, clawing the ground) and 'pop' (out of its hole)
const GOPHER_POSES = fightPoses({
  dig: { pitch: 0.72, dx: 2, w: 1.25, ft: [[-1, 0, 0], [-3, 0, 0]], arms: BOTH([[0.5, 0.35, -0.8], [0.8, -0.15, -0.6]]), dirt: 1 },
  pop: { pitch: -0.18, air: true, feet: 'body', w: 0.9, ft: [[1.5, 2.5, 0], [1.5, 2.5, 0]], arms: BOTH([[0.15, 0.8, 0.6], [0.1, 0.45, 0.9]]) },
  // js/kits/gopher.js: whistle/send Goroutine Rush; scoop/uppercut/dazed Dig & Pop (crouch, the hit straight up, the
  // landing); rear/slam/pant Deadlock (paws high, driven into the ground, a miss out of breath)
  whistle: { pitch: -0.12, up: 0.5, w: 0.95, ft: [[0.5, 0, -0.1], [0.5, 0, 0.1]], arms: BOTH([[0.55, 0.55, 0.45], [0.45, -0.85, 0.3]]) },
  send: { pitch: 0.28, dx: 2, yaw: 0.1, ft: [[4, 0, 0], [-3, 0, 0]], arms: BOTH([[0.8, 0.55, 0.2], [0.85, 0.5, 0.15]]) },
  scoop: { pitch: 0.55, yaw: -0.35, up: -2.5, dx: 1.5, w: 1.3, ft: [[2, 0, -0.2], [-2.5, 0, 0.25]], arms: [[[-0.2, 0.6, -0.75], [-0.55, 0.25, -0.8]], [[0.65, 0.35, -0.65], [0.8, -0.1, -0.6]]], dirt: 1 },
  uppercut: { pitch: -0.32, yaw: 0.5, up: 3.5, w: 0.85, ft: [[1, 2.5, 0], [-1.5, 1, 0]], arms: [[[0.75, 0.3, 0.6], [0.5, -0.2, 0.85]], [[-0.3, 0.7, -0.6], [-0.55, 0.3, -0.75]]] },
  dazed: { pitch: 0.1, up: -0.6, w: 1.12, ft: [[1, 0, -0.1], [-0.5, 0, 0.1]], arms: [[[0.35, 0.6, 0.35], [0.5, 0.2, 0.55]], [[0.2, 0.85, -0.25], [0.3, 0.4, -0.85]]] },   // (a settle, not a stun: landing his weight)
  rear: { pitch: -0.3, up: 2.5, w: 1.1, ft: [[0.5, 0, -0.15], [0.5, 0, 0.15]], arms: BOTH([[0.12, 0.45, 0.88], [-0.3, -0.35, 0.89]]) },
  slam: { pitch: 0.66, dx: 2.5, up: -1, w: 1.35, ft: [[1, 0, -0.2], [-1, 0, 0.2]], arms: BOTH([[0.75, 0.3, -0.55], [0.6, -0.15, -0.8]]) },
  pant: { pitch: 0.42, up: -1.5, w: 1.25, ft: [[1, 0, -0.2], [-0.5, 0, 0.2]], arms: BOTH([[0.45, 0.6, -0.55], [0.6, 0.2, -0.75]]) },
});
function gopherPosed(mood, pose) {
  const P = GOPHER_POSES[pose], out = [], B = hex('#79d0e2'), TAN = hex('#f3d3ad'), NOSE = hex('#3b2416'), WHITE = hex('#fbfbf8'), EW = hex('#ffffff');
  const prof = smoothProf([[-0.5, 0], [0.6, 9.5], [3, 14.6], [9, 16.6], [17, 17.2], [25, 16.7], [32, 15], [38, 12.2], [42.2, 8], [44.6, 3.8], [45.3, 0]]);
  lathe(out, prof, 0.86, 1.04, B);
  const eye = mood === 'ko' || mood === 'dizzy' || pose === 'hurt' ? 1.06 : 1;
  for (const s of [-1, 1]) {
    ellipsoid(out, [-1.5, s * 11.2, 38.6], [[3.2, 0, 0], [0, 4.3, 0], [0, 0, 4.4]], B);
    eyeAt(out, [9.6, s * 7.5, 31], s * 0.2, 6.2, 8.1 * eye, 8.5 * eye, EW);
    ellipsoid(out, [16.9, s * 1.35, 15.3], [[1.1, 0, 0], [0, 1.3, 0], [0, 0, 2.3]], WHITE, MATTE, 12, 8);
    const [end, d] = arm2(out, [5, s * 14.6, 16.5], armOf(P, s), s, 7, 7.5, 2.9, B), [a, b] = perp(d);
    ellipsoid(out, add(end, scl(d, 1.6)), [scl(d, 3.3), scl(a, 3), scl(b, 2.6)], TAN);
  }
  ellipsoid(out, [13.4, 0, 19.6], [[4.6, 0, 0], [0, 7.6, 0], [0, 0, 4.9]], TAN);
  ellipsoid(out, [17.4, 0, 22.4], [[2.2, 0, 0], [0, 3.5, 0], [0, 0, 2.3]], NOSE, GLOSS, 18, 12);
  ellipsoid(out, [-15.4, 0, 4], [[2.2, 0, 0], [0, 2.6, 0], [0, 0, 2.4]], B, MATTE, 12, 8);
  const leg = (c, f, hp) => { ellipsoid(out, add(c, scl(f, 1.2)), [scl(f, 5), scl(norm(cross([0, 0, 1], f)), 3.3), [0, 0, 2.3]], TAN); capsule(out, hp, add(c, [-1.6 * f[0], -1.6 * f[1], 1.4]), 3.1, B); };
  onLegs(out, P, out.length, 7, 16, -0.5, s => [4, s * 7.8, 3.5], (s, F, w = 1) => [[7.5 + F[0], s * 8.4 * w, 1.6 + F[1]], rotZ([1, 0, 0], s * 0.25 + F[2])], leg);
  if (P.dirt) for (const [x, y, z, r] of [[25, -5, 1.6, 2.2], [27, 4, 1.4, 1.8], [23, 9, 4, 1.5], [29, -1, 6, 1.4], [26, -9, 7, 1.1]]) ball(out, [x, y, z], r, hex('#8a5a34'), MATTE, 1, 10, 7);
  return out;
}

// Ferris: three crab legs a side down to points (tripod gait: each side's front and back step with the other's
// middle), claws on the arms. 'pinch' (claws snapped shut in front) and 'shell' (tucked in, claws over its face)
const FERRIS_ARMS = {   // each claw [arm, the claw's direction, how open (1: the race's)]
  stand: BOTH([[0.55, 0.65, 0.5], [0.55, 0.1, 0.83], 1]),
  wind: [[[-0.5, 0.7, 0.5], [-0.6, 0.2, 0.8], 1.25], [[0.45, 0.8, 0.25], [0.7, 0.2, 0.7], 0.6]],
  strike: [[[0.85, 0.3, 0.42], [1, -0.05, 0.2], 1.3], [[-0.15, 0.85, 0.4], [0, 0.3, 1], 0.6]],
  block: BOTH([[0.7, 0.5, 0.5], [0.45, -0.6, 0.7], 0.12]),
  hurt: BOTH([[-0.2, 0.85, 0.5], [-0.3, 0.45, 0.9], 1.45]),
  grab: BOTH([[0.8, 0.5, 0.3], [1, -0.2, 0.15], 1.25]),
  air: BOTH([[0, 0.7, 0.7], [0, 0.25, 1], 1.3]),
};
const FERRIS_POSES = fightPoses({
  block: { ...BODY.block, w: 1.05, arms: FERRIS_ARMS.block },
  pinch: { pitch: 0.16, dx: 2, ft: [[2, 0, 0], [-1.5, 0, 0]], arms: BOTH([[0.8, 0.45, 0.45], [1, -0.3, 0.25], 0.04]) },
  shell: { lift: 0, feet: 'tuck', pitch: 0.05, arms: BOTH([[0.75, 0.55, -0.05], [0.55, -0.8, 0.2], 0.04]) },
  // js/kits/ferris.js: clawback/clawshot/clawhold/fling/clamp Borrow Claw (the springy arm and claw are drawn from
  // clawshot on); decree Ownership Lock; rev/brace/whirl/dizzy unsafe (dizzy is a calm settle, not a stun); popout
  // out of the shell
  brace: { yaw: -0.8, pitch: 0.14, lift: 3, w: 1.22, ft: [[-1.5, 0, 0], [2, 0, 0]], arms: [[[-0.65, 0.65, 0.35], [-0.75, 0.2, 0.6], 1.4], [[0.25, 0.9, 0.3], [-0.35, 0.65, 0.65], 1.3]] },
  clawback: { yaw: -0.42, pitch: -0.1, ft: [[-2, 0, 0], [2, 0, 0]], w: 1.1, arms: [[[-0.5, 0.75, 0.45], [-0.25, 0.35, 0.9], 1.5], [[0.55, 0.75, 0.25], [0.65, 0.05, 0.7], 0.6]] },
  clawshot: { yaw: 0.3, pitch: 0.16, dx: 2, ft: [[3, 0, 0], [-2, 0, 0]], arms: [[[1, 0.12, 0.12], [1, 0.02, 0.05], 0.3], [[-0.2, 0.85, 0.35], [0, 0.3, 1], 0.6]] },
  clawhold: { pitch: 0.06, w: 1.15, ft: [[1, 0, -0.1], [1, 0, 0.1]], arms: BOTH([[0.8, 0.35, 0.45], [0.75, -0.25, 0.55], 0.35]) },
  fling: { yaw: 0.55, pitch: 0.1, ft: [[3, 0, 0], [-2.5, 0, 0]], arms: [[[0.3, -0.3, 0.9], [0.1, -0.6, 0.8], 1.1], [[-0.4, 0.85, 0.3], [-0.5, 0.4, 0.7], 0.9]] },
  clamp: { pitch: 0.1, dx: 1, ft: [[1.5, 0, 0], [-0.5, 0, 0]], arms: [[[0.6, 0.55, 0.1], [0.65, 0.15, 0.6], 0.45], [[0.1, 0.9, 0.45], [0.15, 0.3, 0.95], 0.9]] },
  decree: { pitch: -0.18, up: 1, w: 1.1, arms: BOTH([[0.1, 0.6, 0.8], [0.05, 0.2, 1], 1.4]) },
  // lasso: Ownership Lock's wind-up, right claw up swinging the chain, the other out for balance
  lasso: { pitch: -0.12, up: 1, w: 1.12, ft: [[-1, 0, 0], [1.5, 0, 0]], arms: [[[0.05, 0.45, 0.9], [0, 0.1, 1], 0.5], [[0.3, 0.9, 0.3], [0.45, 0.45, 0.75], 1.1]] },
  rev: { pitch: 0.16, lift: 3, w: 1.2, ft: [[0, 0, -0.1], [0, 0, 0.1]], arms: BOTH([[0.6, 0.7, 0.1], [0.5, -0.55, 0.6], 0.3]) },
  whirl: { pitch: 0.08, w: 1.15, arms: BOTH([[0.05, 1, 0.15], [0.25, 1, 0.1], 1.25]) },
  dizzy: { pitch: 0.06, lift: 4, w: 1.12, ft: [[0.5, 0, -0.1], [0.5, 0, 0.1]], arms: BOTH([[0.15, 0.95, 0.25], [0.2, 0.4, 0.85], 0.85]) },
  popout: { pitch: -0.12, up: 2, arms: BOTH([[0, 0.7, 0.7], [0, 0.3, 1], 1.4]) },
}, FERRIS_ARMS, f => [[[0.55, 0.65, 0.5 - f * 0.25], [0.55 + f * 0.2, 0.1, 0.83 - f * 0.2], 1 + f * 0.3], [[0.55, 0.65, 0.5 + f * 0.25], [0.55 - f * 0.2, 0.1, 0.83 + f * 0.2], 1 - f * 0.3]], walkCycle(3.2, 3.5, 1.2, 0.04, 0.5), 0.04);
// the walk: a crab's scuttle, a leg lifting in turn down each side (rip: the frame), the body swaying side to side
FERRIS_POSES.walk0.rip = 0; FERRIS_POSES.walk1.rip = 1; FERRIS_POSES.walk2.rip = 2; FERRIS_POSES.walk3.rip = 3;
for (let k = 0; k < 4; k++) Object.assign(FERRIS_POSES['walk' + k], { yaw: 0, roll: 0.06 * Math.sin(k * Math.PI / 2), up: k % 2 ? 1 : 0 });
function ferrisPosed(mood, pose) {
  const P = FERRIS_POSES[pose], out = [], OR = hex('#f74c00'), DK = hex('#b03500'), LN = hex('#3a1000'), EB = hex('#121212');
  const W = 20.5, Hd = 19.5, k = 0.74, Z0 = 6, H = P.lift ?? 5;
  const at = lathe(out, smoothProf([[2.4, 0], [3, 12], [4.4, 18.5], [6, 20.5], [10, 20.1], [15, 18.2], [20, 14.3], [23.6, 8.8], [25, 4], [25.5, 0]], 3), k, 1, OR, PATCH);
  const dome = (az, lat) => { const c = Math.cos(lat); return [[k * W * c * Math.cos(az), W * c * Math.sin(az), Z0 + Hd * Math.sin(lat)], norm([c * Math.cos(az) / (k * W), c * Math.sin(az) / W, Math.sin(lat) / Hd])]; };
  for (const [lat, n, ph, len] of [[0.72, 11, 0.5, 4.2], [1.22, 2, 0.5, 3.8]]) for (let i = 0; i < n; i++) {
    const az = TAU * (i + ph) / n; if (Math.cos(az) > 0.84) continue;
    const [p, nn] = dome(az, lat), d = norm(add(nn, [0, 0, 1.1])); tube(out, [sub(p, nn), add(p, scl(d, len))], t => 2.6 - 2 * t, OR, MATTE, 0.75, 9);
  }
  // a claw: its palm at c, the fingers along U, open a share of the race's V (shut: side by side)
  const claw = (c, U, s, open) => {
    let Tk = sub([1, 0, 0], scl(U, U[0])); if (Math.hypot(...Tk) < 0.3) Tk = sub([0, 0, 1], scl(U, U[2]));
    Tk = norm(Tk); const Sp = scl(cross(U, Tk), s);
    ellipsoid(out, c, [scl(Tk, 4.4), scl(Sp, 5.4), scl(U, 5)], OR, MATTE, 22, 14);
    for (const [dy, dz, a0, l, w] of [[2.3, 5.2, 0.38, 6.2, 2.9], [-2.6, 4.6, -0.5, 5.6, 2.5]]) {
      const a = a0 * open, u = add(scl(Sp, Math.sin(a)), scl(U, Math.cos(a))), v = sub(scl(Sp, Math.cos(a)), scl(U, Math.sin(a)));
      ellipsoid(out, add(c, add(scl(Sp, dy * (0.6 + 0.4 * Math.min(1, open))), scl(U, dz))), [scl(u, l), scl(v, w), scl(Tk, 3.1)], OR, MATTE, 18, 12);
    }
  };
  for (const s of [-1, 1]) {
    const [p, nn] = dome(s * 0.42, 0.62), e = add(p, add(scl(nn, 3.2), [0.6, s * 0.4, 1.6]));
    tube(out, [sub(p, nn), sub(e, [0.5, 0, 2.6])], 1.5, OR, MATTE, 1, 8);
    eyeAt(out, e, s * 0.25, 3, 3.6, 4.6, EB);
    const A = armOf(P, s), d1 = armOut(A[0], s), d2 = armOut(A[1], s), sh = [5, s * 13, 10], el = add(sh, scl(d1, 9)), c = add(el, scl(d2, 7.5));
    tube(out, smoothProf([sh, add(sh, scl(d1, 4.5)), el, add(el, scl(d2, 3.5))], 3), 1.8, OR, MATTE, 1, 9);
    claw(c, d2, s, A[2]);
  }
  const smile = []; for (let i = 0; i <= 12; i++) { const a = Math.PI * (0.2 + 0.6 * i / 12), y = 3.6 * Math.cos(a), z = 11.5 - 3.6 * Math.sin(a), [p] = at(Math.asin(y / 19.6), z); smile.push(add(p, [0.3, 0, 0])); }
  tube(out, smile, 0.42, LN, MATTE, 0, 6);
  // the legs: from the hip up to a knee, then out and down to the point
  const leg = (hp, foot, s, kn) => tube(out, smoothProf([hp, add(scl(add(hp, foot), 0.5), [0, s * 1.5, kn]), foot], 3), t => 1.6 - 0.95 * t, DK, MATTE, 1, 8);
  // three a side spread front to back round the shell, the feet splayed out like a star (seen side-on, legs both
  // ends); walking (P.rip) one lifts at a time, the wave running front to back, the sides half a beat apart
  const SPL = [0.62, 0, -0.62], hip = (s, i) => [8.5 - 8.5 * i, s * 12, 5.5];
  const foot = (s, i, r = 12.5, w = 1) => { const [hx] = hip(s, i), a = SPL[i]; return [hx + r * Math.sin(a), s * (11 + r * Math.cos(a)) * w, -0.6]; };
  if (P.feet === 'body' || P.feet === 'tuck') {
    const tuck = P.feet === 'tuck';
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const f = foot(s, i, tuck ? 11 : 9); leg(hip(s, i), tuck ? [f[0], f[1], 0.2] : [f[0], f[1], 5 - H - 0.5], s, tuck ? 2.5 : 3); }
    poseBody(out, out.length, P, -0.8, 14, 0, H);
  } else {
    const at2 = poseBody(out, out.length, P, -0.8, 14, 0, H);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      let F = footOf(P, i % 2 ? -s : s);
      if (P.rip !== undefined) { const ph = (P.rip + i + (s > 0 ? 2 : 0)) % 4; F = [[2.5, 4, 0], [1, 0, 0], [-1, 0, 0], [-2.5, 0, 0]][ph]; }
      const f = foot(s, i, 12.5, P.w || 1);
      leg(at2(hip(s, i)), [f[0] + F[0], f[1], f[2] + F[1]], s, 5.5);
    }
  }
  return out;
}

// Pyth: no legs, it stands on its coil (walk: the coil ripples, the head sways). A pose moves neck and head: hc where
// the head goes, ha its turn [yaw, pitch (+ nose down), roll], mouth how wide; coil: wound taller. 'coil' (ready to
// strike) and 'lunge' (neck shot out, jaws wide)
const PYTH_HC = [3.4, 0, 36];
const PYTH_POSES = {
  stand: { hc: PYTH_HC },
  wind: { yaw: -0.3, pitch: -0.1, hc: [-3, -3, 35], ha: [-0.3, -0.3, 0] },
  strike: { pitch: 0.12, hc: [15, 0, 29], ha: [0, 0.35, 0], mouth: 1 },
  block: { pitch: -0.06, hc: [-0.5, 0, 28.5], ha: [0, 0.25, 0], coil: 1.25 },
  hurt: { pitch: -0.15, roll: 0.12, hc: [-5, 2, 33], ha: [0.2, -0.65, 0.25], mouth: 0.8 },
  grab: { pitch: 0.1, hc: [13, 0, 30], ha: [0, 0.2, 0], mouth: 1.4 },
  air: { air: true, pitch: -0.3, roll: 0.2, hc: [3, 0, 35], ha: [0, -0.15, 0] },
  coil: { pitch: -0.05, hc: [-4.5, 0, 34], ha: [0, 0.3, 0], coil: 2.3, rr: 0.8 },
  lunge: { pitch: 0.1, hc: [23, 0, 24], ha: [0, 0.3, 0], mouth: 1.6, fangs: 1, tongue: 1 },
  // js/kits/pyth.js: the Coil's 'rear', 'wrap', 'toss', 'sprawl' (a miss: a calm settle, no stun look); 'cast'
  // (antigravity); the whip's 'pull' and 'whip'; Slither's 'slither'
  rear: { pitch: -0.08, hc: [-3, 0, 46], ha: [0, -0.2, 0], coil: 1.9, rr: 0.85, mouth: 0.7, fangs: 1, tongue: 1 },
  wrap: { pitch: 0.12, hc: [17, 0, 24], ha: [0, 0.45, 0], coil: 0.7, rr: 0.9 },
  toss: { yaw: 0.5, pitch: -0.1, hc: [6, 8, 40], ha: [0.7, -0.3, 0.2], mouth: 0.6, coil: 1.2 },
  sprawl: { pitch: 0.08, hc: [12, 0, 25], ha: [0, 0.28, 0], coil: 0.8, rr: 1.02 },   // (no stun look after a miss: settling onto his coil)
  cast: { pitch: -0.12, hc: [0, 0, 41], ha: [0, -0.75, 0], tongue: 1, coil: 1.3 },
  pull: { yaw: -0.55, pitch: -0.08, hc: [-3, -5, 33], ha: [-0.5, 0.05, 0], coil: 1.4 },
  whip: { yaw: 0.6, pitch: 0.1, hc: [10, 5, 32], ha: [0.45, 0.2, 0], coil: 0.9, rr: 1.1, mouth: 0.5 },
  slither: { pitch: 0.1, hc: [18, 0, 12], ha: [0, 0.3, 0], coil: 0.35, rr: 1.15 },
};
[0, 1, 2, 3].forEach(k => { const w = Math.sin(k * Math.PI / 2); PYTH_POSES['walk' + k] = { hc: [4, w * 3.5, 35.5 - (1 - Math.abs(w)) * 0.6], ha: [-w * 0.25, 0.05, w * 0.1], roll: w * 0.05, ripple: k }; });
function pythPosed(mood, pose) {
  const P = PYTH_POSES[pose], out = [], B = hex('#3776ab'), Y = hex('#ffd43b'), LN = hex('#122b44'), RED = hex('#e5484d');
  const ha = P.ha || [0, 0, 0], hc = P.hc, R = v => rot3(v, ...ha), cz = P.coil || 1;
  const pts = [], rad = [], belly = [];
  for (const [p, r] of [[[-1.6, 19.6, 10], 0.9], [[-2.2, 22.6, 9], 1.5], [[-2.2, 23.6, 5.6], 2.3], [[-0.6, 20, 3.4], 3.8]]) { pts.push(p); rad.push(r); belly.push(norm([-0.2, 0.6, -0.8])); }
  const th0 = 1.32, turns = 1.78, m = 44;
  for (let i = 0; i <= m; i++) {
    const s = i / m, u = Math.min(1, Math.max(0, (s - 0.42) / 0.4)), e = u * u * (3 - 2 * u), th = th0 - s * turns * TAU;
    const r = (13 - 4 * e) * (P.rr || 1) + (P.ripple !== undefined ? 0.9 * Math.sin(th * 2 + P.ripple * Math.PI / 2) * Math.min(1, s * 4) : 0);
    pts.push([r * Math.cos(th), r * Math.sin(th), 4.8 + 6.8 * e * cz]); rad.push(6 - 0.6 * e); belly.push(norm([Math.cos(th) * 0.8, Math.sin(th) * 0.8, -0.6]));
  }
  // the neck: up out of the coil, then to under the head, whichever way the head is turned
  const ne = add(hc, R([-0.6, 0, -5.4])), p1 = [-2.6, 2, 15.6 + 6.8 * (cz - 1)], p3 = add(ne, scl(R([-0.15, 0, -1]), 4.5)), p2 = add(add(scl(p1, 0.6), scl(p3, 0.4)), [0, 0, 4]);
  const neck = [p1, p2, p3, ne];
  neck.forEach((p, i) => { const T = norm(sub(neck[Math.min(3, i + 1)], neck[Math.max(0, i - 1)])), f = [1, 0, -0.3]; pts.push(p); rad.push([5.3, 5, 4.8, 4.8][i]); belly.push(norm(sub(f, scl(T, dot(f, T))))); });
  const path = smoothProf(pts, 2), Rf = t => { const f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)); return rad[i] + (rad[i + 1] - rad[i]) * (f - i); };
  const bellyAt = i => belly[Math.min(belly.length - 1, Math.round(i / 2))];
  tube(out, path, Rf, (i, n) => { const b = bellyAt(i); return n && dot(n, b) > 0.42 ? Y : B; }, MATTE, 1, 16);
  // the head, built where the race has it, then turned and moved to hc
  const h0 = out.length, HC = PYTH_HC, HR = [9.6, 12.6, 8.4];
  ellipsoid(out, HC, [[HR[0], 0, 0], [0, HR[1], 0], [0, 0, HR[2]]], B, PATCH, 32, 20);
  const eye = mood === 'ko' || mood === 'dizzy' || pose === 'hurt' ? 1.08 : 1;
  for (const s of [-1, 1]) {
    const [ep, en] = onFront(HC, HR, s * 5.2, 38.4); eyeAt(out, sub(ep, scl(en, 1.1)), s * 0.34, 2.8, 4 * eye, 4.3 * eye, hex('#ffffff'));
    const [np] = onFront(HC, HR, s * 1.9, 33.6, -0.2); ball(out, np, 0.65, LN, MATTE, 0, 8, 6);
  }
  if (P.mouth) {   // jaws open: a dark mouth across the front, fangs down from the top of it
    const mo = P.mouth, [mp, mn] = onFront(HC, HR, 0, 31.4);
    ellipsoid(out, sub(mp, scl(mn, 0.5)), [scl(mn, 1.6), [0, 4 + mo * 1.2, 0], [0, 0, 0.9 + mo * 1.1]], hex('#6e1a2a'), MATTE, 18, 12, 0.4);
    if (P.fangs) for (const s of [-1, 1]) { const [fp] = onFront(HC, HR, s * 2.6, 31.4 + 0.9 + mo * 1.1, -0.2); tube(out, [fp, add(fp, [0.5, 0, -2.4])], t => 0.75 - 0.5 * t, hex('#ffffff'), MATTE, 0.3, 6); }
  }
  if (mood === 'happy' || P.tongue) {
    const [mp] = onFront(HC, HR, 0, 31.2), tip = add(mp, [4.6, 0, -1]);
    tube(out, [sub(mp, [1, 0, 0]), tip], 0.5, RED, MATTE, 0.4, 6);
    for (const s of [-1, 1]) tube(out, [tip, add(tip, [1.8, s * 1.5, -1])], 0.42, RED, MATTE, 0.4, 6);
  }
  turnPart(out, h0, out.length, HC, () => ha, sub(hc, HC));
  poseBody(out, out.length, P, -0.5, 13);
  return out;
}

// Octo: three tentacles are legs (two in front step, one behind; it stands on the lowest), the side two its arms.
// 'spin' (every tentacle flung out flat, off the ground) and 'ink' (squatting, head back, mouth round)
const OCTO_POSES = fightPoses({
  spin: { air: true, yaw: 0.6, roll: 0.1, spread: 1, arms: BOTH([[0.3, 0.95, 0.1], [0.2, 0.95, 0.2]]) },
  ink: { pitch: -0.22, squat: 1, mouth: 1.3, arms: BOTH([[0.35, 0.8, -0.45], [0.75, 0.6, -0.3]]) },
  // js/kits/octo.js: coil/shoot/droop git blame (tentacle drawn: art/kit-octo.js); reel (unused); rise/slam Force
  // Push; fork the Fork; jet Ink Jet
  coil: { yaw: -0.35, pitch: -0.08, arms: [[[-0.6, 0.6, 0.45], [-0.5, -0.3, 0.8]], [[0.5, 0.7, 0.1], [0.8, 0.3, 0.2]]] },
  shoot: { yaw: 0.3, pitch: 0.12, arms: [[[0.95, -0.15, 0.15], [1, -0.05, 0.05]], [[-0.2, 0.9, -0.2], [-0.4, 0.6, -0.5]]] },
  reel: { yaw: -0.2, pitch: -0.22, arms: [[[0.5, 0.2, 0.3], [-0.6, 0.3, 0.6]], [[-0.1, 0.9, 0.2], [-0.3, 0.6, 0.6]]] },
  slam: { pitch: 0.3, squat: 1, arms: BOTH([[0.75, 0.55, -0.3], [0.6, 0.4, -0.8]]) },
  droop: { pitch: 0.06, arms: [[[0.45, 0.8, -0.2], [0.55, 0.4, -0.6]], [[0.1, 0.85, -0.25], [0.15, 0.4, -0.9]]] },   // (no stun look after a miss: the arm easing down)
  fork: { roll: 0.1, mouth: 0.8, arms: BOTH([[0, 1, 0.15], [0.1, 0.9, 0.45]]) },
  rise: { pitch: -0.18, mouth: 1, arms: BOTH([[0.1, 0.65, 0.75], [0.05, 0.3, 1]]) },
  jet: { pitch: 0.25, spread: 1, arms: BOTH([[-0.6, 0.6, 0.2], [-0.9, 0.3, 0.1]]) },
}, ARMS, walkArms, walkCycle(3, 3, 1, 0.06, 0.4));
function octoPosed(mood, pose) {
  const P = OCTO_POSES[pose], out = [], D = hex('#2f353e'), MOUTH = hex('#7c4f42'), HC = [0, 0, 30], HR = [11, 17.8, 13.8], H = P.squat ? 1 : 4;
  ellipsoid(out, HC, [[HR[0], 0, 0], [0, HR[1], 0], [0, 0, HR[2]]], D, PATCH, 36, 22);
  ellipsoid(out, [0, 0, 10.5], [[8.5, 0, 0], [0, 10, 0], [0, 0, 6.5]], D, MATTE, 24, 14);
  for (const s of [-1, 1]) {
    tube(out, [[-1.5, s * 11.2, 38.4], [-1.8, s * 13.4, 44.4], [-2, s * 15.2, 49.4]], t => 5.4 - 4.9 * t, D, MATTE, 1, 12);
    decal(out, [1.2, s * 13.2, 43.4], [1, s * 0.15, 0.1], 1.6, 3, 0.5, hex('#4f3f48'));
    const big = pose === 'hurt' ? 1.12 : 1, [ep] = onFront(HC, HR, s * 6, 28.4); eyeAt(out, add(ep, [-1, 0, 0]), s * 0.1, 2, 3 * big, 4 * big, hex('#2e1810'), 0.5);
    const [cp, cn] = onFront(HC, HR, s * 9.8, 22.4, 0.05); decal(out, cp, cn, 2.5, 1.4, 0.4, hex('#f2a8a4'));
    for (const [z0, z1] of [[23.4, 24.8], [22, 21]]) { const [p0] = onFront(HC, HR, s * 9.2, z0, 0.2), [p1] = onFront(HC, HR, s * 12.6, (z0 + z1) / 2, 0.4); tube(out, [p0, p1, [p1[0] - 1.6, s * 16.4, z1]], 0.27, hex('#8a5a4a'), MATTE, 0, 5); }
  }
  ellipsoid(out, add(onFront(HC, HR, 0, 23.7)[0], [-0.5, 0, 0]), [[1.3, 0, 0], [0, 1.9, 0], [0, 0, 1.3]], hex('#e0768a'), GLOSS, 14, 10, 0.6);
  const line = f => { const pts = []; for (let i = 0; i <= 12; i++) { const y = -2.6 + 5.2 * i / 12; pts.push(onFront(HC, HR, y, f(y), 0.15)[0]); } tube(out, pts, 0.32, MOUTH, MATTE, 0, 6); };
  const o = P.mouth || (pose === 'hurt' ? 0.8 : 0);
  if (o) ellipsoid(out, onFront(HC, HR, 0, 20.9, -0.4)[0], [[1, 0, 0], [0, 1.4 * o, 0], [0, 0, 1.5 * o]], hex('#7a2f3a'), MATTE, 14, 10, 0.4);   // a round 'o'
  else if (mood === 'happy') ellipsoid(out, onFront(HC, HR, 0, 20.9, -0.4)[0], [[1, 0, 0], [0, 2.6, 0], [0, 0, 1.7]], hex('#a8434f'), MATTE, 14, 10, 0.4);
  else if (mood === 'ko' || mood === 'dizzy') line(y => 20.6 + 0.6 * Math.sin(y * Math.PI / 2.4));
  else { line(y => 21.7 - 1.0 * Math.sin(Math.PI * Math.min(1, Math.abs(y) / 2.4))); tube(out, [onFront(HC, HR, 0, 22.7, 0.15)[0], onFront(HC, HR, 0, 21.7, 0.15)[0]], 0.32, MOUTH, MATTE, 0, 6); }
  for (const s of [-1, 1]) {   // the arm tentacles, curling up at the tips
    const A = armOf(P, s), d1 = armOut(A[0], s), d2 = armOut(A[1], s), sh = [1.5, s * 8.4, 11], el = add(sh, scl(d1, 7)), end = add(el, scl(d2, 7));
    let up = sub([0, 0, 1], scl(d2, d2[2])); up = Math.hypot(...up) < 0.3 ? [-1, 0, 0] : norm(up);
    const tip = add(end, add(scl(d2, 1.8), scl(up, 2.4))), tip2 = add(tip, add(scl(d2, -1.2), scl(up, 1.2)));
    tube(out, smoothProf([sh, add(sh, scl(d1, 3.5)), el, add(el, scl(d2, 3.5)), end, tip, tip2], 3), t => 3.1 - 2.5 * t, D, MATTE, 1, 10);
  }
  turnPart(out, 0, out.length, Z3, () => Z3, [0, 0, H]);   // (up on its tentacles; the face patch kept where it was)
  // the leg tentacles: down and out, then curling up (flung out flat in a spin; splayed in a squat)
  for (const [az0, s] of [[Math.PI, 0], [0.62, 1], [-0.62, -1]]) {
    const F = s ? footOf(P, s) : [0, 0, 0], az = az0 + (s ? -s * F[0] * 0.06 : (P.sw || 0) * 0.12);
    const pts = [], n = 20, len = 25 + H * 1.4, turn = P.spread ? 2.4 : 4.9; let r = 6.5, z = 8.5 + H, a = P.spread ? 0.05 : P.squat ? -0.42 : -0.62 - H * 0.07 + F[1] * 0.09;
    for (let i = 0; i <= n; i++) { const f = i / n; pts.push([Math.cos(az) * r, Math.sin(az) * r, z]); a += turn * 3 * f * f / n; const ds = len / n * (1.35 - 0.75 * f); r += Math.cos(a) * ds; z += Math.sin(a) * ds; }
    tube(out, pts, t => 3.2 - 2.5 * t, D, MATTE, 1, 10);
  }
  poseBody(out, out.length, { ...P, air: true }, -0.5, 10);   // (on whichever tentacles reach lowest)
  return out;
}

// Docky: two stubby feet, flippers as arms (moved to mid-side so a punch reaches past its nose). 'stack' and 'spout';
// js/kits/docky.js: swell/surge Tidal Wave, coil/slap Tail Slap (tail swung like a bat), horn, ram (riding his wave),
// beached, dive, breach. tail: [yaw, pitch (+ down), stretch] turns the tail round its root
const DOCKY_POSES = fightPoses({
  stack: { pitch: -0.08, w: 1.2, stack: 1, arms: BOTH([[0.1, 0.6, 0.8], [0.1, 0.4, 0.9]]) },
  spout: { pitch: -0.22, w: 1.2, spout: 1, ft: [[1, 0, 0], [1, 0, 0]], arms: BOTH([[0.1, 0.9, 0.3], [0.2, 0.9, 0.35]]) },
  swell: { pitch: -0.34, up: 1.5, w: 1.25, ft: [[-1.5, 0, 0], [1.5, 0, 0]], tail: [0, 0.35, 1], arms: BOTH([[0.1, 0.95, 0.3], [0.15, 0.85, 0.5]]) },
  surge: { pitch: 0.36, dx: 3, up: -1, ft: [[3.5, 0, 0], [-3, 0, 0]], w: 1.15, tail: [0, -0.35, 1], arms: BOTH([[0.75, 0.55, -0.35], [0.9, 0.15, -0.4]]) },
  coil: { yaw: -0.7, pitch: -0.08, roll: -0.08, w: 1.2, ft: [[-2, 0, 0], [2.5, 0, 0]], tail: [1.2, -0.55, 1.15], arms: [[[-0.3, 0.8, 0.45], [-0.5, 0.5, 0.6]], [[0.6, 0.7, -0.1], [0.8, 0.4, -0.3]]] },
  slap: { pitch: 0.1, roll: 0.16, w: 1.25, ft: [[2, 0, 0], [-2, 0, 0]], tail: [0, 0.75, 1.3], arms: BOTH([[0.05, 1, 0.15], [0, 0.95, 0.25]]) },
  horn: { pitch: -0.2, up: 1, w: 1.25, steam: 1, ft: [[0.5, 0, -0.2], [0.5, 0, 0.2]], arms: BOTH([[0.1, 0.95, 0.25], [0.2, 0.9, 0.35]]) },
  ram: { pitch: 0.34, dx: 3, up: -1, w: 1.1, ft: [[4, 0, 0], [-4, 0, 0]], arms: BOTH([[-0.6, 0.45, -0.15], [-0.9, 0.25, -0.1]]) },
  beached: { pitch: 0.1, roll: 0.42, up: -4, w: 1.3, ft: [[1, 0, 0.4], [-1.5, 1.5, -0.3]], arms: [[[0.2, 0.9, 0.4], [0.3, 0.6, 0.6]], [[0.1, 0.9, -0.3], [0.2, 0.7, -0.6]]] },
  dive: { pitch: 0.78, dx: 4, up: -3, ft: [[-2, 0, 0], [-2, 0, 0]], arms: BOTH([[-0.5, 0.4, 0.6], [-0.7, 0.2, 0.7]]) },
  breach: { pitch: -0.5, air: true, feet: 'body', spout: 1, ft: [[1, 3, 0], [-1, 2, 0]], arms: BOTH([[0.1, 0.9, 0.4], [0.2, 0.6, 0.75]]) },
}, ARMS, walkArms, walkCycle(3.6, 3, 1, 0.07, 0.5));
function dockyPosed(mood, pose) {
  const P = DOCKY_POSES[pose], out = [], B = hex('#2496ed'), BD = hex('#1462ad'), LN = hex('#0a3561'), BOX = hex('#3aa6f4'), RIB = hex('#a9dcff'), WATER = hex('#bfe6ff');
  const prof = smoothProf([[-17.5, 9, 3.4, 3.2], [-13, 9.6, 6.6, 6.4], [-6, 10.8, 9.8, 10], [2, 11.4, 11.4, 11.4], [12, 11.6, 11.6, 11.6], [18.5, 11.4, 11, 11], [22.8, 11, 8.8, 8.8], [25.2, 10.6, 5.6, 5.8], [26.2, 10.3, 1.6, 1.8]], 4);
  sweep(out, prof.map(p => [p[0], 0, p[1]]), t => prof[Math.round(t * (prof.length - 1))][2], t => prof[Math.round(t * (prof.length - 1))][3], [0, 0, 1], B, PATCH, 1, 28);
  const sec = x => { for (let i = 0; i < prof.length - 1; i++) if (x <= prof[i + 1][0]) { const f = (x - prof[i][0]) / (prof[i + 1][0] - prof[i][0]); return prof[i].map((v, k) => v + (prof[i + 1][k] - v) * f); } return prof[prof.length - 1]; };
  const side = (x, z) => { const [, cz, w, h] = sec(x), q = 1 - ((z - cz) / h) ** 2; return q > 0 ? w * Math.sqrt(q) : 0; };
  const t0 = out.length;   // (the tail and its flukes, turned by the pose's tail)
  sweep(out, smoothProf([[-15, 0, 9.3], [-19.5, 0, 12], [-22.6, 0, 16.6], [-24.4, 0, 21.6]], 3), t => 3.6 - 1.6 * t, t => 3.3 - 1.4 * t, [0, 1, 0], B, MATTE, 1, 12);
  for (const s of [-1, 1]) {
    const nf = norm([0.55, 0, 0.83]), L0 = [-0.35, s, 0.25], L = norm(sub(L0, scl(nf, dot(L0, nf)))), Wd = cross(nf, L);
    ellipsoid(out, add([-25, 0, 22.6], scl(L, 5.4)), [scl(L, 6.4), scl(Wd, 3.2), scl(nf, 1.2)], B, MATTE, 20, 12);
  }
  if (P.tail) {
    const [ty, tp, ts = 1] = P.tail, piv = [-14, 0, 9.6];
    for (let i = t0; i < out.length; i += STRIDE) for (let k = 0; k < 3; k++) out[i + k] = piv[k] + (out[i + k] - piv[k]) * ts;
    turnPart(out, t0, out.length, piv, () => [ty, -tp, 0]);
  }
  for (const s of [-1, 1]) {
    // a flipper: flat, out from the middle of its side the way the pose has the arm
    const A = armOf(P, s), d = norm(add(armOut(A[0], s), armOut(A[1], s)));
    let ft = cross(d, [1, 0, 0]); if (Math.hypot(...ft) < 0.4) ft = cross(d, [0, 0, 1]); ft = norm(ft); const fw = cross(ft, d);
    ellipsoid(out, add([4, s * 10.4, 8], scl(d, 5.4)), [scl(d, 6), scl(fw, 2.6), scl(ft, 1.1)], BD, MATTE, 18, 10);
    eyeAt(out, [15.6, s * (side(15.6, 13.6) - 0.9), 13.6], s * 1.0, 1.9, 2.7 * (pose === 'hurt' ? 1.12 : 1), 2.9 * (pose === 'hurt' ? 1.12 : 1), hex('#ffffff'));
    decal(out, [18, s * (side(18, 10.4) + 0.05), 10.4], [0.25, s, -0.15], 1.9, 1.5, 0.4, hex('#f19ac4'));
    const smile = []; for (let i = 0; i <= 10; i++) { const x = 13 + (26.05 - 13) * i / 10, z = 7.8 + 1.1 * Math.sin(Math.PI * i / 20); smile.push([x + 0.25, s * (side(x, z) + 0.25), z]); }
    tube(out, smile, 0.48, LN, MATTE, 0, 6);
  }
  const rows = P.bare ? [[25.4, [-5.1, 1.3, 7.7, 14.1], [-3.15, 3.15]]] : [[25.4, [-5.1, 1.3, 7.7, 14.1], [-3.15, 3.15]], [30.9, [1.3, 7.7, 14.1], [-3.15, 3.15]], [36.4, [7.7], [0]]];   // (bare: thrown off)
  if (P.stack) rows.push([41.9, [8.4], [0]], [47.4, [7.2], [0]], [52.9, [8.1], [0]]);   // the tower
  for (const [z0, xs, ys] of rows) for (const x of xs) for (const y of ys) {
    const z = z0 + (P.lift && z0 > 26 ? P.lift * (z0 - 24) / 12 : 0);   // (heaving: the upper rows lifted off its back)
    rbox(out, [x, y, z], [2.95, 3, 2.6], BOX, MATTE);
    for (const s of y ? [Math.sign(y)] : [-1, 1]) for (const dx of [-1.4, 0, 1.4]) ellipsoid(out, [x + dx, y + s * 3, z], [[0.42, 0, 0], [0, 0.35, 0], [0, 0, 1.9]], RIB, MATTE, 8, 6, 0);
  }
  if (P.spout) {   // a column of water up out of the blowhole, spraying out at the top
    for (let i = 0; i < 8; i++) ball(out, [20.4 + Math.sin(i * 1.7) * 0.5, Math.cos(i * 2.3) * 0.5, 25 + i * 3.4], 1.7 + i * 0.12, WATER, GLOSS, 0.5, 12, 8);
    for (let i = 0; i < 7; i++) { const a = TAU * i / 7, r = 4.6; ball(out, [20.4 + Math.cos(a) * r, Math.sin(a) * r, 52 - Math.abs(Math.sin(a)) * 1.5 + (i % 2) * 1.2], 2.1, WATER, GLOSS, 0.5, 12, 8); }
    for (let i = 0; i < 6; i++) { const a = TAU * (i + 0.5) / 6; ball(out, [20.4 + Math.cos(a) * 8, Math.sin(a) * 8, 47 - (i % 2) * 2], 1.3, WATER, GLOSS, 0.5, 10, 7); }
  } else if (P.steam) {   // the horn: a soft puff of steam out of the blowhole
    for (const [p, r] of [[[20.6, 0, 25.6], 1.8], [[21.2, 1.6, 28.4], 2.2], [[20.2, -1.4, 29.6], 2.4], [[21, 0.4, 32.4], 2.7]]) ball(out, p, r, hex('#f4fbff'), MATTE, 0.5, 12, 8);
  } else if (mood === 'happy') for (const [p, r] of [[[20.4, 0, 27.2], 1.5], [[21.6, 2.4, 31], 1.7], [[21.6, -2.4, 31], 1.7], [[20.6, 0, 34.4], 1.9]]) ball(out, p, r, WATER, GLOSS, 0.5, 12, 8);
  const leg = (c, f, hp) => { ellipsoid(out, add(c, scl(f, 1)), [scl(f, 4.2), scl(norm(cross([0, 0, 1], f)), 3.4), [0, 0, 2.2]], BD, MATTE, 18, 12); capsule(out, hp, add(c, [-0.8 * f[0], -0.8 * f[1], 1.4]), 3.3, B); };
  onLegs(out, P, out.length, 5, 14, -0.5, s => [6, s * 6.5, 3], (s, F, w = 1) => [[7 + F[0], s * 7 * w, 1.4 + F[1]], rotZ([1, 0, 0], s * 0.15 + F[2])], leg);
  return out;
}

// Swifty: bird legs (three toes forward, one back), wings as arms, broad side up (toward you when held up or in front).
// 'dive' and 'flap'; js/kits/swifty.js: hover (Talon Strike's tuck in the air), tumble (missed dive), flick/rake the
// Talon Strike (talons thrust out to its reach), gust, cock/fling Closure (a long feather), glide (Wing Hop), perch
const SWIFTY_WINGS = {
  stand: BOTH([[-0.6, 0.5, -0.15], [-1, 0.12, -0.3]]),
  wind: [[[-0.35, 0.7, 0.6], [-0.6, 0.3, 0.75]], [[0.45, 0.85, -0.05], [0.8, 0.5, -0.25]]],
  strike: [[[0.6, 0.75, 0.25], [1, -0.15, 0.05]], [[-0.6, 0.5, -0.15], [-1, 0.12, -0.3]]],
  block: BOTH([[0.9, 0.35, 0.15], [0.4, -0.9, 0.15]]),
  hurt: BOTH([[-0.2, 0.8, 0.55], [-0.45, 0.55, 0.7]]),
  grab: BOTH([[0.7, 0.65, 0.1], [1, -0.25, 0]]),
  air: BOTH([[-0.1, 0.8, 0.6], [-0.1, 0.55, 0.85]]),
};
const SWIFTY_POSES = fightPoses({
  block: { ...BODY.block, arms: SWIFTY_WINGS.block, wn: [1, 0, 0] },
  dive: { pitch: 1.05, air: true, feet: 'body', ft: [[-3, 1, 0], [-3, 1, 0]], arms: BOTH([[-0.75, 0.35, 0.3], [-1, 0.06, 0.12]]) },
  flap: { pitch: -0.12, air: true, feet: 'body', w: 0.9, ft: [[0.5, 1.5, 0], [0.5, 1.5, 0]], arms: BOTH([[0.05, 0.85, 0.55], [0.05, 0.35, 0.95]]) },
  // Gust's blow: wings swept hard forward
  gust: { pitch: 0.14, air: true, feet: 'body', w: 0.9, ft: [[1, 1.5, 0], [1, 1.5, 0]], arms: BOTH([[0.75, 0.62, 0.12], [0.92, -0.25, -0.05]]), wn: [0, 0, 1] },
  hover: { pitch: -0.16, air: true, feet: 'body', w: 0.9, ft: [[0.5, 2, 0], [0.5, 2, 0]], arms: BOTH([[-0.1, 0.9, 0.42], [-0.2, 0.78, 0.58]]) },
  tumble: { pitch: -0.45, roll: 0.35, yaw: 0.3, up: -2, ft: [[3, 2.5, 0], [-2, 0, 0]], arms: [[[-0.3, 0.8, 0.5], [-0.5, 0.5, 0.7]], [[0.2, 0.9, -0.2], [0.1, 0.8, -0.5]]] },
  flick: { pitch: 0.08, up: -1.5, w: 1.3, ft: [[1, 0, -0.15], [-1.5, 0, 0.15]], arms: BOTH([[-0.3, 0.75, 0.6], [-0.6, 0.45, 0.65]]) },
  rake: { pitch: -0.36, air: true, feet: 'body', w: 0.85, ft: [[14, 6, 0], [12.5, 4.5, 0]], arms: BOTH([[-0.15, 0.92, 0.35], [-0.35, 0.8, 0.48]]) },
  // Talon Strike out of a Wing Hop: swooping down, wings up and back, both feet thrust out ahead, talons first
  swoop: { pitch: 0.42, air: true, feet: 'body', w: 0.8, ft: [[14, 5, 0], [12.5, 3.5, 0]], arms: BOTH([[-0.5, 0.7, 0.5], [-0.8, 0.38, 0.62]]) },
  cock: { yaw: -0.5, pitch: -0.1, w: 1.1, feather: 1, ft: [[-2, 0, 0], [2, 0, 0]], arms: [[[-0.6, 0.6, 0.5], [-0.8, 0.2, 0.55]], [[0.4, 0.85, -0.1], [0.7, 0.5, -0.3]]] },
  fling: { yaw: 0.45, pitch: 0.2, dx: 2, ft: [[3, 0, 0], [-2.5, 0, 0]], arms: [[[0.85, 0.4, 0.2], [1, -0.1, 0]], [[-0.5, 0.6, -0.1], [-0.9, 0.2, -0.3]]] },
  glide: { pitch: 0.06, air: true, feet: 'body', ft: [[-1, 1.5, 0], [-1, 1.5, 0]], arms: BOTH([[0, 1, 0.06], [-0.15, 0.98, 0]]) },
  perch: { pitch: 0.26, up: -3, w: 1.25, ft: [[1.5, 0, -0.2], [1.5, 0, 0.2]], arms: BOTH([[-0.3, 0.8, 0.3], [-0.5, 0.6, 0.2]]) },
}, SWIFTY_WINGS, f => [[[-0.6 - f * 0.3, 0.5, -0.15], [-1, 0.12, -0.3]], [[-0.6 + f * 0.3, 0.5, -0.15], [-1, 0.12, -0.3]]], walkCycle(3.2, 3, 1.2, 0.1, 0.4));
function swiftyPosed(mood, pose) {
  const P = SWIFTY_POSES[pose], out = [], OR = hex('#f67a34'), RED = hex('#d93d26'), LN = hex('#3e0e03'), YB = hex('#ffc94a'), W = hex('#fff4ec'), LEG = hex('#f2a93b');
  const body = smoothProf([[-10, 0, 6.4, 2.4], [-5, 0, 9.4, 6.4], [0, 0, 13.6, 8.6], [5, 0, 18.6, 8.4], [9, 0, 24.4, 6.8]], 3);
  sweep(out, body.map(p => p.slice(0, 3)), t => body[Math.round(t * (body.length - 1))][3], t => body[Math.round(t * (body.length - 1))][3], [0, 1, 0], OR, PATCH, 1, 24);
  const HC = [12, 0, 30.6], HR = [8.2, 7.6, 7.8];
  ellipsoid(out, HC, [[HR[0], 0, 0], [0, HR[1], 0], [0, 0, HR[2]]], OR, MATTE, 30, 20);
  const A0 = norm([0.62, 0, 0.78]), nf = norm([0.78, 0, -0.62]);
  ellipsoid(out, [9.4, 0, 17.6], [scl(A0, 11.5), [0, 4.4, 0], scl(nf, 3.4)], W, MATTE, 24, 14, 0.5);
  tube(out, [[18.6, 0, 30.4], [25.6, 0, 29.2]], t => 2.5 - 2.1 * t, YB, MATTE, 1, 10);
  tube(out, smoothProf([[9.6, 0, 37.2], [6, 0, 40.8], [3.4, 0, 40.6]], 3), t => 2.3 - 1.4 * t, hex('#f06a2e'), MATTE, 1, 9);
  for (const s of [-1, 1]) {
    const [ep, en] = onFront(HC, HR, s * 4.2, 32.2), big = pose === 'hurt' ? 1.1 : 1; eyeAt(out, sub(ep, scl(en, 1.3)), s * 0.55, 2.4, 3.3 * big, 3.6 * big, hex('#ffffff'));
    if (mood !== 'blink' && mood !== 'happy' && pose !== 'hurt') tube(out, [onFront(HC, HR, s * 6.6, 36.6, 0.3)[0], onFront(HC, HR, s * 2.4, 35.4, 0.4)[0]], 0.7, LN, MATTE, 0, 6);
    // a wing: from the shoulder along the pose's arm, flat (its normal: up, unless held up high or set by the pose)
    const A = armOf(P, s), d1 = armOut(A[0], s), d2 = armOut(A[1], s), sh = [3, s * 6.6, 21], el = add(sh, scl(d1, 10)), end = add(el, scl(d2, 13)), da = norm(add(d1, d2));
    const proj = v => sub(v, scl(da, dot(v, da))), wn = P.wn ? proj(P.wn) : Math.abs(da[2]) > 0.75 ? proj([1, 0, 0]) : proj([0, 0, 1]);
    sweep(out, smoothProf([sh, add(sh, scl(d1, 5)), el, add(el, scl(d2, 6.5)), end], 3), t => 4.4 - 3.8 * t * t, t => 1.2 - 0.8 * t, norm(wn), i => i > 6 ? RED : OR, MATTE, 1, 12);
    if (P.feather && s < 0) {   // Closure's feather: long, cream, red-orange tip, curved like a boomerang
      const [a1] = perp(d2), q = [end, add(end, add(scl(d2, 5), scl(a1, 2.5))), add(end, add(scl(d2, 10), scl(a1, 1.2))), add(end, add(scl(d2, 13.5), scl(a1, -2)))];
      sweep(out, smoothProf(q, 3), t => 2.1 - 1.6 * t * t, t => 0.55 - 0.25 * t, norm(wn), i => i > 7 ? RED : W, MATTE, 0.7, 10);
    }
    sweep(out, smoothProf([[-8, s * 1, 7.6], [-16, s * 3.6, 8.2], [-25, s * 6.4, 9.8]], 3), t => 2.8 - 2.4 * t, t => 1 - 0.6 * t, [0, 0, 1], RED, MATTE, 1, 10);
    ball(out, [1.5, s * 4, 5.5], 3.2, OR, MATTE, 1, 14, 9);   // a feathered thigh
  }
  const leg = (c, f, hp) => {
    tube(out, [hp, add(c, [0, 0, 1.1])], 1.1, LEG, MATTE, 0.7, 8);
    for (const a of [-0.45, 0, 0.45]) tube(out, [add(c, [0, 0, 0.8]), add(c, add(scl(rotZ(f, a), 4.2), [0, 0, 0.4]))], t => 0.95 - 0.35 * t, LEG, MATTE, 0.7, 7);
    tube(out, [add(c, [0, 0, 0.8]), add(c, add(scl(f, -2.4), [0, 0, 0.5]))], 0.75, LEG, MATTE, 0.7, 7);
  };
  onLegs(out, P, out.length, 7, 10, -0.5, s => [1.5, s * 4, 4], (s, F, w = 1) => [[3 + F[0], s * 4.6 * w, 0.4 + F[1]], rotZ([1, 0, 0], s * 0.2 + F[2])], leg);
  return out;
}

// Keith (Cpp): legs under his belly (pink foot right, bandaged stump left), little arms. 'scurry' (low, paws out:
// the dash) and 'gnaw' (paws at his mouth, buck teeth out)
const CPP_POSES = fightPoses({
  scurry: { pitch: 0.55, dx: 3, ft: [[5, 0, 0], [-4, 0, 0]], w: 1.1, arms: BOTH([[0.7, 0.3, -0.6], [0.85, 0, -0.5]]) },
  gnaw: { pitch: 0.2, dx: 1, mouth: 1, teeth: 1.6, ft: [[1.5, 0, 0], [-1, 0, 0]], arms: BOTH([[0.75, 0.2, 0.55], [0.55, -0.75, 0.35]]) },
  stand: { arms: BOTH([[0.8, 0.25, -0.1], [0.85, -0.5, -0.1]]) },   // (resting on his belly, as he sits in his kart)
  // js/kits/cpp.js uses wind, strike, rear, chomp, scurry, pant and dead; the rest are kept. lay (setting a mine),
  // rear (Gnaw Frenzy's flick back), bite (the lunge), chomp (jaws shut), pant (a calm settle after a miss), dead
  // (Play Dead: on his back, tongue out)
  bite: { pitch: 0.5, dx: 4.5, mouth: 1.5, teeth: 2, w: 1.05, ft: [[6, 0, 0], [-5, 0, 0]], arms: BOTH([[0.55, 0.65, 0.05], [0.35, 0.45, -0.55]]) },
  lay: { pitch: 0.62, dx: 3, w: 1.15, ft: [[2, 0, 0], [-2, 0, 0]], arms: BOTH([[0.75, 0.3, -0.6], [0.6, -0.15, -0.78]]) },
  rear: { pitch: -0.3, dx: -1, up: 1, mouth: 1.1, teeth: 1.7, w: 1.1, ft: [[-1, 0, 0], [2, 0, 0]], arms: BOTH([[0.4, 0.55, 0.7], [0.5, -0.1, 0.85]]) },
  chomp: { pitch: 0.42, dx: 3, mouth: 0.6, teeth: 1.8, ft: [[5, 0, 0], [-4, 0, 0]], arms: BOTH([[0.9, 0.35, 0.1], [0.9, -0.15, -0.2]]) },
  pant: { pitch: 0.2, dx: 1.5, w: 1.12, ft: [[2.5, 0, 0], [-1.5, 0, 0]], arms: BOTH([[0.8, 0.3, -0.3], [0.8, -0.35, -0.35]]) },   // (a settle, not a stun: the lunge's follow-through)
  dead: { lie: [0, 0], pitch: -1.5, feet: 'body', tongue: 1, mouth: 0.7, w: 0.9, ft: [[10, 12, 0], [12, 10, 0]], arms: BOTH([[0.85, 0.45, 0.2], [0.9, 0.1, 0.35]]) },
}, ARMS, f => [[[0.8 - f * 0.5, 0.25, -0.1], [0.85, -0.5, -0.1]], [[0.8 + f * 0.5, 0.25, -0.1], [0.85, -0.5, -0.1]]]);
function cppPosed(mood, pose) {
  const P = CPP_POSES[pose], out = [], F = hex('#9a907e'), MUZ = hex('#c9bea9'), PK = hex('#e9a3a4'), PD = hex('#b86a6e'), LN = hex('#2a241d');
  const prof = smoothProf([[-0.5, 0], [0.5, 10.5], [2.2, 15], [9, 17.6], [15, 17], [20, 14.6], [23.6, 10.5], [25.6, 5], [26.2, 0]]);
  const at = lathe(out, prof, 0.92, 1.14, F, PATCH);
  for (const [az, z] of [[-1.65, 9], [-1.95, 16], [1.62, 12], [2.0, 20], [-2.5, 22], [2.8, 8]]) { const [p, n] = at(az, z); tube(out, [sub(p, n), add(p, scl(n, 3.2))], t => 2.3 * (1 - t) + 0.25, F, MATTE, 1, 7); }
  for (const [az, z, r1, r2] of [[-1.5, 13, 2.8, 1.9], [1.45, 6, 2.3, 1.6], [0.35, 7, 1.7, 1.2]]) { const [p, n] = at(az, z); decal(out, p, n, r1, r2, 0.5, hex('#dca096')); }
  for (const [az, z] of [[-1.42, 12.6], [-0.22, 5], [1.5, 6.4], [0.33, 15.5]]) { const [p, n] = at(az, z); decal(out, add(p, scl(n, 0.2)), n, 0.9, 0.9, 0.5, hex('#9b3a30')); }
  { const [p, n] = at(-0.55, 6.5); for (const r of [0.7, -0.7]) decal(out, add(p, scl(n, 0.25)), n, 3.2, 1.1, 0.45, hex('#e4be8a'), r); }
  const HC = [0.5, 0, 35], HR = [10.4, 12, 10.2], tk = P.teeth || 1;
  ellipsoid(out, HC, [[HR[0], 0, 0], [0, HR[1], 0], [0, 0, HR[2]]], F);
  ellipsoid(out, [8, 0, 30.5], [[7, 0, 0], [0, 5.4, 0], [0, 0, 4.4]], MUZ);
  ellipsoid(out, [15, 0, 31.2], [[1.8, 0, 0], [0, 2.3, 0], [0, 0, 1.7]], hex('#d76a80'), GLOSS, 16, 10);
  if (P.mouth || pose === 'hurt') ellipsoid(out, [11.4, 0, 26.2 - (tk - 1) * 1.2], [[2.4, 0, 0], [0, 3.2, 0], [0, 0, 2.4 * (P.mouth || 0.8)]], hex('#6e2234'), MATTE, 16, 10, 0.4);
  else if (mood === 'happy') ellipsoid(out, [11.6, 0, 26.4], [[2.4, 0, 0], [0, 3, 0], [0, 0, 1.9]], hex('#6e2234'), MATTE, 16, 10, 0.4);
  for (const s of [-1, 1]) ellipsoid(out, [12.4 + (tk - 1) * 0.4, s * 0.85 * (1 + (tk - 1) * 0.3), 26.6 - (tk - 1) * 1.1], [[0.6 * tk, 0, 0], [0, 0.78 * tk, 0], [0, 0, 1.35 * tk]], hex(s > 0 ? '#e3d394' : '#ece0a6'), MATTE, 10, 8, 0.5);
  if (mood === 'ko' || mood === 'dizzy' || P.tongue) ellipsoid(out, [12.3, 1.5, 25], [[1.2, 0, 0], [0, 1.3, 0], [0, 0, 1.9]], hex('#e0707e'), MATTE, 12, 8, 0.5);
  for (const s of [-1, 1]) {
    eyeAt(out, [8.8, s * 4.8, 36], s * 0.15, 2, 3.2 * (pose === 'hurt' ? 1.12 : 1), 3.5 * (pose === 'hurt' ? 1.12 : 1), hex('#efe8c8'));
    const c = [-1.4, s * 10.6, 43.6], n = norm([1, s * 0.4, 0.1]);
    decal(out, c, n, 6.4, 6.4, 1.3, F, 0, 1);
    decal(out, add(c, scl(n, 0.9)), n, 4, 4, 0.6, hex('#e8a6a6'));
    for (const [dz, ez] of [[-0.8, 3.4], [0.4, 0.4], [1.5, -2.8]]) {
      const z = 29.6 - dz, p0 = [11.3, s * 4.4, z], end = s > 0 && dz > 1 ? [[13.6, s * 9.5, z - 0.8], [14.4, s * 12.5, z - 4]] : [[12.8, s * 9, z + ez * 0.25], [13.6, s * 14.5, z + ez]];
      tube(out, [p0, ...end], 0.26, LN, MATTE, 0, 5);
    }
    const [end] = arm2(out, [3, s * 13.8, 22.5], armOf(P, s), s, 5.5, 6, 2.4, F);
    ball(out, end, 2.1, PK, MATTE, 1, 14, 9);
  }
  for (const [y0, y1] of [[-1.5, -2.6], [1.3, 2.1]]) tube(out, [[-0.5, y0, 44.4], [-0.7, y1, 47.4]], 0.4, LN, MATTE, 0, 5);
  const tail = smoothProf([[-14, 5, 3.5], [-19, 7, 2.2], [-24, 9, 2.6], [-27.6, 10, 6], [-27.4, 10.4, 10], [-24.8, 10, 11.2], [-23.2, 9.6, 9.6]], 4);
  tube(out, tail, t => 1.9 - 1.3 * t, i => i % 3 === 2 ? PD : PK, MATTE, 0.8, 8);
  // legs: furry, a pink foot on his right, on his left the stump, bandaged, blood seeping through at the front
  const leg = (c, f, hp, s) => {
    capsule(out, hp, add(c, [-1.2 * f[0], -1.2 * f[1], 1.8]), 3, F);
    if (s < 0) ellipsoid(out, add(c, scl(f, 1.6)), [scl(f, 5), scl(norm(cross([0, 0, 1], f)), 2.6), [0, 0, 1.6]], PK, MATTE, 16, 10);
    else { ellipsoid(out, add(c, [0, 0, 1.4]), [scl(f, 3), scl(norm(cross([0, 0, 1], f)), 2.8), [0, 0, 2.7]], hex('#f2eee4'), MATTE, 16, 10); decal(out, add(c, add(scl(f, 2.9), [0, 0, 1.6])), f, 1.2, 1.2, 0.5, hex('#c0392b')); }
  };
  onLegs(out, P, out.length, 8, 14, -0.5, s => [7, s * 9, 3.5], (s, Fo, w = 1) => [[10 + Fo[0], s * 8.8 * w, 1.2 + Fo[1]], rotZ([1, 0, 0], s * 0.2 + Fo[2])], leg);
  return out;
}

// Bugdroid: stubby legs a little longer, the race's capsule arms swung by the pose. 'antenna' (sparking, arms up: the
// zap) and 'boot' (stiff, arms down, head lifted clear, eyes wide)
const DROID_POSES = fightPoses({
  antenna: { pitch: -0.1, w: 1.15, ant: 1, arms: BOTH([[0.1, 0.75, 0.65], [0.1, 0.65, 0.75]]) },
  boot: { up: 1, boot: 1, w: 0.95, arms: BOTH([[0, 0.12, -1], [0, 0.12, -1]]) },
  stand: { arms: BOTH([[0.05, 0.12, -1], [0.05, 0.12, -1]]) },   // (straight down, as in its kart)
  // js/kits/droid.js: charge/beam Battery Beam; plug Sideload; crouch; emp (his cheer); twist Hot Plug's tell; punch;
  // reboot (a calm settle after a miss); airplane Airplane Mode
  twist: { yaw: -0.8, pitch: 0.05, w: 1.2, ant: 1, ft: [[-2, 0, 0], [2.5, 0, 0]], arms: [[[-0.75, 0.6, 0.15], [-0.8, 0.5, 0.15]], [[0.65, 0.5, -0.15], [0.75, 0.35, -0.05]]] },
  punch: { yaw: 0.55, pitch: 0.16, dx: 2, w: 1.15, ant: 2, ft: [[4, 0, 0], [-3, 0, 0]], arms: [[[1, 0.08, 0.14], [1, -0.04, 0.12]], [[-0.6, 0.7, -0.3], [-0.7, 0.6, -0.3]]] },
  // Hot Plug: both arms thrust out, holding the giant plug at you
  plugout: { pitch: 0.16, dx: 2.5, w: 1.15, ant: 2, ft: [[4, 0, 0], [-3, 0, 0]], arms: BOTH([[1, 0.14, 0.1], [1, 0.03, 0.06]]) },
  charge: { pitch: -0.08, w: 1.1, ant: 2, ft: [[2, 0, 0], [-2, 0, 0]], arms: BOTH([[0.9, 0.25, 0.25], [0.9, 0.15, 0.3]]) },
  beam: { pitch: -0.2, dx: -1.5, ant: 2, ft: [[-1, 0, 0], [2, 0, 0]], arms: BOTH([[0.85, 0.3, 0.45], [0.8, 0.3, 0.5]]) },
  // cradle: Sideload's wind-up, arms out and turned in cupping the app cube, antennae lit
  cradle: { pitch: -0.06, w: 1.08, ant: 1, ft: [[0.5, 0, -0.1], [0.5, 0, 0.1]], arms: BOTH([[0.8, -0.25, 0.1], [0.85, -0.4, 0.2]]) },
  plug: { pitch: 0.42, dx: 2, w: 1.2, ft: [[1.5, 0, 0], [-1, 0, 0]], arms: [[[0.7, 0.2, -0.7], [0.7, 0.1, -0.7]], [[0.1, 0.4, -0.9], [0.1, 0.4, -0.9]]] },
  crouch: { pitch: 0.12, up: -2.5, w: 1.35, ant: 1, ft: [[0, 0, -0.2], [0, 0, 0.2]], arms: BOTH([[0.35, 0.6, -0.7], [0.35, 0.6, -0.7]]) },
  emp: { pitch: -0.2, up: 2, w: 1.25, ant: 2, ft: [[0, 0, -0.3], [0, 0, 0.3]], arms: BOTH([[0, 1, 0.35], [0, 1, 0.45]]) },
  reboot: { pitch: 0.08, up: -0.5, w: 1.12, ft: [[0.5, 0, -0.15], [0.5, 0, 0.15]], arms: BOTH([[0.1, 0.55, -0.6], [0.15, 0.45, -0.75]]) },   // (a settle, not a stun: arms coming down)
  airplane: { pitch: 0.1, w: 0.9, ft: [[0.5, 1, 0], [-0.5, 1.5, 0]], arms: BOTH([[0, 1, 0.05], [0, 1, 0.05]]) },
}, ARMS, f => [[[-f * 0.7, 0.12, -1], [-f * 0.7, 0.12, -1]], [[f * 0.7, 0.12, -1], [f * 0.7, 0.12, -1]]]);
function droidPosed(mood, pose) {
  const P = DROID_POSES[pose], out = [], G = hex('#3ddc84'), W = hex('#ffffff'), arc = (zc, wc, r, a0, a1, n = 5) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [zc + r * Math.sin(a), wc + r * Math.cos(a)]; });
  lathe(out, [[2, 0], [2, 3.2], ...arc(6.6, 6.4, 4.6, -Math.PI / 2, 0), [12, 11], ...arc(22, 9.4, 1.6, 0, Math.PI / 2, 3), [23.6, 4], [23.6, 0]], 1, 1, G);
  const h0 = out.length;
  lathe(out, [[25.2, 0], [25.2, 9], ...arc(25.8, 10.4, 0.6, -Math.PI / 2, 0, 2), ...arc(25.2, 0, 11, 0.06, Math.PI / 2, 12).slice(1)], 1, 1, G);
  const HC = [0, 0, 25.2], HR = [11, 11, 11], ko = mood === 'ko', big = ko || mood === 'dizzy' || mood === 'sudo' || P.boot || pose === 'hurt';
  for (const s of [-1, 1]) {
    const [ep, en] = onFront(HC, HR, s * 4.7, 30.2), r = big ? 2.6 : 2.2; eyeAt(out, sub(ep, scl(en, 0.3)), s * 0.5, 0.9, r, r, W, 0.6);
    const a = P.ant ? 0.12 : 0.5 + (ko || P.droop ? 1.05 : 0), L = P.ant ? 8 : 6.2, b = [0, s * 5.6, 34.8], tip = add(b, [0, s * Math.sin(a) * L, Math.cos(a) * L]);
    tube(out, [sub(b, [0, s * 1.2, 1.4]), tip], 0.95, G, MATTE, 1, 9);
    if (P.ant === 1) { ball(out, add(tip, [0, s * 0.3, 1.2]), 1.5, hex('#fff27a'), GLOSS, 0.5, 12, 8); for (const [dy, dz] of [[2.2, 2.4], [-1.6, 3.2]]) ball(out, add(tip, [0.4, s * dy, dz]), 0.7, hex('#fff6a8'), GLOSS, 0, 8, 6); }   // sparks
  }
  if (P.boot) {   // the head up off its body, a ring of light charging in the gap
    shiftPart(out, h0, out.length, [0, 0, 5.5]);
    ellipsoid(out, [0, 0, 27.4], [[12.2, 0, 0], [0, 12.2, 0], [0, 0, 1]], hex('#e6ffb8'), GLOSS, 28, 8, 0.4);
  }
  for (const s of [-1, 1]) {
    const A = armOf(P, s), d = norm(add(armOut(A[0], s), armOut(A[1], s))), sh = [0, s * 14.6, 20.2];
    tube(out, [sh, add(sh, scl(d, 10))], 2.8, G, MATTE, 1, 12);
  }
  onLegs(out, P, out.length, 4, 11, -0.5, s => [0, s * 4.6, 4], (s, F, w = 1) => [[0.5 + F[0], s * 4.6 * w, 2.6 + F[1]], [1, 0, 0]], (c, f, hp) => tube(out, [hp, c], 2.7, G, MATTE, 1, 12));
  return out;
}

// what the shader needs per model: ink, lid (eyelid colour: blink, happy squint), lidInk, scl (eyes have whites; 0 a
// dark eye), pup (pupil size), lidV (heavy lids in the plain look), patches (up to two ellipsoids where a PATCH part
// takes that colour), bust (a portrait's frame), top (where sudo's crown floats), meshMoods (moods whose mesh
// differs), poses (Fight mode's, a mesh each) and lie (lying poses: a long shadow)
const MODELS = {
  gopher: { mesh: gopherMesh, ink: '#132a33', lid: '#79d0e2', pup: 0.935, bust: [6, 0, 27, 23], top: -54, poses: Object.keys(GOPHER_POSES) },
  tux: { mesh: tuxMesh, ink: '#050507', lid: '#25272e', lidInk: '#9aa0ad', pup: 0.86, bust: [4, 0, 33, 21], top: -57, meshMoods: ['happy', 'ko'], poses: Object.keys(TUX_POSES), lie: ['slide', 'flop', 'belly'], patches: [[[19.5, 0, 14.5], [16.5, 14.5, 17.5], '#f4f2ea']] },
  duke: { mesh: dukeMesh, cam: 0.38, ink: '#0a0a0c', lid: '#1d1d22', bust: [2, 0, 24, 25], top: -54, meshMoods: ['sudo'], poses: Object.keys(DUKE_POSES), patches: [[[0, 0, 62], [60, 27, 43], '#1d1d22']] },
  cpp: { mesh: cppMesh, ink: '#2a241d', lid: '#9a907e', pup: 0.87, lidV: 0.12, bust: [4, 0, 33, 18], top: -54, meshMoods: ['happy', 'ko', 'dizzy'], poses: Object.keys(CPP_POSES), patches: [[[17, 0, 10.5], [12.5, 11.8, 10], '#d6cbb5']] },
  octo: { mesh: octoMesh, ink: '#0d1117', lid: '#f7cfb6', lidInk: '#2e1810', scl: 0, bust: [2, 0, 30, 21], top: -57, meshMoods: ['happy', 'ko', 'dizzy'], poses: Object.keys(OCTO_POSES), patches: [[[14, 0, 27.5], [9.5, 15, 11.5], '#f7cfb6']] },
  ferris: { mesh: ferrisMesh, cam: 0.45, ink: '#3a1000', lid: '#f74c00', lidInk: '#3a1000', scl: 0, bust: [2, 0, 16, 26], top: -44, poses: Object.keys(FERRIS_POSES), patches: [[[0, 0, -3], [40, 40, 8.6], '#d64300']] },
  pyth: { mesh: pythMesh, ink: '#122b44', lid: '#3776ab', pup: 0.78, bust: [4, 0, 32, 17], top: -52, meshMoods: ['happy'], poses: Object.keys(PYTH_POSES), patches: [[[9, 0, 30.6], [9, 15, 4.6], '#ffd43b']] },
  docky: { mesh: dockyMesh, ink: '#0a3561', lid: '#2496ed', pup: 0.8, bust: [6, 0, 21, 24], top: -54, meshMoods: ['happy'], poses: Object.keys(DOCKY_POSES), patches: [[[6, 0, 0], [27, 16, 10.6], '#e8f4fd']] },
  swifty: { mesh: swiftyMesh, ink: '#3e0e03', lid: '#f67a34', pup: 0.8, bust: [9, 0, 27, 17], top: -50, meshMoods: ['blink', 'happy'], poses: Object.keys(SWIFTY_POSES), patches: [[[-15, 0, 3], [16, 14, 10], '#e2492e']] },
  droid: { mesh: droidMesh, ink: '#0b4a2c', lid: '#3ddc84', lidInk: '#ffffff', scl: 0, bust: [0, 0, 24, 18], top: -52, meshMoods: ['happy', 'ko', 'dizzy', 'sudo'], poses: Object.keys(DROID_POSES) },
};

// ---------------------------------------------------------------- the WebGL pass
const VS = `attribute vec3 aP, aN, aC, aE; attribute float aK, aO;
uniform mat3 uR; uniform vec4 uBox; uniform float uOut, uK;
varying vec3 vN, vC, vE, vM; varying float vK;
void main() {
  vec3 p = uR * (aP + (aK > 6.5 ? aE : aN) * uOut * aO) * uK;   // (a prop's facet, kind 7+: its ink line pushed out along the smooth normal in aE, so the line doesn't crack at its edges)
  vN = uR * aN; vC = aC; vE = aE; vK = aK; vM = aP;
  gl_Position = vec4((p.x - uBox.x) / (uBox.y - uBox.x) * 2.0 - 1.0, (p.y - uBox.z) / (uBox.w - uBox.z) * 2.0 - 1.0, -p.z / 200.0, 1.0);
}`;
const FS = `precision mediump float;
uniform vec3 uL, uInk, uLid, uLidInk, uPc0, uPr0, uPk0, uPc1, uPr1, uPk1; uniform float uHull, uMood, uScl, uPup, uLidV;
varying vec3 vN, vC, vE, vM; varying float vK;
bool inside(vec3 q, vec3 c, vec3 r) { vec3 d = (q - c) / r; return dot(d, d) < 1.0; }
void main() {
  vec3 n = normalize(vN);
  // the ink line: the part's own colour darkened toward the model's ink (a tinted line, not a black one), an eye's darker
  if (uHull > 0.5) { if (n.z > 0.05) discard; gl_FragColor = vec4(mix(uInk, vC * 0.4, floor(vK + 0.5) == 1.0 ? 0.15 : 0.32), 1.0); return; }
  float k = floor(vK + 0.5);
  vec3 base = vC; bool gloss = k == 2.0 || k == 4.0 || k > 5.5 && k != 7.0; bool ink = false; vec3 inkc = uInk;
  if (k > 2.5 && k < 6.5) { vec3 q = k > 4.5 ? vE : vM; if (inside(q, uPc1, uPr1)) base = uPk1; else if (inside(q, uPc0, uPr0)) base = uPk0; }   // (5, 6: a posed part, where it was before the pose in aE)
  if (k == 1.0) {                        // an eye: what's on it depends on the mood
    vec3 e = normalize(vE); float u = e.y, v = e.z; bool front = e.x > 0.25, scl = uScl > 0.5;
    vec3 xb = scl ? vC : uLid, xc = scl ? uInk : vC;     // under a cross or a spiral, and its colour
    if (uMood < 0.5) { gloss = true; if (scl && e.x > uPup) base = vec3(0.06, 0.07, 0.09);                                 // open
      if (v > uLidV) { base = uLid; gloss = false; } else if (front && v > uLidV - 0.13) ink = true; }                      // (heavy lids)
    else if (uMood < 1.5) { base = uLid; inkc = uLidInk; ink = front && abs(v + 0.05) < 0.075; }                          // blink
    else if (uMood < 2.5) { base = uLid; inkc = uLidInk; ink = front && abs(u) < 0.6 && abs(v - (0.22 - 1.1 * u * u)) < 0.085; }   // happy
    else if (uMood < 3.5) { base = xb; inkc = xc; ink = front && abs(u) < 0.48 && abs(v) < 0.48 && (abs(u - v) < 0.1 || abs(u + v) < 0.1); }   // ko
    else if (uMood < 4.5) { base = xb; inkc = xc; float r = length(vec2(u, v)), a = atan(v, u); ink = front && r < 0.72 && fract(a / 6.2832 - r * 2.4) < 0.2; }   // dizzy
    else { gloss = true; base = vec3(0.1, 0.11, 0.14); if (front && v > 0.18 && v < 0.32 && u > 0.05 && u < 0.5) base = vec3(1.0, 0.84, 0.35); }   // sudo: root shades
  }
  if (ink) { gl_FragColor = vec4(inkc, 1.0); return; }
  // soft cel shading: a cool shadow and a light band with soft edges between them (before 2026-10-23: three hard bands),
  // a faint back light round the shadowed rim (it keeps a dark model's shape), a soft-edged gloss spot
  float d = dot(n, uL), lit = smoothstep(-0.38, 0.22, d);
  if (k == 1.0) lit = 0.6 + 0.4 * lit;   // (an eye barely shades: a dark crescent on it read as a second eye)
  vec3 col = base * mix(vec3(0.6, 0.67, 0.8), vec3(1.0), lit);
  col = mix(col, vec3(1.0), 0.2 * smoothstep(0.42, 0.8, d));
  float rim = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0) * smoothstep(0.1, 0.7, dot(n.xy, vec2(0.75, 0.45))) * (1.0 - lit);
  col = mix(col, mix(base, vec3(0.86, 0.9, 1.0), 0.6), 0.32 * rim);
  if (gloss) col = mix(col, vec3(1.0), 0.92 * smoothstep(0.962, 0.976, dot(n, normalize(uL + vec3(0.0, 0.0, 1.0)))));
  // the props' surfaces (art/prop3d.js): ice (9 faceted, 11 smooth) a frosty bright rim and a broad soft sheen; wet (10)
  // a broad sheen and a light rim, like coffee or a puddle
  if (k == 9.0 || k == 11.0) { float fr = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0); col = mix(col, vec3(0.94, 0.985, 1.0), 0.3 * fr); col = mix(col, vec3(1.0), 0.26 * smoothstep(0.7, 0.92, dot(n, normalize(uL + vec3(0.0, 0.0, 1.0))))); }
  if (k == 10.0) { float h = dot(n, normalize(uL + vec3(0.0, 0.0, 1.0))); col = mix(col, vec3(1.0, 0.97, 0.92), 0.42 * smoothstep(0.8, 0.9, h) + 0.22 * pow(1.0 - clamp(n.z, 0.0, 1.0), 2.5)); }
  gl_FragColor = vec4(col, 1.0);
}`;
const MOODS = ['', 'blink', 'happy', 'ko', 'dizzy', 'sudo'];
const UNIFORMS = ['uR', 'uBox', 'uOut', 'uK', 'uL', 'uInk', 'uLid', 'uLidInk', 'uPc0', 'uPr0', 'uPk0', 'uPc1', 'uPr1', 'uPk1', 'uHull', 'uMood', 'uScl', 'uPup', 'uLidV'];

// WebGL, started once: glBegin asks for the context and shaders (compiled by the GPU on its own), glEnd waits and
// checks them (50-200 ms if not done); the bakery's glSteps polls each slice (KHR_parallel_shader_compile) so no
// frame waits
let GL = null, glFail = false, glPend = null;
function glBegin() {
  try {
    const cv = document.createElement('canvas'), gl = cv.getContext('webgl', { antialias: true, premultipliedAlpha: true, alpha: true });
    if (!gl) throw new Error('no webgl');
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS), pr = gl.createProgram();
    gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    glPend = { cv, gl, pr, vs, fs, ext: gl.getExtension('KHR_parallel_shader_compile'), tries: 0 };
  } catch (e) { glFail = true; }
}
function glEnd() {
  const { cv, gl, pr, vs, fs } = glPend; glPend = null;
  try {
    for (const s of [vs, fs]) if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    const U = {}; for (const u of UNIFORMS) U[u] = gl.getUniformLocation(pr, u);
    const A = {}; for (const a of ['aP', 'aN', 'aC', 'aK', 'aE', 'aO']) A[a] = gl.getAttribLocation(pr, a);
    GL = { cv, gl, pr, U, A, bufs: {} };
  } catch (e) { glFail = true; GL = null; }
  return GL;
}
function setupGL() {
  if (GL || glFail) return GL;
  if (!glPend) glBegin();
  return glFail ? null : glEnd();
}
export const glKick = () => { if (GL || glFail || glPend || typeof document === 'undefined') return false; glBegin(); return true; };   // (true: started now)
export function* glSteps() {
  if (GL || glFail) return GL;
  if (!glPend) { glBegin(); if (glFail) return null; if (yield LATER) return setupGL(); }   // (under runNow: at once)
  while (glPend && glPend.tries++ < (glPend.ext ? 120 : 3) && !(glPend.ext && glPend.gl.getProgramParameter(glPend.pr, glPend.ext.COMPLETION_STATUS_KHR))) if (yield LATER) break;   // (2 s at most)
  return glPend ? glEnd() : GL;
}
// a sheet's variant: a mood ('', 'ko', ...), or a fight pose with a face, 'pose/mood' ('strike/', 'hurt/ko')
const splitV = v => { const i = v.indexOf('/'); return i < 0 ? ['', v] : [v.slice(0, i), v.slice(i + 1)]; };
// a model's mesh for a variant (pure maths, no DOM: art/mesh-worker.js runs it too), with its cell (mascot units,
// tight for every heading): bx either side of the seat, bt above, bb below
export function meshOf(id, v) {
  const [pose, mood] = splitV(v), data = new Float32Array(pose ? MODELS[id].mesh(mood, pose) : MODELS[id].mesh(mood));
  let bx = 0, bt = 0, bb = 0; const se = Math.sin(ELEV), ce = Math.cos(ELEV);
  for (let i = 0; i < data.length; i += STRIDE) { const r = Math.hypot(data[i], data[i + 1]), z = data[i + 2]; bx = Math.max(bx, r); bt = Math.max(bt, se * r + ce * z); bb = Math.max(bb, se * r - ce * z); }
  const pad = OUTLINE + 1;
  return { data, bx: (bx + pad) * K, bt: (bt + pad) * K, bb: (bb + pad) * K };
}
// ... in a GL buffer (one per mood only where the mesh differs), the maths off the page's thread when it can be (a step)
function* bufferSteps(id, v) {
  const M = MODELS[id], [pose, mood] = splitV(v), mm = (pose ? pose + '/' : '') + ((M.meshMoods || []).includes(mood) ? mood : ''), key = id + '|' + mm;
  if (GL && GL.bufs[key]) return GL.bufs[key];
  if (glKick()) yield;
  const m = yield* offThread('mascot', [id, mm], () => meshOf(id, mm)), G = yield* glSteps();   // (WebGL starts while the worker has the maths)
  if (!G) return null;
  if (!G.bufs[key]) { const U = yield* uploadSteps(m.data); if (G.bufs[key]) unload(U); else G.bufs[key] = { ...U, bx: m.bx, bt: m.bt, bb: m.bb }; }   // (another job may have made it meanwhile)
  return G.bufs[key];
}
// a mesh (a Float32Array of vertices) into a GL buffer: { b, n (vertices) }. After setupGL.
export function upload(data) {
  const gl = GL.gl, b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return { b, n: data.length / STRIDE };
}
// the same a megabyte a step (a car's mesh is 2-6 MB; in one go it stalled a frame)
export function* uploadSteps(data) {
  const gl = GL.gl, b = gl.createBuffer(), CH = 262144;
  gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.STATIC_DRAW);
  for (let i = 0; i < data.length; i += CH) { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferSubData(gl.ARRAY_BUFFER, i * 4, data.subarray(i, i + CH)); yield; }
  return { b, n: data.length / STRIDE };
}
export function unload(buf) { if (GL && buf) GL.gl.deleteBuffer(buf.b); }
// the model's rotation for a yaw (screen angle it faces), as a column-major mat3: model -> ground (x right, y down the
// screen, z up) -> view (the camera ELEV above the ground, looking up the screen and down)
function rotOf(yaw, elev = ELEV) {
  const c = Math.cos(yaw), s = Math.sin(yaw), se = Math.sin(elev), ce = Math.cos(elev);
  return new Float32Array([c, -s * se, s * ce, s, c * se, -c * ce, 0, ce, se]);
}

// frames of a mesh into one 2D sheet (mascots here, cars in car3d.js): buf from upload, look the shader's inputs,
// n frames, rot(f) frame f's turn (model -> view mat3, view x right, y up, z toward you), box(f) its cut in view units
// [x0, x1, y0, y1], ppu pixels a screen unit, ky screen units a view unit up (>1 stretches tall, as the cars do),
// out the ink in model units. Frames are shelved in rows up to maxW px, a row drawn then copied out of WebGL in one go
// (each copy stalls), at SS × then scaled down. Returns { sheet, n, cells: [sx, sy, w, h] and [dx, dy, dw, dh] round
// the origin }. bakeSteps yields after each row (art/warm.js; GL state is reset per row since another bake may run
// in between); bake runs it to the end.
export function bake(...a) { return runNow(bakeSteps(...a)); }
// the GL state for drawing buf with look (what the shader needs, its mood); then glDraw draws one frame of it in the
// viewport set: box its cut in view units [x0, x1, y0, y1], R its turn (a mat3), out the ink line in model units
function glLook(G, buf, look) {
  const { gl, pr, U, A } = G, F = 4, attr = (name, size, off) => { gl.enableVertexAttribArray(A[name]); gl.vertexAttribPointer(A[name], size, gl.FLOAT, false, STRIDE * F, off * F); };
  gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.b);
  attr('aP', 3, 0); attr('aN', 3, 3); attr('aC', 3, 6); attr('aK', 1, 9); attr('aE', 3, 10); attr('aO', 1, 13);
  gl.uniform1f(U.uK, K); gl.uniform3fv(U.uL, LIGHT);
  gl.uniform3fv(U.uInk, hex(look.ink)); gl.uniform3fv(U.uLid, hex(look.lid || look.ink)); gl.uniform3fv(U.uLidInk, hex(look.lidInk || look.ink));
  gl.uniform1f(U.uScl, look.scl ?? 1); gl.uniform1f(U.uPup, look.pup ?? 0.935); gl.uniform1f(U.uLidV, look.lidV ?? 9);
  for (let i = 0; i < 2; i++) { const P = (look.patches || [])[i] || [[999, 999, 999], [1, 1, 1], '#000000']; gl.uniform3fv(U['uPc' + i], P[0]); gl.uniform3fv(U['uPr' + i], P[1]); gl.uniform3fv(U['uPk' + i], hex(P[2])); }
  gl.uniform1f(U.uMood, Math.max(0, MOODS.indexOf(look.mood || '')));
  gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.clearColor(0, 0, 0, 0);
}
function glDraw(G, buf, box, R, out) {
  const { gl, U } = G;
  gl.uniform4f(U.uBox, box[0], box[1], box[2], box[3]);
  gl.uniformMatrix3fv(U.uR, false, R);
  gl.uniform1f(U.uHull, 0); gl.uniform1f(U.uOut, 0); gl.drawArrays(gl.TRIANGLES, 0, buf.n);
  gl.uniform1f(U.uHull, 1); gl.uniform1f(U.uOut, out / K); gl.drawArrays(gl.TRIANGLES, 0, buf.n);
}
// one frame drawn at once into the GL canvas's top left, w × h pixels (a live fighter, a portrait): copy it out with
// drawImage(GL.cv, 0, 0, w, h, ...) before anything else draws on it
function glFrame(G, buf, look, box, R, w, h, out) {
  const { gl, cv } = G;
  if (cv.width < w + 2 || cv.height < h + 2) { cv.width = Math.max(cv.width, w + 2); cv.height = Math.max(cv.height, h + 2); }
  glLook(G, buf, look);
  gl.viewport(0, cv.height - h, w, h);
  // (cleared a pixel past it too: a copy's smoothing reads past its edge)
  gl.enable(gl.SCISSOR_TEST); gl.scissor(0, Math.max(0, cv.height - h - 2), w + 2, h + 2); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.disable(gl.SCISSOR_TEST);
  glDraw(G, buf, box, R, out);
}
export function* bakeSteps(buf, look, n, rot, box, ppu, ky = 1, out = OUTLINE, maxW = 1600) {
  const G = setupGL(); if (!G) return null;
  const { gl, cv } = G, cells = [], rows = [];
  // shelved tallest first, so a row holds frames of about one height (a car's long views, its short ones): less sheet
  const B = Array.from({ length: n }, (_, f) => { const b = box(f); return [b, Math.max(1, Math.ceil((b[1] - b[0]) * ppu)), Math.max(1, Math.ceil((b[3] - b[2]) * ky * ppu))]; });
  const order = [...B.keys()].sort((a, b) => B[b][2] - B[a][2] || a - b);
  let x = 0, y = 0, rowH = 0, sheetW = 0, maxH = 0, row = [];
  for (const f of order) {
    const [b, w, h] = B[f];
    if (x && x + w > maxW) { rows.push([y, rowH, x, row]); y += rowH; x = 0; rowH = 0; row = []; }
    cells[f] = [x, y, w, h, b[0], -b[3] * ky, w / ppu, h / ppu];   // (whole pixels: the cut grows right and down)
    row.push(f); x += w; rowH = Math.max(rowH, h); sheetW = Math.max(sheetW, x); maxH = Math.max(maxH, rowH);
  }
  rows.push([y, rowH, x, row]);
  const sheet = document.createElement('canvas'); sheet.width = sheetW; sheet.height = y + rowH;
  const g = sheet.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  const setup = () => {
    if (cv.width < sheetW * SS || cv.height < maxH * SS) { cv.width = Math.max(cv.width, sheetW * SS); cv.height = Math.max(cv.height, maxH * SS); }   // (it only grows: a resize costs more than a sheet's drawing)
    glLook(G, buf, look);
  };
  for (let r = 0; r < rows.length; r++) {
    const [ry, rh, rw, fs] = rows[r];
    setup();
    gl.disable(gl.SCISSOR_TEST); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    for (const f of fs) {
      const C = cells[f], b = B[f][0];
      gl.viewport(C[0] * SS, cv.height - C[3] * SS, C[2] * SS, C[3] * SS);   // (top-aligned: the copy takes the canvas's top rh)
      glDraw(G, buf, [b[0], b[0] + C[6], b[3] - C[7] / ky, b[3]], rot(f), out);
    }
    g.drawImage(cv, 0, 0, rw * SS, rh * SS, 0, ry, rw, rh);
    if (r < rows.length - 1) yield;
  }
  return { sheet, n, cells };
}

// a sheet: n frames (N plain, NM a mood) of one model in one mood at ppu px a mascot unit; a generator (mesh, then a
// row a step), stored in sheets at the end, null without WebGL
const sheets = new Map();
// phones: a fight's pose sheets (only when live frames are off) at the pixels a phone shows (at most ~1.8-2.8 px a
// unit) and 16 headings, not a race's 3.2 and 32: full size passed what iOS Safari lets a page's canvases hold. Uses
// the screen's size (not the window's, so Safari's toolbars don't remake them) in its current orientation
const NP = 16;
const phoneScreen = () => { if (typeof window === 'undefined' || !window.screen) return null; const a = screen.width || 0, b = screen.height || 0, s = Math.min(a, b), l = Math.max(a, b); return s && s < 600 ? (innerWidth > innerHeight ? [l, s] : [s, l]) : null; };
const poseV = v => typeof v === 'string' && v.includes('/');
const nOf = mood => mood ? (poseV(mood) && phoneScreen() ? NP : NM) : N;
function ppuOf(v) {
  const P = poseV(v) && phoneScreen(); if (!P) return ppuNow();
  const [w, h] = P, hs = Math.max(0.68, Math.min(1, Math.min(w, h) / 540)), vbw = w - 24, vbh = h - 86 * hs - 12 - 50 * hs;   // (the fight's view box, draw-fight.js; the safe area left out)
  return Math.min(ppuNow(), Math.ceil(Math.min(2, devicePixelRatio || 1) * 1.1 * Math.min(vbw * 0.0038, vbh * 0.0034) * 8) / 8);
}
const keyOf = (id, mood, n) => id + '|' + mood + (n === nOf(mood) ? '' : '|' + n);
function* sheetSteps(id, mood, ppu, n = nOf(mood)) {
  const k = keyOf(id, mood, n);
  const M = MODELS[id], B = yield* bufferSteps(id, mood); if (!B) { sheets.set(k, null); return; }
  const cw = Math.ceil(B.bx * 2 * ppu), bx = cw / ppu / 2;
  const S = yield* bakeSteps(B, { ...M, mood: splitV(mood)[1] }, n, f => rotOf(f * TAU / n), () => [-bx, bx, -B.bb, B.bt], ppu, 1, OUTLINE, cw * 8);
  if (S) { yield; prime(S.sheet); }
  sheets.set(k, S && { ...S, ppu });
}
const jobKey = k => 'mascot|' + k;
const isBuilt = (k, ppu) => { const S = sheets.get(k); return S === null || (!!S && S.ppu === ppu); };
// on the bakery's queue (art/warm.js), unless it's made or already there (then only moved up if wanted sooner)
function queueSheet(id, mood, pri, n = nOf(mood)) {
  const k = keyOf(id, mood, n), ppu = ppuOf(mood);
  if (!isBuilt(k, ppu)) queueBake(jobKey(k), () => sheetSteps(id, mood, ppu, n), pri);
}
// a model's sheet for a mood: made now if it isn't, or (wait: a race frame, never stalls) undefined while queued.
// null: no WebGL
function sheetFor(id, mood, ppu, wait = false, n = nOf(mood)) {
  const k = keyOf(id, mood, n);
  if (!isBuilt(k, ppu)) {
    if (baking(jobKey(k))) { if (wait) return undefined; bakeNow(jobKey(k)); }
    if (!isBuilt(k, ppu)) runNow(sheetSteps(id, mood, ppu, n));
  }
  return sheets.get(k);
}
// a crossfade of two neighbouring frames, exactly (1 - t)·a + t·b: b added to a with 'lighter' on a scratch canvas
// (premultiplied pixels add; every cell of a sheet is the same size), so a turn is continuous with no outline jump.
// One scratch for every mascot (only grows, ~0.1 MB).
let mixCv = null;
function mixed(S, a, b, t) {
  const A = S.cells[a], B = S.cells[b];
  const m = mixCv || (mixCv = document.createElement('canvas')); if (m.width < A[2] || m.height < A[3]) { m.width = Math.max(m.width, A[2]); m.height = Math.max(m.height, A[3]); }
  const g = m.getContext('2d');
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, A[2], A[3]);
  g.globalAlpha = 1 - t; g.drawImage(S.sheet, A[0], A[1], A[2], A[3], 0, 0, A[2], A[3]);
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = t; g.drawImage(S.sheet, B[0], B[1], B[2], B[3], 0, 0, B[2], B[3]);
  return m;
}
const ppuNow = () => 1.6 * Math.min(2, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1);   // the most a race zooms in (~1.6 px a unit) × pixel ratio

export const has3D = id => !!MODELS[id];
// what the sheets hold (dev: measurements): { n sheets, px pixels, mb (RGBA), bufs (GL buffers), bufMb }
export function sheetStats(filter = () => true) {
  let n = 0, px = 0, nb = 0, vb = 0; for (const [k, S] of sheets) if (S && filter(k)) { n++; px += S.sheet.width * S.sheet.height; }
  if (GL) for (const k in GL.bufs) if (filter(k)) { nb++; vb += GL.bufs[k].n; }
  return { n, px, mb: +(px * 4 / 1048576).toFixed(1), bufs: nb, bufMb: +(vb * STRIDE * 4 / 1048576).toFixed(1), gl: GL ? [GL.cv.width, GL.cv.height] : null };   // (gl: the bakery's WebGL canvas, which only grows)
}
// a model's Fight poses (none: [])
// Fight: a model with cam turns further toward the camera than draw-fight's turn (a crab or an octopus side-on is a
// blob); kits placing things on the model use this too
export const camYaw = (id, yaw) => { const M = MODELS[id]; return M && M.cam ? yaw + M.cam * Math.cos(yaw) : yaw; };
export const poses3D = id => (MODELS[id] && MODELS[id].poses) || [];
// for the 3D cars (car3d.js): the primitives, surface kinds and WebGL (null if none)
// for the props (art/prop3d.js): surface kinds (7 FACET, 8 FACET_GLOSS, 9 ICE faceted, 10 WET, 11 ICE_SMOOTH; 7+
// carry the smooth normal for the ink line in the eye coords), the camera and the bakery's GL
const FACET = 7, FACET_GLOSS = 8, ICE = 9, WET = 10, ICE_SMOOTH = 11;
export { FACET, FACET_GLOSS, ICE, WET, ICE_SMOOTH, ELEV, rotOf, outFor, pushV };
export { STRIDE, MATTE, GLOSS, PATCH, PATCH_GLOSS, OUTLINE, ellipsoid, ball, capsule, decal, tube, sweep, rbox, grid, smoothProf, hex, norm, cross, add, sub, scl, dot, rotZ };
export const glReady = () => typeof document !== 'undefined' && !!setupGL();
// the sheet itself, for a look at it (lab.html ?m=sheet)
export function modelSheet(id, mood = '', ppu = ppuNow()) { return MODELS[id] ? sheetFor(id, mood, ppu) : null; }
// models ahead of time. queue3D (a race's, render.js warmRace3D): plain sheets first (pri 0), then every mood (pri 1),
// the common ones (blink, dizzy, ko) before sudo and happy. warm3D (menu turntable, podium): the plain sheet, then
// the blink and the menus' fine happy face (N yaws: a slow turntable showed NM's steps). All on the bakery's queue, a
// row at a time between frames: made on the spot they stalled; a racer not yet made shows the 2D mascot meanwhile.
const MOOD_ORDER = ['blink', 'dizzy', 'ko', 'sudo', 'happy'];
export function queue3D(ids) {
  if (typeof document === 'undefined') return;
  const ms = [...new Set(ids)].filter(id => MODELS[id]);
  for (const id of ms) queueSheet(id, '', 0);
  for (const mood of MOOD_ORDER) for (const id of ms) queueSheet(id, mood, 1);
}
// Fight mode's (fight-ui): plain sheets and the plain look on its legs (pri 0), every pose incl. the walk (pri 1),
// then the faces a fight shows standing and when hit (pri 2). Other pose + face sheets queue when first drawn. Races
// never call this.
const FIGHT_FACES = ['stand/ko', 'stand/dizzy', 'stand/happy', 'hurt/ko', 'air/ko', 'hurt/dizzy', 'air/dizzy', 'summon/happy', 'uppercut/happy', 'decree/happy', 'breach/happy', 'dead/blink', 'burst/happy'];   // (a face not here is baked when first drawn)
const fightWarm = [];
export const onFightWarm = f => { fightWarm.push(f); };   // (the props' kit, art/prop3d.js: a fight's props on the queue too)
export function queueFight3D(ids) {
  if (typeof document === 'undefined') return;
  const ms = [...new Set(ids)].filter(id => MODELS[id]);
  if (liveOn() && !glFail) {   // (live: the poses' meshes, no sheets; the standing ones first, then the walk, then the rest)
    for (const id of ms) queueBuf(id, 'stand/', 0);
    for (const id of ms) for (const p of MODELS[id].poses || []) queueBuf(id, p + '/', p.startsWith('walk') ? 0 : 1);
    for (const v of FIGHT_FACES) for (const id of ms) if ((MODELS[id].poses || []).includes(splitV(v)[0])) queueBuf(id, v, 2);
    for (const f of fightWarm) try { f(ids); } catch (e) { }   // (after the poses: they're wanted first)
    return;
  }
  for (const id of ms) { queueSheet(id, '', 0); if (MODELS[id].poses) queueSheet(id, 'stand/', 0); }
  for (const id of ms) for (const p of MODELS[id].poses || []) queueSheet(id, p + '/', 1);
  for (const v of FIGHT_FACES) for (const id of ms) if (!v.includes('/') || (MODELS[id].poses || []).includes(splitV(v)[0])) queueSheet(id, v, 2);
  for (const f of fightWarm) try { f(ids); } catch (e) { }
}
export function warm3D(ids = ['gopher']) {
  if (typeof document === 'undefined') return;
  const ms = [...new Set(ids)].filter(id => MODELS[id]);
  for (const id of ms) queueSheet(id, '', 0);
  for (const id of ms) { queueSheet(id, 'blink', 1); queueSheet(id, 'happy', 1, N); }
}

// one still frame of a racer for the menu's roster cards (ui.js rosterPortrait): plain look at a yaw, k px a unit,
// not a sheet (ten sheets for icons: 50-120 MB; a frame ~0.2 MB). Made on the bakery's queue (pri 1). Returns
// { cv, cell: [sx, sy, w, h, dx, dy, dw, dh] (dx.. round the seat) } once made, null with no WebGL or model,
// undefined while queued (done() is called when made).
const ports = new Map(), portWait = new Map();
export function portrait3D(id, k, yaw, done) {
  if (!MODELS[id] || glFail || typeof document === 'undefined') return null;
  if (typeof k === 'object') return fightPortrait(id, k, yaw);
  const key = id + '|' + k + '|' + yaw.toFixed(3);
  if (ports.has(key)) return ports.get(key);
  if (done) { if (!portWait.has(key)) portWait.set(key, []); portWait.get(key).push(done); }
  queueBake('portrait|' + key, () => portraitSteps(id, k, yaw, key), 1);
  return undefined;
}
function* portraitSteps(id, k, yaw, key) {
  try {
    let buf = GL && GL.bufs[id + '|'], own = null, m = buf;
    if (!buf) { if (glKick()) yield; m = yield* offThread('mascot', [id, ''], () => meshOf(id, '')); }
    const G = yield* glSteps(); if (!G) { ports.set(key, null); return; }
    if (!buf) buf = G.bufs[id + '|'] || (own = yield* uploadSteps(m.data));
    const bx = Math.ceil(m.bx * 2 * k) / k / 2;
    const S = yield* bakeSteps(buf, { ...MODELS[id], mood: '' }, 1, () => rotOf(yaw), () => [-bx, bx, -m.bb, m.bt], k, 1, OUTLINE, 4096);
    if (own) unload(own);
    ports.set(key, S && { cv: S.sheet, cell: S.cells[0] });
  } catch (e) { ports.set(key, null); throw e; }   // (the 2D one for good, not asked again and again)
  finally {
    const cbs = portWait.get(key); portWait.delete(key);
    if (cbs) for (const f of cbs) try { f(); } catch (e) { }
  }
}

// one still of a model for a menu picture (home-art.js): v '' (seated, as in a race), 'happy', 'stand/', 'block/happy'
// (a pose it lacks: seated), k px a unit, yaw (π/2 at you), elev (how far up the camera is). Pri 0 on the bakery (a
// frame, ~0.1-0.3 MB). { cv, cell } like portrait3D once made, null with no WebGL or model, undefined while queued.
export function still3D(id, v, k, yaw, elev = ELEV, done) {
  const M = MODELS[id]; if (!M || glFail || typeof document === 'undefined') return null;
  if (splitV(v)[0] && !(M.poses || []).includes(splitV(v)[0])) v = splitV(v)[1];
  const key = 's|' + id + '|' + v + '|' + k + '|' + yaw.toFixed(3) + '|' + elev.toFixed(3);
  if (ports.has(key)) return ports.get(key);
  if (done) { if (!portWait.has(key)) portWait.set(key, []); portWait.get(key).push(done); }
  queueBake('portrait|' + key, () => stillSteps(id, v, k, yaw, elev, key), 0);
  return undefined;
}
function* stillSteps(id, v, k, yaw, elev, key) {
  try {
    const B = yield* bufferSteps(id, v); if (!B) { ports.set(key, null); return; }
    const se = Math.sin(elev), ce = Math.cos(elev) / Math.cos(ELEV);   // (the buffer's cut is for ELEV: widened to cover elev)
    const S = yield* bakeSteps(B, { ...MODELS[id], mood: splitV(v)[1] }, 1, () => rotOf(yaw, elev), () => [-B.bx, B.bx, -(se * B.bx + ce * B.bb), se * B.bx + ce * B.bt], k, 1, outFor(k), 4096);
    ports.set(key, S && { cv: S.sheet, cell: S.cells[0] });
  } catch (e) { ports.set(key, null); throw e; }
  finally {
    const cbs = portWait.get(key); portWait.delete(key);
    if (cbs) for (const f of cbs) try { f(); } catch (e) { }
  }
}
export { ELEV as ELEV3D, PELEV as PELEV3D };

// portrait3D(id, { mood, size, view, yaw }, done): Fight mode's icons (draw-fight.js fightHead). A size × size
// transparent canvas: view 'bust' (head and shoulders, the race's seated model framed round MODELS[id].bust) or
// 'full' (standing on its legs), three-quarter front (yaw: screen angle faced, π/2 at you), from a little above
// (PELEV, lower than a race's camera), thinner ink; mood '' / 'happy' / 'ko' / 'dizzy'. Made on the bakery's queue
// (pri 0): undefined till then (done() is called), null with no WebGL (draw the 2D head).
const PELEV = 14 * Math.PI / 180;
const outFor = ppu => Math.min(OUTLINE, Math.max(0.55, OUTLINE * Math.sqrt(1.6 / ppu)));   // (the line a little thinner as the model's drawn bigger)
function fightPortrait(id, o, done) {
  const mood = o.mood || '', size = Math.max(8, Math.round(o.size || 64)), view = o.view === 'full' ? 'full' : 'bust', yaw = o.yaw ?? Math.PI / 2 - 0.42;
  const key = 'f|' + id + '|' + mood + '|' + size + '|' + view + '|' + yaw.toFixed(3);
  if (ports.has(key)) return ports.get(key);
  if (done) { if (!portWait.has(key)) portWait.set(key, []); portWait.get(key).push(done); }
  queueBake('portrait|' + key, () => fightPortraitSteps(id, mood, size, view, yaw, key), 0);
  return undefined;
}
function* fightPortraitSteps(id, mood, size, view, yaw, key) {
  try {
    const M = MODELS[id], mm = (view === 'full' && M.poses ? 'stand/' : '') + ((M.meshMoods || []).includes(mood) ? mood : ''), bk = id + '|' + mm;
    if (glKick()) yield;
    const m = yield* offThread('mascot', [id, mm], () => meshOf(id, mm));
    const G = yield* glSteps(); if (!G) { ports.set(key, null); return; }
    // its cut: where its vertices go at this yaw (view units), the top share of it for a bust, square round that
    const R = rotOf(yaw, PELEV), d = m.data, V = [];
    let top = -1e9, bot = 1e9;
    for (let i = 0; i < d.length; i += STRIDE) { const x = d[i] * R[0] + d[i + 1] * R[3] + d[i + 2] * R[6], y = d[i] * R[1] + d[i + 1] * R[4] + d[i + 2] * R[7]; V.push(x, y); top = Math.max(top, y); bot = Math.min(bot, y); }
    let box;
    if (view === 'bust') {   // a square round its head (MODELS[id].bust, on the seated race model)
      const [bx, by, bz, r] = M.bust, cx = (bx * R[0] + by * R[3] + bz * R[6]) * K, cy = (bx * R[1] + by * R[4] + bz * R[7]) * K;
      box = [cx - r * K, cx + r * K, cy - r * K, cy + r * K];
    } else {
      let x0 = 1e9, x1 = -1e9; for (let i = 0; i < V.length; i += 2) { x0 = Math.min(x0, V[i]); x1 = Math.max(x1, V[i]); }
      const pad = OUTLINE + 0.8, side = Math.max(top - bot, x1 - x0) + pad * 2, cx = (x0 + x1) / 2, cy = (top + bot) / 2;
      box = [(cx - side / 2) * K, (cx + side / 2) * K, (cy - side / 2) * K, (cy + side / 2) * K];
    }
    yield;
    const ppu = size / (box[1] - box[0]), ss = size < 400 ? 2 : 1;
    const buf = G.bufs[bk] || (yield* uploadSteps(m.data)), own = buf !== G.bufs[bk] ? buf : null;
    glFrame(G, buf, { ...M, mood }, box, R, size * ss, size * ss, outFor(ppu));
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(G.cv, 0, 0, size * ss, size * ss, 0, 0, size, size);
    if (own) unload(own);
    ports.set(key, cv);
  } catch (e) { ports.set(key, null); throw e; }
  finally {
    const cbs = portWait.get(key); portWait.delete(key);
    if (cbs) for (const f of cbs) try { f(); } catch (e) { }
  }
}

// Fight mode draws fighters live: each frame its mesh drawn at its shown size and copied onto the canvas. Sheets
// sharp enough at a fight's size cost 2.5-6× a race's memory; a live frame is sharp at any zoom, turns smoothly and
// needs only GL buffers. If frames take over LIVE_MS on average (software GL), the fight goes back to sheets for good.
// window.kkLive = true keeps it live (screenshots in software GL), false turns it off.
const LIVE = { on: true, ema: 0, n: 0 }, LIVE_MS = 7;
const liveOn = () => typeof window !== 'undefined' && window.kkLive !== undefined ? !!window.kkLive : LIVE.on;
const bufKey = (id, v) => { const [pose, mood] = splitV(v); return id + '|' + (pose ? pose + '/' : '') + ((MODELS[id].meshMoods || []).includes(mood) ? mood : ''); };
function queueBuf(id, v, pri) { if (!(GL && GL.bufs[bufKey(id, v)])) queueBake('buf|' + bufKey(id, v), function* () { yield* bufferSteps(id, v); }, pri); }
// a live frame of the pose with the mood's face, null if its buffer (or the standing one's) isn't made yet (it's queued)
function liveFrame(ctx, M, id, pose, mood, o) {
  if (!liveOn()) return null;
  if (!GL) { queueBuf(id, 'stand/', 0); return null; }
  let B = GL.bufs[bufKey(id, pose + '/' + mood)];
  if (!B) { queueBuf(id, pose + '/' + mood, 0); B = GL.bufs[bufKey(id, pose + '/')] || GL.bufs[bufKey(id, 'stand/')]; if (!B) return null; }
  const T = ctx.getTransform(), px = Math.hypot(T.a, T.b) * (o.scale || 1), ppu = Math.min(14, Math.max(0.5, Math.ceil(px * 8) / 8));
  let w = Math.ceil(B.bx * 2 * ppu), h = Math.ceil((B.bt + B.bb) * ppu);
  const ss = Math.max(1, Math.min(2, 1800 / Math.max(w, h), Math.sqrt(240000 / (w * h))));
  return { B, look: { ...M, mood }, box: [-B.bx, -B.bx + w / ppu, B.bt - h / ppu, B.bt], R: rotOf(o.yaw || 0), w: Math.round(w * ss), h: Math.round(h * ss), out: outFor(ppu), cell: [0, 0, 0, 0, -B.bx, -B.bt, w / ppu, h / ppu], n: 1 };
}
function liveBlit(ctx, L) {
  const t0 = performance.now(), C = L.cell;
  glFrame(GL, L.B, L.look, L.box, L.R, L.w, L.h, L.out);
  ctx.drawImage(GL.cv, 0, 0, L.w, L.h, C[4], C[5], C[6], C[7]);
  const dt = performance.now() - t0;
  LIVE.ema = LIVE.n++ ? LIVE.ema * 0.95 + dt * 0.05 : dt;
  if (LIVE.n > 40 && LIVE.ema > LIVE_MS) LIVE.on = false;
}
export const liveStats = () => ({ on: liveOn(), ms: +LIVE.ema.toFixed(2), n: LIVE.n });

// drawMascot's twin for a 3D one: same (0, 0) (the seat) and options, plus yaw (the screen angle faced: heading, spin,
// drift, trick). lean (rad) tilts it on screen. smooth: crossfades two frames (`mixed`); fine (menus): a mood other
// than a blink from an N-yaw sheet. false with no model or WebGL, or its plain sheet still queued (draw the 2D one).
// pose (Fight mode): from its own sheet, falling back to the pose with its plain face, then the mood standing on
// legs ('stand'), then the mood, then the plain sheet; whatever isn't made is queued, never made on the spot. fight:
// no pose means 'stand'. 'walk0'..'walk3' are the walk (walkPose). A lying pose gets a long shadow along yaw.
export function drawMascot3D(ctx, ch, o = {}) {
  const M = MODELS[ch.id];
  if (!M || glFail || typeof document === 'undefined') return false;
  const t = o.t ?? performance.now() / 1000, ko = o.mood === 'ko', dizzy = o.mood === 'dizzy', happy = o.mood === 'happy';
  const pose = !M.poses ? '' : o.pose && M.poses.includes(o.pose) ? o.pose : o.fight ? 'stand' : '';
  if (o.fight && M.cam && !(M.lie && M.lie.includes(pose))) o = { ...o, yaw: camYaw(ch.id, o.yaw || 0) };
  const seed = (ch.id.length * 0.37) % 1, blink = !o.mood && !pose && ((t * 0.37 + seed) % 1) < 0.035;
  const mood = ko ? 'ko' : dizzy ? 'dizzy' : happy ? 'happy' : o.sudo ? 'sudo' : blink ? 'blink' : '', ppu = ppuNow();
  let S, live = null;
  if (pose) live = liveFrame(ctx, M, ch.id, pose, mood, o);
  if (live) S = live;
  else if (pose && liveOn()) return false;   // (live, its mesh still on the bakery's queue: the 2D one for a moment)
  else if (pose) {   // (the first one made, best first)
    const peek = (v, pri) => { const k = keyOf(ch.id, v, nOf(v)); if (isBuilt(k, ppuOf(v))) return sheets.get(k); queueSheet(ch.id, v, pri); return undefined; };
    const fb = v => pose === 'stand' ? undefined : peek(v, 1);   // (standing on its legs beats dropping to the legless model)
    S = (mood ? peek(pose + '/' + mood, 1) : undefined) ?? peek(pose + '/', 1) ?? (mood ? fb('stand/' + mood) : undefined) ?? fb('stand/') ?? (mood ? peek(mood, 1) : undefined) ?? peek('', 0);
  } else {
    const n = mood && o.fine && mood !== 'blink' ? N : nOf(mood), race = keyOf(ch.id, mood, nOf(mood));
    if (n !== nOf(mood)) queueSheet(ch.id, mood, 0, n);   // (never made on the spot)
    S = sheetFor(ch.id, mood, ppu, true, n);
    if (S === undefined && mood) {   // a mood still on the bakery's queue: wanted now; the race's one if that's made, else the plain face till then
      queueSheet(ch.id, mood, 0, n);
      S = n !== nOf(mood) && isBuilt(race, ppu) ? sheets.get(race) : sheetFor(ch.id, '', ppu, true);
    }
  }
  if (!S) return false;   // (no WebGL, or the plain sheet's still on the queue: the 2D mascot for now)
  const fy = (o.yaw || 0) / TAU * S.n, f0 = Math.floor(fy), fr = fy - f0, at = k => ((k % S.n) + S.n) % S.n, buzz = ch.id === 'cpp' ? Math.sin(t * 2.7) : 0;   // Keith's fly: behind him on the far side of its loop
  ctx.save();
  if (o.scale) ctx.scale(o.scale, o.scale);
  if (o.shadow !== false) {
    if (M.lie && M.lie.includes(pose)) { const y = o.yaw || 0, u = Math.cos(y), w = Math.sin(y) * Math.sin(ELEV); ell(ctx, 1, 1, Math.hypot(u * 27, w * 27) || 1, 9, Math.atan2(w, u)); }   // (along the body, seen from ELEV up)
    else ell(ctx, 2, 1.5, 17, 5.5);
    ctx.fillStyle = 'rgba(8,10,16,0.32)'; ctx.fill();
  }
  if (o.lean) ctx.rotate(o.lean);
  if (o.sudo) { const p = 0.85 + 0.15 * Math.sin(t * 7); ctx.fillStyle = radial(ctx, 0, -22, 4, 0, -22, 36 * p, [[0, 'rgba(255,214,90,0.75)'], [0.55, 'rgba(255,190,40,0.35)'], [1, 'rgba(255,190,40,0)']]); ctx.fillRect(-40, -62, 80, 80); }
  if (buzz < 0) fly(ctx, t);
  const C = live ? live.cell : S.cells[at(Math.round(fy))];
  if (live) liveBlit(ctx, live);
  else if (!o.smooth || fr < 0.01 || fr > 0.99) ctx.drawImage(S.sheet, C[0], C[1], C[2], C[3], C[4], C[5], C[6], C[7]);
  else ctx.drawImage(mixed(S, at(f0), at(f0 + 1), fr), 0, 0, C[2], C[3], C[4], C[5], C[6], C[7]);
  if (buzz > 0) fly(ctx, t);
  if (ko && !o.fight) { const lie = M.lie && M.lie.includes(pose), y = o.yaw || 0; if (lie) { ctx.save(); ctx.translate(Math.cos(y) * 20, Math.sin(y) * Math.sin(ELEV) * 20 + 8); } koStars(ctx, t); if (lie) ctx.restore(); }   // (lying: round his head; a fight draws its own, in 3D: draw-fight.js koStars3)
  if (o.sudo) { ctx.save(); ctx.translate(0, M.top + Math.sin(t * 4) * 1.6); ctx.rotate(Math.sin(t * 2.3) * 0.12); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ICONS.sudo(ctx, 8.5); ctx.restore(); }
  ctx.restore();
  return true;
}
