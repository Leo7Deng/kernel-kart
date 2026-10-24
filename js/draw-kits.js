// Kernel Kart: drawing the Fight kits' things (js/fight-kits.js), for draw-fight.js. Cosmetic only: it reads the fight's
// plain state and events. The user's rule for every effect: "good looking effects, doesnt have to be over the top, and
// certainly not just circle or ring of colors": each one looks like the thing it is (earth, steam, claws, coils, ink,
// containers, feathers, a pointer, glitches, electric arcs), soft-shaded and lit from the top left like the arenas.
//   kitEvent      a kit event's particles (dirt, claw glints, ink, dust, arcs ...), from fightEvents
//   kitGround     things flat on the ground: a Boot Loop's charged floor, the containers' shadows as they fall, ink
//   kitThings     things standing among the fighters (y-sorted with them): containers, little gophers, the tentacle,
//                 the zap's beam
//   kitBehind / kitOver   round a fighter, before and after its model: Gopher's mound, a dive's streaks, antigravity's
//                 lift, Pyth's coils round who he holds, Ownership's padlock, a stun's crackle
//   kitTint       a tint on the model (Ferris's counter stance, Docky's Isolation, the blink's ghost)
//   kitFx         the new particle kinds (drawn in draw-fight.js's particle loop)
//   kitIcon       the specials' icons (the keys on screen, the feed)
import { TAU, clamp, frnd, lerp } from './core.js';
import { CHARACTERS } from './core.js';
import { bold } from './look.js';
import { aoBlob, mat, shadeBox } from './art/arena-mat.js';
import * as M3 from './art/model3d.js';
import { SCALE, burst, model, puff, shadow, starPath, tinted } from './draw-fight.js';
import { moveBehind, moveEvent, moveFx, moveGround, moveIcon, moveOver, moveThings } from './draw-moves.js';   // (Tux's and Duke's three moves and evades)
import { ART, ARTS, artsIn } from './art/kits.js';   // (the plug-in fighters' own: js/art/kit-<id>.js)
import { shadows3, step3, things3 } from './art/prop3d.js';   // (the 3D props and effects kit: its particles)

const charOf = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
const rgba = (r, g, b, a) => `rgba(${r},${g},${b},${clamp(a, 0, 1).toFixed(3)})`;
// a seeded wobble (the same shape every frame for one thing): h(i) 0..1
const hsh = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---------------------------------------------------------------- events
export function kitEvent(v, F, e, few) {
  const P = e.power || 0, who = e.who ?? -1;
  { const A = F.f[who] && ART[F.f[who].id]; if (A && A.event && A.event(v, F, e, few)) return true; }   // (a plug-in fighter's events)
  if (moveEvent(v, F, e, few)) return true;
  switch (e.kind) {
    case 'dig': clods(v, e.x, e.y, few ? 4 : 8, 0.7); puff(v, e.x, e.y, few ? 2 : 4, '#e8dccb'); return true;
    case 'popup': {   // up out of the ground: earth thrown up and out, a dark hole left a moment
      clods(v, e.x, e.y, few ? 6 : 12, 1.2); puff(v, e.x, e.y - 2, few ? 3 : 6, '#e6d8c2');
      v.fx.push({ k: 'hole', x: e.x, y: e.y, t: 0, life: 1.4, s: 15 }); v.shake = Math.max(v.shake, 0.22); return true;
    }
    case 'borrow': {   // Borrow Checker: the claw catching it: a hot orange glint and sparks flung back the way the hit came
      const A = F.f[e.to], D = F.f[who], a = A && D ? Math.atan2(A.y - D.y, A.x - D.x) : 0;
      v.fx.push({ k: 'clash', x: e.x + Math.cos(a) * 18, y: e.y - 26 + Math.sin(a) * 12, a, t: 0, life: 0.2, s: 16 });
      for (let k = 0; k < (few ? 3 : 7); k++) { const b = a + frnd(-0.8, 0.8), sp = frnd(130, 230); v.fx.push({ k: 'ember', x: e.x + Math.cos(a) * 18, y: e.y - 26, vx: Math.cos(b) * sp, vy: Math.sin(b) * sp * 0.7 - frnd(40, 100), t: 0, life: frnd(0.25, 0.4), s: frnd(5, 8) }); }
      if (D) v.ctr[D.i] = v.t;
      return true;
    }
    case 'own': {   // Ownership: a chain flung out from Ferris to them, snapping shut into the padlock over their head
      const D = F.f[who]; if (D) v.fx.push({ k: 'chain', i: who, to: e.to, t: 0, life: 0.5, s: 1 }); return true;
    }
    case 'coil': { const A = F.f[who]; if (A) v.fx.push({ k: 'lash', i: who, x: e.x, y: e.y, t: 0, life: 0.25, s: 1 }); return true; }
    case 'lift': for (let k = 0; k < (few ? 4 : 9); k++) { const a = frnd(0, TAU), r = frnd(4, 22); v.fx.push({ k: 'mote', x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r * 0.5, vx: 0, vy: -frnd(30, 70), t: 0, life: frnd(0.6, 1.1), s: frnd(1.6, 2.8), col: '255,250,226' }); } return true;
    case 'yank': { const A = F.f[who], D = F.f[e.to]; if (A && D) for (let k = 0; k < (few ? 2 : 4); k++) { const a = Math.atan2(A.y - D.y, A.x - D.x); v.fx.push({ k: 'glint', x: D.x, y: D.y - 22 + frnd(-8, 8), vx: Math.cos(a) * frnd(160, 240), vy: Math.sin(a) * frnd(100, 180), t: 0, life: 0.2, s: frnd(8, 12) }); } return true; }
    case 'slap': v.fx.push({ k: 'splash', x: e.x, y: e.y, t: 0, life: 0.35, s: 14, ink: 1 }); return true;
    case 'spin': return true;
    case 'crate': {   // a container down: a thump of dust out from under it
      for (let k = 0; k < (few ? 5 : 10); k++) { const a = k / (few ? 5 : 10) * TAU + frnd(-0.2, 0.2), sp = frnd(50, 90); v.fx.push({ k: 'dust', x: e.x + Math.cos(a) * 16, y: e.y + Math.sin(a) * 12, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, t: 0, life: frnd(0.45, 0.7), s: frnd(6, 9) }); }
      v.shake = Math.max(v.shake, 0.18 + P * 0.15); return true;
    }
    case 'shove': puff(v, e.x, e.y, few ? 2 : 4, null); return true;
    case 'poof': puff(v, e.x, e.y - 8, few ? 3 : 6, null); return true;
    case 'iso': { const D = F.f[e.to]; if (D) v.iso[D.i] = v.t; return true; }
    case 'dive': return true;
    case 'blink': {   // Pointer: a faint ghost left where he was, a dotted pointer line to where he is now
      const f = F.f[who];
      if (f) { v.fx.push({ k: 'ghost', i: who, id: f.id, x: e.x, y: e.y, face: e.face ?? f.face, t: 0, life: 0.45, s: 1 }); v.fx.push({ k: 'pointer', x: e.x, y: e.y, x2: e.x2, y2: e.y2, t: 0, life: 0.5, s: 1 }); }
      return true;
    }
    case 'ub': {   // Undefined Behavior: glitch blocks for a segfault; a blast for a stack overflow; ghosts swapping; both glitching
      const o = F.f[e.to];
      if (e.ub === 0 && o) v.fx.push({ k: 'glitch', i: o.i, t: 0, life: 1.6, s: 1, seed: frnd(0, 99) });
      else if (e.ub === 1) {
        v.fx.push({ k: 'flash', x: e.x, y: e.y - 20, t: 0, life: 0.2, s: 60 });
        burst(v, e.x, e.y - 20, 0, TAU, 70, few ? 8 : 14, 0.32);
        for (let k = 0; k < (few ? 5 : 10); k++) { const a = frnd(0, TAU), sp = frnd(40, 90); v.fx.push({ k: 'smoke', x: e.x + Math.cos(a) * 20, y: e.y - 10 + Math.sin(a) * 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5 - 30, t: 0, life: frnd(0.8, 1.3), s: frnd(9, 15) }); }
        v.shake = Math.max(v.shake, 0.6);
      } else if (e.ub === 2 && o) { v.fx.push({ k: 'glitch', i: o.i, t: 0, life: 0.5, s: 1, seed: frnd(0, 99) }); v.fx.push({ k: 'glitch', i: who, t: 0, life: 0.5, s: 1, seed: frnd(0, 99) }); v.fx.push({ k: 'pointer', x: e.x, y: e.y, x2: e.x2, y2: e.y2, t: 0, life: 0.45, s: 1 }); }
      else if (o) { v.fx.push({ k: 'glitch', i: o.i, t: 0, life: 0.7, s: 1, seed: frnd(0, 99) }); v.fx.push({ k: 'glitch', i: who, t: 0, life: 0.5, s: 0.6, seed: frnd(0, 99) }); }
      return true;
    }
    case 'zap': for (let k = 0; k < (few ? 2 : 5); k++) { const a = frnd(0, TAU), sp = frnd(80, 170); v.fx.push({ k: 'spark2', x: e.x, y: e.y - 22, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - 30, t: 0, life: frnd(0.15, 0.3), s: frnd(4, 7) }); } return true;
    case 'jolt': { const o = F.f[e.to]; if (o) v.fx.push({ k: 'crackle', i: o.i, t: 0, life: 0.9, s: 1 }); return true; }
    case 'field': return true;
    case 'stance': return true;
  }
  return false;
}
function clods(v, x, y, n, p) {   // clods of earth thrown up, tumbling and falling back
  for (let k = 0; k < n; k++) { const a = frnd(0, TAU), sp = frnd(40, 120) * p; v.fx.push({ k: 'clod', x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 3, z: 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.55, vz: frnd(120, 230) * p, t: 0, life: frnd(0.5, 0.8), s: frnd(1.8, 3.4), a: frnd(0, TAU) }); }
}

// ---------------------------------------------------------------- on the ground
export function kitGround(g, F, v) {
  for (const o of F.objs || []) {
    if (o.kind === 'field') bootLoop(g, o, v.t, F);
    else if (o.kind === 'crate' && o.z > 0 && o.t >= (o.wait || 0)) crateShadow(g, o);
  }
  moveGround(g, F, v);
  for (const o of F.objs || []) { const A = F.f[o.owner] && ART[F.f[o.owner].id]; if (A && A.ground) A.ground(g, F, v, o); }   // (the plug-in fighters' things on the floor)
  shadows3(g, v);   // (the 3D bits' little shadows, art/prop3d.js)
}
// Boot Loop: the floor charged. Not a coloured disc: a faint uneven haze of charge hugging the ground, little emitter
// studs round its edge with arcs jumping between neighbours, and short crackling arcs skittering over the floor inside,
// re-drawn every few frames. It fades in, and out in its last half second.
function bootLoop(g, o, t, F) {
  const age = o.t || 0, left = (o.life || 4) - age, a = clamp(age / 0.25, 0, 1) * clamp(left / 0.5, 0, 1), R = o.r || 60, sy = 0.5, seed = (o.id || 1) * 7.1;
  if (a <= 0.01) return;
  const tick = Math.floor(t * 14), BD = bold();
  g.save(); g.translate(o.x, o.y);
  // the haze: a few soft blobs, uneven, very faint
  for (let k = 0; k < 6; k++) {
    const an = k / 6 * TAU + seed, rr = R * (0.35 + 0.3 * hsh(k + seed)), x = Math.cos(an) * rr * 0.6, y = Math.sin(an) * rr * 0.6 * sy, br = R * (0.45 + 0.15 * hsh(k * 3 + seed));
    const hg = g.createRadialGradient(x, y, 0, x, y, br);
    hg.addColorStop(0, rgba(170, 255, 205, 0.1 * a * (0.8 + 0.2 * Math.sin(t * 6 + k)))); hg.addColorStop(1, rgba(170, 255, 205, 0));
    g.fillStyle = hg; g.beginPath(); g.ellipse(x, y, br, br * sy, 0, 0, TAU); g.fill();
  }
  // the emitters: 7 little studs round the edge, a dark base and a bright tip
  const N = 7, studs = [];
  for (let k = 0; k < N; k++) { const an = k / N * TAU + seed * 0.3, x = Math.cos(an) * R, y = Math.sin(an) * R * sy; studs.push([x, y]); }
  for (const [x, y] of studs) {
    g.fillStyle = rgba(20, 50, 34, 0.55 * a); g.beginPath(); g.ellipse(x + 1, y + 1, 3.2, 1.6, 0, 0, TAU); g.fill();
    g.fillStyle = BD ? rgba(61, 220, 132, a) : rgba(80, 205, 130, a); g.beginPath(); g.ellipse(x, y - 2, 2.2, 3, 0, 0, TAU); g.fill();
    g.fillStyle = rgba(235, 255, 240, 0.9 * a); g.beginPath(); g.arc(x - 0.5, y - 3.5, 1.1, 0, TAU); g.fill();
  }
  // arcs between neighbouring studs (some of them at a time, flickering)
  for (let k = 0; k < N; k++) {
    if (hsh(k + tick * 3.3 + seed) < 0.45) continue;
    const [x0, y0] = studs[k], [x1, y1] = studs[(k + 1) % N];
    arc(g, x0, y0 - 3, x1, y1 - 3, 7, 5, k + tick * 11 + seed, a * 0.8);
  }
  // short arcs crackling over the floor inside
  for (let k = 0; k < 5; k++) {
    const s0 = k * 13.7 + tick * 2.1 + seed, an = hsh(s0) * TAU, rr = R * 0.8 * Math.sqrt(hsh(s0 + 1)), x = Math.cos(an) * rr, y = Math.sin(an) * rr * sy, L = 10 + 14 * hsh(s0 + 2), b = hsh(s0 + 3) * TAU;
    arc(g, x, y, x + Math.cos(b) * L, y + Math.sin(b) * L * sy, 4, 3, s0, a * (0.4 + 0.5 * hsh(s0 + 4)));
  }
  g.restore();
}
// an electric arc from (x0,y0) to (x1,y1): a jagged path of n segments jumping up to j off the line, a soft green glow
// under a white core
export function arc(g, x0, y0, x1, y1, n, j, seed, a, w = 1) {
  const pts = [[x0, y0]], dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  for (let k = 1; k < n; k++) { const u = k / n, o = (hsh(seed + k * 1.7) - 0.5) * 2 * j * Math.sin(u * Math.PI); pts.push([x0 + dx * u + nx * o, y0 + dy * u + ny * o]); }
  pts.push([x1, y1]);
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const [lw, c] of [[4.5 * w, rgba(120, 255, 170, 0.22 * a)], [2.2 * w, rgba(170, 255, 205, 0.55 * a)], [1 * w, rgba(250, 255, 252, 0.95 * a)]]) {
    g.strokeStyle = c; g.lineWidth = lw; g.beginPath(); pts.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
  }
}
// a container on its way down: its shadow on the ground, small and faint high up, firming as it drops
function crateShadow(g, o) {
  const H = o.sup ? 120 : 70, u = clamp(1 - o.z / H, 0, 1), w = o.w * (0.6 + 0.4 * u), h = o.h * (0.6 + 0.4 * u);
  g.fillStyle = `rgba(20,16,42,${(0.08 + 0.22 * u).toFixed(3)})`;
  g.beginPath(); g.roundRect(o.x - w / 2 + 2, o.y - h / 2 + 2, w, h, 4); g.fill();
}

// ---------------------------------------------------------------- among the fighters
export function kitThings(F, v, g) {
  const out = [];
  for (const o of F.objs || []) {
    if (o.kind === 'crate' && o.t >= (o.wait || 0)) out.push({ y: o.y + o.h / 2 - 4, d: () => container(g, o) });
    else if (o.kind === 'gorou' && o.t >= (o.wait || 0)) out.push({ y: o.y, d: () => goroutine(g, o, v, F) });
    else if (o.kind === 'tentacle') { const f = F.f[o.owner]; out.push({ y: (f ? f.y : o.y) + 0.5, d: () => tentacle(g, o, F) }); }
    else if (o.kind === 'beam') out.push({ y: Math.max(o.y, o.y2) + 1, d: () => beam(g, o, v.t) });
  }
  out.push(...moveThings(F, v, g));
  things3(v, g, out);   // (the 3D bits, y-sorted with the fighters: art/prop3d.js)
  for (const o of F.objs || []) { const A = F.f[o.owner] && ART[F.f[o.owner].id]; if (A && A.things) A.things(F, v, g, o, out); }   // (the plug-in fighters' standing things)
  return out;
}
// Docky's container: a small shipping container in a muted Docker blue, drawn like the arenas' crates (art/arena-mat.js
// shadeBox: its top lit from the top left, its front in shade, a soft contact shadow), a few soft ribs down its front
// and across its top. A falling one is the same lifted by z; a vanishing one sinks into a puff
const CONTAINER = mat('#3d8fce');
function container(g, o) {
  const w = o.w, h = o.h, H = 24, left = (o.life || 5) - (o.t || 0), fade = clamp(left / 0.3, 0, 1), lift = o.z || 0, M = CONTAINER;
  if (fade <= 0.01) return;
  g.save(); g.translate(o.x, o.y - lift); g.globalAlpha *= fade;
  const x0 = -w / 2, y0 = -h / 2, top = y0 - H, fy = y0 + h - H;
  if (!lift) aoBlob(g, 2, h / 2 - 1, w * 0.62, 5, M.ao, 0.3);   // contact shade
  shadeBox(g, x0, y0, w, h, H, M, { r: 2.5 });
  for (let k = 1; k < 6; k++) {   // the ribs: soft tone, lit on their left
    const x = x0 + k * w / 6;
    g.fillStyle = rgba(255, 255, 255, 0.1); g.fillRect(x - 1.6, fy + 3, 1.4, H - 6);
    g.fillStyle = `rgba(${M.ao},0.14)`; g.fillRect(x, fy + 3, 1.6, H - 6);
    g.fillStyle = `rgba(${M.ao},0.08)`; g.fillRect(x, top + 3, 1.4, h - 6);
  }
  g.restore();
}
// a goroutine: a little gopher (the 3D model, small) scampering, bobbing as it runs
function goroutine(g, o, v, F) {
  const own = F.f[o.owner], ch = charOf(own ? own.id : 'gopher'), t = v.t + (o.id || 0) * 0.37;
  shadow(g, o.x, o.y, 0, 7);
  g.save(); g.translate(o.x, o.y - Math.abs(Math.sin(t * 16)) * 2.5);
  model(g, ch, { t, scale: SCALE * 0.38, smooth: true, yaw: Math.atan2(o.vy || 0, o.vx || 1), lean: Math.sin(t * 16) * 0.12, mood: o.hit ? 'happy' : null, pose: M3.walkPose ? M3.walkPose(t * 3.4) : 'stand', shadow: false, fight: true });
  g.restore();
}
// Octo's tentacle: from his side out along its angle, a tapered dark arm with a gentle wave in it, pale suckers along
// its underside, its tip curling; it rises from his body's height to the target's
function tentacle(g, o, F) {
  const f = F.f[o.owner]; if (!f || !(o.len > 2)) return;
  const L = o.len, a = o.a, c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c, n = 14, seed = (o.id || 1) * 1.3, h0 = 22, h1 = 18;
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const u = k / n, wav = Math.sin(u * 5 + (o.t || 0) * 18 + seed) * 4 * Math.sin(u * Math.PI), d = f.r * 0.6 + (L - f.r * 0.6) * u;
    pts.push([f.x + c * d + nx * wav, f.y + s * d * 1 + ny * wav - lerp(h0, h1, u) - (f.z || 0) * (1 - u)]);
  }
  const W = k => 5.2 * (1 - k / n * 0.72);
  // the arm: an outline of the tapering tube, dark on top, a little lighter underneath
  const side = sgn => pts.map(([x, y], k) => [x + nx * W(k) * sgn, y + ny * W(k) * sgn * 0.7]);
  const A = side(1), B = side(-1).reverse();
  const body = () => { g.beginPath(); A.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); const [tx, ty] = pts[n]; g.quadraticCurveTo(tx + c * 4, ty + s * 4, B[0][0], B[0][1]); B.forEach(([x, y]) => g.lineTo(x, y)); g.closePath(); };
  g.fillStyle = 'rgba(20,16,42,0.18)'; g.save(); g.translate(3, 16); body(); g.fill(); g.restore();   // its shadow on the floor
  const gr = g.createLinearGradient(pts[0][0] + nx * 6, pts[0][1] + ny * 6, pts[0][0] - nx * 6, pts[0][1] - ny * 6);
  gr.addColorStop(0, '#4a4f5a'); gr.addColorStop(0.5, '#2d3139'); gr.addColorStop(1, '#16191f');
  g.fillStyle = gr; body(); g.fill();
  // a soft highlight along its top
  g.strokeStyle = 'rgba(255,255,255,0.2)'; g.lineWidth = 1.4; g.lineCap = 'round'; g.beginPath(); A.slice(1, n - 2).forEach(([x, y], k) => k ? g.lineTo(x - nx, y - ny) : g.moveTo(x - nx, y - ny)); g.stroke();
  // the suckers along the underside
  for (let k = 2; k < n - 1; k += 2) { const [x, y] = pts[k], r = W(k) * 0.42; g.fillStyle = '#e9c9b9'; g.beginPath(); g.ellipse(x - nx * W(k) * 0.45, y - ny * W(k) * 0.3 + 1, r, r * 0.7, a, 0, TAU); g.fill(); g.fillStyle = 'rgba(120,70,60,0.5)'; g.beginPath(); g.arc(x - nx * W(k) * 0.45, y - ny * W(k) * 0.3 + 1, r * 0.35, 0, TAU); g.fill(); }
}
// Bugdroid's zap: a jagged arc from his antennae to where it stops (or to them), crackling anew every frame or two,
// with a bright fork or two off it, fading out over its last frames
function beam(g, o, t) {
  const age = o.t || 0, life = o.life || 0.2, a = clamp(1 - (age - life * 0.5) / (life * 0.5), 0, 1), tick = Math.floor(t * 30);
  const x0 = o.x, y0 = o.y - 40, x1 = o.x2, y1 = o.y2 - 24;
  arc(g, x0, y0, x1, y1, 9, 7, tick * 3.1 + (o.id || 0), a, 1.2);
  for (let k = 0; k < 2; k++) { const u = 0.35 + 0.3 * k + 0.1 * hsh(tick + k), x = lerp(x0, x1, u), y = lerp(y0, y1, u), b = Math.atan2(y1 - y0, x1 - x0) + (k ? 0.9 : -0.9); arc(g, x, y, x + Math.cos(b) * 12, y + Math.sin(b) * 12, 3, 3, tick * 7 + k, a * 0.7, 0.7); }
  if (o.hit) { const fl = g.createRadialGradient(x1, y1, 0, x1, y1, 12); fl.addColorStop(0, rgba(240, 255, 245, 0.8 * a)); fl.addColorStop(1, rgba(150, 255, 200, 0)); g.fillStyle = fl; g.beginPath(); g.arc(x1, y1, 12, 0, TAU); g.fill(); }
}

// ---------------------------------------------------------------- round a fighter
// before the model (at the fighter's feet, not lifted): Gopher's mound, antigravity's lift, a dive's streaks
export function kitBehind(g, F, v, f) {
  const mh = moveBehind(g, F, v, f); if (mh) return mh;
  for (const A of artsIn(F)) if (A.behind && A.behind(g, F, v, f) === 'hide') return 'hide';   // (the plug-in fighters')
  if (f.under) { mound(g, f, v); return 'hide'; }
  if (f.state === 'float') lifted(g, f, v.t);
  const mv = f.move && f.stats.moves[f.move];
  if (f.state === 'strike' && mv && (mv.do === 'dive' || mv.do === 'chain') && Math.hypot(f.vx, f.vy) > 200) streaks(g, f);
  if (f.state === 'strike' && mv && mv.do === 'spin') smear(g, f, v.t);
  return null;
}
// Gopher underground: a hump of fresh earth moving along, crumbs tumbling off its front, a furrow of loose earth behind
function mound(g, f, v) {
  const t = v.t, sp = Math.hypot(f.vx, f.vy), c = Math.cos(f.face), s = Math.sin(f.face);
  // the furrow: a few soft dark patches back along where he came
  const T = v.furrow[f.i] || (v.furrow[f.i] = []);
  const last = T[T.length - 1]; if (!last || Math.hypot(last[0] - f.x, last[1] - f.y) > 6) { T.push([f.x, f.y, v.t]); if (T.length > 26) T.shift(); }
  for (const [x, y, at] of T) { const k = clamp((v.t - at) / 1.2, 0, 1); if (k >= 1) continue; g.fillStyle = `rgba(92,62,36,${(0.32 * (1 - k)).toFixed(3)})`; g.beginPath(); g.ellipse(x, y, 9 * (1 - k * 0.3), 4.5 * (1 - k * 0.3), f.face, 0, TAU); g.fill(); }
  // the mound
  const bob = Math.sin(t * 22) * 1.2;
  g.save(); g.translate(f.x, f.y);
  g.fillStyle = 'rgba(20,16,42,0.22)'; g.beginPath(); g.ellipse(2, 2, 17, 7, 0, 0, TAU); g.fill();
  const mg = g.createRadialGradient(-5, -9 + bob, 1, 0, -3, 18);
  mg.addColorStop(0, '#b98a5a'); mg.addColorStop(0.55, '#8c6038'); mg.addColorStop(1, '#5e3e22');
  g.fillStyle = mg; g.beginPath(); g.moveTo(-17, 2); g.bezierCurveTo(-14, -9 + bob, -5, -13 + bob, 2, -12 + bob); g.bezierCurveTo(10, -11 + bob, 16, -5, 17, 2); g.quadraticCurveTo(0, 6, -17, 2); g.fill();
  // clods on it, lit from the top left
  for (let k = 0; k < 6; k++) { const x = -11 + k * 4.4 + Math.sin(k * 2.1) * 2, y = -4 - Math.sin((k + 0.5) / 6 * Math.PI) * 7 + bob, r = 1.6 + hsh(k) * 1.4; g.fillStyle = '#6b4728'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,230,190,0.35)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.35, r * 0.45, 0, TAU); g.fill(); }
  g.restore();
  // crumbs spilling off its front as it goes
  if (sp > 60 && v.fx.length < 130 && frnd(0, 1) < 0.5) v.fx.push({ k: 'clod', x: f.x + c * 14, y: f.y + s * 6, z: 4, vx: c * frnd(20, 60) + frnd(-30, 30), vy: s * frnd(10, 30) + frnd(-15, 15), vz: frnd(60, 130), t: 0, life: 0.5, s: frnd(1.4, 2.4), a: frnd(0, TAU) });
}
// antigravity: whoever floats has a soft column of rising light under them and little motes drifting up through it
function lifted(g, f, t) {
  const z = f.z || 0, h = z + 30;
  const cg = g.createLinearGradient(0, f.y, 0, f.y - h);
  cg.addColorStop(0, 'rgba(255,248,220,0.22)'); cg.addColorStop(1, 'rgba(255,248,220,0)');
  g.fillStyle = cg; g.beginPath(); g.moveTo(f.x - 14, f.y); g.lineTo(f.x - 9, f.y - h); g.lineTo(f.x + 9, f.y - h); g.lineTo(f.x + 14, f.y); g.closePath(); g.fill();
  for (let k = 0; k < 6; k++) {
    const ph = (t * 0.9 + k / 6) % 1, x = f.x + Math.sin(k * 2.7 + t * 2) * 8, y = f.y - ph * h, al = Math.sin(ph * Math.PI) * 0.8;
    g.fillStyle = `rgba(255,252,236,${al.toFixed(3)})`; g.beginPath(); g.arc(x, y, 1.4, 0, TAU); g.fill();
  }
}
// a dive: a few feathery orange-and-white streaks trailing off her
function streaks(g, f) {
  const sp = Math.hypot(f.vx, f.vy), ux = f.vx / sp, uy = f.vy / sp, z = f.z || 0;
  g.lineCap = 'round';
  for (let k = 0; k < 5; k++) {
    const off = (k - 2) * 5, x = f.x - uy * off, y = f.y - z - 20 + ux * off * 0.6, L = 26 + (k % 2) * 12 - Math.abs(k - 2) * 5;
    const gr = g.createLinearGradient(x, y, x - ux * L, y - uy * L);
    gr.addColorStop(0, k % 2 ? 'rgba(255,255,255,0.6)' : 'rgba(255,170,120,0.55)'); gr.addColorStop(1, 'rgba(255,200,160,0)');
    g.strokeStyle = gr; g.lineWidth = 3 - Math.abs(k - 2) * 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x - ux * L, y - uy * L); g.stroke();
  }
}
// Merge Conflict: dark motion-blurred sweeps of his arms round him, tapered like the arms are, and ink flicking off them
function smear(g, f, t) {
  const cx = f.x, cy = f.y - 16, R = f.r + 12;
  g.lineCap = 'round';
  for (let k = 0; k < 4; k++) {   // (overlapping arcs, each a little shorter: thick and dark at the arm, thinning and fading behind it)
    const a0 = t * 16 + k * TAU / 4, len = 1.3;
    for (let j = 1; j <= 6; j++) {
      g.strokeStyle = 'rgba(30,34,42,0.1)'; g.lineWidth = 1.5 + j * 0.9;
      g.beginPath(); g.arc(cx, cy, R, a0 - len * j / 6, a0); g.stroke();
    }
    g.fillStyle = 'rgba(40,44,52,0.55)'; g.beginPath(); g.arc(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R, 3.4, 0, TAU); g.fill();   // (the arm's tip)
  }
}
// after the model: Pyth's coils round who he holds, Ownership's padlock, a stun's crackle, Docky's Isolation
export function kitOver(g, F, v, f) {
  moveOver(g, F, v, f);
  for (const A of artsIn(F)) if (A.over) A.over(g, F, v, f);   // (the plug-in fighters')
  const H = F.f[f.hold];
  if (f.state === 'grabbed' && H && H.state === 'grab' && H.thr === 'special') coils(g, f, v.t, H);
  if (f.lockT > 0 && !f.stats.kit3) padlock(g, f, v.t);   // (a three-move fighter locked: the locker's art draws it)
  if (f.state === 'dizzy' && v.zapT[f.i] > v.t - (f.dur || 0) - 0.05) {   // (stunned by a zap or the field: little arcs crawl over them)
    const tick = Math.floor(v.t * 20);
    for (let k = 0; k < 2; k++) { const a = hsh(tick + k * 5) * TAU, r = 14, x = Math.cos(a) * r, y = -24 + Math.sin(a) * r * 0.9; arc(g, x, y, x + Math.cos(a + 1.8) * 14, y + Math.sin(a + 1.8) * 12, 4, 3, tick * 3 + k, 0.8, 0.8); }
  }
}
// the coils: three bands of snake wrapped round them, Python blue with the yellow belly, the back halves drawn darker
// first then the front halves over them; they tighten as the squeeze goes on
function coils(g, f, t, H) {
  const k = clamp(H.t / 0.22, 0, 1), squeeze = 1 + 0.06 * Math.sin(t * 18) * k;
  g.save(); g.lineCap = 'round';
  for (let b = 0; b < 3; b++) {
    const y = -12 - b * 11, rx = (f.r + 7 - b * 1.5) * (1.25 - 0.25 * k) / squeeze, ry = 5.5;
    g.strokeStyle = '#25507d'; g.lineWidth = 6; g.beginPath(); g.ellipse(0, y, rx, ry, 0, Math.PI, TAU); g.stroke();   // the back
  }
  for (let b = 0; b < 3; b++) {
    const y = -12 - b * 11, rx = (f.r + 7 - b * 1.5) * (1.25 - 0.25 * k) / squeeze, ry = 5.5;
    g.strokeStyle = '#3776ab'; g.lineWidth = 6.5; g.beginPath(); g.ellipse(0, y, rx, ry, 0, 0, Math.PI); g.stroke();
    g.strokeStyle = '#ffd43b'; g.lineWidth = 2.2; g.beginPath(); g.ellipse(0, y + 2, rx * 0.96, ry * 0.9, 0, 0.3, Math.PI - 0.3); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(-1, y - 1.5, rx * 0.9, ry * 0.8, 0, 0.5, 1.6); g.stroke();
  }
  g.restore();
}
// Ownership's padlock over their head: a small brass lock on a short chain, swinging a little; it fades in its last second
function padlock(g, f, t) {
  const a = clamp(f.lockT / 0.6, 0, 1), sw = Math.sin(t * 3) * 0.15, y = -72;
  g.save(); g.translate(0, y); g.rotate(sw); g.globalAlpha *= a;
  g.strokeStyle = '#c9cbd1'; g.lineWidth = 2.6; g.beginPath(); g.arc(0, -5, 4.6, Math.PI, TAU); g.lineTo(4.6, -1); g.moveTo(-4.6, -5); g.lineTo(-4.6, -1); g.stroke();
  const bg = g.createLinearGradient(-6, 0, 6, 8); bg.addColorStop(0, '#ffe08a'); bg.addColorStop(0.5, '#e8b23c'); bg.addColorStop(1, '#a8741a');
  g.fillStyle = bg; g.beginPath(); g.roundRect(-6.5, -2, 13, 10, 2.5); g.fill();
  g.fillStyle = '#5a3a0a'; g.beginPath(); g.arc(0, 2.4, 1.6, 0, TAU); g.fill(); g.fillRect(-0.6, 2.4, 1.2, 3);
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(-5.5, -1, 4, 1.2);
  g.restore();
}
// tints on the model (tinted() in draw-fight.js): Ferris in his stance gets a warm rust sheen pulsing over his shell;
// a counter flares it; Docky's Isolation soaking a hit runs a cool blue band over him
export function kitTint(F, v, f) {
  for (const A of artsIn(F)) { const c = A.tint && A.tint(F, v, f); if (c) return c; }   // (the plug-in fighters')
  const mv = f.move && f.stats.moves[f.move];
  if (f.state === 'strike' && mv && mv.do === 'counter') {
    const p = 0.5 + 0.5 * Math.sin(v.t * 14);
    return `rgba(255,150,70,${(0.14 + 0.1 * p).toFixed(3)})`;
  }
  const ca = v.t - (v.ctr[f.i] ?? -9); if (ca >= 0 && ca < 0.3) return `rgba(255,200,140,${(0.4 * (1 - ca / 0.3)).toFixed(3)})`;
  const ia = v.t - (v.iso[f.i] ?? -9); if (ia >= 0 && ia < 0.5) return `rgba(110,190,255,${(0.42 * (1 - ia / 0.5)).toFixed(3)})`;
  return null;
}

// ---------------------------------------------------------------- the new particle kinds
export function kitFx(g, F, v, p, k, dt) {
  if (p.k === 'p3') { step3(p, dt); return true; }   // (a 3D bit: drawn among the fighters, things3)
  if (moveFx(g, F, v, p, k, dt)) return true;
  for (const A of ARTS) if (A.fx && A.fx(g, F, v, p, k, dt)) return true;   // (the plug-in fighters' particle kinds)
  switch (p.k) {
    case 'clod': {   // a clod of earth: up, tumbling, down onto the floor
      p.vz -= 900 * dt; p.z = Math.max(0, p.z + p.vz * dt);
      g.save(); g.translate(p.x, p.y - p.z); g.rotate(p.a + p.t * 8); g.globalAlpha *= 1 - k * k;
      g.fillStyle = '#7a5230'; g.beginPath(); g.moveTo(-p.s, -p.s * 0.5); g.lineTo(p.s * 0.8, -p.s * 0.8); g.lineTo(p.s, p.s * 0.6); g.lineTo(-p.s * 0.6, p.s * 0.7); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,225,180,0.35)'; g.beginPath(); g.moveTo(-p.s, -p.s * 0.5); g.lineTo(p.s * 0.8, -p.s * 0.8); g.lineTo(0, 0); g.closePath(); g.fill();
      g.restore(); return true;
    }
    case 'hole': {   // the hole he popped out of: dark earth round a darker middle, closing up
      const s = p.s * (1 - k * 0.5), a = 1 - k;
      g.fillStyle = `rgba(110,74,42,${(0.6 * a).toFixed(3)})`; g.beginPath(); g.ellipse(p.x, p.y, s * 1.3, s * 0.6, 0, 0, TAU); g.fill();
      g.fillStyle = `rgba(40,24,12,${(0.7 * a).toFixed(3)})`; g.beginPath(); g.ellipse(p.x, p.y + 0.5, s * 0.75, s * 0.33, 0, 0, TAU); g.fill();
      return true;
    }
    case 'mote': {   // a little rising mote of light (healing, antigravity)
      g.fillStyle = `rgba(${p.col || '220,255,225'},${(Math.sin(k * Math.PI) * 0.85).toFixed(3)})`; g.beginPath(); g.arc(p.x, p.y, p.s * (1 - k * 0.4), 0, TAU); g.fill(); return true;
    }
    case 'chain': {   // Ownership's chain flying out to them
      const A = F.f[p.i], B = F.f[p.to]; if (!A || !B) return true;
      const u = clamp(k / 0.6, 0, 1), x0 = A.x, y0 = A.y - 30, x1 = lerp(x0, B.x, u), y1 = lerp(y0, B.y - 60, u), n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 7)), a = Math.atan2(y1 - y0, x1 - x0);
      g.save(); g.globalAlpha *= 1 - Math.max(0, (k - 0.7) / 0.3);
      for (let j = 0; j < n; j++) { const q = j / n, x = lerp(x0, x1, q), y = lerp(y0, y1, q) - Math.sin(q * Math.PI) * 14 * (1 - u * 0.5); g.strokeStyle = '#c9cbd1'; g.lineWidth = 1.8; g.beginPath(); g.ellipse(x, y, 3.4, 2, a + (j % 2 ? Math.PI / 2 : 0), 0, TAU); g.stroke(); }
      g.restore(); return true;
    }
    case 'lash': {   // the coil lashing out to them: a blue snake body flicking out and back
      const A = F.f[p.i]; if (!A) return true;
      const u = Math.sin(clamp(k, 0, 1) * Math.PI), x0 = A.x, y0 = A.y - 16, x1 = lerp(x0, p.x, u), y1 = lerp(y0, p.y - 18, u);
      g.lineCap = 'round'; g.strokeStyle = '#3776ab'; g.lineWidth = 6; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 - 12, x1, y1); g.stroke();
      g.strokeStyle = '#ffd43b'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0 + 1.5); g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 - 10.5, x1, y1 + 1.5); g.stroke();
      return true;
    }
    case 'ghost': {   // the blink's afterimage: him, pale and cold, fading where he was
      const ch = charOf(p.id);
      g.save(); g.translate(p.x, p.y); g.globalAlpha *= 0.55 * (1 - k);
      tinted(g, gg => model(gg, ch, { t: v.t, scale: SCALE, smooth: true, yaw: p.face + 0.35 * Math.sin(Math.PI / 2 - p.face), mood: null, pose: 'scurry', shadow: false, fight: true }), ['rgba(150,190,255,0.55)']);
      g.restore(); return true;
    }
    case 'pointer': {   // a pointer: a dotted line from where he was to where he is, an arrowhead at the end
      const a = 1 - k, x0 = p.x, y0 = p.y - 20, x1 = p.x2, y1 = p.y2 - 20, L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L, n = Math.floor(L / 7);
      g.fillStyle = `rgba(150,200,255,${(0.85 * a).toFixed(3)})`;
      for (let j = 1; j < n; j++) { const q = j / n; if (q > 0.15 + k * 1.2) { g.beginPath(); g.arc(x0 + ux * L * q, y0 + uy * L * q, 1.6, 0, TAU); g.fill(); } }
      g.save(); g.translate(x1, y1); g.rotate(Math.atan2(uy, ux)); g.fillStyle = `rgba(230,242,255,${(0.95 * a).toFixed(3)})`; g.beginPath(); g.moveTo(4, 0); g.lineTo(-6, -5); g.lineTo(-4, 0); g.lineTo(-6, 5); g.closePath(); g.fill(); g.restore();
      return true;
    }
    case 'glitch': {   // a segfault: little blocks of them jumping out of place in split colours, flickering
      const f = F.f[p.i]; if (!f) return true;
      const tick = Math.floor(v.t * 24), a = (1 - k) * p.s;
      for (let j = 0; j < 6; j++) {
        if (hsh(tick * 1.3 + j + p.seed) < 0.35) continue;
        const x = f.x + (hsh(j * 3 + tick + p.seed) - 0.5) * 34, y = f.y - (f.z || 0) - 8 - hsh(j * 5 + tick) * 44, w = 4 + hsh(j + tick * 2) * 10, h = 2 + hsh(j * 7 + tick) * 4;
        g.fillStyle = `rgba(255,70,120,${(0.5 * a).toFixed(3)})`; g.fillRect(x - 1.5, y, w, h);
        g.fillStyle = `rgba(70,220,255,${(0.5 * a).toFixed(3)})`; g.fillRect(x + 1.5, y, w, h);
        g.fillStyle = `rgba(255,255,255,${(0.55 * a).toFixed(3)})`; g.fillRect(x, y, w, h * 0.5);
      }
      return true;
    }
    case 'smoke': {   // a stack overflow's smoke: grey puffs billowing up
      const r = p.s * (0.6 + k * 1.3), al = 0.45 * (1 - k) * clamp(k / 0.1, 0, 1), gr = g.createRadialGradient(p.x - r * 0.3, p.y - r * 0.35, 0, p.x, p.y, r);
      gr.addColorStop(0, `rgba(205,200,198,${al.toFixed(3)})`); gr.addColorStop(0.7, `rgba(150,146,150,${(al * 0.6).toFixed(3)})`); gr.addColorStop(1, 'rgba(150,146,150,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.fill(); return true;
    }
    case 'spark2': {   // an electric spark: a short green-white streak
      const sp = Math.hypot(p.vx, p.vy) || 1, L = p.s * (1 - k * 0.5);
      g.strokeStyle = `rgba(200,255,220,${(1 - k).toFixed(3)})`; g.lineWidth = 1.6 * (1 - k) + 0.4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(p.x - p.vx / sp * L, p.y - p.vy / sp * L); g.lineTo(p.x, p.y); g.stroke(); return true;
    }
    case 'crackle': {   // the field's jolt: arcs crawling over them
      const f = F.f[p.i]; if (!f) return true;
      const tick = Math.floor(v.t * 20), a = 1 - k;
      for (let j = 0; j < 3; j++) { const an = hsh(tick + j * 9) * TAU, x = f.x + Math.cos(an) * 12, y = f.y - (f.z || 0) - 22 + Math.sin(an) * 12; arc(g, x, y, x + Math.cos(an + 2) * 16, y + Math.sin(an + 2) * 14, 4, 4, tick * 5 + j, a, 0.9); }
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- icons (the keys' corner icons, the feed)
export function kitIcon(g, kind, r, col) {
  if (moveIcon(g, kind, r, col)) return true;
  for (const A of ARTS) if (A.icon && A.icon(g, kind, r, col)) return true;   // (the plug-in fighters' icons)
  const Wt = col || '#ffffff';
  g.fillStyle = Wt; g.strokeStyle = Wt;
  switch (kind) {
    case 'dig':   // a mound with clods flying off it
      g.beginPath(); g.moveTo(-r * 0.8, r * 0.45); g.quadraticCurveTo(0, -r * 0.35, r * 0.8, r * 0.45); g.closePath(); g.fill();
      for (const [x, y, s] of [[-r * 0.35, -r * 0.45, 0.14], [r * 0.1, -r * 0.7, 0.12], [r * 0.5, -r * 0.4, 0.13]]) { g.beginPath(); g.arc(x, y, r * s, 0, TAU); g.fill(); }
      return true;
    case 'counter':   // a crab claw, open
      g.lineWidth = r * 0.2; g.beginPath(); g.arc(0, r * 0.05, r * 0.5, Math.PI * 0.95, Math.PI * 1.9); g.stroke();
      g.beginPath(); g.arc(r * 0.05, r * 0.15, r * 0.36, Math.PI * 0.1, Math.PI * 0.75); g.stroke();
      g.beginPath(); g.moveTo(-r * 0.3, r * 0.4); g.lineTo(-r * 0.6, r * 0.8); g.stroke();
      return true;
    case 'coil':   // a spiral
      g.lineWidth = r * 0.17; g.beginPath(); for (let k = 0; k <= 30; k++) { const a = k / 30 * TAU * 1.6, q = r * (0.12 + 0.55 * k / 30); g.lineTo(Math.cos(a) * q, Math.sin(a) * q); } g.stroke();
      return true;
    case 'tentacle':   // a tentacle curling at its tip
      g.lineWidth = r * 0.22; g.beginPath(); g.moveTo(-r * 0.7, r * 0.6); g.quadraticCurveTo(-r * 0.2, -r * 0.1, r * 0.35, -r * 0.2); g.stroke();
      g.lineWidth = r * 0.14; g.beginPath(); g.arc(r * 0.35, r * 0.05, r * 0.25, -Math.PI / 2, Math.PI * 0.8); g.stroke();
      return true;
    case 'crate':   // a container, ribs on its side
      g.beginPath(); g.roundRect(-r * 0.75, -r * 0.45, r * 1.5, r * 0.9, r * 0.1); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.35)'; for (let k = 0; k < 5; k++) g.fillRect(-r * 0.58 + k * r * 0.28, -r * 0.3, r * 0.07, r * 0.6);
      return true;
    case 'dive':   // a swooping arrow down
      g.lineWidth = r * 0.2; g.beginPath(); g.moveTo(-r * 0.7, -r * 0.6); g.quadraticCurveTo(-r * 0.1, r * 0.5, r * 0.55, r * 0.3); g.stroke();
      g.beginPath(); g.moveTo(r * 0.8, r * 0.25); g.lineTo(r * 0.35, -r * 0.05); g.lineTo(r * 0.4, r * 0.6); g.closePath(); g.fill();
      return true;
    case 'pointer':   // a mouse pointer
      g.beginPath(); g.moveTo(-r * 0.4, -r * 0.75); g.lineTo(-r * 0.4, r * 0.45); g.lineTo(-r * 0.1, r * 0.15); g.lineTo(r * 0.12, r * 0.7); g.lineTo(r * 0.32, r * 0.6); g.lineTo(r * 0.1, r * 0.08); g.lineTo(r * 0.5, r * 0.05); g.closePath(); g.fill();
      return true;
    case 'zap':   // an antenna with a zigzag off it
      g.lineWidth = r * 0.14; g.beginPath(); g.moveTo(-r * 0.55, r * 0.7); g.lineTo(-r * 0.3, r * 0.05); g.stroke();
      g.beginPath(); g.arc(-r * 0.3, 0, r * 0.12, 0, TAU); g.fill();
      g.lineWidth = r * 0.16; g.beginPath(); g.moveTo(-r * 0.1, -r * 0.15); g.lineTo(r * 0.15, -r * 0.45); g.lineTo(r * 0.25, -r * 0.1); g.lineTo(r * 0.55, -r * 0.5); g.stroke();
      return true;
    case 'own':   // a padlock
      g.lineWidth = r * 0.16; g.beginPath(); g.arc(0, -r * 0.15, r * 0.32, Math.PI, TAU); g.stroke();
      g.beginPath(); g.roundRect(-r * 0.5, -r * 0.15, r, r * 0.75, r * 0.12); g.fill();
      return true;
    case 'ub':   // a broken square, its pieces knocked out of place
      g.beginPath(); g.rect(-r * 0.6, -r * 0.6, r * 0.55, r * 0.55); g.rect(r * 0.08, -r * 0.5, r * 0.5, r * 0.5); g.rect(-r * 0.5, r * 0.08, r * 0.5, r * 0.5); g.fill();
      g.globalAlpha *= 0.5; g.beginPath(); g.rect(r * 0.12, r * 0.15, r * 0.5, r * 0.5); g.fill();
      return true;
  }
  return false;
}
