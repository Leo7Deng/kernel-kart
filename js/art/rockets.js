// Kernel Kart art: Moonshot's rockets and capsules (race-rocket.js), all drawn live from the race clock and each kart's
// ride (c.bay, c.dockT, c.rkL), so every screen shows the same launch. A rocket is a cute two-stage cartoon: a white
// booster with fins and three engine bells, a grey interstage, an upper stage with a porthole, its nose and stripes in
// the colour of the racer it's for (a player's colour, a bot's own; white and red until someone's booked it). Its
// launch: the gantry's arm takes the kart in and swings back, steam spills out of the flame trench, the engines light,
// and it goes, a long flame with shock diamonds over a pool of light on the pad, a great cloud of exhaust rolling out
// across the pad and the grass, sparks, a few birds scattering; up through the sky with a trail of smoke behind it
// (thinning to a bright streak in space), bigger as it climbs toward you, its booster falling away halfway, then down on
// its legs onto its pad on the Moon in a ring of dust. A capsule: a gumdrop with a porthole and a heat shield, glowing
// with plasma and trailing fire through re-entry, a little drogue chute, then three striped mains that blossom open, a
// crown of spray at the splashdown and the chutes settling on the water.
import { PCOL, TAU, clamp, frnd, lerp, mulberry } from '../core.js';
import { CAP, FLY_T, HATCH, climbU, rowsOf } from '../race-rocket.js';
import { trackSample } from '../geometry.js';
import { puffSprite, glowSprite, stamp } from '../fx-sprites.js';
import { bold, BK } from '../look.js';
import { alpha, circ, ell, linear, mix, radial, shade } from './paint.js';
import { VIEW } from '../view.js';

export const RS = 220;   // a rocket's height (world units)
// whose colour a rocket wears
export const racerCol = c => c.human ? PCOL[c.pIndex] : c.ch.color;
const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);

// ------------------------------------------------------------------------------------------------ the rockets' states
// every rocket of this race: { j, c (the kart it's for, or null), E (its Earth pad), M (its Moon pad), e (time since
// liftoff, null before it's booked), x, y (where its base is drawn), k (its size), stage (2: the booster's gone),
// flame (0..1), land (on the Moon), shadow }
export function rocketsOf(race) {
  const t = race.time, R = rowsOf(race), out = [], by = [];
  for (const c of race.cars) if (c.bay >= 0) by[c.bay] = c;
  for (let j = 0; j < R.n; j++) {
    const B = R.bays[j], M = R.mpads[j], c = by[j] || null, E = B.pad;
    const Rk = { j, c, E, M: M.pad, col: c ? racerCol(c) : null, e: null, x: E.x, y: E.y, k: 1, stage: 1, flame: 0, land: false, fly: false, dockT: c && c.dockT, rkL: c && c.rkL };
    if (c && c.rkL > 0 && c.dockT > 0) {
      const e = t - c.rkL; Rk.e = e;
      if (e >= 0 && e < FLY_T) {
        const u = climbU(e / FLY_T); Rk.u = u; Rk.fly = true;
        Rk.x = lerp(E.x, Rk.M.x, u); Rk.y = lerp(E.y, Rk.M.y, u);
        Rk.k = 1 + 0.6 * Math.sin(Math.PI * clamp(u * 1.15, 0, 1)) ** 0.8;   // nearer the camera as it climbs, back to life size for the landing
        Rk.stage = u > SEP ? 2 : 1; Rk.flame = u > 0.86 ? 0.55 + 0.45 * Math.sin(t * 30) * 0.2 : 1;
      } else if (e >= FLY_T) { Rk.x = Rk.M.x; Rk.y = Rk.M.y; Rk.land = true; Rk.stage = 2; Rk.flame = e < FLY_T + 0.35 ? 0.5 * (1 - (e - FLY_T) / 0.35) : 0; }
      else Rk.flame = e > -1 ? 0.25 + 0.75 * ease((e + 1) / 1) * (0.35 + 0.1 * Math.sin(t * 50)) : 0;   // lighting up
    }
    out.push(Rk);
  }
  return out;
}
// every capsule of this race: { j, c (the kart it's for, or null), P (its pad on the Moon), Z (its zone in the sea), col,
// e (time since liftoff, null before it's booked), stand (still on its stand), x, y (where it is: the kart's own spot on
// its ride), flame (its engine lighting), dockT }. Gone once its kart is out (lifted onto the dock).
export function capsulesOf(race) {
  const t = race.time, R = rowsOf(race), out = [], by = [];
  for (const c of race.cars) if (c.cbay >= 0) by[c.cbay] = c;
  for (let j = 0; j < R.n; j++) {
    const B = R.rbays[j], c = by[j] || null, P = B.pad;
    const Ck = { j, c, P, Z: R.zones[j].pad, col: c ? racerCol(c) : null, e: null, stand: true, x: P.x, y: P.y, flame: 0, dockT: c ? c.cdockT : 0 };
    if (c && c.cL > 0) {
      const e = t - c.cL; Ck.e = e;
      if (e >= 0) { if (!(c.flyK === 1 && c.flyT > 0) && t > c.cOut + 0.2) continue; Ck.stand = false; Ck.x = c.x; Ck.y = c.y; }
      else Ck.flame = e > -0.8 ? 0.4 + 0.6 * ease((e + 0.8) / 0.8) : 0;
    }
    out.push(Ck);
  }
  return out;
}
export const SEP = 0.4;   // where along its climb the booster drops away

// ------------------------------------------------------------------------------------------------ a rocket
// A chunky cartoon rocket standing up on the screen, its base at (x, y), s tall: a fat white body with a round nose cone,
// a big porthole, two swept fins and a front fin, a band at the seam and one near the base, all in its racer's colour
// (white and red until someone's booked it). Flat fills, one shade (its right side, lit from the top left), one
// highlight down its left, an ink outline. Two stages: the booster (the fins, the cargo hatch, the engine) and the upper
// stage (the porthole, the nose) above the seam at SEAM. stage 2: just the upper stage (the booster's gone: its own little
// engine). flame: 0..1. legs: 0..1, out for the Moon. hatch: someone's aboard (the porthole lit). door: the cargo hatch
// on the ramp's side (doorX: which side) open, 0..1.
const SEAM = -0.52, BODY = '#f1f3f6', BODY_SH = '#d3d9e2', CHROME = '#c3cad6', BELL = '#5b6271', GLASS = '#6ec6ff';
const inkOf = (s, BD) => [BD ? BK.ink : '#3a3f4b', Math.max(1.4, s * (BD ? 0.014 : 0.011))];
// the booster's body: from just above its engine up to the seam (y up the screen negative, in s)
function lowerPath(ctx, s) {
  ctx.beginPath(); ctx.moveTo(-0.19 * s, -0.05 * s);
  ctx.bezierCurveTo(-0.24 * s, -0.17 * s, -0.25 * s, -0.36 * s, -0.245 * s, SEAM * s);
  ctx.lineTo(0.245 * s, SEAM * s);
  ctx.bezierCurveTo(0.25 * s, -0.36 * s, 0.24 * s, -0.17 * s, 0.19 * s, -0.05 * s);
  ctx.quadraticCurveTo(0, -0.025 * s, -0.19 * s, -0.05 * s); ctx.closePath();
}
// the upper stage: from the seam up round its nose (alone, it has a rounded bottom)
function upperPath(ctx, s, alone) {
  ctx.beginPath(); ctx.moveTo(-0.245 * s, SEAM * s);
  ctx.bezierCurveTo(-0.26 * s, -0.76 * s, -0.2 * s, -0.96 * s, 0, -s);
  ctx.bezierCurveTo(0.2 * s, -0.96 * s, 0.26 * s, -0.76 * s, 0.245 * s, SEAM * s);
  if (alone) ctx.bezierCurveTo(0.24 * s, (SEAM + 0.05) * s, -0.24 * s, (SEAM + 0.05) * s, -0.245 * s, SEAM * s);
  ctx.closePath();
}
// a band round the body between y0 and y1 (curving down a little in the middle: the body is round), in the clip
function band(ctx, s, y0, y1, col) {
  ctx.beginPath(); ctx.moveTo(-0.4 * s, y0 * s); ctx.quadraticCurveTo(0, (y0 + 0.035) * s, 0.4 * s, y0 * s); ctx.lineTo(0.4 * s, y1 * s); ctx.quadraticCurveTo(0, (y1 + 0.035) * s, -0.4 * s, y1 * s); ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
}
// the shade down the right side and the highlight down the left, in the clip (y0..y1: the part of the body it's on)
function shadeLit(ctx, s, y0, y1) {
  ctx.fillStyle = 'rgba(28,40,72,0.15)'; ctx.beginPath(); ctx.moveTo(0.1 * s, y0 * s); ctx.bezierCurveTo(0.15 * s, (y0 + (y1 - y0) * 0.35) * s, 0.15 * s, (y0 + (y1 - y0) * 0.65) * s, 0.1 * s, y1 * s); ctx.lineTo(0.4 * s, y1 * s); ctx.lineTo(0.4 * s, y0 * s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.roundRect(-0.175 * s, (y1 + 0.03) * s, 0.045 * s, (y0 - y1 - 0.06) * s, 0.0225 * s); ctx.fill();
}
// the booster, its base at the origin: fins, engine bell, body, bands, the cargo hatch, the front fin
function drawLower(ctx, s, col, BD, door = 0, doorX = 1) {
  const [ink, lw] = inkOf(s, BD), dk = shade(col, -0.2);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = ink; ctx.lineWidth = lw;
  for (const sd of [-1, 1]) {   // the swept fins, behind the body
    ctx.beginPath(); ctx.moveTo(sd * 0.2 * s, -0.36 * s); ctx.quadraticCurveTo(sd * 0.43 * s, -0.24 * s, sd * 0.42 * s, 0.02 * s);
    ctx.quadraticCurveTo(sd * 0.41 * s, 0.06 * s, sd * 0.37 * s, 0.04 * s); ctx.quadraticCurveTo(sd * 0.29 * s, -0.04 * s, sd * 0.18 * s, -0.08 * s); ctx.closePath();
    ctx.fillStyle = sd < 0 ? col : dk; ctx.fill(); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(-0.11 * s, -0.07 * s); ctx.lineTo(0.11 * s, -0.07 * s); ctx.lineTo(0.15 * s, 0.035 * s); ctx.quadraticCurveTo(0, 0.05 * s, -0.15 * s, 0.035 * s); ctx.closePath();   // the engine bell
  ctx.fillStyle = BELL; ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(-0.09 * s, -0.06 * s, 0.035 * s, 0.08 * s);
  lowerPath(ctx, s); ctx.fillStyle = BODY; ctx.fill();
  ctx.save(); lowerPath(ctx, s); ctx.clip();
  band(ctx, s, -0.175, -0.125, col);
  if (door > 0) {   // the cargo hatch on the ramp's side, open while you're coming in (lit inside)
    const dh = s * 0.13 * door, dy = -HATCH[0] - dh / 2 + s * 0.02, x0 = doorX > 0 ? 0.03 * s : -0.2 * s;
    ctx.fillStyle = '#2b2f38'; ctx.beginPath(); ctx.roundRect(x0, dy, 0.17 * s, dh, 0.03 * s * door); ctx.fill();
    ctx.fillStyle = `rgba(255,214,120,${0.6 * door})`; ctx.beginPath(); ctx.roundRect(x0 + 0.02 * s, dy + 0.015 * s * door, 0.13 * s, Math.max(0, dh - 0.03 * s * door), 0.02 * s); ctx.fill();
  }
  shadeLit(ctx, s, -0.05, SEAM);
  ctx.restore();
  lowerPath(ctx, s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-0.022 * s, -0.3 * s); ctx.lineTo(0.022 * s, -0.3 * s); ctx.lineTo(0.045 * s, 0.03 * s); ctx.quadraticCurveTo(0, 0.075 * s, -0.045 * s, 0.03 * s); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.stroke();   // the front fin, edge on
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.moveTo(-0.012 * s, -0.27 * s); ctx.lineTo(-0.003 * s, -0.27 * s); ctx.lineTo(-0.012 * s, 0.02 * s); ctx.lineTo(-0.026 * s, 0.02 * s); ctx.closePath(); ctx.fill();
}
// the upper stage, the seam at the origin's SEAM: nose cone, seam band, porthole
function drawUpper(ctx, s, col, BD, hatch = 0, alone = false) {
  const [ink, lw] = inkOf(s, BD);
  ctx.lineJoin = 'round'; ctx.strokeStyle = ink; ctx.lineWidth = lw;
  upperPath(ctx, s, alone); ctx.fillStyle = BODY; ctx.fill();
  ctx.save(); upperPath(ctx, s, alone); ctx.clip();
  band(ctx, s, -1.2, -0.835, col);   // the nose cone
  band(ctx, s, SEAM - 0.045, SEAM + 0.06, col);   // the seam band
  shadeLit(ctx, s, SEAM, -0.97);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-0.08 * s, -0.9 * s, 0.05 * s, 0.025 * s, -0.5, 0, TAU); ctx.fill();   // the nose's shine
  ctx.beginPath(); ctx.moveTo(-0.4 * s, -0.835 * s); ctx.quadraticCurveTo(0, -0.8 * s, 0.4 * s, -0.835 * s); ctx.lineWidth = lw * 0.7; ctx.stroke(); ctx.lineWidth = lw;   // the nose cone's seam
  ctx.restore();
  upperPath(ctx, s, alone); ctx.stroke();
  // the porthole: a chunky chrome rim, blue glass (warm while someone's aboard), a glint
  const py = -0.685 * s, pr = 0.105 * s;
  circ(ctx, 0, py, pr); ctx.fillStyle = CHROME; ctx.fill(); ctx.stroke();
  circ(ctx, 0, py, pr * 0.7); ctx.fillStyle = hatch > 0 ? '#ffdc78' : GLASS; ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.stroke(); ctx.lineWidth = lw;
  ctx.fillStyle = 'rgba(28,40,72,0.18)'; ctx.beginPath(); ctx.arc(0, py, pr * 0.7, -0.6, 1.9); ctx.closePath(); ctx.fill();
  circ(ctx, -pr * 0.26, py - pr * 0.26, pr * 0.2); ctx.fillStyle = '#ffffff'; ctx.fill();
}
export function drawRocket(ctx, x, y, s, { col = null, stage = 1, flame = 0, t = 0, legs = 0, hatch = 0, door = 0, doorX = 1 } = {}) {
  const BD = bold(), c = col || '#e8473c';
  ctx.save(); ctx.translate(x, y);
  if (stage === 2) {   // just the upper stage, its own little engine and (landed) its legs, down on its pad
    ctx.translate(0, s * 0.47 * legs);
    const [ink, lw] = inkOf(s, BD), by = (SEAM + 0.035) * s;
    if (flame > 0) drawFlame(ctx, 0, by + s * 0.05, s * 0.5 * (0.35 + 0.65 * flame), s * 0.085, t, flame, BD);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = ink; ctx.lineWidth = lw;
    if (legs > 0) for (const sd of [-1, 1]) {
      const fx = sd * (0.19 + 0.12 * legs) * s, fy = (SEAM + 0.13 * legs) * s;
      ctx.beginPath(); ctx.moveTo(sd * 0.17 * s, (SEAM - 0.07) * s); ctx.lineTo(fx, fy); ctx.lineWidth = lw * 2.6; ctx.strokeStyle = ink; ctx.stroke(); ctx.lineWidth = lw * 1.2; ctx.strokeStyle = '#aab1bc'; ctx.stroke();
      ctx.lineWidth = lw; ctx.strokeStyle = ink; ell(ctx, fx, fy, 0.05 * s, 0.02 * s); ctx.fillStyle = CHROME; ctx.fill(); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-0.07 * s, by - 0.02 * s); ctx.lineTo(0.07 * s, by - 0.02 * s); ctx.lineTo(0.09 * s, by + 0.05 * s); ctx.lineTo(-0.09 * s, by + 0.05 * s); ctx.closePath(); ctx.fillStyle = BELL; ctx.fill(); ctx.stroke();
    drawUpper(ctx, s, c, BD, hatch, true);
  } else {
    if (flame > 0) drawFlame(ctx, 0, s * 0.04, s * 0.85 * (0.35 + 0.65 * flame), s * 0.15, t, flame, BD);
    drawLower(ctx, s, c, BD, door, doorX);
    drawUpper(ctx, s, c, BD, hatch);
  }
  ctx.restore();
}
// a rocket engine's flame pointing down from (x, y): a fat round-tipped teardrop, orange, yellow and a pale core, and
// (classic) shock diamonds down its middle and a glow round it
export function drawFlame(ctx, x, y, len, w, t, f, BD) {
  const fl = len * (1 + 0.08 * Math.sin(t * 47) + 0.05 * Math.sin(t * 71));
  ctx.save(); ctx.translate(x, y);
  if (!BD) { ctx.globalCompositeOperation = 'lighter'; stamp(ctx, glowSprite('#ff9a3c', 0.5), 0, fl * 0.35, fl * 0.75); ctx.globalCompositeOperation = 'source-over'; }
  for (const [k, col] of BD ? [[1, '#ff6b2c'], [0.7, '#ffb22e'], [0.4, '#fff1a8']] : [[1, '#ff6b2c'], [0.75, '#ff9a2e'], [0.5, '#ffe27a'], [0.26, '#ffffff']]) {
    ctx.beginPath(); ctx.moveTo(-w * k, 0); ctx.bezierCurveTo(-w * k * 1.35, fl * k * 0.4, -w * k * 0.7, fl * k * 0.85, 0, fl * k); ctx.bezierCurveTo(w * k * 0.7, fl * k * 0.85, w * k * 1.35, fl * k * 0.4, w * k, 0); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
  }
  if (!BD && f > 0.6) { ctx.globalCompositeOperation = 'lighter'; for (let k = 1; k <= 4; k++) { const dy = fl * (0.13 + k * 0.15), dw = w * 0.32 * (1 - k * 0.15); ctx.fillStyle = `rgba(255,250,230,${0.55 - k * 0.1})`; ctx.beginPath(); ctx.moveTo(0, dy - dw * 1.4); ctx.lineTo(dw, dy); ctx.lineTo(0, dy + dw * 1.4); ctx.lineTo(-dw, dy); ctx.closePath(); ctx.fill(); } ctx.globalCompositeOperation = 'source-over'; }   // shock diamonds
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ the launch's cloud
// the exhaust and steam round a pad: soft puffs that roll out along the flame trench (away from the road) and round the
// pad, growing and slowing, warm-lit while the flame is low, fading after a few seconds. All from the clock: e is the time
// since liftoff (steam from a second before it). out: the trench's direction (unit, world)
const PUFFS = (() => { const rng = mulberry(808), L = []; for (let i = 0; i < 40; i++) { const big = i >= 8; L.push({ a: big ? (rng() < 0.65 ? (rng() - 0.5) * 1.1 : rng() * TAU) : (rng() - 0.5) * 0.5, d: big ? 120 + rng() * 380 : 160 + rng() * 120, r: big ? 50 + rng() * 55 : 24 + rng() * 18, delay: big ? 1.05 + rng() * 1.2 : rng() * 0.8, big }); } return L; })();
export function launchCloud(ctx, R, ox, oy, t, BD) {
  const e = R.e; if (e === null || e < -1.1 || e > 9) return;
  const age0 = e + 1.1;   // since the steam began
  for (const P of PUFFS) {
    const a = age0 - P.delay; if (a <= 0) continue;
    const dist = P.d * (1 - Math.exp(-a / (P.big ? 1.2 : 0.7))), r = P.r * (0.45 + 1.1 * (1 - Math.exp(-a / 1.6))), fade = Math.min(1, a * 3) * clamp((P.big ? 8.5 : 4) - a, 0, 2.5) / 2.5;
    if (fade <= 0.01) continue;
    const ca = Math.cos(P.a), sa = Math.sin(P.a), dx = ox * ca - oy * sa, dy = oy * ca + ox * sa;   // (the puff's direction turned onto the trench's)
    const x = R.E.x + dx * dist, y = R.E.y + dy * dist * 0.8 + (P.big ? -a * 8 : -a * 14), warm = clamp(1 - (e - 0.2) / 1.6, 0, 1) * (P.big ? 1 : 0.3);
    const col = warm > 0.05 ? mix('#f4f2ee', '#ffc48a', warm * 0.7) : '#f1efeb';
    ctx.globalAlpha = fade * (BD ? 0.95 : 0.85);
    if (BD) { ctx.fillStyle = col; circ(ctx, x, y, r * 0.9); ctx.fill(); }
    else stamp(ctx, puffSprite(col), x, y, r * 1.25);
  }
  ctx.globalAlpha = 1;
}
// birds scattering off the grass round a pad as it lights: little dark V's flapping away
export function birds(ctx, R, t) {
  const e = R.e; if (e === null || e < 0 || e > 4.5) return;
  const rng = mulberry(R.j * 17 + 3);
  ctx.strokeStyle = 'rgba(40,44,56,0.85)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  for (let k = 0; k < 6; k++) {
    const a = rng() * TAU, v = 160 + rng() * 120, d = 120 + e * v, x = R.E.x + Math.cos(a) * d, y = R.E.y + Math.sin(a) * d * 0.7 - e * 40, f = Math.sin(t * 14 + k * 2) * 0.6, s = 7 + rng() * 3;
    ctx.globalAlpha = clamp((4.5 - e) / 1.5, 0, 1);
    ctx.beginPath(); ctx.moveTo(x - s, y - s * f); ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.2, x, y); ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.2, x + s, y - s * f); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
// the smoke trail up behind a climbing rocket (white puffs that grow as they hang in the air), thinning to a bright
// streak once it's out of the atmosphere (above top: the sky's edge, world y)
export function trail(ctx, R, t, airTop, BD) {
  if (!R.fly) return;
  const e = R.e, D = Math.hypot(R.M.x - R.E.x, R.M.y - R.E.y), ux = (R.M.x - R.E.x) / D, uy = (R.M.y - R.E.y) / D, d1 = R.u * D;
  for (let d = Math.max(0, d1 - 2600), k = 0; d < d1 - 30; d += 28, k++) {
    const te = climbInv(d / D) * FLY_T, age = e - te; if (age > 4) continue;
    const x = R.E.x + ux * d + (y0 => y0 > airTop ? Math.sin(te * 7 + k) * 5 : 0)(R.E.y + uy * d), y = R.E.y + uy * d, inAir = y > airTop, fade = clamp(1 - age / 4, 0, 1) * clamp((d1 - d) / 120, 0, 1);
    if (inAir) {
      const r = 18 + age * 30 + (d < 300 ? 30 : 0);
      ctx.globalAlpha = fade * 0.7;
      if (BD) { ctx.fillStyle = '#eef0f3'; circ(ctx, x, y + 20, r * 0.75); ctx.fill(); } else stamp(ctx, puffSprite(age < 0.5 ? '#fff4e0' : '#f2f1ee'), x, y + 20, r * 1.15);
    } else {   // out of the air: a thin glowing streak
      const x2 = R.E.x + ux * (d + 28), y2 = R.E.y + uy * (d + 28);
      ctx.globalAlpha = fade * 0.6; ctx.lineCap = 'round';
      if (!BD) { ctx.strokeStyle = 'rgba(120,190,255,0.45)'; ctx.lineWidth = 12 + age * 6; ctx.beginPath(); ctx.moveTo(x, y + 18); ctx.lineTo(x2, y2 + 18); ctx.stroke(); }
      ctx.strokeStyle = BD ? '#bfe9ff' : 'rgba(235,248,255,0.9)'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(x, y + 18); ctx.lineTo(x2, y2 + 18); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
// the booster after it's dropped away: falling back, tumbling, fading, a puff where it let go
export function booster(ctx, R, t, BD) {
  if (!R.fly || R.u < SEP) return;
  const te = climbInv(SEP) * FLY_T, dt = R.e - te; if (dt > 2.2) return;
  const u0 = SEP, x0 = lerp(R.E.x, R.M.x, u0), y0 = lerp(R.E.y, R.M.y, u0), s = RS * 1.5;
  if (dt < 0.6) { ctx.globalAlpha = 1 - dt / 0.6; if (BD) { ctx.fillStyle = '#ffffff'; circ(ctx, x0, y0 - s * 0.5, 30 + dt * 120); ctx.fill(); } else stamp(ctx, puffSprite('#ffffff'), x0, y0 - s * 0.5, 40 + dt * 160); ctx.globalAlpha = 1; }
  ctx.save(); ctx.globalAlpha = clamp(1 - dt / 2.2, 0, 1); ctx.translate(x0 + dt * 40, y0 - s * 0.26 + dt * dt * 160 + dt * 30); ctx.rotate(dt * 0.9); ctx.scale(1 - dt * 0.22, 1 - dt * 0.22);
  ctx.translate(0, 0.28 * s * 0.66);   // (centred on its middle: it tumbles about it)
  drawLower(ctx, s * 0.66, R.col || '#e8473c', BD);
  ctx.fillStyle = CHROME; ctx.beginPath(); ctx.ellipse(0, SEAM * s * 0.66, 0.245 * s * 0.66, 0.03 * s * 0.66, 0, 0, TAU); ctx.fill();   // its open top, where the upper stage sat
  ctx.restore();
}
// (where along the flight a fraction of the climb comes: inverts climbU)
function climbInv(u) { let lo = 0, hi = 1; for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (climbU(m) < u) lo = m; else hi = m; } return (lo + hi) / 2; }
// the dust a rocket blows out across its Moon pad as it lands, a ring rolling out and settling
export function landingDust(ctx, R, BD) {
  if (R.e === null) return;
  const a = R.e - FLY_T + 0.5; if (a < 0 || a > 2.6) return;
  for (let k = 0; k < 16; k++) {
    const ang = k / 16 * TAU + 0.2, d = 50 + 170 * (1 - Math.exp(-a / 0.5)), x = R.M.x + Math.cos(ang) * d, y = R.M.y + Math.sin(ang) * d * 0.75, r = 22 + a * 18;
    ctx.globalAlpha = clamp(1 - a / 2.6, 0, 1) * 0.75;
    if (BD) { ctx.fillStyle = '#d8d5ce'; circ(ctx, x, y, r * 0.8); ctx.fill(); } else stamp(ctx, puffSprite('#dcd9d2'), x, y, r * 1.2);
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------------------------------------ capsules
// a capsule: a chunky gumdrop (the rockets' white, an ink outline), a band and a nose nub in its racer's colour, a big
// porthole, a dark heat shield under it; one shade down its right side, one highlight down its left
const capPath = (ctx, s) => { ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.04); ctx.bezierCurveTo(-s * 0.44, -s * 0.36, -s * 0.34, -s * 0.66, -s * 0.2, -s * 0.72); ctx.quadraticCurveTo(0, -s * 0.8, s * 0.2, -s * 0.72); ctx.bezierCurveTo(s * 0.34, -s * 0.66, s * 0.44, -s * 0.36, s * 0.5, -s * 0.04); ctx.quadraticCurveTo(0, s * 0.04, -s * 0.5, -s * 0.04); ctx.closePath(); };
export function drawCapsule(ctx, x, y, s, col, BD) {
  const [ink, lw] = inkOf(s * 2.2, BD), c = col || '#2f7fd0';
  ctx.save(); ctx.translate(x, y); ctx.lineJoin = 'round'; ctx.strokeStyle = ink; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.ellipse(0, -s * 0.02, s * 0.53, s * 0.11, 0, 0, Math.PI); ctx.closePath(); ctx.fillStyle = '#6b5442'; ctx.fill(); ctx.stroke();   // the heat shield
  ctx.beginPath(); ctx.roundRect(-s * 0.09, -s * 0.86, s * 0.18, s * 0.12, s * 0.04); ctx.fillStyle = c; ctx.fill(); ctx.stroke();   // the nose nub
  capPath(ctx, s); ctx.fillStyle = BODY; ctx.fill();
  ctx.save(); capPath(ctx, s); ctx.clip();
  ctx.beginPath(); ctx.moveTo(-s, -s * 0.24); ctx.quadraticCurveTo(0, -s * 0.18, s, -s * 0.24); ctx.lineTo(s, -s * 0.13); ctx.quadraticCurveTo(0, -s * 0.07, -s, -s * 0.13); ctx.closePath(); ctx.fillStyle = c; ctx.fill();   // the band
  ctx.fillStyle = 'rgba(28,40,72,0.15)'; ctx.beginPath(); ctx.moveTo(s * 0.16, -s * 0.8); ctx.quadraticCurveTo(s * 0.3, -s * 0.4, s * 0.24, 0); ctx.lineTo(s, 0); ctx.lineTo(s, -s * 0.8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(-s * 0.3, -s * 0.42, s * 0.035, s * 0.17, 0.3, 0, TAU); ctx.fill();
  ctx.restore();
  capPath(ctx, s); ctx.stroke();
  const py = -s * 0.46, pr = s * 0.15;
  circ(ctx, 0, py, pr); ctx.fillStyle = CHROME; ctx.fill(); ctx.stroke();
  circ(ctx, 0, py, pr * 0.68); ctx.fillStyle = GLASS; ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.stroke();
  circ(ctx, -pr * 0.25, py - pr * 0.25, pr * 0.2); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.restore();
}
// chutes: three striped canopies on lines to the capsule (open: 0..1 how far out, with a little overshoot as they fill;
// slack: settling on the water); a small drogue before them (drogue: 0..1)
export function drawChutes(ctx, x, y, s, open, slack, t, col, drogue = 0) {
  const BD = bold();
  if (drogue > 0 && open <= 0) { const r = s * 0.28 * drogue, cy = y - s * 1.6; ctx.strokeStyle = 'rgba(80,80,90,0.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y - s * 0.75); ctx.lineTo(x - r, cy); ctx.moveTo(x, y - s * 0.75); ctx.lineTo(x + r, cy); ctx.stroke(); ctx.fillStyle = '#ff7a2c'; ctx.beginPath(); ctx.arc(x, cy, r, Math.PI, TAU); ctx.closePath(); ctx.fill(); if (BD) { ctx.strokeStyle = BK.ink; ctx.lineWidth = 2; ctx.stroke(); } return; }
  const fill = open < 1 ? 1 + 0.18 * Math.sin(open * Math.PI) : 1;
  const rows = [[-0.9, -2.15], [0, -2.45], [0.9, -2.15]];
  for (const [dx, dy] of rows) {
    const cxp = x + dx * s * open, cyp = y + dy * s * (slack ? 0.25 : open) + Math.sin(t * 2 + dx * 3) * 3, r = s * 0.66 * open * fill;
    if (r < 2) continue;
    ctx.strokeStyle = 'rgba(80,80,90,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - s * 0.15, y - s * 0.72); ctx.lineTo(cxp - r * 0.95, cyp); ctx.moveTo(x + s * 0.15, y - s * 0.72); ctx.lineTo(cxp + r * 0.95, cyp); ctx.moveTo(x, y - s * 0.75); ctx.lineTo(cxp, cyp); ctx.stroke();
    ctx.save(); ctx.translate(cxp, cyp); if (slack) ctx.scale(1, 0.45);
    for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, Math.PI + k * Math.PI / 6, Math.PI + (k + 1) * Math.PI / 6); ctx.closePath(); ctx.fillStyle = k % 2 ? '#ffffff' : (col || '#e8473c'); ctx.fill(); }
    if (!BD) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, Math.PI * 1.55, TAU); ctx.closePath(); ctx.fill(); }
    if (BD) { ctx.strokeStyle = BK.ink; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, TAU); ctx.closePath(); ctx.stroke(); }
    ctx.restore();
  }
}
// a capsule coming home: where it is is the kart's own (race-rocket.js flyPose); what it looks like by how far along
// its ride it is. Re-entry: plasma round the heat shield, fire streaming up behind it, a shudder. Splashdown: a crown
// of spray, a foam ring, the chutes settling.
export function capsuleRide(ctx, race, Ck, P, BD) {
  const t = race.time, c = Ck.c, e = Ck.e, col = Ck.col, x0 = Ck.x, y0 = Ck.y;
  const air = clamp((y0 - (limbAt(P, x0) - 900)) / 500, 0, 1);   // how deep into the air it is (by where it is)
  const fire = e < CAP.drogue ? air * clamp((CAP.drogue - e) / 0.5, 0, 1) : 0;
  const s = 92 * (1 + 0.5 * Math.sin(Math.PI * clamp(e / CAP.chute, 0, 1)));   // (nearer the camera as it falls)
  const drogue = clamp((e - CAP.drogue) / 0.2, 0, 1), chute = e > CAP.chute ? clamp((e - CAP.chute) / 0.5, 0, 1) : 0, slack = e > CAP.splash + 0.3;
  const shake = fire > 0.2 ? Math.sin(t * 61) * 3 * fire : 0, x = x0 + shake, afloat = e > CAP.splash, bob = afloat ? Math.sin(t * 3 + Ck.j) * 3 : 0, y = y0 + bob;
  if (fire > 0) {
    // re-entry: a comet of fire streaming up behind the heat shield (it's falling down the screen), a bow of white-hot
    // plasma round the shield, sparks flying off
    const L = s * (2.2 + 2.6 * fire), W = s * 0.62;
    ctx.save();
    if (!BD) {
      ctx.globalCompositeOperation = 'lighter';
      for (const [k, c0, a0] of [[1.25, '255,90,30', 0.35], [1, '255,150,50', 0.55], [0.6, '255,230,150', 0.75], [0.3, '255,255,240', 0.9]]) {
        ctx.fillStyle = linear(ctx, x, y, x, y - L * k, [[0, `rgba(${c0},${a0 * fire})`], [1, `rgba(${c0},0)`]]);
        ctx.beginPath(); ctx.moveTo(x - W * k, y - s * 0.1); ctx.quadraticCurveTo(x - W * k * 0.7, y - L * k * 0.5, x + Math.sin(t * 13) * 6, y - L * k); ctx.quadraticCurveTo(x + W * k * 0.7, y - L * k * 0.5, x + W * k, y - s * 0.1); ctx.closePath(); ctx.fill();
      }
      for (let k = 0; k < 6; k++) { const d = ((t * 3.5 + k / 6) % 1) * L * 0.9; stamp(ctx, glowSprite(k % 2 ? '#ffd27a' : '#ff6b2c', 0.4), x + Math.sin(t * 17 + k * 2) * W * 0.4, y - s * 0.3 - d, s * 0.35 * (1 - d / L)); }
      ctx.fillStyle = radial(ctx, x, y + 10, 4, x, y, s * 1.1, [[0, `rgba(255,250,220,${0.95 * fire})`], [0.3, `rgba(255,170,60,${0.6 * fire})`], [1, 'rgba(255,60,20,0)']]); ctx.beginPath(); ctx.ellipse(x, y + 4, s * 1.1, s * 0.8, 0, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = '#ff9a2e'; ctx.beginPath(); ctx.moveTo(x - W, y - s * 0.1); ctx.quadraticCurveTo(x - W * 0.6, y - L * 0.5, x, y - L * 0.9); ctx.quadraticCurveTo(x + W * 0.6, y - L * 0.5, x + W, y - s * 0.1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(x - W * 0.5, y - s * 0.1); ctx.quadraticCurveTo(x - W * 0.3, y - L * 0.3, x, y - L * 0.5); ctx.quadraticCurveTo(x + W * 0.3, y - L * 0.3, x + W * 0.5, y - s * 0.1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff6b2c'; ctx.beginPath(); ctx.ellipse(x, y + 4, s * 0.62 * (1 + fire * 0.3), s * 0.3, 0, 0, Math.PI); ctx.fill(); ctx.strokeStyle = BK.ink; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.restore();
    if (VIEW.first && fchanceLike(t, Ck.j) && !BD) race.particles.push({ kind: 'spark', x: x + frnd(-s * 0.5, s * 0.5), y: y + frnd(-10, 10), vx: frnd(-160, 160), vy: frnd(-420, -200), col: fchanceLike(t * 1.3, 1) ? '#ffd27a' : '#ff8a3c', size: frnd(2.5, 5), life: frnd(0.3, 0.6), maxLife: 0.6, top: true });
  }
  if (e < CAP.burn + 0.2) { ctx.save(); ctx.translate(x, y - s * 0.7); ctx.scale(1, -1); drawFlame(ctx, 0, 0, s * 0.7 * clamp(e / 0.25, 0, 1) * clamp((CAP.burn + 0.2 - e) / 0.3, 0, 1), s * 0.18, t, 0.6, BD); ctx.restore(); }   // the burn off the Moon (pushing it down toward the Earth)
  if (afloat) { splash(ctx, Ck.Z.x, Ck.Z.y, e - CAP.splash, BD); if (c && c.flyT > 0 && t - c.cSpl > 0.4) tug(ctx, x, y, Math.atan2(P.z.foot.y - y, P.z.foot.x - x), t, BD); }
  const cut = e - CAP.splash - 0.9;   // the chutes let go after the splash and sink away
  if ((chute > 0 || drogue > 0) && cut < 0.6) { ctx.save(); if (cut > 0) { ctx.globalAlpha = 1 - cut / 0.6; } drawChutes(ctx, x + (cut > 0 ? cut * 40 : 0), y, s, chute, slack, t, col, drogue); ctx.restore(); }
  drawCapsule(ctx, x, y, s * (c && t > c.cOut - 0.9 ? 1 - 0.2 * clamp((t - (c.cOut - 0.9)) / 0.3, 0, 1) : 1), col, BD);
}
// the top of the air over the planet at x (art/moonshot.js limbE)
const limbAt = (P, x) => P.earth.y - Math.sqrt(Math.max(0, P.earth.r ** 2 - (x - P.earth.x) ** 2));
// a little recovery tug towing a capsule in: a red-and-white boat ahead of it on a line, a wake behind
function tug(ctx, x, y, a, t, BD) {
  const bx = x + Math.cos(a) * 95, by = y + Math.sin(a) * 95;
  ctx.strokeStyle = 'rgba(40,40,50,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.lineTo(bx - Math.cos(a) * 26, by - Math.sin(a) * 26); ctx.stroke();
  ctx.save(); ctx.translate(bx, by); ctx.rotate(a);
  for (let k = 0; k < 3; k++) { const f = (t * 1.5 + k / 3) % 1; ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - f)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-30 - f * 60, -10 - f * 18); ctx.lineTo(-24, 0); ctx.lineTo(-30 - f * 60, 10 + f * 18); ctx.stroke(); }
  ctx.fillStyle = 'rgba(10,40,70,0.3)'; ctx.beginPath(); ctx.ellipse(6, 8, 30, 13, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = BD ? '#e8473c' : linear(ctx, 0, -12, 0, 12, [[0, '#ff6b5a'], [1, '#b82e22']]); ctx.beginPath(); ctx.moveTo(-26, -11); ctx.lineTo(16, -11); ctx.quadraticCurveTo(32, 0, 16, 11); ctx.lineTo(-26, 11); ctx.closePath(); ctx.fill(); if (BD) { ctx.strokeStyle = BK.ink; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.fillStyle = '#f6f5f2'; ctx.beginPath(); ctx.roundRect(-14, -7, 18, 14, 3); ctx.fill(); ctx.fillStyle = '#2a3a52'; ctx.fillRect(-2, -5, 4, 10);
  ctx.restore();
}
const fchanceLike = (t, i) => (Math.floor(t * 60) + i) % 2 === 0;
// a splashdown: a crown of spray thrown up and falling back, rings of foam going out, a patch of white water
function splash(ctx, x, y, a, BD) {
  if (a > 2.6) { if (!BD) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ell(ctx, x, y + 6, 70, 26); ctx.fill(); } return; }
  for (let k = 0; k < 3; k++) { const f = clamp((a - k * 0.25) / 1.6, 0, 1); if (f <= 0 || f >= 1) continue; ctx.strokeStyle = `rgba(255,255,255,${0.75 * (1 - f)})`; ctx.lineWidth = 5 * (1 - f) + 1; ell(ctx, x, y + 6, 40 + f * 170, 16 + f * 64); ctx.stroke(); }
  if (a < 1.4) {
    const rng = mulberry(91);
    for (let k = 0; k < 22; k++) {
      const ang = rng() * TAU, v = 90 + rng() * 140, vz = 220 + rng() * 260, h = vz * a - 420 * a * a; if (h < 0) continue;
      const dx = Math.cos(ang) * v * a, dy = Math.sin(ang) * v * a * 0.5, r = 5 + rng() * 6;
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; circ(ctx, x + dx, y + dy - h, r); ctx.fill();
      if (!BD) { ctx.fillStyle = 'rgba(160,215,245,0.6)'; circ(ctx, x + dx + r * 0.3, y + dy - h + r * 0.3, r * 0.5); ctx.fill(); }
    }
    ctx.globalAlpha = clamp(1 - a / 1.4, 0, 1);
    if (BD) { ctx.fillStyle = '#ffffff'; circ(ctx, x, y - 20, 40 + a * 40); ctx.fill(); } else stamp(ctx, puffSprite('#ffffff'), x, y - 20, 60 + a * 60);
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------------------------------------ the boarding ramps
// a bay's ramp (race-rocket.js layoutFor: its foot, `dock`, at the road's edge where you're caught; its top against the
// rocket's side, H up the screen, the hatch): a steel deck with hazard-striped edges and chevrons up it, on legs, its
// shadow cast down and to the right. rampDeck: its shape (at(u, o): the deck's point u of the way up, o of its half-width
// across).
const RW = 34;
export function rampDeck(B, H) {
  const F = B.dock, P = B.top, dx = P.x - F.x, dy = P.y - F.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L * RW, ny = dx / L * RW;
  return { F, P, H, L, at: (u, o = 0) => ({ x: F.x + dx * u + nx * o, y: F.y + dy * u + ny * o - H * u }), ground: (u, o = 0) => ({ x: F.x + dx * u + nx * o, y: F.y + dy * u + ny * o }) };
}
export function drawRamp(g, B, H, BD, { steel = '#c9ced6', edge = '#f4c430' } = {}) {
  const D = rampDeck(B, H), quad = (pts, col) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); g.fillStyle = col; g.fill(); };
  // its shadow on the ground, then its legs
  const sh = (u, o) => { const p = D.ground(u, o); return { x: p.x + H * u * 0.5, y: p.y + H * u * 0.3 }; };
  quad([sh(0, -1), sh(1, -1.1), sh(1, 1.1), sh(0, 1)], 'rgba(14,30,44,0.22)');
  g.strokeStyle = BD ? BK.ink : '#6f757f'; g.lineWidth = 5; g.lineCap = 'round';
  for (const u of [0.4, 0.7, 0.97]) for (const o of [-0.8, 0.8]) { const p = D.at(u, o); g.beginPath(); g.moveTo(p.x, p.y + 4); g.lineTo(p.x, p.y + H * u); g.stroke(); }
  // the deck: its side face, its top, the hazard-striped edges, chevrons up it, a lip at its foot
  const top = [D.at(0, -1), D.at(1, -1), D.at(1, 1), D.at(0, 1)];
  quad(top.map(p => ({ x: p.x, y: p.y + 9 })), BD ? '#5c626b' : '#7c828c');
  quad(top, BD ? steel : linear(g, D.F.x, D.F.y, D.P.x, D.P.y - H, [[0, shade(steel, 0.06)], [1, shade(steel, -0.08)]]));
  if (BD) { g.strokeStyle = BK.ink; g.lineWidth = 2.5; g.beginPath(); top.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); g.stroke(); }
  for (const o of [-0.92, 0.92]) { const a = D.at(0, o), b = D.at(1, o); g.lineWidth = 6; g.lineCap = 'butt'; g.strokeStyle = '#2a2d33'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.strokeStyle = edge; g.setLineDash([10, 10]); g.stroke(); g.setLineDash([]); }
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 4; g.lineCap = 'round';
  for (let u = 0.14; u < 0.9; u += 0.17) { const l = D.at(u - 0.06, -0.55), m = D.at(u, 0), r = D.at(u - 0.06, 0.55); g.beginPath(); g.moveTo(l.x, l.y); g.lineTo(m.x, m.y); g.lineTo(r.x, r.y); g.stroke(); }
  { const a = D.at(0, -1), b = D.at(0, 1); g.strokeStyle = '#3d4249'; g.lineWidth = 7; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
}
// where a pad's service tower stands: behind the rocket, away from the ramp and up the screen
export const towerOf = B => { const dx = B.dock.x - B.pad.x, dy = B.dock.y - B.pad.y, d = Math.hypot(dx, dy) || 1; return { x: B.pad.x - dx / d * 92, y: B.pad.y - dy / d * 20 - 60 }; };
export { ease };

// ------------------------------------------------------------------------------------------------ the crawler
// the crawler-transporter (race-timed.js, a crossing with look 'crawler'): a great flat platform on four double tracks, a
// mobile launcher on it with its red tower, and a rocket standing on that, at (x, y) heading a, L long and Wd wide (half
// sizes), its treads creeping while it moves. shadow: just its shadow (under the karts)
export function drawCrawler(ctx, x, y, a, L, Wd, moving, t, shadow) {
  const BD = bold();
  if (shadow) {
    ctx.save(); ctx.translate(x + 26, y + 34); ctx.rotate(a); ctx.fillStyle = 'rgba(10,24,30,0.3)'; ctx.beginPath(); ctx.roundRect(-L, -Wd, L * 2, Wd * 2, 14); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(x + 30, y + 20); ctx.rotate(0.5); ctx.fillStyle = 'rgba(10,24,30,0.16)'; ctx.beginPath(); ctx.ellipse(130, 0, 150, 22, 0, 0, TAU); ctx.fill(); ctx.restore();   // the rocket's long shadow
    return;
  }
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  // the four track units, treads creeping
  const ph = moving ? (t * 30) % 12 : 0;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const cx = sx * L * 0.68, cy = sy * Wd * 0.8;
    ctx.fillStyle = '#2b2e34'; ctx.beginPath(); ctx.roundRect(cx - 30, cy - 17, 60, 34, 8); ctx.fill();
    ctx.strokeStyle = '#4a4f58'; ctx.lineWidth = 3; for (let k = -24 + ph; k < 28; k += 12) { ctx.beginPath(); ctx.moveTo(cx + k, cy - 16); ctx.lineTo(cx + k, cy + 16); ctx.stroke(); }
  }
  // the deck: grey steel, yellow and black edges, the cabs at its corners
  ctx.fillStyle = BD ? '#8f959e' : linear(ctx, 0, -Wd, 0, Wd, [[0, '#b7bcc4'], [1, '#7c828c']]); ctx.beginPath(); ctx.roundRect(-L * 0.92, -Wd * 0.7, L * 1.84, Wd * 1.4, 8); ctx.fill();
  ctx.save(); ctx.clip(); for (let k = -L; k < L; k += 16) { ctx.fillStyle = '#f2c230'; ctx.fillRect(k, -Wd * 0.7, 8, 6); ctx.fillRect(k, Wd * 0.7 - 6, 8, 6); ctx.fillStyle = '#23252b'; ctx.fillRect(k + 8, -Wd * 0.7, 8, 6); ctx.fillRect(k + 8, Wd * 0.7 - 6, 8, 6); } ctx.restore();
  if (BD) { ctx.strokeStyle = BK.ink; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.roundRect(-L * 0.92, -Wd * 0.7, L * 1.84, Wd * 1.4, 8); ctx.stroke(); }
  for (const sx of [-1, 1]) { ctx.fillStyle = '#f6f5f2'; ctx.beginPath(); ctx.roundRect(sx * L * 0.82 - 9, -Wd * 0.62, 18, 16, 3); ctx.fill(); ctx.fillStyle = '#5aa9d6'; ctx.fillRect(sx * L * 0.82 - 6, -Wd * 0.6, 12, 5); }
  // the mobile launcher on it: a dark slab with its flame hole
  ctx.fillStyle = BD ? '#5c626b' : linear(ctx, 0, -Wd, 0, Wd, [[0, '#6f757f'], [1, '#4b5059']]); ctx.beginPath(); ctx.roundRect(-L * 0.6, -Wd * 0.5, L * 1.2, Wd * 1.0, 6); ctx.fill();
  ctx.fillStyle = '#25282e'; ctx.beginPath(); ctx.roundRect(-14, -14, 28, 28, 4); ctx.fill();
  ctx.restore();
  // diesel exhaust from its stacks while it crawls
  if (moving && !BD) { for (let k = 0; k < 4; k++) { const f = (t * 0.6 + k / 4) % 1; ctx.globalAlpha = 0.35 * (1 - f); stamp(ctx, puffSprite('#9aa0a8'), x - Math.cos(a) * L * 0.8 + 20 + f * 40, y - Math.sin(a) * L * 0.8 - 30 - f * 70, 10 + f * 26); } ctx.globalAlpha = 1; }
  // the tower and the rocket, standing up the screen
  const tx = x + Math.cos(a) * L * 0.4, ty = y + Math.sin(a) * L * 0.4 + 10;
  ctx.fillStyle = '#c0392b'; ctx.fillRect(tx - 9, ty - 200, 18, 200); ctx.strokeStyle = '#8e2a20'; ctx.lineWidth = 2; for (let k = 0; k < 9; k++) { const y0 = ty - k * 22; ctx.beginPath(); ctx.moveTo(tx - 9, y0); ctx.lineTo(tx + 9, y0 - 22); ctx.moveTo(tx + 9, y0); ctx.lineTo(tx - 9, y0 - 22); ctx.stroke(); }
  ctx.fillStyle = '#e8473c'; circ(ctx, tx, ty - 204, 4.5); ctx.fill();
  drawRocket(ctx, x - Math.cos(a) * 8, y - 6, RS * 0.95, { col: '#f4c430', stage: 1, flame: 0, t });
}
