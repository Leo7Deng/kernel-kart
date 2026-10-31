// Kernel Kart: Fight mode's touch controls (iPhone, iPad).
// Touch only makes the same held input the keys and pads make (fight-keys.js: { up, down, left, right, sx, sy, light,
// heavy, special, guard }), so the sim and online play don't know the difference.
//   the stick    floating, in the left half of a player's zone: it appears where the thumb lands and gives an analog
//                direction (a round dead zone, then the tilt ramped to full, the true angle like a pad's stick); drag past
//                its rim and it follows the thumb. A faint ring shows where it rests while no thumb is on it
//   the buttons  four big round ones in the zone's bottom right corner: the evade in the corner, the three moves in an
//                arc round it (move1 left, move2 up-left, move3 up), each with its move's icon (the HUD's), tinted in the
//                player's colour when ready; cooling: greyed, swept, the rim filling back and the seconds left big on
//                it, a pop when it's back (draw-fight.js's cooldown pieces); the special's gold star; Duke's evade
//                charges under the icon. Generous hit areas (the nearest button within
//                1.4 radii); a thumb sliding off one onto the next presses that one. Moves that aim or steer while held
//                (any `hold` move) take the stick's direction: the sim reads it while the button is held
//   pause        a small round button in the top right corner, under P2's card
//   players      one human: the whole screen. Two humans on one screen (an iPad side by side): the left half is P1's, the
//                right half P2's, each a smaller stick and buttons
//   when         on from the start on a touch-first device (no fine pointer); on again as soon as anyone touches the
//                fight, off when a key or a pad is used (fight-ui.js). Hidden while a card is up and once it's over
// Everything sits inside the safe area (qol.js SAFE: the notch, the home bar). The canvas has touch-action: none and no
// long-press menu (qol.js, qol.css), so nothing scrolls, zooms or pops up. Drawn on the race canvas after the fight's
// HUD (fight-ui.js calls drawTouch), in the Classic Flat look's palette (soft, see-through), classic's glass otherwise.
import { PCOL, TAU } from './core.js';
import { FIGHTERS } from './fight-chars.js';
import { KIT_ACT, hudCard, cdLeft, cdNum, cdRim, cdSecs, chargesOf, fightIcon, popBump, readyGlint, readyPop, specialOf, specialStar, venomDrop, venomLocked } from './draw-fight.js';
import { BK, bold } from './look.js';
import { SAFE } from './qol.js';
import { sfx } from './audio.js';

export const ACTS = ['light', 'heavy', 'special', 'guard'];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rgba = (hex, a) => { if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex; const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const DEAD = 0.16, FULL = 0.86;   // the stick's dead zone and where it reaches full tilt (shares of its radius)

// a touch-first device: no fine pointer (an iPhone, an iPad without a trackpad)
export const touchFirst = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
// the menus' words for touch (no hover, a coarse pointer: an iPad with a trackpad still counts)
export const touchUI = () => typeof matchMedia !== 'undefined' && matchMedia('(hover: none) and (pointer: coarse)').matches;

const T = { on: false, n: 1, ptr: new Map(), stick: [], btn: [], flash: [], hook: null };
const blankStick = () => ({ id: null, bx: 0, by: 0, x: 0, y: 0 });
// a fresh fight: n humans on this screen; on from the start on a touch-first device
export function touchReset(n = 1) {
  T.n = clamp(n, 1, 2); T.ptr.clear(); T.on = touchFirst();
  T.stick = [blankStick(), blankStick()]; T.btn = [{}, {}]; T.flash = [{}, {}];
}
touchReset(1);
export const touchOn = () => T.on;
export function setTouch(on) { if (T.on === on) return; T.on = on; if (!on) release(); }
function release() { T.ptr.clear(); for (const s of T.stick) s.id = null; for (const b of T.btn) for (const a of ACTS) b[a] = 0; }
export const touchRelease = release;

// ---------------------------------------------------------------- the layout (CSS pixels, from the window and the safe area)
const phone = () => Math.min(innerWidth, innerHeight) < 600;
export function layout(n = T.n) {
  const W = innerWidth, H = innerHeight, ph = phone(), k = n > 1 ? 0.82 : 1;
  const R = Math.round((ph ? 33 : 44) * k), SR = Math.round((ph ? 50 : 64) * k), m = ph ? 14 : 24;
  const zones = [];
  for (let p = 0; p < n; p++) {
    const x0 = n > 1 ? p * W / 2 : 0, x1 = n > 1 ? (p + 1) * W / 2 : W;
    const l = x0 + (p === 0 ? SAFE.l : 0), r = x1 - (p === n - 1 ? SAFE.r : 0), b = H - SAFE.b;
    const ex = r - m - R * 1.05, ey = b - m - R * 1.05, D = R * 2.8;
    const at = a => [ex + Math.cos(a) * D, ey + Math.sin(a) * D];
    const btns = { guard: [ex, ey], light: at(Math.PI * 1.03), heavy: at(Math.PI * 1.27), special: at(Math.PI * 1.51) };
    zones.push({ x0, x1, l, r, b, R, SR, btns, rest: [l + m + SR + 10, b - m - SR - 6] });
  }
  return { zones, R, SR, pause: pauseRect() };
}
// the pause button: the top right corner, under the HUD's P2 card (draw-fight.js hudCard: its height at 10 + the safe
// area, × its scale, so it clears the card's bottom edge)
export function pauseRect() {
  const hs = clamp(Math.min(innerWidth, innerHeight) / 540, 0.68, 1), r = phone() ? 17 : 20;
  return { x: innerWidth - SAFE.r - 12 * hs - r - 4, y: (10 + hudCard(innerWidth / hs).ch) * hs + SAFE.t + 8 + r, r };
}

// px the fight's camera keeps clear at the bottom (draw-fight.js o.inset): in portrait the buttons and the stick sit under
// the arena, so it's framed above them; in landscape they sit beside it (none)
export function touchInset() {
  if (!T.on || innerHeight <= innerWidth * 1.1) return 0;
  const Z = layout().zones[0], hs = clamp(Math.min(innerWidth, innerHeight) / 540, 0.68, 1), top = Math.min(...ACTS.map(a => Z.btns[a][1])) - Z.R;
  return Math.max(0, Math.round(innerHeight - top - 50 * hs - 12 + 6));
}

// ---------------------------------------------------------------- the pointers
// o = { active() (a fight is on screen and no card is up), pause() }
export function initFightTouch(o) {
  if (typeof document === 'undefined' || T.hook) return;
  T.hook = o;
  const cv = document.getElementById('game'); if (!cv) return;
  const zoneOf = x => T.n > 1 && x >= innerWidth / 2 ? 1 : 0;
  const nearest = (Z, x, y, reach) => { let best = null, bd = 1e9; for (const a of ACTS) { const [bx, by] = Z.btns[a], d = Math.hypot(x - bx, y - by); if (d < bd) { bd = d; best = a; } } return bd <= Z.R * reach ? best : null; };
  const press = (p, a) => { T.btn[p][a] = (T.btn[p][a] || 0) + 1; T.flash[p][a] = performance.now(); };
  const unpress = (p, a) => { T.btn[p][a] = Math.max(0, (T.btn[p][a] || 0) - 1); };
  cv.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || !o.active()) return;
    e.preventDefault(); sfx.ensure();
    if (!T.on) setTouch(true);
    const P = pauseRect(); if (Math.hypot(e.clientX - P.x, e.clientY - P.y) < P.r + 14) { release(); o.pause(); return; }
    const L = layout(), p = zoneOf(e.clientX), Z = L.zones[p]; if (!Z) return;
    const a = nearest(Z, e.clientX, e.clientY, 1.4);
    if (a) { T.ptr.set(e.pointerId, { p, a }); press(p, a); return; }
    if (e.clientX < (Z.x0 + Z.x1) / 2 + (T.n > 1 ? 0 : innerWidth * 0.08)) {   // the stick: where the thumb lands (kept on screen)
      const S = T.stick[p]; if (S.id != null) return;
      S.id = e.pointerId; S.bx = clamp(e.clientX, Z.l + Z.SR * 0.7, Z.x1 - Z.SR); S.by = clamp(e.clientY, SAFE.t + Z.SR + 60, Z.b - Z.SR * 0.7); S.x = e.clientX; S.y = e.clientY;
      T.ptr.set(e.pointerId, { p, stick: true });
    }
  }, { passive: false });
  addEventListener('pointermove', e => {
    const q = T.ptr.get(e.pointerId); if (!q) return;
    if (q.stick) {
      const S = T.stick[q.p], SR = layout().SR; S.x = e.clientX; S.y = e.clientY;
      const dx = S.x - S.bx, dy = S.y - S.by, l = Math.hypot(dx, dy);
      if (l > SR) { S.bx = S.x - dx / l * SR; S.by = S.y - dy / l * SR; }   // (dragged past the rim: it follows the thumb)
      return;
    }
    const Z = layout().zones[q.p], [bx, by] = Z.btns[q.a];   // a thumb sliding off a button onto the next presses that one
    if (Math.hypot(e.clientX - bx, e.clientY - by) > Z.R * 1.15) { const a = nearest(Z, e.clientX, e.clientY, 1.0); if (a && a !== q.a) { unpress(q.p, q.a); q.a = a; press(q.p, a); } }
  });
  const up = e => {
    const q = T.ptr.get(e.pointerId); if (!q) return; T.ptr.delete(e.pointerId);
    if (q.stick) T.stick[q.p].id = null; else unpress(q.p, q.a);
  };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
}

// the stick's analog direction for player p: [sx, sy] (0, 0 at rest)
function stickVec(p) {
  const S = T.stick[p]; if (!S || S.id == null) return [0, 0];
  const SR = layout().SR, dx = S.x - S.bx, dy = S.y - S.by, l = Math.hypot(dx, dy), m = l / SR;
  if (m <= DEAD || !l) return [0, 0];
  const k = clamp((m - DEAD) / (FULL - DEAD), 0, 1) / l;
  return [dx * k, dy * k];
}
// player p's held state (fight-keys.js's shape), null when touch is off or they aren't touching anything
export function touchHeld(p) {
  if (!T.on || p >= T.n) return null;
  const [sx, sy] = stickVec(p), B = T.btn[p], h = { sx, sy, up: sy < -0.4, down: sy > 0.4, left: sx < -0.4, right: sx > 0.4 };
  for (const a of ACTS) h[a] = (B[a] || 0) > 0;
  return h;
}
export const touchAny = h => !!h && (h.sx || h.sy || ACTS.some(a => h[a]));

// ---------------------------------------------------------------- drawing
// a move's icon for a button (fight-keys.js actions; the HUD's icons)
export function iconOf(id, a) {
  const M = FIGHTERS[id] && FIGHTERS[id].moves;
  const mv = M && M[KIT_ACT[a]]; return (mv && mv.icon) || (a === 'guard' ? 'guard' : 'light');
}
// one round button: f the fighter (for its cooldown and charges; null on the menus' diagram), on held, a its alpha.
// Cooling: greyed, swept dark, the rim filling back up in the player's colour and
// the seconds left big on it; back: it swells, flashes and glints. The special (draw-fight.js specialOf) has a gold star.
export function drawButton(g, x, y, R, id, a, col, f, on, al = 1) {
  const BD = bold(), mk = KIT_ACT[a] || null, left = f && mk ? cdLeft(f, mk) : 0, C = f && mk ? chargesOf(f, mk) : (mk && FIGHTERS[id].moves[mk] && FIGHTERS[id].moves[mk].charges ? { n: FIGHTERS[id].moves[mk].charges, max: FIGHTERS[id].moves[mk].charges, q: 0 } : null);
  const p = f && mk ? readyPop(f, mk, left, C) : 0, cool = left > 0 && !on;
  g.save(); g.globalAlpha *= al; g.translate(x, y); if (on) g.scale(0.94, 0.94); else { const b = popBump(p); g.scale(b, b); }
  g.beginPath(); g.arc(0, 0, R, 0, TAU);
  g.fillStyle = on ? rgba(col, 0.78) : cool ? 'rgba(10,8,26,0.5)' : rgba(col, 0.42); g.fill();
  g.lineWidth = Math.max(2, R * 0.07); g.strokeStyle = on ? 'rgba(255,255,255,0.85)' : cool ? 'rgba(255,255,255,0.14)' : rgba(col, 0.9); g.stroke();
  g.save(); if (cool) g.globalAlpha *= 0.35; fightIcon(g, iconOf(id, a), R * 0.56, cool ? (BD ? BK.muted : '#9aa3bd') : '#ffffff'); g.restore();
  if (left > 0.005) { g.fillStyle = 'rgba(10,8,26,0.45)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, -Math.PI / 2 + TAU * (1 - left), -Math.PI / 2 + TAU); g.closePath(); g.fill(); }
  if (f && left > 0) { cdRim(g, 0, 0, R, left, col, Math.max(2.5, R * 0.09)); cdNum(g, 0, -R * 0.04, cdSecs(f, mk), R * 0.56); }
  if (C) for (let k = 0; k < C.max; k++) {   // Duke's evade: its charges as pips along the bottom
    const px = (k - (C.max - 1) / 2) * R * 0.3, py = R * 0.7, q = k < C.n ? 1 : k === C.n ? C.q : 0;
    g.beginPath(); g.arc(px, py, R * 0.1, 0, TAU); g.fillStyle = 'rgba(10,8,26,0.7)'; g.fill();
    if (q > 0) { g.beginPath(); g.arc(px, py, R * 0.08 * (k < C.n ? 1 : 0.4 + 0.6 * q), 0, TAU); g.fillStyle = k < C.n ? '#ffffff' : 'rgba(255,255,255,0.5)'; g.fill(); }
  }
  if (venomLocked(f, mk)) venomDrop(g, R * 0.5, -R * 0.5, R * 0.5);   // (poisoned: the evade locked, fight.js poison)
  readyGlint(g, 0, 0, R, p);
  if (mk && specialOf(id) === mk) specialStar(g, R * 0.74, -R * 0.74, R * 0.18);
  g.restore();
}
function drawStick(g, Z, S, col, al) {
  const BD = bold(), live = S.id != null, bx = live ? S.bx : Z.rest[0], by = live ? S.by : Z.rest[1], SR = Z.SR;
  g.save(); g.globalAlpha *= live ? al : al * 0.55;
  g.beginPath(); g.arc(bx, by, SR, 0, TAU); g.fillStyle = BD ? `rgba(${BK.panelRGB},0.3)` : 'rgba(16,20,34,0.28)'; g.fill();
  g.lineWidth = 2; g.strokeStyle = live ? rgba(col, 0.6) : 'rgba(255,255,255,0.22)'; g.stroke();
  for (let k = 0; k < 4; k++) {   // four little chevrons round the rim
    const a = k * Math.PI / 2, cx = bx + Math.cos(a) * SR * 0.78, cy = by + Math.sin(a) * SR * 0.78, s = SR * 0.09;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s); g.lineTo(cx + Math.cos(a + 2.3) * s, cy + Math.sin(a + 2.3) * s); g.lineTo(cx + Math.cos(a - 2.3) * s, cy + Math.sin(a - 2.3) * s); g.closePath();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill();
  }
  let kx = bx, ky = by;
  if (live) { const dx = S.x - bx, dy = S.y - by, l = Math.hypot(dx, dy), c = Math.min(l, SR); if (l) { kx = bx + dx / l * c; ky = by + dy / l * c; } }
  g.beginPath(); g.arc(kx, ky, SR * 0.44, 0, TAU); g.fillStyle = live ? rgba(col, 0.8) : 'rgba(255,255,255,0.28)'; g.fill();
  g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.7)'; g.stroke();
  g.restore();
}
export function drawPause(g, al = 1) {
  const P = pauseRect(), BD = bold();
  g.save(); g.globalAlpha *= al;
  g.beginPath(); g.arc(P.x, P.y, P.r, 0, TAU); g.fillStyle = BD ? `rgba(${BK.panelRGB},0.6)` : 'rgba(16,20,34,0.55)'; g.fill();
  g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,0.25)'; g.stroke();
  g.translate(P.x, P.y); fightIcon(g, 'pause', P.r * 0.8, '#ffffff');
  g.restore();
}
// the controls over the fight: F the fight, humans [fighter index per touch player], dpr the canvas's
export function drawTouch(g, F, humans, dpr, o = {}) {
  if (!T.on || !F) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const L = layout(), al = F.phase === 'intro' ? 0.7 : 1;
  humans.slice(0, T.n).forEach((fi, p) => {
    const Z = L.zones[p], f = F.f[fi], col = PCOL[fi]; if (!Z || !f) return;
    drawStick(g, Z, T.stick[p], col, al);
    for (const a of ACTS) drawButton(g, Z.btns[a][0], Z.btns[a][1], Z.R, f.id, a, col, f, (T.btn[p][a] || 0) > 0, al * 0.95);
  });
  if (o.pause !== false) drawPause(g, al);
}
// the menus' picture of the touch controls (the setup screen's Touch tab): a stick on the left, the four buttons on the right
export function drawTouchDiagram(g, id, col, w, h) {
  const R = Math.min(h * 0.15, w * 0.075), SR = R * 1.45, ex = w - R * 1.3, ey = h - R * 1.3, D = R * 2.8;
  const BD = bold();
  g.beginPath(); g.roundRect(1, 1, w - 2, h - 2, 14); g.fillStyle = BD ? BK.well : 'rgba(0,0,0,0.3)'; g.fill();
  drawStick(g, { SR, rest: [SR + 16, h - SR - 14] }, { id: null }, col, 1.6);
  const at = a => [ex + Math.cos(a) * D, ey + Math.sin(a) * D];
  const B = { guard: [ex, ey], light: at(Math.PI * 1.03), heavy: at(Math.PI * 1.27), special: at(Math.PI * 1.51) };
  for (const a of ACTS) drawButton(g, B[a][0], B[a][1], R, id, a, col, null, false, 1);
}
