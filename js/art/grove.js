// The Tinder Grove on Kernel Pretzel (race-thicket.js) and the Kicker Park's lane paint (race-kickers.js). The thicket
// burns open after a volcano fireball, then its charred trunks lean in until they shut it; chevrons at the Ash Run's
// mouth: gold open, flashing burning, red cross shut. All from the race's plain state and the clock.
import { TAU, clamp, lerp, mulberry } from '../core.js';
import { trackSample } from '../geometry.js';
import { BURN, CLOSE, thicketState } from '../race-thicket.js';
import { alpha, circ, ell, mix, poly } from './paint.js';
import { bold } from '../look.js';

const geoCache = new WeakMap();
// where everything stands (worked out once per track)
function groveOf(T) {
  if (geoCache.has(T)) return geoCache.get(T);
  let out = null;
  const R = (T.routes || []).find(Q => Q.mech && Q.mech.thickets.length && Q.mech.thickets[0].wall);
  if (R) {
    const w = R.mech.thickets[0].wall, q = trackSample(R, w.s), hw = w.hw;
    const F = (T.routes || []).map(Q => Q.forkS && Q.forks ? Q.forkS[Q.forks.findIndex(f => f.thicket)] : null).find(Boolean);
    const at = (d, lat) => { const p = trackSample(R, w.s + d); return [p.x + p.nx * lat, p.y + p.ny * lat]; };
    // dead trees and thornbush on the flank either side of the Ash Run, off every road
    const rng = mulberry(Math.round(q.x * 7 + q.y)), trees = [], bush = [];
    const cone = (x, y, r) => (T.mech ? T.mech.volcano : []).some(v => Math.hypot(x - v.x, y - (v.y - v.H * 0.45)) < v.R + v.H * 0.45 + r + 10);   // (not up the volcano)
    const free = (x, y, r) => !cone(x, y, r) && !(T.onAnyRoad && T.onAnyRoad(x, y, (T.halfW || 70) + r + 26)) && !trees.some(o => Math.hypot(o.x - x, o.y - y) < o.r + r + 6) && !bush.some(o => Math.hypot(o.x - x, o.y - y) < o.r + r + 4);
    for (let k = 0; k < 400 && trees.length < 22; k++) {
      const d = -260 + rng() * 760, side = rng() < 0.5 ? -1 : 1, lat = side * (hw + 40 + rng() * 210), [x, y] = at(d, lat), r = 22 + rng() * 14;
      if (free(x, y, r)) trees.push({ x, y, r, v: rng() });
    }
    for (let k = 0; k < 300 && bush.length < 26; k++) {
      const d = -240 + rng() * 700, side = rng() < 0.5 ? -1 : 1, lat = side * (hw + 26 + rng() * 170), [x, y] = at(d, lat), r = 9 + rng() * 7;
      if (free(x, y, r)) bush.push({ x, y, r, v: rng() });
    }
    // the two burnt trunks that stand either side of the gap (and topple across it), and the chevrons in the mouth
    const posts = [-1, 1].map(sd => { const [x, y] = at(0, sd * (hw + 12)); return { x, y, sd, len: hw * 1.25 }; });
    const chev = F ? [0.25, 0.5, 0.75].map(f => { const s = lerp(F.sAlt + 10, w.s - 30, f), p = trackSample(R, s); return { x: p.x, y: p.y, a: Math.atan2(p.ty, p.tx), hw }; }) : [];
    out = { R, w, q, hw, at, cone, trees, bush, posts, chev, tx: q.tx, ty: q.ty, nx: q.nx, ny: q.ny };
  }
  geoCache.set(T, out); return out;
}

// ---------------------------------------------------------------------------- baked: the grove itself
// a dead tree from above: a pale trunk and bare limbs forking out, a few dry tufts still on them
function deadTree(g, x, y, r, v, shadow) {
  const rng = mulberry(Math.floor(v * 1e6) + 3), n = 5 + Math.floor(rng() * 3), a0 = rng() * TAU;
  const limbs = []; for (let k = 0; k < n; k++) { const a = a0 + k / n * TAU + (rng() - 0.5) * 0.5, L = r * (0.75 + rng() * 0.3); limbs.push({ a, L, f: (rng() - 0.5) * 1.2 }); }
  const path = (ox, oy) => { g.beginPath(); for (const l of limbs) { const ex = x + ox + Math.cos(l.a) * l.L, ey = y + oy + Math.sin(l.a) * l.L * 0.85, mx = x + ox + Math.cos(l.a) * l.L * 0.55, my = y + oy + Math.sin(l.a) * l.L * 0.5; g.moveTo(x + ox, y + oy); g.lineTo(ex, ey); g.moveTo(mx, my); g.lineTo(mx + Math.cos(l.a + l.f) * l.L * 0.4, my + Math.sin(l.a + l.f) * l.L * 0.35); } };
  if (shadow) { path(r * 0.35, r * 0.45); g.strokeStyle = 'rgba(14,8,12,0.28)'; g.lineWidth = 4; g.stroke(); return; }
  path(0, 0); g.strokeStyle = '#3a2a2a'; g.lineWidth = 5; g.stroke(); g.strokeStyle = '#8c7466'; g.lineWidth = 2.6; g.stroke();
  for (const l of limbs) if (rng() < 0.55) { const tx = x + Math.cos(l.a) * l.L * 0.8, ty = y + Math.sin(l.a) * l.L * 0.7; ell(g, tx, ty, 5 + rng() * 3, 3.5 + rng() * 2, l.a); g.fillStyle = mix('#c98a3e', '#8a5a2e', rng()); g.fill(); }
  circ(g, x, y, r * 0.2); g.fillStyle = '#5a463e'; g.fill(); circ(g, x - r * 0.05, y - r * 0.05, r * 0.11); g.fillStyle = '#a89080'; g.fill();
}
// dry thornbush: a ball of scribbled twigs, straw coloured, darker underneath
function thornbush(g, x, y, r, v, shadow, burnt = 0) {
  const rng = mulberry(Math.floor(v * 1e6) + 11);
  if (shadow) { ell(g, x + r * 0.35, y + r * 0.45, r * 1.05, r * 0.8); g.fillStyle = 'rgba(14,8,12,0.25)'; g.fill(); return; }
  circ(g, x, y, r); g.fillStyle = mix('#7a5a34', '#241818', burnt); g.fill();
  circ(g, x - r * 0.18, y - r * 0.2, r * 0.72); g.fillStyle = mix('#b8935a', '#3a2a28', burnt); g.fill();
  g.strokeStyle = mix('#e2c48a', '#5a4440', burnt); g.lineWidth = 1.1; g.beginPath();
  for (let k = 0; k < 9; k++) { const a = rng() * TAU, d = r * rng() * 0.8, l = r * (0.35 + rng() * 0.5), b = a + (rng() - 0.5) * 2.5; g.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d); g.lineTo(x + Math.cos(a) * d + Math.cos(b) * l, y + Math.sin(a) * d + Math.sin(b) * l); }
  g.stroke();
}
export function groveStatic(g, T) {
  const G = groveOf(T); if (!G) return;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  // ash on the ground round the grove: soft grey patches
  const rng = mulberry(91);
  for (let k = 0; k < 16; k++) { const [x, y] = G.at(-200 + rng() * 620, (rng() < 0.5 ? -1 : 1) * (G.hw + 30 + rng() * 170)); if (G.cone(x, y, 30)) continue; ell(g, x, y, 40 + rng() * 50, 26 + rng() * 30, rng() * TAU); g.fillStyle = 'rgba(150,135,140,0.10)'; g.fill(); }
  for (const b of G.bush) thornbush(g, b.x, b.y, b.r, b.v, true);
  for (const t of G.trees) deadTree(g, t.x, t.y, t.r, t.v, true);
  for (const b of G.bush) thornbush(g, b.x, b.y, b.r, b.v, false);
  for (const t of [...G.trees].sort((a, b) => a.y - b.y)) deadTree(g, t.x, t.y, t.r, t.v, false);
  // the burnt stumps the gate trunks stand on, and a scorch either side of the gap
  for (const p of G.posts) { ell(g, p.x, p.y, 20, 13); g.fillStyle = 'rgba(20,12,14,0.35)'; g.fill(); }
  g.restore();
}

// ---------------------------------------------------------------------------- live, on the road under the cars
// the chevrons into the Ash Run's mouth, and the charred gap's ash and embers while it's open
export function groveUnder(ctx, race) {
  const T = race.track, G = groveOf(T); if (!G) return;
  const t = race.time, st = thicketState(race, 0, t), fl = bold();
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const open = st.k === 'open', hot = st.k === 'incoming' || st.k === 'burning', blink = Math.sin(t * 10) > 0;
  for (const c of G.chev) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
    const w = c.hw * 0.55;
    if (open || st.k === 'closing') { poly(ctx, [[-10, -w], [12, 0], [-10, w], [-24, w], [-2, 0], [-24, -w]]); ctx.fillStyle = alpha(st.k === 'closing' && blink ? '#ff5a3c' : '#ffcf33', fl ? 1 : 0.85); ctx.fill(); }
    else if (hot) { poly(ctx, [[-10, -w], [12, 0], [-10, w], [-24, w], [-2, 0], [-24, -w]]); ctx.fillStyle = alpha('#ff8a2a', blink ? 0.85 : 0.35); ctx.fill(); }
    else { ctx.strokeStyle = alpha('#e8362b', 0.75); ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-16, -16); ctx.lineTo(16, 16); ctx.moveTo(16, -16); ctx.lineTo(-16, 16); ctx.stroke(); }
    ctx.restore();
  }
  // the gap: a smudge of ash across the road, embers in it glowing and dimming as its time runs out
  if (st.k === 'open' || st.k === 'closing' || st.k === 'burning') {
    const z = race.track.mech.thickets[0], life = st.k === 'burning' ? 1 : clamp(st.u / (z.open - 0), 0, 1);
    for (let k = 0; k < 7; k++) { const [x, y] = G.at(-30 + k * 10, (k - 3) * G.hw * 0.27); ell(ctx, x, y, 34, 22, k); ctx.fillStyle = `rgba(28,20,22,${0.22 * (0.4 + 0.6 * life)})`; ctx.fill(); }
    const rng = mulberry(7);
    for (let k = 0; k < 26; k++) {
      const [x, y] = G.at(-40 + rng() * 80, (rng() * 2 - 1) * G.hw * 0.95), tw = 0.5 + 0.5 * Math.sin(t * (3 + rng() * 4) + k), a = life * (0.35 + 0.65 * tw);
      if (a < 0.05) continue;
      circ(ctx, x, y, 1.6 + rng() * 2); ctx.fillStyle = `rgba(255,${120 + Math.round(90 * tw)},40,${a})`; ctx.fill();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------- over the cars: the thicket, the fire, the fireball
// a flame: a cartoon teardrop licking up the screen, flickering (k: its size)
function flame(ctx, x, y, k, t, seed, fl) {
  const f = 0.85 + 0.15 * Math.sin(t * 13 + seed * 5) + 0.08 * Math.sin(t * 21 + seed), h = 30 * k * f, w = 12 * k, sway = Math.sin(t * 7 + seed * 3) * 4 * k;
  const drop = (s, col) => { ctx.beginPath(); ctx.moveTo(x - w * s, y); ctx.quadraticCurveTo(x - w * s * 1.1, y - h * s * 0.55, x + sway, y - h * s); ctx.quadraticCurveTo(x + w * s * 1.1, y - h * s * 0.55, x + w * s, y); ctx.quadraticCurveTo(x, y + w * s * 0.6, x - w * s, y); ctx.fillStyle = col; ctx.fill(); };
  drop(1, fl ? '#ff4a1c' : '#e8441a'); drop(0.7, '#ff9a2a'); drop(0.42, '#ffe066');
}
// a fallen trunk lying from (x0, y0) to (x1, y1): charred bark, a broken end, a stub or two
function log(ctx, x0, y0, x1, y1, r, glow = 0) {
  const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0);
  ctx.save(); ctx.translate(x0, y0); ctx.rotate(a);
  ctx.fillStyle = 'rgba(14,8,12,0.3)'; ctx.beginPath(); ctx.roundRect(4, -r + 6, L, r * 2, r); ctx.fill();
  ctx.fillStyle = '#2c1f1f'; ctx.beginPath(); ctx.roundRect(0, -r, L, r * 2, r); ctx.fill();
  ctx.fillStyle = '#4f3a34'; ctx.beginPath(); ctx.roundRect(2, -r, L - 4, r * 0.9, r * 0.5); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.2; for (let u = 10; u < L - 6; u += 13) { ctx.beginPath(); ctx.moveTo(u, -r * 0.7); ctx.lineTo(u + 6, r * 0.6); ctx.stroke(); }
  if (glow > 0) { ctx.strokeStyle = `rgba(255,120,30,${0.7 * glow})`; ctx.lineWidth = 1.6; for (let u = 14; u < L - 8; u += 17) { ctx.beginPath(); ctx.moveTo(u, -r * 0.3); ctx.lineTo(u + 5, r * 0.4); ctx.stroke(); } }
  circ(ctx, L - 1, 0, r * 0.95); ctx.fillStyle = '#8a6a52'; ctx.fill(); circ(ctx, L - 1, 0, r * 0.5); ctx.fillStyle = '#5a4034'; ctx.fill();
  ctx.strokeStyle = '#2c1f1f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(L * 0.35, -r); ctx.lineTo(L * 0.42, -r - 8); ctx.moveTo(L * 0.7, r); ctx.lineTo(L * 0.76, r + 7); ctx.stroke();
  ctx.restore();
}
// a burnt trunk at its stump, leaning by `lean` (0 upright, 1 lying across the road)
function trunk(ctx, G, p, lean, t, ember) {
  const a = lean * Math.PI / 2, ex = p.x - p.sd * G.nx * p.len * Math.sin(a), ey = p.y - p.sd * G.ny * p.len * Math.sin(a) - 34 * Math.cos(a);
  log(ctx, p.x, p.y, ex, ey, 10 + 2 * Math.cos(a), ember);
  if (ember > 0.05) { circ(ctx, ex, ey, 3.5); ctx.fillStyle = `rgba(255,170,60,${ember * (0.6 + 0.4 * Math.sin(t * 9 + p.sd))})`; ctx.fill(); }
}
// the barricade across the road: two trunks crossed over it and thornbush caught along it
function barricade(ctx, G, t, burn, wobble = 0) {
  const hw = G.hw, B = [];
  for (let k = 0; k < 11; k++) { const row = k % 2, f = (k + 0.5) / 11; B.push({ d: row ? 16 : -14, lat: (f * 2 - 1) * (hw + 8), r: 17 + ((k * 5) % 4) * 2.2, v: 0.1 + k * 0.077 }); }
  for (const b of B) { const [x, y] = G.at(b.d, b.lat); thornbush(ctx, x, y, b.r, b.v, true); }
  for (const b of B.filter(b => b.d < 0)) { const [x, y] = G.at(b.d, b.lat); thornbush(ctx, x + Math.sin(t * 3 + b.v * 9) * wobble, y, b.r, b.v, false, burn); }
  log(ctx, ...G.at(-10, -hw - 14), ...G.at(14, hw + 16), 11, burn);
  log(ctx, ...G.at(16, hw + 10), ...G.at(-6, -hw - 18), 10, burn);
  for (const b of B.filter(b => b.d > 0)) { const [x, y] = G.at(b.d, b.lat); thornbush(ctx, x + Math.sin(t * 3 + b.v * 9) * wobble, y, b.r, b.v, false, burn); }
}
export function groveOver(ctx, race) {
  const T = race.track, G = groveOf(T); if (!G) return;
  const t = race.time, st = thicketState(race, 0, t), S = race.thicket && race.thicket[0], fl = bold(), z = T.mech.thickets[0];
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (st.k === 'shut' || st.k === 'incoming') {
    // fresh barricade (or one the trunks have just come down into: tumbleweed blowing in to fill it)
    const since = S && S.tL > 0 ? t - (S.tL + BURN + z.open) : 99;
    barricade(ctx, G, t, since >= 0 && since < 4 ? 0.6 * (1 - since / 4) : 0, since >= 0 && since < 1 ? 3 * (1 - since) : 0);
    if (st.k === 'incoming') {   // the ring of fire marking where it'll land
      const u = 1 - st.u / z.flight, r = G.hw * (1.6 - 0.5 * u), pulse = 0.5 + 0.5 * Math.sin(t * (8 + 14 * u));
      ctx.setLineDash([16, 12]); ctx.lineDashOffset = -t * 60;
      ctx.strokeStyle = `rgba(255,${90 + Math.round(90 * pulse)},30,${0.5 + 0.4 * u})`; ctx.lineWidth = 5 + 3 * u; circ(ctx, G.q.x, G.q.y, r); ctx.stroke();
      ctx.setLineDash([]);
    }
  } else if (st.k === 'burning') {
    const a = 1 - st.u / BURN;   // 0 just lit .. 1 burnt out
    barricade(ctx, G, t, Math.min(1, a * 1.4));
    if (!fl) { const gr = ctx.createRadialGradient(G.q.x, G.q.y, 4, G.q.x, G.q.y, G.hw * 1.8); gr.addColorStop(0, `rgba(255,140,40,${0.45 * (1 - a * 0.6)})`); gr.addColorStop(1, 'rgba(255,90,20,0)'); ctx.globalCompositeOperation = 'lighter'; circ(ctx, G.q.x, G.q.y, G.hw * 1.8); ctx.fillStyle = gr; ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    const n = 11; for (let k = 0; k < n; k++) { const [x, y] = G.at(((k * 29) % 30) - 12, (k / (n - 1) * 2 - 1) * G.hw * 1.05); flame(ctx, x, y, (1.9 - a * 1.1) * (0.8 + 0.3 * ((k * 7) % 3) / 2), t, k, fl); }
    for (const p of G.posts) trunk(ctx, G, p, 0, t, 1);
  } else {
    // open or closing: the burnt trunks either side, leaning in as the time runs out, then toppling across
    const lean = st.k === 'open' ? 0.08 + 0.17 * clamp(1 - st.left / (z.open - CLOSE), 0, 1) ** 2 + 0.03 * Math.sin(t * 6) * (st.left < 1.5 ? 1 : 0) : 0.25 + 0.75 * clamp(1 - st.u / CLOSE, 0, 1) ** 2;
    const ember = st.k === 'open' ? clamp(st.left / (z.open - CLOSE), 0, 1) : 0.1;
    for (const p of G.posts) trunk(ctx, G, p, lean, t, ember);
    for (let k = 0; k < 3; k++) { const ph = (t * 0.5 + k / 3) % 1, [x, y] = G.at(-10 + k * 10, (k - 1) * G.hw * 0.6); circ(ctx, x + Math.sin(t + k) * 6, y - ph * 70, 8 + ph * 16); ctx.fillStyle = `rgba(90,80,86,${0.3 * (1 - ph) * (0.3 + 0.7 * ember)})`; ctx.fill(); }   // smoke curling up off the embers
  }
  // the fireball on its way from the crater
  if (st.k === 'incoming' && S) {
    const v = T.mech.volcano[0], u = clamp((t - S.tT) / (S.tL - S.tT), 0, 1), arc = 260 + Math.hypot(G.q.x - v.x, G.q.y - v.y) * 0.4;
    const pos = uu => [lerp(v.x, G.q.x, uu), lerp(v.y - v.H, G.q.y, uu) - arc * 4 * uu * (1 - uu)];
    for (let j = 8; j >= 1; j--) { const uu = u - j * 0.03; if (uu < 0) continue; const [px, py] = pos(uu); circ(ctx, px, py, 8 + j * 2.5); ctx.fillStyle = `rgba(70,58,64,${0.35 * (1 - j / 9)})`; ctx.fill(); }
    const [x, y] = pos(u);
    if (!fl) { ctx.globalCompositeOperation = 'lighter'; circ(ctx, x, y, 34); ctx.fillStyle = 'rgba(255,120,30,0.35)'; ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    circ(ctx, x, y, 15); ctx.fillStyle = '#e8441a'; ctx.fill(); circ(ctx, x - 3, y - 3, 10); ctx.fillStyle = '#ff9a2a'; ctx.fill(); circ(ctx, x - 5, y - 5, 5); ctx.fillStyle = '#ffe066'; ctx.fill();
    if (fl) { ctx.strokeStyle = '#111111'; ctx.lineWidth = 2.5; circ(ctx, x, y, 15); ctx.stroke(); }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------- the Kicker Park's lanes (baked)
// a dashed divider between the clear lane and the kickers' lane, from just before the first kicker to the last
export function kickerLanes(g, T) {
  const K = T.mech && T.mech.kickers; if (!K || !K.length) return;
  const first = K[0], last = K[K.length - 1], div = (Math.max(first.clear, first.lat0) + Math.min(first.clear, first.lat0)) / 2;
  g.save(); g.setLineDash([26, 20]); g.strokeStyle = 'rgba(245,245,240,0.7)'; g.lineWidth = 3; g.beginPath();
  for (let s = first.s - 260, k = 0; s <= last.s + 40; s += 8, k++) { const p = trackSample(T, s); k ? g.lineTo(p.x + p.nx * div, p.y + p.ny * div) : g.moveTo(p.x + p.nx * div, p.y + p.ny * div); }
  g.stroke(); g.setLineDash([]);
  // a little kicker sign painted in its lane before the first one, an arrow in the clear lane
  const p = trackSample(T, first.s - 200), a = Math.atan2(p.ty, p.tx);
  g.save(); g.translate(p.x + p.nx * first.mid, p.y + p.ny * first.mid); g.rotate(a); g.fillStyle = 'rgba(255,179,92,0.8)'; poly(g, [[-20, 16], [20, 16], [20, -14]]); g.fill(); g.restore();
  g.save(); g.translate(p.x + p.nx * first.clear, p.y + p.ny * first.clear); g.rotate(a); g.fillStyle = 'rgba(245,245,240,0.75)'; poly(g, [[-22, -5], [4, -5], [4, -13], [22, 0], [4, 13], [4, 5], [-22, 5]]); g.fill(); g.restore();
  g.restore();
}
