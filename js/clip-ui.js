// A "Watch how" clip in a box over the menu (offline only): clip.js's race drawn by render.js renderTo into its own
// canvas, with the keys it presses as keycaps. Silent, and touches none of the menu's state; closing it lets go of all.
import { FONT, drawKeycap } from './art.js';
import { DKEYS, KEYS, PCOL } from './core.js';
import { CLIP_DT, clipAt, clipOf, clipStart, clipStep } from './clip.js';
import { Input } from './input.js';
import { BOLD_FONT, bold } from './look.js';
import { driftTier, tierCol } from './race-drift.js';
import { renderTo } from './render.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export function openClip(name) {
  const def = clipOf(name);
  if (!def || document.querySelector('.clip-back')) return;
  const back = el('div', 'clip-back'), box = el('div', 'panel clip-box');
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', `${name}: ${def.title}`);
  const head = el('div', 'clip-head'), close = el('button', 'clip-x', '✕');
  close.setAttribute('aria-label', 'Close');
  head.append(el('h2', null, `${name}: ${def.title}`), close);
  const cv = el('canvas', 'clip-cv'), foot = el('div', 'clip-foot'), cap = el('div', 'clip-cap'), slow = el('button', 'clip-btn', '½ speed'), again = el('button', 'clip-btn', 'Replay');
  slow.setAttribute('aria-pressed', 'false');
  foot.append(cap, slow, again);
  box.append(head, cv, foot); back.append(box); document.body.append(back);

  let k = clipStart(def), view = { canvas: cv, w: 0, h: 0, dpr: 1, cache: null }, acc = 0, last = performance.now(), raf = 0, speed = 1, hold = 0, gone = false;
  const restart = () => { k = clipStart(def); acc = 0; hold = 0; };
  function frame(now) {
    if (gone) return;
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
    if (k.done) { hold += dt; if (hold > 0.9) restart(); }   // a moment on the last frame, then round again
    else { acc += dt * speed; while (acc >= CLIP_DT && !k.done) { clipStep(k); acc -= CLIP_DT; } }
    draw(k.done ? 0 : dt * speed);
    raf = requestAnimationFrame(frame);
  }
  function draw(dt) {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h) return;
    if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; view.cache = null; }
    // drawn as on a 1280-wide screen and scaled down to fit, so the HUD (sized for a full window: render.js) isn't squashed
    const v = Math.max(1, 1280 / w);
    view.w = Math.round(w * v); view.h = Math.round(h * v); view.dpr = dpr / v;
    // the clip's keys, for the keycaps the HUD draws (render.js reads them), put back straight after
    const p0 = Input.pressed[0], d0 = Input.drift[0];
    Input.pressed[0] = k.gas; Input.drift[0] = k.drift;
    try { renderTo(view, k.race, dt); } finally { Input.pressed[0] = p0; Input.drift[0] = d0; }
    keys(cv.getContext('2d'), w, h, dpr);
    const t = caption(); if (cap.textContent !== t) cap.textContent = t;
  }
  // the two keys it's pressing, big, bottom right (the minimap is bottom left): the gas, and the drift (in the colour of the sparks it's charged to)
  function keys(g, w, h, dpr) {
    const c = k.car, s = Math.min(1.5, Math.max(1, w / 560)), x = w - 24 - 84 * s, y = h - 34 * s;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t = c.dOn ? driftTier(c) : 0;
    drawKeycap(g, x, y, KEYS[0].toUpperCase(), k.gas, PCOL[0], s);
    drawKeycap(g, x + 54 * s, y, DKEYS[0].toUpperCase(), k.drift, t ? tierCol(t) : PCOL[0], s);
    g.font = `700 ${10 * s}px ${bold() ? BOLD_FONT : FONT}`; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillStyle = '#ffffff'; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 3;
    for (const [lx, l] of [[x, 'GAS'], [x + 54 * s, 'DRIFT']]) { g.strokeText(l, lx, y + 18 * s); g.fillText(l, lx, y + 18 * s); }
  }
  // what's happening, in a few words
  function caption() {
    const c = k.car, S = k.def.say;
    if (k.backT) return S.back;
    if (k.takenT) return S.dive && c.secretT < S.diveT ? S.dive : S.taken;
    if (k.letT && !(S.blueFor && k.race.time < k.blueT + S.blueFor)) return S.let;   // (blueFor: the blue caption stays up a moment after a quick let-go, so it can be read)
    if (k.blueT) return S.blue;
    if (k.drift) return c.air > 0 || clipAt(k) < k.def.press + S.pressFor ? S.press : S.hold;
    return S.run;
  }
  slow.onclick = () => { speed = speed === 1 ? 0.5 : 1; slow.setAttribute('aria-pressed', String(speed < 1)); slow.classList.toggle('sel', speed < 1); };
  again.onclick = restart;
  const shut = () => { gone = true; cancelAnimationFrame(raf); removeEventListener('keydown', onKey, true); back.remove(); view.cache = null; k = null; };
  // a box over the menu: Escape closes it, R plays it again, and no other key reaches the menu (or a player key) under it
  const onKey = e => {
    if (e.key === 'Tab') return;
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); shut(); }
    else if (e.key.toLowerCase() === 'r' && !e.repeat) { e.preventDefault(); restart(); }
  };
  addEventListener('keydown', onKey, true);
  close.onclick = shut;
  back.addEventListener('mousedown', e => { if (e.target === back) shut(); });
  close.focus();
  raf = requestAnimationFrame(frame);
}
