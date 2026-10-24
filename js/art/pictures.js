// Kernel Kart art: the menu's big still pictures of a track, drawn the same on the page or on the painter's worker
// (art/paint-worker.js, so drawing one never holds up a frame): a track's preview (`drawMini`: the map screen's and every
// card's, ui.js `minis`) and the menu backdrop's layer (`drawLayer`: menu-bg.js). Each makes its own canvas (a page
// canvas, or an OffscreenCanvas on the worker). Drawing only, no DOM needed.
import { drawBridge, drawTrack, lookOf } from './track.js';
import { buildTrack } from '../geometry.js';
import { STEP, lerp } from '../core.js';

export const canvasOf = (w, h) => {
  if (typeof document !== 'undefined' && document.createElement) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
};

// a preview that's too pale to read at that size (the snow: white piste on white snow) gets the road inked over it: dark
// forest along both sides, the piste with an edge, so the run's shape and its wide fields show
const MINI_INK = {};   // (Gradient Descent had one; it draws its own thumbnail now, at detail 0: art/ski.js)
function inkRoad(g, R, sc, ink) {
  const side = (off, k) => { const p = []; for (let i = 0; i < R.N; i += 2) { const [x, y] = R.pts[i], [tx, ty] = R.tan[i], w = R.hw[i] * k + off; p.push([x - ty * w, y + tx * w]); } return p; };
  const band = (off, k) => { const l = side(off, k), r = side(-off, -k).reverse(); g.beginPath(); [...l, ...r].forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); };
  const trees = () => { g.fillStyle = ink.tree; let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;   // the open fields' scattered trees, as dots
    for (let i = 0; i < R.N; i += 3) { const w = R.hw[i]; if (w < R.halfW * 1.8) continue; const [x, y] = R.pts[i], [tx, ty] = R.tan[i];
      if (rnd() < 0.22) { const l = (rnd() * 2 - 1) * (w - 40); g.beginPath(); g.arc(x - ty * l, y + tx * l, 2.2 / sc, 0, Math.PI * 2); g.fill(); } } };
  return [() => { g.fillStyle = ink.wood; band(16 / sc, 1); g.fill(); }, () => { g.fillStyle = ink.edge; band(2.5 / sc, 1); g.fill(); }, () => { g.fillStyle = ink.road; band(0, 1); g.fill(); trees(); }];
}
// a track's preview, drawn once at the biggest size the menu shows (the map screen's 480x288, at 2x); every smaller one is
// that picture shrunk (drawing a track is slow: 0.1-0.9 s, shrinking a picture isn't)
export const MINI_W = 480, MINI_H = 288;
export function drawMini(def) {
  const w = MINI_W, h = MINI_H, c = canvasOf(w * 2, h * 2), g = c.getContext('2d');
  const T = buildTrack(def), B = T.bbox;
  // a course much taller than the box (a ski run) lies on its side, start on the left, or it's a sliver in the middle
  const turn = B.h > B.w * 1.4, bw = turn ? B.h : B.w, bh = turn ? B.w : B.h, sc = Math.min(w * 2 / bw, h * 2 / bh);
  g.fillStyle = lookOf(T).ground; g.fillRect(0, 0, c.width, c.height);
  g.translate(c.width / 2, c.height / 2); if (turn) g.rotate(-Math.PI / 2); g.scale(sc, sc); g.translate(-(B.x + B.w / 2), -(B.y + B.h / 2));
  drawTrack(g, T, 0); for (const b of T.bridges) drawBridge(g, T, b);
  const ink = MINI_INK[def.name]; if (ink) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = ink.ground; g.globalAlpha = 0.85; g.fillRect(0, 0, c.width, c.height); g.restore(); const L = (T.routes || [T]).map(R => inkRoad(g, R, sc, ink)); for (let k = 0; k < 3; k++) for (const p of L) p[k](); }   // (every road's forest, then edges, then the pistes, so a fork's woods don't cover the other way)
  return c;
}

// the menu backdrop's track: the whole track drawn once, at low resolution, with a margin round it, softened a touch like
// a shallow depth of field behind the panels (where the browser can blur a canvas). Its place in the world (x, y, w, h)
// and its ground colour come with it.
export const LAYER_M = 600;
export function layerBox(T) {
  const B = T.bbox, M = LAYER_M, res = Math.min(0.42, 2600 / (B.w + M * 2), 2600 / (B.h + M * 2));
  return { res, cw: Math.ceil((B.w + M * 2) * res), ch: Math.ceil((B.h + M * 2) * res), x: B.x - M, y: B.y - M, w: B.w + M * 2, h: B.h + M * 2, ground: lookOf(T).ground };
}
export function drawLayer(def) {
  const T = buildTrack(def), L = layerBox(T), c = canvasOf(L.cw, L.ch), x = c.getContext('2d');
  x.fillStyle = L.ground; x.fillRect(0, 0, c.width, c.height);
  x.setTransform(L.res, 0, 0, L.res, -L.x * L.res, -L.y * L.res);
  drawTrack(x, T, 1); for (const b of T.bridges) drawBridge(x, T, b);
  const soft = canvasOf(c.width, c.height), sx = soft.getContext('2d'); sx.filter = 'blur(1.3px) saturate(1.1)'; sx.drawImage(c, 0, 0);
  return { ...L, canvas: sx.filter && sx.filter !== 'none' ? soft : c };
}
// what the backdrop's karts need of a track (geometry.js trackSample's: the centreline, its tangents and width, its length,
// open or a loop), packed flat (it comes from the worker), and a point along it the way trackSample finds one
export function pathOf(T) {
  const N = T.N, pts = new Float32Array(N * 2), tan = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { pts[i * 2] = T.pts[i][0]; pts[i * 2 + 1] = T.pts[i][1]; tan[i * 2] = T.tan[i][0]; tan[i * 2 + 1] = T.tan[i][1]; }
  return { N, L: T.L, open: !!T.open, pts, tan, hw: Float32Array.from(T.hw) };
}
export function pathSample(P, s) {
  s = P.open ? Math.max(0, Math.min(P.L, s)) : ((s % P.L) + P.L) % P.L;
  const f = s / STEP, i = Math.min(Math.floor(f), P.N - 1), j = P.open ? Math.min(i + 1, P.N - 1) : (i + 1) % P.N, t = f - Math.floor(f);
  const tx = lerp(P.tan[i * 2], P.tan[j * 2], t), ty = lerp(P.tan[i * 2 + 1], P.tan[j * 2 + 1], t), tl = Math.hypot(tx, ty) || 1;
  return { x: lerp(P.pts[i * 2], P.pts[j * 2], t), y: lerp(P.pts[i * 2 + 1], P.pts[j * 2 + 1], t), nx: -ty / tl, ny: tx / tl, hw: lerp(P.hw[i], P.hw[j], t) };
}
