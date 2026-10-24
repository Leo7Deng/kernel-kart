// Kernel Kart art: boost pads. A dash panel inlaid in the road, cartoon style: a rounded sunny yellow-orange pad in a
// soft white rim with a dark outline, three big chunky chevrons that light up one after another toward the way you're
// going, a warm glow on the road round it, a few sparkles drifting off its front, and a flash when a kart has just
// been launched off it.
// The pad itself (outline, rim, panel, unlit chevrons, gloss) is drawn once per pad into a sprite in world orientation,
// so the gloss stays top left however the road turns; each frame adds only the glow, the lit chevrons and the sparkles.
import { TAU } from '../core.js';
import { linear, radial, rr } from './paint.js';

const INK = '#3a1f12';
const FX = 33, FY = 47, FR = 15;      // the pad: half its length along the road, half its width across, corner radius
const RIM = 4.5;                      // the white rim
const IX = FX - RIM, IY = FY - RIM, IR = FR - RIM;
const CHEV = [-14, 0, 14], CD = 13, CA = 21, CW = 8.4;   // the chevrons, back to front (local x is along the road): tip depth, arm reach, stroke
const S = 140, RES = 4;               // sprite size (world units, square round the centre) and pixels per unit
const sprites = new WeakMap();

const chevron = (g, x) => { g.beginPath(); g.moveTo(x - CD / 2, -CA); g.lineTo(x + CD / 2, 0); g.lineTo(x - CD / 2, CA); };
const strokeChev = (g, x, col, w) => { chevron(g, x); g.strokeStyle = col; g.lineWidth = w; g.stroke(); };

function sprite(P) {
  let c = sprites.get(P); if (c) return c;
  const n = S * RES;
  c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(n, n) : Object.assign(document.createElement('canvas'), { width: n, height: n });
  const g = c.getContext('2d');
  g.setTransform(RES, 0, 0, RES, n / 2, n / 2); g.rotate(P.ang);
  g.lineCap = 'round'; g.lineJoin = 'round';
  // the top-left light, in the pad's own coordinates: (lx, ly) points at it
  const ca = Math.cos(P.ang), sa = Math.sin(P.ang), Lx = -Math.SQRT1_2, Ly = -Math.SQRT1_2, lx = Lx * ca + Ly * sa, ly = -Lx * sa + Ly * ca;
  const lit = (r, stops) => linear(g, lx * r, ly * r, -lx * r, -ly * r, stops);
  // outline and white rim, a touch creamy away from the light
  rr(g, -FX, -FY, FX * 2, FY * 2, FR); g.fillStyle = lit(56, [[0, '#ffffff'], [1, '#f1e6d2']]); g.fill();
  g.strokeStyle = INK; g.lineWidth = 2.6; g.stroke();
  // the panel: sunny yellow up front, deep orange behind
  rr(g, -IX, -IY, IX * 2, IY * 2, IR); g.fillStyle = linear(g, -IX, 0, IX, 0, [[0, '#f4511e'], [0.55, '#ff7a1c'], [1, '#ffa526']]); g.fill();
  g.strokeStyle = 'rgba(58,31,18,0.45)'; g.lineWidth = 1; g.stroke();
  g.save(); rr(g, -IX, -IY, IX * 2, IY * 2, IR); g.clip();
  // a soft shade inside the rim down-right
  g.fillStyle = lit(50, [[0.55, 'rgba(150,40,0,0)'], [1, 'rgba(150,40,0,0.35)']]); g.fillRect(-IX, -IY, IX * 2, IY * 2);
  // the chevrons, unlit: chunky and rounded, outlined, a lick of highlight along each
  for (const x of CHEV) strokeChev(g, x, INK, CW + 2.4);
  for (const x of CHEV) { strokeChev(g, x, '#ffd54a', CW); g.save(); g.translate(lx * 1.4, ly * 1.4); strokeChev(g, x, 'rgba(255,250,215,0.75)', 2.2); g.restore(); }
  // a glossy sheen toward the light
  g.fillStyle = lit(50, [[0, 'rgba(255,255,255,0.45)'], [0.3, 'rgba(255,255,255,0.14)'], [0.34, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0)']]);
  g.fillRect(-IX, -IY, IX * 2, IY * 2);
  g.restore();
  sprites.set(P, c);
  return c;
}

// P: { x, y, ang } (ang: the way the road runs). t: the race clock. flash: 1 just as a kart is launched, fading to 0.
export function drawPad(ctx, P, t, flash = 0) {
  const pulse = 0.5 + 0.5 * Math.sin(t * 3.1 + P.x * 0.01);
  ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(P.ang);
  // a warm glow on the road round it
  ctx.save(); ctx.scale(1, 1.25);
  const ga = 0.22 + 0.08 * pulse + 0.35 * flash, gr = 62 + 18 * flash;
  ctx.fillStyle = radial(ctx, 0, 0, 22, 0, 0, gr, [[0, `rgba(255,190,50,${ga})`], [0.5, `rgba(255,170,40,${ga * 0.4})`], [1, 'rgba(255,170,40,0)']]);
  ctx.beginPath(); ctx.arc(0, 0, gr, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.rotate(-P.ang); ctx.drawImage(sprite(P), -S / 2, -S / 2, S, S); ctx.rotate(P.ang);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // the chevrons light up back to front, each flaring as the wave reaches it, then a beat of rest
  ctx.save(); rr(ctx, -IX, -IY, IX * 2, IY * 2, IR); ctx.clip();
  if (flash > 0) { ctx.fillStyle = `rgba(255,250,220,${0.5 * flash})`; ctx.fillRect(-IX, -IY, IX * 2, IY * 2); }
  const ph = (t * 1.5) % 1;
  CHEV.forEach((x, k) => {
    const u = ph * 4 - k, on = u >= 0 && u < 2 ? Math.pow(1 - u / 2, 1.5) : 0, I = Math.max(on, flash);
    if (I < 0.03) return;
    ctx.globalCompositeOperation = 'lighter'; strokeChev(ctx, x, `rgba(255,200,80,${0.35 * I})`, CW + 9);   // its glow
    ctx.globalCompositeOperation = 'source-over'; strokeChev(ctx, x, `rgba(255,253,235,${I})`, CW - 0.4);   // lit up white-hot
  });
  ctx.restore();
  // a few sparkles drifting off the front, twinkling as they go
  for (let k = 0; k < 3; k++) {
    const q = (t * 0.9 + k / 3 + P.y * 0.003) % 1, x = FX - 4 + q * 40, y = [-26, 2, 24][k] + Math.sin(q * 5 + k) * 3, r = (2.2 + 2.6 * Math.sin(q * Math.PI)) * (1 + 0.4 * flash);
    ctx.save(); ctx.translate(x, y); ctx.rotate(q * 2.5 + k); ctx.globalAlpha = Math.min(1, Math.sin(q * Math.PI) * 1.4);
    ctx.fillStyle = radial(ctx, 0, 0, 0, 0, 0, r * 1.6, [[0, 'rgba(255,214,90,0.55)'], [1, 'rgba(255,214,90,0)']]); ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fffbe6'; ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, d = i % 2 ? r * 0.3 : r; ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d); }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
