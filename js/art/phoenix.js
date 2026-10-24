// Kernel Kart art: secret shortcuts (race-secret.js), the phoenix kind (Pyth Plateau). A big carved sun stone out past
// the run-off at the foot of the Pyramid of the Sun, glowing faintly, and on the lap whose road it's on, unmistakably awake:
// the temple pulses gold, sunbeams reach from it to the stone, a trail of little sun glyphs lights up one after another
// from the road's edge out to it, and the stone blazes with heat shimmering off it. The ride is a rocket swoop: a burst
// of flame and light, then a phoenix of the sun in Pyth's blue and gold with fiery orange (big swept wings beating, a
// crest of flame, a flame tail with two long blue-eyed plumes, a sun disc and its rays behind, the racer riding on its
// back) climbs, streaks over the temple trailing fire and feathers, and dives onto the road, folding back into the kart.
// Everything is drawn from the ride's pose (secretPose, from the clock), so it's smooth online too; the only particles
// are the race's bursts at take-off and landing. Lit from the top left; heights go straight up the screen.
import { TAU, clamp } from '../core.js';
import { circ, ell, linear, poly, radial, star } from './paint.js';
import { drawMascot } from './mascots.js';
import { clearingsOf } from './props.js';
import { sunPyramidOf } from './plateau.js';
import { trackSample } from '../geometry.js';
import { BLAST, SECRET, landingOf } from '../race-secret.js';

const BLUE = '#3776ab', BLUE_LT = '#7cc0f5', BLUE_DK = '#1f4d78', YEL = '#ffd43b', GOLD = '#f5b31a', EMBER = '#ff7a1a', HOT = '#fff6c9', INK = '#3a1f12';
const H_REF = 420;   // the ride's height at its top (race-secret.js SECRET.phoenix.H)
const smooth = q => q * q * (3 - 2 * q);
// how big the phoenix is drawn: it grows as it climbs (closer to the camera), to about three times at the top
export const birdScale = P => 1.35 * (1 + 1.2 * clamp(P.h / H_REF, 0, 1)) * (0.5 + 0.5 * P.bird);
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

// a little sun: a disc and its rays (the glyphs on the way out, the stone's face)
function sun(g, x, y, r) { star(g, x, y, r, 8, 0.6, -Math.PI / 2); }

// ------------------------------------------------------------------------------------------------ the sun stone
// baked into the track layer: a big round carved stone set into the ground with an ink rim, a ring of Pyth-blue tiles,
// eight gilded rays, carved glyphs between them and a sun's face in gold in the middle. r: the trigger's radius.
export function secretStatic(g, T, z) {
  if (z.kind !== 'phoenix' || (T.def.secrets[z.k] || {}).altar === 'landmark') return;   // (Pyth Plateau: the Pyramid of the Sun's sun altar is the trigger, art/plateau.js)
  const { x, y } = z, r = z.r * 0.95;
  g.save(); g.translate(x, y);
  ell(g, 6, 8, r * 1.06, r * 0.98); g.fillStyle = 'rgba(70,30,10,0.28)'; g.fill();   // its shadow, down-right
  circ(g, 0, 0, r); g.fillStyle = radial(g, -r * 0.3, -r * 0.35, r * 0.1, 0, 0, r, [[0, '#f6ead0'], [0.7, '#dcc69c'], [1, '#b89d70']]); g.fill();
  g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
  for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; g.save(); g.rotate(a); g.fillStyle = k % 2 ? BLUE : BLUE_DK; g.fillRect(r * 0.8, -r * 0.08, r * 0.15, r * 0.16); g.restore(); }   // the ring of tiles
  circ(g, 0, 0, r * 0.78); g.strokeStyle = 'rgba(58,31,18,0.6)'; g.lineWidth = 1.6; g.stroke();
  star(g, 0, 0, r * 0.76, 8, 0.42, -Math.PI / 2); g.fillStyle = linear(g, -r, -r, r, r, [[0, '#ffe680'], [0.5, GOLD], [1, '#b67a00']]); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.8; g.stroke();
  g.fillStyle = 'rgba(90,60,30,0.55)'; for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * TAU - Math.PI / 2; g.fillRect(Math.cos(a) * r * 0.6 - 3, Math.sin(a) * r * 0.6 - 3, 6, 6); }
  circ(g, 0, 0, r * 0.36); g.fillStyle = radial(g, -r * 0.1, -r * 0.12, 1, 0, 0, r * 0.36, [[0, '#fff3a6'], [0.6, YEL], [1, '#d99a00']]); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.8; g.stroke();
  g.fillStyle = INK; for (const ex of [-1, 1]) { circ(g, ex * r * 0.12, -r * 0.06, r * 0.045); g.fill(); }
  g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.arc(0, r * 0.05, r * 0.14, 0.35, Math.PI - 0.35); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.45)'; ell(g, -r * 0.42, -r * 0.5, r * 0.2, r * 0.08, -0.6); g.fill();
  g.restore();
}

// ------------------------------------------------------------------------------------------------ under the cars
// whose screen this is, on the lap the stone's road is on: it's awake
const awakeFor = (race, T) => (race.localHumans || race.humans).some(c => c.T === T && !c.finished);
// the Pyramid of the Sun (or whatever landmark the stone sits at the foot of): the clearing nearest the stone
const shrines = new WeakMap();
function shrineOf(race, z) {
  if (shrines.has(z)) return shrines.get(z);
  const C = clearingsOf(race.track); if (!C) return null;   // (the track layer places them: not before it's drawn)
  let best = null; for (const m of C) { const d = Math.hypot(m.x - z.x, m.y - z.y); if (d < 700 && (!best || d < best.d)) best = { x: m.x, y: m.y, r: m.r, d }; }
  shrines.set(z, best); return best;
}
// the stone's glow (always), and on its lap the temple pulsing, sunbeams to the stone, a chase of glyphs out to it, heat
// shimmer off it; a pillar of light while it takes someone
export function secretGlow(ctx, race, T, z, t) {
  if (z.kind !== 'phoenix') return;
  let near = 0, taking = 0;
  for (const c of race.cars) {
    if (c.secretT > 0 && c.T === T && c.secretK === z.k) taking = 1;
    else if (c.T === T) near = Math.max(near, clamp(1 - (Math.hypot(c.x - z.x, c.y - z.y) - z.r) / 300, 0, 1));
  }
  const awake = awakeFor(race, T) ? 1 : 0, r = z.r, pulse = 0.5 + 0.5 * Math.sin(t * 3 + z.k), a = 0.16 + 0.1 * pulse + 0.3 * awake + 0.35 * near;
  const G = sunPyramidOf(race.track);
  if (G) pyramidLights(ctx, race, T, z, G, t, awake, near, taking);
  else {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  // the temple, awake: a gold pulse over it and three soft sunbeams from it to the stone
  const S = awake && shrineOf(race, z);
  if (S) {
    const pk = 0.5 + 0.5 * Math.sin(t * 2.4);
    ctx.fillStyle = radial(ctx, S.x, S.y, S.r * 0.1, S.x, S.y, S.r * 0.75, [[0, `rgba(255,220,110,${0.2 + 0.14 * pk})`], [0.6, `rgba(255,190,60,${0.08 + 0.06 * pk})`], [1, 'rgba(255,170,40,0)']]); circ(ctx, S.x, S.y, S.r * 0.75); ctx.fill();
    const ang = Math.atan2(z.y - S.y, z.x - S.x), len = Math.hypot(z.x - S.x, z.y - S.y);
    for (let k = -1; k <= 1; k++) {
      const a0 = ang + k * 0.16, w = 0.05 + 0.02 * Math.sin(t * 2 + k), sweep = (t * 0.35 + k * 0.33) % 1;
      ctx.fillStyle = linear(ctx, S.x, S.y, z.x, z.y, [[0, 'rgba(255,230,140,0)'], [0.35, `rgba(255,225,130,${0.1 + 0.06 * Math.sin(t * 3 + k)})`], [1, 'rgba(255,240,170,0.22)']]);
      poly(ctx, [[S.x + Math.cos(a0) * S.r * 0.2, S.y + Math.sin(a0) * S.r * 0.2], [S.x + Math.cos(a0 - w) * len, S.y + Math.sin(a0 - w) * len], [S.x + Math.cos(a0 + w) * len, S.y + Math.sin(a0 + w) * len]]); ctx.fill();
      const sx = S.x + Math.cos(a0) * len * sweep, sy = S.y + Math.sin(a0) * len * sweep;   // a glint running down each beam
      ctx.fillStyle = radial(ctx, sx, sy, 0, sx, sy, 16, [[0, 'rgba(255,250,220,0.5)'], [1, 'rgba(255,230,140,0)']]); circ(ctx, sx, sy, 16); ctx.fill();
    }
  }
  // the stone's glow and its turning rays
  ctx.fillStyle = radial(ctx, z.x, z.y, r * 0.2, z.x, z.y, r * (2 + near + awake * 0.6), [[0, `rgba(255,214,90,${a})`], [0.5, `rgba(255,170,40,${a * 0.4})`], [1, 'rgba(255,150,30,0)']]);
  circ(ctx, z.x, z.y, r * (2 + near + awake * 0.6)); ctx.fill();
  ctx.save(); ctx.translate(z.x, z.y); ctx.rotate(t * 0.4); ctx.fillStyle = `rgba(255,225,120,${0.08 + 0.18 * awake + 0.2 * near})`;
  for (let k = 0; k < 12; k++) { ctx.rotate(TAU / 12); ctx.beginPath(); ctx.moveTo(r * 0.95, -r * 0.09); ctx.lineTo(r * (1.6 + 0.5 * awake + (k % 2) * 0.45), 0); ctx.lineTo(r * 0.95, r * 0.09); ctx.fill(); }
  ctx.restore();
  // a chase of sun glyphs out from the road's edge to the stone, and heat shimmering up off it
  if (awake) {
    const A = trackSample(T, z.sIn), ex = A.x + A.nx * z.side * (A.hw + 18), ey = A.y + A.ny * z.side * (A.hw + 18), n = 5;
    for (let k = 0; k < n; k++) {
      const q = (k + 0.5) / n, gx = ex + (z.x - ex) * q * 0.82, gy = ey + (z.y - ey) * q * 0.82, lit = Math.max(0, Math.cos((t * 1.6 - q) * TAU)) ** 3;
      ctx.fillStyle = radial(ctx, gx, gy, 0, gx, gy, 20, [[0, `rgba(255,236,150,${0.25 + 0.6 * lit})`], [1, 'rgba(255,190,60,0)']]); circ(ctx, gx, gy, 20); ctx.fill();
      ctx.fillStyle = `rgba(255,${210 + 40 * lit | 0},110,${0.35 + 0.55 * lit})`; sun(ctx, gx, gy, 6 + 2 * lit); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,240,200,0.18)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      const x0 = z.x + (k - 1.5) * r * 0.4, ph = (t * 0.9 + k * 0.27) % 1, y0 = z.y - r * 0.2 - ph * r * 1.6;
      ctx.globalAlpha = Math.sin(ph * Math.PI); ctx.beginPath(); ctx.moveTo(x0, y0);
      for (let j = 1; j <= 6; j++) ctx.lineTo(x0 + Math.sin(t * 7 + j + k) * 4, y0 - j * 7);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  // on it without the fire: little tongues of flame lick up round the rim and die back
  if (near > 0.9 && !taking) { ctx.save(); ctx.translate(z.x, z.y); ctx.globalCompositeOperation = 'lighter'; for (let k = 0; k < 7; k++) flame(ctx, Math.cos(k / 7 * TAU + t) * r * 0.9, Math.sin(k / 7 * TAU + t) * r * 0.9 * 0.8, 7 + 5 * Math.sin(t * 13 + k * 2), t * 9 + k, 0.7); ctx.restore(); }
  if (taking) beam(ctx, z.x, z.y, r, t);
  }
  // the firestorm lights up the ground under it as it goes: a moving pool of orange light; and where it will come down,
  // a target ring the size of the blast, closing in as it dives
  for (const c of race.cars) {
    if (!(c.secretT > 0) || c.T !== T || c.secretK !== z.k) continue;
    const f = clamp(1 - c.secretT / SECRET.phoenix.T, 0, 1), a = Math.sin(Math.PI * clamp(f / 0.95, 0, 1));
    if (f > 0.5) {
      const L = landingOf(z), q = clamp((f - 0.5) / 0.45, 0, 1), pulse = 0.5 + 0.5 * Math.sin(t * 14);
      ctx.save();
      ctx.fillStyle = radial(ctx, L.x, L.y, BLAST * 0.2, L.x, L.y, BLAST, [[0, `rgba(255,70,20,${0.1 + 0.25 * q})`], [0.85, `rgba(255,60,20,${0.18 + 0.2 * q})`], [1, `rgba(255,60,20,${0.05 * q})`]]); circ(ctx, L.x, L.y, BLAST); ctx.fill();
      ctx.lineWidth = 7; ctx.strokeStyle = `rgba(255,${60 + 120 * pulse | 0},30,${0.5 + 0.4 * q})`; ctx.setLineDash([28, 18]); ctx.lineDashOffset = -t * 120; circ(ctx, L.x, L.y, BLAST); ctx.stroke(); ctx.setLineDash([]);
      ctx.lineWidth = 4; ctx.strokeStyle = `rgba(255,230,160,${0.4 + 0.5 * q})`; circ(ctx, L.x, L.y, BLAST * (1 - q * 0.85) + 8); ctx.stroke();   // closing in: it hits when this reaches the middle
      for (let k = 0; k < 4; k++) { const an = k * Math.PI / 2 + t; ctx.beginPath(); ctx.moveTo(L.x + Math.cos(an) * 22, L.y + Math.sin(an) * 22); ctx.lineTo(L.x + Math.cos(an) * 60, L.y + Math.sin(an) * 60); ctx.stroke(); }
      ctx.restore();
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = radial(ctx, c.x, c.y, 10, c.x, c.y, 340, [[0, `rgba(255,190,90,${0.5 * a})`], [0.5, `rgba(255,120,30,${0.2 * a})`], [1, 'rgba(255,90,20,0)']]); circ(ctx, c.x, c.y, 340); ctx.fill();
    ctx.restore();
  }
}
// The Pyramid of the Sun as the trigger (Pyth Plateau): always, its sun altar glows softly; on the lap whose road it's on
// the whole pyramid wakes up: golden light climbs the stair, runs along each ledge in turn, the suns on its bands glow,
// the doorway of the temple on top shines, the braziers flare; and while it takes someone it blazes: everything bright,
// the stair lit like a runway, light pouring up out of the temple.
function pyramidLights(ctx, race, T, z, G, t, awake, near, taking) {
  const k = Math.max(awake, near * 0.6), blaze = taking ? 1 : 0, f = taking ? rideF(race, T, z) : 0;
  const lv = Math.min(1, k + blaze), A = (r, g, b, al) => `rgba(${r},${g},${b},${al})`;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  // the sun altar at the foot (the trigger): a warm pool of light, brighter as a kart comes near
  const ax = z.x, ay = z.y - z.r * 0.1, aa = 0.25 + 0.15 * Math.sin(t * 3) + 0.35 * near + 0.3 * awake + 0.6 * blaze;
  ctx.fillStyle = radial(ctx, ax, ay, 4, ax, ay, z.r * 1.8, [[0, A(255, 226, 140, aa)], [0.5, A(255, 170, 60, aa * 0.4)], [1, A(255, 140, 40, 0)]]); circ(ctx, ax, ay, z.r * 1.8); ctx.fill();
  if (lv > 0.01) {
    const S = G.stair, x0 = S.x - S.w, x1 = S.x + S.w;
    // the stair: a steady glow up its length, and bands of gold light climbing it (racing when it blazes)
    ctx.fillStyle = linear(ctx, 0, S.ya, 0, S.yb, [[0, A(255, 220, 130, 0.18 * lv + 0.3 * blaze)], [1, A(255, 240, 180, 0.08 * lv + 0.35 * blaze)]]); ctx.fillRect(x0, S.yb, x1 - x0, S.ya - S.yb);
    for (let q = 0; q < 5; q++) {
      const p = (t * (blaze ? 2.2 : 0.55) + q / 5) % 1, y = S.ya + (S.yb - S.ya) * p, h = 6 + 10 * blaze;
      ctx.fillStyle = linear(ctx, 0, y - h, 0, y + h, [[0, A(255, 230, 150, 0)], [0.5, A(255, 236, 160, (0.55 + 0.3 * blaze) * lv * (1 - p * 0.5))], [1, A(255, 230, 150, 0)]]); ctx.fillRect(x0 - 2, y - h, x1 - x0 + 4, h * 2);
    }
    // each ledge's front edge lights up in turn, bottom to top
    G.lips.forEach(([a, b], i) => {
      const ph = Math.max(0, Math.sin((t * 1.4 - i * 0.45) * Math.PI)) ** 2, al = (0.25 + 0.6 * ph) * lv + 0.4 * blaze;
      ctx.strokeStyle = A(255, 214, 110, al * 0.5); ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.strokeStyle = A(255, 245, 200, al); ctx.lineWidth = 2; ctx.stroke();
    });
    // the suns carved on the bands glow
    G.glyphs.forEach(([x, y, r], i) => { const al = (0.35 + 0.35 * Math.sin(t * 4 + i)) * lv + 0.4 * blaze; ctx.fillStyle = radial(ctx, x, y, 0, x, y, r * 3, [[0, A(255, 236, 150, al)], [1, A(255, 180, 60, 0)]]); circ(ctx, x, y, r * 3); ctx.fill(); });
    // the temple's doorway shines, and light pours up out of it as it blazes
    const D = G.door, da = 0.45 * lv + 0.5 * blaze + 0.1 * Math.sin(t * 9);
    ctx.fillStyle = radial(ctx, D.x, D.y, 1, D.x, D.y, D.w * 4, [[0, A(255, 240, 180, da)], [0.4, A(255, 190, 80, da * 0.5)], [1, A(255, 150, 40, 0)]]); circ(ctx, D.x, D.y, D.w * 4); ctx.fill();
    if (blaze) {
      const top = D.y - D.h * 0.5, hb = 900, q = Math.min(1, f / 0.05);
      ctx.fillStyle = linear(ctx, 0, top - hb, 0, top, [[0, A(255, 230, 150, 0)], [1, A(255, 240, 190, 0.45 * q)]]);
      poly(ctx, [[D.x - D.w, top], [D.x + D.w, top], [D.x + D.w * 3, top - hb], [D.x - D.w * 3, top - hb]]); ctx.fill();
      // and the whole pyramid glows
      const cx = S.x, cy = (S.ya + G.top[1]) / 2, R = (S.ya - G.top[1]) * 0.9;
      ctx.fillStyle = radial(ctx, cx, cy, R * 0.1, cx, cy, R, [[0, A(255, 200, 100, 0.3 * q)], [1, A(255, 150, 40, 0)]]); circ(ctx, cx, cy, R); ctx.fill();
    }
  }
  ctx.restore();
  // the braziers flare (solid flames: over the pale stone 'lighter' would only white out)
  if (lv > 0.01) for (const [x, y] of G.braziers) for (let q = 0; q < 3; q++) flame(ctx, x + (q - 1) * 3, y, (8 + 6 * lv + 14 * blaze) * (0.8 + 0.3 * Math.sin(t * 13 + q * 2)), t * 12 + q * 1.7 + x, 0.8);
  // on the altar without the fire: little tongues of flame lick up round it and die back
  if (near > 0.9 && !taking) { ctx.save(); ctx.translate(ax, ay); ctx.globalCompositeOperation = 'lighter'; for (let q = 0; q < 7; q++) flame(ctx, Math.cos(q / 7 * TAU + t) * z.r * 0.5, Math.sin(q / 7 * TAU + t) * z.r * 0.32, 7 + 5 * Math.sin(t * 13 + q * 2), t * 9 + q, 0.7); ctx.restore(); }
}
// how far through its ride the kart a secret is taking is (0..1)
function rideF(race, T, z) { for (const c of race.cars) if (c.secretT > 0 && c.T === T && c.secretK === z.k) return clamp(1 - c.secretT / SECRET[z.kind].T, 0, 1); return 0; }
// a pillar of sunlight coming down on the stone (as it takes someone)
function beam(ctx, x, y, r, t) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const w = r * (1.1 + 0.08 * Math.sin(t * 30));
  ctx.fillStyle = linear(ctx, 0, y - 900, 0, y, [[0, 'rgba(255,230,140,0)'], [0.6, 'rgba(255,220,120,0.25)'], [1, 'rgba(255,240,180,0.55)']]);
  poly(ctx, [[x - w * 0.5, y - 900], [x + w * 0.5, y - 900], [x + w, y], [x - w, y]]); ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ the ride
// its shadow on the ground (drawn at the kart): a bird's shape that shrinks and slides off down-right as it climbs
export function secretShadow(ctx, c, P) {
  if (P.kind !== 'phoenix') return;
  const up = clamp(P.h / H_REF, 0, 1), k = (1 - 0.45 * up) * (0.6 + 0.4 * P.bird), sx = P.h * 0.42, sy = P.h * 0.22;
  ctx.save(); ctx.translate(sx, sy); ctx.globalAlpha *= 0.28 * (1 - 0.4 * up) * Math.max(P.bird, P.kart);
  ctx.fillStyle = '#2a1608'; ctx.scale(k, k);
  const fl = Math.sin(P.flap) * 0.5;
  ell(ctx, 0, 0, 14, 22, P.dir + Math.PI / 2); ctx.fill();
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, -4); ctx.quadraticCurveTo(s * 44, -26 - fl * 18, s * 80, -10 - fl * 26); ctx.quadraticCurveTo(s * 40, 8, 0, 8); ctx.fill(); }
  ctx.restore();
}

// over everything: the take-off burst, the trail, speed streaks, the phoenix and its rider
export function secretOver(ctx, race, c, P, t) {
  if (P.kind !== 'phoenix') return;
  const x = c.x + c.jx, y = c.y + c.jy - P.h, k = 1 + 1.2 * clamp(P.h / H_REF, 0, 1), dx = Math.cos(P.dir), dy = Math.sin(P.dir);
  ctx.save();
  // the sky darkens to a fiery orange while it's summoned (multiplied over the world round it), warm light round the bird
  const sum = smooth(clamp(P.f / 0.1, 0, 1)) * smooth(clamp((1 - P.f) / 0.14, 0, 1));
  if (sum > 0.01) {
    const cx = c.x, cy = c.y - P.h * 0.5;
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgba(255,${150 - 30 * sum | 0},${100 - 40 * sum | 0},${0.5 * sum})`; ctx.fillRect(cx - 3200, cy - 2600, 6400, 5200);
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = radial(ctx, x, y, 20, x, y, 900, [[0, `rgba(255,200,110,${0.3 * sum})`], [0.4, `rgba(255,140,50,${0.12 * sum})`], [1, 'rgba(255,110,30,0)']]); circ(ctx, x, y, 900); ctx.fill();
    // heat waves rippling up across the whole view
    ctx.strokeStyle = `rgba(255,220,170,${0.09 * sum})`; ctx.lineWidth = 7; ctx.lineCap = 'round';
    for (let q = 0; q < 9; q++) {
      const ph = (t * 0.45 + q / 9) % 1, ry = cy + 900 - ph * 1800; ctx.globalAlpha = Math.sin(ph * Math.PI);
      ctx.beginPath(); for (let j = 0; j <= 28; j++) { const rx = cx - 1500 + j * 110, wy = ry + Math.sin(j * 0.7 + t * 3 + q) * 14; j ? ctx.lineTo(rx, wy) : ctx.moveTo(rx, wy); } ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // a giant sun rising behind it, its rays turning
    if (P.bird > 0.02) {
      const R = 230 * k * P.bird, sy = y - 30 * k;
      ctx.fillStyle = radial(ctx, x, sy, R * 0.05, x, sy, R, [[0, 'rgba(255,252,230,0.55)'], [0.3, 'rgba(255,224,120,0.35)'], [0.65, 'rgba(255,150,50,0.15)'], [1, 'rgba(255,110,30,0)']]); circ(ctx, x, sy, R); ctx.fill();
      ctx.save(); ctx.translate(x, sy); ctx.rotate(t * 0.5);
      for (let q = 0; q < 24; q++) { ctx.rotate(TAU / 24); ctx.fillStyle = q % 2 ? 'rgba(255,214,90,0.2)' : 'rgba(255,160,50,0.16)'; ctx.beginPath(); ctx.moveTo(R * 0.7, -R * 0.05); ctx.lineTo(R * (q % 2 ? 1.6 : 1.95), 0); ctx.lineTo(R * 0.7, R * 0.05); ctx.fill(); }
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // the trail: a ribbon of fire along where it's been, loose feathers and embers falling off it
  if (P.bird > 0.05) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const pts = []; for (let q = 0; q <= 24; q++) pts.push(P.trail(q * 0.011));
    for (const [wk, col, al] of [[1.5, '255,70,20', 0.28], [1, '255,110,24', 0.6], [0.62, '255,180,40', 0.75], [0.26, '255,248,215', 0.9]]) for (let q = 1; q < pts.length; q++) {   // fire: a smoky red fringe, red-orange, gold, a white-hot core
      const a = (1 - q / pts.length) * P.bird, w = (58 - q * 2) * k * wk * (1 + 0.12 * Math.sin(t * 20 + q));
      ctx.strokeStyle = `rgba(${col},${al * a})`; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(pts[q - 1].x, pts[q - 1].y); ctx.lineTo(pts[q].x, pts[q].y); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let q = 2; q < pts.length; q++) for (let e = 0; e < 3; e++) {
      const h1 = hash(q + Math.floor(P.f * 50), e), h2 = hash(e, q * 3.1), p = pts[q];
      ctx.fillStyle = `rgba(255,${180 + 60 * h2 | 0},80,${0.75 * (1 - q / pts.length) * P.bird})`;
      circ(ctx, p.x + (h1 - 0.5) * 44, p.y + (h2 - 0.5) * 34 + q * 2.5, 1.5 + 2.2 * h1); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let q = 3; q < pts.length; q += 4) {   // a loose feather tumbling down off the trail
      const p = pts[q], fa = (1 - q / pts.length) * P.bird, rot = t * 5 + q;
      ctx.save(); ctx.translate(p.x + (hash(q, 4) - 0.5) * 30, p.y + q * 3); ctx.rotate(rot); ctx.globalAlpha = fa;
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.quadraticCurveTo(0, -4, 8, 0); ctx.quadraticCurveTo(0, 4, -7, 0); ctx.fillStyle = q % 8 === 3 ? BLUE_LT : YEL; ctx.fill();
      ctx.restore();
    }
  }
  // taking off: a pillar of fire roaring up out of the pyramid's top (behind the burst): a tapering body of flame in three
  // layers whose wavering edges close to nothing at the top, a soft glow at its foot, tongues of flame breaking off and
  // licking up it, smoke rolling off its top and sparks flying up. No hard edges anywhere: everything fades out.
  if (P.f < 0.34) {
    const G = sunPyramidOf(race.track), q = clamp(P.f / 0.05, 0, 1) * clamp((0.34 - P.f) / 0.14, 0, 1), sx = G ? G.top[0] : c.secretX, sy = (G ? G.top[1] : c.secretY) + 26;   // (from the pyramid's top, if there is one; its foot down in the temple's roof)
    const H = 1500 * (0.45 + 0.55 * clamp(P.f / 0.08, 0, 1));
    ctx.save();
    for (const [wk, col, al, ph] of [[1, '255,84,20', 0.55, 0], [0.62, '255,150,40', 0.7, 1.7], [0.3, '255,242,195', 0.85, 3.1]]) {
      const Wd = 120 * wk, Hh = H * (0.7 + 0.3 * wk), N = 26, edge = (u, side) => sx + side * Wd * Math.pow(1 - u, 0.8) * (1 + 0.22 * Math.sin(u * 13 - t * 15 * side + ph) + 0.12 * Math.sin(u * 31 + t * 23 + ph * 2)) + Math.sin(u * 5 + t * 4 + ph) * 18 * u;
      ctx.beginPath(); ctx.moveTo(edge(0, -1), sy);
      for (let k = 1; k <= N; k++) { const u = k / N; ctx.lineTo(edge(u, -1), sy - Hh * u); }
      for (let k = N; k >= 0; k--) { const u = k / N; ctx.lineTo(edge(u, 1), sy - Hh * u); }
      ctx.closePath();
      ctx.fillStyle = linear(ctx, 0, sy, 0, sy - Hh, [[0, `rgba(${col},${al * q})`], [0.55, `rgba(${col},${al * q * 0.75})`], [1, `rgba(${col},0)`]]); ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = radial(ctx, sx, sy, 6, sx, sy, 150, [[0, `rgba(255,248,210,${0.8 * q})`], [0.4, `rgba(255,190,80,${0.35 * q})`], [1, 'rgba(255,140,40,0)']]); ell(ctx, sx, sy, 150, 90); ctx.fill();   // its foot, glowing
    ctx.globalCompositeOperation = 'source-over';
    for (let j = 0; j < 16; j++) {   // tongues of flame licking up it and breaking away
      const ph = (t * 0.9 + hash(j, 3)) % 1, u = 0.08 + ph * 0.9, y = sy - H * u, x = sx + Math.sin(j * 2.3 + t * 3) * 70 * (1 - u * 0.6);
      flame(ctx, x, y, (90 - 60 * u) * (0.7 + 0.5 * hash(j, 5)) * q, t * 12 + j * 1.9, q * (1 - ph) * 0.9);
    }
    for (let j = 0; j < 10; j++) {   // smoke rolling off its top
      const ph = (t * 0.4 + j / 10) % 1, y = sy - H * (0.7 + 0.35 * ph), x = sx + (hash(j, 7) - 0.5) * 200 * (0.5 + ph), r = 40 + 80 * ph;
      ctx.fillStyle = `rgba(70,46,36,${0.22 * q * Math.sin(ph * Math.PI)})`; circ(ctx, x, y, r); ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let j = 0; j < 28; j++) {   // sparks flying up
      const ph = (t * 0.7 + hash(j, 11)) % 1, y = sy - H * ph * 1.05, x = sx + (hash(j, 13) - 0.5) * 260 * (0.3 + ph);
      ctx.fillStyle = `rgba(255,${200 + 50 * hash(j, 2) | 0},120,${0.9 * q * (1 - ph)})`; circ(ctx, x, y, 2 + 2.5 * hash(j, 4)); ctx.fill();
    }
    ctx.restore();
  }
  // taking off: a burst of flame and light round the kart, then a flash as the bird bursts out
  if (P.f < 0.3) {
    const n = clamp(P.f / 0.12, 0, 1), out = clamp((P.f - 0.08) / 0.2, 0, 1);
    ctx.save(); ctx.translate(c.x, c.y - P.h * 0.5); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = radial(ctx, 0, -10, 2, 0, -10, 90 * (0.5 + n), [[0, `rgba(255,248,210,${0.85 * n * (1 - out)})`], [0.45, `rgba(255,170,50,${0.4 * n * (1 - out)})`], [1, 'rgba(255,120,20,0)']]);
    circ(ctx, 0, -10, 90 * (0.5 + n)); ctx.fill();
    for (let q = 0; q < 10; q++) { const a = q / 10 * TAU + q; flame(ctx, Math.cos(a) * (28 + 40 * out), Math.sin(a) * (16 + 20 * out) + 6, (12 + 26 * n) * (0.7 + 0.5 * hash(q, 2)) * (1 - out * 0.6), t * 11 + q * 1.7, n * (1 - out)); }
    ctx.restore();
  }
  // speed streaks behind it as it streaks across
  const fast = P.bird * clamp(Math.sin(Math.PI * clamp((P.f - 0.12) / 0.8, 0, 1)) * 1.4, 0, 1);
  if (fast > 0.05) {
    ctx.save(); ctx.lineCap = 'round';
    for (let q = 0; q < 7; q++) {
      const off = (hash(q, 1) - 0.5) * 120 * k, along = 40 + hash(q, 2) * 60, len = (80 + hash(q, 3) * 90) * fast, ph = (t * 6 + hash(q, 5)) % 1;
      const sx = x - dx * (along + ph * 40) - dy * off, sy = y - dy * (along + ph * 40) + dx * off;
      ctx.strokeStyle = `rgba(255,${q % 2 ? 150 : 250},${q % 2 ? 40 : 220},${0.7 * fast * (1 - ph)})`; ctx.lineWidth = 2.5 + 2 * hash(q, 6);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - dx * len, sy - dy * len); ctx.stroke();
    }
    ctx.restore();
  }
  // heat haze round it: faint wavering lines
  if (P.bird > 0.1) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,235,200,${0.16 * P.bird})`; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (let q = 0; q < 6; q++) { const ox = x + (q - 2.5) * 34 * k, ph = (t * 1.7 + q * 0.21) % 1, oy = y + 60 * k - ph * 170 * k; ctx.globalAlpha = Math.sin(ph * Math.PI); ctx.beginPath(); ctx.moveTo(ox, oy); for (let j = 1; j <= 7; j++) ctx.lineTo(ox + Math.sin(t * 8 + j * 1.3 + q) * 6, oy - j * 9 * k); ctx.stroke(); }
    ctx.restore();
  }
  // the phoenix
  if (P.bird > 0.02) {
    ctx.save(); ctx.translate(x, y); const sc = birdScale(P); ctx.scale(sc, sc);
    const lean = clamp(dx, -1, 1) * 0.35, dive = P.f > 0.72 ? clamp((P.f - 0.72) / 0.2, 0, 1) : 0;
    bird(ctx, P, t, lean, dive, c);
    ctx.restore();
  }
  ctx.restore();
}

// one tongue of flame standing up from (x, y), h tall, flickering with ph
function flame(ctx, x, y, h, ph, a) {
  if (a <= 0.01) return;
  const w = h * 0.38, sway = Math.sin(ph) * w * 0.5;
  ctx.fillStyle = `rgba(255,${120 + 60 * Math.sin(ph * 1.3) | 0},30,${0.75 * a})`;
  ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w, y - h * 0.5, x + sway, y - h); ctx.quadraticCurveTo(x + w, y - h * 0.5, x + w, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = `rgba(255,240,170,${0.8 * a})`;
  ctx.beginPath(); ctx.moveTo(x - w * 0.45, y); ctx.quadraticCurveTo(x - w * 0.4, y - h * 0.35, x + sway * 0.6, y - h * 0.6); ctx.quadraticCurveTo(x + w * 0.45, y - h * 0.3, x + w * 0.45, y); ctx.closePath(); ctx.fill();
}

// ------------------------------------------------------------------------------------------------ the firebird
// The phoenix itself, upright on screen at 0, 0 (its body's middle), about 260 across with its wings out: a sleek long
// neck and a slender head with a sharp beak, a jewel of Pyth blue on its brow and a crest of flame plumes streaming
// back; broad sweeping wings of layered flame-feathers (each a curved teardrop, white-gold at the core through orange to a
// deep red edge), the primaries breaking into flame at the tips; a long tail of ribbon plumes curling and fluttering,
// two with blue eye-spots; a soft bloom behind it all. The wings beat with a smooth stroke, each joint a little behind
// the one before, so the feathers trail the motion. The racer rides small between the wings.
// The feathers are cached sprites (one drawing, stamped many times a frame).
const sprites = {};
function sprite(key, w, h, draw) {
  if (sprites[key]) return sprites[key];
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w * 2, h * 2) : Object.assign(document.createElement('canvas'), { width: w * 2, height: h * 2 });
  const g = c.getContext('2d'); g.scale(2, 2); draw(g); return (sprites[key] = c);
}
// a flame-feather pointing along +x from its quill at (2, 12): 60 long, a curved teardrop
const FW = 64, FH = 24;
const featherSprite = () => sprite('feather', FW, FH, g => {
  const path = () => { g.beginPath(); g.moveTo(2, 12); g.bezierCurveTo(14, 2, 40, 2, 62, 9); g.bezierCurveTo(44, 17, 18, 22, 2, 12); g.closePath(); };
  path(); g.fillStyle = linear(g, 2, 0, 62, 0, [[0, '#fffbe6'], [0.2, '#ffe07a'], [0.48, '#ffa733'], [0.78, '#ec4d1e'], [1, '#a8190e']]); g.fill();
  g.save(); path(); g.clip(); g.fillStyle = linear(g, 0, 4, 0, 20, [[0, 'rgba(255,255,240,0.45)'], [0.5, 'rgba(255,255,240,0)'], [1, 'rgba(120,10,0,0.3)']]); g.fillRect(0, 0, FW, FH); g.restore();
  g.strokeStyle = 'rgba(150,25,10,0.55)'; g.lineWidth = 1; path(); g.stroke();
  g.strokeStyle = 'rgba(255,255,235,0.75)'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(3, 12); g.quadraticCurveTo(24, 9, 46, 9); g.stroke();   // the quill
});
const glowSprite = () => sprite('glow', 64, 64, g => { g.fillStyle = radial(g, 32, 32, 0, 32, 32, 32, [[0, 'rgba(255,240,190,1)'], [0.35, 'rgba(255,190,80,0.55)'], [1, 'rgba(255,120,30,0)']]); g.fillRect(0, 0, 64, 64); });
// stamp a feather: quill at (x, y), pointing at angle a, `len` long, `wid` wide (flip: curl the other way)
function feather(ctx, x, y, a, len, wid, flip) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); if (flip) ctx.scale(1, -1);
  ctx.drawImage(featherSprite(), -2 * len / 60, -12 * wid / 12 * 0.5, FW * len / 60, FH * wid / 12 * 0.5);
  ctx.restore();
}
// a tapered ribbon along points pts (w0 wide at the start to w1 at the end), filled with fill
function ribbon(ctx, pts, w0, w1, fill) {
  const L = [], Rr = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, w = (w0 + (w1 - w0) * i / (n - 1)) / 2;
    L.push([pts[i][0] - dy / d * w, pts[i][1] + dx / d * w]); Rr.push([pts[i][0] + dy / d * w, pts[i][1] - dx / d * w]);
  }
  ctx.beginPath(); ctx.moveTo(...L[0]); for (const p of L.slice(1)) ctx.lineTo(...p); for (const p of Rr.reverse()) ctx.lineTo(...p); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
// one wing, spread out to +x from the shoulder at 0, 0. b(k): the beat (-1 down .. 1 up) at joint k (each a little behind);
// open: 1 spread, 0 folded back (the dive)
function wing(ctx, b, open, t, s) {
  const span = 0.55 + 0.45 * open, segs = [[46, -0.42], [44, 0.2], [38, 0.42]];   // [length, bend from the joint before]
  let x = 0, y = 0, ang = 0; const bone = [[0, 0, 0]];
  segs.forEach(([len, bend], k) => { ang = (k ? ang + bend : bend) - 0.42 * b(k) * open - 0.35 * (1 - open) * (k + 1); x += Math.cos(ang) * len * span; y += Math.sin(ang) * len * span; bone.push([x, y, ang]); });
  const at = u => {   // a point on the bone, u 0..1, and its direction
    const f = u * 3, k = Math.min(2, Math.floor(f)), r = f - k, A = bone[k], B = bone[k + 1];
    return [A[0] + (B[0] - A[0]) * r, A[1] + (B[1] - A[1]) * r, B[2]];
  };
  // a soft glow under the wing
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.55;
  for (const u of [0.35, 0.7, 0.98]) { const [px, py] = at(u); ctx.drawImage(glowSprite(), px - 40, py - 26, 80, 80); }
  ctx.restore();
  // the primaries (out at the tip, longest, sweeping out and back), then the secondaries along the arm, then the coverts
  for (let i = 11; i >= 0; i--) {
    const u = 0.42 + 0.58 * i / 11, [px, py, a] = at(u), lag = 0.25 * b(3) * open, flut = Math.sin(t * 11 + i * 0.9) * 0.05;
    const len = (52 + 70 * Math.pow(i / 11, 1.3)) * (0.6 + 0.4 * open), dir = a + 1.55 - 1.15 * (i / 11) + lag + flut;
    feather(ctx, px, py, dir, len, 20 + 10 * (i / 11), false);
  }
  for (let i = 9; i >= 0; i--) {
    const u = 0.04 + 0.4 * i / 9, [px, py, a] = at(u), flut = Math.sin(t * 10 + i * 1.3) * 0.05;
    feather(ctx, px, py, a + 1.75 - 0.25 * (i / 9) + 0.2 * b(2) * open + flut, (44 + 10 * i / 9) * (0.65 + 0.35 * open), 20, false);
  }
  for (let i = 0; i < 10; i++) { const u = 0.03 + 0.85 * i / 9, [px, py, a] = at(u); feather(ctx, px, py - 2, a + 0.9, 30 + 6 * Math.sin(i), 13, true); }   // coverts along the leading edge
  // the wing tip breaking into flame
  const [tx, ty, ta] = bone[3];
  for (let q = 0; q < 3; q++) { ctx.save(); ctx.translate(tx + Math.cos(ta) * 18 + q * 4, ty + Math.sin(ta) * 18 + q * 6); ctx.rotate(ta + Math.PI / 2 + 0.3); flame(ctx, 0, 0, 30 - q * 6 + 6 * Math.sin(t * 17 + q + s), t * 14 + q * 2 + s, 0.85); ctx.restore(); }
}
function bird(ctx, P, t, lean, dive, c) {
  const open = 1 - 0.75 * dive, fx = Math.cos(P.dir) >= 0 ? 1 : -1, tailDir = Math.atan2(-Math.sin(P.dir) * 0.7 + 0.3, -Math.cos(P.dir) * 0.7);   // (the tail streams out behind, hanging a little)
  const beat = k => Math.sin(P.flap - k * 0.45);   // the wing stroke, each joint a little behind the one before
  ctx.scale(0.8, 0.8);
  // the bloom behind it all
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.45; ctx.drawImage(glowSprite(), -150, -170, 300, 300); ctx.restore();
  // the tail: five ribbon plumes from the root of the body, curling and fluttering, two with blue eye-spots
  for (let q = 0; q < 5; q++) {
    const off = (q - 2) * 0.13, len = 150 + 36 * Math.sin(q * 2.1) - Math.abs(q - 2) * 14, pts = [];
    for (let k = 0; k <= 16; k++) {
      const u = k / 16, a = tailDir + off * (1 + u) + Math.sin(t * 6 - u * 5 + q) * 0.22 * u, d = len * u;
      pts.push([Math.cos(a) * d + Math.sin(u * 6 + t * 5 + q) * 6 * u, 24 + Math.sin(a) * d]);
    }
    ribbon(ctx, pts, 18 - Math.abs(q - 2) * 3, 3, linear(ctx, 0, 24, pts[16][0], pts[16][1], [[0, '#fff2b0'], [0.25, '#ffc23a'], [0.6, '#ff7a1f'], [0.9, 'rgba(210,40,15,0.75)'], [1, 'rgba(160,20,10,0)']]));
    if (q === 1 || q === 3) { const [ex, ey] = pts[13]; ell(ctx, ex, ey, 6, 4.2, 0); ctx.fillStyle = '#ffb53a'; ctx.fill(); ell(ctx, ex, ey, 3.6, 2.5, 0); ctx.fillStyle = BLUE; ctx.fill(); circ(ctx, ex, ey, 1.3); ctx.fillStyle = BLUE_DK; ctx.fill(); }
  }
  // the wings, behind the body
  for (const s of [-1, 1]) { ctx.save(); ctx.translate(s * 7, -16); ctx.rotate(lean * 0.5 * s); ctx.scale(s, 1); wing(ctx, beat, open, t, s); ctx.restore(); }
  // the body: slender, white-gold at the breast through gold to an orange edge, tilted the way it flies
  ctx.save(); ctx.rotate(lean * 0.6);
  ctx.beginPath(); ctx.moveTo(0, -28); ctx.bezierCurveTo(13, -22, 11, 16, 0, 30); ctx.bezierCurveTo(-11, 16, -13, -22, 0, -28); ctx.closePath();
  ctx.fillStyle = radial(ctx, -3, -8, 2, 0, 0, 30, [[0, '#fffbe6'], [0.35, '#ffd65a'], [0.8, '#ff9a2a'], [1, '#e8521e']]); ctx.fill(); ctx.strokeStyle = 'rgba(160,40,10,0.5)'; ctx.lineWidth = 1; ctx.stroke();
  for (let q = 0; q < 4; q++) { ctx.beginPath(); ctx.arc(0, -10 + q * 8, 8 - q * 1.2, 0.25, Math.PI - 0.25); ctx.strokeStyle = 'rgba(230,90,20,0.45)'; ctx.lineWidth = 1.2; ctx.stroke(); }   // scaled breast feathers
  // the racer, riding small between the wings (happy), fading in as the bird forms and out as it lands
  ctx.save(); ctx.translate(0, -4); ctx.globalAlpha *= clamp(P.bird * 1.2, 0, 1); drawMascot(ctx, c.ch, { t: t + c.idx * 3.1, scale: 0.4, shadow: false, mood: 'happy', look: [Math.cos(P.dir), Math.sin(P.dir)] }); ctx.restore();
  // the neck: long and curving up and forward, tapering to the head
  const hx = fx * 14, hy = -64, neck = []; for (let k = 0; k <= 10; k++) { const u = k / 10; neck.push([fx * (Math.sin(u * Math.PI * 0.9) * 6 + u * 14) * (1 - 0.2 * u), -24 + (hy + 24) * u]); }
  ribbon(ctx, neck, 15, 8, linear(ctx, 0, -24, 0, hy, [[0, '#ffd65a'], [1, '#fff2c0']]));
  // the crest: flame plumes streaming back from the back of the head
  for (let q = 0; q < 4; q++) {
    const pts = []; for (let k = 0; k <= 10; k++) { const u = k / 10, a = -Math.PI / 2 - fx * (0.5 + q * 0.32) - Math.sin(t * 8 + q - u * 3) * 0.15 * u, d = (26 + q * 6) * u; pts.push([hx - fx * 5 + Math.cos(a) * d, hy - 3 + Math.sin(a) * d]); }
    ribbon(ctx, pts, 5, 0.6, linear(ctx, hx, hy, pts[10][0], pts[10][1], [[0, '#ffe07a'], [0.6, '#ff7a1f'], [1, 'rgba(200,30,10,0.4)']]));
  }
  // the head: slender, a sharp beak, an almond eye with a glint, a blue jewel on the brow
  ctx.save(); ctx.translate(hx, hy); ctx.scale(fx, 1); ctx.rotate(-0.15);
  ctx.beginPath(); ctx.moveTo(-9, 2); ctx.bezierCurveTo(-8, -8, 8, -9, 12, -2); ctx.bezierCurveTo(8, 5, -4, 7, -9, 2); ctx.closePath();
  ctx.fillStyle = radial(ctx, 0, -4, 1, 2, -1, 12, [[0, '#fffbe6'], [0.6, '#ffd65a'], [1, '#ff9a2a']]); ctx.fill(); ctx.strokeStyle = 'rgba(160,40,10,0.55)'; ctx.lineWidth = 0.9; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(10, -4); ctx.quadraticCurveTo(20, -3, 27, 2); ctx.quadraticCurveTo(19, 1, 10, 1); ctx.closePath(); ctx.fillStyle = linear(ctx, 10, 0, 27, 0, [[0, '#ffcf6a'], [1, '#c45a00']]); ctx.fill(); ctx.strokeStyle = 'rgba(110,40,0,0.7)'; ctx.lineWidth = 0.8; ctx.stroke();   // the beak
  ctx.beginPath(); ctx.moveTo(1, -3); ctx.quadraticCurveTo(4.5, -6, 8, -3.2); ctx.quadraticCurveTo(4.5, -1, 1, -3); ctx.closePath(); ctx.fillStyle = '#3a1206'; ctx.fill();   // the eye
  circ(ctx, 5.4, -3.8, 0.8); ctx.fillStyle = '#fff6d0'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(2, -8.5); ctx.lineTo(4.2, -11); ctx.lineTo(6.4, -8.5); ctx.lineTo(4.2, -6.4); ctx.closePath(); ctx.fillStyle = BLUE_LT; ctx.fill(); ctx.strokeStyle = BLUE_DK; ctx.lineWidth = 0.7; ctx.stroke();   // the jewel
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; circ(ctx, 3.6, -9.2, 0.6); ctx.fill();
  ctx.restore();
  ctx.restore();
}

// karts the phoenix's landing burned out: on fire as they sink, smoke pouring off (render.js shrinks them, like lava)
export function phoenixBurns(ctx, race, t) {
  for (const c of race.cars) {
    if (!(c.lavaT > 0) || c.lavaBy !== 'phoenix') continue;
    const k = clamp(c.lavaT / 2.5, 0, 1);
    ctx.save(); ctx.translate(c.x, c.y);
    ctx.fillStyle = `rgba(40,20,10,${0.45 * k})`; ell(ctx, 3, 5, 34, 22); ctx.fill();   // charred ground under it
    for (let q = 0; q < 7; q++) { const a = q / 7 * TAU + t * 2, r = 16 * k; flame(ctx, Math.cos(a) * r, Math.sin(a) * r * 0.6, (22 + 14 * Math.sin(t * 13 + q)) * (0.4 + 0.6 * k), t * 12 + q * 1.3, 0.9 * k + 0.1); }
    ctx.restore();
  }
}
