// Kernel Kart: Fight mode's keys (by e.code, so they sit in the same place on any keyboard layout) and gamepad buttons.
// One human plays 'solo'; two on one keyboard play 'p1' and 'p2', with Y U H J N M left free between their hands. Each
// layout also says where its keys sit on the keyboard (col, row in key widths: the same staggered rows as a real
// keyboard), so the setup screen and the in-fight key display can draw them as they are on the keyboard. Four buttons
// (since 2026-10-23 there's no grab): for the old roster Guard held blocks and Guard with a direction steps; for Tux and
// Duke (no shield, no steps) Guard is their evade.
// Tux and Duke (three moves and an evade each since 2026-10-23, no jab, no shield) fire their move1, move2 and move3 on
// the light, heavy and special keys and their evade on the guard key (MOVE_OF; the key names stay for the sim's input):
// label those keys by the move (moveName).
import { FIGHTERS } from './fight-chars.js';
export const ACTIONS = ['light', 'heavy', 'special', 'guard'];
export const ACTION_NAME = { light: 'Light', heavy: 'Heavy', special: 'Special', guard: 'Guard' };
export const MOVE_OF = { light: 'move1', heavy: 'move2', special: 'move3', guard: 'evade' };
// what a key does for fighter id: its move's name (a three-move fighter), else Light / Heavy / Special / Guard
export function moveName(id, action) {
  const st = FIGHTERS[id], mv = st && st.kit3 && MOVE_OF[action] && st.moves[MOVE_OF[action]];
  return mv ? mv.name : ACTION_NAME[action] || action;
}
export const DIRS = ['up', 'left', 'down', 'right'];

// codes per action (the first one is the one shown) and the keys to draw: [code, col, row, width?]
export const LAYOUTS = {
  solo: {
    keys: { up: ['KeyW', 'ArrowUp'], left: ['KeyA', 'ArrowLeft'], down: ['KeyS', 'ArrowDown'], right: ['KeyD', 'ArrowRight'],
      light: ['KeyJ'], heavy: ['KeyK'], special: ['KeyL'], guard: ['Space', 'Semicolon'] },
    draw: [['KeyW', 1, 0], ['KeyA', 0.25, 1], ['KeyS', 1.25, 1], ['KeyD', 2.25, 1], ['KeyJ', 5.85, 1], ['KeyK', 6.85, 1], ['KeyL', 7.85, 1], ['Space', 2.6, 2.1, 3.4]],
    note: 'or the arrow keys to move, ; to guard',
  },
  p1: {
    keys: { up: ['KeyW'], left: ['KeyA'], down: ['KeyS'], right: ['KeyD'], light: ['KeyF'], heavy: ['KeyG'], special: ['KeyT'], guard: ['KeyV'] },
    draw: [['KeyW', 1, 0], ['KeyA', 0.25, 1], ['KeyS', 1.25, 1], ['KeyD', 2.25, 1], ['KeyT', 4, 0], ['KeyF', 3.25, 1], ['KeyG', 4.25, 1], ['KeyV', 3.75, 2]],
  },
  p2: {
    keys: { up: ['ArrowUp'], left: ['ArrowLeft'], down: ['ArrowDown'], right: ['ArrowRight'],
      light: ['KeyL', 'Numpad4'], heavy: ['KeyK', 'Numpad5'], special: ['KeyI', 'Numpad6'], guard: ['Period', 'Numpad0'] },
    draw: [['KeyI', 0, 0], ['KeyK', 0.25, 1], ['KeyL', 1.25, 1], ['Period', 1.75, 2], ['ArrowUp', 4, 1], ['ArrowLeft', 3, 2], ['ArrowDown', 4, 2], ['ArrowRight', 5, 2]],
    note: 'or the numpad: 4 light, 5 heavy, 6 special, 0 guard',
  },
};
// what each drawn key does (for its icon and for lighting up)
export function actionOf(L, code) { for (const [a, cs] of Object.entries(LAYOUTS[L].keys)) if (cs.includes(code)) return a; return null; }
export const layoutFor = (slot, humans) => humans > 1 ? (slot ? 'p2' : 'p1') : 'solo';
export const CODES = new Set(Object.values(LAYOUTS).flatMap(L => Object.values(L.keys).flat()));

// a code as printed on its key
const NAMES = { Space: 'Space', Semicolon: ';', Period: '.', Comma: ',', Slash: '/', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftRight: 'Shift' };
export const keyLabel = c => NAMES[c] || (c.startsWith('Key') ? c.slice(3) : c.startsWith('Numpad') ? 'Num ' + c.slice(6) : c.startsWith('Digit') ? c.slice(5) : c);

// held state from the keys down (a Set of codes)
export function keysHeld(L, down) {
  const k = LAYOUTS[L].keys, h = a => k[a].some(c => down.has(c));
  const o = {}; for (const a of [...DIRS, ...ACTIONS]) o[a] = h(a);
  return o;
}

// gamepads (standard mapping): A light, X heavy, B special, LB / RB (or the triggers) guard
export const PAD = { light: 'A', heavy: 'X', special: 'B', guard: 'LB' };
const pd = (p, i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
// The stick (2026-10-24, aiming that feels right on a pad): a round dead zone, then its tilt ramped from 0 to 1 by STICK[1]
// (sx, sy: the true angle, no pull toward the axes or the diagonals); the up/down/left/right flags (the key display) as before
const STICK = [0.22, 0.92];
export function padHeld(p) {
  const ax = p.axes || [], dz = v => Math.abs(v) > 0.3, x = +ax[0] || 0, y = +ax[1] || 0, m = Math.hypot(x, y);
  const k = m > STICK[0] ? Math.min(1, (m - STICK[0]) / (STICK[1] - STICK[0])) / m : 0;
  return { up: pd(p, 12) || (dz(ax[1]) && ax[1] < 0), down: pd(p, 13) || (dz(ax[1]) && ax[1] > 0), left: pd(p, 14) || (dz(ax[0]) && ax[0] < 0), right: pd(p, 15) || (dz(ax[0]) && ax[0] > 0),
    sx: x * k, sy: y * k, dpad: pd(p, 12) || pd(p, 13) || pd(p, 14) || pd(p, 15),
    light: pd(p, 0), heavy: pd(p, 2), special: pd(p, 1), guard: pd(p, 4) || pd(p, 5) || pd(p, 6) || pd(p, 7) };
}
export const pads = () => typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()].filter(p => p && p.connected) : [];
// held state -> the sim's input ({ x, y, light, heavy, special, guard })
// (a tilted stick, no d-pad: the stick's own vector, analog; before, its flags added a whole 1 on top, so every tilt was
// full speed and pulled toward the diagonals. Keys: 8 ways, diagonals normalised to the same speed as the straights)
export function toInput(h) {
  const stick = (h.sx || h.sy) && !h.dpad;
  let x = stick ? h.sx : (h.right ? 1 : 0) - (h.left ? 1 : 0), y = stick ? h.sy : (h.down ? 1 : 0) - (h.up ? 1 : 0);
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  return { x, y, light: !!h.light, heavy: !!h.heavy, special: !!h.special, guard: !!h.guard };
}
