// Kernel Kart art: the 3D bakery's queue. Making a 3D sheet (art/model3d.js mascots, art/car3d.js cars) takes 20-200 ms,
// so nothing a race draws makes one on the spot: it's a job here, a generator that does a little at a time, and the jobs
// run in slices of a few ms after each frame (asked for with requestAnimationFrame, run just after it in a task of their
// own), so the loading screen and the countdown keep their frame rate. A job's heavy maths (its mesh: the model built in
// code, and for a car the cut of every frame) goes to two Web Workers (art/mesh-worker.js) while the page carries on;
// then WebGL starts (its shaders compiled in the background), the mesh goes up a megabyte a step and its frames are
// drawn a row a step. pri 0: what a race shows first (the plain sheets: mascots and cars), pri 1: the rest (the moods).
// A sheet still on the queue is drawn 2D (or a mood with the plain face) until it's done. With no worker (or one that
// fails or is slow) the maths runs here, a step of its own. Drawing only: nothing runs at import, and the queue only
// ever holds cosmetics (no race state). Before 2026-10-22 a race made every sheet on its first frame (a stall of
// 0.5-1.9 s at the start with 3D racers and cars on, in headless Chrome).
const jobs = [];                 // { key, pri, make, it, n, wait }, the most wanted first
const byKey = new Map();
let asked = 0, order = 0;
const BUDGET = [12, 6];          // ms a slice may spend on pri 0 / pri 1 jobs (a step that's started always finishes)
const FLY = 4;                   // jobs waiting on the workers at once (the rest start as those come back)
export const WAIT = Symbol('wait');     // what a job yields while the worker has its maths
export const LATER = Symbol('later');   // ... while something else it waits for may take a while (WebGL's shaders): asked again next slice

// a job: make() returns its generator (yield between steps, yield* offThread for the maths; it stores its own result when
// it ends). A key already on the queue isn't added again, but moves up if it's now wanted sooner (lower pri).
export function queueBake(key, make, pri = 0) {
  const j0 = byKey.get(key);
  if (j0) { if (pri < j0.pri) { j0.pri = pri; sort(); } return; }
  const j = { key, pri, make, it: null, n: order++, wait: false };
  jobs.push(j); byKey.set(key, j); sort(); kick();
}
const sort = () => jobs.sort((a, b) => a.pri - b.pri || a.n - b.n);
export const baking = key => byKey.has(key);
// how many jobs at pri or more wanted are left (the loading screen waits for pri 0)
export const bakesLeft = (pri = 0) => jobs.reduce((n, j) => n + (j.pri <= pri), 0);

const ready = j => !j.wait && (!!j.it || waiting.size < FLY);   // (can go on now)
function kick() {
  if (asked || typeof requestAnimationFrame === 'undefined' || !jobs.some(ready)) return;
  asked = requestAnimationFrame(() => setTimeout(slice, 0));
}
const drop = j => { jobs.splice(jobs.indexOf(j), 1); byKey.delete(j.key); };
function slice() {
  asked = 0;
  const t0 = performance.now(), later = new Set();
  for (;;) {
    const j = jobs.find(j => ready(j) && !later.has(j));   // (the most wanted that can go on)
    if (!j || performance.now() - t0 >= BUDGET[Math.min(1, j.pri)]) break;
    try {
      if (!j.it) j.it = j.make();
      const r = j.it.next();
      if (r.done) drop(j); else if (r.value === WAIT) j.wait = true; else if (r.value === LATER) later.add(j);
    } catch (e) { drop(j); }   // (a job that throws is dropped: drawn 2D)
  }
  kick();
}
// a finished sheet drawn once onto the game's canvas (render.js gives the hook: one pixel in its corner, painted over by
// the next frame), so the browser has it on the GPU before a race draws it: the first draw of a 5-17 MB sheet uploads it,
// and a race whose sheets were all made on the loading screen paid for every one on its first frame (0.1-0.3 s)
let primer = null;
export const setPrimer = f => { primer = f; };
export function prime(...cvs) { if (primer) for (const c of cvs) try { primer(c); } catch (e) { } }
// a generator to the end now, the maths here rather than waiting for the worker
let now = 0;
export function runNow(it) { now++; try { let r = it.next(); while (!r.done) r = it.next(true); return r.value; } finally { now--; } }
// a job to the end now (something that can't wait: a sheet asked for outside a race)
export function bakeNow(key) {
  const j = byKey.get(key); if (!j) return;
  drop(j);
  try { runNow(j.it || j.make()); } catch (e) { }
}

// ---------------------------------------------------------------- the workers
// two (one on a two-core device): a grid's meshes are the slow part of a start once the page isn't doing them
const POOL = typeof navigator !== 'undefined' && navigator.hardwareConcurrency > 2 ? 2 : 1;
const Ws = []; let wFail = false, seq = 0, turn = 0;
const waiting = new Map();   // id -> (answer) => void
const SLOW = 1500;           // ms a job waits for a worker before doing its maths here (one still loading on a slow connection)
function worker() {
  if (wFail) return null;
  if (Ws.length < POOL) try {
    const W = new Worker(new URL('./mesh-worker.js', import.meta.url), { type: 'module' });
    W.onmessage = e => { const cb = waiting.get(e.data.id); waiting.delete(e.data.id); if (cb) cb(e.data); wake(); };
    W.onerror = e => { if (e && e.preventDefault) e.preventDefault(); wFail = true; for (const w of Ws) w.terminate(); Ws.length = 0; for (const cb of waiting.values()) cb({ err: 'worker' }); waiting.clear(); wake(); };
    Ws.push(W);
  } catch (e) { wFail = !Ws.length; }
  return Ws.length ? Ws[turn++ % Ws.length] : null;
}
const wake = () => { for (const j of jobs) j.wait = false; kick(); };
// a job's maths: on the worker (kind and args: what mesh-worker.js runs; the answer's typed arrays come back moved, not
// copied), the job waiting (yielding WAIT) till it answers; local() here instead with no worker, if it failed, or when
// the job's being finished now (runNow)
export function* offThread(kind, args, local) {
  const w = !now && typeof Worker !== 'undefined' && worker(); if (!w) return local();
  let res = null; const id = ++seq;
  waiting.set(id, d => { res = d; });
  try { w.postMessage({ id, kind, args }); } catch (e) { waiting.delete(id); return local(); }
  const t0 = performance.now(), late = setTimeout(wake, SLOW);
  while (!res && performance.now() - t0 < SLOW) if (yield WAIT) break;
  clearTimeout(late);
  if (!res) { waiting.delete(id); return local(); }   // (finished now, or a worker slow to answer: here instead)
  return res.err ? local() : res.r;
}
