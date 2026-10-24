// Kernel Kart: a racer on a turntable, for the menu's player slots (menu.js) and the online room (net-ui.js). The kart
// turns slowly on a round plate with its mascot riding it: the 3D model when there is one (art/model3d.js drawMascot3D,
// whatever the in-race 3D setting says: that one is only about the race), else the 2D mascot, gently bobbing. Picking a
// racer gives it a quick extra spin and a happy face. One requestAnimationFrame loop draws every turntable on the page and
// stops when none is left. Cosmetic only (no race state); reduced motion (the OS's or Settings > Reduced effects) holds it
// still at a three-quarter view.
import { RIDE_UP, drawCar, drawCarShadow, drawMascot } from './art.js';
import { drawMascot3D, has3D, warm3D } from './art/model3d.js';
import { drawCar3D, seatUp3D, warmTable3D } from './art/car3d.js';
import { BODIES } from './core.js';
import { settings } from './settings.js';

const TURN = 5.5;          // s for one turn
const SPIN = 0.7;          // s: the extra spin when picked
const SQ = 0.62;           // the plate and the kart's footprint, seen from above at an angle
const calmMQ = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;   // (one, read every frame)
const still = () => settings.reduced || !!(calmMQ && calmMQ.matches);
const tables = new Set();
let raf = 0;

// a racer's 3D sheets (its mascot, and its car from the plate's angle with Settings > 3D cars), on the bakery's queue
// (art/warm.js) the first time it's shown, hovered or focused (not all ten up front: each is several MB). Never made on
// the spot (that froze every turntable for 0.2-0.4 s when a new racer was picked): the 2D one for the few frames it takes
export function warmRacer(ch) {
  if (!ch || !has3D(ch.id)) return;
  try { warm3D([ch.id]); if (settings.cars3d) warmTable3D(ch); } catch (e) { }
}

// cv: a canvas sized by CSS. o: { ch, col (the plate's colour), phase (s: where in its turn it starts), happy (a smile the
// whole time: the results' winner, a new best) }. Returns { set(ch, celebrate), set col }: show another racer (celebrate:
// the spin and the happy face of a pick)
export function turntable(cv, o = {}) {
  const T = { cv, g: cv.getContext('2d'), ch: o.ch, col: o.col || '#ff5d73', t0: -(o.phase || 0), pick: -9, happy: !!o.happy };   // (t0: the turn runs on the clock, so a table drawn again carries on where it was)
  warmRacer(T.ch);
  T.set = (ch, celebrate = false) => {
    if (ch !== T.ch) { T.ch = ch; warmRacer(ch); }
    if (celebrate) T.pick = performance.now() / 1000;
  };
  return add(T);
}
const add = T => { tables.add(T); if (!raf) raf = requestAnimationFrame(frame); return T; };
// a table is turning on the page now (ui.js warmMinis waits: a track's preview takes 0.1-0.9 s in one go, a freeze in the spin)
export const turning = () => !still() && [...tables].some(T => T.cv.isConnected);

// a racer standing on the cup's podium (ui.js showPodium), no kart: facing you, swaying a little side to side, the 3D
// model when there is one (else the 2D mascot). o: { ch, size (mascot scale per 100 px of canvas), mood, phase, hop (the
// champion's happy bounce), yaw (the way it faces: π/2 at you; the side steps turn three-quarters toward the middle) }
export function podiumFigure(cv, o) {
  const T = { cv, g: cv.getContext('2d'), ch: o.ch, fig: o };
  warmRacer(T.ch);
  return add(T);
}
function drawFigure(T, now) {
  const cv = T.cv, dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (!w || !h) return;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = T.g, o = T.fig, calm = still(), t = now + (o.phase || 0);
  const yaw = (o.yaw ?? Math.PI / 2) + (calm ? 0 : Math.sin(t * 0.8) * 0.4), hop = o.hop && !calm ? Math.abs(Math.sin(t * 3.4)) * 7 : 0;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
  const k = o.size * h / 100;
  g.translate(w / 2, h * 0.855); g.scale(k, k);
  g.fillStyle = 'rgba(6,5,22,0.3)'; g.beginPath(); g.ellipse(0, 1, 17 * (1 - hop / 30), 5 * (1 - hop / 30), 0, 0, Math.PI * 2); g.fill();   // its shadow, smaller as it hops
  g.translate(0, -hop);
  const mo = { t: now, yaw, smooth: true, fine: true, look: [Math.cos(yaw) * 0.3, 0.3], face: Math.cos(yaw) < 0 ? -1 : 1, mood: o.mood, shadow: false };
  if (!drawMascot3D(g, T.ch, mo)) drawMascot(g, T.ch, mo);
}

// (the turn runs on the frame's own time, rAF's: the same for every table and evenly spaced, where performance.now() in
// the middle of the frame's work wobbles by however long the work before it took)
function frame(ts) {
  raf = 0;
  const now = (ts ?? performance.now()) / 1000;
  for (const T of tables) { if (!T.cv.isConnected) { tables.delete(T); continue; } T.fig ? drawFigure(T, now) : draw(T, now); }
  if (tables.size) raf = requestAnimationFrame(frame);
}

function draw(T, now) {
  const cv = T.cv, dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (!w || !h || !T.ch) return;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = T.g, ch = T.ch, calm = still();
  const sinceP = Math.max(0, now - T.pick), spinK = sinceP < SPIN ? 1 - Math.pow(1 - sinceP / SPIN, 3) : 1;
  const extra = sinceP < SPIN ? -Math.PI * 2 * (1 - spinK) : 0;   // (one extra turn, easing out)
  const yaw = calm ? Math.PI * 0.32 : Math.PI * 0.32 + ((now - T.t0) / TURN) * Math.PI * 2 + extra;
  const B = BODIES[ch.body] || BODIES.kart;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
  // the plate: a flat disc in the player's colour with a darker rim, seen at an angle
  const cx = w / 2, cy = h * 0.62, R = Math.min(w * 0.44, h * 0.52);
  g.fillStyle = 'rgba(6,5,22,0.35)'; g.beginPath(); g.ellipse(cx, cy + R * SQ * 0.16, R * 1.02, R * SQ * 1.02, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = T.col; g.globalAlpha = 0.9; g.beginPath(); g.ellipse(cx, cy + R * SQ * 0.08, R, R * SQ, 0, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1; g.fillStyle = '#231e57'; g.beginPath(); g.ellipse(cx, cy, R * 0.94, R * SQ * 0.94, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = Math.max(1, R * 0.012);
  for (const k of [0.62, 0.32]) { g.beginPath(); g.ellipse(cx, cy, R * 0.94 * k, R * SQ * 0.94 * k, 0, 0, Math.PI * 2); g.stroke(); }
  // the kart, turning: its footprint squashed like the plate, the mascot upright on the seat
  const k = Math.min(R * 1.5 / B.L, h * 0.5 / 46);
  g.save(); g.translate(cx, cy); g.scale(k, k);
  g.save(); g.scale(1, SQ); drawCarShadow(g, ch, yaw, 0); g.restore();
  const c3 = settings.cars3d && drawCar3D(g, ch, { yaw, view: 'table' });   // Settings > 3D cars: the 3D car (art/car3d.js), seen from the plate's angle (2D till it's made)
  if (!c3) { g.save(); g.scale(1, SQ); g.rotate(yaw); drawCar(g, ch); g.restore(); }
  const happy = T.happy || sinceP < 1.4, bob = calm ? 0 : Math.sin(now * 2.6) * 0.8;
  g.translate(Math.cos(yaw) * B.seat, Math.sin(yaw) * B.seat * SQ - (c3 ? seatUp3D(ch, 'table') : RIDE_UP[ch.body] || 0) - 2 + (happy && !calm ? -Math.sin(Math.min(1, sinceP / 0.5) * Math.PI) * 5 : 0));
  const mo = { t: now, scale: 0.92, yaw, smooth: true, fine: true, look: [Math.cos(yaw), Math.sin(yaw)], face: Math.cos(yaw) < 0 ? -1 : 1, mood: happy ? 'happy' : null, shadow: false };
  if (!drawMascot3D(g, ch, mo)) { g.translate(0, bob); drawMascot(g, ch, mo); }
  g.restore();
}
