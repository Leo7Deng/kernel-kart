// Kernel Kart: Fight mode's screens (js/fight.js is the sim, draw-fight.js draws it). Keyboard, gamepad, and touch
// (a floating thumb stick and four big move buttons, fight-touch.js).
//   setup    the menu's Fight screen (menu.js view 'fight'), a fighting game's select screen: a stage per side (P1 left,
//            P2 right: the fighter big under a spotlight in the side's colour, its name plate, Player | Bot (Chill, Normal,
//            Ruthless) under it; tap a stage to pick for that side), between them the matchup (both shares over a split
//            bar, a word, the sample: bot round robins at the bot side's level or Normal, js/fight-matchup-data.js from
//            test/fight-odds.mjs), the roster (FIGHT_ORDER, a WIP one greyed but pickable; each side's cursor in its colour,
//            moved by that player's keys or clicked; a tile's share against the other pick on hover) and the match button
//            (map, first to, round time: openMatch's sheet). Each stage's Info opens the fighter's sheet (openDetails):
//            Strength (5 steps) and Easy/Medium/Hard (measured: skillOf), tabs Fighter (blurb, passive, measured bars:
//            Damage, Speed, Range, Defense, Ease, Strong vs / Weak vs), Moves (key, icon, name, cooldown; click for its
//            clip, fight-moves.js, and in the close-up its tell and its answer), Keys (as on the keyboard). Saved in
//            kk-setup (ui.js setup.fightIds, fightBots, fightRand, fightArena, fightRounds, fightTime). A side on Random
//            shows its next roll (FIGHT uses it). The online room (net-ui.js) still uses fighterCard's showcases
//   practice the Practice button next to FIGHT: the training room (fight-practice.js, its overlay fight-practice-ui.js): P1's
//            fighter against P2's as a dummy, S.practice steps the fight; keys 1-5 the dummy, T record, R reset, H the overlay, C the next combo trial, V its demo
//   flow     game.state 'fight': main.js calls fightFrame every frame (the fight's update and drawing). Esc, P or a pad's
//            Start pauses (Resume, Restart, Quit); the page hidden pauses too. When it's over: the results card over the
//            arena (the winner on a stage, the score and the rounds, the numbers as head-to-head bars) with Rematch and Back
//   input    held booleans each frame for each human ({ x, y, light, heavy, special, guard }; the sim sees the
//            presses: light, heavy and special fire the three moves, guard the evade), from keys by e.code (fight-keys.js: 'solo' for one human, 'p1' and 'p2' for two on one keyboard)
//            and the gamepads (the nth pad is the nth human), and touch (fight-touch.js: the nth zone is the nth human; its
//            stick and buttons drawn over the fight instead of the keys). Under each human's HUD card the keys (or the pad)
//            they use, lighting up as they're held
//   sound    from the fight's events (audio.js f* sounds), and the big beats on draw-moments.js's clock (the round intro,
//            3-2-1, the start, a KO, a round won, the match won)
//   #fight   dev hook: index.html#fight[=<level>] starts a bot-vs-bot fight at once (&time=<round s>, &humans=1|2,
//            &seed=<n>, &arena=<id>, &look=flat|classic, &at=<s> to jump that far in, &stop=<event kind> to stop there (ground: a hit on someone down),
//            &ph=<a move's phase> to stop once someone's in it (e.g. Duke's snap, potup, blinkin),
//            &zoom=<px per unit> for a close camera, &hold=<frames> to play that many more and
//            freeze, &pause, &ids=<id>,<id> for the two fighters); #fight=setup opens the setup screen (&ids too)
import { FIRST_TO, Fight, ROUND_TIMES, matchCfg, winsToTake } from './fight.js';
import { ARENAS, ARENA_ORDER } from './fight-arenas.js';
import { drawArenaThumb } from './draw-arena.js';
import * as FC from './fight-chars.js';
import { drawFight, drawKeys, drawLegend, fightEvents, fightHead, fightIcon, fightTick, keysSize, legendSize, starPath } from './draw-fight.js';
import { INTRO_COUNT } from './draw-moments.js';
import * as M3 from './art/model3d.js';
import { drawMascot } from './art.js';
import { sfx } from './audio.js';
import { ART, artsIn } from './art/kits.js';
import { DUKE_SOUND } from './draw-moves.js';
import { CHARACTERS, PCOL, TAU, frnd } from './core.js';
import { Input } from './input.js';
import { ctx, DPR } from './render.js';
import { drawTouch, drawTouchDiagram, initFightTouch, touchInset, setTouch, touchAny, touchHeld, touchOn, touchRelease, touchReset, touchUI } from './fight-touch.js';
import { CODES, LAYOUTS, keyLabel as keyLabelOf, keysHeld, layoutFor, padHeld, pads, toInput } from './fight-keys.js';
import { newStats, tally } from './fight-stats.js';
import { cardMove, makeClip, moveAnswer, moveDesc, moveHold, moveKeys, moveKind, moveName, moveOrder, moveTell, runClips, stopClips } from './fight-moves.js';
import { settings, saveSettings } from './settings.js';
import { bold, setLook } from './look.js';
import { applyLook, clearForRace, esc, game, saveSetup, setMode, setup, showMenu } from './ui.js';
import MATCHUPS from './fight-matchup-data.js';
import { kitSig } from './fight-sig.js';
import { MODES, Practice } from './fight-practice.js';
import { loadDone, mountPractice } from './fight-practice-ui.js';

const LEVELS = ['Chill', 'Normal', 'Ruthless'];
const order = () => FC.FIGHT_PICK || FC.FIGHT_ORDER || Object.keys(FC.FIGHTERS);
const wip = id => (FC.FIGHT_WIP || []).includes(id);   // (still being reworked: greyed, still pickable)
const charOf = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
const soonIds = () => (FC.FIGHT_SOON || CHARACTERS.map(c => c.id)).filter(id => !order().includes(id) && CHARACTERS.some(c => c.id === id));
// the card's bars, all measured in bot fights (js/fight-matchup-data.js, test/fight-odds.mjs) and scaled across the
// fighters measured, so they compare: Damage (dealt a round), Speed (on its own feet), Range (how far off its damage
// lands), Defense (damage taken a round, fewer is longer), Ease (how well it holds up played sloppily: skillOf)
const BARS = [['dmg', 'Damage', 'damage dealt a round'], ['speed', 'Speed', 'how far it moves a second'], ['range', 'Range', 'how far away its hits land from'], ['def', 'Defense', 'damage taken a round (less is more)'], ['ease', 'Ease', 'how easy it is to play well']];
const DIFF = { easy: ['Easy', 1], medium: ['Medium', 0.6], hard: ['Hard', 0.25] };
const wordOf = (id, k) => (FC.FIGHTERS[id] || {})[k] || '';
// Easy / Medium / Hard, measured:
// test/fight-odds.mjs plays each fighter by a Chill bot against everyone at Normal (its floor) and by a Ruthless bot
// against everyone at Normal (its ceiling), as shares of rounds won. ease = floor - (ceiling - floor) / 2: a high floor
// and a small spread is forgiving, a low floor and a big spread asks for skill. Against the field (z = ease's distance
// from the fighters' mean in standard deviations, at least EASE_MIN apart in share): Easy above +EASE_Z, Hard below
// -EASE_Z. No skill data for a fighter: its kit's hand-set difficulty
const EASE_Z = 0.5, EASE_MIN = 0.02;
const share = v => v && v[1] ? (v[3] ? v[2] / v[3] : v[0] / v[1]) : null;   // ([wins, fights, rounds won, rounds]: by rounds when there are)
let skillMemo = null;
export function skillOf(id) {
  if (!skillMemo) {
    const K = MATCHUPS.skill || {}, F = K.floor || {}, C = K.ceiling || {}, m = {};
    for (const j of Object.keys(F)) { const f = share(F[j]), c = share(C[j]); if (f != null && c != null) m[j] = { floor: f, ceiling: c, spread: c - f, ease: f - (c - f) / 2 }; }
    const es = Object.values(m).map(x => x.ease), mean = es.reduce((a, b) => a + b, 0) / (es.length || 1);
    const sd = Math.sqrt(es.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (es.length || 1)) || 1, lo = Math.min(...es), hi = Math.max(...es);
    for (const x of Object.values(m)) {
      const d = x.ease - mean, z = d / sd;
      x.diff = Math.abs(d) < EASE_MIN ? 'medium' : z > EASE_Z ? 'easy' : z < -EASE_Z ? 'hard' : 'medium';
      x.bar = hi > lo ? 0.12 + 0.88 * (x.ease - lo) / (hi - lo) : 0.6;
    }
    skillMemo = m;
  }
  return skillMemo[id] || null;
}
const diffOf = id => { const k = skillOf(id); return k ? k.diff : DIFF[wordOf(id, 'difficulty')] ? wordOf(id, 'difficulty') : 'medium'; };
// the measured words for a tooltip ('' without data)
const pct = x => Math.round(x * 100) + '%';
const skillText = id => { const k = skillOf(id); return k ? `Played sloppily (a Chill bot against Normal ones) it takes ${pct(k.floor)} of rounds; played sharp (Ruthless) ${pct(k.ceiling)}${stale(id) ? ' (measured on an earlier version)' : ''}` : ''; };
const taglineOf = id => wordOf(id, 'tagline') || String((FC.FIGHTERS[id] || {}).blurb || '').split(/[.:]/)[0];
export const fightTileIcon = `<svg class="trophy" viewBox="0 0 48 48" aria-hidden="true"><g transform="rotate(-12 24 24)">
  <path d="M15 31c-3.5-4.2-4.6-10.4-1.6-15.6C16.6 9.6 23 6.6 29.6 7.4 37 8.3 41.4 14 40.6 21c-.7 6.2-4.8 10.4-10.2 11.2L29.6 35H16.4z" fill="#ff4d3a"/>
  <path d="M14.6 20.6c-4-.6-7 1.8-6.6 5.2.4 3.2 3.6 5.2 7.6 4.2l3.4-1" fill="#e5352a"/>
  <path d="M22.5 18.5c3.5-2 8-2.2 11.5-.4" fill="none" stroke="#c42a22" stroke-width="2.2" stroke-linecap="round"/>
  <ellipse cx="22" cy="13.5" rx="5.5" ry="2.8" fill="#ff8f80" transform="rotate(-24 22 13.5)"/>
  <rect x="15" y="33.5" width="16" height="9.5" rx="2.6" fill="#fff"/><path d="M19 36.5h8M19 39.8h8" stroke="#d9d5ec" stroke-width="1.6" stroke-linecap="round"/></g></svg>`;

// ---------------------------------------------------------------- the picks (setup.fight*: kept sane whatever was saved)
// (Random rolls only finished fighters, not the WIP ones; all of them if none is finished)
const rollable = () => { const d = order().filter(id => !wip(id)); return d.length ? d : order(); };
const anyFighter = (not) => { const ids = rollable().filter(id => id !== not); return ids[Math.floor(Math.random() * ids.length)] || order()[0]; };
// the fight's two fighters: a side on Random gets a new one each time (Rematch: a fresh roll. From the setup screen a
// Random side's next fighter is rolled ahead and shown on its stage, setup.fightIds[i]: FIGHT takes exactly that one,
// then rolls the one after, nextRolls)
const rollIds = (ids, rand) => ids.map((id, i) => rand && rand[i] ? anyFighter() : id);
const nextRolls = () => { const p = picks(); p.rand.forEach((r, i) => { if (r) setup.fightIds[i] = anyFighter(); }); saveSetup(); };
function picks() {
  const ids = order();
  if (!Array.isArray(setup.fightIds) || setup.fightIds.length !== 2) setup.fightIds = [ids[0], ids[1] || ids[0]];
  setup.fightIds = setup.fightIds.map((id, i) => ids.includes(id) ? id : ids[i % ids.length]);
  if (!Array.isArray(setup.fightBots) || setup.fightBots.length !== 2) setup.fightBots = [null, 1];
  setup.fightBots = setup.fightBots.map(b => b === null || [0, 1, 2].includes(b) ? b : 1);
  if (!Array.isArray(setup.fightRand) || setup.fightRand.length !== 2) setup.fightRand = [false, false];   // (a side on Random: ids[i] is only the card's preview; a new fighter is rolled for every fight)
  setup.fightRand = setup.fightRand.map(Boolean);
  if (setup.fightArena !== 'random' && !ARENA_ORDER.includes(setup.fightArena)) setup.fightArena = ARENA_ORDER[0];
  const m = matchOf(setup); setup.fightRounds = m.n; setup.fightTime = m.t;
  return { ids: setup.fightIds, bots: setup.fightBots, rand: setup.fightRand, arena: setup.fightArena, rounds: m.n, time: m.t };
}
const humanCount = bots => bots.filter(b => b == null).length;
// the match's length (fight.js matchCfg): first to n rounds won, t s a round. From the setup (setup.fightRounds,
// fightTime) or the online room's cfg (fightRounds, fightTime): what isn't offered falls back to first to 2, 60 s
export const matchOf = c => ({ n: FIRST_TO.includes(c && c.fightRounds) ? c.fightRounds : 2, t: ROUND_TIMES.includes(c && c.fightTime) ? c.fightTime : 60 });
export const matchShort = (n, t) => `first to ${n} · ${t} s rounds`;
export const matchText = (n, t) => `${n === 1 ? 'One round decides it' : `First to win ${n} rounds takes the match`}, ${t} s a round. Knock their health to zero; the walls hold you in, and getting slammed into one hurts. When the clock runs out, every hit hurts more`;

// a fighter's bars as 0..1, each scaled from the lowest to the highest of the fighters measured (null: not measured)
function bars(id) {
  const S = MATCHUPS.stats || {}, me = S[id], ids = Object.keys(S);
  const val = (x, k) => k === 'def' ? -x.taken : k === 'ease' ? null : x[k];
  const k = skillOf(id), out = { ease: k ? k.bar : DIFF[diffOf(id)][1] };
  for (const [k] of BARS) {
    if (k === 'ease') continue;
    if (!me) { out[k] = null; continue; }
    const vs = ids.map(j => val(S[j], k)), lo = Math.min(...vs), hi = Math.max(...vs);
    out[k] = 0.12 + 0.88 * (hi > lo ? (val(me, k) - lo) / (hi - lo) : 0.5);
  }
  return out;
}
// how strong a fighter is: its overall share of Normal bot fights, as 1..5 (3: about even, 47-53%)
export function strengthOf(id) {
  const o = ((MATCHUPS.levels || {}).normal || {}).overall || {}, v = o[id];
  if (!v || !v[1]) return null;
  const w = v[0] / v[1];
  return { w, n: Math.max(1, Math.min(5, 3 + Math.round((w - 0.5) / 0.07))), old: stale(id) };
}
// its best and worst matchups at Normal: [{ id, s }], the strongest first / the weakest first
function matchList(id, k = 3) {
  const all = order().filter(j => j !== id).map(j => ({ id: j, m: matchShare(id, j, 'normal') })).filter(x => x.m).map(x => ({ id: x.id, s: x.m.s }));
  all.sort((a, b) => b.s - a.s);
  return { good: all.filter(x => x.s > 0.5).slice(0, k), bad: all.filter(x => x.s < 0.5).reverse().slice(0, k) };
}
export const fightPlayable = () => true;

// ---------------------------------------------------------------- the setup screen (menu.js view 'fight')
// One focus: the two fighters facing off on their stages, the roster between them. Everything else one tap away: each
// stage's Info button opens its fighter's sheet (strength, ease, stats, matchups, moves with clips, keys: openDetails),
// the match button the map, rounds and round time (openMatch). Under 760 px wide the stages sit side by side on top.
export function fightScreen(s, top) {
  picks();
  const nm = fid => esc(FC.FIGHTERS[fid].name || fid);
  const cur = '<i class="fv-cur c0" aria-hidden="true">P1</i><i class="fv-cur c1" aria-hidden="true">P2</i>';
  const tiles = order().map(fid => `<button type="button" class="fv-tile${wip(fid) ? ' wip' : ''}" data-tile="${fid}" title="${nm(fid)}${wip(fid) ? ': still being worked on' : ''}" aria-label="${nm(fid)}"><canvas data-head="${fid}" width="128" height="128" aria-hidden="true"></canvas><span class="fv-tn">${nm(fid)}</span>${wip(fid) ? '<i class="fv-wip" aria-hidden="true">WIP</i>' : ''}${cur}</button>`).join('')
    + soonIds().map(sid => `<button type="button" class="fv-tile soon" disabled title="${esc(charOf(sid).name)}: soon" aria-label="${esc(charOf(sid).name)}: soon"><canvas data-head="${sid}" width="128" height="128" aria-hidden="true"></canvas><span class="fv-tn">${esc(charOf(sid).name)}</span><i class="fv-wip" aria-hidden="true">soon</i></button>`).join('')
    + `<button type="button" class="fv-tile fv-rand" data-rand title="A random fighter (again for another)" aria-label="Random fighter"><canvas class="fv-dice" width="128" height="128" aria-hidden="true"></canvas><span class="fv-tn">Random</span>${cur}</button>`;
  s.innerHTML = `${top}<div class="m-body fv kk">
    <div class="fv-main">
      <section class="fv-side" id="fside0" data-side="0" aria-label="P1"></section>
      <div class="fv-mid">
        <div class="fv-mu" id="fmu" role="group" aria-label="Matchup"></div>
        <p class="fv-pickfor" id="fpick" aria-live="polite"></p>
        <div class="fv-roster" role="group" aria-label="Fighters">${tiles}</div>
        <button type="button" class="fv-match" id="fmatch" aria-haspopup="dialog"></button>
      </div>
      <section class="fv-side" id="fside1" data-side="1" aria-label="P2"></section>
    </div></div>
    <footer class="m-foot fv-foot kk"><p class="fv-hint" id="frhint"></p><div class="fv-gos"><button type="button" class="kk-btn fv-prac" id="fprac" title="Training: P1's fighter against P2's as a dummy that stands, walks, evades, fights back or replays you, on this map. No rounds, no KO, the frame data on screen, and combo trials">Practice</button><button type="button" class="big m-go" id="fstart" data-first>FIGHT</button></div></footer>`;
  s.querySelector('#fstart').onclick = () => startFightFromSetup();
  s.querySelector('#fprac').onclick = () => startPracticeFromSetup();
  s.querySelector('#fmatch').onclick = () => { sfx.play('click'); openMatch(s); };
  // the roster: a click picks for the side in focus (P1 at first; tap a side's stage to switch), a right-click for the other
  const ros = s.querySelector('.fv-roster');
  ros.querySelectorAll('canvas[data-head]').forEach(drawHeadCanvas);
  ros.querySelectorAll('[data-tile]').forEach(b => {
    b.onclick = () => pickSide(s, mouseSide, b.dataset.tile);
    b.oncontextmenu = e => { e.preventDefault(); pickSide(s, 1 - mouseSide, b.dataset.tile); };
  });
  // Random: a different fighter for that side each press (a menu choice, so Math.random is fine: not the fight's luck)
  const rnd = ros.querySelector('[data-rand]');
  if (rnd) {
    const cv = rnd.querySelector('canvas'), g = cv.getContext('2d'); g.clearRect(0, 0, 128, 128); dice(g, 64, 64, 66);
    const goRandom = i => { picks(); setup.fightRand[i] = true; setup.fightIds[i] = anyFighter(setup.fightIds[i]); saveSetup(); popStage(i); sfx.play('fPick', 0.8); drawSlots(s); };
    rnd.onclick = () => goRandom(mouseSide);
    rnd.oncontextmenu = e => { e.preventDefault(); goRandom(1 - mouseSide); };
  }
  drawSlots(s);
  stageLoop();
}
// the match's length: first to 1 / 2 / 3 / 5 rounds won, and a round's time (setup.fightRounds, fightTime)
function matchSegs() {
  const m = matchOf(setup), seg = (k, lbl, opts, cur) => `<div class="fv-mset"><span class="fv-ol">${lbl}</span><span class="seg" role="group" aria-label="${lbl}">${opts.map(([v, t, tip]) => `<button type="button" data-${k}="${v}" aria-pressed="${v === cur}"${v === cur ? ' class="sel"' : ''} title="${esc(tip)}">${t}</button>`).join('')}</span></div>`;
  return seg('rounds', 'First to', FIRST_TO.map(n => [n, String(n), n === 1 ? 'One round decides it' : `The first to win ${n} rounds takes the match`]), m.n)
    + seg('time', 'Round time', ROUND_TIMES.map(t => [t, t + ' s', `${t} s a round, then sudden death`]), m.t);
}
// the match button: the map's thumbnail, its name, the rounds and the time; it opens the match sheet
function drawMatchBtn(s) {
  const b = s.querySelector('#fmatch'); if (!b) return;
  const p = picks();
  b.innerHTML = `<canvas width="96" height="64" aria-hidden="true"></canvas><span class="fv-mt"><small>Map &amp; rounds</small><b>${esc(mapName(p.arena))}</b><span>first to ${p.rounds} · ${p.time} s rounds</span></span><i class="fv-chev" aria-hidden="true"></i>`;
  b.setAttribute('aria-label', `Map and rounds: ${mapName(p.arena)}, first to ${p.rounds}, ${p.time} s rounds. Change`);
  mapThumb(b.querySelector('canvas'), p.arena, 96, 64);
}
function mapThumb(cv, id, w, h) {
  const D = Math.min(2, devicePixelRatio || 1), g = cv.getContext('2d');
  cv.width = w * D; cv.height = h * D; g.setTransform(D, 0, 0, D, 0, 0);
  if (id === 'random') randomThumb(g, w, h); else drawArenaThumb(g, ARENAS[id], w, h, PCOL);
}
// a sheet over the screen (the match's settings, a fighter's details): o = { side (0 left, 1 right, else centred; a
// bottom sheet on a phone), cls, label }; returns { el, box, shut }. Esc, ✕ or a click outside closes it
function sheet(html, o = {}) {
  document.querySelectorAll('.fv-back').forEach(b => b.remove());   // (one at a time)
  const back = document.createElement('div');
  back.className = `cl-back fv-back${o.side == null ? '' : ' at' + o.side}`;
  back.innerHTML = `<div class="kk fv-sheet ${o.cls || ''}" role="dialog" aria-modal="true" aria-label="${esc(o.label || '')}"${o.style ? ` style="${o.style}"` : ''}>${html}</div>`;
  document.body.append(back);
  const box = back.firstElementChild, prev = document.activeElement;
  const shut = () => { stopClips(); back.classList.add('out'); document.removeEventListener('keydown', onKey, true); setTimeout(() => back.remove(), settings.reduced ? 0 : 160); if (prev && prev.focus && prev.isConnected) prev.focus({ preventScroll: true }); if (o.onClose) o.onClose(); };
  const onKey = e => {
    if (!back.isConnected) { document.removeEventListener('keydown', onKey, true); return; }
    if (document.querySelector('.fs-ov')) return;   // (a move's close-up on top: its own keys)
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); shut(); }
    else if (e.key === 'Tab') {   // (focus stays in the sheet)
      const f = [...box.querySelectorAll('button:not([disabled]), [tabindex="0"]')]; if (!f.length) return;
      const at = f.indexOf(document.activeElement); if (e.shiftKey ? at <= 0 : at === f.length - 1) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus(); }
    }
  };
  document.addEventListener('keydown', onKey, true);
  back.addEventListener('mousedown', e => { if (e.target === back) shut(); });
  box.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { sfx.play('click'); shut(); });
  return { el: back, box, shut };
}
const xBtn = '<button type="button" class="fv-x" data-x aria-label="Close"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg></button>';
// the match sheet: the map (a card per arena with what it is), first to n, the round's time, the rules in a line
function openMatch(s) {
  const p = picks();
  const maps = ['random', ...ARENA_ORDER].map(id => `<button type="button" class="fv-map" data-arena="${id}" aria-pressed="${id === p.arena}"><canvas aria-hidden="true"></canvas><span class="fv-mapt"><b>${esc(mapName(id))}</b><small>${esc(id === 'random' ? 'A different map each time you press FIGHT (Rematch keeps it)' : ARENAS[id].blurb)}</small></span></button>`).join('');
  const sh = sheet(`<header class="fv-sh"><div><span class="kk-kicker">Match</span><h2 class="fv-st">Map &amp; rounds</h2></div>${xBtn}</header>
    <div class="fv-sb"><div class="fv-maps" role="group" aria-label="Map">${maps}</div>
      <div class="fv-len">${matchSegs()}</div>
      <p class="fv-rules" id="frules"></p></div>
    <footer class="fv-sf"><button type="button" class="kk-btn go" data-x>Done</button></footer>`, { cls: 'fv-msheet', label: 'Map and rounds', onClose: () => drawMatchBtn(s) });
  const box = sh.box, rules = () => { const m = picks(); box.querySelector('#frules').textContent = matchText(m.rounds, m.time) + '.'; };
  box.querySelectorAll('.fv-map').forEach(b => {
    mapThumb(b.querySelector('canvas'), b.dataset.arena, 120, 80);
    b.onclick = () => { setup.fightArena = b.dataset.arena; saveSetup(); sfx.play('click'); box.querySelectorAll('.fv-map').forEach(x => x.setAttribute('aria-pressed', x === b)); drawMatchBtn(s); };
  });
  const wire = () => box.querySelectorAll('[data-rounds], [data-time]').forEach(b => b.onclick = () => {
    if (b.dataset.rounds) setup.fightRounds = +b.dataset.rounds; else setup.fightTime = +b.dataset.time;
    saveSetup(); sfx.play('click'); box.querySelector('.fv-len').innerHTML = matchSegs(); wire(); rules(); drawMatchBtn(s);
    const f = box.querySelector(`[data-${b.dataset.rounds ? 'rounds' : 'time'}].sel`); if (f) f.focus();
  });
  wire(); rules();
  (box.querySelector('.fv-map[aria-pressed=true]') || box.querySelector('.fv-map')).focus();
}
// which side a mouse click on the roster picks for (the stage last clicked; P1 at first)
let mouseSide = 0;
const paneOf = ['info', 'info'];   // each side's open tab (Fighter, Moves, Keys), kept while picking
function pickSide(s, i, id) {
  if (setup.fightRand && setup.fightRand[i]) { setup.fightRand[i] = false; setup.fightIds[i] = id; saveSetup(); popStage(i); sfx.play('fPick', 0.8); drawSlots(s); return; }
  if (setup.fightIds[i] === id) { popStage(i); return; }
  setup.fightIds[i] = id; saveSetup(); popStage(i); sfx.play('fPick', 0.8); drawSlots(s);
}
// who plays a side: Player or Bot, and a bot's level (Chill, Normal, Ruthless) beside it; Bot takes the level it had last
const lastLv = [1, 1];
function whoCtl(i, bot) {
  const isBot = bot != null; if (isBot) lastLv[i] = bot;
  return `<span class="fx-who" role="group" aria-label="P${i + 1}: player or bot"><span class="seg fx-pb">${[['h', 'Player'], ['b', 'Bot']].map(([v, t]) => { const on = (v === 'b') === isBot; return `<button type="button" data-who="${i}" data-v="${v}" aria-pressed="${on}"${on ? ' class="sel"' : ''}>${t}</button>`; }).join('')}</span>`
    + `<span class="seg fx-lv" role="group" aria-label="P${i + 1}'s bot level"${isBot ? '' : ' hidden'}>${LEVELS.map((l, k) => `<button type="button" data-who="${i}" data-v="${k}" aria-pressed="${k === bot}"${k === bot ? ' class="sel"' : ''} title="${esc(LEVEL_TIP[k])}">${l}</button>`).join('')}</span></span>`;
}
const LEVEL_TIP = ['A gentle bot: slow to read you, forgets to evade, telegraphs its throws', 'A fair fight: reads your moves at human speed', 'Plays to win: learns your habits and punishes them'];
function wireWho(s, box) {
  box.querySelectorAll('[data-who]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const i = +b.dataset.who, v = b.dataset.v;
    setup.fightBots[i] = v === 'h' ? null : v === 'b' ? lastLv[i] : +v; saveSetup(); sfx.play('click'); drawSlots(s);
    const f = s.querySelector(`[data-who="${i}"][data-v="${v}"]`) || s.querySelector(`#fside${i} [data-who].sel`); if (f) f.focus({ preventScroll: true });
  });
}
// whose keys a side's moves show (two humans: P1 WASD, P2 arrows; one: either)
function sideInfo(i) {
  const p = picks(), H = humanCount(p.bots), L = p.bots[i] == null ? layoutFor(p.bots.slice(0, i).filter(x => x == null).length, H) : 'solo';
  return { id: p.ids[i], L, col: PCOL[i], whose: touchUI() ? (p.bots[i] == null ? (H > 1 ? `P${i + 1}'s buttons` : 'your buttons') : 'the buttons') : p.bots[i] == null ? (H > 1 ? `P${i + 1}'s keys` : 'your keys') : 'one-player keys' };
}
const setSide = (s, i) => { if (mouseSide === i) return; mouseSide = i; s.querySelectorAll('.fv-card').forEach((c, k) => c.classList.toggle('on', k === i)); markRoster(s); };
// a side: its stage (the fighter big, P1/P2 and Info in the corners, the name plate), who plays it under
function drawSlots(s) {
  const p = picks(), H = humanCount(p.bots);
  [0, 1].forEach(i => {
    const box = s.querySelector('#fside' + i), id = p.ids[i], st = FC.FIGHTERS[id], ch = charOf(id), nm = p.rand[i] ? 'Random' : esc(st.name || ch.name);
    const who = p.bots[i] == null ? (H > 1 ? `Player ${i + 1}` : 'Player') : `Bot · ${LEVELS[p.bots[i]]}`;
    box.innerHTML = `<div class="fv-card${mouseSide === i ? ' on' : ''}" style="--pc:${PCOL[i]}">
      <div class="fv-stagebox" role="button" tabindex="0" aria-label="Pick P${i + 1}'s fighter: ${nm}, ${who}"><canvas class="fs-stage" data-i="${i}" data-fid="${esc(id)}" data-at="0.5" data-fy="0.77" data-k="0.78" aria-hidden="true"></canvas>
        <b class="fv-p" aria-hidden="true">P${i + 1}</b>
        <button type="button" class="fv-info" data-info="${i}" aria-label="${esc(st.name || ch.name)}: moves, stats and keys"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.2"/><path d="M10 9v5"/><circle cx="10" cy="6" r=".6"/></svg><span>Info</span></button>
        ${p.rand[i] ? `<span class="fv-randtag" title="Random: this is who you get next. FIGHT uses them, then rolls the next one">Random<small>next up: ${esc(st.name || ch.name)}</small></span>` : ''}
        <div class="fv-plate"><h3 class="fv-n">${esc(st.name || ch.name)}</h3><small>${st.role ? `${esc(st.role)} · ` : ''}${esc(st.lang || '')}</small></div>
        <span class="fv-picking" aria-hidden="true">picking</span></div>
      <div class="fv-who">${whoCtl(i, p.bots[i])}</div></div>`;
    wireWho(s, box);
    const sb = box.querySelector('.fv-stagebox');
    sb.addEventListener('pointerdown', e => { if (!e.target.closest('button')) setSide(s, i); });
    sb.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === sb) { e.preventDefault(); e.stopPropagation(); setSide(s, i); sfx.play('click'); } });
    box.querySelector('[data-info]').onclick = e => { e.stopPropagation(); sfx.play('click'); openDetails(i); };
  });
  markRoster(s); drawMatchBtn(s); drawMatchup(s);
  warm(order());
}
// ---------------------------------------------------------------- the matchup (js/fight-matchup-data.js, test/fight-odds.mjs)
// the share of fights a wins against b at a level ('chill', 'normal', 'ruthless'): { s, n (fights), old (a kit changed
// since: kitSig, js/fight-sig.js) }; a mirror is even; null only when the pair was never measured. Shown even when
// old, marked "measured on an earlier version"
const LV_KEYS = ['chill', 'normal', 'ruthless'];
const stale = id => (((MATCHUPS.measured || {}).sig || {})[id] || '') !== kitSig(id);
export function matchShare(a, b, lv = 'normal') {
  if (a === b) return { s: 0.5, n: 0, old: false };
  const L = (MATCHUPS.levels || {})[lv] || (MATCHUPS.levels || {}).normal; if (!L) return null;
  const x = L.pair[a + ':' + b], y = L.pair[b + ':' + a], v = x || (y && [y[1], y[0]]);
  return v && v[0] + v[1] ? { s: v[0] / (v[0] + v[1]), n: v[0] + v[1], old: stale(a) || stale(b) } : null;
}
// a matchup in a word (the share is about ±10% at 24 fights, so near half is just Even)
export const matchWord = s => { const d = Math.abs(s - 0.5); return d < 0.08 ? 'Even' : d < 0.17 ? 'Slight edge' : d < 0.3 ? 'Favoured' : 'Hard counter'; };
// the level the matchup is shown at: the bot's (P2's if both are bots), Normal between two players
const muLevel = bots => { const b = bots && (bots[1] != null ? bots[1] : bots[0]); return LV_KEYS[b == null ? 1 : b] || 'normal'; };
// the split bar between the two picks: the names and shares big over it, P1's share in red from the left, P2's in blue
// from the right, a word for it and where it's from. ids the two fighters; o = { lv (the level), small (the online
// room's narrow column) }
export function matchupHTML(ids, o = {}) {
  const lv = o.lv || 'normal', m = matchShare(ids[0], ids[1], lv), nm = i => esc(FC.FIGHTERS[ids[i]].name || ids[i]);
  const lvName = LEVELS[LV_KEYS.indexOf(lv)] || 'Normal';
  if (!m) return `<p class="fs-mu-w">No fights measured yet</p>`;
  const p1 = Math.round(m.s * 100), w = matchWord(m.s), fav = m.s > 0.5 ? 0 : 1, mirror = ids[0] === ids[1];
  const who = `<b style="color:${PCOL[fav]}">${nm(fav)}</b>`;
  const line = mirror ? 'Mirror match · even' : w === 'Even' ? 'Even matchup' : w === 'Slight edge' ? `Slight edge to ${who}` : w === 'Favoured' ? `${who} favoured` : `${who} hard counters`;
  const src = mirror ? '' : `<p class="fs-mu-src${m.old ? ' old' : ''}" title="${esc(`${lvName} bots against each other, ${m.n} fights on every map${m.old ? '; a kit has changed since, so it may be off' : ''}`)}">${lvName} bots · ${m.n} fights${m.old ? ' · <b>measured on an earlier version</b>' : ''}</p>`;
  return `<div class="fs-mu-top" aria-hidden="true"><span class="a"><small>${nm(0)}</small>${p1}%</span><span class="b">${100 - p1}%<small>${nm(1)}</small></span></div>
    <div class="fs-mu-bar" role="img" aria-label="${nm(0)} wins ${p1}%, ${nm(1)} ${100 - p1}%"><i class="a" style="width:${p1}%"></i><i class="b"></i></div>
    <p class="fs-mu-w">${line}</p>${src}`;
}
// the select screen's matchup: the two shares either side of a VS over one split bar, a word and where it's from under
function drawMatchup(s) {
  const box = s.querySelector('#fmu'); if (!box) return;
  const p = picks(), lv = muLevel(p.bots), m = matchShare(p.ids[0], p.ids[1], lv), lvName = LEVELS[LV_KEYS.indexOf(lv)] || 'Normal';
  const nm = i => esc(FC.FIGHTERS[p.ids[i]].name || p.ids[i]);
  if (!m) { box.innerHTML = '<div class="fv-vs" aria-hidden="true">VS</div><p class="fv-muw">No fights measured yet</p>'; return; }
  const p1 = Math.round(m.s * 100), w = matchWord(m.s), fav = m.s > 0.5 ? 0 : 1, mirror = p.ids[0] === p.ids[1];
  const line = mirror ? 'Mirror match' : w === 'Even' ? 'Even matchup' : w === 'Slight edge' ? `Slight edge to <b style="color:${PCOL[fav]}">${nm(fav)}</b>` : w === 'Favoured' ? `<b style="color:${PCOL[fav]}">${nm(fav)}</b> favoured` : `<b style="color:${PCOL[fav]}">${nm(fav)}</b> hard counters`;
  const src = mirror ? '' : `<span class="fv-musrc${m.old ? ' old' : ''}" title="${esc(`${lvName} bots against each other, ${m.n} fights on every map${m.old ? '; a kit has changed since, so it may be off' : ''}`)}">${lvName} bots · ${m.n} fights${m.old ? ' · earlier version' : ''}</span>`;
  box.innerHTML = `<div class="fv-mutop"><b class="a">${p1}<small>%</small></b><span class="fv-vs" aria-hidden="true">VS</span><b class="b">${100 - p1}<small>%</small></b></div>
    <div class="fv-mubar" role="img" aria-label="${nm(0)} wins ${p1}%, ${nm(1)} ${100 - p1}%"><i style="width:${p1}%"></i></div>
    <p class="fv-muw">${line}${src}</p>`;
}
// the roster's cursors: each side's pick marked in its colour (the side a click picks for, brighter); a tile's share
// against the other side's pick shows while it's pointed at (and in each fighter's sheet: openDetails)
function markRoster(s) {
  const p = picks(), H = humanCount(p.bots);
  const rt = s.querySelector('[data-rand]');
  if (rt) { rt.classList.toggle('p0', p.rand[0]); rt.classList.toggle('p1', p.rand[1]); rt.setAttribute('aria-pressed', p.rand[0] || p.rand[1]); }
  const foe = p.ids[1 - mouseSide], lv = muLevel(p.bots);
  s.querySelectorAll('[data-tile]').forEach(b => {
    const a = !p.rand[0] && p.ids[0] === b.dataset.tile, c = !p.rand[1] && p.ids[1] === b.dataset.tile;
    b.classList.toggle('p0', a); b.classList.toggle('p1', c); b.setAttribute('aria-pressed', a || c);
    const m = matchShare(b.dataset.tile, foe, lv), sh = m && m.s; let t = b.querySelector('.fv-mut');
    if (sh == null) { if (t) t.remove(); return; }
    if (!t) { t = document.createElement('i'); t.className = 'fv-mut'; t.setAttribute('aria-hidden', 'true'); b.appendChild(t); }
    const d = sh - 0.5; t.textContent = Math.round(sh * 100) + '%'; t.dataset.k = d > 0.1 ? 'up' : d < -0.1 ? 'dn' : 'ev';
    b.title = `${FC.FIGHTERS[b.dataset.tile].name || b.dataset.tile}: wins ${Math.round(sh * 100)}% against ${FC.FIGHTERS[foe].name || foe} (${LEVELS[LV_KEYS.indexOf(lv)]} bot fights)`;
  });
  const ros = s.querySelector('.fv-roster'); if (ros) ros.dataset.on = mouseSide;
  const sideOf = i => `<b style="color:${PCOL[i]}">P${i + 1}</b>`;
  const pf = s.querySelector('#fpick');
  if (pf) pf.innerHTML = `<span class="fv-pf" style="--pc:${PCOL[mouseSide]}">${touchUI() ? 'Tap' : 'Click'} a fighter for <b>P${mouseSide + 1}</b></span><span class="fv-pfo">${touchUI() ? 'tap' : 'click'} ${sideOf(1 - mouseSide)}'s stage to pick theirs</span>`;
  const hint = s.querySelector('#frhint'), kb = t => `<kbd>${t}</kbd>`;
  if (!hint) return;
  if (touchUI()) { hint.innerHTML = ''; return; }
  const wasd = kb('W') + kb('A') + kb('S') + kb('D'), arr = kb('↑') + kb('←') + kb('↓') + kb('→');
  hint.innerHTML = (H === 2 ? `${sideOf(0)} ${wasd} · ${sideOf(1)} ${arr}` : H === 1 ? `${sideOf(p.bots[0] == null ? 0 : 1)} ${wasd} or arrows` : `${sideOf(0)} ${wasd} · ${sideOf(1)} arrows`)
    + ` <span class="fv-hs">·</span> right-click: ${sideOf(1 - mouseSide)} <span class="fv-hs">·</span> ${kb('Enter')} fight`;
}
// the roster's keys on the setup screen: each player moves their own cursor (two on one keyboard: P1 WASD, P2 the arrows;
// one human: WASD or the arrows; bots only: WASD P1, arrows P2). Left/right step along, up/down a row (as laid out); wraps round
function rosterKey(e) {
  const s = document.querySelector('.fv'); if (!s) return false;
  const DIR = { KeyW: [0, -1], KeyA: [0, -1, 1], KeyS: [0, 1], KeyD: [0, 1, 1], ArrowUp: [1, -1], ArrowLeft: [1, -1, 1], ArrowDown: [1, 1], ArrowRight: [1, 1, 1] }[e.code];
  if (!DIR) return false;
  if (e.target && e.target.closest && e.target.closest('.seg') && e.code.startsWith('Arrow')) return false;
  const p = picks(), H = humanCount(p.bots), ids = order();
  const ros = s.querySelector('.fv-roster'), cols = ros ? Math.max(1, +getComputedStyle(ros).getPropertyValue('--cols') || 6) : 6;
  const side = H === 1 ? (p.bots[0] == null ? 0 : 1) : DIR[0];
  const at = ids.indexOf(p.ids[side]), n = ids.length, d = DIR[1] * (DIR[2] ? 1 : cols);
  const j = (((at + d) % n) + n) % n;
  pickSide(s, side, ids[j]);
  return true;
}
// ---------------------------------------------------------------- a fighter's sheet (the select screen's Info): who it
// is, how strong and how hard to play, its numbers and matchups, its moves (each with its clip) and its keys
function openDetails(i) {
  const p = picks(), s = document.querySelector('.fv'), info = sideInfo(i), { id, L, col } = info, st = FC.FIGHTERS[id], ch = charOf(id), b = bars(id);
  const human = p.bots[i] == null, tabs = [['info', 'Fighter'], ['moves', 'Moves'], ...(human ? [['keys', touchUI() ? 'Touch' : 'Keys']] : [])];
  const on = tabs.some(t => t[0] === paneOf[i]) ? paneOf[i] : 'info';
  const strong = strengthOf(id), d = diffOf(id), sk = skillText(id);
  const meter = strong ? `<span class="fv-badge" title="${esc(`Wins ${Math.round(strong.w * 100)}% of Normal bot fights against everyone${strong.old ? ' (measured on an earlier version)' : ''}`)}"><small>Strength</small><span class="fv-pips" role="img" aria-label="Strength ${strong.n} of 5">${[1, 2, 3, 4, 5].map(k => `<i${k <= strong.n ? ' class="on"' : ''}></i>`).join('')}</span></span>` : '';
  const ease = `<span class="fv-badge" data-d="${d}" title="${esc(`${DIFF[d][0]} to play well${sk ? `. ${sk}` : ''}`)}"><small>To play</small><b>${DIFF[d][0]}</b></span>`;
  const statRows = BARS.map(([k, l, tip0]) => { const tip = k === 'ease' && sk ? `${tip0}. ${sk}` : tip0; return `<div class="fv-stat" title="${esc(tip)}"><span>${l}</span><span class="fv-sbar">${b[k] == null ? '' : `<i style="width:${Math.round(b[k] * 100)}%"></i>`}</span></div>`; }).join('');
  const { good, bad } = matchList(id, 99), head = x => `<span class="fv-vh" title="${esc(`${st.name || id} wins ${Math.round(x.s * 100)}% against ${FC.FIGHTERS[x.id].name || x.id} (Normal bots)`)}"><canvas data-head="${x.id}" width="64" height="64" aria-label="${esc(FC.FIGHTERS[x.id].name || x.id)}"></canvas><b>${Math.round(x.s * 100)}%</b></span>`;
  const vsRow = (xs, cls, t) => `<div class="fv-vsl ${cls}"><span class="fv-ol">${t}</span><div class="fv-vhs">${xs.length ? xs.map(head).join('') : '<small class="fv-none">nobody</small>'}</div></div>`;
  const vs = good.length || bad.length ? `<section class="fv-sec"><h4 class="fv-ol">Matchups <small>Normal bots</small></h4>${vsRow(good, 'up', 'Strong vs')}${vsRow(bad, 'dn', 'Weak vs')}</section>` : '';
  const html = `<header class="fv-dh"><canvas class="fv-dface" data-head="${esc(id)}" width="128" height="128" aria-hidden="true"></canvas>
      <div class="fv-dt"><span class="kk-kicker"><b class="fv-p sm">P${i + 1}</b> ${human ? (humanCount(p.bots) > 1 ? `Player ${i + 1}` : 'Player') : `Bot · ${LEVELS[p.bots[i]]}`}</span><h2 class="fv-st">${esc(st.name || ch.name)}</h2><small>${st.role ? `${esc(st.role)} · ` : ''}${esc(st.lang || '')}</small></div>${xBtn}</header>
    <div class="fv-badges">${meter}${ease}</div>
    <div class="fv-tabs" role="tablist">${tabs.map(([k, t]) => `<button type="button" role="tab" data-dtab="${k}" aria-selected="${k === on}"${k === on ? ' class="sel"' : ''}>${t}</button>`).join('')}</div>
    <div class="fv-sb">
      <div class="fv-pane" data-pane="info"${on === 'info' ? '' : ' hidden'}><p class="fv-blurb">${esc(st.blurb || taglineOf(id))}</p>${st.passive ? `<p class="fv-pass"><b>Passive</b> ${esc(st.passive)}</p>` : ''}
        <section class="fv-sec"><h4 class="fv-ol">Numbers <small>measured in bot fights</small></h4><div class="fv-stats">${statRows}</div></section>${vs}</div>
      <div class="fv-pane" data-pane="moves"${on === 'moves' ? '' : ' hidden'}><p class="fv-smh">${esc(info.whose)} · ${touchUI() ? 'tap' : 'click'} a move to watch it</p><div class="fv-mlist">${moveRows(i, id, L)}</div></div>
      ${human ? `<div class="fv-pane" data-pane="keys"${on === 'keys' ? '' : ' hidden'}>${keyBoard(L, id, col)}</div>` : ''}
    </div>`;
  const sh = sheet(html, { side: i, cls: 'fv-dsheet', label: `${st.name || ch.name}: moves, stats and keys`, style: `--pc:${col}` }), box = sh.box;
  box.querySelectorAll('.fs-kcv').forEach(drawKeyCanvas);
  box.querySelectorAll('.fs-tcv').forEach(drawTouchCanvas);
  box.querySelectorAll('canvas[data-icon]').forEach(drawIconCanvas);
  box.querySelectorAll('canvas[data-head]').forEach(drawHeadCanvas);
  box.querySelectorAll('[data-mrow]').forEach(r => r.onclick = () => { sfx.play('click'); inspect(sideInfo(+r.dataset.mrow), r.dataset.k); });
  const tabBtns = [...box.querySelectorAll('[data-dtab]')], show = t => {
    paneOf[i] = t;
    tabBtns.forEach(x => { const o = x.dataset.dtab === t; x.classList.toggle('sel', o); x.setAttribute('aria-selected', o); });
    box.querySelectorAll('[data-pane]').forEach(pn => { pn.hidden = pn.dataset.pane !== t; });
  };
  tabBtns.forEach(x => x.onclick = () => { sfx.play('click'); show(x.dataset.dtab); });
  box.addEventListener('keydown', e => {   // ← → move between the tabs while one has focus
    const at = tabBtns.indexOf(document.activeElement); if (at < 0 || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault(); e.stopPropagation(); const n = tabBtns[(at + (e.key === 'ArrowRight' ? 1 : -1) + tabBtns.length) % tabBtns.length]; n.focus(); show(n.dataset.dtab);
  });
  (box.querySelector('[data-dtab].sel') || box.querySelector('.fv-x')).focus();
  if (s) setSide(s, i);
}
// ---------------------------------------------------------------- one fighter's card (the setup screen's, and the online
// room's, net-ui.js): i the side (0 P1, 1 P2: its colour PCOL[i], unless o.col), id the fighter; o = { head (the card's
// top row, HTML), edit (a pick strip of every fighter on the card itself: the room's; the setup screen has one roster
// for both), L (the keys the moves show), whose (whose keys those are), keys (HTML for the Keys tab: keyBoard; a foot
// that is a keyBoard goes there too), foot (HTML under the tabs), cls }. A showcase: the fighter big on its stage with
// its name plate, then tabs: Fighter (blurb, stat bars, passive), Moves (the rows: key, kind, name; click for the clip),
// Keys. Its stage turns while it's on screen (stageLoop)
export const VS = '<div class="fs-vs" aria-hidden="true">VS</div>';
// on the stage, top corner: how strong (a 5-step meter from its overall at Normal) and how hard to play well
function rateHTML(id) {
  const st = strengthOf(id), d = diffOf(id), dw = DIFF[d][0];
  const meter = st ? `<span class="fs-rt" title="${esc(`Wins ${Math.round(st.w * 100)}% of Normal bot fights against everyone${st.old ? ' (measured on an earlier version)' : ''}`)}"><span class="fs-rl">Strength</span><span class="fs-pips" role="img" aria-label="Strength ${st.n} of 5">${[1, 2, 3, 4, 5].map(k => `<i${k <= st.n ? ' class="on"' : ''}></i>`).join('')}</span></span>` : '';
  const sk = skillText(id);
  return `<div class="fs-rate">${meter}<span class="fs-diff" data-d="${d}" title="${esc(`${dw} to play well${sk ? `. ${sk}` : ''}`)}">${dw}<small> to play</small></span></div>`;
}
// strong against / weak against: the best and worst matchups at Normal, a head and a share each
function vsHTML(id) {
  const { good, bad } = matchList(id), nm = j => esc(FC.FIGHTERS[j].name || j);
  const row = (xs, cls, t) => `<div class="fs-vsl ${cls}"><span class="fs-sl">${t}</span>${xs.length ? xs.map(x => `<span class="fs-vh" title="${esc(`${(FC.FIGHTERS[id] || {}).name || id} wins ${Math.round(x.s * 100)}% against ${FC.FIGHTERS[x.id].name || x.id} (Normal bots)`)}"><canvas data-head="${x.id}" width="64" height="64" aria-label="${nm(x.id)}"></canvas><b>${Math.round(x.s * 100)}%</b></span>`).join('') : '<small class="fs-vnone">nobody</small>'}</div>`;
  if (!good.length && !bad.length) return '';
  return `<div class="fs-vsr">${row(good, 'up', 'Strong vs')}${row(bad, 'dn', 'Weak vs')}</div>`;
}
export function fighterCard(i, id, o = {}) {
  const st = FC.FIGHTERS[id], ch = charOf(id), b = bars(id), col = o.col || PCOL[i], L = o.L || 'solo';
  let keys = o.keys, foot = o.foot || '';
  if (keys == null && foot.includes('class="fs-kb"')) { keys = foot; foot = ''; }
  const tabs = [['info', 'Fighter'], ['moves', 'Moves'], ...(keys ? [['keys', touchUI() ? 'Touch' : 'Keys']] : [])], on = tabs.some(t => t[0] === paneOf[i]) ? paneOf[i] : 'info';
  return `<section class="fs-slot fs-show${o.cls ? ' ' + o.cls : ''}" style="--pc:${col}" aria-label="P${i + 1}" data-side="${i}">
      ${o.head ? `<header class="fs-h">${o.head}</header>` : ''}
      <div class="fs-stagebox"><canvas class="fs-stage" data-i="${i}" data-fid="${esc(id)}" aria-hidden="true"></canvas>
        <div class="fs-plate"><h3 class="fs-n">${esc(st.name || ch.name)}</h3><small>${st.role ? `<b>${esc(st.role)}</b> · ` : ''}${esc(st.lang || '')}</small></div>
        ${rateHTML(id)}</div>
      ${o.edit ? `<div class="fs-pick" role="group" aria-label="P${i + 1}'s fighter">${order().map(fid => `<button type="button" class="fs-f" data-pick="${i}" data-id="${fid}" aria-pressed="${fid === id}" title="${esc(FC.FIGHTERS[fid].name || fid)}" aria-label="${esc(FC.FIGHTERS[fid].name || fid)}"><canvas data-head="${fid}" width="96" height="96"></canvas></button>`).join('')}
        ${soonIds().length ? `${soonIds().map(sid => `<button type="button" class="fs-f soon" disabled title="${esc(charOf(sid).name)}: soon" aria-label="${esc(charOf(sid).name)}: soon"><canvas data-head="${sid}" width="64" height="64"></canvas></button>`).join('')}` : ''}</div>` : ''}
      <div class="fs-tabs" role="tablist">${tabs.map(([k, t]) => `<button type="button" role="tab" data-tab="${k}" data-side="${i}" aria-selected="${k === on}"${k === on ? ' class="sel"' : ''}>${t}</button>`).join('')}</div>
      <div class="fs-panes">
        <div class="fs-pane" data-pane="info"${on === 'info' ? '' : ' hidden'}><p class="fs-blurb fs-tag" title="${esc(st.blurb || '')}">${esc(taglineOf(id))}</p>
          <div class="fs-stats">${BARS.map(([k, l, tip0]) => [k, l, k === 'ease' && skillText(id) ? `${tip0}. ${skillText(id)}` : tip0]).map(([k, l, tip]) => `<span class="fs-sl" title="${esc(tip)}">${l}</span><span class="fs-bar" title="${esc(tip)}">${b[k] == null ? '' : `<i style="width:${Math.round(b[k] * 100)}%"></i>`}</span>`).join('')}</div>
          ${vsHTML(id)}</div>
        <div class="fs-pane" data-pane="moves"${on === 'moves' ? '' : ' hidden'}><p class="fs-blurb">${esc(st.blurb || '')}</p>${st.passive ? `<p class="fs-pass"><b>Passive</b> ${esc(st.passive)}</p>` : ''}<p class="fs-smh">${esc(o.whose || (touchUI() ? 'the buttons' : 'one-player keys'))} · ${touchUI() ? 'tap' : 'click'} one to watch it</p>
          <div class="fs-mlist">${moveRows(i, id, L)}</div></div>
        ${keys ? `<div class="fs-pane" data-pane="keys"${on === 'keys' ? '' : ' hidden'}>${keys}</div>` : ''}
      </div>
      ${foot}
    </section>`;
}
// a human's keys drawn as on the keyboard, with what isn't drawn under it (a touch screen: the touch controls instead)
export const keyBoard = (L, id, col) => touchUI() ? touchBoard(id, col) : `<div class="fs-kb"><canvas class="fs-kcv" data-layout="${L}" data-fid="${esc(id)}" data-col="${col}" aria-label="${esc(keysText(L))}"></canvas>
        <p class="fs-keys">${keysText(L, true)}</p></div>`;
// the touch controls drawn as they sit on the screen (fight-touch.js), and what they do
const touchBoard = (id, col) => `<div class="fs-kb fs-tb"><canvas class="fs-tcv" data-fid="${esc(id)}" data-col="${col}" aria-label="Touch controls: a thumb stick on the left, four buttons on the right"></canvas>
        <p class="fs-keys"><b>Left thumb</b>: the stick appears where you touch, and moves you. <b>Right thumb</b>: your three moves and your evade (the corner one). A move that aims or steers follows the stick while you hold it. ⏸ top right pauses.</p></div>`;
function drawTouchCanvas(cv) {
  const w = 280, h = 140, D = Math.min(2, devicePixelRatio || 1); cv.width = w * D; cv.height = h * D; cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const g = cv.getContext('2d'); g.setTransform(D, 0, 0, D, 0, 0); drawTouchDiagram(g, cv.dataset.fid, cv.dataset.col, w, h);
}
// a move's button on the touch screen, as a little map of the four (the one lit is this move's)
const ACT_OF = { move1: 'light', hold1: 'light', move2: 'heavy', move3: 'special', evade: 'guard' };
const touchGlyph = k => `<span class="fs-tg" aria-label="${k === 'evade' ? 'the corner button' : 'button ' + k.slice(4)}">${['guard', 'light', 'heavy', 'special'].map(a => `<i data-a="${a}"${ACT_OF[k] === a ? ' class="on"' : ''}></i>`).join('')}</span>`;
const drawHeadCanvas = cv => { const g = cv.getContext('2d'), n = cv.width / 2, draw = () => { g.clearRect(0, 0, n * 2, n * 2); fightHead(g, charOf(cv.dataset.head), n, n, n - 3, null, null, 0.4, draw); }; draw(); };
// the cards' canvases and clicks: o = { info(i) -> { id, L, whose, col } (for a move's close-up), pick(i, id) (a fighter
// picked on an editable card) }
export function wireCards(box, o) {
  box.querySelectorAll('.fs-kcv').forEach(drawKeyCanvas);
  box.querySelectorAll('.fs-tcv').forEach(drawTouchCanvas);
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
  return ['up', 'left', 'down', 'right'].map(a => `${a}: ${k(a).join(' or ')}`).join(', ') + `, moves: ${['light', 'heavy', 'special'].map(a => k(a).join(' or ')).join(', ')}, evade: ${k('guard').join(' or ')}`;
}
function drawKeyCanvas(cv) {
  const L = cv.dataset.layout, u = 30, sz = keysSize(L, u), D = Math.min(2, devicePixelRatio || 1), id = cv.dataset.fid, lg = legendSize(u);
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
// How to play's touch line (fight-touch.js)
const TOUCH_HOWTO = `<li><b>Touch</b> (iPhone, iPad): put your left thumb down anywhere on the left and a stick appears under it: it moves you. The four round buttons in the bottom right corner are your three moves and, in the corner, your evade, each with its icon and its cooldown. A move that aims or steers follows the stick while you hold its button. ⏸ in the top right corner pauses. Two players on one iPad: each takes a half of the screen, with a stick and buttons of their own.</li>`;
// How to play's Fight tab (menu.js): the rules (three big moves and an evade each, one key each), then each fighter's
// moves with their tells and answers, then the keys
export function fightHowto() {
  const kb = t => `<kbd>${esc(t)}</kbd>`, row = (L, who) => { const K = LAYOUTS[L].keys, k = a => K[a].map(c => kb(keyLabelOf(c))).join(' '); return `<li><b>${who}</b>: ${k('up')}${k('left')}${k('down')}${k('right')} move, ${k('light')} ${k('heavy')} ${k('special')} your three moves, ${k('guard')} your evade</li>`; };
  const fighter = id => { const st = FC.FIGHTERS[id]; return `<li><b>${esc(st.name)}</b> (${esc(st.lang || '')}): ${moveOrder(id).map(k => `<b>${esc(moveName(id, k))}</b> (${esc(moveDesc(id, k))}${moveTell(id, k) ? ` Tell: ${esc(moveTell(id, k))}` : ''}${moveAnswer(id, k) ? ` Answer: ${esc(moveAnswer(id, k))}` : ''})`).join('; ')}</li>`; };
  return `<ul class="ln-list"><li><b>Pick a map.</b> ${ARENA_ORDER.map(id => `<b>${esc(ARENAS[id].name)}</b>: ${esc(ARENAS[id].blurb)}`).join(' ')}</li><li><b>1v1, health only.</b> Knock their health to zero to win the round. The first to win 2 rounds takes the match: on the select screen pick first to 1, 2, 3 or 5, and 40, 60 or 90 s a round. The arena's wall keeps everyone in: knock someone into it hard and they slam off it and go down. When the clock runs out it's sudden death: every hit does more damage, rising to triple, until someone goes down.</li>
    <li><b>Three big moves and an evade.</b> No jabs and no shield: each fighter has three moves of their own, one key each, and an evade on the fourth. Every move and evade has a cooldown (its key sweeps back round as it comes back), so pick your moment. Some moves aim or steer while you hold the key.</li>
    <li><b>Read the tells.</b> Every big move shows it's coming: a line on the floor, a shadow, a mark behind you, a grey ring, a stain, lanes of loose earth, cracks, a ring of chains. Walk out of it, or evade it. Every move leaves its user open for a moment when it misses: punish that.</li>
    <li><b>Clean hits.</b> Hit someone while they wind up and it's a <b>counter</b>: more damage (a big sharp star). Big hits and hard wall slams <b>knock them down</b>: they can't be hit lying there, then they get up (untouchable for a moment).</li>
    <li><b>Who's who.</b> ${esc(order().map(id => FC.FIGHTERS[id].name).join(', ').replace(/, ([^,]*)$/, ' and $1'))}.</li></ul>
    <p class="help"><b>The fighters</b></p><ul class="ln-list">${order().map(fighter).join('')}</ul>
    <p class="help"><b>Controls</b> (a keyboard, a gamepad or a touch screen)</p><ul class="ln-list">${row('solo', 'One player')}${row('p1', 'Two players, P1')}${row('p2', 'Two players, P2')}
    <li><b>Gamepad</b>: stick or d-pad move, ${kb('A')} ${kb('X')} ${kb('B')} your three moves, ${kb('LB')} / ${kb('RB')} your evade, ${kb('Start')} pause</li>
    ${TOUCH_HOWTO}</ul>
    <p class="help">${kb('Esc')} or ${kb('P')} pauses (on a touch screen, the ⏸ in the top right corner). The setup screen shows every move with a little clip, its tell and its answer.</p>`;
}
// the moves in plain words: what kind of move each is (the fighter's own name for it comes under)
const kcap = t => `<kbd>${esc(t)}</kbd>`;
// a three-move move's tab in the close-up: its name, short
const shortTab = (id, k) => { const m = cardMove(id, k); if (m && m.short) return m.short; const n = moveName(id, k); return n.length > 14 ? n.split(/[ ,]/)[0] : n; };   // (a move's own short name first: the plug-ins')
const keyCaps = (L, k, short) => moveKeys(L, k).filter(t => t !== 'hold').map((t, j, a) => t === '+' ? '<i class="fs-plus">+</i>' : kcap(short && a[j - 1] === '+' ? '↔' : t)).join('');   // (short: a step's directions as one arrow, in the list)
// a move's cooldown in words: Duke's evade's charges each come back on their own
const secs = x => String(+(+x).toFixed(1));
const cdText = (id, k, long) => { const m = cardMove(id, k); if (!m) return ''; if (m.charges) return m.recharge ? `${long ? 'each charge back in ' : ''}${secs(m.recharge)} s${long ? '' : ' each'}` : ''; return m.cooldown ? `${long ? 'back in ' : ''}${secs(m.cooldown)} s${long ? '' : ' cooldown'}` : ''; };
// a fighter's moves as a list in its card: the key big, what kind of move, its name; click one to watch it
function moveRows(i, id, L) {
  return moveOrder(id).map(k => `<button type="button" class="fs-mrow fs-m4" data-mrow="${i}" data-k="${k}"><span class="fs-mkey">${touchUI() && ACT_OF[k] ? touchGlyph(k) : keyCaps(L, k, true)}</span>
      <span class="fs-mic"><canvas data-icon="${esc((cardMove(id, k) || {}).icon || '')}" data-col="${PCOL[i]}" width="56" height="56" aria-hidden="true"></canvas></span>
      <span class="fs-mtx"><b>${esc(moveName(id, k))}</b><small>${k === 'evade' ? `${esc(moveKind(k))} · ` : ''}${esc(moveHold(id, k))}${cdText(id, k) ? ` · <span class="fs-mcd" title="${esc(cdText(id, k, true))}">↻ ${esc(cdText(id, k).replace(/ (cooldown|each)$/, ''))}</span>` : ''}</small></span><span class="fs-mgo" aria-hidden="true">›</span></button>`).join('');
}
// one move up close: its clip big, the keys (and pad button), what it does; ← → or the tabs go through the others
function inspect(info, k0) {
  if (document.querySelector('.fs-ov')) return;
  const { id, L, whose, col } = info, st = FC.FIGHTERS[id], ORD = moveOrder(id);
  const back = document.createElement('div'); back.className = 'cl-back fs-ov';
  back.innerHTML = `<div class="panel cl-box fs-obox" role="dialog" aria-label="${esc(st.name)}'s moves" style="--pc:${col}">
    <div class="cl-head"><h2>${esc(st.name)}'s moves</h2><button type="button" class="cl-x" aria-label="Close">✕</button></div>
    <div class="fs-otabs" role="tablist">${ORD.map(k => `<button type="button" role="tab" data-ot="${k}">${esc(shortTab(id, k))}</button>`).join('')}</div>
    <div class="fs-obody"><canvas class="fs-clip fs-oclip" aria-hidden="true"></canvas>
      <div class="fs-oinfo"><span class="fs-ck" id="fok"></span><h3 class="fs-on" id="fon"></h3>
        <div class="fs-okeys"><span class="fs-okl">Press</span><span id="fokey"></span><span class="fs-okl" id="fohow"></span></div>
        <p class="fs-od" id="fod"></p><p class="fs-otell" id="fotell" hidden><b>Tell</b> <span></span></p><p class="fs-oans" id="foans" hidden><b>Answer</b> <span></span></p><p class="fs-ohint">${esc(whose)}<span class="kb-only"> · <kbd>←</kbd> <kbd>→</kbd> other moves · <kbd>Esc</kbd> close</span></p></div></div></div>`;
  document.body.append(back);
  let cur = ORD.includes(k0) ? k0 : ORD[0];
  const q = sel => back.querySelector(sel), cv = q('.fs-oclip');
  const show = k => {
    cur = k; stopClips();
    for (const b of back.querySelectorAll('[data-ot]')) { const on = b.dataset.ot === k; b.classList.toggle('sel', on); b.setAttribute('aria-selected', on); }
    q('#fok').textContent = moveKind(k); q('#fon').textContent = moveName(id, k); q('#fod').textContent = moveDesc(id, k);
    q('#fokey').innerHTML = touchUI() && ACT_OF[k] ? touchGlyph(k) : keyCaps(L, k); q('#fohow').textContent = moveHold(id, k) + (cdText(id, k, true) ? ` · ${cdText(id, k, true)}` : '');
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
// each fighter's own: its moves' keyframes (show), and its cheer (picked, or the results' fist pump)
const showOf = id => FC.FIGHTERS[id].show, cheerOf = id => FC.FIGHTERS[id].cheer;
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mixC = (a, b, t, al = 1) => { const A = hexRgb(a), B = hexRgb(b); return `rgba(${A.map((v, k) => Math.round(v + (B[k] - v) * t)).join(',')},${al.toFixed(3)})`; };
function stageBack(g, w, h, col, i, t, still, pop, at, fyr = 0.86) {   // (at: the plinth's centre as a share of the width, the showcase's off-centre one by default; fyr its height)
  const BD = bold(), dark = BD ? '#1b1742' : '#16123a', cx = w * (at ?? (i ? 0.43 : 0.57)), fy = h * fyr;
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
      const { cx, fy, k } = stageBack(g, w, h, /^#[0-9a-f]{6}$/i.test(col) ? col : PCOL[i], i, t, still, pop, cv.dataset.at ? +cv.dataset.at : undefined, cv.dataset.fy ? +cv.dataset.fy : undefined);
      const ks = cv.dataset.k ? +cv.dataset.k : 1;
      const SH = showOf(id), pose = still ? 'stand' : pop < 1.3 ? (pop < 0.7 ? 'stand' : cheerOf(id)) : SH[Math.floor((t + i * 2.1) / 1.3) % SH.length];
      const yaw = (i ? Math.PI - 0.55 : 0.55) + (still ? 0 : Math.sin(t * 0.9 + i) * 0.3) + (pop < 0.7 ? (1 - pop / 0.7) * TAU : 0);
      g.save(); g.translate(cx, fy - (pop < 0.35 ? Math.sin(pop / 0.35 * Math.PI) * 14 * k : 0));
      const o = { t, scale: k * 1.45 * ks, smooth: true, yaw, pose, mood: pop < 1.6 ? 'happy' : null, fight: true };
      if (!M3.drawMascot3D(g, ch, o)) drawMascot(g, ch, { t, scale: k * 1.45 * ks, mood: o.mood, look: [Math.cos(yaw), Math.sin(yaw)], face: Math.cos(yaw) < 0 ? -1 : 1 });
      g.restore();
    }
    stageRaf = requestAnimationFrame(draw);
  };
  stageRaf = requestAnimationFrame(draw);
}

// the results' hero: the winner on their stage cheering, the loser small and dazed behind, confetti (reduced: still)
function resHero(cv, F, w) {
  const win = charOf(F.f[w].id), lose = charOf(F.f[1 - w].id), wid = F.f[w].id, t0 = performance.now() / 1000, D = Math.min(2, devicePixelRatio || 1), still = settings.reduced;
  const gold = bold() ? '#ffc23a' : '#ffd23c', cols = [PCOL[w], '#ffffff', gold];
  const conf = still ? [] : Array.from({ length: 38 }, (_, k) => ({ x: frnd(0.02, 0.98), d: frnd(0, 0.9), sp: frnd(0.13, 0.22), s: frnd(3.5, 6.5), a: frnd(0, TAU), spin: frnd(-3, 3), fl: frnd(0, TAU), sw: frnd(8, 22), col: cols[k % 3] }));
  let last = 0;
  const draw = () => {
    if (!cv.isConnected) return;
    const t = performance.now() / 1000, pop = t - t0, cw = cv.clientWidth, ch = cv.clientHeight;
    if (cw && ch && (!still || t - last > 0.4)) {
      last = t;
      if (cv.width !== Math.round(cw * D) || cv.height !== Math.round(ch * D)) { cv.width = Math.round(cw * D); cv.height = Math.round(ch * D); }
      const g = cv.getContext('2d'); g.setTransform(D, 0, 0, D, 0, 0); g.clearRect(0, 0, cw, ch);
      const wide = cw / ch > 1.15, at = wide ? 0.56 : 0.42;
      const { cx, fy, k } = stageBack(g, cw, ch, PCOL[w], w, t, still, still ? -9 : pop - 0.25, at);
      // the loser at the back, small, sitting dazed (stars wheeling over their head)
      const lx = cw * (wide ? 0.86 : 0.79), ly = fy - ch * (wide ? 0.06 : 0.03), ls = k * (wide ? 0.4 : 0.34);
      g.fillStyle = 'rgba(10,8,30,0.3)'; g.beginPath(); g.ellipse(lx, ly + 2, 15 * ls, 4 * ls, 0, 0, TAU); g.fill();
      g.save(); g.translate(lx, ly); g.globalAlpha = 0.95;
      const lo = { t, scale: ls, smooth: true, yaw: Math.PI * 0.62, pose: 'hurt', mood: 'dizzy', fight: true };
      if (!M3.drawMascot3D(g, lose, lo)) drawMascot(g, lose, { t, scale: ls, mood: 'dizzy', look: [-1, 0], face: -1 });
      g.restore();
      for (let n = 0; n < 3; n++) {
        const a = (still ? 0 : t * 2.6) + n * TAU / 3, sx = lx + Math.cos(a) * 13 * ls, sy = ly - 50 * ls + Math.sin(a) * 4 * ls, sz = (Math.sin(a) > 0 ? 3.2 : 2.4) * ls;
        g.save(); starPath(g, sx, sy, sz, sz * 0.45, 5, -Math.PI / 2); g.fillStyle = gold; g.fill(); g.restore();
      }
      // the winner
      const u = pop - 0.25, beat = still ? 0 : Math.max(0, u - 0.9) % 2.2, hop = still || u < 0 ? 0 : u < 0.35 ? Math.sin(u / 0.35 * Math.PI) * 16 : beat < 0.32 ? Math.sin(beat / 0.32 * Math.PI) * 12 : 0;
      const pose = still || u < 0.9 ? 'stand' : beat < 0.5 ? cheerOf(wid) : 'stand';
      const yaw = Math.PI / 2 + (w ? 0.35 : -0.35) + (still ? 0 : Math.sin(t * 0.8) * 0.18) + (!still && u < 0.7 ? (1 - Math.max(0, u) / 0.7) * TAU : 0);
      const sc = k * (wide ? 0.95 : 1.02);
      g.save(); g.translate(cx, fy - hop * k); if (!still && u < 0.25) { const q = Math.max(0, u) / 0.25; g.globalAlpha = q; g.scale(0.7 + 0.3 * q, 0.7 + 0.3 * q); }
      const o = { t, scale: sc, smooth: true, yaw, pose, mood: 'happy', fight: true };
      if (!M3.drawMascot3D(g, win, o)) drawMascot(g, win, { t, scale: sc, mood: 'happy', look: [Math.cos(yaw), Math.sin(yaw)] });
      g.restore();
      // confetti: paper bits fluttering down, their faces turning
      for (const p of conf) {
        const q = (pop - 0.3) * p.sp - p.d; if (q < 0) continue;
        const y = (q % 1.15 - 0.08) * ch, x = p.x * cw + Math.sin(p.fl + pop * 2.2) * p.sw, flip = Math.cos(p.fl + pop * 7);
        g.save(); g.translate(x, y); g.rotate(p.a + pop * p.spin * 0.4); g.fillStyle = p.col;
        g.fillRect(-p.s, -p.s * 0.55 * Math.abs(flip) - 0.3, p.s * 2, p.s * 1.1 * Math.abs(flip) + 0.6); g.restore();
      }
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

// ---------------------------------------------------------------- starting, pausing, leaving
const S = { F: null, cfg: null, paused: false, hold: false, card: null, phase: '', introT: -1, introN: -1, beat: 0, endT: 0, stats: null, prevHp: null, keys: new Set(), src: [], net: null };
// the training room (js/fight-practice.js): P1's fighter (you) against P2's pick as the dummy, on the picked map (a
// Random side: its next roll, as FIGHT would)
export function startPracticeFromSetup(mode) { const p = picks(); startFight({ ids: [...p.ids], rand: [false, false], bots: [null, null], arena: pickArena(p.arena), practice: true, mode }); nextRolls(); }
export function startFightFromSetup() { const p = picks(), cfg = { ids: [...p.ids], rand: [...p.rand], bots: [...p.bots], arena: pickArena(p.arena), ...matchCfg(p.rounds, p.time) }; nextRolls(); startFight(cfg); }   // (a Random side: the fighter its stage showed; the next one rolled for after)
// Random: a map drawn when FIGHT is pressed (a menu choice, not the fight's luck; Rematch keeps it: it reuses the fight's cfg)
export const pickArena = a => a === 'random' ? ARENA_ORDER[Math.floor(Math.random() * ARENA_ORDER.length)] : a;
const mapName = a => a === 'random' ? 'Random' : (ARENAS[a] || ARENAS[ARENA_ORDER[0]]).name;
// the Random card: the four maps' thumbnails as a little 2x2 mosaic, dimmed, under a die
// a die (side s, centred on cx, cy): the map's and the roster's Random
function dice(g, cx, cy, s) {
  const x = cx - s / 2, y = cy - s / 2, r = s * 0.23, d = s * 0.1;
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.roundRect(x + s * 0.07, y + s * 0.1, s, s, r); g.fill();
  g.fillStyle = '#f4f1ff'; g.beginPath(); g.roundRect(x, y, s, s, r); g.fill();
  g.fillStyle = '#2b2456'; for (const [px, py] of [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]]) { g.beginPath(); g.arc(x + px * s, y + py * s, d, 0, Math.PI * 2); g.fill(); }
}
function randomThumb(g, w, h) {
  const hw = w / 2, hh = h / 2;
  ARENA_ORDER.slice(0, 4).forEach((id, k) => { g.save(); g.beginPath(); g.rect((k % 2) * hw, (k >> 1) * hh, hw, hh); g.clip(); g.translate((k % 2) * hw, (k >> 1) * hh); g.scale(0.5, 0.5); drawArenaThumb(g, ARENAS[id], w, h, PCOL); g.restore(); });
  g.fillStyle = 'rgba(20,16,42,0.45)'; g.fillRect(0, 0, w, h);
  dice(g, w / 2, h / 2, 30);
}
export function startFight(cfg, opt = {}) {
  sfx.ensure(); stopClips();
  closeCard();
  S.net = opt.net || null;   // online (fight-net.js): see "online" below
  S.cfg = S.net ? S.net.F.cfg : { bestOf: 3, roundTime: 60, ...cfg, seed: cfg.seed ?? (Math.random() * 2 ** 31) | 0 };   // (the UI's seed: the fight's own luck is its mulberry)
  S.F = S.net ? S.net.F : new Fight(S.cfg);
  S.practice = S.cfg.practice && !S.net ? new Practice(S.F, { done: loadDone(S.cfg.ids[0]), mode: cfg.mode }) : null;   // (the training room: it runs the fight, fightFrame)
  game.practice = S.practice;   // (for the dev tools)
  S.paused = false; S.hold = false; S.zoom = 0; S.phase = ''; S.introT = 0; S.introN = -1; S.endT = 0; S.prevHp = S.F.f.map(f => f.hp); S.stats = newStats();
  S.keys.clear();
  game.state = 'fight'; game.race = null; game.cup = null; game.fight = S.F; game.fightLive = true; game.fightPause = () => pause(true);
  Input.reset();
  initFightTouch({ active: () => game.state === 'fight' && !!S.F && !S.card, pause: () => pause(true) });
  touchReset(S.net || S.practice ? 1 : Math.max(1, S.cfg.bots.filter(b => b == null).length));
  const ui = document.getElementById('ui'); ui.innerHTML = ''; clearForRace();
  if (S.pui) { S.pui.destroy(); S.pui = null; }
  if (S.practice) { S.pui = mountPractice(S.practice, { touch: () => touchOn() || touchUI(), act: a => a === 'reset' ? act('restart') : a === 'menu' ? pause(true) : null }); ui.append(S.pui.el); }
  sfx.music('fight:' + S.F.cfg.arena);   // (each arena's own theme: audio.js FIGHT_THEMES)
  warm(S.cfg.ids);
}
function leave() {
  if (S.pui) { S.pui.destroy(); S.pui = null; } S.practice = game.practice = null;
  if (S.net) { const n = S.net; endFight(); n.quit(); return; }   // online: out of the room (net-ui.js shows the menu)
  closeCard(); S.F = null; game.fight = null; game.fightLive = false;
  if (setup.mode !== 'fight') setMode('fight');
  showMenu('fight');
}
function pause(on) {
  if (!S.F || S.card && S.card.kind === 'results') return;
  if (on && !S.paused) { S.paused = true; game.fightLive = !!S.net; touchRelease(); openCard('pause'); }   // (online the fight goes on under the card)
  else if (!on && S.paused) { S.paused = false; game.fightLive = true; closeCard(); }
}
function closeCard() { if (S.card) { if (S.card.el._fit) removeEventListener('resize', S.card.el._fit); S.card.el.remove(); S.card = null; } document.body.classList.remove('fz-out'); }
// shrink one-line titles (long online names) until they fit
function fitText(el) {
  for (const t of el.querySelectorAll('.fz-h, .fz-pn')) {
    t.style.fontSize = ''; let fs = parseFloat(getComputedStyle(t).fontSize), n = 0;
    while (n++ < 24 && fs > 12 && t.scrollWidth > t.clientWidth + 1) { fs *= 0.93; t.style.fontSize = fs + 'px'; }
  }
}
function openCard(kind) {
  closeCard(); touchRelease();
  const el = document.createElement('div'); el.className = 'cl-back pause-back fight-back';
  const kb = !touchOn() && !touchUI();   // (touch: no key hints on the buttons)
  const k = t => kb ? ` <kbd>${t}</kbd>` : '';
  if (kind === 'pause' && S.practice) {   // the training room's: the dummy's modes, reset, back to the select screen
    const P = S.practice;
    el.innerHTML = `<div class="panel cl-box pause-box fz-pbox kk" role="dialog" aria-modal="true" aria-labelledby="fz-h"><span class="kk-kicker">Training</span><h2 class="pause-h kk-title" id="fz-h">Practice</h2>
      <div class="pause-btns"><button type="button" class="kk-btn go pz-main" data-a="resume">Resume${k('Esc')}</button>
      <div class="fz-dummy"><span class="kk-kicker">The dummy</span><div class="fz-modes" role="group" aria-label="The dummy">${MODES.map(([m, n], j) => `<button type="button" class="kk-btn" data-a="mode:${m}" aria-pressed="${P.mode === m}" title="${esc(MODES[j][2])}">${esc(n)}${k(j + 1)}</button>`).join('')}</div></div>
      <button type="button" class="kk-btn" data-a="restart">Reset positions${k('R')}</button><button type="button" class="kk-btn" data-a="quit">Back to fighter select${k('Q')}</button></div>
      <div class="pause-set"><label class="set-row"><span>Sound</span><input type="checkbox" class="switch" id="fz-sound"${sfx.muted ? '' : ' checked'}></label><label class="set-row"><span>Screen shake</span><input type="checkbox" class="switch" id="fz-shake"${settings.shake ? ' checked' : ''}></label></div></div>`;
    el.querySelector('#fz-sound').onchange = e => sfx.setMuted(!e.target.checked);
    el.querySelector('#fz-shake').onchange = e => { settings.shake = e.target.checked; saveSettings(); };
  } else if (kind === 'pause') {
    const F = S.F, nm = i => esc(FC.FIGHTERS[F.f[i].id].name || F.f[i].id);
    const face = i => `<canvas class="fz-pface" data-i="${i}" width="96" height="96" aria-hidden="true"></canvas>`;
    el.innerHTML = `<div class="panel cl-box pause-box fz-pause fz-pbox kk" role="dialog" aria-modal="true" aria-labelledby="fz-h"><h2 class="pause-h kk-title" id="fz-h">Paused</h2>
      <div class="fz-pscore" role="img" aria-label="Round ${F.round}, ${nm(0)} ${F.f[0].wins}, ${nm(1)} ${F.f[1].wins}"><span class="fz-psd" style="--c:${PCOL[0]}">${face(0)}<b>${nm(0)}</b></span><span class="fz-pnum"><b style="--c:${PCOL[0]}">${F.f[0].wins}</b><i>–</i><b style="--c:${PCOL[1]}">${F.f[1].wins}</b></span><span class="fz-psd" style="--c:${PCOL[1]}">${face(1)}<b>${nm(1)}</b></span><small>Round ${F.round} · first to ${winsToTake(F.cfg)} · ${F.cfg.roundTime} s rounds</small></div>
      <div class="pause-btns"><button type="button" class="kk-btn go pz-main" data-a="resume">Resume${k('Esc')}</button>${S.net ? '' : `<button type="button" class="kk-btn" data-a="restart">Restart fight${k('R')}</button>`}<button type="button" class="kk-btn" data-a="quit">${S.net ? (S.net.role === 'host' ? 'Close room' : 'Leave room') : `Quit to menu${k('Q')}`}</button></div>
      <div class="pause-set"><label class="set-row"><span>Sound</span><input type="checkbox" class="switch" id="fz-sound"${sfx.muted ? '' : ' checked'}></label><label class="set-row"><span>Screen shake</span><input type="checkbox" class="switch" id="fz-shake"${settings.shake ? ' checked' : ''}></label></div></div>`;
    el.querySelector('#fz-sound').onchange = e => sfx.setMuted(!e.target.checked);
    el.querySelector('#fz-shake').onchange = e => { settings.shake = e.target.checked; saveSettings(); };
    el.querySelectorAll('.fz-pface').forEach(cv => { const i = +cv.dataset.i, g = cv.getContext('2d'), draw = () => { g.clearRect(0, 0, 96, 96); fightHead(g, charOf(F.f[i].id), 48, 48, 44, PCOL[i], null, 0.4, draw); }; draw(); });
  } else {
    // the match's end, full screen: the winner's stage left (top when upright), the score, rounds, numbers and buttons
    // right. Online: the host's Rematch / Back to room, a player waits
    const F = S.F, w = F.winner ?? 0, name = i => esc(FC.FIGHTERS[F.f[i].id].name || F.f[i].id), H = F.cfg.bots.map(b => b == null);
    const solo = H.filter(Boolean).length === 1, youLost = S.net ? S.net.me >= 0 && S.net.me !== w : solo && !H[w], youWon = S.net ? S.net.me === w : solo && H[w];
    const title = S.net ? netTitle(w, name) : solo ? (H[w] ? 'You win!' : `${name(w)} wins`) : H[w] && H.every(Boolean) ? `P${w + 1} wins!` : `${name(w)} wins`;
    tally(S.stats, F, S.prevHp);   // (up to date, whatever ran last)
    const wins = [0, 1].map(i => F.f[i].wins), rounds = Array.isArray(F.rounds) ? F.rounds : [], need = winsToTake(F.cfg);
    const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const how = need === 1 ? 'One round, one winner' : wins[1 - w] === 0 ? 'Clean sweep' : wins[1 - w] === need - 1 ? 'Down to the wire' : 'Hard fought';
    const tag = i => S.net ? esc(who(i) === 'bot' ? 'Bot' : who(i)) : H[i] ? (solo ? 'You' : `P${i + 1}`) : `Bot · ${LEVELS[F.cfg.bots[i]] || 'Normal'}`;
    const stars = i => `<span class="kk-stars fz-stars" aria-label="${wins[i]} rounds won">${Array.from({ length: need }, (_, k) => `<i${k < wins[i] ? ' class="on"' : ''} style="--k:${k}"></i>`).join('')}</span>`;
    const side = i => `<div class="fz-side${i === w ? ' win' : ''}" style="--c:${PCOL[i]}"><canvas class="fz-head" data-i="${i}" width="160" height="160" aria-hidden="true"></canvas><b class="fz-sn">${name(i)}</b><span class="kk-tag fz-who" title="${tag(i)}">${tag(i)}</span>${stars(i)}</div>`;
    // a number head to head: both values in chips (the leader's filled in its colour), the label over a track whose two
    // halves grow out from the middle, each side's as a share of the larger
    const stat = (l, f) => { const a = f(0), b = f(1), m = Math.max(a, b) || 1, w = v => (v / m * 100).toFixed(1) + '%';
      return `<div class="fz-stat${a > b ? ' l0' : b > a ? ' l1' : ''}" aria-label="${l}: ${a} to ${b}"><b class="fz-v a">${a}</b><span class="fz-sm"><span class="fz-sl">${l}</span><span class="fz-tr" aria-hidden="true"><i class="a"><i style="width:${w(a)}"></i></i><i class="b"><i style="width:${w(b)}"></i></i></span></span><b class="fz-v b">${b}</b></div>`; };
    const S0 = S.stats, total = rounds.reduce((x, r) => x + (r.time || 0), 0), st = FC.FIGHTERS[F.f[w].id] || {};
    const btn = (a, label, o = {}) => `<button type="button" class="kk-btn${o.go ? ' go pz-main' : ''}${o.cls ? ' ' + o.cls : ''}" data-a="${a}"${o.tip ? ` title="${esc(o.tip)}"` : ''}>${o.short ? `<span class="l">${label}</span><span class="s">${o.short}</span>` : `<span>${label}</span>`}${o.key && kb ? `<kbd>${o.key}</kbd>` : ''}</button>`;
    const btns = S.net ? (S.net.rematch ? `<div class="fz-btns two">${btn('rematch', 'Rematch', { go: 1, key: 'Enter' })}${btn('back', 'Back to room', { key: 'Esc' })}</div>`
      : `<div class="fz-btns two"><p class="fz-wait" role="status"><i class="fz-spin" aria-hidden="true"></i><span>Waiting for the host: rematch or room</span></p>${btn('quit', 'Leave room', { cls: 'pz-main', key: 'Esc' })}</div>`)
      : `<div class="fz-btns">${btn('rematch', 'Rematch', { go: 1, key: 'Enter', cls: 'fz-main' })}${F.f[0].id !== F.f[1].id ? btn('swap', 'Swap fighters', { short: 'Swap', tip: 'The same fight with the two fighters traded' }) : ''}${btn('back', 'Change fighters', { short: 'Fighters', tip: 'Back to the select screen, your picks kept' })}${btn('home', 'Menu', { tip: 'The title screen' })}</div>`;
    const keys = kb ? `<p class="fz-keys">${S.net && !S.net.rematch ? '<kbd>Esc</kbd> leave' : `<kbd>Enter</kbd> rematch · <kbd>Esc</kbd> ${S.net ? 'back to room' : 'change fighters'}`} · <kbd>←</kbd><kbd>→</kbd> choose</p>` : '';
    el.className = 'fz-screen kk' + (youLost ? ' lost' : '') + (F.f[0].id === F.f[1].id ? '' : '');
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'fz-rh');
    el.style.cssText = `--pc:${PCOL[w]};--c:${PCOL[w]};--c0:${PCOL[0]};--c1:${PCOL[1]}`;
    el.innerHTML = `<div class="fz-hero"><canvas class="fz-stage" aria-hidden="true"></canvas>
        <div class="fz-plate"><span class="kk-tag" style="--c:#14102a">${tag(w)}</span><b class="fz-pn">${name(w)}</b><small>${st.role ? `${esc(st.role)} · ` : ''}${esc(st.lang || '')}</small></div></div>
      <div class="fz-panel"><div class="fz-in">
        <header class="fz-top kk-in" style="--d:.5s"><span class="kk-kicker">${youWon ? 'Victory' : youLost ? 'Good fight' : 'Match over'}</span><h2 class="kk-title fz-h" id="fz-rh">${title}</h2>
          <p class="fz-how"><span class="kk-chip">${how}</span><small>${esc(mapName(F.cfg.arena || ''))} · first to ${need} · ${clock(total)}</small></p></header>
        <section class="fz-vs kk-in" style="--d:.6s" aria-label="Score">${side(0)}<p class="fz-score" aria-label="${wins[0]} to ${wins[1]}"><span style="color:${PCOL[0]}">${wins[0]}</span><i>–</i><span style="color:${PCOL[1]}">${wins[1]}</span></p>${side(1)}</section>
        <ol class="fz-rounds kk-in" style="--d:.68s" aria-label="The rounds">${rounds.map(r => `<li style="--c:${r.winner == null ? '#8f8bbd' : PCOL[r.winner]}" title="Round ${r.round}: ${r.winner == null ? 'a double KO' : esc(FC.FIGHTERS[F.f[r.winner].id].name)} in ${clock(r.time || 0)}"><b>R${r.round}</b>${r.winner == null ? '<span class="fz-dbl">=</span>' : `<canvas class="fz-rh" data-i="${r.winner}" width="48" height="48" aria-hidden="true"></canvas>`}<small>${clock(r.time || 0)}</small></li>`).join('')}</ol>
        <div class="fz-stats kk-in" style="--d:.76s">${stat('Damage', i => Math.round(S0[i].dmg))}${stat('Hits', i => S0[i].hits)}${stat('Counters', i => S0[i].counters || 0)}${stat('Knockdowns', i => S0[i].knockdowns || 0)}${stat('Wall slams', i => S0[i].walls || 0)}</div>
        <div class="fz-act kk-in" style="--d:.86s">${btns}${keys}</div>
      </div></div>`;
    const head = (cv, i, r) => { const g = cv.getContext('2d'), n = cv.width / 2, draw = () => { g.clearRect(0, 0, n * 2, n * 2); fightHead(g, charOf(F.f[i].id), n, n, n - (r || 4), PCOL[i], i === w ? 'happy' : 'dizzy', 0.4, draw); }; draw(); };
    el.querySelectorAll('.fz-head').forEach(cv => head(cv, +cv.dataset.i));
    el.querySelectorAll('.fz-rh').forEach(cv => head(cv, +cv.dataset.i, 2));
    resHero(el.querySelector('.fz-stage'), F, w);
    el._fit = () => { if (el.isConnected) fitText(el); }; requestAnimationFrame(el._fit); addEventListener('resize', el._fit); if (document.fonts) document.fonts.ready.then(el._fit); setTimeout(el._fit, 700);
    document.body.classList.add('fz-out');
  }
  el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act(b.dataset.a));
  document.body.append(el);
  S.card = { kind, el, t0: performance.now() };
  if (kb) { const f = el.querySelector('.pz-main'); if (f) f.focus({ preventScroll: true }); }
}
function act(a) {
  if (S.net && (a === 'rematch' || a === 'back' || a === 'room')) { const n = S.net; if (a === 'rematch') { if (n.rematch) n.rematch(); } else n.back(); return; }   // online: the host's call
  if (S.practice && a.startsWith('mode:')) { S.practice.setMode(a.slice(5)); pause(false); return; }
  if (S.practice && a === 'restart') { S.practice.reset(); S.prevHp = S.F.f.map(f => f.hp); if (S.paused) pause(false); return; }
  if (a === 'resume') pause(false);
  else if (a === 'restart') startFight({ ...S.cfg, seed: undefined });
  else if (a === 'rematch') startFight({ ...S.cfg, ids: rollIds(S.cfg.ids, S.cfg.rand), seed: undefined });   // (a Random side gets a new fighter)
  else if (a === 'swap') startFight({ ...S.cfg, ids: [S.F.f[1].id, S.F.f[0].id], rand: [false, false], seed: undefined });   // (the same sides and players, the two fighters traded: these two, not new Random rolls)
  else if (a === 'quit' || a === 'back') leave();
  else if (a === 'home') { leave(); showMenu('home'); }
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
      if (K === 'Escape') { e.preventDefault(); act(S.card.kind === 'pause' ? 'resume' : 'back'); }   // (Esc, P or Tab toggle the pause: a second Esc doesn't quit; online Esc never closes the room by accident either)
      else if (S.card.kind === 'pause' && (e.code === 'KeyP' || K === 'Tab')) { e.preventDefault(); pause(false); }
      else if (S.card.kind === 'pause' && e.code === 'KeyQ' && !S.net) { e.preventDefault(); act('quit'); }
      else if (S.card.kind === 'pause' && e.code === 'KeyR' && !e.shiftKey && !S.net) { e.preventDefault(); act('restart'); }
      else if (S.card.kind === 'pause' && S.practice && /^Digit[1-5]$/.test(e.code)) { e.preventDefault(); act('mode:' + MODES[+e.code.slice(5) - 1][0]); }
      else if (K === 'ArrowDown' || K === 'ArrowRight' || K === 'ArrowUp' || K === 'ArrowLeft') { e.preventDefault(); const d = K === 'ArrowDown' || K === 'ArrowRight' ? 1 : -1; btns[(at + d + btns.length) % btns.length].focus(); }
      else if ((K === 'Enter' || K === ' ') && at >= 0) { e.preventDefault(); btns[at].click(); }
      else if (K === 'Enter' && S.card.kind === 'results' && (!S.net || S.net.rematch)) { e.preventDefault(); act('rematch'); }
      return;
    }
    if (e.key === 'Escape' || e.code === 'KeyP' || e.code === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) pause(true); return; }
    if (S.practice && !e.repeat && PRACTICE_KEY(e)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (CODES.has(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); S.keys.add(e.code); sfx.ensure(); }
  }, true);
  addEventListener('keyup', e => { S.keys.delete(e.code); }, true);
  addEventListener('blur', () => { S.keys.clear(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'fight') pause(true); });
}
// each human's held state this frame and where it came from (a pad once its player touches it, the keys again likewise)
// (touch, fight-touch.js: the nth touch zone's stick and buttons; a key or a pad used puts the touch controls away, a
// touch brings them back)
function heldOf(n, H) {
  const L = layoutFor(n, H), kh = keysHeld(L, S.keys), p = pads()[n], ph = p ? padHeld(p) : null, th = touchHeld(n);
  const any = h => h && Object.entries(h).some(([k, v]) => v && k !== 'sx' && k !== 'sy') || (h && (h.sx || h.sy));
  if (any(kh)) { S.src[n] = 'key'; setTouch(false); } else if (any(ph)) { S.src[n] = 'pad'; setTouch(false); } else if (touchAny(th)) S.src[n] = 'touch';
  if (!p && S.src[n] === 'pad') S.src[n] = 'key';
  const h = { ...kh }; if (ph) for (const k in ph) h[k] = (k === 'sx' || k === 'sy') ? ph[k] : h[k] || ph[k];
  if (th) { for (const k of ['up', 'down', 'left', 'right', 'light', 'heavy', 'special', 'guard']) h[k] = h[k] || th[k]; if (th.sx || th.sy) { h.sx = th.sx; h.sy = th.sy; h.dpad = false; } }
  return { L, h, src: touchOn() ? 'touch' : S.src[n] || 'key' };
}

// ---------------------------------------------------------------- the frame (main.js)
// the results screen hides the arena once it's in: skip drawing it
const covered = () => !!(S.card && S.card.kind === 'results' && performance.now() - S.card.t0 > 1200);
const devCam = F => S.zoom ? { x: (F.f[0].x + F.f[1].x) / 2, y: (F.f[0].y + F.f[1].y) / 2 - 30, z: S.zoom } : undefined;   // (the dev hook's &zoom)
const humansOf = F => F.cfg.bots.map((b, i) => b == null ? i : -1).filter(i => i >= 0);
export function fightFrame(dt) {
  if (S.net) return netFrame(dt);
  const F = S.F; if (!F) return;
  const hum = S.practice ? [0] : humansOf(F), live = !S.paused && !S.hold && !(S.card && S.card.kind === 'pause'), keys = [];   // (S.hold: the dev hook froze it)
  hum.forEach((fi, n) => {
    const H = heldOf(n, hum.length);
    if (live) F.setInput(fi, toInput(H.h));
    if (H.src !== 'touch') keys.push({ fi, L: H.L, src: H.src, held: live ? H.h : null });   // (touch: its own controls, drawn below)
  });
  if (live) {
    if (S.practice) S.practice.frame(dt, toInput(heldOf(0, 1).h)); else F.update(dt);   // (the training room steps the fight itself, frame by frame: fight-practice.js)
    sounds(F, dt);
    if (S.practice && S.practice.fresh.length) sfx.play('fPick', 0.7);   // (a checklist line ticked)
    fightEvents(F);
    if (F.phase === 'over' && !S.card) { S.endT += dt; if ((F.pt ?? S.endT) > 1.8) { game.fightLive = false; openCard('results'); } }   // (the winner's celebration first)
  }
  if (!covered()) drawFight(F, live ? dt : 0, { humans: hum, keys, cam: devCam(F), results: !!(S.card && S.card.kind === 'results'), inset: touchInset() });
  if (!S.card && F.phase !== 'over' && !S.hold) drawTouch(ctx, F, hum, DPR);
  if (S.pui) S.pui.update();
}
// the training room's keys in a fight: 1-5 the dummy, T record, R reset, H the overlay, C the next combo trial, V its demo
function PRACTICE_KEY(e) {
  const P = S.practice, c = e.code;
  if (/^Digit[1-5]$/.test(c)) { S.pui.mode(+c.slice(5) - 1); return true; }
  if (c === 'KeyT') { P.record(); return true; }
  if (c === 'KeyR') { act('restart'); return true; }
  if (c === 'KeyH') { S.pui.toggle(); return true; }
  if (c === 'KeyC') { S.pui.next(); return true; }   // (the next combo trial)
  if (c === 'KeyV') { S.pui.watch(); return true; }  // (its demo, on or off)
  return false;
}
function sounds(F, dt) {
  // the big beats, on draw-moments.js's clock: the round intro's portraits slamming in, 3, 2, 1, the start (the 'round'
  // event below); a round won; the match won (a fanfare, or a sadder two notes when the one human here lost)
  if (F.phase !== S.phase) { S.phase = F.phase; S.introT = 0; S.introN = -1; S.beat = 0; }
  else S.introT += dt;
  sfx.fightPhase(F.phase);   // the music follows the round (intro lift, sudden death, a KO's ending, the match over)
  if (F.phase === 'intro') {
    if (S.introN < 0) { S.introN = 0; sfx.play('fVs', 0.8); }
    while (S.introN < 3 && S.introT >= INTRO_COUNT[S.introN]) { S.introN++; sfx.play('fCount', 0.85); }
  } else if (F.phase === 'roundEnd' && !S.beat && S.introT > 0.5 && F.roundWinner != null) {
    S.beat = 1; if (F.wins[F.roundWinner] < winsToTake(F.cfg)) sfx.play('fRoundWin', 0.8);
  } else if (F.phase === 'over' && !S.beat) {
    S.beat = 1; const H = F.cfg.bots.map(b => b == null), lost = S.net ? S.net.me >= 0 && S.net.me !== F.winner : H.filter(Boolean).length === 1 && !H[F.winner];
    sfx.play(lost ? 'rivalWin' : 'fVictory', 0.9);
  }
  // damage dealt, for the results
  tally(S.stats, F, S.prevHp);   // the results' numbers (fight-stats.js)
  // Hot Java's pot brewing on someone (from the objects, so online too): its lid rattling quicker and quicker, then the
  // kettle's whistle once, just before it blows
  for (const o of F.objs || []) {
    if (o.kind !== 'pot' || o.ph !== 'ride') continue;
    const P = FC.FIGHTERS.duke.moves.move2, B = S.pot || (S.pot = {}), b = B[o.id] || (B[o.id] = { t: 0, w: 0 }), left = o.fuse ?? 0;
    b.t -= dt;
    if (b.t <= 0 && left > 0.05) { b.t = 0.07 + 0.2 * Math.min(1, left / P.fuse); sfx.play('fRattle', 0.4 + 0.4 * (1 - left / P.fuse)); }
    if (!b.w && left <= P.whistle) { b.w = 1; sfx.play('fKettle', 0.8); }
  }
  if (S.pot && !(F.objs || []).some(o => o.kind === 'pot')) S.pot = null;
  // a plug-in's own beats that aren't events (a coil leaving his claw, landing ...): its art's cues, from the state, so online too
  for (const A of artsIn(F)) if (A.cues) A.cues(F, (n, vol) => sfx.play(n, vol));
  if (F.f.some(f => f.id === 'duke')) DUKE_SOUND.cues(F, (n, vol) => sfx.play(n, vol));   // (Duke's: draw-moves.js, his art)
  for (const e of F.events || []) {
    const P = e.power || 0, who = e.who ?? -1;
    if (e.kind === 'hit' && e.ground) { sfx.play('fGround', 0.7 + P); continue; }   // (on someone down: one lighter thump, for every fighter)
    if (e.kind === 'rise') { sfx.play('fRoll', 0.7); continue; }
    { const A = F.f[who] && (ART[F.f[who].id] || (F.f[who].id === 'duke' ? DUKE_SOUND : null)), sn = A && A.sound && A.sound(e); if (sn) { for (const [n, vol] of sn) sfx.play(n, vol); continue; } }   // (a plug-in fighter's: js/art/kit-<id>.js; Duke's: draw-moves.js DUKE_SOUND)
    switch (e.kind) {
      case 'hit': sfx.play(P > 0.55 ? 'fHeavy' : P > 0.3 ? 'fHit' : 'fJab', 0.7 + P * 0.5); break;
      case 'trade': sfx.play('fClash', 0.5); break;
      case 'whiff': sfx.play('fWhiff', 0.6); break;
      case 'counter': sfx.play('fCrit', 0.9); break;   // (a counter hit)
      case 'step': sfx.play('fStep', 0.7); break;   // (a bounce pad's glide)
      case 'down': sfx.play('fDown', 0.9); break;
      case 'getup': sfx.play('fGetup', 0.6); break;
      case 'ko': sfx.play('fKOHit'); break;
      case 'round': sfx.play('fGo', 0.8); break;
      case 'wall': sfx.play(P > 0.25 ? 'fLand' : 'fBlock', 0.4 + P * 0.6); if (P > 0.6) sfx.play('fHeavy', 0.5); break;
      case 'sudden': sfx.play('fTile', 0.8); break;
      case 'burn': sfx.play('fHeavy', 0.7); sfx.play('fSplash', 0.4); break;
      case 'pad': sfx.play('fLaunch', 0.6); break;
      case 'iso': sfx.play('fIso', 0.9); break;   // (Docky's Isolation)
      case 'refill': sfx.play('fCool', 0.35); break;   // (the training room: health back)
      // Duke's moves and his evade (js/kits/duke.js; the others' own: their art's sound, above)
      case 'blink': sfx.play('fWarp', 0.7); break;
      case 'jab': sfx.play('fWhiff', 0.35); break;
      case 'heat': sfx.play('fSizzle', 0.3 + 0.7 * P); break;
      case 'boil': sfx.play('fBoil', 1); break;
      case 'cool': sfx.play('fCool', 0.5 + 0.5 * P); break;
      case 'tell': if (e.move === 'move2' && F.f[who] && F.f[who].id === 'duke') sfx.play('fPotUp', 0.6); break;   // (Hot Java's pot coming up)
      case 'potslap': sfx.play('fToss', 0.6); break;
      case 'potstick': sfx.play('fPotStick', 0.9); break;
      case 'potmiss': sfx.play('fPotDrop', 0.7); break;
      case 'pothop': sfx.play('fToss', 0.7); sfx.play('fPotStick', 0.5); break;
      case 'erupt': sfx.play('fErupt', 0.9); break;
      case 'potgone': sfx.play('fCool', 0.5); break;
      case 'snap': sfx.play('fSnap', 1); sfx.play('fRing', 0.7); break;
      case 'freeze': sfx.play('fFreeze', 0.9); break;
      case 'ringbreak': sfx.play('fThaw', 0.6); break;
      case 'thaw': sfx.play('fThaw', 0.8); break;
    }
  }
}

// ---------------------------------------------------------------- online (fight-net.js; net.js starts it, net-ui.js the room)
// startFight(cfg, { net }) with net = { role: 'host'|'player', me (our fighter, -1: watching), F (the Fight to draw: the
// host's real one, a player's copy), frame(dt, input|null) (the host steps it, a player sends the input and lays the
// snapshots on), rematch (the host's, else null), back() (the host: everyone to the room; a player: the room screen),
// quit() (leave or close the room), names [fighter 0's player, fighter 1's] }. You play with the one-player keys, the
// first pad, or touch (fight-touch.js's first zone). Nothing else changes online but the pause card (the fight carries on under it,
// no Restart), the names on the HUD cards and the results.
function netFrame(dt) {
  const n = S.net, F = S.F = n.F, live = !(S.card && S.card.kind === 'pause'), me = n.me, keys = [];
  let o = null;
  if (me >= 0) {
    const H = heldOf(0, 1);
    o = live ? toInput(H.h) : { x: 0, y: 0 };
    if (H.src !== 'touch') keys.push({ fi: me, L: H.L, src: H.src, held: live ? H.h : null });
  }
  n.frame(dt, o);
  if (S.F !== n.F) { S.F = n.F; S.stats = newStats(); S.prevHp = S.F.f.map(f => f.hp); }
  sounds(S.F, dt); fightEvents(S.F);
  if (S.F.phase === 'over' && (!S.card || S.card.kind === 'pause')) { S.endT += dt; if ((S.F.pt ?? S.endT) > 1.8) openCard('results'); }
  else if (S.F.phase !== 'over' && S.card && S.card.kind === 'results') { closeCard(); S.stats = newStats(); S.prevHp = S.F.f.map(f => f.hp); }   // (a rematch the host started)
  if (!covered()) drawFight(S.F, dt, { humans: me >= 0 ? [me] : [], keys, names: n.names, results: !!(S.card && S.card.kind === 'results'), inset: touchInset() });
  if (!S.card && S.F.phase !== 'over') drawTouch(ctx, S.F, me >= 0 ? [me] : [], DPR, { pause: true });
}
// online, who sat on fighter i: the player's name, or 'bot' (a bot fought, or took over for someone who left)
const who = i => (S.net && S.net.names && S.net.names[i]) || 'bot';
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
export function endFight() { if (S.pui) { S.pui.destroy(); S.pui = null; } S.practice = game.practice = null; closeCard(); S.net = null; S.F = null; game.fight = null; game.fightLive = false; }

// ---------------------------------------------------------------- dev hook: #fight (see the top)
export function fightDemo(hash) {
  let devIds = null;   // (&ids=gopher,octo: the two fighters, even ones not pickable yet: a plug-in being built)
  { const m = /[#&]ids=([\w,]+)/.exec(hash), ids = m ? m[1].split(',').filter(id => FC.FIGHTERS[id]) : [];
    if (ids.length) { picks(); setup.fightIds = [ids[0], ids[1] || ids[0]]; devIds = [...setup.fightIds]; } }
  if (/#fight=home/.test(hash)) { const lk = /[#&]look=(\w+)/.exec(hash); if (lk) { setLook(lk[1]); applyLook(); } showMenu('home'); return; }   // (#fight=home: the title, no boot screen)
  if (/#fight=practice/.test(hash)) { const m = /[#&]mode=(\w+)/.exec(hash), ar = /[#&]arena=(\w+)/.exec(hash), lk = /[#&]look=(\w+)/.exec(hash); if (lk) { setLook(lk[1]); applyLook(); } if (ar) { picks(); setup.fightArena = ar[1]; } setMode('fight'); startPracticeFromSetup(m ? m[1] : undefined); return; }   // (#fight=practice&ids=a,b&mode=walk: the training room)
  if (/#fight=setup/.test(hash)) { const lk = /[#&]look=(\w+)/.exec(hash); if (lk) { setLook(lk[1]); applyLook(); } setMode('fight'); showMenu('fight'); return; }   // (#fight=setup: the setup screen)
  const lv = /#fight=(\d)/.exec(hash), q = k => (new RegExp('[#&]' + k + '(?:=([^&]*))?').exec(hash) || null);
  const level = lv ? Math.min(2, +lv[1]) : 1, hm = q('humans'), h = hm ? +hm[1] || 0 : 0, look = q('look');
  if (look && look[1]) { setLook(look[1]); applyLook(); }
  const bots = [h >= 1 ? null : level, h >= 2 ? null : level];
  setMode('fight');
  startFight({ ids: devIds || [...picks().ids], bots, roundTime: q('time') ? +q('time')[1] || 60 : 60, seed: q('seed') ? +q('seed')[1] : undefined, arena: q('arena') ? q('arena')[1] : picks().arena });
  // &at=<s>: run the fight that far at once (for screenshots of a moment); &stop=<event kind>: stop early on that event
  const at = q('at'), stop = q('stop'), F = S.F;
  if (q('pause')) setTimeout(() => pause(true), 50);
  // &hold=<frames>: run that many more
  // frames (drawn, so the effects play) and freeze there (for a screenshot of an effect)
  const hold = q('hold'), hit = e => e.kind === stop[1] || (stop[1] === 'ground' && e.kind === 'hit' && e.ground);
  const phq = q('ph');   // (&ph=<a move's phase>: stop once someone's in it, e.g. crouch, high, gone, snap, throw, iceblock)
  if (at) for (let n = Math.round((+at[1] || 0) * 60); n-- > 0;) { F.update(1 / 60); fightEvents(F); fightTick(F, 1 / 60); tally(S.stats, F, S.prevHp); if (stop && F.events.some(hit)) break; if (phq && F.f.some(f => f.ph === phq[1])) break; }
  S.zoom = q('zoom') ? +q('zoom')[1] || 0 : 0;   // (&zoom=<px per unit>: a close camera on the two, for screenshots)
  // &net=host|player&names=a,b&me=0|1: fake an online session (screenshots of the online look)
  const nq = q('net');
  if (nq && nq[1]) { const nm = (q('names') || [, 'Hosty,Pia'])[1].split(',').map(decodeURIComponent), me = q('me') ? +q('me')[1] : 0;
    S.net = { role: nq[1], me, F, names: nm, rematch: nq[1] === 'host' ? () => { } : null, back() { }, quit() { }, frame(dt) { F.update(dt); } }; }
  if (hold) { for (let n = +hold[1] || 0; n-- > 0;) { F.update(1 / 60); fightEvents(F); drawFight(F, 1 / 60, { humans: [], cam: devCam(F) }); } S.hold = true; }
}
