// Bugdroid's Fight art (sim: js/kits/droid.js). Clean, friendly Android green, Classic Flat first; tells are soft light
// and dust. 3D set pieces: app cube, energy balls, signal arcs and battery cells
// are low-poly meshes baked per fight (propsFor); their light is added over them (kit3-light.js); 2D stand-ins while baking.
//   Battery Beam        a ball of light swells between his hands while floating motes mark the line (still and brighter
//                       just before it fires); the beam: a glowing tube with a white-hot core; a scorch line cools after
//   Sideload            motes stream into his cupped hands as an app cube grows; he sets it down, it hops to its spot,
//                       plugs in, boots light by light, turns its lens on you and pops pellets; kicked, it tips over
//   Background Service  a flicked app tile skids out and beds in; arming it blinks faster, armed it goes faint; stepped
//                       on, bolts crackle up into whoever's on it; timed out, a wisp of smoke
//   Power Surge         rooted, sparks gather in (the tell), then lightning crackles round him; a hit into it sends bolts
//                       onto the attacker, a shot fizzles; nothing came: the arcs sputter out
// His battery: two 3D cells over his head, filling green. Shakes: only a shock landing, softly.
import { TAU, clamp, frnd } from '../core.js';
import * as M3 from './model3d.js';
import { puff } from '../draw-fight.js';
import { animBase, settleAnim } from './kits.js';
import { bit3, bits3, decal3, defBit, defProp, drawProp3D, lathe3, propReady, propsFor, scorch2 } from './prop3d.js';
import './kit3-earth.js';   // (its dust bits)
import { glow, ringLight, streak } from './kit3-light.js';
import { softShadow } from './arena-mat.js';

const ID = 'droid';
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const hsh = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const A3 = a => clamp(a, 0, 1).toFixed(3);
const G = '61,220,132', GL = '200,255,222', GD = '22,110,64', WH = '240,255,246';
const ANT = 52;   // (how high his antennae's tips are, world units)
const BZ = 24;    // (the beam's height)
const { hex, ball, capsule, tube, rbox, smoothProf, MATTE, GLOSS } = M3;
// an antenna tip on screen from his feet (model turned toward the camera as draw-fight.js does); up: straight-up poses
// (charge, crouch, emp), low: crouched
function antTip(f, s, up = true, low = false) {
  const yaw = f.face + 0.35 * Math.sin(Math.PI / 2 - f.face), l = s * (up ? 8.2 : 10.7), h = (up ? 47 : 44) - (low ? 3 : 0);
  return [l * Math.sin(yaw), -l * Math.cos(yaw) * 0.47 - h];
}
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }
function glow2D(g, x, y, r, rgb, a) {
  if (a <= 0.005 || r <= 0.5) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${rgb},${A3(a)})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; circle(g, x, y, r); g.fill();
}

// ---------------------------------------------------------------- the 3D props (world units; x forward, z up)
// the app cube (states b0..b3: lights on while booting; on: all lit, lens lit): rounded green cube on pads, white top,
// two antennae, a front lens, a cable to a floor plug
function cubeMesh(st) {
  const out = [], Gr = hex('#3ddc84'), W = hex('#f4fbf6'), DK = hex('#1f3d31'), on = st === 'on', lit = on ? 4 : +(st || 'b0').slice(1) || 0;
  rbox(out, [0, 0, 8.8], [8, 8, 7.6], Gr, GLOSS, 0.32);
  rbox(out, [0, 0, 16.3], [7.1, 7.1, 1.1], W, GLOSS, 0.4);
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + Math.PI / 4; ball(out, [Math.cos(a) * 4.2, Math.sin(a) * 4.2, 17.5], 1.15, hex(k < lit ? '#c8ffe0' : '#2c6b49'), GLOSS, 0.4, 10, 7); }
  for (const s of [-1, 1]) { capsule(out, [-1.5, s * 3.4, 17], [-2.6, s * 5.4, 22], 0.75, Gr, MATTE, 0.7); }
  tube(out, [[7.4, 0, 9.4], [9.2, 0, 9.4]], 3.3, DK, GLOSS, 1, 14);
  ball(out, [11.6, 0, 9.4], 2.6, hex(on ? '#d4ffe8' : '#3a5e50'), GLOSS, 0.4, 14, 9);
  tube(out, smoothProf([[-7.6, 0, 4.2], [-10.8, 0, 3.8], [-13, 0, 1.8], [-14.4, 0, 0.8]], 3), 1, hex('#e9efe9'), MATTE, 0.7, 8);
  rbox(out, [-15.6, 0, 0.9], [1.7, 1.5, 1.1], hex('#cfd8d2'), GLOSS, 0.3, 0.7);
  for (const [x, y] of [[5, 5], [5, -5], [-5, 5], [-5, -5]]) rbox(out, [x, y, 0.7], [2, 2, 0.8], DK, MATTE, 0.4, 0.5);
  return out;
}
// a ball of light (a pellet, his charge, an antenna's bead): a glossy pale green orb, a white hot middle showing
function glowMesh() { const out = []; ball(out, [0, 0, 0], 4, hex('#c9ffe0'), GLOSS, 0.4, 18, 12); ball(out, [0.6, 0.6, 0.4], 2.6, hex('#f6fff9'), GLOSS, 0, 14, 9); return out; }
// Background Service's tile (flat on the floor; states off / on): a rounded green tile, a white robot head, a status light
function svcMesh(st) {
  const out = [], GR = hex('#3ddc84'), W = hex('#f4fbf6'), on = st === 'on';
  rbox(out, [0, 0, 1.3], [7.5, 7.5, 1.3], GR, GLOSS, 0.45);
  rbox(out, [0, 0, 2.7], [6.4, 6.4, 0.25], hex('#2fbd70'), MATTE, 0.4);
  ball(out, [0.6, 0, 2.8], 3.3, W, GLOSS, 0.55, 14, 8);
  for (const y of [-1.6, 1.6]) capsule(out, [1.6, y, 4.6], [2.6, y * 1.6, 6.2], 0.35, W, MATTE, 0.6);
  for (const y of [-1.2, 1.2]) ball(out, [2.9, y, 4], 0.45, hex('#1f3d31'), GLOSS, 0.4, 8, 6);
  ball(out, [-5, 5, 2.8], 1, hex(on ? '#d4ffe8' : '#2c6b49'), GLOSS, 0.4, 10, 7);
  return out;
}
// a battery cell (states c0..c4: quarters lit), standing: glossy dark body in four bands, white caps, a nub on top
function cellMesh(st) {
  const out = [], n = +(st || 'c0').slice(1) || 0, CAP = hex('#eef3ef'), R = 3.3;
  lathe3(out, [[0, 0], [0.25, R - 0.4], [0.9, R]], CAP, GLOSS, 20);
  for (let k = 0; k < 4; k++) { const z0 = 0.9 + k * 2.2; lathe3(out, [[z0, R], [z0 + 2.1, R]], hex(k < n ? '#3ddc84' : '#2a332e'), GLOSS, 20); lathe3(out, [[z0 + 2.05, R + 0.05], [z0 + 2.2, R + 0.05]], hex('#1d2421'), MATTE, 20); }
  lathe3(out, [[9.7, R], [10.3, R - 0.35], [10.5, 0]], CAP, GLOSS, 20);
  lathe3(out, [[10.3, 1.3], [11.8, 1.3], [12, 0]], hex('#aeb7b1'), GLOSS, 14);
  return out;
}
defProp('drcube', { mesh: cubeMesh, n: 16, ppu: 1.3, ink: '#0b4a2c', states: ['b0', 'b1', 'b2', 'b3', 'on'] });
defProp('drglow', { mesh: glowMesh, n: 1, ink: '#1f9a5a', out: 0.4, r0: 4 });
defProp('drsvc', { mesh: svcMesh, n: 16, ppu: 1.3, ink: '#0b4a2c', out: 0.4, states: ['off', 'on'] });
defProp('drcell', { mesh: cellMesh, n: 1, ink: '#101814', out: 0.5, states: ['c0', 'c1', 'c2', 'c3', 'c4'] });
// bits: mote (a little ball of light), gspark (a green-white spark)
defBit('mote', { mesh: () => { const out = []; ball(out, [0, 0, 0], 2.5, hex('#dcffec'), GLOSS, 0.3, 12, 8); return out; }, ink: '#2aa868', r0: 2.5, out: 0.3 });
defBit('gspark', { mesh: () => { const out = [], Y = hex('#b8ffd6'); capsule(out, [-4, 0, 0], [4, 0, 0], 0.9, Y, GLOSS, 0.6); capsule(out, [0, 0, -4], [0, 0, 4], 0.9, Y, GLOSS, 0.6); ball(out, [0, 0, 0], 1.7, hex('#f2fff7'), GLOSS, 0.6); return out; }, ink: '#1e9e5c' });
propsFor(ID, ['drcube/b0', 'drcube/b1', 'drcube/b2', 'drcube/b3', 'drcube/on', 'drglow', 'drsvc/off', 'drsvc/on', 'drcell/c0', 'drcell/c1', 'drcell/c2', 'drcell/c3', 'drcell/c4', 'bit:mote', 'bit:gspark', 'bit:dust']);

// ---------------------------------------------------------------- marks kept a while (drawn under the fighters)
function addScorch(v, x, y, r) { (v.drScorch || (v.drScorch = [])).push({ x, y, r, t0: v.t, seed: frnd(0, 9) }); }
// the beam's burn: a scorched line along where it fired, glowing green and cooling, kept 1.5 s
function addBurn(v, o, x0, y0, x1, y1, w) {
  const B = v.drBurn || (v.drBurn = []), b = B.find(q => q.id === o.id);
  if (b) Object.assign(b, { x0, y0, x1, y1, w, t0: v.t }); else { B.push({ id: o.id, x0, y0, x1, y1, w, t0: v.t }); if (B.length > 6) B.shift(); }
}
function marks(g, v) {
  const B = v.drBurn;
  if (B) for (let i = B.length - 1; i >= 0; i--) {
    const b = B[i], age = v.t - b.t0, k = age / 1.5; if (k >= 1 || k < -0.01) { B.splice(i, 1); continue; }
    const fa = 1 - k * k;
    g.save(); g.lineCap = 'round';
    for (const [wd, al] of [[10, 0.07], [6.5, 0.09], [3, 0.12]]) { g.strokeStyle = `rgba(46,40,36,${A3(al * fa)})`; g.lineWidth = wd * b.w; g.beginPath(); g.moveTo(b.x0, b.y0); g.lineTo(b.x1, b.y1); g.stroke(); }
    g.restore();
    streak(g, b.x0, b.y0, b.x1, b.y1, 8 * b.w, G, 0.35 * clamp(1 - age / 0.5, 0, 1));   // (still hot a moment)
  }
  const L = v.drScorch;
  if (L) for (let i = L.length - 1; i >= 0; i--) {
    const s = L[i], age = v.t - s.t0, k = age / 1.8; if (k >= 1 || k < -0.01) { L.splice(i, 1); continue; }
    scorch2(g, s.x, s.y, s.r, s.seed, 0.75 * clamp((1 - k) / 0.4, 0, 1));
    glow(g, s.x, s.y, s.r * 1.3, G, 0.4 * clamp(1 - age / 0.5, 0, 1), 0.6);   // (still glowing hot a moment)
  }
}

// ---------------------------------------------------------------- Battery Beam
// the line of light motes floating over the floor where he points (aim: drifting outward; lock: still, a touch brighter)
function motes(g, F, o, t) {
  if (o.ph !== 'aim' && o.ph !== 'lock') return;
  const f = F.f[o.owner], lock = o.ph === 'lock', a = clamp(o.t / 0.15, 0, 1) * (lock ? 0.9 : 0.5 + 0.25 * (o.ch || 0));
  const c = Math.cos(o.a), s = Math.sin(o.a), r0 = (f ? f.r : 17) + 6, L = o.len, gap = 15, drift = lock ? 0 : (t * 40) % gap, D3 = propReady('bit:mote');
  const gr = g.createLinearGradient(o.x + c * r0, o.y + s * r0, o.x + c * L, o.y + s * L);   // (a very faint band under them, so it reads on a busy floor)
  gr.addColorStop(0, `rgba(${GD},${A3(0.1 * a)})`); gr.addColorStop(1, `rgba(${GD},0)`);
  g.save(); g.lineCap = 'round'; g.strokeStyle = gr; g.lineWidth = o.w * 1.6; g.beginPath(); g.moveTo(o.x + c * r0, o.y + s * r0); g.lineTo(o.x + c * L, o.y + s * L); g.stroke(); g.restore();
  for (let d = r0 + drift; d < L; d += gap) {
    const q = (d - r0) / Math.max(1, L - r0), al = a * (1 - q * 0.6) * (0.75 + 0.25 * Math.sin(t * 9 + d * 0.3)), x = o.x + c * d, y = o.y + s * d;
    if (!D3) { glow2D(g, x, y, lock ? 5 : 4, G, al * 0.5); g.fillStyle = `rgba(${GL},${A3(al)})`; circle(g, x, y, lock ? 1.6 : 1.2); g.fill(); continue; }
    const z = lock ? 6 : 5 + 2 * Math.sin(t * 4 + d * 0.21);
    glow(g, x, y, lock ? 8 : 6, G, al * 0.45, 0.5);
    g.save(); g.translate(x, y - z); drawProp3D(g, 'bit:mote', { frame: d * 0.3, scale: (lock ? 2 : 1.6) / 2.5, alpha: al }); g.restore();
    glow(g, x, y - z, lock ? 7 : 5.5, GL, al * 0.55);
  }
}
// the beam: a glowing tube at chest height (lit edge, white-hot core), halo, floor light, rings and sparks along it
function beam(g, F, v, o) {
  if (o.ph !== 'fire' && o.ph !== 'fade') return;
  const f = F.f[o.owner], age = o.t - (o.ft ?? o.t), fade = o.ph === 'fade' ? clamp((o.life - o.t) / 0.3, 0, 1) : 1, a = fade * clamp(age / 0.03, 0, 1);
  if (a <= 0.01) return;
  const c = Math.cos(o.a), s = Math.sin(o.a), r0 = (f ? f.r : 17) - 2, x0 = o.x + c * r0, y0 = o.y + s * r0, x1 = o.x + c * o.len, y1 = o.y + s * o.len, w = (1 + (o.ch || 0) * 0.6) * (o.w || 9) / 9, Z = BZ;   // (as wide as it hits)
  streak(g, x0, y0, x1, y1, 30 * w, G, 0.24 * a);   // (its light on the floor)
  streak(g, x0, y0 - Z, x1, y1 - Z, 24 * w, G, 0.4 * a);   // (its halo)
  const lw = 7 * w * (0.7 + 0.3 * fade), line = (dy, col, wd) => { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); g.moveTo(x0, y0 - Z + dy); g.lineTo(x1, y1 - Z + dy); g.stroke(); };
  g.save(); g.lineCap = 'round';
  line(0.6, `rgba(30,170,98,${A3(0.95 * a)})`, lw);
  line(-lw * 0.1, `rgba(140,255,196,${A3(a)})`, lw * 0.62);
  line(-lw * 0.16, `rgba(250,255,250,${A3(a)})`, lw * 0.3);
  g.restore();
  const L = Math.hypot(x1 - x0, y1 - y0);
  for (let d = (v.t * 460) % 46; d < L - 4; d += 46) glow(g, x0 + c * d, y0 + s * d - Z, lw * 1.5, WH, 0.42 * a);   // (pulses of energy running down it)
  glow(g, x0, y0 - Z, 16 * w, GL, 0.8 * a); glow(g, x1, y1 - Z, 20 * w, GL, 0.7 * a); glow(g, x1, y1, 18 * w, G, 0.3 * a, 0.5);
  if (o.ph === 'fire') {
    addBurn(v, o, x0, y0, x1, y1, w);
    if (frnd(0, 1) < 0.5) { const d = frnd(10, Math.max(12, L)); bit3(v, 'mote', x0 + c * d, y0 + s * d, Z, { dx: frnd(-15, 15), dy: frnd(-8, 8), dz: frnd(10, 40), g: -20, drag: 2, s: frnd(1.1, 1.7), life: 0.4, fade: 'alpha', sh: false, few: true }); }
    if (frnd(0, 1) < 0.4) { const b = frnd(0, TAU); bit3(v, 'gspark', x1, y1, Z, { dx: Math.cos(b) * frnd(70, 150), dy: Math.sin(b) * frnd(40, 90), dz: frnd(60, 140), s: frnd(2.2, 3.4), life: 0.3, few: true }); }
    const o2 = F.f[1 - o.owner];
    if (o.hit && o2) {
      const S = v.drHit || (v.drHit = new Set()), key = o.id * 100 + (o.ms || 0);
      if (!S.has(key)) { if (S.size > 200) S.clear(); S.add(key); addScorch(v, o2.x, o2.y + 2, 11); }
      if (frnd(0, 1) < 0.5) { const b = frnd(0, TAU); bit3(v, 'gspark', o2.x, o2.y, Z, { dx: Math.cos(b) * frnd(70, 140), dy: Math.sin(b) * frnd(40, 80), dz: frnd(60, 130), s: frnd(2.2, 3.3), life: 0.28, few: true }); }
    }
  }
}
// the charge: a ball of light between his hands (behind him when he faces away), motes streaming in; dx, dy from his feet
function chargeBall(g, f, v, x, y) {
  const ch = f.ph === 'lock' ? 1 : clamp((f.pht || 0) / 1.2, 0, 1), fl = 0.85 + 0.15 * Math.sin(v.t * 30), d = 17, hx = x + Math.cos(f.face) * d, hy = y + Math.sin(f.face) * d - BZ;
  glow(g, hx, hy, 12 + 16 * ch, G, (0.4 + 0.4 * ch) * fl);
  g.save(); g.translate(hx, hy); if (!drawProp3D(g, 'drglow', { scale: (0.45 + 0.55 * ch) * fl })) { g.fillStyle = `rgba(${GL},0.95)`; circle(g, 0, 0, 2 + 2.5 * ch); g.fill(); } g.restore();
  glow(g, hx, hy, 7 + 6 * ch, WH, 0.6 * fl);
}

// ---------------------------------------------------------------- Sideload
// the 2D stand-in: a little isometric cube
function cube2D(g, o, mv, al, tip, drop) {
  const s = 9;
  g.save(); g.globalAlpha *= al;
  softShadow(g, o.x + 1, o.y + 1, s * 1.4, s * 0.62, 0.26);
  g.translate(o.x, o.y - drop); if (tip) { const dir = Math.cos(o.ka || 0) >= 0 ? 1 : -1; g.translate(dir * s, 0); g.rotate(dir * tip); g.translate(-dir * s, 0); }
  const h = s * 1.5, k = s * 0.55;
  g.fillStyle = '#2bb46c'; g.beginPath(); g.moveTo(-s, -h); g.lineTo(0, -h + k); g.lineTo(0, k); g.lineTo(-s, 0); g.closePath(); g.fill();
  g.fillStyle = '#3ddc84'; g.beginPath(); g.moveTo(s, -h); g.lineTo(0, -h + k); g.lineTo(0, k); g.lineTo(s, 0); g.closePath(); g.fill();
  g.fillStyle = '#f4fbf6'; g.beginPath(); g.moveTo(0, -h - k); g.lineTo(s, -h); g.lineTo(0, -h + k); g.lineTo(-s, -h); g.closePath(); g.fill();
  if (o.ph === 'boot') { const u = clamp(o.t / mv.boot, 0, 1); g.strokeStyle = `rgba(${G},0.9)`; g.lineWidth = 1.6; g.beginPath(); g.ellipse(0, -h, s * 0.5, s * 0.28, 0, -Math.PI / 2, -Math.PI / 2 + TAU * u); g.stroke(); }
  g.restore();
}
// the cube: dropping in and plugging in, lights coming on, turning to you, lens glowing before each shot, recoil; kicked,
// it tips away and fades. In his hands (u the wind-up 0..1): [forward from his middle, foot height, size] (0 till there)
const CRADLE = 0.55, HOP = 0.18;   // (the share of the wind-up he holds it up; how long it hops out to its spot)
function heldCube(u) {   // (popping in, a touch past full and back)
  if (u < CRADLE) { const q = u / CRADLE, b = clamp((q - 0.1) / 0.75, 0, 1), s = 1 + 2.2 * Math.pow(b - 1, 3) + 1.2 * Math.pow(b - 1, 2); return [17, 13 + 1.5 * Math.sin(q * 9), 0.75 * Math.max(0, s)]; }
  const q = ease((u - CRADLE) / (1 - CRADLE)); return [17 + 6 * q, 13 - 11 * q, 0.75 + 0.15 * q];
}
// drawn at (0, 0): his feet (lifted with him); front: the near side (over him), else before him
function cubeInHands(g, v, f, front) {
  if (f.ph !== 'plug' || f.state !== 'wind') return;
  if ((Math.sin(f.face) >= -0.3) !== front) return;
  const u = clamp((f.pht || 0) / Math.max(0.05, f.dur || f.stats.moves.move3.startup), 0, 1), [d, z, sc] = heldCube(u);
  if (sc <= 0.02) return;
  const x = Math.cos(f.face) * d, y = Math.sin(f.face) * d, fl = 0.8 + 0.2 * Math.sin(v.t * 40), dl = u < CRADLE ? 1 - u / CRADLE * 0.6 : 0.4;
  glow(g, x, y - z - 9 * sc, 14 + 10 * sc, G, 0.35 * dl * fl);
  const st = u < CRADLE ? 'b' + (Math.floor(v.t * 14) % 4) : 'b0';   // (its lights flickering as it downloads)
  g.save(); g.translate(x, y - z);
  if (!drawProp3D(g, 'drcube', { yaw: f.face, state: st, scale: 1.2 * sc })) { g.fillStyle = `rgba(${G},0.95)`; g.fillRect(-7 * sc, -14 * sc, 14 * sc, 14 * sc); }
  g.restore();
  if (u < CRADLE * 0.9) glow(g, x, y - z - 9 * sc, 6 + 4 * sc, WH, 0.5 * fl * dl);
}
// the motes it downloads from, streaming in to his hands from all round
function downloadMotes(v, f) {
  if (f.ph !== 'plug' || f.state !== 'wind' || frnd(0, 1) > 0.55) return;
  const u = clamp((f.pht || 0) / Math.max(0.05, f.dur || 0.36), 0, 1); if (u > CRADLE * 0.85) return;
  const an = frnd(0, TAU), r = frnd(24, 40), hx = f.x + Math.cos(f.face) * 17, hy = f.y + Math.sin(f.face) * 17;
  bit3(v, 'mote', hx + Math.cos(an) * r, hy + Math.sin(an) * r * 0.6, 22 + frnd(-10, 22), { to: [hx, hy, 22], life: 0.22, s: frnd(1, 1.5), sh: false, few: true });
}
function appCube(g, F, v, o) {
  const mv = F.f[o.owner].stats.moves.move3, own = F.f[o.owner];
  let al = 1, tip = 0, drop = 0, back = 0, grow = 1;
  if (o.t < HOP) {   // pushed out of his hands: a little hop from where he set it down out to its spot
    const e = ease(o.t / HOP); back = Math.max(0, ((own && own.r) || 19) + mv.ahead - 23) * (1 - e); drop = 2 * (1 - e) + 9 * Math.sin(Math.PI * Math.min(1, o.t / HOP)); grow = (0.9 + 0.1 * e) / (1 + 0.12 * Math.sin(Math.PI * e));
  }
  if (o.ph === 'off') al = clamp((o.life - o.t) / 0.4, 0, 1);
  if (o.ph === 'broke') { const u = clamp(1 - (o.life - o.t) / 0.45, 0, 1); tip = ease(u * 2) * 1.35; al = 1 - clamp((u - 0.45) / 0.55, 0, 1); }
  const live = o.ph === 'live', st = live ? 'on' : o.ph === 'boot' ? 'b' + Math.min(3, Math.floor(clamp(o.t / mv.boot, 0, 1) * 4)) : 'b0';
  if (!propReady('drcube', st)) { drawProp3D(g, 'drcube', { state: st, alpha: 0 }); cube2D(g, o, mv, al, tip, drop); return; }
  if (o.t >= HOP) { const S = v.drSeen || (v.drSeen = new Set()); if (!S.has(o.id)) { if (S.size > 200) S.clear(); S.add(o.id); bits3(v, 'dust', o.x, o.y, 2, 4, { speed: [25, 50], up: [8, 20], g: 0, drag: 2.5, s: [3, 4.5], grow: 0.9, life: [0.4, 0.6], fade: 'alpha', al: 0.8, sh: false, few: true }); } }   // (plugged in: a puff of dust)
  const since = live && o.shots ? mv.every - (o.nx - o.t) : 9, rc = since < 0.12 ? 1 - since / 0.12 : 0, c = Math.cos(o.a), s = Math.sin(o.a);
  softShadow(g, o.x + 1.5, o.y + 1.5, 20, 8.8, 0.26 * al);
  g.save(); g.globalAlpha *= al; g.translate(o.x - c * (2 * rc + back), o.y - s * (rc + back) - drop);
  if (tip) { const dir = Math.cos(o.ka || 0) >= 0 ? 1 : -1; g.translate(dir * 9, 0); g.rotate(dir * tip); g.translate(-dir * 9, 0); }
  g.scale(1 + 0.05 * rc, 1 - 0.07 * rc);
  drawProp3D(g, 'drcube', { yaw: o.a, state: st, scale: 1.2 * grow });
  g.restore();
  if (o.ph === 'boot' || live) {   // the lights' glow on its top; the lens's
    const n = live ? 4 : +st.slice(1);
    if (n) glow(g, o.x, o.y - drop - 21 * 0.88, 10, G, 0.1 * n);
    if (live && s > -0.3) { const pre = 1 - clamp((o.nx - o.t) / mv.every, 0, 1), lx = o.x + c * 14.5, ly = o.y + s * 14.5 * 0.47 - 11.3 * 0.88; glow(g, lx, ly, 5 + 7 * pre, GL, 0.3 + 0.55 * pre); }
  }
}
// a pellet: a glowing ball of light, a short trail of light behind it, its light on the floor under it
function pellet(g, F, v, o) {
  const z = o.z || 12;
  softShadow(g, o.x, o.y + 1, 5, 2.3, 0.18);
  glow(g, o.x, o.y, 11, G, 0.28, 0.45);
  for (let j = 1; j <= 3; j++) glow(g, o.x - o.vx * 0.014 * j, o.y - o.vy * 0.014 * j - z, 7 - j * 1.4, G, 0.4 / j);
  g.save(); g.translate(o.x, o.y - z);
  if (!drawProp3D(g, 'drglow', { scale: 0.85 })) { glow2D(g, 0, 0, 9, G, 0.45); g.fillStyle = `rgba(${GL},0.95)`; circle(g, 0, 0, 3.2); g.fill(); }
  g.restore();
  glow(g, o.x, o.y - z, 10, GL, 0.5);
}

// ---------------------------------------------------------------- the lightning
// a jagged bolt (screen) from (x0, y0) to (x1, y1), re-struck every 0.04 s (seeded by time): soft green glow, white core
function bolt(g, x0, y0, x1, y1, seed, a, w = 1, jag = 0.22) {
  const n = 7, L = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / (L || 1), ny = (x1 - x0) / (L || 1), P = [[x0, y0]];
  for (let k = 1; k < n; k++) { const t = k / n, j = (hsh(seed * 13 + k) - 0.5) * L * jag * Math.sin(t * Math.PI); P.push([x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j]); }
  P.push([x1, y1]);
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.globalCompositeOperation = 'lighter';
  for (const [lw, col, al] of [[7 * w, G, 0.28], [3.2 * w, GL, 0.6], [1.3 * w, WH, 0.95]]) {
    g.strokeStyle = `rgba(${col},${A3(al * a)})`; g.lineWidth = lw; g.beginPath(); P.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
  }
  g.restore();
}
// bolts crawling over someone locked up by a shock (k 0..1; at their feet), re-struck quickly, sparks now and then
function jolted(g, v, f, k, seed0) {
  const seed = Math.floor(v.t / 0.045) + seed0, a = (1 - k * k) * (0.75 + 0.25 * Math.sin(v.t * 60)), R = (f.r || 16) * 1.05;
  for (let j = 0; j < 3; j++) {
    const a0 = hsh(seed * 7 + j) * TAU, a1 = a0 + 1.2 + hsh(seed * 5 + j) * 1.8, z0 = 8 + hsh(seed + j * 3) * 34, z1 = 8 + hsh(seed * 2 + j) * 34;
    bolt(g, Math.cos(a0) * R, Math.sin(a0) * R * 0.45 - z0, Math.cos(a1) * R, Math.sin(a1) * R * 0.45 - z1, seed + j * 17, a, 0.6, 0.35);
  }
  if (frnd(0, 1) < 0.25) bit3(v, 'gspark', f.x + frnd(-R, R), f.y + frnd(-4, 4), frnd(10, 40), { dx: frnd(-50, 50), dy: frnd(-25, 25), dz: frnd(30, 80), s: frnd(1.2, 2), life: 0.2, sh: false, few: true });
}
// ---------------------------------------------------------------- Background Service
const svcSlide = (o, mv) => o.ph === 'slide' ? clamp(o.t / mv.active, 0, 1) : 1;
function service(g, F, v, o) {
  const f = F.f[o.owner], mv = f && f.stats.moves.move2; if (!mv) return;
  const age = o.t - mv.active, arming = o.ph === 'arm' || o.ph === 'slide', end = o.ph === 'zap' || o.ph === 'off' ? clamp(1 - (o.t - (o.zt ?? o.t)) / 0.4, 0, 1) : 1;
  // its light: arming, blinking faster and faster; armed, a slow soft blink; off, out
  const blinkF = arming ? 3 + 14 * clamp(age / mv.arm, 0, 1) : 1.1, on = o.ph === 'zap' || (o.ph !== 'off' && Math.sin(o.t * blinkF * TAU) > (arming ? 0 : 0.6));
  const al = (o.ph === 'live' ? 0.42 : 1) * end;   // (armed: it fades into the floor, running in the background)
  const u = svcSlide(o, mv), sp = o.ph === 'slide' ? (1 - u) : 0;
  softShadow(g, o.x + 1.5, o.y + 1.5, 9, 6, 0.28 * al);
  g.save(); g.translate(o.x, o.y + sp * -2);
  if (!drawProp3D(g, 'drsvc', { state: on ? 'on' : 'off', yaw: Math.atan2(o.y1 - o.y0, o.x1 - o.x0), alpha: al })) {
    g.fillStyle = `rgba(61,220,132,${A3(al)})`; g.beginPath(); g.roundRect(-7, -5, 14, 10, 3); g.fill();
    g.fillStyle = `rgba(244,251,246,${A3(al)})`; g.beginPath(); g.arc(0, 0.5, 3.2, Math.PI, 0); g.fill();
  }
  g.restore();
  if (on) glow(g, o.x - 5, o.y - 3, arming ? 7 : 5, GL, (arming ? 0.55 : 0.3) * end);
  if (o.ph === 'slide' && frnd(0, 1) < 0.5) bit3(v, 'dust', o.x, o.y, 1, { dx: frnd(-20, 20), dy: frnd(-10, 10), dz: frnd(6, 16), g: 0, drag: 2.5, s: frnd(2, 3), grow: 0.8, life: 0.35, fade: 'alpha', al: 0.6, sh: false, few: true });
  if (o.ph === 'zap') {   // bolts up off it into whoever's on it
    const T = F.f[o.to], k = clamp((o.t - (o.zt ?? o.t)) / 0.35, 0, 1);
    if (T && k < 1) { const seed = Math.floor(v.t / 0.04); for (let j = 0; j < 3; j++) bolt(g, o.x + (j - 1) * 4, o.y, T.x + (j - 1) * 6, T.y - 14 - j * 8, seed + j * 23, 1 - k, j === 1 ? 1.1 : 0.8); glow(g, o.x, o.y, 22, G, 0.35 * (1 - k), 0.5); }
  }
}
// ---------------------------------------------------------------- Power Surge
// round him (at his feet): gathering, sparks drawn in; live, jagged arcs round his body and to the floor, a green light
function surge(g, v, f) {
  const k = f.pht || 0, R = (f.r || 17) + 10;
  if (f.ph === 'gather') {
    const q = clamp(k / 0.12, 0, 1);
    glow(g, 0, -22, 22 + 10 * q, G, 0.15 + 0.2 * q, 0.6);
    for (let j = 0; j < 2; j++) if (frnd(0, 1) < 0.8) { const an = frnd(0, TAU), r = frnd(36, 50); bit3(v, 'gspark', f.x + Math.cos(an) * r, f.y + Math.sin(an) * r * 0.55, frnd(8, 44), { to: [f.x, f.y, 24], life: 0.12, s: frnd(1.2, 1.8), sh: false, few: true }); }
    const seed = Math.floor(v.t / 0.05);
    for (let j = 0; j < 2; j++) { const a0 = hsh(seed * 3 + j) * TAU; bolt(g, Math.cos(a0) * R * 1.6, Math.sin(a0) * R * 0.7 - 20, Math.cos(a0) * R * 0.7, Math.sin(a0) * R * 0.35 - 22, seed + j * 9, 0.35 + 0.4 * q, 0.5, 0.3); }
    return;
  }
  if (f.ph !== 'surge') return;
  const seed = Math.floor(v.t / 0.04), fl = 0.8 + 0.2 * Math.sin(v.t * 70);
  glow(g, 0, 0, R * 1.5, G, 0.22 * fl, 0.5); glow(g, 0, -24, R * 1.2, GL, 0.16 * fl);
  for (let j = 0; j < 5; j++) {   // arcs round him: from one point on a loose cage round his body to another
    const a0 = hsh(seed * 7 + j * 3) * TAU, a1 = a0 + 0.9 + hsh(seed * 11 + j) * 1.6, z0 = 6 + hsh(seed + j) * 46, z1 = 6 + hsh(seed * 2 + j * 5) * 46;
    bolt(g, Math.cos(a0) * R, Math.sin(a0) * R * 0.5 - z0, Math.cos(a1) * R, Math.sin(a1) * R * 0.5 - z1, seed + j * 31, fl, j < 2 ? 0.9 : 0.65, 0.3);
  }
  { const a0 = hsh(seed * 17) * TAU; bolt(g, Math.cos(a0) * R * 0.6, Math.sin(a0) * R * 0.3 - 30, Math.cos(a0) * R * 1.3, Math.sin(a0) * R * 0.65, seed * 3 + 5, fl, 0.8, 0.3); }   // (one down to the floor)
  for (const s of [-1, 1]) { const [ax, ay] = antTip(f, s); glow(g, ax, ay, 9, WH, 0.55 * fl); }
  if (frnd(0, 1) < 0.4) { const an = frnd(0, TAU); bit3(v, 'gspark', f.x + Math.cos(an) * R, f.y + Math.sin(an) * R * 0.5, frnd(4, 12), { dx: Math.cos(an) * frnd(40, 80), dy: Math.sin(an) * frnd(20, 40), dz: frnd(30, 80), s: frnd(1.3, 2), life: 0.2, sh: false, few: true }); }
}
// the view's memory of who's been shocked (by a service or the surge): [fighter i] = { t0, dur, seed }
const joltOf = (v, i) => (v.drJolt || (v.drJolt = []))[i];
// his battery: two cells over his head, bobbing; drawn in over() so they ride
// his hops. Hidden while something else sits over his head (KO stars, stagger crystals, the frozen watch)
const CELLS_HIDE = new Set(['ko', 'down', 'getup', 'stagger', 'frozen']);
function battery(g, F, v, f) {
  const B = f.stats.battery; if (!B || CELLS_HIDE.has(f.state)) return;
  const D3 = propReady('drcell', 'c4') && propReady('drcell', 'c0'), base = -ANT - 17 + Math.sin(v.t * 2.4 + f.i * 1.7) * 1.3;
  for (let k = 0; k < B.max; k++) {
    const q = clamp((f.bat || 0) - k, 0, 1), x = (k - (B.max - 1) / 2) * 11, y = base + Math.sin(v.t * 2.4 + f.i * 1.7 + k * 0.9) * 0.6;
    if (!D3) {
      g.fillStyle = 'rgba(20,24,30,0.45)'; g.beginPath(); g.roundRect(x - 3.6, y - 8.6, 7.2, 9.2, 1.4); g.fill();
      if (q > 0) { g.fillStyle = q >= 1 ? `rgba(${G},0.95)` : `rgba(${G},0.45)`; g.beginPath(); g.roundRect(x - 2.6, y - 0.4 - 7.4 * q, 5.2, 7.4 * q, 0.8); g.fill(); }
      continue;
    }
    const st = 'c' + (q >= 1 ? 4 : Math.min(3, Math.floor(q * 4)));
    if (q >= 1) glow(g, x, y - 6, 9, G, 0.18);
    g.save(); g.translate(x, y); drawProp3D(g, 'drcell', { state: st, scale: 1.05 }); g.restore();
  }
}

const CUES = new WeakMap();   // (per fight: the cues already played)
export default {
  id: ID,
  anim(F, v, f) {
    const A = animBase(), k = f.pht || 0, sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
    switch (f.ph) {
      case 'charge': sq(0.04 * ease(k / 0.2)); A.wx = Math.sin(k * 50) * 0.3 * clamp(k / 0.5, 0, 1); break;   // (a hum, building)
      case 'lock': sq(0.05); break;
      case 'beam': sq(-0.05 * Math.exp(-k * 12)); A.fwd = -3 * Math.exp(-k * 8); break;   // (a little kick back)
      case 'cool': break;
      case 'plug': {   // the download: tall, hands cupped, humming as it fills; then crouching to set it down
        const u = clamp(k / Math.max(0.05, f.dur || f.stats.moves.move3.startup), 0, 1);
        if (u < CRADLE) { const q = u / CRADLE; A.pose = 'cradle'; A.hop = 1.5 * ease(q / 0.4); sq(-0.04 * ease(q / 0.4) + 0.015 * Math.sin(k * 60) * q); A.wx = Math.sin(k * 85) * 0.5 * q; A.lean = -0.03; }
        else { const q = ease((u - CRADLE) / (1 - CRADLE)); sq(0.1 * q); A.fwd = 2.5 * q; A.hop = 1.5 * (1 - q); }
        break;
      }
      case 'plugged': {   // the push that sends it out, then up again with a pleased little bob
        const S = settleAnim(Math.max(0, k - 0.06), 0.32, 'plug', 0.08), e = Math.exp(-k * 12);
        S.pose = k < 0.06 ? 'plug' : S.pose; S.sx *= 1 - 0.06 * e; S.sy *= 1 + 0.06 * e; S.fwd = 2.5 + 3 * Math.sin(clamp(k / 0.16, 0, 1) * Math.PI) - 2.5 * ease((k - 0.1) / 0.2);
        S.hop = 2.5 * Math.max(0, Math.sin(clamp((k - 0.14) / 0.18, 0, 1) * Math.PI)); if (k > 0.14) S.mood = 'happy';
        return S;
      }
      case 'flick': { const u = clamp(k / Math.max(0.05, f.dur || 0.2), 0, 1); A.spin = -0.35 * ease(u); sq(0.06 * ease(u)); A.fwd = -2 * ease(u); break; }   // (winding the flick: a turn of the wrist)
      case 'flung': { const S = settleAnim(k, f.dur || 0.3, 'plugout', 0.1); S.spin = -0.35 * Math.exp(-k * 18); return S; }   // (the flick out, then a calm settle)
      case 'gather': A.wx = Math.sin(k * 90) * 0.5; sq(0.05 * ease(k / 0.12)); break;   // (bracing, a buzz building)
      case 'surge': A.wx = Math.sin(k * 120) * 0.7; sq(0.04 + 0.02 * Math.sin(k * 60)); A.hop = 1 + Math.sin(k * 40) * 0.6; break;   // (humming with it, lifted a hair)
      case 'surged': { const S = settleAnim(k, f.dur || 0.15, 'emp', 0.05); return S; }
      case 'drained': { const S = settleAnim(k, f.dur || 0.5, 'reboot', 0.3); S.wx = Math.sin(k * 30) * 0.4 * Math.exp(-k * 4); S.mood = 'dizzy'; return S; }   // (spent: sagging, his lights out a moment)
      default: return null;
    }
    return A;
  },
  ground(g, F, v, o) { if (o.kind === 'drbeam') motes(g, F, o, v.t); },
  things(F, v, g, o, out) {
    if (o.kind === 'drbeam' && (o.ph === 'fire' || o.ph === 'fade')) out.push({ y: o.y + Math.max(0, Math.sin(o.a) * o.len) + 1, d: () => beam(g, F, v, o) });
    else if (o.kind === 'drcube') out.push({ y: o.y, d: () => appCube(g, F, v, o) });
    else if (o.kind === 'drpel') out.push({ y: o.y, d: () => pellet(g, F, v, o) });
    else if (o.kind === 'drsvc') out.push({ y: o.y - 6, d: () => service(g, F, v, o) });   // (flat on the floor: under whoever stands on it)
  },
  behind(g, F, v, f) {
    const other = F.f[1 - f.i];
    if (!other || f.y < other.y || (f.y === other.y && f.i === 0)) marks(g, v);   // (scorches and the EMP's ring: before whoever's drawn first)
    if (f.id !== ID) return null;
    if ((f.ph === 'charge' || f.ph === 'lock') && Math.sin(f.face) < -0.3) chargeBall(g, f, v, f.x, f.y);   // (facing away: the ball behind him)
    if (f.ph === 'plug') { downloadMotes(v, f); g.save(); g.translate(f.x, f.y); cubeInHands(g, v, f, false); g.restore(); }   // (facing away: the cube in his hands behind him)
    return null;
  },
  over(g, F, v, f) {
    { const J = joltOf(v, f.i); if (J) { const k = (v.t - J.t0) / J.dur; if (k >= 0 && k < 1 && f.state !== 'ko') jolted(g, v, f, k, J.seed); else if (k >= 1) v.drJolt[f.i] = null; } }   // (shocked: bolts crawling over them)
    if (f.id !== ID) return;
    if (f.ph === 'charge' || f.ph === 'lock') {   // the antennae glowing and the ball of light swelling, brighter as it charges
      const ch = f.ph === 'lock' ? 1 : clamp((f.pht || 0) / 1.2, 0, 1), fl = 0.8 + 0.2 * Math.sin(v.t * 30);
      for (const s of [-1, 1]) { const [ax, ay] = antTip(f, s); glow(g, ax, ay, 6 + 8 * ch, GL, (0.35 + 0.5 * ch) * fl); g.save(); g.translate(ax, ay); drawProp3D(g, 'drglow', { scale: 0.24 + 0.16 * ch }); g.restore(); }
      if (Math.sin(f.face) >= -0.3) chargeBall(g, f, v, 0, 0);
      if (f.ph === 'charge' && frnd(0, 1) < 0.3) { const an = frnd(0, TAU), r = frnd(22, 34), hx = f.x + Math.cos(f.face) * 17, hy = f.y + Math.sin(f.face) * 17; bit3(v, 'mote', hx + Math.cos(an) * r, hy + Math.sin(an) * r * 0.6, BZ + frnd(-12, 14), { to: [hx, hy, BZ], life: 0.3, s: frnd(1, 1.5), sh: false, few: true }); }
    } else if (f.ph === 'plug') cubeInHands(g, v, f, true);
    else if (f.ph === 'gather' || f.ph === 'surge') surge(g, v, f);
    if (v.drArc) for (let j = v.drArc.length - 1; j >= 0; j--) {   // a hit soaked from close by: bolts leaping off him onto the thrower
      const A = v.drArc[j], k = (v.t - A.t0) / 0.22; if (k >= 1 || k < 0) { v.drArc.splice(j, 1); continue; }
      if (A.i !== f.i) continue;
      const T = F.f[1 - f.i], tx = (T ? T.x : A.x2) - f.x, ty = (T ? T.y : A.y2) - f.y - 22, seed = Math.floor(v.t / 0.04);
      if (A.thin) bolt(g, 0, -24, tx * 0.9, ty * 0.9 + 8, seed, 0.85 * (1 - k), 0.7);   // (the drained surge's last crackle: one thin bolt)
      else for (let n = 0; n < 2; n++) bolt(g, 0, -28 + n * 8, tx, ty + n * 6, seed + n * 13, 1 - k, n ? 0.8 : 1.2);
    }
    if (f.ph === 'drained') {   // the arcs sputtered out: a wisp of smoke off his antennae, their lights flickering back on
      const k = f.pht || 0, on = ease((k - 0.2) / 0.25) * (0.6 + 0.4 * Math.sin(k * 50));
      for (const s of [-1, 1]) { const [ax, ay] = antTip(f, s, false); glow(g, ax, ay, 5, GL, 0.45 * on); if (frnd(0, 1) < 0.12) bit3(v, 'steam', f.x + ax, f.y + 1, -ay, { dx: frnd(-4, 4), dy: frnd(-2, 2), dz: frnd(10, 20), g: -14, drag: 1.4, s: frnd(1.8, 2.6), grow: 1.4, life: 0.6, sh: false, few: true }); }
    }
    battery(g, F, v, f);
  },
  fx(g, F, v, p, k) {
    if (p.k === 'droid:flash') { glow(g, p.x, p.y, p.s * (0.7 + 0.4 * k), p.c || GL, (p.a || 0.7) * (1 - k)); return true; }
    return false;
  },
  event(v, F, e, few) {
    const D3 = propReady('bit:gspark'), q = few ? 0.5 : 1;
    switch (e.kind) {
      case 'drBeam':
        if (!D3) { for (let k = 0; k < (few ? 2 : 5); k++) { const a = frnd(0, TAU), sp = frnd(60, 140); v.fx.push({ k: 'spark2', x: e.x2, y: e.y2 - 24, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - 20, t: 0, life: frnd(0.15, 0.3), s: frnd(4, 7) }); } return true; }
        bits3(v, 'gspark', e.x2, e.y2, BZ, Math.round(6 * q), { speed: [70, 160], up: [60, 160], s: [2.4, 3.6], life: [0.25, 0.4], bo: 0.2 });
        addScorch(v, e.x2, e.y2, 9 + 4 * (e.ch || 0));
        return true;
      case 'drCube': return true;   // (its puff of dust as it plugs in: appCube)
      case 'drPew': v.fx.push({ k: 'droid:flash', x: e.x, y: e.y - 9, t: 0, life: 0.14, s: 13 }); return true;
      case 'drPop':
        if (!D3) { for (let k = 0; k < (few ? 1 : 3); k++) { const a = frnd(0, TAU), sp = frnd(40, 90); v.fx.push({ k: 'spark2', x: e.x, y: e.y - 12, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, t: 0, life: 0.18, s: 4 }); } return true; }
        bits3(v, 'gspark', e.x, e.y, 12, few ? 2 : 4, { speed: [40, 100], up: [40, 110], s: [2.0, 3.0], life: [0.2, 0.32] }); v.fx.push({ k: 'droid:flash', x: e.x, y: e.y - 12, t: 0, life: 0.16, s: 14 });
        return true;
      case 'drCubeOff': bits3(v, 'steam', e.x, e.y, 14, 2, { speed: [5, 12], up: [16, 30], g: -18, drag: 1.4, s: [2.2, 3], grow: 1.3, life: [0.5, 0.7], sh: false }); return true;
      case 'drCubeBreak':
        if (!D3) { puff(v, e.x, e.y, few ? 2 : 3, null); return true; }
        bits3(v, 'gspark', e.x, e.y, 12, Math.round(5 * q), { speed: [50, 120], up: [80, 160], s: [2.2, 3.3], life: [0.25, 0.4] });
        bits3(v, 'bitG', e.x, e.y, 10, Math.round(3 * q), { speed: [40, 90], up: [120, 200], s: [1.6, 2.2], life: [0.6, 0.8], bo: 0.35 });
        bits3(v, 'bitW', e.x, e.y, 10, Math.round(2 * q), { speed: [40, 90], up: [120, 200], s: [1.6, 2.2], life: [0.6, 0.8], bo: 0.35 });
        return true;
      case 'drFlick': bits3(v, 'dust', e.x + Math.cos(e.a || 0) * 20, e.y + Math.sin(e.a || 0) * 20, 2, few ? 1 : 2, { speed: [20, 40], up: [6, 14], g: 0, drag: 2.5, s: [2.5, 3.5], grow: 1, life: [0.35, 0.5], fade: 'alpha', al: 0.7, sh: false }); return true;
      case 'drSvcArm': if (propReady('bit:dust')) bits3(v, 'dust', e.x, e.y, 2, few ? 2 : 4, { speed: [20, 45], up: [6, 16], g: 0, drag: 2.5, s: [2.5, 4], grow: 0.9, life: [0.4, 0.6], fade: 'alpha', al: 0.75, sh: false }); return true;   // (bedding in: a puff of dust)
      case 'drSvcOff': bits3(v, 'steam', e.x, e.y, 6, 2, { speed: [4, 10], up: [12, 24], g: -16, drag: 1.4, s: [2, 2.8], grow: 1.3, life: [0.5, 0.7], sh: false }); return true;
      case 'drSvcZap': case 'drShocked': {   // a shock landing (off a service, or the surge thrown back): sparks off them, a flash, a scorch; bolts crawl over them while they're locked up
        const T = F.f[e.to], M = F.f[e.who] && F.f[e.who].stats.moves, dur = e.kind === 'drSvcZap' ? (M ? M.move2.stun : 0.7) : (M ? M.evade.shock.stun : 0.55);
        if (T && e.hit !== false) (v.drJolt || (v.drJolt = []))[T.i] = { t0: v.t, dur, seed: Math.floor(frnd(0, 999)) };
        v.fx.push({ k: 'droid:flash', x: e.x, y: e.y - 22, t: 0, life: 0.22, s: 36, a: 0.8 });
        if (!D3) { puff(v, e.x, e.y, few ? 1 : 2, null); return true; }
        bits3(v, 'gspark', e.x, e.y, 22, Math.round(9 * q), { speed: [80, 170], up: [60, 160], s: [2.2, 3.4], life: [0.25, 0.4], bo: 0.2 });
        addScorch(v, e.kind === 'drSvcZap' ? e.x2 : e.x, e.kind === 'drSvcZap' ? e.y2 : e.y, 9); v.shake = Math.max(v.shake, 0.15);
        return true;
      }
      case 'drGather': return true;   // (the sparks drawn in: over())
      case 'drSurge': v.fx.push({ k: 'droid:flash', x: e.x, y: e.y - 26, t: 0, life: 0.18, s: 34, a: 0.6 }); return true;
      case 'drSoak': {   // a hit into the lightning: a bright crack; near, bolts leap onto the thrower; from afar, a spit of sparks
        const f = F.f[e.who]; v.fx.push({ k: 'droid:flash', x: e.x, y: e.y - 24, t: 0, life: 0.2, s: e.near ? 40 : 26, a: 0.85 });
        if (e.near && f) (v.drArc || (v.drArc = [])).push({ i: f.i, x2: e.x2, y2: e.y2, t0: v.t });
        if (D3) bits3(v, 'gspark', e.x, e.y, 26, Math.round((e.near ? 6 : 4) * q), { speed: [60, 140], up: [40, 120], s: [1.8, 3], life: [0.2, 0.32], bo: 0.2 });
        return true;
      }
      case 'drNudge': {   // the surge's last crackle shoving a close foe off him: one thin bolt onto them, a spit of sparks where it lands
        (v.drArc || (v.drArc = [])).push({ i: e.who, x2: e.x2, y2: e.y2, t0: v.t, thin: 1 });
        v.fx.push({ k: 'droid:flash', x: e.x, y: e.y - 20, t: 0, life: 0.14, s: 20, a: 0.6 });
        if (D3) bits3(v, 'gspark', e.x, e.y, 18, Math.round(4 * q), { speed: [50, 110], up: [40, 110], s: [1.6, 2.6], life: [0.18, 0.3], bo: 0.2 });
        return true;
      }
      case 'drDrained': bits3(v, 'steam', e.x, e.y, 46, few ? 1 : 2, { speed: [4, 10], up: [10, 20], g: -14, drag: 1.4, s: [2.2, 3], grow: 1.4, life: [0.6, 0.9], sh: false }); return true;
      case 'drCubeZap':   // the cube zapping whoever walked up to it: a flash on the cube, sparks off them
        v.fx.push({ k: 'droid:flash', x: e.x2, y: e.y2 - 10, t: 0, life: 0.16, s: 18, a: 0.8 }); v.fx.push({ k: 'droid:flash', x: e.x, y: e.y - 20, t: 0, life: 0.2, s: 26, a: 0.7 });
        if (D3) bits3(v, 'gspark', e.x, e.y, 18, Math.round(6 * q), { speed: [60, 140], up: [50, 140], s: [2.0, 3.2], life: [0.22, 0.36], bo: 0.2 });
        else puff(v, e.x, e.y, 1, null);
        return true;
    }
    return false;
  },
  icon(g, kind, r, col) {
    const W = col || '#ffffff';
    g.fillStyle = W; g.strokeStyle = W; g.lineCap = 'round'; g.lineJoin = 'round';
    switch (kind) {
      case 'drBeam':   // a little dome head with antennae, a beam out of it
        g.beginPath(); g.arc(-r * 0.35, r * 0.15, r * 0.42, Math.PI, 0); g.closePath(); g.fill();
        g.lineWidth = r * 0.09; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(-r * 0.35 + s * r * 0.18, -r * 0.18); g.lineTo(-r * 0.35 + s * r * 0.32, -r * 0.45); g.stroke(); }
        g.lineWidth = r * 0.16; g.beginPath(); g.moveTo(r * 0.12, -r * 0.02); g.lineTo(r * 0.9, -r * 0.02); g.stroke();
        return true;
      case 'drCube':   // a little cube
        g.beginPath(); g.moveTo(0, -r * 0.75); g.lineTo(r * 0.68, -r * 0.4); g.lineTo(0, -r * 0.05); g.lineTo(-r * 0.68, -r * 0.4); g.closePath(); g.fill();
        g.globalAlpha *= 0.7; g.beginPath(); g.moveTo(-r * 0.68, -r * 0.3); g.lineTo(-r * 0.05, r * 0.05); g.lineTo(-r * 0.05, r * 0.8); g.lineTo(-r * 0.68, r * 0.45); g.closePath(); g.fill(); g.globalAlpha /= 0.7;
        g.globalAlpha *= 0.85; g.beginPath(); g.moveTo(r * 0.68, -r * 0.3); g.lineTo(r * 0.05, r * 0.05); g.lineTo(r * 0.05, r * 0.8); g.lineTo(r * 0.68, r * 0.45); g.closePath(); g.fill(); g.globalAlpha /= 0.85;
        return true;
      case 'drSvc':   // a little app tile on the floor, a robot head on it, a crackle off its corner
        g.beginPath(); g.roundRect(-r * 0.8, -r * 0.35, r * 1.2, r * 0.95, r * 0.22); g.fill();
        g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(-r * 0.2, r * 0.32, r * 0.32, Math.PI, 0); g.fill(); g.globalCompositeOperation = 'source-over';
        g.lineWidth = r * 0.1; g.beginPath(); g.moveTo(r * 0.45, -r * 0.45); g.lineTo(r * 0.62, -r * 0.75); g.lineTo(r * 0.7, -r * 0.5); g.lineTo(r * 0.9, -r * 0.82); g.stroke();
        return true;
      case 'drSurge':   // a little robot head in a crackle of lightning
        g.beginPath(); g.arc(0, r * 0.2, r * 0.36, Math.PI, 0); g.closePath(); g.fill();
        g.lineWidth = r * 0.09;
        for (const sd of [-1, 1]) {
          g.beginPath(); g.moveTo(sd * r * 0.5, -r * 0.55); g.lineTo(sd * r * 0.72, -r * 0.2); g.lineTo(sd * r * 0.55, -r * 0.05); g.lineTo(sd * r * 0.85, r * 0.35); g.stroke();
          g.beginPath(); g.moveTo(sd * r * 0.2, -r * 0.6); g.lineTo(sd * r * 0.32, -r * 0.82); g.stroke();
        }
        return true;
    }
    return false;
  },
  // his own sounds: hums, bleeps, clunks and crackles (beats that aren't events: cues)
  sound(e) {
    switch (e.kind) {
      case 'drBeam': return [['drBeam', 0.6 + 0.4 * (e.ch || 0)]];
      case 'drCube': return [['drPush', 0.7]];
      case 'drPew': return [['drPew', 0.5]];
      case 'drPop': return e.hit ? [['drPing', 0.6], ['fJab', 0.35]] : [['drPfft', 0.3]];
      case 'drCubeOff': return [['drPowerDown', 0.5]];
      case 'drCubeBreak': return [['drClatter', 0.7]];
      case 'drCubeZap': return [['drCrack', 0.7], ['fJab', 0.35]];
      case 'drFlick': return [['drSlide', 0.6]];
      case 'drSvcArm': return [['drArm', 0.5]];
      case 'drSvcZap': return e.hit ? [['drCrack', 0.9], ['drBuzz', 0.5]] : [['drFizz', 0.4]];
      case 'drSvcOff': return [['drPowerDown', 0.35]];
      case 'drGather': return [['drGather', 0.6]];
      case 'drSurge': return [['drSurgeOn', 0.7]];
      case 'drSoak': return e.near ? [['drCrack', 0.9]] : [['drFizz', 0.5]];
      case 'drShocked': return [['drBuzz', 0.7], ['fHeavy', 0.4]];
      case 'drDrained': return [['drSputter', 0.55]];
      case 'drNudge': return [['drCrack', 0.45], ['fJab', 0.25]];
    }
    return null;
  },
  // beats that aren't events: the charge humming up and the line settling; the download; the cube plugging in and booting
  cues(F, play) {
    let M = CUES.get(F); if (!M) CUES.set(F, M = { ph: [], seen: new Set() });
    for (const f of F.f) {
      if (f.id === ID && f.ph !== M.ph[f.i]) { if (f.ph === 'charge') play('drHum', 0.6); else if (f.ph === 'lock') play('drLock', 0.6); else if (f.ph === 'plug') play('drDownload', 0.6); }
      M.ph[f.i] = f.ph;
    }
    for (const o of F.objs || []) {
      if (o.kind !== 'drcube' || !F.f[o.owner]) continue;
      const mv = F.f[o.owner].stats.moves.move3, once = (k, n, vol) => { const key = k + o.id; if (M.seen.has(key)) return; M.seen.add(key); if (M.seen.size > 300) M.seen.clear(); play(n, vol); };
      if (o.t >= HOP) once('in', 'drPlugIn', 0.8);
      if (o.ph === 'boot') for (let k = 1; k <= 4; k++) if (o.t >= HOP + (mv.boot - HOP) * k / 4.4) once('b' + k, 'drBlip' + k, 0.5);
      if (o.ph === 'live') once('live', 'drBoot', 0.5);
    }
  },
  sounds: {
    drBeam: ({ osc, hiss }) => (v, t) => { osc(t, 880, 0.22, 'sawtooth', 0.05 * v, -500); osc(t, 1320, 0.18, 'sine', 0.06 * v, -300); hiss(t, 0.2, 0.05 * v, 'bandpass', 3000, 800); },   // a soft zing
    drPew: ({ osc }) => (v, t) => { osc(t, 1200, 0.06, 'square', 0.035 * v, -700); },   // a little pew
    drBuzz: ({ osc, hiss }) => (v, t) => { osc(t, 110, 0.24, 'sawtooth', 0.06 * v, 30); osc(t, 165, 0.2, 'square', 0.025 * v, -40); hiss(t, 0.22, 0.07 * v, 'bandpass', 2600, 900); },   // a shock buzzing through someone: a hum and a hiss
    drFizz: ({ osc, hiss }) => (v, t) => { hiss(t, 0.35, 0.06 * v, 'highpass', 2500, 900); osc(t, 220, 0.25, 'sawtooth', 0.025 * v, -160); },   // it sputters out
    drBoot: ({ osc }) => (v, t) => { [523, 659, 784].forEach((f, k) => osc(t + k * 0.07, f, 0.08, 'triangle', 0.05 * v)); },   // a start-up chime
    drHum: ({ osc }) => (v, t) => { osc(t, 160, 0.5, 'triangle', 0.04 * v, 260); osc(t, 320, 0.5, 'sine', 0.025 * v, 520); },   // the beam's charge humming up
    drLock: ({ osc }) => (v, t) => { osc(t, 1400, 0.03, 'square', 0.04 * v); osc(t + 0.05, 1900, 0.05, 'sine', 0.05 * v); },   // the line settling: a tick-ting
    drDownload: ({ osc }) => (v, t) => { for (let k = 0; k < 6; k++) osc(t + k * 0.03, 700 + k * 140 + (k % 2) * 220, 0.03, 'square', 0.022 * v); osc(t, 300, 0.2, 'sine', 0.04 * v, 400); },   // data warbling into his hands
    drPush: ({ osc, hiss }) => (v, t) => { hiss(t, 0.1, 0.06 * v, 'bandpass', 900, 1800); osc(t, 330, 0.08, 'triangle', 0.05 * v, 200); },   // the push that sends it out
    drPlugIn: ({ osc, hiss }) => (v, t) => { osc(t, 130, 0.12, 'sine', 0.18 * v, -40); hiss(t, 0.06, 0.06 * v, 'lowpass', 900); osc(t + 0.06, 1500, 0.025, 'square', 0.05 * v); },   // it lands and plugs in: a clunk and a click
    drBlip1: ({ osc }) => (v, t) => osc(t, 660, 0.05, 'sine', 0.05 * v),
    drBlip2: ({ osc }) => (v, t) => osc(t, 784, 0.05, 'sine', 0.05 * v),
    drBlip3: ({ osc }) => (v, t) => osc(t, 880, 0.05, 'sine', 0.05 * v),
    drBlip4: ({ osc }) => (v, t) => osc(t, 1046, 0.06, 'sine', 0.05 * v),   // its four lights coming on, up a scale
    drPing: ({ osc }) => (v, t) => { osc(t, 1600, 0.06, 'square', 0.03 * v, -900); osc(t, 800, 0.1, 'sine', 0.05 * v, -300); },   // a pellet stinging
    drPfft: ({ hiss }) => (v, t) => hiss(t, 0.08, 0.04 * v, 'highpass', 3000),   // a pellet popping on nothing
    drPowerDown: ({ osc }) => (v, t) => { osc(t, 700, 0.35, 'triangle', 0.05 * v, -560); },   // the cube powering down
    drClatter: ({ osc, hiss }) => (v, t) => { osc(t, 220, 0.06, 'square', 0.07 * v, -80); osc(t + 0.07, 180, 0.06, 'square', 0.05 * v, -60); hiss(t, 0.12, 0.08 * v, 'highpass', 2200); },   // kicked over: a clatter and sparks
    drCrack: ({ osc, hiss }) => (v, t) => { hiss(t, 0.06, 0.16 * v, 'highpass', 4000); for (let k = 0; k < 4; k++) osc(t + k * 0.025, 90 + (k % 2) * 60, 0.03, 'sawtooth', 0.07 * v); hiss(t + 0.05, 0.2, 0.05 * v, 'bandpass', 2500, 700); },   // an electric crack
    drSlide: ({ osc, hiss }) => (v, t) => { hiss(t, 0.22, 0.06 * v, 'bandpass', 1400, -600); osc(t, 520, 0.06, 'triangle', 0.035 * v, 300); },   // the tile flicked out, skidding along the floor
    drArm: ({ osc }) => (v, t) => { [0, 0.12, 0.2, 0.26, 0.31].forEach((d, k) => osc(t + d, 1200 + k * 80, 0.025, 'square', 0.028 * v)); },   // arming: a blip quickening, then quiet (it runs in the background)
    drGather: ({ osc, hiss }) => (v, t) => { osc(t, 90, 0.14, 'sawtooth', 0.05 * v, 220); hiss(t, 0.14, 0.05 * v, 'bandpass', 1800, 2600); },   // the sparks gathering: a crackle rising
    drSurgeOn: ({ osc, hiss }) => (v, t) => { osc(t, 120, 0.4, 'sawtooth', 0.05 * v, 20); osc(t, 240, 0.35, 'square', 0.02 * v, -30); for (let k = 0; k < 5; k++) hiss(t + k * 0.07, 0.04, 0.08 * v, 'highpass', 3500); },   // the lightning live: a hum and snapping crackles
    drSputter: ({ osc, hiss }) => (v, t) => { for (let k = 0; k < 3; k++) hiss(t + k * 0.09, 0.05, 0.05 * v * (1 - k * 0.25), 'highpass', 2600); osc(t, 260, 0.35, 'triangle', 0.035 * v, -200); },   // spent: it sputters out and powers down
  },
};
