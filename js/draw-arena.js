// Kernel Kart: Fight mode's places (draw-arena.js; draw-fight.js draws the fight on them). Cosmetic only.
// Calm and a little solid: few, large shapes, soft shading lit from the top left (shadows fall down and right), no
// outlines, quiet colours. Every map is a floor inside a real low wall (the bounds are its inner face: fighters can't
// leave, and it's what they get slammed into): its inner face shows along the back, its outer face along the front, its
// coping stones on top with lit edges, and it throws a soft shadow onto the floor inside. The front stretch is drawn
// again over the fighters (drawFront), so a fighter pressed against it stands behind it.
//   Sky Ring (look 'sky')    the floating stone ring over the sky: the void (a sky gradient, the sun's glow top left, a
//                            hazy sea of cloud, two faint islands, drifting clouds), a round slab with an engraved emblem,
//                            the parapet, and the rock underside fading into the haze
//   Pillar Court ('court')   a sunlit sandstone courtyard on a lawn: worn flagstones (by tone), a gravel apron, a few
//                            trees, four columns (plinth, fluted shaft, capital) casting long shadows
//   Data Bus ('hall')        a server hall: racks along the back, an epoxy floor under overhead lamps, a cable trench,
//                            two chevron-cleated conveyor belts that run (their cleats point and move the way they push),
//                            wooden shipping crates
//   Cold Boot ('rink')       a frosty arena in a snowfield with pines: frosted flags, snow drifted against the wall, a
//                            glassy sunken ice sheet (reflections, scratches, a slow sheen and glints), two floor grates
//                            that glow and steam as they warn, then roar with heat and haze (heatState)
// The static layers are drawn once into offscreen canvases and blitted each frame: the sky and the far layer (per view
// size, pixel ratio and look), the surroundings, the floor with its walls, the front wall, the solids and the belts'
// cleats (per arena, zoom step and look). The camera's zoom only crosses a step (quarter octaves) now and then. A small
// LRU, so the setup screen's move clips (one size, one zoom) share theirs and stay cheap.
import { TAU, clamp } from './core.js';
import { ARENAS, arenaBox, heatState } from './fight-arenas.js';
import { BK, bold, lookGen } from './look.js';
import { LX, LY, aoBlob, mat, bevelRing, drumGradient, lightPool, litOf, metal, mix, rgba, shadeBox, shadeCylinder, stone, tone, wood, leaf } from './art/arena-mat.js';

export const RIM = 34;              // the side face's height below the platform's edge (world units)
export const UNDER = 0.32;          // how far the rocky underside hangs below the rim, of the radius

// ---------------------------------------------------------------- the layer cache
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const LAYERS = new Map();
// a layer covering the box x, y, w, h (in the units draw uses) at s pixels a unit; null without a DOM (then draw direct)
function layer(key, x, y, w, h, s, draw) {
  let L = LAYERS.get(key);
  if (L) { LAYERS.delete(key); LAYERS.set(key, L); return L; }
  if (typeof document === 'undefined') return null;
  s = Math.min(s, 4096 / w, 4096 / h);
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.ceil(w * s)); cv.height = Math.max(1, Math.ceil(h * s));
  const g = cv.getContext('2d'); g.scale(s, s); g.translate(-x, -y); draw(g);
  L = { cv, x, y, w: cv.width / s, h: cv.height / s };
  LAYERS.set(key, L); if (LAYERS.size > 28) LAYERS.delete(LAYERS.keys().next().value);
  return L;
}
function cached(g, key, x, y, w, h, s, draw, dx = 0, dy = 0) {
  const L = layer(key, x, y, w, h, s, draw);
  if (L) g.drawImage(L.cv, L.x + dx, L.y + dy, L.w, L.h);
  else { g.save(); g.translate(dx, dy); draw(g); g.restore(); }
}
// the zoom step a world layer is drawn at: pixels a unit rounded up to a quarter octave (so it's only ever scaled down)
export const zstep = k => Math.pow(2, Math.ceil(Math.log2(Math.max(0.05, k)) * 4) / 4);

// ---------------------------------------------------------------- colour
// (rgba, mix, tone and the materials: art/arena-mat.js, shared by every map)

const PAL_FLAT = {
  sky: ['#a3c7e3', '#c4daeb', '#e2ebf1'], haze: '#e2ebf1', far: '#b3c4d3', farTop: '#c9d5de', sea: '#eef2f5', sea2: '#f8fafb', cloudShade: '#a9bcd2',
  top: '#e2dbcc', warm: '#cdb68c', cool: '#b8bcbd', light: '#fffaf0', dark: '#5a4a36', bevLit: '#f9f5ec', bevDark: '#a8987e', edge: '#7c6a52',
  sideLit: '#cdbfa6', side: '#ae9f88', sideDark: '#7a6d5c', rock: '#6c6158', rockDark: '#38322d',
};
const PAL_CLASSIC = { ...PAL_FLAT, sky: ['#7db6e6', '#b2d4ee', '#e3eef6'], haze: '#e3eef6' };
const pal = () => bold() ? PAL_FLAT : PAL_CLASSIC;

// ---------------------------------------------------------------- the void
// the sky and the far layer are per view (screen units); the drifting clouds are live
export function drawVoid(g, t, C, W, H, D) {
  const P = pal(), BD = bold(), gen = lookGen();
  cached(g, `sky|${W}|${H}|${D}|${gen}|${BD}`, 0, 0, W, H, D, q => paintSky(q, W, H, P));
  // the far layer: a little parallax against the camera
  const m = 60, px = clamp(-C.x * 0.04, -m, m), py = clamp(-C.y * 0.025, -24, 24);
  cached(g, `far|${W}|${H}|${D}|${gen}|${BD}`, -m, -30, W + m * 2, H + 60, D, q => paintFar(q, W, H, P), px, py);
  // soft clouds at two depths, the nearer ones bigger, faster and with more parallax
  const S = Math.max(0.7, Math.min(W, H) / 700);
  for (let L = 0; L < 2; L++) {
    const n = 3, sp = 4 + L * 7, sc = (0.7 + L * 0.45) * S, a = [0.45, 0.6][L];
    for (let i = 0; i < n; i++) {
      const span = W + 420 * sc, x = (((i / n + L * 0.31 + hash(L * 10 + i) * 0.15) * span + t * sp - C.x * 0.05 * (L + 1)) % span + span) % span - 210 * sc;
      const y = H * (0.12 + ((i * 0.41 + L * 0.23) % 1) * 0.55) - C.y * 0.04 * (L + 1);
      g.globalAlpha = a; cloud(g, x, y, sc * (0.8 + (i % 3) * 0.2), (i + L) % 3, D); g.globalAlpha = 1;
    }
  }
}
function paintSky(g, W, H, P) {
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, P.sky[0]); gr.addColorStop(0.55, P.sky[1]); gr.addColorStop(1, P.sky[2]);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // the sun's glow, top left (where the light comes from)
  const sx = W * 0.08, sy = -H * 0.04, R = Math.max(W, H) * 0.6, sg = g.createRadialGradient(sx, sy, 0, sx, sy, R);
  sg.addColorStop(0, 'rgba(255,251,238,0.75)'); sg.addColorStop(0.3, 'rgba(255,249,232,0.25)'); sg.addColorStop(1, 'rgba(255,249,232,0)');
  g.fillStyle = sg; g.fillRect(0, 0, W, H);
}
// the far layer: two faint islands in the haze, then the sea of cloud far below
function paintFar(g, W, H, P) {
  const S = Math.max(0.7, Math.min(W, H) / 700);
  farIsle(g, W * 0.12, H * 0.52, S * 1.1, P); farIsle(g, W * 0.87, H * 0.4, S * 0.75, P);
  // the haze thickening toward the horizon
  const hz = g.createLinearGradient(0, H * 0.35, 0, H * 0.82); hz.addColorStop(0, rgba(P.haze, 0)); hz.addColorStop(1, rgba(P.haze, 0.85));
  g.fillStyle = hz; g.fillRect(-80, H * 0.35, W + 240, H * 0.5);
  // the cloud sea: a pale floor fading in, then two soft banks of puffs, the nearer one lower and bigger
  const y0 = H * 0.8;
  const fl = g.createLinearGradient(0, y0 - 40 * S, 0, H + 30); fl.addColorStop(0, rgba(P.sea, 0)); fl.addColorStop(0.25, P.sea); fl.addColorStop(1, P.sea2);
  g.fillStyle = fl; g.fillRect(-80, y0 - 40 * S, W + 240, H - y0 + 80 * S);
  for (const [yy, rk, al, seed] of [[y0, 1, 0.75, 40], [y0 + 60 * S, 1.4, 0.9, 140]]) {
    for (let x = -80, i = 0; x < W + 160; i++) {
      const r = (46 + hash(i + seed) * 40) * S * rk, y = yy + (hash(i * 3 + seed + 1) - 0.4) * 18 * S;
      puff(g, x, y, r, al); x += r * 1.1;
    }
  }
}
function farIsle(g, x, y, s, P) {
  g.save(); g.translate(x, y); g.scale(s, s); g.globalAlpha = 0.4;
  const gr = g.createLinearGradient(0, 0, 0, 60); gr.addColorStop(0, P.far); gr.addColorStop(1, rgba(P.far, 0));
  g.fillStyle = gr; g.beginPath(); g.moveTo(-46, 0); g.bezierCurveTo(-44, 22, -18, 30, -4, 58); g.bezierCurveTo(4, 34, 40, 24, 46, 0); g.closePath(); g.fill();
  g.fillStyle = P.farTop; g.beginPath(); g.ellipse(0, 0, 46.5, 7, 0, 0, TAU); g.fill();
  g.restore();
}
// one soft puff: a radial gradient, brightest toward the light
function puff(g, x, y, r, a) {
  const gr = g.createRadialGradient(x - r * 0.25, y - r * 0.3, 0, x, y, r);
  gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.55, `rgba(255,255,255,${a * 0.8})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
// a cloud sprite per shape and pixel ratio, drawn at a scale
const CLOUDS = [
  [[-46, 6, 30], [-14, -8, 40], [26, -2, 34], [56, 8, 26], [0, 12, 34]],
  [[-34, 4, 26], [-4, -6, 34], [30, 2, 28], [6, 10, 30]],
  [[-58, 8, 24], [-28, -2, 32], [6, -10, 36], [42, 0, 30], [70, 8, 22]],
];
function cloud(g, x, y, s, k, D) {
  const P = pal(), sz = 3;   // (the sprite at 3 px a unit: drawn at up to about 1.5x that)
  const L = layer(`cloud|${k}|${D}|${lookGen()}|${bold()}`, -110, -62, 220, 124, sz * Math.min(D, 1.5) / 1.5, q => {
    for (const [cx, cy, r] of CLOUDS[k]) puff(q, cx, cy, r, 0.85);
    // the shaded underside
    q.globalCompositeOperation = 'source-atop';
    const gr = q.createLinearGradient(0, -20, 0, 50); gr.addColorStop(0, rgba(P.cloudShade, 0)); gr.addColorStop(1, rgba(P.cloudShade, 0.55));
    q.fillStyle = gr; q.fillRect(-110, -62, 220, 124);
    q.globalCompositeOperation = 'source-over';
  });
  if (L) g.drawImage(L.cv, x + L.x * s, y + L.y * s, L.w * s, L.h * s);
}


// ---------------------------------------------------------------- the wall (every map)
export const WALL = 12;              // the low wall's thickness round the edge (world units, drawn outside the bounds: the
                                     // bounds are its inner face, where the fighters stop)
export const WALL_H = 16;            // how high it's drawn (a touch under fight-arenas.js WALL_TALL, so it reads as low)
const SHX = 0.5, SHY = 0.68;         // where a shadow falls per unit of height (down and right)
const arenaOfF = F => F.A || ARENAS.ring;
const isRing = F => { const A = arenaOfF(F); return A.look === 'sky' && A.bounds.shape === 'circle'; };
const LEDGE = 6;                     // the Sky Ring's slab reaches this far past the wall
const slabR = A => A.bounds.r + WALL + LEDGE;

// the outline as a path, grown by e (the wall's outer face: e = WALL); fresh: start a new path (else add a subpath)
export function shapePath(g, b, e = 0, fresh = true) {
  if (fresh) g.beginPath();
  if (b.shape === 'circle') { g.moveTo((b.x || 0) + b.r + e, b.y || 0); g.arc(b.x || 0, b.y || 0, b.r + e, 0, TAU); }
  else if (b.shape === 'box') g.roundRect((b.x || 0) - b.w / 2 - e, (b.y || 0) - b.h / 2 - e, b.w + e * 2, b.h + e * 2, Math.max(0, (b.r || 0) + e));
  else { b.pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); }
}
// points round an outline, about every step units of the wall's outer face: { x, y, nx, ny } (n: outward), clockwise on
// screen, not closed
const RIMS = new WeakMap();
function rim(b, step = 6) {
  let P = RIMS.get(b); if (P) return P;
  P = [];
  if (b.shape === 'circle') {
    const n = Math.max(32, Math.ceil(TAU * (b.r + WALL) / step));
    for (let i = 0; i < n; i++) { const a = i / n * TAU, c = Math.cos(a), s = Math.sin(a); P.push({ x: (b.x || 0) + c * b.r, y: (b.y || 0) + s * b.r, nx: c, ny: s }); }
  } else if (b.shape === 'box') {
    const cx = b.x || 0, cy = b.y || 0, hw = b.w / 2, hh = b.h / 2, rc = Math.min(b.r || 0, hw, hh), H = Math.PI / 2;
    const C = [[hw - rc, -(hh - rc), -H], [hw - rc, hh - rc, 0], [-(hw - rc), hh - rc, H], [-(hw - rc), -(hh - rc), Math.PI]];
    for (let k = 0; k < 4; k++) {
      const [ox, oy, a0] = C[k], na = Math.max(2, Math.ceil((rc + WALL) * H / step));
      for (let i = 0; i < na; i++) { const a = a0 + i / na * H, c = Math.cos(a), s = Math.sin(a); P.push({ x: cx + ox + c * rc, y: cy + oy + s * rc, nx: c, ny: s }); }
      const c = Math.cos(a0 + H), s = Math.sin(a0 + H), px = cx + ox + c * rc, py = cy + oy + s * rc, [qx, qy] = C[(k + 1) % 4];
      const ex = cx + qx + c * rc - px, ey = cy + qy + s * rc - py, ns = Math.max(1, Math.ceil(Math.hypot(ex, ey) / step));
      for (let i = 0; i < ns; i++) P.push({ x: px + ex * i / ns, y: py + ey * i / ns, nx: c, ny: s });
    }
  } else {   // a polygon: along each edge, the normal pointing out (by its winding)
    const pts = b.pts; let ar = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) ar += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]);
    const sg = ar > 0 ? 1 : -1;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length], L = Math.hypot(bx - ax, by - ay) || 1, ns = Math.max(1, Math.ceil(L / step));
      for (let k = 0; k < ns; k++) P.push({ x: ax + (bx - ax) * k / ns, y: ay + (by - ay) * k / ns, nx: -sg * (by - ay) / L, ny: sg * (bx - ax) / L });
    }
  }
  RIMS.set(b, P); return P;
}

// the wall's colours per look
const WALLS = {
  sky: { cap: '#ece5d6', capVar: '#d9cfbb', mortar: '#b9ab92', faceLit: '#ddd2bc', face: '#bfb197', faceDark: '#8f816b', inner: '#d4c8b0', innerDark: '#a29479', shadow: '60,46,30', block: 30 },
  court: { cap: '#f0e5cd', capVar: '#ddcfb0', mortar: '#bfaa85', faceLit: '#e3d3b2', face: '#c9b38c', faceDark: '#977f5d', inner: '#d9c7a4', innerDark: '#a89170', shadow: '70,52,28', block: 38 },
  hall: { cap: '#d6d8d6', capVar: '#c7cbcb', mortar: '#a0a6aa', faceLit: '#bfc3c4', face: '#a0a6aa', faceDark: '#6f767d', inner: '#b6bbbd', innerDark: '#858c92', shadow: '30,36,50', block: 46 },
  rink: { cap: '#f6f9fb', capVar: '#e4ecf2', mortar: '#b9c7d2', faceLit: '#c9d3da', face: '#a7b4be', faceDark: '#73828e', inner: '#bfcbd4', innerDark: '#8b9aa6', shadow: '40,62,90', block: 34 },
};
const wallOf = A => WALLS[A.look] || WALLS.court;
// the things on each map, one material each (art/arena-mat.js), picked from the map's palette so they sit in it
const MATS = {
  court: { pillar: stone('#dfcca8'), bark: wood('#8a7058'), leaf: leaf('#8aa572') },
  hall: { crate: wood('#c79f6e'), rack: metal('#5b6570'), belt: mat('#5f6873'), floor: stone('#c9cdcf') },
  rink: { grate: metal('#8c969f'), bark: wood('#76604c'), leaf: leaf('#5d7d6a') },
};
// part: 'all' (the inner faces along the back, the outer faces along the front, the coping) or 'front' (the outer faces
// and the coping only: drawn again over the fighters, clipped to the front stretch)
function paintWall(g, b, W, part = 'all') {
  const R = rim(b), n = R.length, H = WALL_H, T = WALL;
  g.lineJoin = 'round';
  const quad = (ax, ay, bx, by, h0, h1, top, bot) => {
    const gr = g.createLinearGradient(0, Math.min(ay, by) - h1, 0, Math.max(ay, by) - h0); gr.addColorStop(0, top); gr.addColorStop(1, bot);
    g.fillStyle = gr; g.strokeStyle = gr; g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(ax, ay - h0); g.lineTo(bx, by - h0); g.lineTo(bx, by - h1); g.lineTo(ax, ay - h1); g.closePath(); g.fill(); g.stroke();
  };
  for (let i = 0; i < n; i++) {
    const p = R[i], q = R[(i + 1) % n], nx = (p.nx + q.nx) / 2, ny = (p.ny + q.ny) / 2;
    if (part === 'all' && ny < -0.02) {   // the inner face, seen along the back: lit where it faces the light
      const col = mix(W.innerDark, W.inner, clamp(0.5 - litOf(nx, ny) * 0.75, 0, 1));
      quad(p.x, p.y, q.x, q.y, 0, H, col, mix(col, W.innerDark, 0.55));
    }
    if (ny > 0.02) {   // the outer face, seen along the front
      const col = mix(W.faceDark, W.faceLit, clamp(0.55 + litOf(nx, ny) * 0.75, 0, 1));
      quad(p.x + p.nx * T, p.y + p.ny * T, q.x + q.nx * T, q.y + q.ny * T, 0, H, col, mix(col, W.faceDark, 0.5));
    }
  }
  // the coping: the mortar under it, then the stones, each its own tone, with a gentle light fall-off
  g.save(); g.translate(0, -H);
  g.fillStyle = W.mortar; shapePath(g, b, T); shapePath(g, b, 0, false); g.fill('evenodd');
  let L = 0; const per = [];
  for (let i = 0; i < n; i++) { const p = R[i], q = R[(i + 1) % n]; per.push(L); L += Math.hypot(q.x + q.nx * T / 2 - p.x - p.nx * T / 2, q.y + q.ny * T / 2 - p.y - p.ny * T / 2); }
  const nb = Math.max(6, Math.round(L / W.block)), bl = L / nb;
  for (let k = 0, i = 0; k < nb; k++) {
    const pts = []; while (i < n && per[i] < (k + 1) * bl - 0.01) pts.push(R[i++]);
    pts.push(R[i % n]);
    if (pts.length < 2) continue;
    const h = hash(k * 7 + 3), col = mix(W.cap, W.capVar, h * 0.8), gap = 0.45;
    const tx0 = pts[1].x - pts[0].x, ty0 = pts[1].y - pts[0].y, l0 = Math.hypot(tx0, ty0) || 1, a = pts[0], z = pts[pts.length - 1], y0 = pts[pts.length - 2];
    const tx1 = z.x - y0.x, ty1 = z.y - y0.y, l1 = Math.hypot(tx1, ty1) || 1;
    g.fillStyle = col; g.beginPath();
    g.moveTo(a.x + tx0 / l0 * gap, a.y + ty0 / l0 * gap);
    for (let j = 1; j < pts.length - 1; j++) g.lineTo(pts[j].x, pts[j].y);
    g.lineTo(z.x - tx1 / l1 * gap, z.y - ty1 / l1 * gap); g.lineTo(z.x + z.nx * T - tx1 / l1 * gap, z.y + z.ny * T - ty1 / l1 * gap);
    for (let j = pts.length - 2; j > 0; j--) g.lineTo(pts[j].x + pts[j].nx * T, pts[j].y + pts[j].ny * T);
    g.lineTo(a.x + a.nx * T + tx0 / l0 * gap, a.y + a.ny * T + ty0 / l0 * gap); g.closePath(); g.fill();
  }
  // the light across the coping, top left to bottom right, and the rounded arrises: the outer one bright where it faces
  // the light, the inner one where it looks back toward it
  const B = arenaBox({ bounds: b });
  const lg = g.createLinearGradient(B.x0, B.y0, B.x1, B.y1); lg.addColorStop(0, 'rgba(255,255,255,0.18)'); lg.addColorStop(0.5, 'rgba(255,255,255,0)'); lg.addColorStop(1, `rgba(${W.shadow},0.12)`);
  g.fillStyle = lg; shapePath(g, b, T); shapePath(g, b, 0, false); g.fill('evenodd');
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const p = R[i], q = R[(i + 1) % n], nx = (p.nx + q.nx) / 2, ny = (p.ny + q.ny) / 2, f = litOf(nx, ny);
    if (f > 0.05) { g.strokeStyle = `rgba(255,255,255,${(0.75 * f).toFixed(3)})`; g.lineWidth = 1.6; g.beginPath(); g.moveTo(p.x + p.nx * (T - 0.8), p.y + p.ny * (T - 0.8)); g.lineTo(q.x + q.nx * (T - 0.8), q.y + q.ny * (T - 0.8)); g.stroke(); }
    if (f < -0.05) { g.strokeStyle = `rgba(255,255,255,${(-0.6 * f).toFixed(3)})`; g.lineWidth = 1.4; g.beginPath(); g.moveTo(p.x + p.nx * 0.8, p.y + p.ny * 0.8); g.lineTo(q.x + q.nx * 0.8, q.y + q.ny * 0.8); g.stroke(); }
    else if (f > 0.05) { g.strokeStyle = `rgba(${W.shadow},${(0.22 * f).toFixed(3)})`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(p.x + p.nx * 0.6, p.y + p.ny * 0.6); g.lineTo(q.x + q.nx * 0.6, q.y + q.ny * 0.6); g.stroke(); }
  }
  g.restore();
}
// the wall's shadows: outside, on the ground down and right of it; inside, along the floor under its top-left run (both
// soft: a few faint passes), and a little contact shade all along its foot inside
function wallShadowOut(g, b, W) {
  for (const [t, a] of [[0.5, 0.07], [0.8, 0.06], [1.1, 0.05], [1.4, 0.035]]) {
    g.save(); g.translate(WALL_H * SHX * t, WALL_H * SHY * t); g.fillStyle = `rgba(${W.shadow},${a})`; shapePath(g, b, WALL); g.fill(); g.restore();
  }
}
function wallShadowIn(g, b, W) {
  const B = arenaBox({ bounds: b });
  for (const [t, a] of [[0.4, 0.06], [0.65, 0.06], [0.9, 0.055], [1.15, 0.045], [1.45, 0.03]]) {
    g.beginPath(); g.rect(B.x0 - 60, B.y0 - 60, B.x1 - B.x0 + 120, B.y1 - B.y0 + 120);
    g.save(); g.translate(WALL_H * SHX * t, WALL_H * SHY * t); shapePath(g, b, 0, false); g.restore();
    g.fillStyle = `rgba(${W.shadow},${a})`; g.fill('evenodd');
  }
  g.strokeStyle = `rgba(${W.shadow},0.12)`; g.lineWidth = 6; shapePath(g, b, 0); g.stroke();
  g.strokeStyle = `rgba(${W.shadow},0.1)`; g.lineWidth = 2.5; shapePath(g, b, 0); g.stroke();
}
// where the front stretch starts (screen y): drawn again over the fighters below this
function frontY(A) {
  const B = arenaBox(A);
  return A.bounds.shape === 'circle' ? (A.bounds.y || 0) + A.bounds.r * 0.34 - WALL_H : B.y1 - WALL_H - 6;
}
// sudden death: the coping glows red, pulsing (no words); y0: only below this
function suddenGlow(g, A, t, y0 = -1e9) {
  const p = 0.5 + 0.5 * Math.sin(t * 7), red = bold() ? BK.red : '#ff4b3e', B = arenaBox(A);
  g.save(); g.beginPath(); g.rect(B.x0 - 40, y0, B.x1 - B.x0 + 80, B.y1 + 60 - y0); g.clip();
  g.translate(0, -WALL_H); g.lineJoin = 'round';
  g.strokeStyle = rgba(red, 0.18 + 0.14 * p); g.lineWidth = WALL + 8; shapePath(g, A.bounds, WALL / 2); g.stroke();
  g.strokeStyle = rgba(red, 0.45 + 0.3 * p); g.lineWidth = WALL * 0.55; shapePath(g, A.bounds, WALL / 2); g.stroke();
  g.strokeStyle = `rgba(255,230,210,${(0.3 + 0.3 * p).toFixed(3)})`; g.lineWidth = 1.2; shapePath(g, A.bounds, WALL / 2); g.stroke();
  g.restore();
}

// ---------------------------------------------------------------- the top (the floor, its wall, the live hazards)
export function drawTop(g, F, t, s) {
  const A = arenaOfF(F), B = arenaBox(A), BD = bold(), m = WALL + 30;
  if (isRing(F)) {
    const R = slabR(A), P = pal();
    cached(g, `top|${A.bounds.r}|${s}|${lookGen()}|${BD}`, -R - 4, -R - WALL_H - 4, R * 2 + 8, R * 2 + WALL_H + 8, s, q => paintTop(q, A, R, P));
  } else cached(g, `floor|${A.id}|${s}|${lookGen()}|${BD}`, B.x0 - m, B.y0 - m - WALL_H, B.x1 - B.x0 + m * 2, B.y1 - B.y0 + m * 2 + WALL_H, s, q => paintArena(q, A));
  drawHazards(g, A, F, t, s);
  if (F.phase === 'sudden') suddenGlow(g, A, t);
}
// over the fighters: the front stretch of the wall (a fighter pressed against it stands behind it), the vents' heat and
// steam rising, and the sudden-death glow on that stretch
export function drawFront(g, F, t, s) {
  const A = arenaOfF(F), B = arenaBox(A), y0 = frontY(A), W = wallOf(A), BD = bold();
  cached(g, `front|${A.id}|${A.bounds.r || 0}|${s}|${lookGen()}|${BD}`, B.x0 - WALL - 3, y0, B.x1 - B.x0 + WALL * 2 + 6, B.y1 + WALL + 3 - y0, s, q => {
    q.save(); q.beginPath(); q.rect(B.x0 - WALL - 3, y0, B.x1 - B.x0 + WALL * 2 + 6, B.y1 + WALL + 3 - y0); q.clip(); paintWall(q, A.bounds, W, 'front'); q.restore();
  });
  for (const h of A.hazards) if (h.kind === 'heat') ventRise(g, h, F, t);
  if (F.phase === 'sudden') suddenGlow(g, A, t, y0);
}
// an engraved line along a path: a dark groove with its lower-right wall catching the light
function engrave(g, path, w, P, k = 1) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.save(); g.translate(0.9, 0.9); g.strokeStyle = rgba(P.light, 0.55 * k); g.lineWidth = w; path(); g.stroke(); g.restore();
  g.strokeStyle = rgba(P.dark, 0.2 * k); g.lineWidth = w; path(); g.stroke();
}
// the Sky Ring: the round slab (R: its edge, a ledge past the wall), its stone, the emblem, then the wall on it
function paintTop(g, A, R, P) {
  const n = Math.round(450 * (R / 200) ** 2), r = A.bounds.r, W = WALLS.sky;
  g.save(); g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
  g.fillStyle = P.top; g.fillRect(-R - 1, -R - 1, R * 2 + 2, R * 2 + 2);
  // the stone's own tone: broad soft patches, then a fine grain
  for (let i = 0; i < 18; i++) {
    const x = (hash(i + 1) - 0.5) * 380, y = (hash(i + 21) - 0.5) * 380, rr = 50 + hash(i + 41) * 90, c = [P.light, P.dark, P.warm, P.cool][i % 4], a = [0.2, 0.07, 0.12, 0.1][i % 4];
    const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, rgba(c, a)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  for (let i = 0; i < n; i++) {
    const a = hash(i * 2 + 500) * TAU, rr = Math.sqrt(hash(i * 2 + 501)) * R, z = 0.6 + hash(i + 900) * 0.9;
    g.fillStyle = i % 3 ? rgba(P.dark, 0.07) : rgba(P.light, 0.35);
    g.fillRect(Math.cos(a) * rr, Math.sin(a) * rr, z, z);
  }
  const lg = g.createLinearGradient(-R * 0.8, -R * 0.9, R * 0.8, R * 0.9);
  lg.addColorStop(0, rgba(P.light, 0.32)); lg.addColorStop(0.5, rgba(P.light, 0)); lg.addColorStop(1, rgba(P.dark, 0.16));
  g.fillStyle = lg; g.fillRect(-R, -R, R * 2, R * 2);
  // the emblem in the middle: a ring round a chip, engraved; a groove a little in from the wall
  if (r > 70) {
    engrave(g, () => { g.beginPath(); g.arc(0, 0, 56, 0, TAU); }, 2.6, P);
    engrave(g, () => {
      g.beginPath(); g.roundRect(-16, -16, 32, 32, 5);
      for (const o of [-8, 0, 8]) for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const vx = -uy, vy = ux; g.moveTo(ux * 22 + vx * o, uy * 22 + vy * o); g.lineTo(ux * 28 + vx * o, uy * 28 + vy * o); }
    }, 2.4, P);
    engrave(g, () => { g.beginPath(); g.arc(0, 0, r - 22, 0, TAU); }, 2, P, 0.7);
  }
  // the slab's rounded edge round the ledge, shaded by which way each bit faces
  const bw = Math.min(5, R * 0.3), N = 96;
  for (let i = 0; i < N; i++) {
    const a0 = i / N * TAU, a1 = (i + 1.06) / N * TAU, am = (a0 + a1) / 2, cx = Math.cos(am), cy = Math.sin(am);
    const sh = (cx * LX + cy * LY + 1) / 2, col = mix(P.bevDark, P.bevLit, sh * sh * (3 - 2 * sh));
    const gr = g.createLinearGradient(cx * (R - bw), cy * (R - bw), cx * R, cy * R);
    gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.5, rgba(col, 0.9)); gr.addColorStop(1, col);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R + 1, a0, a1); g.arc(0, 0, R - bw, a1, a0, true); g.closePath(); g.fill();
  }
  wallShadowOut(g, A.bounds, W);
  g.save(); shapePath(g, A.bounds); g.clip(); wallShadowIn(g, A.bounds, W); g.restore();
  g.restore();
  g.strokeStyle = rgba(P.edge, 0.55); g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, Math.max(0, R - 0.4), 0, TAU); g.stroke();
  paintWall(g, A.bounds, W);
}
// ---------------------------------------------------------------- the underside
export function drawUnder(g, F, t, s) {
  if (!isRing(F)) { drawSurrounds(g, arenaOfF(F), s); return; }
  const R = slabR(arenaOfF(F)), P = pal(), BD = bold(), d = R * UNDER;
  if (R <= 0.5) return;
  cached(g, `under|${R}|${s}|${lookGen()}|${BD}`, -R - 30, -4, R * 2 + 60, RIM + R + d + 60, s, q => paintUnder(q, R, P));
}
function paintUnder(g, R, P) {
  const d = R * UNDER, k = R / 200, tip = RIM + R + d, lip = a => [Math.cos(a) * R * 0.99, RIM * 0.9 + Math.sin(a) * R * 0.99];
  const cone = () => {
    g.beginPath(); g.moveTo(...lip(Math.PI * 0.97));
    g.bezierCurveTo(-R * 0.8, RIM + R * 0.98, -R * 0.3, RIM + R + d * 0.8, -R * 0.02, tip);
    g.quadraticCurveTo(0, tip + 8 * k, R * 0.03, tip - 2 * k);
    g.bezierCurveTo(R * 0.32, RIM + R + d * 0.8, R * 0.8, RIM + R * 0.98, ...lip(Math.PI * 0.03));
    g.arc(0, RIM * 0.9, R * 0.99, Math.PI * 0.03, Math.PI * 0.97); g.closePath();
  };
  // the rock: lit from the left, darker on the right and deeper down, fading into the haze toward its tip
  g.fillStyle = P.rock; cone(); g.fill();
  g.save(); cone(); g.clip();
  const box = (st) => { g.fillStyle = st; g.fillRect(-R - 30, RIM - 10, R * 2 + 60, R + d + 60); };
  for (let i = 0; i < 7; i++) {   // broad soft form: a few bulges and hollows
    const x = (hash(i + 70) - 0.5) * R * 1.3, y = RIM + R * (0.95 + hash(i + 80) * 0.25), r = R * (0.18 + hash(i + 90) * 0.2), c = x < 0 ? P.light : P.rockDark;
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r); gr.addColorStop(0, rgba(c, 0.12)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  let gr = g.createLinearGradient(-R, 0, R, 0); gr.addColorStop(0, rgba(P.light, 0.22)); gr.addColorStop(0.42, rgba(P.light, 0)); gr.addColorStop(1, rgba(P.rockDark, 0.6)); box(gr);
  gr = g.createLinearGradient(0, RIM + R * 0.85, 0, tip); gr.addColorStop(0, rgba(P.rockDark, 0)); gr.addColorStop(1, rgba(P.rockDark, 0.35)); box(gr);
  gr = g.createLinearGradient(0, RIM + R + d * 0.45, 0, tip + 8); gr.addColorStop(0, rgba(P.haze, 0)); gr.addColorStop(1, rgba(P.haze, 0.6)); box(gr);
  // the soft shadow under the slab where it meets the rock
  g.strokeStyle = rgba(P.rockDark, 0.16);
  for (const w of [30, 18, 9]) { g.lineWidth = w * Math.max(0.5, k); g.beginPath(); g.arc(0, RIM, R, 0, Math.PI); g.stroke(); }
  g.restore();
  // the side face: the slab's edge seen from the front, lit on the left, darker to the right and toward the bottom
  const band = (j = 0) => { g.beginPath(); g.arc(0, j, R, 0, Math.PI); g.lineTo(-R, RIM); g.arc(0, RIM, R, Math.PI, 0, true); g.closePath(); };
  gr = g.createLinearGradient(-R, 0, R, 0); gr.addColorStop(0, P.sideLit); gr.addColorStop(0.45, P.side); gr.addColorStop(1, P.sideDark);
  g.fillStyle = gr; band(); g.fill();
  g.save(); band(); g.clip();
  const dk = j => 0.34 * Math.pow(j / RIM, 1.4);   // (nested bands, each a little darker: no seams)
  for (let j = 1; j < RIM; j++) { g.fillStyle = rgba(P.rockDark, dk(j) - dk(j - 1)); band(j); g.fill(); }
  for (let i = 0; i < Math.round(160 * k); i++) {   // the grain
    const a = hash(i + 1300) * Math.PI, y = hash(i + 1700) * RIM, z = 0.7 + hash(i + 2100);
    g.fillStyle = i % 3 ? rgba(P.rockDark, 0.12) : rgba(P.light, 0.25); g.fillRect(Math.cos(a) * R, Math.sin(a) * R + y, z, z);
  }
  // the top of the face, just under the rounded edge, still catching some light
  g.strokeStyle = rgba(P.light, 0.22); g.lineWidth = 3; g.beginPath(); g.arc(0, 2, R, 0, Math.PI); g.stroke();
  g.restore();
}
// low clouds drifting in front of the island's underside (world units, drawn after the underside, before the top)
export function drawLowClouds(g, F, t, D) {
  if (!isRing(F)) return;
  const B = arenaBox(arenaOfF(F)), R = Math.max((B.x1 - B.x0) / 2 + WALL, 80), span = R * 6;
  for (let i = 0; i < 2; i++) {
    const x = ((t * (8 + i * 4) + i * span * 0.55) % span + span) % span - span / 2, y = RIM + R * (1.25 + i * 0.22);
    g.globalAlpha = 0.4; cloud(g, x, y, 1 + i * 0.3, (i + 1) % 3, D); g.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- the other maps
// each look: its ground beyond the wall, its floor, and the colours its thumbnail uses
const LOOKS = {
  sky: { ground: '#bcd6ea', floor: '#e2dbcc' },
  court: { ground: '#a8bc8a', floor: '#e6d7b9', mortar: '#d0bd9a', stone: ['#ebdfc5', '#e2d2b2', '#e7d8ba', '#dfd2b9'] },
  hall: { ground: '#69727c', floor: '#c9cdcf', mortar: '#b9bec1', stone: ['#ccd0d1', '#c5c9cb', '#cacecf', '#c2c7c9'] },
  rink: { ground: '#e4ebf0', floor: '#dde5ea', mortar: '#c3ced7', stone: ['#e3eaee', '#d5dee5', '#dbe3e9', '#cfd9e1'] },
};
const lookOf = A => LOOKS[A.look] || LOOKS.court;
// soft tone patches over a box: n radial blobs in the given colours
function patches(g, x0, y0, x1, y1, n, cols, a, seed, r0 = 40, r1 = 120) {
  for (let i = 0; i < n; i++) {
    const x = x0 + hash(i + seed) * (x1 - x0), y = y0 + hash(i + seed + 50) * (y1 - y0), r = r0 + hash(i + seed + 90) * (r1 - r0), c = cols[i % cols.length];
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgba(c, a)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
// laid stones by tone (no drawn lines: the joints are just the mortar showing through a hair's gap): rows of height rh,
// stones of random lengths, staggered, each a touch lighter along its top-left edges (worn round)
function flags(g, B, L, rh, wmin, wmax, seed) {
  g.fillStyle = L.mortar; g.fillRect(B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0);
  for (let j = 0, y = B.y0 - hash(seed) * rh; y < B.y1; j++, y += rh) {
    for (let i = 0, x = B.x0 - hash(seed + j * 13) * wmax; x < B.x1; i++) {
      const w = wmin + hash(seed + j * 31 + i * 7) * (wmax - wmin), h = hash(seed + j * 17 + i * 3);
      g.fillStyle = mix(L.stone[(i + j * 3) % 4], L.stone[(i * 5 + j + 1) % 4], h); g.fillRect(x + 0.6, y + 0.6, w - 1.2, rh - 1.2);
      g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(x + 0.6, y + 0.6, w - 1.2, 1.3); g.fillRect(x + 0.6, y + 0.6, 1.3, rh - 1.2);
      g.fillStyle = 'rgba(60,45,30,0.05)'; g.fillRect(x + 0.6, y + rh - 2, w - 1.2, 1.4);
      x += w;
    }
  }
}
function grain(g, B, n, light, dark, seed) {
  for (let i = 0; i < n; i++) {
    const x = B.x0 + hash(i * 2 + seed) * (B.x1 - B.x0), y = B.y0 + hash(i * 2 + seed + 1) * (B.y1 - B.y0), z = 0.6 + hash(i + seed + 7) * 0.9;
    g.fillStyle = i % 3 ? dark : light; g.fillRect(x, y, z, z);
  }
}
// the light falling off across a box, top left to bottom right
function falloff(g, B, a = 0.24, d = 0.12, sh = '60,46,30') {
  const lg = g.createLinearGradient(B.x0, B.y0, B.x1, B.y1); lg.addColorStop(0, `rgba(255,255,255,${a})`); lg.addColorStop(0.5, 'rgba(255,255,255,0)'); lg.addColorStop(1, `rgba(${sh},${d})`);
  g.fillStyle = lg; g.fillRect(B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0);
}

// the ground beyond the wall: a plain fill far out, then a cached layer round the arena (a little softer: it's scenery)
export function drawSurrounds(g, A, s) {
  const L = lookOf(A), B = arenaBox(A), M = 430;
  g.fillStyle = L.ground; g.fillRect(-8000, -8000, 16000, 16000);
  cached(g, `out|${A.id}|${s}|${lookGen()}|${bold()}`, B.x0 - M, B.y0 - M, B.x1 - B.x0 + M * 2, B.y1 - B.y0 + M * 2, s * 0.75, q => {
    const O = { x0: B.x0 - M, y0: B.y0 - M, x1: B.x1 + M, y1: B.y1 + M };
    q.fillStyle = L.ground; q.fillRect(O.x0, O.y0, O.x1 - O.x0, O.y1 - O.y0);
    (OUT[A.look] || OUT.court)(q, A, B, O, L);
    // fade the edges into the plain fill
    for (const [x0, y0, x1, y1, w] of [[O.x0, 0, O.x0 + 90, 0, 0], [O.x1, 0, O.x1 - 90, 0, 0], [0, O.y0, 0, O.y0 + 90, 1], [0, O.y1, 0, O.y1 - 90, 1]]) {
      const gr = q.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, L.ground); gr.addColorStop(1, rgba(L.ground, 0));
      q.fillStyle = gr; if (w) q.fillRect(O.x0, Math.min(y0, y1), O.x1 - O.x0, 90); else q.fillRect(Math.min(x0, x1), O.y0, 90, O.y1 - O.y0);
    }
  });
}
const blobShadow = aoBlob;
// a round broadleaf tree seen from above and a little in front: its soft shadow, a short trunk, a canopy of a few big
// soft masses, the whole crown shaded as one form (lit top left)
function tree(g, x, y, R) {
  const M = MATS.court, h = R * 1.25, cy = y - h;
  blobShadow(g, x + R * 0.5, y + R * 0.25, R * 1.15, R * 0.72, M.leaf.ao, 0.26);
  shadeCylinder(g, x, y, 4.5, 0, h - R * 0.5, M.bark, { top: false });
  const blobs = [[0.38, 0.16, 0.66], [-0.38, 0.2, 0.64], [0, 0.34, 0.62], [0, -0.16, 0.8]];
  g.save(); g.beginPath(); for (const [ox, oy, k] of blobs) { g.moveTo(x + ox * R + k * R, cy + oy * R); g.arc(x + ox * R, cy + oy * R, k * R, 0, TAU); }
  g.clip();
  const gr = g.createRadialGradient(x - R * 0.4, cy - R * 0.5, R * 0.1, x + R * 0.1, cy + R * 0.1, R * 1.35);
  gr.addColorStop(0, M.leaf.hi); gr.addColorStop(0.35, M.leaf.lit); gr.addColorStop(0.7, M.leaf.base); gr.addColorStop(1, M.leaf.deep);
  g.fillStyle = gr; g.fillRect(x - R * 1.2, cy - R * 1.2, R * 2.4, R * 2.4);
  for (const [ox, oy, k] of blobs) {   // each mass a touch rounder: a soft shade under its lower right
    const bx = x + ox * R, by = cy + oy * R, r = k * R, sg = g.createRadialGradient(bx - r * 0.35, by - r * 0.4, r * 0.4, bx, by, r);
    sg.addColorStop(0, `rgba(${M.leaf.ao},0)`); sg.addColorStop(1, `rgba(${M.leaf.ao},0.16)`);
    g.fillStyle = sg; g.beginPath(); g.arc(bx, by, r, 0, TAU); g.fill();
  }
  g.restore();
}
// a snowy pine: its shadow, three tiers, snow lying on each
function pine(g, x, y, s) {
  const M = MATS.rink;
  blobShadow(g, x + 14 * s, y + 6 * s, 34 * s, 16 * s, '90,120,160', 0.28);
  shadeCylinder(g, x, y, 3 * s, 0, 14 * s, M.bark, { top: false });
  for (let k = 0; k < 3; k++) {
    const by = y - (10 + k * 22) * s, w = (30 - k * 7) * s, ty = by - (38 - k * 4) * s;
    const gr = g.createLinearGradient(x - w, 0, x + w, 0); gr.addColorStop(0, M.leaf.lit); gr.addColorStop(0.45, M.leaf.base); gr.addColorStop(1, M.leaf.deep);
    g.fillStyle = gr; g.beginPath(); g.moveTo(x, ty); g.quadraticCurveTo(x + w * 0.4, by - (by - ty) * 0.4, x + w, by); g.quadraticCurveTo(x, by + 5 * s, x - w, by); g.quadraticCurveTo(x - w * 0.4, by - (by - ty) * 0.4, x, ty); g.fill();
    const sg = g.createLinearGradient(x - w, 0, x + w, 0); sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.6, '#eef4f8'); sg.addColorStop(1, '#c9d7e3');
    g.fillStyle = sg; g.beginPath(); g.moveTo(x, ty - 1); g.quadraticCurveTo(x + w * 0.35, by - (by - ty) * 0.55, x + w * 0.72, by - (by - ty) * 0.18);
    g.quadraticCurveTo(x + w * 0.3, by - (by - ty) * 0.3, x, by - (by - ty) * 0.22); g.quadraticCurveTo(x - w * 0.35, by - (by - ty) * 0.32, x - w * 0.78, by - (by - ty) * 0.16);
    g.quadraticCurveTo(x - w * 0.35, by - (by - ty) * 0.55, x, ty - 1); g.fill();
  }
}
const OUT = {
  // a lawn with faint mowing stripes, a gravel apron round the court, four trees
  court(g, A, B, O, L) {
    for (let y = O.y0, i = 0; y < O.y1; y += 46, i++) if (i % 2) { g.fillStyle = 'rgba(255,255,240,0.05)'; g.fillRect(O.x0, y, O.x1 - O.x0, 46); }
    patches(g, O.x0, O.y0, O.x1, O.y1, 30, ['#c4d4a3', '#8ea573', '#b7c993'], 0.3, 400, 50, 150);
    const b = A.bounds;
    g.fillStyle = '#cfc4ad'; shapePath(g, b, WALL + 30); g.fill();
    g.fillStyle = '#d9cfba'; shapePath(g, b, WALL + 27); g.fill();
    g.save(); shapePath(g, b, WALL + 27); g.clip(); grain(g, { x0: B.x0 - 60, y0: B.y0 - 60, x1: B.x1 + 60, y1: B.y1 + 60 }, 2600, 'rgba(255,255,255,0.4)', 'rgba(90,75,55,0.14)', 3000); g.restore();
    tree(g, B.x0 - 120, B.y0 + 30, 52); tree(g, B.x1 + 115, B.y0 - 70, 58); tree(g, B.x0 - 105, B.y1 - 10, 46); tree(g, B.x1 + 135, B.y1 + 140, 56); tree(g, B.x0 - 40, B.y0 - 200, 50);
  },
  // the hall's floor beyond the barrier: big plates by tone under soft lamp light, a row of racks standing back along
  // the far side, a few crates stacked by the near side
  hall(g, A, B, O, L) {
    const M = MATS.hall;
    for (let y = O.y0; y < O.y1; y += 96) for (let x = O.x0; x < O.x1; x += 96) { g.fillStyle = mix(L.ground, tone(L.ground, 0.08), hash(x * 0.37 + y * 0.11)); g.fillRect(x + 1, y + 1, 94, 94); }
    for (const x of [-0.6, 0, 0.6]) lightPool(g, x * (B.x1 - B.x0) * 0.55, 0, 360, '200,212,228', 0.07);
    // the racks: tall cabinets, their tops and fronts, a soft shade at their feet, a couple of status lights each
    const yb = B.y0 - WALL - 34, rh = 70, rd = 34, rw = 56;
    g.fillStyle = `rgba(${M.rack.ao},0.14)`; g.fillRect(O.x0, yb - 2, O.x1 - O.x0, 16);
    for (let x = O.x0 + 20, i = 0; x < O.x1 - 20; x += rw + 6, i++) {
      blobShadow(g, x + rw * 0.6, yb + 6, rw * 0.7, 10, M.rack.ao, 0.22);
      shadeBox(g, x, yb - rd, rw, rd, rh, M.rack, { r: 3, inset: 5 });
      for (let k = 0; k < 3; k++) {
        const h = hash(i * 31 + k * 7); if (h < 0.4) continue;
        const c = h > 0.9 ? '255,196,110' : h > 0.65 ? '140,230,175' : '140,195,255', lx = x + 12 + k * 6, ly = yb - rh + 14 + hash(i + k) * 30;
        lightPool(g, lx, ly, 6, c, 0.5); g.fillStyle = `rgba(${c},0.9)`; g.beginPath(); g.arc(lx, ly, 1.1, 0, TAU); g.fill();
      }
    }
    // crates stacked out on the near side
    for (const [cx, cy, n] of [[B.x0 + 60, B.y1 + WALL + 70, 2], [B.x1 - 140, B.y1 + WALL + 95, 1], [B.x1 - 92, B.y1 + WALL + 84, 1]]) {
      blobShadow(g, cx + 24, cy + 36, 34, 14, M.crate.ao, 0.24);
      for (let k = 0; k < n; k++) shadeBox(g, cx, cy - 30 * k, 38, 36, 30, M.crate, { r: 3, inset: 5 });
    }
  },
  // a snowfield: soft drifts in blue shade, snow banked against the outside of the wall, a few pines
  rink(g, A, B, O, L) {
    patches(g, O.x0, O.y0, O.x1, O.y1, 26, ['#c6d4e0', '#ffffff', '#d3dee8'], 0.45, 700, 50, 160);
    const b = A.bounds;
    for (const [e, a] of [[WALL + 22, 0.25], [WALL + 14, 0.4], [WALL + 7, 0.6]]) { g.fillStyle = `rgba(255,255,255,${a})`; shapePath(g, b, e); g.fill(); }
    g.save(); g.translate(5, 7); g.fillStyle = 'rgba(150,175,200,0.12)'; shapePath(g, b, WALL + 6); g.fill(); g.restore();
    grain(g, O, 1800, 'rgba(255,255,255,0.8)', 'rgba(120,150,180,0.1)', 5000);
    for (const [x, y, s] of [[B.x0 - 90, B.y0 + 10, 1.15], [B.x0 - 30, B.y0 - 70, 0.9], [B.x1 + 70, B.y0 + 40, 1.2], [B.x1 + 130, B.y0 - 30, 0.95], [B.x0 - 150, B.y1 - 20, 1.05], [B.x1 + 110, B.y1 + 60, 1.1], [B.x0 - 60, B.y1 + 150, 1]]) pine(g, x, y, s);
  },
};

// the arena's static layer: the wall's shadow outside, the floor (with the hazards' fixed parts and the solids' shadows),
// the wall's shadow inside, then the wall
function paintArena(g, A) {
  const b = A.bounds, W = wallOf(A), L = lookOf(A), B = arenaBox(A);
  wallShadowOut(g, b, W);
  g.save(); shapePath(g, b); g.clip();
  (FLOOR[A.look] || FLOOR.court)(g, A, B, L, W);
  for (const h of A.hazards) if (h.kind === 'ice') iceSheet(g, h); else if (h.kind === 'heat') ventFrame(g, h); else if (h.kind === 'belt') beltBed(g, h);
  for (const o of A.solids) solidShadow(g, o, W);
  wallShadowIn(g, b, W);
  g.restore();
  paintWall(g, b, W);
}
const FLOOR = {
  // worn sandstone flags, paler where feet wear them in the middle, a little grime in the corners
  court(g, A, B, L, W) {
    flags(g, B, L, 50, 46, 92, 11);
    patches(g, B.x0, B.y0, B.x1, B.y1, 16, ['#fff7e6', '#c9b28a', '#efe0c0'], 0.22, 60, 40, 110);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 200); gr.addColorStop(0, 'rgba(255,250,236,0.28)'); gr.addColorStop(1, 'rgba(255,250,236,0)'); g.fillStyle = gr; g.fillRect(-200, -200, 400, 400);
    for (const [x, y] of [[B.x0, B.y0], [B.x1, B.y0], [B.x0, B.y1], [B.x1, B.y1]]) { const cg = g.createRadialGradient(x, y, 0, x, y, 90); cg.addColorStop(0, 'rgba(110,90,60,0.12)'); cg.addColorStop(1, 'rgba(110,90,60,0)'); g.fillStyle = cg; g.fillRect(x - 90, y - 90, 180, 180); }
    grain(g, B, 1600, 'rgba(255,255,255,0.35)', 'rgba(90,70,45,0.08)', 1200);
    falloff(g, B, 0.22, 0.1, W.shadow);
  },
  // a pale floor of big plates under three soft lamp pools, a little darker toward the walls
  hall(g, A, B, L, W) {
    flags(g, { x0: B.x0, y0: B.y0 - 1, x1: B.x1, y1: B.y1 }, L, 64, 64, 64.01, 21);
    for (const x of [-0.33, 0, 0.33]) { const cx = x * (B.x1 - B.x0), R = 170, gr = g.createRadialGradient(cx, 0, 0, cx, 0, R); gr.addColorStop(0, 'rgba(255,252,244,0.26)'); gr.addColorStop(1, 'rgba(255,252,244,0)'); g.fillStyle = gr; g.fillRect(cx - R, -R, R * 2, R * 2); }
    const eg = g.createLinearGradient(0, B.y0, 0, B.y1); eg.addColorStop(0, 'rgba(30,40,55,0.1)'); eg.addColorStop(0.3, 'rgba(30,40,55,0)'); eg.addColorStop(0.7, 'rgba(30,40,55,0)'); eg.addColorStop(1, 'rgba(30,40,55,0.12)');
    g.fillStyle = eg; g.fillRect(B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0);
    grain(g, B, 700, 'rgba(255,255,255,0.25)', 'rgba(40,50,60,0.05)', 2200);
    falloff(g, B, 0.16, 0.1, W.shadow);
  },
  // frosted flags, rime, snow drifted against the foot of the wall, the ground darker and wet round the vents
  rink(g, A, B, L, W) {
    flags(g, B, L, 60, 50, 100, 31);
    patches(g, B.x0, B.y0, B.x1, B.y1, 14, ['#ffffff', '#c3d1dc'], 0.35, 90, 40, 120);
    for (const h of A.hazards) if (h.kind === 'heat') {
      for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, x = h.x + Math.cos(a) * h.r * 0.35, y = h.y + Math.sin(a) * h.r * 0.35, r = h.r + 10 + hash(i + 77) * 14, gr = g.createRadialGradient(x, y, h.r * 0.6, x, y, r); gr.addColorStop(0, 'rgba(110,125,140,0.2)'); gr.addColorStop(1, 'rgba(110,125,140,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    }
    grain(g, B, 2600, 'rgba(255,255,255,0.7)', 'rgba(110,140,170,0.07)', 3300);
    const R = rim(A.bounds);   // the drifts: deepest along the top left, where the wind left them
    g.strokeStyle = 'rgba(250,252,255,0.5)'; g.lineWidth = 10; shapePath(g, A.bounds, -2); g.stroke();
    for (let i = 0; i < R.length; i++) {
      const p = R[i], w = 0.6 + 0.4 * Math.max(0, litOf(p.nx, p.ny)), d = (5 + hash(i + 11) * 7) * w, r = (10 + hash(i + 23) * 10) * w;
      const x = p.x - p.nx * d, y = p.y - p.ny * d, gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(244,248,252,0.35)'); gr.addColorStop(1, 'rgba(225,235,244,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    falloff(g, B, 0.2, 0.08, W.shadow);
  },
};

// ---------------------------------------------------------------- the hazards
// the ice: a glassy sheet sunk a hair into the floor, a lip of snow round it, deep blue where it's thick, long soft
// reflections, skate scratches
function iceSheet(g, h) {
  const x = h.x || 0, y = h.y || 0, r = h.r || Math.max(h.w || 0, h.h || 0) / 2;
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 9; g.beginPath(); g.arc(x, y, r + 3, 0, TAU); g.stroke();
  for (let i = 0; i < 64; i++) {   // the snow lip
    const a = i / 64 * TAU + hash(i + 600) * 0.1, rr = 7 + hash(i + 620) * 4, px = x + Math.cos(a) * (r + 3), py = y + Math.sin(a) * (r + 3);
    const gr = g.createRadialGradient(px - rr * 0.3, py - rr * 0.3, 0, px, py, rr); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(240,246,250,0)');
    g.fillStyle = gr; g.fillRect(px - rr, py - rr, rr * 2, rr * 2);
  }
  g.save(); shapePath(g, h); g.clip();
  let gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r * 1.05);
  gr.addColorStop(0, '#f1fafe'); gr.addColorStop(0.55, '#cbe6f4'); gr.addColorStop(1, '#a2cbe2');
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  patches(g, x - r * 0.7, y - r * 0.7, x + r * 0.7, y + r * 0.7, 5, ['#7fb4d3', '#e8f6fd'], 0.22, 640, r * 0.2, r * 0.45);
  // long soft reflections across it
  g.save(); g.translate(x, y); g.rotate(-0.75);
  for (const [o, w, a] of [[-r * 0.42, r * 0.22, 0.5], [-r * 0.1, r * 0.08, 0.4], [r * 0.38, r * 0.12, 0.25]]) {
    const bg = g.createLinearGradient(0, o - w, 0, o + w); bg.addColorStop(0, 'rgba(255,255,255,0)'); bg.addColorStop(0.5, `rgba(255,255,255,${a})`); bg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = bg; g.fillRect(-r, o - w, r * 2, w * 2);
  }
  g.restore();
  g.lineCap = 'round';   // skate scratches: fine pale arcs, a few faint darker ones
  for (let i = 0; i < 22; i++) {
    const cx = x + (hash(i + 300) - 0.5) * r * 0.8, cy = y + (hash(i + 310) - 0.5) * r * 0.8, rr = r * (0.25 + hash(i + 320) * 0.7), a = hash(i + 330) * TAU;
    g.strokeStyle = i % 4 ? 'rgba(255,255,255,0.45)' : 'rgba(70,110,140,0.12)'; g.lineWidth = i % 3 ? 0.7 : 1.1;
    g.beginPath(); g.arc(cx, cy, rr, a, a + 0.4 + hash(i + 340) * 0.9); g.stroke();
  }
  // sunk a hair: the edge shaded along its top left, catching light along its bottom right
  g.strokeStyle = 'rgba(40,80,115,0.2)'; g.lineWidth = 6; g.beginPath(); g.arc(x + 2.5, y + 3.2, r + 2, 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.beginPath(); g.arc(x - 1.4, y - 1.8, r + 0.6, 0, TAU); g.stroke();
  g.restore();
}
// a heat vent's fixed part: a soft shade round it, then a plain raised steel rim
function ventFrame(g, h) {
  const x = h.x || 0, y = h.y || 0, r = h.r, M = MATS.rink.grate;
  blobShadow(g, x + 3, y + 4, r + 9, r + 8, M.ao, 0.12);
  bevelRing(g, x, y, r - 3, r + 5, M);
  const ig = g.createRadialGradient(x, y, r - 3, x, y, r + 5); ig.addColorStop(0, `rgba(${M.ao},0.25)`); ig.addColorStop(0.35, `rgba(${M.ao},0)`); ig.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = ig; g.beginPath(); g.arc(x, y, r + 5, 0, TAU); g.fill();
}
// a belt in its own frame: x along its travel (the way it carries), y across
function beltFrame(g, h) {
  const along = Math.abs(h.vx || 0) >= Math.abs(h.vy || 0), dir = Math.sign((along ? h.vx : h.vy) || 1);
  g.translate(h.x || 0, h.y || 0);
  if (along) g.scale(dir, 1); else g.rotate(dir * Math.PI / 2);
  return { L: along ? h.w : h.h, Wd: along ? h.h : h.w };
}
// a belt's bed (in the floor layer): a clean darker band sunk a hair into the floor, softly rounded across (lighter
// down its middle), shaded under its far lip, catching the light along its near one
function beltBed(g, h) {
  const M = MATS.hall.belt, x0 = (h.x || 0) - h.w / 2, y0 = (h.y || 0) - h.h / 2, w = h.w, d = h.h, r = Math.min(10, d / 3);
  g.save(); g.beginPath(); g.roundRect(x0, y0, w, d, r); g.clip();
  const across = Math.abs(h.vx || 0) >= Math.abs(h.vy || 0);
  g.fillStyle = across ? (() => { const gr = g.createLinearGradient(0, y0, 0, y0 + d); gr.addColorStop(0, M.deep); gr.addColorStop(0.45, M.base); gr.addColorStop(1, M.dark); return gr; })() : drumGradient(g, x0, x0 + w, M);
  g.fillRect(x0, y0, w, d);
  g.restore();
}
// the moving part of a belt: soft lighter chevrons pointing and gliding the way it carries (a cached strip, slid
// along), fading into the rollers at both ends; then the shading over it (in the world frame, so the light stays top left)
const MARK = 40;
function beltLive(g, A, h, t, s) {
  const sp = Math.hypot(h.vx || 0, h.vy || 0), M = MATS.hall.belt;
  g.save(); const { L, Wd } = beltFrame(g, h), x0 = -L / 2, y0 = -Wd / 2;
  g.beginPath(); g.roundRect(x0, y0, L, Wd, Math.min(10, Wd / 3)); g.clip();
  const off = ((t * sp) % MARK + MARK) % MARK;
  cached(g, `belt2|${L}|${Wd}|${s}|${lookGen()}`, 0, 0, L + MARK * 2, Wd, s, q => {
    q.lineCap = 'round'; q.lineJoin = 'round';
    for (let x = MARK / 2; x < L + MARK * 2; x += MARK) {
      const path = () => { q.beginPath(); q.moveTo(x - 6, Wd * 0.24); q.lineTo(x + 5, Wd / 2); q.lineTo(x - 6, Wd * 0.76); };
      q.strokeStyle = rgba(M.hi, 0.1); q.lineWidth = 9; path(); q.stroke();
      q.strokeStyle = rgba(M.hi, 0.32); q.lineWidth = 4.5; path(); q.stroke();
    }
  }, x0 - MARK * 2 + off, y0);
  for (const [a, b] of [[x0, x0 + 46], [x0 + L, x0 + L - 46]]) {   // into the rollers at each end
    const fg = g.createLinearGradient(a, 0, b, 0); fg.addColorStop(0, rgba(M.deep, 0.95)); fg.addColorStop(0.35, rgba(M.dark, 0.5)); fg.addColorStop(1, rgba(M.dark, 0));
    g.fillStyle = fg; g.fillRect(Math.min(a, b), y0, 46, Wd);
  }
  g.restore();
  const B = { x0: (h.x || 0) - h.w / 2, y0: (h.y || 0) - h.h / 2 };
  g.save(); g.beginPath(); g.rect(B.x0, B.y0, h.w, h.h); g.clip();
  const sg = g.createLinearGradient(0, B.y0, 0, B.y0 + 10); sg.addColorStop(0, `rgba(${M.ao},0.45)`); sg.addColorStop(1, `rgba(${M.ao},0)`);
  g.fillStyle = sg; g.fillRect(B.x0, B.y0, h.w, 10);   // under its far lip
  const lg = g.createLinearGradient(0, B.y0 + h.h - 3, 0, B.y0 + h.h); lg.addColorStop(0, rgba(M.hi, 0)); lg.addColorStop(1, rgba(M.hi, 0.35));
  g.fillStyle = lg; g.fillRect(B.x0, B.y0 + h.h - 3, h.w, 3);   // its near lip catching the light
  const W = wallOf(A);
  for (const o of A.solids) solidShadow(g, o, W);
  g.restore();
}
// a vent's grate, live: the dark well under the bars glowing up as it warns, white-hot as it burns; the bars catch the glow
function ventLive(g, h, F, t) {
  const st = heatState(h, F.rt || 0), x = h.x || 0, y = h.y || 0, r = h.r - 3;
  const glow = st === 2 ? 1 : st * (0.6 + 0.4 * Math.sin(t * 13 + x) ** 2);
  // the light it throws on the rim and the floor round it (added light, no edge), flickering a little while it burns
  if (glow > 0.01) lightPool(g, x, y + 3, r * (st === 2 ? 2.9 + 0.12 * Math.sin(t * 23) : 2 + glow * 0.8), st === 2 ? '255,150,70' : '255,120,50', (st === 2 ? 0.5 : 0.7) * glow);
  g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
  g.fillStyle = '#1d1a19'; g.fillRect(x - r, y - r, r * 2, r * 2);
  if (glow > 0.01) {
    const gr = g.createRadialGradient(x, y + 2, 0, x, y, r);
    if (st === 2) { gr.addColorStop(0, 'rgba(255,250,215,1)'); gr.addColorStop(0.35, 'rgba(255,196,90,0.95)'); gr.addColorStop(0.8, 'rgba(240,96,30,0.8)'); gr.addColorStop(1, 'rgba(150,40,15,0.6)'); }
    else { gr.addColorStop(0, `rgba(255,190,95,${0.95 * glow})`); gr.addColorStop(0.6, `rgba(240,100,35,${0.75 * glow})`); gr.addColorStop(1, `rgba(120,30,10,${0.3 * glow})`); }
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // the heating coil down in the well
  g.strokeStyle = glow > 0.01 ? mix('#3a2a24', st === 2 ? '#fff1c4' : '#ffae5a', Math.min(1, glow)) : '#2f2a28'; g.lineWidth = 2; g.lineJoin = 'round';
  g.beginPath(); for (let k = 0; k <= 12; k++) { const u = k / 12, px = x - r * 0.75 + u * r * 1.5, py = y + (k % 2 ? 6 : -6) * Math.sqrt(Math.max(0, 1 - (u * 2 - 1) ** 2)); k ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke();
  // the bars
  const n = 9, gap = r * 2 / n, bc = mix('#4b5157', '#ff9a4f', glow * (st === 2 ? 0.75 : 0.45));
  for (let k = 0; k < n; k++) {
    const by = y - r + gap * (k + 0.5), hw = Math.sqrt(Math.max(0, r * r - (by - y) ** 2));
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x - hw, by - 0.6, hw * 2, 3.4);
    g.fillStyle = bc; g.fillRect(x - hw, by - 1.6, hw * 2, 3);
    g.fillStyle = st === 2 ? 'rgba(255,240,200,0.7)' : 'rgba(255,255,255,0.35)'; g.fillRect(x - hw, by - 1.6, hw * 2, 0.9);
  }
  g.restore();
}
// over the fighters: what rises off a vent. Warning: heat shimmer and wisps of steam, building; burning: a roaring
// column of heat (soft tongues, shimmer, sparks) with steam billowing off its top; just after: the steam thinning out
function ventRise(g, h, F, t) {
  const rt = F.rt || 0, st = heatState(h, rt), x = h.x || 0, y = h.y || 0, r = h.r;
  const p = ((rt - (h.at || 0)) % h.period + h.period) % h.period, after = rt >= (h.at || 0) && st !== 2 && p >= h.on && p < h.on + 1.4 ? 1 - (p - h.on) / 1.4 : 0;
  const steam = st === 2 ? 1 : Math.max(st, after);
  if (steam <= 0.01) return;
  g.save(); g.lineCap = 'round';
  // the shimmer: thin wavering threads of bright air
  const nh = st === 2 ? 6 : 4, hgt = st === 2 ? 95 : 55;
  for (let k = 0; k < nh; k++) {
    const bx = x + (k / (nh - 1) - 0.5) * r * 1.3, a = (st === 2 ? 0.2 : 0.12) * steam;
    g.strokeStyle = `rgba(255,244,228,${a.toFixed(3)})`; g.lineWidth = 2.2; g.beginPath();
    for (let j = 0; j <= 10; j++) { const u = j / 10, yy = y - 4 - u * hgt, xx = bx + Math.sin(yy * 0.22 + t * 10 + k * 1.9) * (1.5 + u * 3.5); j ? g.lineTo(xx, yy) : g.moveTo(xx, yy); }
    g.stroke();
  }
  if (st === 2) {   // the heat column: soft flickering tongues, added light
    g.globalCompositeOperation = 'lighter';
    const cg = g.createRadialGradient(x, y - 18, 4, x, y - 18, r * 1.3); cg.addColorStop(0, 'rgba(255,190,110,0.32)'); cg.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = cg; g.beginPath(); g.ellipse(x, y - 18, r * 1.2, r * 1.4, 0, 0, TAU); g.fill();
    for (let k = 0; k < 7; k++) {
      const bx = x + (k / 6 - 0.5) * r * 1.4, w = r * 0.28, th = 34 + 26 * (0.5 + 0.5 * Math.sin(t * 9 + k * 2.3)) * (1 - Math.abs(k / 6 - 0.5)), sw = Math.sin(t * 6 + k) * 6;
      const tg = g.createLinearGradient(0, y, 0, y - th); tg.addColorStop(0, 'rgba(255,225,150,0.5)'); tg.addColorStop(0.5, 'rgba(255,150,60,0.25)'); tg.addColorStop(1, 'rgba(255,110,40,0)');
      g.fillStyle = tg; g.beginPath(); g.moveTo(bx - w, y); g.quadraticCurveTo(bx - w * 0.5 + sw * 0.5, y - th * 0.5, bx + sw, y - th); g.quadraticCurveTo(bx + w * 0.5 + sw * 0.5, y - th * 0.5, bx + w, y); g.closePath(); g.fill();
    }
    for (let k = 0; k < 10; k++) {   // sparks rising
      const ph = (t * 1.3 + hash(k + 50)) % 1, sx = x + (hash(k + 60) - 0.5) * r * 1.4 + Math.sin(t * 4 + k) * 4 * ph, sy = y - 6 - ph * 90;
      g.fillStyle = `rgba(255,${200 + Math.round(40 * (1 - ph))},140,${(0.9 * (1 - ph)).toFixed(3)})`; g.fillRect(sx - 0.9, sy - 0.9, 1.8, 1.8);
    }
    g.globalCompositeOperation = 'source-over';
  }
  // steam: soft white wisps rising and spreading (billows off the top while it burns)
  const n = st === 2 ? 9 : Math.round(3 + 5 * steam), top = st === 2 ? 70 : 48;
  for (let k = 0; k < n; k++) {
    const ph = (t * (st === 2 ? 0.9 : 0.5) + hash(k + 80)) % 1, side = hash(k + 90) - 0.5;
    const px = x + side * r * 1.5 + Math.sin(t * 1.6 + k) * 6 * ph + side * 30 * ph * (st === 2 ? 1 : 0.4), py = y - 6 - (st === 2 ? 30 : 0) - ph * top, rr = 6 + ph * (st === 2 ? 20 : 13);
    steamPuff(g, px, py, rr, (st === 2 ? 0.55 : 0.5) * steam * Math.sin(ph * Math.PI));
  }
  g.restore();
}
// a puff of steam: white toward the light, a cool grey on its shaded side (so it reads on snow too)
function steamPuff(g, x, y, r, a) {
  if (a <= 0.005) return;
  const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.35, 0, x, y, r);
  gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.5, `rgba(226,232,238,${a * 0.75})`); gr.addColorStop(1, 'rgba(180,192,204,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
// the floor hazards, live
function drawHazards(g, A, F, t, s) {
  const BD = bold();
  for (const h of A.hazards) {
    if (h.kind === 'ice') iceLive(g, h, t);
    else if (h.kind === 'heat') ventLive(g, h, F, t);
    else if (h.kind === 'belt') beltLive(g, A, h, t, s);
    else if (h.kind === 'pad') {
      const x = h.x || 0, y = h.y || 0, r = h.r || 24;
      g.save();
      g.fillStyle = BD ? BK.yellow : '#ffcf4a'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.arc(x + 1.5, y + 2, r * 0.7, 0, TAU); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(x, y - r * 0.5); g.lineTo(x + r * 0.35, y); g.lineTo(x - r * 0.35, y); g.closePath(); g.fill();
      g.restore();
    }
  }
}
// the ice, live: a slow sheen gliding across it now and then, and a few glints twinkling
function iceLive(g, h, t) {
  const x = h.x || 0, y = h.y || 0, r = h.r || Math.max(h.w || 0, h.h || 0) / 2;
  g.save(); shapePath(g, h); g.clip();
  const u = (t / 5.5) % 1;
  if (u < 0.45) {
    const k = u / 0.45, o = (k * 2 - 1) * r * 1.5, w = r * 0.35;
    g.translate(x, y); g.rotate(-0.75);
    const bg = g.createLinearGradient(o - w, 0, o + w, 0); bg.addColorStop(0, 'rgba(255,255,255,0)'); bg.addColorStop(0.5, `rgba(255,255,255,${(0.35 * Math.sin(k * Math.PI)).toFixed(3)})`); bg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = bg; g.fillRect(o - w, -r * 1.2, w * 2, r * 2.4);
  }
  g.restore();
  g.save(); g.strokeStyle = '#ffffff'; g.lineCap = 'round';
  for (let k = 0; k < 5; k++) {
    const a = Math.max(0, Math.sin(t * 1.7 + k * 2.1)) ** 10; if (a < 0.03) continue;
    const gx = x + (hash(k + 500) - 0.5) * r * 1.3, gy = y + (hash(k + 510) - 0.5) * r * 1.3, l = 2 + a * 3.5;
    g.globalAlpha = a; g.lineWidth = 1; g.beginPath(); g.moveTo(gx - l, gy); g.lineTo(gx + l, gy); g.moveTo(gx, gy - l); g.lineTo(gx, gy + l); g.stroke();
  }
  g.restore();
}

// ---------------------------------------------------------------- the solids (drawn among the fighters, by y)
// their shadows (in the floor layer): long and soft, down and right
function solidShadow(g, o, W) {
  const H = o.tall || 40, dx = H * SHX * 0.8, dy = H * SHY * 0.8;
  if (o.shape === 'circle') {
    g.lineCap = 'round';
    for (const [k, a] of [[1.25, 0.05], [1.05, 0.07], [0.85, 0.07]]) { g.strokeStyle = `rgba(${W.shadow},${a})`; g.lineWidth = o.r * 2 * k; g.beginPath(); g.moveTo(o.x, o.y); g.lineTo(o.x + dx, o.y + dy); g.stroke(); }
  } else {
    for (const [e, a] of [[3, 0.05], [1, 0.07], [-1, 0.08]]) {
      const x0 = o.x - o.w / 2 - e, y0 = o.y - o.h / 2 - e, x1 = o.x + o.w / 2 + e, y1 = o.y + o.h / 2 + e;
      g.fillStyle = `rgba(${W.shadow},${a})`; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y0); g.lineTo(x1 + dx, y0 + dy); g.lineTo(x1 + dx, y1 + dy); g.lineTo(x0 + dx, y1 + dy); g.lineTo(x0, y1); g.closePath(); g.fill();
    }
  }
}
// a column standing at 0, 0, in the court's stone: a square plinth, a round base, a plain shaft tapering a touch, a
// round cap and a square slab on top; each part a simple solid shaded from the top left, soft shade where they meet
function paintPillar(g, r, H) {
  const M = MATS.court.pillar, ry = 0.5, o = { ry };
  blobShadow(g, 2, 2, r * 1.55, r * 0.85, M.ao, 0.26);   // contact shade
  shadeCylinder(g, 0, 0, r * 1.16, 0, 7, M, o);           // the plinth
  shadeCylinder(g, 0, 0, r * 0.98, 7, 11, M, o);          // the base
  shadeCylinder(g, 0, 0, r * 0.84, 11, H - 13, M, { ry, topR: r * 0.79, top: false });   // the shaft, tapering a touch
  const sg = g.createLinearGradient(0, -11 - 16, 0, -11 + r * 0.42); sg.addColorStop(0, `rgba(${M.ao},0)`); sg.addColorStop(1, `rgba(${M.ao},0.14)`);
  g.fillStyle = sg; g.beginPath(); g.ellipse(0, -11, r * 0.84, r * 0.42, 0, 0, Math.PI); g.lineTo(-r * 0.84, -11 - 16); g.lineTo(r * 0.84, -11 - 16); g.fill();   // its foot, shaded by the base
  shadeCylinder(g, 0, 0, r * 0.95, H - 13, H - 8, M, o);   // the capital
  shadeCylinder(g, 0, 0, r * 1.12, H - 8, H, M, o);        // the slab on top
}
// a shipping crate (footprint w by h, tall H) centred at 0, 0: a simple wooden box, its lid and front each a soft
// recessed panel
function paintCrate(g, w, h, H, v) {
  const M = wood(mix(MATS.hall.crate.base, ['#b98d5d', '#cfa774', '#c39662'][v % 3], 0.5));
  blobShadow(g, 1.5, h / 2 - 1, w * 0.62, 5, M.ao, 0.3);   // contact shade
  shadeBox(g, -w / 2, -h / 2, w, h, H, M, { r: 3, inset: 5 });
}
export function drawSolid(g, o) {
  const m = g.getTransform(), s = zstep(Math.hypot(m.a, m.b)), BD = bold(), H = o.tall || 40;
  if (o.shape === 'circle') {
    const r = o.r;
    cached(g, `pillar|${r}|${H}|${s}|${lookGen()}|${BD}`, -r * 1.7, -H - r * 1.35, r * 3.4, H + r * 3, s, q => paintPillar(q, r, H), o.x, o.y);
  } else {
    const v = Math.floor(hash(o.x * 0.13 + o.y * 0.71) * 3);
    cached(g, `crate|${o.w}|${o.h}|${H}|${v}|${s}|${lookGen()}|${BD}`, -o.w / 2 - 6, -o.h / 2 - H - 2, o.w + 14, o.h + H + 8, s, q => paintCrate(q, o.w, o.h, H, v), o.x, o.y);
  }
}

// ---------------------------------------------------------------- the map cards
// a top-down thumbnail of an arena (the setup screen's map cards), in the maps' own materials: its ground, the wall
// with its shadow, top and front face, the floor in its look lit from the top left, the hazards and solids as small
// shaded shapes, the two spawns
export function drawArenaThumb(g, A, w, h, cols = ['#ff5a6e', '#4aa8ff']) {
  const B = arenaBox(A), m = WALL + 4, k = Math.min(w / (B.x1 - B.x0 + m * 2), h / (B.y1 - B.y0 + m * 2)), L = lookOf(A), W = wallOf(A), b = A.bounds;
  const sh = `rgba(${W.shadow},`;
  g.save();
  g.beginPath(); g.roundRect(0, 0, w, h, 6); g.clip();
  if (A.look === 'sky') { const P = pal(), sg = g.createLinearGradient(0, 0, 0, h); sg.addColorStop(0, P.sky[0]); sg.addColorStop(0.6, P.sky[1]); sg.addColorStop(1, P.sky[2]); g.fillStyle = sg; }
  else g.fillStyle = L.ground;
  g.fillRect(0, 0, w, h);
  const lg0 = g.createRadialGradient(w * 0.1, -h * 0.1, 0, w * 0.1, -h * 0.1, w); lg0.addColorStop(0, 'rgba(255,250,236,0.3)'); lg0.addColorStop(1, 'rgba(255,250,236,0)');
  g.fillStyle = lg0; g.fillRect(0, 0, w, h);
  g.translate(w / 2, h / 2); g.scale(k, k); g.translate(-(B.x0 + B.x1) / 2, -(B.y0 + B.y1) / 2);
  if (A.look === 'court') { g.fillStyle = '#d9cfba'; shapePath(g, b, WALL + 27); g.fill(); }
  if (A.look === 'rink') { g.fillStyle = 'rgba(255,255,255,0.7)'; shapePath(g, b, WALL + 14); g.fill(); }
  if (A.look === 'sky') {   // the slab's rock face under it, then its ledge
    const P = pal(), R = slabR(A);
    const rg = g.createLinearGradient(-R, 0, R, 0); rg.addColorStop(0, P.sideLit); rg.addColorStop(0.5, P.side); rg.addColorStop(1, P.sideDark);
    g.fillStyle = rg; g.beginPath(); g.ellipse(0, RIM, R, R, 0, 0, Math.PI); g.lineTo(-R, 0); g.arc(0, 0, R, Math.PI, 0); g.fill();
    g.fillStyle = P.top; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
  }
  // the wall: its soft shadow, its front face (thickness), its top lit from the top left
  for (const [t, a] of [[0.6, 0.12], [1.1, 0.1]]) { g.save(); g.translate(WALL_H * SHX * t, WALL_H * SHY * t); g.fillStyle = sh + a + ')'; shapePath(g, b, WALL); g.fill(); g.restore(); }
  g.fillStyle = W.faceDark; g.save(); g.translate(0, 6); shapePath(g, b, WALL); g.fill(); g.restore();
  const cg = g.createLinearGradient(B.x0, B.y0, B.x1, B.y1); cg.addColorStop(0, W.cap); cg.addColorStop(1, mix(W.cap, W.face, 0.6));
  g.fillStyle = cg; shapePath(g, b, WALL); g.fill();
  g.save(); shapePath(g, b); g.clip();
  g.fillStyle = L.floor; g.fillRect(B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0);
  if (L.stone) for (let y = B.y0, j = 0; y < B.y1; y += 60, j++) for (let x = B.x0 - (j % 2) * 40, i = 0; x < B.x1; x += 80, i++) { g.fillStyle = rgba(L.stone[(i + j * 3) % 4], 0.4); g.fillRect(x + 2, y + 2, 76, 56); }
  for (const z of A.hazards) {
    const x = z.x || 0, y = z.y || 0;
    if (z.kind === 'ice') { const gr = g.createRadialGradient(x - z.r * 0.3, y - z.r * 0.35, 0, x, y, z.r); gr.addColorStop(0, '#f2fbff'); gr.addColorStop(1, '#a6cee4'); g.fillStyle = gr; shapePath(g, z); g.fill(); }
    else if (z.kind === 'heat') {
      const M = MATS.rink.grate;
      lightPool(g, x, y, z.r * 2.2, '255,140,60', 0.22);
      bevelRing(g, x, y, z.r - 4, z.r + 6, M, false, 24);
      const gr = g.createRadialGradient(x, y + 4, 0, x, y, z.r - 4); gr.addColorStop(0, '#d4733a'); gr.addColorStop(0.6, '#6e3424'); gr.addColorStop(1, '#2a221f'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, z.r - 4, 0, TAU); g.fill();
      g.fillStyle = rgba(M.dark, 0.9); for (let i = -3; i <= 3; i++) { const yy = y + i * z.r / 4, hw = Math.sqrt(Math.max(0, (z.r - 4) ** 2 - (yy - y) ** 2)); g.fillRect(x - hw, yy - 3, hw * 2, 6); }
    } else if (z.kind === 'belt') {
      const M = MATS.hall.belt, x0 = x - z.w / 2, y0 = y - z.h / 2, dir = Math.sign(z.vx || 1);
      const gr = g.createLinearGradient(0, y0, 0, y0 + z.h); gr.addColorStop(0, M.deep); gr.addColorStop(0.45, M.base); gr.addColorStop(1, M.dark);
      g.fillStyle = gr; g.beginPath(); g.roundRect(x0, y0, z.w, z.h, 10); g.fill();
      g.strokeStyle = rgba(M.hi, 0.45); g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
      for (let cx = x0 + 50; cx < x0 + z.w - 30; cx += 70) { g.beginPath(); g.moveTo(cx - 8 * dir, y0 + 10); g.lineTo(cx + 7 * dir, y); g.lineTo(cx - 8 * dir, y0 + z.h - 10); g.stroke(); }
    } else if (z.kind === 'pad') { g.fillStyle = '#ffcf4a'; shapePath(g, z); g.fill(); }
  }
  for (const o of A.solids) { g.save(); g.translate(12, 16); g.fillStyle = sh + '0.22)'; shapePath(g, o); g.fill(); g.restore(); }
  falloff(g, B, 0.2, 0.1, W.shadow);
  g.restore();
  for (const o of A.solids) {
    if (o.kind === 'crate') shadeBox(g, o.x - o.w / 2, o.y - o.h / 2 + 8, o.w, o.h, 16, MATS.hall.crate, { r: 4 });
    else { const M = MATS.court.pillar; blobShadow(g, o.x + 8, o.y + 14, o.r * 1.6, o.r, M.ao, 0.3); shadeCylinder(g, o.x, o.y + 10, o.r, 0, 44, M, { ry: 0.5 }); }
  }
  A.spawns.forEach(([x, y], i) => { g.fillStyle = cols[i]; g.beginPath(); g.arc(x, y, 9 / Math.max(0.3, k) * 0.5 + 6, 0, TAU); g.fill(); });
  g.restore();
}
