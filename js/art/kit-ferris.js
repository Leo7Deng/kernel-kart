// Kernel Kart: drawing Ferris's Fight moves (2026-10-24; the sim is js/kits/ferris.js, the hooks js/art/kits.js).
// Rust orange, soft and cartoony, Classic Flat first; tells are part of the floor (no outlines, arrows or player colours).
// Real 3D since 2026-10-24 (art/prop3d.js's kit, the user: every move "a small 3D set piece that looks as good as the
// fighter models"): the claw and its arm, the chain links, the padlock and the sand whirl are low-poly meshes baked with
// the fight (propsFor below), the sand and sparks 3D bits; the old 2D drawing stays as the stand-in while a sheet is
// still baking (or with no WebGL).
//   Borrow Claw     while he cocks it, a scuffed track in the sand shows the line (a soft dark band with pairs of little
//                   claw scratches, sand heaped along it), darker once it's locked; then a big claw shoots out on a
//                   segmented arm (rounded crab-leg segments, a dark joint between each), its pincers wide open,
//                   snapping shut on whoever it borrows (sparks and sand), reeling them in; a miss: it snaps shut on
//                   nothing at the end of its reach and draws back
//   Ownership Lock  chain links pop up out of the floor one by one in a ring round their spot (a little sand each),
//                   alternately standing and lying like a real chain; closed on someone: the ring snaps in round them,
//                   two loops of chain wrap round them (round the back and the front) and a padlock swings on them while
//                   they're locked; missed: the links sink back and fade
//   unsafe { }      the rattle: a low whirl of sand round his feet, pebbles rattling, a warm flush on his shell; the
//                   whirl: a tall vortex of sand and claw-orange spinning round him (its back half behind him, its front
//                   over him), sparks flying off; each hit a spray of sparks and sand. After it he settles (no stun look)
//   Shell Tuck      a puff of sand as he tucks in, ruts in the sand behind the rolling shell, a puff as he pops out
import { TAU, clamp, frnd } from '../core.js';
import { bold } from '../look.js';
import * as M3 from './model3d.js';
import { animBase, settleAnim } from './kits.js';
import { bit3, bits3, decal3, defProp, drawProp3D, propReady, propsFor } from './prop3d.js';
import { H, STONE, lumpHalf, mulC } from './kit3-earth.js';

const ID = 'ferris';
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const OR = '#f74c00', ORD = '#b03500';
const SAND = '70,48,30', PALE = '255,246,228';
const ARM_Z = 18;   // how high off the floor the claw's arm goes (world units)
const SQ = Math.sin(M3.ELEV);   // (a ring round someone, seen from the models' 28°: its depth squashed this much)
const { hex, ball, ellipsoid, tube, rbox, decal, smoothProf, add, MATTE, GLOSS, STRIDE } = M3;
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }

// ---------------------------------------------------------------- the 3D props (world units; x forward, z up)
const C_OR = hex(OR), C_DK = hex(ORD), C_TOOTH = hex('#ffe2c4');
// a segment of the claw's arm: a rounded crab-leg segment, fatter in its middle, a dark joint ring at each end, a little
// bump on top (its middle at the origin, along x)
function armMesh() {
  const out = [];
  tube(out, smoothProf([[-6.6, 0, 0], [0, 0, 0.3], [6.6, 0, 0]], 4), t => 2.6 + 0.9 * Math.sin(Math.PI * t), C_OR, MATTE, 1, 12);
  for (const x of [-6.3, 6.3]) ellipsoid(out, [x, 0, 0], [[0.9, 0, 0], [0, 3, 0], [0, 0, 3]], C_DK, MATTE, 14, 8, 0.6);
  tube(out, [[0, 0, 2.9], [0, 0, 4.9]], t => 1.2 - 0.9 * t, C_OR, MATTE, 0.7, 8);
  return out;
}
// the big claw: a round palm on a dark cuff, two curved pincers (the upper one bigger, opening up and down) with little
// cream teeth on their inside edges, dark tips; states open (wide, flying), shut (holding, clamped)
function clawMesh(st) {
  const out = [], open = st === 'open' ? 0.72 : -0.03;
  ellipsoid(out, [8, 0, 0], [[8.5, 0, 0], [0, 7.2, 0], [0, 0, 6.6]], C_OR, MATTE, 24, 16);
  ellipsoid(out, [0.2, 0, 0], [[1.4, 0, 0], [0, 4.8, 0], [0, 0, 4.8]], C_DK, MATTE, 16, 10, 0.7);
  const rotY = (p, a) => [p[0] * Math.cos(a) - p[2] * Math.sin(a), p[1], p[0] * Math.sin(a) + p[2] * Math.cos(a)];
  for (const s of [-1, 1]) {   // (the pincers open up and down, so they read from every side)
    const k = s > 0 ? 1 : 0.82, base = [12.5, 0, s * 3.4 + 0.6], a = s * open;
    const P = smoothProf([[0, 0, 0], [5, 0, s * 1.1], [9.5, 0, s * 0.6], [13.5 * k, 0, -s * 1.6]], 3).map(p => add(base, rotY(p, a)));
    tube(out, P, t => (3.3 * (1 - 0.7 * t) + 0.45) * k, (i, n) => i >= P.length - 3 ? C_DK : C_OR, MATTE, 1, 12);
    for (const t of [0.35, 0.55, 0.75]) { const q = add(base, rotY([13.5 * k * t, 0, -s * (2.6 * (1 - 0.55 * t) * k - 0.6)], a)); ball(out, q, 1.0 * k, C_TOOTH, MATTE, 0.4, 10, 7); }
  }
  return out;
}
// a chain link: a soft blue-grey oval ring (glossy, cartoony); upright (standing in the x-z plane) or flat (lying), its
// foot on the floor
function linkMesh(flat) {
  const out = [], N = 22, pts = [];
  for (let j = 0; j <= N; j++) { const a = j / N * TAU; pts.push(flat ? [Math.cos(a) * 5.4, Math.sin(a) * 3.3, 1.3] : [Math.cos(a) * 5.4, 0, 4.6 + Math.sin(a) * 3.3]); }
  tube(out, pts, 1.2, hex('#aab4c8'), GLOSS, 1, 10);
  return out;
}
// the padlock hung on whoever's locked: a round brass body, a dark keyhole, a grey shackle (facing +x; its middle at
// the origin, the shackle's top 9.6 up)
function padlockMesh() {
  const out = [];
  rbox(out, [0, 0, 0], [2.5, 5.3, 4.5], hex('#efb43c'), GLOSS, 0.42);
  decal(out, [2.5, 0, 0.9], [1, 0, 0], 1.25, 1.25, 0.25, hex('#5a3a0a'), 0, 0, MATTE);
  decal(out, [2.45, 0, -0.9], [1, 0, 0], 0.55, 1.5, 0.25, hex('#5a3a0a'), 0, 0, MATTE);
  tube(out, smoothProf([[0, -3.3, 3.8], [0, -3.3, 6.6], [0, -1.8, 8.9], [0, 0, 9.6], [0, 1.8, 8.9], [0, 3.3, 6.6], [0, 3.3, 3.8]], 3), 1.2, hex('#c9cdd8'), GLOSS, 1, 10);
  return out;
}
// the whirl of unsafe: tall thin bands of whipped-up sand (pale, paler, and a claw-orange smear) curving round him at
// their own heights, a few pebbles caught up in it. Its states: its back half (b0..b5) and its front (f0..f5), at
// six turns of its spin (it repeats every third of a turn), so he stands inside it
const WHIRL_N = 6;
function whirlMesh(st) {
  const out = [], back = st[0] === 'b', ph = (+st.slice(1) || 0) / WHIRL_N * TAU / 3, cols = [hex('#cfa15e'), hex('#e6c68c'), hex('#ea6a28'), hex('#bf8f52'), hex('#dcb57a')];
  // bands of whipped-up sand: tall thin sheets curving round him, each tapering at both ends, at their own heights
  const B = [0, 1, 2].flatMap(k => [[k * TAU / 3, 3, 1.6, 28, 7, [0, 1, 4][k]], [k * TAU / 3 + 1.05, 16, 1.3, 33, 5.5, [2, 3, 1][k]]]);   // (the same every third of a turn)
  for (const [a0, z, len, r, hgt, ci] of B) {
    const P = [];
    for (let j = 0; j <= 14; j++) { const t = j / 14, an = ph + a0 + t * len; P.push([Math.cos(an) * (r + 3 * t), Math.sin(an) * (r + 3 * t), z + 3 * t]); }
    M3.sweep(out, P, t => 0.5 + 1.7 * Math.sin(Math.PI * t), t => 0.5 + hgt * 1.35 * Math.pow(Math.sin(Math.PI * t), 0.7), [0, 0, 1], cols[ci], MATTE, 0.5, 10);
  }
  for (let k = 0; k < 3; k++) { const an = ph + k * TAU / 3 + 1.1, r = 29; lumpHalf(out, [Math.cos(an) * r, Math.sin(an) * r, 14], [1.5, 1.4, 1.3], 7 + k, 5, 3, 0.35, (n, c, i) => mulC(STONE, 0.9 + 0.2 * H(i)), 0.6, 0); }   // (pebbles caught up in it)
  // its half: the triangles behind him (model +y: up the screen, away) or in front
  const keep = [];
  for (let i = 0; i < out.length; i += STRIDE * 3) { const cy = (out[i + 1] + out[i + 1 + STRIDE] + out[i + 1 + STRIDE * 2]) / 3; if ((cy > 0) === back) for (let k = 0; k < STRIDE * 3; k++) keep.push(out[i + k]); }
  return keep;
}
defProp('fearm', { mesh: armMesh, n: 16, sym: 2, ink: '#5a1a00' });
defProp('feclaw', { mesh: clawMesh, n: 16, ink: '#5a1a00', states: ['open', 'shut'] });
defProp('felink', { mesh: () => linkMesh(false), n: 8, sym: 2, ink: '#3c4357', out: 0.7 });
defProp('felinkf', { mesh: () => linkMesh(true), n: 8, sym: 2, ink: '#3c4357', out: 0.7 });
defProp('felock', { mesh: padlockMesh, n: 8, ink: '#5a3a0a' });
const WHIRL = [...Array(WHIRL_N).keys()].flatMap(k => ['b' + k, 'f' + k]);
defProp('fewhirl', { mesh: whirlMesh, n: 1, ink: '#8a6a40', out: 0.5, states: WHIRL });
propsFor(ID, ['fearm', 'feclaw/open', 'feclaw/shut', 'felink', 'felinkf', 'felock', ...WHIRL.map(s => 'fewhirl/' + s), 'crumbs/sand', 'bit:sand']);
const whirlReady = () => propReady('fewhirl', 'b0') && propReady('fewhirl', 'f' + (WHIRL_N - 1));


// ---------------------------------------------------------------- bits
function sand(v, x, y, n, r = 10, few, up = [10, 30]) {
  bits3(v, 'sand', x, y, 3, few ? Math.ceil(n / 2) : n, { speed: [25, 75], up, g: 0, drag: 2.5, s: [3.2, 5.6], grow: 1, life: [0.45, 0.8], fade: 'alpha', al: 0.65, sh: false, r });
}
function sparks(v, x, y, z, n, dir = 0, spread = TAU, few) {
  bits3(v, 'spark', x, y, z, few ? Math.ceil(n / 2) : n, { dir, spread, speed: [80, 170], up: [60, 150], s: [1.6, 2.6], life: [0.22, 0.38], g: 300, bo: 0, sp: 30, fade: 'shrink', sh: false });
}
// ruts the rolling shell leaves in the sand (drawn under the fighters: behind(), by whoever's drawn first)
function ruts(g, v) {
  const L = v.feRuts; if (!L || !L.length) return;
  for (let i = L.length - 1; i >= 0; i--) {
    const [x, y, at, a, h] = L[i], k = (v.t - at) / 1.2; if (k >= 1) { L.splice(i, 1); continue; }
    if (!decal3(g, 'crumbs', x, y, 8 + h * 2, { state: 'sand', yaw: a + (h - 0.5) * 0.4, alpha: 0.75 * (1 - k * k) })) { g.fillStyle = `rgba(${SAND},${(0.16 * (1 - k)).toFixed(3)})`; g.beginPath(); g.ellipse(x, y, 8, 4, a, 0, TAU); g.fill(); }
  }
}

// ---------------------------------------------------------------- the floor
// the claw's line while he cocks it: a scuffed track in the sand, scratch pairs down it and sand heaped along its
// sides, darker once it's locked
function track(g, F, o) {
  if (o.ph !== 'aim') return;
  const f = F.f[o.owner], a = clamp(o.t / 0.2, 0, 1) * (o.lock ? 1 : 0.75), c = Math.cos(o.a), s = Math.sin(o.a), x0 = o.x + c * f.r, y0 = o.y + s * f.r, L = o.len - f.r;
  const gr = g.createLinearGradient(x0, y0, x0 + c * L, y0 + s * L);
  gr.addColorStop(0, `rgba(${SAND},${(0.2 * a).toFixed(3)})`); gr.addColorStop(0.85, `rgba(${SAND},${(0.14 * a).toFixed(3)})`); gr.addColorStop(1, `rgba(${SAND},0)`);
  g.save(); g.lineCap = 'round'; g.strokeStyle = gr; g.lineWidth = o.w * 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + c * L, y0 + s * L); g.stroke();
  const D3 = propReady('crumbs', 'sand');
  for (let d = 16; d < L - 8; d += 30) {   // little sets of claw scratches scuffed into it (each a pale line over a dark one), uneven
    const k = 1 - d / L, j = (Math.sin(d * 1.7 + o.id) * 0.5) * 6, x = x0 + c * d - s * j, y = y0 + s * d + c * j, al = a * (0.35 + 0.5 * k), tw = Math.sin(d * 2.3) * 0.35;
    if (D3) for (const sd of [-1, 1]) decal3(g, 'crumbs', x - s * sd * (o.w + 3), y + c * sd * (o.w + 3), 5.5, { state: 'sand', yaw: o.a, alpha: al * 0.8 });   // (sand pushed up along its sides)
    for (let m = -1; m <= 1; m++) for (const [col, lw, off] of [[`rgba(${PALE},${(0.5 * al).toFixed(3)})`, 1.8, -0.6], [`rgba(${SAND},${(0.5 * al).toFixed(3)})`, 0.9, 0.3]]) {
      const px = x - s * m * 3.2, py = y + c * m * 3.2, ca = Math.cos(o.a + tw), sa = Math.sin(o.a + tw), h = 3.5 - Math.abs(m);
      g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(px - ca * h + off, py - sa * h + off); g.lineTo(px + ca * h + off, py + sa * h + off); g.stroke();
    }
  }
  g.restore();
}
// a 2D chain link standing on the floor (the stand-in): a soft grey oval ring, lighter on top, its shadow under it
function link2D(g, x, y, an, k, a) {
  if (k <= 0.02 || a <= 0.02) return;
  const s = 0.5 + 0.5 * k, h = 5 * k;
  g.fillStyle = `rgba(20,16,42,${(0.18 * a).toFixed(3)})`; g.beginPath(); g.ellipse(x + 1, y + 1, 5 * s, 2.4 * s, an, 0, TAU); g.fill();
  g.save(); g.translate(x, y - h); g.rotate(an); g.globalAlpha *= a;
  g.lineWidth = 2.4 * s; g.strokeStyle = '#7a8092'; g.beginPath(); g.ellipse(0, 0.6, 5 * s, 3 * s, 0, 0, TAU); g.stroke();
  g.lineWidth = 1.2 * s; g.strokeStyle = '#d8dce6'; g.beginPath(); g.ellipse(-0.4, -0.4, 4.6 * s, 2.6 * s, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  g.restore();
}
// a 3D link at (x, y) lifted z, its long way along an (k: popped up 0..1, overshooting a little)
function link3(g, x, y, z, an, k, a, flat, s = 1) {
  if (k <= 0.02 || a <= 0.02) return;
  const pop = k < 1 ? 0.35 + 0.65 * k + Math.sin(k * Math.PI) * 0.25 : 1;
  g.save(); g.translate(x, y - z);
  if (!drawProp3D(g, flat ? 'felinkf' : 'felink', { yaw: an, scale: pop * s, alpha: a })) link2D(g, 0, 0, an, k, a);
  g.restore();
}
// the ring forming round their spot: a faint shadow ring where they'll stand, links popping up one by one (a little sand
// each); shut: the ring snapping in; missed: the links sinking back
function chainRing(F, v, g, o, out) {
  const mv = F.f[o.owner].stats.moves.move2, R = o.R, n = 26;
  const u = o.ph === 'form' ? clamp(o.t / mv.form, 0, 1) : 1, end = o.ph === 'form' ? 0 : clamp((o.t - mv.form) / 0.35, 0, 1);
  const shrink = o.ph === 'shut' ? 1 - 0.55 * ease(end) : 1, a = o.ph === 'form' ? 1 : o.ph === 'shut' ? 1 - ease(end) : 1 - end;
  const S = v.feLinks || (v.feLinks = new Set());
  for (let k = 0; k < n; k++) {
    const an = k / n * TAU + o.id, at = (k * 11 % n) / n, pk = ease((u - at * 0.85) / 0.15), r = R * shrink;
    const x = o.x + Math.cos(an) * r, y = o.y + Math.sin(an) * r * 0.93, z = o.ph === 'miss' ? -4 * end : 0, flat = k % 2 === 1;
    if (o.ph === 'form' && pk > 0.05) { const key = o.id * 64 + k; if (!S.has(key)) { if (S.size > 400) S.clear(); S.add(key); if (k % 2) bits3(v, 'sand', x, y, 2, 1, { speed: [10, 30], up: [10, 25], g: 0, drag: 3, s: [2.2, 3.2], grow: 0.8, life: [0.3, 0.45], fade: 'alpha', al: 0.55, sh: false, few: true }); } }
    out.push({ y, d: () => link3(g, x, y, z, an + Math.PI / 2, pk, a * (o.ph === 'miss' ? 1 - end * 0.5 : 1), flat, o.ph === 'shut' ? 1 - 0.2 * end : 1) });
  }
}
function ringShadow(g, F, o) {
  if (o.ph !== 'form') return;
  const mv = F.f[o.owner].stats.moves.move2, u = clamp(o.t / mv.form, 0, 1);
  g.fillStyle = `rgba(20,16,42,${(0.05 + 0.07 * u).toFixed(3)})`; g.beginPath(); g.ellipse(o.x, o.y, o.R, o.R * 0.93, 0, 0, TAU); g.fill();
}

// ---------------------------------------------------------------- the claw on its segmented arm
function clawArm2D(g, f, o) {
  const c = Math.cos(o.a), s = Math.sin(o.a), sx = o.x + c * (f.r - 4), sy = o.y + s * (f.r - 4) - ARM_Z, ex = o.x + c * o.ext, ey = o.y + s * o.ext - ARM_Z;
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = ORD; g.lineWidth = 8; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
  g.strokeStyle = bold() ? OR : '#f45a12'; g.lineWidth = 6.2; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
  const open = o.ph === 'shoot' ? 0.55 : 0.05;
  g.save(); g.translate(ex, ey); g.rotate(Math.atan2(ey - sy, ex - sx));
  for (const side of [-1, 1]) { g.save(); g.rotate(side * open); g.fillStyle = ORD; g.beginPath(); g.ellipse(9, side * 3.6, 9, 4.4, side * 0.12, 0, TAU); g.fill(); g.fillStyle = OR; g.beginPath(); g.ellipse(8.4, side * 3.2, 8.2, 3.8, side * 0.12, 0, TAU); g.fill(); g.restore(); }
  g.fillStyle = OR; circle(g, 0, 0, 6); g.fill();
  g.restore();
}
function clawArm(g, F, v, o) {
  const f = F.f[o.owner]; if (!f || !(o.ext > f.r + 2)) return;
  const c = Math.cos(o.a), s = Math.sin(o.a), st = o.ph === 'shoot' ? 'open' : 'shut';
  // its shadow on the floor
  const sx = o.x + c * (f.r - 4), sy = o.y + s * (f.r - 4), ex = o.x + c * o.ext, ey = o.y + s * o.ext;
  g.strokeStyle = 'rgba(20,16,42,0.16)'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(sx + 1, sy + 1); g.lineTo(ex + 1, ey + 1); g.stroke();
  if (!propReady('fearm') || !propReady('feclaw', st)) { drawProp3D(g, 'fearm', { alpha: 0 }); drawProp3D(g, 'feclaw', { state: st, alpha: 0 }); clawArm2D(g, f, o); return; }
  // the claw's wrist back from the tip (its pincers reach the tip), the segments from his shoulder to it, springy
  const CS = 1.3, tip = o.ext + (st === 'open' ? 5 : 0), wr = Math.max(f.r - 2, tip - 25 * CS), L = wr - (f.r - 6), n = Math.max(1, Math.ceil(L / 10.5)), wv = o.ph === 'shoot' ? 2.4 : 0.8, nx = -s, ny = c;
  const parts = [];
  for (let k = 0; k < n; k++) {
    const q = (k + 0.5) / n, d = f.r - 6 + L * q, z = Math.sin(q * Math.PI * 2 + (o.t || 0) * 30) * wv * Math.sin(q * Math.PI);
    parts.push([o.x + c * d + nx * z, o.y + s * d + ny * z, 'fearm', null, 0.92 + 0.08 * Math.sin(q * Math.PI)]);
  }
  parts.push([o.x + c * wr, o.y + s * wr, 'feclaw', st, CS]);
  parts.sort((p, q) => p[1] - q[1]);
  for (const [x, y, id, state, sc] of parts) { g.save(); g.translate(x, y - ARM_Z); drawProp3D(g, id, { yaw: o.a, state, scale: sc }); g.restore(); }
}

// the chains on someone locked: two loops of links round them (the back halves before their model, the front halves
// after it), the padlock swinging on the front; fading out as it wears off. x, y: where to draw them from (their feet)
const LOOPS = [[20, 1.15, 0.1], [32, 1.0, -0.12]];
function chains(g, f, v, front) {
  const left = f.lockT || 0, a = clamp(left / 0.3, 0, 1) * clamp((1.6 - left) / 0.12 + 0.2, 0, 1), sw = Math.sin(v.t * 3 + f.i) * 0.05, rr = (f.r || 16) + 6;
  if (a <= 0.01) return true;
  if (!propReady('felink') || !propReady('felinkf') || !propReady('felock')) { drawProp3D(g, 'felock', { alpha: 0 }); return false; }
  const pop = clamp((1.6 - left) / 0.18, 0, 1), sp = 0.6 + 0.4 * ease(pop);
  for (const [z, kx, tilt] of LOOPS) {
    const n = 12, rx = rr * kx * (1.25 - 0.25 * ease(pop));
    for (let k = 0; k < n; k++) {
      const an = k / n * TAU + v.t * 0.3 + z, sn = Math.sin(an);
      if ((sn > 0) !== front) continue;
      const x = Math.cos(an) * rx, y = -z + sn * rx * SQ + Math.cos(an) * rx * (tilt + sw);
      g.save(); g.translate(x, y); drawProp3D(g, k % 2 ? 'felinkf' : 'felink', { yaw: an + Math.PI / 2, scale: 0.8 * sp, alpha: a * (front ? 1 : 0.9) }); g.restore();
    }
  }
  if (front) {   // the padlock, hung on the upper loop's front, swinging
    const [z, kx] = LOOPS[1], y = -z + rr * kx * SQ;
    g.save(); g.translate(0, y - 2); g.rotate(Math.sin(v.t * 3.2 + f.i) * 0.16); g.translate(0, 9.6 * 1.05 * sp);
    drawProp3D(g, 'felock', { yaw: Math.PI / 2 + Math.sin(v.t * 2.1) * 0.25, scale: 1.05 * sp, alpha: a });
    g.restore();
  }
  return true;
}
// the 2D stand-in: links round their middle and a small brass lock
function chains2D(g, f, v) {
  const left = f.lockT || 0, a = clamp(left / 0.3, 0, 1);
  for (const [cy, rx] of [[-20, 23], [-32, 20]]) for (let k = 0; k < 12; k++) { const an = k / 12 * TAU + v.t * 0.4, x = Math.cos(an) * rx, y = cy + Math.sin(an) * rx * 0.32; if (Math.sin(an) < -0.2) continue; link2D(g, x, y + 5, an + Math.PI / 2, 1, a * (0.6 + 0.4 * Math.sin(an))); }
  g.save(); g.globalAlpha *= a; g.fillStyle = '#e8b23c'; g.beginPath(); g.roundRect(-6, -18, 12, 9, 2.5); g.fill(); g.restore();
}

// the whirl round him (its back half behind him, front over him): s its size, h its height, a its alpha
function whirl(g, v, half, s, h, a) {
  if (!whirlReady()) { for (const st of WHIRL) drawProp3D(g, 'fewhirl', { state: st, alpha: 0 }); return false; }
  const k = ((Math.floor(v.t * 40) % WHIRL_N) + WHIRL_N) % WHIRL_N;
  return drawProp3D(g, 'fewhirl', { state: half + k, scale: s, sy: h, alpha: a });
}
// how much of the whirl shows for f now: [size, height, alpha] or null
function whirlOf(f) {
  const k = f.pht || 0;
  if (f.ph === 'rev') { const u = clamp(k / Math.max(0.05, f.dur || 0.42), 0, 1); return [0.72 + 0.1 * u, 0.3 + 0.15 * u, 0.35 + 0.35 * u]; }
  if (f.ph === 'whirl') { const u = clamp(k / 0.12, 0, 1); return [0.85 + 0.15 * ease(u), 0.45 + 0.55 * ease(u), 0.88]; }
  if (f.ph === 'dizzy' && k < 0.35) { const u = k / 0.35; return [1 + 0.1 * u, 1 - 0.6 * u, 0.8 * (1 - u)]; }   // (the sand falling away as he settles)
  return null;
}
function whirl2D(g, f, v) {
  g.save(); g.lineCap = 'round';
  for (let k = 0; k < 3; k++) { const a0 = v.t * 16 + k * TAU / 3; g.strokeStyle = k % 2 ? `rgba(${PALE},0.4)` : 'rgba(150,120,90,0.32)'; g.lineWidth = 3; g.beginPath(); g.ellipse(f.x, f.y - 2, 24, 10, 0, a0, a0 + 1.6); g.stroke(); }
  g.restore();
}

export default {
  id: ID,
  anim(F, v, f) {
    const A = animBase(), k = f.pht || 0, t = v.t + f.i, sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
    switch (f.ph) {
      case 'clawback': sq(0.06 * ease(k / 0.15)); A.lean = -0.05; A.fwd = -2; if (f.t > (f.dur || 0) - f.stats.moves.move1.lock) A.wx = Math.sin(k * 60) * 0.6; break;   // (locked: a little tremble)
      case 'shoot': sq(-0.06); A.fwd = 3 * ease(k / 0.06); break;
      case 'reel': case 'hold': A.lean = -0.06; A.wx = Math.sin(t * 24) * 0.6; sq(0.03); break;   // (holding on)
      case 'fling': sq(-0.08 * Math.exp(-k * 9)); A.spin = -0.9 * Math.sin(Math.min(1, k / 0.25) * Math.PI); break;
      case 'clamp': return settleAnim(k, f.dur || 0.6, 'clamp', 0.25);   // (a miss: the claw snaps shut on nothing, he draws it back and settles)
      case 'decree': A.hop = Math.abs(Math.sin(k * 22)) * 2; sq(-0.04 + 0.03 * Math.sin(k * 44)); break;   // claws up, clacking
      case 'cast': sq(0.05 * Math.exp(-k * 10)); break;
      case 'rev': { const u = clamp(k / Math.max(0.05, f.dur || 0.42), 0, 1); A.wx = Math.sin(k * 70) * (0.6 + 1.4 * u); sq(0.05 + 0.04 * u); break; }   // rattling harder and harder
      case 'whirl': A.spin = k * 24; A.hop = Math.abs(Math.sin(k * 12)) * 1.5; sq(0.04); break;
      case 'dizzy': { const S = settleAnim(k, f.dur || 1, 'dizzy', 0.4); S.spin = 1.4 * (1 - ease(k / 0.35)); S.fwd = 0; return S; }   // (after the whirl: it spins down, he lands his weight and catches his breath: a settle, not a stun)
      case 'tuck': A.spin = k * 22; sq(0.04); break;
      case 'popout': { const u = clamp(k / 0.24, 0, 1); A.hop = 8 * Math.sin(u * Math.PI); sq(-0.08 * (1 - u)); break; }
      default: return null;
    }
    return A;
  },
  ground(g, F, v, o) {
    if (o.kind === 'feclaw') track(g, F, o);
    else if (o.kind === 'felock') ringShadow(g, F, o);
  },
  things(F, v, g, o, out) {
    if (o.kind === 'feclaw' && o.ph !== 'aim') out.push({ y: o.y + Math.sin(o.a) * (o.ext || 0) + 1, d: () => clawArm(g, F, v, o) });
    else if (o.kind === 'felock') chainRing(F, v, g, o, out);
  },
  behind(g, F, v, f) {
    const other = F.f[1 - f.i];
    if (!other || f.y < other.y || (f.y === other.y && f.i === 0)) ruts(g, v);   // (the shell's ruts on the floor: before whoever's drawn first)
    if ((f.lockT || 0) > 0 && f.stats && f.stats.kit3) { g.save(); g.translate(f.x, f.y); chains(g, f, v, false); g.restore(); }   // (the chains' back halves)
    if (f.id !== ID) return null;
    const W = whirlOf(f);
    if (W) { g.save(); g.translate(f.x, f.y); const ok = whirl(g, v, 'b', ...W); g.restore(); if (!ok && f.ph !== 'dizzy') whirl2D(g, f, v); }
    if (f.ph === 'rev' && frnd(0, 1) < 0.3) bit3(v, 'rock', f.x + frnd(-22, 22), f.y + frnd(-10, 10), 1, { dz: frnd(30, 60), s: frnd(1, 1.6), life: 0.3, bo: 0.3, few: true });   // (pebbles rattling)
    if (f.ph === 'whirl') {
      if (frnd(0, 1) < 0.35) { const an = frnd(0, TAU), r = 26; bit3(v, 'sand', f.x + Math.cos(an) * r, f.y + Math.sin(an) * r * 0.5, 3, { dx: -Math.sin(an) * 90, dy: Math.cos(an) * 45, dz: frnd(15, 40), g: 0, drag: 2.5, s: frnd(3, 4.5), grow: 0.9, life: 0.45, fade: 'alpha', al: 0.75, sh: false, few: true }); }
      if (frnd(0, 1) < 0.12) { const an = frnd(0, TAU); bit3(v, 'spark', f.x + Math.cos(an) * 24, f.y + Math.sin(an) * 12, 16, { dx: -Math.sin(an) * 150, dy: Math.cos(an) * 75, dz: frnd(40, 100), g: 300, bo: 0, s: frnd(1.4, 2.2), life: 0.28, sh: false, few: true }); }
    }
    if (f.ph === 'tuck') {   // the rolling shell: ruts behind it, sand thrown up
      const L = v.feRuts || (v.feRuts = []), last = L.filter(r => r[5] === f.i).pop();
      if (!last || Math.hypot(last[0] - f.x, last[1] - f.y) > 9) { L.push([f.x, f.y, v.t, Math.atan2(f.vy || 0, f.vx || 1), frnd(0, 1), f.i]); if (L.length > 40) L.shift(); }
      if (frnd(0, 1) < 0.4) bit3(v, 'sand', f.x + frnd(-6, 6), f.y + frnd(-3, 3), 2, { dx: -(f.vx || 0) * 0.15 + frnd(-15, 15), dy: -(f.vy || 0) * 0.1 + frnd(-8, 8), dz: frnd(10, 30), g: 0, drag: 2.5, s: frnd(3, 4.6), grow: 0.9, life: 0.5, fade: 'alpha', al: 0.8, sh: false, few: true });
    }
    return null;
  },
  over(g, F, v, f) {
    if ((f.lockT || 0) > 0 && f.stats && f.stats.kit3 && !chains(g, f, v, true)) chains2D(g, f, v);
    if (f.id !== ID) return;
    const W = whirlOf(f);
    if (W) whirl(g, v, 'f', ...W);
  },
  tint(F, v, f) {
    if (f.id !== ID) return null;
    if (f.ph === 'rev') { const u = clamp((f.pht || 0) / 0.42, 0, 1); return `rgba(255,120,60,${(0.08 + 0.12 * u * (0.6 + 0.4 * Math.sin(v.t * 30))).toFixed(3)})`; }   // (a warm flush as he works himself up)
    return null;
  },
  event(v, F, e, few) {
    switch (e.kind) {
      case 'feShoot': sand(v, e.x, e.y, 2, 8, few); return true;
      case 'feCatch': { const D = F.f[e.who], a = D ? Math.atan2(e.y - D.y, e.x - D.x) : 0; sparks(v, e.x, e.y, ARM_Z, 6, a + Math.PI, 2.4, few); sand(v, e.x, e.y, 3, 8, few); return true; }
      case 'feFling': sand(v, e.x, e.y, 5, 14, few, [20, 50]); bits3(v, 'rock', e.x, e.y, 2, few ? 1 : 3, { speed: [40, 90], up: [80, 140], s: [1.1, 1.8], life: [0.4, 0.6] }); return true;
      case 'feClamp': sparks(v, e.x, e.y, ARM_Z, 3, 0, TAU, few); sand(v, e.x, e.y, 2, 6, few); return true;   // (snapped shut on nothing: a clack)
      case 'feLock': sand(v, e.x, e.y, 3, 30, few); return true;
      case 'feLocked': sparks(v, e.x, e.y, 26, 7, 0, TAU, few); return true;
      case 'feLockMiss': sand(v, e.x, e.y, 4, 40, few); return true;
      case 'feUnsafe': sand(v, e.x, e.y, 6, 20, few, [20, 60]); sparks(v, e.x, e.y, 14, 4, 0, TAU, few); return true;
      case 'feSpin': { sparks(v, e.x, e.y, 18, e.last ? 9 : 4, 0, TAU, few); if (e.last) sand(v, e.x, e.y, 5, 14, few, [20, 50]); return true; }
      case 'feDizzy': sand(v, e.x, e.y, 3, 18, few); return true;
      case 'feTuck': sand(v, e.x, e.y, 4, 10, few); return true;
      case 'fePop': sand(v, e.x, e.y, 4, 10, few, [20, 50]); return true;
    }
    return false;
  },
  icon(g, kind, r, col) {
    const W = col || '#ffffff';
    g.fillStyle = W; g.strokeStyle = W; g.lineCap = 'round'; g.lineJoin = 'round';
    switch (kind) {
      case 'feClaw':   // a claw on a zigzag arm
        g.lineWidth = r * 0.12; g.beginPath(); g.moveTo(-r * 0.85, r * 0.5); for (let k = 1; k <= 4; k++) g.lineTo(-r * 0.85 + k * r * 0.22, r * 0.5 - k * r * 0.13 + (k % 2 ? -r * 0.1 : r * 0.1)); g.stroke();
        for (const s of [-1, 1]) { g.beginPath(); g.ellipse(r * 0.35, -r * 0.05 + s * r * 0.22, r * 0.42, r * 0.17, s * 0.45 - 0.5, 0, TAU); g.fill(); }
        return true;
      case 'feLock':   // two chain links
        g.lineWidth = r * 0.16;
        g.beginPath(); g.ellipse(-r * 0.28, 0, r * 0.45, r * 0.27, -0.5, 0, TAU); g.stroke();
        g.beginPath(); g.ellipse(r * 0.28, 0, r * 0.45, r * 0.27, -0.5, 0, TAU); g.stroke();
        return true;
      case 'feUnsafe':   // a whirl: curved claw smears round a dot
        g.lineWidth = r * 0.17;
        for (let k = 0; k < 3; k++) { const a0 = k * TAU / 3; g.beginPath(); g.arc(0, 0, r * 0.62, a0, a0 + 1.3); g.stroke(); }
        circle(g, 0, 0, r * 0.2); g.fill();
        return true;
      case 'feShell':   // a shell dome with a couple of spikes
        g.beginPath(); g.moveTo(-r * 0.8, r * 0.4); g.quadraticCurveTo(0, -r * 0.85, r * 0.8, r * 0.4); g.closePath(); g.fill();
        for (const x of [-0.35, 0.35]) { g.beginPath(); g.moveTo(x * r - r * 0.1, -r * 0.12); g.lineTo(x * r * 1.3, -r * 0.55); g.lineTo(x * r + r * 0.1, -r * 0.12); g.fill(); }
        return true;
    }
    return false;
  },
  sound(e) {
    switch (e.kind) {
      case 'feShoot': return [['fWhip', 0.7]];
      case 'feCatch': return [['fGrab', 0.8]];
      case 'feFling': return [['fThrow', 0.8]];
      case 'feClamp': return [['fBlock', 0.45]];
      case 'feLock': return [['fSnap', 0.6]];
      case 'feLocked': return [['fOwn', 0.85]];
      case 'feLockMiss': return [['fThaw', 0.35]];
      case 'feUnsafe': return [['fSpin', 0.85]];
      case 'feDizzy': return [['fStep', 0.4]];
      case 'feTuck': return [['fStep', 0.6]];
      case 'fePop': return [['fPopout', 0.6]];
    }
    return null;
  },
};
