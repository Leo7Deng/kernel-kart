// Kernel Kart: elevation. A track with `elev: true` gives each layout point a height as a 4th number ([x, y, r, h], world
// units; on a course each route's points carry their own). The road's height runs smoothly between them along the lap
// (a monotone cubic, so it never overshoots a summit or dips below a valley), and the slope does what a slope does:
//   - gravity along the road: climbing slows you (a slower run out of every corner), descending speeds you up, and
//     lifting downhill bleeds speed off more slowly (G_SLOPE · grade, on the ground, gas or not);
//   - top speed: on the gas you settle at less uphill and more downhill (1 - K_TOP · grade), so a long descent runs well
//     past your kart's usual top speed.
// So the same corner is a different throttle call uphill (brake late, the hill slows you; get on it hard) and downhill
// (lift earlier: you arrive faster and stop slower). Bots plan their braking with it (race-ai.js: v² = vCorner² +
// 2·brake·d + 2·G·rise). Nothing else in the race changes, so a track without heights replays exactly as before.
import { STEP, clamp } from './core.js';
import { wrapS } from './geometry.js';


export const G_SLOPE = 620;    // gravity along the road, per unit of grade (world units/s²)
export const K_TOP = 1.6;      // top speed changes by this much per unit of grade (a 10% climb: 16% slower on top)
export const TOP_MIN = 0.72, TOP_MAX = 1.3;

// the road's height and grade at every sample of this route (null without heights)
export function buildElevation(T) {
  const d = T.def; if (!d.elev) return null;
  const sc = d.scale || 1, N = T.N, L = T.L;
  // each layout point with a height: where it sits on the centreline (the middle of its corner's arc)
  const knots = [];
  for (const p of d.pts) {
    if (p.length < 4) continue;
    const x = p[0] * sc, y = p[1] * sc; let bi = 0, bd = 1e18;
    for (let i = 0; i < N; i++) { const q = T.pts[i], dd = (q[0] - x) ** 2 + (q[1] - y) ** 2; if (dd < bd) { bd = dd; bi = i; } }
    knots.push([bi * STEP, p[3]]);
  }
  knots.sort((a, b) => a[0] - b[0]);
  const K = T.open ? knots : [[knots[knots.length - 2][0] - L, knots[knots.length - 2][1]], [knots[knots.length - 1][0] - L, knots[knots.length - 1][1]], ...knots, [knots[0][0] + L, knots[0][1]], [knots[1][0] + L, knots[1][1]]];
  // monotone cubic (Fritsch-Carlson): slopes at the knots that keep every stretch between its two heights
  const n = K.length, sl = new Float64Array(n), del = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) del[i] = (K[i + 1][1] - K[i][1]) / Math.max(1e-6, K[i + 1][0] - K[i][0]);
  for (let i = 0; i < n; i++) {
    if (i === 0) sl[i] = del[0]; else if (i === n - 1) sl[i] = del[n - 2];
    else sl[i] = del[i - 1] * del[i] <= 0 ? 0 : (del[i - 1] + del[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (del[i] === 0) { sl[i] = sl[i + 1] = 0; continue; }
    const a = sl[i] / del[i], b = sl[i + 1] / del[i], m = a * a + b * b;
    if (m > 9) { const t = 3 / Math.sqrt(m); sl[i] = t * a * del[i]; sl[i + 1] = t * b * del[i]; }
  }
  const h = new Float32Array(N), gr = new Float32Array(N);
  let k = 0;
  for (let i = 0; i < N; i++) {
    const s = i * STEP;
    while (k < n - 2 && K[k + 1][0] <= s) k++;
    const s0 = K[k][0], s1 = K[k + 1][0], dx = Math.max(1e-6, s1 - s0), t = clamp((s - s0) / dx, 0, 1);
    const h00 = 2 * t ** 3 - 3 * t * t + 1, h10 = t ** 3 - 2 * t * t + t, h01 = -2 * t ** 3 + 3 * t * t, h11 = t ** 3 - t * t;
    h[i] = h00 * K[k][1] + h10 * dx * sl[k] + h01 * K[k + 1][1] + h11 * dx * sl[k + 1];
    const d00 = (6 * t * t - 6 * t) / dx, d10 = 3 * t * t - 4 * t + 1, d01 = (-6 * t * t + 6 * t) / dx, d11 = 3 * t * t - 2 * t;
    gr[i] = d00 * K[k][1] + d10 * sl[k] + d01 * K[k + 1][1] + d11 * sl[k + 1];
  }
  let lo = 1e9, hi = -1e9; for (let i = 0; i < N; i++) { lo = Math.min(lo, h[i]); hi = Math.max(hi, h[i]); }
  return { h, gr, lo, hi };
}

const idx = (T, s) => Math.min(Math.floor(wrapS(T, s) / STEP), T.N - 1);
// the road's height and grade (rise per unit along the road) at s on route T: 0 on a flat track
export const elevAt = (T, s) => { const E = T.mech && T.mech.elev; return E ? E.h[idx(T, s)] : 0; };
export const gradeAt = (T, s) => { const E = T.mech && T.mech.elev; return E ? E.gr[idx(T, s)] : 0; };
// the top speed you settle at here, as a multiple of your own (race.js)
export const elevTop = c => clamp(1 - K_TOP * gradeAt(c.T, c.s), TOP_MIN, TOP_MAX);

// gravity along the road, once a frame (after the car has moved). Not in the air (a flight keeps its speed), and not
// while something else holds the kart's speed (fast-forward, overclock, frozen, bubbled, squashed flat).
export function elevCar(c, dt) {
  if (!c.T.mech.elev || c.air > 0 || c.ff > 0 || (c.oc > 0 && c.ocT) || c.frozen > 0 || c.bubbled > 0 || c.pinned > 0) return;
  c.speed = Math.max(0, c.speed - G_SLOPE * gradeAt(c.T, c.s) * dt);
}
