// Kernel Kart art: Merge Bay (theme deco 'water'): a seaside town on a bay. Its forks too (the only plain forks).
// Lit from the top left like everything else (shadows fall down and to the right).
import { TAU, clamp, mulberry } from '../core.js';
import { distField } from './track.js';
import { cow, sheep, wander } from './fauna.js';
import { projectToTrack, trackSample } from '../geometry.js';
import { clearingsOf, findClearings, palm } from './props.js';
import { alpha, circ, ell, linear, poly, radial, shade, smooth } from './paint.js';

const FONT = '"Fredoka", "Trebuchet MS", system-ui, sans-serif';

// ------------------------------------------------------------------------------------------------ the forks
// A plain fork (race.js checkForks): at the commit point you take whichever road's middle you're nearer. So the
// approach is painted as two lanes split at that halfway line: the sharp road's (inside: lift and you tuck into it)
// in gold, the sweep's in white, each with arrows and a pictogram of where it goes. Hatching and fenders fill the gore;
// signs past its nose and on the inside verge on the way in name each road.
export const FORK_GOLD = '#ffc93c', FORK_WHITE = '#f4f7fb';
const SIGN_BLUE = '#1d4f86';
export function forkArt(g, T, alt, fs, k) {
  const hw = T.halfW, side = fs.side, sA = fs.s - 560;
  const names = [T.routeName, alt.routeName].map(n => (n.split(' & ')[k] || n).toUpperCase());   // the routes' names: 'sweep & pocket' -> SWEEP, POCKET
  const kinds = ['sweep', names[1] === 'POCKET' ? 'pocket' : 'chicane'];
  let q = null;
  const apart = s => { const p = trackSample(T, s); q = projectToTrack(alt, p.x, p.y, q ? q.s : fs.sAlt - (fs.sLock - s), 90); const a = trackSample(alt, q.s); return { o: Math.hypot(a.x - p.x, a.y - p.y), sa: q.s }; };
  const at = (R, s, lat) => { const p = trackSample(R, s); return [p.x + p.nx * lat, p.y + p.ny * lat]; };
  // where the roads' edges part (the gore's nose) and where there's room for a sign between them
  let sNose = fs.sLock, sNoseAlt = fs.sAlt, sSign = null, signGap = 0;
  q = null; const oTip = apart(fs.sLock).o;
  for (let s = fs.sLock; s < fs.sLock + 900; s += 4) { const a = apart(s); if (a.o < 2 * hw + 4) { sNose = s; sNoseAlt = a.sa; } else if (a.o - 2 * hw > 150) { sSign = s; signGap = a.o; break; } }
  const fade = s => clamp((s - sA) / 160, 0, 1);
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  // the two lanes split at the halfway between the roads' middles; the sharp road's (inside) washed gold
  q = null; const div = [], inner = [];
  for (let s = sA; s <= fs.sLock; s += 6) { const h = side * apart(s).o / 2; div.push(at(T, s, h)); inner.push(at(T, s, side * (hw - 3))); }
  { const P = new Path2D(); [...div, ...inner.reverse()].forEach(([x, y], i) => i ? P.lineTo(x, y) : P.moveTo(x, y)); P.closePath();
    const [x0, y0] = div[0], [x1, y1] = div[div.length - 1];
    g.fillStyle = (() => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, alpha(FORK_GOLD, 0)); gr.addColorStop(0.3, alpha(FORK_GOLD, 0.13)); gr.addColorStop(1, alpha(FORK_GOLD, 0.2)); return gr; })();
    g.fill(P); }
  { const P = new Path2D(); div.forEach(([x, y], i) => i ? P.lineTo(x, y) : P.moveTo(x, y));
    g.strokeStyle = 'rgba(20,20,26,0.25)'; g.lineWidth = 6.5; g.setLineDash([26, 16]); g.stroke(P);
    g.strokeStyle = alpha(FORK_GOLD, 0.95); g.lineWidth = 4; g.stroke(P); g.setLineDash([]); }
  // the gore: a V from the tip to the nose, hatched in white and edged
  q = null; const L = [], Rr = [];
  for (let s = fs.sLock; s <= sNose; s += 6) { const { o } = apart(s), w = 0.4 * hw * clamp((o - oTip) / Math.max(1, 2 * hw - oTip), 0, 1); L.push(at(T, s, side * (o / 2 - w))); Rr.push(at(T, s, side * (o / 2 + w))); }
  if (L.length > 2) {
    const V = new Path2D(); [...L, ...Rr.slice().reverse()].forEach(([x, y], i) => i ? V.lineTo(x, y) : V.moveTo(x, y)); V.closePath();
    g.save(); g.clip(V); const d0 = Math.hypot(L[L.length - 1][0] - L[0][0], L[L.length - 1][1] - L[0][1]) + hw * 2;
    g.strokeStyle = 'rgba(250,250,245,0.85)'; g.lineWidth = 7;
    for (let k2 = -2 * d0; k2 < 2 * d0; k2 += 21) { g.beginPath(); g.moveTo(L[0][0] + k2 - d0, L[0][1] - d0); g.lineTo(L[0][0] + k2 + d0, L[0][1] + d0); g.stroke(); }
    g.restore(); g.strokeStyle = alpha(FORK_GOLD, 0.95); g.lineWidth = 3.5; g.stroke(V);
  }
  // the arrow trains: each lane's arrows follow its own road, easing from its lane onto that road's middle
  const glyphAt = fs.s - 330;
  const ease = s => clamp((s - (fs.s - 200)) / Math.max(1, sNose - (fs.s - 200)), 0, 1);
  const train = (R, sEnd, sgn, col, s2alt) => {
    const pts = []; for (let s = sA + 40; s <= sEnd + 220; s += 8) { const sR = s2alt(s); pts.push([at(R, sR, sgn * hw * 0.45 * (1 - ease(s))), s]); }
    for (let i = 4; i < pts.length - 4; i += 14) {
      const [[x, y], s] = pts[i]; if (Math.abs(s - glyphAt) < 75) continue;   // (room for the pictogram)
      const a = Math.atan2(pts[i + 3][0][1] - pts[i - 3][0][1], pts[i + 3][0][0] - pts[i - 3][0][0]);
      g.save(); g.translate(x, y); g.rotate(a); g.globalAlpha = fade(s);
      poly(g, [[-20, -4.5], [3, -4.5], [3, -12], [21, 0], [3, 12], [3, 4.5], [-20, 4.5]]);
      g.save(); g.translate(1.5, 2); g.fillStyle = 'rgba(20,16,22,0.3)'; g.fill(); g.restore();
      g.fillStyle = alpha(col, 0.92); g.fill(); g.restore();
    }
  };
  train(T, sNose, -side, FORK_WHITE, s => s);
  train(alt, sNoseAlt, side, FORK_GOLD, s => fs.sAlt + (s - fs.sLock));
  // a pictogram painted in each lane, upright on screen: where that road goes
  const glyph = (sgn, kind, col) => {
    const p = trackSample(T, glyphAt); g.save(); g.translate(p.x + p.nx * sgn * hw * 0.45, p.y + p.ny * sgn * hw * 0.45);
    // turned so the arrow points the way you're driving (on screen), mirrored for a right-hand fork
    g.rotate(Math.atan2(p.ty, p.tx) + Math.PI / 2); if (side > 0) g.scale(-1, 1);
    g.lineWidth = 6.5; g.strokeStyle = alpha(col, 0.92); g.fillStyle = alpha(col, 0.92);
    const head = (x, y, a) => { g.save(); g.translate(x, y); g.rotate(a); poly(g, [[0, -9], [11, 5], [-11, 5]]); g.fill(); g.restore(); };
    g.beginPath();
    if (kind === 'sweep') { g.moveTo(6, 22); g.quadraticCurveTo(8, -6, -6, -18); g.stroke(); head(-8, -20, -0.9); }
    else if (kind === 'chicane') { g.moveTo(8, 24); g.lineTo(8, 10); g.lineTo(-8, 0); g.lineTo(8, -10); g.lineTo(-4, -18); g.stroke(); head(-6, -20, -0.8); }
    else { g.moveTo(10, 24); g.lineTo(10, -4); g.arc(-2, -4, 12, 0, Math.PI, true); g.lineTo(-14, 6); g.stroke(); head(-14, 10, Math.PI); }
    g.restore();
  };
  glyph(-side, kinds[0], FORK_WHITE); glyph(side, kinds[1], FORK_GOLD);
  // the fenders at the nose: a stack of fat orange harbour fenders on a frame
  { const nose = at(T, sNose, side * (hw + 4)), b = at(alt, sNoseAlt + 40, -side * (alt.halfW + 4)), a = Math.atan2(b[1] - nose[1], b[0] - nose[0]);
    for (let j = 0; j < 3; j++) { const x = nose[0] + Math.cos(a) * j * 16, y = nose[1] + Math.sin(a) * j * 16;
      circ(g, x + 2.5, y + 3.5, 8.4); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill(); circ(g, x, y, 8); g.fillStyle = j % 2 ? '#f4f1ea' : '#ff7a2f'; g.fill();
      circ(g, x - 2.4, y - 2.4, 3); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fill(); g.strokeStyle = '#2b2d33'; g.lineWidth = 1.5; circ(g, x, y, 8); g.stroke(); } }
  // the signs: past the nose, and on the inside verge on the way in (arrows as on a real sign: up is straight on)
  const dir = (R, s) => { const p = trackSample(R, s); return Math.atan2(p.ty, p.tx); }, a0 = dir(T, sA);
  const rel = a => { let d = a - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return -Math.PI / 2 + d; };
  const rows = [[names[0], rel(dir(T, sNose + 120)), FORK_WHITE], [names[1], rel(dir(alt, sNoseAlt + 120)), FORK_GOLD]];
  if (sSign !== null) { const [x, y] = at(T, sSign, side * signGap / 2); sign(g, x, y, rows); }
  { const [x, y] = at(T, fs.s - 480, side * (hw + 70)); sign(g, x, y, rows); }
  g.restore();
}
// a road sign on two posts, upright on screen: one row per road, an arrow the way it really goes and its name
function sign(g, x, y, rows) {
  g.font = `800 15px ${FONT}`; const tw = Math.max(...rows.map(([n]) => g.measureText(n).width));
  const w = tw + 52, h = 12 + rows.length * 22, x0 = x - w / 2, y0 = y - h - 14;
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.roundRect(x0 + 10, y0 + 13, w, h, 6); g.fill();
  g.fillStyle = '#5b616b'; g.fillRect(x - w * 0.3, y0 + h - 2, 4.5, 18); g.fillRect(x + w * 0.3 - 4.5, y0 + h - 2, 4.5, 18);
  g.fillStyle = SIGN_BLUE; g.beginPath(); g.roundRect(x0, y0, w, h, 6); g.fill();
  g.strokeStyle = '#f4f7fb'; g.lineWidth = 2; g.beginPath(); g.roundRect(x0 + 3, y0 + 3, w - 6, h - 6, 4); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x0 + 3, y0 + 3, w - 6, 5);
  rows.forEach(([name, a, col], i) => {
    const cy = y0 + 17 + i * 22;
    g.save(); g.translate(x0 + 18, cy); g.rotate(a); g.fillStyle = col;
    poly(g, [[-9, -2.6], [2, -2.6], [2, -7], [10, 0], [2, 7], [2, 2.6], [-9, 2.6]]); g.fill(); g.restore();
    g.fillStyle = col; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(name, x0 + 33, cy + 1);
  });
}

// ------------------------------------------------------------------------------------------------ the island and the bay
// The land is an island: inside the main road's loop and out to its own coastline, close in at coves (and wherever a
// wave rolls in, race-waves.js), out on headlands where there's room, never across another road and leaving open water
// between bits of road. Static in the track layer; what moves is from the clock (bayGlints, bayLife).
const COAST = 64, HEAD = 240;   // the waterline: at least this far outside the main road's outer edge, and up to HEAD further out on a headland
const bays = new WeakMap();
const inPoly = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const leftOf = (R, i, o) => [R.pts[i][0] - R.tan[i][1] * o, R.pts[i][1] + R.tan[i][0] * o];
const trace = P => { const p = new Path2D(); P.forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y)); p.closePath(); return p; };
const blob = P => { const p = new Path2D(), n = P.length, mid = i => [(P[i % n][0] + P[(i + 1) % n][0]) / 2, (P[i % n][1] + P[(i + 1) % n][1]) / 2]; p.moveTo(...mid(n - 1)); for (let i = 0; i < n; i++) p.quadraticCurveTo(P[i][0], P[i][1], ...mid(i)); p.closePath(); return p; };   // (a soft outline through the points)
export function bayOf(T) {
  if (bays.has(T)) return bays.get(T);
  const R = T, inside = inPoly(R.pts, ...leftOf(R, 0, 60)) ? 1 : -1;   // which side of the main road the loop's middle is (+1: its left)
  const B = T.bbox, dist = distField(T), rng = mulberry(R.N * 13 + 5), EVERY = 3, n = Math.ceil(R.N / EVERY);
  // how far past the beach the land wants to reach: a few slow swells round the lap (whole numbers of them, so it closes)
  const k1 = Math.max(2, Math.round(R.L / 1700)), k2 = Math.max(3, Math.round(R.L / 650)), k3 = Math.max(5, Math.round(R.L / 300)), f1 = rng() * TAU, f2 = rng() * TAU, f3 = rng() * TAU;
  const want = j => { const u = j / n * TAU; return HEAD * clamp(0.42 + 0.42 * Math.sin(u * k1 + f1) + 0.3 * Math.sin(u * k2 + f2) + 0.12 * Math.sin(u * k3 + f3), 0, 1); };
  // how far it may go: close in at a wave's beach, inside the picture, short of any road, with open water left between
  const waves = T.mech ? T.mech.waves : [], cyc = d => Math.abs(((d % R.L) + R.L * 1.5) % R.L - R.L / 2);
  const capAt = j => {
    const i = Math.min(R.N - 1, j * EVERY), s = i / R.N * R.L, base = R.hw[i] + COAST;
    let cap = HEAD; for (const w of waves) cap = Math.min(cap, clamp((cyc(s - w.s) - w.len / 2 - 120) / 300, 0, 1) * HEAD);
    for (let e = cap; e > 0; e -= 15) {
      const [x, y] = leftOf(R, i, -inside * (base + e)); if (x < B.x - 30 || x > B.x + B.w + 30 || y < B.y - 30 || y > B.y + B.h + 30) continue;
      const m = 150 + e * 0.4, [qx, qy] = leftOf(R, i, -inside * (base + e + m));
      if (dist(qx, qy, COAST + e + m + 30) >= COAST + e + m - 12) return e;
    }
    return 0;
  };
  let caps = []; for (let j = 0; j < n; j += 4) caps.push(capAt(j));
  { const m = caps.length, at = (A, j) => A[((j % m) + m) % m], er = caps.map((_, j) => Math.min(at(caps, j - 2), at(caps, j - 1), caps[j], at(caps, j + 1), at(caps, j + 2)));
    caps = er.map((_, j) => (at(er, j - 2) + at(er, j - 1) + er[j] + at(er, j + 1) + at(er, j + 2)) / 5); }   // (eased, but never past what's allowed: no saw-tooth where the room changes)
  const cap = j => Math.min(caps[Math.floor(j / 4) % caps.length], caps[(Math.floor(j / 4) + 1) % caps.length]);
  let o = []; for (let j = 0; j < n; j++) o.push(Math.min(want(j), cap(j)));
  for (let pass = 0; pass < 4; pass++) { const q = []; for (let j = 0; j < n; j++) { let a = 0; for (let k = -6; k <= 6; k++) a += o[(j + k + n) % n]; q.push(Math.min(a / 13, cap(j))); } o = q; }
  const raw = o.map((e, j) => leftOf(R, Math.min(R.N - 1, j * EVERY), -inside * (R.hw[Math.min(R.N - 1, j * EVERY)] + COAST + e)));
  const coast = raw.map((_, j) => { let x = 0, y = 0; for (let k = -3; k <= 3; k++) { const q = raw[(j + k + n) % n]; x += q[0]; y += q[1]; } return [x / 7, y / 7]; });   // (smoothed, so no little teeth where the road's normals fan out)
  // headlands: where the land reaches furthest out, a rocky point (the beach runs between them)
  const heads = [];
  for (let j = 0; j < n; j++) if (o[j] > 110 && o[j] >= o[(j + 1) % n] && o[j] > o[(j + n - 1) % n] && !heads.some(h => Math.abs(h.j - j) < 40 || n - Math.abs(h.j - j) < 40)) heads.push({ j, x: coast[j][0], y: coast[j][1], e: o[j] });
  // a few islets offshore: each a lump of sand and rock with a palm or two, out of the way of the waves
  const nearCoast = (x, y) => { let d = 1e9; for (let j = 0; j < n; j += 2) d = Math.min(d, Math.hypot(coast[j][0] - x, coast[j][1] - y)); return d; };
  const wavePts = waves.map(w => { const p = trackSample(R, w.s); return [p.x, p.y]; }), isles = [];
  for (let k = 0; k < 400 && isles.length < 2; k++) {
    const r = 46 + rng() * 44, x = B.x - 20 + rng() * (B.w + 40), y = B.y - 20 + rng() * (B.h + 40);
    if (inPoly(coast, x, y) || nearCoast(x, y) < r + 150 || dist(x, y, 400) < r + 230 || wavePts.some(([wx, wy]) => Math.hypot(wx - x, wy - y) < 700) || isles.some(q => Math.hypot(q.x - x, q.y - y) < q.r + r + 260)) continue;
    const pts = []; for (let a = 0; a < 14; a++) { const t = a / 14 * TAU, d = r * (0.72 + rng() * 0.36); pts.push([x + Math.cos(t) * d * 1.15, y + Math.sin(t) * d * 0.85]); }
    isles.push({ x, y, r, pts, v: rng() });
  }
  const cell = 40, grid = new Map();   // land or water, looked up on a grid (the props ask)
  const land = (x, y) => inPoly(coast, x, y) || isles.some(q => Math.abs(q.x - x) < q.r * 1.4 && Math.abs(q.y - y) < q.r * 1.4 && inPoly(q.pts, x, y));
  const onLand = (x, y, pad = 0) => {
    const gx = Math.round(x / cell), gy = Math.round(y / cell), k = gx + ',' + gy; let v = grid.get(k); if (v === undefined) grid.set(k, v = land(gx * cell, gy * cell));
    return pad > 0 ? v && [[pad, 0], [-pad, 0], [0, pad], [0, -pad]].every(([dx, dy]) => land(x + dx, y + dy)) : v;
  };
  onLand.wind = -0.7;
  // the lighthouse: on a rock out in the bay off the loop's outside, as far from the road as fits inside the track's box
  let light = null;
  for (let j = 0; j < n; j += 7) {
    const i = Math.min(R.N - 1, j * EVERY), [x, y] = leftOf(R, i, -inside * (R.hw[i] + COAST + o[j] + 210)); if (x < B.x + 80 || x > B.x + B.w - 80 || y < B.y + 80 || y > B.y + B.h - 80) continue;
    if (inPoly(coast, x, y) || isles.some(q => Math.hypot(q.x - x, q.y - y) < q.r + 220) || wavePts.some(([wx, wy]) => Math.hypot(wx - x, wy - y) < 600)) continue;
    let d = 1e9; for (const Q of T.routes || [T]) for (let m = 0; m < Q.N; m += 6) d = Math.min(d, Math.hypot(Q.pts[m][0] - x, Q.pts[m][1] - y) - Q.hw[m]);
    d = Math.min(d, nearCoast(x, y) + 60);
    if (d > 180 && (!light || d > light.d)) light = { x, y, d, i };
  }
  const loop = R.pts.filter((_, i) => i % 6 === 0), inLoop = (x, y) => inPoly(loop, x, y);   // (inside the main road's loop: the park, where the run-off ends at a hedge)
  const out = { coast, off: o, heads, isles, onLand, inLoop, inside, light }; bays.set(T, out); return out;
}

// The look: a toy island. Big calm areas in soft flat colours, a few clear things on them, one shade and one highlight
// each, hardly any outlines, so the road and the fork markings stay the busiest thing on screen.
const LAWN = '#a3d97f', SAND = '#f5e4b8', SAND_WET = '#e2c98f';
// a round toy tree: its soft shadow down and to the right, a ball of leaves, a highlight up on its top left
function toyTree(g, x, y, r, col = '#5fb35a') {
  ell(g, x + r * 0.45, y + r * 0.55, r * 1.02, r * 0.86); g.fillStyle = 'rgba(40,80,40,0.2)'; g.fill();
  circ(g, x, y, r); g.fillStyle = col; g.fill();
  circ(g, x + r * 0.12, y + r * 0.16, r * 0.82); g.fillStyle = shade(col, -0.08); g.fill();
  circ(g, x - r * 0.12, y - r * 0.14, r * 0.74); g.fillStyle = col; g.fill();
  circ(g, x - r * 0.32, y - r * 0.36, r * 0.32); g.fillStyle = 'rgba(255,255,255,0.28)'; g.fill();
}
// a smooth rounded boulder: shadow, a flat stone colour, a lighter top, a glint
function boulder(g, x, y, r, col = '#a49d92') {
  ell(g, x + r * 0.3, y + r * 0.42, r, r * 0.8); g.fillStyle = 'rgba(0,40,60,0.2)'; g.fill();
  ell(g, x, y, r, r * 0.82); g.fillStyle = col; g.fill();
  ell(g, x - r * 0.15, y - r * 0.2, r * 0.7, r * 0.5); g.fillStyle = shade(col, 0.12); g.fill();
  ell(g, x - r * 0.35, y - r * 0.38, r * 0.22, r * 0.13, -0.5); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fill();
}

// the ground: the bay (deep to turquoise shallows), one soft lawn, the beach with its surf, rocks, the islets
export function bayGround(g, T, rng, X0, Y0, W, H, dist, D) {
  const { coast, light, inside, isles, heads, onLand } = bayOf(T), P = trace(coast), area = W * H, IP = isles.map(q => blob(q.pts));
  const wet = (x, y, p) => ![[0, 0], [p, 0], [-p, 0], [0, p], [0, -p]].some(([dx, dy]) => onLand(x + dx, y + dy));   // out on open water, p clear of any land
  g.fillStyle = '#1b6d9c'; g.fillRect(X0, Y0, W, H);   // (the same blue as past the track layer's edge: LOOK.water.ground)
  for (let i = 0; i < 18; i++) { const x = X0 + rng() * W, y = Y0 + rng() * H, r = 260 + rng() * 380; g.fillStyle = radial(g, x, y, 0, x, y, r, [[0, alpha('#2584b0', 0.25)], [1, alpha('#2584b0', 0)]]); g.fillRect(x - r, y - r, r * 2, r * 2); }
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const [w, c] of [[1100, alpha('#1f78a6', 0.5)], [700, alpha('#2a8fb8', 0.55)], [430, alpha('#3aa9c4', 0.6)], [250, alpha('#5ac3cc', 0.7)], [120, alpha('#8edbd3', 0.85)]]) { g.strokeStyle = c; g.lineWidth = w; g.stroke(P); }
  for (const Q of IP) for (const [w, c] of [[300, alpha('#2a8fb8', 0.5)], [170, alpha('#3aa9c4', 0.6)], [90, alpha('#5ac3cc', 0.7)], [40, alpha('#8edbd3', 0.85)]]) { g.strokeStyle = c; g.lineWidth = w; g.stroke(Q); }   // the shallows round each islet
  if (light) for (const [r, c] of [[230, alpha('#2a8fb8', 0.5)], [150, alpha('#3aa9c4', 0.6)], [100, alpha('#8edbd3', 0.8)]]) { circ(g, light.x, light.y, r); g.fillStyle = c; g.fill(); }   // the shallows round the lighthouse rock
  // out on the water (clipped to the sea): a few soft crests, a couple of boats
  g.save(); const S = new Path2D(); S.rect(X0, Y0, W, H); S.addPath(P); for (const Q of IP) S.addPath(Q); g.clip(S, 'evenodd');
  const n = coast.length, outAt = (i, d) => { const [x0, y0] = coast[i], [xa, ya] = coast[(i + n - 1) % n], [xb, yb] = coast[(i + 1) % n], l = Math.hypot(xb - xa, yb - ya) || 1; return [x0 + (yb - ya) / l * inside * d, y0 - (xb - xa) / l * inside * d]; };   // d out to sea from the waterline
  g.lineWidth = 2.4;
  for (let i = 0; i < area / 45000 * D; i++) {
    const x = X0 + rng() * W, y = Y0 + rng() * H, d = dist(x, y, 160) - COAST; if (d < 120 || !wet(x, y, 100)) continue;
    const r = 9 + rng() * 8; g.strokeStyle = 'rgba(255,255,255,0.3)'; g.beginPath(); g.arc(x, y, r, Math.PI * 1.2, Math.PI * 1.8); g.stroke();
  }
  { const B = T.bbox; for (let k = 0, n = 0; k < 600 && n < (D > 0.5 ? 4 : 2); k++) {   // a few boats out on the bay, where you'll see them from the road
    const x = B.x + 60 + rng() * (B.w - 120), y = B.y + 60 + rng() * (B.h - 120), d = dist(x, y, 600) - COAST; if (d < 140 || d > 520 || !wet(x, y, 90)) continue;
    n++; seaBoat(g, x, y, 18 + rng() * 6, rng() * TAU, n % 2 === 1, rng);
  } }
  g.restore();
  // the land: one soft lawn, a few broad gentle patches
  g.save(); g.clip(P);
  g.fillStyle = LAWN; g.fillRect(X0, Y0, W, H);
  for (let i = 0; i < 12; i++) { const x = X0 + rng() * W, y = Y0 + rng() * H, r = 260 + rng() * 300; g.fillStyle = radial(g, x, y, 0, x, y, r, [[0, alpha(rng() < 0.5 ? '#b3e28f' : '#93cf70', 0.45)], [1, alpha('#93cf70', 0)]]); g.fillRect(x - r, y - r, r * 2, r * 2); }
  if (D > 0.5) for (let i = 0; i < area / 160000; i++) {   // here and there a little patch of daisies or buttercups
    const x = X0 + rng() * W, y = Y0 + rng() * H; if (dist(x, y, 90) < 60) continue; const col = rng() < 0.6 ? '#ffffff' : '#ffe066';
    for (let k = 0; k < 6; k++) { circ(g, x + (rng() - 0.5) * 34, y + (rng() - 0.5) * 22, 2.4); g.fillStyle = col; g.fill(); }
  }
  bayTown(g, T, rng, dist, D, findClearings(T, dist, 'water'));
  // the beach: sand from the waterline in, wet at the edge
  g.strokeStyle = SAND; g.lineWidth = 2 * (COAST + 2); g.stroke(P);
  g.strokeStyle = SAND_WET; g.lineWidth = 24; g.stroke(P);
  g.restore();
  // the surf: a soft band of foam along the waterline and a fainter one further out
  g.save(); g.clip(S, 'evenodd');
  for (const Q of [P, ...IP]) {
    const k = Q === P ? 1 : 0.6;
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 12 * k; g.setLineDash([120 * k, 30]); g.stroke(Q);
    g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 44 * k; g.setLineDash([]); g.stroke(Q);
  }
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 4; g.stroke(P);   // the swash line on the sand
  // the headlands: a few big round rocks running out into the surf
  for (const h of heads) {
    const r = mulberry(h.j * 17 + 3), [xa, ya] = coast[(h.j + n - 3) % n], [xb, yb] = coast[(h.j + 3) % n], l = Math.hypot(xb - xa, yb - ya) || 1, tx = (xb - xa) / l, ty = (yb - ya) / l, nx = ty * inside, ny = -tx * inside;
    const at = (a, d) => [h.x + tx * a + nx * d, h.y + ty * a + ny * d], m = 0.7 + Math.min(1, h.e / 200) * 0.5;
    const B = [[0, 22, 26], [-34, 8, 18], [30, 6, 20], [-8, 54, 17], [22, 44, 13]].map(([a, d, s]) => [...at((a + (r() - 0.5) * 8) * m, (d + (r() - 0.5) * 8) * m), s * m]);
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.beginPath(); for (const [x, y, s] of B) { g.moveTo(x + s + 7, y); g.arc(x, y, s + 7, 0, TAU); } g.fill();   // foam round them (one soft halo)
    B.sort((p, q) => p[1] - q[1]);
    for (const [x, y, s] of B) boulder(g, x, y, s);
  }
  // the islets: a round lump of sand with a tuft of grass, a palm and a rock
  for (const q of isles) {
    const r = mulberry(Math.floor(q.v * 1e6) + 1), Q = blob(q.pts), mid = q.pts.map(([x, y]) => [q.x + (x - q.x) * 0.55 - 4, q.y + (y - q.y) * 0.5 - 4]);
    g.fillStyle = SAND_WET; g.fill(Q); smooth(g, q.pts.map(([x, y]) => [q.x + (x - q.x) * 0.88 - 2, q.y + (y - q.y) * 0.86 - 2])); g.fillStyle = SAND; g.fill();
    smooth(g, mid); g.fillStyle = LAWN; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3; g.stroke(Q);
    const a = r() * TAU; boulder(g, q.x + Math.cos(a) * q.r * 0.8, q.y + Math.sin(a) * q.r * 0.55, 11 + r() * 5);
    const px = q.x + (r() - 0.5) * q.r * 0.3, py = q.y + (r() - 0.5) * q.r * 0.2;
    ell(g, px + 10, py + 12, 20, 16); g.fillStyle = 'rgba(40,80,40,0.2)'; g.fill(); palm(g, px, py, 24, r, -0.7);
  }
}

// along the road: a promenade either side, then on the sea side the beach with groynes and umbrellas. fillB(colour,
// offset) fills a band that far round every road.
export function bayShore(g, T, fillB, rng, D) {
  fillB('#e9dfc9', 34); fillB('#f3ebda', 30);
  const { coast, inside, off } = bayOf(T), n = coast.length;
  if (D <= 0.5) return;
  let next = 60 + rng() * 80;
  for (let i = 1; i < n - 1; i++) {
    if (--next > 0) continue; next = 170 + Math.floor(rng() * 90);   // a groyne every so often: a short line of boulders out into the surf
    if (off[i] > 70) continue;   // (not on a headland: rocks of its own there)
    const [x0, y0] = coast[i], [xa, ya] = coast[i - 1], [xb, yb] = coast[i + 1], l = Math.hypot(xb - xa, yb - ya) || 1, tx = (xb - xa) / l, ty = (yb - ya) / l;
    const nx = ty * inside, ny = -tx * inside;   // (out to sea)
    const r = mulberry(i * 31);
    for (let d = 0; d < 100; d += 20) { circ(g, x0 + nx * d, y0 + ny * d, 15); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fill(); }
    for (let d = 0; d < 100; d += 20) boulder(g, x0 + nx * d + (r() - 0.5) * 4, y0 + ny * d + (r() - 0.5) * 4, 10 + r() * 3);
    if (r() < 0.7) { const k = r() < 0.5 ? -1 : 1, off2 = 50 + r() * 30; umbrella(g, x0 - nx * 26 + tx * k * off2, y0 - ny * 26 + ty * k * off2, 15, ['#f2705f', '#5aa9e6', '#ffcf4d', '#4cc4a8', '#f48fb1'][Math.floor(r() * 5)]); }
  }
}
function umbrella(g, x, y, r, col) {
  circ(g, x + r * 0.45, y + r * 0.6, r); g.fillStyle = 'rgba(0,0,0,0.16)'; g.fill();
  for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, k / 6 * TAU, (k + 1) / 6 * TAU); g.closePath(); g.fillStyle = k % 2 ? '#ffffff' : col; g.fill(); }
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, Math.PI, Math.PI * 1.5); g.closePath(); g.fill();   // lit from the top left
}

// the track's `ponds`: the first is the marina, the second a park lake
export function bayBasin(g, p) {
  const { x, y, r } = p, rng = mulberry(Math.round(x * 7 + y));
  if ((Math.floor(x / 50) + Math.floor(y / 50)) % 2) {   // (one of each)
    const pts = []; for (let k = 0; k < 10; k++) { const a = k / 10 * TAU, d = r * (0.8 + rng() * 0.2); pts.push([x + Math.cos(a) * d * 1.2, y + Math.sin(a) * d * 0.85]); }
    smooth(g, pts.map(([px, py]) => [x + (px - x) * 1.12, y + (py - y) * 1.14])); g.fillStyle = SAND; g.fill();
    smooth(g, pts); g.fillStyle = '#5cc0d4'; g.fill();
    smooth(g, pts.map(([px, py]) => [x + (px - x) * 0.7 - r * 0.12, y + (py - y) * 0.6 - r * 0.12])); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fill();
    for (const [dx, dy, s] of [[-0.5, 0.25, 11], [-0.32, 0.4, 8], [0.5, -0.2, 10]]) { circ(g, x + dx * r, y + dy * r, s); g.fillStyle = '#6fbf5e'; g.fill(); circ(g, x + dx * r - s * 0.3, y + dy * r - s * 0.3, s * 0.35); g.fillStyle = '#ffd1e0'; g.fill(); }   // lily pads, one in flower
    for (const [dx, dy] of [[-0.95, -0.45], [-0.85, -0.6], [0.9, 0.5]]) for (let k = 0; k < 3; k++) { const rx = x + dx * r + k * 12 - 12, ry = y + dy * r * 0.85 + (k % 2) * 6; circ(g, rx, ry, 11); g.fillStyle = k % 2 ? '#5aa957' : '#68b862'; g.fill(); }   // clumps of reeds at the edge
    // a little wooden jetty out from the bottom, a rowing boat tied to it
    { const jx = x + r * 0.35, jy = y + r * 0.62; g.fillStyle = 'rgba(20,70,90,0.2)'; g.fillRect(jx - 7 + 3, jy - r * 0.3 + 4, 14, r * 0.34); g.fillStyle = '#d8b48a'; g.fillRect(jx - 7, jy - r * 0.32, 14, r * 0.38); boat(g, jx + 24, jy - r * 0.2, 30, -Math.PI / 2, mulberry(3)); }
    for (const [dx, dy, f] of [[0.05, -0.05, 1], [0.24, 0.08, 1]]) duck(g, x + dx * r, y + dy * r, f);
    return;
  }
  const w = r * 1.35, h = r * 0.95;
  g.save(); g.translate(5, 7); g.fillStyle = 'rgba(30,40,30,0.18)'; g.beginPath(); g.roundRect(x - w - 14, y - h - 14, w * 2 + 28, h * 2 + 28, 44); g.fill(); g.restore();
  g.fillStyle = '#ece3d2'; g.beginPath(); g.roundRect(x - w - 14, y - h - 14, w * 2 + 28, h * 2 + 28, 44); g.fill();   // the quay
  const water = new Path2D(); water.roundRect(x - w, y - h, w * 2, h * 2, 32);
  g.fillStyle = radial(g, x - w * 0.3, y - h * 0.4, 10, x, y, w * 1.2, [[0, '#5cc6d6'], [1, '#2f9cb4']]); g.fill(water);
  g.save(); g.clip(water);
  g.strokeStyle = 'rgba(20,70,90,0.22)'; g.lineWidth = 12; g.beginPath(); g.roundRect(x - w + 4, y - h + 6, w * 2, h * 2, 32); g.stroke();   // the quay wall's shadow on the water
  // the pontoon: a walkway from the bottom quay up the middle, three fingers either side, a boat in some of the berths
  const px = x, top = y - h * 0.45, plank = '#d8b48a';
  g.fillStyle = 'rgba(20,70,90,0.22)'; g.fillRect(px - 7 + 3, top + 4, 14, y + h - top);
  g.fillStyle = plank; g.fillRect(px - 7, top, 14, y + h - top + 2);
  let k = 0;
  for (let fy = top + 24; fy < y + h - 30; fy += 56) for (const sgn of [-1, 1]) {
    const fl = w * 0.45; g.fillStyle = 'rgba(20,70,90,0.2)'; g.fillRect(px + (sgn > 0 ? 7 : -7 - fl) + 3, fy + 3, fl, 7); g.fillStyle = plank; g.fillRect(px + (sgn > 0 ? 7 : -7 - fl), fy, fl, 7);
    if ((k++ % 3) !== 1) boat(g, px + sgn * (7 + fl * 0.55), fy + 24, 34, sgn > 0 ? 0 : Math.PI, rng);
  }
  g.restore();
}
function duck(g, x, y, f) {
  g.save(); g.translate(x, y); g.scale(1.6, 1.6); x = 0; y = 0;
  ell(g, x + 2, y + 3, 7, 4); g.fillStyle = 'rgba(20,70,90,0.2)'; g.fill();
  ell(g, x, y, 7, 4.6); g.fillStyle = '#ffffff'; g.fill();
  circ(g, x + 5 * f, y - 3, 3.4); g.fill();
  g.fillStyle = '#f39a1e'; ell(g, x + 8.6 * f, y - 2.6, 2.2, 1.2); g.fill();
  g.fillStyle = '#1b1b1f'; circ(g, x + 5.8 * f, y - 3.8, 0.8); g.fill();
  g.restore();
}
// a boat from above (bow along `rot`); a sailboat out on the bay gets its sail
function boat(g, x, y, l, rot, rng, sail = false) {
  const col = ['#ffffff', '#ffffff', '#5aa9e6', '#f2705f', '#ffcf4d'][Math.floor(rng() * 5)];
  g.save(); g.translate(x, y); g.rotate(rot);
  ell(g, l * 0.1, l * 0.16, l * 0.55, l * 0.2); g.fillStyle = 'rgba(0,40,60,0.2)'; g.fill();
  g.beginPath(); g.moveTo(l * 0.55, 0); g.quadraticCurveTo(l * 0.3, -l * 0.24, -l * 0.45, -l * 0.19); g.lineTo(-l * 0.45, l * 0.19); g.quadraticCurveTo(l * 0.3, l * 0.24, l * 0.55, 0); g.fillStyle = col; g.fill();
  g.beginPath(); g.moveTo(l * 0.42, 0); g.quadraticCurveTo(l * 0.24, -l * 0.15, -l * 0.36, -l * 0.12); g.lineTo(-l * 0.36, l * 0.12); g.quadraticCurveTo(l * 0.24, l * 0.15, l * 0.42, 0); g.fillStyle = col === '#ffffff' ? '#e9d3b0' : '#fbf6ec'; g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(-l * 0.2, -l * 0.1, l * 0.3, l * 0.2, l * 0.06); g.fill();
  g.fillStyle = '#9fd3ea'; g.fillRect(l * 0.04, -l * 0.08, l * 0.05, l * 0.16);
  if (sail) { g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(l * 0.2, 0); g.quadraticCurveTo(-l * 0.02, l * 0.36, -l * 0.36, l * 0.32); g.lineTo(-l * 0.32, 0); g.closePath(); g.fill(); g.fillStyle = 'rgba(90,130,160,0.2)'; g.fillRect(-l * 0.32, 0, l * 0.5, l * 0.04); }
  g.restore();
}

// the props: none on the land (its trees are clumps: bayTown); buoys and boats on the water
export function bayProp(g, d, shadowPass, land) {
  const { x, y, r, v } = d, rng = mulberry(Math.floor(v * 1e6) + 11), onLand = land ? land(x, y) : true;
  if (onLand || shadowPass || (v * 7919) % 1 > 0.35) return;
  if (v < 0.5) seaBoat(g, x, y, 18, v * 40, v < 0.25, rng);
  else {   // a channel buoy, red or green, in a ring of foam
    const col = v < 0.75 ? '#f2705f' : '#4cc48a';
    circ(g, x, y, 13); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fill(); circ(g, x + 3, y + 4, 8.5); g.fillStyle = 'rgba(0,40,60,0.22)'; g.fill();
    circ(g, x, y, 8.5); g.fillStyle = col; g.fill(); circ(g, x - 2.5, y - 2.5, 3); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fill();
  }
}
// out on the bay: a sailboat with a little wake behind, or a motorboat with its wake fanning out
function seaBoat(g, x, y, r, a, sail, rng) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = linear(g, -r * 0.6, 0, -r * 3, 0, [[0, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]);
  g.beginPath(); g.moveTo(-r * 0.6, -r * 0.22); g.lineTo(-r * (sail ? 2 : 3), -r * (sail ? 0.45 : 0.95)); g.quadraticCurveTo(-r * 2, 0, -r * (sail ? 2 : 3), r * (sail ? 0.45 : 0.95)); g.lineTo(-r * 0.6, r * 0.22); g.closePath(); g.fill();
  g.restore();
  boat(g, x, y, r * 1.5, a, rng, sail);
}

// ------------------------------------------------------------------------------------------------ landmarks
// the two biggest clearings: the farm and the town square; the lighthouse is drawn with the ground (bayLighthouse)
export function bayLandmark(g, c, i) {
  if (i % 2 === 0) farm(g, c); else townSquare(g, c);
}
// the farm, laid out once per clearing (shared by the static art and the animals from the clock): pasture, barn,
// silo, windmill, pond, and cows and sheep that each wander between their own spots
const farms = new WeakMap();
function farmOf(c) {
  if (farms.has(c)) return farms.get(c);
  const { x, y, r } = c, rng = mulberry(Math.floor(c.v * 1e6) + 5), W = r * 0.95, H = r * 0.72;
  const barn = { x: x - W * 0.5, y: y - H * 0.58, w: Math.min(130, W * 0.5), h: Math.min(78, H * 0.36) };
  const silo = { x: barn.x + barn.w / 2 + 30, y: barn.y - 6, r: 21 };
  const mill = { x: x + W * 0.66, y: y - H * 0.5, r: 24 };
  const pond = { x: x + W * 0.5, y: y + H * 0.42, rx: Math.min(62, W * 0.24), ry: Math.min(40, H * 0.22) };
  const trough = { x: x - W * 0.08, y: y - H * 0.18 };
  const keepOut = [[barn.x, barn.y, barn.w * 0.65 + 18], [silo.x, silo.y, silo.r + 18], [mill.x, mill.y, mill.r + 70], [pond.x, pond.y, pond.rx + 20], [trough.x, trough.y, 26]];
  const spot = (cx, cy, rx, ry) => { for (let k = 0; k < 40; k++) { const a = rng() * TAU, d = Math.sqrt(rng()), px = cx + Math.cos(a) * rx * d, py = cy + Math.sin(a) * ry * d; if (Math.abs(px - x) < W - 24 && Math.abs(py - y) < H - 24 && !keepOut.some(([ox, oy, or]) => Math.hypot(ox - px, oy - py) < or)) return [px, py]; } return [cx, cy]; };
  const round = (cx, cy, rx, ry, m) => { const p = []; for (let k = 0; k < m; k++) p.push(spot(cx, cy, rx, ry)); return p; };
  const cows = [];
  for (let k = 0; k < 4; k++) cows.push({ wp: round(x - W * 0.45 + (k % 2) * W * 0.45, y + H * (0.1 + 0.42 * Math.floor(k / 2)), W * 0.13, H * 0.1, 4), P: 11 + rng() * 7, walk: 0.22 + rng() * 0.1, ph: rng() * 40, s: 1 + rng() * 0.12, spots: Array.from({ length: 3 }, () => [rng() - 0.5, rng() - 0.5, 0.5 + rng() * 0.5]) });
  const flock = { wp: round(x + W * 0.22, y - H * 0.3, W * 0.14, H * 0.1, 5), P: 16, walk: 0.3, ph: rng() * 30, sheep: [] };
  for (let k = 0; k < 7; k++) flock.sheep.push({ dx: (rng() - 0.5) * 70, dy: (rng() - 0.5) * 46, h: rng() * TAU, ph: rng() * 10, s: 0.95 + rng() * 0.2, black: k === 3 });
  const bales = []; for (let k = 0; k < 5; k++) bales.push([barn.x - barn.w * 0.35 + k * 24 + (rng() - 0.5) * 6, barn.y + barn.h / 2 + 30 + (k % 2) * 18]);
  const out = { x, y, W, H, barn, silo, mill, pond, trough, cows, flock, bales, rng }; farms.set(c, out); return out;
}
function farm(g, c) {
  const F = farmOf(c), { x, y, W, H, barn, silo, mill, pond } = F;
  // the pasture: a slightly deeper green than the park, a worn patch by the gate
  g.fillStyle = '#97d173'; g.beginPath(); g.roundRect(x - W, y - H, W * 2, H * 2, 26); g.fill();
  g.save(); g.beginPath(); g.roundRect(x - W, y - H, W * 2, H * 2, 26); g.clip();
  for (const [px, py, pr, col] of [[x - W * 0.3, y + H * 0.3, W * 0.6, '#a6db82'], [x + W * 0.5, y - H * 0.2, W * 0.5, '#8cc96a']]) { g.fillStyle = radial(g, px, py, 0, px, py, pr, [[0, alpha(col, 0.6)], [1, alpha(col, 0)]]); g.fillRect(px - pr, py - pr, pr * 2, pr * 2); }
  g.restore();
  // the farm track in through the gate (bottom left) up to the barn doors
  g.strokeStyle = '#e3cf9e'; g.lineWidth = 20; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - W + 40, y + H + 18); g.quadraticCurveTo(x - W + 50, y, barn.x - barn.w * 0.15, barn.y + barn.h / 2 + 10); g.stroke();
  // the duck pond
  ell(g, pond.x, pond.y, pond.rx + 5, pond.ry + 5); g.fillStyle = '#86c665'; g.fill();
  ell(g, pond.x, pond.y, pond.rx, pond.ry); g.fillStyle = '#5cc0d4'; g.fill();
  ell(g, pond.x - pond.rx * 0.25, pond.y - pond.ry * 0.3, pond.rx * 0.45, pond.ry * 0.3); g.fillStyle = 'rgba(255,255,255,0.22)'; g.fill();
  for (const [dx, dy] of [[0.45, 0.35], [-0.5, 0.25]]) { circ(g, pond.x + dx * pond.rx, pond.y + dy * pond.ry, 6); g.fillStyle = '#6fbf5e'; g.fill(); }
  duck(g, pond.x + pond.rx * 0.05, pond.y - pond.ry * 0.1, -1);
  // the fence: two rails and a post every so often, all round, a gap for the gate at the bottom left
  const fx0 = x - W, fy0 = y - H, fx1 = x + W, fy1 = y + H, gate = [x - W + 18, x - W + 64];
  const runs = [[[fx0, fy0], [fx1, fy0]], [[fx1, fy0], [fx1, fy1]], [[fx1, fy1], [gate[1], fy1]], [[gate[0], fy1], [fx0, fy1]], [[fx0, fy1], [fx0, fy0]]];
  g.lineCap = 'round';
  for (const [[ax, ay], [bx, by]] of runs) { g.strokeStyle = 'rgba(40,70,30,0.18)'; g.lineWidth = 4; g.beginPath(); g.moveTo(ax + 3, ay + 4); g.lineTo(bx + 3, by + 4); g.stroke(); }
  for (const [[ax, ay], [bx, by]] of runs) {
    g.strokeStyle = '#c99d6e'; g.lineWidth = 3.4; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    const l = Math.hypot(bx - ax, by - ay), m = Math.max(1, Math.round(l / 40));
    for (let k = 0; k <= m; k++) { circ(g, ax + (bx - ax) * k / m, ay + (by - ay) * k / m, 3.6); g.fillStyle = '#a77a4e'; g.fill(); }
  }
  // hay bales
  for (const [bx, by] of F.bales.slice(0, 3)) {
    circ(g, bx + 4, by + 5, 12); g.fillStyle = 'rgba(40,70,30,0.2)'; g.fill();
    circ(g, bx, by, 12); g.fillStyle = '#f0cf6e'; g.fill(); circ(g, bx, by, 6); g.strokeStyle = '#d9b04d'; g.lineWidth = 1.6; g.stroke();
    circ(g, bx - 4, by - 4.5, 3.5); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill();
  }
  // the barn: a red roof in two halves (the upper one lit), white trim, a little white cupola
  { const { x: bx, y: by, w, h } = barn;
    g.fillStyle = 'rgba(40,70,30,0.24)'; g.beginPath(); g.roundRect(bx - w / 2 + 10, by - h / 2 + 13, w, h, 6); g.fill();
    g.fillStyle = '#f7f2e8'; g.beginPath(); g.roundRect(bx - w / 2 - 3, by - h / 2 - 3, w + 6, h + 6, 7); g.fill();
    g.fillStyle = '#e8665a'; g.beginPath(); g.roundRect(bx - w / 2, by - h / 2, w, h / 2, [5, 5, 0, 0]); g.fill();
    g.fillStyle = '#c4473f'; g.beginPath(); g.roundRect(bx - w / 2, by, w, h / 2, [0, 0, 5, 5]); g.fill();
    g.fillStyle = '#f7f2e8'; g.beginPath(); g.roundRect(bx - 10, by - 10, 20, 20, 4); g.fill(); g.fillStyle = '#e8665a'; g.fillRect(bx - 7, by - 7, 14, 7); g.fillStyle = '#c4473f'; g.fillRect(bx - 7, by, 14, 7);
  }
  // the silo: a round tower with a domed cap
  circ(g, silo.x + 9, silo.y + 12, silo.r); g.fillStyle = 'rgba(40,70,30,0.24)'; g.fill();
  circ(g, silo.x, silo.y, silo.r); g.fillStyle = '#d6dbe1'; g.fill();
  circ(g, silo.x - silo.r * 0.12, silo.y - silo.r * 0.14, silo.r * 0.78); g.fillStyle = '#e7ebef'; g.fill();
  circ(g, silo.x - silo.r * 0.35, silo.y - silo.r * 0.38, silo.r * 0.25); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fill();
  // the windmill's tower (its sails turn: bayLife): a round white tower with a brown cap
  { const { x: mx, y: my, r: mr } = mill;
    circ(g, mx + 14, my + 18, mr + 2); g.fillStyle = 'rgba(40,70,30,0.24)'; g.fill();
    circ(g, mx, my, mr + 2); g.fillStyle = '#f6f1e6'; g.fill();
    circ(g, mx, my, mr * 0.68); g.fillStyle = '#b98b5e'; g.fill();
    circ(g, mx - mr * 0.18, my - mr * 0.2, mr * 0.4); g.fillStyle = '#cfa173'; g.fill();
  }
}
// the animals and the windmill's sails, from the race clock (draw-ambient.js), nothing kept. Animals themselves are
// drawn by art/fauna.js (every animal in the game, one style).
export function bayLife(ctx, T, t, view) {
  const C = clearingsOf(T); if (!C || !C.length) return;
  const F = farmOf(C[0]); if (!view(F.x, F.y, Math.max(F.W, F.H) + 80)) return;
  const L = [];
  for (const A of F.cows) {
    const w = wander(A, t), graze = w.walking < 0.05, walking = !graze;
    L.push([w.y, () => cow(ctx, w.x, w.y, Math.cos(w.h) >= 0 ? 1 : -1, A.s, A.spots, walking ? (t + A.ph) * 6 : 0, graze, Math.max(0, Math.sin(t * 2.4 + A.ph)) * 1.6, Math.sin(t * 3.1 + A.ph * 2))]);
  }
  const fl = wander(F.flock, t), moving = fl.walking > 0.05;
  for (const S of F.flock.sheep) {
    const ph = t * 0.7 + S.ph, x = fl.x + S.dx + Math.sin(ph * 0.5) * 4, y = fl.y + S.dy + Math.cos(ph * 0.4) * 3;
    const face = moving ? (Math.cos(fl.h) >= 0 ? 1 : -1) : (Math.sin(ph * 0.21 + S.h) >= 0 ? 1 : -1);
    L.push([y, () => sheep(ctx, x, y, face, S.s, moving ? (t + S.ph) * 8 : 0, !moving, Math.max(0, Math.sin(t * 2 + S.ph)) * 1.2, S.black)]);
  }
  L.sort((a, b) => a[0] - b[0]); for (const [, d] of L) d();
  // the windmill's sails, turning slowly in the sea breeze (their shadow down and to the right on the grass)
  const { x: mx, y: my } = F.mill, a = t * 0.55;
  for (const sh of [1, 0]) {
    ctx.save(); ctx.translate(mx + sh * 26, my + sh * 34 - 6); ctx.rotate(a);
    for (let k = 0; k < 4; k++) {
      ctx.rotate(TAU / 4);
      if (sh) { ctx.fillStyle = 'rgba(30,40,20,0.18)'; ctx.beginPath(); ctx.roundRect(12, 0, 52, 14, 5); ctx.fill(); continue; }
      ctx.fillStyle = '#9b7653'; ctx.beginPath(); ctx.roundRect(0, -2.5, 64, 5, 2.5); ctx.fill();   // the stock
      ctx.fillStyle = '#fbf5e8'; ctx.beginPath(); ctx.roundRect(14, 1.5, 50, 13, 5); ctx.fill();    // the sail
      ctx.fillStyle = 'rgba(155,118,83,0.25)'; ctx.fillRect(14, 8, 50, 1.6);
    }
    if (!sh) { circ(ctx, 0, 0, 6.5); ctx.fillStyle = '#c0423a'; ctx.fill(); circ(ctx, -1.8, -1.8, 2.4); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill(); }
    ctx.restore();
  }
}
// the town square: a plaza and fountain ringed by little houses facing it
function townSquare(g, c) {
  const { x, y, r } = c, rng = mulberry(Math.floor(c.v * 1e6) + 9), R = Math.min(r * 0.42, 110);
  circ(g, x + 6, y + 8, R + 6); g.fillStyle = 'rgba(40,70,30,0.14)'; g.fill();
  circ(g, x, y, R + 6); g.fillStyle = '#e9dcc3'; g.fill(); circ(g, x, y, R); g.fillStyle = '#f5ecda'; g.fill();
  circ(g, x, y, R * 0.62); g.strokeStyle = '#e9dcc3'; g.lineWidth = 5; g.stroke();
  // the fountain
  circ(g, x + 4, y + 5, 30); g.fillStyle = 'rgba(40,70,30,0.16)'; g.fill();
  circ(g, x, y, 30); g.fillStyle = '#ddd6c8'; g.fill(); circ(g, x, y, 24); g.fillStyle = '#6ecbe0'; g.fill();
  circ(g, x - 7, y - 7, 9); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fill();
  circ(g, x, y, 8); g.fillStyle = '#ddd6c8'; g.fill(); circ(g, x - 1.5, y - 1.5, 4); g.fillStyle = '#ffffff'; g.fill();
  // the houses round it, and a few trees
  const ROOFS = ['#f2705f', '#5aa9e6', '#ffcf4d', '#4cc4a8', '#b98be0', '#f48fb1', '#ff9a4d'];
  const n = 7, a0 = rng() * TAU, items = [];
  for (let k = 0; k < n; k++) {
    const a = a0 + k / n * TAU; if (k % 4 === 3) { items.push([x + Math.cos(a) * (R + 52), y + Math.sin(a) * (R + 52), 'tree']); continue; }
    items.push([x + Math.cos(a) * (R + 50), y + Math.sin(a) * (R + 50), a]);
  }
  items.sort((p, q) => p[1] - q[1]);
  for (const [hx, hy, a] of items) a === 'tree' ? toyTree(g, hx, hy, 22) : house(g, hx, hy, 60, 44, a + Math.PI / 2, ROOFS[Math.floor(rng() * ROOFS.length)]);
}
// the lighthouse on its rock: a red-and-white tower from above, its shadow and a faint beam across the water
export function bayLighthouse(g, T) {
  const { light } = bayOf(T); if (!light) return;
  const { x, y } = light, rng = mulberry(77);
  circ(g, x, y, 66); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill();   // surf round it
  circ(g, x + 4, y + 6, 54); g.fillStyle = 'rgba(0,40,60,0.2)'; g.fill();
  circ(g, x, y, 54); g.fillStyle = '#b5ada1'; g.fill(); circ(g, x - 6, y - 6, 44); g.fillStyle = '#c9c2b6'; g.fill();
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.4 + rng() * 0.3; boulder(g, x + Math.cos(a) * 52, y + Math.sin(a) * 46, 13 + rng() * 6); }
  ell(g, x + 50, y + 60, 40, 17, 0.85); g.fillStyle = 'rgba(0,30,40,0.22)'; g.fill();   // the tower's shadow
  const lr = 30;
  circ(g, x, y, lr); g.fillStyle = '#f7f3ea'; g.fill();
  for (const [k, col] of [[0.84, '#e8574b'], [0.64, '#f7f3ea'], [0.46, '#e8574b']]) { circ(g, x, y, lr * k); g.fillStyle = col; g.fill(); }
  circ(g, x, y, lr * 0.32); g.fillStyle = '#ffe48a'; g.fill();
  circ(g, x - lr * 0.35, y - lr * 0.4, lr * 0.22); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fill();
  g.fillStyle = 'rgba(255,244,190,0.14)'; g.beginPath(); g.moveTo(x, y); g.arc(x, y, 520, -2.5, -2.1); g.closePath(); g.fill();
}

// ------------------------------------------------------------------------------------------------ the park
// the park's trees (with the ground, under the road): a few clumps well apart, clear of road, ponds and landmarks, so
// most of the lawn stays open
export function bayTown(g, T, rng, dist, D, clearings) {
  const { onLand } = bayOf(T), B = T.bbox;
  const busy = [...(T.ponds || []).map(p => ({ x: p.x, y: p.y, r: p.r * 1.5 + 30 })), ...clearings.map(c => ({ x: c.x, y: c.y, r: c.r + 20 }))];
  const free = (x, y, r, road = 70) => onLand(x, y) && onLand(x + r, y) && onLand(x - r, y) && onLand(x, y + r) && onLand(x, y - r) && dist(x, y, r + road + 40) > r + road && !busy.some(b => Math.hypot(b.x - x, b.y - y) < b.r + r);
  const spot = (r, road) => { for (let k = 0; k < 200; k++) { const x = B.x + rng() * B.w, y = B.y + rng() * B.h; if (free(x, y, r, road)) return [x, y]; } return null; };
  const COLS = ['#5fb35a', '#6cbf5e', '#53a653'];
  for (let k = 0; k < (D > 0.5 ? 13 : 6); k++) {
    const s = spot(70, 50); if (!s) continue; const [cx, cy] = s, palms = k % 4 === 2, n = 5 + Math.floor(rng() * 5);
    busy.push({ x: cx, y: cy, r: 220 });   // (the next clump keeps well away)
    const trees = []; for (let j = 0, m = 0; j < 30 && m < n; j++) { const x = cx + (rng() - 0.5) * 150, y = cy + (rng() - 0.5) * 100; if (!onLand(x, y) || dist(x, y, 120) < 60 || trees.some(([tx, ty, tr]) => Math.hypot(tx - x, ty - y) < tr + 8)) continue; trees.push([x, y, 19 + rng() * 10]); m++; }
    trees.sort((a, b) => a[1] - b[1]);
    for (const [x, y, r] of trees) palms ? (ell(g, x + r * 0.45, y + r * 0.55, r * 1.02, r * 0.86), g.fillStyle = 'rgba(40,80,40,0.2)', g.fill(), palm(g, x, y, r * 1.25, rng, -0.7)) : toyTree(g, x, y, r, COLS[Math.floor(rng() * 3)]);
  }
}
// a little house from above, turned by a: a ridged roof (the half facing the top left lit), eaves, a chimney
function house(g, x, y, w, h, a, col) {
  g.save(); g.translate(x + 7, y + 9); g.rotate(a); g.fillStyle = 'rgba(40,70,30,0.2)'; g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, 6); g.fill(); g.restore();
  g.save(); g.translate(x, y); g.rotate(a);
  const lit = Math.cos(a - Math.PI / 2 + Math.PI * 0.75) > 0;   // (is the -y half the one facing the light?)
  g.fillStyle = '#fbf7ef'; g.beginPath(); g.roundRect(-w / 2 - 2.5, -h / 2 - 2.5, w + 5, h + 5, 7); g.fill();
  g.fillStyle = shade(col, lit ? 0.1 : -0.12); g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h / 2, [5, 5, 0, 0]); g.fill();
  g.fillStyle = shade(col, lit ? -0.12 : 0.1); g.beginPath(); g.roundRect(-w / 2, 0, w, h / 2, [0, 0, 5, 5]); g.fill();
  g.fillStyle = '#fbf7ef'; g.beginPath(); g.roundRect(w * 0.18, -h * 0.36, 8, 8, 2); g.fill();   // the chimney
  g.restore();
}

// ------------------------------------------------------------------------------------------------ the water, live
// sun glints on the bay: points that flash now and then (every frame under the karts, draw-mechanics.js; tiny shapes,
// no gradients)
const glintsOf = new WeakMap();
export function bayGlints(ctx, T, t) {
  let G = glintsOf.get(T);
  if (!G) {
    const { onLand } = bayOf(T), B = T.bbox, rng = mulberry(4242); G = [];
    for (let k = 0; k < 2000 && G.length < 90; k++) { const x = B.x - 100 + rng() * (B.w + 200), y = B.y - 100 + rng() * (B.h + 200); if (!onLand(x, y, 60)) G.push({ x, y, ph: rng() * TAU, sp: 0.6 + rng() * 1.4, s: 2.5 + rng() * 3.5 }); }
    glintsOf.set(T, G);
  }
  ctx.save(); ctx.fillStyle = '#ffffff';
  for (const p of G) {
    const a = Math.sin(t * p.sp + p.ph); if (a < 0.9) continue;
    const k = (a - 0.9) / 0.1, s = p.s * (0.6 + 0.6 * k); ctx.globalAlpha = 0.85 * k;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - s * 2); ctx.lineTo(p.x + s * 0.45, p.y); ctx.lineTo(p.x, p.y + s * 2); ctx.lineTo(p.x - s * 0.45, p.y); ctx.closePath();
    ctx.moveTo(p.x - s * 2, p.y); ctx.lineTo(p.x, p.y + s * 0.45); ctx.lineTo(p.x + s * 2, p.y); ctx.lineTo(p.x, p.y - s * 0.45); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
