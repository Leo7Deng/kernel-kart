// node test/determinism.test.mjs: a race comes out the same whatever ran before it, and on any computer.
// 1. Order: one-lap races (every track, two seeds) each alone in a fresh worker, then all in one worker shuffled: every
//    fingerprint must match (catches state a race leaves in a module or a shared track).
// 2. Platform: gameplay code (race and Fight) uses js/detmath.js for every engine-computed function (sin, exp, atan2,
//    pow...) and never `**`, so only exactly rounded IEEE arithmetic remains; checked by reading the files, and
//    detmath's results compared bit for bit with recorded values.
import fs from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { parseAst } from 'rollup/parseAst';
import { loadSim, runRace, fingerprint, mulberry } from './harness.mjs';

if (!isMainThread) {
  const sim = await loadSim();
  parentPort.postMessage(workerData.map(j => ({ key: j.key, fp: fingerprint(runRace(sim, j)) })));
} else {
  const fails = [], t0 = Date.now();
  const ROOT = new URL('../', import.meta.url);

  // ---- 2a. the gameplay files: detmath's Math, no ** ----
  // gameplay = every module the race loads that isn't drawing or sound (those may use the engine's own maths)
  const COSMETIC = /^js\/(art\/|art\.js|fx|audio|input|look|settings|qol|view|draw-)/;
  // (and Fight's: the sim, bots, arenas, kits, online prediction and the training room, which all step it)
  const seen = new Set(), queue = ['js/race.js', 'js/tracks.js', 'js/fight.js', 'js/fight-net.js', 'js/fight-practice.js', 'js/kits/_template.js'];
  while (queue.length) {
    const f = queue.shift(); if (seen.has(f)) continue; seen.add(f);
    const src = fs.readFileSync(new URL(f, ROOT), 'utf8');
    // (block comments left out: a JSDoc type's import('./x.js') is for the type checker, never loaded)
    for (const m of src.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?:import|export)\s[^;]*?from\s*'(\.[^']+)'|import\(\s*'(\.[^']+)'\s*\)/g)) queue.push(new URL(m[1] || m[2], new URL(f, ROOT)).pathname.slice(ROOT.pathname.length));
  }
  const NONDET = /\bMath\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot)\b/;
  for (const f of [...seen].filter(f => !COSMETIC.test(f) && f !== 'js/detmath.js')) {
    const src = fs.readFileSync(new URL(f, ROOT), 'utf8');
    if (NONDET.test(src) && !/^import \{ Math \} from '\.{1,2}\/detmath\.js';/m.test(src)) fails.push(`${f}: uses ${src.match(NONDET)[0]} without importing detmath.js as Math (import { Math } from './detmath.js')`);
    let pow = 0; const walk = o => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk); if ((o.type === 'BinaryExpression' || o.type === 'AssignmentExpression') && (o.operator === '**' || o.operator === '**=')) pow++; for (const k in o) if (k !== 'type') walk(o[k]); };
    walk(parseAst(src)); if (pow) fails.push(`${f}: ${pow} use(s) of ** (the engine's pow, not the same everywhere): write Math.pow(a, b) with detmath's Math`);
  }

  // ---- 2b. detmath gives the recorded bits ----
  const D = await import('../js/detmath.js');
  const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
  let h = 2166136261; const mix = v => { f64[0] = v; for (const w of u32) h = Math.imul(h ^ w, 16777619) >>> 0; };
  for (let i = 0; i < 4000; i++) {
    const x = (i - 2000) * 0.7853 + i * 1e-7, y = (i % 37 - 18) * 13.1 + 0.3;
    mix(D.sin(x)); mix(D.cos(x)); mix(D.tan(x * 1e-3)); mix(D.exp(x / 300)); mix(D.log(Math.abs(x) + 1e-3)); mix(D.atan(x / 100));
    mix(D.atan2(y, x)); mix(D.asin(x / 1600)); mix(D.acos(x / 1600)); mix(D.pow(Math.abs(x) / 100, y / 40)); mix(D.pow(x / 500, 3)); mix(D.hypot(x, y));
  }
  const DET = 'ea1960a8';
  if (h.toString(16) !== DET) fails.push(`detmath.js gave different bits (hash ${h.toString(16)}, recorded ${DET}): it must only use exactly rounded arithmetic`);

  // ---- 1. order doesn't matter ----
  const sim = await loadSim(), nC = sim.CHARACTERS.length, jobs = [];
  for (let track = 0; track < sim.TRACKS.length; track++) for (const seed of [1, 2]) jobs.push({ key: `${track}:${sim.TRACKS[track].name}:s${seed}`, track, seed, level: seed === 1 ? 0 : 2, laps: 1, drift: seed === 2, idxs: [0, 1, 2, 3].map(i => (i * 3 + seed + track) % nC) });
  const run = js => new Promise((res, rej) => { const w = new Worker(new URL(import.meta.url), { workerData: js }); w.once('message', res); w.once('error', rej); });
  const pool = async (groups, n) => { const out = [], q = [...groups]; await Promise.all(Array.from({ length: n }, async () => { while (q.length) out.push(...await run(q.shift())); })); return out; };
  const rnd = mulberry(7);
  const shuffled = jobs.map(j => [rnd(), j]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
  const together = jobs.slice().reverse();   // (each track's two races back to back, the other way round)
  const W = Math.max(1, Math.min(os.availableParallelism(), 8));
  const [alone, mixed] = await Promise.all([pool(jobs.map(j => [j]), Math.max(1, W - 2)), pool([shuffled, together], 2)]);
  const ref = Object.fromEntries(alone.map(r => [r.key, JSON.stringify(r.fp)]));
  const bad = new Set();
  for (const r of mixed) if (JSON.stringify(r.fp) !== ref[r.key]) bad.add(r.key);
  for (const k of bad) fails.push(`${k}: comes out differently after other races in the same process than alone`);

  console.log(`${seen.size} modules read, ${jobs.length} races alone and twice in other orders, in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (fails.length) { console.error(fails.map(f => 'FAIL ' + f).join('\n')); process.exit(1); }
  console.log('ok');
}
