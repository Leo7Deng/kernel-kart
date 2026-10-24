// Kernel Kart: the menu's drawn pictures kept from one visit to the next in IndexedDB, so a later start restores them (a
// picture decoded off the main thread, a few ms each) instead of drawing them: the track previews (ui.js `minis`: 0.1-0.9 s
// each to draw), the map covers (art/covers.js `covers`, with Map cover art on) and the menu backdrop's layer of the last
// few tracks shown (menu-bg.js; only the boot's track's is decoded). One entry per kind and track ('mini:Moonshot',
// 'cover:Moonshot', 'bg:Moonshot'): { art, def, look, blob (WebP; where the browser can't make WebP, JPEG for the opaque
// ones, PNG for the covers), box (a backdrop's place and path, so a later start builds nothing), t (when) }. art is a hash
// of the drawing code (virtual:art-hash, vite.config.js: art/paint-worker.js and everything it imports), not the game's
// version, so an update that doesn't touch the drawing keeps them (before 2026-10-22 every commit threw them all away, and
// the user updates many times a day); def a hash of that track's definition (tracks.js: a change to one track redraws
// only that one), look the Style; anything stored under another art, def or look, or for a track that's gone, is dropped
// as the store opens. Dev hashes the files on each page load, so edits not committed yet count too. ~1.1 MB for the
// twenty previews. A picture drawn on the painter's worker (art/painter.js) comes with its file, encoded there; one drawn
// here is encoded in an idle moment. Drawing only, DOM only (boot.js).
import art from 'virtual:art-hash';
import { covers } from './art/covers.js';
import { encodeAs } from './art/painter.js';
import { bgKeep } from './menu-bg.js';
import { settings } from './settings.js';
import { TRACKS } from './tracks.js';
import { minis } from './ui.js';

const DB = 'kk-thumbs', ST = 'pics';
let db = null;
const defs = new Map();   // track name -> its definition's hash ('' for a track that's gone)
function defOf(name) {
  if (!defs.has(name)) {
    const t = TRACKS.find(t => t.name === name); let h = '';
    if (t) { const s = JSON.stringify(t, (k, v) => typeof v === 'function' ? String(v) : v); let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } h = (x >>> 0).toString(36) + '.' + (t.rev || 0); }
    defs.set(name, h);
  }
  return defs.get(name);
}
const open = () => new Promise(res => {
  let rq; try { rq = indexedDB.open(DB, 1); } catch (e) { res(null); return; }
  rq.onupgradeneeded = () => rq.result.createObjectStore(ST);
  rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); rq.onblocked = () => res(null);
});
const rows = d => new Promise(res => {
  const out = [];
  try {
    const c = d.transaction(ST).objectStore(ST).openCursor();
    c.onsuccess = () => { const cur = c.result; if (!cur) { res(out); return; } out.push([cur.key, cur.value]); cur.continue(); };
    c.onerror = () => res(out);
  } catch (e) { res(out); }
});

// open the store, put every picture still good into the caches and drop the rest; from then on each newly drawn preview
// and cover is stored. bg: the name of the track the backdrop shows. Resolves to { n (how many restored), bg (the
// backdrop's { pic, box }: its picture, and its place and path, menu-bg.js; or null) }; n 0 with no store (private
// browsing, an old browser)
export async function restoreThumbs(bg = '') {
  const none = { n: 0, bg: null };
  if (typeof indexedDB === 'undefined' || typeof createImageBitmap === 'undefined' || !art) return none;
  const d = await open(); if (!d) return none;
  const stale = [], got = [];
  await Promise.all((await rows(d)).map(async ([key, e]) => {
    const kind = String(key).split(':')[0], name = String(key).slice(kind.length + 1);
    if (!e || !e.blob || e.art !== art || e.look !== settings.look || !defOf(name) || e.def !== defOf(name) || !['mini', 'cover', 'bg'].includes(kind)) { stale.push(key); return; }
    if (kind === 'cover' && !settings.mapArt || kind === 'bg' && name !== bg) return;   // (kept, but not decoded: nothing shows it now)
    try { got.push([kind, name, await createImageBitmap(e.blob), e.box]); } catch (err) { stale.push(key); }
  }));
  db = d;
  d.onversionchange = () => { d.close(); db = null; };
  let pic = null;
  for (const [kind, name, img, box] of got) if (kind === 'bg') pic = { pic: img, box }; else (kind === 'mini' ? minis : covers).put(name, img);
  minis.onDrawn = (name, c) => save('mini', name, c);
  covers.onDrawn = (name, c) => save('cover', name, c);
  bgKeep.onDrawn = keepBg;
  encodeAs(kind => db ? typeOf(kind) : '');
  if (stale.length) try { const s = d.transaction(ST, 'readwrite').objectStore(ST); for (const k of stale) s.delete(k); } catch (err) { }
  return { n: got.length, bg: pic };
}
// a backdrop drawn (a canvas, or its file from the painter, and its box: menu-bg.js), kept for a later visit: the last
// BGS tracks' (the boot shows the last picked one; only that one is decoded)
const BGS = 4;
export function keepBg(name, c, box) {
  if (!db) return;
  try {
    const s = db.transaction(ST, 'readwrite').objectStore(ST), rq = s.openCursor(), had = [];
    rq.onsuccess = () => {
      const cur = rq.result;
      if (cur) { const k = String(cur.key); if (k.startsWith('bg:') && k !== 'bg:' + name) had.push([cur.value && cur.value.t || 0, cur.key]); cur.continue(); return; }
      had.sort((a, b) => b[0] - a[0]); for (const [, k] of had.slice(BGS - 1)) s.delete(k);
    };
  } catch (e) { }
  save('bg', name, c, box);
}

// a newly drawn picture stored: its file as it is (from the painter), or a canvas encoded one at a time in idle moments
// (the browser encodes it off the main thread; reading the canvas back is the page's)
const queue = [];
const idle = f => (typeof requestIdleCallback !== 'undefined' ? requestIdleCallback(f, { timeout: 3000 }) : setTimeout(f, 200));
let webp = null;   // whether the browser makes WebP (Safari before 17 doesn't: JPEG, or PNG for a cover's see-through corners)
function typeOf(kind) {
  if (webp === null) try { const c = document.createElement('canvas'); c.width = c.height = 1; webp = c.toDataURL('image/webp').startsWith('data:image/webp'); } catch (e) { webp = false; }
  return webp ? 'image/webp' : kind === 'cover' ? 'image/png' : 'image/jpeg';
}
const put = (key, name, blob, box) => { try { if (blob && db) db.transaction(ST, 'readwrite').objectStore(ST).put({ art, def: defOf(name), look: settings.look, blob, box, t: Date.now() }, key); } catch (e) { } };
function save(kind, name, c, box) {
  if (!db || !defOf(name)) return;
  if (typeof Blob !== 'undefined' && c instanceof Blob) { put(kind + ':' + name, name, c, box); return; }
  if (!c || typeof c.toBlob !== 'function') return;   // (a picture from the painter without its file: not kept)
  queue.push({ key: kind + ':' + name, name, type: typeOf(kind), c, box });
  if (queue.length === 1) idle(next);
}
function next() {
  const q = queue[0]; if (!q) return;
  const done = () => { queue.shift(); if (queue.length) idle(next); };
  try { q.c.toBlob(blob => { put(q.key, q.name, blob, q.box); done(); }, q.type, 0.9); } catch (e) { done(); }
}
