// Kernel Kart: Fight mode's big beats, drawn (draw-fight.js hooks these in; fight-ui.js plays their sounds on the same
// clock). All cosmetic: they read the fight's phase ('intro', 'fight', 'roundEnd', 'over'), its events and the drawer's
// own view `v` (draw-fight.js viewOf), so an online screen plays them from its snapshots like the host. No words (the
// user's rule): numbers, portraits, shapes.
//   round intro  ('intro', ~1.6 s) two bands in the fighters' colours slam in from the sides carrying their 3D portraits,
//                a flash where they meet with VS, the round number on a badge over it with the rounds as pips; the
//                bands fly out and 3, 2, 1 drum in (0.3 s apart, INTRO_COUNT); the fighters strike a short ready pose;
//                then the start: a comic impact star and speed streaks off it (the first half second of 'fight')
//   KO           the frame holds for a moment (HOLD_T: the picture freezes and punches in a little, the sim runs on
//                underneath), a white flash, manga focus lines closing on the knocked-out one; let go with a second
//                flash, the camera eases in on them while the round ends
//   round won    the winner hops into a happy pose, confetti pops off them (paper bits in their colour, white and gold)
//   match won    ('over', before the results card) the camera pushes in on the winner doing a victory hop, their colour
//                washes softly in from the screen's edges, streamers ripple down and sparkles twinkle, and their full
//                3D portrait slides in big on a band on their side
import { CHARACTERS, PCOL, TAU, clamp, frnd, lerp } from './core.js';
import { BK, BOLD_DISPLAY, BOLD_W, bold } from './look.js';
import { FONT } from './art.js';
import * as M3 from './art/model3d.js';
import { settings } from './settings.js';
import { fightHead, starPath } from './draw-fight.js';
import { FIGHTERS } from './fight-chars.js';

export const INTRO_COUNT = [0.65, 0.95, 1.25];   // when 3, 2 and 1 come in (s into the intro; fight-ui.js drums on these)
export const VS_AT = 0.24;                       // the bands meeting: the VS flash (and fVs's clang)
export const HOLD_T = 0.3;                       // a KO's held frame
const charOf = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
const disp = s => bold() ? `${BOLD_W}${s}px ${BOLD_DISPLAY}` : `${s}px "Bungee", ${FONT}`;
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const back = k => { k = clamp(k, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const rgb = h => { const n = parseInt(h.slice(1), 16); return `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`; };
const decided = F => F.roundWinner != null && F.wins[F.roundWinner] >= Math.ceil((F.cfg.bestOf || 3) / 2);

// ---------------------------------------------------------------- events (from fightEvents)
export function momentEvent(v, F, e) {
  if (e.kind === 'ko') v.ko = { t: v.t, i: e.who ?? -1, x: e.x, y: e.y, cap: false, sx: null, sy: null };
}
// once a frame, after the phase is known: the round winner's confetti (once a round)
export function momentTick(v, F) {
  if (F.phase === 'roundEnd' && F.roundWinner != null && v.phaseT > 0.5 && v.celeb !== F.round) {
    v.celeb = F.round;
    const f = F.f[F.roundWinner], few = settings.reduced, cols = [PCOL[f.i], '#ffffff', bold() ? BK.yellow : '#ffd23c'];
    for (let k = 0; k < (few ? 8 : 22); k++) {
      const a = -Math.PI / 2 + frnd(-1.1, 1.1), sp = frnd(160, 300);
      v.fx.push({ k: 'confetti', x: f.x + frnd(-6, 6), y: f.y - (f.z || 0) - 64, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: frnd(1.1, 1.6), s: frnd(3, 5), a: frnd(0, TAU), sp: frnd(-14, 14), col: cols[k % 3], fl: frnd(0, TAU) });
    }
  }
}

// ---------------------------------------------------------------- the camera: where the beats want it (null: as usual)
// base: the usual zoom; returns { x, y, z, k } (k: how fast to get there)
export function momentCam(F, v, base) {
  const K = v.ko, ka = K ? v.t - K.t : 9;
  if (F.phase === 'over' && F.winner != null) { const f = F.f[F.winner]; return { x: f.x, y: f.y - 34, z: base * 1.9, k: 2.4 }; }
  if (F.phase === 'roundEnd' && K && ka < 2.4) {
    const f = F.f[K.i], w = F.roundWinner != null ? F.f[F.roundWinner] : null;
    if (!f) return null;
    const x = w ? lerp(w.x, f.x, 0.65) : f.x, y = (w ? lerp(w.y, f.y, 0.65) : f.y) - 30;
    return { x, y, z: base * 1.45, k: ka < HOLD_T + 0.1 ? 9 : 3 };
  }
  return null;
}

// ---------------------------------------------------------------- the KO hold
let HOLD = null;
// draw the world or the held frame: world() draws it; returns true while holding (the HUD still goes on top)
export function momentHold(g, v, F, VW, VH, D, live, world) {
  const K = v.ko, ka = K ? v.t - K.t : 9;
  if (!live || !K || settings.reduced || ka >= HOLD_T || typeof document === 'undefined') { world(); return false; }
  if (!K.cap) {   // the first frame after the KO: drawn as usual, then kept
    world(); K.cap = true;
    if (!HOLD) HOLD = document.createElement('canvas');
    if (HOLD.width !== g.canvas.width || HOLD.height !== g.canvas.height) { HOLD.width = g.canvas.width; HOLD.height = g.canvas.height; }
    const h = HOLD.getContext('2d'); h.setTransform(1, 0, 0, 1, 0, 0); h.clearRect(0, 0, HOLD.width, HOLD.height); h.drawImage(g.canvas, 0, 0);
    holdFx(g, v, K, 0, VW, VH, D);
    return true;
  }
  const s = 1 + 0.1 * ease(ka / HOLD_T), sx = K.sx ?? VW / 2, sy = K.sy ?? VH / 2;
  g.save(); g.setTransform(D, 0, 0, D, 0, 0); g.translate(sx, sy); g.scale(s, s); g.translate(-sx, -sy);
  g.drawImage(HOLD, 0, 0, HOLD.width, HOLD.height, 0, 0, HOLD.width / D, HOLD.height / D); g.restore();
  holdFx(g, v, K, ka, VW, VH, D);
  return true;
}
// where the KO'd one is on screen (draw-fight.js calls this with the world's transform still on)
export function momentMark(g, v, F, D) {
  const K = v.ko; if (!K || K.sx != null) return;
  const f = F.f[K.i], x = f ? f.x : K.x, y = (f ? f.y - (f.z || 0) : K.y) - 26, m = g.getTransform();
  K.sx = (m.a * x + m.c * y + m.e) / D; K.sy = (m.b * x + m.d * y + m.f) / D;
}
// over the held frame: a dim, the flash, focus lines closing on the KO point (inked wedges and a few white ones)
function holdFx(g, v, K, ka, VW, VH, D) {
  const BD = bold(), sx = K.sx ?? VW / 2, sy = K.sy ?? VH / 2, k = ka / HOLD_T;
  g.save(); g.setTransform(D, 0, 0, D, 0, 0);
  g.fillStyle = `rgba(14,10,36,${(0.22 * ease(k * 3)).toFixed(3)})`; g.fillRect(0, 0, VW, VH);
  const R = Math.hypot(VW, VH), r0 = Math.min(VW, VH) * (0.3 - 0.06 * ease(k)), fr = Math.floor(v.t * 24);
  let seed = (fr * 9301 + 49297) % 233280; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let n = 0; n < 54; n++) {
    const a = n / 54 * TAU + rnd() * 0.09, w = (0.006 + rnd() * 0.014) * (n % 5 === 0 ? 1.6 : 1), r1 = r0 + rnd() * r0 * 0.5;
    const white = n % 4 === 1;
    g.fillStyle = white ? `rgba(255,255,255,${(0.55 * (1 - k * 0.5)).toFixed(3)})` : (BD ? `rgba(20,16,42,${(0.6 * ease(k * 4)).toFixed(3)})` : `rgba(10,8,26,${(0.55 * ease(k * 4)).toFixed(3)})`);
    g.beginPath(); g.moveTo(sx + Math.cos(a - w) * R, sy + Math.sin(a - w) * R); g.lineTo(sx + Math.cos(a) * r1, sy + Math.sin(a) * r1); g.lineTo(sx + Math.cos(a + w) * R, sy + Math.sin(a + w) * R); g.closePath(); g.fill();
  }
  if (ka < 0.09 && settings.flashes !== false) { g.fillStyle = `rgba(255,255,255,${(0.8 * (1 - ka / 0.09)).toFixed(3)})`; g.fillRect(0, 0, VW, VH); }
  g.restore();
}
// just after the hold: a soft second flash as the picture lets go
export function momentAfter(g, v, VW, VH, D) {
  const K = v.ko, ka = K ? v.t - K.t - HOLD_T : 9;
  if (!K || settings.reduced || ka < 0 || ka > 0.14 || settings.flashes === false) return;
  g.save(); g.setTransform(D, 0, 0, D, 0, 0); g.fillStyle = `rgba(255,255,255,${(0.4 * (1 - ka / 0.14)).toFixed(3)})`; g.fillRect(0, 0, VW, VH); g.restore();
}

// ---------------------------------------------------------------- the fighters: ready poses, the winner's hops
// returns { pose, mood, hop } overrides for fighter f (or null). Tux and Duke (three moves each, 2026-10-23) cheer and get
// ready in their own moves' poses (Tux: flippers up, then crouched for the torpedo; Duke: arms up, then the snap)
const CHEER3 = { tux: 'summon', duke: 'smashup' }, READY3 = { tux: 'crouch', duke: 'snap' };
export function momentPose(F, v, f) {
  const T = v.phaseT, K3 = FIGHTERS[f.id] && FIGHTERS[f.id].kit3, strike = K3 && CHEER3[f.id] || 'strike', wind = K3 && READY3[f.id] || 'wind';
  if (F.phase === 'intro' && (!f.pose || f.pose === 'stand') && f.state === 'idle') {
    const ph = T + f.i * 0.08;
    if (ph < 0.3) return null;
    if (ph < 0.9) return { pose: strike, mood: 'happy', hop: ph < 0.55 ? Math.sin((ph - 0.3) / 0.25 * Math.PI) * 12 : 0 };
    return { pose: wind, mood: null, hop: 0 };
  }
  if (F.phase === 'roundEnd' && F.roundWinner === f.i && f.state === 'win' && T > 0.45) {
    const u = T - 0.45, hop = u < 0.4 ? Math.sin(u / 0.4 * Math.PI) * 16 : 0;
    return { pose: u < 0.9 ? strike : '', mood: 'happy', hop };
  }
  if (F.phase === 'over' && F.winner === f.i && f.state === 'win') {
    const u = (T % 0.75) / 0.75;
    return { pose: u < 0.5 ? strike : '', mood: 'happy', hop: settings.reduced ? 0 : Math.max(0, Math.sin(u * TAU)) * 18 };
  }
  return null;
}

// ---------------------------------------------------------------- world-level overlays (after the world, before the HUD)
// the match won: the winner's colour washing in softly from the screen's edges (they stay clear in the middle)
export function momentWash(g, F, v, VW, VH, D) {
  if (F.phase !== 'over' || F.winner == null) return;
  const e = ease(v.phaseT / 0.8), c = rgb(PCOL[F.winner]), f = F.f[F.winner];
  const m = g.getTransform(), x = f ? (m.a * f.x + m.c * (f.y - 30) + m.e) / D : VW / 2, y = f ? (m.b * f.x + m.d * (f.y - 30) + m.f) / D : VH / 2;
  g.save(); g.setTransform(D, 0, 0, D, 0, 0);
  const R = Math.hypot(VW, VH) * 0.62, gr = g.createRadialGradient(x, y, Math.min(VW, VH) * 0.16, x, y, R);
  gr.addColorStop(0, `rgba(${c},0)`); gr.addColorStop(0.55, `rgba(${c},${(0.16 * e).toFixed(3)})`); gr.addColorStop(1, `rgba(${c},${(0.42 * e).toFixed(3)})`);
  g.fillStyle = gr; g.fillRect(0, 0, VW, VH); g.restore();
}

// ---------------------------------------------------------------- the HUD layer (screen units: Wh × Hh)
// under the HUD cards: the match won's streamers, sparkles and big portrait
export function momentUnder(g, F, v, dt, Wh, Hh) {
  if (F.phase !== 'over' || F.winner == null) { v.streamers = null; return; }
  const T = v.phaseT, w = F.winner, col = PCOL[w], BD = bold(), Y = BD ? BK.yellow : '#ffd23c', few = settings.reduced;
  // streamers: ribbons rippling down from the top, twisting as they fall (their width swings with the twist)
  if (!v.streamers) {
    v.streamers = [];
    const cols = [col, '#ffffff', Y, col];
    for (let k = 0; k < (few ? 6 : 16); k++) v.streamers.push({ x: frnd(0.03, 0.97), d: frnd(0, 0.9), sp: frnd(150, 260), L: frnd(80, 140), w: frnd(8, 13), ph: frnd(0, TAU), col: cols[k % 4], sw: frnd(10, 22) });
  }
  for (const s of v.streamers) {
    const u = T - s.d; if (u < 0) continue;
    const y0 = -s.L + u * s.sp, x0 = s.x * Wh;
    if (y0 > Hh + 20) continue;
    g.fillStyle = s.col; g.globalAlpha = 0.92;
    const N = 12, left = [], right = [];
    for (let i = 0; i <= N; i++) {
      const q = i / N, y = y0 + q * s.L, ph = s.ph + u * 5 + q * 4.2, x = x0 + Math.sin(ph) * s.sw * (0.4 + q * 0.6), tw = Math.cos(ph * 1.3 + q * 3) * s.w;
      left.push([x - tw / 2, y]); right.push([x + tw / 2, y]);
    }
    g.beginPath(); left.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]); g.closePath(); g.fill();
    g.globalAlpha = 1;
  }
  // the big portrait: their full 3D model, happy, sliding in on a skewed band on their side
  const side = w === 1 ? 1 : -1, size = portSize(Hh), inK = back((T - 0.2) / 0.45), out = 0;
  if (T > 0.2 && !v.cardUp) {
    const cx = Wh / 2 + side * (Wh / 2 - size * 0.42) + side * (1 - inK) * size * 1.2, cy = Hh - size * 0.5 - 6;
    g.save(); g.translate(cx, cy); g.transform(1, 0, -0.16, 1, 0, 0);
    const bw = size * 0.62, bh = size * 0.86;
    g.fillStyle = BD ? BK.ink : 'rgba(20,16,42,0.55)'; g.fillRect(-bw / 2 + 6 * side, -bh / 2 + 8, bw, bh);
    g.fillStyle = col; g.fillRect(-bw / 2, -bh / 2, bw, bh);
    g.fillStyle = 'rgba(255,255,255,0.18)'; for (let k = 0; k < 3; k++) g.fillRect(-bw / 2 + k * bw * 0.36, -bh / 2, bw * 0.12, bh);
    g.restore();
    const P = M3.portrait3D ? M3.portrait3D(F.f[w].id, { mood: 'happy', size, view: 'full', yaw: w === 1 ? Math.PI / 2 + 0.42 : Math.PI / 2 - 0.42 }) : null;
    if (P) g.drawImage(P, cx - size / 2, cy - size / 2, size, size);
    else fightHead(g, charOf(F.f[w].id), cx, cy, size * 0.3, '#ffffff', 'happy', v.t);
    // sparkles twinkling round it
    for (let k = 0; k < (few ? 3 : 7); k++) {
      const ph = (v.t * 1.3 + k * 0.37) % 1, a = Math.sin(ph * Math.PI), x = cx + Math.cos(k * 2.4) * size * 0.42, y = cy + Math.sin(k * 1.7) * size * 0.4 - ph * 14;
      g.save(); g.globalAlpha = a * ease(inK); starPath(g, x, y, 4 + (k % 3) * 2.5, 1.2 + (k % 3) * 0.6, 4, 0); g.fillStyle = k % 2 ? '#ffffff' : Y; g.fill(); g.restore();
    }
  }
}
export const portSize = Hh => Math.max(128, Math.round(Math.min(Hh * 0.5, 448) / 64) * 64);
// over the HUD: the round intro and the start, and the round number
export function momentOver(g, F, v, Wh, Hh) {
  if (F.phase === 'intro') intro(g, F, v, v.phaseT, Wh, Hh);
  else if (F.phase === 'fight' && v.phaseT < 0.6 && F.clock > (F.cfg.roundTime || 60) - 1) start(g, v.phaseT, Wh, Hh);
}
function intro(g, F, v, T, Wh, Hh) {
  const BD = bold(), cy = Hh * 0.42, bh = Math.min(120, Hh * 0.17), Y = BD ? BK.yellow : '#ffd23c';
  // the bands with the portraits
  const inK = ease(T / 0.26), outK = clamp((T - 0.58) / 0.2, 0, 1), outE = outK * outK;
  if (outK < 1) for (const i of [0, 1]) {
    const dir = i ? -1 : 1, off = -dir * ((1 - inK) * Wh * 0.6 + outE * Wh * 0.7), col = PCOL[i];
    g.save(); g.translate(Wh / 2 + off, cy + (i ? bh * 0.08 : -bh * 0.08)); g.transform(1, 0, -0.22, 1, 0, 0);
    const x0 = i ? 0 : -Wh, x1 = i ? Wh : 0;
    g.fillStyle = BD ? BK.ink : 'rgba(255,255,255,0.85)'; g.fillRect(x0 - 6, -bh / 2 - 6, x1 - x0 + 12, bh + 12);
    g.fillStyle = col; g.fillRect(x0, -bh / 2, x1 - x0, bh);
    g.save(); g.beginPath(); g.rect(x0, -bh / 2, x1 - x0, bh); g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineCap = 'round';
    for (let n = 0; n < 10; n++) { const yy = ((n * 37) % 64 - 32) / 64 * bh, len = 50 + (n * 53) % 90, xx = (((n * 211 + T * 1400 * dir) % (Wh * 1.2)) + Wh * 1.2) % (Wh * 1.2) * (i ? 1 : -1); g.lineWidth = n % 3 ? 2 : 3.5; g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + len * (i ? 1 : -1), yy); g.stroke(); }
    g.restore(); g.restore();
    const R = bh * 0.62, px = Wh / 2 + off - dir * (R + Math.min(140, Wh * 0.1));
    fightHead(g, charOf(F.f[i].id), px, cy + (i ? bh * 0.08 : -bh * 0.08), R, '#ffffff', 'happy', v.t);
    if (BD) { g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.beginPath(); g.arc(px, cy + (i ? bh * 0.08 : -bh * 0.08), R, 0, TAU); g.stroke(); }
  }
  // the meeting: a white impact star behind VS, VS popping in
  const vk = T - VS_AT;
  if (vk > -0.02 && T < 0.82) {
    const fade = T > 0.62 ? 1 - (T - 0.62) / 0.2 : 1;
    g.save(); g.translate(Wh / 2, cy); g.globalAlpha = clamp(fade, 0, 1);
    const fl = clamp(vk / 0.12, 0, 1);
    if (vk < 0.25) { g.save(); g.globalAlpha *= 1 - clamp(vk / 0.25, 0, 1); impact(g, 0, 0, bh * (0.9 + fl * 0.6), '#ffffff', 11, 7); g.restore(); }
    const s = 1.8 - 0.8 * ease(vk / 0.14); g.scale(s, s); g.rotate(-0.08);
    g.font = disp(Math.round(bh * 0.62)); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = 9; g.strokeStyle = BD ? BK.ink : 'rgba(20,16,42,0.85)'; g.strokeText('VS', 0, 2);
    g.fillStyle = Y; g.fillText('VS', 0, 0);
    g.restore();
  }
  // the round's badge above: its number, the rounds as pips
  const bk = ease((T - 0.08) / 0.2) * (T > 0.62 ? 1 - clamp((T - 0.62) / 0.2, 0, 1) : 1);
  if (bk > 0.01) {
    const by = cy - bh * 0.5 - 52, nr = F.cfg.bestOf || 3;
    g.save(); g.translate(Wh / 2, by); g.scale(bk, bk);
    g.fillStyle = BD ? BK.ink : 'rgba(20,16,42,0.6)'; badge(g, 3, 4, 34);
    g.fillStyle = BD ? BK.surface2 : '#2b2560'; badge(g, 0, 0, 34);
    g.strokeStyle = Y; g.lineWidth = 3; g.stroke();
    g.font = disp(30); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff'; g.fillText(String(F.round), 0, 1);
    for (let k = 0; k < nr; k++) { g.beginPath(); g.arc((k - (nr - 1) / 2) * 14, 44, 4.5, 0, TAU); g.fillStyle = k < F.round ? Y : 'rgba(255,255,255,0.3)'; g.fill(); }
    g.restore();
  }
  // 3, 2, 1: each drums in big with short streaks off it
  for (let n = 0; n < 3; n++) {
    const a = INTRO_COUNT[n], b = n < 2 ? INTRO_COUNT[n + 1] : 1.6, k = (T - a) / (b - a);
    if (k < 0 || k >= 1) continue;
    const s = 1.6 - 0.6 * ease(k * 3), al = k > 0.7 ? (1 - k) / 0.3 : 1;
    g.save(); g.translate(Wh / 2, Hh * 0.44); g.globalAlpha = al;
    if (k < 0.5) streaks(g, 0, 0, 70 + k * 120, 0.9 * (1 - k * 2), Y, 10, n);
    g.scale(s, s);
    g.font = disp(110); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const txt = String(3 - n);
    if (BD) { g.fillStyle = BK.ink; g.fillText(txt, 4, 6); g.fillStyle = Y; g.fillText(txt, 0, 0); }
    else { g.lineWidth = 12; g.strokeStyle = 'rgba(20,16,42,0.65)'; g.strokeText(txt, 0, 0); g.fillStyle = Y; g.fillText(txt, 0, 0); }
    g.restore();
  }
}
// the start: a comic impact star bursting at the middle, a white core, streaks flying off
function start(g, T, Wh, Hh) {
  const BD = bold(), Y = BD ? BK.yellow : '#ffd23c', k = T / 0.6, s = 0.5 + ease(k * 2.2) * 0.9;
  g.save(); g.translate(Wh / 2, Hh * 0.44); g.globalAlpha = 1 - k * k;
  streaks(g, 0, 0, 90 + k * 260, 1 - k, '#ffffff', 16, 7);
  g.scale(s, s); g.rotate(k * 0.25);
  if (BD) { g.save(); g.translate(5, 7); impact(g, 0, 0, 92, BK.ink, 12, 3); g.restore(); }
  impact(g, 0, 0, 92, Y, 12, 3); impact(g, 0, 0, 56, '#ffffff', 12, 5);
  g.restore();
}
// a jagged comic impact star (uneven points)
function impact(g, x, y, R, col, n, seed) {
  g.beginPath();
  for (let k = 0; k < n * 2; k++) {
    const a = k / (n * 2) * TAU - Math.PI / 2, q = k % 2 ? 0.48 + 0.08 * Math.sin(seed + k * 1.7) : 0.86 + 0.14 * Math.sin(seed * 2 + k * 2.3);
    g.lineTo(x + Math.cos(a) * R * q, y + Math.sin(a) * R * q * 0.92);
  }
  g.closePath(); g.fillStyle = col; g.fill();
}
// tapered streaks flying out from (x, y) at radius r
function streaks(g, x, y, r, al, col, n, seed) {
  if (al <= 0) return;
  g.save(); g.globalAlpha *= clamp(al, 0, 1); g.fillStyle = col;
  for (let k = 0; k < n; k++) {
    const a = k / n * TAU + Math.sin(seed + k * 3.1) * 0.2, L = r * (0.35 + 0.2 * Math.sin(seed + k)), w = 3 + (k % 3) * 1.5, c = Math.cos(a), s = Math.sin(a);
    const x0 = x + c * r, y0 = y + s * r * 0.8, x1 = x + c * (r + L), y1 = y + s * (r + L) * 0.8;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 - s * w, y1 + c * w); g.lineTo(x1 + c * w, y1 + s * w); g.lineTo(x1 + s * w, y1 - c * w); g.closePath(); g.fill();
  }
  g.restore();
}
// a badge: a rounded shield shape (the round number sits on it)
function badge(g, x, y, r) {
  g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x + r * 0.95, y - r * 0.95, x + r, y - r * 0.1); g.quadraticCurveTo(x + r * 0.9, y + r * 0.75, x, y + r * 1.05); g.quadraticCurveTo(x - r * 0.9, y + r * 0.75, x - r, y - r * 0.1); g.quadraticCurveTo(x - r * 0.95, y - r * 0.95, x, y - r); g.closePath(); g.fill();
}
// the round winner's confetti (draw-fight.js particles: kind 'confetti'): a paper bit fluttering down, its face turning
export function confetti(g, p, k, dt) {
  p.vy += 380 * dt; p.vx *= 1 - 1.6 * dt; p.vy = Math.min(p.vy, 120);
  const flip = Math.cos(p.fl + p.t * 9);
  g.save(); g.translate(p.x + Math.sin(p.fl + p.t * 5) * 6, p.y); g.rotate(p.a + p.t * p.sp * 0.3); g.globalAlpha *= k > 0.75 ? (1 - k) / 0.25 : 1;
  g.fillStyle = p.col; g.fillRect(-p.s, -p.s * 0.55 * Math.abs(flip) - 0.3, p.s * 2, p.s * 1.1 * Math.abs(flip) + 0.6);
  g.restore();
}
