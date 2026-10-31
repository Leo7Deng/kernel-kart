// Online screens: the menu's Online panel, the room (code and link to share, who's in, picks, the host's settings and
// START) and an online race's results buttons. Rooms and races themselves: net.js.
import { sfx } from './audio.js';
import { CHARACTERS, PCOL } from './core.js';
import { Input } from './input.js';
import { MAX_PLAYERS, hostAct, hostCup, hostPodium, hostRoom, hostSet, hostStart, hostToRoom, joinRoom, leaveRoom, NO_RELAY, net, pingOf, playerAsk, roomBoard, roomRacers, shareUrl } from './net.js';
import { linkChip } from './net-link.js';
import { COOL, cleanName } from './net-room.js';
import { roomKey } from './net-board.js';
import { addRival, decodeGhostPayload, loadRivals, rivalId } from './ghost-share.js';
import { bestWord, fmtDelta, fmtLap, ttPlan } from './timetrial.js';
import { mountChat } from './chat-ui.js';
import { resetTrackCache } from './render.js';
import { TRACKS } from './tracks.js';
import { openChangelog } from './changelog.js';
import { bgTrack } from './menu-bg.js';
import { turntable } from './turntable.js';
import { fsButton, noteRecent, raceKeys } from './qol.js';
import { qrSvg } from './qr.js';
import { endFight, fighterCard, keyBoard, matchOf, matchShort, matchText, matchupHTML, popStage, startFight, VS, wireCards } from './fight-ui.js';
import { FIRST_TO, ROUND_TIMES } from './fight.js';
import { FIGHTERS } from './fight-chars.js';
import { fightSeats } from './fight-net.js';
import { ARENAS, ARENA_ORDER } from './fight-arenas.js';
import { saveSettings, settings } from './settings.js';
import { CUP_MAX, CUP_MIN, PRESET_CUPS, charColors, charInfo, ownerTags, cupFromWire, cupGrid, cupPicker, cupWire, fillMinis, game, miniTrack, nextTrackBtn, modeSwitch, newCup, portrait, rosterPortrait, saveSetup, setup, showMenu, showPodium, showResults, toast, clearForRace, trackText, whatsNewBtn, whoSum, wireMore } from './ui.js';

const ui = document.getElementById('ui');
const esc = t => String(t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
export const loadName = () => { try { return localStorage.getItem('kk-name') || ''; } catch { return ''; } };
export const saveName = n => { try { localStorage.setItem('kk-name', n); } catch { } };
let note = '';   // why the last room ended, shown on the menu's Online panel
const JOIN = /#join=([a-z]{4})/i;   // a room's link: its address with the code (net.js shareUrl)
// a shared link's room code (#join=ABCD), or a room that just ended: the menu opens on Online
export const onlinePending = () => !!note || JOIN.test(location.hash);
// the copy on the web (GitHub Pages) only serves files: rooms live on the host's computer (its server: npm run play)
const STATIC = /(^|\.)github\.io$/i.test(location.hostname);
const noServer = code => `${code ? `Room ${code} is on the host's computer, not on this web copy of the game. ` : 'Rooms run on a computer with the game\'s server (npm run play), not on this web copy. '}Ask the host for the link on their room screen (Copy, or the QR code): it starts with their address, like http://192.168.1.20:5173, and takes you straight in. Or paste it here:`;
// a made-up name for someone who joins by a link without one saved (they can change it in the room)
const FUN = ['Turbo Duck', 'Hot Fix', 'Null Racer', 'Byte Rider', 'Kernel Kid', 'Sudo Sam', 'Async Ace', 'Cache Flow', 'Bit Bandit', 'Quick Sort', 'Lambda Lou', 'Pixel Pete', 'Merge Max', 'Loop Hero', 'Patch Pat', 'Speedy Bit'];
const funName = () => FUN[Math.floor(Math.random() * FUN.length)];   // (the menu, not the race: no seed needed)
// opening a room link in a tab that has the game open already only changes the hash: join from the menu, as on a fresh load
addEventListener('hashchange', () => {
  const m = JOIN.exec(location.hash); if (!m) return;
  if (!net.s && game.state === 'menu') showMenu('online');
  else if (net.s) {
    history.replaceState(null, '', location.pathname + location.search);
    if (net.s.code !== m[1].toUpperCase()) toast(`Leave this room to join ${m[1].toUpperCase()}`);
  }
});
// the host's last room (kk-net-room): track, laps, bots, skill, mode and cup, tracks by name; a new room starts from it
const loadRoom = () => { try { return JSON.parse(localStorage.getItem('kk-net-room') || 'null'); } catch { return null; } };
const byName = n => TRACKS.findIndex(t => t.name === n);
function saveRoom(cfg) {
  const c = { track: (TRACKS[cfg.track] || TRACKS[0]).name, random: !!cfg.random, laps: cfg.laps, bots: cfg.bots, aiLevel: cfg.aiLevel, mode: cfg.mode, cupTracks: (cfg.cupTracks || []).map(i => TRACKS[i].name), cupName: cfg.cupName, fightBot: cfg.fightBot, fightBotId: cfg.fightBotId, fightSupers: cfg.fightSupers, fightArena: cfg.fightArena, fightRounds: cfg.fightRounds, fightTime: cfg.fightTime };
  try { localStorage.setItem('kk-net-room', JSON.stringify(c)); } catch { }
}
// the room a host opens: as they left their last one, or (the first time) from the menu's own choices
function roomCfg() {
  const r = loadRoom() || {}, own = setup.cupTracks.map(byName).filter(i => i >= 0), cupTracks = Array.isArray(r.cupTracks) ? r.cupTracks.map(byName).filter(i => i >= 0) : own;
  const track = byName(r.track);
  return { track: track >= 0 ? track : setup.track, random: typeof r.random === 'boolean' ? r.random : setup.random, laps: [2, 3, 5].includes(r.laps) ? r.laps : setup.laps, bots: Math.min(r.bots >= 0 ? r.bots : setup.bots, MAX_PLAYERS - 1),
    aiLevel: [0, 1, 2].includes(r.aiLevel) ? r.aiLevel : setup.aiLevel, mode: r.mode === 'cup' || r.mode === 'single' || r.mode === 'fight' ? r.mode : 'single', fightBot: [0, 1, 2].includes(r.fightBot) ? r.fightBot : 1, fightBotId: Object.hasOwn(FIGHTERS, r.fightBotId) ? r.fightBotId : undefined, fightSupers: r.fightSupers !== false, fightArena: ARENAS[r.fightArena] || r.fightArena === 'random' ? r.fightArena : undefined, fightRounds: FIRST_TO.includes(r.fightRounds) ? r.fightRounds : setup.fightRounds, fightTime: ROUND_TIMES.includes(r.fightTime) ? r.fightTime : setup.fightTime,
    cupTracks, cupName: typeof r.cupName === 'string' && cupTracks.length ? r.cupName : 'Custom Cup', drift: settings.drift };   // (drift: the host's Drift setting goes for the whole room, race-drift.js)
}
const myPick = ci => { setup.netPick = ci; saveSetup(); };   // your racer online, pre-picked in the next room

// ---------------------------------------------------------------- the menu's Online panel
export function mountOnline(el) {
  const code0 = (JOIN.exec(location.hash) || [])[1] || '';   // a shared link carries the code
  const r = roomCfg(), what = r.mode === 'cup' && r.cupTracks.length >= CUP_MIN ? `${esc(r.cupName)} (${r.cupTracks.length} races)` : esc(TRACKS[r.track].name);
  el.innerHTML = `<div class="help">Race friends on their own phones and laptops on the same network. One of you hosts and sends the room's link: opening it takes everyone else straight into the room (or they type its code here).</div>
    <div class="net net-name"><span class="lbl">Your name</span><input id="netName" maxlength="12" placeholder="Player" autocomplete="off" spellcheck="false"></div>
    <div class="net-ways">
      <div class="net-way"><b>Host</b><span class="help">You set up the race and start it; everyone helps pick the track. Opens with your last room: <b>${what}</b> · ${r.laps} laps · ${r.bots ? plural(r.bots, 'bot') : 'no bots'}.</span><button id="netHost" class="go">Host a room</button></div>
      <div class="net-way"><b>Join</b><span class="help">Open the link from the host's room screen, or type the four-letter code from it.</span><div class="row net"><input id="netCode" maxlength="4" placeholder="CODE" autocomplete="off" spellcheck="false" class="code"><button id="netJoin" class="go">Join</button></div></div>
    </div>
    <div class="help net-note" id="netNote"></div>
    <div class="row net net-paste" style="display:none"><input id="netLink" placeholder="http://192.168.1.20:5173/#join=ABCD" autocomplete="off" spellcheck="false" inputmode="url"><button id="netGoLink" class="go">Go</button></div>`;
  const name = el.querySelector('#netName'), code = el.querySelector('#netCode'), noteEl = el.querySelector('#netNote');
  name.value = loadName(); code.value = code0.toUpperCase();
  const say = t => { noteEl.textContent = t; };
  say(note); note = '';
  // no server here (the web copy): say where rooms are, with a box for the host's link (or their address, with the code above)
  const paste = el.querySelector('.net-paste'), linkIn = el.querySelector('#netLink');
  const noRoom = c => { say(noServer(c)); paste.style.display = ''; };
  const goLink = () => {
    let t = linkIn.value.trim(); if (!t) { linkIn.focus(); return; }
    if (!/^[a-z]+:\/\//i.test(t)) t = 'http://' + t;
    let u; try { u = new URL(t); } catch { say('That isn\'t a link: it looks like http://192.168.1.20:5173/#join=ABCD'); return; }
    if (!JOIN.test(u.hash) && code.value.length === 4) u.hash = 'join=' + code.value;
    location.href = u.href;
  };
  el.querySelector('#netGoLink').onclick = goLink;
  linkIn.onkeydown = e => { if (e.key === 'Enter') goLink(); };
  const who = () => { const n = name.value.trim() || 'Player'; saveName(name.value.trim()); return n; };
  name.onchange = () => saveName(name.value.trim());
  code.oninput = () => { code.value = code.value.toUpperCase().replace(/[^A-Z]/g, ''); };
  el.querySelector('#netHost').onclick = async () => {
    sfx.ensure(); if (STATIC) return noRoom('');
    say('Opening a room…');
    try { await hostRoom(who(), setup.netPick, roomCfg()); showRoom(); }
    catch (e) { if (!e.stale) say(e.message); }
  };
  // true once in the room
  const join = async () => {
    sfx.ensure();
    if (code.value.length !== 4) { say('The room code is four letters: the host sees it on their screen.'); code.focus(); return false; }
    if (STATIC) { noRoom(code.value); return false; }
    say('Joining…');
    try {
      await joinRoom(code.value, who());
      const s = net.s, me = s && s.players.find(p => p.id === s.me);   // your usual racer
      if (me && me.pick !== setup.netPick) playerAsk({ k: 'pick', ci: setup.netPick, first: true });   // (free: no wait after it; someone else may have it too)
      showRoom(); return true;
    } catch (e) { if (e.stale) return false; if (e.message === NO_RELAY) noRoom(code.value); else say(e.message); return false; }   // (stale: a newer join took over)
  };
  el.querySelector('#netJoin').onclick = join;
  code.onkeydown = e => { if (e.key === 'Enter') join(); };
  // a shared link (#join=ABCD) joins at once with your saved name, else a made-up one (saved, shown in a toast). The code
  // comes off the address as it's read, so leaving or reloading doesn't drop you straight back in.
  if (code0) history.replaceState(null, '', location.pathname + location.search);
  if (code0 && STATIC) noRoom(code0.toUpperCase());
  else if (code0 && !net.s) {
    const made = !name.value.trim();
    if (made) { name.value = funName(); saveName(name.value); }
    join().then(ok => { if (ok && made) toast(`You're in as ${name.value} (✎ by your name changes it)`); });
  }
}
// the name popup (✎ by your name in a room; sharing a ghost link: timetrial-ui.js): Enter or the button confirms, ✕ or Esc closes
export function askName(go, { title, btn, note = '', value = '' }) {
  const back = document.createElement('div'); back.className = 'cl-back';
  back.innerHTML = `<div class="panel cl-box net-ask" role="dialog" aria-label="${esc(title)}"><div class="cl-head"><h2>${esc(title)}</h2><button class="cl-x" id="ask-x">✕</button></div>
    ${note ? `<div class="help">${note}</div>` : ''}<div class="net net-name"><span class="lbl">Your name</span><input id="askName" maxlength="12" placeholder="Player" autocomplete="off" spellcheck="false"></div>
    <div class="row net"><button id="askGo" class="go">${esc(btn)}</button></div></div>`;
  document.body.append(back);
  const input = back.querySelector('#askName'), shut = () => back.remove();
  input.value = value;
  const ok = () => { const n = input.value.trim(); if (!n && value) return shut(); saveName(n); shut(); go(n || 'Player'); };   // (emptied while changing a name: no change)
  back.querySelector('#askGo').onclick = ok; back.querySelector('#ask-x').onclick = shut;
  input.onkeydown = e => { if (e.key === 'Enter') ok(); else if (e.key === 'Escape') shut(); };
  back.addEventListener('mousedown', e => { if (e.target === back) shut(); });
  input.focus(); if (value) input.select();
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
// copy text: the clipboard API where the page is a secure one (localhost), else the old way, which a plain http LAN address allows
export async function copyText(t) {
  try { if (navigator.clipboard && isSecureContext) { await navigator.clipboard.writeText(t); return true; } } catch { }
  const a = document.createElement('textarea'); a.value = t; a.setAttribute('readonly', ''); a.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.append(a); a.select(); let ok = false; try { ok = document.execCommand('copy'); } catch { } a.remove(); return ok;
}

// ---------------------------------------------------------------- the room
net.onChange = room => {   // (room: a player leaving a fight's results for the room screen)
  if (game.state === 'room' || room === true) showRoom();
  else if (net.s && !net.s.racing && !net.s.race && (game.state === 'race' || game.state === 'results' || game.state === 'podium' || game.state === 'fight')) showRoom();   // the host ended the race (the cup, the fight)
};
// a fight starts (Fight mode, net.js hostFight / playerFight): fight-ui.js runs it with the net's hook
net.onFight = hook => { const rc = document.getElementById('netRecon'); if (rc) rc.remove(); startFight(null, { net: hook }); };
// ---------------------------------------------------------------- cups
// The host runs the cup (game.cup; ui.js scores it on the host's results) and sends it as each race starts and once
// scored; players keep a remote copy and never score. A player who leaves keeps their points and a bot drives for them.
net.onCup = d => {
  const s = net.s; if (!s || !d.cup.racers.some(r => r.pid === s.me)) return;   // joined after the cup started: not in it
  game.cup = cupFromWire(d.cup, s.me);
  if (d.scored && game.state === 'results' && game.race) showResults(game.race);   // here before the scores: play them now
};
net.onPodium = () => { if (game.cup && game.cup.remote) showPodium(game.cup); };
// who of the cup's players is still in the room: they keep their seat (and their slot now); anyone gone is a bot from here on
function syncLeft(cup) {
  for (const r of cup.racers) {
    if (r.pid == null || r.left) continue;
    const p = net.s.players.find(o => o.id === r.pid);
    if (p) r.pIndex = p.slot; else { r.human = false; r.pIndex = -1; r.left = true; }
  }
}
function startCupRace() {
  const cup = game.cup; syncLeft(cup);
  hostCup(cupWire(cup), false);
  hostStart({ track: cup.tracks[cup.race], racers: cupGrid(cup) });
}
const endCup = () => { game.cup = null; hostToRoom(); };
net.onRace = race => {
  resetTrackCache(); sfx.music('race' + race.trackIdx); sfx.tempo(1); noteRecent(TRACKS[race.trackIdx].name);
  ui.innerHTML = ''; game.race = race; game.state = 'race'; clearForRace();
};
// a player's connection dropped (net.js reconnect): a card over the screen while it retries; back in, the room (a race
// still on goes on without you)
// each player's link in the room (net-link.js linkChip on their card): redrawn in place as the host's round trips come
net.onPing = () => { if (game.state !== 'room') return; for (const el of document.querySelectorAll('.np-ping[data-pid]')) el.innerHTML = linkChip(pingOf(+el.dataset.pid)); };
net.onReconnect = on => {
  const s = net.s; let el = document.getElementById('netRecon');
  if (!on) {
    if (el) el.remove(); if (!s) return;
    if (s.fight && s.fight.me >= 0) { toast('Back in the fight'); return; }   // (the host sat us back on our fighter: net.js)
    showRoom(); toast(s.racing ? (s.cfg && s.cfg.mode === 'fight' ? 'Back in the room: you\'re in the next fight' : 'Back in the room: you\'re in the next race') : 'Back in the room'); return;
  }
  if (el || !s) return;
  el = document.createElement('div'); el.id = 'netRecon'; el.className = 'cl-back net-recon';
  el.innerHTML = `<div class="panel cl-box recon-box" role="alertdialog" aria-labelledby="recon-h"><span class="recon-spin" aria-hidden="true"></span>
    <h2 id="recon-h">Reconnecting…</h2><div class="help">The connection to room <b>${esc(s.code || '')}</b> dropped. Trying again for 20 seconds${s.recon && s.recon.raced ? ': the race goes on without you (a bot drives your kart home) and you\'re in the next one' : s.recon && s.recon.fought ? ': a bot fights for you until you\'re back' : ''}.</div>
    <button type="button" id="reconLeave">Leave room</button></div>`;
  document.body.append(el);
  el.querySelector('#reconLeave').onclick = leaveRoom;
};
net.onEnd = why => {
  const rc = document.getElementById('netRecon'); if (rc) rc.remove();
  note = why || '';
  game.state = 'menu'; game.race = null; showMenu();
  if (why) toast(why);
};

// ---------------------------------------------------------------- picking together
// Everyone picks their racer and the track (or cup tracks); mode, laps, bots and START are the host's. Each section
// ('chars', 'maps') takes one change every 2 s per player (net-room.js; the host's own: no limit). A pick shows at once
// (net.js playerAsk); while a section waits it dims with a ring running down, and a click is refused on the spot (the
// card shakes with the time left).
const coolRing = '<span class="cool-ring" title="One change every 2 seconds"><i></i><b></b></span>';
const hostsCall = '<span class="net-anyone ro" title="Only the host changes these">host sets these</span>';
const SEC_NAME = { chars: 'racer pick', maps: 'track pick', name: 'name change' };
const coolEnd = () => (net.s.coolUntil ||= {});
// d is a request (net-room.js) in section sec, from a click on card el: false if it has to wait
function act(sec, d, el) {
  const s = net.s;
  if (s.role === 'host') return hostAct(d).ok;   // (no wait for the host)
  const now = performance.now(), until = coolEnd(), left = (until[sec] || 0) - now;
  if (left > 0) { refuse(sec, el); return false; }
  until[sec] = now + COOL;   // (first: the pick redraws the room at once)
  playerAsk(d); return true;
}
// a click while sec waits: the card shakes with a little countdown on it, and the heading's ring nudges
function refuse(sec, el) {
  const ring = ui.querySelector(`[data-cool="${sec}"] .cool-ring`); if (ring) { ring.classList.remove('nudge'); void ring.offsetWidth; ring.classList.add('nudge'); }
  if (!el || !el.isConnected) return;
  el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope');
  let pill = el.querySelector('.cool-pill'); if (!pill && el.matches('.char, .track, .cup-card, .slot')) { pill = document.createElement('span'); pill.className = 'cool-pill'; pill.dataset.sec = sec; el.appendChild(pill); }
  coolMarks();
}
// the host turned a pick down after all (too soon by its clock: rare): wait out its ms. ms 0: someone got there first,
// no wait. Either way the room is already back as the host has it (net.js)
net.onCool = (sec, ms) => {
  if (!net.s || !SEC_NAME[sec]) return;
  coolEnd()[sec] = ms > 0 ? performance.now() + ms : 0; coolMarks();
  if (ms > 0) toast(`Too quick: one ${SEC_NAME[sec]} every ${COOL / 1000} s`);
};
// the waits on screen: dimmed sections, the rings and the cards' countdowns (written only when they change: no churn)
let coolFrame = 0;
function coolMarks() {
  cancelAnimationFrame(coolFrame);
  const s = net.s; if (!s || game.state !== 'room') return;
  const now = performance.now(), until = coolEnd(), left = sec => Math.max(0, (until[sec] || 0) - now); let any = false;
  const text = (el, t) => { if (el.textContent !== t) el.textContent = t; };
  for (const el of ui.querySelectorAll('[data-cool]')) {
    const l = left(el.dataset.cool), ring = el.querySelector('.cool-ring');
    if (el.classList.contains('cooling') !== l > 0) el.classList.toggle('cooling', l > 0); any ||= l > 0;
    if (ring) { ring.style.setProperty('--f', (l / COOL).toFixed(2)); text(ring.querySelector('b'), l > 0 ? `wait ${(l / 1000).toFixed(1)} s` : ''); }
  }
  for (const pill of ui.querySelectorAll('.cool-pill')) { const l = left(pill.dataset.sec); if (l > 0) text(pill, `${(l / 1000).toFixed(1)} s`); else pill.remove(); }
  if (any) coolFrame = requestAnimationFrame(coolMarks);
}
// who picked a track: their colour and name (nobody, if they've left)
function byTag(id) {
  const p = net.s.players.find(o => o.id === id); if (!p) return '';
  return `<span class="pickby" style="--pc:${PCOL[p.slot]}" title="Picked by ${esc(p.name)}">P${p.slot + 1} ${esc(p.name)}</span>`;
}
// the Track panel, the same for everyone: the race's track (or the cup's tracks) with who picked it, and every track to pick from
function roomTracks(scr, s, pool) {
  const cfg = s.cfg, cupMode = cfg.mode === 'cup', cupTracks = cfg.cupTracks || [], cupBy = cfg.cupBy || [];
  const tracksAct = (d, el) => act('maps', d, el);
  if (cupMode) cupPicker(scr.querySelector('#netCup'), { tracks: cupTracks, name: cfg.cupName, by: i => byTag(cupBy[i]),
    onPreset: i => tracksAct({ k: 'cupEdit', op: 'preset', tracks: [...PRESET_CUPS[i].tracks], name: PRESET_CUPS[i].name }, scr.querySelector(`[data-preset="${i}"]`)),
    onDrop: i => tracksAct({ k: 'cupEdit', op: 'drop', t: cupTracks[i] }, scr.querySelector(`[data-drop="${i}"]`)?.closest(".slot")), onClear: () => tracksAct({ k: 'cupEdit', op: 'clear' }, scr.querySelector('#cupclear')) });
  else {   // the race's track up top, with its full text and who picked it
    const tr = scr.querySelector('#netTrack'), t = TRACKS[cfg.track];
    if (cfg.random) {   // Random: a different track every race (picked at START, net.js hostStart)
      tr.classList.add('random'); tr.insertAdjacentHTML('beforeend', `<div class="rnd-face"><span>?</span></div><div class="tinfo"><div class="net-curname">Random ${byTag(cfg.trackBy ?? 0)}</div><div class="d tl">A different track every race.</div></div>`);
    } else {
      tr.appendChild(again(pool, 'cur' + cfg.track, () => miniTrack(t, 150, 90)));
      tr.insertAdjacentHTML('beforeend', `<div class="tinfo"><div class="net-curname">${esc(t.name)} ${byTag(cfg.trackBy ?? 0)}</div>${trackText(t, 'room')}</div>`); wireMore(tr);
    }
  }
  const tr = scr.querySelector('#netTracks');
  if (!cupMode) {   // a Random card first, as on the menu
    const d = document.createElement('div'); d.className = 'track random' + (cfg.random ? ' sel' : '');
    d.innerHTML = `<div class="rnd-face"><span>?</span></div><div class="n">Random</div><div class="d tl">A different track every race.</div>${cfg.random ? `<div class="net-by">${byTag(cfg.trackBy ?? 0)}</div>` : ''}`;
    d.onclick = () => { if (!cfg.random) tracksAct({ k: 'pickTrack', t: -1 }, d); };
    tr.appendChild(d);
  }
  TRACKS.forEach((t, ti) => {
    const ci = cupTracks.indexOf(ti), d = document.createElement('div'); d.className = 'track' + (cupMode ? (ci >= 0 ? ' incup' : '') : cfg.track === ti && !cfg.random ? ' sel' : ''); d.appendChild(again(pool, 'm' + ti, () => miniTrack(t, 150, 90)));
    const by = cupMode ? (ci >= 0 ? byTag(cupBy[ci]) : '') : cfg.track === ti && !cfg.random ? byTag(cfg.trackBy ?? 0) : '';
    d.insertAdjacentHTML('beforeend', `<div class="n">${t.name}</div>${trackText(t, ti)}${cupMode && ci >= 0 ? `<div class="cupnum">${ci + 1}</div>` : ''}${by ? `<div class="net-by">${by}</div>` : ''}`);
    d.onclick = () => {
      if (!cupMode) { if (cfg.track !== ti || cfg.random) tracksAct({ k: 'pickTrack', t: ti }, d); }
      else if (ci >= 0) tracksAct({ k: 'cupEdit', op: 'drop', t: ti }, d);
      else if (cupTracks.length < CUP_MAX) tracksAct({ k: 'cupEdit', op: 'add', t: ti }, d);
      else toast(`A cup has at most ${CUP_MAX} tracks`);
    };
    tr.appendChild(d);
  });
  wireMore(tr);
}

// ---------------------------------------------------------------- the time trial board (net-board.js)
// everyone's best time trial lap on the room's track, fastest first, with a button to keep a friend's ghost as a rival
// (ghost-share.js)
function roomBoardPanel(el, s) {
  const key = roomKey(s.cfg), def = TRACKS[s.cfg.track], rows = roomBoard(), plan = def && ttPlan(def);
  const head = `<h2>Time trial bests${key ? `<span class="net-anyone ro">${esc(def.name)} · ${s.cfg.drift ? 'with drift' : 'no drift'}</span>` : ''}</h2>`;
  if (!key) { el.innerHTML = head + '<div class="help">Pick a single track (not Random or a cup) to see everyone\'s best time trial lap on it.</div>'; return; }
  if (!rows.length) { el.innerHTML = head + `<div class="help">Nobody here has a time trial ${bestWord(plan)} on ${esc(def.name)} yet. Set one from the menu (Time trial) and it shows up here, with its ghost for friends to save.</div>`; return; }
  const saved = new Set(loadRivals(key).list.map(e => e.id)), best = rows[0].t;
  el.innerHTML = head + `<div class="nb-rows">${rows.map((r, i) => {
    const me = r.id === s.me, ch = CHARACTERS.find(c => c.id === r.ch), has = saved.has(rivalId(r.p.name, r.t, r.ch));
    return `<div class="nb-row${i === 0 ? ' first' : ''}"><span class="pos">${i + 1}</span><span class="rv-port" data-ch="${esc(r.ch)}"></span>
      <span class="nb-who"><span class="nb-name"><b style="color:${PCOL[r.p.slot]}">P${r.p.slot + 1} ${esc(r.p.name)}</b>${me ? ' <span class="net-you">you</span>' : ''}</span><small>${esc(ch ? ch.name : '?')}</small></span>
      <span class="nb-t">${fmtLap(r.t)}</span><span class="nb-gap">${i ? fmtDelta(r.t - best) : ''}</span>
      ${me ? '<span class="nb-act muted">your ghost</span>' : !r.d ? '<span class="nb-act muted">no ghost</span>' : has ? '<span class="nb-act saved">Saved ✓</span>' : `<button class="nb-act" data-save="${r.id}">Save ghost</button>`}</div>`;
  }).join('')}</div><div class="help">A saved ghost is one of your rivals on ${esc(def.name)}: race it from the menu's Time trial.</div>`;
  el.querySelectorAll('.rv-port').forEach(p => { const ch = CHARACTERS.find(c => c.id === p.dataset.ch); if (ch) p.appendChild(portrait(ch)); });
  el.querySelectorAll('[data-save]').forEach(b => b.onclick = async () => {
    const r = rows.find(o => o.id === +b.dataset.save); if (!r) return;
    b.disabled = true;
    try {
      const { meta, s: samples } = await decodeGhostPayload(r.d);
      meta.name = r.p.name; meta.t = r.t;
      if (!addRival(key, meta, samples, { via: 'room' })) throw new Error('no room');
      toast(`Saved ${r.p.name}'s ghost: race it in Time trial`);
    } catch { toast('Couldn\'t save that ghost'); }
    if (game.state === 'room') showRoom();
  });
}

// the room's link as a QR code (qr.js, drawn here: nothing fetched), big, for a phone's camera; ✕, Esc or a click beside it closes it
function showQr(url, code) {
  if (document.querySelector('.qr-back')) return;
  const back = document.createElement('div'); back.className = 'cl-back qr-back';
  back.innerHTML = `<div class="panel cl-box qr-box" role="dialog" aria-label="Room ${esc(code || '')} QR code"><div class="cl-head"><h2>Scan to join ${esc(code || '')}</h2><button class="cl-x" id="qr-x">✕</button></div>
    <div class="qr-img">${qrSvg(url)}</div><div class="help qr-url">${esc(url)}</div></div>`;
  document.body.append(back);
  const shut = () => { back.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); shut(); } };
  document.addEventListener('keydown', onKey, true);
  back.querySelector('#qr-x').onclick = shut; back.addEventListener('mousedown', e => { if (e.target === back) shut(); });
}
const PEN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1-4L16 5l3 3L8 19z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>';
const BACK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const seenPick = new Map();   // each player's racer when the room was last drawn (a change spins their turntable)
// The room redraws on every change, so its canvases carry over from the last drawing: rebuilding 30 racer and track
// pictures made a pick stutter (worst on an iPad), and the turntables keep turning where they were.
const tables = new Map();   // player id: { cv, t } their turntable
const canvasPool = old => new Map(old ? [...old.querySelectorAll('canvas[data-again]')].map(c => [c.dataset.again, c]) : []);
function again(pool, key, make) {
  key += '|' + settings.look;
  const c = pool.get(key); if (c) { pool.delete(key); return c; }
  const n = make(); n.dataset.again = key; return n;
}
export function showRoom() {
  const s = net.s; if (!s) return;
  if (game.fight || game.state === 'fight') endFight();   // (a fight's cards go)
  game.state = 'room'; game.race = null; game.cup = null; Input.reset();   // back in the room: any cup is over
  const host = s.role === 'host', me = s.players.find(p => p.id === s.me), cfg = s.cfg;
  const url = shareUrl(), local = /localhost|127\.0\.0\.1/.test(url);
  const cupMode = cfg.mode === 'cup', cupTracks = cfg.cupTracks || [], fightMode = cfg.mode === 'fight';
  if (host) saveRoom(cfg);   // the next room opens like this one
  bgTrack(cupMode && cupTracks.length ? cupTracks[0] : cfg.track);   // the backdrop races round the room's track (menu-bg.js)
  const old = ui.querySelector('.screen.net-room'), oldBody = old && old.querySelector('.m-body'), keep = oldBody ? oldBody.scrollTop : 0, pool = canvasPool(old);
  const scr = document.createElement('div'); scr.className = 'screen mscreen net-room' + (old ? ' redraw' : '');
  const players = [...s.players].sort((a, b) => a.slot - b.slot), bots0 = Math.min(cfg.bots, MAX_PLAYERS - s.players.length);
  // the room, in the menu's frame (menu.css): Leave and What's new on top; code, turntables, bots and chat on the left;
  // your racer, track or cup, time trial board and race settings on the right; the host's START at the bottom
  scr.innerHTML = `
    <header class="m-top"><button type="button" class="m-back" id="netLeave" title="${host ? 'Close the room for everyone' : 'Leave the room'}">${BACK_ICON}<span>${host ? 'Close room' : 'Leave room'}</span></button>
      <div class="m-head"><span class="m-mode">Online</span><h1 class="m-h">Room ${s.code ? esc(s.code) : ''}</h1></div><div class="m-util">${fsButton()}${whatsNewBtn()}</div></header>
    <div class="m-body room${fightMode ? ' room-fight' : ''}">
      ${fightMode ? `<div class="panel nf-arena" data-cool="chars"><h2>Fighters${coolRing}<span class="net-anyone nf-rules">${esc(matchShort(matchOf(cfg).n, matchOf(cfg).t))}${cfg.fightSupers !== false ? ' · supers on' : ''}</span></h2><div class="fs-slots" id="netFight"></div><div class="nf-watch" id="nfWatch"></div></div>` : ''}
      <div class="room-col">
        <div class="panel room-share"><h2>Room code</h2>
          <div class="row" style="align-items:flex-end;gap:10px 22px">
            <div class="net-code">${s.code ? esc(s.code) : '····'}</div>
            <div class="help" style="flex:1 1 220px">Send friends on the same Wi-Fi the link <b class="net-url" title="Click to copy">${esc(url)}</b> <button class="net-copy" title="Copy the link">Copy</button>${url.length <= 200 ? ' <button class="net-qr" title="A QR code of the link, for phones to scan">QR code</button>' : ''}: it takes them straight into this room. (Or they open the game and type the code.)${host && local ? '<br>(No network address found: are you on Wi-Fi?)' : ''}
              <br>${fightMode ? (host ? 'The first two in the room fight (one alone fights a bot), everyone else watches; you start it.' : 'You\'re in. The first two in the room fight (keys, a gamepad or touch), everyone else watches; the host starts it.') : host ? 'Everyone picks their racer and can help pick the track; you set the race and start it.' : 'You\'re in. Pick your racer and help pick the track; the host sets the race and starts it.'}</div>
          </div></div>
        ${fightMode ? fightPeople(s, players) : `        <div class="panel"><h2>Who's racing</h2><div class="net-players">${players.map(p => `
          <div class="net-player${p.id === s.me ? ' me' : ''}" style="--pc:${PCOL[p.slot]}"><canvas class="np-tt" data-pid="${p.id}" aria-hidden="true"></canvas>
            <div class="np-who"><span class="ps-tag">P${p.slot + 1}</span> <b>${esc(p.name)}</b>${p.id === s.me ? `${s.racing ? '' : ` <button class="np-rename" title="Change your name" aria-label="Change your name">${PEN_ICON}</button>`} <span class="net-you">you</span>` : ''}${p.id === 0 ? ' <span class="net-you">host</span>' : ` <span class="np-ping" data-pid="${p.id}">${linkChip(pingOf(p.id))}</span>`}</div>
            <div class="np-ch">${CHARACTERS[p.pick].name}</div>${p.id === s.me ? `<div class="np-keys">${raceKeys(0, { drift: !!cfg.drift, solo: true })}</div>` : ''}</div>`).join('')}</div>
          <div class="who net-who" id="netWho"></div>
          ${s.racing ? `<div class="help" style="margin-top:8px">${fightMode ? '<b>A fight is on.</b> Watch it, or wait for the next one.' : cfg.mode === 'cup' ? '<b>A cup is on.</b> You\'re in once it\'s over.' : '<b>A race is on.</b> You\'re in the next one.'}</div>` : ''}</div>`}
        <div id="netChat"></div>
      </div>
      <div class="room-col">
        ${fightMode ? `<div class="panel"><h2>Mode</h2><div class="row" id="netMode"></div></div>
        <div class="panel"><h2>Fight settings${host ? '' : hostsCall}</h2><div class="settings" id="netCfg"></div></div>` : `
        <div class="panel" data-cool="chars"><h2>Your racer${coolRing}</h2><div class="chars" id="netChars" role="group" aria-label="Racers"></div></div>
        <div class="panel" data-cool="maps"><h2>${cupMode ? 'Cup' : 'Track'}<span class="net-anyone">anyone picks</span>${coolRing}</h2><div class="row" id="netMode"></div><div id="netCup"></div>${cupMode ? '' : `<div class="row net-cur" id="netTrack"></div>`}<div class="tracks" id="netTracks"></div></div>
        <div class="panel net-board" id="netBoard"></div>
        <div class="panel"><h2>Race settings${host ? '' : hostsCall}</h2><div class="settings" id="netCfg"></div></div>`}
      </div>
    </div>
    <footer class="m-foot"><div class="m-sum room-sum"><span class="ms-t">${fightMode ? fightSum(s) : `<b>${esc(cupMode ? (cupTracks.length >= CUP_MIN ? cfg.cupName || 'Custom Cup' : 'Cup: picking tracks') : cfg.random ? 'Random track' : TRACKS[cfg.track].name)}</b><small>${plural(players.length, 'player')}${bots0 ? ` + ${plural(bots0, 'bot')}` : ''} · ${cfg.laps} laps${cfg.drift ? ' · drift' : ''}</small>`}</span></div><div class="m-go-wrap" id="netGo"></div></footer>`;
  // the room is redrawn on every change (a pick, the track, someone joining): keep the page where it was scrolled
  ui.innerHTML = ''; ui.appendChild(scr);
  scr.querySelector('#changelog').onclick = openChangelog;   // What's new, as on the menu (C too)
  scr.querySelector('#netLeave').onclick = leaveRoom;
  // your name: ✎ asks for a new one (saved for next time; a player's goes to the host, net-room.js, and is the one a reconnect uses)
  const pen = scr.querySelector('.np-rename');
  if (pen) pen.onclick = () => askName(n0 => {
    const n = cleanName(n0); if (!n || !net.s) return;
    saveName(n); net.s.name = n;
    act('name', { k: 'name', name: n }, pen);
  }, { title: 'Your name', btn: 'Save', value: me ? me.name : loadName() });
  // everyone on a turntable (turntable.js), a spin when their pick changes; the last drawing's turntables carry on
  const was = new Map(tables); tables.clear();
  scr.querySelectorAll('.np-tt').forEach(cv => {
    const p = s.players.find(o => o.id === +cv.dataset.pid); if (!p) return;
    let tt = was.get(p.id);
    if (tt && old && old.contains(tt.cv) && tt.col === PCOL[p.slot]) cv.replaceWith(tt.cv);
    else tt = { cv, col: PCOL[p.slot], t: turntable(cv, { ch: CHARACTERS[p.pick], col: PCOL[p.slot], phase: p.slot * 1.3 }) };
    tables.set(p.id, tt);
    if (seenPick.has(p.id) && seenPick.get(p.id) !== p.pick) tt.t.set(CHARACTERS[p.pick], true);
    seenPick.set(p.id, p.pick);
  });
  mountChat(scr.querySelector('#netChat'));   // the room's chat (chat-ui.js), under who's in
  // racers: yours is ringed in your colour, and everyone's carries their tag (two may pick the same one)
  const chars = scr.querySelector('#netChars');
  if (chars) CHARACTERS.forEach((ch, ci) => {
    const who = [...s.players].filter(p => p.pick === ci).sort((a, b) => a.slot - b.slot), owner = who.includes(me) ? me : who[0];
    const d = document.createElement('div'); d.className = 'char' + (owner ? ' p' + owner.slot : ''); charColors(d, ch);
    d.tabIndex = 0; d.dataset.ci = ci; d.setAttribute('role', 'button'); d.setAttribute('aria-pressed', !!(me && me.pick === ci)); d.setAttribute('aria-label', `${ch.name}${who.length ? ', picked by ' + who.map(p => p.name).join(' and ') : ''}`);
    d.appendChild(again(pool, 'p' + ci, () => rosterPortrait(ch)));
    d.insertAdjacentHTML('beforeend', charInfo(ch) + ownerTags(who.map(p => ({ col: PCOL[p.slot], txt: `P${p.slot + 1} <span class="tn">${esc(p.name)}</span>` }))));
    d.onclick = () => { if (me && me.pick === ci) return; if (act('chars', { k: 'pick', ci }, d)) myPick(ci); };
    d.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); d.click(); } };
    chars.appendChild(d);
  });
  // single race or a cup is the host's call; the track, or the cup (a ready-made one, or 3 to 5 tracks in order), anyone's
  roomMode(scr.querySelector('#netMode'), cfg.mode, host);
  if (fightMode) roomFight(scr, s, host);
  else { roomTracks(scr, s, pool); roomBoardPanel(scr.querySelector('#netBoard'), s); }
  const row = scr.querySelector('#netCfg'), maxBots = MAX_PLAYERS - s.players.length;
  const group = (label, opts, cur, key, to = row) => {
    const set = document.createElement('div'); set.className = 'setting'; set.innerHTML = `<span class="lbl">${label}</span>`;
    const g = document.createElement('span'); g.className = 'seg';
    for (const [v, txt] of opts) { const b = document.createElement('button'); b.textContent = txt; b.className = cur === v ? 'sel' : ''; b.disabled = !host; b.onclick = () => hostSet({ [key]: v }); g.appendChild(b); }
    set.appendChild(g); to.appendChild(set); return set;
  };
  if (fightMode) {   // the fight's settings: Supers (how good a bot is sits on the bot's own card, roomFight)
    group('Map', [['random', 'Random'], ...ARENA_ORDER.map(id => [id, ARENAS[id].name])], ARENAS[cfg.fightArena] || cfg.fightArena === 'random' ? cfg.fightArena : ARENA_ORDER[0], 'fightArena');
    group('Rounds', FIRST_TO.map(n => [n, `First to ${n}`]), matchOf(cfg).n, 'fightRounds');
    group('Round time', ROUND_TIMES.map(t => [t, `${t} s`]), matchOf(cfg).t, 'fightTime');
    group('Supers', [[true, 'On'], [false, 'Off']], cfg.fightSupers !== false, 'fightSupers');
    row.insertAdjacentHTML('beforeend', `<p class="help nf-how">${esc(matchText(matchOf(cfg).n, matchOf(cfg).t))}.${cfg.fightSupers !== false ? ' A full meter turns special into your Super.' : ''}</p>`);
  } else {
  group('Laps', [2, 3, 5].map(n => [n, n]), cfg.laps, 'laps');
  // drift (race-drift.js): the host's call, for everyone; changing it here changes the host's own setting too
  group('Drift', [[true, 'On'], [false, 'Off']], !!cfg.drift, 'drift').querySelectorAll('button').forEach((b, i) => { if (host) b.onclick = () => { settings.drift = i === 0; saveSettings(); hostSet({ drift: settings.drift }); }; });
  // the bots and their skill sit with the players, as on the menu, with the grid summed up
  const who = scr.querySelector('#netWho'), bots = Math.min(cfg.bots, maxBots);
  group('Bots', Array.from({ length: maxBots + 1 }, (_, n) => [n, n || 'None']), bots, 'bots', who);
  group('Bot skill', ['Chill', 'Normal', 'Ruthless'].map((n, i) => [i, n]), cfg.aiLevel, 'aiLevel', who).classList.toggle('off', !bots);
  who.insertAdjacentHTML('beforeend', `<div class="who-sum">${whoSum(s.players.length, bots, s.players.map(p => p.slot).sort((a, b) => a - b))}</div>`);
  }
  const qb = scr.querySelector('.net-qr'); if (qb) qb.onclick = () => showQr(url, s.code);
  for (const b of scr.querySelectorAll('.net-url, .net-copy')) b.onclick = () => copyText(url).then(ok => toast(ok ? 'Link copied: send it to your friends' : 'Couldn\'t copy: select the link and copy it'));
  const go = scr.querySelector('#netGo');
  if (host) {
    const b = document.createElement('button'); b.className = 'big m-go'; b.textContent = fightMode ? 'START FIGHT' : cupMode ? 'START CUP' : 'START RACE';
    b.disabled = s.racing || (cupMode && cupTracks.length < CUP_MIN);
    b.onclick = () => {
      sfx.ensure(); sfx.play('start');
      if (fightMode || !cupMode) return hostStart();
      game.cup = newCup(cfg.cupName || 'Custom Cup', cupTracks, roomRacers(), { online: true, me: s.me }); startCupRace();
    };
    go.appendChild(b);
    if (cupMode && cupTracks.length < CUP_MIN) go.insertAdjacentHTML('beforeend', `<div class="m-hint">Pick a ready-made cup, or click ${CUP_MIN - cupTracks.length} more track${CUP_MIN - cupTracks.length > 1 ? 's' : ''}.</div>`);
  } else {   // a player: waiting, as a state (a turning ring in a chip), and in a fight whether you fight or watch
    const watching = fightMode && !fightSeats(s.players, cfg).seats.includes(s.me);
    go.insertAdjacentHTML('beforeend', `<div class="room-wait" role="status"><span class="wait-chip"><i class="wait-spin" aria-hidden="true"></i>${watching ? 'You watch · ' : ''}Waiting for the host to start the ${fightMode ? 'fight' : cupMode ? 'cup' : 'race'}</span></div>`);
  }
  coolMarks();
  scr.querySelector('.m-body').scrollTop = keep;   // after everything's in, so the page is tall enough to scroll back to where it was
  sfx.music('menu');
}

// ---------------------------------------------------------------- Fight mode in the room (fight-net.js)
// the room's mode: a single race, a cup, or a fight (the host's call)
function roomMode(el, mode, host) {
  const cur = mode === 'cup' || mode === 'fight' ? mode : 'single';
  el.innerHTML = `<span class="seg">${[['single', 'Single race'], ['cup', 'Cup'], ['fight', 'Fight']].map(([m, l]) => `<button data-mode="${m}" class="${cur === m ? 'sel' : ''}"${host ? '' : ' disabled'}>${l}</button>`).join('')}</span>
    <span class="help">${cur === 'fight' ? '1v1 on a floating platform: the first two players fight (one alone gets a bot), everyone else watches. Keys, a gamepad or touch.' : cur === 'cup' ? '3 to 5 tracks back to back, points for every place' : host ? 'Pick a track, or switch to <b>Cup</b> for 3 to 5 in a row, or <b>Fight</b> for a 1v1' : 'One race: anyone picks the track, the host can make it a cup or a fight'}</span>`;
  if (host) el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => hostSet({ mode: b.dataset.mode }));
}
const fighterName = id => (FIGHTERS[id] && FIGHTERS[id].name) || id;
function fightSum(s) {
  const seat = fightSeats(s.players, s.cfg), who = i => seat.seats[i] < 0 ? 'bot' : seat.names[i];
  return `<b>Fight: ${esc(fighterName(seat.ids[0]))} vs ${esc(fighterName(seat.ids[1]))}</b><small>${esc(who(0))} vs ${esc(who(1))} · ${esc(matchShort(matchOf(s.cfg).n, matchOf(s.cfg).t))}${seat.supers ? ' · supers' : ''}</small>`;
}
// the two fighters as the offline Fight screen's cards (fight-ui.js fighterCard): P1 red, P2 blue. Your own card picks your
// fighter, the other updates live; a bot's card is the host's (level and fighter). Under them, who's watching.
const LV = ['Chill', 'Normal', 'Ruthless'];
const seenFighter = [null, null];
function roomFight(scr, s, host) {
  const box = scr.querySelector('#netFight'), seat = fightSeats(s.players, s.cfg), me = s.players.find(p => p.id === s.me);
  const mySeat = seat.seats.indexOf(s.me), lv = [0, 1, 2].includes(s.cfg.fightBot) ? s.cfg.fightBot : 1;
  const info = i => { const pid = seat.seats[i]; return { id: seat.ids[i], L: 'solo', col: PCOL[i], whose: i === mySeat ? 'your keys' : pid < 0 ? 'one-player keys' : 'their keys' }; };
  box.innerHTML = [0, 1].map(i => {
    const pid = seat.seats[i], p = s.players.find(o => o.id === pid), id = seat.ids[i], mine = i === mySeat, bot = pid < 0, name = fighterName(id);
    const tags = `${mine ? ' <span class="net-you">you</span>' : ''}${p && p.id === 0 ? ' <span class="net-you">host</span>' : ''}`;
    const head = bot
      ? `<b class="fs-p">P${i + 1}</b><span class="nf-name">Bot${host ? '' : ` · ${esc(LV[lv])}`}</span>${host ? `<span class="seg nf-lv" role="group" aria-label="The bot's level">${LV.map((l, k) => `<button type="button" data-lv="${k}" aria-pressed="${k === lv}"${k === lv ? ' class="sel"' : ''}>${l}</button>`).join('')}</span>` : ''}`
      : `<b class="fs-p">P${i + 1}</b><span class="nf-name">${esc(p.name)}</span>${tags}${mine ? '<span class="nf-state">pick your fighter</span>' : '<span class="nf-state live">picks live</span>'}`;
    const foot = mine ? keyBoard('solo', id, PCOL[i])
      : bot ? `<p class="fs-keys">A bot plays ${esc(name)} (${LV[lv]}).${host ? ' You pick its fighter and level.' : ''}</p>` : '';
    return fighterCard(i, id, { L: 'solo', whose: info(i).whose, edit: mine || (bot && host), head, foot, cls: mine ? 'nf-mine' : '' });
  }).join(`<div class="nf-vsmu">${VS}<div class="fs-mu" role="group" aria-label="Matchup">${matchupHTML(seat.ids)}</div></div>`);   // (the matchup between the two: Ruthless bots' fights)
  [0, 1].forEach(i => { if (seenFighter[i] && seenFighter[i] !== seat.ids[i]) popStage(i); seenFighter[i] = seat.ids[i]; });
  wireCards(box, { info, pick: (i, id) => {
    if (i === mySeat) act('chars', { k: 'fpick', id }, box.querySelector(`[data-pick="${i}"][data-id="${id}"]`));
    else if (host && seat.seats[i] < 0) hostSet({ fightBotId: id });
  } });
  box.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => { sfx.play('click'); hostSet({ fightBot: +b.dataset.lv }); });
  // who's watching: everyone not on a seat, a touch-only device marked so
  const watch = s.players.filter(p => !seat.seats.includes(p.id)).sort((a, b) => a.slot - b.slot), wbox = scr.querySelector('#nfWatch');
  const note = !me ? '' : me.kb === false ? 'This device has a touch screen only: you watch. Plug in a keyboard or a gamepad to fight.' : mySeat < 0 ? 'Two others fight this one: you watch.' : '';
  wbox.innerHTML = (watch.length ? `<span class="nf-wl">Watching</span>${watch.map(p => `<span class="nf-chip${p.id === s.me ? ' me' : ''}" style="--pc:${PCOL[p.slot]}"><span class="ps-tag">P${p.slot + 1}</span>${esc(p.name)}${p.kb === false ? '<small>touch screen</small>' : ''}</span>`).join('')}` : '')
    + (note ? `<span class="help nf-note">${note}</span>` : '');
  wbox.hidden = !wbox.innerHTML;
}
// the left column in a fight: everyone in the room on one line each (your name's pen, the link chips), and who does what
function fightPeople(s, players) {
  const seat = fightSeats(s.players, s.cfg);
  return `<div class="panel"><h2>In the room</h2><div class="nf-people">${players.map(p => {
    const i = seat.seats.indexOf(p.id), role = i >= 0 ? `<span class="nf-role" style="--sc:${PCOL[i]}">P${i + 1} · ${esc(fighterName(seat.ids[i]))}</span>` : `<span class="nf-role watch">${p.kb === false ? 'watches · touch screen' : 'watches'}</span>`;
    return `<div class="nf-person${p.id === s.me ? ' me' : ''}" style="--pc:${PCOL[p.slot]}"><span class="ps-tag">P${p.slot + 1}</span> <b>${esc(p.name)}</b>${p.id === s.me ? `${s.racing ? '' : ` <button class="np-rename" title="Change your name" aria-label="Change your name">${PEN_ICON}</button>`} <span class="net-you">you</span>` : ''}${p.id === 0 ? ' <span class="net-you">host</span>' : ` <span class="np-ping" data-pid="${p.id}">${linkChip(pingOf(p.id))}</span>`}${role}</div>`;
  }).join('')}</div>
    ${s.racing ? '<div class="help" style="margin-top:8px"><b>A fight is on.</b> Watch it, or wait for the next one.</div>' : ''}</div>`;
}

// an online race's results (ui.js showResults hands over its buttons): the host takes everyone back to the room, or on
// to the cup's next race or podium once the scores are sent; the others wait. Top left: Close room (host) or Leave room
function roomBack(scr, host) {
  const b = scr.querySelector('#rback'); if (!b) return;
  const t = host ? 'Close room' : 'Leave room';
  b.querySelector('span').textContent = t; b.title = t; b.setAttribute('aria-label', t); b.onclick = leaveRoom;
}
export function onlineResults(race, scr, cup) {
  const row = scr.querySelector('#resbtns') || scr; row.innerHTML = '';
  const s = net.s, host = s && s.role === 'host', last = cup && cup.race === cup.tracks.length - 1;
  if (cup && host) { syncLeft(cup); hostCup(cupWire(cup), true); }
  const btn = (html, fn, big, key) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = big ? 'big m-go' : 'r-btn';
    b.innerHTML = html + (key && !big ? `<kbd class="kb-only">${key}</kbd>` : ''); if (key) b.setAttribute('aria-keyshortcuts', key);
    b.onclick = fn; row.appendChild(b); return b;
  };
  if (host && cup) {
    btn('End cup', endCup);
    btn(last ? 'PODIUM' : 'NEXT RACE', () => { if (last) { hostPodium(); showPodium(cup); } else { cup.race++; startCupRace(); } }, true, 'Enter');
  } else if (host) {   // straight into another race from here: the same track, or the next (Random: another random one), or back to the room
    const cfg = s.cfg, nextT = (race.trackIdx + 1) % TRACKS.length;
    btn('Back to room', hostToRoom);
    if (cfg.random) btn('<span class="ms-t"><small>Next</small><b>Random track</b></span>', () => hostStart(), false, 'N').id = 'netNext';
    else {
      row.insertAdjacentHTML('beforeend', nextTrackBtn(nextT, 'N', 'netNext', 'Next'));
      row.querySelector('#netNext').onclick = () => { cfg.track = nextT; cfg.trackBy = s.me; hostStart({ track: nextT }); };
    }
    btn('REMATCH', () => hostStart({ track: race.trackIdx }), true, 'Enter');
  } else row.insertAdjacentHTML('beforeend', `<div class="r-wait" role="status">${cup ? (last ? 'Waiting for the host to show the podium…' : 'Waiting for the host to start the next race…') : 'Waiting for the host: a rematch, the next track, or back to the room.'}</div>`);
  fillMinis(row);
  roomBack(scr, host);
  mountChat(scr.querySelector('#rchat') || scr, true);   // the chat, beside the results
}
// an online cup's podium (ui.js showPodium hands over its buttons): the host takes everyone back to the room
export function onlinePodium(scr) {
  const row = scr.querySelector('#podbtns'); row.innerHTML = '';
  const s = net.s, host = s && s.role === 'host';
  if (host) { const b = document.createElement('button'); b.type = 'button'; b.className = 'big m-go'; b.textContent = 'BACK TO ROOM'; b.setAttribute('aria-keyshortcuts', 'Enter'); b.onclick = endCup; row.appendChild(b); }
  else row.insertAdjacentHTML('beforeend', '<div class="r-wait" role="status">The host takes everyone back to the room.</div>');
  roomBack(scr, host);
  mountChat(scr.querySelector('#rchat') || scr, true);
}
