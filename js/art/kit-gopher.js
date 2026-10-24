// Kernel Kart: drawing Gopher's Fight moves (2026-10-24; the sim is js/kits/gopher.js, the hooks js/art/kits.js).
// Earthy and soft, Classic Flat first: every tell is part of the floor (no outlines, no arrows, no player colours there).
// Real 3D since 2026-10-24 (art/prop3d.js's kit, the user: every move "a small 3D set piece that looks as good as the
// fighter models"): the mound, the cracked ground, the stake, the wave of earth and the holes are low-poly meshes baked
// with the fight (propsFor below), the clods, rocks and dust 3D bits; the old 2D drawing stays as the stand-in while a
// sheet is still baking (or with no WebGL).
//   Goroutine Rush  four little gophers (his own model, small) pop out of his feet and scurry out to their lanes, then
//                   race down them kicking up dust; ahead of each a faint furrow of loose earth (3D clods lying in it)
//                   shows its lane
//   Dig & Pop       he dives in head first (a spray of earth, a hole) and a real hump of earth tunnels along, clods
//                   tumbling off its front, a furrow of loose earth behind it; when it stops the ground round it
//                   cracks into slabs that heave up (the reach), pebbles jumping on them, then he bursts up out of a
//                   crater in an uppercut in a shower of dirt and rock
//   defer Slam      a wooden stake with a Go-blue band in a heap of earth, jiggling on each tick (dust puffs, quicker
//                   near the end) while a soft ring of shadow spreads round it to its full reach, pebbles trembling on
//                   its edge; then it bursts in splinters and a wave of earth heaves out to the edge, rocks flying
//   Burrow          a dive into the ground, the mound running along, a pop up out of a crater
// Shakes: only the pop that floors someone and the stake going off, softly.
import { PCOL, TAU, clamp, frnd } from '../core.js';
import { CHARACTERS } from '../core.js';
import { bold } from '../look.js';
import * as M3 from './model3d.js';
import { SCALE, model, shadow } from '../draw-fight.js';
import { animBase, settleAnim } from './kits.js';
import { bit3, bits3, cracks2, decal3, defProp, drawProp3D, facetTri, propReady, propsFor } from './prop3d.js';
import { EARTH as EARTH3, EARTH_D, DRY, H, STONE, earthCol, lumpHalf, mixC, mulC } from './kit3-earth.js';

const ID = 'gopher';
const charOf = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const hsh = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const hexA = (h, a) => { const n = parseInt(String(h).slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${clamp(a, 0, 1).toFixed(3)})`; };
const EARTH = '122,82,48', DARK = '70,44,24', LIGHT = '236,214,176';
const GO_BLUE = '#00add8';
const { hex, rbox, decal, ball, MATTE, GLOSS, FACET } = M3;
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }

// ---------------------------------------------------------------- the 3D props (world units; x forward, z up)
// the hump of earth he pushes along underground: a low faceted mound, heaped higher at its front where it's pushing,
// clods and a couple of stones on it
function moundMesh() {
  const out = [];
  lumpHalf(out, [-1, 0, -1.5], [17, 12.5, 11.5], 3.3, 11, 6, 0.22, earthCol(3, 0.04), 1);
  lumpHalf(out, [9.5, 0, -1.5], [8.5, 10, 9.5], 5.1, 8, 5, 0.3, earthCol(9, 0.06), 1);
  for (let k = 0; k < 8; k++) {
    const x = -12 + k * 3.4 + (H(k + 2) - 0.5) * 2, y = (H(k + 5) - 0.5) * 13, q = 1 - (x / 17) ** 2 - (y / 12.5) ** 2, z = Math.max(1, 11.5 * Math.sqrt(Math.max(0, q)) - 2.2), r = 1.6 + H(k + 9) * 1.5;
    lumpHalf(out, [x, y, z], [r, r * 0.9, r * 0.8], 30 + k, 5, 3, 0.35, earthCol(30 + k, k % 4 ? 0.1 : 0.9), 0.8, 0);
  }
  return out;
}
// a crater he dived into or burst out of: a shallow dark pit (the far wall lit), a ring of thrown-up earth round it,
// a few clods lying out round that (a decal)
function holeMesh() {
  const out = [];
  M3.grid(out, (i, j) => { const a = TAU * j / 24, prof = [[-4.5, 0], [-4, 3], [-2.6, 7], [-0.8, 10], [0.4, 12]][i], r = prof[1], nn = M3.norm([-Math.cos(a) * 0.7, -Math.sin(a) * 0.7, 1]); return [[Math.cos(a) * r, Math.sin(a) * r, prof[0]], nn, nn]; }, 24, 4, hex('#4a2d16'), MATTE, 0);
  for (let k = 0; k < 11; k++) { const a = k / 11 * TAU + H(k) * 0.4, rr = 12.5 + H(k + 3) * 2.5; lumpHalf(out, [Math.cos(a) * rr, Math.sin(a) * rr, -0.5], [3.6 + H(k) * 1.6, 3 + H(k + 1), 2.6 + H(k + 2) * 1.2], 50 + k, 6, 3, 0.3, earthCol(50 + k, 0.08), 0.5); }
  for (let k = 0; k < 6; k++) { const a = k * 1.13 + 0.4, rr = 17.5 + H(k + 7) * 4, r = 1.1 + H(k + 4) * 1.2; lumpHalf(out, [Math.cos(a) * rr, Math.sin(a) * rr, 0], [r, r, r * 0.8], 70 + k, 5, 3, 0.35, earthCol(70 + k, 0.3), 0.4); }
  return out;
}
// the ground cracking round the mound (a decal, R 40): slabs of earth split apart, heaving up in the middle; states 0
// (hairline cracks, barely lifted), 1 (split, rising), 2 (heaved up, gaps wide, pebbles on top)
function crackMesh(st) {
  const s = +st || 0, hh = [1.3, 3.6, 6.6][s], gap = [0.45, 1.2, 2.2][s], R = 40, out = [];
  const N = 8, ang = Array.from({ length: N }, (_, j) => j / N * TAU + (H(j + 1) - 0.5) * 0.6);
  const rIn = j => 9 + H(j + 11) * 5, rMid = j => 21 + H(j + 21) * 9, rOut = j => R * (0.88 + 0.16 * H(j + 41));
  const zOf = r => hh * Math.pow(Math.max(0, 1 - r / R), 1.15);
  // under the gaps: dark earth
  for (let j = 0; j < 20; j++) { const a0 = j / 20 * TAU, a1 = (j + 1) / 20 * TAU, r = R * 0.86; M3Tri(out, [0, 0, -0.3], [Math.cos(a0) * r, Math.sin(a0) * r, -0.3], [Math.cos(a1) * r, Math.sin(a1) * r, -0.3], hex('#22130a'), [0, 0, -5], 0); }
  const slab = (poly, seed, tilt) => {
    let cx = 0, cy = 0; for (const p of poly) { cx += p[0]; cy += p[1]; } cx /= poly.length; cy /= poly.length;
    const P = poly.map(([x, y]) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1, k = Math.max(0, l - gap) / l; const X = cx + dx * k, Y = cy + dy * k; return [X, Y, zOf(Math.hypot(X, Y)) + tilt * (H(seed + X) - 0.5)]; });
    const C = [cx, cy, zOf(Math.hypot(cx, cy)) + hh * 0.06], top = mulC(mixC(EARTH3, DRY, 0.25 + H(seed) * 0.6), 0.92 + 0.14 * H(seed + 1)), side = mulC(EARTH_D, 0.85 + 0.15 * H(seed + 2));
    const mid = [cx, cy, -2];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      M3Tri(out, a, b, C, mulC(top, 0.96 + 0.08 * H(seed + i)), mid, 0.3);
      const a0 = [a[0], a[1], -0.3], b0 = [b[0], b[1], -0.3];
      if (a[2] > 0.15 || b[2] > 0.15) { M3Tri(out, a, a0, b0, side, mid, 0.3); M3Tri(out, a, b0, b, side, mid, 0.3); }
    }
  };
  // the middle slab, an inner ring of slabs and an outer one
  slab(ang.map((a, j) => [Math.cos(a) * rIn(j), Math.sin(a) * rIn(j)]), 3, hh * 0.15);
  for (let j = 0; j < N; j++) {
    const a0 = ang[j], a1 = ang[(j + 1) % N] + (j === N - 1 ? TAU : 0), am = (a0 + a1) / 2;
    const ri0 = rIn(j), ri1 = rIn((j + 1) % N), rm0 = rMid(j), rm1 = rMid((j + 1) % N), rmm = (rm0 + rm1) / 2 + (H(j + 31) - 0.5) * 3;
    slab([[Math.cos(a0) * ri0, Math.sin(a0) * ri0], [Math.cos(a0) * rm0, Math.sin(a0) * rm0], [Math.cos(am) * rmm, Math.sin(am) * rmm], [Math.cos(a1) * rm1, Math.sin(a1) * rm1], [Math.cos(a1) * ri1, Math.sin(a1) * ri1]], 40 + j, hh * 0.3);
    slab([[Math.cos(a0) * rm0, Math.sin(a0) * rm0], [Math.cos(a0) * rOut(j), Math.sin(a0) * rOut(j)], [Math.cos(am) * R * (0.9 + 0.14 * H(j + 51)), Math.sin(am) * R * (0.9 + 0.14 * H(j + 51))], [Math.cos(a1) * rOut((j + 1) % N), Math.sin(a1) * rOut((j + 1) % N)], [Math.cos(a1) * rm1, Math.sin(a1) * rm1], [Math.cos(am) * rmm, Math.sin(am) * rmm]], 60 + j, hh * 0.15);
  }
  if (s > 0) for (let k = 0; k < 4 + s * 3; k++) { const a = H(k + 80) * TAU, r = 6 + H(k + 90) * 28, z = zOf(r) + 0.6, q = 1 + H(k + 100) * 1.1; lumpHalf(out, [Math.cos(a) * r, Math.sin(a) * r, z], [q, q * 0.9, q * 0.8], 110 + k, 5, 3, 0.35, earthCol(110 + k, 0.5), 0.4, z - q); }
  return out;
}
const M3Tri = (out, a, b, c, col, inP, o) => facetTri(out, a, b, c, col, FACET, o, inP);
// the deferred stake: a square wooden post (rounded edges, darker grain down it), its top hammered out into a lighter
// mushroom with its rings, a glossy Go-blue band; driven into a heap of earth with clods round it
function stakeMesh() {
  const out = [], W = hex('#c08a50'), WD = hex('#8e5d30'), TOP = hex('#e6c38a');
  rbox(out, [0, 0, 11.5], [2.7, 2.7, 11.5], W, MATTE, 0.3);
  for (const [a, u, z, l] of [[0, -1, 9, 6], [0, 1.2, 15, 4], [Math.PI / 2, 0.5, 7, 5], [Math.PI, -0.4, 12, 6], [-Math.PI / 2, 0.9, 10, 5]]) {
    const n = [Math.cos(a), Math.sin(a), 0], sd = [-Math.sin(a), Math.cos(a), 0];
    decal(out, [n[0] * 2.72 + sd[0] * u, n[1] * 2.72 + sd[1] * u, z], n, 0.35, l, 0.12, WD, Math.PI / 2, 0, MATTE);
  }
  rbox(out, [0, 0, 17.2], [2.98, 2.98, 1.7], hex(GO_BLUE), GLOSS, 0.3);
  rbox(out, [0, 0, 23.4], [3.5, 3.5, 1.2], TOP, MATTE, 0.45);
  decal(out, [0, 0, 24.6], [0, 0, 1], 2.1, 2.1, 0.05, hex('#c99a5c'), 0, 0, MATTE);
  decal(out, [0, 0, 24.65], [0, 0, 1], 1.0, 1.0, 0.05, hex('#b4844a'), 0, 0, MATTE);
  lumpHalf(out, [0, 0, -1.2], [10, 9, 4.8], 7.7, 10, 4, 0.28, earthCol(7, 0.06), 1);
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.4, rr = 9.5 + H(k + 2) * 3, r = 1.3 + H(k) * 1.2; lumpHalf(out, [Math.cos(a) * rr, Math.sin(a) * rr, 0], [r, r * 0.9, r * 0.8], 20 + k, 5, 3, 0.35, earthCol(20 + k, 0.3), 0.6); }
  return out;
}
// a lump of earth heaving up in the wave: a faceted clod, a stone in it now and then
function lumpMesh() {
  const out = [];
  lumpHalf(out, [0, 0, -1], [7.5, 6.5, 8], 2.9, 7, 4, 0.32, earthCol(2, 0.14), 1);
  lumpHalf(out, [3.5, -2.5, 3], [2.4, 2.2, 2], 9.1, 5, 3, 0.3, (n, c, i) => [mulC(STONE, 0.9 + 0.2 * H(i)), FACET], 0.8, 0);
  return out;
}
defProp('gomound', { mesh: moundMesh, n: 16, ink: '#3a2412' });
defProp('gohole', { mesh: holeMesh, n: 4, decal: true, ink: '#3a2412', out: 0.5, r0: 18 });
defProp('gocrack', { mesh: crackMesh, n: 1, decal: true, ink: '#3a2412', out: 0.4, r0: 40, states: ['0', '1', '2'] });
defProp('gostake', { mesh: stakeMesh, n: 8, ink: '#3a2412' });
defProp('golump', { mesh: lumpMesh, n: 6, ink: '#3a2412' });
propsFor(ID, ['gomound', 'gohole', 'gocrack/0', 'gocrack/1', 'gocrack/2', 'gostake', 'golump', 'crumbs/earth', 'bit:dust']);

// ---------------------------------------------------------------- the 2D stand-ins (while a sheet bakes, or no WebGL)
// a little clod lying on the floor: a pale top over a soft dark shade
function crumb(g, x, y, r, a) {
  g.fillStyle = `rgba(${DARK},${(0.45 * a).toFixed(3)})`; circle(g, x + 0.6, y + 0.7, r); g.fill();
  g.fillStyle = `rgba(${EARTH},${(0.85 * a).toFixed(3)})`; circle(g, x, y, r); g.fill();
  g.fillStyle = `rgba(${LIGHT},${(0.55 * a).toFixed(3)})`; circle(g, x - r * 0.3, y - r * 0.35, r * 0.45); g.fill();
}
function cracks2D(g, o, u, fade) {
  const R = o.R, gr = g.createRadialGradient(o.x, o.y, 0, o.x, o.y, R * 1.05);
  gr.addColorStop(0, `rgba(${DARK},${(0.26 * (0.4 + 0.6 * u) * fade).toFixed(3)})`); gr.addColorStop(0.8, `rgba(${DARK},${(0.17 * (0.4 + 0.6 * u) * fade).toFixed(3)})`); gr.addColorStop(1, `rgba(${DARK},0)`);
  g.fillStyle = gr; g.beginPath(); g.ellipse(o.x, o.y, R * 1.05, R * 0.98, 0, 0, TAU); g.fill();
  cracks2(g, o.x, o.y, R, o.id * 3.1, fade * (0.3 + 0.7 * u), 7);
}
function stake2D(g, o, jig, drop) {
  g.fillStyle = bold() ? '#8a5a34' : `rgb(${EARTH})`; g.beginPath(); g.ellipse(o.x, o.y + 1, 9, 4, 0, 0, TAU); g.fill();
  g.save(); g.translate(o.x, o.y - drop); g.rotate(jig * 0.12 * (o.id % 2 ? 1 : -1));
  const Hh = 22, w = 4.2;
  g.fillStyle = '#a5753f'; g.beginPath(); g.moveTo(-w, -Hh); g.lineTo(w, -Hh); g.lineTo(w * 0.7, -2); g.lineTo(0, 2); g.lineTo(-w * 0.7, -2); g.closePath(); g.fill();
  g.fillStyle = GO_BLUE; g.fillRect(-w - 0.3, -Hh + 5, w * 2 + 0.6, 4);
  g.fillStyle = '#e6c590'; g.beginPath(); g.ellipse(0, -Hh, w, 1.6, 0, 0, TAU); g.fill();
  g.restore();
}
function mound2D(g, bob) {
  g.fillStyle = 'rgba(20,16,42,0.22)'; g.beginPath(); g.ellipse(2, 2, 17, 7, 0, 0, TAU); g.fill();
  const mg = g.createRadialGradient(-5, -9 + bob, 1, 0, -3, 18);
  mg.addColorStop(0, '#c09062'); mg.addColorStop(0.55, '#8c6038'); mg.addColorStop(1, '#5e3e22');
  g.fillStyle = mg; g.beginPath(); g.moveTo(-17, 2); g.bezierCurveTo(-14, -9 + bob, -5, -13 + bob, 2, -12 + bob); g.bezierCurveTo(10, -11 + bob, 16, -5, 17, 2); g.quadraticCurveTo(0, 6, -17, 2); g.fill();
  for (let k = 0; k < 6; k++) { const x = -11 + k * 4.4 + Math.sin(k * 2.1) * 2, y = -4 - Math.sin((k + 0.5) / 6 * Math.PI) * 7 + bob, r = 1.6 + hsh(k) * 1.4; crumb(g, x, y, r, 1); }
}
function hole2D(g, x, y, s, a) {
  g.fillStyle = `rgba(110,74,42,${(0.6 * a).toFixed(3)})`; g.beginPath(); g.ellipse(x, y, s * 1.3, s * 0.6, 0, 0, TAU); g.fill();
  g.fillStyle = `rgba(40,24,12,${(0.7 * a).toFixed(3)})`; g.beginPath(); g.ellipse(x, y + 0.5, s * 0.75, s * 0.33, 0, 0, TAU); g.fill();
}

// ---------------------------------------------------------------- particles (3D bits: art/prop3d.js)
// soft dust rolling out round the floor and rising a little (no shadow: it's a cloud)
function dust(v, x, y, n, r = 12, few) {
  bits3(v, 'dust', x, y, 3, few ? Math.ceil(n / 2) : n, { speed: [25, 70], up: [10, 30], g: 0, drag: 2.5, s: [3.5, 6], grow: 1, life: [0.5, 0.85], fade: 'alpha', al: 0.85, sh: false, r });
}
// earth thrown up: clods, a few rocks, dust rolling out low (p: how hard)
function spray(v, x, y, p, few, up = 1) {
  const q = few ? 0.5 : 1;
  bits3(v, 'dirt', x, y, 3, Math.round(9 * q * p), { speed: [50 * p, 150 * p], up: [170 * up, 300 * up], s: [1.8, 3.4], life: [0.7, 1.1], bo: 0.25, r: 8 });
  bits3(v, 'rock', x, y, 3, Math.round(4 * q * p), { speed: [40 * p, 120 * p], up: [150 * up, 260 * up], s: [1.6, 2.8], life: [0.8, 1.2], bo: 0.35, r: 6 });
  dust(v, x, y, Math.round(5 * q * Math.min(1.4, p)), 16 * p);
}
// a crater left on the floor (drawn under the fighters: behind(), by whoever's drawn first)
function addHole(v, x, y, s, life) { (v.goHoles || (v.goHoles = [])).push({ x, y, s, t0: v.t, life, f: Math.floor(frnd(0, 4)) }); }
function holes(g, v) {
  const L = v.goHoles; if (!L || !L.length) return;
  for (let i = L.length - 1; i >= 0; i--) {
    const h = L[i], k = (v.t - h.t0) / h.life; if (k >= 1 || k < -0.01) { L.splice(i, 1); continue; }
    const a = clamp((1 - k) / 0.35, 0, 1), s = h.s * (k > 0.65 ? 1 - 0.3 * (k - 0.65) / 0.35 : 1);
    if (!decal3(g, 'gohole', h.x, h.y, s, { frame: h.f, alpha: a })) hole2D(g, h.x, h.y, s * 0.8, a);
  }
}

// ---------------------------------------------------------------- the floor
// a goroutine's lane: a faint furrow of loose earth from where it is to the lane's end, clods lying down it
function lane(g, F, o) {
  const mv = F.f[o.owner].stats.moves.move1, run = o.ph === 'run';
  const x0 = run ? o.x : o.sx, y0 = run ? o.y : o.sy, left = mv.len - (o.ran || 0); if (left < 8) return;
  const a = run ? 1 : ease(o.t / 0.25), c = Math.cos(o.a), s = Math.sin(o.a), L = Math.min(left, run ? left : left * ease(o.t / 0.35));
  const gr = g.createLinearGradient(x0, y0, x0 + c * L, y0 + s * L);
  gr.addColorStop(0, `rgba(${DARK},${(0.14 * a).toFixed(3)})`); gr.addColorStop(0.6, `rgba(${DARK},${(0.07 * a).toFixed(3)})`); gr.addColorStop(1, `rgba(${DARK},0)`);
  g.save(); g.lineCap = 'round'; g.strokeStyle = gr; g.lineWidth = 11; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + c * L, y0 + s * L); g.stroke();
  const ran = o.ran || 0, D3 = propReady('crumbs', 'earth');
  for (let d = 16 - (ran % 32); d < L; d += 32) {   // (loose earth, uneven, thinning out down the lane)
    if (d < 0) continue;
    const n = Math.round((d + ran) / 32), h = hsh(o.id * 7 + n), k = 1 - d / mv.len, j = (h - 0.5) * 6, jj = (hsh(n * 3 + o.id) - 0.5) * 10, al = a * (0.3 + 0.65 * k);
    const x = x0 + c * (d + jj) - s * j, y = y0 + s * (d + jj) + c * j;
    if (!D3 || !decal3(g, 'crumbs', x, y, 6.5 + h * 3, { state: 'earth', yaw: o.a + (h - 0.5) * 0.7, alpha: al })) crumb(g, x, y, 1.3 + h * 1.1, al);
  }
  g.restore();
}
// the cracks round the mound: the ground splitting into slabs that heave up over the reach, pebbles jumping on them
function cracks(g, F, v, o, t) {
  const mv = F.f[o.owner].stats.moves.move2, u = clamp(o.t / mv.crack, 0, 1), fade = clamp((o.life - o.t) / 0.3, 0, 1);
  const w = u * 2, s0 = Math.min(1, Math.floor(w)), fr = w - s0, al = fade * (0.35 + 0.65 * ease(u / 0.25)), jx = Math.sin(t * 47) * 0.7 * u, r = o.R * (0.97 + 0.03 * u);
  if (!propReady('gocrack', String(s0)) || !propReady('gocrack', String(s0 + 1))) { decal3(g, 'gocrack', o.x, o.y, o.R, { state: String(s0 + 1), alpha: 0 }); cracks2D(g, o, u, fade); return; }
  decal3(g, 'gocrack', o.x + jx, o.y, r, { state: String(s0), alpha: al });
  if (fr > 0.02) decal3(g, 'gocrack', o.x + jx, o.y, r, { state: String(s0 + 1), alpha: al * ease(fr) });
  if (fade > 0.5 && frnd(0, 1) < 0.18 + 0.3 * u) { const an = frnd(0, TAU), q = Math.sqrt(frnd(0, 1)) * o.R * 0.85; bit3(v, 'rock', o.x + Math.cos(an) * q, o.y + Math.sin(an) * q, 2 + 4 * u, { dz: frnd(40, 80) * (0.6 + u), s: frnd(1.1, 1.9), life: 0.4, bo: 0.4, few: true }); }
}
// the stake's ring while it ticks: a soft ring of shadow spreading to the reach (its full reach a very faint tint),
// pebbles trembling on its edge; once it's gone off, disturbed earth and cracks where it stood
function stakeRing(g, F, o) {
  const mv = F.f[o.owner].stats.moves.move3, R = o.R;
  if (o.ph === 'tick') {
    const u = clamp(o.t / mv.delay, 0, 1), r = R * ease(u), a = clamp(o.t / 0.2, 0, 1);
    g.fillStyle = `rgba(${DARK},${(0.06 * a).toFixed(3)})`; g.beginPath(); g.ellipse(o.x, o.y, R, R * 0.95, 0, 0, TAU); g.fill();
    if (r > 4) {
      const gr = g.createRadialGradient(o.x, o.y, Math.max(0, r - 16), o.x, o.y, r + 3);
      gr.addColorStop(0, `rgba(${DARK},0)`); gr.addColorStop(0.7, `rgba(${DARK},${(0.22 + 0.16 * u).toFixed(3)})`); gr.addColorStop(1, `rgba(${DARK},0)`);
      g.fillStyle = gr; g.beginPath(); g.ellipse(o.x, o.y, r + 3, (r + 3) * 0.95, 0, 0, TAU); g.fill();
      const period = 0.32 - 0.2 * u, ph = (o.t % period) / period, hop = ph < 0.3 ? Math.sin(ph / 0.3 * Math.PI) * 2.2 * (0.5 + u) : 0;
      for (let k = 0; k < 12; k++) {   // (pebbles riding the edge as it spreads, hopping on each tick)
        const an = k / 12 * TAU + o.id, x = o.x + Math.cos(an) * r, y = o.y + Math.sin(an) * r * 0.95;
        g.save(); g.translate(x, y - hop * hsh(k + o.id));
        const ok = drawProp3D(g, 'bit:dirt', { frame: k * 5 + o.id, scale: (2.2 + hsh(k) * 1.2) / 4, alpha: 0.6 + 0.4 * u });
        g.restore();
        if (!ok) crumb(g, x, y, 1.6, 0.35 + 0.4 * u);
      }
    }
  } else {
    const k = clamp((o.t - mv.delay) / 0.4, 0, 1), r = R * (0.25 + 0.8 * ease(k)), a = 1 - k * 0.6;
    const gr = g.createRadialGradient(o.x, o.y, r * 0.3, o.x, o.y, r);
    gr.addColorStop(0, `rgba(${DARK},${(0.12 * a).toFixed(3)})`); gr.addColorStop(0.8, `rgba(${DARK},${(0.2 * a).toFixed(3)})`); gr.addColorStop(1, `rgba(${DARK},0)`);
    g.fillStyle = gr; g.beginPath(); g.ellipse(o.x, o.y, r, r * 0.95, 0, 0, TAU); g.fill();
    const al = clamp((o.life - o.t) / 0.25, 0, 1) * ease(k / 0.3);   // (the ground broken where the stake stood)
    if (!decal3(g, 'gocrack', o.x, o.y, R * 0.45, { state: '1', alpha: al })) cracks2(g, o.x, o.y, Math.min(r, R * 0.55), o.id * 5.3, al, 6);
  }
}

// ---------------------------------------------------------------- among the fighters
// a goroutine: tiny Gopher popping out and scurrying to its lane, then racing down it, kicking up dust; a faint tint of
// his colour under it
function goroutine(g, F, v, o) {
  const own = F.f[o.owner], ch = charOf(own ? own.id : ID), t = v.t + (o.id || 0) * 0.37, col = PCOL[o.owner] || PCOL[0];
  let s = 1, hop = Math.abs(Math.sin(t * 18)) * 1.8, yaw = o.a;
  if (o.ph === 'spread') { const u = clamp(o.t / 0.16, 0, 1); s = 0.45 + 0.55 * ease(u); hop += Math.sin(u * Math.PI) * 7; const dx = o.sx - o.x, dy = o.sy - o.y; if (Math.hypot(dx, dy) > 3) yaw = Math.atan2(dy, dx); }
  shadow(g, o.x, o.y, hop, 7 * s);
  g.save(); g.beginPath(); g.ellipse(o.x, o.y + 1, 10 * s, 5 * s, 0, 0, TAU); g.fillStyle = hexA(col, 0.14); g.fill(); g.restore();
  g.save(); g.translate(o.x, o.y - hop);
  model(g, ch, { t, scale: SCALE * 0.36 * s, smooth: true, yaw: yaw + 0.35 * Math.sin(Math.PI / 2 - yaw), lean: Math.sin(t * 18) * 0.1, mood: null, pose: M3.walkPose ? M3.walkPose(t * 3.6) : 'stand', shadow: false, fight: true });
  g.restore();
  if (o.ph === 'spread') { const S = v.goSeen || (v.goSeen = new Set()); if (!S.has(o.id)) { if (S.size > 200) S.clear(); S.add(o.id); dust(v, o.x, o.y, 2, 4, true); } }   // (popping out at his feet)
  if (o.ph === 'run') {   // dust puffing up behind its feet, now and then a clod flicked back
    const c = Math.cos(o.a), sn = Math.sin(o.a);
    if (frnd(0, 1) < 0.16) bit3(v, 'dust', o.x - c * 7, o.y - sn * 4, 2, { dx: -c * 25 + frnd(-12, 12), dy: -sn * 14 + frnd(-8, 8), dz: frnd(8, 22), g: 0, drag: 2, s: frnd(2.2, 3.4), grow: 0.9, life: 0.45, fade: 'alpha', al: 0.8, sh: false, few: true });
    if (frnd(0, 1) < 0.07) bit3(v, 'dirt', o.x - c * 6, o.y - sn * 3, 2, { dx: -c * frnd(30, 60), dy: -sn * frnd(20, 40), dz: frnd(60, 110), s: frnd(1, 1.6), life: 0.45, few: true });
  }
}
// the deferred stake: the wooden post in its heap of earth, dropping in, jiggling about its foot on each tick (a puff
// of dust)
function stake(g, F, v, o) {
  const mv = F.f[o.owner].stats.moves.move3;
  const u = clamp(o.t / mv.delay, 0, 1), period = 0.32 - 0.2 * u, ph = (o.t % period) / period, jig = ph < 0.25 ? Math.sin(ph / 0.25 * Math.PI) : 0;
  const drop = o.t < 0.1 ? (1 - o.t / 0.1) * 16 : 0, side = o.id % 2 ? 1 : -1;
  if (!propReady('gostake')) { drawProp3D(g, 'gostake', { alpha: 0 }); stake2D(g, o, jig, drop); }
  else {
    g.fillStyle = 'rgba(20,16,42,0.2)'; g.beginPath(); g.ellipse(o.x + 2, o.y + 1.5, 15, 6, 0, 0, TAU); g.fill();
    g.save(); g.translate(o.x, o.y - drop); g.rotate(jig * 0.06 * side); g.scale(1 - jig * 0.03, 1 + jig * 0.04);
    drawProp3D(g, 'gostake', { yaw: 0.6 + side * 0.25, scale: 1.3 });
    g.restore();
  }
  if (jig > 0.9 && frnd(0, 1) < 0.5) { dust(v, o.x, o.y, 2, 6, true); if (frnd(0, 1) < 0.5) bit3(v, 'dirt', o.x + frnd(-6, 6), o.y + frnd(-3, 3), 2, { dz: frnd(50, 90), dx: frnd(-30, 30), dy: frnd(-15, 15), s: frnd(1, 1.5), life: 0.4, few: true }); }
}
// the wave of earth as the stake goes off: a ring of clods heaving up as its front rolls out to the reach, the ground
// behind it settling (each a thing of its own, so the fighters stand among them)
function wave(F, v, g, o, out) {
  const mv = F.f[o.owner].stats.moves.move3, R = o.R, k = clamp((o.t - mv.delay) / 0.42, 0, 1); if (k >= 1) return;
  if (!propReady('golump')) { drawProp3D(g, 'golump', { alpha: 0 }); return; }
  const r = R * (0.14 + 0.92 * ease(k)), fade = clamp((1 - k) / 0.3, 0, 1);
  const ring = (n, rr, hh, sz, seed) => {
    for (let j = 0; j < n; j++) {
      const an = j / n * TAU + hsh(seed + j) * 0.3 + o.id, q = rr * (0.93 + 0.12 * hsh(seed + j * 3)), x = o.x + Math.cos(an) * q, y = o.y + Math.sin(an) * q * 0.95;
      const sy = Math.max(0.06, hh * (0.75 + 0.5 * hsh(seed + j * 7))), sc = sz * (0.75 + 0.5 * hsh(seed + j * 5));
      out.push({ y, d: () => { g.save(); g.translate(x, y); drawProp3D(g, 'golump', { yaw: an + j, scale: sc, sy, alpha: fade }); g.restore(); } });
    }
  };
  const rise = Math.sin(Math.min(1, k * 3) * Math.PI / 2);
  ring(22, r, rise * (1 - k * 0.75), 0.55 + 0.6 * r / R, 3);
  if (k > 0.2) ring(13, r * 0.62, 0.45 * (1 - k), 0.5 + 0.35 * r / R, 9);
}

// a hump of fresh earth (Gopher underground): loose earth left behind it, trembling when it stops over the cracks
function mound(g, f, v) {
  const t = v.t, sp = Math.hypot(f.vx || 0, f.vy || 0), c = Math.cos(f.face), s = Math.sin(f.face), still = f.ph === 'rumble';
  const T = v.goFur || (v.goFur = [[], []]), L = T[f.i] || (T[f.i] = []);
  const last = L[L.length - 1]; if (!last || Math.hypot(last[0] - f.x, last[1] - f.y) > 14) { L.push([f.x, f.y, v.t, f.face, frnd(0, 1)]); if (L.length > 16) L.shift(); }
  const D3 = propReady('gomound') && propReady('crumbs', 'earth');
  for (const [x, y, at, a, h] of L) {
    const k = clamp((v.t - at) / 1.3, 0, 1); if (k >= 1) continue;
    if (!D3 || !decal3(g, 'crumbs', x, y, 7.5 + h * 2, { state: 'earth', yaw: a + (h - 0.5) * 0.5, alpha: 0.8 * (1 - k * k) })) { g.fillStyle = `rgba(${DARK},${(0.28 * (1 - k)).toFixed(3)})`; g.beginPath(); g.ellipse(x, y, 9 * (1 - k * 0.3), 4.5 * (1 - k * 0.3), a, 0, TAU); g.fill(); }
  }
  const bob = still ? Math.sin(t * 60) * 1.3 : Math.sin(t * 22) * 1.1, jx = still ? Math.sin(t * 47) * 1.2 : 0;
  g.save(); g.translate(f.x + jx, f.y);
  if (D3) {
    g.fillStyle = 'rgba(20,16,42,0.2)'; g.beginPath(); g.ellipse(2, 2, 19, 8, 0, 0, TAU); g.fill();
    drawProp3D(g, 'gomound', { yaw: f.face, sy: 1 + bob * 0.04, scale: 1 + (still ? 0.03 * Math.sin(t * 31) : 0) });
  } else { drawProp3D(g, 'gomound', { alpha: 0 }); mound2D(g, bob); }
  g.restore();
  if (sp > 60 && frnd(0, 1) < 0.35) bit3(v, 'dirt', f.x + c * 14, f.y + s * 7, 6, { dx: c * frnd(20, 60) + frnd(-35, 35), dy: s * frnd(10, 30) + frnd(-18, 18), dz: frnd(70, 140), s: frnd(1.3, 2.3), life: 0.55, few: true });
  if (sp > 60 && frnd(0, 1) < 0.12) bit3(v, 'dust', f.x - c * 12, f.y - s * 6, 2, { dx: frnd(-15, 15), dy: frnd(-8, 8), dz: frnd(8, 20), g: 0, drag: 2, s: frnd(3, 4.5), grow: 0.8, life: 0.5, fade: 'alpha', al: 0.7, sh: false, few: true });
  if (still && frnd(0, 1) < 0.25) bit3(v, 'dirt', f.x + frnd(-10, 10), f.y + frnd(-5, 5), 8, { dz: frnd(40, 80), dx: frnd(-25, 25), dy: frnd(-12, 12), s: frnd(1, 1.6), life: 0.4, few: true });
}

export default {
  id: ID,
  anim(F, v, f) {
    const A = animBase(), k = f.pht || 0, t = v.t + f.i, sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
    switch (f.ph) {
      case 'whistle': sq(-0.04 + 0.04 * Math.sin(k * 26)); A.hop = Math.abs(Math.sin(k * 13)) * 2; A.mood = 'happy'; break;   // calling them out, bouncing
      case 'send': sq(-0.07 * Math.exp(-k * 10)); A.fwd = 4 * ease(k / 0.08); break;
      case 'dive': { const u = clamp(k / Math.max(0.05, f.dur || 0.22), 0, 1); if (u < 0.45) sq(0.12 * ease(u / 0.45)); else { sq(-0.16); A.hop = -14 * ease((u - 0.45) / 0.55); A.alpha = 1 - ease((u - 0.45) / 0.55); A.fwd = 6 * u; } break; }   // a crouch, then head first into the floor
      case 'tunnel': case 'rumble': case 'burrow': A.alpha = 0; break;   // (underground: the mound, behind())
      case 'uppercut': { const u = clamp(k / 0.32, 0, 1); A.s = 0.75 + 0.25 * ease(k / 0.08); A.hop = 15 * Math.sin(u * Math.PI); sq(-0.12 * (1 - u)); break; }   // bursting up out of the hole
      case 'dazed': { const S = settleAnim(k, f.dur || 0.8, 'dazed'); S.fwd = 0; return S; }   // (a miss: he lands his weight back by his hole and catches his breath: a settle, not a stun)
      case 'popup': { const u = clamp(k / 0.22, 0, 1); A.s = 0.7 + 0.3 * ease(u * 1.5); A.hop = 9 * Math.sin(u * Math.PI); break; }
      case 'hammer': sq(-0.06 * ease(k / 0.15)); if (f.state === 'wind') A.wx = Math.sin(k * 40) * 0.5; break;
      case 'slam': sq(0.13 * Math.exp(-k * 11)); A.fwd = 3 * ease(k / 0.06); break;
      default: return null;
    }
    return A;
  },
  ground(g, F, v, o) {
    if (o.kind === 'gorun') lane(g, F, o);
    else if (o.kind === 'gocrack') cracks(g, F, v, o, v.t);
    else if (o.kind === 'gostake') stakeRing(g, F, o);
  },
  things(F, v, g, o, out) {
    if (o.kind === 'gorun') out.push({ y: o.y, d: () => goroutine(g, F, v, o) });
    else if (o.kind === 'gostake') { if (o.ph === 'tick') out.push({ y: o.y, d: () => stake(g, F, v, o) }); else wave(F, v, g, o, out); }
  },
  behind(g, F, v, f) {
    const other = F.f[1 - f.i];
    if (!other || f.y < other.y || (f.y === other.y && f.i === 0)) holes(g, v);   // (the craters on the floor: before whoever's drawn first)
    if (f.id !== ID) return null;
    if (f.under) { mound(g, f, v); return 'hide'; }
    if ((f.ph === 'dazed' || (f.ph === 'uppercut' && f.pht < 0.4)) && !propReady('gohole')) hole2D(g, f.x, f.y + 1, 15, 0.9);   // (the stand-in: the 3D crater is one of v.goHoles)
    return null;
  },
  event(v, F, e, few) {
    switch (e.kind) {
      case 'gorush':   // off they go: a little puff of dust at the start of each lane
        for (const o of F.objs || []) if (o.kind === 'gorun' && o.owner === e.who) dust(v, o.sx, o.sy, 2, 5, few);
        return true;
      case 'gonip':   // a nip (a little spray of earth), or one ducking back into the ground at its lane's end
        bits3(v, 'dirt', e.x, e.y, 3, few ? 2 : 4, { speed: [30, 80], up: [90, 160], s: [1.2, 2], life: [0.4, 0.6] }); dust(v, e.x, e.y, e.hit ? 3 : 2, 5, few);
        if (e.hit == null) addHole(v, e.x, e.y, 6, 0.55);
        return true;
      case 'godig': spray(v, e.x, e.y, 0.8, few, 0.8); addHole(v, e.x, e.y, 15, 0.9); return true;
      case 'gocrack': bits3(v, 'dirt', e.x, e.y, 4, few ? 2 : 4, { speed: [20, 50], up: [80, 140], s: [1.2, 2], life: [0.4, 0.6] }); return true;
      case 'gopop':   // bursting up: a shower of dirt and rock, a crater
        spray(v, e.x, e.y, 1.25, few, 1.15);
        bits3(v, 'rock', e.x, e.y, 6, few ? 2 : 4, { speed: [60, 140], up: [200, 320], s: [1.4, 2.2], life: [0.8, 1.1], bo: 0.4, r: 6 });
        addHole(v, e.x, e.y, 19, e.hit ? 1.0 : 1.5);
        if (e.hit) v.shake = Math.max(v.shake, 0.22);
        return true;
      case 'godaze': return true;
      case 'gostake': dust(v, e.x, e.y, 3, 7, few); bits3(v, 'dirt', e.x, e.y, 2, 2, { speed: [30, 60], up: [80, 130], s: [1.2, 1.8], life: [0.4, 0.6] }); return true;
      case 'goboom': {   // the stake bursts in splinters, rocks and clods thrown out ahead of the wave, dust rolling out
        const q = few ? 0.5 : 1, R = (F.f[e.who] && F.f[e.who].stats.moves.move3.R) || 92;
        bits3(v, 'splinter', e.x, e.y, 14, Math.round(6 * q), { speed: [60, 150], up: [180, 300], s: [3, 4.6], life: [0.8, 1.1], bo: 0.3, sp: 24 });
        bits3(v, 'dirt', e.x, e.y, 3, Math.round(12 * q), { speed: [R * 1.4, R * 2.3], up: [140, 240], s: [1.8, 3.2], life: [0.6, 0.9], bo: 0.25, r: R * 0.3 });
        bits3(v, 'rock', e.x, e.y, 3, Math.round(6 * q), { speed: [R * 1.2, R * 2], up: [160, 260], s: [1.8, 3], life: [0.7, 1], bo: 0.35, r: R * 0.25 });
        dust(v, e.x, e.y, Math.round(8 * q), R * 0.5);
        addHole(v, e.x, e.y, 13, 1.1);
        v.shake = Math.max(v.shake, 0.26);
        return true;
      }
      case 'goburrow': spray(v, e.x, e.y, 0.7, few, 0.8); addHole(v, e.x, e.y, 13, 0.8); return true;
      case 'goout': spray(v, e.x, e.y, 0.8, few); addHole(v, e.x, e.y, 14, 0.9); return true;
    }
    return false;
  },
  icon(g, kind, r, col) {
    const W = col || '#ffffff';
    g.fillStyle = W; g.strokeStyle = W; g.lineCap = 'round'; g.lineJoin = 'round';
    switch (kind) {
      case 'goRush':   // four little round heads racing up their lanes
        g.lineWidth = r * 0.1;
        for (let k = 0; k < 4; k++) { const x = (k - 1.5) * r * 0.48, y = k % 2 ? -r * 0.2 : r * 0.05; g.globalAlpha *= 0.55; g.beginPath(); g.moveTo(x, y + r * 0.25); g.lineTo(x, r * 0.85); g.stroke(); g.globalAlpha /= 0.55; circle(g, x, y, r * 0.19); g.fill(); }
        return true;
      case 'goDig':   // a mound with a paw punching up out of it
        g.beginPath(); g.moveTo(-r * 0.85, r * 0.6); g.quadraticCurveTo(0, -r * 0.05, r * 0.85, r * 0.6); g.closePath(); g.fill();
        g.lineWidth = r * 0.26; g.beginPath(); g.moveTo(0, r * 0.2); g.lineTo(0, -r * 0.45); g.stroke(); circle(g, 0, -r * 0.6, r * 0.22); g.fill();
        return true;
      case 'goDefer':   // a stake in the middle of a ring
        g.lineWidth = r * 0.12; g.globalAlpha *= 0.6; g.beginPath(); g.ellipse(0, r * 0.45, r * 0.85, r * 0.32, 0, 0, TAU); g.stroke(); g.globalAlpha /= 0.6;
        g.beginPath(); g.moveTo(-r * 0.2, -r * 0.75); g.lineTo(r * 0.2, -r * 0.75); g.lineTo(r * 0.14, r * 0.25); g.lineTo(0, r * 0.45); g.lineTo(-r * 0.14, r * 0.25); g.closePath(); g.fill();
        return true;
      case 'goBurrow':   // a mound running along a dotted path
        for (let k = 0; k < 3; k++) { circle(g, -r * 0.8 + k * r * 0.28, r * 0.45, r * 0.08); g.fill(); }
        g.beginPath(); g.moveTo(-r * 0.05, r * 0.55); g.quadraticCurveTo(r * 0.45, -r * 0.35, r * 0.95, r * 0.55); g.closePath(); g.fill();
        return true;
    }
    return false;
  },
  sound(e) {
    switch (e.kind) {
      case 'gorush': return [['fFork', 0.6]];
      case 'gonip': return e.hit ? [['fPeng', 0.5]] : [['fDig', 0.25]];
      case 'godig': return [['fDig', 0.8]];
      case 'gocrack': return [['fRumble', 0.7]];
      case 'gopop': return e.hit ? [['fPopup', 1], ['fHeavy', 0.6]] : [['fPopup', 0.8]];
      case 'godaze': return [['fStep', 0.4]];
      case 'gostake': return [['fBlock', 0.5]];
      case 'goboom': return [['fThud', 0.75]];
      case 'goburrow': return [['fDig', 0.6]];
      case 'goout': return [['fPopup', 0.5]];
    }
    return null;
  },
};
