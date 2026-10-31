// Kernel Kart art: 3D cars (settings.cars3d, off by default), one builder per body (Gopher's and Octo's karts share
// one). Each is the 2D design (cars.js) built from model3d.js's primitives and lofts, in CAR_PAINT / livery, lit and
// inked by model3d.js's shader and baked into sprite sheets of N yaws like the 3D mascots.
// The race camera looks straight down, so a tilted view would shrink the footprint: the sheet is oblique instead,
// the ground plane exactly as from above (footprint = the BODIES hitbox) and heights going up the screen by KZ a unit.
// The two frames either side of the yaw are turned the rest of the way and crossfaded. Front wheels are separate
// sprites turned by the steering, drawn before the body on the far side (or under it: CARS' under) and after it on
// the near side; brake lights are a 2D glow. Sheets per racer and livery, queued by warmCars3D (art/warm.js). No
// WebGL or no 3D car: drawCar3D returns false (draw the 2D car). Nothing runs at import (Node loads it).
import { BODIES, TAU } from '../core.js';
import { CAR_PAINT, DESIGN, livery } from './cars.js';
import { GLOSS, MATTE, PATCH_GLOSS, STRIDE, add, bakeSteps, ball, cross, decal, ellipsoid, glKick, glReady, glSteps, grid, norm, rbox, scl, smoothProf, sweep, tube, unload, uploadSteps } from './model3d.js';
import { bakeNow, baking, offThread, prime, queueBake, runNow } from './warm.js';
import { radial } from './paint.js';

const N = 64;                                   // yaws per sheet
const KZ = 0.6;                                 // screen units up per unit of height, in a race
const OUT = 1.05;                               // the ink line, world units (a touch finer than a mascot's)
const INK = '#121318';
// the race's oblique view, and the menu turntable's plain view from 38° up (its plate is squashed to 0.62)
const VIEWS = { race: { e: Math.atan2(1, KZ), ky: 1 / Math.sin(Math.atan2(1, KZ)) }, table: { e: Math.asin(0.62), ky: 1 } };
const ppuNow = () => 1.25 * Math.min(2, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1);   // cars are big: a little under the mascots' 1.6

const col = c => { if (c[0] === '#') { const n = parseInt(c.slice(1, 7), 16); return [(n >> 16) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; } const m = c.match(/[\d.]+/g); return m.slice(0, 3).map(v => v / 255); };
const sp = (v, p) => Math.sign(v) * Math.abs(v) ** p;
// piecewise linear through [t, v] pairs (a sweep's width or height along it)
// n points evenly along x from x0 to x1 at height z(x) (a sweep's path down the car: t along it is then the distance)
const along = (x0, x1, n, z) => Array.from({ length: n }, (_, i) => { const x = x0 + (x1 - x0) * i / (n - 1); return [x, 0, z(x)]; });
const pw = (pts) => t => { for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [t0, v0] = pts[i - 1], [t1, v1] = pts[i]; return v0 + (v1 - v0) * (t - t0) / (t1 - t0 || 1); } return pts[pts.length - 1][1]; };

// ---------------------------------------------------------------- parts
// a tyre on an axle along y at c: radius r, width w, flat sidewalls and rounded shoulders, a rim (and hub) on each face;
// knobs: that many tread lugs round it, staggered side to side (a monster truck's)
function tyre(out, c, r, w, o = {}) {
  const hw = w / 2, e = 0.32, nu = o.knobs ? o.knobs * 4 : 30, nv = 14, RUB = col(o.rubber || '#2a2b31');
  grid(out, (i, j) => {
    const eta = -Math.PI / 2 + Math.PI * i / nv, om = TAU * j / nu, ce = Math.cos(eta), se = Math.sin(eta);
    let R = r;
    if (o.knobs && Math.abs(se) < 0.9) { const k = Math.floor(j * 2 * o.knobs / nu + (se > 0 ? 1 : 0)) % 2; if (k) R *= 1.06; }
    const p = [c[0] + R * sp(ce, e) * Math.cos(om), c[1] + hw * sp(se, e), c[2] + R * sp(ce, e) * Math.sin(om)];
    const n = norm([sp(ce, 2 - e) * Math.cos(om) / R, sp(se, 2 - e) / hw, sp(ce, 2 - e) * Math.sin(om) / R]);
    return [p, n, [0, 0, 0]];
  }, nu, nv, RUB, MATTE, 1);
  const rr = o.rim ?? r * 0.6, RIM = col(o.rimCol || '#aab1ba'), HUB = col(o.hubCol || '#5d636c');
  for (const s of [-1, 1]) {
    decal(out, [c[0], c[1] + s * (hw - 0.05), c[2]], [0, s, 0], rr, rr, 0.55, RIM, 0, 0.35, GLOSS);
    decal(out, [c[0], c[1] + s * (hw + 0.35), c[2]], [0, s, 0], rr * 0.42, rr * 0.42, 0.45, HUB, 0, 0.2, GLOSS);
    if (o.bolts) for (let k = 0; k < o.bolts; k++) { const a = TAU * k / o.bolts; ball(out, [c[0] + Math.cos(a) * rr * 0.78, c[1] + s * (hw + 0.4), c[2] + Math.sin(a) * rr * 0.78], 0.45, HUB, MATTE, 0, 6, 4); }
  }
}
// a box with rounded edges along any axes (unit vectors a0 a1 a2), half sizes h
function obox(out, c, axes, h, color, kind = MATTE, e = 0.3, o = 1) {
  grid(out, (i, j) => {
    const th = Math.PI * i / 10, ph = TAU * j / 14, s = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
    const p = [0, 1, 2].map(k => c[k] + axes[0][k] * h[0] * sp(s[0], e) + axes[1][k] * h[1] * sp(s[1], e) + axes[2][k] * h[2] * sp(s[2], e));
    const n = norm([0, 1, 2].map(k => axes[0][k] * sp(s[0], 2 - e) / h[0] + axes[1][k] * sp(s[1], 2 - e) / h[1] + axes[2][k] * sp(s[2], 2 - e) / h[2]));
    return [p, n, [0, 0, 0]];
  }, 14, 10, color, kind, o);
}
const fnOf = f => typeof f === 'function' ? f : () => f;
// a smooth curve through [x, v] points (x rising), as a function of x
const curve = pts => pw(smoothProf(pts, 6));
// a car body lofted along x from x0 (the tail) to x1 (the nose): each section a rounded box (a superellipse: e 1 an oval,
// toward 0 a box) W(x) either side, from ZB(x) to ZT(x) (functions of x, or numbers); each end rounded over cap[0] /
// cap[1] units (0: left open, for an end hidden inside another part). Returns its surface: at(x, th) the point and
// normal at x, round the section at th (0 the right side, +y; π/2 the top), top(x, y) the top surface over (x, y)
function loft(out, x0, x1, W, ZB, ZT, color, kind = GLOSS, o = {}) {
  W = fnOf(W); ZB = fnOf(ZB); ZT = fnOf(ZT);
  const e = o.e ?? 0.45, ex = o.ex ?? 0.35, [r0, r1] = o.cap || [3, 3], sides = o.sides || 28, rings = o.rings || 26, ink = o.o ?? 1;
  const K = x => {
    const d = r0 > 0 && x < x0 + r0 ? (x - x0) / r0 : r1 > 0 && x > x1 - r1 ? (x1 - x) / r1 : 1;
    if (d >= 1) return 1; const c = Math.max(0, 1 - Math.max(0, d)) ** (1 / ex); return (1 - c * c) ** (ex / 2);
  };
  const S = (x, th) => { const k = K(x), zb = ZB(x), zt = ZT(x); return [x, W(x) * k * sp(Math.cos(th), e), (zb + zt) / 2 + (zt - zb) / 2 * k * sp(Math.sin(th), e)]; };
  const at = (x, th) => {
    if (K(x) < 1e-4) return [S(x, th), [x < (x0 + x1) / 2 ? -1 : 1, 0, 0]];
    const h = (x1 - x0) * 1e-3, xa = Math.max(x0, x - h), xb = Math.min(x1, x + h);
    return [S(x, th), norm(cross(sub3(S(x, th + 1e-3), S(x, th - 1e-3)), sub3(S(xb, th), S(xa, th))))];
  };
  // the rings: closer together over the rounded ends
  const xs = [], capX = a => sp(Math.cos(a), ex);
  if (r0 > 0) for (let i = 0; i < 6; i++) xs.push(x0 + r0 * (1 - capX(Math.PI / 2 * i / 6)));
  const m0 = x0 + r0, m1 = x1 - r1;
  for (let i = 0; i <= rings; i++) xs.push(m0 + (m1 - m0) * i / rings);
  if (r1 > 0) for (let i = 5; i >= 0; i--) xs.push(x1 - r1 * (1 - capX(Math.PI / 2 * i / 6)));
  const C = typeof color === 'function' ? color : () => color;
  const G = xs.map(x => Array.from({ length: sides + 1 }, (_, j) => at(x, TAU * j / sides)));
  for (let i = 0; i < G.length - 1; i++) for (let j = 0; j < sides; j++) {
    const a = G[i][j], b = G[i + 1][j], c = G[i + 1][j + 1], d = G[i][j + 1], cl = C(scl(add(a[0], c[0]), 0.5));
    for (const v of [a, b, c, a, c, d]) out.push(v[0][0], v[0][1], v[0][2], v[1][0], v[1][1], v[1][2], cl[0], cl[1], cl[2], kind, 0, 0, 0, ink);
  }
  const top = (x, y) => { const w = W(x) * K(x); return at(x, Math.acos(Math.max(-1, Math.min(1, sp(Math.max(-1, Math.min(1, y / (w || 1))), 1 / e))))); };
  return { at, top };
}
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
// paint on a loft's top: x0..x1, from ya(x) to yb(x) across (functions or numbers), lifted off it a little
function onTop(out, L, x0, x1, ya, yb, color, kind = MATTE, lift = 0.08, nx = 14, ny = 4) {
  ya = fnOf(ya); yb = fnOf(yb);
  grid(out, (i, j) => { const x = x0 + (x1 - x0) * j / nx, y = ya(x) + (yb(x) - ya(x)) * i / ny, [p, n] = L.top(x, y); return [add(p, scl(n, lift)), n, [0, 0, 0]]; }, nx, ny, color, kind, 0);
}
// a line along a loft's top through [x, y] points (a pinstripe, a seam)
const lineOn = (out, L, pts, r, color, lift = 0.1) => tube(out, pts.map(([x, y]) => { const [p, n] = L.top(x, y); return add(p, scl(n, lift)); }), r, color, MATTE, 0, 6);
// a racing number as thin strokes lying on a surface at c facing n, the digits' tops toward up, h tall
const DIGITS = (() => {
  const arc = (cx, cy, r, a0, a1, k = 10) => Array.from({ length: k + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / k; return [cx + r * Math.cos(a) * 1.05, cy + r * Math.sin(a)]; });
  const P = Math.PI;
  return {
    0: [arc(0.3, 0.5, 0.29, 0, TAU, 16).map(([x, y]) => [x, 0.5 + (y - 0.5) * 1.7])],
    1: [[[0.1, 0.78], [0.34, 1], [0.34, 0]]],
    2: [[...arc(0.3, 0.71, 0.27, P * 0.88, -P * 0.22), [0.02, 0], [0.6, 0]]],
    3: [arc(0.28, 0.75, 0.24, P * 0.85, -P / 2), arc(0.28, 0.27, 0.27, P / 2, -P * 0.85)],
    4: [[[0.46, 0], [0.46, 1], [0, 0.32], [0.62, 0.32]]],
    5: [[[0.55, 1], [0.1, 1], [0.06, 0.58], ...arc(0.3, 0.32, 0.3, P * 0.72, -P * 0.85)]],
    6: [[[0.52, 0.94], [0.3, 1], [0.08, 0.8], [0.02, 0.4], ...arc(0.3, 0.3, 0.29, P, P * 3)]],
    7: [[[0.02, 1], [0.6, 1], [0.22, 0]]],
    8: [arc(0.3, 0.76, 0.23, -P / 2, P * 1.5, 14), arc(0.3, 0.27, 0.27, P / 2, P * 2.5, 14)],
    9: [[...arc(0.3, 0.7, 0.29, 0, TAU, 16), [0.58, 0.4], [0.5, 0.12], [0.3, 0], [0.06, 0.08]]],
  };
})();
function number(out, n, c, nrm, up, h, color) {
  const s = String(n), right = cross(nrm, up), cw = 0.62 * h, gap = 0.18 * h, total = s.length * cw + (s.length - 1) * gap, C = col(color);
  [...s].forEach((d, k) => {
    const x0 = -total / 2 + k * (cw + gap);
    for (const st of DIGITS[d] || []) tube(out, st.map(([u, v]) => add(add(c, scl(right, x0 + u * h)), add(scl(up, (v - 0.5) * h), scl(nrm, 0.05)))), h * 0.085, C, MATTE, 0, 6);
  });
}
// a white racing roundel with its number, lying on a surface (c, facing nrm, number's top toward up)
function roundel(out, n, c, nrm, up, r) {
  decal(out, c, nrm, r, r, 0.3, col('#f7f7f4'), 0, 0.25);
  number(out, n, add(c, scl(nrm, 0.3)), nrm, up, r * 1.05, '#16181d');
}
const SEAT = '#2a2c33';

// ---------------------------------------------------------------- the cars (cars.js design units: nose +x, y to the
// car's right, z up; each returns the body without front wheels, one front wheel at the origin, the front hubs, the
// tail lamps and the shader's colour patches)
// sprint kart: exposed tyres on a steel tube frame, plastic nose, side pods and rear bumper, engine beside the seat
function kartMesh(P) {
  const out = [], W = [], paint = col(P.paint), dk = col(shadeHex(P.paint, -0.35)), trim = col(P.trim), stripe = col(P.stripe);
  tube(out, [[-22, -15.5, 7.5], [-22, 15.5, 7.5]], 1.25, col('#8a919b'), GLOSS, 0.6, 8);                                  // rear axle
  for (const s of [-1, 1]) tyre(out, [-22, s * 12.5, 7.5], 7.5, 9);
  tyre(W, [0, 0, 0], 5.75, 7.2);
  rbox(out, [-1, 0, 2.6], [15, 8, 1.2], col('#24262c'), MATTE, 0.3);                                                       // floor tray
  for (const s of [-1, 1]) {
    tube(out, smoothProf([[-27, s * 6, 3.2], [-10, s * 8, 3.2], [14, s * 6, 3.2], [20, s * 9.5, 4]], 3), 0.95, trim, GLOSS, 0.6, 8);   // frame rails
    tube(out, [[19, s * 9.5, 4.2], [17, s * 10, 5.75]], 0.7, col('#8a919b'), MATTE, 0.4, 6);                               // stub axles
    tube(out, [[30, s * 13, 4.2], [22, s * 9.6, 3.8]], 0.75, trim, GLOSS, 0.5, 8);                                          // bumper struts
    // side pods, a stripe along each
    rbox(out, [1.5, s * 12.4, 4.4], [9.5, 4.1, 2.5], paint, GLOSS, 0.45);
    if (P.git) {   // Octo's: a branch graph down each pod (commits as dots)
      const y0 = s * 11.8, y1 = s * 14.2, z = 6.98;
      tube(out, [[-5.5, y0, z], [9, y0, z]], 0.5, stripe, MATTE, 0, 6);
      tube(out, [[-3, y0, z], [-1.6, y0, z], [-0.4, (y0 + y1) / 2, z], [1, y1, z], [4.5, y1, z], [5.9, (y0 + y1) / 2, z], [7.2, y0, z]], 0.5, stripe, MATTE, 0, 6);
      for (const [x, y] of [[-5, y0], [-1, y0], [3, y0], [8.4, y0], [2.6, y1]]) { decal(out, [x, y, z], [0, 0, 1], 1.2, 1.2, 0.18, stripe, 0, 0); decal(out, [x, y, z + 0.12], [0, 0, 1], 0.75, 0.75, 0.16, col('#ffffff'), 0, 0); }
    } else rbox(out, [2, s * 13.4, 6.82], [6, 0.65, 0.12], stripe, MATTE, 0.3, 0);
    tail(out, [-35.05, s * 9, 4.6], [0.35, 1.9, 0.95]);
  }
  tube(out, [[14, -6, 3.2], [14, 6, 3.2]], 0.85, trim, GLOSS, 0.5, 8);
  if (!P.modern) tube(out, [[30, -13, 4.2], [33, -12, 4.2], [33, 12, 4.2], [30, 13, 4.2]], 0.75, trim, GLOSS, 0.5, 8);     // front bumper
  // engine on the right of the seat: a finned barrel, the carb, the header pipe
  rbox(out, [-11.5, 10.4, 7.2], [4.4, 3.5, 3.4], col('#b9bfc7'), GLOSS, 0.4);
  for (let k = 0; k < 5; k++) rbox(out, [-14.6 + k * 1.55, 10.4, 7.2], [0.28, 4, 3.8], col('#878e97'), MATTE, 0.5, 0.3);
  rbox(out, [-4.8, 10.2, 7.4], [1.8, 2.3, 1.8], col('#1b1c20'), MATTE, 0.4);
  tube(out, smoothProf([[-9, 9.5, 6], [-20, 11, 5], [-28, 7.5, 4.2]], 3), 1.05, col('#8b7f74'), GLOSS, 0.6, 8);
  if (P.modern) {
    // Octo's modern nose: a slim one into a full-width fairing, an orange lip, the Git logo on it, the number on the nose
    sweep(out, along(9, 26, 8, x => 5.4 - (x - 9) * 0.04), pw([[0, 7], [1, 8]]), pw([[0, 2.7], [1, 2.3]]), [0, 0, 1], paint, GLOSS, 1, 18);
    const F = loft(out, 22.5, 35.2, curve([[22.5, 8], [25.5, 12], [28, 13.8], [33.5, 13.6], [35.2, 12.6]]), 3.2, curve([[22.5, 7.4], [28, 7.1], [35.2, 5.6]]), paint, GLOSS, { e: 0.3, cap: [1.5, 1.5], rings: 12 });
    rbox(out, [34.9, 0, 4.4], [0.9, 13, 1.2], stripe, GLOSS, 0.4);
    const [c0, n0] = F.top(29, 0), u = norm(cross([0, 1, 0], n0)), v = [0, 1, 0], d = 4.1, gc = add(c0, scl(n0, 0.15));
    obox(out, gc, [norm(add(u, v)), norm(sub3(u, v)), n0], [d, d, 0.32], stripe, MATTE, 0.3, 0.5);   // (matte: a flat face in gloss flashes white)
    const r = d * Math.SQRT2, on = (X, Y, h = 0.42) => add(add(gc, scl(u, X)), add(scl(v, Y), scl(n0, h))), W1 = col('#ffffff');
    tube(out, [on(0.7 * r, -0.36 * r), on(0.36 * r, 0), on(-0.43 * r, 0)], 0.36, W1, MATTE, 0, 6);
    tube(out, [on(0.36 * r, 0), on(0, 0.43 * r)], 0.36, W1, MATTE, 0, 6);
    for (const [X, Y] of [[0.36 * r, 0], [-0.43 * r, 0], [0, 0.43 * r]]) decal(out, on(X, Y, 0.45), n0, 0.85, 0.85, 0.2, W1, 0, 0);
    roundel(out, P.num, [17.5, 0, 7.75], [0, 0, 1], [1, 0, 0], 3);
  } else {
    // the nose fairing, widening to the front, the number on it
    const nw = pw([[0, 6.5], [0.7, 7.5], [0.96, 10], [1, 10]]), nh = pw([[0, 2.7], [0.7, 2.2], [1, 1.9]]);
    sweep(out, along(9, 35.2, 14, x => 5.4 - (x - 9) * 0.053), nw, nh, [0, 0, 1], paint, GLOSS, 1, 18);
    roundel(out, P.num, [26.5, 0, 6.85], [0, 0, 1], [1, 0, 0], 3.7);
  }
  // rear bumper
  rbox(out, [-32.6, 0, 4.2], [2.4, 15.3, 2.2], dk, GLOSS, 0.4);
  // bucket seat, steering column and wheel
  rbox(out, [-6.5, 0, 4.4], [4.6, 5.2, 1.3], col(SEAT), MATTE, 0.5);
  rbox(out, [-11.6, 0, 8.4], [1.3, 5.4, 4.4], col(SEAT), MATTE, 0.5);
  tube(out, [[13, 0, 4.4], [6.5, 0, 9]], 0.6, col('#1b1c20'), MATTE, 0.4, 6);
  const nrm = norm([-1, 0, 0.8]), u = norm(cross([0, 1, 0], nrm));
  tube(out, Array.from({ length: 17 }, (_, i) => { const a = TAU * i / 16; return add([6, 0, 9.3], add(scl([0, 1, 0], 3.6 * Math.cos(a)), scl(u, 1.6 * Math.sin(a)))); }), 0.55, col('#141519'), MATTE, 0.4, 6);
  return { body: out, wheel: W, hubs: [[17, -12.8, 5.75], [17, 12.8, 5.75]], tails: [[-35.5, -9, 4.6], [-35.5, 9, 4.6]] };
}
// the tail lamps, dark (the brake light is drawn over them)
function tail(out, c, h) { rbox(out, c, h, col('#7e1212'), GLOSS, 0.4, 0.3); }
function shadeHex(h, a) { const c = col(h), t = a < 0 ? 0 : 1, p = Math.abs(a); return '#' + c.map(v => Math.round((v + (t - v) * p) * 255).toString(16).padStart(2, '0')).join(''); }

// formula car: a needle nose with a red tip, coke-bottle sidepods, a halo over the cockpit, front and rear wings in
// Java red on carbon, the Java cup on the pods
function f1Mesh(P) {
  const out = [], W = [], paint = col(P.paint), red = col(P.stripe), CARB = col('#1d1f24'), java = col(P.java || '#4f7fa6');
  tyre(W, [0, 0, 0], 5.5, 7.2);
  for (const s of [-1, 1]) {
    tyre(out, [-27, s * 10.6, 7], 7, 8.6);
    for (const [a, b] of [[[22, s * 7.5, 5.5], [10, s * 3, 4.2]], [[22, s * 7.5, 5.8], [16, s * 3, 6.6]], [[-27, s * 7, 7], [-16, s * 5, 4.6]], [[-27, s * 7, 7.4], [-21, s * 4, 7.8]]]) tube(out, [a, b], 0.42, CARB, MATTE, 0.35, 6);   // wishbones
  }
  rbox(out, [-11, 0, 1.4], [19, 11, 0.7], CARB, MATTE, 0.3);                                                               // floor
  // the sidepods (one coke-bottle sweep under the monocoque), a red flash along each, the Java cup on top
  const pwid = pw([[0, 4.5], [0.38, 10], [0.88, 10.5], [1, 8]]), phei = pw([[0, 2.6], [0.4, 3.4], [1, 3.2]]), pz = 4.4;
  sweep(out, along(-26, 6, 17, () => pz), pwid, phei, [0, 0, 1], paint, GLOSS, 1, 20);
  const podTop = (x, y) => { const t = (x + 26) / 32, a = pwid(t), b = phei(t); return pz + b * Math.sqrt(Math.max(0, 1 - (y / a) ** 2)); };
  for (const s of [-1, 1]) {
    const fl = []; for (let x = -24; x <= 2; x += 2) { const a = pwid((x + 26) / 32) * 0.86; fl.push([x, s * a, podTop(x, a) + 0.05]); }
    tube(out, fl, 0.55, red, MATTE, 0, 6);
    decal(out, [-4.6, s * 7.4, podTop(-4.6, 7.4) + 0.1], [0, s * 0.25, 1], 1.5, 1.25, 0.25, java, 0, 0);                    // the cup
    decal(out, [-4.6, s * 7.4, podTop(-4.6, 7.4) + 0.2], [0, s * 0.25, 1], 0.7, 0.55, 0.2, col('#f7f3e8'), 0, 0);           // (its coffee)
    rbox(out, [4.2, s * 9.4, pz + 0.4], [0.6, 1.4, 1.4], col('#050506'), MATTE, 0.5, 0);                                     // intakes
  }
  // the monocoque and nose (its tip red: the patch), a red chevron along the top
  const mw = pw([[0, 5], [0.37, 5.5], [0.71, 3.4], [0.9, 2.2], [1, 1.5]]), mh = pw([[0, 3.8], [0.37, 3.3], [0.71, 2.2], [1, 1.4]]);
  const mz = x => 6.2 - Math.max(0, x - 0) * 0.085;
  sweep(out, along(-14, 39.5, 22, mz), mw, mh, [0, 0, 1], paint, PATCH_GLOSS, 1, 20);
  const noseTop = x => { const t = (x + 14) / 53.5; return mz(x) + mh(t); };
  for (const s of [-1, 1]) tube(out, [[31, s * 1.3, noseTop(31) - 0.1], [21, s * 2.2, noseTop(21) - 0.15], [12, s * 3, noseTop(12) - 0.3]], 0.42, red, MATTE, 0, 6);
  roundel(out, P.num, [29, 0, noseTop(29) + 0.05], [0, 0, 1], [1, 0, 0], 2.5);
  // engine cover and airbox behind the driver, a curl of red steam down its spine
  const ew = pw([[0, 4.2], [1, 1.6]]), eh = pw([[0, 4.6], [1, 1.8]]);
  sweep(out, along(-12, -30, 7, x => 8 + (x + 12) * 0.144), ew, eh, [0, 0, 1], paint, GLOSS, 1, 16);
  rbox(out, [-14.5, 0, 11.6], [2.6, 2.4, 2.4], paint, GLOSS, 0.45);
  decal(out, [-11.95, 0, 11.9], [1, 0, 0], 1.7, 1.5, 0.3, col('#050506'), 0, 0);
  tube(out, smoothProf([[-28.5, 0, 7.6], [-25, -1.2, 9.6], [-21.5, 1.2, 10.9], [-18, 0, 12]], 4), 0.38, red, MATTE, 0, 6);
  // cockpit and halo, mirrors
  decal(out, [-6, 0, noseTop(-6) - 0.05], [0, 0, 1], 6, 3.4, 0.45, col('#0c0d10'), 0, 0);
  const halo = s => smoothProf([[-11.5, s * 4.3, 9.8], [-7, s * 4.8, 11.6], [-1.5, s * 2.8, 12.3], [1.5, 0, 12.4]], 4);
  tube(out, [...halo(-1), ...halo(1).reverse()], 0.75, col('#2b2d33'), GLOSS, 0.6, 8);
  tube(out, [[1.5, 0, 12.4], [4.5, 0, 9.2]], 0.7, col('#2b2d33'), GLOSS, 0.6, 8);
  for (const s of [-1, 1]) { tube(out, [[1, s * 5, 9.2], [2, s * 6.6, 10.2]], 0.3, CARB, MATTE, 0, 5); ellipsoid(out, [2.2, s * 7, 10.4], [[0.9, 0, 0], [0, 1.4, 0], [0, 0, 0.85]], paint, GLOSS, 12, 8, 0.6); }
  // front wing: carbon, a red flap and a white lip, red endplates, on two pylons
  rbox(out, [37.6, 0, 1.6], [3, 14.6, 0.55], CARB, MATTE, 0.3);
  rbox(out, [36.6, 0, 2.35], [1, 13.8, 0.35], red, GLOSS, 0.4, 0.4);
  rbox(out, [38.8, 0, 2.3], [0.5, 13.8, 0.3], paint, GLOSS, 0.4, 0.3);
  for (const s of [-1, 1]) { rbox(out, [37.6, s * 14.6, 2.6], [3.4, 0.45, 1.7], red, GLOSS, 0.4); tube(out, [[33, s * 1.2, 3], [35.5, s * 3, 1.9]], 0.4, CARB, MATTE, 0.3, 6); }
  // rear wing: a red main plane, a carbon flap, endplates, the beam wing, a pylon; the rain light
  rbox(out, [-38, 0, 11], [2.3, 10.8, 0.6], red, GLOSS, 0.4);
  rbox(out, [-35.7, 0, 12.3], [0.8, 10.6, 0.4], CARB, MATTE, 0.4);
  for (const s of [-1, 1]) rbox(out, [-37.6, s * 11.3, 9.6], [3.6, 0.5, 3.6], CARB, MATTE, 0.35);
  rbox(out, [-38.2, 0, 5.2], [1.6, 9.4, 0.4], CARB, MATTE, 0.4);
  tube(out, [[-30.5, 0, 6], [-36.5, 0, 10.6]], 0.75, CARB, MATTE, 0.5, 8);
  tail(out, [-41.4, 0, 4.4], [0.45, 1.2, 0.65]);
  return { body: out, wheel: W, hubs: [[22, -10.8, 5.5], [22, 10.8, 5.5]], tails: [[-42, 0, 4.4]], patches: [[[39.5, 0, mz(39.5)], [5.6, 6, 6], P.stripe]] };
}

// monster truck: four huge knobbly tyres on long-travel Rust-orange coilovers, a lifted pickup body with an open
// roll-cage cab, a hood scoop, the bull bar as a pair of crab pincers, the number on a cog on each door
function truckMesh(P) {
  const out = [], W = [], paint = col(P.paint), trim = col(P.trim), rust = col(P.rust || '#e2a91b'), DARK = col('#2c2f35'), BLACK = col('#16171b');
  const T = { knobs: 16, rim: 7.4, rimCol: '#3a3d44', hubCol: '#c9ced6', bolts: 8 };
  tyre(W, [0, 0, 0], 13.5, 12.8, T);
  for (const s of [-1, 1]) tyre(out, [-25, s * 13.6, 13.5], 13.5, 12.8, T);
  for (const x of [-25, 25]) {
    tube(out, [[x, -10, 13.5], [x, 10, 13.5]], 1.7, DARK, MATTE, 0.6, 8);                                                     // axle
    ball(out, [x, 0, 13.5], 3.4, DARK, MATTE, 0.6);                                                                          // diff
    for (const s of [-1, 1]) {
      tube(out, [[x + 3.6, s * 8, 13.5], [x + 1.4, s * 7, 28]], 0.7, col('#c9ced6'), GLOSS, 0.4, 6);                       // coilover: the shaft
      tube(out, [[x + 3.1, s * 7.8, 16.5], [x + 1.8, s * 7.2, 25.5]], 1.7, rust, GLOSS, 0.6, 10);                           // and its spring
      tube(out, [[x, s * 9, 13.5], [x - Math.sign(x) * 12, s * 5, 18]], 0.75, BLACK, MATTE, 0.4, 6);                       // a link
    }
  }
  for (const s of [-1, 1]) tube(out, [[-34, s * 4.5, 18], [32, s * 4.5, 18]], 1.4, BLACK, MATTE, 0.5, 8);                   // chassis rails
  // the body: a lifted pickup, the bed behind the cab, a Rust-orange flash down each flank
  rbox(out, [0, 0, 30.6], [36.6, 11.6, 4.9], paint, GLOSS, 0.3);
  for (const s of [-1, 1]) {
    const fl = smoothProf([[-34.5, s * 11.7, 29.6], [-10, s * 11.85, 30.6], [14, s * 11.8, 31.4], [31, s * 10.4, 31.6]], 3);
    tube(out, fl, t => 1.15 - 0.75 * t, rust, MATTE, 0, 8);
  }
  rbox(out, [-22, 0, 35.25], [10.8, 8.6, 0.5], col('#1f2126'), MATTE, 0.3, 0);                                            // bed
  for (let y = -6; y <= 6; y += 3) rbox(out, [-22, y, 35.78], [10, 0.22, 0.08], col('#121317'), MATTE, 0.5, 0);
  rbox(out, [-13.4, 0, 37.1], [1.6, 8.4, 1.8], col('#7d848d'), GLOSS, 0.35);                                              // toolbox
  // the open cab: floor, two bucket seats, dash, roll cage, windscreen, a light bar on top
  rbox(out, [0.5, 0, 35.4], [9, 9.6, 0.5], BLACK, MATTE, 0.3, 0);
  for (const s of [-1, 1]) { rbox(out, [5, s * 4.6, 37], [3.6, 3.5, 1.2], col(SEAT), MATTE, 0.5); rbox(out, [1.2, s * 4.6, 40.4], [1.2, 3.7, 4], col(SEAT), MATTE, 0.5); }
  rbox(out, [9.6, 0, 37.2], [1, 9.4, 1.7], BLACK, MATTE, 0.35);
  const hoop = (x, top) => smoothProf([[x, -10.6, 35.4], [x, -10.2, top - 3], [x, -7.6, top], [x, 7.6, top], [x, 10.2, top - 3], [x, 10.6, 35.4]], 3);
  tube(out, hoop(-8, 47), 1, trim, GLOSS, 0.7, 8); tube(out, hoop(9.4, 45.6), 1, trim, GLOSS, 0.7, 8);
  for (const s of [-1, 1]) tube(out, [[-8, s * 9.3, 46.3], [9.4, s * 9.3, 45]], 0.9, trim, GLOSS, 0.6, 8);
  tube(out, [[-8, -9.6, 46.2], [-8, 10.2, 36.5]], 0.8, trim, GLOSS, 0.5, 8);
  const tilt = 0.45, ax = [norm([Math.cos(tilt), 0, Math.sin(tilt)]), [0, 1, 0], norm([-Math.sin(tilt), 0, Math.cos(tilt)])];
  obox(out, [12.4, 0, 39.6], ax, [0.4, 9.2, 3.9], col('#2d4558'), GLOSS, 0.3, 0.6);                                       // windscreen
  rbox(out, [9.4, 0, 46.2], [0.8, 8.6, 0.55], BLACK, MATTE, 0.4);
  for (let y = -7.5; y <= 7.5; y += 2.5) ball(out, [10.2, y, 46.4], 0.95, col('#fffbe6'), GLOSS, 0.4, 10, 6);
  // the hood: a scoop, headlights, a grille
  rbox(out, [24.5, 0, 36.2], [5.6, 3.6, 1.7], col(shadeHex(P.paint, -0.22)), GLOSS, 0.35);
  decal(out, [30.15, 0, 36.6], [1, 0, 0], 2.6, 1.1, 0.3, col('#050506'), 0, 0);
  for (const s of [-1, 1]) { ellipsoid(out, [36.2, s * 7, 31.6], [[0.6, 0, 0], [0, 2.4, 0], [0, 0, 2.4]], col('#dfe4ea'), GLOSS, 12, 8, 0.4); ball(out, [36.6, s * 7, 31.6], 1.8, col('#fff6d8'), GLOSS, 0.3, 12, 8); }
  rbox(out, [36.7, 0, 30.2], [0.45, 4.2, 2.5], BLACK, MATTE, 0.4);
  // the bull bar: two crab pincers in Rust orange, a palm on each corner and two fingers reaching for the middle
  for (const s of [-1, 1]) {
    tube(out, [[35.5, s * 6.5, 27.5], [37.8, s * 9.6, 28]], 0.9, BLACK, MATTE, 0.4, 6);
    ball(out, [38, s * 9.8, 28.2], 3, rust, GLOSS, 1, 14, 10);
    tube(out, smoothProf([[39, s * 8.2, 29.6], [41, s * 5.8, 30], [41.3, s * 2, 29.4]], 3), t => 1.6 - 1.0 * t, rust, GLOSS, 1, 9);
    tube(out, smoothProf([[39, s * 8.4, 26.6], [40.4, s * 6.2, 26.2], [40.6, s * 4, 26.6]], 3), t => 1.3 - 0.8 * t, rust, GLOSS, 1, 9);
  }
  // mirrors, tail lamps, the number on a cog on each door
  for (const s of [-1, 1]) {
    tube(out, [[11, s * 11.3, 36], [12, s * 13.2, 37.6]], 0.35, BLACK, MATTE, 0, 5);
    ellipsoid(out, [12, s * 13.8, 37.9], [[0.8, 0, 0], [0, 1.5, 0], [0, 0, 1.2]], paint, GLOSS, 12, 8, 0.6);
    tail(out, [-36.6, s * 7.5, 31.6], [0.45, 1.6, 1.2]);
    const c = [-1, s * 11.75, 30.6], n = [0, s, 0];
    decal(out, c, n, 3.1, 3.1, 0.3, rust, 0, 0);
    for (let k = 0; k < 12; k++) { const a = TAU * k / 12; ellipsoid(out, add(c, [Math.cos(a) * 3.3, 0.05 * s, Math.sin(a) * 3.3]), [[0.55, 0, 0], [0, 0.3, 0], [0, 0, 0.55]], rust, MATTE, 6, 4, 0); }
    roundel(out, P.num, add(c, [0, s * 0.3, 0]), n, [0, 0, 1], 2.4);
  }
  return { body: out, wheel: W, hubs: [[25, -13.6, 13.5], [25, 13.6, 13.5]], tails: [[-37.1, -7.5, 31.6], [-37.1, 7.5, 31.6]] };
}

const GLASS = '#2d4558', CHROME = '#dfe4ea';
// a round lamp facing along d (a headlight), in a chrome ring
function lamp(out, c, d, r, lens = '#fff6d8') {
  decal(out, c, d, r + 0.5, r + 0.5, 0.45, col(CHROME), 0, 0.4, GLOSS);
  decal(out, add(c, scl(norm(d), 0.3)), d, r, r, 0.4, col(lens), 0, 0, GLOSS);
}
// a steering wheel at c, tipped back toward the driver, r across
function wheelRing(out, c, r) {
  const nrm = norm([-1, 0, 0.8]), u = norm(cross([0, 1, 0], nrm));
  tube(out, Array.from({ length: 17 }, (_, i) => { const a = TAU * i / 16; return add(c, add(scl([0, 1, 0], r * Math.cos(a)), scl(u, r * 0.45 * Math.sin(a)))); }), 0.5, col('#141519'), MATTE, 0.4, 6);
}

// rear-engined sports coupé (the classic 911): round nose and headlights, a glasshouse with an open sunroof (Pyth rides
// in it), a fastback, wide haunches, a ducktail, a full-width tail light bar; twin blue-and-yellow stripes, Python logo
function sportsMesh(P) {
  const out = [], W = [], paint = col(P.paint), blue = col(P.stripe), yel = col(P.stripe2 || P.stripe), DARK = col('#16171b');
  tyre(W, [0, 0, 0], 5.5, 6);
  for (const s of [-1, 1]) tyre(out, [-20, s * 16, 6.2], 6.2, 6);
  // the shell: low and round, the haunches swelling over the rear wheels, the ducktail lifting at the back
  const B = loft(out, -34.4, 34.6, curve([[-34.4, 13.6], [-31.4, 16.2], [-21, 17.2], [-11, 16.2], [-2, 14.2], [11, 14.2], [18, 14.8], [27, 14.8], [33.2, 12.6], [34.6, 9]]),
    3.4, curve([[-34.4, 9.6], [-32, 11.4], [-29.5, 11.6], [-25, 10.4], [-18, 10.8], [-6, 10.6], [11, 10.2], [20, 9.6], [28, 9], [32, 8], [34.6, 6.6]]), paint, GLOSS, { e: 0.42, cap: [2.5, 3.5], rings: 30 });
  for (const s of [-1, 1]) {
    ellipsoid(out, [21, s * 12.6, 8.3], [[9.5, 0, 0], [0, 3.6, 0], [0, 0, 3.6]], paint, GLOSS, 20, 12);    // front wing crowns
    ellipsoid(out, [-19.5, s * 13.6, 8.8], [[12, 0, 0], [0, 3.8, 0], [0, 0, 3.6]], paint, GLOSS, 20, 12);  // rear haunches
    lamp(out, [29.6, s * 11.4, 9.1], [1, s * 0.15, 0.55], 2.1);
    rbox(out, [33.9, s * 9.6, 6.6], [0.5, 1, 0.6], col('#ffb02e'), GLOSS, 0.4, 0);                      // indicators
    tube(out, [[7, s * 13.6, 10.4], [7.4, s * 15.2, 11.4]], 0.3, DARK, MATTE, 0, 5);                     // door mirrors
    ellipsoid(out, [7.4, s * 15.6, 11.6], [[1, 0, 0], [0, 1.4, 0], [0, 0, 1]], col('#2a2c31'), GLOSS, 10, 6, 0.6);
    const [dp, dn] = B.at(-3, s > 0 ? 0.35 : Math.PI - 0.35); roundel(out, P.num, add(dp, scl(dn, 0.1)), dn, [0, 0, 1], 1.9);   // the doors' numbers
  }
  // the glasshouse, then the roof on it with the sunroof open, the stripes over all of it
  loft(out, -20.2, 11.2, curve([[-20.2, 6.6], [-12, 10.4], [0, 11.6], [11.2, 10.8]]), 9, curve([[-20.2, 10.4], [-14, 13.6], [-9, 15.6], [4, 15.6], [11.2, 10.6]]), col(GLASS), GLOSS, { e: 0.55, cap: [3, 3], rings: 16 });
  const R = loft(out, -11.6, 5.4, curve([[-11.6, 8.6], [-4, 10], [5.4, 9.6]]), 14.6, 16.25, paint, GLOSS, { e: 0.3, cap: [1.5, 1.5], rings: 10, sides: 24 });
  rbox(out, [-3, 0, 16.3], [3.8, 5, 0.12], DARK, MATTE, 0.35, 0);
  for (const s of [-1, 1]) for (const [L, a, b] of [[B, 11, 34], [R, -11, -6.6], [R, 0.6, 5], [B, -34.2, -28.4]]) {
    onTop(out, L, a, b, s * 3.6 - 1.6, s * 3.6 + 1.6, yel, MATTE, 0.06, 10, 2);
    onTop(out, L, a, b, s * 3.6 - 1.15, s * 3.6 + 1.15, blue, MATTE, 0.12, 10, 2);
  }
  // the Python logo on the bonnet: a blue snake and a yellow one, locked together
  const [lp] = B.top(25, 0);
  rbox(out, add(lp, [0.5, -0.5, 0.15]), [1.4, 1.1, 0.12], blue, MATTE, 0.5, 0); rbox(out, add(lp, [-0.5, 0.5, 0.25]), [1.4, 1.1, 0.12], yel, MATTE, 0.5, 0);
  // the engine lid's grille, the light bar and lamps across the tail
  const [gp] = B.top(-24, 0);
  rbox(out, add(gp, [0, 0, 0.05]), [3.3, 5.6, 0.2], DARK, MATTE, 0.3, 0);
  for (let y = -4.4; y <= 4.5; y += 1.47) tube(out, [add(gp, [-2.7, y, 0.3]), add(gp, [2.7, y, 0.3])], 0.22, col('#8d949d'), MATTE, 0, 5);
  rbox(out, [-34.4, 0, 8.2], [0.5, 12.6, 0.8], col('#8e1414'), GLOSS, 0.4, 0.3);
  for (const s of [-1, 1]) tail(out, [-34.2, s * 12, 8.2], [0.5, 2.2, 1]);
  return { body: out, wheel: W, hubs: [[20.5, -15.6, 5.5], [20.5, 15.6, 5.5]], tails: [[-34.9, -12, 8.2], [-34.9, 0, 8.2], [-34.9, 12, 8.2]] };
}

// bobsled in Tux's colours: a white cowl with black tails down its flanks and a yellow pinstripe, a snowflake on each,
// a yellow nose cone (the beak), an open cockpit, four steel runners (the front pair steers), push bars
const SLED_TAIL = s => [[-45, s * 20, 6], [72.6, 15.2, 30]];
function sledMesh(P) {
  const out = [], W = [], paint = col(P.paint), trim = col(P.trim), yel = col(P.stripe), STEEL = col('#8a929c'), CH = col(CHROME);
  const runner = (o, x0, x1, y) => {   // a blade on the ice, its front curling up, two struts up into the cowl
    tube(o, smoothProf([[x0, y, 0.8], [x1 - 3, y, 0.8], [x1, y, 1.8], [x1 + 0.6, y, 3.6]], 3), 0.8, STEEL, GLOSS, 0.6, 8);
  };
  runner(W, -12, 12, 0);
  for (const s of [-1, 1]) {
    runner(out, -37, -13, s * 12.6);
    for (const x of [-33, -17, 18, 30]) tube(out, [[x, s * 12.6, 1], [x + 1, s * 11, 4.5]], 0.55, STEEL, MATTE, 0.4, 6);
    tube(out, [[-29, s * 10, 7], [-36, s * 12.4, 9.5], [-38.5, s * 13.6, 10]], 0.65, CH, GLOSS, 0.6, 8);     // push bars
    tube(out, [[12, s * 10.6, 8.6], [8, s * 13, 10.4], [6, s * 14, 10.4]], 0.55, CH, GLOSS, 0.6, 8);
  }
  // the cowl: the black tails are the shader's colour patches (crisp edges), the beak its own part
  const zt = curve([[-38.5, 8.4], [-22, 9.4], [6, 9.8], [22, 8.8], [31, 7.2]]), w = curve([[-38.5, 10.6], [-22, 12], [6, 12.4], [22, 11], [31, 8]]);
  const L = loft(out, -38.5, 31.5, w, 2.6, zt, paint, PATCH_GLOSS, { e: 0.7, cap: [2, 0], rings: 30, sides: 30 });
  loft(out, 30.5, 39.8, curve([[30.5, 8.15], [33, 7.2], [36.5, 4.6], [39.8, 1.8]]), curve([[30.5, 2.6], [39.8, 3.4]]), curve([[30.5, 7.25], [33, 6.6], [36.5, 5.4], [39.8, 4.2]]), yel, GLOSS, { e: 0.7, cap: [0, 3], rings: 8, sides: 30 });
  for (const s of [-1, 1]) {
    // the pinstripe along the tails' edge (where the patch meets the top), a snowflake on each tail
    const [pc, pr] = SLED_TAIL(s), edge = [];
    for (let x = -37; x <= 19; x += 2) {
      let a = 0, b = 13; for (let k = 0; k < 18; k++) { const m = (a + b) / 2, p = L.top(x, s * m)[0], d = (p[0] - pc[0]) / pr[0], e = (p[1] - pc[1]) / pr[1], f = (p[2] - pc[2]) / pr[2]; if (d * d + e * e + f * f < 1) b = m; else a = m; }
      if (a < w(x) * 0.97) edge.push([x, s * (a - 0.25)]);
    }
    lineOn(out, L, edge, 0.42, yel, 0.12);
    const [fp, fn] = L.top(-22, s * 10.2), fu = norm(cross([0, 1, 0], fn));
    for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3, d = add(scl(fu, Math.cos(a) * 1.8), scl([0, 1, 0], Math.sin(a) * 1.8)); tube(out, [add(add(fp, scl(fn, 0.15)), d), add(add(fp, scl(fn, 0.15)), scl(d, -1))], 0.24, col(P.ice || '#e8f4fb'), MATTE, 0, 5); }
  }
  // the open cockpit, its silver rim, two steering rings; the number on the nose; the tail and its lamps
  const cw = curve([[-33, 1], [-31, 6.5], [8, 7.5], [12, 4], [14, 0.5]]);
  onTop(out, L, -33, 14, x => -cw(x), x => cw(x), col('#060708'), MATTE, 0.1, 16, 6);
  const rim = []; for (let x = -33; x <= 14; x += 2.35) rim.push([x, -cw(x)]); for (let x = 14; x >= -33; x -= 2.35) rim.push([x, cw(x)]); rim.push(rim[0]);
  lineOn(out, L, rim, 0.6, col('#e3e7ec'), 0.3); ellipsoid(out, add(L.top(-8, 0)[0], [0, 0, 0.1]), [[5.5, 0, 0], [0, 4.6, 0], [0, 0, 0.8]], col('#2a2c33'), MATTE, 16, 8, 0);   // (and Tux's seat)
  for (const s of [-1, 1]) { const [p] = L.top(8, s * 3.5); tube(out, Array.from({ length: 13 }, (_, i) => add(p, [0, Math.cos(TAU * i / 12) * 1.2, 0.6 + Math.sin(TAU * i / 12) * 1.2])), 0.32, col('#c9ced5'), MATTE, 0.3, 5); }
  const [np, nn] = L.top(22.5, 0); roundel(out, P.num, add(np, scl(nn, 0.05)), nn, [1, 0, 0], 3.2);
  rbox(out, [-38.6, 0, 5.4], [0.9, 5, 2], col('#26282d'), MATTE, 0.4);
  for (const s of [-1, 1]) tail(out, [-38.9, s * 6.6, 5.6], [0.5, 1.2, 1]);
  return { body: out, wheel: W, hubs: [[24, -12.6, 0], [24, 12.6, 0]], tails: [[-39.4, -6.6, 5.6], [-39.4, 6.6, 5.6]], patches: [-1, 1].map(s => [...SLED_TAIL(s), P.trim]) };
}

// Meyers-Manx style dune buggy: fibreglass tub, round front fenders, spare on the hood, low screen, roll bar, an open
// air-cooled flat four with twin pipes; knobbly tyres
function buggyMesh(P) {
  const out = [], W = [], paint = col(P.paint), trim = col(P.trim), CH = col(CHROME), DARK = col('#1b1c20');
  tyre(W, [0, 0, 0], 6, 6.6, { knobs: 10 });
  for (const s of [-1, 1]) tyre(out, [-19, s * 10.6, 7.5], 7.5, 8.8, { knobs: 12 });
  tube(out, [[-19, -7, 7.5], [-19, 7, 7.5]], 1.1, col('#7d848e'), GLOSS, 0.5, 8);
  // the engine out back
  rbox(out, [-22.5, 0, 6.6], [6.5, 7, 3], col('#8a8f96'), MATTE, 0.35);
  for (let k = 0; k < 4; k++) rbox(out, [-26.5 + k * 2.4, 0, 9.6], [0.4, 6.2, 0.5], col('#5d6066'), MATTE, 0.5, 0.3);
  ellipsoid(out, [-21, 0, 11.6], [[4, 0, 0], [0, 4, 0], [0, 0, 1.8]], CH, GLOSS, 18, 10);
  for (const s of [-1, 1]) tube(out, [[-27, s * 4, 5], [-31.4, s * 5, 5.8]], 0.8, CH, GLOSS, 0.6, 8);
  // the tub and its fenders
  const T = loft(out, -17, 31, curve([[-17, 8.5], [-15, 9.5], [3, 10], [10, 13], [14, 14.5], [26, 14.5], [29.5, 10], [31, 6]]), 3.6,
    curve([[-17, 9.2], [-6, 9.6], [6, 10], [14, 10.4], [24, 10], [31, 8.2]]), paint, GLOSS, { e: 0.42, cap: [2, 3], rings: 26 });
  for (const s of [-1, 1]) {
    ellipsoid(out, [19.5, s * 10.8, 9.8], [[9, 0, 0], [0, 4.2, 0], [0, 0, 3.8]], paint, GLOSS, 20, 12);
    lamp(out, [28, s * 9.6, 10.6], [1, 0, 0.5], 1.8);
    tail(out, [-29.2, s * 6.5, 7.6], [0.5, 0.9, 1.3]);
  }
  // the spare tyre lying on the hood
  const [hp, hn] = T.top(21, 0);
  decal(out, add(hp, scl(hn, 0.6)), hn, 5.4, 5.4, 1.4, col('#24262b'), 0, 0.6);
  decal(out, add(hp, scl(hn, 1.9)), hn, 3, 3, 0.4, CH, 0, 0, GLOSS);
  decal(out, add(hp, scl(hn, 2.3)), hn, 1.2, 1.2, 0.3, col('#555b63'), 0, 0);
  // the cockpit, its seats and the wheel, the low screen, the roll bar
  const cw = curve([[-14, 1], [-13, 8], [8, 8.5], [10, 1]]);
  onTop(out, T, -14, 10, x => -cw(x), x => cw(x), DARK, MATTE, 0.1, 12, 6);
  for (const s of [-1, 1]) { rbox(out, [-4, s * 3.8, 8.9], [3.6, 2.8, 0.9], col(SEAT), MATTE, 0.5); rbox(out, [-7.6, s * 3.8, 11.4], [0.9, 2.8, 3], col(SEAT), MATTE, 0.5); }
  wheelRing(out, [4.5, -3.8, 12], 2.6);
  obox(out, [9.4, 0, 12.6], [norm([1, 0, 0.5]), [0, 1, 0], norm([-0.5, 0, 1])], [0.3, 9, 2.4], col(GLASS), GLOSS, 0.3, 0.6);
  tube(out, smoothProf([[-12, -10.2, 9], [-12, -9.4, 16.6], [-12, -6, 18.4], [-12, 6, 18.4], [-12, 9.4, 16.6], [-12, 10.2, 9]], 3), 1, trim, GLOSS, 0.7, 8);
  for (const s of [-1, 1]) tube(out, [[-12, s * 7.6, 18], [-25, s * 6.5, 9.4]], 0.7, trim, GLOSS, 0.6, 8);
  const [rp, rn] = T.at(13, -2.1); roundel(out, P.num, add(rp, scl(rn, 0.1)), rn, [1, 0, 0.3], 2.2);
  return { body: out, wheel: W, hubs: [[19, -11.2, 6], [19, 11.2, 6]], tails: [[-29.8, -6.5, 7.6], [-29.8, 6.5, 7.6]] };
}

// concept hypercar: teardrop fuselage under a bubble canopy, separate front fender pods, carbon floor, full-width rear
// deck wrapping the rear wheels, twin white stripes, a shark fin to a rear wing on swan-neck pylons, LED tail bar
function hyperMesh(P) {
  const out = [], W = [], paint = col(P.paint), deep = col(P.deep || P.trim), white = col(P.stripe), CARB = col('#1d1f24'), BLK = col('#08090b');
  tyre(W, [0, 0, 0], 6.5, 7.4);
  for (const s of [-1, 1]) tyre(out, [-25, s * 15.2, 7.5], 7.5, 8.4);
  // the floor and splitter
  loft(out, -10, 41.8, curve([[-10, 16.5], [0, 17], [12, 19], [37, 18], [41.8, 11]]), 1.2, 2.6, CARB, MATTE, { e: 0.25, cap: [1, 1.2], rings: 10 });
  // the rear deck
  const D = loft(out, -42, -1.5, curve([[-42, 10], [-39.5, 17], [-31, 19.8], [-14, 19.8], [-5, 17.5], [-1.5, 9]]), 3,
    curve([[-42, 10.4], [-36, 14], [-25, 15.8], [-14, 14.8], [-5, 11.5], [-1.5, 9.5]]), paint, GLOSS, { e: 0.4, cap: [2, 2.5], rings: 24 });
  for (const s of [-1, 1]) {
    const [ip, inn] = D.at(-4.4, s > 0 ? 0.4 : Math.PI - 0.4); decal(out, add(ip, scl(inn, 0.1)), inn, 3.8, 1.7, 0.4, BLK, 0, 0);   // intakes
    for (let x = -31; x <= -20; x += 2.2) lineOn(out, D, [[x, s * 12.5], [x + 1.2, s * 17.2]], 0.4, col('#0b0c0f'), 0.12);       // louvres
    lineOn(out, D, Array.from({ length: 11 }, (_, i) => [-36 + i * 3, s * 18.4]), 0.42, deep, 0.1);                              // pinstripe
    const [np, nn] = D.top(-13, s * 14.5); roundel(out, P.num, add(np, scl(nn, 0.06)), nn, [1, 0, 0], 2.6);
  }
  // the front fender pods
  for (const s of [-1, 1]) {
    const y = s * 14.6, n0 = out.length;
    const F = loft(out, 7.5, 37.5, curve([[7.5, 4], [11, 4.8], [21, 5.7], [34, 5], [37.5, 3.6]]), 3.6, curve([[7.5, 9.6], [16, 13.2], [24, 14.2], [33, 11.4], [37.5, 8.6]]), paint, GLOSS, { e: 0.5, cap: [2.5, 2.5], rings: 18, sides: 24 });
    shiftY(out, n0, y);   // (a loft is built on the centre line: this one moves out to its side)
    const at = (x, yy) => { const [p, n] = F.top(x, yy); return [add(p, [0, y, 0]), n]; };
    const [wp, wn] = at(24, 0); decal(out, add(wp, scl(wn, 0.05)), wn, 7.2, 3.2, 0.5, BLK, 0, 0);                               // the window over the tyre
    for (let x = 11; x <= 15; x += 1.8) tube(out, [add(at(x, -2.6)[0], [0, 0, 0.15]), add(at(x, 2.6)[0], [0, 0, 0.15])], 0.32, col('#0b0c0f'), MATTE, 0, 5);
    tube(out, Array.from({ length: 7 }, (_, k) => add(F.at(36.4, Math.PI / 2 + (k - 3) * 0.3)[0], [0.3, y, 0])), 0.55, col('#eaf8ff'), GLOSS, 0, 6);   // the LED strip
  }
  // the fuselage and its stripes, the canopy, mirrors, the fin
  const B = loft(out, -41, 40.5, curve([[-41, 2.4], [-36, 4], [-20, 7], [-6, 9], [6, 9], [16, 6.6], [30, 4], [40.5, 2.2]]), 2.6,
    curve([[-41, 8.4], [-36, 9.6], [-20, 11.2], [-6, 12.4], [6, 12.2], [16, 10.4], [30, 7.4], [40.5, 5.2]]), paint, GLOSS, { e: 0.5, cap: [2, 2], rings: 32 });
  for (const s of [-1, 1]) {
    onTop(out, B, 14, 39.4, x => s * (0.5 + 0.9 * (39.5 - x) / 25.5), x => s * (1.3 + 1.4 * (39.5 - x) / 25.5), white, MATTE, 0.1, 10, 2);
    onTop(out, B, -39, -11, x => s * (0.6 + 1 * (x + 39) / 28), x => s * (1.5 + 1.5 * (x + 39) / 28), white, MATTE, 0.1, 10, 2);
    tube(out, [[6, s * 8.2, 11], [7.6, s * 11, 12]], 0.35, CARB, MATTE, 0, 5);
    ellipsoid(out, [7.6, s * 11.8, 12.2], [[1, 0, 0], [0, 1.6, 0], [0, 0, 1.1]], paint, GLOSS, 10, 6, 0.6);
  }
  ellipsoid(out, [1.5, 0, 11.6], [[11.5, 0, 0], [0, 6.8, 0], [0, 0, 6.4]], col(GLASS), GLOSS, 28, 16);
  obox(out, [-22, 0, 13.4], [norm([1, 0, 0.08]), [0, 1, 0], norm([-0.08, 0, 1])], [13, 0.55, 3], deep, GLOSS, 0.3, 0.6);
  // the rear wing: pylons, a carbon wing with the paint and a white line on it, endplates; the LED bar across the tail
  for (const s of [-1, 1]) tube(out, smoothProf([[-30, s * 5, 10.4], [-33.5, s * 5, 15], [-35.6, s * 5, 17.6]], 3), 0.65, BLK, MATTE, 0.5, 6);
  rbox(out, [-36.4, 0, 18.2], [3.2, 18.6, 0.6], CARB, MATTE, 0.3);
  rbox(out, [-37.6, 0, 18.85], [1.2, 17.6, 0.12], paint, MATTE, 0.3, 0); rbox(out, [-35.6, 0, 18.85], [0.4, 17.6, 0.12], white, MATTE, 0.3, 0);
  for (const s of [-1, 1]) rbox(out, [-36.3, s * 18.8, 17], [3.7, 0.5, 2.8], BLK, MATTE, 0.35);
  rbox(out, [-41.9, 0, 8.6], [0.45, 15.6, 0.7], col('#8e1414'), GLOSS, 0.4, 0.3);
  return { body: out, wheel: W, hubs: [[24, -14.9, 6.5], [24, 14.9, 6.5]], tails: [[-42.4, -11, 8.6], [-42.4, 0, 8.6], [-42.4, 11, 8.6]] };
}

// boxy little electric kart: white tub on exposed wheels, green side pods (charge ports) and nerf bar, LED lights, a
// battery pack out back and two whip aerials splayed like the Android's antennae
function ekartMesh(P) {
  const out = [], W = [], paint = col(P.paint), G = col(P.trim), GD = col(P.deep || P.trim), batt = col(P.batt || '#2b3540'), DARK = col('#17181c');
  tyre(W, [0, 0, 0], 5.25, 6.8);
  for (const s of [-1, 1]) tyre(out, [-19, s * 12.6, 6.75], 6.75, 8.4);
  tube(out, [[-19, -15, 6.75], [-19, 15, 6.75]], 1.1, col('#7d848e'), GLOSS, 0.5, 8);
  rbox(out, [-0.5, 0, 2.4], [27.5, 8, 1], col('#1a1c21'), MATTE, 0.3);
  for (const s of [-1, 1]) {
    tube(out, [[19.5, s * 9, 4.6], [19.5, s * 10.6, 5.25]], 0.7, col('#8a919b'), MATTE, 0.4, 6);
    rbox(out, [0.25, s * 12.6, 4.8], [11.6, 3.1, 2.3], G, GLOSS, 0.25);                                                     // side pods
    rbox(out, [6.3, s * 12.6, 7.1], [1.8, 1.4, 0.12], col('#16191d'), MATTE, 0.4, 0); ball(out, [6.3, s * 12.6, 7.25], 0.6, col('#9cf5c4'), GLOSS, 0, 8, 5);
  }
  // the tub: flat sides, chamfered nose corners
  const T = loft(out, -25.5, 27.5, curve([[-25.5, 9], [-24, 10.6], [21, 10.6], [24.5, 9.2], [27.5, 7.4]]), 3, curve([[-25.5, 10.4], [0, 10.6], [27.5, 10]]), paint, GLOSS, { e: 0.2, cap: [1.2, 1.2], rings: 22, sides: 32 });
  lineOn(out, T, [[9.5, -7.4], [20, -7.4], [24.6, -5.2], [24.6, 5.2], [20, 7.4], [9.5, 7.4], [9.5, -7.4]], 0.45, G, 0.12);
  const [rp, rn] = T.top(17, 0); roundel(out, P.num, add(rp, scl(rn, 0.05)), rn, [1, 0, 0], 3.4);
  for (const s of [-1, 1]) rbox(out, [27.4, s * 6.3, 7.6], [0.5, 1.9, 0.8], col('#eafff3'), GLOSS, 0.4, 0.3);              // LED headlights
  // the green nerf bar across the nose
  rbox(out, [29.5, 0, 5.2], [1.3, 14.5, 1.3], G, GLOSS, 0.45);
  for (const s of [-1, 1]) tube(out, [[26.6, s * 5, 5.2], [28.4, s * 5, 5.2]], 0.6, col('#7d848e'), MATTE, 0.4, 6);
  // the cockpit: an open box, the seat, the wheel
  onTop(out, T, -12, 9, -7, 7, DARK, MATTE, 0.1, 10, 6);
  rbox(out, [-4, 0, 10.9], [4.4, 4.6, 0.8], col(SEAT), MATTE, 0.5); rbox(out, [-9.2, 0, 13.4], [1, 4.8, 3], col(SEAT), MATTE, 0.5);
  wheelRing(out, [5.5, 0, 13.4], 3.2);
  tube(out, [[9, 0, 10.6], [5.8, 0, 13.2]], 0.5, col('#1b1c20'), MATTE, 0.4, 6);
  // the battery pack: a slate box of cells, a charge meter (three bars lit), a bolt
  rbox(out, [-20, 0, 12.4], [6.5, 8.2, 2.2], batt, GLOSS, 0.3);
  for (let x = -24.5; x < -14; x += 2.4) for (const s of [-1, 1]) tube(out, [[x, s * 2.6, 14.65], [x, s * 7, 14.65]], 0.2, col('#1b2229'), MATTE, 0, 4);
  rbox(out, [-20.3, 0, 14.6], [4.7, 1.6, 0.12], col('#0d1013'), MATTE, 0.3, 0);
  for (let k = 0; k < 4; k++) rbox(out, [-23.6 + k * 2.2, 0, 14.75], [0.8, 1, 0.1], k < 3 ? G : col('#20523a'), MATTE, 0.3, 0);
  tube(out, [[-14, -0.6, 14.7], [-15.6, 1.2, 14.7], [-15.2, -0.6, 14.7], [-16.4, 0.9, 14.7]], 0.3, G, MATTE, 0, 5);
  // the rear bumper and its LED tail strip, the aerials
  rbox(out, [-29, 0, 5.4], [1.5, 12, 1.6], col('#8b929c'), GLOSS, 0.4);
  for (const s of [-1, 1]) {
    tail(out, [-30.4, s * 8.2, 5.4], [0.35, 2.5, 0.7]);
    ball(out, [-23.5, s * 7, 14.6], 1.1, col('#4a525c'), MATTE, 1, 10, 6);
    tube(out, [[-23.5, s * 7, 14.6], [-27, s * 11.4, 21], [-30, s * 15.4, 26]], 0.45, col('#1b1d22'), MATTE, 0.5, 6);
    ball(out, [-30, s * 15.4, 26.4], 1.4, G, GLOSS, 0.6, 12, 8); decal(out, [-30, s * 15.4, 26.4], [0, 0, 1], 1.5, 1.5, 0.35, GD, 0, 0);
  }
  return { body: out, wheel: W, hubs: [[19.5, -12.8, 5.25], [19.5, 12.8, 5.25]], tails: [[-30.8, -8.2, 5.4], [-30.8, 8.2, 5.4]] };
}

// cab-over tractor and a 20 ft container (corrugated, corner castings, a whale's tail stencil on top); a cab with wind
// deflector, blue band, marker lights, chrome stacks; Docky rides in a hatch on the container's front
function vanMesh(P) {
  const out = [], W = [], paint = col(P.paint), box = col(P.box || P.trim), rib = col(shadeHex(P.box || P.trim, -0.18)), corner = col(shadeHex(P.box || P.trim, -0.6)), CH = col(CHROME), BLK = col('#16171b');
  tyre(W, [0, 0, 0], 5, 5);
  for (const s of [-1, 1]) { tyre(out, [18, s * 17.6, 5], 5, 5); for (const x of [-30, -40]) tyre(out, [x, s * 17.6, 4.75], 4.75, 5); }
  rbox(out, [-35, 0, 7.5], [13, 15, 1.6], BLK, MATTE, 0.3);                    // the trailer's bogie
  rbox(out, [30, 0, 6], [17, 6, 1.6], BLK, MATTE, 0.3);                        // the tractor's chassis
  // the container: sides and roof ribbed, castings on its corners
  const bx0 = -47, bx1 = 21, zb = 9.4, zt = 33.4, cx = (bx0 + bx1) / 2, cz = (zb + zt) / 2;
  rbox(out, [cx, 0, cz], [(bx1 - bx0) / 2, 18.6, (zt - zb) / 2], box, MATTE, 0.12);
  for (let x = bx0 + 3.6; x < bx1 - 2; x += 3.2) rbox(out, [x, 0, cz], [0.6, 18.85, (zt - zb) / 2 + 0.22], rib, MATTE, 0.12, 0);
  for (const x of [bx0 + 1.3, bx1 - 1.3]) for (const s of [-1, 1]) for (const z of [zb + 1.3, zt - 1.3]) rbox(out, [x, s * 17.6, z], [1.5, 1.5, 1.5], corner, MATTE, 0.3, 0);
  const rust = col(mixHex(P.box || P.trim, '#6b3a22', 0.4));
  for (const [x, y, r] of [[-44, -14, 2.4], [-20, 15.5, 2], [10, -15.8, 1.8], [-38, 13, 1.6]]) decal(out, [x, y, zt + 0.3], [0, 0, 1], r * 2.2, r, 0.08, rust, 0, 0);
  // the whale's tail stencilled on the roof: two flukes curving out to their tips toward the nose, the stem behind
  const WH = col('#f2f4f2'), Z = zt + 0.34, n0 = out.length;
  for (const s of [-1, 1]) tube(out, smoothProf([[-35.4, 0, Z], [-35.2, s * 3, Z], [-34.2, s * 6.2, Z], [-32.4, s * 8.6, Z]], 3), t => 1.5 - 1.2 * t, WH, MATTE, 0, 8);
  tube(out, [[-35.4, 0, Z], [-38.6, 0, Z]], t => 0.8 + 0.4 * t, WH, MATTE, 0, 8);
  flatten(out, n0, Z, 0.08);
  // the hatch on the container's front (Docky's seat)
  rbox(out, [17, 0, zt + 0.3], [4.4, 7, 0.3], BLK, MATTE, 0.4, 0.5);
  // the cab: boxy, the wind deflector on its roof up to the container, a blue band round it, the glass, the lamps
  const cab = loft(out, 23, 47.8, curve([[23, 18.4], [44, 18.5], [47, 16], [47.8, 13]]), 6.4, curve([[23, 25.6], [44, 25.6], [47.8, 24.6]]), paint, GLOSS, { e: 0.2, cap: [0.8, 2], rings: 14, sides: 32 });
  loft(out, 23.5, 37, curve([[23.5, 15], [30, 16], [37, 13]]), 22, curve([[23.5, 33.6], [28, 33.2], [37, 25.8]]), col(shadeHex(P.paint, -0.06)), GLOSS, { e: 0.35, cap: [0, 3], rings: 10 });
  rbox(out, [38.7, 0, 16], [1.3, 18.75, 9.9], col(P.stripe), GLOSS, 0.2, 0);
  rbox(out, [40.25, 0, 16], [0.3, 18.8, 9.95], col(P.trim), MATTE, 0.2, 0);
  for (let y = -10; y <= 10; y += 5) ball(out, add(cab.top(42.6, y)[0], [0, 0, 0.3]), 0.8, col('#ffb02e'), GLOSS, 0.3, 8, 5);
  rbox(out, [47.65, 0, 19.4], [0.35, 15.8, 4.2], col(GLASS), GLOSS, 0.3, 0.5);
  for (const s of [-1, 1]) {
    lamp(out, [48, s * 14, 10], [1, 0, 0], 1.5);
    tube(out, [[44, s * 18.4, 21], [45, s * 21, 22]], 0.4, BLK, MATTE, 0, 5);
    rbox(out, [45, s * 21.4, 20.6], [0.6, 0.7, 2.4], col('#2a2c31'), GLOSS, 0.4, 0.6);
    tube(out, [[22.4, s * 15.8, 8], [22.4, s * 15.8, 35]], 1.2, CH, GLOSS, 0.6, 10);                                 // exhaust stacks
    tail(out, [-47.4, s * 15, 8.6], [0.45, 2.2, 0.9]);
  }
  rbox(out, [-46.8, 0, 8.6], [0.6, 18, 0.9], BLK, MATTE, 0.3);
  return { body: out, wheel: W, hubs: [[37, -17.6, 5], [37, 17.6, 5]], tails: [[-48, -15, 8.6], [-48, 15, 8.6]] };
}
// moves the vertices from index n0 on along y (a part built round the centre line)
function shiftY(out, n0, y) { for (let i = n0; i < out.length; i += STRIDE) out[i + 1] += y; }
// squashes the vertices from index n0 on flat onto the plane z = z0 (k of their height left: a stencil)
function flatten(out, n0, z0, k) { for (let i = n0; i < out.length; i += STRIDE) { out[i + 2] = z0 + (out[i + 2] - z0) * k; const n = norm([out[i + 3] * k, out[i + 4] * k, out[i + 5]]); out[i + 3] = n[0]; out[i + 4] = n[1]; out[i + 5] = n[2]; } }
const mixHex = (a, b, t) => '#' + col(a).map((v, i) => Math.round((v + (col(b)[i] - v) * t) * 255).toString(16).padStart(2, '0')).join('');

// seatZ: how high the driver sits (design units; the rider goes up the screen by that in drawRider). under: the front
// wheels are under the body, so they go behind it from every side
const CARS = {
  kart: { mesh: kartMesh, seatZ: 5.4 },
  f1: { mesh: f1Mesh, seatZ: 5.2 },
  truck: { mesh: truckMesh, seatZ: 37.6, under: true },
  sports: { mesh: sportsMesh, seatZ: 14 },
  sled: { mesh: sledMesh, seatZ: 8, steer: 0.3 },
  buggy: { mesh: buggyMesh, seatZ: 9.6, under: true },
  hyper: { mesh: hyperMesh, seatZ: 12, under: true },
  ekart: { mesh: ekartMesh, seatZ: 11.5 },
  van: { mesh: vanMesh, seatZ: 33.7, under: true },
};
// every racer's car (two share the kart: Octo's is the modern one in its Git livery, from its paint)
const carOf = ch => ch && CAR_PAINT[ch.id] ? CARS[ch.body] || null : null;

// ---------------------------------------------------------------- sheets
// a car's frame turned to a yaw (the screen angle its nose points), model (x nose, y right, z up) -> ground (x right, y
// down the screen) -> view (x right, y up, z toward you) from e above the road, looking up the screen
function rotCar(yaw, e) {
  const c = Math.cos(yaw), s = Math.sin(yaw), se = Math.sin(e), ce = Math.cos(e);
  return new Float32Array([c, -s * se, s * ce, -s, -c * se, c * ce, 0, ce, se]);
}
// the car's mesh in world units: design units stretched to the BODIES footprint (heights by the mean of the two)
function scaleOf(body) { const B = BODIES[body], D = DESIGN[body]; const sx = B.L / D[0], sy = B.W / D[1]; return [sx, sy, (sx + sy) / 2]; }
function build(ch, P) {
  const C = CARS[ch.body], [sx, sy, sz] = scaleOf(ch.body), M = C.mesh(P), S3 = p => [p[0] * sx, p[1] * sy, p[2] * sz];
  const fix = arr => { const a = new Float32Array(arr); for (let i = 0; i < a.length; i += STRIDE) { a[i] *= sx; a[i + 1] *= sy; a[i + 2] *= sz; const n = norm([a[i + 3] / sx, a[i + 4] / sy, a[i + 5] / sz]); a[i + 3] = n[0]; a[i + 4] = n[1]; a[i + 5] = n[2]; } return a; };
  return { body: fix(M.body), wheel: fix(M.wheel), hubs: M.hubs.map(S3), tails: M.tails.map(S3), patches: (M.patches || []).map(([c, r, k]) => [S3(c), S3(r), k]) };
}
// the cut of a mesh at a yaw in a view, and of each of the N frames
function boxAt(data, V, a) {
  const se = Math.sin(V.e), ce = Math.cos(V.e), pad = OUT + 0.8, c = Math.cos(a), s = Math.sin(a); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < data.length; i += STRIDE) {
    const x = data[i], y = data[i + 1], vx = x * c - y * s, vy = -(x * s + y * c) * se + data[i + 2] * ce;
    if (vx < x0) x0 = vx; if (vx > x1) x1 = vx; if (vy < y0) y0 = vy; if (vy > y1) y1 = vy;
  }
  return [x0 - pad, x1 + pad, y0 - pad, y1 + pad];
}
const boxesOf = (data, V) => Array.from({ length: N }, (_, f) => boxAt(data, V, f * TAU / N));
// a racer's car (ch: { id, body }) in a paint (look: cars.js twinLook or null) for a view: its meshes and their frames'
// cuts, pure maths (the bakery's worker, art/mesh-worker.js, runs it too)
export function carMesh(ch, look, view) {
  const M = build(ch, look ? livery(ch, look) : CAR_PAINT[ch.id]), V = VIEWS[view];
  return { ...M, bodyBoxes: boxesOf(M.body, V), wheelBoxes: boxesOf(M.wheel, V) };
}
// N frames of a mesh in a view (a generator: a row of frames a step)
function* sheetOf(data, boxes, look, V, ppu) {
  const buf = yield* uploadSteps(data);
  try { return yield* bakeSteps(buf, look, N, f => rotCar(f * TAU / N, V.e), f => boxes[f], ppu, V.ky, OUT, 1600); } finally { unload(buf); }
}
// a racer's car sheets (body and front wheel) in a view, a step at a time (generator, run by art/warm.js or at once):
// stored in store at the end (null: no WebGL). ms: time from its first step to its last
const store = new Map();
const keyOf = (ch, look, view) => ch.id + '|' + (look ? look.paint : '') + '|' + view, jobKey = k => 'car|' + k;
const isBuilt = (k, ppu) => { const S = store.get(k); return S === null || (!!S && S.ppu === ppu); };
function* carSteps(ch, look, view, ppu) {
  if (glKick()) yield;
  const t0 = performance.now(), c = { id: ch.id, body: ch.body }, lk0 = look && { paint: look.paint, ring: look.ring };
  const M = yield* offThread('car', [c, lk0, view], () => carMesh(c, lk0, view));   // (WebGL starts while the worker has the maths)
  if (!(yield* glSteps())) { store.set(keyOf(ch, look, view), null); return; }
  const V = VIEWS[view], lk = { ink: INK, patches: M.patches };
  const body = yield* sheetOf(M.body, M.bodyBoxes, lk, V, ppu), wheel = body && (yield* sheetOf(M.wheel, M.wheelBoxes, lk, V, ppu));
  if (body && wheel) { yield; prime(body.sheet, wheel.sheet); }
  store.set(keyOf(ch, look, view), body && wheel ? { body, wheel, hubs: M.hubs, tails: M.tails, ppu, V, ms: performance.now() - t0 } : null);
}
// made now if it isn't, or (wait: a race frame, never stalls) undefined while on the bakery's queue
function carSheets(ch, look, view, wait = false) {
  if (!carOf(ch)) return null;
  const ppu = ppuNow(), k = keyOf(ch, look, view);
  if (!isBuilt(k, ppu)) {
    if (baking(jobKey(k))) { if (wait) return undefined; bakeNow(jobKey(k)); }   // (WebGL isn't started here while it waits: shaders take 50-70 ms)
    if (!isBuilt(k, ppu)) runNow(carSteps(ch, look, view, ppu));
  }
  return store.get(k);
}

export const hasCar3D = ch => !!carOf(ch) && glReady();
// a race's 3D car is made (render.js seats its rider by it: while it waits on the bakery it's the 2D car)
export const car3DMade = (ch, look) => !!carOf(ch) && !!store.get(keyOf(ch, look, 'race')) && store.get(keyOf(ch, look, 'race')).ppu === ppuNow();
// how far up the screen the driver sits on a 3D car (in place of cars.js RIDE_UP)
export function seatUp3D(ch, view = 'race') { const C = carOf(ch), V = VIEWS[view]; return C ? C.seatZ * scaleOf(ch.body)[2] * Math.cos(V.e) * V.ky : 0; }
// a race's cars ahead of time (render.js warmRace3D): [{ ch, look }] (look: cars.js twinLook), on the bakery's queue
// with the plain mascots (pri 0); one made already is skipped
export function warmCars3D(list) {
  if (typeof document === 'undefined') return;
  const ppu = ppuNow();
  for (const { ch, look } of list) { const k = keyOf(ch, look, 'race'); if (carOf(ch) && !isBuilt(k, ppu)) queueBake(jobKey(k), () => carSteps(ch, look, 'race', ppu), 0); }
}
// what's been made (lab.html): sizes and times
export function car3DStats() { return [...store].filter(([, S]) => S).map(([k, S]) => ({ key: k, mb: +((S.body.sheet.width * S.body.sheet.height + S.wheel.sheet.width * S.wheel.sheet.height) * 4 / 1048576).toFixed(1), fill: Math.round(100 * S.body.cells.reduce((a, K) => a + K[2] * K[3], 0) / (S.body.sheet.width * S.body.sheet.height)), size: S.body.sheet.width + '×' + S.body.sheet.height, ms: Math.round(S.ms) })); }
export function car3DSheet(ch, view = 'race') { const S = carSheets(ch, null, view); return S && S.body.sheet; }

// a menu turntable's car (turntable.js warmRacer) on the bakery's queue, so showing a racer never stalls a frame:
// drawn 2D until made
export function warmTable3D(ch) {
  const ppu = ppuNow(), k = keyOf(ch, null, 'table');
  if (carOf(ch) && !isBuilt(k, ppu)) queueBake(jobKey(k), () => carSteps(ch, null, 'table', ppu), 0);
}

// one still of a racer's car for a menu picture (home-art.js), the turntable's view, k px a unit, nose at yaw (the
// screen angle): wheels and body in one canvas (~0.1-0.3 MB), made at pri 0 on the bakery. { cv, x, y, w, h } (its
// rect in units round the footprint's centre) once made, null with no WebGL or 3D car, undefined while queued.
const stills = new Map(), stillWait = new Map();
export function carStill3D(ch, k, yaw, done) {
  if (!carOf(ch) || typeof document === 'undefined') return null;
  const key = ch.id + '|' + k + '|' + yaw.toFixed(3);
  if (stills.has(key)) return stills.get(key);
  if (done) { if (!stillWait.has(key)) stillWait.set(key, []); stillWait.get(key).push(done); }
  queueBake('carstill|' + key, () => carStillSteps(ch, k, yaw, key), 0);
  return undefined;
}
function* carStillSteps(ch, k, yaw, key) {
  try {
    if (glKick()) yield;
    const V = VIEWS.table, c = { id: ch.id, body: ch.body }, C = carOf(ch);
    const M = yield* offThread('car', [c, null, 'table'], () => carMesh(c, null, 'table'));
    if (!(yield* glSteps())) { stills.set(key, null); return; }
    const lk = { ink: INK, patches: M.patches };
    const one = function* (data) { const buf = yield* uploadSteps(data); try { return yield* bakeSteps(buf, lk, 1, () => rotCar(yaw, V.e), () => boxAt(data, V, yaw), k, V.ky, OUT, 4096); } finally { unload(buf); } };
    const body = yield* one(M.body), wheel = body && (yield* one(M.wheel));
    if (!body || !wheel) { stills.set(key, null); return; }
    const co = Math.cos(yaw), si = Math.sin(yaw), se = Math.sin(V.e), ce = Math.cos(V.e);
    const B = body.cells[0], W = wheel.cells[0], hubs = M.hubs.map(h => ({ x: h[0] * co - h[1] * si, y: (h[0] * si + h[1] * co) * se - h[2] * ce, back: C.under || h[0] * si + h[1] * co <= 0 }));
    let x0 = B[4], y0 = B[5], x1 = B[4] + B[6], y1 = B[5] + B[7];
    for (const h of hubs) { x0 = Math.min(x0, h.x + W[4]); y0 = Math.min(y0, h.y + W[5]); x1 = Math.max(x1, h.x + W[4] + W[6]); y1 = Math.max(y1, h.y + W[5] + W[7]); }
    const cv = document.createElement('canvas'); cv.width = Math.ceil((x1 - x0) * k); cv.height = Math.ceil((y1 - y0) * k);
    const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    const blit = (S, K, x, y) => g.drawImage(S.sheet, K[0], K[1], K[2], K[3], x + K[4], y + K[5], K[6], K[7]);
    for (const h of hubs) if (h.back) blit(wheel, W, h.x, h.y);
    blit(body, B, 0, 0);
    for (const h of hubs) if (!h.back) blit(wheel, W, h.x, h.y);
    stills.set(key, { cv, x: x0, y: y0, w: cv.width / k, h: cv.height / k });
  } catch (e) { stills.set(key, null); throw e; }
  finally {
    const cbs = stillWait.get(key); stillWait.delete(key);
    if (cbs) for (const f of cbs) try { f(); } catch (e) { }
  }
}

// drawCar's twin for a 3D one, centred on the footprint, in screen-aligned units (o.rotated: the context is already
// turned to the car, as render.js's is for drawCar: undone here, any squash or stretch kept). o: yaw, steer (front
// wheels, rad), brake, look (twinLook), view ('race'; 'table' for menu turntables). false with no 3D car or WebGL, or
// still queued (draw the 2D one; one never queued, the lab's, is made now). A yaw between frames draws both, each
// turned the rest of the way (`turn`), crossfaded exactly (1 - t)·A + t·B ('lighter' on a scratch canvas), so turns
// are continuous and no outline pops.
export function drawCar3D(ctx, ch, o = {}) {
  const C = carOf(ch); if (!C || typeof document === 'undefined') return false;
  const view = o.view || 'race', S = carSheets(ch, o.look, view, true); if (!S) return false;
  const A = o.yaw || 0, fy = A / TAU * N, f0 = Math.floor(fy), t = fy - f0;
  ctx.save();
  if (o.rotated) ctx.rotate(-A);
  if (t < 0.01 || t > 0.99) carFrame(ctx, S, C, Math.round(fy), A, o.steer);
  else {
    const X = mixOf(S), px = S.ppu, W = X.w;
    for (const [cv, k] of [[X.a, f0], [X.b, f0 + 1]]) { const g = cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, W, W); g.setTransform(px, 0, 0, px, W / 2, W / 2); carFrame(g, S, C, k, A, o.steer); }
    const g = X.a.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = `rgba(0,0,0,${1 - t})`; g.fillRect(0, 0, W, W);   // A × (1 - t)
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = t; g.drawImage(X.b, 0, 0, W, W, 0, 0, W, W);                             // + B × t
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    ctx.drawImage(X.a, 0, 0, W, W, -W / 2 / px, -W / 2 / px, W / px, W / px);
  }
  const k = Math.round(fy), q = k * TAU / N, c = Math.cos(q), s = Math.sin(q), se = Math.sin(S.V.e), ce = Math.cos(S.V.e), ky = S.V.ky;
  const vis = Math.max(0, Math.min(1, (0.35 - Math.sin(A)) / 0.5));   // the back's toward you (the nose up the screen)
  if (o.brake && vis > 0) {
    turn(ctx, S, A - q);
    for (const tl of S.tails) {
      const x = tl[0] * c - tl[1] * s, y = ((tl[0] * s + tl[1] * c) * se - tl[2] * ce) * ky;
      ctx.save(); ctx.globalAlpha *= vis;
      ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.ellipse(x, y, 1.6, 1.3, 0, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = radial(ctx, x, y, 0, x, y, 8, [[0, '#ff3b3088'], [1, '#ff3b3000']]); ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
  return true;
}
// turn by d on the ground: a plain rotation in the race (its ground is as from above); the table's squashed plate turns as
// an ellipse (heights lean with it a touch: under 6°, crossfaded away)
function turn(g, S, d) {
  const q = Math.sin(S.V.e) * S.V.ky, c = Math.cos(d), s = Math.sin(d);
  if (Math.abs(q - 1) < 1e-6) g.rotate(d); else g.transform(c, q * s, -s / q, c, 0, 0);
}
// frame k (any whole number: k mod N) turned the rest of the way to the yaw A: the wheels behind, the body, the wheels in front
function carFrame(ctx, S, C, k, A, steer = 0) {
  const f = ((k % N) + N) % N, q = k * TAU / N, c = Math.cos(q), s = Math.sin(q), se = Math.sin(S.V.e), ce = Math.cos(S.V.e), ky = S.V.ky;
  const at = p => [p[0] * c - p[1] * s, ((p[0] * s + p[1] * c) * se - p[2] * ce) * ky];   // a point on the car, on the screen
  const blit = (B, fr, x, y) => { const K = B.cells[fr]; ctx.drawImage(B.sheet, K[0], K[1], K[2], K[3], x + K[4], y + K[5], K[6], K[7]); };
  const wk = Math.round((q + steer * (C.steer ?? 1)) / TAU * N), wf = ((wk % N) + N) % N;
  const hubs = S.hubs.map(h => ({ p: at(h), back: C.under || h[0] * s + h[1] * c <= 0 }));
  ctx.save(); turn(ctx, S, A - q);
  for (const h of hubs) if (h.back) blit(S.wheel, wf, h.p[0], h.p[1]);
  blit(S.body, f, 0, 0);
  for (const h of hubs) if (!h.back) blit(S.wheel, wf, h.p[0], h.p[1]);
  ctx.restore();
}
// the crossfade's two scratch canvases, shared by every car (they only grow: 2 × 0.3-0.7 MB), and the square w a
// sheet needs on them: any of its frames turned a little, at the sheet's px a unit
const mixW = new WeakMap(), mix = { a: null, b: null };
function mixOf(S) {
  let w = mixW.get(S);
  if (!w) {
    const far = K => Math.max(Math.hypot(K[4], K[5]), Math.hypot(K[4] + K[6], K[5]), Math.hypot(K[4], K[5] + K[7]), Math.hypot(K[4] + K[6], K[5] + K[7]));
    const rB = Math.max(...S.body.cells.map(far)), rW = Math.max(...S.wheel.cells.map(far)), rH = Math.max(0, ...S.hubs.map(h => Math.hypot(h[0], h[1]) + Math.abs(h[2]) * S.V.ky));
    const R = Math.max(rB, rH + rW) * (Math.sin(S.V.e) * S.V.ky < 0.999 ? 1.18 : 1) + 1;
    w = Math.ceil(2 * R * S.ppu); mixW.set(S, w);
  }
  for (const k of ['a', 'b']) { if (!mix[k]) mix[k] = document.createElement('canvas'); const c = mix[k]; if (c.width < w || c.height < w) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, w); } }
  return { a: mix.a, b: mix.b, w };
}
