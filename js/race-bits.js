// Kernel Kart: bits. Little glowing chips lie on the road in short lines: tucked in at the apex of the slow corners
// (lift early and the line tightens onto them), at every other slow corner far out on the exit instead (stay on the gas
// through it and you run wide onto them, at the risk of the run-off; lift and you miss them), out on the exit of the fast sweepers (carry speed and you run wide
// over them, or off the road) and down the middle of the longest straight. Each one you hold makes your kart a touch
// quicker on top (BIT_TOP, up to BIT_CAP of them); a full kart drives over them and leaves them for the others.
// Any hit (a spin-out, an item, a melt-down, a moon, a squish) throws SPILL of yours out behind you, for whoever
// comes past. A picked-up bit comes back after BIT_BACK seconds; a thrown one fades after LOOSE_T.
//
// Where the lines go is worked out from the track's shape (cached per track, the same on every machine). The race
// keeps the rest as plain data, so an online snapshot carries it: race.bits (per spot: 0 = there, otherwise the race
// time it comes back), race.loose (thrown bits) and c.bits (how many a kart holds).
import { clamp } from './core.js';
import { curvAt, halfWAt, insideAt, projectToTrack, trackSample, wrapS } from './geometry.js';

export const BIT_TOP = 0.004;   // +0.4% top speed per bit held (0.6% let the leader pull away: margin over 2nd 2.06 -> 2.34 s over 160 races)
export const BIT_CAP = 10;      // at most this many
export const SPILL = 3;         // how many a hit throws out
export const BIT_BACK = 6;      // a picked-up bit comes back after this long
export const LOOSE_T = 10;      // a thrown bit lasts this long on the road
const FLY = 0.4;                // a thrown bit is in the air this long (nobody can take it meanwhile)
const OWN = 2;                  // ...and the kart that dropped it can't take it back for this long
const R_PICK = 9;
const OUT_AT = 40, OUT_LAT = 0.7;   // outside lines: just past the end of the sweeper, out where a kart carrying speed runs wide to
const FAR_AT = 20, FAR_LAT = 0.85;  // far lines: on the exit of a slow corner, right out by the edge

// ---------------------------------------------------------------- layout (from the track's shape)
const along = (T, a, b) => { const d = a - b; return T.open ? d : ((d % T.L) + T.L * 1.5) % T.L - T.L / 2; };
const ksm = (T, s) => { let k = 0; for (let d = -40; d <= 40; d += 10) k += curvAt(T, s + d); return k / 9; };
function layRoute(T) {
  const sEnd = T.open ? T.finishS - 200 : T.L, s0 = T.open ? 400 : 0;
  // keep clear of the things that already live on the road (ramps, gaps, pads, bridges, mechanics, the GC bots)
  const busy = [...T.jumps.map(j => [j.s - 200, j.s + 420]), ...T.gaps.map(g => [g.s0 - 300, g.s1 + 300]), ...T.pads.map(p => [p.s - 160, p.s + 160]),
    ...T.gc.map(g => [g.s - 200, g.s + 200]), ...T.bridges.flatMap(b => [[b.s0 - 40, b.s1 + 40], [b.sUnder - (b.s1 - b.s) - 40, b.sUnder + (b.s1 - b.s) + 40]]),
    ...(T.mech ? [...T.mech.avoid.map(s => [s - 260, s + 260]), ...[...T.mech.banks, ...T.mech.slag].map(z => [z.s0 - 150, z.s1 + 150])] : []),
    // a long split (geometry.js keepClear: three points round where you choose): not in its two lanes nor in the gore
    ...(T.keepClear || []).flatMap((s, k, a) => k % 3 ? [] : [[s - 600, a[k + 2] + 200]])];
  const free = s => !busy.some(([a, b]) => along(T, s, a) > 0 && along(T, s, b) < 0);
  // the corners: stretches bending more than a gentle arc, with their tightest point and how far they turn
  const corners = [], straights = [];
  let cur = null, run = null;
  for (let s = s0; s < sEnd; s += 8) {
    const k = ksm(T, s), ak = Math.abs(k);
    if (ak > 1 / 900) {
      if (!cur || Math.sign(k) !== cur.side) { if (cur) corners.push(cur); cur = { side: Math.sign(k), kMax: 0, apex: s, turn: 0, a: s }; }
      cur.turn += ak * 8; if (ak > cur.kMax) { cur.kMax = ak; cur.apex = s; } cur.b = s;
    } else if (cur) { corners.push(cur); cur = null; }
    if (ak < 1 / 2500) { if (!run) run = { a: s }; run.b = s; } else if (run) { straights.push(run); run = null; }
  }
  if (cur) corners.push(cur); if (run) straights.push(run);
  const lines = [];
  // inside of the slow corners (a lift and more): just before the apex to just after it, tucked in at the edge
  for (const c of corners) if (1 / c.kMax < 260 && c.turn > 0.6) lines.push({ kind: 'in', at: c.apex, side: c.side, sharp: c.kMax, exit: c.b });
  // outside of the fast sweepers (nearly flat): on the exit, out at the edge you run wide to when you carry speed
  for (const c of corners) if (1 / c.kMax >= 260 && 1 / c.kMax < 560 && c.turn > 0.6) lines.push({ kind: 'out', at: c.b + OUT_AT, side: c.side, sharp: c.kMax });
  // the longest straight: down the middle
  straights.sort((a, b) => (b.b - b.a) - (a.b - a.a));
  if (straights.length && straights[0].b - straights[0].a > 600) lines.push({ kind: 'mid', at: (straights[0].a + straights[0].b) / 2, side: 0, sharp: 0 });
  // not too many: a line every ~1800 units of lap at most, the slow corners first (tightest), then sweepers, spread round
  const want = Math.max(3, Math.round((sEnd - s0) / 1800)), picked = [];
  const order = [...lines.filter(l => l.kind === 'mid'), ...lines.filter(l => l.kind === 'out').sort((a, b) => b.sharp - a.sharp).slice(0, Math.ceil(want / 3)), ...lines.filter(l => l.kind === 'in').sort((a, b) => b.sharp - a.sharp)];
  for (const l of order) { if (picked.length >= want) break; if (!free(l.at) || picked.some(p => Math.abs(along(T, p.at, l.at)) < 700)) continue; picked.push(l); }
  // every other slow corner round the lap (by where it is, so the same on every machine) puts its bits far out on the
  // exit instead: worth a detour, not on the way
  picked.sort((a, b) => a.at - b.at);
  let nIn = 0;
  for (const l of picked) if (l.kind === 'in' && nIn++ % 2 && free(l.exit + FAR_AT)) { l.kind = 'far'; l.at = l.exit + FAR_AT; }
  // each line: three bits along the road (four on the straight)
  const spots = [];
  for (const l of picked) {
    const offs = l.kind === 'mid' ? [-60, -20, 20, 60] : l.kind === 'in' ? [-40, 0, 40] : l.kind === 'far' ? [-30, 10, 50] : [-50, 0, 50];
    for (const d of offs) {
      const s = wrapS(T, l.at + d), hw = halfWAt(T, s), edge = hw - 15;
      const lat = l.kind === 'mid' ? 0 : l.kind === 'in' ? l.side * edge * clamp(Math.abs(insideAt(T, s)), 0.75, 1) : -l.side * edge * (l.kind === 'far' ? FAR_LAT : OUT_LAT);
      const p = trackSample(T, s); spots.push({ s, lat, x: p.x + p.nx * lat, y: p.y + p.ny * lat, kind: l.kind });
    }
  }
  return spots;
}
// every route's lines; a bit on a stretch two routes share is one bit, and it knows where it sits on each route
const cache = new WeakMap();
export function bitSpots(race) {
  const key = race.routes[0]; if (cache.has(key)) return cache.get(key);
  const out = [];
  race.routes.forEach((R, ri) => {
    for (const b of layRoute(R)) {
      const same = out.find(o => Math.hypot(o.x - b.x, o.y - b.y) < 24);
      if (same) { same.on[ri] = { s: b.s, lat: b.lat }; continue; }
      out.push({ x: b.x, y: b.y, kind: b.kind, on: race.routes.map((_, k) => k === ri ? { s: b.s, lat: b.lat } : null) });
    }
  });
  for (const b of out) race.routes.forEach((R, ri) => {
    if (b.on[ri]) return;
    const src = b.on.find(Boolean), q = projectToTrack(R, b.x, b.y, src.s, 200), p = trackSample(R, q.s);
    if (Math.abs(q.lat) < halfWAt(R, q.s) && Math.hypot(p.x + p.nx * q.lat - b.x, p.y + p.ny * q.lat - b.y) < 6) b.on[ri] = { s: q.s, lat: q.lat };
  });
  cache.set(key, out);
  return out;
}

// does a kart's body touch the point (x, y)?
const touches = (c, x, y) => {
  const dx = x - c.x, dy = y - c.y; if (dx * dx + dy * dy > (c.L * 0.6 + R_PICK) ** 2) return false;
  const ch = Math.cos(c.heading), sh = Math.sin(c.heading);
  return Math.abs(dx * ch + dy * sh) < c.L / 2 + R_PICK && Math.abs(-dx * sh + dy * ch) < c.W / 2 + R_PICK;
};

export const bitRules = {
  // set up at the start of a race (from the constructor)
  bitsInit() { this.bits = bitSpots(this).map(() => 0); this.loose = []; },
  // one car, one frame, after it has moved: drive over a bit to take it
  bitsCar(c) {
    if (!this.started || c.finished || c.air > 0 || c.bits >= BIT_CAP || !this.bits) return;
    const spots = bitSpots(this), t = this.time;
    for (let i = 0; i < this.bits.length; i++) {
      if (this.bits[i] > t || c.bits >= BIT_CAP) continue;
      const b = spots[i]; if (!touches(c, b.x, b.y)) continue;
      this.bits[i] = t + BIT_BACK; this.gotBit(c, b.x, b.y);
    }
    for (let i = this.loose.length - 1; i >= 0; i--) {
      const o = this.loose[i], age = t - o.t0;
      if (age < FLY || (o.by === c && age < OWN) || c.bits >= BIT_CAP || !touches(c, o.x, o.y)) continue;
      this.loose.splice(i, 1); this.gotBit(c, o.x, o.y);
    }
  },
  gotBit(c, x, y) {
    c.bits++;
    this.fxSparks(x, y, 5, '#a7ffeb', 110); if (c.bits >= BIT_CAP) this.fxRing(c.x, c.y, '#64ffda', 46, 0.35, 4);
    this.sound(c.bits >= BIT_CAP ? 'bitFull' : 'bit', c, c.human ? 0.8 : 0.3);
  },
  // a hit: throw some of yours out behind you, across the road, for whoever comes past
  spillBits(c) {
    const n = Math.min(SPILL, c.bits || 0); if (!n || !this.loose) return;
    c.bits -= n;
    const T = c.T;
    for (let k = 0; k < n; k++) {
      let s = c.s - 30 - this.rng() * 110; if (T.open) s = Math.max(s, 0); s = wrapS(T, s);
      const edge = halfWAt(T, s) - 16, lat = clamp(c.lat + (this.rng() * 2 - 1) * edge, -edge, edge), p = trackSample(T, s);
      this.loose.push({ x: p.x + p.nx * lat, y: p.y + p.ny * lat, x0: c.x, y0: c.y, t0: this.time, by: c, R: T, s, lat });
    }
    this.sound('bitSpill', c, c.human ? 0.8 : 0.4);
  },
  // once a frame: thrown bits fade, picked-up spots that have come back settle to 0 (a smaller snapshot online)
  bitsUpdate() {
    if (!this.bits) return;
    const t = this.time;
    for (let i = 0; i < this.bits.length; i++) if (this.bits[i] && t - this.bits[i] > 0.5) this.bits[i] = 0;
    if (this.loose.length) this.loose = this.loose.filter(o => t - o.t0 < LOOSE_T);
  },
  // a bot's line: lean a little toward a bit just ahead that's near where it's going anyway (the better the bot, the
  // more), never across the road for it
  bitLine(c, tgt, hw) {
    if (c.bits >= BIT_CAP || !this.bits) return tgt;
    const T = c.T, ri = this.routes.indexOf(T), spots = bitSpots(this), t = this.time;
    let best = null, bd = hw * 0.55;
    const look = (s, lat) => { const ds = along(T, s, c.s); if (ds < 10 || ds > 240) return; const d = Math.abs(lat - tgt); if (d < bd) { bd = d; best = { lat, ds }; } };
    for (let i = 0; i < this.bits.length; i++) { if (this.bits[i] > t) continue; const on = spots[i].on[ri]; if (on) look(on.s, on.lat); }
    for (const o of this.loose) if (o.R === T && t - o.t0 > FLY - 0.3 && !(o.by === c && t - o.t0 < OWN)) look(o.s, o.lat);
    if (!best) return tgt;
    const w = clamp((c.ai.skill - 0.9) * 3, 0.05, 0.5) * clamp((240 - best.ds) / 140, 0, 1);
    return tgt + (best.lat - tgt) * w;
  },
};
// for the renderer: where a thrown bit is right now (in the air on its way out, then lying where it landed), and how high
export function loosePos(o, t) {
  const f = clamp((t - o.t0) / FLY, 0, 1);
  return { x: o.x0 + (o.x - o.x0) * f, y: o.y0 + (o.y - o.y0) * f, h: Math.sin(f * Math.PI) * 34, fade: clamp((LOOSE_T - (t - o.t0)) / 2, 0, 1) };
}
