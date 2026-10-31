// The volcano (`volcano`): a cone beside the road rumbles, then erupts 2-4 lava globs onto the road. Each glob's shape
// (globShape) is both the hazard and what's drawn, marked where it'll land for the ~2 s it falls. Under it as it lands,
// or into its molten middle after, you melt down and come back up a little way back at a standstill; the crust round it
// only drags you while hot. Most globs are aimed just ahead of a kart near the cone (humans more often). The call: lift
// and let it crust over (the line goes round the molten part once there's room), or floor it past first.
// Eruptions run on race.rng; since T.mech is shared, the live state is on the race (race.volc, bombs, puddles).
import { Math } from './detmath.js';   // deterministic maths, the same on every computer (detmath.js)
import { TAU, clamp, lerp } from './core.js';
import { halfWAt, projectToTrack, trackSample, wrapS } from './geometry.js';
import { blockedByShield, untouchable } from './rules.js';
import { eta, nearestS } from './race-mechanics.js';

export const HOLD = 0.45, HOT = 1.4, GONE = 0.3;  // a pool is all molten for HOLD s, then the molten middle shrinks (to nothing by HOT s,
                                            // but once it's down to GONE of its size, at CRUST s, it crusts right over)
export const CRUST = HOLD + (1 - GONE) * (HOT - HOLD);
export const COOL = 3.5, PUDDLE_LIFE = 5;    // the crust is cold by COOL s, gone at PUDDLE_LIFE
export const RUMBLE = 1.8;                  // how long it rumbles before it blows
export const SINK_T = 2.5;                    // how long a kart takes to melt down into the lava
const BACK = 360;                           // how far back you come up again
const N = 40;                               // points round a glob's outline
const AIMED = 0.65, AT_HUMAN = 0.6;          // how many globs are aimed at a kart, and of those how many at a human player
const SPACE = 1.15;                          // an eruption's globs land at least this × their sizes apart

export function buildVolcano(T) {
  const sc = T.def.scale;
  return (T.def.volcano || []).map(d => {
    const x = d.at[0] * sc, y = d.at[1] * sc, R = d.at[2] * sc, H = R * 0.75, rTop = R * 0.34, reach = (d.reach || 1000) * sc;
    // the road it can reach, nearest first: a random glob picks from the front of this list more often
    const near = []; for (let s = 0; s < T.L; s += 40) { const q = trackSample(T, s), dd = Math.hypot(q.x - x, q.y - y); if (dd < reach) near.push({ s, d: dd }); }
    near.sort((a, b) => a.d - b.d);
    const v = { x, y, R, H, rTop, reach, sNear: near.map(n => n.s), every: d.every || [8, 12], first: d.first || [4, 6], flight: d.flight || 2 };
    if (!T.def.noScatter) seatVolcano(T, v);   // (one route of a course: geometry.js seats it on the whole course instead)
    return v;
  });
}
// keep the scenery off the cone: clear the props under it and stand two small plain ones on its foot and summit, so the
// landmarks are placed clear of it too; the camera and ground bounds extend to the cone
export function seatVolcano(T, v) {
  const { x, y, R, H, rTop } = v;
  if (T.deco) {
    for (let i = T.deco.length - 1; i >= 0; i--) { const p = T.deco[i]; if (Math.hypot(p.x - x, p.y - (y - H * 0.5)) < R + H * 0.5 + p.r + 10) T.deco.splice(i, 1); }
    T.deco.push({ x, y, r: R * 0.9, v: 0.95 }, { x, y: y - H, r: rTop, v: 0.95 });
  }
  const B = T.bbox, x0 = Math.min(B.x, x - R - 60), y0 = Math.min(B.y, y - H - rTop - 60);
  Object.assign(B, { x: x0, y: y0, w: Math.max(B.x + B.w, x + R + 60) - x0, h: Math.max(B.y + B.h, y + R + 60) - y0 });
}

// ------------------------------------------------------------------------------------------------ a glob's shape
// From 16 race.rng numbers in 0..1: a radius for each of N directions from the impact point, measured from `dir` (the
// throw): a lumpy circle stretched along dir (more ahead: it splashes forward), two forward tendrils and one anywhere.
const globR0 = u => 42 + 20 * u[0];   // its size
function globShape(u, dir) {
  const R0 = globR0(u), E = 0.18 + 0.32 * u[1];
  const tend = [0, 1, 2].map(j => ({ a: j < 2 ? (u[10 + j * 2] - 0.5) * 2.4 : u[14] * TAU, len: (j < 2 ? 0.3 + 0.45 * u[11 + j * 2] : 0.2 + 0.3 * u[15]), w: 0.15 }));
  const rs = [], px = [], py = [];
  for (let i = 0; i < N; i++) {
    const a = i / N * TAU, ca = Math.cos(a);
    let r = 1 + 0.15 * (u[2] - 0.3) * Math.cos(2 * a + u[3] * TAU) + 0.12 * u[4] * Math.cos(3 * a + u[5] * TAU) + 0.09 * u[6] * Math.cos(4 * a + u[7] * TAU) + 0.07 * u[8] * Math.cos(5 * a + u[9] * TAU);
    r *= 1 + E * (ca > 0 ? 1 : 0.5) * ca * ca - 0.12 * E * (1 - ca * ca);
    for (const t of tend) { let d = a - t.a; d -= Math.round(d / TAU) * TAU; r += t.len * Math.exp(-(Math.pow(d / t.w, 2))); }
    rs.push(R0 * r); px.push(Math.cos(dir + a) * R0 * r); py.push(Math.sin(dir + a) * R0 * r);
  }
  // a few drops flung off past the tendrils' tips (only drawn: they don't count)
  const drips = tend.map((t, j) => ({ a: t.a + (j - 1) * 0.08, r: R0 * (1.25 + t.len) * (1.05 + 0.1 * j), size: 4 + 3 * t.len }));
  return { dir, rs, px, py, rMax: Math.max(...rs), R0, drips };
}
// how much of a glob is still molten at race time t: none before it lands, all of it for HOLD s, then shrinking to nothing by HOT
export const molten = (o, t) => { const a = t - o.tL, f = a < HOLD ? 1 : 1 - (a - HOLD) / (HOT - HOLD); return a < 0 || f < GONE ? 0 : f; };
// how hot the crust is at race time t: 1 just landed .. 0 cold
export const puddleHeat = (p, t) => { const a = t - p.tL; return a < HOLD ? 1 : clamp(1 - (a - HOLD) / (COOL - HOLD), 0, 1); };
// the outline at scale m, interpolated round the circle
function globR(o, a) {
  let f = ((a - o.dir) / TAU) % 1; if (f < 0) f += 1;
  const x = f * N, i = Math.floor(x) % N, w = x - Math.floor(x);
  return o.rs[i] * (1 - w) + o.rs[(i + 1) % N] * w;
}
const inGlob = (o, x, y, m) => { const dx = x - o.x, dy = y - o.y, d2 = dx * dx + dy * dy, rm = o.rMax * m; return d2 < rm * rm && Math.sqrt(d2) < globR(o, Math.atan2(dy, dx)) * m; };
const BODY = [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
// the glob at scale m touching the car's body (an oriented box shrunk by k): body inside the outline or a tendril into the body
function onGlob(c, o, m, k = 1) {
  if (m <= 0) return false;
  const hl = c.L / 2 * k, hw = c.W / 2 * k, dx = o.x - c.x, dy = o.y - c.y;
  if (Math.hypot(dx, dy) > o.rMax * m + Math.hypot(hl, hw)) return false;
  const ch = Math.cos(c.heading), sh = Math.sin(c.heading);
  for (const [fx, fy] of BODY) if (inGlob(o, c.x + ch * fx * hl - sh * fy * hw, c.y + sh * fx * hl + ch * fy * hw, m)) return true;
  for (let i = 0; i < N; i++) { const rx = dx + o.px[i] * m, ry = dy + o.py[i] * m; if (Math.abs(rx * ch + ry * sh) < hl && Math.abs(-rx * sh + ry * ch) < hw) return true; }
  return false;
}
const along = (T, s, s0) => { let d = s - s0; if (d > T.L / 2) d -= T.L; if (d < -T.L / 2) d += T.L; return d; };
// where a glob sits on a road (s, lat, along ds0..ds1, across dl0..dl1), or null; on a course with forks each route has
// its own (o.on[k])
const on = (o, T) => o.on ? o.on[T.idx] : o;

// melting down: the same whether a glob landed on you or you drove into a molten pool (a Firewall soaks it up)
function melt(race, c, how) {
  c.hitCd = 1.5;
  if (blockedByShield(race, c)) { c.speed *= 0.6; c.hitCd = 2; return; }
  c.lavaT = SINK_T; c.lavaS = c.s; c.lavaBy = how; c.speed = 0; c.skx = c.sky = 0; c.spinT = 0; c.trick = false;
  race.fxHit(c, '#ff6d00', 'lava');
}

// once a frame (from the race's hazards): rumble, erupt, globs landing, pools crusting over
export function volcanoUpdate(dt) {
  const T = this.track, list = T.mech.volcano;
  if (!list.length || !this.started || this.calm) return;   // (calm, a time trial: it never erupts)
  const rng = this.rng;
  const V = this.volc || (this.volc = list.map(v => ({ v, next: this.time + lerp(v.first[0], v.first[1], rng()), last: -99, rumbled: false, n: 0 })));
  const bombs = this.bombs || (this.bombs = []), puddles = this.puddles || (this.puddles = []);
  for (const st of V) {
    const v = st.v;
    if (!st.rumbled && this.time > st.next - RUMBLE) { st.rumbled = true; this.sound('rumble', v, 0.9); }
    if (this.time < st.next) continue;
    // erupt: two to four globs, each from the same 21 draws so the stream stays in step
    const u = rng(), n = u < 0.4 ? 2 : u < 0.85 ? 3 : 4, placed = [];
    for (let k = 0; k < n; k++) {
      const aimed = rng() < AIMED, pick = rng(), jit = rng(), latU = rng(), fl = rng(), shape = []; for (let j = 0; j < 16; j++) shape.push(rng());
      const flight = v.flight * (0.95 + fl * 0.15), t0 = this.time + k * 0.25;
      // aimed: at a kart within reach (a human player more often), where it would be about when the glob comes down
      const ahead = c => c.s + Math.max(c.speed, 150) * flight * (0.75 + jit * 0.5);
      const live = this.cars.filter(c => !c.finished && !(c.lavaT > 0) && Math.hypot(trackSample(c.T, ahead(c)).x - v.x, trackSample(c.T, ahead(c)).y - v.y) < v.reach);
      const hum = live.filter(c => c.human);
      let s, lat, R = T;   // R: the road it's aimed at (on a course, the target's route)
      if (aimed && live.length) {
        const c = hum.length && pick < AT_HUMAN ? hum[Math.floor(pick / AT_HUMAN * hum.length)] : live[Math.floor(pick * live.length)];
        s = ahead(c); lat = c.lat + (latU - 0.5) * 70; R = c.T;
      }
      else if (v.spots) { const sp = v.spots[Math.floor(Math.pow(pick, 1.3) * v.spots.length)]; R = this.routes[sp.k]; s = sp.s + (jit - 0.5) * 60; lat = (latU * 2 - 1) * R.halfW; }   // (a course: any road it reaches)
      else { s = v.sNear[Math.floor(Math.pow(pick, 1.3) * v.sNear.length)] + (jit - 0.5) * 60; lat = (latU * 2 - 1) * T.halfW; }   // anywhere it reaches, mostly near the cone
      // clear of this eruption's other globs (about road-wide each): one that would land on another slides along the road
      // until they only just touch, always the same way so it can't bounce between two
      const R0 = globR0(shape); let q, x, y, way = 0;
      for (let it = 0; ; it++) {
        s = wrapS(R, s); const hw = halfWAt(R, s); lat = clamp(lat, -hw + 16, hw - 16);
        q = trackSample(R, s); x = q.x + q.nx * lat; y = q.y + q.ny * lat;
        const o = it < 8 && placed.find(p => Math.hypot(p.x - x, p.y - y) < (p.R0 + R0) * SPACE);
        if (!o) break;
        const al = (x - o.x) * q.tx + (y - o.y) * q.ty;
        way = way || (Math.abs(al) > 8 ? Math.sign(al) : jit < 0.5 ? -1 : 1);
        s += way * ((o.R0 + R0) * SPACE + 6) - al;
      }
      placed.push({ x, y, R0 });
      const g = globShape(shape, Math.atan2(y - (v.y - v.H), x - v.x));
      // its reach along the road and across it (for the bots, and for where you come back up)
      const reachOn = (R, s, lat) => {
        let ds0 = 0, ds1 = 0, dl0 = 0, dl1 = 0;
        for (let i = 0; i < N; i++) { const pr = projectToTrack(R, x + g.px[i], y + g.py[i], s, 100), a = along(R, pr.s, s), l = pr.lat - lat; ds0 = Math.min(ds0, a); ds1 = Math.max(ds1, a); dl0 = Math.min(dl0, l); dl1 = Math.max(dl1, l); }
        return { s, lat, ds0, ds1, dl0, dl1 };
      };
      const b = { id: ++st.n * 4 + k, v, x, y, t0, tL: t0 + flight, seen: {}, ...reachOn(R, s, lat), ...g };
      // a course: where it is on every road it touches (it may well be on the other road too, where they share it)
      if (this.routes.length > 1) b.on = this.routes.map(Q => { if (Q === R) return reachOn(R, s, lat); const pr = projectToTrack(Q, x, y, nearestS(Q, x, y), 4); return Math.abs(pr.lat) < halfWAt(Q, pr.s) + g.rMax ? reachOn(Q, pr.s, pr.lat) : null; });
      bombs.push(b);
    }
    st.last = this.time; st.next = this.time + lerp(v.every[0], v.every[1], rng()); st.rumbled = false;
    this.sound('erupt', v); this.fxBoom(v.x, v.y - v.H, 1.6); this.fxSparks(v.x, v.y - v.H, 16, '#ffb300', 260);
    if (this.humans.length) this.feed('warn', 'lava', null);   // everyone's screen
  }
  // globs landing: whoever's under one melts down into it, and it stays on the road as a molten pool
  for (const b of bombs) {
    if (this.time < b.tL) continue;
    b.done = true;
    for (const c of this.cars) if (!c.finished && !(c.air > 0) && !(c.lavaT > 0) && !(c.hitCd > 0) && !untouchable(c) && onGlob(c, b, 1)) melt(this, c, 'bomb');
    b.seen = {}; puddles.push(b);
    this.fxRing(b.x, b.y, '#ff9100', b.rMax * 1.2, 0.45, 8); this.fxDrops(b.x, b.y, 18, '#ff6d00', 220, 5); this.fxSparks(b.x, b.y, 14, '#ffd166', 240);
    for (let k = 0; k < 4; k++) this.fxPuff(b.x + (k - 1.5) * 22, b.y, '#4e3b36', 20, 1, (k - 1.5) * 30, -24);
    this.sound('lavaLand', b);
  }
  if (bombs.some(b => b.done)) this.bombs = bombs.filter(b => !b.done);
  if (puddles.length && this.time - puddles[0].tL > PUDDLE_LIFE) this.puddles = puddles.filter(p => this.time - p.tL <= PUDDLE_LIFE);
}

// sinking into the lava: replaces the car's own update, so nothing moves, times or hits it. Then it comes back up a
// little way back (clear of molten lava and falling globs) at a standstill
export function lavaSink(c, dt) {
  c.lavaT -= dt; c.speed = 0;
  if (Math.floor(this.time * 12) % 3 === 0) this.fxPuff(c.x + Math.sin(this.time * 7) * 14, c.y, '#4e3b36', 12, 0.8, 0, -40);
  if (c.lavaT > 0) return;
  const T = c.T; let s = c.lavaS - Math.min(BACK, Math.max(0, c.lavaS - 20));   // (never back over the line)
  const lava = [...(this.puddles || []), ...(this.bombs || [])];
  const hot = (s2, lat) => lava.some(o => { const g = on(o, T); return g && (this.time < o.tL || molten(o, this.time + 1.5) > 0) && along(T, s2, g.s) > g.ds0 - c.L && along(T, s2, g.s) < g.ds1 + c.L && lat > g.lat + g.dl0 - c.W && lat < g.lat + g.dl1 + c.W; });
  let lat = clamp(c.lat, -halfWAt(T, s) + c.W, halfWAt(T, s) - c.W);
  for (let k = 0; k < 6 && hot(s, lat) && s > 140; k++) s -= 120;
  if (hot(s, lat)) lat = -lat;
  const q = trackSample(T, s);
  c.lavaT = 0; c.s = s; c.lat = c.prevLat = c.lineS = lat; c.x = q.x + q.nx * lat; c.y = q.y + q.ny * lat; c.heading = Math.atan2(q.ty, q.tx); c.spin = 0;
  c.speed = 0; c.skx = c.sky = 0; c.hitCd = 1.5; c.kCmd = 0; c.reach = 1; c.progress = this.progressOf(c);
  this.fxRing(c.x, c.y, '#ffd166', 60, 0.45, 5); this.sound('surface', c);
}

// one car: driving into the molten middle of a pool melts you down; the crust round it drags you (the hotter, the harder)
export function volcanoCar(c, dt) {
  if (!this.puddles || c.air > 0 || untouchable(c) || c.lavaT > 0) return;
  for (const p of this.puddles) {
    if (!(c.hitCd > 0) && onGlob(c, p, molten(p, this.time), 0.9)) { melt(this, c, 'pool'); return; }
    const h = puddleHeat(p, this.time);
    if (h <= 0.03 || !onGlob(c, p, 1, 0.8)) continue;
    if (c.speed > 150) c.speed -= (c.speed - 150) * 1.8 * h * dt;
    if (this.time - (c.scorchT || -9) > 1.2) this.sound('scorch', c);
    c.scorchT = this.time;
    if (Math.floor(this.time * 20) % 2) this.fxPuff(c.x - Math.cos(c.heading) * 24, c.y - Math.sin(c.heading) * 24, '#4e3b36', 10, 0.6);
  }
}

// what a glob will be when car c gets there at its current speed: how much is molten as it crosses (0: through before it
// lands, or crusted over), and the stretch of road it covers then
function crossing(race, c, o) {
  const g = on(o, c.T); if (!g) return null;
  const ds = along(c.T, g.s, c.s), v = Math.max(c.speed, 80);
  const dIn = ds + g.ds0 - c.L / 2, dOut = ds + g.ds1 + c.L / 2;
  if (dOut < 0) return null;
  const tIn = race.time + Math.max(0, dIn) / (v * 1.3), tOut = race.time + dOut / v;   // (it may get there sooner: speeding up)
  const m = tOut < o.tL ? 0 : molten(o, Math.max(tIn, o.tL)), pad = c.human ? 10 : 18;   // (a bot's line wanders a little)
  return { ds, dIn, dOut, m, lo: g.lat + m * g.dl0 - c.W / 2 - pad, hi: g.lat + m * g.dl1 + c.W / 2 + pad };
}

// the steering line goes round the molten part ahead (or a glob about to land, for a bot): on the side nearer the line if
// the kart fits, else the roomier side (and a bot slows)
export function volcanoLine(c, tgt) {
  if (!(this.puddles && this.puddles.length) && !(this.bombs && this.bombs.length)) return tgt;
  const T = c.T, edge = halfWAt(T, c.s) - c.W * 0.6;
  for (const o of c.human ? this.puddles || [] : [...(this.puddles || []), ...(this.bombs || [])]) {
    const a = crossing(this, c, o); if (!a || a.m <= 0.05 || a.dIn > 520) continue;
    if (tgt <= a.lo || tgt >= a.hi) continue;
    const okL = a.lo >= -edge, okR = a.hi <= edge;
    const side = okL && okR ? (tgt - a.lo < a.hi - tgt ? a.lo : a.hi) : okL ? a.lo : okR ? a.hi : (a.lo + edge > edge - a.hi ? a.lo : a.hi);
    tgt = lerp(tgt, clamp(side, -edge, edge), clamp(1.8 - Math.max(0, a.dIn) / 300, 0, 1) * (c.human ? 0.85 : 1));
  }
  return tgt;
}

// a bot and lava ahead: if its normal driving clears it before the glob lands, carry on flat out; if it arrives once
// there's a way round (or it's crusted), fine; else lift to arrive just after. With a way round it isn't on yet, ease off
// so the steering can get it there. Worse bots now and then miss one and leave less room when they don't
export function volcanoAI(c, skill, brake, plan) {
  if (!(this.bombs && this.bombs.length) && !(this.puddles && this.puddles.length)) return;
  const T = c.T, now = this.time;
  for (const o of [...(this.bombs || []), ...(this.puddles || [])]) {
    const g = on(o, T); if (!g || molten(o, Math.max(now, o.tL)) <= 0) continue;
    const ds = along(T, g.s, c.s), dIn = ds + g.ds0 - c.L / 2 - 6, dOut = ds + g.ds1 + c.L / 2 + 6;
    if (dOut < 0 || dIn > 1300 || dIn <= 0) continue;               // behind, far off, or already on it: keep going and hope
    if (Math.min(c.lat, c.lineS ?? c.lat) > g.lat + g.dl1 + c.W / 2 + 12 || Math.max(c.lat, c.lineS ?? c.lat) < g.lat + g.dl0 - c.W / 2 - 12) continue;   // well off to one side
    if (o.seen[c.idx] === undefined) o.seen[c.idx] = c.rng() < (now < o.tL ? clamp(0.78 + (skill - 0.92) * 2.5, 0.72, 0.98) : clamp(0.92 + (skill - 0.92), 0.9, 0.99));   // (a pool on the road is harder to miss)
    if (!o.seen[c.idx]) continue;
    const mg = 0.15 + (1.1 - skill) * 0.5;
    if (now < o.tL) {
      const tBeat = eta(c, dOut, skill) - (o.tL - now), stopD = c.speed * c.speed / (2 * (200 + 0.42 * c.speed));
      if (tBeat < -mg) continue;                                    // through before it lands
      if (stopD > dIn - 4 && tBeat < 0.35) continue;                // too late to stop short of it: a close call, so go for it
    }
    // when there's a way round: the molten middle shrunk enough to leave the kart room on one side
    const edge = halfWAt(T, g.s) - c.W * 0.6, need = c.W / 2 + 20;
    const mR = g.dl1 > 1 ? (edge - need - g.lat) / g.dl1 : 9, mL = g.dl0 < -1 ? (g.lat + edge - need) / -g.dl0 : 9, mStar = clamp(Math.max(mR, mL), 0, 1);
    const tSafe = o.tL + (mStar >= 1 ? 0 : HOLD + (1 - Math.max(mStar, GONE)) * (HOT - HOLD));   // (by CRUST at the latest)
    const tArr = eta(c, dIn, skill), stop = Math.max(0, dIn - 18 - (1.1 - skill) * 40), vStop = Math.sqrt(2 * 180 * stop);   // (planned on a lift from low speed, the weakest it gets)
    if (tArr > tSafe - now + mg) {
      // there's a way round by then, but not into it until the kart's on it: able to stop short meanwhile
      const a = crossing(this, c, o);
      if (a && a.m > 0.05 && Math.max(c.lat, c.lineS ?? c.lat) > a.lo && Math.min(c.lat, c.lineS ?? c.lat) < a.hi) plan.caps.push({ ds: 0, v: vStop + 10 * clamp(stop / 60, 0, 1) });
      continue;
    }
    // otherwise wait for it: no sooner than then, and able to stop well short of it meanwhile
    plan.caps.push({ ds: 0, v: Math.min(Math.max(20, dIn / (tSafe - now + mg) * 0.9), Math.sqrt(15 * 15 + 2 * 180 * stop) * clamp(stop / 20, 0, 1)) });
  }
}

// for whatever else bends a kart's line or fires it off (race.js, race-ai.js): lava on the way? A pool molten on arrival
// (or a glob about to land, for a bot) within `far` whose molten part covers the lane, easing from lat0 to lat1 by ds1
// ahead. lat0 null: any lane (a boost can't steer round it, an Overclock cuts straight across)
export function lavaAhead(race, c, far, lat0 = null, lat1 = lat0, ds1 = 1) {
  for (const o of c.human ? race.puddles || [] : [...(race.puddles || []), ...(race.bombs || [])]) {
    const a = crossing(race, c, o); if (!a || a.dIn > far) continue;
    if (lat0 === null) { if (molten(o, Math.max(race.time, o.tL)) > 0) return true; continue; }
    if (a.m <= 0.05) continue;
    const lat = lerp(lat0, lat1, clamp(a.ds / Math.max(ds1, 1), 0, 1));
    if (lat > a.lo && lat < a.hi) return true;
  }
  return false;
}
