// Cpp's (Keith the rat's) Fight art (sim: js/kits/cpp.js; hooks: kits.js). Scruffy but cute; a utility fighter round
// his flies, so most of what's drawn is his sludge and the flies living off it. Flies, sludge, bubbles and stink clouds
// are low-poly meshes baked per fight (propsFor), with 2D stand-ins while a sheet bakes; glows are kit3-light.js.
//   Dangling Pointer  a fly flicked off his paw; on you it buzzes in loops; missed, it hovers over his sludge, then darts
//   Use After Free    he whistles, his flies lift with red eyes and dive in streaks; 3+ bites stagger; an evade swats them
//   Memory Leak       glossy sludge blobs in his wake, drying, bubbling; now and then a fly hatches from one
//   Sewer Rat         on his sludge he skates low with a glossy wake
//   Play Dead         stink clouds swirl round him on his back, twitching; he flips up in a splash of sludge
// Recoveries are a calm settle. No screen shake.
import { TAU, clamp, frnd } from '../core.js';
import { bold } from '../look.js';
import * as M3 from './model3d.js';
import { animBase, settleAnim } from './kits.js';
import { bit3, bits3, decal3, defBit, defProp, drawProp3D, facetBall, propReady, propsFor } from './prop3d.js';
import { H } from './kit3-earth.js';   // (and its dust bits)
import { glow } from './kit3-light.js';
import { softShadow } from './arena-mat.js';

const ID = 'cpp';
const CUES = new WeakMap();   // (per fight: the cues already played)
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const hsh = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const A3 = a => clamp(a, 0, 1).toFixed(3);
const GOO = '128,150,92', GOOD = '74,92,52', GOOL = '214,232,170', STINK = '176,200,120', WISP = '140,168,96';
const FLY = '42,45,54', WING = '220,232,243', EYE = '255,90,70';
const { hex, ball, ellipsoid, grid, norm, MATTE, GLOSS, FACET } = M3;
const mix = (a, b, t) => a.map((x, k) => x + (b[k] - x) * t);
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }
function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); }

// ---------------------------------------------------------------- the 3D props (world units; x forward, z up)
// a sludge blob on the floor (decal, radius 15): glossy low dome, uneven rim, lobes, grime lumps, bubbles
function gooMesh() {
  const out = [], C = hex('#7a9838'), D = hex('#4e6526'), L = hex('#c3dc7c'), R = 15, nu = 30, nv = 6, Hh = 4.2;
  const rim = a => R * (1 + 0.09 * Math.sin(3 * a + 0.4) + 0.06 * Math.sin(5 * a + 1.9) + 0.03 * Math.sin(9 * a));
  grid(out, (i, j) => {
    const a = TAU * j / nu, u = i / nv, r = rim(a) * u, q = Math.sqrt(Math.max(0, 1 - u * u)), z = Hh * q + 0.15, sl = Hh * u / (R * Math.max(0.22, q));
    const n = norm([Math.cos(a) * sl, Math.sin(a) * sl, 1]); return [[Math.cos(a) * r, Math.sin(a) * r, z], n, n];
  }, nu, nv, C, MATTE, 0);   // (matte: a near-flat gloss top seen from above would all be one glare; its wet glints are below)
  for (let k = 0; k < 3; k++) { const a = k * 2.1 + 0.5, rr = R * 0.78; ellipsoid(out, [Math.cos(a) * rr, Math.sin(a) * rr, 0.2], [[4 + H(k) * 1.5, 0, 0], [0, 3.4 + H(k + 1), 0], [0, 0, 1.9]], C, MATTE, 14, 8, 0); }
  M3.decal(out, [-R * 0.3, -R * 0.28, Hh * 0.93], [-0.25, -0.2, 1], R * 0.22, R * 0.07, 0.2, mix(C, [1, 1, 1], 0.7), -0.5, 0, MATTE);   // (the sky caught in it)
  M3.decal(out, [-R * 0.02, -R * 0.42, Hh * 0.75], [-0.1, -0.5, 1], R * 0.07, R * 0.04, 0.2, mix(C, [1, 1, 1], 0.6), -0.4, 0, MATTE);
  for (let k = 0; k < 3; k++) { const a = k * 2.2 + 1.1, rr = R * (0.25 + 0.35 * H(k + 5)); facetBall(out, [Math.cos(a) * rr, Math.sin(a) * rr, Hh * 0.8], [1.4, 1.2, 0.9], 30 + k, 5, 3, 0.35, () => D, FACET, 0); }
  for (let k = 0; k < 3; k++) { const a = k * 2.5 + 2.4, rr = R * (0.3 + 0.3 * H(k + 9)); ball(out, [Math.cos(a) * rr, Math.sin(a) * rr, Hh * 0.85], 1 + H(k) * 0.7, L, GLOSS, 0.3, 10, 7); }
  return out;
}
// a bubble swelling on the sludge (radius 3)
function bubbleMesh() { const out = [], C = hex('#cfe68e'); ball(out, [0, 0, 0], 3, C, GLOSS, 0.5, 16, 10); ball(out, [-1, -1, 1.6], 0.7, hex('#ffffff'), GLOSS, 0, 8, 6); return out; }
// a stink cloud: pale green puffs heaped up, lower ones darker (origin its middle)
function cloudMesh() {
  const out = [], C = hex('#cadf98'), D = hex('#a9c473'), L = hex('#e3efbd');
  ball(out, [0, 0, 1], 7, L, MATTE, 0.7, 18, 12);
  for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + H(k) * 0.5, r = 7.5 + H(k + 2) * 2, z = (H(k + 4) - 0.55) * 5; ball(out, [Math.cos(a) * r, Math.sin(a) * r * 0.75, z], 4.4 + H(k + 6) * 2.2, z < -1 ? D : C, MATTE, 0.7, 14, 9); }
  return out;
}
// a fly: glossy dark body, big red eyes, pale wings (biting along +x)
function flyMesh() {
  const out = [], B = hex('#2a2d36'), W = hex('#dce8f3');
  ellipsoid(out, [-0.4, 0, 0], [[1.8, 0, 0], [0, 1.15, 0], [0, 0, 1.1]], B, GLOSS, 12, 8, 0.6);
  ball(out, [1.7, 0, 0.2], 0.85, B, GLOSS, 0.5, 10, 7);
  for (const s of [-1, 1]) { ellipsoid(out, [1.95, s * 0.5, 0.55], [[0.35, 0, 0], [0, 0.35, 0], [0, 0, 0.35]], hex('#b83a3a'), GLOSS, 6, 5, 0); ellipsoid(out, [-0.6, s * 1.7, 1.3], [[1.6, 0, 0], [0, 1.4, 0.7], [0, -0.1, 0.25]], W, GLOSS, 12, 8, 0.4); }
  return out;
}
defProp('cpgoo', { mesh: gooMesh, n: 6, decal: true, ink: '#3c4d1c', out: 0, r0: 15 });
defProp('cpbubble', { mesh: bubbleMesh, n: 1, ink: '#5c7a2a', out: 0.35 });
defProp('cpcloud', { mesh: cloudMesh, n: 4, ink: '#7f9a4c', out: 0.6 });
defProp('cpfly', { mesh: flyMesh, n: 8, ink: '#121318', out: 0.35 });
// bits: stink (pale green puffs), fly (a swatted fly tumbling away)
const puffs = (cols, n) => () => { const out = []; for (let k = 0; k < n; k++) { const a = k / n * TAU, rr = k ? 2.6 : 0; ball(out, [Math.cos(a) * rr, Math.sin(a) * rr, k ? (H(k) - 0.5) * 2 : 1], k ? 2.3 + H(k + 1) : 3.2, hex(cols[k % cols.length]), MATTE, 0.5, 12, 8); } return out; };
defBit('stink', { mesh: puffs(['#cfe39e', '#b7cf82'], 5), ink: '#7f9a4c', r0: 4.5 });
defBit('fly', { mesh: flyMesh, ink: '#121318', r0: 2.4 });
propsFor(ID, ['cpgoo', 'cpbubble', 'cpcloud', 'cpfly', 'bit:stink', 'bit:fly', 'bit:dust']);
const once = (v, key) => { const S = v.cpSeen || (v.cpSeen = new Set()); if (S.has(key)) return false; if (S.size > 600) S.clear(); S.add(key); return true; };

// ---------------------------------------------------------------- sludge (the trails and the puddles)
// every blob of a sludge object as drawn (a trail's blobs jittered off the line, seeded by position; a puddle as a
// cluster): where, size now (splat, breathe, dry), alpha
function blobsOf(F, o, t) {
  const out = [], pud = o.src !== 'leak';
  for (let i = 0; i < o.pts.length; i++) {
    const p = o.pts[i], age = o.t - p[2];
    if (age < 0 || age >= o.goo) continue;
    const [x0, y0] = p, h = hsh(x0 * 0.37 + y0 * 0.71), h2 = hsh(x0 * 0.11 - y0 * 0.29), dry = clamp((o.goo - age) / 2.4, 0, 1);
    const land = age < 0.18 ? 0.55 + 0.45 * ease(age / 0.18) + 0.12 * Math.sin(age / 0.18 * Math.PI) : 1, al = Math.min(1, dry * 3);
    const br = 1 + 0.045 * Math.sin(t * 2.6 + h * 9);
    if (!pud) { out.push({ i, h, dry, x: x0 + (h2 - 0.5) * 7, y: y0 + (h - 0.5) * 5, r: o.r * (0.72 + 0.42 * h) * (0.35 + 0.65 * dry) * land, br, al }); continue; }
    const R = o.r * (0.35 + 0.65 * dry) * land;
    out.push({ i, h, dry, x: x0, y: y0, r: R * 0.82, br, al });
    for (let k = 0; k < 4; k++) { const a = h * TAU + k * TAU / 4 + (hsh(k + h * 9) - 0.5) * 0.9, d = R * (0.5 + 0.12 * hsh(k * 3 + h)); out.push({ i, h: hsh(k + h), dry, x: x0 + Math.cos(a) * d, y: y0 + Math.sin(a) * d * 0.85, r: R * (0.45 + 0.15 * hsh(k * 7 + h)), br, al, lobe: 1 }); }
  }
  return out;
}
// the 2D stand-in: soft glossy puddles that run together
function sludge2D(g, B) {
  const BD = bold();
  g.save();
  for (const b of B) { g.globalAlpha = b.al * 0.55; g.fillStyle = `rgb(${GOOD})`; ell(g, b.x + 0.6, b.y + 1.4, b.r * 1.08, b.r * 0.8, b.h * 2); g.fill(); }
  for (const b of B) { g.globalAlpha = b.al * (BD ? 0.9 : 0.82); g.fillStyle = `rgb(${GOO})`; ell(g, b.x, b.y, b.r, b.r * 0.72, b.h * 2); g.fill(); }
  B.forEach((b, k) => { if (k % 3 === 1) { g.globalAlpha = b.al * 0.5; g.fillStyle = `rgb(${GOOL})`; ell(g, b.x - b.r * 0.3, b.y - b.r * 0.22, b.r * 0.26, b.r * 0.1, -0.3); g.fill(); } });
  g.restore();
}
// the sludge in 3D: glossy domes with a dark wet edge; bubbles swelling and popping
function sludge(g, F, v, o) {
  const B = blobsOf(F, o, v.t);
  if (!B.length) return;
  if (!propReady('cpgoo') || !propReady('cpbubble')) { drawProp3D(g, 'cpgoo', { alpha: 0 }); sludge2D(g, B); return; }
  for (const b of B) { g.fillStyle = `rgba(${GOOD},${A3(0.5 * b.al)})`; ell(g, b.x + 0.8, b.y + 1.6, b.r * 1.04, b.r * 0.88); g.fill(); }
  for (const b of B) decal3(g, 'cpgoo', b.x, b.y, b.r * (2 - b.br), { frame: Math.floor(b.h * 6), sy: b.br, alpha: b.al });
  const pop = v.cpPop || (v.cpPop = new Set());
  for (const { i, h, dry, x, y, r, lobe } of B) {
    if (lobe || (o.src === 'leak' && i % 3 !== 1) || dry < 0.3) continue;   // a bubble swelling on it, then popping in a few drops
    const c = v.t * 0.5 + h * 3, n = Math.floor(c), ph = c - n, bx = x + (hsh(i + n) - 0.5) * r * 0.6, by = y - r * 0.05;
    if (ph < 0.8) { g.save(); g.translate(bx, by - r * 0.22 * 0.88); drawProp3D(g, 'cpbubble', { scale: (0.25 + 0.75 * ease(ph / 0.8)) * r / 15 * 1.2 }); g.restore(); }
    else { const key = o.id * 4096 + i * 64 + (n & 63); if (!pop.has(key)) { if (pop.size > 400) pop.clear(); pop.add(key); bits3(v, 'sludge', bx, by, 3, 3, { speed: [10, 30], up: [50, 90], s: [0.7, 1.1], life: [0.35, 0.5], bo: 0, few: true }); } }
  }
}
// green drips round the feet of whoever's walking in the sludge (2D: the stand-in)
function drips2D(g, v) {
  for (let k = 0; k < 4; k++) {
    const an = k / 4 * TAU + v.t * 2, ph = (v.t * 2.2 + k * 0.27) % 1, x = Math.cos(an) * 12, y = Math.sin(an) * 4 + 1 - Math.sin(ph * Math.PI) * 5;
    g.fillStyle = `rgba(${GOO},${A3(0.8 * (1 - ph))})`; ell(g, x, y, 1.8, 2.3); g.fill();
  }
}
// a hatch (fx 'cpp:hatch'): a big bubble pops in a splash (the fly rising out is the sim's)
function hatch(g, v, p, k) {
  const sw = ease(k / 0.7), s = (0.4 + 1.3 * sw) * (k < 0.7 ? 1 + 0.05 * Math.sin(v.t * 30) : 0);
  if (k < 0.7) {
    g.save(); g.translate(p.x, p.y - 3 * s);
    if (!drawProp3D(g, 'cpbubble', { scale: s })) { g.fillStyle = `rgba(207,230,142,0.9)`; circle(g, 0, 0, 3 * s); g.fill(); }
    g.restore();
  } else if (once(v, 'h' + p.id)) bits3(v, 'sludge', p.x, p.y, 5, 5, { speed: [20, 50], up: [80, 140], s: [0.8, 1.3], life: [0.35, 0.55], bo: 0, few: true });
}

// ---------------------------------------------------------------- the flies
// a fly's drawn state: the sim's spot plus its own buzzing loop, height, facing, size, anger (0..1: red eyes)
function flyLook(F, v, o) {
  const t = v.t, id = o.id, foe = F.f[1 - o.owner];
  let x = o.x, y = o.y, z = o.z, yaw = Math.atan2(o.vy || 0, o.vx || 1), mad = 0, perk = 0, s = 3.3;
  switch (o.st) {
    case 'stuck': {   // round them in little loops, each its own spot
      const a = t * 7 + id * 1.7; x += Math.cos(a) * 5; y += Math.sin(a * 1.3) * 3; z = 24 + Math.sin(t * 11 + id) * 5;
      yaw = a + Math.PI / 2; s = 3; break;
    }
    case 'sentry': {   // a lazy figure-eight over its spot; perking up as they come close
      const d = foe ? Math.hypot(foe.x - o.hx, foe.y - o.hy) - foe.r : 999, P = F.f[o.owner] && F.f[o.owner].stats.moves.move1;
      perk = clamp(1 - (d - (P ? P.sense : 40)) / 50, 0, 1) * (o.rest > 0 ? 0.3 : 1);
      const sp = 2.2 + 3.5 * perk, a = t * sp + id * 2.3, R = 9 * (1 - 0.5 * perk);
      x += Math.sin(a) * R; y += Math.sin(a * 2) * R * 0.35; z += Math.sin(t * 3 + id) * 3;
      yaw = perk > 0.5 && foe ? Math.atan2(foe.y - o.y, foe.x - o.x) : Math.atan2(Math.cos(a * 2) * 0.7, Math.cos(a)); break;
    }
    case 'rise': { const a = t * 9 + id; x += Math.cos(a) * 3; y += Math.sin(a) * 2; mad = clamp((o.z - 20) / 30, 0.3, 1); yaw = a; break; }
    case 'dive': mad = 1; s = 3.4; break;
    case 'dart': mad = 0.5; break;
  }
  return { x, y, z, yaw, s, mad, perk };
}
// one fly at (x, y) up z (shadow separate): wings a flickering blur, red eyes when angry, fast ones trail copies
function drawFly(g, v, L, o, al = 1) {
  const { x, y, z, yaw, s, mad } = L, sy = y - z, D3 = propReady('cpfly');
  const sp = Math.hypot(o.vx || 0, o.vy || 0), fast = (o.st === 'fly' || o.st === 'dart' || o.st === 'dive') && sp > 150;
  if (fast) {   // the streak: fading copies behind it and a thin smear
    const ux = (o.vx || 0) / sp, uy = (o.vy || 0) / sp, n = 3, gap = clamp(sp / 60, 3, 9);
    g.save(); g.lineCap = 'round'; g.strokeStyle = `rgba(${FLY},${A3(0.22 * al)})`; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x, sy); g.lineTo(x - ux * gap * (n + 1.5), sy - uy * gap * (n + 1.5) * 0.8 + (o.st === 'dive' ? -gap * 1.2 : 0)); g.stroke(); g.restore();
    for (let k = n; k >= 1; k--) {
      const px = x - ux * gap * k, py = sy - uy * gap * k * 0.8 - (o.st === 'dive' ? gap * 0.4 * k : 0), a = al * (0.45 - k * 0.12);
      if (D3) { g.save(); g.translate(px, py); drawProp3D(g, 'cpfly', { yaw, scale: s * 0.9, alpha: a }); g.restore(); }
      else { g.fillStyle = `rgba(${FLY},${A3(a)})`; ell(g, px, py, 1.3 * s, 0.9 * s); g.fill(); }
    }
  }
  g.save(); g.translate(x, sy);
  if (!D3) { drawProp3D(g, 'cpfly', { alpha: 0 }); g.fillStyle = `rgba(${FLY},${A3(al)})`; ell(g, 0, 0, 1.6 * s, 1.1 * s, yaw); g.fill(); circle(g, Math.cos(yaw) * 1.5 * s, Math.sin(yaw) * 0.9 * s, 0.75 * s); g.fill(); }
  else drawProp3D(g, 'cpfly', { yaw, scale: s, alpha: al });
  // the wings, a blur: two pale ellipses flickering over its back
  const fl = 0.55 + 0.45 * Math.sin(v.t * 70 + o.id * 3), wa = (bold() ? 0.36 : 0.3) * al * (0.6 + 0.4 * fl);
  g.fillStyle = `rgba(${WING},${A3(wa)})`;
  for (const sd of [-1, 1]) { const px = -Math.cos(yaw) * 0.5 * s - Math.sin(yaw) * sd * 0.95 * s, py = Math.cos(yaw) * sd * 0.45 * s - (1.1 + fl * 0.3) * s; ell(g, px, py, 1.15 * s, 0.5 * s, yaw + sd * (0.7 + 0.25 * fl)); g.fill(); }
  if (mad > 0.05) {   // its eyes going red: called in
    const ex = Math.cos(yaw) * 1.6 * s, ey = Math.sin(yaw) * 0.8 * s - 0.3 * s;
    if (!bold()) glow(g, ex, ey, (3 + 1.5 * mad) * s, EYE, 0.55 * mad * al);
    g.fillStyle = `rgba(${EYE},${A3(mad * al)})`; circle(g, ex, ey, (0.5 + 0.2 * mad) * s); g.fill();
  }
  g.restore();
}
// a fly's shadow on the floor: smaller and fainter the higher it is
function flyShadow(g, L, al = 1) {
  const q = 1 / (1 + Math.max(0, L.z) / 35), a = 0.22 * q * al;
  if (a < 0.01) return;
  g.fillStyle = `rgba(20,24,44,${A3(a)})`; ell(g, L.x + 1, L.y + 0.5, 1.6 * L.s * (0.6 + 0.4 * q), 0.7 * L.s * (0.6 + 0.4 * q)); g.fill();
}
// how see-through a fly is now: fading in as it hatches, out as it buzzes off at the end
const flyAlpha = o => clamp(o.t / 0.25, 0, 1);
// a swatted (or used) fly tumbling away dazed, and a little puff where it was
function swatted(v, x, y, z, few, a) {
  const dir = a ?? frnd(0, TAU);
  bit3(v, 'fly', x, y, z, { dx: Math.cos(dir) * frnd(60, 110), dy: Math.sin(dir) * frnd(40, 80), dz: frnd(90, 150), g: 420, s: 6.5, sp: frnd(-60, 60), life: 0.7, bo: 0.3, fade: 'alpha', few: true });
  bits3(v, 'stink', x, y, z, few ? 1 : 2, { speed: [10, 30], up: [10, 30], g: -10, drag: 2, s: [1.6, 2.4], grow: 1.3, life: [0.35, 0.5], fade: 'alpha', al: 0.7, sh: false, few: true });
}
// the flies circling a staggered head (after the swarm's bites): drawn over them at their feet, lifted with them
function dazeFlies(g, v, f, k) {
  const a = clamp(Math.min(k * 6, (1 - k) * 4), 0, 1);
  for (let j = 0; j < 3; j++) {
    const th = v.t * 5 + j * TAU / 3, x = Math.cos(th) * 16, y = Math.sin(th) * 5 - 58 + Math.sin(v.t * 9 + j) * 1.5;
    drawFly(g, v, { x, y, z: 0, yaw: th + Math.PI / 2, s: 2.2, mad: 0 }, { id: j, st: 'stuck', vx: 0, vy: 0 }, a);
  }
}
// the whistle: soft ripples off his mouth while he calls them (at his feet, lifted with him)
function whistle(g, v, f, k) {
  const c = Math.cos(f.face), s = Math.sin(f.face), mx = c * 14, my = s * 7 - 40;
  g.save(); g.lineCap = 'round';
  for (let j = 0; j < 3; j++) {
    const u = (k * 2.6 + j / 3) % 1, r = 5 + u * 16, a = Math.sin(u * Math.PI) * 0.6;
    g.strokeStyle = bold() ? `rgba(255,255,255,${A3(a)})` : `rgba(255,250,230,${A3(a)})`; g.lineWidth = 1.6 * (1 - u * 0.5);
    g.beginPath(); g.arc(mx, my, r, f.face - 0.7, f.face + 0.7); g.stroke();
  }
  g.restore();
}
// the fly on his paw while he winds up a flick (his paw back, behind his shoulder)
function pawFly(g, v, f, k) {
  const c = Math.cos(f.face), s = Math.sin(f.face), back = ease(k / 0.12);
  const x = -c * 15 * back - s * 4, y = -s * 5 * back - 40 - 5 * back;   // (held up behind his head)
  drawFly(g, v, { x, y, z: 0, yaw: f.face, s: 2.6, mad: 0 }, { id: f.i + 5, st: 'stuck', vx: 0, vy: 0 });
}

// ---------------------------------------------------------------- Play Dead
// the stain under the cloud (soft, on the floor)
function stinkFloor(g, o) {
  const grow = ease(o.t / 0.3), fade = clamp((o.life - o.t) / 0.5, 0, 1), a = grow * fade, D3 = propReady('cpcloud');
  if (a <= 0.01) return;
  const n = D3 ? 3 : 7;
  for (let k = 0; k < n; k++) {
    const an = k / n * TAU + o.t * 0.5 + o.id, rr = o.r * (0.35 + 0.3 * hsh(k + o.id)) * grow, x = o.x + Math.cos(an) * rr, y = o.y + Math.sin(an) * rr * 0.8, br = o.r * (0.5 + 0.12 * hsh(k * 3 + o.id)) * grow;
    const gr = g.createRadialGradient(x, y, 0, x, y, br);
    gr.addColorStop(0, `rgba(${STINK},${A3((D3 ? 0.13 : 0.17) * a)})`); gr.addColorStop(1, `rgba(${STINK},0)`);
    g.fillStyle = gr; ell(g, x, y, br, br * 0.8); g.fill();
  }
}
function wisps2D(g, v, o) {   // wavy wisps of stink rising off the cloud (the stand-in)
  const fade = clamp((o.life - o.t) / 0.5, 0, 1) * ease(o.t / 0.3);
  g.save(); g.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    const ph = (v.t * 0.7 + k / 4) % 1, an = hsh(k + o.id) * TAU, x0 = o.x + Math.cos(an) * o.r * 0.55, y0 = o.y + Math.sin(an) * o.r * 0.4, rise = ph * 46;
    g.strokeStyle = `rgba(${WISP},${A3(0.6 * fade * Math.sin(ph * Math.PI))})`; g.lineWidth = 2.2;
    g.beginPath(); for (let j = 0; j <= 6; j++) { const q = j / 6, x = x0 + Math.sin(q * 5 + v.t * 4 + k) * 3.5, y = y0 - rise - q * 16; j ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
  }
  g.restore();
}
// the cloud: puffs swirling round him (each y-sorted so he lies among them), stink rising, flies buzzing
function stink(F, v, g, o, out) {
  const grow = ease(o.t / 0.35), fade = clamp((o.life - o.t) / 0.5, 0, 1), a = grow * fade;
  if (a <= 0.01) return;
  if (!propReady('cpcloud') || !propReady('cpfly')) { drawProp3D(g, 'cpcloud', { alpha: 0 }); out.push({ y: o.y + o.r * 0.5, d: () => wisps2D(g, v, o) }); return; }
  for (let k = 0; k < 7; k++) {
    const an = k / 7 * TAU + v.t * 0.32 + o.id, rr = o.r * (0.55 + 0.25 * hsh(k + o.id)) * (0.55 + 0.45 * grow), x = o.x + Math.cos(an) * rr, y = o.y + Math.sin(an) * rr * 0.75;
    const z = 7 + 7 * hsh(k * 3 + o.id) + Math.sin(v.t * 1.3 + k) * 2, sc = (0.8 + 0.4 * hsh(k * 5 + o.id)) * (0.45 + 0.55 * grow) * (1 + 0.05 * Math.sin(v.t * 2 + k)), al = a * (Math.sin(an) > 0.2 ? 0.55 : 0.85);
    out.push({ y, d: () => { g.save(); g.translate(x, y - z); drawProp3D(g, 'cpcloud', { frame: (k + o.id) % 4, scale: sc, alpha: al }); g.restore(); } });
  }
  for (let j = 0; j < 3; j++) {   // flies, looping round it
    const t = v.t + j * 2.1, x = o.x + Math.cos(t * 2.6 + j * 2) * o.r * 0.62 + Math.sin(t * 7.3 + j) * 5, y = o.y + Math.sin(t * 1.9 + j * 2) * o.r * 0.38;
    const dx = -Math.sin(t * 2.6 + j * 2) * 2.6 * o.r * 0.62, dy = Math.cos(t * 1.9 + j * 2) * 1.9 * o.r * 0.38, z = 30 + Math.sin(t * 5 + j) * 7, buzz = Math.sin(v.t * 90 + j) * 0.6;
    out.push({ y, d: () => {
      softShadow(g, x, y, 3.2, 1.4, 0.2 * a);
      g.save(); g.translate(x + buzz, y - z); drawProp3D(g, 'cpfly', { yaw: Math.atan2(dy, dx), scale: 1.7, alpha: Math.min(1, a * 1.5) }); g.restore();
    } });
  }
  if (frnd(0, 1) < 0.1 * a) { const an = frnd(0, TAU), q = o.r * frnd(0.2, 0.7); bit3(v, 'stink', o.x + Math.cos(an) * q, o.y + Math.sin(an) * q * 0.75, 16, { dz: frnd(14, 26), dx: frnd(-6, 6), g: -14, drag: 1, s: frnd(2.6, 4), grow: 1.2, life: frnd(0.9, 1.3), fade: 'alpha', al: 0.75, sh: false, few: true }); }
}

const SPL = (v, x, y, n, sp = [40, 90], up = [90, 170]) => bits3(v, 'sludge', x, y, 4, n, { speed: sp, up, s: [1.1, 1.9], life: [0.45, 0.65], bo: 0 });
export default {
  id: ID,
  anim(F, v, f) {
    const A = animBase(), k = f.pht || 0, sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
    switch (f.ph) {
      case 'flick': {   // anticipation: he coils back onto his heels, squashing down, his paw (and the fly on it) drawn back
        const u = clamp(k / Math.max(0.05, f.dur || 0.15), 0, 1), e = ease(u);
        A.fwd = -3 * e; A.lean = -0.14 * e; sq(0.1 * e); A.hop = 0; A.wx = u > 0.6 ? Math.sin(k * 80) * 0.4 : 0;   // (a little quiver at full coil)
        break;
      }
      case 'flung': {
        if (f.state === 'recover') {   // follow-through: his weight carries on forward, wobbles back over his feet, settles
          const r = Math.max(0.05, f.dur || 0.22), w = Math.exp(-k * 9) * Math.cos(k * 18);
          A.lean = 0.12 * w; A.fwd = 2.5 * Math.exp(-k * 6); sq(-0.05 * w); A.pose = k < r * 0.45 ? 'strike' : 'stand';
          break;
        }
        A.fwd = 4.5 * ease(k / 0.04); A.lean = 0.16; sq(-0.12 * Math.exp(-k * 18)); A.mood = 'happy'; break;   // (the flick: a whip of the arm, stretched long and leaning into it)
      }
      case 'call': {   // anticipation: up on his toes, chest puffed, stretched tall and trembling as he whistles them in
        const u = clamp(k / Math.max(0.05, f.dur || 0.42), 0, 1), e = ease(u);
        A.sy *= 1 + 0.12 * e; A.sx *= 1 - 0.05 * e + 0.03 * Math.sin(k * 14); A.hop = 2.5 * e + Math.abs(Math.sin(k * 22)) * 0.8 * u; A.wx = Math.sin(k * 60) * 0.7 * u; A.lean = -0.1 * e; A.mood = 'happy';
        break;
      }
      case 'sic': {   // the action: a snap down and forward, paws flung at them, squashed by the snap then stretched toward them
        const s0 = Math.exp(-k * 16);
        A.fwd = 4 * ease(k / 0.05); sq(0.12 * s0 - 0.06 * (1 - s0)); A.lean = 0.18; A.hop = -1.5 * s0; A.mood = 'happy';
        break;
      }
      case 'called': {   // follow-through: a bounce back up, a wobble, then a satisfied settle (watching his swarm work)
        const w = Math.exp(-k * 7) * Math.cos(k * 15);
        A.lean = 0.1 * w; A.hop = Math.max(0, 2.5 * Math.sin(Math.min(1, k / 0.18) * Math.PI)); sq(0.06 * w); A.fwd = 2 * Math.exp(-k * 5);
        A.pose = k < (f.dur || 0.3) * 0.5 ? 'chomp' : 'stand'; A.mood = 'happy';
        break;
      }
      case 'shudder': { const u = clamp(k / 0.12, 0, 1); sq(0.08 * ease(u)); A.wx = Math.sin(k * 70) * 1.4; A.fwd = -1.5 * ease(u); break; }   // (anticipation: a shiver and a crouch, something's leaking)
      case 'leak': A.hop = Math.abs(Math.sin(k * 26)) * 2.8; A.lean = 0.1 + Math.sin(k * 26) * 0.05; sq(-0.04 + 0.05 * Math.abs(Math.cos(k * 26))); A.wx = Math.sin(k * 13) * 0.8; break;   // (scurrying low and leaning in, bouncing on each stride)
      case 'leakend': {   // follow-through: skidding to a stop, his weight pitching forward then rocking back
        const w = Math.exp(-k * 8) * Math.cos(k * 16);
        A.fwd = 3 * Math.exp(-k * 7); A.lean = 0.14 * w; sq(-0.06 * w); A.pose = k < (f.dur || 0.26) * 0.4 ? 'pant' : 'stand';
        break;
      }
      case 'skate': {   // Sewer Rat: down low in his scurry, gliding on his sludge with a sway instead of stepping
        const s = f.sk || 0; A.pose = s > 0.3 ? 'scurry' : undefined;
        A.lean = 0.07 * s * Math.sin(v.t * 5.5 + f.i); A.wx = Math.sin(v.t * 5.5 + f.i) * 1.6 * s; sq(-0.05 * s); A.hop = 0;
        break;
      }
      case 'dead': {   // (a flop, then twitching; lying across the screen, not along it, so he reads as lying down)
        A.hop = k < 0.12 ? Math.sin(k / 0.12 * Math.PI) * 5 : 0; A.wx = k > 0.2 ? Math.sin(k * 30) * 0.4 : 0; A.mood = 'blink';
        if (k >= 0.12) sq(0.1 * Math.exp(-(k - 0.12) * 14) * Math.cos((k - 0.12) * 30));   // (he lands flat with a squash and a jiggle)
        A.spin = (Math.cos(f.face) >= 0 ? 0 : Math.PI) - (f.face + 0.35 * Math.sin(Math.PI / 2 - f.face));
        break;
      }
      case 'scramble': {   // flipping up off his back in a splash
        const u = clamp(k / 0.22, 0, 1);
        A.hop = 8 * Math.sin(u * Math.PI); sq(-0.08 * (1 - u)); A.spin = ((Math.cos(f.face) >= 0 ? 0 : Math.PI) - (f.face + 0.35 * Math.sin(Math.PI / 2 - f.face))) * (1 - ease(u));
        break;
      }
      default: return null;
    }
    return A;
  },
  ground(g, F, v, o) {
    if (o.kind === 'cpleak') sludge(g, F, v, o);
    else if (o.kind === 'cpstink') stinkFloor(g, o);
    else if (o.kind === 'cpfly') flyShadow(g, flyLook(F, v, o), flyAlpha(o));
  },
  things(F, v, g, o, out) {
    if (o.kind === 'cpstink') stink(F, v, g, o, out);
    else if (o.kind === 'cpfly') { const L = flyLook(F, v, o); out.push({ y: L.y, d: () => drawFly(g, v, L, o, flyAlpha(o)) }); }
  },
  behind(g, F, v, f) {
    if (f.id === ID && f.ph === 'dead') { softShadow(g, f.x + 2, f.y + 2, 36, 11, bold() ? 0.26 : 0.3); }   // (lying on his back: a long shadow across under him)
    if (f.id === ID && f.ph === 'skate' && f.sk > 0.05) {   // (skating: a glossy wake on the sludge behind him, drops sprayed off it)
      const sp = Math.hypot(f.vx || 0, f.vy || 0) || 1, ux = (f.vx || 0) / sp, uy = (f.vy || 0) / sp;
      g.strokeStyle = `rgba(${GOOL},${A3(0.55 * f.sk)})`; g.lineWidth = 2.2; g.lineCap = 'round';
      for (const s of [-1, 1]) { const ox = -uy * s * 5, oy = ux * s * 4; g.beginPath(); g.moveTo(f.x + ox, f.y + oy + 2); g.quadraticCurveTo(f.x + ox * 1.6 - ux * 12, f.y + oy * 1.6 - uy * 10 + 2, f.x + ox * 2.4 - ux * 24, f.y + oy * 2.4 - uy * 20 + 2); g.stroke(); }
      if (frnd(0, 1) < 0.3 * f.sk) bit3(v, 'sludge', f.x - ux * 10 + frnd(-4, 4), f.y - uy * 8, 2, { dz: frnd(50, 90), dx: -ux * frnd(30, 70) + frnd(-20, 20), dy: -uy * frnd(20, 50), s: frnd(0.9, 1.4), life: 0.45, bo: 0, few: true });
    }
    return null;
  },
  over(g, F, v, f) {
    if (f.id === ID && f.ph === 'flick' && f.state === 'wind') pawFly(g, v, f, f.pht || 0);
    if (f.id === ID && f.ph === 'call' && f.state === 'wind') whistle(g, v, f, f.pht || 0);
    const dz = v.cpDaze && v.cpDaze[f.i];
    if (dz && f.state === 'stagger') dazeFlies(g, v, f, clamp((v.t - dz.t0) / dz.d, 0, 1));
    for (const o of F.objs) if (o.kind === 'cpleak' && o.on && o.owner !== f.i && F.f[o.owner] && F.f[o.owner].id === ID) {   // (wading in the sludge: it round their feet, drops flicking up)
      if (!propReady('cpgoo')) { drips2D(g, v); break; }
      decal3(g, 'cpgoo', 0, 3, 12 + Math.sin(v.t * 3) * 0.6, { frame: (f.i + 2) % 6, alpha: 0.95 });
      if (frnd(0, 1) < 0.14) bit3(v, 'sludge', f.x + frnd(-10, 10), f.y + frnd(-3, 4), 3, { dz: frnd(60, 100), dx: frnd(-22, 22), dy: frnd(-10, 10), s: frnd(1, 1.6), life: 0.5, bo: 0, few: true });
      break;
    }
  },
  fx(g, F, v, p, k) {
    if (p.k === 'cpp:hatch') { hatch(g, v, p, k); return true; }
    if (p.k === 'cpp:bite') {   // a little crunch where a fly bit: a white snap of teeth marks and a ring of dust
      const a = 1 - k, r = 4 + 9 * ease(k);
      g.save(); g.lineCap = 'round'; g.strokeStyle = `rgba(255,255,255,${A3(0.85 * a)})`; g.lineWidth = 1.8 * a + 0.4;
      for (let j = 0; j < 4; j++) { const an = p.a + j * TAU / 4 + 0.4; g.beginPath(); g.moveTo(p.x + Math.cos(an) * r * 0.5, p.y + Math.sin(an) * r * 0.5); g.lineTo(p.x + Math.cos(an) * r, p.y + Math.sin(an) * r); g.stroke(); }
      g.restore(); return true;
    }
    return false;
  },
  event(v, F, e, few) {
    const f = F.f[e.who];
    switch (e.kind) {
      case 'cpFlick': if (f) bits3(v, 'stink', f.x + Math.cos(e.a) * 16, f.y + Math.sin(e.a) * 8, 30, 1, { speed: [10, 20], up: [5, 15], g: -10, drag: 2, s: [1.4, 2], grow: 1.2, life: [0.3, 0.4], fade: 'alpha', al: 0.5, sh: false, few: true }); return true;   // (a tiny puff off his paw)
      case 'cpStick': { const o = F.f[e.to]; if (o) bits3(v, 'sludge', o.x, o.y, 22, few ? 1 : 2, { speed: [20, 50], up: [30, 70], s: [0.8, 1.2], life: [0.3, 0.45], bo: 0, few: true }); return true; }   // (it lands on you: a squelch)
      case 'cpHatch': v.fx.push({ k: 'cpp:hatch', x: e.x, y: e.y, id: e.id, t: 0, life: 0.85 }); return true;
      case 'cpSwat': swatted(v, e.x, e.y, 26, few); return true;
      case 'cpShoo': bit3(v, 'fly', e.x, e.y, 22, { dx: frnd(-40, 40), dy: frnd(-30, 10), dz: 60, g: -40, s: 6.5, sp: 4, life: 0.8, bo: 0, fade: 'alpha', sh: false, few: true }); return true;   // (it buzzes off, up and away)
      case 'cpBite': {   // a crunch on them, a bit of dust; the fly's used up
        const o = F.f[e.to];
        if (o) { const a = frnd(0, TAU); v.fx.push({ k: 'cpp:bite', x: e.x, y: e.y - 18, a, t: 0, life: 0.22 }); if (propReady('bit:dust')) bits3(v, 'dust', e.x, e.y, 16, few ? 1 : 2, { speed: [20, 50], up: [20, 50], g: 0, drag: 3, s: [2, 3], grow: 1, life: [0.3, 0.45], fade: 'alpha', al: 0.7, sh: false, few: true }); }
        return true;
      }
      case 'cpMiss': swatted(v, e.x, e.y, 6, few); return true;
      case 'cpSwarm': { const o = F.f[e.to]; if (o) { const D = v.cpDaze || (v.cpDaze = {}); D[e.to] = { t0: v.t, d: (f && f.stats.moves.move2.stagT) || 0.6 }; } return true; }
      case 'cpCall': case 'cpDive': case 'cpDart': case 'cpSettle': return true;   // (the flies themselves show it)
      case 'cpLeak': SPL(v, e.x, e.y, few ? 3 : 5, [30, 70], [80, 150]); return true;
      case 'cpGoo': { const o = F.f[e.to]; SPL(v, o ? o.x : e.x, o ? o.y : e.y, few ? 2 : 4, [25, 60], [90, 150]); return true; }   // (a squelch as they step in)
      case 'cpDead': bits3(v, 'stink', e.x, e.y, 6, few ? 3 : 5, { speed: [30, 60], up: [10, 30], g: -10, drag: 2, s: [3, 4.5], grow: 1.2, life: [0.6, 0.9], fade: 'alpha', al: 0.8, sh: false }); bits3(v, 'dust', e.x, e.y, 2, few ? 2 : 3, { speed: [25, 50], up: [8, 20], g: 0, drag: 2.5, s: [3, 4.5], grow: 1, life: [0.4, 0.6], fade: 'alpha', al: 0.8, sh: false }); return true;
      case 'cpUp': SPL(v, e.x, e.y, few ? 5 : 10, [60, 130], [110, 200]); return true;   // (up in a splash: the puddle's the sim's)
    }
    return false;
  },
  icon(g, kind, r, col) {
    const W = col || '#ffffff';
    g.fillStyle = W; g.strokeStyle = W; g.lineCap = 'round'; g.lineJoin = 'round';
    // a fly from above at (x, y), s its size, a its heading: a round body, a head, two wings
    const fly = (x, y, s, a) => {
      const c = Math.cos(a), sn = Math.sin(a);
      g.beginPath(); g.ellipse(x, y, s * 0.55, s * 0.38, a, 0, TAU); g.fill();
      circle(g, x + c * s * 0.6, y + sn * s * 0.6, s * 0.26); g.fill();
      g.globalAlpha *= 0.6;
      for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(x - c * s * 0.2 - sn * sd * s * 0.45, y - sn * s * 0.2 + c * sd * s * 0.45, s * 0.42, s * 0.22, a + sd * 0.9, 0, TAU); g.fill(); }
      g.globalAlpha /= 0.6;
    };
    switch (kind) {
      case 'cpFlick':   // a fly zipping right, three speed dashes behind it
        fly(r * 0.32, 0, r * 0.62, 0);
        g.lineWidth = r * 0.11; for (const [y, l] of [[-0.3, 0.42], [0, 0.6], [0.3, 0.42]]) { g.beginPath(); g.moveTo(-r * 0.25, y * r); g.lineTo(-r * (0.25 + l), y * r); g.stroke(); }
        return true;
      case 'cpFree':   // three flies diving in on a dot from round it
        circle(g, 0, r * 0.38, r * 0.17); g.fill();
        for (const [x, y, a] of [[-0.62, -0.5, 0.85], [0, -0.75, Math.PI / 2], [0.62, -0.5, Math.PI - 0.85]]) fly(x * r, y * r, r * 0.42, a);
        g.lineWidth = r * 0.07; g.globalAlpha *= 0.6;
        for (const [x, y] of [[-0.36, -0.12], [0, -0.32], [0.36, -0.12]]) { g.beginPath(); g.moveTo(x * r, y * r); g.lineTo(x * 0.45 * r, (y * 0.3 + 0.2) * r); g.stroke(); }
        g.globalAlpha /= 0.6;
        return true;
      case 'cpLeak':   // a drip over a little puddle
        g.beginPath(); g.moveTo(0, -r * 0.85); g.bezierCurveTo(r * 0.45, -r * 0.2, r * 0.42, r * 0.25, 0, r * 0.25); g.bezierCurveTo(-r * 0.42, r * 0.25, -r * 0.45, -r * 0.2, 0, -r * 0.85); g.fill();
        g.globalAlpha *= 0.6; g.beginPath(); g.ellipse(0, r * 0.62, r * 0.8, r * 0.2, 0, 0, TAU); g.fill(); g.globalAlpha /= 0.6;
        return true;
      case 'cpDead':   // a round body on its back, four little legs up, a tail
        g.beginPath(); g.ellipse(0, r * 0.2, r * 0.65, r * 0.42, 0, 0, TAU); g.fill();
        g.lineWidth = r * 0.14; for (const x of [-0.4, -0.15, 0.15, 0.4]) { g.beginPath(); g.moveTo(x * r, -r * 0.05); g.lineTo(x * r * 1.2, -r * 0.6); g.stroke(); }
        g.lineWidth = r * 0.08; g.beginPath(); g.moveTo(r * 0.6, r * 0.3); g.quadraticCurveTo(r * 0.95, r * 0.4, r * 0.85, r * 0.75); g.stroke();
        return true;
    }
    return false;
  },
  sound(e) {
    switch (e.kind) {
      case 'tell': return e.move === 'move1' ? [['cpWind', 0.5]] : e.move === 'move3' ? [['cpShiver', 0.5]] : null;   // (the flick's wind-up: a fly buzzing up on his paw; the leak's shudder)
      case 'cure': return [['fCure', 0.35]];   // (his sludge's poison wearing off: js/art/status.js)
      case 'cpFlick': return [['cpFlick', 0.6]];
      case 'cpStick': return [['cpSplat', 0.5], ['cpBuzz', 0.45]];
      case 'cpSettle': return [['cpHum', 0.35]];
      case 'cpDart': return [['cpZip', 0.55]];
      case 'cpHatch': return [['cpBlup', 0.5], ['cpHum', 0.25]];
      case 'cpSwat': return [['cpSwat', 0.6]];
      case 'cpShoo': return [['cpShoo', 0.3]];
      case 'cpCall': return [['cpWhistle', 0.7], ['cpGather', 0.3 + 0.1 * Math.min(5, e.n || 1)]];
      case 'cpDive': return [['cpSwoop', 0.6 + 0.08 * Math.min(5, e.n || 1)]];
      case 'cpBite': return [['cpChomp', 0.6]];
      case 'cpSwarm': return [['fThud', 0.5], ['cpGather', 0.8]];
      case 'cpMiss': return [['cpSwat', 0.3]];
      case 'cpLeak': return [['cpGlug', 0.6], ['cpSquelch', 0.5]];
      case 'cpGoo': return [['cpSquelch', 0.5]];
      case 'cpDead': return [['cpEek', 0.6], ['fBelly', 0.4], ['cpShiver', 0.3]];   // (a squeal as he flops over)
      case 'cpUp': return [['cpSquelch', 0.7], ['cpSqueak', 0.5], ['fStep', 0.3]];
      case 'hit': return e.move === 'move2' ? [['fJab', 0.35]] : null;   // (a swarm's bites: light, as several land at once; the chomp is cpBite's)
    }
    return null;
  },
  // beats that aren't events: wet footfalls along the sludge as he scurries off for the leak
  cues(F, play) {
    let M = CUES.get(F); if (!M) CUES.set(F, M = {});
    for (const f of F.f) {
      if (f.id !== ID) continue;
      const n = f.ph === 'leak' ? Math.floor((f.pht || 0) / 0.13) : -1; if (n >= 0 && M[f.i] !== n) play('cpPatter', 0.5); M[f.i] = n;
    }
  },
  sounds: {
    cpSqueak: ({ osc }) => (v, t) => { osc(t, 1700, 0.05, 'sine', 0.05 * v, 500); osc(t + 0.05, 2100, 0.04, 'sine', 0.04 * v, -300); },   // a rat's squeak
    cpEek: ({ osc }) => (v, t) => { osc(t, 1900, 0.12, 'sine', 0.05 * v, 700); osc(t + 0.01, 1910, 0.12, 'triangle', 0.025 * v, 690); },   // a squeal
    cpPatter: ({ osc, hiss }) => (v, t) => { hiss(t, 0.03, 0.05 * v, 'lowpass', 900); osc(t, 230, 0.04, 'sine', 0.05 * v, 90); hiss(t + 0.055, 0.03, 0.04 * v, 'lowpass', 800); },   // wet little steps
    cpSquelch: ({ osc, hiss }) => (v, t) => { osc(t, 180, 0.16, 'sine', 0.1 * v, 120); hiss(t, 0.14, 0.05 * v, 'lowpass', 600); },   // a wet squelch
    cpFlick: ({ osc, hiss }) => (v, t) => { osc(t, 1300, 0.03, 'square', 0.03 * v, -500); hiss(t, 0.06, 0.04 * v, 'bandpass', 3200, 1600); osc(t + 0.02, 210, 0.16, 'sawtooth', 0.025 * v, 40); },   // a flick and a buzz going off
    cpBuzz: ({ osc }) => (v, t) => { for (let k = 0; k < 3; k++) osc(t + k * 0.05, 190 + (k % 2) * 30, 0.07, 'sawtooth', 0.022 * v, 15); },   // a fly's buzz
    cpBlup: ({ osc }) => (v, t) => { osc(t, 260, 0.08, 'sine', 0.08 * v, 260); osc(t + 0.07, 520, 0.05, 'sine', 0.05 * v, -200); },   // a bubble swelling and popping
    cpSwat: ({ osc, hiss }) => (v, t) => { hiss(t, 0.06, 0.09 * v, 'bandpass', 1800, 700); osc(t, 320, 0.05, 'triangle', 0.04 * v, -180); },   // a swat
    cpWhistle: ({ osc }) => (v, t) => { osc(t, 1250, 0.13, 'sine', 0.05 * v, 500); osc(t + 0.15, 1550, 0.18, 'sine', 0.05 * v, 700); },   // a two-note whistle, up
    cpSwoop: ({ osc, hiss }) => (v, t) => { osc(t, 330, 0.3, 'sawtooth', 0.03 * v, -150); osc(t, 345, 0.3, 'sawtooth', 0.025 * v, -160); hiss(t, 0.25, 0.03 * v, 'bandpass', 2500, 900); },   // the swarm diving in
    cpChomp: ({ osc }) => (v, t) => { osc(t, 700, 0.03, 'square', 0.04 * v, -300); osc(t + 0.035, 520, 0.03, 'square', 0.03 * v, -200); },   // a little bite
    cpWind: ({ osc }) => (v, t) => { osc(t, 170, 0.14, 'sawtooth', 0.02 * v, 90); osc(t + 0.01, 176, 0.14, 'sawtooth', 0.016 * v, 95); },   // a fly revving up on his paw
    cpSplat: ({ osc, hiss }) => (v, t) => { osc(t, 260, 0.06, 'sine', 0.07 * v, -120); hiss(t, 0.05, 0.04 * v, 'lowpass', 1200); },   // a fly landing on you: a tiny wet splat
    cpHum: ({ osc }) => (v, t) => { osc(t, 150, 0.35, 'triangle', 0.018 * v, 12); osc(t + 0.12, 158, 0.25, 'triangle', 0.014 * v, -10); },   // a sentry's low lazy hum
    cpZip: ({ osc, hiss }) => (v, t) => { osc(t, 240, 0.14, 'sawtooth', 0.03 * v, 260); hiss(t, 0.1, 0.025 * v, 'bandpass', 3000, 4500); },   // a sentry darting: a rising zzip
    cpShoo: ({ osc }) => (v, t) => { osc(t, 210, 0.3, 'sawtooth', 0.015 * v, -90); },   // a fly buzzing off, fading
    cpGather: ({ osc }) => (v, t) => { for (let k = 0; k < 4; k++) osc(t + k * 0.06, 180 + k * 22, 0.12, 'sawtooth', 0.016 * v, 30); },   // the swarm gathering: buzzes stacking up
    cpGlug: ({ osc }) => (v, t) => { osc(t, 120, 0.1, 'sine', 0.09 * v, 60); osc(t + 0.09, 95, 0.12, 'sine', 0.07 * v, 50); },   // sludge glugging out
    cpShiver: ({ osc }) => (v, t) => { for (let k = 0; k < 4; k++) osc(t + k * 0.03, 300 - k * 25, 0.025, 'triangle', 0.025 * v, -40); },   // a shiver
  },
};
