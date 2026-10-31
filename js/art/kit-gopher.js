// Gopher's Fight art (sim: js/kits/gopher.js). Earthy and soft; every tell is part of the floor. The ground is real
// earth: low-poly meshes baked per fight (propsFor), toon-shaded like the fighters (craters, slabs, furrows, the crack,
// the cave-in ring, the mound); 2D stand-ins while baking.
// Dig & Pop: crouch and claw a crater, burst up in an uppercut with a smear of earth; slabs heave up in front
// Goroutine Rush: four mini gophers race down their lanes, a furrow ahead of each
// Deadlock: paws slammed in, a crack splits the floor toward them; it caves in and they sink to the waist (art.sink),
// wriggling; run out, he's panting
// Burrow: a heaped mound with a furrow behind, steering; Burrow then Pop: the mound rumbles, he bursts up
// Shakes: only the pop that floors someone and the cave-in, softly.
import { PCOL, TAU, clamp, frnd } from '../core.js';
import { CHARACTERS } from '../core.js';
import { bold } from '../look.js';
import * as M3 from './model3d.js';
import { SCALE, model, shadow } from '../draw-fight.js';
import { animBase, settleAnim } from './kits.js';
import { bit3, bits3, cracks2, decal3, defProp, drawProp3D, facetTri, propReady, propsFor } from './prop3d.js';
import { EARTH as EARTH3, EARTH_D, EARTH_L, DRY, H, STONE, earthCol, lumpHalf, mixC, mulC } from './kit3-earth.js';
import { softShadow } from './arena-mat.js';

const ID = 'gopher';
const CUES = new WeakMap();   // (per fight: the cues already played)
const charOf = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const hsh = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const hexA = (h, a) => { const n = parseInt(String(h).slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${clamp(a, 0, 1).toFixed(3)})`; };
const EARTH = '122,82,48', DARK = '70,44,24', LIGHT = '236,214,176';
const { hex, decal, MATTE, FACET } = M3;
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }
const tri = (out, a, b, c, col, inP, o = 0.3) => facetTri(out, a, b, c, col, FACET, o, inP);
const PIT = hex('#2a170b'), PIT_D = hex('#170c05'), WALL = hex('#5a361b');

// ---------------------------------------------------------------- the 3D props (world units; x forward, z up)
// a turned profile round z (r, z pairs, inside out), each ring jittered a little by angle; col(i) the colour of band i
function ringProf(out, prof, nu, col, seed, jit = 0.06) {
  const P = prof.map(([r, z], i) => {
    const a = i ? prof[i - 1] : prof[i], b = i < prof.length - 1 ? prof[i + 1] : prof[i], dr = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dr, dz) || 1;
    return [r, z, -dz / l, dr / l];
  });
  for (let i = 0; i < P.length - 1; i++) {
    M3.grid(out, (u, j) => {
      const [r, z, nr, nz] = P[i + u], a = TAU * j / nu, q = 1 + jit * (H(seed + (j % nu) * 3.7) - 0.5) * (r > 0.5 ? 1 : 0), n = M3.norm([Math.cos(a) * nr, Math.sin(a) * nr, nz]);
      return [[Math.cos(a) * r * q, Math.sin(a) * r * q, z * (1 + jit * (H(seed + (j % nu) * 5.1 + i) - 0.5))], n, n];
    }, nu, 1, col(i), MATTE, i === P.length - 2 ? 1 : 0);
  }
}
// the hump he pushes underground: a faceted mound heaped at its front, split along its crest, clods and stones
function moundMesh() {
  const out = [];
  lumpHalf(out, [-1.5, 0, -1.5], [19, 14, 13], 3.3, 12, 6, 0.22, earthCol(3, 0.04), 1);
  lumpHalf(out, [10.5, 0, -1.5], [9.5, 11.5, 11], 5.1, 9, 5, 0.3, earthCol(9, 0.06), 1);
  for (let k = 0; k < 4; k++) { const x = -10 + k * 6.5; decal(out, [x, (H(k) - 0.5) * 2, 11.8 - Math.abs(x) * 0.12], [0, 0, 1], 3.2, 0.7, 0.2, PIT, 0.15 * (H(k + 3) - 0.5), 0); }   // (the split along its crest)
  for (let k = 0; k < 9; k++) {
    const x = -13 + k * 3.4 + (H(k + 2) - 0.5) * 2, y = (H(k + 5) - 0.5) * 15, q = 1 - (x / 19) ** 2 - (y / 14) ** 2, z = Math.max(1, 13 * Math.sqrt(Math.max(0, q)) - 2.2), r = 1.7 + H(k + 9) * 1.6;
    lumpHalf(out, [x, y, z], [r, r * 0.9, r * 0.8], 30 + k, 5, 3, 0.35, earthCol(30 + k, k % 4 ? 0.1 : 0.9), 0.8, 0);
  }
  return out;
}
// a crater (decal, r0 18): walls going down into the dark, lit far wall, heaped rim, clods round it
function holeMesh() {
  const out = [];
  ringProf(out, [[0, -9], [3.5, -8.6], [7, -6.8], [10, -3.8], [12, -0.6], [13.4, 2], [15.4, 2.9], [17.2, 1.4], [19, 0]], 24,
    i => i < 2 ? PIT_D : i < 3 ? PIT : i < 4 ? WALL : i < 5 ? mixC(EARTH3, WALL, 0.4) : i < 6 ? mixC(EARTH_L, DRY, 0.4) : EARTH_L, 7);
  for (let k = 0; k < 10; k++) { const a = k / 10 * TAU + H(k) * 0.4, rr = 15 + H(k + 3) * 2.5; lumpHalf(out, [Math.cos(a) * rr, Math.sin(a) * rr, 0.6], [3 + H(k) * 1.5, 2.6 + H(k + 1), 2.3 + H(k + 2)], 50 + k, 6, 3, 0.3, earthCol(50 + k, 0.08), 0.5); }
  for (let k = 0; k < 6; k++) { const a = k * 1.13 + 0.4, rr = 20 + H(k + 7) * 4, r = 1.1 + H(k + 4) * 1.2; lumpHalf(out, [Math.cos(a) * rr, Math.sin(a) * rr, 0], [r, r, r * 0.8], 70 + k, 5, 3, 0.35, earthCol(70 + k, 0.3), 0.4); }
  return out;
}
// a torn-up slab (standing, 8 headings): a thick chunk, dry top tipped toward +x, dark earth sides
function slabMesh() {
  const out = [], top = [[-6.5, -4.2], [4, -5.4], [7.2, -0.6], [5, 4.6], [-5.8, 4.3], [-7.6, 0.2]], T = 3.4, tilt = 0.42;
  const zAt = x => (x + 7.6) * Math.sin(tilt) - 1.6, P = top.map(([x, y]) => [x * Math.cos(tilt), y, zAt(x)]);
  const B = P.map(([x, y, z]) => [x + T * Math.sin(tilt), y, z - T * Math.cos(tilt)]), mid = [0, 0, zAt(0) - T / 2];
  const C = [P.reduce((s, p) => s + p[0], 0) / P.length, 0, zAt(0) + 0.5];
  for (let i = 0; i < P.length; i++) {
    const j = (i + 1) % P.length;
    tri(out, P[i], P[j], C, mulC(mixC(EARTH_L, DRY, 0.55 + 0.3 * H(i)), 0.95 + 0.1 * H(i + 4)), mid);
    tri(out, P[i], B[i], B[j], mulC(EARTH_D, 0.9 + 0.15 * H(i + 2)), mid); tri(out, P[i], B[j], P[j], mulC(mixC(EARTH_D, EARTH3, 0.4), 0.9 + 0.15 * H(i + 7)), mid);
  }
  for (let k = 0; k < 2; k++) { const x = -3 + k * 5, y = (H(k + 11) - 0.5) * 5, z = zAt(x) + 0.5; lumpHalf(out, [x * Math.cos(tilt), y, z], [1.2, 1.1, 0.9], 120 + k, 5, 3, 0.35, (n, c, i) => [mulC(k ? STONE : EARTH_L, 0.9 + 0.2 * H(i)), FACET], 0.6, z - 0.4); }
  return out;
}
// a stretch of the crack (decal, r0 14, along x): the floor split open to a black bottom, lips lifted and lit
function splitMesh() {
  const out = [], N = 7, xs = [...Array(N)].map((_, k) => -13 + 26 * k / (N - 1));
  const yc = k => (k === 0 || k === N - 1 ? 0 : (H(k * 3 + 1) - 0.5) * 3), w = k => k === 0 || k === N - 1 ? 0.9 : 2 + 1.5 * H(k + 5);
  for (let k = 0; k < N - 1; k++) {
    for (const s of [-1, 1]) {
      const e0 = [xs[k], yc(k) + s * w(k), 0.7], e1 = [xs[k + 1], yc(k + 1) + s * w(k + 1), 0.7];
      const b0 = [xs[k], yc(k), -6], b1 = [xs[k + 1], yc(k + 1), -6], inP = [(xs[k] + xs[k + 1]) / 2, (yc(k) + yc(k + 1)) / 2 - s * 3, -2];
      tri(out, e0, e1, b1, s > 0 ? PIT : WALL, inP, 0); tri(out, e0, b1, b0, s > 0 ? PIT : WALL, inP, 0);   // (the walls: the far one lit a touch)
      const o0 = [xs[k], yc(k) + s * (w(k) + 3 + H(k + s) * 1.2), 0], o1 = [xs[k + 1], yc(k + 1) + s * (w(k + 1) + 3 + H(k + 1 + s) * 1.2), 0], lip = [(xs[k] + xs[k + 1]) / 2, (yc(k) + yc(k + 1)) / 2 + s * 14, -3];
      tri(out, e0, o0, o1, mulC(mixC(EARTH_L, DRY, 0.5), 0.94 + 0.1 * H(k * 2 + s)), lip); tri(out, e0, o1, e1, mulC(mixC(EARTH_L, DRY, 0.45), 0.94 + 0.1 * H(k * 5 + s)), lip);
    }
  }
  for (let k = 0; k < 3; k++) { const x = -8 + k * 8 + H(k) * 3, y = (H(k + 9) < 0.5 ? -1 : 1) * (4.5 + H(k + 4) * 2), r = 0.9 + H(k + 2) * 0.9; lumpHalf(out, [x, y, 0.2], [r, r * 0.9, r * 0.8], 140 + k, 5, 3, 0.35, earthCol(140 + k, 0.3), 0.4, 0); }
  return out;
}
// the cave-in (standing, r ~22): a ring of earth round a dark hole (whole behind whoever's sunk, front half over them)
function lipMesh() {
  const out = [];
  ringProf(out, [[0, -2], [11, -2], [12.5, 1.2], [14.2, 4.8], [16.6, 6.6], [19.2, 5.4], [21.4, 2.4], [23, 0]], 26,
    i => i < 1 ? PIT_D : i < 2 ? PIT : i < 3 ? WALL : i < 4 ? mixC(EARTH_L, DRY, 0.5) : i < 5 ? mixC(EARTH_L, DRY, 0.3) : EARTH_L, 11, 0.1);
  for (let k = 0; k < 11; k++) { const a = k / 11 * TAU + H(k + 30) * 0.4, rr = 16.5 + H(k + 3) * 2.5; lumpHalf(out, [Math.cos(a) * rr, Math.sin(a) * rr, 4.6], [2.8 + H(k) * 1.3, 2.4 + H(k + 1), 2.1 + H(k + 2)], 200 + k, 6, 3, 0.3, earthCol(200 + k, 0.1), 0.6, 3.2); }
  for (let k = 0; k < 7; k++) { const a = k * 0.93 + 0.2, rr = 24 + H(k + 7) * 3, r = 1.1 + H(k + 4) * 1.1; lumpHalf(out, [Math.cos(a) * rr, Math.sin(a) * rr, 0], [r, r, r * 0.8], 230 + k, 5, 3, 0.35, earthCol(230 + k, 0.3), 0.4); }
  return out;
}
// a lump of earth: a faceted clod, a stone in it now and then
function lumpMesh() {
  const out = [];
  lumpHalf(out, [0, 0, -1], [7.5, 6.5, 8], 2.9, 7, 4, 0.32, earthCol(2, 0.14), 1);
  lumpHalf(out, [3.5, -2.5, 3], [2.4, 2.2, 2], 9.1, 5, 3, 0.3, (n, c, i) => [mulC(STONE, 0.9 + 0.2 * H(i)), FACET], 0.8, 0);
  return out;
}
// Dig & Pop's smear: a curved sheet of earth sweeping up with the punching paw (model units, round his body), bulging
// out in front to the uppercut's reach (his edge + 36), so what you see is what it hits
const SW_OUT = r => 19 + 21 * Math.max(0, r);
function swooshMesh() {
  const out = [], P = [];
  for (let j = 0; j <= 18; j++) { const th = -2.3 + 3.8 * j / 18; P.push([2 + SW_OUT(Math.cos(th)) * Math.cos(th), 3.5, 24 + 19 * Math.sin(th)]); }
  M3.sweep(out, P, t => 0.4 + 4.6 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.8), t => 0.5 + 0.9 * t, [0, 1, 0], mixC(DRY, hex('#f0dcb4'), 0.35), MATTE, 0.6, 10);
  for (let k = 0; k < 5; k++) { const th = -1.2 + k * 0.6, r = SW_OUT(Math.cos(th)) + (H(k + 3) - 0.5) * 4; lumpHalf(out, [2 + r * Math.cos(th), 3.5 + (H(k) - 0.5) * 3, 24 + r * Math.sin(th)], [1.6, 1.4, 1.3], 90 + k, 5, 3, 0.35, earthCol(90 + k, 0.3), 0.7, -99); }
  return out;
}
defProp('gomound', { mesh: moundMesh, n: 16, ink: '#3a2412' });
defProp('gohole', { mesh: holeMesh, n: 4, decal: true, ink: '#3a2412', out: 0.5, r0: 18 });
defProp('goslab', { mesh: slabMesh, n: 8, ink: '#3a2412', out: 0.5 });
defProp('gosplit', { mesh: splitMesh, n: 16, sym: 2, decal: true, ink: '#3a2412', out: 0.35, r0: 14 });
defProp('golip', { mesh: lipMesh, n: 1, ink: '#3a2412', out: 0.6 });
defProp('golump', { mesh: lumpMesh, n: 6, ink: '#3a2412' });
defProp('goswoosh', { mesh: swooshMesh, n: 16, ink: '#6a4a2a', out: 0.6 });
propsFor(ID, ['gomound', 'gohole', 'goslab', 'gosplit', 'golip', 'golump', 'goswoosh', 'bit:dust']);

// ---------------------------------------------------------------- the 2D stand-ins (while a sheet bakes, or no WebGL)
// a 2D clod: shaded from the top left, in its own soft shade
function crumb(g, x, y, r, a) {
  softShadow(g, x + r * 0.4, y + r * 0.55, r * 1.3, r * 0.7, 0.28 * a, 0, DARK);
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  gr.addColorStop(0, `rgba(${LIGHT},${(0.5 * a).toFixed(3)})`); gr.addColorStop(0.35, `rgba(${EARTH},${(0.92 * a).toFixed(3)})`); gr.addColorStop(1, `rgba(${DARK},${(0.92 * a).toFixed(3)})`);
  g.fillStyle = gr; circle(g, x, y, r); g.fill();
}
function cracks2D(g, o, u, fade) {
  const R = o.R, gr = g.createRadialGradient(o.x, o.y, 0, o.x, o.y, R * 1.05);
  gr.addColorStop(0, `rgba(${DARK},${(0.26 * (0.4 + 0.6 * u) * fade).toFixed(3)})`); gr.addColorStop(0.8, `rgba(${DARK},${(0.17 * (0.4 + 0.6 * u) * fade).toFixed(3)})`); gr.addColorStop(1, `rgba(${DARK},0)`);
  g.fillStyle = gr; g.beginPath(); g.ellipse(o.x, o.y, R * 1.05, R * 0.98, 0, 0, TAU); g.fill();
  cracks2(g, o.x, o.y, R, o.id * 3.1, fade * (0.3 + 0.7 * u), 7);
}
function mound2D(g, bob) {
  softShadow(g, 2, 2, 21, 8.5, 0.28);
  const mg = g.createRadialGradient(-5, -9 + bob, 1, 0, -3, 18);
  mg.addColorStop(0, '#c09062'); mg.addColorStop(0.55, '#8c6038'); mg.addColorStop(1, '#5e3e22');
  g.fillStyle = mg; g.beginPath(); g.moveTo(-17, 2); g.bezierCurveTo(-14, -9 + bob, -5, -13 + bob, 2, -12 + bob); g.bezierCurveTo(10, -11 + bob, 16, -5, 17, 2); g.quadraticCurveTo(0, 6, -17, 2); g.fill();
  for (let k = 0; k < 6; k++) { const x = -11 + k * 4.4 + Math.sin(k * 2.1) * 2, y = -4 - Math.sin((k + 0.5) / 6 * Math.PI) * 7 + bob, r = 1.6 + hsh(k) * 1.4; crumb(g, x, y, r, 1); }
}
function hole2D(g, x, y, s, a) {
  softShadow(g, x, y, s * 1.55, s * 0.72, 0.6 * a, 0, '110,74,42');   // (turned earth round it, no edge)
  const hg = g.createRadialGradient(x, y + 0.8, 0, x, y + 0.5, s * 0.8); hg.addColorStop(0, `rgba(30,18,9,${(0.8 * a).toFixed(3)})`); hg.addColorStop(0.75, `rgba(40,24,12,${(0.7 * a).toFixed(3)})`); hg.addColorStop(1, 'rgba(40,24,12,0)');
  g.fillStyle = hg; g.beginPath(); g.ellipse(x, y + 0.5, s * 0.8, s * 0.36, 0, 0, TAU); g.fill();
}
// a stretch of crack, flat (the stand-in for gosplit)
function strip2D(g, x, y, a, L, w, al, dark) {
  const c = Math.cos(a) * L / 2, s = Math.sin(a) * L / 2;
  g.save(); g.lineCap = 'round';
  g.strokeStyle = `rgba(${dark ? '40,22,10' : DARK},${(al * (dark ? 0.8 : 0.3)).toFixed(3)})`; g.lineWidth = w; g.beginPath(); g.moveTo(x - c, y - s); g.lineTo(x + c, y + s); g.stroke();
  g.strokeStyle = `rgba(${LIGHT},${(al * 0.35).toFixed(3)})`; g.lineWidth = w * 0.4; g.beginPath(); g.moveTo(x - c - 1, y - s - 1.2); g.lineTo(x + c - 1, y + s - 1.2); g.stroke();
  g.restore();
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
// a crater on the floor (under the fighters, via behind()), opening over its first moment
function addHole(v, x, y, s, life) { (v.goHoles || (v.goHoles = [])).push({ x, y, s, t0: v.t, life, f: Math.floor(frnd(0, 4)) }); }
function holes(g, v) {
  const L = v.goHoles; if (!L || !L.length) return;
  for (let i = L.length - 1; i >= 0; i--) {
    const h = L[i], age = v.t - h.t0, k = age / h.life; if (k >= 1 || k < -0.01) { L.splice(i, 1); continue; }
    const a = clamp((1 - k) / 0.35, 0, 1), s = h.s * (0.55 + 0.45 * ease(age / 0.12)) * (k > 0.65 ? 1 - 0.3 * (k - 0.65) / 0.35 : 1);
    if (!decal3(g, 'gohole', h.x, h.y, s, { frame: h.f, alpha: a })) hole2D(g, h.x, h.y, s * 0.8, a);
  }
}
// a slab at (x, y) (y-sorted with the fighters): raised edge toward a, up 0..1 out of the ground, al its alpha
function slab(g, x, y, a, sc, up, al = 1) {
  if (up <= 0.03 || al <= 0.01) return;
  g.save(); g.translate(x, y); drawProp3D(g, 'goslab', { yaw: a, scale: sc, sy: Math.max(0.08, up), alpha: al }); g.restore();
}
// a stretch of crack on the floor, along a (r: its half length, world units)
const split = (g, x, y, a, r, al) => decal3(g, 'gosplit', x, y, r, { yaw: a, alpha: al }) || (strip2D(g, x, y, a, r * 2, 3, al, true), true);

// ---------------------------------------------------------------- the floor
// a ridged furrow from (x0, y0) along a for L: two lit ridges round a dark groove, alpha al0 to al1, a few seeded clods
function ridges(g, x0, y0, a, L, al0, al1, seed, w = 4) {
  if (L < 3 || (al0 <= 0.01 && al1 <= 0.01)) return;
  const c = Math.cos(a), s = Math.sin(a), x1 = x0 + c * L, y1 = y0 + s * L;
  const grad = (rgb, k) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, `rgba(${rgb},${(k * al0).toFixed(3)})`); gr.addColorStop(1, `rgba(${rgb},${(k * al1).toFixed(3)})`); return gr; };
  const line = (ox, oy, rgb, k, lw) => { g.strokeStyle = grad(rgb, k); g.lineWidth = lw; g.beginPath(); g.moveTo(x0 + ox, y0 + oy); g.lineTo(x1 + ox, y1 + oy); g.stroke(); };
  g.save(); g.lineCap = 'round';
  line(0, 0.4, '52,30,14', 0.55, 2.2);   // (the groove)
  for (const sd of [-1, 1]) {
    const ox = -s * sd * w, oy = c * sd * w;
    line(ox + 0.9, oy + 1.3, '60,38,20', 0.35, 3.6);   // (its shadow, down-right)
    line(ox, oy, '150,104,62', 0.8, 3);              // (the ridge)
    line(ox - 0.5, oy - 0.8, '226,196,150', 0.55, 1.1);   // (its lit crest)
  }
  g.restore();
  if (!propReady('golump')) return;
  for (let d = 10 + hsh(seed) * 14; d < L; d += 22 + hsh(seed + d) * 14) {
    const sd = hsh(seed * 3 + d) < 0.5 ? -1 : 1, x = x0 + c * d - s * sd * (w + 1), y = y0 + s * d + c * sd * (w + 1), al = al0 + (al1 - al0) * d / L;
    g.save(); g.translate(x, y); drawProp3D(g, 'golump', { yaw: d + seed, scale: 0.14 + 0.08 * hsh(seed + d * 7), alpha: al }); g.restore();
  }
}
// a goroutine's lane: a furrow running out ahead of it, thinning down the lane
function lane(g, F, o) {
  const mv = F.f[o.owner].stats.moves.move2, run = o.ph === 'run';
  const x0 = run ? o.x : o.sx, y0 = run ? o.y : o.sy, left = mv.len - (o.ran || 0); if (left < 8) return;
  const a = run ? 1 : ease(o.t / 0.25), L = Math.min(left, run ? left : left * ease(o.t / 0.35)), k0 = 1 - (o.ran || 0) / mv.len;
  ridges(g, x0, y0, o.a, L, a * (0.35 + 0.6 * k0), 0, o.id * 7, 4);
}
// Dig & Pop's burst (the gocrack object, in front of him): a crater tears open where the earth heaves up
function burstFloor(g, F, v, o) {
  const k = o.t, fade = clamp((o.life - o.t) / 0.3, 0, 1), up = ease(k / 0.06);
  if (!propReady('gohole')) { cracks2D(g, o, up, fade); return; }
  decal3(g, 'gohole', o.x, o.y, o.R * 0.5 * (0.6 + 0.4 * up), { frame: o.id % 4, alpha: fade });
}
// and a ring of slabs heaving up round it, tipping outward, then sinking back
function burstThings(F, v, g, o, out) {
  const k = o.t; if (k > 0.6) return;
  if (!propReady('goslab') || !propReady('golump')) { drawProp3D(g, 'goslab', { alpha: 0 }); drawProp3D(g, 'golump', { alpha: 0 }); return; }
  const rise = k < 0.06 ? ease(k / 0.06) : 1 - 0.55 * ease((k - 0.1) / 0.45), fade = clamp((0.6 - k) / 0.18, 0, 1);
  for (let j = 0; j < 7; j++) {
    const an = j / 7 * TAU + hsh(o.id + j) * 0.5, q = o.R * (0.55 + 0.18 * hsh(o.id * 3 + j)), x = o.x + Math.cos(an) * q, y = o.y + Math.sin(an) * q;
    const sc = 0.75 + 0.35 * hsh(j * 7 + o.id), u = rise * (0.75 + 0.35 * hsh(j + o.id * 5));
    out.push({ y, d: () => slab(g, x, y, an, sc, u, fade) });
  }
  for (let j = 0; j < 4; j++) {
    const an = (j + 0.5) / 4 * TAU + hsh(o.id + j * 3) * 0.6, q = o.R * 0.3, x = o.x + Math.cos(an) * q, y = o.y + Math.sin(an) * q;
    out.push({ y, d: () => { g.save(); g.translate(x, y); drawProp3D(g, 'golump', { yaw: an + j, scale: 0.42, sy: Math.max(0.06, rise), alpha: fade }); g.restore(); } });
  }
}
// Deadlock's crack: stretches of split floor along its line, each opening up (lips lifting) as the head passes it;
// once it's caught them or run out it fades. The head (crackThings): chunks of ground tipping up either side, clods
const SEG = 13;   // (a stretch of crack every this many units)
function crackFloor(g, F, v, o) {
  const L = Math.max(0, o.ran || 0); if (L < 2) return;
  const fade = o.ph === 'run' ? 1 : clamp((o.life - o.t) / 0.5, 0, 1); if (fade <= 0.01) return;
  const mv = F.f[o.owner].stats.moves.move3, c = Math.cos(o.a), s = Math.sin(o.a);
  g.fillStyle = `rgba(${DARK},${(0.12 * fade).toFixed(3)})`;   // (the ground darkened a little round it)
  for (let d = 6; d < L; d += 16) { g.beginPath(); g.ellipse(o.x0 + c * d, o.y0 + s * d, 11, 6, o.a, 0, TAU); g.fill(); }
  for (let k = 0; k * SEG < L; k++) {
    const d = (k + 0.5) * SEG, since = o.ph === 'run' ? (L - d) / mv.speed : 1, open = ease(since / 0.07 + 0.25); if (d > L + 3) break;
    const j = (hsh(o.id * 13 + k) - 0.5) * 2, r = SEG * 0.66 * open;
    split(g, o.x0 + c * d - s * j, o.y0 + s * d + c * j, o.a + (hsh(k * 5 + o.id) - 0.5) * 0.28, r, fade * clamp(open * 1.4, 0, 1));
  }
  if (o.ph === 'run') {   // (the head: the ground breaking, clods hopping off it, dust)
    const hx = o.x0 + c * L, hy = o.y0 + s * L;
    if (frnd(0, 1) < 0.55) bit3(v, 'dirt', hx + frnd(-4, 4), hy + frnd(-3, 3), 2, { dx: c * frnd(10, 60) + frnd(-35, 35), dy: s * frnd(5, 30) + frnd(-18, 18), dz: frnd(80, 150), s: frnd(1.1, 2), life: 0.5, few: true });
    if (frnd(0, 1) < 0.25) bit3(v, 'dust', hx, hy, 2, { dx: frnd(-15, 15), dy: frnd(-8, 8), dz: frnd(8, 18), g: 0, drag: 2, s: frnd(3, 4.5), grow: 0.8, life: 0.5, fade: 'alpha', al: 0.7, sh: false, few: true });
  }
}
function crackThings(F, v, g, o, out) {
  const L = o.ran || 0; if (o.ph === 'caught' || L < 4) return;
  if (!propReady('goslab') || !propReady('golump')) { drawProp3D(g, 'goslab', { alpha: 0 }); drawProp3D(g, 'golump', { alpha: 0 }); return; }
  const c = Math.cos(o.a), s = Math.sin(o.a), hx = o.x0 + c * L, hy = o.y0 + s * L;
  const end = o.ph === 'run' ? 1 : clamp(1 - (o.t - (o.life - 0.8)) / 0.35, 0, 1); if (end <= 0) return;   // (run out: a last heave, sinking)
  const tw = o.ph === 'run' ? 0.85 + 0.15 * Math.sin(v.t * 40 + o.id) : 0.9;
  for (const sd of [-1, 1]) {   // two chunks of ground tipping up either side of the head, their raised edges outward
    const x = hx - c * 4 - s * sd * 7, y = hy - s * 4 + c * sd * 7;
    out.push({ y, d: () => slab(g, x, y, o.a + sd * Math.PI / 2 + 0.25 * sd, 0.55, tw * end * 0.9) });
  }
  out.push({ y: hy + 0.1, d: () => { g.save(); g.translate(hx + c * 3, hy + s * 3); drawProp3D(g, 'golump', { yaw: o.a + v.t * 3, scale: 0.4, sy: Math.max(0.08, (0.55 + 0.25 * Math.abs(Math.sin(v.t * 30 + o.id))) * end) }); g.restore(); } });   // (the bump of earth riding the head)
}
// the hole they're stuck in: the cave-in's crater on the floor under them (the heaped ring: lipBack / lipFront)
function pitFloor(g, F, v, o) {
  const a = o.ph === 'stuck' ? clamp(o.t / 0.06, 0, 1) : clamp((o.life - o.t) / 0.5, 0, 1), s = (o.r || 16) + 5;
  if (!decal3(g, 'gohole', o.x, o.y, s * (o.ph === 'stuck' ? 0.7 + 0.3 * ease(o.t / 0.1) : 1), { frame: o.id % 4, alpha: a })) hole2D(g, o.x, o.y, s, a);
}

// ---------------------------------------------------------------- among the fighters
// a goroutine: tiny Gopher (his own model) popping out of a hole and racing down its lane, kicking up dust
function goroutine(g, F, v, o) {
  const own = F.f[o.owner], ch = charOf(own ? own.id : ID), t = v.t + (o.id || 0) * 0.37, col = PCOL[o.owner] || PCOL[0];
  let s = 1, hop = Math.abs(Math.sin(t * 18)) * 2, yaw = o.a, clipU = 1;
  if (o.ph === 'spread') { const u = clamp(o.t / 0.16, 0, 1); s = 0.55 + 0.45 * ease(u); hop += Math.sin(u * Math.PI) * 6; clipU = 0.35 + 0.65 * ease(o.t / 0.1); const dx = o.sx - o.x, dy = o.sy - o.y; if (Math.hypot(dx, dy) > 3) yaw = Math.atan2(dy, dx); }
  shadow(g, o.x, o.y, hop, 8 * s);
  g.save(); g.beginPath(); g.ellipse(o.x, o.y + 1, 11 * s, 5.5 * s, 0, 0, TAU); g.fillStyle = hexA(col, 0.14); g.fill(); g.restore();
  g.save(); g.translate(o.x, o.y - hop);
  if (clipU < 1) { g.beginPath(); g.rect(-40, -80, 80, 80 + 0.5); g.clip(); g.translate(0, 18 * (1 - clipU)); }   // (popping up out of its hole)
  model(g, ch, { t, scale: SCALE * 0.44 * s, smooth: true, yaw: yaw + 0.35 * Math.sin(Math.PI / 2 - yaw), lean: Math.sin(t * 18) * 0.12, mood: null, pose: M3.walkPose ? M3.walkPose(t * 3.6) : 'stand', shadow: false, fight: true });
  g.restore();
  if (o.ph === 'spread') { const S = v.goSeen || (v.goSeen = new Set()); if (!S.has(o.id)) { if (S.size > 200) S.clear(); S.add(o.id); addHole(v, o.x, o.y, 7, 0.7); bits3(v, 'dirt', o.x, o.y, 2, 2, { speed: [20, 50], up: [80, 130], s: [1, 1.5], life: [0.35, 0.5], few: true }); } }   // (popping up at his feet)
  if (o.ph === 'run') {   // dust puffing up behind its feet, clods flicked back
    const c = Math.cos(o.a), sn = Math.sin(o.a);
    if (frnd(0, 1) < 0.2) bit3(v, 'dust', o.x - c * 7, o.y - sn * 4, 2, { dx: -c * 25 + frnd(-12, 12), dy: -sn * 14 + frnd(-8, 8), dz: frnd(8, 22), g: 0, drag: 2, s: frnd(2.2, 3.4), grow: 0.9, life: 0.45, fade: 'alpha', al: 0.8, sh: false, few: true });
    if (frnd(0, 1) < 0.12) bit3(v, 'dirt', o.x - c * 6, o.y - sn * 3, 2, { dx: -c * frnd(30, 60), dy: -sn * frnd(20, 40), dz: frnd(60, 110), s: frnd(1, 1.6), life: 0.45, few: true });
  }
}
// the hole fighter f is in (stuck, or just climbing out of it), and how far they're sunk in it right now
const pitFor = (F, f) => (F.objs || []).find(b => b.kind === 'gopit' && b.to === f.i && b.t < b.life && (b.ph === 'stuck' || b.life - b.t > 0.75)) || null;
const SINK = 16;
function sunk(p) {
  if (p.ph === 'stuck') return SINK * ease(p.t / 0.12);
  return SINK * (1 - ease((p.t - (p.life - 1.2)) / 0.2));   // (climbing out)
}
// the heaped ring: whole behind them, its front half over them (over()); heaves as they sink, crumbles once they're out
function lipScale(p) { const up = p.ph === 'stuck' ? ease(p.t / 0.1) : 1 - ease((p.t - (p.life - 1.2)) / 0.45); return [((p.r || 16) + 3) / 22, up]; }
function lipBack(g, f, p) {
  const [sc, up] = lipScale(p); if (up <= 0.02) return;
  if (!propReady('golip')) { drawProp3D(g, 'golip', { alpha: 0 }); hole2D(g, f.x, f.y, (p.r || 16) + 2, up); return; }
  g.save(); g.translate(f.x, f.y); drawProp3D(g, 'golip', { scale: sc, sy: Math.max(0.1, up) }); g.restore();
}
function lipFront(g, f, p) {
  const [sc, up] = lipScale(p); if (up <= 0.02) return;
  if (!propReady('golip')) { const R = (p.r || 16) + 5; g.fillStyle = bold() ? '#7a5030' : `rgb(${EARTH})`; g.beginPath(); g.ellipse(0, 0, R, R * 0.42, 0, 0, Math.PI); g.fill(); return; }
  g.save(); g.beginPath(); g.rect(-60, -1.5, 120, 60); g.clip();   // (only the half of the ring in front of them)
  drawProp3D(g, 'golip', { scale: sc, sy: Math.max(0.1, up) });
  g.restore();
}

// the mound (Gopher underground): a furrow behind it, trembling when it stops (rumbleThings)
function mound(g, f, v) {
  const t = v.t, sp = Math.hypot(f.vx || 0, f.vy || 0), c = Math.cos(f.face), s = Math.sin(f.face), still = f.ph === 'rumble';
  const T = v.goFur || (v.goFur = [[], []]), L = T[f.i] || (T[f.i] = []);
  const last = L[L.length - 1]; if (!last || Math.hypot(last[0] - f.x, last[1] - f.y) > 16) { L.push([f.x, f.y, v.t, last ? Math.atan2(f.y - last[1], f.x - last[0]) : f.face]); if (L.length > 24) L.shift(); }
  for (let i = 1; i < L.length; i++) {
    const [x, y, at] = L[i - 1], [x2, y2, at2] = L[i], k = clamp((v.t - at) / 1.8, 0, 1), k2 = clamp((v.t - at2) / 1.8, 0, 1); if (k >= 1) continue;
    ridges(g, x, y, Math.atan2(y2 - y, x2 - x), Math.hypot(x2 - x, y2 - y) + 1, 0.95 * (1 - k * k), 0.95 * (1 - k2 * k2), i * 13 + Math.round(at * 10), 5);
  }
  const bob = still ? Math.sin(t * 60) * 1.3 : Math.sin(t * 22) * 1.1, jx = still ? Math.sin(t * 47) * 1.2 : 0;
  g.save(); g.translate(f.x + jx, f.y);
  if (propReady('gomound')) {
    softShadow(g, 3, 2, 32, 13.5, 0.3);
    drawProp3D(g, 'gomound', { yaw: f.face, sy: 1.25 + bob * 0.05, scale: 1.25 + (still ? 0.05 * Math.sin(t * 31) : 0) });
  } else { drawProp3D(g, 'gomound', { alpha: 0 }); mound2D(g, bob); }
  g.restore();
  if (sp > 60 && frnd(0, 1) < 0.4) bit3(v, 'dirt', f.x + c * 16, f.y + s * 8, 7, { dx: c * frnd(20, 60) + frnd(-35, 35), dy: s * frnd(10, 30) + frnd(-18, 18), dz: frnd(70, 140), s: frnd(1.3, 2.3), life: 0.55, few: true });
  if (sp > 60 && frnd(0, 1) < 0.14) bit3(v, 'dust', f.x - c * 14, f.y - s * 7, 2, { dx: frnd(-15, 15), dy: frnd(-8, 8), dz: frnd(8, 20), g: 0, drag: 2, s: frnd(3, 4.5), grow: 0.8, life: 0.5, fade: 'alpha', al: 0.7, sh: false, few: true });
  if (still && frnd(0, 1) < 0.3) bit3(v, 'dirt', f.x + frnd(-12, 12), f.y + frnd(-6, 6), 9, { dz: frnd(40, 90), dx: frnd(-25, 25), dy: frnd(-12, 12), s: frnd(1, 1.6), life: 0.4, few: true });
}
// Burrow then Pop: slabs of ground round the stopped mound tipping up and trembling as it rumbles
function rumbleSlabs(g, f, v, out) {
  if (!propReady('goslab')) return;
  const u = clamp((f.pht || 0) / Math.max(0.05, f.dur || 0.16), 0, 1);
  for (let j = 0; j < 5; j++) {
    const an = j / 5 * TAU + 0.4, q = 20 + 3 * hsh(j), x = f.x + Math.cos(an) * q, y = f.y + Math.sin(an) * q, tw = 0.9 + 0.1 * Math.sin(v.t * 50 + j * 2);
    out.push({ y, d: () => slab(g, x + Math.sin(v.t * 45 + j) * 0.6, y, an, 0.5, ease(u / 0.7) * tw * 0.8) });
  }
}

// s since Dig & Pop burst out (its 'pop', then 'uppercut' or 'whiff'), in sim time so the hitstop holds it
const sinceBurst = f => (f.pht || 0) + (f.ph === 'pop' ? 0 : f.ph === 'whiff' ? f.stats.moves.move1.active : 0.05);
// the uppercut: a big stretch up on his toes, twisting through the punch, then a little squash landing
function upperAnim(F, v, f) {
  const A = animBase(), k = sinceBurst(f), u = clamp(k / 0.36, 0, 1), sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
  A.hop = 18 * Math.sin(u * Math.PI) * (1 - 0.25 * u);
  sq(-0.24 * Math.exp(-k * 10) + 0.08 * Math.max(0, 1 - Math.abs(k - 0.38) / 0.07));
  A.spin = -0.25 + 0.6 * ease(k / 0.07) - 0.35 * ease((k - 0.12) / 0.3);
  A.lean = -0.1 * Math.sin(u * Math.PI); A.fwd = 3 * ease(k / 0.08);
  return A;
}

export default {
  id: ID,
  anim(F, v, f) {
    const A = animBase(), k = f.pht || 0, sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
    switch (f.ph) {
      case 'whistle': sq(-0.04 + 0.04 * Math.sin(k * 26)); A.hop = Math.abs(Math.sin(k * 13)) * 2; A.mood = 'happy'; break;   // calling them out, bouncing
      case 'send': sq(-0.07 * Math.exp(-k * 10)); A.fwd = 4 * ease(k / 0.08); break;
      case 'scoop': {   // Dig & Pop's crouch: down low and wound back, paws scrabbling at the floor (quick: it's a HIT)
        const u = clamp(k / Math.max(0.05, f.dur || 0.16), 0, 1);
        sq(0.16 * ease(u / 0.6)); A.hop = -3 * ease(u); A.fwd = -2.5 * ease(u); A.spin = -0.25 * ease(u); A.wx = Math.sin(k * 75) * 0.9 * u;
        break;
      }
      case 'burrow': case 'rumble': A.alpha = 0; break;   // (underground: the mound, behind())
      case 'pop': case 'uppercut': return upperAnim(F, v, f, 0);   // (bursting up out of the hole: the uppercut)
      case 'whiff': {   // // (a miss: the follow-through into nothing, then he lands back in his hole: no stun)
        if (k < 0.22) return upperAnim(F, v, f, 0);
        const S = settleAnim(k - 0.22, (f.dur || 0.55) - 0.22, 'dazed', 0.12); S.fwd = 0; return S;
      }
      case 'popup': {   // (popping up out of the ground, then shaking the dirt off, blinking: open)
        if (k >= 0.22) { const S = settleAnim(k - 0.22, (f.dur || 0.4) - 0.22, 'dazed', 0.12); S.fwd = 0; S.wx = Math.sin(k * 48) * 1.2 * clamp(1 - (k - 0.22) / 0.15, 0, 1); return S; }
        const u = clamp(k / 0.22, 0, 1); A.s = 0.7 + 0.3 * ease(u * 1.5); A.hop = 9 * Math.sin(u * Math.PI); break;
      }
      case 'rear': { const u = clamp(k / Math.max(0.05, f.dur || 0.4), 0, 1); sq(-0.09 * ease(u / 0.5)); A.hop = 3 * ease(u); A.lean = -0.1 * ease(u); A.wx = Math.sin(k * 44) * 0.6 * u; break; }   // (up on his toes, paws high, trembling with it)
      case 'slam': sq(0.18 * Math.exp(-k * 12) + 0.03); A.hop = -1.5 * Math.exp(-k * 8); A.fwd = 3 * ease(k / 0.06); A.wx = f.state === 'strike' ? Math.sin(k * 52) * 0.5 : 0; break;   // (paws driven in, held there while it runs)
      case 'pant': { const S = settleAnim(k, f.dur || 0.45, 'pant', (f.dur || 0.45) * 0.85); S.sx *= 1 + 0.035 * Math.sin(k * 15); S.sy *= 1 - 0.035 * Math.sin(k * 15); S.fwd = 0; return S; }   // (missed: bent over, out of breath)
      default: return null;
    }
    return A;
  },
  ground(g, F, v, o) {
    if (o.kind === 'gorun') lane(g, F, o);
    else if (o.kind === 'gocrack') burstFloor(g, F, v, o);
    else if (o.kind === 'godl') crackFloor(g, F, v, o);
    else if (o.kind === 'gopit') pitFloor(g, F, v, o);
  },
  things(F, v, g, o, out) {
    if (o.kind === 'gorun') out.push({ y: o.y, d: () => goroutine(g, F, v, o) });
    else if (o.kind === 'gocrack') burstThings(F, v, g, o, out);
    else if (o.kind === 'godl') crackThings(F, v, g, o, out);
  },
  behind(g, F, v, f) {
    const other = F.f[1 - f.i];
    if (!other || f.y < other.y || (f.y === other.y && f.i === 0)) holes(g, v);   // (the craters on the floor: before whoever's drawn first)
    const pit = pitFor(F, f); if (pit) lipBack(g, f, pit);   // (the cave-in's ring, behind whoever's in it)
    if (f.id !== ID) return null;
    if (f.under && f.ph === 'rumble') {   // Burrow then Pop: the ground splitting round the stopped mound
      const u = clamp((f.pht || 0) / Math.max(0.05, f.dur || 0.16), 0, 1), out = [];
      if (!propReady('goslab')) cracks2D(g, { x: f.x, y: f.y, R: 14 + 12 * ease(u) }, u, 1);
      else for (let j = 0; j < 4; j++) { const an = j / 4 * TAU + 0.8; split(g, f.x + Math.cos(an) * 16, f.y + Math.sin(an) * 16, an, 9 * ease(u / 0.6), 0.9); }
      rumbleSlabs(g, f, v, out); for (const it of out) if (it.y <= f.y) it.d();
      mound(g, f, v); for (const it of out) if (it.y > f.y) it.d();   // (the slabs behind the mound, the mound, the ones in front)
      return 'hide';
    }
    if (f.under) { mound(g, f, v); return 'hide'; }
    if ((f.ph === 'scoop' || f.ph === 'pop' || f.ph === 'whiff' || (f.ph === 'uppercut' && f.pht < 0.4)) && !propReady('gohole')) hole2D(g, f.x, f.y + 1, 15, 0.9);   // (the stand-in: the 3D crater is one of v.goHoles)
    if (f.ph === 'scoop' && frnd(0, 1) < 0.55) {   // (clods flicked back off his scrabbling paws)
      const c = Math.cos(f.face), s = Math.sin(f.face);
      bit3(v, 'dirt', f.x + c * 10, f.y + s * 5, 3, { dx: -c * frnd(40, 90) + frnd(-25, 25), dy: -s * frnd(25, 50) + frnd(-14, 14), dz: frnd(90, 160), s: frnd(1.2, 2), life: 0.5, few: true });
    }
    if (f.ph === 'rear' && f.state === 'wind' && frnd(0, 1) < 0.35) {   // (rearing up: pebbles trembling, hopping on the floor round his feet)
      const a = frnd(0, TAU), r = frnd(10, 22);
      bit3(v, 'dirt', f.x + Math.cos(a) * r, f.y + Math.sin(a) * r * 0.6, 0.5, { dz: frnd(25, 55), dx: frnd(-8, 8), dy: frnd(-4, 4), s: frnd(0.8, 1.3), life: 0.3, few: true });
    }
    if (f.ph === 'pant' && f.state === 'recover' && frnd(0, 1) < 0.09) {   // (panting: little puffs of breath)
      const c = Math.cos(f.face), s = Math.sin(f.face);
      bit3(v, 'dust', f.x + c * 14, f.y + s * 7, 26, { dx: c * frnd(15, 30), dy: s * frnd(8, 16), dz: frnd(8, 18), g: -20, drag: 2.5, s: frnd(1.6, 2.4), grow: 1.2, life: 0.45, fade: 'alpha', al: 0.55, sh: false, few: true });
    }
    return null;
  },
  // stuck in Deadlock's hole: drawn sunk in to the waist (draw-fight.js cuts the model off at the floor), wriggling
  sink(F, v, f) {
    const pit = pitFor(F, f); if (!pit) return null;
    const d = sunk(pit); if (d <= 0.2) return null;
    return { d, wx: pit.ph === 'stuck' ? Math.sin(v.t * 21 + f.i) * 1.5 * clamp((pit.t - 0.15) / 0.1, 0, 1) : 0 };
  },
  over(g, F, v, f) {
    const pit = pitFor(F, f); if (pit) lipFront(g, f, pit);   // (the front of the heaped ring, over them)
    if (f.id !== ID || !(f.ph === 'pop' || f.ph === 'uppercut' || f.ph === 'whiff')) return;
    // the smear of thrown-up earth sweeping up with his paw, gone in a blink
    const k = sinceBurst(f), a = 1 - ease(k / 0.2); if (a <= 0.02) return;
    const A = upperAnim(F, v, f);
    g.save(); g.translate(0, A.hop * 0.4);   // (lagging a little below his body as it rises: it trails his paw)
    drawProp3D(g, 'goswoosh', { yaw: f.face + 0.35 * Math.sin(Math.PI / 2 - f.face) + A.spin, scale: SCALE * (0.9 + 0.15 * ease(k / 0.1)), alpha: 0.85 * a });
    g.restore();
  },
  event(v, F, e, few) {
    switch (e.kind) {
      case 'gorush':   // off they go: a little puff of dust at the start of each lane
        for (const o of F.objs || []) if (o.kind === 'gorun' && o.owner === e.who) dust(v, o.sx, o.sy, 2, 5, few);
        return true;
      case 'gonip':   // a nip (a little spray of earth), or one diving back into the ground at its lane's end
        bits3(v, 'dirt', e.x, e.y, 3, few ? 2 : 4, { speed: [30, 80], up: [90, 160], s: [1.2, 2], life: [0.4, 0.6] }); dust(v, e.x, e.y, e.hit ? 3 : 2, 5, few);
        if (e.hit) bit3(v, 'star', e.x, e.y, 26, { dx: frnd(-30, 30), dy: frnd(-10, 10), dz: frnd(70, 110), g: 320, s: 3, life: 0.5, sh: false });   // (a nip that lands: a little star off them)
        if (e.hit == null) addHole(v, e.x, e.y, 7, 0.7);
        return true;
      case 'goscoop': addHole(v, e.x, e.y, 15, 1.1); dust(v, e.x, e.y, 2, 8, few); return true;   // (digging in: a crater opening at his feet)
      case 'goburst':   // up out of the ground: the earth in front of him bursts up, clods and rocks thrown high
        spray(v, e.x, e.y, 1.1, few, 1.15);
        bits3(v, 'rock', e.x, e.y, 6, few ? 1 : 3, { speed: [40, 110], up: [220, 330], s: [1.4, 2.2], life: [0.8, 1.1], bo: 0.4, r: 8 });
        return true;
      case 'gopop': {   // the uppercut connecting: a burst of earth and rock off them, a soft shake (a miss: nothing more)
        if (e.hit == null || e.hit === false) return true;
        const D = F.f[e.who], a = D ? D.face : 0, p = e.pit ? 1.4 : 1;   // (out of a hole: more earth)
        bits3(v, 'dirt', e.x, e.y, 22, Math.round((few ? 4 : 8) * p), { dir: a, spread: 2.2, speed: [70, 150], up: [140, 260], s: [1.6, 2.8], life: [0.6, 0.9], bo: 0.25 });
        bits3(v, 'rock', e.x, e.y, 22, Math.round((few ? 1 : 3) * p), { dir: a, spread: 1.8, speed: [80, 160], up: [160, 280], s: [1.4, 2.2], life: [0.7, 1], bo: 0.35 });
        dust(v, e.x, e.y, 4, 10, few);
        v.shake = Math.max(v.shake, e.pit ? 0.26 : 0.2);
        return true;
      }
      case 'goslam': {   // his paws driven in: two little craters, a jolt of dust and clods off them, the crack bursting out ahead
        const c = Math.cos(e.a || 0), sn = Math.sin(e.a || 0);
        for (const sd of [-1, 1]) addHole(v, e.x - c * 3 - sn * sd * 6, e.y - sn * 3 + c * sd * 6, 6.5, 1.4);
        dust(v, e.x, e.y, 4, 9, few);
        bits3(v, 'dirt', e.x, e.y, 3, few ? 3 : 6, { dir: e.a || 0, spread: 2.4, speed: [40, 90], up: [110, 190], s: [1.3, 2.2], life: [0.45, 0.7], bo: 0.25 });
        bits3(v, 'rock', e.x + c * 6, e.y + sn * 6, 3, few ? 1 : 2, { dir: e.a || 0, spread: 1.6, speed: [50, 90], up: [120, 170], s: [1.2, 1.8], life: [0.6, 0.8], bo: 0.35 });
        return true;
      }
      case 'gocave': {   // the ground caving in under them: earth thrown up round their feet, a ring of dust rolling out
        spray(v, e.x, e.y, 1, few, 0.8);
        for (let k = 0; k < (few ? 4 : 8); k++) { const a = k / (few ? 4 : 8) * TAU + frnd(-0.3, 0.3); bit3(v, 'dust', e.x + Math.cos(a) * 16, e.y + Math.sin(a) * 9, 3, { dx: Math.cos(a) * frnd(40, 70), dy: Math.sin(a) * frnd(20, 35), dz: frnd(10, 25), g: 0, drag: 2.5, s: frnd(4, 6), grow: 1, life: 0.7, fade: 'alpha', al: 0.85, sh: false }); }
        v.shake = Math.max(v.shake, 0.16);
        return true;
      }
      case 'gofizz': dust(v, e.x, e.y, 3, 8, few); bits3(v, 'dirt', e.x, e.y, 2, few ? 2 : 4, { speed: [20, 60], up: [80, 140], s: [1, 1.8], life: [0.4, 0.6] }); return true;   // (the crack running out: a last heave)
      case 'goclimb': spray(v, e.x, e.y, e.hit ? 0.9 : 0.6, few, 0.7); return true;   // (out of the hole: the ring crumbling, earth tumbling off them)
      case 'goburrow': spray(v, e.x, e.y, 0.7, few, 0.8); addHole(v, e.x, e.y, 14, 0.9); return true;
      case 'gorumble': dust(v, e.x, e.y, 2, 10, few); bits3(v, 'dirt', e.x, e.y, 6, few ? 2 : 4, { speed: [20, 50], up: [90, 150], s: [1.1, 1.8], life: [0.4, 0.6] }); return true;   // (the mound stops dead: a jolt of dust and clods)
      case 'goout': spray(v, e.x, e.y, 0.8, few); addHole(v, e.x, e.y, 15, 1); return true;
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
      case 'goLock':   // a zigzag crack running up to a hole, a head sunk in it
        g.lineWidth = r * 0.14; g.beginPath(); g.moveTo(-r * 0.85, r * 0.75); g.lineTo(-r * 0.5, r * 0.45); g.lineTo(-r * 0.55, r * 0.15); g.lineTo(-r * 0.2, -r * 0.05); g.stroke();
        g.beginPath(); g.ellipse(r * 0.35, r * 0.2, r * 0.55, r * 0.24, 0, 0, TAU); g.fill();
        g.globalAlpha *= 0.55; circle(g, r * 0.35, -r * 0.25, r * 0.3); g.fill(); g.globalAlpha /= 0.55;
        return true;
      case 'goBurrow':   // a mound running along a dotted path
        for (let k = 0; k < 3; k++) { circle(g, -r * 0.8 + k * r * 0.28, r * 0.45, r * 0.08); g.fill(); }
        g.beginPath(); g.moveTo(-r * 0.05, r * 0.55); g.quadraticCurveTo(r * 0.45, -r * 0.35, r * 0.95, r * 0.55); g.closePath(); g.fill();
        return true;
    }
    return false;
  },
  // his own earthy sounds (sounds below; beats that aren't events: cues)
  sound(e) {
    switch (e.kind) {
      case 'tell': return e.move === 'move2' ? [['goWhistle', 0.7], ['goPeep', 0.6]] : e.move === 'move3' ? [['goRear', 0.7]] : null;   // (Dig & Pop's: goscoop / gorumble)
      case 'hit':   // (his hits: by the move, by how big)
        if (e.move === 'move1') return [['goUpper', 0.65 + 0.35 * (e.power || 0)]];
        if (e.move === 'move2') return [['goNip', 0.7], ['fJab', 0.3]];
        if (e.move === 'move3') return [];   // (the cave-in: gocave)
        return null;
      case 'goscoop': return [['goScrabble', 0.7]];
      case 'gorumble': return [['goRumble', 0.8]];
      case 'goburst': return [['goHeave', 0.8]];
      case 'gopop': return e.hit ? (e.pit ? [['goClods', 0.7], ['fHeavy', 0.5]] : [['goClods', 0.5]]) : e.power > 0.4 ? null : [['goWhiff', 0.7]];   // (a guard or armour took it: their own sound)
      case 'gorush': return [['goScurry', 0.7]];
      case 'gonip': return e.hit === undefined ? [['goDuck', 0.45]] : null;   // (one running out, diving back into a hole; a nip: the hit's)
      case 'goslam': return [['goSlam', 0.8]];
      case 'gocave': return [['goCave', 0.9]];
      case 'gofizz': return [['goFizzle', 0.6]];
      case 'goclimb': return [['goClimb', e.hit ? 0.4 : 0.6]];
      case 'goburrow': return [['goBurrow', 0.75]];
      case 'goout': return [['goPopOut', e.move === 'move1' ? 0.4 : 0.7]];
    }
    return null;
  },
  // beats that aren't events: the crack crackling along, the mound churning, him panting when the crack runs out
  cues(F, play) {
    let M = CUES.get(F); if (!M) CUES.set(F, M = { ph: [], n: {} });
    for (const f of F.f) {
      if (f.id !== ID) continue;
      if (f.ph !== M.ph[f.i] && f.ph === 'pant') play('goPant', 0.6);
      M.ph[f.i] = f.ph;
      if (f.ph === 'burrow') { const k = 'b' + f.i, n = Math.floor((f.pht || 0) / 0.11); if (M.n[k] !== n) { M.n[k] = n; play('goTunnel', 0.55); } }
    }
    for (const o of F.objs || []) {
      if (o.kind !== 'godl' || o.ph !== 'run') continue;
      const k = 'c' + o.id, n = Math.floor((o.t || 0) / 0.07); if (M.n[k] !== n) { M.n[k] = n; play('goCreep', 0.55); }
    }
  },
  sounds: {
    // Dig & Pop: the paws scrabbling at the floor, clods flying back
    goScrabble: ({ osc, hiss }) => (v, t) => { for (let k = 0; k < 5; k++) hiss(t + k * 0.03, 0.035, 0.09 * v, 'bandpass', 1500 - k * 120, 700); osc(t + 0.02, 110, 0.12, 'sine', 0.08 * v, -30); },
    // out of a Burrow: the mound stopping dead and rumbling
    goRumble: ({ osc, hiss }) => (v, t) => { osc(t, 52, 0.32, 'sawtooth', 0.05 * v, 8); hiss(t, 0.32, 0.14 * v, 'lowpass', 420, 200); for (let k = 0; k < 3; k++) osc(t + 0.05 + k * 0.08, 85, 0.06, 'sine', 0.1 * v, -20); },
    // the earth heaving up in front of him: a deep whump, the ground tearing, clods tossed up
    goHeave: ({ osc, hiss }) => (v, t) => { osc(t, 80, 0.25, 'sine', 0.26 * v, -35); hiss(t, 0.3, 0.16 * v, 'lowpass', 1600, 250); for (let k = 0; k < 4; k++) osc(t + 0.05 + k * 0.035, 320 - k * 40, 0.04, 'triangle', 0.05 * v, -90); },
    // the uppercut landing: a meaty thock that springs up (it launches you)
    goUpper: ({ osc, hiss }) => (v, t) => { hiss(t, 0.04, 0.16 * v, 'highpass', 2800); osc(t, 95, 0.22, 'sine', 0.3 * v, -40); osc(t, 170, 0.14, 'square', 0.08 * v, 160); hiss(t + 0.02, 0.18, 0.12 * v, 'lowpass', 1400, 300); },
    // earth raining back down off whoever it launched
    goClods: ({ osc, hiss }) => (v, t) => { for (let k = 0; k < 5; k++) { hiss(t + 0.05 + k * 0.05, 0.04, 0.07 * v * (1 - k * 0.13), 'bandpass', 900 + ((k * 3) % 4) * 220); osc(t + 0.05 + k * 0.05, 240 - k * 20, 0.03, 'triangle', 0.03 * v, -60); } },
    // a miss: his paw sweeping air, and a soft plop back into his hole
    goWhiff: ({ osc, hiss }) => (v, t) => { hiss(t, 0.12, 0.09 * v, 'bandpass', 700, 2200); osc(t + 0.1, 140, 0.12, 'sine', 0.12 * v, -50); hiss(t + 0.1, 0.1, 0.05 * v, 'lowpass', 600); },
    // Goroutine Rush: a cheeky two-note whistle, and four little gophers popping up out of their holes
    goWhistle: ({ osc }) => (v, t) => { osc(t, 1700, 0.07, 'sine', 0.06 * v, 300); osc(t + 0.08, 2250, 0.09, 'sine', 0.06 * v, -200); },
    goPeep: ({ osc, hiss }) => (v, t) => { for (let k = 0; k < 4; k++) { osc(t + 0.04 + k * 0.045, 560 + k * 90, 0.045, 'sine', 0.06 * v, 480); hiss(t + 0.04 + k * 0.045, 0.03, 0.03 * v, 'lowpass', 1200); } },
    // ...and off they run: a patter of tiny feet
    goScurry: ({ osc, hiss }) => (v, t) => { for (let k = 0; k < 9; k++) hiss(t + k * 0.032, 0.02, 0.07 * v * (1 - k * 0.06), 'bandpass', 2100 + (k % 3) * 400); osc(t, 700, 0.06, 'triangle', 0.025 * v, 300); },
    // a goroutine's nip: a tiny squeaky chomp
    goNip: ({ osc }) => (v, t) => { osc(t, 1400, 0.03, 'square', 0.035 * v, -500); osc(t + 0.035, 1100, 0.04, 'square', 0.03 * v, -400); osc(t, 160, 0.06, 'sine', 0.1 * v, -50); },
    // one finding nothing: diving back into a little hole
    goDuck: ({ osc, hiss }) => (v, t) => { osc(t, 700, 0.08, 'sine', 0.05 * v, -450); hiss(t + 0.03, 0.05, 0.04 * v, 'lowpass', 900); },
    // Deadlock: rearing up, paws high, pebbles trembling round his feet
    goRear: ({ osc }) => (v, t) => { osc(t, 120, 0.3, 'triangle', 0.06 * v, 160); for (let k = 0; k < 6; k++) osc(t + 0.05 + k * 0.04, 2000 + ((k * 7) % 5) * 280, 0.015, 'triangle', 0.025 * v); },
    // the paws slammed in, the floor splitting
    goSlam: ({ osc, hiss }) => (v, t) => { osc(t, 70, 0.25, 'sine', 0.3 * v, -30); hiss(t, 0.07, 0.14 * v, 'lowpass', 1200); hiss(t + 0.03, 0.12, 0.1 * v, 'highpass', 2500, 1200); osc(t + 0.02, 2400, 0.03, 'square', 0.035 * v, -1200); },
    // the crack racing along: a dry crackle (a cue, every few hundredths of a second)
    goCreep: ({ osc, hiss }) => (v, t) => { osc(t, 1800, 0.015, 'square', 0.025 * v, -800); osc(t + 0.02, 2500, 0.012, 'square', 0.02 * v, -900); hiss(t, 0.04, 0.05 * v, 'bandpass', 2600, 1400); },
    // the ground caving in under them: a heavy slump, earth crumbling in
    goCave: ({ osc, hiss }) => (v, t) => { osc(t, 60, 0.45, 'sine', 0.3 * v, -25); hiss(t, 0.5, 0.17 * v, 'lowpass', 900, 150); osc(t + 0.02, 200, 0.2, 'triangle', 0.05 * v, -120); for (let k = 0; k < 6; k++) hiss(t + 0.06 + k * 0.05, 0.05, 0.06 * v, 'bandpass', 1200 - k * 120); },
    // the crack running out: a last heave, crumbling away
    goFizzle: ({ osc, hiss }) => (v, t) => { hiss(t, 0.3, 0.08 * v, 'lowpass', 800, 200); osc(t, 110, 0.2, 'sine', 0.08 * v, -40); for (let k = 0; k < 3; k++) osc(t + 0.08 + k * 0.06, 1500 - k * 300, 0.02, 'triangle', 0.02 * v); },
    // ...and him bent over, panting: quick little breaths
    goPant: ({ hiss }) => (v, t) => { for (let k = 0; k < 3; k++) hiss(t + k * 0.15, 0.08, 0.05 * v, 'bandpass', 1700, 1000); },
    // climbing out of the hole, its ring crumbling
    goClimb: ({ osc, hiss }) => (v, t) => { for (let k = 0; k < 3; k++) hiss(t + k * 0.04, 0.035, 0.07 * v, 'bandpass', 1300 - k * 150, 700); osc(t + 0.1, 150, 0.1, 'sine', 0.08 * v, 120); hiss(t + 0.12, 0.2, 0.05 * v, 'lowpass', 900, 300); },
    // Burrow: a dive into the ground, earth thrown up, then muffled
    goBurrow: ({ osc, hiss }) => (v, t) => { hiss(t, 0.12, 0.13 * v, 'bandpass', 600, 2000); osc(t, 200, 0.1, 'sine', 0.1 * v, -120); hiss(t + 0.08, 0.3, 0.11 * v, 'lowpass', 700, 250); },
    // the mound churning along underground (a cue, every tenth of a second)
    goTunnel: ({ osc, hiss }) => (v, t) => { hiss(t, 0.1, 0.07 * v, 'lowpass', 420, 250); osc(t, 62, 0.08, 'sine', 0.08 * v, -10); },
    // popping up out of the ground: a cork-like pop, and the dirt shaken off
    goPopOut: ({ osc, hiss }) => (v, t) => { osc(t, 180, 0.1, 'sine', 0.13 * v, 400); osc(t + 0.03, 700, 0.05, 'triangle', 0.045 * v, 300); hiss(t, 0.15, 0.09 * v, 'lowpass', 1400, 400); for (let k = 0; k < 3; k++) hiss(t + 0.13 + k * 0.05, 0.04, 0.04 * v, 'bandpass', 1800); },
  },
};
