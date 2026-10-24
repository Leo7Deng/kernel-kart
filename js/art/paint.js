// Kernel Kart art: colour helpers and small drawing primitives shared by the cars, mascots, icons and track.
import { TAU } from '../core.js';

const rgb = hex => { const n = parseInt(hex.slice(1, 7), 16); return [n >> 16, n >> 8 & 255, n & 255]; };
// amt > 0 mixes toward white, < 0 toward black
export function shade(hex, amt) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return hex;
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt), f = v => Math.round(v + (t - v) * p), [r, g, b] = rgb(hex);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
// mix two hex colours (t = 0 → a, 1 → b)
export function mix(a, b, t) { const A = rgb(a), B = rgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }
export function alpha(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }

// paths
export const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
export const circ = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); };
export const ell = (ctx, x, y, rx, ry, rot = 0) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); };
export function poly(ctx, pts, close = true) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); if (close) ctx.closePath(); }
// a closed path through the points, rounded with quadratic curves through the midpoints (a soft blob)
export function smooth(ctx, pts) {
  const n = pts.length, mid = i => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2];
  ctx.beginPath(); const m0 = mid(n - 1); ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) { const m = mid(i); ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
  ctx.closePath();
}
export function fillStroke(ctx, fill, stroke, lw) { if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke && lw) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } }
// gradients. In flat mode (a flat look, js/look.js: on only while its icons and signs are drawn, setFlat) each comes
// back as one flat colour instead: a glow fading to nothing as nothing at all, else the middle stop (two stops: their mix)
let FLAT = false;
export const setFlat = on => { const was = FLAT; FLAT = !!on; return was; };
export const isFlat = () => FLAT;
const clear = c => /rgba\([^)]*,\s*0(\.0*)?\s*\)$/.test(c) || /^#[0-9a-f]{6}00$/i.test(c) || c === 'transparent';
const solid = c => /^#[0-9a-f]{6}$/i.test(c) ? rgb(c) : (c = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(c)) ? [+c[1], +c[2], +c[3]] : null;
function flatOf(stops) {
  if (clear(stops[stops.length - 1][1]) || (clear(stops[0][1]) && stops.length < 4)) return 'rgba(0,0,0,0)';
  if (stops.length === 2) { const A = solid(stops[0][1]), B = solid(stops[1][1]); return A && B ? `rgb(${A.map((v, i) => Math.round((v + B[i]) / 2)).join(',')})` : stops[0][1]; }
  let best = stops[0]; for (const s of stops) if (Math.abs(s[0] - 0.5) < Math.abs(best[0] - 0.5)) best = s;
  return best[1];
}
export function linear(ctx, x0, y0, x1, y1, stops) { if (FLAT) return flatOf(stops); const g = ctx.createLinearGradient(x0, y0, x1, y1); for (const [o, c] of stops) g.addColorStop(o, c); return g; }
export function radial(ctx, x, y, r0, x1, y1, r1, stops) { if (FLAT) return flatOf(stops); const g = ctx.createRadialGradient(x, y, r0, x1, y1, r1); for (const [o, c] of stops) g.addColorStop(o, c); return g; }
// a rounded body lit from above: dark at both sides, a bright ridge a little left of centre (across y from -w to w)
export function bodyGrad(ctx, w, base, k = 1) {
  return linear(ctx, 0, -w, 0, w, [[0, shade(base, -0.5 * k)], [0.16, shade(base, -0.12 * k)], [0.36, shade(base, 0.32 * k)], [0.5, shade(base, 0.14 * k)], [0.78, shade(base, -0.1 * k)], [1, shade(base, -0.55 * k)]]);
}
// a ball lit from the top left (for mascots, which are always drawn upright on screen)
export function ballGrad(ctx, x, y, r, base, k = 1) {
  return radial(ctx, x - r * 0.35, y - r * 0.45, r * 0.05, x, y, r * 1.05, [[0, shade(base, 0.38 * k)], [0.45, base], [1, shade(base, -0.32 * k)]]);
}
export function star(ctx, x, y, r, n = 5, inner = 0.45, rot = -Math.PI / 2) {
  ctx.beginPath(); for (let k = 0; k < n * 2; k++) { const a = rot + k * Math.PI / n, q = k % 2 ? r * inner : r; ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } ctx.closePath();
}
