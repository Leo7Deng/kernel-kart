// Drawing for the track mechanics (race-mechanics.js; some live in art/hurricane.js, sakura.js, phoenix.js, mine.js).
// DOM-free. Layers: drawMechanicsStatic (baked into the track layer), drawMechanics (animated, under the cars),
// volcanoFlank (in the ground), drawMechanicsOver (over the cars), drawBoulders (over cars, under roofs), roofLayers
// (cached, over the cars), drawRoofLights (on the roofs). Heights are lifts straight up the screen.
import { TAU, clamp, mulberry } from './core.js';
import { halfWAt, trackSample } from './geometry.js';
import { wormState } from './race-wormhole.js';
import { pressHeight } from './race-presses.js';
import { HOLD, POUR_WARN, SURGE, slagNow, slagTaper } from './race-slag.js';
import { CRUST, GONE, PUDDLE_LIFE, RUMBLE, SINK_T, molten, puddleHeat } from './race-volcano.js';
import { WAVE_SWEEP, WAVE_WARN, waveState } from './race-waves.js';
import { WALL } from './race-hurricane.js';
import { hurricaneOver, hurricaneUnder } from './art/hurricane.js';
import { PCB } from './art/chips.js';
import { REEL_STOP, SHOW, SPIN } from './race-jackpot.js';
import { goldBoxes, jackpotStatic, slotMachine } from './art/pharaoh.js';
import { WARN, boulders, nextRelease, rollEnd } from './race-boulders.js';
import { circ, ell, linear, mix, poly, radial } from './art/paint.js';
import { BANK_IN, BANK_OUT, bankFade } from './race-banks.js';
import { CLAW_LEN, WIND, clawHeight } from './race-crab.js';
import { CRAB_R, crabShadow, drawCrab } from './art/crab.js';
import { bayGlints } from './art/bay.js';
import { CLOSE, gateState } from './race-gate.js';
import { COOL_T, FLOOD, FLOW_V } from './race-river.js';
import * as DB from './race-drawbridge.js';
import { drawbridgeOver, drawbridgeStatic, drawbridgeUnder, sakuraPetals, toriiRoofs } from './art/sakura.js';
import { secretPose } from './race-secret.js';
import { groveOver, groveStatic, groveUnder, kickerLanes } from './art/grove.js';
import { phoenixBurns, secretGlow, secretOver, secretStatic } from './art/phoenix.js';
import { mineOver, mineStatic, mineUnder } from './art/mine.js';
import { alpineOver, alpineUnder } from './art/alpine.js';
import { skiOver, skiUnder } from './art/ski.js';
import { clockOver, clockRoofs, clockStatic, clockUnder } from './art/clock.js';
import { neonOver, neonStatic, neonUnder } from './art/neon.js';
import { airportOver, airportRoofs, airportStatic, airportUnder } from './art/airport.js';
import { moonshotOver, moonshotRoofs, moonshotStatic, moonshotUnder } from './art/moonshot.js';

const FONT = '"Fredoka", "Trebuchet MS", system-ui, sans-serif';
const blob = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
const angOf = q => Math.atan2(q.ty, q.tx);
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
// a band along the road between two offsets from the centre line (functions of s), as a closed path
function band(g, T, s0, s1, offA, offB, step = 8) {
  g.beginPath();
  for (let s = s0; s <= s1; s += step) { const q = trackSample(T, s), o = offA(s, q); g.lineTo(q.x + q.nx * o, q.y + q.ny * o); }
  for (let s = s1; s >= s0; s -= step) { const q = trackSample(T, s), o = offB(s, q); g.lineTo(q.x + q.nx * o, q.y + q.ny * o); }
  g.closePath();
}
// hazard stripes in a w × h box at the origin
function hazard(g, x, y, w, h, a = '#f2c94c', b = '#1d1f27') {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = a; g.fillRect(x, y, w, h); g.fillStyle = b;
  for (let k = -h; k < w + h; k += 16) { g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k + 8, y); g.lineTo(x + k + 8 - h, y + h); g.lineTo(x + k - h, y + h); g.closePath(); g.fill(); }
  g.restore();
}

// the moon past Heap Space's low-g bend: a grey cratered ball lit from the top left, a faint halo round it
function moonStatic(g, m) {
  const R = m.r, rng = mulberry(7);
  for (const [k, a] of [[1.5, 0.05], [1.25, 0.08]]) { g.fillStyle = `rgba(200,210,255,${a})`; g.beginPath(); g.arc(m.x, m.y, R * k, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(m.x + R * 0.12, m.y + R * 0.16, R, 0, TAU); g.fill();
  const body = g.createRadialGradient(m.x - R * 0.4, m.y - R * 0.45, R * 0.1, m.x, m.y, R);
  body.addColorStop(0, '#f2f3f7'); body.addColorStop(0.55, '#b9bccb'); body.addColorStop(1, '#6b6f84');
  g.fillStyle = body; g.beginPath(); g.arc(m.x, m.y, R, 0, TAU); g.fill();
  g.save(); g.beginPath(); g.arc(m.x, m.y, R, 0, TAU); g.clip();
  for (let k = 0; k < 9; k++) {   // craters: a dark bowl with a lit lower-right rim
    const a = rng() * TAU, d = Math.sqrt(rng()) * R * 0.8, cr = R * (0.07 + rng() * 0.16), x = m.x + Math.cos(a) * d, y = m.y + Math.sin(a) * d;
    g.fillStyle = 'rgba(70,74,96,0.45)'; g.beginPath(); g.arc(x, y, cr, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = cr * 0.25; g.beginPath(); g.arc(x, y, cr, 0.1, Math.PI * 0.9); g.stroke();
  }
  g.fillStyle = 'rgba(20,22,40,0.25)'; g.beginPath(); g.arc(m.x + R * 0.35, m.y + R * 0.35, R * 0.95, 0, TAU); g.fill();   // the night side
  g.restore();
}
// its gravity: faint rings drifting in from the edge of its pull
function moonPull(ctx, m, t) {
  ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    const f = ((t * 0.35 + k / 3) % 1), r = m.pull - (m.pull - m.r * 1.1) * f;
    ctx.strokeStyle = `rgba(197,202,233,${0.28 * Math.sin(f * Math.PI)})`; ctx.setLineDash([10, 12]); ctx.lineDashOffset = t * 20;
    ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, TAU); ctx.stroke();
  }
  ctx.setLineDash([]);
}

// ------------------------------------------------------------------------------------------------ static layer
export function drawMechanicsStatic(g, T) {
  const M = T.mech; if (!M) return;
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  for (const z of M.slag) slagStatic(g, T, z);
  if (!M.rocket) for (const lg of M.lowg) lowgStatic(g, T, lg);   // (Moonshot draws its own: the Rille Leap, art/moon.js)
  for (const lg of M.lowg) if (lg.moon) moonStatic(g, lg.moon);
  for (const w of M.wormholes) wormholeStatic(g, T, w);
  for (const p of M.presses) pressStatic(g, T, p);
  for (const v of M.volcano) volcanoStatic(g, v);
  for (const r of M.rivers) riverStatic(g, T, r);
  if (!M.rocket) for (const z of M.banks) bankStatic(g, T, z);   // (Moonshot's is Copernicus's wall, art/moon.js)
  if (M.hurricane) causewayStatic(g, T, M.hurricane);
  for (const J of M.jackpots) jackpotStatic(g, T, J);
  for (const z of M.boulders) boulderStatic(g, T, z);
  if (!M.rocket) for (const u of M.tunnels) tunnelStatic(g, T, u);   // (Moonshot's is a lava tube, art/moon.js)
  for (const z of M.crab) crabStatic(g, T, z);
  M.gates.forEach((z, i) => gateStatic(g, T, i));
  for (const z of M.drawbridges) drawbridgeStatic(g, T, z);
  if (M.jets) airportStatic(g, T);   // the airport: crossings, the blast fence, the terminal, gates, tower and hangar (art/airport.js)
  for (const R of T.routes || [T]) for (const z of R.mech ? R.mech.secrets : []) { secretStatic(g, R, z); mineStatic(g, R, z); }   // secret shortcuts: the sun stone, the mine (art/phoenix.js, art/mine.js; a course: each route's own)
  if (M.rain) neonStatic(g, T);   // Neon Overflow's road markings, drains and the Skyway's rails (art/neon.js)
  if (M.clock) clockStatic(g, T, M.clock);   // the clocktower: its railings, the clock face, the Mainspring, the gears' bearings (art/clock.js)
  if (M.thickets.length) groveStatic(g, T);   // the Tinder Grove: dead trees and thornbush round the Ash Run (art/grove.js)
  if (M.kickers.length) kickerLanes(g, T);   // the Kicker Park's lane divider (art/grove.js)
  if (M.rocket) moonshotStatic(g, T);   // Moonshot: the rides' stretches rubbed out, the spaceport, the pads, the Moon base (art/moonshot.js)
  g.restore();
}

// the causeway's breakwaters (race-hurricane.js): the low walls the wind presses you into, boulders, surf, windsock footings
function causewayStatic(g, T, z) {
  const rng = mulberry(Math.round(z.s0) + 3), up = s => { const q = trackSample(T, s); return -Math.sign(z.bx * q.nx + z.by * q.ny) || 1; };
  for (const side of [-1, 1]) {
    const windward = side === up((z.s0 + z.s1) / 2), o0 = WALL + 9;
    band(g, T, z.s0 - 60, z.s1 + 60, (s, q) => side * (q.hw + o0), (s, q) => side * (q.hw + o0 + (windward ? 30 : 20)), 10);
    g.fillStyle = windward ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.3)'; g.fill();   // foam where the waves hit
    for (let s = z.s0 - 40; s < z.s1 + 40; s += 9 + rng() * 6) {
      const q = trackSample(T, s), o = side * (q.hw + o0 + 4 + rng() * 9), x = q.x + q.nx * o, y = q.y + q.ny * o, r = 6 + rng() * 6;
      g.fillStyle = 'rgba(0,20,30,0.3)'; blob(g, x + r * 0.35, y + r * 0.45, r);
      g.fillStyle = ['#7d7a76', '#8d8984', '#6f6c69'][Math.floor(rng() * 3)]; blob(g, x, y, r);
      g.fillStyle = 'rgba(255,255,255,0.25)'; blob(g, x - r * 0.3, y - r * 0.35, r * 0.45);
    }
    // the wall: its shadow down and to the right, the face, a lit cap, joints every so often
    const wall = (a, b) => band(g, T, z.s0, z.s1, (s, q) => side * (q.hw + a), (s, q) => side * (q.hw + b), 8);
    g.save(); g.translate(4, 6); wall(WALL, WALL + 9); g.fillStyle = 'rgba(0,20,30,0.35)'; g.fill(); g.restore();
    wall(WALL, WALL + 9); g.fillStyle = '#8f969d'; g.fill();
    wall(WALL + 1, WALL + 6); g.fillStyle = '#d3d7da'; g.fill();
    g.strokeStyle = 'rgba(60,66,74,0.45)'; g.lineWidth = 1.5; g.beginPath();
    for (let s = z.s0 + 40; s < z.s1; s += 44) { const q = trackSample(T, s), a = side * (q.hw + WALL), b = side * (q.hw + WALL + 9); g.moveTo(q.x + q.nx * a, q.y + q.ny * a); g.lineTo(q.x + q.nx * b, q.y + q.ny * b); }
    g.stroke();
  }
  for (const k of z.socks) {   // a concrete footing for each windsock
    g.fillStyle = 'rgba(0,20,30,0.3)'; blob(g, k.x + 4, k.y + 5, 15);
    g.fillStyle = '#a9adb2'; blob(g, k.x, k.y, 14); g.fillStyle = '#c9cdd1'; blob(g, k.x - 2, k.y - 2, 9);
  }
}

// the banking (outer half paler toward the top, red line where it starts, blue along the top lane) and the seawall
function bankStatic(g, T, z) {
  const side = z.side, s0 = z.s0, s1 = z.s1, f = s => bankFade(z, s);   // (the banking eases in before the corner and out after it)
  for (const [a0, al] of [[0.05, 0.05], [0.35, 0.06], [0.65, 0.07]]) { band(g, T, s0 - BANK_IN, s1 + BANK_OUT, (s, q) => -side * q.hw * a0 * f(s), (s, q) => -side * (q.hw - 3) * f(s), 8); g.fillStyle = `rgba(235,240,245,${al})`; g.fill(); }
  const line = (off, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); for (let s = s0; s <= s1; s += 8) { const q = trackSample(T, s), o = off(q); g.lineTo(q.x + q.nx * o, q.y + q.ny * o); } g.stroke(); };
  line(() => 0, 'rgba(214,48,49,0.8)', 4);
  line(() => -side * z.top, 'rgba(41,128,214,0.85)', 4);
  // the wall: shadow, the face, the cap, and a band of hazard paint along the cap
  const wall = (a, b) => band(g, T, s0 - 100, s1 + 100, (s, q) => -side * (q.hw + a), (s, q) => -side * (q.hw + b), 8);
  g.save(); g.translate(6, 9); wall(6, 22); g.fillStyle = 'rgba(0,20,30,0.35)'; g.fill(); g.restore();
  wall(5, 22); g.fillStyle = '#9ea4aa'; g.fill();
  wall(5, 14); g.fillStyle = '#d2d6da'; g.fill();
  wall(16, 22); g.fillStyle = '#7d848b'; g.fill();
  for (let s = s0 - 90, k = 0; s < s1 + 90; s += 26, k++) {
    if (k % 2) continue;
    const a = trackSample(T, s), b = trackSample(T, s + 13), o0 = -side * (a.hw + 6), o1 = -side * (a.hw + 13);
    g.fillStyle = '#e04f3a'; g.beginPath(); g.moveTo(a.x + a.nx * o0, a.y + a.ny * o0); g.lineTo(b.x + b.nx * o0, b.y + b.ny * o0); g.lineTo(b.x + b.nx * o1, b.y + b.ny * o1); g.lineTo(a.x + a.nx * o1, a.y + a.ny * o1); g.closePath(); g.fill();
  }
}

function wormholeStatic(g, T, w) {
  // the pointer: a dashed arrow bowing away from the road it skips, from the entry's address to the exit's
  const A = w.A, B = w.B, mid = trackSample(T, (w.sA + w.sB) / 2), mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  let ux = mx - mid.x, uy = my - mid.y; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
  const cx = mx + ux * 150, cy = my + uy * 150;
  g.strokeStyle = '#c77dff99'; g.lineWidth = 7; g.setLineDash([18, 14]);
  g.beginPath(); g.moveTo(A.x + ux * 60, A.y + uy * 60); g.quadraticCurveTo(cx, cy, B.x + ux * 60, B.y + uy * 60); g.stroke(); g.setLineDash([]);
  const ha = Math.atan2(B.y + uy * 60 - cy, B.x + ux * 60 - cx);
  g.fillStyle = '#c77dffcc'; g.save(); g.translate(B.x + ux * 60, B.y + uy * 60); g.rotate(ha);
  g.beginPath(); g.moveTo(10, 0); g.lineTo(-16, -13); g.lineTo(-10, 0); g.lineTo(-16, 13); g.closePath(); g.fill(); g.restore();
  g.font = `700 30px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#e0aaffcc';
  g.fillText('*ptr', cx + ux * 26, cy + uy * 26);
  // each mouth: a dark disc across the road, a violet ring, and a glowing pylon each side
  for (const [q, exit] of [[A, false], [B, true]]) {
    g.save(); g.translate(q.x, q.y); g.rotate(angOf(q));
    const ry = q.hw + 6, rx = 32;
    g.fillStyle = '#00000040'; g.beginPath(); g.ellipse(4, 6, rx + 6, ry + 6, 0, 0, TAU); g.fill();
    g.fillStyle = '#160b29'; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU); g.fill();
    g.strokeStyle = '#5a189a'; g.lineWidth = 10; g.stroke();
    g.strokeStyle = exit ? '#5ef2ff' : '#c77dff'; g.lineWidth = 3; g.beginPath(); g.ellipse(0, 0, rx + 3, ry + 3, 0, 0, TAU); g.stroke();
    for (const sd of [-1, 1]) {
      const y = sd * (q.hw + 26);
      g.fillStyle = '#00000040'; blob(g, 4, y + 5, 16);
      g.fillStyle = '#2b2d42'; blob(g, 0, y, 15); g.fillStyle = '#3d405b'; blob(g, -2, y - 2, 11);
      g.fillStyle = exit ? '#5ef2ff' : '#c77dff'; blob(g, -2, y - 2, 5.5); g.fillStyle = '#ffffff'; blob(g, -3.5, y - 3.5, 2);
    }
    g.restore();
  }
}

function lowgStatic(g, T, lg) {
  // the dome's footing ring on the ground and its name
  if (lg.dome) {
    const d = lg.dome;
    g.fillStyle = '#9fb4ff10'; blob(g, d.x, d.y, d.r);
    g.strokeStyle = '#c9d6ff55'; g.lineWidth = 8; g.setLineDash([26, 18]); g.beginPath(); g.arc(d.x, d.y, d.r, 0, TAU); g.stroke(); g.setLineDash([]);
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU, x = d.x + Math.cos(a) * d.r, y = d.y + Math.sin(a) * d.r; g.fillStyle = '#00000033'; blob(g, x + 3, y + 4, 11); g.fillStyle = '#8e9bc4'; blob(g, x, y, 10); g.fillStyle = '#d9e2ff'; blob(g, x - 2, y - 2, 4.5); }
    g.font = `700 44px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#c9d6ffaa';
    g.fillText('LOW-G', d.x, d.y - d.r - 34);
  }
  // the crater: a rough lunar bowl across the whole road and its verges
  const rng = mulberry(Math.round(lg.c0) + 7), wob = [];
  for (let k = 0; k < 40; k++) wob.push(rng());
  const rim = (s, q, side, extra) => side * (q.hw + 34 + extra + wob[Math.floor((s - lg.c0) / 14) % 40] * 14) * clamp(Math.sin(Math.PI * clamp((s - lg.c0 + 30) / (lg.c1 - lg.c0 + 60), 0, 1)) * 1.6, 0.35, 1);
  band(g, T, lg.c0 - 30, lg.c1 + 30, (s, q) => rim(s, q, 1, 16), (s, q) => rim(s, q, -1, 16), 10);
  g.fillStyle = '#00000030'; g.save(); g.translate(6, 8); g.fill(); g.restore();
  g.fillStyle = '#b8c0d4'; g.fill();
  band(g, T, lg.c0 - 18, lg.c1 + 18, (s, q) => rim(s, q, 1, 2), (s, q) => rim(s, q, -1, 2), 10);
  g.fillStyle = '#5b6176'; g.fill();
  band(g, T, lg.c0, lg.c1, (s, q) => rim(s, q, 1, -12), (s, q) => rim(s, q, -1, -12), 10);
  g.fillStyle = '#2a2e3d'; g.fill();
  const mq = trackSample(T, (lg.c0 + lg.c1) / 2);
  g.fillStyle = '#12141c'; g.beginPath(); g.ellipse(mq.x, mq.y, (lg.c1 - lg.c0) * 0.32, mq.hw * 0.75, angOf(mq), 0, TAU); g.fill();
  for (let k = 0; k < 5; k++) {   // craterlets on the rim
    const s = lg.c0 + (k + 0.5) / 5 * (lg.c1 - lg.c0), q = trackSample(T, s), sd = k % 2 ? 1 : -1, o = sd * (q.hw + 30 + rng() * 10);
    g.fillStyle = '#8f97ab'; blob(g, q.x + q.nx * o, q.y + q.ny * o, 9 + rng() * 6); g.fillStyle = '#d8deea'; blob(g, q.x + q.nx * o - 2, q.y + q.ny * o - 2, 3);
  }
  // the moon ramp itself is drawn with the other ramps (art/track.js drawRamp), over this
}

function pressStatic(g, T, p) {
  const q = p.q, hw = q.hw, L = p.len;
  g.save(); g.translate(q.x, q.y); g.rotate(angOf(q));
  // the anvil bed across the road, with striped edges where the head lands
  g.fillStyle = '#00000038'; g.fillRect(-L / 2 - 6, -hw - 12, L + 16, hw * 2 + 28);
  g.fillStyle = '#30343f'; g.fillRect(-L / 2 - 10, -hw - 14, L + 20, hw * 2 + 28);
  g.fillStyle = '#464b58'; g.fillRect(-L / 2, -hw - 6, L, hw * 2 + 12);
  hazard(g, -L / 2 - 10, -hw - 14, 10, hw * 2 + 28); hazard(g, L / 2, -hw - 14, 10, hw * 2 + 28);
  g.fillStyle = '#5c6270'; for (let x = -L / 2 + 10; x < L / 2 - 4; x += 22) for (const y of [-hw + 6, 0, hw - 6]) blob(g, x, y, 3);
  // the two columns either side (seen from above: a block with a bevel)
  for (const sd of [-1, 1]) {
    const y = sd * (hw + 40);
    g.fillStyle = '#00000040'; g.fillRect(-L * 0.32 + 5, y - 14 + 6, L * 0.64, 28);
    g.fillStyle = '#4b5261'; g.fillRect(-L * 0.32, y - 14, L * 0.64, 28);
    g.fillStyle = '#6b7385'; g.fillRect(-L * 0.32 + 3, y - 11, L * 0.64 - 6, 10);
    hazard(g, -L * 0.32, y + 8, L * 0.64, 6);
  }
  g.restore();
}

// ------------------------------------------------------------------------------------------------ the slag pour
// Molten metal: textures made once (lazily: Node never draws) used as patterns; per frame only band fills along
// cached samples of the corner, no shadowBlur.
let SLAG_TEX = null;
function makeCanvas(w, h) { if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h); const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function slagTextures(ctx) {
  if (SLAG_TEX) return SLAG_TEX;
  const N = 256, rng = mulberry(91), wrap = fn => { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) fn(ox, oy); };
  // molten: a deep orange body, hot yellow-white currents and darker cooling streaks; everything wraps, so it tiles
  const mc = makeCanvas(N, N), m = mc.getContext('2d');
  m.fillStyle = '#f26a0e'; m.fillRect(0, 0, N, N);
  const soft = (x, y, r, col, a) => wrap((ox, oy) => { const gr = m.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); m.fillStyle = gr; m.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); });
  for (let k = 0; k < 40; k++) soft(rng() * N, rng() * N, 18 + rng() * 40, rng() > 0.5 ? '255,214,90' : '200,50,0', 0.55);   // hotter and cooler currents
  for (let k = 0; k < 14; k++) soft(rng() * N, rng() * N, 8 + rng() * 16, '255,250,225', 0.7);                         // white-hot upwellings
  // rafts of dark slag floating on it, each ringed by a bright seam where it meets the metal
  for (let k = 0; k < 16; k++) {
    const x = rng() * N, y = rng() * N, r = 5 + rng() * 13, n = 9, ph = [];
    for (let i = 0; i < n; i++) ph.push(r * (0.65 + rng() * 0.5));
    wrap((ox, oy) => {
      m.beginPath(); for (let i = 0; i <= n; i++) { const a = i / n * TAU, rr = ph[i % n]; m.lineTo(x + ox + Math.cos(a) * rr * 1.5, y + oy + Math.sin(a) * rr); } m.closePath();
      m.strokeStyle = 'rgba(255,240,180,0.55)'; m.lineWidth = 3; m.stroke(); m.fillStyle = 'rgba(70,22,8,0.78)'; m.fill();
    });
  }
  m.lineCap = 'round';
  for (let k = 0; k < 12; k++) {   // a few short ripples of light along the flow
    const y0 = rng() * N, x0 = rng() * N, amp = 2 + rng() * 4, ph = rng() * TAU, len = 20 + rng() * 40;
    m.strokeStyle = 'rgba(255,246,205,0.35)'; m.lineWidth = 1.2 + rng() * 1.5;
    wrap((ox, oy) => { m.beginPath(); for (let x = 0; x <= len; x += 5) m.lineTo(x0 + x + ox, y0 + Math.sin(x * 0.12 + ph) * amp + oy); m.stroke(); });
  }
  // crust: dark cooling plates with the glow showing through the cracks between them (a jittered grid, wrapped)
  const cc = makeCanvas(N, N), cg = cc.getContext('2d'), G = 8, cell = N / G, jit = [];
  cg.fillStyle = '#c2410c'; cg.fillRect(0, 0, N, N);
  for (let i = 0; i < G; i++) { jit[i] = []; for (let j = 0; j < G; j++) jit[i][j] = [(rng() - 0.5) * cell * 0.55, (rng() - 0.5) * cell * 0.55]; }
  const P = (i, j) => { const J = jit[((i % G) + G) % G][((j % G) + G) % G]; return [i * cell + J[0], j * cell + J[1]]; };
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
    const q = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)], cx = q.reduce((a, p) => a + p[0], 0) / 4, cy = q.reduce((a, p) => a + p[1], 0) / 4, shade = rng();
    wrap((ox, oy) => {
      cg.beginPath(); for (const [x, y] of q) cg.lineTo(cx + (x - cx) * 0.94 + ox, cy + (y - cy) * 0.94 + oy); cg.closePath();
      cg.fillStyle = shade > 0.6 ? '#3f2a25' : shade > 0.25 ? '#33211d' : '#4a3029'; cg.fill();
      cg.beginPath(); for (const [x, y] of q) cg.lineTo(cx + (x - cx) * 0.6 - 3 + ox, cy + (y - cy) * 0.6 - 3 + oy); cg.closePath();
      cg.fillStyle = 'rgba(255,255,255,0.06)'; cg.fill();   // lit from the top left
    });
  }
  // a soft glow to stamp (with 'lighter'): white-hot core, orange, gone
  const gc = makeCanvas(128, 128), gg = gc.getContext('2d'), gr = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,250,225,1)'); gr.addColorStop(0.25, 'rgba(255,196,64,0.75)'); gr.addColorStop(0.6, 'rgba(255,100,10,0.25)'); gr.addColorStop(1, 'rgba(255,80,0,0)');
  gg.fillStyle = gr; gg.fillRect(0, 0, 128, 128);
  SLAG_TEX = { molten: ctx.createPattern(mc, 'repeat'), crust: ctx.createPattern(cc, 'repeat'), glow: gc };
  return SLAG_TEX;
}
// a pattern turning slowly round the crucible (so the metal flows round the corner), or still
function flowing(pat, z, t, rate, scale = 1) {
  if (pat.setTransform && typeof DOMMatrix !== 'undefined') { const c = z.pit || { x: 0, y: 0 }; pat.setTransform(new DOMMatrix().translateSelf(c.x, c.y).rotateSelf(t * rate).scaleSelf(scale)); }
  return pat;
}
const glowAt = (ctx, img, x, y, r, a) => { ctx.globalAlpha = a; ctx.drawImage(img, x - r, y - r, r * 2, r * 2); };
// samples along the corner, made once per zone: where the bands are drawn from
const SLAG_SAMPLES = new WeakMap();
function slagSamples(T, z) {
  let S = SLAG_SAMPLES.get(z); if (S) return S;
  S = []; for (let s = z.s0; s <= z.s1 + 0.1; s += 8) { const q = trackSample(T, s); S.push({ s, x: q.x, y: q.y, nx: q.nx, ny: q.ny, hw: q.hw, a: angOf(q) }); }
  SLAG_SAMPLES.set(z, S); return S;
}
// a band between two offsets (functions of the sample), from the cached samples
function slagBand(g, S, offA, offB) {
  g.beginPath();
  for (const q of S) { const o = offA(q); g.lineTo(q.x + q.nx * o, q.y + q.ny * o); }
  for (let i = S.length - 1; i >= 0; i--) { const q = S[i], o = offB(q); g.lineTo(q.x + q.nx * o, q.y + q.ny * o); }
  g.closePath();
}
// the ladle's tilt: tipping over the warning, held while it pours, then righting itself
function ladleTilt(z, ph) {
  if (ph.warn > 0) return smooth01(ph.warn);
  const v = ph.u - POUR_WARN; return ph.pour ? 1 : clamp(1 - (v - SURGE - HOLD * 0.7) / 0.9, 0, 1);
}
const smooth01 = x => x * x * (3 - 2 * x);

// the Crucible, baked: apron with the groove, kerb, the pot (its surface is animated), the crane's footing
function slagStatic(g, T, z) {
  const side = z.side, S = slagSamples(T, z), at = (q, o) => [q.x + q.nx * side * o, q.y + q.ny * side * o];
  slagBand(g, S, q => side * (q.hw + 2), q => side * (q.hw + 36)); g.fillStyle = '#3b2c28'; g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.32)'; g.lineWidth = 1.5; g.beginPath();   // brick joints: courses across, staggered
  S.forEach((q, i) => { if (i % 2) return; const o0 = i % 4 ? 4 : 20, [ax, ay] = at(q, q.hw + o0), [bx, by] = at(q, q.hw + o0 + 14); g.moveTo(ax, ay); g.lineTo(bx, by); });
  g.stroke();
  for (const o of [18, 34]) { g.beginPath(); for (const q of S) { const [x, y] = at(q, q.hw + o); g.lineTo(x, y); } g.stroke(); }
  slagBand(g, S, q => side * (q.hw + 9), q => side * (q.hw + 27)); g.fillStyle = '#1a100d'; g.fill();   // the groove
  g.lineCap = 'butt';
  g.strokeStyle = '#6f727a'; g.lineWidth = 6; g.beginPath(); for (const q of S) { const [x, y] = at(q, q.hw + 3); g.lineTo(x, y); } g.stroke();
  g.strokeStyle = '#f2c94c'; g.lineWidth = 4; g.setLineDash([14, 14]); g.beginPath(); for (const q of S) { const [x, y] = at(q, q.hw + 3); g.lineTo(x, y); } g.stroke(); g.setLineDash([]);
  g.lineCap = 'round';
  if (z.pit) {   // the crucible: an iron pot on the apron, lit from the top left, bolted rim, four lugs
    const { x, y, r } = z.pit;
    g.fillStyle = 'rgba(0,0,0,0.35)'; blob(g, x + 9, y + 13, r + 22);
    const body = g.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.2, x, y, r + 22);
    body.addColorStop(0, '#7a675f'); body.addColorStop(0.7, '#4a3a35'); body.addColorStop(1, '#2a1f1c');
    g.fillStyle = body; blob(g, x, y, r + 20);
    g.strokeStyle = '#8f7f77'; g.lineWidth = 4; g.beginPath(); g.arc(x, y, r + 13, Math.PI * 0.9, Math.PI * 1.9); g.stroke();
    g.strokeStyle = '#231915'; g.lineWidth = 4; g.beginPath(); g.arc(x, y, r + 13, -Math.PI * 0.1, Math.PI * 0.9); g.stroke();
    g.fillStyle = '#140c0a'; blob(g, x, y, r + 5);
    for (let k = 0; k < 18; k++) { const a = k / 18 * TAU; g.fillStyle = '#a8968c'; blob(g, x + Math.cos(a) * (r + 13), y + Math.sin(a) * (r + 13), 2.2); }
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * TAU + Math.PI / 4, lx = x + Math.cos(a) * (r + 24), ly = y + Math.sin(a) * (r + 24);
      g.save(); g.translate(lx, ly); g.rotate(a); g.fillStyle = '#2e2420'; g.fillRect(-8, -11, 16, 22); g.fillStyle = '#6d5d56'; g.fillRect(-8, -11, 16, 5); g.restore();
    }
  }
  if (z.crane) {   // the crane's footing
    const { x, y } = z.crane;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 30, y - 24, 64, 60);
    g.fillStyle = '#8e9299'; g.fillRect(x - 34, y - 30, 64, 60); g.fillStyle = '#a9adb3'; g.fillRect(x - 34, y - 30, 64, 8);
    hazard(g, x - 34, y + 24, 64, 6);
  }
}


// ------------------------------------------------------------------------------------------------ animated, under the cars
export function drawMechanics(ctx, race) {
  const M = race.track.mech; if (!M) return;
  const T = race.track, t = race.time;
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const z of M.slag) slagFlood(ctx, T, z, t, slagNow(race, z, t));
  for (const w of M.wormholes) for (const [q, exit] of [[w.A, false], [w.B, true]]) vortex(ctx, w, q, exit, t);
  for (const p of M.presses) pressShadow(ctx, p, t, race.calm);
  for (const lg of M.lowg) if (lg.dome) dust(ctx, lg.dome, t);
  for (const lg of M.lowg) for (const m of lg.moon ? [lg.moon, ...lg.planets] : lg.planets) moonPull(ctx, m, t);
  if (M.volcano.length) VIEW = viewBox(ctx);
  M.volcano.forEach((v, i) => craterGlow(ctx, v, race.volc && race.volc[i], t));
  M.rivers.forEach((r, i) => riverFlow(ctx, race, T, r, i));
  for (const p of race.puddles || []) puddle(ctx, p, t);
  for (const b of race.bombs || []) bombTarget(ctx, b, t);
  if (M.waves.length && T.theme.deco === 'water') bayGlints(ctx, T, t);   // Merge Bay: the sun glinting on the bay (art/bay.js)
  M.waves.forEach((w, i) => waveWarn(ctx, T, w, race.wav && race.wav[i], t));
  for (const z of M.banks) if (z.sea) spray(ctx, T, z, t);
  if (M.hurricane) hurricaneUnder(ctx, race);   // the storm's shadow, the sea, wind streaks, rain splashing, the palms (art/hurricane.js)
  if (M.jackpots.length) goldBoxes(ctx, race, t);
  M.crab.forEach((z, i) => crabUnder(ctx, race, T, z, i, t));
  M.gates.forEach((z, i) => gateUnder(ctx, race, i, t));
  M.drawbridges.forEach((z, i) => drawbridgeUnder(ctx, T, z, DB.leafAt(race.lifts && race.lifts[i], t), t, DB));
  for (const R of T.routes || [T]) for (const z of R.mech ? R.mech.secrets : []) { secretGlow(ctx, race, R, z, t); mineUnder(ctx, race, R, z, t); }   // a secret shortcut: the sun stone glowing, the mine's lanterns and its rumble (art/phoenix.js, art/mine.js)
  if (M.ski) skiUnder(ctx, race);   // snow spray, the way through the trees (art/ski.js)
  if (M.elev && T.theme.deco === 'alpine') alpineUnder(ctx, race);   // the waterfall's spray (art/alpine.js)
  if (M.rain) neonUnder(ctx, race);   // spray off the karts, splashes, the monorail's shadow (art/neon.js)
  if (M.clock) clockUnder(ctx, race);   // the clocktower's gears turning, the hand's and the bob's shadows, the pads lit by the strike (art/clock.js)
  if (M.jets) airportUnder(ctx, race);   // the walkways, the carousel, the crossing lights, the jets' shadows and blast (art/airport.js)
  if (M.thickets.length) groveUnder(ctx, race);   // the chevrons into the Ash Run, the charred gap's embers (art/grove.js)
  if (M.rocket) moonshotUnder(ctx, race);   // the pad's barrier and lamps, the rockets' shadows, moon dust (art/moonshot.js)
  ctx.restore();
}

// waves bursting white against the seawall, now here, now there
function spray(ctx, T, z, t) {
  for (let k = 0; k < 5; k++) {
    const ph = (t * 0.7 + k * 0.53) % 1, s = z.s0 + ((k * 0.618 + Math.floor(t * 0.7 + k * 0.53) * 0.29) % 1) * (z.s1 - z.s0), q = trackSample(T, s), o = -z.side * (q.hw + 26), r = 10 + ph * 26;
    ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - ph)})`; blob(ctx, q.x + q.nx * o, q.y + q.ny * o, r);
    ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - ph)})`; blob(ctx, q.x + q.nx * (o - z.side * r * 0.6), q.y + q.ny * (o - z.side * r * 0.6), r * 0.6);
  }
}

function vortex(ctx, w, q, exit, t) {
  const st = wormState(w, t), ry = q.hw + 2, rx = 30;
  ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(angOf(q));
  if (st.open || st.closing) {
    const k = st.closing ? clamp((w.open - st.u) / w.close, 0.15, 1) : clamp(st.u / 0.25, 0.3, 1), flick = st.closing && Math.floor(t * 18) % 2;
    ctx.save(); ctx.scale(k, k);
    const gr = ctx.createRadialGradient(0, 0, 2, 0, 0, ry);
    gr.addColorStop(0, flick ? '#ffffff' : '#f3e8ff'); gr.addColorStop(0.35, flick ? '#ff4d6d' : (exit ? '#4cc9f0' : '#c77dff')); gr.addColorStop(1, '#3c096c00');
    ctx.save(); ctx.scale(rx / ry, 1); ctx.fillStyle = gr; blob(ctx, 0, 0, ry + 10); ctx.restore();
    // spiral arms turning (the exit turns the other way)
    ctx.save(); ctx.scale(rx / ry, 1); ctx.rotate((exit ? -1 : 1) * t * 5);
    ctx.strokeStyle = flick ? '#ffccd5' : '#ffffffb0'; ctx.lineWidth = 4;
    for (let a = 0; a < 3; a++) { ctx.beginPath(); for (let u = 0; u <= 1; u += 0.1) { const ang = a * TAU / 3 + u * 2.4, r = 6 + u * (ry - 8); ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r); } ctx.stroke(); }
    ctx.restore(); ctx.restore();
  } else {
    ctx.fillStyle = '#7b2cbf22'; ctx.beginPath(); ctx.ellipse(0, 0, rx - 6, ry - 6, 0, 0, TAU); ctx.fill();
  }
  // the timer ring: cyan for the time it stays open, amber counting down to the next opening
  const frac = st.open ? st.untilClose / (w.open - w.close) : st.closing ? 0 : 1 - st.untilOpen / (w.period - w.open + w.close);
  ctx.strokeStyle = st.open ? '#5ef2ff' : st.closing ? '#ff4d6d' : '#ffb703'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.ellipse(0, 0, rx + 12, ry + 12, 0, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(st.closing ? 1 : frac, 0, 1)); ctx.stroke();
  ctx.restore();
}

// the slag, animated under the cars: the groove and crucible, the surge across the road, the crust it leaves
function slagFlood(ctx, T, z, t, ph) {
  const tex = slagTextures(ctx), side = z.side, S = slagSamples(T, z), lvl = ph.level;
  const v = ph.u - POUR_WARN, fresh = ph.warn > 0 ? 0 : v < SURGE ? 1 : clamp(1 - (v - SURGE) / HOLD, 0, 1);   // how new the metal on the road is
  const hot = ph.warn > 0 ? ph.warn : ph.pour ? 1 : 0.25;
  ctx.fillStyle = flowing(tex.molten, z, t, -7 * side, 0.6);
  slagBand(ctx, S, q => side * (q.hw + 10), q => side * (q.hw + 26)); ctx.fill();
  if (z.pit) {
    const { x, y, r } = z.pit;
    ctx.fillStyle = flowing(tex.molten, z, t, 11, 0.85); blob(ctx, x, y, r + 4);
    ctx.globalCompositeOperation = 'lighter';
    glowAt(ctx, tex.glow, x - r * 0.2, y - r * 0.2, r * (0.9 + 0.3 * hot), 0.18 + 0.4 * hot + 0.05 * Math.sin(t * 9));
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  // the warning: the groove flares as the crucible fills
  if (ph.warn > 0.3) {
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,150,30,${0.35 * (ph.warn - 0.3) * (0.7 + 0.3 * Math.sin(t * 14))})`; ctx.lineWidth = 16;
    ctx.beginPath(); for (const q of S) { const o = side * (q.hw + 18); ctx.lineTo(q.x + q.nx * o, q.y + q.ny * o); } ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  const reach = q => z.cover * 2 * q.hw * slagTaper(z, q.s);
  // the crust it leaves draining back: dark plates over a dull glow, fading as they cool
  const crustA = lvl > 0 && v > SURGE + HOLD ? 1 : ph.since >= 0 && ph.since < 2.4 ? 1 - ph.since / 2.4 : 0;
  if (crustA > 0) {
    ctx.globalAlpha = 0.85 * crustA; ctx.fillStyle = flowing(tex.crust, z, 0, 0, 0.7);
    slagBand(ctx, S, q => side * (q.hw - reach(q)), q => side * (q.hw - reach(q) * lvl + 1)); ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (lvl <= 0.002) return;
  const front = q => side * (q.hw - reach(q) * lvl + Math.sin(q.s * 0.045 + t * 2.6) * 3 * lvl);
  const back = q => side * (q.hw + 26 * Math.min(1, slagTaper(z, q.s) * 3));   // (over the groove, but not past the ends of the corner)
  const line = (off, w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); for (const q of S) { const o = off(q); ctx.lineTo(q.x + q.nx * o, q.y + q.ny * o); } ctx.stroke(); };
  // the heat it throws onto the road ahead of it
  ctx.globalCompositeOperation = 'lighter';
  slagBand(ctx, S, q => front(q) - side * 26, front); ctx.fillStyle = `rgba(255,80,0,${0.1 + 0.08 * fresh})`; ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  // the metal, and a white-hot sheen on it while it's fresh
  ctx.fillStyle = flowing(tex.molten, z, t, -12 * side, 1); slagBand(ctx, S, front, back); ctx.fill();
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.22; ctx.fillStyle = flowing(tex.molten, z, -t, -5 * side, 1.7); slagBand(ctx, S, front, back); ctx.fill(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  if (fresh > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,220,120,${0.3 * fresh})`; slagBand(ctx, S, front, back); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
  // crusting at the edge as it settles
  const skin = 4 + 12 * (1 - fresh);
  ctx.globalAlpha = 0.9 * (1 - fresh * 0.7); ctx.fillStyle = flowing(tex.crust, z, t, -12 * side, 0.55);
  slagBand(ctx, S, q => front(q) + side * 4, q => front(q) + side * (4 + skin)); ctx.fill(); ctx.globalAlpha = 1;
  // the glowing lip
  ctx.globalCompositeOperation = 'lighter'; line(front, 12, 'rgba(255,110,0,0.35)'); ctx.globalCompositeOperation = 'source-over';
  line(front, 4.5, '#ffad42'); line(front, 1.8, '#fff3c4');
  // bubbles swelling and popping
  for (let k = 0; k < 12; k++) {
    const i = (k * 37 + Math.floor((t * 0.7 + k * 0.31))) % S.length, q = S[i], b = (t * 1.4 + k * 0.29) % 1;
    const o = side * (q.hw - reach(q) * lvl * (0.25 + ((k * 53) % 60) / 100)); if (reach(q) * lvl < 30) continue;
    const bx = q.x + q.nx * o, by = q.y + q.ny * o;
    if (b < 0.8) { ctx.strokeStyle = `rgba(255,240,190,${0.55 * (1 - b)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(bx, by, 2 + b * 7, 0, TAU); ctx.stroke(); }
    else { ctx.fillStyle = `rgba(255,250,220,${(1 - b) * 4})`; blob(ctx, bx, by - (b - 0.8) * 30, 2); }
  }
  // sparks spitting off the lip while the surge runs out
  if (fresh > 0.3) {
    ctx.lineCap = 'round'; ctx.lineWidth = 2;
    for (let k = 0; k < 18; k++) {
      const q = S[(k * 29 + Math.floor(t * 3)) % S.length], b = (t * 2.3 + k * 0.17) % 1, o = front(q), a = k * 2.39;
      const vx = Math.cos(a) * 70, vy = -90 - (k % 3) * 40, x = q.x + q.nx * o + vx * b * 0.6, y = q.y + q.ny * o + vy * b * 0.6 + 130 * b * b * 0.36;
      ctx.strokeStyle = `rgba(255,${200 + (k % 3) * 20},120,${(1 - b) * fresh})`; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - vx * 0.05, y - (vy + 130 * b * 0.6) * 0.05); ctx.stroke();
    }
  }
}

// over the cars: the crane and the ladle, which tips over the warning, pours and rights itself
function slagCrane(ctx, z, t, ph) {
  if (!z.pit || !z.crane) return;
  const tex = slagTextures(ctx), tilt = ladleTilt(z, ph), { x: px, y: py, r } = z.pit, { x: cx, y: cy } = z.crane;
  const H = 160, HL = 92, LR = 58, dx = px - cx, dy = py - cy, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, ang = Math.atan2(uy, ux);
  const lx = px - ux * r * 0.3, ly = py - uy * r * 0.3, ex = px + ux * (r * 0.3), ey = py + uy * (r * 0.3);   // the ladle; the jib's far end
  // shadows on the ground
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath(); ctx.ellipse(lx + HL * 0.3, ly + HL * 0.35, LR, LR * 0.9, ang, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 18; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + H * 0.3, cy + H * 0.35); ctx.lineTo(ex + H * 0.3, ey + H * 0.35); ctx.stroke(); ctx.lineCap = 'round';
  // the column, from its footing up to the jib
  const colG = ctx.createLinearGradient(cx - 14, 0, cx + 14, 0); colG.addColorStop(0, '#c9a227'); colG.addColorStop(1, '#8a6d12');
  ctx.fillStyle = colG; ctx.fillRect(cx - 13, cy - H, 26, H); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); for (let h = 20; h < H; h += 26) { ctx.moveTo(cx - 13, cy - h); ctx.lineTo(cx + 13, cy - h - 13); } ctx.stroke();
  // the jib: a hazard-striped beam out over the crucible, with its lamps
  ctx.save(); ctx.translate(cx, cy - H); ctx.rotate(ang);
  const jl = Math.hypot(ex - cx, ey - cy) + 24;
  ctx.fillStyle = '#5c4a0c'; ctx.fillRect(-20, -9 + 4, jl + 20, 18);
  hazard(ctx, -20, -9, jl + 20, 18);
  ctx.fillStyle = '#3d4052'; ctx.fillRect(-18, -16, 36, 32);   // the slewing head
  const on = ph.warn > 0 && Math.floor(t * 8) % 2;
  for (const s of [-1, 1]) { ctx.fillStyle = on ? '#ff3d00' : '#5a1a0a'; blob(ctx, jl - 8, s * 11, 4.5); if (on) { ctx.fillStyle = 'rgba(255,61,0,0.3)'; blob(ctx, jl - 8, s * 11, 12); } }
  ctx.restore();
  // the hoist cables, from the trolley on the jib down to the ladle's bail
  const by = ly - HL - 4;
  ctx.strokeStyle = '#2a2c33'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(lx - 5, ly - H); ctx.lineTo(lx - 5, by); ctx.moveTo(lx + 5, ly - H); ctx.lineTo(lx + 5, by); ctx.stroke();
  ctx.fillStyle = '#3d4052'; ctx.fillRect(lx - 12, ly - H - 6, 24, 12);
  // the pour: a white-hot stream from the spout down into the crucible, splashing (drawn first: the ladle's in front)
  const lip = LR * (1 - 0.3 * tilt) + 8, sx = lx + ux * lip, sy = ly + uy * lip;
  const pouring = ph.pour && tilt > 0.6;
  if (pouring) {
    const top = sy - HL + 2, wob = Math.sin(t * 23) * 1.5;
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const [w, col] of [[28, 'rgba(255,110,0,0.28)'], [14, 'rgba(255,170,40,0.9)'], [6, 'rgba(255,248,215,1)']]) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(sx, top); ctx.quadraticCurveTo(sx + ux * 10 + wob, (top + sy) / 2, sx + ux * 12 + wob, sy); ctx.stroke();
    }
    glowAt(ctx, tex.glow, sx + ux * 12, sy, 48 + 8 * Math.sin(t * 17), 0.85);
    ctx.lineWidth = 2;
    for (let k = 0; k < 16; k++) {
      const b = (t * 2.1 + k * 0.137) % 1, a = k * 2.39, vx = Math.cos(a) * (60 + (k % 4) * 25), vy = -150 - (k % 3) * 60;
      const x = sx + ux * 12 + vx * b * 0.55, y = sy + vy * b * 0.55 + 300 * (b * 0.55) ** 2;
      ctx.strokeStyle = `rgba(255,${190 + (k % 4) * 15},110,${1 - b})`; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - vx * 0.04, y - (vy + 600 * b * 0.55) * 0.04); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  // the ladle, tipping toward its spout, hung on two trunnions
  ctx.save(); ctx.translate(lx, ly - HL); ctx.rotate(ang);
  const rx = LR * (1 - 0.3 * tilt), sh = 6 * tilt;
  const steel = ctx.createRadialGradient(-LR * 0.4, -LR * 0.4, 4, 0, 0, LR + 6); steel.addColorStop(0, '#9ea4ad'); steel.addColorStop(0.6, '#5d626b'); steel.addColorStop(1, '#2f3238');
  ctx.fillStyle = steel; ctx.beginPath(); ctx.ellipse(-sh, 0, rx + 6, LR + 6, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(rx + 2, -10); ctx.lineTo(rx + 16, -6); ctx.lineTo(rx + 16, 6); ctx.lineTo(rx + 2, 10); ctx.closePath(); ctx.fill();   // the spout
  // inside: the metal stays level, so it slides toward the spout as the ladle tips
  ctx.save(); ctx.beginPath(); ctx.ellipse(sh * 0.5, 0, rx - 2, LR - 2, 0, 0, TAU); ctx.clip();
  ctx.fillStyle = flowing(tex.molten, z, t, 14, 0.5); ctx.fillRect(-LR - 10, -LR - 10, LR * 2 + 20, LR * 2 + 20);
  const lin = ctx.createLinearGradient(-rx, 0, rx, 0); lin.addColorStop(0, 'rgba(24,16,13,0.95)'); lin.addColorStop(clamp(0.12 + 0.45 * tilt, 0, 1), 'rgba(24,16,13,0.9)'); lin.addColorStop(clamp(0.22 + 0.45 * tilt, 0, 1), 'rgba(24,16,13,0)');
  ctx.fillStyle = lin; ctx.fillRect(-LR - 10, -LR - 10, LR * 2 + 20, LR * 2 + 20);
  ctx.restore();
  ctx.strokeStyle = '#b8bec6'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(sh * 0.5, 0, rx, LR, 0, Math.PI * 0.6, Math.PI * 1.6); ctx.stroke();
  ctx.strokeStyle = '#3a3e45'; ctx.beginPath(); ctx.ellipse(sh * 0.5, 0, rx, LR, 0, -Math.PI * 0.4, Math.PI * 0.6); ctx.stroke();
  if (tilt > 0.3) { ctx.globalCompositeOperation = 'lighter'; glowAt(ctx, tex.glow, rx + 6, 0, 18 + 10 * tilt, 0.7 * tilt); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
  ctx.fillStyle = '#3d4052'; for (const s of [-1, 1]) ctx.fillRect(-7, s * (LR + 5) - 5, 14, 10);   // trunnions
  ctx.strokeStyle = '#2a2c33'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, -(LR + 5)); ctx.quadraticCurveTo(-10, 0, 0, LR + 5); ctx.stroke();   // the bail
  ctx.fillStyle = '#c9a227'; ctx.fillRect(-9, -8, 14, 16);   // the hook block
  ctx.restore();
  // heat shimmer rising off the crucible
  ctx.strokeStyle = 'rgba(255,236,200,0.08)'; ctx.lineWidth = 3;
  for (let k = 0; k < 4; k++) {
    const b = (t * 0.6 + k * 0.25) % 1, x0 = px - r * 0.6 + k * r * 0.4, y0 = py - b * 140;
    ctx.globalAlpha = Math.sin(b * Math.PI); ctx.beginPath(); for (let h = 0; h <= 60; h += 6) ctx.lineTo(x0 + Math.sin(h * 0.15 + t * 4 + k) * 4, y0 - h); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function pressShadow(ctx, p, t, calm) {   // (calm, a time trial: parked up, its lamps dark)
  const h = calm ? 1 : pressHeight(p, t), q = p.q, hw = q.hw, L = p.len;
  const u = ((t + p.phase) % p.period + p.period) % p.period, warn = !calm && (u > p.period - 0.6 || u < 0.25);
  ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(angOf(q));
  const grow = 8 + h * 18;
  ctx.fillStyle = `rgba(0,0,0,${0.12 + 0.38 * (1 - h)})`; ctx.beginPath(); ctx.roundRect(-L / 2 - grow / 2, -hw - 4 - grow / 2, L + grow, hw * 2 + 8 + grow, 10); ctx.fill();
  for (const sd of [-1, 1]) {   // warning lamps on the columns: flashing before it drops
    const on = warn && Math.floor(t * 10) % 2;
    ctx.fillStyle = on ? '#ff1744' : '#5a1010'; blob(ctx, 0, sd * (hw + 40), 6);
    if (on) { ctx.fillStyle = '#ff174444'; blob(ctx, 0, sd * (hw + 40), 16); }
  }
  ctx.restore();
}

function dust(ctx, d, t) {
  const rng = mulberry(Math.round(d.x * 3 + d.y));
  for (let k = 0; k < 18; k++) {
    const a0 = rng() * TAU, r0 = Math.sqrt(rng()) * d.r * 0.92, sp = 0.05 + rng() * 0.1, bob = Math.sin(t * (0.6 + rng()) + k) * 14;
    const a = a0 + t * sp, x = d.x + Math.cos(a) * r0, y = d.y + Math.sin(a) * r0 + bob;
    ctx.fillStyle = `rgba(220,230,255,${0.25 + 0.25 * Math.sin(t * 2 + k)})`; blob(ctx, x, y, 2 + (k % 3));
  }
}

// ------------------------------------------------------------------------------------------------ over the cars
export function drawMechanicsOver(ctx, race) {
  const M = race.track.mech; if (!M) return;
  const t = race.time;
  ctx.save(); ctx.lineJoin = 'round';
  for (const p of M.presses) pressHead(ctx, p, t, race.calm);
  for (const z of M.slag) slagCrane(ctx, z, t, slagNow(race, z, t));
  for (const lg of M.lowg) if (lg.dome) domeGlass(ctx, lg.dome, t);
  M.waves.forEach((w, i) => waveCrest(ctx, race.track, w, race.wav && race.wav[i], t));
  if (M.volcano.length) {
    VIEW = viewBox(ctx);
    for (const c of race.cars) if (c.lavaT > 0) sinking(ctx, c, t);
    M.volcano.forEach((v, i) => plume(ctx, v, race.volc && race.volc[i], t));
    for (const b of race.bombs || []) bombAir(ctx, b, t);
  }
  if (M.hurricane) hurricaneOver(ctx, race);   // rain, the cloud spiral, lightning, debris, pennants and windsocks (art/hurricane.js)
  if (M.jackpots.length) for (const c of race.cars) if (c.slot) slotMachine(ctx, c, t, SPIN, SHOW, REEL_STOP);   // a slot machine spinning over a kart
  M.crab.forEach((z, i) => crabOver(ctx, race, race.track, z, i, t));
  M.drawbridges.forEach((z, i) => drawbridgeOver(ctx, race.track, z, DB.leafAt(race.lifts && race.lifts[i], t), t, DB));
  if (M.ski) skiOver(ctx, race, race.localHumans || race.humans);   // the chairlift, the Big Air's flip ring (art/ski.js)
  if (M.elev && race.track.theme.deco === 'alpine') alpineOver(ctx, race, race.localHumans || race.humans);   // the cable car, wind down the slopes, the Cliff's gauge (art/alpine.js)
  if (M.rain) neonOver(ctx, race);   // the rain, the monorail, holograms, steam (art/neon.js)
  if (M.drawbridges.length) sakuraPetals(ctx, t);   // (the garden's blossom on the breeze)
  if (M.clock) clockOver(ctx, race);   // the clock's hands, the pendulum, steam (art/clock.js)
  if (M.jets) airportOver(ctx, race);   // the jets and the windsocks (art/airport.js)
  if (M.thickets.length) groveOver(ctx, race);   // the thicket, its fire, the burnt trunks and the fireball (art/grove.js)
  if (M.rocket) moonshotOver(ctx, race);   // the rockets, the capsules coming home, the clouds (art/moonshot.js)
  phoenixBurns(ctx, race, t);   // karts the phoenix's landing burned out (art/phoenix.js)
  for (const c of race.cars) { const P = secretPose(c); if (P) secretOver(ctx, race, c, P, t); }   // a kart on a secret ride: up in flames, the phoenix (art/phoenix.js)
  for (const R of race.track.routes || [race.track]) for (const z of R.mech ? R.mech.secrets : []) mineOver(ctx, race, R, z, t);   // out of a mine's portal: the flash and the dust (art/mine.js)
  ctx.restore();
}

function pressHead(ctx, p, t, calm) {
  const h = calm ? 1 : pressHeight(p, t), q = p.q, hw = q.hw, L = p.len, lift = h * 64, top = 86;
  const a = angOf(q), ca = Math.cos(a), sa = Math.sin(a);
  // the gantry: a beam across the top of the two columns (columns drawn as rising up the screen from their feet)
  const foot = sd => [q.x - sa * sd * (hw + 40), q.y + ca * sd * (hw + 40)];
  ctx.strokeStyle = '#3d4350'; ctx.lineWidth = 24; ctx.lineCap = 'butt';
  for (const sd of [-1, 1]) { const [x, y] = foot(sd); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - top); ctx.stroke(); }
  ctx.strokeStyle = '#5f6778'; ctx.lineWidth = 8;
  for (const sd of [-1, 1]) { const [x, y] = foot(sd); ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x - 6, y - top); ctx.stroke(); }
  const [x1, y1] = foot(-1), [x2, y2] = foot(1);
  ctx.strokeStyle = '#4b5261'; ctx.lineWidth = 30; ctx.beginPath(); ctx.moveTo(x1, y1 - top); ctx.lineTo(x2, y2 - top); ctx.stroke();
  ctx.strokeStyle = '#7a8396'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x1, y1 - top - 8); ctx.lineTo(x2, y2 - top - 8); ctx.stroke();
  // the piston rod from the beam down to the head
  ctx.strokeStyle = '#b0b8c8'; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(q.x, q.y - top); ctx.lineTo(q.x, q.y - lift - 6); ctx.stroke();
  ctx.strokeStyle = '#e3e8f0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(q.x - 4, q.y - top); ctx.lineTo(q.x - 4, q.y - lift - 6); ctx.stroke();
  // the head: a heavy steel block, a touch bigger the higher it is (nearer the camera)
  ctx.save(); ctx.translate(q.x, q.y - lift); ctx.rotate(a); const k = 1 + h * 0.08; ctx.scale(k, k);
  ctx.globalAlpha = 1 - h * 0.45;   // see-through when it's up, so you can see who's underneath
  ctx.fillStyle = '#2e333d'; ctx.beginPath(); ctx.roundRect(-L / 2 - 4, -hw - 10, L + 8, hw * 2 + 20, 8); ctx.fill();
  ctx.fillStyle = '#6b7385'; ctx.beginPath(); ctx.roundRect(-L / 2, -hw - 6, L, hw * 2 + 12, 6); ctx.fill();
  ctx.fillStyle = '#8c95a8'; ctx.beginPath(); ctx.roundRect(-L / 2 + 5, -hw - 2, L - 10, hw * 0.7, 4); ctx.fill();
  hazard(ctx, -L / 2, hw - 6, L, 12); hazard(ctx, -L / 2, -hw - 6, L, 12);
  ctx.fillStyle = '#2b2f3a'; ctx.font = `800 ${Math.round(L * 0.42)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.save(); ctx.rotate(Math.PI / 2); ctx.fillText('STAMP', 0, 2); ctx.restore();
  ctx.restore();
}

function domeGlass(ctx, d, t) {
  ctx.strokeStyle = 'rgba(235,242,255,0.16)'; ctx.lineWidth = 26; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 0.86, Math.PI * 1.05, Math.PI * 1.45); ctx.stroke();
  ctx.strokeStyle = 'rgba(235,242,255,0.10)'; ctx.lineWidth = 12;
  ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 0.74, Math.PI * 1.1, Math.PI * 1.3); ctx.stroke();
  ctx.strokeStyle = `rgba(200,215,255,${0.18 + 0.06 * Math.sin(t * 1.5)})`; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.stroke();
}

// ------------------------------------------------------------------------------------------------ waves
// points along a wave's stretch of road at lateral offset `lat` (a ribbon of the road's shape), from s - len/2 to s + len/2
function waveLine(T, w, lat, wob, t) {
  const pts = [];
  for (let k = 0; k <= 16; k++) { const d = -w.len / 2 + w.len * k / 16, q = trackSample(T, w.s + d), l = lat + Math.sin(k * 1.7 + t * 6) * wob; pts.push([q.x + q.nx * l, q.y + q.ny * l]); }
  return pts;
}
// the warning: the swell rolling in and the foam line on the sea-side edge brightening
function waveWarn(ctx, T, w, st, t) {
  const now = waveState(w, st, t, T); if (!now || now.warn === undefined) return;
  const k = now.warn, hw = halfWAt(T, w.s), edge = w.side * hw, far = edge + w.side * (60 + 520 * (1 - k) * (1 - k));
  ctx.save(); ctx.globalAlpha = 0.3 + 0.6 * k;
  const swell = [...waveLine(T, w, far, 10, t), ...waveLine(T, w, far + w.side * (90 + 120 * k), 16, t).reverse()];
  ctx.fillStyle = 'rgba(15,80,130,0.6)'; ctx.beginPath(); swell.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 6 + 10 * k;                                   // the crest building as it comes
  ctx.beginPath(); waveLine(T, w, far, 10, t).forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5 + 7 * k; ctx.setLineDash([22, 12]); ctx.lineDashOffset = -t * 70;   // foam along the edge
  ctx.beginPath(); waveLine(T, w, edge, 4, t).forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
}
// the breaker: a blue wall of water with a white crest and spray, rolling across the road toward land, over the karts
function waveCrest(ctx, T, w, st, t) {
  const now = waveState(w, st, t, T); if (!now || now.front === undefined) return;
  const back = now.front + w.side * 170, fade = now.f > 0.8 ? (1 - now.f) / 0.2 : 1;
  ctx.save(); ctx.globalAlpha = 0.85 * fade;
  const face = [...waveLine(T, w, now.front, 7, t), ...waveLine(T, w, back, 12, t).reverse()];
  const q = trackSample(T, w.s), gx = q.nx * w.side, gy = q.ny * w.side;
  const g = ctx.createLinearGradient(q.x + gx * now.front, q.y + gy * now.front, q.x + gx * back, q.y + gy * back);
  g.addColorStop(0, 'rgba(230,250,255,0.95)'); g.addColorStop(0.3, 'rgba(90,190,230,0.8)'); g.addColorStop(1, 'rgba(30,110,170,0.25)');
  ctx.fillStyle = g; ctx.beginPath(); face.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 16; ctx.beginPath(); waveLine(T, w, now.front, 9, t).forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (const off of [12, 30]) for (const [x, y] of waveLine(T, w, now.front - w.side * off, 16, t * 1.3 + off)) { ctx.beginPath(); ctx.arc(x, y, 6 + 5 * Math.sin(x * 0.07 + t * 9 + off), 0, TAU); ctx.fill(); }   // spray
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ the volcano
const lerpN = (a, b, f) => a + (b - a) * f;

// Lava: textures made once (first volcano track built) used as patterns or stamped, so a frame only fills paths (no
// gradients, blur or filters). molten/crust/seams tile; glow, core, smoke, steam, ember are sprites.
const TEX = 256;
function canvas2d(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}
// tileable cellular noise (n × n cells on a size × size tile, through a swirl so it looks organic): per pixel F1, F2
// and the offset to the nearest point (DX, DY), in cells
function cellNoise(size, n, seed, warp) {
  const rng = mulberry(seed), cs = size / n, P = new Float32Array(n * n * 2), N = size * size, w = warp * size;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { P[(j * n + i) * 2] = (i + 0.15 + 0.7 * rng()) * cs; P[(j * n + i) * 2 + 1] = (j + 0.15 + 0.7 * rng()) * cs; }
  const F1 = new Float32Array(N), F2 = new Float32Array(N), DX = new Float32Array(N), DY = new Float32Array(N), ph = [rng(), rng(), rng(), rng()].map(v => v * TAU);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * TAU, v = y / size * TAU;   // (whole periods across the tile, so it still tiles)
    let qx = x + 0.5 + w * (Math.sin(2 * v + ph[0]) + 0.6 * Math.sin(3 * (u + v) + ph[1])), qy = y + 0.5 + w * (Math.sin(2 * u + ph[2]) + 0.6 * Math.sin(3 * (u - v) + ph[3]));
    qx = ((qx % size) + size) % size; qy = ((qy % size) + size) % size;
    const ci = Math.floor(qx / cs), cj = Math.floor(qy / cs); let f1 = 1e9, f2 = 1e9, bx = 0, by = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const I = ci + di, J = cj + dj, k = (((J + n) % n) * n + (I + n) % n) * 2;
      const dx = qx - (P[k] + Math.floor(I / n) * size), dy = qy - (P[k + 1] + Math.floor(J / n) * size), d = Math.hypot(dx, dy);
      if (d < f1) { f2 = f1; f1 = d; bx = dx; by = dy; } else if (d < f2) f2 = d;
    }
    const p = y * size + x; F1[p] = f1 / cs; F2[p] = f2 / cs; DX[p] = bx / cs; DY[p] = by / cs;
  }
  return { F1, F2, DX, DY };
}
// tileable value noise, octaves of 4..32 cells; 0..1
function fbm(size, seed) {
  const rng = mulberry(seed), out = new Float32Array(size * size);
  for (const [n, wt] of [[4, 0.5], [8, 0.27], [16, 0.15], [32, 0.08]]) {
    const L = new Float32Array(n * n).map(() => rng()), cs = size / n;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const gx = x / cs, gy = y / cs, i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const i1 = (i + 1) % n, j1 = (j + 1) % n, a = L[j * n + i], b = L[j * n + i1], c = L[j1 * n + i], d = L[j1 * n + i1];
      out[y * size + x] += wt * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
    }
  }
  return out;
}
function ramp(stops, v, out, o) {
  v = clamp(v, 0, 1); let k = 1; while (k < stops.length - 1 && stops[k][0] < v) k++;
  const [a, A] = stops[k - 1], [b, B] = stops[k], f = clamp((v - a) / (b - a || 1), 0, 1);
  for (let c = 0; c < 3; c++) out[o + c] = A[c] + (B[c] - A[c]) * f;
}
function texture(size, paint) {
  const c = canvas2d(size, size), g = c.getContext('2d'), im = g.createImageData(size, size);
  for (let p = 0; p < size * size; p++) paint(p, im.data, p * 4);
  g.putImageData(im, 0, 0); return c;
}
function radialSprite(n, stops, fx = 0.5, fy = 0.5) {
  const c = canvas2d(n, n), g = c.getContext('2d'), gr = g.createRadialGradient(n * fx, n * fy, 0, n / 2, n / 2, n / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, n, n); return c;
}
let LAVA = null;
function lava(g) {
  if (LAVA) return LAVA;
  const A = cellNoise(TEX, 8, 11, 0.03), B = cellNoise(TEX, 16, 23, 0.02), N1 = fbm(TEX, 5), N2 = fbm(TEX, 9), N3 = fbm(TEX, 13);
  const hot = [[0, [92, 14, 4]], [0.28, [178, 36, 6]], [0.5, [234, 84, 12]], [0.7, [255, 140, 30]], [0.86, [255, 196, 74]], [1, [255, 238, 184]]];
  const molten = texture(TEX, (p, d, o) => {
    // bright rivers of molten rock winding between darker, cooler skins: the ridges of a noise, swirled by two others
    const x = p % TEX, y = (p - x) / TEX, q = ((((y + Math.round((N2[p] - 0.5) * 70)) % TEX + TEX) % TEX) * TEX) + (((x + Math.round((N3[p] - 0.5) * 70)) % TEX + TEX) % TEX);
    const n = N1[q], river = Math.pow(1 - Math.min(1, Math.abs(n - 0.5) * 5), 2.2), skin = Math.min(1, Math.abs(n - 0.5) * 3);
    ramp(hot, 0.62 + 0.38 * river - 0.36 * skin + 0.1 * (N2[p] - 0.5), d, o); d[o + 3] = 255;
  });
  const crust = texture(TEX, (p, d, o) => {
    const seam = Math.exp(-(A.F2[p] - A.F1[p]) * 16), crack = Math.exp(-(B.F2[p] - B.F1[p]) * 22) * 0.45, lit = clamp(0.5 - 0.45 * (A.DX[p] + A.DY[p]), 0, 1);
    const grain = 0.05 * (B.F1[p] - 0.4), k = clamp(lit * 0.75 + grain, 0, 1) * (1 - seam) * (1 - crack);
    d[o] = 14 + 66 * k; d[o + 1] = 9 + 48 * k; d[o + 2] = 10 + 50 * k; d[o + 3] = 255;
  });
  const seams = texture(TEX, (p, d, o) => {
    const e = A.F2[p] - A.F1[p], a = Math.max(clamp(Math.exp(-e * 8) * 1.15, 0, 1), 0.4 * Math.exp(-(B.F2[p] - B.F1[p]) * 18)), w = Math.exp(-e * 24);
    d[o] = 255; d[o + 1] = 96 + 130 * w; d[o + 2] = 20 + 100 * w; d[o + 3] = 255 * a;
  });
  const smoke = canvas2d(64, 64), sg = smoke.getContext('2d');
  sg.drawImage(radialSprite(64, [[0, 'rgba(56,44,50,0.95)'], [0.55, 'rgba(56,44,50,0.6)'], [1, 'rgba(56,44,50,0)']]), 0, 0);
  sg.drawImage(radialSprite(64, [[0, 'rgba(170,152,158,0.55)'], [0.6, 'rgba(170,152,158,0.1)'], [1, 'rgba(170,152,158,0)']], 0.36, 0.34), -8, -8, 56, 56);   // lit on its top left
  return (LAVA = {
    molten: g.createPattern(molten, 'repeat'), crust: g.createPattern(crust, 'repeat'), seams: g.createPattern(seams, 'repeat'),
    glow: radialSprite(128, [[0, 'rgba(255,140,40,0.9)'], [0.22, 'rgba(255,110,30,0.55)'], [0.5, 'rgba(240,70,20,0.18)'], [1, 'rgba(220,50,10,0)']]),
    core: radialSprite(64, [[0, 'rgba(255,250,222,0.95)'], [0.3, 'rgba(255,218,120,0.7)'], [0.65, 'rgba(255,160,50,0.25)'], [1, 'rgba(255,140,40,0)']]),
    steam: radialSprite(64, [[0, 'rgba(248,246,244,0.95)'], [0.45, 'rgba(236,234,232,0.55)'], [1, 'rgba(230,228,226,0)']], 0.42, 0.4),
    ember: radialSprite(16, [[0, 'rgba(255,250,215,1)'], [0.35, 'rgba(255,190,80,0.9)'], [1, 'rgba(255,90,20,0)']]),
    smoke,
  });
}
// a sprite stamped centred on (x, y), r across its middle, at alpha a (on top of the alpha already set)
function stamp(ctx, img, x, y, r, a, base = 1) {
  if (a <= 0.004 || r <= 0) return;
  ctx.globalAlpha = base * Math.min(1, a); ctx.drawImage(img, x - r, y - r, r * 2, r * 2); ctx.globalAlpha = base;
}
// fill the current path with a pattern laid from (ox, oy) at scale s (the path keeps where it was built)
function fillPattern(ctx, pat, ox, oy, s, rule) {
  ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s); ctx.fillStyle = pat; if (rule) ctx.fill(rule); else ctx.fill(); ctx.restore();
}
// what's on screen (world box from the context's transform), so lava off screen costs nothing
let VIEW = null;
function viewBox(ctx) {
  if (!ctx.getTransform || !ctx.canvas) return null;
  const m = ctx.getTransform().inverse(), w = ctx.canvas.width, h = ctx.canvas.height, xs = [], ys = [];
  for (const [px, py] of [[0, 0], [w, 0], [0, h], [w, h]]) { xs.push(m.a * px + m.c * py + m.e); ys.push(m.b * px + m.d * py + m.f); }
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
const onView = (x, y, r) => !VIEW || (x + r > VIEW.x0 && x - r < VIEW.x1 && y + r > VIEW.y0 && y - r < VIEW.y1);

// the cone from above: base and lifted summit circles joined by their outer tangents
function conePath(g, x, y, R, H, r) {
  g.beginPath();
  if (R - r >= H) { g.arc(x, y, R, 0, TAU); return; }
  const b = Math.asin((R - r) / H);
  g.arc(x, y, R, -b, Math.PI + b); g.arc(x, y - H, r, Math.PI + b, TAU - b); g.closePath();
}
// how worked up a volcano is: rumbling before an eruption (pre), and the eruption itself fading (e)
function volcHeat(st, t) {
  if (!st) return { pre: 0, e: 0, heat: 0.15 };
  const pre = clamp(1 - (st.next - t) / RUMBLE, 0, 1), e = clamp(1 - (t - st.last) / 2, 0, 1);
  return { pre, e, heat: Math.max(pre, e) };
}
const FLOWS = [0.55, 1.35, 2.35];   // the old lava flows down the front of the cone (angles round the summit); the middle one is still molten
// a flow's line from the crater's lip down the flank and out past the foot
function flowPts(v, a) {
  const { x, y, R, H, rTop } = v, top = y - H, pts = [];
  for (let k = 0; k <= 10; k++) { const f = k / 10, rr = lerpN(rTop * 0.9, R * 1.12, f), aa = a + Math.sin(f * 5 + a * 3) * 0.06; pts.push([x + Math.cos(aa) * rr, lerpN(top, y, f) + Math.sin(aa) * rr]); }
  return pts;
}
const linePts = (g, pts, dx = 0) => pts.forEach(([px, py], k) => k ? g.lineTo(px + dx, py) : g.moveTo(px + dx, py));

function volcanoStatic(g, v) {
  lava(g);   // make the lava textures now, not on the first frame of the race
  const { x, y, R, H, rTop } = v, top = y - H, rng = mulberry(Math.round(x + y));
  // scorched ground round the foot, then the cone's shadow falling down-right
  for (const [k, a] of [[1.5, 0.08], [1.3, 0.12], [1.12, 0.16]]) { g.fillStyle = `rgba(25,14,16,${a})`; blob(g, x + R * 0.05, y + R * 0.08, R * k); }
  conePath(g, x + R * 0.24, y + R * 0.2, R, H, rTop); g.fillStyle = 'rgba(0,0,0,0.33)'; g.fill();
  // the cone, lit from the top left
  const lg = g.createLinearGradient(x - R, top - rTop, x + R * 0.9, y + R);
  lg.addColorStop(0, '#866c72'); lg.addColorStop(0.4, '#57424a'); lg.addColorStop(1, '#251a1e');
  conePath(g, x, y, R, H, rTop); g.fillStyle = lg; g.fill();
  g.save(); conePath(g, x, y, R, H, rTop); g.clip();
  // gullies down the flanks, each a dark groove with a lit edge
  for (let k = 0; k < 26; k++) {
    const a = (k + rng() * 0.6) / 26 * TAU, ca = Math.cos(a), sa = Math.sin(a), w = 0.04 + rng() * 0.05;
    const x0 = x + ca * rTop, y0 = top + sa * rTop, x1 = x + Math.cos(a + w) * R, y1 = y + Math.sin(a + w) * R;
    g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 2.5 + rng() * 2; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + sa * 8, (y0 + y1) / 2 - ca * 8, x1, y1); g.stroke();
    g.strokeStyle = 'rgba(255,225,225,0.07)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0 - 2, y0 - 2); g.quadraticCurveTo((x0 + x1) / 2 + sa * 8 - 2, (y0 + y1) / 2 - ca * 8 - 2, x1 - 2, y1 - 2); g.stroke();
  }
  // a darker band of shadow on the far side of the summit, a lighter one on the near flank
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(x + rTop * 0.6, top + rTop * 0.5, rTop * 1.4, rTop * 0.9, 0.6, 0, TAU); g.fill();
  g.restore();
  // old lava flows down the front, fanning out at the foot
  for (const a of FLOWS) {
    const pts = flowPts(v, a), [ex, ey] = pts[pts.length - 1];
    g.fillStyle = '#1c1114'; g.beginPath(); g.ellipse(ex, ey, 22, 14, a, 0, TAU); g.fill();
    for (const [w, col, dx] of [[20, '#1c1114', 0], [13, '#3a2022', 0], [4, 'rgba(160,110,104,0.35)', -3], [5, '#5c2a1f', 1]]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); linePts(g, pts, dx); g.stroke(); }
  }
  // the summit: a rim, the crater, a lake of lava (the animated layer makes it glow)
  g.fillStyle = 'rgba(0,0,0,0.25)'; blob(g, x + 5, top + 6, rTop * 1.04);
  g.fillStyle = '#6f565d'; blob(g, x, top, rTop);
  g.strokeStyle = '#9a8188'; g.lineWidth = 4; g.beginPath(); g.arc(x, top, rTop - 3, Math.PI * 0.95, Math.PI * 1.6); g.stroke();
  g.fillStyle = '#1a0f12'; blob(g, x, top, rTop * 0.74);
  g.strokeStyle = 'rgba(255,190,150,0.18)'; g.lineWidth = 3; g.beginPath(); g.arc(x, top, rTop * 0.7, -0.2, Math.PI * 0.7); g.stroke();   // the lit inner wall (lower right)
  const lake = g.createRadialGradient(x, top, 1, x, top, rTop * 0.56);
  lake.addColorStop(0, '#ffcf5a'); lake.addColorStop(0.5, '#e8590c'); lake.addColorStop(1, '#6a1a0b');
  g.fillStyle = lake; blob(g, x, top, rTop * 0.56);
}

// the crater's glow (steady, brighter as it rumbles, blazing as it blows), the lake and the flows
function craterGlow(ctx, v, st, t) {
  if (!onView(v.x, v.y - v.H * 0.6, v.R + v.H)) return;
  const L = lava(ctx), { pre, heat } = volcHeat(st, t), shake = pre > 0 ? Math.sin(t * 47) * 2.5 * pre : 0;
  const x = v.x + shake, top = v.y - v.H, r = v.rTop, flick = 0.08 * Math.sin(t * 3.1) + 0.05 * Math.sin(t * 7.3);
  ctx.globalCompositeOperation = 'lighter';
  stamp(ctx, L.glow, x, top + r * 0.3, r * (2.3 + 0.8 * heat), 0.3 + 0.55 * heat + flick);
  // the flows (the static layer has their crusted beds)
  const flows = FLOWS.map(a => flowPts(v, a));
  ctx.beginPath(); for (const k of [0, 2]) linePts(ctx, flows[k], shake);
  ctx.strokeStyle = `rgba(255,90,20,${0.08 + 0.3 * heat})`; ctx.lineWidth = 9; ctx.stroke();
  ctx.setLineDash([5, 11, 9, 7, 3, 14]); ctx.lineDashOffset = 0; ctx.strokeStyle = `rgba(255,170,70,${0.15 + 0.6 * heat})`; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); linePts(ctx, flows[1], shake);
  ctx.setLineDash([]); ctx.strokeStyle = `rgba(255,96,24,${0.22 + 0.2 * heat + flick})`; ctx.lineWidth = 18; ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = '#d9480f'; ctx.lineWidth = 8; ctx.stroke();
  ctx.strokeStyle = '#ff9326'; ctx.lineWidth = 4.5; ctx.stroke();
  ctx.setLineDash([9, 22]); ctx.lineDashOffset = -t * (20 + 30 * heat); ctx.strokeStyle = '#ffe28a'; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]);
  // the lake
  ctx.beginPath(); ctx.arc(x, top, r * (0.56 + 0.08 * heat), 0, TAU);
  fillPattern(ctx, L.molten, x + t * 5, top - t * 3, 0.45);
  ctx.strokeStyle = `rgba(255,150,60,${0.35 + 0.45 * heat})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, top, r * 0.68, 0, TAU); ctx.stroke();   // the inner wall, lit from below
  stamp(ctx, L.core, x - r * 0.06, top - r * 0.06, r * (0.42 + 0.25 * heat), 0.55 + 0.4 * heat + flick);
  ctx.beginPath();   // bubbles popping on the lake
  for (let k = 0; k < 5; k++) {
    const f = (t * (0.8 + k * 0.17) + k * 0.31) % 1, a = k * 2.4 + Math.floor(t * (0.8 + k * 0.17) + k * 0.31) * 1.7, d = r * 0.3 * ((k * 0.37) % 1), br = 1.5 + f * 5;
    ctx.moveTo(x + Math.cos(a) * d + br, top + Math.sin(a) * d); ctx.arc(x + Math.cos(a) * d, top + Math.sin(a) * d, br, 0, TAU);
  }
  ctx.strokeStyle = 'rgba(255,240,170,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
}

// a glob's outline (race-volcano.js radii) at scale k round (x, y), turned by rot, wobbling by up to wob in flight.
// Smoothed through the midpoints: the same splat the race tests, give or take a pixel.
function globPath(ctx, o, x, y, k, rot = 0, wob = 0, t = 0) {
  const n = o.rs.length, P = [];
  for (let i = 0; i < n; i++) {
    const a = o.dir + rot + i / n * TAU, w = wob ? 1 + wob * (Math.sin(t * 8 + i * TAU * 3 / n + o.id) + 0.6 * Math.sin(t * 13 - i * TAU * 2 / n)) : 1, r = o.rs[i] * k * w;
    P.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.beginPath(); ctx.moveTo((P[2 * n - 2] + P[0]) / 2, (P[2 * n - 1] + P[1]) / 2);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; ctx.quadraticCurveTo(P[2 * i], P[2 * i + 1], (P[2 * i] + P[2 * j]) / 2, (P[2 * i + 1] + P[2 * j + 1]) / 2); }
  ctx.closePath();
}
// a pool of lava. Two looks that can't be mixed up: the deadly molten part (exactly the size the race tests) is bright
// and glowing; the rest is dark crust (it only slows you), no glow. Steam puffs when the last of it crusts over.
function puddle(ctx, p, t) {
  const age = t - p.tL, h = puddleHeat(p, t), m = molten(p, t), fade = clamp((PUDDLE_LIFE - age) / 1.5, 0, 1);
  const k = 0.6 + 0.4 * clamp(age / 0.2, 0, 1), R = p.R0 * k;
  if (fade <= 0 || !onView(p.x, p.y, p.rMax * 1.7)) return;
  const L = lava(ctx), tx = p.x + p.id * 53, ty = p.y + p.id * 31;   // (each pool's own bit of the textures)
  ctx.globalAlpha = fade;
  if (m > 0) { ctx.globalCompositeOperation = 'lighter'; stamp(ctx, L.glow, p.x, p.y, p.rMax * k * (0.6 + 1.1 * m), 0.45 + 0.5 * m); ctx.globalCompositeOperation = 'source-over'; }
  globPath(ctx, p, p.x + 3, p.y + 4, k); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();   // a lip of shadow down-right
  // the crust: the whole splat, dark, a dull red in the seams while it's still warm
  globPath(ctx, p, p.x, p.y, k);
  fillPattern(ctx, L.crust, tx, ty, 0.62);
  ctx.fillStyle = 'rgba(18,14,16,0.35)'; ctx.fill();
  if (h > 0.02) {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fade * 0.3 * h;
    fillPattern(ctx, L.seams, tx, ty, 0.62);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = fade;
  }
  ctx.strokeStyle = 'rgba(12,6,7,0.6)'; ctx.lineWidth = 2; ctx.stroke();   // its edge
  // drops flung off the tendrils' tips (crust, molten inside while the pool is)
  for (const [col, sz, off] of [['#1c1214', 1, 0], [m > 0 ? '#ff9a2e' : '#3a2a2d', 0.6, -0.25]]) {
    ctx.fillStyle = col; ctx.beginPath();
    for (const d of p.drips) { const a = p.dir + d.a, r = d.size * k * sz, dx = p.x + Math.cos(a) * d.r * k + off * d.size, dy = p.y + Math.sin(a) * d.r * k + off * d.size; ctx.moveTo(dx + r, dy); ctx.arc(dx, dy, r, 0, TAU); }
    ctx.fill();
  }
  if (m > 0) {
    const km = m, fl = t * 9, beat = Math.sin(t * 8 + p.id);
    if (m < 1) { globPath(ctx, p, p.x, p.y, km + 0.12); ctx.strokeStyle = 'rgba(205,196,192,0.2)'; ctx.lineWidth = 7; ctx.stroke(); }   // the freshly frozen edge smoking
    // the molten middle: bright churning rock, white-hot in the middle
    globPath(ctx, p, p.x, p.y, km);
    ctx.save(); ctx.clip();
    fillPattern(ctx, L.molten, tx + Math.cos(p.dir) * fl, ty + Math.sin(p.dir) * fl, 0.8);
    ctx.globalCompositeOperation = 'lighter';   // a second layer churning across it: the surface shimmers, and burns brighter
    ctx.globalAlpha = fade * (0.4 + 0.12 * Math.sin(t * 2.3 + p.id));
    fillPattern(ctx, L.molten, tx - Math.sin(p.dir) * fl * 1.4, ty + Math.cos(p.dir) * fl * 1.4, 1.3);
    ctx.globalAlpha = fade;
    stamp(ctx, L.core, p.x - R * m * 0.12, p.y - R * m * 0.15, R * m * (1 + 0.08 * Math.sin(t * 4 + p.id)), 0.85, fade);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';   // its rim glowing and pulsing: deadly
    ctx.strokeStyle = `rgba(255,110,30,${0.3 + 0.15 * beat})`; ctx.lineWidth = 10; ctx.stroke();
    ctx.strokeStyle = `rgba(255,${200 + Math.round(40 * beat)},120,${0.75 + 0.2 * beat})`; ctx.lineWidth = 3; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();   // bubbles
    for (let j = 0; j < 5; j++) {
      const f = (t * 1.6 + j * 0.23 + p.id * 0.1) % 1, a = j * 1.9 + p.id, d = R * m * (0.12 + 0.14 * j), br = 1.5 + f * 6, bx = p.x + Math.cos(a) * d, by = p.y + Math.sin(a) * d;
      ctx.moveTo(bx + br, by); ctx.arc(bx, by, br, 0, TAU);
    }
    ctx.strokeStyle = 'rgba(255,248,205,0.75)'; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.beginPath();   // embers rising off it
    for (let j = 0; j < 6; j++) {
      const f = (t * 0.75 + j / 6 + p.id * 0.13) % 1, a = j * 2.4 + p.id, d = R * m * (0.15 + 0.55 * ((j * 0.37 + p.id * 0.11) % 1));
      const ex = p.x + Math.cos(a) * d + Math.sin(t * 3 + j) * 5, ey = p.y + Math.sin(a) * d * 0.7 - f * 70, er = (1 - f) * 2.6;
      ctx.moveTo(ex + er, ey); ctx.arc(ex, ey, er, 0, TAU);
    }
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ffc45e'; ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  // the last of it crusting over: it goes out in a puff of steam, the spot going dark
  const f = (age - CRUST) / 0.8;
  if (f >= 0 && f < 1) {
    globPath(ctx, p, p.x, p.y, k * GONE * (1 + 0.8 * f)); ctx.fillStyle = `rgba(8,5,6,${0.45 * (1 - f)})`; ctx.fill();
    for (let j = 0; j < 5; j++) {
      const a = j * 1.26 + p.id, d = R * (0.1 + 0.55 * Math.sqrt(f)), sr = R * (0.3 + 0.45 * f) * (0.8 + 0.3 * ((j * 0.37) % 1));
      stamp(ctx, L.steam, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.7 - f * 40, sr, (1 - f) * (1 - f) * 0.95, fade);
    }
  }
  ctx.globalAlpha = 1;
}

// where a glob will land, from the throw: its exact splat on the road, darkening and pulsing faster as it comes down
function bombTarget(ctx, b, t) {
  if (t < b.t0 || !onView(b.x, b.y, b.rMax * 2.4)) return;
  const L = lava(ctx), u = clamp((t - b.t0) / (b.tL - b.t0), 0, 1), pulse = 0.5 + 0.5 * Math.sin(t * (7 + 20 * u) + b.id);
  ctx.globalCompositeOperation = 'lighter';
  stamp(ctx, L.glow, b.x, b.y, b.rMax * 1.5, 0.12 + 0.4 * u * u);
  ctx.globalCompositeOperation = 'source-over';
  globPath(ctx, b, b.x, b.y, 1); ctx.fillStyle = `rgba(30,5,2,${0.26 + 0.34 * u})`; ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(255,80,16,${(0.18 + 0.4 * u) * (0.55 + 0.45 * pulse)})`; ctx.lineWidth = 9 + 7 * u; ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = `rgba(255,${130 + Math.round(110 * pulse)},${60 + Math.round(60 * pulse)},${0.65 + 0.35 * u})`; ctx.lineWidth = 2.5 + 1.5 * u; ctx.stroke();
  globPath(ctx, b, b.x, b.y, 0.15 + 0.8 * u); ctx.fillStyle = `rgba(14,2,0,${0.22 + 0.4 * u})`; ctx.fill();
  globPath(ctx, b, b.x, b.y, 1 + 1.3 * (1 - u)); ctx.strokeStyle = `rgba(255,170,80,${0.2 + 0.45 * u})`; ctx.lineWidth = 2; ctx.stroke();
}

// a glob in the air: the same shape, tumbling as it arcs over and growing as it comes down, with a smoky trail
function bombPos(b, u) {
  const v = b.v, arc = 200 + Math.hypot(b.x - v.x, b.y - v.y) * 0.45;
  return [lerpN(v.x, b.x, u), lerpN(v.y, b.y, u) - v.H * (1 - u) - arc * 4 * u * (1 - u)];
}
function bombAir(ctx, b, t) {
  if (t < b.t0) return;
  const u = clamp((t - b.t0) / (b.tL - b.t0), 0, 1), [x, y] = bombPos(b, u);
  if (!onView(x, y, 260)) return;
  const L = lava(ctx), k = 0.3 + 0.2 * u, r = b.R0 * k, rot = t * 2.2 + b.id;
  for (let j = 7; j >= 1; j--) {   // the smoke trail, oldest first
    const uu = u - j * 0.032; if (uu < 0) continue;
    const [px, py] = bombPos(b, uu), f = j / 8;
    stamp(ctx, L.smoke, px + Math.sin(j * 5 + t) * 4, py, 10 + 22 * f + 10 * u, 0.6 * (1 - f));
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath(); ctx.moveTo(x, y);   // the glowing streak it leaves
  for (let j = 1; j <= 5; j++) { const [px, py] = bombPos(b, Math.max(0, u - j * 0.012)); ctx.lineTo(px, py); }
  ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,90,20,0.3)'; ctx.lineWidth = r * 1.2; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,170,60,0.45)'; ctx.lineWidth = r * 0.45; ctx.stroke();
  stamp(ctx, L.glow, x, y, r * 3, 0.7);
  ctx.beginPath();   // sparks streaming off behind it
  for (let j = 0; j < 6; j++) {
    const f = (t * 2.2 + j / 6 + b.id * 0.37) % 1, [px, py] = bombPos(b, Math.max(0, u - f * 0.07)), a = j * 2.1 + b.id, d = r * (0.6 + f * 1.4);
    const sx = px + Math.cos(a) * d, sy = py + Math.sin(a) * d + f * 16;
    ctx.moveTo(sx, sy); ctx.lineTo(sx - Math.cos(a) * 5, sy - 6);
  }
  ctx.strokeStyle = 'rgba(255,200,100,0.85)'; ctx.lineWidth = 1.8; ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  globPath(ctx, b, x, y, k, rot, 0.08, t); ctx.fillStyle = '#3a150c'; ctx.fill();
  globPath(ctx, b, x - r * 0.08, y - r * 0.1, k * 0.8, rot, 0.1, t + 0.4); fillPattern(ctx, L.molten, x + t * 40, y - t * 25, 0.4);
  stamp(ctx, L.core, x - r * 0.22, y - r * 0.26, r * 0.95, 0.85);
  ctx.fillStyle = '#ff9a2e'; ctx.beginPath();   // drops coming loose
  for (let j = 0; j < 3; j++) { const a = rot * 1.3 + j * 2.1, d = r * (1.25 + 0.25 * Math.sin(t * 6 + j)), dx = x + Math.cos(a) * d, dy = y + Math.sin(a) * d; ctx.moveTo(dx + 2.5 + j, dy); ctx.arc(dx, dy, 2.5 + j, 0, TAU); }
  ctx.fill();
}

// smoke off the summit (thicker when worked up) and lava thrown up as it erupts
function plume(ctx, v, st, t) {
  const { e, heat } = volcHeat(st, t), x = v.x, top = v.y - v.H - v.rTop * 0.2, r = v.rTop;
  if (!onView(x + 80, top - 190, 330)) return;
  const L = lava(ctx);
  for (let k = 0; k < 11; k++) {
    const f = (t * 0.07 + k / 11) % 1, px = x + f * f * 150 + Math.sin(k * 2.1 + t * 0.5) * 16 * f, py = top - f * 380, pr = r * (0.55 + 2 * f);
    stamp(ctx, L.smoke, px, py, pr, (0.3 + 0.4 * heat) * (1 - f) * clamp(f / 0.08, 0, 1));
  }
  ctx.globalCompositeOperation = 'lighter';
  stamp(ctx, L.glow, x, top - r * 0.6, r * (1.3 + 0.6 * heat), 0.12 + 0.4 * heat);   // the smoke lit from the crater
  if (st && e > 0) {
    stamp(ctx, L.glow, x, top, r * 2.4, 0.8 * e);
    for (let k = 0; k < 16; k++) {
      const a = t - (st.last + k * 0.07); if (a < 0 || a > 1.2) continue;
      const ang = k * 2.399, vx = Math.cos(ang) * (40 + (k % 5) * 24), vy = 360 + (k % 3) * 90;
      const px = x + vx * a, py = top - (vy * a - 420 * a * a) + Math.sin(ang) * a * 30, rr = 7 + (k % 4) * 2;
      stamp(ctx, L.ember, px, py, rr * 1.6, 1.25 - a);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

// a kart melting down: lava closing over it, flames and smoke (render.js shrinks the kart)
function sinking(ctx, c, t) {
  if (!onView(c.x, c.y, 140)) return;
  const L = lava(ctx), f = clamp(1 - c.lavaT / SINK_T, 0, 1), R0 = Math.max(c.L, c.W) * 0.62, outer = R0 + 30, hole = Math.max(0.5, R0 * (1 - f) * (1 - 0.3 * f));
  const rim = (a, r) => r * (1 + 0.09 * Math.sin(a * 5 + c.idx * 2 + t * 2) + 0.05 * Math.sin(a * 3 - t * 3));   // a lumpy pool, not a ring
  const pool = (r, dir) => { const P = []; for (let k = 0; k <= 36; k++) { const a = (dir > 0 ? k : 36 - k) / 36 * TAU; P.push([c.x + Math.cos(a) * rim(a, r), c.y + Math.sin(a) * rim(a, r)]); } return P; };
  ctx.globalCompositeOperation = 'lighter'; stamp(ctx, L.glow, c.x, c.y, outer * 1.6, 0.7); ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(28,10,6,${0.6 * f})`; blob(ctx, c.x, c.y, hole);              // charred
  ctx.fillStyle = `rgba(255,90,20,${0.15 + 0.4 * f})`; blob(ctx, c.x, c.y, hole);   // and glowing as it goes
  const edge = pool(outer, 1);
  ctx.beginPath(); for (const [px, py] of edge) ctx.lineTo(px, py); ctx.closePath(); ctx.moveTo(c.x + hole, c.y); ctx.arc(c.x, c.y, hole, 0, TAU, true);
  fillPattern(ctx, L.molten, c.x + t * 12, c.y - t * 7, 0.7, 'evenodd');
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,190,90,0.18)'; ctx.fill('evenodd'); ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(c.x, c.y, hole + 2, 0, TAU); ctx.stroke();
  ctx.beginPath(); for (const [px, py] of edge) ctx.lineTo(px, py); ctx.closePath();
  ctx.strokeStyle = '#3b2023'; ctx.lineWidth = 7; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,120,40,0.5)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const g = (t * 1.6 + k / 6) % 1, a = k * 1.05 + c.idx, d = hole + 6 + (outer - hole - 10) * ((k * 0.43) % 1), bx = c.x + Math.cos(a) * d, by = c.y + Math.sin(a) * d, br = 2 + g * 8;
    ctx.moveTo(bx + br, by); ctx.arc(bx, by, br, 0, TAU);
  }
  ctx.strokeStyle = 'rgba(255,236,170,0.6)'; ctx.lineWidth = 2.5; ctx.stroke();
  // flames licking up the screen off the kart, strongest as it goes under
  const fl = Math.sin(Math.PI * Math.min(1, f * 1.15)) * 0.7 + 0.3;
  for (const [col, s] of [['rgba(255,100,20,0.85)', 1], ['rgba(255,214,110,0.9)', 0.55]]) {
    ctx.fillStyle = col; ctx.beginPath();
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU + c.idx, bx = c.x + Math.cos(a) * Math.max(hole, 8) * 0.8, by = c.y + Math.sin(a) * Math.max(hole, 8) * 0.55;
      const h = (22 + 28 * ((k * 0.61) % 1)) * fl * (0.75 + 0.25 * Math.sin(t * 19 + k * 2.7)), w = 8 + 4 * ((k * 0.37) % 1), sway = Math.sin(t * 11 + k) * 4;
      ctx.moveTo(bx - w * s, by);
      ctx.quadraticCurveTo(bx - w * s, by - h * s * 0.6, bx + sway, by - h * s); ctx.quadraticCurveTo(bx + w * s, by - h * s * 0.6, bx + w * s, by);
      ctx.quadraticCurveTo(bx, by + w * s * 0.6, bx - w * s, by);
    }
    ctx.fill();
  }
}

// ------------------------------------------------------------------------------------------------ the boulder run and the temple
const STONE = ['#4d4637', '#8a7f66', '#cfc4a5'];   // dark, mid, lit
const lobed = (x, y, r, n, amp, seed) => { const P = []; for (let i = 0; i < n; i++) { const a = i / n * TAU; const w = 1 + amp * (Math.sin(a * 3 + seed) * 0.6 + Math.sin(a * 5 + seed * 2.3) * 0.4); P.push([x + Math.cos(a) * r * w, y + Math.sin(a) * r * w]); } return P; };
const pathOf = (g, P) => { g.beginPath(); P.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); };

// the boulder run's groove and walls, and the gorge past the hairpin where they end up
function boulderStatic(g, T, z) {
  const rng = mulberry(Math.round(z.s0) + 11), run = T.def.runoff || 46;
  band(g, T, z.s0 + 20, z.s1 - 30, () => z.R * 0.55, () => -z.R * 0.55, 10); g.fillStyle = 'rgba(40,32,20,0.13)'; g.fill();
  for (let s = z.s0 + 40; s < z.s1 - 40; s += 26 + rng() * 30) {   // scuffs where they bounced
    const q = trackSample(T, s), o = (rng() - 0.5) * z.R; ctx2(g, q, o, 6 + rng() * 10, 'rgba(30,24,16,0.18)');
  }
  for (const sd of [-1, 1]) {
    const off = (s, q) => sd * (q.hw + run + 4), off2 = (s, q) => sd * (q.hw + run + 18);
    g.save(); g.translate(5, 7); band(g, T, z.s0 + 60, z.s1 - 60, off, off2, 8); g.fillStyle = 'rgba(10,20,10,0.3)'; g.fill(); g.restore();
    band(g, T, z.s0 + 60, z.s1 - 60, off, off2, 8); g.fillStyle = '#7d7660'; g.fill();
    band(g, T, z.s0 + 60, z.s1 - 60, off, (s, q) => sd * (q.hw + run + 11), 8); g.fillStyle = '#a69d82'; g.fill();
    for (let s = z.s0 + 60; s < z.s1 - 60; s += 30) {   // block joints, moss on top, and a squat pillar now and then
      const q = trackSample(T, s), [x0, y0] = [q.x + q.nx * off(s, q), q.y + q.ny * off(s, q)], [x1, y1] = [q.x + q.nx * off2(s, q), q.y + q.ny * off2(s, q)];
      g.strokeStyle = 'rgba(50,44,32,0.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      if (rng() < 0.45) { g.fillStyle = rng() < 0.5 ? 'rgba(86,130,52,0.8)' : 'rgba(112,152,64,0.7)'; ell(g, (x0 + x1) / 2 + (rng() - 0.5) * 12, (y0 + y1) / 2, 6 + rng() * 6, 3.5, Math.atan2(q.ty, q.tx)); g.fill(); }
      if (Math.round((s - z.s0) / 30) % 8 === 4) {
        const px = (x0 + x1) / 2, py = (y0 + y1) / 2;
        g.fillStyle = 'rgba(10,20,10,0.3)'; g.fillRect(px - 9, py - 6, 22, 20);
        g.fillStyle = '#6f6852'; g.fillRect(px - 11, py - 11, 22, 20); g.fillStyle = '#b3aa8c'; g.fillRect(px - 11, py - 14, 22, 12);
        g.fillStyle = '#5a5340'; circ(g, px, py - 8, 3); g.fill();
      }
    }
  }
  gorgeStatic(g, z.gorge, rng);
}
const ctx2 = (g, q, o, l, col) => { const x = q.x + q.nx * o, y = q.y + q.ny * o; ell(g, x, y, l, 2.2, Math.atan2(q.ty, q.tx)); g.fillStyle = col; g.fill(); };
function gorgeStatic(g, G, rng) {
  const rim = lobed(G.x, G.y, G.r, 30, 0.08, 1.7);
  // the cliffs going down: lip, then rings stepping down and darker, the lower-right (lit) side showing more
  pathOf(g, rim.map(([x, y]) => [G.x + (x - G.x) * 1.08, G.y + (y - G.y) * 1.08])); g.fillStyle = '#8e8466'; g.fill();
  for (let k = 0; k < 7; k++) {
    const f = k / 7, ox = G.r * 0.12 * f, oy = G.r * 0.16 * f, sc = 1 - f * 0.42;
    pathOf(g, rim.map(([x, y]) => [G.x + ox + (x - G.x) * sc, G.y + oy + (y - G.y) * sc])); g.fillStyle = mix(k % 2 ? '#9a8a68' : '#8a7a5a', '#2b2a22', f * 0.85); g.fill();
  }
  const fx = G.x + G.r * 0.12, fy = G.y + G.r * 0.16, fr = G.r * 0.58;
  // the floor: a river running through, the rubble of smashed boulders on its banks
  g.save(); pathOf(g, rim.map(([x, y]) => [fx + (x - G.x) * 0.58, fy + (y - G.y) * 0.58])); g.clip();
  g.fillStyle = '#3d3a2c'; g.fillRect(fx - fr * 1.2, fy - fr * 1.2, fr * 2.4, fr * 2.4);
  g.strokeStyle = '#1f5e66'; g.lineWidth = fr * 0.55; g.beginPath(); g.moveTo(fx - fr * 0.3, fy - fr * 1.2); g.bezierCurveTo(fx + fr * 0.2, fy - fr * 0.3, fx - fr * 0.5, fy + fr * 0.2, fx - fr * 1.3, fy + fr * 0.8); g.stroke();
  g.strokeStyle = '#2f8c8f'; g.lineWidth = fr * 0.32; g.stroke();
  g.strokeStyle = 'rgba(220,245,240,0.5)'; g.lineWidth = 1.4; g.setLineDash([6, 12]); g.stroke(); g.setLineDash([]);
  for (let k = 0; k < 9; k++) {   // broken boulders: chunks of the carved ball
    const a = rng() * TAU, d = fr * (0.35 + rng() * 0.55), x = fx + Math.cos(a) * d, y = fy + Math.sin(a) * d, r = 5 + rng() * 9;
    g.fillStyle = 'rgba(0,0,0,0.35)'; ell(g, x + r * 0.3, y + r * 0.4, r, r * 0.7); g.fill();
    poly(g, [[x - r, y + r * 0.2], [x - r * 0.4, y - r * 0.8], [x + r * 0.7, y - r * 0.5], [x + r, y + r * 0.5], [x, y + r * 0.8]]); g.fillStyle = k % 3 ? '#7c735c' : '#9a9076'; g.fill();
    poly(g, [[x - r * 0.4, y - r * 0.8], [x + r * 0.7, y - r * 0.5], [x + r * 0.1, y]]); g.fillStyle = '#b8ae90'; g.fill();
  }
  g.restore();
  // the near (upper-left) cliffs in shade
  g.save(); pathOf(g, rim); g.clip();
  g.fillStyle = 'rgba(10,12,8,0.35)'; g.beginPath(); g.ellipse(G.x - G.r * 0.22, G.y - G.r * 0.25, G.r * 1.05, G.r * 0.95, 0, 0, TAU); g.ellipse(G.x + G.r * 0.1, G.y + G.r * 0.12, G.r * 0.62, G.r * 0.6, 0, 0, TAU, true); g.fill();
  g.restore();
  // a waterfall over the north lip, down to the river, mist where it lands
  const wx = G.x + G.r * 0.05, wy = G.y - G.r * 1.0, by = fy - fr * 0.75;
  g.strokeStyle = '#2d7f9a'; g.lineWidth = 16; g.beginPath(); g.moveTo(wx - 30, wy - 140); g.quadraticCurveTo(wx - 10, wy - 50, wx, wy); g.stroke();
  g.strokeStyle = '#5fbfd6'; g.lineWidth = 8; g.stroke();
  g.fillStyle = linear(g, wx, wy, wx, by, [[0, '#e3f6f6'], [1, '#a6e1e4']]); g.beginPath(); g.moveTo(wx - 14, wy); g.lineTo(wx + 14, wy); g.lineTo(wx + 20, by); g.lineTo(wx - 10, by); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.5; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(wx + k * 5, wy + 3); g.lineTo(wx + k * 6 + 4, by - 3); g.stroke(); }
  for (let k = 0; k < 9; k++) { g.fillStyle = 'rgba(255,255,255,0.55)'; circ(g, wx + 4 + (rng() - 0.5) * 40, by + (rng() - 0.5) * 16, 4 + rng() * 6); g.fill(); }
  for (let k = 0; k < 16; k++) {   // ferns and vines hanging over the lip
    const a = rng() * TAU, px = G.x + Math.cos(a) * G.r * 1.06, py = G.y + Math.sin(a) * G.r * 1.06, l = 10 + rng() * 22;
    g.strokeStyle = '#3f6e2c'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px - Math.cos(a) * l * 0.6 + 3, py - Math.sin(a) * l * 0.6, px - Math.cos(a) * l, py - Math.sin(a) * l + l * 0.4); g.stroke();
    ell(g, px + Math.cos(a) * 5, py + Math.sin(a) * 5, 8, 4.5, a); g.fillStyle = k % 2 ? '#3f7a32' : '#5d9a42'; g.fill();
  }
}

// the temple's shadow on the ground (the temple itself is a roof over the road, drawn over the cars)
function tunnelStatic(g, T, u) {
  const h = u.half;
  g.fillStyle = 'rgba(8,18,10,0.28)'; g.beginPath(); g.roundRect(u.x - h + 34, u.y - h + 46, h * 2, h * 2, 20); g.fill();
}

// roofs, cached by render.js and laid over the cars (the serpent's head, the temple): { x, y, w, h, draw(g) }, world units
export function roofLayers(T) {
  const M = T.mech; if (!M) return [];
  const out = [];
  if (M.drawbridges.length) out.push(...toriiRoofs(T));   // the torii over the road (art/sakura.js)
  if (M.jets) out.push(...airportRoofs(T));   // the runway over the tunnel, the terminal's glass roof (art/airport.js)
  for (const z of M.boulders) { const r = z.head.r * 2.4; out.push({ x: z.head.x - r, y: z.head.y - r, w: r * 2, h: r * 2, draw: g => serpentHead(g, z) }); }
  if (M.clock) out.push(...clockRoofs(T, M.clock));   // the arches the hand passes over (art/clock.js)
  if (M.rocket) out.push(...moonshotRoofs(T));   // Moonshot: the assembly building's glass roof, the lava tube's lid, the base's glass tube (art/moonshot.js)
  else for (const u of M.tunnels) { const r = u.half + 60, up = TP.n * TP.hs + 90; out.push({ x: u.x - r, y: u.y - r - up, w: r * 2, h: r * 2 + up, draw: g => temple(g, T, u) }); }
  return out;
}
// the serpent's head in its own frame: +x is the way the road runs out of its mouth
function serpentFrame(z) { const W = z.head.r, L = W * 1.25; return { W, L, front: L * 0.45, back: -L * 0.8, eye: [-L * 0.12, W * 0.62] }; }
function serpentHead(g, z) {
  const F = serpentFrame(z), { W, L } = F, rng = mulberry(17);
  g.save(); g.translate(z.head.x, z.head.y); g.rotate(z.head.a);
  const outline = s => {   // a blunt wedge: wide at the jaws, tapering a little to the back, the snout rounded
    g.beginPath(); g.moveTo(F.back * s, 0);
    g.bezierCurveTo(F.back * s, -W * 0.8 * s, -L * 0.3 * s, -W * s, F.front * 0.4 * s, -W * 0.92 * s);
    g.bezierCurveTo(F.front * 1.05 * s, -W * 0.8 * s, F.front * 1.15 * s, -W * 0.3 * s, F.front * 1.1 * s, 0);
    g.bezierCurveTo(F.front * 1.15 * s, W * 0.3 * s, F.front * 1.05 * s, W * 0.8 * s, F.front * 0.4 * s, W * 0.92 * s);
    g.bezierCurveTo(-L * 0.3 * s, W * s, F.back * s, W * 0.8 * s, F.back * s, 0); g.closePath();
  };
  // the feathered collar fanning out behind and round the head
  for (let k = 0; k < 13; k++) {
    const a = Math.PI * 0.55 + k / 12 * Math.PI * 0.9, cx = F.back * 0.55, len = W * 0.95, fx = cx + Math.cos(a) * len, fy = Math.sin(a) * len * 1.05;
    const col = ['#3f9a6a', '#2f7f8a', '#c9a23c'][k % 3];
    g.save(); g.translate(fx, fy); g.rotate(a);
    ell(g, 6, 8, W * 0.32, W * 0.13); g.fillStyle = 'rgba(10,18,12,0.3)'; g.fill();
    ell(g, 0, 0, W * 0.32, W * 0.13); g.fillStyle = col; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-W * 0.28, 0); g.lineTo(W * 0.28, 0); g.stroke();
    g.restore();
  }
  // shadow, then the head, lit from the top left (in screen terms: the gradient isn't rotated with the head)
  g.save(); g.translate(14, 4); outline(1); g.fillStyle = 'rgba(10,16,8,0.35)'; g.fill(); g.restore();
  outline(1); g.fillStyle = '#6a624d'; g.fill();
  g.save(); g.rotate(-z.head.a); g.translate(-W * 0.4, -W * 0.5);
  const lit = g.createRadialGradient(0, 0, W * 0.1, 0, 0, W * 2.2); lit.addColorStop(0, '#d9cfae'); lit.addColorStop(0.5, '#a89c7c'); lit.addColorStop(1, '#5d5643'); g.restore();
  outline(0.94); g.fillStyle = lit; g.fill();
  // carved scales in rows across the top, and a ridge down the middle
  g.save(); outline(0.92); g.clip();
  g.strokeStyle = 'rgba(60,52,36,0.45)'; g.lineWidth = 2;
  for (let x = F.back; x < F.front * 0.5; x += W * 0.22) for (let y = -W; y <= W; y += W * 0.26) { g.beginPath(); g.arc(x + ((Math.round(y / (W * 0.26)) % 2) ? W * 0.11 : 0), y, W * 0.12, -Math.PI / 2, Math.PI / 2); g.stroke(); }
  for (let k = 0; k < 5; k++) { g.fillStyle = 'rgba(86,130,52,0.7)'; ell(g, F.back * 0.3 + (rng() - 0.5) * L, (rng() - 0.5) * W * 1.4, W * 0.18, W * 0.1, rng() * 3); g.fill(); }   // moss
  g.restore();
  // the brow ridges over the eyes, the nostrils at the snout, and the fangs either side of the mouth
  for (const sd of [-1, 1]) {
    const ex = F.eye[0], ey = sd * F.eye[1];
    g.fillStyle = '#5e5743'; ell(g, ex + 4, ey + 4, W * 0.24, W * 0.17); g.fill();
    g.fillStyle = '#c4b893'; g.beginPath(); g.ellipse(ex - W * 0.05, ey, W * 0.27, W * 0.2, 0, Math.PI * (sd > 0 ? 0.9 : 1.1), Math.PI * (sd > 0 ? 2.1 : -0.1), sd < 0); g.lineWidth = W * 0.07; g.strokeStyle = '#c4b893'; g.stroke();
    g.fillStyle = '#2a1c1c'; ell(g, ex, ey, W * 0.17, W * 0.12); g.fill();   // the socket (the ruby is drawn with its glow, every frame)
    g.fillStyle = '#3c3628'; ell(g, F.front * 0.85, sd * W * 0.22, W * 0.07, W * 0.04, 0.4 * sd); g.fill();
    g.fillStyle = 'rgba(10,16,8,0.3)'; g.beginPath(); g.moveTo(F.front * 0.95 + 6, sd * W * 0.62 + 4); g.quadraticCurveTo(F.front * 1.5 + 6, sd * W * 0.7 + 4, F.front * 1.6 + 6, sd * W * 0.5 + 4); g.lineTo(F.front * 0.95 + 6, sd * W * 0.45 + 4); g.fill();
    g.fillStyle = '#efe8d2'; g.beginPath(); g.moveTo(F.front * 0.95, sd * W * 0.62); g.quadraticCurveTo(F.front * 1.5, sd * W * 0.7, F.front * 1.6, sd * W * 0.5); g.lineTo(F.front * 0.95, sd * W * 0.45); g.closePath(); g.fill();
    g.strokeStyle = '#a89e84'; g.lineWidth = 1.5; g.stroke();
  }
  g.restore();
}
// the step pyramid over the tunnel, seen from above and a little from the south: four terraces, stairway, the
// doorway the road comes out of, a shrine on top with the great ruby
const TP = { n: 4, hs: 30, inset: 14, step: 0.2 };   // terraces, each this high, its faces sloping in this much, each this much smaller
const tHalf = (u, k) => u.half * (1 - TP.step * k);   // the half-width of terrace k's base
function temple(g, T, u) {
  const rng = mulberry(29), h = u.half, x = u.x, y = u.y, P = (px, py, z) => [px, py - z];
  const q1 = trackSample(T, u.s1), door = { x: q1.x, w: q1.hw + 12 };   // where the road comes out (the south face)
  g.lineJoin = 'round';
  for (let k = 0; k < TP.n; k++) {
    const b = tHalf(u, k), t = b - TP.inset, z0 = k * TP.hs, z1 = z0 + TP.hs, f = k / TP.n;
    const quad = (pts, col) => { poly(g, pts); g.fillStyle = col; g.fill(); };
    quad([P(x - b, y - b, z0), P(x - b, y + b, z0), P(x - t, y + t, z1), P(x - t, y - t, z1)], mix('#b8ad8a', '#cfc5a2', f));   // west: lit
    quad([P(x + b, y - b, z0), P(x + b, y + b, z0), P(x + t, y + t, z1), P(x + t, y - t, z1)], mix('#5f5846', '#716952', f));   // east: shade
    quad([P(x - b, y + b, z0), P(x + b, y + b, z0), P(x + t, y + t, z1), P(x - t, y + t, z1)], mix('#7f7760', '#948b70', f));   // south
    g.strokeStyle = 'rgba(40,34,22,0.35)'; g.lineWidth = 1.2;   // block courses along the south face
    for (let c = 1; c < 3; c++) { const zz = z0 + TP.hs * c / 3, bb = b - TP.inset * c / 3; g.beginPath(); g.moveTo(...P(x - bb, y + bb, zz)); g.lineTo(...P(x + bb, y + bb, zz)); g.stroke(); }
    quad([P(x - t, y - t, z1), P(x + t, y - t, z1), P(x + t, y + t, z1), P(x - t, y + t, z1)], mix('#a39a7c', '#bdb390', f));   // its top
    g.fillStyle = 'rgba(255,250,225,0.25)'; poly(g, [P(x - t, y - t, z1), P(x + t, y - t, z1), P(x + t - 4, y - t + 4, z1), P(x - t + 4, y - t + 4, z1)]); g.fill();   // a lit edge along the top
    for (let m = 0; m < 5; m++) { const a = rng() * 2 - 1, c = rng() * 2 - 1; g.fillStyle = rng() < 0.5 ? 'rgba(86,130,52,0.6)' : 'rgba(64,110,44,0.55)'; ell(g, x + a * t, y + c * t - z1, 10 + rng() * 14, 5 + rng() * 5, rng() * 3); g.fill(); }   // moss
  }
  const zTop = TP.n * TP.hs, tTop = tHalf(u, TP.n - 1) - TP.inset;
  // the doorway at the foot of the south face, the road coming out of the dark under a stone lintel
  const dw = door.w, dh = 40, by = y + h;
  g.fillStyle = '#16110b'; g.beginPath(); g.moveTo(door.x - dw, by); g.lineTo(door.x - dw, by - dh * 0.7); g.lineTo(door.x - dw * 0.7, by - dh); g.lineTo(door.x + dw * 0.7, by - dh); g.lineTo(door.x + dw, by - dh * 0.7); g.lineTo(door.x + dw, by); g.closePath(); g.fill();
  g.fillStyle = '#cfc5a2'; g.fillRect(door.x - dw - 8, by - dh - 9, dw * 2 + 16, 9); g.fillStyle = '#6a624e'; g.fillRect(door.x - dw - 8, by - dh - 1, dw * 2 + 16, 3);
  for (let k = -3; k <= 3; k++) { g.fillStyle = '#9a9070'; g.fillRect(door.x + k * dw * 0.28 - 5, by - dh - 7, 10, 5); }   // glyphs on the lintel
  // a stairway up the south face, west of the door, from the ground to the top
  const sx = x - h * 0.45, sw = h * 0.16;
  for (let k = 0; k < 18; k++) {
    const zf = k / 18, z = zf * zTop, yy = y + h - (h - tTop) * zf, ww = sw * (1 - zf * 0.3), cx = sx + (x - sx) * zf * 0.55;
    g.fillStyle = k % 2 ? '#c9bf9b' : '#a99f80'; g.fillRect(cx - ww, yy - z - zTop / 18 - 1, ww * 2, zTop / 18 + 2);
  }
  g.fillStyle = 'rgba(40,34,22,0.25)'; g.beginPath(); g.moveTo(sx + sw, y + h); g.lineTo(sx + (x - sx) * 0.55 + sw * 0.7, y + tTop - zTop); g.lineTo(sx + (x - sx) * 0.55 + sw * 0.7 + 6, y + tTop - zTop); g.lineTo(sx + sw + 6, y + h); g.fill();
  // vines down the faces
  for (let k = 0; k < 22; k++) {
    const lv = Math.floor(rng() * TP.n), b = tHalf(u, lv) - TP.inset, z1 = (lv + 1) * TP.hs, vx = x + (rng() * 2 - 1) * b, vy = y + b - z1, l = 12 + rng() * 26;
    g.strokeStyle = rng() < 0.5 ? '#3f6e2c' : '#4f8034'; g.lineWidth = 2; g.beginPath(); g.moveTo(vx, vy); g.quadraticCurveTo(vx + 5, vy + l * 0.5, vx + 1, vy + l); g.stroke();
    ell(g, vx + 3, vy + l * 0.45, 3.5, 2.2, 0.5); g.fillStyle = '#5f9a3e'; g.fill(); ell(g, vx, vy + l * 0.85, 3, 2, -0.4); g.fill();
  }
  // trees rooted on the terrace ledges
  for (const [lv, cx, cy] of [[0, -1, -1], [1, 1, -1], [0, 1, 1], [2, -1, 1], [1, -1, 0.2]]) {
    const b = tHalf(u, lv) - TP.inset - 14, z1 = (lv + 1) * TP.hs, tx = x + cx * b, ty = y + cy * b - z1, r = 18 + rng() * 10;
    ell(g, tx + 10, ty + 12, r * 1.1, r * 0.8); g.fillStyle = 'rgba(10,20,10,0.3)'; g.fill(); canopyLite(g, tx, ty, r, rng);
  }
  // the shrine on the top terrace: a stone house, its door facing south, a carved roof comb; the ruby on a plinth in front
  const hx = x, hy = y - tTop * 0.35, hwid = tTop * 0.6, hdep = tTop * 0.4, hz = zTop, hh = 34;
  poly(g, [P(hx - hwid, hy + hdep, hz), P(hx + hwid, hy + hdep, hz), P(hx + hwid, hy + hdep, hz + hh), P(hx - hwid, hy + hdep, hz + hh)]); g.fillStyle = '#8f8669'; g.fill();
  g.fillStyle = '#1f1710'; g.fillRect(hx - hwid * 0.22, hy + hdep - hz - hh * 0.7, hwid * 0.44, hh * 0.7);
  poly(g, [P(hx + hwid, hy - hdep, hz), P(hx + hwid, hy + hdep, hz), P(hx + hwid, hy + hdep, hz + hh), P(hx + hwid, hy - hdep, hz + hh)]); g.fillStyle = '#5f584a'; g.fill();
  poly(g, [P(hx - hwid, hy - hdep, hz + hh), P(hx + hwid, hy - hdep, hz + hh), P(hx + hwid, hy + hdep, hz + hh), P(hx - hwid, hy + hdep, hz + hh)]); g.fillStyle = '#c9bf9b'; g.fill();
  const cz = hz + hh, cw = hwid * 0.8;   // the roof comb: a pierced stone crest standing up off the roof
  poly(g, [P(hx - cw, hy, cz), P(hx + cw, hy, cz), P(hx + cw * 0.8, hy, cz + 30), P(hx - cw * 0.8, hy, cz + 30)]); g.fillStyle = '#b3a986'; g.fill();
  g.fillStyle = '#4a4232'; for (let k = -2; k <= 2; k++) g.fillRect(hx + k * cw * 0.32 - 4, hy - cz - 22, 8, 14);
  const R = rubyAt(u);
  g.fillStyle = '#8a8166'; g.fillRect(R.x - 14, R.y + 6, 28, 12); g.fillStyle = '#b3a986'; g.fillRect(R.x - 14, R.y + 2, 28, 6);   // the plinth
}
function canopyLite(g, x, y, r, rng) {
  const pts = []; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + rng() * 0.5, d = r * 0.5; pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.45 + rng() * 0.12)]); }
  g.fillStyle = '#25552a'; for (const [px, py, pr] of pts) { circ(g, px, py, pr); g.fill(); }
  g.fillStyle = '#3d7d38'; for (const [px, py, pr] of pts) { circ(g, px - pr * 0.18, py - pr * 0.22, pr * 0.75); g.fill(); }
  g.fillStyle = '#62a64c'; for (const [px, py, pr] of pts) if (px < x && py < y) { circ(g, px - pr * 0.3, py - pr * 0.35, pr * 0.4); g.fill(); }
}
// where the temple's great ruby sits (world), for the glow drawn every frame
const rubyAt = u => ({ x: u.x, y: u.y - (tHalf(u, TP.n - 1) - TP.inset) * -0.35 - TP.n * TP.hs - 16 });

// ----- every frame: boulders (over the cars), then render.js lays the roofs over them, then the glows on the roofs
export function drawBoulders(ctx, race) {
  const M = race.track.mech; if (!M || !M.boulders.length) return;
  const t = race.time;
  M.boulders.forEach((z, i) => {
    const S = race.rocks && race.rocks[i]; if (!S) return;
    for (const r of S) {   // a boulder that's gone into the gorge: a splash and a cloud of spray for a moment
      const a = t - r - rollEnd(z); if (a < 0 || a > 1.6) continue;
      const G = z.gorge, gx = G.x + G.r * 0.1, gy = G.y + G.r * 0.15, f = a / 1.6;
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - f)})`; ctx.lineWidth = 5 * (1 - f) + 1; ctx.beginPath(); ctx.ellipse(gx, gy, 20 + 90 * f, 14 + 60 * f, 0, 0, TAU); ctx.stroke();
      for (let k = 0; k < 9; k++) { const ang = k * 0.7, d = 20 + 120 * f, up = 90 * Math.sin(Math.PI * Math.min(1, f * 1.4)); ctx.fillStyle = `rgba(235,248,250,${0.7 * (1 - f)})`; blob(ctx, gx + Math.cos(ang) * d * 0.6, gy + Math.sin(ang) * d * 0.3 - up * ((k % 3) / 3 + 0.4), 8 + 10 * f); }
    }
    for (const b of boulders(z, S, t)) drawBoulder(ctx, z, b, t);
  });
}
function drawBoulder(ctx, z, b, t) {
  let R = z.R, x = b.x, y = b.y, fall = 0;
  if (b.d > z.dRoad1) {   // off the end: over the gorge it drops (smaller and smaller, the shadow left behind on the lip)
    const G = z.gorge, rim = Math.hypot(b.x - G.x, b.y - G.y) - G.r * 0.95;
    if (rim < 0) fall = clamp(-rim / (G.r * 0.9), 0, 1);
  }
  const k = 1 - 0.6 * fall; R *= k;
  if (fall < 0.15) { ctx.fillStyle = 'rgba(10,14,8,0.35)'; ctx.beginPath(); ctx.ellipse(x + R * 0.4, y + R * 0.55, R * 1.05, R * 0.8, 0, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1 - fall * 0.5;
  const g = ctx.createRadialGradient(x - R * 0.38, y - R * 0.42, R * 0.08, x, y, R);
  g.addColorStop(0, '#ddd2b2'); g.addColorStop(0.55, '#9d9175'); g.addColorStop(1, '#4f4838');
  ctx.fillStyle = g; blob(ctx, x, y, R);
  // the carvings on it turning over as it rolls (round the axis across the way it's going)
  const roll = b.d / z.R, vx = -b.uy, vy = b.ux;
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, R * 0.97, 0, TAU); ctx.clip();
  for (let j = 0; j < 7; j++) {
    const w = ((j * 0.37) % 1) * 1.5 - 0.75, ang = roll + j * 0.9, z3 = Math.cos(ang) * Math.sqrt(1 - w * w); if (z3 < 0.05) continue;
    const along = Math.sin(ang) * Math.sqrt(1 - w * w) * R, cx = x + b.ux * along + vx * w * R, cy = y + b.uy * along + vy * w * R, s = R * 0.16;
    ctx.strokeStyle = `rgba(55,46,32,${0.55 * z3})`; ctx.lineWidth = 2;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.atan2(b.uy, b.ux)); ctx.scale(Math.max(0.2, z3), 1);
    if (j % 3 === 0) { ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, TAU); ctx.stroke(); }
    else if (j % 3 === 1) { ctx.beginPath(); ctx.moveTo(-s, -s * 0.6); ctx.lineTo(s, -s * 0.6); ctx.moveTo(-s, s * 0.6); ctx.lineTo(s, s * 0.6); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.stroke(); }
    else { ctx.fillStyle = `rgba(92,130,60,${0.7 * z3})`; ctx.beginPath(); ctx.ellipse(0, 0, s * 1.6, s, 0, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,250,230,0.35)'; ctx.beginPath(); ctx.ellipse(x - R * 0.4, y - R * 0.45, R * 0.3, R * 0.18, -0.6, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  // dust thrown up behind it, more the faster it goes
  if (fall === 0 && b.v > 150) for (let j = 0; j < 4; j++) {
    const f = ((t * 3 + j * 0.25) % 1), d = R + f * 70, side = (j % 2 ? 1 : -1) * R * 0.6 * (0.5 + f);
    ctx.fillStyle = `rgba(200,182,140,${0.32 * (1 - f) * Math.min(1, b.v / 400)})`; blob(ctx, x - b.ux * d - b.uy * side, y - b.uy * d + b.ux * side, 8 + f * 16);
  }
}
// on the roofs: the serpent's eyes (brighter and faster before a boulder), the temple's torches and ruby glow
export function drawRoofLights(ctx, race) {
  const M = race.track.mech; if (!M) return;
  const t = race.time;
  M.boulders.forEach((z, i) => {
    const S = race.rocks && race.rocks[i], F = serpentFrame(z), nr = nextRelease(S, t), last = S ? S.filter(r => r <= t).pop() : undefined;
    const pre = clamp(1 - (nr - t) / WARN, 0, 1), post = last !== undefined ? clamp(1 - (t - last) / 0.6, 0, 1) : 0;
    const glow = Math.max(pre * (0.55 + 0.45 * Math.sin(t * (6 + 16 * pre))), post);
    ctx.save(); ctx.translate(z.head.x, z.head.y); ctx.rotate(z.head.a);
    for (const sd of [-1, 1]) {
      const ex = F.eye[0], ey = sd * F.eye[1], r = F.W * 0.14;
      if (glow > 0.02) { ctx.fillStyle = `rgba(255,40,60,${0.35 * glow})`; blob(ctx, ex, ey, r * (2.4 + glow * 2)); }
      ctx.fillStyle = radial(ctx, ex - r * 0.3, ey - r * 0.3, 1, ex, ey, r, [[0, glow > 0.2 ? '#ffd0d8' : '#ff6b81'], [0.5, glow > 0.2 ? '#ff2a48' : '#c8102e'], [1, '#5a0010']]);
      ctx.beginPath(); ctx.ellipse(ex, ey, r * 1.15, r * 0.85, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; blob(ctx, ex - r * 0.35, ey - r * 0.3, r * 0.22);
    }
    if (pre > 0.5) for (let j = 0; j < 5; j++) {   // dust trickling out of the jaws
      const f = (t * 1.7 + j * 0.2) % 1; ctx.fillStyle = `rgba(190,172,130,${0.45 * (1 - f) * pre})`; blob(ctx, F.front * 1.1 + f * 40, (j - 2) * F.W * 0.2, 6 + f * 12);
    }
    ctx.restore();
  });
  if (!M.rocket) for (const u of M.tunnels) {
    const p = rubyAt(u), pulse = 0.6 + 0.4 * Math.sin(t * 2.2);
    ctx.fillStyle = `rgba(255,30,70,${0.16 * pulse})`; blob(ctx, p.x, p.y, 44); ctx.fillStyle = `rgba(255,60,90,${0.22 * pulse})`; blob(ctx, p.x, p.y, 26);
    gem(ctx, p.x, p.y, 15);
    { const q = trackSample(race.track, u.s1), by = u.y + u.half;   // torches either side of the door the road comes out of
      for (const sd of [-1, 1]) {
        const tx = q.x + sd * (q.hw + 26), ty = by - 6, fl = 0.75 + 0.25 * Math.sin(t * 13 + sd * 2);
        ctx.fillStyle = 'rgba(255,170,60,0.18)'; blob(ctx, tx, ty - 6, 26 * fl);
        ctx.fillStyle = '#4a3a28'; ctx.fillRect(tx - 2.5, ty - 4, 5, 12);
        ctx.fillStyle = '#ff8a1f'; ctx.beginPath(); ctx.moveTo(tx - 5, ty - 4); ctx.quadraticCurveTo(tx, ty - 22 * fl, tx + 5, ty - 4); ctx.fill();
        ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.moveTo(tx - 2.5, ty - 4); ctx.quadraticCurveTo(tx, ty - 13 * fl, tx + 2.5, ty - 4); ctx.fill();
      } }
  }
}
// a cut ruby: a hexagonal gem, facets lit from the top left
function gem(ctx, x, y, r) {
  const P = []; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU - Math.PI / 2; P.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 1.15]); }
  ctx.fillStyle = 'rgba(20,10,10,0.35)'; poly2(ctx, P.map(([px, py]) => [px + 4, py + 5])); ctx.fill();
  for (let k = 0; k < 6; k++) { const a = P[k], b = P[(k + 1) % 6]; ctx.fillStyle = ['#ff6b81', '#e0103a', '#9c0a26', '#7a0820', '#b80d2f', '#ff2a55'][k]; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = '#ff9fb0'; poly2(ctx, P.map(([px, py]) => [x + (px - x) * 0.45, y + (py - y) * 0.45])); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; blob(ctx, x - r * 0.25, y - r * 0.35, r * 0.14);
}
const poly2 = (ctx, P) => { ctx.beginPath(); P.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); };

// ------------------------------------------------------------------------------------------------ the crab
// The Borrow Checker (art in art/crab.js): where it and its claws are, its beach, the claw shadows on the road.
function crabFrame(T, z, s) {
  const q = trackSample(T, s), sd = z.side;
  return { q, x: q.x + q.nx * sd * z.off, y: q.y + q.ny * sd * z.off, fx: -q.nx * sd, fy: -q.ny * sd, ax: q.tx, ay: q.ty };
}
const crabNow = (race, i) => (race.crab && race.crab[i]) || { s: race.track.mech.crab[i].home, v: 0, strikes: [], look: -1 };
const angryOf = race => race.started && race.cars.some(c => !c.finished && c.lap >= race.laps && race.laps > 1);
// where claw `side` (-1: the one upstream, +1: downstream) is: on the road over a strike, or held up in front of the body
function clawPose(race, T, z, F, st, side, t) {
  const k = st.strikes.find(k => k.claw === side && clawHeight(k, t) !== null);
  if (k) {
    const P = trackSample(T, k.s), hw = P.hw, sd = z.side, h = clawHeight(k, t);
    return { strike: k, h, x: P.x + P.nx * sd * (hw + 30), y: P.y + P.ny * sd * (hw + 30), ang: Math.atan2(-P.ny * sd, -P.nx * sd), len: hw * 2 + 40, P, open: 0.05 + 0.6 * h, mirror: side * sd };   // opens as it rears, snaps shut on the slam
  }
  const nap = race.calm;   // (asleep, a time trial: the claws down and folded in front of it, shut)
  const open = nap ? 0.02 : 0.06 + 0.16 * Math.max(0, Math.sin(t * 2.6 + side * 1.7)) ** 3, b = nap ? 1.05 : 0.42;   // clacking idly, held up in front, tips turned in
  const dx = F.fx * Math.cos(b) - F.ax * side * Math.sin(b), dy = F.fy * Math.cos(b) - F.ay * side * Math.sin(b), r = nap ? 0.7 : 0.92;
  return { strike: null, h: nap ? 0.04 : 0.22, x: F.x + F.fx * CRAB_R * r + F.ax * side * CRAB_R * 0.86, y: F.y + F.fy * CRAB_R * r + F.ay * side * CRAB_R * 0.86, ang: Math.atan2(dy, dx), len: nap ? 125 : 160, open, mirror: side * z.side };
}

// static: the crab's beach, tracks, burrow with its loot, a warning sign at each end
function crabStatic(g, T, z) {
  const rng = mulberry(Math.round(z.s0) + 3), sd = z.side;
  g.lineCap = 'round';
  for (let s = z.s0 - 100; s < z.s1 + 100; s += 26) {   // footprints: two rows of little pits, in pairs
    const q = trackSample(T, s);
    for (const o of [z.off - 70, z.off + 60]) { const l = sd * (o + (rng() - 0.5) * 30), x = q.x + q.nx * l, y = q.y + q.ny * l; ell(g, x, y, 5, 3, Math.atan2(q.ty, q.tx) + 0.6); g.fillStyle = 'rgba(90,70,40,0.35)'; g.fill(); ell(g, x - 1, y - 1, 3, 1.6, Math.atan2(q.ty, q.tx) + 0.6); g.fillStyle = 'rgba(255,245,220,0.3)'; g.fill(); }
  }
  for (let k = 0; k < 9; k++) {   // claw scratches on the sea-side half of the road
    const s = z.s0 + rng() * (z.s1 - z.s0), q = trackSample(T, s), l0 = sd * q.hw * (0.2 + rng() * 0.5);
    for (let j = 0; j < 3; j++) { const o = (j - 1) * 7; g.strokeStyle = 'rgba(20,18,22,0.32)'; g.lineWidth = 2; g.beginPath(); g.moveTo(q.x + q.nx * l0 + q.tx * o, q.y + q.ny * l0 + q.ty * o); g.lineTo(q.x + q.nx * (sd * (q.hw + 10)) + q.tx * (o + 6), q.y + q.ny * (sd * (q.hw + 10)) + q.ty * (o + 6)); g.stroke(); }
  }
  // the burrow: a mound of sand round a dark hole, at the crab's home, out at the waterline
  const H = trackSample(T, z.home), bx = H.x + H.nx * sd * (z.off + 120), by = H.y + H.ny * sd * (z.off + 120);
  ell(g, bx, by, 132, 80); g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 5; g.setLineDash([26, 12, 8, 14]); g.stroke(); g.setLineDash([]);   // the surf round it
  ell(g, bx + 10, by + 12, 120, 70); g.fillStyle = 'rgba(60,45,25,0.25)'; g.fill();
  ell(g, bx, by, 115, 66); g.fillStyle = radial(g, bx - 40, by - 30, 10, bx, by, 120, [[0, '#f0d9a6'], [0.6, '#d9ba80'], [1, '#b8955e']]); g.fill();   // a mound of wet sand, lit on its top left
  ell(g, bx + 4, by + 2, 62, 34); g.fillStyle = radial(g, bx + 18, by + 12, 4, bx + 4, by + 2, 64, [[0, '#0e0906'], [0.7, '#2a1e14'], [1, '#5a4430']]); g.fill();   // the hole, its far wall catching the light
  ell(g, bx + 10, by + 10, 52, 25); g.strokeStyle = 'rgba(232,205,150,0.35)'; g.lineWidth = 3; g.beginPath(); g.ellipse(bx + 6, by + 4, 56, 29, 0, 0.1, 1.9); g.stroke();
  for (let k = 0; k < 40; k++) { const a = rng() * TAU, d = 1 + rng() * 0.5, px = bx + Math.cos(a) * 125 * d, py = by + Math.sin(a) * 74 * d; circ(g, px + 1, py + 1.4, 2.6); g.fillStyle = 'rgba(80,55,25,0.25)'; g.fill(); circ(g, px, py, 2.6); g.fillStyle = '#dcc08a'; g.fill(); }   // the sand pellets a crab rolls out of its burrow
  // the loot: what it has borrowed off karts that came too close
  const lx = H.x + H.nx * sd * (z.off - 10) + H.tx * 230, ly = H.y + H.ny * sd * (z.off - 10) + H.ty * 230;
  for (const [dx, dy] of [[0, 0], [26, 10], [8, 30]]) { circ(g, lx + dx + 3, ly + dy + 4, 15); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fill(); circ(g, lx + dx, ly + dy, 15); g.fillStyle = '#1e1e22'; g.fill(); circ(g, lx + dx, ly + dy, 8); g.fillStyle = '#9aa0a8'; g.fill(); circ(g, lx + dx - 2, ly + dy - 2, 3); g.fillStyle = '#e4e7ea'; g.fill(); }   // tyres
  { const cx = lx - 40, cy = ly + 18; poly(g, [[cx - 12, cy + 10], [cx + 12, cy + 10], [cx, cy - 16]]); g.fillStyle = '#ff7a1a'; g.fill(); g.fillStyle = '#ffffff'; g.fillRect(cx - 6, cy - 3, 12, 4); }   // a cone
  g.strokeStyle = '#2b2d33'; g.lineWidth = 4; g.beginPath(); g.arc(lx + 50, ly - 18, 13, 0, TAU); g.stroke(); g.lineWidth = 3; g.beginPath(); g.moveTo(lx + 37, ly - 18); g.lineTo(lx + 63, ly - 18); g.moveTo(lx + 50, ly - 18); g.lineTo(lx + 50, ly - 5); g.stroke();   // a steering wheel
  circ(g, lx - 20, ly - 22, 11); g.fillStyle = linear(g, lx - 30, ly - 32, lx - 10, ly - 12, [[0, '#ffffff'], [1, '#8e959c']]); g.fill(); circ(g, lx - 20, ly - 22, 4); g.fillStyle = '#5d636a'; g.fill();   // a hubcap
  // warning signs on the land side of the road, before the stretch: a yellow diamond with a crab on it
  for (const s of [z.s0 - 160, (z.s0 + z.s1) / 2]) {
    const q = trackSample(T, s), x = q.x - q.nx * sd * (q.hw + 60), y = q.y - q.ny * sd * (q.hw + 60);
    g.strokeStyle = '#6b6f75'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 34); g.stroke();
    ell(g, x + 8, y + 4, 16, 6); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fill();
    poly(g, [[x, y - 70], [x + 22, y - 48], [x, y - 26], [x - 22, y - 48]]); g.fillStyle = '#2b2d33'; g.fill();
    poly(g, [[x, y - 66], [x + 18, y - 48], [x, y - 30], [x - 18, y - 48]]); g.fillStyle = '#ffd23f'; g.fill();
    g.fillStyle = '#1b1b1b'; ell(g, x, y - 46, 7, 5); g.fill(); g.strokeStyle = '#1b1b1b'; g.lineWidth = 2;
    for (const e of [-1, 1]) { g.beginPath(); g.moveTo(x + e * 5, y - 49); g.lineTo(x + e * 10, y - 56); g.stroke(); circ(g, x + e * 10, y - 57, 2.6); g.fill(); for (let j = 0; j < 3; j++) { g.beginPath(); g.moveTo(x + e * 6, y - 45 + j * 2); g.lineTo(x + e * 12, y - 42 + j * 3); g.stroke(); } }
  }
}

// under the cars: the crab's shadow and each claw's target (darkening, bars flashing faster), cracks where one landed
function crabUnder(ctx, race, T, z, i, t) {
  const st = crabNow(race, i), F = crabFrame(T, z, st.s);
  crabShadow(ctx, F, st.s / 30, t);
  for (const k of st.strikes) {
    const h = clawHeight(k, t); if (h === null) continue;
    const P = trackSample(T, k.s), a = t - k.tS, p = clamp(1 + a / WIND, 0, 1), ang = Math.atan2(P.ty, P.tx), hw = P.hw;
    ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(ang);
    if (a < 0) {
      const w = CLAW_LEN * (0.5 + 0.5 * p), dk = 0.12 + 0.4 * p * p;   // the shadow: sharper and darker as it comes down
      ctx.fillStyle = `rgba(20,10,20,${dk})`; ctx.beginPath(); ctx.ellipse(18 * (1 - p), 26 * (1 - p), w * 0.62, hw * 1.02, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(20,10,20,${dk * 0.8})`; ctx.beginPath(); ctx.ellipse(18 * (1 - p), 26 * (1 - p), w * 0.4, hw * 0.85, 0, 0, TAU); ctx.fill();
      const flash = 0.45 + 0.55 * Math.max(0, Math.sin(t * (8 + 22 * p)));
      for (const e of [-1, 1]) { ctx.fillStyle = `rgba(255,${Math.round(110 - 60 * p)},40,${0.55 + 0.4 * flash})`; ctx.fillRect(e * (CLAW_LEN / 2 + 14) - 5, -hw, 10, hw * 2); }
    } else {
      ctx.fillStyle = 'rgba(15,10,10,0.3)'; ctx.beginPath(); ctx.ellipse(10, 14, CLAW_LEN * 0.55, hw * 1.05, 0, 0, TAU); ctx.fill();
      const rng = mulberry(k.id * 7 + 1); ctx.strokeStyle = `rgba(25,22,26,${0.6 * clamp(1.3 - a, 0, 1)})`; ctx.lineWidth = 2.2;   // cracks in the tarmac
      for (let j = 0; j < 9; j++) { let x = (rng() - 0.5) * CLAW_LEN * 0.5, y = (rng() - 0.5) * hw * 1.6, b = rng() * TAU; ctx.beginPath(); ctx.moveTo(x, y); for (let m = 0; m < 3; m++) { b += (rng() - 0.5) * 1.2; x += Math.cos(b) * 14; y += Math.sin(b) * 14; ctx.lineTo(x, y); } ctx.stroke(); }
    }
    ctx.restore();
  }
}

// over the cars: the crab, raised claws last, its eyes on whoever it's after
function crabOver(ctx, race, T, z, i, t) {
  const st = crabNow(race, i), F = crabFrame(T, z, st.s);
  const claws = [-1, 1].map(sd => ({ sd, ...clawPose(race, T, z, F, st, sd, t) })).sort((a, b) => a.h - b.h);
  const mood = race.calm ? 'asleep' : angryOf(race) ? 'angry' : st.strikes.length ? 'alert' : 'calm', tgt = !race.calm && st.look >= 0 && race.cars[st.look];   // (calm, a time trial: asleep on its beach)
  for (const p of claws) if (p.strike && p.h > 0.02) {   // a raised claw's own shadow, faint, so it shows over the karts too (under the crab)
    ctx.fillStyle = `rgba(20,10,20,${0.12 * (1 - p.h)})`; ctx.beginPath(); ctx.ellipse(p.P.x + 14, p.P.y + 18, CLAW_LEN * 0.5, p.P.hw, Math.atan2(p.P.ty, p.P.tx), 0, TAU); ctx.fill();
  }
  drawCrab(ctx, F, st.s / 30, claws, t, mood, tgt ? [tgt.x, tgt.y] : null);
}

// ------------------------------------------------------------------------------------------------ the logic gate
// The logic gate: a push switch in the inside kerb, a copper trace to the gate, bars sliding out of two transistors
// across the Bus with LEDs counting the open time down, chevrons on the fork lane (green open, red cross shut).
const GATE_LEDS = 8, TRACE_OFF = 26, PULSE_T = 0.45, POST = 30, POST_K = 1.4;   // POST: the transistors stand this far out from the road's edge, drawn this much bigger
const gateParts = new WeakMap();   // per track: the trace path and where things stand (static, so worked out once)
function gateGeo(T, i) {
  const z = T.mech.gates[i]; if (gateParts.has(z)) return gateParts.get(z);
  const R = (T.routes || [T]).find(Q => Q.mech && Q.mech.gates[i] && Q.mech.gates[i].gate);
  if (!R) { gateParts.set(z, null); return null; }
  const g = R.mech.gates[i].gate, sw = z.sw, side = sw.side, pts = [];
  for (let s = sw.s + 26; s <= g.s; s += 6) { const q = trackSample(R, s), o = side * (halfWAt(R, s) + TRACE_OFF); pts.push([q.x + q.nx * o, q.y + q.ny * o]); }
  const lens = [0]; for (let k = 1; k < pts.length; k++) lens.push(lens[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const fs = T.forkS && T.forks ? T.forkS[T.forks.findIndex(f => f.gate)] : null;
  const out = { R, g, sw, side, pts, lens, fs };
  gateParts.set(z, out); return out;
}
function gateStatic(g, T, i) {
  const G = gateGeo(T, i); if (!G) return;
  const { R, sw, pts, fs } = G, gq = G.g.q, hw = G.g.hw;
  // the copper trace: a dark outline, copper, a highlight, a via at each end
  poly(g, pts, false); g.strokeStyle = PCB.mask; g.lineWidth = 15; g.stroke(); g.strokeStyle = PCB.goldDk; g.lineWidth = 9; g.stroke(); g.strokeStyle = PCB.gold; g.lineWidth = 7; g.stroke(); g.strokeStyle = alphaHex(PCB.goldHi, 0.6); g.lineWidth = 2.5; g.stroke();
  for (const [x, y] of [pts[0], pts[pts.length - 1]]) { circ(g, x, y, 9); g.fillStyle = PCB.gold; g.fill(); circ(g, x, y, 3.5); g.fillStyle = PCB.hole; g.fill(); }
  // the switch: four legs, the body, the collar the cap sits in
  g.save(); g.translate(sw.x, sw.y); g.rotate(angOf(sw.q));
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-20 + 5, -20 + 7, 40, 40);
  g.fillStyle = '#c8ccd2'; for (const [x, y] of [[-24, -16], [24, -16], [-24, 16], [24, 16]]) g.fillRect(x - 6, y - 3, 12, 6);
  g.fillStyle = linear(g, -20, -20, 20, 20, [[0, '#3b3f48'], [1, '#14161b']]); g.beginPath(); g.roundRect(-20, -20, 40, 40, 4); g.fill();
  g.strokeStyle = '#555b66'; g.lineWidth = 1.5; g.strokeRect(-16, -16, 32, 32);
  circ(g, 0, 0, 16); g.fillStyle = '#0b0c0f'; g.fill();
  g.restore();
  // the AND gate painted on the Bus before the bars, pointing the way
  const pq = trackSample(R, G.g.s - 120);
  g.save(); g.translate(pq.x, pq.y); g.rotate(angOf(pq)); g.strokeStyle = 'rgba(245,247,250,0.85)'; g.lineWidth = 5; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(-30, -32); g.lineTo(0, -32); g.arc(0, 0, 32, -Math.PI / 2, Math.PI / 2); g.lineTo(-30, 32); g.closePath(); g.fillStyle = 'rgba(245,247,250,0.18)'; g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-44, -16); g.lineTo(-30, -16); g.moveTo(-44, 16); g.lineTo(-30, 16); g.moveTo(48, 0); g.lineTo(62, 0); g.stroke();
  circ(g, 40, 0, 7); g.stroke();
  g.restore();
  // the rail the bars slide along, across the road, and the two transistors either side
  g.save(); g.translate(gq.x, gq.y); g.rotate(angOf(gq));
  g.fillStyle = '#23262d'; g.fillRect(-19, -hw - 6, 38, hw * 2 + 12); g.fillStyle = '#5b616d'; for (const x of [-12, 0, 12]) g.fillRect(x - 1.5, -hw - 6, 3, hw * 2 + 12);
  for (const sd of [-1, 1]) {
    g.save(); g.translate(0, sd * (hw + POST)); g.scale(POST_K, POST_K);
    g.fillStyle = 'rgba(0,0,0,0.32)'; g.fillRect(-22 + 6, -15 + 8, 44, 30);
    g.fillStyle = '#c8ccd2'; for (const lx of [-6, 6, 18]) g.fillRect(lx - 2.5, sd > 0 ? 14 : -26, 5, 12);   // legs into the board, away from the road
    g.fillStyle = linear(g, 0, -14, 0, 14, [[0, '#9aa1ab'], [0.5, '#e3e6ea'], [1, '#7d848e']]); g.beginPath(); g.roundRect(-26, -12, 14, 24, 2); g.fill();   // the steel tab
    circ(g, -20, 0, 3.2); g.fillStyle = '#3a3f47'; g.fill();
    g.fillStyle = linear(g, -14, -15, 26, 15, [[0, '#33363e'], [1, '#121317']]); g.beginPath(); g.roundRect(-14, -15, 40, 30, 3); g.fill();
    g.fillStyle = '#0a0b0d'; g.fillRect(-10, -11, 32, 22);   // the LED window
    g.restore();
  }
  g.restore();
  // the fork: a dashed lane down the inside into the Bus (the chevrons in it are drawn live)
  if (fs) {
    const off = fs.side * halfWAt(T, fs.s) * 0.52;
    g.strokeStyle = 'rgba(220,255,236,0.75)'; g.lineWidth = 2.4; g.setLineDash([16, 12]);
    for (const e of [-1, 1]) { g.beginPath(); for (let s = fs.s - 260; s <= fs.sLock - 10; s += 6) { const q = trackSample(T, s), o = off + e * halfWAt(T, s) * 0.4; g.lineTo(q.x + q.nx * o, q.y + q.ny * o); } g.stroke(); }
    g.setLineDash([]);
  }
}
// the gate's lights: how many of the LEDs are lit and in what colour, at race time t
function gateLights(race, z, t) {
  const st = gateState(race, t), full = z.open - CLOSE;
  if (st.open) return { n: Math.max(1, Math.ceil(GATE_LEDS * st.left / full)), col: st.left < 1.5 ? '#ffc23d' : '#3dff8a', st };
  if (st.closing) return { n: GATE_LEDS, col: Math.floor(t * 12) % 2 ? '#ff3b30' : '#5a1010', st };
  return { n: GATE_LEDS, col: '#c4271d', st };
}
function gateUnder(ctx, race, i, t) {
  const T = race.track, G = gateGeo(T, i); if (!G) return;
  const z = T.mech.gates[i], L = gateLights(race, z, t), st = L.st, Gs = race.gate || { at: -9 }, hw = G.g.hw, gq = G.g.q;
  const lit = st.open, col = st.open ? (st.left < 1.5 ? '#ffc23d' : '#3dff8a') : '#ff3b30';
  // while open the trace burns down like a fuse over the open time (stay ahead of it and you're in time)
  if (lit) {
    const tot = G.lens[G.lens.length - 1], from = (1 - st.left / (z.open - CLOSE)) * tot; let k0 = 0; while (k0 < G.lens.length - 1 && G.lens[k0 + 1] < from) k0++;
    poly(ctx, G.pts.slice(k0), false); ctx.strokeStyle = alphaHex(col, 0.35 + 0.12 * Math.sin(t * 8)); ctx.lineWidth = 14; ctx.stroke(); ctx.strokeStyle = shadeHex(col, 0.55); ctx.lineWidth = 4; ctx.stroke();
    const [ex, ey] = G.pts[k0]; ctx.fillStyle = radial(ctx, ex, ey, 0, ex, ey, 22, [[0, alphaHex(col, 0.8)], [1, alphaHex(col, 0)]]); ctx.fillRect(ex - 22, ey - 22, 44, 44);
  }
  const a = (t - Gs.at) / PULSE_T;
  if (a >= 0 && a <= 1.2) {
    const d = Math.min(a, 1) * G.lens[G.lens.length - 1]; let k = 0; while (k < G.lens.length - 1 && G.lens[k + 1] < d) k++;
    const [x, y] = G.pts[k], fade = a > 1 ? 1 - (a - 1) / 0.2 : 1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = radial(ctx, x, y, 0, x, y, 30, [[0, `rgba(190,255,220,${0.9 * fade})`], [1, 'rgba(60,255,150,0)']]); ctx.fillRect(x - 30, y - 30, 60, 60);
    ctx.globalCompositeOperation = 'source-over';
  }
  // the switch's cap: lit while the gate's open, down for a moment when pressed, a ring of LEDs round it counting down
  const sw = G.sw, down = t - Gs.at < 0.25 && t >= Gs.at;
  ctx.save(); ctx.translate(sw.x, sw.y); ctx.rotate(angOf(sw.q));
  if (lit) { ctx.fillStyle = radial(ctx, 0, 0, 4, 0, 0, 34, [[0, alphaHex(col, 0.45)], [1, alphaHex(col, 0)]]); circ(ctx, 0, 0, 34); ctx.fill(); }
  const cr = down ? 11 : 13;
  circ(ctx, down ? 0 : -1, down ? 0 : -1.5, cr); ctx.fillStyle = radial(ctx, -4, -5, 1, 0, 0, cr, [[0, shadeHex(col, lit ? 0.5 : 0.15)], [0.6, lit ? col : '#8a1d18'], [1, '#3b0d0a']]); ctx.fill();
  if (!down) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ell(ctx, -5, -6, 4.5, 2.5, -0.6); ctx.fill(); }
  for (let k = 0; k < GATE_LEDS; k++) { const an = -Math.PI / 2 + (k + 0.5) / GATE_LEDS * TAU; circ(ctx, Math.cos(an) * 18, Math.sin(an) * 18, 1.8); ctx.fillStyle = k < L.n ? L.col : '#2a2d33'; ctx.fill(); }
  ctx.restore();
  // the fork's inside lane: chevrons into the Bus while it's open, a red cross while it's shut
  const fs = G.fs;
  if (fs) {
    const off = fs.side * halfWAt(T, fs.s) * 0.52;
    ctx.lineCap = 'round';
    for (let d = -220, k = 0; d <= fs.sLock - fs.s - 40; d += 60, k++) {
      const q = trackSample(T, fs.s + d);
      ctx.save(); ctx.translate(q.x + q.nx * off, q.y + q.ny * off); ctx.rotate(angOf(q)); ctx.lineWidth = 6;
      if (lit) {
        const ph = ((t * 2.2 - k * 0.25) % 1 + 1) % 1, al = 0.35 + 0.55 * Math.max(0, Math.sin(ph * TAU));
        ctx.strokeStyle = alphaHex(col, al); ctx.beginPath(); ctx.moveTo(-10, -14); ctx.lineTo(4, 0); ctx.lineTo(-10, 14); ctx.stroke();
      } else if (k % 2 === 0) {
        ctx.strokeStyle = 'rgba(255,59,48,0.75)'; ctx.beginPath(); ctx.moveTo(-11, -11); ctx.lineTo(11, 11); ctx.moveTo(11, -11); ctx.lineTo(-11, 11); ctx.stroke();
      }
      ctx.restore();
    }
  }
  // the bars: out of each transistor toward the middle as it shuts
  const shut = st.open ? 0 : st.closing ? 1 - st.u / CLOSE : 1, f = shut * shut * (3 - 2 * shut);
  ctx.save(); ctx.translate(gq.x, gq.y); ctx.rotate(angOf(gq));
  if (f > 0) for (const sd of [-1, 1]) {
    const y0 = sd * (hw + 6), y1 = sd * (hw + 6) * (1 - f), top = Math.min(y0, y1), h = Math.abs(y1 - y0);
    for (const x of [-12, 0, 12]) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - 4 + 5, top + 7, 8, h);
      ctx.fillStyle = linear(ctx, x - 4, 0, x + 4, 0, [[0, '#8e959f'], [0.5, '#eef1f4'], [1, '#6c737d']]); ctx.fillRect(x - 4, top, 8, h);
    }
    ctx.fillStyle = '#e8362b'; ctx.fillRect(-19, y1 - (sd > 0 ? 0 : 8), 38, 8);   // the red end caps that meet in the middle
  }
  // the LED blocks in the transistors' windows
  for (const sd of [-1, 1]) {
    const y = sd * (hw + POST), k = POST_K;
    for (let n = 0; n < GATE_LEDS; n++) { const x = (-6 + (n % 4) * 8) * k, yy = y + (-5 + Math.floor(n / 4) * 10) * k; ctx.fillStyle = n < L.n ? L.col : '#22252b'; ctx.fillRect(x - 3 * k, yy - 3 * k, 6 * k, 6 * k); }
    ctx.fillStyle = radial(ctx, 6 * k, y, 2, 6 * k, y, 46, [[0, alphaHex(L.col, 0.3)], [1, alphaHex(L.col, 0)]]); ctx.fillRect(-40, y - 46, 92, 92);
  }
  ctx.restore();
}
function alphaHex(hex, a) { const n = parseInt(hex.slice(1, 7), 16); return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${a})`; }
function shadeHex(hex, k) { const n = parseInt(hex.slice(1, 7), 16), f = v => Math.round(v + (255 - v) * k); return `rgb(${f(n >> 16)},${f(n >> 8 & 255)},${f(n & 255)})`; }

// ------------------------------------------------------------------------------------------------ the lava river
// (race-river.js) The channel from the crater, clipped out of the tarmac except at the fords (lamps flash when a surge
// is on its way), under a bridge into an always-molten lake. A trickle between eruptions; a surge is a molten band.
const holes = new WeakMap();
// everything but the tarmac (evenodd: a big box, plus each edge of the road as a loop)
function roadHole(T) {
  if (holes.has(T)) return holes.get(T);
  const B = T.bbox, p = new Path2D(); p.rect(B.x - 3000, B.y - 3000, B.w + 6000, B.h + 6000);
  for (const side of [1, -1]) { for (let i = 0; i < T.N; i += 2) { const q = T.pts[i], tn = T.tan[i], o = side * (T.hw[i] + 1); i ? p.lineTo(q[0] - tn[1] * o, q[1] + tn[0] * o) : p.moveTo(q[0] - tn[1] * o, q[1] + tn[0] * o); } p.closePath(); }
  holes.set(T, p); return p;
}
// the bit of a ford on the tarmac: where the channel's banks cross the road's edges
function fordQuad(T, f, W, pad = 2) {
  const q = trackSample(T, f.s), nx = -f.uy, ny = f.ux, tn = q.tx * nx + q.ty * ny, ln = q.nx * nx + q.ny * ny, hw = q.hw + pad;
  return [[-hw, -W], [-hw, W], [hw, W], [hw, -W]].map(([l, e]) => { const a = (e - l * ln) / tn; return [f.x + q.tx * a + q.nx * l, f.y + q.ty * a + q.ny * l]; });
}
// the point d down the channel, and which way it runs there
function riverAt(r, d) {
  const P = r.path; let lo = 0, hi = P.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m][2] < d) lo = m; else hi = m; }
  const a = P[lo], b = P[hi], f = clamp((d - a[2]) / ((b[2] - a[2]) || 1), 0, 1);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.atan2(b[1] - a[1], b[0] - a[0])];
}
// the channel's middle line from d0 to d1 down it, as the current path (false: nothing of it there)
function riverPath(g, r, d0, d1) {
  d0 = Math.max(0, d0); d1 = Math.min(r.len, d1); g.beginPath(); if (d1 <= d0) return false;
  const a = riverAt(r, d0), b = riverAt(r, d1); g.moveTo(a[0], a[1]);
  for (const p of r.path) if (p[2] > d0 && p[2] < d1) g.lineTo(p[0], p[1]);
  g.lineTo(b[0], b[1]); return true;
}
// how wide the channel is d down it: narrow where it leaves the crater, widening down the cone
const riverW = (r, d) => r.w * (d < r.head ? 0.4 + 0.6 * d / r.head : 1);
// the channel from d0 to d1 down it as a closed path, k times its width plus pad either side (false: nothing of it there)
function ribbon(g, r, d0, d1, k = 1, pad = 0) {
  d0 = Math.max(0, d0); d1 = Math.min(r.len, d1); g.beginPath(); if (d1 <= d0) return false;
  const P = r.path, L = [], R = [];
  const at = d => { const [x, y, a] = riverAt(r, d), w = riverW(r, d) * k + pad, nx = -Math.sin(a), ny = Math.cos(a); L.push([x + nx * w, y + ny * w]); R.push([x - nx * w, y - ny * w]); };
  at(d0); for (const p of P) if (p[2] > d0 + 1 && p[2] < d1 - 1) at(p[2]); at(d1);
  g.moveTo(L[0][0], L[0][1]); for (const p of L) g.lineTo(p[0], p[1]); for (let j = R.length - 1; j >= 0; j--) g.lineTo(R[j][0], R[j][1]); g.closePath();
  return true;
}
// the lake's shoreline at scale k, lumpy
function lakePath(g, lk, k = 1, t = 0) {
  g.beginPath();
  for (let j = 0; j <= 40; j++) { const a = j / 40 * TAU, r = lk.r * k * (1 + 0.08 * Math.sin(a * 3 + 1) + 0.05 * Math.sin(a * 5 + 2 + t * 0.3)); j ? g.lineTo(lk.x + Math.cos(a) * r * 1.25, lk.y + Math.sin(a) * r * 0.85) : g.moveTo(lk.x + Math.cos(a) * r * 1.25, lk.y + Math.sin(a) * r * 0.85); }
  g.closePath();
}
// where each ford's posts stand: either side of the road on both banks
function fordPosts(T, f, W) { return fordQuad(T, f, W + 12, 22); }

function riverStatic(g, T, r) {
  const L = lava(g), W = r.w;
  if (r.lake) {   // the lake's shore: a ring of dark rock, lit on its top left
    lakePath(g, r.lake, 1.18); g.fillStyle = 'rgba(0,0,0,0.3)'; g.save(); g.translate(6, 8); g.fill(); g.restore();
    lakePath(g, r.lake, 1.18); g.fillStyle = '#2a1c20'; g.fill();
    g.save(); g.translate(-3, -4); lakePath(g, r.lake, 1.1); g.strokeStyle = 'rgba(170,130,128,0.3)'; g.lineWidth = 6; g.stroke(); g.restore();
    lakePath(g, r.lake, 1.06); fillPattern(g, L.crust, 13, 7, 0.7);
  }
  g.save(); g.clip(roadHole(T), 'evenodd');
  // the banks: a shadow down and to the right, a lip of dark rock lit on its top left, then the bed of old crust
  g.save(); g.translate(5, 7); ribbon(g, r, 0, r.len, 1, 7); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill(); g.restore();
  g.save(); g.translate(-2, -3); ribbon(g, r, 0, r.len, 1, 8); g.fillStyle = '#7a6266'; g.fill(); g.restore();
  ribbon(g, r, 0, r.len, 1, 8); g.fillStyle = '#24181b'; g.fill();
  ribbon(g, r, 0, r.len); fillPattern(g, L.crust, 0, 0, 0.55);
  ribbon(g, r, 0, r.len, 0.4); g.fillStyle = 'rgba(120,30,10,0.35)'; g.fill();   // warm down the middle, where the trickle runs
  g.restore();
  for (const f of r.fords) {
    const q = trackSample(T, f.s);
    if (f.bridge) {   // a steel bridge: the road carries on over it, parapets either side, the channel's shadow under them
      for (const side of [-1, 1]) {
        const o = side * (q.hw + 7), a0 = -f.hl - 26, a1 = f.hl + 26, P = [[a0, o - 4], [a1, o - 4], [a1, o + 4], [a0, o + 4]].map(([a, l]) => [f.x + q.tx * a + q.nx * l, f.y + q.ty * a + q.ny * l]);
        g.save(); g.translate(4, 6); poly(g, P); g.fillStyle = 'rgba(0,0,0,0.4)'; g.fill(); g.restore();
        poly(g, P); g.fillStyle = '#7d7176'; g.fill(); g.strokeStyle = '#3a3034'; g.lineWidth = 1.5; g.stroke();
        for (let a = a0 + 8; a < a1; a += 16) { const x = f.x + q.tx * a + q.nx * o, y = f.y + q.ty * a + q.ny * o; g.fillStyle = '#4a4247'; blob(g, x, y, 2.2); }
      }
      continue;
    }
    // a ford: the road dips through the channel on a bed of crust, a dark lip where each bank crosses the road
    const Q = fordQuad(T, f, W);
    poly(g, Q); fillPattern(g, L.crust, f.x, f.y, 0.5); g.fillStyle = 'rgba(40,22,24,0.25)'; g.fill();
    g.strokeStyle = 'rgba(14,8,9,0.7)'; g.lineWidth = 5; g.beginPath(); g.moveTo(...Q[0]); g.lineTo(...Q[3]); g.moveTo(...Q[1]); g.lineTo(...Q[2]); g.stroke();
    g.strokeStyle = 'rgba(255,230,200,0.12)'; g.lineWidth = 2; g.beginPath(); g.moveTo(Q[0][0] - 3, Q[0][1] - 3); g.lineTo(Q[3][0] - 3, Q[3][1] - 3); g.stroke();
    // striped posts, each with a lamp on top (lit by the animated layer)
    for (const [x, y] of fordPosts(T, f, W)) {
      g.fillStyle = 'rgba(0,0,0,0.35)'; blob(g, x + 4, y + 5, 9);
      g.fillStyle = '#1d1f27'; blob(g, x, y, 8.5); g.fillStyle = '#f2c94c'; g.beginPath(); g.arc(x, y, 8.5, -0.4, 1.2); g.lineTo(x, y); g.fill(); g.beginPath(); g.arc(x, y, 8.5, 2.7, 4.3); g.lineTo(x, y); g.fill();
      g.fillStyle = '#5a1410'; blob(g, x, y - 2, 4.5);
    }
  }
}

// a surge on its way to (or running through) ford f: 0 none, else 1 (for the lamps)
const fordAlarm = (ts, f, t) => ts.some(t0 => { const tA = t0 + f.d / FLOW_V; return t > tA - 3.2 && t < tA + FLOOD; });

function riverFlow(ctx, race, T, r, i) {
  const t = race.time, ts = (race.surges && race.surges[i]) || [], L = lava(ctx), W = r.w;
  if (!r.box) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of r.path) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } r.box = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: Math.hypot(x1 - x0, y1 - y0) / 2 + W + 60 }; }
  if (!onView(r.box.x, r.box.y, r.box.r)) return;
  const st = race.volc && race.volc[r.vi], rumble = st ? clamp(1 - (st.next - t) / RUMBLE, 0, 1) : 0;
  // the lake: always molten, churning, flaring up as a surge pours in
  if (r.lake && onView(r.lake.x, r.lake.y, r.lake.r * 1.6)) {
    const lk = r.lake, pour = ts.some(t0 => { const a = t - t0 - r.len / FLOW_V; return a > 0 && a < FLOOD; }) ? 1 : 0;
    ctx.globalCompositeOperation = 'lighter'; stamp(ctx, L.glow, lk.x, lk.y, lk.r * (1.9 + 0.4 * pour), 0.35 + 0.25 * pour + 0.06 * Math.sin(t * 2.1)); ctx.globalCompositeOperation = 'source-over';
    lakePath(ctx, lk, 1, t); fillPattern(ctx, L.molten, lk.x + t * 6, lk.y + t * 3, 0.7);
    ctx.save(); ctx.clip(); ctx.globalAlpha = 0.25 + 0.08 * Math.sin(t * 1.7); fillPattern(ctx, L.molten, lk.x - t * 9, lk.y + t * 5, 1.2); ctx.globalAlpha = 1;
    stamp(ctx, L.core, lk.x - lk.r * 0.2, lk.y - lk.r * 0.1, lk.r * (0.7 + 0.2 * pour), 0.55 + 0.3 * pour);
    ctx.strokeStyle = 'rgba(120,16,4,0.5)'; ctx.lineWidth = 16; ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    for (let j = 0; j < 6; j++) { const f = (t * 1.1 + j * 0.23) % 1, a = j * 2.3, d = lk.r * (0.2 + 0.12 * j), br = 2 + f * 7, bx = lk.x + Math.cos(a) * d * 1.2, by = lk.y + Math.sin(a) * d * 0.8; ctx.moveTo(bx + br, by); ctx.arc(bx, by, br, 0, TAU); }
    ctx.strokeStyle = 'rgba(255,240,170,0.55)'; ctx.lineWidth = 1.8; ctx.stroke();
  }
  const draw = () => {
    // the trickle: a thread of lava down the middle, brighter as the volcano rumbles
    if (riverPath(ctx, r, 0, r.len)) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,90,20,${0.14 + 0.2 * rumble})`; ctx.lineWidth = W * 0.9; ctx.stroke();
      ctx.fillStyle = `rgba(255,176,80,${0.45 + 0.3 * rumble})`; ctx.beginPath();   // glowing lumps drifting down it
      for (let d = 0, k = 0; d < r.len; k++) {
        const u = hash(k, 3.7), dd = (d + t * (30 + 20 * u)) % r.len, [x, y, a] = riverAt(r, dd), o = (hash(k, 9.1) - 0.5) * riverW(r, dd) * 0.5, br = 1.8 + 2.4 * hash(k, 5.3);
        ctx.moveTo(x - Math.sin(a) * o + br, y + Math.cos(a) * o); ctx.arc(x - Math.sin(a) * o, y + Math.cos(a) * o, br, 0, TAU);
        d += 26 + 40 * u;
      }
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    for (const t0 of ts) {
      const a = t - t0, front = a * FLOW_V, tail = (a - FLOOD) * FLOW_V, cold = (a - FLOOD - COOL_T) * FLOW_V;
      // the crust it leaves: red-hot seams, cooling toward where it passed first
      for (let k = 0; k < 4; k++) if (ribbon(ctx, r, lerpN(cold, tail, k / 4), lerpN(cold, tail, (k + 1) / 4) + 2, 0.95)) {
        const h = (k + 1) / 4; ctx.fillStyle = `rgba(150,34,8,${0.55 * h})`; ctx.fill();
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = h * 0.8; fillPattern(ctx, L.seams, 0, 0, 0.55); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      // the surge: molten rock churning downstream, glowing, a hot line down its middle
      if (ribbon(ctx, r, tail, front, 1, 16)) {
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,110,30,0.14)'; ctx.fill(); ribbon(ctx, r, tail, front, 1, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
        ribbon(ctx, r, tail, front, 1.04); fillPattern(ctx, L.molten, t * 40, t * 70, 0.6);
        ctx.strokeStyle = 'rgba(120,16,4,0.45)'; ctx.lineWidth = 4; ctx.stroke();   // cooler at its banks
      }
      // its front: a white-hot bulging head, rolling over itself
      if (front > 0 && front < r.len + 40) {
        const [x, y, ang] = riverAt(r, Math.min(front, r.len)), R = riverW(r, front) * 1.2;
        ctx.globalCompositeOperation = 'lighter'; stamp(ctx, L.glow, x, y, R * 3.2, 0.8); ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath(); ctx.ellipse(x - Math.cos(ang) * R * 0.3, y - Math.sin(ang) * R * 0.3, R * 1.15, R * 1.05, ang, 0, TAU); fillPattern(ctx, L.molten, x - t * 60, y + t * 30, 0.5);
        stamp(ctx, L.core, x, y, R * (1.1 + 0.15 * Math.sin(t * 14)), 0.9);
        ctx.fillStyle = '#ffd166'; ctx.beginPath();
        for (let j = 0; j < 5; j++) { const f = (t * 2.2 + j * 0.2) % 1, aa = ang + (j - 2) * 0.5, d = R * (0.9 + f * 0.8), dx = x + Math.cos(aa) * d, dy = y + Math.sin(aa) * d - f * 18, br = 2.6 * (1 - f) + 0.4; ctx.moveTo(dx + br, dy); ctx.arc(dx, dy, br, 0, TAU); }
        ctx.fill();
      }
    }
  };
  ctx.save(); ctx.clip(roadHole(T), 'evenodd'); draw(); ctx.restore();
  for (const f of r.fords) if (!f.bridge && onView(f.x, f.y, 300)) { ctx.save(); poly(ctx, fordQuad(T, f, W + 4, 1)); ctx.clip(); draw(); ctx.restore(); }
  // the lamps on the fords' posts: flashing red, in turn, when a surge is on its way
  for (const f of r.fords) {
    if (f.bridge || !onView(f.x, f.y, 300) || !fordAlarm(ts, f, t)) continue;
    fordPosts(T, f, W).forEach(([x, y], k) => {
      if ((Math.floor(t * 3) + k) % 2) return;
      ctx.globalCompositeOperation = 'lighter'; stamp(ctx, L.glow, x, y - 2, 30, 0.9); ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ff3b2f'; blob(ctx, x, y - 2, 4.5); ctx.fillStyle = '#ffd0c8'; blob(ctx, x - 1.2, y - 3.2, 1.8);
    });
  }
}

// the terraced mountain under a volcano whose road climbs it (`flank`: how far out its foot is, layout units)
export function volcanoFlank(g, T, detail) {
  const v = T.mech && T.mech.volcano[0]; if (!v || !T.def.flank) return;
  const F = T.def.flank * T.def.scale, x = v.x, y = v.y, rng = mulberry(41), N = 6;
  const wob = (a, k) => 1 + 0.07 * Math.sin(a * 3 + 0.7 + k * 4) + 0.045 * Math.sin(a * 5 + 2.1 - k * 7) + 0.025 * Math.sin(a * 11 + k * 13);
  const ring = (k, dx = 0, dy = 0) => {
    g.beginPath();
    for (let j = 0; j <= 120; j++) { const a = j / 120 * TAU, r = F * k * wob(a, k); const px = x + dx + Math.cos(a) * r, py = y + dy + Math.sin(a) * r * 0.9; j ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.closePath();
  };
  for (let i = 0; i < N; i++) {
    const k = 1 - i / N * 0.8, R = F * k;
    ring(k, 16, 22); g.fillStyle = 'rgba(8,4,5,0.3)'; g.fill();   // the step's shadow, down and to the right
    ring(k);
    const lg = g.createLinearGradient(x - R, y - R, x + R * 0.8, y + R * 0.8);
    lg.addColorStop(0, `rgba(190,150,156,${0.16 + 0.03 * i})`); lg.addColorStop(0.5, `rgba(128,98,104,${0.1 + 0.025 * i})`); lg.addColorStop(1, 'rgba(20,10,12,0.12)');
    g.fillStyle = lg; g.fill();
    g.save(); g.translate(-2, -3); ring(k); g.strokeStyle = `rgba(222,192,194,${0.18 + 0.03 * i})`; g.lineWidth = 4; g.stroke(); g.restore();   // the lit rim
    g.save(); g.translate(3, 4); ring(k); g.strokeStyle = 'rgba(10,5,6,0.4)'; g.lineWidth = 5; g.stroke(); g.restore();
  }
  if (detail > 0.5) {   // gullies down the flanks, each a dark groove with a lit edge
    g.lineCap = 'round';
    for (let j = 0; j < 46; j++) {
      const a = (j + rng()) / 46 * TAU, r0 = F * (0.25 + rng() * 0.2), r1 = F * (0.6 + rng() * 0.4), bend = (rng() - 0.5) * 0.25;
      g.beginPath();
      for (let s = 0; s <= 8; s++) { const f = s / 8, r = r0 + (r1 - r0) * f, aa = a + bend * f * f + Math.sin(f * 6 + j) * 0.02; s ? g.lineTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r * 0.9) : g.moveTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r * 0.9); }
      g.strokeStyle = 'rgba(12,6,8,0.28)'; g.lineWidth = 3 + rng() * 3; g.stroke();
      g.save(); g.translate(-2, -2); g.strokeStyle = 'rgba(220,190,190,0.07)'; g.lineWidth = 1.5; g.stroke(); g.restore();
    }
  }
}
