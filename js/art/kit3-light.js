// Soft light for the 3D Fight effects, added ('lighter') over the baked props and the floor. One cached sprite per
// colour, so a glow is one drawImage. DOM only when called.
//   glow(g, x, y, r, rgb, a, sy)            round glow (sy: squashed flat on the floor)
//   streak(g, x0, y0, x1, y1, w, rgb, a)    a line of light w wide
//   ringLight(g, x, y, r, w, rgb, a)        a ring on the floor, w its soft half width
import { TAU } from '../core.js';

const CACHE = new Map();
function sprite(rgb) {
  let c = CACHE.get(rgb); if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.22, `rgba(${rgb},0.62)`); gr.addColorStop(0.55, `rgba(${rgb},0.2)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); CACHE.set(rgb, c);
  return c;
}
const A3 = a => Math.max(0, Math.min(1, a)).toFixed(3);
export function glow(g, x, y, r, rgb, a, sy = 1) {
  if (a <= 0.004 || r <= 0.5 || typeof document === 'undefined') return;
  const s = sprite(rgb), op = g.globalCompositeOperation, a0 = g.globalAlpha;
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = a0 * Math.min(1, a);
  g.drawImage(s, x - r, y - r * sy, r * 2, r * 2 * sy);
  g.globalAlpha = a0; g.globalCompositeOperation = op;
}
const BANDS = new Map();
function band(rgb) {   // a soft band across: clear, the colour, clear (stretched along a line)
  let c = BANDS.get(rgb); if (c) return c;
  c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(0.3, `rgba(${rgb},0.3)`); gr.addColorStop(0.5, `rgba(${rgb},1)`); gr.addColorStop(0.7, `rgba(${rgb},0.3)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 4, 64); BANDS.set(rgb, c);
  return c;
}
export function streak(g, x0, y0, x1, y1, w, rgb, a) {
  if (a <= 0.004 || w <= 0.3 || typeof document === 'undefined') return;
  const L = Math.hypot(x1 - x0, y1 - y0); if (L < 0.5) return;
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha *= Math.min(1, a);
  g.translate(x0, y0); g.rotate(Math.atan2(y1 - y0, x1 - x0)); g.drawImage(band(rgb), 0, -w / 2, L, w);
  g.restore();
  glow(g, x0, y0, w * 0.5, rgb, a * 0.55); glow(g, x1, y1, w * 0.5, rgb, a * 0.55);   // (soft round ends)
}
export function ringLight(g, x, y, r, w, rgb, a) {
  if (a <= 0.004 || r <= 1) return;
  const gr = g.createRadialGradient(x, y, Math.max(0, r - w), x, y, r + w);
  gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(0.55, `rgba(${rgb},${A3(a)})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r + w, (r + w) * 0.95, 0, 0, TAU); g.fill(); g.restore();
}
