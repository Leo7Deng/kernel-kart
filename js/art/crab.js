// Kernel Kart art: the Borrow Checker, the giant crab on Crab Harbor. draw-mechanics.js places it (its frame on the
// beach, where its claws are) and calls drawCrab over the cars and crabShadow under them; race-crab.js is the rule.
// The body is laid out in its own frame: x along the road (the way it scuttles), y backward (it faces -y, the road).
// The light comes from the screen's top left, so in that frame it's (lX, lY); heights go up the screen, (uX, uY).
// The carapace is painted once per light direction into an offscreen sprite (a handful of them on a track); the legs,
// arms, claws and eyes are drawn each frame: a few dozen gradient-filled capsules, no shadowBlur.
import { TAU, mulberry } from '../core.js';
import { alpha, mix } from './paint.js';

export const CRAB_R = 110;   // the carapace's half-width along the road
const PALS = {
  calm:  { hi: '#ffc9a0', base: '#f4703a', mid: '#d84e25', dark: '#a33415', deep: '#5a1609', cream: '#fff1dc', tip: '#2a130c', iris: '#f2b33d' },
  angry: { hi: '#ffaa86', base: '#e64524', mid: '#c32c15', dark: '#84190a', deep: '#460a04', cream: '#ffdfc8', tip: '#220806', iris: '#ff5426' },
};
const LIGHT = [-0.6, -0.8];   // toward the light, on screen

function makeCanvas(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}
const grad = (g, x0, y0, x1, y1, stops) => { const q = g.createLinearGradient(x0, y0, x1, y1); for (const [o, c] of stops) q.addColorStop(o, c); return q; };
const rgrad = (g, x0, y0, r0, x1, y1, r1, stops) => { const q = g.createRadialGradient(x0, y0, r0, x1, y1, r1); for (const [o, c] of stops) q.addColorStop(o, c); return q; };

// the frame's light and up directions, and a transform onto it
function basis(F) { return { lX: LIGHT[0] * F.ax + LIGHT[1] * F.ay, lY: -(LIGHT[0] * F.fx + LIGHT[1] * F.fy), uX: -F.ay, uY: F.fy }; }
const toFrame = (g, F) => g.transform(F.ax, F.ay, -F.fx, -F.fy, F.x, F.y);

// ------------------------------------------------------------------------------------------------ the carapace
// a broad shell, blunt at the front with a notch between the eyes, five teeth down each front edge, rounder behind
function shellPts(R) {
  const pts = [], N = 132;
  for (let k = 0; k < N; k++) {
    const th = k / N * TAU, s = Math.sin(th), c = Math.cos(th), a = Math.min(th, TAU - th);   // a: 0 straight ahead .. π behind
    let x = R * s, y = c > 0 ? -R * 0.74 * Math.pow(c, 0.62) : -R * 0.64 * c;
    if (c < 0) x *= 1 - 0.14 * -c;
    let bump = 0;
    if (a > 0.42 && a < 1.72) { const u = (a - 0.42) / 1.3 * 5, f = u - Math.floor(u); bump = 0.075 * Math.pow(1 - Math.abs(2 * f - 1), 2.2) * (1.15 - (a - 0.42) / 1.6); }
    if (a < 0.2) bump -= 0.05 * (1 - a / 0.2);                               // the notch between the eyes
    else if (a < 0.42) bump += 0.02 * Math.sin((a - 0.2) / 0.22 * Math.PI);  // the lobes either side of it
    const r = Math.hypot(x, y) || 1;
    pts.push([x + x / r * bump * R, y + y / r * bump * R]);
  }
  return pts;
}
const SPRITES = new Map(), SK = 2.4, SH = 1.32;   // px per unit, half-size in R
function shellSprite(R, P, lX, lY, mood) {
  const q = Math.round(Math.atan2(lY, lX) / TAU * 64), key = mood + q;
  let c = SPRITES.get(key); if (c) return c;
  if (SPRITES.size > 40) SPRITES.clear();
  const la = q / 64 * TAU, S = Math.ceil(R * SH * 2 * SK);
  c = makeCanvas(S, S); const g = c.getContext('2d');
  g.setTransform(SK, 0, 0, SK, S / 2, S / 2);
  paintShell(g, R, P, Math.cos(la), Math.sin(la), mood);
  SPRITES.set(key, c); return c;
}
function paintShell(g, R, P, lx, ly, mood) {
  const pts = shellPts(R), rng = mulberry(41);
  const path = (dx = 0, dy = 0, k = 1) => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x * k + dx, y * k + dy) : g.moveTo(x * k + dx, y * k + dy)); g.closePath(); };
  const inside = (x, y, m = 1) => (x / (R * 0.92 * m)) ** 2 + ((y + 0.04 * R) / (R * (y < 0 ? 0.72 : 0.6) * m)) ** 2 < 1;
  g.lineJoin = 'round'; g.lineCap = 'round';
  // its thickness, showing along the edge away from the light
  path(-lx * 9, -ly * 9); g.fillStyle = P.deep; g.fill();
  path(-lx * 4.5, -ly * 4.5); g.fillStyle = P.dark; g.fill();
  // the dome
  path(); g.fillStyle = rgrad(g, lx * R * 0.42, ly * R * 0.42, R * 0.04, -lx * R * 0.1, -ly * R * 0.1, R * 1.12, [[0, P.hi], [0.28, P.base], [0.7, P.mid], [1, P.dark]]); g.fill();
  g.save(); path(); g.clip();
  // a rounded rim: darker toward the edge on the shade side, a pale lip on the lit side
  path(lx * R * 0.08, ly * R * 0.08); g.lineWidth = R * 0.24; g.strokeStyle = alpha(P.deep, 0.3); g.stroke();
  path(-lx * R * 0.03, -ly * R * 0.03); g.lineWidth = R * 0.05; g.strokeStyle = 'rgba(255,236,214,0.28)'; g.stroke();
  // the raised regions of the shell: the stomach in the middle, the gills either side, the heart behind
  const lobe = (x, y, rx, ry, k = 1) => {
    g.save(); g.translate(x, y); g.scale(rx, ry);
    g.fillStyle = rgrad(g, lx * 0.35, ly * 0.35, 0, lx * 0.35, ly * 0.35, 1, [[0, `rgba(255,232,206,${0.34 * k})`], [1, 'rgba(255,232,206,0)']]);
    g.beginPath(); g.arc(0, 0, 1.1, 0, TAU); g.fill();
    g.fillStyle = rgrad(g, -lx * 0.45, -ly * 0.45, 0, -lx * 0.45, -ly * 0.45, 1, [[0, `rgba(90,18,4,${0.26 * k})`], [1, 'rgba(90,18,4,0)']]);
    g.beginPath(); g.arc(0, 0, 1.1, 0, TAU); g.fill();
    g.restore();
  };
  lobe(0, -R * 0.3, R * 0.27, R * 0.25, 1.1);
  for (const s of [-1, 1]) { lobe(s * R * 0.56, -R * 0.04, R * 0.32, R * 0.3); lobe(s * R * 0.38, -R * 0.5, R * 0.16, R * 0.13, 0.8); lobe(s * R * 0.62, R * 0.32, R * 0.16, R * 0.13, 0.7); }
  lobe(0, R * 0.26, R * 0.2, R * 0.17, 0.9);
  // the grooves between them, cut in: a dark line, its far wall lit
  const groove = (draw, w) => {
    g.strokeStyle = 'rgba(255,226,196,0.4)'; g.lineWidth = w * 0.7; g.save(); g.translate(-lx * w * 0.6, -ly * w * 0.6); draw(); g.stroke(); g.restore();
    g.strokeStyle = alpha(P.deep, 0.5); g.lineWidth = w; draw(); g.stroke();
  };
  for (const s of [-1, 1]) {
    groove(() => { g.beginPath(); g.moveTo(s * R * 0.12, -R * 0.62); g.bezierCurveTo(s * R * 0.32, -R * 0.42, s * R * 0.32, -R * 0.12, s * R * 0.2, R * 0.08); g.quadraticCurveTo(s * R * 0.14, R * 0.2, s * R * 0.2, R * 0.38); }, 4);
    groove(() => { g.beginPath(); g.moveTo(s * R * 0.28, -R * 0.14); g.quadraticCurveTo(s * R * 0.48, -R * 0.32, s * R * 0.66, -R * 0.3); }, 3);
    groove(() => { g.beginPath(); g.moveTo(s * R * 0.24, R * 0.16); g.quadraticCurveTo(s * R * 0.44, R * 0.2, s * R * 0.58, R * 0.36); }, 2.5);
  }
  groove(() => { g.beginPath(); g.moveTo(-R * 0.2, R * 0.08); g.quadraticCurveTo(0, R * 0.17, R * 0.2, R * 0.08); }, 3.5);
  // freckles, then granules: bumps lit on the light side with a shadow behind, crowded toward the front and the edges
  for (let k = 0; k < 46; k++) { const x = (rng() - 0.5) * 1.9 * R, y = (rng() - 0.5) * 1.4 * R; if (!inside(x, y)) continue; g.fillStyle = alpha(P.dark, 0.22 + rng() * 0.15); g.beginPath(); g.arc(x, y, 1.2 + rng() * 2.4, 0, TAU); g.fill(); }
  for (let k = 0; k < 170; k++) {
    const x = (rng() - 0.5) * 1.9 * R, y = (rng() - 0.5) * 1.45 * R; if (!inside(x, y)) continue;
    const edge = (x / (R * 0.92)) ** 2 + ((y + 0.04 * R) / (R * 0.68)) ** 2, want = 0.12 + 0.6 * edge + (y < -R * 0.2 ? 0.25 : 0);
    if (rng() > want) continue;
    const r = 1.4 + rng() * (1.6 + 2.2 * edge);
    g.fillStyle = alpha(P.deep, 0.26); g.beginPath(); g.arc(x - lx * r * 0.55, y - ly * r * 0.55, r, 0, TAU); g.fill();
    g.fillStyle = mix(P.mid, P.hi, 0.2 + 0.25 * rng()); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,240,224,0.35)'; g.beginPath(); g.arc(x + lx * r * 0.35, y + ly * r * 0.35, r * 0.4, 0, TAU); g.fill();
  }
  // the shine
  g.save(); g.translate(lx * R * 0.4, ly * R * 0.4); g.rotate(Math.atan2(ly, lx) + Math.PI / 2); g.scale(R * 0.36, R * 0.15);
  g.fillStyle = rgrad(g, 0, 0, 0, 0, 0, 1, [[0, 'rgba(255,255,255,0.32)'], [0.6, 'rgba(255,255,255,0.1)'], [1, 'rgba(255,255,255,0)']]); g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill();
  g.restore();
  g.restore();
  path(); g.lineWidth = 3; g.strokeStyle = P.deep; g.stroke();
  // the teeth down the front edges get dark tips
  for (const [x, y] of pts.filter((p, k) => { const a = Math.min(k, pts.length - k) / pts.length * TAU; if (a < 0.45 || a > 1.7) return false; const u = (a - 0.42) / 1.3 * 5, f = u - Math.floor(u); return Math.abs(f - 0.5) < 0.5 / 26 * 5; })) { g.fillStyle = P.deep; g.beginPath(); g.arc(x, y, 2.6, 0, TAU); g.fill(); }
  // eye sockets in the front edge, where the stalks come out
  for (const s of [-1, 1]) { g.fillStyle = P.deep; g.beginPath(); g.ellipse(s * R * 0.22, -R * 0.68, R * 0.085, R * 0.05, 0, 0, TAU); g.fill(); }
  // the mouth, under the notch: a grumpy one, a snarl on the last lap
  const my = -R * 0.6;
  if (mood === 'angry') {
    g.beginPath(); g.moveTo(-R * 0.15, my - R * 0.01); g.quadraticCurveTo(0, my - R * 0.1, R * 0.15, my - R * 0.01); g.quadraticCurveTo(0, my + R * 0.1, -R * 0.15, my - R * 0.01); g.fillStyle = '#2a0703'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = P.deep; g.stroke();
    g.fillStyle = P.cream; for (let k = -2; k <= 2; k++) { const x = k * R * 0.055, top = my - R * 0.055 + Math.abs(k) * R * 0.012; g.beginPath(); g.moveTo(x - R * 0.024, top); g.lineTo(x + R * 0.024, top); g.lineTo(x, top + R * 0.045); g.closePath(); g.fill(); }
  } else {
    g.beginPath(); g.moveTo(-R * 0.17, my + R * 0.03); g.quadraticCurveTo(0, my - R * 0.08, R * 0.17, my + R * 0.03); g.quadraticCurveTo(0, my - R * 0.01, -R * 0.17, my + R * 0.03); g.fillStyle = '#330a04'; g.fill();
    g.lineWidth = 3; g.strokeStyle = P.deep; g.beginPath(); g.moveTo(-R * 0.17, my + R * 0.03); g.quadraticCurveTo(0, my - R * 0.08, R * 0.17, my + R * 0.03); g.stroke();
    g.fillStyle = P.cream; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * R * 0.07, my - R * 0.03); g.lineTo(s * R * 0.03, my - R * 0.025); g.lineTo(s * R * 0.05, my + R * 0.025); g.closePath(); g.fill(); }
  }
}

// ------------------------------------------------------------------------------------------------ limbs
// a tapered capsule from (x0, y0) radius r0 to (x1, y1) radius r1, shaded across: lit on the side facing the light
function limb(g, x0, y0, r0, x1, y1, r1, P, lx, ly, lw = 2) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1, a = Math.atan2(dy, dx), nx = -dy / d, ny = dx / d;
  g.beginPath(); g.arc(x1, y1, r1, a - Math.PI / 2, a + Math.PI / 2); g.arc(x0, y0, r0, a + Math.PI / 2, a + Math.PI * 1.5); g.closePath();
  const k = nx * lx + ny * ly >= 0 ? 1 : -1, r = Math.max(r0, r1), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  g.fillStyle = grad(g, mx + nx * k * r, my + ny * k * r, mx - nx * k * r, my - ny * k * r, [[0, P.hi], [0.3, P.base], [0.75, P.mid], [1, P.dark]]);
  g.fill(); g.lineWidth = lw; g.strokeStyle = P.deep; g.stroke();
}
// a leg's joints in the crab's frame: hip (under the shell), knee (up high), ankle, foot (on the sand), each with its height
const LEGS = [{ hy: -0.34, a: -0.6 }, { hy: -0.1, a: -0.18 }, { hy: 0.14, a: 0.24 }, { hy: 0.36, a: 0.66 }];
function legPose(R, k, s, gait, t) {
  const L = LEGS[k], ph = gait + (k % 2 ? Math.PI : 0) + (s > 0 ? 0 : Math.PI * 0.5), up = Math.max(0, Math.cos(ph)), sw = Math.sin(ph) * R * 0.12;
  const dx = s * Math.cos(L.a), dy = Math.sin(L.a), bob = Math.sin(t * 2.2 + k * 1.3 + s) * 1.5;
  const hip = [s * R * (0.8 - 0.12 * Math.abs(L.hy)), L.hy * R, 8];
  const knee = [hip[0] + dx * R * 0.6 + sw * 0.35, hip[1] + dy * R * 0.6, 34 + up * 8 + bob];
  const foot = [hip[0] + dx * R * 1.12 + s * R * 0.08 + sw, hip[1] + dy * R * 1.2 + dy * R * 0.12, up * 14];
  const ankle = [knee[0] + (foot[0] - knee[0]) * 0.5 + dx * R * 0.05, knee[1] + (foot[1] - knee[1]) * 0.5, 22 + up * 10 + bob * 0.5];
  return [hip, knee, ankle, foot];
}
const lifted = (B, [x, y, h]) => [x + B.uX * h, y + B.uY * h];

// ------------------------------------------------------------------------------------------------ the claw
// one claw (a chela) at the origin pointing along +x, `len` long: a fat palm, the fixed finger on -y and the moving one
// (the dactyl) hinged on +y, opened by `open` radians; (lx, ly) the light in this frame
function chela(g, len, open, P, lx, ly) {
  const L = len, W = L * 0.205, lw = Math.max(2.2, L * 0.012);
  const teeth = (pts) => { g.fillStyle = mix(P.cream, P.base, 0.42); for (const [x, y, r] of pts) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); } };
  const fingerFill = (x0, x1) => grad(g, x0, 0, x1, 0, [[0, P.base], [0.45, P.mid], [0.72, mix(P.dark, P.tip, 0.5)], [1, P.tip]]);
  const sheen = (draw) => { g.save(); g.translate(lx * W * 0.08, ly * W * 0.08); draw(); g.strokeStyle = 'rgba(255,240,224,0.45)'; g.lineWidth = lw * 1.3; g.stroke(); g.restore(); };
  // the fixed finger (part of the palm), curving in to its tip
  const fixed = () => { g.beginPath(); g.moveTo(L * 0.5, -W * 0.92); g.bezierCurveTo(L * 0.8, -W * 0.92, L * 0.97, -W * 0.5, L, -W * 0.02); g.bezierCurveTo(L * 0.9, -W * 0.12, L * 0.72, -W * 0.06, L * 0.52, W * 0.12); g.closePath(); };
  fixed(); g.fillStyle = fingerFill(L * 0.5, L); g.fill(); g.lineWidth = lw; g.strokeStyle = P.deep; g.stroke();
  teeth([[L * 0.64, -W * 0.06, W * 0.075], [L * 0.73, -W * 0.08, W * 0.09], [L * 0.82, -W * 0.08, W * 0.07], [L * 0.9, -W * 0.06, W * 0.055]]);
  sheen(() => { g.beginPath(); g.moveTo(L * 0.58, -W * 0.82); g.bezierCurveTo(L * 0.8, -W * 0.8, L * 0.92, -W * 0.5, L * 0.96, -W * 0.18); });
  // the palm: swollen, knobbly, lit from the light's side
  g.beginPath(); g.moveTo(-L * 0.02, -W * 0.5); g.bezierCurveTo(L * 0.1, -W * 1.12, L * 0.46, -W * 1.18, L * 0.6, -W * 0.7);
  g.bezierCurveTo(L * 0.66, -W * 0.3, L * 0.66, W * 0.4, L * 0.6, W * 0.68); g.bezierCurveTo(L * 0.46, W * 1.12, L * 0.1, W * 1.08, -L * 0.02, W * 0.5); g.closePath();
  g.fillStyle = rgrad(g, L * 0.3 + lx * W * 0.55, ly * W * 0.55, W * 0.05, L * 0.3, 0, W * 1.25, [[0, P.hi], [0.35, P.base], [0.75, P.mid], [1, P.dark]]); g.fill();
  g.lineWidth = lw; g.strokeStyle = P.deep; g.stroke();
  // a ridge along the palm, rows of granules, the shine
  g.save(); g.clip();
  g.strokeStyle = alpha(P.deep, 0.2); g.lineWidth = lw * 1.2; g.beginPath(); g.moveTo(L * 0.06, W * 0.1); g.quadraticCurveTo(L * 0.3, W * 0.28, L * 0.58, W * 0.05); g.stroke();
  for (const [fx, fy, fr] of [[0.12, -0.55, 0.07], [0.22, -0.72, 0.08], [0.34, -0.78, 0.08], [0.46, -0.7, 0.07], [0.16, -0.25, 0.06], [0.28, -0.4, 0.07], [0.4, -0.36, 0.06], [0.5, -0.4, 0.06], [0.2, 0.55, 0.06], [0.33, 0.66, 0.065], [0.46, 0.6, 0.06], [0.54, 0.35, 0.05]]) {
    const x = L * fx, y = W * fy, r = W * fr;
    g.fillStyle = alpha(P.deep, 0.3); g.beginPath(); g.arc(x - lx * r * 0.5, y - ly * r * 0.5, r, 0, TAU); g.fill();
    g.fillStyle = mix(P.base, P.hi, 0.45); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  g.fillStyle = rgrad(g, L * 0.28 + lx * W * 0.55, ly * W * 0.55, 0, L * 0.28 + lx * W * 0.55, ly * W * 0.55, W * 0.5, [[0, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);
  g.beginPath(); g.arc(L * 0.28 + lx * W * 0.55, ly * W * 0.55, W * 0.5, 0, TAU); g.fill();
  g.restore();
  // the moving finger, on top
  g.save(); g.translate(L * 0.57, W * 0.42); g.rotate(open);
  const F = L * 0.47;
  g.beginPath(); g.moveTo(-W * 0.05, W * 0.48); g.bezierCurveTo(F * 0.45, W * 0.62, F * 0.9, W * 0.2, F, -W * 0.4); g.bezierCurveTo(F * 0.78, -W * 0.24, F * 0.42, -W * 0.18, 0, -W * 0.32); g.closePath();
  g.fillStyle = fingerFill(0, F); g.fill(); g.lineWidth = lw; g.strokeStyle = P.deep; g.stroke();
  teeth([[F * 0.2, -W * 0.22, W * 0.07], [F * 0.38, -W * 0.22, W * 0.085], [F * 0.56, -W * 0.25, W * 0.07], [F * 0.72, -W * 0.28, W * 0.055]]);
  sheen(() => { g.beginPath(); g.moveTo(F * 0.08, W * 0.4); g.bezierCurveTo(F * 0.45, W * 0.5, F * 0.8, W * 0.15, F * 0.92, -W * 0.22); });
  g.fillStyle = P.mid; g.strokeStyle = P.deep; g.lineWidth = lw; g.beginPath(); g.arc(0, 0, W * 0.16, 0, TAU); g.fill(); g.stroke();   // the hinge
  g.restore();
}

// ------------------------------------------------------------------------------------------------ an eye on its stalk
function eye(g, x, y, r, P, look, mood, inner, blink) {
  g.fillStyle = 'rgba(20,10,5,0.22)'; g.beginPath(); g.arc(x + r * 0.25, y + r * 0.32, r, 0, TAU); g.fill();
  g.fillStyle = rgrad(g, x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.05, [[0, '#ffffff'], [0.6, '#f3eee5'], [1, '#c4b8a8']]);
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  const px = x + look[0] * r * 0.36, py = y + look[1] * r * 0.36, ir = r * (mood === 'angry' ? 0.5 : 0.56);
  g.fillStyle = mood === 'angry' ? P.iris : '#3b2416'; g.beginPath(); g.arc(px, py, ir, 0, TAU); g.fill();
  g.fillStyle = '#0d0a0c'; g.beginPath(); g.arc(px, py, ir * (mood === 'angry' ? 0.48 : 0.62), 0, TAU); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(px - r * 0.2, py - r * 0.24, r * 0.17, 0, TAU); g.fill();
  g.beginPath(); g.arc(px + r * 0.14, py + r * 0.16, r * 0.07, 0, TAU); g.fill();
  // the lid: heavy and bored, up when it's striking, slanted down toward the middle on the last lap, shut in a blink
  g.save(); g.beginPath(); g.arc(x, y, r + 0.5, 0, TAU); g.clip();
  let a0, a1;   // the lid's edge, as heights across the eye (from -1 top to 1 bottom) at its outer and inner side
  if (blink) a0 = a1 = 1.1; else if (mood === 'angry') { a0 = -0.75; a1 = 0.05; } else if (mood === 'alert') { a0 = a1 = -0.82; } else { a0 = -0.22; a1 = -0.3; }
  const xo = x - inner * r * 1.1, xi = x + inner * r * 1.1, yo = y + a0 * r, yi = y + a1 * r;
  g.beginPath(); g.moveTo(xo, y - r * 1.2); g.lineTo(xi, y - r * 1.2); g.lineTo(xi, yi); g.quadraticCurveTo(x, (yo + yi) / 2 + r * 0.12, xo, yo); g.closePath();
  g.fillStyle = grad(g, x, y - r, x, y + r * 0.2, [[0, P.base], [1, P.dark]]); g.fill();
  g.beginPath(); g.moveTo(xi, yi); g.quadraticCurveTo(x, (yo + yi) / 2 + r * 0.12, xo, yo); g.lineWidth = r * 0.16; g.strokeStyle = P.deep; g.stroke();
  g.restore();
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.lineWidth = 2.2; g.strokeStyle = P.deep; g.stroke();
  if (mood === 'angry' && !blink) { g.strokeStyle = P.deep; g.lineWidth = r * 0.34; g.beginPath(); g.moveTo(xo - inner * r * 0.1, yo - r * 0.3); g.lineTo(xi + inner * r * 0.05, yi - r * 0.32); g.stroke(); }   // a brow
}

// ------------------------------------------------------------------------------------------------ the crab
// under the cars: the body's shadow on the sand and the legs' (further off the higher a joint is)
export function crabShadow(g, F, gait, t) {
  const R = CRAB_R, B = basis(F), sx = -B.lX, sy = -B.lY;
  g.save(); toFrame(g, F);
  g.fillStyle = 'rgba(30,20,10,0.2)'; g.beginPath(); g.ellipse(sx * 40, sy * 40, R * 1.2, R * 0.92, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(sx * 30, sy * 30, R * 0.95, R * 0.72, 0, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(30,20,10,0.2)'; g.lineWidth = 12; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) legPose(R, k, s, gait, t).forEach(([x, y, h], j) => { const d = h * 0.7 + 4; j ? g.lineTo(x + sx * d, y + sy * d) : g.moveTo(x + sx * d, y + sy * d); });
  g.stroke();
  g.restore();
}

// over the cars. F: its frame on the beach ({ x, y, fx, fy: toward the road, ax, ay: along it }); gait: where its feet
// are in their stride; claws: [{ sd, x, y, h, ang, len, open, mirror }] (sd -1 the upstream claw; x, y on the ground,
// raised h of the way up), lowest first; mood: 'calm', 'alert', 'angry' or 'asleep' (eyes shut: a time trial); look: a point it's looking at, or null
const LIFT = 130;   // a claw reared right up is drawn this far up the screen
export function drawCrab(g, F, gait, claws, t, mood, look) {
  const R = CRAB_R, P = mood === 'angry' ? PALS.angry : PALS.calm, B = basis(F);
  const W = (u, w, lift = 0) => [F.x + F.fx * u + F.ax * w, F.y + F.fy * u + F.ay * w - lift];   // a point in the frame (u toward the road, w along it)
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  // the legs, back pair first, each from the hip out: thigh, shin, then the pointed foot
  g.save(); toFrame(g, F);
  for (let k = 3; k >= 0; k--) for (const s of [-1, 1]) {
    const [hip, knee, ankle, foot] = legPose(R, k, s, gait, t).map(p => lifted(B, p));
    limb(g, hip[0], hip[1], 11, knee[0], knee[1], 9.5, P, B.lX, B.lY);
    limb(g, knee[0], knee[1], 9, ankle[0], ankle[1], 7.5, P, B.lX, B.lY);
    limb(g, ankle[0], ankle[1], 7, foot[0], foot[1], 2.4, P, B.lX, B.lY);
    const tx = ankle[0] + (foot[0] - ankle[0]) * 0.55, ty = ankle[1] + (foot[1] - ankle[1]) * 0.55;
    g.fillStyle = P.tip; g.beginPath(); const dx = foot[0] - tx, dy = foot[1] - ty, d = Math.hypot(dx, dy) || 1; g.moveTo(foot[0], foot[1]); g.lineTo(tx - dy / d * 4.2, ty + dx / d * 4.2); g.lineTo(tx + dy / d * 4.2, ty - dx / d * 4.2); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,240,224,0.4)'; g.beginPath(); g.arc(knee[0] + B.lX * 3, knee[1] + B.lY * 3, 3, 0, TAU); g.fill();
  }
  // the shell
  const spr = shellSprite(R, P, B.lX, B.lY, mood === 'angry' ? 'angry' : 'calm');
  g.drawImage(spr, -R * SH, -R * SH, R * SH * 2, R * SH * 2);
  // bubbles from its mouth, when it's calm
  if (mood !== 'angry') for (let k = 0; k < 3; k++) {
    const f = (t * 0.45 + k / 3) % 1, x = Math.sin(k * 2.3 + t * 1.3) * 7 + (k - 1) * 6, y = -R * 0.66 - f * 26;
    const [bx, by] = lifted(B, [x, y, f * 30]); g.strokeStyle = `rgba(255,255,255,${0.7 * (1 - f)})`; g.lineWidth = 1.4; g.beginPath(); g.arc(bx, by, 2.5 + f * 4, 0, TAU); g.stroke();
  }
  g.restore();
  // the arms and claws, in the world: shoulder, a bowed elbow, the wrist where the claw is; spines on the outside
  for (const p of claws) {
    const lift = p.h * LIFT, sh = W(R * 0.5, p.sd * R * 0.5, 14), wr = [p.x, p.y - lift];
    const el = [sh[0] + (wr[0] - sh[0]) * 0.42 + F.ax * p.sd * 78, sh[1] + (wr[1] + lift - sh[1]) * 0.42 + F.ay * p.sd * 78 - 30 - lift * 0.55];   // the elbow bows outward and rises
    if (p.h > 0.05) { g.strokeStyle = `rgba(30,20,10,${0.12 * (1 - p.h * 0.5)})`; g.lineWidth = 34; g.beginPath(); g.moveTo(sh[0] + 20, sh[1] + 28); g.lineTo(el[0] + 30, el[1] + 30 + 30 + lift * 0.55); g.lineTo(p.x + 30, p.y + 30); g.stroke(); }   // its shadow on the sand
    for (const [a, b, n] of [[sh, el, 3], [el, wr, 2]]) {   // spines along the outer edge
      const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1; let nx = -dy / d, ny = dx / d;
      if (nx * ((a[0] + b[0]) / 2 - F.x) + ny * ((a[1] + b[1]) / 2 - F.y) < 0) { nx = -nx; ny = -ny; }
      for (let j = 0; j < n; j++) {
        const f = (j + 0.7) / (n + 0.4), x = a[0] + dx * f, y = a[1] + dy * f, r = n === 3 ? 21 : 19;
        g.beginPath(); g.moveTo(x - dx / d * 7 + nx * r * 0.7, y - dy / d * 7 + ny * r * 0.7); g.lineTo(x + dx / d * 5 + nx * (r + 11), y + dy / d * 5 + ny * (r + 11)); g.lineTo(x + dx / d * 8 + nx * r * 0.7, y + dy / d * 8 + ny * r * 0.7); g.closePath();
        g.fillStyle = P.dark; g.fill(); g.lineWidth = 2; g.strokeStyle = P.deep; g.stroke();
      }
    }
    limb(g, sh[0], sh[1], 26, el[0], el[1], 21, P, LIGHT[0], LIGHT[1], 2.5);
    limb(g, el[0], el[1], 21, wr[0], wr[1], 18, P, LIGHT[0], LIGHT[1], 2.5);
    g.fillStyle = rgrad(g, el[0] - 7, el[1] - 9, 2, el[0], el[1], 22, [[0, P.hi], [0.45, P.base], [1, P.mid]]); g.beginPath(); g.arc(el[0], el[1], 21, 0, TAU); g.fill(); g.lineWidth = 2.5; g.strokeStyle = P.deep; g.stroke();   // the elbow
    g.strokeStyle = alpha(P.deep, 0.5); g.lineWidth = 2; g.beginPath(); g.arc(el[0], el[1], 16, Math.atan2(wr[1] - el[1], wr[0] - el[0]) - 1.1, Math.atan2(wr[1] - el[1], wr[0] - el[0]) + 1.1); g.stroke();
    g.save(); g.translate(wr[0], wr[1]); g.rotate(p.ang); const k = 1 + 0.14 * p.h; g.scale(k, k * p.mirror);
    const ca = Math.cos(p.ang), sa = Math.sin(p.ang);
    chela(g, p.len, p.open, P, LIGHT[0] * ca + LIGHT[1] * sa, (-LIGHT[0] * sa + LIGHT[1] * ca) * p.mirror);
    g.restore();
  }
  // the eyes on their stalks, standing up off the front of the shell, looking at whoever it's after
  const blink = mood === 'asleep' || (mood !== 'angry' && (t % 4.7) < 0.13);
  const eyes = [-1, 1].map(sd => { const sway = Math.sin(t * 1.7 + sd) * 3; return { sd, b: W(R * 0.64, sd * R * 0.22, 6), e: W(R * 0.72, sd * R * 0.28, 56), sway }; });
  for (const E of eyes) {
    const ex = E.e[0] + E.sway, ey = E.e[1];
    limb(g, E.b[0], E.b[1], 8, ex, ey, 5.5, P, LIGHT[0], LIGHT[1]);
    for (const f of [0.3, 0.6]) { g.strokeStyle = alpha(P.deep, 0.6); g.lineWidth = 1.6; const x = E.b[0] + (ex - E.b[0]) * f, y = E.b[1] + (ey - E.b[1]) * f; g.beginPath(); g.moveTo(x - 5.5, y + 1); g.lineTo(x + 5.5, y - 1); g.stroke(); }
  }
  for (const E of eyes) {
    const ex = E.e[0] + E.sway, ey = E.e[1], other = eyes.find(o => o !== E), inner = Math.sign(other.e[0] - E.e[0]) || 1;
    let lk = [0, 0.4]; if (look) { const l = Math.hypot(look[0] - ex, look[1] - ey) || 1; lk = [(look[0] - ex) / l, (look[1] - ey) / l]; }
    eye(g, ex, ey, 19.5, P, lk, mood, inner, blink);
  }
  if (mood === 'angry') for (const E of eyes) for (let k = 0; k < 2; k++) {   // steaming, off the tops of its eyes
    const f = (t * 0.8 + k * 0.5 + (E.sd > 0 ? 0.25 : 0)) % 1, x = E.e[0] + E.sway + E.sd * (8 + f * 22), y = E.e[1] - 22 - f * 46;
    g.fillStyle = `rgba(255,255,255,${0.38 * Math.sin(f * Math.PI)})`; g.beginPath(); g.arc(x + Math.sin(f * 9 + k) * 3, y, 4 + f * 8, 0, TAU); g.fill();
  }
  g.restore();
}
