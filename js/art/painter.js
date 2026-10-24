// Kernel Kart art: the painter: the menu's big still pictures (a track's preview, its map cover, the backdrop's layer)
// drawn on a worker (art/paint-worker.js), so drawing one never holds up a frame (2026-10-22, the user: "the lag still
// occurs after the initial loading screen is done": a preview drawn here took 0.1-0.9 s in one go). paint(kind, name,
// pri) -> a promise of { pic (an ImageBitmap), blob (its file for the store of drawn pictures: encodeAs), box (a
// layer's place and path) }, or null where it can't be drawn there (no worker or OffscreenCanvas 2D: Safari before
// 16.4; a worker that failed or hung): the caller draws it on the page instead, as before. The same picture asked again shares
// the one job. Jobs go most wanted first (pri 0: on screen now, 1: the boot's, 2: ahead of time), one at a time per
// worker (two on a machine with six cores or more); pri 2 waits while hold() says so (a race on). Drawing only, DOM only.
import { settings } from '../settings.js';

let dead = typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined'
  || typeof OffscreenCanvas.prototype.transferToImageBitmap !== 'function' || typeof OffscreenCanvas.prototype.convertToBlob !== 'function';
const POOL = typeof navigator !== 'undefined' && navigator.hardwareConcurrency >= 6 ? 2 : 1;
const Ws = [];            // { w, job }
const jobs = new Map();   // key -> job { key, kind, name, look, pri, n, sent, done, p }
const LATE = 30000;       // ms a job may take (the first loads the worker's code, slow on a phone over the network) before the painter's given up on
let seq = 0, held = () => false, later = 0, encOf = () => '';

// whether pictures are drawn on the worker (else on the page)
export const painterOn = () => !dead;
// hold(): true while the ahead-of-time pictures (pri 2) should wait
export const holdPainter = f => { held = f; };
// f(kind) -> the type a picture is kept in by the store of drawn pictures (thumb-store.js; '' for none): encoded on the
// worker as it's drawn (asked when the job starts, so one asked before the store opened is kept too)
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
