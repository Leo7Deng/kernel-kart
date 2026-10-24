// Kernel Kart art: the animals. On the snow and ice tracks (Cryo Caldera, Pipeline Pass) little groups of penguins by
// the water and the ice (waddling about, now and then one belly-sliding off and waddling back) and polar bears out on
// the snow (one ambling about with her cub at her heels, one lounging); and the cows and sheep Merge Bay's farm draws
// (art/bay.js). Everything is worked out once per track from its shape and drawn every frame from the race clock
// (draw-ambient.js), so it costs nothing in the race and is the same online. All of them are simple cartoons standing
// up on the screen (see "the look" below), lit from the top left, shadows down and to the right.
import { TAU, mulberry } from '../core.js';
import { trackSample } from '../geometry.js';
import { clearingsOf } from './props.js';
import { distField } from './track.js';
import { circ, ell } from './paint.js';

const herds = new WeakMap();
const turn = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return a + d * k; };
const ease = u => u * u * (3 - 2 * u);
// where an animal on its round of spots is at time t: standing a while at each, then a walk to the next
export function wander(A, t) {
  const m = A.wp.length, u = (t + A.ph) / A.P, k = Math.floor(u), f = u - k, at = i => A.wp[((i % m) + m) % m], a = at(k), b = at(k + 1), p = at(k - 1);
  const h0 = Math.atan2(a[1] - p[1], a[0] - p[0]), h1 = Math.atan2(b[1] - a[1], b[0] - a[0]), w0 = 1 - A.walk;
  if (f < w0) return { x: a[0], y: a[1], h: h0, walking: 0 };
  const e = (f - w0) / A.walk, q = ease(e);
  return { x: a[0] + (b[0] - a[0]) * q, y: a[1] + (b[1] - a[1]) * q, h: turn(h0, h1, Math.min(1, e / 0.3)), walking: Math.sin(e * Math.PI), e };
}

// where they live: penguins by each pond (a hot spring's rim, out on a frozen pond), bears on open snow near the road
// where you'll see them, all well clear of the road and its run-off, the trees, the landmarks and the crevasse
export function herdOf(T, kind) {
  if (herds.has(T)) return herds.get(T);
  const dist = distField(T), B = T.bbox, rng = mulberry(T.N * 3 + 17), run = (T.def.runoff || 75) + 60;
  const marks = clearingsOf(T) || [], deco = T.deco || [], ponds = T.ponds || [];
  const cracks = (T.gaps || []).map(gp => { const p = trackSample(T, gp.s); return [p.x, p.y]; });
  const ok = (x, y, road, water = true) => x > B.x + 50 && x < B.x + B.w - 50 && y > B.y + 50 && y < B.y + B.h - 50 && dist(x, y, road + 40) >= road
    && !deco.some(d => Math.hypot(d.x - x, d.y - y) < d.r + 22) && !cracks.some(([cx, cy]) => Math.hypot(cx - x, cy - y) < 460)
    && (!water || !ponds.some(p => Math.hypot(p.x - x, p.y - y) < p.r * 1.2 + 14)) && !marks.some(m => kind !== 'snow' && Math.hypot(m.x - x, m.y - y) < m.r * 0.75 + 30);
  const groups = [], bears = [];
  const penguins = (cx, cy, ice, slide) => {
    const P = []; for (let k = 0; k < 4 + Math.floor(rng() * 3); k++) { const a = rng() * TAU, d = 22 + rng() * 64; P.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.7, ph: rng() * 20, s: 1.45 + rng() * 0.35, face: rng() < 0.5 ? -1 : 1 }); }
    if (rng() < 0.7) P.push({ dx: -50 + rng() * 16, dy: 16, ph: rng() * 20, s: 1.35, face: 1, chick: true });   // (and mostly a fluffy grey chick)
    groups.push({ x: cx, y: cy, ice, P, slide, ph: rng() * 13 });
  };
  // a slide: the slider's run out from the group and back, on the ice or the snow, kept off the road and out of the water
  const slideFrom = (x, y, ice) => { for (let k = 0; k < 16; k++) { const a = rng() * TAU, l = 120 + rng() * 60, bx = x + Math.cos(a) * l, by = y + Math.sin(a) * l * 0.7; if (ice ? ice(bx, by) : ok(bx, by, run)) return [bx, by]; } return null; };
  // on a frozen pond (Pipeline Pass's landmark): out on the ice
  if (kind === 'snow') for (const m of marks) {
    if (groups.length >= 2) break;
    const R = m.r * 0.75, onIce = (x, y) => ((x - m.x) / (R * 0.85)) ** 2 + ((y - m.y) / (R * 0.6)) ** 2 < 1;
    const cx = m.x - R * 0.35, cy = m.y + R * 0.15, s = slideFrom(cx, cy, onIce); penguins(cx, cy, true, s && { a: [cx + 4, cy + 4], b: s });
  }
  // by a pond (Cryo Caldera's hot springs): on the snow at its rim
  for (const p of ponds) {
    if (groups.length >= 3) break;
    for (let k = 0; k < 24; k++) { const a = rng() * TAU, x = p.x + Math.cos(a) * (p.r * 1.25 + 46), y = p.y + Math.sin(a) * (p.r * 1.25 + 46); if (!ok(x, y, run + 30)) continue; const s = slideFrom(x, y); penguins(x, y, false, s && { a: [x + 4, y + 4], b: s }); break; }
  }
  // and on open snow, to make up three groups; then the bears
  const open = (road, far) => { for (let k = 0; k < 400; k++) { const x = B.x + rng() * B.w, y = B.y + rng() * B.h; if (ok(x, y, road) && dist(x, y, far + 40) < far && ![...groups, ...bears].some(o => Math.hypot(o.x - x, o.y - y) < 520)) return [x, y]; } return null; };
  while (groups.length < 3) { const s = open(run + 30, 420); if (!s) break; const sl = slideFrom(...s); penguins(s[0], s[1], false, sl && { a: [s[0] + 4, s[1] + 4], b: sl }); }
  for (let n = 0; n < 2; n++) {
    const s = open(run + 70, 520); if (!s) break;
    if (n === 0) {   // ambling about with her cub, round a few spots near her
      const wp = [s]; for (let k = 0; k < 40 && wp.length < 5; k++) { const a = rng() * TAU, l = 90 + rng() * 80, x = s[0] + Math.cos(a) * l, y = s[1] + Math.sin(a) * l; if (ok(x, y, run + 60)) wp.push([x, y]); }
      bears.push({ x: s[0], y: s[1], wp, P: 14, walk: 0.5, ph: rng() * 30, s: 1.5, cub: true });
    } else bears.push({ x: s[0], y: s[1], lounge: true, h: rng() * TAU, ph: rng() * 30, s: 1.5 });
  }
  const out = { groups, bears }; herds.set(T, out); return out;
}

export function iceFauna(ctx, T, t, kind, view) {
  const H = herdOf(T, kind);
  for (const B of H.bears) if (view(B.x, B.y, 220)) B.lounge ? lounger(ctx, B, t) : ambler(ctx, B, t);
  for (const G of H.groups) if (view(G.x, G.y, 200)) colony(ctx, G, t);
}

// ------------------------------------------------------------------------------------------------ the look
// Every animal is a little cartoon seen from above and a bit to the front, standing up on the screen (not turned with
// its heading: it faces left or right, `face`), so it reads as an animal at race zoom: chunky rounded shapes, a big
// head, short legs, a few flat colours with one soft shade and one highlight, dot eyes, no outlines. (x, y) is where its
// feet are; its soft shadow falls down and to the right.
const shadow = (ctx, x, y, rx, ry, col = 'rgba(40,60,40,0.22)') => { ell(ctx, x + rx * 0.18, y + ry * 0.35, rx, ry); ctx.fillStyle = col; ctx.fill(); };
const SNOW_SH = 'rgba(70,100,140,0.22)';
const faceOf = h => Math.cos(h) >= 0 ? 1 : -1;
// a soft shade along the bottom of a shape and a highlight up on its top left (clipped to the shape just drawn)
function shapeLight(ctx, cx, cy, rx, ry, shadeCol, lightCol = 'rgba(255,255,255,0.45)') {
  ctx.save(); ctx.clip();
  ell(ctx, cx + rx * 0.1, cy + ry * 0.75, rx * 1.1, ry * 0.55); ctx.fillStyle = shadeCol; ctx.fill();
  ell(ctx, cx - rx * 0.35, cy - ry * 0.45, rx * 0.4, ry * 0.25, -0.3); ctx.fillStyle = lightCol; ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ cows and sheep
// a black-and-white cow: a white barrel of a body with black patches, four short legs (stepping while it walks), a big
// head with a pink muzzle, black ears and little horns, a tail with a tuft. Grazing it drops its head to the grass and
// crops (`bob`); standing it looks about.
export function cow(ctx, x, y, face, s, spots, step, graze, bob, tail) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s * face, s);
  shadow(ctx, 2, 0, 27, 6);
  const leg = (lx, ph, col) => { const dx = step ? Math.sin(step + ph) * 2.6 : 0; ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(lx + dx - 3, -12, 6, 12, 2.5); ctx.fill(); ctx.fillStyle = '#4a3f3b'; ctx.beginPath(); ctx.roundRect(lx + dx - 3, -3, 6, 3, 1.5); ctx.fill(); };
  leg(-17, Math.PI, '#d9d2c6'); leg(11, 0, '#d9d2c6');   // the far legs, in shade
  leg(-12, 0, '#f1ece3'); leg(16, Math.PI, '#f1ece3');
  // the tail
  ctx.strokeStyle = '#e4ded3'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-21, -21); ctx.quadraticCurveTo(-25 - tail * 2, -16, -24 + tail * 3, -9); ctx.stroke();
  circ(ctx, -24 + tail * 3, -8, 2.6); ctx.fillStyle = '#2b2a2e'; ctx.fill();
  // the body and its patches
  ctx.beginPath(); ctx.roundRect(-22, -30, 42, 21, 10.5); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.roundRect(-22, -30, 42, 21, 10.5); ctx.clip();
  ctx.fillStyle = '#2b2a2e'; for (const [px, py, pr] of spots) { ell(ctx, px * 34, -20 + py * 14, 5 + pr * 5, 4 + pr * 3.5, px * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(120,110,120,0.18)'; ctx.fillRect(-22, -15, 42, 6);
  ell(ctx, -8, -26, 9, 2.2); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
  ctx.restore();
  ell(ctx, 4, -10.5, 4, 2.4); ctx.fillStyle = '#f5b5b8'; ctx.fill();   // the udder
  // the head: down in the grass, or up and turning a little
  ctx.save(); ctx.translate(graze ? 25 : 23, graze ? -12 + bob : -28); ctx.rotate(graze ? 0.35 : 0);
  for (const [ex, ey, a] of [[-5, -7, -0.5], [5, -8, 0.5]]) { ell(ctx, ex, ey, 4.2, 2.4, a); ctx.fillStyle = '#2b2a2e'; ctx.fill(); }   // the ears
  ctx.fillStyle = '#efe3c2'; ctx.beginPath(); ctx.moveTo(-2.5, -8); ctx.lineTo(-1.5, -12); ctx.lineTo(-0.5, -8); ctx.fill(); ctx.beginPath(); ctx.moveTo(2, -8.5); ctx.lineTo(3, -12.5); ctx.lineTo(4, -8.5); ctx.fill();   // the horns
  ctx.beginPath(); ctx.roundRect(-7, -9, 15, 17, 7); ctx.fillStyle = '#ffffff'; ctx.fill();
  ell(ctx, -3.5, -4, 3.6, 4.2); ctx.fillStyle = '#2b2a2e'; ctx.fill();   // a patch over one eye
  ell(ctx, 1.8, 5, 7.2, 5); ctx.fillStyle = '#f7aeb0'; ctx.fill();      // the muzzle
  ctx.fillStyle = '#c96f78'; circ(ctx, -0.6, 5, 1); ctx.fill(); circ(ctx, 4.2, 5, 1); ctx.fill();
  ctx.fillStyle = '#ffffff'; circ(ctx, -3, -3.4, 1.7); ctx.fill(); ctx.fillStyle = '#1b1b1f'; circ(ctx, -2.7, -3.2, 1.1); ctx.fill(); circ(ctx, 4.2, -3, 1.3); ctx.fill();   // the eyes
  ctx.restore();
  ctx.restore();
}
// a sheep: a cloud of fleece on four short black legs, a dark face with dot eyes and floppy ears, a tuft on top
export function sheep(ctx, x, y, face, s, step, graze, bob, black) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s * face, s);
  shadow(ctx, 1, 0, 17, 4.5);
  ctx.fillStyle = '#3a3638'; for (const [lx, ph] of [[-9, 0], [-4, Math.PI], [6, Math.PI], [10, 0]]) { const dx = step ? Math.sin(step + ph) * 2 : 0; ctx.beginPath(); ctx.roundRect(lx + dx - 1.8, -8, 3.6, 8, 1.6); ctx.fill(); }
  const wool = black ? ['#5d5658', '#4a4446', 'rgba(255,255,255,0.18)'] : ['#fbf8f0', '#e6e0d2', 'rgba(255,255,255,0.9)'];
  ctx.beginPath(); for (const [px, py, pr] of [[-9, -14, 6.5], [-3, -18.5, 7], [4, -18, 7], [9, -13, 6.5], [3, -10, 7], [-5, -10, 6.5]]) { ctx.moveTo(px + pr, py); ctx.arc(px, py, pr, 0, TAU); }
  ctx.fillStyle = wool[0]; ctx.fill();
  ctx.save(); ctx.clip(); ctx.fillStyle = wool[1]; ctx.fillRect(-20, -11, 40, 10); ctx.restore();
  circ(ctx, -4, -20, 3.2); ctx.fillStyle = wool[2]; ctx.fill();
  ctx.save(); ctx.translate(graze ? 14 : 13, graze ? -9 + bob : -18);
  ctx.fillStyle = '#3a3638'; ell(ctx, -3.5, -2, 3.4, 1.7, 0.7); ctx.fill();   // an ear
  ell(ctx, 0.5, 0, 5, 5.6); ctx.fill();
  circ(ctx, -1, -5, 3.2); ctx.fillStyle = wool[0]; ctx.fill();   // the tuft
  ctx.fillStyle = '#ffffff'; circ(ctx, 2.6, -0.8, 1.3); ctx.fill(); ctx.fillStyle = '#1b1b1f'; circ(ctx, 2.9, -0.6, 0.8); ctx.fill();
  ctx.restore();
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ penguins
// A group milling about: each waddles round its own little loop (rocking from foot to foot as it goes, turning to face
// the way it's heading), now and then stopping to flap. The slider: every 13 s it waddles to the edge, flops onto its
// belly and toboggans off (a spray of snow behind), lies a moment, then gets up and waddles back.
const SLIDE_P = 13;
function colony(ctx, G, t) {
  const L = [];
  G.P.forEach((p, i) => {
    if (i === 0 && G.slide) return;
    const u = t * 0.35 + p.ph, x = G.x + p.dx + Math.sin(u) * 14, y = G.y + p.dy + Math.sin(u * 0.8 + 1) * 8, vx = Math.cos(u) * 14;
    const moving = Math.abs(Math.cos(u * 0.8 + 1)) > 0.25 || Math.abs(vx) > 2.5;
    L.push([y, () => penguin(ctx, x, y, p.s, vx >= 0 ? 1 : -1, { wad: moving ? t * 9 + p.ph : 0, chick: p.chick, flap: (t + p.ph) % 7 < 0.6 })]);
  });
  if (G.slide) {
    const p = G.P[0], S = G.slide, f = (t + G.ph) % SLIDE_P, [ax, ay] = S.a, [bx, by] = S.b, fc = Math.sign(bx - ax) || 1;
    if (f < 5.5) L.push([ay, () => penguin(ctx, ax, ay, p.s, fc, { wad: f > 4.4 ? t * 12 : 0, flap: f > 4.4 })]);   // standing, then flapping, about to go
    else if (f < 7.3) { const q = 1 - (1 - (f - 5.5) / 1.8) ** 2, x = ax + (bx - ax) * q, y = ay + (by - ay) * q; L.push([y, () => penguin(ctx, x, y, p.s, fc, { lie: true, k: 1 - q, ice: G.ice, wad: t * 9 })]); }   // tobogganing off, slowing down
    else if (f < 8) L.push([by, () => penguin(ctx, bx, by, p.s, fc, { lie: true, ice: G.ice })]);
    else { const q = (f - 8) / (SLIDE_P - 8), x = bx + (ax - bx) * q, y = by + (ay - by) * q; L.push([y, () => penguin(ctx, x, y, p.s, -fc, { wad: t * 9 })]); }   // waddling back
  }
  L.sort((a, b) => a[0] - b[0]); for (const [, d] of L) d();
}
// The penguin, one design for every pose (standing, waddling, flapping, belly-sliding) and the chick: a round head on
// a slight neck, a body that widens toward the bottom, a white heart-shaped face and a white belly, an emperor's
// touch of yellow on its neck behind the face, dot eyes, a small pointed orange beak toward the way it faces, little
// flippers out at its sides and orange webbed feet. Standing, it rocks foot to foot as it waddles (`wad`, a phase; 0
// standing still), lifting each foot in turn and swinging its flippers; flapping, the flippers beat. Lying (`lie`) it
// is the same penguin flat on its belly, head up and forward, flippers swept back, feet trailing, a spray of snow (or
// shavings of ice) behind while it's going fast (`k`, 0..1). The chick is the same penguin smaller and rounder, in
// grey fluff with a black head, a white face and a dark beak.
const PG = { ink: '#2a2d34', fin: '#22252b', belly: '#ffffff', bellySh: 'rgba(110,135,170,0.24)', ear: '#ffc53a', beak: '#f59a1b', beakSh: '#d06d14', feet: '#f59a1b', feetSh: '#d06d14', cheek: 'rgba(255,140,150,0.5)' };
const CHICK = { ink: '#2a2d34', fin: '#8e95a1', body: '#a9afba', belly: '#dfe3e9', bellySh: 'rgba(110,120,140,0.22)', beak: '#3a3c42', beakSh: '#26282d', feet: '#6f6a6e', feetSh: '#55505a', cheek: 'rgba(255,140,150,0.45)' };
// the body, feet at (0, 0): a pear, narrow at the neck, widest low down, a round bottom
function pgBody(ctx) {
  ctx.beginPath(); ctx.moveTo(-5, -18);
  ctx.bezierCurveTo(-8.5, -14, -11.2, -9, -10.6, -5); ctx.bezierCurveTo(-10, -1, -6, 0, 0.5, 0);
  ctx.bezierCurveTo(7, 0, 11, -1, 11.4, -5); ctx.bezierCurveTo(11.8, -9, 9.2, -14, 6, -18); ctx.quadraticCurveTo(0.5, -21.5, -5, -18); ctx.closePath();
}
// a flipper hanging from its root (0, 0): a little paddle, tapering to a round tip
function pgFlipper(ctx, col) { ctx.beginPath(); ctx.moveTo(-2, 0); ctx.quadraticCurveTo(-3.4, 6.5, -0.2, 11); ctx.quadraticCurveTo(2.9, 6.5, 2, 0); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); }
// a webbed foot, heel at (0, 0), toes forward (+x): a little fan with two webbing creases
function pgFoot(ctx, C) {
  ctx.beginPath(); ctx.moveTo(-1.8, -1.2); ctx.quadraticCurveTo(2, -2.4, 4.4, -1.7); ctx.quadraticCurveTo(5.6, -1.1, 4.6, -0.4); ctx.quadraticCurveTo(5.8, 0.2, 4.6, 0.8);
  ctx.quadraticCurveTo(5.4, 1.6, 3.8, 1.7); ctx.quadraticCurveTo(0.6, 1.8, -1.8, 0.8); ctx.closePath(); ctx.fillStyle = C.feet; ctx.fill();
  ctx.strokeStyle = C.feetSh; ctx.lineWidth = 0.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(1.2, -0.6); ctx.lineTo(3.8, -0.8); ctx.moveTo(1.2, 0.4); ctx.lineTo(3.8, 0.8); ctx.stroke();
}
// shading for a shape just drawn, the way the fauna does it (shapeLight) but kept lit from the top left of the screen
// whichever way the penguin faces (f: its facing, as it's drawn mirrored)
function pgLight(ctx, cx, cy, rx, ry, f, light) {
  ctx.save(); ctx.clip();
  ell(ctx, cx + rx * 0.1 * f, cy + ry * 0.75, rx * 1.1, ry * 0.55); ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fill();
  ell(ctx, cx - rx * 0.35 * f, cy - ry * 0.45, rx * 0.4, ry * 0.25, -0.3 * f); ctx.fillStyle = `rgba(255,255,255,${light})`; ctx.fill();
  ctx.restore();
}
// the head, centred on (0, 0), facing +x: black, a white heart of a face, dot eyes, rosy cheeks, the beak poking out
function pgHead(ctx, C, f) {
  circ(ctx, 0, 0, 7.5); ctx.fillStyle = C.ink; ctx.fill(); pgLight(ctx, 0, 0, 7.5, 7.5, f, 0.2);
  ctx.save(); circ(ctx, 0, 0, 7.5); ctx.clip();
  ctx.beginPath(); ctx.arc(-0.9, -0.6, 3.5, Math.PI * 0.75, Math.PI * 1.9); ctx.arc(4.3, -0.6, 3.5, Math.PI * 1.1, Math.PI * 0.25); ctx.quadraticCurveTo(5.4, 5, 1.8, 8); ctx.quadraticCurveTo(-1.8, 5, -3.4, 1.9); ctx.closePath();
  ctx.fillStyle = C.belly; ctx.fill();
  if (C.ear) { ell(ctx, -5.4, 4.2, 1.7, 3, 0.4); ctx.fillStyle = C.ear; ctx.fill(); }   // an emperor's yellow patch behind its face
  ctx.restore();
  ctx.fillStyle = '#1b1b1f'; circ(ctx, -0.6, -0.9, 1.3); ctx.fill(); circ(ctx, 4.4, -0.9, 1.3); ctx.fill();   // the eyes
  ctx.fillStyle = C.cheek; circ(ctx, -2.2, 1.9, 1.3); ctx.fill(); circ(ctx, 6, 1.9, 1.2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(1.2, 0.6); ctx.quadraticCurveTo(6, 0.4, 9.6, 2.4); ctx.quadraticCurveTo(5.6, 3.9, 1.6, 3.3); ctx.closePath(); ctx.fillStyle = C.beak; ctx.fill();   // the beak
  ctx.beginPath(); ctx.moveTo(1.6, 2.3); ctx.quadraticCurveTo(5.6, 2.6, 9.6, 2.4); ctx.quadraticCurveTo(5.6, 3.9, 1.6, 3.3); ctx.closePath(); ctx.fillStyle = C.beakSh; ctx.fill();
}
export function penguin(ctx, x, y, s, face, { wad = 0, flap = false, chick = false, lie = false, k = 0, ice = false } = {}) {
  const C = chick ? CHICK : PG, sc = chick ? s * 0.66 : s;
  if (lie) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sc * face, sc);
    shadow(ctx, 0, 0, 17, 3.6, SNOW_SH);
    if (k > 0.05) { ctx.fillStyle = ice ? 'rgba(235,248,255,0.85)' : 'rgba(255,255,255,0.95)'; for (let i = 0; i < 4; i++) { circ(ctx, -18 - i * 6, -3 - (i % 2) * 3, (4 - i * 0.7) * k + 1); ctx.fill(); } }
    const kick = Math.sin(wad) * 0.3 * k, lying = () => { ctx.save(); ctx.translate(-8, -7.2); ctx.scale(1, 0.64); ctx.rotate(Math.PI / 2); pgBody(ctx); ctx.restore(); };
    for (const [fy, a] of [[-4.6, 0.3 + kick], [-2, 0.05 - kick]]) { ctx.save(); ctx.translate(-8.5, fy); ctx.rotate(Math.PI + a); ctx.scale(0.85, 0.85); pgFoot(ctx, C); ctx.restore(); }   // the feet, trailing, soles up
    ctx.save(); ctx.translate(-2, -9.5); ctx.rotate(1.64); pgFlipper(ctx, C.fin); ctx.restore();   // the far flipper, swept back along its back
    // the body: the same pear, flat on its tummy with the head end forward; its white tummy a band along the snow
    lying(); ctx.fillStyle = C.body || C.ink; ctx.fill();
    lying(); ctx.save(); ctx.clip();
    ell(ctx, -2, -15.5, 9, 2.6, -0.08); ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fill();
    ell(ctx, 2, -1.2, 14, 4.4); ctx.fillStyle = C.belly; ctx.fill();
    ell(ctx, 3, 0.6, 14, 2.2); ctx.fillStyle = C.bellySh; ctx.fill();
    ctx.restore();
    ctx.save(); ctx.translate(4.5, -8); ctx.rotate(1.4 + kick * 0.3); pgFlipper(ctx, '#3d424d'); ctx.restore();   // the near flipper, swept back
    ctx.save(); ctx.translate(13.5, -12.5); pgHead(ctx, C, face); ctx.restore();   // head up, looking where it's going
    ctx.restore();
    return;
  }
  const rock = wad ? Math.sin(wad) * 0.12 : 0, lift = wad ? Math.abs(Math.cos(wad)) * 1.2 : 0;
  ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); shadow(ctx, 1, 0, 10, 3, SNOW_SH); ctx.restore();
  ctx.save(); ctx.translate(x, y - lift * sc); ctx.rotate(rock); ctx.scale(sc * face, sc);
  // the flippers, out at its sides: swinging as it waddles, beating when it flaps
  const fl = flap ? 0.95 + Math.sin(wad * 2) * 0.55 : 0.62, sw = wad && !flap ? Math.sin(wad) * 0.18 : 0;
  ctx.save(); ctx.translate(-7, -14.5); ctx.rotate(fl + sw); pgFlipper(ctx, C.fin); ctx.restore();
  ctx.save(); ctx.translate(7.8, -14.5); ctx.rotate(-fl + sw); pgFlipper(ctx, C.fin); ctx.restore();
  // the body: black (grey fluff on a chick) with the white belly, its shade, a highlight up on the back
  pgBody(ctx); ctx.fillStyle = C.body || C.ink; ctx.fill(); pgLight(ctx, 0.4, -9, 11, 9, face, 0.14);
  pgBody(ctx); ctx.save(); ctx.clip();
  ell(ctx, 2, -8, 7.6, 9.2); ctx.fillStyle = C.belly; ctx.fill();
  ell(ctx, 2 + 8 * face, -6, 3.4, 10); ctx.fillStyle = C.bellySh; ctx.fill();
  ctx.restore();
  // the feet: each lifted in turn as it waddles
  for (const [fx, ph] of [[-4.6, 0], [2.6, Math.PI]]) { const up = wad ? Math.max(0, Math.sin(wad + ph)) * 1.8 : 0; ctx.save(); ctx.translate(fx, -0.2 - up); ctx.scale(0.85, 0.85); pgFoot(ctx, C); ctx.restore(); }
  ctx.save(); ctx.translate(1.2, -22.5); pgHead(ctx, C, face); ctx.restore();
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ polar bears
// a polar bear: a big soft cream body with a grey shade underneath, four short thick legs (shuffling while it walks), a
// round head with little round ears, a pale snout, a black nose and dot eyes. Lying down it sprawls on its tummy with
// its chin on its paws, breathing, and now and then lifts its head to look about.
const FUR = '#f6f2e8', FUR_SH = 'rgba(150,150,160,0.32)', FUR_LEG = '#e6e1d6', FUR_EDGE = '#d3d5dc';
const edge = (ctx, x, y, rx, ry) => { ell(ctx, x, y, rx + 1.1, ry + 1.1); ctx.fillStyle = FUR_EDGE; ctx.fill(); };   // (a soft edge round the outside, so it reads on the snow)
function bear(ctx, x, y, face, s, step, look, lie = 0, breathe = 0) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s * face, s);
  shadow(ctx, 2, 0, lie ? 34 : 30, 6, SNOW_SH);
  const b = 1 + breathe * 0.025;
  if (lie) {
    ctx.fillStyle = FUR_LEG; ell(ctx, -24, -3, 8, 4); ctx.fill();   // a back paw sticking out
    edge(ctx, -2, -12 * b, 30, 12 * b); ell(ctx, -2, -12 * b, 30, 12 * b); ctx.fillStyle = FUR; ctx.fill(); shapeLight(ctx, -2, -12 * b, 30, 12 * b, FUR_SH);
    ctx.fillStyle = FUR_LEG; ell(ctx, 26, -3, 9, 4); ctx.fill(); ell(ctx, 18, -2.5, 8, 3.6); ctx.fill();   // the front paws, out in front
  } else {
    const leg = (lx, ph, col) => { const dx = step ? Math.sin(step + ph) * 3.4 : 0, up = step ? Math.max(0, -Math.cos(step + ph)) * 1.6 : 0; ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(lx + dx - 5, -14 - up, 10, 14, 5); ctx.fill(); };
    leg(-17, Math.PI, '#ddd8cc'); leg(13, 0, '#ddd8cc');   // the far legs, in the body's shade
    edge(ctx, -1, -21, 27, 15); ell(ctx, -1, -21, 27, 15); ctx.fillStyle = FUR; ctx.fill(); shapeLight(ctx, -1, -21, 27, 15, FUR_SH);
    leg(-13, 0, FUR_LEG); leg(17, Math.PI, FUR_LEG);
    circ(ctx, -27, -24, 3.6); ctx.fillStyle = FUR_LEG; ctx.fill();   // the tail
  }
  // the head
  ctx.save(); ctx.translate(lie ? 25 : 27, lie ? -12 - Math.max(0, look) * 8 : -27 + Math.sin(step * 0.5) * 0.8); ctx.rotate(lie ? -look * 0.25 : look * 0.15);
  for (const ex of [-4, 4]) { circ(ctx, ex, -9.5, 3.8); ctx.fillStyle = FUR; ctx.fill(); circ(ctx, ex, -9.5, 2); ctx.fillStyle = '#cfc8bb'; ctx.fill(); }   // the ears
  edge(ctx, 0, 0, 11, 11); edge(ctx, 8, 3, 7, 5.4);
  circ(ctx, 0, 0, 11); ctx.fillStyle = FUR; ctx.fill(); shapeLight(ctx, 0, 0, 11, 11, 'rgba(150,150,160,0.2)');
  ell(ctx, 8, 3, 7, 5.4); ctx.fillStyle = '#fffdf7'; ctx.fill();   // the snout
  ell(ctx, 13, 1.4, 2.6, 2); ctx.fillStyle = '#1b1b1f'; ctx.fill();   // the nose
  ctx.fillStyle = '#1b1b1f'; if (lie && look <= 0) { ctx.lineWidth = 1.3; ctx.strokeStyle = '#1b1b1f'; ctx.beginPath(); ctx.arc(2.5, -2.5, 1.8, 0.2, Math.PI - 0.2); ctx.stroke(); } else { circ(ctx, 2.8, -3, 1.5); ctx.fill(); }   // an eye (shut while it dozes)
  ctx.fillStyle = 'rgba(255,150,150,0.35)'; circ(ctx, 1, 3.5, 2); ctx.fill();
  ctx.restore();
  ctx.restore();
}
function ambler(ctx, B, t) {
  const w = wander(B, t), walking = w.walking > 0.05, step = walking ? (t + B.ph) * 5 : 0, look = walking ? 0 : Math.sin(t * 0.7 + B.ph);
  if (B.cub) {   // the cub: trotting at her heels while she walks, playing beside her while she stops
    const c = walking ? { x: w.x - Math.cos(w.h) * 52 + Math.sin(w.h) * 18, y: w.y - Math.sin(w.h) * 52 - Math.cos(w.h) * 18 + 6, f: faceOf(w.h) } : { x: w.x + Math.cos(w.h + 2) * 46, y: w.y + Math.sin(w.h + 2) * 30 + 8, f: Math.sin(t * 0.5) > 0 ? 1 : -1 };
    const cub = () => bear(ctx, c.x, c.y - (walking ? 0 : Math.max(0, Math.sin(t * 5)) * 3), c.f, B.s * 0.55, walking ? (t + B.ph) * 8 : t * 4, Math.sin(t * 2));
    if (c.y < w.y) { cub(); bear(ctx, w.x, w.y, faceOf(w.h), B.s, step, look); } else { bear(ctx, w.x, w.y, faceOf(w.h), B.s, step, look); cub(); }
  } else bear(ctx, w.x, w.y, faceOf(w.h), B.s, step, look);
}
function lounger(ctx, B, t) {
  const u = (t + B.ph) % 11, look = u > 8 ? Math.sin((u - 8) / 3 * Math.PI) : 0;   // dozing, now and then lifting its head to look about
  bear(ctx, B.x, B.y, faceOf(B.h), B.s, 0, look, 1, Math.sin(t * 1.3 + B.ph));
}
