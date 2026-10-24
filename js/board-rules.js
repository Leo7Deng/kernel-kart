// Kernel Kart: what a time trial best on a board has to look like, for the online room's board (net-board.js) and the
// game server's leaderboard (server/board.mjs, js/leaderboard.js) alike. Nothing else in here (the server loads it).
export const BOARD_D_MAX = 16000;   // a ghost's payload at most (a 2-minute lap is about 3000 characters)
export const BOARD_NAME_MAX = 16;   // a name (the name box takes 12; a ghost link's name 16)
// a ghost's payload (ghost-share.js encodeGhostPayload): '' for none, else 'z' or 'r' and base64url
export const okGhostD = d => typeof d === 'string' && d.length <= BOARD_D_MAX && (d === '' || /^[zr][A-Za-z0-9_-]+$/.test(d));
export const okTime = t => typeof t === 'number' && Number.isFinite(t) && t > 0 && t < 3600;
export const okCh = ch => typeof ch === 'string' && ch.length > 0 && ch.length <= 24 && /^[A-Za-z0-9_-]+$/.test(ch);
// one best: { t, ch, d }
export const okRow = r => !!r && okTime(r.t) && okCh(r.ch) && okGhostD(r.d);
// a record key (timetrial.js ttKey: the track's name, its layout, drift, …): printable, short. The server knows no tracks
// (so a new key the game starts using needs no server change): it checks the ghost is on that track instead
export const okKey = k => typeof k === 'string' && k.length > 0 && k.length <= 80 && !/[\u0000-\u001f\u007f<>"\\]/.test(k);
// a player's name as kept: trimmed, no control characters, BOARD_NAME_MAX at most ('' when there's nothing left)
export const cleanName = n => typeof n === 'string' ? n.replace(/[\u0000-\u001f\u007f<>"\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, BOARD_NAME_MAX) : '';
