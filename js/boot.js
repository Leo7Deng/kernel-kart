// The boot screen (#kk-boot in index.html, its own inline Classic Flat styles). The title is built behind it while this
// does the menu's first heavy work a step a frame (so the bar moves), then fades in: without it the first seconds were
// laggy (track previews took up to ~0.6 s each). Steps: fonts; pictures kept from the last visit (thumb-store.js); the
// backdrop's track (menu-bg.js); WebGL and your racers' 3D sheets (the bakery, art/warm.js); then previews not kept,
// the picked track first. Capped: previews stop at SOFT ms, everything at HARD; the rest carries on after the title
// (ui.js warmMinis). Previews and backdrop draw on the painter's worker (art/painter.js) where possible. Any key, click
// or tap skips to the menu. Not shown for #demo.
import { sfx } from './audio.js';
import { CHARACTERS } from './core.js';
import { queue3D } from './art/model3d.js';
import { bakesLeft } from './art/warm.js';
import { coverReady, warmCover } from './art/covers.js';
import { bgName, holdBg, warmBg } from './menu-bg.js';
import { settings } from './settings.js';
import { keepBg, restoreThumbs } from './thumb-store.js';
import { painterOn } from './art/painter.js';
import { TRACKS } from './tracks.js';
import { minis, setup } from './ui.js';

const SOFT = 2500, HARD = 5000;   // ms since the page started
const FADE = 350;
const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));   // (after the next frame's painted)
const within = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, Math.max(0, Math.min(ms, HARD - performance.now()))))]);   // (never past HARD)
export const bootLog = [];   // [what, ms since the page started], for measuring
const note = what => bootLog.push([what, Math.round(performance.now())]);
const still = () => settings.reduced || matchMedia('(prefers-reduced-motion: reduce)').matches;

// the boot screen gone at once (#demo)
export function skipBoot() { const el = document.getElementById('kk-boot'); if (el) el.remove(); }

// run the boot; done() once the title is showing (or at once with no boot screen)
export function boot(done = () => { }) {
  const el = document.getElementById('kk-boot');
  if (!el) { done(); return; }
  const road = el.querySelector('.kb-road'), sayEl = el.querySelector('#kb-say');
  let over = false;
  // (the bar starts where index.html's own creep, before any script ran, leaves it)
  const bar = p => { if (over) return; p = Math.max(0, Math.min(1, p)); el.style.setProperty('--p', (0.12 + 0.88 * p).toFixed(3)); road.setAttribute('aria-valuenow', Math.round(p * 100)); };
  const say = t => { if (!over) sayEl.textContent = t; };
  const finish = () => {
    if (over) return;
    bar(1); over = true; minis.hold = false; holdBg(false); note('done');
    removeEventListener('keydown', key, true); el.removeEventListener('pointerdown', tap);
    el.classList.add('out');
    setTimeout(() => el.remove(), still() ? 0 : FADE + 50);
    done();
  };
  // a key or a tap skips to the menu: that press is the boot screen's, so it doesn't also start a race (Enter) or pick
  // something under the finger (browser shortcuts and the F keys go on as usual)
  const key = e => { if (e.metaKey || e.ctrlKey || e.altKey || /^F\d+$/.test(e.key)) return; e.preventDefault(); e.stopImmediatePropagation(); finish(); };
  const tap = e => { e.preventDefault(); finish(); };
  addEventListener('keydown', key, true); el.addEventListener('pointerdown', tap);

  minis.hold = true; holdBg(true);   // (the previews' idle drawing and the backdrop's own build wait for this)
  const ids = (setup.mode === 'tt' ? setup.picks.slice(0, 1) : setup.picks.slice(0, Math.max(1, setup.humans))).map(i => (CHARACTERS[i] || CHARACTERS[0]).id);
  const first = setup.mode === 'tt' ? setup.ttTrack : setup.track;
  const order = [first, ...(setup.mode === 'cup' ? setup.cupTracks || [] : []), ...TRACKS.keys()].filter((v, i, a) => Number.isInteger(v) && TRACKS[v] && a.indexOf(v) === i);
  (async () => {
    // started together: the fonts, the store (read and decoded off the main thread), WebGL and the racers' 3D sheets (the
    // bakery: its maths on workers, a slice after each frame)
    const fonts = document.fonts ? within(Promise.all(['1em Bungee', '400 1em Fredoka', '600 1em Fredoka', '700 1em Fredoka'].map(f => document.fonts.load(f).catch(() => null))), 1500) : null;
    const stored = within(restoreThumbs(bgName()).catch(() => null), 1500);
    try { queue3D(ids); } catch (e) { }
    const bake0 = Math.max(1, bakesLeft(0));
    // the bar: 1 the fonts, 1 the store, 2 the backdrop, 3 the 3D racers, 1 each preview still to draw
    let got = 0, total = 7 + order.length;
    const tick = (n = 1) => { got += n; bar(got / total); };
    note('start'); el.classList.add('go'); bar(0);
    say('Waking up the karts'); try { sfx.warm(); } catch (e) { }   // (the audio device opened now, not on the first click)
    await fonts; tick(); note('fonts');
    const kept = await stored; tick(); note('store');
    const todo = order.filter(i => !minis.has(TRACKS[i].name) || settings.mapArt && !coverReady(TRACKS[i].name));
    total -= order.length - todo.length; bar(got / total);
    if (!(kept && kept.bg)) { say('Building the track'); await frame(); if (over) return; }
    try { const drawn = performance.now() < HARD ? await within(warmBg(kept && kept.bg), HARD) : null; if (drawn) keepBg(bgName(), drawn.pic, drawn.box); } catch (e) { }
    if (over) return;
    holdBg(false); tick(2); note('backdrop');
    if (painterOn()) {
      // on the painter's worker: all asked for now (the picked track's first), waited for in order till SOFT; the rest carry
      // on there after the title, never holding up a frame
      const asks = todo.map((i, k) => minis.want(TRACKS[i], k ? 1 : 0));
      for (const [k, i] of todo.entries()) {
        if (over || performance.now() > (k ? SOFT : HARD)) break;
        say(`Drawing the maps ${k + 1}/${todo.length}`);
        await within(asks[k], k ? SOFT - performance.now() : HARD); if (over) return;
        tick(); note(TRACKS[i].name);
      }
    } else {
      let slow = 0;   // the slowest preview so far (ms): one that would end well past SOFT isn't started
      for (const [k, i] of todo.entries()) {
        if (over || performance.now() + (k ? slow / 2 : 0) > (k ? SOFT : HARD)) break;   // (the picked track's always; the rest till about SOFT)
        say(`Drawing the maps ${k + 1}/${todo.length}`); await frame(); if (over) return;
        const t = TRACKS[i], t0 = performance.now();
        try { minis.draw(t); if (settings.mapArt) warmCover(t.name); } catch (e) { }
        slow = Math.max(slow, performance.now() - t0); tick(); note(t.name);
      }
    }
    if (over) return;
    if (bakesLeft(0)) say('Polishing the racers');
    while (!over && bakesLeft(0) && performance.now() < HARD) { bar((got + 3 * (1 - bakesLeft(0) / bake0)) / total); await frame(); }
    tick(3); note('3d'); say('Ready');
    await frame();
    finish();
  })().catch(finish);
}
