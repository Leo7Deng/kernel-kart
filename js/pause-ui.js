// The pause card (offline races and time trials; online never pauses). P (Tab with 2+ players), the touch button or the
// page hiding pauses (input.js). Resume, Restart (ui.js restartRace), Quit (a time trial: End trial), sound, shake,
// reduced effects, drift for the next race, Full screen. Keys: P/Tab resume, R restart, Esc quit, arrows and
// Enter/Space; none reach the karts.
import { Input } from './input.js';
import { sfx } from './audio.js';
import { settings, saveSettings } from './settings.js';
import { fsButton } from './qol.js';
import { game, restartRace } from './ui.js';

let back = null, watch = 0, keys = null;

function close() {
  cancelAnimationFrame(watch);
  if (keys) { removeEventListener('keydown', keys, true); keys = null; }
  if (back) { back.remove(); back = null; }
}
function resume() { const r = game.race; if (r && r.paused) Input.togglePause(r); close(); }
function quit() { const r = game.race; close(); if (r && r.paused) Input.togglePause(r); game.toMenu(); }
function restart() { const r = game.race; close(); if (r && r.paused) Input.togglePause(r); restartRace(); }

function open(race) {
  close();
  const tt = !!race.tt, kb = !Input.touchActive;
  const check = (id, label, on, hint) => `<label class="set-row"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" class="switch" id="${id}"${on ? ' checked' : ''}></label>`;
  const k = t => kb ? ` <kbd>${t}</kbd>` : '';
  back = document.createElement('div'); back.className = 'cl-back pause-back';
  back.innerHTML = `<div class="panel cl-box pause-box" role="dialog" aria-modal="true" aria-labelledby="pz-h">
    <h2 class="pause-h" id="pz-h">Paused</h2>
    <div class="pause-btns">
      <button type="button" class="go pz-main" id="pz-resume">Resume${k(Input.humans > 1 ? 'Tab' : 'P')}</button>
      <button type="button" id="pz-restart">${tt ? 'Start again' : 'Restart race'}${k('R')}</button>
      <button type="button" id="pz-quit">${tt ? 'End trial' : 'Quit to menu'}${k('Esc')}</button>
    </div>
    <div class="pause-set">
      ${check('pz-sound', 'Sound', !sfx.muted)}${check('pz-shake', 'Screen shake', settings.shake)}
      ${check('pz-reduced', 'Reduced effects', settings.reduced, 'fewer particles')}
      ${check('pz-drift', 'Drift', settings.drift, race.drift === settings.drift ? 'the third key: slide for a mini-turbo' : 'from the next race (Restart to use it now)')}
    </div>
    ${fsButton('pz-fs')}
  </div>`;
  document.body.append(back);
  const q = id => back.querySelector('#' + id);
  q('pz-resume').onclick = resume; q('pz-restart').onclick = restart; q('pz-quit').onclick = quit;
  q('pz-sound').onchange = e => sfx.setMuted(!e.target.checked);
  q('pz-shake').onchange = e => { settings.shake = e.target.checked; saveSettings(); };
  q('pz-reduced').onchange = e => { settings.reduced = e.target.checked; saveSettings(); document.documentElement.classList.toggle('kk-still', settings.reduced); };
  q('pz-drift').onchange = e => { settings.drift = e.target.checked; saveSettings(); const sm = e.target.closest('.set-row').querySelector('small'); if (sm) sm.textContent = race.drift === settings.drift ? 'the third key: slide for a mini-turbo' : 'from the next race (Restart to use it now)'; };
  const t0 = performance.now();   // (the tap on the touch pause button sends its mousedown after the card is up: not a click beside it)
  back.addEventListener('mousedown', e => { if (e.target === back && performance.now() - t0 > 600) resume(); });   // a click beside the card: back to the race
  // the card's own keys, before input.js's (a capture listener): nothing typed here drives a kart
  keys = e => {
    if (!back) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const btns = [...back.querySelectorAll('button, input')], at = btns.indexOf(document.activeElement);
    if (key === 'r') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) restart(); }
    else if (key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) quit(); }
    else if (key === 'ArrowDown' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowLeft') {
      e.preventDefault(); e.stopImmediatePropagation();
      const d = key === 'ArrowDown' || key === 'ArrowRight' ? 1 : -1; btns[(at + d + btns.length) % btns.length].focus();
    } else if ((key === 'Enter' || key === ' ') && at >= 0) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) btns[at].click(); }
    else if (key === 'p' || key === 'Tab') return;   // input.js: resume (the card goes as the race unpauses)
    else if (key !== 'f' && key !== 'Backspace') { e.stopImmediatePropagation(); }   // (F: full screen; Backspace: mute, qol.js and input.js)
  };
  addEventListener('keydown', keys, true);
  if (kb) q('pz-resume').focus({ preventScroll: true });
  // the card goes when the race stops being paused or on screen, whatever did it (P, a restart, the menu)
  const check2 = () => { if (!back) return; const r = game.race; if (game.state !== 'race' || r !== race || !r.paused) { close(); return; } watch = requestAnimationFrame(check2); };
  watch = requestAnimationFrame(check2);
}

export function initPause() {
  Input.onPause = race => { if (race.paused) open(race); else close(); };
}
