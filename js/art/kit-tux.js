// Tux's Fight art (sim: js/kits/tux.js). Classic Flat first; tells part of the world. 3D props baked per fight
// (propsFor): his frozen fish (straight, bent, iced), the ice armour (back half before him, see-through front half over
// him, cracked once hit), the ice prow it becomes on a slide, and the crust his fish leaves; 2D stand-ins while baking.
//   Frozen Fish  whipped out over his shoulder, one fast sweep, a squashed white star on a hit; two in a row and it glints
//                and steams (the wallop's coming); the wallop: raised overhead, clubbed down, it bends and hangs dizzy-eyed
//   Belly Slide  hop and flop, snow sprayed off both sides, a frost streak behind (riding an old one is quicker: speed
//                lines); armoured, an ice prow ploughs through
//   Ice Armour   frost spreads round his feet and ice grows up him; set: a sparkle; hits chip and crack it; running out
//                it drips and flickers, then bursts in shards
//   Snow Dive    a dive into a puff of snow, a bump runs along under it, he pops up shaking it off (heaps left each end)
// All his sounds are synthesised here (sounds); the hit's own thump is fight-ui.js's.
import { TAU, clamp, frnd } from '../core.js';
import { BK, bold } from '../look.js';
import * as M3 from './model3d.js';
import { animBase, settleAnim } from './kits.js';
import { bit3, bits3, defProp, drawProp3D, facetBall, facetTri, propReady, propsFor } from './prop3d.js';
import { glow } from './kit3-light.js';
import { softShadow } from './arena-mat.js';

const ID = 'tux';
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const backE = k => { k = clamp(k, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const spring = (k, w, d) => Math.exp(-k * d) * Math.cos(k * w);
const bump = u => Math.sin(Math.PI * clamp(u, 0, 1));
const lerp = (a, b, k) => a + (b - a) * k;
const hsh = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }
const D3 = 0.47;   // (depth on the floor as it shows on the models, seen from 28°)
const SC = 1.25;   // (the fighters' models: world units a model unit, draw-fight.js SCALE; the armour and the crust are built in his model's units)
const { hex, ellipsoid, ball, tube, sweep, add, sub, scl, norm, cross, MATTE, GLOSS, FACET, ICE, STRIDE } = M3;
const mixC = (a, b, t) => a.map((x, k) => x + (b[k] - x) * t);
const mulC = (c, f) => c.map(x => clamp(x * f, 0, 1));

// ---------------------------------------------------------------- the 3D props (world units; x forward, z up)
const ICE_LO = hex('#3d8fd0'), ICE_HI = hex('#a8e2fb'), SNOW = hex('#f6faff'), SNOW2 = hex('#e1edf8');
const iceCol = (z, h) => mulC(mixC(ICE_LO, ICE_HI, clamp(z, 0, 1)), 0.92 + 0.16 * h);
// the frozen fish (a mackerel, ~28 long, held by the tail at the origin, along +x): blue barred back, silver flanks, big
// surprised eye and round mouth, frost and icicles. States: raw; bent (eyes to crosses); ice, bentice (in his armour)
function fishMesh(st) {
  const out = [], bent = st.startsWith('bent'), iced = st.endsWith('ice'), t = c => iced ? mixC(c, hex('#cfeeff'), 0.35) : c;
  const BACK = t(hex('#3f6688')), BAR = t(hex('#2b4a68')), FLANK = t(hex('#b9c9d8')), BELLY = t(hex('#f1f5f8')), FIN = t(hex('#5d82a8'));
  const N = 14, spine = Array.from({ length: N }, (_, i) => [2 + 23 * i / (N - 1), 0, 0.6 * Math.sin(Math.PI * i / (N - 1))]);
  const rh = s => 1.4 + 4.6 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.08 + 0.02)), 0.8) * (s > 0.8 ? 1 - (s - 0.8) * 1.2 : 1);
  sweep(out, spine, s => rh(s) * 0.52, rh, [0, 0, 1], (i, n) => n[2] > 0.42 ? (i % 3 === 1 && i > 2 && i < N - 3 ? BAR : BACK) : n[2] < -0.4 ? BELLY : FLANK, GLOSS, 1, 14);
  // the forked tail: two flat lobes in a V, its root where he holds it
  for (const s of [-1, 1]) { const d = norm([-1, 0, s * 0.85]); ellipsoid(out, add([1.5, 0, 0], scl(d, 3.4)), [scl(d, 3.6), [0, 0.45, 0], scl(norm([s * 0.85, 0, 1]), 1.9)], FIN, MATTE, 14, 8); }
  ellipsoid(out, [12.5, 0, 5.4], [[5, 0, 0.9], [0, 0.5, 0], [-0.9, 0, 2.3]], FIN, MATTE, 14, 8);   // the dorsal fin
  ellipsoid(out, [6.5, 0, 2.6], [[2.4, 0, 0.6], [0, 0.4, 0], [-0.5, 0, 1.3]], FIN, MATTE, 12, 8);   // a little one behind it
  for (const s of [-1, 1]) ellipsoid(out, [17.5, s * 2.5, -1.4], [[2.6, 0, -0.6], [0, 0.4, s * 0.6], [0.4, 0, 1.4]], FIN, MATTE, 12, 8);   // side fins
  ellipsoid(out, [6, 0, -2.6], [[2.4, 0, -0.4], [0, 0.4, 0], [0.4, 0, 1.2]], FIN, MATTE, 12, 8);   // under it
  // the eyes: big and round, a tiny pupil (bent: two little crossed bars instead)
  for (const s of [-1, 1]) {
    ellipsoid(out, [20.6, s * 2.05, 1.5], [[1.9, 0, 0], [0, 0.9, 0], [0, 0, 1.9]], hex('#ffffff'), GLOSS, 16, 10);
    if (!bent) ball(out, [21.1, s * 2.85, 1.5], 0.7, hex('#14181f'), GLOSS, 0, 10, 7);
    else for (const q of [-1, 1]) tube(out, [[20.3, s * 2.9, 1.5 - q * 0.9], [21.9, s * 2.9, 1.5 + q * 0.9]], 0.28, hex('#14181f'), MATTE, 0, 6);
  }
  ellipsoid(out, [24.6, 0, -0.4], [[0.9, 0, 0], [0, 1.25, 0], [0, 0, 1.15]], hex('#5a2a36'), MATTE, 12, 8, 0);   // the gaping mouth
  ellipsoid(out, [23.8, 0, -0.4], [[1.2, 0, 0], [0, 1.6, 0], [0, 0, 1.6]], t(hex('#a9bccd')), GLOSS, 14, 8);    // its lips
  // frost on its back and a few icicles off its belly
  for (let k = 0; k < (iced ? 9 : 5); k++) { const x = 6 + k * (iced ? 2.2 : 3.6), z = rh((x - 2) / 23) * 0.92; facetBall(out, [x, (hsh(k) - 0.5) * 1.6, z], [1.1 + hsh(k + 3) * 0.7, 0.9, 0.55], 30 + k, 5, 3, 0.35, () => mixC(SNOW, SNOW2, hsh(k + 7)), FACET, 0.5); }
  for (let k = 0; k < 3; k++) { const x = 9 + k * 4.5, z = -rh((x - 2) / 23) * 0.95; tube(out, [[x, 0, z + 0.4], [x + 0.3, 0, z - 1.6 - hsh(k) * 1.2]], s => 0.55 * (1 - s) + 0.08, mixC(hex('#cdeeff'), SNOW, 0.4), GLOSS, 0.4, 6); }
  if (iced) for (let k = 0; k < 4; k++) {   // ice crystals crusted along its back, pointing up and back
    const x = 7 + k * 4.4, z = rh((x - 2) / 23) * 0.9, d = norm([-0.35, (hsh(k + 9) - 0.5) * 0.5, 1]), L = 3.2 + hsh(k + 2) * 1.6;
    crystal(out, [x, 0, z - 0.4], d, L, 1.1, 40 + k);
  }
  if (bent) bendX(out, 0, 11, 0.55);
  return out;
}
// a short six-sided ice crystal from base along d (length L, half-width w), pointed at its tip
function crystal(out, base, d, L, w, seed) {
  d = norm(d); const u = norm(cross(d, Math.abs(d[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1])), v = cross(d, u), mid = add(base, scl(d, L * 0.62)), tip = add(base, scl(d, L));
  const ring = (c, r) => Array.from({ length: 6 }, (_, m) => { const a = m * TAU / 6 + seed; return add(c, add(scl(u, Math.cos(a) * r), scl(v, Math.sin(a) * r))); });
  const r0 = ring(base, w * 0.85), r1 = ring(mid, w), ctr = add(base, scl(d, L * 0.4));
  for (let m = 0; m < 6; m++) {
    const k = (m + 1) % 6, h = hsh(seed + m * 3.1);
    facetTri(out, r0[m], r0[k], r1[k], iceCol(0.35, h), ICE, 1, ctr); facetTri(out, r0[m], r1[k], r1[m], iceCol(0.4, h), ICE, 1, ctr);
    facetTri(out, r1[m], r1[k], tip, iceCol(0.75 + 0.2 * hsh(seed + m), h), ICE, 1, ctr);
  }
}
// bend a mesh (from vertex i0 on) in the x-z plane past x0: downward, up to a radians a span past it
function bendX(out, i0, x0, a, span = 7) {
  for (let i = i0; i < out.length; i += STRIDE) {
    const x = out[i], q = clamp((x - x0) / span, 0, 1); if (q <= 0) continue;
    const th = -a * q * q * (3 - 2 * q), c = Math.cos(th), s = Math.sin(th), px = x - x0, pz = out[i + 2];
    out[i] = x0 + px * c - pz * s; out[i + 2] = px * s + pz * c;
    const nx = out[i + 3], nz = out[i + 5]; out[i + 3] = nx * c - nz * s; out[i + 5] = nx * s + nz * c;
    if (out[i + 9] > 6.5) { const ex = out[i + 10], ez = out[i + 12]; out[i + 10] = ex * c - ez * s; out[i + 12] = ex * s + ez * c; }
  }
}
// Tux's own outline (his model's lathe, model3d.js tuxPosed, stood on his legs): its half width at height z
const TUX_PROF = [[0, 0], [9.1, 11], [11.5, 16.4], [18.5, 18.8], [25.5, 18.2], [34.5, 15.2], [42.5, 12.6], [49.5, 11], [54.5, 8], [57.3, 4], [57.9, 0]];
const profW = z => { for (let i = 0; i < TUX_PROF.length - 1; i++) { const [z0, w0] = TUX_PROF[i], [z1, w1] = TUX_PROF[i + 1]; if (z <= z1) return w0 + (w1 - w0) * clamp((z - z0) / (z1 - z0), 0, 1); } return 0; };
// the ice armour round him (baked once; it's round, so it faces you any way he turns): panelled cuirass, domed helmet
// with an open visor, spiked pauldrons, a skirt. States: half (b behind him, f in front) and wholeness (2 whole, 1 cracked)
function armorMesh(st) {
  const out = [], back = st[0] === 'b', whole = st[1] !== '1', gone = new Set(whole ? [] : [2, 9, 13]);
  // the cuirass: two rows of big panels round him, from his hips to his shoulders, pushed out a touch at their middles
  const COLS = 9, ROWS = [[12, 25.5], [25.5, 39]];
  let id = 0;
  for (const [z0, z1] of ROWS) for (let c = 0; c < COLS; c++, id++) {
    if (gone.has(id)) continue;
    const a0 = (c + 0.06) / COLS * TAU + (z0 / 9) * 0.26, a1 = (c + 0.94) / COLS * TAU + (z0 / 9) * 0.26, zz0 = z0 + 0.5, zz1 = z1 - 0.5;
    const P = (a, z, out2 = 0) => { const r = profW(z) + 4 + out2; return [Math.cos(a) * r, Math.sin(a) * r, z]; };
    const am = (a0 + a1) / 2, zm = (zz0 + zz1) / 2, ctr = [0, 0, zm], m = P(am, zm, 3.2), h = hsh(id * 1.7);
    const q = [P(a0, zz0), P(a1, zz0), P(a1, zz1), P(a0, zz1)];
    for (let k = 0; k < 4; k++) facetTri(out, q[k], q[(k + 1) % 4], m, iceCol(0.45 + 0.35 * (k === 2 ? 1 : k === 0 ? 0 : 0.5) + 0.1 * h, h), ICE, 1, ctr);
  }
  // the skirt round his legs: a ring of chunky lumps
  for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + 0.3, r = 17; facetBall(out, [Math.cos(a) * r, Math.sin(a) * r, 8], [6.8, 6.8, 5], 60 + k, 4, 3, 0.3, (n, c, i) => [n[2] > 0.6 && hsh(k + i) < 0.5 ? SNOW : iceCol(0.5 + 0.4 * hsh(k + i), hsh(i)), n[2] > 0.6 ? FACET : ICE], ICE, 0.8); }
  // the helmet: a faceted dome over his head, its visor cut open over his face (the front, at eye height)
  const H0 = [];
  facetBall(H0, [0, 0, 49], [15.5, 15.5, 12.5], 77, 8, 5, 0.06, (n, c) => [c[2] > 56.5 ? mixC(SNOW, iceCol(0.9, 0.5), 0.3) : iceCol(0.55 + 0.4 * clamp((c[2] - 40) / 20, 0, 1), hsh(c[0] * 0.7)), ICE], ICE);
  for (let i = 0; i < H0.length; i += STRIDE * 3) {
    const cx = (H0[i] + H0[i + STRIDE] + H0[i + STRIDE * 2]) / 3, cy = (H0[i + 1] + H0[i + 1 + STRIDE] + H0[i + 1 + STRIDE * 2]) / 3, cz = (H0[i + 2] + H0[i + 2 + STRIDE] + H0[i + 2 + STRIDE * 2]) / 3;
    if (cy < -5 && cz > 43 && cz < 54 && Math.abs(cx) < 9.5) continue;   // (the visor, over his eyes)
    if (cz < 40) continue;   // (inside his body)
    for (let k = 0; k < STRIDE * 3; k++) out.push(H0[i + k]);
  }
  crystal(out, [0, 2, 59], [0, 0.35, 1], 9, 2.2, 3.1);   // the crest
  crystal(out, [-4.5, 2.5, 58], [-0.5, 0.35, 1], 6, 1.6, 4.2);
  if (whole) crystal(out, [4.5, 2.5, 58], [0.5, 0.35, 1], 6, 1.6, 5.3);
  // the pauldrons: chunky lumps on his shoulders (screen left and right), a spike up and out of each
  for (const s of whole ? [-1, 1] : [-1]) {
    facetBall(out, [s * 19.5, 0, 39], [7.6, 7.2, 6.2], 90 + s, 7, 4, 0.22, (n, c, i) => [n[2] > 0.55 && hsh(i) < 0.6 ? SNOW : iceCol(0.5 + 0.35 * hsh(i * 2.1), hsh(i)), n[2] > 0.55 ? FACET : ICE], ICE);
    crystal(out, [s * 22, 0, 43], [s * 0.7, 0.1, 1], 8, 2, 7 + s);
  }
  // its half: the triangles behind him (model +y: up the screen, away) or in front
  const keep = [];
  for (let i = 0; i < out.length; i += STRIDE * 3) { const cy = (out[i + 1] + out[i + 1 + STRIDE] + out[i + 1 + STRIDE * 2]) / 3; if ((cy > 0) === back) for (let k = 0; k < STRIDE * 3; k++) keep.push(out[i + k]); }
  return keep;
}
// the armour while he slides: an icebreaker prow with two spikes along +x off his nose (his middle at the origin, lying)
function prowMesh() {
  const out = [], ctr = [30, 0, 7];
  const T = [43, 0, 6], U = [29, 0, 17], L = [28, -14, 4], R = [28, 14, 4], B = [30, 0, 0.5], BL = [26, -12, 0.5], BR = [26, 12, 0.5];
  const tri = (a, b, c, z) => facetTri(out, a, b, c, iceCol(z, hsh(a[0] + b[1] + c[2])), ICE, 1, ctr);
  tri(T, U, L, 0.85); tri(T, R, U, 0.8); tri(T, L, BL, 0.4); tri(T, BR, R, 0.38); tri(T, BL, B, 0.25); tri(T, B, BR, 0.22); tri(U, L, R, 0.9);
  crystal(out, [34, -6, 9], [0.6, -0.4, 0.7], 8, 1.8, 11); crystal(out, [34, 6, 9], [0.6, 0.4, 0.7], 8, 1.8, 13);
  facetBall(out, [29, 0, 16.5], [4, 6, 1.6], 21, 6, 3, 0.3, () => mixC(SNOW, SNOW2, 0.4), FACET, 0.6);   // (snow piled on its top)
  return out;
}
// the crust the armoured fish leaves on whoever it slaps: ice round their legs up to the middle, shards (b behind, f front)
function crustMesh(st) {
  const out = [], back = st === 'b';
  for (let k = 0; k < 11; k++) { const a = k / 11 * TAU + 0.2, r = 17 + hsh(k) * 3, z = 5 + (k % 3) * 7; facetBall(out, [Math.cos(a) * r, Math.sin(a) * r, z], [6.5, 6, 6 + hsh(k + 1) * 3], 120 + k, 6, 4, 0.3, (n, c, i) => [n[2] > 0.6 && hsh(i + k) < 0.5 ? SNOW : iceCol(0.45 + 0.45 * hsh(i * 1.3 + k), hsh(i)), n[2] > 0.6 ? FACET : ICE], ICE); }
  for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + 0.7, r = 19; crystal(out, [Math.cos(a) * r, Math.sin(a) * r, 18], [Math.cos(a) * 0.5, Math.sin(a) * 0.5, 1], 9 + hsh(k) * 4, 2.2, 140 + k); }
  const keep = [];
  for (let i = 0; i < out.length; i += STRIDE * 3) { const cy = (out[i + 1] + out[i + 1 + STRIDE] + out[i + 1 + STRIDE * 2]) / 3; if ((cy > 0) === back) for (let k = 0; k < STRIDE * 3; k++) keep.push(out[i + k]); }
  return keep;
}
const FISH_ST = ['raw', 'bent', 'ice', 'bentice'], ARM_ST = ['b2', 'f2', 'b1', 'f1'];
defProp('txfish', { mesh: fishMesh, n: 16, ink: '#1c3550', out: 0.5, ppu: 2.9, states: FISH_ST });   // (ppu scaled with FISH so it stays sharp)
defProp('txarmor', { mesh: armorMesh, n: 1, ink: '#245a86', out: 0.55, states: ARM_ST });
defProp('txprow', { mesh: prowMesh, n: 16, ink: '#245a86', out: 0.55 });
defProp('txcrust', { mesh: crustMesh, n: 1, ink: '#245a86', out: 0.55, states: ['b', 'f'] });
propsFor(ID, [...FISH_ST.map(s => 'txfish/' + s), ...ARM_ST.map(s => 'txarmor/' + s), 'txprow', 'txcrust/b', 'txcrust/f']);

// ---------------------------------------------------------------- where the fish is
// his right flipper's hand and the fish's direction in his own frame (fw forward, sd right, h up) per swing keyframe,
// blended by the move's phase
const K = {   // (where his flipper's tip is in each pose, model3d.js TUX_POSES: worked out from his flippers and the pose's lean)
  tuck: { p: [-10, 9, 24], d: [-0.15, 0.3, -1] },       // tucked behind his back, hanging down
  under: { p: [2, 19, 25], d: [0.92, 0.22, -0.3] },     // tucked under his flipper, its head poking out in front (a row going; carried after a slap)
  cock: { p: [-30, 22, 54], d: [-0.75, 0.3, 0.6] },     // whipped out, cocked well back over his shoulder (fishback)
  hit: { p: [29, 6, 34], d: [0.85, -0.5, -0.05] },      // the slap's contact, swept across his front (fishslap)
  thru: { p: [8, -24, 26], d: [-0.55, -0.85, -0.35] },  // the follow-through, wrapped right round to his left
  side: { p: [4, 24, 21], d: [0.2, 0.25, -1] },         // carried at his side, hanging down (stand)
  over: { p: [-20, 0, 60], d: [-0.75, 0, 0.66] },       // the wallop raised high overhead in both flippers, leaning back (walup)
  club: { p: [33, 0, 20], d: [0.6, 0, -0.8] },          // brought down on them (wallop)
  floor: { p: [30, 0, 12], d: [0.8, 0, -0.6] },         // into the floor (a wallop's miss) or held down after a hit
};
const blendK = (a, b, k) => ({ p: a.p.map((x, i) => lerp(x, b.p[i], k)), d: norm(a.d.map((x, i) => lerp(x, b.d[i], k))) });
// the fish now: { p, d (his frame), wob (rad, lag and flop), bent, behind (forced behind him), sq (hit squash), a } or null
function fishNow(F, f) {
  const k = f.pht || 0, ph = f.ph, M = f.stats.moves.move1, L = M.last;
  const wd = f.state === 'wind' ? Math.max(0.04, f.dur || M.startup) : M.startup;
  switch (ph) {
    case 'fishout': { const u = clamp(k / wd, 0, 1), q = u < 0.35 ? 0 : backE((u - 0.35) / 0.65); return { ...blendK(K.tuck, K.cock, q), wob: -0.25 * Math.sin(u * 9) * (1 - u), behind: true, bent: 0, sq: 0, a: clamp(u / 0.25, 0, 1) }; }
    case 'slap': { const u = f.hit && k < 0.02 ? 0 : clamp(k / M.active, 0, 1); return { ...blendK(K.hit, K.thru, ease(u)), wob: 0.45 * (1 - u), behind: false, bent: 0, sq: f.hit ? 0.35 : 0, a: 1 }; }   // (it's out at its contact at once, the swoosh smearing the swing from his shoulder: a hit in its first frame shows it there)
    case 'slapped': { const u = clamp(k / M.recovery, 0, 1); return { ...blendK(K.thru, K.under, ease(u)), wob: -0.5 * spring(k, 30, 8), bent: 0, sq: 0.3 * Math.exp(-k * 22), sc: lerp(1, UNDER_S, ease(u)), a: f.fishN > 0 ? 1 : 1 - clamp((u - 0.85) / 0.15, 0, 1) }; }
    case 'fishmiss': { const u = clamp(k / M.miss, 0, 1); return { ...blendK(K.thru, K.under, ease(u * 1.2)), wob: 0.75 * Math.sin(k * 21) * Math.exp(-k * 3.5), bent: 0, sq: 0, sc: lerp(1, UNDER_S, ease(u)), a: 1 - clamp((u - 0.85) / 0.15, 0, 1) }; }
    case 'walup': { const u = clamp(k / wd, 0, 1), q = backE(u); return { ...blendK(K.tuck, K.over, q), wob: 0.06 * Math.sin(k * 60) * u, behind: u < 0.3, bent: 0, sq: 0, a: clamp(u / 0.2, 0, 1), two: 1 }; }
    case 'wallop': { const u = f.hit ? 1 : 0.45 + 0.55 * clamp(k / L.active, 0, 1); return { ...blendK(K.over, K.club, ease(u)), wob: -0.35 * (1 - u), bent: f.hit ? 1 : 0, sq: f.hit ? 0.45 : 0, a: 1, two: 1 }; }
    case 'walloped': { const u = clamp(k / L.recovery, 0, 1); return { ...blendK(K.club, u < 0.6 ? K.floor : K.under, u < 0.6 ? ease(u / 0.6) * 0.5 : ease((u - 0.6) / 0.4)), wob: 0.4 * spring(k, 24, 6), bent: 1, sq: 0.35 * Math.exp(-k * 18), a: 1 - clamp((u - 0.8) / 0.2, 0, 1), two: u < 0.6 ? 1 : 0 }; }
    case 'walmiss': { const u = clamp(k / L.miss, 0, 1); return { ...blendK(K.club, u < 0.5 ? K.floor : K.under, u < 0.5 ? ease(u / 0.5) : ease((u - 0.5) / 0.5)), wob: 0.7 * Math.sin(k * 18) * Math.exp(-k * 3), bent: 0, sq: 0.4 * Math.exp(-Math.max(0, k - 0.05) * 16) * (k > 0.05 ? 1 : 0), a: 1 - clamp((u - 0.85) / 0.15, 0, 1), two: u < 0.4 ? 1 : 0 }; }
  }
  if (f.fishN > 0 && !f.move && ['idle', 'walk'].includes(f.state)) return { ...K.under, wob: Math.sin((f.walkDist || 0) * 0.12) * 0.08, behind: false, bent: 0, sq: 0, sc: UNDER_S, a: 1, peek: 1 };
  return null;
}
// a point of his frame on screen from his feet: [x, y, depth] (y up is minus, depth minus behind him); a is his drawn yaw
// (yawOf: turned toward the camera as draw-fight.js draws him, plus the move's spin)
const yawOf = (f, spin = 0) => f.face + 0.35 * Math.sin(Math.PI / 2 - f.face) + spin;
// heights foreshortened by the camera tilt like the models (model3d.js rotOf), or the fish floats above his flipper
const CE = Math.cos(M3.ELEV);
function onScreen(a, p) { const c = Math.cos(a), s = Math.sin(a), fy = (s * p[0] + c * p[1]) * SC; return [(c * p[0] - s * p[1]) * SC, fy * D3 - p[2] * SC * CE, fy]; }
function dirScreen(a, d) { const c = Math.cos(a), s = Math.sin(a); return [c * d[0] - s * d[1], (s * d[0] + c * d[1]) * D3 - d[2] * CE]; }
// the fish drawn at g's (0, 0) (his feet, anim offsets applied): the 3D one side-on along its screen angle. FISH: its
// drawn size, stand-in and swoosh arc too
const FISH = 2.1, UNDER_S = 0.72;   // (UNDER_S: tucked under his flipper, smaller)
// (A: his anim. The grip follows the model's lean and stretch as draw-fight.js draws it, or the fish slides off his flipper)
function drawFish(g, v, f, Fi, front, yaw, A) {
  let [hx, hy, depth] = onScreen(yaw, Fi.p);
  if (A) { const c = Math.cos(A.lean || 0), s = Math.sin(A.lean || 0), k = A.s ?? 1; [hx, hy] = [(c * hx - s * hy) * (A.sx ?? 1) * k, (s * hx + c * hy) * (A.sy ?? 1) * k]; }
  if ((Fi.behind || depth < -3) === front) return;
  const [dx, dy] = dirScreen(yaw, Fi.d), L = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx) + Fi.wob * (dx >= 0 ? 1 : -1), fore = clamp(L / Math.hypot(...Fi.d), 0.5, 1);
  const st = (Fi.bent ? 'bent' : 'raw').replace('raw', f.arm > 0 ? 'ice' : 'raw').replace('bent', f.arm > 0 ? 'bentice' : 'bent');
  const left = Math.cos(ang) < 0;
  g.save(); g.translate(hx, hy); g.globalAlpha *= Fi.a ?? 1;
  const S = FISH * (Fi.sc || 1);
  g.rotate(left ? ang - Math.PI : ang); g.scale(S * fore * (1 - (Fi.sq || 0) * 0.45), S * (1 + (Fi.sq || 0) * 0.35));
  if (Fi.two) { g.fillStyle = bold() ? BK.ink : '#1a1c24'; g.beginPath(); g.ellipse((left ? -3 : 3) / FISH, 0.5 / FISH, 3.6 / FISH, 3.2 / FISH, 0, 0, TAU); g.fill(); }   // (his other flipper on it too)
  if (!drawProp3D(g, 'txfish', { state: st, yaw: left ? Math.PI : 0 })) fish2D(g, left, f.arm > 0, Fi.bent);
  g.restore();
}
// the 2D fish (a stand-in till the 3D one is baked)
function fish2D(g, left, iced, bent) {
  const s = left ? -1 : 1, BD = bold();
  g.save(); g.scale(s, 1);
  if (bent) { g.translate(11, 0); g.rotate(0.5); g.translate(-11, 0); }
  g.fillStyle = BD ? '#2b4a68' : '#3f6688'; g.beginPath(); g.moveTo(1, 0); g.lineTo(-5, -4.5); g.lineTo(-4, 0); g.lineTo(-5, 4.5); g.closePath(); g.fill();
  g.fillStyle = iced ? '#cfe6f4' : '#b9c9d8'; g.beginPath(); g.ellipse(13, 0, 12, 5.5, 0, 0, TAU); g.fill();
  g.fillStyle = iced ? '#8fb8d6' : '#3f6688'; g.beginPath(); g.ellipse(13, -2.2, 11, 3, 0, Math.PI, TAU); g.fill();
  g.fillStyle = '#ffffff'; circle(g, 20.5, -1.4, 2); g.fill(); g.fillStyle = '#14181f'; circle(g, 21, -1.4, 0.8); g.fill();
  g.fillStyle = '#5a2a36'; circle(g, 25, 0.4, 1.2); g.fill();
  g.restore();
}

// ---------------------------------------------------------------- the floor
// the slide's frost streak: a glossy band with beaded edges and a sliding glint, thawing away
function streak(g, v, o) {
  const P = o.pts; if (!P || P.length < 2) return;
  const fade = o.fade ? clamp((o.life - o.t) / 1.2, 0, 1) : 1, a = clamp(o.t / 0.1, 0, 1) * fade; if (a <= 0.01) return;
  const BD = bold(), seed = (o.id || 1) * 3.3;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  const path = (dx, dy) => { g.beginPath(); P.forEach((p, i) => i ? g.lineTo(p[0] + dx, p[1] + dy) : g.moveTo(p[0] + dx, p[1] + dy)); };
  g.strokeStyle = `rgba(46,84,130,${(0.14 * a).toFixed(3)})`; g.lineWidth = 22; path(0.6, 1.2); g.stroke();   // (a cool shade under it)
  g.strokeStyle = BD ? `rgba(206,238,255,${(0.7 * a).toFixed(3)})` : `rgba(214,240,255,${(0.62 * a).toFixed(3)})`; g.lineWidth = 16; path(0, 0); g.stroke();
  g.strokeStyle = `rgba(255,255,255,${(0.55 * a).toFixed(3)})`; g.lineWidth = 4; path(-1, -2.2); g.stroke();   // (the sky in it)
  for (let i = 1; i < P.length; i++) {   // frost beads along both edges
    const [x0, y0] = P[i - 1], [x1, y1] = P[i], L = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
    for (let k = 0; k < 3; k++) for (const sd of [-1, 1]) {
      const q = hsh(seed + i * 7 + k * 3 + sd), u = (k + 0.5) / 3, r = 0.7 + 1.2 * q, d = 7.5 + 1.5 * hsh(seed + i + k);
      g.fillStyle = `rgba(255,255,255,${((BD ? 0.85 : 0.75) * a * (0.6 + 0.4 * q)).toFixed(3)})`; circle(g, x0 + (x1 - x0) * u + nx * sd * d, y0 + (y1 - y0) * u + ny * sd * d, r); g.fill();
    }
  }
  const gl = ((v.t * 0.9 + hsh(seed)) % 1.7);   // a glint sliding down it
  if (gl < 1 && P.length > 2) {
    const fi = gl * (P.length - 1), i = Math.floor(fi), q = fi - i, p0 = P[i], p1 = P[Math.min(P.length - 1, i + 1)], x = p0[0] + (p1[0] - p0[0]) * q, y = p0[1] + (p1[1] - p0[1]) * q;
    if (propReady('bit:glint')) { g.save(); g.translate(x, y - 2); g.globalAlpha *= a * Math.sin(gl * Math.PI); drawProp3D(g, 'bit:glint', { frame: v.t * 8, scale: 0.9 }); g.restore(); }
  }
  g.restore();
}
// the armour's tell on the floor: frost spreading out round his feet as the ice grows up him
function armFrost(g, f) {
  const M = f.stats.moves.move3, u = f.ph === 'armup' ? ease((f.pht || 0) / Math.max(0.05, f.state === 'wind' ? f.dur : M.startup)) : 1;
  const fade = f.ph === 'armup' ? 1 : 1 - clamp((f.pht || 0) / 0.5, 0, 1); if (fade <= 0.01) return;
  const r = 10 + 30 * u, seed = f.ms * 3.1;
  const gr = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
  gr.addColorStop(0, `rgba(230,246,255,${(0.42 * fade).toFixed(3)})`); gr.addColorStop(0.7, `rgba(214,240,255,${(0.3 * fade).toFixed(3)})`); gr.addColorStop(1, 'rgba(214,240,255,0)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(f.x, f.y, r, r * 0.92, 0, 0, TAU); g.fill();
  g.save(); g.lineCap = 'round';
  for (let j = 0; j < 9; j++) {   // ferns of frost creeping out from his feet
    const an = j / 9 * TAU + hsh(seed + j), L = r * (0.75 + 0.25 * hsh(seed + j * 2));
    g.strokeStyle = `rgba(255,255,255,${(0.7 * fade).toFixed(3)})`; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(f.x + Math.cos(an) * 8, f.y + Math.sin(an) * 8); g.lineTo(f.x + Math.cos(an) * L, f.y + Math.sin(an) * L); g.stroke();
    for (let m = 1; m <= 2; m++) { const d = 8 + (L - 8) * m / 3, b = an + (m % 2 ? 0.5 : -0.5), x = f.x + Math.cos(an) * d, y = f.y + Math.sin(an) * d; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(b) * 5, y + Math.sin(b) * 5); g.stroke(); }
  }
  g.restore();
}
// little heaps of snow where he dived in and popped out (v.txHeaps), slumping away
function heaps(g, v) {
  const L = v.txHeaps; if (!L || !L.length) return;
  for (let i = L.length - 1; i >= 0; i--) {
    const h = L[i], k = (v.t - h.t) / 1.6; if (k >= 1) { L.splice(i, 1); continue; }
    const a = 1 - k * k, r = h.r * (1 - 0.3 * k);
    softShadow(g, h.x + 1, h.y + 1.5, r * 1.35, r * 0.62, 0.22 * a, 0, '60,96,140');
    g.fillStyle = `rgba(250,253,255,${(0.95 * a).toFixed(3)})`;
    for (let m = 0; m < 4; m++) { const an = m / 4 * TAU + h.s, x = h.x + Math.cos(an) * r * 0.45, y = h.y + Math.sin(an) * r * 0.2 - r * 0.15 * (1 - k); g.beginPath(); g.ellipse(x, y, r * 0.55, r * 0.32, 0, 0, TAU); g.fill(); }
    g.fillStyle = `rgba(170,205,235,${(0.5 * a).toFixed(3)})`; g.beginPath(); g.ellipse(h.x + r * 0.15, h.y + r * 0.12, r * 0.6, r * 0.14, 0, 0, Math.PI); g.fill();
  }
}

// ---------------------------------------------------------------- round him
// the armour now: { st (chips), clip (growing up him), a (front alpha), cold (0..1 how near it is to going) } or null
function armorNow(f) {
  const M = f.stats.moves.move3;
  if (f.ph === 'armup' && f.state === 'wind') { const u = ease((f.pht || 0) / Math.max(0.05, f.dur || M.startup)); return { st: '2', clip: 0.15 + 0.85 * u, a: 0.3 + 0.2 * u, cold: 0 }; }
  if (!(f.arm > 0) || f.state === 'ko') return null;
  return { st: f.arm >= 2 ? '2' : '1', clip: 1, a: 0.58, cold: clamp(1 - (f.armT || 0) / 0.8, 0, 1) };
}
const lying = f => f.move === 'move2' && (f.ph === 'slide' || f.ph === 'skid' || f.ph === 'belly') || f.move === 'evade' && (f.ph === 'dive' || f.ph === 'under');
// his armour's back half (before him) or front half (over him, see-through), and a cracked suit's cracks
function armor(g, v, f, half) {
  const A = armorNow(f); if (!A || lying(f)) return;
  const fl = A.cold > 0 ? 0.75 + 0.25 * Math.sin(v.t * (30 + 40 * A.cold)) : 1;   // (about to go: it flickers)
  // flopping onto his belly: the armour goes down with him (tipped his way round his feet, flattening, fading into the prow)
  const fu = f.move === 'move2' && f.ph === 'flop' ? clamp(((f.pht || 0) / Math.max(0.05, f.dur || 0.2) - 0.45) / 0.55, 0, 1) : 0, fe = ease(fu);
  g.save();
  if (fu > 0) { const dir = Math.cos(f.face) < 0 ? -1 : 1; g.translate(dir * 10 * fe, -4 * fe); g.rotate(dir * 1.35 * fe); g.scale(1, 1 - 0.25 * fe); }
  const ok = drawProp3D(g, 'txarmor', { state: half + A.st, clip: A.clip, scale: SC, alpha: (half === 'b' ? 0.92 : A.a) * fl * (1 - 0.7 * fe) });
  if (!ok && half === 'f') armor2D(g, A, fl * (1 - 0.7 * fe));
  if (fu > 0) { g.restore(); return; }
  g.restore();
  if (half === 'f' && ok) {   // a cool sheen sliding up over it, frost twinkling
    const q = (v.t * 0.7 + f.i * 0.37) % 1.6;
    if (q < 1 && A.clip >= 1) glow(g, -14 + q * 28, -10 - q * 44, 9, '230,248,255', 0.35 * Math.sin(q * Math.PI));
    if (propReady('bit:glint') && hsh(Math.floor(v.t * 6) + f.i * 9) > 0.7) { const a = hsh(Math.floor(v.t * 6) * 3.1) * TAU; g.save(); g.translate(Math.cos(a) * 16, -14 - hsh(Math.floor(v.t * 6) * 1.7) * 40); drawProp3D(g, 'bit:glint', { frame: v.t * 10, scale: 0.6, alpha: 0.8 }); g.restore(); }
  }
}
function armor2D(g, A, fl) {
  g.save(); g.globalAlpha *= A.a * fl;
  const top = -58 * A.clip;
  g.fillStyle = bold() ? 'rgba(178,226,255,0.6)' : 'rgba(170,222,255,0.5)';
  g.beginPath(); g.moveTo(-22, 2); g.lineTo(-24, -20); g.lineTo(-18, -40); g.lineTo(-12, top); g.lineTo(12, top); g.lineTo(18, -40); g.lineTo(24, -20); g.lineTo(22, 2); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.3; g.stroke();
  g.restore();
}
// the crust of ice on whoever his armoured fish froze, cracking as it goes
function crust(g, v, F, f, half) {
  const T = F.f[1 - f.i]; if (!T || T.id !== ID || !(T.iceT > 0) || T.iceTo !== f.i) return;
  const M = T.stats.moves.move1, left = T.iceT, u = clamp((M.frz - left) / 0.08, 0, 1), a = clamp(left / 0.12, 0, 1);
  if (!drawProp3D(g, 'txcrust', { state: half, clip: u, alpha: a * (half === 'f' ? 0.72 : 0.95), scale: SC * (f.r || 17) / 18 }) && half === 'f') {
    g.fillStyle = `rgba(190,230,255,${(0.5 * a).toFixed(3)})`; g.beginPath(); g.ellipse(0, -12, 22, 16, 0, 0, TAU); g.fill();
  }
}

const art = {
  id: ID,
  anim(F, v, f) {
    const A = animBase(), k = f.pht || 0, sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; }, M = f.stats.moves;
    const wd = f.state === 'wind' ? Math.max(0.04, f.dur || 0.2) : 0, u = wd ? clamp(k / wd, 0, 1) : 1;
    switch (f.ph) {
      // ---- Frozen Fish
      case 'fishout': sq(0.05 * ease(u / 0.6)); A.fwd = -3 * backE(u); A.lean = -0.09 * ease(u); A.spin = 0.36 * backE(u); A.wx = u > 0.7 ? Math.sin(k * 80) * 0.5 : 0; break;   // (coiled away from you, reaching behind his back)
      case 'slap': sq(-0.08 * spring(k, 28, 12)); A.fwd = 5 * ease(k / 0.05); A.lean = 0.1 * spring(k, 18, 9); A.spin = 0.36 - 0.74 * ease(k / M.move1.active); break;   // (unwound into it)
      case 'slapped': { const S = settleAnim(k, M.move1.recovery, 'fishslap', 0.07); S.spin = -0.38 * (1 - ease(k / M.move1.recovery)); S.fwd = 5 - 3 * ease(k / M.move1.recovery); return S; }
      case 'fishmiss': { const S = settleAnim(k, M.move1.miss, 'fishslap', 0.16); S.spin = -0.38 - 0.2 * Math.sin(clamp(k / 0.2, 0, 1) * Math.PI) + 0.38 * ease(k / M.move1.miss); S.wx = Math.sin(k * 16) * 1.2 * Math.exp(-k * 5); return S; }   // (it got away from him: he overbalances after it)
      case 'walup': sq(-0.07 * ease(u) + 0.02 * Math.sin(k * 60) * u); A.hop = 2.5 * ease(u); A.fwd = -3 * ease(u); A.lean = -0.06 * ease(u); A.wx = Math.sin(k * 70) * 0.7 * u; A.mood = 'happy'; break;   // (up on his toes, the fish overhead, trembling with it)
      case 'wallop': sq(0.18 * ease(k / 0.04) * (f.hit ? 1 : 0.8)); A.fwd = 7 * ease(k / 0.06); A.lean = 0.12; A.mood = 'happy'; break;
      case 'walloped': { const S = settleAnim(k, M.move1.last.recovery, 'wallop', 0.12); S.fwd = 7 - 4 * ease(k / M.move1.last.recovery); S.mood = 'happy'; return S; }
      case 'walmiss': { const S = settleAnim(k, M.move1.last.miss, 'wallop', 0.25); S.fwd = 7 - 5 * ease(k / M.move1.last.miss); S.wx = Math.sin(k * 30) * 1.4 * Math.exp(-k * 6); return S; }   // (the fish smacked into the floor: it jars him)
      // ---- Belly Slide
      case 'flop': {   // a crouch, then a little hop forward and down onto his belly
        if (u < 0.55) { sq(0.2 * ease(u / 0.55) + 0.02 * Math.sin(k * 70) * u); A.fwd = -4 * ease(u / 0.55); A.lean = -0.05; }
        else { const r = (u - 0.55) / 0.45; sq(0.2 * (1 - ease(r * 1.5)) - 0.1 * ease(r)); A.hop = 7 * bump(r); A.fwd = -4 + 10 * ease(r); A.lean = 0.25 * ease(r); }
        break;
      }
      case 'slide': {   // shot off stretched long, skimming, leaning into his steering
        const PF = v.txFace || (v.txFace = [{ a: f.face, t: v.t, w: 0 }, { a: f.face, t: v.t, w: 0 }]), P = PF[f.i];
        if (v.t > P.t + 1e-6) { let df = f.face - P.a; if (df > Math.PI) df -= TAU; if (df < -Math.PI) df += TAU; P.w += (clamp(df / Math.min(0.1, v.t - P.t), -3, 3) - P.w) * 0.25; P.a = f.face; P.t = v.t; }   // (how fast he's turning: his steering)
        const s = 0.22 * spring(k, 16, 7) + 0.05, c = Math.abs(Math.cos(f.face)), d = Math.abs(Math.sin(f.face));
        A.sx *= 1 + s * c - s * 0.4 * d; A.sy *= 1 + s * d * 0.7 - s * 0.45 * c; A.hop = Math.abs(Math.sin(k * 16)) * 0.7; A.fwd = 4 * (1 - spring(k, 12, 8));
        A.lean = clamp(P.w * 0.12, -0.3, 0.3);
        const bt = (v.txBnc && v.txBnc[f.i]) ?? -9; if (v.t - bt < 0.3) A.spin += Math.sin((v.t - bt) / 0.3 * Math.PI * 2) * 0.35 * (1 - (v.t - bt) / 0.3);   // (a bounce off a wall: a spin of a wobble)
        break;
      }
      case 'skid': sq(0.14 * spring(k, 20, 9)); A.wx = Math.sin(k * 26) * 1.1 * Math.exp(-k * 8); A.fwd = 4 * ease(k / 0.25); break;   // (rammed into them: squashed, then carried on a moment)
      case 'belly': { const S = settleAnim(k, M.move2.belly, k < 0.22 ? 'slide' : 'crouch', 0.42); if (k < 0.22) S.fwd = 3 * ease(k / 0.22); return S; }   // (missed: pushes up off his belly, a calm settle)
      // ---- Ice Armour
      case 'armup': sq(0.06 * ease(u) + 0.015 * Math.sin(k * 70) * u); A.wx = Math.sin(k * 75) * 0.6 * u; A.lean = -0.05 * ease(u); A.fwd = -1.5 * ease(u); break;   // (clenched, the ice creeping up him)
      case 'armset': { if (f.state === 'strike' || k < 0.05) { sq(-0.1 * spring(k, 20, 9)); A.hop = bump(k / 0.12) * 2.5; A.mood = 'happy'; break; } const S = settleAnim(k, M.move3.recovery + 0.05, 'burst', 0.08); S.mood = 'happy'; return S; }   // (set: chest out, a pop)
      // ---- Snow Dive
      case 'dive': { const q = clamp(k / M.evade.dive, 0, 1); A.hop = 12 * bump(q * 0.8); sq(-0.14 * q); A.fwd = 6 * q; break; }
      case 'under': A.alpha = 0; break;
      case 'popup': { const q = clamp(k / 0.16, 0, 1); A.hop = 10 * bump(q); sq(q < 1 ? -0.12 * (1 - q) : 0.1 * spring(k - 0.16, 22, 10)); A.wx = Math.sin(k * 40) * 1.2 * Math.exp(-k * 8); A.mood = 'happy'; break; }   // (popped out, shaking the snow off)
      default: return null;
    }
    return A;
  },
  ground(g, F, v, o) { if (o.kind === 'txStreak') streak(g, v, o); },
  // the fish in front of him, among the fighters (y-sorted: out in front of him it's over whoever it slaps)
  stand(F, v, g, out) {
    for (const f of F.f) {
      if (f.id !== ID || f.state === 'ko') continue;
      const Fi = fishNow(F, f); if (!Fi) continue;
      const A = art.anim(F, v, f) || animBase(), yaw = yawOf(f, A.spin || 0), [, , depth] = onScreen(yaw, Fi.p);
      if (Fi.behind || depth < -3) continue;
      const x = f.x + Math.cos(f.face) * (A.fwd || 0) + (A.wx || 0), y = f.y + Math.sin(f.face) * (A.fwd || 0) - (f.z || 0) - (A.hop || 0);
      out.push({ y: f.y + Math.max(1, depth / D3 * 0.5), d: () => { g.save(); g.translate(x, y); drawFish(g, v, f, Fi, true, yaw, A); g.restore(); } });
    }
  },
  floor(g, F, v) {
    heaps(g, v);
    for (const f of F.f) if (f.id === ID && f.move === 'move3' && (f.ph === 'armup' || f.ph === 'armset')) armFrost(g, f);
  },
  behind(g, F, v, f) {
    g.save(); g.translate(f.x, f.y); crust(g, v, F, f, 'b'); g.restore();
    if (f.id !== ID) return null;
    if (f.ph === 'under') {   // under the snow: a snowy bump running along where he is, snow spraying off it
      const k = f.pht || 0, u = clamp(k / 0.05, 0, 1);
      g.save(); g.translate(f.x, f.y);
      softShadow(g, 1, 2, 21 * u, 8.6 * u, 0.2, 0, '40,70,110');
      g.fillStyle = bold() ? '#f4f8ff' : 'rgba(248,252,255,0.97)'; for (const [dx, dy, r] of [[-7, -2, 8], [5, -3, 9], [0, -7, 8], [-1, 0, 10]]) { g.beginPath(); g.ellipse(dx * u, dy * u, r * u, r * 0.62 * u, 0, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(160,196,230,0.5)'; g.beginPath(); g.ellipse(2 * u, 2 * u, 11 * u, 3 * u, 0, 0, Math.PI); g.fill();
      g.restore();
      if (frnd(0, 1) < 0.7) bit3(v, 'snow', f.x + frnd(-8, 8), f.y + frnd(-3, 3), 6, { dx: -(f.vx || 0) * 0.2 + frnd(-30, 30), dy: -(f.vy || 0) * 0.15 + frnd(-15, 15), dz: frnd(50, 110), s: frnd(2.4, 3.6), life: frnd(0.35, 0.5), drag: 1.6, few: true });
      return 'hide';
    }
    const A = art.anim(F, v, f) || animBase(), ox = Math.cos(f.face) * (A.fwd || 0) + (A.wx || 0), oy = Math.sin(f.face) * (A.fwd || 0) - (f.z || 0) - (A.hop || 0);
    g.save(); g.translate(f.x + ox, f.y + oy);
    armor(g, v, f, 'b');
    const Fi = fishNow(F, f); if (Fi) drawFish(g, v, f, Fi, false, yawOf(f, A.spin || 0), A);
    g.restore();
    // the slide: snow sprayed off both sides; on an old streak of his, speed lines off him
    if ((f.ph === 'slide' || f.ph === 'skid') && v.fx.length < 130) {
      const S = v.txSpray || (v.txSpray = [0, 0]);
      if (v.t >= S[f.i]) {
        S[f.i] = v.t + (f.ph === 'slide' ? 0.05 : 0.1);
        const c = Math.cos(f.face), s = Math.sin(f.face);
        for (const side of [-1, 1]) bit3(v, (S.n = (S.n || 0) + 1) % 5 === 0 ? 'ice' : 'snow', f.x - c * 10 - s * side * 10, f.y - s * 10 + c * side * 10, 3, { dx: -c * frnd(25, 60) - s * side * frnd(35, 80), dy: (-s * frnd(25, 60) + c * side * frnd(35, 80)) * 0.7, dz: frnd(50, 120), s: frnd(2.4, 3.8), life: frnd(0.3, 0.5), drag: 1.8, few: true });
      }
      if (f.ph === 'slide' && Math.hypot(f.vx || 0, f.vy || 0) > f.stats.moves.move2.speed * 1.12) {   // (riding a streak: quicker, speed lines)
        const c = Math.cos(f.face), s = Math.sin(f.face);
        g.save(); g.lineCap = 'round';
        for (let j = 0; j < 3; j++) { const sd = (j - 1) * 9, q = (v.t * 6 + j * 0.3) % 1, x0 = f.x - c * (16 + 20 * q) - s * sd, y0 = f.y - s * (16 + 20 * q) + c * sd * 0.7 - 10; g.strokeStyle = `rgba(255,255,255,${(0.6 * (1 - q)).toFixed(3)})`; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 - c * 14, y0 - s * 14); g.stroke(); }
        g.restore();
      }
    }
    // armoured and sliding: the prow of ice on his nose (behind him if it points up the screen)
    if (f.arm > 0 && f.move === 'move2' && (f.ph === 'slide' || f.ph === 'skid') && Math.sin(f.face) < 0) prow(g, f);
    return null;
  },
  over(g, F, v, f) {
    crust(g, v, F, f, 'f');
    if (f.id !== ID) return;
    armor(g, v, f, 'f');
    const Fi = fishNow(F, f), A = Fi && art.anim(F, v, f), yaw = yawOf(f, (A && A.spin) || 0);
    if (Fi) {   // (the fish in front of him: stand(), sorted among the fighters, so it shows over whoever it slaps)
      if (Fi.peek && f.fishN >= 2) {   // two in a row: the fish glints and steams with cold (the wallop's next)
        const [hx, hy] = onScreen(yaw, [K.under.p[0] + K.under.d[0] * 13, K.under.p[1] + K.under.d[1] * 13, K.under.p[2] + K.under.d[2] * 13]);
        glow(g, hx, hy, 11, '220,244,255', 0.35 + 0.15 * Math.sin(v.t * 9));
        if (propReady('bit:glint') && hsh(Math.floor(v.t * 5) + f.i) > 0.55) { g.save(); g.translate(hx + 3, hy - 4); drawProp3D(g, 'bit:glint', { frame: v.t * 9, scale: 0.75 }); g.restore(); }
        if (frnd(0, 1) < 0.12 && propReady('bit:steam')) bit3(v, 'steam', f.x + hx, f.y, -hy, { dz: frnd(10, 20), g: -10, drag: 1.6, grow: 1.2, s: frnd(2.2, 3.2), life: 0.5, al: 0.5, sh: false, few: true });
      }
    }
    if (f.arm > 0 && f.move === 'move2' && (f.ph === 'slide' || f.ph === 'skid') && Math.sin(f.face) >= 0) { g.save(); g.translate(-f.x, -f.y + (f.z || 0)); prow(g, f); g.restore(); }
    if (f.arm > 0 && !lying(f)) {   // armoured: a pale breath of cold now and then; running out, meltwater dripping off it
      const A = armorNow(f);
      if (frnd(0, 1) < 0.04 && propReady('bit:steam')) bit3(v, 'steam', f.x + Math.cos(f.face) * 10, f.y + Math.sin(f.face) * 4, 40, { dx: Math.cos(f.face) * 15, dz: 8, g: -6, drag: 1.5, grow: 1.4, s: 2.6, life: 0.6, al: 0.45, sh: false, few: true });
      if (A && A.cold > 0 && frnd(0, 1) < 0.25 * A.cold) bit3(v, 'drop', f.x + frnd(-18, 18), f.y + frnd(-4, 4), frnd(10, 40), { dz: -10, s: 1, life: 0.4, bo: 0, few: true, sh: false });
    }
  },
  tint(F, v, f) {
    const T = F.f[1 - f.i];
    if (T && T.id === ID && T.iceT > 0 && T.iceTo === f.i) return `rgba(200,236,255,${(0.3 * clamp(T.iceT / 0.15, 0, 1)).toFixed(3)})`;   // (frozen stiff by his fish)
    if (f.id !== ID) return null;
    if (f.ph === 'armup' && f.state === 'wind') return `rgba(205,238,255,${(0.2 * ease((f.pht || 0) / Math.max(0.05, f.dur || 0.3))).toFixed(3)})`;
    if (f.arm > 0) return 'rgba(205,238,255,0.16)';
    return null;
  },
  event(v, F, e, few) {
    const f = F.f[e.who], o = F.f[e.to];
    switch (e.kind) {
      case 'txFishOut': {   // out from behind his back: a little puff of cold mist off it (the wallop's: a glint up top)
        if (!f) return true;
        const [hx, hy] = onScreen(yawOf(f), K.cock.p);
        if (propReady('bit:steam')) bits3(v, 'steam', f.x + hx, f.y, -hy, few ? 1 : 2, { r: 4, speed: [6, 16], up: [8, 18], g: -12, drag: 1.8, grow: 1.3, s: [2.4, 3.4], life: [0.4, 0.55], al: 0.55, sh: false, few });
        if (e.wal && propReady('bit:glint')) bit3(v, 'glint', f.x + onScreen(yawOf(f), K.over.p)[0], f.y, 80, { g: 0, dz: 0, life: 0.3, s: 6, sp: 120, fade: 'shrink', sh: false, few });
        return true;
      }
      case 'txSlap': if (f) v.fx.push({ k: 'txSwoosh', i: f.i, a: e.a ?? f.face, wal: e.wal ? 1 : 0, t: 0, life: e.wal ? 0.32 : 0.28, s: 1, seed: (e.a || 0) * 7.3, x: f.x, y: f.y }); return true;
      case 'txThwack': {   // THWACK: a white star of impact squashed flat, chips of ice and snow, the camera nudged (a wallop: bigger, chunks, a soft shake)
        const a = e.a ?? (f ? f.face : 0), x = e.x, y = e.y, big = !!e.wal;
        v.fx.push({ k: 'txStar', x, y: y - (big ? 26 : 30), a, t: 0, life: big ? 0.26 : 0.18, s: big ? 30 : 20, seed: frnd(0, 9) });
        if (propReady('bit:ice')) {
          bits3(v, 'ice', x, y, big ? 24 : 30, few ? (big ? 4 : 2) : big ? 9 : 5, { dir: a, spread: big ? 2.6 : 1.6, speed: big ? [90, 210] : [70, 160], up: big ? [110, 230] : [70, 150], s: big ? [2.6, 5.2] : [1.8, 3.2], life: [0.55, 0.9], bo: 0.3, few });
          bits3(v, 'snow', x, y, 28, few ? 2 : big ? 7 : 4, { dir: a, spread: 2, speed: [50, 130], up: [40, 120], s: [2.4, 3.8], life: [0.35, 0.6], drag: 1.6, few });
          if (big && propReady('bit:crystal')) bits3(v, 'crystal', x, y, 34, few ? 1 : 3, { speed: [30, 80], up: [100, 170], s: [1.6, 2.4], life: [0.5, 0.7], bo: 0.3, few });
        }
        v.fx.push({ k: 'popring', x: o ? o.x : x, y: o ? o.y : y, t: 0, life: big ? 0.34 : 0.24, s: big ? 30 : 18 });
        if (big) { v.shake = Math.max(v.shake, 0.16); v.punch = { t: v.t, x, y }; }
        if (e.frz && o) {   // frozen stiff: the ice crusting over them, crystals and a cold flash
          v.fx.push({ k: 'flash', x: o.x, y: o.y - 24, t: 0, life: 0.14, s: 24 });
          if (propReady('bit:crystal')) for (let k = 0; k < (few ? 3 : 6); k++) { const an = k / 6 * TAU, r = 24; bit3(v, 'crystal', o.x + Math.cos(an) * r, o.y + Math.sin(an) * r * 0.6, 18 + frnd(-8, 12), { to: [o.x, o.y, 20], s: frnd(1.6, 2.4), life: 0.12, sh: false, few }); }
        }
        return true;
      }
      case 'txFlop': {   // a whiff: the fish flops about (a wallop's smacks the floor: a puff of snow)
        if (e.wal) { if (propReady('bit:snow')) bits3(v, 'snow', e.x, e.y, 3, few ? 3 : 7, { r: 8, speed: [40, 110], up: [60, 140], s: [2.6, 4.2], life: [0.4, 0.65], drag: 1.6, few }); v.fx.push({ k: 'popring', x: e.x, y: e.y, t: 0, life: 0.26, s: 18 }); }
        else if (propReady('bit:ice')) bits3(v, 'ice', e.x, e.y, 26, few ? 1 : 2, { dir: e.a ?? 0, spread: 1.4, speed: [20, 60], up: [20, 60], s: [1.4, 2], life: [0.4, 0.6], bo: 0.3, few });
        return true;
      }
      case 'txFlopIn': if (f && propReady('bit:snow')) bits3(v, 'snow', f.x, f.y, 2, few ? 2 : 4, { r: 10, speed: [30, 70], up: [30, 80], s: [2.4, 3.6], life: [0.35, 0.5], drag: 2, few }); return true;
      case 'txSlide': {   // off he shoots: snow sprayed back
        if (!f) return true;
        const a = f.face + Math.PI;
        if (propReady('bit:snow')) bits3(v, 'snow', f.x + Math.cos(a) * 12, f.y + Math.sin(a) * 12, 3, few ? 3 : 6, { dir: a, spread: 1.4, speed: [60, 140], up: [60, 140], s: [2.8, 4.4], life: [0.45, 0.7], drag: 1.5, few });
        return true;
      }
      case 'txRam': {   // he rams them: snow and chunks of ice burst off the impact along his way, a ring of frost, the camera nudged
        const a = e.a ?? (f ? f.face : 0), big = !!e.plow;
        if (propReady('bit:snow')) {
          bits3(v, 'snow', e.x, e.y, 14, few ? 4 : 9, { dir: a, spread: 1.7, speed: [80, 190], up: [90, 210], s: [3, 5], life: [0.45, 0.75], drag: 1.5, few });
          bits3(v, 'ice', e.x, e.y, 18, few ? 2 : big ? 9 : 5, { dir: a, spread: big ? 2 : 1.2, speed: [120, 240], up: [110, 230], s: big ? [3, 6] : [2.6, 4.8], life: [0.7, 1.1], bo: 0.3, few });
        }
        v.fx.push({ k: 'popring', x: e.x, y: e.y, t: 0, life: 0.32, s: 30 }, { k: 'flash', x: e.x, y: e.y - 20, t: 0, life: 0.12, s: 24 });
        v.punch = { t: v.t, x: e.x, y: e.y }; if (big) v.shake = Math.max(v.shake, 0.14);
        return true;
      }
      case 'txBounce': {   // off a wall: a puff of snow off it, a few flecks of ice
        (v.txBnc || (v.txBnc = [-9, -9]))[e.who] = v.t;
        const a = Math.atan2(e.ny ?? -1, e.nx ?? 0);
        if (propReady('bit:snow')) { bits3(v, 'snow', e.x, e.y, 6, few ? 3 : 6, { dir: a, spread: 2, speed: [60, 150], up: [70, 170], s: [3, 4.6], life: [0.45, 0.7], drag: 1.5, few }); bits3(v, 'ice', e.x, e.y, 10, few ? 1 : 3, { dir: a, spread: 1.6, speed: [80, 160], up: [80, 180], s: [2.2, 3.4], life: [0.6, 0.9], few }); }
        return true;
      }
      case 'txBelly': if (propReady('bit:snow')) bits3(v, 'snow', e.x, e.y, 2, few ? 2 : 4, { r: 14, speed: [30, 70], up: [40, 100], s: [2.6, 4], life: [0.4, 0.6], drag: 2, few }); return true;
      case 'txArmUp': {   // the tell: crystals drawn in to him from round about, a cold mist at his feet
        if (!f) return true;
        if (propReady('bit:crystal')) for (let k = 0; k < (few ? 4 : 9); k++) { const an = k / 9 * TAU + frnd(-0.2, 0.2), d = frnd(36, 56); bit3(v, 'crystal', f.x + Math.cos(an) * d, f.y + Math.sin(an) * d * 0.7, frnd(4, 40), { to: [f.x + Math.cos(an) * 14, f.y + Math.sin(an) * 6, frnd(14, 46)], s: frnd(1.6, 2.4), life: frnd(0.22, 0.3), sh: false, few }); }
        if (propReady('bit:steam')) bits3(v, 'steam', f.x, f.y, 3, few ? 2 : 4, { r: 16, speed: [8, 20], up: [4, 12], g: -6, drag: 1.4, grow: 1.4, s: [3.4, 5], life: [0.5, 0.8], al: 0.5, sh: false, few });
        return true;
      }
      case 'txArmor': {   // set: a sparkle all over it, a ring of frost
        if (!f) return true;
        if (propReady('bit:glint')) for (let k = 0; k < (few ? 2 : 4); k++) bit3(v, 'glint', f.x + frnd(-18, 18), f.y + frnd(-3, 3), frnd(14, 56), { g: 0, dz: 0, life: 0.3, s: 5, sp: 140, fade: 'shrink', sh: false, few });
        v.fx.push({ k: 'popring', x: f.x, y: f.y, t: 0, life: 0.3, s: 28 });
        return true;
      }
      case 'txChip': {   // a hit on the armour: chips of ice off where it struck, a glint (the suit's cracked from now: armor's state)
        if (!f) return true;
        const a = e.a ?? 0, x = f.x - Math.cos(a) * 14, y = f.y - Math.sin(a) * 6;
        if (propReady('bit:ice')) bits3(v, 'ice', x, y, 34, few ? 3 : 6, { dir: a + Math.PI, spread: 2.2, speed: [70, 160], up: [70, 160], s: [2.2, 4], life: [0.6, 0.9], bo: 0.3, few });
        if (propReady('bit:glint')) bit3(v, 'glint', x, y, 36, { g: 0, dz: 0, life: 0.22, s: 6, sp: 160, fade: 'shrink', sh: false, few });
        v.fx.push({ k: 'txStar', x, y: y - 34, a: a + Math.PI, t: 0, life: 0.14, s: 12, seed: frnd(0, 9), ice: 1 });
        return true;
      }
      case 'txPlow': {   // shrugged off mid-slide: shards spraying off the prow
        if (!f) return true;
        if (propReady('bit:ice')) bits3(v, 'ice', f.x + Math.cos(f.face) * 22, f.y + Math.sin(f.face) * 10, 12, few ? 2 : 4, { dir: (e.a ?? 0) + Math.PI, spread: 2, speed: [70, 150], up: [60, 140], s: [2, 3.4], life: [0.5, 0.8], bo: 0.3, few });
        return true;
      }
      case 'txShatter': {   // the armour bursts: shards flung all round (most at whoever's next to him), snow, a ring, a soft shake
        if (!f) return true;
        const T = F.f[1 - e.who], aim = T ? Math.atan2(T.y - f.y, T.x - f.x) : 0, n = few ? 7 : 14;
        if (propReady('bit:ice')) {
          for (let k = 0; k < n; k++) { const at = e.stag >= 0 && k < n * 0.4, an = at ? aim + frnd(-0.7, 0.7) : k / n * TAU + frnd(-0.3, 0.3), sp = at ? frnd(130, 240) : frnd(60, 150); bit3(v, 'ice', f.x + Math.cos(an) * 12, f.y + Math.sin(an) * 5, frnd(10, 56), { dx: Math.cos(an) * sp, dy: Math.sin(an) * sp * 0.7, dz: frnd(80, 220), s: frnd(3.2, 7), life: frnd(0.8, 1.3), bo: 0.3, sp: frnd(-40, 40), few }); }
          bits3(v, 'snow', f.x, f.y, 10, few ? 3 : 6, { r: 18, speed: [40, 110], up: [60, 150], s: [2.6, 4.2], life: [0.4, 0.65], drag: 2, few });
        }
        v.fx.push({ k: 'popring', x: f.x, y: f.y, t: 0, life: 0.4, s: 44 }, { k: 'flash', x: f.x, y: f.y - 30, t: 0, life: 0.14, s: 34 });
        v.shake = Math.max(v.shake, e.why === 'break' ? 0.18 : 0.12);
        return true;
      }
      case 'txDive': {   // head first into a puff of snow (a heap where he went in and one where he'll pop up)
        const H = v.txHeaps || (v.txHeaps = []); H.push({ x: e.x, y: e.y, t: v.t, r: 12, s: frnd(0, 6) }); if (H.length > 8) H.shift();
        if (propReady('bit:snow')) bits3(v, 'snow', e.x, e.y, 4, few ? 4 : 9, { r: 10, speed: [40, 110], up: [80, 170], s: [3, 4.8], life: [0.45, 0.7], drag: 1.6, few });
        v.fx.push({ k: 'popring', x: e.x, y: e.y, t: 0, life: 0.26, s: 20 });
        return true;
      }
      case 'txPop': {   // popped out: a burst of snow, snow shaken off him
        const H = v.txHeaps || (v.txHeaps = []); H.push({ x: e.x, y: e.y, t: v.t, r: 13, s: frnd(0, 6) }); if (H.length > 8) H.shift();
        if (propReady('bit:snow')) { bits3(v, 'snow', e.x, e.y, 6, few ? 4 : 10, { r: 12, speed: [50, 130], up: [100, 200], s: [3, 5], life: [0.45, 0.75], drag: 1.6, few }); bits3(v, 'snow', e.x, e.y, 40, few ? 2 : 4, { r: 8, speed: [30, 80], up: [20, 60], s: [2, 3], life: [0.4, 0.6], drag: 1.6, few }); }
        return true;
      }
    }
    return false;
  },
  fx(g, F, v, p, k) {
    switch (p.k) {
      case 'txSwoosh': {   // the fish's swing: a cold smear trailing its tip round a curved arc (the slap: from over his
        // shoulder across his front; the wallop: overhead and down), an ice-blue ribbon tapering behind the fish; a blink
        const f = F.f[p.i]; if (!f) return true;
        const tip = Q => Q.p.map((x, i) => x + Q.d[i] * 22 * FISH), A = tip(p.wal ? K.over : K.cock), B = tip(p.wal ? K.club : K.thru);
        const H = p.wal ? [16, 0, 84] : tip(K.hit), C = H.map((x, i) => 2 * x - (A[i] + B[i]) / 2);   // (a curve through his contact point)
        const at = u => { const w = 1 - u; return A.map((x, i) => w * w * x + 2 * w * u * C[i] + u * u * B[i]); };
        const head = ease(Math.min(1, k * 2.4 + 0.35)), tail = Math.max(0, head - 0.55) + ease(clamp((k - 0.35) / 0.65, 0, 1)) * 0.45, n = 16, yw = yawOf(f);
        if (head - tail < 0.02) return true;
        const pts = []; for (let j = 0; j <= n; j++) { const [sx, sy] = onScreen(yw, at(tail + (head - tail) * j / n)); pts.push([f.x + sx, f.y + sy]); }
        const W = (p.wal ? 12 : 9) * (1 - 0.4 * k), side = j => { const a = pts[Math.max(0, j - 1)], b = pts[Math.min(n, j + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
        const ribbon = (wm, col) => {
          g.beginPath();
          for (let j = 0; j <= n; j++) { const [nx, ny] = side(j), w = W * wm * Math.pow(j / n, 1.4); g.lineTo(pts[j][0] + nx * w, pts[j][1] + ny * w); }
          for (let j = n; j >= 0; j--) { const [nx, ny] = side(j), w = W * wm * Math.pow(j / n, 1.4) * 0.35; g.lineTo(pts[j][0] - nx * w, pts[j][1] - ny * w); }
          g.closePath(); g.fillStyle = col; g.fill();
        };
        const a = 1 - clamp((k - 0.25) / 0.75, 0, 1);
        g.save();
        ribbon(1.5, `rgba(120,180,230,${(0.18 * a).toFixed(3)})`);   // (a soft cold haze round it)
        ribbon(1, `rgba(160,208,240,${(0.48 * a).toFixed(3)})`);
        ribbon(0.45, `rgba(255,255,255,${(0.92 * a).toFixed(3)})`);
        for (let j = 1; j < n; j += 2) {   // (frost motes shed off the outside of the arc, drifting out)
          const [nx, ny] = side(j), d = W * (1.2 + 1.6 * k) * (0.6 + hsh(j + (p.seed || 0))), r = 0.9 + 0.8 * hsh(j * 3.1);
          g.fillStyle = `rgba(235,248,255,${(0.8 * a * (j / n)).toFixed(3)})`; circle(g, pts[j][0] + nx * d, pts[j][1] + ny * d - 4 * k, r); g.fill();
        }
        g.restore(); return true;
      }
      case 'txStar': {   // a white star of impact, squashed flat along the hit, popping then shrinking (a chip: a cool blue one)
        const s = p.s * (k < 0.2 ? backE(k / 0.2) : 1 - (k - 0.2) / 0.8 * 0.7), a = 1 - clamp((k - 0.4) / 0.6, 0, 1), n = 7, BD = bold();
        g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.scale(0.62, 1);
        const star = (r, r2, rot) => { g.beginPath(); for (let j = 0; j < n * 2; j++) { const an = rot + j / (n * 2) * TAU, rr = j % 2 ? r2 : r * (0.8 + 0.4 * hsh((p.seed || 0) + j)); g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } g.closePath(); };
        g.globalAlpha *= a;
        star(s, s * 0.42, 0.2); g.fillStyle = p.ice ? (BD ? '#bfe8ff' : 'rgba(190,232,255,0.95)') : (BD ? '#dff3ff' : 'rgba(214,240,255,0.95)'); g.fill();
        star(s * 0.62, s * 0.3, 0.2 + Math.PI / n); g.fillStyle = '#ffffff'; g.fill();
        g.restore(); return true;
      }
    }
    return false;
  },
  icon(g, kind, r, col) {
    const W = col || '#ffffff';
    g.fillStyle = W; g.strokeStyle = W; g.lineCap = 'round'; g.lineJoin = 'round';
    const hole = (x, y, rr) => { g.save(); g.globalCompositeOperation = 'destination-out'; circle(g, x, y, rr); g.fill(); g.restore(); };
    switch (kind) {
      case 'txFish':   // a fish, swung (tilted), a little star of frost off its nose
        g.save(); g.rotate(-0.5);
        g.beginPath(); g.ellipse(r * 0.12, 0, r * 0.58, r * 0.3, 0, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(-r * 0.4, 0); g.lineTo(-r * 0.85, -r * 0.32); g.lineTo(-r * 0.72, 0); g.lineTo(-r * 0.85, r * 0.32); g.closePath(); g.fill();
        hole(r * 0.42, -r * 0.06, r * 0.08);
        g.restore();
        for (const [x, y, s] of [[0.72, -0.62, 0.11], [0.9, -0.3, 0.07]]) { g.beginPath(); g.arc(x * r, y * r, s * r, 0, TAU); g.fill(); }
        return true;
      case 'txSlide':   // a penguin on his belly shooting along, speed lines behind, snow off his nose
        g.beginPath(); g.ellipse(r * 0.12, r * 0.14, r * 0.5, r * 0.26, -0.06, 0, TAU); g.fill();
        g.beginPath(); g.arc(r * 0.58, -r * 0.04, r * 0.21, 0, TAU); g.fill();
        g.lineWidth = r * 0.12; for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(-r * 0.92, r * 0.14 + k * r * 0.22); g.lineTo(-r * 0.5, r * 0.14 + k * r * 0.22); g.stroke(); }
        for (const [x, y, s] of [[0.88, 0.3, 0.09], [0.98, 0.05, 0.07]]) { g.beginPath(); g.arc(x * r, y * r, s * r, 0, TAU); g.fill(); }
        return true;
      case 'txArmor':   // a faceted breastplate of ice, a crystal up out of its top
        g.beginPath(); g.moveTo(-r * 0.62, -r * 0.42); g.lineTo(r * 0.62, -r * 0.42); g.lineTo(r * 0.52, r * 0.3); g.lineTo(0, r * 0.82); g.lineTo(-r * 0.52, r * 0.3); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(-r * 0.14, -r * 0.42); g.lineTo(0, -r * 0.92); g.lineTo(r * 0.14, -r * 0.42); g.closePath(); g.fill();
        g.save(); g.globalCompositeOperation = 'destination-out'; g.lineWidth = r * 0.09;
        g.beginPath(); g.moveTo(0, -r * 0.3); g.lineTo(0, r * 0.66); g.moveTo(-r * 0.5, -r * 0.05); g.lineTo(0, r * 0.18); g.lineTo(r * 0.5, -r * 0.05); g.stroke(); g.restore();
        return true;
      case 'txDive':   // a heap of snow with his two feet sticking up out of it
        g.beginPath(); g.moveTo(-r * 0.85, r * 0.55); g.quadraticCurveTo(-r * 0.4, -r * 0.05, 0, r * 0.05); g.quadraticCurveTo(r * 0.45, -r * 0.1, r * 0.85, r * 0.55); g.closePath(); g.fill();
        for (const s of [-1, 1]) { g.save(); g.translate(s * r * 0.2, -r * 0.18); g.rotate(s * 0.35); g.beginPath(); g.ellipse(0, -r * 0.3, r * 0.13, r * 0.3, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(s * r * 0.06, -r * 0.62, r * 0.2, r * 0.1, 0, 0, TAU); g.fill(); g.restore(); }
        return true;
    }
    return false;
  },
  sound(e) {
    switch (e.kind) {
      case 'txFishOut': return [['txWhip', e.wal ? 0.8 : 0.55]];
      case 'txSlap': return [['txSwish', e.wal ? 0.9 : 0.6]];
      case 'txThwack': return e.wal ? [['txWallop', 1]] : e.frz ? [['txThwack', 0.9], ['txFreeze', 0.7]] : [['txThwack', 0.9]];
      case 'txFlop': return [['txFloppy', e.wal ? 0.8 : 0.6]];
      case 'txFlopIn': return [['txHop', 0.7]];
      case 'txSlide': return [['txSlideGo', 0.85]];
      case 'txRam': return [['txCrunch', e.plow ? 1 : 0.75]];
      case 'txBounce': return [['txBoing', 0.7]];
      case 'txBelly': return [['txSplat', 0.6]];
      case 'txArmUp': return [['txGrow', 0.85]];
      case 'txArmor': return [['txSet', 0.8]];
      case 'txChip': return [['txChip', 0.9]];
      case 'txPlow': return [['txChip', 0.5]];
      case 'txShatter': return e.why === 'out' && e.stag < 0 ? [['txMelt', 0.8], ['txShatter', 0.55]] : [['txShatter', 1]];
      case 'txDive': return [['txPuff', 0.85], ['txBurrow', 0.6]];
      case 'txPop': return [['txPop', 0.75]];
    }
    return null;
  },
  sounds: {
    // the fish whipped out from behind his back: a quick airy whoosh and a rubbery flap
    txWhip: ({ osc, hiss }) => (v, t) => { hiss(t, 0.12, 0.16 * v, 'bandpass', 900, 2600); osc(t + 0.05, 260, 0.07, 'triangle', 0.06 * v, 180); },
    // the swing: a whoosh rising through the air
    txSwish: ({ hiss }) => (v, t) => { hiss(t, 0.14, 0.22 * v, 'bandpass', 700, 3200); hiss(t + 0.02, 0.08, 0.08 * v, 'highpass', 4000); },
    // THWACK: a wet slap (a short low noise burst with a pitch drop) and a frosty crackle on top
    txThwack: ({ osc, hiss }) => (v, t) => {
      hiss(t, 0.07, 0.42 * v, 'lowpass', 2400, 500); osc(t, 230, 0.09, 'sine', 0.24 * v, -150); osc(t, 520, 0.04, 'square', 0.05 * v, -300);
      for (let k = 0; k < 3; k++) osc(t + 0.03 + k * 0.025, [3300, 2600, 3000][k], 0.03, 'triangle', 0.04 * v, -800);
    },
    // the wallop: a big low WHUMP, the slap on top of it, ice crunching, and a wobbly boing as the fish bends
    txWallop: ({ osc, hiss }) => (v, t) => {
      osc(t, 120, 0.22, 'sine', 0.34 * v, -70); hiss(t, 0.12, 0.45 * v, 'lowpass', 2000, 300); osc(t, 300, 0.08, 'square', 0.07 * v, -200);
      hiss(t + 0.03, 0.18, 0.16 * v, 'bandpass', 3800, 1800);
      osc(t + 0.08, 330, 0.3, 'sine', 0.08 * v, -120); osc(t + 0.08, 340, 0.3, 'sine', 0.05 * v, -40);
    },
    // a whiff: the fish flopping about, a wobbly flap-flap
    txFloppy: ({ osc }) => (v, t) => { for (let k = 0; k < 3; k++) osc(t + k * 0.08, 200 - k * 25, 0.07, 'triangle', 0.07 * v * (1 - k * 0.25), -60); },
    // frozen stiff: a glassy crackle, crystals tinkling
    txFreeze: ({ osc, hiss }) => (v, t) => { hiss(t, 0.25, 0.1 * v, 'highpass', 5000); for (let k = 0; k < 5; k++) osc(t + k * 0.035, 2200 + k * 380, 0.09, 'sine', 0.04 * v, 400); },
    // the slide: a long icy whoosh, falling away
    txSlideGo: ({ osc, hiss }) => (v, t) => { hiss(t, 0.5, 0.2 * v, 'bandpass', 1800, 700); hiss(t, 0.35, 0.07 * v, 'highpass', 5200); osc(t, 150, 0.12, 'sine', 0.12 * v, -60); },
    // a ram: a thump and a crunch of snow
    txCrunch: ({ osc, hiss }) => (v, t) => { osc(t, 110, 0.18, 'sine', 0.28 * v, -50); for (let k = 0; k < 4; k++) hiss(t + k * 0.03, 0.05, 0.2 * v * (1 - k * 0.18), 'bandpass', 1400 + k * 500); },
    // the armour growing: ice crackling up him, a shimmer rising
    txGrow: ({ osc, hiss }) => (v, t) => {
      for (let k = 0; k < 7; k++) { osc(t + k * 0.04, 900 + k * 260, 0.12, 'sine', 0.035 * v, 300); hiss(t + k * 0.045, 0.03, 0.08 * v, 'highpass', 4200 + k * 300); }
      hiss(t, 0.32, 0.06 * v, 'bandpass', 3000, 6000);
    },
    // set: a bright crystalline ring
    txSet: ({ osc }) => (v, t) => { osc(t, 1760, 0.4, 'sine', 0.06 * v); osc(t, 2637, 0.3, 'sine', 0.04 * v); osc(t + 0.02, 3520, 0.18, 'triangle', 0.025 * v); },
    // a chip off the armour: a hard glassy clink
    txChip: ({ osc, hiss }) => (v, t) => { osc(t, 2900, 0.06, 'triangle', 0.09 * v, -900); osc(t, 1700, 0.12, 'sine', 0.06 * v, -300); hiss(t, 0.05, 0.15 * v, 'highpass', 4500); },
    // the armour bursting: a glassy crash, shards tinkling down after it
    txShatter: ({ osc, hiss }) => (v, t) => {
      hiss(t, 0.3, 0.38 * v, 'highpass', 2600, 6000); osc(t, 160, 0.18, 'sine', 0.2 * v, -80);
      for (let k = 0; k < 9; k++) osc(t + 0.03 + k * 0.03 + Math.random() * 0.02, 2000 + Math.random() * 2600, 0.06, 'triangle', 0.05 * v * (1 - k * 0.08), -600);
    },
    // the slide's flop: a little grunt of a hop and a belly smacking down on the ice
    txHop: ({ osc, hiss }) => (v, t) => { osc(t, 330, 0.07, 'triangle', 0.08 * v, 140); osc(t + 0.12, 105, 0.14, 'sine', 0.24 * v, -40); hiss(t + 0.12, 0.1, 0.16 * v, 'lowpass', 1300, 300); },
    // off a wall: a rubbery penguin boing and a scuff of snow
    txBoing: ({ osc, hiss }) => (v, t) => { osc(t, 170, 0.26, 'sine', 0.2 * v, 230); osc(t + 0.01, 345, 0.16, 'triangle', 0.06 * v, 260); hiss(t, 0.07, 0.15 * v, 'bandpass', 2200); },
    // a slide that missed: sliding to a stop, flat on his belly, a squeaky skid and a soft splat
    txSplat: ({ osc, hiss }) => (v, t) => { hiss(t, 0.22, 0.1 * v, 'bandpass', 2600, 900); osc(t + 0.02, 620, 0.16, 'triangle', 0.035 * v, -260); osc(t + 0.18, 90, 0.16, 'sine', 0.2 * v, -30); },
    // the armour running out untouched: meltwater dripping, plinks falling in pitch
    txMelt: ({ osc }) => (v, t) => { for (let k = 0; k < 4; k++) osc(t + k * 0.07, 1500 - k * 180, 0.08, 'sine', 0.05 * v * (1 - k * 0.15), 700); },
    // under the snow: a muffled scrabble running along
    txBurrow: ({ hiss }) => (v, t) => { for (let k = 0; k < 5; k++) hiss(t + 0.06 + k * 0.05, 0.05, 0.1 * v, 'lowpass', 700, 250); },
    // the dive: a soft puff of snow
    txPuff: ({ hiss, osc }) => (v, t) => { hiss(t, 0.2, 0.3 * v, 'lowpass', 1600, 300); osc(t, 180, 0.08, 'sine', 0.08 * v, -80); },
    // popped out: a cute pop and a puff
    txPop: ({ osc, hiss }) => (v, t) => { osc(t, 380, 0.08, 'sine', 0.16 * v, 520); hiss(t + 0.02, 0.15, 0.2 * v, 'lowpass', 1800, 400); },
  },
};
export default art;
// the prow of ice on his nose while he slides armoured (g in world units)
function prow(g, f) {
  g.save(); g.translate(f.x, f.y - (f.z || 0));
  if (!drawProp3D(g, 'txprow', { yaw: f.face, scale: SC })) { const c = Math.cos(f.face), s = Math.sin(f.face); g.fillStyle = 'rgba(190,232,255,0.85)'; g.beginPath(); g.moveTo(c * 52, s * 52 * D3 - 7); g.lineTo(c * 34 - s * 17, (s * 34 + c * 17) * D3 - 2); g.lineTo(c * 34 + s * 17, (s * 34 - c * 17) * D3 - 2); g.closePath(); g.fill(); }
  g.restore();
}
