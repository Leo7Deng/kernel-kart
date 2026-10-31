// Kernel Kart: time trial UI (offline only): menu box, start, quick retry (R), results, sharing and opening ghost
// links (#ghost=…). Session: timetrial.js; ghost packing: ghost-share.js; leaderboard: leaderboard-ui.js.
import { sfx } from './audio.js';
import { CHARACTERS, PCOL, setKeys } from './core.js';
import { Input } from './input.js';
import { Race } from './race.js';
import { resetTrackCache } from './render.js';
import { TRACKS } from './tracks.js';
import { TimeTrial, bestWord, fmtDelta, fmtLap, loadRecord, loadRecords, ttKey, ttName, ttPlan } from './timetrial.js';
import { saveSettings, settings } from './settings.js';
import { RIVAL, addRival, decodeGhostPayload, dropRival, encodeGhostPayload, ghostLink, ghostParam, loadRival, loadRivals, selectRival } from './ghost-share.js';
import { askName, copyText, loadName } from './net-ui.js';
import { lbAutoPost, lbPanel } from './leaderboard-ui.js';
// which record keys this game uses (timetrial.js ttKey), and how to label them
const recKey = def => ttKey(ttName(def), settings.drift), oldKey = def => ttKey(ttName(def), settings.drift, false), driftNote = () => settings.drift ? 'with drift' : 'no drift';
import { announce, esc, game, leave, nextTrackBtn, portrait, resultsFrame, saveSetup, screenKeys, setMode, setup, showLoading, showMenu, toast, clearForRace } from './ui.js';
import { turntable } from './turntable.js';
import { noteRecent } from './qol.js';
// a stopwatch (inline SVG, like the cup trophies)
export const stopwatch = (col = '#7be0ff', cls = '') => `<svg class="trophy ${cls}" viewBox="0 0 48 48" aria-hidden="true">
  <rect x="19" y="3" width="10" height="5" rx="1.5" fill="${col}"/><rect x="22" y="7" width="4" height="5" fill="${col}"/>
  <path d="M35 10.5l3.5-3.5 3 3-3.5 3.5" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round"/>
  <circle cx="24" cy="27" r="17" fill="${col}"/><circle cx="24" cy="27" r="13" fill="#141826"/>
  <path d="M24 27V17.5" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M24 27l6 4" stroke="${col}" stroke-width="2.6" stroke-linecap="round"/>
  <circle cx="24" cy="27" r="2.4" fill="#fff"/><path d="M14 19a13 13 0 0 1 6-4.4" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const unitWord = plan => bestWord(plan);
const charName = id => (CHARACTERS.find(c => c.id === id) || { name: '?' }).name;

// a track card in time trial mode: your best on its picture, and who set it
export function recordBadge(def) {
  const r = loadRecords()[recKey(def)], plan = ttPlan(def);
  return r && r.t > 0 ? `<div class="ttb" title="Your best ${unitWord(plan)}${settings.drift ? ' with drift' : ''}">${stopwatch('#ffcf3a')}<span><small>BEST ${unitWord(plan).toUpperCase()}</small>${fmtLap(r.t)}</span></div>`
    : '';   // (none yet: nothing, so the times you have stand out)
}
export function recordLine(def) {
  const r = loadRecords()[recKey(def)];
  return r && r.t > 0 ? `<div class="d best tt">Set with ${esc(charName(r.ch))}</div>` : '';
}
// the Track panel's time trial box: the picked track, your best on it (big) and what a run is there
export function ttBox(el) {
  const def = TRACKS[setup.ttTrack], plan = ttPlan(def), rec = loadRecord(recKey(def)), ch = CHARACTERS[setup.picks[0]], w = unitWord(plan);
  const old = !rec && loadRecords()[oldKey(def)];   // a best set with obstacles: shown, not raced
  el.innerHTML = `<div class="ttbox">
    <div class="tt-head">${stopwatch()}<div><b>${esc(def.name)}</b><span class="help">${esc(ch.name)} alone, no bots, no items, no obstacles (no trains, lava, crabs or the like: the road and its jumps stay). ${plan.endless ? 'Hot laps: drive as many as you like, <strong>only your fastest lap counts</strong>.' : plan.unit === 'lap' ? `${plan.what[0].toUpperCase() + plan.what.slice(1)}: <strong>that lap is your time</strong>.` : `${plan.what[0].toUpperCase() + plan.what.slice(1)}: <strong>the whole run is your time</strong> (a lap on its own means nothing here).`} Beat your best and it becomes your ghost.</span></div></div>
    <div class="tt-rec"><span class="lbl">Your best ${w} <small>(${driftNote()})</small></span><b${rec ? '' : ' class="none"'}>${rec ? fmtLap(rec.t) : '—'}</b>${rec ? `<span class="help">${esc(charName(rec.ch))}${rec.ghost ? ' · its ghost races you' : ''}</span>` : `<span class="help">no time yet: set the first one${old ? ` (with obstacles it was ${fmtLap(old.t)})` : ''}</span>`}</div>
    ${rivalsHtml(def, rec)}
    <div class="tt-lb" id="ttLb" hidden></div>
    <div class="help tt-keys"><kbd>R</kbd> restarts · <kbd>Esc</kbd> (or the pause button) ends it and shows your times · live gap to your best${loadRivals(recKey(def)).sel ? ' (or your rival\'s)' : ''} on screen</div></div>`;
  wireRivals(el, def, () => ttBox(el));
  // the leaderboard on the game's server (leaderboard-ui.js): Race on a row makes it your rival, as the rivals above do
  lbPanel(el.querySelector('#ttLb'), { key: recKey(def), def, drift: settings.drift, onRace: () => ttBox(el) });
}

// ----- friends' ghosts on the box: Share my ghost, and a row per rival (pick one to race, ✕ forgets; none: your own)
const shareIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" class="ic"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
function rivalsHtml(def, rec) {
  const o = loadRivals(recKey(def)), mine = rec && rec.t;
  const rows = o.list.slice().sort((a, b) => a.t - b.t).map(e => `<div class="tt-rv${e.id === o.sel ? ' sel' : ''}" role="button" tabindex="0" data-rv="${esc(e.id)}" aria-pressed="${e.id === o.sel}" title="${e.id === o.sel ? 'Racing this ghost: click to race only your own' : 'Race this ghost'}">
      <span class="rv-port" data-ch="${esc(e.ch)}"></span><span class="rv-who"><b>${esc(e.name)}</b><small>${esc(charName(e.ch))}${e.via === 'room' ? ' · from a room' : e.via === 'board' ? ' · from the leaderboard' : ''}</small></span>
      <span class="rv-t">${fmtLap(e.t)}</span><span class="rv-d">${mine ? fmtDelta(mine - e.t) : ''}</span>
      <span class="rv-go">${e.id === o.sel ? 'RACING' : 'Race'}</span><button class="rv-x" data-x="${esc(e.id)}" title="Forget ${esc(e.name)}'s ghost" aria-label="Forget ${esc(e.name)}'s ghost">✕</button></div>`).join('');
  return `<div class="tt-rivals" style="--rv:${RIVAL}">
    <div class="tt-rv-head"><span class="lbl">Rivals <small>friends' ghosts here, ${driftNote()}</small></span>
      <button class="tt-share" id="ttShare"${rec && rec.ghost ? '' : ' disabled title="Set a time first: then its ghost can go to a friend"'}>${shareIcon}Share my ghost</button></div>
    ${rows || `<div class="help tt-rv-none">No friends' ghosts here yet. <b>Share my ghost</b> copies a link: a friend who opens it races your ghost and can send theirs back. In an online room everyone's best on the room's track shows, to save.</div>`}</div>`;
}
function wireRivals(el, def, redraw) {
  const key = recKey(def);
  el.querySelectorAll('.rv-port').forEach(p => { const ch = CHARACTERS.find(c => c.id === p.dataset.ch); if (ch) p.appendChild(portrait(ch)); });
  el.querySelectorAll('[data-rv]').forEach(r => {
    const pick = () => { const o = loadRivals(key); selectRival(key, o.sel === r.dataset.rv ? null : r.dataset.rv); redraw(); };
    r.onclick = pick; r.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pick(); } };
  });
  el.querySelectorAll('[data-x]').forEach(b => b.onclick = e => { e.stopPropagation(); const r = loadRivals(key).list.find(x => x.id === b.dataset.x); dropRival(key, b.dataset.x); if (r) toast(`Forgot ${r.name}'s ghost`); redraw(); });
  const sh = el.querySelector('#ttShare'); if (sh) { sh.onclick = () => shareGhost(def); prepLink(def); }
}

// ----- sharing your ghost as a link. Made ahead, as the button is drawn: Safari only lets a page copy inside the click
const WEB = 'https://leo7deng.github.io/kernel-kart/';
// a ghost link points at this page, or the web version when this is localhost
export function linkBase() {
  const u = new URL(location.href); u.hash = ''; u.search = '';
  return /^(localhost|127\.|\[?::1\]?$)/.test(u.hostname) ? WEB : u.href;
}
const links = new Map();   // record key -> { sig, link (null while it's being made), p (the promise of it) }
function prepLink(def, drift = settings.drift, name = loadName()) {
  const key = ttKey(ttName(def), drift), rec = loadRecord(key); if (!rec || !rec.ghost || !name) return null;
  const sig = `${rec.t}|${rec.ghost.ch}|${name}|${linkBase()}`, had = links.get(key); if (had && had.sig === sig) return had;
  const e = { sig, link: null };
  e.p = encodeGhostPayload({ track: def.name, rev: def.rev || 0, drift, clear: true, name, ch: rec.ghost.ch, t: rec.t, cp: rec.ghost.cp }, rec.ghost.s).then(p => (e.link = ghostLink(linkBase(), p)));
  links.set(key, e); return e;
}
// share your best ghost on def (drift: which records). back: the friend whose ghost you just beat, for the words
export function shareGhost(def, { drift = settings.drift, back = null } = {}) {
  const rec = loadRecord(ttKey(ttName(def), drift));
  if (!rec || !rec.ghost) { toast('Set a time first: then its ghost can go to a friend'); return; }
  const go = name => {
    const e = prepLink(def, drift, name), said = l => `${back ? `Your ghost for ${back} is copied` : 'Ghost link copied'}: paste it to a friend (${l.length} characters)`;
    if (e.link) { copyText(e.link).then(ok => ok ? toast(said(e.link)) : linkBox(e.link, def)); return; }
    // not made yet: copy it when it is if the browser allows, else show it
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write && isSecureContext) {
      navigator.clipboard.write([new ClipboardItem({ 'text/plain': e.p.then(l => new Blob([l], { type: 'text/plain' })) })]).then(() => toast(said(e.link)), () => e.p.then(l => linkBox(l, def)));
    } else e.p.then(l => copyText(l).then(ok => ok ? toast(said(l)) : linkBox(l, def)));
  };
  const n = loadName(); if (n) go(n);
  else askName(go, { title: 'Share your ghost', btn: 'Copy the link', note: 'Your friend sees this name on your ghost.' });
}
// the link to copy by hand, where copying didn't work (an http page on some browsers)
function linkBox(link, def) {
  const back = document.createElement('div'); back.className = 'cl-back';
  back.innerHTML = `<div class="panel cl-box net-ask tt-linkbox" role="dialog" aria-label="Your ghost link"><div class="cl-head"><h2>Your ghost on ${esc(def.name)}</h2><button class="cl-x" id="lb-x">✕</button></div>
    <div class="help">Send this link to a friend: opening it races your ghost.</div><textarea readonly rows="4" id="lbText"></textarea>
    <div class="row net"><button id="lbCopy" class="go">Copy</button></div></div>`;
  document.body.append(back);
  const ta = back.querySelector('#lbText'), shut = () => back.remove(); ta.value = link; ta.focus(); ta.select();
  back.querySelector('#lb-x').onclick = shut; back.addEventListener('mousedown', e => { if (e.target === back) shut(); });
  back.querySelector('#lbCopy').onclick = () => copyText(link).then(ok => { if (ok) { toast('Ghost link copied'); shut(); } else { ta.focus(); ta.select(); toast('Select it and copy'); } });
  ta.onkeydown = e => { if (e.key === 'Escape') shut(); };
}

// ----- opening a friend's link (#ghost=…): keep it as your rival there and offer to race it (from ui.js showMenu)
let opening = false;
export const ghostLinkPending = () => !!ghostParam(location.hash);
export async function openGhostLink() {
  const p = ghostParam(location.hash); if (!p || opening) return;
  if (game.state !== 'menu' && game.state !== 'results') return;
  history.replaceState(null, '', location.pathname + location.search);   // so a reload doesn't reopen it
  opening = true;
  try {
    const { meta, s } = await decodeGhostPayload(p);
    const ti = TRACKS.findIndex(t => t.name === meta.track);
    if (ti < 0) throw new Error(`That ghost is on ${meta.track}, which this version of the game doesn't have.`);
    const def = TRACKS[ti];
    if ((def.rev || 0) !== meta.rev) throw new Error(`That ghost was set on ${meta.rev > (def.rev || 0) ? 'a newer' : 'an older'} layout of ${def.name}, so it would drive a road that isn't there.`);
    if (!meta.clear) throw new Error(`That ghost was set before time trials lost their obstacles (trains, lava and the like), so it isn't a fair race any more: ask ${meta.name} for a new link.`);
    const flip = meta.drift !== settings.drift;
    if (flip) { settings.drift = meta.drift; saveSettings(); }   // race it the way it was set
    if (!addRival(ttKey(ttName(def), meta.drift), meta, s, { via: 'link' })) throw new Error('There\'s no room left to keep it (storage is full).');
    setMode('tt'); setup.ttTrack = ti; saveSetup();
    showMenu('track');   // behind the card, where Esc returns
    ghostPick(meta, def, flip);   // pick your racer, then straight into the time trial against it
  } catch (e) { ghostNote('That ghost link didn\'t work', esc(e && e.message || 'It may have been cut short: ask for it again.')); }
  opening = false;
}
addEventListener('hashchange', () => { if (ghostLinkPending()) openGhostLink(); });
// a friend's link: pick your racer (the rest is the ghost's), then RACE IT
function ghostPick(meta, def, flip) {
  const fch = CHARACTERS.find(c => c.id === meta.ch);
  const grid = CHARACTERS.map((c, i) => `<button type="button" class="gp-c" data-i="${i}" aria-pressed="${setup.picks[0] === i}"><span class="gp-p"></span><b>${esc(c.name)}</b></button>`).join('');
  const box = ghostNote(`Race ${meta.name}'s ghost`, `<div class="tt-wcard" style="--rv:${RIVAL}"><span class="rv-port"></span><div class="rv-who"><b>${esc(meta.name)}</b><small>${esc(def.name)} · ${esc(fch ? fch.name : '?')} · ${meta.drift ? 'with drift' : 'no drift'}</small></div><span class="rv-t">${fmtLap(meta.t)}</span></div>
    <div class="help">Pick your racer${flip ? ` (Drift is now <b>${meta.drift ? 'on' : 'off'}</b> to match their ghost)` : ''}:</div><div class="gp-grid" role="group" aria-label="Your racer">${grid}</div>`,
    [['Later', null, false], ['RACE IT', () => startTimeTrial(), true]]);
  const p = box.querySelector('.rv-port'); if (fch && p) p.appendChild(portrait(fch));
  const cards = [...box.querySelectorAll('.gp-c')];
  cards.forEach(b => { b.querySelector('.gp-p').appendChild(portrait(CHARACTERS[+b.dataset.i]));
    b.onclick = () => { setup.picks[0] = +b.dataset.i; saveSetup(); cards.forEach(x => x.setAttribute('aria-pressed', String(x === b))); };
    b.ondblclick = () => box.querySelector('.go').click(); });
  box.querySelector('.gp-grid').addEventListener('keydown', e => {
    const i = cards.indexOf(document.activeElement), d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 5, ArrowUp: -5 }[e.key];
    if (i < 0 || !d) return; e.preventDefault(); cards[(i + d + cards.length) % cards.length].focus();
  });
}
// a card over the screen: a title, some html, buttons [text, fn, main]
function ghostNote(title, html, buttons = [['OK', null, true]]) {
  const back = document.createElement('div'); back.className = 'cl-back';
  back.innerHTML = `<div class="panel cl-box net-ask tt-welcome" role="dialog" aria-label="${esc(title)}"><div class="cl-head"><h2>${esc(title)}</h2><button class="cl-x" id="gn-x">✕</button></div>
    <div class="tt-wbody">${html}</div><div class="row net" id="gnBtns"></div></div>`;
  document.body.append(back);
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); shut(); } };
  const shut = () => { back.remove(); document.removeEventListener('keydown', key, true); }, row = back.querySelector('#gnBtns');
  document.addEventListener('keydown', key, true);
  for (const [txt, fn, main] of buttons) { const b = document.createElement('button'); b.textContent = txt; if (main) b.className = 'go'; b.onclick = () => { shut(); if (fn) fn(); }; row.appendChild(b); }
  back.querySelector('#gn-x').onclick = shut; back.addEventListener('mousedown', e => { if (e.target === back) shut(); });
  const m = row.querySelector('.go'); if (m) m.focus();
  return back;
}

// R in a time trial: straight back to the grid
document.addEventListener('keydown', e => {
  if (e.repeat || e.key.toLowerCase() !== 'r' || game.state !== 'race' || !game.race || !game.race.tt) return;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  e.preventDefault(); startTimeTrial({ immediate: true });
});

// a time trial on setup.ttTrack with P1's racer. immediate: no loading screen (a retry)
export function startTimeTrial(opts = {}) {
  const trackIdx = setup.ttTrack, def = TRACKS[trackIdx], plan = ttPlan(def), ch = CHARACTERS[setup.picks[0]];
  const racers = [{ ch, human: true, pIndex: 0 }];
  game.cup = null; Input.humans = 1; setKeys(1); Input.reset();
  const rec = loadRecord(recKey(def)), rival = loadRival(recKey(def));
  const launch = () => {
    const race = new Race(trackIdx, { racers, laps: plan.laps, aiLevel: setup.aiLevel, drift: settings.drift, calm: true });   // calm: no obstacles
    race.boxes = []; race.bits = [];     // nothing to pick up, no bits (the road's own features stay)
    new TimeTrial(race, plan, rec, rival);   // watches the race: race.tt
    game.race = race; resetTrackCache(); sfx.music('race' + trackIdx); noteRecent(def.name);
    document.getElementById('ui').innerHTML = ''; game.state = 'race'; clearForRace();
  };
  if (opts.immediate) { sfx.play('start'); launch(); return; }
  showLoading(trackIdx, racers, launch, { top: 'TIME TRIAL', badges: ['TIME TRIAL', plan.endless ? 'HOT LAPS · FASTEST LAP COUNTS' : plan.unit === 'run' ? `1 RUN · ${plan.laps} ${def.open ? 'STAGES' : 'LAPS'}` : `${plan.laps} LAP${plan.laps > 1 ? 'S' : ''}`, 'NO BOTS · NO ITEMS', 'NO OBSTACLES', settings.drift ? 'DRIFT ON' : 'NO DRIFT', rec ? `BEST ${unitWord(plan).toUpperCase()} ${fmtLap(rec.t)}` : 'NO BEST YET', ...(rival ? [`VS ${rival.name.toUpperCase()} ${fmtLap(rival.t)}`] : [])] });
}

// Esc in a time trial (or End trial on the pause card): end it and show the laps
export function endTimeTrial(race) { race.tt.stop(); race.over = true; }

// results (in ui.js resultsFrame): fastest lap vs your best and the rival, its sectors, the ideal lap, every lap, and
// Share ghost / next track / RETRY
export function showTTResults(race) {
  const tt = race.tt, def = race.track.def, plan = tt.plan, word = unitWord(plan), best = tt.sessionBest, ch = race.cars[0].ch;
  tt.stop(); Input.reset();
  sfx.music('results');
  game.state = 'results';
  const set = tt.laps.some(l => l.newBest), pill = '<span class="r-new">New best</span>', Word = word[0].toUpperCase() + word.slice(1);
  const rec = tt.record, old = tt.before, rv = tt.rival, beat = !!(rv && best && best < rv.t), bi = tt.bestIdx;
  const dl = (d, txt = '') => `<b class="${Math.abs(d) < 0.005 ? 'even' : d < 0 ? 'good' : 'bad'}">${fmtDelta(d)}</b>${txt}`;
  const vs = !best ? (rec ? `Your best is still ${fmtLap(rec.t)}` : `No timed ${word} yet`)
    : set ? (old ? `${dl(best - old.t)} on your old best, ${fmtLap(old.t)}` : `Your first ${word} here: now beat it`)
    : `${dl(best - rec.t)} off your best`;
  // the comparisons under the time
  const cmp = [
    `<li><span>Your best ${word}</span><b class="best">${rec ? fmtLap(rec.t) : '—'}</b><small>${rec ? esc(charName(rec.ch)) + (set ? ' · just now' : '') : 'none yet'}</small></li>`,
    rv ? `<li class="rival" style="--rv:${RIVAL}"><span>${esc(rv.name)}'s ghost</span><b>${fmtLap(rv.t)}</b><small>${!best ? esc(charName(rv.ch)) : beat ? `${dl(best - rv.t)}: you beat it` : `${dl(best - rv.t)} to go`}</small></li>` : '',
  ].join('');
  const hero = `<section class="r-card r-hero${set ? ' mine' : ''}" style="--pc:${PCOL[0]}" aria-labelledby="rh-k">
      <div class="rh-stage"><canvas class="rh-tt" aria-hidden="true"></canvas><span class="rh-medal sw" aria-hidden="true">${stopwatch('#ffcf3a')}</span></div>
      <div class="rh-info"><h2 class="rh-kick" id="rh-k">${set ? `New best ${word}!` : best ? `${plan.unit === 'run' ? 'Your run' : `Fastest ${word}`}` : 'Time trial'}</h2>
        <p class="rh-name">${esc(ch.name)}<span class="rr-tag">YOU</span></p>
        <p class="rh-time"><b>${fmtLap(best)}</b><span>${vs}</span></p>
        <ul class="rh-cmp" aria-label="Against">${cmp}</ul></div></section>`;
  // sectors of the fastest attempt (quarters; a run: laps or stages)
  const per = plan.unitLaps > 1, lbl = i => per ? `${def.open ? 'Stage' : 'Lap'} ${i + 1}` : `S${i + 1}`;
  const secs = (cp, t) => { if (!cp || cp.length !== tt.nCp || !(t > 0)) return null; const pts = [...cp, t], ends = per ? pts.filter((_, i) => i % 4 === 3) : pts; return ends.map((e, i) => e - (i ? ends[i - 1] : 0)); };
  const bl = bi >= 0 ? tt.laps[bi] : null, mine = bl && secs(bl.cp, bl.t), g0 = tt.ghost0, vsBest = g0 && secs(g0.cp, g0.t), vsRv = rv && secs(rv.cp, rv.t);
  const all = tt.laps.map(l => secs(l.cp, l.t)).filter(Boolean), ideal = !per && mine && all.length > 1 ? mine.map((_, k) => Math.min(...all.map(x => x[k]))).reduce((a, b) => a + b, 0) : 0;
  const dRow = (head, o) => o ? `<tr><th scope="row">${head}</th>${mine.map((x, k) => `<td>${dl(x - o[k])}</td>`).join('')}</tr>` : '';
  const sect = mine ? `<section class="r-card r-sect" aria-labelledby="rs-h"><h2 class="r-h" id="rs-h">Sectors<small>${per ? `your ${word}, ${def.open ? 'stage' : 'lap'} by ${def.open ? 'stage' : 'lap'}` : `your fastest ${word} in quarters`}</small></h2>
      <div class="r-tablewrap"><table class="r-table"><thead><tr><th scope="col"><span class="sr-only">Sector</span></th>${mine.map((_, i) => `<th scope="col">${lbl(i)}</th>`).join('')}</tr></thead>
      <tbody><tr class="yours"><th scope="row">Yours</th>${mine.map(x => `<td>${x.toFixed(2)}</td>`).join('')}</tr>${dRow(set ? 'vs old best' : 'vs best', vsBest)}${dRow(`vs ${esc(rv ? rv.name : '')}`, vsRv)}</tbody></table></div>
      ${ideal ? `<p class="r-ideal">Ideal ${word} from your best sectors: <b>${fmtLap(ideal)}</b></p>` : ''}</section>` : '';
  const rows = tt.laps.length ? tt.laps.map((l, i) => `<li class="rr human me${i === bi ? ' first' : ''}" style="--d:${Math.min(i, 8)};--pc:${PCOL[0]}">
      <span class="rr-pos">${i + 1}</span><span class="rr-who"><b class="rr-nm">${plan.unit === 'run' ? 'Run' : 'Lap ' + (i + 1)}</b></span>
      <span class="rr-time"><b>${fmtLap(l.t)}</b>${l.newBest ? pill : ''}</span>
      <span class="rr-lap"><small>${i === bi ? 'fastest' : 'to fastest'}</small><b>${i === bi ? '★' : fmtDelta(l.t - best)}</b></span></li>`).join('')
    : `<li class="rr bot none"><span class="rr-pos">–</span><span class="rr-who"><b class="rr-nm">No timed ${word} yet</b><small>finish a whole ${word} to set one</small></span></li>`;
  const laps = `<section class="r-card r-laps" aria-labelledby="rl-h"><h2 class="r-h" id="rl-h">${plan.unit === 'run' ? 'Your run' : 'Laps'}<small>${plan.what}</small></h2><ol class="r-list tt-list" role="list">${rows}</ol></section>`;
  const canShare = !!(rec && tt.ghost), nextT = (setup.ttTrack + 1) % TRACKS.length;
  const s = resultsFrame({
    cls: 'r-tt' + (mine ? '' : ' no-sect'), label: `Time trial results: ${def.name}`, back: 'Menu',
    mode: `${stopwatch()}Time trial · ${race.drift ? 'with drift' : 'no drift'}`, title: esc(def.name),
    body: hero + sect + laps + '<section class="r-card r-lb tt-lb" id="rLb" aria-label="Leaderboard" hidden></section>',
    foot: `<div class="r-btns">${canShare ? `<button type="button" id="share" class="r-btn res-share${beat ? ' go' : ''}" aria-keyshortcuts="S">${shareIcon}<span>${beat ? `Send yours back to ${esc(rv.name)}` : 'Share ghost'}</span><kbd class="kb-only">S</kbd></button>` : ''}
      ${nextTrackBtn(nextT)}<button type="button" class="big m-go" id="again" aria-keyshortcuts="Enter R">RETRY</button></div>`,
  });
  turntable(s.querySelector('.rh-tt'), { ch, col: PCOL[0], happy: set, phase: 0.8 }).set(ch, set);
  announce(s, best ? `${set ? `New best ${word}: ` : `Fastest ${word}: `}${fmtLap(best)}.${rv ? ` ${rv.name}'s ghost: ${fmtLap(rv.t)}, ${beat ? 'beaten' : 'not beaten yet'}.` : ''}` : `No timed ${word} yet.`);
  const again = leave(() => startTimeTrial({ immediate: true }));
  const next = leave(() => { setup.ttTrack = nextT; saveSetup(); startTimeTrial(); }), menu = leave(showMenu);
  s.querySelector('#again').onclick = again; s.querySelector('#next').onclick = next; s.querySelector('#rback').onclick = menu;
  const shareB = s.querySelector('#share'), share = () => shareGhost(def, { drift: race.drift, back: beat ? rv.name : null });
  if (shareB) { shareB.onclick = share; prepLink(def, race.drift); }
  // the leaderboard: top five and you; Race on a row retries against that ghost
  const lbEl = s.querySelector('#rLb'), lbOpts = { key: tt.name, def, drift: race.drift, max: 5, card: true, onRace: again };
  lbPanel(lbEl, lbOpts);
  if (set && tt.ghost) lbAutoPost(tt.name, def, race.drift, () => lbPanel(lbEl, lbOpts));
  screenKeys('results', { enter: again, ' ': again, r: again, n: next, m: menu, escape: menu, ...(shareB ? { s: share } : {}) });
}
