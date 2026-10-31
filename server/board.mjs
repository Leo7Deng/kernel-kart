// Kernel Kart: the leaderboard. The top BOARD_TOP time trial times per record key (timetrial.js ttKey), one per name,
// each with its ghost (ghost-share.js payload). Kept in KK_BOARD_FILE (else .kk-board.json in the repo), written on
// every change. Used by vite.config.js and server/net.mjs; the page's side is js/leaderboard.js.
//
// HTTP, JSON, on /kk-board (any origin may ask: a copy of the game served elsewhere can use this server):
//   GET  /kk-board                       { ok: true, v }: is there a leaderboard here
//   GET  /kk-board?key=K                 { key, rows: [{ name, ch, t, at }] }, fastest first (no ghosts: they're big)
//   GET  /kk-board?key=K&ghost=NAME      { key, name, ch, t, d }: that entry's ghost
//   POST /kk-board  { key, name, ch, t, d }   a best: { ok, rank (0: not in the top), n, kept (it went on), rows }
// Errors are { error } with 400 (nonsense), 404, 413 (too big) or 429 (too many too fast).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanName, okCh, okGhostD, okKey, okTime } from '../js/board-rules.js';
import { decodeGhostPayload } from '../js/ghost-share.js';
import { ttName } from '../js/timetrial.js';

export const BOARD_PATH = '/kk-board';
export const BOARD_TOP = 20;          // entries kept per key
const MAX_KEYS = 2000;                // keys kept at all (a track × layout × drift × …: a few hundred at most)
const MAX_BODY = 20000;               // a POST's body, bytes
export const DEFAULT_FILE = process.env.KK_BOARD_FILE || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.kk-board.json');

// a little rate limit per address: so many of a kind per window
function limiter(n, ms) {
  const hits = new Map();
  return {
    ok(ip, now) {
      let h = hits.get(ip); if (!h || now - h.t0 > ms) { h = { t0: now, n: 0 }; hits.set(ip, h); }
      if (hits.size > 5000) for (const [k, v] of hits) if (now - v.t0 > ms) hits.delete(k);
      return ++h.n <= n;
    },
  };
}

// file: where it's kept (null: memory only, for tests). now: the clock (tests)
export function createBoard({ file = DEFAULT_FILE, log = () => { }, now = () => Date.now() } = {}) {
  let boards = Object.create(null);
  const posts = limiter(10, 60_000), reads = limiter(240, 60_000);

  // ----- the file
  function load() {
    boards = Object.create(null);
    if (!file) return;
    let o; try { o = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') log(`leaderboard: couldn't read ${file} (${e.message}): starting empty`); return; }
    const b = o && o.boards; if (!b || typeof b !== 'object') return;
    let n = 0;
    for (const [key, rows] of Object.entries(b)) {
      if (!okKey(key) || !Array.isArray(rows)) continue;
      const ok = rows.filter(r => r && cleanName(r.name) && okTime(r.t) && okCh(r.ch) && okGhostD(r.d)).map(r => ({ name: cleanName(r.name), ch: r.ch, t: r.t, d: r.d, at: +r.at || 0 }));
      if (ok.length) { boards[key] = sortRows(ok).slice(0, BOARD_TOP); n++; }
    }
    if (n) log(`leaderboard: ${n} track${n === 1 ? '' : 's'} from ${file}`);
  }
  function flush() {
    if (!file) return;
    try { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ v: 1, boards })); fs.renameSync(tmp, file); } catch (e) { log(`leaderboard: couldn't save ${file} (${e.message})`); }
  }

  // ----- the boards
  const sortRows = rows => rows.sort((a, b) => a.t - b.t || a.at - b.at);
  const pub = rows => rows.map(({ name, ch, t, at }) => ({ name, ch, t, at }));
  const find = (rows, name) => rows.findIndex(r => r.name.toLowerCase() === name.toLowerCase());
  function get(key) { return okKey(key) ? { key, rows: pub(boards[key] || []) } : { error: 'bad key' }; }
  function ghost(key, name) {
    const rows = okKey(key) && boards[key], i = rows ? find(rows, cleanName(name)) : -1;
    if (i < 0) return { error: 'no such entry', status: 404 };
    const r = rows[i]; return r.d ? { key, name: r.name, ch: r.ch, t: r.t, d: r.d } : { error: 'no ghost', status: 404 };
  }
  // a best: checked, its ghost opened (it has to be on that key's track, with that time and racer), then on the board if
  // it's the name's best and fast enough
  async function post(m) {
    if (!m || typeof m !== 'object') return { error: 'bad request' };
    const key = m.key, name = cleanName(m.name), t = m.t, ch = m.ch, d = m.d;
    if (!okKey(key)) return { error: 'bad key' };
    if (!name) return { error: 'a name, please' };
    if (!okTime(t) || !okCh(ch)) return { error: 'bad time' };
    if (!okGhostD(d) || !d) return { error: d && d.length > 16000 ? 'ghost too big' : 'bad ghost', status: d && d.length > 16000 ? 413 : 400 };
    let meta; try { ({ meta } = await decodeGhostPayload(d)); } catch { return { error: 'bad ghost' }; }
    const base = ttName({ name: meta.track, rev: meta.rev });
    if (!(key === base || key.startsWith(base + ' · '))) return { error: 'that ghost is on another track' };
    // (and set the way the key says: with drift or not, without obstacles or with them, timetrial.js ttKey)
    if (/ · drift( · |$)/.test(key) !== meta.drift || / · clear$/.test(key) !== meta.clear) return { error: 'that ghost is from another kind of time trial' };
    if (Math.abs(meta.t - t) > 0.011 || meta.ch !== ch) return { error: 'that ghost isn\'t this time' };
    if (!boards[key] && Object.keys(boards).length >= MAX_KEYS) return { error: 'the leaderboard is full', status: 507 };
    const rows = boards[key] || [], i = find(rows, name), at = now();
    let kept = false;
    if (i < 0 || t < rows[i].t) {
      if (i >= 0) rows.splice(i, 1);
      rows.push({ name, ch, t: Math.round(t * 1000) / 1000, d, at });
      sortRows(rows); rows.length = Math.min(rows.length, BOARD_TOP);
      kept = find(rows, name) >= 0;
      if (rows.length) boards[key] = rows;
      if (kept) { flush(); log(`leaderboard: ${name} ${t.toFixed(2)} on ${key}`); }
    }
    const j = find(rows, name);
    return { ok: true, key, rank: j + 1, n: rows.length, kept, rows: pub(rows) };
  }

  // ----- HTTP. Returns true if it was for the board (answered), false to leave it to the next handler
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Max-Age': '600' };
  const reply = (res, status, o) => { res.writeHead(status, { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
  const answer = (res, o) => reply(res, o.error ? o.status || 400 : 200, o.error ? { error: o.error } : o);
  function handle(req, res) {
    const u = new URL(req.originalUrl || req.url, 'http://x');
    if (u.pathname !== BOARD_PATH) return false;
    const ip = req.socket && req.socket.remoteAddress || '?', t = now();
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return true; }
    if (req.method === 'GET') {
      if (!reads.ok(ip, t)) { reply(res, 429, { error: 'slow down' }); return true; }
      const key = u.searchParams.get('key');
      if (key === null) reply(res, 200, { ok: true, v: 1 });
      else answer(res, u.searchParams.has('ghost') ? ghost(key, u.searchParams.get('ghost')) : get(key));
      return true;
    }
    if (req.method !== 'POST') { reply(res, 405, { error: 'GET or POST' }); return true; }
    if (!posts.ok(ip, t)) { reply(res, 429, { error: 'slow down' }); req.resume(); return true; }
    let body = '', big = false;
    req.setEncoding('utf8');
    req.on('data', c => { if (big) return; body += c; if (body.length > MAX_BODY) { big = true; reply(res, 413, { error: 'too big' }); } });
    req.on('end', async () => {
      if (big) return;
      let m; try { m = JSON.parse(body); } catch { reply(res, 400, { error: 'bad json' }); return; }
      try { answer(res, await post(m)); } catch (e) { reply(res, 500, { error: 'server error' }); log(`leaderboard: ${e.message}`); }
    });
    return true;
  }

  load();
  return { get, ghost, post, handle, load, flush, close: flush, get boards() { return boards; }, file };
}
