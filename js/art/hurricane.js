// Kernel Kart art: the hurricane on Async Atoll (race-hurricane.js), seen from above. Cosmetic only: everything comes
// from the race's storms (race.storms) and the clock, so every screen draws the same storm in the same place.
//   under the cars: the palms (bending with the wind where each one stands), the storm's shadow darkening the ground
//                   under its cloud bands, whitecaps and foam streaks on the sea, spray off the causeway's breakwater,
//                   wind streaks over everything (the plainest read of which way it's blowing where you are), rain
//                   splashing
//   over the cars:  slanted rain blown along the wind, the cloud spiral itself (two cached sprites turning round the
//                   eye: the eyewall and inner bands faster, the outer bands slower; translucent, so the road shows
//                   through), lightning in the eyewall, leaves and a beach ball tumbling past, pennants and windsocks
//   on the minimap: each storm, where it's heading and its eyewall
// Fill area is what costs on a slow machine: the cloud and its shadow are four drawImage calls a storm, the rest is
// batched strokes of a few hundred short lines.
import { TAU, clamp, mulberry } from '../core.js';
import { trackSample } from '../geometry.js';
import { EYE, OUT, SA, SX, SY, WALL, WX, WY, stormAt, stormLife, windAt } from '../race-hurricane.js';
import { atollLand, distField } from './track.js';
import { palm } from './props.js';

const REF = 340;                                   // the sprites are drawn for a storm with this eyewall radius, scaled to each
const ARMS = 4, R0 = 0.8 * REF, TURNS = 2.3 * Math.PI, BK = Math.log(OUT / 0.8) / TURNS;   // spiral bands: r = R0 e^(BK θ)
const SPLIT = 1.45 * REF;                          // inside this the inner sprite (turning faster), outside it the outer one
const W_IN = 0.36, W_OUT = 0.12;                   // how fast they turn (radians a second, anticlockwise)
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const wrap = a => { a = (a + Math.PI) % TAU; return (a < 0 ? a + TAU : a) - Math.PI; };
function makeCanvas(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}

// ---------------------------------------------------------------- the cloud sprites (made once)
// The storm as seen from above, drawn once into two sprites: a thin haze over the whole disc; the eyewall, a thick ring
// of dark rain cloud round the clear eye with a bright inner face; four spiral bands winding out of it (each a stack of
// soft-edged bands, darker and denser inside); puffs along them for texture, and thin bright streaks running round with
// the wind so it reads as turning. The inner sprite (the eyewall and the start of the bands) turns faster than the
// outer one; they cross-fade over a wide ring, so the bands shear a little as they go, the way the real thing does.
// The shadow sprites are the same shapes in near-black, at a lower resolution.
let SPR = null;
const armW = r => 0.8 * (36 + 0.16 * r);   // a band's half-width at radius r
const LIGHT = [238, 242, 246], DARK = [78, 90, 104];
const tone = (d, a, shadow) => shadow ? `rgba(8,16,26,${a * (0.55 + 0.45 * d)})` : `rgba(${LIGHT.map((v, i) => Math.round(v + (DARK[i] - v) * d))},${a})`;
function ring(g, stops, shadow) {   // a radial fill round the eye: stops [r, darkness, alpha]
  const r0 = stops[0][0], r1 = stops[stops.length - 1][0], gr = g.createRadialGradient(0, 0, r0, 0, 0, r1);
  for (const [r, d, a] of stops) gr.addColorStop((r - r0) / (r1 - r0), tone(d, a, shadow));
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r1, 0, TAU); g.arc(0, 0, r0, 0, TAU, true); g.fill();
}
function stormArt(g, shadow) {
  const rng = mulberry(11), E = EYE * REF;
  ring(g, [[E, 0, 0], [1.2 * REF, 0.3, 0.12], [2.2 * REF, 0.15, 0.07], [OUT * REF, 0, 0]], shadow);   // haze
  // the eyewall: a ring with a bright rim round the eye, falling off quickly outside so it reads as a ring. Its shadow
  // is the darker one (it's under the karts, the cloud is over them)
  ring(g, shadow ? [[E * 0.98, 0, 0], [E * 1.1, 0.5, 0.45], [0.66 * REF, 0.9, 0.75], [0.85 * REF, 1, 0.8], [1.05 * REF, 0.9, 0.6], [1.25 * REF, 0.6, 0.28], [1.5 * REF, 0.4, 0.1], [1.7 * REF, 0.3, 0]]
    : [[E * 0.98, 0.05, 0], [E * 1.06, 0.05, 0.6], [E * 1.22, 0.3, 0.55], [0.66 * REF, 0.75, 0.62], [0.82 * REF, 1, 0.66], [1.0 * REF, 0.9, 0.56], [1.2 * REF, 0.55, 0.3], [1.45 * REF, 0.35, 0.12], [1.7 * REF, 0.3, 0]], shadow);
  for (let j = 0; j < ARMS; j++) for (const [k, a] of [[1, 0.1], [0.72, 0.12], [0.45, 0.14], [0.22, 0.1]]) {   // the bands, soft-edged
    const pts = [];
    for (let th = 0.05; th <= TURNS; th += 0.04) { const r = R0 * Math.exp(BK * th), w = armW(r) * k * Math.min(1, (TURNS - th) / 1.4 + 0.08), f = j * TAU / ARMS + th; pts.push([r, w, f]); }
    const gr = g.createRadialGradient(0, 0, R0, 0, 0, OUT * REF);
    gr.addColorStop(0, tone(0.55 + 0.4 * (1 - k), a, shadow)); gr.addColorStop(0.5, tone(0.35 + 0.3 * (1 - k), a * 0.9, shadow)); gr.addColorStop(1, tone(0.15, a * 0.5, shadow));
    g.fillStyle = gr; g.beginPath();
    for (const [r, w, f] of pts) g.lineTo(Math.cos(f) * (r + w), Math.sin(f) * (r + w));
    for (let i = pts.length - 1; i >= 0; i--) { const [r, w, f] = pts[i]; g.lineTo(Math.cos(f) * (r - w), Math.sin(f) * (r - w)); }
    g.closePath(); g.fill();
  }
  const puff = (x, y, s, d, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, s); gr.addColorStop(0, tone(d, a, shadow)); gr.addColorStop(1, tone(d, 0, shadow)); g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2); };
  for (let i = 0; i < 160; i++) { const r = REF * (0.58 + 0.6 * rng() ** 1.5), f = rng() * TAU; puff(Math.cos(f) * r, Math.sin(f) * r, 30 + 40 * rng(), 0.4 + 0.5 * rng(), 0.18); }   // lumps in the eyewall
  for (let j = 0; j < ARMS; j++) for (let th = 0.3; th < TURNS - 0.5; th += 0.12 + 0.2 * rng()) {   // and along the bands
    const r = R0 * Math.exp(BK * th), w = armW(r), f = j * TAU / ARMS + th, o = (rng() - 0.5) * w * 1.4;
    puff(Math.cos(f) * (r + o), Math.sin(f) * (r + o), w * (0.5 + 0.5 * rng()), rng() * 0.6, 0.14 * (1 - r / (OUT * REF)));
  }
  if (shadow) return;
  g.lineCap = 'round';
  for (let i = 0; i < 90; i++) {   // streaks round the eyewall, running with the wind
    const r = REF * (0.52 + 0.75 * rng() ** 1.3), f = rng() * TAU, len = 0.4 + 1.1 * rng();
    g.strokeStyle = `rgba(250,252,255,${0.08 + 0.14 * rng()})`; g.lineWidth = 2 + 6 * rng(); g.beginPath(); g.arc(0, 0, r, f, f + len); g.stroke();
  }
  for (let j = 0; j < ARMS; j++) for (let k = 0; k < 7; k++) {   // and along the bands
    const th0 = rng() * TURNS * 0.6, th1 = Math.min(TURNS - 0.3, th0 + 0.8 + rng() * 2), off = (rng() - 0.5) * 1.3;
    g.strokeStyle = `rgba(250,252,255,${0.07 + 0.1 * rng()})`; g.lineWidth = 2 + 5 * rng(); g.beginPath();
    for (let th = th0; th <= th1; th += 0.05) { const r = R0 * Math.exp(BK * th), rr = r + off * armW(r), f = j * TAU / ARMS + th; g.lineTo(Math.cos(f) * rr, Math.sin(f) * rr); }
    g.stroke();
  }
}
function sprites() {
  if (SPR) return SPR;
  const build = (R, res, inner, shadow) => {
    const n = Math.ceil(2 * R * res), c = makeCanvas(n, n), g = c.getContext('2d');
    g.setTransform(res, 0, 0, res, n / 2, n / 2);
    stormArt(g, shadow);
    const m = g.createRadialGradient(0, 0, SPLIT - 100, 0, 0, SPLIT + 100);   // cross-fade the two over a ring
    m.addColorStop(0, inner ? 'rgba(0,0,0,1)' : 'rgba(0,0,0,0)'); m.addColorStop(1, inner ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = m; g.fillRect(-R, -R, 2 * R, 2 * R);
    return { c, R };
  };
  const Ri = SPLIT + 110, Ro = OUT * REF + 60;
  SPR = { cin: build(Ri, 0.75, true, false), cout: build(Ro, 0.42, false, false), sin: build(Ri, 0.3, true, true), sout: build(Ro, 0.2, false, true) };
  return SPR;
}
// how the sprites are turned for storm S at time t (each storm starts at its own angle)
const spinIn = (S, t) => hash(S.tm, 1) * TAU - W_IN * t, spinOut = (S, t) => hash(S.tm, 2) * TAU - W_OUT * t;
// how hard it's raining at (x, y): under the eyewall and the spiral bands (the same bands the sprites draw), none in the eye
let RAIN_L = null;
function rainAt(L, x, y, t) {
  let best = 0;
  for (const S of L) {
    const dt = t - S.tm; if (dt < -S.h || dt > S.h) continue;
    stormAt(S, t);
    const k = S.rm / REF, dx = (x - SX) / k, dy = (y - SY) / k, r = Math.hypot(dx, dy); if (r > OUT * REF || r < EYE * REF) continue;
    const wall = Math.exp(-(((r - 0.82 * REF) / (0.28 * REF)) ** 2));
    let band = 0;
    if (r > 0.9 * REF) {
      const a = Math.atan2(dy, dx) - (r < SPLIT ? spinIn(S, t) : spinOut(S, t)), th = Math.log(r / R0) / BK, w = armW(r) / r;
      for (let j = 0; j < ARMS; j++) { const d = wrap(a - j * TAU / ARMS - th); band = Math.max(band, Math.exp(-((d / w) ** 2))); }
      band *= 1 - r / (OUT * REF);
    }
    best = Math.max(best, Math.max(wall, band * 0.85) * stormLife(S, t));
  }
  return best;
}

// ---------------------------------------------------------------- where things can go
// the open water round the atoll (no road, no island): a coarse grid, made once per track
const waters = new WeakMap();
function waterOf(T) {
  let W = waters.get(T); if (W) return W;
  const { onLand } = atollLand(T), dist = distField(T), B = T.bbox, C = 40, x0 = B.x - 700, y0 = B.y - 700, nx = Math.ceil((B.w + 1400) / C), ny = Math.ceil((B.h + 1400) / C), g = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const x = x0 + (i + 0.5) * C, y = y0 + (j + 0.5) * C; g[j * nx + i] = !onLand(x, y, 14) && dist(x, y, 200) > 40 ? 1 : 0; }
  W = (x, y) => { const i = Math.floor((x - x0) / C), j = Math.floor((y - y0) / C); return i < 0 || j < 0 || i >= nx || j >= ny ? 1 : g[j * nx + i]; };
  waters.set(T, W); return W;
}
let VIEW = { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 };
function viewOf(ctx) {
  if (!ctx.getTransform || !ctx.canvas) return VIEW;
  const m = ctx.getTransform().inverse(), w = ctx.canvas.width, h = ctx.canvas.height, xs = [], ys = [];
  for (const [px, py] of [[0, 0], [w, 0], [0, h], [w, h]]) { xs.push(m.a * px + m.c * py + m.e); ys.push(m.b * px + m.d * py + m.f); }
  return (VIEW = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
}
// the wind at (x, y) for the scenery: the storms', or the sea breeze in the calm (palms and flags never hang dead)
const BREEZE = 0.18;
let FX = 0, FY = 0;
function airAt(race, H, x, y) {
  const g = windAt(race.storms, x, y, race.time), k = clamp(1 - g / 0.3, 0, 1);
  FX = WX + H.bx * BREEZE * k; FY = WY + H.by * BREEZE * k;
  return Math.hypot(FX, FY);
}

// ---------------------------------------------------------------- under the cars
export function hurricaneUnder(ctx, race) {
  const T = race.track, H = T.mech.hurricane, t = race.time, L = race.storms || [];
  const V = viewOf(ctx);
  ctx.save(); ctx.lineCap = 'round';
  palms(ctx, race, H, t);
  sea(ctx, race, H, V, t);
  for (const S of L) { const dt = t - S.tm; if (dt < -S.h || dt > S.h) continue; stormAt(S, t); cloud(ctx, S, t, true); eyeSun(ctx, S, t); }
  causewaySpray(ctx, race, H, t);
  streaks(ctx, race, H, V, t);
  if (L.length) splashes(ctx, race, V, t);
  ctx.restore();
}
// the palms: each one's crown blown downwind of its trunk and stretched out along the wind, its fronds fluttering,
// harder the stronger the wind where it stands. Drawn from a few cached sprites (art/props.js palm, its long fronds
// pointing +x), turned to the wind.
let PALMS = null;
function palmSprites() {
  if (PALMS) return PALMS;
  PALMS = [];
  for (let v = 0; v < 6; v++) { const R = 30, n = 2 * Math.ceil(R * 1.5 * 2.2), c = makeCanvas(n, n), g = c.getContext('2d'); g.setTransform(2.2, 0, 0, 2.2, n / 2, n / 2); palm(g, 0, 0, R, mulberry(v * 31 + 5), 0); PALMS.push({ c, R, n }); }
  return PALMS;
}
function palms(ctx, race, H, t) {
  const list = atollLand(race.track).onLand.palms; if (!list || !list.length) return;
  const P = palmSprites();
  for (const p of list) {
    if (p.x + p.r * 2 < VIEW.x0 || p.x - p.r * 2 > VIEW.x1 || p.y + p.r * 2 < VIEW.y0 || p.y - p.r * 2 > VIEW.y1) continue;
    const g = Math.min(1.2, airAt(race, H, p.x, p.y)), a = Math.atan2(FY, FX), sway = Math.sin(t * (2.5 + 7 * g) + p.k * 2.3) * (0.03 + 0.09 * g);
    const S = P[p.k % P.length], k = p.r / S.R, lean = p.r * 0.38 * g;
    ctx.save(); ctx.translate(p.x + Math.cos(a) * lean, p.y + Math.sin(a) * lean); ctx.rotate(a + sway); ctx.scale(k * (0.92 + 0.3 * g), k * (1 - 0.2 * g));
    const w = S.n / 2.2; ctx.drawImage(S.c, -w / 2, -w / 2, w, w);
    ctx.restore();
  }
}
// the storm's clouds (over = false: their shadow on the ground, fallen down and to the right; it darkens the road ahead
// as the bands come over)
function cloud(ctx, S, t, shadow) {
  const k = S.rm / REF, life = stormLife(S, t), sp = sprites(), R = (OUT * REF + 60) * k, ox = shadow ? 36 : 0, oy = shadow ? 48 : 0;
  if (SX + ox + R < VIEW.x0 || SX + ox - R > VIEW.x1 || SY + oy + R < VIEW.y0 || SY + oy - R > VIEW.y1) return;
  for (const [s, spin, al] of shadow ? [[sp.sout, spinOut(S, t), 0.6], [sp.sin, spinIn(S, t), 0.74]] : [[sp.cout, spinOut(S, t), 0.72], [sp.cin, spinIn(S, t), 0.66]]) {
    ctx.save(); ctx.globalAlpha = al * life; ctx.translate(SX + ox, SY + oy); ctx.rotate(spin); ctx.scale(k, k);
    ctx.drawImage(s.c, -s.R, -s.R, s.R * 2, s.R * 2); ctx.restore();
  }
}
// the eye: sun through the hole in the clouds, a warm patch on the ground (dead calm here)
function eyeSun(ctx, S, t) {
  const R = S.rm * EYE * 1.1, al = 0.16 * stormLife(S, t);
  if (SX + R < VIEW.x0 || SX - R > VIEW.x1 || SY + R < VIEW.y0 || SY - R > VIEW.y1) return;
  const gr = ctx.createRadialGradient(SX - R * 0.15, SY - R * 0.15, 0, SX, SY, R);
  gr.addColorStop(0, `rgba(255,244,205,${al})`); gr.addColorStop(0.7, `rgba(255,240,195,${al * 0.7})`); gr.addColorStop(1, 'rgba(255,240,195,0)');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(SX, SY, R, 0, TAU); ctx.fill();
}
// the sea: whitecaps breaking (a crest across the wind, spray off it), their number and size going with the wind where
// they are, and long foam streaks lying along it. Each lives a moment where it broke (placed on a world grid, so they
// don't slide about with the camera).
const CAPS = new Float32Array(5 * 400);
function sea(ctx, race, H, V, t) {
  const water = waterOf(race.track), C = 90, i0 = Math.floor(V.x0 / C), i1 = Math.ceil(V.x1 / C), j0 = Math.floor(V.y0 / C), j1 = Math.ceil(V.y1 / C);
  let n = 0;
  for (let i = i0; i <= i1 && n < 400; i++) for (let j = j0; j <= j1 && n < 400; j++) {
    const g = airAt(race, H, (i + 0.5) * C, (j + 0.5) * C), m = Math.min(3, Math.floor(g * g * 2.2 + hash(i, j)));
    for (let k = 0; k < m && n < 400; k++) {
      const u = t / 1.1 + hash(i * 7 + k, j), pass = Math.floor(u), ph = u - pass, x = (i + hash(i + k, j + pass)) * C, y = (j + hash(j - k, i + pass * 3)) * C;
      if (!water(x, y)) continue;
      const o = n * 5; CAPS[o] = x; CAPS[o + 1] = y; CAPS[o + 2] = Math.sin(Math.min(1, ph / 0.75) * Math.PI) * Math.min(1, g); CAPS[o + 3] = FX / (g || 1); CAPS[o + 4] = FY / (g || 1); n++;
    }
  }
  if (!n) return;
  for (const [lo, hi, al, w] of [[0.05, 0.4, 0.35, 1.8], [0.4, 0.7, 0.6, 2.2], [0.7, 2, 0.85, 2.6]]) {
    ctx.strokeStyle = `rgba(244,250,252,${al})`; ctx.lineWidth = w; ctx.beginPath();
    for (let q = 0; q < n; q++) {
      const o = q * 5, s = CAPS[o + 2]; if (s < lo || s >= hi) continue;
      const x = CAPS[o], y = CAPS[o + 1], wx = CAPS[o + 3], wy = CAPS[o + 4], l = 6 + 9 * s, b = l * 0.18;
      ctx.moveTo(x + wy * l, y - wx * l); ctx.quadraticCurveTo(x + wx * b, y + wy * b, x - wy * l * 0.7, y + wx * l * 0.7);   // a crest across the wind, bowed a little downwind
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(240,248,252,0.3)'; ctx.lineWidth = 1.5; ctx.beginPath();   // foam streaks lying along the wind behind the bigger ones
  for (let q = 0; q < n; q++) {
    const o = q * 5, s = CAPS[o + 2]; if (s < 0.45) continue;
    const wx = CAPS[o + 3], wy = CAPS[o + 4], x = CAPS[o] - wx * 6, y = CAPS[o + 1] - wy * 6, l = 20 + 40 * s;
    ctx.moveTo(x - wx * l, y - wy * l); ctx.lineTo(x, y);
  }
  ctx.stroke();
}
// spray whipped off the windward breakwater and across the causeway while it blows hard
function causewaySpray(ctx, race, H, t) {
  const T = race.track, span = H.s1 - H.s0, mid = trackSample(T, (H.s0 + H.s1) / 2);
  if (mid.x + span < VIEW.x0 || mid.x - span > VIEW.x1 || mid.y + span < VIEW.y0 || mid.y - span > VIEW.y1) return;
  for (const [lo, hi, al, lw] of [[0, 0.5, 0.35, 1.6], [0.5, 2, 0.6, 2.4]]) {
    ctx.strokeStyle = `rgba(240,248,252,${al})`; ctx.lineWidth = lw; ctx.beginPath();
    for (let j = 0; j < 40; j++) {
      const u = t * 1.6 + hash(j, 1), pass = Math.floor(u), r = u - pass, f = (1 - r) ** 1.3; if (f < lo || f >= hi) continue;
      const q = trackSample(T, H.s0 + hash(j, pass) * span), g = airAt(race, H, q.x, q.y); if (g < 0.35 || hash(j, pass + 9) > (g - 0.3) * 1.6) continue;
      const wx = FX / g, wy = FY / g, wn = wx * q.nx + wy * q.ny, side = -Math.sign(wn) || 1;
      const d = r * (2 * q.hw + 60) / Math.max(0.35, Math.abs(wn)), o = side * (q.hw + WALL + 4), x = q.x + q.nx * o + wx * d, y = q.y + q.ny * o + wy * d, l = 8 + 14 * Math.min(1, g);
      ctx.moveTo(x - wx * l, y - wy * l); ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
// wind streaks: faint white lines racing along the wind over land, sea and road alike, longer and brighter the harder
// it blows (none in the eye). This is what tells you, near your kart, which way it's about to push you.
const STREAK = new Float32Array(5 * 260);
function streaks(ctx, race, H, V, t) {
  if (!race.storms || !race.storms.length) return;
  const C = 110, i0 = Math.floor(V.x0 / C), i1 = Math.ceil(V.x1 / C), j0 = Math.floor(V.y0 / C), j1 = Math.ceil(V.y1 / C);
  let n = 0;
  for (let i = i0; i <= i1 && n < 260; i++) for (let j = j0; j <= j1 && n < 260; j++) {
    const g = windAt(race.storms, (i + 0.5) * C, (j + 0.5) * C, t); if (g < 0.15) continue;
    const wx = WX / g, wy = WY / g, u = t * (0.8 + 1.4 * g) + hash(i, j), pass = Math.floor(u), r = u - pass, run = 120 + 260 * g;
    const x = (i + hash(i, j + pass)) * C + wx * (r - 0.5) * run, y = (j + hash(j, i + pass)) * C + wy * (r - 0.5) * run;
    const o = n * 5; STREAK[o] = x; STREAK[o + 1] = y; STREAK[o + 2] = wx * (18 + 50 * g); STREAK[o + 3] = wy * (18 + 50 * g); STREAK[o + 4] = Math.min(1, g) * Math.sin(r * Math.PI); n++;
  }
  for (const [lo, hi, al, w] of [[0.08, 0.4, 0.22, 1.3], [0.4, 0.7, 0.4, 1.8], [0.7, 2, 0.6, 2.4]]) {
    ctx.strokeStyle = `rgba(240,246,250,${al})`; ctx.lineWidth = w; ctx.beginPath();
    for (let q = 0; q < n; q++) {
      const o = q * 5, a = STREAK[o + 4]; if (a < lo || a >= hi) continue;
      const x = STREAK[o], y = STREAK[o + 1], dx = STREAK[o + 2], dy = STREAK[o + 3];
      ctx.moveTo(x - dx, y - dy); ctx.quadraticCurveTo(x - dx * 0.3 - dy * 0.12, y - dy * 0.3 + dx * 0.12, x, y);
    }
    ctx.stroke();
  }
}
// rain splashing: little rings where the drops land, thick under the eyewall and the bands
function splashes(ctx, race, V, t) {
  ctx.strokeStyle = 'rgba(225,236,244,0.4)'; ctx.lineWidth = 1.1; ctx.beginPath();
  const w = V.x1 - V.x0, h = V.y1 - V.y0;
  for (let k = 0; k < 160; k++) {
    const u = t * 2.6 + hash(k, 0), pass = Math.floor(u), ph = u - pass; if (ph > 0.3) continue;
    const x = V.x0 + hash(k, pass) * w, y = V.y0 + hash(k, pass + 0.5) * h;
    if (hash(k, pass + 0.7) > rainAt(race.storms, x, y, t)) continue;
    const r = 2 + ph / 0.3 * 8; ctx.moveTo(x + r, y); ctx.ellipse(x, y, r, r * 0.7, 0, 0, TAU);
  }
  ctx.stroke();
}

// ---------------------------------------------------------------- over the cars
export function hurricaneOver(ctx, race) {
  const T = race.track, H = T.mech.hurricane, t = race.time, L = race.storms || [];
  viewOf(ctx);
  ctx.save(); ctx.lineCap = 'round';
  if (L.length) rain(ctx, race, t);
  for (const S of L) { const dt = t - S.tm; if (dt < -S.h || dt > S.h) continue; stormAt(S, t); cloud(ctx, S, t, false); lightning(ctx, S, t); }
  if (L.length) debris(ctx, race, H, t);
  pennants(ctx, race, H, t);
  for (const k of H.socks) { airAt(race, H, k.x, k.y); windsock(ctx, k, t); }
  ctx.restore();
}
// rain: streaks falling down the screen (heights go up the screen) and blown along the wind, heaviest under the
// eyewall and the bands
function rain(ctx, race, t) {
  const w = VIEW.x1 - VIEW.x0, h = VIEW.y1 - VIEW.y0;
  for (const [lo, hi, al, lw] of [[0, 0.6, 0.28, 1.1], [0.6, 1, 0.5, 1.5]]) {
    ctx.strokeStyle = `rgba(222,234,244,${al})`; ctx.lineWidth = lw; ctx.beginPath();
    for (let k = 0; k < 420; k++) {
      const v = hash(k, 2); if (v < lo || v >= hi) continue;
      const u = t * 2.6 + hash(k, 0), pass = Math.floor(u), ph = u - pass;
      const x = VIEW.x0 + hash(k, pass) * w, y = VIEW.y0 + hash(k, pass + 0.5) * h;
      if (hash(k, pass + 0.7) > rainAt(race.storms, x, y, t)) continue;
      const g = windAt(race.storms, x, y, t), sx = WX * 0.9, sy = 1 + WY * 0.9, sl = Math.hypot(sx, sy) || 1, dx = sx / sl, dy = sy / sl;
      const fall = (1 - ph) * 90, l = 10 + 18 * v * (0.6 + 0.6 * Math.min(1, g)), px = x - dx * fall, py = y - dy * fall;
      ctx.moveTo(px - dx * l, py - dy * l); ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}
// lightning: now and then a double flash deep in the eyewall, lighting the cloud from inside
function lightning(ctx, S, t) {
  const id = Math.floor(t / 1.7 + hash(S.tm, 5)); if (hash(id, S.tm) > 0.45) return;
  const u = t / 1.7 + hash(S.tm, 5) - id, k = u < 0.035 ? 1 : u > 0.07 && u < 0.11 ? 0.55 : 0; if (!k) return;
  const a = hash(id, 7) * TAU, r = S.rm * (0.7 + 0.5 * hash(id, 8)), x = SX + Math.cos(a) * r, y = SY + Math.sin(a) * r, R = 520;
  if (x + R < VIEW.x0 || x - R > VIEW.x1 || y + R < VIEW.y0 || y - R > VIEW.y1) return;
  const gr = ctx.createRadialGradient(x, y, 0, x, y, R);
  gr.addColorStop(0, `rgba(236,242,255,${0.3 * k})`); gr.addColorStop(0.45, `rgba(226,234,255,${0.12 * k})`); gr.addColorStop(1, 'rgba(226,234,255,0)');
  ctx.fillStyle = gr; ctx.fillRect(x - R, y - R, R * 2, R * 2);
}
// debris: palm leaves tumbling along the wind, and now and then a beach ball bowling past
const LEAF = ['#5f9d4d', '#7cc25e', '#4f8a43', '#a3c46a'];
function debris(ctx, race, H, t) {
  const C = 260, i0 = Math.floor(VIEW.x0 / C), i1 = Math.ceil(VIEW.x1 / C), j0 = Math.floor(VIEW.y0 / C), j1 = Math.ceil(VIEW.y1 / C);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const g0 = windAt(race.storms, (i + 0.5) * C, (j + 0.5) * C, t); if (g0 < 0.4) continue;
    const ball = hash(i * 3, j * 5) < 0.06, life = ball ? 3.2 : 1.6, u = t / life + hash(i, j * 2), pass = Math.floor(u), r = u - pass;
    if (!ball && hash(i + pass, j) > (g0 - 0.3) * 1.4) continue;
    const sx = (i + hash(i, j + pass)) * C, sy = (j + hash(j, i + pass)) * C, g = Math.max(windAt(race.storms, sx, sy, t), 0.3), wx = WX / g, wy = WY / g;
    const run = (ball ? 260 : 420) * Math.min(1.2, g) * life * r, x = sx + wx * run - wx * 200, y = sy + wy * run - wy * 200;
    if (x < VIEW.x0 - 30 || x > VIEW.x1 + 30 || y < VIEW.y0 - 30 || y > VIEW.y1 + 30) continue;
    const fade = Math.min(1, r * 6, (1 - r) * 6);
    ctx.save(); ctx.globalAlpha = fade;
    if (ball) {   // bouncing: a shadow on the ground, the ball up off it, its panels turning
      const hop = Math.abs(Math.sin(r * Math.PI * 5)) * 26, R = 11;
      ctx.fillStyle = 'rgba(10,20,30,0.25)'; ctx.beginPath(); ctx.ellipse(x + 5, y + 7, R, R * 0.7, 0, 0, TAU); ctx.fill();
      ctx.translate(x, y - hop); ctx.rotate(r * 24);
      for (let s = 0; s < 6; s++) { ctx.fillStyle = ['#ff4d4d', '#ffffff', '#ffd23f', '#ffffff', '#3d8bff', '#ffffff'][s]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, s * TAU / 6, (s + 1) * TAU / 6); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(30,30,40,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    } else {   // a leaf, fluttering end over end
      const s = 6 + 5 * hash(i, j + 3), sp = t * (8 + 6 * hash(j, i)) + i;
      ctx.translate(x, y); ctx.rotate(Math.atan2(wy, wx) + Math.sin(sp) * 0.9); ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(sp * 0.7)));
      ctx.fillStyle = LEAF[(i + j + pass) & 3]; ctx.beginPath(); ctx.ellipse(0, 0, s * 1.6, s * 0.55, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(40,70,30,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-s * 1.5, 0); ctx.lineTo(s * 1.5, 0); ctx.stroke();
    }
    ctx.restore();
  }
}
// pennants on short poles along both breakwaters: they lift in the breeze and stand straight out with the wind where
// they are, fluttering (so you can read a tailwind, a headwind or a crosswind from the road)
const flagSpots = new WeakMap();
function pennants(ctx, race, H, t) {
  const T = race.track; let P = flagSpots.get(H);
  if (!P) {
    P = [];
    for (let s = H.s0 + 110, i = 0; s < H.s1 - 60; s += 230, i++) for (const side of [-1, 1]) { const q = trackSample(T, s + (side > 0 ? 115 : 0)), o = side * (q.hw + WALL + 4.5); P.push({ x: q.x + q.nx * o, y: q.y + q.ny * o, k: i * 2 + (side > 0) }); }
    flagSpots.set(H, P);
  }
  const Hh = 34;
  ctx.strokeStyle = '#4a5058'; ctx.lineWidth = 2.5; ctx.lineCap = 'butt'; ctx.beginPath();
  for (const p of P) { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - Hh); }
  ctx.stroke();
  for (const col of ['#e2483a', '#f2c94c']) {
    ctx.fillStyle = col; ctx.beginPath();
    for (const p of P) {
      if ((p.k % 2 === 0) !== (col === '#e2483a')) continue;
      const g = Math.min(1, airAt(race, H, p.x, p.y)), x = p.x, y = p.y - Hh + 1, Lf = 15 + 10 * g, sag = (1 - g) * 0.9;
      let ux = FX / (g || 1) * (0.25 + g), uy = FY / (g || 1) * (0.25 + g) + sag; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
      const fl = Math.sin(t * (7 + 9 * g) + p.k * 1.7) * (2 + 3 * g), nx = -uy, ny = ux;
      ctx.moveTo(x, y); ctx.quadraticCurveTo(x + ux * Lf * 0.5 + nx * fl, y + uy * Lf * 0.5 + ny * fl, x + ux * Lf, y + uy * Lf);
      ctx.lineTo(x + nx * 8 + ux, y + ny * 8 + uy); ctx.closePath();
    }
    ctx.fill();
  }
}
// a windsock on a pole: hangs limp in the calm, stands straight out downwind in the storm (red and white bands).
// The wind at it: FX, FY (airAt).
function windsock(ctx, k, t) {
  const top = 74, tx = k.x, ty = k.y - top, w = Math.hypot(FX, FY), g = clamp((w - BREEZE) / (1 - BREEZE), 0, 1), wx = FX / (w || 1), wy = FY / (w || 1);
  ctx.strokeStyle = '#5b6168'; ctx.lineWidth = 5; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(k.x, k.y); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.strokeStyle = '#9aa1a8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(k.x - 1.5, k.y); ctx.lineTo(tx - 1.5, ty); ctx.stroke();
  const flap = Math.sin(t * (6 + 10 * g)) * (0.06 + 0.12 * g);
  let ax = wx * g + 0.15 * wx, ay = wy * g + (1 - g) * 1.1; const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
  const ca = Math.cos(flap), sa = Math.sin(flap), ux = ax * ca - ay * sa, uy = ax * sa + ay * ca, L = 34 + 18 * g, nx = -uy, ny = ux;
  for (let i = 0; i < 4; i++) {
    const a = i / 4, b = (i + 1) / 4, wa = 9 - 4 * a, wb = 9 - 4 * b, sag = (1 - g) * 6;
    const P = (f, wd, sd) => [tx + ux * L * f + nx * wd * sd, ty + uy * L * f + ny * wd * sd + sag * f * f];
    const p1 = P(a, wa, 1), p2 = P(b, wb, 1), p3 = P(b, wb, -1), p4 = P(a, wa, -1);
    ctx.fillStyle = i % 2 ? '#f4f1ea' : '#e2483a'; ctx.beginPath(); ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p3); ctx.lineTo(...p4); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#3d4248'; ctx.beginPath(); ctx.arc(tx, ty, 4, 0, TAU); ctx.fill();
}

// ---------------------------------------------------------------- the minimap
// each storm on the map: a soft disc over the strong wind round it, its eyewall as a ring turning with two spiral
// arms, and a dashed trail from its edge to an arrowhead, where it's heading in the next few seconds (P(x, y) maps the
// world to the minimap)
export function miniStorms(ctx, race, P, ms) {
  const L = race.storms; if (!L) return;
  const t = race.time;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const S of L) {
    if (t < S.tm - S.h - 6 || t > S.tm + S.h) continue;
    const t0 = Math.max(t, S.tm - S.h);
    stormAt(S, t0); const [x, y] = P(SX, SY), r = Math.max(6, S.rm * ms);
    ctx.globalAlpha = t < S.tm - S.h ? 0.5 : 1;
    const gr = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 2);   // where it blows hard
    gr.addColorStop(0, 'rgba(206,222,240,0.3)'); gr.addColorStop(0.45, 'rgba(206,222,240,0.18)'); gr.addColorStop(1, 'rgba(206,222,240,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 2, 0, TAU); ctx.fill();
    const tr = [];   // the trail ahead, from just outside the eyewall
    for (let k = 1; k <= 10; k++) { const tt = t0 + k * 1.2; if (tt > S.tm + S.h) break; stormAt(S, tt); const q = P(SX, SY); if (Math.hypot(q[0] - x, q[1] - y) > r * 1.2) tr.push(q); }
    if (tr.length >= 2) {
      const d0 = Math.hypot(tr[0][0] - x, tr[0][1] - y); tr.unshift([x + (tr[0][0] - x) * r * 1.2 / d0, y + (tr[0][1] - y) * r * 1.2 / d0]);
      const [ex, ey] = tr[tr.length - 1], [px, py] = tr[tr.length - 2], a = Math.atan2(ey - py, ex - px);
      for (const [col, lw] of [['rgba(20,28,40,0.5)', 3.4], ['rgba(236,242,248,0.85)', 1.6]]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash([3, 3.5]); ctx.beginPath(); for (const [qx, qy] of tr) ctx.lineTo(qx, qy); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(ex - Math.cos(a - 0.6) * 5, ey - Math.sin(a - 0.6) * 5); ctx.lineTo(ex, ey); ctx.lineTo(ex - Math.cos(a + 0.6) * 5, ey - Math.sin(a + 0.6) * 5); ctx.stroke();
      }
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate(-t * 2);
    ctx.strokeStyle = 'rgba(20,28,40,0.55)'; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();   // the eyewall
    ctx.strokeStyle = 'rgba(236,242,248,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#e8eef4'; ctx.lineWidth = 1.6;
    for (let j = 0; j < 2; j++) { ctx.beginPath(); for (let a = 0; a <= 2.6; a += 0.2) { const rr = r * (0.35 + a / 2.6 * 0.95), b = j * Math.PI + a; ctx.lineTo(Math.cos(b) * rr, Math.sin(b) * rr); } ctx.stroke(); }
    ctx.fillStyle = '#e8eef4'; ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
