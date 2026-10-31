// @ts-check
// Online races in step. The host runs the real Race; players build the same Race but never run its physics: it is
// overwritten by the host's snapshots and drawn by render.js as usual. hostSync wraps the host's race.update (remote
// players are ordinary human cars, Input slot = pIndex; a snapshot every SNAP_DT); clientSync replaces a player's
// (applies snapshots, eases the other karts a steady delay behind, predicts and reconciles the player's own kart).
// A snapshot encodes the race's own fields generically (new state needs no change here); cars, routes and track
// objects go as references ({ $c }, { $r }, { $s }); particles spawned since the last go along, not re-simulated.
// No DOM: test/net.test.mjs runs both ends in Node.
import { clamp } from './core.js';
import { sfx } from './audio.js';
import { updateParticles } from './fx.js';
import { Input } from './input.js';
import { Race } from './race.js';
import { trackSample } from './geometry.js';
import { ROCKET_LATE } from './race-start.js';

export const SNAP_DT = 0.05;   // 20 snapshots a second

// ---- the shapes other modules share (npm run typecheck)
/** A race snapshot, host -> one player (header above; build below): q its count, full (every field) or b (the q it's
 * the changes against), rn the race's number, race and cars the fields that changed (encoded: codec), bx and gc the
 * item boxes and GC bots, pa the particles spawned since the last, ev the sounds, shakes and flashes, ack per player
 * [their input count, its age, used], pi the particles' ids (on a lossy line).
 * @typedef {{ k: 'snap', q: number, full?: number, b?: number, rn?: number, race: Record<string, any>,
 *   cars: Record<string, any>[], bx: any, gc: any, pa: any[], ev: any[], ack: Record<string, any[]>, pi?: number[] }} Snap */
/** A player's input, player -> host ({ k: 'in' }: net.js header): g gas/drift bits, f items fired so far, n which gas
 * change, q the last snapshot that arrived, h the few changes before [n, g, ms], rn the race's number.
 * @typedef {{ k: 'in', g: number, f: number, n: number, q: number, h?: number[][], rn?: number | null }} NetInput */
/** hostSync's options: send(d, slot) one player's snapshot (false: it didn't go), local the host's own cars, lossy(slot)
 * true when that player's line drops packets (a DataChannel), now() the clock in s, rid the race's number.
 * @typedef {{ send: (d: Snap, slot: number) => boolean, local: import('./race.js').Car[], lossy?: (slot: number) => boolean,
 *   now?: () => number, rid?: number | null }} HostSyncOpts */
/** clientSync's options: me this player's slot, gas() the held bits (1 gas, 2 drift), fire() an item fired since the
 * last call, predict (drive our own kart here), now, rid as hostSync's.
 * @typedef {{ me: number, gas?: () => number | boolean, fire?: () => boolean, predict?: boolean, now?: () => number,
 *   rid?: number | null }} ClientSyncOpts */
// race fields that stay on each machine: what it's built from, its own caches and camera, and the screen effects (which
// are sent as events, for the player they're for)
const LOCAL_RACE = new Set(['track', 'routes', 'cars', 'humans', 'localHumans', 'particles', 'boxes', 'gcs', 'rng', 'touching', 'cam', 'miniPath',
  'trackIdx', 'laps', 'autoUse', 'aiLevel', 'lapLen', 'packMode', 'net', 'paused', 'shake', 'flash']);
// car fields that never change or only matter to the simulation (its luck, the bot's brain, the undo history)
const LOCAL_CAR = new Set(['ch', 'st', 'ai', 'rng', 'hist', 'histT', 'idx', 'top', 'acc', 'grip', 'L0', 'W0', 'weight0', 'netName', 'key', 'prevLat']);

// pieces of the track a race can point at (moons, volcanoes, crossings...), listed the same way on every machine
function trackObjects(race) {
  const out = [], seen = new Set(race.routes);
  const walk = (v, d) => {
    if (!v || typeof v !== 'object' || seen.has(v) || d > 5 || ArrayBuffer.isView(v)) return;
    seen.add(v);
    if (Array.isArray(v)) { if (v.length <= 256) for (const x of v) walk(x, d + 1); return; }
    out.push(v); for (const k of Object.keys(v)) walk(v[k], d + 1);
  };
  for (const R of race.routes) { walk(R.mech, 0); walk(R.rail, 0); for (const k of ['jumps', 'gaps', 'pads', 'bridges', 'forks', 'gc']) walk(R[k], 0); }
  return out;
}

export function codec(race) {
  const carIx = new Map(race.cars.map((c, i) => [c, i])), routeIx = new Map(race.routes.map((R, i) => [R, i]));
  const statics = trackObjects(race), staticIx = new Map(statics.map((o, i) => [o, i]));
  const enc = (v, d = 0) => {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : { $f: String(v) };
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
    if (typeof v !== 'object') return undefined;                    // functions, undefined
    if (carIx.has(v)) return { $c: carIx.get(v) };
    if (routeIx.has(v)) return { $r: routeIx.get(v) };
    if (staticIx.has(v)) return { $s: staticIx.get(v) };
    if (d > 6 || v instanceof Map || v instanceof Set || ArrayBuffer.isView(v)) return undefined;
    if (Array.isArray(v)) {
      const a = v.map(x => { const e = enc(x, d + 1); return e === undefined ? null : e; });
      const extra = Object.keys(v).length > v.length && Object.keys(v).filter(k => !/^\d+$/.test(k));   // an array with named fields too (a squall timetable's winds)
      if (!extra || !extra.length) return a;
      const o = { $a: a }; for (const k of extra) { const e = enc(v[k], d + 1); if (e !== undefined) o[k] = e; } return o;
    }
    const o = {}; for (const k of Object.keys(v)) { const e = enc(v[k], d + 1); if (e !== undefined) o[k] = e; } return o;
  };
  const dec = v => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(dec);
    if ('$c' in v) return race.cars[v.$c];
    if ('$r' in v) return race.routes[v.$r];
    if ('$s' in v) return statics[v.$s];
    if ('$f' in v) return Number(v.$f);
    if ('$a' in v) { const a = v.$a.map(dec); for (const k in v) if (k !== '$a') a[k] = dec(v[k]); return a; }
    const o = {}; for (const k in v) o[k] = dec(v[k]); return o;
  };
  const car = c => { const o = {}; for (const k of Object.keys(c)) if (!LOCAL_CAR.has(k)) { const e = enc(c[k], 1); if (e !== undefined) o[k] = e; } return o; };
  return { enc, dec, car, carIx };
}

// ---------------------------------------------------------------- host
// opts: send(snapshot, pIndex) (false: it didn't go), lossy(pIndex) (a WebRTC DataChannel that can drop or reorder;
// a WebSocket can't), local (the host's own cars), now() (seconds), rid (this race's number: carried as rn, and input
// from another race is ignored, or a late input from the last race poisons the gas-change count n). Returns
// setInput(pIndex, { g, f, n, q }) and toBot(pIndex). Each snapshot's ack tells its player [n, age, fires used]: which
// gas change drives their kart and for how long, so clientSync can line its prediction up.
// Snapshots carry every event particle (rings, flashes...) plus an even sample of the rest up to PA_MAX: Fast-Forward
// alone spawns 100+ per snapshot, and sending them all backed up slow links.
const PA_MAX = 40, PA_KEEP = new Set(['ring', 'ringIn', 'flash', 'strike', 'bolt', 'beam', 'wheel', 'debris']);
function thin(list) {
  if (list.length <= PA_MAX) return list;
  const keep = list.filter(p => PA_KEEP.has(p.kind)), rest = list.filter(p => !PA_KEEP.has(p.kind)), room = Math.max(0, PA_MAX - keep.length);
  const step = rest.length / Math.max(1, room); for (let i = 0; i < room && Math.floor(i * step) < rest.length; i++) keep.push(rest[Math.floor(i * step)]);
  return keep;
}
// Each player gets only what changed since their last acknowledged snapshot (a full one every REFRESH). Countdown
// timers are clamped at -1 (and itemT at 2) so they stop changing once nothing reads them.
const REFRESH = 40;
const TIMERS = new Set(['boost', 'turbo', 'shield', 'ghost', 'dragged', 'oc', 'ocGrace', 'ff', 'frozen', 'bubbled', 'sudo', 'oiled', 'stall', 'squished', 'pinned', 'spinT', 'wheelspin',
  'hitCd', 'wallCd', 'bumpCd', 'jumpCd', 'padCd', 'trainCd', 'pull', 'grow', 'air', 'flatT', 'moonT', 'loopT', 'lavaT', 'sweptT', 'flyT', 'scrapeFx', 'stompT']);
const carNum = (k, v) => typeof v !== 'number' ? v : TIMERS.has(k) ? Math.max(v, -1) : k === 'itemT' ? Math.min(v, 2) : v;
// Flow control: on a slow link snapshots queue in OS buffers the relay can't see and the screen falls seconds behind.
// Players ack each snapshot (q); one whose oldest unacked snapshot is LAG past their best round trip is skipped (one
// still goes every PROBE). Skipped sounds and particles go with the next.
const LAG = 0.12, PROBE = 0.5, PROBE_LOSSY = 0.09;
const HOLD = 0.1;   // the longest a gas change that came in with later ones is played on the host (input redundancy, above)
/** @param {Race} race @param {HostSyncOpts} opts */
export function hostSync(race, { send, local, lossy = () => false, now = () => performance.now() / 1000, rid = null }) {
  const C = codec(race), inputs = new Map(), seen = new WeakSet(), peers = new Map();
  let fresh = [], events = [], acc = SNAP_DT, stepping = false;   // stepping: only the race's own sounds go out (not the renderer's ambient ones, which every screen makes for itself)
  race.localHumans = local;
  for (const c of race.cars) if (c.human && !local.includes(c)) { c.remote = true; Input.pressed[c.pIndex] = false; Input.drift[c.pIndex] = false; Input.fire[c.pIndex] = false; }   // (their keys here start up: not as the last race left them, until their own input comes)
  // sounds, shakes and flashes happen here as usual (for the host's own karts) and go out for everyone else's screen
  const P = Race.prototype, at = a => a && C.carIx.has(a) ? { c: C.carIx.get(a) } : { x: Math.round(a.x), y: Math.round(a.y) };
  // (iu: made by a player's item as they fired it, [which fire of theirs, their car, 'use' (the ring and sound every item
  // makes) or 'eff' (the rest)]: their own screen has already shown it, if it showed that fire itself (clientSync))
  // each event and particle a snapshot carries gets a number, so a screen shows it once however many snapshots carry it
  // (on a lossy line they're sent again until a snapshot that has them is acknowledged)
  let using = null, evN = 0, paN = 0; const paId = new WeakMap();
  const ev = e => { e.i = ++evN; if (using) e.iu = [using.u, using.c, using.k]; events.push(e); };
  race.sound = function (name, a, vol = 1) { P.sound.call(this, name, a, vol); if (a && stepping) ev({ s: name, v: Math.round(vol * 100) / 100, ...at(a) }); };
  race.jolt = function (c, k) { P.jolt.call(this, c, k); if (c.remote) ev({ j: c.idx, k }); };
  race.flashFor = function (c, f) { P.flashFor.call(this, c, f); if (c.remote) ev({ fl: c.idx, f }); };
  race.cue = function (name) { P.cue.call(this, name); if (stepping) ev({ g: name }); };   // (every screen's)
  race.shakeAll = function (k) { P.shakeAll.call(this, k); ev({ sa: k }); };
  const tag = (from, k) => { for (let i = from; i < race.particles.length; i++) if (!race.particles[i].iu) race.particles[i].iu = [using.u, using.c, k]; };
  race.useItem = function (c, sorted) {
    const st = c.remote && inputs.get(c.pIndex); if (!st) return P.useItem.call(this, c, sorted);
    const n0 = this.particles.length; using = { u: st.used, c: c.idx, k: 'eff' };
    try { return P.useItem.call(this, c, sorted); } finally { tag(n0, 'eff'); using = null; }
  };
  race.fxUse = function (c, id) {
    if (!using) return P.fxUse.call(this, c, id);
    const n0 = this.particles.length; using.k = 'use';
    try { return P.fxUse.call(this, c, id); } finally { tag(n0, 'use'); using.k = 'eff'; }
  };
  // a player's line: what they've been sent (to send only what changed), what's on its way to them, their round trip
  const peer = p => {
    let o = peers.get(p);
    if (!o) peers.set(p, o = { p, q: 0, n: 0, sentE: new Map(), base: null, sent: [], mins: [], rtt: null, last: -1e9, pa: [], ev: [], skipped: 0, got: 0 });
    return o;
  };
  for (const c of race.cars) if (c.remote) peer(c.pIndex);
  let nid = 0;
  // the race as it is now, each value encoded once with its JSON (to tell what changed for each player)
  const encodeNow = () => {
    // projectiles and Thread clones get a number, so a player's screen can tell which is which from one snapshot to the
    // next (one removed from the middle of the list shifts the rest)
    for (const p of race.projectiles) if (p.nid === undefined) p.nid = ++nid;
    for (const k of race.clones || []) if (k.nid === undefined) k.nid = ++nid;
    const out = { race: [], cars: race.cars.map(() => []), bx: race.boxes.map(b => C.enc(Math.max(b.t, -1))), gc: race.gcs.map(g => [g.lat, g.x, g.y, g.dir, g.ang].map(v => C.enc(v))) };
    for (const k of Object.keys(race)) if (!LOCAL_RACE.has(k)) { const e = C.enc(race[k]); if (e !== undefined) out.race.push([k, e, JSON.stringify(e)]); }
    race.cars.forEach((c, i) => { for (const k of Object.keys(c)) if (!LOCAL_CAR.has(k)) { const e = C.enc(carNum(k, c[k]), 1); if (e !== undefined) out.cars[i].push([k, e, JSON.stringify(e)]); } });
    return out;
  };
  const spread = () => {   // this beat's particles and events into every player's next snapshot (old ones go: they're past)
    const t = race.time;
    for (const p of fresh) paId.set(p, ++paN);
    for (const o of peers.values()) {
      for (const p of fresh) o.pa.push([t, p]); for (const e of events) o.ev.push([t, e]);
      if (o.pa.length && t - o.pa[0][0] > 0.3) o.pa = o.pa.filter(x => t - x[0] <= 0.3);
      if (o.ev.length && t - o.ev[0][0] > 1) o.ev = o.ev.filter(x => t - x[0] <= 1);
    }
    fresh = []; events = [];
  };
  // player p's next snapshot (and, if it goes, remember what it carried). Only what changed since the last one they
  // acknowledged (b: that one's number), not since the last one sent: on a lossy line that one may never arrive, and the
  // next mustn't depend on it. In full (no b) every REFRESH, at first, and when they ask
  const maps = E => { if (!E.rm) { E.rm = new Map(E.race.map(([k, , j]) => [k, j])); E.cm = E.cars.map(f => new Map(f.map(([k, , j]) => [k, j]))); } return E; };
  const isFull = o => !o.base || o.n % REFRESH === 0 || o.redo;
  const build = (o, E) => {
    const full = isFull(o), B = full ? null : maps(o.base.E), pa = thin(o.pa.map(x => x[1]));
    /** @type {Snap} */
    const s = { k: 'snap', q: o.q + 1, race: {}, cars: [], bx: E.bx, gc: E.gc, pa: pa.map(p => C.enc(p)), ev: o.ev.map(x => x[1]), ack: {} };
    if (full) s.full = 1; else s.b = o.base.q;
    if (rid != null) s.rn = rid;
    if (lossy(o.p)) s.pi = pa.map(p => paId.get(p) || 0);
    const st = inputs.get(o.p); if (st) s.ack[o.p] = [st.an, Math.round(st.age * 1e4) / 1e4, st.used];
    for (const [k, e, j] of E.race) if (full || B.rm.get(k) !== j) s.race[k] = e;
    E.cars.forEach((fields, i) => { const m = B && B.cm[i], d = {}; for (const [k, e, j] of fields) if (!m || m.get(k) !== j) d[k] = e; s.cars.push(d); });
    return s;
  };
  const commit = (o, E, t) => {
    const full = isFull(o);   // (as build had it)
    o.q++; o.n++; o.last = t; if (full) o.fullQ = o.q; o.redo = false;
    o.sentE.set(o.q, E); if (o.sentE.size > 120) o.sentE.delete(o.sentE.keys().next().value);
    // what happened (sounds, rings...) goes again in the next ones until one that has it is acknowledged, on a lossy line
    // (the plain smoke and sparks only once); on a WebSocket it always arrives
    if (lossy(o.p)) { for (const x of o.ev) x[2] ??= o.q; o.pa = o.pa.filter(x => PA_KEEP.has(x[1].kind)); for (const x of o.pa) x[2] ??= o.q; }
    else { o.pa = []; o.ev = []; }
    o.sent.push([o.q, t]); if (o.sent.length > 200) o.sent.shift();
  };
  const due = (o, t) => {
    if (!o.sent.length) return true;
    const lim = (o.rtt === null ? 0.5 : Math.min(o.rtt, 1)) + LAG;
    // (a lossy line probes every other beat, not every PROBE: a Wi-Fi stall loses the acks too; there the
    // DataChannel's bufferedAmount is what holds back a too-slow link)
    return t - o.sent[0][1] <= lim || t - o.last >= (lossy(o.p) ? PROBE_LOSSY : PROBE);
  };
  const ack = (p, q) => {
    const o = peers.get(p); if (!o || !(q > 0)) return;
    const t = now(), E = o.sentE.get(q);
    if (E && (!o.base || q > o.base.q)) { o.base = { q, E }; for (const k of [...o.sentE.keys()]) if (k < q) o.sentE.delete(k); }   // the next ones go against this
    if (o.ev.length) o.ev = o.ev.filter(x => !(x[2] <= q));
    if (o.pa.length) o.pa = o.pa.filter(x => !(x[2] <= q));
    while (o.sent.length && o.sent[0][0] <= q) {
      const [sq, st] = o.sent.shift();
      if (sq === q) {   // a round trip: kept as the best of each of the last 10 seconds
        o.got++; const sec = Math.floor(t), r = t - st, b = o.mins[o.mins.length - 1];
        if (b && b[0] === sec) b[1] = Math.min(b[1], r); else { o.mins.push([sec, r]); if (o.mins.length > 10) o.mins.shift(); }
        o.rtt = Math.min(...o.mins.map(m => m[1]));
      }
    }
  };
  // a snapshot for player p now, whatever the flow control says (the test's)
  const snapshot = (p = peers.keys().next().value) => {
    const o = peer(p), E = encodeNow(); spread();
    const s = build(o, E); commit(o, E, now()); return s;
  };
  race.update = function (dt) {
    for (const [p, st] of inputs) {
      // the next of their gas changes starts driving their kart this step. Changes that came in together (a Wi-Fi burst
      // held them up) are played one after the other, each for as long as it was held on their screen (up to HOLD), so
      // a quick tap off the gas isn't lost
      if (st.queue.length && st.hold <= 0) { const [n, g, d] = st.queue.shift(); st.cg = g; st.an = n; st.age = 0; st.hold = st.queue.length ? Math.min(d || 0, HOLD) : 0; }
      Input.pressed[p] = !!(st.cg & 1); Input.drift[p] = !!(st.cg & 2); if (st.f > st.used) { Input.fire[p] = true; st.used = st.f; }   // (g: gas in bit 1, drift in bit 2)
      st.hold -= dt;
    }
    for (const p of this.particles) seen.add(p);   // the ones already here (including the renderer's ambient dust) aren't news
    stepping = true; try { P.update.call(this, dt); } finally { stepping = false; }
    for (const st of inputs.values()) st.age += dt;
    for (const p of this.particles) if (!seen.has(p)) { seen.add(p); fresh.push(p); }
    if ((acc += dt) >= SNAP_DT) {   // an even beat: keep the leftover (only a long stall resets it)
      acc = acc > SNAP_DT * 3 ? 0 : acc - SNAP_DT;
      spread();
      const t = now(); let E = null;
      for (const c of race.cars) {
        if (!c.remote) continue;
        const o = peer(c.pIndex);
        if (!due(o, t)) { o.skipped++; continue; }
        E = E || encodeNow();
        if (send(build(o, E), o.p) !== false) commit(o, E, t);
      }
    }
  };
  return {
    snapshot, peers,
    setInput(p, st) {
      if (rid != null && st.rn != null && st.rn !== rid) return;   // the last race's (or the next's): not this one's
      const o = inputs.get(p) || { cg: 0, f: st.f || 0, used: st.f || 0, n: 0, an: 0, age: 0, queue: [], hold: 0 };
      // their gas changes, oldest first: the ones this message repeats (h: [n, g, ms held]) and its own. A message can come
      // late or out of order (or one before it may be lost): only changes newer than any we have count
      const add = (n, g, d) => { if (n > o.n) { o.n = n; o.queue.push([n, +g | 0, d / 1000]); } };
      if (Array.isArray(st.h)) for (const [n, g, d] of st.h) add(n, g, d);
      if (st.n !== undefined) add(st.n, st.g, 0); else o.cg = +st.g | 0;   // (no n: just what's held now, the tests' plain input)
      if (o.queue.length > 8) o.queue.splice(0, o.queue.length - 8);
      o.f = Math.max(o.f, st.f || 0); inputs.set(p, o);
      if (st.q) ack(p, st.q);
      if (st.r) { const o = peers.get(p); if (o && !(o.fullQ >= st.r)) o.redo = true; }   // they couldn't use one (they no longer had what it went against): the next goes in full
    },
    // a player left: a bot takes over their kart for the rest of the race
    toBot(p) {
      const c = race.cars.find(o => o.human && o.pIndex === p && o.remote); if (!c) return;
      inputs.delete(p); Input.pressed[p] = false; Input.fire[p] = false; Input.drift[p] = false;
      c.human = false; c.remote = false; c.netName = (c.netName || '') + ' (bot)';
      race.humans = race.humans.filter(o => o !== c);
    },
  };
}

// ---------------------------------------------------------------- player
// opts: me (this pIndex), gas() (held bits), fire() (ITEM pressed since last call), predict (false: draw our kart like
// the others; the test compares), now(). Returns receive(snapshot) and input() ({ g, f, n, q }, q acks the newest).
// Other karts are drawn a steady delay behind the newest snapshot, eased between two (more delay when snapshots come
// late or sparse; past the newest they're extrapolated for EXTRAP). Our own kart is driven here every frame by
// Race.updateCar on a copy, from our own gas, and drawn now. Reconcile: the ack says which gas change (n) the host is
// on and for how long, i.e. which moment of our clock (tau) its state belongs to; we restart from it, replay our
// frames since, and ease the difference out (corr, ~150 ms), snapping when big or when we were hit (the host's word
// goes). While the host has us where prediction can't follow (away()), we're drawn like everyone else. Prediction
// ignores contact and sees others as dead-reckoned shapes.
// Items: ITEM fires at once on our copy (useItem). SELF items are fully predicted and re-fired at the same moment on
// each reconcile until the host acks that fire; others only show their ring and sound here, the rest is the host's
// (which tags what each of our fires made, iu, so it isn't shown twice).
const STUN = ['spinT', 'squished', 'pinned', 'stall', 'frozen', 'bubbled'];   // knocked about: the host's state goes as it is
const stunned = c => STUN.some(k => c[k] > 0);
const away = c => c.moonT > 0 || c.lavaT > 0 || c.loopT > 0 || c.secretT > 0 || c.sweptT > 0 || c.flyT > 0 || c.finished || !c.human;   // not ours to drive (loopT: round an Infinite Loop; secretT: on a secret shortcut's ride, race-secret.js)
const lost = c => c.moonT > 0 || c.lavaT > 0 || c.secretT > 0 || c.sweptT > 0 || c.flyT > 0;
const SHOW = ['x', 'y', 'heading', 'speed', 'gas', 'gasAt', 'dHeld', 'dOn', 'dAmt', 'dYaw', 'dSide', 'dCharge', 'dCorner', 'dStrain', 'dLock', 'mtT', 'mtK', 'mtTier', 'kCmd', 'air', 'airT', 'trick', 'spin', 'spinT', 'off', 's', 'lat', 'T', 'boost', 'slip', 'reach', 'grow', 'growK', 'L', 'W', 'weight', 'slot',
  'turbo', 'oc', 'ocT', 'ocGrace', 'shield', 'ghost', 'sudo', 'ff'], SHOWN = new Set(SHOW);
export const SELF = new Set(['boost', 'oc', 'shield', 'sudo', 'grow', 'ghost', 'ff']);   // items predicted in full on the player's screen
const SNAP = 250;           // a correction bigger than this (world units) is a jump, not something to ease out (a boost you fired shows up ~150)
const EASE = 15;            // how fast a correction is eased out (per second: ~95% gone in 200 ms)...
const FIX_V = 300;          // ...but never faster than this (units a second): a big one (an item the host fired late after a Wi-Fi stall) glides
const REPEAT = 4;           // each input repeats our last few gas changes
const EXTRAP = 0.2;         // the others are carried on past the newest snapshot for at most this long (a late one), then held
const OFF_EASE = 8;         // and where that guess was off, it's eased out at this rate (per second)
const WIN = 3;              // the delay: worked out from the last few seconds of snapshots...
const LATE_Q = 0.9;         // ...enough for this share of them to come in time
const WARP = 0.25;          // how much faster or slower than real time the others' clock may run while it catches up
const angle = a => Math.atan2(Math.sin(a), Math.cos(a));
const noop = () => { };
// a kart's drawing-only state that changes every frame on the host, eased between snapshots so it doesn't step 20
// times a second. Each with its direction: up (a drop is a new start: jump to it), down (a timer: a rise is new), or both.
/** @type {[string, number][]} */
const ANIM = [['dYaw', 0], ['spin', 1], ['squash', -1], ['jx', 0], ['jy', 0], ['growK', 0], ['grow', -1], ['moonT', -1], ['lavaT', -1], ['secretT', -1], ['sweptT', -1], ['flyT', -1], ['air', -1], ['flatT', -1]];
const animOf = c => [...ANIM.map(([k]) => c[k]), c.slot ? c.slot.t : undefined];
const between = (u, v, f, way) => typeof u !== 'number' || typeof v !== 'number' || (way > 0 && v < u) || (way < 0 && v > u) ? v : u + (v - u) * f;

// opts.rid: this race's number (hostSync): snapshots from another race are dropped (a late one froze the screen).
/** @param {Race} race @param {ClientSyncOpts} opts */
export function clientSync(race, { me, gas = () => false, fire = () => false, predict = true, now = () => performance.now() / 1000, rid = null }) {
  const C = codec(race);
  // the snapshots' poses by host race time (oldest first). We draw a steady delay behind the newest (the longest
  // recent gap plus arrival jitter, never under DELAY), so a slightly late packet changes nothing visible.
  const DELAY = 0.1, MAX_DELAY = 0.5; let buf = [], rt = null, delay = DELAY, arr = [], lastW = null;
  const off = new Map();   // car index -> how far off the guess past the newest snapshot turned out (eased out: OFF_EASE)
  let recon = null;        // the newest snapshot not yet reconciled with (once a frame, however many came in a burst)
  // the host's state as each of the last snapshots left it (encoded: { race, cars }, by number): the next one carries only
  // what changed since one we acknowledged (s.b), so it's that one's state plus what this one carries
  const states = new Map(); let have = null;   // (have: the one this screen shows)
  let gotQ = 0;          // the newest snapshot we got (acknowledged in our input); an older one coming late is dropped
  let gapQ = 0;          // a snapshot we couldn't use (we no longer had the one it went against): asked for in full
  const seenEv = new Set(), seenPa = new Set();   // events and particles already shown (a lossy line sends them again)
  const seen = (set, id) => { if (!id) return false; if (set.has(id)) return true; set.add(id); if (set.size > 800) { const keep = [...set].slice(-400); set.clear(); for (const x of keep) set.add(x); } return false; };
  const mine = () => race.cars.find(c => c.pIndex === me && (c.human || c.remote));
  race.localHumans = [mine()].filter(Boolean);
  const pose = c => ({ x: c.x, y: c.y, h: c.heading });
  const byId = list => new Map((list || []).filter(o => o.nid !== undefined).map(o => [o.nid, pose(o)]));   // projectiles and clones, by their number (hostSync)
  const carPose = c => ({ x: c.x, y: c.y, h: c.heading, a: animOf(c) });
  // what the host plays straight from sfx (not through race.sound), worked out from what changed (the countdown's beeps:
  // startCues, as this screen shows it)
  const cues = (before, me0) => {
    const r = race;
    if (!before.winner && r.winner) sfx.play(race.feels(r.winner) ? 'win' : 'rivalWin');
    const m = race.localHumans[0]; if (!m || !me0) return;
    if (!me0.finished && m.finished && r.winner !== m) sfx.play('finish');
    else if (!m.finished && m.lap > me0.lap && m.lap >= 1) { if (m.lap === r.laps) { sfx.tempo(1.08); sfx.play('finalLap'); } else sfx.play('lap'); }
  };

  // ----- our input and its timeline
  let tau = 0;                                  // our own clock: the sum of our frame times
  const ctl = { g: 0, f: 0, n: 0 };            // what the host gets: gas held, items fired so far, which gas change this is
  const changeAt = new Map();                   // gas change n -> the moment on our clock it started driving the kart
  const recent = [];                            // our last few gas changes [n, g, when on our clock]: each input repeats them
  const poll = () => {
    const v = gas(), g = typeof v === 'number' ? v : v ? 1 : 0;   // (gas in bit 1, drift in bit 2: race-drift.js)
    if (g !== ctl.g || !ctl.n) { ctl.g = g; ctl.n++; changeAt.set(ctl.n, tau); recent.push([ctl.n, g, tau]); if (recent.length > REPEAT + 1) recent.shift(); }
    if (fire()) ctl.f++;
    return ctl;
  };
  // the changes before this one, each with how long it was held (ms): a message lost or held up in a burst loses no tap
  const repeat = () => { const h = []; for (let i = 0; i + 1 < recent.length; i++) h.push([recent[i][0], recent[i][1], Math.round((recent[i + 1][2] - recent[i][2]) * 1000)]); return h; };
  // ----- the prediction
  const P = Race.prototype;
  let pred = null, W = null, hist = [], corr = { x: 0, y: 0, h: 0 }, shown = null, followed = true, hostMe = null, ackU = 0;
  // our fires: done (the last one this screen has handled), pend (fired here, not yet used by the host: { u, t, k } with
  // when on our clock), shownUse (which of them this screen showed: 'all' for a SELF item, 'use' for its ring and sound)
  let done = 0, pend = []; const shownUse = new Map();
  const stats = { err: [], snaps: 0, resims: 0, steps: 0, stunSnaps: 0, broke: null, used: 0 };
  const clone = c => { const o = Object.assign(Object.create(Object.getPrototypeOf(c)), c); o.hist = pred ? pred.hist : []; o.slot = c.slot && { ...c.slot }; return o; };   // (its own slot machine: the prediction runs its reels down)
  // the rest of the race as our copy sees it: our kart, everyone else's shape (moved on at their speed), our own item
  // boxes and clock. Anything the step writes on the race lands here and is thrown away.
  const world = () => {
    const sh = Object.create(race);
    Object.assign(sh, { cars: [pred, ...W.ghosts], particles: [], ticker: [], boxes: W.boxes, winner: race.winner || pred, sound: noop, jolt: noop, flashFor: noop, cue: noop, shakeAll: noop, feed: noop, feels: () => false });
    if (W.bits) { sh.bits = W.bits; sh.loose = W.loose; }   // our kart takes and throws bits in our copy of them (race-bits.js)
    // and presses the logic gate's switch (race-gate.js) and is swatted by the crab (race-crab.js, which marks who each
    // claw has hit) in our copy of those: the host's own state of them is what this screen draws
    if (W.gate) sh.gate = W.gate;
    if (W.crab) sh.crab = W.crab;
    return sh;
  };
  const step = (sh, g, dt) => {
    if (!W.started && (W.cd -= dt) <= 0) W.started = true;
    W.t += dt; sh.time = W.t; sh.started = W.started;
    // the start (race-start.js) as the host will have it: when our hold began, then the launch at GO
    if (!W.started) { if (!g) pred.gasAt = 0; else if (!pred.gasAt) pred.gasAt = Math.max(W.cd, 1e-3); }
    else if (W.goT === null) { W.goT = W.t; P.launch.call(sh, pred); }
    else if (W.t - W.goT <= ROCKET_LATE && pred.launchWait && g) { pred.launchWait = false; P.rocket.call(sh, pred); }
    const p0 = Input.pressed[me], f0 = Input.fire[me], d0 = Input.drift[me];   // our gas and drift go in through our slot (the host's own copy of it, in a test, is put back)
    Input.pressed[me] = !!(g & 1); Input.drift[me] = !!(g & 2); Input.fire[me] = false;      // never fires: items are the host's
    try { P.updateCar.call(sh, pred, dt, sh.cars, pred, pred.progress); } finally { Input.pressed[me] = p0; Input.fire[me] = f0; Input.drift[me] = d0; }
    for (const b of W.boxes) b.t -= dt;
    for (const o of W.ghosts) { const d = o.speed * dt; o.x += Math.cos(o.heading) * d; o.y += Math.sin(o.heading) * d; o.s += d; o.progress += d; if (!o.T.open && o.s >= o.T.L) o.s -= o.T.L; }
    stats.steps++;
  };
  // our kart fires what it holds, as the race would (SELF: useItem in full; anything else just moves the slot on, after its
  // ring and sound when it's live). Returns what this screen showed, or null if there was nothing to fire.
  // the item slot as the host has it, with our fires it hasn't used yet (ackU..n) taken out: what this screen shows and
  // what pressing ITEM fires. (Not our copy's own slot: a box it drives through rolls an item here that the host may not
  // have given us, so firing pred.item could fire something the screen never showed.)
  const slotAfter = n => { const s = { item: hostMe.item, item2: hostMe.item2, charges: hostMe.charges }; for (let u = ackU; u < n && s.item; u++) { if (s.charges > 1) s.charges--; else { s.item = s.item2; s.item2 = null; s.charges = s.item ? 1 : 0; } } return s; };
  const useLocal = (sh, live) => {
    if (live && hostMe) Object.assign(pred, slotAfter(done));   // fire what the screen shows
    const it = pred.item;
    if (!it || !W.started || pred.finished || pred.moonT > 0 || pred.lavaT > 0 || pred.loopT > 0) return null;
    if (SELF.has(it)) { P.useItem.call(sh, pred, sh.cars); return 'all'; }
    if (live) sh.fxUse(pred, it);
    if (pred.charges > 1) pred.charges--; else P.nextItem.call(sh, pred);
    return 'use';
  };
  // the world our kart fires in for real: its effects on this screen, on our kart as it's drawn
  const liveWorld = m => {
    const sh = world(), at = a => a === pred ? m : a;
    return Object.assign(sh, { particles: race.particles, sound: (n, a, v) => race.sound(n, at(a), v), jolt: (c, k) => race.jolt(at(c), k), flashFor: (c, f) => race.flashFor(at(c), f), shakeAll: k => race.shakeAll(k) });
  };
  // the fires the host hasn't used yet, between two moments of our clock: fired again in the copy
  const refire = (sh, t0, t1) => { for (const f of pend) if (f.t > t0 && f.t <= t1) useLocal(sh, false); };
  // where we had our kart at a moment of our clock
  const predictedAt = t => {
    for (let i = 0; i < hist.length; i++) {
      const e = hist[i]; if (e.t0 + e.dt < t) continue; if (e.t0 > t) return null;
      const a = i > 0 ? hist[i - 1].st : e.st, b = e.st, f = e.dt > 0 ? (t - e.t0) / e.dt : 1;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, air: b.air, stun: b.stun };
    }
    return null;
  };
  const keep = c => ({ x: c.x, y: c.y, air: c.air > 0, stun: stunned(c) });
  // a snapshot came in: start our kart again from the host's word and drive it on to now
  const reconcile = (s, m) => {
    hostMe = { item: m.item, item2: m.item2, charges: m.charges };
    const a = s.ack && s.ack[me];
    let at = null;
    if (a) {
      ackU = a[2];
      pend = pend.filter(f => f.u > ackU && tau - f.t < 3);   // (used by the host: its state has them now)
      for (const u of shownUse.keys()) if (u < ackU - 20) shownUse.delete(u);
      const t0 = changeAt.get(a[0]); if (t0 !== undefined) at = t0 + a[1];
      for (const k of changeAt.keys()) if (k < a[0]) changeAt.delete(k);
    }
    const was = pred && { x: pred.x, y: pred.y, h: pred.heading };
    if (at !== null && tau - at > 1) at = null;   // a long stall: don't try to drive through all of it, just take the host's word
    const then = at !== null ? predictedAt(at) : null;
    if (then && !then.stun && !stunned(m) && !away(m) && then.air === m.air > 0 && race.started) stats.err.push(Math.hypot(then.x - m.x, then.y - m.y));
    pred = clone(m); pred.prevLat = pred.lat;
    W = {
      t: race.time, started: race.started, cd: race.countdown, goT: race.goT || null, boxes: race.boxes.map(b => ({ ...b })), bits: race.bits && race.bits.slice(), loose: (race.loose || []).slice(),
      gate: race.gate && { ...race.gate }, crab: race.crab && race.crab.map(z => ({ ...z, strikes: z.strikes.map(k => ({ ...k, hit: { ...k.hit } })) })),
      ghosts: race.cars.filter(o => o !== m).map(o => ({ car: o, T: o.T, s: o.s, lat: o.lat, x: o.x, y: o.y, heading: o.heading, speed: o.speed, W: o.W, L: o.L, progress: o.progress, finished: o.finished, off: o.off, stall: o.stall, stallBy: o.stallBy === m ? pred : o.stallBy, squished: o.squished, squishedBy: o.squishedBy === m ? pred : o.squishedBy })),
    };
    // a tow beam (items/pull.js) holds the kart it's on: ours, or the one we're towing (as its shape here, so the beam
    // letting go of it touches our copy only)
    if (pred.pullTarget) pred.pullTarget = W.ghosts.find(o => o.car === pred.pullTarget) || pred.pullTarget;
    if (at !== null && at < tau && !away(m)) {
      const sh = world(); stats.resims++;
      refire(sh, -Infinity, at);   // fired before that moment, but the host hadn't used it yet
      // the host is on a moment we no longer have (or never stepped): bridge it with the gas it was using
      let gap = (hist.length ? hist[0].t0 : tau) - at;
      while (gap > 1e-5) { const d = Math.min(gap, 1 / 60); step(sh, (m.gas ? 1 : 0) | (m.dHeld ? 2 : 0), d); gap -= d; }
      for (const e of hist) {
        const end = e.t0 + e.dt; if (end <= at) continue;
        const d = end - Math.max(e.t0, at); if (d > 1e-5) step(sh, e.g, d);
        refire(sh, Math.max(e.t0, at), end);
        e.st = keep(pred);
      }
      hist = hist.filter(e => e.t0 + e.dt > at - 0.1);
    } else if (pend.length && !away(m)) refire(world(), -Infinity, Infinity);   // (no moment to start from: fire them now)
    if (hist.length > 240) hist = hist.slice(-240);
    if (followed || away(m)) return;   // it's drawn like the others for now: the switch back eases across (ownFrame)
    if (was) { corr.x += was.x - pred.x; corr.y += was.y - pred.y; corr.h = angle(corr.h + was.h - pred.heading); }
    const hit = stunned(m) || (then && then.air !== m.air > 0);   // knocked about, or a jump we called differently: go with the host
    if (hit || Math.hypot(corr.x, corr.y) > SNAP) { if (Math.hypot(corr.x, corr.y) > 1) { stats.snaps++; if (hit) stats.stunSnaps++; } corr = { x: 0, y: 0, h: 0 }; }
  };
  const ownFrame = (m, dt) => {
    const drive = pred && !away(m), p0 = drive && { x: pred.x, y: pred.y }, last = shown;
    if (drive) {
      try {
        const sh = world(); step(sh, ctl.g, dt);
        // ITEM pressed since the last frame: fire it here, now (after this frame's step, where the host's race fires too)
        for (; done < ctl.f; done++) {
          if (done + 1 <= ackU) continue;
          const k = useLocal(liveWorld(m), true);
          if (k) { pend.push({ u: done + 1, t: tau + dt, k }); shownUse.set(done + 1, k); stats.used++; }
        }
        hist.push({ t0: tau, dt, g: ctl.g, st: keep(pred) });
      } catch (e) { stats.broke = e; pred = null; predict = false; console.warn('kernel kart: prediction off', e); }
    } else done = ctl.f;
    tau += dt;
    // (and while our copy has gone into a moon's orbit or the lava before the host's race has: that can't be told apart
    // to the moment, and the orbit's too quick to ease between two guesses at it)
    const follow = !pred || away(m) || lost(pred), from = follow ? { x: m.x, y: m.y } : p0;
    const base = follow ? { x: m.x, y: m.y, h: m.heading } : { x: pred.x, y: pred.y, h: pred.heading };
    if (follow !== followed && shown) {   // from drawing it like the others to driving it here (or back): ease across
      corr = { x: shown.x - base.x, y: shown.y - base.y, h: angle(shown.h - base.h) };
      if (Math.hypot(corr.x, corr.y) > SNAP) corr = { x: 0, y: 0, h: 0 };
    }
    followed = follow;
    const k = Math.exp(-EASE * dt), cm = Math.hypot(corr.x, corr.y), cut = cm > 1e-9 ? 1 - Math.min(cm * (1 - k), FIX_V * dt) / cm : 0;
    corr.x *= cut; corr.y *= cut; corr.h *= k;
    if (!follow) for (const f of SHOW) m[f] = pred[f];
    m.x = base.x + corr.x; m.y = base.y + corr.y; m.heading = base.h + corr.h;
    shown = { x: m.x, y: m.y, h: m.heading };
    // how far the drawn kart moved off its own motion this frame (what a correction or a switch adds): the test's "jumps"
    stats.jump = last ? Math.hypot(shown.x - last.x - (base.x - from.x), shown.y - last.y - (base.y - from.y)) : 0;
    // the item slot empties as soon as you fire; the host's own state of it (and the item itself) follow
    if (hostMe) Object.assign(m, slotAfter(ctl.f));
    else if (pred && !follow) { m.item = pred.item; m.item2 = pred.item2; m.charges = pred.charges; }
  };

  // the countdown runs on our prediction's clock, not the host's as it reaches us, so a rocket start is timed as
  // offline. hostStart: the host's countdown as last heard; shownStart: this screen's.
  let hostStart = null, shownStart = null;
  // the train's and the crab's own places as the host last sent them (race.train.head, race.crab[i].s): this screen
  // eases them between snapshots (race.update), so the race's own copy of them isn't the host's word
  const hostMv = { tr: null, cb: null };
  const startCues = () => {
    if (hostStart && !hostStart.started && pred && W && predict) { race.countdown = W.cd; race.started = W.started; }
    const cd = Math.ceil(race.countdown);
    if (shownStart) { if (!race.started && cd !== shownStart.cd && cd > 0 && cd <= 3) sfx.play('count'); if (!shownStart.started && race.started) sfx.play('go'); }
    shownStart = { cd, started: race.started };
  };

  const receive = s => {
    if (rid != null && s.rn != null && s.rn !== rid) { stats.otherRace = (stats.otherRace || 0) + 1; return; }   // (another race's, late)
    if (s.q && s.q <= gotQ) { stats.stale = (stats.stale || 0) + 1; return; }   // (one that came late: we've newer)
    if (hostStart) { race.countdown = hostStart.countdown; race.started = hostStart.started; }   // (not ours: startCues)
    const before = { countdown: race.countdown, started: race.started, winner: race.winner }, m0 = race.localHumans[0], me0 = m0 && { lap: m0.lap, finished: m0.finished };
    let base = null;
    if (!s.full) { base = s.b !== undefined ? states.get(s.b) : have; if (!base) { gapQ = s.q || gapQ; stats.nobase = (stats.nobase || 0) + 1; return; } }
    if (s.q) { gapQ = 0; gotQ = s.q; }
    const st = { race: { ...(base && base.race), ...s.race }, cars: s.cars.map((o, i) => ({ ...(base && base.cars[i]), ...o })) };
    // the race: whatever differs from what this screen has (by reference: a value nobody sent again is the same object)
    const changed = new Set();
    for (const k in st.race) if (!have || have.race[k] !== st.race[k]) { race[k] = C.dec(st.race[k]); changed.add(k); }
    if (s.q) { states.set(s.q, st); for (const k of states.keys()) { if (k < s.q - 64) states.delete(k); else break; } }
    have = st;
    hostStart = { countdown: race.countdown, started: race.started };
    if (changed.has('train')) hostMv.tr = race.train && race.train.on ? race.train.head : null;
    if (changed.has('crab')) hostMv.cb = race.crab ? race.crab.map(z => z.s) : null;
    st.cars.forEach((o, i) => { const c = race.cars[i]; if (c) for (const k in o) c[k] = C.dec(o[k]); });
    s.bx.forEach((t, i) => { if (race.boxes[i]) race.boxes[i].t = t; });
    s.gc.forEach((v, i) => { const g = race.gcs[i]; if (g) [g.lat, g.x, g.y, g.dir, g.ang] = v; });
    // what our own fires made, as the host tells it: not again if this screen showed it when we fired
    const mi = race.cars.indexOf(mine()), echo = e => { if (!e.iu || e.iu[1] !== mi) return false; const k = shownUse.get(e.iu[0]); return k === 'all' || (k === 'use' && e.iu[2] === 'use'); };
    s.pa.forEach((p, j) => { if (!seen(seenPa, s.pi && s.pi[j]) && !echo(p)) race.particles.push(C.dec(p)); });
    race.humans = race.cars.filter(c => c.human).sort((a, b) => a.pIndex - b.pIndex);
    race.localHumans = [mine()].filter(Boolean);
    for (const e of s.ev) {
      if (seen(seenEv, e.i) || echo(e)) continue;
      if (e.s) race.sound(e.s, e.c !== undefined ? race.cars[e.c] : { x: e.x, y: e.y }, e.v);
      else if (e.j !== undefined && race.cars[e.j]) race.jolt(race.cars[e.j], e.k);
      else if (e.fl !== undefined && race.cars[e.fl]) race.flashFor(race.cars[e.fl], e.f);
      else if (e.g) race.cue(e.g);
      else if (e.sa) race.shakeAll(e.sa);
    }
    cues(before, me0);
    const snap = { t: race.time, cars: race.cars.map(carPose), pr: byId(race.projectiles), cl: byId(race.clones), tr: hostMv.tr, cb: hostMv.cb };
    if (buf.length && snap.t < buf[buf.length - 1].t) { buf = []; rt = null; pred = null; hist = []; shown = null; corr = { x: 0, y: 0, h: 0 }; arr = []; off.clear(); }   // a new race in the same room
    // the draw delay from recent gaps and lateness: LATE_Q of them, not the worst (one 300 ms hiccup would hold everyone
    // half a second back; extrapolation covers it). Grows at once, shrinks slowly
    const w = now(); arr.push([w, snap.t]); while (arr.length > 2 && w - arr[0][0] > WIN) arr.shift();
    let lo = Infinity; for (const a of arr) lo = Math.min(lo, a[0] - a[1]);
    const late = arr.map(a => a[0] - a[1] - lo).sort((a, b) => a - b), ts = arr.map(a => a[1]).sort((a, b) => a - b), gaps = [SNAP_DT];
    for (let i = 1; i < ts.length; i++) gaps.push(ts[i] - ts[i - 1]);
    gaps.sort((a, b) => a - b);
    const q = (a, f) => a[Math.min(a.length - 1, Math.floor(f * a.length))];
    const want = clamp(q(gaps, LATE_Q) + q(late, LATE_Q), DELAY, MAX_DELAY);
    delay = want > delay ? want : delay + (want - delay) * (1 - Math.exp(-Math.max(0, w - (lastW ?? w)) / 2.5)); lastW = w;
    stats.delay = delay; stats.at = w;   // (net-link.js: how the link is doing)
    // were the others being carried on past the newest snapshot? This one shows where they really were: what that
    // guess was off by is eased out from here, not jumped
    const B0 = rt !== null && buf.length && rt > buf[buf.length - 1].t ? bracket(rt) : null;
    buf.push(snap); if (buf.length > 32) buf.shift();
    if (B0) {
      const B1 = bracket(rt);
      race.cars.forEach((c, i) => {
        const a = carAt(B0, i), b = carAt(B1, i); if (!a || !b || a.cut || b.cut) return;
        const o = off.get(i) || { x: 0, y: 0, h: 0 }; o.x += a.x - b.x; o.y += a.y - b.y; o.h = angle(o.h + a.h - b.h);
        if (Math.hypot(o.x, o.y) > 150) { o.x = 0; o.y = 0; o.h = 0; }
        off.set(i, o);
      });
    }
    recon = s;
  };
  // the two snapshots either side of a moment (or the newest two, and how far past the newest it is)
  const bracket = t => {
    let k = buf.length - 1; while (k > 0 && buf[k - 1].t > t) k--;
    const prev = buf[Math.max(0, k - 1)], cur = buf[k], span = cur.t - prev.t;
    return { prev, cur, span, f: span > 0 ? clamp((t - prev.t) / span, 0, 1) : 1, over: k === buf.length - 1 ? Math.min(Math.max(0, t - cur.t), EXTRAP) : 0 };
  };
  // a pose at that moment: eased between the two, or carried on from the newest at the speed and turn they showed
  const moveOn = (a, b, B) => {
    if (!(B.over > 0) || !(B.span > 0)) return null;
    const dh = angle(b.h - a.h), vx = (b.x - a.x) / B.span, vy = (b.y - a.y) / B.span, w = dh / B.span, u = B.over, r = w * u / 2, cs = Math.cos(r), sn = Math.sin(r);
    return { x: b.x + (vx * cs - vy * sn) * u, y: b.y + (vx * sn + vy * cs) * u, h: b.h + w * u };
  };
  const carAt = (B, i) => {
    const a = B.prev.cars[i], b = B.cur.cars[i]; if (!a || !b) return null;
    if (Math.hypot(b.x - a.x, b.y - a.y) > 400) return { x: b.x, y: b.y, h: b.h, cut: true };   // a jump (wormhole, a reset): no sliding across the map
    const on = moveOn(a, b, B); if (on) return on;
    const dh = angle(b.h - a.h), f = B.f;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, h: a.h + dh * f };
  };
  // every frame: our clock runs on its own, gently held DELAY behind the newest snapshot, and the karts are eased between
  // the two snapshots either side of it. Then our own kart: one step of its own, drawn now.
  race.update = function (dt) {
    poll();
    let leap = null;   // our own kart jumped after the moment the karts are drawn at (below)
    if (recon) {   // the newest snapshot (of however many came since the last frame): our own kart from the host's word
      const s1 = recon, m = race.localHumans[0]; recon = null;
      if (!m) { pred = null; hostMe = null; }
      else if (predict) { try { reconcile(s1, m); } catch (e) { stats.broke = e; pred = null; predict = false; console.warn('kernel kart: prediction off', e); } }
    }
    if (buf.length) {
      const newest = buf[buf.length - 1].t, target = newest - delay;
      if (rt === null || Math.abs(target - rt) > 0.5) rt = target;           // the start, or after a long stall: jump
      else { rt += dt; rt += clamp((target - rt) * 1.5, -WARP, WARP) * dt; }   // otherwise drift toward it, at most WARP off real time (a faster catch-up looked like a burst of speed)
      rt = Math.min(rt, newest + EXTRAP);   // (past the newest: carried on for a moment, then held)
      stats.past = rt > newest;
      const B = bracket(rt), { prev, cur, f } = B;
      this.time = Math.max(rt, 0);
      const me1 = race.localHumans[0], k = buf.indexOf(cur), ease = Math.exp(-OFF_EASE * dt);
      this.cars.forEach((c, i) => {
        const a = prev.cars[i], b = cur.cars[i]; if (!a || !b) return;
        const own = c === me1 && pred && !followed;   // (our own kart, driven here: what it shows is the prediction's, ownFrame)
        ANIM.forEach(([k, way], j) => { if (own && SHOWN.has(k)) return; const v = between(a.a[j], b.a[j], f, way); if (v !== undefined) c[k] = v; });
        if (!own && c.slot && typeof b.a[ANIM.length] === 'number') c.slot.t = between(a.a[ANIM.length], b.a[ANIM.length], f, -1);
        const p = carAt(B, i), o = off.get(i);
        c.x = p.x; c.y = p.y; c.heading = p.h;
        if (o) { if (p.cut || own) off.delete(i); else { o.x *= ease; o.y *= ease; o.h *= ease; c.x += o.x; c.y += o.y; c.heading += o.h; } }
      });
      for (const p of this.projectiles) {
        const a = prev.pr.get(p.nid), b = cur.pr.get(p.nid); if (!a || !b || Math.hypot(b.x - a.x, b.y - a.y) > 300) continue;
        const on = moveOn(a, b, B);
        if (on) { p.x = on.x; p.y = on.y; } else { p.x = a.x + (b.x - a.x) * f; p.y = a.y + (b.y - a.y) * f; }
      }
      for (const k of this.clones || []) {   // Thread clones too (items/thread.js)
        const a = prev.cl.get(k.nid), b = cur.cl.get(k.nid); if (!a || !b || Math.hypot(b.x - a.x, b.y - a.y) > 300) continue;
        k.x = a.x + (b.x - a.x) * f; k.y = a.y + (b.y - a.y) * f; k.heading = a.h + Math.atan2(Math.sin(b.h - a.h), Math.cos(b.h - a.h)) * f; k.eased = true;
      }
      // did our own kart jump (a Ctrl+Z, a reset) between that moment and the newest snapshot? Then our kart, drawn now,
      // is past the jump while the moment above isn't, and its clones didn't jump with it (items/thread.js): they keep
      // station as the newest snapshot has them, not as they were beside our kart before it jumped
      const mi = this.cars.indexOf(me1);
      if (mi >= 0) for (let j = Math.max(1, k); j < buf.length; j++) {
        const a = buf[j - 1].cars[mi], b = buf[j].cars[mi];
        if (a && b && Math.hypot(b.x - a.x, b.y - a.y) > 150 + 900 * (buf[j].t - buf[j - 1].t)) leap = { s: buf[buf.length - 1], i: mi };
      }
      // the world's other movers, at the same moment as the karts (not jumping on 20 times a second): the train
      // (race-hazards.js) and the crab (race-crab.js) eased between snapshots, the Garbage Collector bots worked out
      // from the clock as the host does (Race.updateHazards: they're a function of race time)
      if (this.train && this.train.on && prev.tr !== null && cur.tr !== null && Math.abs(cur.tr - prev.tr) < 400) this.train.head = prev.tr + (cur.tr - prev.tr) * f;
      if (this.crab && prev.cb && cur.cb) this.crab.forEach((z, i) => { const a = prev.cb[i], b = cur.cb[i]; if (a !== undefined && b !== undefined && Math.abs(b - a) < 400) z.s = a + (b - a) * f; });
      for (const g of this.gcs) {
        const lat = this.gcLat(g, this.time), was = this.gcLat(g, this.time - 0.02); if (Math.abs(lat - was) > 1e-3) g.dir = Math.sign(lat - was);
        const p = trackSample(this.track, g.s); g.lat = lat; g.x = p.x + p.nx * lat; g.y = p.y + p.ny * lat; g.ang = Math.atan2(p.ny * g.dir, p.nx * g.dir);
      }
    }
    const m = race.localHumans[0], m0 = m && { x: m.x, y: m.y };   // (m0: where it is in the host's race, drawn as everyone else is)
    if (m && predict) ownFrame(m, dt); else tau += dt;
    // our own Thread clones keep station beside our kart as it's drawn, now, not beside where the host's race had it
    // (a round trip and DELAY ago: most of a kart length behind at speed); after a jump of ours, where they are from it
    if (m) for (const k of this.clones || []) if (k.eased) {
      k.eased = false; if (k.owner !== m) continue;
      const a = leap && leap.s.cl.get(k.nid), b = leap && leap.s.cars[leap.i];
      if (a && b) { k.x = m.x + a.x - b.x; k.y = m.y + a.y - b.y; } else { k.x += m.x - m0.x; k.y += m.y - m0.y; }
    }
    startCues();
    updateParticles(this, dt);
  };
  return { receive, input: () => ({ ...poll(), q: gotQ, h: repeat(), ...(gapQ ? { r: gapQ } : {}), ...(rid != null ? { rn: rid } : {}) }), stats, get predicted() { return pred; }, get latest() { return buf[buf.length - 1] || null; } };
}
