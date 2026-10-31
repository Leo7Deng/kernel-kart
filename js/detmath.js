// @ts-check
// Deterministic maths for the race: the same bits on every computer.
// The engine's sin/cos/exp/log/atan2/pow can differ in the last bit between chips, which forks a race; + - * / and sqrt
// are exact everywhere, so these fdlibm/musl ports built only on them match bit for bit. Gameplay imports this as
// `Math`; drawing keeps the engine's. test/determinism.test.mjs checks the imports and that nothing uses `**`.
const M = globalThis.Math;

// ---- sin / cos (musl __sin, __cos, __rem_pio2 medium path, three rounds always) ----
const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
  S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
  C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
function ksin(x, y, iy) {
  const z = x * x, w = z * z, r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6), v = z * x;
  return iy === 0 ? x + v * (S1 + z * r) : x - ((z * (0.5 * y - v * r) - y) - v * S1);
}
function kcos(x, y) {
  const z = x * x, w = z * z, r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6)), hz = 0.5 * z, u = 1.0 - hz;
  return u + (((1.0 - u) - hz) + (z * r - x * y));
}
const TOINT = 6755399441055744, INVPIO2 = 6.36619772367581382433e-01,
  PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11,
  PIO2_2 = 6.07710050630396597660e-11, PIO2_2T = 2.02226624879595063154e-21,
  PIO2_3 = 2.02226624871116645580e-21, PIO2_3T = 8.47842766036889956997e-32;
let RY0 = 0, RY1 = 0;   // the reduced argument, head and tail
// x = n·π/2 + (RY0 + RY1), |RY0| <= ~π/4. Exact to ~150 bits for |x| < 2^20·π/2.
function rem(x) {
  if (x > 1647099 || x < -1647099) x %= 6.283185307179586;   // (huge: an exact remainder by the double 2π first; less accurate, never in a race)
  const fn = (x * INVPIO2 + TOINT) - TOINT, n = fn | 0;
  let r = x - fn * PIO2_1, w = fn * PIO2_1T, t;
  t = r; w = fn * PIO2_2; r = t - w; w = fn * PIO2_2T - ((t - r) - w);
  t = r; w = fn * PIO2_3; r = t - w; w = fn * PIO2_3T - ((t - r) - w);
  RY0 = r - w; RY1 = (r - RY0) - w;
  return n;
}
const PIO4 = 0.7853981633974483;
export function sin(x) {
  const a = x < 0 ? -x : x;
  if (a <= PIO4) return a < 7.450580596923828e-9 ? x : ksin(x, 0, 0);
  if (!(a < Infinity)) return NaN;
  const n = rem(x) & 3;
  return n === 0 ? ksin(RY0, RY1, 1) : n === 1 ? kcos(RY0, RY1) : n === 2 ? -ksin(RY0, RY1, 1) : -kcos(RY0, RY1);
}
export function cos(x) {
  const a = x < 0 ? -x : x;
  if (a <= PIO4) return a < 1.4901161193847656e-8 ? 1 : kcos(x, 0);
  if (!(a < Infinity)) return NaN;
  const n = rem(x) & 3;
  return n === 0 ? kcos(RY0, RY1) : n === 1 ? -ksin(RY0, RY1, 1) : n === 2 ? -kcos(RY0, RY1) : ksin(RY0, RY1, 1);
}
export const tan = x => sin(x) / cos(x);

// ---- exp (fdlibm e_exp.c) ----
const P2 = new Float64Array(2200);   // 2^k for k in -1100..1099, built by exact doubling and halving
{ P2[1100] = 1; for (let k = 1; k < 1100; k++) { P2[1100 + k] = P2[1099 + k] * 2; P2[1100 - k] = P2[1101 - k] * 0.5; } }
const pow2 = k => P2[1100 + k];
const LN2HI = 6.93147180369123816490e-01, LN2LO = 1.90821492927058770002e-10, INVLN2 = 1.44269504088896338700e+00,
  E1 = 1.66666666666666019037e-01, E2 = -2.77777777770155933842e-03, E3 = 6.61375632143793436117e-05,
  E4 = -1.65339022054652515390e-06, E5 = 4.13813679705723846039e-08;
export function exp(x) {
  if (x !== x) return NaN;
  if (x > 709.782712893383973096) return Infinity;
  if (x < -745.13321910194110842) return 0;
  const a = x < 0 ? -x : x;
  let hi, lo = 0, k = 0;
  if (a > 0.34657359027997264) {   // ln2/2
    k = a < 1.0397207708399179 ? (x < 0 ? -1 : 1) : M.trunc(INVLN2 * x + (x < 0 ? -0.5 : 0.5));
    hi = x - k * LN2HI; lo = k * LN2LO; x = hi - lo;
  } else if (a > 3.725290298461914e-9) hi = x;
  else return 1 + x;
  const xx = x * x, c = x - xx * (E1 + xx * (E2 + xx * (E3 + xx * (E4 + xx * E5)))), y = 1 + (x * c / (2 - c) - lo + hi);
  if (k === 0) return y;
  if (k > 1023) return y * 2 * pow2(k - 1);
  if (k < -1021) return y * pow2(k + 54) * pow2(-54);
  return y * pow2(k);
}

// ---- log (fdlibm e_log.c), needs the float's bits ----
const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer), HI = new Uint8Array(new Uint16Array([1]).buffer)[0] ? 1 : 0, LO = 1 - HI;
const Lg1 = 6.666666666666735130e-01, Lg2 = 3.999999999940941908e-01, Lg3 = 2.857142874366239149e-01, Lg4 = 2.222219843214978396e-01,
  Lg5 = 1.818357216161805012e-01, Lg6 = 1.531383769920937332e-01, Lg7 = 1.479819860511658591e-01;
export function log(x) {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return x;
  if (x === 1) return 0;
  let k = 0;
  if (x < 2.2250738585072014e-308) { k = -54; x *= 18014398509481984; }   // subnormal: scale up by 2^54
  F64[0] = x; let hx = U32[HI];
  hx += 0x3ff00000 - 0x3fe6a09e; k += (hx >>> 20) - 0x3ff; hx = (hx & 0x000fffff) + 0x3fe6a09e;
  U32[HI] = hx; x = F64[0];
  const f = x - 1.0, hfsq = 0.5 * f * f, s = f / (2.0 + f), z = s * s, w = z * z,
    t1 = w * (Lg2 + w * (Lg4 + w * Lg6)), t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7))), R = t2 + t1;
  return s * (hfsq + R) + k * LN2LO - hfsq + f + k * LN2HI;
}
export const log2 = x => log(x) / M.LN2;
export const log10 = x => log(x) / M.LN10;

// ---- atan, atan2 (fdlibm s_atan.c, e_atan2.c) ----
const ATANHI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00],
  ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17],
  AT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
    9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
    4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02];
export function atan(x) {
  if (x !== x) return NaN;
  const neg = x < 0; let a = neg ? -x : x, id;
  if (a >= 7.378697629483821e19) return neg ? -(ATANHI[3] + ATANLO[3]) : ATANHI[3] + ATANLO[3];   // 2^66
  if (a < 0.4375) { if (a < 7.450580596923828e-9) return x; id = -1; a = x; }
  else if (a < 1.1875) { if (a < 0.6875) { id = 0; a = (2.0 * a - 1.0) / (2.0 + a); } else { id = 1; a = (a - 1.0) / (a + 1.0); } }
  else if (a < 2.4375) { id = 2; a = (a - 1.5) / (1.0 + 1.5 * a); }
  else { id = 3; a = -1.0 / a; }
  const z = a * a, w = z * z,
    s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10]))))),
    s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) return a - a * (s1 + s2);
  const r = ATANHI[id] - ((a * (s1 + s2) - ATANLO[id]) - a);
  return neg ? -r : r;
}
const PI = 3.1415926535897931160E+00, PI_LO = 1.2246467991473531772E-16, PI_O_2 = 1.5707963267948965580E+00, PI_O_4 = 7.8539816339744827900E-01;
const negZ = v => v < 0 || (v === 0 && 1 / v < 0);
export function atan2(y, x) {
  if (x !== x || y !== y) return NaN;
  if (x === 1) return atan(y);
  const m = (negZ(y) ? 1 : 0) | (negZ(x) ? 2 : 0);
  if (y === 0) return m < 2 ? y : m === 2 ? PI : -PI;
  if (x === 0) return m & 1 ? -PI_O_2 : PI_O_2;
  if (x === Infinity || x === -Infinity) {
    if (y === Infinity || y === -Infinity) return [PI_O_4, -PI_O_4, 3 * PI_O_4, -3 * PI_O_4][m];
    return [0, -0, PI, -PI][m];
  }
  if (y === Infinity || y === -Infinity) return m & 1 ? -PI_O_2 : PI_O_2;
  const q = y / x, aq = q < 0 ? -q : q;
  let z;
  if (aq > 1.152921504606847e18) { z = PI_O_2 + 0.5 * PI_LO; return m & 1 ? -z : z; }   // |y/x| > 2^60
  if (m & 2 && aq < 8.673617379884035e-19) z = 0;   // |y/x| < 2^-60, x < 0
  else z = atan(aq);
  return m === 0 ? z : m === 1 ? -z : m === 2 ? PI - (z - PI_LO) : (z - PI_LO) - PI;
}
const sq1 = x => M.sqrt((1 - x) * (1 + x));
export const asin = x => atan2(x, sq1(x));
export const acos = x => atan2(sq1(x), x);

// ---- pow: whole powers by squaring, the rest through exp and log ----
export function pow(x, y) {
  if (y === 2) return x * x;
  if (y === 0) return 1;
  if (x !== x || y !== y) return NaN;
  if (y === M.trunc(y) && y >= -64 && y <= 64) {
    let n = y < 0 ? -y : y, b = x, r = 1;
    while (n) { if (n & 1) r *= b; n >>= 1; if (n) b *= b; }
    return y < 0 ? 1 / r : r;
  }
  if (x > 0) return x === Infinity ? (y > 0 ? Infinity : 0) : exp(y * log(x));
  if (x === 0) return y > 0 ? 0 : Infinity;
  const odd = y === M.trunc(y) && M.abs(y % 2) === 1;
  if (y !== M.trunc(y)) return NaN;   // a negative number to a fraction
  const r = pow(-x, y); return odd ? -r : r;
}

// ---- hypot: plain sqrt of the sum (V8's is its own algorithm, which could change between versions) ----
export function hypot(a, b, c) {
  if (c === undefined) return M.sqrt(a * a + b * b);
  if (arguments.length === 3) return M.sqrt(a * a + b * b + c * c);
  let s = 0; for (let i = 0; i < arguments.length; i++) s += arguments[i] * arguments[i];
  return M.sqrt(s);
}

// The `Math` gameplay sees: the engine's exact functions, these for the rest. random goes through the global one at
// call time (the tests swap it for a seeded generator). cbrt, sinh, cosh, tanh... aren't here: add them before use.
export const DMath = Object.freeze({
  PI: M.PI, E: M.E, LN2: M.LN2, LN10: M.LN10, LOG2E: M.LOG2E, LOG10E: M.LOG10E, SQRT2: M.SQRT2, SQRT1_2: M.SQRT1_2,
  abs: M.abs, floor: M.floor, ceil: M.ceil, round: M.round, trunc: M.trunc, sign: M.sign, min: M.min, max: M.max,
  sqrt: M.sqrt, fround: M.fround, imul: M.imul, clz32: M.clz32, random: () => M.random(),
  sin, cos, tan, asin, acos, atan, atan2, exp, log, log2, log10, pow, hypot,
});
export { DMath as Math };
