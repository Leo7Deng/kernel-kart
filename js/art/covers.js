// Map cover stickers (Settings "Map cover art", settings.mapArt): one bold cartoon per track in a 300x180 design box,
// cached once (coverBase) and shrunk for cards. No words in the pictures. lab.html?m=covers shows them all.
//   drawCover(g, name, w, h, t), coverThumb(name, w, h) (a 2x canvas), coverReady(name)
import { BODIES, CHARACTERS, TAU } from '../core.js';
import { drawCar, RIDE_UP } from './cars.js';
import { drawMascot } from './mascots.js';
import { shade } from './paint.js';
import { lookGen } from '../look.js';

const W = 300, H = 180;

// ------------------------------------------------------------------------------------------------ helpers
const INK = '#22182e', LW = 3;                       // the outline: one colour, one weight everywhere
const SH = 'rgba(34,18,52,0.24)';                     // the one shade (along a shape's lower right)
const mk = f => { const p = new Path2D(); f(p); return p; };
const pC = (x, y, r) => mk(p => p.arc(x, y, r, 0, TAU));
const pO = (x, y, rx, ry, a = 0) => mk(p => p.ellipse(x, y, rx, ry, a, 0, TAU));
const pR = (x, y, w, h, r) => mk(p => p.roundRect(x, y, w, h, r));
const pP = pts => mk(p => { pts.forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y)); p.closePath(); });
const wav = (x, s) => Math.sin(x * 0.031 + s) * 0.6 + Math.sin(x * 0.073 + s * 2.1) * 0.3 + Math.sin(x * 0.17 + s * 3.7) * 0.1;
const fillP = (g, p, c) => { g.fillStyle = c; g.fill(p); };
const inkP = (g, p, lw = LW) => { g.strokeStyle = INK; g.lineWidth = lw; g.stroke(p); };
// the shade inside a shape: everything in it but the shape shifted d up and left (so a crescent on the lower right)
function shadeIn(g, p, d = 5, col = SH) {
  g.save(); g.clip(p);
  const m = new Path2D(); m.rect(-400, -400, 1100, 1000); m.addPath(p, new DOMMatrix([1, 0, 0, 1, -d, -d * 0.9]));
  g.fillStyle = col; g.fill(m, 'evenodd'); g.restore();
}
// a sticker shape: flat fill, `then` draws more inside it (clipped), the shade, the outline
function sticker(g, p, col, { d = 5, lw = LW, then = null } = {}) {
  fillP(g, p, col);
  if (then) { g.save(); g.clip(p); then(); g.restore(); }
  if (d) shadeIn(g, p, d);
  inkP(g, p, lw);
}
const shine = (g, x, y, rx, ry, a = -0.5, al = 0.55) => fillP(g, pO(x, y, rx, ry, a), `rgba(255,255,255,${al})`);
// several shapes as one (clouds, smoke, foliage, lava): one outline round the lot, a shade along its lower right
function blobs(g, parts, col, { d = 3, lw = LW, sh = 0.18 } = {}) {
  const u = new Path2D(); for (const p of parts) u.addPath(p);
  g.strokeStyle = INK; g.lineWidth = lw * 2; for (const p of parts) g.stroke(p);
  fillP(g, u, shade(col, -sh));
  g.save(); g.clip(u); g.translate(-d, -d); fillP(g, u, col); g.restore();
}
const puffs = (g, cs, col, o) => blobs(g, cs.map(([x, y, r]) => pC(x, y, r)), col, o);
// a thick inked line (legs, arms, trunks, roads): f(p) makes the open path
function tube(g, f, col, w, { cap = 'round', ink = true } = {}) {
  const p = mk(f); g.lineCap = cap; g.lineJoin = 'round';
  if (ink) { g.strokeStyle = INK; g.lineWidth = w + LW * 1.8; g.stroke(p); }
  g.strokeStyle = col; g.lineWidth = w; g.stroke(p); g.lineCap = 'butt';
}
// the background: a sunburst round (x, y) in two close shades of the map's colour
function rays(g, x, y, a, b, n = 18, rot = 0.08) {
  g.fillStyle = a; g.fillRect(0, 0, W, H); g.fillStyle = b;
  for (let k = 0; k < n; k++) {
    const a0 = rot + k / n * TAU, a1 = a0 + TAU / n / 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a0) * 600, y + Math.sin(a0) * 600); g.lineTo(x + Math.cos(a1) * 600, y + Math.sin(a1) * 600); g.closePath(); g.fill();
  }
}
// a band of ground from a wavy top edge f(x) down, its edge inked
function ground(g, f, col) {
  const p = mk(p => { p.moveTo(-6, H + 10); for (let x = -6; x <= W + 6; x += 4) p.lineTo(x, f(x)); p.lineTo(W + 6, H + 10); p.closePath(); });
  fillP(g, p, col); inkP(g, p);
}
// a googly eye looking toward (px, py); brow: +1 left eye, -1 right (an angry brow sloping inward)
function eye(g, x, y, r, { px = 0, py = 0.25, brow = 0 } = {}) {
  sticker(g, pC(x, y, r), '#ffffff', { d: r * 0.18 });
  fillP(g, pC(x + px * r * 0.4, y + py * r * 0.4, r * 0.52), INK);
  fillP(g, pC(x + px * r * 0.4 - r * 0.2, y + py * r * 0.4 - r * 0.2, r * 0.17), '#ffffff');
  if (brow) { g.beginPath(); g.moveTo(x - r * 1.05, y - r * 1.3 - brow * r * 0.38); g.lineTo(x + r * 1.05, y - r * 1.3 + brow * r * 0.38); g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = r * 0.42; g.stroke(); g.lineCap = 'butt'; }
}
// a four-pointed twinkle
function twinkle(g, x, y, r, col = '#ffffff') {
  const p = mk(p => { for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 - Math.PI / 2, q = k % 2 ? r * 0.3 : r; p.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } p.closePath(); });
  fillP(g, p, col);
}
// a simple pine: two inked tiers and a stub of trunk
function pine(g, x, y, h, col = '#2f8a4a') {
  fillP(g, pR(x - h * 0.06, y - h * 0.2, h * 0.12, h * 0.22, 1), '#7a4a2e'); inkP(g, pR(x - h * 0.06, y - h * 0.2, h * 0.12, h * 0.22, 1), LW * 0.8);
  for (const [b, w, t] of [[0.16, 0.36, 0.62], [0.5, 0.27, 1]]) sticker(g, pP([[x - h * w, y - h * b], [x, y - h * t], [x + h * w, y - h * b]]), col, { d: 3 });
}
// a kart with its racer, as the race draws them (seen from above, the racer standing up out of it), big; head: its heading
function kart(g, id, x, y, s, { head = 0, mood = 'happy', look = null } = {}) {
  const ch = CHARACTERS.find(c => c.id === id); if (!ch) return;
  g.save(); g.translate(x, y); g.scale(s, s);
  g.save(); g.rotate(head); drawCar(g, ch, {}); g.restore();
  const seat = BODIES[ch.body].seat; g.translate(Math.cos(head) * seat, Math.sin(head) * seat - (RIDE_UP[ch.body] || 0));
  drawMascot(g, ch, { t: 0.5, look: look || [Math.cos(head), Math.sin(head)], face: Math.cos(head) < -0.1 ? -1 : 1, mood, shadow: false });
  g.restore();
}
// a spiral arm round (cx, cy): from r0 out to r1, turning `turn`, tapering to a point
function arm(cx, cy, a0, r0, r1, turn, w, sy = 1) {
  return mk(p => {
    const N = 24, pt = (s, off) => { const r = r0 + (r1 - r0) * s, a = a0 + turn * s + off; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * sy]; };
    for (let i = 0; i <= N; i++) { const [x, y] = pt(i / N, 0); i ? p.lineTo(x, y) : p.moveTo(x, y); }
    for (let i = N; i >= 0; i--) { const s = i / N, [x, y] = pt(s, -w * (1 - s * 0.85)); p.lineTo(x, y); }
    p.closePath();
  });
}

// ------------------------------------------------------------------------------------------------ the covers
const COVERS = {};

// Crab Harbor: the Borrow Checker, claws up
COVERS['Crab Harbor'] = g => {
  rays(g, 150, 100, '#14a6c2', '#22b4cf');
  ground(g, x => 148 + wav(x, 1) * 3, '#ffd98a');
  const R = '#f04a3a';
  for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) tube(g, p => { p.moveTo(150 + sd * (24 + k * 13), 114 + k * 4); p.quadraticCurveTo(150 + sd * (72 + k * 12), 94 + k * 10, 150 + sd * (86 + k * 12), 160 - k * 3); }, shade(R, -0.18), 6);
  for (const sd of [-1, 1]) tube(g, p => { p.moveTo(150 + sd * 44, 102); p.quadraticCurveTo(150 + sd * 94, 100, 150 + sd * 90, 60); }, R, 9);
  sticker(g, pO(150, 108, 66, 40), R, { d: 8 });
  shine(g, 118, 88, 17, 6);
  fillP(g, pC(178, 94, 4.5), shade(R, 0.2)); fillP(g, pC(190, 106, 3), shade(R, 0.2));
  // the mouth: a cross scowl
  sticker(g, mk(p => { p.moveTo(128, 126); p.quadraticCurveTo(150, 108, 172, 126); p.quadraticCurveTo(150, 118, 128, 126); p.closePath(); }), '#5a1420', { d: 0 });
  // the stalks and the eyes
  for (const sd of [-1, 1]) tube(g, p => { p.moveTo(150 + sd * 14, 80); p.lineTo(150 + sd * 25, 52); }, R, 6);
  eye(g, 124, 44, 16, { px: 0.35, py: 0.45, brow: 1 }); eye(g, 176, 44, 16, { px: -0.35, py: 0.45, brow: -1 });
  // the claws, open
  for (const sd of [-1, 1]) {
    const cx = 150 + sd * 92, cy = 48, r = 28, dir = -Math.PI / 2 + sd * 0.5, gap = 0.42;
    sticker(g, mk(p => { p.moveTo(cx + Math.cos(dir) * r * 0.12, cy + Math.sin(dir) * r * 0.12); p.arc(cx, cy, r, dir + gap, dir - gap + TAU); p.closePath(); }), R, { d: 6 });
    shine(g, cx - 11, cy - 4, 7, 3.5);
  }
};

// Pharaoh's Jackpot: a golden pyramid bursting with coins
COVERS["Pharaoh's Jackpot"] = g => {
  rays(g, 150, 84, '#56268c', '#6532a2');
  const A = [150, 18], L = [44, 150], R = [256, 150], yc = 46, hc = (yc - A[1]) / (L[1] - A[1]) * (R[0] - A[0]);
  sticker(g, pP([A, L, R]), '#ffc93a', { d: 0, then: () => fillP(g, pP([A, [176, 150], R]), '#e8961c') });
  sticker(g, pP([A, [A[0] - hc, yc], [A[0] + hc, yc]]), '#fff1a6', { d: 0 });
  ground(g, x => 148 + wav(x, 3) * 2.5, '#f2b552');
  // the eye
  sticker(g, mk(p => { p.moveTo(122, 96); p.quadraticCurveTo(150, 72, 178, 96); p.quadraticCurveTo(150, 120, 122, 96); p.closePath(); }), '#ffffff', { d: 2 });
  tube(g, p => { p.moveTo(118, 80); p.quadraticCurveTo(150, 62, 184, 80); }, INK, 4, { ink: false });
  tube(g, p => { p.moveTo(146, 106); p.quadraticCurveTo(144, 124, 132, 126); p.quadraticCurveTo(122, 126, 124, 118); }, INK, 4, { ink: false });
  tube(g, p => { p.moveTo(160, 104); p.lineTo(170, 126); }, INK, 4, { ink: false });
  sticker(g, pC(150, 96, 9), '#2fb3a8', { d: 0, lw: 2 }); fillP(g, pC(150, 96, 4.5), INK); fillP(g, pC(147, 93, 2), '#ffffff');
  // the jackpot: coins flying
  for (const [x, y, r, a] of [[72, 62, 13, -0.4], [230, 60, 14, 0.4], [98, 28, 10, -0.2], [204, 24, 10, 0.3], [34, 112, 9, 0.2], [268, 110, 9, -0.2]]) {
    sticker(g, pO(x, y, r * 0.78, r, a), '#ffd23f', { d: r * 0.28 });
    g.strokeStyle = '#c98a10'; g.lineWidth = 2; g.stroke(pO(x, y, r * 0.42, r * 0.6, a));
  }
  for (const [x, y, r] of [[124, 12, 7], [264, 26, 6], [24, 46, 6], [178, 136, 5]]) twinkle(g, x, y, r, '#fff6c0');
};

// Duke's Volcano: an angry volcano throwing lava
COVERS["Duke's Volcano"] = g => {
  rays(g, 150, 50, '#3f1228', '#501833');
  const LAVA = '#ff7a1c', HOT = '#ffd23f';
  puffs(g, [[150, 42, 16], [134, 28, 11], [167, 26, 12], [150, 12, 11]], LAVA);
  fillP(g, pC(145, 30, 5), HOT); fillP(g, pC(160, 18, 4), HOT);
  for (const [x, y, r] of [[86, 30, 8], [218, 22, 9], [52, 70, 6], [252, 66, 7], [112, 8, 5], [190, 4, 5]]) { sticker(g, pC(x, y, r), LAVA, { d: r * 0.3 }); fillP(g, pC(x - r * 0.3, y - r * 0.3, r * 0.35), HOT); }
  sticker(g, mk(p => { p.moveTo(14, 182); p.bezierCurveTo(56, 168, 90, 74, 116, 60); p.quadraticCurveTo(150, 48, 184, 60); p.bezierCurveTo(210, 74, 244, 168, 286, 182); p.closePath(); }), '#8c4a3a', { d: 10 });
  shine(g, 108, 92, 5, 16, 0.45, 0.22);
  // the lava over the top, dripping
  blobs(g, [pO(150, 62, 36, 11), pR(121, 58, 11, 30, 5.5), pR(143, 60, 13, 44, 6.5), pR(165, 58, 11, 24, 5.5)], LAVA);
  sticker(g, pO(150, 59, 25, 5.5), HOT, { d: 0, lw: 2 });
  fillP(g, pO(147, 92, 2.5, 6), HOT); fillP(g, pO(125, 76, 2, 5), HOT);
  // the face
  eye(g, 126, 118, 11, { px: 0.3, py: 0.3, brow: 1 }); eye(g, 174, 118, 11, { px: -0.3, py: 0.3, brow: -1 });
  sticker(g, mk(p => { p.moveTo(130, 136); p.quadraticCurveTo(150, 156, 170, 136); p.quadraticCurveTo(150, 142, 130, 136); p.closePath(); }), '#3a0d18', { d: 0 });
  ground(g, x => 164 + wav(x, 5) * 2, '#2b1420');
};

// Moonshot: a rocket blasting off past the Moon
COVERS['Moonshot'] = g => {
  rays(g, 150, 96, '#151d58', '#1c2668');
  sticker(g, pC(214, 74, 62), '#f5ecc8', { d: 9 });
  for (const [x, y, r] of [[194, 50, 10], [238, 96, 13], [240, 44, 6], [204, 108, 7], [176, 82, 5]]) { fillP(g, pC(x, y, r), '#e2d4a2'); inkP(g, pC(x, y, r), 2); }
  shine(g, 180, 38, 14, 5.5, -0.7);
  for (const [x, y, r] of [[34, 30, 7], [72, 66, 4], [114, 16, 5], [26, 112, 4], [286, 16, 5], [282, 146, 4]]) twinkle(g, x, y, r, '#ffe7a0');
  g.save(); g.translate(120, 84); g.rotate(0.42);
  sticker(g, mk(p => { p.moveTo(-16, 38); p.quadraticCurveTo(-20, 70, 0, 96); p.quadraticCurveTo(20, 70, 16, 38); p.closePath(); }), '#ff8a1c', { d: 0 });
  fillP(g, mk(p => { p.moveTo(-8, 40); p.quadraticCurveTo(-10, 62, 0, 78); p.quadraticCurveTo(10, 62, 8, 40); p.closePath(); }), '#ffe066');
  for (const sd of [-1, 1]) sticker(g, pP([[sd * 14, 4], [sd * 40, 30], [sd * 38, 50], [sd * 12, 40]]), '#ef3d3d', { d: 3 });
  const s = Math.asin(26 / 48);
  sticker(g, pO(0, 0, 25, 48), '#f7f5f0', { d: 7, then: () => { fillP(g, mk(p => { p.ellipse(0, 0, 25, 48, 0, Math.PI + s, TAU - s); p.closePath(); }), '#ef3d3d'); g.fillStyle = '#ef3d3d'; g.fillRect(-30, 28, 60, 7); g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-30, -26); g.lineTo(30, -26); g.stroke(); } });
  sticker(g, pC(0, -4, 10), '#5fc8ff', { d: 3 }); shine(g, -3, -8, 4, 2.2);
  sticker(g, pR(-3.5, 22, 7, 30, 3.5), '#ef3d3d', { d: 0 });
  shine(g, -14, -14, 4, 12, 0.15, 0.5);
  g.restore();
  puffs(g, [[18, 178, 22], [56, 170, 22], [94, 176, 24], [134, 172, 20], [174, 180, 22], [214, 176, 20], [252, 182, 24], [292, 174, 20]], '#ffffff', { d: 4 });
};

// Sakura Stack: a pagoda before a red sun, cherry trees
COVERS['Sakura Stack'] = g => {
  rays(g, 150, 80, '#ffbcd2', '#ffcbdc');
  sticker(g, pC(150, 66, 46), '#ff5e6c', { d: 6 });
  ground(g, x => 150 + wav(x, 4) * 2, '#7fd36e');
  // the blossom trees
  for (const sd of [-1, 1]) {
    const X = x => 150 + sd * (150 - x);
    tube(g, p => { p.moveTo(X(42), 158); p.quadraticCurveTo(X(52), 120, X(44), 92); }, '#6a3a3a', 9);
    puffs(g, [[X(28), 72, 22], [X(56), 58, 24], [X(84), 78, 20], [X(50), 94, 19], [X(18), 98, 15]], '#ff86b0', { d: 4 });
    for (const [x, y] of [[36, 66], [68, 82], [24, 94]]) { for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; fillP(g, pC(X(x) + Math.cos(a) * 3, y + Math.sin(a) * 3, 2.6), '#ffe4ee'); } fillP(g, pC(X(x), y, 1.8), '#ffc93c'); }
  }
  // the pagoda: three storeys, red walls, dark roofs swept up at the ends, a gold spire
  let y = 156;
  for (const [w, h] of [[44, 22], [36, 18], [28, 15]]) {
    sticker(g, pR(150 - w * 0.62, y - h, w * 1.24, h + 2, 2), '#e8432f', { d: 4 });
    const t = y - h;
    sticker(g, mk(p => { p.moveTo(150 - w - 15, t - 9); p.quadraticCurveTo(150 - w * 0.8, t + 3, 150 - w * 0.55, t + 2); p.lineTo(150 + w * 0.55, t + 2); p.quadraticCurveTo(150 + w * 0.8, t + 3, 150 + w + 15, t - 9); p.lineTo(150 + w * 0.4, t - 15); p.lineTo(150 - w * 0.4, t - 15); p.closePath(); }), '#3a2c44', { d: 3 });
    y = t - 13;
  }
  sticker(g, pR(143, 140, 14, 18, 4), '#3a2c44', { d: 0, lw: 2 });
  sticker(g, pR(147.5, y - 22, 5, 24, 2.5), '#ffc93c', { d: 0, lw: 2 });
  sticker(g, pC(150, y - 24, 5), '#ffc93c', { d: 1.5, lw: 2 });
};

// Pyth Plateau: a stepped pyramid against the sun
COVERS['Pyth Plateau'] = g => {
  rays(g, 150, 46, '#ffc62e', '#ffd75e');
  sticker(g, pC(150, 42, 34), '#fff3a8', { d: 0 });
  ground(g, x => 152 + wav(x, 9) * 2, '#f0954a');
  const paint = ['#20b2a6', '#e8452f', '#20b2a6', '#e8452f'];
  for (let k = 0; k < 4; k++) {
    const hw = 122 - k * 26, y0 = 158 - k * 24, y1 = y0 - 24;
    sticker(g, pP([[150 - hw, y0], [150 + hw, y0], [150 + hw - 9, y1], [150 - hw + 9, y1]]), '#f4dfb2', { d: 0, then: () => {
      fillP(g, pP([[150 + hw * 0.5, y0], [150 + hw, y0], [150 + hw - 9, y1], [150 + hw * 0.5 - 4, y1]]), '#dcbd86');
      g.fillStyle = paint[k]; g.fillRect(0, y1, W, 7); g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(0, y1 + 7); g.lineTo(W, y1 + 7); g.stroke();
    } });
  }
  sticker(g, pP([[134, 158], [166, 158], [159, 62], [141, 62]]), '#d9b47a', { d: 0, lw: 2.5, then: () => { g.strokeStyle = 'rgba(80,50,20,0.35)'; g.lineWidth = 2; for (let yy = 72; yy < 158; yy += 9) { g.beginPath(); g.moveTo(120, yy); g.lineTo(180, yy); g.stroke(); } } });
  // the temple on top
  sticker(g, pR(124, 30, 52, 32, 3), '#f7e6c0', { d: 4 });
  sticker(g, pR(141, 42, 18, 20, 3), '#3a2418', { d: 0, lw: 2 });
  sticker(g, pR(118, 22, 64, 10, 3), '#e8452f', { d: 2 });
  for (let k = 0; k < 3; k++) sticker(g, pR(128 + k * 17, 12, 10, 10, 2), '#20b2a6', { d: 0, lw: 2 });
};

// Merge Bay: a curling wave, a lighthouse island beyond
COVERS['Merge Bay'] = g => {
  rays(g, 230, 56, '#fff0c8', '#ffe4ae');
  sticker(g, pC(240, 46, 20), '#ff6a4a', { d: 3 });
  ground(g, x => 150 + Math.sin(x * 0.09) * 3, '#2c86d6');
  // the island and its lighthouse
  sticker(g, mk(p => { p.moveTo(206, 152); p.quadraticCurveTo(226, 128, 254, 126); p.quadraticCurveTo(282, 126, 300, 152); p.closePath(); }), '#6cc45a', { d: 3 });
  sticker(g, pP([[246, 130], [249, 92], [261, 92], [264, 130]]), '#ffffff', { d: 3, then: () => { g.fillStyle = '#e8452f'; g.fillRect(240, 100, 30, 8); g.fillRect(240, 116, 30, 8); } });
  sticker(g, pR(246, 82, 18, 11, 3), '#ffd23f', { d: 0, lw: 2.5 });
  sticker(g, pP([[244, 83], [255, 72], [266, 83]]), '#e8452f', { d: 0, lw: 2.5 });
  // the wave
  const wave = mk(p => {
    p.moveTo(-10, 185);
    p.bezierCurveTo(-14, 110, 20, 40, 92, 26);
    p.bezierCurveTo(150, 16, 198, 44, 202, 84);
    p.bezierCurveTo(204, 106, 180, 114, 168, 100);
    p.bezierCurveTo(184, 90, 180, 64, 156, 62);
    p.bezierCurveTo(124, 58, 104, 90, 118, 128);
    p.bezierCurveTo(126, 152, 150, 172, 176, 185);
    p.closePath();
  });
  sticker(g, wave, '#1f63c4', { d: 9, then: () => {
    g.strokeStyle = '#4d97ec'; g.lineWidth = 5; g.lineCap = 'round';
    for (const [a, b, c, d] of [[[10, 150], [6, 100], [40, 60], [84, 44]], [[40, 160], [36, 120], [60, 86], [100, 70]], [[78, 170], [70, 140], [80, 110], [108, 92]]]) { g.beginPath(); g.moveTo(...a); g.bezierCurveTo(...b, ...c, ...d); g.stroke(); }
    g.lineCap = 'butt';
  } });
  puffs(g, [[44, 46, 9], [60, 36, 11], [78, 29, 12], [98, 25, 12], [118, 24, 12], [138, 26, 12], [157, 31, 12], [174, 40, 11], [187, 52, 11], [195, 66, 10], [198, 81, 9], [192, 95, 8], [182, 104, 6.5], [170, 107, 5], [160, 105, 4]], '#ffffff', { d: 2.5 });
};

// Kernel Pretzel: the road tied in a pretzel
COVERS['Kernel Pretzel'] = g => {
  rays(g, 150, 96, '#6a4bd0', '#7858dd');
  const S = [   // the pretzel as cubic segments, left end to right end
    [[112, 160], [120, 140], [136, 118], [150, 104]], [[150, 104], [170, 84], [196, 44], [228, 44]], [[228, 44], [264, 44], [272, 104], [238, 130]],
    [[238, 130], [214, 150], [178, 158], [150, 158]], [[150, 158], [122, 158], [86, 150], [62, 130]], [[62, 130], [28, 104], [36, 44], [72, 44]],
    [[72, 44], [104, 44], [130, 84], [150, 104]], [[150, 104], [164, 118], [180, 140], [188, 160]],
  ];
  const run = (a, b) => p => { p.moveTo(...S[a][0]); for (let k = a; k <= b; k++) p.bezierCurveTo(...S[k][1], ...S[k][2], ...S[k][3]); };
  const layers = (f, cap) => { tube(g, f, '#c8782e', 30, { cap }); tube(g, f, '#4a4258', 18, { cap, ink: false }); g.setLineDash([7, 7]); tube(g, f, '#ffd23f', 2.6, { cap: 'butt', ink: false }); g.setLineDash([]); };
  g.save(); g.translate(4, 6); tube(g, run(0, 7), 'rgba(34,18,52,0.25)', 30, { ink: false }); g.restore();   // a soft drop shadow
  layers(run(0, 7), 'round');
  for (const [x, y] of [S[0][0], S[7][3]]) { fillP(g, pC(x, y, 15 + LW * 0.9), INK); fillP(g, pC(x, y, 15), '#c8782e'); fillP(g, pC(x, y, 9), '#4a4258'); }
  layers(run(0, 0), 'butt'); layers(run(6, 7), 'butt');   // the ends lie over the bottom, and the second pass crosses over the first
  for (const [x, y] of [[96, 56], [236, 58], [116, 150], [252, 100], [44, 92]]) shine(g, x, y, 4, 2, -0.4, 0.5);
};

// Pipeline Pass: a cannon fires a kart across the crevasse
COVERS['Pipeline Pass'] = g => {
  rays(g, 150, 30, '#ff9f78', '#ffb38e');
  fillP(g, pP([[88, 100], [204, 126], [196, 190], [96, 190]]), '#3b2550');
  sticker(g, pP([[-10, 190], [-10, 98], [98, 98], [112, 190]]), '#7b5c8c', { d: 7 });
  sticker(g, pP([[188, 190], [196, 124], [310, 124], [310, 190]]), '#7b5c8c', { d: 7 });
  for (const p of [pR(-16, 88, 120, 17, 8.5), pR(186, 115, 130, 17, 8.5)]) sticker(g, p, '#ffffff', { d: 3 });
  fillP(g, pC(36, 110, 5), '#ffffff'); fillP(g, pC(222, 136, 4.5), '#ffffff');
  // the cannon
  g.save(); g.translate(52, 80); g.rotate(-0.6);
  sticker(g, pR(-10, -13, 58, 26, 11), '#3a3f5a', { d: 4 }); sticker(g, pR(42, -16, 11, 32, 4), '#565d80', { d: 2 });
  shine(g, 12, -6, 14, 3, 0);
  g.restore();
  sticker(g, pC(48, 84, 13), '#b0682e', { d: 3 }); fillP(g, pC(48, 84, 4), INK);
  puffs(g, [[100, 50, 10], [112, 40, 8], [96, 36, 7]], '#ffffff', { d: 2 });
  g.save(); g.setLineDash([6, 8]); g.lineCap = 'round'; g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.beginPath(); g.moveTo(118, 34); g.quadraticCurveTo(150, 14, 178, 30); g.stroke(); g.restore();
  kart(g, 'gopher', 210, 54, 0.9, { head: 0.2, look: [1, 0.3] });
};

// Heap Space: a green wormhole, a ringed planet
COVERS['Heap Space'] = g => {
  rays(g, 156, 88, '#0c1328', '#111a36');
  for (const [x, y, r] of [[30, 120, 5], [96, 20, 4], [262, 30, 6], [280, 140, 4], [20, 160, 3.5], [214, 166, 4]]) twinkle(g, x, y, r, '#d8fff2');
  const cols = ['#0f8f86', '#2ee6b0', '#0b6a6e', '#7dffcf', '#0f8f86', '#c8fff0'];
  for (let k = 0; k < 6; k++) {
    const r = 74 * (1 - k / 6.6), p = pO(156 + k * 3, 90 - k * 1.6, r, r * 0.9, k * 0.35 - 0.2);
    fillP(g, p, cols[k]); if (k === 0) { shadeIn(g, p, 7); inkP(g, p); }
  }
  for (let k = 0; k < 3; k++) fillP(g, arm(172, 81, k / 3 * TAU, 4, 46, 2.4, 0.55, 0.9), 'rgba(255,255,255,0.28)');
  sticker(g, pC(174, 81, 8), '#ffffff', { d: 0, lw: 2.5 });
  // the ringed planet
  const ring = (a0, a1) => mk(p => p.ellipse(52, 46, 32, 9, -0.35, a0, a1));
  tube(g, f => f.addPath(ring(Math.PI, TAU)), '#ffd27a', 4);
  sticker(g, pC(52, 46, 18), '#ff8f3c', { d: 4 }); shine(g, 45, 39, 5, 2.5);
  tube(g, f => f.addPath(ring(0, Math.PI)), '#ffd27a', 4);
};

// Assembly Line: a press slamming onto the conveyor
COVERS['Assembly Line'] = g => {
  rays(g, 150, 70, '#ffbf2a', '#ffcd52');
  const hazard = (x, y, w, h) => { g.fillStyle = '#ffd23f'; g.fillRect(x, y, w, h); g.fillStyle = INK; for (let k = -2; k < w / 14 + 2; k++) { g.beginPath(); g.moveTo(x + k * 14, y + h); g.lineTo(x + k * 14 + 7, y + h); g.lineTo(x + k * 14 + 7 + h, y); g.lineTo(x + k * 14 + h, y); g.closePath(); g.fill(); } };
  sticker(g, pR(-10, 132, 320, 34, 8), '#4a4e5e', { d: 4, then: () => hazard(-10, 132, 320, 8) });
  for (let x = 20; x < 300; x += 40) sticker(g, pC(x, 154, 7), '#8a90a4', { d: 0, lw: 2 });
  ground(g, () => 168, '#3a3d4a');
  // the press: its column and pistons, the head slammed down
  for (const x of [94, 194]) sticker(g, pR(x, -10, 12, 76, 4), '#c6ccd8', { d: 3 });
  sticker(g, pR(124, -10, 52, 70, 5), '#7f8aa3', { d: 5 });
  sticker(g, pR(76, 56, 148, 74, 10), '#8f9ab2', { d: 8, then: () => hazard(76, 116, 148, 14) });
  shine(g, 104, 68, 18, 4, 0);
  for (const x of [92, 208]) sticker(g, pC(x, 84, 5), '#c6ccd8', { d: 0, lw: 2 });
  sticker(g, pC(150, 22, 10), '#ff3b2f', { d: 3 }); shine(g, 146, 18, 3.5, 2);
  puffs(g, [[66, 130, 10], [54, 120, 7], [44, 128, 6]], '#ffffff', { d: 2 }); puffs(g, [[234, 130, 10], [246, 120, 7], [256, 128, 6]], '#ffffff', { d: 2 });
  g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = 3;
  for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) { const x = 150 + sd * (84 + k * 9); g.beginPath(); g.moveTo(x, 62 + k * 10); g.lineTo(x, 80 + k * 10); g.stroke(); }
  g.lineCap = 'butt';
};

// Cron Canyon: the Cron freight's engine across the canyon
COVERS['Cron Canyon'] = g => {
  rays(g, 150, 60, '#ef6f3a', '#f6824c');
  for (const p of [pR(-20, 54, 82, 150, 12), pR(240, 44, 90, 160, 12)]) sticker(g, p, '#b9442c', { d: 6, then: () => { g.fillStyle = '#d65a36'; g.fillRect(-30, 0, 400, 62); } });
  ground(g, () => 150, '#c9562f');
  for (let x = 6; x < 300; x += 24) sticker(g, pR(x, 151, 14, 7, 2), '#6a3a2a', { d: 0, lw: 2 });
  tube(g, p => { p.moveTo(-6, 149); p.lineTo(306, 149); }, '#9aa0ae', 3);
  // the engine
  sticker(g, pO(146, 84, 12, 11), '#ffc93c', { d: 2 });
  sticker(g, pP([[166, 90], [162, 58], [186, 58], [182, 90]]), '#3a2c44', { d: 3 }); sticker(g, pR(158, 48, 32, 11, 4), '#3a2c44', { d: 0 });
  sticker(g, pR(98, 82, 108, 46, 23), '#2f6fd8', { d: 7, then: () => { g.fillStyle = '#ffc93c'; g.fillRect(128, 80, 5, 50); g.fillRect(168, 80, 5, 50); } });
  shine(g, 120, 90, 14, 3.5, 0);
  sticker(g, pR(54, 64, 54, 66, 6), '#e8402c', { d: 5 });
  sticker(g, pR(66, 76, 28, 22, 5), '#ffe08a', { d: 0, lw: 2.5 });
  sticker(g, pR(46, 54, 70, 13, 6), '#3a2c44', { d: 0 });
  sticker(g, pR(56, 122, 154, 12, 5), '#3a2c44', { d: 0 });
  sticker(g, pP([[204, 118], [232, 146], [204, 146]]), '#ffc93c', { d: 0 });
  sticker(g, pC(208, 92, 8), '#fff2a0', { d: 2 });
  for (const [x, r] of [[92, 16], [132, 16], [180, 11]]) { sticker(g, pC(x, 140 - r + 7, r), '#e8402c', { d: 3 }); fillP(g, pC(x, 140 - r + 7, r * 0.3), INK); }
  puffs(g, [[178, 34, 12], [158, 22, 14], [130, 14, 16], [100, 12, 13]], '#ffffff', { d: 3 });
};

// Cryo Caldera: a penguin among ice spikes
COVERS['Cryo Caldera'] = g => {
  rays(g, 150, 80, '#a6e2ff', '#bdeaff');
  for (const pts of [[[14, 152], [42, 56], [72, 152]], [[58, 152], [80, 100], [100, 152]], [[226, 152], [258, 66], [290, 152]], [[204, 152], [218, 112], [234, 152]]]) {
    sticker(g, pP(pts), '#6fcaf6', { d: 5 }); shine(g, pts[1][0] - 6, pts[1][1] + 26, 2.5, 12, 0.25, 0.6);
  }
  ground(g, x => 148 + wav(x, 7) * 2, '#ffffff');
  for (const sd of [-1, 1]) sticker(g, pO(150 + sd * 18, 150, 15, 6), '#ff9a2a', { d: 2 });
  for (const sd of [-1, 1]) sticker(g, pO(150 + sd * 50, 92, 10, 28, -sd * 0.75), '#26304a', { d: 3 });
  sticker(g, pO(150, 98, 48, 56), '#26304a', { d: 8 });
  sticker(g, pO(150, 112, 34, 38), '#ffffff', { d: 4, lw: 2.5 });
  shine(g, 124, 60, 9, 4, -0.7, 0.35);
  sticker(g, pR(106, 96, 88, 13, 6.5), '#e8452f', { d: 3 }); sticker(g, pR(170, 102, 13, 30, 5), '#e8452f', { d: 3 });
  eye(g, 133, 70, 11, { px: 0.15, py: 0.25 }); eye(g, 167, 70, 11, { px: -0.15, py: 0.25 });
  fillP(g, pO(122, 86, 5, 3), 'rgba(255,140,170,0.7)'); fillP(g, pO(178, 86, 5, 3), 'rgba(255,140,170,0.7)');
  sticker(g, mk(p => { p.moveTo(140, 84); p.quadraticCurveTo(150, 80, 160, 84); p.quadraticCurveTo(152, 96, 150, 96); p.quadraticCurveTo(148, 96, 140, 84); p.closePath(); }), '#ff9a2a', { d: 2, lw: 2.5 });
  for (const [x, y, r] of [[106, 28, 7], [196, 22, 6], [252, 116, 4]]) twinkle(g, x, y, r);
};

// Async Atoll: a hurricane over a tiny island
COVERS['Async Atoll'] = g => {
  rays(g, 150, 74, '#3d7c8a', '#468a98');
  ground(g, x => 150 + Math.sin(x * 0.08) * 3, '#22647e');
  sticker(g, pO(150, 156, 48, 12), '#f6d58a', { d: 2 });
  tube(g, p => { p.moveTo(136, 154); p.quadraticCurveTo(140, 126, 168, 112); }, '#9a6a3e', 6);
  for (const a of [-0.5, -0.1, 0.3, 0.7, 1.1]) sticker(g, pO(168 + Math.cos(a) * 16, 112 + Math.sin(a) * 9, 17, 5, a * 0.6), '#3fae5a', { d: 2, lw: 2.5 });
  // the hurricane
  blobs(g, [0, 1, 2].map(k => arm(150, 70, k / 3 * TAU + 0.4, 12, 82, 2.4, 1.7, 0.74)).concat([pO(150, 70, 32, 25)]), '#f5fbfb', { d: 4 });
  for (let k = 0; k < 3; k++) { g.strokeStyle = 'rgba(80,120,130,0.35)'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.ellipse(150, 70, 44 - k * 2, 33 - k * 2, 0, k * 2.1 + 0.6, k * 2.1 + 1.6); g.stroke(); }
  g.lineCap = 'butt';
  sticker(g, pO(150, 70, 9, 7.5), '#2a5a68', { d: 0 });
  shine(g, 138, 60, 6, 2.5, -0.4, 0.8);
};

// Ruby Ruins: a stone idol with ruby eyes
COVERS['Ruby Ruins'] = g => {
  rays(g, 150, 80, '#2c9650', '#35a55b');
  ground(g, x => 154 + wav(x, 2) * 2, '#1f6e3a');
  sticker(g, pR(92, 26, 116, 132, 18), '#a3a3b4', { d: 9 });
  shine(g, 110, 40, 12, 4, 0, 0.35);
  sticker(g, pR(84, 14, 132, 22, 9), '#8a8aa0', { d: 3 });
  sticker(g, pR(100, 56, 100, 13, 6), '#8a8aa0', { d: 2 });
  for (const x of [126, 174]) { sticker(g, pP([[x, 70], [x + 16, 86], [x, 102], [x - 16, 86]]), '#ff2a4a', { d: 5 }); fillP(g, pP([[x - 2, 76], [x - 9, 84], [x - 2, 84]]), 'rgba(255,255,255,0.8)'); }
  sticker(g, pR(142, 90, 16, 28, 7), '#8a8aa0', { d: 2 });
  sticker(g, pR(110, 124, 80, 22, 7), '#3a3346', { d: 0, then: () => { for (let k = 0; k < 4; k++) { fillP(g, pR(116 + k * 18, 120, 13, 11, 2), '#f2efe6'); inkP(g, pR(116 + k * 18, 120, 13, 11, 2), 2); } } });
  g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(186, 36); g.lineTo(180, 46); g.lineTo(188, 52); g.stroke();
  // jungle leaves in the corners
  const leaf = (x, y, L, a, col) => {
    g.save(); g.translate(x, y); g.rotate(a);
    sticker(g, mk(p => { p.moveTo(0, 0); p.quadraticCurveTo(L * 0.5, -L * 0.34, L, 0); p.quadraticCurveTo(L * 0.5, L * 0.34, 0, 0); p.closePath(); }), col, { d: 3 });
    g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(2, 0); g.lineTo(L * 0.85, 0); g.stroke(); g.restore();
  };
  for (const [x, y, L, a, c] of [[-10, 184, 74, -0.9, '#1f8a46'], [-14, 150, 62, -0.25, '#2fae5a'], [310, 184, 74, -2.25, '#1f8a46'], [314, 150, 62, -2.9, '#2fae5a'], [-10, -6, 60, 0.55, '#2fae5a'], [310, -6, 60, 2.6, '#2fae5a']]) leaf(x, y, L, a, c);
};

// Recursion Ridge: a road zigzagging up a mountain
COVERS['Recursion Ridge'] = g => {
  rays(g, 150, 40, '#74c6ff', '#88d0ff');
  puffs(g, [[34, 44, 10], [50, 36, 13], [66, 44, 10]], '#ffffff', { d: 2.5 }); puffs(g, [[242, 54, 9], [258, 46, 12], [274, 54, 9]], '#ffffff', { d: 2.5 });
  const mtn = mk(p => { p.moveTo(8, 184); p.lineTo(130, 36); p.quadraticCurveTo(150, 14, 170, 36); p.lineTo(292, 184); p.closePath(); });
  sticker(g, mtn, '#58b85a', { d: 11, then: () => {
    const cap = [[100, 0], [200, 0], [200, 64], [186, 56], [172, 68], [158, 56], [144, 70], [128, 58], [114, 68], [100, 60]];
    fillP(g, pP(cap), '#ffffff'); g.strokeStyle = INK; g.lineWidth = LW; g.beginPath(); cap.slice(2).forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
  } });
  const road = p => { const P = [[150, 190], [222, 152], [92, 128], [204, 104], [114, 82], [160, 60], [150, 40]]; p.moveTo(...P[0]); for (let i = 1; i < P.length - 1; i++) { const m = [(P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2]; p.quadraticCurveTo(...P[i], ...(i === P.length - 2 ? P[i + 1] : m)); } };
  tube(g, road, '#5a5668', 9);
  g.setLineDash([4, 5]); tube(g, road, '#ffffff', 1.6, { ink: false, cap: 'butt' }); g.setLineDash([]);
  ground(g, x => 166 + wav(x, 3) * 3, '#3f9a4a');
  pine(g, 34, 170, 46); pine(g, 270, 172, 40); pine(g, 58, 176, 30, '#2a7a40');
};

// Race Condition: the great clock gone haywire, gears behind
COVERS['Race Condition'] = g => {
  rays(g, 150, 90, '#985230', '#a85f3a');
  const gear = (x, y, r, n, col) => {
    sticker(g, mk(p => { for (let k = 0; k < n * 4; k++) { const a = k / (n * 4) * TAU, q = (k % 4 < 2) ? r + 8 : r; p.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } p.closePath(); }), col, { d: 4 });
    sticker(g, pC(x, y, r * 0.36), '#6a3a22', { d: 0 });
  };
  gear(58, 52, 36, 10, '#e0a43a'); gear(246, 132, 42, 12, '#c98a2e'); gear(262, 30, 20, 7, '#e0a43a');
  sticker(g, pC(150, 90, 70), '#f2b53a', { d: 8 });
  sticker(g, pC(150, 90, 57), '#fff4dc', { d: 0, lw: 2.5 });
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * TAU, c = Math.cos(a), s = Math.sin(a);
    if (k % 3 === 0) { g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.moveTo(150 + c * 42, 90 + s * 42); g.lineTo(150 + c * 51, 90 + s * 51); g.stroke(); g.lineCap = 'butt'; }
    else fillP(g, pC(150 + c * 48, 90 + s * 48, 2.6), INK);
  }
  // the hands, and the arrow sweeping backwards over the top
  tube(g, p => { p.moveTo(150, 90); p.lineTo(150 + Math.cos(-2.3) * 30, 90 + Math.sin(-2.3) * 30); }, INK, 6, { ink: false });
  tube(g, p => { p.moveTo(150, 90); p.lineTo(150 + Math.cos(-0.55) * 44, 90 + Math.sin(-0.55) * 44); }, INK, 4, { ink: false });
  sticker(g, pC(150, 90, 6), '#e8452f', { d: 0, lw: 2 });
  tube(g, p => p.arc(150, 90, 84, -0.35, -1.75, true), '#e8452f', 6, { cap: 'butt' });
  const a = -1.75, tx = 150 + Math.cos(a) * 84, ty = 90 + Math.sin(a) * 84, ux = Math.sin(a), uy = -Math.cos(a), nx = Math.cos(a), ny = Math.sin(a);   // u: along the arrow's way (anticlockwise)
  sticker(g, pP([[tx - ux * 14, ty - uy * 14], [tx + nx * 11, ty + ny * 11], [tx - nx * 11, ty - ny * 11]].map(([x, y]) => [x + ux * 2, y + uy * 2])), '#e8452f', { d: 0 });
};

// Neon Overflow: a neon skyline in the rain
COVERS['Neon Overflow'] = g => {
  const BG = '#2b0f52';
  rays(g, 150, 96, BG, '#33145f');
  sticker(g, pC(150, 84, 54), '#ff3fa4', { d: 0, then: () => { g.fillStyle = BG; let y = 92; for (let k = 0; k < 5; k++) { const h = 2 + k * 1.3; g.fillRect(0, y, W, h); y += h + 8 - k; } } });
  const blds = [[-6, 92, 40, '#3ff0ff'], [30, 62, 34, '#ff4fd8'], [64, 104, 30, '#3ff0ff'], [92, 124, 28, '#ffd23f'], [180, 118, 30, '#3ff0ff'], [206, 94, 28, '#ff4fd8'], [232, 54, 38, '#3ff0ff'], [268, 86, 40, '#ffd23f']];
  for (const [x, y, w, c] of blds) {
    sticker(g, pR(x, y, w, 160 - y, 3), '#1a0836', { d: 0 });
    tube(g, p => { p.moveTo(x + 4, y + 4); p.lineTo(x + w - 4, y + 4); }, c, 2.5, { ink: false });
    for (let k = 0; y + 16 + k * 16 < 146; k++) for (const u of [0.3, 0.7]) if ((k + u * 10 + x) % 3 > 1) fillP(g, pR(x + w * u - 3, y + 14 + k * 16, 6, 7, 1.5), 'rgba(255,214,90,0.85)');
  }
  sticker(g, pR(40, 72, 9, 34, 4), '#ff4fd8', { d: 0, lw: 2.5 }); sticker(g, pR(244, 66, 10, 30, 4), '#3ff0ff', { d: 0, lw: 2.5 });
  ground(g, () => 152, '#170830');
  for (const [x, w, c] of [[106, 88, '#ff3fa4'], [124, 52, '#ff3fa4'], [138, 24, '#ff3fa4'], [30, 20, '#ff4fd8'], [248, 22, '#3ff0ff']]) for (let k = 0; k < 4; k++) fillP(g, pR(x + (k % 2) * 6, 158 + k * 5.5, w - k * w * 0.18, 2.6, 1.3), c);
  g.strokeStyle = 'rgba(160,232,255,0.75)'; g.lineWidth = 1.8; g.lineCap = 'round';
  for (let k = 0; k < 16; k++) { const x = (k * 71) % 300 + 6, y = (k * 47) % 130 + 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 4, y + 13); g.stroke(); }
  g.lineCap = 'butt';
};

// Gateway 8080: a jet climbing off the runway
COVERS['Gateway 8080'] = g => {
  rays(g, 150, 90, '#3aa6ff', '#4db2ff');
  puffs(g, [[38, 140, 12], [58, 130, 16], [80, 140, 12]], '#ffffff', { d: 2.5 }); puffs(g, [[224, 34, 10], [242, 26, 14], [262, 34, 10]], '#ffffff', { d: 2.5 });
  ground(g, () => 156, '#4a4e5e');
  for (let x = 4; x < 300; x += 44) fillP(g, pR(x, 166, 24, 4, 2), '#ffffff');
  g.lineCap = 'round'; g.strokeStyle = '#ffffff'; g.lineWidth = 3;
  for (const [x, y, l] of [[44, 98, 26], [36, 110, 34], [50, 120, 20]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x - l, y + l * 0.29); g.stroke(); }
  g.lineCap = 'butt';
  g.save(); g.translate(156, 84); g.rotate(-0.28);
  const ORANGE = '#ff7a2a';
  sticker(g, pP([[-6, -8], [30, -42], [44, -42], [32, -8]]), '#b8c4d8', { d: 2 });
  sticker(g, pP([[-82, -10], [-104, -50], [-88, -52], [-56, -10]]), ORANGE, { d: 3 });
  sticker(g, pR(-102, -18, 194, 36, 18), '#ffffff', { d: 6, then: () => {
    g.fillStyle = ORANGE; g.fillRect(-110, 4, 210, 6);
    for (let x = -64; x < 54; x += 13) fillP(g, pC(x, -5, 2.8), '#3a6fa8');
    fillP(g, pP([[66, -13], [80, -11], [86, -3], [68, -3]]), '#2a3a5a');
  } });
  sticker(g, pP([[-92, 2], [-114, 16], [-102, 18], [-76, 8]]), '#b8c4d8', { d: 2 });
  sticker(g, pP([[-22, 6], [24, 6], [-6, 56], [-22, 56]]), '#d8e0ec', { d: 3 });
  sticker(g, pR(-4, 22, 32, 15, 7.5), '#8a93a8', { d: 3 }); fillP(g, pO(26, 29.5, 3, 6.5), INK);
  g.restore();
};

// Gradient Descent: a kart flying off a ski jump
COVERS['Gradient Descent'] = g => {
  rays(g, 160, 40, '#2c5fd6', '#386be2');
  sticker(g, mk(p => { p.moveTo(150, 184); p.lineTo(232, 74); p.quadraticCurveTo(244, 60, 256, 74); p.lineTo(330, 184); p.closePath(); }), '#d2defa', { d: 6 });
  sticker(g, mk(p => { p.moveTo(-30, 184); p.lineTo(90, 34); p.quadraticCurveTo(108, 12, 126, 34); p.lineTo(250, 184); p.closePath(); }), '#f4f8ff', { d: 10 });
  ground(g, x => 158 + wav(x, 8) * 2, '#ffffff');
  for (const [x, y] of [[124, 134], [152, 140], [178, 134]]) tube(g, p => { p.moveTo(x, y); p.lineTo(x, 160); }, '#a0622e', 5);
  const top = p => { p.moveTo(72, 58); p.quadraticCurveTo(116, 134, 166, 130); p.quadraticCurveTo(182, 128, 194, 114); };
  sticker(g, mk(p => { top(p); p.lineTo(196, 124); p.quadraticCurveTo(182, 140, 164, 140); p.quadraticCurveTo(108, 142, 66, 64); p.closePath(); }), '#e8452f', { d: 3 });
  g.save(); g.translate(0, 3.5); tube(g, top, '#ffffff', 2.4, { ink: false }); g.restore();
  pine(g, 270, 164, 40); pine(g, 26, 170, 30);
  g.lineCap = 'round'; g.strokeStyle = '#ffffff'; g.lineWidth = 3;
  for (const [x, y, l] of [[198, 84, 22], [194, 95, 30], [202, 105, 18]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x - l, y + l * 0.26); g.stroke(); }
  g.lineCap = 'butt';
  kart(g, 'octo', 230, 84, 0.85, { head: -0.26, look: [1, -0.3] });
};

// ------------------------------------------------------------------------------------------------ drawing and caching
// a track with no cover yet: a plain card
function fallback(g) { rays(g, 150, 90, '#3a4a6a', '#41527a'); }
export function drawCover(g, name, w, h, t = 0) {
  const k = Math.max(w / W, h / H);
  g.save(); g.beginPath(); g.rect(0, 0, w, h); g.clip();
  g.translate((w - W * k) / 2, (h - H * k) / 2); g.scale(k, k);
  g.lineJoin = 'round'; g.lineCap = 'butt';
  try { (COVERS[name] || fallback)(g, t); } finally { g.restore(); }
}
export const coverNames = () => Object.keys(COVERS);
// cached at 2x the 300x180 box (crisp up to ~300 CSS px), keyed by the look (flat karts differ)
const cache = new Map(), keyOf = name => name + '|' + lookGen();
// one cover drawn into a new canvas (a page canvas, or an OffscreenCanvas on the painter's worker: art/paint-worker.js)
export function coverPicture(name) { const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2; drawCover(c.getContext('2d'), name, c.width, c.height); return c; }
function coverBase(name) {
  const key = keyOf(name);
  if (!cache.has(key)) { const c = coverPicture(name); cache.set(key, c); if (covers.onDrawn) covers.onDrawn(name, c); }
  return cache.get(key);
}
// for thumb-store.js: put (a restored canvas or ImageBitmap) and onDrawn(name, canvas)
export const covers = { put: (name, img) => { if (!cache.has(keyOf(name))) cache.set(keyOf(name), img); }, onDrawn: null };
export const coverReady = name => cache.has(keyOf(name));
export function coverThumb(name, w, h) {
  const src = coverBase(name), c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
  const k = Math.max(c.width / src.width, c.height / src.height), g = c.getContext('2d');
  g.imageSmoothingQuality = 'high'; g.drawImage(src, (c.width - src.width * k) / 2, (c.height - src.height * k) / 2, src.width * k, src.height * k);
  c.setAttribute('aria-hidden', 'true'); c.className = 'cover';
  return c;
}
export { coverBase as warmCover };
