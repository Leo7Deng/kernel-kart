// Kernel Kart art: Moonshot's mass driver (race-driver.js). Baked (driverStatic): deck, coil tracks, ring footings,
// chevrons. Live: the coils lit by state (driverUnder), the ring arches and their lamps (driverOver: amber lighting
// back from the far end while charging, green when firing, red discharging), and a player's gauge of the next 5 s
// with a flat-out arrival marker (driverGauge). All from the race clock, so every screen matches.
import { clamp } from '../core.js';
import { trackSample } from '../geometry.js';
import { arrival, driverAt } from '../race-driver.js';
import { bold, BK } from '../look.js';
import { alpha, circ, linear } from './paint.js';
import { VIEW } from '../view.js';

const AMBER = '#ffb627', GREEN = '#46f08c', RED = '#ff4d4d';
const near = (x, y, m) => x > VIEW.x0 - m && x < VIEW.x1 + m && y > VIEW.y0 - m && y < VIEW.y1 + m;
const at = (q, along, lat) => [q.x + q.tx * along + q.nx * lat, q.y + q.ty * along + q.ny * lat];
const poly = (g, P) => { g.beginPath(); P.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); };
const TRACK = 0.62;   // the coil tracks' lat, as a share of the half-width

// ------------------------------------------------------------------------------------------------ baked
export function driverStatic(g, T, BD) {
  const o = T.mech.driver; if (!o) return;
  const a = o.s0 - 90, b = o.s1 + 60;
  // the deck down the middle and the two coil tracks
  const strip = (l0, l1, col) => { g.beginPath(); const L = [], R = []; for (let s = a; s <= b; s += 16) { const q = trackSample(T, Math.min(s, b)); L.push(at(q, 0, l0 * q.hw)); R.push(at(q, 0, l1 * q.hw)); } [...L, ...R.reverse()].forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fillStyle = col; g.fill(); };
  strip(-0.36, 0.36, BD ? '#3b3f4f' : 'rgba(40,44,58,0.55)');
  for (const sd of [-1, 1]) { strip(sd * (TRACK - 0.09), sd * (TRACK + 0.09), BD ? '#2a2d3a' : '#2c2f3d'); strip(sd * (TRACK - 0.035), sd * (TRACK + 0.035), BD ? '#6f5a3a' : '#8a6a3a'); }
  // the coils: short bars across each track
  g.strokeStyle = BD ? '#b98a4a' : 'rgba(214,160,90,0.8)'; g.lineWidth = 4;
  for (let s = a + 10; s < b - 10; s += 22) { const q = trackSample(T, s); for (const sd of [-1, 1]) { const [x0, y0] = at(q, 0, sd * (TRACK - 0.09) * q.hw), [x1, y1] = at(q, 0, sd * (TRACK + 0.09) * q.hw); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); } }
  // the rings' footings, either side of the road
  for (const R of o.rings) for (const sd of [-1, 1]) {
    const q = trackSample(T, R.s), big = R.k === 0, [x, y] = at(q, 0, sd * (q.hw + (big ? 30 : 22))), r = big ? 22 : 15;
    g.fillStyle = 'rgba(22,22,44,0.3)'; circ(g, x + 8, y + 10, r + 3); g.fill();
    g.fillStyle = BD ? '#9aa0ab' : linear(g, x - r, y - r, x + r, y + r, [[0, '#d7dbe2'], [1, '#7d838f']]); circ(g, x, y, r); g.fill();
    g.fillStyle = BD ? '#555b68' : '#5a606c'; circ(g, x, y, r * 0.55); g.fill();
  }
  // green chevrons on the road up to the first ring
  for (let k = 1; k <= 4; k++) { const q = trackSample(T, o.s0 - 40 - k * 46); g.save(); g.translate(q.x, q.y); g.rotate(Math.atan2(q.ty, q.tx)); g.strokeStyle = BD ? BK.green : 'rgba(70,240,140,0.7)'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round'; for (const l of [-0.45, 0, 0.45]) { g.beginPath(); g.moveTo(-12, l * q.hw - 16); g.lineTo(6, l * q.hw); g.lineTo(-12, l * q.hw + 16); g.stroke(); } g.restore(); }
}

// ------------------------------------------------------------------------------------------------ live
// the state's colour and brightness for ring k at time t (0 the first ring)
function ringLight(o, k, t) {
  const P = driverAt(o, t), n = o.n;
  if (P.st === 0) { const on = P.f >= (n - k) / (n + 1); return on ? [AMBER, 0.55 + 0.45 * clamp((P.f - (n - k) / (n + 1)) * (n + 1) * 2, 0, 1)] : [null, 0]; }
  if (P.st === 1) { const front = P.f * (n + 2) - 1; return [GREEN, 0.7 + 0.3 * clamp(1 - Math.abs(k - front) / 1.5, 0, 1)]; }
  return [RED, (0.4 + 0.35 * (Math.floor(t * 14 + k) % 2)) * (1 - P.f * 0.6)];
}
// under the karts: the coil tracks lit up
export function driverUnder(ctx, race) {
  const T = race.track, o = T.mech.driver; if (!o || !near(o.rings[0].x, o.rings[0].y, 2200) && !near(o.rings[o.n - 1].x, o.rings[o.n - 1].y, 2200)) return;
  const t = race.time, P = driverAt(o, t), BD = bold();
  const glow = (s0, s1, col, a) => { if (a <= 0 || s1 <= s0) return; ctx.strokeStyle = alpha(col, a); ctx.lineWidth = BD ? 6 : 8; ctx.lineCap = 'round'; for (const sd of [-1, 1]) { ctx.beginPath(); for (let s = s0, i = 0; s <= s1; s += 20, i++) { const q = trackSample(T, s), [x, y] = at(q, 0, sd * TRACK * q.hw); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); } };
  if (P.st === 0) { const f = P.f; glow(o.s0 + (o.s1 - o.s0) * (1 - f), o.s1, AMBER, 0.35 + 0.25 * f); }
  else if (P.st === 1) { glow(o.s0, o.s1, GREEN, 0.45); const head = o.s0 + (o.s1 - o.s0) * ((P.f * 1.6) % 1); glow(Math.max(o.s0, head - 260), head, '#d9ffe8', 0.9); }
  else glow(o.s0, o.s1, RED, (0.25 + 0.2 * (Math.floor(t * 14) % 2)) * (1 - P.f));
  // a kart being carried down the rail: a green streak behind it
  for (const c of race.cars) if (c.mdV > 0 && near(c.x, c.y, 300)) {
    const hx = Math.cos(c.heading), hy = Math.sin(c.heading), L = 60 + c.speed * 0.18;
    for (const sd of [-1, 1]) { const ox = -hy * sd * c.W * 0.32, oy = hx * sd * c.W * 0.32;
      ctx.strokeStyle = BD ? GREEN : linear(ctx, c.x + ox, c.y + oy, c.x + ox - hx * L, c.y + oy - hy * L, [[0, 'rgba(120,255,180,0.85)'], [1, 'rgba(70,240,140,0)']]); ctx.lineWidth = BD ? 5 : 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(c.x + ox - hx * c.L * 0.3, c.y + oy - hy * c.L * 0.3); ctx.lineTo(c.x + ox - hx * L, c.y + oy - hy * L); ctx.stroke(); }
  }
}
// over the karts: the rings
export function driverOver(ctx, race) {
  const T = race.track, o = T.mech.driver; if (!o) return;
  const t = race.time, BD = bold();
  for (const R of o.rings) {
    if (!near(R.x, R.y, 300)) continue;
    const q = trackSample(T, R.s), big = R.k === 0, out = q.hw + (big ? 30 : 22), th = big ? 14 : 10, ang = Math.atan2(q.ty, q.tx);
    const [col, a] = ringLight(o, R.k, t);
    ctx.save(); ctx.translate(R.x, R.y); ctx.rotate(ang);
    // its shadow, then the arch: a steel band right across the road, lit along its top edge
    ctx.fillStyle = 'rgba(22,22,44,0.22)'; ctx.fillRect(-th + 10, -out + 14, th * 2, out * 2);
    ctx.fillStyle = BD ? '#c9ced8' : linear(ctx, -th, 0, th, 0, [[0, '#eef1f5'], [1, '#8d94a1']]); ctx.beginPath(); ctx.roundRect(-th, -out - 4, th * 2, out * 2 + 8, th * 0.8); ctx.fill();
    if (BD) { ctx.strokeStyle = BK.ink; ctx.lineWidth = 2; ctx.stroke(); }
    // the coil glowing in the state's colour
    if (col) {
      if (!BD) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = alpha(col, 0.18 * a); ctx.fillRect(-th * 3, -out, th * 6, out * 2); ctx.globalCompositeOperation = 'source-over'; }
      ctx.fillStyle = alpha(col, a); ctx.fillRect(-th * 0.45, -out + 6, th * 0.9, out * 2 - 12);
    }
    // lamps along it (the first ring: five, its countdown)
    const nL = big ? 5 : 3;
    for (let j = 0; j < nL; j++) {
      const y = -out + 10 + (out * 2 - 20) * (j + 0.5) / nL;
      let c2 = col, a2 = a;
      if (big) { const P = driverAt(o, t); if (P.st === 0) { const on = P.f * nL > j; c2 = on ? AMBER : null; a2 = on ? 1 : 0; } }
      ctx.fillStyle = c2 ? alpha(c2, Math.max(0.35, a2)) : (BD ? BK.lampOff : '#2b2f3a'); circ(ctx, 0, y, big ? 6 : 4.5); ctx.fill();
    }
    ctx.restore();
  }
}
// over a player's kart coming up to it: the next five seconds of the cycle, and when they'd get there flat out
export function driverGauge(ctx, race, c, BD) {
  const o = c.T.mech && c.T.mech.driver; if (!o || c.finished || c.flyT > 0 || c.mdV > 0) return;
  const ds = o.s0 - c.s; if (ds < 20 || ds > 1150) return;
  const fa = clamp((1150 - ds) / 200, 0, 1) * clamp(ds / 40, 0, 1), now = race.time, H = 5, w = 150, h = 16, x0 = c.x - w / 2, y0 = c.y - 112;
  const A = arrival(c, o, now, Infinity, Infinity, Infinity, c.T.mech.rocket ? race.rocketGrip(c) : 1);
  ctx.save(); ctx.globalAlpha = fa;
  if (BD) { ctx.fillStyle = BK.ink; ctx.fillRect(x0 - 4, y0 - 4, w + 8, h + 8); } else { ctx.fillStyle = 'rgba(10,14,24,0.55)'; ctx.beginPath(); ctx.roundRect(x0 - 6, y0 - 6, w + 12, h + 12, 9); ctx.fill(); }
  const N = 60;
  for (let i = 0; i < N; i++) { const st = driverAt(o, now + H * (i + 0.5) / N).st; ctx.fillStyle = st === 0 ? (BD ? '#c99a2e' : 'rgba(255,182,39,0.6)') : st === 1 ? (BD ? BK.green : GREEN) : (BD ? BK.red : RED); ctx.fillRect(x0 + w * i / N, y0, w / N + 0.5, h); }
  const tA = A.t, nx = x0 + w * clamp(tA / H, 0, 1), good = driverAt(o, now + tA).st === 1;
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = BD ? BK.ink : 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(nx, y0 - 2); ctx.lineTo(nx - 7, y0 - 12); ctx.lineTo(nx + 7, y0 - 12); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillRect(nx - 1.5, y0, 3, h);
  if (good && !BD) { ctx.strokeStyle = `rgba(120,255,160,${0.5 + 0.5 * Math.sin(now * 12)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x0 - 6, y0 - 6, w + 12, h + 12, 9); ctx.stroke(); }
  ctx.restore();
}
