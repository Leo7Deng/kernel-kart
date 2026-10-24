// Kernel Kart: the leaderboard, the page's side. Everyone's best time trial time per track, kept on the game's own
// server (server/board.mjs, /kk-board): the one this page came from (npm run play, npm run server), or the one set with
// ?server=<address> (kept in kk-server; ?server= with nothing forgets it), which is how a copy of the game served
// elsewhere (the web version) can use one. With neither (the web version on its own) there's no leaderboard. The panel
// that shows it is leaderboard-ui.js.
import { cleanName } from './board-rules.js';

const SKEY = 'kk-server';
try {   // ?server=… on the page's address
  const q = new URLSearchParams(location.search);
  if (q.has('server')) { const v = q.get('server').trim(); if (v) localStorage.setItem(SKEY, v); else localStorage.removeItem(SKEY); }
} catch { }
// the server set by hand ('' for none)
export function lbServer() { try { return (localStorage.getItem(SKEY) || '').trim(); } catch { return ''; } }
// a static copy of the game (no server behind it): the web version, or a file
const staticPage = () => typeof location === 'undefined' || location.protocol === 'file:' || /\.github\.io$/i.test(location.hostname);
// the board's address, or null (nowhere to ask)
export function lbUrl() {
  const s = lbServer();
  if (s) { try { const u = new URL(/^https?:\/\//i.test(s) ? s : 'http://' + s); return u.origin + '/kk-board'; } catch { return null; } }
  return staticPage() ? null : location.origin + '/kk-board';
}
// where it is, in words (for "everyone on …")
export function lbWhere() { const u = lbUrl(); try { return u ? new URL(u).host : ''; } catch { return ''; } }

async function ask(path = '', opts = {}) {
  const url = lbUrl(); if (!url) throw new Error('no server');
  const ctl = typeof AbortController === 'function' ? new AbortController() : null, to = ctl && setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetch(url + path, { cache: 'no-store', ...opts, signal: ctl && ctl.signal });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) { const e = new Error(body && body.error || `the server said ${res.status}`); e.status = res.status; throw e; }
    return body;
  } finally { if (to) clearTimeout(to); }
}

// is there a leaderboard to use: 'ok', 'none' (nowhere to ask: the web version with no server set) or 'down' (there
// should be one, but it doesn't answer: an old server, or it's off). Asked once a page (again a while after a 'down')
let status = null, statusAt = 0;
export function lbStatus() {
  if (!lbUrl()) return Promise.resolve('none');
  if (status && !(status !== 'ok' && Date.now() - statusAt > 20000)) return status;
  statusAt = Date.now();
  return (status = ask().then(b => b.ok ? 'ok' : 'down', () => 'down'));
}

// a track's board: { key, rows: [{ name, ch, t, at }] } fastest first. Kept a little while (the box redraws often)
const cache = new Map();   // key -> { at, p }
export function lbGet(key, { fresh = false } = {}) {
  const c = cache.get(key); if (c && !fresh && Date.now() - c.at < 15000) return c.p;
  const p = ask('?key=' + encodeURIComponent(key));
  cache.set(key, { at: Date.now(), p }); p.catch(() => cache.delete(key));
  return p;
}
// one entry's ghost: { name, ch, t, d } (d: a ghost link's payload, ghost-share.js decodeGhostPayload)
export const lbGhost = (key, name) => ask('?key=' + encodeURIComponent(key) + '&ghost=' + encodeURIComponent(name));
// post a best: { key, name, ch, t, d } -> { rank (0: not in the top), n, kept, rows }. The board it sends back is kept
export async function lbPost(m) {
  const r = await ask('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...m, name: cleanName(m.name) }) });
  cache.set(m.key, { at: Date.now(), p: Promise.resolve({ key: m.key, rows: r.rows }) });
  return r;
}
// the rank of name on rows (1-based; 0 if not there)
export const lbRank = (rows, name) => { const n = cleanName(name).toLowerCase(); return n ? rows.findIndex(r => r.name.toLowerCase() === n) + 1 : 0; };
