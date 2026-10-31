// Pharaoh's Jackpot (deco 'pharaoh'): props, landmarks, the golden jackpot boxes and the slot machine over a kart
// (race-jackpot.js).
import { TAU, mulberry } from '../core.js';
import { boxZoneOf, trackSample } from '../geometry.js';
import { alpha, circ, ell, linear, poly, radial, shade } from './paint.js';
import { palm } from './props.js';

export const GOLD = '#f2b51d', GOLD_LT = '#ffe08a', GOLD_DK = '#a8700c', LAPIS = '#1f3f93', LAPIS_LT = '#3f68c9', SANDSTONE = '#d9b77a';
const SHADOW = 'rgba(40,24,6,0.26)';
const NEON = ['#29e6ff', '#ff3fbf', '#ffe14d'];

// ------------------------------------------------------------------------------------------------ symbols
// the slot machine's symbols, drawn upright in a box about 2r across: 0 scarab, 1 Eye of Horus, 2 ankh, 3 cobra
export function drawSymbol(g, k, r) {
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  if (k === 0) {   // a gold scarab, wings closed, seen from above
    g.strokeStyle = '#5a3a06'; g.lineWidth = r * 0.12;
    for (const sx of [-1, 1]) for (const y of [-0.15, 0.15, 0.45]) { g.beginPath(); g.moveTo(sx * r * 0.35, y * r); g.lineTo(sx * r * 0.8, y * r + r * 0.12); g.stroke(); }
    ell(g, 0, r * 0.15, r * 0.48, r * 0.62); g.fillStyle = radial(g, -r * 0.18, -r * 0.05, r * 0.05, 0, r * 0.15, r * 0.7, [[0, GOLD_LT], [0.6, GOLD], [1, GOLD_DK]]); g.fill();
    g.strokeStyle = '#7a4f08'; g.lineWidth = r * 0.07; g.beginPath(); g.moveTo(0, -r * 0.2); g.lineTo(0, r * 0.75); g.stroke();
    ell(g, 0, -r * 0.48, r * 0.3, r * 0.2); g.fillStyle = GOLD_DK; g.fill();
    circ(g, 0, -r * 0.78, r * 0.16); g.fillStyle = LAPIS; g.fill();
  } else if (k === 1) {   // the Eye of Horus in lapis
    g.strokeStyle = LAPIS; g.lineWidth = r * 0.16;
    g.beginPath(); g.moveTo(-r * 0.8, -r * 0.05); g.quadraticCurveTo(0, -r * 0.6, r * 0.8, -r * 0.1); g.quadraticCurveTo(0, r * 0.35, -r * 0.8, -r * 0.05); g.stroke();
    circ(g, 0, -r * 0.1, r * 0.22); g.fillStyle = LAPIS; g.fill();
    g.beginPath(); g.moveTo(-r * 0.75, -r * 0.55); g.quadraticCurveTo(0, -r * 0.95, r * 0.8, -r * 0.55); g.stroke();   // brow
    g.beginPath(); g.moveTo(-r * 0.05, r * 0.2); g.lineTo(-r * 0.15, r * 0.85); g.stroke();                          // the drop
    g.beginPath(); g.moveTo(r * 0.25, r * 0.15); g.quadraticCurveTo(r * 0.45, r * 0.75, r * 0.85, r * 0.55); g.quadraticCurveTo(r * 0.95, r * 0.3, r * 0.7, r * 0.35); g.stroke();   // the spiral
  } else if (k === 2) {   // a gold ankh
    g.strokeStyle = GOLD_DK; g.lineWidth = r * 0.34;
    g.beginPath(); g.ellipse(0, -r * 0.45, r * 0.28, r * 0.38, 0, 0, TAU); g.moveTo(-r * 0.62, 0); g.lineTo(r * 0.62, 0); g.moveTo(0, 0); g.lineTo(0, r * 0.92); g.stroke();
    g.strokeStyle = GOLD; g.lineWidth = r * 0.22; g.stroke();
    g.strokeStyle = alpha('#fff3c4', 0.8); g.lineWidth = r * 0.07; g.beginPath(); g.moveTo(-r * 0.5, -r * 0.05); g.lineTo(-r * 0.1, -r * 0.05); g.moveTo(-r * 0.05, r * 0.1); g.lineTo(-r * 0.05, r * 0.7); g.stroke();
  } else {   // the cobra: a raised hood, eyes and a flicking tongue, on red
    g.fillStyle = '#d63a2c'; g.fillRect(-r, -r, r * 2, r * 2);
    g.beginPath(); g.moveTo(0, -r * 0.85); g.bezierCurveTo(r * 0.75, -r * 0.7, r * 0.7, r * 0.2, r * 0.18, r * 0.55); g.lineTo(-r * 0.18, r * 0.55); g.bezierCurveTo(-r * 0.7, r * 0.2, -r * 0.75, -r * 0.7, 0, -r * 0.85); g.fillStyle = '#2f7d32'; g.fill();
    ell(g, 0, -r * 0.05, r * 0.22, r * 0.5); g.fillStyle = '#e9d36a'; g.fill();
    g.strokeStyle = '#2f7d32'; g.lineWidth = r * 0.25; g.beginPath(); g.moveTo(0, r * 0.5); g.quadraticCurveTo(r * 0.5, r * 0.85, -r * 0.3, r * 0.95); g.stroke();
    for (const sx of [-1, 1]) { circ(g, sx * r * 0.2, -r * 0.5, r * 0.09); g.fillStyle = '#fff04d'; g.fill(); }
    g.strokeStyle = '#ff3b3b'; g.lineWidth = r * 0.06; g.beginPath(); g.moveTo(0, -r * 0.88); g.lineTo(0, -r * 1.0); g.stroke();
  }
  g.restore();
}

// ------------------------------------------------------------------------------------------------ golden boxes
// a golden box floating at (x, y); the caller draws its shadow
export function drawGoldBox(g, r, t) {
  g.fillStyle = GOLD_DK; g.beginPath(); g.roundRect(-r + 2, -r + 3, r * 2, r * 2, r * 0.35); g.fill();
  g.fillStyle = linear(g, -r, -r, r, r, [[0, GOLD_LT], [0.45, GOLD], [1, '#c98a10']]); g.beginPath(); g.roundRect(-r, -r, r * 2, r * 2, r * 0.35); g.fill();
  g.strokeStyle = LAPIS; g.lineWidth = r * 0.16; g.beginPath(); g.roundRect(-r * 0.78, -r * 0.78, r * 1.56, r * 1.56, r * 0.22); g.stroke();
  g.save(); g.translate(0, r * 0.08); drawSymbol(g, 1, r * 0.62); g.restore();
  // a glint sliding across now and then
  const u = (t * 0.7) % 1.6 - 0.3; if (u > 0 && u < 1) { g.save(); g.beginPath(); g.roundRect(-r, -r, r * 2, r * 2, r * 0.35); g.clip(); g.fillStyle = 'rgba(255,255,255,0.55)'; const x = -r * 1.6 + u * r * 3.2; poly(g, [[x, -r], [x + r * 0.35, -r], [x - r * 0.25, r], [x - r * 0.6, r]]); g.fill(); g.restore(); }
}
// the golden boxes on the road, under the cars: a pool of gold light, the shadow, the bobbing box
export function goldBoxes(ctx, race, t) {
  for (const b of race.boxes) {
    if (!b.gold || b.t > 0) continue;
    const bob = Math.sin(t * 3.4 + b.s * 0.05) * 3, pop = b.t > -0.25 ? 1 + (b.t + 0.25) * -2 : 1;
    ctx.fillStyle = radial(ctx, b.x, b.y + 6, 2, b.x, b.y + 6, 30, [[0, `rgba(255,214,80,${0.45 + 0.15 * Math.sin(t * 5 + b.s)})`], [1, 'rgba(255,214,80,0)']]); ctx.beginPath(); ctx.arc(b.x, b.y + 6, 30, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(40,24,6,0.3)'; ctx.beginPath(); ctx.ellipse(b.x + 4, b.y + 10, 14 - bob * 0.6, 6, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(b.x, b.y - 8 + bob); ctx.scale(pop, pop); drawGoldBox(ctx, 15, t + b.s * 0.01); ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------------ the slot machine
// over a kart while car.slot runs: reels stop in turn, then it shows the win (three alike, a pair, a cobra) and fades
export function slotMachine(ctx, c, t, SPIN, SHOW, STOPS) {
  const S = c.slot, el = SPIN - S.t, fade = S.t < 0 ? Math.max(0, 1 + S.t / SHOW) : 1, pop = Math.min(1, el / 0.15);
  const W = 78, H = 34, K = 1.45, cx = c.x + c.jx, cy = c.y + c.jy - 112;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(pop * K, pop * K); ctx.globalAlpha = fade;
  const done = S.t <= 0, flash = done && S.out === 'jackpot' ? 0.5 + 0.5 * Math.sin(t * 22) : 0;
  if (done && S.out === 'jackpot') {   // rays of light behind it
    ctx.save(); ctx.rotate(t * 1.5); ctx.fillStyle = 'rgba(255,224,110,0.35)';
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - 0.13) * 80, Math.sin(a - 0.13) * 80); ctx.lineTo(Math.cos(a + 0.13) * 80, Math.sin(a + 0.13) * 80); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.roundRect(-W / 2 + 3, -H / 2 + 5, W, H, 9); ctx.fill();
  ctx.fillStyle = linear(ctx, 0, -H / 2, 0, H / 2, [[0, flash ? '#fff6c8' : GOLD_LT], [0.5, GOLD], [1, GOLD_DK]]); ctx.beginPath(); ctx.roundRect(-W / 2, -H / 2, W, H, 9); ctx.fill();
  // a pharaoh's headdress crest on top: lapis and gold stripes, and a little cobra (the uraeus)
  ctx.fillStyle = LAPIS; ctx.beginPath(); ctx.moveTo(-16, -H / 2 + 1); ctx.lineTo(-10, -H / 2 - 9); ctx.lineTo(10, -H / 2 - 9); ctx.lineTo(16, -H / 2 + 1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = GOLD; for (const x of [-7, 0, 7]) ctx.fillRect(x - 1.5, -H / 2 - 8, 3, 8);
  ctx.fillStyle = '#2f7d32'; ctx.beginPath(); ctx.arc(0, -H / 2 - 10, 3, 0, TAU); ctx.fill();
  for (let i = 0; i < 3; i++) {
    const wx = -24 + i * 24, ww = 20, wh = 24, stop = STOPS[i], stopped = el >= stop;
    const lit = done && (S.out === 'jackpot' || (S.out === 'win' && S.sym.filter(k => k === S.sym[i]).length === 2) || (S.out === 'bust' && S.sym[i] === 3));
    ctx.fillStyle = lit ? (S.out === 'bust' ? '#ffd0c8' : '#fff7d1') : '#fbf6ea'; ctx.beginPath(); ctx.roundRect(wx - ww / 2, -wh / 2, ww, wh, 4); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.roundRect(wx - ww / 2, -wh / 2, ww, wh, 4); ctx.clip();
    if (!stopped) {   // rolling: symbols streaming down past the window, blurred into streaks
      const off = (t * 9 + i * 0.37) % 1;
      for (let j = -1; j <= 1; j++) { ctx.save(); ctx.translate(wx, (j + off) * wh); ctx.globalAlpha = fade * 0.75; drawSymbol(ctx, (Math.floor(t * 9 + i) + j + 4) % 4, 7.5); ctx.restore(); }
      ctx.fillStyle = 'rgba(251,246,234,0.35)'; ctx.fillRect(wx - ww / 2, -wh / 2, ww, wh);
    } else {
      const since = el - stop, bump = since < 0.12 ? Math.sin(since / 0.12 * Math.PI) * 3 : 0;
      ctx.translate(wx, bump); drawSymbol(ctx, S.sym[i], 7.5);
    }
    ctx.restore();
    ctx.strokeStyle = GOLD_DK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(wx - ww / 2, -wh / 2, ww, wh, 4); ctx.stroke();
  }
  if (done && S.out !== 'bust') { ctx.strokeStyle = `rgba(255,255,255,${0.6 + 0.4 * flash})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-W / 2 + 1, -H / 2 + 1, W - 2, H - 2, 8); ctx.stroke(); }
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ the jackpot kerb
// the gilded inside kerb round a jackpot's boxes and an Eye of Horus at the apex, so you see the line coming
export function jackpotStatic(g, T, J) {
  if (J === T.mech.jackpots[0]) { const Z = boxZoneOf(T); if (Z) bazaar(g, T, Z); }   // (the Strip's market comes with the first one: nothing else draws for this track)
  const s0 = J.s0 - 120, s1 = J.s1 + 80, side = J.side;
  const strip = (a, b, col) => { const p = new Path2D(); for (let s = s0, k = 0; s <= s1; s += 4, k++) { const q = trackSample(T, s), o = side * (q.hw + a); k ? p.lineTo(q.x + q.nx * o, q.y + q.ny * o) : p.moveTo(q.x + q.nx * o, q.y + q.ny * o); } for (let s = s1; s >= s0; s -= 4) { const q = trackSample(T, s), o = side * (q.hw + b); p.lineTo(q.x + q.nx * o, q.y + q.ny * o); } p.closePath(); g.fillStyle = col; g.fill(p); };
  strip(-30, 10, alpha(GOLD, 0.16));
  strip(-4, 10, GOLD_DK); strip(-3, 8, GOLD);
  for (let s = s0 + 10, k = 0; s < s1; s += 16, k++) { const q = trackSample(T, s), o = side * (q.hw + 2.5); circ(g, q.x + q.nx * o, q.y + q.ny * o, 2.4); g.fillStyle = k % 2 ? LAPIS : GOLD_LT; g.fill(); }
  const q = trackSample(T, J.s), o = J.lat * 0.35;   // the eye painted on the road, toward the apex
  g.save(); g.translate(q.x + q.nx * o, q.y + q.ny * o); g.rotate(Math.atan2(q.ty, q.tx) + Math.PI / 2); g.globalAlpha = 0.55; drawSymbol(g, 1, 16); g.restore();
}

// ------------------------------------------------------------------------------------------------ the bazaar
// the plain item boxes' stretch (`boxZone`): stalls both sides and a pylon either side at each end
const AWNING = [['#c62f3b', '#f6e7c8'], [LAPIS, GOLD], ['#1aa39a', '#f4f1e6'], ['#b0328f', GOLD_LT], ['#e07a1f', '#fff3d6']];
function bazaar(g, T, Z) {
  const rng = mulberry(Math.round(Z.s0) + 7), off = (T.def.runoff || 40) + 10;
  const frame = (s, lat) => { const q = trackSample(T, s); return { x: q.x + q.nx * lat, y: q.y + q.ny * lat, a: Math.atan2(q.ty, q.tx), hw: q.hw }; };
  for (const side of [-1, 1]) for (let s = Z.s0 + 100; s < Z.s0 + Z.len - 60; s += 96 + rng() * 40) {
    const w = 64 + rng() * 22, d = 40 + rng() * 14, q = trackSample(T, s), f = frame(s, side * (q.hw + off + d / 2)), [c1, c2] = AWNING[Math.floor(rng() * AWNING.length)], ware = Math.floor(rng() * 4);
    g.save(); g.translate(f.x + 6, f.y + 8); g.rotate(f.a); g.fillStyle = SHADOW; g.fillRect(-w / 2, -d / 2, w, d); g.restore();   // its shadow, down and to the right
    g.save(); g.translate(f.x, f.y); g.rotate(f.a); if (side < 0) g.scale(1, -1);   // local: x along the road, y away from it
    g.fillStyle = c1; g.fillRect(-w / 2, -d / 2, w, d);
    g.fillStyle = c2; for (let x = -w / 2 + w / 12; x < w / 2; x += w / 6) g.fillRect(x, -d / 2, w / 12, d);
    g.fillStyle = linear(g, 0, -d / 2, 0, d / 2, [[0, 'rgba(255,255,255,0.18)'], [0.5, 'rgba(255,255,255,0)'], [0.52, 'rgba(0,0,0,0.12)'], [1, 'rgba(0,0,0,0.04)']]); g.fillRect(-w / 2, -d / 2, w, d);   // the ridge down the middle
    g.strokeStyle = shade(c1, -0.35); g.lineWidth = 1.5; g.strokeRect(-w / 2, -d / 2, w, d);
    for (let x = -w / 2, k = 0; x < w / 2 - 1; x += w / 6, k++) { g.beginPath(); g.arc(x + w / 12, -d / 2, w / 12, 0, Math.PI, true); g.fillStyle = k % 2 ? c2 : c1; g.fill(); }   // the scalloped valance on the road side
    const y = -d / 2 - 14;   // the wares out front
    if (ware === 0) { g.fillStyle = '#7a1f2b'; g.fillRect(-w * 0.32, y - 6, w * 0.64, 12); g.strokeStyle = GOLD; g.lineWidth = 1.5; g.strokeRect(-w * 0.28, y - 4, w * 0.56, 8); }   // a rug
    else if (ware === 1) for (let k = 0; k < 4; k++) { circ(g, -w * 0.3 + k * w * 0.2, y, 4.5); g.fillStyle = k % 2 ? '#b5652e' : '#cf8a46'; g.fill(); circ(g, -w * 0.3 + k * w * 0.2 - 1, y - 1, 1.8); g.fillStyle = '#5a2e12'; g.fill(); }   // clay pots
    else if (ware === 2) for (let k = 0; k < 9; k++) { const cx = -w * 0.25 + (k % 5) * w * 0.12, cy = y + (k > 4 ? 4 : -2); circ(g, cx + 0.7, cy + 0.7, 3.4); g.fillStyle = GOLD_DK; g.fill(); circ(g, cx, cy, 3.4); g.fillStyle = k % 3 ? GOLD : GOLD_LT; g.fill(); }   // gold coins
    else for (let k = 0; k < 3; k++) { const cx = -w * 0.25 + k * w * 0.25; circ(g, cx, y, 8); g.fillStyle = 'rgba(255,190,80,0.25)'; g.fill(); circ(g, cx, y, 3.5); g.fillStyle = k % 2 ? NEON[0] : '#ffcf5a'; g.fill(); }   // lanterns
    g.restore();
  }
  // a pylon either side of the road at each end: a sandstone tower, its shadow, a winged sun disc on top
  for (const s of [Z.s0, Z.s0 + Z.len]) for (const side of [-1, 1]) {
    const q = trackSample(T, s), f = frame(s, side * (q.hw + off + 16)), at = (dx, dy) => { g.translate(f.x + dx, f.y + dy); g.rotate(f.a); if (side < 0) g.scale(1, -1); };
    g.save(); at(10, 12); poly(g, [[-26, -16], [26, -16], [34, 34], [-34, 34]]); g.fillStyle = SHADOW; g.fill(); g.restore();
    g.save(); at(0, 0);
    poly(g, [[-26, -16], [26, -16], [34, 34], [-34, 34]]); g.fillStyle = linear(g, -34, 0, 34, 0, [[0, '#ecd09a'], [1, '#bf9a5c']]); g.fill();
    g.strokeStyle = 'rgba(120,85,40,0.35)'; g.lineWidth = 1.5; for (const yy of [0, 16]) { g.beginPath(); g.moveTo(-30, yy); g.lineTo(30, yy); g.stroke(); }
    ell(g, -12, 6, 12, 4); g.fillStyle = GOLD_DK; g.fill(); ell(g, 12, 6, 12, 4); g.fill();
    circ(g, 0, 6, 6.5); g.fillStyle = GOLD; g.fill(); circ(g, -1.5, 4.5, 2.2); g.fillStyle = GOLD_LT; g.fill();
    g.restore();
  }
}

// ------------------------------------------------------------------------------------------------ props
export function pharaohProp(g, d, shadowPass) {
  const { x, y, r, v } = d, rng = mulberry(Math.floor(v * 1e6) + 11);
  const t = v < 0.24 ? 0 : v < 0.38 ? 1 : v < 0.5 ? 2 : v < 0.62 ? 3 : v < 0.74 ? 4 : v < 0.86 ? 5 : 6;
  if (t === 0) {   // a date palm
    if (shadowPass) { ell(g, x + r * 0.55, y + r * 0.65, r * 1.05, r * 0.75); g.fillStyle = SHADOW; g.fill(); return; }
    palm(g, x, y, r * 1.1, rng, -0.6 + rng() * 1.2);
  } else if (t === 1) {   // an obelisk: a long shadow, the pyramidion's four faces (gold-capped), neon hieroglyphs ringing the plinth
    const s = r * 0.45;
    if (shadowPass) { poly(g, [[x - s, y + s], [x + s, y - s], [x + s + r * 2.2, y + s + r * 1.6], [x + r * 1.8, y + r * 2.1]]); g.fillStyle = SHADOW; g.fill(); return; }
    g.fillStyle = shade(SANDSTONE, -0.25); g.fillRect(x - s * 1.6, y - s * 1.6, s * 3.2, s * 3.2);
    g.fillStyle = SANDSTONE; g.fillRect(x - s * 1.5, y - s * 1.6, s * 3.0, s * 3.0);
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU, px = x + Math.cos(a) * s * 1.25, py = y + Math.sin(a) * s * 1.25; g.fillStyle = NEON[k % 3]; g.fillRect(px - 1.2, py - 1.8, 2.4, 3.6); }
    for (const [a, b, col] of [[[-s, -s], [s, -s], '#f0d9a6'], [[s, -s], [s, s], '#b99355'], [[s, s], [-s, s], '#a7813f'], [[-s, s], [-s, -s], '#e2c487']]) { poly(g, [[x + a[0], y + a[1]], [x + b[0], y + b[1]], [x, y]]); g.fillStyle = col; g.fill(); }
    poly(g, [[x - s * 0.4, y - s * 0.4], [x + s * 0.4, y - s * 0.4], [x + s * 0.4, y + s * 0.4], [x - s * 0.4, y + s * 0.4]]); g.fillStyle = GOLD; g.fill();
    poly(g, [[x - s * 0.4, y - s * 0.4], [x + s * 0.4, y - s * 0.4], [x, y]]); g.fillStyle = GOLD_LT; g.fill();
  } else if (t === 2) {   // a brazier on a tripod, flames up out of the bowl and its glow on the sand
    if (shadowPass) { ell(g, x + r * 0.3, y + r * 0.35, r * 0.5, r * 0.3); g.fillStyle = SHADOW; g.fill(); return; }
    circ(g, x, y, r * 1.1); g.fillStyle = radial(g, x, y, 1, x, y, r * 1.1, [[0, 'rgba(255,170,60,0.35)'], [1, 'rgba(255,170,60,0)']]); g.fill();
    circ(g, x, y, r * 0.42); g.fillStyle = '#6b4a1e'; g.fill(); circ(g, x - 1, y - 1, r * 0.36); g.fillStyle = '#9c6a2a'; g.fill();
    for (const [dx, dy, s, col] of [[0, 0, 0.3, '#ff6b2c'], [-0.08, -0.06, 0.22, '#ffb13b'], [-0.1, -0.1, 0.12, '#fff1a6']]) { circ(g, x + dx * r, y + dy * r, s * r); g.fillStyle = col; g.fill(); }
  } else if (t === 3) {   // a pile of gold coins and a treasure chest spilling more
    if (shadowPass) { ell(g, x + r * 0.35, y + r * 0.4, r * 0.85, r * 0.55); g.fillStyle = SHADOW; g.fill(); return; }
    for (let k = 0; k < 16; k++) { const a = rng() * TAU, o = rng() * r * 0.75, px = x + Math.cos(a) * o, py = y + Math.sin(a) * o * 0.8; circ(g, px + 0.8, py + 0.8, r * 0.16); g.fillStyle = GOLD_DK; g.fill(); circ(g, px, py, r * 0.16); g.fillStyle = k % 3 ? GOLD : GOLD_LT; g.fill(); }
    g.save(); g.translate(x - r * 0.35, y - r * 0.3); g.rotate(-0.25);
    g.fillStyle = '#6a3d1c'; g.fillRect(-r * 0.42, -r * 0.28, r * 0.84, r * 0.56); g.fillStyle = '#8c5427'; g.fillRect(-r * 0.4, -r * 0.28, r * 0.8, r * 0.26);
    g.fillStyle = GOLD; g.fillRect(-r * 0.44, -r * 0.05, r * 0.88, r * 0.08); g.fillRect(-r * 0.05, -r * 0.3, r * 0.1, r * 0.6);
    for (let k = 0; k < 5; k++) { circ(g, -r * 0.3 + k * r * 0.15, -r * 0.18, r * 0.09); g.fillStyle = k % 2 ? GOLD_LT : GOLD; g.fill(); }
    g.restore();
  } else if (t === 4) {   // a card table: green felt half-moon, chips, cards, and stools
    const rot = (v * 97) % TAU;
    if (shadowPass) { ell(g, x + r * 0.3, y + r * 0.4, r * 1.0, r * 0.7); g.fillStyle = SHADOW; g.fill(); return; }
    g.save(); g.translate(x, y); g.rotate(rot);
    for (let k = 0; k < 4; k++) { const a = Math.PI * (0.15 + k * 0.233); circ(g, Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.16); g.fillStyle = '#7a1f2b'; g.fill(); }
    g.beginPath(); g.arc(0, -r * 0.1, r * 0.8, 0, Math.PI); g.closePath(); g.fillStyle = '#6b3f1d'; g.fill();
    g.beginPath(); g.arc(0, -r * 0.1, r * 0.7, 0, Math.PI); g.closePath(); g.fillStyle = '#1f7a45'; g.fill();
    g.strokeStyle = alpha(GOLD_LT, 0.7); g.lineWidth = 1; g.beginPath(); g.arc(0, -r * 0.1, r * 0.45, 0.2, Math.PI - 0.2); g.stroke();
    for (let k = 0; k < 3; k++) { g.save(); g.translate(-r * 0.25 + k * r * 0.25, r * 0.25); g.rotate(-0.2 + k * 0.2); g.fillStyle = '#fbfbf7'; g.fillRect(-r * 0.08, -r * 0.11, r * 0.16, r * 0.22); g.fillStyle = k === 1 ? '#c62828' : '#222'; g.fillRect(-r * 0.03, -r * 0.03, r * 0.06, r * 0.06); g.restore(); }
    for (const [cx, cy, col] of [[-0.45, 0.05, '#d32f2f'], [0.45, 0.05, '#1565c0'], [0, 0.48, '#111']]) { circ(g, cx * r, cy * r, r * 0.09); g.fillStyle = col; g.fill(); circ(g, cx * r, cy * r, r * 0.05); g.fillStyle = '#fff'; g.fill(); }
    g.restore();
  } else if (t === 5) {   // a slot-machine sarcophagus: a mummy case standing in the sand, its chest three lit reels
    const rot = -0.4 + rng() * 0.8, L = r * 1.2, w = r * 0.55;
    if (shadowPass) { g.save(); g.translate(x + r * 0.35, y + r * 0.45); g.rotate(rot); ell(g, 0, 0, w * 1.1, L * 1.05); g.fillStyle = SHADOW; g.fill(); g.restore(); return; }
    g.save(); g.translate(x, y); g.rotate(rot);
    g.beginPath(); g.moveTo(0, -L); g.bezierCurveTo(w * 1.1, -L, w * 1.05, -L * 0.2, w * 0.8, L * 0.4); g.lineTo(w * 0.55, L); g.lineTo(-w * 0.55, L); g.lineTo(-w * 0.8, L * 0.4); g.bezierCurveTo(-w * 1.05, -L * 0.2, -w * 1.1, -L, 0, -L); g.closePath();
    g.fillStyle = linear(g, -w, 0, w, 0, [[0, GOLD_LT], [0.5, GOLD], [1, GOLD_DK]]); g.fill();
    g.save(); g.clip(); for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? LAPIS : GOLD; g.fillRect(-w * 1.2, -L + k * L * 0.12, w * 2.4, L * 0.06); } g.restore();   // the headdress stripes
    ell(g, 0, -L * 0.55, w * 0.42, L * 0.24); g.fillStyle = '#d9a35e'; g.fill();   // the face
    for (const sx of [-1, 1]) { ell(g, sx * w * 0.17, -L * 0.6, w * 0.1, w * 0.05); g.fillStyle = '#1a1a1a'; g.fill(); }
    g.fillStyle = '#1b1b24'; g.beginPath(); g.roundRect(-w * 0.62, -L * 0.1, w * 1.24, L * 0.36, 3); g.fill();
    for (let k = 0; k < 3; k++) { g.fillStyle = '#fbf6ea'; g.fillRect(-w * 0.55 + k * w * 0.38, -L * 0.05, w * 0.32, L * 0.26); g.save(); g.translate(-w * 0.39 + k * w * 0.38, L * 0.08); drawSymbol(g, Math.floor(rng() * 3), w * 0.13); g.restore(); }
    g.restore();
  } else {   // a big gold scarab statue on a sandstone plinth
    if (shadowPass) { ell(g, x + r * 0.35, y + r * 0.45, r * 0.95, r * 0.7); g.fillStyle = SHADOW; g.fill(); return; }
    g.fillStyle = shade(SANDSTONE, -0.2); g.beginPath(); g.roundRect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6, 4); g.fill();
    g.fillStyle = SANDSTONE; g.beginPath(); g.roundRect(x - r * 0.8, y - r * 0.82, r * 1.55, r * 1.55, 4); g.fill();
    g.save(); g.translate(x - 1, y); g.rotate((v * 53) % TAU); drawSymbol(g, 0, r * 0.65); g.restore();
  }
}

// ------------------------------------------------------------------------------------------------ the oasis
// a pool of clear turquoise water in the sand: a damp rim, reeds, papyrus, and palms leaning over it
export function oasis(g, p) {
  const rng = mulberry(Math.round(p.r * 31));
  const ring = (k, col) => { g.beginPath(); for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU, w = 1 + 0.08 * Math.sin(a * 3 + p.r) + 0.05 * Math.cos(a * 5 + 1); const x = p.x + Math.cos(a) * p.r * k * w * 1.25, y = p.y + Math.sin(a) * p.r * k * w * 0.9; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.fillStyle = col; g.fill(); };
  ring(1.22, '#cdb27a'); ring(1.1, '#b59a63'); ring(1.04, '#6f8f5a');
  const r = p.r * 1.2; ring(1, radial(g, p.x - r * 0.2, p.y - r * 0.2, 4, p.x, p.y, r, [[0, '#8ff0e6'], [0.6, '#2fc4c8'], [1, '#1b8ea3']]));
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.arc(p.x - p.r * 0.3, p.y - p.r * 0.2, p.r * 0.35, Math.PI * 1.1, Math.PI * 1.5); g.stroke();
  g.strokeStyle = '#4f7f3a'; g.lineWidth = 2; for (let k = 0; k < 26; k++) { const a = rng() * TAU, px = p.x + Math.cos(a) * p.r * 1.22, py = p.y + Math.sin(a) * p.r * 0.92; g.beginPath(); g.moveTo(px, py); g.lineTo(px + 2 + rng() * 2, py - 7 - rng() * 5); g.stroke(); }
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + rng(), px = p.x + Math.cos(a) * p.r * 1.42, py = p.y + Math.sin(a) * p.r * 1.12; ell(g, px + 12, py + 14, 22, 15); g.fillStyle = SHADOW; g.fill(); palm(g, px, py, 22, rng, a + Math.PI); }
}

// ------------------------------------------------------------------------------------------------ landmarks
// i: which landmark this is (the biggest clearing first): the pyramid casino, the sphinx, then an oasis
export function pharaohLandmark(g, c, i) {
  const { x, y, r, v } = c;
  if (i === 0) {   // the casino: a great pyramid of glass and sandstone, neon running up its edges, a gold capstone, a red carpet out to the strip
    const s = r * 0.85;
    poly(g, [[x - s, y + s], [x + s, y - s], [x + s * 1.9, y + s * 0.3], [x + s * 0.4, y + s * 1.9]]); g.fillStyle = 'rgba(60,35,10,0.28)'; g.fill();
    g.fillStyle = '#9c1c2b'; g.fillRect(x - s * 0.12, y + s, s * 0.24, s * 0.45); g.fillStyle = GOLD; g.fillRect(x - s * 0.14, y + s, s * 0.02, s * 0.45); g.fillRect(x + s * 0.12, y + s, s * 0.02, s * 0.45);
    for (const [a, b, col] of [[[-s, -s], [s, -s], '#f6e2b0'], [[s, -s], [s, s], '#c99a55'], [[s, s], [-s, s], '#b3843f'], [[-s, s], [-s, -s], '#ecd093']]) { poly(g, [[x + a[0], y + a[1]], [x + b[0], y + b[1]], [x, y]]); g.fillStyle = col; g.fill(); }
    g.strokeStyle = 'rgba(90,60,25,0.22)'; g.lineWidth = 1.2; for (let k = 1; k < 9; k++) { const q = s * k / 9; g.strokeRect(x - q, y - q, q * 2, q * 2); }
    // glass bands across the faces, catching the sky
    for (let k = 2; k < 8; k += 2) { const q = s * k / 9, q2 = s * (k + 0.6) / 9; g.fillStyle = 'rgba(80,170,220,0.35)'; poly(g, [[x - q2, y - q2], [x + q2, y - q2], [x + q, y - q], [x - q, y - q]]); g.fill(); poly(g, [[x - q2, y - q2], [x - q, y - q], [x - q, y + q], [x - q2, y + q2]]); g.fill(); }
    g.lineCap = 'round';
    for (const [k, [ex, ey]] of [[0, [-1, -1]], [1, [1, -1]], [2, [1, 1]], [0, [-1, 1]]]) {
      g.strokeStyle = alpha(NEON[k], 0.35); g.lineWidth = 7; g.beginPath(); g.moveTo(x + ex * s, y + ey * s); g.lineTo(x, y); g.stroke();
      g.strokeStyle = NEON[k]; g.lineWidth = 2.2; g.stroke();
    }
    g.strokeStyle = NEON[1]; g.lineWidth = 2; g.strokeRect(x - s, y - s, s * 2, s * 2);
    poly(g, [[x - s * 0.14, y - s * 0.14], [x + s * 0.14, y - s * 0.14], [x + s * 0.14, y + s * 0.14], [x - s * 0.14, y + s * 0.14]]); g.fillStyle = GOLD; g.fill();
    poly(g, [[x - s * 0.14, y - s * 0.14], [x + s * 0.14, y - s * 0.14], [x, y]]); g.fillStyle = GOLD_LT; g.fill(); poly(g, [[x - s * 0.14, y - s * 0.14], [x - s * 0.14, y + s * 0.14], [x, y]]); g.fillStyle = '#ffd25a'; g.fill();
    for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; circ(g, x + Math.cos(a) * s * 0.2, y + Math.sin(a) * s * 0.2, 1.6); g.fillStyle = '#fffbe0'; g.fill(); }   // marquee bulbs round the capstone
    return;
  }
  if (i === 1) {   // the sphinx lying in the sand, facing down the screen: paws out front, a nemes headdress, a long shadow
    const k = r / 150;
    g.save(); g.translate(x, y); g.scale(k, k);
    poly(g, [[-50, -120], [55, -125], [120, 40], [90, 190], [-30, 170]]); g.fillStyle = 'rgba(60,35,10,0.22)'; g.fill();   // its shadow, down and to the right
    g.strokeStyle = '#b08a4e'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(10, -125); g.quadraticCurveTo(45, -150, 30, -175); g.stroke();   // the tail
    g.fillStyle = '#b8935a'; g.beginPath(); g.roundRect(-52, -132, 104, 175, 48); g.fill();                   // the body: haunches at the back
    g.fillStyle = linear(g, -50, 0, 50, 0, [[0, '#ecd09a'], [0.6, '#d8b679'], [1, '#c29d60']]); g.beginPath(); g.roundRect(-48, -130, 92, 168, 44); g.fill();
    g.strokeStyle = 'rgba(120,85,40,0.35)'; g.lineWidth = 2; for (const y of [-95, -60]) { g.beginPath(); g.moveTo(-40, y); g.quadraticCurveTo(0, y + 8, 38, y); g.stroke(); }   // weathered courses of stone
    for (const sx of [-1, 1]) {   // the forepaws stretched out in front
      g.fillStyle = '#b8935a'; g.beginPath(); g.roundRect(sx * 30 - 15, 20, 30, 135, 13); g.fill();
      g.fillStyle = '#e2c48c'; g.beginPath(); g.roundRect(sx * 30 - 13, 20, 24, 130, 11); g.fill();
      g.strokeStyle = 'rgba(120,85,40,0.45)'; g.lineWidth = 1.5; for (const dx of [-5, 0, 5]) { g.beginPath(); g.moveTo(sx * 30 + dx - 1, 140); g.lineTo(sx * 30 + dx - 1, 150); g.stroke(); }
    }
    // the head between the paws: a nemes headdress striped lapis and gold, its lappets down onto the chest, the face in front
    g.beginPath(); g.moveTo(-26, -6); g.quadraticCurveTo(0, -18, 26, -6); g.lineTo(44, 60); g.lineTo(26, 92); g.lineTo(-26, 92); g.lineTo(-44, 60); g.closePath(); g.fillStyle = GOLD; g.fill();
    g.save(); g.clip(); for (let x = -48; x < 48; x += 9) { g.fillStyle = LAPIS; g.fillRect(x, -20, 4.5, 120); } g.restore();
    g.strokeStyle = GOLD_DK; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#c99f62'; g.beginPath(); g.roundRect(-19, 14, 38, 56, 15); g.fill();
    g.fillStyle = '#e6c58b'; g.beginPath(); g.roundRect(-18, 14, 31, 52, 14); g.fill();
    for (const sx of [-1, 1]) { ell(g, sx * 8, 32, 4.5, 2.2); g.fillStyle = '#3a2a14'; g.fill(); g.strokeStyle = '#3a2a14'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(sx * 4, 26); g.lineTo(sx * 13, 26); g.stroke(); }
    g.fillStyle = '#b68f55'; g.fillRect(-2, 36, 4, 12); g.fillStyle = '#9c7440'; g.fillRect(-7, 54, 14, 3);
    g.fillStyle = '#7a5a2a'; g.beginPath(); g.roundRect(-4, 70, 8, 20, 3); g.fill();   // the pharaoh's beard
    g.fillStyle = '#2f7d32'; g.beginPath(); g.arc(0, 4, 5, 0, TAU); g.fill(); g.fillStyle = GOLD_LT; g.beginPath(); g.arc(-1, 3, 1.6, 0, TAU); g.fill();   // the uraeus on the brow
    g.restore();
    return;
  }
  // an oasis with its palms
  oasis(g, { x, y, r: r * 0.55 });
}
