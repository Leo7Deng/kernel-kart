// Kernel Kart: Fight mode's move cards on the setup screen (fight-ui.js): for a fighter, each move with its name, its key
// and pad button, what it does, its tell and its answer, and a small looping clip
// of it. The clips are the real sim (js/fight.js) with a
// fixed seed and a scripted input timeline for the demonstrator (fighter 0) and the target (fighter 1: standing, blocking
// or attacking, as fits the move), restarted every couple of seconds and drawn by draw-fight.js into the card's canvas
// with a fixed close camera and no HUD, so a clip always shows the move as it really is. Only the clips on screen run
// (an IntersectionObserver), at about 30 fps, and they all stop when the screen goes.
import { FIGHTERS } from './fight-chars.js';
import { drawFight, fightEvents } from './draw-fight.js';
import { fresh, inputAt, script } from './fight-clips.js';
import { LAYOUTS, PAD, keyLabel } from './fight-keys.js';

// a fighter's cards: its three moves and its evade, on the light, heavy, special and guard keys; their names, blurbs,
// tells and answers are its FIGHTERS entry's (js/kits/<id>.js)
export const MOVES4 = ['move1', 'move2', 'move3', 'evade'];
const KEY4 = { move1: 'light', move2: 'heavy', move3: 'special', evade: 'guard' };
export const moveOrder = () => MOVES4;
export const cardMove = (id, k) => { const M = FIGHTERS[id] && FIGHTERS[id].moves; return (M && M[k]) || null; };
export const moveTell = (id, k) => (cardMove(id, k) || {}).tell || '';
export const moveAnswer = (id, k) => (cardMove(id, k) || {}).answer || '';
// what holding the key does
export const moveHold = (id, k) => { const m = cardMove(id, k); return !m ? '' : m.hold === 'aim' ? 'hold to aim' : m.hold === 'steer' ? 'hold to steer' : m.hold === 'charge' ? 'tap or hold' : k === 'evade' && m.charges ? `tap · ${m.charges} charges` : 'tap'; };
export const moveName = (id, k) => (cardMove(id, k) || {}).name || '';
export const moveDesc = (id, k) => (cardMove(id, k) || {}).blurb || '';
export const moveKind = k => k === 'evade' ? 'Evade' : MOVES4.includes(k) ? 'Move ' + k.slice(4) : '';
// the keys for a move in a layout ('solo', 'p1', 'p2'), as keycap labels, and the pad button
export function moveKeys(L, k) { return KEY4[k] ? [keyLabel(LAYOUTS[L].keys[KEY4[k]][0])] : []; }
export function movePad(k) { return PAD[KEY4[k]]; }

// a clip on a canvas: step(dt) runs and draws it
export function makeClip(cv, id, k) {
  const sc = script(id, k); if (!sc) return null;
  const c = { cv, id, k, sc, F: null, t: 0 };
  fresh(c);
  c.step = dt => {
    if (c.t >= sc.len) fresh(c);
    if (dt > 0) {
      const F = c.F;
      F.setInput(0, inputAt(sc.a, c.t)); F.setInput(1, inputAt(sc.b, c.t));
      F.update(dt); fightEvents(F); c.t += dt;   // (the events' effects too: the move cards show the moves' particles and props)
      if (F.phase !== 'fight' && F.phase !== 'sudden') c.t = sc.len;   // (someone fell or went down: start again)
    }
    const D = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * D) || cv.height !== Math.round(h * D)) { cv.width = Math.round(w * D); cv.height = Math.round(h * D); }
    const z = w / sc.cam.w;
    drawFight(c.F, dt, { g: cv.getContext('2d'), w, h, dpr: D, hud: false, cam: { x: sc.cam.x, y: (sc.cam.y || 0) - 16, z } });
  };
  return c;
}

// ---------------------------------------------------------------- running the clips on screen
const clips = new Set(), seen = new WeakSet();
let raf = 0, last = 0, io = null;
export function runClips(list) {
  for (const c of list) clips.add(c);
  if (typeof IntersectionObserver !== 'undefined') {
    if (!io) io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); }, { threshold: 0.05 });
    for (const c of list) io.observe(c.cv);
  }
  for (const c of list) c.step(0);   // (a still frame straight away)
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
}
export function stopClips() { for (const c of clips) if (io) io.unobserve(c.cv); clips.clear(); if (raf) cancelAnimationFrame(raf); raf = 0; }
function tick(now) {
  raf = 0;
  for (const c of [...clips]) if (!c.cv.isConnected) { clips.delete(c); if (io) io.unobserve(c.cv); }
  if (!clips.size) return;
  const dt = (now - last) / 1000;
  if (dt >= 1 / 31) {   // (about 30 fps)
    last = now;
    for (const c of clips) if (!io || seen.has(c.cv)) c.step(Math.min(0.05, dt));
  }
  raf = requestAnimationFrame(tick);
}
