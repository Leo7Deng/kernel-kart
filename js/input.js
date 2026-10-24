// Kernel Kart: keyboard and touch input.

import { sfx } from './audio.js';
import { DKEYS, IKEYS, KEYS } from './core.js';
import { SAFE } from './qol.js';

// ---------------------------------------------------------------- input
export const Input = {
  pressed: [false, false, false, false],
  lastRelease: [-9, -9, -9, -9],
  fire: [false, false, false, false],
  drift: [false, false, false, false],   // the drift key held (race-drift.js)
  driftOn: true,                         // drift is on in the race being shown (render.js sets it): off, the drift key and button do nothing
  humans: 1,
  held: new Set(),                       // the keys down on the keyboard right now (e.key, lower case), whatever screen: reset keeps a held gas key held
  touchActive: false,
  touches: new Map(), dTouches: new Map(),
  // game: for the race state and quitting to the menu; toast: shows "Muted" etc. (passed in so the race can import Input without the UI)
  togglePause(race) {
    if (race.net) return;   // an online race doesn't pause (the others are still driving)
    race.paused = !race.paused;
    this.fire.fill(false); this.drift.fill(false); for (let i = 0; i < 4; i++) this.release(i);   // nothing pressed before the pause fires or holds after it
    if (this.onPause) this.onPause(race);   // the pause card (pause-ui.js) goes up or away
  },
  onPause: null,
  init({ game, toast }) {
    // a name or room code going in, not a player's keys. In a race only a text field counts (the chat line, chat-ui.js):
    // a switch or a button left in focus never takes the gas (out of a race Space still flips a focused switch)
    const typing = e => { const t = e.target; if (!t || !t.tagName) return false; if (game.state === 'race') return !!(t.matches && t.matches('input:not([type=checkbox]):not([type=range]):not([type=radio]), textarea, select, [contenteditable]:not([contenteditable=false])')); return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'; };
    addEventListener('keydown', e => {
      if (e.repeat || typing(e)) return;
      const k = e.key.toLowerCase();
      if (!e.metaKey && !e.ctrlKey && !e.altKey) this.held.add(k);   // (a Mac sends no key-up for a key let go under Cmd)
      if (game.state !== 'race' && (k === ' ' || k === 'enter') && e.target && e.target.closest && e.target.closest('button, summary, a')) return;   // a focused menu button: the key presses it
      if (game.state === 'race' && game.race && (k === 'p' || k === 'tab') && !(k === 'p' && (KEYS.includes('p') || IKEYS.includes('p') || DKEYS.includes('p')))) { e.preventDefault(); this.togglePause(game.race); return; }   // P is a player key with 2+ humans: Tab pauses then
      let i = KEYS.indexOf(k);
      if (k === ' ' && this.humans === 1) i = 0;
      if (i >= 0 && i < this.humans) { e.preventDefault(); this.press(i); return; }
      let f = IKEYS.indexOf(k);
      if (k === 'enter' && this.humans === 1) f = 0;
      if (f >= 0 && f < this.humans) { e.preventDefault(); this.fire[f] = true; sfx.ensure(); return; }
      let d = DKEYS.indexOf(k);
      if (k === 'shift' && this.humans === 1) d = 0;
      if (d >= 0 && d < this.humans && this.driftOn) { e.preventDefault(); this.drift[d] = true; sfx.ensure(); return; }
      if (k === 'backspace') { const m = sfx.toggle(); toast(m ? 'Muted' : 'Sound on'); }
      if (k === 'escape' && game.state === 'race') game.toMenu();
    });
    addEventListener('keyup', e => {
      const k = e.key.toLowerCase(); this.held.delete(k);
      if (typing(e)) return;
      let i = KEYS.indexOf(k);
      if (k === ' ' && this.humans === 1) i = 0;
      if (i >= 0) this.release(i);
      let d = DKEYS.indexOf(k);
      if (k === 'shift' && this.humans === 1) d = 0;
      if (d >= 0) this.drift[d] = false;
    });
    const cv = document.getElementById('game');
    const zone = (x, y) => {
      const h = this.humans, W = innerWidth, H = innerHeight;
      if (h === 1) return 0;
      if (h === 2) return x < W / 2 ? 0 : 1;
      return (y < H / 2 ? 0 : 2) + (x < W / 2 ? 0 : 1);
    };
    cv.addEventListener('pointerdown', e => {
      if (game.state !== 'race') return;
      this.touchActive = e.pointerType !== 'mouse'; sfx.ensure();
      // paused: the pause card is the page's, over the canvas (pause-ui.js); a touch screen's pause button
      const r = game.race;
      if (r && r.paused) return;
      if (r && !r.net && this.touchActive) { const b = this.pauseButtonRect(); if (Math.hypot(e.clientX - b.x, e.clientY - b.y) < b.r + 10) { this.togglePause(r); return; } }
      const z = zone(e.clientX, e.clientY); if (z >= this.humans) return;
      if (this.inItemButton(z, e.clientX, e.clientY)) { this.fire[z] = true; return; }
      if (this.driftOn && this.inDriftButton(z, e.clientX, e.clientY)) { this.dTouches.set(e.pointerId, z); this.drift[z] = true; return; }   // held like the gas
      this.touches.set(e.pointerId, z); this.press(z);
    });
    const up = e => { const dz = this.dTouches.get(e.pointerId); if (dz !== undefined) { this.dTouches.delete(e.pointerId); if (![...this.dTouches.values()].includes(dz)) this.drift[dz] = false; return; }
      const z = this.touches.get(e.pointerId); if (z === undefined) return; this.touches.delete(e.pointerId); if (![...this.touches.values()].includes(z)) this.release(z); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'race' && game.race && !game.race.paused) this.togglePause(game.race); });   // resuming is manual
    addEventListener('blur', () => { for (let i = 0; i < 4; i++) this.release(i); this.drift.fill(false); this.held.clear(); });
  },
  // on touch, a pause button in the screen's top right corner (render.js draws it)
  pauseButtonRect() { return { x: innerWidth - 34 - SAFE.r, y: 34 + SAFE.t, r: 20 }; },   // (inside the notch: qol.js SAFE)
  // on touch, each player's zone has an item button in its bottom corner
  itemButtonRect(z) {
    const h = this.humans, W = innerWidth - SAFE.r, H = innerHeight - SAFE.b, r = Math.min(W, H) < 500 ? 38 : 44;   // (a phone: a little smaller, still a thumb's width; clear of the notch and the home bar)
    const zx = h === 1 ? 0 : (h === 2 ? (z % 2) * W / 2 : (z % 2) * W / 2), zw = h === 1 ? W : W / 2;
    const zy = h <= 2 ? 0 : (z < 2 ? 0 : H / 2), zh = h <= 2 ? H : H / 2;
    return { x: zx + zw - r - 24, y: zy + zh - r - 24, r };
  },
  inItemButton(z, x, y) { const b = this.itemButtonRect(z); return Math.hypot(x - b.x, y - b.y) < b.r + 12; },
  // ...and a drift button beside it, toward the middle of the zone (hold it to drift)
  driftButtonRect(z) { const b = this.itemButtonRect(z); return { x: b.x - b.r * 2.7, y: b.y, r: b.r }; },
  inDriftButton(z, x, y) { const b = this.driftButtonRect(z); return Math.hypot(x - b.x, y - b.y) < b.r + 14; },
  press(i) {
    if (this.pressed[i]) return;
    sfx.ensure();
    const now = performance.now() / 1000;
    this.pressed[i] = true;
  },
  release(i) { if (!this.pressed[i]) return; this.pressed[i] = false; this.lastRelease[i] = performance.now() / 1000; },
  // a fresh start (a race, the menu, the room): nothing fired or held over, except a gas key still held down on the keyboard,
  // which counts as held (call it after setKeys). It used to be forgotten: a key held as an online race came in (or as a
  // race started) drove nothing until it was let go and pressed again, and the kart sat on the grid (2026-10-22). Held on
  // through the countdown, it's a burnout, as it is for anyone holding the gas too early (race-start.js).
  reset() {
    this.pressed.fill(false); this.fire.fill(false); this.drift.fill(false); this.touches.clear(); this.dTouches.clear();
    for (let i = 0; i < this.humans; i++) if (this.held.has(KEYS[i]) || (this.humans === 1 && this.held.has(' '))) this.pressed[i] = true;
  },
};

