// The Style setting (settings.look). 'classic' is the original glossy look and stays exactly as it was; the flat looks
// share every code path and differ in palette, fonts and a few shapes: 'flat' (Classic Flat: Classic's colours and fonts
// without gradients or glows), 'racing' (black/carbon, red, yellow, Barlow Condensed, skewed plates), 'premium'
// (espresso, amber/copper, Montserrat over Manrope). Stored 'bold' loads as 'flat' (settings.js).
// Drawing only and DOM-free (race.js imports drawing code). DOM side: style.css plus look-*.css under
// <html data-look> (ui.js applyLook). On canvas: bold() (any flat look), colours from BK, fonts from BOLD_FONT /
// BOLD_DISPLAY / BOLD_W (swapped in place by setLook: read them when drawing, not at load), lookIs() for a look's own
// touch. Every sprite cache made from a look keys on lookGen().
import { settings } from './settings.js';

// (Racing and Premium are archived, the user's call: only Classic Flat gets new art)
export const LOOKS = [['classic', 'Classic'], ['flat', 'Classic Flat'], ['racing', 'Racing (archived)'], ['premium', 'Premium (archived)']];
export const bold = () => settings.look !== 'classic';   // any of the flat looks
export const lookIs = name => settings.look === name;
let gen = 0;
export const lookGen = () => gen;

// The palettes. panel: the HUD's see-through panel (panelRGB without alpha); surface/surface2: solid cards on it; well:
// the darker inset (item slot); line: hairlines; hi: a panel's top highlight; text/muted/dim (dim: a bot's name); ink: a
// dark edge only where a shape needs one; shade: a flat road shadow; lampOff: an unlit start lamp; mini: the minimap
// road; box/boxSide/boxMark: the item box; plate/plateText: a number plate; onAccent: text on the accent; r: the
// largest HUD corner radius.
const PAL = {
  flat: {
    panel: 'rgba(27,23,66,0.9)', panelRGB: '27,23,66', surface: '#2b2662', surface2: '#37307a', well: '#120f30', line: 'rgba(255,255,255,0.1)', hi: 'rgba(255,255,255,0.08)',
    text: '#f6f5ff', muted: '#a9a6d0', dim: '#cfcbec', ink: '#14102a', shade: 'rgba(20,16,42,0.24)',
    accent: '#ff4b3e', red: '#ff4b3e', yellow: '#ffc93c', blue: '#3fa7ff', green: '#3fd68b', pink: '#ff5d73', violet: '#9d7dff', cyan: '#58e1ff',
    lampOff: '#2a2550', mini: '#585283', box: '#ffc93c', boxSide: '#d9862a', boxMark: '#14102a', plate: '#ffc93c', plateText: '#14102a', onAccent: '#ffffff', r: 16,
  },
  racing: {
    panel: 'rgba(13,13,15,0.92)', panelRGB: '13,13,15', surface: '#1f1f23', surface2: '#2c2c31', well: '#070708', line: 'rgba(255,255,255,0.13)', hi: 'rgba(255,255,255,0.06)',
    text: '#ffffff', muted: '#a6a6ae', dim: '#d2d2d8', ink: '#0b0b0d', shade: 'rgba(0,0,0,0.26)',
    accent: '#e8141c', red: '#e8141c', yellow: '#ffd400', blue: '#1e8bff', green: '#19c25e', pink: '#ff3d7f', violet: '#8b5cf6', cyan: '#19c3e6',
    lampOff: '#26262b', mini: '#4a4a52', box: '#ffd400', boxSide: '#c79a00', boxMark: '#0b0b0d', plate: '#ffd400', plateText: '#0b0b0d', onAccent: '#ffffff', r: 4,
  },
  premium: {
    panel: 'rgba(30,23,19,0.92)', panelRGB: '30,23,19', surface: '#2c221c', surface2: '#3a2e26', well: '#150f0c', line: 'rgba(255,226,196,0.11)', hi: 'rgba(255,214,170,0.1)',
    text: '#f6ede2', muted: '#b6a593', dim: '#dccfc0', ink: '#1a120d', shade: 'rgba(30,14,4,0.22)',
    accent: '#ec9a3e', red: '#e0624c', yellow: '#f2c14e', blue: '#6f9bd1', green: '#86c06c', pink: '#e27d8f', violet: '#a78bd6', cyan: '#5fb7ad',
    lampOff: '#3a2e26', mini: '#5e5048', box: '#ec9a3e', boxSide: '#a8622a', boxMark: '#2a1a10', plate: '#ec9a3e', plateText: '#1a120d', onAccent: '#1a120d', r: 12,
  },
};
// the fonts: text (FONT), titles and numbers (`${W}${size}px ${DISPLAY}`), their stylesheet (null: index.html loads
// them) and the faces to preload (a canvas doesn't fetch fonts itself, so ui.js applyLook loads them)
const CLASSIC_BODY = '"Fredoka", "Trebuchet MS", system-ui, sans-serif';
const FONTS = {
  flat: { FONT: CLASSIC_BODY, DISPLAY: '"Bungee", ' + CLASSIC_BODY, W: '', url: null, faces: [] },
  racing: { FONT: '"Barlow", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', DISPLAY: '"Barlow Condensed", "Barlow", system-ui, sans-serif', W: 'italic 800 ',
    url: 'https://fonts.googleapis.com/css2?family=Barlow:wght@500;600;700;800&family=Barlow+Condensed:ital,wght@0,600;0,700;0,800;1,600;1,700;1,800;1,900&display=swap',
    faces: ['italic 800 16px "Barlow Condensed"', 'italic 700 16px "Barlow Condensed"', '700 16px "Barlow Condensed"', '600 16px "Barlow"', '700 16px "Barlow"', '500 16px "Barlow"'] },
  premium: { FONT: '"Manrope", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', DISPLAY: '"Montserrat", "Manrope", system-ui, sans-serif', W: '700 ',
    url: 'https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Montserrat:wght@500;600;700;800&display=swap',
    faces: ['700 16px "Montserrat"', '600 16px "Montserrat"', '800 16px "Montserrat"', '600 16px "Manrope"', '700 16px "Manrope"', '500 16px "Manrope"'] },
};

export const BK = {};
export let BOLD_FONT = '', BOLD_DISPLAY = '', BOLD_W = '';
export const lookFonts = () => FONTS[settings.look] || null;
function pick() {
  const k = PAL[settings.look] ? settings.look : 'flat';   // (classic never draws through these; flat's are a safe default)
  Object.assign(BK, PAL[k]);
  ({ FONT: BOLD_FONT, DISPLAY: BOLD_DISPLAY, W: BOLD_W } = FONTS[k]);
}
pick();
export function setLook(v) { settings.look = LOOKS.some(([k]) => k === v) ? v : 'classic'; pick(); gen++; }

// a rounded box in a flat look: a flat fill and a hairline border (line: its colour, '' for none). No shadow.
export function bbox(ctx, x, y, w, h, r, fill, line = BK.line) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  if (line) { ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, r - 0.5)); ctx.stroke(); }
}
// a HUD panel in a flat look: a soft shadow (two offset see-through fills, no blur: cheap per card per frame), the box
// and a faint top highlight. a: how solid. Corners capped at BK.r. Premium: a warm sheen; Racing: square-ish corners.
export function bpanel(ctx, x, y, w, h, r, a = 0.9) {
  r = Math.min(BK.r, r);
  ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.beginPath(); ctx.roundRect(x - 1, y + 1, w + 2, h + 3, r + 1); ctx.fill();
  ctx.beginPath(); ctx.roundRect(x, y + 1, w, h + 1.5, r); ctx.fill();
  bbox(ctx, x, y, w, h, r, a >= 0.9 ? BK.panel : `rgba(${BK.panelRGB},${Math.min(0.92, a + 0.12).toFixed(2)})`);
  if (lookIs('premium') && h > 40) { ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.clip(); ctx.fillStyle = 'rgba(255,200,150,0.035)'; ctx.fillRect(x, y, w, Math.min(h, 34)); ctx.restore(); }
  if (w > r * 2 + 4) { ctx.strokeStyle = BK.hi; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + r, y + 1.5); ctx.lineTo(x + w - r, y + 1.5); ctx.stroke(); }
}
// Racing's chequered strip: n squares along, two rows of s, white and the ink, at (x, y)
export function chequer(ctx, x, y, n, s, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, n * s, s * 2); ctx.fillStyle = BK.ink;
  for (let i = 0; i < n; i++) ctx.fillRect(x + i * s, y + (i % 2) * s, s, s);
  ctx.restore();
}
// a number plate (Racing's places and positions): a skewed plate with the number on it
export function plate(ctx, x, y, w, h, txt, fill = BK.plate, ink = BK.plateText, size = h * 0.78) {
  const k = h * 0.28;
  ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(x + k, y); ctx.lineTo(x + w + k, y); ctx.lineTo(x + w - k, y + h); ctx.lineTo(x - k, y + h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = ink; ctx.font = `${BOLD_W}${size}px ${BOLD_DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x + w / 2, y + h / 2 + size * 0.04);
}
// a rainbow or off-palette colour (an hsl() made on the fly) brought into the palette by its hue
const HUES = [[20, 'red'], [55, 'yellow'], [165, 'green'], [200, 'cyan'], [250, 'blue'], [300, 'violet'], [345, 'pink'], [361, 'red']];
export function boldCol(col) {
  if (typeof col !== 'string' || col[0] !== 'h') return col;
  const h = ((parseFloat(col.slice(col.indexOf('(') + 1)) % 360) + 360) % 360;
  for (const [lim, c] of HUES) if (h < lim) return BK[c];
  return BK.red;
}
