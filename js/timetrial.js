// Kernel Kart: time trial. A one-car `calm` Race (no bots, boxes or obstacles; the road's own features stay) that
// TimeTrial watches by wrapping race.update: lap times, quarter splits, best per track with its ghost. DOM-free;
// UI in timetrial-ui.js, ghost and HUD in draw-timetrial.js.
import { sfx } from './audio.js';
import { clamp } from './core.js';

export const TT_LAPS = 99;          // hot laps until Esc; the fastest counts
export const GHOST_HZ = 20;         // ghost samples a second (eased between on playback)
const SPLITS_PER_LAP = 4;           // a split every quarter lap (the last one is the line)

// what one timed attempt is: a lap on a circuit; the whole run where a lap alone means nothing (new road every lap,
// point-to-point).
// endless: the session runs until you end it
export function ttPlan(def) {
  if (def.open) return { laps: 3, unitLaps: 3, unit: 'run', endless: false, what: 'one run, the whole course' };
  if (def.laps) return { laps: def.laps, unitLaps: 1, unit: 'lap', endless: false, what: def.laps === 1 ? 'one grand lap' : `${def.laps} laps, the fastest one counts` };
  if (def.routes && def.routes.length > 1 && !def.forks) { const n = def.routes.length; return { laps: n, unitLaps: n, unit: 'run', endless: false, what: `one run: ${n} laps, one of each road` }; }
  return { laps: TT_LAPS, unitLaps: 1, unit: 'lap', endless: true, what: 'hot laps: as many as you like, your fastest one counts' };
}
// what the one best time is called: a lap or a run
export const bestWord = plan => plan.unit === 'run' ? 'run' : 'lap';

// m:ss.ss, or a dash
export const fmtLap = t => t > 0 ? `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}` : '—';
// a split: +0.42 slower, −0.42 quicker
export const fmtDelta = d => Math.abs(d) < 0.005 ? '±0.00' : (d < 0 ? '−' : '+') + Math.abs(d).toFixed(2);

// ----- the ghost: per sample x, y, heading (×10000) and flags (bit 0 braking, bit 1 up on a bridge deck, then the
// height off the ground ×100), as Int16 in base64: 8 bytes a sample, 160 a second, ~10 KB for a 45 s lap
export function encodeGhost(samples) {
  const a = Int16Array.from(samples, v => clamp(Math.round(v), -32768, 32767)), b = new Uint8Array(a.buffer);
  let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function decodeGhost(str) {
  const s = atob(str), b = new Uint8Array(s.length & ~1); for (let i = 0; i < b.length; i++) b[i] = s.charCodeAt(i);
  return new Int16Array(b.buffer, 0, (b.length >> 1) & ~3);
}
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

// ----- saved records: all times in one small entry (kk-tt), each ghost in its own (kk-ttg:<track>) so a ghost that
// won't fit can be dropped without losing a time
const KEY = 'kk-tt', GKEY = name => 'kk-ttg:' + name;
// records with drift on, and obstacle-free (`clear`) ones, are kept apart so a ghost only races its own kind;
// clear: false is the key for records set with obstacles
export const ttKey = (name, drift, clear = true) => (drift ? name + ' · drift' : name) + (clear ? ' · clear' : '');
// a redone layout (`rev`) keeps its records apart, so an old ghost never drives a road that's gone
export const ttName = def => def.rev ? `${def.name} · v${def.rev}` : def.name;
// an entry is { t, ch, at, u }: t the best lap or run (ttPlan) in seconds, u which; an entry without u is a lap
export function loadRecords() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
// a track's record and its ghost (null when there's no record; ghost null when it's gone or isn't this record's)
export function loadRecord(name) {
  const r = loadRecords()[name]; if (!r || !(r.t > 0)) return null;
  let ghost = null;
  try { const g = JSON.parse(localStorage.getItem(GKEY(name)) || 'null'); if (g && g.t === r.t && g.hz === GHOST_HZ) ghost = { t: g.t, ch: g.ch, cp: g.cp || [], s: decodeGhost(g.d) }; } catch (e) { ghost = null; }
  return { ...r, ghost };
}
export function saveRecord(name, rec, ghost) {
  const all = loadRecords(); all[name] = rec;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { }
  if (!ghost) return;
  const wire = JSON.stringify({ t: rec.t, ch: rec.ch, hz: GHOST_HZ, cp: ghost.cp.map(v => +v.toFixed(3)), d: encodeGhost(ghost.s) });
  // full: drop other tracks' ghosts, the oldest records first, until it fits (their times stay)
  const others = Object.keys(all).filter(n => n !== name).sort((a, b) => (all[a].at || 0) - (all[b].at || 0));
  for (;;) {
    try { localStorage.setItem(GKEY(name), wire); return; } catch (e) { }
    let dropped = false;
    while (others.length && !dropped) { const n = others.shift(); try { if (localStorage.getItem(GKEY(n)) !== null) { localStorage.removeItem(GKEY(n)); dropped = true; } } catch (e) { } }
    if (!dropped) return;
  }
}

// ----- one time trial session, watching its race's only car
export class TimeTrial {
  // rival: a friend's ghost (ghost-share.js loadRival) or null; gap and splits are then against it
  constructor(race, plan, record, rival = null) {
    this.race = race; this.car = race.cars[0]; this.plan = plan; this.name = ttKey(ttName(race.track.def), race.drift, !!race.calm);
    this.record = record ? { t: record.t, ch: record.ch, at: record.at, u: plan.unit } : null;   // the track's best as it stands
    this.before = this.record;    // as it was before this session (the results say how far a new best beat it)
    this.ghost = record && record.ghost && record.ghost.s.length >= 8 ? record.ghost : null;   // what drives alongside you
    this.rival = rival && rival.s && rival.s.length >= 8 ? rival : null;
    this.ghost0 = this.ghost;     // the best as it was before this session (its splits: the results' sectors are against it)
    this.nCp = SPLITS_PER_LAP * plan.unitLaps - 1;
    this.laps = [];               // { t, newBest, cp (its splits) } for every attempt finished this session
    this.unitStart = null;        // race time the attempt under way started (null: still on the grid)
    this.cp = []; this.prevU = null; this.rec = []; this.pp = null; this.lastLapStart = this.car.lapStart;
    this.split = null;            // the latest split { d, at, k } (k = nCp: the line)
    this.flash = null;            // the latest attempt done { t, at, newBest, d }
    this.done = false; this.doneAt = 0;   // ended (Esc or the last lap): nothing more is recorded, the clock stops
    this.live = null; this.gk = 0;        // the live gap to the ghost { d, at } (s, + behind it), and the ghost sample last matched
    const upd = race.update;
    race.update = function (dt) { upd.call(this, dt); if (this.tt) this.tt.tick(); };
    race.tt = this;
  }
  // what the live gap and the splits are against: the friend's ghost, else your own
  get target() { return this.rival || this.ghost; }
  get sessionBest() { return this.laps.reduce((b, l) => !b || l.t < b ? l.t : b, 0); }
  get bestIdx() { return this.laps.findIndex(l => l.t === this.sessionBest); }   // the first of equal times
  // time into the attempt under way (0 on the grid)
  get now() { return this.unitStart === null ? 0 : (this.done ? this.doneAt : this.race.time) - this.unitStart; }
  stop() { if (!this.done) { this.done = true; this.doneAt = this.race.time; } }
  // how far round the attempt the car is, 0..1
  uOf(c) {
    const T = this.race.track;
    if (T.open) return c.s / T.finishS;
    return ((this.plan.unitLaps > 1 ? c.lap - 1 : 0) + c.s / c.T.L) / this.plan.unitLaps;
  }
  pose(c) {
    const T = this.race.track, lift = c.air > 0 ? Math.sin(Math.PI * clamp(1 - c.air / c.airT, 0, 1)) : 0;
    const up = T.bridges.some(b => { let d = c.s - b.s; if (!T.open) d = ((d % T.L) + T.L * 1.5) % T.L - T.L / 2; return Math.abs(d) - (b.s1 - b.s) < c.L * 0.5 + 50; });
    return { t: this.now, x: c.x, y: c.y, h: c.heading + c.spin, f: (!c.gas && c.speed > 25 ? 1 : 0) | (up ? 2 : 0) | Math.round(lift * 100) << 2 };
  }
  begin(t0) {
    this.unitStart = t0; this.cp = []; this.rec = []; this.prevU = this.uOf(this.car); this.gk = 0; this.live = null;
    const p = this.pose(this.car); p.t = 0; this.push(p); this.pp = p;
  }
  push(p) { this.rec.push(p.x, p.y, wrapA(p.h) * 10000, p.f); }
  tick() {
    const r = this.race, c = this.car;
    if (this.done || !r.started) return;
    if (this.unitStart === null) {
      if (r.track.open || c.lap >= 1) { this.begin(c.lapStart); this.lastLapStart = c.lapStart; }   // over the line (a stage course: from the start)
      return;
    }
    // the ghost: a sample every 1/GHOST_HZ s, eased between this frame and the last
    const p = this.pose(c), pp = this.pp;
    for (let k = this.rec.length / 4; k / GHOST_HZ <= p.t; k++) {
      const u = p.t > pp.t ? clamp((k / GHOST_HZ - pp.t) / (p.t - pp.t), 0, 1) : 1;
      this.push({ x: pp.x + (p.x - pp.x) * u, y: pp.y + (p.y - pp.y) * u, h: pp.h + wrapA(p.h - pp.h) * u, f: u < 0.5 ? pp.f : p.f });
    }
    this.pp = p;
    // splits every quarter lap; only a sane forward step counts, so a respawn behind the line doesn't tick them all
    const u = this.uOf(c);
    if (this.prevU !== null && u > this.prevU && u - this.prevU < 0.35)
      while (this.cp.length < this.nCp && u >= (this.cp.length + 1) / (this.nCp + 1)) {
        const k = this.cp.length, t = this.now; this.cp.push(t);
        const tg = this.target; if (tg && tg.cp.length === this.nCp) this.split = { d: t - tg.cp[k], at: r.time, k };
      }
    this.prevU = u;
    this.liveGap(c);
    // over the line: an attempt done once every split is in (otherwise it's the same attempt, carrying on)
    if (c.lapStart !== this.lastLapStart) {
      this.lastLapStart = c.lapStart;
      const end = this.plan.unitLaps === 1 || c.finished;
      if (end && this.cp.length >= this.nCp) { this.finish(Math.round((c.lapStart - this.unitStart) * 100) / 100); if (!c.finished) this.begin(c.lapStart); }
    }
    if (c.finished) this.stop();
  }
  finish(t) {
    const r = this.race, c = this.car, prev = this.record ? this.record.t : 0, newBest = !prev || t < prev;
    this.laps.push({ t, newBest, cp: [...this.cp] });
    this.flash = { t, at: r.time, newBest, d: prev ? t - prev : null };
    const vs = this.rival ? this.rival.t : this.ghost && this.ghost.t || prev;
    if (vs) this.split = { d: t - vs, at: r.time, k: this.nCp };
    if (!newBest) return;
    this.record = { t, ch: c.ch.id, at: Date.now(), u: this.plan.unit };
    this.ghost = { t, ch: c.ch.id, cp: [...this.cp], s: Int16Array.from(this.rec, v => clamp(Math.round(v), -32768, 32767)) };
    saveRecord(this.name, this.record, this.ghost);
    // the moment: a gold burst round the kart and a chime (the HUD card says NEW BEST)
    r.fxRing(c.x, c.y, '#ffc93c', 130, 0.8, 8); r.fxRing(c.x, c.y, '#ffffff', 80, 0.5, 4); r.fxStars(c.x, c.y, 14, '#ffd166', 220, 0.9); r.fxConfetti(c.x, c.y, 40, 50);
    sfx.play('record');
  }
  // the live gap: when the ghost was where you are now, searching near the last match so a self-crossing road can't
  // match the other pass; off its line it keeps the last one
  liveGap(c) {
    const g = this.target; if (!g) { this.live = null; return; }
    const s = g.s, n = s.length / 4, R2 = 110 * 110;
    const near = (lo, hi) => { let k = -1, bd = Infinity; for (let i = Math.max(0, lo); i <= Math.min(n - 1, hi); i++) { const dx = s[i * 4] - c.x, dy = s[i * 4 + 1] - c.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; k = i; } } return [k, bd]; };
    let [k, d] = near(this.gk - 6, this.gk + 50);
    if (d > R2) [k, d] = near(this.gk - 300, this.gk + 300);   // (lost it: a respawn, or the other road at a fork and back)
    if (k < 0 || d > R2 || Math.abs(this.now - k / GHOST_HZ) > 20) return;
    // how far along from that sample to the next (or from the one before)
    const seg = i => { const ax = s[i * 4], ay = s[i * 4 + 1], bx = s[i * 4 + 4] - ax, by = s[i * 4 + 5] - ay, L = bx * bx + by * by; return L > 1e-6 ? ((c.x - ax) * bx + (c.y - ay) * by) / L : 0; };
    let f = k;
    if (k < n - 1) { const t = seg(k); if (t >= 0) f = k + Math.min(1, t); else if (k > 0) f = k - 1 + clamp(seg(k - 1), 0, 1); }
    this.gk = k; this.live = { d: this.now - f / GHOST_HZ, at: this.race.time };
  }
  // where a ghost (your own unless g says) is now: { x, y, h, brake, lift, up, steer } or null (no ghost, or it has
  // finished its lap)
  ghostPose(g = this.ghost) {
    if (!g) return null;
    const t = this.now, n = g.s.length / 4, f = t * GHOST_HZ;
    if (f > n - 1) return null;
    const i = Math.floor(f), j = Math.min(n - 1, i + 1), u = f - i, s = g.s, at = (k, o) => s[k * 4 + o];
    const h0 = at(i, 2) / 10000, h1 = at(j, 2) / 10000, fl = at(u < 0.5 ? i : j, 3);
    const hp = at(Math.max(0, i - 1), 2) / 10000;
    return { x: at(i, 0) + (at(j, 0) - at(i, 0)) * u, y: at(i, 1) + (at(j, 1) - at(i, 1)) * u, h: h0 + wrapA(h1 - h0) * u,
      brake: !!(fl & 1), up: !!(fl & 2), lift: (fl >> 2) / 100, steer: clamp(wrapA(h1 - hp) * GHOST_HZ / 2 * 0.14, -0.55, 0.55), ch: g.ch };
  }
}
