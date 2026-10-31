// Swifty's Fight art (sim: js/kits/swifty.js). Classic Flat first; tells part of the world (no outlines or arrows), a
// notch calm. Feathers and dust are baked 3D props and bits (art/prop3d.js), 2D stand-ins until baked.
// do / try / catch a crouch with wings quivering, then a low fast dart; each bug snapped up is a gulp; a clip is a
// crescent of air off her wing and a burst of feathers; a miss skids in on her claws, teetering
// Closure a trail of little feathers along the whole loop the boomerang feather will fly, thinning behind it
// Gust (keep the leaves: the user likes them) hovering, leaves whirl round her and skitter out over the cone to its
// full reach; the blow throws tumbling leaves and wind ribbons along it
// Wing Hop a ring of dust on take-off, a soft landing; Hop then Catch: a tuck, then a swoop at them
// Open landings shake two down feathers off her that touch the floor just as she's ready again (a clock for the
// opening).
import { TAU, clamp, frnd } from '../core.js';
import { bold } from '../look.js';
import { puff } from '../draw-fight.js';
import { animBase, settleAnim } from './kits.js';
import { loopAt } from '../kits/swifty.js';
import * as M3 from './model3d.js';
import { bit3, bits3, defBit, defProp, drawProp3D, propReady, propsFor } from './prop3d.js';
import { softShadow } from './arena-mat.js';

const ID = 'swifty';
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const hsh = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const OR = '#f67a34', CREAM = '#fff4ec';

// ---------------------------------------------------------------- the 3D props (baked with her fights)
const { ball, tube, sweep, smoothProf, hex, MATTE, GLOSS, STRIDE } = M3;
const mixC = (a, b, t) => a.map((x, k) => x + (b[k] - x) * t);
const C_CREAM = hex('#fff3e6'), C_PEACH = hex('#ffd2b0'), C_OR = hex('#f67a34'), C_RED = hex('#de4a2c'), C_QUILL = hex('#e9c7a2');
// a feather along x (len, wid, vane bowed curve to one side): cream warming to her orange-red tip, a pale quill
function feather(out, len, wid, curve, o = 1, tipAt = 0.62) {
  const L = len / 2, P = smoothProf([[-L, 0, 0], [-L / 3, curve * 0.55, 0.5], [L / 3, curve, 0.5], [L, curve * 0.5, -0.4]], 3), n = P.length;
  sweep(out, P, t => Math.max(0.25, wid * Math.pow(Math.sin(Math.PI * (0.1 + 0.88 * t)), 0.7) * (t > 0.85 ? 1 - (t - 0.85) * 3 : 1)), 0.32, [0, 0, 1],
    i => { const t = i / (n - 1); return t > tipAt + 0.2 ? C_RED : t > tipAt ? C_OR : t > tipAt - 0.18 ? mixC(C_CREAM, C_PEACH, 0.8) : C_CREAM; }, MATTE, o, 10);
  tube(out, [[-L - len * 0.12, 0, -0.1], ...P.slice(0, Math.round(n * 0.8)).map(p => [p[0], p[1], p[2] + 0.3])], t => 0.42 - 0.25 * t, C_QUILL, MATTE, 0, 6);
}
const turnX = (out, a) => { const c = Math.cos(a), s = Math.sin(a); for (let i = 0; i < out.length; i += STRIDE) for (const j of [0, 3]) { const y = out[i + j + 1], z = out[i + j + 2]; out[i + j + 1] = y * c - z * s; out[i + j + 2] = y * s + z * c; } return out; };
// Closure's boomerang feather (~26 long): a big feather bent like a boomerang, banked a little so its spin wobbles
function boomMesh() { const out = []; feather(out, 26, 4.6, 6.5, 1, 0.6); return turnX(out, 0.42); }
// a feather lying on the floor (a decal, 12 long): the loop's trail
function quillMesh() { const out = []; feather(out, 12, 2.6, 1.6, 0.6); return out; }
// her streak: ribbons of wind trailing back from her (~60 long), white and warm peach, thinning to nothing
function streakMesh() {
  const out = [];
  for (const [y, z, len, w, c] of [[0, 3, 66, 4.2, hex('#ffffff')], [-9, -1, 50, 3.2, hex('#ffe3cc')], [9, -2, 54, 3.2, hex('#ffe3cc')], [-4, -8, 40, 2.4, hex('#ffffff')], [5, 9, 36, 2.2, hex('#fff1e4')]]) {
    const P = smoothProf([[-4, y * 0.6, z * 0.6], [-len * 0.3, y, z], [-len * 0.7, y * 1.25, z * 1.1], [-len, y * 1.5, z * 1.2]], 3);
    sweep(out, P, t => w * (1 - 0.85 * t), t => w * 0.7 * (1 - 0.85 * t), [0, 0, 1], c, GLOSS, 0.4, 8);
  }
  return out;
}
defProp('swboom', { mesh: boomMesh, n: 16, ink: '#8a3a1e' });
defProp('swquill', { mesh: quillMesh, n: 16, decal: true, ink: '#a8664a', r0: 6 });
defProp('swstreak', { mesh: streakMesh, n: 16, ink: '#e0a582', out: 0.35 });
// the beat: a crescent of air swept forward off her wings (~36 across, bowed toward x), two softer ones behind it
function beatMesh() {
  const out = [];
  for (const [x, w, z, c] of [[0, 1, 0, hex('#ffffff')], [-7, 0.8, 1.5, hex('#ffeadb')], [-13, 0.62, 3, hex('#fff4ec')]]) {
    const pts = []; for (let i = 0; i <= 12; i++) { const a = -1.1 + 2.2 * i / 12; pts.push([x + Math.cos(a) * 18 * w - 18 * w, Math.sin(a) * 18 * w, z + 2 * Math.cos(a)]); }
    sweep(out, pts, t => Math.max(0.25, 2.6 * w * Math.sin(Math.PI * t)), t => Math.max(0.25, 1.1 * w * Math.sin(Math.PI * t)), [0, 0, 1], c, GLOSS, 0.4, 8);
  }
  return out;
}
defProp('swbeat', { mesh: beatMesh, n: 16, ink: '#e0a582', out: 0.35 });
// her bits: a feather, a puff of dust (light grey-white)
defBit('swfeather', { mesh: () => { const out = []; feather(out, 12, 3.3, 1.8, 1); return out; }, ink: '#9a5534', r0: 6 });
// two leaves for the gust (green, and one turning orange)
const leaf = (C, R) => () => { const out = [], P = smoothProf([[-4.5, 0, 0], [-1.5, 0.6, 0.8], [1.5, 0.6, 0.8], [4.5, 0, 0]], 3), n = P.length; sweep(out, P, t => Math.max(0.2, 2.6 * Math.sin(Math.PI * t)), 0.3, [0, 0, 1], C, MATTE, 1, 10); tube(out, [[-5.6, 0, 0], ...P.slice(0, n - 2).map(p => [p[0], p[1], p[2] + 0.28])], 0.28, R, MATTE, 0, 5); return out; };
defBit('swleaf', { mesh: leaf(hex('#8fca5c'), hex('#5f9b3b')), ink: '#3f6b26', r0: 4 });
defBit('swleaf2', { mesh: leaf(hex('#f2a548'), hex('#c47a2a')), ink: '#7a4510', r0: 4 });
defBit('swdust', { mesh: () => { const out = []; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU, rr = k ? 2.6 : 0; ball(out, [Math.cos(a) * rr, Math.sin(a) * rr, k ? (hsh(k) - 0.5) * 2 : 1], k ? 2.3 + hsh(k + 1) : 3.2, mixC(hex('#f4f0ea'), hex('#e2dbcf'), hsh(k + 5)), MATTE, 0.5, 12, 8); } return out; }, ink: '#a89e8e', r0: 5 });
propsFor(ID, ['swboom', 'swquill', 'swstreak', 'swbeat', 'bit:swfeather', 'bit:swleaf', 'bit:swleaf2', 'bit:swdust']);
const P3 = id => propReady(id);
// a few feathers off her at (x, y), z up: drifting down, tumbling, settling on the floor
const plume = (v, x, y, z, n, o = {}) => bits3(v, 'swfeather', x, y, z, n, { speed: [20, 70], up: [30, 90], s: [5.4, 7], life: [1, 1.5], g: 110, drag: 2.2, bo: 0, sp: 10, fade: 'alpha', ...o });
const dust = (v, x, y, n, o = {}) => bits3(v, 'swdust', x, y, 3, n, { speed: [30, 80], up: [15, 45], s: [3.2, 4.8], life: [0.45, 0.75], g: 40, drag: 2.4, grow: 0.7, fade: 'alpha', bo: 0, sp: 4, ...o });
// once per key (a go, a hit) in this view
function once(v, key) { const S = v.swOnce || (v.swOnce = new Set()); if (S.has(key)) return false; if (S.size > 200) S.clear(); S.add(key); return true; }
// every `dt` s per fighter and channel (v.swT)
function every(v, f, ch, dt) { const T = v.swT || (v.swT = {}), k = ch + f.i; if (v.t < (T[k] || 0)) return false; T[k] = v.t + dt; return true; }

// ---------------------------------------------------------------- the 2D stand-ins (till the props are baked)
// a little feather: a leaf shape along angle a, s long, cream with an orange-red tip (flat: two flat tones)
function feather2(g, x, y, a, s, al, tip = true) {
  if (al <= 0.01) return;
  g.save(); g.translate(x, y); g.rotate(a); g.globalAlpha *= al;
  g.fillStyle = bold() ? CREAM : '#fff8f2';
  g.beginPath(); g.moveTo(-s, 0); g.quadraticCurveTo(-s * 0.2, -s * 0.42, s, -s * 0.06); g.quadraticCurveTo(-s * 0.1, s * 0.34, -s, 0); g.fill();
  if (tip) { g.fillStyle = bold() ? '#e2492e' : 'rgba(226,73,46,0.9)'; g.beginPath(); g.moveTo(s * 0.35, -s * 0.2); g.quadraticCurveTo(s * 0.7, -s * 0.22, s, -s * 0.06); g.quadraticCurveTo(s * 0.6, s * 0.08, s * 0.3, s * 0.08); g.fill(); }
  g.strokeStyle = 'rgba(160,90,60,0.55)'; g.lineWidth = Math.max(0.6, s * 0.08); g.beginPath(); g.moveTo(-s * 1.15, 0.2); g.lineTo(s * 0.85, -s * 0.04); g.stroke();   // (the quill)
  g.restore();
}
// the gust's cone: a faint haze; winding up, leaves and dust skitter out to its edge; blowing, wind ribbons along it
function cone(g, F, v, o) {
  const f = F.f[o.owner]; if (!f) return;
  const mv = f.stats.moves.move3, R = mv.range, h = mv.arc * Math.PI / 360, blow = o.ph === 'blow', n3 = P3('bit:swleaf') && P3('bit:swdust');
  const A = blow ? clamp(1 - (o.pt || 0) / 0.35, 0, 1) : clamp((o.t || 0) / 0.15, 0, 1);
  if (A <= 0.01) return;
  g.save();
  const gr = g.createRadialGradient(o.x, o.y, 10, o.x, o.y, R);
  gr.addColorStop(0, `rgba(235,240,246,${(0.09 * A).toFixed(3)})`); gr.addColorStop(0.8, `rgba(235,240,246,${(0.07 * A).toFixed(3)})`); gr.addColorStop(1, 'rgba(235,240,246,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(o.x, o.y); g.arc(o.x, o.y, R, o.a - h, o.a + h); g.closePath(); g.fill();
  if (n3) {   // real leaves and dust skittering outward over the floor in it (the wind building), out to its edge
    g.restore();
    if (!blow && every(v, f, 'cn', 0.05)) {
      const an = o.a + frnd(-h, h) * 0.85, d = frnd(24, R * 0.7), sp = frnd(110, 170), x = o.x + Math.cos(an) * d, y = o.y + Math.sin(an) * d;
      if (frnd(0, 1) < 0.65) bit3(v, frnd(0, 1) < 0.35 ? 'swleaf2' : 'swleaf', x, y, 1, { dx: Math.cos(an) * sp, dy: Math.sin(an) * sp * 0.8, dz: frnd(40, 80), g: 360, bo: 0.35, drag: 1.2, s: frnd(4.6, 5.8), life: frnd(0.55, 0.8), sp: frnd(12, 22), fade: 'alpha' });
      else bit3(v, 'swdust', x, y, 2, { dx: Math.cos(an) * sp * 0.6, dy: Math.sin(an) * sp * 0.5, dz: frnd(10, 25), g: 20, drag: 2, grow: 0.7, s: frnd(2.6, 3.6), life: frnd(0.45, 0.6), fade: 'alpha', al: 0.85, sp: 3 });
    }
    return;
  }
  g.lineCap = 'round';   // (2D: wind streaks over the floor, flowing outward)
  for (let j = 0; j < 8; j++) {
    const q = (v.t * (blow ? 2.4 : 1.3) + hsh(j + 2)) % 1, an = o.a + (hsh(j * 5) - 0.5) * 2 * h * 0.85, d = 20 + (R - 20) * q, x = o.x + Math.cos(an) * d, y = o.y + Math.sin(an) * d;
    const al = Math.sin(q * Math.PI) * A * (blow ? 0.8 : 0.5), L = 9 + 6 * hsh(j);
    g.strokeStyle = `rgba(90,80,70,${(al * 0.25).toFixed(3)})`; g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(x - Math.cos(an) * L, y - Math.sin(an) * L + 1); g.quadraticCurveTo(x - Math.cos(an + 0.5) * L * 0.4, y - Math.sin(an + 0.5) * L * 0.4 + 1, x, y + 1); g.stroke();
    g.strokeStyle = `rgba(255,255,255,${al.toFixed(3)})`; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x - Math.cos(an) * L, y - Math.sin(an) * L); g.quadraticCurveTo(x - Math.cos(an + 0.5) * L * 0.4, y - Math.sin(an + 0.5) * L * 0.4, x, y); g.stroke();
  }
  g.restore();
  if (!blow && v.fx.length < 120 && frnd(0, 1) < 0.35) {
    const an = o.a + frnd(-h, h) * 0.8, d = frnd(20, R * 0.6), sp = frnd(70, 120);
    v.fx.push({ k: 'swLeaf', x: o.x + Math.cos(an) * d, y: o.y + Math.sin(an) * d, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, t: 0, life: frnd(0.45, 0.7), s: frnd(2.2, 3.4), a: frnd(0, TAU), leaf: frnd(0, 1) < 0.4 });
  }
}
// the gust's blow: three ribbons of wind (her streak's 3D ribbons) racing out along the cone to its edge, fading
function gustRibbons(F, v, g, o, out) {
  const f = F.f[o.owner]; if (!f || o.ph !== 'blow' || !P3('swstreak')) return;
  const mv = f.stats.moves.move3, R = mv.range, h = mv.arc * Math.PI / 360, k = o.pt || 0;
  for (let j = 0; j < 3; j++) {
    const u = clamp((k - j * 0.04) / 0.3, 0, 1); if (u <= 0 || u >= 1) continue;
    const an = o.a + (j - 1) * h * 0.55, d = 24 + (R - 24) * ease(u), x = o.x + Math.cos(an) * d, y = o.y + Math.sin(an) * d;
    out.push({ y, d: () => { g.save(); g.translate(x, y - 12 - 4 * j); drawProp3D(g, 'swstreak', { yaw: an, alpha: 0.55 * Math.sin(Math.PI * u), scale: 0.75 + 0.35 * u }); g.restore(); } });
  }
}
// the wing's crescent of air (a clip): swept through them at the hit, out along the way she was going, fading
function clip3(g, p, k) {
  if (!P3('swbeat')) return false;
  const u = clamp(k, 0, 1), c = Math.cos(p.a), s = Math.sin(p.a), d = -6 + 22 * ease(u);
  g.save(); g.translate(p.x + c * d, p.y + s * d - 18); drawProp3D(g, 'swbeat', { yaw: p.a, scale: 1 + 0.6 * ease(u), alpha: 0.9 * (1 - u * u) }); g.restore();
  return true;
}
// the beat's crescent from the air (Hop then Catch's swoop): ahead of her at her height as she comes down, tipped down
function beatAir(g, f, k, front) {
  if (!P3('swbeat') || k > 0.18) return;
  const A = f.stats.moves.move1.air, u = k / 0.18, c = Math.cos(f.face), s = Math.sin(f.face), d = 12 + (f.r + A.reach - 10) * ease(u), h = (f.z || 0) + 10;
  g.save();
  if (front) { g.beginPath(); g.rect(f.x - 120, f.y - 1, 240, 120); g.clip(); }
  g.translate(f.x + c * d, f.y + s * d - h); drawProp3D(g, 'swbeat', { yaw: f.face, scale: 0.85 + 0.5 * ease(u), sy: 0.8, alpha: 0.8 * (1 - u * u) }); g.restore();
}
// the feather's loop: little feathers lying along it from where it is now round to her (3D: baked feathers on the floor)
function trail(g, F, v, o) {
  const f = F.f[o.owner]; if (!f) return;
  const mv = f.stats.moves.move2, u0 = o.ph === 'fly' ? clamp((o.ft || 0) / mv.flight, 0, 1) : 0, q3 = P3('swquill');
  const A = o.ph === 'aim' ? clamp((o.t || 0) / 0.12, 0, 1) * 0.9 : 0.8;
  const n = 22, st = TAU / 16;
  for (let j = 1; j < n; j++) {
    const u = j / n; if (u <= u0 + 0.03) continue;
    const [x, y] = loopAt(o, u, f.x, f.y), [x2, y2] = loopAt(o, Math.min(1, u + 0.01), f.x, f.y), a = Math.atan2(y2 - y, x2 - x) + 0.4 * Math.sin(j * 2.3);
    const al = A * clamp((u - u0) / 0.1, 0, 1) * clamp((1 - u) / 0.12, 0, 1) * 0.8;
    if (al <= 0.01) continue;
    if (q3) { const aq = Math.round(a / st) * st; g.save(); g.translate(x, y); g.rotate(a - aq); drawProp3D(g, 'swquill', { yaw: aq, scale: 1.05 + 0.15 * hsh(j), alpha: al }); g.restore(); continue; }
    g.fillStyle = `rgba(80,40,20,${(0.2 * al).toFixed(3)})`; g.beginPath(); g.ellipse(x + 0.6, y + 1, 4, 1.6, a, 0, TAU); g.fill();
    feather2(g, x, y, a, 4.4, al, false);
  }
}
// the streak behind her (3D ribbons of wind), h her height
function streak3(g, f, h, a) {
  const sp = Math.hypot(f.vx || 0, f.vy || 0); if (sp < 200) return;
  g.save(); g.translate(f.x, f.y - h - 18); drawProp3D(g, 'swstreak', { yaw: Math.atan2(f.vy, f.vx), alpha: 0.62 * a, scale: 0.9 + 0.2 * clamp((sp - 200) / 300, 0, 1) }); g.restore();
}

// ---------------------------------------------------------------- the open landings, and the marks a move leaves
// open: her landings (a Gust's, a feather's, a hop's, a skid) and how far through it she is (0..1), else -1
const OPEN = { gust: 1, fling: 1, skid: 1, perch: 1 };
const openU = f => f.id === ID && OPEN[f.ph] && f.state === 'recover' ? clamp((f.t || 0) / Math.max(0.1, f.dur || 0.45), 0, 1) : -1;
// the down shaken loose as she lands: two feathers drifting down, touching the floor as she's ready again
// ([x, y up, turn, size] at u, local)
const DOWN_N = 2, DOWN_FR = [13, 14, 15, 1, 2, 3];   // (its broad frames: it rocks, never edge on)
function downAt(k, u, seed) {
  const s = k ? 1 : -1, pop = ease(u / 0.12), fall = clamp((u - 0.1) / 0.9, 0, 1);
  const y = (40 + 18 * pop + 6 * hsh(seed + k)) * (1 - fall * fall * (3 - 2 * fall) * 0.55 - fall * 0.45);
  const x = s * (12 + 9 * pop) + Math.sin(fall * TAU * 1.4 + k * 2 + seed) * 6 * fall;
  return [x, y, s * 0.5 + Math.sin(fall * TAU * 1.4 + k * 2 + seed) * 0.8, 1 + 0.15 * hsh(seed + k * 3)];
}
function downDraw(g, x, y, turn, sz, al) {
  if (P3('bit:swfeather')) { g.save(); g.translate(x, y); g.rotate(turn * 0.3); drawProp3D(g, 'bit:swfeather', { frame: DOWN_FR[clamp(Math.round((turn + 1.3) / 2.6 * 5), 0, 5)], scale: 1.7 * sz, alpha: al }); g.restore(); }
  else feather2(g, x, y, turn, 6 * sz, al);
}
// a flat leaf lying on the floor (the Gust's litter), turned a, s its size, two flat tones and a vein
function leaf2(g, x, y, a, s, orange, al) {
  const BD = bold();
  g.save(); g.translate(x, y); g.rotate(a); g.globalAlpha *= al;
  g.fillStyle = 'rgba(40,30,20,0.16)'; g.beginPath(); g.ellipse(0.8, 1, s, s * 0.46, 0, 0, TAU); g.fill();
  g.fillStyle = orange ? (BD ? '#f2a548' : '#eea04c') : (BD ? '#8fca5c' : '#94c766'); g.beginPath(); g.moveTo(-s, 0); g.quadraticCurveTo(0, -s * 0.62, s, 0); g.quadraticCurveTo(0, s * 0.62, -s, 0); g.fill();
  g.fillStyle = orange ? '#c47a2a' : '#5f9b3b'; g.beginPath(); g.moveTo(-s, 0); g.quadraticCurveTo(0, s * 0.62, s, 0); g.quadraticCurveTo(0, s * 0.2, -s, 0); g.fill();   // (its shaded half)
  g.strokeStyle = orange ? 'rgba(130,70,20,0.6)' : 'rgba(60,100,40,0.6)'; g.lineWidth = Math.max(0.5, s * 0.1); g.beginPath(); g.moveTo(-s * 1.25, 0.2); g.lineTo(s * 0.8, 0); g.stroke();
  g.restore();
}
// claw marks where she skidded in to land: three short grooves along the way she came (a dark groove, a light lip)
function scuff(g, x, y, a, al, L = 9) {
  const c = Math.cos(a), s = Math.sin(a);
  g.save(); g.lineCap = 'round';
  for (const [dx, dy, col, w] of [[0.6, 0.9, `rgba(255,255,255,${(0.4 * al).toFixed(3)})`, 1.3], [0, 0, `rgba(70,50,36,${(0.42 * al).toFixed(3)})`, 1.6]]) {
    g.strokeStyle = col; g.lineWidth = w;
    for (let j = -1; j <= 1; j++) { const ox = -s * j * 3.2, oy = c * j * 2.6, l = L * (1 - 0.25 * Math.abs(j)); g.beginPath(); g.moveTo(x + ox + dx - c * l, y + oy + dy - s * l * 0.8); g.lineTo(x + ox + dx, y + oy + dy); g.stroke(); }
  }
  g.restore();
}
// the talons' slash (a hit): three curved strokes raked across them, drawn out fast then fading (n of them; s its size)
function claw2(g, x, y, a, s, k, n = 3) {
  const draw = ease(k / 0.3), al = 1 - clamp((k - 0.35) / 0.65, 0, 1); if (al <= 0.01) return;
  const BD = bold(), c = Math.cos(a), sn = Math.sin(a), px = -sn, py = c;
  g.save(); g.lineCap = 'round'; g.globalAlpha *= al;
  for (const [col, w] of [[BD ? OR : 'rgba(246,122,52,0.9)', 4.2 * s], ['#ffffff', 1.9 * s]]) {
    g.strokeStyle = col; g.lineWidth = w;
    for (let j = 0; j < n; j++) {
      const off = (j - (n - 1) / 2) * 6.5 * s, L = 17 * s * (1 - 0.15 * Math.abs(j - (n - 1) / 2)), x0 = x + px * off - c * L * 0.5 + px * L * 0.5, y0 = y + py * off - sn * L * 0.5 + py * L * 0.5 - L * 0.2;
      const x1 = x0 + (c - px) * L * draw, y1 = y0 + (sn - py) * L * draw + L * 0.4 * draw;
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + px * 3 * s, (y0 + y1) / 2 + py * 3 * s, x1, y1); g.stroke();
    }
  }
  g.restore();
}
// the Gust's wind-up: leaves whirling round her, faster and tighter as the blow comes; side -1 far, +1 near; at hover z
function whirl(g, v, f, side, z) {
  const T = f.t || 0, d = Math.max(0.1, f.dur || 0.4), u = clamp(T / d, 0, 1), th0 = 4.5 * T + 9 * T * T / d, R = 28 - 9 * ease(u), L3 = P3('bit:swleaf') && P3('bit:swleaf2');
  for (let k = 0; k < 5; k++) {
    const th = th0 + k * TAU / 5, sn = Math.sin(th); if ((sn >= 0) !== (side > 0)) continue;
    const a = clamp(T / 0.1, 0, 1) * (0.55 + 0.45 * (sn + 1) / 2), x = f.x + Math.cos(th) * R, y = f.y + sn * R * 0.45 - z - 18 - 9 * Math.sin(th * 0.5 + k) , orange = k % 3 === 1;
    if (L3) { g.save(); g.translate(x, y); drawProp3D(g, orange ? 'bit:swleaf2' : 'bit:swleaf', { frame: Math.floor(v.t * 16 + k * 3), scale: 1.75, alpha: a }); g.restore(); }
    else leaf2(g, x, y, th + Math.PI / 2, 4.6, orange, a);
  }
}
const A3 = a => clamp(a, 0, 1).toFixed(3);
// a bug swallowed: a little warm sparkle at her beak and two wisps of its wings drifting off, spinning
function gulpFx(g, p, k) {
  const al = 1 - k, BD = bold();
  g.save();
  const r = 3 + 5 * ease(k / 0.3);
  g.fillStyle = `rgba(255,236,170,${A3(0.8 * al)})`; g.beginPath(); g.arc(p.x, p.y - 24, r * (1 - k * 0.5), 0, TAU); g.fill();
  for (const sd of [-1, 1]) {
    const x = p.x + sd * (4 + 14 * k), y = p.y - 28 - 10 * k + 6 * k * k, a = sd * (0.6 + 5 * k);
    g.save(); g.translate(x, y); g.rotate(a); g.globalAlpha *= al * 0.85;
    g.fillStyle = BD ? '#eef4fa' : 'rgba(225,236,246,0.9)'; g.beginPath(); g.ellipse(0, 0, 3.2, 1.6, 0, 0, TAU); g.fill();
    g.restore();
  }
  g.restore();
}
// her own anim's little extras (a gulp's cheek bulge)
function gulpBulge(v, f) { const T = v.swGulpT && v.swGulpT[f.i]; if (T == null) return 0; const k = v.t - T; return k >= 0 && k < 0.25 ? Math.sin(k / 0.25 * Math.PI) * 0.1 : 0; }

function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }

export default {
  id: ID,
  anim(F, v, f) {
    const A = animBase(), k = f.pht || 0, t = v.t + f.i, sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
    const flap = q => { sq(0.05 * Math.sin(t * 26) * q); A.hop += Math.sin(t * 13) * 1.6 * q; };
    const M = f.stats.moves;
    switch (f.ph) {
      case 'flap': A.hop = 16 * ease(k / 0.2); flap(1.2); break;   // the gust's wind-up: up and hovering, wings beating
      case 'gust': A.hop = 16 - 16 * ease(k / 0.6); A.fwd = -4 * Math.exp(-k * 6); sq(0.06 * Math.exp(-k * 10)); break;   // the blow throws her back a touch, then she drops to her feet
      case 'crouch': { const u = clamp(k / Math.max(0.05, f.dur || 0.12), 0, 1), e = ease(u); sq(0.15 * e); A.fwd = -3 * e; A.lean = 0.07 * e; A.wx = Math.sin(t * 70) * 0.6 * u; break; }   // squashed down, wings snapped up and quivering: about to dart
      case 'dart': { const u = clamp(k / Math.max(0.05, M.move1.active), 0, 1); A.sx *= 1.16 + 0.06 * Math.exp(-k * 20); A.sy *= 0.86; A.lean = 0.14; A.fwd = 3 * ease(k / 0.05); A.hop = 3 * Math.sin(Math.PI * u); break; }   // low and fast, stretched long, leaning into it
      case 'flip': { const u = clamp(k / Math.max(0.05, M.move1.flipT), 0, 1); A.spin = -TAU * ease(u); A.lean = -0.22 * Math.sin(Math.PI * u); sq(-0.08 * Math.sin(Math.PI * u)); break; }   // twirling back off them in the air
      case 'alight': Object.assign(A, settleAnim(k, f.dur || 0.3, 'perch', 0.1)); break;
      case 'skid': { Object.assign(A, settleAnim(k, f.dur || 0.55, 'perch', 0.28)); A.lean += 0.16 * Math.exp(-k * 6); A.fwd += 4 * Math.exp(-k * 5); break; }   // (missed: skidding in on her claws, pitched forward, then catching herself)
      case 'cock': A.fwd = -2 * ease(k / 0.15); A.lean = -0.05; if (f.t > (f.dur || 0) * 0.7) A.wx = Math.sin(t * 36) * 0.5; break;
      case 'fling': sq(-0.07 * Math.exp(-k * 10)); A.fwd = 4 * ease(k / 0.08); break;
      case 'hop': sq(-0.08); flap(0.6); break;
      case 'tuck': { const u = clamp(k / 0.06, 0, 1); sq(0.1 * ease(u)); A.hop = 2 * ease(u); A.fwd = -2 * ease(u); break; }   // up in the hop: a quick tuck, wings snapped in
      case 'swoop': { const e = Math.exp(-k * 12); A.sx *= 1 + 0.1 * e; A.sy *= 1 - 0.08 * e; A.fwd = 3 * ease(k / 0.06); A.lean = 0.08; break; }   // swooping down at them, stretched along it
      case 'perch': sq(0.12 * Math.exp(-k * 9) * Math.cos(k * 18)); break;
      default: return null;
    }
    const u = openU(f);
    if (u >= 0) { const w = Math.exp(-(f.t || 0) * 3.2) * (1 - u); A.lean += 0.08 * Math.sin((f.t || 0) * 13) * w; A.wx += Math.sin((f.t || 0) * 9 + 1) * 0.9 * w; }   // (open, landing: she teeters, catching her balance)
    const b = gulpBulge(v, f); if (b) { A.sx *= 1 + b; A.sy *= 1 - b * 0.4; }   // (a gulp: her cheeks bulge)
    return A;
  },
  ground(g, F, v, o) {
    if (o.kind === 'swCone') cone(g, F, v, o);
    else if (o.kind === 'swFeather') trail(g, F, v, o);
  },
  things(F, v, g, o, out) {
    if (o.kind === 'swCone') { gustRibbons(F, v, g, o, out); return; }
    if (o.kind !== 'swFeather' || o.ph !== 'fly') return;
    out.push({ y: o.y, d: () => {
      softShadow(g, o.x + 1, o.y + 1, 13.5, 5, 0.22);   // its shadow
      const own = F.f[o.owner], mv = own && own.stats.moves.move2;
      if (own && mv) {   // the swirl of air it drags along behind it round its loop (white into her peach, thinning away)
        const u = clamp((o.ft || 0) / mv.flight, 0, 1), BD = bold(), bob = Math.sin(v.t * 9) * 1.2;
        let px = null, py = null;
        g.save(); g.lineCap = 'round';
        for (let j = 0; j <= 9; j++) {
          const uj = u - j * 0.014; if (uj < 0) break;
          const [x, y] = loopAt(o, uj, own.x, own.y), yy = y - 22 + bob;
          if (px != null) { const q = j / 9; g.strokeStyle = BD ? (j < 4 ? `rgba(255,255,255,${(0.85 * (1 - q)).toFixed(3)})` : `rgba(255,214,186,${(0.8 * (1 - q)).toFixed(3)})`) : `rgba(255,${Math.round(255 - 40 * q)},${Math.round(255 - 70 * q)},${(0.75 * (1 - q)).toFixed(3)})`; g.lineWidth = 4.2 * (1 - q) + 0.6; g.beginPath(); g.moveTo(px, py); g.lineTo(x, yy); g.stroke(); }
          px = x; py = yy;
        }
        g.restore();
      }
      if (P3('swboom')) {   // the boomerang feather spinning along at head height, shedding a feather now and then
        g.save(); g.translate(o.x, o.y - 22 + Math.sin(v.t * 9) * 1.2); drawProp3D(g, 'swboom', { frame: v.t * 44 + (o.id || 0), scale: 1.65 }); g.restore();
        if (P3('bit:swfeather') && every(v, F.f[o.owner] || { i: 0 }, 'bm', 0.16)) bit3(v, 'swfeather', o.x, o.y, 20, { dx: frnd(-20, 20), dy: frnd(-12, 12), dz: frnd(10, 30), g: 100, drag: 2.4, bo: 0, s: frnd(3, 3.8), life: frnd(0.9, 1.2), sp: 10, fade: 'alpha' });
      } else feather2(g, o.x, o.y - 22, (o.va || 0) + v.t * 14, 9, 1);
    } });
  },
  floor(g, F, v) {
    const T = v.t;
    for (const [x, y, a, t0, s, orange] of v.swLit || []) {   // the Gust's leaves, settled on the floor along the cone, out to its reach
      const k = T - t0; if (k < 0 || k > 2.4) continue;
      leaf2(g, x, y, a + 0.6 * Math.exp(-k * 8), s * (0.6 + 0.4 * ease(k / 0.12)), orange, clamp((2.4 - k) / 0.8, 0, 1));
    }
    for (const [x, y, a, t0, L] of v.swScuff || []) { const k = (T - t0) / 1.6; if (k >= 0 && k < 1) scuff(g, x, y, a, 1 - ease(k), L); }   // (claw marks where she skidded in)
  },
  behind(g, F, v, f) {
    if (f.id !== ID) return null;
    const D = v.swDown && v.swDown[f.i];   // her landing's down, still drifting as she got going (or was hit): let go, to settle on the floor
    if (D && (openU(f) < 0 || D.key !== f.ms + f.ph)) {
      for (const [x, y, z] of D.pts) if (P3('bit:swfeather')) bit3(v, 'swfeather', x, y, Math.max(0.5, z), { dx: frnd(-10, 10), dy: frnd(-6, 6), dz: z > 2 ? 10 : 0, g: z > 2 ? 90 : 0, drag: 2.2, bo: 0, s: 6.6, life: z > 2 ? 0.9 : 0.6, sp: 4, fade: 'alpha' });
      v.swDown[f.i] = null;
    }
    if (f.ph === 'flap' && f.state === 'wind') whirl(g, v, f, -1, (this.anim(F, v, f) || { hop: 0 }).hop);   // (the whirl's far side, behind her)
    const k = f.pht || 0, F3 = P3('bit:swfeather') && P3('bit:swdust');
    if (f.ph === 'flap' && F3 && every(v, f, 'rs', 0.13)) {   // the downdraft off her wings stirring the floor under her
      const a = frnd(0, TAU); bit3(v, 'swdust', f.x + Math.cos(a) * 10, f.y + Math.sin(a) * 6, 1, { dx: Math.cos(a) * frnd(40, 70), dy: Math.sin(a) * frnd(25, 45), dz: frnd(8, 20), g: 20, drag: 2.2, grow: 0.8, s: frnd(2.6, 3.6), life: frnd(0.45, 0.65), fade: 'alpha', sp: 3 });
      if (frnd(0, 1) < 0.18) plume(v, f.x, f.y, 26, 1, { speed: [10, 40], up: [10, 30] });
    }
    if (f.ph === 'hop' && F3 && every(v, f, 'hp', 0.12)) plume(v, f.x, f.y, (f.z || 0) + 18, 1, { speed: [10, 30], up: [0, 20] });
    if (f.ph === 'swoop') {   // from the air: ribbons of wind off her as she swoops down, the beat's crescent ahead, the floor stirred under her
      if (P3('swstreak')) streak3(g, f, (f.z || 0) - 6, clamp(k / 0.04, 0, 1));
      beatAir(g, f, k, false);
      if (F3 && (f.z || 0) < 10 && every(v, f, 'swd', 0.05)) dust(v, f.x, f.y, 1, { r: 6, speed: [30, 60], up: [10, 25] });
    }
    if (f.ph === 'dart') {   // the dart: ribbons of wind streaming off her, the floor stirred along under her
      if (P3('swstreak')) streak3(g, f, 3, clamp(k / 0.03, 0, 1));
      if (F3 && every(v, f, 'dd', 0.04)) dust(v, f.x - Math.cos(f.face) * 8, f.y - Math.sin(f.face) * 5, 1, { r: 4, speed: [20, 50], up: [6, 18], s: [2.4, 3.4] });
    }
    return null;
  },
  over(g, F, v, f) {   // the beat's crescent: its near part over her (facing the camera, it's in front of her)
    if (f.id !== ID) return;
    const A = (f.ph === 'flap' || openU(f) >= 0) && this.anim(F, v, f);
    if (f.ph === 'flap' && f.state === 'wind') { g.save(); g.translate(-f.x, -f.y + (f.z || 0) + A.hop); whirl(g, v, f, 1, A.hop); g.restore(); }   // (the whirl's near side, over her)
    const u = openU(f);
    if (u >= 0) {   // open, landing: the down shaken off her, drifting down; when it's on the floor she's ready
      const S = v.swDown || (v.swDown = []), key = f.ms + f.ph, seed = (f.ms || 0) * 1.7, pts = [];
      g.save(); g.translate(-(A.wx || 0), (f.z || 0) + (A.hop || 0));   // (at the floor, not lifted or swayed with her)
      for (let k = 0; k < DOWN_N; k++) { const [x, y, turn, sz] = downAt(k, u, seed); downDraw(g, x, -y, turn, sz, clamp(u / 0.06, 0, 1)); pts.push([f.x + x, f.y, y]); }
      g.restore();
      S[f.i] = { key, pts };
    }
    if (f.ph === 'swoop') { g.save(); g.translate(-f.x, -f.y + (f.z || 0)); beatAir(g, f, f.pht || 0, true); g.restore(); }
  },
  event(v, F, e, few) {
    const F3 = P3('bit:swfeather') && P3('bit:swdust');
    const fl = (x, y, n, sp = 80) => { for (let k = 0; k < n; k++) { const a = frnd(0, TAU), s = frnd(sp * 0.4, sp); v.fx.push({ k: 'swFeatherP', x, y: y - frnd(10, 30), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 30, t: 0, life: frnd(0.7, 1.1), s: frnd(3.2, 4.6), a: frnd(0, TAU) }); } };
    const ring = (x, y, n, sp = [45, 80]) => dust(v, x, y, n, { r: 10, speed: sp, few });
    switch (e.kind) {
      case 'swCrouch': if (F3) dust(v, e.x, e.y, few ? 1 : 2, { r: 8, speed: [20, 45], up: [10, 25] }); return true;   // (a puff off her feet as she squats)
      case 'swDart': {   // off she goes: a ring of dust kicked out where she left, a feather
        const a = e.a || 0;
        if (F3) { ring(e.x, e.y, few ? 2 : 4, [50, 95]); plume(v, e.x - Math.cos(a) * 6, e.y - Math.sin(a) * 4, 16, 1, { speed: [10, 40], few }); } else puff(v, e.x, e.y, few ? 1 : 2, null);
        return true;
      }
      case 'swGulp': {   // a bug swallowed: a sparkle at her beak, its wings drifting off; her cheeks bulge (anim)
        const f = F.f[e.who]; if (!f) return true;
        (v.swGulpT || (v.swGulpT = []))[f.i] = v.t;
        v.fx.push({ k: 'sw:gulp', x: f.x + Math.cos(f.face) * 10, y: f.y + Math.sin(f.face) * 6, t: 0, life: 0.45 });
        return true;
      }
      case 'swClip': {   // the wing clips them: its crescent of air sweeps through, a slash of white, a burst of feathers and dust
        const a = e.a || 0;
        v.fx.push({ k: 'sw:clip', x: e.x, y: e.y, a, t: 0, life: 0.26 }, { k: 'swClaw', x: e.x - Math.cos(a) * 4, y: e.y, z: 24, a: a + 0.5, s: 1.5, n: 1, t: 0, life: 0.3 });
        if (F3) { plume(v, e.x, e.y, 24, few ? 3 : 5, { dir: a, spread: 2.4, speed: [60, 140], up: [60, 130], few }); dust(v, e.x, e.y, few ? 2 : 3, { dir: a, spread: 2, speed: [50, 110], up: [20, 50], few }); }
        else { v.fx.push({ k: 'clinkfx', x: e.x, y: e.y - 24, t: 0, life: 0.18, s: 9, a: frnd(0, 1) }); fl(e.x, e.y, few ? 3 : 5, 110); }
        v.shake = Math.max(v.shake, 0.05);
        return true;
      }
      case 'swSkid': {   // overshot: skidding in on her claws, a spray of dust ahead of her and claw marks
        const a = e.a || 0, f = F.f[e.who];
        if (f) { const S = v.swScuff || (v.swScuff = []); S.push([e.x, e.y + 1, a, v.t, 16]); if (S.length > 6) S.shift(); }
        if (F3) { dust(v, e.x + Math.cos(a) * 8, e.y + Math.sin(a) * 5, few ? 2 : 4, { dir: a, spread: 1.1, speed: [40, 90], up: [10, 30] }); plume(v, e.x, e.y, 18, 1, { speed: [10, 30], few }); } else puff(v, e.x, e.y, few ? 1 : 2, null);
        return true;
      }
      case 'swFlap': if (F3) { ring(e.x, e.y, few ? 3 : 5); plume(v, e.x, e.y, 14, 1, { few }); } else puff(v, e.x, e.y, few ? 2 : 3, null); return true;   // (the downdraft off her wings)
      case 'swGust': {   // the blow: a gust of tumbling leaves and dust out along it, right out to its reach
        const a = e.a || 0, mv = F.f[e.who] && F.f[e.who].stats.moves.move3, R = mv ? mv.range : 175, h = (mv ? mv.arc : 70) * Math.PI / 360;
        const Lt = v.swLit || (v.swLit = []);   // (some of them come to rest on the floor along the cone, out to its edge: where it reached, for a moment after)
        for (let k = 0, n = few ? 5 : 9; k < n; k++) { const d = R * (0.3 + 0.7 * Math.sqrt(frnd(0, 1))), b = a + frnd(-h, h) * 0.9; Lt.push([e.x + Math.cos(b) * d, e.y + Math.sin(b) * d, frnd(0, TAU), v.t + 0.12 + 0.35 * d / R, frnd(4, 5.2), k % 3 === 1]); }
        if (Lt.length > 24) Lt.splice(0, Lt.length - 24);
        if (P3('bit:swleaf') && F3) {
          for (let k = 0, n = few ? 7 : 14; k < n; k++) { const b = a + frnd(-0.6, 0.6), sp = frnd(170, 300), d = frnd(14, 34); bit3(v, k % 3 === 0 ? 'swleaf2' : 'swleaf', e.x + Math.cos(b) * d, e.y + Math.sin(b) * d, frnd(6, 20), { dx: Math.cos(b) * sp, dy: Math.sin(b) * sp * 0.8, dz: frnd(40, 110), g: 260, bo: 0.3, drag: 1.4, s: frnd(4.8, 6), life: frnd(0.7, 1), sp: frnd(16, 28), fade: 'alpha', few }); }
          for (let k = 0, n = few ? 2 : 4; k < n; k++) { const b = a + frnd(-0.4, 0.4), sp = frnd(120, 190); bit3(v, 'swdust', e.x + Math.cos(b) * 20, e.y + Math.sin(b) * 20, 4, { dx: Math.cos(b) * sp, dy: Math.sin(b) * sp * 0.8, dz: frnd(10, 30), g: 20, drag: 2, grow: 1, s: frnd(3.6, 5), life: frnd(0.55, 0.8), fade: 'alpha', sp: 3, few }); }
          return true;
        }
        for (let k = 0; k < (few ? 4 : 8); k++) { const b = a + frnd(-0.5, 0.5), sp = frnd(140, 230); v.fx.push({ k: 'swLeaf', x: e.x + Math.cos(b) * 18, y: e.y + Math.sin(b) * 18, vx: Math.cos(b) * sp, vy: Math.sin(b) * sp, t: 0, life: frnd(0.5, 0.8), s: frnd(2.4, 3.6), a: frnd(0, TAU), leaf: k % 3 === 0 }); }
        return true;
      }
      case 'swFeathers': if (F3) { plume(v, e.x, e.y, 24, few ? 3 : 5, { dir: e.a || 0, spread: 2.4, speed: [50, 120], up: [50, 110], few }); if (P3('bit:swleaf')) bits3(v, 'swleaf', e.x, e.y, 18, few ? 2 : 4, { dir: e.a || 0, spread: 1.6, speed: [120, 200], up: [40, 90], s: [4.6, 5.6], life: [0.6, 0.9], g: 260, bo: 0.3, drag: 1.4, sp: 20, fade: 'alpha' }); } else fl(e.x, e.y, few ? 3 : 6, 110); return true;   // (peppered, the leaves blowing on past them)
      case 'swGustMiss': {   // it blew past nobody: the leaves it carried patter down along the cone, spent
        const a = e.a || 0, mv = F.f[e.who] && F.f[e.who].stats.moves.move3, R = mv ? mv.range : 175, h = (mv ? mv.arc : 70) * Math.PI / 360;
        if (P3('bit:swleaf')) for (let k = 0, n = few ? 3 : 6; k < n; k++) { const d = R * frnd(0.45, 0.95), b = a + frnd(-h, h) * 0.8; bit3(v, k % 3 === 0 ? 'swleaf2' : 'swleaf', e.x + Math.cos(b) * d, e.y + Math.sin(b) * d, frnd(30, 55), { dx: Math.cos(b) * 25, dy: Math.sin(b) * 20, dz: 0, g: 70, bo: 0.2, drag: 2.6, s: frnd(4.6, 5.6), life: frnd(1, 1.4), sp: frnd(6, 12), fade: 'alpha' }); }
        else for (let k = 0; k < (few ? 2 : 4); k++) { const d = R * frnd(0.45, 0.95), b = a + frnd(-h, h) * 0.8; v.fx.push({ k: 'swLeaf', x: e.x + Math.cos(b) * d, y: e.y + Math.sin(b) * d, vx: Math.cos(b) * 20, vy: Math.sin(b) * 20, t: 0, life: frnd(0.6, 0.9), s: frnd(2.4, 3.4), a: frnd(0, TAU), leaf: true }); }
        return true;
      }
      case 'swFling': if (F3) plume(v, e.x, e.y, 24, 1, { speed: [10, 30], few }); return true;
      case 'swSnip': { const fb = (F.objs || []).find(o => o.kind === 'swFeather' && o.owner === e.who); v.fx.push({ k: 'swClaw', x: e.x, y: e.y, z: 22, a: fb ? fb.va || 0 : 0, s: 0.95, n: 1, t: 0, life: 0.3 }); }   // (the feather's quill slices through: one cut)
        v.fx.push({ k: 'clinkfx', x: e.x, y: e.y - 24, t: 0, life: 0.16, s: 7, a: frnd(0, 1) }); if (F3) plume(v, e.x, e.y, 22, few ? 1 : 3, { speed: [40, 90], few }); else fl(e.x, e.y, few ? 1 : 2, 60); return true;
      case 'swCatch': if (F3) plume(v, e.x, e.y, 26, 2, { speed: [10, 30], up: [20, 50], s: [3, 3.8], few }); else v.fx.push({ k: 'spark', x: e.x, y: e.y - 26, vx: 0, vy: -20, t: 0, life: 0.35, s: 4, col: OR }); return true;   // (the feather home in her wing: a couple of downy bits drift off)
      case 'swDrop': if (F3) { bit3(v, 'swfeather', e.x, e.y, 22, { dx: frnd(-15, 15), dz: 30, g: 120, drag: 2, bo: 0, s: 8, life: 1.3, sp: 8, fade: 'alpha' }); plume(v, e.x, e.y, 22, 2, { speed: [20, 50], few }); } else { fl(e.x, e.y + 10, 1, 30); puff(v, e.x, e.y, 1, null); } return true;   // (it hit a pillar or a crate: it drops)
      case 'swTuck': if (F3) plume(v, e.x, e.y, (e.z || 20) + 16, few ? 1 : 2, { speed: [20, 50], up: [10, 40] }); else fl(e.x, e.y, 1, 40); return true;   // (the tuck up in the hop: a feather or two shaken loose)
      case 'swHop': if (F3) { ring(e.x, e.y, few ? 3 : 6, [50, 90]); plume(v, e.x, e.y, 12, few ? 1 : 2, { speed: [20, 60], few }); } else puff(v, e.x, e.y, few ? 2 : 3, null); return true;
      case 'swLand': { const f = F.f[e.who]; if (f && e.move !== 'move1') { const S = v.swScuff || (v.swScuff = []); S.push([e.x, e.y + 1, f.face, v.t, 9]); if (S.length > 6) S.shift(); } }   // (claw marks where she lands)
        if (F3) { ring(e.x, e.y, few ? 2 : 4, [35, 65]); plume(v, e.x, e.y, 20, few ? 1 : 2, { speed: [10, 40], few }); } else { puff(v, e.x, e.y, few ? 1 : 2, null); fl(e.x, e.y, few ? 1 : 2, 40); } return true;
    }
    return false;
  },
  fx(g, F, v, p, k, dt) {
    if (p.k === 'swClaw') { claw2(g, p.x, p.y - p.z, p.a, p.s, k, p.n); return true; }
    if (p.k === 'sw:clip') { clip3(g, p, k); return true; }
    if (p.k === 'sw:gulp') { gulpFx(g, p, k); return true; }
    if (p.k === 'swFeatherP') {   // a feather drifting down, rocking side to side (2D)
      p.vy += 40 * dt; p.vx *= 1 - 2 * dt;
      feather2(g, p.x + Math.sin(p.t * 7 + p.a) * 3, p.y, p.a + Math.sin(p.t * 6) * 0.7, p.s, 1 - k * k);
      return true;
    }
    if (p.k === 'swLeaf') {   // a leaf or a bit of dust blown over the floor (2D)
      const al = Math.sin(clamp(k, 0, 1) * Math.PI) * 0.85;
      g.save(); g.translate(p.x, p.y); g.rotate(p.a + p.t * 9); g.globalAlpha *= al;
      if (p.leaf) { g.fillStyle = bold() ? '#9cc56a' : 'rgba(150,196,104,0.95)'; g.beginPath(); g.ellipse(0, 0, p.s, p.s * 0.5, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(90,130,60,0.6)'; g.fillRect(-p.s, -0.3, p.s * 2, 0.6); }
      else { g.fillStyle = 'rgba(236,230,220,0.8)'; g.beginPath(); g.arc(0, 0, p.s * 0.6, 0, TAU); g.fill(); }
      g.restore(); return true;
    }
    return false;
  },
  icon(g, kind, r, col) {
    const W = col || '#ffffff';
    g.fillStyle = W; g.strokeStyle = W; g.lineCap = 'round';
    switch (kind) {
      case 'swCatch':   // a bird's head darting right, beak open on a bug, speed lines behind
        g.lineWidth = r * 0.1; g.globalAlpha *= 0.6;
        for (const [y, l] of [[-0.3, 0.4], [0, 0.55], [0.3, 0.4]]) { g.beginPath(); g.moveTo(-r * 0.85, y * r); g.lineTo(-r * (0.85 - l), y * r); g.stroke(); }
        g.globalAlpha /= 0.6;
        circle(g, -r * 0.1, 0, r * 0.34); g.fill();   // (the head)
        g.beginPath(); g.moveTo(r * 0.16, -r * 0.16); g.lineTo(r * 0.62, -r * 0.3); g.lineTo(r * 0.3, -r * 0.02); g.closePath(); g.fill();   // (the beak, open: upper)
        g.beginPath(); g.moveTo(r * 0.16, r * 0.1); g.lineTo(r * 0.58, r * 0.22); g.lineTo(r * 0.28, r * 0.02); g.closePath(); g.fill();   // (lower)
        circle(g, r * 0.78, -r * 0.02, r * 0.1); g.fill();   // (the bug)
        g.globalAlpha *= 0.6; g.beginPath(); g.ellipse(r * 0.78, -r * 0.16, r * 0.08, r * 0.05, 0.5, 0, TAU); g.fill(); g.globalAlpha /= 0.6;
        g.save(); g.globalCompositeOperation = 'destination-out'; circle(g, -r * 0.05, -r * 0.1, r * 0.07); g.fill(); g.restore();   // (an eye)
        return true;
      case 'swGust':   // three curls of wind, a leaf blown along them
        g.lineWidth = r * 0.13;
        for (const [y, L] of [[-r * 0.42, 0.9], [0, 1.2], [r * 0.42, 0.75]]) { g.beginPath(); g.moveTo(-r * 0.7, y); g.lineTo(-r * 0.7 + r * L, y); g.arc(-r * 0.7 + r * L, y - r * 0.14, r * 0.14, Math.PI / 2, -Math.PI * 0.9, true); g.stroke(); }
        g.save(); g.translate(r * 0.55, r * 0.55); g.rotate(-0.5); g.beginPath(); g.ellipse(0, 0, r * 0.22, r * 0.11, 0, 0, TAU); g.fill(); g.restore();
        return true;
      case 'swClosure':   // a feather on a loop
        g.lineWidth = r * 0.1; g.globalAlpha *= 0.65; g.beginPath(); g.ellipse(0, 0, r * 0.72, r * 0.45, -0.4, 0.5, TAU - 0.2); g.stroke(); g.globalAlpha /= 0.65;
        g.save(); g.rotate(-0.4); g.beginPath(); g.moveTo(-r * 0.55, 0); g.quadraticCurveTo(-r * 0.1, -r * 0.3, r * 0.55, -r * 0.03); g.quadraticCurveTo(-r * 0.05, r * 0.22, -r * 0.55, 0); g.fill(); g.restore();
        return true;
      case 'swHop':   // a spread wing
        g.beginPath(); g.moveTo(-r * 0.7, r * 0.3); g.quadraticCurveTo(-r * 0.2, -r * 0.7, r * 0.75, -r * 0.45); g.lineTo(r * 0.45, -r * 0.15); g.lineTo(r * 0.65, -r * 0.05); g.lineTo(r * 0.3, r * 0.15); g.lineTo(r * 0.45, r * 0.3); g.quadraticCurveTo(-r * 0.1, r * 0.25, -r * 0.7, r * 0.3); g.fill();
        return true;
    }
    return false;
  },
  sound(e) {
    switch (e.kind) {
      case 'tell': return e.move === 'move2' ? [['swCock', 0.4]] : null;   // (the Closure's wing drawn back)
      case 'hit':   // (her hits have their own: the dart's clip and the Gust's leaves are their events'; the feather's quill here)
        if (e.move === 'move2') return [['swQuill', 0.75]];
        if (e.move === 'move1' || e.move === 'move3') return [];
        return null;
      case 'swCrouch': return [['swFlutter', 0.45]];
      case 'swDart': return [['swDart', e.air ? 0.6 : 0.7]];
      case 'swGulp': return [['swGulp', 0.7]];
      case 'swClip': return [['swSlap', 0.75]];
      case 'swSkid': return [['swSkid', 0.6]];
      case 'swTuck': return [['swFlutter', 0.5]];
      case 'swFling': return [['fWhip', 0.6]];
      case 'swSnip': return [['swSnip', 0.6]];
      case 'swCatch': return [['swChirp', 0.6]];
      case 'swDrop': return [['fPop', 0.3]];
      case 'swFlap': return [['swFlap', 0.7]];
      case 'swGust': return [['swWind', 0.9]];
      case 'swFeathers': return [['swRustle', 0.8]];
      case 'swGustMiss': return [['swPatter', 0.5]];
      case 'swHop': return [['swFlap', 0.6]];
      case 'swLand': return [['fStep', 0.4]];
    }
    return null;
  },
  sounds: {
    // the Closure's feather landing: a papery thwip of its vane, a soft thud of the quill and a ruffle after it
    swQuill: ({ osc, hiss }) => (v, t) => { hiss(t, 0.05, 0.12 * v, 'bandpass', 4200, 2200); osc(t + 0.01, 340, 0.07, 'triangle', 0.09 * v, -160); hiss(t + 0.05, 0.12, 0.05 * v, 'bandpass', 1600, 900); },
    // wings beating: three soft airy thumps
    swFlap: ({ osc, hiss }) => (v, t) => { for (let k = 0; k < 3; k++) { hiss(t + k * 0.09, 0.07, 0.1 * v, 'bandpass', 700, 300); osc(t + k * 0.09, 120, 0.06, 'sine', 0.06 * v, -30); } },
    // a quick flutter of feathers (the crouch, the tuck)
    swFlutter: ({ hiss }) => (v, t) => { for (let k = 0; k < 4; k++) hiss(t + k * 0.03, 0.03, 0.05 * v, 'bandpass', 1800 + 300 * k, 1200); },
    // the dart: a sharp rising whoosh
    swDart: ({ osc, hiss }) => (v, t) => { hiss(t, 0.16, 0.13 * v, 'bandpass', 800, 3400); osc(t, 420, 0.08, 'sine', 0.03 * v, 500); },
    // a gulp: a cute little swallow, a blip going down
    swGulp: ({ osc }) => (v, t) => { osc(t, 620, 0.06, 'sine', 0.08 * v, -380); osc(t + 0.07, 300, 0.05, 'sine', 0.06 * v, -120); },
    // the wing's slap: a crisp thwack, a feathery hiss after it
    swSlap: ({ osc, hiss }) => (v, t) => { osc(t, 260, 0.05, 'square', 0.06 * v, -140); hiss(t, 0.04, 0.16 * v, 'highpass', 2200); hiss(t + 0.03, 0.14, 0.06 * v, 'bandpass', 1600, 700); },
    // claws skidding on the floor: a scratchy scrape, slowing
    swSkid: ({ osc, hiss }) => (v, t) => { hiss(t, 0.26, 0.08 * v, 'bandpass', 3000, 1100); for (let k = 0; k < 4; k++) osc(t + k * 0.05, 900 - k * 120, 0.015, 'square', 0.015 * v); },
    // the Closure's wing drawn back: a soft creak of feathers
    swCock: ({ hiss }) => (v, t) => { hiss(t, 0.12, 0.05 * v, 'bandpass', 1200, 2000); },
    // the feather slicing through: a thin whip and a snick
    swSnip: ({ osc, hiss }) => (v, t) => { hiss(t, 0.07, 0.1 * v, 'highpass', 3000, 6000); osc(t + 0.03, 1800, 0.03, 'triangle', 0.04 * v, -600); },
    // a little chirp: the feather back in her wing
    swChirp: ({ osc }) => (v, t) => { osc(t, 2300, 0.05, 'sine', 0.06 * v, 900); osc(t + 0.07, 2800, 0.06, 'sine', 0.05 * v, -600); },
    // the Gust: a rising then falling sweep of air
    swWind: ({ hiss }) => (v, t) => { hiss(t, 0.5, 0.18 * v, 'bandpass', 500, 2400); hiss(t + 0.15, 0.4, 0.08 * v, 'highpass', 3000, 1500); },
    // the Gust catches them: a soft thump of air and a rustling slap of leaves and feathers
    swRustle: ({ osc, hiss }) => (v, t) => { osc(t, 140, 0.12, 'sine', 0.12 * v, -60); for (let k = 0; k < 5; k++) hiss(t + 0.01 + k * 0.035, 0.05, (0.11 - 0.015 * k) * v, 'bandpass', 2600 - 250 * k, 1400); },
    // the Gust catches nobody: its leaves pattering down, a few dry ticks fading
    swPatter: ({ hiss }) => (v, t) => { for (let k = 0; k < 6; k++) hiss(t + 0.12 + k * 0.07 + 0.02 * (k % 2), 0.025, (0.05 - 0.006 * k) * v, 'bandpass', 3400 - 200 * (k % 3), 1800); },
  },
};
