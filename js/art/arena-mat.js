// Kernel Kart: the Fight maps' shared materials (draw-arena.js). One look for every map: simple shapes, soft form
// shading lit from the top left, a muted palette, no outlines, tone over lines, a touch of depth (things have a top and
// a front face, and sit in a soft ambient-occlusion shadow).
//   mat(base)       a tonal ramp from one colour: hi, lit, base, dark, deep (lit toward a warm white, shade toward a
//                   cool slate, the same steps for every map, so the maps share a value range). stone(), metal(),
//                   wood(), leaf() are mats with a per-material sheen (how tight the highlight on a curve is)
//   shadeBox        a block seen from above and a little in front: its top (lit top left) and its front face
//   shadeCylinder   a round drum standing up: its side shaded round from the light, its top disc
//   bevelRing       a raised (or sunk) round rim shaded by which way each bit faces
//   aoBlob          a soft contact shadow; lightPool: a warm glow thrown on the ground, drawn as added light
// World drawing: x right, y down the screen, height draws up the screen (a box tall H has its top H above its footprint).
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
// the brightness round a vertical drum at u (-1 its left edge .. 1 its right): brightest a little left of middle,
// darkest at the right, a little bounce light on the right rim
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
// a soft contact shadow (an ellipse rx by ry at x, y)
export function aoBlob(g, x, y, rx, ry, rgb, a) {
  g.save(); g.translate(x, y); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.55, `rgba(${rgb},${a * 0.7})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore();
}
// a block: footprint x0, y0 (top left), w wide, d deep, H tall, corner radius r. o.inset: a soft recessed panel on the
// top and the front (a lid, a door: tone, not lines)
export function shadeBox(g, x0, y0, w, d, H, M, o = {}) {
  const r = Math.min(o.r || 0, w / 2, d / 2, H / 2 + 0.01), fy = y0 + d - H, ty = y0 - H;
  // the front face: shaded (it faces away from the light), darker toward its foot
  const fg = g.createLinearGradient(0, fy, 0, y0 + d);
  fg.addColorStop(0, mix(M.dark, M.deep, 0.15)); fg.addColorStop(0.7, mix(M.dark, M.deep, 0.5)); fg.addColorStop(1, mix(M.dark, M.deep, 0.8));
  g.fillStyle = fg; g.beginPath(); g.roundRect(x0, fy + Math.min(r, H / 2), w, H - Math.min(r, H / 2), [0, 0, r, r]); g.fill();
  // across the front, a little lighter on the left (the light's side)
  const sg = g.createLinearGradient(x0, 0, x0 + w, 0); sg.addColorStop(0, rgba(M.lit, 0.22)); sg.addColorStop(0.5, rgba(M.lit, 0)); sg.addColorStop(1, `rgba(${M.ao},0.12)`);
  g.fillStyle = sg; g.fillRect(x0, fy, w, H);
  // the top: lit from the top left
  const tg = g.createLinearGradient(x0, ty, x0 + w * 0.8, ty + d);
  tg.addColorStop(0, mix(M.lit, M.hi, 0.5)); tg.addColorStop(0.55, M.lit); tg.addColorStop(1, mix(M.lit, M.base, 0.6));
  g.fillStyle = tg; g.beginPath(); g.roundRect(x0, ty, w, d, r); g.fill();
  if (o.inset) {   // a recessed panel: shade along its top-left inner edge, light along its bottom right
    const k = o.inset, ix = x0 + k, iy = ty + k, iw = w - k * 2, id = d - k * 2;
    if (iw > 2 && id > 2) {
      g.fillStyle = rgba(M.base, 0.55); g.beginPath(); g.roundRect(ix, iy, iw, id, Math.max(0, r - k / 2)); g.fill();
      const ig = g.createLinearGradient(ix, iy, ix + iw, iy + id); ig.addColorStop(0, `rgba(${M.ao},0.16)`); ig.addColorStop(0.35, `rgba(${M.ao},0)`); ig.addColorStop(1, rgba(M.hi, 0.18));
      g.fillStyle = ig; g.beginPath(); g.roundRect(ix, iy, iw, id, Math.max(0, r - k / 2)); g.fill();
    }
    const fh = H - k * 2;
    if (o.insetFront && fh > 3) { g.fillStyle = `rgba(${M.ao},0.1)`; g.beginPath(); g.roundRect(x0 + k, fy + k, w - k * 2, fh, Math.max(0, r - k / 2)); g.fill(); }
  }
  // the rounded arris along the top's front and left edges, catching the light (a soft band, not a line)
  const e = Math.min(2.2, d * 0.1, H * 0.2);
  const ag = g.createLinearGradient(0, ty + d - e * 1.6, 0, ty + d); ag.addColorStop(0, rgba(M.hi, 0)); ag.addColorStop(1, rgba(M.hi, 0.55));
  g.fillStyle = ag; g.beginPath(); g.roundRect(x0 + r * 0.3, ty + d - e * 1.6, w - r * 0.6, e * 1.6, [0, 0, r, r]); g.fill();
  g.fillStyle = rgba(M.hi, 0.35); g.fillRect(x0, ty + r, Math.min(1.4, w * 0.05), d - r * 2);
}
// a round drum standing up: centre x, y on the ground, radius R, from height z0 to z1 (z up). o.top: draw its top disc
// (o.topR: a different radius up there, for a taper)
export function shadeCylinder(g, x, y, R, z0, z1, M, o = {}) {
  const Rt = o.topR || R, ry = o.ry || 1;
  const side = () => { g.beginPath(); g.ellipse(x, y - z0, R, R * ry, 0, 0, Math.PI); g.lineTo(x - Rt, y - z1); g.lineTo(x + Rt, y - z1); g.closePath(); };
  g.fillStyle = drumGradient(g, x - Math.max(R, Rt), x + Math.max(R, Rt), M);
  side(); g.fill();
  // darker toward the foot (ambient occlusion where it meets what it stands on)
  const k = Math.min(1, (z1 - z0) / 30), og = g.createLinearGradient(0, y - z0 + R * ry, 0, y - z0 - 14 * k);
  og.addColorStop(0, `rgba(${M.ao},${(0.22 * k).toFixed(3)})`); og.addColorStop(1, `rgba(${M.ao},0)`);
  g.fillStyle = og; side(); g.fill();
  if (o.top !== false) {
    const tg = g.createLinearGradient(x - Rt, y - z1 - Rt * ry, x + Rt * 0.7, y - z1 + Rt * ry);
    tg.addColorStop(0, M.hi); tg.addColorStop(0.6, M.lit); tg.addColorStop(1, mix(M.lit, M.base, 0.7));
    g.fillStyle = tg; g.beginPath(); g.ellipse(x, y - z1, Rt, Rt * ry, 0, 0, TAU); g.fill();
  }
}
// a round rim from radius r0 to r1 at x, y, each bit shaded by which way it faces; sunk: the inner wall of a hole
// (lit on the far side)
export function bevelRing(g, x, y, r0, r1, M, sunk = false, N = 48) {
  for (let i = 0; i < N; i++) {
    const a0 = i / N * TAU, a1 = (i + 1.06) / N * TAU, am = (a0 + a1) / 2, f = litOf(Math.cos(am), Math.sin(am)) * (sunk ? -1 : 1);
    g.fillStyle = ramp(M, clamp(0.5 + f * 0.45, 0, 1));
    g.beginPath(); g.arc(x, y, r1, a0, a1); g.arc(x, y, r0, a1, a0, true); g.closePath(); g.fill();
  }
}
// warm light thrown on what's round x, y, out to R: added light, so it brightens whatever it falls on (no edge)
export function lightPool(g, x, y, R, rgb, a) {
  if (a <= 0.004) return;
  g.save();
  // a warm tint first (on a pale floor added light alone would barely show), then the added light
  const tg = g.createRadialGradient(x, y, 0, x, y, R * 0.9);
  tg.addColorStop(0, `rgba(${rgb},${a * 0.5})`); tg.addColorStop(0.45, `rgba(${rgb},${a * 0.22})`); tg.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = tg; g.fillRect(x - R, y - R, R * 2, R * 2);
  g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(x, y, 0, x, y, R);
  gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.35, `rgba(${rgb},${a * 0.55})`); gr.addColorStop(0.7, `rgba(${rgb},${a * 0.16})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
  g.restore();
}
