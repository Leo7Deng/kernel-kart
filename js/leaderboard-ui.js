// The leaderboard panel (data: leaderboard.js) on the time trial box and results: everyone's best on the track, Race on
// a row to keep that ghost as your rival, and your place or a button to post your best. New bests post by themselves
// (lbAutoPost).
import { CHARACTERS } from './core.js';
import { TRACKS } from './tracks.js';
import { fmtDelta, fmtLap, loadRecord } from './timetrial.js';
import { addRival, decodeGhostPayload, encodeGhostPayload, loadRivals, rivalId } from './ghost-share.js';
import { lbGet, lbGhost, lbPost, lbRank, lbServer, lbStatus, lbWhere } from './leaderboard.js';
import { askName, loadName } from './net-ui.js';
import { esc, portrait, toast } from './ui.js';

const charName = id => (CHARACTERS.find(c => c.id === id) || { name: '?' }).name;
const ASKED = 'kk-lb-asked';   // asked for a name once for the leaderboard (not again: Post my best is on the panel)

// your best on key, packed to go on the board: { key, name, ch, t, d }, or null (no best, or its ghost is gone)
async function bestMsg(key, def, drift, name) {
  const rec = loadRecord(key); if (!rec || !rec.ghost) return null;
  const g = rec.ghost, d = await encodeGhostPayload({ track: def.name, rev: def.rev || 0, drift, clear: / · clear$/.test(key), name, ch: g.ch, t: rec.t, cp: g.cp }, g.s);
  return { key, name, ch: g.ch, t: rec.t, d };
}
// post your best on key under name: the server's answer, or null
async function post(key, def, drift, name) {
  const m = await bestMsg(key, def, drift, name); if (!m) return null;
  return lbPost(m);
}
const withName = (go, title) => { const n = loadName(); if (n) return go(n); askName(go, { title, btn: 'Post it', note: 'Everyone on this game\'s server sees this name with your time.' }); };
const said = r => r.kept ? `You're #${r.rank} on the leaderboard` : r.rank ? `The leaderboard has your faster time: #${r.rank}` : `Not in the leaderboard's top ${r.n} yet`;

// a new best in a time trial (the results): onto the board, if there is one. No name yet: asked once (never again after
// that; Post my best on the panel does it then). done(answer) when it's in
export async function lbAutoPost(key, def, drift, done = () => { }) {
  if (await lbStatus() !== 'ok') return;
  const go = async name => { try { const r = await post(key, def, drift, name); if (r) { toast(said(r)); done(r); } } catch (e) { toast(`Leaderboard: ${e.message}`); } };
  if (loadName()) return go(loadName());
  try { if (localStorage.getItem(ASKED)) return; localStorage.setItem(ASKED, '1'); } catch { }
  askName(go, { title: 'Put your time on the leaderboard', btn: 'Post it', note: 'Everyone on this game\'s server sees this name with your time.' });
}

// the panel, into el (emptied first). key: the record key (timetrial.js ttKey), def the track, drift whether records are
// with it. onRace(row): after Race on a row kept its ghost as your rival (the box redraws; the results start the trial).
// max: rows shown (yours always shows, below them if it's further down). card: on a results card (its heading)
export async function lbPanel(el, { key, def, drift, onRace = () => { }, max = 20, card = false } = {}) {
  if (!el) return;
  const st = await lbStatus();
  if (!el.isConnected) return;
  if (st === 'none') { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const srv = lbServer(), where = lbWhere();
  const head = (sub = `everyone on ${srv ? esc(where) : 'this game\'s server'}, ${drift ? 'with drift' : 'no drift'}`) => card ? `<h2 class="r-h lb-h">Leaderboard<small>${sub}</small></h2>` : `<div class="lb-head"><span class="lbl">Leaderboard</span><small>${sub}</small></div>`;
  if (st !== 'ok') {
    const mixed = srv && location.protocol === 'https:' && !/^https:/i.test(srv);
    el.innerHTML = head('') + `<div class="help lb-none">${srv ? `Can't reach the leaderboard at <b>${esc(where)}</b>${mixed ? ' (this https page can\'t ask an http server: open the game from that server instead)' : ''}.` : 'Leaderboard needs the game\'s server (<b>npm run play</b>).'}</div>`;
    return;
  }
  if (!el.firstChild) el.innerHTML = head() + '<div class="help lb-none">Loading…</div>';
  let board;
  try { board = await lbGet(key); } catch (e) { if (el.isConnected) el.innerHTML = head() + `<div class="help lb-none">The leaderboard didn't answer (${esc(e.message)}).</div>`; return; }
  if (!el.isConnected) return;
  const rows = board.rows, me = loadName(), myRank = lbRank(rows, me), rec = loadRecord(key), top = rows.length ? rows[0].t : 0;
  const o = loadRivals(key), sel = o.list.find(e => e.id === o.sel);
  const show = rows.map((r, i) => ({ r, i })).filter(({ i }) => i < max || i === myRank - 1);
  const line = ({ r, i }) => {
    const mine = myRank === i + 1, racing = sel && sel.id === rivalId(r.name, r.t, r.ch);
    return `<li class="nb-row lb-row${i === 0 ? ' first' : ''}${mine ? ' me' : ''}${i >= max ? ' far' : ''}"><span class="pos">${i + 1}</span><span class="rv-port" data-ch="${esc(r.ch)}"></span>
      <span class="nb-who"><span class="nb-name"><b>${esc(r.name)}</b>${mine ? ' <span class="net-you">you</span>' : ''}</span><small>${esc(charName(r.ch))}</small></span>
      <span class="nb-t">${fmtLap(r.t)}</span><span class="nb-gap">${i ? fmtDelta(r.t - top) : ''}</span>
      ${mine ? '<span class="nb-act muted">your time</span>' : racing ? '<span class="nb-act saved">Racing ✓</span>' : `<button type="button" class="nb-act" data-race="${i}" title="Race ${esc(r.name)}'s ghost">Race</button>`}</li>`;
  };
  // your place: on the board (with your best already on it), or a button to post your best, or nothing to post yet
  const onIt = myRank && rec && rows[myRank - 1].t <= rec.t + 0.005;
  const foot = !rec ? `<span>Set a time and it goes on here.</span>`
    : !rec.ghost ? `<span>Your best's ghost is gone (storage was full): set a new best to go on.</span>`
    : onIt ? `<span>You're <b>#${myRank}</b> of ${rows.length}.</span>`
    : `<span>${myRank ? `The board has an older time of yours.` : me ? `Your best (${fmtLap(rec.t)}) isn't on it yet.` : `Your best is ${fmtLap(rec.t)}.`}</span><button type="button" class="lb-post">Post my best</button>`;
  el.innerHTML = head() + (rows.length ? `<ol class="nb-rows lb-rows" role="list">${show.map(line).join('')}</ol>` : `<div class="help lb-none">Nobody's on it yet: set a time and be first.</div>`) + `<div class="help lb-foot">${foot}</div>`;
  el.querySelectorAll('.rv-port').forEach(p => { const ch = CHARACTERS.find(c => c.id === p.dataset.ch); if (ch) p.appendChild(portrait(ch)); });
  el.querySelectorAll('[data-race]').forEach(b => b.onclick = async () => {
    const r = rows[+b.dataset.race]; if (!r) return;
    b.disabled = true; b.textContent = '…';
    try {
      const g = await lbGhost(key, r.name), { meta, s } = await decodeGhostPayload(g.d);
      const d = TRACKS.find(t => t.name === meta.track);
      if (!d || d !== def || (d.rev || 0) !== meta.rev) throw new Error('that ghost is on another layout');
      meta.name = r.name; meta.t = r.t;
      if (!addRival(key, meta, s, { via: 'board' })) throw new Error('no room left to keep it');
      toast(`Racing ${r.name}'s ghost`);
      onRace(r);
    } catch (e) { toast(`Couldn't get that ghost: ${e.message}`); b.disabled = false; b.textContent = 'Race'; }
  });
  const pb = el.querySelector('.lb-post');
  if (pb) pb.onclick = () => withName(async name => {
    pb.disabled = true;
    try { const r = await post(key, def, drift, name); if (r) toast(said(r)); } catch (e) { toast(`Leaderboard: ${e.message}`); }
    lbPanel(el, { key, def, drift, onRace, max, card });
  }, 'Post your time');
}
