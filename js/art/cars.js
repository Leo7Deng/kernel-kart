// The cars from above, nose +x, in world units stretched to the body's footprint (BODIES L × W), so what you see is the
// hitbox. Real vehicles in believable paint: the colour belongs to the mascot riding on top (mascots.js).
import { BODIES, PCOL } from '../core.js';
import { bodyGrad, circ, ell, fillStroke, linear, poly, radial, rr, shade, smooth } from './paint.js';

const OUT = '#121318', RUBBER = '#16171b', STEEL = '#9aa1ab', CHROME = '#dfe4ea', CARBON = '#1d1f24';
// per racer: body paint, trim, and a racing number
export const CAR_PAINT = {
  gopher: { paint: '#d23c2f', trim: '#c9ced6', stripe: '#f4f1ea', num: 9 },          // red sprint kart
  octo:   { paint: '#eef0f2', trim: '#e0472b', stripe: '#f05032', num: 8, modern: true, git: true }, // white shifter kart, Git livery
  ferris: { paint: '#2f6fd0', trim: '#d5dae1', stripe: '#9fc2f5', rust: '#ee6a2a', num: 4 },   // metallic-blue monster truck, Rust-orange claws and cogs
  pyth:   { paint: '#e9ecee', trim: '#3b4a5a', stripe: '#3776ab', stripe2: '#ffd43b', num: 3 },   // white sports coupé, twin Python-blue stripes edged in yellow
  tux:    { paint: '#f3f4f1', trim: '#1c1e23', stripe: '#f6b61c', ice: '#cfe9f7', num: 1 }, // penguin bobsled: white, black, beak yellow
  duke:   { paint: '#e9ebee', trim: CARBON, stripe: '#d8202f', java: '#4f7fa6', num: 44 },   // pearl-white formula car in Java red, a coffee cup on the pods
  docky:  { paint: '#f1f1ec', trim: '#24354f', stripe: '#2496ed', box: '#3d5568', num: 7 }, // cab-over and a slate-blue box (a darker, greyer blue than the whale riding on it, so the mascot stands out)
  swifty: { paint: '#3fa39c', trim: '#d5dae1', stripe: '#f4f1ea', num: 5 },          // metal-flake teal dune buggy
  lamb:   { paint: '#a9d3c4', trim: '#efe6d0', stripe: '#efe6d0', num: 2 },          // duck-egg bubble car
  bugsy:  { paint: '#ece3cc', trim: '#c9ced6', stripe: '#3a3f47', num: 6 },          // ivory beetle cabriolet
  cpp:    { paint: '#7cb0e6', trim: CARBON, stripe: '#f3f6fa', deep: '#00447f', num: 11 },  // metallic C++-blue hypercar
  droid:  { paint: '#eceff1', trim: '#3ddc84', stripe: '#3ddc84', deep: '#1c8f55', batt: '#2b3540', num: 12 },   // white electric kart, Android-green bumpers and side pods, a battery pack out back
};
const DEFAULT_PAINT = { paint: '#8c939c', trim: '#c9ced6', stripe: '#ffffff', num: 0 };

// ---------------------------------------------------------------- parts
function tyre(ctx, x, y, len, wid, steer = 0, knobbly = false) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(steer);
  rr(ctx, -len / 2, -wid / 2, len, wid, Math.min(wid * 0.38, len * 0.3));
  ctx.fillStyle = linear(ctx, 0, -wid / 2, 0, wid / 2, [[0, '#08090b'], [0.3, '#2a2c33'], [0.55, '#1f2126'], [1, '#060708']]); ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = '#00000099'; ctx.lineWidth = knobbly ? 1.6 : 0.7;
  const sp = knobbly ? 3.4 : 2.6;
  for (let k = -len / 2 + sp / 2; k < len / 2; k += sp) {
    ctx.beginPath();
    if (knobbly) { ctx.moveTo(k - 1, -wid / 2); ctx.lineTo(k + 1, 0); ctx.lineTo(k - 1, wid / 2); }
    else { ctx.moveTo(k, -wid / 2 + wid * 0.18); ctx.lineTo(k, wid / 2 - wid * 0.18); }
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff14'; ctx.fillRect(-len / 2, -wid * 0.18, len, wid * 0.14);
  ctx.restore(); ctx.restore();
}
function tube(ctx, pts, w, col = STEEL) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  poly(ctx, pts, false); ctx.strokeStyle = shade(col, -0.45); ctx.lineWidth = w + 0.9; ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = w * 0.35; ctx.stroke();
}
function glass(ctx, x0, x1) {   // dark tinted glass with a sky reflection band, graded along the car
  return linear(ctx, x0, 0, x1, 0, [[0, '#16212c'], [0.42, '#2d4558'], [0.55, '#8fb2c8'], [0.66, '#36536a'], [1, '#16212c']]);
}
function headlight(ctx, x, y, r) {
  circ(ctx, x, y, r + 0.6); ctx.fillStyle = CHROME; ctx.fill();
  circ(ctx, x, y, r); ctx.fillStyle = radial(ctx, x + r * 0.3, y - r * 0.3, 0, x, y, r, [[0, '#ffffff'], [0.5, '#fff6d8'], [1, '#c9c2a8']]); ctx.fill();
}
function taillight(ctx, x, y, w, h, brake) {
  rr(ctx, x - w / 2, y - h / 2, w, h, Math.min(w, h) / 2); ctx.fillStyle = brake ? '#ff3b30' : '#8e1414'; ctx.fill();
  if (brake) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    circ(ctx, x - 2, y, 9); ctx.fillStyle = radial(ctx, x - 2, y, 0, x - 2, y, 9, [[0, '#ff3b3088'], [1, '#ff3b3000']]); ctx.fill();
    ctx.restore();
  }
}
function mirror(ctx, x, y, side, col) {
  ctx.lineCap = 'round'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 1.5, y + side * 3); ctx.stroke();
  ell(ctx, x - 1.8, y + side * 4.2, 1.8, 2.6); fillStroke(ctx, col, OUT, 0.7);
}
function roundel(ctx, x, y, r, n, rot = 0) {   // white racing-number disc
  if (!n) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  circ(ctx, 0, 0, r); fillStroke(ctx, '#f7f7f4', '#00000055', 0.6);
  ctx.fillStyle = '#16181d'; ctx.font = `800 ${r * (n > 9 ? 1.05 : 1.35)}px "Fredoka", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.rotate(Math.PI / 2); ctx.fillText(n, 0, r * 0.08);
  ctx.restore();
}
// the Git logo: an orange-red rounded diamond with a white branch, its top toward the nose
function gitLogo(ctx, x, y, r, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 2);
  ctx.save(); ctx.rotate(Math.PI / 4); const a = r * Math.SQRT2; rr(ctx, -a / 2, -a / 2, a, a, a * 0.16);
  fillStroke(ctx, radial(ctx, -r * 0.3, -r * 0.3, 0, 0, 0, r * 1.1, [[0, shade(col, 0.2)], [1, shade(col, -0.12)]]), shade(col, -0.45), 0.6); ctx.restore();
  ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = r * 0.13; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(-r * 0.36, -r * 0.7); ctx.lineTo(0, -r * 0.36); ctx.lineTo(0, r * 0.43); ctx.moveTo(0, -r * 0.36); ctx.lineTo(r * 0.43, 0); ctx.stroke();
  for (const [u, v] of [[0, -r * 0.36], [0, r * 0.43], [r * 0.43, 0]]) { circ(ctx, u, v, r * 0.15); ctx.fill(); }
  ctx.restore();
}
// a branch graph down a side pod: a commit line, a branch that leaves it and merges back, commits as dots
function gitGraph(ctx, s, col) {
  const y0 = s * 11.8, y1 = s * 14.2;
  ctx.strokeStyle = col; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-5.5, y0); ctx.lineTo(9, y0); ctx.moveTo(-3, y0); ctx.bezierCurveTo(-1, y0, -1, y1, 1, y1); ctx.lineTo(4.5, y1); ctx.bezierCurveTo(6.5, y1, 6.5, y0, 8, y0); ctx.stroke();
  for (const [x, y] of [[-5, y0], [-1, y0], [3, y0], [8.4, y0], [2.6, y1]]) { circ(ctx, x, y, 1.15); fillStroke(ctx, '#ffffff', col, 0.75); }
}
// a soft white sheen on glossy paint (the sun's reflection, toward the lit -y side)
function gloss(ctx, x, y, rx, ry, a = 0.5) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
  circ(ctx, 0, 0, rx); ctx.fillStyle = radial(ctx, 0, 0, 0, 0, 0, rx, [[0, `rgba(255,255,255,${a})`], [1, 'rgba(255,255,255,0)']]); ctx.fill();
  ctx.restore();
}
// the Python logo: a blue snake and a yellow one, each a rounded L with an eye, locked together (top toward the nose)
function pyLogo(ctx, x, y, r, blue, yellow) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 2);
  for (const [col, k] of [[blue, 1], [yellow, -1]]) {
    ctx.save(); ctx.scale(k, k);
    ctx.beginPath(); ctx.roundRect(-0.5 * r, -r, 0.98 * r, 0.9 * r, 0.3 * r); ctx.roundRect(-r, -0.36 * r, 0.9 * r, 0.82 * r, 0.3 * r);
    ctx.fillStyle = shade(col, -0.45); ctx.save(); ctx.translate(0.07 * r * k, 0.07 * r * k); ctx.fill(); ctx.restore();   // a hairline shadow
    ctx.fillStyle = col; ctx.fill();
    circ(ctx, -0.22 * r, -0.7 * r, 0.12 * r); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
// the Java cup: a blue cup on its saucer with two red wisps of steam, upright facing out from side s of the car
function javaCup(ctx, x, y, r, cup, steam, s = -1) {
  ctx.save(); ctx.translate(x, y); if (s > 0) ctx.rotate(Math.PI); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-0.62 * r, 0); ctx.lineTo(0.62 * r, 0); ctx.quadraticCurveTo(0.58 * r, 0.78 * r, 0, 0.8 * r); ctx.quadraticCurveTo(-0.58 * r, 0.78 * r, -0.62 * r, 0); ctx.fillStyle = cup; ctx.fill();
  ctx.strokeStyle = cup; ctx.lineWidth = r * 0.2;
  ctx.beginPath(); ctx.arc(0.66 * r, 0.3 * r, 0.22 * r, -1.3, 1.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-0.8 * r, 1.04 * r); ctx.quadraticCurveTo(0, 1.24 * r, 0.8 * r, 1.04 * r); ctx.stroke();
  ctx.strokeStyle = steam; ctx.lineWidth = r * 0.18;
  for (const dx of [-0.2, 0.2]) { ctx.beginPath(); ctx.moveTo(dx * r, -0.15 * r); ctx.bezierCurveTo((dx - 0.32) * r, -0.45 * r, (dx + 0.32) * r, -0.7 * r, dx * r, -1.05 * r); ctx.stroke(); }
  ctx.restore();
}
// a racing number on a cog (the Rust logo's ring of teeth)
function cogRoundel(ctx, x, y, r, n, col, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath(); for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12, q = k % 2 ? r * 1.32 : r * 1.06; ctx.lineTo(Math.cos(a - 0.08) * q, Math.sin(a - 0.08) * q); ctx.lineTo(Math.cos(a + 0.08) * q, Math.sin(a + 0.08) * q); }
  ctx.closePath(); fillStroke(ctx, col, shade(col, -0.5), 0.5);
  ctx.restore();
  roundel(ctx, x, y, r, n, rot);
}
function seatPad(ctx, x, y, rx, ry) {   // a bucket seat; the mascot sits on it
  ell(ctx, x, y, rx, ry); ctx.fillStyle = radial(ctx, x, y, 0, x, y, Math.max(rx, ry), [[0, '#3a3d45'], [0.7, '#202227'], [1, '#0d0e11']]); ctx.fill();
}
function steering(ctx, x, y, r = 4.2) {
  ctx.strokeStyle = '#0d0e11'; ctx.lineWidth = 1.6; ell(ctx, x, y, r * 0.38, r); ctx.stroke();
  ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
}

// ---------------------------------------------------------------- bodies
// each draws inside x ∈ [-L/2, L/2], y ∈ [-W/2, W/2]
const DRAW = {
  // sprint kart: exposed tyres on a steel tube frame, plastic nose, side pods and rear bumper, engine beside the seat
  kart(ctx, P, o) {
    const plast = P.paint, dk = shade(plast, -0.35);
    tube(ctx, [[-22, -15.5], [-22, 15.5]], 2.6, '#8a919b');                            // rear axle
    tube(ctx, [[-27, -6], [-10, -8], [14, -6], [20, -9.5]], 1.8, P.trim);               // frame rails
    tube(ctx, [[-27, 6], [-10, 8], [14, 6], [20, 9.5]], 1.8, P.trim);
    tube(ctx, [[14, -6], [14, 6]], 1.6, P.trim);
    for (const s of [-1, 1]) tyre(ctx, -22, s * 12.5, 15, 9);
    for (const s of [-1, 1]) tyre(ctx, 17, s * 12.8, 11.5, 7.2, o.steer);
    rr(ctx, -16, -8, 30, 16, 4); ctx.fillStyle = linear(ctx, 0, -8, 0, 8, [[0, '#202227'], [0.5, '#34373e'], [1, '#18191d']]); ctx.fill();   // floor tray
    // side pods
    for (const s of [-1, 1]) {
      smooth(ctx, [[-6, s * 8.5], [9, s * 8.5], [11, s * 12.5], [8, s * 16], [-5, s * 16.5], [-8, s * 12.5]]);
      ctx.fillStyle = bodyGrad(ctx, 17, plast, 0.8); fillStroke(ctx, null, OUT, 0.8); ctx.fill(); ctx.stroke();
      if (P.git) gitGraph(ctx, s, P.stripe); else { ctx.fillStyle = P.stripe; ctx.fillRect(-4, s * 13.6 - 0.6, 12, 1.2); }
    }
    // engine on the right of the seat: finned barrel, carb, header pipe
    tube(ctx, [[-10, 9.5], [-20, 10.5], [-28, 7]], 2.2, '#8b7f74');
    rr(ctx, -16, 6.5, 9, 8, 2); ctx.fillStyle = linear(ctx, -16, 0, -7, 0, [[0, '#7c838c'], [0.5, '#c9ced5'], [1, '#6b727b']]); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.strokeStyle = '#4b5058'; ctx.lineWidth = 0.6; for (let k = -15; k < -7; k += 1.6) { ctx.beginPath(); ctx.moveTo(k, 7.2); ctx.lineTo(k, 13.8); ctx.stroke(); }
    rr(ctx, -6.5, 8, 4, 5, 1.5); ctx.fillStyle = '#1b1c20'; ctx.fill();
    // nose
    if (P.modern) smooth(ctx, [[9, -7], [24, -8], [27, -14], [35, -13], [35, 13], [27, 14], [24, 8], [9, 7]]);
    else smooth(ctx, [[9, -6.5], [27, -7.5], [34, -10], [35, 0], [34, 10], [27, 7.5], [9, 6.5]]);
    ctx.fillStyle = bodyGrad(ctx, 14, plast, 0.8); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; ctx.stroke();
    if (!P.modern) tube(ctx, [[30, -13], [33, -12], [33, 12], [30, 13]], 1.5, P.trim);
    if (P.git) {   // the Git logo on the front fairing, an orange lip under it, the number on the nose
      ctx.save(); poly(ctx, [[35.4, -13], [33.6, -13.4], [33.6, 13.4], [35.4, 13]]); ctx.fillStyle = P.stripe; ctx.fill(); ctx.restore();
      gitLogo(ctx, 29, 0, 6.4, P.stripe); roundel(ctx, 17.5, 0, 3.3, P.num);
    } else roundel(ctx, 27, 0, 4.2, P.num);
    // rear bumper
    smooth(ctx, [[-35, -15], [-30.5, -15.5], [-30, 0], [-30.5, 15.5], [-35, 15], [-35.5, 0]]);
    ctx.fillStyle = dk; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.7; ctx.stroke();
    for (const s of [-1, 1]) taillight(ctx, -34.5, s * 9, 1.6, 4, o.brake);
    seatPad(ctx, -6, 0, 6.5, 6);
    steering(ctx, 5, 0);
  },
  // boxy electric kart: a white tub on exposed wheels, green nerf bars and pods, a battery pack out back, two whip aerials
  // like the Android's antennae, LED strips
  ekart(ctx, P, o) {
    const G = P.trim, GD = P.deep;
    rr(ctx, -28, -8, 55, 16, 2); ctx.fillStyle = '#1a1c21'; ctx.fill();                                  // floor pan
    tube(ctx, [[-19, -15], [-19, 15]], 2.4, '#7d848e');                                                    // rear axle
    for (const s of [-1, 1]) tyre(ctx, -19, s * 12.6, 13.5, 8.4);
    for (const s of [-1, 1]) tyre(ctx, 19.5, s * 12.8, 10.5, 6.8, o.steer);
    // side pods between the wheels: flat green boxes with a dark charge port in each
    for (const s of [-1, 1]) {
      poly(ctx, [[-10.5, s * 9.5], [11, s * 9.5], [12, s * 12], [11, s * 15.6], [-10.5, s * 15.6], [-11.5, s * 12]]);
      fillStroke(ctx, linear(ctx, 0, s * 9.5, 0, s * 15.6, [[0, shade(G, 0.25)], [0.45, G], [1, shade(G, -0.32)]]), OUT, 0.8);
      ctx.fillStyle = '#ffffff40'; ctx.fillRect(-9.5, s * 10.6 - 0.4, 19.5, 0.8);
      rr(ctx, 4.5, s * 12.6 - 1.4, 3.6, 2.8, 0.8); ctx.fillStyle = '#16191d'; ctx.fill();
      circ(ctx, 6.3, s * 12.6, 0.6); ctx.fillStyle = '#9cf5c4'; ctx.fill();
    }
    // the tub: flat sides, chamfered corners, a lighter top panel (it's boxy, so the light breaks on its edges)
    const tub = () => poly(ctx, [[-24, -10.6], [21, -10.6], [27.5, -7.4], [27.5, 7.4], [21, 10.6], [-24, 10.6], [-25.5, 9], [-25.5, -9]]);
    tub(); ctx.fillStyle = shade(P.paint, -0.22); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.9; ctx.stroke();
    poly(ctx, [[-23, -8.8], [20.4, -8.8], [25.8, -6.2], [25.8, 6.2], [20.4, 8.8], [-23, 8.8]]);
    ctx.fillStyle = linear(ctx, 0, -8.8, 0, 8.8, [[0, shade(P.paint, 0.5)], [0.35, P.paint], [1, shade(P.paint, -0.1)]]); ctx.fill();
    ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-22, -9.7); ctx.lineTo(20.6, -9.7); ctx.lineTo(26.6, -6.8); ctx.stroke();   // the lit edge
    // a green pinstripe round the bonnet and the number on it
    ctx.strokeStyle = G; ctx.lineWidth = 1; poly(ctx, [[9.5, -7.4], [20, -7.4], [24.6, -5.2], [24.6, 5.2], [20, 7.4], [9.5, 7.4]]); ctx.stroke();
    roundel(ctx, 17, 0, 3.8, P.num);
    for (const s of [-1, 1]) { rr(ctx, 25.6, s * 6.3 - 1.9, 1.6, 3.8, 0.6); ctx.fillStyle = '#eafff3'; ctx.fill(); ctx.strokeStyle = '#2f3a42'; ctx.lineWidth = 0.4; ctx.stroke(); }   // LED headlights
    // front nerf bar, green, across the nose between the front wheels
    rr(ctx, 28.2, -14.5, 2.6, 29, 1.2); ctx.fillStyle = linear(ctx, 28.2, 0, 30.8, 0, [[0, shade(G, -0.25)], [0.5, shade(G, 0.25)], [1, shade(G, -0.3)]]); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.6; ctx.stroke();
    for (const s of [-1, 1]) tube(ctx, [[26.5, s * 5], [28.4, s * 5]], 1.2, '#7d848e');
    // cockpit: an open box, the bucket seat, the wheel
    rr(ctx, -12, -7, 21, 14, 2.4); ctx.fillStyle = '#17181c'; ctx.fill(); ctx.strokeStyle = '#00000080'; ctx.lineWidth = 0.6; ctx.stroke();
    seatPad(ctx, -4, 0, 6, 5.6);
    steering(ctx, 5.5, 0, 3.8);
    // battery pack out back: a slate box of cells, a green charge meter and a bolt
    rr(ctx, -26.5, -8.2, 13, 16.4, 1.4); ctx.fillStyle = linear(ctx, 0, -8.2, 0, 8.2, [[0, shade(P.batt, 0.25)], [0.4, P.batt], [1, shade(P.batt, -0.35)]]); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.strokeStyle = '#00000066'; ctx.lineWidth = 0.6; for (let x = -24.5; x < -14; x += 2.4) { ctx.beginPath(); ctx.moveTo(x, -7); ctx.lineTo(x, -2.4); ctx.moveTo(x, 2.4); ctx.lineTo(x, 7); ctx.stroke(); }
    rr(ctx, -25, -1.6, 9.4, 3.2, 0.8); ctx.fillStyle = '#0d1013'; ctx.fill();
    for (let k = 0; k < 4; k++) { rr(ctx, -24.4 + k * 2.2, -1, 1.6, 2, 0.3); ctx.fillStyle = k < 3 ? G : '#20523a'; ctx.fill(); }
    ctx.save(); ctx.translate(-14.9, 0); ctx.rotate(Math.PI / 2); ctx.fillStyle = G;   // the bolt, upright toward the nose
    poly(ctx, [[0.6, -2.4], [-1.2, 0.3], [0, 0.3], [-0.6, 2.4], [1.2, -0.3], [0, -0.3]]); ctx.fill(); ctx.restore();
    // rear bumper with an LED tail strip
    rr(ctx, -30.6, -12, 3, 24, 1.2); ctx.fillStyle = '#8b929c'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.6; ctx.stroke();
    for (const s of [-1, 1]) taillight(ctx, -30.2, s * 8.2, 1.4, 5, o.brake);
    // whip aerials off the back corners, splayed out like the Android's antennae, a green light winking on each tip
    for (const s of [-1, 1]) {
      ctx.lineCap = 'round'; ctx.strokeStyle = '#1b1d22'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(-23.5, s * 7); ctx.lineTo(-30, s * 15.4); ctx.stroke();
      circ(ctx, -23.5, s * 7, 1.3); ctx.fillStyle = '#4a525c'; ctx.fill();
      circ(ctx, -30, s * 15.4, 1.3); ctx.fillStyle = G; ctx.fill(); ctx.strokeStyle = GD; ctx.lineWidth = 0.4; ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      circ(ctx, -30, s * 15.4, 4); ctx.fillStyle = radial(ctx, -30, s * 15.4, 0, -30, s * 15.4, 4, [[0, '#7dffb855'], [1, '#7dffb800']]); ctx.fill();
      ctx.restore();
    }
  },
  // Meyers-Manx style dune buggy: fibreglass tub with front fenders, spare on the hood, roll bar, open engine out back
  buggy(ctx, P, o) {
    for (const s of [-1, 1]) tyre(ctx, -19, s * 10.6, 15, 8.8, 0, true);
    for (const s of [-1, 1]) tyre(ctx, 19, s * 11.2, 12, 6.6, o.steer, true);
    // engine: an air-cooled flat four, chrome air cleaner, twin pipes
    rr(ctx, -29, -7, 13, 14, 3); ctx.fillStyle = linear(ctx, 0, -7, 0, 7, [[0, '#5d6066'], [0.5, '#a8adb4'], [1, '#4c4f55']]); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.7; ctx.stroke();
    circ(ctx, -21, 0, 4); ctx.fillStyle = radial(ctx, -22, -1, 0, -21, 0, 4, [[0, '#ffffff'], [0.6, CHROME], [1, '#7f868f']]); ctx.fill();
    for (const s of [-1, 1]) tube(ctx, [[-27, s * 4], [-31, s * 5]], 1.6, CHROME);
    // tub
    smooth(ctx, [[-15, -9.5], [3, -10], [12, -14.5], [26, -14.5], [31, -6], [31, 6], [26, 14.5], [12, 14.5], [3, 10], [-15, 9.5], [-17, 0]]);
    ctx.fillStyle = bodyGrad(ctx, 15, P.paint); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.9; ctx.stroke();
    // fender lines and spare tyre on the hood
    ctx.strokeStyle = '#00000040'; ctx.lineWidth = 0.8; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(12, s * 7.5); ctx.quadraticCurveTo(20, s * 8.5, 28, s * 5.5); ctx.stroke(); }
    circ(ctx, 21, 0, 5.6); ctx.fillStyle = RUBBER; ctx.fill(); circ(ctx, 21, 0, 3); ctx.fillStyle = CHROME; ctx.fill(); circ(ctx, 21, 0, 1.2); ctx.fillStyle = '#555b63'; ctx.fill();
    // cockpit
    smooth(ctx, [[-13, -8], [8, -8.5], [10, 0], [8, 8.5], [-13, 8], [-14, 0]]); ctx.fillStyle = '#1b1c20'; ctx.fill();
    seatPad(ctx, -4, -3.8, 5, 3.6); seatPad(ctx, -4, 3.8, 5, 3.6);
    rr(ctx, 8, -9, 1.8, 18, 0.9); ctx.fillStyle = glass(ctx, 8, 10); ctx.fill();                               // low screen
    steering(ctx, 4, -3.8, 3.4);
    tube(ctx, [[-12, -10.5], [-12, 10.5]], 2.2, P.trim); for (const s of [-1, 1]) tube(ctx, [[-12, s * 8], [-24, s * 6.5]], 1.4, P.trim);   // roll bar
    for (const s of [-1, 1]) headlight(ctx, 28.5, s * 9.5, 2);
    for (const s of [-1, 1]) taillight(ctx, -29.6, s * 6.5, 1.6, 2.6, o.brake);
    roundel(ctx, 13, -11.8, 2.4, P.num, 0);
  },
  // Isetta-style bubble car: an egg, wide at the front, rear wheels close together, wrap-round glass, roll-back roof
  bubble(ctx, P, o) {
    for (const s of [-1, 1]) tyre(ctx, 14, s * 15.4, 10, 5, o.steer);
    for (const s of [-1, 1]) tyre(ctx, -18, s * 6, 9, 4.6);
    smooth(ctx, [[-31, -6], [-24, -12.5], [-6, -17], [18, -17.5], [30, -12], [32, 0], [30, 12], [18, 17.5], [-6, 17], [-24, 12.5], [-31, 6]]);
    ctx.fillStyle = bodyGrad(ctx, 18, P.paint); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.9; ctx.stroke();
    // glasshouse ring, then the roof (rolled back fabric over the cabin), then the front door panel
    smooth(ctx, [[-17, -8], [-6, -13.5], [14, -14], [24, -9], [26, 0], [24, 9], [14, 14], [-6, 13.5], [-17, 8], [-19, 0]]);
    ctx.fillStyle = glass(ctx, -19, 26); ctx.fill();
    smooth(ctx, [[-14, -6.5], [-4, -11], [10, -11], [16, -7], [16, 7], [10, 11], [-4, 11], [-14, 6.5]]);
    ctx.fillStyle = bodyGrad(ctx, 11, P.trim, 0.6); ctx.fill(); ctx.strokeStyle = '#00000044'; ctx.lineWidth = 0.6; ctx.stroke();
    smooth(ctx, [[-8, -7.5], [8, -7.5], [9, 0], [8, 7.5], [-8, 7.5], [-9, 0]]); ctx.fillStyle = '#1c1d22'; ctx.fill();   // open roof
    rr(ctx, -12, -8.5, 4.5, 17, 2); ctx.fillStyle = linear(ctx, -12, 0, -7.5, 0, [[0, '#7c7466'], [0.5, '#b8ad97'], [1, '#6d6658']]); ctx.fill();   // furled canvas
    seatPad(ctx, -3, 0, 5.5, 6.5);
    ctx.strokeStyle = CHROME; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(27, -5); ctx.lineTo(27, 5); ctx.stroke();             // door handle
    for (const s of [-1, 1]) { ctx.save(); ctx.translate(26, s * 14.5); headlight(ctx, 0, 0, 2.4); ctx.restore(); }
    rr(ctx, 30.5, -9, 2, 18, 1); ctx.fillStyle = CHROME; ctx.fill();
    for (const s of [-1, 1]) taillight(ctx, -29.8, s * 4.5, 1.5, 3, o.brake);
  },
  // beetle cabriolet: separate round fenders, running boards, hood, windscreen, folded top, louvred engine lid
  beetle(ctx, P, o) {
    for (const s of [-1, 1]) tyre(ctx, 19, s * 13, 10, 5.5, o.steer);
    for (const s of [-1, 1]) tyre(ctx, -18, s * 13, 10, 5.8);
    for (const s of [-1, 1]) { rr(ctx, -12, s * 13 - 2, 24, 4, 1.5); ctx.fillStyle = '#26282e'; ctx.fill(); }                  // running boards
    const fender = (x, s) => { smooth(ctx, [[x - 10, s * 9], [x - 7, s * 16.5], [x + 7, s * 16.8], [x + 11, s * 10], [x, s * 7]]); ctx.fillStyle = bodyGrad(ctx, 17, P.paint, 0.9); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; ctx.stroke(); };
    for (const s of [-1, 1]) { fender(19, s); fender(-18, s); }
    smooth(ctx, [[-31, -7], [-24, -11.5], [0, -12], [22, -11], [31, -6], [32.5, 0], [31, 6], [22, 11], [0, 12], [-24, 11.5], [-31, 7]]);
    ctx.fillStyle = bodyGrad(ctx, 12.5, P.paint); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.strokeStyle = '#00000038'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(11, 0); ctx.stroke();   // hood crease
    for (const s of [-1, 1]) { ctx.save(); ctx.translate(26.5, s * 13); headlight(ctx, 0, 0, 2.6); ctx.restore(); }
    smooth(ctx, [[7, -10.5], [10, -11], [11, 0], [10, 11], [7, 10.5], [6.5, 0]]); ctx.fillStyle = glass(ctx, 6, 11); ctx.fill();   // screen
    rr(ctx, -12, -9.5, 18, 19, 4); ctx.fillStyle = '#1d1e23'; ctx.fill();                                                    // cabin
    seatPad(ctx, -4, -4.5, 4.6, 4); seatPad(ctx, -4, 4.5, 4.6, 4);
    steering(ctx, 3, -4.5, 3.4);
    rr(ctx, -18, -10, 6, 20, 3); ctx.fillStyle = linear(ctx, -18, 0, -12, 0, [[0, '#3a332c'], [0.5, '#6e6255'], [1, '#2e2924']]); ctx.fill();   // folded top
    ctx.strokeStyle = '#00000050'; ctx.lineWidth = 0.8; for (let y = -4; y <= 4; y += 2) { ctx.beginPath(); ctx.moveTo(-27, y); ctx.lineTo(-22, y); ctx.stroke(); }   // louvres
    for (const s of [-1, 1]) taillight(ctx, -26, s * 14, 2.6, 2.2, o.brake);
    rr(ctx, 32, -10, 1.6, 20, 0.8); ctx.fillStyle = CHROME; ctx.fill(); rr(ctx, -33.4, -9, 1.6, 18, 0.8); ctx.fill();
    roundel(ctx, 0, -12.6, 2.4, P.num, 0); roundel(ctx, 0, 12.6, 2.4, P.num, Math.PI);
  },
  // rear-engined sports coupé (the classic 911 shape): round nose, bonnet between front wings, fastback, ducktail
  sports(ctx, P, o) {
    for (const s of [-1, 1]) tyre(ctx, 20.5, s * 15.6, 11, 6, o.steer);
    for (const s of [-1, 1]) tyre(ctx, -20, s * 16, 12.4, 6);
    const shell = () => smooth(ctx, [[34.6, -6.5], [33.2, -12.6], [27, -14.8], [18, -14.8], [11, -14.2], [-2, -14.2], [-11, -16.2], [-21, -17.2], [-31.4, -16], [-34.4, -9],
      [-34.4, 9], [-31.4, 16], [-21, 17.2], [-11, 16.2], [-2, 14.2], [11, 14.2], [18, 14.8], [27, 14.8], [33.2, 12.6], [34.6, 6.5]]);
    shell(); ctx.fillStyle = bodyGrad(ctx, 18, P.paint, 0.85); ctx.fill();
    ctx.save(); shell(); ctx.clip();
    // the bonnet sits lower than the wings: a shaded panel between them, its shut lines running to the nose
    smooth(ctx, [[9.5, -9.6], [24, -8.6], [33.5, -6.4], [35, 0], [33.5, 6.4], [24, 8.6], [9.5, 9.6], [8.5, 0]]);
    ctx.fillStyle = linear(ctx, 0, -9.6, 0, 9.6, [[0, shade(P.paint, -0.2)], [0.3, shade(P.paint, 0.1)], [0.6, P.paint], [1, shade(P.paint, -0.24)]]); ctx.fill();
    ctx.strokeStyle = '#00000030'; ctx.lineWidth = 0.5; ctx.stroke();
    // twin racing stripes nose to tail, Python blue edged in Python yellow
    for (const s of [-1, 1]) {
      ctx.fillStyle = P.stripe2; ctx.fillRect(-36, s * 3.6 - 1.6, 72, 3.2);
      ctx.fillStyle = P.stripe; ctx.fillRect(-36, s * 3.6 - 1.15, 72, 2.3);
    }
    // the rear haunches swell over the wheels: a soft shade inboard of each, a sheen on top (lit from the top left)
    for (const s of [-1, 1]) { ctx.strokeStyle = '#00000026'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-6, s * 12.6); ctx.quadraticCurveTo(-20, s * 13.8, -30, s * 12.4); ctx.stroke(); }
    gloss(ctx, -21, -15.6, 9, 1.6, 0.6); gloss(ctx, 21, -13.2, 8, 1.3, 0.55);
    ctx.restore();
    shell(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.9; ctx.stroke();
    // front wing crowns with a headlight set in each, an amber indicator in the corner of the bumper
    for (const s of [-1, 1]) {
      ell(ctx, 27.6, s * 11.4, 3.3, 2.9); ctx.fillStyle = CHROME; ctx.fill(); ctx.strokeStyle = '#00000066'; ctx.lineWidth = 0.4; ctx.stroke();
      ell(ctx, 27.9, s * 11.4, 2.6, 2.3); ctx.fillStyle = radial(ctx, 28.6, s * 11.4 - 0.9, 0, 27.9, s * 11.4, 2.6, [[0, '#ffffff'], [0.5, '#fff6d8'], [1, '#bdb69e']]); ctx.fill();
      rr(ctx, 32.4, s * 9.6 - 1, 1.3, 2, 0.6); ctx.fillStyle = '#ffb02e'; ctx.fill();
    }
    pyLogo(ctx, 25, 0, 2.2, P.stripe, P.stripe2);
    // the glasshouse: windscreen, side glass and the fastback rear window, then the roof on top of it
    smooth(ctx, [[10.4, -11.2], [11.2, 0], [10.4, 11.2], [0, 12.2], [-12, 10.4], [-19.5, 6.6], [-20.2, 0], [-19.5, -6.6], [-12, -10.4], [0, -12.2]]);
    ctx.fillStyle = glass(ctx, -20, 11); ctx.fill(); ctx.strokeStyle = '#0b0d10'; ctx.lineWidth = 0.7; ctx.stroke();
    const roof = () => smooth(ctx, [[4.6, -9.8], [5.2, 0], [4.6, 9.8], [-4, 10.2], [-10.5, 9.2], [-11.4, 0], [-10.5, -9.2], [-4, -10.2]]);
    roof(); ctx.fillStyle = bodyGrad(ctx, 10, P.paint, 0.7); ctx.fill();
    ctx.save(); roof(); ctx.clip();
    for (const s of [-1, 1]) { ctx.fillStyle = P.stripe2; ctx.fillRect(-12, s * 3.6 - 1.6, 18, 3.2); ctx.fillStyle = P.stripe; ctx.fillRect(-12, s * 3.6 - 1.15, 18, 2.3); }
    ctx.restore();
    roof(); ctx.strokeStyle = '#00000055'; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(8.6, -9.2); ctx.quadraticCurveTo(10.2, -5, 10.3, -1.5); ctx.stroke();   // glint on the screen
    ctx.strokeStyle = '#ffffff66'; ctx.beginPath(); ctx.moveTo(-13, -8.6); ctx.quadraticCurveTo(-17.4, -5.6, -18, -2); ctx.stroke();                     // and on the rear window
    rr(ctx, -7, -5.2, 8, 10.4, 3); ctx.fillStyle = '#18191d'; ctx.fill();   // open sunroof (Pyth sits at -3)
    seatPad(ctx, -3, 0, 4, 4.6);
    for (const s of [-1, 1]) { ell(ctx, 7.4, s * 14.2, 1.3, 1.8); fillStroke(ctx, '#2a2c31', OUT, 0.5); }   // door mirrors
    roundel(ctx, -3, -13.2, 1.7, P.num, 0); roundel(ctx, -3, 13.2, 1.7, P.num, Math.PI);
    // engine lid with its grille, then the ducktail lip
    rr(ctx, -27.4, -5.6, 6.6, 11.2, 1.4); ctx.fillStyle = '#16171b'; ctx.fill();
    ctx.strokeStyle = '#8d949d'; ctx.lineWidth = 0.55; for (let y = -4.4; y <= 4.5; y += 1.47) { ctx.beginPath(); ctx.moveTo(-26.8, y); ctx.lineTo(-21.4, y); ctx.stroke(); }
    const duck = () => smooth(ctx, [[-28.4, -12.2], [-34.4, -13.6], [-34.6, 0], [-34.4, 13.6], [-28.4, 12.2], [-27.8, 0]]);
    ctx.strokeStyle = '#00000040'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-28.6, -10.6); ctx.quadraticCurveTo(-27.4, 0, -28.6, 10.6); ctx.stroke();   // its shadow on the lid
    duck(); ctx.fillStyle = bodyGrad(ctx, 13.6, shade(P.paint, -0.06), 0.8); ctx.fill();
    ctx.save(); duck(); ctx.clip();
    for (const s of [-1, 1]) { ctx.fillStyle = P.stripe2; ctx.fillRect(-36, s * 3.6 - 1.6, 9, 3.2); ctx.fillStyle = P.stripe; ctx.fillRect(-36, s * 3.6 - 1.15, 9, 2.3); }
    ctx.restore();
    duck(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(-28.9, -9.5); ctx.quadraticCurveTo(-28.4, 0, -28.9, 9.5); ctx.stroke();
    // the light bar right across the tail
    rr(ctx, -34.8, -13.4, 1.5, 26.8, 0.75); ctx.fillStyle = o.brake ? '#ff3b30' : '#8e1414'; ctx.fill();
    for (const s of [-1, 1]) taillight(ctx, -34, s * 12, 1.8, 4.4, o.brake);
    if (o.brake) taillight(ctx, -34.1, 0, 0.1, 0.1, true);
  },
  // bobsled in Tux's colours: white cowl (belly), black tails, yellow nose cone (beak), four runners (front pair steers)
  sled(ctx, P, o) {
    ctx.lineCap = 'round';
    const runner = (a, b) => {
      ctx.strokeStyle = '#4c535c'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(a, 0); ctx.lineTo(b, 0); ctx.stroke();
      ctx.strokeStyle = '#eef4f8'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(a + 1, -0.3); ctx.lineTo(b - 0.5, -0.3); ctx.stroke();
      circ(ctx, b, 0, 1.5); ctx.fillStyle = '#b8c0c9'; ctx.fill(); ctx.strokeStyle = '#4c535c'; ctx.lineWidth = 0.6; ctx.stroke();   // the upturned tip
    };
    for (const s of [-1, 1]) { ctx.save(); ctx.translate(0, s * 12.6); runner(-37, -13); ctx.restore(); }
    for (const s of [-1, 1]) { ctx.save(); ctx.translate(24, s * 12.6); ctx.rotate(o.steer * 0.3); runner(-12, 12); ctx.restore(); }
    for (const s of [-1, 1]) tube(ctx, [[-30, s * 10], [-38.5, s * 13.6]], 1.6, CHROME);   // push bars
    for (const s of [-1, 1]) tube(ctx, [[12, s * 11], [6, s * 14]], 1.3, CHROME);
    const cowl = () => smooth(ctx, [[-38.5, -10.6], [-22, -12], [6, -12.4], [22, -11], [33, -7.2], [39.5, -1.6], [39.5, 1.6], [33, 7.2], [22, 11], [6, 12.4], [-22, 12], [-38.5, 10.6]]);
    cowl(); ctx.fillStyle = bodyGrad(ctx, 12.4, P.paint, 0.75); ctx.fill();
    ctx.save(); cowl(); ctx.clip();
    for (const s of [-1, 1]) {   // the black tails, a yellow pinstripe along their edge, a snowflake on each
      smooth(ctx, [[-42, s * 4.4], [-14, s * 6], [6, s * 8.4], [20, s * 13.4], [-42, s * 15]]);
      ctx.fillStyle = linear(ctx, 0, s * 6, 0, s * 13, [[0, '#3d424c'], [0.5, P.trim], [1, '#0b0c0f']]); ctx.fill();
      ctx.strokeStyle = P.stripe; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-40, s * 4.8); ctx.quadraticCurveTo(-14, s * 5.6, 0, s * 7.4); ctx.quadraticCurveTo(12, s * 9.2, 19, s * 12.8); ctx.stroke();
      ctx.strokeStyle = '#e8f4fb'; ctx.lineWidth = 0.45;
      for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3, x = -22, y = s * 10.2; ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * 1.7, y - Math.sin(a) * 1.7); ctx.lineTo(x + Math.cos(a) * 1.7, y + Math.sin(a) * 1.7); ctx.stroke(); }
    }
    ctx.beginPath(); ctx.moveTo(32, -14); ctx.quadraticCurveTo(29, 0, 32, 14); ctx.lineTo(42, 14); ctx.lineTo(42, -14); ctx.closePath();   // the beak
    ctx.fillStyle = linear(ctx, 0, -8, 0, 8, [[0, '#ffd86a'], [0.45, P.stripe], [1, '#c87a0c']]); ctx.fill();
    ctx.strokeStyle = '#8a4b0066'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(32.4, 0.6); ctx.lineTo(39.5, 0.6); ctx.stroke();
    cowl(); ctx.strokeStyle = P.ice; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.7; ctx.stroke(); ctx.globalAlpha = 1;   // frost round the rim
    ctx.restore();
    cowl(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.9; ctx.stroke();
    smooth(ctx, [[-31, -6.5], [8, -7.5], [14, 0], [8, 7.5], [-31, 6.5], [-33, 0]]); ctx.fillStyle = linear(ctx, 0, -7.5, 0, 7.5, [[0, '#0b0c0e'], [0.5, '#24262b'], [1, '#0b0c0e']]); ctx.fill();
    ctx.strokeStyle = '#c9ced5'; ctx.lineWidth = 0.8; ctx.stroke();
    for (const s of [-1, 1]) { circ(ctx, 8, s * 3.5, 1.3); ctx.strokeStyle = '#c9ced5'; ctx.lineWidth = 0.8; ctx.stroke(); }   // steering rings
    seatPad(ctx, -8, 0, 7, 5.5);
    roundel(ctx, 22.5, 0, 3.6, P.num);
    rr(ctx, -39.6, -5, 2.5, 10, 1.2); ctx.fillStyle = '#26282d'; ctx.fill();
    for (const s of [-1, 1]) taillight(ctx, -38, s * 6.5, 1.2, 2.4, o.brake);
  },
  // formula car: front wing, needle nose, exposed wheels on wishbones, sidepods with intakes, halo, airbox, rear wing
  f1(ctx, P, o) {
    ctx.strokeStyle = '#2a2c31'; ctx.lineWidth = 1.1;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(22, s * 7.5); ctx.lineTo(10, s * 3); ctx.moveTo(22, s * 7.5); ctx.lineTo(16, s * 3); ctx.moveTo(-27, s * 7); ctx.lineTo(-16, s * 5); ctx.moveTo(-27, s * 7); ctx.lineTo(-21, s * 4); ctx.stroke(); }
    for (const s of [-1, 1]) tyre(ctx, 22, s * 10.8, 11, 7.2, o.steer);
    for (const s of [-1, 1]) tyre(ctx, -27, s * 10.6, 14, 8.6);
    // floor, sidepods (coke bottle), monocoque and nose
    smooth(ctx, [[-30, -6], [-18, -11], [2, -11.5], [8, -9], [8, 9], [2, 11.5], [-18, 11], [-30, 6]]);
    ctx.fillStyle = CARBON; ctx.fill();
    smooth(ctx, [[-26, -4.5], [-14, -10], [2, -10.5], [6, -8], [6, 8], [2, 10.5], [-14, 10], [-26, 4.5]]);
    ctx.fillStyle = bodyGrad(ctx, 10.5, P.paint); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; ctx.stroke();
    for (const s of [-1, 1]) {   // a red flash along each pod, the Java cup on it, the intake
      ctx.fillStyle = P.stripe; poly(ctx, [[-25.5, s * 4.4], [-13, s * 9.7], [2, s * 10.4], [2.3, s * 9.2], [-13, s * 8.5], [-24, s * 3.9]]); ctx.fill();
      javaCup(ctx, -4.6, s * 6.9, 2.05, P.java, P.stripe, s);
      rr(ctx, 3.5, s * 9.5 - (s > 0 ? 2.4 : 0), 2.2, 2.4, 0.8); ctx.fillStyle = '#050506'; ctx.fill();
    }
    gloss(ctx, -6, -8.4, 9, 1.4, 0.6);
    const nose = () => smooth(ctx, [[-14, -5], [6, -5.5], [24, -3.4], [38, -1.6], [39.5, 0], [38, 1.6], [24, 3.4], [6, 5.5], [-14, 5]]);
    nose(); ctx.fillStyle = bodyGrad(ctx, 5.5, P.paint, 1.2); ctx.fill();
    ctx.save(); nose(); ctx.clip();   // Duke's red nose: the tip, and a red chevron back along the top
    ctx.fillStyle = linear(ctx, 0, -2, 0, 2, [[0, shade(P.stripe, -0.3)], [0.35, shade(P.stripe, 0.25)], [1, shade(P.stripe, -0.35)]]); ctx.fillRect(33.2, -4, 8, 8);
    ctx.fillStyle = P.stripe; ctx.beginPath(); ctx.moveTo(31, -1.9); ctx.lineTo(12, -3.2); ctx.lineTo(12, -2.1); ctx.lineTo(31, -0.9); ctx.moveTo(31, 1.9); ctx.lineTo(12, 3.2); ctx.lineTo(12, 2.1); ctx.lineTo(31, 0.9); ctx.fill();
    ctx.restore();
    nose(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.strokeStyle = '#ffffff99'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(30, -1.2); ctx.lineTo(8, -3.2); ctx.stroke();   // highlight along the nose
    // engine cover and airbox behind the driver, a curl of red steam down its spine
    smooth(ctx, [[-30, -1.6], [-14, -4], [-12, 0], [-14, 4], [-30, 1.6]]); ctx.fillStyle = bodyGrad(ctx, 4, P.paint, 1.2); ctx.fill();
    ctx.strokeStyle = P.stripe; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-29, 0); ctx.bezierCurveTo(-25, -2.2, -22, 2.2, -18, 0); ctx.bezierCurveTo(-16.5, -1, -15.8, -1, -15, -0.6); ctx.stroke();
    rr(ctx, -15.5, -2.4, 3.4, 4.8, 1.4); ctx.fillStyle = '#050506'; ctx.fill();
    // cockpit and halo
    ell(ctx, -6, 0, 6, 3.6); ctx.fillStyle = '#0c0d10'; ctx.fill();
    ctx.strokeStyle = '#2b2d33'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(-6, 0, 7.2, 4.6, 0, -1.1, 1.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1.2, 0); ctx.lineTo(5, 0); ctx.stroke();
    for (const s of [-1, 1]) mirror(ctx, 2, s * 6.5, s, P.paint);
    // wings
    rr(ctx, 34.5, -15, 6, 30, 1.6); ctx.fillStyle = CARBON; ctx.fill();
    ctx.fillStyle = P.stripe; ctx.fillRect(35.6, -14, 1.8, 28); ctx.fillStyle = P.paint; ctx.fillRect(38.2, -14, 0.9, 28);
    for (const s of [-1, 1]) { ctx.fillStyle = P.stripe; ctx.fillRect(34, s * 14.3 - 0.9, 7, 1.8); }
    // rear wing: a red main plane with a wisp of white steam across it, carbon endplates
    rr(ctx, -41, -11.5, 7, 23, 1.4); ctx.fillStyle = CARBON; ctx.fill();
    rr(ctx, -40.4, -10.5, 3.4, 21, 0.6); ctx.fillStyle = linear(ctx, -40.4, 0, -37, 0, [[0, shade(P.stripe, -0.25)], [0.5, shade(P.stripe, 0.18)], [1, shade(P.stripe, -0.2)]]); ctx.fill();
    ctx.strokeStyle = '#ffffffd0'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-38.7, -9.5); for (let y = -9.5; y <= 9.5; y += 1) ctx.lineTo(-38.7 + Math.sin(y * 0.75) * 0.9, y); ctx.stroke();
    ctx.fillStyle = '#0a0a0c'; ctx.fillRect(-36.6, -10.5, 1.2, 21);
    for (const s of [-1, 1]) { ctx.fillStyle = '#0a0a0c'; ctx.fillRect(-41.2, s * 11 - 1, 7.5, 2); }
    roundel(ctx, 30, 0, 2.6, P.num);
    rr(ctx, -42, -1.2, 1.4, 2.4, 0.6); ctx.fillStyle = o.brake ? '#ff3b30' : '#7a1010'; ctx.fill();   // rain light
    if (o.brake) taillight(ctx, -41.2, 0, 0.1, 0.1, true);
  },
  // concept hypercar: teardrop fuselage under a bubble canopy, fender pods with tunnels between, a full-width rear deck,
  // shark fin, rear wing on pylons
  hyper(ctx, P, o) {
    // floor and splitter: the dark carbon showing between the pods and the fuselage, strakes down the tunnels
    smooth(ctx, [[41.6, -11], [37, -18], [12, -19], [0, -17], [-10, -17], [-10, 17], [0, 17], [12, 19], [37, 18], [41.6, 11]]);
    ctx.fillStyle = linear(ctx, 0, -19, 0, 19, [[0, '#121317'], [0.5, '#262930'], [1, '#101114']]); ctx.fill(); ctx.strokeStyle = '#3d424b'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.strokeStyle = '#363a42'; ctx.lineWidth = 0.6;
    for (const s of [-1, 1]) for (const k of [7.5, 10]) { ctx.beginPath(); ctx.moveTo(39, s * k * 0.8); ctx.lineTo(6, s * (k + 2.5)); ctx.stroke(); }
    // rear deck: full width, wrapping the rear wheels, sidepod intakes at its leading edge, vents over the wheels
    for (const s of [-1, 1]) tyre(ctx, -25, s * 15.2, 15, 8.4);
    smooth(ctx, [[-2, -9], [-5, -17.5], [-14, -19.8], [-31, -19.8], [-39.5, -17], [-42, -10], [-42, 10], [-39.5, 17], [-31, 19.8], [-14, 19.8], [-5, 17.5], [-2, 9]]);
    ctx.fillStyle = bodyGrad(ctx, 20, P.paint, 0.95); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.9; ctx.stroke();
    for (const s of [-1, 1]) {
      ell(ctx, -4.6, s * 13.4, 1.5, 3.8, s * 0.25); ctx.fillStyle = '#050506'; ctx.fill();                       // intakes
      ctx.strokeStyle = '#0b0c0fcc'; ctx.lineWidth = 0.9;
      for (let x = -31; x <= -20; x += 2.2) { ctx.beginPath(); ctx.moveTo(x, s * 12.5); ctx.lineTo(x + 1.2, s * 17.5); ctx.stroke(); }   // louvres
      ctx.fillStyle = P.deep; ctx.fillRect(-36, s * 18.6 - 0.5, 30, 1);                                            // pinstripe
    }
    roundel(ctx, -13, -14.5, 2.8, P.num, 0); roundel(ctx, -13, 14.5, 2.8, P.num, Math.PI);
    // front fender pods, each with a window over its tyre so you see it steer, louvres behind and an LED strip in front
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(23, s * 14.6);
      smooth(ctx, [[14.5, 0], [11, -5], [-2, -5.7], [-12, -4.6], [-15.5, 0], [-12, 4.6], [-2, 5.7], [11, 5]]);
      ctx.fillStyle = bodyGrad(ctx, 5.7, P.paint, 0.9); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; ctx.stroke();
      ell(ctx, 1, 0, 7.4, 3.3); ctx.fillStyle = '#060708'; ctx.fill();
      ctx.save(); ell(ctx, 1, 0, 7.4, 3.3); ctx.clip(); tyre(ctx, 1, s * 0.3, 13, 7.4, o.steer); ctx.restore();
      ell(ctx, 1, 0, 7.4, 3.3); ctx.strokeStyle = '#00000099'; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.strokeStyle = '#0b0c0fcc'; ctx.lineWidth = 0.8;
      for (let x = -12; x <= -8; x += 1.8) { ctx.beginPath(); ctx.moveTo(x, -2.6); ctx.lineTo(x, 2.6); ctx.stroke(); }
      ctx.lineCap = 'round'; ctx.strokeStyle = '#1a2a38'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(11, -3.4); ctx.quadraticCurveTo(13.6, 0, 11, 3.4); ctx.stroke();
      ctx.strokeStyle = '#eaf8ff'; ctx.lineWidth = 0.9; ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      circ(ctx, 13, 0, 6); ctx.fillStyle = radial(ctx, 13, 0, 0, 13, 0, 6, [[0, '#cfeaff40'], [1, '#cfeaff00']]); ctx.fill();
      ctx.restore();
      ctx.restore();
    }
    // fuselage: needle nose into the canopy, tapering into the engine cover
    smooth(ctx, [[40.5, -2.2], [30, -4], [16, -6.6], [6, -9], [-6, -9], [-20, -7], [-36, -4], [-41, -2], [-41, 2], [-36, 4], [-20, 7], [-6, 9], [6, 9], [16, 6.6], [30, 4], [40.5, 2.2]]);
    ctx.fillStyle = bodyGrad(ctx, 9, P.paint, 1.1); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; ctx.stroke();
    // twin racing stripes down the nose and over the engine cover
    ctx.fillStyle = P.stripe;
    for (const s of [-1, 1]) {
      poly(ctx, [[39.5, s * 0.5], [14, s * 1.4], [14, s * 2.7], [39.5, s * 1.3]]); ctx.fill();
      poly(ctx, [[-11, s * 1.6], [-39, s * 0.6], [-39, s * 1.5], [-11, s * 3]]); ctx.fill();
    }
    // splitter lip
    rr(ctx, 40.2, -11, 1.6, 22, 0.8); ctx.fillStyle = '#2e3138'; ctx.fill();
    for (const s of [-1, 1]) mirror(ctx, 7, s * 8.6, s, P.paint);
    // bubble canopy: tinted glass in a thin frame, a sky reflection along the top-left
    ell(ctx, 1.5, 0, 11.5, 6.8); ctx.fillStyle = glass(ctx, -10, 13); ctx.fill(); ctx.strokeStyle = '#0b0d10'; ctx.lineWidth = 1; ctx.stroke();
    ctx.save(); ell(ctx, 1.5, 0, 11.5, 6.8); ctx.clip();
    ell(ctx, 4, -3.4, 7.5, 1.6, -0.1); ctx.fillStyle = '#ffffff40'; ctx.fill();
    circ(ctx, 9, -2.6, 1.1); ctx.fillStyle = '#ffffffaa'; ctx.fill();
    ctx.restore();
    // shark fin from the canopy back to the wing
    rr(ctx, -36, -0.7, 26, 1.4, 0.7); ctx.fillStyle = P.deep; ctx.fill(); ctx.fillStyle = '#ffffff55'; ctx.fillRect(-35, -0.5, 24, 0.4);
    // rear wing on two swan-neck pylons, endplates, and the full-width LED tail bar behind it
    for (const s of [-1, 1]) { rr(ctx, -34, s * 5 - 0.8, 4, 1.6, 0.6); ctx.fillStyle = '#0a0a0c'; ctx.fill(); }
    rr(ctx, -39.6, -18.6, 6.4, 37.2, 1.6); ctx.fillStyle = CARBON; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.fillStyle = P.paint; ctx.fillRect(-38.8, -17.6, 2.4, 35.2); ctx.fillStyle = P.stripe; ctx.fillRect(-36, -17.6, 0.8, 35.2);
    for (const s of [-1, 1]) { ctx.fillStyle = '#0a0a0c'; ctx.fillRect(-40, s * 18.6 - 1, 7.4, 2); }
    rr(ctx, -42, -16, 1.4, 32, 0.7); ctx.fillStyle = o.brake ? '#ff3b30' : '#8e1414'; ctx.fill();
    if (o.brake) for (const y of [-11, 0, 11]) taillight(ctx, -41.3, y, 0.1, 0.1, true);
  },
  // monster truck: four huge tyres on long-travel coilovers, a lifted pickup body with an open roll-cage cab
  truck(ctx, P, o) {
    ctx.fillStyle = '#16171b'; rr(ctx, -34, -4, 66, 8, 2); ctx.fill();                                             // chassis
    for (const x of [-25, 25]) { tube(ctx, [[x, -14], [x, 14]], 3.4, '#3a3d44'); }                                 // axles
    for (const s of [-1, 1]) for (const x of [-25, 25]) tube(ctx, [[x + 4, s * 8], [x + 2, s * 3]], 2.4, P.rust || '#e2a91b'); // coilovers
    for (const s of [-1, 1]) { tyre(ctx, -25, s * 13.6, 27, 12.8, 0, true); tyre(ctx, 25, s * 13.6, 27, 12.8, o.steer, true); }
    // body: bed, cab, hood
    smooth(ctx, [[-35, -10], [-10, -11.5], [16, -11.5], [34, -9.5], [36.5, 0], [34, 9.5], [16, 11.5], [-10, 11.5], [-35, 10], [-36.5, 0]]);
    ctx.fillStyle = bodyGrad(ctx, 12, P.paint, 1.1); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke();
    if (P.rust) for (const s of [-1, 1]) {   // a Rust-orange flash down each flank, pointed at the nose
      poly(ctx, [[-34.5, s * 9.2], [14, s * 10.4], [32, s * 7.4], [14, s * 9.1], [-34.5, s * 8.2]]); ctx.fillStyle = P.rust; ctx.fill();
    }
    gloss(ctx, 23, -5.5, 10, 2.6, 0.5);
    rr(ctx, -33, -8.5, 22, 17, 2); ctx.fillStyle = linear(ctx, -33, 0, -11, 0, [[0, '#18191d'], [1, '#2a2c32']]); ctx.fill();   // bed
    ctx.strokeStyle = '#00000080'; ctx.lineWidth = 0.6; for (let y = -6; y <= 6; y += 3) { ctx.beginPath(); ctx.moveTo(-32, y); ctx.lineTo(-12, y); ctx.stroke(); }
    rr(ctx, -15, -8, 3, 16, 1); ctx.fillStyle = '#7d848d'; ctx.fill();                                              // toolbox
    rr(ctx, -9, -9.5, 18, 19, 3); ctx.fillStyle = '#16171b'; ctx.fill();                                            // open cab
    seatPad(ctx, 4, -4.5, 4.6, 4.2); seatPad(ctx, 4, 4.5, 4.6, 4.2);
    tube(ctx, [[-8, -10.5], [-8, 10.5]], 2, P.trim); tube(ctx, [[9, -10.5], [9, 10.5]], 2, P.trim);
    for (const s of [-1, 1]) tube(ctx, [[-8, s * 9.5], [9, s * 9.5]], 1.6, P.trim);
    smooth(ctx, [[10, -10], [13, -10.5], [14, 0], [13, 10.5], [10, 10], [11.5, 0]]); ctx.fillStyle = glass(ctx, 10, 14); ctx.fill();
    for (let y = -7.5; y <= 7.5; y += 2.5) { circ(ctx, 9.8, y, 0.9); ctx.fillStyle = '#fffbe6'; ctx.fill(); }           // light bar
    rr(ctx, 20, -3.5, 10, 7, 2); ctx.fillStyle = linear(ctx, 0, -3.5, 0, 3.5, [[0, shade(P.paint, -0.4)], [0.5, shade(P.paint, 0.2)], [1, shade(P.paint, -0.4)]]); ctx.fill();   // hood scoop
    rr(ctx, 28, -2.5, 2, 5, 0.6); ctx.fillStyle = '#050506'; ctx.fill();
    for (const s of [-1, 1]) mirror(ctx, 12, s * 11.5, s, P.paint);
    for (const s of [-1, 1]) headlight(ctx, 34, s * 7, 2);
    if (P.rust) {   // bull bar as a pair of crab pincers, powder-coated Rust orange, nearly meeting at the middle
      for (const s of [-1, 1]) {   // each: a round palm on the corner, two fingers reaching in toward the middle
        ctx.save(); ctx.translate(36.2, s * 9.6); ctx.scale(1, s); ctx.rotate(0.35 - Math.PI / 2); ctx.scale(1, -1);   // mirrored for the two sides
        ctx.beginPath(); ctx.moveTo(1.2, -3);
        ctx.quadraticCurveTo(5.6, -3.4, 7.2, -0.4); ctx.quadraticCurveTo(4.6, -1.6, 2.4, -0.4);   // the long finger
        ctx.quadraticCurveTo(4.4, 0.5, 6, 1.7); ctx.quadraticCurveTo(4.4, 3.4, 1, 3);             // the short one
        ctx.arc(0, 0, 3.2, 1.25, 5.07); ctx.closePath();
        fillStroke(ctx, radial(ctx, -1, -1.4, 0.4, 0, 0, 7, [[0, shade(P.rust, 0.3)], [0.5, P.rust], [1, shade(P.rust, -0.35)]]), shade(P.rust, -0.6), 0.6);
        ctx.strokeStyle = '#ffffff90'; ctx.lineWidth = 0.55; ctx.beginPath(); ctx.arc(0, 0, 2.2, 3.5, 4.6); ctx.stroke();
        ctx.restore();
      }
    } else { rr(ctx, 35.5, -11, 3, 22, 1.4); ctx.fillStyle = linear(ctx, 0, -11, 0, 11, [[0, '#8a9099'], [0.5, CHROME], [1, '#8a9099']]); ctx.fill(); }   // bull bar
    for (const s of [-1, 1]) taillight(ctx, -35.6, s * 7.5, 1.4, 3.2, o.brake);
    if (P.rust) { cogRoundel(ctx, -1, -11.2, 2.5, P.num, P.rust, 0); cogRoundel(ctx, -1, 11.2, 2.5, P.num, P.rust, Math.PI); }
    else { roundel(ctx, -1, -11.6, 2.6, P.num, 0); roundel(ctx, -1, 11.6, 2.6, P.num, Math.PI); }
  },
  // cab-over tractor and a 20 ft container: corrugated roof, corner castings, a sun-roof hatch in the cab for Docky
  van(ctx, P, o) {
    for (const s of [-1, 1]) { tyre(ctx, 37, s * 17.6, 10, 5, o.steer); tyre(ctx, 18, s * 17.6, 10, 5); for (const x of [-30, -40]) tyre(ctx, x, s * 17.6, 9.5, 5); }
    rr(ctx, 20, -3, 8, 6, 1); ctx.fillStyle = '#1a1b1f'; ctx.fill();                                                 // coupling
    // container
    const bx = -47, bw = 68;
    rr(ctx, bx, -18.6, bw, 37.2, 1.6); ctx.fillStyle = bodyGrad(ctx, 18.6, P.box, 0.5); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.save(); rr(ctx, bx, -18.6, bw, 37.2, 1.6); ctx.clip();
    for (let x = bx + 3; x < bx + bw - 2; x += 3.2) { ctx.fillStyle = '#00000026'; ctx.fillRect(x, -18.6, 1.3, 37.2); ctx.fillStyle = '#ffffff1c'; ctx.fillRect(x + 1.3, -18.6, 0.8, 37.2); }
    ctx.fillStyle = '#6b3a2266'; for (const [x, y, r] of [[-44, -14, 2.4], [-20, 15.5, 2], [10, -15.8, 1.8], [-38, 13, 1.6]]) { ell(ctx, x, y, r * 2.2, r); ctx.fill(); }   // a few rust streaks along the rails
    ctx.fillStyle = '#ffffff2a'; ctx.fillRect(bx, -18.6, bw, 2.2);   // the sunlit top rail
    ctx.fillStyle = '#0000002e'; ctx.fillRect(bx, 16.6, bw, 2);
    ctx.restore();
    for (const sx of [bx + 1.6, bx + bw - 1.6]) for (const s of [-1, 1]) { rr(ctx, sx - 1.6, s * 17 - 1.6, 3.2, 3.2, 0.6); ctx.fillStyle = shade(P.box, -0.6); ctx.fill(); }
    // stencils: the box number, and a white whale's tail (Docker's) by it
    ctx.save(); ctx.translate(-20, 0); ctx.rotate(Math.PI / 2); ctx.fillStyle = '#f2f4f2d8'; ctx.font = '700 5px "Fredoka", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('MOBY 204811', 0, 0); ctx.restore();
    ctx.save(); ctx.translate(-35, 0); ctx.rotate(Math.PI / 2); ctx.fillStyle = '#f2f4f2d8';   // upright like the text: flukes toward the nose
    ctx.beginPath(); ctx.moveTo(-1.2, 3.4); ctx.lineTo(-0.9, 1.2); ctx.quadraticCurveTo(-5, 1.6, -8.8, -2.2); ctx.quadraticCurveTo(-4.4, -1.8, 0, -0.5);
    ctx.quadraticCurveTo(4.4, -1.8, 8.8, -2.2); ctx.quadraticCurveTo(5, 1.6, 0.9, 1.2); ctx.lineTo(1.2, 3.4); ctx.quadraticCurveTo(0, 4.1, -1.2, 3.4); ctx.fill();
    ctx.restore();
    // exhaust stacks behind the cab
    for (const s of [-1, 1]) { circ(ctx, 22.4, s * 15.8, 1.9); ctx.fillStyle = radial(ctx, 21.8, s * 15.8 - 0.7, 0, 22.4, s * 15.8, 1.9, [[0, '#ffffff'], [0.5, CHROME], [1, '#6b727b']]); ctx.fill(); circ(ctx, 22.4, s * 15.8, 0.8); ctx.fillStyle = '#1a1b1f'; ctx.fill(); }
    // cab
    smooth(ctx, [[24, -18.5], [44, -18.5], [47, -14], [47.5, 0], [47, 14], [44, 18.5], [24, 18.5], [23, 0]]);
    ctx.fillStyle = bodyGrad(ctx, 18.5, P.paint, 0.8); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke();
    smooth(ctx, [[26, -15], [34, -16], [36, 0], [34, 16], [26, 15], [25, 0]]); ctx.fillStyle = bodyGrad(ctx, 16, shade(P.paint, -0.06), 0.6); ctx.fill();   // wind deflector
    ctx.strokeStyle = '#00000030'; ctx.lineWidth = 0.6; ctx.stroke();
    gloss(ctx, 40, -11, 6, 4, 0.5);
    rr(ctx, 12.5, -7, 9, 14, 3); ctx.fillStyle = '#18191d'; ctx.fill();   // roof hatch (seat at +18)
    seatPad(ctx, 17, 0, 5.5, 5.5);
    smooth(ctx, [[44, -17], [46.5, -15], [47.2, 0], [46.5, 15], [44, 17], [45, 0]]); ctx.fillStyle = glass(ctx, 44, 47.5); ctx.fill();
    ctx.fillStyle = linear(ctx, 0, -18, 0, 18, [[0, shade(P.stripe, -0.25)], [0.3, shade(P.stripe, 0.2)], [1, shade(P.stripe, -0.3)]]); ctx.fillRect(37.4, -18.4, 2.6, 36.8);
    ctx.fillStyle = P.trim; ctx.fillRect(40, -18.4, 0.7, 36.8);
    for (let y = -10; y <= 10; y += 5) { circ(ctx, 42.6, y, 0.9); ctx.fillStyle = '#ffb02e'; ctx.fill(); }   // amber marker lights along the roof
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) mirror(ctx, 44, s * 18.5, s, '#2a2c31');
    for (const s of [-1, 1]) headlight(ctx, 46.8, s * 14, 1.6);
    for (const s of [-1, 1]) taillight(ctx, -47, s * 15, 1.4, 4.5, o.brake);
  },
};

// the footprint each drawing was made for; drawCar stretches it to the body's real BODIES footprint
export const DESIGN = { kart: [70, 34], ekart: [62, 34], buggy: [62, 30], bubble: [62, 36], beetle: [64, 34], sports: [68, 38], sled: [78, 28], f1: [82, 30], hyper: [84, 40], truck: [80, 40], van: [94, 40] };
// how tall each one stands: a monster truck's shadow falls further away, and its driver sits up higher
export const HEIGHT = { kart: 0.5, ekart: 0.6, buggy: 0.8, bubble: 1, beetle: 1, sports: 0.9, sled: 0.4, f1: 0.4, hyper: 0.35, truck: 2, van: 1.8 };
export const RIDE_UP = { ekart: 1, truck: 9, van: 6, bubble: 2, beetle: 2, sports: 2 };
// the whole car, centred, nose +x, in world units. o: steer (front-wheel angle, rad), brake (tail lights on).
// When players share a racer, each kart wears its player's colour (PCOL) plus a ground ring (render.js), and a bot on a
// shared racer gets a darker, plainer paint. twinLook gives { paint, ring } or null for an unshared racer; livery(ch, look)
// is the paint (o.look in drawCar).
const TWINS = new WeakMap(), LIVERY = new Map();
export function twinLook(race, c) {
  let n = TWINS.get(race); if (!n) { n = new Map(); for (const k of race.cars) n.set(k.ch, (n.get(k.ch) || 0) + 1); TWINS.set(race, n); }
  if (!(n.get(c.ch) > 1)) return null;
  return c.human && PCOL[c.pIndex] ? { paint: PCOL[c.pIndex], ring: PCOL[c.pIndex] } : { paint: 'bot', ring: null };
}
export function livery(ch, look) {
  const key = ch.id + '|' + look.paint; let P = LIVERY.get(key); if (P) return P;
  const B = CAR_PAINT[ch.id] || DEFAULT_PAINT, bot = look.paint === 'bot', col = bot ? shade(B.paint, -0.42) : shade(look.paint, -0.08);
  P = { ...B, paint: col, ...(B.box ? { box: bot ? shade(B.box, -0.35) : shade(look.paint, -0.3) } : {}), ...(bot ? { stripe: shade(B.stripe, -0.3), stripe2: B.stripe2 && shade(B.stripe2, -0.3) } : {}) };
  LIVERY.set(key, P); return P;
}
export function drawCar(ctx, ch, o = {}) {
  const body = BODIES[ch.body] ? ch.body : 'kart', P = o.look ? livery(ch, o.look) : CAR_PAINT[ch.id] || DEFAULT_PAINT;
  const B = BODIES[body], D = DESIGN[body];
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.scale(B.L / D[0], B.W / D[1]);
  DRAW[body](ctx, P, { steer: o.steer || 0, brake: !!o.brake });
  ctx.restore();
}
// a soft drop shadow for a car, cast down-right by the sun (call in screen-aligned space, rotated by heading)
export function drawCarShadow(ctx, ch, heading, lift = 0) {
  const B = BODIES[ch.body] || BODIES.kart, h = HEIGHT[ch.body] ?? 1, ox = 2 + h * 3 + lift * 22, oy = 3 + h * 4 + lift * 30, s = 1 - lift * 0.25;
  ctx.save(); ctx.translate(ox, oy); ctx.rotate(heading); ctx.scale(s, s);
  ctx.fillStyle = `rgba(10,12,20,${0.22 - lift * 0.1})`;
  for (const g of [3, 0]) { rr(ctx, -B.L / 2 - g, -B.W / 2 - g, B.L + g * 2, B.W + g * 2, Math.min(14, B.W / 2)); ctx.fill(); }
  ctx.restore();
}
