// Kernel Kart: level-crossing trains.
import { CAR_L, CAR_W } from './core.js';
import { blockedByShield, untouchable } from './rules.js';


export function updateTrain(dt) {
  const tr = this.train, R = this.track.rail;
  if (!tr.on) {
    if (this.started) tr.t -= dt;
    if (tr.t <= 0) { tr.on = true; tr.dir = -tr.dir; tr.head = tr.dir > 0 ? -300 : R.len + 300; tr.horn = false; }
    return;
  }
  tr.head += tr.dir * tr.speed * dt;
  if ((tr.dir > 0 && tr.head - tr.len > R.len + 300) || (tr.dir < 0 && tr.head + tr.len < -300)) { tr.on = false; tr.t = R.rest[0] + this.rng() * (R.rest[1] - R.rest[0]); return; }
  if (!tr.horn && R.crossings.some(cr => this.crossingState(cr).warn)) {
    tr.horn = true; if (this.humans.length) this.cue('trainHorn');
  }
  const lo = Math.min(tr.head, tr.head - tr.dir * tr.len), hi = Math.max(tr.head, tr.head - tr.dir * tr.len);
  for (const c of this.cars) {
    if (c.finished || (c.trainCd || 0) > 0 || untouchable(c)) continue;
    const dx = c.x - R.ax, dy = c.y - R.ay, along = dx * R.ux + dy * R.uy, side = dx * R.uy - dy * R.ux;
    if (along > lo - CAR_W * 0.6 && along < hi + CAR_W * 0.6 && Math.abs(side) < 24 + CAR_L * 0.45) {
      c.trainCd = 1.6;
      c.skx += R.ux * tr.dir * 320; c.sky += R.uy * tr.dir * 320;
      if (blockedByShield(this, c)) c.speed *= 0.6;
      else { c.spinT = 1.6; c.speed = 0; c.hitCd = 2; this.fxHit(c, '#f2a516', 'train'); }
    }
  }
}
// when will the train block this crossing? { warn, from, to } in seconds from now (from <= 0 means it's on it now)
export function crossingState(cr) {
  const tr = this.train, R = this.track.rail, pad = (cr.span || 0) + CAR_W * 0.6 + 12;   // the whole width of the road, as the hit test sees a kart
  if (!tr) return { warn: false, from: 1e9, to: -1 };
  let head = tr.head, dir = tr.dir;
  if (!tr.on) { dir = -tr.dir; head = (dir > 0 ? -300 : R.len + 300) - dir * tr.speed * Math.max(tr.t, 0); }
  const from = ((cr.d - pad) - head) * dir / tr.speed, fromB = ((cr.d + pad) - head) * dir / tr.speed;
  const t0 = Math.min(from, fromB), t1 = Math.max(from, fromB) + tr.len / tr.speed;
  return { warn: t1 > 0 && t0 < 2.2, from: t0, to: t1 };
}
// a bot holding a boost: is a crossing within about two boosted seconds blocked or about to be? Then hold it.
export function trainShy(race, c) {
  const T = race.track; if (!T.rail || !race.train) return false;
  for (const cr of T.rail.crossings) {
    let ds = cr.s - c.s; if (!T.open && ds < 0) ds += T.L; if (ds < 0 || ds > c.top * 2.6) continue;
    const st = race.crossingState(cr); if (st.to > 0 && st.from < ds / Math.max(c.speed, 120) + 1) return true;
  }
  return false;
}
