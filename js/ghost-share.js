// Kernel Kart: friends' ghosts. A time trial ghost (timetrial.js: x, y, heading, flags per 1/20 s) packed small enough to
// send as a link (#ghost=…, opened by timetrial-ui.js) or over an online room (net.js), and the friends' ghosts kept per
// track (kk-ttf:<record key>) to race in time trial as your rival. DOM-free (test/ghost-share.test.mjs runs it in Node).
//
// The packing: every other sample (10 a second; the ones between are put back halfway on unpacking, which is how the
// ghost is drawn anyway), each column (x, y, the heading unwrapped in 1/200 rad, the flags) as differences of differences
// (a kart's path is smooth, so they're tiny), each a zigzag varint, column after column; then deflate-raw where the
// browser has CompressionStream. A link is about 25 characters a second of ghost: 800 for a 30 s lap.
import { GHOST_HZ } from './timetrial.js';

const HQ = 200;                     // heading steps per radian in a packed ghost (0.005 rad: nothing you can see)
const STEP = 2;                     // every other sample goes (the ones between are put back halfway)
export const RIVAL = '#ff7ad9';     // a friend's ghost: its colour on the menu, the results, the HUD and the road
export const RIVAL_MAX = 6;        // friends' ghosts kept per track (one per friend: a new one of theirs replaces the old)
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

// ----- bytes: zigzag varints
function writer() {
  let b = new Uint8Array(1024), n = 0;
  const put = v => { if (n >= b.length) { const c = new Uint8Array(b.length * 2); c.set(b); b = c; } b[n++] = v; };
  return {
    u(v) { v = Math.max(0, Math.floor(v)); while (v >= 0x80) { put((v & 0x7f) | 0x80); v = Math.floor(v / 128); } put(v); },
    i(v) { this.u(v >= 0 ? v * 2 : -v * 2 - 1); },
    bytes(a) { for (const x of a) put(x); },
    done: () => b.slice(0, n),
  };
}
function reader(b) {
  let p = 0;
  return {
    u() { let v = 0, m = 1; for (;;) { if (p >= b.length) throw new Error('short'); const x = b[p++]; v += (x & 0x7f) * m; if (x < 0x80) return v; m *= 128; if (m > 2 ** 35) throw new Error('bad varint'); } },
    i() { const v = this.u(); return v % 2 ? -(v + 1) / 2 : v / 2; },
    bytes(n) { if (p + n > b.length) throw new Error('short'); const s = b.subarray(p, p + n); p += n; return s; },
  };
}
const utf8 = s => new TextEncoder().encode(s), unutf8 = b => new TextDecoder().decode(b);

// a column as differences of differences, and back
function putCol(w, col) { let p = 0, d = 0; for (const v of col) { const nd = v - p; w.i(nd - d); d = nd; p = v; } }
function getCol(r, n) { const out = new Array(n); let p = 0, d = 0; for (let k = 0; k < n; k++) { d += r.i(); p += d; out[k] = p; } return out; }

// meta: { track, rev, drift, clear, name, ch, t, cp } (cp: the ghost's split times, s; clear: set in a time trial without
// obstacles, timetrial.js ttKey: a link from before that has none, and doesn't open, timetrial-ui.js openGhostLink). ghost.s: the Int16 samples (timetrial.js)
// the samples kept out of n: every STEP-th, and the last
const kept = n => { const ks = []; for (let k = 0; k < n; k += STEP) ks.push(k); if (ks[ks.length - 1] !== n - 1) ks.push(n - 1); return ks; };
export function packGhost(meta, s) {
  const n = Math.floor(s.length / 4), xs = [], ys = [], hs = [], fs = [];
  let u = 0, h0 = null;
  for (const k of kept(n)) {
    const h = s[k * 4 + 2] / 10000; u = h0 === null ? h : u + wrapA(h - h0); h0 = h;
    xs.push(s[k * 4]); ys.push(s[k * 4 + 1]); hs.push(Math.round(u * HQ)); fs.push(s[k * 4 + 3]);
  }
  const head = utf8(JSON.stringify({ tr: meta.track, rv: meta.rev || 0, dr: meta.drift ? 1 : 0, ...(meta.clear ? { cl: 1 } : {}), n: String(meta.name || '').slice(0, 16), ch: meta.ch, t: Math.round(meta.t * 100), cp: (meta.cp || []).map(v => Math.round(v * 100)), hz: GHOST_HZ }));
  const w = writer();
  w.u(1); w.u(head.length); w.bytes(head); w.u(n);
  for (const col of [xs, ys, hs, fs]) putCol(w, col);
  return w.done();
}
export function unpackGhost(b) {
  const r = reader(b);
  if (r.u() !== 1) throw new Error('a newer kind of ghost: update the game');
  const h = JSON.parse(unutf8(r.bytes(r.u()))), n = r.u();
  if (!(n > 0 && n < 20000)) throw new Error('bad ghost');
  const ks = kept(n), m = ks.length, xs = getCol(r, m), ys = getCol(r, m), hs = getCol(r, m), fs = getCol(r, m);
  const s = new Int16Array(n * 4), c = v => Math.max(-32768, Math.min(32767, Math.round(v)));
  for (let j = 0; j < m; j++) {   // each kept sample, then the ones between it and the next, eased between the two
    const k1 = j + 1 < m ? ks[j + 1] : ks[j] + 1;
    for (let k = ks[j]; k < k1 && k < n; k++) {
      const a = j + 1 < m ? (k - ks[j]) / (k1 - ks[j]) : 0, b = Math.min(m - 1, j + 1), L = (p, q) => p + (q - p) * a;
      s[k * 4] = c(L(xs[j], xs[b])); s[k * 4 + 1] = c(L(ys[j], ys[b])); s[k * 4 + 2] = c(wrapA(L(hs[j], hs[b]) / HQ) * 10000); s[k * 4 + 3] = c(fs[j]);
    }
  }
  const meta = { track: String(h.tr || ''), rev: h.rv || 0, drift: !!h.dr, clear: !!h.cl, name: String(h.n || '').slice(0, 16) || 'Friend', ch: String(h.ch || ''), t: h.t / 100, cp: (h.cp || []).map(v => v / 100), hz: h.hz || GHOST_HZ };
  if (!(meta.t > 0) || meta.hz !== GHOST_HZ) throw new Error('bad ghost');
  return { meta, s };
}

// ----- base64url
export function b64url(b) {
  let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64url(t) {
  const s = atob(String(t).replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, ''));
  const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b;
}

// ----- deflate-raw, where there's CompressionStream (every current browser, Node 18+)
const canZip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
async function pipe(b, stream) { return new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(stream)).arrayBuffer()); }

// the link's payload: 'z' + deflated packed ghost, or 'r' + the packed ghost as it is (no CompressionStream here)
export async function encodeGhostPayload(meta, s) {
  const raw = packGhost(meta, s);
  if (canZip()) { try { const z = await pipe(raw, new CompressionStream('deflate-raw')); if (z.length < raw.length) return 'z' + b64url(z); } catch { } }
  return 'r' + b64url(raw);
}
export async function decodeGhostPayload(p) {
  p = String(p || '').trim().split('.')[0]; const kind = p[0];   // (.kk: the link's end, see ghostLink)
  let b = unb64url(p.slice(1));
  if (kind === 'z') {
    if (!canZip()) throw new Error('This browser can\'t open ghost links: try another one');
    b = await pipe(b, new DecompressionStream('deflate-raw'));
  } else if (kind !== 'r') throw new Error('That isn\'t a ghost link');
  return unpackGhost(b);
}
// a ghost link's payload out of a URL or a hash (#ghost=…), or null
export const ghostParam = url => { const m = /[#&?]ghost=([A-Za-z0-9_.-]+)/.exec(String(url || '')); return m ? m[1] : null; };
// the link itself: base is the page's address (no hash)
// (ending in .kk: a chat app that turns it into a link may leave off a last - or _, never letters)
export const ghostLink = (base, payload) => String(base).replace(/#.*$/, '') + '#ghost=' + payload + '.kk';

// ----- friends' ghosts, per track record key (timetrial.js ttKey(ttName(def), drift)): { sel, list } in kk-ttf:<key>.
// Each entry { id, name, ch, t, cp, d, at, via } (d: the packed ghost as base64url, so loading one needs no inflating)
const FKEY = key => 'kk-ttf:' + key;
export const rivalId = (name, t, ch) => `${String(name).toLowerCase()}|${Math.round(t * 100)}|${ch}`;
export function loadRivals(key) {
  try { const o = JSON.parse(localStorage.getItem(FKEY(key)) || 'null'); if (o && Array.isArray(o.list)) return { sel: o.sel ?? null, list: o.list.filter(e => e && e.t > 0 && typeof e.d === 'string') }; } catch { }
  return { sel: null, list: [] };
}
function saveRivals(key, o) {
  try { if (!o.list.length) localStorage.removeItem(FKEY(key)); else localStorage.setItem(FKEY(key), JSON.stringify(o)); return true; } catch { return false; }
}
// keep a friend's ghost (meta and samples as unpackGhost gives them) under key: one per name (the new one replaces theirs),
// the oldest dropped past RIVAL_MAX. select: make it the one you race. Returns the entry, or null if storage is full
export function addRival(key, meta, s, { via = 'link', select = true } = {}) {
  const o = loadRivals(key), id = rivalId(meta.name, meta.t, meta.ch);
  const e = { id, name: meta.name, ch: meta.ch, t: meta.t, cp: meta.cp || [], d: b64url(packGhost({ ...meta }, s)), at: Date.now(), via };
  o.list = o.list.filter(x => x.name.toLowerCase() !== meta.name.toLowerCase());
  o.list.unshift(e);
  while (o.list.length > RIVAL_MAX) o.list.pop();
  if (select) o.sel = id; else if (!o.list.some(x => x.id === o.sel)) o.sel = null;
  return saveRivals(key, o) ? e : null;
}
export function dropRival(key, id) { const o = loadRivals(key); o.list = o.list.filter(x => x.id !== id); if (o.sel === id) o.sel = null; saveRivals(key, o); }
export function selectRival(key, id) { const o = loadRivals(key); o.sel = o.list.some(x => x.id === id) ? id : null; saveRivals(key, o); }
// the rival you race on key, as a ghost for TimeTrial ({ t, ch, cp, s, name, id }), or null
export function loadRival(key) {
  const o = loadRivals(key), e = o.list.find(x => x.id === o.sel); if (!e) return null;
  try { const { s } = unpackGhost(unb64url(e.d)); return { t: e.t, ch: e.ch, cp: e.cp || [], s, name: e.name, id: e.id }; } catch { return null; }
}
