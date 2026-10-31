// Headless races for the tests and the balance report. Everything is seeded, so a race replays exactly.
export async function loadSim() {
  return (await import('./load-modules.mjs')).default();
}
// same generator as core.js
export function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const DT = 1 / 60, MAX_T = 400;
// one all-bot race. idxs: character indices for the grid. Returns a fingerprint plus raw numbers for stats.
export function runRace(sim, { track, seed, level = 1, idxs, laps = 3, pack = false, skill = null, noItems = false, drift = false, bot = null, onStart = null, onFrame = null, stopAt = Infinity }) {
  sim.setRandom(mulberry(seed * 7919 + track * 104729 + level));
  if (sim.driftBot) { sim.bot0 ||= { ...sim.driftBot }; Object.assign(sim.driftBot, sim.bot0, bot || {}); }   // bot: try other settings for the bots' drift (race-drift.js BOT)
  const racers = idxs.map((i, k) => ({ ch: sim.CHARACTERS[i], human: false, pIndex: k }));
  const r = new sim.Race(track, { racers, laps, autoUse: true, aiLevel: level, drift });   // drift: the drift button on (race-drift.js: the bots drift too)
  r.countdown = 0.01; if (pack) r.packMode = true; if (noItems) { r.boxes = []; r.bits = []; }
  if (skill !== null) for (const c of r.cars) c.ai.skill = skill;
  if (onStart) onStart(r);
  const picks = {}, use0 = r.useItem;
  r.useItem = function (c, s) { picks[c.item] = (picks[c.item] || 0) + 1; return use0.call(this, c, s); };
  let frame = 0, hash = 2166136261, bad = null;
  const mix = v => { const s = Number.isFinite(v) ? v.toFixed(2) : String(v); for (let i = 0; i < s.length; i++) hash = Math.imul(hash ^ s.charCodeAt(i), 16777619) >>> 0; };
  while ((stopAt < Infinity ? frame < stopAt : !r.cars.every(c => c.finished)) && frame * DT < MAX_T) {   // with stopAt: run on past the finish
    r.update(DT); r.over = false; frame++;
    for (const c of r.cars) if (!bad && ![c.x, c.y, c.speed, c.s].every(Number.isFinite)) bad = `car ${c.idx} (${c.ch.id}) non-finite at frame ${frame}`;
    if (frame % 60 === 0) for (const c of r.cars) { mix(c.x); mix(c.y); mix(c.speed); mix(c.lap); }
    if (drift) for (const c of r.cars) {   // (drift stats: drifts started, mini-turbos by tier)
      const D = c._dst || (c._dst = { n: 0, t: [0, 0, 0, 0], was: false, mt: 0 });
      if (c.dOn && !D.was) D.n++; D.was = !!c.dOn;
      if (c.mtT > 0 && D.mt <= 0 && c.mtTier) D.t[c.mtTier]++; D.mt = c.mtT || 0;
    }
    if (onFrame) onFrame(r, frame);
  }
  const cars = r.cars.map(c => ({ ch: c.ch.id, finished: c.finished, time: +c.finishTime.toFixed(3), best: +c.bestLap.toFixed(3), rank: c.rank, ...(drift ? { drifts: c._dst ? c._dst.n : 0, tiers: c._dst ? c._dst.t.slice(1) : [0, 0, 0], spins: c.dSpins || 0 } : {}) }));
  return { cars, picks, hash: hash.toString(16), frames: frame, bad, race: r };
}
export const fingerprint = res => ({ order: [...res.cars].sort((a, b) => a.rank - b.rank).map(c => c.ch), times: res.cars.map(c => c.time), picks: res.picks, hash: res.hash });
