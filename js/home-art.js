// The title's mode cards' pictures (menu.js homeScreen, and the Online screen's ways): a little scene per way to play
// with the game's 3D karts and mascots (model3d.js still3D, car3d.js carStill3D: one baked frame each, ~0.1-0.3 MB),
// three-quarter view, lit from the top left. The 2D karts and mascots show at once and the 3D scene fades in when its
// stills are made (a resize reuses the last ones, scaled, till the sharp ones are); 2D for good with no WebGL. Cosmetic.
import { RIDE_UP, drawCar, drawCarShadow, drawMascot } from './art.js';
import { ELEV3D, PELEV3D, still3D } from './art/model3d.js';
import { carStill3D, seatUp3D } from './art/car3d.js';
import { BODIES, CHARACTERS } from './core.js';
import { settings } from './settings.js';
import { shotWait } from './shot.js';

const byId = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
const T0 = 0.4;      // (a fixed moment: eyes open, no blink)
const KYAW = 0.42;   // a kart's nose: right and a little toward you
const SQ = 0.62;     // the ground seen from the 3D cars' view (car3d.js 'table')
const FADE = 0.28;   // s: the 2D picture fading into the 3D one
const still = () => settings.reduced || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
const kq = s => Math.min(10, Math.ceil(s * 4) / 4);   // (px a unit the stills are made at: a few sizes, not one per pixel)

// a 3D still, or the last one made for it at another size (scaled) while the sharp one's made; R notes what's missing
const last = new Map();
function get(R, key, make) {
  const r = make(R.redo);
  if (r) { last.set(key, r); return r; }
  if (r === null) { R.fail = true; return null; }
  const old = last.get(key); R.stale = true; if (!old) R.wait = true;
  return old || null;
}
const shadow = (g, x, y, rx, ry) => { g.fillStyle = 'rgba(8,6,26,.3)'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };

// a kart with its racer riding, nose right; o: { ghost (a time trial's), mood (2D only) }
function kart(g, R, ch, x, y, s, o = {}) {
  const B = BODIES[ch.body] || BODIES.kart;
  if (R.three) {
    const car = get(R, 'c|' + ch.id, d => carStill3D(ch, kq(s), KYAW, d)), my = KYAW + 0.75;   // (the rider turned a little more toward you)
    const rider = get(R, 'm|' + ch.id, d => still3D(ch.id, '', kq(s * 0.95), my, ELEV3D, d));
    if (!car || !rider) return;
    const L = o.ghost ? ghostLayer(g) : g;
    L.save(); L.translate(x, y); L.scale(s, s);
    if (!o.ghost) shadow(L, 3, 4, B.L * 0.56, B.W * SQ * 0.62);
    L.drawImage(car.cv, car.x, car.y, car.w, car.h);
    L.translate(Math.cos(KYAW) * B.seat, Math.sin(KYAW) * B.seat * SQ - seatUp3D(ch, 'table') - 2); L.scale(0.95, 0.95);
    const C = rider.cell; L.drawImage(rider.cv, C[0], C[1], C[2], C[3], C[4], C[5], C[6], C[7]);
    L.restore();
    if (o.ghost) ghostDone(g, L);
    return;
  }
  g.save(); g.translate(x, y); g.scale(s, s);
  if (o.ghost) g.globalAlpha = 0.38;
  if (!o.ghost) drawCarShadow(g, ch, 0);
  drawCar(g, ch);
  g.translate(B.seat, -(RIDE_UP[ch.body] || 0) - 2);
  drawMascot(g, ch, { t: T0, scale: 0.95, look: [1, 0.15], face: 1, mood: o.mood, shadow: false });
  g.restore();
}
// the ghost: drawn on a scratch layer, tinted cyan and see-through
let ghostCv = null;
function ghostLayer(g) {
  const c = ghostCv || (ghostCv = document.createElement('canvas'));
  if (c.width !== g.canvas.width || c.height !== g.canvas.height) { c.width = g.canvas.width; c.height = g.canvas.height; }
  const L = c.getContext('2d'); L.setTransform(1, 0, 0, 1, 0, 0); L.clearRect(0, 0, c.width, c.height); L.setTransform(g.getTransform());
  return L;
}
function ghostDone(g, L) {
  L.setTransform(1, 0, 0, 1, 0, 0); L.globalCompositeOperation = 'source-atop'; L.fillStyle = 'rgba(110,225,255,.55)'; L.fillRect(0, 0, L.canvas.width, L.canvas.height); L.globalCompositeOperation = 'source-over';
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 0.45; g.drawImage(L.canvas, 0, 0); g.restore();
}
// a racer standing (the podium, the face-off); o: { yaw (π/2 at you), pose (3D), mood, look/face (2D) }
function stand(g, R, ch, x, y, s, o = {}) {
  const yaw = o.yaw ?? Math.PI / 2;
  if (R.three) {
    const v = (o.pose || 'stand') + '/' + (o.mood || ''), F = get(R, 'f|' + ch.id + '|' + v + '|' + yaw.toFixed(2), d => still3D(ch.id, v, kq(s), yaw, PELEV3D, d));
    if (!F) return;
    g.save(); g.translate(x, y); g.scale(s, s);
    shadow(g, 3, 1.5, 19, 5.5);
    const C = F.cell; g.drawImage(F.cv, C[0], C[1], C[2], C[3], C[4], C[5], C[6], C[7]);
    g.restore();
    return;
  }
  g.save(); g.translate(x, y); g.scale(s, s);
  shadow(g, 0, 1, 17, 5);
  drawMascot(g, ch, { t: T0, look: o.look || [Math.cos(yaw) * 0.8, 0.2], face: Math.cos(yaw) < -0.01 ? -1 : 1, mood: o.mood, shadow: false });
  g.restore();
}
// a strip of road across the card: tarmac, kerbs top and bottom, a dashed middle line
function road(g, w, y0, y1, k) {
  g.fillStyle = '#3b3d4f'; g.fillRect(0, y0, w, y1 - y0);
  g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, y0, w, (y1 - y0) * 0.45);
  const kh = 7 * k, kw = 18 * k;
  for (const ky of [y0 - kh, y1]) for (let x = 0, i = 0; x < w; x += kw, i++) { g.fillStyle = i % 2 ? '#f3f1ff' : '#e5463a'; g.fillRect(x, ky, kw, kh); }
  g.fillStyle = 'rgba(255,255,255,.55)';
  for (let x = 10 * k; x < w; x += 46 * k) g.fillRect(x, (y0 + y1) / 2 - 1.5 * k, 22 * k, 3 * k);
}
const lines = (g, x, y, k, col = 'rgba(255,255,255,.55)') => { g.fillStyle = col; for (const [dy, l] of [[-9, 26], [0, 38], [9, 22]]) { g.beginPath(); g.roundRect(x - l * k, y + dy * k - 1.6 * k, l * k, 3.2 * k, 2 * k); g.fill(); } };

const SCENES = {
  // three karts off the line, yours in front
  single(g, R, w, h, o) {
    const k = h / 130, y0 = h * 0.3, y1 = h * 0.94;
    road(g, w, y0, y1, k);
    const sx = w * 0.12;   // the chequered start line
    for (let r = 0; r * 8 * k < y1 - y0; r++) for (let c = 0; c < 2; c++) { g.fillStyle = (r + c) % 2 ? '#14102a' : '#fff'; g.fillRect(sx + c * 8 * k, y0 + r * 8 * k, 8 * k, Math.min(8 * k, y1 - y0 - r * 8 * k)); }
    const cast = [o.ch, ...['ferris', 'tux', 'pyth', 'duke'].map(byId).filter(c => c !== o.ch)].slice(0, 3);
    const cx = Math.min(w * 0.6, w / 2 + 110 * k), s = 1.0 * k, m = (y0 + y1) / 2;
    [[cx + 92 * k, m - 14 * k], [cx - 130 * k, m - 14 * k], [cx - 20 * k, m + 18 * k]].forEach(([x, y], j) => {   // (back row first: nearer karts over farther)
      const i = [0, 2, 1][j]; lines(g, x - 46 * k, y - 4 * k, k * 0.9); kart(g, R, cast[i], x, y, s, { mood: i ? null : 'happy' });
    });
  },
  // three on the podium, the winner cheering
  cup(g, R, w, h) {
    const k = Math.min(w / 190, h / 112), cx = w * (w < 1.6 * h ? 0.5 : 0.56), base = h * 0.99;
    const steps = [[-1, 30, '#c0c6dc', 'pyth'], [1, 20, '#e09a5a', 'docky'], [0, 46, '#ffd23c', 'gopher']];
    for (const [i, sh, col, id] of steps) {
      const x = cx + i * 54 * k, top = base - sh * k * 0.8;
      g.fillStyle = '#2a2463'; g.fillRect(x - 27 * k, top, 54 * k, base - top);
      g.fillStyle = col; g.fillRect(x - 27 * k, top, 54 * k, 6 * k);
      stand(g, R, byId(id), x, top + 2 * k, (R.three ? 1.32 : 1.25) * k, { mood: i === 0 ? 'happy' : null, yaw: Math.PI / 2 - i * 0.55 - (i ? 0 : 0.25) });
    }
  },
  // you and your ghost
  tt(g, R, w, h) {
    const k = Math.min(h / 100, w / 250), y0 = h * 0.36, y1 = h * 0.96, m = (y0 + y1) / 2, ch = byId('swifty');
    road(g, w, y0, y1, k);
    const x = Math.max(w * 0.66, 140 * k);
    kart(g, R, ch, x - 92 * k, m + 2 * k, 0.9 * k, { ghost: true });
    lines(g, x - 46 * k, m - 2 * k, k, 'rgba(120,230,255,.7)');
    kart(g, R, ch, x, m + 2 * k, 0.9 * k, { mood: 'happy' });
  },
  // two friends side by side
  online(g, R, w, h) {
    const k = Math.min(h / 100, w / 230), y0 = h * 0.36, y1 = h * 0.96, m = (y0 + y1) / 2, x = Math.min(w * 0.6, w - 85 * k);
    road(g, w, y0, y1, k);
    [[byId('docky'), x + 40 * k, m - 6 * k], [byId('octo'), x - 50 * k, m + 10 * k]].forEach(([ch, cx, cy]) => {
      lines(g, cx - 44 * k, cy - 2 * k, k * 0.8); kart(g, R, ch, cx, cy, 0.78 * k);
    });
  },
  // your kart on an empty grid, waiting for friends (the Online screen's Host)
  host(g, R, w, h, o) {
    const k = h / 100, y0 = h * 0.36, y1 = h * 0.96, m = (y0 + y1) / 2, x = w * 0.5;
    road(g, w, y0, y1, k);
    for (let r = 0; r * 7 * k < y1 - y0; r++) { g.fillStyle = r % 2 ? '#14102a' : '#fff'; g.fillRect(x + 62 * k, y0 + r * 7 * k, 7 * k, Math.min(7 * k, y1 - y0 - r * 7 * k)); }
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2.4 * k;
    for (const [gx, gy] of [[x + 10 * k, m - 13 * k], [x - 74 * k, m + 13 * k], [x - 158 * k, m - 13 * k]]) { g.beginPath(); g.moveTo(gx - 34 * k, gy - 12 * k); g.lineTo(gx + 34 * k, gy - 12 * k); g.lineTo(gx + 34 * k, gy + 12 * k); g.lineTo(gx - 34 * k, gy + 12 * k); g.stroke(); }
    kart(g, R, o.ch, x + 10 * k, m - 13 * k, 0.78 * k, { mood: 'happy' });
  },
  // two fighters squaring up on a plinth
  fight(g, R, w, h) {
    const k = Math.min(w / 200, h / 104), cx = w * 0.56, fy = h * 0.9;
    shadow(g, cx + 4 * k, fy + 6 * k, 92 * k, 18 * k);
    g.fillStyle = '#2a2463'; g.beginPath(); g.ellipse(cx, fy, 90 * k, 16 * k, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a3380'; g.beginPath(); g.ellipse(cx, fy - 3 * k, 86 * k, 13 * k, 0, 0, Math.PI * 2); g.fill();
    stand(g, R, byId('tux'), cx - 44 * k, fy - 2 * k, 1.4 * k, { yaw: Math.PI / 2 - 0.85, pose: 'wind' });
    stand(g, R, byId('duke'), cx + 44 * k, fy - 2 * k, 1.4 * k, { yaw: Math.PI / 2 + 0.85, pose: 'guard' });
  },
};

// draw a card's scene into its canvas (sized by CSS): the 3D one if its stills are made (or as soon as they are),
// meanwhile the 2D one; o: { ch: the player's racer }
const state = new WeakMap();   // canvas -> { shown: '2d' | '3d', w, h, raf, fade }
const waiting = new Set();     // canvases still showing 2D while their 3D stills are made (screenshots wait for them)
shotWait(() => [...document.querySelectorAll('canvas[data-art]')].every(cv => !cv.clientWidth || state.has(cv) && !waiting.has(cv) && !state.get(cv).fade));
let scratch = null;
export function drawModeArt(cv, mode, o = {}) {
  const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (!w || !h || !SCENES[mode] || !cv.isConnected) return;
  const st = state.get(cv) || { shown: '', w: 0, h: 0, raf: 0, fade: 0 }; state.set(cv, st);
  const so = { ch: o.ch || CHARACTERS[0] }, resized = st.w !== w || st.h !== h;
  const paint = (g, three, R) => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); g.lineJoin = 'round'; g.lineCap = 'round'; SCENES[mode](g, R, w, h, so); };
  // the 3D one, off screen first: shown only if every still is there (a stale one, at another size, will do for now)
  const R = { three: true, fail: false, wait: false, stale: false, redo: () => { if (!st.raf) st.raf = requestAnimationFrame(() => { st.raf = 0; drawModeArt(cv, mode, o); }); } };
  const S = scratch || (scratch = document.createElement('canvas'));
  if (S.width !== w || S.height !== h) { S.width = w; S.height = h; }
  paint(S.getContext('2d'), true, R);
  const ok3 = !R.fail && !R.wait;
  if (!ok3 && st.shown && !resized && !R.fail) return;   // (waiting: whatever's shown stays)
  if (R.fail) waiting.delete(cv);
  if (resized) { cv.width = w; cv.height = h; st.w = w; st.h = h; }
  const g = cv.getContext('2d');
  if (!ok3) { paint(g, false, { three: false }); st.shown = '2d'; if (!R.fail) waiting.add(cv); return; }
  waiting.delete(cv);
  if (st.shown === '2d' && !resized && !still()) {   // the 2D one fading into the 3D one
    const from = document.createElement('canvas'); from.width = w; from.height = h; from.getContext('2d').drawImage(cv, 0, 0);
    const to = document.createElement('canvas'); to.width = w; to.height = h; to.getContext('2d').drawImage(S, 0, 0);
    const t0 = performance.now(); cancelAnimationFrame(st.fade);
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / 1000 / FADE);
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); g.globalAlpha = 1 - t; g.drawImage(from, 0, 0); g.globalAlpha = t; g.drawImage(to, 0, 0); g.globalAlpha = 1;
      st.fade = t < 1 ? requestAnimationFrame(step) : 0;
    };
    step();
  } else { cancelAnimationFrame(st.fade); st.fade = 0; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); g.drawImage(S, 0, 0); }
  st.shown = '3d';
}
// every card's scene in root, drawn now and again whenever it changes size
export function homeArt(root, o) {
  const draw = cv => drawModeArt(cv, cv.dataset.art, o);
  const all = [...root.querySelectorAll('canvas[data-art]')];
  if (typeof ResizeObserver === 'undefined') return all.forEach(draw);
  const ro = new ResizeObserver(es => { for (const e of es) { if (!e.target.isConnected) { ro.unobserve(e.target); continue; } draw(/** @type {HTMLCanvasElement} */ (e.target)); } });
  all.forEach(cv => ro.observe(cv));
}
