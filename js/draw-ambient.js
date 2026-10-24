// Kernel Kart: ambient life on a track, drawn every frame from the race clock alone (nothing here is kept on the race
// or read back by it, so it's the same online and costs nothing in the simulation). Kept sparse and cheap on purpose:
// a few things moving in the scenery, never event effects.
//   drawAmbient(ctx, race)      under the cars: gull shadows, blinking LEDs on the circuit board, twinkling stars
//   drawAmbientOver(ctx, race)  over the cars: gulls in the air, steam off the hot springs
import { TAU, mulberry } from './core.js';
import { distField, lookOf, shoreOf } from './art/track.js';
import { alpha } from './art/paint.js';
import { boardLeds } from './art/chips.js';
import { bayLife } from './art/bay.js';
import { iceFauna } from './art/fauna.js';

// the part of the world on screen (ctx is in world units), padded
function viewOf(ctx, pad = 0) {
  const m = ctx.getTransform(), k = m.a || 1;
  return { x0: -m.e / k - pad, y0: -m.f / k - pad, x1: (ctx.canvas.width - m.e) / k + pad, y1: (ctx.canvas.height - m.f) / k + pad };
}
const inView = (V, x, y, r) => x + r > V.x0 && x - r < V.x1 && y + r > V.y0 && y - r < V.y1;

// soft round puffs, made once (steam): white, and a cool grey-blue for the shadow each wisp casts on the snow
const PUFFS = {};
function puff(col) {
  if (PUFFS[col]) return PUFFS[col];
  const n = 64, c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(n, n) : Object.assign(document.createElement('canvas'), { width: n, height: n });
  const g = c.getContext('2d'), gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  gr.addColorStop(0, alpha(col, 1)); gr.addColorStop(0.45, alpha(col, 0.55)); gr.addColorStop(1, alpha(col, 0));
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
  return (PUFFS[col] = c);
}

export function drawAmbient(ctx, race) {
  const T = race.track, kind = lookOf(T).kind, t = race.time;
  if (kind === 'crab') gulls(ctx, T, t, true);
  else if (kind === 'chips') leds(ctx, T, t);
  else if (kind === 'space') twinkle(ctx, T, t);
  else if (kind === 'ice' || kind === 'snow') { const V = viewOf(ctx, 40); iceFauna(ctx, T, t, kind, (x, y, r) => inView(V, x, y, r)); }   // penguins and polar bears (art/fauna.js)
  else if (kind === 'water') { const V = viewOf(ctx, 40); bayLife(ctx, T, t, (x, y, r) => inView(V, x, y, r)); }   // Merge Bay: cows and sheep at the farm, its windmill turning (art/bay.js)
}
export function drawAmbientOver(ctx, race) {
  const T = race.track, kind = lookOf(T).kind, t = race.time;
  if (kind === 'crab') gulls(ctx, T, t, false);
  else if (kind === 'ice') steam(ctx, T, t);
}

// ------------------------------------------------------------------------------------------------ Crab Harbor: gulls
// A few gulls wheeling slowly over the harbour and the surf, each on its own lazy loop; they glide, now and then give
// a few flaps, and their shadows sweep over the sand and the road far below (down and to the right: they're high up).
const flocks = new WeakMap();
function gullLoops(T) {
  if (flocks.has(T)) return flocks.get(T);
  const { wet, onLand } = shoreOf(T), B = T.bbox, cand = [];
  // spots over the water near the land: the harbour mouth, along the quay, out over the surf
  for (let y = B.y - 100; y < B.y + B.h + 100; y += 120) for (let x = B.x; x < B.x + B.w; x += 120) {
    if (!wet(x, y)) continue;
    let near = false; for (const [dx, dy] of [[0, 360], [0, -360], [360, 0], [-360, 0]]) if (onLand(x + dx, y + dy)) near = true;
    if (near) cand.push([x, y]);
  }
  const rng = mulberry(T.N * 5 + 11), out = [];
  for (let n = 0; n < 5 && cand.length; n++) {   // spread out: each the farthest from the ones already picked
    let best = null, bd = -1;
    for (const c of cand) { let d = out.length ? 1e9 : rng() * 1e6; for (const o of out) d = Math.min(d, Math.hypot(o.x - c[0], o.y - c[1])); if (d > bd) { bd = d; best = c; } }
    if (out.length && bd < 500) break;
    out.push({ x: best[0], y: best[1], R: 140 + rng() * 120, w: (rng() < 0.5 ? -1 : 1) * (0.22 + rng() * 0.14), ph: rng() * TAU, flap: rng() * 9, k: 1.35 + rng() * 0.35 });
  }
  flocks.set(T, out); return out;
}
const GULL_H = [46, 62];   // where a gull's shadow falls on the ground (it's that high)
function gulls(ctx, T, t, shadows) {
  const V = viewOf(ctx, 80);
  for (const L of gullLoops(T)) {
    // the loop is an ellipse that slowly drifts, so the birds don't trace the same circle all race
    const a = L.ph + t * L.w, cx = L.x + Math.sin(t * 0.05 + L.ph) * 90, cy = L.y + Math.cos(t * 0.043 + L.ph) * 60;
    const x = cx + Math.cos(a) * L.R, y = cy + Math.sin(a) * L.R * 0.7, h = Math.atan2(Math.cos(a) * L.R * 0.7 * L.w, -Math.sin(a) * L.R * L.w);
    const cyc = (t + L.flap) % 9, flap = cyc < 1.4 ? Math.sin(cyc * 14) : 0.25;   // a burst of flaps, then a long glide
    if (shadows) { const sx = x + GULL_H[0], sy = y + GULL_H[1]; if (inView(V, sx, sy, 30)) gull(ctx, sx, sy, h, flap, L.k * 0.9, true); }
    else if (inView(V, x, y, 30)) gull(ctx, x, y, h, flap, L.k, false);
  }
}
// a gull from above, heading h: white body and head, a yellow bill, grey wings with black tips (span by the flap)
function gull(ctx, x, y, h, flap, k, shadow) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(h); ctx.scale(k, k);
  const span = 17 * (0.78 + 0.22 * flap), sweep = 4 - flap * 3;
  const wing = sd => { ctx.beginPath(); ctx.moveTo(3, 0); ctx.quadraticCurveTo(2, sd * span * 0.5, -sweep, sd * span); ctx.quadraticCurveTo(-4, sd * span * 0.55, -4, 0); ctx.closePath(); };
  if (shadow) {
    ctx.fillStyle = 'rgba(40,30,20,0.2)'; wing(1); ctx.fill(); wing(-1); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 2.6, 0, 0, TAU); ctx.fill();
  } else {
    for (const sd of [1, -1]) {
      wing(sd); ctx.fillStyle = '#c9ced6'; ctx.fill(); ctx.strokeStyle = 'rgba(70,78,90,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-sweep - 0.5, sd * span); ctx.quadraticCurveTo(-3, sd * span * 0.8, -2.4, sd * span * 0.72); ctx.lineTo(-sweep + 2.2, sd * span * 0.78); ctx.closePath(); ctx.fillStyle = '#2a2d33'; ctx.fill();   // the black tip
    }
    ctx.beginPath(); ctx.ellipse(-0.5, 0, 7.5, 2.6, 0, 0, TAU); ctx.fillStyle = '#f8f9fb'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-7.5, 0); ctx.lineTo(-11, -2.2); ctx.lineTo(-11, 2.2); ctx.closePath(); ctx.fillStyle = '#e9ecf0'; ctx.fill();   // the tail
    ctx.beginPath(); ctx.arc(6.5, 0, 2.3, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(8.5, -0.7); ctx.lineTo(11, 0); ctx.lineTo(8.5, 0.7); ctx.closePath(); ctx.fillStyle = '#f2b632'; ctx.fill();   // the bill
  }
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ Silicon Circuit: LEDs
// The status LEDs on the board blink: most with a slow heartbeat, some flickering like activity lights. Only the lit
// glow is drawn here (the LED itself is in the track layer, art/chips.js, which says where they are).
function leds(ctx, T, t) {
  const V = viewOf(ctx, 40);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const d of boardLeds(T)) {
    if (!inView(V, d.x, d.y, 30)) continue;
    const busy = Math.floor(d.v * 1000) % 3 === 0, ph = d.v * 97;
    const on = busy ? (Math.sin(t * 23 + ph) + Math.sin(t * 9.7 + ph * 2) > 0.4 ? 1 : 0.15) : 0.15 + 0.85 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.2 + ph), 3);
    if (on < 0.05) continue;
    const r = 26, g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, r);
    g.addColorStop(0, alpha(d.col, 0.75 * on)); g.addColorStop(0.3, alpha(d.col, 0.3 * on)); g.addColorStop(1, alpha(d.col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.75 * on})`; ctx.beginPath(); ctx.arc(d.x - 1.5, d.y - 1.8, 2.4, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ Cryo Caldera: steam
// Wisps of steam lift off the hot springs and drift away downwind, swelling and thinning as they go.
function steam(ctx, T, t) {
  const V = viewOf(ctx, 60), img = puff('#ffffff'), dark = puff('#56708c');
  ctx.save();
  (T.ponds || []).forEach((p, i) => {
    if (!inView(V, p.x, p.y - 100, p.r * 1.4 + 160)) return;
    for (const pass of [0, 1]) {   // the wisps' shadows first (down and to the right, on the water and the snow), then the wisps
      const rng = mulberry(i * 31 + 7);
      for (let k = 0; k < 9; k++) {
        const life = 3.4 + rng() * 2, u = (t / life + rng()) % 1, a = rng() * TAU, d = Math.sqrt(rng()) * p.r * 0.8;
        const x = p.x + Math.cos(a) * d * 1.2 + u * 60 + Math.sin(t * 0.8 + k) * 10, y = p.y + Math.sin(a) * d * 0.85 - u * 170;
        const r = p.r * (0.13 + rng() * 0.08) * (0.6 + u * 1.3), fade = Math.sin(Math.PI * Math.min(1, u * 1.15)), up = 16 + u * 60;
        if (pass === 0) { ctx.globalAlpha = 0.24 * fade; ctx.drawImage(dark, x + up * 0.6 - r, y + up - r, r * 2, r * 2); }
        else { ctx.globalAlpha = 0.9 * fade; ctx.drawImage(img, x - r, y - r, r * 2, r * 2); }
      }
    }
  });
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ Heap Space: stars
// Here and there a star out in the black flares and fades, each on its own slow beat (a few per screen, never over the
// road, the dome, the moon or the planets). Spots are hashed per cell of the world and kept once worked out.
const STAR_CELL = 260, starCells = new WeakMap();
function starsIn(T, cx, cy) {
  let M = starCells.get(T); if (!M) starCells.set(T, M = new Map());
  const key = cx * 4096 + cy; if (M.has(key)) return M.get(key);
  const rng = mulberry(cx * 73856093 ^ cy * 19349663), dist = distField(T), out = [];
  const lg = T.mech ? T.mech.lowg : [], round = lg.flatMap(l => [l.dome, l.moon, ...(l.planets || [])]).filter(Boolean);
  for (let k = 0; k < 2; k++) {
    const x = (cx + rng()) * STAR_CELL, y = (cy + rng()) * STAR_CELL, r = 5 + rng() * 6, ph = rng() * TAU, w = 0.5 + rng() * 0.9, col = rng() < 0.7 ? '#ffffff' : rng() < 0.5 ? '#bfe3ff' : '#ffe6b3';
    if (dist(x, y, 140) < 90 || round.some(c => Math.hypot(c.x - x, c.y - y) < c.r + 40)) continue;
    out.push({ x, y, r, ph, w, col });
  }
  M.set(key, out); return out;
}
function twinkle(ctx, T, t) {
  const V = viewOf(ctx, 20);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (let cy = Math.floor(V.y0 / STAR_CELL); cy <= Math.floor(V.y1 / STAR_CELL); cy++) for (let cx = Math.floor(V.x0 / STAR_CELL); cx <= Math.floor(V.x1 / STAR_CELL); cx++) {
    for (const s of starsIn(T, cx, cy)) {
      const a = Math.pow(0.5 + 0.5 * Math.sin(t * s.w + s.ph), 6); if (a < 0.03) continue;
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 1.6); g.addColorStop(0, alpha(s.col, 0.7 * a)); g.addColorStop(1, alpha(s.col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 1.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = alpha(s.col, 0.85 * a); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(s.x - s.r, s.y); ctx.lineTo(s.x + s.r, s.y); ctx.moveTo(s.x, s.y - s.r); ctx.lineTo(s.x, s.y + s.r); ctx.stroke();
    }
  }
  ctx.restore();
}
