// Item icons: glossy objects in the mascots' style, centred on (0, 0) in a circle of radius r. They must read at r ≈ 13
// in the HUD, so each is one bold shape. t (seconds) animates the few that flicker.
import { TAU } from '../core.js';
import { alpha, circ, ell, fillStroke, isFlat, linear, poly, radial, setFlat as paintFlat, shade, star } from './paint.js';
import { BK, BOLD_DISPLAY, BOLD_W, bold, lookGen, lookIs } from '../look.js';
import { inView } from '../view.js';

const INK0 = '#1b1c24';
let INK = INK0;
// flat mode for a flat look (paint.js), which also draws the outlines in a flat look's dark edge colour
const setFlat = on => { const was = paintFlat(on); INK = on ? BK.ink : INK0; return was; };
const lw = r => isFlat() ? Math.max(0.9, r * 0.06) : Math.max(1.2, r * 0.09);   // (a flat look's outlines are thinner)
const CHROME = (ctx, x0, x1) => linear(ctx, x0, 0, x1, 0, [[0, '#6f7680'], [0.4, '#eef1f5'], [1, '#5d636c']]);
function shine(ctx, x, y, rx, ry, rot = -0.6, a = 0.75) { if (isFlat()) return; ell(ctx, x, y, rx, ry, rot); ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fill(); }
// a giant bath duck from above, facing +x: head, beak, wings and valve all inside the circle of radius r, so it's
// exactly as big as what it blocks
export function topDuck(ctx, r) {
  const el = (x, y, a, b, rot, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, a, b, rot, 0, TAU); ctx.fill(); };
  el(0, 0, r, r, 0, '#f5b300'); el(-r * .04, -r * .03, r * .93, r * .93, 0, '#ffca28');   // body (exactly the circle), with a darker rim
  el(-r * .12, -r * .52, r * .42, r * .2, -0.25, '#ffb300'); el(-r * .12, r * .52, r * .42, r * .2, 0.25, '#ffb300');   // wings
  el(-r * .3, -r * .3, r * .3, r * .16, -0.6, '#fff3b0');                                   // shine
  el(r * .42, 0, r * .42, r * .42, 0, '#f5b300'); el(r * .4, -r * .02, r * .38, r * .38, 0, '#ffd54f');   // head
  el(r * .74, 0, r * .14, r * .17, 0, '#ff8a3d');                                             // beak
  for (const y of [-1, 1]) { el(r * .55, y * r * .18, r * .07, r * .07, 0, '#2d3047'); el(r * .57, y * r * .18 - r * .025, r * .025, r * .025, 0, '#ffffff'); }
  ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.roundRect(-r * .86, -r * .06, r * .14, r * .12, r * .03); ctx.fill();   // valve, inside the outline: it stays a circle
}
// a rubber duck, side on, facing right (also the projectile and the Mega Duck): round bath-toy shapes, a warm
// amber outline (no black), a little beak, a rosy cheek
export function duckShape(ctx, r) {
  const Y = '#ffd84a', YL = '#fff3a6', YD = '#f2a900', LINE = '#c98a00', w = Math.max(0.8, r * 0.07);
  ctx.beginPath();   // body: one round blob with the tail flicking up at the back
  ctx.moveTo(-r * 0.55, r * 0.72);
  ctx.bezierCurveTo(-r * 1.0, r * 0.62, -r * 1.05, r * 0.05, -r * 0.92, -r * 0.18);
  ctx.quadraticCurveTo(-r * 0.62, r * 0.02, -r * 0.3, -r * 0.02);
  ctx.bezierCurveTo(r * 0.3, -r * 0.08, r * 0.95, r * 0.05, r * 0.88, r * 0.42);
  ctx.bezierCurveTo(r * 0.82, r * 0.8, r * 0.2, r * 0.86, -r * 0.55, r * 0.72);
  ctx.closePath();
  fillStroke(ctx, radial(ctx, -r * 0.2, r * 0.05, r * 0.05, 0, r * 0.35, r * 1.05, [[0, YL], [0.45, Y], [1, YD]]), LINE, w);
  ctx.strokeStyle = 'rgba(214,140,0,0.55)'; ctx.lineWidth = w * 1.1; ctx.lineCap = 'round';   // wing: just a soft curve
  ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.22); ctx.quadraticCurveTo(-r * 0.05, r * 0.58, r * 0.38, r * 0.3); ctx.stroke();
  circ(ctx, r * 0.3, -r * 0.3, r * 0.47); fillStroke(ctx, radial(ctx, r * 0.15, -r * 0.5, r * 0.02, r * 0.3, -r * 0.3, r * 0.52, [[0, YL], [0.55, Y], [1, YD]]), LINE, w);
  ctx.beginPath();   // beak: two soft orange lobes
  ctx.moveTo(r * 0.66, -r * 0.3); ctx.quadraticCurveTo(r * 1.12, -r * 0.34, r * 1.06, -r * 0.16); ctx.quadraticCurveTo(r * 0.9, -r * 0.1, r * 0.68, -r * 0.14); ctx.closePath();
  fillStroke(ctx, '#ff9a2e', '#d9691a', w * 0.9);
  ctx.beginPath(); ctx.moveTo(r * 0.68, -r * 0.14); ctx.quadraticCurveTo(r * 0.95, -r * 0.1, r * 0.98, -r * 0.02); ctx.quadraticCurveTo(r * 0.8, r * 0.02, r * 0.66, -r * 0.06); ctx.closePath();
  fillStroke(ctx, '#f07b1e', '#d9691a', w * 0.8);
  circ(ctx, r * 0.5, -r * 0.08, r * 0.1); ctx.fillStyle = 'rgba(255,120,120,0.45)'; ctx.fill();   // cheek
  ell(ctx, r * 0.42, -r * 0.42, r * 0.085, r * 0.11); ctx.fillStyle = '#4a2a10'; ctx.fill();          // eye
  circ(ctx, r * 0.395, -r * 0.46, r * 0.04); ctx.fillStyle = '#ffffff'; ctx.fill();
  shine(ctx, r * 0.14, -r * 0.55, r * 0.13, r * 0.07, -0.5, 0.8);
  shine(ctx, -r * 0.45, r * 0.12, r * 0.18, r * 0.07, -0.25, 0.5);
}
// The Rubber Duck in flight from above, facing angle a (screen radians), in a circle of radius r. Lit from the screen's
// top left whatever way it faces (the light is turned into the duck's frame). Small and pointy, unlike the round Mega Duck.
function rubberDuckTop(ctx, r, a) {
  const Y = '#ffd84a', YL = '#fff6b8', YD = '#e9a200', LINE = '#a86a00', w = r * 0.085;
  const ca = Math.cos(a), sa = Math.sin(a), lx = -(ca + sa) * Math.SQRT1_2, ly = (sa - ca) * Math.SQRT1_2;   // towards the light, in the duck's frame
  ctx.save(); ctx.rotate(a); ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-r * 0.98, -r * 0.04);   // body: an egg with the tail drawn out to a little point at the back
  ctx.bezierCurveTo(-r * 0.86, -r * 0.42, -r * 0.56, -r * 0.68, -r * 0.14, -r * 0.68);
  ctx.bezierCurveTo(r * 0.3, -r * 0.68, r * 0.56, -r * 0.42, r * 0.56, 0);
  ctx.bezierCurveTo(r * 0.56, r * 0.42, r * 0.3, r * 0.68, -r * 0.14, r * 0.68);
  ctx.bezierCurveTo(-r * 0.56, r * 0.68, -r * 0.86, r * 0.42, -r * 0.98, r * 0.04); ctx.quadraticCurveTo(-r * 1.06, 0, -r * 0.98, -r * 0.04); ctx.closePath();
  const bx = -r * 0.22; fillStroke(ctx, radial(ctx, bx + lx * r * 0.4, ly * r * 0.4, r * 0.05, bx, 0, r * 0.9, [[0, YL], [0.5, Y], [1, YD]]), LINE, w);
  for (const s of [-1, 1]) {   // wings: soft feathered lobes along the sides
    ctx.beginPath(); ctx.moveTo(-r * 0.02, s * r * 0.4);
    ctx.quadraticCurveTo(-r * 0.36, s * r * 0.7, -r * 0.74, s * r * 0.26); ctx.quadraticCurveTo(-r * 0.34, s * r * 0.34, -r * 0.02, s * r * 0.4);
    ctx.fillStyle = s * ly > 0 ? 'rgba(200,125,0,0.5)' : 'rgba(255,244,190,0.6)'; ctx.fill();   // the lit side's wing catches the light
  }
  const hx = r * 0.36, HR = r * 0.5;
  circ(ctx, hx - lx * r * 0.16, -ly * r * 0.16, HR); ctx.fillStyle = 'rgba(140,70,0,0.35)'; ctx.fill();   // the head's shadow on the back
  circ(ctx, hx, 0, HR); fillStroke(ctx, radial(ctx, hx + lx * HR * 0.45, ly * HR * 0.45, r * 0.03, hx, 0, HR * 1.05, [[0, '#fffbe0'], [0.45, '#ffde5a'], [1, YD]]), LINE, w);
  ctx.beginPath(); ctx.moveTo(r * 0.74, -r * 0.2);   // beak: a broad bill, rounded at the front
  ctx.bezierCurveTo(r * 0.96, -r * 0.3, r * 1.2, -r * 0.24, r * 1.2, 0); ctx.bezierCurveTo(r * 1.2, r * 0.24, r * 0.96, r * 0.3, r * 0.74, r * 0.2); ctx.closePath();
  fillStroke(ctx, radial(ctx, r * 0.96 + lx * r * 0.12, ly * r * 0.12, r * 0.02, r * 0.96, 0, r * 0.3, [[0, '#ffc48a'], [0.5, '#ff8f2a'], [1, '#e2621a']]), '#b84c10', w * 0.9);
  ctx.strokeStyle = 'rgba(160,60,10,0.5)'; ctx.lineWidth = w * 0.7; ctx.beginPath(); ctx.arc(r * 1.0, 0, r * 0.12, -1.2, 1.2); ctx.stroke();   // nostrils' ridge
  for (const s of [-1, 1]) {   // eyes, one each side of the head, a glint towards the light
    ell(ctx, r * 0.5, s * r * 0.27, r * 0.09, r * 0.11); ctx.fillStyle = '#2b1a0c'; ctx.fill();
    circ(ctx, r * 0.5 + lx * r * 0.04, s * r * 0.27 + ly * r * 0.04, r * 0.038); ctx.fillStyle = '#fff'; ctx.fill();
  }
  shine(ctx, bx + lx * r * 0.42, ly * r * 0.42, r * 0.24, r * 0.09, Math.atan2(ly, lx) + Math.PI / 2, 0.7);
  shine(ctx, hx + lx * HR * 0.48, ly * HR * 0.48, HR * 0.28, HR * 0.13, Math.atan2(ly, lx) + Math.PI / 2, 0.85);
  ctx.restore();
}
// Sprites for the flying duck, made once per screen resolution: the duck at DUCK_N headings, and its soft shadow.
const DUCK_N = 32, duckSprites = new Map();
function duckSprite(res, key, size, draw) {
  let set = duckSprites.get(res);
  if (!set) { if (duckSprites.size > 2) duckSprites.clear(); duckSprites.set(res, set = new Map()); }
  let s = set.get(key); if (s) return s;
  s = document.createElement('canvas'); s.width = s.height = Math.ceil(size * res);
  const g = s.getContext('2d'); g.scale(res, res); g.translate(size / 2, size / 2); draw(g); set.set(key, s); return s;
}
// the Rubber Duck on the road at (x, y), heading ang, radius r, h above the road (its shadow drops away down-right),
// sq squashed across the direction sqA (a bounce), wob a waddle (radians)
export function drawRubberDuck(ctx, x, y, ang, r, h = 0, sq = 0, sqA = 0, wob = 0) {
  const m = ctx.getTransform(), res = Math.min(6, 2 ** Math.ceil(Math.log2(Math.max(0.5, Math.hypot(m.a, m.b))) * 2) / 2);
  const SS = r * 2.6, DS = r * 2.5, BD = bold();   // a flat look (js/look.js): drawn flat, a plain flat shadow
  const shadow = BD ? duckSprite(res, 'shB' + lookGen(), SS, g => { g.scale(1, 0.8); g.fillStyle = BK.shade; g.beginPath(); g.arc(0, 0, SS * 0.36, 0, TAU); g.fill(); }) : duckSprite(res, 'sh', SS, g => {
    g.scale(1, 0.8); g.fillStyle = radial(g, 0, 0, 0, 0, 0, SS / 2, [[0, 'rgba(8,6,20,0.5)'], [0.5, 'rgba(8,6,20,0.32)'], [1, 'rgba(8,6,20,0)']]);
    g.beginPath(); g.arc(0, 0, SS / 2, 0, TAU); g.fill();
  });
  const k = 1 - h * 0.025, ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * Math.max(0.3, 1 - h * 0.06);
  ctx.drawImage(shadow, x + 2 + h * 0.6 - SS * k / 2, y + 3 + h * 0.8 - SS * k / 2, SS * k, SS * k);
  ctx.globalAlpha = ga;
  const A = ang + wob, i = ((Math.round(A / TAU * DUCK_N) % DUCK_N) + DUCK_N) % DUCK_N, a0 = i * TAU / DUCK_N;
  const body = BD ? duckSprite(res, 'b' + i + '|' + lookGen(), DS, g => { const was = setFlat(true); try { rubberDuckTop(g, r, a0); } finally { setFlat(was); } }) : duckSprite(res, i, DS, g => rubberDuckTop(g, r, a0));
  ctx.save(); ctx.translate(x, y);
  if (sq) { ctx.rotate(sqA); ctx.scale(1 - sq * 0.22, 1 + sq * 0.12); ctx.rotate(-sqA); }
  const up = 1 + h * 0.012; ctx.scale(up, up); ctx.rotate(A - a0);
  ctx.drawImage(body, -DS / 2, -DS / 2, DS, DS);
  ctx.restore();
}
function bomb(ctx, x, y, r, t, fuse = true) {
  circ(ctx, x, y, r); fillStroke(ctx, radial(ctx, x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r, [[0, '#7d8396'], [0.45, '#353946'], [1, '#14151b']]), INK, lw(r * 1.4));
  ctx.strokeStyle = 'rgba(150,180,230,0.55)'; ctx.lineWidth = r * 0.13; ctx.lineCap = 'round';   // bounce light off the road, down-right: keeps it off a dark background
  ctx.beginPath(); ctx.arc(x, y, r * 0.8, Math.PI * 0.05, Math.PI * 0.55); ctx.stroke();
  ctx.save(); ctx.translate(x + r * 0.45, y - r * 0.72); ctx.rotate(0.6); ctx.beginPath(); ctx.roundRect(-r * 0.22, -r * 0.18, r * 0.44, r * 0.32, r * 0.06); fillStroke(ctx, linear(ctx, -r * 0.22, 0, r * 0.22, 0, [[0, '#6f7680'], [0.5, '#d5dbe2'], [1, '#6f7680']]), INK, lw(r * 1.2)); ctx.restore();
  shine(ctx, x - r * 0.38, y - r * 0.38, r * 0.22, r * 0.13);
  if (!fuse) return;
  ctx.strokeStyle = '#c9a77a'; ctx.lineWidth = Math.max(1, r * 0.13); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x + r * 0.6, y - r * 0.9); ctx.quadraticCurveTo(x + r * 0.9, y - r * 1.3, x + r * 1.15, y - r * 1.12); ctx.stroke();
  const f = 0.75 + 0.35 * Math.sin(t * 30);
  star(ctx, x + r * 1.18, y - r * 1.16, r * 0.42 * f, 6, 0.4, t * 5); ctx.fillStyle = '#ffb12e'; ctx.fill();
  star(ctx, x + r * 1.18, y - r * 1.16, r * 0.2 * f, 6, 0.45, t * 5); ctx.fillStyle = '#fff6c2'; ctx.fill();
}

// ------------------------------------------------------------------------------------------------ the item box
// A rounded glass cube with a holographic sheen and an upright ?, seen from above and a little from the front, lit top
// left. It looks the same every quarter turn, so a quarter turn is cut into BOX_N angles; the screen-space sheen runs
// once round the rainbow per quarter turn, so it slides over the faces. Sizes for radius r (17 on the road).
const BOX_N = 24, QT = Math.PI / 2;
const boxDims = r => ({ h: r * 0.72, cr: r * 0.2, ex: r * 0.1, ey: r * 0.36, ol: Math.max(1.1, r * 0.085) });
const holo = (u, ph, l, a = 1, sat = l > 80 ? 100 : 88) => `hsla(${(u * 300 + ph * 360 + 190) % 360},${sat}%,${l}%,${a})`;
// the cube at angle th (0 .. a quarter turn), centred on (0, 0)
function boxBody(g, r, th) {
  const { h, cr, ex, ey, ol } = boxDims(r), ph = th / QT, cs = Math.cos(th), sn = Math.sin(th);
  const tx = -ex / 2, ty = -ey / 2;   // the top face's middle; the bottom is (ex, ey) further on
  const face = (x, y, grow) => { g.save(); g.translate(x, y); g.rotate(th); g.roundRect(-h - grow, -h - grow, (h + grow) * 2, (h + grow) * 2, cr + grow); g.restore(); };
  const slab = grow => { g.beginPath(); for (let k = 0; k <= 6; k++) face(tx + ex * k / 6, ty + ey * k / 6, grow); };   // the whole cube: top face swept down to the bottom
  slab(ol); g.fillStyle = INK; g.fill();                                    // outline
  slab(0); g.fillStyle = holo(0.5, ph, 24, 1, 50); g.fill();                       // the sides: deep glass
  // each side facing the camera, shaded by how much it faces the light (top left), in the rainbow it catches
  g.save(); slab(0); g.clip();
  const P = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, y]) => [tx + x * cs - y * sn, ty + x * sn + y * cs]);
  for (let i = 0; i < 4; i++) {
    const a = P[i], b = P[(i + 1) % 4], nx = b[1] - a[1], ny = a[0] - b[0];   // outward normal (unnormalised, length 2h)
    if (nx * ex + ny * ey <= 0) continue;
    const lit = (-nx - ny) / (2 * h * Math.SQRT2), u = 0.5 + 0.5 * Math.atan2(ny, nx) / Math.PI;
    poly(g, [a, b, [b[0] + ex * 1.5, b[1] + ey * 1.5], [a[0] + ex * 1.5, a[1] + ey * 1.5]]);
    g.fillStyle = linear(g, 0, ty, 0, ty + ey + h, [[0, holo(u, ph, 62 + lit * 12, 0.8, 80)], [1, holo(u + 0.15, ph, 34 + lit * 10, 0.7, 70)]]); g.fill();
  }
  g.restore();
  // the top face: a bright rainbow rim round a frosted pane, the sheen running corner to corner across the screen
  g.beginPath(); face(tx, ty, 0);
  g.fillStyle = linear(g, -h, -h, h, h, [0, 0.25, 0.5, 0.75, 1].map(o => [o, holo(o, ph, 64)])); g.fill();
  g.beginPath(); face(tx, ty, -h * 0.2);
  g.fillStyle = linear(g, -h, -h * 1.2, h, h, [[0, 'rgba(255,255,255,0.97)'], [0.35, holo(0.2, ph, 93, 0.95)], [0.7, holo(0.55, ph, 86, 0.95)], [1, holo(0.85, ph, 80, 0.95)]]); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = r * 0.04; g.stroke();
  g.save(); g.beginPath(); face(tx, ty, 0); g.clip();   // light on the glass: a broad glint top left, a thin one beside it
  g.fillStyle = 'rgba(255,255,255,0.55)'; poly(g, [[-h * 2, -h * 0.55], [-h * 0.55, -h * 2], [-h * 0.15, -h * 2], [-h * 2, -h * 0.15]]); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)'; poly(g, [[-h * 2, h * 0.05], [h * 0.05, -h * 2], [h * 0.2, -h * 2], [-h * 2, h * 0.2]]); g.fill();
  g.restore();
  g.beginPath(); face(tx, ty, 0); g.strokeStyle = alpha(INK, 0.55); g.lineWidth = ol * 0.6; g.stroke();   // the edge between the top and the sides
}
// the ?, drawn as strokes (no font to wait for): white, a thick dark outline, a soft shadow down-right inside the glass
function boxMark(g, r) {
  const s = r * 0.52, path = () => {
    g.beginPath(); g.arc(0, -s * 0.4, s * 0.4, Math.PI * 1.05, Math.PI * 2.3); g.lineTo(0, s * 0.16); g.lineTo(0, s * 0.26);
  };
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.save(); g.translate(s * 0.12, s * 0.16); path(); g.strokeStyle = 'rgba(40,20,110,0.3)'; g.lineWidth = s * 0.6; g.stroke(); circ(g, 0, s * 0.74, s * 0.3); g.fillStyle = 'rgba(40,20,110,0.3)'; g.fill(); g.restore();
  path(); g.strokeStyle = '#2a1d6e'; g.lineWidth = s * 0.6; g.stroke(); circ(g, 0, s * 0.74, s * 0.3); g.fillStyle = '#2a1d6e'; g.fill();
  path(); g.strokeStyle = '#ffffff'; g.lineWidth = s * 0.32; g.stroke(); circ(g, 0, s * 0.74, s * 0.16); g.fillStyle = '#ffffff'; g.fill();
}
// the icon (the lab): the cube at angle t, its ? on top
function boxIcon(ctx, r, t) {
  const th = ((t * 0.35) % QT + QT) % QT, { ex, ey } = boxDims(r);
  ctx.save(); boxBody(ctx, r, th); ctx.translate(-ex / 2, -ey / 2); boxMark(ctx, r); ctx.restore();
}
// The boxes on the road: sprites made once per angle and resolution (glow, shadow fainter the higher it bobs, cube at
// the nearest BOX_N angle turned the rest of the way, ?). A respawning box pops up with a little overshoot.
const BOX_R = 17, boxSprites = new Map();
function boxSprite(res, key, size, draw) {
  let set = boxSprites.get(res);
  if (!set) { if (boxSprites.size > 2) boxSprites.clear(); boxSprites.set(res, set = new Map()); }
  let s = set.get(key); if (s) return s;
  s = document.createElement('canvas'); s.width = s.height = Math.ceil(size * res);
  const g = s.getContext('2d'); g.scale(res, res); g.translate(size / 2, size / 2); draw(g); set.set(key, s); return s;
}
export function itemBoxes(ctx, race, t) {
  if (bold()) return itemBoxesBold(ctx, race, t);
  const m = ctx.getTransform(), res = Math.min(6, 2 ** Math.ceil(Math.log2(Math.max(0.5, Math.hypot(m.a, m.b))) * 2) / 2);   // in √2 steps, never stretched up
  const BS = BOX_R * 2.7, GS = BOX_R * 3, SS = BOX_R * 2.2;
  const glow = boxSprite(res, 'glow', GS, g => {
    const R = GS / 2, c = g.createConicGradient ? g.createConicGradient(0, 0, 0) : null;
    if (c) { for (let k = 0; k <= 6; k++) c.addColorStop(k / 6, holo(k / 6 * 1.2, 0, 72)); g.fillStyle = c; } else g.fillStyle = '#b39dff';
    g.fillRect(-R, -R, R * 2, R * 2); g.globalCompositeOperation = 'destination-in';
    g.fillStyle = radial(g, 0, 0, 0, 0, 0, R, [[0, 'rgba(0,0,0,0.6)'], [0.4, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(-R, -R, R * 2, R * 2);
  });
  const shadow = boxSprite(res, 'shadow', SS, g => {
    const R = SS / 2; g.scale(1, 0.62); g.fillStyle = radial(g, 0, 0, 0, 0, 0, R, [[0, 'rgba(10,8,30,0.62)'], [0.55, 'rgba(10,8,30,0.45)'], [1, 'rgba(10,8,30,0)']]);
    g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
  });
  const mark = boxSprite(res, 'mark', BOX_R * 1.4, g => boxMark(g, BOX_R));
  const { ex, ey } = boxDims(BOX_R);
  for (const b of race.boxes) {
    if (b.t > 0 || b.gold || !inView(b.x, b.y, BOX_R * 3 + 30)) continue;   // golden ones: art/pharaoh.js
    const bob = Math.sin(t * 3 + b.lat) * 3, lift = 9 + bob, since = -b.t;
    const pop = since < 0.4 ? (q => 1 + 2.4 * (q - 1) ** 3 + 1.4 * (q - 1) ** 2)(since / 0.4) : 1;   // 0 → a touch over 1 → 1
    const fade = since < 0.12 ? since / 0.12 : 1;
    ctx.globalAlpha = fade; ctx.drawImage(glow, b.x - GS / 2, b.y + 4 - GS / 2, GS, GS);
    const sk = pop * (1.08 - lift * 0.022); ctx.globalAlpha = fade * (1.15 - lift * 0.04);
    ctx.drawImage(shadow, b.x + 6 - SS * sk / 2, b.y + 10 - SS * sk / 2, SS * sk, SS * sk);
    ctx.globalAlpha = fade;
    const a = ((t * 0.35 + b.lat * 0.05 + (b.s || 0) * 0.013) % QT + QT) % QT, k = Math.round(a / QT * BOX_N) % BOX_N;
    const body = boxSprite(res, k, BS, g => boxBody(g, BOX_R, k * QT / BOX_N));
    ctx.save(); ctx.translate(b.x, b.y - lift); if (pop !== 1) ctx.scale(pop, pop);
    ctx.rotate(a - k * QT / BOX_N > QT / 2 ? a - k * QT / BOX_N - QT : a - k * QT / BOX_N);
    ctx.drawImage(body, -BS / 2, -BS / 2, BS, BS);
    ctx.setTransform(m); ctx.translate(b.x - ex / 2, b.y - lift - ey / 2 + Math.sin(t * 2.2 + b.lat) * 0.6); if (pop !== 1) ctx.scale(pop, pop);
    ctx.drawImage(mark, -BOX_R * 0.7, -BOX_R * 0.7, BOX_R * 1.4, BOX_R * 1.4);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// A flat look's box (js/look.js): a flat tile in BK.box with its darker side below, a plain ?, a faint shadow. No
// outline, no glow; same bob, turn and pop.
function boxBodyBold(g, r, th) {
  const h = r * 0.72, d = r * 0.22, rc = h * 0.3;
  const face = (x, y) => { g.save(); g.translate(x, y); g.rotate(th); g.roundRect(-h, -h, h * 2, h * 2, rc); g.restore(); };
  g.beginPath(); for (let k = 1; k <= 6; k++) face(0, d * k / 6); g.fillStyle = BK.boxSide; g.fill();
  g.beginPath(); face(0, 0); g.fillStyle = BK.box; g.fill();
}
function boxMarkBold(g, r) {
  const s = r * 0.5;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.arc(0, -s * 0.4, s * 0.4, Math.PI * 1.05, Math.PI * 2.3); g.lineTo(0, s * 0.16); g.lineTo(0, s * 0.26);
  g.strokeStyle = BK.boxMark; g.lineWidth = s * 0.3; g.stroke();
  g.beginPath(); g.arc(0, s * 0.74, s * 0.17, 0, TAU); g.fillStyle = BK.boxMark; g.fill();
}
// Classic Flat's box: Classic's chunky inked cube in flat candy colours (the plain flat box read too dull), a cream
// top with a gold rim round a violet pane, the bold ?. No gradients, no glow.
const FLAT_SIDES = ['#ff5c8a', '#ffb300', '#35b8f2', '#2fc27a'];
function boxBodyFlat(g, r, th) {
  const { h, cr, ex, ey, ol } = boxDims(r), cs = Math.cos(th), sn = Math.sin(th), tx = -ex / 2, ty = -ey / 2;
  const face = (x, y, grow) => { g.save(); g.translate(x, y); g.rotate(th); g.roundRect(-h - grow, -h - grow, (h + grow) * 2, (h + grow) * 2, cr + grow); g.restore(); };
  const slab = grow => { g.beginPath(); for (let k = 0; k <= 6; k++) face(tx + ex * k / 6, ty + ey * k / 6, grow); };
  slab(ol); g.fillStyle = INK; g.fill();
  slab(0); g.fillStyle = '#2a1d6e'; g.fill();
  g.save(); slab(0); g.clip();
  const P = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, y]) => [tx + x * cs - y * sn, ty + x * sn + y * cs]);
  for (let i = 0; i < 4; i++) {
    const a = P[i], b = P[(i + 1) % 4], nx = b[1] - a[1], ny = a[0] - b[0];
    if (nx * ex + ny * ey <= 0) continue;
    const lit = (-nx - ny) / (2 * h * Math.SQRT2);
    poly(g, [a, b, [b[0] + ex * 1.5, b[1] + ey * 1.5], [a[0] + ex * 1.5, a[1] + ey * 1.5]]);
    g.fillStyle = FLAT_SIDES[i]; g.fill();
    g.fillStyle = `rgba(20,10,50,${(0.32 - lit * 0.26).toFixed(3)})`; g.fill();   // facing away from the light: darker
  }
  g.restore();
  g.beginPath(); face(tx, ty, 0); g.fillStyle = '#ffc93c'; g.fill();               // the top: a gold rim...
  g.beginPath(); face(tx, ty, -h * 0.2); g.fillStyle = '#6a5cf2'; g.fill();         // ...round a violet pane (the white ? stands out on it)
  g.save(); g.beginPath(); face(tx, ty, 0); g.clip();                               // two flat glints, top left
  g.fillStyle = 'rgba(255,255,255,0.85)'; poly(g, [[tx - h * 2, ty - h * 0.5], [tx - h * 0.5, ty - h * 2], [tx - h * 0.2, ty - h * 2], [tx - h * 2, ty - h * 0.2]]); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.55)'; poly(g, [[tx - h * 2, ty + h * 0.05], [tx + h * 0.05, ty - h * 2], [tx + h * 0.2, ty - h * 2], [tx - h * 2, ty + h * 0.2]]); g.fill();
  g.restore();
  g.beginPath(); face(tx, ty, 0); g.strokeStyle = INK; g.lineWidth = ol * 0.6; g.stroke();
}
function boxMarkFlat(g, r) {
  const s = r * 0.52, path = () => { g.beginPath(); g.arc(0, -s * 0.4, s * 0.4, Math.PI * 1.05, Math.PI * 2.3); g.lineTo(0, s * 0.16); g.lineTo(0, s * 0.26); };
  g.lineCap = 'round'; g.lineJoin = 'round';
  path(); g.strokeStyle = '#2a1d6e'; g.lineWidth = s * 0.62; g.stroke(); circ(g, 0, s * 0.74, s * 0.31); g.fillStyle = '#2a1d6e'; g.fill();
  path(); g.strokeStyle = '#ffffff'; g.lineWidth = s * 0.32; g.stroke(); circ(g, 0, s * 0.74, s * 0.16); g.fillStyle = '#ffffff'; g.fill();
}
function itemBoxesFlat(ctx, race, t) {
  const m = ctx.getTransform(), res = Math.min(6, 2 ** Math.ceil(Math.log2(Math.max(0.5, Math.hypot(m.a, m.b))) * 2) / 2);
  const BS = BOX_R * 2.7, { ex, ey } = boxDims(BOX_R), mark = boxSprite(res, 'fmark', BOX_R * 1.4, g => boxMarkFlat(g, BOX_R));
  for (const b of race.boxes) {
    if (b.t > 0 || b.gold || !inView(b.x, b.y, BOX_R * 3 + 30)) continue;
    const bob = Math.sin(t * 3 + b.lat) * 3, lift = 9 + bob, since = -b.t;
    const pop = since < 0.4 ? (q => 1 + 2.4 * (q - 1) ** 3 + 1.4 * (q - 1) ** 2)(since / 0.4) : 1;
    const fade = since < 0.12 ? since / 0.12 : 1, sk = pop * (1.08 - lift * 0.022);
    ctx.globalAlpha = fade * 0.32; ctx.fillStyle = '#140c32'; ctx.beginPath(); ctx.ellipse(b.x + 6, b.y + 10, BOX_R * sk, BOX_R * 0.6 * sk, 0, 0, TAU); ctx.fill();   // a crisp flat shadow
    ctx.globalAlpha = fade;
    const a = ((t * 0.35 + b.lat * 0.05 + (b.s || 0) * 0.013) % QT + QT) % QT, k = Math.round(a / QT * BOX_N) % BOX_N;
    const body = boxSprite(res, 'f' + k, BS, g => boxBodyFlat(g, BOX_R, k * QT / BOX_N));
    ctx.save(); ctx.translate(b.x, b.y - lift); if (pop !== 1) ctx.scale(pop, pop);
    ctx.rotate(a - k * QT / BOX_N > QT / 2 ? a - k * QT / BOX_N - QT : a - k * QT / BOX_N);
    ctx.drawImage(body, -BS / 2, -BS / 2, BS, BS);
    ctx.setTransform(m); ctx.translate(b.x - ex / 2, b.y - lift - ey / 2 + Math.sin(t * 2.2 + b.lat) * 0.6); if (pop !== 1) ctx.scale(pop, pop);
    ctx.drawImage(mark, -BOX_R * 0.7, -BOX_R * 0.7, BOX_R * 1.4, BOX_R * 1.4);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
function itemBoxesBold(ctx, race, t) {
  if (lookIs('flat')) return itemBoxesFlat(ctx, race, t);
  const m = ctx.getTransform(), res = Math.min(6, 2 ** Math.ceil(Math.log2(Math.max(0.5, Math.hypot(m.a, m.b))) * 2) / 2);
  const BS = BOX_R * 2.7, gen = lookGen(), key = k => 'c' + k + '|' + gen;
  for (const b of race.boxes) {
    if (b.t > 0 || b.gold || !inView(b.x, b.y, BOX_R * 3 + 30)) continue;
    const bob = Math.sin(t * 3 + b.lat) * 3, lift = 9 + bob, since = -b.t;
    const pop = since < 0.4 ? (q => 1 + 2.4 * (q - 1) ** 3 + 1.4 * (q - 1) ** 2)(since / 0.4) : 1;
    ctx.globalAlpha = since < 0.12 ? since / 0.12 : 1;
    const sk = pop * (1.08 - lift * 0.022);
    ctx.fillStyle = BK.shade; ctx.beginPath(); ctx.ellipse(b.x + 2, b.y + 10, BOX_R * 0.95 * sk, BOX_R * 0.55 * sk, 0, 0, TAU); ctx.fill();
    const a = ((t * 0.35 + b.lat * 0.05 + (b.s || 0) * 0.013) % QT + QT) % QT, k = Math.round(a / QT * BOX_N) % BOX_N;
    const body = boxSprite(res, key(k), BS, g => boxBodyBold(g, BOX_R, k * QT / BOX_N));
    ctx.save(); ctx.translate(b.x, b.y - lift); if (pop !== 1) ctx.scale(pop, pop);
    ctx.drawImage(body, -BS / 2, -BS / 2, BS, BS);
    ctx.drawImage(boxSprite(res, 'cmark' + gen, BOX_R * 1.4, g => boxMarkBold(g, BOX_R)), -BOX_R * 0.7, -BOX_R * 0.7, BOX_R * 1.4, BOX_R * 1.4);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// A flat look's item icons: each drawn once in flat mode (paint.js) into a sprite at its shown size (√2 steps). The
// animated ones hold still in this look.
const boldIcons = new Map();
export function drawIconBold(ctx, type, r) {
  const f = ICONS[type]; if (!f) return;
  const m = ctx.getTransform(), px = Math.min(256, 2 ** (Math.ceil(Math.log2(Math.max(2, r * Math.hypot(m.a, m.b))) * 2) / 2));
  const key = type + '|' + px + '|' + lookGen();
  let spr = boldIcons.get(key);
  if (!spr) {
    if (boldIcons.size > 300) boldIcons.clear();
    const S = Math.ceil(px * 3.2);
    const a = document.createElement('canvas'); a.width = a.height = S;
    const g = a.getContext('2d'); g.translate(S / 2, S / 2); g.lineJoin = 'round'; g.lineCap = 'round';
    const was = setFlat(true); try { f(g, px, 0); } finally { setFlat(was); }
    spr = document.createElement('canvas'); spr.width = spr.height = S;
    const o = spr.getContext('2d'); o.filter = 'saturate(0.9)'; o.drawImage(a, 0, 0); o.filter = 'none';   // (a step calmer, where filters work)
    boldIcons.set(key, spr);
  }
  const k = r / px, S = spr.width * k;
  ctx.drawImage(spr, -S / 2, -S / 2, S, S);
}
// the event feed's signs, flags and badges in a flat look: drawn live, in flat mode
export function flatDraw(fn) { if (!bold()) return fn(); const was = setFlat(true); try { return fn(); } finally { setFlat(was); } }

export const ICONS = {
  // the phoenix's landing (race-secret.js): a fireball, flames licking up round a gold sun
  phoenix(ctx, r) {
    ctx.beginPath(); ctx.moveTo(-r * 0.62, r * 0.55); ctx.quadraticCurveTo(-r * 0.9, -r * 0.2, -r * 0.35, -r * 0.55); ctx.quadraticCurveTo(-r * 0.3, -r * 0.1, -r * 0.05, -r * 0.2);
    ctx.quadraticCurveTo(-r * 0.15, -r * 0.75, r * 0.2, -r * 0.95); ctx.quadraticCurveTo(r * 0.15, -r * 0.45, r * 0.42, -r * 0.4); ctx.quadraticCurveTo(r * 0.95, -r * 0.1, r * 0.62, r * 0.55); ctx.closePath();
    ctx.fillStyle = linear(ctx, 0, -r, 0, r * 0.6, [[0, '#ffd23f'], [0.5, '#ff8a1f'], [1, '#e2401b']]); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw(r); ctx.stroke();
    circ(ctx, 0, r * 0.18, r * 0.34); ctx.fillStyle = radial(ctx, -r * 0.1, r * 0.08, 1, 0, r * 0.18, r * 0.34, [[0, '#fff6c9'], [1, '#ffc93c']]); ctx.fill(); ctx.stroke();
  },
  // a bit (race-bits.js): a little glowing chip, a mint gem set in a dark rim with its pins out the sides, a lit core
  bit(ctx, r, t) {
    const s = r * 0.62, glow = 0.75 + 0.25 * Math.sin(t * 5);
    ctx.strokeStyle = INK; ctx.lineWidth = lw(r) * 1.2;
    for (let k = -1; k <= 1; k += 2) for (const u of [-0.45, 0.45]) { ctx.beginPath(); ctx.moveTo(k * s, u * s); ctx.lineTo(k * s * 1.45, u * s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(u * s, k * s); ctx.lineTo(u * s, k * s * 1.45); ctx.stroke(); }
    ctx.beginPath(); ctx.roundRect(-s, -s, s * 2, s * 2, s * 0.3);
    ctx.fillStyle = linear(ctx, -s, -s, s, s, [[0, '#a7ffeb'], [0.5, '#1de9b6'], [1, '#00897b']]); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw(r); ctx.stroke();
    circ(ctx, 0, 0, s * 0.5); ctx.fillStyle = radial(ctx, 0, 0, 0, 0, 0, s * 0.5, [[0, '#ffffff'], [0.6, alpha('#e0fff7', glow)], [1, alpha('#64ffda', 0)]]); ctx.fill();
    shine(ctx, -s * 0.45, -s * 0.5, s * 0.32, s * 0.14, -0.7, 0.85);
  },
  // the item box: a turning glass cube with a holographic sheen and a ? inside (drawn above, with the road version)
  box: boxIcon,
  // Turbo: a nitrous bottle firing, nose up-right, a fat flame out of the nozzle
  boost(ctx, r, t) {
    const w = lw(r), fl = 1 + 0.1 * Math.sin(t * 40);
    ctx.save(); ctx.rotate(0.72); ctx.translate(0, -r * 0.1);
    const tongue = (hw, len, col, edge) => {
      const y0 = r * 0.5, y1 = r * (0.5 + len);
      ctx.beginPath(); ctx.moveTo(-hw, y0); ctx.bezierCurveTo(-hw * 1.15, y0 + (y1 - y0) * 0.45, -hw * 0.35, y1 - (y1 - y0) * 0.15, 0, y1);
      ctx.bezierCurveTo(hw * 0.35, y1 - (y1 - y0) * 0.15, hw * 1.15, y0 + (y1 - y0) * 0.45, hw, y0); ctx.closePath(); fillStroke(ctx, col, edge, edge && w * 0.8);
    };
    tongue(r * 0.3, 0.6 * fl, '#ff4a1c', '#a8250c'); tongue(r * 0.19, 0.42 * fl, '#ffa21f'); tongue(r * 0.09, 0.24 * fl, '#fff6c2');
    ctx.beginPath(); ctx.roundRect(-r * 0.2, r * 0.4, r * 0.4, r * 0.16, r * 0.04); fillStroke(ctx, CHROME(ctx, -r * 0.2, r * 0.2), INK, w);   // nozzle
    const body = () => { ctx.beginPath(); ctx.roundRect(-r * 0.38, -r * 0.56, r * 0.76, r * 1.02, [r * 0.34, r * 0.34, r * 0.12, r * 0.12]); };
    body(); ctx.fillStyle = linear(ctx, -r * 0.38, 0, r * 0.38, 0, [[0, '#b35d00'], [0.26, '#ffd864'], [0.5, '#ffb300'], [1, '#8a3f00']]); ctx.fill();
    ctx.save(); body(); ctx.clip();   // label: a white band with a red stripe
    ctx.fillStyle = '#fbf7ee'; ctx.fillRect(-r * 0.4, -r * 0.1, r * 0.8, r * 0.3);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(r * 0.18, -r * 0.1, r * 0.22, r * 0.3);
    ctx.fillStyle = '#e53935'; ctx.fillRect(-r * 0.4, r * 0.0, r * 0.8, r * 0.1);
    ctx.strokeStyle = INK; ctx.lineWidth = w * 0.6; ctx.strokeRect(-r * 0.4, -r * 0.1, r * 0.8, r * 0.3);
    ctx.restore();
    body(); ctx.strokeStyle = INK; ctx.lineWidth = w; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-r * 0.12, -r * 0.72, r * 0.24, r * 0.18, r * 0.04); fillStroke(ctx, CHROME(ctx, -r * 0.12, r * 0.12), INK, w);   // valve
    ctx.beginPath(); ctx.roundRect(-r * 0.24, -r * 0.86, r * 0.48, r * 0.15, r * 0.06); fillStroke(ctx, linear(ctx, 0, -r * 0.86, 0, -r * 0.71, [[0, '#ff7a6e'], [1, '#c62828']]), INK, w);   // knob
    shine(ctx, -r * 0.22, -r * 0.3, r * 0.06, r * 0.17, 0, 0.8);
    ctx.restore();
  },
  // Overclock: a rev gauge in a chrome bezel, the needle buried in the red
  oc(ctx, r, t) {
    const w = lw(r);
    circ(ctx, 0, 0, r * 0.95); fillStroke(ctx, linear(ctx, -r * 0.7, -r * 0.7, r * 0.7, r * 0.7, [[0, '#ffffff'], [0.45, '#b4bcc6'], [1, '#4b525c']]), INK, w);
    circ(ctx, 0, 0, r * 0.76); fillStroke(ctx, radial(ctx, -r * 0.3, -r * 0.3, r * 0.1, 0, 0, r * 0.8, [[0, '#3a3e48'], [1, '#101116']]), INK, w * 0.7);
    const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
    ctx.lineCap = 'butt'; ctx.lineWidth = r * 0.17;
    for (const [f0, f1, c] of [[0, 0.55, '#3ddc84'], [0.55, 0.76, '#ffd23f'], [0.76, 1, '#ff3b30']]) { ctx.beginPath(); ctx.arc(0, 0, r * 0.56, a0 + (a1 - a0) * f0, a0 + (a1 - a0) * f1); ctx.strokeStyle = c; ctx.stroke(); }
    const na = a0 + (a1 - a0) * (0.93 + 0.03 * Math.sin(t * 35)), nx = Math.cos(na), ny = Math.sin(na);
    poly(ctx, [[nx * r * 0.66, ny * r * 0.66], [-ny * r * 0.08, nx * r * 0.08], [-nx * r * 0.16, -ny * r * 0.16], [ny * r * 0.08, -nx * r * 0.08]]);
    ctx.lineJoin = 'round'; fillStroke(ctx, '#ffffff', INK, w * 0.7);
    circ(ctx, 0, 0, r * 0.15); fillStroke(ctx, '#ff6d00', INK, w * 0.7);
    shine(ctx, -r * 0.3, -r * 0.42, r * 0.3, r * 0.1, -0.6, 0.3);
    shine(ctx, -r * 0.5, -r * 0.62, r * 0.14, r * 0.05, -0.8, 0.9);   // glint on the bezel
  },
  // Firewall: a shield of bricks with flames on top
  shield(ctx, r, t) {
    const shape = () => { ctx.beginPath(); ctx.moveTo(0, -r * 0.75); ctx.quadraticCurveTo(r * 0.5, -r * 0.55, r * 0.82, -r * 0.62); ctx.quadraticCurveTo(r * 0.9, r * 0.45, 0, r * 0.98); ctx.quadraticCurveTo(-r * 0.9, r * 0.45, -r * 0.82, -r * 0.62); ctx.quadraticCurveTo(-r * 0.5, -r * 0.55, 0, -r * 0.75); ctx.closePath(); };
    for (let k = -2; k <= 2; k++) { const h = (0.32 + 0.12 * Math.sin(t * 14 + k * 1.7)) * r; ctx.beginPath(); ctx.moveTo(k * r * 0.3 - r * 0.16, -r * 0.6); ctx.quadraticCurveTo(k * r * 0.3, -r * 0.6 - h * 2, k * r * 0.3 + r * 0.16, -r * 0.6); ctx.fillStyle = k % 2 ? '#ff7a1a' : '#ffb12e'; ctx.fill(); }
    shape(); fillStroke(ctx, linear(ctx, -r, -r, r, r, [[0, '#8fe3ff'], [0.5, '#2aa8e8'], [1, '#0d5ea8']]), INK, lw(r));
    ctx.save(); shape(); ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.max(0.8, r * 0.07);
    for (let row = 0; row < 4; row++) { const y = -r * 0.2 + row * r * 0.28; ctx.beginPath(); ctx.moveTo(-r, y); ctx.lineTo(r, y); ctx.stroke(); for (let x = -r + (row % 2) * r * 0.25; x < r; x += r * 0.5) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + r * 0.28); ctx.stroke(); } }
    ctx.restore();
    shine(ctx, -r * 0.4, -r * 0.35, r * 0.18, r * 0.09);
  },
  // sudo: a gold crown with a # on its band
  sudo(ctx, r) {
    poly(ctx, [[-r * 0.85, r * 0.55], [-r * 0.92, -r * 0.45], [-r * 0.45, r * 0.02], [0, -r * 0.72], [r * 0.45, r * 0.02], [r * 0.92, -r * 0.45], [r * 0.85, r * 0.55]]);
    ctx.lineJoin = 'round'; fillStroke(ctx, linear(ctx, 0, -r * 0.7, 0, r * 0.6, [[0, '#fff0a3'], [0.45, '#ffc93c'], [1, '#c98a0b']]), INK, lw(r));
    ctx.beginPath(); ctx.roundRect(-r * 0.88, r * 0.28, r * 1.76, r * 0.42, r * 0.08); fillStroke(ctx, linear(ctx, 0, r * 0.28, 0, r * 0.7, [[0, '#ffd75e'], [1, '#b8790a']]), INK, lw(r));
    for (const [x, y, c] of [[-r * 0.92, -r * 0.5, '#ff4d6d'], [0, -r * 0.78, '#4fc3f7'], [r * 0.92, -r * 0.5, '#5be08c']]) { circ(ctx, x, y, r * 0.15); fillStroke(ctx, c, INK, lw(r) * 0.8); }
    ctx.fillStyle = '#6b4300'; ctx.font = `800 ${r * 0.5}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('#', 0, r * 0.5);
    shine(ctx, -r * 0.45, -r * 0.05, r * 0.14, r * 0.07, -1);
  },
  duck(ctx, r) { duckShape(ctx, r * 0.95); },
  // Mega Duck: the big round duck from above. On the road it's topDuck, a plain circle (its hitbox); here head and beak
  // stick out so it reads as a duck at 16 px.
  mega(ctx, r) {
    const w = lw(r), LINE = '#c98a00';
    ctx.save(); ctx.rotate(-Math.PI / 4); ctx.translate(-r * 0.1, 0);   // facing up-right; in this frame the light comes from -y
    const ball = (x, y, R, c0, c1, c2) => { circ(ctx, x, y, R); fillStroke(ctx, radial(ctx, x, y - R * 0.45, R * 0.05, x, y, R * 1.05, [[0, c0], [0.5, c1], [1, c2]]), LINE, w); };
    ball(-r * 0.12, 0, r * 0.74, '#fff3a6', '#ffca28', '#f2a900');   // body
    for (const s of [-1, 1]) { ell(ctx, -r * 0.18, s * r * 0.48, r * 0.38, r * 0.17, s * 0.15); fillStroke(ctx, s < 0 ? '#ffc21a' : '#eda000', LINE, w * 0.8); }   // wings
    ctx.beginPath(); ctx.roundRect(-r * 0.93, -r * 0.08, r * 0.15, r * 0.16, r * 0.04); fillStroke(ctx, '#e53935', '#8e1b1b', w * 0.6);   // the inflation valve
    ball(r * 0.5, 0, r * 0.36, '#fff6c0', '#ffd54f', '#f2a900');   // head
    ell(ctx, r * 0.9, 0, r * 0.2, r * 0.15); fillStroke(ctx, '#ff9a2e', '#d9691a', w * 0.9);   // beak
    for (const s of [-1, 1]) { circ(ctx, r * 0.6, s * r * 0.17, r * 0.075); ctx.fillStyle = '#4a2a10'; ctx.fill(); }
    shine(ctx, -r * 0.3, -r * 0.42, r * 0.26, r * 0.09, 0.2, 0.75);
    ctx.restore();
  },
  // malloc: a spotty pink mushroom on a memory-chip stem
  grow(ctx, r) {
    ctx.beginPath(); ctx.roundRect(-r * 0.34, -r * 0.05, r * 0.68, r * 0.88, r * 0.12); fillStroke(ctx, linear(ctx, 0, 0, 0, r, [[0, '#fff6e6'], [1, '#e6d3b3']]), INK, lw(r));
    ctx.fillStyle = '#c9a227'; for (let k = 0; k < 3; k++) ctx.fillRect(-r * 0.22 + k * r * 0.17, r * 0.62, r * 0.09, r * 0.18);   // chip legs
    circ(ctx, -r * 0.12, r * 0.28, r * 0.07); ctx.fillStyle = INK; ctx.fill(); circ(ctx, r * 0.12, r * 0.28, r * 0.07); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -r * 0.08, r * 0.95, r * 0.78, 0, Math.PI, TAU); ctx.closePath();
    fillStroke(ctx, radial(ctx, -r * 0.3, -r * 0.6, r * 0.05, 0, -r * 0.2, r, [[0, '#ff9ab8'], [0.6, '#ff5c8a'], [1, '#c2185b']]), INK, lw(r));
    for (const [x, y, s2] of [[-r * 0.48, -r * 0.4, 0.17], [r * 0.1, -r * 0.62, 0.2], [r * 0.55, -r * 0.28, 0.14]]) { circ(ctx, x, y, r * s2); ctx.fillStyle = '#ffffff'; ctx.fill(); }
    shine(ctx, -r * 0.6, -r * 0.22, r * 0.12, r * 0.06, -0.9);
  },
  // Ctrl+Z: a fat ↶ arrow curling back, with a Z keycap in its bowl
  undo(ctx, r) {
    const w = lw(r), cx = r * 0.16, cy = r * 0.12, R = r * 0.52, top = cy - R, T = r * 0.3;
    const shaft = () => { ctx.beginPath(); ctx.moveTo(-r * 0.1, top); ctx.lineTo(cx, top); ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI * 0.78); };
    const head = () => poly(ctx, [[-r * 0.86, top], [-r * 0.06, top - r * 0.4], [-r * 0.06, top + r * 0.4]]);
    const col = linear(ctx, -r, -r, r, r, [[0, '#b9aeff'], [0.5, '#8f7fff'], [1, '#5644d6']]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    shaft(); ctx.strokeStyle = INK; ctx.lineWidth = T + w * 2; ctx.stroke(); head(); ctx.fillStyle = INK; ctx.fill(); ctx.lineWidth = w * 2; ctx.stroke();   // ink pass, then colour: no seam
    shaft(); ctx.strokeStyle = col; ctx.lineWidth = T; ctx.stroke(); head(); ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = r * 0.07; ctx.beginPath(); ctx.arc(cx, cy, R + T * 0.18, -Math.PI * 0.5, -Math.PI * 0.12); ctx.stroke();
    const k = r * 0.25, kx = cx - r * 0.02, ky = cy + r * 0.03;
    ctx.beginPath(); ctx.roundRect(kx - k, ky - k, k * 2, k * 2, k * 0.35); fillStroke(ctx, linear(ctx, 0, ky - k, 0, ky + k, [[0, '#ffffff'], [1, '#d7d3f5']]), INK, w * 0.8);
    ctx.strokeStyle = '#2d2470'; ctx.lineWidth = Math.max(1, r * 0.08); ctx.lineJoin = 'miter';
    ctx.beginPath(); ctx.moveTo(kx - k * 0.45, ky - k * 0.45); ctx.lineTo(kx + k * 0.45, ky - k * 0.45); ctx.lineTo(kx - k * 0.45, ky + k * 0.45); ctx.lineTo(kx + k * 0.45, ky + k * 0.45); ctx.stroke();
  },
  // Pull Request: a horseshoe magnet, pulling
  pull(ctx, r, t) {
    ctx.save(); ctx.rotate(-0.6);
    ctx.lineCap = 'butt';
    for (const [w, c] of [[r * 0.52, INK], [r * 0.38, '#26c6da']]) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(-r * 0.42, r * 0.7); ctx.lineTo(-r * 0.42, 0); ctx.arc(0, 0, r * 0.42, Math.PI, 0); ctx.lineTo(r * 0.42, r * 0.7); ctx.stroke(); }
    for (const s of [-1, 1]) { ctx.fillStyle = '#e9eef2'; ctx.fillRect(s * r * 0.42 - r * 0.19, r * 0.42, r * 0.38, r * 0.3); ctx.strokeStyle = INK; ctx.lineWidth = lw(r) * 0.8; ctx.strokeRect(s * r * 0.42 - r * 0.19, r * 0.42, r * 0.38, r * 0.3); }
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = r * 0.08; ctx.beginPath(); ctx.arc(0, 0, r * 0.42, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#26c6da'; ctx.lineWidth = r * 0.09; ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) { const f = (t * 1.5 + k / 3) % 1, d = r * (0.95 - f * 0.25); ctx.globalAlpha = f; ctx.beginPath(); ctx.arc(r * 0.35, r * 0.5, d * 0.35, -0.2, 1.4); ctx.stroke(); }
    ctx.globalAlpha = 1;
  },
  // Ghost: a sheet ghost with a wavy hem
  ghost(ctx, r, t) {
    const b = Math.sin(t * 4) * r * 0.05;
    ctx.beginPath(); ctx.moveTo(-r * 0.7, r * 0.8 + b); ctx.lineTo(-r * 0.7, -r * 0.1); ctx.arc(0, -r * 0.1, r * 0.7, Math.PI, 0); ctx.lineTo(r * 0.7, r * 0.8 + b);
    for (let k = 0; k < 4; k++) { const x0 = r * 0.7 - k * r * 0.35; ctx.quadraticCurveTo(x0 - r * 0.09, r * (k % 2 ? 0.6 : 1) + b, x0 - r * 0.35, r * 0.8 + b); }
    ctx.closePath(); fillStroke(ctx, radial(ctx, -r * 0.3, -r * 0.4, r * 0.05, 0, 0, r, [[0, '#ffffff'], [0.7, '#ece6fb'], [1, '#b9a6ec']]), '#4b3a8a', lw(r));
    for (const s of [-1, 1]) { ell(ctx, s * r * 0.25, -r * 0.12, r * 0.12, r * 0.18); ctx.fillStyle = '#2c2148'; ctx.fill(); circ(ctx, s * r * 0.25 - r * 0.04, -r * 0.18, r * 0.04); ctx.fillStyle = '#fff'; ctx.fill(); }
    ell(ctx, 0, r * 0.18, r * 0.12, r * 0.08); ctx.fillStyle = '#2c2148'; ctx.fill();
    for (const s of [-1, 1]) { ell(ctx, s * r * 0.45, r * 0.08, r * 0.1, r * 0.05); ctx.fillStyle = 'rgba(255,140,180,0.6)'; ctx.fill(); }
  },
  // Thread: a wooden spool wound with ghost-blue thread, its loose end curling off into a little copy of itself
  thread(ctx, r, t) {
    const cap = (y) => { ell(ctx, 0, y, r * 0.62, r * 0.2); fillStroke(ctx, linear(ctx, -r * 0.62, 0, r * 0.62, 0, [[0, '#a8743d'], [0.45, '#e8b97a'], [1, '#8a5a2b']]), INK, lw(r)); };
    ctx.save(); ctx.rotate(-0.25);
    cap(r * 0.62);
    ctx.beginPath(); ctx.roundRect(-r * 0.46, -r * 0.6, r * 0.92, r * 1.2, r * 0.08);
    fillStroke(ctx, linear(ctx, -r * 0.46, 0, r * 0.46, 0, [[0, '#2f62c9'], [0.4, '#8fbaff'], [0.6, '#6fa8ff'], [1, '#2a55b0']]), INK, lw(r));
    ctx.strokeStyle = 'rgba(20,40,110,0.45)'; ctx.lineWidth = Math.max(0.6, r * 0.05);
    for (let k = 0; k < 6; k++) { const y = -r * 0.5 + k * r * 0.2; ctx.beginPath(); ctx.moveTo(-r * 0.46, y + r * 0.06); ctx.lineTo(r * 0.46, y - r * 0.04); ctx.stroke(); }
    cap(-r * 0.62);
    ell(ctx, 0, -r * 0.62, r * 0.14, r * 0.05); ctx.fillStyle = '#5a3a1a'; ctx.fill();
    shine(ctx, -r * 0.22, -r * 0.1, r * 0.08, r * 0.3, 0, 0.6);
    ctx.restore();
    // the loose end, wavering
    const w = Math.sin(t * 3) * r * 0.06;
    ctx.strokeStyle = '#1b2f66'; ctx.lineWidth = Math.max(1, r * 0.13); ctx.beginPath(); ctx.moveTo(r * 0.42, r * 0.05); ctx.bezierCurveTo(r * 0.9, r * 0.1 + w, r * 0.62, r * 0.62 - w, r * 0.95, r * 0.8); ctx.stroke();
    ctx.strokeStyle = '#9fc8ff'; ctx.lineWidth = Math.max(0.6, r * 0.07); ctx.stroke();
  },
  // Fast-Forward: a glossy ⏩ button
  ff(ctx, r, t) {
    ctx.beginPath(); ctx.roundRect(-r * 0.92, -r * 0.62, r * 1.84, r * 1.24, r * 0.4); fillStroke(ctx, linear(ctx, 0, -r * 0.6, 0, r * 0.6, [[0, '#5ee7ff'], [1, '#0090ad']]), INK, lw(r));
    const o = ((t * 2) % 1) * r * 0.08;
    for (const x of [-r * 0.45, r * 0.05]) { poly(ctx, [[x + o, -r * 0.36], [x + r * 0.45 + o, 0], [x + o, r * 0.36]]); ctx.lineJoin = 'round'; fillStroke(ctx, '#ffffff', '#00586b', lw(r) * 0.7); }
    shine(ctx, -r * 0.4, -r * 0.4, r * 0.35, r * 0.08, 0, 0.5);
  },
  // Segfault: a bomb with a lit fuse
  tomato(ctx, r, t) { bomb(ctx, -r * 0.12, r * 0.14, r * 0.72, t); },
  // Fork Bomb: three bombs on one branching fuse
  fork(ctx, r, t) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [c, k] of [[INK, 2.2], ['#d8b98a', 1]]) { ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, r * 0.1) * k; ctx.beginPath(); ctx.moveTo(0, -r * 0.9); ctx.lineTo(0, -r * 0.55); ctx.lineTo(-r * 0.5, -r * 0.1); ctx.moveTo(0, -r * 0.55); ctx.lineTo(r * 0.5, -r * 0.1); ctx.stroke(); }
    for (const [x, y] of [[-r * 0.52, r * 0.35], [r * 0.52, r * 0.35], [0, r * 0.05]]) bomb(ctx, x, y, r * 0.38, t, false);
    const f = 0.75 + 0.35 * Math.sin(t * 30); star(ctx, 0, -r * 0.92, r * 0.32 * f, 6, 0.4, t * 5); ctx.fillStyle = '#ffb12e'; ctx.fill(); star(ctx, 0, -r * 0.92, r * 0.15 * f, 6, 0.45, t * 5); ctx.fillStyle = '#fff6c2'; ctx.fill();
  },
  // Memory Leak: a RAM stick oozing lime goo out of its pins, a drop falling
  leak(ctx, r, t) {
    const w = lw(r);
    ctx.save(); ctx.translate(0, -r * 0.24); ctx.rotate(-0.18);
    ctx.beginPath(); ctx.roundRect(-r * 0.92, -r * 0.4, r * 1.84, r * 0.66, r * 0.07); fillStroke(ctx, linear(ctx, 0, -r * 0.4, 0, r * 0.26, [[0, '#45c47a'], [1, '#17663a']]), INK, w);
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.roundRect(-r * 0.78 + k * r * 0.41, -r * 0.28, r * 0.32, r * 0.3, r * 0.04); ctx.fillStyle = '#1a1b22'; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(-r * 0.74 + k * r * 0.41, -r * 0.25, r * 0.24, r * 0.05); }
    ctx.fillStyle = '#e8bf4f'; for (let k = 0; k < 9; k++) ctx.fillRect(-r * 0.82 + k * r * 0.18, r * 0.1, r * 0.1, r * 0.13);
    // the goo: a band out of the pins with three drips of different lengths
    const b = r * 0.3, drips = [[r * 0.42, r * 0.16, r * 0.07], [r * 0.04, r * 0.44, r * 0.1], [-r * 0.36, r * 0.27, r * 0.08]];
    ctx.beginPath(); ctx.moveTo(-r * 0.62, r * 0.14); ctx.quadraticCurveTo(0, r * 0.06, r * 0.62, r * 0.14); ctx.quadraticCurveTo(r * 0.66, b, r * 0.54, b);
    for (const [x, len, hw] of drips) { ctx.lineTo(x + hw, b); ctx.bezierCurveTo(x + hw, b + len * 0.55, x + hw * 1.7, b + len, x, b + len); ctx.bezierCurveTo(x - hw * 1.7, b + len, x - hw, b + len * 0.55, x - hw, b); }
    ctx.lineTo(-r * 0.54, b); ctx.quadraticCurveTo(-r * 0.66, b, -r * 0.62, r * 0.14); ctx.closePath();
    fillStroke(ctx, linear(ctx, 0, r * 0.1, 0, r * 0.75, [[0, '#d6f77e'], [0.45, '#8bd448'], [1, '#4f9a1f']]), '#2f5a12', w);
    for (const [x, len] of drips) shine(ctx, x - r * 0.025, b + len * 0.72, r * 0.03, r * 0.05, 0, 0.8);
    shine(ctx, -r * 0.3, r * 0.17, r * 0.18, r * 0.035, 0, 0.6);
    const d = (t * 0.9) % 1, dy = b + r * 0.5 + d * r * 0.32;   // a drop falling off the long drip
    ctx.globalAlpha = 1 - d * 0.7; ctx.beginPath(); ctx.moveTo(r * 0.04, dy - r * 0.11); ctx.quadraticCurveTo(r * 0.12, dy + r * 0.02, r * 0.04, dy + r * 0.05); ctx.quadraticCurveTo(-r * 0.04, dy + r * 0.02, r * 0.04, dy - r * 0.11);
    fillStroke(ctx, '#8bd448', '#2f5a12', w * 0.7); ctx.globalAlpha = 1;
    ctx.restore();
  },
  // Infinite Loop: a neon loop-the-loop on a dark disc, the road running in, round and out, a light chasing round it
  loop(ctx, r, t) {
    circ(ctx, 0, 0, r * 0.92); fillStroke(ctx, radial(ctx, -r * 0.3, -r * 0.35, r * 0.05, 0, 0, r, [[0, '#24493d'], [1, '#08130f']]), INK, lw(r));
    const rr = r * 0.42, cy = r * 0.5 - rr;
    const track = () => { ctx.beginPath(); ctx.moveTo(-r * 0.78, r * 0.5); ctx.lineTo(0, r * 0.5); ctx.arc(0, cy, rr, Math.PI / 2, Math.PI / 2 - TAU + 0.35, true); ctx.quadraticCurveTo(r * 0.3, r * 0.62, r * 0.78, r * 0.62); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (isFlat()) { ctx.strokeStyle = '#3ccf8a'; ctx.lineWidth = r * 0.2; track(); ctx.stroke(); return; }   // a flat look: a flat green track, no neon
    for (const [w, c] of [[r * 0.3, '#0d5c3a'], [r * 0.18, '#36f59a'], [r * 0.06, '#e6fff2']]) { ctx.strokeStyle = c; ctx.lineWidth = w; track(); ctx.stroke(); }
    const a = Math.PI / 2 - ((t * 1.2) % 1) * TAU, x = Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    ctx.fillStyle = 'rgba(54,245,154,0.4)'; circ(ctx, x, y, r * 0.2); ctx.fill(); ctx.fillStyle = '#ffffff'; circ(ctx, x, y, r * 0.09); ctx.fill();
  },
  // Bubble: a shimmering soap bubble
  bubble(ctx, r, t) {
    circ(ctx, 0, 0, r * 0.88);
    if (isFlat()) { fillStroke(ctx, '#c9b6ff', INK, lw(r)); ell(ctx, -r * 0.4, -r * 0.42, r * 0.16, r * 0.1, -0.7); ctx.fillStyle = '#ffffff'; ctx.fill(); return; }   // a flat look: flat lilac, a thin rim, one round glint
    ctx.fillStyle = radial(ctx, -r * 0.3, -r * 0.35, r * 0.05, 0, 0, r * 0.9, [[0, 'rgba(255,255,255,0.9)'], [0.35, 'rgba(240,200,255,0.5)'], [0.8, 'rgba(170,130,255,0.62)'], [1, 'rgba(110,220,255,0.9)']]); ctx.fill();
    ctx.strokeStyle = '#7b4bd6'; ctx.lineWidth = lw(r); ctx.stroke();
    ctx.strokeStyle = `hsla(${(t * 90) % 360},90%,70%,0.8)`; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0.2 + t, 1.4 + t); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = r * 0.13; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, r * 0.62, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
    circ(ctx, r * 0.38, r * 0.4, r * 0.08); ctx.fillStyle = '#ffffff'; ctx.fill();
  },
  // Kernel Panic: a red warning sign with a lightning bolt
  panic(ctx, r, t) {
    const j = Math.sin(t * 40) * r * 0.03;
    ctx.save(); ctx.translate(j, 0);
    poly(ctx, [[0, -r * 0.88], [r * 0.95, r * 0.72], [-r * 0.95, r * 0.72]]); ctx.lineJoin = 'round';
    ctx.lineWidth = r * 0.28; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = r * 0.16; ctx.strokeStyle = '#ff2d4b'; ctx.stroke();
    ctx.fillStyle = linear(ctx, 0, -r, 0, r, [[0, '#ff6b7f'], [1, '#d10f2c']]); ctx.fill();
    poly(ctx, [[r * 0.08, -r * 0.42], [-r * 0.28, r * 0.12], [-r * 0.02, r * 0.12], [-r * 0.12, r * 0.55], [r * 0.28, -r * 0.02], [r * 0.02, -r * 0.02]]);
    fillStroke(ctx, '#ffe14d', INK, lw(r) * 0.8);
    ctx.restore();
  },
};

// ---------------------------------------------------------------- the event feed's icons (render.js drawFeed)
// Hazard pictograms in `ink` (cut-outs in `bg`) in a circle of radius r, for round signs: yellow warns of what's ahead,
// red is what just got you.
const PICTO = {
  // a locomotive, head on
  train(ctx, r, ink, bg) {
    ctx.fillStyle = ink; ctx.beginPath(); ctx.roundRect(-r * 0.55, -r * 0.78, r * 1.1, r * 1.3, r * 0.28); ctx.fill();
    ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(-r * 0.38, -r * 0.6, r * 0.76, r * 0.42, r * 0.1); ctx.fill();
    circ(ctx, -r * 0.27, r * 0.18, r * 0.11); ctx.fill(); circ(ctx, r * 0.27, r * 0.18, r * 0.11); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.14; ctx.beginPath(); ctx.moveTo(-r * 0.3, r * 0.55); ctx.lineTo(-r * 0.62, r * 0.88); ctx.moveTo(r * 0.3, r * 0.55); ctx.lineTo(r * 0.62, r * 0.88); ctx.stroke();
  },
  // a press head slamming down onto the floor
  press(ctx, r, ink) {
    ctx.fillStyle = ink; ctx.fillRect(-r * 0.12, -r * 0.92, r * 0.24, r * 0.4);
    ctx.beginPath(); ctx.roundRect(-r * 0.68, -r * 0.55, r * 1.36, r * 0.42, r * 0.08); ctx.fill();
    ctx.fillRect(-r * 0.85, r * 0.62, r * 1.7, r * 0.16);
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.13;
    for (const x of [-0.42, 0, 0.42]) { ctx.beginPath(); ctx.moveTo(x * r, -r * 0.02); ctx.lineTo(x * r, r * 0.42); ctx.stroke(); }
  },
  // a volcano throwing lava
  lava(ctx, r, ink) {
    poly(ctx, [[-r * 0.9, r * 0.78], [-r * 0.26, -r * 0.18], [r * 0.26, -r * 0.18], [r * 0.9, r * 0.78]]); ctx.fillStyle = ink; ctx.fill();
    ctx.fillStyle = '#ff6d00';
    poly(ctx, [[-r * 0.26, -r * 0.18], [-r * 0.12, r * 0.1], [0, -r * 0.05], [r * 0.12, r * 0.14], [r * 0.26, -r * 0.18]]); ctx.fill();
    for (const [x, y, s] of [[0, -0.5, 0.17], [-0.42, -0.72, 0.12], [0.4, -0.78, 0.13]]) { circ(ctx, x * r, y * r, s * r); ctx.fill(); }
  },
  // a breaking wave
  wave(ctx, r, ink) {
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.24;
    ctx.beginPath(); ctx.moveTo(-r * 0.85, r * 0.45); ctx.bezierCurveTo(-r * 0.6, -r * 0.1, -r * 0.1, -r * 0.75, r * 0.38, -r * 0.55); ctx.quadraticCurveTo(r * 0.75, -r * 0.35, r * 0.48, -r * 0.05); ctx.stroke();
    ctx.lineWidth = r * 0.16; ctx.beginPath(); ctx.moveTo(-r * 0.85, r * 0.75); ctx.quadraticCurveTo(-r * 0.45, r * 0.55, 0, r * 0.75); ctx.quadraticCurveTo(r * 0.45, r * 0.95, r * 0.85, r * 0.72); ctx.stroke();
  },
  // a Garbage Collector: a wheelie bin
  gc(ctx, r, ink, bg) {
    ctx.fillStyle = ink; poly(ctx, [[-r * 0.55, -r * 0.45], [r * 0.55, -r * 0.45], [r * 0.42, r * 0.78], [-r * 0.42, r * 0.78]]); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-r * 0.7, -r * 0.72, r * 1.4, r * 0.2, r * 0.06); ctx.fill(); ctx.fillRect(-r * 0.15, -r * 0.88, r * 0.3, r * 0.18);
    ctx.strokeStyle = bg; ctx.lineWidth = r * 0.1; for (const x of [-0.2, 0.2]) { ctx.beginPath(); ctx.moveTo(x * r, -r * 0.28); ctx.lineTo(x * r * 0.85, r * 0.6); ctx.stroke(); }
  },
  // into a gap: two ledges and a drop
  fall(ctx, r, ink) {
    ctx.fillStyle = ink; ctx.fillRect(-r * 0.9, -r * 0.3, r * 0.5, r * 0.22); ctx.fillRect(r * 0.4, -r * 0.3, r * 0.5, r * 0.22);
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.18; ctx.beginPath(); ctx.moveTo(0, -r * 0.75); ctx.lineTo(0, r * 0.5); ctx.stroke();
    poly(ctx, [[-r * 0.3, r * 0.35], [r * 0.3, r * 0.35], [0, r * 0.82]]); ctx.fill();
  },
  // the cliff jump: a high ledge on the left, a low one on the right, and the arc of the flight between them
  cliff(ctx, r, ink) {
    ctx.fillStyle = ink; poly(ctx, [[-r * 0.92, -r * 0.2], [-r * 0.32, -r * 0.2], [-r * 0.32, r * 0.85], [-r * 0.92, r * 0.85]]); ctx.fill();
    ctx.fillRect(r * 0.32, r * 0.5, r * 0.6, r * 0.35);
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.14; ctx.setLineDash([r * 0.2, r * 0.16]); ctx.beginPath(); ctx.moveTo(-r * 0.36, -r * 0.32); ctx.quadraticCurveTo(r * 0.25, -r * 0.95, r * 0.62, r * 0.34); ctx.stroke(); ctx.setLineDash([]);
  },
  // into the water: a big drop over a ripple
  splash(ctx, r, ink) {
    ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(0, -r * 0.85); ctx.bezierCurveTo(r * 0.2, -r * 0.45, r * 0.45, -r * 0.2, r * 0.45, r * 0.08); ctx.arc(0, r * 0.08, r * 0.45, 0, Math.PI); ctx.bezierCurveTo(-r * 0.45, -r * 0.2, -r * 0.2, -r * 0.45, 0, -r * 0.85); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.14; ctx.beginPath(); ctx.moveTo(-r * 0.85, r * 0.75); ctx.quadraticCurveTo(-r * 0.42, r * 0.55, 0, r * 0.75); ctx.quadraticCurveTo(r * 0.42, r * 0.95, r * 0.85, r * 0.75); ctx.stroke();
  },
  // a wormhole: a spiral
  // a tree (Gradient Descent's glades, race-ski.js): a pine, three tiers on a trunk
  tree(ctx, r, ink) {
    ctx.fillStyle = ink; ctx.fillRect(-r * 0.1, r * 0.5, r * 0.2, r * 0.38);
    for (const [y, w] of [[-0.92, 0.36], [-0.5, 0.58], [-0.05, 0.8]]) poly(ctx, [[0, y * r], [w * r, (y + 0.62) * r], [-w * r, (y + 0.62) * r]]), ctx.fill();
  },
  // a fire (the Tinder Grove's thicket): a flame over two crossed logs
  fire(ctx, r, ink) {
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-r * 0.75, r * 0.75); ctx.lineTo(r * 0.75, r * 0.45); ctx.moveTo(r * 0.75, r * 0.75); ctx.lineTo(-r * 0.75, r * 0.45); ctx.stroke();
    ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(0, -r * 0.9); ctx.bezierCurveTo(r * 0.25, -r * 0.5, r * 0.62, -r * 0.3, r * 0.5, r * 0.12); ctx.quadraticCurveTo(r * 0.38, r * 0.48, 0, r * 0.48); ctx.quadraticCurveTo(-r * 0.42, r * 0.48, -r * 0.5, r * 0.1); ctx.bezierCurveTo(-r * 0.56, -r * 0.2, -r * 0.3, -r * 0.3, -r * 0.18, -r * 0.62); ctx.quadraticCurveTo(-r * 0.05, -r * 0.35, 0, -r * 0.9); ctx.fill();
    ctx.fillStyle = '#ff6d00'; ctx.beginPath(); ctx.moveTo(0, -r * 0.3); ctx.quadraticCurveTo(r * 0.28, 0, r * 0.18, r * 0.22); ctx.quadraticCurveTo(0, r * 0.36, -r * 0.18, r * 0.22); ctx.quadraticCurveTo(-r * 0.24, 0, 0, -r * 0.3); ctx.fill();
  },
  // a logic gate: an AND gate's D, two inputs and an output
  gate(ctx, r, ink) {
    ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.5); ctx.lineTo(r * 0.05, -r * 0.5); ctx.arc(r * 0.05, 0, r * 0.5, -Math.PI / 2, Math.PI / 2); ctx.lineTo(-r * 0.5, r * 0.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.14; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-r * 0.88, -r * 0.24); ctx.lineTo(-r * 0.5, -r * 0.24); ctx.moveTo(-r * 0.88, r * 0.24); ctx.lineTo(-r * 0.5, r * 0.24); ctx.moveTo(r * 0.55, 0); ctx.lineTo(r * 0.9, 0); ctx.stroke();
  },
  worm(ctx, r, ink) {
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.17; ctx.beginPath();
    for (let k = 0; k <= 40; k++) { const f = k / 40, a = f * Math.PI * 3.6, d = r * (0.1 + 0.72 * f); k ? ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d) : ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d); }
    ctx.stroke();
  },
  // low gravity: a ringed planet
  lowg(ctx, r, ink, bg) {
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.13; ell(ctx, 0, 0, r * 0.9, r * 0.3, -0.4); ctx.stroke();
    circ(ctx, 0, 0, r * 0.48); fillStroke(ctx, ink, bg, r * 0.12);
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.9, r * 0.3, -0.4, 0.1, Math.PI - 0.1); ctx.strokeStyle = bg; ctx.lineWidth = r * 0.28; ctx.stroke(); ctx.strokeStyle = ink; ctx.lineWidth = r * 0.13; ctx.stroke();
  },
  // slag rising: molten metal and an up arrow
  slag(ctx, r, ink) {
    ctx.fillStyle = '#ff6d00'; ctx.beginPath(); ctx.moveTo(-r * 0.88, r * 0.85); ctx.lineTo(-r * 0.88, r * 0.3); ctx.quadraticCurveTo(-r * 0.45, r * 0.08, 0, r * 0.3); ctx.quadraticCurveTo(r * 0.45, r * 0.52, r * 0.88, r * 0.3); ctx.lineTo(r * 0.88, r * 0.85); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.18; ctx.beginPath(); ctx.moveTo(0, r * 0.05); ctx.lineTo(0, -r * 0.55); ctx.stroke();
    ctx.fillStyle = ink; poly(ctx, [[-r * 0.32, -r * 0.42], [r * 0.32, -r * 0.42], [0, -r * 0.88]]); ctx.fill();
  },
  // banking: a kart riding up a tilted road
  bank(ctx, r, ink, bg) {
    ctx.fillStyle = ink; poly(ctx, [[-r * 0.9, r * 0.72], [r * 0.9, r * 0.72], [r * 0.9, -r * 0.35]]); ctx.fill();
    ctx.save(); ctx.translate(r * 0.22, -r * 0.02); ctx.rotate(-Math.atan2(1.07, 1.8)); ctx.fillStyle = ink; ctx.beginPath(); ctx.roundRect(-r * 0.32, -r * 0.42, r * 0.64, r * 0.3, r * 0.1); ctx.fill();
    ctx.fillStyle = bg; circ(ctx, -r * 0.18, -r * 0.08, r * 0.09); ctx.fill(); circ(ctx, r * 0.18, -r * 0.08, r * 0.09); ctx.fill(); ctx.restore();
  },
  // a hurricane: the weather map's symbol, an eye with two curling arms (turning anticlockwise)
  storm(ctx, r, ink, bg) {
    ctx.fillStyle = ink;
    for (const k of [0, 1]) {
      ctx.save(); ctx.rotate(k * Math.PI); ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.02);
      ctx.quadraticCurveTo(-r * 0.32, -r * 0.92, r * 0.7, -r * 0.82); ctx.quadraticCurveTo(r * 0.08, -r * 0.62, r * 0.24, -r * 0.16); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    circ(ctx, 0, 0, r * 0.36); ctx.fill(); circ(ctx, 0, 0, r * 0.14); ctx.fillStyle = bg; ctx.fill();
  },
  // a boulder rolling: a round rock with speed lines behind it
  boulder(ctx, r, ink, bg) {
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.13;
    for (const [y, x0, x1] of [[-0.3, -0.92, -0.55], [0.05, -0.98, -0.6], [0.4, -0.9, -0.55]]) { ctx.beginPath(); ctx.moveTo(x0 * r, y * r); ctx.lineTo(x1 * r, y * r); ctx.stroke(); }
    poly(ctx, [0.66, 0.58, 0.7, 0.6, 0.68, 0.55, 0.66, 0.62, 0.7].map((d, k) => { const a = k / 9 * TAU + 0.3; return [r * 0.18 + Math.cos(a) * d * r, r * 0.05 + Math.sin(a) * d * r]; })); ctx.fillStyle = ink; ctx.fill();   // a lumpy rock
    ctx.strokeStyle = bg; ctx.lineWidth = r * 0.08; ctx.beginPath(); ctx.moveTo(-r * 0.05, -r * 0.35); ctx.lineTo(r * 0.12, -r * 0.05); ctx.lineTo(r * 0.02, r * 0.3); ctx.moveTo(r * 0.12, -r * 0.05); ctx.lineTo(r * 0.5, r * 0.02); ctx.stroke();   // cracks
  },
  // the clocktower's minute hand: a clock face, its hands at ten past two
  clock(ctx, r, ink, bg) {
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.13; circ(ctx, 0, 0, r * 0.78); ctx.stroke();
    for (let k = 0; k < 12; k += 3) { const a = k / 12 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.56, Math.sin(a) * r * 0.56); ctx.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); ctx.stroke(); }
    ctx.lineCap = 'round'; ctx.lineWidth = r * 0.12; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.3, -r * 0.24); ctx.stroke();
    ctx.lineWidth = r * 0.09; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.5, r * 0.12); ctx.stroke(); circ(ctx, 0, 0, r * 0.1); ctx.fillStyle = ink; ctx.fill();
  },
  // the clocktower's pendulum: a rod from a pivot and a heavy bob, swung out, with motion lines
  pendulum(ctx, r, ink, bg) {
    ctx.strokeStyle = ink; ctx.lineCap = 'round'; ctx.lineWidth = r * 0.12; ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.72); ctx.lineTo(r * 0.5, -r * 0.72); ctx.stroke();
    ctx.lineWidth = r * 0.09; ctx.beginPath(); ctx.moveTo(0, -r * 0.72); ctx.lineTo(r * 0.3, r * 0.25); ctx.stroke(); circ(ctx, r * 0.36, r * 0.42, r * 0.28); ctx.fillStyle = ink; ctx.fill();
    ctx.lineWidth = r * 0.07; for (const k of [0, 1]) { ctx.beginPath(); ctx.arc(0, -r * 0.72, r * (0.95 + k * 0.2), Math.PI * 0.62, Math.PI * 0.82); ctx.stroke(); }
  },
  // the giant crab: a round body, two raised claws (open pincers), legs out the sides
  crab(ctx, r, ink, bg) {
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.11;
    for (const sx of [-1, 1]) for (const k of [0, 1, 2]) { const y = r * (0.12 + k * 0.2); ctx.beginPath(); ctx.moveTo(sx * r * 0.4, y); ctx.lineTo(sx * r * 0.82, y + r * 0.16); ctx.stroke(); }
    ctx.lineWidth = r * 0.13; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * r * 0.3, -r * 0.05); ctx.lineTo(sx * r * 0.5, -r * 0.42); ctx.stroke(); }
    ctx.fillStyle = ink; ell(ctx, 0, r * 0.22, r * 0.5, r * 0.34); ctx.fill();
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.arc(sx * r * 0.55, -r * 0.58, r * 0.27, 0, TAU); ctx.fill();
      ctx.fillStyle = bg; poly(ctx, [[sx * r * 0.55, -r * 0.6], [sx * r * 0.42, -r * 0.92], [sx * r * 0.68, -r * 0.92]]); ctx.fill(); ctx.fillStyle = ink;   // the pincer's gap
    }
    ctx.fillStyle = bg; for (const sx of [-1, 1]) { circ(ctx, sx * r * 0.17, r * 0.08, r * 0.08); ctx.fill(); }
  },
  // a drawbridge lifting: the leaf tilted up off its bank over the water, a post with a chain to its tip
  drawbridge(ctx, r, ink, bg) {
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.12;
    for (const y of [0.55, 0.82]) { ctx.beginPath(); ctx.moveTo(-r * 0.2, y * r); for (let k = 0; k < 4; k++) ctx.quadraticCurveTo(-r * 0.05 + k * r * 0.28, (y - 0.12) * r, r * 0.09 + k * r * 0.28, y * r); ctx.stroke(); }
    ctx.fillStyle = ink; ctx.fillRect(-r * 0.95, r * 0.28, r * 0.62, r * 0.62);            // the near bank
    poly(ctx, [[-r * 0.4, r * 0.3], [r * 0.62, -r * 0.42], [r * 0.74, -r * 0.24], [-r * 0.33, r * 0.47]]); ctx.fill();   // the leaf
    ctx.fillRect(-r * 0.62, -r * 0.88, r * 0.16, r * 1.2);                                // the post
    ctx.lineWidth = r * 0.07; ctx.beginPath(); ctx.moveTo(-r * 0.54, -r * 0.82); ctx.lineTo(r * 0.66, -r * 0.36); ctx.stroke();   // its chain
  },
  // a jet from above: fuselage, swept wings, tailplane
  jet(ctx, r, ink) {
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.13, r * 0.92, 0, 0, TAU); ctx.fill();
    poly(ctx, [[-r * 0.1, -r * 0.18], [-r * 0.92, r * 0.22], [-r * 0.92, r * 0.36], [-r * 0.1, r * 0.12], [r * 0.1, r * 0.12], [r * 0.92, r * 0.36], [r * 0.92, r * 0.22], [r * 0.1, -r * 0.18]]); ctx.fill();
    poly(ctx, [[-r * 0.06, r * 0.62], [-r * 0.38, r * 0.86], [r * 0.38, r * 0.86], [r * 0.06, r * 0.62]]); ctx.fill();
  },
  // a rocket going up: its body with a porthole, fins, and a flame under it (the launch pad, race-rocket.js)
  rocket(ctx, r, ink, bg) {
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.moveTo(0, -r * 0.95); ctx.bezierCurveTo(r * 0.36, -r * 0.6, r * 0.32, r * 0.1, r * 0.24, r * 0.42); ctx.lineTo(-r * 0.24, r * 0.42); ctx.bezierCurveTo(-r * 0.32, r * 0.1, -r * 0.36, -r * 0.6, 0, -r * 0.95); ctx.fill();
    poly(ctx, [[-r * 0.22, r * 0.05], [-r * 0.52, r * 0.5], [-r * 0.22, r * 0.4]]); ctx.fill(); poly(ctx, [[r * 0.22, r * 0.05], [r * 0.52, r * 0.5], [r * 0.22, r * 0.4]]); ctx.fill();
    poly(ctx, [[-r * 0.14, r * 0.5], [0, r * 0.95], [r * 0.14, r * 0.5]]); ctx.fill();
    ctx.fillStyle = bg; circ(ctx, 0, -r * 0.32, r * 0.12); ctx.fill();
  },
  // a fork in the road
  fork(ctx, r, ink) {
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.26; ctx.beginPath(); ctx.moveTo(0, r * 0.85); ctx.lineTo(0, r * 0.1); ctx.lineTo(-r * 0.55, -r * 0.62); ctx.moveTo(0, r * 0.1); ctx.lineTo(r * 0.55, -r * 0.62); ctx.stroke();
  },
  // a new route this lap: a winding road with an arrow on
  route(ctx, r, ink) {
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.2; ctx.beginPath(); ctx.moveTo(-r * 0.45, r * 0.88); ctx.bezierCurveTo(-r * 0.6, r * 0.2, r * 0.55, r * 0.25, r * 0.35, -r * 0.4); ctx.stroke();
    ctx.fillStyle = ink; poly(ctx, [[r * 0.05, -r * 0.35], [r * 0.62, -r * 0.42], [r * 0.4, -r * 0.92]]); ctx.fill();
  },
  // a secret out there this lap (race-secret.js): a little sun, rays round a disc
  sun(ctx, r, ink, bg) {
    ctx.fillStyle = ink; star(ctx, 0, 0, r * 0.95, 8, 0.6, -Math.PI / 2); ctx.fill();
    circ(ctx, 0, 0, r * 0.42); ctx.fillStyle = bg; ctx.fill(); circ(ctx, 0, 0, r * 0.26); ctx.fillStyle = ink; ctx.fill();
  },
  // rain coming (race-rain.js): a cloud with drops falling slantwise out of it
  rain(ctx, r, ink) {
    ctx.fillStyle = ink; ctx.beginPath();
    ctx.arc(-r * 0.38, -r * 0.18, r * 0.3, Math.PI * 0.5, Math.PI * 1.5); ctx.arc(-r * 0.05, -r * 0.42, r * 0.38, Math.PI, Math.PI * 1.95); ctx.arc(r * 0.42, -r * 0.16, r * 0.32, Math.PI * 1.4, Math.PI * 0.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.15;
    for (const [x, y] of [[-0.45, 0.4], [-0.05, 0.5], [0.35, 0.4], [-0.25, 0.85], [0.15, 0.9]]) { ctx.beginPath(); ctx.moveTo(x * r + r * 0.08, y * r - r * 0.16); ctx.lineTo(x * r - r * 0.04, y * r + r * 0.06); ctx.stroke(); }
  },
  // aquaplaning in a puddle: a kart from behind, skating on wavy water, spray out to each side
  puddle(ctx, r, ink, bg) {
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.12;
    for (const y of [0.52, 0.8]) { ctx.beginPath(); ctx.moveTo(-r * 0.85, y * r); for (let k = 0; k < 4; k++) ctx.quadraticCurveTo(-r * 0.64 + k * r * 0.42, (y - 0.13) * r, -r * 0.43 + k * r * 0.42, y * r); ctx.stroke(); }
    ctx.fillStyle = ink; ctx.beginPath(); ctx.roundRect(-r * 0.46, -r * 0.42, r * 0.92, r * 0.58, r * 0.16); ctx.fill();
    ctx.fillRect(-r * 0.56, r * 0.02, r * 0.22, r * 0.26); ctx.fillRect(r * 0.34, r * 0.02, r * 0.22, r * 0.26);
    ctx.fillStyle = bg; ctx.fillRect(-r * 0.3, -r * 0.3, r * 0.6, r * 0.18);
    for (const sx of [-1, 1]) for (const [dx, dy, rr] of [[0.72, -0.18, 0.09], [0.88, -0.42, 0.07], [0.66, -0.55, 0.06]]) { circ(ctx, sx * dx * r, dy * r, rr * r); ctx.fillStyle = ink; ctx.fill(); }
  },
  // wind: streamlines blowing toward +x (the sign turns them for the wind's direction)
  wind(ctx, r, ink) {
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.15;
    for (const [y, x0, x1] of [[-0.42, -0.75, 0.3], [0, -0.85, 0.5], [0.42, -0.6, 0.25]]) { ctx.beginPath(); ctx.moveTo(x0 * r, y * r); ctx.lineTo(x1 * r, y * r); ctx.stroke(); }
    ctx.fillStyle = ink; poly(ctx, [[r * 0.45, -r * 0.28], [r * 0.45, r * 0.28], [r * 0.92, 0]]); ctx.fill();
  },
};
// wind signs: tailwind points up, headwind down, crosswind across
const WIND_ROT = { tail: -Math.PI / 2, head: Math.PI / 2, cross: 0 };
// a round sign: yellow warns, red is what got you. A wormhole warning gets a light: green open, red shut (open: n).
export function drawHazardSign(ctx, key, r, warn, n = 0) {
  const fl = bold(), was = fl && setFlat(true);
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const base = warn ? '#ffd23f' : '#ff5a3c', ink = warn ? INK : '#ffffff';
  circ(ctx, 0, 0, r * 0.95); fillStroke(ctx, radial(ctx, -r * 0.3, -r * 0.35, r * 0.1, 0, 0, r, [[0, shade(base, 0.35)], [1, shade(base, -0.12)]]), INK, lw(r) * 1.2);
  const p = PICTO[WIND_ROT[key] !== undefined ? 'wind' : key];
  if (p) { ctx.save(); ctx.rotate(WIND_ROT[key] || 0); p(ctx, r * 0.62, ink, base); ctx.restore(); }
  if (warn && (key === 'worm' || key === 'gate' || key === 'fire')) { circ(ctx, r * 0.7, -r * 0.7, r * 0.27); fillStroke(ctx, n ? '#38e07b' : '#ff3b30', INK, lw(r)); }
  shine(ctx, -r * 0.45, -r * 0.5, r * 0.22, r * 0.09, -0.7, 0.4);
  ctx.restore();
  if (fl) setFlat(was);
}
// a lap: a green flag on a pole with the lap number on it; the last lap is the white flag (with a gold star). t waves it.
export function drawLapFlag(ctx, r, n, last, t = 0) {
  const fl = bold(), was = fl && setFlat(true);
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.roundRect(-r * 0.74, -r * 0.92, r * 0.15, r * 1.84, r * 0.07); fillStroke(ctx, linear(ctx, -r * 0.74, 0, -r * 0.59, 0, [[0, '#e3e7ec'], [1, '#6f7680']]), INK, lw(r) * 0.8);
  const x0 = -r * 0.59, x1 = r * 0.9, y0 = -r * 0.86, h = r * 1.04, wv = k => Math.sin(t * 6 + k * 2.4) * r * 0.07;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0 + (x1 - x0) * 0.35, y0 - r * 0.16 + wv(0), x0 + (x1 - x0) * 0.65, y0 + r * 0.14 + wv(1), x1, y0 + wv(2));
  ctx.lineTo(x1, y0 + h + wv(2)); ctx.bezierCurveTo(x0 + (x1 - x0) * 0.65, y0 + h + r * 0.14 + wv(1), x0 + (x1 - x0) * 0.35, y0 + h - r * 0.16 + wv(0), x0, y0 + h); ctx.closePath();
  fillStroke(ctx, last ? linear(ctx, x0, y0, x1, y0 + h, [[0, '#ffffff'], [1, '#d3d9e4']]) : linear(ctx, x0, y0, x1, y0 + h, [[0, '#5be08c'], [1, '#1f9d55']]), INK, lw(r));
  const cx = (x0 + x1) / 2, cy = y0 + h / 2 + r * 0.03;
  if (last) { star(ctx, cx, cy, r * 0.36, 5, 0.45); fillStroke(ctx, '#ffc93c', '#a86b00', lw(r) * 0.7); }
  else { ctx.font = fl ? `${BOLD_W}${r * 0.86}px ${BOLD_DISPLAY}` : `800 ${r * 0.9}px "Fredoka", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = r * 0.18; ctx.strokeStyle = '#14532d'; ctx.strokeText(String(n), cx, cy); ctx.fillStyle = '#ffffff'; ctx.fillText(String(n), cx, cy); }
  ctx.restore();
  if (fl) setFlat(was);
}
// a finish: 1st is a gold cup, the rest a medal on a ribbon with the place on it (silver, bronze, then steel)
export function drawPlaceBadge(ctx, r, place) {
  const fl = bold(), was = fl && setFlat(true);
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (place === 1) {
    const gold = linear(ctx, -r * 0.6, 0, r * 0.6, 0, [[0, '#c98a0b'], [0.35, '#ffe27a'], [0.6, '#ffc93c'], [1, '#b8790a']]);
    for (const [w, c] of [[r * 0.28, INK], [r * 0.13, '#ffc93c']]) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(-r * 0.6, -r * 0.4, r * 0.24, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke(); ctx.beginPath(); ctx.arc(r * 0.6, -r * 0.4, r * 0.24, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-r * 0.64, -r * 0.84); ctx.lineTo(r * 0.64, -r * 0.84); ctx.quadraticCurveTo(r * 0.62, r * 0.1, 0, r * 0.2); ctx.quadraticCurveTo(-r * 0.62, r * 0.1, -r * 0.64, -r * 0.84); ctx.closePath(); fillStroke(ctx, gold, INK, lw(r));
    ctx.beginPath(); ctx.rect(-r * 0.1, r * 0.18, r * 0.2, r * 0.34); fillStroke(ctx, gold, INK, lw(r) * 0.8);
    ctx.beginPath(); ctx.roundRect(-r * 0.5, r * 0.5, r * 1.0, r * 0.38, r * 0.08); fillStroke(ctx, linear(ctx, 0, r * 0.5, 0, r * 0.88, [[0, '#6d4c41'], [1, '#3e2723']]), INK, lw(r));
    star(ctx, 0, -r * 0.38, r * 0.26, 5, 0.45); ctx.fillStyle = '#fff6cf'; ctx.fill();
    shine(ctx, -r * 0.34, -r * 0.55, r * 0.07, r * 0.2, 0.2, 0.7);
  } else {
    const col = place === 2 ? '#cfd8dc' : place === 3 ? '#e0915a' : '#90a4ae';
    for (const [s, c] of [[-1, '#3d7bd9'], [1, '#e04f5f']]) { poly(ctx, [[s * r * 0.55, -r * 0.95], [s * r * 0.12, -r * 0.95], [s * r * 0.2, -r * 0.25], [s * r * 0.5, -r * 0.35]]); fillStroke(ctx, c, INK, lw(r) * 0.8); }
    circ(ctx, 0, r * 0.22, r * 0.66); fillStroke(ctx, radial(ctx, -r * 0.2, 0, r * 0.05, 0, r * 0.22, r * 0.7, [[0, shade(col, 0.4)], [1, shade(col, -0.25)]]), INK, lw(r));
    ctx.fillStyle = INK; ctx.font = fl ? `${BOLD_W}${r * 0.8}px ${BOLD_DISPLAY}` : `800 ${r * 0.84}px "Fredoka", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(place), 0, r * 0.27);
  }
  ctx.restore();
  if (fl) setFlat(was);
}
