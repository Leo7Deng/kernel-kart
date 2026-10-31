// Docky's Fight art (sim: js/kits/docky.js). Classic Flat first; tells are part of the world (no outlines or arrows).
// Every set piece is a baked 3D prop (art/prop3d.js), a 2D stand-in until baked.
//   Tidal Wave  he rears up as water wells in a pool ahead, slams down and a glossy curling wave rolls out carrying whoever
//               it catches; he surfs its back; where it breaks, crowns of water and a drying puddle
//   Tail Slap   a deep twist (tail cocked, water streaming, the floor stirring out to its real reach: stir2), then a full
//               spin with the tail as a bat and a crescent of spray drawn to the real reach; a hit flings a sheet of water
//   Compose Up  containers stack on his back as a crack creeps to the spots; he slams and a hump of broken floor races
//               out (seam()) as shipping containers burst up behind the foe, two high, then sink back
//   Swim        dives in with a splash, a ripple line with his back breaking it races off, a foamy wake; surfaces
// A miss is a calm settle; winded, his blowhole puffs a V of spray that dies down (a clock for how long he's open).
import { TAU, clamp, frnd } from '../core.js';
import { bold } from '../look.js';
import { puff } from '../draw-fight.js';
import { animBase, settleAnim } from './kits.js';
import { tailAt } from '../kits/docky.js';
import * as M3 from './model3d.js';
import { bit3, bits3, cracks2, decal3, defBit, defProp, drawProp3D, lathe3, propReady, propsFor } from './prop3d.js';
import { mat, mix, rgba, softShadow } from './arena-mat.js';

const ID = 'docky';
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const hsh = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); };
const WATER = '120,190,240';

// ---------------------------------------------------------------- the 3D props (baked with his fights)
const { ellipsoid, ball, capsule, tube, rbox, grid, sweep, smoothProf, hex, norm, cross, sub, dot, MATTE, GLOSS, WET, STRIDE } = M3;
const mixC = (a, b, t) => a.map((x, k) => x + (b[k] - x) * t);
// a soft lump of foam (a flattened bead), turned a on the floor
const foam = (out, p, r, a, col) => ellipsoid(out, p, [[Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2, 0], [-Math.sin(a) * r * 0.85, Math.cos(a) * r * 0.85, 0], [0, 0, r * 0.55]], col, MATTE, 12, 7, 0);
// the Tidal Wave (x the way it rolls, z up): a wall WAVE_W either side, tallest in the middle; a long back slope up to a
// crest whose lip curls forward well past its face, a hollow barrel under it; deep blue at the foot, turquoise up the
// face, pale inside the curl; foam riding the crest and spilling off the lip, white water at its toe, spray ahead
const WAVE_W = 50;
function waveMesh() {
  const out = [], DEEP = hex('#1f6fbd'), MID = hex('#3aa2e6'), TEAL = hex('#5cc6e8'), LIT = hex('#b8ecfb'), W = hex('#ffffff'), W2 = hex('#e4f6ff');
  // the section (x, z) at full height, a closed loop (clockwise seen from its left): up the back, over the crest, out
  // to the lip's tip, back under it into the barrel, down the face to the toe, back along the floor
  const sec = [[-30, 0], [-24, 4.5], [-17, 12], [-9, 21], [-1, 29], [6, 34.5], [12, 37], [18, 36], [22.5, 32], [24, 27.5], [22, 25.6], [18.5, 26.6], [14.5, 25.6], [11, 22], [9, 16], [9.4, 9.5], [11.6, 4], [15, 0.6], [17, 0], [5, 0], [-14, 0]];
  const nS = sec.length, nA = 26;
  const H = y => Math.max(0.12, Math.pow(Math.max(0, 1 - (y / WAVE_W) ** 2), 0.6));   // (its height across)
  const P = (i, j) => { const y = -WAVE_W + 2 * WAVE_W * clamp(j, 0, nA) / nA, h = H(y), [x, z] = sec[((i % nS) + nS) % nS]; return [x * (0.55 + 0.45 * h) - 7 * (1 - h), y, z * h]; };
  grid(out, (i, j) => {
    const p = P(i, j), dS = sub(P(i + 1, j), P(i - 1, j)), dA = sub(P(i, j + 1), P(i, j - 1));
    let n = norm(cross(dS, dA)); if (dot(n, [-dS[2], 0, dS[0]]) < 0) n = n.map(x => -x);
    return [p, n, n];
  }, nA, nS, DEEP, WET, 1);
  for (let i = 0; i < out.length; i += STRIDE) {   // its colours: deep at the foot, turquoise up the face, pale in the curl, light on the crest
    const x = out[i], z = out[i + 2], h = H(out[i + 1]), u = clamp(z / (37 * h), 0, 1), face = x > 7 * (0.55 + 0.45 * h) - 7 * (1 - h);
    const curl = face && u > 0.55 && out[i + 3] < 0.3;
    const c = curl ? mixC(TEAL, LIT, 0.65) : face ? mixC(mixC(DEEP, MID, 0.5), TEAL, Math.pow(u, 1.2)) : mixC(DEEP, MID, Math.pow(u, 1.3) * 0.85);
    out[i + 6] = c[0]; out[i + 7] = c[1]; out[i + 8] = c[2];
  }
  for (let k = 0; k <= 24; k++) {   // foam riding the crest, thickest at the lip, a few clots spilling down its front
    const y = -WAVE_W * 0.94 + 2 * WAVE_W * 0.94 * k / 24 + (hsh(k) - 0.5) * 2, h = H(y), X = x => x * (0.55 + 0.45 * h) - 7 * (1 - h);
    ball(out, [X(15 + 5 * hsh(k + 5)), y, 36.5 * h + 0.6], (2.5 + 1.5 * hsh(k + 2)) * (0.5 + 0.5 * h), mixC(W, W2, hsh(k + 7)), MATTE, 0.6, 10, 7);
    if (k % 2 === 0) ball(out, [X(9 + 4 * hsh(k + 9)), y + 1.3, 36 * h + 0.3], (1.8 + hsh(k)) * (0.5 + 0.5 * h), W, MATTE, 0.5, 10, 7);
    if (k % 3 === 1) ball(out, [X(23.5), y - 0.8, (29 - 3 * hsh(k + 13)) * h], (1.5 + 0.8 * hsh(k + 4)) * (0.5 + 0.5 * h), W2, MATTE, 0.5, 9, 6);
  }
  for (let k = 0; k <= 16; k++) {   // white water boiling at its toe
    const y = -WAVE_W * 0.9 + 1.8 * WAVE_W * k / 16, h = H(y);
    ball(out, [14 + 2 * hsh(k + 11) - 5 * (1 - h), y + (hsh(k) - 0.5) * 3, 2], 2.6 + 1.6 * hsh(k + 3), mixC(W, W2, hsh(k)), MATTE, 0.6, 10, 7);
    if (k % 2) foam(out, [20 + 5 * hsh(k + 21), y + (hsh(k + 4) - 0.5) * 5, 0.6], 1.8 + 1.2 * hsh(k + 9), hsh(k) * 3, W2);
  }
  for (let k = 0; k < 12; k++) {   // spray flung up and forward off the lip, in little sprigs
    const y = (hsh(k + 40) - 0.5) * WAVE_W * 1.3, h = H(y), x = (25 + 4 * hsh(k + 41)) * (0.55 + 0.45 * h), z = (34 + 7 * hsh(k + 42)) * h;
    ball(out, [x, y, z], (1.1 + 0.7 * hsh(k + 43)) * (0.6 + 0.4 * h), k % 3 ? LIT : W, GLOSS, 0.5, 8, 6);
    if (k % 2) ball(out, [x + 2.6, y + 0.6, z + 2.2 * h], 0.7 + 0.4 * hsh(k + 44), W, GLOSS, 0.4, 8, 6);
  }
  return out;
}
// the Tail Slap's crescent of spray (round his middle at tail height, head at x, trailing back the way it swings):
// a ribbon thick at its head thinning to nothing, beads along the outer edge
function swishMesh() {
  const out = [], C = hex('#cdeeff'), W = hex('#ffffff'), R = 40, n = 14, pts = [];
  for (let i = 0; i <= n; i++) { const a = -2.1 * i / n; pts.push([Math.cos(a) * R, Math.sin(a) * R, 15 - 3 * i / n]); }
  sweep(out, pts, t => Math.max(0.3, 6.5 * (1 - t) ** 1.2), t => Math.max(0.3, 2.6 * (1 - t)), [0, 0, 1], i => i < 3 ? W : C, WET, 0.8, 10);
  for (let k = 0; k < 9; k++) { const a = -1.9 * (k + 0.5) / 9, r = R + 6 + 4 * hsh(k); ball(out, [Math.cos(a) * r, Math.sin(a) * r, 15 + 3 * hsh(k + 2)], (1.8 - k * 0.12) + 0.6 * hsh(k + 1), k % 2 ? C : W, GLOSS, 0.5, 8, 6); }
  return out;
}
// a wet pool where he dives (decal, radius 40): deeper blue middle, foamy uneven rim, ripples (states a b c in turn)
const RIP = { a: 0, b: 1 / 3, c: 2 / 3 };
function poolMesh(state) {
  const out = [], R = 40, nu = 40, nv = 6, DEEP = hex('#3f97da'), LIT = hex('#9dd8fa'), ph = RIP[state] || 0;
  const rim = a => R * (1 + 0.06 * Math.sin(3 * a + 0.9) + 0.04 * Math.sin(5 * a + 2.3));
  grid(out, (i, j) => { const a = TAU * j / nu, u = i / nv, r = rim(a) * u, z = 1.2 * Math.sqrt(Math.max(0, 1 - u * u)) + 0.2, nn = norm([Math.cos(a) * u * 0.6, Math.sin(a) * u * 0.6, 1]); return [[Math.cos(a) * r, Math.sin(a) * r, z], nn, nn]; }, nu, nv, DEEP, WET, 0);
  for (let i = 0; i < out.length; i += STRIDE) { const u = clamp(Math.hypot(out[i], out[i + 1]) / R, 0, 1), c = mixC(DEEP, LIT, u * u); out[i + 6] = c[0]; out[i + 7] = c[1]; out[i + 8] = c[2]; }
  for (let q = 0; q < 3; q++) {   // ripple crests: thin glossy rings
    const f = (ph + q / 3) % 1, rr = R * (0.18 + 0.72 * f), r = 1.5 * (1 - 0.55 * f), C = mixC(hex('#e8f7ff'), LIT, f * 0.6);
    grid(out, (i, j) => { const a = TAU * j / 44, b = TAU * i / 6, nn = norm([Math.cos(a) * Math.cos(b), Math.sin(a) * Math.cos(b), Math.sin(b)]), d = rr + r * Math.cos(b); return [[Math.cos(a) * d, Math.sin(a) * d, 1 + r * 0.7 * Math.sin(b)], nn, nn]; }, 44, 6, C, GLOSS, 0);
  }
  for (let k = 0; k < 18; k++) { const a = k / 18 * TAU + hsh(k) * 0.25, rr = rim(a) * (0.96 + hsh(k + 3) * 0.06); foam(out, [Math.cos(a) * rr, Math.sin(a) * rr, 1.2], 2.6 + hsh(k) * 2, a, mixC(hex('#ffffff'), hex('#e4f4ff'), hsh(k + 9))); }   // (foam round its rim)
  return out;
}
// a crown of water (radius ~22): a glossy dome, a ring of drops flung out with beads at their tips, foam at its foot
function crownMesh() {
  const out = [], C = hex('#8fd0f5'), HI = hex('#d8f2ff'), W = hex('#ffffff');
  lathe3(out, [[0, 19], [1.4, 17], [2.8, 11], [3.6, 4], [3.8, 0]], C, WET, 32, 0.8);
  for (let k = 0; k < 11; k++) { const a = k / 11 * TAU + hsh(k) * 0.25, h = hsh(k + 4), r1 = 20 + 5 * h, z1 = 9 + 8 * h; capsule(out, [Math.cos(a) * 14, Math.sin(a) * 14, 2.5], [Math.cos(a) * r1, Math.sin(a) * r1, z1], 2.1, C, WET, 0.8); ball(out, [Math.cos(a) * (r1 + 1.2), Math.sin(a) * (r1 + 1.2), z1 + 2.4], 2 + h * 0.6, HI, GLOSS, 0.7, 10, 7); }
  for (let k = 0; k < 12; k++) { const a = (k + 0.5) / 12 * TAU; ball(out, [Math.cos(a) * 17.5, Math.sin(a) * 17.5, 1.6], 2.8 + hsh(k + 7), W, MATTE, 0.5, 10, 7); }
  return out;
}
// the breach's spout: a 42-tall column (sy scales its height), streaks that turn with its frames, foam at the top
function spoutMesh() {
  const out = [], D = hex('#6fbdf0'), M = hex('#94d2f6'), L = hex('#d6f1ff'), W = hex('#ffffff');
  lathe3(out, [[0, 11], [6, 9.5], [18, 8], [30, 7], [38, 6.5], [41, 4], [42, 0]], D, WET, 28, 1);
  for (let i = 0; i < out.length; i += STRIDE) { const a = Math.atan2(out[i + 1], out[i]), q = ((a / TAU * 4 + out[i + 2] * 0.012) % 1 + 1) % 1, c = q < 0.18 ? L : q < 0.55 ? M : D; out[i + 6] = c[0]; out[i + 7] = c[1]; out[i + 8] = c[2]; }
  for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; ball(out, [Math.cos(a) * 6, Math.sin(a) * 6, 40 + hsh(k) * 3], 3.2 + hsh(k + 2), k % 2 ? W : L, MATTE, 0.6, 12, 8); }
  ball(out, [0, 0, 44], 4.5, W, MATTE, 0.6, 14, 9);
  return out;
}
// the wake (decal 60 by 36, stretched along the run): glossy water with foam lumps along the edges
function wakeMesh() {
  const out = [], L = 30, Wd = 18, nu = 24, nv = 6, C = hex('#7cc4ef'), LIT = hex('#b4e2fb');
  const half = x => Wd * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x) / L, 4)), 0.5);
  grid(out, (i, j) => { const x = -L + 2 * L * j / nu, v = -1 + 2 * i / nv, y = half(x) * v, z = 0.9 * (1 - v * v) + 0.15, nn = norm([0, -v * 0.4, 1]); return [[x, y, z], nn, nn]; }, nu, nv, C, WET, 0);
  for (let i = 0; i < out.length; i += STRIDE) { const v = Math.abs(out[i + 1]) / Wd, c = mixC(C, LIT, v); out[i + 6] = c[0]; out[i + 7] = c[1]; out[i + 8] = c[2]; }
  for (const s of [-1, 1]) for (let k = 0; k < 11; k++) { const x = -L + 4 + k * (2 * L - 8) / 10 + (hsh(k + s * 5) - 0.5) * 3; foam(out, [x, s * half(x) * 0.86, 1.1], 2.2 + hsh(k) * 1.4, 0, mixC(hex('#ffffff'), hex('#e6f5ff'), hsh(k))); }
  for (let k = 0; k < 5; k++) foam(out, [-L + 8 + k * 11, (hsh(k + 30) - 0.5) * 14, 1.2], 1.4 + hsh(k) * 0.8, 0, hex('#f4fbff'));
  return out;
}
defProp('dkwave', { mesh: waveMesh, n: 16, ink: '#1a5a96' });
defProp('dkswish', { mesh: swishMesh, n: 16, ink: '#4a8ec4', out: 0.4 });
defProp('dkpool', { mesh: poolMesh, n: 1, decal: true, ink: '#2a6fa8', r0: 40, states: Object.keys(RIP) });
defProp('dkcrown', { mesh: crownMesh, n: 4, ink: '#2a6fa8' });
defProp('dkspout', { mesh: spoutMesh, n: 6, sym: 4, ink: '#2a6fa8' });
defProp('dkwake', { mesh: wakeMesh, n: 8, sym: 2, decal: true, ink: '#2a6fa8' });
// the Swim's ripple line (x the way he swims): a low glossy hump, his dark back breaking it, V ripples off his nose
function swimMesh() {
  const out = [], W1 = hex('#4aa3e2'), DK = hex('#1d5fa6'), BACK = hex('#1462ad'), RIP = hex('#d6f1ff'), RIP2 = hex('#a8dcfa'), FOAM = hex('#ffffff');
  ellipsoid(out, [0, 0, 0.4], [[23, 0, 0], [0, 11, 0], [0, 0, 3.4]], W1, WET, 22, 10, 0.6);
  for (let i = 0; i < out.length; i += STRIDE) {   // (darker down its middle: his shape under the water)
    const x = out[i], y = out[i + 1], q = clamp(1 - (y / 7.5) ** 2 - ((x + 2) / 19) ** 2, 0, 1), c = mixC(W1, DK, Math.sqrt(q) * 0.85);
    out[i + 6] = c[0]; out[i + 7] = c[1]; out[i + 8] = c[2];
  }
  ellipsoid(out, [-1, 0, 2.6], [[9, 0, 0], [0, 4.6, 0], [0, 0, 2.6]], BACK, GLOSS, 16, 9, 1);   // his back breaking the surface
  for (const s of [-1, 1]) {
    tube(out, smoothProf([[21, s * 2.5, 1.4], [8, s * 10, 1.3], [-8, s * 17, 1.1], [-26, s * 23, 0.8]], 3), t => 1.7 - 1.1 * t, RIP, GLOSS, 0.4, 8);
    tube(out, smoothProf([[6, s * 7, 0.9], [-10, s * 15, 0.8], [-30, s * 27, 0.6]], 3), t => 1.2 - 0.8 * t, RIP2, GLOSS, 0.3, 7);
  }
  for (let k = 0; k < 7; k++) { const a = -1 + 2 * k / 6, p = [19 + 3 * Math.cos(a), 6 * Math.sin(a), 2 + hsh(k) * 0.8]; ball(out, p, 1.8 + hsh(k + 3) * 0.9, FOAM, MATTE, 0.5, 10, 7); }
  return out;
}
defProp('dkswim', { mesh: swimMesh, n: 16, ink: '#1a5a96' });
// a shipping container: a ten-footer 33 x 27 x 26 at scale 1 (about the sim's 30 square), corrugated steel, a framed
// Docker-blue edge, two doors with lock bars; turned 10° so a sliver of side shows
const mulC = (c, f) => c.map(x => clamp(x * f, 0, 1));
function turnZ(out, a) {   // (about z: positions, normals and, for the kit's kinds 7+, the hull normal)
  const c = Math.cos(a), s = Math.sin(a);
  for (let i = 0; i < out.length; i += STRIDE) for (const j of out[i + 9] > 6.5 ? [0, 3, 10] : [0, 3]) { const x = out[i + j], y = out[i + j + 1]; out[i + j] = x * c - y * s; out[i + j + 1] = x * s + y * c; }
  return out;
}
const BOXC = { blue: ['#3aa6f4', '#1b5fae'], coral: ['#f47f63', '#2496ed'], sunny: ['#f7c84b', '#2496ed'] };
const BOX_STATES = Object.keys(BOXC);
const BOX_H = 26;
function containerMesh(state) {
  const out = [], [bc, fc] = BOXC[state] || BOXC.blue, B = hex(bc), Fr = hex(fc), Rib = mulC(B, 0.9), Cast = mulC(Fr, 0.7), BAR = hex('#eef3f8');
  const L = 16.5, D = 13.5, Hh = BOX_H / 2;
  rbox(out, [0, 0, Hh], [L - 0.7, D - 0.7, Hh - 0.5], B, MATTE, 0.14);
  for (const s of [-1, 1]) for (let i = 0; i < 9; i++) { const x = -L + 3.4 + i * (2 * L - 6.8) / 8; rbox(out, [x, s * (D - 0.55), Hh], [0.8, 0.55, Hh - 2.6], Rib, MATTE, 0.35, 0); }   // (the corrugation)
  for (let i = 0; i < 5; i++) { const y = -D + 3.4 + i * (2 * D - 6.8) / 4; rbox(out, [-L + 0.5, y, Hh], [0.55, 0.85, Hh - 2.6], Rib, MATTE, 0.35, 0); }
  for (let i = 0; i < 4; i++) { const x = -L + 5 + i * (2 * L - 10) / 3; rbox(out, [x, 0, 2 * Hh - 0.45], [1.3, D - 2.4, 0.5], mulC(B, 1.06), MATTE, 0.35, 0); }   // (ridges over the roof)
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) rbox(out, [sx * (L - 1.2), sy * (D - 1.2), Hh], [1.45, 1.45, Hh], Fr, MATTE, 0.22);   // corner posts
  for (const sy of [-1, 1]) for (const z of [1.2, 2 * Hh - 1.2]) rbox(out, [0, sy * (D - 1.2), z], [L - 1, 1.25, 1.2], Fr, MATTE, 0.22);   // rails along
  for (const sx of [-1, 1]) for (const z of [1.2, 2 * Hh - 1.2]) rbox(out, [sx * (L - 1.2), 0, z], [1.25, D - 1, 1.2], Fr, MATTE, 0.22);  // and across
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const z of [1.2, 2 * Hh - 1.2]) rbox(out, [sx * (L - 1.2), sy * (D - 1.2), z], [1.75, 1.75, 1.35], Cast, MATTE, 0.25);   // corner castings
  rbox(out, [L - 0.2, 0, Hh], [0.4, 0.3, Hh - 2.6], mulC(B, 0.62), MATTE, 0.3, 0);   // the doors: a seam down the middle, four lock bars with their handles
  for (const y of [-9, -3.2, 3.2, 9]) {
    capsule(out, [L + 0.3, y, 3], [L + 0.3, y, 2 * Hh - 3], 0.55, BAR, GLOSS, 0.5);
    rbox(out, [L + 0.85, y + (y > 0 ? -1.3 : 1.3), Hh - 2.5], [0.45, 1.5, 0.55], BAR, GLOSS, 0.4, 0.4);
  }
  for (const y of [-D + 2.6, D - 2.6]) for (const z of [6, 2 * Hh - 6]) rbox(out, [L + 0.1, y, z], [0.5, 0.9, 1.1], mulC(Fr, 0.85), MATTE, 0.3, 0);
  return turnZ(out, 0.17);
}
defProp('dkbox', { mesh: containerMesh, n: 4, ink: '#1d2c44', states: BOX_STATES });
// his bits: water drops, foam, bubbles, and a puff of dust (light grey-white, like the fight's dust)
defBit('dkdrop', { mesh: () => { const out = []; ellipsoid(out, [0, 0, 0], [[2.2, 0, 0], [0, 2.2, 0], [0, 0, 2.8]], hex('#7cc6f2'), WET, 14, 10); return out; }, ink: '#1f5f96', out: 0.35, n: 1, r0: 2.5, splat: 1 });   // (splat: gone into the floor as it lands, no beads left lying about)
defBit('dkfoam', { mesh: () => { const out = []; for (let k = 0; k < 4; k++) { const a = k / 4 * TAU, r = k ? 2.2 : 0; ball(out, [Math.cos(a) * r, Math.sin(a) * r, k ? 0 : 0.8], k ? 2.2 : 2.9, hex('#ffffff'), MATTE, 0.6, 12, 8); } return out; }, ink: '#7fa9cc', r0: 4 });
defBit('dkbub', { mesh: () => { const out = []; ball(out, [0, 0, 0], 3, hex('#d4efff'), GLOSS, 0.6, 14, 10); M3.decal(out, [-1.2, -1.6, 1.8], [-0.4, -0.6, 0.7], 1, 0.6, 0.2, hex('#ffffff'), 0, 0, GLOSS); return out; }, ink: '#4a8ec4', n: 1, r0: 3 });
defBit('dkdust', { mesh: () => { const out = []; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU, rr = k ? 2.6 : 0; ball(out, [Math.cos(a) * rr, Math.sin(a) * rr, k ? (hsh(k) - 0.5) * 2 : 1], k ? 2.3 + hsh(k + 1) : 3.2, mixC(hex('#f1ede6'), hex('#ddd6ca'), hsh(k + 3)), MATTE, 0.5, 12, 8); } return out; }, ink: '#a49a8a', r0: 5 });
propsFor(ID, ['dkwave', 'dkswish', ...Object.keys(RIP).map(s => 'dkpool/' + s), 'dkcrown', 'dkspout', 'dkwake', ...BOX_STATES.map(st => 'dkbox/' + st), 'dkswim', 'puddle/water', 'bit:dkdrop', 'bit:dkfoam', 'bit:dkbub', 'bit:dkdust', 'bit:splinter', 'bit:rock']);
const P3 = (id, st) => propReady(id, st);

// effects played once for a thing (an object's id, a go's): v.dkOnce
function once(v, key) { const S = v.dkOnce || (v.dkOnce = new Set()); if (S.has(key)) return false; if (S.size > 200) S.clear(); S.add(key); return true; }
// every dt s per key (v.dkT)
function every(v, key, dt) { const T = v.dkT || (v.dkT = {}); if (v.t < (T[key] || 0)) return false; T[key] = v.t + dt; return true; }
const dust = (v, x, y, n, o = {}) => bits3(v, 'dkdust', x, y, 3, n, { speed: [30, 80], up: [20, 60], s: [3.4, 5.2], life: [0.5, 0.8], g: 40, drag: 2.4, grow: 0.7, fade: 'alpha', bo: 0, sp: 4, ...o });
const drops = (v, x, y, z, n, o = {}) => bits3(v, 'dkdrop', x, y, z, n, { speed: [40, 110], up: [140, 240], s: [1.6, 2.8], life: [0.5, 0.8], bo: 0, ...o });
// a wet puddle left on the floor, drying (v.dkPud: [x, y, r, t])
function puddle(v, x, y, r) { const L = v.dkPud || (v.dkPud = []); L.push([x, y, r, v.t]); if (L.length > 6) L.shift(); }

// ---------------------------------------------------------------- the 2D stand-ins (till the props are baked)
// the ripples where he dove (2D): rings spreading out (a light crest over a soft trough), a few bubbles
function ripples(g, x, y, t, k, churn) {
  g.save();
  for (let j = 0; j < 3; j++) {
    const q = (t * (0.9 + churn * 1.2) + j / 3) % 1, r = 8 + q * 32, a = (1 - q) * (0.5 + 0.4 * churn) * clamp(k / 0.1, 0, 1);
    g.strokeStyle = `rgba(30,70,120,${(0.32 * a).toFixed(3)})`; g.lineWidth = 3.4; g.beginPath(); g.ellipse(x, y + 1.2, r, r * 0.5, 0, 0, TAU); g.stroke();
    g.strokeStyle = `rgba(240,250,255,${(0.95 * a).toFixed(3)})`; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, r, r * 0.5, 0, 0, TAU); g.stroke();
  }
  g.fillStyle = `rgba(${WATER},0.5)`; g.beginPath(); g.ellipse(x, y, 17, 8.5, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(x - 4, y - 2, 7, 2.5, 0, 0, TAU); g.fill();
  for (let j = 0; j < 4 + Math.round(churn * 3); j++) {
    const q = (t * (1.4 + churn * 2) + hsh(j)) % 1, bx = x + (hsh(j * 3) - 0.5) * 22, by = y - q * 10, rb = 1 + 1.6 * q;
    g.strokeStyle = `rgba(245,252,255,${(0.85 * (1 - q)).toFixed(3)})`; g.lineWidth = 1; circle(g, bx, by, rb); g.stroke();
  }
  g.restore();
}
// the wave (2D): a band of water across its way, a white crest along its front (h its height, 0..1)
function wave2(g, o, h, a) {
  const BD = bold();
  g.save(); g.translate(o.x, o.y); g.rotate(o.a); g.globalAlpha *= a;
  g.fillStyle = BD ? '#3d9be0' : 'rgba(61,155,224,0.85)'; g.beginPath(); g.roundRect(-24, -WAVE_W, 34, WAVE_W * 2, 14); g.fill();
  g.fillStyle = BD ? '#9fdcfa' : 'rgba(170,224,250,0.9)'; g.beginPath(); g.roundRect(0, -WAVE_W + 4, 10, WAVE_W * 2 - 8, 5); g.fill();
  g.fillStyle = '#ffffff'; for (let k = 0; k < 9; k++) { circle(g, 10 + hsh(k) * 3, -WAVE_W + 8 + k * (WAVE_W * 2 - 16) / 8, 3.2 * h + 1); g.fill(); }
  g.restore();
}

// ---------------------------------------------------------------- the Tidal Wave (3D)
// the swell while he rears up: a wet pool spreading on the floor in front of him and a hump of water rising out of it
function swell3(g, F, v, o) {
  const f = F.f[o.owner]; if (!f) return;
  const mv = f.stats.moves.move2, u = clamp((o.t || 0) / mv.startup, 0, 1);
  decal3(g, 'dkpool', o.x + Math.cos(o.a) * 4, o.y + Math.sin(o.a) * 4, 22 + 16 * ease(u), { state: ['a', 'b', 'c'][Math.floor(v.t * 9) % 3], alpha: 0.75 * clamp(u * 3, 0, 1) });
  if (every(v, 'sb' + o.id, 0.09)) { const k = frnd(-1, 1) * 30; bit3(v, 'dkbub', o.x - Math.sin(o.a) * k, o.y + Math.cos(o.a) * k * 0.8, 1, { dz: frnd(20, 40), g: -30, drag: 1, s: frnd(1.4, 2.4), life: frnd(0.3, 0.5), fade: 'alpha', sh: false }); }
}
// the water welling up out of the pool (a crown of water rising, churning faster as he's about to slam)
function swellThing(g, v, o, f) {
  const u = clamp((o.t || 0) / f.stats.moves.move2.startup, 0, 1);
  g.save(); g.translate(o.x, o.y); drawProp3D(g, 'dkcrown', { frame: Math.floor(v.t * (6 + 10 * u)), sy: 0.12 + 0.75 * ease(u) + 0.06 * Math.sin(v.t * 16), scale: 0.6 + 0.35 * ease(u), alpha: 0.95 }); g.restore();
}
// the wave itself, rolling (or breaking: collapsing down into a splash); r its share of its run, for its growing in
function waveThing(g, v, o, f) {
  const mv = f.stats.moves.move2, rt = o.rt || 0, br = o.ph === 'break' ? clamp(((o.t || 0) - (o.bt || 0)) / 0.3, 0, 1) : 0;
  const grow = ease(rt / 0.16), sy = (0.35 + 0.65 * grow) * (1 - br * 0.92) * (1 + 0.04 * Math.sin(v.t * 11 + o.id)), sc = (0.75 + 0.25 * grow) * (1 + 0.12 * br) * (o.half / 46);
  g.save(); g.translate(o.x, o.y);
  const ok = drawProp3D(g, 'dkwave', { yaw: o.a, scale: sc, sy: Math.max(0.06, sy), alpha: 1 - br * br });
  g.restore();
  if (!ok) wave2(g, o, sy, 1 - br);
}
// the trail it leaves: streaks of foam drawn out behind it, spread to its width at the wave and narrowing back to where
// it set off, thinning and fading behind (a damp darker line under each: the wet floor)
function waveTrail(g, F, v, o) {
  const f = F.f[o.owner]; if (!f || o.x0 == null) return;
  const c = Math.cos(o.a), s = Math.sin(o.a), L = Math.max(0, (o.x - o.x0) * c + (o.y - o.y0) * s) - 8, br = o.ph === 'break' ? clamp(((o.t || 0) - (o.bt || 0)) / 0.45, 0, 1) : 0;
  if (L < 10) return;
  const BD = bold(), A = 1 - br, seed = (o.id || 1) * 3.1, n = 7, m = Math.max(4, Math.ceil(L / 9));
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  for (let k = 0; k < n; k++) {
    const lane = (k / (n - 1) - 0.5) * 1.7 * o.half * (0.85 + 0.15 * hsh(seed + k)), len = L * (0.55 + 0.45 * hsh(seed + k * 3)), ph = hsh(seed + k * 7) * TAU;
    const pt = q => { const d = L - len * q, w = 0.25 + 0.75 * Math.pow(1 - q, 0.7), wob = Math.sin(q * 7 + ph + v.t * 2.2) * 2.2 * q; return [o.x0 + c * d - s * (lane * w + wob), o.y0 + s * d + c * (lane * w + wob)]; };
    for (let j = 0; j < m; j++) {   // (in pieces: thinner and fainter further back)
      const q0 = j / m, q1 = (j + 0.8) / m, [x0, y0] = pt(q0), [x1, y1] = pt(q1), fade = A * Math.pow(1 - q0, 1.3), w = 3.6 * (1 - 0.75 * q0) * (0.75 + 0.5 * hsh(seed + k + j * 0.37));
      if (fade < 0.03) break;
      g.strokeStyle = `rgba(${BD ? '78,148,206' : '70,130,190'},${(0.22 * fade).toFixed(3)})`; g.lineWidth = w + 2.4;
      g.beginPath(); g.moveTo(x0, y0 + 1.2); g.lineTo(x1, y1 + 1.2); g.stroke();
      g.strokeStyle = `rgba(250,253,255,${((BD ? 0.9 : 0.8) * fade).toFixed(3)})`; g.lineWidth = w;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      if (hsh(seed + k * 11 + j) < 0.3) { g.fillStyle = `rgba(250,253,255,${(0.8 * fade).toFixed(3)})`; circle(g, x1 - s * 3.2, y1 + c * 3.2, w * 0.45); g.fill(); }   // (a fleck beside it)
    }
  }
  g.restore();
}

// ---------------------------------------------------------------- the Swim (3D)
// where he dived in (v.dkIn[i]: [x, y, t]): the ripple pool and his splash collapsing into it, fading
function diveSpot3(g, v, f) {
  const D = v.dkIn && v.dkIn[f.i]; if (!D) return;
  const age = v.t - D[2]; if (age >= 0.7) return;
  const u = age / 0.7;
  decal3(g, 'dkpool', D[0], D[1], 22 + 10 * ease(u), { state: ['a', 'b', 'c'][Math.floor(v.t * 9 + f.i) % 3], alpha: 0.85 * (1 - u * u) });
  if (age < 0.45 && P3('dkcrown')) { const q = age / 0.45; g.save(); g.translate(D[0], D[1]); drawProp3D(g, 'dkcrown', { frame: f.i, scale: 0.7 + 0.3 * ease(q), sy: Math.max(0.05, Math.sin(Math.PI * Math.min(1, q * 1.1))), alpha: 1 - q * q }); g.restore(); }
}
// the wake behind him (v.dkTr[i]: the points he swam through, [x, y, t]): foamy water along it, fading out behind
function swimTrail3(g, v, f) {
  const L = v.dkTr && v.dkTr[f.i]; if (!L || L.length < 2 || !P3('dkwake')) return;
  for (let j = 1; j < L.length; j++) {
    const [x0, y0, t0] = L[j - 1], [x1, y1] = L[j], k = (v.t - t0) / 0.9; if (k >= 1) continue;
    const d = Math.hypot(x1 - x0, y1 - y0); if (d < 4) continue;
    wakeDecal(g, (x0 + x1) / 2, (y0 + y1) / 2, Math.atan2(y1 - y0, x1 - x0), d + 8, 0.55 * (1 - k * k));
  }
}
// swimming: the ripple line racing along over him, bubbles rising in his wake (sparingly), the trail remembered
function swim3(g, v, f) {
  const L = (v.dkTr || (v.dkTr = [[], []]))[f.i] || (v.dkTr[f.i] = []), last = L[L.length - 1];
  if (!last || Math.hypot(last[0] - f.x, last[1] - f.y) > 14) { L.push([f.x, f.y, v.t]); if (L.length > 18) L.shift(); }
  const c = Math.cos(f.face), s = Math.sin(f.face), k = f.pht || 0;
  if (P3('dkswim')) { g.save(); g.translate(f.x, f.y); drawProp3D(g, 'dkswim', { yaw: f.face, scale: 1.05 * clamp(0.5 + k / 0.08, 0, 1), sy: 1 + 0.12 * Math.sin(v.t * 19 + f.i), alpha: 0.97 }); g.restore(); }
  else ripples(g, f.x, f.y, v.t, k, 0.6);
  if (P3('bit:dkbub') && every(v, 'bb' + f.i, 0.035)) { const r = frnd(-7, 7); bit3(v, 'dkbub', f.x - c * 16 - s * r, f.y - s * 16 + c * r * 0.8, 1, { dz: frnd(20, 45), g: -30, drag: 1, s: frnd(1.5, 2.6), life: frnd(0.4, 0.6), fade: 'alpha', sh: false }); }
  if (P3('bit:dkdrop') && every(v, 'bs' + f.i, 0.07)) { const side = frnd(0, 1) < 0.5 ? 1 : -1; bit3(v, 'dkdrop', f.x + c * 18 - s * side * 6, f.y + s * 18 + c * side * 5, 3, { dx: -s * side * frnd(40, 80) + c * 60, dy: (c * side * frnd(40, 80) + s * 60) * 0.8, dz: frnd(60, 120), s: frnd(1.3, 2), life: frnd(0.3, 0.45), g: 620, bo: 0 }); }
}
// he surfaces: a small spout of water under him and a small crown, the ripples fading
const SURF = 0.7;   // (the surfacing splash: smaller than a breach)
function surface3(g, v, f, k) {
  const u = clamp(k / 0.32, 0, 1);
  decal3(g, 'dkpool', f.x, f.y, 24 + 6 * ease(u), { state: ['a', 'b', 'c'][Math.floor(v.t * 10) % 3], alpha: 0.85 * (1 - u) });
  g.save(); g.translate(f.x, f.y);
  if (k < 0.26 && P3('dkspout')) { const q = k / 0.26, H = 10 + 18 * Math.sin(Math.PI * Math.min(1, q * 1.3)); drawProp3D(g, 'dkspout', { frame: v.t * 20, scale: 0.8, sy: Math.max(0.05, H / 42), alpha: 1 - q * q * q }); }
  if (P3('dkcrown')) drawProp3D(g, 'dkcrown', crownB(f, k));
  g.restore();
}
const crownB = (f, k) => { const u = clamp(k / 0.32, 0, 1); return { frame: f.i + 2, scale: (1.05 + 0.4 * ease(u)) * SURF, sy: Math.max(0.05, 0.85 * Math.sin(Math.PI * Math.min(1, u * 1.05))), alpha: 1 - u * u }; };

// a strip of the wake decal on the floor, len long along a (the wave's trail, the swim's)
function wakeDecal(g, x, y, a, len, al) {
  if (len < 6 || al <= 0.01) return true;
  const n = 8, st = TAU / 2 / n, aq = Math.round(a / st) * st;
  g.save(); g.translate(x, y); g.rotate(a); g.scale(len / 60, 1); g.rotate(-aq);
  const ok = drawProp3D(g, 'dkwake', { yaw: aq, alpha: al });
  g.restore(); return ok;
}
// ---------------------------------------------------------------- Compose Up (3D)
const BOX3 = () => P3('dkbox', 'blue') && P3('dkbox', 'coral') && P3('dkbox', 'sunny');
// which container: colour and face (laid along the wall, a quarter turn from him; the top one the other way)
const boxCol = (o, up = 0) => BOX_STATES[((o.k || 0) + 1 + up + (o.id || 0)) % 3];
const boxYaw = (o, up = 0) => Math.round(((o.a || 0) + Math.PI / 2) / (TAU / 4)) * TAU / 4 + (((o.k || 0) + up) % 2) * Math.PI;
function box3(g, o, z, s, a, up = 0, jx = 0) {
  g.save(); g.translate(o.x + jx, o.y - z);
  const ok = drawProp3D(g, 'dkbox', { state: boxCol(o, up), yaw: boxYaw(o, up), scale: s, alpha: a });
  g.restore(); return ok;
}
// a container in flat 2D (till baked): lit roof with a bright rounded edge, front in shade, soft ribs
function box2(g, o, z, H, a, up = 0, jx = 0) {
  const base = ['#3aa6f4', '#f47f63', '#f7c84b'][BOX_STATES.indexOf(boxCol(o, up))], M = mat(base), w = o.w, d = o.h * 0.7, x0 = o.x - w / 2 + jx, y0 = o.y - d / 2 - z, fy = y0 - H + d, ty = y0 - H;
  g.save(); g.globalAlpha *= a;
  const fg = g.createLinearGradient(0, fy, 0, fy + H); fg.addColorStop(0, mix(M.base, M.dark, 0.55)); fg.addColorStop(1, mix(M.dark, M.deep, 0.55));
  g.fillStyle = fg; g.beginPath(); g.roundRect(x0, fy - 3, w, H + 3, [0, 0, 3, 3]); g.fill();
  g.fillStyle = `rgba(${M.ao},0.2)`; for (let j = 1; j < 5; j++) g.fillRect(x0 + j * w / 5 - 0.8, fy + 3, 1.6, H - 6);
  g.fillStyle = rgba(M.hi, 0.18); for (let j = 1; j < 5; j++) g.fillRect(x0 + j * w / 5 - 2, fy + 3, 1.2, H - 6);
  const tg = g.createLinearGradient(x0, ty, x0 + w * 0.8, ty + d); tg.addColorStop(0, mix(M.lit, M.hi, 0.45)); tg.addColorStop(1, mix(M.lit, M.base, 0.5));
  g.fillStyle = tg; g.beginPath(); g.roundRect(x0, ty, w, d, 3); g.fill();
  const eg = g.createLinearGradient(0, fy - 3, 0, fy + 0.5); eg.addColorStop(0, rgba(M.hi, 0)); eg.addColorStop(1, rgba(M.hi, bold() ? 0.9 : 0.75));
  g.fillStyle = eg; g.fillRect(x0 + 1.5, fy - 3, w - 3, 3.5);
  const ug = g.createLinearGradient(0, fy + 0.5, 0, fy + 4); ug.addColorStop(0, `rgba(${M.ao},0.22)`); ug.addColorStop(1, `rgba(${M.ao},0)`);
  g.fillStyle = ug; g.fillRect(x0 + 0.5, fy + 0.5, w - 1, 3.5);
  g.restore();
}
// how long it's stood (up), how far it's sunk (0..1)
const upAge = o => o.ph === 'up' ? (o.t || 0) - (o.ut || 0) : 9;
const sunk = (o, F) => { const f = F.f[o.owner], mv = f && f.stats.moves.move3; return o.ph === 'sink' ? clamp(((o.t || 0) - (o.st || 0)) / ((mv && mv.sink) || 0.4), 0, 1) : 0; };
// the wall: two high (top a hair smaller); q how far it's risen (cut at the floor line), a settle bump, rattles, sinking
function wall3(g, F, v, o, q) {
  const s = o.w / 30 * 0.92, H = BOX_H * s, age = upAge(o), bump = age < 0.4 ? 2.4 * Math.exp(-age * 10) * Math.sin(age * 26) : 0;
  const sk = sunk(o, F), rise = (1 - q) * H * 2 + sk * H * 2 - bump, rat = (o.t || 0) - (o.ct ?? -9), jx = rat < 0.35 ? Math.sin(rat * 70) * 2.2 * (1 - rat / 0.35) : 0;
  const sa = clamp(1 - rise / H, 0, 1);   // (its soft shadow on the floor, as it stands clear of it)
  softShadow(g, o.x + 4, o.y + o.h * 0.32, o.w * 0.78, o.h * 0.4, 0.3 * sa);
  g.save();
  if (rise > 0.5) { g.beginPath(); g.rect(o.x - 80, o.y - 160, 160, 160 + o.h * 0.3); g.clip(); }   // (below the floor: hidden)
  if (BOX3()) { box3(g, o, -rise, s, 1, 0, jx); box3(g, o, H - rise, s * 0.96, 1, 1, jx * 1.4); }
  else { box2(g, o, -rise, H, 1, 0, jx); box2(g, o, H - rise, H, 1, 1, jx * 1.4); }
  g.restore();
}
// the tell on the floor: a soft square shadow on each spot, cracks spreading out from it as he stacks, grit jumping
function softSquare(g, x, y, s, a) {
  if (a <= 0.005) return;
  const q = s * 1.15, gr = g.createRadialGradient(0, 0, 0, 0, 0, q * 0.68);
  gr.addColorStop(0, 'rgba(18,24,48,' + a.toFixed(3) + ')'); gr.addColorStop(0.6, 'rgba(18,24,48,' + (a * 0.85).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(18,24,48,0)');
  g.save(); g.translate(x + 1.5, y + 1.5); g.fillStyle = gr; g.beginPath(); g.roundRect(-q / 2, -q / 2, q, q, q * 0.3); g.fill(); g.restore();
}
function wallMark(g, F, v, o) {
  if (o.off) return;
  const f = F.f[o.owner], mv = f && f.stats.moves.move3; if (!mv) return;
  const u = o.ph === 'mark' ? clamp((o.t || 0) / mv.startup, 0, 1) : 1, rq = o.ph === 'rise' ? clamp((o.rt || 0) / mv.rise, 0, 1) : 0;
  softSquare(g, o.x, o.y, o.w * (0.8 + 0.2 * u), (0.12 + 0.3 * u) * (1 - rq) * (0.9 + 0.1 * Math.sin(v.t * 9 + (o.k || 0))));
  cracks2(g, o.x, o.y + 1, o.w * (0.45 + 0.5 * ease(u)), (o.id || 1) * 2.3, 0.35 + 0.55 * u, 5);
  if (o.ph === 'mark' && P3('bit:rock') && every(v, 'wm' + o.id, 0.14 - 0.07 * u)) bit3(v, 'rock', o.x + frnd(-0.4, 0.4) * o.w, o.y + frnd(-0.3, 0.3) * o.w, 1, { dz: frnd(40, 90), g: 600, s: frnd(1, 1.6), life: frnd(0.3, 0.45), bo: 0.2 });
}
// the seam: as he stacks, a hairline crack creeps from under him to the spots (trunk to the middle, ends branching);
// on the slam, a hump of broken floor races along it spraying grit, arriving as the containers burst up
const SEAM_B = 0.62;   // (where the ends branch off the trunk)
function seamPath(F, v, o, f) {
  const S = v.dkSeam || (v.dkSeam = new Map());
  let st = S.get(o.id);
  if (o.ph === 'mark' || !st) {   // (his spot: followed while he stacks, kept from the slam on)
    const mid = F.objs.find(b => b.kind === 'dkBox' && b.owner === o.owner && b.ms === o.ms && b.k === 1 && !b.off) || o;
    st = [f.x + Math.cos(f.face) * 6, f.y + Math.sin(f.face) * 6 + 3, mid.x, mid.y];
    if (S.size > 60) S.clear(); S.set(o.id, st);
  }
  const [sx, sy, mx, my] = st, mid = o.k === 1 || (Math.abs(mx - o.x) < 1 && Math.abs(my - o.y) < 1);
  const pts = [], seed = (o.id || 1) * 3.1, jag = (ax, ay, bx, by, n, from) => {   // a jagged run from a to b
    const L = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / L, ny = (bx - ax) / L;
    for (let i = from; i <= n; i++) { const q = i / n, w = i === 0 || i === n ? 0 : (hsh(seed + i * 1.7) - 0.5) * Math.min(7, L * 0.06); pts.push([ax + (bx - ax) * q + nx * w, ay + (by - ay) * q + ny * w]); }
  };
  if (mid) jag(sx, sy, o.x, o.y + 2, 9, 0);
  else { const bx = sx + (mx - sx) * SEAM_B, by = sy + (my - sy) * SEAM_B; jag(sx, sy, bx, by, 6, 0); jag(bx, by, o.x, o.y + 2, 4, 1); }
  const len = [0]; for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, len, L: len[len.length - 1] || 1, from: mid ? 0 : len[6] };
}
// the path from d0 to d1 along it (d1 its head)
function seamTo(P, d0, d1 = P.L) {
  const at = d => { for (let i = 1; i < P.pts.length; i++) if (P.len[i] >= d || i === P.pts.length - 1) { const q = clamp((d - P.len[i - 1]) / Math.max(0.01, P.len[i] - P.len[i - 1]), 0, 1), a = P.pts[i - 1], b = P.pts[i]; return [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q]; } return P.pts[0]; };
  const out = [at(d0)];
  for (let i = 1; i < P.pts.length; i++) if (P.len[i] > d0 && P.len[i] < d1) out.push(P.pts[i]);
  out.push(at(d1)); return out;
}
function seamLine(g, pts, w, a) {
  if (a <= 0.01 || pts.length < 2) return;
  const run = (dx, dy, c, lw) => { g.strokeStyle = c; g.lineWidth = lw; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x + dx, y + dy) : g.moveTo(x + dx, y + dy)); g.stroke(); };
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  run(0.8, 1.1, `rgba(255,255,255,${(0.5 * a).toFixed(3)})`, w * 0.8 + 0.6);
  run(0, 0, `rgba(28,34,54,${(0.5 * a).toFixed(3)})`, w);
  if (w > 2) run(0, -0.3, `rgba(12,16,30,${(0.45 * a).toFixed(3)})`, w * 0.4);   // (the deep of it)
  g.restore();
}
function seam(g, F, v, o) {
  if (o.off) return;
  const f = F.f[o.owner], mv = f && f.stats.moves.move3; if (!mv) return;
  const P = seamPath(F, v, o, f), from = P.from;   // (a side spot: only its branch is its own; the trunk is the middle one's)
  if (o.ph === 'mark') {   // creeping out as he stacks
    const u = clamp((o.t || 0) / mv.startup, 0, 1), d = P.L * ease(u / 0.85);
    if (d > from) seamLine(g, seamTo(P, from, d), 1, 0.15 + 0.35 * u);
    return;
  }
  if (o.ph === 'rise') {   // the heave racing out along it
    const q = clamp((o.rt || 0) / mv.rise, 0, 1), d = P.L * Math.min(1, ease(q / 0.8)), head = seamTo(P, from, Math.max(from, d)), [hx, hy] = head[head.length - 1];
    seamLine(g, seamTo(P, from), 1, 0.5);
    if (d > from) seamLine(g, head, 2.6, 0.9);
    if (d > from && q < 0.85) {   // the hump at its head: the floor lifted, lit on its top left, its shadow down-right
      const a = 1 - ease((q - 0.6) / 0.25), s = 7 + 3 * Math.sin(q * 30);
      g.save();
      softShadow(g, hx + 2, hy + 2, s * 1.5, s * 0.7, 0.26 * a);
      g.fillStyle = `rgba(255,252,244,${(0.3 * a).toFixed(3)})`; g.beginPath(); g.ellipse(hx - 1, hy - 1.5, s * 0.9, s * 0.4, 0, 0, TAU); g.fill();
      g.restore();
      if (P3('bit:rock') && every(v, 'sm' + o.id, 0.03)) bit3(v, 'rock', hx + frnd(-3, 3), hy + frnd(-2, 2), 2, { dz: frnd(60, 120), dx: frnd(-40, 40), dy: frnd(-30, 20), g: 600, s: frnd(1, 1.7), life: frnd(0.3, 0.45), bo: 0.2 });
      if (P3('bit:dkdust') && every(v, 'sd' + o.id, 0.06)) dust(v, hx, hy, 1, { speed: [10, 30], up: [20, 40], s: [2.4, 3.4], life: [0.35, 0.5] });
    }
    return;
  }
  if (o.ph === 'up') { const a = 1 - ease(upAge(o) / 1.2); if (a > 0.01) seamLine(g, seamTo(P, from), 2.6 - 1.4 * ease(upAge(o) / 0.6), 0.9 * a); }
}

// ---------------------------------------------------------------- the Tail Slap (3D)
// the swing's share now and the screen angle of his tail (turned toward the camera like draw-fight.js's model, so the
// spray stays on the flukes)
const slapU = f => clamp((f.t || 0) / Math.max(0.05, f.dur || 0.18), 0, 1);
const camTurn = a => 0.35 * Math.sin(Math.PI / 2 - a);
// the crescent's radius: the slap's real reach (what you see is what hits)
const swishR = f => (f.r || 20) + (f.stats ? f.stats.moves.move1.reach : 50) - 4;
// the crescent of spray whipping round behind his flukes (all of it before him; its near half again after him)
function swish3(g, v, f, front) {
  if (!P3('dkswish')) return;
  const u = slapU(f), a = tailAt(f, u) + camTurn(f.face), al = Math.sin(Math.PI * clamp(u * 1.15, 0, 1)) * 0.95;
  if (al < 0.03) return;
  g.save();
  if (front) { g.beginPath(); g.rect(f.x - 90, f.y - 1, 180, 90); g.clip(); }
  g.translate(f.x, f.y); drawProp3D(g, 'dkswish', { yaw: a, scale: swishR(f) / 40, alpha: al }); g.restore();
}

// ---------------------------------------------------------------- the marks a move leaves, and the open looks
// a 2D crown of water (h 0..1 rise and fall, s size): jets fanning up off a foamy foot, white beads at the tips
function crown2(g, x, y, s, h, a, seed = 1) {
  if (h <= 0.02 || a <= 0.01) return;
  const BD = bold(), D = BD ? '#3d9be0' : 'rgba(61,155,224,0.9)', L = BD ? '#a8e2fb' : 'rgba(168,226,251,0.92)';
  g.save(); g.globalAlpha *= a;
  g.fillStyle = BD ? '#7cc6f2' : 'rgba(124,198,242,0.6)'; g.beginPath(); g.ellipse(x, y, 16 * s, 6.5 * s, 0, 0, TAU); g.fill();   // (the churned water at its foot)
  for (let k = 0; k < 7; k++) {
    const q = (k + 0.5) / 7, an = -Math.PI * (0.12 + 0.76 * q) + (hsh(seed + k) - 0.5) * 0.2, len = (16 + 10 * Math.sin(q * Math.PI) + 5 * hsh(seed + k * 3)) * s * h, w = (2.6 + 1.2 * Math.sin(q * Math.PI)) * s;
    const bx = x + Math.cos(an) * 6 * s, by = y + Math.sin(an) * 2.4 * s, tx = x + Math.cos(an) * (6 * s + len * 0.7), ty = y + Math.sin(an) * len;
    g.fillStyle = q < 0.5 ? L : D; g.beginPath(); g.moveTo(bx - w, by); g.quadraticCurveTo((bx + tx) / 2 - w * 0.6, (by + ty) / 2, tx, ty); g.quadraticCurveTo((bx + tx) / 2 + w * 0.6, (by + ty) / 2, bx + w, by); g.closePath(); g.fill();
    g.fillStyle = '#ffffff'; circle(g, tx, ty, w * 0.75); g.fill();
  }
  g.fillStyle = '#ffffff'; for (let k = 0; k < 6; k++) { const an = k / 6 * TAU + seed; circle(g, x + Math.cos(an) * 13 * s, y + Math.sin(an) * 5 * s, (2 + hsh(seed + k)) * s); g.fill(); }   // (foam round it)
  g.restore();
}
// a sheet of water flung off the tail where it lands (the slap's hit): jets fanning out along a (screen), z up, k its age
function sheet2(g, x, y, a, s, k) {
  const BD = bold(), out = ease(k / 0.35), al = 1 - clamp((k - 0.3) / 0.7, 0, 1), c = Math.cos(a), sn = Math.sin(a) * 0.8;
  if (al <= 0.01) return;
  g.save(); g.globalAlpha *= al;
  for (let j = 0; j < 7; j++) {
    const q = (j + 0.5) / 7 - 0.5, b = Math.atan2(sn, c) + q * 1.7, len = (22 + 14 * (1 - Math.abs(q) * 1.6) + 6 * hsh(j)) * s * out, w = (3.2 - Math.abs(q) * 2.4) * s * (1 - 0.5 * out);
    const drop = 26 * k * k * s, tx = x + Math.cos(b) * len, ty = y + Math.sin(b) * len * 0.8 + drop;
    g.fillStyle = BD ? (j % 2 ? '#47a9e8' : '#a8e2fb') : (j % 2 ? 'rgba(71,169,232,0.9)' : 'rgba(168,226,251,0.92)');
    g.beginPath(); g.moveTo(x - Math.sin(b) * w, y + Math.cos(b) * w); g.quadraticCurveTo((x + tx) / 2, (y + ty) / 2 - 4 * s, tx, ty); g.lineTo(x + Math.sin(b) * w, y - Math.cos(b) * w); g.closePath(); g.fill();
    g.fillStyle = '#ffffff'; circle(g, tx, ty, Math.max(0.8, w * 0.8)); g.fill();
  }
  g.fillStyle = '#ffffff'; g.globalAlpha *= 1 - out; circle(g, x, y, 7 * s); g.fill();   // (the white of the hit itself, opening out)
  g.restore();
}
// an uneven wet patch (rx along, ry across, turned rot; seed: its shape): a wobbly outline, never an oval
function splat(g, x, y, rx, ry, rot, seed) {
  const c = Math.cos(rot), s = Math.sin(rot), N = 9, P = [];
  for (let j = 0; j < N; j++) { const a = j / N * TAU, q = 0.62 + 0.5 * hsh(seed + j * 1.9); P.push([x + (Math.cos(a) * rx * c - Math.sin(a) * ry * s) * q, y + (Math.cos(a) * rx * s + Math.sin(a) * ry * c) * q * 0.9]); }
  g.beginPath(); g.moveTo((P[N - 1][0] + P[0][0]) / 2, (P[N - 1][1] + P[0][1]) / 2);
  for (let j = 0; j < N; j++) { const p = P[j], n = P[(j + 1) % N]; g.quadraticCurveTo(p[0], p[1], (p[0] + n[0]) / 2, (p[1] + n[1]) / 2); }
  g.closePath();
}
// a wet splatter where the tail swept (from a0 through sw rad, out to its reach), drying (a): soft splashes, no line
function wetArc(g, x, y, R, a0, sw, a) {
  if (a <= 0.01 || Math.abs(sw) < 0.05) return;
  const lo = Math.min(a0, a0 + sw), hi = Math.max(a0, a0 + sw), E = 0.9, n = Math.max(2, Math.round((hi - lo) / TAU * 18));
  g.save();
  for (let k = 0; k < n; k++) {
    const an = lo + (hi - lo) * (k + 0.5) / n, j = hsh(k * 1.7 + 3), rr = R - 4 + 9 * (j - 0.5), r = (4.6 + 4.4 * hsh(k * 2.3)) * (0.75 + 0.25 * a), px = x + Math.cos(an) * rr, py = y + Math.sin(an) * rr * E;
    g.fillStyle = `rgba(52,96,140,${(0.17 * a).toFixed(3)})`; splat(g, px, py, r * 1.35, r * 0.8, an + Math.PI / 2, k * 5.3); g.fill();
    if (j > 0.62) { g.fillStyle = `rgba(225,245,255,${(0.55 * a).toFixed(3)})`; g.beginPath(); g.ellipse(px - r * 0.3, py - r * 0.3, r * 0.45, r * 0.2, -0.4, 0, TAU); g.fill(); }
    if (hsh(k + 9) > 0.55) { const d = R + 5 + 7 * hsh(k + 4); g.fillStyle = `rgba(52,96,140,${(0.2 * a).toFixed(3)})`; circle(g, x + Math.cos(an + 0.05) * d, y + Math.sin(an + 0.05) * d * E, 1 + hsh(k + 2) * 1.3); g.fill(); }
  }
  g.restore();
}
// the Tail Slap's tell: as he cocks his tail (u 0..1 of the twist), the water stirs under it: a wet patch spreading
// out to the real reach, darkest and most churned behind him where the tail is, foam swirling round in it the way the
// tail will go, a few ripples breaking near the tail (a0: the tail's side)
function stir2(g, x, y, R, tip, u, seed, a0) {
  if (u <= 0.02) return;
  const BD = bold(), E = 0.9, e = ease(u), al = clamp(u / 0.35, 0, 1), r1 = R * e, N = 28;
  g.save();
  // the wet patch: an uneven blob out to the reach, darker where the tail is (soft edge in Classic)
  const rr = j => r1 * (0.86 + 0.14 * hsh(seed + j * 1.3)) * (0.7 + 0.3 * (0.5 + 0.5 * Math.cos(j / N * TAU - a0)));
  const blob = () => { g.beginPath(); for (let j = 0; j <= N; j++) { const an = j / N * TAU, r = rr(j % N); g.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r * E); } g.closePath(); };
  g.fillStyle = BD ? `rgba(50,135,225,${(0.07 * al).toFixed(3)})` : `rgba(60,145,230,${(0.06 * al).toFixed(3)})`; blob(); g.fill();
  g.fillStyle = `rgba(60,125,190,${(0.06 * al).toFixed(3)})`;
  g.beginPath(); g.ellipse(x + Math.cos(a0) * r1 * 0.45, y + Math.sin(a0) * r1 * 0.45 * E, r1 * 0.45, r1 * 0.3, a0, 0, TAU); g.fill();
  // foam swirling round in it: short tapered white swooshes, thickest behind him, turning the tail's way
  g.lineCap = 'round';
  for (let j = 0; j < 9; j++) {
    const h = hsh(seed * 3 + j), back = 0.5 + 0.5 * Math.cos(j / 9 * TAU - 0.4), an = a0 + (j / 9 - 0.5) * 3.6 + u * 1.6 + h * 0.3, r = r1 * (0.45 + 0.45 * hsh(seed + j * 2.7)), L = 0.25 + 0.25 * h;
    if (r < 6) continue;
    g.strokeStyle = BD ? '#e8f7ff' : 'rgba(240,250,255,0.9)'; g.globalAlpha = al * (0.35 + 0.55 * back);
    g.lineWidth = 1.4 + 1.6 * back; g.beginPath(); g.ellipse(x, y, r, r * E, 0, an, an + L); g.stroke();
    g.strokeStyle = BD ? '#5fb3ea' : 'rgba(80,165,230,0.8)'; g.lineWidth = 1; g.beginPath(); g.ellipse(x, y + 1.2, r, r * E, 0, an + 0.04, an + L * 0.8); g.stroke();
  }
  g.globalAlpha = 1;
  g.restore();
}
// his blowhole while winded (a missed wave or slap; u 0..1 of the open time): two misty jets in a V that die down
function blow(g, v, f, u) {
  const left = 1 - u; if (left <= 0.02) return;
  const yaw = f.face + 0.35 * Math.sin(Math.PI / 2 - f.face), bx = Math.cos(yaw) * 21, by = -23 + Math.sin(yaw) * 3, BD = bold();
  const beat = ((f.t || 0) * 3.6) % 1, H = (10 + 22 * left) * Math.sin(Math.PI * Math.min(1, beat * 1.35)), w = 1.6 + 1.8 * left;
  if (H > 0.8) {
    g.save(); g.lineCap = 'round';
    for (const [col, dx, dy, wm] of [[BD ? '#9fd6f7' : 'rgba(150,206,240,0.9)', 0.8, 0.8, 1.25], ['#ffffff', 0, 0, 1]]) {   // (a pale blue shade, the white over it)
      for (const s of [-1, 1]) {
        const tx = bx + s * H * 0.38 + dx, ty = by - H + dy;
        g.strokeStyle = col; g.lineWidth = w * wm; g.beginPath(); g.moveTo(bx + dx, by + dy); g.quadraticCurveTo(bx + s * H * 0.08 + dx, by - H * 0.6 + dy, tx, ty); g.stroke();
        g.fillStyle = col; for (let k = 0; k < 3; k++) { circle(g, tx + s * (k - 1) * w * 0.9, ty - (k === 1 ? w * 0.7 : 0), w * (k === 1 ? 1.2 : 0.95) * wm); g.fill(); }
      }
    }
    g.restore();
  }
  if (beat < 0.12 && P3('bit:dkdrop') && every(v, 'bh' + f.i, 0.2)) for (const s of [-1, 1]) bit3(v, 'dkdrop', f.x + bx + s * 4, f.y + 2, 28 + H, { dx: s * frnd(20, 40), dy: frnd(-8, 8), dz: frnd(20, 50) * left, s: frnd(1.2, 1.7), life: 0.4, g: 520, bo: 0 });
}

const OPEN_PH = { wipe: 1, unwind: 1 };   // (his open settles: the blowhole)

const CUES = new WeakMap();   // (per fight: each Docky's phase last frame)
export default {
  id: ID,
  anim(F, v, f) {
    const A = animBase(), k = f.pht || 0, t = v.t + f.i, sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
    switch (f.ph) {
      case 'swell': { const u = clamp(k / Math.max(0.1, f.dur || 0.38), 0, 1); sq(-0.08 * ease(u / 0.6)); A.hop = 3 * ease(u / 0.5); A.fwd = -2.5 * ease(u); if (u > 0.7) A.wx = Math.sin(t * 40) * 0.5; break; }   // up tall, flippers high, a tremble as it peaks
      case 'surge': { const e = Math.exp(-k * 9); sq(0.16 * e * Math.cos(k * 20)); A.fwd = 5 * ease(k / 0.08); A.hop = 3 * Math.max(0, 1 - k / 0.06); break; }   // the slam: down hard, a squash springing back
      case 'coil': { const u = clamp(k / Math.max(0.05, f.dur || 0.2), 0, 1); sq(0.12 * ease(u)); A.spin = -0.7 * ease(u); A.fwd = -2.5 * ease(u); A.lean = -0.06 * ease(u); if (u > 0.6) A.wx = Math.sin(t * 46) * 0.7 * (u - 0.6) / 0.4; break; }   // the twist the other way, wound up and squashed down, his tail cocked back high; a tremble as it's loaded
      case 'slap': { const u = slapU(f); A.spin = TAU * u - 0.45 * (1 - ease(u / 0.25)); sq(-0.07 * Math.sin(Math.PI * u)); A.hop = 5 * Math.sin(Math.PI * u); A.lean = 0.05 * Math.sin(Math.PI * u); break; }   // the whole whale spinning round, up off his feet a touch
      case 'follow': case 'unwind': {   // the settle: the spin carries on a little and he unwinds back into his stance
        const miss = f.ph === 'unwind', d = f.dur || (miss ? 0.62 : 0.3);
        Object.assign(A, settleAnim(k, d, 'slap', miss ? 0.26 : 0.12));
        A.spin = (miss ? 0.7 : 0.35) * Math.sin(Math.PI * clamp(k / (miss ? 0.45 : 0.22), 0, 1)) * Math.exp(-k * 3);
        break;
      }
      case 'surf': { A.hop = 9 + 2.2 * Math.sin(k * 11); A.fwd = 3; A.lean = 0.05 * Math.sin(k * 7); sq(0.03 * Math.sin(k * 11)); break; }   // riding the wave: up on its back, bobbing with it
      case 'land': case 'wipe': {   // down off the wave where it breaks: a calm landing; caught nobody, a longer settle (no daze)
        const miss = f.ph === 'wipe', d = f.dur || (miss ? 0.6 : 0.22);
        Object.assign(A, settleAnim(k, d, 'surge', miss ? 0.3 : 0.1));
        A.hop = 9 * Math.max(0, 1 - k / 0.1); A.fwd = 3 + (miss ? 4 : 2) * ease(k / 0.25) - (miss ? 3 : 2) * ease((k - 0.25) / 0.3);
        break;
      }
      case 'stack': { const u = clamp(k / Math.max(0.1, f.dur || 0.4), 0, 1); A.hop = Math.abs(Math.sin(k * 12)) * 1.6 * (1 - u * 0.5); sq(-0.04 * ease(u) + 0.02 * Math.sin(k * 24)); if (u > 0.7) A.wx = Math.sin(t * 40) * 0.5; break; }   // the tower piling up on his back
      case 'build': { const e = Math.exp(-k * 10); sq(0.12 * e * Math.cos(k * 20)); A.fwd = 3 * ease(k / 0.08); A.hop = 2 * Math.max(0, 1 - k / 0.06); break; }   // flippers slammed down: the wall goes up
      case 'swim': A.alpha = 0; break;   // (under the water: the ripple line, behind())
      case 'surface': { const u = clamp(k / 0.28, 0, 1); A.hop = Math.sin(u * Math.PI) * 7; sq(-0.08 * (1 - u)); A.mood = 'happy'; break; }   // (up out of the water, a little bob)
      default: return null;
    }
    return A;
  },
  ground(g, F, v, o) {
    if (o.kind === 'dkWave') {
      if (o.ph === 'swell') swell3(g, F, v, o);
      else waveTrail(g, F, v, o);
    } else if (o.kind === 'dkBox' && (o.ph === 'mark' || o.ph === 'rise')) { seam(g, F, v, o); wallMark(g, F, v, o); }
    else if (o.kind === 'dkBox' && o.ph === 'up' && upAge(o) < 1.2) seam(g, F, v, o), cracks2(g, o.x, o.y + 2, o.w * 0.95, (o.id || 1) * 2.3, 0.9 * (1 - ease(upAge(o) / 1.2)), 5);   // (the cracks it burst out of, fading)
  },
  things(F, v, g, o, out) {
    if (o.kind === 'dkBox') {   // the wall rising out of the floor, standing, sinking back
      if (o.off) return;
      const f = F.f[o.owner], mv = f && f.stats.moves.move3; if (!mv) return;
      if (o.ph === 'mark') {   // its roof breaking the floor as he stacks, nudging up and rattling, following them: something's coming up there
        const u = clamp((o.t || 0) / mv.startup, 0, 1), q = 0.11 * ease((u - 0.2) / 0.8);
        if (q > 0.005) out.push({ y: o.y + o.h / 2 - 2, d: () => { g.save(); g.translate(Math.sin(v.t * 55 + (o.k || 0) * 2) * 0.8 * u, 0); wall3(g, F, v, o, q); g.restore(); } });
        return;
      }
      const q = o.ph === 'rise' ? ease(clamp((o.rt || 0) / mv.rise, 0, 1)) : 1;
      if (o.ph === 'rise' && once(v, 'dkr' + o.id) && P3('bit:dkdust')) dust(v, o.x, o.y + o.h * 0.3, 3, { r: o.w * 0.5, speed: [30, 60], up: [30, 60], s: [3, 4.2] });
      out.push({ y: o.y + o.h / 2 - 2, d: () => wall3(g, F, v, o, q) });
      return;
    }
    if (o.kind !== 'dkWave') return;
    const f = F.f[o.owner]; if (!f) return;
    if (o.ph === 'swell') { if (P3('dkcrown')) out.push({ y: o.y, d: () => swellThing(g, v, o, f) }); return; }
    // rolling: spray flung up off its lip, foam left churning behind it (sparingly)
    if (o.ph === 'roll' && P3('bit:dkdrop')) {
      const c = Math.cos(o.a), s = Math.sin(o.a);
      if (every(v, 'ws' + o.id, 0.05)) { const k = frnd(-0.9, 0.9) * o.half; bit3(v, 'dkdrop', o.x + c * 12 - s * k, o.y + s * 12 + c * k, 34 * (1 - Math.abs(k) / o.half * 0.7), { dx: c * frnd(150, 260) + frnd(-20, 20), dy: s * frnd(150, 260) * 0.8, dz: frnd(60, 140), s: frnd(1.6, 2.6), life: frnd(0.4, 0.6), g: 620, bo: 0 }); }
      if (P3('bit:dkfoam') && every(v, 'wf' + o.id, 0.11)) { const k = frnd(-0.8, 0.8) * o.half; bit3(v, 'dkfoam', o.x - c * 22 - s * k, o.y - s * 22 + c * k, 1, { dx: c * 40, dy: s * 32, dz: 10, g: 120, s: frnd(2.6, 3.6), life: 0.6, fade: 'alpha' }); }
    }
    out.push({ y: o.y - 8, d: () => waveThing(g, v, o, f) });   // (a touch behind whoever's at its front: the one it carries rides it)
  },
  floor(g, F, v) {
    const L = v.dkPud;   // the puddles a wave or a breach left, drying
    if (L) for (const [x, y, r, t0] of L) { const a = (v.t - t0) / 1.8; if (a >= 0 && a < 1 && !decal3(g, 'puddle', x, y, r, { state: 'water', alpha: 0.75 * (1 - ease(a)) })) { g.fillStyle = `rgba(${WATER},${(0.35 * (1 - a)).toFixed(3)})`; g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, TAU); g.fill(); } }
    // the Tail Slap's tell: the water stirring out to its reach as he cocks his tail back
    for (const f of F.f) if (f.id === ID && f.ph === 'coil' && f.move === 'move1') { const M = f.stats.moves.move1; stir2(g, f.x, f.y, swishR(f), f.r + M.tip, clamp((f.pht || 0) / Math.max(0.05, M.startup), 0, 1), (f.ms || 1) * 1.7, f.face + Math.PI + camTurn(f.face)); }
    // the Tail Slap's wet ring: swept round under the tail as it swings, out to its reach, then left drying where he stood
    const W = v.dkArc || (v.dkArc = []), live = v.dkArcL || (v.dkArcL = {});
    for (const f of F.f) {
      if (f.id !== ID) continue;
      const on = f.ph === 'slap' && f.move === 'move1', l = live[f.i];
      if (on) { const a0 = f.face + Math.PI + camTurn(f.face); live[f.i] = { x: f.x, y: f.y, R: swishR(f), a0, sw: TAU * slapU(f), ms: f.ms }; }
      else if (l) { W.push([l.x, l.y, l.R, l.a0, l.sw, v.t]); if (W.length > 4) W.shift(); delete live[f.i]; }
      const n = live[f.i]; if (n) wetArc(g, n.x, n.y, n.R, n.a0, n.sw, 1);
    }
    for (const [x, y, R, a0, sw, t0] of W) { const k = (v.t - t0) / 0.9; if (k >= 0 && k < 1) wetArc(g, x, y, R, a0, sw, 1 - ease(k)); }
  },
  behind(g, F, v, f) {
    if (f.id !== ID) return null;
    swimTrail3(g, v, f); diveSpot3(g, v, f);
    if (f.ph === 'swim' && f.move === 'evade') { swim3(g, v, f); return 'hide'; }
    if (f.ph === 'surface' && P3('dkpool', 'a')) surface3(g, v, f, f.pht || 0);
    if (f.ph === 'slap') swish3(g, v, f, false);
    if (f.ph === 'coil' && P3('bit:dkdrop') && every(v, 'cl' + f.i, 0.022)) {   // the twist: water streaming off his flukes as he cocks his tail back high
      const a = f.face + Math.PI + camTurn(f.face) - 0.7 * ease((f.pht || 0) / 0.2), r = f.r + 12;
      bit3(v, 'dkdrop', f.x + Math.cos(a) * r, f.y + Math.sin(a) * r * 0.85, 26, { dx: Math.cos(a) * frnd(20, 50), dy: Math.sin(a) * frnd(20, 50) * 0.8, dz: frnd(60, 120), s: frnd(1.3, 2), life: frnd(0.3, 0.45), g: 620, bo: 0 });
    }
    if (f.ph === 'surf' && P3('bit:dkdrop') && every(v, 'sf' + f.i, 0.05)) {   // riding: spray off his flukes and belly, foam at his tail
      const c = Math.cos(f.face), s = Math.sin(f.face), side = frnd(0, 1) < 0.5 ? 1 : -1;
      bit3(v, 'dkdrop', f.x - c * 14 - s * side * 12, f.y - s * 14 + c * side * 10, 10, { dx: -s * side * frnd(50, 110) - c * 40, dy: (c * side * frnd(50, 110) - s * 40) * 0.8, dz: frnd(70, 140), s: frnd(1.5, 2.4), life: frnd(0.35, 0.5), g: 620, bo: 0 });
      if (P3('bit:dkfoam') && frnd(0, 1) < 0.4) bit3(v, 'dkfoam', f.x - c * 22, f.y - s * 22, 1, { dx: -c * 30, dy: -s * 24, dz: 10, g: 120, s: frnd(2.4, 3.4), life: 0.5, fade: 'alpha' });
    }
    if (f.ph === 'slap' && P3('bit:dkdrop') && every(v, 'sl' + f.i, 0.03)) {   // drops flung off his flukes as they whip round
      const a = tailAt(f, slapU(f)) + camTurn(f.face), r = swishR(f), ta = a + Math.PI / 2;
      bit3(v, 'dkdrop', f.x + Math.cos(a) * r, f.y + Math.sin(a) * r * 0.85, 14, { dx: Math.cos(ta) * frnd(120, 200) + Math.cos(a) * 40, dy: (Math.sin(ta) * frnd(120, 200) + Math.sin(a) * 40) * 0.8, dz: frnd(40, 110), s: frnd(1.5, 2.3), life: frnd(0.35, 0.5), g: 620, bo: 0 });
    }
    return null;
  },
  over(g, F, v, f) {
    // caught in his wave: white water churning round their feet (its near half, over them)
    for (const o of F.objs) if (o.kind === 'dkWave' && o.carry === f.i && o.ph === 'roll' && P3('dkcrown')) {
      g.save(); g.translate(0, f.z || 0); g.beginPath(); g.rect(-90, -3, 180, 90); g.clip();
      drawProp3D(g, 'dkcrown', { frame: Math.floor(v.t * 12), scale: 0.62, sy: 0.55 + 0.12 * Math.sin(v.t * 21), alpha: 0.95 }); g.restore();
    }
    if (f.id !== ID) return;
    if (OPEN_PH[f.ph] && f.state === 'recover') blow(g, v, f, clamp((f.t || 0) / Math.max(0.1, f.dur || 0.6), 0, 1));   // (winded: his blowhole sputtering, dying down as he gets his breath back)
    if (f.ph === 'slap') { g.save(); g.translate(-f.x, -f.y + (f.z || 0)); swish3(g, v, f, true); g.restore(); }   // (the spray's near half, over him)
    if (f.ph === 'surface' && P3('dkcrown') && (f.pht || 0) < 0.32) {   // the crown's near side over him (at the floor: his bob undone)
      const k = f.pht || 0; g.save(); g.translate(0, Math.sin(clamp(k / 0.28, 0, 1) * Math.PI) * 7 + (f.z || 0));
      g.beginPath(); g.rect(-90, -2, 180, 90); g.clip(); drawProp3D(g, 'dkcrown', crownB(f, k)); g.restore();
    }
  },
  event(v, F, e, few) {
    const D3 = P3('bit:dkdust'), W3 = P3('bit:dkdrop'), f = F.f[e.who] || {};
    switch (e.kind) {
      case 'dkSurge': {   // the slam: water thrown up off his flippers, the wave setting off
        const a = e.a ?? f.face ?? 0, c = Math.cos(a), s = Math.sin(a);
        if (W3) drops(v, e.x + c * 26, e.y + s * 20, 10, few ? 4 : 8, { dir: a, spread: 2.2, speed: [60, 140], up: [120, 220] });
        else puff(v, e.x + c * 20, e.y, few ? 2 : 3, null);
        return true;
      }
      case 'dkCatch': if (W3) drops(v, e.x, e.y, 16, few ? 3 : 6, { speed: [40, 100], up: [120, 220] }); else puff(v, e.x, e.y, 2, null); return true;   // (they're swept up)
      case 'dkBreak': {   // it crashes down: a big splash, foam and drops everywhere, a puddle left
        { const a = e.a || 0, c = Math.cos(a), s = Math.sin(a), half = (F.f[e.who] && F.f[e.who].stats.moves.move2.half) || 50;   // it crashes down: crowns of water thrown up along it, the middle first
          for (const [k, d] of [[0, 0], [-0.62, 0.06], [0.62, 0.09]]) v.fx.push({ k: 'dkCrown', x: e.x + c * 20 - s * k * half, y: e.y + s * 20 + c * k * half * 0.9, t: -d, life: 0.5, s: (k ? 0.62 : 0.85) * half / 50, seed: k * 7 + 3 }); }
        if (W3) {
          const a = e.a || 0, c = Math.cos(a), s = Math.sin(a);
          for (const k of [-0.6, 0, 0.6]) drops(v, e.x - s * k * 40, e.y + c * k * 32, 18, few ? 3 : 6, { r: 10, speed: [40, 120], up: [160, 280], s: [1.8, 3] });
          if (P3('bit:dkfoam')) bits3(v, 'dkfoam', e.x, e.y, 3, few ? 3 : 6, { r: 30, speed: [20, 60], up: [20, 50], s: [2.8, 3.8], life: [0.5, 0.8], g: 200, fade: 'alpha', few });
          puddle(v, e.x - c * 8, e.y - s * 8, 42);
        } else puff(v, e.x, e.y, few ? 3 : 5, null);
        if (e.why === 'wall') v.shake = Math.max(v.shake, 0.08);
        return true;
      }
      case 'dkDump': if (W3) drops(v, e.x, e.y, 6, few ? 3 : 5, { speed: [40, 90], up: [100, 180] }); return true;
      case 'dkCoil': return true;
      case 'dkSwing': if (D3) dust(v, e.x, e.y + 4, few ? 2 : 4, { r: 18, speed: [40, 90], up: [10, 30] }); return true;   // (the spin scuffs the floor)
      case 'dkSmack': {   // the tail lands: a burst of water off it, foam, a little shake
        const a = e.a || 0, to = F.f[e.to];
        v.fx.push({ k: 'dkSheet', x: to ? to.x * 0.7 + e.x * 0.3 : e.x, y: to ? to.y * 0.7 + e.y * 0.3 : e.y, z: 22, a, s: 1, t: 0, life: 0.42 });   // (a sheet of water flung off the tail, the way they go)
        if (W3) { drops(v, e.x, e.y, 20, few ? 6 : 12, { dir: a, spread: 2.6, speed: [80, 190], up: [100, 240], s: [1.8, 3] }); if (P3('bit:dkfoam')) bits3(v, 'dkfoam', e.x, e.y, 18, few ? 2 : 4, { dir: a, spread: 2, speed: [40, 90], up: [40, 90], s: [2.6, 3.4], life: [0.4, 0.6], g: 300, fade: 'alpha', few }); }
        else for (let k = 0; k < (few ? 3 : 6); k++) v.fx.push({ k: 'dkDrop', x: e.x, y: e.y, z: 18, vx: Math.cos(a + frnd(-1, 1)) * frnd(80, 160), vy: Math.sin(a + frnd(-1, 1)) * frnd(40, 90), vz: frnd(80, 180), t: 0, life: 0.6, s: frnd(1.8, 2.8) });
        v.shake = Math.max(v.shake, 0.1);
        return true;
      }
      case 'dkLand':   // down off the wave where it broke: a splash round his feet (caught nobody: a bigger, sloppier one)
        if (W3) { drops(v, e.x, e.y, 6, few ? 3 : (e.hit ? 4 : 7), { r: 14, speed: [40, 100], up: [100, 190] }); puddle(v, e.x, e.y, 26); }
        else puff(v, e.x, e.y, few ? 2 : 3, null);
        return true;
      case 'dkStack': return true;   // (the tower on his back: his pose; the cracks: ground())
      case 'dkBuild': if (D3) dust(v, e.x, e.y + 4, few ? 1 : 3, { r: 16, speed: [30, 70], up: [10, 30] }); return true;   // (flippers slammed down)
      case 'dkUp': {   // a container bursts up out of the floor: chips and grit flung up, a ring of dust, a tiny shake
        if (D3) {
          for (let k = 0, n = few ? 3 : 6; k < n; k++) { const a = k / n * TAU + frnd(-0.3, 0.3), sp = frnd(40, 80); bit3(v, 'dkdust', e.x + Math.cos(a) * 15, e.y + Math.sin(a) * 11, 3, { dx: Math.cos(a) * sp, dy: Math.sin(a) * sp * 0.6, dz: frnd(20, 50), g: 30, drag: 2.2, grow: 0.8, s: frnd(3.6, 5.2), life: frnd(0.5, 0.8), fade: 'alpha', bo: 0, sp: 4, few }); }
          if (P3('bit:rock')) bits3(v, 'rock', e.x, e.y, 6, few ? 1 : 3, { r: 12, speed: [40, 90], up: [140, 220], s: [1.4, 2.2], life: [0.5, 0.75], bo: 0.3, few });
        } else puff(v, e.x, e.y, few ? 2 : 3, null);
        v.shake = Math.max(v.shake, 0.05);
        return true;
      }
      case 'dkPop': if (D3) dust(v, e.x, e.y, few ? 2 : 4, { r: 12, speed: [60, 110], up: [40, 90] }); return true;   // (popped out of the way, back toward him)
      case 'dkSink': if (D3) dust(v, e.x, e.y + 6, few ? 1 : 3, { r: 15, speed: [20, 45], up: [10, 30] }); return true;
      case 'dkClang':   // knocked into a container: it rattles (wall3), grit shaken off its roof
        if (P3('bit:rock')) bits3(v, 'rock', e.x, e.y, 40, few ? 1 : 2, { r: 10, speed: [20, 50], up: [40, 90], s: [1, 1.6], life: [0.45, 0.6], bo: 0.2, few });
        return true;
      case 'dkSlamIn': {   // slapped into something: a crunch of dust and chips where they hit it, a firmer shake
        const a = Math.atan2(e.ny || 0, e.nx || 0);
        if (D3) { dust(v, e.x, e.y, few ? 3 : 6, { dir: a, spread: 2.4, r: 8, speed: [60, 130], up: [30, 80] }); if (P3('bit:splinter')) bits3(v, 'splinter', e.x, e.y, 16, few ? 1 : 3, { dir: a, spread: 2, speed: [80, 160], up: [120, 220], s: [2.2, 3.2], life: [0.55, 0.85], bo: 0.3, few }); }
        else puff(v, e.x, e.y, few ? 3 : 5, null);
        v.shake = Math.max(v.shake, 0.14);
        return true;
      }
      case 'dkDive': case 'dkSurface': {   // a splash: water drops flung up and out (the crown and the pool: behind())
        const br = e.kind === 'dkSurface', n = br ? (few ? 4 : 7) : (few ? 4 : 7);
        if (!br) { (v.dkIn || (v.dkIn = []))[e.who] = [e.x, e.y, v.t]; const L = v.dkTr && v.dkTr[e.who]; if (L) L.length = 0; }
        if (W3) {
          if (br) puddle(v, e.x, e.y, 20);
          bits3(v, 'dkdrop', e.x, e.y, br ? 10 : 6, n, { r: 10, speed: [40, 90], up: [150, br ? 240 : 210], s: [1.8, 3], life: [0.55, 0.85], bo: 0, few });
          if (P3('bit:dkfoam')) bits3(v, 'dkfoam', e.x, e.y, 2, few ? 2 : 4, { r: 18, speed: [20, 50], up: [20, 50], s: [2.6, 3.6], life: [0.4, 0.6], g: 200, fade: 'alpha', few });
          return true;
        }
        for (let k = 0; k < n; k++) { const a = k / n * TAU + frnd(-0.3, 0.3), sp = frnd(40, 100); v.fx.push({ k: 'dkDrop', x: e.x + Math.cos(a) * 8, y: e.y + Math.sin(a) * 4, z: 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.55, vz: frnd(120, br ? 260 : 190), t: 0, life: frnd(0.5, 0.8), s: frnd(1.8, 3) }); }
        v.fx.push({ k: 'popring', x: e.x, y: e.y, t: 0, life: 0.4, s: br ? 36 : 26 });
        return true;
      }
    }
    return false;
  },
  fx(g, F, v, p, k, dt) {
    if (p.k === 'dkCrown') {   // where the wave crashes down: a crown of water thrown up, falling back
      if (p.t < 0) return true;
      const h = Math.sin(Math.PI * Math.min(1, k * 1.1)), a = 1 - k * k;
      if (P3('dkcrown')) { g.save(); g.translate(p.x, p.y); drawProp3D(g, 'dkcrown', { frame: (p.seed || 0) + Math.floor(k * 3), scale: p.s * (0.9 + 0.35 * ease(k)), sy: Math.max(0.05, h * 1.15), alpha: a }); g.restore(); }
      else crown2(g, p.x, p.y, p.s, h, a, p.seed || 1);
      return true;
    }
    if (p.k === 'dkSheet') { sheet2(g, p.x, p.y - p.z, p.a, p.s, k); return true; }   // (the slap's sheet of water)
    if (p.k !== 'dkDrop') return false;   // a drop of water (2D, till the 3D ones are made): up, and down onto the floor
    p.vz -= 760 * dt; p.z = Math.max(0, p.z + p.vz * dt);
    const a = 1 - k * k, r = p.s * (p.z > 0 ? 1 : 0.7);
    g.fillStyle = `rgba(40,110,180,${(0.45 * a).toFixed(3)})`; g.beginPath(); g.ellipse(p.x + 0.4, p.y - p.z + 0.6, r, r * (p.z > 0 ? 1.2 : 0.5), 0, 0, TAU); g.fill();
    g.fillStyle = `rgba(${WATER},${(0.95 * a).toFixed(3)})`; g.beginPath(); g.ellipse(p.x, p.y - p.z, r * 0.85, r * (p.z > 0 ? 1.05 : 0.42), 0, 0, TAU); g.fill();
    if (p.z > 0) { g.fillStyle = `rgba(255,255,255,${(0.8 * a).toFixed(3)})`; circle(g, p.x - r * 0.3, p.y - p.z - r * 0.35, r * 0.3); g.fill(); }
    return true;
  },
  icon(g, kind, r, col) {
    const W = col || '#ffffff';
    g.fillStyle = W; g.strokeStyle = W;
    switch (kind) {
      case 'dkWave':   // a curling wave
        g.beginPath(); g.moveTo(-r * 0.85, r * 0.55); g.quadraticCurveTo(-r * 0.6, -r * 0.2, -r * 0.05, -r * 0.6); g.quadraticCurveTo(r * 0.55, -r * 0.85, r * 0.8, -r * 0.3);
        g.quadraticCurveTo(r * 0.45, -r * 0.5, r * 0.25, -r * 0.2); g.quadraticCurveTo(r * 0.1, r * 0.15, r * 0.6, r * 0.55); g.closePath(); g.fill();
        return true;
      case 'dkSlap':   // a whale's tail fluke swung round, an arc of spray behind it
        g.save(); g.rotate(-0.5);
        g.beginPath(); g.moveTo(0, r * 0.15); g.quadraticCurveTo(-r * 0.15, -r * 0.25, -r * 0.6, -r * 0.45); g.quadraticCurveTo(-r * 0.1, -r * 0.3, 0, -r * 0.05); g.quadraticCurveTo(r * 0.1, -r * 0.3, r * 0.6, -r * 0.45); g.quadraticCurveTo(r * 0.15, -r * 0.25, 0, r * 0.15); g.fill();
        g.lineWidth = r * 0.12; g.beginPath(); g.moveTo(0, r * 0.1); g.lineTo(0, r * 0.62); g.stroke();
        g.restore();
        g.lineWidth = r * 0.11; g.lineCap = 'round'; g.globalAlpha *= 0.65; g.beginPath(); g.arc(0, 0, r * 0.82, 0.3, 1.9); g.stroke(); g.globalAlpha /= 0.65;
        return true;
      case 'dkWall':   // containers stacked: two on the bottom, one on top
        g.beginPath(); g.roundRect(-r * 0.78, r * 0.05, r * 0.74, r * 0.52, r * 0.07); g.roundRect(r * 0.04, r * 0.05, r * 0.74, r * 0.52, r * 0.07); g.roundRect(-r * 0.37, -r * 0.55, r * 0.74, r * 0.52, r * 0.07); g.fill();
        return true;
      case 'dkSwim':   // a whale's back swimming under a ripple, a V of ripples off its nose, bubbles behind
        g.beginPath(); g.ellipse(r * 0.05, r * 0.05, r * 0.5, r * 0.22, 0, Math.PI, TAU); g.fill();
        g.lineWidth = r * 0.11; g.lineCap = 'round';
        g.beginPath(); g.moveTo(r * 0.62, r * 0.12); g.lineTo(-r * 0.1, -r * 0.42); g.moveTo(r * 0.62, r * 0.12); g.lineTo(-r * 0.1, r * 0.62); g.stroke();
        g.beginPath(); g.moveTo(-r * 0.85, r * 0.12); g.lineTo(r * 0.7, r * 0.12); g.stroke();
        for (const [x, y, q] of [[-0.62, -0.32, 0.12], [-0.85, -0.05, 0.09], [-0.45, -0.58, 0.08]]) { g.beginPath(); g.arc(x * r, y * r, q * r, 0, TAU); g.fill(); }
        return true;
    }
    return false;
  },
  // his own sounds: water, a big tail and steel containers (the wave's swell is a cue)
  sound(e) {
    switch (e.kind) {
      case 'dkSurge': return [['dkSurge', 0.9]];
      case 'dkCatch': return [['dkSplash', 0.7]];
      case 'dkBreak': return [['dkCrash', e.why === 'wall' ? 1 : 0.85]];
      case 'dkDump': return [['dkDrop', 0.7]];
      case 'dkCoil': return [['dkGroan', 0.7]];
      case 'dkSwing': return [['dkSwoosh', 0.8]];
      case 'dkSmack': return [['dkThwack', 0.9], ['fHeavy', 0.5]];
      case 'dkLand': return [['dkSplash', e.hit ? 0.5 : 0.7]];
      case 'dkStack': return [['dkStackUp', 0.7], ['dkRumble', 0.5]];
      case 'dkBuild': return [['dkStomp', 0.8]];
      case 'dkUp': return e.k === 1 ? [['dkClang', 0.8], ['fBelly', 0.4]] : null;   // (one sound for the wall)
      case 'dkPop': return [['dkBoing', 0.8]];
      case 'dkSink': return e.k === 1 ? [['dkRumble', 0.4]] : null;
      case 'dkClang': return [['dkClang', 0.7]];
      case 'dkSlamIn': return [['fHeavy', 0.9], ['dkClang', 0.8]];
      case 'dkDive': return [['dkGulp', 0.7]];
      case 'dkSurface': return [['dkSpout', 0.7]];
    }
    return null;
  },
  // the beats that aren't events: the water swelling up in front of him as he rears for the wave
  cues(F, play) {
    let M = CUES.get(F); if (!M) CUES.set(F, M = []);
    for (const f of F.f) { if (f.id === ID && f.ph !== M[f.i] && f.ph === 'swell') play('dkSwell', 0.7); M[f.i] = f.ph; }
  },
  sounds: {
    dkSwell: ({ osc, hiss }) => (v, t) => { hiss(t, 0.4, 0.08 * v, 'bandpass', 300, 1100); osc(t, 70, 0.4, 'sine', 0.1 * v, 50); },   // the water swelling up
    dkCrash: ({ osc, hiss }) => (v, t) => { hiss(t, 0.5, 0.18 * v, 'bandpass', 1400, 500); osc(t, 100, 0.25, 'sine', 0.2 * v, -50); for (let k = 0; k < 4; k++) osc(t + 0.05 + k * 0.05, 800 + k * 300, 0.04, 'sine', 0.04 * v, 400); },   // the wave crashing
    dkDrop: ({ osc, hiss }) => (v, t) => { osc(t, 130, 0.16, 'sine', 0.2 * v, -60); hiss(t, 0.15, 0.08 * v, 'lowpass', 1000); },   // dropped off the wave: a wet thud
    dkGroan: ({ osc }) => (v, t) => { osc(t, 110, 0.25, 'sawtooth', 0.035 * v, -30); osc(t, 165, 0.25, 'triangle', 0.04 * v, 40); },   // twisting back: a whale's low groan
    dkSwoosh: ({ hiss, osc }) => (v, t) => { hiss(t, 0.28, 0.16 * v, 'bandpass', 350, 1600); osc(t, 90, 0.28, 'sine', 0.08 * v, 60); },   // the tail coming round: a big low whoosh
    dkThwack: ({ osc, hiss }) => (v, t) => { hiss(t, 0.06, 0.2 * v, 'highpass', 2000); osc(t, 150, 0.2, 'sine', 0.25 * v, -70); hiss(t + 0.03, 0.25, 0.1 * v, 'bandpass', 1500, 600); },   // the tail landing: a wet thwack
    dkStackUp: ({ osc }) => (v, t) => { for (let k = 0; k < 3; k++) { osc(t + k * 0.11, 150 + k * 30, 0.1, 'sine', 0.12 * v, -40); osc(t + k * 0.11, 460 + k * 60, 0.12, 'triangle', 0.03 * v); } },   // the containers clunking onto his back, one, two, three
    dkStomp: ({ osc, hiss }) => (v, t) => { osc(t, 70, 0.3, 'sine', 0.3 * v, -30); hiss(t, 0.2, 0.1 * v, 'lowpass', 600, 200); },   // flippers slammed down
    dkBoing: ({ osc }) => (v, t) => { osc(t, 140, 0.1, 'sine', 0.18 * v, -40); osc(t + 0.03, 300, 0.25, 'triangle', 0.06 * v, 260); },   // popped off a rising container
    dkGulp: ({ osc, hiss }) => (v, t) => { osc(t, 300, 0.14, 'sine', 0.14 * v, -220); hiss(t, 0.3, 0.12 * v, 'bandpass', 1600, 600); },   // diving under
    dkSpout: ({ osc, hiss }) => (v, t) => { hiss(t, 0.3, 0.12 * v, 'bandpass', 1200, 3200); osc(t, 200, 0.12, 'sine', 0.1 * v, 200); },   // surfacing: a spout
    // a steel container: a dull thunk and a short hollow ring
    dkClang: ({ osc, hiss }) => (v, t) => { osc(t, 120, 0.16, 'sine', 0.2 * v, -40); osc(t, 410, 0.3, 'triangle', 0.05 * v, -20); osc(t, 590, 0.22, 'sine', 0.035 * v, -15); hiss(t, 0.08, 0.06 * v, 'bandpass', 900, 400); },
    // the floor rumbling as the wall comes: a low grinding growl
    dkRumble: ({ osc, hiss }) => (v, t) => { osc(t, 55, 0.4, 'sawtooth', 0.04 * v, 10); hiss(t, 0.4, 0.07 * v, 'lowpass', 300, 200); },
    // a splash: a soft plop and a hiss of water
    dkSplash: ({ osc, hiss }) => (v, t) => { osc(t, 220, 0.12, 'sine', 0.18 * v, -160); hiss(t, 0.35, 0.16 * v, 'bandpass', 1800, 700); for (let k = 0; k < 3; k++) osc(t + 0.06 + k * 0.05, 900 + k * 250, 0.04, 'sine', 0.04 * v, 300); },
    // the wave setting off: a low thump and a long rushing hiss of water
    dkSurge: ({ osc, hiss }) => (v, t) => { osc(t, 90, 0.2, 'sine', 0.2 * v, -50); hiss(t, 0.7, 0.14 * v, 'bandpass', 600, 1500); hiss(t + 0.1, 0.6, 0.06 * v, 'highpass', 2500, 1800); },
  },
};
