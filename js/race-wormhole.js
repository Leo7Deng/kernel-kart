// Kernel Kart: wormholes. A pair of mouths on the road: drive into the entry while it's open and you come out of the
// exit further up the track at the same speed, skipping the road in between (a pointer: jump straight to the address).
// It opens and shuts on a fixed cycle that everyone can see. In its last moments it collapses, and a kart that dives
// in then is spat back out spinning (a segfault). Shut, the mouth is just paint and you take the long way.
// The throttle call: floor it to make the window, lift to arrive as it opens, or don't bother and go round.
import { clamp } from './core.js';
import { trackSample } from './geometry.js';
import { blockedByShield, untouchable } from './rules.js';
import { eta, nearestS } from './race-mechanics.js';


export function buildWormholes(T) {
  const sc = T.def.scale;
  return (T.def.wormholes || []).map(w => {
    const sA = nearestS(T, w.a[0] * sc, w.a[1] * sc), sB = nearestS(T, w.b[0] * sc, w.b[1] * sc);
    // roughly how long the long way takes (what waiting for the next opening is worth)
    let save = 0; for (let s = sA; s < sB; s += 8) { const k = Math.abs(T.curv[Math.floor(s / 2)]); save += 8 / Math.min(k < 1e-4 ? 1e4 : Math.sqrt(500 / k), 400); }
    return { sA, sB, A: trackSample(T, sA), B: trackSample(T, sB), period: w.period || 7, open: w.open || 2.8, close: w.close || 0.4, phase: w.phase || 0, save: save * 1.1 };
  });
}
// where a wormhole is in its cycle at race time t. open: safe to dive in; closing: collapsing (spat out); else shut
export function wormState(w, t) {
  const u = ((t + w.phase) % w.period + w.period) % w.period, safe = w.open - w.close;
  return { u, open: u < safe, closing: u >= safe && u < w.open, untilClose: safe - u, untilOpen: u < safe ? 0 : w.period - u };
}

// crossing an entry mouth this frame
export function wormholeCar(c, dt, prevS) {
  const T = c.T;
  for (const w of T.mech.wormholes) {
    const ds = w.sA - c.s;
    if (c.human && ds > 380 && ds < 1100 && c.wormWarn !== c.lap) { c.wormWarn = c.lap; this.feed('warn', 'worm', c, null, wormState(w, this.time).open ? 1 : 0); }
    if (!(prevS < w.sA && c.s >= w.sA) || c.air > 0 || Math.abs(c.lat) > w.A.hw + 10 || (c.oc > 0 && c.ocT)) continue;
    const st = wormState(w, this.time);
    if (st.open) {
      const A = trackSample(T, c.s), s2 = c.s + w.sB - w.sA, B = trackSample(T, s2);
      const rot = Math.atan2(B.ty, B.tx) - Math.atan2(A.ty, A.tx), cr = Math.cos(rot), sr = Math.sin(rot);
      this.fxRing(c.x, c.y, '#c77dff', 70, 0.45, 7);
      c.s = s2; c.lat = clamp(c.lat, -B.hw + c.W * 0.6, B.hw - c.W * 0.6);
      c.x = B.x + B.nx * c.lat; c.y = B.y + B.ny * c.lat; c.heading += rot;
      const kx = c.skx; c.skx = kx * cr - c.sky * sr; c.sky = kx * sr + c.sky * cr;
      c.prevLat = c.lat; c.lineS = c.lat; c.progress = this.progressOf(c);
      this.fxRing(c.x, c.y, '#5ef2ff', 80, 0.5, 7); this.fxStars(c.x, c.y, 8, '#e0aaff', 160, 0.5);
      this.sound('warp', c);
    } else if (st.closing && !untouchable(c) && c.hitCd <= 0) {
      c.hitCd = 1.2;
      if (blockedByShield(this, c)) { c.speed *= 0.7; continue; }
      c.spinT = 0.9; c.speed *= 0.35; this.fxHit(c, '#c77dff', 'panic'); this.feed('haz', 'worm', null, c);
    }
  }
}

// a bot's plan for a wormhole ahead: go for it, time it, or keep clear of it while it collapses
export function wormholeAI(c, skill, brake, plan) {
  for (const w of c.T.mech.wormholes) {
    const ds = w.sA - c.s; if (ds < 0 || ds > 1800) continue;
    const tN = eta(c, ds, skill), m = 0.12 + (1.1 - skill) * 1.2;   // a worse bot leaves itself more time
    const st = wormState(w, this.time + tN);
    if (st.open && st.untilClose > m) { plan.remap = { ds, to: w.sB }; continue; }   // we'll make it: look past the exit
    // the next safe moment to arrive: a little into the next opening
    const tOpen = tN + (st.open ? st.untilClose + w.close + (w.period - w.open) : st.untilOpen) + m * 0.6;
    const worth = 0.45 + (skill - 0.92) * 2;   // better bots wait for a bigger share of what it saves
    if (tOpen - tN < w.save * worth) { plan.caps.push({ ds: 0, v: Math.max(30, ds / tOpen) }); plan.remap = { ds, to: w.sB }; continue; }
    // not worth waiting: just don't arrive while it's collapsing
    if (st.open || st.closing) { const tShut = tN + (st.open ? st.untilClose : 0) + (w.open - Math.max(st.u, w.open - w.close)) + 0.15; plan.caps.push({ ds: 0, v: Math.max(30, ds / tShut) }); }
  }
}
