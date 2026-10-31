// The Fight maps' shared materials (draw-arena.js): soft form shading lit from the top left, muted, no outlines.
//   mat(base)       tonal ramp hi, lit, base, dark, deep (same steps on every map); stone/metal/wood/leaf add a sheen
//   shadeBox        a block: lit top and shaded front;  shadeCylinder: a standing drum;  bevelRing: a raised/sunk rim
//   aoBlob          contact shadow;  lightPool: warm added light on the ground
//   softShadow      the shared floor shadow (SHADE), no edge;  softFill: any shape's blurred shadow
//   boxH            a box front's drawn height (BOX_K): the floor is top-down, so fronts are short
// x right, y down, height draws up the screen.
import { TAU, clamp } from '../core.js';

// ---------------------------------------------------------------- colour
export const rgbOf = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export const rgba = (h, a) => { const [r, g, b] = rgbOf(h); return `rgba(${r},${g},${b},${a})`; };
export const mix = (h1, h2, t) => { const a = rgbOf(h1), b = rgbOf(h2); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * clamp(t, 0, 1)).toString(16).padStart(2, '0')).join(''); };
export const LX = -0.6, LY = -0.8;                  // the light comes from the top left
export const litOf = (nx, ny) => nx * LX + ny * LY; // how much a face with outward normal (nx, ny) faces it (-1..1)
const WARM = '#fffaf0', COOL = '#262b3a';           // where every material's light and shade lean
// a tone of a colour: k -1 (deep shade) .. 0 (itself) .. 1 (full light)
export const tone = (base, k) => k >= 0 ? mix(base, WARM, k * 0.62) : mix(base, COOL, -k * 0.58);

// ---------------------------------------------------------------- materials
export function mat(base, sheen = 0) {
  return { base, sheen, hi: tone(base, 0.75), lit: tone(base, 0.4), dark: tone(base, -0.32), deep: tone(base, -0.6), ao: rgbOf(tone(base, -0.9)).join(',') };
}
export const stone = base => mat(base, 0);
export const metal = base => mat(base, 0.35);
export const wood = base => mat(base, 0.05);
export const leaf = base => mat(base, 0);
// brightness round a vertical drum at u (-1 left .. 1 right): peak left of middle, a little bounce on the right rim
function drumLight(u, sheen) {
  const b = 0.5 + 0.5 * Math.cos(Math.PI * (u + 0.45) / 1.45);
  const s = sheen ? sheen * Math.exp(-((u + 0.38) ** 2) / 0.02) : 0;
  return clamp(b + s + (u > 0.82 ? (u - 0.82) * 0.5 : 0), 0, 1.2);
}
const ramp = (M, b) => b > 1 ? mix(M.hi, '#ffffff', b - 1) : b >= 0.5 ? mix(M.base, M.hi, (b - 0.5) * 1.6) : mix(mix(M.dark, M.deep, 0.4), M.base, b * 2);
// a horizontal gradient across x0..x1 shading a round surface
export function drumGradient(g, x0, x1, M) {
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  for (let i = 0; i <= 10; i++) { const u = i / 10 * 2 - 1; gr.addColorStop(i / 10, ramp(M, drumLight(u, M.sheen))); }
  return gr;
}

// ---------------------------------------------------------------- shapes
// the shared floor shadow colour: cool slate, never purple or black
export const SHADE = '34,40,56';
// soft floor shadow: ellipse rx, ry at x, y (turned rot), alpha a in the middle fading to nothing
export function softShadow(g, x, y, rx, ry, a, rot = 0, rgb = SHADE) {
  if (a <= 0.004 || rx <= 0 || ry <= 0) return;
  g.save(); g.translate(x, y); if (rot) g.rotate(rot); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.45, `rgba(${rgb},${(a * 0.82).toFixed(3)})`); gr.addColorStop(0.75, `rgba(${rgb},${(a * 0.38).toFixed(3)})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill(); g.restore();
}
// a shape's soft shadow: the canvas shadow of a copy drawn off to one side, so only the blur lands here
export function softFill(g, path, a, blur = 3, rgb = SHADE) {
  if (a <= 0.004) return;
  const m = g.getTransform(), k = Math.hypot(m.a, m.b) || 1, det = m.a * m.d - m.b * m.c || 1, OFF = 4000;
  g.save();
  g.shadowColor = `rgba(${rgb},${a})`; g.shadowBlur = blur * k; g.shadowOffsetX = OFF; g.shadowOffsetY = 0;
  g.translate(m.d * -OFF / det, m.b * OFF / det);   // (the copy OFF device pixels left: its shadow lands back here)
  g.fillStyle = '#000'; path(); g.fill(); g.restore();
}
export const BOX_K = 0.55;
export const boxH = H => H * BOX_K;
// a soft contact shadow (an ellipse rx by ry at x, y)
export function aoBlob(g, x, y, rx, ry, rgb, a) {
  g.save(); g.translate(x, y); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.55, `rgba(${rgb},${a * 0.7})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore();
}
// a block: footprint x0, y0, w by d, H tall (drawn boxH(H)), corner radius r; lit top with a bright rounded edge, front
// in shade. o.inset: a recessed panel on the top (o.insetFront: on the front too)
export function shadeBox(g, x0, y0, w, d, H, M, o = {}) {
  const Hs = boxH(H), r = Math.min(o.r || 0, w / 2, d / 2), fy = y0 + d - Hs, ty = y0 - Hs, rf = Math.min(r, Hs / 2);
  const fg = g.createLinearGradient(0, fy, 0, y0 + d);
  fg.addColorStop(0, mix(M.base, M.dark, 0.55)); fg.addColorStop(0.5, M.dark); fg.addColorStop(1, mix(M.dark, M.deep, 0.6));
  g.fillStyle = fg; g.beginPath(); g.roundRect(x0, fy - r, w, Hs + r, [0, 0, rf, rf]); g.fill();
  const sg = g.createLinearGradient(x0, 0, x0 + w, 0); sg.addColorStop(0, rgba(M.lit, 0.2)); sg.addColorStop(0.45, rgba(M.lit, 0)); sg.addColorStop(1, `rgba(${M.ao},0.16)`);
  g.fillStyle = sg; g.beginPath(); g.roundRect(x0, fy, w, Hs, [0, 0, rf, rf]); g.fill();
  if (o.inset && o.insetFront && Hs > 8) { const k = Math.min(o.inset, Hs * 0.25); g.fillStyle = `rgba(${M.ao},0.1)`; g.beginPath(); g.roundRect(x0 + o.inset, fy + k, w - o.inset * 2, Hs - k * 2, Math.max(0, rf - k / 2)); g.fill(); }
  const tg = g.createLinearGradient(x0, ty, x0 + w * 0.8, ty + d);
  tg.addColorStop(0, mix(M.lit, M.hi, 0.55)); tg.addColorStop(0.55, mix(M.lit, M.hi, 0.15)); tg.addColorStop(1, mix(M.lit, M.base, 0.45));
  g.fillStyle = tg; g.beginPath(); g.roundRect(x0, ty, w, d, r); g.fill();
  if (o.inset) {   // a recessed panel: shade along its top-left inner edge, light along its bottom right
    const k = o.inset, ix = x0 + k, iy = ty + k, iw = w - k * 2, id = d - k * 2;
    if (iw > 2 && id > 2) {
      g.fillStyle = rgba(M.base, 0.4); g.beginPath(); g.roundRect(ix, iy, iw, id, Math.max(0, r - k / 2)); g.fill();
      const ig = g.createLinearGradient(ix, iy, ix + iw, iy + id); ig.addColorStop(0, `rgba(${M.ao},0.16)`); ig.addColorStop(0.35, `rgba(${M.ao},0)`); ig.addColorStop(1, rgba(M.hi, 0.22));
      g.fillStyle = ig; g.beginPath(); g.roundRect(ix, iy, iw, id, Math.max(0, r - k / 2)); g.fill();
    }
  }
// the rounded edge where the top turns into the front: a bright band, a soft shade just under it
  const e = Math.max(1.2, Math.min(3, d * 0.08, Hs * 0.22));
  const ag = g.createLinearGradient(0, fy - e * 1.4, 0, fy + 0.4); ag.addColorStop(0, rgba(M.hi, 0)); ag.addColorStop(0.7, rgba(M.hi, 0.75)); ag.addColorStop(1, rgba(M.hi, 0.9));
  g.fillStyle = ag; g.beginPath(); g.roundRect(x0 + r * 0.4, fy - e * 1.4, w - r * 0.8, e * 1.4 + 0.4, [0, 0, r * 0.6, r * 0.6]); g.fill();
  const ug = g.createLinearGradient(0, fy + 0.4, 0, fy + e * 2.2); ug.addColorStop(0, `rgba(${M.ao},0.2)`); ug.addColorStop(1, `rgba(${M.ao},0)`);
  g.fillStyle = ug; g.fillRect(x0 + 0.5, fy + 0.4, w - 1, e * 1.8);
  const lg = g.createLinearGradient(x0, 0, x0 + e * 1.6, 0); lg.addColorStop(0, rgba(M.hi, 0.5)); lg.addColorStop(1, rgba(M.hi, 0));
  g.fillStyle = lg; g.fillRect(x0, ty + r, e * 1.6, d - r * 2);
}
// a box's floor shadow: a dark contact line round its foot, a fainter shade cast down-right
export function boxShadow(g, x0, y0, w, d, H, a = 1, rgb = SHADE) {
  const sx = H * 0.32, sy = H * 0.42;
  softFill(g, () => { g.beginPath(); g.moveTo(x0 + 2, y0 + 2); g.lineTo(x0 + w, y0 + 2); g.lineTo(x0 + w + sx, y0 + sy); g.lineTo(x0 + w + sx, y0 + d + sy); g.lineTo(x0 + sx, y0 + d + sy); g.lineTo(x0 + 2, y0 + d); g.closePath(); }, 0.22 * a, H * 0.28, rgb);
  softFill(g, () => { g.beginPath(); g.roundRect(x0 - 1, y0 + d - 5, w + 4, 8, 4); }, 0.3 * a, 3, rgb);
}
// a standing drum: centre x, y, radius R, from z0 to z1. o.top: its top disc (o.topR for a taper)
export function shadeCylinder(g, x, y, R, z0, z1, M, o = {}) {
  const Rt = o.topR || R, ry = o.ry || 1;
  const side = () => { g.beginPath(); g.ellipse(x, y - z0, R, R * ry, 0, 0, Math.PI); g.lineTo(x - Rt, y - z1); g.lineTo(x + Rt, y - z1); g.closePath(); };
  g.fillStyle = drumGradient(g, x - Math.max(R, Rt), x + Math.max(R, Rt), M);
  side(); g.fill();
// darker toward the foot (ambient occlusion)
  const k = Math.min(1, (z1 - z0) / 30), og = g.createLinearGradient(0, y - z0 + R * ry, 0, y - z0 - 14 * k);
  og.addColorStop(0, `rgba(${M.ao},${(0.22 * k).toFixed(3)})`); og.addColorStop(1, `rgba(${M.ao},0)`);
  g.fillStyle = og; side(); g.fill();
  if (o.top !== false) {
    const tg = g.createLinearGradient(x - Rt, y - z1 - Rt * ry, x + Rt * 0.7, y - z1 + Rt * ry);
    tg.addColorStop(0, M.hi); tg.addColorStop(0.6, M.lit); tg.addColorStop(1, mix(M.lit, M.base, 0.7));
    g.fillStyle = tg; g.beginPath(); g.ellipse(x, y - z1, Rt, Rt * ry, 0, 0, TAU); g.fill();
  }
}
// a round rim r0..r1 at x, y, shaded by facing; sunk: a hole's inner wall (lit on the far side)
export function bevelRing(g, x, y, r0, r1, M, sunk = false, N = 48) {
  for (let i = 0; i < N; i++) {
    const a0 = i / N * TAU, a1 = (i + 1.06) / N * TAU, am = (a0 + a1) / 2, f = litOf(Math.cos(am), Math.sin(am)) * (sunk ? -1 : 1);
    g.fillStyle = ramp(M, clamp(0.5 + f * 0.45, 0, 1));
    g.beginPath(); g.arc(x, y, r1, a0, a1); g.arc(x, y, r0, a1, a0, true); g.closePath(); g.fill();
  }
}
// warm added light round x, y out to R, no edge
export function lightPool(g, x, y, R, rgb, a) {
  if (a <= 0.004) return;
  g.save();
// a warm tint first (added light alone barely shows on a pale floor)
  const tg = g.createRadialGradient(x, y, 0, x, y, R * 0.9);
  tg.addColorStop(0, `rgba(${rgb},${a * 0.5})`); tg.addColorStop(0.45, `rgba(${rgb},${a * 0.22})`); tg.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = tg; g.fillRect(x - R, y - R, R * 2, R * 2);
  g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(x, y, 0, x, y, R);
  gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.35, `rgba(${rgb},${a * 0.55})`); gr.addColorStop(0.7, `rgba(${rgb},${a * 0.16})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
  g.restore();
}
