// Scenery from above, lit top left. Props: the small things a track scatters (deco: x, y, r, v); landmarks: one or two
// set pieces per theme, in the largest clearings.
import { TAU, mulberry } from '../core.js';
import { alpha, circ, ell, linear, mix, poly, radial, shade, smooth as smoothPath, star } from './paint.js';
import { pharaohLandmark, pharaohProp } from './pharaoh.js';
import { plateauLandmark, plateauProp } from './plateau.js';
import { sakuraLandmark, sakuraProp } from './sakura.js';
import { canyonMesa } from './canyon.js';
import { bayLandmark, bayProp } from './bay.js';
import { chipsLandmark } from './chips.js';
import { shoreOf } from './track.js';
import { alpineLandmark, alpineProp } from './alpine.js';
import { skiLandmark, skiProp } from './ski.js';
import { clockLandmark, clockProp } from './clock.js';
import { neonLandmark, neonProp } from './neon.js';
import { airportLandmark, airportProp } from './airport.js';
import { moonshotProp } from './moonshot.js';
import { shoreProp } from './shore.js';

const SHADOW = 'rgba(14,18,28,0.24)';
function shadowBlob(g, x, y, rx, ry, k = 1) { ell(g, x + rx * 0.4 * k, y + ry * 0.55 * k, rx, ry); g.fillStyle = SHADOW; g.fill(); }
// a leafy canopy: lobes around a core, dark underneath, light on the top-left, with a few leaf flecks
export function canopy(g, x, y, r, [dk, md, lt], rng, fleck) {
  const lobes = 7, pts = [];
  for (let k = 0; k < lobes; k++) { const a = k / lobes * TAU + rng() * 0.5, d = r * (0.48 + rng() * 0.12); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.46 + rng() * 0.12)]); }
  g.fillStyle = dk; for (const [px, py, pr] of pts) { circ(g, px, py, pr); g.fill(); } circ(g, x, y, r * 0.62); g.fill();
  g.fillStyle = md; for (const [px, py, pr] of pts) { circ(g, px - pr * 0.18, py - pr * 0.22, pr * 0.78); g.fill(); }
  g.fillStyle = lt; for (const [px, py, pr] of pts) if (px < x + r * 0.2 && py < y + r * 0.2) { circ(g, px - pr * 0.3, py - pr * 0.35, pr * 0.45); g.fill(); }
  if (fleck) { g.fillStyle = fleck; for (let k = 0; k < 9; k++) { const a = rng() * TAU, d = rng() * r * 0.85; circ(g, x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.07); g.fill(); } }
}
function rock(g, x, y, r, base, rng, snow) {
  const pts = []; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + rng() * 0.4, d = r * (0.7 + rng() * 0.3); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85]); }
  poly(g, pts); g.fillStyle = shade(base, -0.25); g.fill();
  poly(g, pts.map(([px, py]) => [x + (px - x) * 0.82 - r * 0.08, y + (py - y) * 0.78 - r * 0.1])); g.fillStyle = base; g.fill();
  poly(g, [[x - r * 0.1, y - r * 0.12], ...pts.slice(4, 7).map(([px, py]) => [x + (px - x) * 0.7 - r * 0.1, y + (py - y) * 0.66 - r * 0.12])]); g.fillStyle = shade(base, 0.2); g.fill();
  if (snow) { ell(g, x - r * 0.2, y - r * 0.25, r * 0.5, r * 0.32, -0.3); g.fillStyle = '#f7fbff'; g.fill(); }
}

// ---------------------------------------------------------------- props
// ---------------------------------------------------------------- atoll pieces
// a palm from above: downwind fronds (wa) longer and swept with the storm; coconuts in the middle
export function palm(g, x, y, r, rng, wa) {
  const n = 9, a0 = rng() * TAU;
  for (let pass = 0; pass < 2; pass++) for (let k = pass; k < n; k += 2) {
    const a = a0 + k / n * TAU + (rng() - 0.5) * 0.3, rel = Math.atan2(Math.sin(a - wa), Math.cos(a - wa));
    const ang = a - rel * 0.28, len = r * (1 + 0.28 * Math.cos(rel)) * (0.9 + rng() * 0.2), w = r * 0.24;
    const lit = Math.cos(ang + Math.PI * 0.75);   // 1 pointing to the top left
    frond(g, x, y, ang, len, w, pass ? (lit > 0.3 ? '#7cc25e' : '#4f9a45') : '#2f6b33', Math.sign(rel) * 0.25);
  }
  for (const [dx, dy] of [[-0.1, -0.08], [0.1, -0.02], [0, 0.1]]) { circ(g, x + dx * r, y + dy * r, r * 0.11); g.fillStyle = '#6b4a22'; g.fill(); circ(g, x + dx * r - r * 0.03, y + dy * r - r * 0.03, r * 0.04); g.fillStyle = '#a77a3e'; g.fill(); }
}
// one frond: a long leaf with a midrib and its leaflets marked across it; `curl` bends the tip round
function frond(g, x, y, a, len, w, col, curl) {
  g.save(); g.translate(x, y); g.rotate(a);
  const tipY = curl * len * 0.5;
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.45, -w + tipY * 0.3, len, tipY); g.quadraticCurveTo(len * 0.5, w + tipY * 0.3, 0, 0); g.fillStyle = col; g.fill();
  g.strokeStyle = 'rgba(20,50,20,0.45)'; g.lineWidth = Math.max(0.8, w * 0.12);
  for (let t = 0.2; t < 0.95; t += 0.16) { const cx = len * t, cy = tipY * t * t, h = w * Math.sin(Math.PI * t) * 0.9; g.beginPath(); g.moveTo(cx - w * 0.3, cy - h); g.lineTo(cx, cy); g.lineTo(cx - w * 0.3, cy + h); g.stroke(); }
  g.strokeStyle = 'rgba(230,240,190,0.5)'; g.lineWidth = Math.max(0.8, w * 0.1); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, tipY * 0.25, len * 0.95, tipY * 0.9); g.stroke();
  g.restore();
}
// a thatched hut from above: a hipped roof, its four faces lit from the top left, thatch lines along the eaves
function hut(g, x, y, s, rot) {
  g.save(); g.translate(x, y); g.rotate(rot);
  const rx = s * 0.35, faces = [[[[-s, -s], [s, -s], [rx, 0], [-rx, 0]], '#e7cb86'], [[[s, -s], [s, s], [rx, 0]], '#b08b4c'], [[[s, s], [-s, s], [-rx, 0], [rx, 0]], '#9c793e'], [[[-s, s], [-s, -s], [-rx, 0]], '#d6b46c']];
  for (const [pts, col] of faces) { poly(g, pts); g.fillStyle = col; g.fill(); }
  g.strokeStyle = 'rgba(90,60,25,0.35)'; g.lineWidth = 1;
  for (let k = 1; k < 4; k++) { const f = k / 4; g.beginPath(); g.moveTo(-s + (s - rx) * f * 0.3, -s + s * f); g.lineTo(s - (s - rx) * f * 0.3, -s + s * f); g.moveTo(-s + (s - rx) * f * 0.3, s - s * f); g.lineTo(s - (s - rx) * f * 0.3, s - s * f); g.stroke(); }
  g.strokeStyle = '#7a5a2c'; g.lineWidth = 2; g.beginPath(); g.moveTo(-s, -s); g.lineTo(-rx, 0); g.lineTo(-s, s); g.moveTo(s, -s); g.lineTo(rx, 0); g.lineTo(s, s); g.moveTo(-rx, 0); g.lineTo(rx, 0); g.stroke();
  g.restore();
}
// a little wooden boat with an outboard, from above (bow along +x after rotating)
function boat(g, x, y, l, rot, col) {
  g.save(); g.translate(x, y); g.rotate(rot);
  ell(g, l * 0.08, l * 0.12, l * 0.56, l * 0.2); g.fillStyle = 'rgba(0,20,30,0.25)'; g.fill();
  g.beginPath(); g.moveTo(l * 0.55, 0); g.quadraticCurveTo(l * 0.25, -l * 0.22, -l * 0.45, -l * 0.17); g.lineTo(-l * 0.45, l * 0.17); g.quadraticCurveTo(l * 0.25, l * 0.22, l * 0.55, 0); g.fillStyle = col; g.fill();
  g.beginPath(); g.moveTo(l * 0.45, 0); g.quadraticCurveTo(l * 0.2, -l * 0.15, -l * 0.38, -l * 0.11); g.lineTo(-l * 0.38, l * 0.11); g.quadraticCurveTo(l * 0.2, l * 0.15, l * 0.45, 0); g.fillStyle = '#b8895a'; g.fill();
  g.fillStyle = '#8a6440'; for (const bx of [-0.15, 0.12]) g.fillRect(l * bx, -l * 0.13, l * 0.05, l * 0.26);
  g.fillStyle = '#2b2d33'; g.fillRect(-l * 0.52, -l * 0.05, l * 0.1, l * 0.1);
  g.restore();
}

// ---------------------------------------------------------------- jungle pieces
// a banana plant from above: broad leaves fanning out from the stem, each with a pale midrib and a few tears
function banana(g, x, y, r, rng) {
  const n = 6, a0 = rng() * TAU;
  for (let k = 0; k < n; k++) {
    const a = a0 + k / n * TAU + (rng() - 0.5) * 0.4, len = r * (0.85 + rng() * 0.3), w = r * 0.3, lit = Math.cos(a + Math.PI * 0.75);
    g.save(); g.translate(x, y); g.rotate(a);
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(len * 0.3, -w * 1.2, len * 0.85, -w * 0.9, len, 0); g.bezierCurveTo(len * 0.85, w * 0.9, len * 0.3, w * 1.2, 0, 0);
    g.fillStyle = lit > 0.3 ? '#7cbf4f' : lit > -0.3 ? '#5a9e3c' : '#3f7a2e'; g.fill();
    g.strokeStyle = 'rgba(25,60,20,0.5)'; g.lineWidth = 1; for (const t of [0.35, 0.55, 0.75]) if (rng() < 0.6) { g.beginPath(); g.moveTo(len * t, 0); g.lineTo(len * (t + 0.08), (rng() < 0.5 ? -1 : 1) * w * 0.8); g.stroke(); }
    g.strokeStyle = 'rgba(235,245,200,0.6)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.95, 0); g.stroke();
    g.restore();
  }
  circ(g, x, y, r * 0.12); g.fillStyle = '#5b6b2e'; g.fill();
}
// a monstera clump: big round split leaves, darker underneath, lit on the top-left
function monstera(g, x, y, r, rng) {
  for (let k = 0; k < 5; k++) {
    const a = rng() * TAU, o = r * (0.25 + rng() * 0.35), lx = x + Math.cos(a) * o, ly = y + Math.sin(a) * o, lr = r * (0.38 + rng() * 0.14), rot = a;
    ell(g, lx + 2, ly + 3, lr, lr * 0.85, rot); g.fillStyle = 'rgba(10,30,12,0.35)'; g.fill();
    ell(g, lx, ly, lr, lr * 0.85, rot); g.fillStyle = k % 2 ? '#2f6e32' : '#3c8340'; g.fill();
    ell(g, lx - lr * 0.2, ly - lr * 0.2, lr * 0.55, lr * 0.45, rot); g.fillStyle = 'rgba(160,220,120,0.25)'; g.fill();
    g.strokeStyle = '#1f4a22'; g.lineWidth = 1.6;   // the splits in from the edge
    for (let j = 0; j < 4; j++) { const b = rot + (j - 1.5) * 0.7, ex = lx + Math.cos(b) * lr * 0.95, ey = ly + Math.sin(b) * lr * 0.8; g.beginPath(); g.moveTo(ex, ey); g.lineTo(lx + Math.cos(b) * lr * 0.45, ly + Math.sin(b) * lr * 0.38); g.stroke(); }
  }
}
// moss: soft green blotches over stone
function moss(g, x, y, r, rng, n = 4) { for (let k = 0; k < n; k++) { const a = rng() * TAU, o = rng() * r; ell(g, x + Math.cos(a) * o, y + Math.sin(a) * o, r * (0.18 + rng() * 0.2), r * (0.12 + rng() * 0.14), rng() * 3); g.fillStyle = rng() < 0.5 ? 'rgba(92,138,58,0.75)' : 'rgba(120,160,70,0.6)'; g.fill(); } }
// a broken column in the undergrowth (fluted drum, rough broken top) and a fallen drum or two
function column(g, x, y, r, rng) {
  const rot = rng() * TAU;
  for (let k = 0; k < 2; k++) {   // fallen drums: a short cylinder lying on its side
    const a = rot + k * 1.3, dx = x + Math.cos(a) * r * 1.1, dy = y + Math.sin(a) * r * 0.9, l = r * 0.55, w = r * 0.42;
    g.save(); g.translate(dx, dy); g.rotate(a + 1.2);
    g.fillStyle = 'rgba(14,18,28,0.25)'; g.beginPath(); g.roundRect(-l + 3, -w + 4, l * 2, w * 2, w * 0.3); g.fill();
    g.fillStyle = linear(g, 0, -w, 0, w, [[0, '#d9cfb2'], [0.45, '#bfb393'], [1, '#867c64']]); g.beginPath(); g.roundRect(-l, -w, l * 2, w * 2, w * 0.25); g.fill();
    g.strokeStyle = 'rgba(80,70,50,0.4)'; g.lineWidth = 1; for (let f = -0.6; f <= 0.6; f += 0.3) { g.beginPath(); g.moveTo(-l, f * w); g.lineTo(l, f * w); g.stroke(); }
    ell(g, l, 0, w * 0.3, w, 0); g.fillStyle = '#a99e82'; g.fill();
    g.restore(); moss(g, dx, dy, r * 0.35, rng, 2);
  }
  // the standing stump: lifted a little up the screen, its side showing below the broken top
  const R = r * 0.5, h = r * 0.45;
  ell(g, x + R * 0.6 + h * 0.3, y + R * 0.5 + h * 0.6, R * 1.1, R * 0.7); g.fillStyle = SHADOW; g.fill();
  g.fillStyle = linear(g, x - R, 0, x + R, 0, [[0, '#cfc4a6'], [0.5, '#b3a786'], [1, '#7e745d']]); g.fillRect(x - R, y - h, R * 2, h); ell(g, x, y, R, R * 0.4); g.fill();
  g.strokeStyle = 'rgba(70,60,40,0.35)'; g.lineWidth = 1.2; for (let f = -0.7; f <= 0.71; f += 0.35) { g.beginPath(); g.moveTo(x + f * R, y - h); g.lineTo(x + f * R, y + R * 0.4 * Math.sqrt(1 - f * f)); g.stroke(); }
  const top = []; for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; top.push([x + Math.cos(a) * R, y - h + Math.sin(a) * R * 0.4 - (rng() * 0.25) * R * (Math.sin(a) < 0 ? 1 : 0.3)]); }
  poly(g, top); g.fillStyle = '#e3d9bd'; g.fill();
  poly(g, top.map(([px, py]) => [x + (px - x) * 0.55 + R * 0.1, y - h + (py - y + h) * 0.55 + R * 0.05])); g.fillStyle = '#c8bc9c'; g.fill();
  moss(g, x - R * 0.3, y - h, R * 0.6, rng, 3);
}
// an old stone head lying face up in the leaves, cracked and mossy
function stoneHead(g, x, y, r, rng) {
  const rot = (rng() - 0.5) * 1.2, R = r * 0.7;
  g.save(); g.translate(x, y); g.rotate(rot);
  ell(g, R * 0.3, R * 0.35, R * 1.05, R * 0.95); g.fillStyle = SHADOW; g.fill();
  ell(g, 0, 0, R, R * 0.92); g.fillStyle = radial(g, -R * 0.35, -R * 0.4, R * 0.1, 0, 0, R, [[0, '#cfc6ac'], [0.6, '#a59b80'], [1, '#6f6754']]); g.fill();
  g.beginPath(); g.ellipse(0, 0, R, R * 0.92, 0, Math.PI * 1.05, Math.PI * 1.95); g.ellipse(0, -R * 0.35, R * 0.8, R * 0.3, 0, Math.PI * 1.95, Math.PI * 1.05, true); g.closePath(); g.fillStyle = '#8f866c'; g.fill();   // the helmet band
  g.fillStyle = '#5d5645';
  for (const sx of [-1, 1]) { ell(g, sx * R * 0.33, -R * 0.08, R * 0.17, R * 0.08); g.fill(); }   // shut eyes under heavy brows
  g.strokeStyle = '#5d5645'; g.lineWidth = R * 0.06; g.lineCap = 'round';
  for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * R * 0.52, -R * 0.2); g.quadraticCurveTo(sx * R * 0.33, -R * 0.3, sx * R * 0.14, -R * 0.2); g.stroke(); }
  ell(g, 0, R * 0.22, R * 0.2, R * 0.12); g.fillStyle = '#958b70'; g.fill(); circ(g, -R * 0.08, R * 0.26, R * 0.04); g.fillStyle = '#4d4739'; g.fill(); circ(g, R * 0.08, R * 0.26, R * 0.04); g.fill();   // nose
  ell(g, 0, R * 0.52, R * 0.3, R * 0.11); g.fillStyle = '#7d745d'; g.fill(); g.strokeStyle = '#4d4739'; g.lineWidth = R * 0.04; g.beginPath(); g.moveTo(-R * 0.27, R * 0.52); g.quadraticCurveTo(0, R * 0.58, R * 0.27, R * 0.52); g.stroke();   // lips
  g.strokeStyle = 'rgba(50,44,34,0.55)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(R * 0.5, -R * 0.7); g.lineTo(R * 0.35, -R * 0.35); g.lineTo(R * 0.5, -R * 0.1); g.stroke();   // a crack
  g.restore();
  moss(g, x + R * 0.4, y - R * 0.5, R * 0.5, rng, 3);
}
// a toppled stele: a long carved slab lying in the leaves, glyph panels down it, moss on the top end
function stele(g, x, y, r, rng) {
  const rot = rng() * TAU, l = r * 0.95, w = r * 0.42;
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = SHADOW; g.beginPath(); g.roundRect(-l + 4, -w + 5, l * 2, w * 2, 4); g.fill();
  g.fillStyle = linear(g, -l, -w, l, w, [[0, '#d2c7a9'], [1, '#8a8068']]); g.beginPath(); g.roundRect(-l, -w, l * 2, w * 2, 4); g.fill();
  g.strokeStyle = 'rgba(70,60,44,0.55)'; g.lineWidth = 1.2;
  for (let k = 0; k < 4; k++) {   // glyph blocks: a rounded square with a couple of marks in it
    const cx = -l + l * 0.25 + k * l * 0.5; g.beginPath(); g.roundRect(cx - l * 0.2, -w * 0.7, l * 0.4, w * 1.4, 4); g.stroke();
    g.beginPath(); g.arc(cx - l * 0.05, -w * 0.2, w * 0.16, 0, TAU); g.moveTo(cx - l * 0.12, w * 0.3); g.lineTo(cx + l * 0.12, w * 0.3); g.moveTo(cx + l * 0.08, -w * 0.4); g.lineTo(cx + l * 0.08, 0); g.stroke();
  }
  g.restore();
  moss(g, x + Math.cos(rot) * l * 0.7, y + Math.sin(rot) * l * 0.7, w, rng, 3);
}

// a little shore crab from above: an orange shell, two claws forward, four legs a side, eyes on stalks
export function littleCrab(g, x, y, s, rot, rng) {
  g.save(); g.translate(x, y); g.rotate(rot);
  ell(g, s * 0.25, s * 0.35, s * 1.1, s * 0.8); g.fillStyle = 'rgba(40,25,15,0.25)'; g.fill();
  g.strokeStyle = '#b8401c'; g.lineWidth = s * 0.16; g.lineCap = 'round';
  for (const side of [-1, 1]) for (let k = 0; k < 4; k++) { const a = side * (1.3 + k * 0.32), kx = Math.cos(a) * s * 0.7, ky = Math.sin(a) * s * 0.55; g.beginPath(); g.moveTo(kx * 0.5, ky * 0.5); g.lineTo(kx * 1.25, ky * 1.25); g.lineTo(kx * 1.25 - s * 0.35, ky * 1.25 + side * s * 0.2); g.stroke(); }
  for (const side of [-1, 1]) {   // claws
    g.beginPath(); g.moveTo(s * 0.4, side * s * 0.4); g.lineTo(s * 0.85, side * s * 0.6); g.stroke();
    ell(g, s * 1.05, side * s * 0.55, s * 0.32, s * 0.2, side * 0.3); g.fillStyle = '#e8562a'; g.fill();
  }
  ell(g, 0, 0, s * 0.7, s * 0.85); g.fillStyle = radial(g, -s * 0.25, -s * 0.3, s * 0.05, 0, 0, s * 0.9, [[0, '#ffab73'], [0.5, '#e8562a'], [1, '#a8361a']]); g.fill();
  for (const side of [-1, 1]) { circ(g, s * 0.62, side * s * 0.2, s * 0.13); g.fillStyle = '#ffffff'; g.fill(); circ(g, s * 0.66, side * s * 0.2, s * 0.07); g.fillStyle = '#111111'; g.fill(); }
  g.restore();
}

export function drawProp(g, d, kind, shadowPass, land) {
  const { x, y, r, v } = d, rng = mulberry(Math.floor(v * 1e6) + 7);
  const pick = (...w) => { let s = 0; for (let i = 0; i < w.length; i++) { s += w[i]; if (v < s) return i; } return w.length - 1; };
  switch (kind) {
    case 'pharaoh': return pharaohProp(g, d, shadowPass);   // the pharaoh's casino (art/pharaoh.js)
    case 'sakura': return sakuraProp(g, d, shadowPass);   // the Japanese garden (art/sakura.js)
    case 'water': return bayProp(g, d, shadowPass, land);   // Merge Bay: trees, palms and huts in the town, boats and buoys on the bay (art/bay.js)
    case 'plateau': return plateauProp(g, d, shadowPass);   // Pyth Plateau: agave, prickly pear, serpent heads, altars (art/plateau.js)
    case 'clock': return clockProp(g, d, shadowPass);   // Race Condition: chimney stacks, water tanks and skylights on the roofs far below (art/clock.js)
    case 'airport': return airportProp(g, d, shadowPass);   // Gateway 8080: shrubs, taxiway signs, light masts, luggage carts (art/airport.js)
    case 'moonshot': return moonshotProp(g, d, shadowPass);   // Moonshot: palms and sheds on the island, buoys at sea, rocks on the Moon, nothing in the sky (art/moonshot.js)
    case 'alpine': return alpineProp(g, d, shadowPass, land, rock);
    case 'ski': return skiProp(g, d, shadowPass);   // Gradient Descent: pines, rocks, snowmen (art/ski.js); Recursion Ridge: by height (art/alpine.js)
    case 'snow': {
      const t = pick(0.55, 0.2, 0.13, 0.12);
      if (t === 0) {   // snowy pine: stacked star tiers
        if (shadowPass) return shadowBlob(g, x, y, r * 1.0, r * 0.75);
        const rot = v * 7;
        for (const [k, col] of [[1, '#24533f'], [0.72, '#2e6a50'], [0.45, '#3d8162']]) { star(g, x - (1 - k) * r * 0.12, y - (1 - k) * r * 0.14, r * k, 8, 0.62, rot + k); g.fillStyle = col; g.fill(); }
        g.fillStyle = '#f4f9ff'; for (let k = 0; k < 8; k++) { const a = rot + k / 8 * TAU; if (Math.cos(a - 3.9) < 0.1) continue; ell(g, x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.18, r * 0.1, a); g.fill(); }
        circ(g, x - r * 0.1, y - r * 0.12, r * 0.14); g.fill();
      } else if (t === 1) { if (shadowPass) return shadowBlob(g, x, y, r * 0.75, r * 0.55); rock(g, x, y, r * 0.75, '#7d8792', rng, true); }
      else if (t === 2) {   // snowman from above: three balls, a hat, a scarf
        if (shadowPass) return shadowBlob(g, x, y, r * 0.6, r * 0.5);
        circ(g, x, y, r * 0.55); g.fillStyle = radial(g, x - r * 0.2, y - r * 0.2, 1, x, y, r * 0.55, [[0, '#ffffff'], [1, '#c9d8e8']]); g.fill();
        circ(g, x - r * 0.08, y - r * 0.08, r * 0.38); g.fillStyle = '#ffffff'; g.fill();
        g.strokeStyle = '#d8342c'; g.lineWidth = r * 0.1; g.beginPath(); g.arc(x - r * 0.1, y - r * 0.1, r * 0.3, 0, TAU); g.stroke();
        circ(g, x - r * 0.12, y - r * 0.12, r * 0.24); g.fillStyle = '#26282d'; g.fill(); circ(g, x - r * 0.12, y - r * 0.12, r * 0.15); g.fillStyle = '#3a3d44'; g.fill();
        poly(g, [[x + r * 0.08, y - r * 0.02], [x + r * 0.42, y + r * 0.1], [x + r * 0.12, y + r * 0.12]]); g.fillStyle = '#ff8a2a'; g.fill();
      } else {   // log pile
        if (shadowPass) return shadowBlob(g, x, y, r * 0.8, r * 0.5);
        for (let k = 0; k < 4; k++) { const ly = y - r * 0.4 + k * r * 0.26; g.fillStyle = linear(g, 0, ly - r * 0.12, 0, ly + r * 0.12, [[0, '#9a6a3e'], [1, '#5e3c20']]); g.beginPath(); g.roundRect(x - r * 0.75, ly - r * 0.12, r * 1.5, r * 0.24, r * 0.12); g.fill(); circ(g, x + r * 0.72, ly, r * 0.12); g.fillStyle = '#d9b27c'; g.fill(); }
        ell(g, x - r * 0.1, y - r * 0.5, r * 0.6, r * 0.12); g.fillStyle = '#ffffff'; g.fill();
      }
      return;
    }
    case 'lava': {
      const t = pick(0.3, 0.35, 0.18, 0.17);
      if (t === 0) {   // lava pool, glowing
        if (shadowPass) { circ(g, x, y, r * 1.5); g.fillStyle = radial(g, x, y, 1, x, y, r * 1.5, [[0, 'rgba(255,120,30,0.35)'], [1, 'rgba(255,90,20,0)']]); g.fill(); return; }
        const pts = []; for (let k = 0; k < 10; k++) { const a = k / 10 * TAU, dd = r * (0.75 + rng() * 0.3); pts.push([x + Math.cos(a) * dd, y + Math.sin(a) * dd * 0.8]); }
        poly(g, pts); g.fillStyle = '#20151a'; g.fill();
        poly(g, pts.map(([px, py]) => [x + (px - x) * 0.82, y + (py - y) * 0.82])); g.fillStyle = radial(g, x, y, 1, x, y, r, [[0, '#fff2a8'], [0.35, '#ffb12e'], [0.75, '#f0561c'], [1, '#a32a12']]); g.fill();
        g.strokeStyle = 'rgba(80,20,10,0.5)'; g.lineWidth = 1.5; for (let k = 0; k < 4; k++) { const a = rng() * TAU; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.25, r * 0.2, 0, 2); g.stroke(); }
      } else if (t === 1) { if (shadowPass) return shadowBlob(g, x, y, r * 0.85, r * 0.6); rock(g, x, y, r * 0.85, '#4d3b42', rng); }
      else if (t === 2) {   // steam vent
        if (shadowPass) return;
        circ(g, x, y, r * 0.3); g.fillStyle = '#1a1214'; g.fill(); circ(g, x, y, r * 0.18); g.fillStyle = '#ff7a1a'; g.fill();
        for (let k = 0; k < 5; k++) { const px = x + r * 0.2 * k, py = y - r * 0.3 * k; circ(g, px, py, r * (0.25 + k * 0.1)); g.fillStyle = `rgba(200,195,200,${0.28 - k * 0.04})`; g.fill(); }
      } else {   // burnt tree
        if (shadowPass) { g.strokeStyle = SHADOW; g.lineWidth = 3; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + v * 5; g.beginPath(); g.moveTo(x + 6, y + 8); g.lineTo(x + 6 + Math.cos(a) * r, y + 8 + Math.sin(a) * r); g.stroke(); } return; }
        g.strokeStyle = '#1a1214'; g.lineCap = 'round';
        for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + v * 5; g.lineWidth = 3.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9); g.stroke(); g.lineWidth = 1.6; g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5); g.lineTo(x + Math.cos(a + 0.5) * r * 0.8, y + Math.sin(a + 0.5) * r * 0.8); g.stroke(); }
        circ(g, x, y, r * 0.16); g.fillStyle = '#2a1d20'; g.fill();
      }
      return;
    }
    case 'chips': return;   // (Silicon Circuit's parts are laid out as circuits with the board: art/chips.js)
    case 'canyon': {
      const t = pick(0.3, 0.25, 0.2, 0.15, 0.1);
      if (t === 0) {   // a little mesa: stacked sandstone layers with a flat top
        if (shadowPass) return shadowBlob(g, x, y, r * 1.1, r * 0.8, 1.4);
        const pts = []; for (let k = 0; k < 9; k++) { const a = k / 9 * TAU, d = r * (0.8 + rng() * 0.25); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85]); }
        for (const [k, col] of [[1, '#7a3218'], [0.85, '#a2482a'], [0.68, '#c86a3c'], [0.5, '#e28c55']]) { g.beginPath(); pts.forEach(([px, py], i) => { const qx = x + (px - x) * k - r * (1 - k) * 0.3, qy = y + (py - y) * k - r * (1 - k) * 0.35; i ? g.lineTo(qx, qy) : g.moveTo(qx, qy); }); g.closePath(); g.fillStyle = col; g.fill(); }
      } else if (t === 1) { if (shadowPass) return shadowBlob(g, x, y, r * 0.8, r * 0.6); rock(g, x, y, r * 0.8, '#a9573a', rng); rock(g, x + r * 0.6, y + r * 0.35, r * 0.4, '#8f4a30', rng); }
      else if (t === 2) {   // saguaro
        if (shadowPass) return shadowBlob(g, x, y, r * 0.7, r * 0.5);
        for (const [ax, ay, ar] of [[0.6, -0.1, 0.3], [-0.55, 0.2, 0.26]]) { g.strokeStyle = '#3f7a42'; g.lineWidth = r * 0.26; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + ax * r, y + ay * r); g.stroke(); circ(g, x + ax * r, y + ay * r, ar * r); g.fillStyle = '#4c9150'; g.fill(); }
        circ(g, x, y, r * 0.42); g.fillStyle = radial(g, x - r * 0.15, y - r * 0.15, 1, x, y, r * 0.42, [[0, '#7cc07a'], [1, '#3c7a40']]); g.fill();
      } else if (t === 3) {   // a tumbleweed
        if (shadowPass) return shadowBlob(g, x, y, r * 0.5, r * 0.35);
        g.strokeStyle = '#9a7a4a'; g.lineWidth = 1;
        for (let k = 0; k < 14; k++) { g.beginPath(); g.ellipse(x, y, r * 0.45, r * (0.15 + rng() * 0.3), rng() * TAU, 0, TAU); g.stroke(); }
      } else {   // a bleached cow skull
        if (shadowPass) return;
        ell(g, x, y, r * 0.22, r * 0.3); g.fillStyle = '#f2ead8'; g.fill();
        g.strokeStyle = '#f2ead8'; g.lineWidth = r * 0.09; g.lineCap = 'round'; for (const s2 of [-1, 1]) { g.beginPath(); g.moveTo(x + s2 * r * 0.15, y - r * 0.2); g.quadraticCurveTo(x + s2 * r * 0.5, y - r * 0.3, x + s2 * r * 0.55, y - r * 0.6); g.stroke(); }
        for (const s2 of [-1, 1]) { circ(g, x + s2 * r * 0.09, y - r * 0.05, r * 0.06); g.fillStyle = '#4a3a2a'; g.fill(); }
      }
      return;
    }
    case 'ice': {
      const t = pick(0.35, 0.3, 0.2, 0.15);
      if (t === 0) {   // an ice crystal cluster: blue-white shards catching the light
        if (shadowPass) return shadowBlob(g, x, y, r * 0.8, r * 0.6);
        for (let k = 0; k < 6; k++) {
          const a = k / 6 * TAU + v * 7, l = r * (0.5 + rng() * 0.5), w = r * 0.18;
          g.save(); g.translate(x, y); g.rotate(a);
          g.beginPath(); g.moveTo(0, -w); g.lineTo(l, 0); g.lineTo(0, w); g.closePath(); g.fillStyle = linear(g, 0, -w, 0, w, [[0, '#ffffff'], [0.5, '#a9d8f5'], [1, '#5fa3d6']]); g.fill();
          g.restore();
        }
        circ(g, x, y, r * 0.2); g.fillStyle = '#e8f6ff'; g.fill();
      } else if (t === 1) {   // snowy pine
        if (shadowPass) return shadowBlob(g, x, y, r, r * 0.75);
        const rot = v * 7;
        for (const [k, col] of [[1, '#24533f'], [0.72, '#2e6a50'], [0.45, '#3d8162']]) { star(g, x - (1 - k) * r * 0.12, y - (1 - k) * r * 0.14, r * k, 8, 0.62, rot + k); g.fillStyle = col; g.fill(); }
        g.fillStyle = '#f4f9ff'; for (let k = 0; k < 8; k++) { const a = rot + k / 8 * TAU; ell(g, x + Math.cos(a) * r * 0.65, y + Math.sin(a) * r * 0.65, r * 0.2, r * 0.11, a); g.fill(); } circ(g, x - r * 0.1, y - r * 0.12, r * 0.16); g.fill();
      } else if (t === 2) { if (shadowPass) return shadowBlob(g, x, y, r * 0.75, r * 0.55); rock(g, x, y, r * 0.75, '#6f8193', rng, true); }
      else {   // a snow drift with a buried barrel
        if (shadowPass) return shadowBlob(g, x, y, r * 0.9, r * 0.45);
        ell(g, x, y, r * 0.95, r * 0.5, v); g.fillStyle = radial(g, x - r * 0.3, y - r * 0.2, 1, x, y, r, [[0, '#ffffff'], [1, '#c9dcec']]); g.fill();
        circ(g, x + r * 0.3, y - r * 0.05, r * 0.2); g.fillStyle = '#c8372d'; g.fill(); circ(g, x + r * 0.3, y - r * 0.05, r * 0.12); g.fillStyle = '#8a2018'; g.fill();
      }
      return;
    }
    case 'space': {
      const t = pick(0.5, 0.2, 0.15, 0.15);
      if (t === 0) {   // an asteroid: a lumpy rock with craters, lit from the top left
        if (shadowPass) return;
        const pts = []; for (let k = 0; k < 10; k++) { const a = k / 10 * TAU, d = r * (0.72 + rng() * 0.3); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.9]); }
        poly(g, pts); g.fillStyle = radial(g, x - r * 0.35, y - r * 0.35, 1, x, y, r, [[0, '#a69f9a'], [0.6, '#6e6864'], [1, '#3b3735']]); g.fill();
        for (let k = 0; k < 3; k++) { const cx = x + (rng() - 0.5) * r, cy = y + (rng() - 0.5) * r * 0.8, cr = r * (0.12 + rng() * 0.12); circ(g, cx, cy, cr); g.fillStyle = 'rgba(30,26,24,0.45)'; g.fill(); circ(g, cx - cr * 0.25, cy - cr * 0.25, cr * 0.7); g.fillStyle = 'rgba(160,150,145,0.35)'; g.fill(); }
      } else if (t === 1) {   // a satellite: a body and two solar panels
        if (shadowPass) return;
        g.save(); g.translate(x, y); g.rotate(v * 20);
        for (const s2 of [-1, 1]) { g.fillStyle = '#1d3a7a'; g.fillRect(s2 * r * 0.35, -r * 0.28, s2 * r * 0.8, r * 0.56); g.strokeStyle = '#7fa6ff'; g.lineWidth = 0.8; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(s2 * (r * 0.35 + r * 0.2 * k), -r * 0.28); g.lineTo(s2 * (r * 0.35 + r * 0.2 * k), r * 0.28); g.stroke(); } }
        g.fillStyle = linear(g, -r * 0.3, 0, r * 0.3, 0, [[0, '#9aa1ab'], [0.5, '#e8ebef'], [1, '#8a919b']]); g.fillRect(-r * 0.3, -r * 0.3, r * 0.6, r * 0.6);
        circ(g, 0, 0, r * 0.14); g.fillStyle = '#f2c94c'; g.fill(); g.restore();
      } else if (t === 2) {   // a little ringed planet
        if (shadowPass) return;
        const c1 = ['#d98b4c', '#6aa7d9', '#b07ad9'][Math.floor(v * 31) % 3];
        g.save(); g.translate(x, y); g.rotate(-0.4);
        g.strokeStyle = 'rgba(230,220,200,0.6)'; g.lineWidth = r * 0.1; g.beginPath(); g.ellipse(0, 0, r * 1.05, r * 0.32, 0, Math.PI, TAU); g.stroke();
        circ(g, 0, 0, r * 0.55); g.fillStyle = radial(g, -r * 0.2, -r * 0.2, 1, 0, 0, r * 0.55, [[0, shade(c1, 0.3)], [1, shade(c1, -0.4)]]); g.fill();
        g.beginPath(); g.ellipse(0, 0, r * 1.05, r * 0.32, 0, 0, Math.PI); g.stroke(); g.restore();
      } else {   // a beacon: a blinking light on a post
        if (shadowPass) { circ(g, x, y, r); g.fillStyle = radial(g, x, y, 1, x, y, r, [[0, 'rgba(255,90,60,0.35)'], [1, 'rgba(255,90,60,0)']]); g.fill(); return; }
        circ(g, x, y, r * 0.3); g.fillStyle = '#3a3f58'; g.fill(); circ(g, x, y, r * 0.16); g.fillStyle = '#ff5a3c'; g.fill();
      }
      return;
    }
    case 'factory': {
      const t = pick(0.32, 0.3, 0.2, 0.18);
      if (t === 0) {   // a wooden crate (or a stack of two)
        const s2 = r * 0.75;
        if (shadowPass) { g.fillStyle = SHADOW; g.fillRect(x - s2 + 6, y - s2 + 8, s2 * 2, s2 * 2); return; }
        g.save(); g.translate(x, y); g.rotate((v - 0.5) * 0.4);
        g.fillStyle = linear(g, -s2, -s2, s2, s2, [[0, '#d2a565'], [1, '#9b6c34']]); g.fillRect(-s2, -s2, s2 * 2, s2 * 2);
        g.strokeStyle = '#6b4520'; g.lineWidth = 2; g.strokeRect(-s2 + 2, -s2 + 2, s2 * 2 - 4, s2 * 2 - 4);
        g.beginPath(); g.moveTo(-s2 + 2, -s2 + 2); g.lineTo(s2 - 2, s2 - 2); g.moveTo(s2 - 2, -s2 + 2); g.lineTo(-s2 + 2, s2 - 2); g.stroke();
        g.restore();
      } else if (t === 1) {   // oil drums from above
        if (shadowPass) return shadowBlob(g, x, y, r * 0.8, r * 0.6);
        const cols = ['#c8372d', '#2b6cb0', '#3a8a4a', '#d9a21a'];
        for (const [dx, dy] of [[-0.3, -0.25], [0.32, -0.15], [0, 0.32]]) {
          const px = x + dx * r, py = y + dy * r, pr = r * 0.34, c1 = cols[Math.floor((v * 13 + dx * 7 + 9) % 4)];
          circ(g, px, py, pr); g.fillStyle = radial(g, px - pr * 0.3, py - pr * 0.3, 1, px, py, pr, [[0, shade(c1, 0.25)], [1, shade(c1, -0.35)]]); g.fill();
          g.strokeStyle = shade(c1, -0.5); g.lineWidth = 1.2; circ(g, px, py, pr * 0.78); g.stroke(); circ(g, px + pr * 0.35, py - pr * 0.2, pr * 0.14); g.fillStyle = '#2a2c32'; g.fill();
        }
      } else if (t === 2) {   // a pallet of boxes, shrink-wrapped
        const w = r * 1.5, h = r * 1.1;
        if (shadowPass) { g.fillStyle = SHADOW; g.fillRect(x - w / 2 + 6, y - h / 2 + 8, w, h); return; }
        g.fillStyle = '#b08a55'; g.fillRect(x - w / 2, y - h / 2, w, h);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#c9a46a' : '#bf9a60'; g.fillRect(x - w / 2 + 2 + i * (w - 4) / 3, y - h / 2 + 2 + j * (h - 4) / 2, (w - 4) / 3 - 1, (h - 4) / 2 - 1); }
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x - w / 2, y - h / 2, w, h * 0.3);
      } else {   // a big gear lying on the floor
        if (shadowPass) return shadowBlob(g, x, y, r * 0.8, r * 0.7);
        g.save(); g.translate(x, y); g.rotate(v * 9);
        star(g, 0, 0, r * 0.8, 10, 0.78, 0); g.fillStyle = linear(g, -r, -r, r, r, [[0, '#b9bfc8'], [1, '#6d747e']]); g.fill();
        circ(g, 0, 0, r * 0.45); g.fillStyle = '#868d97'; g.fill(); circ(g, 0, 0, r * 0.18); g.fillStyle = '#3a3d45'; g.fill();
        g.restore();
      }
      return;
    }
    case 'atoll': {   // on an island: palms, a thatched hut, a canoe pulled up; out on the water: boats, rocks in the surf, coral, buoys
      const wa = land && land.wind !== undefined ? land.wind : -1.8;
      if (land && land(x, y, -r * 0.5)) {
        const t = pick(0.6, 0.2, 0.1, 0.1);
        const P = land.palms, tree = (px, py, pr) => P ? P.push({ x: px, y: py, r: pr, k: P.length }) : palm(g, px, py, pr, rng, wa);   // (in a hurricane they bend with the wind: drawn live, art/hurricane.js)
        if (t === 0) { if (shadowPass) return shadowBlob(g, x + r * 0.3, y + r * 0.3, r * 1.0, r * 0.8); tree(x, y, r * 1.15); }
        else if (t === 1) {   // two palms leaning together
          if (shadowPass) return shadowBlob(g, x + r * 0.3, y + r * 0.3, r * 1.3, r * 0.9);
          tree(x - r * 0.45, y + r * 0.2, r * 0.85); tree(x + r * 0.5, y - r * 0.25, r * 0.95);
        } else if (t === 2) {   // a thatched hut
          if (shadowPass) { g.fillStyle = SHADOW; g.save(); g.translate(x + 8, y + 10); g.rotate((v - 0.5) * 0.5); g.fillRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6); g.restore(); return; }
          hut(g, x, y, r * 0.8, (v - 0.5) * 0.5);
        } else {   // an outrigger canoe pulled up on the sand
          if (shadowPass) return shadowBlob(g, x, y, r * 1.1, r * 0.4);
          g.save(); g.translate(x, y); g.rotate(v * 9);
          g.strokeStyle = '#7a5a36'; g.lineWidth = 2.5; for (const bx of [-0.35, 0.3]) { g.beginPath(); g.moveTo(r * bx, 0); g.lineTo(r * bx, r * 0.75); g.stroke(); }
          ell(g, 0, r * 0.75, r * 0.7, r * 0.09); g.fillStyle = '#9c7444'; g.fill();
          g.beginPath(); g.moveTo(r * 1.05, 0); g.quadraticCurveTo(0, -r * 0.24, -r * 1.05, 0); g.quadraticCurveTo(0, r * 0.24, r * 1.05, 0); g.fillStyle = '#b5532f'; g.fill();
          ell(g, 0, 0, r * 0.8, r * 0.1); g.fillStyle = '#5a3a20'; g.fill();
          g.restore();
        }
        return;
      }
      if ((v * 113) % 1 < 0.4) return;   // open water mostly
      const shallow = land && land(x, y, 110), t = pick(0.3, 0.3, 0.2, 0.2);
      if (t === 0) {   // a fishing boat riding at anchor, foam slapping round it
        if (shadowPass) { circ(g, x, y, r * 1.1); g.fillStyle = 'rgba(255,255,255,0.22)'; g.fill(); return; }
        boat(g, x, y, r * 1.6, wa + Math.PI + (v - 0.5) * 0.6, ['#f2efe6', '#2f6fa8', '#d8452f', '#f2c94c'][Math.floor(v * 37) % 4]);
      } else if (t === 1 || (t === 2 && !shallow)) {   // rocks, the surf breaking on their windward side
        if (shadowPass) { const sr = mulberry(Math.floor(v * 1e6) + 9), pts = []; for (let k = 0; k < 10; k++) { const a = k / 10 * TAU, dd = r * (0.75 + sr() * 0.35) * (1 + 0.35 * Math.max(0, -Math.cos(a - wa))); pts.push([x + Math.cos(a) * dd, y + Math.sin(a) * dd]); } smoothPath(g, pts); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fill(); return; }
        rock(g, x, y, r * 0.62, '#6f6a66', rng); rock(g, x + r * 0.5, y + r * 0.28, r * 0.34, '#5f5a56', rng);
      } else if (t === 2) {   // coral heads in the shallows
        if (shadowPass) { const sr = mulberry(Math.floor(v * 1e6) + 9), pts = []; for (let k = 0; k < 9; k++) { const a = k / 9 * TAU, dd = r * (0.9 + sr() * 0.4); pts.push([x + Math.cos(a) * dd, y + Math.sin(a) * dd]); } smoothPath(g, pts); g.fillStyle = 'rgba(150,230,215,0.35)'; g.fill(); return; }
        for (let k = 0; k < 6; k++) { const a = rng() * TAU, o = rng() * r * 0.7, cr = r * (0.18 + rng() * 0.2), col = ['#f28c8c', '#f7b267', '#c38fd9', '#f4d35e'][Math.floor(rng() * 4)]; circ(g, x + Math.cos(a) * o, y + Math.sin(a) * o, cr); g.fillStyle = alpha(col, 0.75); g.fill(); circ(g, x + Math.cos(a) * o - cr * 0.25, y + Math.sin(a) * o - cr * 0.25, cr * 0.45); g.fillStyle = alpha('#ffffff', 0.3); g.fill(); }
      } else {   // a buoy, its chain streaming with the current
        if (shadowPass) return;
        circ(g, x, y, r * 0.6); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fill();
        circ(g, x, y, r * 0.36); g.fillStyle = radial(g, x - r * 0.12, y - r * 0.12, 1, x, y, r * 0.38, [[0, '#ffd166'], [1, '#c98a0b']]); g.fill();
        g.strokeStyle = '#3a2a10'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(wa) * r * 0.5, y + Math.sin(wa) * r * 0.5); g.stroke();
      }
      return;
    }
    case 'jungle': {   // rainforest giants, banana plants and monstera, and the ruins
      const t = pick(0.4, 0.17, 0.12, 0.1, 0.11, 0.1);
      if (t === 0) {
        if (shadowPass) return shadowBlob(g, x + r * 0.15, y + r * 0.15, r * 1.35, r * 1.15, 1.3);
        const bloom = (v * 97) % 1 < 0.22;
        canopy(g, x, y, r * 1.3, (v * 31) % 1 < 0.5 ? ['#1d4620', '#2d6a2e', '#4f9440'] : ['#22501f', '#3a7a2c', '#6aa84a'], rng, bloom ? ((v * 13) % 1 < 0.5 ? '#ff7a2e' : '#f5d13c') : null);
        if (!bloom) { g.fillStyle = 'rgba(160,215,110,0.35)'; for (let k = 0; k < 5; k++) { const a = rng() * TAU, o = rng() * r * 0.8; circ(g, x + Math.cos(a) * o - r * 0.2, y + Math.sin(a) * o - r * 0.2, r * 0.12); g.fill(); } }
      } else if (t === 1) { if (shadowPass) return shadowBlob(g, x, y, r * 0.95, r * 0.75); banana(g, x, y, r * 1.1, rng); }
      else if (t === 2) { if (shadowPass) return; column(g, x, y, r * 0.9, rng); }
      else if (t === 3) { if (shadowPass) return; stoneHead(g, x, y, r, rng); }
      else if (t === 4) { if (shadowPass) return shadowBlob(g, x, y, r * 0.8, r * 0.6); monstera(g, x, y, r, rng); }
      else { if (shadowPass) return; stele(g, x, y, r, rng); }
      return;
    }
    case 'neon': return neonProp(g, d, shadowPass);   // Neon Overflow: vending machines, cyber-palms, noodle stands (art/neon.js)
    case 'crab': return shoreProp(g, d, shadowPass, land, littleCrab);   // the crab's coast: on the sand or out on the water (art/shore.js)
    default: {   // trees, autumn, clouds and anything new: a mix of trees, bushes and rocks
      const autumn = kind === 'autumn', t = pick(0.55, 0.3, 0.15);
      if (t === 0) { if (shadowPass) return shadowBlob(g, x, y, r * 1.05, r * 0.9); canopy(g, x, y, r, autumn ? [['#b4472b', '#e0773a', '#ffb86b'], ['#9e7d22', '#d6ab3a', '#f6d77a']][Math.floor(v * 31) % 2] : ['#2f6b31', '#47913f', '#6db75a'], rng); }
      else if (t === 1) { if (shadowPass) return shadowBlob(g, x, y, r * 0.7, r * 0.55); canopy(g, x, y, r * 0.62, ['#3b7a38', '#57a04b', '#80c26a'], rng, v > 0.7 ? '#ffe36b' : '#ffffff'); }
      else { if (shadowPass) return shadowBlob(g, x, y, r * 0.7, r * 0.5); rock(g, x, y, r * 0.7, '#9a9590', rng); }
    }
  }
}

// ---------------------------------------------------------------- landmarks
// the biggest open spaces, clear of the road (and its run-off), props and ponds
const clearings = new WeakMap();
// the landmark spots on a track, once drawTrack has placed them (the animated geysers erupt from them)
export const clearingsOf = T => clearings.get(T);
export function findClearings(T, dist, kind) {
  if (clearings.has(T)) return clearings.get(T);
  const B = T.bbox, out = [], rng = mulberry(T.N * 3 + 1), want = kind === 'plateau' || kind === 'pharaoh' ? 3 : 2, step = 60;
  // how much room each grid point has (road, edges, props, ponds), worked out once
  const cand = [], wet = T.def.shore ? shoreOf(T).wet : null;   // (on a coast: on dry land)
  for (let gy = B.y + 60; gy < B.y + B.h - 60; gy += step) for (let gx = B.x + 60; gx < B.x + B.w - 60; gx += step) {
    let d = Math.min(gx - B.x - 20, B.x + B.w - gx - 20, gy - B.y - 20, B.y + B.h - gy - 20);
    if (d < 95 || (wet && [[0, 0], [150, 0], [-150, 0], [0, 150], [0, -150]].some(([dx, dy]) => wet(gx + dx, gy + dy)))) continue;
    if (kind !== 'plateau') for (const p of T.deco || []) d = Math.min(d, Math.hypot(p.x - gx, p.y - gy) - p.r - 16);   // (the plateau's plazas clear the props off instead: drawTrack)
    for (const p of T.ponds || []) d = Math.min(d, Math.hypot(p.x - gx, p.y - gy) - p.r * 1.3 - 20);
    for (const r of T.mech ? T.mech.rivers : []) {   // (a lava river and its lake, race-river.js)
      for (let i = 0; i < r.path.length; i += 6) d = Math.min(d, Math.hypot(r.path[i][0] - gx, r.path[i][1] - gy) - r.w - 30);
      if (r.lake) d = Math.min(d, Math.hypot(r.lake.x - gx, r.lake.y - gy) - r.lake.r * 1.5 - 20);
    }
    for (const z of T.mech ? T.mech.drawbridges : []) {   // (a koi canal and its pools, race-drawbridge.js)
      for (const p of z.pools) d = Math.min(d, Math.hypot(p.x - gx, p.y - gy) - p.r * 1.25 - 30);
      z.canal.forEach((a, i) => { const b = z.canal[i + 1]; if (!b) return; const dx = b[0] - a[0], dy = b[1] - a[1], f = Math.max(0, Math.min(1, ((gx - a[0]) * dx + (gy - a[1]) * dy) / (dx * dx + dy * dy))); d = Math.min(d, Math.hypot(a[0] + dx * f - gx, a[1] + dy * f - gy) - z.W / 2 - 30); });
    }
    if (T.rail) { const R = T.rail, u = (gx - R.ax) * R.ux + (gy - R.ay) * R.uy; if (u > -R.ext - 70 && u < R.len + R.ext + 70) d = Math.min(d, Math.abs((gx - R.ax) * R.uy - (gy - R.ay) * R.ux) - 70); }   // (off the railway)
    for (const [ox, oy, orr] of T.keepOut || []) d = Math.min(d, Math.hypot(ox - gx, oy - gy) - orr);   // (off a theme's own set pieces: art/alpine.js)
    if (T.def.flank) for (const v of T.mech.volcano) d = Math.min(d, Math.hypot(v.x + v.R * 0.12 - gx, v.y - v.H * 0.3 - gy) - v.R * 1.3 - 30);   // (and a big cone and its shadow)
    if (d < 95) continue;
    d = Math.min(d, dist(gx, gy, Math.min(d + 80, 420)) - 70);
    if (d >= 95) cand.push({ x: gx, y: gy, d });
  }
  for (let n = 0; n < want; n++) {
    let best = null;
    for (const c of cand) { let d = c.d; for (const o of out) d = Math.min(d, Math.hypot(o.x - c.x, o.y - c.y) - o.r - 40); if (!best || d > best.d) best = { x: c.x, y: c.y, d }; }
    if (!best || best.d < 95) break;
    out.push({ x: best.x, y: best.y, r: Math.min(best.d, 300), v: rng() });
  }
  clearings.set(T, out); return out;
}
export function drawLandmark(g, c, kind, T, i = 0) {
  const { x, y, r, v } = c, rng = mulberry(Math.floor(v * 1e6));
  switch (kind) {
    case 'pharaoh': return pharaohLandmark(g, c, i);   // the pyramid casino, the sphinx, an oasis (art/pharaoh.js)
    case 'plateau': return plateauLandmark(g, c, i, T);   // the Pyramid of the Sun, the serpent temple, the ball court (art/plateau.js)
    case 'water': return bayLandmark(g, c, i);   // Merge Bay: the container yard and the lido (art/bay.js)
    case 'clock': return clockLandmark(g, c, i);   // Race Condition: a domed hall and a gasometer down in the city (art/clock.js)
    case 'airport': return airportLandmark(g, c, i);
    case 'moonshot': return;   // Gateway 8080: a car park, the fuel farm (art/airport.js); Moonshot's are placed by hand
    case 'alpine': return alpineLandmark(g, c, i);
    case 'ski': return skiLandmark(g, c, i);   // Gradient Descent: a mountain hut, an igloo (art/ski.js); Recursion Ridge: a hut, a farmhouse (art/alpine.js)
    case 'lava': {   // a volcano crater: rings of rock, a glowing lake, smoke
      const R = r * 0.9;
      circ(g, x + R * 0.12, y + R * 0.16, R); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill();
      circ(g, x, y, R); g.fillStyle = radial(g, x - R * 0.3, y - R * 0.3, 1, x, y, R, [[0, '#6a545b'], [1, '#2c2024']]); g.fill();
      g.strokeStyle = 'rgba(20,12,14,0.45)'; g.lineWidth = 2; for (let k = 0; k < 18; k++) { const a = k / 18 * TAU; g.beginPath(); g.moveTo(x + Math.cos(a) * R * 0.55, y + Math.sin(a) * R * 0.55); g.lineTo(x + Math.cos(a + 0.1) * R * 0.98, y + Math.sin(a + 0.1) * R * 0.98); g.stroke(); }
      circ(g, x, y, R * 0.52); g.fillStyle = '#1d1315'; g.fill();
      circ(g, x, y, R * 0.42); g.fillStyle = radial(g, x, y, 1, x, y, R * 0.42, [[0, '#fff3b0'], [0.3, '#ffb12e'], [0.7, '#f0561c'], [1, '#8a2010']]); g.fill();
      g.strokeStyle = 'rgba(90,20,8,0.55)'; g.lineWidth = 2.5; for (let k = 0; k < 6; k++) { const a = rng() * TAU; g.beginPath(); g.arc(x + Math.cos(a) * R * 0.2, y + Math.sin(a) * R * 0.2, R * 0.12, 0, 2.4); g.stroke(); }
      for (let k = 0; k < 7; k++) { const px = x + R * 0.16 * k + Math.sin(k * 1.7) * R * 0.08, py = y - R * 0.2 * k, pr = R * (0.18 + k * 0.06); g.fillStyle = radial(g, px, py, 0, px, py, pr, [[0, `rgba(205,198,205,${0.32 - k * 0.035})`], [1, 'rgba(205,198,205,0)']]); g.fillRect(px - pr, py - pr, pr * 2, pr * 2); }
      return;
    }
    case 'chips': return chipsLandmark(g, c, i);   // the CPU in its socket and the RAM bank (art/chips.js)
    case 'sakura': return sakuraLandmark(g, c, i);   // the pagoda and the raked-gravel garden (art/sakura.js)
    case 'snow': {   // a frozen pond with skate marks, and a log cabin with a smoking chimney
      const R = r * 0.75;
      ell(g, x, y, R * 1.15, R * 0.85); g.fillStyle = '#f7fbfe'; g.fill();
      ell(g, x, y, R, R * 0.72); g.fillStyle = radial(g, x - R * 0.3, y - R * 0.3, 2, x, y, R, [[0, '#d9f0fb'], [1, '#9fcbe2']]); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.2; for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(x + (rng() - 0.5) * R * 0.6, y + (rng() - 0.5) * R * 0.4, R * (0.2 + rng() * 0.3), R * (0.12 + rng() * 0.15), rng() * 3, 0, TAU); g.stroke(); }
      g.strokeStyle = 'rgba(80,120,150,0.35)'; g.lineWidth = 1; for (let k = 0; k < 4; k++) { let px = x + (rng() - 0.5) * R, py = y + (rng() - 0.5) * R * 0.6; g.beginPath(); g.moveTo(px, py); for (let j = 0; j < 4; j++) { px += (rng() - 0.5) * 30; py += (rng() - 0.5) * 30; g.lineTo(px, py); } g.stroke(); }
      const cx = x + R * 0.95, cy = y - R * 0.55, w = 46, h = 34;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(cx - w / 2 + 8, cy - h / 2 + 10, w, h);
      g.fillStyle = '#8a5a34'; g.fillRect(cx - w / 2, cy - h / 2, w, h);
      g.fillStyle = '#f7fbfe'; poly(g, [[cx - w / 2 - 3, cy - h / 2 - 3], [cx + w / 2 + 3, cy - h / 2 - 3], [cx + w / 2 + 3, cy], [cx - w / 2 - 3, cy]]); g.fill();
      g.fillStyle = '#dfe9f3'; g.fillRect(cx - w / 2 - 3, cy, w + 6, h / 2 + 3);
      g.fillStyle = '#6b4a35'; g.fillRect(cx + w * 0.22, cy - h * 0.4, 7, 7);
      for (let k = 0; k < 4; k++) { circ(g, cx + w * 0.26 + k * 5, cy - h * 0.45 - k * 8, 4 + k * 2); g.fillStyle = `rgba(150,150,160,${0.3 - k * 0.06})`; g.fill(); }
      return;
    }
    case 'canyon': if (i === 0) return canyonMesa(g, c); {   // the big mesa (art/canyon.js) in the biggest clearing, else a sandstone arch with daylight under its span
      const R = r * 0.7, rot = (v - 0.5) * 0.9, co = Math.cos(rot), si = Math.sin(rot);
      const P = (lx, ly) => [x + lx * co - ly * si, y + lx * si + ly * co];   // the arch's own frame (legs along lx) to the screen
      const L = R * 0.7, TOP = [-R * 0.12, -R * 0.16], SH = [R * 0.42, R * 0.56];   // leg spacing; how far up-left the top sits (its height); where the top's shadow lands
      const at = (pts, f, cx = 0, cy = 0, k = 1) => pts.map(([px, py]) => [cx + (px - cx) * k + TOP[0] * f, cy + (py - cy) * k + TOP[1] * f]);
      const legs = [-1, 1].map(s => {
        const h = wobble(rng), rx = R * (0.24 + rng() * 0.05), ry = R * (0.32 + rng() * 0.07), pts = [];
        for (let i = 0; i < 13; i++) { const a = i / 13 * TAU, w = wob(h, a); pts.push(P(s * L + Math.cos(a) * rx * w, Math.sin(a) * ry * w)); }
        const [cx, cy] = P(s * L, 0); return { s, pts, cx, cy, rx, ry };
      });
      // the span: narrowest mid-way, bowed a little, with a ragged edge
      const up = [], dn = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10, lx = (t * 2 - 1) * L * 0.82, yc = -R * 0.05 * Math.sin(t * Math.PI), w = R * (0.1 + 0.1 * (t * 2 - 1) ** 2);
        up.push(P(lx, yc - w * (0.9 + rng() * 0.2))); dn.push(P(lx, yc + w * (0.9 + rng() * 0.2)));
      }
      const span = [...up, ...dn.reverse()], [scx, scy] = P(0, -R * 0.03);
      // the shadow, one union per pass (every sub-path wound the same way); the span only from its underside up, so the light
      // under it leaves a hole
      for (const [pass, a] of [[2, 0.08], [1, 0.1], [0, 0.14]]) {
        g.beginPath();
        for (const l of legs) for (let f = 0; f <= 1.001; f += 0.125) subBlob(g, l.pts.map(([px, py]) => [l.cx + (px - l.cx) * (1 + pass * 0.05) + SH[0] * f, l.cy + (py - l.cy) * (1 + pass * 0.05) + SH[1] * f]));
        for (let f = 0.66; f <= 1.001; f += 0.085) subBlob(g, span.map(([px, py]) => [scx + (px - scx) * (1 + pass * 0.04) + SH[0] * f, scy + (py - scy) * (1 + pass * 0.12) + SH[1] * f]));
        g.fillStyle = `rgba(70,22,8,${a})`; g.fill();
      }
      // rubble and scrub at the feet (the legs overlap the nearest)
      for (const l of legs) for (let k = 0; k < 4; k++) {
        const a = rng() * TAU, d = 1.15 + rng() * 0.3, [bx, by] = P(l.s * L + Math.cos(a) * l.rx * d, Math.sin(a) * l.ry * d);
        stone(g, bx, by, R * (0.035 + rng() * 0.05), ['#7a3218', '#a2482a', '#d0773f'], rng);
      }
      for (let k = 0; k < 2; k++) { const [bx, by] = P((rng() - 0.4) * L * 0.6, R * (0.08 + rng() * 0.1)); stone(g, bx, by, R * (0.03 + rng() * 0.025), ['#8c3c20', '#b3552f', '#dc8550'], rng); }   // blocks fallen from the span
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * TAU + rng() * 0.6, d = R * (0.82 + rng() * 0.18), [sx, sy] = P(Math.cos(a) * d, Math.sin(a) * d * 0.75), sr = R * (0.045 + rng() * 0.035);
        shadowBlob(g, sx, sy, sr, sr * 0.7); canopy(g, sx, sy, sr, ['#4f5228', '#6f7436', '#949a52'], rng, 'rgba(190,170,110,0.5)');
      }
      // the legs: strata stacked upward (each higher band a touch smaller and further up-left), then a lit top
      const STRATA = ['#6e2c15', '#8c3c20', '#a2482a', '#b65a32', '#a64c2a', '#c86a3c', '#d77d47'];
      const legTop = l => {
        const top = at(l.pts, 1, l.cx, l.cy, 0.86), tx = l.cx + TOP[0], ty = l.cy + TOP[1];
        g.beginPath(); subBlob(g, top); g.fillStyle = radial(g, tx - l.rx * 0.35, ty - l.ry * 0.35, 1, tx, ty, Math.max(l.rx, l.ry) * 1.05, [[0, '#f6bd88'], [0.6, '#e49a60'], [1, '#cf7c45']]); g.fill();
        g.strokeStyle = linear(g, tx - l.rx, ty - l.ry, tx + l.rx, ty + l.ry, [[0, 'rgba(255,230,190,0.9)'], [0.45, 'rgba(255,230,190,0)'], [0.6, 'rgba(110,40,15,0)'], [1, 'rgba(110,40,15,0.5)']]);
        g.lineWidth = Math.max(1.5, R * 0.018); g.stroke();
        g.strokeStyle = 'rgba(150,62,28,0.35)'; g.lineWidth = 1;   // the bedding on the top, showing where the layers were cut
        for (const k of [0.62, 0.38]) { g.beginPath(); subBlob(g, at(l.pts, 1, l.cx, l.cy, 0.86 * k + rng() * 0.05)); g.stroke(); }
        g.fillStyle = 'rgba(110,42,18,0.3)'; for (let k = 0; k < 5; k++) { circ(g, tx + (rng() - 0.5) * l.rx * 0.9, ty + (rng() - 0.5) * l.ry * 0.9, R * (0.008 + rng() * 0.012)); g.fill(); }   // weathering pits
      };
      for (const l of legs) {
        for (let i = 0; i < STRATA.length; i++) { const f = i / STRATA.length; g.beginPath(); subBlob(g, at(l.pts, f, l.cx, l.cy, 1 - f * 0.14)); g.fillStyle = STRATA[i]; g.fill(); }
      }
      // the span: its thickness in darker bands below, then its top surface, lit along the upper edge
      for (const [f, col] of [[0.66, '#7a3218'], [0.78, '#9a4226'], [0.9, '#b8582f']]) { g.beginPath(); subBlob(g, at(span, f)); g.fillStyle = col; g.fill(); }
      const st = at(span, 1), [tx, ty] = [scx + TOP[0], scy + TOP[1]];
      g.beginPath(); subBlob(g, st); g.fillStyle = linear(g, tx - R * 0.15, ty - R * 0.2, tx + R * 0.15, ty + R * 0.2, [[0, '#f1b27c'], [0.55, '#de9058'], [1, '#c27040']]); g.fill();
      g.strokeStyle = 'rgba(160,66,30,0.4)'; g.lineWidth = 1; g.beginPath(); at(up, 1).forEach(([px, py], i) => { const q = [px + (tx - px) * 0.45, py + (ty - py) * 0.45]; i ? g.lineTo(...q) : g.moveTo(...q); }); g.stroke();   // a bedding line along the span
      g.strokeStyle = 'rgba(255,228,188,0.85)'; g.lineWidth = Math.max(1.5, R * 0.02); g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); at(up, 1).forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.stroke();
      for (const l of legs) legTop(l);   // the tops last, so the span runs into them
      return;
    }
    case 'ice': {   // a geyser: a terraced sinter mound, a boiling pool over the vent, snow round the base, steam
      const R = r * 0.6, h = wobble(rng), wind = -0.75 + (v - 0.5) * 0.7;
      const mound = (k, dx = 0, dy = 0, j = 0) => { const pts = []; for (let i = 0; i < 30; i++) { const a = i / 30 * TAU, w = wob(h, a) + j * Math.sin(7 * a + k * 9); pts.push([x + dx + Math.cos(a) * R * k * w, y + dy + Math.sin(a) * R * k * w * 0.92]); } return pts; };
      const fillPts = (pts, col) => { g.beginPath(); subBlob(g, pts); g.fillStyle = col; g.fill(); };
      // glassy ice patches on the ground first
      for (let k = 0; k < 3; k++) {
        const a = k / 3 * TAU + rng() * 1.2, d = R * (1.05 + rng() * 0.15), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.92;
        const hp = wobble(rng), pts = []; for (let i = 0; i < 12; i++) { const b = i / 12 * TAU, w = wob(hp, b); pts.push([px + (Math.cos(b) * Math.cos(a + 1.57) * 0.34 - Math.sin(b) * Math.sin(a + 1.57) * 0.16) * R * w, py + (Math.cos(b) * Math.sin(a + 1.57) * 0.34 + Math.sin(b) * Math.cos(a + 1.57) * 0.16) * R * w]); }
        fillPts(pts, 'rgba(150,200,232,0.5)');
        g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.2; for (let s = 0; s < 3; s++) { const o = (s - 1) * R * 0.06; g.beginPath(); g.moveTo(px - R * 0.12 + o, py - R * 0.05 + o * 0.5); g.lineTo(px - R * 0.02 + o, py - R * 0.1 + o * 0.5); g.stroke(); }
      }
      // a soft shadow down-right in a few faint layers
      for (let p = 3; p >= 0; p--) fillPts(mound(1 + p * 0.03, R * (0.04 + p * 0.03), R * (0.06 + p * 0.04)), 'rgba(40,70,105,0.08)');
      // the terraces, outer to inner: each a darker riser down-right, its top, and a lit top-left lip
      const TERR = [[1, '#b86f40'], [0.87, '#d49a5a'], [0.75, '#e7cf9c'], [0.63, '#f1e4c4'], [0.52, '#e4c985']];
      const step = (k) => { const o = -(1 - k) * R * 0.1; return mound(k, o, o, 0.025); };
      g.lineJoin = 'round';
      for (const [k, col] of TERR) {
        const pts = step(k);
        fillPts(pts.map(([px, py]) => [px + R * 0.03, py + R * 0.04]), shade(col, -0.25));
        fillPts(pts, col);
        g.strokeStyle = linear(g, x - R * k, y - R * k, x + R * k, y + R * k, [[0, 'rgba(255,252,236,0.85)'], [0.42, 'rgba(255,252,236,0)'], [1, 'rgba(255,252,236,0)']]); g.lineWidth = Math.max(1.4, R * 0.022); g.stroke();
      }
      // mineral staining clipped to the mound: rust runoff, bands, specks, frost on the cold edge
      g.save(); g.beginPath(); subBlob(g, mound(1)); g.clip();
      g.lineCap = 'round';
      for (let k = 0; k < 8; k++) {
        let a = rng() * TAU, d = R * 0.32; const pts = [];
        while (d < R * 1.1) { pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.92]); a += (rng() - 0.5) * 0.25; d += R * (0.08 + rng() * 0.06); }
        for (const [lw, col] of [[0.09, 'rgba(160,72,30,0.22)'], [0.04, 'rgba(232,140,50,0.3)']]) { g.strokeStyle = col; g.lineWidth = R * lw * (0.6 + rng() * 0.6); g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.stroke(); }
      }
      g.lineWidth = 1; for (const [k] of TERR) { g.strokeStyle = 'rgba(150,80,32,0.22)'; g.beginPath(); subBlob(g, step(k - 0.045)); g.stroke(); }
      for (let k = 0; k < 40; k++) { const a = rng() * TAU, d = R * (0.4 + rng() * 0.6); circ(g, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.92, R * (0.006 + rng() * 0.012)); g.fillStyle = rng() < 0.5 ? 'rgba(255,248,225,0.7)' : 'rgba(150,70,30,0.4)'; g.fill(); }
      for (let k = 0; k < 26; k++) { const a = rng() * TAU, w = wob(h, a) * R * (0.9 + rng() * 0.12); circ(g, x + Math.cos(a) * w, y + Math.sin(a) * w * 0.92, R * (0.01 + rng() * 0.02)); g.fillStyle = 'rgba(255,255,255,0.75)'; g.fill(); }
      g.restore();
      // the boiling pool over the vent: a bright sinter lip, turquoise shading to a deep blue throat, a shaded top-left edge
      const pr = R * 0.3, hp = wobble(rng, 0.5), pool = k => { const pts = []; for (let i = 0; i < 22; i++) { const a = i / 22 * TAU, w = wob(hp, a); pts.push([x + Math.cos(a) * pr * k * w, y + Math.sin(a) * pr * k * w]); } return pts; };
      fillPts(pool(1.24).map(([px, py]) => [px + R * 0.02, py + R * 0.025]), '#c9ab6a');
      fillPts(pool(1.22), '#fbf3da');
      fillPts(pool(1), radial(g, x, y, 0, x, y, pr * 1.12, [[0, '#062636'], [0.2, '#0c556e'], [0.48, '#1c9fb4'], [0.78, '#55d6d4'], [1, '#aef2e6']]));
      g.save(); g.beginPath(); subBlob(g, pool(1)); g.clip();
      g.beginPath(); subBlob(g, pool(1)); subBlob(g, pool(1.02).map(([px, py]) => [px + pr * 0.14, py + pr * 0.18]).reverse()); g.fillStyle = 'rgba(8,40,60,0.28)'; g.fill();   // the rim's shadow, on the top-left of the water
      g.restore();
      g.strokeStyle = 'rgba(232,255,250,0.95)'; g.lineWidth = Math.max(1.5, pr * 0.07); g.beginPath(); subBlob(g, pool(1)); g.stroke();
      fillPts(pool(0.3).map(([px, py]) => [x + (px - x) * 1.1, y + (py - y) * 0.85]), '#03141e');   // the vent
      g.strokeStyle = 'rgba(200,250,255,0.55)'; g.lineWidth = 1; for (let k = 0; k < 6; k++) { const a = rng() * TAU, d = pr * (0.15 + rng() * 0.5); circ(g, x + Math.cos(a) * d, y + Math.sin(a) * d, pr * (0.05 + rng() * 0.06)); g.stroke(); }   // bubbles
      ell(g, x + pr * 0.38, y + pr * 0.42, pr * 0.22, pr * 0.07, -0.7); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fill();   // a glint of sky on the far side
      // snow drifts banked against the base, each with a blue shadow
      for (let k = 0; k < 4; k++) {
        const a = k / 4 * TAU + 0.4 + rng() * 0.9, d = wob(h, a) * R * (0.96 + rng() * 0.08), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.92;
        const rx = R * (0.2 + rng() * 0.1), ry = R * (0.09 + rng() * 0.04), t = a + Math.PI / 2, hd = wobble(rng), pts = [];
        for (let i = 0; i < 12; i++) { const b = i / 12 * TAU, w = wob(hd, b), lx = Math.cos(b) * rx * w, ly = Math.sin(b) * ry * w; pts.push([px + lx * Math.cos(t) - ly * Math.sin(t), py + lx * Math.sin(t) + ly * Math.cos(t)]); }
        fillPts(pts.map(([qx, qy]) => [qx + R * 0.035, qy + R * 0.05]), 'rgba(70,110,150,0.2)');
        fillPts(pts, radial(g, px - rx * 0.4, py - ry * 0.6, 1, px, py, rx * 1.1, [[0, '#ffffff'], [0.6, '#eef6fc'], [1, '#c6dcee']]));
      }
      // steam wisps: long, ragged and fading, all leaning the same way on the wind
      const dx = Math.cos(wind), dy = Math.sin(wind);
      for (let i = 0; i < 6; i++) {
        const d = R * (0.12 + i * 0.2), lat = Math.sin(i * 1.9 + v * 9) * R * 0.05 * (i + 1), a0 = 0.34 - i * 0.045;
        for (let s = 0; s < 3; s++) {
          const len = R * (0.2 + i * 0.045) * (0.7 + rng() * 0.5), wid = len * (0.3 + rng() * 0.15), px = x + dx * (d + (rng() - 0.5) * R * 0.1) - dy * (lat + (rng() - 0.5) * R * 0.1), py = y + dy * (d + (rng() - 0.5) * R * 0.1) + dx * (lat + (rng() - 0.5) * R * 0.1), a = a0 * (0.6 + rng() * 0.4);
          g.save(); g.translate(px, py); g.rotate(wind + (rng() - 0.5) * 0.5); g.scale(1, wid / len);
          circ(g, 0, 0, len); g.fillStyle = radial(g, -len * 0.15, 0, 0, 0, 0, len, [[0, `rgba(255,255,255,${a})`], [0.55, `rgba(240,250,255,${a * 0.45})`], [1, 'rgba(240,250,255,0)']]); g.fill();
          g.restore();
        }
      }
      return;
    }
    case 'space': {   // a ringed gas giant drifting below the station (or, with look 'ice', an ice giant)
      const R = r * 0.6;
      if (c.look === 'ice') {   // a Neptune-blue ice giant: cloud bands, a dark storm, a near-edge-on ring, a small moon
        g.save(); g.translate(x, y);
        circ(g, R * 0.12, R * 0.16, R * 1.02); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill();   // its shadow on the station's backdrop
        g.save(); g.rotate(1.2); g.strokeStyle = 'rgba(160,200,255,0.22)'; g.lineWidth = R * 0.05; g.beginPath(); g.ellipse(0, 0, R * 1.7, R * 0.16, 0, Math.PI, TAU); g.stroke(); g.restore();   // ring, far side
        circ(g, 0, 0, R); g.fillStyle = radial(g, -R * 0.4, -R * 0.45, 2, 0, 0, R, [[0, '#cfe8ff'], [0.35, '#5b8ff0'], [0.75, '#2c52c9'], [1, '#121c52']]); g.fill();
        g.save(); circ(g, 0, 0, R); g.clip();
        for (let k = -4; k <= 4; k++) { g.fillStyle = k % 2 ? 'rgba(20,40,120,0.18)' : 'rgba(210,235,255,0.12)'; g.beginPath(); g.ellipse(0, k * R * 0.22, R * 1.1, R * 0.07 + (k & 1) * R * 0.03, 0, 0, TAU); g.fill(); }
        for (let k = 0; k < 5; k++) { const sx = (rng() - 0.5) * R * 1.2, sy = (rng() - 0.5) * R * 1.2; g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(sx, sy, R * (0.12 + rng() * 0.12), R * 0.035, 0, 0, TAU); g.fill(); }   // wispy high clouds
        g.fillStyle = '#16245e'; g.beginPath(); g.ellipse(R * 0.25, R * 0.18, R * 0.24, R * 0.12, -0.15, 0, TAU); g.fill();   // the dark storm
        g.fillStyle = 'rgba(240,248,255,0.8)'; g.beginPath(); g.ellipse(R * 0.3, R * 0.36, R * 0.14, R * 0.035, -0.1, 0, TAU); g.fill();
        circ(g, R * 0.35, R * 0.35, R * 1.0); g.fillStyle = 'rgba(5,10,40,0.35)'; g.fill();   // the night side
        g.restore();
        g.save(); g.rotate(1.2); g.strokeStyle = 'rgba(180,215,255,0.32)'; g.lineWidth = R * 0.05; g.beginPath(); g.ellipse(0, 0, R * 1.7, R * 0.16, 0, 0, Math.PI); g.stroke(); g.restore();   // ring, near side
        const mx = -R * 1.35, my = -R * 0.75, mr = R * 0.13;   // its little moon
        circ(g, mx, my, mr); g.fillStyle = radial(g, mx - mr * 0.4, my - mr * 0.4, 1, mx, my, mr, [[0, '#f1f0ea'], [1, '#8d8a80']]); g.fill();
        g.restore(); return;
      }
      g.save(); g.translate(x, y); g.rotate(-0.35);
      g.strokeStyle = 'rgba(225,205,170,0.55)'; g.lineWidth = R * 0.16; g.beginPath(); g.ellipse(0, 0, R * 1.6, R * 0.45, 0, Math.PI, TAU); g.stroke();
      g.strokeStyle = 'rgba(200,180,150,0.35)'; g.lineWidth = R * 0.08; g.beginPath(); g.ellipse(0, 0, R * 1.85, R * 0.52, 0, Math.PI, TAU); g.stroke();
      circ(g, 0, 0, R); g.fillStyle = radial(g, -R * 0.4, -R * 0.4, 2, 0, 0, R, [[0, '#f3d29a'], [0.5, '#d18a4a'], [1, '#5a2e1a']]); g.fill();
      g.save(); circ(g, 0, 0, R); g.clip(); for (let k = -3; k <= 3; k++) { g.fillStyle = k % 2 ? 'rgba(120,60,30,0.25)' : 'rgba(255,230,190,0.15)'; g.fillRect(-R, k * R * 0.25 - R * 0.08, R * 2, R * 0.14); } g.restore();
      g.strokeStyle = 'rgba(225,205,170,0.55)'; g.lineWidth = R * 0.16; g.beginPath(); g.ellipse(0, 0, R * 1.6, R * 0.45, 0, 0, Math.PI); g.stroke();
      g.strokeStyle = 'rgba(200,180,150,0.35)'; g.lineWidth = R * 0.08; g.beginPath(); g.ellipse(0, 0, R * 1.85, R * 0.52, 0, 0, Math.PI); g.stroke();
      g.restore(); return;
    }
    case 'factory': {   // a cooling tower from above: a concrete ring, its dark throat and a plume of steam
      const R = r * 0.7;
      circ(g, x + R * 0.15, y + R * 0.2, R); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill();
      circ(g, x, y, R); g.fillStyle = radial(g, x - R * 0.3, y - R * 0.3, 2, x, y, R, [[0, '#d9dbe0'], [1, '#8d9199']]); g.fill();
      circ(g, x, y, R * 0.72); g.fillStyle = radial(g, x, y, 2, x, y, R * 0.72, [[0, '#15161a'], [1, '#3a3d45']]); g.fill();
      for (let k = 0; k < 7; k++) { const px = x + R * 0.12 * k, py = y - R * 0.18 * k, pr = R * (0.35 + k * 0.08); g.fillStyle = radial(g, px, py, 0, px, py, pr, [[0, `rgba(240,242,246,${0.55 - k * 0.06})`], [1, 'rgba(240,242,246,0)']]); g.fillRect(px - pr, py - pr, pr * 2, pr * 2); }
      return;
    }
    case 'atoll': {
      if (clearingsOf(T) && clearingsOf(T)[0] === c) {   // a wrecked schooner on the reef, surf breaking round it
        const R = r * 0.75, rot = -0.6 + (v - 0.5) * 0.4;
        circ(g, x, y, R * 1.25); g.fillStyle = 'rgba(110,215,205,0.35)'; g.fill();
        const reef = []; for (let k = 0; k < 16; k++) { const a = k / 16 * TAU, dd = R * (0.85 + rng() * 0.3); reef.push([x + Math.cos(a) * dd, y + Math.sin(a) * dd * 0.7]); }
        smoothPath(g, reef); g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill();
        smoothPath(g, reef.map(([px, py]) => [x + (px - x) * 0.85, y + (py - y) * 0.85])); g.fillStyle = '#8fd8cd'; g.fill();
        for (let k = 0; k < 7; k++) { const a = rng() * TAU, o = R * (0.5 + rng() * 0.3); rock(g, x + Math.cos(a) * o, y + Math.sin(a) * o * 0.7, R * (0.05 + rng() * 0.05), '#6f6a66', rng); }
        g.save(); g.translate(x, y); g.rotate(rot);
        const L = R * 0.85, Wd = R * 0.26;
        g.beginPath(); g.moveTo(L + 14, 18); g.quadraticCurveTo(L * 0.3, Wd + 30, -L + 14, Wd * 0.7 + 18); g.lineTo(-L + 14, -Wd * 0.7 + 18); g.quadraticCurveTo(L * 0.3, -Wd + 18, L + 14, 18); g.fillStyle = 'rgba(0,30,40,0.3)'; g.fill();   // shadow
        g.beginPath(); g.moveTo(L, 0); g.quadraticCurveTo(L * 0.3, Wd * 1.1, -L, Wd * 0.75); g.lineTo(-L, -Wd * 0.75); g.quadraticCurveTo(L * 0.3, -Wd * 1.1, L, 0); g.fillStyle = '#5b3b22'; g.fill();
        g.beginPath(); g.moveTo(L * 0.86, 0); g.quadraticCurveTo(L * 0.3, Wd * 0.85, -L * 0.9, Wd * 0.58); g.lineTo(-L * 0.9, -Wd * 0.58); g.quadraticCurveTo(L * 0.3, -Wd * 0.85, L * 0.86, 0); g.fillStyle = '#9a7048'; g.fill();
        g.strokeStyle = 'rgba(60,38,20,0.55)'; g.lineWidth = 1.4; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(-L * 0.9, k * Wd * 0.22); g.quadraticCurveTo(L * 0.2, k * Wd * 0.3, L * 0.8, k * Wd * 0.05); g.stroke(); }
        g.fillStyle = '#1f2a30'; g.beginPath(); g.ellipse(L * 0.1, Wd * 0.2, L * 0.22, Wd * 0.32, 0.3, 0, TAU); g.fill();   // the stove-in hold, the sea inside it
        g.fillStyle = 'rgba(120,200,200,0.5)'; g.beginPath(); g.ellipse(L * 0.1, Wd * 0.25, L * 0.15, Wd * 0.2, 0.3, 0, TAU); g.fill();
        g.strokeStyle = '#4a3020'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(-L * 0.35, 0); g.lineTo(L * 0.55, -Wd * 1.7); g.stroke();   // the fallen mast, over the side
        g.strokeStyle = '#6f4a2c'; g.lineWidth = 3; g.beginPath(); g.moveTo(-L * 0.4, 0); g.lineTo(L * 0.5, -Wd * 1.75); g.stroke();
        g.fillStyle = 'rgba(236,228,205,0.85)'; poly(g, [[L * 0.05, -Wd * 0.85], [L * 0.45, -Wd * 1.5], [L * 0.3, -Wd * 0.6]]); g.fill();   // a torn sail
        circ(g, -L * 0.6, 0, Wd * 0.22); g.fillStyle = '#3a2618'; g.fill();   // the stump of the mainmast
        g.restore();
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3; for (let k = 0; k < 5; k++) { const a = 1.35 + (k - 2) * 0.35; g.beginPath(); g.arc(x, y, R * (0.95 + (k % 2) * 0.12), a - 0.2, a + 0.2); g.stroke(); }   // waves breaking on the windward side
        return;
      }
      // a fishing village on stilts: a plank pier with thatched huts along it, boats tied up
      const L = r * 0.85, a = (v - 0.5) * 0.8;
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = 'rgba(0,30,40,0.28)'; g.fillRect(-L + 8, -9 + 12, L * 2, 18);
      g.fillStyle = '#4a3420'; for (let px = -L; px <= L; px += 22) for (const py of [-11, 11]) { circ(g, px, py, 2.6); g.fill(); }   // stilts
      g.fillStyle = '#9b7a52'; g.fillRect(-L, -9, L * 2, 18);
      g.strokeStyle = 'rgba(60,40,20,0.5)'; g.lineWidth = 1; for (let px = -L + 6; px < L; px += 6) { g.beginPath(); g.moveTo(px, -9); g.lineTo(px, 9); g.stroke(); }
      for (let k = 0; k < 4; k++) {
        const hx = -L * 0.75 + k * L * 0.5, hy = (k % 2 ? 1 : -1) * 34, hs = 20 + (k % 2) * 4;
        g.fillStyle = '#9b7a52'; g.fillRect(hx - 5, Math.min(hy, 0), 10, Math.abs(hy));   // a walkway out to it
        g.fillStyle = 'rgba(0,30,40,0.28)'; g.fillRect(hx - hs + 8, hy - hs + 10, hs * 2, hs * 2);
        hut(g, hx, hy, hs, 0);
      }
      boat(g, L * 0.95, 26, 44, 0.3, '#2f6fa8'); boat(g, -L * 0.2, -20, 38, Math.PI - 0.2, '#d8452f');
      g.restore();
      return;
    }
    case 'jungle': {
      if (clearingsOf(T) && clearingsOf(T)[0] === c) {   // a cenote: a round sinkhole in the limestone, a waterfall pouring into the green pool at the bottom
        const R = r * 0.78, rim = [], h = wobble(rng, 0.8);
        for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; rim.push([x + Math.cos(a) * R * wob(h, a), y + Math.sin(a) * R * wob(h, a) * 0.9]); }
        g.beginPath(); subBlob(g, rim.map(([px, py]) => [x + (px - x) * 1.12, y + (py - y) * 1.12])); g.fillStyle = '#9d957a'; g.fill();   // the limestone lip
        g.beginPath(); subBlob(g, rim); g.fillStyle = '#5b5644'; g.fill();
        g.save(); g.beginPath(); subBlob(g, rim); g.clip();
        // the walls going down: the far (lower-right) wall lit, the near one in shadow; stacked toward the water
        for (let k = 0; k < 6; k++) { const f = k / 6; ell(g, x + R * 0.1 * f, y + R * 0.14 * f, R * (1 - f * 0.35), R * 0.9 * (1 - f * 0.35)); g.fillStyle = mix('#a39a7c', '#3f3b30', f * 0.9); g.fill(); }
        const wx = x + R * 0.12, wy = y + R * 0.18, wr = R * 0.62;
        ell(g, wx, wy, wr, wr * 0.88); g.fillStyle = radial(g, wx - wr * 0.3, wy - wr * 0.3, 2, wx, wy, wr, [[0, '#6fe0cf'], [0.6, '#27a59c'], [1, '#156c70']]); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5; for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(wx + R * 0.05, wy - R * 0.32, wr * (0.15 + k * 0.12), wr * (0.08 + k * 0.06), 0, 0, TAU); g.stroke(); }   // ripples under the falls
        g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(x - R * 0.15, y - R * 0.2, R * 0.95, R * 0.8, 0, Math.PI * 0.85, Math.PI * 1.75); g.ellipse(x, y, R * 0.5, R * 0.45, 0, Math.PI * 1.75, Math.PI * 0.85, true); g.fill();   // the near wall's shade
        g.restore();
        // the waterfall: over the top lip, down the wall, foaming into the pool
        const fx = x + R * 0.05, fy = y - R * 0.86;
        g.fillStyle = linear(g, fx, fy, fx, wy - wr * 0.5, [[0, '#d7f3f2'], [1, '#9fe0dc']]); g.beginPath(); g.moveTo(fx - R * 0.12, fy); g.lineTo(fx + R * 0.12, fy); g.lineTo(fx + R * 0.16, wy - wr * 0.6); g.lineTo(fx - R * 0.08, wy - wr * 0.6); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.4; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(fx + k * R * 0.045, fy + 4); g.lineTo(fx + k * R * 0.055 + R * 0.04, wy - wr * 0.62); g.stroke(); }
        for (let k = 0; k < 7; k++) { circ(g, fx + R * 0.04 + (rng() - 0.5) * R * 0.3, wy - wr * 0.6 + (rng() - 0.3) * R * 0.12, R * (0.05 + rng() * 0.05)); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill(); }
        g.strokeStyle = '#2f7fa0'; g.lineWidth = 6; g.beginPath(); g.moveTo(fx - R * 0.6, fy - R * 0.55); g.quadraticCurveTo(fx - R * 0.2, fy - R * 0.3, fx, fy); g.stroke();   // the stream that feeds it
        g.strokeStyle = '#6cc4d8'; g.lineWidth = 2.5; g.stroke();
        for (let k = 0; k < 14; k++) {   // vines hanging over the lip, and ferns along it
          const a = rng() * TAU, px = x + Math.cos(a) * R * 1.02, py = y + Math.sin(a) * R * 0.92, l = R * (0.15 + rng() * 0.25);
          g.strokeStyle = '#3f6e2c'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px - Math.cos(a) * l * 0.5 + 3, py - Math.sin(a) * l * 0.5, px - Math.cos(a) * l, py - Math.sin(a) * l + l * 0.3); g.stroke();
          ell(g, px + Math.cos(a) * 6, py + Math.sin(a) * 6, 7, 4, a); g.fillStyle = k % 2 ? '#3f7a32' : '#5d9a42'; g.fill();
        }
        return;
      }
      // a sun stone on a stepped platform: the great carved calendar disc, rings of glyphs round a face, moss in the grooves
      const s = r * 0.78, rot = (v - 0.5) * 0.4;
      g.save(); g.translate(x, y); g.rotate(rot);
      g.fillStyle = 'rgba(14,18,28,0.3)'; g.fillRect(-s + 10, -s + 14, s * 2, s * 2);
      for (const [k, col, lt] of [[1, '#8c8268', '#b3a888'], [0.84, '#9b9176', '#c4b997']]) {   // two steps
        const q = s * k; g.fillStyle = col; g.fillRect(-q, -q, q * 2, q * 2); g.fillStyle = lt; g.fillRect(-q, -q, q * 2, q * 0.12); g.fillRect(-q, -q, q * 0.12, q * 2);
        g.strokeStyle = 'rgba(60,52,38,0.3)'; g.lineWidth = 1; for (let u = -q; u < q; u += q / 3) { g.beginPath(); g.moveTo(u, -q); g.lineTo(u, -q * 0.84); g.stroke(); }
      }
      const D = s * 0.66;
      circ(g, 4, 6, D); g.fillStyle = 'rgba(14,18,28,0.35)'; g.fill();
      circ(g, 0, 0, D); g.fillStyle = radial(g, -D * 0.35, -D * 0.4, D * 0.1, 0, 0, D, [[0, '#d8cfb2'], [0.7, '#b4a986'], [1, '#857b62']]); g.fill();
      g.strokeStyle = 'rgba(70,60,42,0.6)'; g.lineWidth = 1.6;
      for (const k of [0.92, 0.72, 0.5, 0.3]) { circ(g, 0, 0, D * k); g.stroke(); }
      for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * D * 0.72, Math.sin(a) * D * 0.72); g.lineTo(Math.cos(a) * D * 0.92, Math.sin(a) * D * 0.92); g.stroke(); }   // the day signs
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + 0.2; poly(g, [[Math.cos(a) * D * 0.52, Math.sin(a) * D * 0.52], [Math.cos(a - 0.12) * D * 0.7, Math.sin(a - 0.12) * D * 0.7], [Math.cos(a + 0.12) * D * 0.7, Math.sin(a + 0.12) * D * 0.7]]); g.fillStyle = 'rgba(70,60,42,0.45)'; g.fill(); }   // the sun's rays
      circ(g, 0, 0, D * 0.28); g.fillStyle = '#c9be9c'; g.fill();
      g.fillStyle = '#5d5442'; for (const sx of [-1, 1]) { circ(g, sx * D * 0.1, -D * 0.05, D * 0.035); g.fill(); }
      ell(g, 0, D * 0.13, D * 0.08, D * 0.03); g.fill();   // the face in the middle
      g.restore();
      moss(g, x - s * 0.5, y + s * 0.6, s * 0.4, rng, 4); moss(g, x + s * 0.7, y - s * 0.4, s * 0.3, rng, 3);
      return;
    }
    case 'crab': {
      if (T && T.def.shore && shoreOf(T).wet(x, y)) {   // out in the water: a sea stack, gulls on it, the surf round its foot
        const R = r * 0.45;
        circ(g, x, y, R * 1.6); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fill(); circ(g, x, y, R * 1.25); g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill();
        rock(g, x, y, R, '#7a7064', rng); rock(g, x + R * 0.7, y + R * 0.5, R * 0.45, '#6b6258', rng);
        circ(g, x - R * 0.2, y - R * 0.3, R * 0.4); g.fillStyle = alpha('#f4f1ea', 0.6); g.fill();   // guano
        for (let k = 0; k < 3; k++) { const gx = x + (rng() - 0.5) * R, gy = y + (rng() - 0.5) * R * 0.6; g.strokeStyle = '#ffffff'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(gx - 7, gy); g.quadraticCurveTo(gx - 3, gy - 4, gx, gy); g.quadraticCurveTo(gx + 3, gy - 4, gx + 7, gy); g.stroke(); }
        return;
      }
      if (clearingsOf(T) && clearingsOf(T)[0] === c) {   // a galleon's wreck half buried in the sand, a treasure chest spilling out
        const R = r * 0.8, rot = -0.5 + (v - 0.5) * 0.6;
        g.save(); g.translate(x, y); g.rotate(rot);
        const L = R * 0.95, Wd = R * 0.32;
        ell(g, 18, 22, L * 1.05, Wd * 1.25); g.fillStyle = 'rgba(60,40,20,0.25)'; g.fill();
        ell(g, 0, 0, L * 1.05, Wd * 1.3); g.fillStyle = '#c9ad78'; g.fill();   // the sand heaped round it
        g.beginPath(); g.moveTo(L, 0); g.quadraticCurveTo(L * 0.3, Wd * 1.15, -L * 0.85, Wd * 0.8); g.lineTo(-L * 0.85, -Wd * 0.8); g.quadraticCurveTo(L * 0.3, -Wd * 1.15, L, 0); g.fillStyle = '#4a3220'; g.fill();
        g.save(); g.clip(); g.fillStyle = '#2b1d12'; g.fillRect(-L, -Wd * 0.7, L * 2, Wd * 1.4);
        g.fillStyle = '#d9c08a'; ell(g, -L * 0.2, Wd * 0.5, L * 0.7, Wd * 0.45); g.fill();   // sand drifted into the hull
        g.restore();
        g.strokeStyle = '#8a6440'; g.lineCap = 'round';
        for (let k = -4; k <= 4; k++) { const fx = k * L * 0.19, h = Wd * (1.05 - Math.abs(k) * 0.07); g.lineWidth = 7; g.beginPath(); g.moveTo(fx, -h); g.quadraticCurveTo(fx + 6, 0, fx, h); g.stroke(); g.strokeStyle = '#b58a5c'; g.lineWidth = 3; g.beginPath(); g.moveTo(fx - 1.5, -h); g.quadraticCurveTo(fx + 4.5, 0, fx - 1.5, h); g.stroke(); g.strokeStyle = '#8a6440'; }   // the ribs
        g.lineWidth = 9; g.strokeStyle = '#6b4a2c'; g.beginPath(); g.moveTo(-L * 0.9, 0); g.lineTo(L * 0.95, 0); g.stroke();   // the keel
        g.lineWidth = 10; g.strokeStyle = '#5a3d24'; g.beginPath(); g.moveTo(L * 0.1, 0); g.lineTo(L * 0.75, Wd * 2.1); g.stroke();   // the fallen mast across the sand
        g.lineWidth = 4; g.strokeStyle = '#8a6440'; g.beginPath(); g.moveTo(L * 0.38, Wd * 0.85); g.lineTo(L * 0.2, Wd * 1.35); g.stroke();
        g.fillStyle = alpha('#ece3cc', 0.85); poly(g, [[L * 0.45, Wd * 1.25], [L * 0.75, Wd * 1.4], [L * 0.55, Wd * 2.0]]); g.fill();   // a scrap of sail
        g.restore();
        const cx = x + Math.cos(rot) * R * 0.2 - Math.sin(rot) * R * 0.55, cy = y + Math.sin(rot) * R * 0.2 + Math.cos(rot) * R * 0.55;   // the chest, spilled on the sand
        g.fillStyle = 'rgba(40,25,10,0.3)'; g.fillRect(cx - 18, cy - 10, 40, 28);
        g.fillStyle = '#7a4a24'; g.fillRect(cx - 22, cy - 14, 40, 26); g.fillStyle = '#a0662f'; g.fillRect(cx - 20, cy - 12, 36, 10); g.fillStyle = '#d9a83a'; g.fillRect(cx - 22, cy - 3, 40, 3);
        for (let k = 0; k < 16; k++) { const a = rng() * 1.6 + 0.4, d = 12 + rng() * 30; circ(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 3); g.fillStyle = rng() < 0.7 ? '#f2c94c' : '#d9d2c3'; g.fill(); }
        return;
      }
      // a giant clam open in a tide pool ringed by rock, a pearl inside, coral and a starfish round it
      const R = r * 0.7;
      const pts = []; for (let k = 0; k < 14; k++) { const a = k / 14 * TAU, d = R * (0.85 + rng() * 0.2); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8]); }
      smoothPath(g, pts.map(([px, py]) => [px + 8, py + 10])); g.fillStyle = 'rgba(40,30,20,0.28)'; g.fill();
      smoothPath(g, pts); g.fillStyle = '#867a6b'; g.fill(); smoothPath(g, pts.map(([px, py]) => [x + (px - x) * 0.93 - 3, y + (py - y) * 0.93 - 4])); g.fillStyle = '#ab9d88'; g.fill();
      smoothPath(g, pts.map(([px, py]) => [x + (px - x) * 0.82, y + (py - y) * 0.82])); g.fillStyle = radial(g, x - R * 0.3, y - R * 0.3, 4, x, y, R, [[0, '#b4f0e6'], [0.5, '#4fc3c6'], [1, '#1a7a8c']]); g.fill();
      for (let k = 0; k < 7; k++) { const a = rng() * TAU, d = R * (0.45 + rng() * 0.2), cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d * 0.75, col = ['#ff6f91', '#ffb347', '#c38fd9', '#ff8a65'][k % 4];
        g.strokeStyle = col; g.lineWidth = 3; g.lineCap = 'round'; for (let j = 0; j < 5; j++) { const b = rng() * TAU; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(b) * 9, cy + Math.sin(b) * 9); g.stroke(); } }   // coral
      const cs = R * 0.38;
      for (const [dy, col1, col2] of [[-1, '#cfd8dc', '#8fa0a8'], [1, '#e6ecef', '#a9b8bf']]) {   // the two shells, scalloped
        g.beginPath(); for (let k = 0; k <= 10; k++) { const a = Math.PI * k / 10, rr2 = cs * (1 + 0.08 * Math.cos(k * Math.PI)); g.lineTo(x - Math.cos(a) * rr2 * 1.2, y + dy * Math.sin(a) * rr2 * 0.7); } g.closePath();
        g.fillStyle = linear(g, x, y - cs, x, y + cs, [[0, col1], [1, col2]]); g.fill(); g.strokeStyle = 'rgba(60,70,80,0.4)'; g.lineWidth = 1.2; for (let k = 1; k < 10; k++) { const a = Math.PI * k / 10; g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(a) * cs * 1.15, y + dy * Math.sin(a) * cs * 0.65); g.stroke(); }
      }
      ell(g, x, y, cs * 1.15, cs * 0.16); g.fillStyle = '#e88aa0'; g.fill();
      circ(g, x, y - 2, cs * 0.22); g.fillStyle = radial(g, x - cs * 0.08, y - cs * 0.1, 1, x, y - 2, cs * 0.22, [[0, '#ffffff'], [0.6, '#f3eef5'], [1, '#c8bfd0']]); g.fill();
      return;
    }
    case 'neon': return neonLandmark(g, c, i);   // Neon Overflow's plazas (art/neon.js)
    default: {   // a farm pond with reeds
      ell(g, x, y, r * 0.8, r * 0.55); g.fillStyle = '#5aa0b8'; g.fill(); ell(g, x - r * 0.1, y - r * 0.08, r * 0.6, r * 0.38); g.fillStyle = '#7cc0d4'; g.fill();
      g.strokeStyle = '#4f7f3a'; g.lineWidth = 2; for (let k = 0; k < 14; k++) { const a = rng() * TAU, px = x + Math.cos(a) * r * 0.8, py = y + Math.sin(a) * r * 0.55; g.beginPath(); g.moveTo(px, py); g.lineTo(px + 2, py - 8); g.stroke(); }
    }
  }
}
// a few random harmonics for a lumpy outline; wob(h, a) is the radius multiplier at angle a (about 1)
function wobble(rng, k = 1) { return [[2, (0.06 + rng() * 0.05) * k, rng() * TAU], [3, (0.04 + rng() * 0.04) * k, rng() * TAU], [5, (0.02 + rng() * 0.02) * k, rng() * TAU]]; }
function wob(h, a) { let w = 1; for (const [f, amp, p] of h) w += amp * Math.sin(f * a + p); return w; }
// a soft closed blob through the points, added to the current path (no beginPath, so several can share one fill)
function subBlob(g, pts) {
  const n = pts.length, mid = i => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2];
  const m0 = mid(n - 1); g.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) { const m = mid(i); g.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
  g.closePath();
}
// a lumpy boulder lit from the top left: its shadow, a dark body and a lighter top set up-left
function stone(g, x, y, r, [dk, md, lt], rng) {
  const h = wobble(rng, 1.6), pts = []; for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, w = wob(h, a); pts.push([x + Math.cos(a) * r * w, y + Math.sin(a) * r * w * 0.85]); }
  ell(g, x + r * 0.35, y + r * 0.45, r * 1.05, r * 0.75); g.fillStyle = 'rgba(70,22,8,0.25)'; g.fill();
  g.beginPath(); subBlob(g, pts); g.fillStyle = dk; g.fill();
  g.beginPath(); subBlob(g, pts.map(([px, py]) => [x + (px - x) * 0.75 - r * 0.12, y + (py - y) * 0.72 - r * 0.15])); g.fillStyle = md; g.fill();
  ell(g, x - r * 0.3, y - r * 0.35, r * 0.3, r * 0.18, -0.5); g.fillStyle = lt; g.fill();
}
function rock_(g, x, y, r, rng) {
  const pts = []; for (let k = 0; k < 7; k++) { const a = k / 7 * TAU, d = r * (0.75 + rng() * 0.25); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85]); }
  ell(g, x + r * 0.3, y + r * 0.4, r, r * 0.7); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fill();
  poly(g, pts); g.fillStyle = '#6d6a66'; g.fill();
  poly(g, pts.map(([px, py]) => [x + (px - x) * 0.7 - r * 0.12, y + (py - y) * 0.65 - r * 0.15])); g.fillStyle = '#a19c95'; g.fill();
}
