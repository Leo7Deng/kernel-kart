// Kernel Kart art: Race Condition, a steampunk clocktower (race-clock.js). Seen from above, lit from the top left:
//   clockGround   the city far below (roofs in slate and terracotta through a haze), the cobbled Plaza at the foot of
//                 the tower, the tower itself (stone walls round its wooden floors), the round platform at its top with
//                 the clock face, and the elevated roads' iron columns and shadows falling on the roofs
//   clockStatic   over the road (baked): railings along the high roads, the clock face, the Mainspring coiled inside its
//                 loop, the pendulum's posts
//   clockRoofs    the arches over the road at each end of the balcony (the hand passes over them) and the tower's gates
//   clockUnder    every frame, under the karts: the gears turning (cached sprites, rotated), the hand's and the bob's
//                 shadows, the pads glowing while the tower strikes
//   clockOver     every frame, over the karts: the hands (the minute hand's two blades low over the balcony, lifted
//                 clear over the arches and the rest of the face), the pendulum and its gantry, steam
//   clockProp / clockLandmark   chimney stacks, water tanks and skylights on the roofs; a domed hall and a gasometer
import { TAU, mulberry } from '../core.js';
import { trackSample } from '../geometry.js';
import { elevAt } from '../race-elevation.js';
import { bobAt as bobRun, bobRest, bobVel as bobVelRun, chimeAt, handAngle as handRun, handRest, hourAngle } from '../race-clock.js';
// a calm race (a time trial): the clock stopped, the minute hand up over the arches, the bob hooked back off the road
let CALM = false;
const handAngle = (K, H, t, j) => CALM ? handRest(H, j) : handRun(K, H, t, j);
const bobAt = (P, t) => CALM ? bobRest(P) : bobRun(P, t), bobVel = (P, t) => CALM ? 0 : bobVelRun(P, t);
import { alpha, circ, ell, linear, poly, radial, rr, shade } from './paint.js';

const BRASS = '#c9962f', BRASS_L = '#f6dc94', BRASS_D = '#6e4b12', IRON = '#2b2725', IRON_L = '#5d554e', ENAMEL = '#f3ead2', INK = '#231c17';
const SHADOW = 'rgba(16,12,10,0.34)';
const ROOFS = ['#a5503a', '#b8603f', '#8e4634', '#5d6572', '#6b7480', '#4f5662', '#7b6f63', '#4f7f72'];   // terracotta, slate, lead, a copper green now and then

// ---------------------------------------------------------------- the track's zones (cached per track)
let Z = null;   // the zones of the track being drawn (props and landmarks are drawn just after its ground)
const zoneCache = new WeakMap();
const inRect = (q, x, y, m = 0) => x > q.x0 - m && x < q.x1 + m && y > q.y0 - m && y < q.y1 + m;
export function clockZones(T) {
  if (zoneCache.has(T)) return (Z = zoneCache.get(T));
  const d = T.def, sc = d.scale || 1, K = T.mech.clock, A = d.clockArt;
  const R = ([a, b, c, e]) => ({ x0: a * sc, y0: b * sc, x1: c * sc, y1: e * sc });
  const tower = R(A.tower), plaza = R(A.plaza), plat = { x: K.dial.x, y: K.dial.y, r: A.platform * sc };
  const indoors = (x, y, m = 0) => inRect(tower, x, y, m) || Math.hypot(x - plat.x, y - plat.y) < plat.r + m;
  // the gears: those that touch mesh (turning the other way, slower the bigger they are); the rest turn on their own
  const gears = A.gears.map(([x, y, r], i) => ({ x: x * sc, y: y * sc, r: r * sc, teeth: Math.max(12, Math.round(r * sc / 10)), w: 0, i }));
  const RIM = 34;   // rim speed (world units/s)
  for (const g0 of gears) {
    if (g0.w) continue;
    g0.w = (g0.i % 2 ? -1 : 1) * RIM / g0.r; const q = [g0];
    while (q.length) { const a = q.shift(); for (const b of gears) if (!b.w && Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r) < (a.r + b.r) * 0.12) { b.w = -Math.sign(a.w) * RIM / b.r; q.push(b); } }
  }
  // the high road outside the tower: every few units along the lap, with its height (for the columns, shadows, railings)
  const high = [];
  for (let s = 0; s < T.L; s += 10) { const q = trackSample(T, s), h = elevAt(T, s); high.push({ s, q, h, out: !indoors(q.x, q.y, -20) && !inRect(plaza, q.x, q.y, -10) }); }
  const spring = A.spring ? { x: A.spring[0] * sc, y: A.spring[1] * sc, r: A.spring[2] * sc } : null;
  // nothing from the scenery scatter on the tower's floors, the platform or the plaza (they have their own things)
  const keep = [[plat.x, plat.y, plat.r + 30]];
  for (const q of [tower, plaza]) for (let x = q.x0; x <= q.x1 + 1; x += 220) for (let y = q.y0; y <= q.y1 + 1; y += 220) keep.push([Math.min(x, q.x1), Math.min(y, q.y1), 170]);
  T.keepOut = keep;
  Z = { tower, plaza, plat, gears, high, spring, indoors, steam: [] };
  // steam: from vents on the tower floor and chimneys in the city (fixed spots, from the track's own seed)
  const rng = mulberry(T.N * 3 + 5);
  for (let k = 0; k < 60 && Z.steam.length < 14; k++) {
    const x = tower.x0 - 600 + rng() * (tower.x1 - tower.x0 + 1200), y = tower.y0 - 600 + rng() * (tower.y1 - tower.y0 + 1200);
    if (Z.steam.some(p => Math.hypot(p.x - x, p.y - y) < 420) || nearRoad(T, x, y) < T.halfW + 70) continue;
    Z.steam.push({ x, y, ph: rng() * 10, k: 0.6 + rng() * 0.6 });
  }
  zoneCache.set(T, Z); return Z;
}
function nearRoad(T, x, y) { let bd = 1e18; for (let i = 0; i < T.N; i += 6) { const p = T.pts[i], d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) bd = d; } return Math.sqrt(bd); }

// ---------------------------------------------------------------- ground (baked)
export function clockGround(g, T, X0, Y0, W, H, rng, dist, D) {
  const z = clockZones(T);
  city(g, T, z, X0, Y0, W, H, rng, D);
  plazaFloor(g, z.plaza, rng, D);
  towerFloor(g, T, z, rng, D);
  platform(g, z.plat, D);
  for (const G of z.gears) { circ(g, G.x + 9, G.y + 12, G.r * 1.02); g.fillStyle = SHADOW; g.fill(); }   // (the gears turn in the frame layer; their shadows stay put)
  highRoad(g, T, z, D);
}
// streets and roofs, far below, through a haze
function city(g, T, z, X0, Y0, W, H, rng, D) {
  g.fillStyle = '#4a4648'; g.fillRect(X0, Y0, W, H);
  const BW = 300, BH = 230, ST = 38;
  for (let by = Y0; by < Y0 + H; by += BH) for (let bx = X0; bx < X0 + W; bx += BW) {
    const x0 = bx + ST / 2, y0 = by + ST / 2, w = BW - ST, h = BH - ST, cx = x0 + w / 2, cy = y0 + h / 2;
    if (inRect(z.tower, cx, cy, w / 2 + 30) && inRect(z.tower, cx, cy, h / 2 + 30) || inRect(z.plaza, cx, cy, Math.max(w, h) / 2) || Math.hypot(cx - z.plat.x, cy - z.plat.y) < z.plat.r + 150) continue;
    // pavement round the block, then its buildings in a row of 2-4 (or a courtyard block)
    g.fillStyle = '#6c6560'; g.fillRect(x0 - 6, y0 - 6, w + 12, h + 12);
    const n = 2 + Math.floor(rng() * 3), cuts = [0]; for (let i = 1; i < n; i++) cuts.push((i + (rng() - 0.5) * 0.5) / n); cuts.push(1);
    const across = rng() < 0.5;
    for (let i = 0; i < n; i++) {
      const a = cuts[i], b = cuts[i + 1], bx0 = across ? x0 + a * w : x0, by0 = across ? y0 : y0 + a * h, bw = across ? (b - a) * w - 3 : w, bh = across ? h : (b - a) * h - 3;
      house(g, bx0, by0, bw, bh, ROOFS[Math.floor(rng() * (rng() < 0.92 ? 7 : 8))], rng, D);
    }
  }
  // the haze between you and the city (lighter higher up: nothing here is high, so evenly)
  g.fillStyle = 'rgba(152,170,190,0.26)'; g.fillRect(X0, Y0, W, H);
}
// a house from above: a pitched roof (ridge along its long side, the half facing the light brighter), chimneys
function house(g, x, y, w, h, col, rng, D) {
  g.fillStyle = 'rgba(10,8,8,0.35)'; g.fillRect(x + 7, y + 9, w, h);
  const long = w >= h;
  if (long) {
    g.fillStyle = shade(col, 0.16); g.fillRect(x, y, w, h / 2); g.fillStyle = shade(col, -0.18); g.fillRect(x, y + h / 2, w, h / 2);
    if (D > 0.5) { g.strokeStyle = alpha('#000000', 0.12); g.lineWidth = 1; for (let k = y + 7; k < y + h; k += 7) { g.beginPath(); g.moveTo(x, k); g.lineTo(x + w, k); g.stroke(); } }
    g.strokeStyle = shade(col, -0.4); g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, y + h / 2); g.lineTo(x + w, y + h / 2); g.stroke();
  } else {
    g.fillStyle = shade(col, 0.16); g.fillRect(x, y, w / 2, h); g.fillStyle = shade(col, -0.18); g.fillRect(x + w / 2, y, w / 2, h);
    if (D > 0.5) { g.strokeStyle = alpha('#000000', 0.12); g.lineWidth = 1; for (let k = x + 7; k < x + w; k += 7) { g.beginPath(); g.moveTo(k, y); g.lineTo(k, y + h); g.stroke(); } }
    g.strokeStyle = shade(col, -0.4); g.lineWidth = 2.5; g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); g.stroke();
  }
  g.strokeStyle = alpha('#000000', 0.35); g.lineWidth = 1.2; g.strokeRect(x, y, w, h);
  if (D <= 0.5) return;
  for (let k = 0; k < 1 + Math.floor(rng() * 2); k++) {   // chimney stacks with their pots
    const cx = x + 8 + rng() * Math.max(1, w - 24), cy = y + 8 + rng() * Math.max(1, h - 24);
    g.fillStyle = 'rgba(10,8,8,0.35)'; g.fillRect(cx + 4, cy + 6, 14, 10);
    g.fillStyle = '#8a5a44'; g.fillRect(cx, cy, 14, 10); g.fillStyle = '#2a201c'; circ(g, cx + 4, cy + 5, 2.4); g.fill(); circ(g, cx + 10, cy + 5, 2.4); g.fill();
  }
  if (rng() < 0.3) { const sx = x + w * (0.2 + rng() * 0.5), sy = y + h * (0.15 + rng() * 0.2); g.fillStyle = '#9fb4c4'; g.fillRect(sx, sy, 16, 11); g.strokeStyle = '#3a3a3e'; g.lineWidth = 1.5; g.strokeRect(sx, sy, 16, 11); g.beginPath(); g.moveTo(sx + 8, sy); g.lineTo(sx + 8, sy + 11); g.stroke(); }   // a skylight
}
function plazaFloor(g, q, rng, D) {
  const w = q.x1 - q.x0, h = q.y1 - q.y0;
  g.fillStyle = 'rgba(10,8,8,0.3)'; rr(g, q.x0 + 10, q.y0 + 14, w, h, 40); g.fill();
  rr(g, q.x0, q.y0, w, h, 40); g.fillStyle = '#8f8374'; g.fill();
  g.save(); rr(g, q.x0, q.y0, w, h, 40); g.clip();
  if (D > 0.5) {   // cobbles: rows of little rounded setts, a touch lighter or darker each
    for (let y = q.y0 + 6; y < q.y1; y += 13) for (let x = q.x0 + ((y / 13) % 2) * 8; x < q.x1; x += 16) {
      g.fillStyle = rng() < 0.5 ? '#9a8e7f' : '#85796b'; rr(g, x, y, 13, 10, 3.5); g.fill();
    }
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 10;   // worn paths across it
    for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(q.x0 + rng() * w, q.y0); g.quadraticCurveTo(q.x0 + rng() * w, q.y0 + h / 2, q.x0 + rng() * w, q.y1); g.stroke(); }
  }
  g.restore();
  g.strokeStyle = '#5b5148'; g.lineWidth = 6; rr(g, q.x0, q.y0, w, h, 40); g.stroke();
}
// the tower: its shadow on the city, thick stone walls, and inside them the wooden floors with iron girders across
function towerFloor(g, T, z, rng, D) {
  const q = z.tower, w = q.x1 - q.x0, h = q.y1 - q.y0, WALL = 34;
  g.fillStyle = 'rgba(8,6,6,0.42)'; g.beginPath(); g.moveTo(q.x1, q.y0 + 20); g.lineTo(q.x1 + 120, q.y0 + 170); g.lineTo(q.x1 + 120, q.y1 + 160); g.lineTo(q.x0 + 140, q.y1 + 160); g.lineTo(q.x0 + 20, q.y1); g.lineTo(q.x1, q.y1); g.closePath(); g.fill();   // its long shadow
  g.fillStyle = '#9c9283'; g.fillRect(q.x0 - WALL, q.y0 - WALL, w + WALL * 2, h + WALL * 2);
  // the floor: warm planks running across, joints staggered, and the iron girders under them showing through in bands
  g.fillStyle = linear(g, q.x0, q.y0, q.x1, q.y1, [[0, '#8a6440'], [1, '#6d4c2f']]); g.fillRect(q.x0, q.y0, w, h);
  if (D > 0.5) {
    for (let y = q.y0; y < q.y1; y += 18) {
      g.fillStyle = alpha(rng() < 0.5 ? '#000000' : '#ffffff', 0.04 + rng() * 0.04); g.fillRect(q.x0, y, w, 18);
      g.strokeStyle = 'rgba(35,22,12,0.45)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(q.x0, y); g.lineTo(q.x1, y); g.stroke();
      for (let x = q.x0 + rng() * 160; x < q.x1; x += 120 + rng() * 140) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 18); g.stroke(); }
    }
    for (let x = q.x0 + 150; x < q.x1 - 60; x += 260) {   // girders, riveted
      g.fillStyle = 'rgba(30,26,24,0.55)'; g.fillRect(x, q.y0, 22, h); g.fillStyle = 'rgba(120,108,96,0.35)'; g.fillRect(x, q.y0, 5, h);
      g.fillStyle = '#b08a4a'; for (let y = q.y0 + 10; y < q.y1; y += 26) { circ(g, x + 11, y, 2.2); g.fill(); }
    }
  }
  // the walls: dressed stone, lit on the top-left faces
  g.fillStyle = '#b7ad9c'; g.fillRect(q.x0 - WALL, q.y0 - WALL, w + WALL * 2, WALL); g.fillRect(q.x0 - WALL, q.y0, WALL, h);
  g.fillStyle = '#8b8172'; g.fillRect(q.x0 - WALL, q.y1, w + WALL * 2, WALL); g.fillRect(q.x1, q.y0, WALL, h);
  if (D > 0.5) {
    g.strokeStyle = 'rgba(40,34,28,0.35)'; g.lineWidth = 1.2;
    const blocks = (x0, y0, x1, y1, along) => { const n = Math.floor((along ? x1 - x0 : y1 - y0) / 30); for (let k = 0; k <= n; k++) { g.beginPath(); if (along) { const x = x0 + k * 30 + (k % 2) * 8; g.moveTo(x, y0); g.lineTo(x, y1); } else { const y = y0 + k * 30 + (k % 2) * 8; g.moveTo(x0, y); g.lineTo(x1, y); } g.stroke(); } };
    blocks(q.x0 - WALL, q.y0 - WALL, q.x1 + WALL, q.y0, true); blocks(q.x0 - WALL, q.y1, q.x1 + WALL, q.y1 + WALL, true);
    blocks(q.x0 - WALL, q.y0, q.x0, q.y1, false); blocks(q.x1, q.y0, q.x1 + WALL, q.y1, false);
  }
  g.strokeStyle = '#4c443b'; g.lineWidth = 3; g.strokeRect(q.x0 - WALL, q.y0 - WALL, w + WALL * 2, h + WALL * 2); g.strokeRect(q.x0, q.y0, w, h);
}
// the round platform on top of the tower: stone flags in rings, round the clock face
function platform(g, P, D) {
  circ(g, P.x + 60, P.y + 80, P.r); g.fillStyle = 'rgba(8,6,6,0.4)'; g.fill();
  circ(g, P.x, P.y, P.r + 14); g.fillStyle = '#7d7466'; g.fill();
  circ(g, P.x, P.y, P.r); g.fillStyle = radial(g, P.x - P.r * 0.3, P.y - P.r * 0.35, P.r * 0.1, P.x, P.y, P.r, [[0, '#b9b0a0'], [1, '#958b7c']]); g.fill();
  if (D > 0.5) {
    g.strokeStyle = 'rgba(50,42,34,0.3)'; g.lineWidth = 1.2;
    for (let r = P.r * 0.3; r < P.r; r += 34) { circ(g, P.x, P.y, r); g.stroke(); const n = Math.round(TAU * r / 46); for (let k = 0; k < n; k++) { const a = (k + (r / 34) % 2 * 0.5) / n * TAU; g.beginPath(); g.moveTo(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r); g.lineTo(P.x + Math.cos(a) * (r + 34), P.y + Math.sin(a) * (r + 34)); g.stroke(); } }
  }
}
// the roads high over the city: iron columns down to the roofs and the road's shadow falling on them (down and to the
// right, further the higher it is)
const SH = [0.17, 0.23];   // shadow offset per unit of height
function highRoad(g, T, z, D) {
  const runs = []; let cur = null;
  for (const p of z.high) { if (p.out && p.h > 12) { if (!cur) runs.push(cur = []); cur.push(p); } else cur = null; }
  for (const run of runs) {
    // the shadow
    g.beginPath();
    run.forEach((p, i) => { const o = p.q.hw + 12, x = p.q.x + p.q.nx * o + p.h * SH[0], y = p.q.y + p.q.ny * o + p.h * SH[1]; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    for (let i = run.length - 1; i >= 0; i--) { const p = run[i], o = -p.q.hw - 12; g.lineTo(p.q.x + p.q.nx * o + p.h * SH[0], p.q.y + p.q.ny * o + p.h * SH[1]); }
    g.closePath(); g.fillStyle = 'rgba(10,8,12,0.38)'; g.fill();
    // the columns, two to a bent, every so often
    for (let i = 8; i < run.length - 4; i += 22) {
      const p = run[i];
      for (const sd of [-1, 1]) {
        const o = sd * (p.q.hw - 10), x = p.q.x + p.q.nx * o, y = p.q.y + p.q.ny * o, fx = x + p.h * SH[0], fy = y + p.h * SH[1];
        g.strokeStyle = IRON; g.lineWidth = 11; g.lineCap = 'butt'; g.beginPath(); g.moveTo(x, y); g.lineTo(fx, fy); g.stroke();
        g.strokeStyle = IRON_L; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 3, y - 2); g.lineTo(fx - 3, fy - 2); g.stroke();
        g.fillStyle = '#3d3632'; ell(g, fx, fy, 10, 6); g.fill();
      }
      if (D > 0.5) {   // a cross brace between the pair
        const a = trackSample(T, p.s), b1 = [a.x - a.nx * (a.hw - 10) + p.h * SH[0] * 0.5, a.y - a.ny * (a.hw - 10) + p.h * SH[1] * 0.5], b2 = [a.x + a.nx * (a.hw - 10) + p.h * SH[0] * 0.5, a.y + a.ny * (a.hw - 10) + p.h * SH[1] * 0.5];
        g.strokeStyle = alpha(IRON, 0.8); g.lineWidth = 4; g.beginPath(); g.moveTo(...b1); g.lineTo(...b2); g.stroke();
      }
    }
  }
  g.lineCap = 'round';
}

// ---------------------------------------------------------------- over the road (baked)
export function clockStatic(g, T, K) {
  const z = clockZones(T);
  railings(g, T, z);
  if (z.spring) mainspring(g, z.spring);
  dialFace(g, K.dial);
  for (const P of K.pendulums) {   // where the pendulum swings across: a band of worn yellow and black hatching on the road
    const hw = trackSample(T, P.s).hw + 4, L = P.r * 1.1;
    g.save(); g.translate(P.x, P.y); g.rotate(Math.atan2(P.ty, P.tx));
    g.beginPath(); g.rect(-L, -hw, L * 2, hw * 2); g.clip();
    g.fillStyle = 'rgba(232,184,58,0.42)'; g.fillRect(-L, -hw, L * 2, hw * 2);
    g.fillStyle = 'rgba(30,24,20,0.38)'; for (let k = -hw - L * 2; k < hw + L * 2; k += 26) { g.beginPath(); g.moveTo(-L, k); g.lineTo(-L, k + 12); g.lineTo(L, k + 12 + L * 2); g.lineTo(L, k + L * 2); g.closePath(); g.fill(); }
    g.restore();
    g.save(); g.translate(P.x, P.y); g.rotate(Math.atan2(P.ty, P.tx)); g.strokeStyle = 'rgba(245,232,200,0.5)'; g.lineWidth = 3; g.strokeRect(-L, -hw, L * 2, hw * 2); g.restore();
  }
  for (const P of K.pendulums) for (const sd of [-1, 1]) {   // the pendulum's posts, either side of the road
    const o = sd * (P.amp + P.r + 26), x = P.x + P.nx * o, y = P.y + P.ny * o;
    g.fillStyle = SHADOW; rr(g, x - 14 + 10, y - 14 + 14, 28, 28, 5); g.fill();
    g.fillStyle = linear(g, x - 14, y - 14, x + 14, y + 14, [[0, '#6a615a'], [1, '#2b2624']]); rr(g, x - 14, y - 14, 28, 28, 5); g.fill();
    g.strokeStyle = BRASS; g.lineWidth = 2; g.stroke();
  }
}
// iron railings with brass caps along both edges of the high road (and round the outside of the balcony)
function railings(g, T, z) {
  for (const sd of [-1, 1]) {
    let on = false; const top = new Path2D(), posts = [];
    z.high.forEach((p, i) => {
      const up = p.h > 40 && (p.out || Math.hypot(p.q.x - z.plat.x, p.q.y - z.plat.y) < z.plat.r + 40) && !inRect(z.tower, p.q.x, p.q.y, 10);
      const o = sd * (p.q.hw + 8), x = p.q.x + p.q.nx * o, y = p.q.y + p.q.ny * o;
      if (!up) { on = false; return; }
      if (!on) top.moveTo(x, y); else top.lineTo(x, y);
      on = true; if (i % 3 === 0) posts.push([x, y]);
    });
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(10,8,8,0.3)'; g.lineWidth = 6; g.save(); g.translate(4, 6); g.stroke(top); g.restore();
    for (const [x, y] of posts) { circ(g, x, y, 3.2); g.fillStyle = IRON; g.fill(); }
    g.strokeStyle = IRON; g.lineWidth = 4; g.stroke(top);
    g.strokeStyle = BRASS; g.lineWidth = 1.6; g.stroke(top);
    for (let k = 0; k < posts.length; k += 4) { const [x, y] = posts[k]; circ(g, x, y, 3.6); g.fillStyle = BRASS_L; g.fill(); }
  }
}
// the Mainspring: a coiled band of blue steel inside its loop, its outer end pinned to the floor
function mainspring(g, S) {
  g.save(); g.lineCap = 'round';
  circ(g, S.x + 8, S.y + 10, S.r); g.fillStyle = SHADOW; g.fill();
  circ(g, S.x, S.y, S.r); g.fillStyle = '#4a3b2c'; g.fill();
  const turns = 7, pts = [];
  for (let a = 0; a < turns * TAU; a += 0.12) { const r = S.r * (0.16 + 0.8 * a / (turns * TAU)); pts.push([S.x + Math.cos(a) * r, S.y + Math.sin(a) * r]); }
  for (const [w, col] of [[7, '#11161f'], [4.5, '#3b5a86'], [1.6, '#9cc0ea']]) { g.strokeStyle = col; g.lineWidth = w; poly(g, pts, false); g.stroke(); }
  circ(g, S.x, S.y, S.r * 0.16); g.fillStyle = radial(g, S.x - 4, S.y - 4, 1, S.x, S.y, S.r * 0.16, [[0, BRASS_L], [1, BRASS_D]]); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke();
  g.restore();
}
// the clock face: cream enamel, Roman numerals, minute marks, a brass bezel, the maker's name
const ROMAN = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
function dialFace(g, Dl) {
  const { x, y, r } = Dl;
  g.save();
  circ(g, x + 10, y + 14, r * 1.04); g.fillStyle = SHADOW; g.fill();
  circ(g, x, y, r * 1.06); g.fillStyle = linear(g, x - r, y - r, x + r, y + r, [[0, BRASS_L], [0.5, BRASS], [1, BRASS_D]]); g.fill();
  circ(g, x, y, r * 0.97); g.fillStyle = radial(g, x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r, [[0, '#fffaf0'], [1, ENAMEL]]); g.fill();
  g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  // the chapter ring and the minute marks
  circ(g, x, y, r * 0.9); g.lineWidth = 1.5; g.stroke(); circ(g, x, y, r * 0.8); g.stroke();
  for (let k = 0; k < 60; k++) { const a = k / 60 * TAU - Math.PI / 2, r1 = k % 5 ? r * 0.875 : r * 0.83; g.lineWidth = k % 5 ? 1.6 : 3.4; g.beginPath(); g.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); g.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9); g.stroke(); }
  g.fillStyle = INK; g.font = `700 ${r * 0.13}px Georgia, "Times New Roman", serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  ROMAN.forEach((n, k) => { const a = k / 12 * TAU - Math.PI / 2, rr2 = r * 0.68; g.save(); g.translate(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); g.rotate(a + Math.PI / 2); g.fillText(n, 0, 0); g.restore(); });
  g.font = `italic 600 ${r * 0.07}px Georgia, serif`; g.fillStyle = '#5a4a3a'; g.fillText('Kernel & Sons', x, y - r * 0.32); g.fillText('LONDON', x, y + r * 0.34);
  // a soft sheen from the top left
  circ(g, x, y, r * 0.97); g.fillStyle = linear(g, x - r, y - r, x + r * 0.3, y + r * 0.3, [[0, 'rgba(255,255,255,0.25)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.06)']]); g.fill();
  g.restore();
}

// ---------------------------------------------------------------- roofs over the road (baked, over the karts)
// the arches at each end of the balcony (the hand passes over them) and where the road goes through the tower's walls
export function clockRoofs(T, K) {
  const z = clockZones(T), out = [];
  for (const H of K.hands) for (const a of [H.lo, H.lo + H.span]) {
    const ca = Math.cos(a), sa = Math.sin(a), r0 = K.dial.r * 1.08, r1 = H.r1 + 30, cx = H.x + ca * (r0 + r1) / 2, cy = H.y + sa * (r0 + r1) / 2, R = (r1 - r0) / 2 + 50;
    out.push({ x: cx - R, y: cy - R - 30, w: R * 2, h: R * 2 + 60, draw: g => arch(g, H.x + ca * r0, H.y + sa * r0, H.x + ca * r1, H.y + sa * r1) });
  }
  // gates in the tower's walls
  let was = null;
  for (const p of z.high) {
    const inT = inRect(z.tower, p.q.x, p.q.y);
    if (was !== null && inT !== was) {
      const q = p.q, o = q.hw + 46, ax = q.x - q.nx * o, ay = q.y - q.ny * o, bx = q.x + q.nx * o, by = q.y + q.ny * o, R = o + 60;
      out.push({ x: q.x - R, y: q.y - R - 30, w: R * 2, h: R * 2 + 60, draw: g => arch(g, ax, ay, bx, by) });
    }
    was = inT;
  }
  return out;
}
// a stone arch from (ax, ay) to (bx, by): a thick band of dressed stone with a keystone, lifted up the screen a little
function arch(g, ax, ay, bx, by) {
  const L = Math.hypot(bx - ax, by - ay), a = Math.atan2(by - ay, bx - ax), T2 = 26;
  g.save(); g.translate(ax, ay); g.rotate(a);
  g.fillStyle = 'rgba(10,8,8,0.35)'; g.save(); g.rotate(-a); g.translate(16, 22); g.rotate(a); rr(g, 0, -T2 / 2, L, T2, 6); g.fill(); g.restore();
  rr(g, 0, -T2 / 2, L, T2, 6); g.fillStyle = linear(g, 0, -T2 / 2, 0, T2 / 2, [[0, '#d2c8b6'], [0.5, '#b0a592'], [1, '#857a6a']]); g.fill();
  g.strokeStyle = '#4c443b'; g.lineWidth = 2.5; g.stroke();
  g.strokeStyle = 'rgba(60,50,40,0.45)'; g.lineWidth = 1.2; for (let k = 22; k < L - 10; k += 22) { g.beginPath(); g.moveTo(k, -T2 / 2); g.lineTo(k, T2 / 2); g.stroke(); }
  rr(g, L / 2 - 10, -T2 / 2 - 4, 20, T2 + 8, 3); g.fillStyle = BRASS; g.fill(); g.strokeStyle = BRASS_D; g.lineWidth = 1.5; g.stroke();   // a brass keystone
  g.restore();
}

// ---------------------------------------------------------------- every frame
const gearSprites = new Map();
function canvas(n) { return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(n, n) : Object.assign(document.createElement('canvas'), { width: n, height: n }); }
const RES = 1.5;
// a brass gear: teeth, rim, spokes with lightening holes, a hub with bolts (drawn flat: the light is added unrotated)
function gearSprite(G) {
  const sp = [5, 6, 4, 6, 3][G.i % 5] + (G.r > 140 ? 2 : 0), key = `${Math.round(G.r)}|${G.teeth}|${sp}`; if (gearSprites.has(key)) return gearSprites.get(key);
  const R = G.r, n = Math.ceil((R + 4) * 2 * RES), c = canvas(n), g = c.getContext('2d');
  g.setTransform(RES, 0, 0, RES, n / 2, n / 2); g.lineJoin = 'round';
  const tooth = Math.min(16, R * 0.12), root = R - tooth;
  g.beginPath();
  for (let k = 0; k < G.teeth; k++) {
    const a = k / G.teeth * TAU, da = TAU / G.teeth;
    const p = (r, f) => [Math.cos(a + da * f) * r, Math.sin(a + da * f) * r];
    for (const [r, f] of [[root, 0], [R, 0.18], [R, 0.42], [root, 0.6]]) g.lineTo(...p(r, f));
  }
  g.closePath(); g.fillStyle = radial(g, 0, 0, root * 0.6, 0, 0, R, [[0, '#d7a94a'], [1, '#a77a26']]); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  // the web: cut out between the rim and the hub, leaving spokes
  const rim = root * 0.8, hub = Math.max(10, R * 0.2);
  g.save(); g.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < sp; k++) {
    const a0 = (k + 0.14) / sp * TAU, a1 = (k + 0.86) / sp * TAU;
    g.beginPath(); g.arc(0, 0, rim, a0, a1); g.arc(0, 0, hub * 1.45, a1 - 0.1, a0 + 0.1, true); g.closePath(); g.fill();
  }
  g.restore();
  for (let k = 0; k < sp; k++) {   // dark edges round each cut-out
    const a0 = (k + 0.14) / sp * TAU, a1 = (k + 0.86) / sp * TAU;
    g.beginPath(); g.arc(0, 0, rim, a0, a1); g.arc(0, 0, hub * 1.45, a1 - 0.1, a0 + 0.1, true); g.closePath(); g.strokeStyle = 'rgba(40,24,6,0.8)'; g.lineWidth = 2; g.stroke();
  }
  circ(g, 0, 0, root * 0.93); g.strokeStyle = 'rgba(90,60,14,0.6)'; g.lineWidth = 1.5; g.stroke();
  circ(g, 0, 0, hub); g.fillStyle = '#b8862e'; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.8; g.stroke();
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; circ(g, Math.cos(a) * hub * 0.62, Math.sin(a) * hub * 0.62, Math.max(1.5, hub * 0.1)); g.fillStyle = '#5a3d10'; g.fill(); }
  circ(g, 0, 0, hub * 0.32); g.fillStyle = IRON; g.fill();
  const out = { c, n }; gearSprites.set(key, out); return out;
}
const VIEW = { x0: 0, y0: 0, x1: 0, y1: 0 };
function view(ctx) { const m = ctx.getTransform(), k = m.a || 1; VIEW.x0 = -m.e / k; VIEW.y0 = -m.f / k; VIEW.x1 = (ctx.canvas.width - m.e) / k; VIEW.y1 = (ctx.canvas.height - m.f) / k; return VIEW; }
const seen = (V, x, y, r) => x + r > V.x0 && x - r < V.x1 && y + r > V.y0 && y - r < V.y1;

export function clockUnder(ctx, race) {
  CALM = !!race.calm;
  const T = race.track, K = T.mech.clock, z = clockZones(T), t = race.time, V = view(ctx);
  // the gears turning, with the top-left light laid over them unturned
  for (const G of z.gears) {
    if (!seen(V, G.x, G.y, G.r + 10)) continue;
    const S = gearSprite(G);
    ctx.save(); ctx.translate(G.x, G.y); ctx.rotate(G.w * t); ctx.drawImage(S.c, -S.n / 2 / RES, -S.n / 2 / RES, S.n / RES, S.n / RES); ctx.restore();
    circ(ctx, G.x, G.y, G.r * 0.86); ctx.fillStyle = linear(ctx, G.x - G.r, G.y - G.r, G.x + G.r, G.y + G.r, [[0, 'rgba(255,240,200,0.22)'], [0.5, 'rgba(255,240,200,0)'], [1, 'rgba(20,10,0,0.22)']]); ctx.fill();
  }
  const ch = chimeAt(K, t), glow = ch >= 0 ? Math.sin(Math.PI * Math.min(1, ch / K.chime.dur)) : 0;
  // the strike: every pad glows gold (they fire double), the face shines
  if (glow > 0.01) {
    for (const P of T.pads) { const q = trackSample(T, P.s), x = q.x + q.nx * P.lat, y = q.y + q.ny * P.lat; if (!seen(V, x, y, 120)) continue; ctx.fillStyle = radial(ctx, x, y, 0, x, y, 110, [[0, `rgba(255,214,90,${0.55 * glow})`], [1, 'rgba(255,214,90,0)']]); ctx.fillRect(x - 110, y - 110, 220, 220); }
    const D2 = K.dial; circ(ctx, D2.x, D2.y, D2.r * 1.12); ctx.fillStyle = `rgba(255,214,100,${0.5 * glow})`; ctx.fill(); ctx.strokeStyle = `rgba(255,236,170,${0.8 * glow})`; ctx.lineWidth = 10; ctx.stroke();
  }
  // the hand's shadow: right under a blade that's down on the balcony, further off one lifted over the arches
  for (const H of K.hands) if (seen(V, H.x, H.y, H.r1 + 80)) for (let j = 0; j < H.arms; j++) { const a = handAngle(K, H, t, j); handShape(ctx, H.x, H.y, a, H, j, liftOf(H, a), true); }
  // the bob's shadow
  for (const P of K.pendulums) { const b = bobAt(P, t), x = P.x + P.nx * b, y = P.y + P.ny * b; if (!seen(V, x, y, 80)) continue; ell(ctx, x + 8, y + 11, P.r * 1.05, P.r * 0.95); ctx.fillStyle = 'rgba(10,8,8,0.35)'; ctx.fill(); }
}

// how far a blade at angle a is lifted: 0 down on the balcony (its open span), up to 1 just past the arches
const liftOf = (H, a) => { const u = ((a - H.lo) % TAU + TAU) % TAU, out = u <= H.span ? 0 : Math.min(u - H.span, TAU - u); return Math.min(1, out / 0.22); };
// one blade of the minute hand, from its arbor at (x, y) pointing along a: a slim iron shaft over the face out to r0,
// then the blade right across the balcony to its tip at r1: the brass spade (j 0) or the iron counterweight end with
// its round weight (j 1). lift: raised clear over the arches (bigger, its shadow further off). shadow: just its shadow.
function handShape(ctx, x, y, a, H, j, lift, shadow) {
  const ca = Math.cos(a), sa = Math.sin(a), w = H.w, r0 = H.r0, r1 = H.r1, k = 1 + 0.07 * lift;
  const P = (u, v, ox = 0, oy = 0) => [x + (ca * u - sa * v) * k + ox, y + (sa * u + ca * v) * k + oy];
  if (shadow) {
    const o = [8 + 26 * lift, 11 + 34 * lift];
    ctx.fillStyle = `rgba(10,8,8,${0.32 - 0.1 * lift})`;
    poly(ctx, [P(r0 * 0.3, -w * 0.4, ...o), P(r0, -w * 0.4, ...o), P(r0, w * 0.4, ...o), P(r0 * 0.3, w * 0.4, ...o)]); ctx.fill();
    blade(ctx, P, r0, r1, w, j, o); ctx.fill();
    if (j === 1) { const c = P(r1 - w * 0.6, 0, ...o); circ(ctx, c[0], c[1], w * 1.35 * k); ctx.fill(); }
    return;
  }
  ctx.save(); ctx.lineJoin = 'round';
  poly(ctx, [P(0, -w * 0.42), P(r0 + 4, -w * 0.42), P(r0 + 4, w * 0.42), P(0, w * 0.42)]); ctx.fillStyle = IRON; ctx.fill(); ctx.strokeStyle = BRASS_D; ctx.lineWidth = 1.5; ctx.stroke();
  const e0 = P(16, -w * 0.42), e1 = P(r0, -w * 0.42); ctx.strokeStyle = BRASS; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(...e0); ctx.lineTo(...e1); ctx.stroke();
  blade(ctx, P, r0, r1, w, j);
  ctx.fillStyle = j ? linear(ctx, ...P(r0, -w * 1.3), ...P(r0, w * 1.3), [[0, IRON_L], [0.5, IRON], [1, '#1a1715']]) : linear(ctx, ...P(r0, -w * 1.3), ...P(r0, w * 1.3), [[0, BRASS_L], [0.45, BRASS], [1, BRASS_D]]);
  ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.stroke();
  const m = (r0 + r1) / 2;
  if (j === 0) { const hole = P(m, 0); ell(ctx, hole[0], hole[1], (r1 - r0) * 0.12 * k, w * 0.42 * k, a); ctx.fillStyle = IRON; ctx.fill(); }   // a pierced heart in the spade
  else {   // brass trim down the counterweight end, and its round weight
    ctx.strokeStyle = BRASS; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(...P(r0 + 6, 0)); ctx.lineTo(...P(r1 - w * 2, 0)); ctx.stroke();
    const c = P(r1 - w * 0.6, 0); circ(ctx, c[0], c[1], w * 1.35 * k); ctx.fillStyle = radial(ctx, c[0] - w * 0.4, c[1] - w * 0.5, 1, c[0], c[1], w * 1.35 * k, [[0, BRASS_L], [0.6, BRASS], [1, BRASS_D]]); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.stroke();
    circ(ctx, c[0], c[1], w * 0.45 * k); ctx.fillStyle = IRON; ctx.fill();
  }
  ctx.restore();
}
// a blade's outline: about as wide as it bites all the way out (race-clock.js: a capsule w either side), a little
// swell along the spade, pointed at the tip
function blade(ctx, P, r0, r1, w, j, o = [0, 0]) {
  const L = r1 - r0, tip = j ? r1 - w * 0.6 : r1 + w * 0.7;
  ctx.beginPath();
  const pts = [[r0 - 6, -w * 0.55], [r0 + L * 0.1, -w * 1.05], [r0 + L * 0.5, -w * 1.25], [r0 + L * 0.85, -w * 1.1], [tip, 0], [r0 + L * 0.85, w * 1.1], [r0 + L * 0.5, w * 1.25], [r0 + L * 0.1, w * 1.05], [r0 - 6, w * 0.55]];
  pts.forEach(([u, v], i) => { const p = P(u, v, o[0], o[1]); i ? ctx.lineTo(...p) : ctx.moveTo(...p); });
  ctx.closePath();
}

export function clockOver(ctx, race) {
  CALM = !!race.calm;
  const T = race.track, K = T.mech.clock, z = clockZones(T), t = race.time, V = view(ctx);
  // the hour hand, and the minute hand over it
  if (seen(V, K.dial.x, K.dial.y, K.dial.r * 2.4)) {
    const D2 = K.dial;
    if (K.hour) {
      const a = hourAngle(K, CALM ? 0 : t), L = K.hour.len, ca = Math.cos(a), sa = Math.sin(a), P = (u, v) => [D2.x + ca * u - sa * v, D2.y + sa * u + ca * v];
      poly(ctx, [P(-L * 0.2, -7), P(L * 0.55, -12), P(L * 0.8, -16), P(L, 0), P(L * 0.8, 16), P(L * 0.55, 12), P(-L * 0.2, 7)]);
      ctx.fillStyle = 'rgba(10,8,8,0.25)'; ctx.save(); ctx.translate(8, 11); ctx.fill(); ctx.restore();
      ctx.fillStyle = IRON; ctx.fill(); ctx.strokeStyle = BRASS; ctx.lineWidth = 2; ctx.stroke();
    }
    for (const H of K.hands) for (let j = 0; j < H.arms; j++) {
      const a = handAngle(K, H, t, j), lift = liftOf(H, a);
      handShape(ctx, H.x, H.y, a, H, j, lift, false);
      if (lift <= 0) sparks(ctx, H, a, t + j * 0.37);   // dragging along the balcony
    }
    circ(ctx, D2.x, D2.y, 20); ctx.fillStyle = radial(ctx, D2.x - 6, D2.y - 7, 1, D2.x, D2.y, 20, [[0, BRASS_L], [1, BRASS_D]]); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();   // the arbor's cap
    circ(ctx, D2.x, D2.y, 6); ctx.fillStyle = IRON; ctx.fill();
  }
  // the pendulum: its gantry across the road, the rod and the bob
  for (const P of K.pendulums) {
    if (!seen(V, P.x, P.y, P.amp + 140)) continue;
    const b = bobAt(P, t), bx = P.x + P.nx * b, by = P.y + P.ny * b, o = P.amp + P.r + 26;
    const ax = P.x - P.nx * o, ay = P.y - P.ny * o, cx = P.x + P.nx * o, cy = P.y + P.ny * o;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(10,8,8,0.3)'; ctx.lineWidth = 20; ctx.beginPath(); ctx.moveTo(ax + 30, ay + 40); ctx.lineTo(cx + 30, cy + 40); ctx.stroke();   // the beam's shadow, far below
    ctx.strokeStyle = IRON; ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(cx, cy); ctx.stroke();
    ctx.strokeStyle = IRON_L; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(ax - P.tx * 6, ay - P.ty * 6); ctx.lineTo(cx - P.tx * 6, cy - P.ty * 6); ctx.stroke();
    ctx.fillStyle = BRASS_L; for (let k = -o + 14; k < o; k += 22) { circ(ctx, P.x + P.nx * k + P.tx * 5, P.y + P.ny * k + P.ty * 5, 2); ctx.fill(); }
    // the rod from the pivot (high over the middle of the road) down to the bob
    ctx.lineCap = 'round'; ctx.strokeStyle = '#3a332e'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = BRASS; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(bx, by); ctx.stroke();
    const v = Math.abs(bobVel(P, t)) / (P.amp * TAU / P.period);   // a smear behind it at the bottom of the swing
    if (v > 0.6) { const back = -Math.sign(bobVel(P, t)) * P.r * 0.9 * v; ctx.fillStyle = 'rgba(246,220,148,0.22)'; ell(ctx, bx + P.nx * back * 0.6, by + P.ny * back * 0.6, P.r * 1.2, P.r * 0.8, Math.atan2(P.ny, P.nx)); ctx.fill(); }
    circ(ctx, bx, by, P.r); ctx.fillStyle = radial(ctx, bx - P.r * 0.35, by - P.r * 0.4, P.r * 0.05, bx, by, P.r, [[0, '#fff3c4'], [0.35, BRASS_L], [0.75, BRASS], [1, BRASS_D]]); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
    circ(ctx, bx, by, P.r * 0.62); ctx.strokeStyle = alpha(BRASS_D, 0.7); ctx.lineWidth = 2; ctx.stroke();
    // the pivot's housing, high over the road: a brass drum on the beam (over the bob as it swings under it)
    rr(ctx, P.x - 22, P.y - 22, 44, 44, 9); ctx.fillStyle = 'rgba(10,8,8,0.25)'; ctx.save(); ctx.translate(14, 18); ctx.fill(); ctx.restore();
    ctx.fillStyle = linear(ctx, P.x - 22, P.y - 22, P.x + 22, P.y + 22, [[0, '#6a615a'], [1, '#2b2624']]); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    circ(ctx, P.x, P.y, 13); ctx.fillStyle = radial(ctx, P.x - 4, P.y - 5, 1, P.x, P.y, 13, [[0, BRASS_L], [1, BRASS_D]]); ctx.fill(); ctx.stroke();
  }
  // steam drifting up off the vents and the chimneys
  for (const s of z.steam) {
    if (!seen(V, s.x, s.y, 200)) continue;
    for (let k = 0; k < 4; k++) {
      const ph = ((t * 0.32 * s.k + s.ph + k / 4) % 1), x = s.x + ph * 90 + Math.sin(t * 0.8 + k + s.ph) * 10, y = s.y - ph * 150, r = 14 + ph * 40;
      ctx.fillStyle = radial(ctx, x, y, 0, x, y, r, [[0, `rgba(240,236,228,${0.35 * (1 - ph)})`], [1, 'rgba(240,236,228,0)']]); ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
}

// sparks off a blade where it drags along the balcony, flying back the way it came (worked out from the clock, so the
// same on every screen and nothing is kept)
function sparks(ctx, H, a, t) {
  const ca = Math.cos(a), sa = Math.sin(a), back = [H.dir * sa, -H.dir * ca];   // (behind it, the way it's come from)
  ctx.lineCap = 'round';
  for (let k = 0; k < 9; k++) {
    const seed = Math.floor(t * 20) * 9 + k, rnd = n => { const v = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453; return v - Math.floor(v); };
    const r = H.r0 + 12 + rnd(1) * (H.r1 - H.r0 - 18), ph = (t * 20) % 1, len = 10 + rnd(2) * 22, spread = (rnd(3) - 0.5) * 0.9;
    const x0 = H.x + ca * r + back[0] * H.w, y0 = H.y + sa * r + back[1] * H.w, dx = back[0] + ca * spread, dy = back[1] + sa * spread;
    const d0 = ph * 18, x1 = x0 + dx * (d0 + len), y1 = y0 + dy * (d0 + len);
    ctx.strokeStyle = rnd(4) < 0.5 ? '#fff3b0' : '#ffb347'; ctx.globalAlpha = 0.85 * (1 - ph * 0.6); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0 + dx * d0, y0 + dy * d0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- scenery scatter
// on the roofs far below: chimney stacks, a water tank on its tower, a pigeon loft (all small: they're a long way down)
export function clockProp(g, d, shadowPass) {
  const { x, y, r, v } = d, k = Math.floor(v * 3);
  if (shadowPass) { ell(g, x + 6, y + 8, r * 0.7, r * 0.55); g.fillStyle = 'rgba(10,8,8,0.28)'; g.fill(); return; }
  if (k === 0) {   // a water tank on legs: a round wooden tub with iron hoops, its cone lid
    circ(g, x, y, r * 0.6); g.fillStyle = '#7a5634'; g.fill(); g.strokeStyle = IRON; g.lineWidth = 2; g.stroke(); circ(g, x, y, r * 0.48); g.stroke();
    circ(g, x, y, r * 0.38); g.fillStyle = radial(g, x - r * 0.15, y - r * 0.15, 1, x, y, r * 0.4, [[0, '#a9a49c'], [1, '#5f5a54']]); g.fill();
  } else if (k === 1) {   // a big chimney stack with four pots, soot round them
    rr(g, x - r * 0.6, y - r * 0.3, r * 1.2, r * 0.6, 3); g.fillStyle = '#8c5a42'; g.fill(); g.strokeStyle = '#3c2a20'; g.lineWidth = 1.5; g.stroke();
    for (let i = 0; i < 4; i++) { circ(g, x - r * 0.42 + i * r * 0.28, y, r * 0.11); g.fillStyle = '#1e1714'; g.fill(); }
  } else {   // a copper dome on a little turret, gone green
    circ(g, x, y, r * 0.55); g.fillStyle = radial(g, x - r * 0.2, y - r * 0.25, 1, x, y, r * 0.55, [[0, '#9fd6c0'], [1, '#3f7d6c']]); g.fill(); g.strokeStyle = '#2b4f45'; g.lineWidth = 1.5; g.stroke();
    circ(g, x, y, r * 0.12); g.fillStyle = BRASS; g.fill();
  }
}
// in the biggest clearings of the city: a domed hall, or a gasometer
export function clockLandmark(g, c, i) {
  const { x, y } = c, r = Math.min(c.r, 220) * 0.8;
  if (i % 2 === 0) {   // a domed hall: a square base, a ribbed copper dome, a lantern on top
    g.fillStyle = 'rgba(10,8,8,0.35)'; g.fillRect(x - r + 14, y - r + 18, r * 2, r * 2);
    g.fillStyle = '#b3a891'; g.fillRect(x - r, y - r, r * 2, r * 2); g.strokeStyle = '#5b5145'; g.lineWidth = 3; g.strokeRect(x - r, y - r, r * 2, r * 2);
    circ(g, x, y, r * 0.78); g.fillStyle = radial(g, x - r * 0.3, y - r * 0.35, r * 0.05, x, y, r * 0.8, [[0, '#a8e0c8'], [0.6, '#5a9c86'], [1, '#2f5f52']]); g.fill();
    g.strokeStyle = 'rgba(30,60,50,0.6)'; g.lineWidth = 2; for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.16, y + Math.sin(a) * r * 0.16); g.lineTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78); g.stroke(); }
    circ(g, x, y, r * 0.16); g.fillStyle = BRASS; g.fill(); g.strokeStyle = INK; g.stroke();
  } else {   // a gasometer: a ring of iron lattice round a big round holder
    circ(g, x + 14, y + 18, r * 0.9); g.fillStyle = 'rgba(10,8,8,0.35)'; g.fill();
    circ(g, x, y, r * 0.8); g.fillStyle = radial(g, x - r * 0.3, y - r * 0.3, r * 0.05, x, y, r * 0.8, [[0, '#8f8a86'], [1, '#55504c']]); g.fill();
    g.strokeStyle = IRON; g.lineWidth = 3; circ(g, x, y, r * 0.9); g.stroke();
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; circ(g, x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9, 5); g.fillStyle = IRON; g.fill(); }
    g.strokeStyle = 'rgba(30,26,24,0.4)'; g.lineWidth = 1.5; circ(g, x, y, r * 0.55); g.stroke(); circ(g, x, y, r * 0.3); g.stroke();
  }
}
