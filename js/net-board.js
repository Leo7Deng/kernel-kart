// The room's time trial board: everyone's best lap on the room's track (with its drift setting, timetrial.js ttKey) with
// its ghost as a link payload (ghost-share.js), so anyone can keep a friend's ghost. DOM-free.
// Players send { k: 'ttBest', key, t, ch, d } on joining and on a track or drift change; the host keeps them
// (net.s.board[key][id]) and sends { k: 'board', key, rows } on a change and to joiners. Never in race snapshots (a ghost
// is a few KB).
import { TRACKS } from './tracks.js';
import { ttKey, ttName } from './timetrial.js';
import { BOARD_D_MAX, okRow } from './board-rules.js';   // (the checks the game server's leaderboard makes too)

export { BOARD_D_MAX };
// the record key the room's board is for: its single track with its drift, or null (a cup, or Random: no one track)
export function roomKey(cfg) {
  if (!cfg || cfg.mode === 'cup' || cfg.random) return null;
  const def = TRACKS[cfg.track]; return def ? ttKey(ttName(def), !!cfg.drift) : null;
}

// the host: player p's best d for the room's track. { ok } if it changed the board (then send boardMsg to everyone)
export function boardRequest(room, p, d) {
  const key = roomKey(room.cfg);
  if (!key || !d || d.key !== key || !okRow(d)) return { ok: false };
  const b = room.board || (room.board = {}), rows = b[key] || (b[key] = {}), old = rows[p.id];
  if (old && old.t === d.t && old.ch === d.ch && old.d === d.d) return { ok: false };
  rows[p.id] = { t: +d.t, ch: d.ch, d: d.d };
  return { ok: true, key };
}
// the board for key as it goes out: only the players still in the room
export function boardMsg(room, key) {
  const rows = (room.board && room.board[key]) || {};
  return { k: 'board', key, rows: Object.entries(rows).filter(([id]) => room.players.some(p => p.id === +id)).map(([id, r]) => ({ id: +id, t: r.t, ch: r.ch, d: r.d })) };
}
// a player: a board from the host, checked (null if it's nonsense)
export function boardFrom(m) {
  if (!m || typeof m.key !== 'string' || !Array.isArray(m.rows)) return null;
  return { key: m.key, rows: m.rows.filter(r => r && Number.isInteger(r.id) && okRow(r)).slice(0, 8) };
}
// the rows to show for the room as it is now, fastest first, each with its player ({ id, t, ch, d, p })
export function boardRows(room, board) {
  const key = roomKey(room.cfg); if (!key || !board || board.key !== key) return [];
  return board.rows.map(r => ({ ...r, p: room.players.find(p => p.id === r.id) })).filter(r => r.p).sort((a, b) => a.t - b.t);
}
