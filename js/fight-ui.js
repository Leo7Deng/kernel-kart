// Kernel Kart: Fight mode's screens (js/fight.js is the sim, draw-fight.js draws it). Keyboard and gamepad only (the
// user's call: no touch controls; on a touch-only device the home tile is greyed out with a note).
//   setup    the menu's Fight screen (menu.js view 'fight'), a fighting game's select screen: a showcase per side (P1
//            left, P2 right: a player or a bot (Chill, Normal, Ruthless), their fighter big on a spotlit stage in the
//            side's colour with its name plate, tabs: Fighter (blurb, stats as bars: Health, Weight, Speed, Power, Reach,
//            passive), Moves (every move: key, kind, name; click for its clip, fight-moves.js; Tux's and Duke's three
//            moves and evade each with its icon, and in the close-up its tell and its answer), Keys (drawn as on the
//            keyboard, with the moves' names)); in the middle a big VS, the roster (FIGHT_ORDER: Tux and Duke since
//            2026-10-23; the other eight greyed, 'soon') with each side's cursor in its colour (moved by that player's keys, or clicked), the map (a card per
//            arena, fight-arenas.js, a top-down thumbnail drawn from its data), Supers On/Off; FIGHT. Saved in kk-setup
//            (ui.js setup.fightIds, fightBots, fightSupers, fightArena)
//   flow     game.state 'fight': main.js calls fightFrame every frame (the fight's update and drawing). Esc, P or a pad's
//            Start pauses (Resume, Restart, Quit); the page hidden pauses too. When it's over: the results card over the
//            arena (the winner on a stage, the score and the rounds, the numbers as head-to-head bars) with Rematch and Back
//   input    held booleans each frame for each human ({ x, y, light, heavy, special, guard }; the sim sees the
//            presses: Guard alone blocks, Guard with a direction held steps), from keys by e.code (fight-keys.js: 'solo' for one human, 'p1' and 'p2' for two on one keyboard)
//            and the gamepads (the nth pad is the nth human). Under each human's HUD card the keys (or the pad) they use,
//            lighting up as they're held
//   sound    from the fight's events (audio.js f* sounds), and the big beats on draw-moments.js's clock (the round intro,
//            3-2-1, the start, a KO, a round won, the match won)
//   #fight   dev hook: index.html#fight[=<level>] starts a bot-vs-bot fight at once (&time=<round s>, &humans=1|2,
//            &supers=0, &seed=<n>, &arena=<id>, &look=flat|classic, &at=<s> to jump that far in, &stop=<event kind> to stop there,
//            &ph=<a move's phase> to stop once someone's in it (Tux and Duke's: crouch, high, gone, snap, throw ...),
//            &gh=<x> to stop only when the one hit has under x of their stamina, &stam=<0..1> to tire both that far at
//            the stop, &zoom=<px per unit> for a close camera, &hold=<frames> to play that many more and
//            freeze, &pause, &ids=<id>,<id> for the two fighters); #fight=setup opens the setup screen (&ids too)
import { Fight } from './fight.js';
import { ARENAS, ARENA_ORDER } from './fight-arenas.js';
import { drawArenaThumb } from './draw-arena.js';
import * as FC from './fight-chars.js';
import { drawFight, drawKeys, drawLegend, fightEvents, fightHead, fightIcon, fightTick, hudScale, keysSize, kit3, legendSize, starPath, stamOf } from './draw-fight.js';
import { INTRO_COUNT, portSize } from './draw-moments.js';
import * as M3 from './art/model3d.js';
import { drawMascot } from './art.js';
import { sfx } from './audio.js';
import { ART } from './art/kits.js';
import { CHARACTERS, PCOL, TAU } from './core.js';
import { Input } from './input.js';
import { CODES, LAYOUTS, keyLabel as keyLabelOf, keysHeld, layoutFor, padHeld, pads, toInput } from './fight-keys.js';
import { newStats, tally } from './fight-stats.js';
import { MOVE_ORDER, makeClip, moveAnswer, moveDesc, moveHold, moveKeys, moveKind, moveName, moveOrder, moveTell, runClips, stopClips } from './fight-moves.js';
import { settings, saveSettings } from './settings.js';
import { bold, setLook } from './look.js';
import { applyLook, clearForRace, esc, game, saveSetup, setMode, setup, showMenu } from './ui.js';

const LEVELS = ['Chill', 'Normal', 'Ruthless'];
const order = () => FC.FIGHT_ORDER || Object.keys(FC.FIGHTERS);
const charOf = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
const soonIds = () => (FC.FIGHT_SOON || CHARACTERS.map(c => c.id)).filter(id => !order().includes(id) && CHARACTERS.some(c => c.id === id));
const STAT = { hp: 'Health', weight: 'Weight', walk: 'Speed', power: 'Power', reach: 'Reach' };
export const fightTileIcon = `<svg class="trophy" viewBox="0 0 48 48" aria-hidden="true"><g transform="rotate(-12 24 24)">
  <path d="M15 31c-3.5-4.2-4.6-10.4-1.6-15.6C16.6 9.6 23 6.6 29.6 7.4 37 8.3 41.4 14 40.6 21c-.7 6.2-4.8 10.4-10.2 11.2L29.6 35H16.4z" fill="#ff4d3a"/>
  <path d="M14.6 20.6c-4-.6-7 1.8-6.6 5.2.4 3.2 3.6 5.2 7.6 4.2l3.4-1" fill="#e5352a"/>
  <path d="M22.5 18.5c3.5-2 8-2.2 11.5-.4" fill="none" stroke="#c42a22" stroke-width="2.2" stroke-linecap="round"/>
  <ellipse cx="22" cy="13.5" rx="5.5" ry="2.8" fill="#ff8f80" transform="rotate(-24 22 13.5)"/>
  <rect x="15" y="33.5" width="16" height="9.5" rx="2.6" fill="#fff"/><path d="M19 36.5h8M19 39.8h8" stroke="#d9d5ec" stroke-width="1.6" stroke-linecap="round"/></g></svg>`;

// ---------------------------------------------------------------- the picks (setup.fight*: kept sane whatever was saved)
function picks() {
  const ids = order();
  if (!Array.isArray(setup.fightIds) || setup.fightIds.length !== 2) setup.fightIds = [ids[0], ids[1] || ids[0]];
  setup.fightIds = setup.fightIds.map((id, i) => ids.includes(id) ? id : ids[i % ids.length]);
  if (!Array.isArray(setup.fightBots) || setup.fightBots.length !== 2) setup.fightBots = [null, 1];
  setup.fightBots = setup.fightBots.map(b => b === null || [0, 1, 2].includes(b) ? b : 1);
  if (typeof setup.fightSupers !== 'boolean') setup.fightSupers = true;
  if (setup.fightArena !== 'random' && !ARENA_ORDER.includes(setup.fightArena)) setup.fightArena = ARENA_ORDER[0];
  return { ids: setup.fightIds, bots: setup.fightBots, supers: setup.fightSupers, arena: setup.fightArena };
}
const humanCount = bots => bots.filter(b => b == null).length;
// any pickable fighter with a super (Tux and Duke have none since 2026-10-23: then the Supers switch isn't shown)
const anySupers = () => order().some(id => FC.FIGHTERS[id] && FC.FIGHTERS[id].moves && FC.FIGHTERS[id].moves.super);
const four = () => order().every(id => kit3(id));   // (everyone pickable has three moves and an evade: the four-button rules)

// a fighter's numbers as 0..1 bars (fixed scales, so a new fighter lands where it belongs)
function moveOf(st, k) { const m = st.moves || {}; return m[k] || m[k + '1'] || Object.entries(m).find(([n]) => n.startsWith(k))?.[1] || null; }
function bars(st) {
  if (st.bars) { const b = st.bars; return { hp: b.health, weight: b.weight, walk: b.speed, power: b.power, reach: b.reach }; }   // (fight-chars.js's own)
  const hv = moveOf(st, 'heavy') || {}, reach = Math.max(...['light', 'heavy', 'throw'].map(k => (moveOf(st, k) || {}).reach || 0));
  const power = (hv.damage || 10) / 18 * 0.5 + (hv.kb || 300) / 480 * 0.5;
  const v = { hp: st.hp / 140, weight: (st.weight || 1) / 1.45, walk: (st.walk || st.speed || 1) / 1.35, power, reach: (reach || 40) / 80 };
  for (const k in v) v[k] = Math.max(0.08, Math.min(1, v[k]));
  return v;
}
// touch-only devices can't play Fight (no fine pointer and no pad): the home tile says so
export const fightPlayable = () => typeof matchMedia === 'undefined' || matchMedia('(pointer: fine)').matches || pads().length > 0;

// ---------------------------------------------------------------- the setup screen (menu.js view 'fight')
export function fightQuick() {
  const p = picks(), n = p.ids.map(id => FC.FIGHTERS[id].name || charOf(id).name);
  return { label: 'Fight again', what: `${esc(n[0])} vs ${esc(n[1])} · ${esc(mapName(p.arena))}${p.bots.some(b => b != null) ? ` · bot ${LEVELS[p.bots.find(b => b != null)]}` : ''}` };
}
export function fightScreen(s, top) {
  picks();
  const rules = four() ? 'Best of 3 rounds, 60 s each. Knock their health to zero. Each fighter has three big moves and an evade, one key each; every one has a cooldown. Each move has a tell (a line, a shadow, a mark, a ring): read it and get out of the way, or evade it. Hit them while they wind up (a counter) for more. Big hits and wall slams knock them down. When the clock runs out, every hit does more and more damage.'
    : 'Best of 3 rounds, 60 s each. Knock their health to zero. Guard blocks what comes at your front; Guard with a direction steps. Every attack, block and step costs stamina: run out and you are slow and a blocked hit staggers you. Catch them winding up (a counter) or hit them from the side or behind (a flank) for more. Big hits, finishers on a counter and wall slams knock them down. When the clock runs out, every hit does more and more damage.';
  s.innerHTML = `${top}<div class="m-body fsetup fsx"><div class="fs-arena">
      <div class="fs-side" id="fside0"></div>
      <div class="fs-mid">
        <div class="fs-vsbig" aria-hidden="true"><span>V</span><span>S</span></div>
        <div class="fs-roster" role="group" aria-label="Fighters" style="--n:${Math.min(5, order().length + soonIds().length)}">${order().map(fid => `<button type="button" class="fs-tile" data-tile="${fid}" title="${esc(FC.FIGHTERS[fid].name || fid)}" aria-label="${esc(FC.FIGHTERS[fid].name || fid)}"><canvas data-head="${fid}" width="128" height="128" aria-hidden="true"></canvas><span class="fs-tn">${esc(FC.FIGHTERS[fid].name || fid)}</span><i class="fs-cur c0" aria-hidden="true">P1</i><i class="fs-cur c1" aria-hidden="true">P2</i></button>`).join('')}${soonIds().map(sid => `<button type="button" class="fs-tile soon" disabled title="${esc(charOf(sid).name)}: soon" aria-label="${esc(charOf(sid).name)}: soon"><canvas data-head="${sid}" width="128" height="128" aria-hidden="true"></canvas><span class="fs-tn">${esc(charOf(sid).name)}</span><i class="fs-soon" aria-hidden="true">soon</i></button>`).join('')}</div>
        <p class="fs-rhint" id="frhint"></p>
        <div class="fs-opts">
          <div class="fs-oh"><span class="fs-ol">Map</span>${anySupers() ? `<label class="m-set m-switch fs-sup"><span class="lbl">Supers</span><input type="checkbox" class="switch" id="fsupers"${setup.fightSupers ? ' checked' : ''}><span class="m-sw-t">${setup.fightSupers ? 'On' : 'Off'}</span></label>` : ''}</div>
          <div class="fs-maps" role="group" aria-label="Map">${['random', ...ARENA_ORDER].map(id => `<button type="button" class="fs-map" data-arena="${id}" aria-pressed="${id === setup.fightArena}" title="${esc(id === 'random' ? 'A different map each time you press FIGHT (Rematch keeps it)' : ARENAS[id].blurb)}"><canvas width="120" height="80" aria-hidden="true"></canvas><span>${esc(mapName(id))}</span></button>`).join('')}</div>
          <p class="help fs-rules" title="${esc(rules)}">${four() ? 'Best of 3 · 60 s rounds · three moves and an evade · read the tells' : 'Best of 3 · 60 s rounds · block the front, step round it · stamina'}</p>
        </div>
      </div>
      <div class="fs-side" id="fside1"></div>
    </div></div>
    <footer class="m-foot"><div class="m-sum" id="fsum"></div><div class="m-go-wrap"><button type="button" class="big m-go" id="fstart" data-first>FIGHT</button><div class="m-hint"><span class="kb-only">or press <kbd>Enter</kbd></span></div></div></footer>`;
  if (s.querySelector('#fsupers')) s.querySelector('#fsupers').onchange = e => { setup.fightSupers = e.target.checked; e.target.parentElement.querySelector('.m-sw-t').textContent = e.target.checked ? 'On' : 'Off'; saveSetup(); };
  s.querySelector('#fstart').onclick = () => startFightFromSetup();
  s.querySelectorAll('.fs-map').forEach(b => {
    const cv = b.querySelector('canvas'), D = Math.min(2, devicePixelRatio || 1), g = cv.getContext('2d');
    cv.width = 120 * D; cv.height = 80 * D; g.setTransform(D, 0, 0, D, 0, 0);
    if (b.dataset.arena === 'random') randomThumb(g, 120, 80); else drawArenaThumb(g, ARENAS[b.dataset.arena], 120, 80, PCOL);
    b.onclick = () => { setup.fightArena = b.dataset.arena; saveSetup(); sfx.play('click'); s.querySelectorAll('.fs-map').forEach(x => x.setAttribute('aria-pressed', x === b)); sumUp(s); };
  });
  // the roster: a click picks for the side in focus (P1 at first; click a side's card to switch), a right-click for the other
  const ros = s.querySelector('.fs-roster');
  ros.querySelectorAll('canvas[data-head]').forEach(drawHeadCanvas);
  ros.querySelectorAll('[data-tile]').forEach(b => {
    b.onclick = () => pickSide(s, mouseSide, b.dataset.tile);
    b.oncontextmenu = e => { e.preventDefault(); pickSide(s, 1 - mouseSide, b.dataset.tile); };
  });
  drawSlots(s);
  stageLoop();
}
// which side a mouse click on the roster picks for (the card last clicked; P1 at first)
let mouseSide = 0;
const paneOf = ['info', 'info'];   // each card's open tab (Fighter, Moves, Keys), kept while picking
function pickSide(s, i, id) {
  if (setup.fightIds[i] === id) { popStage(i); return; }
  setup.fightIds[i] = id; saveSetup(); popStage(i); sfx.play('fPick', 0.8); drawSlots(s);
}
function drawSlots(s) {
  const p = picks(), H = humanCount(p.bots);
  const info = i => { const L = p.bots[i] == null ? layoutFor(p.bots.slice(0, i).filter(x => x == null).length, H) : 'solo'; return { id: p.ids[i], L, col: PCOL[i], whose: p.bots[i] == null ? (H > 1 ? `P${i + 1}'s keys` : 'your keys') : 'one-player keys' }; };
  [0, 1].forEach(i => {
    const box = s.querySelector('#fside' + i), { id, L, whose } = info(i);
    const who = [['h', 'Player'], ...LEVELS.map((l, k) => [String(k), l])];
    const cur = p.bots[i] == null ? 'h' : String(p.bots[i]);
    box.innerHTML = fighterCard(i, id, { L, whose, cls: mouseSide === i ? 'fs-on' : '',
      head: `<b class="fs-p">P${i + 1}</b><span class="seg" role="group" aria-label="P${i + 1}: player or bot">${who.map(([v, t]) => `<button type="button" data-who="${i}" data-v="${v}" aria-pressed="${v === cur}"${v === cur ? ' class="sel"' : ''}>${v === 'h' ? t : `<i class="fs-bot">BOT</i>${t}`}</button>`).join('')}</span>`,
      keys: p.bots[i] == null ? keyBoard(L, id, PCOL[i]) : '' });
    wireCards(box, { info, pick: () => { } });
    box.querySelectorAll('[data-who]').forEach(b => b.onclick = () => { const i = +b.dataset.who; setup.fightBots[i] = b.dataset.v === 'h' ? null : +b.dataset.v; saveSetup(); sfx.play('click'); drawSlots(s); });
    box.querySelector('.fs-slot').addEventListener('pointerdown', () => { if (mouseSide !== i) { mouseSide = i; s.querySelectorAll('.fs-side .fs-slot').forEach((c, k) => c.classList.toggle('fs-on', k === i)); markRoster(s); } });
  });
  markRoster(s); sumUp(s);
}
// the roster's cursors: each side's pick marked in its colour (the side a click picks for, brighter)
function markRoster(s) {
  const p = picks(), H = humanCount(p.bots);
  s.querySelectorAll('[data-tile]').forEach(b => {
    const a = p.ids[0] === b.dataset.tile, c = p.ids[1] === b.dataset.tile;
    b.classList.toggle('p0', a); b.classList.toggle('p1', c); b.setAttribute('aria-pressed', a || c);
  });
  const ros = s.querySelector('.fs-roster'); if (ros) ros.dataset.on = mouseSide;
  const hint = s.querySelector('#frhint'), kb = t => `<kbd>${t}</kbd>`, sideOf = i => `<b style="color:${PCOL[i]}">P${i + 1}</b>`;
  if (hint) hint.innerHTML = H === 2 ? `${sideOf(0)} ${kb('W')}${kb('A')}${kb('S')}${kb('D')} · ${sideOf(1)} ${kb('↑')}${kb('←')}${kb('↓')}${kb('→')} · click: ${sideOf(mouseSide)} · right-click: ${sideOf(1 - mouseSide)}`
    : H === 1 ? `${sideOf(p.bots[0] == null ? 0 : 1)} ${kb('W')}${kb('A')}${kb('S')}${kb('D')} or arrows · click: ${sideOf(mouseSide)} · right-click: ${sideOf(1 - mouseSide)}`
    : `${sideOf(0)} ${kb('W')}${kb('A')}${kb('S')}${kb('D')} · ${sideOf(1)} arrows · click: ${sideOf(mouseSide)} · right-click: ${sideOf(1 - mouseSide)}`;
}
function sumUp(s) {
  const p = picks(), sum = s.querySelector('#fsum');
  if (sum) sum.innerHTML = `<span class="ms-t"><b>${p.ids.map(id => esc(FC.FIGHTERS[id].name || id)).join(' vs ')}</b><small>${esc(mapName(p.arena))} · ${p.bots.map((b, i) => b == null ? `P${i + 1} player` : `P${i + 1} bot · ${LEVELS[b]}`).join(' · ')}</small></span>`;
}
// the roster's keys on the setup screen: each player moves their own cursor (two on one keyboard: P1 WASD, P2 the arrows;
// one human: WASD or the arrows; bots only: WASD P1, arrows P2). Left/right step along, up/down a row; wraps round
function rosterKey(e) {
  const s = document.querySelector('.fsx'); if (!s) return false;
  const DIR = { KeyW: [0, -1], KeyA: [0, -1, 1], KeyS: [0, 1], KeyD: [0, 1, 1], ArrowUp: [1, -1], ArrowLeft: [1, -1, 1], ArrowDown: [1, 1], ArrowRight: [1, 1, 1] }[e.code];
  if (!DIR) return false;
  const p = picks(), H = humanCount(p.bots), ids = order(), cols = 5;
  const side = H === 1 ? (p.bots[0] == null ? 0 : 1) : DIR[0];
  const at = ids.indexOf(p.ids[side]), n = ids.length, d = DIR[1] * (DIR[2] ? 1 : cols);
  let j = at + d;
  if (!DIR[2]) j = ((j % n) + n) % n; else j = (j + n) % n;
  pickSide(document, side, ids[j]);
  return true;
}
// ---------------------------------------------------------------- one fighter's card (the setup screen's, and the online
// room's, net-ui.js): i the side (0 P1, 1 P2: its colour PCOL[i], unless o.col), id the fighter; o = { head (the card's
// top row, HTML), edit (a pick strip of every fighter on the card itself: the room's; the setup screen has one roster
// for both), L (the keys the moves show), whose (whose keys those are), keys (HTML for the Keys tab: keyBoard; a foot
// that is a keyBoard goes there too), foot (HTML under the tabs), cls }. A showcase: the fighter big on its stage with
// its name plate, then tabs: Fighter (blurb, stat bars, passive), Moves (the rows: key, kind, name; click for the clip),
// Keys. Its stage turns while it's on screen (stageLoop)
export const VS = '<div class="fs-vs" aria-hidden="true">VS</div>';
export function fighterCard(i, id, o = {}) {
  const st = FC.FIGHTERS[id], ch = charOf(id), b = bars(st), col = o.col || PCOL[i], L = o.L || 'solo';
  let keys = o.keys, foot = o.foot || '';
  if (keys == null && foot.includes('class="fs-kb"')) { keys = foot; foot = ''; }
  const tabs = [['info', 'Fighter'], ['moves', 'Moves'], ...(keys ? [['keys', 'Keys']] : [])], on = tabs.some(t => t[0] === paneOf[i]) ? paneOf[i] : 'info';
  return `<section class="fs-slot fs-show${o.cls ? ' ' + o.cls : ''}" style="--pc:${col}" aria-label="P${i + 1}" data-side="${i}">
      ${o.head ? `<header class="fs-h">${o.head}</header>` : ''}
      <div class="fs-stagebox"><canvas class="fs-stage" data-i="${i}" data-fid="${esc(id)}" aria-hidden="true"></canvas>
        <div class="fs-plate"><h3 class="fs-n">${esc(st.name || ch.name)}</h3><small>${esc(st.lang || '')}${st.role ? ` · ${esc(st.role)}` : ''}</small></div></div>
      ${o.edit ? `<div class="fs-pick" role="group" aria-label="P${i + 1}'s fighter">${order().map(fid => `<button type="button" class="fs-f" data-pick="${i}" data-id="${fid}" aria-pressed="${fid === id}" title="${esc(FC.FIGHTERS[fid].name || fid)}" aria-label="${esc(FC.FIGHTERS[fid].name || fid)}"><canvas data-head="${fid}" width="96" height="96"></canvas></button>`).join('')}
        ${soonIds().length ? `${soonIds().map(sid => `<button type="button" class="fs-f soon" disabled title="${esc(charOf(sid).name)}: soon" aria-label="${esc(charOf(sid).name)}: soon"><canvas data-head="${sid}" width="64" height="64"></canvas></button>`).join('')}` : ''}</div>` : ''}
      <div class="fs-tabs" role="tablist">${tabs.map(([k, t]) => `<button type="button" role="tab" data-tab="${k}" data-side="${i}" aria-selected="${k === on}"${k === on ? ' class="sel"' : ''}>${t}</button>`).join('')}</div>
      <div class="fs-panes">
        <div class="fs-pane" data-pane="info"${on === 'info' ? '' : ' hidden'}><p class="fs-blurb">${esc(st.blurb || '')}</p>
          <div class="fs-stats">${Object.entries(STAT).map(([k, l]) => `<span class="fs-sl">${l}</span><span class="fs-bar"><i style="width:${Math.round(b[k] * 100)}%"></i></span>`).join('')}</div>
          ${st.passive ? `<p class="fs-pass"><b>Passive</b> ${esc(st.passive)}</p>` : ''}</div>
        <div class="fs-pane" data-pane="moves"${on === 'moves' ? '' : ' hidden'}><p class="fs-smh">${esc(o.whose || 'one-player keys')} · click one to watch it</p>
          <div class="fs-mlist">${moveRows(i, id, L)}</div></div>
        ${keys ? `<div class="fs-pane" data-pane="keys"${on === 'keys' ? '' : ' hidden'}>${keys}</div>` : ''}
      </div>
      ${foot}
    </section>`;
}
// a human's keys drawn as on the keyboard, with what isn't drawn under it
export const keyBoard = (L, id, col) => `<div class="fs-kb"><canvas class="fs-kcv" data-layout="${L}" data-fid="${esc(id)}" data-col="${col}" aria-label="${esc(keysText(L))}"></canvas>
        <p class="fs-keys">${keysText(L, true)}</p></div>`;
const drawHeadCanvas = cv => { const g = cv.getContext('2d'), n = cv.width / 2, draw = () => { g.clearRect(0, 0, n * 2, n * 2); fightHead(g, charOf(cv.dataset.head), n, n, n - 3, null, null, 0.4, draw); }; draw(); };
// the cards' canvases and clicks: o = { info(i) -> { id, L, whose, col } (for a move's close-up), pick(i, id) (a fighter
// picked on an editable card) }
export function wireCards(box, o) {
  box.querySelectorAll('.fs-kcv').forEach(drawKeyCanvas);
  box.querySelectorAll('canvas[data-icon]').forEach(drawIconCanvas);
  box.querySelectorAll('canvas[data-head]').forEach(drawHeadCanvas);
  box.querySelectorAll('[data-mrow]').forEach(b => b.onclick = () => { sfx.play('click'); inspect(o.info(+b.dataset.mrow), b.dataset.k); });
  box.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { if (b.getAttribute('aria-pressed') === 'true') return; sfx.play('click'); o.pick(+b.dataset.pick, b.dataset.id); });
  box.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {   // the card's tabs (kept per side while picking)
    const i = +b.dataset.side, card = b.closest('.fs-slot'); paneOf[i] = b.dataset.tab; sfx.play('click');
    card.querySelectorAll('[data-tab]').forEach(x => { const on = x === b; x.classList.toggle('sel', on); x.setAttribute('aria-selected', on); });
    card.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== b.dataset.tab; });
  });
  warm(order());   // (both: the move clips show the other one too)
  stageLoop();
}
// a player's keys as text (for screen readers, and under the drawing: what isn't drawn)
function keysText(L, short) {
  const K = LAYOUTS[L].keys, k = a => K[a].map(c => keyLabelOf(c)), kb = t => `<kbd>${esc(t)}</kbd>`;
  if (short) return LAYOUTS[L].note ? esc(LAYOUTS[L].note) + '.' : '';
  if (four()) return ['up', 'left', 'down', 'right'].map(a => `${a}: ${k(a).join(' or ')}`).join(', ') + `, moves: ${['light', 'heavy', 'special'].map(a => k(a).join(' or ')).join(', ')}, evade: ${k('guard').join(' or ')}`;
  return ['up', 'left', 'down', 'right', 'light', 'heavy', 'special', 'guard'].filter(a => K[a]).map(a => `${a}: ${k(a).join(' or ')}`).join(', ') + ', guard with a direction: step';
}
function drawKeyCanvas(cv) {
  const L = cv.dataset.layout, u = 30, sz = keysSize(L, u), D = Math.min(2, devicePixelRatio || 1), id = cv.dataset.fid, lg = kit3(id) ? legendSize(u) : null;
  const w = Math.max(sz.w, lg ? lg.w : 0), h = sz.h + 2 + (lg ? lg.h + 10 : 0);   // (Tux's and Duke's: the moves' names under the keys)
  cv.width = Math.ceil(w * D); cv.height = Math.ceil(h * D); cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const g = cv.getContext('2d'); g.setTransform(D, 0, 0, D, 0, 0); drawKeys(g, L, null, cv.dataset.col, u, 1, id);
  if (lg) { g.save(); g.translate(0, sz.h + 10); drawLegend(g, id, L, null, cv.dataset.col, u, 1, null); g.restore(); }
}
// a move's icon on a round chip in the side's colour (the move list's)
function drawIconCanvas(cv) {
  const g = cv.getContext('2d'), n = cv.width / 2, col = cv.dataset.col || PCOL[0];
  g.clearRect(0, 0, n * 2, n * 2); g.fillStyle = col; g.beginPath(); g.arc(n, n, n - 1, 0, TAU); g.fill();
  g.save(); g.translate(n, n); fightIcon(g, cv.dataset.icon, n * 0.62, '#ffffff'); g.restore();
}
// How to play's Fight tab (menu.js): the rules in short and every key
export function fightHowto() {
  if (four()) return fightHowto4();
  const kb = t => `<kbd>${esc(t)}</kbd>`, row = (L, who) => { const K = LAYOUTS[L].keys, k = a => K[a].map(c => kb(keyLabelOf(c))).join(' '); return `<li><b>${who}</b>: ${k('up')}${k('left')}${k('down')}${k('right')} move, ${k('light')} light, ${k('heavy')} heavy (hold to charge), ${k('special')} special, ${k('guard')} block, ${k('guard')} with a direction held: step</li>`; };
  return `<ul class="ln-list"><li><b>Pick a map.</b> ${ARENA_ORDER.map(id => `<b>${esc(ARENAS[id].name)}</b>: ${esc(ARENAS[id].blurb)}`).join(' ')}</li><li><b>1v1, health only.</b> Knock their health to zero to win the round. Best of 3 rounds. The arena's wall keeps everyone in: knock someone into it hard and they slam off it and go down. When the clock runs out it's sudden death: every hit does more damage, rising to triple, until someone goes down.</li>
    <li><b>Block the front, step round it.</b> Hold guard to block: your shield covers your front (the arc in your colour), and you move slowly and turn slowly while you hold it. A blocked hit only chips you. A hit from the side or behind gets past it. Guard with a direction held is a quick <b>step</b> that way: out of reach, or round a blocker to hit their side. Light or heavy during a step lunges.</li>
    <li><b>Stamina.</b> The bar under your health. Every attack, every step and every blocked hit costs some, and it grows back when you ease off. Missing costs a little more. Run out (it flashes and you pant) and you're slower, and the next hit you block staggers you open: keep the pressure on a turtle and they tire.</li>
    <li><b>Clean hits.</b> Hit someone while they wind up and it's a <b>counter</b>: more damage, a longer stagger. From the side it's a <b>flank</b>, from behind even more; the two add up. A fully charged heavy, a finisher on a counter or flank, or a hard wall slam <b>knocks them down</b>: they can't be hit lying there, then they get up (untouchable for a moment). When two attacks land at once both hit.</li>
    <li><b>Combos.</b> Light, light, finisher. A light that hits can go straight into a heavy or special (press it early: presses are remembered for a moment). The same move over and over gets weaker, and long combos stun less and less. Some wind-ups have armor and shrug off light hits (Tux's flop, Docky's container, any fully charged heavy, supers).</li>
    <li><b>Every fighter is different:</b> the setup screen shows each one's moves, passive and a clip of every move. With Supers on, a full meter turns special into your Super.</li></ul>
    <p class="help"><b>Keys</b> (a keyboard or a gamepad: Fight has no touch controls)</p><ul class="ln-list">${row('solo', 'One player')}${row('p1', 'Two players, P1')}${row('p2', 'Two players, P2')}
    <li><b>Gamepad</b>: stick or d-pad move, ${kb('A')} light, ${kb('X')} heavy, ${kb('B')} special, ${kb('LB')} / ${kb('RB')} block (with the stick: step), ${kb('Start')} pause</li></ul>
    <p class="help">${kb('Esc')} or ${kb('P')} pauses. The setup screen shows every move with a little clip.</p>`;
}
// How to play for the four-button rules (Tux and Duke since 2026-10-23: three big moves and an evade each, no shield, no
// stamina): the rules, then each fighter's moves with their tells and answers, then the keys
function fightHowto4() {
  const kb = t => `<kbd>${esc(t)}</kbd>`, row = (L, who) => { const K = LAYOUTS[L].keys, k = a => K[a].map(c => kb(keyLabelOf(c))).join(' '); return `<li><b>${who}</b>: ${k('up')}${k('left')}${k('down')}${k('right')} move, ${k('light')} ${k('heavy')} ${k('special')} your three moves, ${k('guard')} your evade</li>`; };
  const fighter = id => { const st = FC.FIGHTERS[id]; return `<li><b>${esc(st.name)}</b> (${esc(st.lang || '')}): ${moveOrder(id).map(k => `<b>${esc(moveName(id, k))}</b> (${esc(moveDesc(id, k))}${moveTell(id, k) ? ` Tell: ${esc(moveTell(id, k))}` : ''}${moveAnswer(id, k) ? ` Answer: ${esc(moveAnswer(id, k))}` : ''})`).join('; ')}</li>`; };
  return `<ul class="ln-list"><li><b>Pick a map.</b> ${ARENA_ORDER.map(id => `<b>${esc(ARENAS[id].name)}</b>: ${esc(ARENAS[id].blurb)}`).join(' ')}</li><li><b>1v1, health only.</b> Knock their health to zero to win the round. Best of 3 rounds. The arena's wall keeps everyone in: knock someone into it hard and they slam off it and go down. When the clock runs out it's sudden death: every hit does more damage, rising to triple, until someone goes down.</li>
    <li><b>Three big moves and an evade.</b> No jabs and no shield: each fighter has three moves of their own, one key each, and an evade on the fourth. Every move and evade has a cooldown (its key sweeps back round as it comes back), so pick your moment. Some moves aim or steer while you hold the key.</li>
    <li><b>Read the tells.</b> Every big move shows it's coming: a line on the floor, a shadow, a mark behind you, a grey ring, a stain, lanes of loose earth, cracks, a ring of chains. Walk out of it, or evade it. Every move leaves its user open for a moment when it misses: punish that.</li>
    <li><b>Clean hits.</b> Hit someone while they wind up and it's a <b>counter</b>: more damage (a big sharp star). Big hits and hard wall slams <b>knock them down</b>: they can't be hit lying there, then they get up (untouchable for a moment).</li>
    <li><b>Who's who.</b> ${esc(order().map(id => FC.FIGHTERS[id].name).join(', ').replace(/, ([^,]*)$/, ' and $1'))} fight for now; the others are coming.</li></ul>
    <p class="help"><b>The fighters</b></p><ul class="ln-list">${order().map(fighter).join('')}</ul>
    <p class="help"><b>Keys</b> (a keyboard or a gamepad: Fight has no touch controls)</p><ul class="ln-list">${row('solo', 'One player')}${row('p1', 'Two players, P1')}${row('p2', 'Two players, P2')}
    <li><b>Gamepad</b>: stick or d-pad move, ${kb('A')} ${kb('X')} ${kb('B')} your three moves, ${kb('LB')} / ${kb('RB')} your evade, ${kb('Start')} pause</li></ul>
    <p class="help">${kb('Esc')} or ${kb('P')} pauses. The setup screen shows every move with a little clip, its tell and its answer.</p>`;
}
// the moves in plain words: what kind of move each is (the fighter's own name for it comes under)
const KINDS = { light: 'Quick attack', heavy: 'Big attack', charge: 'Charged big attack', special: 'Special', super: 'Super', guard: 'Block', step: 'Step', lunge: 'Step attack' };
const HOW = { light: 'tap', heavy: 'tap', charge: 'hold, let go', special: 'tap', super: 'tap, meter full', guard: 'hold', step: 'guard + a direction', lunge: 'during a step' };
const kcap = t => `<kbd>${esc(t)}</kbd>`;
// a three-move move's tab in the close-up: its name, short
const shortTab = (id, k) => { const m = FC.FIGHTERS[id] && FC.FIGHTERS[id].moves[k]; if (m && m.short) return m.short; const n = moveName(id, k); return n.length > 14 ? n.split(/[ ,]/)[0] : n; };   // (a move's own short name first: the plug-ins')
const keyCaps = (L, k, short) => moveKeys(L, k).filter(t => t !== 'hold').map((t, j, a) => t === '+' ? '<i class="fs-plus">+</i>' : kcap(short && a[j - 1] === '+' ? '↔' : t)).join('');   // (short: a step's directions as one arrow, in the list)
// a fighter's moves as a list in its card: the key big, what kind of move, its name; click one to watch it
function moveRows(i, id, L) {
  if (kit3(id)) return moveOrder(id).map(k => `<button type="button" class="fs-mrow fs-m4" data-mrow="${i}" data-k="${k}"><span class="fs-mkey">${keyCaps(L, k, true)}</span>
      <span class="fs-mic"><canvas data-icon="${esc((FC.FIGHTERS[id].moves[k] || {}).icon || '')}" data-col="${PCOL[i]}" width="56" height="56" aria-hidden="true"></canvas></span>
      <span class="fs-mtx"><b>${esc(moveName(id, k))}</b><small>${esc(moveKind(k))} · ${esc(moveHold(id, k))}</small></span><span class="fs-mgo" aria-hidden="true">›</span></button>`).join('');
  return MOVE_ORDER.map(k => `<button type="button" class="fs-mrow" data-mrow="${i}" data-k="${k}"><span class="fs-mkey">${keyCaps(L, k, true)}</span>
      <span class="fs-mtx"><b>${esc(KINDS[k])}</b><small>${esc(moveName(id, k))} · ${esc(HOW[k])}</small></span><span class="fs-mgo" aria-hidden="true">›</span></button>`).join('');
}
// one move up close: its clip big, the keys (and pad button), what it does; ← → or the tabs go through the others
function inspect(info, k0) {
  if (document.querySelector('.fs-ov')) return;
  const { id, L, whose, col } = info, st = FC.FIGHTERS[id], ORD = moveOrder(id), K4 = kit3(id), kindOf = k => K4 ? moveName(id, k) : KINDS[k];
  const back = document.createElement('div'); back.className = 'cl-back fs-ov';
  back.innerHTML = `<div class="panel cl-box fs-obox" role="dialog" aria-label="${esc(st.name)}'s moves" style="--pc:${col}">
    <div class="cl-head"><h2>${esc(st.name)}'s moves</h2><button type="button" class="cl-x" aria-label="Close">✕</button></div>
    <div class="fs-otabs" role="tablist">${ORD.map(k => `<button type="button" role="tab" data-ot="${k}">${esc(K4 ? shortTab(id, k) : KINDS[k])}</button>`).join('')}</div>
    <div class="fs-obody"><canvas class="fs-clip fs-oclip" aria-hidden="true"></canvas>
      <div class="fs-oinfo"><span class="fs-ck" id="fok"></span><h3 class="fs-on" id="fon"></h3>
        <div class="fs-okeys"><span class="fs-okl">Press</span><span id="fokey"></span><span class="fs-okl" id="fohow"></span></div>
        <p class="fs-od" id="fod"></p><p class="fs-otell" id="fotell" hidden><b>Tell</b> <span></span></p><p class="fs-oans" id="foans" hidden><b>Answer</b> <span></span></p><p class="fs-ohint">${esc(whose)} · <kbd>←</kbd> <kbd>→</kbd> other moves · <kbd>Esc</kbd> close</p></div></div></div>`;
  document.body.append(back);
  let cur = ORD.includes(k0) ? k0 : ORD[0];
  const q = sel => back.querySelector(sel), cv = q('.fs-oclip');
  const show = k => {
    cur = k; stopClips();
    for (const b of back.querySelectorAll('[data-ot]')) { const on = b.dataset.ot === k; b.classList.toggle('sel', on); b.setAttribute('aria-selected', on); }
    q('#fok').textContent = K4 ? moveKind(k) : KINDS[k]; q('#fon').textContent = moveName(id, k); q('#fod').textContent = moveDesc(id, k);
    q('#fokey').innerHTML = keyCaps(L, k); q('#fohow').textContent = K4 ? moveHold(id, k) : HOW[k];
    for (const [sel, txt] of [['#fotell', moveTell(id, k)], ['#foans', moveAnswer(id, k)]]) { const el = q(sel); el.hidden = !txt; el.querySelector('span').textContent = txt; }
    const c = makeClip(cv, id, k); if (c) runClips([c]);
  };
  back.querySelectorAll('[data-ot]').forEach(b => b.onclick = () => { sfx.play('click'); show(b.dataset.ot); });
  const shut = () => { stopClips(); back.remove(); document.removeEventListener('keydown', onKey, true); };
  const step = d => show(ORD[(ORD.indexOf(cur) + d + ORD.length) % ORD.length]);
  const onKey = e => {
    e.stopPropagation();
    if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); shut(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
  };
  document.addEventListener('keydown', onKey, true);
  q('.cl-x').onclick = shut; back.addEventListener('mousedown', e => { if (e.target === back) shut(); });
  show(cur); q('.cl-x').focus();
}
const warm = ids => { try { if (M3.queueFight3D) M3.queueFight3D(ids); else M3.queue3D(ids); } catch (e) { } };

// the fighters on their stages: the 3D model (2D without WebGL) big under a spotlight on a round plinth in its side's
// colour, turning a little, showing off a move now and then; just picked, it spins in with a hop, happy, a burst of
// speed lines off it
const stagePop = [-9, -9];
export const popStage = i => { stagePop[i] = performance.now() / 1000; };   // a fighter just picked on side i: it spins and hops
let stageRaf = 0;
const SHOW = ['stand', 'stand', 'wind', 'strike', 'stand', 'block', 'stand', 'strike'];
// Tux's and Duke's: their moves' keyframes (a cheer: picked, or the results' fist pump)
const SHOW3 = { tux: ['stand', 'crouch', 'stand', 'summon', 'stand', 'leap', 'stand', 'iceblock'], duke: ['stand', 'snap', 'stand', 'smashup', 'stand', 'throw', 'stand', 'spin'] };
const CHEER = { tux: 'summon', duke: 'smashup' };
const showOf = id => (kit3(id) && (SHOW3[id] || FC.FIGHTERS[id].show)) || SHOW, cheerOf = id => (kit3(id) && (CHEER[id] || FC.FIGHTERS[id].cheer)) || 'strike';
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mixC = (a, b, t, al = 1) => { const A = hexRgb(a), B = hexRgb(b); return `rgba(${A.map((v, k) => Math.round(v + (B[k] - v) * t)).join(',')},${al.toFixed(3)})`; };
function stageBack(g, w, h, col, i, t, still, pop, at) {   // (at: the plinth's centre as a share of the width; the showcase's off-centre one by default)
  const BD = bold(), dark = BD ? '#1b1742' : '#16123a', cx = w * (at ?? (i ? 0.43 : 0.57)), fy = h * 0.86;
  // the backdrop: their colour deep down, lighter up top (flat: two bands), slow diagonal streaks running past
  if (BD) { g.fillStyle = mixC(col, dark, 0.72); g.fillRect(0, 0, w, h); g.fillStyle = mixC(col, dark, 0.6); g.fillRect(0, 0, w, h * 0.55); }
  else { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, mixC(col, dark, 0.45)); gr.addColorStop(1, mixC(col, dark, 0.82)); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
  g.save(); g.beginPath(); g.rect(0, 0, w, h); g.clip();
  const dir = i ? -1 : 1, sl = 0.42, run = still ? 0 : t * 40;
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let k = -2; k < 9; k++) {
    const x0 = ((k * w / 5 + run) % (w * 1.6) + w * 1.6) % (w * 1.6) - w * 0.3, bw = w * (k % 3 === 0 ? 0.09 : 0.04);
    g.beginPath(); g.moveTo(cx + dir * (x0 - cx), 0); g.lineTo(cx + dir * (x0 + bw - cx), 0); g.lineTo(cx + dir * (x0 + bw - h * sl - cx), h); g.lineTo(cx + dir * (x0 - h * sl - cx), h); g.closePath(); g.fill();
  }
  // a spotlight from above onto the plinth
  const sw = Math.min(w * 0.4, h * 0.78);
  if (BD) { g.fillStyle = 'rgba(255,255,255,0.07)'; g.beginPath(); g.moveTo(cx - sw * 0.25, 0); g.lineTo(cx + sw * 0.25, 0); g.lineTo(cx + sw * 0.62, fy); g.lineTo(cx - sw * 0.62, fy); g.closePath(); g.fill(); }
  else { const gr = g.createLinearGradient(0, 0, 0, fy); gr.addColorStop(0, 'rgba(255,255,255,0.16)'); gr.addColorStop(1, 'rgba(255,255,255,0.02)'); g.fillStyle = gr; g.beginPath(); g.moveTo(cx - sw * 0.25, 0); g.lineTo(cx + sw * 0.25, 0); g.lineTo(cx + sw * 0.62, fy); g.lineTo(cx - sw * 0.62, fy); g.closePath(); g.fill(); }
  // the plinth: a low drum in their colour, a pale top with a ring
  const R = sw * 0.62, ry = R * 0.24;
  g.fillStyle = 'rgba(10,8,30,0.35)'; g.beginPath(); g.ellipse(cx + 4, fy + ry * 0.9 + 6, R * 1.05, ry, 0, 0, TAU); g.fill();
  g.fillStyle = mixC(col, '#14102a', 0.45); g.beginPath(); g.ellipse(cx, fy + 9, R, ry, 0, 0, Math.PI); g.lineTo(cx - R, fy); g.ellipse(cx, fy, R, ry, 0, Math.PI, 0, true); g.closePath(); g.fill();
  g.fillStyle = BD ? mixC(col, '#ffffff', 0.78) : mixC(col, '#ffffff', 0.72); g.beginPath(); g.ellipse(cx, fy, R, ry, 0, 0, TAU); g.fill();
  g.strokeStyle = mixC(col, '#ffffff', 0.25); g.lineWidth = Math.max(2, R * 0.05); g.beginPath(); g.ellipse(cx, fy, R * 0.8, ry * 0.8, 0, 0, TAU); g.stroke();
  // a few little four-point glints drifting up in the light
  if (!still) for (let k = 0; k < 5; k++) {
    const u = ((t * 0.18 + k * 0.211) % 1), x = cx + Math.sin(k * 2.7 + t * 0.6) * sw * 0.45, y = fy - u * h * 0.8, a = Math.sin(u * Math.PI) * 0.6, s = 2 + (k % 3);
    g.save(); g.globalAlpha = a; starPath(g, x, y, s * 1.8, s * 0.45, 4, 0); g.fillStyle = '#ffffff'; g.fill(); g.restore();
  }
  // just picked: speed lines bursting off the plinth
  if (pop >= 0 && pop < 0.45) {
    const k = pop / 0.45; g.lineCap = 'round';
    for (let n = 0; n < 18; n++) {
      const a = n / 18 * TAU + (n % 2) * 0.1, r0 = R * 0.6 + k * h * 0.7 + (n % 3) * 8, r1 = r0 + h * 0.25 * (1 - k) + 6;
      g.strokeStyle = n % 3 === 0 ? `rgba(255,255,255,${(0.85 * (1 - k)).toFixed(3)})` : mixC(col, '#ffffff', 0.4, 0.8 * (1 - k)); g.lineWidth = (n % 2 ? 2.5 : 4) * (1 - k * 0.5);
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, fy - h * 0.3 + Math.sin(a) * r0 * 0.7); g.lineTo(cx + Math.cos(a) * r1, fy - h * 0.3 + Math.sin(a) * r1 * 0.7); g.stroke();
    }
  }
  g.restore();
  return { cx, fy, k: Math.min(w / 95, h / 100) };
}
function stageLoop() {
  if (stageRaf) return;
  const draw = () => {
    stageRaf = 0;
    const cvs = [...document.querySelectorAll('.fs-stage')];
    if (!cvs.length || (game.state !== 'menu' && game.state !== 'room')) return;
    const t = performance.now() / 1000, D = Math.min(2, devicePixelRatio || 1), still = settings.reduced;
    for (const cv of cvs) {
      const i = +cv.dataset.i, id = cv.dataset.fid, ch = charOf(id), w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) continue;
      if (cv.width !== Math.round(w * D) || cv.height !== Math.round(h * D)) { cv.width = Math.round(w * D); cv.height = Math.round(h * D); }
      const g = cv.getContext('2d'); g.setTransform(D, 0, 0, D, 0, 0); g.clearRect(0, 0, w, h);
      const pop = t - stagePop[i], col = cv.closest('[style*="--pc"]') ? getComputedStyle(cv).getPropertyValue('--pc').trim() || PCOL[i] : PCOL[i];
      const { cx, fy, k } = stageBack(g, w, h, /^#[0-9a-f]{6}$/i.test(col) ? col : PCOL[i], i, t, still, pop);
      const SH = showOf(id), pose = still ? 'stand' : pop < 1.3 ? (pop < 0.7 ? 'stand' : cheerOf(id)) : SH[Math.floor((t + i * 2.1) / 1.3) % SH.length];
      const yaw = (i ? Math.PI - 0.55 : 0.55) + (still ? 0 : Math.sin(t * 0.9 + i) * 0.3) + (pop < 0.7 ? (1 - pop / 0.7) * TAU : 0);
      g.save(); g.translate(cx, fy - (pop < 0.35 ? Math.sin(pop / 0.35 * Math.PI) * 14 * k : 0));
      const o = { t, scale: k * 1.45, smooth: true, yaw, pose, mood: pop < 1.6 ? 'happy' : null, fight: true };
      if (!M3.drawMascot3D(g, ch, o)) drawMascot(g, ch, { t, scale: k * 1.45, mood: o.mood, look: [Math.cos(yaw), Math.sin(yaw)], face: Math.cos(yaw) < 0 ? -1 : 1 });
      g.restore();
    }
    stageRaf = requestAnimationFrame(draw);
  };
  stageRaf = requestAnimationFrame(draw);
}

// the results card's hero: the winner on their stage (stageBack, centred), spinning in happy with a hop, then a victory
// fist pump every couple of seconds, while the card is up
function resStage(cv, id, i) {
  const ch = charOf(id), t0 = performance.now() / 1000, D = Math.min(2, devicePixelRatio || 1), still = settings.reduced;
  const draw = () => {
    if (!cv.isConnected) return;
    const t = performance.now() / 1000, pop = t - t0, w = cv.clientWidth, h = cv.clientHeight;
    if (w && h) {
      if (cv.width !== Math.round(w * D) || cv.height !== Math.round(h * D)) { cv.width = Math.round(w * D); cv.height = Math.round(h * D); }
      const g = cv.getContext('2d'); g.setTransform(D, 0, 0, D, 0, 0); g.clearRect(0, 0, w, h);
      const { cx, fy, k } = stageBack(g, w, h, PCOL[i], i, t, still, still ? -9 : pop, 0.5);
      const beat = still ? 0 : Math.max(0, pop - 0.9) % 2.2, hop = still ? 0 : pop < 0.35 ? Math.sin(pop / 0.35 * Math.PI) * 16 : beat < 0.32 ? Math.sin(beat / 0.32 * Math.PI) * 12 : 0;
      const pose = still || pop < 0.9 ? 'stand' : beat < 0.5 ? cheerOf(id) : 'stand';
      const yaw = Math.PI / 2 + (i ? 0.35 : -0.35) + (still ? 0 : Math.sin(t * 0.8) * 0.18) + (!still && pop < 0.7 ? (1 - pop / 0.7) * TAU : 0);
      g.save(); g.translate(cx, fy - hop * k);
      const o = { t, scale: k * 1.4, smooth: true, yaw, pose, mood: 'happy', fight: true };
      if (!M3.drawMascot3D(g, ch, o)) drawMascot(g, ch, { t, scale: k * 1.4, mood: 'happy', look: [Math.cos(yaw), Math.sin(yaw)] });
      g.restore();
    }
    if (!still || pop < 0.1) requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

// ---------------------------------------------------------------- starting, pausing, leaving
const S = { F: null, cfg: null, paused: false, hold: false, card: null, phase: '', introT: -1, introN: -1, beat: 0, endT: 0, stats: null, prevHp: null, keys: new Set(), src: [], net: null };
export function startFightFromSetup() { const p = picks(); startFight({ ids: [...p.ids], bots: [...p.bots], supers: p.supers, arena: pickArena(p.arena) }); }
// Random: a map drawn when FIGHT is pressed (a menu choice, not the fight's luck; Rematch keeps it: it reuses the fight's cfg)
export const pickArena = a => a === 'random' ? ARENA_ORDER[Math.floor(Math.random() * ARENA_ORDER.length)] : a;
const mapName = a => a === 'random' ? 'Random' : (ARENAS[a] || ARENAS[ARENA_ORDER[0]]).name;
// the Random card: the four maps' thumbnails as a little 2x2 mosaic, dimmed, under a die
function randomThumb(g, w, h) {
  const hw = w / 2, hh = h / 2;
  ARENA_ORDER.slice(0, 4).forEach((id, k) => { g.save(); g.beginPath(); g.rect((k % 2) * hw, (k >> 1) * hh, hw, hh); g.clip(); g.translate((k % 2) * hw, (k >> 1) * hh); g.scale(0.5, 0.5); drawArenaThumb(g, ARENAS[id], w, h, PCOL); g.restore(); });
  g.fillStyle = 'rgba(20,16,42,0.45)'; g.fillRect(0, 0, w, h);
  const s = 30, x = w / 2 - s / 2, y = h / 2 - s / 2;
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.roundRect(x + 2, y + 3, s, s, 7); g.fill();
  g.fillStyle = '#f4f1ff'; g.beginPath(); g.roundRect(x, y, s, s, 7); g.fill();
  g.fillStyle = '#2b2456'; for (const [px, py] of [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]]) { g.beginPath(); g.arc(x + px * s, y + py * s, 3, 0, Math.PI * 2); g.fill(); }
}
export function startFight(cfg, opt = {}) {
  sfx.ensure(); stopClips();
  closeCard();
  S.net = opt.net || null;   // online (fight-net.js): see "online" below
  S.cfg = S.net ? S.net.F.cfg : { bestOf: 3, roundTime: 60, ...cfg, seed: cfg.seed ?? (Math.random() * 2 ** 31) | 0 };   // (the UI's seed: the fight's own luck is its mulberry)
  S.F = S.net ? S.net.F : new Fight(S.cfg);
  S.paused = false; S.hold = false; S.zoom = 0; S.phase = ''; S.introT = 0; S.introN = -1; S.endT = 0; S.prevHp = S.F.f.map(f => f.hp); S.stats = newStats();
  S.keys.clear();
  game.state = 'fight'; game.race = null; game.cup = null; game.fight = S.F; game.fightLive = true; game.fightPause = () => pause(true);
  Input.reset();
  const ui = document.getElementById('ui'); ui.innerHTML = ''; clearForRace();
  sfx.music('fight');
  warm(S.cfg.ids);
  try { for (const id of S.cfg.ids) for (const w of [0, 1]) M3.portrait3D(id, { mood: 'happy', size: portSize(innerHeight / hudScale()), view: 'full', yaw: w ? Math.PI / 2 + 0.42 : Math.PI / 2 - 0.42 }); } catch (e) { }   // (the match won's big portrait, made ahead)
}
function leave() {
  if (S.net) { const n = S.net; endFight(); n.quit(); return; }   // online: out of the room (net-ui.js shows the menu)
  closeCard(); S.F = null; game.fight = null; game.fightLive = false;
  if (setup.mode !== 'fight') setMode('fight');
  showMenu('fight');
}
function pause(on) {
  if (!S.F || S.card && S.card.kind === 'results') return;
  if (on && !S.paused) { S.paused = true; game.fightLive = !!S.net; openCard('pause'); }   // (online the fight goes on under the card)
  else if (!on && S.paused) { S.paused = false; game.fightLive = true; closeCard(); }
}
function closeCard() { if (S.card) { S.card.el.remove(); S.card = null; } }
function openCard(kind) {
  closeCard();
  const el = document.createElement('div'); el.className = 'cl-back pause-back fight-back';
  const kb = true;
  const k = t => kb ? ` <kbd>${t}</kbd>` : '';
  if (kind === 'pause') {
    el.innerHTML = `<div class="panel cl-box pause-box" role="dialog" aria-modal="true" aria-labelledby="fz-h"><h2 class="pause-h" id="fz-h">Paused</h2>
      <div class="pause-btns"><button type="button" class="go pz-main" data-a="resume">Resume${k('P')}</button>${S.net ? '' : `<button type="button" data-a="restart">Restart fight${k('R')}</button>`}<button type="button" data-a="quit">${S.net ? (S.net.role === 'host' ? 'Close room' : 'Leave room') : `Quit to menu${k('Esc')}`}</button></div>
      <div class="pause-set"><label class="set-row"><span>Sound</span><input type="checkbox" class="switch" id="fz-sound"${sfx.muted ? '' : ' checked'}></label><label class="set-row"><span>Screen shake</span><input type="checkbox" class="switch" id="fz-shake"${settings.shake ? ' checked' : ''}></label></div></div>`;
    el.querySelector('#fz-sound').onchange = e => sfx.setMuted(!e.target.checked);
    el.querySelector('#fz-shake').onchange = e => { settings.shake = e.target.checked; saveSettings(); };
  } else {
    const F = S.F, w = F.winner ?? 0, name = i => esc(FC.FIGHTERS[F.f[i].id].name || F.f[i].id), H = F.cfg.bots.map(b => b == null);
    const title = S.net ? netTitle(w, name) : H.filter(Boolean).length === 1 ? (H[w] ? 'You win!' : `${name(w)} wins`) : H[w] ? `P${w + 1} wins!` : `${name(w)} wins`;
    tally(S.stats, F, S.prevHp);   // (up to date, whatever ran last)
    const wins = [0, 1].map(i => F.f[i].wins), rounds = Array.isArray(F.rounds) ? F.rounds : [];
    const how = wins[1 - w] === 0 ? 'Clean sweep' : 'Down to the wire', clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const tag = i => S.net ? esc(who(i)) : H[i] ? (H.filter(Boolean).length === 1 ? 'You' : `P${i + 1}`) : `Bot · ${LEVELS[F.cfg.bots[i]] || 'Normal'}`;
    const side = i => `<div class="fr-side${i === w ? ' win' : ''}" style="--c:${PCOL[i]}"><canvas class="fr-head" data-i="${i}" width="128" height="128" aria-hidden="true"></canvas><b>${name(i)}</b><small>${tag(i)}</small></div>`;
    // the numbers as head-to-head bars: each side's share in its colour, the bigger one bold
    const stat = (l, f) => { const a = f(0), b = f(1), t = a + b || 1;
      return `<div class="fr-stat"><b class="${a > b ? 'hi' : ''}">${a}</b><span>${l}</span><b class="${b > a ? 'hi' : ''}">${b}</b><i class="fr-bar${a + b ? '' : ' none'}"><i style="width:${(a / t * 100).toFixed(1)}%"></i></i></div>`; };
    const S0 = S.stats;
    el.innerHTML = `<div class="panel cl-box pause-box fight-res" role="dialog" aria-modal="true" aria-labelledby="fr-h" style="--pc:${PCOL[w]};--c0:${PCOL[0]};--c1:${PCOL[1]}">
      <div class="fr-hero"><canvas class="fr-stage" aria-hidden="true"></canvas></div><div class="fr-title"><h2 id="fr-h">${title}</h2><p>${how}</p></div>
      ${S.net ? netSub(w, name) : ''}
      <div class="fr-vs">${side(0)}<div class="fr-mid"><p class="fr-score" aria-label="${wins[0]} to ${wins[1]}"><span style="color:${PCOL[0]}">${wins[0]}</span><i>:</i><span style="color:${PCOL[1]}">${wins[1]}</span></p>
        <ol class="fr-rounds">${rounds.map(r => `<li style="--c:${r.winner == null ? '#9a96c8' : PCOL[r.winner]}"><b>R${r.round}</b><span>${r.winner == null ? 'Draw' : name(r.winner)}</span><small>${clock(r.time || 0)}</small></li>`).join('')}</ol></div>${side(1)}</div>
      <div class="fr-stats">${stat('Damage', i => Math.round(S0[i].dmg))}${stat('Hits', i => S0[i].hits)}${stat('Counters', i => S0[i].counters || 0)}${stat('Knockdowns', i => S0[i].knockdowns || 0)}${stat('Wall slams', i => S0[i].walls || 0)}${F.cfg.supers !== false && F.f.some(f => FC.FIGHTERS[f.id] && FC.FIGHTERS[f.id].moves.super) ? stat('Supers', i => S0[i].supers) : ''}</div>
      <div class="pause-btns fr-btns">${S.net ? netButtons(k) : `<button type="button" class="go pz-main" data-a="rematch">Rematch${k('Enter')}</button><button type="button" data-a="back">Back${k('Esc')}</button>`}</div></div>`;
    el.querySelectorAll('.fr-head').forEach(cv => { const i = +cv.dataset.i, g = cv.getContext('2d'), draw = () => { g.clearRect(0, 0, 128, 128); fightHead(g, charOf(F.f[i].id), 64, 64, 60, PCOL[i], i === w ? 'happy' : 'ko', 0.4, draw); }; draw(); });
    resStage(el.querySelector('.fr-stage'), F.f[w].id, w);
  }
  el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act(b.dataset.a));
  document.body.append(el);
  S.card = { kind, el };
  if (kb) { const f = el.querySelector('.pz-main'); if (f) f.focus({ preventScroll: true }); }
}
function act(a) {
  if (S.net && (a === 'rematch' || a === 'back' || a === 'room')) { const n = S.net; if (a === 'rematch') { if (n.rematch) n.rematch(); } else n.back(); return; }   // online: the host's call
  if (a === 'resume') pause(false);
  else if (a === 'restart' || a === 'rematch') startFight({ ...S.cfg, seed: undefined });
  else if (a === 'quit' || a === 'back') leave();
}

// ---------------------------------------------------------------- keys
if (typeof document !== 'undefined') {
  addEventListener('keydown', e => {
    if (game.state === 'menu' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && !document.querySelector('.cl-back, .clip-back, .set-back') && !(e.target && e.target.closest && e.target.closest('input:not([type=checkbox]), textarea, select'))) {
      if (rosterKey(e)) { e.preventDefault(); e.stopImmediatePropagation(); }   // (the setup screen's cursors: before the menu's own S, H keys)
      return;
    }
    if (game.state !== 'fight' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target; if (t && t.tagName === 'INPUT' && !/checkbox|range|radio/.test(t.type)) return;
    if (S.card) {   // the pause card or the results: their own keys (arrows move, Enter or Space press the one in focus)
      const btns = [...S.card.el.querySelectorAll('button, input')], at = btns.indexOf(document.activeElement), K = e.key;
      e.stopImmediatePropagation();
      if (e.repeat && K !== 'ArrowDown' && K !== 'ArrowUp') { e.preventDefault(); return; }
      if (K === 'Escape') { e.preventDefault(); act(S.card.kind === 'pause' ? (S.net ? 'resume' : 'quit') : 'back'); }   // (online Esc never closes the room by accident)
      else if (S.card.kind === 'pause' && (e.code === 'KeyP' || K === 'Tab')) { e.preventDefault(); pause(false); }
      else if (S.card.kind === 'pause' && e.code === 'KeyR' && !e.shiftKey && !S.net) { e.preventDefault(); act('restart'); }
      else if (K === 'ArrowDown' || K === 'ArrowRight' || K === 'ArrowUp' || K === 'ArrowLeft') { e.preventDefault(); const d = K === 'ArrowDown' || K === 'ArrowRight' ? 1 : -1; btns[(at + d + btns.length) % btns.length].focus(); }
      else if ((K === 'Enter' || K === ' ') && at >= 0) { e.preventDefault(); btns[at].click(); }
      else if (K === 'Enter' && S.card.kind === 'results' && (!S.net || S.net.rematch)) { e.preventDefault(); act('rematch'); }
      return;
    }
    if (e.key === 'Escape' || e.code === 'KeyP' || e.code === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) pause(true); return; }
    if (CODES.has(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); S.keys.add(e.code); sfx.ensure(); }
  }, true);
  addEventListener('keyup', e => { S.keys.delete(e.code); }, true);
  addEventListener('blur', () => { S.keys.clear(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'fight') pause(true); });
}
// each human's held state this frame and where it came from (a pad once its player touches it, the keys again likewise)
function heldOf(n, H) {
  const L = layoutFor(n, H), kh = keysHeld(L, S.keys), p = pads()[n], ph = p ? padHeld(p) : null;
  const any = h => h && Object.entries(h).some(([k, v]) => v && k !== 'sx' && k !== 'sy') || (h && (h.sx || h.sy));
  if (any(kh)) S.src[n] = 'key'; else if (any(ph)) S.src[n] = 'pad';
  if (!p && S.src[n] === 'pad') S.src[n] = 'key';
  const h = { ...kh }; if (ph) for (const k in ph) h[k] = (k === 'sx' || k === 'sy') ? ph[k] : h[k] || ph[k];
  return { L, h, src: S.src[n] || 'key' };
}

// ---------------------------------------------------------------- the frame (main.js)
const devCam = F => S.zoom ? { x: (F.f[0].x + F.f[1].x) / 2, y: (F.f[0].y + F.f[1].y) / 2 - 30, z: S.zoom } : undefined;   // (the dev hook's &zoom)
const humansOf = F => F.cfg.bots.map((b, i) => b == null ? i : -1).filter(i => i >= 0);
export function fightFrame(dt) {
  if (S.net) return netFrame(dt);
  const F = S.F; if (!F) return;
  const hum = humansOf(F), live = !S.paused && !S.hold && !(S.card && S.card.kind === 'pause'), keys = [];   // (S.hold: the dev hook froze it)
  hum.forEach((fi, n) => {
    const H = heldOf(n, hum.length);
    if (live) F.setInput(fi, toInput(H.h));
    keys.push({ fi, L: H.L, src: H.src, held: live ? H.h : null });
  });
  if (live) {
    F.update(dt);
    sounds(F, dt);
    fightEvents(F);
    if (F.phase === 'over' && !S.card) { S.endT += dt; if ((F.pt ?? S.endT) > 1.8) { game.fightLive = false; openCard('results'); } }   // (the winner's celebration first)
  }
  drawFight(F, live ? dt : 0, { humans: hum, keys, cam: devCam(F), results: !!(S.card && S.card.kind === 'results') });
}
function sounds(F, dt) {
  // the big beats, on draw-moments.js's clock: the round intro's portraits slamming in, 3, 2, 1, the start (the 'round'
  // event below); a round won; the match won (a fanfare, or a sadder two notes when the one human here lost)
  if (F.phase !== S.phase) { S.phase = F.phase; S.introT = 0; S.introN = -1; S.beat = 0; }
  else S.introT += dt;
  if (F.phase === 'intro') {
    if (S.introN < 0) { S.introN = 0; sfx.play('fVs', 0.8); }
    while (S.introN < 3 && S.introT >= INTRO_COUNT[S.introN]) { S.introN++; sfx.play('fCount', 0.85); }
  } else if (F.phase === 'roundEnd' && !S.beat && S.introT > 0.5 && F.roundWinner != null) {
    S.beat = 1; if (F.wins[F.roundWinner] < Math.ceil((F.cfg.bestOf || 3) / 2)) sfx.play('fRoundWin', 0.8);
  } else if (F.phase === 'over' && !S.beat) {
    S.beat = 1; const H = F.cfg.bots.map(b => b == null), lost = S.net ? S.net.me >= 0 && S.net.me !== F.winner : H.filter(Boolean).length === 1 && !H[F.winner];
    sfx.play(lost ? 'rivalWin' : 'fVictory', 0.9);
  }
  // damage dealt, for the results
  tally(S.stats, F, S.prevHp);   // the results' numbers (fight-stats.js)
  // the super meter just filled (from the meter itself, so online too): a chime
  const rd = F.f.map(f => F.cfg.supers !== false && (f.meter || 0) >= 1);
  if (S.ready && S.readyF === F) rd.forEach((r, i) => { if (r && !S.ready[i]) sfx.play('fReady', 0.7); });
  S.ready = rd; S.readyF = F;
  for (const e of F.events || []) {
    const P = e.power || 0, who = e.who ?? -1;
    { const A = F.f[who] && ART[F.f[who].id], sn = A && A.sound && A.sound(e); if (sn) { for (const [n, vol] of sn) sfx.play(n, vol); continue; } }   // (a plug-in fighter's: js/art/kit-<id>.js)
    switch (e.kind) {
      case 'hit':
        sfx.play(P > 0.55 || e.move === 'heavy' ? 'fHeavy' : P > 0.3 ? 'fHit' : 'fJab', 0.7 + P * 0.5); break;
      case 'block': sfx.play('fBlock', 0.7 + P * 0.3); break;
      case 'clash': sfx.play('fClash', e.beat < 0 ? 0.9 : 0.6); break;
      case 'trade': sfx.play('fClash', 0.5); break;
      case 'armor': sfx.play('fArmor', 0.6 + P * 0.4); break;
      case 'whiff': sfx.play('fWhiff', 0.6); break;
      case 'counter': sfx.play('fCrit', 0.9); break;   // (a counter hit)
      case 'flank': sfx.play('fFlank', e.side === 'back' ? 0.9 : 0.7); break;
      case 'step': sfx.play('fStep', 0.7); break;
      case 'down': sfx.play('fDown', 0.9); break;
      case 'getup': sfx.play('fGetup', 0.6); break;
      case 'gassed': sfx.play('fPant', 0.8); break;
      case 'land': if (e.move === 'move2') sfx.play('fThud', 1); else sfx.play(e.move === 'heavy' ? 'fHeavy' : 'fLand', 0.4 + P * 0.6); break;
      case 'splash': sfx.play('fSplash'); break;
      case 'pop': sfx.play('fPop', 0.8); break;
      case 'ko': sfx.play('fKOHit'); break;
      case 'round': sfx.play('fGo', 0.8); break;
      case 'wall': sfx.play(P > 0.25 ? 'fLand' : 'fBlock', 0.4 + P * 0.6); if (P > 0.6) sfx.play('fHeavy', 0.5); break;
      case 'super': sfx.play('fSuper'); sfx.play('fCutin', 0.8); if (F.f[who] && F.f[who].stats && F.f[who].stats.moves.super.do === 'freeze') sfx.play('fFreeze', 0.9); break;
      case 'sudden': sfx.play('fTile', 0.8); break;
      case 'burn': sfx.play('fHeavy', 0.7); sfx.play('fSplash', 0.4); break;
      case 'pad': sfx.play('fLaunch', 0.6); break;
      case 'charge': sfx.play(P >= 1 ? 'fBlock' : 'fCharge', P >= 1 ? 0.4 : 0.6); break;   // (power 1: fully charged, a ding)
      // the kits (fight-kits.js)
      case 'dig': sfx.play('fDig', 0.8); break;
      case 'popup': sfx.play('fPopup', 0.9); break;
      case 'borrow': sfx.play('fCounter', 0.9); break;
      case 'stance': sfx.play('fGrab', 0.4); break;
      case 'own': sfx.play('fOwn', 0.9); break;
      case 'coil': sfx.play('fCoil', 0.9); break;
      case 'lift': sfx.play('fLift', 0.9); break;
      case 'yank': case 'slap': sfx.play('fWhip', 0.8); break;
      case 'spin': sfx.play('fSpin', 0.8); break;
      case 'crate': sfx.play('fCrate', 0.5 + P * 0.5); break;
      case 'shove': sfx.play('fThrow', 0.5); break;
      case 'poof': sfx.play('fPop', 0.4); break;
      case 'iso': sfx.play('fIso', 0.9); break;
      case 'dive': sfx.play('fDive', 0.8); break;
      case 'blink': sfx.play(e.move === 'evade' ? 'fWarp' : 'fBlink', 0.7); break;
      case 'ub': sfx.play('fGlitch', 0.9); if (e.ub === 1) sfx.play('fKO', 0.6); break;
      case 'zap': sfx.play('fZap', 0.5 + P * 0.5); break;
      case 'jolt': sfx.play('fJolt', 0.9); break;
      case 'field': sfx.play('fField', 0.9); break;
      // Tux's and Duke's moves and evades (fight-kits.js)
      case 'toboggan': sfx.play('fTorpedo', 0.9); break;
      case 'bounce': sfx.play('fBounce', 0.8); break;
      case 'belly': sfx.play('fBelly', 0.7); break;
      case 'leap': sfx.play('fLeap', 0.9); break;
      case 'fork': sfx.play('fFork', 0.8); break;
      case 'peng': sfx.play('fPeng', e.how === 'hit' || e.how === 'soak' ? 0.8 : 0.5); break;
      case 'vanish': sfx.play('fWarp', 0.8); break;
      case 'popout': sfx.play('fPopout', 0.9); break;
      case 'smash': sfx.play(e.hit ? 'fHeavy' : 'fLand', e.hit ? 0.9 : 0.6); break;
      case 'stumble': sfx.play('fStep', 0.5); break;
      case 'snap': sfx.play('fSnap', 1); sfx.play('fRing', 0.7); break;
      case 'freeze': sfx.play('fFreeze', 0.9); break;
      case 'ringbreak': sfx.play('fThaw', 0.6); break;
      case 'thaw': sfx.play('fThaw', 0.8); break;
      case 'throw': sfx.play('fToss', 0.8); break;
      case 'potland': sfx.play('fBlock', 0.4); sfx.play('fRumble', 0.8); break;
      case 'erupt': sfx.play('fErupt', 0.9); break;
      case 'dizzy': sfx.play('fPant', 0.5); break;
      case 'iceblock': sfx.play('fFreeze', 0.5); break;
      case 'crack': sfx.play('fThaw', 0.8); break;
      case 'clink': sfx.play('fClash', 0.6); break;
    }
  }
}

// ---------------------------------------------------------------- online (fight-net.js; net.js starts it, net-ui.js the room)
// startFight(cfg, { net }) with net = { role: 'host'|'player', me (our fighter, -1: watching), F (the Fight to draw: the
// host's real one, a player's copy), frame(dt, input|null) (the host steps it, a player sends the input and lays the
// snapshots on), rematch (the host's, else null), back() (the host: everyone to the room; a player: the room screen),
// quit() (leave or close the room), names [fighter 0's player, fighter 1's] }. Keyboard and gamepads only: you play with
// the one-player keys (or the first pad). Nothing else changes online but the pause card (the fight carries on under it,
// no Restart), the names on the HUD cards and the results.
function netFrame(dt) {
  const n = S.net, F = S.F = n.F, live = !(S.card && S.card.kind === 'pause'), me = n.me, keys = [];
  let o = null;
  if (me >= 0) {
    const H = heldOf(0, 1);
    o = live ? toInput(H.h) : { x: 0, y: 0 };
    keys.push({ fi: me, L: H.L, src: H.src, held: live ? H.h : null });
  }
  n.frame(dt, o);
  if (S.F !== n.F) { S.F = n.F; S.stats = newStats(); S.prevHp = S.F.f.map(f => f.hp); }
  sounds(S.F, dt); fightEvents(S.F);
  if (S.F.phase === 'over' && (!S.card || S.card.kind === 'pause')) { S.endT += dt; if ((S.F.pt ?? S.endT) > 1.8) openCard('results'); }
  else if (S.F.phase !== 'over' && S.card && S.card.kind === 'results') { closeCard(); S.stats = newStats(); S.prevHp = S.F.f.map(f => f.hp); }   // (a rematch the host started)
  drawFight(S.F, dt, { humans: me >= 0 ? [me] : [], keys, names: n.names, results: !!(S.card && S.card.kind === 'results') });
}
// online, who sat on fighter i: the player's name, or 'bot' (a bot fought, or took over for someone who left)
const who = i => (S.net && S.net.names && S.net.names[i]) || 'bot';
// under the title: who beat whom, on what
function netSub(w, name) {
  return `<p class="fr-sub"><b style="color:${PCOL[w]}">${esc(who(w))}</b> (${name(w)}) beat <b style="color:${PCOL[1 - w]}">${esc(who(1 - w))}</b> (${name(1 - w)})</p>`;
}
function netTitle(w, name) {
  const n = S.net, who = n.names && n.names[w];
  if (n.me >= 0) return n.me === w ? 'You win!' : `${esc(who || name(w))} wins`;
  return `${esc(who || name(w))} wins`;
}
function netButtons(k) {
  const n = S.net;
  if (n.rematch) return `<button type="button" class="go pz-main" data-a="rematch">Rematch${k('Enter')}</button><button type="button" data-a="back">Back to room${k('Esc')}</button>`;
  return `<p class="r-wait fr-wait" role="status"><span class="wait-chip"><i class="wait-spin" aria-hidden="true"></i>Waiting for the host: rematch or room</span></p><button type="button" class="pz-main" data-a="quit">Leave room${k('Esc')}</button>`;
}
// the room's on screen again (net-ui.js): the fight and its cards go
export function endFight() { closeCard(); S.net = null; S.F = null; game.fight = null; game.fightLive = false; }

// ---------------------------------------------------------------- dev hook: #fight (see the top)
export function fightDemo(hash) {
  let devIds = null;   // (&ids=gopher,octo: the two fighters, even ones not pickable yet: a plug-in being built)
  { const m = /[#&]ids=([\w,]+)/.exec(hash), ids = m ? m[1].split(',').filter(id => FC.FIGHTERS[id]) : [];
    if (ids.length) { picks(); setup.fightIds = [ids[0], ids[1] || ids[0]]; devIds = [...setup.fightIds]; } }
  if (/#fight=home/.test(hash)) { const lk = /[#&]look=(\w+)/.exec(hash); if (lk) { setLook(lk[1]); applyLook(); } showMenu('home'); return; }   // (#fight=home: the title, no boot screen)
  if (/#fight=setup/.test(hash)) { const lk = /[#&]look=(\w+)/.exec(hash); if (lk) { setLook(lk[1]); applyLook(); } setMode('fight'); showMenu('fight'); return; }   // (#fight=setup: the setup screen)
  const lv = /#fight=(\d)/.exec(hash), q = k => (new RegExp('[#&]' + k + '(?:=([^&]*))?').exec(hash) || null);
  const level = lv ? Math.min(2, +lv[1]) : 1, hm = q('humans'), h = hm ? +hm[1] || 0 : 0, look = q('look');
  if (look && look[1]) { setLook(look[1]); applyLook(); }
  const bots = [h >= 1 ? null : level, h >= 2 ? null : level];
  setMode('fight');
  startFight({ ids: devIds || [...picks().ids], bots, supers: !(q('supers') && q('supers')[1] === '0'), roundTime: q('time') ? +q('time')[1] || 60 : 60, seed: q('seed') ? +q('seed')[1] : undefined, arena: q('arena') ? q('arena')[1] : picks().arena });
  // &at=<s>: run the fight that far at once (for screenshots of a moment); &stop=<event kind>: stop early on that event
  const at = q('at'), stop = q('stop'), F = S.F;
  if (q('pause')) setTimeout(() => pause(true), 50);
  // &gh=<x>: only stop once the one it hit has less than x of their stamina left; &hold=<frames>: run that many more
  // frames (drawn, so the effects play) and freeze there (for a screenshot of an effect)
  const gh = q('gh'), hold = q('hold'), hit = e => e.kind === stop[1] && (!gh || (F.f[e.to] && stamOf(F.f[e.to]) < +gh[1]));
  const phq = q('ph');   // (&ph=<a move's phase>: stop once someone's in it, e.g. crouch, high, gone, snap, throw, iceblock)
  if (at) for (let n = Math.round((+at[1] || 0) * 60); n-- > 0;) { F.update(1 / 60); fightEvents(F); fightTick(F, 1 / 60); tally(S.stats, F, S.prevHp); if (stop && F.events.some(hit)) break; if (phq && F.f.some(f => f.ph === phq[1])) break; }
  S.zoom = q('zoom') ? +q('zoom')[1] || 0 : 0;   // (&zoom=<px per unit>: a close camera on the two, for screenshots)
  const sh = q('stam') || q('shield'); if (sh) F.f.forEach(f => { f.stam = +sh[1]; if (f.guardHp != null) f.guardHp = +sh[1]; if (+sh[1] <= 0.01) f.gassed = Math.max(f.gassed || 0, 1.2); });   // (&stam=<0..1>: both tired that far (0: gassed), for a screenshot)
  if (hold) { for (let n = +hold[1] || 0; n-- > 0;) { F.update(1 / 60); fightEvents(F); drawFight(F, 1 / 60, { humans: [], cam: devCam(F) }); } S.hold = true; }
}
