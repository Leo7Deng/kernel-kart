// Rubber Duck: bouncy shot ahead.
import { Math } from '../detmath.js';
import { TAU, clamp, fchance, lerp } from '../core.js';
import { drawRubberDuck } from '../art/icons.js';
import { star } from '../art/paint.js';
import { halfWAt, trackSample } from '../geometry.js';
import { Projectile, hitsCar } from '../race.js';
import { blockedByShield, phased } from '../rules.js';
import { hitClone } from './thread.js';

// Flight: SPEED along the road, zigzagging edge to edge; the kart's aim sets the side (×AIM_GAIN), clamped to
// VLAT_MIN..VLAT_MAX so it always visibly crosses the road and a car ahead can react.
const SPEED = 640, AIM_GAIN = 2, VLAT_MIN = 200, VLAT_MAX = 400;
// hit radius, and the drawn icon to match
const R = 9, ICON = 13.5;
// where and how a duck fired by c right now would start: { s, lat, vs, vlat, back }
function launch(c) {
  // fired forwards where you're pointing; in 1st there's nobody ahead to hit, so it goes out the back instead
  const p = trackSample(c.T, c.s); let a = c.heading - Math.atan2(p.ty, p.tx); while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU;
  const back = c.rank === 1, side = (back ? -1 : 1) * (Math.sign(a) || -Math.sign(c.lat) || 1);
  return { s: c.s + (back ? -50 : 40), lat: c.lat, vs: back ? -SPEED : SPEED, vlat: side * clamp(Math.abs(Math.sin(a)) * SPEED * AIM_GAIN, VLAT_MIN, VLAT_MAX), back };
}
// one step of flight for anything with { s, lat, vs, vlat }: returns 'gone' (off the end of an open course), 'bounce' or nothing
function fly(T, d, dt) {
  d.s += (d.vs || SPEED) * dt;
  if (d.s >= T.L || d.s < 0) { if (T.open) return 'gone'; d.s = ((d.s % T.L) + T.L) % T.L; }
  d.lat += d.vlat * dt;
  const lim = halfWAt(T, d.s) - R; if (Math.abs(d.lat) > lim) { d.lat = Math.sign(d.lat) * lim; d.vlat = -d.vlat; return 'bounce'; }
}

export default {
  id: 'duck', name: 'Rubber Duck', col: '#f5b300',
  short: 'bouncy shot ahead',
  desc: 'Fires off the way your kart is pointing and zigzags across the road, bouncing off both edges, so it\'s easy to see coming. A dotted line shows its path. Spins whoever it hits. In 1st it goes out the back.',
  odds: { lead: 17, front: [16, 2], back: [8, 0] }, pack: 0.5,   // hits whoever's near: no use from far back
  // fired; return true to keep holding it (charges left)
  use(race, c) {
    const L = launch(c), d = new Projectile('duck', c, null, L.s, L.lat);
    d.vs = L.vs; d.vlat = L.vlat; d.life = 3.5; race.projectiles.push(d);
  },
  // a bot holding it: fire now?
  wantUse(race, c) {
    // fly the duck ahead of time (on its zigzag) and fire if it meets someone where they'll be by then
    const L = launch(c), d = { ...L }, dt = 1 / 30;
    const foes = race.cars.filter(o => o !== c && !o.finished).map(o => ({ o, r: race.rel(c, o) }));
    let ds = L.s - c.s;
    for (let t = dt; t < 0.9; t += dt) {
      if (fly(c.T, d, dt) === 'gone') break; ds += L.vs * dt;
      for (const { o, r } of foes) if (Math.abs(r.ds + o.speed * t - ds) < 35 && Math.abs(r.lat - d.lat) < 25) return true;
    }
    return c.itemT > 5;
  },
  // in flight: straight on along the road, bouncing off its edges; spins the first car it hits
  updateProjectile(race, pr, dt) {
    const T = pr.T;
    const vs = pr.vs || SPEED, ev = fly(T, pr, dt);
    if (ev === 'gone') { pr.life = 0; return; }
    if (ev === 'bounce') { race.sound('duckBounce', pr); if (fchance(0.6)) race.fxSparks(pr.x, pr.y, 3, '#fff3b0', 80); }
    const p = trackSample(T, pr.s); pr.x = p.x + p.nx * pr.lat; pr.y = p.y + p.ny * pr.lat; pr.ang = Math.atan2(p.ty * vs + p.ny * pr.vlat, p.tx * vs + p.nx * pr.vlat);
    for (const c of race.cars) {
      if (c === pr.owner || c.finished || pr.life <= 0 || c.hitCd > 0 || phased(c)) continue;
      if (hitsCar(c, pr.x, pr.y, R)) {
        pr.life = 0;
        if (blockedByShield(race, c)) break;
        c.spinT = 0.7; c.speed *= 0.45; c.hitCd = 1.2; race.fxHit(c, '#ffb703', 'duck'); race.feed('hit', 'duck', pr.owner, c); break;
      }
    }
    if (pr.life > 0 && race.clones.length && hitClone(race, pr.x, pr.y, R, pr.owner)) pr.life = 0;   // a Thread clone in the way: it pops
  },
  // a player holding a duck: its first second of flight if fired now, as fading dots, a sparkle at each bounce
  drawAim(ctx, race, c) {
    const T = c.T, L = launch(c), d = { ...L }, dt = 1 / 60, pts = [], bounces = [];
    let p = trackSample(T, d.s); pts.push(p.x + p.nx * d.lat, p.y + p.ny * d.lat);
    for (let k = 1; k <= 60; k++) {
      const ev = fly(T, d, dt); if (ev === 'gone') break;
      p = trackSample(T, d.s); const x = p.x + p.nx * d.lat, y = p.y + p.ny * d.lat; pts.push(x, y);
      if (ev === 'bounce') { const e = Math.sign(d.lat) * R; bounces.push(x + p.nx * e, y + p.ny * e, pts.length >> 1); }
    }
    const n = pts.length >> 1, cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]));
    const tot = cum[n - 1] || 1, SP = 28;
    let i = 1;
    for (let at = (race.time * 80) % SP + 10; at < tot; at += SP) {
      while (i < n - 1 && cum[i] < at) i++;
      const q = (at - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), x = lerp(pts[i * 2 - 2], pts[i * 2], q), y = lerp(pts[i * 2 - 1], pts[i * 2 + 1], q);
      const f = at / tot, al = 0.1 + 0.9 * Math.pow(1 - f, 1.3), rr = (5.6 - 2.6 * f) * Math.min(1, (at - 10) / 24);   // grows out of the kart's nose
      ctx.globalAlpha = al * 0.5; ctx.fillStyle = '#3a2400'; ctx.beginPath(); ctx.arc(x + 1, y + 1.4, rr + 1.4, 0, TAU); ctx.fill();   // a dark rim, offset down-right: reads on a pale road too
      ctx.globalAlpha = al; ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fffbe0'; ctx.beginPath(); ctx.arc(x - rr * 0.32, y - rr * 0.32, rr * 0.38, 0, TAU); ctx.fill();   // a glint, top left
    }
    for (let k = 0; k < bounces.length; k += 3) {   // where it'll hit an edge: a little sparkle against the kerb
      const f = cum[Math.min(n - 1, bounces[k + 2])] / tot, al = 0.15 + 0.85 * Math.pow(1 - f, 1.3), sz = 11 * (1 - 0.35 * f) * (1 + 0.12 * Math.sin(race.time * 9 + k));
      ctx.globalAlpha = al;
      star(ctx, bounces[k], bounces[k + 1], sz, 4, 0.34, race.time * 1.5 + k); ctx.lineJoin = 'round'; ctx.fillStyle = '#fffbe6'; ctx.strokeStyle = '#e09a00'; ctx.lineWidth = 2; ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  // in flight: seen from above, hopping edge to edge with bubbles and a ripple. Derived from position and heading
  // only, so it's the same on every screen online.
  drawProjectile(ctx, race, p) {
    const T = p.T || race.T, lim = Math.max(1, halfWAt(T, p.s) - R), vs = p.vs || SPEED, ed = lim - Math.abs(p.lat);
    const u = clamp((p.lat + lim) / (2 * lim), 0, 1), h = 6 * Math.sin(Math.PI * u), sq = clamp(1 - ed / 12, 0, 1);
    const q = trackSample(T, p.s), nA = Math.atan2(q.ny, q.nx);
    for (let k = 3; k >= 1; k--) {   // bubbles where it's just been (its path, bounces folded back in)
      const b = k * 0.028; let l = p.lat - p.vlat * b; if (Math.abs(l) > lim) l = Math.sign(l) * (2 * lim - Math.abs(l));
      const o = trackSample(T, p.s - vs * b);
      ctx.globalAlpha = 0.45 - k * 0.11; ctx.fillStyle = '#f4fbff'; ctx.beginPath(); ctx.arc(o.x + o.nx * l, o.y + o.ny * l, 3.2 - k * 0.5, 0, TAU); ctx.fill();
    }
    if (ed < 36 && Math.sign(p.vlat) === -Math.sign(p.lat)) {   // just bounced: a ripple spreading off that edge
      const e = Math.sign(p.lat) * (lim + R), k = ed / 36, x = q.x + q.nx * e, y = q.y + q.ny * e, a = Math.atan2(-Math.sign(p.lat) * q.ny, -Math.sign(p.lat) * q.nx);
      ctx.globalAlpha = 0.75 * (1 - k); ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, y, 6 + 20 * k, a - 0.9, a + 0.9); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    drawRubberDuck(ctx, p.x, p.y, p.ang || 0, ICON, h, sq, nA, Math.sin(race.time * 16 + p.s * 0.01) * 0.14);
  },
};
