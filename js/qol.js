// Small comforts for phones, tablets and big screens; nothing here touches a race. SAFE (safe-area insets in CSS px,
// for the canvas HUD and touch buttons, where env() can't reach), no long-press menu or zoom on the race, Wake Lock
// while racing, full screen (fsButton, F), raceKeys chips, recentTracks / noteRecent. Loads in Node: no DOM until initQol.
import { DKEYS, IKEYS, KEYS } from './core.js';

export const SAFE = { l: 0, t: 0, r: 0, b: 0 };

// the insets read off a hidden probe whose padding is env(safe-area-inset-*), again whenever the screen turns
function watchSafe() {
  const p = document.createElement('div');
  p.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.append(p);
  const read = () => { const cs = getComputedStyle(p); SAFE.t = parseFloat(cs.paddingTop) || 0; SAFE.r = parseFloat(cs.paddingRight) || 0; SAFE.b = parseFloat(cs.paddingBottom) || 0; SAFE.l = parseFloat(cs.paddingLeft) || 0; };
  read(); addEventListener('resize', read); addEventListener('orientationchange', () => setTimeout(read, 250));
}

// the race canvas: a long press shows no menu or callout, two fingers or a double tap don't zoom the page (iOS Safari
// ignores the viewport's user-scalable=no)
function touchPolish() {
  const cv = document.getElementById('game');
  if (cv) { cv.addEventListener('contextmenu', e => e.preventDefault()); cv.addEventListener('dblclick', e => e.preventDefault()); }
  for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, e => e.preventDefault());
}

// keep the screen on while racing (and on loading, results, podium, online room) via Wake Lock where there is one; the
// browser drops it when the page is hidden, so it's retaken on return
const AWAKE = new Set(['loading', 'race', 'results', 'podium', 'room']);
function keepAwake(game) {
  if (!navigator.wakeLock) return;
  let lock = null, asking = false;
  const want = () => AWAKE.has(game.state) && !document.hidden;
  const sync = async () => {
    if (want() && !lock && !asking) {
      asking = true;
      try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch { lock = null; }
      asking = false;
    } else if (!want() && lock) { const l = lock; lock = null; l.release().catch(() => { }); }
  };
  setInterval(sync, 1000); document.addEventListener('visibilitychange', sync);
}

// full screen: a button in the top bars and on the pause card, and F anywhere. Only where the page can go full screen
// (not iPhone Safari: Add to Home Screen does it there). One click handler for every .kk-fs button
const fsDoc = () => typeof document !== 'undefined' ? document : null;
export const canFullscreen = () => { const d = fsDoc(); return !!(d && (d.fullscreenEnabled || d.webkitFullscreenEnabled)); };
export const isFullscreen = () => { const d = fsDoc(); return !!(d && (d.fullscreenElement || d.webkitFullscreenElement)); };
export function toggleFullscreen() {
  const d = document, el = d.documentElement;
  try {
    const p = isFullscreen() ? (d.exitFullscreen || d.webkitExitFullscreen).call(d) : (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
    if (p && p.catch) p.catch(() => { });
  } catch { }
}
const FS_ICON = { on: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  off: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' };
const fsInner = () => `${isFullscreen() ? FS_ICON.off : FS_ICON.on}<span class="m-it">${isFullscreen() ? 'Exit full screen' : 'Full screen'}</span>`;
// the button's HTML ('' where there's no full screen); cls: the button's own classes (the menu's round m-icon by default)
export const fsButton = (cls = 'm-icon') => canFullscreen() ? `<button type="button" class="${cls} kk-fs" title="Full screen (F)" aria-label="Full screen (F)" aria-pressed="${isFullscreen()}">${fsInner()}</button>` : '';
function fullscreenKeys() {
  if (!canFullscreen()) return;
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.kk-fs'); if (b) toggleFullscreen(); });
  const sync = () => { for (const b of document.querySelectorAll('.kk-fs')) { b.setAttribute('aria-pressed', isFullscreen()); b.innerHTML = fsInner(); } };
  document.addEventListener('fullscreenchange', sync); document.addEventListener('webkitfullscreenchange', sync);
  addEventListener('keydown', e => {   // F: never a player's key (core.js KEYSETS); not while typing a name, a code or chat
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 'f') return;
    if (e.target && e.target.closest && e.target.closest('input:not([type=checkbox]):not([type=range]), textarea, select')) return;
    e.preventDefault(); toggleFullscreen();
  });
}

// a player's race keys as chips (gas, drift, item; core.js KEYS/DKEYS/IKEYS as set by setKeys). solo: one player, whose
// Space, Shift and Enter work too. Keyboards only (.kb-only)
const keyName = k => k === ' ' ? 'Space' : k.toUpperCase();
export function raceKeys(i, { drift = true, solo = false } = {}) {
  const chip = (k, alt, what) => `<span class="rk"><kbd>${keyName(k)}</kbd>${solo ? `<i>or</i><kbd>${alt}</kbd>` : ''}<b>${what}</b></span>`;
  return `<span class="race-keys kb-only">${chip(KEYS[i], 'Space', 'gas')}${drift ? chip(DKEYS[i], 'Shift', 'drift') : ''}${chip(IKEYS[i], 'Enter', 'item')}</span>`;
}
export const touchKeys = (n, drift = true) => `<span class="race-touch touch-only">${n > 1 ? 'Your corner of the screen: hold' : 'Hold the screen'} to go, tap ⚡ for items${drift ? ', hold DRIFT to slide' : ''}</span>`;

// the tracks raced lately, newest first, by name (kk-recent, at most RECENT_MAX): the map screen's Recent chip (menu.js).
// Noted as a race, cup race or time trial starts, offline or online
const RECENT_MAX = 8;
export function recentTracks() { try { const l = JSON.parse(localStorage.getItem('kk-recent') || '[]'); return Array.isArray(l) ? l.filter(n => typeof n === 'string') : []; } catch { return []; } }
export function noteRecent(name) {
  if (typeof localStorage === 'undefined' || !name) return;
  try { localStorage.setItem('kk-recent', JSON.stringify([name, ...recentTracks().filter(n => n !== name)].slice(0, RECENT_MAX))); } catch { }
}

// game: ui.js's (only its state is read)
export function initQol({ game } = {}) {
  if (typeof document === 'undefined') return;
  watchSafe(); touchPolish(); fullscreenKeys();
  if (game) keepAwake(game);
}
