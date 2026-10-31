// Moonshot's timed obstacles (race-timed.js): the test stand, the launch tower's arms, the crawler and rover
// crossings, the airlock. timedStatic is baked; timedUnder / timedOver are live under / over the karts, all from
// the race clock (same on every screen). Lamps: red before anything moves, green when clear.
import { TAU, lerp, mulberry } from '../core.js';
import { trackSample } from '../geometry.js';
import { armAt as armRun, armDir, blastAt as blastRun, blastWarm as warmRun, crossAt as crossRun, doorAt as doorRun } from '../race-timed.js';
// a calm race (a time trial): everything parked out of the way, airlocks open
let CALM = false;
const armAt = (o, k, t) => CALM ? 0 : armRun(o, k, t), blastAt = (o, t) => CALM ? 0 : blastRun(o, t), blastWarm = (o, t) => CALM ? 0 : warmRun(o, t);
const crossAt = (o, t) => CALM ? { d: -o.reach, dir: 0 } : crossRun(o, t), doorAt = (o, k, t) => CALM ? 1 : doorRun(o, k, t);
import { bold, BK } from '../look.js';
import { alpha, circ, ell, linear, radial } from './paint.js';
import { drawCrawler, drawRocket, RS } from './rockets.js';
import { VIEW } from '../view.js';

const SH = 'rgba(14,40,52,0.26)', SHM = 'rgba(22,22,44,0.42)';   // shadows on Earth, on the Moon
const onMoonY = o => (o.y ?? (o.doors ? o.doors[0].y : o.arms[0].y)) < 0;   // (the Moon is the top of the map)
const near = (x, y, m) => x > VIEW.x0 - m && x < VIEW.x1 + m && y > VIEW.y0 - m && y < VIEW.y1 + m;
const poly = (g, P) => { g.beginPath(); P.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); };
// a box in the road's frame at s's sample q: along a..b, across c..d (lat), as a polygon
const box = (q, a, b, c, d) => [[q.x + q.tx * a + q.nx * c, q.y + q.ty * a + q.ny * c], [q.x + q.tx * b + q.nx * c, q.y + q.ty * b + q.ny * c], [q.x + q.tx * b + q.nx * d, q.y + q.ty * b + q.ny * d], [q.x + q.tx * a + q.nx * d, q.y + q.ty * a + q.ny * d]];
// how far from the crossing's middle, along its track, the road stops covering it
const roadSpan = (T, o) => { const q = trackSample(T, o.s), sinA = Math.max(0.3, Math.abs(o.ux * q.ty - o.uy * q.tx)); return q.hw / sinA; };

// ------------------------------------------------------------------------------------------------ baked
// world: 'earth' or 'moon' (a world's bake draws only its own; null: a thumbnail, both)
export function timedStatic(g, T, world) {
  const L = T.mech.timed; if (!L) return;
  const BD = bold();
  for (const o of L) {
    if (world && (world === 'moon') !== onMoonY(o)) continue;
    g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
    if (o.kind === 'blast') testStand(g, T, o, BD);
    else if (o.kind === 'arms') tower(g, T, o, BD);
    else if (o.kind === 'cross') crossing(g, T, o, BD);
    else if (o.kind === 'doors') airlock(g, T, o, BD);
    g.restore();
  }
}
// the engine test stand: its bell aimed across the road, soot over the road, a blast wall on the far side
function testStand(g, T, o, BD) {
  const q = trackSample(T, o.s), sd = o.side, hw = q.hw, w = o.w, n = [q.nx * sd, q.ny * sd], t = [q.tx, q.ty];
  const at = (a, c) => [q.x + t[0] * a + n[0] * c, q.y + t[1] * a + n[1] * c];
  // the apron: from the road's edge out to the stand, pale concrete going dark toward the road where the flame crosses it
  poly(g, [at(-w - 40, hw), at(w + 40, hw), at(w + 30, hw + 190), at(-w - 30, hw + 190)]); g.fillStyle = BD ? '#d6d1c4' : '#dcd7cb'; g.fill();
  { const [x0, y0] = at(0, hw + 150), [x1, y1] = at(0, hw); g.fillStyle = BD ? 'rgba(50,44,40,0.35)' : linear(g, x0, y0, x1, y1, [[0, 'rgba(50,44,40,0)'], [1, 'rgba(50,44,40,0.45)']]); poly(g, [at(-w * 0.8, hw), at(w * 0.8, hw), at(w * 0.4, hw + 150), at(-w * 0.4, hw + 150)]); g.fill(); }
  // soot across the road and the shoulder past it
  for (let k = 0; k < 3; k++) { const [x, y] = at(0, -sd * 0 + 0), r = w * (1 - k * 0.22); g.fillStyle = `rgba(40,36,34,${BD ? 0.1 : 0.12})`; g.save(); g.translate(x, y); g.rotate(Math.atan2(t[1], t[0])); g.beginPath(); g.ellipse(0, 0, r, hw * 1.15, 0, 0, TAU); g.fill(); g.restore(); }
  // the blast wall on the far side: a curved concrete berm, its face blackened
  { const B = []; for (let a = -1; a <= 1.001; a += 0.1) { const along = a * (w + 50), out = hw + 46 + 26 * a * a; B.push(at(along, -out)); }
    const B2 = B.map(([x, y]) => { const [ox, oy] = [-n[0] * 34, -n[1] * 34]; return [x + ox, y + oy]; });
    g.fillStyle = SH; poly(g, [...B.map(([x, y]) => [x + 10, y + 14]), ...B2.map(([x, y]) => [x + 10, y + 14]).reverse()]); g.fill();
    poly(g, [...B, ...B2.reverse()]); g.fillStyle = BD ? '#bdb8ad' : '#c9c4b8'; g.fill();
    g.strokeStyle = BD ? '#3a3533' : 'rgba(40,34,30,0.7)'; g.lineWidth = 9; g.beginPath(); B.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); }
  // the stand: a concrete cell, a steel frame on it holding the engine, the bell aimed at the road
  const [cx, cy] = at(0, hw + 200), ang = Math.atan2(-n[1], -n[0]);
  g.fillStyle = SH; g.beginPath(); g.roundRect(cx - 80 + 16, cy - 70 + 22, 160, 150, 14); g.fill();
  g.fillStyle = BD ? '#cfcac0' : linear(g, cx - 80, cy - 70, cx + 80, cy + 80, [[0, '#ece8df'], [1, '#bdb8ac']]); g.beginPath(); g.roundRect(cx - 80, cy - 70, 160, 140, 14); g.fill();
  g.fillStyle = BD ? '#a9a49a' : '#b3aea3'; g.fillRect(cx - 80, cy + 60, 160, 18);   // its face down the screen
  if (BD) { g.strokeStyle = BK.ink; g.lineWidth = 2.5; g.beginPath(); g.roundRect(cx - 80, cy - 70, 160, 148, 14); g.stroke(); }
  g.save(); g.translate(cx, cy); g.rotate(ang);
  g.strokeStyle = '#e2463a'; g.lineWidth = 8; g.strokeRect(-40, -46, 80, 92); g.lineWidth = 4; g.beginPath(); g.moveTo(-40, -46); g.lineTo(40, 46); g.moveTo(40, -46); g.lineTo(-40, 46); g.stroke();   // the frame
  g.fillStyle = BD ? '#6b7079' : linear(g, 0, -30, 0, 30, [[0, '#9aa0a8'], [0.5, '#5d636d'], [1, '#3a3e45']]);
  g.beginPath(); g.moveTo(-30, -16); g.lineTo(10, -16); g.lineTo(62, -40); g.lineTo(62, 40); g.lineTo(10, 16); g.lineTo(-30, 16); g.closePath(); g.fill();   // the engine and its bell
  g.fillStyle = '#1f2228'; g.beginPath(); g.ellipse(62, 0, 9, 40, 0, 0, TAU); g.fill();
  g.fillStyle = '#f4c430'; g.fillRect(-36, -22, 14, 44);
  g.restore();
  // a stripe of hazard paint along the road's edge in front of it
  for (let a = -w - 20, k = 0; a < w + 20; a += 20, k++) { g.fillStyle = k % 2 ? '#1c1c20' : '#ffcf33'; poly(g, [at(a, hw + 4), at(a + 20, hw + 4), at(a + 20, hw + 14), at(a, hw + 14)]); g.fill(); }
}
// the launch tower (its arms are live), its pad and rocket behind it
function tower(g, T, o, BD) {
  const A0 = o.arms[0], A1 = o.arms[o.arms.length - 1], q = trackSample(T, (A0.s + A1.s) / 2), sd = o.side, hw = q.hw;
  const at = (a, c) => [q.x + q.tx * a + q.nx * sd * c, q.y + q.ty * a + q.ny * sd * c], half = (A1.s - A0.s) / 2 + 60;
  // the pad behind: a concrete square, the trench out away from the road, the rocket standing on it
  const [px, py] = at(0, hw + 230);
  g.fillStyle = SH; g.beginPath(); g.roundRect(px - 110 + 16, py - 110 + 20, 220, 220, 20); g.fill();
  g.fillStyle = BD ? '#d6d1c4' : radial(g, px - 50, py - 50, 10, px, py, 160, [[0, '#ece8df'], [1, '#c4c0b5']]); g.beginPath(); g.roundRect(px - 110, py - 110, 220, 220, 20); g.fill();
  g.strokeStyle = '#f4c430'; g.lineWidth = 5; circ(g, px, py, 64); g.stroke(); g.fillStyle = '#5c626b'; circ(g, px, py, 34); g.fill();
  // the tower: a frame along the road's edge, its top a lattice, its face down the screen
  const P = [at(-half, hw + 26), at(half, hw + 26), at(half, hw + 92), at(-half, hw + 92)];
  const H = 26; g.fillStyle = SH; poly(g, P.map(([x, y]) => [x + 22, y + 34])); g.fill();
  poly(g, P.map(([x, y]) => [x, y + H])); g.fillStyle = '#8e2a20'; g.fill();
  poly(g, P); g.fillStyle = BD ? '#d2452f' : '#c0392b'; g.fill();
  g.save(); poly(g, P); g.clip(); g.strokeStyle = '#8e2a20'; g.lineWidth = 3;
  for (let a = -half; a < half; a += 34) { const [x0, y0] = at(a, hw + 26), [x1, y1] = at(a + 34, hw + 92), [x2, y2] = at(a, hw + 92), [x3, y3] = at(a + 34, hw + 26); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.moveTo(x2, y2); g.lineTo(x3, y3); g.stroke(); }
  g.restore();
  if (BD) { g.strokeStyle = BK.ink; g.lineWidth = 2.5; poly(g, P); g.stroke(); }
  // a hinge for each arm (the arms swing out from them)
  for (const A of o.arms) { g.fillStyle = SH; circ(g, A.x + 6, A.y + 9, 15); g.fill(); g.fillStyle = BD ? '#f4c430' : radial(g, A.x - 4, A.y - 4, 2, A.x, A.y, 15, [[0, '#ffe08a'], [1, '#d9a21c']]); circ(g, A.x, A.y, 14); g.fill(); g.fillStyle = '#3a3e45'; circ(g, A.x, A.y, 5); g.fill(); }
  // the rocket, standing up the screen on its pad
  drawRocket(g, px, py - 6, RS * 0.9, { col: '#2f7fd0', stage: 1, flame: 0, t: 0 });
}
// a crossing: the vehicle's track either side, plates and a stop line on the road, a pad (crawler) or garage (rover)
// at its far end
function crossing(g, T, o, BD) {
  const q = trackSample(T, o.s), span = roadSpan(T, o), big = o.look === 'crawler', D = o.reach + o.len + (big ? 260 : 120);
  const lane = (d0, d1, off, w, col) => { const p = k => [o.x + o.ux * d0 + -o.uy * (off + k * w / 2), o.y + o.uy * d0 + o.ux * (off + k * w / 2)], r = k => [o.x + o.ux * d1 + -o.uy * (off + k * w / 2), o.y + o.uy * d1 + o.ux * (off + k * w / 2)]; poly(g, [p(-1), r(-1), r(1), p(1)]); g.fillStyle = col; g.fill(); };
  const L0 = big ? o.w * 0.55 : o.w * 0.6, LW = big ? o.w * 0.75 : o.w * 0.45;
  for (const [d0, d1] of [[-D, -span - 10], [span + 10, D]]) for (const sd of [-1, 1]) {
    if (big) { lane(d0, d1, sd * L0, LW + 10, BD ? '#bdb29c' : '#c4b9a3'); lane(d0, d1, sd * L0, LW, BD ? '#d6cdb9' : '#ddd3bf'); }
    else { lane(d0, d1, sd * L0, LW, 'rgba(110,104,96,0.28)'); lane(d0, d1, sd * L0, LW * 0.35, 'rgba(70,66,64,0.25)'); }
  }
  if (big && !BD) { const rng = mulberry(77); for (let k = 0; k < 500; k++) { const d = (rng() * 2 - 1) * D; if (Math.abs(d) < span + 12) continue; const off = (rng() < 0.5 ? -1 : 1) * L0 + (rng() - 0.5) * LW; g.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.6)' : 'rgba(120,108,90,0.35)'; g.fillRect(o.x + o.ux * d - o.uy * off, o.y + o.uy * d + o.ux * off, 3, 3); } }
  // the plates across the road where the lanes cross it
  for (const sd of [-1, 1]) { lane(-span - 4, span + 4, sd * L0, LW, big ? (BD ? '#9ea3ab' : '#a7acb4') : 'rgba(150,150,160,0.5)'); if (big) { lane(-span - 4, span + 4, sd * L0 + LW / 2, 4, '#f4c430'); lane(-span - 4, span + 4, sd * L0 - LW / 2, 4, '#f4c430'); } }
  // the stop line before it (the way the karts come), and a hatched box over the crossing
  { const s = o.s - o.w - 70 * (big ? 1.2 : 1), q2 = trackSample(T, s); poly(g, box(q2, -6, 6, -q2.hw + 6, q2.hw - 6)); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill(); }
  // the far end: the crawler's goes on to a pad with a rocket; the rover's ends at its garage
  const end = sdir => [o.x + o.ux * sdir * (D + (big ? 120 : 50)), o.y + o.uy * sdir * (D + (big ? 120 : 50))];
  if (big) {
    const [ex, ey] = end(-1);   // (the pad: at the end its track starts from, up toward the lagoon)
    g.fillStyle = SH; g.beginPath(); g.roundRect(ex - 120 + 16, ey - 120 + 20, 240, 240, 20); g.fill();
    g.fillStyle = BD ? '#d6d1c4' : radial(g, ex - 50, ey - 50, 10, ex, ey, 170, [[0, '#ece8df'], [1, '#c4c0b5']]); g.beginPath(); g.roundRect(ex - 120, ey - 120, 240, 240, 20); g.fill();
    g.strokeStyle = '#f4c430'; g.lineWidth = 6; circ(g, ex, ey, 70); g.stroke(); g.fillStyle = '#5c626b'; circ(g, ex, ey, 36); g.fill();
    drawRocket(g, ex, ey - 6, RS * 0.95, { col: '#e2463a', stage: 1, flame: 0, t: 0 });
    const [gx, gy] = end(1);   // its garage at the other end
    g.fillStyle = SH; g.beginPath(); g.roundRect(gx - 150 + 20, gy - 60 + 26, 300, 150, 12); g.fill();
    g.fillStyle = BD ? '#c3cad6' : '#cfd5de'; g.fillRect(gx - 150, gy + 70, 300, 30);
    g.fillStyle = BD ? '#eef0f4' : linear(g, gx - 150, gy - 60, gx + 150, gy + 70, [[0, '#ffffff'], [1, '#d9dee6']]); g.beginPath(); g.roundRect(gx - 150, gy - 60, 300, 130, 12); g.fill();
    g.fillStyle = '#24406e'; g.fillRect(gx - 60, gy - 60, 120, 14);
    if (BD) { g.strokeStyle = BK.ink; g.lineWidth = 2.5; g.beginPath(); g.roundRect(gx - 150, gy - 60, 300, 160, 12); g.stroke(); }
  } else for (const sdir of [-1, 1]) {
    const [ex, ey] = end(sdir), r = 54;
    g.fillStyle = SHM; ell(g, ex + 16, ey + 18, r * 1.05, r * 0.9); g.fill();
    g.fillStyle = BD ? '#eef1f5' : radial(g, ex - r * 0.38, ey - r * 0.42, r * 0.08, ex, ey, r, [[0, '#ffffff'], [0.7, '#e3e7ee'], [1, '#a9b1bd']]); circ(g, ex, ey, r); g.fill();
    g.strokeStyle = '#ff8a3c'; g.lineWidth = 6; circ(g, ex, ey, r * 0.92); g.stroke();
    g.fillStyle = '#2b2f38'; const ax = -o.ux * sdir, ay = -o.uy * sdir; g.save(); g.translate(ex + ax * r * 0.7, ey + ay * r * 0.7); g.rotate(Math.atan2(ay, ax)); g.fillRect(-10, -22, 20, 44); g.restore();
    if (BD) { g.strokeStyle = BK.ink; g.lineWidth = 2.5; circ(g, ex, ey, r); g.stroke(); }
  }
  // the lamps' posts either side of the road before it (the lamps are live)
  for (const P of crossLamps(T, o)) { g.fillStyle = big ? SH : SHM; ell(g, P.x + 10, P.y + 4, 12, 4); g.fill(); g.fillStyle = '#3a3e45'; g.fillRect(P.x - 2.5, P.y - 34, 5, 34); g.fillStyle = '#20242c'; g.beginPath(); g.roundRect(P.x - 12, P.y - 46, 24, 14, 4); g.fill(); }
}
const crossLamps = (T, o) => { const s = o.s - o.w - 90, q = trackSample(T, s); return [-1, 1].map(sd => ({ x: q.x + q.nx * sd * (q.hw + 18), y: q.y + q.ny * sd * (q.hw + 18) })); };
// the airlock: a frame either side at each door (the leaves are live), a hazard sill, the chamber's walls
function airlock(g, T, o, BD) {
  const D0 = o.doors[0], D1 = o.doors[o.doors.length - 1];
  // the chamber's walls between the doors
  for (const sd of [-1, 1]) {
    const pts = []; for (let s = D0.s; s <= D1.s; s += 10) { const q = trackSample(T, s); pts.push([q.x + q.nx * sd * (q.hw + 6), q.y + q.ny * sd * (q.hw + 6)]); }
    g.strokeStyle = SHM; g.lineWidth = 20; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x + 10, y + 14) : g.moveTo(x + 10, y + 14)); g.stroke();
    g.strokeStyle = BD ? '#e3e7ee' : '#eef1f5'; g.lineWidth = 16; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
    g.strokeStyle = '#ff8a3c'; g.lineWidth = 4; g.stroke();
  }
  for (const Dr of o.doors) {
    const q = trackSample(T, Dr.s);
    poly(g, box(q, -8, 8, -q.hw, q.hw)); g.fillStyle = '#1c1c20'; g.fill();
    for (let c = -q.hw, k = 0; c < q.hw; c += 16, k++) if (k % 2 === 0) { poly(g, box(q, -8, 8, c, Math.min(q.hw, c + 16))); g.fillStyle = '#ffcf33'; g.fill(); }
    for (const sd of [-1, 1]) {   // the frames: the leaves' housings
      const P = box(q, -26, 26, sd * (q.hw + 2), sd * (q.hw + 50));
      g.fillStyle = SHM; poly(g, P.map(([x, y]) => [x + 12, y + 16])); g.fill();
      poly(g, P); g.fillStyle = BD ? '#d9dee6' : linear(g, P[0][0], P[0][1], P[2][0], P[2][1], [[0, '#ffffff'], [1, '#c3cad6']]); g.fill();
      if (BD) { g.strokeStyle = BK.ink; g.lineWidth = 2.5; g.stroke(); }
      const c = box(q, -14, 14, sd * (q.hw + 14), sd * (q.hw + 38)); poly(g, c); g.fillStyle = '#33c4bc'; g.fill();
    }
  }
}

// ------------------------------------------------------------------------------------------------ live, under the karts
export function timedUnder(ctx, race) {
  CALM = !!race.calm;
  const T = race.track, L = T.mech.timed; if (!L) return;
  const t = race.time, BD = bold();
  for (const o of L) {
    if (o.kind === 'arms') for (const A of o.arms) {
      if (!near(A.x, A.y, o.len + 100)) continue;
      const f = armAt(o, A.k, t), [dx, dy] = armDir(A, f);
      ctx.save(); ctx.strokeStyle = 'rgba(14,40,52,0.22)'; ctx.lineWidth = 26; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(A.x + 26, A.y + 38); ctx.lineTo(A.x + dx * o.len + 26, A.y + dy * o.len + 38); ctx.stroke(); ctx.restore();
    } else if (o.kind === 'cross') {
      if (!near(o.x, o.y, o.reach + 400)) continue;
      const P = crossAt(o, t), x = o.x + o.ux * P.d, y = o.y + o.uy * P.d, a = Math.atan2(o.uy, o.ux), big = o.look === 'crawler';
      if (big) drawCrawler(ctx, x, y, a, o.len, o.w, P.dir !== 0, t, true);
      else { ctx.save(); ctx.translate(x + 12, y + 16); ctx.rotate(a); ctx.fillStyle = SHM; ctx.beginPath(); ctx.roundRect(-o.len, -o.w, o.len * 2, o.w * 2, 14); ctx.fill(); ctx.restore(); }
    } else if (o.kind === 'blast') {
      if (!near(o.x, o.y, 500)) continue;
      const f = blastAt(o, t); if (f <= 0 || BD) continue;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * f;
      ctx.fillStyle = radial(ctx, o.x, o.y, 10, o.x, o.y, o.w * 2.2, [[0, 'rgba(255,170,80,0.8)'], [1, 'rgba(255,120,40,0)']]); circ(ctx, o.x, o.y, o.w * 2.2); ctx.fill(); ctx.restore();
    }
  }
}

// ------------------------------------------------------------------------------------------------ live, over the karts
export function timedOver(ctx, race) {
  CALM = !!race.calm;
  const T = race.track, L = T.mech.timed; if (!L) return;
  const t = race.time, BD = bold();
  for (const o of L) {
    if (o.kind === 'blast') plume(ctx, T, o, t, BD);
    else if (o.kind === 'arms') arms(ctx, o, t, BD);
    else if (o.kind === 'cross') vehicle(ctx, T, o, t, BD);
    else if (o.kind === 'doors') doors(ctx, T, o, t, BD);
  }
}
// the test firing: igniters, then a flame right across the road, smoke off the blast wall, beacons flashing
function plume(ctx, T, o, t, BD) {
  if (!near(o.x, o.y, 700)) return;
  const q = trackSample(T, o.s), sd = o.side, hw = q.hw, n = [q.nx * sd, q.ny * sd], f = blastAt(o, t), warm = blastWarm(o, t);
  const at = (a, c) => [q.x + q.tx * a + n[0] * c, q.y + q.ty * a + n[1] * c];
  // the beacons on the stand's corners
  const [cx, cy] = at(0, hw + 200), lit = (f > 0 || warm > 0) && Math.floor(t * 6) % 2 === 0;
  for (const a of [-70, 70]) { const [bx, by] = [cx + q.tx * a, cy + q.ty * a - 70]; ctx.fillStyle = lit ? '#ff4b3e' : '#5a1f1a'; circ(ctx, bx, by, 7); ctx.fill(); if (lit && !BD) { ctx.fillStyle = 'rgba(255,75,62,0.3)'; circ(ctx, bx, by, 18); ctx.fill(); } }
  const [nx0, ny0] = at(0, hw + 150);   // the bell's mouth
  if (warm > 0 && f <= 0) {   // the igniters: sparks spitting from the bell
    for (let k = 0; k < 8; k++) { const r = mulberry(Math.floor(t * 30) * 13 + k), d = r() * 60 * warm, a = (r() - 0.5) * 1.2; ctx.fillStyle = r() < 0.5 ? '#ffd27a' : '#ff9a3c'; circ(ctx, nx0 - n[0] * d + q.tx * d * a, ny0 - n[1] * d + q.ty * d * a, 2 + r() * 2.5); ctx.fill(); }
    return;
  }
  if (f <= 0) return;
  // the flame: a cone from the bell across the road to the wall, in layers
  const len = hw * 2 + 190, fl = 1 + 0.06 * Math.sin(t * 47) + 0.04 * Math.sin(t * 31);
  const cone = (w0, w1, l, col) => { const P = []; for (let k = 0; k <= 12; k++) { const u = k / 12, c = hw + 150 - u * l * fl, a = lerp(w0, w1, Math.pow(u, 0.7)); P.push(at(-a, c)); } for (let k = 12; k >= 0; k--) { const u = k / 12, c = hw + 150 - u * l * fl, a = lerp(w0, w1, Math.pow(u, 0.7)); P.push(at(a, c)); } poly(ctx, P); ctx.fillStyle = col; ctx.fill(); };
  ctx.save(); ctx.globalAlpha = f;
  cone(30, o.w * 1.15, len, BD ? 'rgba(255,240,220,0.55)' : 'rgba(255,236,214,0.5)');   // the hot air round it, shimmering
  cone(26, o.w * 0.9, len * 0.95, BD ? '#ff9a3c' : 'rgba(255,140,50,0.85)');
  cone(18, o.w * 0.55, len * 0.8, BD ? '#ffd27a' : 'rgba(255,214,110,0.92)');
  cone(9, o.w * 0.22, len * 0.55, '#fffbe8');
  if (!BD) for (let k = 1; k <= 4; k++) { const [x, y] = at(0, hw + 150 - k * 46 * fl); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(n[1], n[0])); ctx.beginPath(); ctx.ellipse(0, 0, 9, 14 - k, 0, 0, TAU); ctx.fill(); ctx.restore(); }   // shock diamonds
  // smoke billowing off the wall on the far side, rising up the screen as it goes
  for (let k = 0; k < 9; k++) { const r = mulberry(k * 31 + 5), ph = (t * 0.9 + r()) % 1, a = (r() * 2 - 1) * (o.w + 40), [x, y] = at(a, -hw - 70 - ph * 90), R = 30 + ph * 50; ctx.globalAlpha = f * (1 - ph) * 0.85; ctx.fillStyle = BD ? '#eceae6' : 'rgba(240,238,234,0.9)'; circ(ctx, x, y - ph * 60, R); ctx.fill(); }
  ctx.restore();
}
// the gantry arms: a white steel truss from its hinge, a striped cab on its end; its shadow is under the karts
function arms(ctx, o, t, BD) {
  for (const A of o.arms) {
    if (!near(A.x, A.y, o.len + 60)) continue;
    const f = armAt(o, A.k, t), [dx, dy] = armDir(A, f), a = Math.atan2(dy, dx), H = 14;
    ctx.save(); ctx.translate(A.x, A.y - H); ctx.rotate(a);
    ctx.fillStyle = BD ? '#c3c8d0' : '#b8bec8'; ctx.fillRect(0, 9, o.len, 6);   // its side
    ctx.fillStyle = BD ? '#eef0f3' : linear(ctx, 0, -11, 0, 11, [[0, '#ffffff'], [1, '#d7dce4']]); ctx.fillRect(0, -11, o.len - 30, 22);
    ctx.strokeStyle = '#8d939d'; ctx.lineWidth = 2; for (let x = 0; x < o.len - 34; x += 22) { ctx.beginPath(); ctx.moveTo(x, -11); ctx.lineTo(x + 22, 11); ctx.moveTo(x, 11); ctx.lineTo(x + 22, -11); ctx.stroke(); }
    ctx.fillStyle = '#ffcf33'; ctx.fillRect(o.len - 32, -16, 32, 32); ctx.fillStyle = '#1c1c20'; for (let k = 0; k < 4; k++) ctx.fillRect(o.len - 32 + k * 8, -16, 4, 32);   // the cab on its end, striped
    if (BD) { ctx.strokeStyle = BK.ink; ctx.lineWidth = 2.5; ctx.strokeRect(0, -11, o.len - 30, 22); ctx.strokeRect(o.len - 32, -16, 32, 32); }
    ctx.restore();
    // its lamp on the hinge: red while it's out or moving, green when it's back
    ctx.fillStyle = f > 0.01 ? '#ff4b3e' : '#3fd68b'; circ(ctx, A.x, A.y - H - 2, 6); ctx.fill();
  }
}
// the crawler (art/rockets.js) or rover on its track; the crossing's lamps flash amber while it moves or is about to
function vehicle(ctx, T, o, t, BD) {
  if (!near(o.x, o.y, o.reach + 500)) return;
  const P = crossAt(o, t), x = o.x + o.ux * P.d, y = o.y + o.uy * P.d, a = Math.atan2(o.uy, o.ux), big = o.look === 'crawler';
  // the lamps: amber, alternating, from just before it moves until it's off the road again
  const u = ((t + o.phase) % o.period + o.period) % o.period, soon = !CALM && (u > o.wait - 1.2 && u < o.wait + o.run) || (u > 2 * o.wait + o.run - 1.2);
  for (const [i, L] of crossLamps(T, o).entries()) { const on = soon && Math.floor(t * 4 + i) % 2 === 0; ctx.fillStyle = on ? '#ffb020' : '#4a3a20'; circ(ctx, L.x - 5, L.y - 39, 4.5); ctx.fill(); circ(ctx, L.x + 5, L.y - 39, 4.5); ctx.fill(); if (on && !BD) { ctx.fillStyle = 'rgba(255,176,32,0.3)'; circ(ctx, L.x, L.y - 39, 16); ctx.fill(); } }
  if (big) { drawCrawler(ctx, x, y, a, o.len, o.w, P.dir !== 0, t, false); return; }
  rover(ctx, x, y, a, o.len, o.w, P.dir, t, BD);
}
// the base's rover: a big six-wheeled moon truck, white and orange, a cab at the front, a mast with a dish
export function rover(ctx, x, y, a, L, W, dir, t, BD) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a + (dir < 0 ? Math.PI : 0));
  const spin = dir ? t * 9 : 0;
  for (const wx of [-L * 0.65, 0, L * 0.65]) for (const sd of [-1, 1]) { ctx.fillStyle = '#2b2f38'; ctx.beginPath(); ctx.roundRect(wx - 13, sd * W - 8, 26, 16, 5); ctx.fill(); ctx.strokeStyle = '#4a4f58'; ctx.lineWidth = 2; for (let k = 0; k < 3; k++) { const ox = ((k * 9 + spin * 4) % 26) - 13; ctx.beginPath(); ctx.moveTo(wx + ox, sd * W - 7); ctx.lineTo(wx + ox, sd * W + 7); ctx.stroke(); } }
  ctx.fillStyle = BD ? '#eef1f5' : linear(ctx, 0, -W, 0, W, [[0, '#ffffff'], [1, '#c9cfd8']]); ctx.beginPath(); ctx.roundRect(-L, -W * 0.82, L * 2, W * 1.64, 10); ctx.fill();
  ctx.fillStyle = '#ff8a3c'; ctx.fillRect(-L, -W * 0.82, L * 2, 7); ctx.fillRect(-L, W * 0.82 - 7, L * 2, 7);
  ctx.fillStyle = '#26408b'; ctx.beginPath(); ctx.roundRect(L * 0.35, -W * 0.6, L * 0.55, W * 1.2, 6); ctx.fill(); ctx.fillStyle = '#7fd3ff'; ctx.beginPath(); ctx.roundRect(L * 0.62, -W * 0.5, L * 0.22, W, 4); ctx.fill();
  ctx.fillStyle = '#d9a43a'; ctx.fillRect(-L * 0.8, -W * 0.5, L * 0.9, W);   // cargo under gold foil
  if (BD) { ctx.strokeStyle = BK.ink; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.roundRect(-L, -W * 0.82, L * 2, W * 1.64, 10); ctx.stroke(); }
  ctx.save(); ctx.translate(-L * 0.2, -W * 0.2); ctx.rotate(t * 1.2); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, 0, 12, 7, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#c9cfd8'; circ(ctx, 0, 0, 3); ctx.fill(); ctx.restore();
  ctx.fillStyle = Math.floor(t * 3) % 2 && dir ? '#ffb020' : '#5a4a2a'; circ(ctx, L * 0.2, 0, 5); ctx.fill();   // its beacon, turning while it drives
  ctx.restore();
}
// the airlock's leaves sliding in to meet mid-road; lamps green open, amber moving, red shut
function doors(ctx, T, o, t, BD) {
  for (const Dr of o.doors) {
    const q = trackSample(T, Dr.s); if (!near(q.x, q.y, 300)) continue;
    const op = doorAt(o, Dr.k, t), hw = q.hw;
    for (const sd of [-1, 1]) {
      const inner = sd * (hw * op), outer = sd * (hw + 26), H = 10;
      if (Math.abs(outer - inner) > 4) {
        const P = box(q, -9, 9, inner, outer);
        ctx.fillStyle = SHM; poly(ctx, P.map(([x, y]) => [x + 10, y + 14])); ctx.fill();
        poly(ctx, P.map(([x, y]) => [x, y - H])); ctx.fillStyle = BD ? '#9aa1ab' : '#a6adb7'; ctx.fill();
        poly(ctx, P.map(([x, y]) => [x, y - H * 1.6])); ctx.fillStyle = BD ? '#d9dee6' : '#e6eaf0'; ctx.fill();
        if (BD) { ctx.strokeStyle = BK.ink; ctx.lineWidth = 2; ctx.stroke(); }
        const E2 = box(q, -9, 9, inner, inner + sd * 12); poly(ctx, E2.map(([x, y]) => [x, y - H * 1.6])); ctx.fillStyle = '#ffcf33'; ctx.fill();
        ctx.save(); ctx.clip(); ctx.fillStyle = '#1c1c20'; for (let k = -2; k < 3; k++) { const [x, y] = [q.x + q.tx * k * 7 + q.nx * (inner + sd * 6), q.y + q.ty * k * 7 + q.ny * (inner + sd * 6) - H * 1.6]; circ(ctx, x, y, 2.5); ctx.fill(); } ctx.restore();
      }
      const [lx, ly] = [q.x + q.nx * sd * (hw + 26), q.y + q.ny * sd * (hw + 26) - 20];
      ctx.fillStyle = op >= 0.99 ? '#3fd68b' : op <= 0.01 ? '#ff4b3e' : '#ffb020'; circ(ctx, lx, ly, 6); ctx.fill();
      if (!BD) { ctx.fillStyle = alpha(op >= 0.99 ? '#3fd68b' : op <= 0.01 ? '#ff4b3e' : '#ffb020', 0.3); circ(ctx, lx, ly, 15); ctx.fill(); }
    }
  }
}
