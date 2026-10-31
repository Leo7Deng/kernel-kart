// Earthy 3D bits Gopher's and Ferris's Fight moves share (on prop3d.js's kit); meshes are pure maths, baked per fight.
//   lumpHalf   a jittered low-poly lump cut flat at the floor
//   bits       dust, sand: bit3/bits3 kinds
//   crumbs     floor decal: a strip of loose earth or sand with clods (states earth, sand), long along its heading
import { TAU, clamp } from '../core.js';
import * as M3 from './model3d.js';
import { defBit, defProp, facetTri } from './prop3d.js';

const { ball, hex, norm, cross, add, sub, scl, dot, MATTE, FACET } = M3;
export const H = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export const mixC = (a, b, t) => a.map((x, k) => x + (b[k] - x) * t);
export const mulC = (c, f) => c.map(x => clamp(x * f, 0, 1));
export const EARTH_D = hex('#4a2c15'), EARTH = hex('#6b4224'), EARTH_L = hex('#87582f'), DRY = hex('#9e6f3e');
export const SAND_D = hex('#b8955e'), SAND = hex('#d6ba86'), SAND_L = hex('#e9d6ad');
export const STONE = hex('#6f6457');
// earth by the facet's normal: dry and light on top, darker down its sides, now and then a stone
export const earthCol = (seed, stone = 0.08) => (n, c, i) => {
  const h = H(seed + i * 1.7);
  if (h < stone) return [mulC(STONE, 0.92 + 0.16 * H(seed + i)), FACET];
  const up = clamp(n[2], 0, 1);
  return [mulC(mixC(EARTH_D, up > 0.7 ? DRY : EARTH_L, up), 0.9 + 0.2 * H(seed + i * 3.1)), FACET];
};
export const sandCol = seed => (n, c, i) => [mulC(mixC(SAND_D, SAND_L, clamp(n[2], 0, 1)), 0.93 + 0.12 * H(seed + i * 2.3)), FACET];

// a jittered low-poly lump (facetBall's shape), its points below z0 pressed flat onto z0: it sits on the floor
export function lumpHalf(out, c, r, seed, nu, nv, jit, col, o = 1, z0 = 0) {
  const P = [];
  for (let i = 0; i <= nv; i++) {
    const row = [];
    for (let j = 0; j < nu; j++) {
      const th = Math.PI * i / nv, ph = TAU * (j + (i % 2) * 0.5) / nu, s = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
      const q = i === 0 || i === nv ? 1 + jit * (H(seed + i * 3.3) - 0.5) : 1 + jit * (H(seed + i * 31.7 + j * 7.3) - 0.5) * 2;
      row.push([c[0] + r[0] * s[0] * q, c[1] + r[1] * s[1] * q, Math.max(z0, c[2] + r[2] * s[2] * q)]);
    }
    P.push(row);
  }
  let f = 0;
  const mid = [c[0], c[1], Math.max(z0 + 0.1, c[2] + r[2] * 0.2)];
  const face = (a, b, d) => {
    if (a[2] <= z0 + 1e-4 && b[2] <= z0 + 1e-4 && d[2] <= z0 + 1e-4) return;   // (pressed flat under it: never seen)
    const cen = scl(add(add(a, b), d), 1 / 3); let n = norm(cross(sub(b, a), sub(d, a))); if (dot(n, sub(cen, mid)) < 0) n = scl(n, -1);
    const C = col(n, cen, f++), cc = Array.isArray(C[0]) ? C[0] : C, kk = Array.isArray(C[0]) ? C[1] : FACET;
    facetTri(out, a, b, d, cc, kk, o, mid);
  };
  for (let i = 0; i < nv; i++) for (let j = 0; j < nu; j++) {
    const a = P[i][j], b = P[i + 1][j], d = P[i + 1][(j + 1) % nu], e = P[i][(j + 1) % nu];
    if (i < nv - 1) face(a, b, d);
    if (i > 0) face(a, d, e);
  }
}

// ---------------------------------------------------------------- particles
const puffs = (col, n, seed) => () => { const out = []; for (let k = 0; k < n; k++) { const a = k / n * TAU, rr = k ? 2.6 : 0; ball(out, [Math.cos(a) * rr, Math.sin(a) * rr, k ? (H(k + seed) - 0.5) * 2 : 1], k ? 2.3 + H(k + seed + 1) : 3.2, mixC(col, [1, 1, 1], 0.12 * H(k + seed)), MATTE, 0.5, 12, 8); } return out; };
defBit('dust', { mesh: puffs(hex('#cbb594'), 5, 3), ink: '#8a7253', r0: 4.5 });
defBit('sand', { mesh: puffs(hex('#e2c996'), 5, 7), ink: '#9c7d48', r0: 4.5 });

// ---------------------------------------------------------------- loose earth on the floor
// a strip of loose earth (or sand) along +x: a faint low bank, a few clods lying on it (a decal: seen from above)
function crumbsMesh(state) {
  const out = [], sand = state === 'sand', col = sand ? sandCol : earthCol;
  lumpHalf(out, [0, 0, -0.6], [9, 4.2, 1.5], sand ? 4.4 : 2.2, 10, 3, 0.3, col(5), 0, 0);
  for (let k = 0; k < 6; k++) { const x = (H(k + 1) - 0.5) * 15, y = (H(k + 7) - 0.5) * 7, r = 1.1 + H(k + 3) * 1.4; lumpHalf(out, [x, y, 0.2], [r, r * 0.9, r * 0.75], 11 + k, 5, 3, 0.35, col(20 + k), 0.4, 0); }
  return out;
}
defProp('crumbs', { mesh: crumbsMesh, n: 12, sym: 2, decal: true, ink: '#4a3018', out: 0.4, r0: 9, states: ['earth', 'sand'] });
