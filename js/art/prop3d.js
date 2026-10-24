// Kernel Kart art: Fight's 3D props and effects kit (2026-10-24, the user: "the 3d models look so good, but the animations
// and effects just look like simple 2d graphics ... can you rehaul the looks"). The moves' set pieces, their particles
// and their floor marks are low-poly meshes made here in code with art/model3d.js's primitives, toon-shaded and inked
// like the mascots, and baked on the bakery's queue (art/warm.js) into small sprite sheets during the loading screen; a
// fight draws them as 2D sprites (no 3D during a fight). Drawing only, DOM only when called (nothing runs at import, and
// the meshes are pure maths: the bakery's worker, art/mesh-worker.js, builds the built-in ones off the page's thread).
//
// ---- props: drawProp3D(g, id, o)
//   A prop is a mesh baked to a sheet of n frames (headings, or for a tumbling bit turns about a tilted axis). Model space
//   as the mascots': x forward, y left, z up, (0, 0, 0) on the ground at its foot (a bit: its middle). Drawn with its
//   origin at g's (0, 0): translate to (x, y - z) first, world units (the fighters' are SCALE 1.25 a model unit).
//     drawProp3D(g, id, { yaw, frame, state, scale, sy, alpha, clip }) -> true when drawn, false while it's still on the
//       bakery's queue (it's queued then, never made on the spot) or with no WebGL: draw a 2D stand-in or nothing.
//       yaw: the screen angle it faces (a frame per TAU / sym / n); frame: a frame number instead (tumbling bits, a spin);
//       state: one of the prop's states (a puddle's colour); scale: × its baked size (the world size it was built at);
//       sy: × its height only (a column shooting up); alpha; clip 0..1: only the bottom share of it (rising up).
//     propReady(id, state) -> is its sheet made. queueProps(['glacier', 'puddle/ink', ...], pri) puts sheets on the queue.
//   Built in (sizes at scale 1, world units):
//     glacier      a faceted, glossy, snow-capped iceberg: top radius ~48, its snowy plateau 57 up (GLACIER_TOP); 4 headings
//     icecube      a block of glossy ice round a fighter, 44 wide, 62 tall, snow dusted on top, frost at its foot (4, ×90°)
//     icepatch     a floor decal: a slab of faceted ice, radius 60, snow drifting on its rim (6 shapes: frame by its id)
//     puddle       a floor decal: a glossy wet puddle, radius 40; states coffee, water, ink, sludge
//     pot          Duke's enamel coffee pot, ~23 long, 14 tall (16 headings)
//     gcol         a glossy coffee column 100 tall, radius 15 at its foot (draw with sy for its height; frames turn its streaks)
//     froth        the froth crowning it, radius ~14; gsplash the splash round its foot, radius ~24
//     portal       a ring of Java orange, blue and cream lying on the floor, radius 22 (8 frames: its spin)
//     snowpile     a little faceted mound of snow, radius ~11 (4 shapes)
//   Floor decals are baked looking down at 60° and stretched back (DECAL), so a circle on the floor stays a circle the
//   sim's size, like the arena's floor (drawn top-down); standing props are seen from the mascots' 28°.
//   defProp(id, { mesh(state) -> vertices (model3d's format), n, sym, tumble, decal, ink, out, ppu, states }) adds one
//   (a plug-in's js/art/kit-<id>.js: its own props, made on the page's thread; propsFor(fighterId, [ids]) bakes them with
//   that fighter's fights). Surface kinds (model3d.js): MATTE, GLOSS, FACET (flat-shaded), FACET_GLOSS, ICE (faceted, a
//   frosty rim and sheen), WET (a broad sheen), ICE_SMOOTH. Helpers for meshes: facetBall (a jittered low-poly lump, flat
//   facets), facetTri, lathe3, and model3d's ellipsoid, ball, capsule, tube, rbox, decal.
//
// ---- particles: shaded 3D bits thrown with gravity, spin, bounce and fade, each with a little shadow on the floor
//   bit3(v, kind, x, y, z, o) one, bits3(v, kind, x, y, z, n, o) a burst of n (v: the fight's drawer view, v.fx).
//     o: dx, dy, dz (u/s; bits3: speed [a, b] out along dir ± spread/2, up [a, b]), s size (radius, world units; bits3:
//     [a, b]), life (s), g gravity (u/s², 0 floats, < 0 rises), bo bounce (0..1), drag, sp spin (frames/s), fade
//     'alpha' | 'shrink' (melting away, the default for chunks) | 'none', grow (× more size over its life: steam), al alpha,
//     sh false: no floor shadow, hold (s it hangs still in the air, Infinity till release3), zT and rise (hanging bits:
//     up off the floor to zT at t = rise), to: [x, y, z] it flies to over its life (gathering), grp a tag (release3).
//   Kinds: ice, snow, steam, drop (coffee), spark, splinter, sludge, ink, rock, dirt, stone, tshard (a grey crystal),
//   bitO, bitB, bitW, bitG (Java-coloured cubes), paper; defBit(kind, def) adds one. At most MAX3 at once (Reduce effects:
//   half): extra ones are dropped. draw-kits.js runs them: step3 in the particle loop, things3 y-sorted with the
//   fighters, shadows3 on the floor.
//
// ---- floor marks (2D, with depth): cracks2(g, x, y, r, seed, a) cracks with a dark groove and a light lip, scorch2(g, x,
//   y, r, seed, a) a soft charred mark; the baked ones are props (icepatch, puddle).
import { TAU, frnd } from '../core.js';
import * as M3 from './model3d.js';
import { offThread, prime, queueBake } from './warm.js';

const { ellipsoid, ball, capsule, decal, tube, rbox, grid, hex, norm, cross, add, sub, scl, dot, pushV, MATTE, GLOSS, FACET, FACET_GLOSS, ICE, WET, ICE_SMOOTH, ELEV, STRIDE } = M3;
const H = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mixC = (a, b, t) => a.map((x, k) => x + (b[k] - x) * t);
const mulC = (c, f) => c.map(x => clamp(x * f, 0, 1));
const DECAL = 60 * Math.PI / 180;   // how a floor decal is seen (then stretched back to the floor's top-down metric)

// ---------------------------------------------------------------- mesh helpers
// a flat-shaded triangle (its ink line pushed out along e: each corner's smooth normal, about outward); in: a point
// inside the shape, to face it outward
export function facetTri(out, a, b, c, col, kind = FACET, o = 1, inP = null, ea = null, eb = null, ec = null) {
  let n = cross(sub(b, a), sub(c, a)); const l = Math.hypot(n[0], n[1], n[2]); if (l < 1e-6) return;
  n = scl(n, 1 / l);
  if (inP && dot(n, sub(scl(add(add(a, b), c), 1 / 3), inP)) < 0) { n = scl(n, -1); [b, c] = [c, b]; [eb, ec] = [ec, eb]; }
  const E = (p, e) => e || (inP ? norm(sub(p, inP)) : n);
  pushV(out, a, n, col, kind, E(a, ea), o); pushV(out, b, n, col, kind, E(b, eb), o); pushV(out, c, n, col, kind, E(c, ec), o);
}
// a jittered low-poly lump (an ice chunk, a rock, a snow drift): an ellipsoid of nu × nv points (radii r), each pushed in
// or out by up to jit, every face flat; col(n, centroid, i) its colour (rgb 0..1) and kind (FACET when omitted): a colour, or [colour, kind]
export function facetBall(out, c, r, seed, nu, nv, jit, col, kind = FACET, o = 1) {
  const P = [];
  for (let i = 0; i <= nv; i++) {
    const row = [];
    for (let j = 0; j < nu; j++) {
      const th = Math.PI * i / nv, ph = TAU * (j + (i % 2) * 0.5) / nu, s = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
      const q = i === 0 || i === nv ? 1 + jit * (H(seed + i * 3.3) - 0.5) : 1 + jit * (H(seed + i * 31.7 + j * 7.3) - 0.5) * 2;
      row.push([c[0] + r[0] * s[0] * q, c[1] + r[1] * s[1] * q, c[2] + r[2] * s[2] * q]);
    }
    P.push(row);
  }
  let f = 0;
  const face = (a, b, d) => {
    const cen = scl(add(add(a, b), d), 1 / 3); let n = norm(cross(sub(b, a), sub(d, a))); if (dot(n, sub(cen, c)) < 0) n = scl(n, -1);
    const C = typeof col === 'function' ? col(n, cen, f++) : col, cc = Array.isArray(C[0]) ? C[0] : C, kk = Array.isArray(C[0]) ? C[1] : kind;
    facetTri(out, a, b, d, cc, kk, o, c);
  };
  for (let i = 0; i < nv; i++) for (let j = 0; j < nu; j++) {
    const a = P[i][j], b = P[i + 1][j], d = P[i + 1][(j + 1) % nu], e = P[i][(j + 1) % nu];
    if (i < nv - 1) face(a, b, d);
    if (i > 0) face(a, d, e);
  }
}
// a body of revolution round z, smooth: prof [z, radius] from the bottom up
export function lathe3(out, prof, col, kind = GLOSS, nu = 28, o = 1) {
  const n = prof.length - 1;
  grid(out, (i, j) => {
    const ph = TAU * j / nu, [z, r] = prof[i], c = Math.cos(ph), s = Math.sin(ph);
    const p0 = prof[Math.max(0, i - 1)], p1 = prof[Math.min(n, i + 1)], dr = p1[1] - p0[1], dz = p1[0] - p0[0];
    let nr = dz, nz = -dr; const l = Math.hypot(nr, nz) || 1; nr /= l; nz /= l;
    if (i === 0 && r < 0.01) { nr = 0; nz = -1; } if (i === n && r < 0.01) { nr = 0; nz = 1; }
    const nn = [c * nr, s * nr, nz];
    return [[c * r, s * r, z], nn, nn];
  }, nu, n, col, kind, o);
}
// every vertex of a kind 7+ with no hull normal of its own gets its normal (the primitives that don't set one)
function hullN(out) { for (let i = 0; i < out.length; i += STRIDE) if (out[i + 9] > 6.5 && Math.abs(out[i + 10]) + Math.abs(out[i + 11]) + Math.abs(out[i + 12]) < 1e-4) { out[i + 10] = out[i + 3]; out[i + 11] = out[i + 4]; out[i + 12] = out[i + 5]; } return out; }

// ---------------------------------------------------------------- the built-in props
const ICE_LO = hex('#3d8fd0'), ICE_HI = hex('#a2e0fb'), SNOW = hex('#f6faff'), SNOW2 = hex('#e3eef9');
const iceCol = (z, h) => mulC(mixC(ICE_LO, ICE_HI, clamp(z, 0, 1)), 0.92 + 0.16 * h);
export const GLACIER_TOP = 71;
// the iceberg: a faceted lump wide at the top, tapering to a blunt point under it, a snowy domed plateau whose snow runs
// over its rim in drifts, icicles hanging under the snow line
function glacierMesh() {
  const out = [], nu = 11, seed = 3.1, mid = [0, 0, 36];
  const prof = [[0, 3], [8, 18], [20, 34], [34, 44], [47, 48], [56, 46.5], [62, 38], [66, 0]];
  const L = prof.length - 1;
  const R = prof.map(([z, r], i) => i === L ? [[0, 0, z]] : Array.from({ length: nu }, (_, j) => {
    const ph = TAU * (j + (i % 2) * 0.5) / nu + 0.2, q = 1 + 0.15 * (H(seed + i * 13 + j * 5) - 0.5) * 2, dz = i > 0 && i < L - 2 ? (H(seed + i * 7 + j * 11) - 0.5) * 4.5 : 0;
    return [Math.cos(ph) * r * q, Math.sin(ph) * r * q, z + dz];
  }));
  let f = 0;
  const colOf = (n, cen) => {
    const h = H(seed + f++ * 1.7), z = cen[2] / GLACIER_TOP;
    if (n[2] > 0.72 || (cen[2] > 53 && n[2] > 0.2 && h < 0.45)) return [mixC(SNOW, SNOW2, h), FACET];
    return [iceCol(z * z * 0.95, h), ICE];
  };
  const tri = (a, b, c) => { const cen = scl(add(add(a, b), c), 1 / 3); let n = norm(cross(sub(b, a), sub(c, a))); if (dot(n, sub(cen, mid)) < 0) n = scl(n, -1); const [col, k] = colOf(n, cen); facetTri(out, a, b, c, col, k, 1, mid); };
  for (let j = 0; j < nu; j++) tri([0, 0, 0], R[0][j], R[0][(j + 1) % nu]);   // (the blunt point)
  for (let i = 0; i < L; i++) for (let j = 0; j < nu; j++) {
    const a = R[i][j], b = R[i][(j + 1) % nu];
    if (i + 1 === L) { tri(a, b, R[L][0]); continue; }
    const c = R[i + 1][j], d = R[i + 1][(j + 1) % nu];
    if (i % 2) { tri(a, b, c); tri(b, d, c); } else { tri(a, b, d); tri(a, d, c); }
  }
  for (let k = 0; k < 7; k++) {   // icicles under the snow line
    const ph = k * TAU / 7 + 0.55 + H(k + 9) * 0.3, rr = 46.5 + H(k + 4) * 2, c = [Math.cos(ph) * rr, Math.sin(ph) * rr, 54 + H(k) * 2], len = 6 + H(k * 3) * 6, w = 2 + H(k * 5) * 1.2;
    const base = [0, 1, 2, 3, 4].map(m => { const a = m * TAU / 5; return add(c, [Math.cos(a) * w, Math.sin(a) * w, 0]); });
    const tip = add(c, [Math.cos(ph) * 1.2, Math.sin(ph) * 1.2, -len]);
    for (let m = 0; m < 5; m++) facetTri(out, base[m], base[(m + 1) % 5], tip, mulC(hex('#cfefff'), 0.95 + 0.1 * H(k + m)), ICE, 0.7, add(c, [0, 0, -len * 0.3]));
  }
  facetBall(out, [0, 0, 61.5], [46, 46, 9.5], 17.7, 13, 4, 0.07, (nn, c, i) => mixC(SNOW, SNOW2, H(i * 1.3)), FACET);   // (the snow cap: a soft dome over its top, its lip over the rim)
  for (let k = 0; k < 4; k++) { const ph = k * 1.7 + 0.8, rr = 30 + H(k + 2) * 8; facetBall(out, [Math.cos(ph) * rr, Math.sin(ph) * rr, 68 - rr * 0.12], [6 + H(k) * 3, 5.5 + H(k + 1) * 2.5, 2.6], 20 + k, 6, 3, 0.25, () => mixC(SNOW, SNOW2, H(k + 30)), FACET); }   // (snow drifts on top)
  return out;
}
// Tux's ice block: a block of ice with rounded edges round him, two long glints down each face, snow dusted on its top
// and frost lumps round its foot
function iceCubeMesh() {
  const out = [], W = 22, Z = 31, C = hex('#bfe7fb');
  rbox(out, [0, 0, Z], [W, W, Z], C, ICE_SMOOTH, 0.2);
  rbox(out, [0, 0, Z * 2 - 0.2], [W - 3, W - 3, 1.8], SNOW, MATTE, 0.35);
  for (let k = 0; k < 4; k++) {   // the glints: long thin streaks on each face, like light caught in clear ice
    const a = k * Math.PI / 2, nx = [Math.cos(a), Math.sin(a), 0], side = [-Math.sin(a), Math.cos(a), 0];
    for (const [u, z, len, wd] of [[-9, 36, 15, 1.3], [-4.5, 30, 9, 0.8]]) decal(out, add(add(scl(nx, W + 0.15), scl(side, u)), [0, 0, z]), nx, wd, len, 0.3, hex('#ffffff'), 0.45, 0, GLOSS);
  }
  for (let k = 0; k < 10; k++) { const a = k / 10 * TAU + H(k) * 0.4, rr = W + 1 + H(k + 3) * 2; facetBall(out, [Math.cos(a) * rr, Math.sin(a) * rr, 1.5], [4 + H(k) * 2.5, 3.5 + H(k + 1) * 2, 2.6 + H(k + 2)], 40 + k, 5, 3, 0.3, () => mixC(SNOW, SNOW2, H(k + 7)), FACET, 0.6); }
  return out;
}
// a slab of ice on the floor (a decal): faceted on top, catching the light, a darker rim of its side, snow drifting on
// its edge and a couple of chunks lying on it. Its outline and drifts differ by heading (a patch draws a frame by its id)
function icePatchMesh() {
  const out = [], n = 16, seed = 5.3, R = 60, mid = [0, 0, -4];
  const ring = (rr, z, jr, jz, s) => Array.from({ length: n }, (_, j) => { const a = TAU * (j + (s % 2) * 0.5) / n, q = rr * (1 + jr * (H(seed + s * 17 + j * 3.1) - 0.5) * 2 + 0.06 * Math.sin(3 * a + 1.3)); return [Math.cos(a) * q, Math.sin(a) * q, z + jz * (H(seed + s * 5 + j * 7) - 0.5) * 2]; });
  const r0 = ring(R * 1.03, 0, 0.05, 0, 0), r1 = ring(R, 2, 0.05, 0.25, 0), r2 = ring(R * 0.55, 2.8, 0.12, 0.6, 1), top = [0, 0, 3.2];
  let f = 0;
  const T = (a, b, c, side) => { const h = H(seed + f++ * 2.3); facetTri(out, a, b, c, side ? mulC(hex('#6aaedc'), 0.9 + 0.15 * h) : mulC(mixC(hex('#a6dbf7'), hex('#d8f1ff'), h), 1), ICE, 0, mid); };
  for (let j = 0; j < n; j++) {
    const k = (j + 1) % n;
    T(r0[j], r0[k], r1[k], 1); T(r0[j], r1[k], r1[j], 1);
    T(r1[j], r1[k], r2[j], 0); T(r1[k], r2[k], r2[j], 0);
    T(r2[j], r2[k], top, 0);
  }
  for (let k = 0; k < 6; k++) { const a = k * 1.13 + H(k) * 0.5, rr = R * (0.92 + H(k + 1) * 0.08); facetBall(out, [Math.cos(a) * rr, Math.sin(a) * rr, 2], [7 + H(k) * 6, 4 + H(k + 5) * 3, 2.4 + H(k + 2) * 1.5], 60 + k, 6, 3, 0.3, () => mixC(SNOW, SNOW2, H(k + 11)), FACET, 0); }
  for (let k = 0; k < 3; k++) { const a = k * 2.3 + 0.7, rr = R * (0.3 + 0.35 * H(k + 20)); facetBall(out, [Math.cos(a) * rr, Math.sin(a) * rr, 3.4], [3 + H(k) * 2, 2.6 + H(k + 1) * 2, 2.2], 70 + k, 5, 3, 0.35, (nn, c) => nn[2] > 0.6 ? SNOW : iceCol(0.8, H(k + c[0])), ICE, 0); }
  return out;
}
// a glossy puddle on the floor (a decal): domed a hair, an uneven rim
const PUDDLE = { coffee: '#5a2e14', water: '#5fb0e0', ink: '#1c1f2a', sludge: '#5f9e28' };
function puddleMesh(state) {
  const out = [], R = 40, col = hex(PUDDLE[state] || PUDDLE.coffee), nu = 40, nv = 6;
  const rim = a => R * (1 + 0.08 * Math.sin(3 * a + 0.7) + 0.05 * Math.sin(5 * a + 2.1) + 0.03 * Math.sin(8 * a));
  const at = (i, j) => { const a = TAU * j / nu, u = i / nv, r = rim(a) * u, z = 1.6 * Math.sqrt(Math.max(0, 1 - u * u)) + 0.15; return [Math.cos(a) * r, Math.sin(a) * r, z]; };
  grid(out, (i, j) => { const p = at(i, j), a = TAU * j / nu, u = i / nv, sl = u * u * 0.9; const nn = norm([Math.cos(a) * sl, Math.sin(a) * sl, 1]); return [p, nn, nn]; }, nu, nv, col, MATTE, 0);
  decal(out, [-R * 0.34, -R * 0.3, 1.75], [0, 0, 1], R * 0.24, R * 0.08, 0.2, mixC(col, [1, 1, 1], 0.75), -0.5, 0, GLOSS);   // (the sky caught in it)
  decal(out, [-R * 0.08, -R * 0.42, 1.7], [0, 0, 1], R * 0.07, R * 0.04, 0.2, mixC(col, [1, 1, 1], 0.7), -0.4, 0, GLOSS);
  return out;
}
// Duke's coffee pot: a round enamel pot in Java blue, a red lid and knob, a spout and a dark handle
function potMesh() {
  const out = [], B = hex('#4d85b3'), RED = hex('#e8231a'), DK = hex('#2f5470');
  lathe3(out, [[0, 0], [0.4, 4.6], [1.8, 6.9], [4.6, 7.7], [7.6, 7.1], [10, 5.3], [11.2, 4.3]], B, GLOSS, 28);
  ellipsoid(out, [0, 0, 11.3], [[4.7, 0, 0], [0, 4.7, 0], [0, 0, 1.6]], RED, GLOSS, 18, 10);
  ball(out, [0, 0, 13.2], 1.4, RED, GLOSS, 1, 12, 8);
  tube(out, M3.smoothProf([[6, 0, 4.6], [9, 0, 7.4], [10.6, 0, 10.4], [11.6, 0, 11.6]], 3), t => 1.9 - t * 0.9, B, GLOSS, 1, 10);
  tube(out, M3.smoothProf([[-6.4, 0, 9.4], [-9.6, 0, 8.8], [-10.6, 0, 6], [-7.2, 0, 3.4]], 3), 1.15, DK, GLOSS, 1, 8);
  decal(out, [5.2, -5.1, 5.4], [0.71, -0.7, 0.05], 2.6, 1.6, 0.25, hex('#ffffff'), 0.4, 0, GLOSS);   // (a chip of white enamel: a cute mark)
  return out;
}
// the geyser's column: a glossy coffee column 100 tall, a little narrower up it, lighter streaks running up it (4 times
// round: its frames turn them, so it seems to flow), wobbles in its surface
function colMesh() {
  const out = [], nu = 32, nv = 14, D = hex('#6a3618'), M = hex('#8d4f26'), L = hex('#c0824a');
  const r = (z, a) => 15 * (1 - 0.32 * z / 100) + 1.1 * Math.sin(z * 0.21 + a * 4) + 0.6 * Math.sin(z * 0.5 - a * 8);
  grid(out, (i, j) => { const a = TAU * j / nu, z = 100 * i / nv, rr = r(z, a), nn = norm([Math.cos(a), Math.sin(a), 0.12]); return [[Math.cos(a) * rr, Math.sin(a) * rr, z], nn, nn]; }, nu, nv, D, WET, 1);
  // the streaks: recolour by angle (a band in every eight columns lighter, the next darker)
  for (let i = 0; i < out.length; i += STRIDE) { const a = Math.atan2(out[i + 1], out[i]), q = ((a / TAU * 4) % 1 + 1) % 1, c = q < 0.16 ? L : q < 0.5 ? M : D; out[i + 6] = c[0]; out[i + 7] = c[1]; out[i + 8] = c[2]; }
  return out;
}
// the froth at its top: soft cream puffs in a ring, one on top, coffee flicking out from under them
function frothMesh() {
  const out = [], CR = hex('#f6e8d0'), WH = hex('#fffaf0'), C = hex('#80461f');
  for (let k = 0; k < 7; k++) { const a = k / 7 * TAU, r = 9; ball(out, [Math.cos(a) * r, Math.sin(a) * r, 1 + H(k) * 3], 5 + H(k + 2) * 2, k % 2 ? CR : WH, MATTE, 0.8, 14, 9); }
  ball(out, [0, 0, 6], 7, WH, MATTE, 0.8, 16, 10);
  for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + 0.3; ball(out, [Math.cos(a) * 14, Math.sin(a) * 14, 6 + H(k + 4) * 6], 1.8 + H(k) * 0.8, C, WET, 0.8, 10, 7); }
  return out;
}
// the splash round its foot: a low glossy dome of coffee, a crown of drops leaning out, a ring of froth
function splashMesh() {
  const out = [], C = hex('#7a4220'), CR = hex('#f4e4ca');
  lathe3(out, [[0, 22], [1.5, 20], [3.5, 14], [4.8, 6], [5.2, 0]], C, WET, 32, 1);
  for (let k = 0; k < 9; k++) { const a = k / 9 * TAU + H(k) * 0.3, r0 = 16, r1 = 22 + H(k) * 4; capsule(out, [Math.cos(a) * r0, Math.sin(a) * r0, 2], [Math.cos(a) * r1, Math.sin(a) * r1, 7 + H(k + 1) * 6], 2.4, C, WET, 0.8); }
  for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; ball(out, [Math.cos(a) * 14, Math.sin(a) * 14, 4], 3 + H(k + 5), CR, MATTE, 0.6, 10, 7); }
  return out;
}
// Duke's portal: a ring lying on the floor, Java orange, blue and cream bands (4 times round: its frames spin it)
function portalMesh() {
  const out = [], R = 22, r = 3.6, nu = 48, nv = 12, cols = [hex('#f89820'), hex('#5382a1'), hex('#f6efe2')];
  grid(out, (i, j) => { const a = TAU * j / nu, b = TAU * i / nv, c = [Math.cos(a), Math.sin(a), 0], nn = norm(add(scl(c, Math.cos(b)), [0, 0, Math.sin(b)])); return [add(scl(c, R + r * Math.cos(b)), [0, 0, r + r * Math.sin(b)]), nn, nn]; }, nu, nv, cols[0], GLOSS, 1);
  for (let i = 0; i < out.length; i += STRIDE) { const a = Math.atan2(out[i + 1], out[i]), q = Math.floor(((a / TAU * 12) % 12 + 12) % 12) % 3, c = cols[q]; out[i + 6] = c[0]; out[i + 7] = c[1]; out[i + 8] = c[2]; }
  return out;
}

// a little mound of snow, radius ~11 (fork()'s penguins pop out of them): a soft faceted heap, a few lumps round it
function snowPileMesh() {
  const out = [];
  facetBall(out, [0, 0, 0], [11, 10, 7], 31.1, 9, 4, 0.22, (n, c, i) => mixC(SNOW, SNOW2, H(i * 2.1)), FACET, 0.8);
  for (let k = 0; k < 5; k++) { const a = k * 1.3 + 0.4, r = 10 + H(k) * 3; facetBall(out, [Math.cos(a) * r, Math.sin(a) * r, 0.6], [3 + H(k + 1) * 1.6, 2.6 + H(k + 2), 2], 40 + k, 5, 3, 0.3, () => mixC(SNOW, SNOW2, H(k + 9)), FACET, 0.6); }
  return out;
}

// ---------------------------------------------------------------- the built-in bits (particles; built at r0 ~4)
const chunkCol = s => (n, c, i) => n[2] > 0.55 && H(s + i) < 0.5 ? [SNOW, FACET] : [iceCol(0.55 + 0.4 * H(s + i * 3), H(s + i)), ICE];
const lump = (col, kind = FACET, jit = 0.35, r = [4, 3.6, 3.2]) => seed => { const out = []; facetBall(out, [0, 0, 0], r, seed, 6, 4, jit, typeof col === 'function' ? col(seed) : col, kind); return out; };
const puffs = (col, n, o = 0.6) => () => { const out = []; for (let k = 0; k < n; k++) { const a = k / n * TAU, rr = k ? 2.6 : 0; ball(out, [Math.cos(a) * rr, Math.sin(a) * rr, k ? (H(k) - 0.5) * 2 : 1], k ? 2.4 + H(k + 1) : 3.2, col, MATTE, o, 12, 8); } return out; };
const cube = c => () => { const out = []; rbox(out, [0, 0, 0], [1.9, 1.9, 1.9], hex(c), GLOSS, 0.32); return out; };
const BITS = {
  ice: { mesh: () => lump(() => chunkCol(4), ICE)(4.2), ink: '#2a5e8f' },
  snow: { mesh: puffs(SNOW, 5), ink: '#7c9fc6' },
  steam: { mesh: puffs(hex('#ffffff'), 6, 0), ink: '#a8b4c8', r0: 5 },
  drop: { mesh: () => { const out = []; ellipsoid(out, [0, 0, 0], [[2.2, 0, 0], [0, 2.2, 0], [0, 0, 2.7]], hex('#70391a'), WET, 14, 10); return out; }, ink: '#2b1408', out: 0.35, n: 1, r0: 2.5 },
  spark: { mesh: () => { const out = [], Y = hex('#ffd23c'); capsule(out, [-4, 0, 0], [4, 0, 0], 0.9, Y, GLOSS, 0.6); capsule(out, [0, 0, -4], [0, 0, 4], 0.9, Y, GLOSS, 0.6); ball(out, [0, 0, 0], 1.7, hex('#fff6c8'), GLOSS, 0.6); return out; }, ink: '#c2611a' },
  splinter: { mesh: () => { const out = []; rbox(out, [0, 0, 0], [5, 1.3, 1], hex('#c58f56'), MATTE, 0.3); rbox(out, [0.5, 0, 0.6], [3.6, 0.5, 0.6], hex('#a36f3c'), MATTE, 0.4, 0); return out; }, ink: '#4a2c12', r0: 5 },
  sludge: { mesh: () => { const out = [], C = hex('#7cbf3a'); ball(out, [0, 0, 0], 3, C, WET, 1, 14, 10); ball(out, [2.4, 0.8, -0.8], 1.8, C, WET, 1, 10, 7); ball(out, [-1.6, -1.8, 0.6], 1.5, C, WET, 1, 10, 7); return out; }, ink: '#2f5a12' },
  ink: { mesh: () => { const out = [], C = hex('#272b38'); ball(out, [0, 0, 0], 3, C, WET, 1, 14, 10); ball(out, [2.2, -1, -0.6], 1.6, C, WET, 1, 10, 7); return out; }, ink: '#05060a' },
  rock: { mesh: () => lump(() => (n, c, i) => mulC(hex('#9c9182'), 0.9 + 0.2 * H(i)))(7.7), ink: '#3a332b' },
  dirt: { mesh: () => lump(() => (n, c, i) => mulC(hex('#7c5432'), 0.88 + 0.24 * H(i)), FACET, 0.45)(8.1), ink: '#2e1c0c' },
  stone: { mesh: () => lump(() => (n, c, i) => mulC(hex('#bcc0ca'), 0.9 + 0.2 * H(i)))(9.3), ink: '#4c5060' },
  tshard: { mesh: () => { const out = [], c = [0, 0, 0], T = [0, 0, 5.2], B = [0, 0, -4.4], q = [0, 1, 2, 3].map(k => [Math.cos(k * TAU / 4 + 0.3) * (1.9 + k % 2 * 0.5), Math.sin(k * TAU / 4 + 0.3) * (1.9 + k % 2 * 0.5), 0.4]); for (let k = 0; k < 4; k++) { const C = mulC(hex('#d6dae6'), 0.88 + 0.18 * H(k)); facetTri(out, q[k], q[(k + 1) % 4], T, C, ICE, 1, c); facetTri(out, q[(k + 1) % 4], q[k], B, C, ICE, 1, c); } return out; }, ink: '#555b70', r0: 4.5 },
  bitO: { mesh: cube('#f89820'), ink: '#7a3e00', r0: 2.4 },
  bitB: { mesh: cube('#5382a1'), ink: '#183048', r0: 2.4 },
  bitW: { mesh: cube('#f4f3ee'), ink: '#6a6a70', r0: 2.4 },
  bitG: { mesh: cube('#3fd68b'), ink: '#0e5a34', r0: 2.4 },
  paper: { mesh: () => lump(() => (n, c, i) => mulC(hex('#f3f0e6'), 0.9 + 0.12 * H(i)), FACET, 0.5, [3, 3, 2.8])(11.1), ink: '#77736a', r0: 3 },
};

// ---------------------------------------------------------------- the registry
// a prop: { mesh(state), n frames, sym (its frames cover TAU / sym), tumble (frames turn about a tilted axis), decal (seen
// from DECAL, stretched back to the floor), ink, out (its ink line, model units), ppu (× the screen's), states, r0 (a
// bit's size at scale 1) }
const PROPS = {
  glacier: { mesh: glacierMesh, n: 4, ink: '#1d4b74' },
  icecube: { mesh: iceCubeMesh, n: 4, sym: 4, ink: '#2f6c9c' },
  icepatch: { mesh: icePatchMesh, n: 6, decal: true, ink: '#2f6c9c' },
  puddle: { mesh: puddleMesh, n: 1, decal: true, ink: '#2b1408', states: Object.keys(PUDDLE) },
  pot: { mesh: potMesh, n: 16, ink: '#132a40' },
  gcol: { mesh: colMesh, n: 6, sym: 4, ink: '#3a1a08' },
  froth: { mesh: frothMesh, n: 6, ink: '#6e4a2a' },
  gsplash: { mesh: splashMesh, n: 4, sym: 1, ink: '#3a1a08' },
  portal: { mesh: portalMesh, n: 8, sym: 4, ink: '#3a2412' },
  snowpile: { mesh: snowPileMesh, n: 4, ink: '#6f93bd' },
};
for (const k in BITS) PROPS['bit:' + k] = { n: 12, tumble: true, r0: 4, out: 0.5, ...BITS[k] };
const BUILTIN = new Set(Object.keys(PROPS));
export const defProp = (id, def) => { PROPS[id] = { n: 1, ...def }; };
export const defBit = (kind, def) => { PROPS['bit:' + kind] = { n: 12, tumble: true, r0: 4, out: 0.5, ...def }; };
export const hasProp = id => !!PROPS[id];
// the mesh (pure maths: the worker runs it for a built-in one), as a Float32Array
export function propMesh(id, state = '') {
  const P = PROPS[id]; if (!P) throw new Error('no prop ' + id);
  return { data: new Float32Array(hullN(P.mesh(state))) };
}
// which props each fighter's fights bake (draw-moves.js: Tux's, Duke's; a plug-in: propsFor in its art file)
const FIGHT = {};
export const propsFor = (fid, ids) => { FIGHT[fid] = [...new Set([...(FIGHT[fid] || []), ...ids])]; };

// ---------------------------------------------------------------- baking
// pixels a world unit: about what a fight's camera shows at this screen's size and pixel ratio (a little over, for its
// zoom in when they're close)
function ppuNow() {
  if (typeof window === 'undefined') return 2;
  const dpr = Math.min(3, window.devicePixelRatio || 1), w = window.innerWidth || 800, h = window.innerHeight || 600;
  return clamp(Math.min(w / 560, (h - 140) / 460) * dpr * 1.25, 1.2, 4.6);
}
const sheets = new Map();
const keyOf = (id, st) => id + '|' + (st || '');
// a frame's turn: model -> view (column-major mat3)
function mul3(A, B) { const R = new Float32Array(9); for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) R[c * 3 + r] = A[r] * B[c * 3] + A[3 + r] * B[c * 3 + 1] + A[6 + r] * B[c * 3 + 2]; return R; }
const AX = norm([0.62, 0.38, 0.69]);
function axisRot(a) { const [x, y, z] = AX, c = Math.cos(a), s = Math.sin(a), t = 1 - c; return new Float32Array([t * x * x + c, t * x * y + s * z, t * x * z - s * y, t * x * y - s * z, t * y * y + c, t * y * z + s * x, t * x * z + s * y, t * y * z - s * x, t * z * z + c]); }
const rotFor = (P, f) => P.tumble ? mul3(M3.rotOf(0.5), axisRot(f * TAU / P.n)) : M3.rotOf(f * TAU / (P.sym || 1) / P.n, P.decal ? DECAL : ELEV);
function* propSteps(id, st, ppu) {
  const k = keyOf(id, st), P = PROPS[id];
  try {
    if (M3.glKick()) yield;
    const m = BUILTIN.has(id) ? yield* offThread('prop', [id, st], () => propMesh(id, st)) : propMesh(id, st);
    const G = yield* M3.glSteps(); if (!G) { sheets.set(k, null); return; }
    const U = yield* M3.uploadSteps(m.data), d = m.data, pad = (P.out ?? M3.OUTLINE) + 1.2, sc = P.ppu || 1;
    const box = f => {   // the frame's cut: where its vertices go (view units)
      const R = rotFor(P, f); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let i = 0; i < d.length; i += STRIDE) { const x = d[i] * R[0] + d[i + 1] * R[3] + d[i + 2] * R[6], y = d[i] * R[1] + d[i + 1] * R[4] + d[i + 2] * R[7]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return [x0 - pad, x1 + pad, y0 - pad, y1 + pad];
    };
    yield;
    const ky = P.decal ? 1 / Math.sin(DECAL) : 1, pp = ppu * sc;
    const S = yield* M3.bakeSteps(U, { ink: P.ink || '#1a2433', mood: '' }, P.n, f => rotFor(P, f), box, pp, ky, P.out ?? M3.outFor(pp), 1800);
    M3.unload(U);
    if (S) { yield; prime(S.sheet); }
    sheets.set(k, S && { ...S, ppu });
  } catch (e) { sheets.set(k, null); throw e; }
}
const isBuilt = (k, ppu) => { const S = sheets.get(k); return S === null || (!!S && S.ppu === ppu); };
// on the bakery's queue ('id' or 'id/state'; pri 1 by default: after the fighters' own)
export function queueProps(list, pri = 1) {
  if (typeof document === 'undefined') return;
  const ppu = ppuNow();
  for (const it of list) {
    const [id, st = ''] = it.split('/'); if (!PROPS[id]) continue;
    const k = keyOf(id, st); if (!isBuilt(k, ppu)) queueBake('prop|' + k + '|' + ppu.toFixed(2), () => propSteps(id, st, ppu), pri);
  }
}
export const propReady = (id, st = '') => { const S = sheets.get(keyOf(id, st)); return !!S; };
// a fight's: every bit, and the props of the fighters in it (art/model3d.js queueFight3D calls this)
M3.onFightWarm(ids => queueProps([...Object.keys(BITS).map(b => 'bit:' + b), ...[...new Set(ids)].flatMap(id => FIGHT[id] || [])], 1));

// ---------------------------------------------------------------- drawing
export function drawProp3D(g, id, o = {}) {
  const P = PROPS[id]; if (!P || typeof document === 'undefined') return false;
  const st = o.state || '', k = keyOf(id, st), S = sheets.get(k), ppu = ppuNow();
  if (!S || S.ppu !== ppu) { if (S !== null && !isBuilt(k, ppu)) queueProps([st ? id + '/' + st : id], 0); if (!S) return false; }
  const n = S.n, f = o.frame != null ? ((Math.floor(o.frame) % n) + n) % n : P.tumble ? 0 : ((Math.round((o.yaw || 0) / (TAU / (P.sym || 1)) * n) % n) + n) % n;
  const C = S.cells[f], s = (o.scale ?? 1), sy = s * (o.sy ?? 1), q = o.clip == null ? 1 : clamp(o.clip, 0, 1);
  if (q <= 0.001 || s <= 0) return true;
  const a0 = g.globalAlpha; if (o.alpha != null) g.globalAlpha = a0 * clamp(o.alpha, 0, 1);
  if (q >= 1) g.drawImage(S.sheet, C[0], C[1], C[2], C[3], C[4] * s, C[5] * sy, C[6] * s, C[7] * sy);
  else { const cut = 1 - q; g.drawImage(S.sheet, C[0], C[1] + C[3] * cut, C[2], C[3] * q, C[4] * s, (C[5] + C[7] * cut) * sy, C[6] * s, C[7] * q * sy); }
  g.globalAlpha = a0;
  return true;
}
// a floor decal at (x, y): r its radius (world units), a its alpha, frame its shape (an id)
export function decal3(g, id, x, y, r, o = {}) {
  const P = PROPS[id]; if (!P) return false;
  const base = id === 'icepatch' ? 60 : id === 'puddle' ? 40 : (P.r0 || 40);
  g.save(); g.translate(x, y); const ok = drawProp3D(g, id, { ...o, scale: r / base }); g.restore();
  return ok;
}

// ---------------------------------------------------------------- particles
export const MAX3 = 64;
const count3 = v => { let n = 0; for (const p of v.fx) if (p.k === 'p3') n++; return n; };
export function bit3(v, kind, x, y, z = 0, o = {}) {
  if (!v || !v.fx || !PROPS['bit:' + kind]) return null;
  if (count3(v) >= (o.few ? MAX3 / 2 : MAX3)) return null;   // (counted each time: a fast-forward draws no frames)
  const p = { k: 'p3', b: kind, x, y, z, dx: o.dx || 0, dy: o.dy || 0, dz: o.dz || 0, t: 0, life: o.life ?? 0.8, s: o.s ?? 4, a: o.a ?? frnd(0, 1) * 12, sp: o.sp ?? (frnd(0, 1) - 0.5) * 40,
    g: o.g ?? 620, bo: o.bo ?? 0.3, drag: o.drag || 0, fade: o.fade || (kind === 'steam' || kind === 'snow' ? 'alpha' : 'shrink'), grow: o.grow || 0, al: o.al ?? 1, sh: o.sh !== false };
  if (o.hold != null) { p.hold = o.hold; p.zT = o.zT ?? z; p.rise = o.rise ?? 0; p.z0 = z; }
  if (o.to) { p.from = [x, y, z]; p.to = o.to; }
  if (o.grp) p.grp = o.grp;
  v.fx.push(p);
  return p;
}
// a burst of n: thrown out round dir (spread its full width; TAU all round) at speed [a, b], up [a, b] u/s
export function bits3(v, kind, x, y, z, n, o = {}) {
  const sp = o.speed || [40, 120], up = o.up || [80, 200], s = o.s || [3, 5], life = o.life || [0.6, 1], dir = o.dir || 0, spread = o.spread ?? TAU, out = [];
  for (let k = 0; k < n; k++) {
    const a = dir + (spread >= TAU - 0.01 ? k / n * TAU + (frnd(0, 1) - 0.5) * 0.6 : (n > 1 ? k / (n - 1) - 0.5 : 0) * spread + (frnd(0, 1) - 0.5) * 0.3), u = sp[0] + frnd(0, 1) * (sp[1] - sp[0]), r = o.r ? o.r * frnd(0, 1) : 0;
    const p = bit3(v, kind, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, z, { ...o, dx: Math.cos(a) * u, dy: Math.sin(a) * u * 0.8, dz: up[0] + frnd(0, 1) * (up[1] - up[0]), s: s[0] + frnd(0, 1) * (s[1] - s[0]), life: life[0] + frnd(0, 1) * (life[1] - life[0]) });
    if (p) out.push(p);
  }
  return out;
}
// hanging bits (hold) let go: they fall from where they hang (grp: only those)
export function release3(v, grp, push = 0) {
  for (const p of v.fx) if (p.k === 'p3' && p.hold > p.t && (!grp || p.grp === grp)) {
    p.hold = p.t; p.dz = 20 + frnd(0, 1) * 40; const a = frnd(0, 1) * TAU; p.dx = Math.cos(a) * push * frnd(0, 1); p.dy = Math.sin(a) * push * frnd(0, 1) * 0.8; p.life = p.t + 0.7 + frnd(0, 1) * 0.4; p.sp = (frnd(0, 1) - 0.5) * 30;
  }
}
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const shown = p => !(p.hold > p.t && p.t < p.rise);
// one step (the particle loop: draw-kits.js kitFx)
export function step3(p, dt) {
  if (p.to) return;
  if (p.hold > p.t) { if (p.t >= p.rise) p.z = p.z0 + (p.zT - p.z0) * ease((p.t - p.rise) / 0.16); p.a += p.sp * dt * 0.04; return; }
  p.dz -= p.g * dt; p.x += p.dx * dt; p.y += p.dy * dt; p.z += p.dz * dt;
  if (p.drag) { const d = Math.max(0, 1 - p.drag * dt); p.dx *= d; p.dy *= d; if (p.g <= 0) p.dz *= d; }
  if (p.g > 0 && p.z <= 0) {
    p.z = 0;
    if (p.dz < -70 && p.bo > 0) { p.dz = -p.dz * p.bo; p.dx *= 0.6; p.dy *= 0.6; p.sp *= 0.6; }
    else { p.dz = 0; p.rest = 1; const f = Math.max(0, 1 - 9 * dt); p.dx *= f; p.dy *= f; }
  }
  if (!p.rest) p.a += p.sp * dt;
}
function look3(p) {
  const k = clamp(p.t / p.life, 0, 1), left = p.life - p.t;
  let s = p.s * (1 + p.grow * k), a = p.al;
  if (p.fade === 'alpha') a *= clamp(left / Math.min(0.35, p.life * 0.6), 0, 1) * (p.grow ? clamp(p.t / 0.08, 0, 1) : 1);
  else if (p.fade !== 'none') s *= clamp(left / 0.3, 0, 1);
  if (p.to) a *= clamp(k * 4, 0, 1);
  return [s, a, k];
}
function pos3(p, k) { if (!p.to) return [p.x, p.y, p.z]; const e = ease(k); return [p.from[0] + (p.to[0] - p.from[0]) * e, p.from[1] + (p.to[1] - p.from[1]) * e, p.from[2] + (p.to[2] - p.from[2]) * e]; }
// the bits as things among the fighters (y-sorted): out.push({ y, d })
export function things3(v, g, out = []) {
  for (const p of v.fx) {
    if (p.k !== 'p3') continue;
    if (!shown(p)) continue;
    out.push({ y: p.y, d: () => {
      const [s, a, k] = look3(p); if (s < 0.2 || a < 0.01) return;
      const [x, y, z] = pos3(p, k), P = PROPS['bit:' + p.b];
      g.save(); g.translate(x, y - z);
      drawProp3D(g, 'bit:' + p.b, { frame: p.a, scale: s / (P.r0 || 4), alpha: a });
      g.restore();
    } });
  }
  return out;
}
// their little shadows on the floor (before the fighters)
export function shadows3(g, v) {
  for (const p of v.fx) {
    if (p.k !== 'p3' || !p.sh || !shown(p)) continue;
    const [s, a, k] = look3(p), [x, y, z] = pos3(p, k), q = 1 / (1 + Math.max(0, z) / 45), al = 0.2 * a * q;
    if (al < 0.01 || s < 0.3) continue;
    g.fillStyle = `rgba(20,24,44,${al.toFixed(3)})`; g.beginPath(); g.ellipse(x + 1, y + 0.6, s * 0.95 * (0.5 + 0.5 * q), s * 0.42 * (0.5 + 0.5 * q), 0, 0, TAU); g.fill();
  }
}

// ---------------------------------------------------------------- floor marks with depth (2D)
// cracks running out from near (x, y): each a dark groove with a light lip on its lower side (lit from the top left)
export function cracks2(g, x, y, r, seed = 1, a = 1, n = 5) {
  if (a <= 0.01) return;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  const paths = [];
  for (let k = 0; k < n; k++) {
    const an = k / n * TAU + H(seed + k) * 0.9, pts = [[x + Math.cos(an) * r * 0.15, y + Math.sin(an) * r * 0.15]];
    let b = an, d = r * 0.15;
    for (let m = 1; m <= 3; m++) { b += (H(seed + k * 7 + m) - 0.5) * 0.8; d += r * (0.22 + 0.12 * H(seed + k + m * 3)); pts.push([x + Math.cos(b) * d, y + Math.sin(b) * d]); }
    paths.push(pts);
  }
  const draw = (dx, dy, c, w) => { g.strokeStyle = c; g.lineWidth = w; for (const P of paths) { g.beginPath(); P.forEach(([px, py], i) => i ? g.lineTo(px + dx, py + dy) : g.moveTo(px + dx, py + dy)); g.stroke(); } };
  draw(0.7, 1, `rgba(255,255,255,${(0.45 * a).toFixed(3)})`, 1.4);
  draw(0, 0, `rgba(30,36,56,${(0.42 * a).toFixed(3)})`, 1.8);
  g.restore();
}
// a soft charred mark: dark in the middle, a sooty uneven edge, a few flecks of ash
export function scorch2(g, x, y, r, seed = 1, a = 1) {
  if (a <= 0.01) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(30,24,22,${(0.55 * a).toFixed(3)})`); gr.addColorStop(0.6, `rgba(46,38,34,${(0.32 * a).toFixed(3)})`); gr.addColorStop(1, 'rgba(46,38,34,0)');
  g.fillStyle = gr; g.beginPath(); for (let i = 0; i <= 24; i++) { const an = i / 24 * TAU, d = r * (0.9 + 0.12 * Math.sin(3 * an + seed) + 0.06 * Math.sin(7 * an + seed * 2)); g.lineTo(x + Math.cos(an) * d, y + Math.sin(an) * d); } g.closePath(); g.fill();
  for (let k = 0; k < 7; k++) { const an = H(seed + k) * TAU, d = r * 0.7 * Math.sqrt(H(seed + k * 3)); g.fillStyle = `rgba(235,228,218,${(0.35 * a).toFixed(3)})`; g.beginPath(); g.arc(x + Math.cos(an) * d, y + Math.sin(an) * d, 0.8 + H(k) * 1.2, 0, TAU); g.fill(); }
}
