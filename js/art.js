// Kernel Kart: everything drawn with canvas paths: cartoon cars, mascots, item icons, keycaps, props and the track.

export const FONT = '"Fredoka", "Trebuchet MS", system-ui, sans-serif';

// the cars, the mascots riding them and the shared colour helpers live in js/art/
export { shade, mix, alpha } from './art/paint.js';
export { CAR_PAINT, HEIGHT, RIDE_UP, drawCar, drawCarShadow, twinLook } from './art/cars.js';
export { FACE_Y, MASCOT_H, drawMascot } from './art/mascots.js';
import { shade } from './art/paint.js';

// ---------------------------------------------------------------- item icons (js/art/icons.js) and the mystery box
import { ICONS, drawIconBold } from './art/icons.js';
import { BK, BOLD_FONT, bold } from './look.js';
export { ICONS };
export { drawHazardSign, drawLapFlag, drawPlaceBadge } from './art/icons.js';   // the event feed's icons
export function drawItemIcon(ctx, type, r) {
  const f = ICONS[type]; if (!f) return;
  if (bold()) return drawIconBold(ctx, type, r);   // flat, cached sprites (a flat look)
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; f(ctx, r, performance.now() / 1000); ctx.restore();
}

// Keycaps for HUD controls
export function drawKeycap(ctx, cx, cy, label, down, col, k = 1) {
  if (bold()) return keycapBold(ctx, cx, cy, label, down, col, k);
  const w = (label.length > 1 ? 44 : 32) * k, h = 28 * k, r = 9 * k, d = (down ? 1 : 4) * k;
  ctx.save(); ctx.translate(cx, cy);
  ctx.fillStyle = down ? shade(col, -0.25) : '#c9ccd9'; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2 + d, w, h, r); ctx.fill();
  ctx.fillStyle = down ? col : '#ffffff'; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2 + (down ? 1 : 0) * k, w, h, r); ctx.fill();
  ctx.fillStyle = down ? '#ffffff' : '#2d3047'; ctx.font = `700 ${(label.length > 1 ? 13 : 17) * k}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, (down ? 2 : 1) * k);
  ctx.restore();
}

// a flat look's keycap: a flat key in its palette with a hairline border, filled with the player's colour while held
function keycapBold(ctx, cx, cy, label, down, col, k) {
  const w = (label.length > 1 ? 44 : 32) * k, h = 26 * k, r = Math.min(7, BK.r - 2) * k;
  ctx.save(); ctx.translate(cx, cy);
  ctx.fillStyle = down ? col : BK.surface2; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, r); ctx.fill();
  if (!down) { ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1, r); ctx.stroke(); }
  ctx.fillStyle = down ? '#ffffff' : BK.text; ctx.font = `700 ${(label.length > 1 ? 12 : 14) * k}px ${BOLD_FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, 1 * k);
  ctx.restore();
}

export { LOOK, drawBridge, drawTrack, lookOf } from './art/track.js';
