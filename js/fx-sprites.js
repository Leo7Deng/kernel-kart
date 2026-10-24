// Kernel Kart: cached effect sprites. Soft glows, puffs of smoke and dust, and the bigger status shapes (the Firewall's
// dome of hexes, the trapping soap bubble, sudo's column of light, a Memory Leak slick) would cost a gradient, or a few
// hundred path operations, every frame. Each is drawn once into a small offscreen canvas and stamped with drawImage.
// Lit like the rest of the art: from the top left. Browser only: a sprite is made the first time it's drawn, and the
// headless race never draws.
import { TAU } from './core.js';

const RES = 3;   // sprite pixels per world unit: still sharp with the camera in close on a 2x screen
const cache = new Map();
export function make(key, w, h, draw) {   // a w×h world-unit sprite drawn once by draw(g, w, h), kept under key
  let s = cache.get(key); if (s) return s;
  if (cache.size > 200) cache.clear();   // colours made on the fly (a rainbow pickup) can't pile up
  s = document.createElement('canvas'); s.width = Math.ceil(w * RES); s.height = Math.ceil(h * RES);
  const g = s.getContext('2d'); g.scale(RES, RES); draw(g, w, h);
  cache.set(key, s); return s;
}
// keep only a round falloff of what's drawn: stops are [offset, alpha] from the middle out
function roundMask(g, cx, cy, r, stops) {
  g.globalCompositeOperation = 'destination-in';
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); for (const [o, a] of stops) gr.addColorStop(o, `rgba(0,0,0,${a})`);
  g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2); g.globalCompositeOperation = 'source-over';
}
const U = 32;   // the round sprites are made at this radius and scaled to fit
// a soft glow in col, with a hot white middle (core: how white): flashes, fire, glows under and over karts
export function glowSprite(col, core = 0.5) {
  return make(`glow|${col}|${core}`, U * 2, U * 2, g => {
    g.fillStyle = col; g.fillRect(0, 0, U * 2, U * 2);
    roundMask(g, U, U, U, [[0, 1], [0.22, 0.8], [0.55, 0.28], [1, 0]]);
    if (core > 0) { const w = g.createRadialGradient(U, U, 0, U, U, U * 0.4); w.addColorStop(0, `rgba(255,255,255,${core})`); w.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = w; g.fillRect(0, 0, U * 2, U * 2); }
  });
}
// a soft round puff of smoke or dust in col: lit on its top left, shaded bottom right, its edge fading out
export function puffSprite(col) {
  return make(`puff|${col}`, U * 2, U * 2, g => {
    g.fillStyle = col; g.beginPath(); g.arc(U, U, U, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-atop';
    let gr = g.createRadialGradient(U * 0.7, U * 0.62, 0, U * 0.7, U * 0.62, U * 0.9); gr.addColorStop(0, 'rgba(255,255,255,0.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, U * 2, U * 2);
    gr = g.createRadialGradient(U * 1.45, U * 1.5, 0, U * 1.45, U * 1.5, U * 1.1); gr.addColorStop(0, 'rgba(0,0,0,0.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, U * 2, U * 2);
    roundMask(g, U, U, U, [[0, 1], [0.55, 0.85], [1, 0]]);
  });
}
// stamp a round sprite centred on (x, y) with radius r
export function stamp(ctx, spr, x, y, r) { ctx.drawImage(spr, x - r, y - r, r * 2, r * 2); }

// sudo's column of gold light: soft at the sides, fading out toward the top (drawn from its foot, standing up toward -y)
export function beamSprite() {
  return make('beam', 40, 200, g => {
    const gr = g.createLinearGradient(0, 0, 40, 0);
    gr.addColorStop(0, 'rgba(255,214,90,0)'); gr.addColorStop(0.3, 'rgba(255,214,90,0.75)'); gr.addColorStop(0.45, 'rgba(255,246,200,1)'); gr.addColorStop(0.55, 'rgba(255,246,200,1)'); gr.addColorStop(0.7, 'rgba(255,214,90,0.75)'); gr.addColorStop(1, 'rgba(255,214,90,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 40, 200);
    g.globalCompositeOperation = 'destination-in';
    const v = g.createLinearGradient(0, 200, 0, 0); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.55, 'rgba(0,0,0,0.6)'); v.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = v; g.fillRect(0, 0, 40, 200);
  });
}

// the Firewall: a glassy dome of glowing hexes, radius R (the sweeping glint and the flicker stay live)
export function shieldSprite(R) {
  R = Math.round(R); const m = R + 4;
  return make(`shield|${R}`, m * 2, m * 2, g => {
    g.translate(m, m);
    const body = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
    body.addColorStop(0, 'rgba(160,230,255,0.06)'); body.addColorStop(0.7, 'rgba(64,196,255,0.14)'); body.addColorStop(1, 'rgba(64,196,255,0.32)');
    g.fillStyle = body; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
    g.save(); g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
    const hx = 13, hy = hx * Math.sqrt(3) / 2, n = Math.ceil(R / hx) + 1;
    g.strokeStyle = 'rgba(140,225,255,0.5)'; g.lineWidth = 1.2; g.beginPath();
    for (let row = -n; row <= n; row++) for (let col = -n; col <= n; col++) {
      const x = col * hx * 1.5, y = row * hy * 2 + (col % 2 ? hy : 0);
      for (let k = 0; k <= 6; k++) { const px = x + Math.cos(k * Math.PI / 3) * hx * 0.92, py = y + Math.sin(k * Math.PI / 3) * hx * 0.92; k ? g.lineTo(px, py) : g.moveTo(px, py); }
    }
    g.stroke();
    // shading over the hexes: the lit top left of the glass, a darker edge bottom right
    const sh = g.createLinearGradient(-R, -R, R, R); sh.addColorStop(0, 'rgba(255,255,255,0.14)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,60,110,0.16)');
    g.fillStyle = sh; g.fillRect(-R, -R, R * 2, R * 2);
    g.restore();
    g.strokeStyle = 'rgba(20,110,170,0.55)'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(100,215,255,0.95)'; g.lineWidth = 2.5; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.arc(0, 0, R - 7, -2.55, -1.8); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(-R * 0.5, -R * 0.62, 2.2, 0, TAU); g.fill();
  });
}

// the soap bubble round a trapped kart, radius R (its swirl of colour stays live)
export function bubbleSprite(R) {
  R = Math.round(R); const m = R + 3;
  return make(`bubble|${R}`, m * 2, m * 2, g => {
    g.translate(m, m);
    const gr = g.createRadialGradient(-R * 0.35, -R * 0.4, 4, 0, 0, R);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.3, 'rgba(250,225,255,0.16)'); gr.addColorStop(0.75, 'rgba(197,139,255,0.2)'); gr.addColorStop(0.93, 'rgba(160,120,255,0.42)'); gr.addColorStop(1, 'rgba(126,227,255,0.6)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2; g.stroke();
    g.lineCap = 'round';
    g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, R * 0.8, -2.6, -1.95); g.stroke();
    g.lineWidth = 3.5; g.beginPath(); g.arc(0, 0, R * 0.8, -1.8, -1.68); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, R * 0.86, 0.5, 1.1); g.stroke();   // the faint reflection on the shaded side
  });
}

// a flat look's versions (js/look.js): flat fills, a thin rim, no gradients or glints.
// the Firewall: a flat blue dome, faint hexes on it and a thin blue rim
export function shieldSpriteBold(R) {
  R = Math.round(R); const m = R + 4;
  return make(`shieldC|${R}`, m * 2, m * 2, g => {
    g.translate(m, m);
    g.fillStyle = 'rgba(61,130,240,0.2)'; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
    g.save(); g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
    const hx = 16, hy = hx * Math.sqrt(3) / 2, n = Math.ceil(R / hx) + 1;
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1.2; g.lineJoin = 'round'; g.beginPath();
    for (let row = -n; row <= n; row++) for (let col = -n; col <= n; col++) {
      const x = col * hx * 1.5, y = row * hy * 2 + (col % 2 ? hy : 0);
      for (let k = 0; k <= 6; k++) { const px = x + Math.cos(k * Math.PI / 3) * hx * 0.9, py = y + Math.sin(k * Math.PI / 3) * hx * 0.9; k ? g.lineTo(px, py) : g.moveTo(px, py); }
    }
    g.stroke(); g.restore();
    g.strokeStyle = '#5b97f5'; g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, R - 1.5, 0, TAU); g.stroke();
  });
}
// the soap bubble: a flat lilac film, a thin rim, one round glint
export function bubbleSpriteBold(R) {
  R = Math.round(R); const m = R + 3;
  return make(`bubbleC|${R}`, m * 2, m * 2, g => {
    g.translate(m, m);
    g.fillStyle = 'rgba(138,124,240,0.2)'; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(200,192,255,0.85)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, R - 1, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(-R * 0.45, -R * 0.5, R * 0.12, R * 0.08, -0.6, 0, TAU); g.fill();
  });
}
