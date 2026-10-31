// Silicon Circuit's circuit board (deco 'chips'): solder mask, copper pours, traces routed like a real board's, parts
// in little circuits, the CPU and RAM landmarks. Planned once per track (boardPlan, own seed); the race reads none of it.
import { TAU, mulberry } from '../core.js';
import { trackSample } from '../geometry.js';
import { alpha, circ, linear, poly, radial, shade } from './paint.js';

// the board's colours: a deep navy solder mask, the copper under it a shade lighter, gold (ENIG) where it's bare
export const PCB = {
  mask: '#14223c', mask2: '#18294a', pour: '#1b2f54', trace: '#23406e', traceHi: '#3a5f96', traceLo: '#0d1830',
  gold: '#d6af58', goldHi: '#f7e3a6', goldDk: '#8f6b2c', silk: '#e9edf3', hole: '#05080f', shadow: 'rgba(2,6,16,0.42)',
};
const SH = PCB.shadow, CHANNEL = 78;   // the pour stops this far past the road's edge
// the road's outline `off` past its edge: a closed ribbon along a route
function band(R, off) {
  const p = new Path2D(), edge = (i, sd) => [R.pts[i][0] - R.tan[i][1] * sd * (R.hw[i] + off), R.pts[i][1] + R.tan[i][0] * sd * (R.hw[i] + off)];
  for (let i = 0; i < R.N; i++) { const [x, y] = edge(i, 1); i ? p.lineTo(x, y) : p.moveTo(x, y); }
  p.closePath(); const q = new Path2D();
  for (let i = R.N - 1; i >= 0; i--) { const [x, y] = edge(i, -1); i < R.N - 1 ? q.lineTo(x, y) : q.moveTo(x, y); }
  q.closePath(); p.addPath(q); return p;
}

// ---------------------------------------------------------------- small helpers
const rnd = (rng, a, b) => a + rng() * (b - a);
function chamfer(x0, y0, x1, y1, c) { return [[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]]; }
// a polyline moved sideways by o (mitred at the bends), for the parallel traces of a bus
function offsetPath(P, o) {
  const n = P.length, nrm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
  return P.map((p, k) => {
    const a = k > 0 ? nrm(P[k - 1], p) : null, b = k < n - 1 ? nrm(p, P[k + 1]) : null;
    if (!a || !b) { const m = a || b; return [p[0] + m[0] * o, p[1] + m[1] * o]; }
    const mx = a[0] + b[0], my = a[1] + b[1], ml = Math.hypot(mx, my) || 1, c = (mx * a[0] + my * a[1]) / ml;
    return [p[0] + mx / ml * o / Math.max(c, 0.3), p[1] + my / ml * o / Math.max(c, 0.3)];
  });
}
// an octilinear route from a to b: straight, one 45° run, straight (as a router lays a trace)
function octi(a, b, horiz) {
  const dx = b[0] - a[0], dy = b[1] - a[1], ax = Math.abs(dx), ay = Math.abs(dy), sx = Math.sign(dx) || 1, sy = Math.sign(dy) || 1;
  if (horiz ? ax >= ay : ax > ay) { const h = (ax - ay) / 2; return [a, [a[0] + sx * h, a[1]], [a[0] + sx * (h + ay), b[1]], b]; }
  const h = (ay - ax) / 2; return [a, [a[0], a[1] + sy * h], [b[0], a[1] + sy * (h + ax)], b];
}
// samples along a polyline every `step`
function along(P, step, f) { for (let k = 0; k < P.length - 1; k++) { const [x0, y0] = P[k], [x1, y1] = P[k + 1], l = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(l / step)); for (let i = 0; i <= n; i++) if (f(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n) === false) return false; } return true; }

// a coarse occupancy grid, so parts, traces and labels don't land on each other
function occupancy() {
  const C = 14, s = new Set(), key = (i, j) => i * 65536 + j;
  const cells = (x0, y0, x1, y1, f) => { for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) for (let j = Math.floor(y0 / C); j <= Math.floor(y1 / C); j++) if (f(key(i, j)) === false) return false; return true; };
  return {
    free: (x0, y0, x1, y1) => cells(x0, y0, x1, y1, k => !s.has(k)),
    take: (x0, y0, x1, y1) => cells(x0, y0, x1, y1, k => { s.add(k); }),
    freeLine: (P, r) => along(P, 7, (x, y) => cells(x - r, y - r, x + r, y + r, k => !s.has(k))),
    takeLine: (P, r) => along(P, 7, (x, y) => { cells(x - r, y - r, x + r, y + r, k => { s.add(k); }); }),
  };
}

// ---------------------------------------------------------------- the parts, each drawn about its own middle
const pad = (g, x, y, w, h) => { g.fillStyle = PCB.gold; g.fillRect(x - w / 2, y - h / 2, w, h); g.fillStyle = alpha(PCB.goldHi, 0.7); g.fillRect(x - w / 2, y - h / 2, w, Math.min(1, h * 0.3)); };
const thPad = (g, x, y, r) => { circ(g, x, y, r); g.fillStyle = PCB.gold; g.fill(); circ(g, x - r * 0.15, y - r * 0.15, r * 0.75); g.fillStyle = alpha(PCB.goldHi, 0.35); g.fill(); circ(g, x, y, r * 0.42); g.fillStyle = PCB.hole; g.fill(); };
export function via(g, x, y, r = 4) { circ(g, x, y, r + 2.2); g.fillStyle = PCB.mask; g.fill(); circ(g, x, y, r); g.fillStyle = PCB.gold; g.fill(); circ(g, x - r * 0.2, y - r * 0.25, r * 0.55); g.fillStyle = alpha(PCB.goldHi, 0.45); g.fill(); circ(g, x, y, r * 0.42); g.fillStyle = PCB.hole; g.fill(); }
const silkLine = (g, w = 1.3) => { g.strokeStyle = alpha(PCB.silk, 0.62); g.lineWidth = w; };
function silkText(g, t, x, y, size, align = 'center', a = 0.66, weight = 700) { g.fillStyle = alpha(PCB.silk, a); g.font = `${weight} ${size}px ui-monospace, Menlo, monospace`; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(t, x, y); }
function body(g, x, y, w, h, r = 2, col = '#24272f') {   // a moulded package, lit from the top left
  g.fillStyle = linear(g, x - w / 2, y - h / 2, x + w / 2, y + h / 2, [[0, shade(col, 0.16)], [1, shade(col, -0.35)]]); g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, r); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - w / 2 + 1, y + h / 2 - r); g.lineTo(x - w / 2 + 1, y - h / 2 + 1); g.lineTo(x + w / 2 - r, y - h / 2 + 1); g.stroke();
}
function smd(g, x, y, vert, kind = 0) {   // an 0603: tinned ends, a tan (capacitor) or black (resistor) body
  g.save(); g.translate(x, y); if (vert) g.rotate(Math.PI / 2);
  pad(g, -4.6, 0, 3.6, 5.6); pad(g, 4.6, 0, 3.6, 5.6);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-4.6, -2.2, 10.4, 5.4);
  g.fillStyle = '#cfd4da'; g.fillRect(-5.4, -2.6, 2.6, 5.2); g.fillRect(2.8, -2.6, 2.6, 5.2);
  g.fillStyle = kind ? '#1c1d22' : '#c6955a'; g.fillRect(-2.8, -2.6, 5.6, 5.2);
  if (kind) { g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(-1.4, -0.6, 2.8, 1.2); } else { g.fillStyle = 'rgba(255,240,210,0.35)'; g.fillRect(-2.8, -2.6, 5.6, 1.4); }
  g.restore();
}
function ecap(g, x, y, R, col, rot = 0) {   // an electrolytic can from above: the sleeve's rim with its polarity stripe, the scored top
  circ(g, x, y, R + 3.5); silkLine(g); g.stroke();
  g.save(); g.beginPath(); g.arc(x, y, R + 3.5, rot + 0.7, rot + Math.PI - 0.7); g.closePath(); g.clip(); circ(g, x, y, R + 3.5); g.fillStyle = alpha(PCB.silk, 0.35); g.fill(); g.restore();
  circ(g, x, y, R); g.fillStyle = radial(g, x - R * 0.4, y - R * 0.4, 1, x, y, R, [[0, shade(col, 0.35)], [1, shade(col, -0.25)]]); g.fill();
  g.beginPath(); g.arc(x, y, R, rot - 0.55, rot + 0.55); g.arc(x, y, R * 0.8, rot + 0.55, rot - 0.55, true); g.closePath(); g.fillStyle = 'rgba(225,230,238,0.85)'; g.fill();
  circ(g, x, y, R * 0.8); g.fillStyle = radial(g, x - R * 0.3, y - R * 0.35, 1, x, y, R * 0.8, [[0, '#f5f7fa'], [0.6, '#c7cdd5'], [1, '#8e96a1']]); g.fill();
  circ(g, x, y, R * 0.8); g.strokeStyle = 'rgba(60,66,78,0.45)'; g.lineWidth = 1; g.stroke();
  const k = R * 0.42; g.lineCap = 'round';
  for (const [o, c] of [[0.7, 'rgba(255,255,255,0.7)'], [0, 'rgba(70,76,88,0.75)']]) {   // the scored K (a groove: dark, with a lit lower lip)
    g.strokeStyle = c; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - k * 0.55 + o, y - k + o); g.lineTo(x - k * 0.55 + o, y + k + o); g.moveTo(x + k * 0.7 + o, y - k + o); g.lineTo(x - k * 0.5 + o, y + o); g.lineTo(x + k * 0.7 + o, y + k + o); g.stroke();
  }
}
function capShadow(g, x, y, R, h = 1) { circ(g, x + 6 * h, y + 9 * h, R); g.fillStyle = SH; g.fill(); }
function ledDome(g, x, y, col) {   // a 5 mm LED from above: a tinted dome with its flat side, a lit spot
  circ(g, x, y, 10); silkLine(g, 1.2); g.stroke();
  g.beginPath(); g.arc(x, y, 7.6, -Math.PI * 0.8 + Math.PI / 2, Math.PI * 0.8 + Math.PI / 2, true); g.closePath(); g.fillStyle = shade(col, -0.35); g.fill();
  circ(g, x, y, 6.6); g.fillStyle = radial(g, x - 2.2, y - 2.6, 0.5, x, y, 6.6, [[0, '#ffffff'], [0.25, shade(col, 0.5)], [0.7, col], [1, shade(col, -0.3)]]); g.fill();
}
function thRes(g, x, y, len, bands) {   // a through-hole resistor lying flat: pads, leads bent down, a capsule body with colour bands
  thPad(g, x - len / 2, y, 5); thPad(g, x + len / 2, y, 5);
  g.strokeStyle = '#c3c8cf'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(x - len / 2, y); g.lineTo(x + len / 2, y); g.stroke();
  const w = len * 0.56, h = 10;
  g.fillStyle = linear(g, 0, y - h / 2, 0, y + h / 2, [[0, '#f3dfb2'], [0.45, '#dcbf86'], [1, '#a98552']]); g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, h / 2); g.fill();
  bands.forEach((c, k) => { const bx = x - w * 0.32 + k * w * 0.17 + (k === bands.length - 1 ? w * 0.1 : 0); g.fillStyle = linear(g, 0, y - h / 2, 0, y + h / 2, [[0, shade(c, 0.25)], [1, shade(c, -0.3)]]); g.fillRect(bx, y - h / 2 + 0.4, w * 0.08, h - 0.8); });
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.roundRect(x - w / 2 + 3, y - h / 2 + 1.5, w - 6, 2, 1); g.fill();
}
const BANDS = [['#7a4524', '#16161a', '#d8461e', '#cfa53a'], ['#e3c22b', '#7a3fb0', '#7a4524', '#cfa53a'], ['#d8461e', '#d8461e', '#7a4524', '#b9bec6'], ['#3a6fd8', '#8a8f98', '#16161a', '#cfa53a']];
function soic(g, x, y, n, w, h, label) {   // a chip with gull-wing legs down its two long sides
  const pitch = w / n;
  for (let k = 0; k < n; k++) { const px = x - w / 2 + (k + 0.5) * pitch; pad(g, px, y - h / 2 - 5, pitch * 0.55, 7); pad(g, px, y + h / 2 + 5, pitch * 0.55, 7); g.fillStyle = '#c9ced6'; g.fillRect(px - pitch * 0.2, y - h / 2 - 6, pitch * 0.4, 6); g.fillRect(px - pitch * 0.2, y + h / 2, pitch * 0.4, 6); }
  body(g, x, y, w + 2, h, 2);
  circ(g, x - w / 2 + 4, y + h / 2 - 4, 1.8); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fill();
  g.fillStyle = 'rgba(214,219,226,0.78)'; g.font = `700 ${Math.min(h * 0.38, 8)}px ui-monospace, Menlo, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, x, y + 0.5);
}
function qfp(g, x, y, s, n, label, code) {   // a square chip with legs on all four sides
  const pitch = s / n;
  for (let k = 0; k < n; k++) {
    const o = -s / 2 + (k + 0.5) * pitch, L = 8;
    for (const [px, py, w, h] of [[x + o, y - s / 2 - L / 2 - 1, pitch * 0.55, L], [x + o, y + s / 2 + L / 2 + 1, pitch * 0.55, L], [x - s / 2 - L / 2 - 1, y + o, L, pitch * 0.55], [x + s / 2 + L / 2 + 1, y + o, L, pitch * 0.55]]) pad(g, px, py, w, h);
    g.fillStyle = '#c9ced6'; g.fillRect(x + o - pitch * 0.18, y - s / 2 - 5, pitch * 0.36, 5); g.fillRect(x + o - pitch * 0.18, y + s / 2, pitch * 0.36, 5); g.fillRect(x - s / 2 - 5, y + o - pitch * 0.18, 5, pitch * 0.36); g.fillRect(x + s / 2, y + o - pitch * 0.18, 5, pitch * 0.36);
  }
  body(g, x, y, s, s, 2.5);
  circ(g, x - s / 2 + 6, y - s / 2 + 6, 2.6); g.fillStyle = 'rgba(0,0,0,0.45)'; g.fill(); circ(g, x - s / 2 + 5.5, y - s / 2 + 5.5, 2.6); g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 0.8; g.stroke();
  g.fillStyle = 'rgba(214,219,226,0.8)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${s * 0.17}px ui-monospace, Menlo, monospace`; g.fillText(label, x, y - s * 0.08);
  g.font = `500 ${s * 0.11}px ui-monospace, Menlo, monospace`; g.fillStyle = 'rgba(214,219,226,0.5)'; g.fillText(code, x, y + s * 0.16);
}
function crystal(g, x, y, w, h, vert) {   // an HC-49 can: rounded, silver, a pressed rim, the frequency stamped on it
  if (vert) { g.save(); g.translate(x, y); g.rotate(Math.PI / 2); x = 0; y = 0; }
  thPad(g, x - w * 0.28, y, 4.2); thPad(g, x + w * 0.28, y, 4.2);
  g.fillStyle = linear(g, 0, y - h / 2, 0, y + h / 2, [[0, '#f6f8fa'], [0.45, '#c8cdd4'], [1, '#858c97']]); g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, h / 2); g.fill();
  g.strokeStyle = 'rgba(80,86,98,0.55)'; g.lineWidth = 1; g.beginPath(); g.roundRect(x - w / 2 + 2.5, y - h / 2 + 2.5, w - 5, h - 5, h / 2 - 2.5); g.stroke();
  g.fillStyle = 'rgba(60,64,74,0.8)'; g.font = `700 ${h * 0.36}px ui-monospace, Menlo, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('16.000', x, y + 0.5);
  if (vert) g.restore();
}
function heatsinkFins(g, x, y, w, h, n) {   // an extruded heatsink from above: fins across it, each lit on its left face
  g.fillStyle = linear(g, x - w / 2, y, x + w / 2, y, [[0, '#9aa2ad'], [1, '#5f6772']]); g.fillRect(x - w / 2, y - h / 2, w, h);
  const fw = w / n;
  for (let k = 0; k < n; k++) { const fx = x - w / 2 + k * fw; g.fillStyle = linear(g, fx, 0, fx + fw * 0.62, 0, [[0, '#f4f6f9'], [1, '#a7afba']]); g.fillRect(fx + 0.6, y - h / 2, fw * 0.62, h); g.fillStyle = 'rgba(20,24,32,0.35)'; g.fillRect(fx + fw * 0.62 + 0.6, y - h / 2, fw * 0.38 - 1.2, h); }
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1; g.strokeRect(x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h - 1);
}
function toroid(g, x, y, R) {   // a toroidal inductor: copper wire wound round a ring, the board showing through the hole
  const r = R * 0.42;
  circ(g, x, y, R); g.fillStyle = '#7a4a22'; g.fill();
  for (let k = 0; k < 34; k++) {
    const a = k / 34 * TAU, c = Math.cos(a), s = Math.sin(a), lit = Math.max(0, -(c * 0.6 + s * 0.8));
    g.strokeStyle = `rgb(${Math.round(176 + 70 * lit)},${Math.round(104 + 70 * lit)},${Math.round(52 + 60 * lit)})`; g.lineWidth = 2.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x + c * (r + 1), y + s * (r + 1)); g.lineTo(x + c * (R - 1.2), y + s * (R - 1.2)); g.stroke();
  }
  circ(g, x, y, R); g.fillStyle = radial(g, x - R * 0.35, y - R * 0.35, 0, x, y, R, [[0, 'rgba(255,240,210,0.25)'], [0.6, 'rgba(255,240,210,0)'], [1, 'rgba(40,16,0,0.3)']]); g.fill();
  circ(g, x, y, r); g.fillStyle = PCB.mask; g.fill(); circ(g, x + 1.5, y + 2, r - 1); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
}

// the circuits: each a group of parts with half-extents hx, hy (before turning by rot, 0 or 90°), a reference
// number and its own traces; `sh` draws its shadow, `draw` the parts
const MODS = {
  mcu: { hx: 82, hy: 60, w: 3,
    sh(g, m) { g.fillRect(-36 + 3, -36 + 4, 72, 72); },
    draw(g, m, rng) {
      g.strokeStyle = alpha(PCB.silk, 0.6); g.lineWidth = 1.4; for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.moveTo(sx * 50, sy * 38); g.lineTo(sx * 50, sy * 50); g.lineTo(sx * 38, sy * 50); g.stroke(); }
      circ(g, -54, -54, 2.2); g.fillStyle = alpha(PCB.silk, 0.7); g.fill();
      qfp(g, 0, 0, 56, 12, ['KK-RISC', 'ARM-K7', 'KERN-32'][m.k % 3], '2611 A3');
      for (const [x, y, v] of [[-44, -44, 1], [44, -44, 1], [-44, 44, 1], [44, 44, 1]]) smd(g, x, y, v);
      crystal(g, 70, 0, 38, 14, true); smd(g, 70, -32, 0); smd(g, 70, 32, 0);
      silkText(g, 'U' + (1 + m.k), -60, 58, 9, 'left'); silkText(g, 'Y' + (1 + m.k), 80, -46, 8);
    } },
  logic: { hx: 46, hy: 74, w: 3,
    sh(g, m) { for (const y of [-46, 0, 46]) g.fillRect(-21 + 2, y - 10 + 3, 44, 20); },
    draw(g, m, rng) {
      [-46, 0, 46].forEach((y, k) => { soic(g, 0, y, 7, 38, 18, ['74HC08', '74HC32', '74HC86', '74LS00', 'NAND2'][(m.k + k) % 5]); silkText(g, 'U' + (10 + m.k * 3 + k), -30, y, 7, 'right'); smd(g, 34, y, 1, 0); });
    } },
  power: { hx: 92, hy: 34, w: 2,
    sh(g, m) { for (const x of [-70, -36]) { circ(g, x + 6, 9, 16); g.fill(); } circ(g, 10 + 4, 6, 23); g.fill(); g.fillRect(40 + 8, -19 + 11, 44, 36); },
    draw(g, m, rng) {
      const col = ['#1f3b8c', '#191a20', '#c49a2c'][m.k % 3];
      ecap(g, -70, 0, 16, col, Math.PI / 2); ecap(g, -36, 0, 16, col, Math.PI / 2);
      toroid(g, 10, 0, 23);
      for (const lx of [-8, 0, 8]) { g.fillStyle = '#c9ced6'; g.fillRect(62 + lx - 1.5, 17, 3, 9); thPad(g, 62 + lx, 27, 3.2); }
      heatsinkFins(g, 62, -2, 44, 36, 9);
      silkText(g, 'C' + (20 + m.k * 2), -70, 27, 7); silkText(g, 'C' + (21 + m.k * 2), -36, 27, 7); silkText(g, 'L' + (1 + m.k), 10, 30, 7); silkText(g, 'VR' + (1 + m.k), 88, 28, 7);
    } },
  leds: { hx: 54, hy: 30, w: 2, leds: [[-39, -6], [-13, -6], [13, -6], [39, -6]],
    sh(g, m) { for (const [x, y] of this.leds) { circ(g, x + 2.5, y + 3.5, 7); g.fill(); } },
    draw(g, m, rng) {
      const L = ['PWR', 'CPU', 'NET', 'I/O'];
      this.leds.forEach(([x, y], k) => { ledDome(g, x, y, LED_COLS[(m.k + k) % 4]); smd(g, x, y + 20, 0, 1); silkText(g, L[k], x, y - 19, 7); });
    } },
  resbank: { hx: 40, hy: 38, w: 2,
    sh(g, m) { for (const y of [-27, -9, 9, 27]) g.fillRect(-10 + 2, y - 5 + 3, 20, 10); },
    draw(g, m, rng) { [-27, -9, 9, 27].forEach((y, k) => { thRes(g, 0, y, 58, BANDS[(m.k + k) % 4]); }); silkText(g, 'R' + (30 + m.k * 4) + '-' + (33 + m.k * 4), 0, 42, 7); } },
  header: { hx: 54, hy: 22, w: 1,
    sh(g, m) { g.fillRect(-44 + 4, -11 + 5, 88, 22); },
    draw(g, m, rng) {
      g.strokeStyle = alpha(PCB.silk, 0.6); g.lineWidth = 1.3; g.strokeRect(-47, -14, 94, 28);
      body(g, 0, 0, 88, 22, 1.5, '#1d1f25');
      for (let k = 0; k < 8; k++) for (const y of [-5.5, 5.5]) { const x = -38.5 + k * 11; g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x - 2.4, y - 2.4, 5.6, 5.6); g.fillStyle = linear(g, x - 2.2, y - 2.2, x + 2.2, y + 2.2, [[0, PCB.goldHi], [1, PCB.goldDk]]); g.fillRect(x - 2.4, y - 2.4, 4.8, 4.8); }
      g.fillStyle = alpha(PCB.silk, 0.7); g.fillRect(-48, -14, 3, 3);
      silkText(g, ['GPIO', 'JTAG', 'UART', 'SPI'][m.k % 4], 0, 21, 7); silkText(g, 'J' + (1 + m.k), -52, 0, 7, 'right');
    } },
  coin: { hx: 36, hy: 32, w: 1,
    sh(g, m) { circ(g, 4, 6, 25); g.fill(); },
    draw(g, m, rng) {
      g.fillStyle = '#202228'; g.beginPath(); g.roundRect(-33, -12, 66, 24, 4); g.fill(); pad(g, -30, 0, 6, 10); pad(g, 30, 0, 6, 10);
      circ(g, 0, 0, 24); g.fillStyle = radial(g, -8, -9, 1, 0, 0, 24, [[0, '#f7f8fa'], [0.55, '#c3c9d1'], [1, '#848c97']]); g.fill();
      circ(g, 0, 0, 19); g.strokeStyle = 'rgba(80,88,100,0.45)'; g.lineWidth = 1.2; g.stroke();
      g.fillStyle = 'rgba(70,76,88,0.75)'; g.font = '700 7px ui-monospace, Menlo, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CR2032', 0, 5); g.font = '700 11px ui-monospace, Menlo, monospace'; g.fillText('+', 0, -6);
      silkText(g, 'BAT' + (1 + m.k), 0, 31, 7);
    } },
  bigcap: { hx: 54, hy: 30, w: 1,
    sh(g, m) { capShadow(g, -22, 0, 26, 1.3); capShadow(g, 30, 4, 19, 1.1); },
    draw(g, m, rng) { const col = ['#191a20', '#1f3b8c', '#c49a2c'][m.k % 3]; ecap(g, -22, 0, 26, col, Math.PI * 0.75); ecap(g, 30, 4, 19, col, Math.PI * 0.75); silkText(g, 'C' + (40 + m.k), 30, -22, 7); } },
  osc: { hx: 30, hy: 22, w: 1,
    sh(g, m) { g.fillRect(-19 + 2, -7 + 3, 38, 14); },
    draw(g, m, rng) { crystal(g, 0, -4, 38, 14, false); smd(g, -12, 14, 0); smd(g, 12, 14, 0); silkText(g, 'X' + (1 + m.k), 26, -4, 7, 'left'); } },
  smd: { hx: 26, hy: 18, w: 2,
    sh(g, m) { },
    draw(g, m, rng) { for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) smd(g, -16 + i * 16, -7 + j * 14, 0, (i + j + m.k) % 2); } },
  chipset: { hx: 50, hy: 50, w: 2,
    sh(g, m) { g.fillRect(-36 + 8, -36 + 11, 72, 72); },
    draw(g, m, rng) {   // a chipset under a pin-fin heatsink: a grid of square pins, each lit on its top-left faces
      g.strokeStyle = alpha(PCB.silk, 0.6); g.lineWidth = 1.3; g.strokeRect(-44, -44, 88, 88);
      for (const [x, y] of [[-42, -42], [42, -42], [-42, 42], [42, 42]]) { thPad(g, x, y, 4.6); g.fillStyle = '#e8ebef'; circ(g, x, y, 2.4); g.fill(); }
      g.fillStyle = linear(g, -36, -36, 36, 36, [[0, '#5b6574'], [1, '#2c333e']]); g.beginPath(); g.roundRect(-36, -36, 72, 72, 4); g.fill();
      const n = 7, p = 72 / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const x = -36 + (i + 0.5) * p, y = -36 + (j + 0.5) * p, s = p * 0.62; g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x - s / 2 + 1.5, y - s / 2 + 2, s, s); g.fillStyle = linear(g, x - s / 2, y - s / 2, x + s / 2, y + s / 2, [[0, '#f4f6f9'], [0.5, '#b8c0ca'], [1, '#7b8592']]); g.fillRect(x - s / 2, y - s / 2, s, s); }
      silkText(g, 'U' + (40 + m.k), 0, 52, 7);
    } },
};
export const LED_COLS = ['#3dff7a', '#ffb02e', '#3ba4ff', '#ff4b3b'];
const RECIPE = ['mcu', 'power', 'logic', 'leds', 'chipset', 'resbank', 'header', 'bigcap', 'coin', 'leds', 'osc', 'logic', 'mcu', 'power', 'header', 'resbank', 'smd', 'osc', 'bigcap', 'smd'];

// ---------------------------------------------------------------- the plan: where everything goes, once per track
const plans = new WeakMap(), HUG = 108;   // the road-hugging buses run this far out from the road's edge
export function boardPlan(T, dist, marks) {
  if (plans.has(T)) return plans.get(T);
  const B = T.bbox, rng = mulberry(T.N * 13 + 5), occ = occupancy(), R = (T.routes || [T])[0], sc = T.def.scale || 1;
  const X0 = B.x - 110, Y0 = B.y - 110, X1 = B.x + B.w + 110, Y1 = B.y + B.h + 110;
  const inMark = (x, y, r) => marks.some(m => Math.hypot(m.x - x, m.y - y) < m.r * 1.12 + r);
  const traces = [], vias = [], parts = [], pours = [], labels = [], leds = [];
  for (const m of marks) occ.take(m.x - m.r * 1.1, m.y - m.r * 1.1, m.x + m.r * 1.1, m.y + m.r * 1.1);
  const clearOf = (P, room) => along(P, 10, (x, y) => dist(x, y, room + 40) >= room && x > X0 - 300 && x < X1 + 300 && y > Y0 - 300 && y < Y1 + 300);
  const bus = (path, n, gap, w, ends = true) => {
    for (let j = 0; j < n; j++) { const P = offsetPath(path, (j - (n - 1) / 2) * gap); traces.push({ P, w }); if (ends) for (const [x, y] of [P[0], P[P.length - 1]]) vias.push([x, y, 3.6]); }
    occ.takeLine(path, n * gap / 2 + 8);
  };
  // the title block, in the roomiest spot left
  { let best = null;
    for (let y = Y0 + 100; y < Y1 - 100; y += 50) for (let x = X0 + 180; x < X1 - 180; x += 50) {
      if (inMark(x, y, 180)) continue; const d = dist(x, y, 260); if (d < 190) continue;
      const s = Math.min(d, x - X0, X1 - x, (y - Y0) * 2, (Y1 - y) * 2); if (!best || s > best.s) best = { x, y, s };
    }
    if (best) { labels.push({ title: true, x: best.x, y: best.y }); occ.take(best.x - 170, best.y - 70, best.x + 170, best.y + 70); } }
  // the memory bus: the CPU (landmark 0) to the RAM (landmark 1)
  if (marks.length > 1) {
    const [a, b] = marks, d = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
    const A = [a.x + ux * a.r * 0.75, a.y + uy * a.r * 0.75], Bp = [b.x - ux * b.r * 0.75, b.y - uy * b.r * 0.75], P = octi(A, Bp, Math.abs(ux) > Math.abs(uy));
    if (clearOf(P, 90)) { for (let j = 0; j < 12; j++) traces.push({ P: offsetPath(P, (j - 5.5) * 9), w: 3.6 }); occ.takeLine(P, 62); }
  }
  // buses hugging the road down its straights, ten traces at a time, peeling off at 45° to vias at each end
  for (const side of [-1, 1]) {
    let run = [];
    const flush = () => {
      if (run.length > 70) {
        const off = HUG, n = 6, gap = 10, P = [];
        for (let k = 4; k < run.length - 4; k += 3) { const j = run[k], o = side * (R.hw[j] + off); P.push([R.pts[j][0] - R.tan[j][1] * o, R.pts[j][1] + R.tan[j][0] * o]); }
        if (P.length > 4 && occ.freeLine(P, n * gap / 2 + 4)) {
          const j0 = run[4], j1 = run[run.length - 5], out = (j, s) => [-R.tan[j][1] * side + R.tan[j][0] * s, R.tan[j][0] * side + R.tan[j][1] * s];
          const [ax, ay] = out(j0, -1), [bx, by] = out(j1, 1), k0 = 40 / Math.SQRT2, f = Math.SQRT1_2;
          const path = [[P[0][0] + ax * k0 * f * 2, P[0][1] + ay * k0 * f * 2], ...P, [P[P.length - 1][0] + bx * k0 * f * 2, P[P.length - 1][1] + by * k0 * f * 2]];
          if (clearOf(path, 70)) {
            for (let j = 0; j < n; j++) {
              const o = (j - (n - 1) / 2) * gap * side, Q = offsetPath(path, o), cut = (n - 1 - j) * 1.2 + 1;   // staggered ends, like a fan-out
              const s = Q[0], e = Q[Q.length - 1], s2 = Q[1], e2 = Q[Q.length - 2];
              const S = [s2[0] + (s[0] - s2[0]) * (0.4 + 0.12 * cut), s2[1] + (s[1] - s2[1]) * (0.4 + 0.12 * cut)], E = [e2[0] + (e[0] - e2[0]) * (0.4 + 0.12 * cut), e2[1] + (e[1] - e2[1]) * (0.4 + 0.12 * cut)];
              const QQ = [S, ...Q.slice(1, -1), E]; traces.push({ P: QQ, w: 3.4 }); vias.push([S[0], S[1], 3.6], [E[0], E[1], 3.6]);
            }
            occ.takeLine(path, n * gap / 2 + 10);
          }
        }
      }
      run = [];
    };
    for (let i = 0; i < R.N; i += 4) {
      const ok = Math.abs(R.curv[i]) < 1 / 240 && [HUG - 30, HUG + 34].every(off => { const o = side * (R.hw[i] + off); return dist(R.pts[i][0] - R.tan[i][1] * o, R.pts[i][1] + R.tan[i][0] * o, off + 4) >= off - 6; });
      if (ok) run.push(i); else flush();
    }
    flush();
  }
  // the circuits
  const want = Math.round((X1 - X0) * (Y1 - Y0) / 95000);
  let k = 0, ci = {};
  for (let tries = 0; tries < 2600 && parts.length < want; tries++) {
    const type = RECIPE[k % RECIPE.length], M = MODS[type], rot = rng() < 0.5 ? 1 : 0, hx = rot ? M.hy : M.hx, hy = rot ? M.hx : M.hy;
    const x = Math.round(rnd(rng, X0 + hx, X1 - hx) / 4) * 4, y = Math.round(rnd(rng, Y0 + hy, Y1 - hy) / 4) * 4, ext = Math.hypot(hx, hy);
    if (inMark(x, y, ext)) continue;
    if (dist(x, y, ext + 140) < ext + 78) continue;
    if (!occ.free(x - hx - 16, y - hy - 16, x + hx + 16, y + hy + 16)) continue;
    occ.take(x - hx - 8, y - hy - 8, x + hx + 8, y + hy + 8);
    const m = { type, x, y, rot, hx, hy, k: ci[type] = (ci[type] ?? -1) + 1, seed: rng() };
    parts.push(m); k++;
    pours.push([x - hx - 22, y - hy - 22, x + hx + 22, y + hy + 22]);
    if (type === 'leds') for (const [lx, ly] of M.leds) { const [wx, wy] = rot ? [-ly, lx] : [lx, ly]; leds.push({ x: x + wx, y: y + wy, col: LED_COLS[(m.k + M.leds.findIndex(p => p[0] === lx)) % 4], v: rng() }); }
  }
  // traces tying neighbouring circuits together: a few parallel traces from side to side
  for (const a of parts) {
    let best = null;
    for (const b of parts) { if (b === a || b.linked === a) continue; const d = Math.hypot(b.x - a.x, b.y - a.y); if (d < 460 && (!best || d < best.d)) best = { b, d }; }
    if (!best) continue;
    const b = best.b, horiz = Math.abs(b.x - a.x) > Math.abs(b.y - a.y), n = 2 + Math.floor(rng() * 3), gap = 9;
    const A = horiz ? [a.x + Math.sign(b.x - a.x) * (a.hx + 14), a.y] : [a.x, a.y + Math.sign(b.y - a.y) * (a.hy + 14)];
    const Bp = horiz ? [b.x - Math.sign(b.x - a.x) * (b.hx + 14), b.y] : [b.x, b.y - Math.sign(b.y - a.y) * (b.hy + 14)];
    if (Math.hypot(Bp[0] - A[0], Bp[1] - A[1]) < 50) continue;
    const P = octi(A, Bp, horiz);
    const inner = P.slice(); const trim = (p, q, l) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [p[0] + (q[0] - p[0]) / d * l, p[1] + (q[1] - p[1]) / d * l]; };
    const chk = [trim(P[0], P[1], 16), ...P.slice(1, -1), trim(P[P.length - 1], P[P.length - 2], 16)];
    if (!clearOf(chk, 74) || !occ.freeLine(chk, n * gap / 2 + 3)) continue;
    bus(P, n, gap, 2.8); a.linked = b;
  }
  // short fan-outs off each circuit to vias: a little bundle leaving one side and turning 45°
  for (const m of parts) {
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let t = 0; t < 2; t++) {
      const [sx, sy] = sides[Math.floor(rng() * 4)], n = 3 + Math.floor(rng() * 3), gap = 8, turn = rng() < 0.5 ? 1 : -1;
      const A = [m.x + sx * (m.hx + 10), m.y + sy * (m.hy + 10)], l1 = 18 + rng() * 26, l2 = 20 + rng() * 40;
      const B1 = [A[0] + sx * l1, A[1] + sy * l1], C = [B1[0] + (sx - sy * turn) * l2 * Math.SQRT1_2, B1[1] + (sy + sx * turn) * l2 * Math.SQRT1_2];
      const P = [A, B1, C];
      if (!clearOf([B1, C], 72) || !occ.freeLine([B1, C], n * gap / 2 + 4)) continue;
      for (let j = 0; j < n; j++) { const Q = offsetPath(P, (j - (n - 1) / 2) * gap), e = Q[2], d = Q[1], f = 0.55 + 0.45 * ((j * 7 + 3) % n) / n; const E = [d[0] + (e[0] - d[0]) * f, d[1] + (e[1] - d[1]) * f]; traces.push({ P: [Q[0], d, E], w: 2.6 }); vias.push([E[0], E[1], 3.2]); }
      occ.takeLine([B1, C], n * gap / 2 + 6);
    }
  }
  // the corner names, in silkscreen beside the road (the layout points they're at, in the definition's units)
  for (const [lx, ly, name] of T.def.silk || []) {
    const px = lx * sc, py = ly * sc, w = name.length * 7.6 + 16, h = 22; let best = null;
    for (let r = 120; r <= 330 && !best; r += 30) for (let a = 0; a < TAU; a += TAU / 24) {
      const x = px + Math.cos(a) * r, y = py + Math.sin(a) * r;
      if (dist(x, y, 200) < w / 2 + 70 || inMark(x, y, w / 2) || !occ.free(x - w / 2, y - h / 2, x + w / 2, y + h / 2)) continue;
      best = { x, y }; break;
    }
    if (best) { labels.push({ name, x: best.x, y: best.y, w, h }); occ.take(best.x - w / 2, best.y - h / 2, best.x + w / 2, best.y + h / 2); }
  }
  // stitching vias over the pours, wherever nothing else is
  const stitch = [];
  for (const [x0, y0, x1, y1] of pours) for (let x = Math.ceil((x0 + 10) / 36) * 36; x < x1 - 10; x += 36) for (let y = Math.ceil((y0 + 10) / 36) * 36; y < y1 - 10; y += 36) if (occ.free(x - 5, y - 5, x + 5, y + 5) && dist(x, y, 120) > 72) { stitch.push([x, y]); occ.take(x - 3, y - 3, x + 3, y + 3); }
  const plan = { traces, vias, parts, pours, labels, leds, stitch };
  plans.set(T, plan); return plan;
}
export const boardLeds = T => plans.has(T) ? plans.get(T).leds : [];

// ---------------------------------------------------------------- drawing it
let weave = null;
function weaveTile() {   // the glass-fibre weave showing faintly through the mask
  if (weave !== null) return weave;
  if (typeof document === 'undefined') return (weave = false);
  const c = document.createElement('canvas'); c.width = c.height = 24; const t = c.getContext('2d');
  t.fillStyle = 'rgba(255,255,255,0.035)'; for (let k = 0; k < 24; k += 6) { t.fillRect(0, k, 24, 2.4); }
  t.fillStyle = 'rgba(0,0,0,0.05)'; for (let k = 3; k < 24; k += 6) { t.fillRect(k, 0, 2.4, 24); }
  return (weave = c);
}
function drawTraces(g, list) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const { P, w } of list) { poly(g, P, false); g.strokeStyle = PCB.mask; g.lineWidth = w + 6; g.stroke(); }   // the clearance cut round it in the pour
  for (const { P, w } of list) { g.save(); g.translate(0.8, 1); poly(g, P, false); g.strokeStyle = PCB.traceLo; g.lineWidth = w; g.stroke(); g.restore(); }
  for (const { P, w } of list) { g.save(); g.translate(-0.6, -0.7); poly(g, P, false); g.strokeStyle = PCB.traceHi; g.lineWidth = w; g.stroke(); g.restore(); }
  for (const { P, w } of list) { poly(g, P, false); g.strokeStyle = PCB.trace; g.lineWidth = w - 0.4; g.stroke(); }
}
export function pcbGround(g, T, X0, Y0, W, H, rng, dist, D, marks) {
  const B = T.bbox, cx = B.x + B.w / 2, cy = B.y + B.h / 2, Rv = Math.hypot(B.w, B.h) / 2;
  const plan = boardPlan(T, dist, marks), tile = D > 0.5 ? weaveTile() : null;
  // a ground pour over the whole board, cleared round the road and each circuit
  g.fillStyle = PCB.pour; g.fillRect(X0, Y0, W, H);
  for (const R of T.routes || [T]) { g.fillStyle = shade(PCB.pour, 0.1); g.fill(band(R, CHANNEL + 2.5)); }
  for (const R of T.routes || [T]) { g.fillStyle = PCB.mask; g.fill(band(R, CHANNEL)); }
  g.strokeStyle = PCB.mask; g.lineWidth = 3.5; g.lineJoin = 'round';
  for (const [x0, y0, x1, y1] of plan.pours) { poly(g, chamfer(x0, y0, x1, y1, 16)); g.stroke(); }
  for (const [x, y] of plan.stitch) { circ(g, x, y, 4.6); g.fillStyle = PCB.mask; g.fill(); circ(g, x, y, 2.8); g.fillStyle = PCB.gold; g.fill(); circ(g, x, y, 1.2); g.fillStyle = PCB.hole; g.fill(); }
  drawTraces(g, plan.traces);
  for (const [x, y, r] of plan.vias) via(g, x, y, r);
  if (tile) { g.fillStyle = g.createPattern(tile, 'repeat'); g.fillRect(X0, Y0, W, H); }
  // a soft sheen from the top left, and the board darkening toward its edges
  g.fillStyle = radial(g, B.x + B.w * 0.25, B.y + B.h * 0.2, 0, B.x + B.w * 0.25, B.y + B.h * 0.2, Rv * 1.1, [[0, 'rgba(120,160,230,0.07)'], [1, 'rgba(120,160,230,0)']]); g.fillRect(X0, Y0, W, H);
  g.fillStyle = radial(g, cx, cy, Rv * 0.55, cx, cy, Rv * 1.25, [[0, 'rgba(2,5,14,0)'], [1, 'rgba(2,5,14,0.4)']]); g.fillRect(X0, Y0, W, H);
  // silkscreen: the corner names and the title block
  for (const L of plan.labels) {
    if (L.title) { titleBlock(g, L.x, L.y); continue; }
    g.strokeStyle = alpha(PCB.silk, 0.5); g.lineWidth = 1.2; g.beginPath(); g.roundRect(L.x - L.w / 2, L.y - L.h / 2, L.w, L.h, 3); g.stroke();
    silkText(g, L.name, L.x, L.y + 0.5, 11, 'center', 0.72);
  }
  // the parts: shadows, then the parts themselves
  g.fillStyle = SH;
  for (const m of plan.parts) { g.save(); g.translate(m.x, m.y); if (m.rot) g.rotate(Math.PI / 2); g.fillStyle = SH; MODS[m.type].sh.call(MODS[m.type], g, m); g.restore(); }
  for (const m of plan.parts) { g.save(); g.translate(m.x, m.y); if (m.rot) g.rotate(Math.PI / 2); MODS[m.type].draw.call(MODS[m.type], g, m, mulberry(Math.floor(m.seed * 1e6))); g.restore(); }
  // mounting holes at the board's corners: a plated ring round a hole through it
  for (const [mx, my] of [[B.x - 70, B.y - 70], [B.x + B.w + 70, B.y - 70], [B.x - 70, B.y + B.h + 70], [B.x + B.w + 70, B.y + B.h + 70]]) {
    circ(g, mx, my, 40); g.strokeStyle = alpha(PCB.silk, 0.5); g.lineWidth = 1.4; g.stroke();
    circ(g, mx, my, 32); g.fillStyle = linear(g, mx - 32, my - 32, mx + 32, my + 32, [[0, PCB.goldHi], [0.5, PCB.gold], [1, PCB.goldDk]]); g.fill();
    circ(g, mx, my, 21); g.fillStyle = '#04060b'; g.fill(); circ(g, mx + 3, my + 4, 18); g.fillStyle = '#0b0f18'; g.fill();
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; circ(g, mx + Math.cos(a) * 26.5, my + Math.sin(a) * 26.5, 1.8); g.fillStyle = PCB.hole; g.fill(); }
  }
}
function titleBlock(g, x, y) {
  g.save(); g.translate(x, y);
  g.strokeStyle = alpha(PCB.silk, 0.6); g.lineWidth = 1.6; g.beginPath(); g.roundRect(-160, -60, 320, 120, 6); g.stroke();
  g.lineWidth = 1; g.beginPath(); g.moveTo(-160, 26); g.lineTo(160, 26); g.moveTo(40, 26); g.lineTo(40, 60); g.stroke();
  // a little kart in a chip outline: the board's logo
  g.save(); g.translate(-118, -18); g.strokeStyle = alpha(PCB.silk, 0.75); g.lineWidth = 2;
  g.strokeRect(-24, -24, 48, 48); for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * 9, -24); g.lineTo(k * 9, -31); g.moveTo(k * 9, 24); g.lineTo(k * 9, 31); g.moveTo(-24, k * 9); g.lineTo(-31, k * 9); g.moveTo(24, k * 9); g.lineTo(31, k * 9); g.stroke(); }
  g.fillStyle = alpha(PCB.silk, 0.8); g.font = '900 26px ui-monospace, Menlo, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('K', 0, 1);
  g.restore();
  silkText(g, 'KERNEL KART', -76, -30, 26, 'left', 0.8, 900);
  silkText(g, 'SILICON CIRCUIT  MAINBOARD', -76, -4, 11, 'left', 0.66);
  silkText(g, 'REV 2.6  ·  2026-10', -150, 43, 10, 'left', 0.6);
  // a data-matrix code, and the usual marks
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if (i === 0 || j === 7 || ((i * 7 + j * 13 + i * j) % 3 === 0 && (j % 2 || i % 2 === 0))) { g.fillStyle = alpha(PCB.silk, 0.65); g.fillRect(58 + i * 3.6, 30 + j * 3.6, 3.2, 3.2); }
  silkText(g, '94V-0', 128, 43, 9, 'center', 0.55);
  g.restore();
}

// the shoulder of the road is a wide gold trace: vias stitched along it (not where the kerbs are)
export function pcbTrim(g, T, D, dist) {
  if (D <= 0.5) return;
  const mine = (x, y, o) => dist(x, y, 40) > o - 3;   // (not where it would cross another road, at the fork)
  // the plating's sheen: a bright lip along its outer edge
  for (const R of T.routes || [T]) for (const sd of [-1, 1]) {
    const p = new Path2D(); let on = false;
    for (let i = 0; i <= R.N; i += 2) { const j = i % R.N, of = sd * (R.hw[j] + 14.6), x = R.pts[j][0] - R.tan[j][1] * of, y = R.pts[j][1] + R.tan[j][0] * of; if (!mine(x, y, 14.6)) { on = false; continue; } on ? p.lineTo(x, y) : p.moveTo(x, y); on = true; }
    g.strokeStyle = alpha(PCB.goldHi, 0.5); g.lineWidth = 1.4; g.stroke(p);
  }
  for (const R of T.routes || [T]) for (const sd of [-1, 1]) for (let i = 0; i < R.N; i += 20) {
    if (Math.abs(R.curv[i]) > 1 / 340) continue;
    const o = sd * (R.hw[i] + 8.5), x = R.pts[i][0] - R.tan[i][1] * o, y = R.pts[i][1] + R.tan[i][0] * o;
    if (!mine(x, y, 8.5)) continue;
    circ(g, x + 0.4, y + 0.5, 3); g.fillStyle = alpha(PCB.goldDk, 0.8); g.fill(); circ(g, x, y, 1.6); g.fillStyle = PCB.hole; g.fill();
  }
}

// a tyre wall, as a single-row pin header following the corner: black plastic, a gold pin in each
export function pinHeader(g, x, y, ang) {
  g.save(); g.translate(x + 2, y + 3); g.rotate(ang); g.fillStyle = SH; g.fillRect(-4.6, -5.2, 9.2, 10.4); g.restore();
  g.save(); g.translate(x, y); g.rotate(ang);
  g.fillStyle = '#1b1d23'; g.fillRect(-4.6, -5.2, 9.2, 10.4); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(-4.6, -5.2, 9.2, 1.4);
  g.fillStyle = PCB.goldDk; g.fillRect(-1.7, -1.4, 3.8, 3.8); g.fillStyle = PCB.gold; g.fillRect(-2.1, -1.9, 3.6, 3.6); g.fillStyle = PCB.goldHi; g.fillRect(-2.1, -1.9, 1.6, 1.6);
  g.restore();
}

// ---------------------------------------------------------------- the landmarks: the CPU in its socket, the RAM bank
export function chipsLandmark(g, c, i) {
  const { x, y, r, v } = c;
  if (i % 2 === 0) {
    const s = r * 0.62;
    // the bus fanning out of the socket on every side, each trace ending at a via
    const fan = [];
    for (let sd = 0; sd < 4; sd++) {
      const a = sd * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), P = (u, w) => [x + ca * u - sa * w, y + sa * u + ca * w];
      for (let k = -5; k <= 5; k++) { const o = k * 10, bend = s * 1.22 + Math.abs(k) * 4, end = s * 1.55 + (5 - Math.abs(k)) * 7, dx = Math.sign(k) * (end - bend); fan.push({ P: [P(s * 1.05, o), P(bend, o), P(end, o + dx)], w: 3.2, via: P(end, o + dx) }); }
    }
    drawTraces(g, fan); for (const f of fan) via(g, f.via[0], f.via[1], 3.8);
    // decoupling caps in a ring round the socket
    for (let k = 0; k < 16; k++) { const a = (k + 0.5) / 16 * TAU, rr = s * 1.3; if (Math.abs(Math.cos(a)) > 0.3 && Math.abs(Math.sin(a)) > 0.3) smd(g, x + Math.cos(a) * rr, y + Math.sin(a) * rr, k % 2, 0); }
    g.fillStyle = SH; g.fillRect(x - s * 1.14 + 8, y - s * 1.14 + 11, s * 2.28, s * 2.28);
    // the socket: a dark frame, a steel load plate's hinge and its lever down one side
    g.fillStyle = linear(g, x - s * 1.14, y - s * 1.14, x + s * 1.14, y + s * 1.14, [[0, '#3a3e48'], [1, '#17191e']]); g.beginPath(); g.roundRect(x - s * 1.14, y - s * 1.14, s * 2.28, s * 2.28, 8); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1.5; g.beginPath(); g.roundRect(x - s * 1.1, y - s * 1.1, s * 2.2, s * 2.2, 7); g.stroke();
    g.fillStyle = linear(g, x - s * 1.06, y - s * 1.06, x + s * 1.06, y + s * 1.06, [[0, '#e6e9ee'], [1, '#8b939e']]);
    g.beginPath(); g.roundRect(x - s * 1.06, y - s * 1.06, s * 2.12, s * 2.12, 6); g.roundRect(x - s * 0.9, y - s * 0.9, s * 1.8, s * 1.8, 4); g.fill('evenodd');
    g.fillStyle = linear(g, x + s * 1.16, 0, x + s * 1.3, 0, [[0, '#f1f3f6'], [1, '#8a919b']]); g.fillRect(x + s * 1.17, y - s * 1.0, 6, s * 2.0); circ(g, x + s * 1.2, y + s * 1.04, 6.5); g.fill();
    for (const [px, py] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { circ(g, x + px * s * 0.98, y + py * s * 0.98, 3); g.fillStyle = '#5d6571'; g.fill(); }
    // the package: green substrate with tiny caps, gold triangle at pin 1, then the heat spreader
    g.fillStyle = '#1e6a45'; g.fillRect(x - s * 0.88, y - s * 0.88, s * 1.76, s * 1.76);
    for (let k = 0; k < 14; k++) { const o = -s * 0.8 + (k + 0.5) * s * 1.6 / 14; for (const [px, py] of [[o, -s * 0.84], [o, s * 0.84], [-s * 0.84, o], [s * 0.84, o]]) { g.fillStyle = (k % 3) ? '#c49862' : '#d7dbe0'; g.fillRect(x + px - 2, y + py - 1.5, 4, 3); } }
    poly(g, [[x - s * 0.86, y + s * 0.86], [x - s * 0.86, y + s * 0.68], [x - s * 0.68, y + s * 0.86]]); g.fillStyle = PCB.gold; g.fill();
    const h = s * 0.72;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.roundRect(x - h + 2, y - h + 3, h * 2, h * 2, 8); g.fill();
    g.fillStyle = linear(g, x - h, y - h, x + h, y + h, [[0, '#fbfcfd'], [0.45, '#cdd2d9'], [1, '#8a929d']]); g.beginPath(); g.roundRect(x - h, y - h, h * 2, h * 2, 8); g.fill();
    g.save(); g.beginPath(); g.roundRect(x - h, y - h, h * 2, h * 2, 8); g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 0.8; for (let k = -12; k <= 12; k++) { g.beginPath(); g.moveTo(x - h, y + k * h / 12); g.lineTo(x + h, y + k * h / 12); g.stroke(); }   // brushed
    g.fillStyle = linear(g, x - h, y - h, x + h * 0.2, y + h * 0.2, [[0, 'rgba(255,255,255,0.45)'], [0.5, 'rgba(255,255,255,0.08)'], [1, 'rgba(255,255,255,0)']]); poly(g, [[x - h, y - h], [x + h * 0.3, y - h], [x - h, y + h * 0.3]]); g.fill();   // a glint on the polished metal
    g.restore();
    g.strokeStyle = 'rgba(70,78,90,0.45)'; g.lineWidth = 1.2; g.beginPath(); g.roundRect(x - h + 3, y - h + 3, h * 2 - 6, h * 2 - 6, 6); g.stroke();
    g.fillStyle = '#353a44'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${s * 0.24}px ui-monospace, Menlo, monospace`; g.fillText('KERNEL', x, y - s * 0.14);
    g.font = `600 ${s * 0.1}px ui-monospace, Menlo, monospace`; g.fillStyle = '#4f5562'; g.fillText('KK-9000 · 64C', x, y + s * 0.12); g.fillText('SR2K6  L610C0DE', x, y + s * 0.27);
    circ(g, x - h * 0.72, y - h * 0.72, 3); g.fillStyle = '#7d8590'; g.fill();
    g.fillStyle = alpha(PCB.silk, 0.7); g.font = '700 12px ui-monospace, Menlo, monospace'; g.textAlign = 'left'; g.fillText('CPU1', x - s * 1.14, y + s * 1.14 + 22);
  } else {   // the RAM: four modules standing in their slots (their faces lifted up the screen), heat spreaders, latches
    const L = r * 1.45, gap = r * 0.42, H = r * 0.3, cols = ['#e2453c', '#3aa0ff', '#e2453c', '#3aa0ff'];
    g.strokeStyle = alpha(PCB.silk, 0.55); g.lineWidth = 1.4; g.strokeRect(x - L / 2 - 22, y - gap * 1.5 - H - 16, L + 44, gap * 3 + H + 34);
    for (let k = 0; k < 4; k++) {
      const yy = y - gap * 1.5 + k * gap, x0 = x - L / 2;
      g.fillStyle = SH; g.fillRect(x0 + 10, yy + 2, L, 16);                    // its shadow, cast down and right
      g.fillStyle = '#121318'; g.fillRect(x0 - 8, yy - 3, L + 16, 10);           // the slot
      g.fillStyle = '#2a2d35'; g.fillRect(x0 - 8, yy - 3, L + 16, 2);
      for (const lx of [x0 - 15, x0 + L + 5]) { g.fillStyle = linear(g, lx, 0, lx + 10, 0, [[0, '#ffffff'], [1, '#c3c8cf']]); g.beginPath(); g.roundRect(lx, yy - H * 0.5, 10, H * 0.5 + 8, 2); g.fill(); }   // the latches
      g.fillStyle = PCB.gold; g.fillRect(x0, yy - 4, L, 4);                      // its gold fingers
      g.fillStyle = linear(g, 0, yy - H, 0, yy - 3, [[0, '#4a505c'], [0.15, '#30343d'], [1, '#1c1f25']]); g.beginPath(); g.roundRect(x0, yy - H, L, H - 3, [3, 3, 0, 0]); g.fill();   // the heat spreader
      g.fillStyle = cols[k]; g.fillRect(x0 + 4, yy - H + 4, L - 8, 3);         // its coloured stripe
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x0 + 2, yy - H + 1, L - 4, 1.5);
      g.fillStyle = '#c9ced6'; g.font = `800 ${H * 0.34}px ui-monospace, Menlo, monospace`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('KERNEL DDR5', x0 + 10, yy - H * 0.45);
      g.textAlign = 'right'; g.font = `600 ${H * 0.24}px ui-monospace, Menlo, monospace`; g.fillStyle = '#8b929d'; g.fillText('32GB 6400', x0 + L - 10, yy - H * 0.45);
    }
    g.fillStyle = alpha(PCB.silk, 0.7); g.font = '700 12px ui-monospace, Menlo, monospace'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('DIMM A1-B2', x - L / 2 - 20, y + gap * 1.5 + 30);
  }
}
