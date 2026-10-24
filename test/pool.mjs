// Runs race jobs across worker threads. A job is the options for runRace; each comes back as { key, ...fingerprint, bad, unfinished }.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { loadSim, runRace, fingerprint } from './harness.mjs';

export function runAll(jobs, { workers = Math.min(os.availableParallelism(), 8), detail = false } = {}) {
  const chunks = Array.from({ length: workers }, () => []);
  // round-robin, so each worker gets a mix of short and long tracks
  jobs.forEach((j, i) => chunks[i % workers].push(j));
  return Promise.all(chunks.filter(c => c.length).map(chunk => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { chunk, detail } });
    w.once('message', res); w.once('error', rej);
  }))).then(parts => parts.flat());
}
if (!isMainThread) {
  const sim = await loadSim();
  parentPort.postMessage(workerData.chunk.map(job => {
    const res = runRace(sim, job);
    return { key: job.key, job, ...fingerprint(res), bad: res.bad, unfinished: res.cars.filter(c => !c.finished).map(c => c.ch), ...(workerData.detail ? { cars: res.cars } : {}) };
  }));
}
