// Ferris's Fight art (sim: js/kits/ferris.js). Rust orange, soft and cartoony; tells part of the floor. Claw and arm,
// chain links, padlock and sand whirl are low-poly meshes baked per fight (propsFor), with 2D stand-ins while baking.
// Borrow Claw: a scuffed track shows the line (darker once locked), a ripple of sand runs down it as the claw shoots on
// its segmented arm, snaps shut and reels them in. unsafe while holding: heave them up and spin once round, a sand
// whirl and a ring furrow, slammed out in sparks
// Ownership Lock: he swings a coil of chain and flings it onto the spot, where it pays out into a ring of links;
// closed, two loops and a swinging padlock wrap them and a ball and chain drags at their feet
// unsafe { }: a low wind round, then one spin in a vortex of sand (back half behind him, front over him); a miss spins
// on past and settles
// Shell Tuck: ruts behind the rolling shell; Shell then unsafe: skid, judder, burst into the spin
import { TAU, clamp, frnd } from '../core.js';
import { bold } from '../look.js';
import * as M3 from './model3d.js';
import { animBase, settleAnim } from './kits.js';
import { SCALE } from '../draw-fight.js';
import { bit3, bits3, decal3, defProp, drawProp3D, propReady, propsFor } from './prop3d.js';
import { H, STONE, lumpHalf, mixC, mulC } from './kit3-earth.js';
import { softShadow } from './arena-mat.js';

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
// a claw-arm segment: a rounded crab-leg segment, a dark joint ring each end (middle at the origin, along x)
function armMesh() {
  const out = [];
  tube(out, smoothProf([[-6.6, 0, 0], [0, 0, 0.3], [6.6, 0, 0]], 4), t => 2.6 + 0.9 * Math.sin(Math.PI * t), C_OR, MATTE, 1, 12);
  for (const x of [-6.3, 6.3]) ellipsoid(out, [x, 0, 0], [[0.9, 0, 0], [0, 3, 0], [0, 0, 3]], C_DK, MATTE, 14, 8, 0.6);
  tube(out, [[0, 0, 2.9], [0, 0, 4.9]], t => 1.2 - 0.9 * t, C_OR, MATTE, 0.7, 8);
  return out;
}
// the big claw: a round palm on a dark cuff, two curved toothed pincers (upper one bigger); states open, shut
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
// a chain link: a glossy blue-grey oval ring, upright (x-z plane) or flat, foot on the floor
function linkMesh(flat) {
  const out = [], N = 22, pts = [];
  for (let j = 0; j <= N; j++) { const a = j / N * TAU; pts.push(flat ? [Math.cos(a) * 5.4, Math.sin(a) * 3.3, 1.3] : [Math.cos(a) * 5.4, 0, 4.6 + Math.sin(a) * 3.3]); }
  tube(out, pts, 1.2, hex('#aab4c8'), GLOSS, 1, 10);
  return out;
}
// the padlock: round brass body, keyhole, grey shackle (facing +x; middle at the origin, shackle top 9.6 up)
function padlockMesh() {
  const out = [];
  rbox(out, [0, 0, 0], [2.5, 5.3, 4.5], hex('#efb43c'), GLOSS, 0.42);
  decal(out, [2.5, 0, 0.9], [1, 0, 0], 1.25, 1.25, 0.25, hex('#5a3a0a'), 0, 0, MATTE);
  decal(out, [2.45, 0, -0.9], [1, 0, 0], 0.55, 1.5, 0.25, hex('#5a3a0a'), 0, 0, MATTE);
  tube(out, smoothProf([[0, -3.3, 3.8], [0, -3.3, 6.6], [0, -1.8, 8.9], [0, 0, 9.6], [0, 1.8, 8.9], [0, 3.3, 6.6], [0, 3.3, 3.8]], 3), 1.2, hex('#c9cdd8'), GLOSS, 1, 10);
  return out;
}
// the ball of the ball and chain: a soft glossy blue-grey ball, rivets, a ring on top (foot on the floor, 6.5 across)
function ballMesh() {
  const out = [], C = hex('#8a94aa'), D = hex('#6a7389'), L = hex('#c3cad8');
  ball(out, [0, 0, 6.5], 6.5, C, GLOSS, 0.7, 22, 14);
  for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; ball(out, [Math.cos(a) * 6.45, Math.sin(a) * 6.45, 6.5], 0.7, D, GLOSS, 0.4, 8, 6); }
  ball(out, [0, 0, 12.6], 1.7, D, GLOSS, 0.5, 12, 8);
  tube(out, smoothProf([[0, -1.8, 12.8], [0, -1.9, 14.6], [0, 0, 16.2], [0, 1.9, 14.6], [0, 1.8, 12.8]], 3), 0.75, L, GLOSS, 1, 8);
  ball(out, [-2.2, -2.4, 10.3], 1.5, mixC(C, [1, 1, 1], 0.55), GLOSS, 0, 10, 7);   // (a soft glint)
  return out;
}
// unsafe's whirl: thin curving bands of sand and a claw-orange smear round him, pebbles caught up. States: back half
// (b0..b5) and front (f0..f5) at six turns of its spin (it repeats every third of a turn), so he stands inside it
const WHIRL_N = 6;
function whirlMesh(st) {
  const out = [], back = st[0] === 'b', ph = (+st.slice(1) || 0) / WHIRL_N * TAU / 3, cols = [hex('#cfa15e'), hex('#e6c68c'), hex('#ea6a28'), hex('#bf8f52'), hex('#dcb57a')];
  // bands of whipped-up sand: tall thin sheets curving round him, each tapering at both ends, at their own heights
  const B = [0, 1, 2].flatMap(k => [[k * TAU / 3, 3, 1.6, 44, 7, [0, 1, 4][k]], [k * TAU / 3 + 1.05, 16, 1.3, 50, 5.5, [2, 3, 1][k]], [k * TAU / 3 + 0.5, 8, 1.1, 30, 5, [3, 0, 2][k]]]);   // (out to the spin's reach, his edge + 36 = 55; repeats every third of a turn)
  for (const [a0, z, len, r, hgt, ci] of B) {
    const P = [];
    for (let j = 0; j <= 14; j++) { const t = j / 14, an = ph + a0 + t * len; P.push([Math.cos(an) * (r + 3 * t), Math.sin(an) * (r + 3 * t), z + 3 * t]); }
    M3.sweep(out, P, t => 0.5 + 1.7 * Math.sin(Math.PI * t), t => 0.5 + hgt * 1.35 * Math.pow(Math.sin(Math.PI * t), 0.7), [0, 0, 1], cols[ci], MATTE, 0.5, 10);
  }
  for (let k = 0; k < 3; k++) { const an = ph + k * TAU / 3 + 1.1, r = 47; lumpHalf(out, [Math.cos(an) * r, Math.sin(an) * r, 14], [1.5, 1.4, 1.3], 7 + k, 5, 3, 0.35, (n, c, i) => mulC(STONE, 0.9 + 0.2 * H(i)), 0.6, 0); }   // (pebbles caught up in it)
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
defProp('feball', { mesh: ballMesh, n: 1, ink: '#3c4357' });
const WHIRL = [...Array(WHIRL_N).keys()].flatMap(k => ['b' + k, 'f' + k]);
defProp('fewhirl', { mesh: whirlMesh, n: 1, ink: '#8a6a40', out: 0.5, states: WHIRL });
propsFor(ID, ['fearm', 'feclaw/open', 'feclaw/shut', 'felink', 'felinkf', 'felock', 'feball', ...WHIRL.map(s => 'fewhirl/' + s), 'crumbs/sand', 'bit:sand']);
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
  // the claw spin's furrow: a ring where the swung foe dragged their feet, deepest where they were slammed out, drying over 1.8 s
  const R = v.feSpinRut;
  if (R && R.length) for (let i = R.length - 1; i >= 0; i--) {
    const [x, y, at, a, h] = R[i], k = (v.t - at) / 1.8; if (k >= 1) { R.splice(i, 1); continue; }
    const al = (0.55 + 0.4 * h) * (1 - k * k);
    if (!decal3(g, 'crumbs', x, y, 9 + h * 4, { state: 'sand', yaw: a, alpha: al })) { g.fillStyle = `rgba(${SAND},${(0.2 * al).toFixed(3)})`; g.beginPath(); g.ellipse(x, y, 9 + h * 3, 4.5, a, 0, TAU); g.fill(); }
  }
  const L = v.feRuts; if (!L || !L.length) return;
  for (let i = L.length - 1; i >= 0; i--) {
    const [x, y, at, a, h] = L[i], k = (v.t - at) / 1.2; if (k >= 1) { L.splice(i, 1); continue; }
    if (!decal3(g, 'crumbs', x, y, 8 + h * 2, { state: 'sand', yaw: a + (h - 0.5) * 0.4, alpha: 0.75 * (1 - k * k) })) { g.fillStyle = `rgba(${SAND},${(0.16 * (1 - k)).toFixed(3)})`; g.beginPath(); g.ellipse(x, y, 8, 4, a, 0, TAU); g.fill(); }
  }
}

// ---------------------------------------------------------------- the floor
// the claw's line while he cocks it: a scuffed track with scratch pairs and heaped sand, darker once locked
function track(g, F, o) {
  if (o.ph !== 'aim') return;
  const f = F.f[o.owner], a = clamp(o.t / 0.2, 0, 1) * (o.lock ? 1 : 0.75), c = Math.cos(o.a), s = Math.sin(o.a), x0 = o.x + c * f.r, y0 = o.y + s * f.r, L = o.len - f.r;
  const gr = g.createLinearGradient(x0, y0, x0 + c * L, y0 + s * L);
  gr.addColorStop(0, `rgba(${SAND},${(0.2 * a).toFixed(3)})`); gr.addColorStop(0.85, `rgba(${SAND},${(0.14 * a).toFixed(3)})`); gr.addColorStop(1, `rgba(${SAND},0)`);
  g.save(); g.lineCap = 'round'; g.strokeStyle = gr;
  g.globalAlpha = 0.5; g.lineWidth = o.w * 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + c * L, y0 + s * L); g.stroke();   // (soft edges: a wide faint band, a narrower one down its middle)
  g.globalAlpha = 1; g.lineWidth = o.w * 1.15; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + c * L, y0 + s * L); g.stroke();
  const D3 = propReady('crumbs', 'sand');
  for (let d = 16; d < L - 8; d += 30) {   // little sets of claw scratches scuffed into it (each a pale line over a dark one), uneven
    const k = 1 - d / L, j = (Math.sin(d * 1.7 + o.id) * 0.5) * 6, x = x0 + c * d - s * j, y = y0 + s * d + c * j, al = a * (0.35 + 0.5 * k), tw = Math.sin(d * 2.3) * 0.35;
    if (D3) for (const sd of [-1, 1]) decal3(g, 'crumbs', x - s * sd * (o.w + 3), y + c * sd * (o.w + 3), 5.5, { state: 'sand', yaw: o.a, alpha: al * 0.8 });   // (sand pushed up along its sides)
    for (let m = -1; m <= 1; m++) for (const [col, lw, off] of [[`rgba(${PALE},${(0.5 * al).toFixed(3)})`, 1.8, -0.6], [`rgba(${SAND},${(0.5 * al).toFixed(3)})`, 0.9, 0.3]]) {
      const px = x - s * m * 3.2, py = y + c * m * 3.2, ca = Math.cos(o.a + tw), sa = Math.sin(o.a + tw), h = 3.5 - Math.abs(m);
      g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(px - ca * h + off, py - sa * h + off); g.lineTo(px + ca * h + off, py + sa * h + off); g.stroke();
    }
  }
  // locked: a ripple of sand runs down the line, reaching its end just as the claw shoots (its clock)
  if (o.lock && f.state === 'wind') {
    const mv = f.stats.moves.move1, u = clamp((f.t - ((f.dur || mv.startup) - mv.lock)) / mv.lock, 0, 1), d = L * ease(u), px = x0 + c * d, py = y0 + s * d;
    const gl = g.createRadialGradient(px, py, 0, px, py, o.w * 1.3);
    gl.addColorStop(0, `rgba(${PALE},0.75)`); gl.addColorStop(0.5, `rgba(${PALE},0.3)`); gl.addColorStop(1, `rgba(${PALE},0)`);
    g.fillStyle = gl; g.beginPath(); g.ellipse(px, py, o.w * 1.3, o.w * 1.3, 0, 0, TAU); g.fill();
    const tl = g.createLinearGradient(x0, y0, px, py);
    tl.addColorStop(0, `rgba(${SAND},0)`); tl.addColorStop(1, `rgba(${SAND},0.22)`);
    g.strokeStyle = tl; g.lineWidth = o.w * 0.9; g.beginPath(); g.moveTo(x0, y0); g.lineTo(px, py); g.stroke();
  }
  g.restore();
}
// a 2D chain link standing on the floor (the stand-in): a soft grey oval ring, lighter on top, its shadow under it
function link2D(g, x, y, an, k, a) {
  if (k <= 0.02 || a <= 0.02) return;
  const s = 0.5 + 0.5 * k, h = 5 * k;
  softShadow(g, x + 1, y + 1, 6.5 * s, 3.1 * s, 0.22 * a, an);
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
// ---------------------------------------------------------------- Ownership Lock's coil of chain
// Sim clock unchanged: the ring spawns at the press and closes form s later; he can be hit out only in the startup. The
// coil swings round his raised claw over the startup (lasso pose), is flung (fling pose) in an arc onto the spot and
// pays out into the ring, the last link landing as it closes. Hit out of the wind-up, it drops at his feet.
const CSE = Math.sin(M3.ELEV), CCE = Math.cos(M3.ELEV), COIL_N = 26, COIL_R = 7;
const CLAW_UP = [2, -19, 36];   // (the lasso pose's raised claw, its pincers' tips: model units, x forward, y his left, z up)
const angD = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
// a point on his model, where it is now (his yaw, his move's anim): [x, y on the floor, height] from his feet
function onModel(f, A, p) {
  const yaw = M3.camYaw(ID, f.face + 0.35 * Math.sin(Math.PI / 2 - f.face) + (A ? A.spin : 0)), c = Math.cos(yaw), s = Math.sin(yaw), S = SCALE * (A ? A.s : 1);
  const gx = (c * p[0] + s * p[1]) * S * (A ? A.sx : 1), gy = (s * p[0] - c * p[1]) * S * CSE, z = p[2] * S * CCE * (A ? A.sy : 1);
  const fw = A ? A.fwd : 0;
  return [gx + Math.cos(f.face) * fw + (A ? A.wx : 0), gy + Math.sin(f.face) * fw, z + (A ? A.hop : 0) + (f.z || 0)];
}
const ringOf = (F, f) => { let r = null; for (const b of F.objs) if (b.kind === 'felock' && b.owner === f.i && b.ph === 'form' && (!r || b.id > r.id)) r = b; return r; };
// how far he turns to throw it at the ring (rad, added to his yaw)
const throwTurn = (F, f, o) => o ? clamp(angD(Math.atan2(o.y - f.y, o.x - f.x), f.face), -1.3, 1.3) : 0;
// the coil's clock for the ring o: T0 it leaves his claw (the cast), T1 it lands; D how far it flies
function coilClock(F, v, o) {
  const mv = F.f[o.owner].stats.moves.move3, f = F.f[o.owner], C = v.feCoil && v.feCoil[o.id];
  const D = C ? Math.hypot(o.x - C.x, o.y - C.y) : Math.hypot(o.x - f.x, o.y - f.y);
  const T0 = mv.startup, T1 = T0 + 0.12 + 0.1 * clamp(D / 300, 0, 1);
  return { T0, T1, D, C, mv };
}
// the swing's angle (u: the wind-up, 0..1): 1.65 turns, picking up speed, ending on the side toward the spot
const swingAng = (f, o, u) => Math.atan2(o.y - f.y, o.x - f.x) - 1.4 * TAU * (1 - u) * (1 - u) - 0.25 * TAU * (1 - u);
// where the coil swings round his raised claw (u 0..1): its middle [x, y, z], the claw tip, the angle; it ends on the
// side he throws toward, so it leaves going their way
function swingOf(F, v, f, o, u) {
  const A = f.ph === 'decree' ? ART_F.anim(F, v, f) : null, [cx, cy, cz] = onModel(f, A, CLAW_UP), th = swingAng(f, o, u), rs = 4 + 13 * ease(u);
  return { x: f.x + cx + Math.cos(th) * rs, y: f.y + cy + Math.sin(th) * rs * 0.5, z: cz - 3 - 3 * (1 - u) + Math.sin(th * 2) * 1.5 * u, hx: f.x + cx, hy: f.y + cy, hz: cz + 2, th };
}
// the coil: links wound twice (cr out), turned spin, tipped tilt (0 flat, PI/2 on edge) about its flight dir, at (x, y)
// lifted z; drawn back to front
function coil(g, x, y, z, spin, tilt, dir, a, s = 0.8) {
  const L = [], ct = Math.cos(tilt), st = Math.sin(tilt), cd = Math.cos(dir), sd = Math.sin(dir);
  for (let k = 0; k < COIL_N; k++) {
    const q = k / COIL_N, an = spin + q * 2 * TAU, r = COIL_R * (0.75 + 0.45 * q), u = Math.cos(an) * r, w = Math.sin(an) * r;   // (u along its way, w across, in its own plane)
    const lx = u * ct, lz = u * st + q * 2.4;   // (tipped about the across axis: along becomes up)
    L.push([x + cd * lx - sd * w, y + (sd * lx + cd * w) * 0.5, z + lz, an + Math.PI / 2 + dir, k % 2 === 1]);
  }
  L.sort((p, q) => p[1] - q[1]);
  for (const [lx, ly, lz, an, flat] of L) link3(g, lx, ly, lz, an, 1, a, flat, s);
}
function coilShadow(g, x, y, z, a) {
  const k = 1 / (1 + Math.max(0, z) / 60);
  softShadow(g, x + 1, y + 1, (COIL_R + 7) * (0.7 + 0.3 * k), (COIL_R + 7) * 0.45 * (0.7 + 0.3 * k), 0.26 * a * k);
}
const once = (v, key) => { const S = v.feLinks || (v.feLinks = new Set()); if (S.has(key)) return false; if (S.size > 400) S.clear(); S.add(key); return true; };
// the coil before it lands: swung round his claw (on a short length of chain), flying in its arc, or dropped
function coilThings(F, v, g, o, out, T) {
  const f = F.f[o.owner], mv = T.mv;
  const M = v.feCoil || (v.feCoil = {});
  if (o.ph === 'miss') {   // hit out of the wind-up: the coil drops at his feet
    const C = T.C; if (!C) return;
    const k = clamp((o.t - (o.life - 0.25)) / 0.25, 0, 1), z = Math.max(0, C.z * (1 - k * k));
    if (k >= 1 && once(v, o.id * 64 + 63)) sand(v, C.x, C.y, 2, 8, false, [8, 20]);
    out.push({ y: C.y, d: () => { coilShadow(g, C.x, C.y, z, 1 - k); coil(g, C.x, C.y, z, C.th, 0.2 * (1 - k), 0, 1 - 0.6 * k); } });
    return;
  }
  if (o.t < T.T0) {   // the wind-up: swung round his raised claw, faster and wider
    const u = clamp(o.t / mv.startup, 0, 1), S = swingOf(F, v, f, o, u);
    M[o.id] = { x: S.x, y: S.y, z: S.z, th: S.th }; const ids = Object.keys(M); if (ids.length > 12) delete M[ids[0]];
    out.push({ y: S.y + 0.5, d: () => {
      coilShadow(g, S.x, S.y, S.z, 0.6);
      for (let j = 1; j <= 2; j++) { const q = j / 3; link3(g, S.hx + (S.x - S.hx) * q, S.hy + (S.y - S.hy) * q, S.hz + (S.z + 4 - S.hz) * q, Math.atan2(S.y - S.hy, S.x - S.hx), 1, 1, j % 2 === 1, 0.7); }
      coil(g, S.x, S.y, S.z, S.th * 0.5, 0.35 + 0.35 * u, S.th + Math.PI / 2, 1);
    } });
    return;
  }
  // flying: in an arc from where it left his claw onto the spot, spinning and tumbling over once
  const C = T.C || { x: f.x, y: f.y, z: 40, th: 0 }, p = clamp((o.t - T.T0) / (T.T1 - T.T0), 0, 1), H = 16 + T.D * 0.1;
  const x = C.x + (o.x - C.x) * p, y = C.y + (o.y - C.y) * p, z = C.z * (1 - p) + 2 * p + H * 4 * p * (1 - p), dir = Math.atan2(o.y - C.y, o.x - C.x);
  out.push({ y, d: () => { coilShadow(g, x, y, z, 0.4 + 0.6 * p); coil(g, x, y, z, (C.th || 0) * 0.5 + o.t * 9, 0.7 * (1 - p) + 0.15, dir, 1); } });
}
// the ring: the coil, then its links paying out to their places; shut: snapping in; missed: sinking back
function chainRing(F, v, g, o, out) {
  const T = coilClock(F, v, o), mv = T.mv, R = o.R, n = COIL_N;
  if ((o.ph === 'form' && o.t < T.T1) || (o.ph === 'miss' && o.life - 0.25 < T.T0 + 0.01)) { coilThings(F, v, g, o, out, T); return; }
  const w = o.ph === 'form' ? clamp((o.t - T.T1) / Math.max(0.05, mv.form - T.T1), 0, 1) : 1, end = o.ph === 'form' ? 0 : clamp((o.t - mv.form) / 0.35, 0, 1);
  const shrink = o.ph === 'shut' ? 1 - 0.55 * ease(end) : 1, a = o.ph === 'form' ? 1 : o.ph === 'shut' ? 1 - ease(end) : 1 - end;
  if (o.ph === 'form' && once(v, o.id * 64 + 62)) {   // (landed: a clank, a puff of sand, a glint)
    sand(v, o.x, o.y, 5, 12, false, [15, 40]);
    bit3(v, 'glint', o.x, o.y, 10, { g: 0, dz: 0, life: 0.25, s: 5, sp: 140, fade: 'shrink', sh: false });
  }
  const spin0 = ((T.C && T.C.th) || 0) * 0.5 + T.T1 * 9;
  for (let k = 0; k < n; k++) {
    const q = k / n, an = q * TAU + o.id, flat = k % 2 === 1;
    let x, y, z = o.ph === 'miss' ? -4 * end : 0, ang = an, s = o.ph === 'shut' ? 1 - 0.2 * end : 1;
    if (o.ph === 'form' && w < 1) {   // paying out: from its turn of the coil, round and out to its place on the ring
      const e = ease(clamp((w - 0.5 * (1 - q)) / 0.5, 0, 1)), ca = spin0 + q * 2 * TAU, cr = COIL_R * (0.75 + 0.45 * q), da = ((an - ca) % TAU + TAU) % TAU;
      ang = ca + da * e; const r = cr + (R - cr) * e;
      x = o.x + Math.cos(ang) * r; y = o.y + Math.sin(ang) * r * (0.5 + 0.43 * e); z = (2 + q * 2.4) * (1 - e) + 7 * Math.sin(Math.PI * e); s = 0.8 + 0.2 * e;
      if (e > 0.9 && k % 2 && once(v, o.id * 64 + k)) bits3(v, 'sand', x, y, 2, 1, { speed: [10, 30], up: [10, 25], g: 0, drag: 3, s: [2.2, 3.2], grow: 0.8, life: [0.3, 0.45], fade: 'alpha', al: 0.55, sh: false, few: true });
    } else { const r = R * shrink; x = o.x + Math.cos(an) * r; y = o.y + Math.sin(an) * r * 0.93; }
    out.push({ y, d: () => link3(g, x, y, z, ang + Math.PI / 2, 1, a * (o.ph === 'miss' ? 1 - end * 0.5 : 1), flat, s) });
  }
}
// the ring's spot: a soft shadow where it'll close, darkening as the coil comes (the tell from the press on)
function ringShadow(g, F, o) {
  if (o.ph !== 'form') return;
  const mv = F.f[o.owner].stats.moves.move3, u = clamp(o.t / mv.form, 0, 1);
  softShadow(g, o.x, o.y, o.R * 1.12, o.R * 1.04, 0.08 + 0.1 * u);
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
  softShadow(g, (sx + ex) / 2 + 1, (sy + ey) / 2 + 1, Math.hypot(ex - sx, ey - sy) / 2 + 5, 5, 0.2, o.a);
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

// the chains on someone locked: two loops (back halves before their model, fronts after), the padlock swinging on the
// front, fading as it wears off; x, y their feet
const LOOPS = [[20, 1.15, 0.1], [32, 1.0, -0.12]];
function chains(g, f, v, front, T = 2) {   // (T: the lock's length, Ferris's move3.lock: they fade in from it)
  const left = f.lockT || 0, a = clamp(left / 0.3, 0, 1) * clamp((T - left) / 0.12 + 0.2, 0, 1), sw = Math.sin(v.t * 3 + f.i) * 0.05, rr = (f.r || 16) + 6;
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
const lockLen = (F, f) => { const o = F.f[1 - f.i], m = o && o.stats.moves.move3; return m && m.lock || 2; };
// the 2D stand-in: links round their middle and a small brass lock
function chains2D(g, f, v) {
  const left = f.lockT || 0, a = clamp(left / 0.3, 0, 1);
  for (const [cy, rx] of [[-20, 23], [-32, 20]]) for (let k = 0; k < 12; k++) { const an = k / 12 * TAU + v.t * 0.4, x = Math.cos(an) * rx, y = cy + Math.sin(an) * rx * 0.32; if (Math.sin(an) < -0.2) continue; link2D(g, x, y + 5, an + Math.PI / 2, 1, a * (0.6 + 0.4 * Math.sin(an))); }
  g.save(); g.globalAlpha *= a; g.fillStyle = '#e8b23c'; g.beginPath(); g.roundRect(-6, -18, 12, 9, 2.5); g.fill(); g.restore();
}

// the ball and chain: the ball dragged on the floor, three links to their ankle, a furrow behind (v.feDrag), fading
function chainA(o) { return o.ph === 'off' ? clamp((o.life - o.t) / 0.5, 0, 1) : clamp(o.t / 0.12, 0, 1); }
function dragFloor(g, F, v, o) {
  const a = chainA(o), L = v.feDrag || (v.feDrag = []), last = L.filter(r => r[5] === o.id).pop();
  if (o.ph === 'on' && (!last || Math.hypot(last[0] - o.bx, last[1] - o.by) > 7)) { L.push([o.bx, o.by, v.t, Math.atan2(o.y - o.by, o.x - o.bx), frnd(0, 1), o.id]); if (L.length > 30) L.shift(); }
  for (let i = L.length - 1; i >= 0; i--) {
    const [x, y, at, an, h] = L[i], k = (v.t - at) / 1.4; if (k >= 1) { L.splice(i, 1); continue; }
    if (!decal3(g, 'crumbs', x, y, 6 + h * 2, { state: 'sand', yaw: an, alpha: 0.7 * (1 - k * k) })) { g.fillStyle = `rgba(${SAND},${(0.16 * (1 - k)).toFixed(3)})`; g.beginPath(); g.ellipse(x, y, 6, 3, an, 0, TAU); g.fill(); }
  }
  softShadow(g, o.bx + 1.5, o.by + 1.5, 10, 4.6, 0.25 * a);
}
function ballChain(g, F, v, o) {
  const a = chainA(o), f = F.f[o.to]; if (a <= 0.01 || !f) return;
  const ax = o.ph === 'off' ? o.bx + (o.x - o.bx) * 0.6 : f.x - (f.x - o.bx) * 0.25, ay = o.ph === 'off' ? o.by + (o.y - o.by) * 0.6 : f.y - (f.y - o.by) * 0.25 + 1, az = o.ph === 'off' ? 0 : 7;
  const an = Math.atan2(ay - o.by, ax - o.bx), ok = propReady('feball') && propReady('felink') && propReady('felinkf');
  for (let k = 0; k < 3; k++) {   // the links from the ball's ring up to their ankle, sagging
    const u = (k + 0.7) / 3.4, x = o.bx + (ax - o.bx) * u, y = o.by + (ay - o.by) * u, z = 11 + (az - 11) * u - 4 * Math.sin(u * Math.PI);
    if (ok) { g.save(); g.translate(x, y - Math.max(1, z)); drawProp3D(g, k % 2 ? 'felinkf' : 'felink', { yaw: an, scale: 0.62, alpha: a }); g.restore(); }
    else link2D(g, x, y - z, an, 1, a);
  }
  g.save(); g.translate(o.bx, o.by);
  if (!ok || !drawProp3D(g, 'feball', { yaw: an, alpha: a })) { drawProp3D(g, 'feball', { alpha: 0 }); g.globalAlpha *= a; g.fillStyle = '#7d879c'; circle(g, 0, -6, 6.5); g.fill(); g.fillStyle = '#c3cad8'; circle(g, -2, -8.5, 2); g.fill(); }
  g.restore();
  const sp = Math.hypot(f.vx || 0, f.vy || 0);
  if (o.ph === 'on' && sp > 25 && frnd(0, 1) < 0.25) bit3(v, 'sand', o.bx + frnd(-4, 4), o.by + frnd(-2, 2), 2, { dx: (f.vx || 0) * 0.2 + frnd(-12, 12), dy: (f.vy || 0) * 0.1 + frnd(-6, 6), dz: frnd(8, 22), g: 0, drag: 2.5, s: frnd(2.6, 3.8), grow: 0.9, life: 0.45, fade: 'alpha', al: 0.7, sh: false, few: true });   // (sand pushed up as it's dragged)
}
// the whirl round him (its back half behind him, front over him): s its size, h its height, a its alpha
function whirl(g, v, half, s, h, a) {
  if (!whirlReady()) { for (const st of WHIRL) drawProp3D(g, 'fewhirl', { state: st, alpha: 0 }); return false; }
  const k = ((Math.floor(v.t * 40) % WHIRL_N) + WHIRL_N) % WHIRL_N;
  return drawProp3D(g, 'fewhirl', { state: half + k, scale: s, sy: h, alpha: a });
}
// s since unsafe's spin began ('spin', then 'spun' or 'spent'), in sim time so the hitstop holds it
const sinceSpin = f => (f.pht || 0) + (f.ph === 'spin' ? 0 : f.ph === 'spent' ? f.stats.moves.move2.active : 0.12);
// the spin's turn (added to his yaw): once round from the wind back to square (a miss carries on past a little)
const spinTurn = k => -0.55 + (TAU + 0.55) * ease(k / 0.22);
// how much of the whirl shows for f now: [size, height, alpha] or null
function whirlOf(f) {
  const k = f.pht || 0;
  if (f.ph === 'brace') { const u = clamp(k / Math.max(0.05, f.dur || 0.18), 0, 1); return [0.62 + 0.1 * u, 0.18 + 0.1 * u, 0.25 + 0.3 * u]; }
  if (f.ph === 'heave') { const u = clamp(k / 0.12, 0, 1); return [0.8, 0.12 + 0.18 * u, 0.2 + 0.4 * u]; }   // // (the claw's spin: sand stirring as he digs in,
  if (f.ph === 'clawspin') { const u = clamp(k / 0.06, 0, 1); return [1.05 + 0.15 * ease(u), 0.35 + 0.3 * ease(u), 0.95]; }   // // then a bigger whirl,
  if (f.ph === 'slung') { const u = clamp(k / 0.34, 0, 1); return [1.2 + 0.1 * u, 0.65 - 0.5 * u, 0.85 * (1 - u)]; }   // // falling away as he lets go)
  if (f.ph === 'spin' || f.ph === 'spun' || f.ph === 'spent') {
    const s = sinceSpin(f);
    if (s < 0.26) { const u = clamp(s / 0.06, 0, 1); return [0.8 + 0.2 * ease(u), 0.3 + 0.25 * ease(u), 0.9]; }
    if (s < 0.6) { const u = (s - 0.26) / 0.34; return [1 + 0.12 * u, 0.55 - 0.4 * u, 0.85 * (1 - u)]; }   // (the sand falling away as he settles)
  }
  return null;
}
function whirl2D(g, f, v) {
  g.save(); g.lineCap = 'round';
  for (let k = 0; k < 3; k++) { const a0 = v.t * 16 + k * TAU / 3; g.strokeStyle = k % 2 ? `rgba(${PALE},0.4)` : 'rgba(150,120,90,0.32)'; g.lineWidth = 3; g.beginPath(); g.ellipse(f.x, f.y - 2, 50, 21, 0, a0, a0 + 1.6); g.stroke(); }
  g.restore();
}

const CUES = new WeakMap();   // (per fight: the cues already played)
const ART_F = {
  id: ID,
  anim(F, v, f) {
    const A = animBase(), k = f.pht || 0, t = v.t + f.i, sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
    switch (f.ph) {
      case 'clawback': sq(0.06 * ease(k / 0.15)); A.lean = -0.05; A.fwd = -2; if (f.t > (f.dur || 0) - f.stats.moves.move1.lock) A.wx = Math.sin(k * 60) * 0.6; break;   // (locked: a little tremble)
      case 'shoot': sq(-0.06); A.fwd = 3 * ease(k / 0.06); break;
      case 'reel': case 'hold': A.lean = -0.06; A.wx = Math.sin(t * 24) * 0.6; sq(0.03); break;   // (holding on)
      case 'heave': { const u = clamp(k / 0.12, 0, 1); sq(0.14 * Math.sin(Math.PI * u) - 0.06 * u); A.lean = -0.1 * ease(u); A.hop = 2 * ease(u); A.wx = Math.sin(t * 70) * 0.9 * (1 - u * 0.5); break; }   // (unsafe with them in his claw: dug in, heaving them up off the floor, straining)
      case 'clawspin': { const u = clamp(k / 0.34, 0, 1); sq(-0.06 + 0.03 * Math.sin(u * TAU * 2)); A.lean = 0.09; A.hop = 2 + 3 * Math.sin(Math.PI * u); break; }   // (round once with them: leaning out against the weight, up on his toes; the turn is his facing, the sim's)
      case 'slung': return settleAnim(k, f.dur || 0.32, 'whirl', 0.14);   // (let go: he lands his weight and settles)
      case 'fling': sq(-0.08 * Math.exp(-k * 9)); A.spin = -0.9 * Math.sin(Math.min(1, k / 0.25) * Math.PI); break;
      case 'clamp': return settleAnim(k, f.dur || 0.6, 'clamp', 0.25);   // (a miss: the claw snaps shut on nothing, he draws it back and settles)
      case 'decree': {   // the coil of chain swung round his raised claw, turning to the spot, his weight swaying with each turn of it
        const o = ringOf(F, f), u = clamp(k / Math.max(0.05, f.dur || f.stats.moves.move3.startup), 0, 1);
        A.pose = 'lasso'; A.spin = throwTurn(F, f, o) * ease(u / 0.7); A.lean = -0.03 - 0.04 * u;
        if (o) { const th = swingAng(f, o, u); A.wx = Math.cos(th) * 1.4 * u; sq(0.025 * Math.sin(th) * u); }
        break;
      }
      case 'cast': {   // the throw: the claw swung over and forward (the fling pose), a lunge after it, then back to his stance
        const o = ringOf(F, f), S = settleAnim(k, 0.35, 'fling', 0.16), e = Math.exp(-k * 10);
        S.sx *= 1 + 0.07 * e; S.sy *= 1 - 0.07 * e; S.fwd = 4 * Math.sin(clamp(k / 0.22, 0, 1) * Math.PI); S.lean = 0.08 * e;
        S.spin = throwTurn(F, f, o) * (1 - ease((k - 0.12) / 0.3));
        return S;
      }
      case 'brace': { const u = clamp(k / Math.max(0.05, f.dur || 0.18), 0, 1); A.spin = -0.55 * ease(u); sq(0.1 * ease(u)); A.fwd = -2 * ease(u); A.wx = Math.sin(k * 80) * 0.7 * u; break; }   // (winding round, low, claws cocked: quick, it's a HIT)
      case 'spin': case 'spun': {   // one brutal spin, claws out: a stretch as it goes, a little hop, square again
        const s = sinceSpin(f); A.spin = spinTurn(s); sq(-0.08 * Math.exp(-s * 12) + 0.04); A.hop = 3 * Math.sin(clamp(s / 0.24, 0, 1) * Math.PI); A.fwd = 2 * ease(s / 0.1);
        if (f.ph === 'spun' && k > 0.12) { const S = settleAnim(k - 0.12, (f.dur || 0.32) - 0.12, 'whirl', 0.06); S.spin = spinTurn(s); return S; }
        break;
      }
      case 'spent': {   // a miss: the spin carries on past, then he lands his weight and settles (no stun look)
        const S = settleAnim(k, f.dur || 0.6, 'dizzy', 0.3);
        S.spin = TAU + 0.7 * Math.sin(clamp(k / 0.22, 0, 1) * Math.PI / 2) * (1 - ease((k - 0.22) / 0.3)); S.fwd = 0;
        return S;
      }
      case 'tuck': A.spin = k * 22; sq(0.04); break;
      case 'burst': {   // Shell then unsafe: the shell skids to a stop, judders, swelling, about to burst open (still the shell pose)
        const u = clamp(k / Math.max(0.05, f.dur || 0.18), 0, 1);
        A.spin = 22 * 0.06 * (1 - ease(u / 0.4)) + Math.sin(k * 70) * 0.12 * u; sq(0.04 + 0.1 * ease(u) + Math.sin(k * 90) * 0.03 * u); A.wx = Math.sin(k * 85) * 1.1 * u;
        break;
      }
      case 'popout': { const u = clamp(k / 0.24, 0, 1); A.hop = 8 * Math.sin(u * Math.PI); sq(-0.08 * (1 - u)); break; }
      default: return null;
    }
    return A;
  },
  ground(g, F, v, o) {
    if (o.kind === 'feclaw') track(g, F, o);
    else if (o.kind === 'felock') ringShadow(g, F, o);
    else if (o.kind === 'fechain') dragFloor(g, F, v, o);
  },
  things(F, v, g, o, out) {
    if (o.kind === 'feclaw' && o.ph !== 'aim') out.push({ y: o.y + Math.sin(o.a) * (o.ext || 0) + 1, d: () => clawArm(g, F, v, o) });
    else if (o.kind === 'fechain') out.push({ y: o.by, d: () => ballChain(g, F, v, o) });
    else if (o.kind === 'felock') chainRing(F, v, g, o, out);
  },
  behind(g, F, v, f) {
    const other = F.f[1 - f.i];
    if (!other || f.y < other.y || (f.y === other.y && f.i === 0)) ruts(g, v);   // (the shell's ruts on the floor: before whoever's drawn first)
    if ((f.lockT || 0) > 0) { g.save(); g.translate(f.x, f.y); chains(g, f, v, false, lockLen(F, f)); g.restore(); }   // (the chains' back halves)
    if (f.id !== ID) return null;
    const W = whirlOf(f);
    if (W) { g.save(); g.translate(f.x, f.y); const ok = whirl(g, v, 'b', ...W); g.restore(); if (!ok && (f.ph === 'brace' || f.ph === 'spin' || f.ph === 'clawspin')) whirl2D(g, f, v); }
    if (f.ph === 'brace' && frnd(0, 1) < 0.35) bit3(v, 'sand', f.x + frnd(-14, 14), f.y + frnd(-6, 6), 2, { dx: frnd(-20, 20), dy: frnd(-10, 10), dz: frnd(8, 20), g: 0, drag: 2.5, s: frnd(2.6, 3.8), grow: 0.9, life: 0.4, fade: 'alpha', al: 0.7, sh: false, few: true });   // (sand stirring as he winds round)
    if (f.ph === 'spin') {   // sand flung off round him, sparks off the claws' tips as they come round
      const an = f.face + spinTurn(sinceSpin(f)), tx = Math.cos(an), ty = Math.sin(an);
      if (frnd(0, 1) < 0.6) bit3(v, 'sand', f.x + tx * 50, f.y + ty * 25, 4, { dx: -ty * 120 + tx * 30, dy: tx * 60 + ty * 15, dz: frnd(15, 40), g: 0, drag: 2.5, s: frnd(3, 4.5), grow: 0.9, life: 0.4, fade: 'alpha', al: 0.75, sh: false, few: true });
      if (frnd(0, 1) < 0.3) bit3(v, 'spark', f.x + tx * 52, f.y + ty * 26, 14, { dx: -ty * 170, dy: tx * 85, dz: frnd(40, 100), g: 300, bo: 0, s: frnd(1.4, 2.2), life: 0.26, sh: false, few: true });
    }
    if ((f.ph === 'heave' || f.ph === 'clawspin') && f.hold >= 0 && F.f[f.hold]) {   // the claw's spin: whoever he holds swung round, their feet ploughing a ring in the sand
      const o = F.f[f.hold], ta = f.face + Math.PI / 2, sp = f.ph === 'clawspin';
      const L = v.feSpinRut || (v.feSpinRut = []), last = L[L.length - 1];
      if (sp && (!last || Math.hypot(last[0] - o.x, last[1] - o.y) > 7)) { L.push([o.x, o.y, v.t, ta, clamp((f.pht || 0) / 0.34, 0, 1)]); if (L.length > 40) L.shift(); }
      if (frnd(0, 1) < (sp ? 0.7 : 0.3)) bit3(v, 'sand', o.x + frnd(-5, 5), o.y + frnd(-3, 3), 3, { dx: Math.cos(ta) * frnd(sp ? 90 : 10, sp ? 160 : 30) + frnd(-15, 15), dy: Math.sin(ta) * frnd(sp ? 45 : 5, sp ? 80 : 15) + frnd(-8, 8), dz: frnd(15, 40), g: 0, drag: 2.5, s: frnd(3, 4.8), grow: 0.9, life: 0.45, fade: 'alpha', al: 0.75, sh: false, few: true });
      if (sp && frnd(0, 1) < 0.25) bit3(v, 'spark', (f.x + o.x) / 2, (f.y + o.y) / 2, 16, { dx: Math.cos(ta) * 150, dy: Math.sin(ta) * 75, dz: frnd(40, 90), g: 300, bo: 0, s: frnd(1.4, 2.2), life: 0.24, sh: false, few: true });   // (sparks where the claw bites)
    }
    if (f.ph === 'tuck') {   // the rolling shell: ruts behind it, sand thrown up
      const L = v.feRuts || (v.feRuts = []), last = L.filter(r => r[5] === f.i).pop();
      if (!last || Math.hypot(last[0] - f.x, last[1] - f.y) > 9) { L.push([f.x, f.y, v.t, Math.atan2(f.vy || 0, f.vx || 1), frnd(0, 1), f.i]); if (L.length > 40) L.shift(); }
      if (frnd(0, 1) < 0.4) bit3(v, 'sand', f.x + frnd(-6, 6), f.y + frnd(-3, 3), 2, { dx: -(f.vx || 0) * 0.15 + frnd(-15, 15), dy: -(f.vy || 0) * 0.1 + frnd(-8, 8), dz: frnd(10, 30), g: 0, drag: 2.5, s: frnd(3, 4.6), grow: 0.9, life: 0.5, fade: 'alpha', al: 0.8, sh: false, few: true });
    }
    return null;
  },
  over(g, F, v, f) {
    if ((f.lockT || 0) > 0 && !chains(g, f, v, true, lockLen(F, f))) chains2D(g, f, v);
    if (f.id !== ID) return;
    const W = whirlOf(f);
    if (W) whirl(g, v, 'f', ...W);
  },
  tint(F, v, f) {
    if (f.id !== ID) return null;
    if (f.ph === 'brace' || f.ph === 'burst' || f.ph === 'heave') { const u = clamp((f.pht || 0) / (f.ph === 'heave' ? 0.12 : 0.18), 0, 1); return `rgba(255,120,60,${(0.06 + 0.14 * u).toFixed(3)})`; }   // (a warm flush as he winds up)
    return null;
  },
  event(v, F, e, few) {
    switch (e.kind) {
      case 'feShoot': sand(v, e.x, e.y, 2, 8, few); return true;
      case 'feCatch': { const D = F.f[e.who], a = D ? Math.atan2(e.y - D.y, e.x - D.x) : 0; sparks(v, e.x, e.y, ARM_Z, 6, a + Math.PI, 2.4, few); sand(v, e.x, e.y, 3, 8, few); bit3(v, 'glint', e.x - Math.cos(a) * 6, e.y - Math.sin(a) * 6, ARM_Z + 6, { g: 0, dz: 0, life: 0.3, s: 5, sp: 140, fade: 'shrink', sh: false }); return true; }   // (the pincers clamping: a pinch of light where they bite)
      case 'feFling': sand(v, e.x, e.y, 5, 14, few, [20, 50]); bits3(v, 'rock', e.x, e.y, 2, few ? 1 : 3, { speed: [40, 90], up: [80, 140], s: [1.1, 1.8], life: [0.4, 0.6] }); return true;
      case 'feClamp': sparks(v, e.x, e.y, ARM_Z, 3, 0, TAU, few); sand(v, e.x, e.y, 2, 6, few); return true;   // (snapped shut on nothing: a clack)
      case 'feLock': { const D = F.f[e.who]; if (D) sand(v, D.x, D.y, 2, 12, few); return true; }   // (his feet set as he starts the swing: the coil lands on the spot later)
      case 'feLocked': {   // the ring snapping shut on them: sparks, a puff of sand thrown out round their feet where the links were, the padlock's click glinting
        sparks(v, e.x, e.y, 26, 7, 0, TAU, few);
        const n = few ? 6 : 12;
        for (let k = 0; k < n; k++) { const a = k / n * TAU + frnd(-0.2, 0.2), r = 26; bit3(v, 'sand', e.x + Math.cos(a) * r, e.y + Math.sin(a) * r * 0.9, 2, { dx: Math.cos(a) * frnd(50, 80), dy: Math.sin(a) * frnd(40, 64), dz: frnd(10, 24), g: 0, drag: 3, s: frnd(3, 4.6), grow: 1, life: frnd(0.4, 0.6), fade: 'alpha', al: 0.7, sh: false, few: true }); }
        bit3(v, 'glint', e.x + 2, e.y + 6, 28, { g: 0, dz: 0, life: 0.4, s: 6, sp: 120, fade: 'shrink', sh: false });
        return true;
      }
      case 'feLockMiss': sand(v, e.x, e.y, 4, 40, few); return true;
      case 'feBrace': sand(v, e.x, e.y, 2, 10, few); return true;
      case 'feBurst': sand(v, e.x, e.y, 6, 14, few, [15, 40]); bits3(v, 'rock', e.x, e.y, 2, few ? 1 : 3, { speed: [30, 70], up: [70, 120], s: [1, 1.5], life: [0.35, 0.5], bo: 0.3 }); return true;   // (the shell skidding to a stop)
      case 'feUnchain': sand(v, e.x, e.y, 4, 10, few, [10, 25]); bits3(v, 'rock', e.x, e.y, 2, few ? 1 : 2, { speed: [20, 50], up: [50, 90], s: [0.9, 1.3], life: [0.3, 0.45], bo: 0.3 }); return true;   // (the ball and chain falling off: a thud in the sand)
      case 'feUnsafe': sand(v, e.x, e.y, 5, 22, few, [15, 45]); return true;
      case 'feHeave': {   // the claw clamping tighter as he heaves them up: a glint at the pincers, sand kicked from under them
        sand(v, e.x, e.y, 4, 10, few, [25, 55]);
        bit3(v, 'glint', e.x, e.y, ARM_Z + 6, { g: 0, dz: 0, life: 0.3, s: 6, sp: 160, fade: 'shrink', sh: false });
        return true;
      }
      case 'feSpin': {   // the spin connecting: a burst of sparks and sand off them, a soft shake
        if (!e.hit) { sparks(v, e.x, e.y, 18, 4, 0, TAU, few); return true; }
        if (e.held) {   // slammed out of the claw's spin: a bigger burst, a ring of sand thrown out round the slam, a firmer shake
          sparks(v, e.x, e.y, 20, 14, e.a ?? 0, 3, few); sand(v, e.x, e.y, 8, 18, few, [30, 70]);
          bits3(v, 'rock', e.x, e.y, 4, few ? 2 : 5, { dir: e.a ?? 0, spread: 2.4, speed: [60, 130], up: [110, 190], s: [1.2, 2], life: [0.5, 0.75], bo: 0.3 });
          const n = few ? 6 : 12;
          for (let k = 0; k < n; k++) { const a = k / n * TAU + frnd(-0.2, 0.2), r = 18; bit3(v, 'sand', e.x + Math.cos(a) * r, e.y + Math.sin(a) * r * 0.9, 2, { dx: Math.cos(a) * frnd(70, 110), dy: Math.sin(a) * frnd(55, 85), dz: frnd(10, 26), g: 0, drag: 3, s: frnd(3.4, 5), grow: 1, life: frnd(0.45, 0.7), fade: 'alpha', al: 0.7, sh: false, few: true }); }
          v.shake = Math.max(v.shake, 0.26);
          return true;
        }
        sparks(v, e.x, e.y, 20, 10, e.a ?? 0, 2.6, few); sand(v, e.x, e.y, 5, 14, few, [20, 55]);
        bits3(v, 'rock', e.x, e.y, 4, few ? 1 : 3, { dir: e.a ?? 0, spread: 2, speed: [50, 110], up: [90, 160], s: [1.1, 1.8], life: [0.45, 0.65], bo: 0.3 });
        v.shake = Math.max(v.shake, 0.18);
        return true;
      }
      case 'feSpent': sand(v, e.x, e.y, 3, 18, few); return true;
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
  // his own sounds: shell, claw and chain (sounds below; beats that aren't events: cues)
  sound(e) {
    switch (e.kind) {
      case 'feShoot': return [['feSpring', 0.8]];
      case 'feCatch': return [['feSnap', 0.9]];
      case 'feFling': return [['feFling', 0.8]];
      case 'feClamp': return [['feClack', 0.7]];
      case 'feLock': return [['feRattle', 0.8]];
      case 'feLocked': return [['feClick', 0.9], ['fOwn', 0.5]];
      case 'feLockMiss': return [['feSlink', 0.6]];
      case 'feBrace': return [['feScrape', 0.6]];
      case 'feBurst': return [['feJudder', 0.7]];
      case 'feUnchain': return [['feThunk', 0.7]];
      case 'feUnsafe': return [['feWhirl', 0.8]];
      case 'feSpin': return e.hit ? (e.held ? [['feSlam', 1], ['fHeavy', 0.5]] : [['feSlam', 0.85]]) : [['feClack', 0.5]];
      case 'feHeave': return [['feStrain', 0.8]];
      case 'feSpent': return [['feWobble', 0.6]];
      case 'feTuck': return [['feShell', 0.7]];
      case 'fePop': return [['fePop', 0.7]];
    }
    return null;
  },
  // beats that aren't events: the claw creaking as he cocks it; the coil leaving his claw, landing and paying out
  cues(F, play) {
    let M = CUES.get(F); if (!M) CUES.set(F, M = { ph: [], seen: new Set() });
    for (const f of F.f) { if (f.id === ID && f.ph !== M.ph[f.i] && f.ph === 'clawback') play('feCreak', 0.7); M.ph[f.i] = f.ph; }
    for (const o of F.objs || []) {
      if (o.kind !== 'felock' || o.ph !== 'form' || !F.f[o.owner]) continue;
      const mv = F.f[o.owner].stats.moves.move3, f = F.f[o.owner], T1 = mv.startup + 0.12 + 0.1 * clamp(Math.hypot(o.x - f.x, o.y - f.y) / 300, 0, 1);
      if (o.t >= mv.startup && !M.seen.has('t' + o.id)) { M.seen.add('t' + o.id); play('feToss', 0.8); }
      if (o.t >= T1 && !M.seen.has('l' + o.id)) { M.seen.add('l' + o.id); play('feClank', 0.9); if (M.seen.size > 200) M.seen.clear(); }
    }
  },
  sounds: {
    feCreak: ({ osc }) => (v, t) => { for (let k = 0; k < 5; k++) osc(t + k * 0.03, 420 + k * 70, 0.03, 'sawtooth', 0.03 * v, 60); },   // the claw ratcheting open
    feSpring: ({ osc, hiss }) => (v, t) => { osc(t, 180, 0.14, 'triangle', 0.1 * v, 520); osc(t + 0.02, 360, 0.1, 'sine', 0.05 * v, 700); hiss(t, 0.12, 0.08 * v, 'bandpass', 900, 3000); },   // the arm springing out
    feSnap: ({ osc, hiss }) => (v, t) => { osc(t, 1500, 0.025, 'square', 0.08 * v, -600); hiss(t, 0.04, 0.12 * v, 'highpass', 3000); osc(t + 0.02, 140, 0.12, 'sine', 0.2 * v, -60); },   // the pincers clamping on: a crack and a thud
    feClack: ({ osc }) => (v, t) => { osc(t, 900, 0.03, 'square', 0.07 * v, -300); osc(t + 0.04, 700, 0.03, 'square', 0.05 * v, -250); },   // snapped shut on nothing: a hollow clack-clack
    feFling: ({ osc, hiss }) => (v, t) => { hiss(t, 0.22, 0.13 * v, 'bandpass', 500, 2200); osc(t + 0.2, 110, 0.16, 'sine', 0.22 * v, -50); hiss(t + 0.2, 0.12, 0.08 * v, 'lowpass', 900); },   // a heave, then the thump in the sand
    feStrain: ({ osc }) => (v, t) => { osc(t, 90, 0.22, 'sawtooth', 0.05 * v, 40); osc(t, 95, 0.22, 'sawtooth', 0.04 * v, 45); osc(t + 0.1, 1200, 0.04, 'square', 0.05 * v, -300); },   // dug in and heaving them up, the claw biting
    feScrape: ({ osc, hiss }) => (v, t) => { hiss(t, 0.14, 0.1 * v, 'bandpass', 400, 900); osc(t, 160, 0.12, 'triangle', 0.06 * v, -40); },   // twisting back, feet scraping in the sand
    feWhirl: ({ osc, hiss }) => (v, t) => { for (let k = 0; k < 3; k++) hiss(t + k * 0.08, 0.1, (0.15 - k * 0.03) * v, 'bandpass', 600 + k * 300, 1800 + k * 300); osc(t, 200, 0.26, 'triangle', 0.05 * v, 220); },   // one brutal spin
    feSlam: ({ osc, hiss, boom }) => (v, t) => { osc(t, 180, 0.08, 'square', 0.12 * v, -90); osc(t, 70, 0.28, 'sine', 0.3 * v, -30); hiss(t, 0.2, 0.18 * v, 'lowpass', 2200, 300); for (let k = 0; k < 3; k++) osc(t + 0.05 + k * 0.04, 1800 - k * 250, 0.03, 'square', 0.03 * v); },   // the smash: a thump, sand and the clatter of claws
    feWobble: ({ osc }) => (v, t) => { osc(t, 300, 0.3, 'triangle', 0.05 * v, -160); osc(t + 0.05, 310, 0.25, 'triangle', 0.03 * v, -170); },   // spun past, settling
    feShell: ({ osc, hiss }) => (v, t) => { osc(t, 260, 0.06, 'square', 0.06 * v, -120); for (let k = 0; k < 4; k++) hiss(t + 0.05 + k * 0.08, 0.09, 0.06 * v, 'lowpass', 700, 400); },   // a clonk into the shell, rolling over the sand
    fePop: ({ osc }) => (v, t) => { osc(t, 300, 0.08, 'sine', 0.1 * v, 500); osc(t + 0.06, 900, 0.05, 'triangle', 0.05 * v, 300); },   // popping out
    feJudder: ({ osc }) => (v, t) => { for (let k = 0; k < 6; k++) osc(t + k * 0.025, 140 + (k % 2) * 40, 0.025, 'square', 0.06 * v); },   // the shell stopping dead and juddering
    feRattle: ({ osc }) => (v, t) => { for (let k = 0; k < 9; k++) osc(t + k * 0.03 + (k % 3) * 0.004, 2300 + ((k * 7) % 5) * 180, 0.025, 'triangle', 0.035 * v); },   // the chain rattling round as he swings it
    feToss: ({ osc, hiss }) => (v, t) => { hiss(t, 0.18, 0.12 * v, 'bandpass', 700, 2600); for (let k = 0; k < 3; k++) osc(t + k * 0.04, 2500 - k * 200, 0.02, 'triangle', 0.03 * v); },   // flung: a whoosh, the links jingling
    feClank: ({ osc, hiss }) => (v, t) => { osc(t, 520, 0.12, 'square', 0.06 * v, -200); osc(t, 1320, 0.2, 'triangle', 0.06 * v, -100); hiss(t, 0.08, 0.06 * v, 'lowpass', 900); for (let k = 0; k < 8; k++) osc(t + 0.06 + k * 0.032, 2000 + ((k * 5) % 4) * 250, 0.022, 'triangle', 0.03 * v * (1 - k / 10)); },   // the coil landing with a clank, the chain paying out
    feClick: ({ osc }) => (v, t) => { osc(t, 1800, 0.02, 'square', 0.08 * v); osc(t + 0.05, 1200, 0.03, 'square', 0.08 * v, -200); osc(t + 0.05, 600, 0.08, 'triangle', 0.08 * v, -150); },   // the padlock clicking shut
    feSlink: ({ osc, hiss }) => (v, t) => { for (let k = 0; k < 5; k++) osc(t + k * 0.05, 1600 - k * 160, 0.03, 'triangle', 0.025 * v); hiss(t, 0.25, 0.04 * v, 'lowpass', 800, 300); },   // the links slinking back into the sand
    feThunk: ({ osc, hiss }) => (v, t) => { osc(t, 120, 0.18, 'sine', 0.22 * v, -50); hiss(t, 0.1, 0.06 * v, 'lowpass', 700); osc(t + 0.03, 1700, 0.03, 'triangle', 0.03 * v); },   // the ball and chain falling off: a thunk
  },
};
export default ART_F;
