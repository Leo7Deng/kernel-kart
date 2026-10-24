// Kernel Kart online: Fight mode in a LAN room (net.js runs the room, fight-ui.js the screen). DOM-free: test/fight-net.test.mjs
// runs a host and a player in Node over the real relay.
//
// Host-authoritative. The host runs the one real Fight (js/fight.js); the room's first two players (by slot) are its
// fighters, a lone player gets a bot. Everyone else in the room watches.
//   host -> all:  { k: 'fstart', rn, cfg, seats, names }   a fight begins: cfg is the Fight's (ids, bots, supers, seed,
//                                                         arena: the map's id, so the players build the same arena...),
//                                                         seats[i] the player id on fighter i (-1: a bot), names theirs
//                 { k: 'fsnap', rn, q, s, ev }            the fight, every SNAP_MS: s its plain state (snapOf), ev the
//                                                         events since the last one (the player's sounds and effects)
//   player -> host: { k: 'fin', rn, n, x, y, b }          a fighter's held input (b: the button bits, BITS), whenever it
//                                                         changes and every RESEND_MS anyway; n counts them
// The host plays each input change for at least one fixed step (a tap that came and went inside one frame of the host
// still lands). The player draws the other fighter and the world objects DELAY behind the host, eased between the two
// snapshots either side; its own fighter straight from the newest one.
import { Fight, FIXED } from './fight.js';
import { FIGHTERS, FIGHT_ORDER } from './fight-chars.js';
import { ARENAS, ARENA_ORDER } from './fight-arenas.js';

export const SNAP_MS = 50, RESEND_MS = 100, DELAY = 0.1;
export const BITS = ['light', 'heavy', 'special', 'guard'];
const QUEUE_MAX = 8;
const r2 = v => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- input on the wire
export function packInput(inp) {
  let b = 0; BITS.forEach((k, i) => { if (inp && inp[k]) b |= 1 << i; });
  return { x: r2(inp && +inp.x || 0), y: r2(inp && +inp.y || 0), b };
}
export function unpackInput(d) {
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
export function snapOf(F) {
  const s = { f: wire(F.f), objs: wire(F.objs), wins: [...F.wins], rounds: wire(F.rounds || []) };   // (rounds: the results' knock-outs)
  for (const k of SCALARS) s[k] = wire(F[k]);
  return s;
}
// lay a snapshot onto a Fight that's only drawn (never stepped)
export function applySnap(F, s) {
  for (const k of SCALARS) F[k] = s[k];
  F.wins = [...s.wins]; if (s.rounds) F.rounds = s.rounds.map(r => ({ ...r }));
  s.f.forEach((w, i) => { const f = F.f[i]; Object.assign(f, w); f.stats = FIGHTERS[f.id]; });
  F.objs = s.objs.map(o => ({ ...o }));
}
const lerp = (a, b, k) => a + (b - a) * k;
const lerpA = (a, b, k) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };

// ---------------------------------------------------------------- the room's fighters
// players: the room's ({ id, name, slot, fighter, kb }); cfg: the room's (fightBot, fightBotId, fightSupers, fightArena). The
// first two players by slot who can fight (kb: a keyboard or a gamepad; touch-only players watch) fight; a lone one gets a
// bot (cfg.fightBot, Normal if unset; its fighter cfg.fightBotId, the host's pick). Returns the Fight's cfg (less its seed:
// ids, bots, supers, arena) and the seats. Only FIGHT_ORDER's fighters (the pickable ones) are seated; anyone else's pick falls back
export function fightSeats(players, cfg = {}) {
  const ids = FIGHT_ORDER, ppl = players.filter(p => p.kb !== false).sort((a, b) => a.slot - b.slot).slice(0, 2);
  const seats = [ppl[0] ? ppl[0].id : -1, ppl[1] ? ppl[1].id : -1];
  const pick = (p, i) => p ? (ids.includes(p.fighter) ? p.fighter : ids[i % ids.length]) : ids.includes(cfg.fightBotId) ? cfg.fightBotId : ids[i % ids.length];   // (a bot: the host's pick for it)
  const fids = [pick(ppl[0], 0), pick(ppl[1], 1)];
  const lv = [0, 1, 2].includes(cfg.fightBot) ? cfg.fightBot : 1;
  const arena = cfg.fightArena === 'random' ? ARENA_ORDER[Math.floor(Math.random() * ARENA_ORDER.length)] : ARENAS[cfg.fightArena] ? cfg.fightArena : undefined;   // (Random: drawn per fight, a room choice, not the fight's luck)
  return { ids: fids, bots: seats.map(id => id < 0 ? lv : null), supers: cfg.fightSupers !== false, arena, seats, names: [ppl[0] ? ppl[0].name : '', ppl[1] ? ppl[1].name : ''] };
}

// ---------------------------------------------------------------- the host
// cfg: the Fight's; o: { rn (the fight's number in the room), me (the host's own fighter, -1 if it watches), send(d) (to everyone) }
export class FightHost {
  constructor(cfg, o) {
    this.F = new Fight(cfg); this.rn = o.rn; this.me = o.me ?? -1; this.send = o.send;
    cfg.arena = this.F.cfg.arena;   // (the arena it settled on: the fstart sent with this same cfg carries it to the players)
    this.queue = [[], []]; this.lastN = [0, 0]; this.acc = 0; this.snapAcc = SNAP_MS / 1000; this.q = 0; this.ev = [];
  }
  // a player's input for fighter i (net.js: only from the player sitting there)
  input(i, d) {
    if (!d || d.rn !== this.rn || !(d.n > this.lastN[i])) return;
    this.lastN[i] = d.n;
    const Q = this.queue[i]; Q.push(unpackInput(d)); if (Q.length > QUEUE_MAX) Q.splice(0, Q.length - QUEUE_MAX);
  }
  // fighter i's player left: a bot takes over
  toBot(i, level = 1) { this.F.cfg.bots[i] = level; this.queue[i].length = 0; }
  // one screen frame: the host's own input (null: none), the fixed steps, and a snapshot every SNAP_MS
  frame(dt, local) {
    const F = this.F; F.events.length = 0;
    if (this.me >= 0 && local) F.setInput(this.me, local);
    dt = Math.min(0.25, Math.max(0, dt || 0));
    this.acc += dt;
    while (this.acc >= FIXED) {
      this.acc -= FIXED;
      for (let i = 0; i < 2; i++) if (i !== this.me && this.queue[i].length) F.setInput(i, this.queue[i].shift());
      F.step();
    }
    this.ev.push(...F.events.map(wire));
    this.snapAcc += dt;
    if (this.snapAcc >= SNAP_MS / 1000) { this.snapAcc = 0; this.flush(); }
  }
  flush() { this.send({ k: 'fsnap', rn: this.rn, q: ++this.q, s: snapOf(this.F), ev: this.ev }); this.ev = []; }
}

// ---------------------------------------------------------------- a player (or a watcher: me -1)
// cfg: the host's fstart cfg; o: { rn, me, send(d) (to the host) }
export class FightClient {
  constructor(cfg, o) {
    this.F = new Fight(cfg); this.rn = o.rn; this.me = o.me ?? -1; this.send = o.send;
    this.F.events = [];
    this.snaps = []; this.lastQ = 0; this.clock = 0; this.n = 0; this.sent = ''; this.sentAt = -1; this.ev = [];
  }
  receive(d) {
    if (!d || d.rn !== this.rn || !(d.q > this.lastQ) || !d.s) return false;
    this.lastQ = d.q;
    this.snaps.push({ at: this.clock, s: d.s }); if (this.snaps.length > 8) this.snaps.shift();
    if (Array.isArray(d.ev)) this.ev.push(...d.ev);
    return true;
  }
  // one screen frame: our input to the host (if we fight), then the view: the events that came, the newest state for us,
  // the rest eased DELAY behind
  frame(dt, local) {
    dt = Math.min(0.25, Math.max(0, dt || 0)); this.clock += dt;
    if (this.me >= 0) {
      const p = packInput(local), key = p.x + ',' + p.y + ',' + p.b;
      if (key !== this.sent || this.clock - this.sentAt >= RESEND_MS / 1000) { this.send({ k: 'fin', rn: this.rn, n: ++this.n, ...p }); this.sent = key; this.sentAt = this.clock; }
    }
    const F = this.F; F.events = this.ev; this.ev = [];
    const S = this.snaps; if (!S.length) return;
    const newest = S[S.length - 1], hostNow = newest.s.time + (this.clock - newest.at), t = hostNow - DELAY;
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
    // our own fighter and the round's clock and phase: from the newest
    if (this.me >= 0) { Object.assign(F.f[this.me], newest.s.f[this.me]); F.f[this.me].stats = FIGHTERS[F.f[this.me].id]; }
    for (const k2 of ['phase', 'clock', 'rim', 'dmgMul', 'round', 'pt', 'winner', 'roundWinner']) F[k2] = newest.s[k2];
    F.wins = [...newest.s.wins];
  }
}
