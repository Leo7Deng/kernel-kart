// Spreads independent jobs (races, fights) across worker threads, one per core. Results always come back in job order,
// so a script that aggregates them in that order prints exactly what a one-core run prints (races and fights are
// deterministic whatever ran before them in the same thread: js/detmath.js, test/determinism.test.mjs).
//   --jobs=N on any script that uses this: N workers (default: every core, os.availableParallelism()). It's taken out
//   of process.argv as soon as this module loads, so the scripts' own argument parsing never sees it.
// Two ways in:
//   runAll(raceJobs): race jobs (the options for harness.mjs runRace), each back as { key, job, ...fingerprint, bad, unfinished }.
//   mapPool(import.meta.url, tasks) from a script that is also its own worker: the script calls
//     `if (poolWorker(import.meta.url)) serve(task => ...)` and does its main work only when !poolWorker(...).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';

const at = process.argv.findIndex(a => a.startsWith('--jobs='));
export const JOBS = at >= 0 ? Math.max(1, Math.floor(+process.argv.splice(at, 1)[0].slice(7)) || 1) : os.availableParallelism();

// true in a worker that mapPool started on this script (not in the main thread, nor in another script's worker)
export const poolWorker = url => !isMainThread && workerData && workerData.kkPool === String(url);

// run fn(task) for every task across `jobs` workers of the script at `url` (handed out one at a time, so long and short
// jobs even out); resolves to the results in task order. onResult(done, total, i, result) as each one lands.
export function mapPool(url, tasks, { jobs = JOBS, onResult = null } = {}) {
  const out = new Array(tasks.length), n = Math.max(1, Math.min(jobs, tasks.length));
  let next = 0, done = 0;
  if (!tasks.length) return Promise.resolve(out);
  return Promise.all(Array.from({ length: n }, () => new Promise((res, rej) => {
    const w = new Worker(new URL(String(url)), { workerData: { kkPool: String(url) } });
    let over = false;
    const feed = () => { if (next < tasks.length) { const i = next++; w.postMessage({ i, task: tasks[i] }); } else { over = true; w.terminate(); res(); } };
    w.on('message', m => {
      if (m && m.kkErr) { over = true; w.terminate(); rej(new Error(m.kkErr)); return; }
      if (m !== 'kk-ready') { out[m.i] = m.res; done++; if (onResult) onResult(done, tasks.length, m.i, m.res); }
      feed();
    });
    w.once('error', e => { over = true; rej(e); });
    w.once('exit', code => { if (!over) rej(new Error(`pool worker exited (${code}) with jobs left`)); });
  }))).then(() => out);
}

// the worker side: call once its setup is done (fn may be async)
export function serve(fn) {
  parentPort.on('message', async ({ i, task }) => {
    try { parentPort.postMessage({ i, res: await fn(task) }); }
    catch (e) { parentPort.postMessage({ kkErr: (e && e.stack) || String(e) }); }
  });
  parentPort.postMessage('kk-ready');
}

// races: each job is runRace's options (plus a key)
export async function runAll(jobs, { workers = JOBS, detail = false } = {}) {
  return mapPool(import.meta.url, jobs.map(job => ({ job, detail })), { jobs: workers });
}
if (poolWorker(import.meta.url)) {
  const { loadSim, runRace, fingerprint } = await import('./harness.mjs');
  const sim = await loadSim();
  serve(({ job, detail }) => {
    const res = runRace(sim, job);
    return { key: job.key, job, ...fingerprint(res), bad: res.bad, unfinished: res.cars.filter(c => !c.finished).map(c => c.ch), ...(detail ? { cars: res.cars } : {}) };
  });
}
