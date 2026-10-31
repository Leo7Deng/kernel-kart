// Kernel Kart art: the painter: the menu's big still pictures (track preview, map cover, backdrop layer) drawn on a
// worker (art/paint-worker.js) so one never holds up a frame. paint(kind, name, pri) -> a promise of { pic
// (ImageBitmap), blob (for thumb-store.js: encodeAs), box (a layer's place and path) }, or null where the worker can't
// draw (no OffscreenCanvas 2D, or it failed or hung): the caller draws it on the page. The same picture asked twice
// shares one job. Most wanted first (pri 0 on screen, 1 the boot's, 2 ahead of time), one at a time per worker (two
// with 6+ cores); pri 2 waits while hold() says so (a race on).
import { settings } from '../settings.js';

let dead = typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined'
  || typeof OffscreenCanvas.prototype.transferToImageBitmap !== 'function' || typeof OffscreenCanvas.prototype.convertToBlob !== 'function';
const POOL = typeof navigator !== 'undefined' && navigator.hardwareConcurrency >= 6 ? 2 : 1;
const Ws = [];            // { w, job }
const jobs = new Map();   // key -> job { key, kind, name, look, pri, n, sent, done, p }
const LATE = 30000;       // ms a job may take (the first loads the worker's code, slow on a phone) before it's given up on
let seq = 0, held = () => false, later = 0, encOf = () => '';

// whether pictures are drawn on the worker (else on the page)
export const painterOn = () => !dead;
// hold(): true while the ahead-of-time pictures (pri 2) should wait
export const holdPainter = f => { held = f; };
// f(kind) -> the type thumb-store.js keeps a picture in ('' for none), encoded on the worker (asked as the job starts,
// so a job from before the store opened is kept too)
export const encodeAs = f => { encOf = f; };

export function paint(kind, name, pri = 1) {
  if (dead) return Promise.resolve(null);
  const key = kind + ':' + name + ':' + settings.look;
  let j = jobs.get(key);
  if (j) { if (pri < j.pri) { j.pri = pri; pump(); } return j.p; }
  j = { key, kind, name, look: settings.look, pri, n: seq++, sent: false };
  j.p = new Promise(r => { j.done = r; });
  jobs.set(key, j); pump();
  return j.p;
}

// a picture already asked for, wanted sooner now (on screen)
export function sooner(kind, name, pri) { const j = jobs.get(kind + ':' + name + ':' + settings.look); if (j && pri < j.pri) { j.pri = pri; pump(); } }

function spawn() {
  try {
    const w = new Worker(new URL('./paint-worker.js', import.meta.url), { type: 'module' }), W = { w, job: null };
    w.onmessage = e => {
      const j = W.job; W.job = null; clearTimeout(W.late);
      if (e.data.dead) die();
      if (j) { jobs.delete(j.key); j.done(e.data.err ? null : e.data); }
      pump();
    };
    w.onerror = e => { if (e && e.preventDefault) e.preventDefault(); die(); };
    w.onmessageerror = () => { const j = W.job; W.job = null; clearTimeout(W.late); if (j) { jobs.delete(j.key); j.done(null); } pump(); };
    Ws.push(W);
  } catch (e) { if (!Ws.length) die(); }
}
// the worker can't draw here: everything asked goes back to be drawn on the page
function die() {
  dead = true;
  for (const W of Ws) { clearTimeout(W.late); try { W.w.terminate(); } catch (e) { } }
  Ws.length = 0;
  for (const j of jobs.values()) j.done(null);
  jobs.clear();
}
function pump() {
  if (dead) return;
  for (;;) {
    let W = Ws.find(W => !W.job);
    if (!W && Ws.length < POOL && [...jobs.values()].some(j => !j.sent)) { spawn(); if (dead) return; W = Ws.find(W => !W.job); }
    if (!W) return;
    const wait = held();
    let j = null;
    for (const x of jobs.values()) if (!x.sent && !(wait && x.pri >= 2) && (!j || x.pri < j.pri || x.pri === j.pri && x.n < j.n)) j = x;
    if (!j) { if (wait && !later && [...jobs.values()].some(x => !x.sent)) later = setTimeout(() => { later = 0; pump(); }, 500); return; }
    j.sent = true; W.job = j; W.late = setTimeout(die, LATE);
    try { W.w.postMessage({ id: j.n, kind: j.kind, name: j.name, look: j.look, enc: j.kind === 'path' ? '' : encOf(j.kind === 'layer' ? 'bg' : j.kind) }); } catch (e) { W.job = null; clearTimeout(W.late); jobs.delete(j.key); j.done(null); }
  }
}
