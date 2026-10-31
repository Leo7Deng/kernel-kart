// The mascots as their real logo characters, drawn upright on screen on a layer above the cars (not turned with them).
// (0, 0) is the seat; about 46 units tall toward -y, spilling over the car (the car is still the hitbox). Side-on ones
// (Docky, Swifty) flip to face their heading; the rest face you and look where they're going.
import { TAU, clamp } from '../core.js';
import { ICONS } from './icons.js';
import { ballGrad, circ, ell, fillStroke, linear, poly, radial, shade, smooth } from './paint.js';

export const MASCOT_H = 48;   // roughly how far above the seat the tallest one reaches
// where each one's face is above the seat, for a face in a circle (the HUD): the crab and the swift sit low, the rest about 32
export const FACE_Y = { gopher: 32, ferris: 21, pyth: 31, octo: 32, tux: 32, duke: 28, docky: 27, swifty: 26, cpp: 32, droid: 29 };
const SIDE = { docky: true, swifty: true };

// ---------------------------------------------------------------- eyes
// S: { look: [x, y] in -1..1, blink, dizzy, ko, happy, t }
function eye(ctx, S, x, y, rx, ry, o = {}) {
  const ink = o.ink || '#141418', line = o.line || ink, lw = o.lw ?? 1.1;
  if (S.happy) { ctx.strokeStyle = line; ctx.lineWidth = lw * 1.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y + ry * 0.35, rx * 0.8, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); return; }
  if (S.blink) { ctx.strokeStyle = line; ctx.lineWidth = lw * 1.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - rx, y); ctx.quadraticCurveTo(x, y + ry * 0.45, x + rx, y); ctx.stroke(); return; }
  if (!o.noSclera) { ell(ctx, x, y, rx, ry); fillStroke(ctx, o.sclera || '#ffffff', line, lw); }
  if (S.ko) {   // knocked out: a cross in each eye, bigger than the pupil so it reads on the small-eyed ones too
    const k = Math.max(rx, ry) * (o.noSclera ? 1.15 : 0.62), w = Math.max(1.1, Math.min(rx, ry) * 0.3);
    ctx.strokeStyle = ink; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath();
    ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k); ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k); ctx.stroke(); return;
  }
  if (S.dizzy) {
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(0.7, rx * 0.16); ctx.beginPath();
    for (let k = 0; k <= 26; k++) { const a = k * 0.55 + S.t * 9, r = k / 26 * Math.min(rx, ry) * 0.85; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.stroke(); return;
  }
  const pr = Math.min(rx, ry) * (o.pupil ?? 0.52), b = o.bias || [0, 0];
  const lx = clamp(S.look[0] + b[0], -1, 1), ly = clamp(S.look[1] + b[1], -1, 1);
  const px = o.noSclera ? x + lx * rx * 0.12 : x + lx * (rx - pr) * 0.85, py = o.noSclera ? y + ly * ry * 0.12 : y + ly * (ry - pr) * 0.85;
  if (o.noSclera) { ell(ctx, x, y, rx, ry); fillStroke(ctx, ink, o.line, lw); }
  else { ell(ctx, px, py, pr * (o.tall || 1) / (o.tall ? 1.15 : 1), pr * (o.tall || 1)); ctx.fillStyle = ink; ctx.fill(); }
  const gr = (o.noSclera ? Math.min(rx, ry) * 0.42 : pr * 0.42);
  circ(ctx, px - gr * 0.9 + (o.noSclera ? lx * rx * 0.2 : 0), py - gr * 1.1 + (o.noSclera ? ly * ry * 0.2 : 0), gr); ctx.fillStyle = '#ffffff'; ctx.fill();
}
// a tapering limb: a polyline drawn as an outline stroke then a fill stroke
function limb(ctx, pts, w, fill, line, lw = 1.2) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  poly(ctx, pts, false); ctx.strokeStyle = line; ctx.lineWidth = w + lw * 2; ctx.stroke(); ctx.strokeStyle = fill; ctx.lineWidth = w; ctx.stroke();
}
// a smooth curve through points (quadratic through midpoints, open)
function curve(ctx, pts) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; ctx.quadraticCurveTo(pts[i][0], pts[i][1], i === pts.length - 2 ? pts[i + 1][0] : mx, i === pts.length - 2 ? pts[i + 1][1] : my); }
}
// a tapered tentacle/tail: a list of points with widths, drawn as an outlined ribbon of circles + segments
function ribbon(ctx, pts, w0, w1, fill, line, lw = 1.1) {
  const n = pts.length;
  for (const [col, extra] of [[line, lw * 2], [fill, 0]]) {
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round';
    for (let i = 0; i < n - 1; i++) { const w = w0 + (w1 - w0) * i / (n - 1) + extra; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke(); }
  }
}

// ---------------------------------------------------------------- the cast
const M = {
  // Ferris (Rust): an orange crab, spiked half-dome shell, two big claws up, little pointed legs
  ferris(ctx, S) {
    const OR = '#f74c00', DK = '#b03500', LN = '#4b1600', t = S.t;
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {          // legs
      const bx = s * (9 + k * 4), by = -5 + k * 0.5, wig = Math.sin(t * 9 + k + s) * 0.8;
      limb(ctx, [[bx, by], [bx + s * (6 + k), by + 3 + wig], [bx + s * (8 + k * 0.5), by + 7 + wig]], 2.4, DK, LN, 1);
    }
    const open = 0.25 + 0.2 * Math.max(0, Math.sin(t * 3.1));   // snip snip
    for (const s of [-1, 1]) {                                      // arms and claws
      limb(ctx, [[s * 16, -11], [s * 24, -13], [s * 27, -19]], 3.4, OR, LN);
      ctx.save(); ctx.translate(s * 28, -23); ctx.scale(s, 1);
      ctx.save(); ctx.rotate(open); ell(ctx, 2, -5, 3, 6.5); fillStroke(ctx, ballGrad(ctx, 2, -5, 6.5, OR), LN, 1.2); ctx.restore();       // outer finger
      ctx.save(); ctx.rotate(-open - 0.1); ell(ctx, -2.5, -4.5, 2.6, 6); fillStroke(ctx, ballGrad(ctx, -2.5, -4.5, 6, OR), LN, 1.2); ctx.restore();   // inner finger
      ell(ctx, 0, 0, 6, 5.6); fillStroke(ctx, ballGrad(ctx, 0, 0, 6, OR), LN, 1.2);
      ctx.restore();
    }
    // shell: a half dome, spiked along the top
    const cx = 0, cy = -6, rx = 20.5, ry = 19.5, A0 = Math.PI * 1.07, A1 = Math.PI * 1.93, n = 9;
    const P = (a, k) => [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
    ctx.beginPath(); ctx.moveTo(cx - rx, cy + 0.5); ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, A0);
    for (let i = 0; i < n; i++) { const a = A0 + (i + 0.5) * (A1 - A0) / n, b = A0 + (i + 1) * (A1 - A0) / n; const p = P(a, 1.24), q = P(b, 1); ctx.lineTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
    ctx.ellipse(cx, cy, rx, ry, 0, A1, TAU); ctx.quadraticCurveTo(0, cy + 6, cx - rx, cy + 0.5); ctx.closePath();
    ctx.lineJoin = 'round';
    fillStroke(ctx, radial(ctx, -7, -19, 1, 0, -10, 26, [[0, '#ff9a5a'], [0.45, OR], [1, DK]]), LN, 1.5);
    ctx.save(); ctx.clip(); ell(ctx, 0, 1, 24, 6); ctx.fillStyle = '#00000022'; ctx.fill(); ctx.restore();   // underside in shade
    // two glossy black eyes on the shell, a little smile
    for (const s of [-1, 1]) eye(ctx, S, s * 6.8, -18.5, 3.9, 5, { noSclera: true, ink: '#121212', line: LN, lw: 0.8 });
    ctx.strokeStyle = LN; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, -11.5, 3.6, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
  },
  // Go gopher (Renée French): a pale-blue bean with huge goggly eyes, a tan muzzle, a dark nose and two buck teeth
  gopher(ctx, S) {
    const B = '#79d0e2', LN = '#1f3a44', TAN = '#f3d3ad';
    for (const s of [-1, 1]) { circ(ctx, s * 11.5, -38.5, 4.4); fillStroke(ctx, ballGrad(ctx, s * 11.5, -38.5, 4.4, B), LN, 1.3); }   // ears
    smooth(ctx, [[-16, -2], [-18, -22], [-13, -40], [0, -45], [13, -40], [18, -22], [16, -2], [0, 1]]);
    fillStroke(ctx, radial(ctx, -6, -32, 2, 0, -20, 28, [[0, '#a6e4f0'], [0.5, B], [1, '#4fa8bd']]), LN, 1.5);
    for (const s of [-1, 1]) { ell(ctx, s * 14.5, -9, 3.6, 2.8, s * 0.5); fillStroke(ctx, TAN, LN, 1.1); }                        // paws
    eye(ctx, S, 7.6, -31, 8.4, 8.6, { line: LN, lw: 1.3, pupil: 0.32, bias: [0.35, 0.05] });
    eye(ctx, S, -7.2, -31.5, 8.4, 8.6, { line: LN, lw: 1.3, pupil: 0.32, bias: [-0.25, 0.1] });
    ell(ctx, 0, -19.5, 7.6, 4.9); fillStroke(ctx, TAN, LN, 1.2);                                                                // muzzle
    rr2(ctx, -2.7, -17.2, 5.4, 4.6, 1); fillStroke(ctx, '#ffffff', LN, 1); ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(0, -12.8); ctx.lineWidth = 0.8; ctx.stroke();   // teeth
    ell(ctx, 0, -22.4, 3.5, 2.3); fillStroke(ctx, '#3b2416', LN, 1); circ(ctx, -1.1, -23.1, 0.8); ctx.fillStyle = '#ffffffaa'; ctx.fill();   // nose
  },
  // Python: a blue snake with a yellow belly (the logo's two colours), coiled in the seat with its head up
  pyth(ctx, S) {
    const B = '#3776ab', BD = '#1f4d78', Y = '#ffd43b', YD = '#d9a300', LN = '#122b44', t = S.t;
    const sw = Math.sin(t * 2.2) * 1.5;
    ribbon(ctx, [[14, -3], [22, -2], [27, -6], [26, -11], [22, -11]], 4.4, 1.6, Y, LN);                                     // tail tip
    ell(ctx, 0, -5, 19, 6.8); fillStroke(ctx, linear(ctx, 0, -12, 0, 2, [[0, '#5d9bd1'], [0.5, B], [1, BD]]), LN, 1.3);
    ell(ctx, 0, -2.6, 14.5, 2.4); ctx.fillStyle = Y; ctx.fill();
    ell(ctx, 1, -11.5, 14.5, 5.8); fillStroke(ctx, linear(ctx, 0, -17, 0, -6, [[0, '#5d9bd1'], [0.5, B], [1, BD]]), LN, 1.3);
    ell(ctx, 1, -9.4, 10.5, 2); ctx.fillStyle = Y; ctx.fill();
    // neck, swaying
    ctx.beginPath(); ctx.moveTo(-5, -13); ctx.quadraticCurveTo(-6 + sw, -22, -5 + sw, -31); ctx.lineTo(5 + sw, -31); ctx.quadraticCurveTo(6 + sw, -22, 5, -13); ctx.closePath();
    fillStroke(ctx, linear(ctx, -6, 0, 6, 0, [[0, BD], [0.4, '#5d9bd1'], [1, BD]]), LN, 1.3);
    ctx.beginPath(); ctx.moveTo(-2.4, -13); ctx.quadraticCurveTo(-2.4 + sw, -22, -2.2 + sw, -29); ctx.lineTo(2.2 + sw, -29); ctx.quadraticCurveTo(2.4 + sw, -22, 2.4, -13); ctx.closePath(); ctx.fillStyle = Y; ctx.fill();
    ctx.strokeStyle = YD; ctx.lineWidth = 0.7; for (let y = -15; y > -29; y -= 2.6) { const x = sw * (-y - 13) / 18; ctx.beginPath(); ctx.moveTo(-2.2 + x, y); ctx.lineTo(2.2 + x, y); ctx.stroke(); }
    // head
    ctx.save(); ctx.translate(sw, 0);
    if ((t * 0.8) % 2 < 0.35) { ctx.strokeStyle = '#e5484d'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, -29); ctx.lineTo(0, -24); ctx.lineTo(-1.8, -21.8); ctx.moveTo(0, -24); ctx.lineTo(1.8, -21.8); ctx.stroke(); }
    smooth(ctx, [[-12, -34], [-9, -42], [0, -44], [9, -42], [12, -34], [8, -28.5], [0, -27.5], [-8, -28.5]]);
    fillStroke(ctx, radial(ctx, -4, -40, 1, 0, -35, 13, [[0, '#6aa8dc'], [0.55, B], [1, BD]]), LN, 1.4);
    ell(ctx, 0, -31, 8, 3.6); fillStroke(ctx, Y, LN, 1.1);
    for (const s of [-1, 1]) { circ(ctx, s * 1.8, -32.4, 0.6); ctx.fillStyle = LN; ctx.fill(); }
    for (const s of [-1, 1]) eye(ctx, S, s * 5, -37.5, 3.7, 3.9, { line: LN, lw: 1.1, pupil: 0.55, tall: 1.2 });
    ctx.restore();
  },
  // Octocat (Mona): a charcoal cat head with pointed ears round a peach face, on an octopus body with spiral tentacles
  octo(ctx, S) {
    const D = '#2d333b', LN = '#0d1117', FACE = '#f7cfb6', FLN = '#4a2a1f', t = S.t;
    // a tentacle: it curls tighter and tighter toward its tip (the heading turns faster along it), thick at the root
    const tentacle = (s, bx, by, a0, len, turn, w0, k) => {
      const n = 18, pts = []; let x = bx, y = by, a = a0;
      const sway = Math.sin(t * 2.6 + k * 1.9) * 0.35;
      for (let i = 0; i <= n; i++) {
        pts.push([s * x, y]); const f = i / n;
        a += (turn + sway) * 3 * f * f / n; const ds = len / n * (1.35 - 0.75 * f);
        x += Math.cos(a) * ds; y += Math.sin(a) * ds;
      }
      ribbon(ctx, pts, w0, 1.3, D, LN, 1);
      ctx.strokeStyle = '#5d6672'; ctx.lineCap = 'round';   // a sheen along the top of it, lit from the top left
      for (let i = 1; i < n * 0.7; i++) { const w = w0 + (1.3 - w0) * i / n; ctx.lineWidth = w * 0.28; ctx.beginPath(); ctx.moveTo(pts[i][0] - w * 0.12, pts[i][1] - w * 0.26); ctx.lineTo(pts[i + 1][0] - w * 0.12, pts[i + 1][1] - w * 0.26); ctx.stroke(); }
    };
    for (const s of [-1, 1]) tentacle(s, 7, -11, 0.25, 25, -4.3, 6, s + 1);         // outer: out to the side, curling up
    for (const s of [-1, 1]) tentacle(s, 4, -8, Math.PI / 2 - 0.55, 19, -4.6, 6, s + 4);             // inner: down and out, curling outward
    ell(ctx, 0, -11, 10, 6.5); fillStroke(ctx, ballGrad(ctx, 0, -11, 10, D, 0.9), LN, 1.2);
    tentacle(1, 0, -7, Math.PI / 2, 12, -4.4, 5.6, 7);                                                // the middle one, curling to the right
    // head and ears in one outline
    const head = () => {
      ctx.beginPath(); ctx.moveTo(-17.8, -26);
      ctx.bezierCurveTo(-18.6, -32, -17.6, -36.5, -15.2, -40); ctx.quadraticCurveTo(-16.4, -45, -15.6, -49.6);
      ctx.quadraticCurveTo(-10.6, -46.8, -7, -42.6); ctx.quadraticCurveTo(0, -44.6, 7, -42.6);
      ctx.quadraticCurveTo(10.6, -46.8, 15.6, -49.6); ctx.quadraticCurveTo(16.4, -45, 15.2, -40);
      ctx.bezierCurveTo(17.6, -36.5, 18.6, -32, 17.8, -26); ctx.bezierCurveTo(17, -18, 8.5, -15.6, 0, -15.6); ctx.bezierCurveTo(-8.5, -15.6, -17, -18, -17.8, -26);
      ctx.closePath();
    };
    head(); fillStroke(ctx, radial(ctx, -7, -40, 1, 0, -30, 22, [[0, '#5a636e'], [0.4, '#353c45'], [1, '#161a1f']]), null, 0);
    for (const s of [-1, 1]) { poly(ctx, [[s * 14.6, -46.2], [s * 14.2, -40.6], [s * 9.4, -42.6]]); ctx.fillStyle = '#4a3d44'; ctx.fill(); }   // inside the ears
    head(); ctx.strokeStyle = LN; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.save(); head(); ctx.clip(); ctx.strokeStyle = '#ffffff30'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(0, -30, 16.4, 12.6, 0, Math.PI * 1.05, Math.PI * 1.42); ctx.stroke(); ctx.restore();
    // the face: a broad peach mask with a soft wave across the brow
    smooth(ctx, [[-14.2, -25.5], [-13.6, -33.2], [-7.4, -37], [0, -35.4], [7.4, -37], [13.6, -33.2], [14.2, -25.5], [10.4, -18.6], [0, -17.4], [-10.4, -18.6]]);
    fillStroke(ctx, radial(ctx, -4, -31, 1, 0, -26, 15, [[0, '#ffe8da'], [0.55, FACE], [1, '#dda288']]), FLN, 0.9);
    for (const s of [-1, 1]) { ell(ctx, s * 9.6, -22.4, 2.4, 1.3); ctx.fillStyle = 'rgba(240,120,130,0.35)'; ctx.fill(); }   // cheeks
    for (const s of [-1, 1]) eye(ctx, S, s * 5.9, -27.6, S.ko ? 2.2 : 2.7, S.ko ? 2.5 : 3.6, { ink: '#2e1810', noSclera: true, line: '#1d100b', lw: 0.6 });
    smooth(ctx, [[-1.9, -24.6], [1.9, -24.6], [0, -22.4]]); fillStroke(ctx, '#e0768a', FLN, 0.6);                 // nose
    ctx.strokeStyle = '#7c4f42'; ctx.lineWidth = 0.8; ctx.lineCap = 'round'; ctx.beginPath();
    if (S.happy) { ctx.moveTo(-2.6, -22); ctx.quadraticCurveTo(0, -17.6, 2.6, -22); ctx.closePath(); fillStroke(ctx, '#a8434f', FLN, 0.7); }
    else if (S.ko || S.dizzy) { ctx.moveTo(-2.4, -20.6); ctx.quadraticCurveTo(-1.2, -21.8, 0, -20.6); ctx.quadraticCurveTo(1.2, -19.4, 2.4, -20.6); ctx.stroke(); }
    else { ctx.moveTo(0, -22.6); ctx.lineTo(0, -21.6); ctx.arc(-1.2, -21.6, 1.2, 0, Math.PI * 0.85); ctx.moveTo(0, -21.6); ctx.arc(1.2, -21.6, 1.2, Math.PI, Math.PI * 0.15, true); ctx.stroke(); }
    ctx.strokeStyle = '#8a5a4a'; ctx.lineWidth = 0.6;   // whiskers
    for (const s of [-1, 1]) for (const [y0, y1] of [[-23.4, -24.6], [-22, -21.2]]) { ctx.beginPath(); ctx.moveTo(s * 9.2, y0); ctx.quadraticCurveTo(s * 12.4, y0 - 0.2, s * 14, y1); ctx.stroke(); }
  },
  // Tux (Larry Ewing's penguin): glossy black pear, white belly, wide orange beak, waving flipper, flat orange feet
  tux(ctx, S) {
    const LN = '#050507', Y = '#f6b61c', YL = '#ffd86a', YD = '#d27f0e', YLN = '#7a4300', t = S.t;
    const wave = Math.sin(t * 6) * 0.25;
    const flipper = () => smooth(ctx, [[0, -1], [-3.6, 3], [-4.6, 11], [-2.6, 18], [0.4, 20.5], [2.4, 13], [2.8, 4]]);
    const black = () => radial(ctx, -5, -40, 1, 0, -24, 30, [[0, '#5d626e'], [0.3, '#2c2f37'], [1, '#08080b']]);
    ctx.save(); ctx.translate(-12.4, -27); ctx.rotate(0.52); flipper(); fillStroke(ctx, black(), LN, 1.2); ctx.restore();
    ctx.save(); ctx.translate(12, -29); ctx.scale(-1, 1); ctx.rotate(2.35 + wave); flipper(); fillStroke(ctx, linear(ctx, -4, 0, 3, 0, [[0, '#14151a'], [0.6, '#3a3e48'], [1, '#14151a']]), LN, 1.2); ctx.restore();
    // body: one pear, head and all
    const body = () => smooth(ctx, [[-16.6, -3], [-19, -14], [-15.4, -26], [-12.4, -36], [-10.6, -45], [0, -49.4], [10.6, -45], [12.4, -36], [15.4, -26], [19, -14], [16.6, -3], [0, 0.6]]);
    body(); fillStroke(ctx, black(), LN, 1.4);
    ell(ctx, -5.6, -43.4, 3.6, 1.8, -0.55); ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fill();   // gloss on the crown
    // belly, up to the beak, shaded toward the lower right
    ctx.save(); body(); ctx.clip();
    smooth(ctx, [[-12.4, -2.4], [-14.4, -13], [-11.6, -23.4], [-6.6, -29.6], [0, -31], [6.6, -29.6], [11.6, -23.4], [14.4, -13], [12.4, -2.4], [0, -0.6]]);
    ctx.fillStyle = radial(ctx, -4, -20, 1, 0, -14, 17, [[0, '#ffffff'], [0.55, '#f2f0e8'], [1, '#c4c0b2']]); ctx.fill();
    ctx.restore();
    // eyes: two tall white ovals, the pupils peering toward the middle
    for (const s of [-1, 1]) eye(ctx, S, s * 4.4, -38.4, 3.3, 4.7, { line: '#000', lw: 0.8, pupil: 0.52, tall: 1.2, bias: [-s * 0.3, 0.1] });
    // beak: a wide lower mandible, darker, then the upper one over it (open wide when happy, slack when knocked out)
    const drop = S.happy ? 3.6 : S.ko ? 1.8 : 0;
    if (drop) { ell(ctx, 0, -30.2 + drop * 0.5, 5.8, 1 + drop * 0.55); fillStroke(ctx, '#6e1a1e', YLN, 0.7); ell(ctx, 0, -29.6 + drop * 0.75, 3, 0.5 + drop * 0.25); ctx.fillStyle = '#e46a6f'; ctx.fill(); }
    smooth(ctx, [[-7, -31 + drop * 0.6], [0, -30.4 + drop], [7, -31 + drop * 0.6], [3.6, -27.4 + drop], [-3.6, -27.4 + drop]]); fillStroke(ctx, linear(ctx, 0, -31, 0, -27 + drop, [[0, Y], [1, YD]]), YLN, 0.9);
    smooth(ctx, [[-8.4, -31.2], [-4.4, -35], [0, -35.6], [4.4, -35], [8.4, -31.2], [0, -29.6]]); fillStroke(ctx, linear(ctx, 0, -35.6, 0, -29.6, [[0, YL], [1, Y]]), YLN, 0.9);
    for (const s of [-1, 1]) { ell(ctx, s * 1.7, -33.4, 0.75, 0.4); ctx.fillStyle = '#9a5a0a'; ctx.fill(); }   // nostrils
    ell(ctx, -3, -33.9, 2.4, 0.7, -0.15); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
    // feet: flat and orange, three rounded toes each, splayed out
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s * 8, 0.6); ctx.scale(s, 1); ctx.rotate(0.12);
      smooth(ctx, [[-5.4, -1.6], [-2, -2.8], [3.6, -2.6], [7, -1.2], [7.2, 1.4], [5.2, 2.6], [3.2, 1.8], [1.2, 2.9], [-1, 2], [-3.2, 2.8], [-5.6, 1.4]]);
      fillStroke(ctx, linear(ctx, 0, -2.8, 0, 2.8, [[0, YL], [0.5, Y], [1, YD]]), YLN, 1);
      ctx.strokeStyle = YLN; ctx.lineWidth = 0.6; for (const x of [2.2, -0.2]) { ctx.beginPath(); ctx.moveTo(x + 0.2, 1.8); ctx.lineTo(x - 0.4, 0.2); ctx.stroke(); }
      ctx.restore();
    }
  },
  // Duke (Java): a rounded black-and-white tooth with a big round red nose, no eyes, thin waving arms
  duke(ctx, S) {
    const LN = '#0a0a0c', t = S.t, wave = Math.sin(t * 7) * 0.35;
    const shape = () => { ctx.beginPath(); ctx.moveTo(-16.5, -1); ctx.bezierCurveTo(-18, -18, -8, -45, 0, -46); ctx.bezierCurveTo(8, -45, 18, -18, 16.5, -1); ctx.quadraticCurveTo(0, 3.5, -16.5, -1); ctx.closePath(); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = LN; ctx.lineWidth = 2.2;
    ctx.save(); ctx.translate(-12, -14); ctx.rotate(wave); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-9, -3, -12, -14); ctx.stroke(); circ(ctx, -12, -15, 2.1); ctx.fillStyle = LN; ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.moveTo(12, -12); ctx.quadraticCurveTo(20, -10, 22, -4); ctx.stroke(); circ(ctx, 22, -3.4, 2.1); ctx.fillStyle = LN; ctx.fill();
    shape(); ctx.fillStyle = radial(ctx, -6, -14, 1, 0, -8, 22, [[0, '#ffffff'], [0.6, '#f2f2ee'], [1, '#c7c7c0']]); ctx.fill();
    ctx.save(); shape(); ctx.clip();
    ctx.beginPath(); ctx.moveTo(-22, -24.5); ctx.quadraticCurveTo(0, -17, 22, -24.5); ctx.lineTo(22, -50); ctx.lineTo(-22, -50); ctx.closePath();
    ctx.fillStyle = radial(ctx, -5, -38, 1, 0, -32, 18, [[0, '#4a4a52'], [0.45, '#1a1a1e'], [1, '#050506']]); ctx.fill();
    ctx.restore();
    shape(); ctx.strokeStyle = LN; ctx.lineWidth = 1.5; ctx.stroke();
    circ(ctx, 0, -20.5, 6.6); fillStroke(ctx, radial(ctx, -2.2, -23, 0.5, 0, -20.5, 7, [[0, '#ff8a80'], [0.35, '#f0261b'], [1, '#a80d06']]), LN, 1.3);
    circ(ctx, -2.3, -23, 1.7); ctx.fillStyle = '#ffffffcc'; ctx.fill();
  },
  // Docky (Docker's Moby Dock): a blue whale with a stack of shipping containers on its back, side on
  docky(ctx, S) {
    const B = '#2496ed', BD = '#1462ad', LN = '#0a3561', t = S.t;
    // tail flukes
    ctx.lineJoin = 'round';
    smooth(ctx, [[-14, -10], [-20, -15], [-24, -22], [-31, -27], [-26, -22.5], [-25, -30], [-21, -22], [-14, -16]]);
    fillStroke(ctx, linear(ctx, -30, -28, -14, -12, [[0, '#5cb6f5'], [1, BD]]), LN, 1.3);
    // body
    const body = () => smooth(ctx, [[-17, -11], [-12, -21], [4, -23], [17, -22], [25, -15], [25.5, -7], [19, -1.5], [5, 0.5], [-9, -1.5], [-16, -5]]);
    body(); fillStroke(ctx, radial(ctx, 4, -18, 2, 4, -10, 26, [[0, '#62bdf8'], [0.55, B], [1, BD]]), LN, 1.5);
    ctx.save(); body(); ctx.clip(); ell(ctx, 6, 0, 22, 6.2); ctx.fillStyle = '#e8f4fd'; ctx.fill(); ctx.restore();
    body(); ctx.strokeStyle = LN; ctx.lineWidth = 1.5; ctx.stroke();
    ell(ctx, 3, -5, 5, 2.2, 0.45); fillStroke(ctx, BD, LN, 1);                              // flipper
    ctx.strokeStyle = LN; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(24.6, -9); ctx.quadraticCurveTo(19, -6.2, 13, -7.6); ctx.stroke();
    circ(ctx, 17, -9.2, 1.7); ctx.fillStyle = '#ff9fb380'; ctx.fill();
    eye(ctx, S, 15.5, -13.5, 2.5, 2.7, { line: LN, lw: 0.9, pupil: 0.6 });
    // containers: 4 on the back, 3 above, 1 on top
    const box = (x, y) => {
      ctx.beginPath(); ctx.roundRect(x, y, 5.8, 5.2, 0.6);
      fillStroke(ctx, linear(ctx, 0, y, 0, y + 5.2, [[0, '#4fb2f7'], [1, '#1c80d6']]), LN, 0.9);
      ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 0.5; for (let k = 1.5; k < 5.5; k += 1.4) { ctx.beginPath(); ctx.moveTo(x + k, y + 0.9); ctx.lineTo(x + k, y + 4.3); ctx.stroke(); }
    };
    for (let i = 0; i < 4; i++) box(-8 + i * 6.4, -28.6);
    for (let i = 0; i < 3; i++) box(-1.6 + i * 6.4, -34.2);
    box(4.8, -39.8);
    if ((t * 0.6) % 3 < 0.9) {                                                              // spout
      const f = ((t * 0.6) % 3) / 0.9;
      for (const [dx, k] of [[-4, 0.8], [0, 1], [4, 0.8]]) { circ(ctx, 21 + dx * f, -24 - 12 * Math.sin(f * Math.PI) * k, 1.7 * (1 - f * 0.4)); ctx.fillStyle = '#bfe6ff'; ctx.fill(); ctx.strokeStyle = '#1a6fb8'; ctx.lineWidth = 0.6; ctx.stroke(); }
    }
  },
  // Swifty (Swift): the logo's swift as a little racer: orange-to-red, swept wings, forked tail, white throat
  swifty(ctx, S) {
    const LN = '#5a1606', t = S.t, flap = Math.sin(t * 10) * 1.2;
    const grad = () => linear(ctx, 20, -36, -20, -4, [[0, '#fa9a3c'], [1, '#e8402c']]);
    smooth(ctx, [[-8, -12], [-20, -12], [-30, -17], [-19, -8], [-30, -6], [-17, -3], [-6, -6]]);               // forked tail
    fillStroke(ctx, '#d63b26', LN, 1.2);
    smooth(ctx, [[4, -23], [-10, -31 + flap], [-29, -28 + flap], [-12, -24], [0, -19]]); fillStroke(ctx, '#c9361f', LN, 1.2);   // far wing
    smooth(ctx, [[-12, -6], [-6, -16], [4, -27], [10, -36], [19, -36], [23, -29], [19, -20], [9, -8], [-2, -3]]);
    fillStroke(ctx, grad(), LN, 1.5);
    smooth(ctx, [[20, -25], [14, -17], [6, -8], [-4, -5], [3, -11], [11, -20], [16, -27]]); ctx.fillStyle = '#fff4ec'; ctx.fill();   // throat
    smooth(ctx, [[12, -35], [6, -40], [3, -37.5], [8, -34]]); fillStroke(ctx, '#f06a2e', LN, 1);                // crest
    smooth(ctx, [[9, -22], [-4, -26 - flap], [-30, -21 - flap], [-8, -17], [4, -14]]); fillStroke(ctx, linear(ctx, 8, -22, -28, -20, [[0, '#f57c34'], [1, '#c8341c']]), LN, 1.3);   // near wing
    ctx.strokeStyle = '#00000030'; ctx.lineWidth = 0.7; for (const k of [0.3, 0.55, 0.8]) { ctx.beginPath(); ctx.moveTo(4 - 30 * k, -22 + 2 * k); ctx.lineTo(-4 - 26 * k, -18 - 2 * k); ctx.stroke(); }
    poly(ctx, [[21.5, -31.5], [27.5, -29.5], [21.5, -27.2]]); fillStroke(ctx, '#ffc94a', LN, 1);
    eye(ctx, S, 15.6, -30, 3.1, 3.3, { line: LN, lw: 1, pupil: 0.55, bias: [0.4, 0] });
    if (!S.blink && !S.happy) { ctx.strokeStyle = LN; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(12.4, -34.8); ctx.lineTo(18.8, -33); ctx.stroke(); }   // determined brow
  },
  // Lamb (Haskell): a woolly white lamb with a long purple face, floppy ears and a λ on its neckerchief
  lamb(ctx, S) {
    const P = '#5e5086', PL = '#8576b3', LN = '#2a2140', t = S.t;
    const bumps = []; for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; bumps.push([Math.cos(a) * 15, -21 + Math.sin(a) * 16, 6.6]); }
    ctx.beginPath(); for (const [x, y, r] of bumps) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); } ctx.moveTo(15, -21); ctx.arc(0, -21, 15, 0, TAU);
    ctx.strokeStyle = LN; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = radial(ctx, -6, -32, 2, 0, -20, 24, [[0, '#ffffff'], [0.6, '#f1eff4'], [1, '#c9c4d4']]); ctx.fill();
    ctx.strokeStyle = '#d8d3e3'; ctx.lineWidth = 0.8; for (const [x, y] of [[-9, -10], [9, -9], [-11, -24], [11, -26], [0, -6]]) { ctx.beginPath(); ctx.arc(x, y, 2.4, 0.3, 2.6); ctx.stroke(); }
    const flop = Math.sin(t * 5) * 0.12;
    for (const s of [-1, 1]) { ell(ctx, s * 12.5, -30, 6.4, 2.6, s * (0.3 + flop)); fillStroke(ctx, P, LN, 1.1); ell(ctx, s * 13, -29.8, 3.6, 1.1, s * (0.3 + flop)); ctx.fillStyle = '#c792b6'; ctx.fill(); }
    smooth(ctx, [[-7.5, -24], [-7, -33], [0, -36], [7, -33], [7.5, -24], [5.5, -15.5], [0, -14], [-5.5, -15.5]]);
    fillStroke(ctx, radial(ctx, -3, -31, 1, 0, -25, 13, [[0, '#8577b5'], [0.6, P], [1, '#3e3460']]), LN, 1.3);
    for (const [x, y, r] of [[-3.5, -36, 3.4], [3.5, -36, 3.4], [0, -38.5, 3.6]]) { circ(ctx, x, y, r); fillStroke(ctx, '#ffffff', null, 0); }   // forelock
    ctx.strokeStyle = LN; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(-3.5, -36, 3.4, Math.PI * 0.9, Math.PI * 1.9); ctx.arc(0, -38.5, 3.6, Math.PI * 1.1, Math.PI * 1.9); ctx.arc(3.5, -36, 3.4, Math.PI * 1.2, Math.PI * 0.1); ctx.stroke();
    for (const s of [-1, 1]) eye(ctx, S, s * 3.3, -27.8, 2.4, 2.7, { line: LN, lw: 0.9, pupil: 0.58 });
    ell(ctx, 0, -18.4, 4.6, 3.2); ctx.fillStyle = PL; ctx.fill();
    for (const s of [-1, 1]) { ell(ctx, s * 1.5, -19.2, 0.8, 0.55); ctx.fillStyle = LN; ctx.fill(); }
    ctx.strokeStyle = LN; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, -18.6); ctx.lineTo(0, -17); ctx.arc(-1.2, -17, 1.2, 0, Math.PI * 0.8); ctx.moveTo(0, -17); ctx.arc(1.2, -17, 1.2, Math.PI, Math.PI * 0.2, true); ctx.stroke();
    poly(ctx, [[-9.5, -13.2], [9.5, -13.2], [0, -3.5]]); ctx.lineJoin = 'round'; fillStroke(ctx, linear(ctx, 0, -13, 0, -4, [[0, '#9d5b98'], [1, '#6f3a6c']]), LN, 1.1);
    ctx.fillStyle = '#ffffff'; ctx.font = '800 7.5px "Fredoka", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('λ', 0, -9.4);
  },
  // Bugsy: a ladybird, a glossy red dome with black spots under a black head, antennae up
  bugsy(ctx, S) {
    const R = '#e63946', K = '#18181d', LN = '#0a0a0c', t = S.t, bob = Math.sin(t * 4) * 1.2;
    ctx.strokeStyle = K; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 3, -38); ctx.quadraticCurveTo(s * 6, -46, s * (9 + bob * 0.5), -50 + bob); ctx.stroke(); circ(ctx, s * (9 + bob * 0.5), -50.5 + bob, 1.9); ctx.fillStyle = K; ctx.fill(); }
    for (const s of [-1, 1]) limb(ctx, [[s * 13, -12], [s * 19, -9], [s * 21, -5]], 2.2, K, LN, 0.6);
    ell(ctx, 0, -16.5, 16.5, 15.5); fillStroke(ctx, radial(ctx, -6, -24, 1, 0, -16, 19, [[0, '#ff8a92'], [0.35, R], [1, '#8f1520']]), LN, 1.5);
    ctx.strokeStyle = LN; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(0, -1.5); ctx.stroke();
    ctx.fillStyle = K; for (const [x, y, r] of [[-8.5, -19, 3.1], [8.5, -19, 3.1], [-9.5, -9, 2.5], [9.5, -9, 2.5], [-3.8, -11.5, 2], [3.8, -11.5, 2]]) { circ(ctx, x, y, r); ctx.fill(); }
    ell(ctx, -6, -25, 3.6, 1.6, -0.5); ctx.fillStyle = '#ffffff66'; ctx.fill();
    ell(ctx, 0, -32.5, 11, 8.2); fillStroke(ctx, radial(ctx, -4, -36, 1, 0, -32, 11, [[0, '#4a4a54'], [0.5, K], [1, '#000']]), LN, 1.3);
    for (const s of [-1, 1]) { ell(ctx, s * 9.2, -27.6, 2.6, 1.8, s * 0.4); ctx.fillStyle = '#f5f5f0'; ctx.fill(); }
    for (const s of [-1, 1]) eye(ctx, S, s * 4, -34, 3.4, 3.7, { line: LN, lw: 0.9, pupil: 0.55 });
    ctx.strokeStyle = '#f5f5f0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, -29.6, 2.4, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
  },
  // Bugdroid (Android): half-dome head with antennae and white dot eyes, a tin-can body, capsule arms, stubby legs.
  // The logo has no outline, so flat green with only a soft dark line to hold it on the road.
  droid(ctx, S) {
    const G = '#3ddc84', LN = '#0b5a34', t = S.t;
    const fill = (x, y, r) => radial(ctx, x - r * 0.4, y - r * 0.5, r * 0.05, x, y, r * 1.15, [[0, '#8ef0b9'], [0.45, G], [1, '#25a862']]);
    const wave = S.happy ? Math.sin(t * 9) * 0.5 : Math.sin(t * 2.6) * 0.12, droop = S.ko ? 1 : 0;
    // legs: two short capsules under the body, feet resting on the seat
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.roundRect(s * 4.6 - 2.7, -5, 5.4, 7.4, 2.7); fillStroke(ctx, fill(s * 4.6, -2, 4), LN, 1.1); }
    // arms: capsules hanging beside the body (the right one waving when happy, both limp when knocked out)
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s * 14.6, -20.4); ctx.rotate(s < 0 ? (droop ? 0.25 : -wave * 0.4) : (droop ? -0.25 : S.happy ? -2.6 + wave : wave));
      ctx.beginPath(); ctx.roundRect(-2.8, -2.8, 5.6, 15.4, 2.8); fillStroke(ctx, fill(0, 3, 9), LN, 1.1);
      ctx.restore();
    }
    // body: square shoulders, rounded bottom corners
    ctx.beginPath(); ctx.roundRect(-11, -23.6, 22, 21.6, [1.6, 1.6, 4.6, 4.6]); fillStroke(ctx, fill(0, -13, 16), LN, 1.3);
    ctx.strokeStyle = '#ffffff40'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-8.8, -21.4); ctx.lineTo(-8.8, -6); ctx.stroke();   // the lit edge
    // antennae: short, splayed out, rounded ends (they flop down when knocked out, twitch when it's happy)
    const tw = S.happy ? Math.sin(t * 14) * 0.15 : 0;
    for (const s of [-1, 1]) {
      const a = -Math.PI / 2 + s * (0.5 + droop * 1.05 + tw), bx = s * 5.6, by = -34.8;
      ctx.lineCap = 'round'; ctx.strokeStyle = LN; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a) * 6.2, by + Math.sin(a) * 6.2); ctx.stroke();
      ctx.strokeStyle = G; ctx.lineWidth = 1.6; ctx.stroke();
    }
    // head: a half dome, a sliver of a gap above the body
    ctx.beginPath(); ctx.arc(0, -25.2, 11, Math.PI, 0); ctx.closePath(); fillStroke(ctx, fill(0, -30, 12), LN, 1.3);
    ctx.save(); ctx.beginPath(); ctx.arc(0, -25.2, 11, Math.PI, 0); ctx.closePath(); ctx.clip();
    ell(ctx, -4.5, -33, 4.4, 1.6, -0.45); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill(); ctx.restore();
    // eyes: two white dots
    for (const s of [-1, 1]) eye(ctx, S, s * 4.7, -30.2, S.ko || S.dizzy ? 2.4 : 1.8, S.ko || S.dizzy ? 2.4 : 1.8, { noSclera: true, ink: '#ffffff', line: '#ffffff', lw: 0.9 });
  },
  // Keith the Rat, C++'s joke mascot (Uncyclopedia: an obese, diseased rat whose hind leg was blown off): fat, mangy,
  // sores and a plaster, nicked ear, bagged eyes, chipped buck teeth, bare ringed tail, a bandaged stump, a fly
  cpp(ctx, S) {
    const F = '#9a907e', FL = '#c4baa6', FD = '#5c5446', LN = '#2a241d', PK = '#e9a3a4', PD = '#b86a6e', BEL = '#d6cbb5', t = S.t;
    const sw = Math.sin(t * 2.4) * 1.3, sx = clamp(S.look[0], -1, 1) * 1.2;
    // tail: long, bare and pink with rings, out of the back on the right, over the side of the car, a limp curl at the tip
    const tail = [[9, -4], [16, -3], [23, -2 + sw * 0.3], [29, -4 + sw * 0.6], [32, -9 + sw], [30.5, -13.5 + sw], [27, -14 + sw]];
    ribbon(ctx, tail, 3.6, 1.2, PK, PD, 1);
    ctx.strokeStyle = PD; ctx.lineWidth = 0.6;
    for (let i = 1; i < tail.length - 1; i++) { const [x0, y0] = tail[i - 1], [x1, y1] = tail[i], dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), w = (3.6 - 2.4 * i / tail.length) * 0.5;
      for (const f of [0.35, 0.8]) { const x = x0 + dx * f, y = y0 + dy * f; ctx.beginPath(); ctx.moveTo(x - dy / l * w, y + dx / l * w); ctx.lineTo(x + dy / l * w, y - dx / l * w); ctx.stroke(); } }
    // hind legs: one foot on the left; on the right only a stump, bandaged, with blood seeping through
    ell(ctx, -8.5, -0.6, 5, 2.4, -0.12); fillStroke(ctx, PK, PD, 1);
    ctx.strokeStyle = PD; ctx.lineWidth = 0.6; for (const k of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(-11.8 + k * 1.6, -1.2); ctx.lineTo(-12.6 + k * 1.6, 0.6); ctx.stroke(); }
    ell(ctx, 12.5, -3, 4.6, 3.4, -0.5); fillStroke(ctx, F, LN, 1.2);
    ell(ctx, 15.2, -1.6, 3.2, 2.6, -0.5); fillStroke(ctx, '#f2eee4', '#7e7568', 0.9);
    ctx.strokeStyle = '#a9a092'; ctx.lineWidth = 0.6; for (const k of [-1.1, 0.1, 1.3]) { ctx.beginPath(); ctx.moveTo(13.6 + k, -3.6 - k * 0.6); ctx.lineTo(15.8 + k, 0.2 - k * 0.6); ctx.stroke(); }
    circ(ctx, 16.6, -1.2, 1.1); ctx.fillStyle = '#c0392b'; ctx.fill();
    // body: obese, a big round belly; mangy tufts poke out of the outline
    ctx.lineJoin = 'round';
    for (const [x, y, nx, ny] of [[-16.6, -9, -1, 0.1], [-16, -16, -0.9, -0.45], [16.8, -12, 1, -0.1], [14.5, -20, 0.75, -0.65], [-11.5, -22.5, -0.6, -0.8]]) {
      const tx = -ny, ty = nx; poly(ctx, [[x - tx * 3.4, y - ty * 3.4], [x + nx * 3.4 - tx * 1.2, y + ny * 3.4 - ty * 1.2], [x + nx * 0.6, y + ny * 0.6], [x + nx * 3 + tx * 2.4, y + ny * 3 + ty * 2.4], [x + tx * 3.6, y + ty * 3.6]]);
      fillStroke(ctx, F, LN, 0.9);
    }
    const body = () => smooth(ctx, [[-15, -2], [-17.5, -10], [-16, -18.5], [-9, -24.5], [0, -26], [9, -24.5], [16, -18.5], [17.5, -10], [15, -2], [0, 0.5]]);
    body(); fillStroke(ctx, radial(ctx, -6, -18, 1, 0, -12, 21, [[0, FL], [0.5, F], [1, FD]]), LN, 1.5);
    ctx.save(); body(); ctx.clip();
    smooth(ctx, [[-10, -2], [-11.5, -10], [-8, -17.5], [0, -19.5], [8, -17.5], [11.5, -10], [10, -2], [0, -0.5]]);
    ctx.fillStyle = radial(ctx, -3, -12, 1, 0, -9, 13, [[0, '#ebe2cf'], [0.6, BEL], [1, '#b7ab93']]); ctx.fill();
    // mange: bald pink patches, sores, and a sticking plaster
    for (const [x, y, rx, ry, r] of [[-12.5, -13, 2.6, 1.8, 0.6], [13, -6, 2.2, 1.5, -0.4], [4.5, -7, 1.7, 1.2, 0.2]]) { ell(ctx, x, y, rx, ry, r); ctx.fillStyle = '#dca096'; ctx.fill(); }
    for (const [x, y, r] of [[-12, -12.8, 0.9], [-4, -5, 0.75], [13.4, -6.2, 0.8], [6, -15.5, 0.7]]) { circ(ctx, x, y, r); ctx.fillStyle = '#9b3a30'; ctx.fill(); circ(ctx, x - r * 0.3, y - r * 0.3, r * 0.4); ctx.fillStyle = '#d9776a'; ctx.fill(); }
    ctx.restore();
    ctx.save(); ctx.translate(-9, -6.5);
    for (const a of [0.7, -0.7]) { ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.roundRect(-3.2, -1.1, 6.4, 2.2, 1); fillStroke(ctx, '#e4be8a', '#9c7444', 0.6); ctx.restore(); }
    ctx.restore();
    // little arms resting on top of the belly
    for (const s of [-1, 1]) { limb(ctx, [[s * 11, -21], [s * 9.5, -17.5], [s * 6.5, -15.5]], 2.6, F, LN, 1.1); circ(ctx, s * 5.8, -15.3, 1.9); fillStroke(ctx, PK, PD, 0.9); }
    if (Math.sin(t * 2.7) <= 0) fly(ctx, t);   // a fly buzzing round his head, behind it on the far side of its loop
    // ears: round and thin-skinned, the left one with a bite out of it
    for (const s of [-1, 1]) {
      const ex = s * 10.5, ey = -41.5, r = 5.6;
      ctx.beginPath();
      if (s < 0) { ctx.arc(ex, ey, r, Math.PI * 0.95, Math.PI * 1.25); ctx.lineTo(ex - 2.2, ey - 3.2); ctx.lineTo(ex - 1.6, ey - r - 0.1); ctx.arc(ex, ey, r, Math.PI * 1.4, Math.PI * 2.95); }
      else ctx.arc(ex, ey, r, 0, TAU);
      ctx.closePath(); fillStroke(ctx, radial(ctx, ex - 1.5, ey - 2.5, 0.5, ex, ey, r + 1, [[0, FL], [0.6, F], [1, FD]]), LN, 1.3);
      circ(ctx, ex + s * 0.3, ey + 0.5, 3.4); ctx.fillStyle = radial(ctx, ex, ey - 1, 0.5, ex, ey + 0.5, 3.6, [[0, '#f3c0bf'], [1, PD]]); ctx.fill();
    }
    // head: smaller than the belly, a bit flat on top, the snout poking toward where it's heading
    smooth(ctx, [[-11.5, -33], [-10, -40.5], [0, -44], [10, -40.5], [11.5, -33], [7.5, -28.5], [2.5 + sx, -25.2], [-2.5 + sx, -25.2], [-7.5, -28.5]]);
    fillStroke(ctx, radial(ctx, -4, -40, 1, 0, -34, 13, [[0, FL], [0.55, F], [1, FD]]), LN, 1.4);
    for (const [x, y, a] of [[-2, -44, -0.4], [1.5, -44.3, 0.3]]) { ctx.strokeStyle = LN; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + 0.4); ctx.lineTo(x + Math.sin(a) * 2.6, y - 2.2); ctx.stroke(); }   // scruffy hairs
    ell(ctx, sx * 0.8, -28.4, 5.6, 3.8); ctx.fillStyle = '#c9bea9'; ctx.fill();                                              // muzzle
    // eyes: tired and sickly, yellowed, heavy-lidded, with dark bags under them
    for (const s of [-1, 1]) {
      const x = s * 4.6, y = -34.4;
      ctx.strokeStyle = 'rgba(60,40,40,0.55)'; ctx.lineWidth = 0.9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y + 0.6, 3.6, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
      eye(ctx, S, x, y, 3, 3.3, { line: LN, lw: 1, pupil: 0.5, sclera: '#efe8c8' });
      if (!S.happy && !S.blink && !S.ko && !S.dizzy) {
        ctx.save(); ell(ctx, x, y, 3, 3.3); ctx.clip();
        ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y - 4); ctx.lineTo(x + 4, y - 0.4 + s * 0.5); ctx.lineTo(x - 4, y - 0.4 - s * 0.5); ctx.closePath(); ctx.fillStyle = F; ctx.fill();
        ctx.restore();
        ctx.strokeStyle = LN; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(x - 3.1, y - 0.4 - s * 0.5); ctx.lineTo(x + 3.1, y - 0.4 + s * 0.5); ctx.stroke();
      }
    }
    // whiskers: long and scraggly, one of them bent
    ctx.strokeStyle = LN; ctx.lineWidth = 0.55; ctx.lineCap = 'round';
    for (const s of [-1, 1]) for (const [dy, ey] of [[-0.8, -3.4], [0.4, -0.4], [1.5, 2.8]]) {
      const x0 = sx * 0.8 + s * 4, y0 = -28.6 + dy; ctx.beginPath(); ctx.moveTo(x0, y0);
      if (s > 0 && dy > 1) { ctx.lineTo(x0 + 7, y0 + 1.2); ctx.lineTo(x0 + 10.5, y0 + 4.5); }
      else ctx.quadraticCurveTo(x0 + s * 6, y0 + ey * 0.25, x0 + s * 13, y0 + ey);
      ctx.stroke();
    }
    // nose: raw and pink at the tip of the snout
    ell(ctx, sx, -29.6, 2.4, 1.7); fillStroke(ctx, radial(ctx, sx - 0.6, -30.2, 0.2, sx, -29.6, 2.5, [[0, '#f3a6b0'], [1, '#c4566c']]), LN, 0.8);
    circ(ctx, sx - 0.7, -30.1, 0.5); ctx.fillStyle = '#ffffffbb'; ctx.fill();
    // mouth and two yellowed buck teeth, the right one chipped
    const mx = sx * 0.9, my = -26.4;
    const teeth = (y) => { rr2(ctx, mx - 1.5, y, 1.5, 2.4, 0.4); fillStroke(ctx, '#ece0a6', '#5a4a2a', 0.5); ctx.beginPath(); ctx.moveTo(mx, y); ctx.lineTo(mx + 1.5, y); ctx.lineTo(mx + 1.5, y + 1.3); ctx.lineTo(mx + 0.6, y + 1.9); ctx.lineTo(mx, y + 1.6); ctx.closePath(); fillStroke(ctx, '#e3d394', '#5a4a2a', 0.5); };
    ctx.strokeStyle = LN; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (S.ko || S.dizzy) {
      ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(mx - 3.4, my + 0.4); ctx.quadraticCurveTo(mx - 1.7, my - 1, mx, my + 0.4); ctx.quadraticCurveTo(mx + 1.7, my + 1.8, mx + 3.4, my + 0.4); ctx.stroke();
      ell(ctx, mx + 1.6, my + 2.2, 1.3, 1.6); fillStroke(ctx, '#e0707e', LN, 0.6);   // tongue lolling out
      teeth(my - 0.2);
    } else if (S.happy) {
      ctx.beginPath(); ctx.moveTo(mx - 3.8, my - 0.8); ctx.quadraticCurveTo(mx, my, mx + 3.8, my - 0.8); ctx.quadraticCurveTo(mx + 3, my + 4, mx, my + 4); ctx.quadraticCurveTo(mx - 3, my + 4, mx - 3.8, my - 0.8); ctx.closePath();
      fillStroke(ctx, '#6e2234', LN, 0.9); ell(ctx, mx, my + 3, 1.8, 0.8); ctx.fillStyle = '#e0707e'; ctx.fill();
      teeth(my - 0.5);
    } else {
      ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(mx, my - 1.4); ctx.lineTo(mx, my - 0.2); ctx.moveTo(mx - 3.2, my + 0.9); ctx.quadraticCurveTo(mx - 1.6, my - 0.6, mx, my - 0.2); ctx.quadraticCurveTo(mx + 1.6, my - 0.6, mx + 3.2, my + 0.9); ctx.stroke();
      teeth(my - 0.1);
    }
    if (Math.sin(t * 2.7) > 0) fly(ctx, t);
  },
};
// where each one's eyes are (for sudo's shades) and the top of its head (for the crown)
const EYES = {
  ferris: [[[-6.8, -18.5], [6.8, -18.5]], 4.6, -36], gopher: [[[-7.2, -31.5], [7.6, -31]], 8, -50], pyth: [[[-5, -37.5], [5, -37.5]], 4, -48],
  octo: [[[-5.9, -27.6], [5.9, -27.6]], 3.6, -53], tux: [[[-4.4, -38.4], [4.4, -38.4]], 4.6, -53], duke: [[[-5, -31], [5, -31]], 3.8, -50],
  docky: [[[15.5, -13.5]], 3, -44], swifty: [[[15.6, -30]], 3.4, -41], lamb: [[[-3.3, -27.8], [3.3, -27.8]], 3, -46], bugsy: [[[-4, -34], [4, -34]], 3.8, -46],
  cpp: [[[-4.6, -34.4], [4.6, -34.4]], 3.8, -50], droid: [[[-4.7, -30.2], [4.7, -30.2]], 3.4, -44],
};
// sudo: root shades over the eyes, and a crown floating over the head
function rootLook(ctx, id, t) {
  const [eyes, r, top] = EYES[id] || EYES.gopher;
  ctx.lineJoin = 'round';
  if (eyes.length === 2) { ctx.strokeStyle = '#111'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(eyes[0][0] + r * 0.8, eyes[0][1] - r * 0.3); ctx.lineTo(eyes[1][0] - r * 0.8, eyes[1][1] - r * 0.3); ctx.stroke(); }
  else { ctx.strokeStyle = '#111'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(eyes[0][0] - r, eyes[0][1] - r * 0.3); ctx.lineTo(eyes[0][0] - r * 3, eyes[0][1] - r * 0.6); ctx.stroke(); }
  for (const [x, y] of eyes) {
    ctx.beginPath(); ctx.moveTo(x - r * 1.15, y - r * 0.55); ctx.lineTo(x + r * 1.15, y - r * 0.55); ctx.quadraticCurveTo(x + r * 1.1, y + r * 0.85, x, y + r * 0.8); ctx.quadraticCurveTo(x - r * 1.1, y + r * 0.85, x - r * 1.15, y - r * 0.55); ctx.closePath();
    fillStroke(ctx, linear(ctx, 0, y - r * 0.6, 0, y + r * 0.8, [[0, '#2a2d36'], [1, '#050507']]), '#000', 0.9);
    ctx.strokeStyle = 'rgba(255,214,90,0.9)'; ctx.lineWidth = Math.max(0.7, r * 0.18); ctx.beginPath(); ctx.moveTo(x - r * 0.7, y - r * 0.2); ctx.lineTo(x - r * 0.15, y - r * 0.2); ctx.stroke();
  }
  ctx.save(); ctx.translate(eyes[0][0] * (eyes.length === 1 ? 0.3 : 0), top - 4 + Math.sin(t * 4) * 1.6); ctx.rotate(Math.sin(t * 2.3) * 0.12);
  ICONS.sudo(ctx, 8.5); ctx.restore();
}
// knocked out: three little stars circling over the head, the near side drawn bigger
export function koStars(ctx, t) {
  for (let k = 0; k < 3; k++) {
    const a = t * 5 + k * TAU / 3, x = Math.cos(a) * 15, y = -50 + Math.sin(a) * 4.5, s = 2.6 + Math.sin(a) * 0.9;
    ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.45 : s, b = i * Math.PI / 5 - Math.PI / 2 + t * 3; ctx.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r); } ctx.closePath();
    fillStroke(ctx, k === 1 ? '#fff3b0' : '#ffd166', '#7a4b00', 0.8);
  }
}
function rr2(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
// Keith's fly: a loop round his head, wobbling, wings a blur
export function fly(ctx, t) {
  const a = t * 2.7, fx = Math.cos(a) * 15 + Math.sin(t * 9.1) * 1.5, fy = -40 + Math.sin(a) * 5 + Math.sin(t * 13) * 1.2, fl = Math.sin(t * 60) > 0 ? 1 : 0.6;
  for (const s of [-1, 1]) { ell(ctx, fx + s * 1.3, fy - 1.3, 1.5, 0.9 * fl, s * 0.6); ctx.fillStyle = 'rgba(235,245,255,0.75)'; ctx.fill(); ctx.strokeStyle = 'rgba(30,30,40,0.6)'; ctx.lineWidth = 0.35; ctx.stroke(); }
  ell(ctx, fx, fy, 1.2, 0.95); ctx.fillStyle = '#1d2a24'; ctx.fill();
}

const SEED = {}; let seedN = 0;
// o: look [x, y] (screen direction it's heading), face (±1, for side-on mascots), lean (rad), t (s),
//    mood ('dizzy' | 'ko' | 'happy'), scale, shadow (default true: a soft shadow where it sits), sudo (root look)
export function drawMascot(ctx, ch, o = {}) {
  const t = o.t ?? performance.now() / 1000, seed = SEED[ch.id] ?? (SEED[ch.id] = (seedN++ * 0.37) % 1);
  const face = SIDE[ch.id] ? (o.face ?? 1) : 1, look = o.look || [0.25, 0.1];
  const S = { t, look: [look[0] * face, look[1]], dizzy: o.mood === 'dizzy', ko: o.mood === 'ko', happy: o.mood === 'happy', blink: !o.mood && ((t * 0.37 + seed) % 1) < 0.035 };
  ctx.save();
  if (o.scale) ctx.scale(o.scale, o.scale);
  if (o.shadow !== false) { ell(ctx, 2, 1.5, 17, 5.5); ctx.fillStyle = 'rgba(8,10,16,0.32)'; ctx.fill(); }
  if (o.lean) ctx.rotate(o.lean);
  if (face < 0) ctx.scale(-1, 1);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // root: a golden halo (one gradient fill; a shadowBlur glow lagged)
  if (o.sudo) { const p = 0.85 + 0.15 * Math.sin(t * 7); ctx.fillStyle = radial(ctx, 0, -22, 4, 0, -22, 36 * p, [[0, 'rgba(255,214,90,0.75)'], [0.55, 'rgba(255,190,40,0.35)'], [1, 'rgba(255,190,40,0)']]); ctx.fillRect(-40, -62, 80, 80); }
  (M[ch.id] || M.gopher)(ctx, S);
  if (S.ko) koStars(ctx, t);
  if (o.sudo) rootLook(ctx, ch.id, t);
  ctx.restore();
}
export { shade };
