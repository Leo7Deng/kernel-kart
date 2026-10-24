// Kernel Kart art: Moonshot's Hadley Rille (race-canyon.js): the road down the floor of a canyon cut into the plateau,
// seen from above in the Moon's low sun from the top left. Each wall rises from the road's edge to the rim: a wall
// that faces the sun (the one on the road's bottom-right side) bright, one that faces away dark blue-grey, shaded
// smoothly as the canyon turns; strata running along the faces, rubble and boulders at their foot, a pale lip along
// the rim; the shadow-side wall casts its shadow across part of the road. The walls fade out at the canyon's two ends,
// where the road comes up out of it. Baked (moonStatic, after the road). Classic Flat (bold()) in flat tones.
import { clamp, mulberry } from '../core.js';
import { trackSample } from '../geometry.js';
import { WALL } from '../race-canyon.js';
import { mix } from './paint.js';

const FACE = 120, TAPER = 300, STEPW = 10;   // how wide a wall looks from above (world units), how far its ends fade in, piece length
const SUN = [-Math.SQRT1_2, -Math.SQRT1_2];
export function canyonStatic(g, T, BD, D) {
  const L = T.mech.canyon; if (!L || !L.length) return;
  for (const z of L) {
    const a = z.s0 - TAPER * 0.6, b = z.s1 + TAPER * 0.6, k = s => clamp(Math.min(s - a, b - s) / TAPER, 0, 1), ease = x => x * x * (3 - 2 * x);
    const lit = (q, sd) => -sd * (q.nx * SUN[0] + q.ny * SUN[1]);   // (the face looks back into the canyon: -sd·n; +1 square to the sun)
    // the shadow-side wall's shadow across the road (under the walls, so their foot covers its edge)
    for (let s = a; s < b; s += STEPW) {
      const q = trackSample(T, s), q2 = trackSample(T, s + STEPW + 1), f = ease(k(s));
      for (const sd of [-1, 1]) {
        const l = lit(q, sd); if (l > -0.05) continue;
        const w0 = sd * (q.hw + WALL), w1 = sd * (q.hw - q.hw * 0.6 * -l * f);
        g.fillStyle = `rgba(24,26,52,${(BD ? 0.3 : 0.34) * f})`; quad(g, q, q2, w0, w1); g.fill();
      }
    }
    // the faces, piece by piece, shaded by which way each faces
    for (let s = a; s < b; s += STEPW) {
      const q = trackSample(T, s), q2 = trackSample(T, s + STEPW + 1), f = ease(k(s)); if (f <= 0.01) continue;
      for (const sd of [-1, 1]) {
        const l = lit(q, sd), w0 = sd * (q.hw + WALL - 2), w1 = sd * Math.min(q.hw + WALL + FACE * f, reach(q, q2, sd));
        const col = l > 0 ? mix(BD ? '#b9b2a4' : '#b7b0a2', BD ? '#f6f1e7' : '#faf6ed', Math.min(1, l * 1.3)) : mix(BD ? '#b9b2a4' : '#b7b0a2', BD ? '#2b2d44' : '#24263c', Math.min(1, -l * 1.3));
        g.fillStyle = col; quad(g, q, q2, w0, w1); g.fill();
      }
    }
    // strata along the faces (pale on a face in shadow, dark on one in the sun), the rubble along each wall's foot, and
    // the rim's pale lip
    if (!BD || D > 0.5) for (const sd of [-1, 1]) for (const [u, w] of [[0.28, 3], [0.5, 2.5], [0.74, 3]]) {
      for (let s = a; s < b; s += STEPW * 2) {
        const q = trackSample(T, s), q2 = trackSample(T, s + STEPW * 2 + 1), f = ease(k(s)), l = lit(q, sd); if (f < 0.05) continue;
        const o = x => sd * Math.min(q.hw + WALL + FACE * f * u + Math.sin(x * 0.013 + u * 9) * 5 * f, reach(q, q2, sd));
        g.strokeStyle = l < 0 ? `rgba(255,255,250,${0.12 * Math.min(1, -l * 2)})` : `rgba(40,36,50,${0.1 + 0.08 * l})`; g.lineWidth = w;
        g.beginPath(); g.moveTo(q.x + q.nx * o(s), q.y + q.ny * o(s)); g.lineTo(q2.x + q2.nx * o(s + STEPW * 2), q2.y + q2.ny * o(s + STEPW * 2)); g.stroke();
      }
    }
    for (const sd of [-1, 1]) for (const [u, w, c] of [[0, 7, BD ? '#8f8a82' : 'rgba(150,144,134,0.95)'], [1, 5, BD ? '#f6f2ea' : 'rgba(255,253,246,0.9)']]) {
      g.strokeStyle = c; g.lineWidth = w; g.beginPath();
      for (let s = a, i = 0; s <= b; s += STEPW * 2, i++) { const q = trackSample(T, s), f = ease(k(s)), o = sd * Math.min(q.hw + WALL + (u ? FACE * f : 0), reach(q, q, sd)); i ? g.lineTo(q.x + q.nx * o, q.y + q.ny * o) : g.moveTo(q.x + q.nx * o, q.y + q.ny * o); }
      g.stroke();
    }
    // rubble at the walls' foot, boulders on the slope
    const rng = mulberry(Math.round(z.s0));
    for (let s = a + 40; s < b - 40; s += 26 + rng() * 30) {
      const q = trackSample(T, s), f = ease(k(s)); if (f < 0.3) continue;
      for (const sd of [-1, 1]) {
        if (rng() < 0.35) continue;
        const o = sd * (q.hw + WALL + 6 + rng() * FACE * 0.5 * f), r = 3 + rng() * (rng() < 0.2 ? 11 : 5), x = q.x + q.nx * o, y = q.y + q.ny * o;
        g.fillStyle = 'rgba(22,22,44,0.3)'; g.beginPath(); g.ellipse(x + r * 0.7, y + r * 0.8, r, r * 0.8, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = BD ? '#b3ada1' : '#bdb7ab'; g.beginPath(); g.ellipse(x, y, r, r * 0.85, rng() * 3, 0, Math.PI * 2); g.fill();
        if (!BD) { g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2); g.fill(); }
      }
    }
  }
}
// how far out a wall can reach on side sd here: on the inside of a bend no further than its middle (or it folds over)
const reach = (q, q2, sd) => { const k = Math.max(q.k * sd, q2.k * sd); return k > 1e-4 ? 0.8 / k : 1e4; };
// the quad between two samples, from lat w0 to w1
function quad(g, q, q2, w0, w1) {
  g.beginPath(); g.moveTo(q.x + q.nx * w0, q.y + q.ny * w0); g.lineTo(q2.x + q2.nx * w0, q2.y + q2.ny * w0); g.lineTo(q2.x + q2.nx * w1, q2.y + q2.ny * w1); g.lineTo(q.x + q.nx * w1, q.y + q.ny * w1); g.closePath();
}
