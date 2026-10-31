// Kernel Kart: the line through a plain fork (Merge Bay: a sharp road peeling off a corner's inside). Once your line
// and kart are well past halfway toward the sharp road, the steering eases over to it (fkW 0..1), so you turn in along
// it in one arc instead of a jink at the commit point.
// Which road you get is unchanged: a shadow kart (forkShadow: same rules, without the sharp road's pull) runs from when
// the steering starts going over to the commit point, and checkForks goes by its position, so a given throttle gets the
// same road to the frame. fkSet (with hysteresis) is the road you're set for, for the dotted line and minimap.
// Mixed into Race.prototype. Car fields are plain numbers (online, prediction): fkK (fork, -1 none), fkS, fkSet, fkW,
// fkLine (line as an offset on the sharp road); shadow: fkSh, fkX, fkY, fkH, fkC, fkSs, fkLat, fkPS, fkOff.
import { Math } from './detmath.js';   // deterministic maths, the same on every computer (detmath.js)
import { STEP, TAU, clamp, lerp } from './core.js';
import { curvAt, projectToTrack, trackSample } from './geometry.js';

export const FORK_ZONE = 420;   // how far before the commit point it starts looking at the sharp road
const HYST = 4;                 // the dotted line changes its mind this far either side of halfway (no flicker)
const GUIDE_L = 60;             // ...judging where you'll be at the commit point: about this far ahead a kart is onto its line
const DEEP = [12, 22];          // the steering goes over as your line goes from this far past the halfway to this far...
const DEEP_CAR = [0, 10];       // ...and your kart from right on it to this far past (not while it's still out wide)
const EASE = 6;                 // how quickly it goes over (per second); back is at once, if you floor it and run wide

// the plain fork car c is coming up to (not a long split or logic gate: they have their own); a running shadow keeps
// its fork until it reaches the commit point
function forkNear(c) {
  const T = c.T; if (!T.forks || !T.forkS) return null;
  for (let k = 0; k < T.forks.length; k++) {
    const f = T.forks[k], fs = T.forkS[k]; if (!fs || f.split || f.gate || f.thicket) continue;
    const ds = fs.sLock - c.s;
    if (ds >= 0 && ds <= FORK_ZONE || (c.fkSh && c.fkK === k && c.fkSs < fs.sLock && ds > -200)) return { k, f, fs, ds };
  }
  return null;
}
// how far apart the two centrelines are at the commit point (halfway between them is where the choice falls)
const apartAt = new WeakMap();
function apart(T, alt, fs) {
  let o = apartAt.get(fs);
  if (o === undefined) { const p = trackSample(T, fs.sLock); o = Math.abs(projectToTrack(alt, p.x, p.y, fs.sAlt, 60).lat); apartAt.set(fs, o); }
  return o;
}
const clear = c => { c.fkK = -1; c.fkSet = false; c.fkW = 0; c.fkSh = false; };
const ramp = (v, [a, b]) => clamp((v - a) / (b - a), 0, 1);
const wrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

export const forkRules = {
  // kReq: the curvature the steering wants on this road (race.js). Returns what it wants now.
  forkSteer(c, kReq, dt) {
    const fk = forkNear(c);
    if (!fk) { if (c.fkK >= 0) clear(c); return kReq; }
    const T = c.T, alt = this.routes[fk.fs.alt], fs = fk.fs, fresh = c.fkK !== fk.k;
    if (fresh) c.fkSh = false;
    if (!c.fkSh) { c.fkX = c.x; c.fkY = c.y; c.fkH = c.heading; c.fkC = c.kCmd; c.fkSs = c.s; c.fkLat = c.lat; c.fkOff = c.off; }   // the shadow is the kart until the steering goes over
    const q = projectToTrack(alt, c.x, c.y, fresh ? fs.sAlt - fk.ds : c.fkS, 30), sA = q.s, latA = q.lat;
    c.fkK = fk.k; c.fkS = sA;
    // your line (lifting tucks it in) and your kart against the halfway between the two roads at the commit point
    const half = apart(T, alt, fs) / 2, past = c.lineS * fs.side - half;
    // set for: where the shadow will be at the commit point (drifting toward its line) is nearer the sharp road's middle
    const pred = c.fkLat + (c.lineS - c.fkLat) * (1 - Math.exp(-Math.max(0, fk.ds) / GUIDE_L)), pl = trackSample(T, fs.sLock);
    const qa = projectToTrack(alt, pl.x + pl.nx * pred, pl.y + pl.ny * pred, fs.sAlt, 40), margin = Math.abs(pred) - Math.abs(qa.lat);
    c.fkSet = !fresh && c.fkSet ? margin > -HYST : margin > HYST;
    const want = c.off || fk.ds < 0 ? 0 : ramp(past, DEEP) * ramp(c.lat * fs.side - half, DEEP_CAR), w0 = fresh ? 0 : c.fkW;
    c.fkW = want >= w0 ? w0 + (want - w0) * (1 - Math.exp(-EASE * dt)) : want;
    // the line this road gives you, as an offset on the sharp road (eased in, like any line)
    const mine = latA + (c.lineS - c.lat);
    c.fkLine = fresh || !w0 ? mine : c.fkLine + (mine - c.fkLine) * (1 - Math.exp(-4 * dt));
    if (c.fkW < 1e-3) { c.fkW = 0; return kReq; }
    c.fkSh = true;
    // the same steering as race.js, by the sharp road: its bend at your offset, its direction, the line
    const pv = clamp(c.speed * 0.17, 10, 60), rp = trackSample(alt, sA + 12);
    let kRoad = 0; for (let n = 1; n <= 4; n++) kRoad += curvAt(alt, sA + pv * n / 4) / 4;
    const eH = wrap(Math.atan2(rp.ty, rp.tx) - c.heading);
    const Lh = 60, kAlt = kRoad / Math.max(0.35, 1 - kRoad * latA) + (Math.abs(eH) > Math.PI / 2 ? Math.sign(eH) : Math.sin(eH)) * 2 / Lh + clamp(c.fkLine - latA, -Lh * 0.5, Lh * 0.5) * 2 / (Lh * Lh);
    return lerp(kReq, kAlt, c.fkW);
  },
  // the shadow's frame, right after the kart's move: race.js's steering and move, by this road alone, with this frame's
  // speed, line, grip and skid
  forkShadow(c, dt, kMax, lineLat) {
    const T = c.T, pv = clamp(c.speed * 0.17, 10, 60), rp = trackSample(T, c.fkSs + 12);
    let kRoad = 0; for (let q = 1; q <= 4; q++) kRoad += curvAt(T, c.fkSs + pv * q / 4) / 4;
    const eH = wrap(Math.atan2(rp.ty, rp.tx) - c.fkH), Lh = c.off ? 85 : 60;
    const kReq = kRoad / Math.max(0.35, 1 - kRoad * c.fkLat) + (Math.abs(eH) > Math.PI / 2 ? Math.sign(eH) : Math.sin(eH)) * 2 / Lh + clamp(lineLat - c.fkLat, -Lh * 0.5, Lh * 0.5) * 2 / (Lh * Lh);
    c.fkC += (clamp(kReq, -kMax, kMax) - c.fkC) * (1 - Math.exp(-12 * dt));
    if (c.frozen <= 0 && c.air <= 0 && !(c.oc > 0 && c.ocT)) c.fkH += clamp(c.fkC * c.speed, c.ff > 0 ? -14 : -5.5, c.ff > 0 ? 14 : 5.5) * dt;
    if (c.oc > 0 && c.ocT && c.frozen <= 0 && c.air <= 0 && c.spinT <= 0) c.fkH += wrap(Math.atan2(c.ocT.y - c.fkY, c.ocT.x - c.fkX) - c.fkH) * (1 - Math.exp(-7 * dt));
    else if ((c.boost > 0 || c.ff > 0) && !c.off && c.air <= 0 && c.frozen <= 0 && c.spinT <= 0) c.fkH += wrap(Math.atan2(rp.ty, rp.tx) + clamp((lineLat - c.fkLat) / 160, -0.3, 0.3) - c.fkH) * (1 - Math.exp(-(c.ff > 0 ? 12 : 2.5) * dt));
    c.fkX += (Math.cos(c.fkH) * c.speed + c.skx) * dt; c.fkY += (Math.sin(c.fkH) * c.speed + c.sky) * dt;
    if (c.frozen > 0) c.fkX += Math.sin(this.time * 20 + c.idx) * 2 * dt;
    c.fkPS = c.fkSs;
    const pr = projectToTrack(T, c.fkX, c.fkY, c.fkSs, Math.ceil(((c.speed * 3 + 200) * dt + 6) / STEP)); c.fkSs = pr.s; c.fkLat = pr.lat;
    const hw = trackSample(T, c.fkSs).hw, edge = hw - c.W * 0.35;
    c.fkOff = c.air <= 0 && c.ff <= 0 && Math.abs(c.fkLat) > edge && !(T.onAnyRoad && T.onAnyRoad(c.fkX, c.fkY, hw - c.W * 0.35));
  },
  // checkForks (race.js): has plain fork k's decision point been passed this frame, and where is the kart (or its shadow)?
  forkWhere(c, k, fs, prevS) {
    if (c.fkSh && c.fkK === k) return c.fkPS < fs.sLock && c.fkSs >= fs.sLock ? { x: c.fkX, y: c.fkY, lat: c.fkLat, off: c.fkOff } : null;
    return prevS < fs.sLock && c.s >= fs.sLock ? c : null;
  },
  // decided onto the sharp road (q: the kart's place on it): the line carries on from where the steering had it
  forkDone(c, q) { if (q && c.fkW > 0) c.lineS = lerp(q.lat, c.fkLine, c.fkW); clear(c); },
  // the road car c is set for at a plain fork coming up, for the dotted line ahead and the minimap (as Race.splitGuess)
  forkGuess(c, far) {
    const T = c.T; if (!T.forks || !T.forkS || this.track.splits) return null;
    for (let k = 0; k < T.forks.length; k++) {
      const f = T.forks[k], fs = T.forkS[k]; if (!fs || f.split || f.gate || f.thicket) continue;
      const ds = fs.sLock - c.s; if (ds < 0 || ds > far) continue;
      const alt = this.routes[fs.alt];
      return { fs, alt, route: c.fkK === k && c.fkSet ? alt : T };
    }
    return null;
  },
};
