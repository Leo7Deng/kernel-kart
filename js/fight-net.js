// @ts-check
// Kernel Kart online: Fight mode in a LAN room (net.js runs the room, fight-ui.js the screen). DOM-free: test/fight-net.test.mjs
// runs a host and a player in Node over the real relay, and over a simulated laggy link.
//
// Host-authoritative. The host runs the one real Fight (js/fight.js); the room's first two players (by slot) are its
// fighters, a lone player gets a bot. Everyone else in the room watches.
//   host -> all:  { k: 'fstart', rn, cfg, seats, names }   a fight begins: cfg is the Fight's (ids, bots, supers, seed,
//                                                         arena: the map's id, so the players build the same arena...),
//                                                         seats[i] the player id on fighter i (-1: a bot), names theirs
//                 { k: 'fsnap', rn, q, s, ev, ack }       the fight, every SNAP_MS: s its plain state (snapOf), ev the
//                                                         events of the last EV_KEEP s (each numbered: shown once, a lost
//                                                         snapshot loses none), ack[i] [n, steps]: the remote fighter i's
//                                                         input n has been played for that many fixed steps
//   player -> host: { k: 'fin', rn, n, x, y, b, h }       a fighter's held input (b: the button bits, BITS), whenever it
//                                                         changes (n counts the changes) and every RESEND_MS anyway (the
//                                                         same n); h: the REPEAT changes before it [n, x, y, b], so a
//                                                         lost one (a tap!) still gets there
// Over the room's WebRTC DataChannel when it's up (net.js), else the WebSocket.
// The host plays each input change for at least one fixed step (a tap that came and went inside one frame of the host
// still lands). The player draws the other fighter and the world objects DELAY behind the host, eased between the two
// snapshots either side. Its own fighter is predicted: this screen runs its own copy of the fight from the
// host's newest snapshot on, with our own input step by step as we pressed it (the host's ack says which of our steps
// that snapshot is after), so walking, turning, a move's wind-up and an evade start the frame you press. Hits, damage
// and the round's outcome stay the host's: our health, meter and wins are the host's, the foe is the host's, and
// whatever the host says happened to us (a hit, a knockdown, a freeze) replaces our guess at once. Where the guess was
// off otherwise, the difference is eased out (corr), so nothing jumps.
import { Math } from './detmath.js';
import { Fight, FIXED, matchCfg } from './fight.js';
import { FIGHTERS, FIGHT_PICK } from './fight-chars.js';
import { ARENAS, ARENA_ORDER } from './fight-arenas.js';

export const SNAP_MS = 50, RESEND_MS = 100, DELAY = 0.1;
export const BITS = ['light', 'heavy', 'special', 'guard'];
const QUEUE_MAX = 8;
const REPEAT = 4;          // each input repeats the changes before it
// a player's own move starting: shown on its screen as it presses, from its prediction; the host's copy (sent with the
// fight time it happened at) is dropped there when it matches one already shown, and shown late when the prediction
// never had it (a move started the step before a hit landed on us, our copy already having us hit)
const OWN_EV = new Set(['tell', 'step', 'charge']);
const OWN_MATCH = 0.3;     // (s: a host's own event and ours this close in fight time, same kind and move, are the same one)
const EV_KEEP = 0.3;       // each snapshot carries the events of this long (s), so one lost on a lossy line is in the next
const r2 = v => Math.round(v * 100) / 100;

// ---- the shapes on the wire (npm run typecheck)
/** A fighter's held input on the wire: the stick to 2 decimals, the four keys as bits (BITS' order).
 * @typedef {{ x: number, y: number, b: number }} PackedInput */
/** A fight snapshot (snapOf; inside the host's { k: 'fsnap' }): the fighters (without stats) and objects as plain data,
 * wins, rounds, the luck (rs), the objects' count (oid), the last hit's answer, each fighter's input, and SCALARS.
 * @typedef {{ f: Record<string, any>[], objs: import('./fight.js').WorldObj[], wins: number[], rounds: any[], rs: number[],
 *   oid: number, lastRes: string | null, inp: PackedInput[], [k: string]: any }} FightSnap */
/** FightHost / FightClient's o: rn the fight's number in the room, me the fighter this screen plays (-1 watching),
 * send(d) to the host or everyone, predict (FightClient: false turns off the prediction).
 * @typedef {{ rn?: number, me?: number, send: (d: any) => any, predict?: boolean }} FightNetOpts */

// ---------------------------------------------------------------- input on the wire
/** @param {Partial<import('./fight.js').FightInput>} inp @returns {PackedInput} */
export function packInput(inp) {
  let b = 0; BITS.forEach((k, i) => { if (inp && inp[k]) b |= 1 << i; });
  return { x: r2(inp && +inp.x || 0), y: r2(inp && +inp.y || 0), b };
}
/** @param {PackedInput} d @returns {import('./fight.js').FightInput} */
export function unpackInput(d) {
  /** @type {any} */
  const o = { x: +d.x || 0, y: +d.y || 0 };
  BITS.forEach((k, i) => { o[k] = !!(d.b & 1 << i); });
  return o;
}

// ---------------------------------------------------------------- the state on the wire
// numbers to 2 decimals (plenty for drawing), the fighters without their stats (the player has fight-chars.js too)
function wire(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? r2(v) : 0;
  if (Array.isArray(v)) return v.map(wire);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) if (k !== 'stats') o[k] = wire(v[k]); return o; }
  return v;
}
const SCALARS = ['phase', 'round', 'clock', 'rim', 'dmgMul', 'hitstop', 'time', 'pt', 'rt', 'roundWinner', 'winner'];
// (and for a player's own copy of the fight to go on from it: the fight's luck (rs), the objects' count (oid), the last
// hit's answer (lastRes) and the input each fighter had (inp, packed))
/** @param {import('./fight.js').Fight} F @returns {FightSnap} */
export function snapOf(F) {
  /** @type {FightSnap} */
  const s = { f: wire(F.f), objs: wire(F.objs), wins: [...F.wins], rounds: wire(F.rounds || []), rs: [...F.rs], oid: F.oid, lastRes: F.lastRes ?? null, inp: F.inp.map(packInput) };   // (rounds: the results' knock-outs)
  for (const k of SCALARS) s[k] = wire(F[k]);
  return s;
}
// lay a snapshot onto a Fight that's only drawn (never stepped)
/** @param {import('./fight.js').Fight} F @param {FightSnap} s */
export function applySnap(F, s) {
  for (const k of SCALARS) F[k] = s[k];
  F.wins = [...s.wins]; if (s.rounds) F.rounds = s.rounds.map(r => ({ ...r }));
  s.f.forEach((w, i) => { const f = F.f[i]; Object.assign(f, w); f.stats = FIGHTERS[f.id]; });
  F.objs = s.objs.map(o => ({ ...o }));
}
// a snapshot laid onto a Fight that's stepped on from it (the player's own copy): its own copies of every list in it
function loadSnap(F, s) {
  const c = JSON.parse(JSON.stringify(s));
  applySnap(F, c);
  F.rs = c.rs ? [...c.rs] : F.rs; F.oid = c.oid ?? F.oid; F.lastRes = c.lastRes ?? undefined; F.events = [];
  if (c.inp) c.inp.forEach((p, i) => { F.setInput(i, unpackInput(p)); Object.assign(F.prev[i], F.inp[i]); });
}
const lerp = (a, b, k) => a + (b - a) * k;
const lerpA = (a, b, k) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };

// ---------------------------------------------------------------- the room's fighters
// players: the room's ({ id, name, slot, fighter, kb }); cfg: the room's (fightBot, fightBotId, fightSupers, fightArena,
// fightRounds: first to 1/2/3/5 rounds won, fightTime: a round's seconds; fight.js matchCfg). The
// first two players by slot who can fight (kb; an old client may still say no) fight; a lone one gets a
// bot (cfg.fightBot, Normal if unset; its fighter cfg.fightBotId, the host's pick). Returns the Fight's cfg (less its seed:
// ids, bots, supers, arena, bestOf, roundTime) and the seats. Only FIGHT_PICK's fighters (the pickable ones) are seated; anyone else's pick falls back
/** @param {import('./net.js').RoomPlayer[]} players @param {import('./net-room.js').RoomCfg} [cfg]
 * @returns {import('./fight.js').FightConfig & { seats: number[] }} */
export function fightSeats(players, cfg = {}) {
  const ids = FIGHT_PICK, ppl = players.filter(p => p.kb !== false).sort((a, b) => a.slot - b.slot).slice(0, 2);
  const seats = [ppl[0] ? ppl[0].id : -1, ppl[1] ? ppl[1].id : -1];
  const pick = (p, i) => p ? (ids.includes(p.fighter) ? p.fighter : ids[i % ids.length]) : ids.includes(cfg.fightBotId) ? cfg.fightBotId : ids[i % ids.length];   // (a bot: the host's pick for it)
  const fids = [pick(ppl[0], 0), pick(ppl[1], 1)];
  const lv = [0, 1, 2].includes(cfg.fightBot) ? cfg.fightBot : 1;
  const arena = cfg.fightArena === 'random' ? ARENA_ORDER[Math.floor(Math.random() * ARENA_ORDER.length)] : ARENAS[cfg.fightArena] ? cfg.fightArena : undefined;   // (Random: drawn per fight, a room choice, not the fight's luck)
  return { ids: fids, bots: seats.map(id => id < 0 ? lv : null), supers: cfg.fightSupers !== false, arena, ...matchCfg(cfg.fightRounds, cfg.fightTime), seats, names: [ppl[0] ? ppl[0].name : '', ppl[1] ? ppl[1].name : ''] };
}

// ---------------------------------------------------------------- the host
// cfg: the Fight's; o: { rn (the fight's number in the room), me (the host's own fighter, -1 if it watches), send(d) (to everyone) }
export class FightHost {
  /** @param {import('./fight.js').FightConfig} cfg @param {FightNetOpts} o */
  constructor(cfg, o) {
    this.F = new Fight(cfg); this.rn = o.rn; this.me = o.me ?? -1; this.send = o.send;
    cfg.arena = this.F.cfg.arena;   // (the arena it settled on: the fstart sent with this same cfg carries it to the players)
    this.queue = [[], []]; this.lastN = [0, 0]; this.cur = [null, null]; this.acc = 0; this.snapAcc = SNAP_MS / 1000; this.q = 0; this.ev = []; this.evN = 0;
  }
  // a player's input for fighter i (net.js: only from the player sitting there): the changes we haven't had yet, in order
  // (the ones it repeats first: one that was lost on the way), each to be played for at least one step
  input(i, d) {
    if (!d || d.rn !== this.rn || !(d.n > this.lastN[i])) return;
    const Q = this.queue[i];
    if (Array.isArray(d.h)) for (const e of d.h) if (Array.isArray(e) && e[0] > this.lastN[i] && e[0] < d.n) { this.lastN[i] = e[0]; Q.push({ n: e[0], inp: unpackInput({ x: e[1], y: e[2], b: e[3] }) }); }
    this.lastN[i] = d.n; Q.push({ n: d.n, inp: unpackInput(d) });
    if (Q.length > QUEUE_MAX) Q.splice(0, Q.length - QUEUE_MAX);
  }
  // fighter i's player left: a bot takes over; seat(i): a player sits there again (a rejoin), their input counted from 1
  toBot(i, level = 1) { this.F.cfg.bots[i] = level; this.queue[i].length = 0; this.cur[i] = null; }
  seat(i) { this.F.cfg.bots[i] = null; this.queue[i].length = 0; this.lastN[i] = 0; this.cur[i] = null; this.F.setInput(i, {}); }
  // one screen frame: the host's own input (null: none), the fixed steps, and a snapshot every SNAP_MS
  frame(dt, local) {
    const F = this.F; F.events.length = 0;
    if (this.me >= 0 && local) F.setInput(this.me, local);
    dt = Math.min(0.25, Math.max(0, dt || 0));
    this.acc += dt;
    while (this.acc >= FIXED) {
      this.acc -= FIXED;
      for (let i = 0; i < 2; i++) if (i !== this.me && this.queue[i].length) { const e = this.queue[i].shift(); F.setInput(i, e.inp); this.cur[i] = { n: e.n, age: 0 }; }
      F.step();
      for (const c of this.cur) if (c) c.age++;
    }
    const now = F.time;
    for (const e of F.events) this.ev.push({ ...wire(e), id: ++this.evN, at: now });
    this.snapAcc += dt;
    if (this.snapAcc >= SNAP_MS / 1000) { this.snapAcc = 0; this.flush(); }
  }
  flush() {
    const now = this.F.time; this.ev = this.ev.filter(e => now - e.at <= EV_KEEP);
    this.send({ k: 'fsnap', rn: this.rn, q: ++this.q, s: snapOf(this.F), ev: this.ev.map(({ at, ...e }) => OWN_EV.has(e.kind) ? { ...e, at: r2(at) } : e), ack: this.cur.map(c => c ? [c.n, c.age] : null) });
  }
}

// ---------------------------------------------------------------- a player (or a watcher: me -1)
// cfg: the host's fstart cfg; o: { rn, me, send(d) (to the host), predict (false: our own fighter drawn from the host's
// newest snapshot: the test compares) }
const LIVE = new Set(['fight', 'sudden']);
// the host's word on us goes at once (no easing toward it): hit, knocked about, frozen, held, out
const TAKEN = new Set(['hurt', 'stagger', 'down', 'getup', 'ko', 'dizzy', 'float', 'frozen', 'grabbed', 'win']);
const SNAP_D = 60;          // a correction bigger than this (world units) is a jump, not something to ease out
const EASE = 14;            // a correction is eased out at this rate (per second: ~90% gone in 170 ms)...
const FIX_V = 260;          // ...never faster than this (units a second)
const MAX_REPLAY = 90;      // a snapshot more steps behind us than this (a long stall): just take the host's word
export class FightClient {
  /** @param {import('./fight.js').FightConfig} cfg @param {FightNetOpts} o */
  constructor(cfg, o) {
    this.F = new Fight(cfg); this.rn = o.rn; this.me = o.me ?? -1; this.send = o.send;
    this.F.events = [];
    this.snaps = []; this.lastQ = 0; this.clock = 0; this.n = 0; this.sent = ''; this.sentAt = -1; this.ev = []; this.seenEv = new Set();
    // the prediction: our own copy of the fight (no bots: the foe holds the input the host last had for it)
    this.predict = this.me >= 0 && o.predict !== false;
    this.P = this.predict ? new Fight({ ...cfg, bots: [null, null] }) : null; if (this.P) this.P.events = [];
    this.K = 0;                // our fixed steps so far
    this.acc = 0;
    this.hist = [];            // our last steps: { k, n, inp }
    this.queue = [];           // our input changes not yet stepped with (as the host's queue: each gets a step)
    this.curIn = { n: 0, inp: unpackInput({ x: 0, y: 0, b: 0 }) };
    this.firstK = new Map();   // input change n -> our first step with it
    this.recent = [];          // our last few changes [n, x, y, b]
    this.synced = false;       // P is on a host snapshot (else there's nothing to predict from yet)
    this.recon = null;         // the newest snapshot not yet reconciled with
    this.corr = { x: 0, y: 0, face: 0 }; this.shown = null; this.taken = false;
    this.stats = { err: [], resims: 0, steps: 0, snaps: 0, jump: 0, broke: null };
    this.shownOwn = []; this.hostOwn = [];   // our own events shown from the prediction / from the host, not matched yet
  }
  receive(d) {
    if (!d || d.rn !== this.rn || !(d.q > this.lastQ) || !d.s) return false;
    this.lastQ = d.q;
    this.snaps.push({ at: this.clock, s: d.s, ack: d.ack }); if (this.snaps.length > 8) this.snaps.shift();
    if (Array.isArray(d.ev)) for (const e of d.ev) {
      if (e.id != null) { if (this.seenEv.has(e.id)) continue; this.seenEv.add(e.id); if (this.seenEv.size > 600) { const keep = [...this.seenEv].slice(-300); this.seenEv = new Set(keep); } }
      const { id, at, ...ev } = e;
      if (this.predict && e.who === this.me && OWN_EV.has(e.kind)) {   // (shown here already as we pressed, unless our copy missed it)
        if (this.ownMatch(this.shownOwn, ev, at)) continue;
        this.hostOwn.push({ kind: ev.kind, move: ev.move, t: at ?? 0 });
      }
      this.ev.push(ev);
    }
    this.recon = this.snaps[this.snaps.length - 1];
    return true;
  }
  // our input: a new change gets the next n (and goes now), the same one goes again every RESEND_MS
  sendInput(local) {
    const p = packInput(local), key = p.x + ',' + p.y + ',' + p.b;
    if (key !== this.sent) {
      this.n++; this.queue.push({ n: this.n, inp: unpackInput(p) });
      this.send({ k: 'fin', rn: this.rn, n: this.n, ...p, h: this.recent.slice() });
      this.recent.push([this.n, p.x, p.y, p.b]); if (this.recent.length > REPEAT) this.recent.shift();
      this.sent = key; this.sentAt = this.clock;
    } else if (this.clock - this.sentAt >= RESEND_MS / 1000) { this.send({ k: 'fin', rn: this.rn, n: this.n, ...p, h: this.recent.slice(0, -1) }); this.sentAt = this.clock; }
  }
  // one fixed step of our input, as the host will play it: the next queued change (each gets a step), else the one we
  // have; and our copy of the fight stepped with it, while we predict
  stepOwn(run) {
    if (this.queue.length) { this.curIn = this.queue.shift(); this.firstK.set(this.curIn.n, this.K + 1); }
    this.K++; this.hist.push({ k: this.K, n: this.curIn.n, inp: this.curIn.inp, pos: null }); if (this.hist.length > MAX_REPLAY + 30) this.hist.shift();
    if (this.firstK.size > 64) for (const n of this.firstK.keys()) if (n < this.curIn.n - 40) this.firstK.delete(n);
    if (!run) return [];
    const P = this.P, me = this.me;
    P.setInput(me, this.curIn.inp); P.events = []; P.step(); this.stats.steps++;
    this.hist[this.hist.length - 1].pos = { x: P.f[me].x, y: P.f[me].y };
    return P.events;
  }
  // the host's newest snapshot: start our copy again from it, and step it on to now with the input we've had since
  reconcile(sn) {
    const P = this.P, me = this.me, a = sn.ack && sn.ack[me];
    const was = this.synced ? { ...P.f[me] } : null;
    loadSnap(P, sn.s);
    this.synced = true;
    const k0 = a && this.firstK.has(a[0]) ? this.firstK.get(a[0]) + a[1] - 1 : null;   // the snapshot is after our step k0
    if (k0 != null) {
      const then = this.hist.find(h => h.k === k0);
      if (then && then.pos && !TAKEN.has(sn.s.f[me].state)) this.stats.err.push(Math.hypot(then.pos.x - sn.s.f[me].x, then.pos.y - sn.s.f[me].y));
    }
    const back = k0 == null ? 0 : this.K - k0;
    if (k0 != null && back > 0 && back <= MAX_REPLAY && LIVE.has(sn.s.phase)) {
      this.stats.resims++;
      for (const h of this.hist) {   // our input step by step since
        if (h.k <= k0) continue;
        P.setInput(me, h.inp); P.events = []; P.step(); this.stats.steps++;
        h.pos = { x: P.f[me].x, y: P.f[me].y };
      }
    }
    if (was) {
      const f = P.f[me];
      // knocked about by the host (or by our own copy's guess at the foe's hit): the host's word, no easing
      this.taken = TAKEN.has(f.state) || TAKEN.has(was.state);
      if (this.taken) this.corr = { x: 0, y: 0, face: 0 };
      else {
        this.corr.x += was.x - f.x; this.corr.y += was.y - f.y; this.corr.face = lerpA(0, this.corr.face + (was.face - f.face), 1);
        if (Math.hypot(this.corr.x, this.corr.y) > SNAP_D) { this.corr = { x: 0, y: 0, face: 0 }; this.stats.snaps++; }
      }
    }
  }
  // one screen frame: our input to the host (if we fight) and its steps here, then the view: the events that came, the
  // foe and the world eased DELAY behind the host, our own fighter predicted (or from the newest snapshot)
  frame(dt, local) {
    dt = Math.min(0.25, Math.max(0, dt || 0)); this.clock += dt;
    const F = this.F; F.events = this.ev; this.ev = [];
    const S = this.snaps, newest = S[S.length - 1];
    let pos0 = null;
    if (this.me >= 0) {
      this.sendInput(local || {});
      const run = !!(this.predict && newest && LIVE.has(newest.s.phase));
      if (!run) this.synced = false;
      else if (this.recon || !this.synced) {
        try { this.reconcile(this.recon || newest); } catch (e) { this.off(e); }
      }
      this.recon = null;
      const go = run && this.predict;
      if (go) pos0 = { x: this.P.f[this.me].x, y: this.P.f[this.me].y };
      this.acc += dt;
      while (this.acc >= FIXED) {
        this.acc -= FIXED;
        let ev = []; try { ev = this.stepOwn(go && this.predict); } catch (e) { this.off(e); }
        for (const e of ev) if (e.who === this.me && OWN_EV.has(e.kind) && !this.ownMatch(this.hostOwn, e, this.P.time)) {   // (our move starting: its sound and effect now)
          F.events.push({ ...e }); this.shownOwn.push({ kind: e.kind, move: e.move, t: this.P.time });
        }
        if (this.P) { const keep = this.P.time - 2; this.shownOwn = this.shownOwn.filter(o => o.t >= keep); this.hostOwn = this.hostOwn.filter(o => o.t >= keep); }
      }
    }
    if (!newest) return;
    const hostNow = newest.s.time + (this.clock - newest.at), t = hostNow - DELAY;
    let a = S[0], b = newest;
    for (let k = S.length - 1; k > 0; k--) if (S[k - 1].s.time <= t) { a = S[k - 1]; b = S[k]; break; }
    const span = b.s.time - a.s.time, k = span > 0 ? Math.max(0, Math.min(1, (t - a.s.time) / span)) : 1;
    // the state as of b (discrete things: states, poses, health), positions eased from a
    applySnap(F, b.s);
    for (const f of F.f) {
      if (f.i === this.me) continue;
      const fa = a.s.f[f.i], fb = b.s.f[f.i];
      if (!fa || Math.hypot(fb.x - fa.x, fb.y - fa.y) > 120) continue;   // (a new round's spawn: no gliding across)
      f.x = lerp(fa.x, fb.x, k); f.y = lerp(fa.y, fb.y, k); f.z = lerp(fa.z, fb.z, k); f.face = lerpA(fa.face, fb.face, k);
    }
    for (const o of F.objs) {
      const oa = a.s.objs.find(x => x.id === o.id); if (!oa) continue;
      o.x = lerp(oa.x, o.x, k); o.y = lerp(oa.y, o.y, k); o.z = lerp(oa.z, o.z, k); o.r = lerp(oa.r, o.r, k);
      if (o.pz != null && oa.pz != null) { o.px = lerp(oa.px, o.px, k); o.py = lerp(oa.py, o.py, k); o.pz = lerp(oa.pz, o.pz, k); }   // (Duke's coffee pot in flight)
    }
    // the round's clock and phase: from the newest
    for (const k2 of ['phase', 'clock', 'rim', 'dmgMul', 'round', 'pt', 'winner', 'roundWinner']) F[k2] = newest.s[k2];
    F.wins = [...newest.s.wins];
    if (this.me < 0) return;
    const me = this.me, host = newest.s.f[me], f = F.f[me], last = this.shown;
    if (pos0 && this.predict && this.synced) {
      // our copy's fighter, but the host's health, meter and wins; where the last snapshot moved it, eased
      const p = this.P.f[me];
      Object.assign(f, JSON.parse(JSON.stringify({ ...p, stats: undefined })), { hp: host.hp, maxHp: host.maxHp, meter: host.meter, wins: host.wins }); f.stats = FIGHTERS[f.id];
      const c = this.corr, cm = Math.hypot(c.x, c.y), kk = Math.exp(-EASE * dt), cut = cm > 1e-9 ? 1 - Math.min(cm * (1 - kk), FIX_V * dt) / cm : 0;
      c.x *= cut; c.y *= cut; c.face *= kk;
      f.x = p.x + c.x; f.y = p.y + c.y; f.face = p.face + c.face;
      // how far the drawn fighter moved off its own motion this frame (a correction, a snap): the test's "jumps"
      this.stats.jump = last ? Math.hypot(f.x - last.x - (p.x - pos0.x), f.y - last.y - (p.y - pos0.y)) : 0;
    } else {   // a round's intro or end, prediction off: straight from the newest
      this.corr = { x: 0, y: 0, face: 0 };
      Object.assign(f, host); f.stats = FIGHTERS[f.id];
      this.stats.jump = 0;
    }
    this.shown = { x: f.x, y: f.y };
  }
  // one of our own events in the other list (same kind and move, close in fight time): taken out of it, true
  ownMatch(L, e, t) {
    const j = L.findIndex(o => o.kind === e.kind && (o.move ?? null) === (e.move ?? null) && Math.abs(o.t - (t ?? 0)) <= OWN_MATCH);
    if (j < 0) return false;
    L.splice(j, 1); return true;
  }
  off(e) { this.stats.broke = e; this.predict = false; this.synced = false; console.warn('kernel kart: fight prediction off', e); }
}
