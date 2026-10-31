// node test/board.test.mjs: the game server's leaderboard (server/board.mjs). Posting bests, ranks, one entry per name
// (only a faster time replaces it), the top 20, the checks (key, name, time, racer, the ghost: its size, that it opens,
// that it's on that track with that time), the file round trip, and the HTTP side (GET, POST, CORS, the rate limit).
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createBoard, BOARD_TOP } from '../server/board.mjs';
import { encodeGhostPayload } from '../js/ghost-share.js';
import { TRACKS } from '../js/tracks.js';
import { ttKey, ttName } from '../js/timetrial.js';

const fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); };
const def = TRACKS[0], key = ttKey(ttName(def), true), other = TRACKS[1];
// a made-up ghost: a smooth path, n samples
const samples = n => { const s = new Int16Array(n * 4); for (let k = 0; k < n; k++) { s[k * 4] = Math.round(500 + 300 * Math.cos(k / 40)); s[k * 4 + 1] = Math.round(500 + 300 * Math.sin(k / 40)); s[k * 4 + 2] = Math.round(((k / 40 + Math.PI / 2) % (2 * Math.PI) - Math.PI) * 10000); } return s; };
const ghost = (t, ch = 'gopher', d = def, name = 'X', o = {}) => encodeGhostPayload({ track: d.name, rev: d.rev || 0, drift: true, clear: true, name, ch, t, cp: [t / 4, t / 2, t * 0.75], ...o }, samples(Math.ceil(t * 20) + 1));
const best = async (name, t, ch = 'gopher') => ({ key, name, ch, t, d: await ghost(t, ch) });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-board-')), file = path.join(dir, 'board.json');
let clock = 1000;
const B = createBoard({ file, now: () => clock++ });

// posting and ranking
let r = await B.post(await best('Pia', 31.5));
check(r.ok && r.rank === 1 && r.n === 1 && r.kept, `first post: ${JSON.stringify(r)}`);
r = await B.post(await best('Leo', 30.2, 'tux'));
check(r.ok && r.rank === 1 && r.n === 2, `faster post: ${JSON.stringify(r)}`);
r = await B.post(await best('Sam', 33));
check(r.rank === 3, `slower post rank ${r.rank}`);
// one per name: a slower time from Pia changes nothing, a faster one replaces hers (any case of the name)
r = await B.post(await best('pia', 32));
check(r.ok && !r.kept && r.rank === 2 && B.get(key).rows.find(x => x.name === 'Pia').t === 31.5, `slower repeat: ${JSON.stringify(r)}`);
r = await B.post(await best('PIA', 29.9, 'ferris'));
const rows = B.get(key).rows;
check(r.kept && r.rank === 1 && rows.length === 3 && rows.filter(x => x.name.toLowerCase() === 'pia').length === 1 && rows[0].ch === 'ferris', `faster repeat: ${JSON.stringify(rows)}`);
check(rows.every((x, i) => !i || rows[i - 1].t <= x.t) && rows.every(x => !('d' in x)), 'rows sorted, without ghosts');
// its ghost comes back
const g = B.ghost(key, 'pia');
check(g.d && g.t === 29.9 && g.ch === 'ferris', `ghost: ${JSON.stringify(g).slice(0, 80)}`);
check(B.ghost(key, 'nobody').error && B.ghost('Nowhere', 'Pia').error, 'ghost of nobody');
// the top 20: the slowest drop off; a time too slow for it isn't kept and has no rank
for (let i = 0; i < BOARD_TOP; i++) await B.post(await best('R' + i, 40 + i));
check(B.get(key).rows.length === BOARD_TOP && B.get(key).rows.at(-1).t === 40 + BOARD_TOP - 4, `top ${BOARD_TOP}: ${B.get(key).rows.length}, last ${B.get(key).rows.at(-1).t}`);
r = await B.post(await best('Slow', 99));
check(r.ok && !r.kept && r.rank === 0, `too slow: ${JSON.stringify({ ...r, rows: 0 })}`);

// the checks
const bad = async (m, what) => { const o = await B.post(m); check(o.error, `${what} was taken: ${JSON.stringify(o).slice(0, 100)}`); };
const ok = await best('Zed', 35);
await bad(null, 'nothing');
await bad({ ...ok, key: '' }, 'empty key');
await bad({ ...ok, key: 'x'.repeat(81) }, 'long key');
await bad({ ...ok, key: 'a<b>' }, 'html key');
await bad({ ...ok, name: '   ' }, 'blank name');
await bad({ ...ok, t: NaN }, 'NaN time');
await bad({ ...ok, t: Infinity }, 'infinite time');
await bad({ ...ok, t: -3 }, 'negative time');
await bad({ ...ok, t: '35' }, 'string time');
await bad({ ...ok, ch: 'a b' }, 'bad racer');
await bad({ ...ok, d: '' }, 'no ghost');
await bad({ ...ok, d: 'z' + 'A'.repeat(16001) }, 'huge ghost');
await bad({ ...ok, d: 'zNotAGhost' }, 'junk ghost');
await bad({ ...ok, d: 'z<script>' }, 'html ghost');
await bad({ ...ok, t: 30 }, 'time not the ghost\'s');
await bad({ ...ok, ch: 'tux' }, 'racer not the ghost\'s');
await bad({ ...ok, d: await ghost(35, 'gopher', other) }, 'ghost on another track');
await bad({ ...ok, d: await ghost(35, 'gopher', def, 'X', { drift: false }) }, 'ghost without drift on a drift key');
await bad({ ...ok, d: await ghost(35, 'gopher', def, 'X', { clear: false }) }, 'ghost with obstacles on a clear key');
check(!B.get(key).rows.some(x => x.name === 'Zed'), 'a refused post went on');
r = await B.post({ ...ok, name: '  Zed\u0007 the\n  great one!!  ' });
check(r.ok && B.get(key).rows.some(x => x.name === 'Zed the great on'), `name cleaned: ${B.get(key).rows.map(x => x.name)}`);

// the file: a new board on it has the same rows
const B2 = createBoard({ file });
check(JSON.stringify(B2.get(key)) === JSON.stringify(B.get(key)) && B2.ghost(key, 'Pia').d === g.d, 'file round trip');
fs.writeFileSync(file, '{ nonsense');
check(createBoard({ file }).get(key).rows.length === 0, 'a broken file: starts empty');

// HTTP
const H = createBoard({ file: null });
const srv = http.createServer((req, res) => { if (!H.handle(req, res)) { res.writeHead(404); res.end('nope'); } });
await new Promise(res => srv.listen(0, '127.0.0.1', res));
const base = `http://127.0.0.1:${srv.address().port}/kk-board`;
const j = async (url, o) => { const res = await fetch(url, o); return { status: res.status, cors: res.headers.get('access-control-allow-origin'), body: await res.json().catch(() => null) }; };
let h = await j(base);
check(h.status === 200 && h.body.ok && h.cors === '*', `ping: ${JSON.stringify(h)}`);
h = await j(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(await best('Web', 28)) });
check(h.status === 200 && h.body.rank === 1, `POST: ${JSON.stringify(h).slice(0, 120)}`);
h = await j(base + '?key=' + encodeURIComponent(key));
check(h.status === 200 && h.body.rows.length === 1 && h.body.rows[0].name === 'Web', `GET: ${JSON.stringify(h).slice(0, 120)}`);
h = await j(base + '?key=' + encodeURIComponent(key) + '&ghost=web');
check(h.status === 200 && /^[zr]/.test(h.body.d), `GET ghost: ${h.status}`);
h = await j(base + '?key=' + encodeURIComponent(key) + '&ghost=nobody');
check(h.status === 404, `GET missing ghost: ${h.status}`);
h = await j(base, { method: 'POST', body: '{nope' });
check(h.status === 400, `bad json: ${h.status}`);
h = await j(base, { method: 'POST', body: 'x'.repeat(30000) });
check(h.status === 413 || h.status === 429, `big body: ${h.status}`);
const pre = await fetch(base, { method: 'OPTIONS' });
check(pre.status === 204 && pre.headers.get('access-control-allow-methods').includes('POST'), `preflight ${pre.status}`);
check((await fetch(base.replace('kk-board', 'other'))).status === 404, 'other paths left alone');
let limited = false;
for (let i = 0; i < 12 && !limited; i++) limited = (await j(base, { method: 'POST', body: '{}' })).status === 429;
check(limited, 'posts not rate limited');
srv.close();
fs.rmSync(dir, { recursive: true, force: true });

if (fails.length) { console.log(`board: ${fails.length} failed\n  ` + fails.join('\n  ')); process.exit(1); }
console.log('board: ok (post, rank, one per name, top 20, checks, file, HTTP)');
