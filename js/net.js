// @ts-check
// Online rooms and races over the LAN relay (server/relay.mjs, /kk-net). The host keeps the room and runs the race;
// players send only input and draw the host's snapshots (net-sync.js). Screens: net-ui.js.
//
// Messages between host and players (inside the relay's { t: 'send', d }):
//   host -> all: { k: 'lobby', players, cfg, racing }   the room as it is now (on every change); each player's ack: the
//                                                        last of their picks (q) the host has dealt with
//                { k: 'start', track, laps, aiLevel, drift, racers, rn }   a race begins: build it like this (drift: the host's Drift
//                                                        setting; rn: the race's number in the room, on its snapshots and inputs)
//   host -> one: { k: 'snap', q, rn, ..., ack }          the race, up to 20 times a second, each player their own (only what
//                                                        changed for them; q counts them; ack: how far it's got with their input)
//                { k: 'cup', cup, scored }               a cup's standings (ui.js cupWire): as a race starts, and once it's scored
//                { k: 'podium' }                         the cup is over: show the podium
//                { k: 'cool', sec, ms, q }               request q changed nothing: it came too soon ('chars' or 'maps' is
//                                                        free in ms), or there was nothing to do (ms 0)
//                { k: 'chatLog', log }                   the chat's last lines, to whoever just joined (net-chat.js)
//                { k: 'board', key, rows }               the time trial bests on the room's track (net-board.js): to everyone
//                                                        when one changes, and to whoever joins
//   host -> all: { k: 'chat', m: { id, name, slot, text } }   a line of chat, anyone's (the host's own too)
//                { k: 'fstart', ... } { k: 'fsnap', ... }   Fight mode (cfg.mode 'fight'): a fight begins, the fight (fight-net.js)
//   player -> host: { k: 'pick', ci, q }                 I'd like this racer (q: my picks' count, for the host's ack)
//                   { k: 'fpick', id, q }                my fighter in a fight room; { k: 'fdev', kb } my device can fight
//                                                        (a keyboard or a gamepad): sent as I get in and when a pad connects
//                   { k: 'fin', rn, n, x, y, b }         my fighter's held input (fight-net.js)
//                   { k: 'pickTrack', t }                the single race on track t, or -1 Random (anyone may pick it)
//                   { k: 'cupEdit', op, t, tracks, name }   the cup's tracks: op 'add' or 'drop' track t, 'clear', or
//                                                        'preset' (a ready-made cup's tracks and name)
//                   (these three: once every 2 s per player and section, net-room.js; shown at once on the
//                   player's screen, laid over the host's room until acked: playerAsk)
//                   { k: 'chat', text }                  a line for the room's chat (net-chat.js: the host checks it and sends it on)
//                   { k: 'ttBest', key, t, ch, d }       my best time trial lap on the room's track and its ghost (net-board.js),
//                                                        when I join and when the track changes: only if I haven't sent that one
//                   { k: 'hb', t, rtt }                  every few seconds out of a race (a dead connection gets noticed):
//                                                        t my clock (ms), rtt my last round trip (net-link.js)
//   host -> one:  { k: 'pong', t }                       that hb's t back at once: the player's round trip
//   host -> all:  { k: 'pings', p: [[id, ms]...] }       everyone's round trip (at most every PING_GAP): the room's chips
//   player -> host: { k: 'in', g, f, n, q, h, rn }      gas held (bit 1) and drift held (bit 2, race-drift.js), items fired so far, which gas change it is, the last
//                                                        snapshot that arrived (sent as each one does: the host's flow control), and the
//                                                        few gas changes before this one with how long each was held (h: [n, g, ms])
//   both ways:      { k: 'rtc', type, sdp, ip }          setting up the race's WebRTC DataChannel (net-rtc.js): the host's offer
//                                                        when a player joins, the player's answer (ip: where the relay saw the sender)
// Once a DataChannel is open it carries the host's snapshots and the player's inputs (also still sent over the WebSocket)
// and a { k: 'hb' } a second (quiet for DC_QUIET: back to the WebSocket). Everything else goes over the WebSocket.
import { CHARACTERS, setKeys } from './core.js';
import { Input } from './input.js';
import { Race } from './race.js';
import { TRACKS } from './tracks.js';
import { clientSync, hostSync } from './net-sync.js';
import { SECTION, SLACK, applyRequest, cleanName, roomRequest } from './net-room.js';
import { CHAT_GAP, CHAT_SLACK, addLine, chatLine, chatRequest, cleanChat } from './net-chat.js';
import { boardFrom, boardMsg, boardRequest, boardRows, roomKey } from './net-board.js';
import { loadRecord } from './timetrial.js';
import { encodeGhostPayload } from './ghost-share.js';
import { PING_GAP, raceLink } from './net-link.js';
import { plainIp, rtcLink, rtcSupported } from './net-rtc.js';
import { FightClient, FightHost, fightSeats } from './fight-net.js';

export const MAX_PLAYERS = 4;

// ---- the shapes other modules share (npm run typecheck; the room's settings: net-room.js RoomCfg)
/** A player in the room (Session.players): id (the relay's), name, pick (a CHARACTERS index), slot (their seat, the
 * host's 0), fighter and kb (Fight mode: their fighter, whether they can fight), inRace (in this race or fight), ack /
 * cool / firstPick (net-room.js), rtt / rttAt (their round trip, the host's view).
 * @typedef {{ id: number, name: string, pick: number, slot: number, fighter?: string, kb?: boolean, inRace?: boolean,
 *   ack?: number, rtt?: number, rttAt?: number, [k: string]: any }} RoomPlayer */
/** The online session (net.s): role, ws (the relay socket), code (the room's), me (our player id), slot (our seat),
 * players, cfg (the room's settings), racing, race (the Race on now), sync (its hostSync / clientSync), and the rest
 * of the connection's state (reconnecting, heartbeats, WebRTC links, the fight...): untyped.
 * @typedef {{ role: 'host' | 'player', ws: any, code: string | null, me: number, slot: number, lan: any[], name: string,
 *   players: RoomPlayer[], chat: any[], cfg: import('./net-room.js').RoomCfg | null, racing: boolean,
 *   race: Race | null, sync: any, [k: string]: any }} Session */

/** @type {{ s: Session | null, onChange: (room?: boolean) => void, onRace: (race: Race) => void, onEnd: (why?: string) => void,
 *   onCup: (d: any) => void, onPodium: () => void, onCool: (sec: string, ms: number) => void, onChat: (m: any) => void,
 *   onPing: () => void, onReconnect: (trying: boolean) => void, onFight: (hook: any) => void }} */
export const net = {
  s: null,                 // the session (null when not online): { role, ws, code, me, lan, name, players, cfg, racing, race, sync }
  onChange: () => { },     // the room changed: redraw (net-ui.js)
  onRace: () => { },       // a race starts: put it on screen
  onEnd: () => { },        // the room is gone (left, the host left, connection lost), with why
  onCup: () => { },        // a player got the cup standings from the host
  onPodium: () => { },     // a player: the host ended the cup on its podium
  onCool: () => { },       // a request was too soon (sec, ms left): show the wait
  onChat: () => { },       // a line of chat came in (m), or the whole log did (null): chat-ui.js
  onPing: () => { },       // the room's round trips changed (pingOf): the room's chips
  onReconnect: () => { },  // a player's connection dropped and it's trying the room again (true), or it's back in (false)
  onFight: () => { },      // a fight starts (Fight mode): put it on screen (fight-ui.js startFight(null, { net: hook }))
};
// can this device fight? Every one can (touch: fight-touch.js)
export const canFight = () => true;
function sendDev(s) { const kb = canFight(); if (s.role === 'host') { const me = s.players[0]; if (me.kb !== kb) { me.kb = kb; if (!s.racing) roomChanged(); } } else send({ t: 'send', d: { k: 'fdev', kb } }); }
if (typeof addEventListener !== 'undefined') addEventListener('gamepadconnected', () => { if (net.s && net.s.me >= 0) sendDev(net.s); });
// skip a snapshot while the host's own upload to the relay is backed up (false: the next carries it); the real flow
// control is per player, in hostSync
const SNAP_BACKLOG = 48 * 1024;
const send = m => { const s = net.s; if (!s || s.ws.readyState !== 1) return false; if (m.d && (m.d.k === 'snap' || m.d.k === 'fsnap') && s.ws.bufferedAmount > SNAP_BACKLOG) return false; s.ws.send(JSON.stringify(m)); return true; };
const toAll = d => send({ t: 'send', d });

// wait: give up on a connection that hasn't opened in that many ms (a reconnect's try on a half-up network)
function open(onMsg, wait = 0) {
  return new Promise((res, rej) => {
    let ws, opened = false;
    try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/kk-net'); } catch (e) { rej(e); return; }
    if (wait) setTimeout(() => { if (!opened) { try { ws.close(); } catch { } rej(new Error('no answer')); } }, wait);
    ws.onopen = () => { opened = true; res(ws); };
    ws.onerror = () => { if (!opened) rej(new Error('no relay')); };
    ws.onclose = () => { if (opened && net.s && net.s.ws === ws) lost(); };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } if (net.s && net.s.ws === ws) onMsg(m); };
  });
}
// the relay connection closed: a player in a room retries the same room for RECON_MS (reconnect); a host's room is gone
// with it (the relay closes it), as is a join that hadn't got in
const LOST = 'Lost the connection to the room.';
function lost() {
  const s = net.s, j = s.joining;
  if (s.role === 'player' && s.code && (s.recon || !j)) return reconnect(s);
  s.joining = null; end(LOST, !!j); if (j) j.rej(new Error(LOST));
}
// Reconnecting: every RECON_GAP rejoin s.code as s.name with the relay's key (it gives back our old id and drops the
// old connection, so we're never in twice). The host has had us leave meanwhile (a bot finished our race), so we ask
// for our racer again and wait for the next race; in a fight we had a seat in, the host reseats us at once. A full
// room is retried; no room ends it
const RECON_MS = 20000, RECON_GAP = 1500, RECON_WAIT = 4000, HEARTBEAT = 4000;
function reconnect(s) {
  if (!s.recon) {
    const me = s.players.find(p => p.id === s.me);
    s.recon = { until: performance.now() + RECON_MS, pick: me ? me.pick : null, raced: !!s.race, fought: !!(s.fight && s.fight.me >= 0), back: s.key ? { id: s.me, key: s.key } : null };
    try { s.ws.close(); } catch { }   // (if it's somehow still up, the relay drops our old seat now rather than at its ping)
    clearInterval(s.beat); s.race = null; s.sync = null; s.pump = null; s.joining = null; s.fight = null; closeRtc(s);
    for (let i = 0; i < 4; i++) { Input.pressed[i] = false; Input.fire[i] = false; Input.drift[i] = false; }
    net.onReconnect(true);
  }
  clearTimeout(s.reconT);
  if (performance.now() > s.recon.until) return end(LOST + ' It didn\'t come back in 20 seconds.');
  s.reconT = setTimeout(() => retry(s), RECON_GAP);
}
async function retry(s) {
  if (net.s !== s || !s.recon) return;
  let ws; try { ws = await open(m => playerMsg(m), RECON_WAIT); } catch { if (net.s === s) reconnect(s); return; }
  if (net.s !== s || !s.recon) { try { ws.close(); } catch { } return; }
  s.ws = ws; s.joining = { res: () => queueMicrotask(() => rejoined(s)), rej: () => { } };   // (after the lobby's handled: rejoined sees the room as it is)
  send({ t: 'join', code: s.code, name: s.name, ...(s.recon.back ? { back: s.recon.back } : {}) });
}
function rejoined(s) {
  if (net.s !== s || !s.recon) return;
  const r = s.recon; s.recon = null; clearTimeout(s.reconT);
  s.asks = []; s.wantPick = r.pick; askPick(s);
  net.onReconnect(false);
}
// back in after a reconnect: your racer again, once the room takes picks (not while a race is on: net-room.js)
function askPick(s) {
  if (s.wantPick == null || s.racing) return;
  const me = s.players.find(p => p.id === s.me), ci = s.wantPick; s.wantPick = null;
  if (me && me.pick !== ci) playerAsk({ k: 'pick', ci, first: true });
}
export const NO_RELAY = 'Online play needs the game\'s own server: start it with npm run dev (or npm run server) and open the address it prints.';

function end(why, silent = false) {   // silent: we never got into a room, so there's no screen to leave
  const s = net.s; if (!s) return;
  net.s = null;
  const j = s.joining; s.joining = null; if (j) j.rej(stale());   // (a join still waiting for the room: it's off)
  clearInterval(s.beat); clearInterval(s.hb); clearTimeout(s.reconT); closeRtc(s);
  try { s.ws.send(JSON.stringify({ t: 'leave' })); } catch { }
  try { s.ws.close(); } catch { }
  for (let i = 0; i < 4; i++) { Input.pressed[i] = false; Input.fire[i] = false; }
  if (!silent) net.onEnd(why);
}
// closing the tab (or going to another page) leaves the room straight away, not when the relay notices the silence
addEventListener('pagehide', () => { const s = net.s; if (s) try { s.ws.send(JSON.stringify({ t: 'leave' })); s.ws.close(); } catch { } });
export const leaveRoom = () => end(null);
// a newer open or join cancels an older one still connecting (closing its socket before it takes a seat): otherwise the
// older took a phantom seat that never left
let opening = 0;
const stale = () => Object.assign(new Error(''), { stale: true });   // (net-ui.js says nothing about it: the newer one carries on)
async function openFresh(onMsg) {
  const my = ++opening;
  if (net.s) end(null, !!net.s.joining);
  let ws; try { ws = await open(onMsg); } catch { if (my !== opening) throw stale(); throw new Error(NO_RELAY); }
  if (my !== opening) { try { ws.close(); } catch { } throw stale(); }
  if (net.s) end(null, !!net.s.joining);   // (one that got in meanwhile: can't happen now, but never two sessions at once)
  return ws;
}

// the address a friend on the same Wi-Fi opens: this page, but with the machine's LAN address if it was opened as localhost
export function shareUrl() {
  const s = net.s, u = new URL(location.href); u.hash = ''; u.search = '';
  if (/^(localhost|127\.|\[?::1\]?$)/.test(u.hostname) && s && s.lan && s.lan[0]) u.hostname = s.lan[0];
  return u.href + (s && s.code ? '#join=' + s.code : '');
}
// someone else in the room has this racer (you may pick it too; a joiner is just given a free one, if there is one)
export const taken = (ci, exceptId) => net.s.players.some(p => p.pick === ci && p.id !== exceptId);

// ---------------------------------------------------------------- the race's DataChannel (net-rtc.js)
const DC_QUIET = 3000;   // the host goes back to the WebSocket for a player whose channel has said nothing for this long (ms)
const DC_DOUBT = 400;    // in a race (inputs come several times a second) quiet this long: snapshots go both ways meanwhile
const RTC_TRIES = 4, RTC_AGAIN = 3000;   // a channel that fails is tried again RTC_AGAIN ms later, up to RTC_TRIES times in all
function closeRtc(s) {
  if (s.rtc) { for (const L of s.rtc.values()) L.close(); s.rtc.clear(); }
  if (s.link) { s.link.close(); s.link = null; }
  clearInterval(s.dcBeat);
}
// where the other side's mDNS candidates really are: where the relay saw it connect from, or, if that's localhost,
// the server's own addresses
const isV4 = a => /^\d{1,3}(\.\d{1,3}){3}$/.test(a || '');
function otherIps(s, m) {
  const ip = plainIp(m.ip); if (ip) return [ip];
  const out = (s.lan || []).slice(); if (s.role === 'player' && isV4(location.hostname) && !/^127\./.test(location.hostname)) out.unshift(location.hostname);
  return out;
}
// the host: a channel to player id (when they join, and again as a race starts if it isn't up)
function hostRtc(id) {
  const s = net.s; if (!s || !rtcSupported() || (s.rtc.get(id) && !s.rtc.get(id).L.failed)) return;
  const L = rtcLink('host', {
    signal: d => send({ t: 'send', to: id, d: { ...d, ip: plainIp(s.you) } }),
    ips: m => otherIps(s, m),
    onMessage: d => {
      const p = s.players.find(o => o.id === id); if (!p) return;
      if (d.k === 'in' && s.racing && s.sync && p.inRace) s.sync.setInput(p.slot, d);
      else if (d.k === 'fin' && s.racing && s.fight) { const i = s.fightSeats.indexOf(p.id); if (i >= 0) s.fight.input(i, d); }   // (a fight's input: fight-net.js)
    },
    onState: open => {
      if (open || s.rtc.get(id) !== L) return;
      s.rtc.delete(id);
      // it didn't come up (or went): try again in a moment, a few times (a busy machine, a Wi-Fi blip); the WebSocket carries on meanwhile
      const n = (s.rtcTries.get(id) || 0) + 1; s.rtcTries.set(id, n);
      if (n < RTC_TRIES) setTimeout(() => { if (net.s === s && s.players.some(p => p.id === id)) hostRtc(id); }, RTC_AGAIN);
    },
  });
  s.rtc.set(id, L);
}
// the host: is player id's channel up (and still saying something)?
function rtcUp(s, id) {
  const L = s.rtc && s.rtc.get(id); if (!L || !L.open) return null;
  if (performance.now() - L.L.at > DC_QUIET) { L.close(); return null; }
  return L;
}
// a player: the host's offer; answer it, and keep the channel alive with a word every second
function playerRtc(s, m) {
  if (!rtcSupported()) return;
  if (s.link) s.link.close();
  clearInterval(s.dcBeat);
  const L = s.link = rtcLink('player', {
    signal: d => send({ t: 'send', d: { ...d, ip: plainIp(s.you) } }),
    ips: o => otherIps(s, o),
    onMessage: d => {
      if (net.s !== s) return;
      if (d.k === 'snap' && s.sync) { s.sync.receive(d); if (s.pump) s.pump(); }
      else if (d.k === 'fsnap' && s.fight) s.fight.receive(d);   // (a fight's: fight-net.js)
    },
    onState: open => { if (!open && s.link === L) { s.link = null; clearInterval(s.dcBeat); } },
  });
  s.dcBeat = setInterval(() => { if (s.link === L && L.open) L.send({ k: 'hb' }); }, 1000);
  L.handle(m);
}
// the host: d to player id over their DataChannel when it's up, else the WebSocket; a channel quiet for DC_DOUBT gets it
// over both, so a dead one doesn't freeze things until it's given up on (the player drops the second copy)
function viaRtc(s, id, d) {
  const L = rtcUp(s, id), ws = () => send({ t: 'send', to: id, d });
  if (!L) return ws();
  if (performance.now() - L.L.at > DC_DOUBT) { L.send(d); return ws(); }
  return L.send(d);
}
// how this machine's race is going over the network (for a look in the console and the lab): 'webrtc' or 'websocket'
export function netLink(id) {
  const s = net.s; if (!s) return null;
  if (s.role === 'player') return s.link && s.link.open ? 'webrtc' : 'websocket';
  return rtcUp(s, id) ? 'webrtc' : 'websocket';
}

// ---------------------------------------------------------------- host
export async function hostRoom(name, pick, cfg) {
  const ws = await openFresh(m => hostMsg(m));
  net.s = { role: 'host', ws, code: null, me: 0, slot: 0, lan: [], name, players: [{ id: 0, name, pick, slot: 0, kb: canFight() }], chat: [], cfg: { ...cfg, trackBy: 0, cupBy: (cfg.cupTracks || []).map(() => 0) }, racing: false, race: null, sync: null, rtc: new Map(), rtcTries: new Map() };
  send({ t: 'host' });
}
const lobbyMsg = () => { const s = net.s; return { k: 'lobby', players: s.players.map(({ id, name, pick, slot, ack, fighter, kb }) => ({ id, name, pick, slot, ...(ack != null ? { ack } : {}), ...(fighter ? { fighter } : {}), ...(kb != null ? { kb } : {}) })), cfg: s.cfg, racing: s.racing }; };
const roomChanged = () => { toAll(lobbyMsg()); net.onChange(); shareBest(); };
// ---------------------------------------------------------------- the time trial board (net-board.js)
// my best on the room's track (with the room's drift) and its ghost, to the host once per track and time: on joining and
// on a track change, never during a race
async function shareBest() {
  const s = net.s; if (!s || s.racing || !s.cfg) return;
  const key = roomKey(s.cfg), rec = key && loadRecord(key); if (!rec) return;
  const sent = s.sentBest || (s.sentBest = {}), sig = rec.t + '|' + (rec.ghost ? 1 : 0); if (sent[key] === sig) return;
  sent[key] = sig;
  const def = TRACKS[s.cfg.track], g = rec.ghost;
  let d = ''; try { if (g) d = await encodeGhostPayload({ track: def.name, rev: def.rev || 0, drift: !!s.cfg.drift, clear: true, name: s.name, ch: g.ch, t: rec.t, cp: g.cp }, g.s); } catch { d = ''; }
  if (net.s !== s) return;
  const msg = { k: 'ttBest', key, t: rec.t, ch: rec.ch, d };
  if (s.role === 'host') hostBest(s.players[0], msg); else send({ t: 'send', d: msg });
}
// ---------------------------------------------------------------- the link's quality (net-link.js)
// a player's heartbeat: our clock, for the host to send straight back, and the round trip we measured last
function beat(s) { send({ t: 'send', d: { k: 'hb', t: Math.round(performance.now()), ...(s.rtt != null ? { rtt: Math.round(s.rtt) } : {}) } }); }
// the host: everyone's round trip to everyone, at most every PING_GAP (one that's stopped beating is left out: unknown)
const PING_STALE = HEARTBEAT * 3;
function sharePings() {
  const s = net.s; if (!s || s.pingT) return;
  const go = () => {
    s.pingT = 0; if (net.s !== s) return; s.pingAt = performance.now();
    toAll({ k: 'pings', p: s.players.filter(o => o.rtt != null && s.pingAt - o.rttAt < PING_STALE).map(o => [o.id, o.rtt]) }); net.onPing();
  };
  const wait = PING_GAP - (performance.now() - (s.pingAt || -1e9));
  if (wait <= 0) go(); else s.pingT = setTimeout(go, wait);
}
// a player's round trip to the host in ms (null: not known yet, or the host itself)
export function pingOf(id) {
  const s = net.s; if (!s) return null;
  if (s.role === 'host') { const p = s.players.find(o => o.id === id); return p && p.rtt != null && performance.now() - p.rttAt < PING_STALE ? p.rtt : null; }
  return s.pings && s.pings[id] != null ? s.pings[id] : null;
}
function hostBest(p, d) { const s = net.s, r = boardRequest(s, p, d); if (r.ok) { toAll(boardMsg(s, r.key)); net.onChange(); } }
// the board to show in the room: everyone's best on its track, fastest first ({ id, t, ch, d, p }), [] with no one track
export function roomBoard() { const s = net.s; if (!s || !s.cfg) return []; return boardRows(s, s.role === 'host' ? boardMsg(s, roomKey(s.cfg)) : s.board); }
function hostMsg(m) {
  const s = net.s;
  if (m.t === 'hello') { s.lan = m.lan || []; s.you = m.you; net.onChange(); }
  else if (m.t === 'room') { s.code = m.code; net.onChange(); shareBest(); }
  else if (m.t === 'peer') {
    let slot = 1; while (s.players.some(p => p.slot === slot)) slot++;
    let pick = 0; while (taken(pick) && pick < CHARACTERS.length - 1) pick++;
    const was = m.back && s.gone && s.gone.get(m.id);   // (someone coming back on their old id: their racer, fighter and seat as they were)
    if (was && !s.players.some(p => p.slot === was.slot)) slot = was.slot;
    /** @type {RoomPlayer} */
    const np = { id: m.id, name: cleanName(m.name) || 'Player ' + (slot + 1), pick: was ? was.pick : pick, slot, ...(was && was.fighter ? { fighter: was.fighter } : {}), ...(was && was.kb != null ? { kb: was.kb } : {}) };
    s.players.push(np);
    if (s.gone) s.gone.delete(m.id);
    // back mid-fight: the stand-in bot steps out and they get the fight's start (their screen catches up from the next snapshot)
    if (was && s.racing && s.fight && was.seat >= 0 && s.fightSeats[was.seat] === -1) {
      const i = was.seat; s.fightSeats[i] = m.id; s.fight.seat(i); np.inRace = true;
      send({ t: 'send', to: m.id, d: { ...s.fightStart, seats: [...s.fightSeats] } });
    }
    s.cfg.bots = Math.min(s.cfg.bots, MAX_PLAYERS - s.players.length);
    roomChanged();
    if (s.chat.length) send({ t: 'send', to: m.id, d: { k: 'chatLog', log: s.chat } });   // what's been said so far
    const key = roomKey(s.cfg); if (key && s.board && s.board[key]) send({ t: 'send', to: m.id, d: boardMsg(s, key) });   // the time trial bests
    hostRtc(m.id);   // the race's own channel to them
  } else if (m.t === 'left') {
    const L = s.rtc.get(m.id); if (L) { L.close(); s.rtc.delete(m.id); }
    const p = s.players.find(o => o.id === m.id); if (!p) return;
    s.players = s.players.filter(o => o !== p);
    (s.gone ||= new Map()).set(p.id, { pick: p.pick, fighter: p.fighter, kb: p.kb, slot: p.slot, seat: s.racing && s.fight ? s.fightSeats.indexOf(p.id) : -1 });   // (if they come back: relay 'peer' back)
    if (s.racing && s.sync && p.inRace) s.sync.toBot(p.slot);   // a bot drives their kart home
    if (s.racing && s.fight) { const i = s.fightSeats.indexOf(p.id); if (i >= 0) { s.fight.toBot(i, [0, 1, 2].includes(s.cfg.fightBot) ? s.cfg.fightBot : 1); s.fightSeats[i] = -1; } }   // a bot fights on for them
    roomChanged();
  } else if (m.t === 'msg') {
    const p = s.players.find(o => o.id === m.from), d = m.d; if (!p || !d) return;
    if (SECTION[d.k]) {   // a racer, the track or the cup: at most once every 2 s each (net-room.js); acked either way (playerAsk)
      const r = roomRequest(s, p, d, performance.now(), SLACK); if (Number.isInteger(d.q)) p.ack = d.q;
      if (r.ok) roomChanged(); else send({ t: 'send', to: p.id, d: { k: 'cool', sec: SECTION[d.k], ms: Math.ceil(r.wait || 0), ...(p.ack != null ? { q: p.ack } : {}) } });
    } else if (d.k === 'chat') hostSay(p, d.text, CHAT_SLACK);
    else if (d.k === 'ttBest') hostBest(p, d);
    else if (d.k === 'hb') {   // a heartbeat: its time straight back (their round trip), and the one they measured last
      if (typeof d.t === 'number') send({ t: 'send', to: p.id, d: { k: 'pong', t: d.t } });
      if (typeof d.rtt === 'number' && d.rtt >= 0 && d.rtt < 60000) { p.rtt = Math.round(d.rtt); p.rttAt = performance.now(); sharePings(); }
    }
    else if (d.k === 'in' && s.racing && s.sync && p.inRace) s.sync.setInput(p.slot, d);
    else if (d.k === 'fin' && s.racing && s.fight) { const i = s.fightSeats.indexOf(p.id); if (i >= 0) s.fight.input(i, d); }
    else if (d.k === 'rtc') { const L = s.rtc.get(p.id); if (L) L.handle(d); }
  }
}
// a line of chat from p (the host's own: no slack): checked (net-chat.js), then to everyone, here too
function hostSay(p, text, slack = 0) {
  const r = chatRequest(net.s, p, text, performance.now(), slack);
  if (r.m) { toAll({ k: 'chat', m: r.m }); net.onChat(r.m); }
  return r;
}
// say something in the room's chat: { ok } if it went, { wait } (ms) if it's too soon after your last line. A player's line
// shows when the host sends it back to everyone, so everyone sees the lines in the same order
export function sayChat(text) {
  const s = net.s; if (!s) return {};
  if (s.role === 'host') { const r = hostSay(s.players[0], text); return r.m ? { ok: true } : r; }
  const t = cleanChat(text), now = performance.now(); if (!t) return {};
  if (s.chatAt != null && now - s.chatAt < CHAT_GAP) return { wait: CHAT_GAP - (now - s.chatAt) };
  s.chatAt = now; send({ t: 'send', d: { k: 'chat', text: t } }); return { ok: true };
}
// the host's own racer, track or cup change: by the same rules as everyone's but no wait (returns roomRequest's answer)
export function hostAct(d) { const s = net.s, r = roomRequest(s, s.players[0], d, performance.now()); if (r.ok) roomChanged(); return r; }
export function hostSet(patch) { const s = net.s; Object.assign(s.cfg, patch); s.cfg.bots = Math.min(s.cfg.bots, MAX_PLAYERS - s.players.length); roomChanged(); }
// the room's racers: everyone in it (pid: their player id; two may have the same racer) and bots from the racers nobody
// picked (one twice only if there aren't enough), on a shuffled grid. key: each one's seat, for the cup (ui.js rk)
export function roomRacers() {
  const s = net.s, people = [...s.players].sort((a, b) => a.slot - b.slot), nb = Math.min(s.cfg.bots, MAX_PLAYERS - people.length);
  /** @type {import('./race.js').Racer[]} */
  const racers = people.map(p => ({ ch: CHARACTERS[p.pick], human: true, pIndex: p.slot, name: p.name, pid: p.id, key: 'p' + p.id }));
  const free = CHARACTERS.map((_, ci) => ci).filter(ci => !people.some(p => p.pick === ci)).sort(() => Math.random() - 0.5);
  while (free.length < nb) free.push(...CHARACTERS.map((_, ci) => ci));
  free.slice(0, nb).forEach((ci, n) => racers.push({ ch: CHARACTERS[ci], human: false, pIndex: -1, name: '', key: 'b' + n }));
  for (let i = racers.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [racers[i], racers[j]] = [racers[j], racers[i]]; }
  return racers;
}
// a race on the room's track with the room's racers, or (a cup's next race) on o.track with o.racers in that grid order
export function hostStart(o = {}) {
  if (net.s.cfg.mode === 'fight') return hostFight();
  const s = net.s, cfg = s.cfg, racers = o.racers || roomRacers();
  if (o.track == null && cfg.random) { let t; do { t = Math.floor(Math.random() * TRACKS.length); } while (TRACKS.length > 1 && t === cfg.track); cfg.track = t; }   // Random: a different track from the last (UI only, as ui.js startRace)
  const track = o.track ?? cfg.track, laps = TRACKS[track].laps || cfg.laps;   // (a track with its own laps: Moonshot, one lap)
  const race = new Race(track, { racers, laps, aiLevel: cfg.aiLevel, drift: !!cfg.drift });   // (drift: the host's call for the whole room, race-drift.js)
  race.packMode = racers.filter(r => r.human).length >= 3;   // as offline: 3+ players get the stronger catch-up
  race.cars.forEach((c, i) => { c.netName = racers[i].name; c.key = racers[i].key; });
  for (const p of s.players) p.inRace = racers.some(r => r.human && r.pIndex === p.slot);
  s.racing = true; s.race = race; s.rn = (s.rn || 0) + 1;   // (rn: the last race's inputs still on their way are ignored, net-sync.js)
  toAll({ k: 'start', track, laps, aiLevel: cfg.aiLevel, drift: !!cfg.drift, rn: s.rn, racers: racers.map(r => ({ ci: CHARACTERS.indexOf(r.ch), human: r.human, pIndex: r.pIndex, name: r.name, key: r.key })) });
  toAll(lobbyMsg());   // anyone who joins now sees there's a race on
  // each player's snapshots go to them alone, over their DataChannel when it's up (a lost one doesn't hold up the rest), else the WebSocket
  const inRace = slot => s.players.find(o => o.slot === slot && o.inRace);
  const toPlayer = (d, slot) => { const p = inRace(slot); return p ? viaRtc(s, p.id, d) : false; };
  for (const p of s.players) if (p.id !== s.me && p.inRace) hostRtc(p.id);   // (one that didn't come up when they joined: try again)
  s.sync = hostSync(race, { rid: s.rn, local: race.cars.filter(c => c.human && c.pIndex === 0), send: toPlayer, lossy: slot => { const p = inRace(slot); return !!(p && rtcUp(s, p.id)); } });
  race.net = { role: 'host', quit: hostToRoom };
  Input.humans = 1; setKeys(1); Input.reset();
  net.onRace(race);
}
// Fight mode (fight-net.js): the first two players who can fight (a lone one against a bot); the rest watch. The host
// runs it; snapshots go over each one's DataChannel where up, the rest in one WebSocket broadcast
export function hostFight() {
  const s = net.s, seat = fightSeats(s.players, s.cfg);
  const cfg = { ids: seat.ids, bots: seat.bots, supers: seat.supers, arena: seat.arena, seed: (Math.random() * 2 ** 31) | 0, bestOf: seat.bestOf, roundTime: seat.roundTime };   // (the room's match length: fight-net.js fightSeats)
  s.racing = true; s.race = null; s.sync = null; s.rn = (s.rn || 0) + 1; s.fightSeats = [...seat.seats];
  for (const p of s.players) p.inRace = seat.seats.includes(p.id);
  const me = seat.seats.indexOf(s.me);
  for (const p of s.players) if (p.id !== s.me) hostRtc(p.id);   // (one that didn't come up when they joined: try again)
  const fsend = d => {
    const peers = s.players.filter(p => p.id !== s.me), up = peers.filter(p => rtcUp(s, p.id));
    if (!up.length) return toAll(d);
    for (const p of peers) viaRtc(s, p.id, d);
  };
  s.fight = new FightHost(cfg, { rn: s.rn, me, send: fsend });
  s.fightStart = { k: 'fstart', rn: s.rn, cfg: JSON.parse(JSON.stringify(cfg)), seats: seat.seats, names: seat.names };
  toAll(s.fightStart);
  toAll(lobbyMsg());
  const h = s.fight;
  net.onFight({ role: 'host', me, F: h.F, names: seat.names, frame: (dt, inp) => { if (net.s === s && s.fight === h) h.frame(dt, inp); }, rematch: () => hostFight(), back: hostToRoom, quit: leaveRoom });
}
export const hostCup = (cup, scored) => toAll({ k: 'cup', cup, scored });
export const hostPodium = () => toAll({ k: 'podium' });
// the race is over (or the host pressed Esc): everyone back to the room
export function hostToRoom() {
  const s = net.s; if (!s) return;
  s.racing = false; s.race = null; s.sync = null; s.fight = null; for (const p of s.players) p.inRace = false;
  for (let i = 1; i < 4; i++) { Input.pressed[i] = false; Input.fire[i] = false; }
  roomChanged();
}

// ---------------------------------------------------------------- player
export async function joinRoom(code, name) {
  const ws = await openFresh(m => playerMsg(m));
  /** @type {Session} */
  const s = net.s = { role: 'player', ws, code: null, me: -1, slot: -1, lan: [], name, players: [], chat: [], cfg: null, racing: false, race: null, sync: null };
  // a heartbeat every few seconds out of a race, so a dead connection closes (and reconnects) instead of idling
  s.hb = setInterval(() => { if (net.s !== s) clearInterval(s.hb); else if (!s.recon && !s.race && !s.joining) beat(s); }, HEARTBEAT);
  return new Promise((res, rej) => {
    s.joining = { res, rej };
    send({ t: 'join', code, name });
  });
}
function playerMsg(m) {
  const s = net.s;
  if (m.t === 'hello') { s.lan = m.lan || []; s.you = m.you; }
  else if (m.t === 'joined') { s.me = m.id; s.code = m.code; s.key = m.key; }
  else if (m.t === 'error' && s.recon) { s.joining = null; if (/full/i.test(m.msg)) { try { s.ws.close(); } catch { } } else end('The room is gone: the host closed it or lost their connection.'); }   // (full: its close tries again)
  else if (m.t === 'error') { const j = s.joining; s.joining = null; end(null, !!j); if (j) j.rej(new Error(m.msg)); }
  else if (m.t === 'closed') end('The host closed the room.');
  else if (m.t === 'msg') {
    const d = m.d; if (!d) return;
    if (d.k === 'snap') { if (s.sync) { s.sync.receive(d); if (s.pump) s.pump(); } return; }   // (pump: acknowledge it now)
    if (d.k === 'fsnap') { if (s.fight) s.fight.receive(d); return; }
    if (d.k === 'fstart') return playerFight(d);
    if (d.k === 'lobby') {
      s.base = { players: d.players, cfg: d.cfg }; s.racing = d.racing;
      const same = roomView(s) && !s.joining && !(!d.racing && s.race);   // (only our own picks the host has now: drawn already)
      if (s.joining) { s.joining.res(); s.joining = null; beat(s); sendDev(s); }   // (a first round trip now, not a heartbeat later; whether we can fight)
      if (!d.racing && s.race) { s.race = null; s.sync = null; }
      if (!d.racing && s.fight) s.fight = null;
      askPick(s); if (!same) net.onChange(); shareBest();
    } else if (d.k === 'start') playerStart(d);
    else if (d.k === 'cup') net.onCup(d);
    else if (d.k === 'podium') net.onPodium();
    else if (d.k === 'board') { const b = boardFrom(d); if (b) { s.board = b; net.onChange(); } }
    else if (d.k === 'cool') {   // a pick that changed nothing: off our screen, and the wait (if that was why)
      if (Number.isInteger(d.q) && s.asks) s.asks = s.asks.filter(a => a.q > d.q);
      if (s.base && !roomView(s)) net.onChange();
      net.onCool(d.sec, d.ms);
    }
    else if (d.k === 'pong' && typeof d.t === 'number') {   // our round trip (net-link.js), eased a little
      const r = performance.now() - d.t; if (!(r >= 0 && r < 60000)) return;
      s.rtt = s.rtt == null ? r : s.rtt * 0.6 + r * 0.4; (s.pings ||= {})[s.me] = Math.round(s.rtt); net.onPing();
    } else if (d.k === 'pings' && Array.isArray(d.p)) {
      s.pings = {}; for (const e of d.p) if (Array.isArray(e) && Number.isInteger(e[0]) && e[1] >= 0 && e[1] < 60000) s.pings[e[0]] = Math.round(e[1]);
      if (s.rtt != null) s.pings[s.me] = Math.round(s.rtt);   // (our own: fresher here)
      net.onPing();
    }
    else if (d.k === 'rtc' && d.type === 'offer') playerRtc(s, d);
    else if (d.k === 'chat') { const c = chatLine(d.m); if (c) { addLine(s, c); net.onChat(c); } }
    else if (d.k === 'chatLog' && Array.isArray(d.log)) { s.chat = []; for (const c of d.log.map(chatLine)) if (c) addLine(s, c); net.onChat(null); }
  }
}
// a pick, the track or a cup edit (net-room.js): the host decides, but it shows here at once, numbered (q) and laid over
// the host's room (s.base) until its lobby acks it (or a 'cool' says no change), so others' lobbies don't flick it
// back; ASK_TTL lets an unanswered one go
const ASK_TTL = 5000;
export function playerAsk(d) {
  const s = net.s; if (!s || s.role === 'host') return;
  const q = s.askQ = (s.askQ || 0) + 1;
  send({ t: 'send', d: { ...d, q } });
  (s.asks ||= []).push({ d, q, at: performance.now() });
  if (!roomView(s)) net.onChange();
  setTimeout(() => { if (net.s === s && s.asks && s.asks.some(a => a.q === q) && !roomView(s)) net.onChange(); }, ASK_TTL + 50);
}
// the room as this player sees it: the host's last lobby with our own picks it hasn't acked yet laid over it (s.players,
// s.cfg). true if that's what was there already (nothing to redraw)
function roomView(s) {
  if (!s.base) return true;
  const before = s.view, base = s.base, mine = base.players.find(p => p.id === s.me), ack = mine && mine.ack != null ? mine.ack : 0, now = performance.now();
  s.asks = (s.asks || []).filter(a => a.q > ack && now - a.at < ASK_TTL);
  const room = { players: base.players.map(p => ({ ...p })), cfg: JSON.parse(JSON.stringify(base.cfg)), racing: s.racing };
  const me = room.players.find(p => p.id === s.me);
  if (me) for (const a of s.asks) applyRequest(room, me, a.d);
  s.players = room.players; s.cfg = room.cfg; s.slot = me ? me.slot : -1;
  s.view = JSON.stringify([room.players.map(({ ack, ...p }) => p), room.cfg, s.racing]);   // (an ack alone changes nothing on screen)
  return s.view === before;
}
// a fight (Fight mode): ours to fight if we have a seat, else to watch
function playerFight(d) {
  const s = net.s; if (!d.cfg || !Array.isArray(d.seats)) return;
  // our input over the DataChannel too when it's up (whichever gets there first counts: the host drops the other)
  const me = d.seats.indexOf(s.me), c = s.fight = new FightClient(d.cfg, { rn: d.rn, me, send: m => { if (s.link && s.link.open) s.link.send(m); send({ t: 'send', d: m }); } });
  s.race = null; s.sync = null;
  net.onFight({ role: 'player', me, F: c.F, names: d.names || [], frame: (dt, inp) => { if (net.s === s && s.fight === c) c.frame(dt, inp); }, rematch: null, back: () => net.onChange(true), quit: leaveRoom });
}
function playerStart(d) {
  const s = net.s;
  const racers = d.racers.map(r => ({ ch: CHARACTERS[r.ci], human: r.human, pIndex: r.pIndex }));
  const race = new Race(d.track, { racers, laps: d.laps, aiLevel: d.aiLevel, drift: !!d.drift });
  race.cars.forEach((c, i) => { c.netName = d.racers[i].name; c.key = d.racers[i].key; });
  if (!race.cars.some(c => c.human && c.pIndex === s.slot)) return;   // joined after the grid was made: watch the room instead
  // our own kart is predicted from these (net-sync.js); the host gets the same input
  s.race = race; s.sync = clientSync(race, { rid: d.rn ?? null, me: s.slot, gas: () => (Input.pressed[0] ? 1 : 0) | (Input.drift[0] ? 2 : 0), fire: () => { const f = Input.fire[0]; Input.fire[0] = false; return f; } });
  // input goes back as soon as anything changes (a snapshot arriving, a key) and every 100 ms anyway, so a lost
  // key-up can't leave the gas stuck on
  let sent = '', at = 0;
  const keys = ['keydown', 'keyup', 'pointerdown', 'pointerup'], kick = () => pump();   // (after Input's own listeners: they're older)
  const pump = s.pump = () => {
    if (net.s !== s || s.race !== race) { for (const k of keys) removeEventListener(k, kick); return; }
    const m = s.sync.input(), key = m.g + ':' + m.f + ':' + m.n + ':' + m.q + ':' + (m.r || 0), now = performance.now();
    if (key !== sent || now - at > 100) { const d = { k: 'in', ...m }; if (s.link && s.link.open) s.link.send(d); send({ t: 'send', d }); sent = key; at = now; }   // (both ways: whichever gets there first counts, net-sync.js)   // (r: a snapshot was missed, send the next in full; h: the last few gas changes again: net-sync.js)
  };
  const view = race.update;
  for (const k of keys) addEventListener(k, kick);
  race.update = dt => { view.call(race, dt); pump(); };
  clearInterval(s.beat); s.beat = setInterval(() => { if (net.s === s && s.race === race) pump(); else clearInterval(s.beat); }, 100);   // keeps going in a background tab
  const judge = raceLink();   // (our link, judged from the snapshots: render.js's icon while it's poor)
  race.net = { role: 'player', quit: leaveRoom, link: () => judge(s.sync && s.sync.stats, performance.now() / 1000) };
  Input.humans = 1; setKeys(1); Input.reset();
  net.onRace(race);
}
