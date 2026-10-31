// The menu's backdrop: the picked track in the game's own art with a little pack of karts and a riding camera. Cheap:
// the track is drawn once into a soft low-res layer, then each frame is one crop plus a few karts. Runs only behind
// menu-like screens; holds still with reduced motion. Cosmetic only (Math.random for the pack).
import { RIDE_UP, drawCar, drawCarShadow, drawMascot } from './art.js';
import { paint, painterOn } from './art/painter.js';
import { drawLayer, layerBox, pathOf, pathSample } from './art/pictures.js';
import { BODIES, CHARACTERS } from './core.js';
import { buildTrack } from './geometry.js';
import { settings } from './settings.js';
import { TRACKS } from './tracks.js';
import { shotWait } from './shot.js';

const SHOW = new Set(['menu', 'room', 'loading', 'podium']);
const VIEW = 1500;        // world units across the longer side of the screen
const PACK_V = 360;       // the pack's speed (world units / s)
const FADE = 0.7;         // s: crossfade to a new track
let cv = null, g = null, stateOf = () => 'menu', want = 0, layer = null, old = null, fadeT = 1, building = -1;
let pack = [], camS = 0, camX = 0, camY = 0, t0 = 0, last = 0, drawnStill = '';
const layers = new Map();   // track index -> its layer (the last few)
const calmMQ = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;   // (one, read every frame: a new one each frame cost up to 40 ms at a 4x slower CPU)
const still = () => settings.reduced || !!(calmMQ && calmMQ.matches);

// stateFn: the game's state ('menu', 'race', ...), read every frame
export function initMenuBg(stateFn) {
  stateOf = stateFn;
  cv = document.createElement('canvas'); cv.id = 'menubg'; cv.setAttribute('aria-hidden', 'true');
  const shade = document.createElement('div'); shade.className = 'menubg-shade';
  document.body.prepend(cv, shade);
  g = cv.getContext('2d');
  requestAnimationFrame(frame);
  shotWait(() => !SHOW.has(stateOf()) || layer && layer.i === want && fadeT >= 1);
}
// the track to show (the menu's pick, the room's, the race about to load)
export function bgTrack(i) { if (Number.isInteger(i) && TRACKS[i]) want = i; }

// a track's layer: { i, T (its path, art/pictures.js pathOf), canvas (or ImageBitmap), x, y, w, h (its world rect),
// ground, drawn (drawn now, not stored), blob (its file for the store), box (place, size, ground and path, stored with
// the picture) }, drawn here or on the painter's worker (art/painter.js)
const fits = (pic, B) => pic && B && pic.width === B.cw && pic.height === B.ch;
const fromBox = (i, B, canvas, more) => keep({ i, T: B.path, canvas, x: B.x, y: B.y, w: B.w, h: B.h, ground: B.ground, box: B, ...more });
function makeLayer(i, pic = null) {
  if (layers.has(i)) return layers.get(i);
  const T = buildTrack(TRACKS[i]), B = { ...layerBox(T), path: pathOf(T) };
  if (fits(pic, B)) return fromBox(i, B, pic);   // (the boot's, kept from the last visit)
  return fromBox(i, B, drawLayer(TRACKS[i]).canvas, { drawn: true });
}
async function layerOff(i, pic = null) {
  if (layers.has(i)) return layers.get(i);
  const r = await paint(pic ? 'path' : 'layer', TRACKS[i].name, 0);
  if (layers.has(i)) return layers.get(i);
  if (!r) return makeLayer(i, pic);
  if (pic && !fits(pic, r.box)) return layerOff(i, null);   // (a stored picture of another size: drawn again)
  if (!pic && r.blob && bgKeep.onDrawn) bgKeep.onDrawn(TRACKS[i].name, r.blob, r.box);
  return pic ? fromBox(i, r.box, pic) : fromBox(i, r.box, r.pic, { drawn: true, blob: r.blob });
}
// the store of drawn pictures (thumb-store.js) keeps each layer the painter draws (with its file, encoded there), so the
// next visit's boot finds the last picked track's
export const bgKeep = { onDrawn: null };
const keep = L => { layers.set(L.i, L); if (layers.size > 4) layers.delete(layers.keys().next().value); return L; };

// the boot screen (boot.js) builds the first track's layer as one of its steps (bgHold: the frame doesn't meanwhile).
// kept: its stored picture and box (thumb-store.js), used if they fit. Resolves to { pic, box } if drawn here now (for
// the store), else null.
let bgHold = false;
export const holdBg = v => { bgHold = v; };
export const bgName = () => TRACKS[want] ? TRACKS[want].name : '';
export async function warmBg(kept = null) {
  if (!TRACKS[want] || layers.has(want)) return null;
  const pic = kept && kept.pic, B = kept && kept.box;
  const L = fits(pic, B) && B.path ? fromBox(want, B, pic) : painterOn() ? await layerOff(want, pic) : makeLayer(want, pic);
  return L.drawn && !L.blob ? { pic: L.canvas, box: L.box } : null;
}

// a fresh pack: five racers in a loose bunch, each with its own pace wobble and lane
function newPack() {
  const ids = CHARACTERS.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, 5);
  pack = ids.map((ci, k) => ({ ch: CHARACTERS[ci], off: -k * 150 + (Math.random() - 0.5) * 60, w: 0.35 + Math.random() * 0.35, ph: Math.random() * 6.3, amp: 80 + Math.random() * 70,
    lw: 0.25 + Math.random() * 0.3, lph: Math.random() * 6.3, side: k % 2 ? 1 : -1, s: 0, x: 0, y: 0, a: 0 }));
  camS = 200 + Math.random() * 300;
}

function frame(now) {
  requestAnimationFrame(frame);
  const on = SHOW.has(stateOf());
  if (cv.style.display !== (on ? '' : 'none')) cv.style.display = on ? '' : 'none';
  document.body.classList.toggle('bg-on', on);
  if (!on) { last = 0; return; }
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
  // a new track: build it a moment later (so the click isn't held up), on the painter's worker where it can (here it was a
  // 0.1-0.2 s stall), then crossfade
  if ((!layer || layer.i !== want) && building !== want && !bgHold) {
    building = want;
    const i = want, show = L => {
      if (building !== i) return;
      building = -1;
      old = layer ? { L: layer, x: camX, y: camY } : null;   // the old scene holds still while the new one fades in over it
      layer = L; fadeT = old ? 0 : 1; if (!pack.length) newPack(); drawnStill = '';
    };
    if (layers.has(i)) show(layers.get(i));
    else if (painterOn()) layerOff(i).then(show, () => { if (building === i) building = -1; });
    else setTimeout(() => { if (building === i) show(makeLayer(i)); }, 60);
  }
  if (!layer) return;
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5), W = innerWidth, H = innerHeight;
  if (cv.width !== Math.round(W * DPR) || cv.height !== Math.round(H * DPR)) { cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); drawnStill = ''; }
  const calm = still();
  if (calm) { const key = layer.i + '|' + cv.width + 'x' + cv.height; if (drawnStill === key) return; drawnStill = key; fadeT = 1; old = null; }
  fadeT = Math.min(1, fadeT + dt / FADE); if (fadeT >= 1) old = null;
  t0 += calm ? 0 : dt;
  camS += calm ? 0 : PACK_V * dt;
  const T = layer.T, L = T.L, at = s => pathSample(T, T.open ? ((s % L) + L) % L : s);
  // the karts: round the track at the pack's pace with a wobble, so they swap places in view
  for (const k of pack) {
    const s = camS + k.off + Math.sin(t0 * k.w + k.ph) * k.amp, q = at(s), q2 = at(s + 30);
    const lat = (Math.sin(t0 * k.lw + k.lph) * 0.45 + k.side * 0.12) * q.hw;
    k.x = q.x + q.nx * lat; k.y = q.y + q.ny * lat; k.a = Math.atan2(q2.y - q.y, q2.x - q.x) || k.a;
  }
  // the camera: on the middle of the pack, eased (a new track, or a point-to-point course going back to its start: a cut)
  const mid = at(camS - 220), e = calm || Math.hypot(mid.x - camX, mid.y - camY) > 900 ? 1 : 1 - Math.exp(-dt * 3);
  camX += (mid.x - camX) * e; camY += (mid.y - camY) * e;
  const sc = Math.max(W, H) / VIEW;
  const view = (x, y) => g.setTransform(DPR * sc, 0, 0, DPR * sc, DPR * (W / 2 - x * sc), DPR * (H / 2 - y * sc));
  // one crop of a track layer: just what's on screen
  const paint = (Ly, x, y) => {
    view(x, y);
    const k = Ly.canvas.width / Ly.w, vx0 = Math.max(Ly.x, x - W / 2 / sc), vy0 = Math.max(Ly.y, y - H / 2 / sc), vx1 = Math.min(Ly.x + Ly.w, x + W / 2 / sc), vy1 = Math.min(Ly.y + Ly.h, y + H / 2 / sc);
    if (vx1 > vx0 && vy1 > vy0) g.drawImage(Ly.canvas, (vx0 - Ly.x) * k, (vy0 - Ly.y) * k, (vx1 - vx0) * k, (vy1 - vy0) * k, vx0, vy0, vx1 - vx0, vy1 - vy0);
  };
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  if (old) { g.fillStyle = old.L.ground; g.fillRect(0, 0, cv.width, cv.height); paint(old.L, old.x, old.y); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = fadeT; }
  g.fillStyle = layer.ground; g.fillRect(0, 0, cv.width, cv.height);
  paint(layer, camX, camY);
  view(camX, camY);
  for (const k of pack) { g.save(); g.translate(k.x, k.y); drawCarShadow(g, k.ch, k.a); g.rotate(k.a); drawCar(g, k.ch, { steer: 0 }); g.restore(); }
  for (const k of [...pack].sort((a, b) => a.y - b.y)) {
    const seat = (BODIES[k.ch.body] || {}).seat || 0;
    g.save(); g.translate(k.x + Math.cos(k.a) * seat, k.y + Math.sin(k.a) * seat - (RIDE_UP[k.ch.body] || 0) + Math.sin(t0 * 9 + k.ph) * 0.7);
    drawMascot(g, k.ch, { t: t0 + k.ph, scale: 0.92, look: [Math.cos(k.a), Math.sin(k.a)] }); g.restore();
  }
  g.globalAlpha = 1;
}
