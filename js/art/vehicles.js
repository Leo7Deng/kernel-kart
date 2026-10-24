// Kernel Kart art: the road's other traffic. Garbage Collector bots are real rear-loader garbage trucks (with a plow on
// snow and ice), the Cron freight train is a diesel and its wagons, and level crossings get crossbucks, lights and
// striped gate arms. All seen from above, lit from the top left, in world units.
import { TAU } from '../core.js';
import { trackSample } from '../geometry.js';
import { circ, ell, linear, radial, rr, shade } from './paint.js';

const OUT = '#14161c';

// a Garbage Collector bot: 56 × 30, nose +x (the way it's crossing). `snowy`: a plow blade on the front
export function drawGarbageTruck(ctx, g, t, snowy) {
  ctx.save(); ctx.translate(g.x, g.y);
  ctx.fillStyle = 'rgba(10,12,20,0.28)'; ctx.save(); ctx.translate(5, 8); ctx.rotate(g.ang); rr(ctx, -30, -16, 62, 32, 6); ctx.fill(); ctx.restore();
  ctx.rotate(g.ang);
  const GREEN = '#2f8f4e', WHITE = '#eef1f2';
  for (const [x, y] of [[-17, -15], [-17, 15], [-6, -15], [-6, 15], [19, -15], [19, 15]]) { rr(ctx, x - 5, y - 3, 10, 6, 2); ctx.fillStyle = '#121317'; ctx.fill(); }
  if (snowy) {   // plow blade, angled, with snow piling off it
    ctx.fillStyle = '#5a5f68'; ctx.fillRect(27, -3, 6, 6);
    ctx.beginPath(); ctx.moveTo(32, -19); ctx.lineTo(38, -19); ctx.lineTo(42, 19); ctx.lineTo(36, 19); ctx.closePath();
    ctx.fillStyle = linear(ctx, 32, 0, 42, 0, [[0, '#c98a00'], [0.5, '#ffcf33'], [1, '#e0a800']]); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = '#ffffff'; for (let k = 0; k < 5; k++) { circ(ctx, 44 + (k % 2) * 3, -14 + k * 8 + Math.sin(t * 9 + k) * 1.5, 3.2 + (k % 3)); ctx.fill(); }
  }
  // body: the packer box, ribbed, with a recycling mark on the roof
  rr(ctx, -28, -14, 42, 28, 3); ctx.fillStyle = linear(ctx, 0, -14, 0, 14, [[0, shade(GREEN, -0.35)], [0.35, shade(GREEN, 0.18)], [0.6, GREEN], [1, shade(GREEN, -0.45)]]); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.9; ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1; for (let x = -20; x < 12; x += 6) { ctx.beginPath(); ctx.moveTo(x, -13); ctx.lineTo(x, 13); ctx.stroke(); }
  ctx.save(); ctx.translate(-4, 0); ctx.strokeStyle = WHITE; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) { ctx.save(); ctx.rotate(k * TAU / 3); ctx.beginPath(); ctx.moveTo(-4, 3.2); ctx.lineTo(1.5, 3.2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(1.5, 3.2); ctx.lineTo(-0.2, 1.6); ctx.moveTo(1.5, 3.2); ctx.lineTo(-0.2, 4.8); ctx.stroke(); ctx.restore(); }
  ctx.restore();
  // rear hopper: the dark mouth, a bag waiting to go in, and a worker in hi-vis on the step
  rr(ctx, -33, -13, 6, 26, 2); ctx.fillStyle = '#3a3f47'; ctx.fill(); rr(ctx, -32, -9, 4, 18, 1.5); ctx.fillStyle = '#0d0e11'; ctx.fill();
  circ(ctx, -30, -4, 3); ctx.fillStyle = '#1c1d22'; ctx.fill();
  circ(ctx, -36, 8, 3.2); ctx.fillStyle = '#ff8a1f'; ctx.fill(); circ(ctx, -36, 8, 1.8); ctx.fillStyle = '#ffe14d'; ctx.fill();
  // cab
  rr(ctx, 14, -15, 14, 30, 4); ctx.fillStyle = linear(ctx, 0, -15, 0, 15, [[0, '#b9c0c6'], [0.35, '#ffffff'], [1, '#9aa1a8']]); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.9; ctx.stroke();
  rr(ctx, 24, -13, 3.5, 26, 1.5); ctx.fillStyle = linear(ctx, 24, 0, 27.5, 0, [[0, '#1b2a38'], [0.6, '#8fb2c8'], [1, '#1b2a38']]); ctx.fill();
  ctx.fillStyle = GREEN; ctx.fillRect(15, -15, 3, 30);
  for (const s of [-1, 1]) { rr(ctx, 22, s * 16 - (s > 0 ? 0 : 3), 3, 3, 1); ctx.fillStyle = '#2a2d33'; ctx.fill(); }
  // amber beacons, turning
  for (const s of [-1, 1]) {
    const on = Math.sin(t * 9 + s * 1.6 + g.phase) > 0.2;
    circ(ctx, 18, s * 9, 2.4); ctx.fillStyle = on ? '#ffb300' : '#7a5200'; ctx.fill();
    if (on) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; circ(ctx, 18, s * 9, 12); ctx.fillStyle = radial(ctx, 18, s * 9, 1, 18, s * 9, 12, [[0, 'rgba(255,179,0,0.55)'], [1, 'rgba(255,179,0,0)']]); ctx.fill(); ctx.restore(); }
  }
  for (const s of [-1, 1]) { circ(ctx, 28, s * 10, 1.6); ctx.fillStyle = '#fff6d8'; ctx.fill(); }
  ctx.restore();
}

// a level crossing: on each side of the road a post with a crossbuck and two lamps, and a red-and-white gate arm that
// swings down across the road while a train is coming. Each post stands at the road's edge just clear of the ballast on
// its own approach (one before the rails, the other after), found along the real edge so it sits right on a slanted
// crossing or one in a corner too; a raised arm leans back away from the rails.
const posts = new WeakMap();
function crossingPosts(T, cr) {
  if (posts.has(cr)) return posts.get(cr);
  const R = T.rail, off = (x, y) => (x - R.ax) * R.uy - (y - R.ay) * R.ux, out = [];
  for (const side of [-1, 1]) {
    const edge = s => { const p = trackSample(T, s), l = side * (p.hw + 16); return { x: p.x + p.nx * l, y: p.y + p.ny * l, p }; };
    const cut = (s0, s1) => { const a = edge(s0), b = edge(s1); return Math.sign(off(a.x, a.y)) !== Math.sign(off(b.x, b.y)); };
    let sE = cr.s;   // where the rails cross this edge (the nearest such place)
    for (let d = 0; d < 500; d += 2) { if (cut(cr.s - d - 2, cr.s - d)) { sE = cr.s - d - 1; break; } if (cut(cr.s + d, cr.s + d + 2)) { sE = cr.s + d + 1; break; } }
    const q = trackSample(T, sE), sinA = Math.max(0.3, Math.abs(q.tx * R.uy - q.ty * R.ux));
    const { x, y, p } = edge(sE - side * (33 / sinA + 18));
    const ix = -p.nx * side, iy = -p.ny * side, bx = -p.tx * side, by = -p.ty * side;   // across the road, and back along this post's approach
    out.push({ x, y, down: Math.atan2(iy, ix), up: Math.atan2(iy * 0.3 + by * 0.95, ix * 0.3 + bx * 0.95) });
  }
  posts.set(cr, out); return out;
}
export function drawCrossing(ctx, T, cr, state, t) {
  const down = state.warn;
  for (const P of crossingPosts(T, cr)) {
    ctx.save(); ctx.translate(P.x, P.y);
    ctx.save(); ctx.rotate(down ? P.down : P.up);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(4, 1, T.halfW + 6, 7);
    rr(ctx, 0, -3.5, T.halfW + 8, 7, 3.5); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = '#e0261e'; for (let k = 10; k < T.halfW; k += 18) ctx.fillRect(k, -3.5, 9, 7);
    if (down && Math.floor(t * 4) % 2) { circ(ctx, T.halfW + 4, 0, 2.6); ctx.fillStyle = '#ff3b30'; ctx.fill(); }
    ctx.restore();
    // the post: a crossbuck and two lamps that alternate
    circ(ctx, 2, 3, 10); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
    ctx.save(); ctx.rotate(Math.PI / 4); for (const a of [0, Math.PI / 2]) { ctx.save(); ctx.rotate(a); rr(ctx, -12, -2.2, 24, 4.4, 1); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; ctx.stroke(); ctx.restore(); } ctx.restore();
    circ(ctx, 0, 0, 4.5); ctx.fillStyle = '#26282e'; ctx.fill();
    for (const k of [-1, 1]) {
      const on = down && (Math.floor(t * 4) % 2 === (k > 0 ? 1 : 0));
      circ(ctx, k * 7, 0, 3.6); ctx.fillStyle = '#16171b'; ctx.fill(); circ(ctx, k * 7, 0, 2.6); ctx.fillStyle = on ? '#ff3b30' : '#4a1414'; ctx.fill();
      if (on) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; circ(ctx, k * 7, 0, 16); ctx.fillStyle = radial(ctx, k * 7, 0, 1, k * 7, 0, 16, [[0, 'rgba(255,59,48,0.6)'], [1, 'rgba(255,59,48,0)']]); ctx.fill(); ctx.restore(); }
    }
    ctx.restore();
  }
}

// the Cron freight: a diesel and four wagons (box, tank, ore hopper, containers). Lengths match the race's train.
const CONSIST = [{ l: 150, kind: 'loco' }, { l: 125, kind: 'box' }, { l: 125, kind: 'tank' }, { l: 125, kind: 'hopper' }, { l: 125, kind: 'flat' }];
export function drawTrain(ctx, R, tr, t) {
  const ang = Math.atan2(R.uy, R.ux) + (tr.dir < 0 ? Math.PI : 0);
  let d = tr.head;
  for (const k of CONSIST) {
    const mid = d - tr.dir * k.l / 2, x = R.ax + R.ux * mid, y = R.ay + R.uy * mid, L = k.l - 6, h = L / 2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = 'rgba(10,12,20,0.35)'; ctx.fillRect(-h + 8, -20, L, 48);
    ctx.fillStyle = '#2a2c31'; ctx.fillRect(-h - 4, -3, 8, 6);   // coupler
    if (k.kind === 'loco') {
      rr(ctx, -h, -23, L, 46, [6, 16, 16, 6]); ctx.fillStyle = linear(ctx, 0, -23, 0, 23, [[0, '#a8460f'], [0.35, '#ff8a2a'], [0.6, '#f07216'], [1, '#8a3a0c']]); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#1d1f25'; ctx.fillRect(-h + 4, -14, L - 50, 28);                                    // long hood
      ctx.fillStyle = '#4a4f58'; for (let fx = -h + 14; fx < h - 60; fx += 26) { circ(ctx, fx, 0, 9); ctx.fill(); ctx.strokeStyle = '#2a2d33'; ctx.lineWidth = 1; for (let a = 0; a < 6; a++) { ctx.beginPath(); ctx.moveTo(fx, 0); ctx.lineTo(fx + Math.cos(a + t * 20) * 8, Math.sin(a + t * 20) * 8); ctx.stroke(); } }
      rr(ctx, h - 44, -19, 32, 38, 4); ctx.fillStyle = '#eceff1'; ctx.fill();                                   // cab roof
      rr(ctx, h - 14, -17, 6, 34, 2); ctx.fillStyle = linear(ctx, h - 14, 0, h - 8, 0, [[0, '#1b2a38'], [0.6, '#8fb2c8'], [1, '#1b2a38']]); ctx.fill();
      ctx.fillStyle = '#ffd34d'; for (let sx = -h + 2; sx < h - 4; sx += 14) ctx.fillRect(sx, 19, 8, 3);       // safety stripes
      for (const s of [-1, 1]) { circ(ctx, h - 4, s * 13, 3.6); ctx.fillStyle = '#fff6c2'; ctx.fill(); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,240,170,0.18)'; ctx.beginPath(); ctx.moveTo(h, s * 13); ctx.lineTo(h + 120, s * 13 - 30); ctx.lineTo(h + 120, s * 13 + 30); ctx.closePath(); ctx.fill(); ctx.restore(); }
      ctx.fillStyle = '#1d1f25'; ctx.font = '800 14px "Fredoka", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('CRON', h - 28, 1);
    } else if (k.kind === 'box') {
      rr(ctx, -h, -23, L, 46, 4); ctx.fillStyle = linear(ctx, 0, -23, 0, 23, [[0, '#5e2a1c'], [0.4, '#a2503a'], [1, '#4e2216']]); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; for (let sx = -h + 8; sx < h; sx += 8) { ctx.beginPath(); ctx.moveTo(sx, -22); ctx.lineTo(sx, 22); ctx.stroke(); }
      ctx.fillStyle = '#3a3d45'; ctx.fillRect(-h + 4, -2, L - 8, 4);   // roof walk
    } else if (k.kind === 'tank') {
      ctx.fillStyle = '#2a2c31'; ctx.fillRect(-h, -18, L, 36);
      rr(ctx, -h + 4, -20, L - 8, 40, 20); ctx.fillStyle = linear(ctx, 0, -20, 0, 20, [[0, '#3a3f48'], [0.35, '#d6dbe0'], [0.55, '#aab1b9'], [1, '#30343c']]); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke();
      circ(ctx, 0, 0, 7); ctx.fillStyle = '#6b737d'; ctx.fill(); ctx.strokeStyle = '#2a2d33'; ctx.stroke();
      ctx.fillStyle = '#ffd34d'; ctx.fillRect(-h + 20, -20, 6, 40); ctx.fillRect(h - 26, -20, 6, 40);
    } else if (k.kind === 'hopper') {
      rr(ctx, -h, -23, L, 46, 3); ctx.fillStyle = '#4c5560'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke();
      rr(ctx, -h + 5, -18, L - 10, 36, 3); ctx.fillStyle = '#20232a'; ctx.fill();
      for (let i = 0; i < 40; i++) { const px = -h + 8 + ((i * 37) % (L - 16)), py = -15 + ((i * 53) % 30); circ(ctx, px, py, 3 + (i % 3)); ctx.fillStyle = i % 2 ? '#7a6a58' : '#5c4f42'; ctx.fill(); }
      ctx.fillStyle = '#4c5560'; for (const sx of [-h / 3, h / 3]) ctx.fillRect(sx - 2, -18, 4, 36);
    } else {
      ctx.fillStyle = '#3a3d45'; ctx.fillRect(-h, -20, L, 40);
      const cols = ['#1f6fb2', '#d6452b'];
      for (const [i, cx] of [[0, -h / 2], [1, h / 2]]) { rr(ctx, cx - h / 2 + 3, -20, h - 6, 40, 2); ctx.fillStyle = linear(ctx, 0, -20, 0, 20, [[0, shade(cols[i], -0.35)], [0.4, shade(cols[i], 0.15)], [1, shade(cols[i], -0.4)]]); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; ctx.stroke(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; for (let sx = cx - h / 2 + 8; sx < cx + h / 2 - 6; sx += 5) { ctx.beginPath(); ctx.moveTo(sx, -19); ctx.lineTo(sx, 19); ctx.stroke(); } }
    }
    ctx.restore();
    d -= tr.dir * (k.l + 6);
  }

}
