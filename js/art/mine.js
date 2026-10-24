// Kernel Kart art: secret shortcuts (race-secret.js), the mine kind (Cron Canyon). Cartoon style, like the boost pads:
// chunky shapes, a dark ink outline, warm colours. An old mine's mouth cut into a round sandstone outcrop out in the
// run-off: a dark arched adit in a chunky timber frame with bolts, a cart rail on fat sleepers running into it from the
// road's edge, a lantern either side glowing warm, a little ore cart parked by it and a sign with a pickaxe on it; and,
// further up the lap, the portal you come out of. The ride is quick: the kart dives in with a puff of dust, a glowing
// trail of dots races along under the ground to the portal (its headlights a bright spark at the front, dust kicked up
// behind, pebbles hopping on the rocks as it rumbles past) and it bursts out of the portal in a flash and a ring of
// dust clouds. All of it from the ride's pose (c.secretT, eased online); the only particles are the race's bursts.
// The rocks are lit from the top left like everything else (drawn in world orientation, shadows down-right).
import { TAU, clamp } from '../core.js';
import { circ, ell, linear, poly, radial } from './paint.js';
import { SECRET } from '../race-secret.js';

const INK = '#3a1f12', ROCK = '#d27a46', ROCK_LT = '#f0b27a', ROCK_DK = '#9c4a28', WOOD = '#9a6236', WOOD_LT = '#c98a52', DUST = '#f3d6ae';
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

// ------------------------------------------------------------------------------------------------ the mine, built
// Seen like the canyon's buttes (art/canyon.js): from above, heights straight up the screen (MZ per unit), so a rock's
// cliff shows along its lower (south) edge and its flat cap above. The mine is cut into the foot of a sandstone outcrop:
// a cliff of layered strata, lit from the top left; in it an arched adit, dark inside, framed by a sturdy timber set
// (two posts and a cap beam with its ends showing, braces in the corners, nails), a lantern hanging either side of it;
// rails on their sleepers curving out of the dark down to the road; an ore cart heaped with gold, and a weathered sign.
// The portal you come out of is the same, without the cart and sign. (The road is assumed south of both: the cliff and
// the opening face down the screen.)
const MZ = 0.9;
const SAND = ['#d8834e', '#c96f3d', '#e49a62', '#b9603a', '#d27a46'], CAP = '#e9ad74', CAP_LT = '#f6c896', CLIFF_SH = '#8f4325';
// where the pieces of a site are: O the foot of the opening (on the ground), its half-width and height, the outcrop's
// size, the lanterns (where their glow centres)
export function mineSite(z, portal) {
  const X = portal ? z.portal : z.mouth, w = Math.max(18, Math.min(28, z.r * 0.5)), oh = w * 1.5, H = w * 2.8, Rb = w * 3.6;
  return { O: { x: X.x, y: X.y }, w, oh, H, Rb, lanterns: [-1, 1].map(s => [X.x + s * (w + 13), X.y - oh * MZ * 0.62]), portal };
}
// the outcrop's footprint: a lumpy round shape whose south edge runs along y0, centred on cx
function footprint(cx, y0, Rb, seed) {
  const pts = []; for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, k = 1 + 0.08 * Math.sin(a * 3 + seed) + 0.05 * Math.sin(a * 5 + seed * 2.1); pts.push([cx + Math.cos(a) * Rb * k, y0 - Rb * 0.62 + Math.sin(a) * Rb * 0.62 * k]); }
  return pts;
}
function site(g, S, seed, extras) {
  const { O, w, oh, H, Rb } = S, foot = footprint(O.x, O.y, Rb, seed), top = foot.map(([x, y]) => [x, y - H * MZ]);
  // the shadow, down-right
  poly(g, foot.map(([x, y]) => [x + H * 0.32, y + H * 0.42])); g.fillStyle = 'rgba(70,22,8,0.26)'; g.fill();
  // the cliff: the south half of the footprint swept up to the cap, in bands of strata, lit on the left, shaded right
  const south = foot.filter(([, y]) => y >= O.y - Rb * 0.62).sort((a, b) => a[0] - b[0]);
  const wall = [...south, ...south.slice().reverse().map(([x, y]) => [x, y - H * MZ])];
  g.save(); poly(g, wall); g.clip();
  const x0 = O.x - Rb * 1.1, x1 = O.x + Rb * 1.1, yTop = O.y - H * MZ - Rb * 0.2;
  for (let k = 0; k < 7; k++) { const y = yTop + k * (H * MZ + Rb * 0.25) / 7; g.fillStyle = SAND[(k + seed * 3 | 0) % SAND.length]; g.beginPath(); g.moveTo(x0, y); for (let u = 0; u <= 12; u++) g.lineTo(x0 + (x1 - x0) * u / 12, y + Math.sin(u * 1.7 + k + seed) * 2.5); g.lineTo(x1, O.y + 20); g.lineTo(x0, O.y + 20); g.closePath(); g.fill(); }
  g.fillStyle = linear(g, x0, 0, x1, 0, [[0, 'rgba(255,230,190,0.25)'], [0.45, 'rgba(255,230,190,0)'], [1, 'rgba(60,20,8,0.35)']]); g.fillRect(x0, yTop, x1 - x0, O.y + 20 - yTop);
  g.strokeStyle = 'rgba(80,28,10,0.25)'; g.lineWidth = 1; for (let k = 0; k < 9; k++) { const xx = x0 + (x1 - x0) * hash(k, seed); g.beginPath(); g.moveTo(xx, yTop + 10 + hash(seed, k) * 20); g.lineTo(xx + 3, yTop + 30 + hash(k, k) * 40); g.stroke(); }   // cracks
  g.restore();
  // the cap: lit, a bright rim along its south edge, scrub and stones on it
  poly(g, top); g.fillStyle = radial(g, O.x - Rb * 0.3, O.y - H * MZ - Rb * 0.9, Rb * 0.1, O.x, O.y - H * MZ - Rb * 0.62, Rb * 1.1, [[0, CAP_LT], [1, CAP]]); g.fill();
  g.strokeStyle = 'rgba(255,240,215,0.7)'; g.lineWidth = 1.6; g.beginPath(); south.forEach(([x, y], i) => i ? g.lineTo(x, y - H * MZ) : g.moveTo(x, y - H * MZ)); g.stroke();
  g.strokeStyle = 'rgba(80,28,10,0.35)'; g.lineWidth = 1; poly(g, top); g.stroke();
  const ccx = O.x, ccy = O.y - H * MZ - Rb * 0.62;   // the cap's middle: worn contour rings of the rock, like the mesas'
  g.strokeStyle = 'rgba(150,80,40,0.28)'; g.lineWidth = 1; for (const k of [0.78, 0.55, 0.32]) { poly(g, top.map(([x, y]) => [ccx + (x - ccx) * k + Rb * 0.06, ccy + (y - ccy) * k + Rb * 0.03])); g.stroke(); }
  for (let k = 0; k < 4; k++) { const a = hash(k, seed + 3) * TAU, d = Rb * 0.5 * hash(seed, k + 7), sx = ccx + Math.cos(a) * d, sy = ccy + Math.sin(a) * d * 0.6; scrubTuft(g, sx, sy, 5 + 3 * hash(k, 2)); }
  for (let k = 0; k < 7; k++) { const a = hash(k, seed + 11) * TAU, d = Rb * 0.7 * hash(seed + 2, k), sx = ccx + Math.cos(a) * d, sy = ccy + Math.sin(a) * d * 0.6; circ(g, sx, sy, 2.2); g.fillStyle = 'rgba(120,150,80,0.55)'; g.fill(); }   // scrub dots
  // the opening: an arch in the cliff's foot, black at the back, warm brown at the lip, lantern light on its floor
  const yb = O.y, yt = O.y - oh * MZ;
  const arch = () => { g.beginPath(); g.moveTo(O.x - w, yb); g.lineTo(O.x - w, yt + w * 0.55); g.quadraticCurveTo(O.x - w, yt, O.x, yt); g.quadraticCurveTo(O.x + w, yt, O.x + w, yt + w * 0.55); g.lineTo(O.x + w, yb); g.closePath(); };
  arch(); g.fillStyle = radial(g, O.x, yb - oh * MZ * 0.45, 2, O.x, yb - oh * MZ * 0.3, w * 1.3, [[0, '#050302'], [0.55, '#1c0e07'], [1, '#4a2614']]); g.fill();
  g.fillStyle = linear(g, 0, yb - 8, 0, yb, [[0, 'rgba(255,170,80,0)'], [1, 'rgba(255,170,80,0.35)']]); arch(); g.fill();
  // the rails: two on their sleepers, curving out of the dark and down toward the road
  if (extras.rail) {
    const [ex, ey] = extras.rail, cx = (O.x + ex) / 2 + (ey - O.y) * 0.25, cy = (O.y + ey) / 2, Q = u => [(1 - u) * (1 - u) * O.x + 2 * u * (1 - u) * cx + u * u * ex, (1 - u) * (1 - u) * (yb - 3) + 2 * u * (1 - u) * cy + u * u * ey];
    for (let q = 0; q <= 10; q++) { const u = q / 10, [px, py] = Q(u), [nx2, ny2] = Q(Math.min(1, u + 0.02)), a = Math.atan2(ny2 - py, nx2 - px), half = w * 0.62 * (0.75 + 0.25 * u);
      g.save(); g.translate(px, py); g.rotate(a); g.fillStyle = u < 0.08 ? 'rgba(60,30,14,0.8)' : '#7a4a26'; g.beginPath(); g.roundRect(-2.6, -half, 5.2, half * 2, 1.5); g.fill(); g.strokeStyle = 'rgba(40,18,6,0.55)'; g.lineWidth = 0.8; g.stroke(); g.restore(); }
    for (const s of [-1, 1]) {
      g.beginPath(); for (let q = 0; q <= 20; q++) { const u = q / 20, [px, py] = Q(u), [nx2, ny2] = Q(Math.min(1, u + 0.02)), a = Math.atan2(ny2 - py, nx2 - px), off = s * w * 0.4 * (0.75 + 0.25 * u); const x = px - Math.sin(a) * off, y = py + Math.cos(a) * off; q ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.strokeStyle = '#3c3f46'; g.lineWidth = 3.4; g.stroke(); g.strokeStyle = '#b9c2cc'; g.lineWidth = 1.6; g.stroke();
    }
  }
  // the timber set: two posts, a cap beam across with its ends standing proud, braces in the corners, nails
  const post = (x) => { g.fillStyle = linear(g, x - 4, 0, x + 4, 0, [[0, '#c48a52'], [0.5, '#9a6236'], [1, '#6e4122']]); g.fillRect(x - 4, yt + 2, 8, yb - yt - 2); g.strokeStyle = 'rgba(40,18,6,0.6)'; g.lineWidth = 0.8; g.strokeRect(x - 4, yt + 2, 8, yb - yt - 2); g.strokeStyle = 'rgba(60,30,10,0.35)'; g.beginPath(); g.moveTo(x - 1, yt + 6); g.lineTo(x - 1, yb - 3); g.stroke(); };
  post(O.x - w - 1); post(O.x + w + 1);
  const by = yt - 2, bl = O.x - w - 12, br = O.x + w + 12;
  g.fillStyle = 'rgba(40,18,6,0.35)'; g.fillRect(bl + 3, by + 3, br - bl, 9);
  g.fillStyle = linear(g, 0, by, 0, by + 9, [[0, '#d39a5e'], [0.6, '#a86c3c'], [1, '#7a4a26']]); g.fillRect(bl, by, br - bl, 9); g.strokeStyle = 'rgba(40,18,6,0.6)'; g.lineWidth = 0.9; g.strokeRect(bl, by, br - bl, 9);
  for (const ex of [bl, br]) { ell(g, ex, by + 4.5, 2.6, 4.4); g.fillStyle = '#e2b47c'; g.fill(); g.strokeStyle = 'rgba(90,50,20,0.7)'; g.lineWidth = 0.6; g.stroke(); ell(g, ex, by + 4.5, 1.2, 2.2); g.stroke(); }   // the beam's sawn ends
  g.strokeStyle = 'rgba(60,30,10,0.35)'; g.beginPath(); g.moveTo(bl + 6, by + 4); g.lineTo(br - 6, by + 5); g.stroke();
  for (const s of [-1, 1]) { const x = O.x + s * (w - 1); g.save(); g.translate(x, by + 9); g.rotate(s * 0.78); g.fillStyle = '#9a6236'; g.fillRect(s < 0 ? 0 : -14, -2, 14, 4); g.strokeStyle = 'rgba(40,18,6,0.5)'; g.lineWidth = 0.7; g.strokeRect(s < 0 ? 0 : -14, -2, 14, 4); g.restore(); }   // corner braces
  g.fillStyle = '#3a3d44'; for (const x of [O.x - w - 1, O.x + w + 1]) for (const yy of [by + 3, by + 7, yb - 6]) { circ(g, x, yy, 0.9); g.fill(); }
  // the lanterns, hanging from the beam's ends on hooks
  for (const [lx, ly] of S.lanterns) {
    const hx = lx < O.x ? bl + 2 : br - 2;
    g.strokeStyle = '#3a3d44'; g.lineWidth = 1; g.beginPath(); g.moveTo(hx, by + 9); g.quadraticCurveTo(hx, ly - 8, lx, ly - 7); g.stroke();
    g.fillStyle = '#3a2a1c'; g.beginPath(); g.roundRect(lx - 4, ly - 8, 8, 3, 1.5); g.fill();
    g.fillStyle = linear(g, lx - 3, ly - 5, lx + 3, ly + 5, [[0, '#fff6c8'], [1, '#ffb43c']]); g.beginPath(); g.roundRect(lx - 3.5, ly - 5, 7, 10, 2.5); g.fill(); g.strokeStyle = '#3a2a1c'; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#3a2a1c'; g.fillRect(lx - 3, ly + 5, 6, 1.6);
  }
  if (extras.cart) cart(g, O.x + w + 30, yb + 6);
  if (extras.sign) sign(g, O.x - w - 34, yb + 4);
}
function scrubTuft(g, x, y, r) {
  ell(g, x + r * 0.4, y + r * 0.4, r, r * 0.55); g.fillStyle = 'rgba(70,22,8,0.22)'; g.fill();
  g.lineCap = 'round'; g.lineWidth = 1.2; for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + (k - 3) * 0.32; g.strokeStyle = k % 2 ? '#8a9a4a' : '#6f8a3e'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke(); }
}
// a little ore cart on the ground, seen from above and a little from the south: a riveted box on four wheels, heaped with
// rock and gold nuggets
function cart(g, x, y) {
  const w = 15, d = 9, h = 9;
  ell(g, x + 5, y + 4, w * 1.05, 4); g.fillStyle = 'rgba(70,22,8,0.3)'; g.fill();
  for (const s of [-1, 1]) { circ(g, x + s * (w - 4), y, 3.6); g.fillStyle = '#2f3238'; g.fill(); circ(g, x + s * (w - 4), y, 1.3); g.fillStyle = '#8a8f99'; g.fill(); }
  g.fillStyle = linear(g, 0, y - h * MZ, 0, y, [[0, '#d0644a'], [1, '#8f3424']]); g.beginPath(); g.moveTo(x - w, y - h * MZ); g.lineTo(x + w, y - h * MZ); g.lineTo(x + w - 2, y - 2); g.lineTo(x - w + 2, y - 2); g.closePath(); g.fill(); g.strokeStyle = 'rgba(40,14,6,0.7)'; g.lineWidth = 1; g.stroke();   // its front
  g.fillStyle = '#e3d8c8'; for (const s of [-1, 0, 1]) { circ(g, x + s * w * 0.6, y - h * MZ * 0.5, 0.9); g.fill(); }   // rivets
  g.fillStyle = '#b54a34'; g.beginPath(); g.moveTo(x - w, y - h * MZ); g.lineTo(x + w, y - h * MZ); g.lineTo(x + w - 1, y - h * MZ - d * 0.6); g.lineTo(x - w + 1, y - h * MZ - d * 0.6); g.closePath(); g.fill(); g.stroke();   // its rim
  for (let k = 0; k < 8; k++) { const nx = x - w * 0.7 + (k % 4) * w * 0.47 + (k > 3 ? 3 : 0), ny = y - h * MZ - d * 0.3 - (k > 3 ? 4 : 1); circ(g, nx, ny, k % 3 ? 3 : 2.5); g.fillStyle = k % 3 ? '#9d8a78' : '#ffd23f'; g.fill(); g.strokeStyle = 'rgba(60,30,10,0.5)'; g.lineWidth = 0.7; g.stroke(); if (!(k % 3)) { g.fillStyle = '#fff7c0'; circ(g, nx - 0.8, ny - 0.8, 0.8); g.fill(); } }
}
// a weathered sign on two stakes: a board with a pick and shovel crossed on it
function sign(g, x, y) {
  const w = 14, h = 11, z = 12;
  ell(g, x + 6, y + 3, w, 3.5); g.fillStyle = 'rgba(70,22,8,0.28)'; g.fill();
  g.fillStyle = '#6e4122'; for (const s of [-1, 1]) g.fillRect(x + s * w * 0.6 - 1.5, y - z * MZ, 3, z * MZ);
  const yt = y - z * MZ - h; g.fillStyle = linear(g, x - w, yt, x + w, yt + h, [[0, '#d7a76a'], [1, '#a8723e']]); g.beginPath(); g.moveTo(x - w, yt + 1); g.lineTo(x + w, yt - 1); g.lineTo(x + w - 1, yt + h); g.lineTo(x - w + 1, yt + h + 1); g.closePath(); g.fill(); g.strokeStyle = 'rgba(50,22,8,0.7)'; g.lineWidth = 1; g.stroke();
  g.strokeStyle = 'rgba(80,40,14,0.4)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x - w + 2, yt + h * 0.5); g.lineTo(x + w - 3, yt + h * 0.45); g.stroke();   // the grain
  g.strokeStyle = '#3a1f12'; g.lineWidth = 1.6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x - 6, yt + h - 2); g.lineTo(x + 5, yt + 2); g.stroke(); g.beginPath(); g.moveTo(x + 1, yt + 1.5); g.quadraticCurveTo(x + 6, yt + 2.5, x + 8, yt + 6); g.stroke();   // the pick
  g.beginPath(); g.moveTo(x + 6, yt + h - 2); g.lineTo(x - 4, yt + 3); g.stroke(); ell(g, x - 5.5, yt + 2.5, 2.2, 1.5, -0.7); g.fillStyle = '#3a1f12'; g.fill();   // the shovel
}
// baked into the track layer: the mine's outcrop with its mouth, rails, cart and sign; and the portal's
export function mineStatic(g, T, z) {
  if (z.kind !== 'mine') return;
  const M = mineSite(z, false), P = mineSite(z, true), toRoad = [z.x - Math.cos(z.mouth.a) * z.r * 0.35, z.y - Math.sin(z.mouth.a) * z.r * 0.35];   // (the rails stop at the road's edge)
  site(g, M, 1.7, { rail: toRoad, cart: true, sign: true });
  site(g, P, 4.1, { rail: [P.O.x + Math.cos(z.portal.a) * 70, P.O.y + Math.sin(z.portal.a) * 70] });
}

// where a ride is: f through it, and the mine's phases (in, along the tunnel, out)
function phase(c) { const K = SECRET.mine, f = clamp(1 - c.secretT / K.T, 0, 1); return { K, f, a: K.rise, b: 1 - K.back }; }
// a puffy cartoon dust cloud: three overlapping balls with a soft ink rim
function cloud(ctx, x, y, r, al, seed) {
  if (al <= 0.01 || r <= 0.5) return;
  const balls = [[0, 0, 1], [-0.7, 0.25, 0.7], [0.7, 0.2, 0.75], [0.1, -0.45, 0.65]].map(([dx, dy, k], i) => [x + dx * r + (hash(seed, i) - 0.5) * r * 0.3, y + dy * r, r * k]);
  ctx.globalAlpha = al;
  ctx.fillStyle = 'rgba(58,31,18,0.35)'; for (const [bx, by, br] of balls) { circ(ctx, bx, by, br + 1.6); ctx.fill(); }
  for (const [bx, by, br] of balls) { ctx.fillStyle = radial(ctx, bx - br * 0.35, by - br * 0.4, br * 0.1, bx, by, br, [[0, '#fff4e2'], [0.6, DUST], [1, '#d9b07e']]); circ(ctx, bx, by, br); ctx.fill(); }
  ctx.globalAlpha = 1;
}

// under the cars: lantern light flickering on the cliffs and spilling out of the openings onto the ground; and during a
// ride, the rumble running along under the ground (a soft glowing line from the mouth to where the kart is, dust puffing
// up off it), headlights in the dark, pebbles hopping on the rocks
export function mineUnder(ctx, race, T, z, t) {
  if (z.kind !== 'mine') return;
  const SM = mineSite(z, false), SP = mineSite(z, true), M = SM.O, P = SP.O;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const S of [SM, SP]) {
    for (const [lx, ly] of S.lanterns) { const fl = 0.8 + 0.2 * Math.sin(t * 7 + lx) * Math.sin(t * 4.3 + ly); ctx.fillStyle = radial(ctx, lx, ly, 1, lx, ly, 46, [[0, `rgba(255,210,120,${0.55 * fl})`], [0.35, `rgba(255,170,60,${0.2 * fl})`], [1, 'rgba(255,150,40,0)']]); circ(ctx, lx, ly, 46); ctx.fill(); }
    const fl = 0.85 + 0.15 * Math.sin(t * 5 + S.O.x); ctx.fillStyle = radial(ctx, S.O.x, S.O.y + 6, 2, S.O.x, S.O.y + 6, S.w * 2.4, [[0, `rgba(255,190,100,${0.32 * fl})`], [1, 'rgba(255,150,60,0)']]); ell(ctx, S.O.x, S.O.y + 6, S.w * 2.4, S.w * 1.2); ctx.fill();   // light spilling out onto the ground
  }
  ctx.restore();
  for (const c of race.cars) {
    if (!(c.secretT > 0) || c.T !== T || c.secretK !== z.k) continue;
    const { f, a, b } = phase(c), dx = P.x - M.x, dy = P.y - M.y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    const head = clamp((f - a) / (b - a), 0, 1), along = head * len, hx = M.x + ux * along, hy = M.y + uy * along;
    // headlights glimmering in the mouth as it goes in, and in the portal just before it comes out
    const glim = (S, k) => { if (k <= 0) return; const gx = S.O.x, gy = S.O.y - S.oh * MZ * 0.35; ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (const s of [-1, 1]) { ctx.fillStyle = radial(ctx, gx + s * 6, gy, 0, gx + s * 6, gy, 10, [[0, `rgba(255,250,220,${0.95 * k})`], [1, 'rgba(255,240,180,0)']]); circ(ctx, gx + s * 6, gy, 10); ctx.fill(); } ctx.restore(); };
    glim(SM, f > a * 0.6 && f < a + 0.18 ? Math.min(1, (f - a * 0.6) / 0.05) * (1 - (f - a * 0.6) / (a * 0.4 + 0.18)) : 0);
    glim(SP, f > b - 0.14 && f < b + 0.02 ? (f - b + 0.14) / 0.16 : 0);
    if (f > a * 0.6 && f < b + 0.12) {
      const fade = f > b ? 1 - (f - b) / 0.12 : Math.min(1, (f - a * 0.6) / 0.06);
      // the rumble: a soft warm line under the ground behind the kart, brightest where it is now
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      const n = 14; for (let q = 0; q < n; q++) {
        const d0 = along * q / n, d1 = along * (q + 1) / n, k = (q + 1) / n;
        ctx.strokeStyle = `rgba(255,150,60,${0.16 * k * fade})`; ctx.lineWidth = 22; ctx.beginPath(); ctx.moveTo(M.x + ux * d0, M.y + uy * d0); ctx.lineTo(M.x + ux * d1, M.y + uy * d1); ctx.stroke();
        ctx.strokeStyle = `rgba(255,220,150,${0.22 * k * fade})`; ctx.lineWidth = 5; ctx.stroke();
      }
      if (head > 0 && head < 1) { ctx.fillStyle = radial(ctx, hx, hy, 1, hx, hy, 40, [[0, `rgba(255,240,190,${0.6 * fade})`], [0.4, `rgba(255,180,80,${0.25 * fade})`], [1, 'rgba(255,150,40,0)']]); circ(ctx, hx, hy, 40); ctx.fill(); }
      ctx.restore();
      // dust puffing up off the ground over it as it rumbles past
      for (let q = 0; q < 7; q++) {
        const d = along - 10 - q * 34; if (d < 0) break;
        const age = (along - d) / Math.max(len, 1) * 3.5, x = M.x + ux * d + (hash(q, 1) - 0.5) * 18, y = M.y + uy * d + (hash(q, 2) - 0.5) * 14 - age * 10;
        cloud(ctx, x, y, 5 + age * 6, 0.6 * (1 - age * 0.55) * fade, q);
      }
      // pebbles hopping on both outcrops' caps as it rumbles under
      for (const S of [SM, SP]) for (let q = 0; q < 3; q++) {
        const ph = (t * 4 + q / 3 + S.O.x) % 1, cx = S.O.x + (hash(q, 9) - 0.5) * S.Rb, cy = S.O.y - S.H * MZ - S.Rb * (0.4 + 0.4 * hash(q, 3)) - Math.sin(ph * Math.PI) * 8;
        circ(ctx, cx, cy, 2.4); ctx.fillStyle = '#b8683c'; ctx.fill(); ctx.strokeStyle = 'rgba(58,31,18,0.7)'; ctx.lineWidth = 0.8; ctx.stroke();
      }
    }
    // in at the mouth: a puff of dust as it vanishes
    if (f > a * 0.6 && f < a + 0.25) { const q = (f - a * 0.6) / (a * 0.4 + 0.25); for (let k = 0; k < 4; k++) { const an = Math.PI / 2 + (k - 1.5) * 0.5; cloud(ctx, M.x + Math.cos(an) * (6 + q * 22), M.y + Math.sin(an) * (6 + q * 18), 8 + q * 8, 0.8 * (1 - q), k + 3); } }
  }
}

// over the cars: out of the portal in a flash of light and a ring of dust clouds, pebbles flying
export function mineOver(ctx, race, T, z, t) {
  if (z.kind !== 'mine') return;
  const P = z.portal, SP = mineSite(z, true);
  for (const c of race.cars) {
    if (!(c.secretT > 0) || c.T !== T || c.secretK !== z.k) continue;
    const { f, b } = phase(c); if (f < b - 0.08) continue;
    const q = clamp((f - b + 0.08) / (1 - b + 0.08), 0, 1), ex = Math.cos(P.a), ey = Math.sin(P.a);
    // the flash: a burst of warm light with short rays, out of the portal's mouth
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const fl = Math.sin(Math.min(1, q * 1.6) * Math.PI), lx = P.x, ly = P.y - SP.oh * MZ * 0.4;
    ctx.fillStyle = radial(ctx, lx, ly, 2, lx, ly, 90, [[0, `rgba(255,250,220,${0.9 * fl})`], [0.35, `rgba(255,200,100,${0.5 * fl})`], [1, 'rgba(255,160,60,0)']]); circ(ctx, lx, ly, 90); ctx.fill();
    ctx.strokeStyle = `rgba(255,230,150,${0.8 * fl})`; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (let k = 0; k < 7; k++) { const an = P.a + (k - 3) * 0.32, r0 = 26 + q * 30, r1 = r0 + 22 * fl; ctx.beginPath(); ctx.moveTo(lx + Math.cos(an) * r0, ly + Math.sin(an) * r0); ctx.lineTo(lx + Math.cos(an) * r1, ly + Math.sin(an) * r1); ctx.stroke(); }
    ctx.restore();
    // the dust: a ring of puffy clouds rolling out ahead and to the sides, and pebbles flying
    for (let k = 0; k < 8; k++) { const an = P.a + (k - 3.5) * 0.42, d = 14 + q * (50 + 30 * hash(k, 4)); cloud(ctx, P.x + Math.cos(an) * d, P.y + Math.sin(an) * d - q * 6, 9 + q * 13 * (0.7 + 0.5 * hash(k, 6)), 0.95 * (1 - q * q), k + 11); }
    for (let k = 0; k < 6; k++) { const an = P.a + (hash(k, 8) - 0.5) * 1.6, d = 20 + q * (70 + 40 * hash(k, 3)), x = P.x + Math.cos(an) * d, y = P.y + Math.sin(an) * d - Math.sin(q * Math.PI) * 26; circ(ctx, x, y, 2.4 + hash(k, 2) * 1.6); ctx.fillStyle = '#b8683c'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke(); }
  }
}
