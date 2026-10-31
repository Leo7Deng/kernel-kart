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
//   round won    the camera eases onto the winner under a spotlight, a hop and confetti; the score card rises under
//                them, then a dip to dark into the next intro
//   match won    ('over') the camera pushes in on the winner, their colour washes in, streamers; then the results screen
import { CHARACTERS, PCOL, TAU, clamp, frnd, lerp } from './core.js';
import { BK, BOLD_DISPLAY, BOLD_W, bold } from './look.js';
import { FONT } from './art.js';
import * as M3 from './art/model3d.js';
import { settings } from './settings.js';
import { fightHead, starPath } from './draw-fight.js';
import { FIGHTERS } from './fight-chars.js';
import { winsToTake } from './fight.js';
import { bit3, drawProp3D, propReady } from './art/prop3d.js';

export const INTRO_COUNT = [0.65, 0.95, 1.25];   // when 3, 2 and 1 come in (s into the intro; fight-ui.js drums on these)
export const VS_AT = 0.24;                       // the bands meeting: the VS flash (and fVs's clang)
export const HOLD_T = 0.3;                       // a KO's held frame
const charOf = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
const disp = s => bold() ? `${BOLD_W}${s}px ${BOLD_DISPLAY}` : `${s}px "Bungee", ${FONT}`;
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const back = k => { k = clamp(k, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const rgb = h => { const n = parseInt(h.slice(1), 16); return `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`; };
const decided = F => F.roundWinner != null && F.wins[F.roundWinner] >= winsToTake(F.cfg);

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
  if (F.phase === 'roundEnd') {
    // the KO's hold on the knocked-out one, then the winner (a bit high, so the score card fits under), or both on a draw
    const f = K && F.f[K.i], w = F.roundWinner != null ? F.f[F.roundWinner] : null;
    if (K && f && ka < HOLD_T + 0.05) return { x: w ? lerp(w.x, f.x, 0.65) : f.x, y: (w ? lerp(w.y, f.y, 0.65) : f.y) - 30, z: base * 1.45, k: 9 };
    if (settings.reduced) return null;
    if (w) return { x: w.x, y: w.y - 4, z: base * 1.6, k: 2.6 };
    return { x: (F.f[0].x + F.f[1].x) / 2, y: (F.f[0].y + F.f[1].y) / 2 - 20, z: base * 1.15, k: 2 };
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

// ---------------------------------------------------------------- the fighters: ready poses, the winner's celebration
// returns { pose, mood, hop, yaw, wx, sq, lean } overrides for fighter f (or null; b: its draw-body.js memory). Tux and
// Duke get ready in their own moves' poses (Tux: flippers up, then crouched for the torpedo; Duke: arms up, the snap)
const CHEER3 = { tux: 'summon', duke: 'jab1' }, READY3 = { tux: 'crouch', duke: 'snap' };
// the winner's celebration: hops in `up` (arms, wings, claws up), then a beat in `rest` with their own flourish
//   (pyth: no hops, his head bobbing; ferris: claws snapping; duke: twirling his pocket watch, momentProp; docky: a
//   spout of water, drops raining off it, turned more so he reads side-on (yaw); swifty: hovering on his wings)
const CELEB = {
  tux: { up: 'summon', rest: 'armup' }, duke: { up: 'air', rest: 'snapup' }, gopher: { up: 'pop', rest: 'whistle' },
  ferris: { up: 'decree', rest: 'pinch', alt: 'lasso' }, pyth: { up: 'rear', rest: 'cast', bob: 1 }, octo: { up: 'fork', rest: 'coil' },
  docky: { up: 'swell', rest: 'breach', yaw: 0.9 }, swifty: { up: 'flap', rest: 'hover', float: 1 }, cpp: { up: 'air', rest: 'rear' },
  droid: { up: 'antenna', rest: 'airplane' },
};
const TURN = 0.3, LOOP = 1.45, HOPS = [[0, 13], [0.34, 11], [0.68, 16]], HOP_T = 0.3;
const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
export function momentPose(F, v, f, b) {
  const T = v.phaseT, strike = CHEER3[f.id] || 'strike', wind = READY3[f.id] || 'wind';
  if (F.phase === 'intro' && (!f.pose || f.pose === 'stand') && f.state === 'idle') {
    const ph = T + f.i * 0.08;
    if (ph < 0.3) return null;
    if (ph < 0.9) return { pose: strike, mood: 'happy', hop: ph < 0.55 ? Math.sin((ph - 0.3) / 0.25 * Math.PI) * 12 : 0 };
    return { pose: wind, mood: null, hop: 0 };
  }
  const won = f.state === 'win' && ((F.phase === 'roundEnd' && F.roundWinner === f.i) || (F.phase === 'over' && F.winner === f.i));
  if (!won || !b) { if (b) b.winAt = -1; return null; }
  if (b.winAt < 0) { b.winAt = v.t; b.y0 = f.face + 0.35 * Math.sin(Math.PI / 2 - f.face); const o = F.f[1 - f.i]; b.away = o && Math.abs(o.x - f.x) > 1 ? -Math.sign(o.x - f.x) : (f.i ? 1 : -1); }
  const u = v.t - b.winAt, C = CELEB[f.id] || { up: 'strike', rest: '' }, few = settings.reduced, H = few ? 0.5 : 1;
  // turned to face you, a half a body's step away from the loser
  const R = { pose: '', mood: 'happy', hop: 0, sq: 0, lean: 0, yaw: angLerp(b.y0, Math.PI / 2 - b.away * (C.yaw ?? 0.25), ease(u / TURN)), wx: b.away * 22 * ease(u / 0.45) };
  b.wx = R.wx;
  const c = u - TURN;
  if (c < 0) { R.sq = 0.07 * ease(u / TURN); R.pose = C.rest; return R; }   // (a dip, gathering for the first hop)
  const k = c % LOOP;
  if (C.bob) {   // Pyth: no legs to hop on: rearing up, his head bobbing to the beat
    R.pose = k < LOOP * 0.6 ? C.up : C.rest; R.lean = 0.11 * Math.sin(c * TAU * 2.1) * H; R.sq = -0.035 * Math.abs(Math.sin(c * TAU * 2.1)) * H; R.hop = 2 * Math.abs(Math.sin(c * TAU * 2.1)) * H;
    return R;
  }
  let hop = -1;
  for (let j = 0; j < HOPS.length; j++) if (k >= HOPS[j][0] && k < HOPS[j][0] + HOP_T) hop = j;
  if (hop >= 0) {
    const q = (k - HOPS[hop][0]) / HOP_T;
    R.pose = C.up;
    if (q < 0.18) R.sq = 0.11 * (1 - q / 0.18);   // (squashed on the floor: landing from the last, pushing off into this one)
    else { const a = (q - 0.18) / 0.82; R.hop = HOPS[hop][1] * H * Math.sin(Math.PI * a); R.sq = -0.07 * Math.sin(Math.PI * a); }
    R.lean = 0.05 * Math.sin(q * TAU) * (hop % 2 ? 1 : -1);
  } else {
    const d = k - (HOPS[2][0] + HOP_T);   // (after the last hop: landed, settling, the flourish)
    R.pose = C.alt && Math.floor(d / 0.14) % 2 ? C.alt : C.rest;
    R.sq = 0.13 * Math.exp(-Math.max(0, d) * 13) * Math.cos(Math.max(0, d) * 24);
    if (C.float) { R.hop = 7 * H * ease(d / 0.15) + 2 * Math.sin(d * 9); R.sq = 0; }
  }
  return R;
}
// the celebration's props over the winner (g: at their feet): Duke's pocket watch twirling on its chain from his raised
// hand; Docky's spout raining drops round him (3D bits)
export function momentProp(g, F, v, f, b, pose) {
  if (!b || b.winAt < 0) return;
  if (f.id === 'duke' && pose === 'snapup') {
    const a = v.t * 11, hx = -27, hy = -48, wx = hx + Math.cos(a) * 9, wy = hy + 6 + Math.sin(a) * 3.5;
    g.save(); g.strokeStyle = bold() ? BK.ink : '#3a3020'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(hx, hy); g.lineTo(wx, wy); g.stroke();
    if (M3 && propReady('watch')) { g.translate(wx, wy); g.rotate(a * 0.5); drawProp3D(g, 'watch', { scale: 1 }); }
    else {   // (a 2D one till the 3D one's made: a gold case, a white face, its hand)
      g.fillStyle = bold() ? BK.ink : '#5a4416'; g.beginPath(); g.arc(wx, wy, 4.6, 0, TAU); g.fill();
      g.fillStyle = '#f2c94c'; g.beginPath(); g.arc(wx, wy, 3.9, 0, TAU); g.fill();
      g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(wx, wy, 2.7, 0, TAU); g.fill();
      g.strokeStyle = '#3a3020'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx + Math.sin(a) * 2, wy - Math.cos(a) * 2); g.stroke();
    }
    g.restore();
  }
  if (f.id === 'docky' && pose === 'breach' && !settings.reduced && v.t - (b.dropT || 0) > 0.07) {
    b.dropT = v.t; const a = frnd(0, TAU), sp = frnd(30, 70);
    bit3(v, 'dkdrop', f.x + (b.wx || 0), f.y, 66, { dx: Math.cos(a) * sp, dy: Math.sin(a) * sp * 0.6, dz: frnd(40, 110), s: frnd(1.3, 2.1), life: frnd(0.45, 0.7), g: 520, bo: 0 });
  }
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

// the round won: a spotlight beam on the winner, the arena dimmed round it; then a dip to dark into the next intro.
// Reduced effects: the dip only
export const SPOT_AT = 0.38, DIP_AT = 1.68, DIP_OUT = 0.3;   // (s into 'roundEnd': the beam; the dip; s into 'intro': back up)
export function momentSpot(g, F, v, VW, VH, D) {
  if (F.cfg.practice) return;
  const T = v.phaseT, few = settings.reduced;
  let dip = 0;
  if (F.phase === 'roundEnd' && !decided(F)) dip = ease((T - DIP_AT) / 0.3);
  else if (F.phase === 'intro' && F.round > 1) dip = 1 - ease(T / DIP_OUT);
  const w = F.phase === 'roundEnd' && !few ? (F.roundWinner != null ? F.f[F.roundWinner] : null) : null;
  const a = w ? ease((T - SPOT_AT) / 0.35) * (1 - dip) : 0;
  if (a <= 0.005 && dip <= 0.005) return;
  const m = g.getTransform(), z = Math.hypot(m.a, m.b) / D;
  g.save(); g.setTransform(D, 0, 0, D, 0, 0);
  if (a > 0.005) {
    const BD = bold(), x = (m.a * w.x + m.c * w.y + m.e) / D, y = (m.b * w.x + m.d * w.y + m.f) / D;
    const bw = Math.max(70, 46 * z), top = -VH * 0.08, tx = x - VH * 0.32, tw = bw * 0.32, ry = bw * 0.3;
    const cone = () => { g.moveTo(tx - tw, top); g.lineTo(tx + tw, top); g.lineTo(x + bw, y); g.ellipse(x, y, bw, ry, 0, 0, Math.PI); g.lineTo(x - bw, y); g.closePath(); };
    // the dark round the beam (the beam and its pool cut out of it)
    g.beginPath(); g.rect(0, 0, VW, VH); cone(); g.fillStyle = `rgba(14,10,36,${(0.5 * a).toFixed(3)})`; g.fill('evenodd');
    // the beam: brighter toward its middle (two layers, flat in the flat look; a soft gradient in Classic)
    g.save(); g.beginPath(); cone(); g.clip();
    if (BD) { g.fillStyle = `rgba(255,250,225,${(0.1 * a).toFixed(3)})`; g.fillRect(0, 0, VW, VH); }
    else { const gr = g.createLinearGradient(0, top, 0, y); gr.addColorStop(0, `rgba(255,250,225,${(0.2 * a).toFixed(3)})`); gr.addColorStop(1, `rgba(255,250,225,${(0.06 * a).toFixed(3)})`); g.fillStyle = gr; g.fillRect(0, 0, VW, VH); }
    g.beginPath(); g.moveTo(tx - tw * 0.45, top); g.lineTo(tx + tw * 0.45, top); g.lineTo(x + bw * 0.5, y); g.lineTo(x - bw * 0.5, y); g.closePath();
    g.fillStyle = `rgba(255,250,225,${(0.07 * a).toFixed(3)})`; g.fill();
    // motes drifting down the beam
    for (let k = 0; k < 9; k++) {
      const q = ((v.t * 0.11 + k * 0.137) % 1), px = lerp(tx, x, q) + Math.sin(k * 2.3 + v.t * 0.8) * lerp(tw, bw, q) * 0.7, py = lerp(top, y, q);
      g.globalAlpha = a * Math.sin(q * Math.PI) * 0.7; starPath(g, px, py, 2.6 + (k % 3), 0.7, 4, 0); g.fillStyle = '#fffbe6'; g.fill();
    }
    g.restore();
  }
  if (dip > 0.005) { g.fillStyle = `rgba(14,10,36,${(0.62 * dip).toFixed(3)})`; g.fillRect(0, 0, VW, VH); }
  g.restore();
}

// ---------------------------------------------------------------- the HUD layer (screen units: Wh × Hh)
// under the HUD cards: the match won's streamers
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
}
export const portSize = Hh => Math.max(128, Math.round(Math.min(Hh * 0.5, 448) / 64) * 64);
// over the HUD: the round intro and the start, and the round number
export function momentOver(g, F, v, Wh, Hh) {
  if (F.phase === 'intro') { if (!F.cfg.practice) roundCard(g, F, v, v.phaseT, Wh, Hh); intro(g, F, v, v.phaseT, Wh, Hh); }
  else if (F.phase === 'roundEnd' && !F.cfg.practice) roundCard(g, F, v, v.phaseT, Wh, Hh);
  else if (F.phase === 'fight' && !F.cfg.practice && v.phaseT < 0.6 && F.clock > (F.cfg.roundTime || 60) - 1) start(g, v.phaseT, Wh, Hh);
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
    const by = cy - bh * 0.5 - 52, nr = 0;   // (the rounds as pips: gone with first-to-n matches; the HUD's stars say it)
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
// the round's score card under the winner: both faces, the score, stars (the new one popping), the next round on its
// tab; skipped when the round decided the match. Reduced effects: a fade
export const CARD_AT = 0.86;
function roundCard(g, F, v, T, Wh, Hh) {
  const rs = F.rounds || [], r = rs[rs.length - 1]; if (!r) return;
  const intro = F.phase === 'intro';
  if (!intro && decided(F)) return;
  const u = intro ? T + (2 - CARD_AT) : T - CARD_AT; if (u < 0) return;
  const few = settings.reduced, outK = intro ? clamp(T / 0.26, 0, 1) : 0; if (outK >= 1) return;
  const BD = bold(), w = r.winner, need = winsToTake(F.cfg), Y = BD ? BK.yellow : '#ffd23c', INK = BD ? BK.ink : 'rgba(14,10,36,0.5)';
  const next = intro ? F.round : F.round + 1, fin = F.wins[0] === need - 1 && F.wins[1] === need - 1;
  const label = w == null ? `Draw · Round ${next}` : fin ? 'Final round' : `Round ${next}`, tabCol = w == null ? (BD ? BK.surface2 : '#4b4680') : PCOL[w];
  const s = clamp(Math.min(Wh / 540, Hh / 430), 0.6, 1.2), pw = Math.min(470 * s, Wh - 24), ph = 104 * s;
  const cy = Math.min(Hh * 0.76, Hh - (v.reserveH || 0) - 62 - ph / 2);
  const inK = few ? 1 : back(u / 0.32), al = few ? clamp(u / 0.2, 0, 1) * (1 - outK) : clamp(u / 0.12, 0, 1) * (1 - outK);
  g.save(); g.globalAlpha = al; g.translate(Wh / 2, cy + (few ? 0 : (1 - inK) * 40 + outK * outK * 30));
  if (!few) { const sc = 0.85 + 0.15 * inK; g.scale(sc, sc); }
  // the card: an inked edge under it (flat) or a soft shadow, the panel, a lighter top edge
  const R = Math.min(20 * s, BD ? BK.r + 4 : 22);
  g.fillStyle = INK; g.beginPath(); g.roundRect(-pw / 2, -ph / 2 + 5, pw, ph, R); g.fill();
  g.fillStyle = BD ? BK.panel : '#221d52'; g.beginPath(); g.roundRect(-pw / 2, -ph / 2, pw, ph, R); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.roundRect(-pw / 2, -ph / 2, pw, ph * 0.4, [R, R, 0, 0]); g.fill();
  // the tab on top: the next round
  g.font = disp(Math.round(15 * s)); const tw = g.measureText(label).width + 28 * s, th = 26 * s, ty = -ph / 2 - th * 0.62;
  g.save(); g.translate(0, ty); g.transform(1, 0, -0.14, 1, 0, 0);
  g.fillStyle = INK; g.beginPath(); g.roundRect(-tw / 2 + 2, -th / 2 + 3, tw, th, 8 * s); g.fill();
  g.fillStyle = tabCol; g.beginPath(); g.roundRect(-tw / 2, -th / 2, tw, th, 8 * s); g.fill();
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 0, 1);
  g.restore();
  // the faces at the two ends
  const fr = ph * 0.33, fx = pw / 2 - fr - 16 * s;
  [0, 1].forEach(i => {
    const x = (i ? 1 : -1) * fx, won = i === w, rr = fr * (won ? 1.08 : 0.94);
    g.save(); if (!won) g.globalAlpha *= 0.9;
    g.fillStyle = PCOL[i]; g.beginPath(); g.arc(x, 0, rr + 3 * s, 0, TAU); g.fill();
    fightHead(g, charOf(F.f[i].id), x, 0, rr, '#ffffff', won ? 'happy' : 'dizzy', v.t);
    if (won) { g.strokeStyle = Y; g.lineWidth = 4 * s; g.beginPath(); g.arc(x, 0, rr + 5 * s, 0, TAU); g.stroke(); }
    g.restore();
  });
  // the score, each side's stars under its number
  const gx = Math.min(pw * 0.14, 66 * s), ss = Math.min(9.5 * s, (fx - fr - gx) / (need * 1.3 + 0.5)), sp = ss * 2.4, pop = clamp((u - 0.16) / 0.3, 0, 1);
  g.font = disp(Math.round(ph * 0.44)); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  [0, 1].forEach(i => {
    const x = (i ? 1 : -1) * gx, won = i === w, k = won && !few ? 1 + 0.3 * Math.sin(pop * Math.PI) : 1, t = String(F.wins[i]);
    g.save(); g.translate(x, -ph * 0.1); g.scale(k, k);
    if (BD) { g.fillStyle = BK.ink; g.fillText(t, 2.5 * s, 3.5 * s); } else { g.lineWidth = 6 * s; g.strokeStyle = 'rgba(14,10,36,0.6)'; g.strokeText(t, 0, 0); }
    g.fillStyle = won ? Y : '#ffffff'; g.fillText(t, 0, 0); g.restore();
    const sy = ph * 0.27;
    for (let n = 0; n < need; n++) {
      const sx = x + (n - (need - 1) / 2) * sp, on = n < F.wins[i], fresh = won && n === F.wins[i] - 1, q = fresh && !few ? clamp((u - 0.22) / 0.34, 0, 1) : 1;
      if (fresh && q > 0 && q < 1) for (let j = 0; j < 6; j++) {   // a burst of little stars off the new one
        const ang = j / 6 * TAU + 0.3, d = ss * (1 + q * 2.4);
        g.save(); g.globalAlpha *= 1 - q; starPath(g, sx + Math.cos(ang) * d, sy + Math.sin(ang) * d, ss * 0.45, ss * 0.18, 4, ang); g.fillStyle = j % 2 ? '#ffffff' : Y; g.fill(); g.restore();
      }
      const k2 = on ? (fresh ? back(q) : 1) : 0.9, lit = on && (!fresh || q > 0.05);
      if (BD) { starPath(g, sx + 1.2, sy + 1.8, ss * k2, ss * 0.5 * k2, 5, -Math.PI / 2); g.fillStyle = BK.ink; g.fill(); }
      starPath(g, sx, sy, ss * k2, ss * 0.5 * k2, 5, -Math.PI / 2); g.fillStyle = lit ? Y : 'rgba(255,255,255,0.16)'; g.fill();
    }
  });
  g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.roundRect(-7 * s, -ph * 0.1 - 2.5 * s, 14 * s, 5 * s, 2.5 * s); g.fill();
  g.restore();
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
