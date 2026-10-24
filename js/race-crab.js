// Kernel Kart: the Borrow Checker, a giant crab that lives in the surf beside a stretch of road (the Crab's Reach on
// Crab Harbor). It scuttles sideways along the beach keeping pace with whoever's coming, and every so often it rears a
// claw over the road: the claw goes up, its shadow darkens on the road where it will come down (right across the
// road), and 1.3 s later it slams. Under it then, or driving into it while it's down, and you're swatted aside toward
// the land and lose most of your speed (no worse: a knock, not a wreck). From your second lap on it pinches: both claws,
// one aimed ahead of you and the other a little behind it, the back one coming down a moment later. So it's all
// throttle: on lap 1 beat the claw or lift and let it land; in a pincer lift when it rears and go as the first claw
// lands (lift too little and you meet the front claw, too much and the back one gets you).
// Its aim and its moods run on race.rng, so a race replays exactly. T.mech is shared by every race on the track, so
// where the crab is and what it's doing lives on the race (race.crab), as plain data.
import { clamp, lerp } from './core.js';
import { halfWAt, trackSample } from './geometry.js';
import { blockedByShield, untouchable } from './rules.js';
import { nearestS } from './race-mechanics.js';

export const WIND = 1.3;                    // from rearing a claw to the slam
export const DOWN = 0.5, LIFT = 0.4;        // how long the claw lies on the road, then how long it takes to lift off it
export const HURT = DOWN + LIFT * 0.35;     // how long after the slam it still swats a kart that drives into it
export const CLAW_LEN = 120;                // how much road a claw covers along the way (it spans the whole width)
export const PINCH = 200;                   // each claw sits this far along the road from the crab's middle
export const PINCER_LAG = 0.45;             // in a pincer, the back claw slams this long after the front one
const SCUTTLE = 560, IDLE = 260;            // how fast it can scuttle when it means it, and when it's just keeping pace
const SHOVE = 340, KEEP = 0.42, SPIN = 0.5; // the swat: sideways speed, the speed you keep, how long you spin
const AT_HUMAN = 0.6;                       // how often it goes for a human player when one's in reach

export function buildCrab(T) {
  const sc = T.def.scale, B = T.bbox, cx = B.x + B.w / 2, cy = B.y + B.h / 2;
  return (T.def.crab || []).map(d => {
    let s0 = nearestS(T, d.from[0] * sc, d.from[1] * sc), s1 = nearestS(T, d.to[0] * sc, d.to[1] * sc);
    if (s1 < s0) [s0, s1] = [s1, s0];
    const m = trackSample(T, (s0 + s1) / 2);
    const side = d.side || Math.sign((m.x - cx) * m.nx + (m.y - cy) * m.ny) || 1;   // the sea: the side facing away from the middle of the track
    const off = halfWAt(T, (s0 + s1) / 2) + (T.def.runoff || 46) + 125;            // where its body walks, from the road's centre
    // keep the scenery off its beach, and the camera and the ground out as far as its back legs
    if (T.deco) for (let i = T.deco.length - 1; i >= 0; i--) {
      const p = T.deco[i], pr = nearestS(T, p.x, p.y);
      if (pr < s0 - 400 || pr > s1 + 400) continue;
      const q = trackSample(T, pr), lat = (p.x - q.x) * q.nx + (p.y - q.y) * q.ny;
      if (lat * side > 0 && Math.abs(lat) < off + 260) T.deco.splice(i, 1);
    }
    for (let s = s0; s <= s1; s += 100) {
      const q = trackSample(T, s), x = q.x + q.nx * side * (off + 220), y = q.y + q.ny * side * (off + 220);
      const x0 = Math.min(B.x, x), y0 = Math.min(B.y, y);
      Object.assign(B, { x: x0, y: y0, w: Math.max(B.x + B.w, x) - x0, h: Math.max(B.y + B.h, y) - y0 });
    }
    return { s0, s1, side, off, every: d.every || [1.2, 2.4], home: (s0 + s1) / 2 };
  });
}
const along = (T, s, s0) => { let d = s - s0; if (d > T.L / 2) d -= T.L; if (d < -T.L / 2) d += T.L; return d; };
// where the crab's body is, in the world, with it at distance s along the road
export function crabSpot(T, z, s) { const q = trackSample(T, s); return { x: q.x + q.nx * z.side * z.off, y: q.y + q.ny * z.side * z.off, q }; }
// how high claw strike k is at race time t: 1 reared right up, 0 on the road (null: not part of this strike yet / done)
export function clawHeight(k, t) {
  const a = t - k.tS;
  if (a < -WIND) return null;
  if (a < -0.12) return Math.min(1, (a + WIND) / 0.35);                 // rearing up, then held high
  if (a < 0) return 1 - ((a + 0.12) / 0.12) ** 2;                        // the slam
  if (a < DOWN) return 0;
  if (a < DOWN + LIFT) return (a - DOWN) / LIFT;
  return null;
}

// the crab's state for this race: where it is, how fast it's going, its next attack and the strikes in progress
function crabState(race) {
  return race.crab || (race.crab = race.track.mech.crab.map(z => ({ s: z.home, v: 0, next: race.time + 1.5, strikes: [], n: 0, look: -1, goal: z.home })));
}

// once a frame: pick a target and rear up, scuttle into place, slam, lift, rest
export function crabUpdate(dt) {
  const T = this.track, list = T.mech.crab;
  if (!list.length || !this.started) return;
  const S = crabState(this), now = this.time;
  if (this.calm) return;   // (calm, a time trial: it sleeps at home on the beach, art/crab.js)
  list.forEach((z, i) => {
    const st = S[i];
    st.strikes = st.strikes.filter(k => now < k.tS + DOWN + LIFT);
    // slams: dust and a thud where each claw comes down
    for (const k of st.strikes) if (!k.slammed && now >= k.tS) {
      k.slammed = true;
      const q = trackSample(T, k.s);
      this.sound('clawSlam', q, 1);
      this.fxRing(q.x, q.y, '#fff1d0', q.hw * 1.3, 0.4, 7);
      for (let j = -2; j <= 2; j++) { const l = j * q.hw * 0.45; this.fxPuff(q.x + q.nx * l, q.y + q.ny * l, '#e8d5aa', 16, 0.7, q.tx * (j % 2 ? 60 : -60), q.ty * (j % 2 ? 60 : -60)); }
      this.fxShards(q.x, q.y, 8, ['#8d7f6a', '#5d5448', '#e8d5aa'], 180, 5);
      for (const h of this.humans) if (!h.finished && Math.hypot(h.x - q.x, h.y - q.y) < 700) this.jolt(h, 0.35);
    }
    // a new attack: when it's rested, at a kart coming its way (a human more often), where it'll be when the claw lands
    if (!st.strikes.length && now >= st.next) {
      const u = this.rng(), f = 0.6 + 0.55 * this.rng();   // (short of where you will be: floor it and beat it; long: lift)
      const aim = c => c.s + Math.max(c.speed, 150) * WIND * f;
      const live = this.cars.filter(c => !c.finished && c.T === T && !(c.lavaT > 0) && along(T, c.s, z.s0) > -900 && along(T, aim(c), z.s0) > 60 && along(T, aim(c), z.s1) < -60 && along(T, aim(c), c.s) > 0);
      if (!live.length) { st.next = now + 0.25; st.look = -1; }
      else {
        const hum = live.filter(c => c.human), c = hum.length && u < AT_HUMAN ? hum[Math.floor(u / AT_HUMAN * hum.length)] : live[Math.floor(u * live.length)];
        let sp = aim(c);
        const pincer = c.lap >= 2 && along(T, sp - 2 * PINCH, z.s0) > -80;
        // which claw, and where the body has to be: in a pincer the front claw at the aim, the back one behind it
        const claw = pincer ? 1 : (along(T, st.s, sp) > 0 ? -1 : 1);
        let body = sp - claw * PINCH;
        const reach = SCUTTLE * WIND * 0.8, mv = clamp(along(T, body, st.s), -reach, reach);   // it can only get so far in time
        const lo = along(T, z.s0, st.s), hi = along(T, z.s1, st.s), shift = clamp(st.s + mv, st.s + lo, st.s + hi) - body;
        body += shift; sp += shift;
        st.goal = body; st.look = c.idx; st.n++;
        st.strikes.push({ id: st.n * 2, s: sp, tS: now + WIND, claw, hit: {}, seen: {} });
        if (pincer) st.strikes.push({ id: st.n * 2 + 1, s: sp - 2 * PINCH, tS: now + WIND + PINCER_LAG, claw: -1, hit: {}, seen: {} });
        st.next = now + WIND + (pincer ? PINCER_LAG : 0) + DOWN + LIFT + lerp(z.every[0], z.every[1], this.rng());
        this.sound('crabRear', crabSpot(T, z, st.s), 1);
      }
    }
    // the body: during an attack it scuttles to where the claws need it; otherwise it keeps pace with the nearest kart
    // coming (or wanders home), sideways, the way crabs do
    let goal = st.goal, vMax = SCUTTLE, tLeft = 0.6;
    if (st.strikes.length) tLeft = Math.max(0.15, st.strikes[0].tS - now - 0.15);
    else {
      vMax = IDLE; goal = z.home; let best = 1e9;
      for (const c of this.cars) {
        if (c.finished || c.T !== T) continue;
        const d = along(T, z.s0, c.s); if (d > 900 || along(T, c.s, z.s1) > 0) continue;
        if (d < best) { best = d; goal = clamp(c.s + Math.max(c.speed, 150) * 1.4, z.s0, z.s1); st.look = c.idx; }
      }
      st.goal = goal;
    }
    const want = clamp(along(T, goal, st.s) / tLeft, -vMax, vMax);
    st.v += (want - st.v) * (1 - Math.exp(-7 * dt));
    st.s = clamp(st.s + st.v * dt, z.s0 - 60, z.s1 + 60);
  });
}

// one car: a claw coming down on it, or driven into while it's down, swats it toward land. And the warnings.
export function crabCar(c) {
  const T = c.T; if (T !== this.track || !T.mech.crab.length) return;
  const S = crabState(this), now = this.time;
  c.crabNear = false;
  T.mech.crab.forEach((z, i) => {
    const ds = along(T, z.s0, c.s);
    if (c.human && !this.calm && ds > 250 && ds < 1000 && c.crabWarn !== c.lap) { c.crabWarn = c.lap; this.feed('warn', 'crab', c); }
    for (const k of S[i].strikes) {
      const d = along(T, k.s, c.s);
      if (d > -CLAW_LEN && d < 900) c.crabNear = true;   // (no place to fire a boost: race-ai.js straightAhead)
      const a = now - k.tS;
      if (a < 0 || a > HURT || k.hit[c.idx] || c.finished || c.air > 0 || untouchable(c)) continue;
      if (Math.abs(d) > CLAW_LEN / 2 + c.L * 0.45) continue;
      k.hit[c.idx] = 1;
      if (blockedByShield(this, c)) { c.speed *= 0.75; continue; }
      const q = trackSample(T, c.s), out = -z.side;
      c.skx += q.nx * out * SHOVE; c.sky += q.ny * out * SHOVE; c.speed *= KEEP;
      c.spinT = Math.max(c.spinT, SPIN); c.squash = 1; c.hitCd = Math.max(c.hitCd, 1);
      this.fxHit(c, '#ff7043', 'claw');
    }
  });
}

// a bot and the claws: the fastest speed (up to what the corners allow) that keeps it out from under every claw that's
// rearing or down ahead: held all the way, or held until the first claw lands and then flat out (the way through a
// pincer). Like the presses (race-presses.js), but the claws only show where they'll land once the crab rears.
export function crabAI(c, skill, brake, allowed) {
  if (!this.crab || c.T !== this.track) return allowed;
  const T = c.T, now = this.time, half = CLAW_LEN / 2 + c.L * 0.45, near = [];
  for (const st of this.crab) for (const k of st.strikes) {
    const d = along(T, k.s, c.s);
    if (d < -half || d > 1500 || now > k.tS + HURT) continue;
    if (k.seen[c.idx] === undefined) k.seen[c.idx] = c.rng() < clamp(0.86 + (skill - 0.92) * 1.2, 0.82, 0.98);   // a worse bot misses one now and then
    if (!k.seen[c.idx]) continue;
    if (Math.abs(d) <= half && now >= k.tS) continue;    // under it already: nothing to be done
    near.push({ d, k });
  }
  if (!near.length) return allowed;
  const m = 0.06 + (1.1 - skill) * 0.5, top = Math.min(allowed, c.top * 1.1), tA = Math.min(...near.map(n => n.k.tS));
  const clear = (v1, v2) => {
    const h = 0.04, inT = near.map(() => null), outT = near.map(() => null);
    let s = 0, v = c.speed, t = now;
    const tEnd = Math.max(...near.map(n => n.k.tS)) + HURT + m + 0.25;
    while (t < tEnd) {
      const tgt = t < tA ? v1 : v2;
      v = v < tgt ? Math.min(tgt, v + c.acc * h) : Math.max(tgt, v - brake * h);
      s += v * h; t += h;
      near.forEach((n, j) => { if (inT[j] === null && s > n.d - half) inT[j] = t; if (outT[j] === null && s > n.d + half) outT[j] = t; });
      if (outT.every(x => x !== null)) break;
    }
    return near.every((n, j) => {
      if (inT[j] === null) return true;                                     // stopped short of it
      const a = n.k.tS - m, b = n.k.tS + HURT + m + 0.15;   // (more room after: holding a low speed it drifts a little over)
      return (outT[j] ?? Infinity) < a || inT[j] > b;
    });
  };
  for (let v = top; v > -12; v -= 12) {
    const v1 = Math.max(v, 0);
    if (clear(v1, v1) || clear(v1, top)) return Math.min(allowed, v1);
  }
  return allowed;   // nothing gets through clean from here: go for it
}
