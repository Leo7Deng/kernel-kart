// Kernel Kart: gamepads (the Gamepad API, standard mapping). The first four pads are P1 to P4, in the order they were
// plugged in (online, the first pad is you). In a race: A gas (held), B or the left shoulder / trigger drift (held),
// X or the right shoulder / trigger item, Start pause. Everywhere else, and on the pause card, any pad moves around the
// page like the keyboard: the d-pad or the left stick are the arrow keys, A presses the button in focus (else Enter),
// B is Esc, Start is Enter. A pad drives exactly what a key would (input.js Input, or a key event on the page), so the
// race can't tell them apart. Polled once a frame while a pad is connected; nothing runs without one.
import { Input } from './input.js';

const A = 0, B = 1, X = 2, LB = 4, RB = 5, LT = 6, RT = 7, START = 9, UP = 12, DOWN = 13, LEFT = 14, RIGHT = 15;
const down = (p, i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
let game = null, raf = 0;
const was = new Map();   // pad index -> what was held last frame: { gas, drift, item, start, a, b, dir }

// a key on the page, as the keyboard would send it (the menu's and the results' own handlers, the pause card's)
function key(k) {
  const t = document.activeElement && document.activeElement !== document.body ? document.activeElement : document;
  for (const type of ['keydown', 'keyup']) t.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }));
}
function press() {   // A: the focused control, else Enter
  const el = document.activeElement;
  if (el && el !== document.body && el.matches('button, [role=button], [role=tab], a, input[type=checkbox]')) el.click(); else key('Enter');
}

function poll() {
  raf = 0;
  const pads = [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter(p => p && p.connected);
  if (!pads.length) { was.clear(); return; }
  const r = game.race, racing = game.state === 'race' && r && !r.paused, fighting = game.state === 'fight' && game.fightLive;   // (a fight reads the pads itself: fight-ui.js; Start pauses it)
  pads.forEach((p, n) => {
    const w = was.get(p.index) || {}, ax = p.axes || [];
    const now = { gas: down(p, A), drift: down(p, B) || down(p, LB) || down(p, LT), item: down(p, X) || down(p, RB) || down(p, RT), start: down(p, START), a: down(p, A), b: down(p, B),
      dir: down(p, UP) || ax[1] < -0.6 ? 'ArrowUp' : down(p, DOWN) || ax[1] > 0.6 ? 'ArrowDown' : down(p, LEFT) || ax[0] < -0.6 ? 'ArrowLeft' : down(p, RIGHT) || ax[0] > 0.6 ? 'ArrowRight' : '' };
    if (fighting) {
      if (now.start && !w.start && game.fightPause) game.fightPause();
      now.a = true; now.b = true; now.dir = now.dir || 'held';
    } else if (racing) {
      if (n < Input.humans) {   // this pad's player
        if (now.gas !== !!w.gas) now.gas ? Input.press(n) : Input.release(n);
        if (now.drift !== !!w.drift) Input.drift[n] = now.drift && Input.driftOn;
        if (now.item && !w.item) Input.fire[n] = true;
      }
      if (now.start && !w.start) Input.togglePause(r);   // (online it doesn't pause: input.js)
      now.a = true; now.b = true; now.dir = now.dir || 'held';   // (what's held as the race ends doesn't press the next screen)
    } else {
      if (w.gas && n < 4) Input.release(n);   // (a race that ended or paused under a held A)
      if (now.dir && now.dir !== w.dir && now.dir !== 'held') key(now.dir);
      if (now.a && !w.a) press();
      if (now.b && !w.b) key('Escape');
      if (now.start && !w.start) { if (game.state === 'race' && r && r.paused) Input.togglePause(r); else key('Enter'); }
      now.gas = false; now.drift = false;
    }
    was.set(p.index, now);
  });
  raf = requestAnimationFrame(poll);
}
const start = () => { if (!raf) raf = requestAnimationFrame(poll); };

export function initGamepads(g) {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
  game = g;
  addEventListener('gamepadconnected', start);
  addEventListener('gamepaddisconnected', e => { was.delete(e.gamepad.index); start(); });
  start();   // (a pad already connected before the page loaded shows up on the first poll once a button is pressed)
}
