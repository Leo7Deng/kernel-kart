// Kernel Kart art: Gradient Descent, a ski run down a mountain (theme deco 'ski'; race-ski.js). Cute and soft: a sunny
// snowy mountain lit from the top left (shadows fall down and to the right, a cool blue), round pines in snow caps, a
// groomed piste with corduroy and piste poles, open snowfields with pines scattered all over them, the Park (a funbox, a
// box, the halfpipe, a big kicker), the Big Air's timber inrun tower, kicker, judges' tower and landing hill, the Ledge (a
// shelf on a cliff face, its rock wall and rope, the cirque falling away below it), the Slalom's red and blue poles, the
// Moguls' bumps, the start hut at the summit, the finish arch and the lodge in the valley, and a chairlift. Flat fills with a soft shade (the flat looks,
// js/look.js, draw the same with the gradients flattened: paint.js). Everything heavy is baked into the track layer; the
// live layers are snow spray, the way you're going (the usual dotted line), the chairlift and the gauge.
import { DKEYS, KEYS, PCOL, TAU, clamp, mulberry } from '../core.js';
import { drawKeycap } from '../art.js';
import { Input } from '../input.js';
import { curvAt, halfWAt, trackSample } from '../geometry.js';
import { PARK, SKI, corrLat, fieldRun, skiK, skiWay, zoneOf } from '../race-ski.js';
import { VIEW } from '../view.js';
import { BK, bold } from '../look.js';
import { alpha, circ, ell, linear, poly, radial, shade, star } from './paint.js';
import { cliffGauge, cliffPose } from './alpine.js';

const SNOW = '#f4f8fc', SNOW_SH = '#d6e3f0', SNOW_DK = '#b9cde2', SHADOW = 'rgba(70,100,140,0.22)';
const PINE = ['#1f5a3e', '#2c7350', '#3f8d62'], TRUNK = '#6b4a35';
const SX = 0.55, SY = 0.75;   // where a shadow falls, per unit of height
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const mix = (a, b, f) => { const A = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), B = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16)); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * f)).join(',')})`; };

// ---------------------------------------------------------------- helpers
const at = (T, s, o) => { const q = trackSample(T, s); return [q.x + q.nx * o, q.y + q.ny * o]; };
const lerpN = (a, b, f) => a + (b - a) * f;
function bandPath(T, s0, s1, o0, o1, step = 12) {
  const L = [], R = [], f = (v, s) => typeof v === 'function' ? v(s) : v;
  for (let s = s0; s <= s1 + 0.1; s += step) { L.push(at(T, s, f(o0, s))); R.push(at(T, s, f(o1, s))); }
  const p = new Path2D(); [...L, ...R.reverse()].forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y)); p.closePath(); return p;
}
// a round pine from above, a little up the screen: its shadow, then tiers of branches with snow on their sunny side
export function pine(g, x, y, r, rng, shadowOnly = false, snowy = 1) {
  if (shadowOnly) { ell(g, x + r * SX, y + r * SY * 0.9, r * 1.05, r * 0.7, 0.5); g.fillStyle = SHADOW; g.fill(); return; }
  const rot = rng() * TAU;
  for (const [k, col] of [[1, PINE[0]], [0.74, PINE[1]], [0.46, PINE[2]]]) { star(g, x - (1 - k) * r * 0.14, y - (1 - k) * r * 0.2, r * k, 9, 0.66, rot + k * 2); g.fillStyle = col; g.fill(); }
  if (snowy > 0) {
    g.fillStyle = '#ffffff';
    for (let k = 0; k < 7; k++) { const a = rot + k / 7 * TAU; if (Math.cos(a - 3.93) < -0.1) continue; ell(g, x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.2 * snowy, r * 0.11 * snowy, a); g.fill(); }
    circ(g, x - r * 0.18, y - r * 0.26, r * 0.15 * snowy); g.fill();
  }
}
function rock(g, x, y, r, rng) {
  const P = []; for (let k = 0; k < 7; k++) { const a = k / 7 * TAU, d = r * (0.75 + rng() * 0.3); P.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.75]); }
  ell(g, x + r * 0.35, y + r * 0.4, r, r * 0.6); g.fillStyle = SHADOW; g.fill();
  poly(g, P); g.fillStyle = '#7d8896'; g.fill();
  poly(g, P.map(([px, py]) => [px - (px - x) * 0.25 - r * 0.12, py - (py - y) * 0.25 - r * 0.18])); g.fillStyle = '#9aa6b3'; g.fill();
  ell(g, x - r * 0.15, y - r * 0.35, r * 0.6, r * 0.25); g.fillStyle = '#ffffff'; g.fill();   // snow on top
}
const pole = (g, x, y, col, h = 22) => {   // a piste pole: a stick with stripes, standing up the screen
  g.strokeStyle = SHADOW; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + h * SX, y + h * 0.3); g.stroke();
  for (let k = 0; k < 4; k++) { g.strokeStyle = k % 2 ? '#1b1d24' : col; g.lineWidth = 3.4; g.beginPath(); g.moveTo(x, y - k * h / 4); g.lineTo(x, y - (k + 1) * h / 4); g.stroke(); }
};
// a slalom flag: a pole with a little square flag on it
const flag = (g, x, y, col, dir = 1) => {
  g.strokeStyle = SHADOW; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 18, y + 9); g.stroke();
  g.strokeStyle = '#2a2d36'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 30); g.stroke();
  poly(g, [[x, y - 30], [x + dir * 17, y - 27], [x + dir * 17, y - 16], [x, y - 18]]); g.fillStyle = col; g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.stroke();
};

// ---------------------------------------------------------------- the ground (track.js ground, tex 'ski')
// Snow everywhere: soft blue hollows, wind ripples, sparkle, and the forests either side of the piste (thick toward it,
// thinning out), rocks poking through further off, and the Ledge's cirque (a cliff falling away inside its bend). Shrunk
// to a thumbnail (D 0: the menu's preview) the forests are dark green banks along the piste, so the run reads
export function skiGround(g, T, X0, Y0, W, H, rng, dist, D) {
  const B = T.bbox; T.keepOut = keepOutOf(T);
  if (D < 0.5) { thumbGround(g, T, dist); return; }
  for (let i = 0; i < W * H / 260000 * Math.max(D, 0.2); i++) {   // hollows and drifts
    const x = X0 + rng() * W, y = Y0 + rng() * H, r = 90 + rng() * 260;
    g.save(); g.translate(x, y); g.scale(1.6, 0.6); g.fillStyle = radial(g, 0, 0, 0, 0, 0, r, [[0, alpha('#a9c3dd', 0.2)], [1, alpha('#a9c3dd', 0)]]); circ(g, 0, 0, r); g.fill(); g.restore();
  }
  g.lineCap = 'round';
  for (let i = 0; i < W * H / 9000; i++) {   // wind ripples (sastrugi), lit on their sunny side
    const x = X0 + rng() * W, y = Y0 + rng() * H, l = 14 + rng() * 26; if (dist(x, y, 40) < 10) continue;
    g.strokeStyle = 'rgba(160,185,212,0.35)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y + 4, x + l, y); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y - 1.5); g.quadraticCurveTo(x + l / 2, y + 2.5, x + l, y - 1.5); g.stroke();
  }
  // the forests: a pine on a jittered grid near the piste (thick within 300 of it, thinning to 800), off the set pieces
  const keep = T.keepOut || [], P = [], step = 56;
  for (let gy = B.y - 300; gy < B.y + B.h + 300; gy += step) for (let gx = B.x - 300; gx < B.x + B.w + 300; gx += step) {
    const x = gx + (rng() - 0.5) * step * 0.9, y = gy + (rng() - 0.5) * step * 0.9, d = dist(x, y, 900);
    if (d < 26 || d >= 900) continue;
    const dens = d < 300 ? 0.85 : 0.85 - (d - 300) / 600 * 0.75, clearing = Math.sin(x * 0.0021 + y * 0.0013) * Math.sin(y * 0.0017 - x * 0.0009);
    if (rng() > dens || clearing > 0.55 || keep.some(([kx, ky, kr]) => (kx - x) ** 2 + (ky - y) ** 2 < kr * kr)) continue;
    if (rng() < 0.05 && d > 200) { P.push({ x, y, r: 10 + rng() * 14, rock: true }); continue; }
    P.push({ x, y, r: 18 + rng() * 14 });
  }
  P.sort((a, b) => a.y - b.y);
  const r2 = mulberry(T.N + 99);
  for (const p of P) if (!p.rock) pine(g, p.x, p.y, p.r, r2, true);
  for (const p of P) p.rock ? rock(g, p.x, p.y, p.r, r2) : pine(g, p.x, p.y, p.r, r2);
}
// the thumbnail's ground: a cool shade down the mountain (the summit whiter, the valley bluer), and dark green forest
// banks either side of the piste in big soft clumps
function thumbGround(g, T, dist) {
  const B = T.bbox, q0 = trackSample(T, 0), q1 = trackSample(T, T.L);
  g.fillStyle = linear(g, q0.x, q0.y, q1.x, q1.y, [[0, '#f2f6fb'], [1, '#d3e0ee']]); g.fillRect(B.x - B.h, B.y - B.h, B.w + B.h * 2, B.h * 3);   // (well past the box: a thumbnail's wider than the run)
  const rng = mulberry(T.N + 7), keep = T.keepOut || [];
  for (let s = 0; s < T.L; s += 70) for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) {
    const o = sd * (halfWAt(T, s) + 70 + k * 120 + rng() * 80), [x, y] = at(T, s + (rng() - 0.5) * 60, o), r = 70 + rng() * 50;
    if (dist(x, y, 200) < r * 0.6 || keep.some(([kx, ky, kr]) => (kx - x) ** 2 + (ky - y) ** 2 < kr * kr)) continue;
    circ(g, x, y, r); g.fillStyle = k === 0 ? '#6fa486' : k === 1 ? '#8fbca1' : '#b2d2be'; g.fill();
  }
}
// the Ledge's cirque: inside its bend, past the shelf's edge, the mountain falls away: a rock face in buttresses and
// gullies (lit where it faces the sun, blue shade where it doesn't, snow on its ledges), and far below a hazy valley with
// a frozen stream and tiny pines, so the drop reads as deep
const FACE = 150, VOID = 640;   // the face's depth from the edge, and how far the cirque reaches past the piste
function ledgeVoid(g, T, z, D) {
  const side = z.side, s0 = z.sN, s1 = z.sE, hw = s => halfWAt(T, s), edge = s => z.lane(s).edge + side * 2;
  const taper = s => Math.max(0, Math.min(1, (s - s0) / 500, (s1 - s) / 500));
  const far = s => side * (hw(s) + VOID * taper(s)), step = D < 0.5 ? 40 : 10;
  const all = bandPath(T, s0, s1, edge, far, step);
  g.fillStyle = D < 0.5 ? '#8a9cb6' : '#5f7795'; g.fill(all);   // the valley floor, far below (a cool haze)
  g.save(); g.clip(all);
  const fdeep = s => edge(s) + side * (FACE + 40 * Math.sin(s * 0.013));
  if (D >= 0.5) {
    const rng = mulberry(T.N + 41);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fill(bandPath(T, s0, s1, s => (fdeep(s) + far(s)) / 2 - side * 30, far, 16));   // haze lighter further off
    for (let i = 0; i < (s1 - s0) / 9; i++) {   // tiny pines far below
      const s = s0 + rng() * (s1 - s0), f = rng(), o = fdeep(s) + (far(s) - fdeep(s)) * f; if (Math.abs(o) < Math.abs(fdeep(s)) + 10) continue;
      const [x, y] = at(T, s, o); circ(g, x + 2, y + 2, 4.5); g.fillStyle = 'rgba(30,45,70,0.35)'; g.fill(); circ(g, x, y, 4 + rng() * 2.5); g.fillStyle = rng() < 0.5 ? '#3d6a62' : '#4d7a70'; g.fill();
    }
    g.strokeStyle = '#c9dcef'; g.lineWidth = 9; g.beginPath();   // a frozen stream winding along the valley
    for (let s = s0; s <= s1; s += 20) { const o = fdeep(s) + (far(s) - fdeep(s)) * (0.55 + 0.15 * Math.sin(s * 0.004)); const [x, y] = at(T, s, o); s === s0 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
  }
  // the face: rock from the edge down to its foot, buttresses lit and shaded, gullies, snow on the ledges
  const face = bandPath(T, s0, s1, edge, fdeep, step);
  g.fillStyle = '#8b98aa'; g.fill(face);
  if (D >= 0.5) {
    g.save(); g.clip(face);
    const rng = mulberry(T.N + 77);
    for (let s = s0; s < s1; s += 22) {
      const w = 16 + rng() * 22, o0 = edge(s), o1 = fdeep(s) + side * 30;
      const [ax, ay] = at(T, s, o0), [bx, by] = at(T, s + w * 0.35, o1), [cx, cy] = at(T, s + w, o0);
      poly(g, [[ax, ay], [bx, by], [cx, cy]]); g.fillStyle = rng() < 0.5 ? '#a8b5c4' : '#97a5b6'; g.fill();
      const [dx, dy] = at(T, s + w + 5, o0), [ex, ey] = at(T, s + w * 0.6, o1);
      g.strokeStyle = 'rgba(35,50,78,0.5)'; g.lineWidth = 3; g.beginPath(); g.moveTo(dx, dy); g.lineTo(ex, ey); g.stroke();
      if (rng() < 0.55) { const [px, py] = at(T, s + w * 0.5, o0 + side * (18 + rng() * FACE * 0.6)); ell(g, px, py, 8 + rng() * 9, 3 + rng() * 3, rng()); g.fillStyle = '#f4f8fc'; g.fill(); }
    }
    g.fillStyle = 'rgba(30,45,80,0.32)'; g.fill(bandPath(T, s0, s1, s => (edge(s) + fdeep(s)) / 2, fdeep, 12));   // darker toward its foot
    g.restore();
    g.fillStyle = 'rgba(25,40,75,0.3)'; g.fill(bandPath(T, s0, s1, fdeep, s => fdeep(s) + side * 70, 12));   // the face's shadow on the valley
  }
  if (D >= 0.5) {   // wisps of cloud drifting below the shelf, over the face and the valley: you're high up
    const rng = mulberry(T.N + 91);
    for (let i = 0; i < (s1 - s0) / 260; i++) {
      const s = s0 + 120 + rng() * (s1 - s0 - 240), f = 0.15 + rng() * 0.6, o = fdeep(s) - side * 40 + (far(s) - fdeep(s) + side * 40) * f, len = 70 + rng() * 90;
      for (let j = 0; j < 4; j++) { const [x, y] = at(T, s + (j - 1.5) * len * 0.3, o + side * (rng() - 0.5) * 22); ell(g, x, y, len * (0.3 + rng() * 0.15), 11 + rng() * 9, Math.atan2(...(() => { const q = trackSample(T, s); return [q.ty, q.tx]; })())); g.fillStyle = `rgba(255,255,255,${0.42 + rng() * 0.2})`; g.fill(); }
    }
  }
  g.restore();
  // the cornice: a lip of snow along the edge
  g.fillStyle = '#ffffff'; g.fill(bandPath(T, s0, s1, s => edge(s) - side * 5, s => edge(s) + side * (7 + 4 * Math.sin(s * 0.04)), step));
  g.strokeStyle = 'rgba(90,120,165,0.6)'; g.lineWidth = D < 0.5 ? 14 : 2.5; g.stroke(bandPath(T, s0, s1, s => edge(s) + side * (7 + 4 * Math.sin(s * 0.04)), s => edge(s) + side * (7 + 4 * Math.sin(s * 0.04)), step));
}
// where props, landmarks and the forests keep off (T.keepOut, set before the ground): the Ledge's cirque, the Park,
// the Big Air's towers, the start hut, the lodge, the chairlift's stations
function keepOutOf(T) {
  const k = [], M = T.mech && T.mech.ski;
  if (M && M.ledge) { const z = M.ledge; for (let s = z.sN; s < z.sE; s += 50) { const t = clamp(Math.min((s - z.sN) / 500, (z.sE - s) / 500), 0, 1), r = 120 + VOID * t * 0.5; k.push([...at(T, s, z.side * (halfWAt(T, s) + VOID * t * 0.5)), r + 40]); } }
  if (M && M.park) { const z = M.park; for (let s = z.sN; s < z.sE; s += 80) k.push([...at(T, s, z.side * (halfWAt(T, s) + 60)), 110]); }
  for (const z of T.mech ? T.mech.cliffs : []) { const sT = z.sLip - 700, sJ = (z.sLand + z.sFlat) / 2; k.push([...at(T, sT, -halfWAt(T, sT) - 70), 90], [...at(T, sJ, halfWAt(T, sJ) + 90), 90]); }
  { const q = trackSample(T, 0); k.push([q.x - q.tx * 190, q.y - q.ty * 190, 140]); }
  k.push([...at(T, T.L - 120, -halfWAt(T, T.L - 120) - 260), 280]);
  if (T.mech && T.mech.cliffs.length) { const { A, B } = liftOf(T); k.push([...A, 90], [...B, 90]); }
  return k;
}

// ---------------------------------------------------------------- the piste (instead of track.js's tarmac)
export function skiRoad(g, T, D) {
  const L = T.L, hw = s => halfWAt(T, s);
  g.fillStyle = SNOW_SH; g.fill(bandPath(T, 0, L, s => -hw(s) - 26, s => hw(s) + 26, 24));   // soft banks either side
  g.fillStyle = '#ffffff'; g.fill(bandPath(T, 0, L, s => -hw(s) - 12, s => hw(s) + 12, 24));
  g.fillStyle = SNOW; g.fill(bandPath(T, 0, L, s => -hw(s), s => hw(s), 16));
  if (D < 0.5) return;
  g.save(); g.clip(bandPath(T, 0, L, s => -hw(s), s => hw(s), 16));
  // corduroy from the groomer on the narrow piste: fine lines along it, lit and shaded in turn
  g.lineWidth = 2;
  for (let o = -300; o <= 300; o += 12) {
    let on = false; g.beginPath();
    for (let s = 0; s <= L; s += 30) {
      const w = hw(s); if (w > 320 || Math.abs(o) > w - 4) { on = false; continue; }
      const [x, y] = at(T, s, o); on ? g.lineTo(x, y) : g.moveTo(x, y); on = true;
    }
    g.strokeStyle = (o / 12) % 2 ? 'rgba(170,195,222,0.28)' : 'rgba(255,255,255,0.7)'; g.stroke();
  }
  // the open fields: untouched powder in soft waves, and old ski tracks winding down them
  const rng = mulberry(T.N + 5);
  for (let i = 0; i < L / 25; i++) {
    const s = rng() * L, w = hw(s); if (w < 320) continue;
    const [x, y] = at(T, s, (rng() * 2 - 1) * w), r = 60 + rng() * 140;
    g.fillStyle = radial(g, x, y, 0, x, y, r, [[0, 'rgba(170,196,222,0.16)'], [1, 'rgba(170,196,222,0)']]); circ(g, x, y, r); g.fill();
  }
  g.lineCap = 'round';
  for (let i = 0; i < L / 600; i++) {
    let s = rng() * L; const w = hw(s); if (w < 320) continue;
    let o = (rng() * 2 - 1) * w * 0.8; const ph = rng() * TAU, amp = 30 + rng() * 60;
    for (const e of [-3, 3]) { g.beginPath(); for (let k = 0; k < 40; k++) { const ss = s + k * 18, [x, y] = at(T, ss, o + Math.sin(ph + k * 0.35) * amp + e); k ? g.lineTo(x, y) : g.moveTo(x, y); } g.strokeStyle = 'rgba(150,178,208,0.35)'; g.lineWidth = 1.6; g.stroke(); }
  }
  g.restore();
}

// ---------------------------------------------------------------- the set pieces (draw-mechanics.js static)
// D under 0.5 (the menu's thumbnail): the same pieces, bold and simple (trees as dark dots, the poles as red and blue
// dots, the pipe as a blue channel, the cirque dark), with the piste's edges outlined
export function skiStatic(g, T, A, D, drawRamp) {
  const M = T.mech.ski, rng = mulberry(T.N * 3 + 1), thumb = D < 0.5;
  if (thumb) {   // the piste's edges
    g.strokeStyle = '#bccde0'; g.lineWidth = 16;
    for (const sd of [-1, 1]) { g.beginPath(); for (let s = 0; s <= T.L; s += 40) { const [x, y] = at(T, s, sd * (halfWAt(T, s) + 10)); s ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  }
  for (const z of M.zones) if (z.kind === 'moguls') moguls(g, T, z, thumb);
  if (M.ledge) { ledgeVoid(g, T, M.ledge, D); ledgeWall(g, T, M.ledge, thumb); }
  if (M.park) park(g, T, M.park, thumb);
  // piste poles along both edges (orange on the left as you go down, blue on the right)
  if (!thumb) for (let s = 200; s < T.finishS; s += 170) { const w = halfWAt(T, s); for (const sd of [-1, 1]) { if (M.ledge && sd === M.ledge.side && s > M.ledge.sN - 20 && s < M.ledge.sE + 20) continue; const [x, y] = at(T, s, sd * (w + 8)); pole(g, x, y, sd < 0 ? '#ff7a1a' : '#2f6fd6'); } }
  // the trees, back to front: shadows first, then the trees
  const all = M.zones.filter(z => z.kind === 'glade' || z.kind === 'forest').flatMap(z => z.trees).sort((a, b) => a.y - b.y);
  if (thumb) for (const t of all) { circ(g, t.x, t.y, t.r * 2.4); g.fillStyle = '#4f8f6c'; g.fill(); }
  else { for (const t of all) pine(g, t.x, t.y, t.r * 1.32, rng, true); for (const t of all) pine(g, t.x, t.y, t.r * 1.32, rng); }
  for (const z of M.zones) if (z.kind === 'slalom') slalom(g, T, z, thumb);
  // the splits' signs at the islands' noses (a black diamond for the Ledge: experts only; the park's rainbow)
  if (!thumb) for (const z of [M.ledge, M.park]) if (z) { splitCues(g, T, z); const L = z.lane(z.sN + 40), [nx, ny] = at(T, z.sN - 40, (L.in + L.far) / 2), q = trackSample(T, z.sN - 40), lx = q.nx * z.side * 30, ly = q.ny * z.side * 30; sign(g, nx + lx, ny + ly, z.kind); sign(g, nx - lx, ny - ly, 'piste'); }   // (each sign on its own way's side)
  // the Big Air
  for (const z of T.mech.cliffs) bigAir(g, T, z, A, drawRamp, thumb);   // (its own kicker, not drawRamp's)
  if (thumb) return;
  // the start hut and the finish arch
  startHut(g, T); finishArch(g, T); lodge(g, T); chairlift(g, T, false);
}
// the splits' colours: each lane's own (the Park orange like its net, the Ledge slate like its rock) and the piste's blue
export const SPLIT_COL = { park: '#ff7a1a', ledge: '#3c4254', piste: '#2f6fd6' };
// coming up to a split (race-ski.js SPLIT): which way the drift takes you, painted on the snow. The piste splits along
// the line to the island's nose into two halves, each tinted its way's colour; in each half chevrons lead on to its way
// (the lane's lean toward it) and a disc says how to get there: the lane's the drift button's curved arrow (with drift
// off, the lift's arrow), the piste's a plain arrow straight on; and the commit line across the piste where it's
// decided, a flag either side in each way's colour. Beside the nose, the signs (sign)
function splitCues(g, T, z) {
  const side = z.side, sA = z.sDec + 40, sB = z.sN, sL = z.sLock, hw = s => halfWAt(T, s), Ln = z.lane(z.sN + 40), d1 = (Ln.in + Ln.far) / 2;
  const div = s => d1 * smooth(sA, sB - 120, s), lc = SPLIT_COL[z.kind], pc = SPLIT_COL.piste, flat = bold();
  // the two halves, fading in
  { const [x0, y0] = at(T, sA, 0), [x1, y1] = at(T, sA + 320, 0), [x2, y2] = at(T, sB - 60, 0), [x3, y3] = at(T, sB + 40, 0);
    const fill = (col, o) => { const L = Math.hypot(x3 - x0, y3 - y0), f1 = Math.hypot(x1 - x0, y1 - y0) / L, f2 = Math.hypot(x2 - x0, y2 - y0) / L;
      g.fillStyle = linear(g, x0, y0, x3, y3, [[0, alpha(col, 0)], [f1, alpha(col, 0.15)], [f2, alpha(col, 0.15)], [1, alpha(col, 0.05)]]); g.fill(bandPath(T, sA, sB + 40, s => div(s), o, 12)); };
    fill(lc, s => side * (hw(s) - 6)); fill(pc, s => -side * (hw(s) - 6)); }
  // the line between them, dashed, on to the nose
  for (let s = sA + 80; s < sB - 10; s += 44) { g.fillStyle = flat ? alpha(BK.ink || '#14102a', 0.5) : 'rgba(255,255,255,0.95)'; g.fill(bandPath(T, s, Math.min(sB, s + 24), s2 => div(s2) - 3, s2 => div(s2) + 3, 6)); }
  // chevrons in each half, pointing on to its way (the lane's leaning over toward it)
  const chev = (s, lat, lean, col) => {
    const q = trackSample(T, s), ux = q.tx + q.nx * lean, uy = q.ty + q.ny * lean, l = Math.hypot(ux, uy), tx = ux / l, ty = uy / l, nx = -ty, ny = tx, [cx, cy] = at(T, s, lat), w = 26, k = 14;
    const P = [[k, 0], [-k * 0.4, w], [-k * 1.5, w], [-k * 0.1, 0], [-k * 1.5, -w], [-k * 0.4, -w]].map(([f, o]) => [cx + tx * f + nx * o, cy + ty * f + ny * o]);
    poly(g, P); g.fillStyle = alpha(col, 0.55); g.fill(); if (flat) { g.strokeStyle = alpha(BK.ink || '#14102a', 0.35); g.lineWidth = 1.5; g.stroke(); }
  };
  for (let s = sA + 230; s < sL - 30; s += 150) {
    const lw = side * hw(s) - div(s);
    chev(s, div(s) + lw * 0.5, side * 0.45 * smooth(sA, sL, s), lc);
    chev(s, div(s) - lw * 0.5, -side * 0.1, pc);
  }
  // the discs saying how: drift (the curved arrow) for the lane, straight on for the piste
  for (const s of [sA + 120, sL - 120]) {
    const lw = side * hw(s) - div(s), [lx, ly] = at(T, s, div(s) + lw * 0.5), [px, py] = at(T, s, div(s) - lw * 0.5);
    snowDisc(g, lx, ly, lc, 'drift', flat); { const q = trackSample(T, s); snowDisc(g, px, py, pc, 'straight', flat, 1, Math.atan2(q.ty, q.tx) + Math.PI / 2); }   // (the plain arrow points on down the piste)
    { const q = trackSample(T, s); snowDisc(g, lx + q.tx * 66, ly + q.ty * 66, '#ffffff', z.kind, flat, 0.9); }   // (and the lane's own mark beside it)
  }
  // the commit line: blocks across the piste in each way's colour, and a flag at each edge
  for (let o = -hw(sL) + 10, k = 0; o < hw(sL) - 10; o += 22, k++) {
    if (k % 2) continue;
    const col = (o - div(sL)) * side > 0 ? lc : pc; g.fillStyle = alpha(col, 0.85); g.fill(bandPath(T, sL - 9, sL + 9, o, Math.min(o + 16, hw(sL) - 10), 6));
  }
  for (const sd of [-1, 1]) { const [x, y] = at(T, sL, sd * (hw(sL) + 12)); banner(g, x, y, sd === side ? lc : pc, flat); }
}
// a disc painted on the snow: the drift button's curved arrow, a plain arrow straight on, or a lane's mark
function snowDisc(g, x, y, col, k, flat, a = 1, rot = 0) {
  const r = 24; g.save(); g.globalAlpha = a; g.translate(x, y); g.scale(1.3, 1.3);
  if (!flat) { circ(g, 2, 3, r); g.fillStyle = 'rgba(40,60,100,0.18)'; g.fill(); }
  circ(g, 0, 0, r); g.fillStyle = col; g.fill(); g.lineWidth = flat ? 3 : 2.5; g.strokeStyle = flat ? (BK.ink || '#14102a') : '#ffffff'; g.stroke();
  g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff'; g.lineWidth = 4.5; g.lineCap = 'round';
  if (k === 'drift') { g.beginPath(); g.arc(-2.5, 6, 12, -Math.PI * 0.95, -Math.PI * 0.2); g.stroke(); poly(g, [[11, -4.5], [2.5, -9.5], [7, 2]]); g.fill(); }
  else if (k === 'lift') { g.beginPath(); g.moveTo(0, 10); g.lineTo(0, -4); g.stroke(); poly(g, [[-8, -2], [0, -12], [8, -2]]); g.fill(); }
  else if (k === 'straight') { g.rotate(rot); g.beginPath(); g.moveTo(0, 12); g.lineTo(0, -3); g.stroke(); poly(g, [[-9, -1], [0, -13], [9, -1]]); g.fill(); }
  else if (k === 'park') { for (const [rr, c] of [[15, '#e8392b'], [11, '#ffc93c'], [7, '#3fd68b']]) { g.beginPath(); g.arc(0, 6, rr, Math.PI, 0); g.lineWidth = 3.5; g.strokeStyle = c; g.stroke(); } }
  else if (k === 'flip') { g.lineWidth = 4; for (let j = 0; j < 3; j++) { const a0 = -Math.PI / 2 + j * TAU / 3 + 0.3, a1 = a0 + TAU / 3 - 0.6; g.beginPath(); g.arc(0, 0, 13, a0, a1); g.stroke(); } g.beginPath(); g.roundRect(-6, -2.5, 12, 5, 2); g.fill(); }
  else if (k === 'ledge') { g.fillStyle = '#1b1d24'; for (const dx of [-7, 7]) { poly(g, [[dx, -10], [dx + 7, 0], [dx, 10], [dx - 7, 0]]); g.fill(); } }
  g.restore();
}
// a tall banner flag on a pole (the commit line's)
function banner(g, x, y, col, flat) {
  g.strokeStyle = SHADOW; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30, y + 18); g.stroke();
  g.strokeStyle = '#3a3f48'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 54); g.stroke();
  g.beginPath(); g.moveTo(x, y - 54); g.quadraticCurveTo(x + 16, y - 50, x + 13, y - 34); g.quadraticCurveTo(x + 10, y - 20, x + 2, y - 14); g.lineTo(x, y - 14); g.closePath();
  g.fillStyle = col; g.fill(); if (flat) { g.strokeStyle = BK.ink || '#14102a'; g.lineWidth = 2; g.stroke(); }
}
// a split's sign beside the island's nose: a board on a post, rimmed in its way's colour, the way's mark on top (the
// Park's rainbow, the Ledge's black diamonds, the piste's red disc) and how to get there under it (the drift's curved
// arrow, or a plain arrow straight on)
function sign(g, x, y, k) {
  const col = SPLIT_COL[k], flat = bold();
  g.fillStyle = SHADOW; g.fillRect(x - 3 + 12, y + 4, 6, 14);
  g.fillStyle = '#5b4636'; g.fillRect(x - 3, y - 40, 6, 44);
  g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(x - 22, y - 92, 44, 58, 7); g.fill(); g.strokeStyle = flat ? (BK.ink || '#14102a') : col; g.lineWidth = flat ? 2.5 : 3; g.stroke();
  if (flat) { g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); g.roundRect(x - 18.5, y - 88.5, 37, 51, 5); g.stroke(); }
  if (k === 'ledge') { g.fillStyle = '#1b1d24'; for (const dx of [-7, 7]) poly(g, [[x + dx, y - 85], [x + dx + 6, y - 76], [x + dx, y - 67], [x + dx - 6, y - 76]]), g.fill(); }
  else if (k === 'park') { for (const [r, c] of [[12, '#e8392b'], [9, '#ffc93c'], [6, '#3fd68b'], [3, '#2f6fd6']]) { g.beginPath(); g.arc(x, y - 70, r, Math.PI, 0); g.lineWidth = 3; g.strokeStyle = c; g.stroke(); } }
  else { circ(g, x, y - 76, 9); g.fillStyle = '#e8392b'; g.fill(); }
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 3.5; g.lineCap = 'round';
  if (k === 'piste') { g.beginPath(); g.moveTo(x, y - 41); g.lineTo(x, y - 54); g.stroke(); poly(g, [[x - 7, y - 52], [x, y - 61], [x + 7, y - 52]]); g.fill(); }
  else { g.beginPath(); g.arc(x - 2, y - 46, 9, -Math.PI * 0.95, -Math.PI * 0.2); g.stroke(); poly(g, [[x + 8.5, y - 53], [x + 2, y - 57], [x + 5, y - 47]]); g.fill(); }
}
// the Ledge: the rock wall on its uphill side (the island: a band of rock rising from the shelf up to the piste, its
// face shaded, snow on top), a rope on posts along the shelf's wall side, and the shelf groomed in fine lines
function ledgeWall(g, T, z, thumb) {
  const side = z.side, s0 = z.sN, s1 = z.sE, L = s => z.lane(s), step = thumb ? 40 : 10;
  const band = bandPath(T, s0, s1, s => L(s).in, s => L(s).far, step);
  g.fillStyle = thumb ? '#a39a92' : '#6e655f'; g.fill(band);
  if (thumb) return;
  // the rock wall up to the piste: a solid wall of warm grey boulders (cartoon rocks, each lit on its top left and
  // shaded on its bottom right, some with a cap of snow), much warmer and chunkier than the blue face of the drop on the
  // other side, a cornice of snow along its top and its shadow across the foot of the shelf
  g.fillStyle = 'rgba(30,50,90,0.22)'; g.fill(bandPath(T, s0 + 40, s1, s => L(s).in - side * 18, s => L(s).in, 12));   // its shadow on the shelf
  g.save(); g.clip(band);
  const rng = mulberry(T.N + 63), TONES = ['#a2968c', '#958a81', '#ab9f94', '#8c8178'];
  for (const f of [0.2, 0.55, 0.85]) for (let s = s0 + rng() * 20; s < s1; s += 24 + rng() * 16) {
    const q = L(s), o = q.in + (q.far - q.in) * (f + (rng() - 0.5) * 0.12), [x, y] = at(T, s, o), r = 13 + rng() * 9 + (f > 0.5 ? 0 : 3), a = rng() * TAU;
    const P = []; for (let i = 0; i < 7; i++) { const t = a + i * TAU / 7, rr = r * (0.8 + rng() * 0.3); P.push([x + Math.cos(t) * rr, y + Math.sin(t) * rr * 0.85]); }
    poly(g, P.map(([px, py]) => [px + 3, py + 4])); g.fillStyle = 'rgba(40,30,30,0.35)'; g.fill();   // its shadow
    poly(g, P); g.fillStyle = TONES[Math.floor(rng() * TONES.length)]; g.fill();
    circ(g, x - r * 0.3, y - r * 0.32, r * 0.42); g.fillStyle = 'rgba(255,255,255,0.22)'; g.fill();   // lit top left
    if (rng() < 0.35) { ell(g, x - r * 0.15, y - r * 0.45, r * 0.6, r * 0.3, -0.3); g.fillStyle = '#f4f8fc'; g.fill(); }   // a cap of snow
  }
  g.restore();
  g.fillStyle = '#ffffff'; g.fill(bandPath(T, s0, s1, s => L(s).far + side * 4, s => L(s).far - side * (10 + 5 * Math.sin(s * 0.05)), step));   // the cornice along its top
  g.strokeStyle = 'rgba(110,135,175,0.55)'; g.lineWidth = 2; g.stroke(bandPath(T, s0, s1, s => L(s).far - side * (10 + 5 * Math.sin(s * 0.05)), s => L(s).far - side * (10 + 5 * Math.sin(s * 0.05)), step));
  // the shelf: groomed lines along it
  g.lineWidth = 1.5;
  for (const f of [-0.3, 0, 0.3]) { g.strokeStyle = f ? 'rgba(170,195,222,0.45)' : 'rgba(255,255,255,0.9)'; g.beginPath(); for (let s = s0 + 30; s <= s1; s += 20) { const q = L(s), [x, y] = at(T, s, q.mid + side * f * z.laneW); s === s0 + 30 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); }
  // the rope on posts, along the wall
  const posts = []; for (let s = s0 + 60; s < s1 - 20; s += 64) posts.push(at(T, s, L(s).in + side * 5));
  g.strokeStyle = '#e8392b'; g.lineWidth = 2; g.beginPath(); posts.forEach(([x, y], i) => { const yy = y - 14; if (!i) g.moveTo(x, yy); else { const [px, py] = posts[i - 1]; g.quadraticCurveTo((x + px) / 2, (yy + py - 14) / 2 + 5, x, yy); } }); g.stroke();
  for (const [x, y] of posts) { g.strokeStyle = SHADOW; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8, y + 5); g.stroke(); g.strokeStyle = '#4a3a2c'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 18); g.stroke(); }
}
// the Park: a snow berm and an orange net along its fence, the box, the halfpipe (walls shaded by height, the coping,
// the flat bottom), quarter pipes and a rail by the way out, and a banner over the way in (the kickers are drawRamp's)
function park(g, T, z, thumb) {
  const side = z.side, sN = z.sN, L = s => z.lane(s), step = thumb ? 40 : 10;
  const p0 = sN + PARK.PIPE[0], p1 = sN + PARK.PIPE[1], W0 = 46, W1 = 126;
  // the halfpipe: from the coping in to the flat bottom, each wall in bands lighter (sunny, + toward the top left) or darker
  const rise = s => clamp(Math.min((s - p0) / 140, (p1 - s) / 140), 0, 1);
  g.fillStyle = '#dfe9f3'; g.fill(bandPath(T, p0, p1, s => L(s).mid - (W1 + 12) * rise(s), s => L(s).mid + (W1 + 12) * rise(s), step));   // the deck
  if (thumb) { g.fillStyle = '#9dbbdb'; g.fill(bandPath(T, p0, p1, s => L(s).mid - W1 * rise(s), s => L(s).mid + W1 * rise(s), step)); }
  else {
    g.fillStyle = 'rgba(70,100,140,0.25)'; g.fill(bandPath(T, p0 + 20, p1, s => L(s).mid + (W1 + 12) * rise(s), s => L(s).mid + (W1 + 30) * rise(s), step));   // the deck's shadow on the snow (it stands up off it)
    for (const sd of [-1, 1]) {
      const lit = sd * side < 0;   // (which wall faces the sun: the park lies on the north side, the sun's in the top left)
      for (let k = 0; k < 8; k++) {   // from the flat bottom up to the coping, steeper and steeper: lit walls brighter, shaded walls deeper blue
        const a = W0 + (W1 - W0) * k / 8, b = W0 + (W1 - W0) * (k + 1) / 8, f = ((k + 0.5) / 8) ** 1.4;
        g.fillStyle = lit ? mix('#eef4fa', '#ffffff', f) : mix('#d5e2ef', '#7f9fc4', f);
        g.fill(bandPath(T, p0, p1, s => L(s).mid + sd * (W0 + (a - W0) * rise(s)), s => L(s).mid + sd * (W0 + (b - W0) * rise(s)), step));
      }
      g.strokeStyle = 'rgba(90,120,165,0.35)'; g.lineWidth = 2; g.stroke(bandPath(T, p0 + 30, p1 - 30, s => L(s).mid + sd * W0, s => L(s).mid + sd * W0, step));   // where the wall starts to curve up
      g.strokeStyle = '#46658c'; g.lineWidth = 5; g.stroke(bandPath(T, p0 + 40, p1 - 40, s => L(s).mid + sd * W1 * rise(s), s => L(s).mid + sd * W1 * rise(s), step));   // the coping
      g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.stroke(bandPath(T, p0 + 40, p1 - 40, s => L(s).mid + sd * (W1 * rise(s) - 3), s => L(s).mid + sd * (W1 * rise(s) - 3), step));
    }
  }
  if (!thumb) {
    g.fillStyle = '#f2f7fc'; g.fill(bandPath(T, p0, p1, s => L(s).mid - W0, s => L(s).mid + W0, step));   // the flat bottom
    g.strokeStyle = 'rgba(120,150,190,0.4)'; g.lineWidth = 2; g.beginPath();   // old tracks, wall to wall
    for (let s = p0 + 60; s < p1 - 60; s += 12) { const [x, y] = at(T, s, L(s).mid + Math.sin((s - p0) / 580 * Math.PI) * 70); s === p0 + 60 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
  }
  // the box: a long low wooden box with a shiny top, down the middle
  const b0 = sN + PARK.BOX[0] - 20, b1 = sN + PARK.BOX[1] + 10, bw = 14;
  if (!thumb) g.fillStyle = SHADOW, g.fill(bandPath(T, b0, b1, s => L(s).mid - bw + 6, s => L(s).mid + bw + 10, 10));
  g.fillStyle = '#8a6440'; g.fill(bandPath(T, b0, b1, s => L(s).mid - bw, s => L(s).mid + bw, 10));
  g.fillStyle = '#d7dde5'; g.fill(bandPath(T, b0 + 4, b1 - 4, s => L(s).mid - bw + 4, s => L(s).mid + bw - 4, 10));
  if (thumb) return;
  g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.stroke(bandPath(T, b0 + 6, b1 - 6, s => L(s).mid - 3, s => L(s).mid - 3, 10));
  // the fence: a snow berm along the island and an orange net on posts
  const fence = s => L(s).in - side * 4;
  g.fillStyle = '#ffffff'; g.fill(bandPath(T, sN + 20, z.sE, s => L(s).in, s => L(s).far, 12));
  g.strokeStyle = '#ff7a1a'; g.lineWidth = 3; g.beginPath(); for (let s = sN + 30; s <= z.sE; s += 20) { const [x, y] = at(T, s, fence(s)); s === sN + 30 ? g.moveTo(x, y - 12) : g.lineTo(x, y - 12); } g.stroke();
  for (let s = sN + 30; s <= z.sE; s += 80) { const [x, y] = at(T, s, fence(s)); g.strokeStyle = '#3a3f48'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 18); g.stroke(); }
  // a banner over the way in: two poles and a strip of colours
  const sB = sN + 120, [ax, ay] = at(T, sB, L(sB).edge), [bx, by] = at(T, sB, L(sB).in);
  for (const [x, y] of [[ax, ay], [bx, by]]) { g.strokeStyle = SHADOW; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 24, y + 14); g.stroke(); g.strokeStyle = '#3a3f48'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 44); g.stroke(); }
  ['#e8392b', '#ffc93c', '#3fd68b', '#2f6fd6'].forEach((c, i) => { g.strokeStyle = c; g.lineWidth = 3; g.beginPath(); g.moveTo(ax, ay - 44 + i * 3); g.lineTo(bx, by - 44 + i * 3); g.stroke(); });
  // by the way out, beyond the lane's edge: two quarter pipes and a rainbow rail (for show)
  for (const [d, o, w] of [[PARK.BIG + 160, 70, 90], [PARK.KICK + 40, 80, 70]]) {
    const s = sN + d, e = s => L(s).edge + side * o;
    for (let k = 0; k < 5; k++) { g.fillStyle = mix('#ffffff', '#a9bfd8', k / 5); g.fill(bandPath(T, s, s + w, s2 => e(s2) + side * k * 9, s2 => e(s2) + side * (k + 1) * 9, 8)); }
    g.strokeStyle = '#5d7ea6'; g.lineWidth = 3; g.stroke(bandPath(T, s, s + w, s2 => e(s2) + side * 45, s2 => e(s2) + side * 45, 8));
  }
  { const s = sN + PARK.WALLS[1], [x0, y0] = at(T, s, L(s).edge + side * 60), [x1, y1] = at(T, s + 160, L(s + 160).edge + side * 60);
    g.strokeStyle = SHADOW; g.lineWidth = 4; g.beginPath(); g.moveTo(x0 + 8, y0 + 10); g.quadraticCurveTo((x0 + x1) / 2 + 8, (y0 + y1) / 2 - 10, x1 + 8, y1 + 10); g.stroke();
    ['#e8392b', '#ffc93c', '#2f6fd6'].forEach((c, i) => { g.strokeStyle = c; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x0, y0 - 8 - i * 2); g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 - 30 - i * 2, x1, y1 - 8 - i * 2); g.stroke(); });
  }
}
// the Slalom: a tall pole at each gate, red and blue in turn, a little flag on each
function slalom(g, T, z, thumb) {
  for (const t of z.trees) {
    const col = t.k % 2 ? '#2f6fd6' : '#e8392b';
    if (thumb) { circ(g, t.x, t.y, 30); g.fillStyle = col; g.fill(); continue; }
    g.strokeStyle = SHADOW; g.lineWidth = 6; g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(t.x + 44, t.y + 24); g.stroke();
    ell(g, t.x, t.y, 9, 5); g.fillStyle = 'rgba(255,255,255,0.9)'; g.fill();
    for (let k = 0; k < 6; k++) { g.strokeStyle = k % 2 ? '#f6f8fb' : col; g.lineWidth = 6; g.beginPath(); g.moveTo(t.x, t.y - k * 11); g.lineTo(t.x, t.y - (k + 1) * 11); g.stroke(); }
    const dir = -t.sd;   // (the flag flies toward the middle of the piste)
    poly(g, [[t.x, t.y - 66], [t.x + dir * 30, t.y - 61], [t.x + dir * 30, t.y - 42], [t.x, t.y - 46]]); g.fillStyle = col; g.fill(); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.2; g.stroke();
    circ(g, t.x, t.y - 67, 3.5); g.fillStyle = '#ffffff'; g.fill();
  }
}
// the Moguls: rows of round snow bumps, each lit on its sunny side and shaded on the other
function moguls(g, T, z, thumb) {
  for (const b of z.bumps) {
    if (thumb) { circ(g, b.x + 4, b.y + 5, b.r * 0.9); g.fillStyle = 'rgba(80,110,150,0.32)'; g.fill(); continue; }
    ell(g, b.x + b.r * 0.32, b.y + b.r * 0.38, b.r * 0.95, b.r * 0.7); g.fillStyle = 'rgba(80,110,150,0.25)'; g.fill();
    ell(g, b.x, b.y, b.r * 0.92, b.r * 0.72); g.fillStyle = '#e4edf6'; g.fill();
    ell(g, b.x - b.r * 0.22, b.y - b.r * 0.2, b.r * 0.6, b.r * 0.45); g.fillStyle = '#ffffff'; g.fill();
  }
}
// the ski jump: a proper big-air kicker. The inrun down to it walled in by snow banks with timber boards and strung
// with bunting, two grooves down its middle; the kicker a sculpted snow ramp (its top groomed and lit, its side wall
// and the face under its lip in blue shade, its shadow cast down the hill, a bright lip with a red dye line and a tall
// flag at each end); the knoll falling away under the flight, the knuckle marked by a line of green spruce branches,
// the landing hill washed blue with dyed distance lines, the green line where the clean landings start and the red K
// line, banked and strung with bunting down both sides; the inrun tower and the judges' tower
const KICK_L = 124, KICK_H = 26;   // (the kicker's length and height: race-cliff.js's lip, art/track.js rampsOf)
const kickZ = d => d <= -KICK_L || d > 0 ? 0 : KICK_H * Math.pow((d + KICK_L) / KICK_L, 1.7);
function bigAir(g, T, z, A, drawRamp, thumb) {
  const hw = s => halfWAt(T, s), flat = bold(), ink = BK.ink || '#14102a', sL = z.sLip, sI = sL - 640;
  // the knoll and the landing hill: a steeper, shaded face from the lip to the flat, the landing area washed blue
  g.fillStyle = 'rgba(120,150,190,0.24)'; g.fill(bandPath(T, sL, z.sLand, s => -hw(s), s => hw(s)));
  g.fillStyle = 'rgba(110,160,220,0.14)'; g.fill(bandPath(T, z.sLand, z.sFlat, s => -hw(s), s => hw(s)));
  if (!thumb) {   // banks along both sides of the inrun and the landing hill, and the inrun's grooves
    for (const [a, b] of [[sI, sL - 4], [sL + 30, z.sFlat + 120]]) for (const sd of [-1, 1]) {
      g.fillStyle = 'rgba(90,120,165,0.28)'; g.fill(bandPath(T, a, b, s => sd * (hw(s) + 4), s => sd * (hw(s) + 30), 12));   // the bank's shade
      g.fillStyle = '#ffffff'; g.fill(bandPath(T, a, b, s => sd * (hw(s) + 2), s => sd * (hw(s) + 22), 12));
      g.fillStyle = '#8a6440'; g.fill(bandPath(T, a, b, s => sd * (hw(s) - 1), s => sd * (hw(s) + 4), 12));   // its timber board
      if (flat) { g.strokeStyle = alpha(ink, 0.5); g.lineWidth = 1.5; g.stroke(bandPath(T, a, b, s => sd * (hw(s) + 4), s => sd * (hw(s) + 4), 12)); }
    }
    g.lineCap = 'round';
    for (const o of [-22, 22]) { g.strokeStyle = 'rgba(120,155,200,0.5)'; g.lineWidth = 7; g.beginPath(); for (let s = sI + 20; s <= sL - KICK_L; s += 20) { const [x, y] = at(T, s, o); s === sI + 20 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2; g.stroke(); }
    // bunting on posts down both sides
    for (const [a, b] of [[sI + 40, sL - 30], [sL + 120, z.sFlat + 100]]) for (const sd of [-1, 1]) {
      const P = []; for (let s = a; s <= b; s += 120) P.push(at(T, s, sd * (hw(s) + 30)));
      for (const [x, y] of P) { g.strokeStyle = SHADOW; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20, y + 12); g.stroke(); g.strokeStyle = '#4a3a2c'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 30); g.stroke(); }
      for (let i = 1; i < P.length; i++) {
        const [x0, y0] = P[i - 1], [x1, y1] = P[i], sag = 10, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 - 30 + sag;
        g.strokeStyle = '#3a3f48'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x0, y0 - 30); g.quadraticCurveTo(cx, cy, x1, y1 - 30); g.stroke();
        for (let k = 1; k < 7; k++) {
          const u = k / 7, px = (1 - u) * (1 - u) * x0 + 2 * u * (1 - u) * cx + u * u * x1, py = (1 - u) * (1 - u) * (y0 - 30) + 2 * u * (1 - u) * cy + u * u * (y1 - 30);
          poly(g, [[px - 5, py], [px + 5, py], [px, py + 11]]); g.fillStyle = ['#e8392b', '#ffc93c', '#2f6fd6', '#3fd68b'][(k + i) % 4]; g.fill();
        }
      }
    }
    // painted on the inrun twice: the drift button's curved arrow and a flip ring (press it in the air to flip)
    for (const d of [-520, -300]) { const s = sL + d, q = trackSample(T, s), nx = q.nx * 36, ny = q.ny * 36, [x, y] = at(T, s, 0); snowDisc(g, x + nx, y + ny, '#8e5cf0', 'drift', flat); snowDisc(g, x - nx, y - ny, '#8e5cf0', 'flip', flat); }
    // the knuckle: a line of green spruce branches across the hill, where it starts to fall away steeply
    const sK = sL + (z.sLand - sL) * 0.55, rng = mulberry(T.N + 13);
    for (let o = -hw(sK) + 10; o < hw(sK) - 6; o += 16) { const [x, y] = at(T, sK, o + (rng() - 0.5) * 4); g.strokeStyle = '#2c7350'; g.lineWidth = 4; g.beginPath(); g.moveTo(x - 6, y - 2); g.lineTo(x + 6, y + 2); g.stroke(); g.strokeStyle = '#3f8d62'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 3, y - 4); g.lineTo(x + 2, y + 3); g.stroke(); }
  }
  // the landing hill's dyed distance lines, the green line where the clean landings start, the red K line at its foot
  for (let s = z.sLand, k = 0; s <= z.sFlat + 1; s += (z.sFlat - z.sLand) / 6, k++) {
    const K = s > z.sFlat - 2, w = hw(s);
    if (K || thumb) { const [a, b] = [at(T, s, -w), at(T, s, w)]; g.strokeStyle = K ? '#e8392b' : 'rgba(47,111,214,0.55)'; g.lineWidth = K ? 6 : 3; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); continue; }
    if (!k) continue;
    for (let o = -w + 6; o < w - 6; o += 26) { g.fillStyle = 'rgba(47,111,214,0.6)'; g.fill(bandPath(T, s - 3, s + 3, o, Math.min(o + 16, w - 6), 6)); }   // (dyed, in dashes)
    for (const sd of [-1, 1]) { const [x, y] = at(T, s, sd * (w + 12)); g.fillStyle = SHADOW; g.fillRect(x + 2, y - 2, 10, 5); g.fillStyle = '#2f6fd6'; g.fillRect(x - 3, y - 20, 6, 20); g.fillStyle = '#ffffff'; g.fillRect(x - 3, y - 20, 6, 5); }   // (a marker board each side)
  }
  { const [a, b] = [at(T, z.sLand, -hw(z.sLand)), at(T, z.sLand, hw(z.sLand))]; g.strokeStyle = '#2fbf62'; g.lineWidth = 6; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
  kicker(g, T, z, thumb);
  if (thumb) return;
  // the inrun tower: a tall timber frame at the top of the run-up, with a little start cabin
  const sT = sL - 700, [tx, ty] = at(T, sT, -hw(sT) - 70);
  g.fillStyle = SHADOW; g.fillRect(tx + 20, ty + 10, 60, 26);
  g.fillStyle = '#8a6440'; g.fillRect(tx - 22, ty - 70, 44, 80); g.fillStyle = '#a97f52'; for (let k = 0; k < 5; k++) g.fillRect(tx - 22, ty - 64 + k * 16, 44, 4);
  g.fillStyle = '#d8342c'; poly(g, [[tx - 28, ty - 70], [tx, ty - 92], [tx + 28, ty - 70]]); g.fill(); g.fillStyle = '#ffffff'; poly(g, [[tx - 28, ty - 70], [tx, ty - 92], [tx - 8, ty - 70]]); g.fill();
  // the judges' tower beside the landing hill
  const sJ = (z.sLand + z.sFlat) / 2, [jx, jy] = at(T, sJ, hw(sJ) + 90);
  g.fillStyle = SHADOW; g.fillRect(jx + 14, jy + 8, 50, 22);
  g.fillStyle = '#e9edf2'; g.fillRect(jx - 20, jy - 56, 40, 60); g.fillStyle = '#7fb6e6'; g.fillRect(jx - 16, jy - 50, 32, 14);
  g.fillStyle = '#2f6fd6'; g.fillRect(jx - 24, jy - 62, 48, 8);
  for (const sd of [-1, 1]) { const [fx, fy] = at(T, z.sFlat + 40, sd * (hw(z.sFlat) + 30)); flag(g, fx, fy, '#e8392b', sd); }
}
// the kicker itself: sculpted snow, lit from the top left
function kicker(g, T, z, thumb) {
  const sL = z.sLip, flat = bold(), ink = BK.ink || '#14102a', w = s => halfWAt(T, s) - 2, ds = [];
  for (let d = -KICK_L; d <= 0.01; d += 4) ds.push(d);
  const P = (d, o, up = 1) => { const [x, y] = at(T, sL + d, o); return [x, y - kickZ(d) * up]; };
  const sh = (d, o) => { const [x, y] = at(T, sL + d, o), h = kickZ(d); return [x + h * 1.5, y + h * 2.1]; };
  // its shadow down the hill (the top cast down and to the right)
  for (const [k, a] of [[1.12, 0.1], [1, 0.16]]) { poly(g, [...ds.map(d => sh(d, w(sL + d) * k)), ...ds.slice().reverse().map(d => sh(d, -w(sL + d) * k))]); g.fillStyle = `rgba(40,65,110,${a})`; g.fill(); }
  // the side wall that faces down the screen, and the face under the lip
  const q = trackSample(T, sL - KICK_L / 2);
  for (const sd of [-1, 1]) {
    if (q.ny * sd < 0.02) continue;
    const foot = ds.map(d => P(d, sd * w(sL + d), 0)), top = ds.map(d => P(d, sd * w(sL + d)));
    poly(g, [...foot, ...top.slice().reverse()]); g.fillStyle = '#b5cbe2'; g.fill();
    if (flat) { g.strokeStyle = ink; g.lineWidth = 2; g.stroke(); }
  }
  const ql = trackSample(T, sL);
  if (ql.ty > 0.02) {
    const face = [P(0, -w(sL), 0), P(0, w(sL), 0), P(0, w(sL)), P(0, -w(sL))];
    poly(g, face); g.fillStyle = '#93b0d0'; g.fill(); if (flat) { g.strokeStyle = ink; g.lineWidth = 2; g.stroke(); }
    if (!thumb) for (let o = -w(sL) + 12; o < w(sL) - 8; o += 22) { const [x0, y0] = P(0, o), [x1, y1] = P(0, o, 0); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0 + 3); g.lineTo(x1 + 3, y1); g.stroke(); }   // (shovel marks)
  }
  // the top: groomed snow, a gradient up toward the lip, which catches the sun
  const top = [...ds.map(d => P(d, -w(sL + d))), ...ds.slice().reverse().map(d => P(d, w(sL + d)))], [fx, fy] = P(-KICK_L, 0), [lx, ly] = P(0, 0);
  poly(g, top); g.fillStyle = linear(g, fx, fy, lx, ly, [[0, '#dfe9f4'], [0.7, '#f2f7fc'], [1, '#ffffff']]); g.fill();
  if (flat) { g.strokeStyle = ink; g.lineWidth = 2.5; g.stroke(); }
  if (!thumb) {
    g.save(); poly(g, top); g.clip();
    for (let o = -w(sL) + 8; o < w(sL); o += 9) { g.strokeStyle = (o / 9 | 0) % 2 ? 'rgba(160,190,222,0.35)' : 'rgba(255,255,255,0.8)'; g.lineWidth = 1.5; g.beginPath(); ds.forEach((d, i) => { const [x, y] = P(d, o); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }   // groomed lines up it
    for (const o of [-22, 22]) { g.strokeStyle = 'rgba(120,155,200,0.45)'; g.lineWidth = 6; g.beginPath(); ds.forEach((d, i) => { const [x, y] = P(d, o); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }   // the inrun's grooves on up it
    for (const d0 of [-96, -66, -36]) { const W = w(sL) * 0.62, k = 12; poly(g, [P(d0 + k, 0), P(d0 - k * 0.3, W), P(d0 - k * 1.3, W), P(d0, 0), P(d0 - k * 1.3, -W), P(d0 - k * 0.3, -W)]); g.fillStyle = 'rgba(47,111,214,0.5)'; g.fill(); }   // dyed chevrons up it, on toward the lip
    g.restore();
    // rolled snow berms along both sides, shaded on the side away from the sun
    for (const sd of [-1, 1]) {
      const inner = ds.map(d => P(d, sd * (w(sL + d) - 2))), outer = ds.map(d => P(d, sd * (w(sL + d) + 12), 0.8));
      poly(g, [...inner, ...outer.slice().reverse()]); g.fillStyle = sd * q.nx > 0 ? '#ffffff' : '#d3e1ef'; g.fill();
      if (flat) { g.strokeStyle = ink; g.lineWidth = 2; g.stroke(); }
    }
    // the lip: a red dye line just before it, then its bright rim
    const lip = (d, col, lw) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(...P(d, -w(sL + d))); g.lineTo(...P(d, w(sL + d))); g.stroke(); };
    lip(-10, '#e8392b', 4); lip(-1, '#ffffff', 4); lip(0.5, 'rgba(70,100,150,0.5)', 1.5);
    // a tall flag at each end of the lip
    for (const sd of [-1, 1]) { const [x, y] = at(T, sL, sd * (halfWAt(T, sL) + 16)); banner(g, x, y, sd > 0 ? '#e8392b' : '#2f6fd6', flat); }
  }
}
function startHut(g, T) {
  const q = trackSample(T, 0), w = halfWAt(T, 60);
  // the start gate's posts either side and the hut behind the start
  for (const sd of [-1, 1]) { const [px, py] = at(T, 20, sd * (w + 6)); g.fillStyle = SHADOW; g.fillRect(px + 4, py + 2, 8, 20); g.fillStyle = '#2f6fd6'; g.fillRect(px - 4, py - 34, 8, 36); }
  const hx = q.x - q.tx * 190, hy = q.y - q.ty * 190;   // (behind the start: up the mountain)
  g.fillStyle = SHADOW; g.fillRect(hx - 40 + 14, hy - 20 + 16, 84, 52);
  g.fillStyle = '#8a5a34'; g.fillRect(hx - 42, hy - 26, 84, 50);
  g.fillStyle = '#ffffff'; poly(g, [[hx - 50, hy - 26], [hx, hy - 58], [hx + 50, hy - 26]]); g.fill();
  g.fillStyle = '#d6e3f0'; poly(g, [[hx, hy - 58], [hx + 50, hy - 26], [hx + 10, hy - 26]]); g.fill();
  g.fillStyle = '#ffd36b'; g.fillRect(hx - 30, hy - 14, 14, 12); g.fillRect(hx + 16, hy - 14, 14, 12);
}
function finishArch(g, T) {   // (the finish line and its gantry are track.js's: two big red inflatable pillars either side)
  const s = T.finishS, w = halfWAt(T, s);
  for (const sd of [-1, 1]) {
    const [x, y] = at(T, s, sd * (w + 22));
    ell(g, x + 14, y + 12, 18, 10); g.fillStyle = SHADOW; g.fill();
    circ(g, x, y, 16); g.fillStyle = '#e8392b'; g.fill(); circ(g, x - 5, y - 5, 6); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill();
  }
}
// the lodge past the finish: a big chalet with a snowy roof, its terrace with umbrellas and skis in a rack
function lodge(g, T) {
  const s = T.L - 120, w = halfWAt(T, s), [x, y] = at(T, s, -w - 260);
  g.fillStyle = SHADOW; g.fillRect(x - 150 + 30, y - 80 + 40, 300, 170);
  g.fillStyle = '#9a6a3e'; g.fillRect(x - 150, y - 70, 300, 150); g.fillStyle = '#7d5230'; for (let k = 0; k < 8; k++) g.fillRect(x - 150, y - 60 + k * 18, 300, 3);
  g.fillStyle = '#ffd36b'; for (let k = 0; k < 6; k++) g.fillRect(x - 130 + k * 48, y - 40, 22, 26);
  g.fillStyle = '#ffffff'; poly(g, [[x - 170, y - 70], [x, y - 150], [x + 170, y - 70]]); g.fill();
  g.fillStyle = '#d6e3f0'; poly(g, [[x, y - 150], [x + 170, y - 70], [x + 30, y - 70]]); g.fill();
  g.fillStyle = '#6b4a35'; g.fillRect(x + 80, y - 150, 18, 40);
  for (let k = 0; k < 4; k++) { circ(g, x + 89 + k * 6, y - 160 - k * 14, 7 + k * 3); g.fillStyle = `rgba(200,205,215,${0.5 - k * 0.1})`; g.fill(); }
  // the terrace: tables under red umbrellas
  for (let k = 0; k < 4; k++) { const ux = x - 110 + k * 72, uy = y + 120; ell(g, ux + 10, uy + 10, 26, 14); g.fillStyle = SHADOW; g.fill(); circ(g, ux, uy, 24); g.fillStyle = k % 2 ? '#e8392b' : '#ffffff'; g.fill(); circ(g, ux, uy, 4); g.fillStyle = '#2a2d36'; g.fill(); }
  // skis in a rack
  for (let k = 0; k < 7; k++) { g.strokeStyle = ['#e8392b', '#2f6fd6', '#ffc93c', '#3fd68b'][k % 4]; g.lineWidth = 4; g.beginPath(); g.moveTo(x + 170 + k * 9, y + 40); g.lineTo(x + 170 + k * 9, y - 10); g.stroke(); }
}
// the chairlift: from beside the lodge straight up the mountain to beside the Big Air. Its pylons and cable (static), and
// the chairs going round (live: skiOver)
function liftOf(T) {
  if (T._lift) return T._lift;
  const z = T.mech.cliffs[0], sE = T.L - 400, wE = halfWAt(T, sE), wA = halfWAt(T, z.sLip - 300);
  const A = at(T, sE, -wE - 520), B = at(T, z.sLip - 300, -wA - 260);
  return (T._lift = { A, B });
}
function chairlift(g, T) {
  if (!T.mech.cliffs.length) return;
  const { A, B } = liftOf(T), L = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L;
  for (let d = 0; d <= L; d += 520) {   // pylons
    const x = A[0] + ux * d, y = A[1] + uy * d;
    g.strokeStyle = SHADOW; g.lineWidth = 6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 40, y + 24); g.stroke();
    g.strokeStyle = '#7d8896'; g.lineWidth = 6; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 46); g.stroke();
    g.strokeStyle = '#5d6774'; g.lineWidth = 4; g.beginPath(); g.moveTo(x - uy * 22, y - 46 + ux * 22); g.lineTo(x + uy * 22, y - 46 - ux * 22); g.stroke();
  }
  for (const [x, y, k] of [[...A, 0], [...B, 1]]) {   // the stations
    g.fillStyle = SHADOW; g.fillRect(x - 40 + 16, y - 30 + 18, 80, 60);
    g.fillStyle = '#e9edf2'; g.fillRect(x - 40, y - 30, 80, 60); g.fillStyle = k ? '#2f6fd6' : '#e8392b'; g.fillRect(x - 44, y - 38, 88, 12);
  }
}

// ---------------------------------------------------------------- live layers
// under the karts: snow spray off a kart drifting, spinning or bouncing over the moguls; and for each player the game's
// usual dotted line in their colour: in a field of trees, where their line's heading (in if they're drifting, swept out
// if not: it swings over as they press and let go); through the slalom and the park, along the swerve their kart is
// making (and on to the spot after); no markers anywhere
// the dotted line: dots along pts in a player's colour, a pulse running along them, fading out at the far end
function dots(ctx, pts, col, t, r = 5.5, a0 = 0.85) {
  ctx.fillStyle = col;
  pts.forEach(([x, y], k) => {
    const ph = (t * 3 - k * 0.35) % 1, a = a0 * Math.min(1, (pts.length - k) / 6);
    ctx.globalAlpha = a * (0.55 + 0.45 * Math.max(0, Math.sin(ph * TAU))); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  });
  ctx.globalAlpha = 1;
}
let ZK = 1;   // (the cues' size: bigger in the world as the camera pulls out, so they read the same on screen)
export function skiUnder(ctx, race) {
  ZK = clamp(0.9 / (VIEW.sc || 1), 1, 2.5);
  const t = race.time, V = VIEW;
  for (const c of race.cars) {
    if (c.x < V.x0 - 200 || c.x > V.x1 + 200 || c.y < V.y0 - 200 || c.y > V.y1 + 200) continue;
    const k = Math.max(c.dAmt || 0, c.skiLoose > 0 ? 0.45 : 0, c.spinT > 0 ? 0.8 : 0); if (k < 0.05) continue;   // (the moguls: only thrown about by them, too fast)
    const hx = Math.cos(c.heading), hy = Math.sin(c.heading), sd = c.dSide || 1;
    for (let i = 0; i < 10; i++) {
      const ph = (t * 3 + i * 0.1 + c.idx * 0.37) % 1, back = c.L * 0.45 + ph * 60, side = (i % 2 ? 1 : -1) * c.W * 0.4 - sd * ph * 40 * (c.dAmt || 0.3);
      const x = c.x - hx * back - hy * side, y = c.y - hy * back + hx * side;
      circ(ctx, x, y, (4 + ph * 12) * k); ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - ph) * k})`; ctx.fill();
    }
  }
  // a ski jump's kart in the air: its shadow right under it on the hill (render.js's own falls off down the slope),
  // smaller and softer the higher it flies, so you can see where you'll come down
  for (const c of race.cars) if (c.air > 0 && c.cliffJump && c.T.mech.cliffs[0] && c.T.mech.cliffs[0].snow) {
    if (c.x < V.x0 - 200 || c.x > V.x1 + 200 || c.y < V.y0 - 200 || c.y > V.y1 + 200) continue;
    const P = cliffPose(c, t), hh = P ? P.h : 0, k = 1 / (1 + hh * 0.35);
    ell(ctx, c.x, c.y, c.L * 0.55 * k + 4, c.W * 0.55 * k + 3, c.heading); ctx.fillStyle = `rgba(40,70,120,${0.32 * k})`; ctx.fill();
    ell(ctx, c.x, c.y, c.L * 0.38 * k, c.W * 0.38 * k, c.heading); ctx.fillStyle = `rgba(30,55,100,${0.3 * k})`; ctx.fill();
  }
  const M = race.track.mech.ski;
  for (const h of race.localHumans || race.humans) {
    const col = PCOL[h.pIndex] || PCOL[0];
    const sp = !h.finished && [M.park, M.ledge].find(q => q && h.s > q.sDec - 300 && h.s < q.sN + 40);
    if (sp) { splitWays(ctx, race, h, sp, col, t); continue; }
    const z = zoneOf(h); if (!z || h.finished || (z.kind === 'moguls' && !race.drift)) continue;
    if (z.field) {   // a field: both ways your line can go from here, the one you're on bright, the other faint, and the drift's marked
      if (h.skiFZ !== z.t0 || h.s > z.t1) continue;
      const lift = z.kind !== 'moguls' && !race.drift, now = lift ? !h.gas : !!h.dOn, v = Math.max(h.speed, 60), n = 17, dt = 30 / v;   // (about 500 ahead: the arrows stay in view)
      const at2 = p => at(h.T, p.s, p.lat), on = fieldRun(h, z, () => now, n, dt).filter(p => p.s > h.s + 80), off = fieldRun(h, z, () => !now, n, dt).filter(p => p.s > h.s + 80);
      const strong = z.kind === 'glade' ? 0.45 : 0.55;   // (the forest and the moguls: the other way a little clearer)
      const end = P => P.length > 2 ? { A: at2(P[P.length - 3]), B: at2(P[P.length - 1]), p: P[P.length - 1] } : null, eOn = end(on), eOff = end(off);
      // how far apart the two ends are: close together (just after pressing or letting go, or slow) the other way fades
      // right down and loses its arrow, so the two never sit on top of each other
      const sep = eOn && eOff ? clamp((Math.hypot(eOn.B[0] - eOff.B[0], eOn.B[1] - eOff.B[1]) - 45 * ZK) / (70 * ZK), 0, 1) : 0;
      dots(ctx, off.map(at2), col, t, 3.6, strong * (0.25 + 0.75 * sep));
      dots(ctx, on.map(at2), col, t);
      if (eOff && sep > 0.05) arrowHead(ctx, eOff.B, eOff.A, 13, col, strong * sep);
      if (eOn) arrowHead(ctx, eOn.B, eOn.A, 19, col, 1);
      // the drift's (or the lift's) mark: by the end of the way holding it takes you, on its inside (holding carves in:
      // away from the other way's end)
      const E = now ? eOn : eOff;
      if (E) { const [x, y] = at(h.T, E.p.s - 40, E.p.lat + z.ins * 46 * ZK); driftBadge(ctx, x, y, col, now ? 1 : 0.55 + 0.4 * sep, lift); }
      continue;
    }
    const W = skiWay(h); if (!W || !W.b) continue;
    const pts = [], next = W.b.gw >= 0 && z.walls[W.b.gw] && z.walls[W.b.gw].gaps[W.b.gi];
    for (let s = h.s + 90; s < W.b.s; s += 34) pts.push(at(h.T, s, corrLat(W.a, W.b, s)));
    if (next && next.next && next.next.length === 1) { const n = next.next[0]; for (let s = W.b.s + ((W.b.s - h.s - 90) % 34 + 34) % 34; s < n.s && pts.length < 30; s += 34) pts.push(at(h.T, s, corrLat(W.b, n, s))); }
    dots(ctx, pts, col, t);
    if (race.drift && h.speed > 100) {   // the slalom and the park: which way a drift carves from here (the side it'd pick: the swerve's way), bright while it's the way the swerve's turning
      let side = h.dOn ? h.dSide : 0; if (!side) for (let d = 0; d <= 900 && !side; d += 15) { const k = curvAt(h.T, h.s + d) + skiK(h, h.s + d); if (Math.abs(k) > 1 / 1500) side = Math.sign(k); }
      if (!side) continue;
      const k = skiK(h, h.s + h.speed * 0.15), good = Math.sign(k) === side && Math.abs(k) > 1 / 3000, a = good ? 1 : 0.4;
      // one arrow ahead of the kart, out to that side and on down the run, and the drift's mark beyond it (both well
      // clear of the kart)
      const s1 = h.s + 150, q = trackSample(h.T, s1), [ax, ay] = at(h.T, s1, h.lat + side * 62 * ZK), ux = q.tx * 0.8 + q.nx * side * 0.6, uy = q.ty * 0.8 + q.ny * side * 0.6, bx = ax - ux * 50, by = ay - uy * 50;   // (pointing on down the run and out that way)
      arrowHead(ctx, [ax, ay], [bx, by], 17, col, a, 60);
      const [dx, dy] = at(h.T, s1 - 30, h.lat + side * 112 * ZK); driftBadge(ctx, dx, dy, col, a, false);
    }
  }
}
// coming up to a split: both ways from here, the lane (holding drift as you cross the commit line takes it; with drift
// off, lifting) and the piste (letting go), each a dotted line ending in an arrow: the one you're set for bright, the
// other faint, the lane's marked with the drift button's curved arrow (drift off: the lift's). Past the commit line
// only the one you're on
function splitWays(ctx, race, h, z, col, t) {
  const T = h.T, side = z.side, s0 = h.s + 70, s1 = Math.min(z.sN + 300, h.s + 520), lock = h.s >= z.sLock;
  const laneOn = h.skiLane === z.kind && h.s > z.sDec - 20;
  const bS = Math.max(z.sN - 100, h.s + 300), a = { s: h.s, lat: h.lat };
  const laneLat = s => { const L = z.lane(Math.max(s, z.sN)); return s < bS ? corrLat(a, { s: bS, lat: L.mid }, s) : L.mid; };
  const pisteMid = s => { const L = z.lane(Math.max(s, z.sN)), hw = halfWAt(T, s), W = h.W; const B = side > 0 ? [-hw + W * 0.7, L.far - W * 1.1] : [L.far + W * 1.1, hw - W * 0.7]; return (B[0] + B[1]) / 2; };
  const pisteLat = s => s < z.sN - 100 ? corrLat(a, { s: z.sN - 100, lat: pisteMid(z.sN - 100) }, s) : pisteMid(s);
  const path = f => { const P = []; for (let s = s0; s <= s1; s += 34) P.push({ s, lat: f(s) }); return P; };
  const lane = path(laneLat), piste = path(pisteLat), at2 = p => at(T, p.s, p.lat);
  const draw = (P, on, badge) => {
    if (P.length < 3) return;
    const pts = P.map(at2), A = pts[pts.length - 3], B = pts[pts.length - 1];
    dots(ctx, pts, col, t, on ? 5.5 : 3.6, on ? 0.85 : 0.35);
    arrowHead(ctx, B, A, on ? 19 : 13, col, on ? 1 : 0.4);
    if (badge) { const e = P[P.length - 1], [x, y] = at(T, e.s - 40, e.lat + side * 46 * ZK); driftBadge(ctx, x, y, col, on ? 1 : 0.55, !race.drift); }
  };
  if (lock) { draw(laneOn ? lane : piste, true, laneOn); return; }
  draw(laneOn ? piste : lane, false, !laneOn); draw(laneOn ? lane : piste, true, laneOn);
}
// an arrowhead on the snow at tip B, pointing on from A: a fat, filled arrow in a player's colour, a light rim and a
// soft shadow (the flat look: a dark ink rim, no shadow) so it reads on white snow
function arrowHead(ctx, B, A, r, col, a, shaft = 0) {   // shaft: a tail this long behind the head (a whole arrow, where there's no dotted line to be its shaft)
  r *= ZK;
  const dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, nx = -uy, ny = ux, flat = bold();
  const P = [[0, 0], [-1.3, 0.78], [-0.85, 0], [-1.3, -0.78]].map(([f, s]) => [B[0] + ux * r * f + nx * r * s, B[1] + uy * r * f + ny * r * s]);   // (a notched back: an arrow, not a triangle)
  const path = () => { ctx.beginPath(); P.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); };
  ctx.save(); ctx.globalAlpha = a; ctx.lineJoin = 'round';
  if (shaft) {   // the tail: a fat rounded stroke, rimmed as the head
    const sx = B[0] - ux * (r + shaft * ZK), sy = B[1] - uy * (r + shaft * ZK), ex = B[0] - ux * r * 0.9, ey = B[1] - uy * r * 0.9, line = () => { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); };
    ctx.lineCap = 'round'; if (!flat) { ctx.translate(2.5, 3.5); line(); ctx.lineWidth = r * 0.5; ctx.strokeStyle = 'rgba(40,60,100,0.3)'; ctx.stroke(); ctx.translate(-2.5, -3.5); }
    line(); ctx.lineWidth = r * 0.5 + (flat ? 6 : 5); ctx.strokeStyle = flat ? BK.ink : '#ffffff'; ctx.stroke(); line(); ctx.lineWidth = r * 0.5; ctx.strokeStyle = col; ctx.stroke();
  }
  if (!flat) { ctx.translate(2.5, 3.5); path(); ctx.fillStyle = 'rgba(40,60,100,0.3)'; ctx.fill(); ctx.translate(-2.5, -3.5); }
  path(); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = flat ? 3 : 2.6; ctx.strokeStyle = flat ? BK.ink : '#ffffff'; ctx.stroke();
  ctx.restore();
}
// the drift button's mark (render.js's touch button: a curved arrow) on a little disc in a player's colour, upright on
// screen, where the drift's way goes; with drift off in the forest, the gas pedal let up (an arrow up)
function driftBadge(ctx, x, y, col, a, lift) {
  const k = 1.6 * ZK; ctx.save(); ctx.translate(x, y); ctx.scale(k, k); x = 0; y = 0;
  ctx.globalAlpha = a;
  if (!bold()) { circ(ctx, x + 2, y + 3, 13); ctx.fillStyle = 'rgba(40,60,100,0.25)'; ctx.fill(); }
  circ(ctx, x, y, 13); ctx.fillStyle = col; ctx.fill();
  if (!bold()) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke(); }
  ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
  if (lift) { ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x, y - 3); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 5, y - 1); ctx.lineTo(x, y - 7); ctx.lineTo(x + 5, y - 1); ctx.closePath(); ctx.fill(); }
  else { ctx.beginPath(); ctx.arc(x - 1.5, y + 3.5, 7, -Math.PI * 0.95, -Math.PI * 0.2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + 6.5, y - 2.5); ctx.lineTo(x + 1.5, y - 5.5); ctx.lineTo(x + 4, y + 1); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}
// over the karts: the chairlift's cable and chairs, and the Big Air's gauge
export function skiOver(ctx, race, local) {
  const T = race.track, t = race.time, V = VIEW;
  if (T.mech.cliffs.length) {
    const { A, B } = liftOf(T), L = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L, nx = -uy, ny = ux;
    const lo = Math.min(A[0], B[0]) - 100, hi = Math.max(A[0], B[0]) + 100;
    if (!(hi < V.x0 || lo > V.x1)) for (const sd of [-1, 1]) {
      const ox = nx * sd * 14, oy = ny * sd * 14;
      ctx.strokeStyle = '#3a3f48'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(A[0] + ox, A[1] + oy - 46); ctx.lineTo(B[0] + ox, B[1] + oy - 46); ctx.stroke();
      for (let d = ((t * 60 * sd) % 180 + 180) % 180; d < L; d += 180) {
        const x = A[0] + ux * d + ox, y = A[1] + uy * d + oy - 46; if (x < V.x0 - 50 || x > V.x1 + 50 || y < V.y0 - 50 || y > V.y1 + 50) continue;
        ctx.fillStyle = 'rgba(60,80,110,0.2)'; ctx.fillRect(x + 22, y + 52, 18, 8);
        ctx.strokeStyle = '#3a3f48'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 14); ctx.stroke();
        ctx.fillStyle = sd > 0 ? '#e8392b' : '#2f6fd6'; ctx.beginPath(); ctx.roundRect(x - 9, y + 12, 18, 9, 3); ctx.fill();
      }
    }
  }
  for (const h of local) { cliffGauge(ctx, race, h); flipPrompt(ctx, race, h); flipRing(ctx, race, h); landBadge(ctx, race, h); }
}
// the key that flips you (race-cliff.js FLIP): the drift key (with drift off, the gas), as the HUD draws it (drawKeycap),
// or on a touch screen the drift button's mark; held: lit in the player's colour
function flipKey(ctx, race, h, x, y, down, col) {
  if (Input.touchActive) {
    ctx.save(); ctx.translate(x, y); circ(ctx, 0, 0, 15); ctx.fillStyle = down ? col : 'rgba(20,28,44,0.78)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    if (race.drift) { ctx.beginPath(); ctx.arc(-1.5, 3.5, 7, -Math.PI * 0.95, -Math.PI * 0.2); ctx.stroke(); poly(ctx, [[6.5, -2.5], [1.5, -5.5], [4, 1]]); ctx.fill(); }
    else { circ(ctx, 0, 0, 4); ctx.fill(); ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, TAU); ctx.lineWidth = 1.6; ctx.stroke(); }   // (drift off: tap the screen)
    ctx.restore(); return;
  }
  const i = race.localHumans ? race.localHumans.indexOf(h) : h.pIndex, K = race.drift ? DKEYS : KEYS;
  drawKeycap(ctx, x, y, (K[i] || K[0] || '?').toUpperCase(), down, col, 0.8);
}
// coming up the Big Air's inrun: the key that flips you, by the kart (where the flip ring will be in the air), with the
// ring of three beside it (three presses, one flip), pulsing harder and faster as you near the lip and blinking
// pressed in the last moments. Upright on screen
function flipPrompt(ctx, race, h) {
  const z = h.T.mech.cliffs[0]; if (!z || !z.snow || h.finished || h.cliffJump || h.air > 0) return;
  const ds = z.sLip - h.s; if (ds <= 0 || ds > 700) return;
  const t = race.time, p = 1 - ds / 700, col = PCOL[h.pIndex] || PCOL[0], k = clamp(1.3 / (VIEW.sc || 1), 1, 5) * (VIEW.w < 560 ? 0.72 : 0.85), flat = bold();
  const pulse = 1 + (0.05 + 0.16 * p) * Math.max(0, Math.sin(t * (5 + 13 * p))), down = ds < 220 && Math.floor(t * 7) % 2 === 0, a = smooth(0, 0.15, p);
  ctx.save(); ctx.translate(h.x + 50 * k, h.y - 80 * k); ctx.scale(k * pulse, k * pulse); ctx.globalAlpha = a;
  ctx.beginPath(); ctx.roundRect(-46, -21, 92, 42, 21); ctx.fillStyle = flat ? BK.ink : 'rgba(20,28,44,0.72)'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = col; ctx.stroke();
  flipKey(ctx, race, h, -18, 0, down, col);
  for (let j = 0; j < 3; j++) { const a0 = -Math.PI / 2 + j * TAU / 3 + 0.25, a1 = a0 + TAU / 3 - 0.5; ctx.beginPath(); ctx.arc(22, 0, 11, a0, a1); ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.strokeStyle = down && j === Math.floor(t * 3.5) % 3 ? col : 'rgba(255,255,255,0.85)'; ctx.stroke(); }
  ctx.save(); ctx.translate(22, 0); ctx.rotate(t * 4); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-5, -2.2, 10, 4.4, 2); ctx.fill(); ctx.restore();   // (a little kart rolling over in the middle)
  ctx.restore();
}
// a moment after landing a trick, a flip or the box (race-ski.js, race-cliff.js: skiLandT / flipLandT): a disc popping
// up over the kart, green with a tick for a clean one (and a gold star for each flip), red with a cross for a crash or
// a missed trick. Upright on screen
function landBadge(ctx, race, h) {
  const t = race.time, fl = h.flipLandT !== undefined && t - h.flipLandT >= 0 && t - h.flipLandT < 1.1, pk = h.skiLandT !== undefined && t - h.skiLandT >= 0 && t - h.skiLandT < 0.9;
  if (!fl && !pk) return;
  const e = fl ? t - h.flipLandT : t - h.skiLandT, ok = fl ? h.flipLandOk : h.skiLandOk, F = fl ? h.flipLandF || 0 : 0, big = fl;
  const k = clamp(1.3 / (VIEW.sc || 1), 1, 5) * (big ? 1.15 : 0.8), pop = e < 0.12 ? e / 0.12 * 1.25 : 1.25 - 0.25 * Math.min(1, (e - 0.12) / 0.15), fade = 1 - smooth(big ? 0.8 : 0.6, big ? 1.1 : 0.9, e), flat = bold();
  ctx.save(); ctx.translate(h.x, h.y - (66 + 22 * Math.min(1, e * 3)) * k); ctx.scale(k * pop, k * pop); ctx.globalAlpha = fade;
  if (!flat) { circ(ctx, 2, 3, 17); ctx.fillStyle = 'rgba(30,45,70,0.25)'; ctx.fill(); }
  circ(ctx, 0, 0, 17); ctx.fillStyle = ok ? '#2fbf62' : '#e8392b'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = flat ? BK.ink : '#ffffff'; ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
  if (ok) { ctx.moveTo(-7.5, 0.5); ctx.lineTo(-2, 6); ctx.lineTo(8, -6); } else { ctx.moveTo(-6, -6); ctx.lineTo(6, 6); ctx.moveTo(6, -6); ctx.lineTo(-6, 6); }
  ctx.stroke();
  if (ok && F > 0) for (let j = 0; j < Math.min(F, 8); j++) { const n = Math.min(F, 8), a = -Math.PI / 2 + (j - (n - 1) / 2) * 0.42; flipStar(ctx, Math.cos(a) * 30, Math.sin(a) * 30 + 2, 6.5, '#ffd166', flat); }
  if (!ok) for (let j = 0; j < 3; j++) { const a = t * 6 + j * TAU / 3; flipStar(ctx, Math.cos(a) * 26, -14 + Math.sin(a) * 7, 4.5, '#ffffff', flat); }   // (dizzy stars round it)
  ctx.restore();
}
// in the air off the Big Air (race-cliff.js FLIP): a ring of three by the kart, a third filling in the player's colour
// with each press, whole again on each full flip; under it a star for each full flip so far. Upright on screen, off to
// the kart's upper right (never on it)
function flipRing(ctx, race, h) {
  if (!(h.cliffJump && h.air > 0) || !h.T.mech.cliffs[0] || !h.T.mech.cliffs[0].snow) return;
  const n = h.flipN || 0, part = n % 3, F = Math.floor(n / 3), col = PCOL[h.pIndex] || PCOL[0], fresh = n && !part ? Math.max(0, 1 - (race.time - (h.flipAt || 0)) * 3) : 0;
  const k = clamp(1.3 / (VIEW.sc || 1), 1, 5), x = 0, y = 0, R = 17, flat = bold();   // (k: about the same size on screen however far out the camera is)
  ctx.save(); ctx.translate(h.x + 50 * k, h.y - 80 * k); ctx.scale(k, k); ctx.lineCap = 'round';
  if (!flat) { ctx.beginPath(); ctx.arc(x + 2, y + 3, R + 6, 0, TAU); ctx.fillStyle = 'rgba(30,45,70,0.22)'; ctx.fill(); }
  ctx.beginPath(); ctx.arc(x, y, R + 6, 0, TAU); ctx.fillStyle = flat ? BK.ink : 'rgba(20,28,44,0.72)'; ctx.fill();
  for (let k = 0; k < 3; k++) {
    const a0 = -Math.PI / 2 + k * TAU / 3 + 0.2, a1 = a0 + TAU / 3 - 0.4, on = k < part || fresh > 0;
    ctx.beginPath(); ctx.arc(x, y, R, a0, a1); ctx.lineWidth = 7; ctx.strokeStyle = on ? (fresh > 0 ? '#ffd166' : col) : 'rgba(255,255,255,0.28)'; ctx.stroke();
  }
  if (fresh > 0) { ctx.globalAlpha = fresh; ctx.beginPath(); ctx.arc(x, y, R + 8 + 10 * (1 - fresh), 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = '#ffd166'; ctx.stroke(); ctx.globalAlpha = 1; }
  // the kart's own little roll in the middle: a bar turned as far as the flip's gone
  ctx.save(); ctx.translate(x, y); ctx.rotate(h.flipA || 0); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-8, -3.5, 16, 7, 3); ctx.fill(); ctx.fillStyle = col; ctx.fillRect(-8, -3.5, 16, 2.5); ctx.restore();
  for (let k = 0; k < Math.min(F, 8); k++) flipStar(ctx, x - (Math.min(F, 8) - 1) * 7 + k * 14, y + R + 16, 6, '#ffd166', flat);
  if (h.airT - h.air < 1.2 || h.flipHeld) flipKey(ctx, race, h, x + R + 32, y, !!h.flipHeld, col);   // (the key that does it, lit while held: for the first moments in the air, and on each press)
  ctx.restore();
}
function flipStar(ctx, x, y, r, col, flat) {
  ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath();
  ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = flat ? 2 : 1.5; ctx.strokeStyle = flat ? BK.ink : 'rgba(80,50,0,0.6)'; ctx.stroke();
}

// ---------------------------------------------------------------- props and landmarks (props.js)
export function skiProp(g, d, shadowPass) {
  const { x, y, r } = d, rng = mulberry(Math.round(x * 7 + y * 13)), t = Math.floor((d.v || 0) * 10);
  if (t < 7) return pine(g, x, y, r * 0.9, rng, shadowPass);
  if (t < 9) { if (!shadowPass) rock(g, x, y, r * 0.6, rng); return; }
  if (shadowPass) { ell(g, x + 8, y + 10, r * 0.5, r * 0.35); g.fillStyle = SHADOW; g.fill(); return; }
  // a snowman: three balls from above, a scarf, a carrot nose
  circ(g, x, y, r * 0.5); g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = SNOW_DK; g.lineWidth = 1.5; g.stroke();
  circ(g, x - r * 0.06, y - r * 0.08, r * 0.34); g.fillStyle = '#ffffff'; g.fill(); g.stroke();
  g.strokeStyle = '#e8392b'; g.lineWidth = r * 0.09; g.beginPath(); g.arc(x - r * 0.06, y - r * 0.08, r * 0.27, 0, TAU); g.stroke();
  circ(g, x - r * 0.1, y - r * 0.14, r * 0.2); g.fillStyle = '#2a2d36'; g.fill();
  poly(g, [[x + r * 0.05, y - r * 0.06], [x + r * 0.36, y + r * 0.04], [x + r * 0.08, y + r * 0.06]]); g.fillStyle = '#ff8a2a'; g.fill();
}
export function skiLandmark(g, c, i) {
  const { x, y } = c, R = Math.min(c.r, 220);
  if (i % 2 === 0) {   // a mountain hut with a sun deck
    g.fillStyle = SHADOW; g.fillRect(x - 70 + 20, y - 40 + 24, 140, 90);
    g.fillStyle = '#8a5a34'; g.fillRect(x - 70, y - 40, 140, 80);
    g.fillStyle = '#ffffff'; poly(g, [[x - 82, y - 40], [x, y - 92], [x + 82, y - 40]]); g.fill();
    g.fillStyle = '#d6e3f0'; poly(g, [[x, y - 92], [x + 82, y - 40], [x + 14, y - 40]]); g.fill();
    g.fillStyle = '#ffd36b'; g.fillRect(x - 50, y - 20, 18, 16); g.fillRect(x + 30, y - 20, 18, 16);
    for (let k = 0; k < 3; k++) { const ux = x - 50 + k * 50, uy = y + 70; circ(g, ux, uy, 18); g.fillStyle = k % 2 ? '#2f6fd6' : '#ffc93c'; g.fill(); }
  } else {   // an igloo and a family of snowmen
    ell(g, x + 20, y + 22, 60, 30); g.fillStyle = SHADOW; g.fill();
    circ(g, x, y, 56); g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = SNOW_DK; g.lineWidth = 1.5;
    for (let k = 1; k < 4; k++) { g.beginPath(); g.arc(x, y, 56 * k / 4, 0, TAU); g.stroke(); }
    g.fillStyle = '#7d94b0'; g.beginPath(); g.ellipse(x + 40, y + 30, 16, 12, 0.6, 0, TAU); g.fill();
    const rng = mulberry(i + 3); for (let k = 0; k < 3; k++) skiProp(g, { x: x - 90 + k * 30, y: y + 70 + k * 6, r: 22 + k * 4, v: 0.95 }, false);
    void rng;
  }
  void R;
}
export const skiFlat = () => bold();
void shade; void linear;
