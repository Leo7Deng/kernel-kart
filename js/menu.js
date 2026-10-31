// The menu, as a flow of full screens:
//   home    the title: your racer, a card per way to play, corner buttons
//   racers  players, bots and skill, a slot per player (turntable, stats) and the roster; each player picks with their
//           own keys (gas next, drift back, item ready) or by tapping; players may share a racer
//   track   the picked track big with its settings, every track to pick from (chips filter by cup); cups in a cup, the
//           records and rivals in a time trial (timetrial-ui.js ttBox); START
//   online  name, host or join (net-ui.js mountOnline; the room is net-ui.js showRoom)
//   howto   How to play, as tabs
// Back or Esc goes back a screen. Every choice lives in ui.js `setup` (kk-setup), so the flow returns as left. Keys: Tab
// and arrows across grids, Enter/Space picks, Enter on the picked one goes on; H, S, C, / (search).
import { openRoadmap, roadmapBtn } from './roadmap.js';
import { drawItemIcon } from './art.js';
import { sfx } from './audio.js';
import { CHARACTERS, DKEYS, IKEYS, KEYS, PCOL, setKeys } from './core.js';
import { homeArt } from './home-art.js';
import { fsButton, raceKeys, recentTracks } from './qol.js';
import { settings, saveSettings } from './settings.js';
import { openChangelog } from './changelog.js';
import { mountOnline } from './net-ui.js';
import { ITEMS, ITEM_ORDER } from './items/index.js';
import { clipOf } from './clip.js';
import { openClip } from './clip-ui.js';
import { TRACKS } from './tracks.js';
import { recordBadge, startTimeTrial, stopwatch, ttBox } from './timetrial-ui.js';
import { fightHowto, fightPlayable, fightTileIcon, fightScreen, startFightFromSetup } from './fight-ui.js';
import { logoSvg } from './art/logo.js';
import { bgTrack } from './menu-bg.js';
import { turntable, warmRacer } from './turntable.js';
import { frontrunHTML } from './frontrun.js';
import FR from './frontrun-data.js';
import { SHOT } from './shot.js';
import { CUP_MAX, CUP_MIN, CUP_POINTS, CUSTOM_COL, PRESET_CUPS, charInfo, details, esc, fillMinis, fmtTime, game, loadBests, miniTrack, warmMinis, warmRoster, oddsChart, openSettings,
  portrait, rosterPortrait, saveSetup, setMode, setup, startCup, startRace, tagline, toast, trackByName, trophy, whatsNewBtn, withShadow } from './ui.js';

const ui = () => document.getElementById('ui');
export const menu = { view: 'home', prev: 'home', raced: false };
const MODE_INFO = {
  single: ['Race', 'One race: 1 to 4 players, and bots'],
  cup: ['Cup', '3 to 5 tracks in a row, points for every place'],
  tt: ['Time trial', 'Just you, the clock and your ghost'],
  online: ['Online', 'Race friends on the same Wi-Fi'],
  fight: ['Fight', '1v1: three big moves and an evade each'],
};
const MODES = ['single', 'cup', 'tt', 'online', 'fight'];
const SKILL = ['Chill', 'Normal', 'Ruthless'];
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const flagIcon = `<svg class="trophy" viewBox="0 0 48 48" aria-hidden="true"><path d="M11 6v38" stroke="#d8dce8" stroke-width="3.4" stroke-linecap="round"/>
  <g transform="skewY(-8) translate(0 5)"><rect x="13" y="8" width="28" height="19" rx="1.5" fill="#fff"/>${[0, 1, 2, 3].flatMap(c => [0, 1, 2].map(r => (c + r) % 2 ? '' : `<rect x="${13 + c * 7}" y="${8 + r * 6.34}" width="7" height="6.34" fill="#1b1f2e"/>`)).join('')}</g></svg>`;
const netIcon = `<svg class="trophy" viewBox="0 0 48 48" aria-hidden="true"><g fill="none" stroke="#58b8ff" stroke-width="4.2" stroke-linecap="round"><path d="M6 19a26 26 0 0 1 36 0"/><path d="M12.5 26.5a17 17 0 0 1 23 0"/><path d="M19 34a8 8 0 0 1 10 0"/></g><circle cx="24" cy="41" r="3.6" fill="#58b8ff"/></svg>`;
export const modeIcon = m => m === 'single' ? flagIcon : m === 'cup' ? trophy('#ffc93c') : m === 'tt' ? stopwatch() : m === 'fight' ? fightTileIcon : netIcon;
const ICON = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>',
  help: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm.1 16.2a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8zm1.6-6.1c-.8.5-1 .8-1 1.6v.4h-2.3v-.6c0-1.4.5-2.1 1.6-2.8.8-.5 1.1-.9 1.1-1.5 0-.7-.6-1.2-1.4-1.2-.9 0-1.5.6-1.6 1.5H7.7C7.8 7.1 9.4 5.7 12 5.7c2.4 0 4 1.3 4 3.2 0 1.4-.8 2.4-2.3 3.2z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" transform="translate(-1 0)" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.7 7.7 0 0 0-1.7-1L15 3.2h-4l-.4 2.7a7.7 7.7 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.7 7.7 0 0 0 1.7 1l.4 2.7h4l.4-2.7a7.7 7.7 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
};

// ---------------------------------------------------------------- how the last input came (focus follows the keyboard only)
let byKey = false;
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', e => { if (!e.ctrlKey && !e.metaKey) byKey = true; }, true);
  document.addEventListener('pointerdown', () => { byKey = false; }, true);
}
const still = () => settings.reduced || matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- the screens
// view: which screen ('home', 'racers', 'track', 'online', 'howto'); dir: 1 forward, -1 back (the slide's way)
export function showView(view, dir = 1) {
  if (view === 'online' || setup.mode === 'online' && (view === 'racers' || view === 'track')) view = view === 'home' ? 'home' : 'online';
  if (setup.mode === 'fight' && (view === 'racers' || view === 'track')) view = 'fight';   // (Fight mode has its own setup screen, fight-ui.js)
  if (view !== 'howto') menu.prev = view;
  menu.view = view;
  document.documentElement.classList.toggle('kk-still', !!settings.reduced);
  const s = document.createElement('div');
  s.className = `screen mscreen m-${view}` + (dir < 0 ? ' back' : ''); s.tabIndex = -1;
  s.setAttribute('role', 'main'); s.setAttribute('aria-label', TITLES[view]());
  const live = '<div class="sr-only" aria-live="polite" id="mlive"></div>';
  ui().innerHTML = ''; ui().appendChild(s);
  SCREENS[view](s);
  s.insertAdjacentHTML('beforeend', live);
  wireUtil(s);
  // the keyboard's focus: on the screen's main pick if you came by keyboard, else on the screen itself (Tab goes on from the top)
  const f = byKey && s.querySelector('[data-first]');
  (f || s).focus({ preventScroll: true });
  saveSetup();
  if (!SHOT) warmMinis(setup.track | 0);   // (every track's preview, drawn in idle moments, so the map screen opens at once)
  warmRoster();                 // (the roster cards' 3D racers, a frame each on the 3D bakery, so Who's racing has them)
}
const say = t => { const el = document.getElementById('mlive'); if (el) { el.textContent = ''; setTimeout(() => { el.textContent = t; }, 30); } };
const TITLES = {
  home: () => 'Kernel Kart', racers: () => 'Who\'s racing', online: () => 'Online', howto: () => 'How to play', fight: () => 'Fight',
  track: () => setup.mode === 'cup' ? 'Pick a cup' : setup.mode === 'tt' ? 'Time trial track' : 'Pick a track',
};
const SCREENS = { home: homeScreen, racers: racersScreen, track: trackScreen, online: onlineScreen, howto: howtoScreen, fight: s => fightScreen(s, topBar(TITLES.fight())) };
export function goBack() {
  const v = menu.view;
  if (v === 'howto') return showView(menu.prev === 'howto' ? 'home' : menu.prev, -1);
  if (v === 'track') return showView('racers', -1);
  if (v === 'racers' || v === 'online' || v === 'fight') return showView('home', -1);
}
// the screen after the menu comes back (from a race, the results, a room that ended): where you start races from
export const returnView = () => setup.mode === 'online' ? 'online' : setup.mode === 'fight' ? (menu.raced ? 'fight' : 'home') : menu.raced ? 'track' : 'home';

// the corner buttons: Full screen (qol.js, where there is one), How to play, Settings (and on the title In the works and What's new)
const utilBtns = full => `<div class="m-util">${fsButton()}
    <button type="button" class="m-icon" id="mhowto" title="How to play (H)" aria-label="How to play (H)">${ICON.help}<span class="m-it">How to play</span></button>
    <button type="button" class="m-icon" id="msettings" title="Settings (S)" aria-label="Settings (S)">${ICON.gear}<span class="m-it">Settings</span></button>
    ${full ? roadmapBtn() + whatsNewBtn() : ''}</div>`;
function wireUtil(s) {
  const on = (id, fn) => { const b = s.querySelector('#' + id); if (b) b.onclick = fn; };
  on('mhowto', () => showView('howto'));
  on('msettings', () => openSettings(() => { if (game.state === 'menu') showView(menu.view, 0); }));
  on('roadmap', openRoadmap); on('changelog', openChangelog);
  const back = s.querySelector('.m-back'); if (back) back.onclick = goBack;
}
// an inner screen's top bar: Back, where you are (the steps of this mode), the corner buttons
function topBar(title) {
  const m = setup.mode, steps = m === 'online' ? [] : [['racers', m === 'tt' ? 'Racer' : 'Racers'], ['track', m === 'cup' ? 'Cup' : 'Track']];
  const cur = menu.view, stepper = steps.length && (cur === 'racers' || cur === 'track') ? `<ol class="m-steps" aria-label="Steps">${steps.map(([v, t], i) =>
    `<li><button type="button" class="m-step${v === cur ? ' on' : ''}" data-step="${v}"${v === cur ? ' aria-current="step"' : ''}><b>${i + 1}</b>${t}</button></li>`).join('')}</ol>` : '';
  return `<header class="m-top"><button type="button" class="m-back" aria-label="Back (Esc)" title="Back (Esc)">${ICON.back}<span>Back</span></button>
    <div class="m-head">${menu.view === 'howto' ? '' : `<span class="m-mode">${modeIcon(m)}${esc(MODE_INFO[m][0])}</span>`}<h1 class="m-h">${esc(title)}</h1></div>${stepper}${utilBtns(false)}</header>`;
}
function wireSteps(s) { s.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { const v = b.dataset.step; if (v !== menu.view) showView(v, v === 'track' ? 1 : -1); }); }

// roving focus across a grid of buttons (one Tab stop; arrow keys, Home and End move; Enter or Space picks)
function rove(grid, sel = 'button') {
  const items = () => [...grid.querySelectorAll(sel)].filter(x => x.offsetParent !== null);
  const stop = (el, all = items()) => { for (const it of all) it.tabIndex = it === el ? 0 : -1; };
  stop(grid.querySelector(sel + '[aria-pressed="true"]') || grid.querySelector(sel), grid.querySelectorAll(sel));   // (all of them: asking which are shown forces an extra layout)
  grid.addEventListener('focusin', e => { const it = e.target.closest(sel); if (it && grid.contains(it)) stop(it); });
  grid.onkeydown = e => {
    const all = items(), i = all.indexOf(document.activeElement); if (i < 0 || e.altKey || e.ctrlKey || e.metaKey) return;
    let cols = 1; while (cols < all.length && Math.abs(all[cols].offsetTop - all[0].offsetTop) < 4) cols++;
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + cols, ArrowUp: i - cols, Home: 0, End: all.length - 1 }[e.key];
    if (j == null) return;
    e.preventDefault(); e.stopPropagation();
    const t = all[Math.max(0, Math.min(all.length - 1, j))]; t.focus(); stop(t); t.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: still() ? 'auto' : 'smooth' });
  };
}
// a segmented control (buttons in a well) as html: opts [value, label, title?]; data-seg names it
const seg = (name, label, opts, cur, cls = '') => `<div class="m-set${cls}" data-set="${name}"><span class="lbl" id="lbl-${name}">${label}</span><span class="seg" role="group" aria-labelledby="lbl-${name}">${opts.map(([v, t, title]) =>
  `<button type="button" data-seg="${name}" data-v="${v}" aria-pressed="${v === cur}"${v === cur ? ' class="sel"' : ''}${title ? ` title="${esc(title)}"` : ''}>${t}</button>`).join('')}</span></div>`;
const driftSwitch = () => `<label class="m-set m-switch"><span class="lbl">Drift</span><input type="checkbox" class="switch" id="mdrift"${settings.drift ? ' checked' : ''}><span class="m-sw-t">${settings.drift ? 'On' : 'Off'}</span></label>`;

// ---------------------------------------------------------------- home
// the title: the big logo and the one-button line (left; on top when upright), a card per way to play with a little
// 3D scene (home-art.js) as the main content, What's new and In the works along the bottom
function homeScreen(s) {
  const m = setup.mode;
  const card = (k, i) => { const off = k === 'fight' && !fightPlayable();
    return `<button type="button" class="home-mode kk-in" style="--d:${0.06 + i * 0.05}s" data-m="${k}"${k === m && !off ? ' data-first' : ''}${off ? ' disabled aria-disabled="true"' : ''}>
      <span class="hm-stage kk-stripes"><canvas class="hm-art" data-art="${k}" aria-hidden="true"></canvas><span class="hm-ic">${modeIcon(k)}</span></span>
      <span class="hm-text"><span class="hm-t">${MODE_INFO[k][0]}</span><span class="hm-d">${off ? 'Needs a keyboard or a gamepad' : MODE_INFO[k][1]}</span></span>${ICON.next}</button>`; };
  s.innerHTML = `<header class="m-top home-top">${utilBtns(false)}</header>
    <div class="home-main kk">
      <section class="home-hero kk-in">
        <h1 class="home-logo">${logoSvg({ anim: !settings.reduced })}</h1>
        <p class="home-sub">One button: hold gas to go, lift for the corners. The kart steers itself.</p>
      </section>
      <div class="home-modes" role="group" aria-label="Play">${MODES.map(card).join('')}</div>
    </div>
    <footer class="home-foot"><div class="home-news">${roadmapBtn()}${whatsNewBtn()}</div></footer>`;
  s.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
    if (b.dataset.m === 'cup' && !setup.cupPick && !setup.cupTracks.length) setup.cupPick = PRESET_CUPS[0].name;   // (a first cup: a ready-made one picked)
    setMode(b.dataset.m); showView(b.dataset.m === 'online' ? 'online' : b.dataset.m === 'fight' ? 'fight' : 'racers'); });
  rove(s.querySelector('.home-modes'));
  homeArt(s, { ch: CHARACTERS[setup.picks[0] | 0] });
  bgTrack(setup.mode === 'tt' ? setup.ttTrack : setup.track);
}

// ---------------------------------------------------------------- racers
let pick = null;   // the racers screen's own state: { active (slot being picked by tap), ready (Set of slots) }
function racersScreen(s) {
  const m = setup.mode, solo = m === 'tt';
  pick = { active: Math.min(setup.active | 0, (solo ? 1 : setup.humans) - 1), ready: new Set(), tables: [] };
  s.innerHTML = `${topBar(solo ? 'Your racer' : 'Who\'s racing')}
    <div class="m-body pick">
      ${solo ? '<div class="who-bar solo"><span class="help">A time trial is you alone: no bots, no items, no obstacles.</span></div>' : '<div class="who-bar" id="whobar" role="group" aria-label="Players and bots"></div>'}
      <div class="pslots" id="pslots"></div>
      <div class="roster-wrap"><div class="roster" id="roster" role="group" aria-label="Racers"></div></div>
    </div>
    <footer class="m-foot"><div class="m-sum" id="rsum"></div><button type="button" class="big m-go" id="next">${m === 'cup' ? 'CUP' : 'TRACK'}</button></footer>`;
  wireSteps(s);
  s.querySelector('#next').onclick = () => showView('track');
  const roster = s.querySelector('#roster');
  roster.innerHTML = CHARACTERS.map((ch, ci) => `<button type="button" class="rcard" data-ci="${ci}" style="--rc:${ch.color}"><span class="rc-port" data-port="${ci}"></span><span class="rc-n">${esc(ch.name)}</span><span class="rc-tags"></span></button>`).join('');
  roster.querySelectorAll('[data-port]').forEach(el => el.appendChild(rosterPortrait(CHARACTERS[+el.dataset.port])));   // (the racer alone, 3D: ui.js)
  roster.querySelectorAll('.rcard').forEach(b => {
    b.onclick = () => choose(pick.active, +b.dataset.ci, true);
    b.onpointerenter = () => warmRacer(CHARACTERS[+b.dataset.ci]);
    b.onfocus = () => warmRacer(CHARACTERS[+b.dataset.ci]);
  });
  buildSlots(s);
  rove(roster, '.rcard');
  drawRacers(s);
  const first = roster.querySelector(`[data-ci="${seats()[pick.active]}"]`); if (first) first.dataset.first = '';
}
const nSlots = () => setup.mode === 'tt' ? 1 : setup.humans;
const seats = () => setup.picks.slice(0, nSlots());
function buildSlots(s) {
  const n = nSlots(), solo = setup.mode === 'tt', box = s.querySelector('#pslots');
  setKeys(n);
  box.className = 'pslots n' + n; s.querySelector('.m-body.pick').className = 'm-body pick n' + n;
  box.innerHTML = Array.from({ length: n }, (_, i) => `<div class="pslot" data-slot="${i}" style="--pc:${PCOL[i]}">
      <button type="button" class="ps-head" data-slot-btn="${i}"><span class="ps-tag">${solo || n === 1 ? 'YOU' : 'P' + (i + 1)}</span><span class="ps-state"></span></button>
      <div class="ps-stage"><canvas class="ps-tt" aria-hidden="true"></canvas><span class="ps-ready" aria-hidden="true">READY</span></div>
      <div class="ps-info"></div>
      <div class="ps-keys kb-only" aria-hidden="true"><div class="ps-race"><span class="ps-race-l">In the race</span>${raceKeys(i, { drift: settings.drift, solo: n === 1 })}</div><kbd>${KEYS[i].toUpperCase()}</kbd> next · <kbd>${DKEYS[i].toUpperCase()}</kbd> back · <kbd>${IKEYS[i].toUpperCase()}</kbd> ready</div></div>`).join('');
  pick.tables = [...box.querySelectorAll('.ps-tt')].map((cv, i) => turntable(cv, { ch: CHARACTERS[setup.picks[i]], col: PCOL[i], phase: i * 1.3 }));
  box.querySelectorAll('.pslot').forEach(el => el.onclick = e => {   // a tap on a slot: pick for that player now
    const i = +el.dataset.slot; if (pick.active === i && !e.target.closest('.ps-head')) return;
    pick.active = i; setup.active = i; pick.ready.delete(i); drawRacers(s);
    say(`Picking for ${slotName(i)}`);
    if (byKey) { const c = s.querySelector(`.rcard[data-ci="${setup.picks[i]}"]`); if (c) c.focus(); }
  });
}
const slotName = i => setup.mode === 'tt' || nSlots() === 1 ? 'you' : 'P' + (i + 1);
// player i picks racer ci (ready: they're happy with it; the next player still picking gets the taps after)
function choose(i, ci, ready) {
  const s = document.querySelector('.m-racers'); if (!s) return;
  const was = setup.picks[i]; setup.picks[i] = ci;
  if (ready) pick.ready.add(i); else pick.ready.delete(i);
  pick.tables[i] && pick.tables[i].set(CHARACTERS[ci], ready || was !== ci);
  if (ready) { sfx.play('click'); const nx = [...Array(nSlots()).keys()].find(k => !pick.ready.has(k)); if (nx != null && nx !== i) { pick.active = nx; setup.active = nx; } }
  say(`${slotName(i) === 'you' ? 'You' : slotName(i)}: ${CHARACTERS[ci].name}${ready ? ', ready' : ''}`);
  drawRacers(s); saveSetup();
  const a = document.activeElement; if (a && a.closest && a.closest('#roster') && i === pick.active) { const c = s.querySelector(`.rcard[data-ci="${ci}"]`); if (c) c.focus(); }   // (the focus follows that player's pick)
  if (ready && pick.ready.size === nSlots() && byKey) s.querySelector('#next').focus();
}
function drawRacers(s) {
  const m = setup.mode, solo = m === 'tt', n = nSlots(), picks = seats();
  // players, bots and their skill (a time trial: nothing to set)
  const wb = s.querySelector('#whobar');
  if (wb) {
    const maxBots = 4 - setup.humans; if (setup.bots > maxBots) setup.bots = maxBots;
    const fk = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.seg ? `[data-seg="${document.activeElement.dataset.seg}"][data-v="${document.activeElement.dataset.v}"]` : null;
    wb.innerHTML = seg('humans', 'Players', [1, 2, 3, 4].map(k => [k, k, plural(k, 'player')]), setup.humans)
      + seg('bots', 'Bots', Array.from({ length: maxBots + 1 }, (_, k) => [k, k || 'None', k ? plural(k, 'bot') : 'No bots']), setup.bots)
      + seg('ai', 'Bot skill', SKILL.map((t, k) => [k, t]), setup.aiLevel, setup.bots ? '' : ' off')
      + `<div class="who-sum" aria-hidden="true"><span class="who-chips">${picks.map((_, k) => `<i style="background:${PCOL[k]}">P${k + 1}</i>`).join('')}${'<i class="bot">BOT</i>'.repeat(setup.bots)}</span><b>${plural(n + setup.bots, 'kart')}</b></div>`;
    wb.querySelectorAll('[data-seg]').forEach(b => b.onclick = () => {
      const v = +b.dataset.v, k = b.dataset.seg;
      if (k === 'humans') { if (v === setup.humans) return; setup.humans = v; setup.active = Math.min(setup.active, v - 1); pick.active = Math.min(pick.active, v - 1); pick.ready.clear(); buildSlots(s); say(`${plural(v, 'player')}, ${plural(Math.min(setup.bots, 4 - v), 'bot')}`); }
      else if (k === 'bots') { setup.bots = v; say(v ? plural(v, 'bot') : 'No bots'); }
      else { setup.aiLevel = v; say(`Bot skill ${SKILL[v]}`); }
      drawRacers(s); saveSetup();
    });
    if (fk) { const el = wb.querySelector(fk); if (el) el.focus(); }
  }
  // the slots: each player's racer, their state (picking, ready), the stats
  s.querySelectorAll('.pslot').forEach(el => {
    const i = +el.dataset.slot, ch = CHARACTERS[setup.picks[i]], act = pick.active === i && n > 1, rd = pick.ready.has(i);
    el.classList.toggle('active', act); el.classList.toggle('ready', rd);
    const hd = el.querySelector('.ps-head');
    hd.setAttribute('aria-pressed', act); hd.setAttribute('aria-label', `${slotName(i) === 'you' ? 'You' : slotName(i)}: ${ch.name}${rd ? ', ready' : ''}.${n > 1 ? ' Press to pick for this player.' : ''}`);
    el.querySelector('.ps-state').textContent = rd ? 'Ready' : act ? 'Picking' : n > 1 ? 'Tap to pick' : 'Pick a racer';
    const info = el.querySelector('.ps-info');
    if (info.dataset.ch !== ch.id) { info.dataset.ch = ch.id; info.innerHTML = `<div class="ps-name">${esc(ch.name)}<span class="ps-lang">${esc(ch.lang)}</span></div>${charInfo(ch).replace(/<div class="n">.*?<\/div><div class="l">.*?<\/div>/, '')}`; }
  });
  // the roster: who has each racer (a tag per player), the active player's pick pressed
  s.querySelectorAll('.rcard').forEach(b => {
    const ci = +b.dataset.ci, who = picks.map((p, k) => p === ci ? k : -1).filter(k => k >= 0);
    b.setAttribute('aria-pressed', who.includes(pick.active));
    b.classList.toggle('mine', who.includes(pick.active)); b.classList.toggle('taken', who.length > 0);
    b.style.setProperty('--pc', who.length ? PCOL[who.includes(pick.active) ? pick.active : who[0]] : 'transparent');
    b.querySelector('.rc-tags').innerHTML = who.map(k => `<i style="background:${PCOL[k]}">${solo || n === 1 ? 'YOU' : 'P' + (k + 1)}</i>`).join('');
    b.setAttribute('aria-label', `${CHARACTERS[ci].name}, ${CHARACTERS[ci].lang}${who.length ? ', picked by ' + who.map(k => solo || n === 1 ? 'you' : 'P' + (k + 1)).join(' and ') : ''}`);
  });
  // the sum and Next
  const sum = s.querySelector('#rsum');
  sum.innerHTML = `<span class="ms-ports">${picks.map(ci => `<i data-port="${ci}"></i>`).join('')}</span><span class="ms-t"><b>${esc(picks.map(ci => CHARACTERS[ci].name).join(', '))}</b><small>${solo ? 'alone, against the clock' : setup.bots ? `+ ${plural(setup.bots, 'bot')} · ${SKILL[setup.aiLevel]}` : 'no bots'}</small></span>`;
  sum.querySelectorAll('[data-port]').forEach(el => el.appendChild(portrait(CHARACTERS[+el.dataset.port])));
  const all = pick.ready.size === n; s.querySelector('#next').classList.toggle('pulse', all && !still());
}
// a player's own keys on the racers screen: gas the next racer, drift the one before, item ready (everyone ready: go on)
function racerKey(k) {
  const n = nSlots();
  for (let i = 0; i < n; i++) {
    const cur = setup.picks[i], N = CHARACTERS.length;
    if (k === KEYS[i]) { pick.active = i; setup.active = i; choose(i, (cur + 1) % N, false); return true; }
    if (k === DKEYS[i]) { pick.active = i; setup.active = i; choose(i, (cur + N - 1) % N, false); return true; }
    if (k === IKEYS[i]) {
      if (pick.ready.has(i) && pick.ready.size === n) { showView('track'); return true; }
      if (pick.ready.has(i)) { pick.ready.delete(i); pick.active = i; drawRacers(document.querySelector('.m-racers')); say(`${slotName(i)}: picking again`); }
      else choose(i, cur, true);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- the map (track, cup or time trial track)
const lapsFixed = t => t.laps ? plural(t.laps, 'lap') : null;
// the cup that START would run: a ready-made one, or your own once it has enough tracks
function curCup() {
  const pre = PRESET_CUPS.find(c => c.name === setup.cupPick), own = setup.cupTracks.map(trackByName).filter(i => i >= 0);
  return pre ? { ok: true, name: pre.name, col: pre.col, tracks: pre.tracks, pre } : { ok: own.length >= CUP_MIN, name: 'Your cup', col: CUSTOM_COL, tracks: own, need: CUP_MIN - own.length };
}
function trackScreen(s) {
  trackQuery = '';
  const m = setup.mode, cup = m === 'cup', tt = m === 'tt';
  s.innerHTML = `${topBar(TITLES.track())}
    <div class="m-body map">
      <section class="map-pre" id="mpre" aria-label="${cup ? 'The cup' : 'The track'}"></section>
      <section class="map-list" aria-label="${cup ? 'Cups' : 'Tracks'}">
        ${cup ? '<div class="mcups" id="mcups" role="group" aria-label="Cups"></div><h2 class="map-h" id="ownh" hidden>Your own cup: click 3 to 5 tracks in race order</h2>' : '<div class="tfilter" id="mfilter" role="group" aria-label="Show tracks"></div>'}
        <div class="map-tools" id="mtools"></div>
        <div class="mgrid" id="mgrid" role="group" aria-label="Tracks"></div>
      </section>
    </div>
    <footer class="m-foot"><button type="button" class="m-sum ms-btn" id="msum" title="Change the racers"></button><div class="m-go-wrap"><button type="button" class="big m-go" id="start" data-start></button><div class="m-hint" id="mhint"></div></div></footer>`;
  wireSteps(s);
  s.querySelector('#msum').onclick = () => showView('racers', -1);
  s.querySelector('#start').onclick = start;
  drawMap(s, true);
}
function drawMap(s, full = false) {
  const m = setup.mode, cup = m === 'cup', tt = m === 'tt', C = cup ? curCup() : null, ownOn = cup && !C.pre;
  // the grid: the cups (in a cup), the tracks (filtered by cup, or yours to build in a cup)
  if (full) {
    if (cup) {
      const cc = s.querySelector('#mcups');
      cc.innerHTML = PRESET_CUPS.map((c, i) => `<button type="button" class="mcup" data-cup="${i}" style="--cc:${c.col}">${trophy(c.col)}<span class="mcup-t"><b>${esc(c.name)}</b><small>${c.tracks.length} races</small></span><span class="mc-thumbs">${c.tracks.map(t => `<span class="mini" data-mini="${t}" data-w="64" data-h="40"></span>`).join('')}</span></button>`).join('')
        + `<button type="button" class="mcup own" data-cup="own" style="--cc:${CUSTOM_COL}">${trophy(CUSTOM_COL)}<span class="mcup-t"><b>Your own cup</b><small>pick 3 to 5 tracks</small></span><span class="mc-thumbs mc-own"><i>+</i></span></button>`;
      fillMinis(cc);
      cc.querySelectorAll('[data-cup]').forEach(b => b.onclick = () => {
        if (b.dataset.cup === 'own') { setup.cupPick = ''; say(`Your own cup: ${setup.cupTracks.length} tracks`); }
        else { const c = PRESET_CUPS[+b.dataset.cup]; if (setup.cupPick === c.name) return; setup.cupPick = c.name; say(`${c.name}: ${c.tracks.map(t => TRACKS[t].name).join(', ')}`); }
        drawMap(s, true);
      });
      rove(cc, '.mcup');
    } else {
      const filt = PRESET_CUPS.find(c => c.name === setup.trackFilter), tf = s.querySelector('#mfilter'), on = recentList() ? RECENT : filt ? filt.name : '';
      tf.innerHTML = [['', 'All tracks', null], ...(recentTracks().length ? [[RECENT, 'Recent', null]] : []), ...PRESET_CUPS.map(c => [c.name, c.name.replace(/ Cup$/, ''), c.col])].map(([k, l, col]) =>
        `<button type="button" class="tf${on === k ? ' sel' : ''}" data-tf="${esc(k)}" aria-pressed="${on === k}"${col ? ` style="--cc:${col}"` : ''}${k === RECENT ? ' title="The tracks you raced lately, newest first"' : ''}>${col ? '<i></i>' : ''}${esc(l)}</button>`).join('');
      tf.querySelectorAll('[data-tf]').forEach(b => b.onclick = () => { setup.trackFilter = b.dataset.tf; drawMap(s, true); const f = s.querySelector(`[data-tf="${CSS.escape(b.dataset.tf)}"]`); if (f && byKey) f.focus(); });
    }
    const gr = s.querySelector('#mgrid'), filt = !cup && PRESET_CUPS.find(c => c.name === setup.trackFilter), bests = loadBests(), fr = !!setup.showFR;
    gr.hidden = cup && !ownOn; const oh = s.querySelector('#ownh'); if (oh) oh.hidden = !ownOn;
    // the front-runner ratings on every tile at once (frontrun-data.js), and the tracks sorted by them if you like
    const tools = s.querySelector('#mtools'); tools.hidden = cup && !ownOn;
    const hadSearch = document.activeElement && document.activeElement.id === 'msearch';
    tools.innerHTML = searchBox() + `<label class="m-switch fr-sw"><input type="checkbox" class="switch" id="mfr"${fr ? ' checked' : ''}><span class="fr-sw-t">Front-runner ratings<small>how hard the leader is to catch, 0 to 10</small></span></label>`
      + (fr ? seg('frsort', 'Order', [[0, 'Usual', 'The usual order'], [1, 'Highest', 'Highest rating first'], [2, 'Lowest', 'Lowest rating first']], setup.frSort | 0) : '');
    tools.querySelector('#mfr').onchange = e => { setup.showFR = e.target.checked; say(e.target.checked ? 'Front-runner ratings shown on every track' : 'Front-runner ratings hidden'); drawMap(s, true); const f = s.querySelector('#mfr'); if (f) f.focus(); };
    tools.querySelectorAll('[data-seg="frsort"]').forEach(b => b.onclick = () => { setup.frSort = +b.dataset.v; say(['Usual order', 'Highest rating first', 'Lowest rating first'][setup.frSort]); drawMap(s, true); const f = s.querySelector(`[data-seg="frsort"][data-v="${setup.frSort}"]`); if (f) f.focus(); });
    const frOf = ti => (FR[TRACKS[ti].name] || {}).score ?? -1;
    const rec = !cup && recentList(), list = rec || TRACKS.map((t, ti) => ti).filter(ti => !filt || filt.tracks.includes(ti));   // (Recent: newest first)
    if (fr && setup.frSort && !rec) list.sort((a, b) => (setup.frSort === 1 ? frOf(b) - frOf(a) : frOf(a) - frOf(b)) || a - b);
    gr.innerHTML = (!cup && !tt && !filt && !rec ? `<button type="button" class="mtile random" data-t="-1"><span class="rnd-face"><span>?</span></span><span class="mt-n">Random</span></button>` : '')
      + list.map(ti => { const t = TRACKS[ti], b = bests[t.name];
        return `<button type="button" class="mtile" data-t="${ti}"><span class="mini" data-mini="${ti}" data-w="150" data-h="90"></span><span class="mt-n">${esc(t.name)}${fr ? frBadge(t) : ''}</span>${tt ? recordBadge(t) : !cup && b && b.lap ? `<span class="mt-best">${fmtTime(b.lap)}</span>` : ''}<span class="mt-num"></span></button>`; }).join('');
    fillMinis(gr);
    gr.querySelectorAll('[data-t]').forEach(b => b.onclick = () => pickTrack(s, +b.dataset.t, b));
    rove(gr, '.mtile');
    wireSearch(s, hadSearch);
  }
  // which tiles are picked
  const cur = tt ? setup.ttTrack : setup.random ? -1 : setup.track;
  s.querySelectorAll('.mtile').forEach(b => {
    const ti = +b.dataset.t, n = cup ? setup.cupTracks.indexOf(TRACKS[ti] ? TRACKS[ti].name : '') : -1, on = cup ? n >= 0 : ti === cur;
    b.setAttribute('aria-pressed', on); b.classList.toggle('sel', on && !cup); b.classList.toggle('incup', cup && n >= 0);
    b.querySelector('.mt-num') && (b.querySelector('.mt-num').textContent = cup && n >= 0 ? n + 1 : '');
    const d = ti >= 0 && setup.showFR && FR[TRACKS[ti].name];
    b.setAttribute('aria-label', ti < 0 ? 'Random track' : `${TRACKS[ti].name}${cup && n >= 0 ? `, race ${n + 1} of your cup` : ''}${d ? `, front-runner ${d.score.toFixed(1)} of 10${d.provisional ? ', provisional' : ''}` : ''}`);
  });
  s.querySelectorAll('.mcup').forEach(b => { const on = b.dataset.cup === 'own' ? !C.pre : C.pre && PRESET_CUPS[+b.dataset.cup] === C.pre; b.setAttribute('aria-pressed', !!on); b.classList.toggle('sel', !!on); });
  if (full) { const gr = s.querySelector('#mgrid'); const st = gr.querySelector('[aria-pressed="true"]') || gr.querySelector('.mtile'); if (st) { gr.querySelectorAll('.mtile').forEach(x => { x.tabIndex = x === st ? 0 : -1; }); } const f = s.querySelector('.mcup[aria-pressed="true"]') || st; if (f) f.dataset.first = ''; searchTiles(s); }
  drawPreview(s);
  drawFoot(s);
  bgTrack(tt ? setup.ttTrack : cup ? (C.tracks[0] ?? setup.track) : setup.track);
  saveSetup();
}
// the map's search box: tiles whose name has every typed word (case and accents aside). "/" focuses it, Esc empties then
// leaves it, Enter or ↓ goes to the first match. Not kept between visits
let trackQuery = '';
const fold = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const SEARCH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.8"/><path d="M15.5 15.5l5 5" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>';
const searchBox = () => `<label class="m-search">${SEARCH_ICON}<input type="search" id="msearch" placeholder="Search tracks" aria-label="Search tracks by name" autocomplete="off" spellcheck="false" enterkeyhint="go" value="${esc(trackQuery)}"><kbd class="kb-only" aria-hidden="true">/</kbd></label>`;
function searchTiles(s) {
  const gr = s.querySelector('#mgrid'); if (!gr) return;
  const words = fold(trackQuery).split(' ').filter(Boolean), tiles = [...gr.querySelectorAll('.mtile')];
  let n = 0;
  for (const b of tiles) { const ti = +b.dataset.t, hit = !words.length || (ti >= 0 && words.every(w => fold(TRACKS[ti].name).includes(w))); b.classList.toggle('m-gone', !hit); if (hit) n++; }
  let none = s.querySelector('#mnone');
  if (!none) { none = document.createElement('p'); none.id = 'mnone'; none.className = 'help m-none'; gr.after(none); }
  none.hidden = n > 0 || !tiles.length; none.textContent = n ? '' : `No track called "${trackQuery.trim()}"${setup.trackFilter ? ' here: try All tracks' : ''}.`;
  // (the grid's one Tab stop on a tile that's showing)
  const vis = tiles.filter(b => !b.classList.contains('m-gone'));
  if (vis.length && !vis.some(b => b.tabIndex === 0)) { for (const b of tiles) b.tabIndex = -1; (vis.find(b => b.getAttribute('aria-pressed') === 'true') || vis[0]).tabIndex = 0; }
  return n;
}
function wireSearch(s, refocus) {
  const inp = s.querySelector('#msearch'); if (!inp) return;
  const first = () => s.querySelector('#mgrid .mtile:not(.m-gone)');
  inp.oninput = () => { trackQuery = inp.value; const n = searchTiles(s); say(trackQuery.trim() ? (n ? `${n} track${n === 1 ? '' : 's'}` : 'No track') : 'Every track'); };
  inp.onkeydown = e => {
    if (e.key === 'Escape' && inp.value) { e.preventDefault(); e.stopPropagation(); inp.value = ''; inp.oninput(); }   // (empty: the menu's Esc leaves the box)
    else if (e.key === 'ArrowDown' || e.key === 'Enter') { const f = first(); if (!f) return; e.preventDefault(); e.stopPropagation(); f.focus(); if (e.key === 'Enter' && f.getAttribute('aria-pressed') !== 'true') f.click(); }
  };
  if (refocus) { inp.focus({ preventScroll: true }); inp.setSelectionRange(inp.value.length, inp.value.length); }
}
// the map's Recent chip (qol.js recentTracks): the tracks raced lately, newest first; null when it isn't the filter or
// there are none yet
const RECENT = '~recent';
const recentList = () => { if (setup.trackFilter !== RECENT) return null; const l = recentTracks().map(trackByName).filter(i => i >= 0); return l.length ? l : null; };
// a tile's front-runner rating at a glance: the ten pips, the score, provisional marked
function frBadge(t) {
  const d = FR[t.name]; if (!d) return '<span class="mt-fr none">not rated yet</span>';
  return `<span class="mt-fr" aria-hidden="true"><span class="fr-m">${Array.from({ length: 10 }, (_, i) => `<i${i < Math.round(d.score) ? ' class="on"' : ''}></i>`).join('')}</span><b>${d.score.toFixed(1)}</b>${d.provisional ? '<em>provisional</em>' : ''}</span>`;
}
// a track tile picked: the track (Random: -1), or in your own cup add it or take it out (Enter on the one already picked starts: the menu's keys)
function pickTrack(s, ti, b) {
  const m = setup.mode, cup = m === 'cup', tt = m === 'tt';
  if (cup) {
    const n = setup.cupTracks.indexOf(TRACKS[ti].name);
    if (n >= 0) { setup.cupTracks.splice(n, 1); say(`${TRACKS[ti].name} taken out: ${setup.cupTracks.length} tracks`); }
    else if (setup.cupTracks.length < CUP_MAX) { setup.cupTracks.push(TRACKS[ti].name); say(`${TRACKS[ti].name} is race ${setup.cupTracks.length}`); }
    else return toast(`A cup has at most ${CUP_MAX} tracks`);
  } else {
    if (tt) setup.ttTrack = ti; else if (ti < 0) setup.random = true; else { setup.track = ti; setup.random = false; }
    say(ti < 0 ? 'Random track' : TRACKS[ti].name);
  }
  drawMap(s);
}
// the big preview: the picked track (its picture, what it's about, the race settings), or the cup, or the time trial's box
function drawPreview(s) {
  const m = setup.mode, cup = m === 'cup', tt = m === 'tt', el = s.querySelector('#mpre'), fk = focusKey();
  if (cup) {
    const C = curCup(), own = !C.pre;
    const rows = C.tracks.map((t, i) => `<li class="cr"><span class="cr-n">${i + 1}</span><span class="mini" data-mini="${t}" data-w="92" data-h="56"></span><span class="cr-t">${esc(TRACKS[t].name)}<small>${esc(tagline(TRACKS[t]))}</small></span>${own ? `<button type="button" class="cr-x" data-drop="${i}" aria-label="Take ${esc(TRACKS[t].name)} out">${ICON.x}</button>` : ''}</li>`).join('')
      + (own ? Array.from({ length: Math.max(0, CUP_MIN - C.tracks.length) }, (_, k) => `<li class="cr empty"><span class="cr-n">${C.tracks.length + k + 1}</span><span class="cr-t">${k === 0 ? 'Pick a track on the right' : 'Needed'}</span></li>`).join('') : '');
    el.innerHTML = `<div class="mp-cup" style="--cc:${C.col}">${trophy(C.col, 'mp-trophy')}<div><h2 class="mp-name">${esc(C.pre ? C.name : 'Your own cup')}</h2><div class="mp-tl">${C.tracks.length} race${C.tracks.length === 1 ? '' : 's'}${own ? ` · ${CUP_MIN} to ${CUP_MAX} tracks` : ''}</div></div>${own && C.tracks.length ? '<button type="button" class="m-small" id="cupclear">Clear</button>' : ''}</div>
      <ol class="cup-run">${rows}</ol>
      <div class="mp-set">${seg('laps', 'Laps per race', [2, 3, 5].map(n => [n, n, plural(n, 'lap')]), setup.laps)}${driftSwitch()}</div>
      <p class="mp-rules">Same racers, laps and bots every race. Points per place: <b>${CUP_POINTS[4].join(' / ')}</b> with 4 karts. From race 2 the leader starts at the back.</p>`;
    el.querySelectorAll('[data-drop]').forEach(b => b.onclick = () => { const n = +b.dataset.drop; say(`${TRACKS[C.tracks[n]].name} taken out`); setup.cupTracks.splice(n, 1); drawMap(s); });
    const cl = el.querySelector('#cupclear'); if (cl) cl.onclick = () => { setup.cupTracks = []; say('Your cup is empty'); drawMap(s); };
  } else {
    const ti = tt ? setup.ttTrack : setup.random ? -1 : setup.track, t = TRACKS[ti], clip = t && clipOf(t.name);
    const art = ti < 0 ? '<span class="rnd-face"><span>?</span></span>' : '<span class="mp-art" id="mpart"></span>';
    const best = !tt && t && loadBests()[t.name], fixed = t && lapsFixed(t);
    el.innerHTML = `<div class="mp-pic">${art}</div>
      <div class="mp-text"><h2 class="mp-name">${ti < 0 ? 'Random' : esc(t.name)}${fixed ? `<span class="lapfix">${fixed.toUpperCase()}</span>` : ''}</h2>
        <p class="mp-tl">${ti < 0 ? 'A different track every race: picked when you press START.' : esc(tagline(t))}</p>
        ${ti < 0 ? '' : `<details class="mp-more"${moreOpen() ? ' open' : ''}><summary>How it plays</summary><p class="mp-d">${esc(details(t))}</p>${frontrunHTML(t) ? `<div class="mp-fr">${frontrunHTML(t)}</div>` : ''}</details>`}
        ${clip ? `<p class="mp-clip">${esc(clip.text)} <button type="button" class="clip-go" id="mclip">Watch how</button></p>` : ''}
        ${best && best.lap ? `<p class="mp-best">Your best ${t.open ? 'stage' : 'lap'}: <b>${fmtTime(best.lap)}</b></p>` : ''}</div>
      ${tt ? '<div class="mp-tt" id="mptt"></div>' : ''}
      <div class="mp-set">${tt ? '' : fixed ? `<div class="m-set"><span class="lbl">Laps</span><span class="mp-fixed">Always ${fixed}</span></div>` : seg('laps', t && t.open ? 'Stages' : 'Laps', [2, 3, 5].map(n => [n, n, plural(n, 'lap')]), setup.laps)}${driftSwitch()}</div>`;
    if (ti >= 0) { const a = el.querySelector('#mpart'); a.appendChild(miniTrack(t, 480, 288)); }
    const mo = el.querySelector('.mp-more'); if (mo) mo.ontoggle = () => { moreState = mo.open; };
    const cb = el.querySelector('#mclip'); if (cb) cb.onclick = () => openClip(t.name);
    if (tt) ttBox(el.querySelector('#mptt'));
  }
  el.querySelectorAll('[data-seg="laps"]').forEach(b => b.onclick = () => { setup.laps = +b.dataset.v; say(plural(setup.laps, 'lap')); drawPreview(s); drawFoot(s); saveSetup(); });
  const d = el.querySelector('#mdrift'); if (d) d.onchange = () => { settings.drift = d.checked; saveSettings(); say(`Drift ${d.checked ? 'on' : 'off'}`); drawPreview(s); };
  fillMinis(el);
  if (fk) { const f = el.querySelector(fk); if (f) f.focus({ preventScroll: true }); }
}
// a track's full text and its front-runner meter: open where there's room for them, folded on a phone (and as you left it)
let moreState = null;
const moreOpen = () => moreState ?? (setup.mode !== 'tt' && !matchMedia('(max-width: 640px), (max-height: 560px)').matches);   // (a time trial: folded, its records first)
// the focused control in the preview, to give it the focus back after a redraw
function focusKey() {
  const a = document.activeElement; if (!a || !a.closest || !a.closest('#mpre')) return null;
  return a.id ? '#' + a.id : a.dataset.seg ? `[data-seg="${a.dataset.seg}"][data-v="${a.dataset.v}"]` : a.dataset.drop ? '#cupclear' : null;
}
function drawFoot(s) {
  const m = setup.mode, cup = m === 'cup', tt = m === 'tt', C = cup && curCup(), picks = tt ? [setup.picks[0]] : setup.picks.slice(0, setup.humans);
  const sum = s.querySelector('#msum'), st = s.querySelector('#start'), hint = s.querySelector('#mhint');
  sum.innerHTML = `<span class="ms-ports">${picks.map(ci => `<i data-port="${ci}"></i>`).join('')}</span><span class="ms-t"><b>${esc(picks.map(ci => CHARACTERS[ci].name).join(', '))}</b><small>${tt ? 'alone · no items · no obstacles' : `${setup.bots ? `+ ${plural(setup.bots, 'bot')} · ${SKILL[setup.aiLevel]}` : 'no bots'}`}</small></span>`;
  sum.setAttribute('aria-label', `Racers: ${picks.map(ci => CHARACTERS[ci].name).join(', ')}. Change the racers`);
  sum.querySelectorAll('[data-port]').forEach(el => el.appendChild(portrait(CHARACTERS[+el.dataset.port])));
  st.textContent = tt ? 'START TRIAL' : cup ? 'START CUP' : 'START RACE';
  st.disabled = !!(cup && !C.ok);
  hint.innerHTML = cup && !C.ok ? `Pick a cup, or ${C.need} more track${C.need > 1 ? 's' : ''} for yours` : '<span class="kb-only">or press <kbd>Enter</kbd></span>';
}
// START: the race, the cup or the time trial, as set
function start() {
  sfx.ensure();
  const m = setup.mode; menu.raced = true;
  if (m === 'tt') return startTimeTrial();
  if (m === 'single') return startRace();
  if (m === 'cup') { const C = curCup(); if (C.ok) startCup(C.tracks, C.pre ? C.pre.name : 'Custom Cup'); }
}

// ---------------------------------------------------------------- online: your name, host or join
function onlineScreen(s) {
  s.innerHTML = `${topBar('Host or join a room')}<div class="m-body online kk"><div class="panel m-online" id="online"></div></div>`;
  mountOnline(s.querySelector('#online'));
  s.querySelectorAll('.net-way').forEach((w, i) => w.insertAdjacentHTML('afterbegin', `<span class="nw-stage kk-stripes"><canvas data-art="${i ? 'online' : 'host'}" aria-hidden="true"></canvas></span>`));   // (each way's little scene, home-art.js)
  homeArt(s, { ch: CHARACTERS[setup.netPick | 0] });
  const h = s.querySelector('#netHost'); if (h) h.dataset.first = '';
  bgTrack(setup.track);
}

// ---------------------------------------------------------------- How to play
const TABS = [['play', 'Driving'], ['items', 'Items'], ['odds', 'Item odds'], ['fight', 'Fight']];
function howtoScreen(s) {
  const tab = TABS.some(([k]) => k === setup.learnTab) ? setup.learnTab : 'play', dr = settings.drift;
  const keys = `<kbd>Q</kbd> gas, <kbd>W</kbd> item${dr ? ', <kbd>E</kbd> drift' : ''} (or <kbd>Space</kbd>, <kbd>Enter</kbd>${dr ? ', <kbd>Shift</kbd>' : ''})`;
  s.innerHTML = `${topBar('How to play')}
    <div class="m-body howto"><div class="panel m-learn">
      <div class="m-tabs" role="tablist" aria-label="How to play">${TABS.map(([k, t]) => `<button type="button" role="tab" id="tab-${k}" aria-controls="pane-${k}" aria-selected="${k === tab}" tabindex="${k === tab ? 0 : -1}"${k === tab ? ' data-first' : ''}>${t}</button>`).join('')}</div>
      <div class="m-pane" role="tabpanel" id="pane-play" aria-labelledby="tab-play"${tab === 'play' ? '' : ' hidden'}>
        <ul class="ln-list">
          <li><b>Hold GAS to go, let go to slow down.</b> The kart steers itself: lift earlier for a tighter line; too fast and you run off onto the grass.</li>
          <li><b>ITEM fires what you're holding.</b> Drive through a <b>?</b> box to grab one; you can carry two.</li>
          <li><b>Hold DRIFT to slide.</b> The kart drifts toward the inside of the next corner: it grips harder and tucks in tighter, and on a straight it moves your line over to that side. It bleeds a little speed, and held too long near top speed it spins you out. Drift through a corner and the sparks go <b class="sp-b">blue</b>, <b class="sp-o">orange</b>, then <b class="sp-p">purple</b>: let go for a mini-turbo, bigger each colour. ${dr ? 'It\'s on: turn it off in <b>Settings</b> for the classic two-button game.' : '<b>It\'s off right now</b> (Settings): the classic two-button game.'}</li>
          <li><b>Draft</b> close behind someone for free speed. On a ramp, let go of the gas right at the lip for a trick and a boost.</li>
        </ul>
        <p class="help"><b>Keys</b>: one player ${keys}. Two to four players each get three keys, shown on their slot when you pick racers. On touch screens each player gets a zone with an item button and a drift button.</p>
        <p class="help">In a race <kbd>P</kbd> pauses (<kbd>Tab</kbd> with 2+ players), <kbd>Backspace</kbd> mutes and <kbd>Esc</kbd> goes back to the menu. On the menu <kbd>Esc</kbd> goes back a screen, <kbd>H</kbd> opens this, <kbd>S</kbd> Settings and <kbd>C</kbd> What's new.</p>
      </div>
      <div class="m-pane" role="tabpanel" id="pane-items" aria-labelledby="tab-items"${tab === 'items' ? '' : ' hidden'}><p class="help">The further back you are, the stronger the item. Fire it with your ITEM key.</p><div class="items" id="items"></div></div>
      <div class="m-pane" role="tabpanel" id="pane-odds" aria-labelledby="tab-odds"${tab === 'odds' ? '' : ' hidden'}>
        <p class="help">What a box gives you, by your place and how far you trail the leader. Pick a place and slide the distance.</p>
        <div class="row" style="margin-top:10px"><span class="lbl" id="oddsPlaceL">Place</span><span id="oddsPlace" class="seg" role="group" aria-labelledby="oddsPlaceL"></span></div>
        <div class="odds-gap"><input type="range" id="oddsGap" min="0" max="4000" step="50" aria-label="Distance behind the leader"><span id="oddsGapLbl"></span></div>
        <div class="odds" id="oddsBars"></div></div>
      <div class="m-pane" role="tabpanel" id="pane-fight" aria-labelledby="tab-fight"${tab === 'fight' ? '' : ' hidden'}>${fightHowto()}</div>
    </div></div>`;
  let oddsDraw = null;
  const fill = { items: () => {
    const it = s.querySelector('#items');
    for (const k of ITEM_ORDER) { const d = document.createElement('div'); d.className = 'item'; const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); g.translate(32, 32); drawItemIcon(g, k, 22); d.appendChild(withShadow(cv, 6, 4)); d.insertAdjacentHTML('beforeend', `<div><div class="n" style="color:${ITEMS[k].col}">${ITEMS[k].name}</div><div class="d">${ITEMS[k].desc}</div></div>`); it.appendChild(d); }
  }, odds: () => { oddsDraw = oddsChart(s); oddsDraw(); } };
  const open = k => {
    setup.learnTab = k; saveSetup();
    for (const [t] of TABS) { const b = s.querySelector('#tab-' + t), on = t === k; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; s.querySelector('#pane-' + t).hidden = !on; }
    if (fill[k]) { fill[k](); fill[k] = null; }
  };
  open(tab);
  const tl = s.querySelector('[role=tablist]'), tabs = [...tl.children];
  tabs.forEach(b => b.onclick = () => open(b.id.slice(4)));
  tl.onkeydown = e => {
    const i = tabs.indexOf(document.activeElement), j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key]; if (i < 0 || j == null) return;
    e.preventDefault(); e.stopPropagation(); const t = tabs[(j + tabs.length) % tabs.length]; t.focus(); open(t.id.slice(4));
  };
}

// ---------------------------------------------------------------- the menu's keys
// (none while a dialog is open or you're typing). Esc back; Enter goes on when the focus isn't on a control still to be
// picked; H How to play, S Settings, C What's new, / the map's search box; on the racers screen the players' own keys first
if (typeof document !== 'undefined') document.addEventListener('keydown', e => {
  if (game.state !== 'menu' || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.cl-back, .clip-back, .set-back')) return;
  const t = e.target, k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (t && t.closest && t.closest('input:not([type=checkbox]):not([type=range]), textarea, select')) { if (k === 'Escape') { e.preventDefault(); t.blur(); } return; }
  if (e.repeat && k !== 'ArrowLeft' && k !== 'ArrowRight') return;
  const v = menu.view;
  if (v === 'racers' && k.length === 1 && racerKey(k)) { e.preventDefault(); e.stopPropagation(); return; }
  if (k === 'Escape') { if (v !== 'home') { e.preventDefault(); goBack(); } return; }
  if (k === 'Enter') {
    const ctl = t && t.closest ? t.closest('button, a, input, [role=button], [role=tab]') : null;
    if (ctl && !(ctl.getAttribute('aria-pressed') === 'true' && ctl.closest('.roster, .mgrid, .mcups'))) return;   // (the control's own Enter)
    const go2 = v === 'home' ? null : v === 'racers' ? document.getElementById('next') : v === 'track' ? document.getElementById('start') : v === 'fight' ? document.getElementById('fstart') : null;
    if (go2 && !go2.disabled) { e.preventDefault(); e.stopPropagation(); go2.click(); }   // (stopped: the loading screen's own Enter mustn't get this press too)
    return;
  }
  if (k === '/' && v === 'track') { const i = document.getElementById('msearch'); if (i && i.offsetParent) { e.preventDefault(); i.focus(); i.select(); } }   // the map's search box
  else if (k === 'h') { e.preventDefault(); if (v !== 'howto') showView('howto'); }
  else if (k === 's') { e.preventDefault(); openSettings(() => { if (game.state === 'menu') showView(menu.view, 0); }); }
  else if (k === 'c') { e.preventDefault(); openChangelog(); }
});
