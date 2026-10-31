// Kernel Kart: drawing Duke's three moves and his evade (sim: js/kits/duke.js, docs/fight-frames.md; Tux's are in
// js/art/kit-tux.js). Cosmetic only, hooked in by draw-kits.js. Every tell must read on every arena but as part of the
// world, not a sign (the user): soft shadows, ripples and stains, no outlines, no player colours on the floor, a light
// part paired with a soft dark one so it reads on pale and dark floors; kept a notch calm. 3D set pieces and bits come
// from art/prop3d.js, the 2D looks stand in until baked. Each move has a tell, a prop, a build-up, payoff and aftermath.
// Shakes only on the boil-over and Hot Java's eruption, softly (plus a camera nudge, v.punch).
//   moveAnim     a move as a short run of poses from f.ph / f.pht (squash, hop, spin, lean, anticipation and settle)
//   hitAnim / poseFade   Tux's and Duke's hit reactions, and the ~0.09 s pose crossfade
//   moveGround   floor: Stop the World's ripple, Hot Java's brewing stain and coffee puddles
//   moveThings   among the fighters: Hot Java's eruption column
//   moveBehind   hidden while Duke is gone; HotSpot's steam off his fists
//   moveOver     the pocket watch tell, the snap's spark, HotSpot's fist heat, the pot riding someone, thaw cracks
//   moveEvent / moveFx / moveIcon   events' particles, their drawing, the moves' icons
import { PCOL, TAU, clamp, frnd } from './core.js';
import { BK, bold } from './look.js';
import { burst, puff, starPath } from './draw-fight.js';
import { FIGHTERS } from './fight-chars.js';
import { ART, settleAnim } from './art/kits.js';
import { bit3, bits3, decal3, drawProp3D, propReady, propsFor, release3 } from './art/prop3d.js';
import { softShadow } from './art/arena-mat.js';
import { camYaw } from './art/model3d.js';

// the 3D set pieces, baked with each fight's fighters (art/prop3d.js); the 2D look stands in until made (or with no WebGL)
propsFor('duke', ['jabline', 'jabhot', 'watch', 'pot', 'gcol', 'froth', 'gsplash', 'puddle/coffee']);
const P3 = id => propReady(id);
const BITS_GC = ['bitO', 'bitB', 'bitW', 'bitG', 'paper'];

const hexA = (h, a) => { const n = parseInt(String(h).slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${clamp(a, 0, 1).toFixed(3)})`; };
const rgba = (r, g, b, a) => `rgba(${r},${g},${b},${clamp(a, 0, 1).toFixed(3)})`;
const hsh = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const backE = k => { k = clamp(k, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const ink = () => bold() ? BK.ink : '#141a2e';
const colOf = o => PCOL[o.owner ?? 0] || PCOL[0];
const JAVA_O = '#f89820', JAVA_B = '#5382a1';
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }
// soft round shape: radial gradient stops [at 0..1, 'r,g,b', alpha] filled over r
function softDisc(g, x, y, r, stops, r0 = 0) {
  if (r <= 0.5) return;
  const gr = g.createRadialGradient(x, y, Math.max(0, r0), x, y, r);
  for (const [at, c, a] of stops) gr.addColorStop(clamp(at, 0, 1), `rgba(${c},${clamp(a, 0, 1).toFixed(3)})`);
  g.fillStyle = gr; circle(g, x, y, r); g.fill();
}

// ---------------------------------------------------------------- a move's animation (fighter() in draw-fight.js)
// { sx, sy: squash/stretch, hop: up off the floor, spin: added yaw, lean (rad), fwd: along facing, wx: sideways wiggle
// on screen, alpha, s: size, mood } or null outside a move. k: s in the phase. Every pose change gets a little
// anticipation and a spring settle.
const spring = (k, w, d) => Math.exp(-k * d) * Math.cos(k * w);   // 1 at the start, wobbling to 0
const bump = u => Math.sin(Math.PI * clamp(u, 0, 1));   // 0 .. 1 .. 0
export function moveAnim(F, v, f) {
  const ph = f.ph; if (!ph) return null;
  if (ART[f.id] && ART[f.id].anim) return ART[f.id].anim(F, v, f);   // a plug-in fighter's own
  const k = f.pht || 0, t = v.t + f.i, A = { sx: 1, sy: 1, hop: 0, spin: 0, lean: 0, fwd: 0, wx: 0, alpha: 1, s: 1, mood: undefined };
  const sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
  const wind = f.state === 'wind' ? Math.max(0.05, f.dur || 0.3) : 0, u = wind ? clamp(k / wind, 0, 1) : 1;
  switch (ph) {
    // ---- Duke. The jab: each punch snaps harder the hotter he is (h: 0..1)
    case 'ready': { const h = hotOf(f); sq(0.035 * ease(k / 0.04)); A.fwd = -1 * ease(k / 0.04); A.wx = Math.sin(t * 70) * 0.35 * h; break; }   // a dip into his guard (hot: trembling)
    case 'jab1': case 'jab2': {   // a snap forward and a shudder (no lunge)
      const h = hotOf(f), boil = ph === 'jab2' && h >= 0.99;
      sq(-(0.05 + 0.03 * h + (boil ? 0.05 : 0)) * spring(k, 30, 14)); A.fwd = (2.5 + 1.5 * h + (boil ? 2 : 0)) * ease(k / 0.04); A.lean = (ph.endsWith('1') ? 0.03 : -0.03) * (1 + h) * spring(k, 20, 10);
      break;
    }
    case 'jabend': case 'jabmiss': {   // a calm settle, no stun look
      const J = FIGHTERS[f.id] && FIGHTERS[f.id].moves.move1, D = (J && (ph === 'jabend' ? J.recovery : J.miss)) || 0.2;
      Object.assign(A, settleAnim(k, D, 'jab2', D * 0.35)); A.fwd = 2 * ease(k / 0.08); break;
    }
    case 'raise': if (k < 0.06) sq(0.04 * ease(k / 0.06)); else sq(0.04 * (1 - ease((k - 0.06) / 0.08)) - 0.05 * ease((k - 0.06) / 0.1)); break;   // a dip, then up
    case 'snap': sq(-0.035 + 0.05 * spring(k, 24, 12)); A.wx = k < 0.1 ? Math.sin(k * 90) * 0.8 * (1 - k / 0.1) : 0; break;
    case 'stop': sq(-0.035 * Math.exp(-k * 8)); break;
    // Hot Java: wound up with the pot back over his shoulder, the slap thrown out and down, then a calm settle
    // (a miss: a moment longer, the pot gone)
    case 'potup': { const q = wind ? u : 1; sq(0.06 * ease(q / 0.6)); A.fwd = -2.5 * backE(q); A.lean = -0.07 * ease(q); A.wx = Math.sin(k * 60) * 0.4 * q; break; }
    case 'slap': sq(-0.07 * spring(k, 28, 12)); A.fwd = 4 * ease(k / 0.05); A.lean = 0.08 * spring(k, 18, 9); break;
    case 'slapped': case 'potmiss': {
      const P = FIGHTERS[f.id] && FIGHTERS[f.id].moves.move2, D = (P && (ph === 'slapped' ? P.recovery : P.miss)) || 0.3;
      Object.assign(A, settleAnim(k, D, 'slap', ph === 'slapped' ? 0.08 : 0.2)); A.fwd = 4 - 2.5 * ease(k / D); break;
    }
    // ---- the evades
    case 'blinkout': { const q = clamp(k / 0.06, 0, 1); A.s = 1 - 0.55 * q; A.alpha = 1 - q; sq(0.16 * q); break; }   // crumpling into bits
    case 'blinkin': { if (f.state === 'strike') { const q = clamp(k / 0.06, 0, 1); A.s = 0.5 + 0.5 * backE(q); A.alpha = q; } else sq(-0.07 * spring(k, 22, 12)); break; }   // back together, a little settle
  }
  return A;
}
// how hot Duke's jab is (0..1: f.hot over its max)
const hotOf = f => { const H = FIGHTERS[f.id] && FIGHTERS[f.id].moves.move1 && FIGHTERS[f.id].moves.move1.hot; return H ? clamp((f.hot || 0) / H.max, 0, 1) : 0; };
// Tux's and Duke's hit reactions outside a move: snap back and spring, stagger sway, a stretch getting up, a clunk on a
// freeze. null when there's nothing to add
export function hitAnim(F, v, f) {
  const st = f.state, k = f.t || 0;
  if (st !== 'hurt' && st !== 'stagger' && st !== 'getup' && st !== 'frozen') return null;
  const A = { sx: 1, sy: 1, hop: 0, spin: 0, lean: 0, fwd: 0, wx: 0, alpha: 1, s: 1, mood: undefined };
  const sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
  if (st === 'hurt') {
    const sp = Math.hypot(f.vx || 0, f.vy || 0), dir = sp > 20 ? Math.sign(f.vx || 0) : 0;
    sq(0.12 * spring(k, 20, 9)); A.lean = dir * 0.13 * spring(k, 14, 7); A.fwd = -2 * Math.exp(-k * 8);
  } else if (st === 'stagger') {
    A.lean = Math.sin(k * 6.5) * 0.09 * (0.6 + 0.4 * Math.exp(-k * 3)); sq(0.08 * spring(k, 18, 8) + 0.015 * Math.sin(k * 13));
  } else if (st === 'getup') {
    const q = clamp(k / (f.dur || 0.35), 0, 1); sq(q < 0.6 ? 0.05 * bump(q / 0.6) : -0.06 * bump((q - 0.6) / 0.4));
  } else if (st === 'frozen') sq(0.06 * spring(k, 30, 14));
  return A;
}
// pose crossfade: when Tux's or Duke's pose changes the old one fades out under the new over ~0.09 s (no pop). The walk
// and a freeze don't blend. Returns { pose, a } to draw first, or null
const BLEND = 0.08;
export function poseFade(v, f, pose) {
  const P = v.poseB || (v.poseB = [{ p: '', t: -9, q: '' }, { p: '', t: -9, q: '' }]), b = P[f.i] || (P[f.i] = { p: '', t: -9, q: '' });
  if (pose !== b.p) { b.q = b.p; b.p = pose; b.t = v.t; }
  const k = (v.t - b.t) / BLEND;
  if (k >= 1 || k < 0 || !b.q || f.state === 'frozen' || /^walk/.test(b.q) || /^walk/.test(pose) || b.q === 'stand' && pose === '') return null;
  return { pose: b.q, a: 0.45 * (1 - ease(k)) };
}

// ---------------------------------------------------------------- events
export function moveEvent(v, F, e, few) {
  const who = e.who ?? -1, f = F.f[who];
  switch (e.kind) {
    case 'tell': case 'stopmiss': return true;
    case 'blink': {   // Garbage Collect: breaks into recycled bits, a faint streak, back together where he lands
      if (e.move !== 'evade') return false;   // Cpp's Pointer: draw-kits.js
      const x2 = e.x2 ?? e.x, y2 = e.y2 ?? e.y, cols = [JAVA_O, JAVA_B, '#ffffff', '#3fd68b'], n1 = few ? 5 : 8, n2 = few ? 4 : 7;
      if (P3('bit:bitO')) {   // 3D: cubes and paper bursting off, others flying in where he lands
        for (let k = 0; k < n1 + 1; k++) { const a = k / (n1 + 1) * TAU + frnd(-0.3, 0.3), sp = frnd(60, 130); bit3(v, BITS_GC[k % 5], e.x, e.y, frnd(8, 44), { dx: Math.cos(a) * sp, dy: Math.sin(a) * sp * 0.7, dz: frnd(40, 150), s: frnd(2.2, 3.3), life: frnd(0.35, 0.55), g: 520, bo: 0.3, sp: frnd(-50, 50), few }); }
        for (let k = 0; k < n2; k++) { const a = k / n2 * TAU, r = frnd(22, 34); bit3(v, BITS_GC[(k + 2) % 5], x2 + Math.cos(a) * r, y2 + Math.sin(a) * r * 0.7, frnd(8, 46), { to: [x2, y2, 22], s: frnd(2.2, 3), life: 0.18, fade: 'none', sh: false, sp: 30, few }); }
        for (let k = 1; k <= (few ? 2 : 4); k++) { const u = k / 5; bit3(v, BITS_GC[k % 5], e.x + (x2 - e.x) * u, e.y + (y2 - e.y) * u, 22 + frnd(-8, 8), { dx: frnd(-15, 15), dy: frnd(-10, 10), dz: frnd(-10, 20), g: 0, drag: 3, s: frnd(1.4, 2), life: 0.16 + u * 0.12, fade: 'alpha', sh: false, sp: 40, few }); }   // a trail of crumbs
        return true;
      }
      for (let k = 0; k < n1; k++) { const a = k / n1 * TAU + frnd(-0.3, 0.3), sp = frnd(55, 110); v.fx.push({ k: 'bit', x: e.x, y: e.y - frnd(8, 40), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, t: 0, life: frnd(0.22, 0.34), s: frnd(2.2, 3.2), a: frnd(0, TAU), col: cols[k % 4] }); }
      for (let k = 0; k < n2; k++) { const a = k / n2 * TAU, r = frnd(18, 28); v.fx.push({ k: 'bitin', x: x2, y: y2 - 24, ox: Math.cos(a) * r, oy: Math.sin(a) * r * 0.8, t: 0, life: 0.16, s: frnd(2.2, 3), a: frnd(0, TAU), col: cols[k % 4] }); }
      v.fx.push({ k: 'gcstreak', x: e.x, y: e.y, x2, y2, t: 0, life: 0.22, s: 1 });
      return true;
    }
    // Duke's jabs: a 3D swoosh at fist height (cream with a Java-orange core; hot: fatter, red-orange, steaming); a
    // landed one kicks a puff off the foe (the hit burst is draw-fight's)
    case 'jab': {
      if (!f || f.id !== 'duke') return false;
      const a = e.a ?? f.face, h = clamp((e.hot || 0) / 3, 0, 1), hot = h > 0.4 && P3('jabhot');
      v.fx.push({ k: 'dswoosh', x: f.x, y: f.y, a, side: e.n === 2 ? 1 : -1, t: 0, life: 0.14 + 0.05 * h, s: 1, id: hot ? 'jabhot' : 'jabline' });
      return true;
    }
    // HotSpot heat up (hot: 1..3): coffee and steam off the fist, more the hotter; at 3 embers and a heat ring
    case 'heat': {
      if (!f || f.id !== 'duke') return true;
      const o = F.f[e.to], x = o ? o.x : e.x, y = o ? o.y : e.y, a = e.a ?? f.face, h = clamp((e.hot || 0) / 3, 0, 1);
      if (P3('bit:drop') && h > 0.3) bits3(v, 'drop', x - Math.cos(a) * 6, y - Math.sin(a) * 4, 26, few ? 1 : 1 + Math.round(3 * h), { dir: a, spread: 1.4, speed: [60, 120], up: [60, 140], s: [1.3, 2], life: [0.4, 0.6], bo: 0, few });
      if (P3('bit:steam')) bits3(v, 'steam', x - Math.cos(a) * 8, y, 30, few ? 1 : 1 + Math.round(2 * h), { r: 6, speed: [8, 20], up: [25, 55], g: -30, drag: 1.6, grow: 1.3, s: [2.4 + 2 * h, 3.4 + 2.4 * h], life: [0.4, 0.6], al: 0.6 + 0.3 * h, sh: false, few });
      if (h >= 0.99 && P3('bit:spark')) bits3(v, 'spark', x, y, 30, few ? 1 : 3, { dir: a, spread: 1.8, speed: [60, 130], up: [70, 150], s: [1.3, 2], life: [0.25, 0.4], few });
      if (h >= 0.66) v.fx.push({ k: 'popring', x, y, t: 0, life: 0.26, s: 16 + 8 * h, col: '#ffd7a8' });
      return true;
    }
    // boil-over (second jab at full heat): steam burst, coffee flung along the punch, flash, heat ring, camera nudge and
    // soft shake; his fists hiss steam as they cool
    case 'boil': {
      if (!f || f.id !== 'duke') return true;
      const o = F.f[e.to], x = o ? o.x : e.x, y = o ? o.y : e.y, a = e.a ?? f.face;
      if (P3('bit:steam')) {
        bits3(v, 'steam', x, y, 24, few ? 3 : 7, { r: 12, speed: [20, 60], up: [50, 110], g: -40, drag: 1.4, grow: 1.6, s: [5, 8], life: [0.7, 1.1], al: 0.85, sh: false, few });
        for (const [fx, fy, fz] of fistsAt(f)) bits3(v, 'steam', f.x + fx, f.y + fy, fz, few ? 1 : 2, { r: 3, speed: [6, 16], up: [30, 60], g: -50, drag: 1.6, grow: 1.4, s: [3, 4.6], life: [0.6, 0.9], al: 0.8, sh: false, few });
      }
      if (P3('bit:drop')) bits3(v, 'drop', x, y, 28, few ? 4 : 9, { dir: a, spread: 1.9, speed: [90, 190], up: [90, 220], s: [1.6, 2.6], life: [0.6, 0.9], bo: 0, few });
      if (P3('bit:spark')) bits3(v, 'spark', x, y, 28, few ? 2 : 4, { dir: a, spread: 1.6, speed: [90, 180], up: [80, 170], s: [1.8, 2.8], life: [0.3, 0.45], few });
      v.fx.push({ k: 'popring', x, y, t: 0, life: 0.36, s: 34, col: '#ffcf9a' }, { k: 'flash', x, y: y - 24, t: 0, life: 0.14, s: 26 });
      v.shake = Math.max(v.shake, 0.22);
      punch(v, x, y);
      return true;
    }
    // cooled off (a whiff with heat, or heat gone): the glow fizzles in a grey wisp, two drops
    case 'cool': {
      if (!f || f.id !== 'duke') return true;
      for (const [fx, fy, fz] of fistsAt(f)) {
        if (P3('bit:steam')) bit3(v, 'steam', f.x + fx, f.y + fy, fz, { dz: 22, g: -20, drag: 2, grow: 1.1, s: 2.6 + 2 * (e.power || 0), life: 0.5, al: 0.55, sh: false, few });
        if (P3('bit:drop')) bit3(v, 'drop', f.x + fx, f.y + fy, fz - 2, { dz: 10, s: 1.1, life: 0.45, bo: 0, few });
      }
      return true;
    }
    // Hot Java: slap (steam thread), stuck (clonk: steam, drops, glint, soft flash), missed (dropped: splash, puddle),
    // passed back (puff), boil-over (eruption: coffee, steam, flash, soft shake, nudge, puddle), gone with the round (puff)
    case 'potslap': {
      if (!f || f.id !== 'duke') return true;
      const a = e.a ?? f.face;
      if (P3('bit:steam')) bit3(v, 'steam', f.x + Math.cos(a) * 14, f.y + Math.sin(a) * 6, 38, { dx: Math.cos(a) * 40, dz: 20, g: -20, drag: 2, grow: 1.2, s: 3, life: 0.4, al: 0.7, sh: false, few });
      return true;
    }
    case 'potstick': {
      const o = F.f[e.to]; if (!o) return true;
      const x = o.x, y = o.y, z = potZ(o);
      if (P3('bit:steam')) bits3(v, 'steam', x, y, z + 10, few ? 2 : 4, { r: 6, speed: [10, 30], up: [20, 50], g: -30, drag: 1.6, grow: 1.4, s: [3, 4.6], life: [0.45, 0.7], al: 0.8, sh: false, few });
      if (P3('bit:drop')) bits3(v, 'drop', x, y, z + 4, few ? 2 : 5, { speed: [40, 90], up: [60, 130], s: [1.3, 2.1], life: [0.45, 0.65], bo: 0, few });
      if (P3('bit:glint')) bit3(v, 'glint', x + 6, y, z + 14, { g: 0, dz: 0, s: 2.8, life: 0.2, fade: 'alpha', sh: false, sp: 30, few });
      v.fx.push({ k: 'flash', x, y: y - z, t: 0, life: 0.1, s: 16 });
      return true;
    }
    case 'potmiss': {
      if (P3('bit:drop')) bits3(v, 'drop', e.x, e.y, 6, few ? 3 : 6, { speed: [40, 100], up: [80, 160], s: [1.4, 2.4], life: [0.45, 0.7], bo: 0, few });
      else v.fx.push({ k: 'splash', x: e.x, y: e.y, t: 0, life: 0.3, s: 12 });
      if (P3('bit:steam')) bits3(v, 'steam', e.x, e.y, 6, few ? 1 : 3, { r: 8, speed: [8, 20], up: [12, 30], g: -18, drag: 1.6, grow: 1.2, s: [3.4, 5], life: [0.5, 0.75], al: 0.7, sh: false, few });
      puff(v, e.x, e.y, 2, null);
      mark(v, { k: 'puddle', x: e.x, y: e.y, R: 20, life: 2.6, seed: frnd(0, 99) });
      return true;
    }
    case 'pothop': {
      const o = F.f[e.from]; if (!o) return true;
      if (P3('bit:steam')) bits3(v, 'steam', o.x, o.y, potZ(o) + 8, few ? 1 : 3, { r: 5, speed: [10, 30], up: [20, 40], g: -30, drag: 1.6, grow: 1.3, s: [3, 4.2], life: [0.4, 0.6], al: 0.75, sh: false, few });
      return true;
    }
    case 'erupt': {
      v.shake = Math.max(v.shake, 0.3);
      if (P3('bit:drop')) {
        bits3(v, 'drop', e.x, e.y, 30, few ? 6 : 14, { r: 8, speed: [30, 110], up: [160, 330], s: [2, 3.4], life: [0.7, 1.05], bo: 0, few });
        bits3(v, 'steam', e.x, e.y, 40, few ? 2 : 4, { r: 14, speed: [10, 30], up: [30, 60], g: -20, drag: 1.4, grow: 1.4, s: [5, 8], life: [0.9, 1.3], sh: false, few });
      } else {
        for (let k = 0; k < (few ? 5 : 9); k++) { const a = frnd(0, TAU), sp = frnd(25, 85); v.fx.push({ k: 'drop', x: e.x + Math.cos(a) * 7, y: e.y + Math.sin(a) * 5, z: frnd(16, 55), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: frnd(130, 250), t: 0, life: frnd(0.6, 0.95), s: frnd(1.8, 3) }); }
        for (let k = 0; k < (few ? 2 : 4); k++) { const a = frnd(0, TAU); v.fx.push({ k: 'steam', x: e.x + Math.cos(a) * 14, y: e.y - frnd(18, 55), vx: Math.cos(a) * 16, vy: -frnd(18, 38), t: 0, life: frnd(0.8, 1.2), s: frnd(8, 12) }); }
      }
      v.fx.push({ k: 'flash', x: e.x, y: e.y - 26, t: 0, life: 0.12, s: 20 }, { k: 'popring', x: e.x, y: e.y, t: 0, life: 0.34, s: 34, col: '#ffcf9a' });
      mark(v, { k: 'puddle', x: e.x, y: e.y, R: 34, life: 4, seed: frnd(0, 99), t1: 0.35 });
      punch(v, e.x, e.y);
      return true;
    }
    case 'potgone': if (P3('bit:steam')) bits3(v, 'steam', e.x, e.y, 56, few ? 1 : 2, { r: 5, speed: [6, 16], up: [20, 40], g: -30, drag: 1.6, grow: 1.3, s: [3, 4], life: [0.5, 0.7], al: 0.7, sh: false, few }); return true;
    case 'snap': {   // ripple lifting grey crystals that hang there, stopped (spark: moveOver)
      (v.snapT || (v.snapT = [-9, -9]))[who] = v.t;
      const M = f && FIGHTERS[f.id] && FIGHTERS[f.id].moves.move3, R = (M && M.R) || 105, grow = (M && M.grow) || 0.5;
      if (P3('bit:tshard')) for (let k = 0; k < (few ? 5 : 10); k++) { const a = k / (few ? 5 : 10) * TAU + frnd(-0.3, 0.3), d = R * Math.sqrt(frnd(0.08, 0.9)); bit3(v, 'tshard', e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 0, { hold: Infinity, rise: d / R * grow, zT: frnd(12, 56), s: frnd(3.8, 6.2), life: 6, sp: frnd(-6, 6), grp: 'tsw', few }); }
      return true;
    }
    case 'freeze': {   // caught: soft grey flash
      const o = F.f[e.to]; const x = o ? o.x : e.x, y = o ? o.y : e.y;
      v.fx.push({ k: 'flash', x, y: y - 26, t: 0, life: 0.2, s: 28, grey: 1 });
      if (P3('bit:tshard')) for (let k = 0; k < (few ? 2 : 4); k++) { const a = k / 4 * TAU + 0.4; bit3(v, 'tshard', x + Math.cos(a) * 22, y + Math.sin(a) * 10, frnd(10, 30), { hold: Infinity, rise: 0, zT: frnd(20, 60), s: frnd(3.6, 5.2), life: 6, sp: frnd(-6, 6), grp: 'tsw', few }); }   // a few hanging round them too
      return true;
    }
    case 'ringbreak': {   // Duke hit out of his snap: ripple breaks into flecks
      release3(v, 'tsw', 40);
      const rg = (F.objs || []).find(o => o.kind === 'ring' && o.owner === who), R = rg ? Math.max(20, rg.r) : 50, n = few ? 4 : 7;
      for (let k = 0; k < n; k++) { const a = k / n * TAU; shards(v, e.x + Math.cos(a) * R, e.y + Math.sin(a) * R, a, 0.4, 1, '#d4d8e2'); }
      return true;
    }
    case 'thaw': {   // statue cracks open: grey chips, soft white flash
      const x = f ? f.x : e.x, y = f ? f.y : e.y;
      release3(v, 'tsw', 70);
      if (P3('bit:stone')) { for (let k = 0; k < (few ? 4 : 7); k++) { const a = frnd(0, TAU), sp = frnd(50, 120); bit3(v, k % 3 ? 'stone' : 'tshard', x + Math.cos(a) * 8, y + Math.sin(a) * 5, frnd(10, 50), { dx: Math.cos(a) * sp, dy: Math.sin(a) * sp * 0.7, dz: frnd(60, 160), s: frnd(2.6, 4.4), life: frnd(0.7, 1.1), bo: 0.3, few }); } }
      else for (let k = 0; k < (few ? 4 : 6); k++) shards(v, x + frnd(-10, 10), y - frnd(10, 46), frnd(0, TAU), 0.3, 1, k % 2 ? '#c8ccd6' : '#ffffff');
      v.fx.push({ k: 'flash', x, y: y - 26, t: 0, life: 0.12, s: 22 });
      return true;
    }
  }
  return false;
}
// marks that outlast a move (v.tm, drawn by moveGround): Hot Java's coffee puddles
function mark(v, m) { const L = v.tm || (v.tm = []); m.t0 = v.t + (m.t1 || 0); L.push(m); if (L.length > 8) L.shift(); }
// a big hit: the camera punches in a touch (draw-fight.js camera)
function punch(v, x, y) { v.punch = { t: v.t, x, y }; }
function shards(v, x, y, a, spread, n, col) {
  for (let k = 0; k < n; k++) { const b = a + (n > 1 ? (k / (n - 1) - 0.5) : 0) * spread + frnd(-0.3, 0.3), sp = frnd(70, 160); v.fx.push({ k: 'shard', x, y, vx: Math.cos(b) * sp, vy: Math.sin(b) * sp * 0.6 - frnd(60, 140), t: 0, life: frnd(0.45, 0.7), s: frnd(2.4, 4), a: frnd(0, TAU), sp: frnd(-12, 12), col }); }
}

// ---------------------------------------------------------------- on the floor
export function moveGround(g, F, v) {
  const objs = F.objs || [];
  if (v.tm) { v.tm = v.tm.filter(m => v.t - m.t0 < m.life); for (const m of v.tm) if (v.t >= m.t0 && m.k === 'puddle') coffeePuddle(g, m, v.t - m.t0); }
  for (const o of objs) if (o.kind === 'pot' && o.ph === 'ride' && F.f[o.on]) potStain(g, o, F.f[o.on], v);
  if (v.tswOn && !F.f.some(f => f.state === 'frozen') && !objs.some(o => o.kind === 'ring')) { release3(v, 'tsw', 40); v.tswOn = false; }   // Stop the World over: its crystals fall
  else if (objs.some(o => o.kind === 'ring')) v.tswOn = true;
  for (const o of objs) if (o.kind === 'ring') stopRing(g, o, v.t);
}
// Hot Java's brewing stain under whoever has the pot: soft irregular wet patch, darker toward the middle and as it
// brews, bubbles rising
// and popping in it faster and faster. No ring line
function potStain(g, o, c, v) {
  const P = FIGHTERS.duke.moves.move2, u = clamp(1 - (o.fuse ?? 0) / P.fuse, 0, 1), fade = clamp((o.t || 0) / 0.2, 0, 1), r = 30, seed = (o.id || 1) * 2.3;
  const A = (0.3 + 0.32 * u) * fade, x0 = c.x, y0 = c.y, edge = an => 1 + 0.07 * Math.sin(3 * an + seed) + 0.04 * Math.sin(5 * an + seed * 1.7);
  if (A <= 0.01) return;
  g.save();
  softDisc(g, x0, y0, r * 1.14, [[0, '74,42,20', A * 0.55], [0.8, '74,42,20', A * 0.35], [1, '74,42,20', 0]]);
  g.beginPath(); for (let i = 0; i <= 32; i++) { const an = i / 32 * TAU, d = r * 0.86 * edge(an); g.lineTo(x0 + Math.cos(an) * d, y0 + Math.sin(an) * d * 0.96); } g.closePath();
  const gr = g.createRadialGradient(x0, y0, 0, x0, y0, r * 0.95);
  gr.addColorStop(0, `rgba(92,52,24,${(A * 0.9).toFixed(3)})`); gr.addColorStop(1, `rgba(120,72,36,${(A * 0.45).toFixed(3)})`);
  g.fillStyle = gr; g.fill();
  g.fillStyle = `rgba(255,240,220,${(0.22 * fade).toFixed(3)})`; g.beginPath(); g.ellipse(x0 - r * 0.32, y0 - r * 0.3, r * 0.22, r * 0.09, -0.4, 0, TAU); g.fill();   // wet glint
  const pt = o.t || 0, rate = 1.2 + 3.4 * u;
  for (let k = 0; k < 6; k++) {
    const q = (pt * rate + hsh(seed + k * 5)) % 1, an = hsh(seed + k * 7) * TAU, d = r * 0.68 * Math.sqrt(hsh(seed + k * 3)), x = x0 + Math.cos(an) * d, y = y0 + Math.sin(an) * d, rb = 0.8 + 2.6 * q * (0.3 + 0.7 * u);
    g.fillStyle = `rgba(150,96,52,${(0.9 * (1 - q * q) * fade).toFixed(3)})`; circle(g, x, y, rb); g.fill();
    g.fillStyle = `rgba(255,236,210,${(0.6 * (1 - q) * fade).toFixed(3)})`; circle(g, x - rb * 0.35, y - rb * 0.35, rb * 0.35); g.fill();
  }
  g.restore();
}
// a coffee puddle (boil-over or dropped pot): 3D glossy baked puddle drying and shrinking; 2D a soft brown pool
function coffeePuddle(g, m, k) {
  const u = clamp(k / m.life, 0, 1), a = clamp(k / 0.18, 0, 1) * clamp((m.life - k) / 1.2, 0, 1), r = m.R * (1 - 0.1 * u) * (k < 0.18 ? 0.7 + 0.3 * k / 0.18 : 1);
  if (a <= 0.01) return;
  if (decal3(g, 'puddle', m.x, m.y, r * 0.95, { state: 'coffee', frame: 0, alpha: a * 0.94 })) return;
  softDisc(g, m.x, m.y, r, [[0, '96,54,24', 0.7 * a], [0.8, '110,64,30', 0.55 * a], [1, '110,64,30', 0]]);
  g.fillStyle = `rgba(255,240,220,${(0.3 * a).toFixed(3)})`; g.beginPath(); g.ellipse(m.x - r * 0.3, m.y - r * 0.28, r * 0.22, r * 0.08, -0.4, 0, TAU); g.fill();
}
// Stop the World: a soft grey ripple out from Duke while he snaps: light crest over a darker trough (gradients, no
// line), greyer inside, fainter follow-ups; full reach a very faint tint. Completing: soft pale flash; broken: fades
function stopRing(g, o, t) {
  const R = o.R || 105, ph = o.ph;
  const ripple = (r, a) => softDisc(g, o.x, o.y, r + 5, [[0, '70,74,92', 0], [0.42, '70,74,92', 0.17 * a], [0.74, '238,240,246', 0.42 * a], [1, '238,240,246', 0]], Math.max(0, r - 18));
  g.save();
  if (ph === 'grow') {
    const r = Math.max(2, o.r || 0), u = r / R;
    softDisc(g, o.x, o.y, R, [[0, '150,154,170', 0.06], [0.95, '150,154,170', 0.07], [1, '150,154,170', 0]]);   // full reach: faint tint
    softDisc(g, o.x, o.y, r, [[0, '128,132,148', 0.08 + 0.06 * u], [1, '128,132,148', 0.12 + 0.06 * u]]);   // inside: a touch greyer
    for (let j = 0; j < 2; j++) { const q = (t * 1.6 + j * 0.5) % 1; if (r * q > 14) ripple(r * q, 0.35 * (1 - q)); }
    ripple(r, 1);
  } else if (ph === 'done') {
    const left = (o.life || 0) - (o.t || 0), k = 1 - clamp(left / 0.25, 0, 1);
    softDisc(g, o.x, o.y, R * (1 + 0.06 * k), [[0, '240,242,248', 0.22 * (1 - k)], [0.85, '240,242,248', 0.12 * (1 - k)], [1, '240,242,248', 0]]);
    ripple(R * (1 + 0.06 * k), 1 - k);
  } else if (ph === 'break') {
    const left = (o.life || 0) - (o.t || 0), k = 1 - clamp(left / 0.2, 0, 1);
    ripple(Math.max(4, o.r || 0) + k * 10, 1 - k);
  }
  g.restore();
}
// ---------------------------------------------------------------- among the fighters
export function moveThings(F, v, g) {
  const out = [];
  for (const o of F.objs || []) if (o.kind === 'pot' && o.ph === 'erupt') out.push({ y: o.y + 1, d: () => column(g, o, v, F.f[o.on] ? potZ(F.f[o.on]) : 50) });   // Hot Java boiling over
  return out;
}
// 3D pot size (x its baked ~23 x 14): POT_S in the eruption (about half Duke's height), POT_ON on a head (reads on a
// phone without hiding them)
const POT_S = 2, POT_ON = 1.45;
// Hot Java boiling over: a coffee column bursting up round them (stripe, froth, foot splash, steam), the pot blown off
// the top tumbling; shoots up fast, holds, falls back
function column(g, o, v, z0 = 50) {
  const pt = o.pt || 0, E = FIGHTERS.duke.moves.move2.erupt || 0.35, up = ease(pt / 0.09), down = clamp((E - pt) / 0.13, 0, 1), BD = bold();
  const H = 104 * up * (0.35 + 0.65 * down), w = 34 * 0.6 * (0.75 + 0.25 * down), x = o.x, y = o.y, wob = k => Math.sin(v.t * 18 + k * 3) * 1.5;
  if (P3('gcol') && P3('froth') && P3('gsplash')) {   // 3D: glossy column out of a splash, froth on top, the pot blown off
    const sc = w / 15, r = 34;
    g.save(); g.translate(x, y); drawProp3D(g, 'gsplash', { frame: v.t * 9, scale: r / 26 * (0.6 + 0.4 * up) }); g.restore();
    if (H > 3) { g.save(); g.translate(x, y - 2); drawProp3D(g, 'gcol', { frame: v.t * 16, scale: sc, sy: H / (100 * sc) }); g.restore(); }
    g.save(); g.translate(x, y - H - 1); drawProp3D(g, 'froth', { frame: v.t * 10, scale: sc * 1.1 * (0.55 + 0.45 * up) });
    g.restore();
    if (down > 0.05) { g.save(); g.translate(x, y - Math.max(H + 18, z0) - 30 * up); g.rotate(Math.sin(pt * 8) * 0.8); g.translate(0, 13); drawProp3D(g, 'pot', { yaw: pt * 22, scale: POT_ON * 1.1, alpha: down }); g.restore(); }   // blown off the top, tumbling
    if (frnd(0, 1) < 0.35) { const a = frnd(0, TAU), sp = frnd(25, 70); bit3(v, 'drop', x + Math.cos(a) * w * 0.6, y + Math.sin(a) * w * 0.3, H * frnd(0.7, 1), { dx: Math.cos(a) * sp, dy: Math.sin(a) * sp * 0.5, dz: frnd(40, 140), s: frnd(1.8, 3), life: 0.8, bo: 0 }); }
    if (frnd(0, 1) < 0.18) bit3(v, 'steam', x + frnd(-w, w), y, H * frnd(0.5, 1), { dx: frnd(-16, 16), dz: frnd(20, 40), g: -20, drag: 1.2, grow: 1.4, s: frnd(4.5, 7), life: frnd(0.7, 1.1), sh: false });
    return;
  }
  g.save();
  g.fillStyle = BD ? '#6e4020' : 'rgba(110,64,32,0.95)'; g.beginPath(); g.ellipse(x, y, w * 1.6, w * 0.7, 0, 0, TAU); g.fill();
  g.fillStyle = BD ? '#8a5530' : '#8c5630'; g.beginPath();
  g.moveTo(x - w, y); for (let k = 0; k <= 6; k++) { const q = k / 6; g.lineTo(x - w * (1 - 0.35 * q) + wob(k), y - H * q); }
  for (let k = 6; k >= 0; k--) { const q = k / 6; g.lineTo(x + w * (1 - 0.35 * q) + wob(k + 7), y - H * q); }
  g.closePath(); g.fill();
  g.fillStyle = BD ? '#b47a48' : 'rgba(190,130,80,0.9)'; g.beginPath(); g.moveTo(x - w * 0.6, y); g.lineTo(x - w * 0.35 + wob(2), y - H * 0.95); g.lineTo(x - w * 0.1 + wob(3), y - H * 0.95); g.lineTo(x - w * 0.25, y); g.closePath(); g.fill();
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI - Math.PI / 2 + Math.sin(v.t * 9 + k) * 0.2, fx = x + Math.cos(a + Math.PI / 2) * w * 0.7, fy = y - H - 2 + Math.abs(Math.sin(a)) * 4; g.fillStyle = '#ffffff'; circle(g, fx, fy, w * 0.42 + (k % 2) * 2); g.fill(); }
  g.fillStyle = 'rgba(255,248,236,0.9)'; g.beginPath(); g.ellipse(x, y - 1, w * 1.25, w * 0.42, 0, 0, Math.PI); g.fill();
  g.restore();
  if (v.fx.length < 130 && frnd(0, 1) < 0.3) { const a = frnd(0, TAU), sp = frnd(25, 70); v.fx.push({ k: 'drop', x: x + frnd(-w, w), y, z: H * frnd(0.6, 1), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, vz: frnd(40, 140), t: 0, life: 0.8, s: frnd(1.8, 3) }); }
  if (v.fx.length < 130 && frnd(0, 1) < 0.18) v.fx.push({ k: 'steam', x: x + frnd(-w, w), y: y - H * frnd(0.5, 1), vx: frnd(-16, 16), vy: -frnd(20, 40), t: 0, life: frnd(0.7, 1.1), s: frnd(7, 11) });
}

// ---------------------------------------------------------------- round a fighter
// before the model: 'hide' while he's gone; HotSpot: steam off his fists
export function moveBehind(g, F, v, f) {
  if (f.gone) return 'hide';
  if (f.id === 'duke') { heatSteam(v, f); g.save(); g.translate(f.x, f.y - (f.z || 0)); heatGlow(g, v, f, false); g.restore(); }
  for (const o of F.objs || []) if (o.kind === 'pot' && o.ph === 'ride' && o.on === f.i && f.state !== 'ko') { g.save(); g.translate(f.x, f.y); potGlow(g, v, f, o); g.restore(); }   // Hot Java's heat, behind them
  return null;
}
// Duke's fists now, from his feet: [x, y on the floor, height] and his facing; the punching one out front in a jab
const D3 = 0.47;   // floor depth as it shows on the model, seen from 28°
const yawOf = f => camYaw('duke', f.face + 0.35 * Math.sin(Math.PI / 2 - f.face));   // (his model's turn: draw-fight's, and his own toward the camera)
function fistsAt(f) {
  const a = yawOf(f), c = Math.cos(a), s = Math.sin(a), ph = f.ph, out = (ph === 'jab1' || ph === 'jab2') && f.state === 'strike' ? Math.min(1, (f.pht || 0) / 0.04) : 0;
  return [-1, 1].map(side => {
    const lead = (ph === 'jab1' && side < 0) || (ph === 'jab2' && side > 0), fw = 10 + (lead ? 14 * out : 0), sd = side * (lead ? 3 : 8), h = lead ? 41 : 38;
    return [c * fw - s * sd, (s * fw + c * sd) * D3, h];
  });
}
// the pot in his hand as he lifts it (back over his right shoulder), from his feet
function potHand(f) { const a = yawOf(f), c = Math.cos(a), s = Math.sin(a), fw = -6, sd = -11; return [c * fw - s * sd, (s * fw + c * sd) * D3, 52]; }
// how high Hot Java's pot sits on someone (top of their head, from their feet)
const POT_Z = { duke: 50, tux: 56, gopher: 54, ferris: 44, pyth: 52, octo: 54, docky: 52, swifty: 48, cpp: 54, droid: 52 };
const potZ = f => (POT_Z[f.id] || 52) + (f.z || 0);
// HotSpot steam: wisps off his fists once warm, quicker and fuller as he heats, the odd ember at full heat
function heatSteam(v, f) {
  const h = hotOf(f); if (h < 0.3 || f.gone || f.state === 'ko' || v.fx.length > 130) return;
  const S = v.heatT || (v.heatT = [0, 0]); if (v.t < S[f.i]) return;
  S[f.i] = v.t + 0.2 - 0.12 * h;
  const fs = fistsAt(f), [fx, fy, fz] = fs[(S.n = (S.n || 0) + 1) % 2];
  if (P3('bit:steam')) bit3(v, 'steam', f.x + fx + frnd(-2, 2), f.y + fy, fz + 3 + (f.z || 0), { dx: frnd(-6, 6), dz: frnd(20, 34), g: -26, drag: 1.8, grow: 1.4, s: frnd(2.8, 3.8) * (0.8 + 0.4 * h), life: frnd(0.5, 0.75), al: 0.5 + 0.35 * h, sh: false });
  else v.fx.push({ k: 'steam', x: f.x + fx, y: f.y + fy - fz - 4, vx: frnd(-6, 6), vy: -frnd(18, 30), t: 0, life: frnd(0.45, 0.7), s: frnd(3, 4.5) * (0.8 + 0.5 * h) });
  if (h >= 0.99 && frnd(0, 1) < 0.3 && P3('bit:spark')) bit3(v, 'spark', f.x + fx, f.y + fy, fz + 2, { dx: frnd(-15, 15), dz: frnd(40, 70), g: -10, drag: 1.5, s: frnd(0.8, 1.2), life: 0.4, fade: 'alpha', sh: false });
}
// Stop the World's tell: a frosty pocket watch swinging up into his raised hand, its hand spinning back; it hangs as he
// snaps, then fades as the ripple goes out. g at his feet
function snapWatch(g, v, f, ph) {
  if (!P3('watch')) return;
  const S = FIGHTERS.duke.moves.move3, k = f.pht || 0, side = -Math.sin(yawOf(f)) * 12;
  const up = ph === 'raise' ? ease(k / Math.max(0.05, S.startup)) : 1, fade = ph === 'snap' ? 1 - clamp((k - 0.12) / 0.3, 0, 1) : 1;
  if (fade <= 0.02) return;
  const x = side * (1.1 + 0.5 * up), y = -34 - 24 * up + Math.cos(f.face) * 3 + Math.sin(v.t * 3 + f.i) * 0.8, sc = 1.15 * (0.45 + 0.55 * backE(clamp(up * 1.2, 0, 1)));
  g.save(); g.translate(x, y); g.rotate(Math.sin(v.t * 6 + f.i) * 0.15 * (1 - up * 0.6)); g.globalAlpha *= fade;
  drawProp3D(g, 'watch', { scale: sc });
  const hand = -v.t * 9;   // spinning backwards: time about to stop
  g.strokeStyle = bold() ? BK.ink : '#2a3448'; g.lineWidth = 1.4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, 0.3); g.lineTo(Math.sin(hand) * 3.4 * sc, 0.3 - Math.cos(hand) * 3.4 * sc); g.stroke();
  g.restore();
}
// HotSpot's fist heat: a breathing glow from soft amber to red-orange with a white-hot heart (Classic Flat: palette
// yellow and red, no gradients). g at his feet; front: near-side fists (after the model), else far ones (before it)
function heatGlow(g, v, f, front = true) {
  const h = hotOf(f); if (h <= 0.05 || f.gone || f.state === 'ko') return;
  const BD = bold(), br = 0.85 + 0.15 * Math.sin(v.t * (6 + 10 * h) + f.i);
  for (const [fx, fy, fz] of fistsAt(f)) {
    if ((fy >= -1) !== front) continue;   // far-side fist: drawn before him
    const x = fx, y = fy - fz, r = (7 + 9 * h) * br;
    const mid = h < 0.5 ? '255,190,90' : h < 0.9 ? '255,128,40' : '255,80,30', core = h < 0.9 ? '255,236,190' : '255,250,225';
    if (BD) {
      g.fillStyle = hexA(h < 0.9 ? BK.yellow : BK.red, 0.28 * h * br); circle(g, x, y, r); g.fill();
      g.fillStyle = hexA(BK.yellow, 0.4 * h); circle(g, x, y, r * 0.45); g.fill();
    } else softDisc(g, x, y, r, [[0, core, 0.75 * h], [0.35, mid, 0.55 * h * br], [1, mid, 0]]);
  }
}
// Hot Java's pot on someone: flown on (or hopped back) in a tumbling arc with a steam thread, then sitting on them
// rattling harder, steam puffing quicker, a glow deepening to red-hot (Classic Flat: yellow then red), drops flicking;
// at the end it whistles (a steam jet with white streaks). g at their feet
function potOn(g, v, F, f, o) {
  const P = FIGHTERS.duke.moves.move2, u = clamp(1 - (o.fuse ?? 0) / P.fuse, 0, 1), hop = P.hop || 0.22, z1 = potZ(f), t = v.t;
  if ((o.hopT ?? 9) < hop) {   // flying on from where it left to their head
    const q = ease(o.hopT / hop), z0 = o.hops ? potZ(F.f[1 - f.i] || f) : 34, dx = (o.hx ?? f.x) - f.x, dy = (o.hy ?? f.y) - f.y;
    const x = dx * (1 - q), y = dy * (1 - q), z = z0 + (z1 - z0) * q + Math.sin(Math.PI * q) * 34;
    softShadow(g, x, y, 13, 5, 0.26 * (1 - q * 0.5));
    if (frnd(0, 1) < 0.5 && P3('bit:steam')) bit3(v, 'steam', f.x + x, f.y + y, z + 10, { dz: 10, g: -10, drag: 2, grow: 0.9, s: frnd(2.6, 3.8), life: frnd(0.35, 0.5), al: 0.75, sh: false });
    g.save(); g.translate(x, y - z - 9); g.rotate((1 - q) * 3.4 * (dx < 0 ? -1 : 1)); g.translate(0, 9);
    if (!drawProp3D(g, 'pot', { yaw: t * 15, scale: POT_ON })) pot2D(g, 0.9);
    g.restore();
    return;
  }
  const whistle = (o.fuse ?? 0) <= P.whistle, rate = 14 + 46 * u, sh = Math.sin(t * rate) * (0.4 + 1.6 * u), bob = Math.max(0, Math.sin(t * rate * 0.5)) * (0.4 + 1.4 * u);
  const yaw = -0.5, y0 = -z1;
  g.save(); g.translate(sh, y0 - bob); g.rotate(sh * 0.04);
  if (!drawProp3D(g, 'pot', { yaw, scale: POT_ON })) pot2D(g, 0.9);
  g.restore();
  // the spout: steam puffing quicker; whistling, a jet with white streaks
  const sx = Math.cos(yaw) * 14 + sh, sy = y0 - 13 - bob, wx = f.x + sx, wy = f.y;
  if (P3('bit:steam') && frnd(0, 1) < 0.08 + 0.42 * u + (whistle ? 0.4 : 0)) bit3(v, 'steam', wx, wy, z1 + 13, { dx: (whistle ? 90 : 12) + frnd(-6, 6), dz: whistle ? frnd(10, 30) : frnd(25, 45), g: -26, drag: whistle ? 3 : 1.4, grow: 1.3, s: frnd(2.4, 3.6) * (0.8 + 0.5 * u), life: frnd(0.35, 0.6), al: 0.85, sh: false });
  else if (!P3('bit:steam') && v.fx.length < 130 && frnd(0, 1) < 0.1 + 0.3 * u) v.fx.push({ k: 'steam', x: wx, y: f.y - z1 - 13, vx: whistle ? 80 : frnd(5, 20), vy: -frnd(20, 40), t: 0, life: frnd(0.4, 0.6), s: frnd(3, 5) });
  if (u > 0.5 && P3('bit:drop') && frnd(0, 1) < 0.04 + 0.08 * u) bit3(v, 'drop', f.x + frnd(-8, 8), f.y + frnd(-3, 3), z1 + 4, { dx: frnd(-40, 40), dy: frnd(-20, 20), dz: frnd(40, 90), s: frnd(1.1, 1.6), life: 0.5, bo: 0 });
  if (whistle) {   // white streaks flickering out of the spout
    g.save(); g.lineCap = 'round';
    for (let j = 0; j < 3; j++) {
      const q = (t * 9 + j / 3) % 1, x0 = sx + 3 + q * 16, y = sy - 2 + (j - 1) * 3.2 - q * 3;
      g.strokeStyle = `rgba(255,255,255,${(0.9 * (1 - q)).toFixed(3)})`; g.lineWidth = 2.2 - j * 0.4; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + 7 + 5 * q, y - 1); g.stroke();
    }
    g.restore();
  }
}
// the heat round the riding pot, drawn before them (a halo round the pot, not a tint over them): deepening to red-hot,
// pulsing quicker, flaring as it whistles (Classic Flat: yellow then red). g at their feet
function potGlow(g, v, f, o) {
  const P = FIGHTERS.duke.moves.move2, u = clamp(1 - (o.fuse ?? 0) / P.fuse, 0, 1), BD = bold(), whistle = (o.fuse ?? 0) <= P.whistle;
  if ((o.hopT ?? 9) < (P.hop || 0.22)) return;
  const pulse = 0.8 + 0.2 * Math.sin(v.t * (8 + 20 * u)), y = -potZ(f) - 9, hr = 13 + 8 * u + (whistle ? 4 * pulse : 0);
  if (BD) { g.fillStyle = hexA(u < 0.65 ? BK.yellow : BK.red, (0.16 + 0.22 * u) * pulse); circle(g, 0, y, hr); g.fill(); g.fillStyle = hexA(BK.yellow, 0.22 * u); circle(g, 0, y, hr * 0.6); g.fill(); }
  else softDisc(g, 0, y, hr * 1.25, [[0, u < 0.65 ? '255,220,150' : '255,150,90', (0.3 + 0.45 * u) * pulse], [0.6, u < 0.65 ? '255,170,80' : '255,80,40', 0.25 * u * pulse], [1, '255,120,60', 0]]);
}
// the 2D pot stand-in: round Java-blue enamel pot, red lid and knob, spout, handle
function pot2D(g, s) {
  const BD = bold();
  g.save(); g.scale(s, s);
  g.fillStyle = BD ? BK.ink : '#132a40'; g.beginPath(); g.ellipse(0, -8, 12, 9.5, 0, 0, TAU); g.fill();
  g.fillStyle = JAVA_B; g.beginPath(); g.ellipse(0, -8, 10.5, 8, 0, 0, TAU); g.fill();
  g.strokeStyle = JAVA_B; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(8, -9); g.lineTo(15, -16); g.stroke();
  g.strokeStyle = '#2f5470'; g.lineWidth = 2.4; g.beginPath(); g.arc(-11, -8, 4, Math.PI * 0.5, Math.PI * 1.5); g.stroke();
  g.fillStyle = '#e8231a'; g.beginPath(); g.ellipse(0, -15, 6.5, 2.4, 0, 0, TAU); g.fill(); circle(g, 0, -17.5, 1.8); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(-4, -11, 3, 1.6, -0.6, 0, TAU); g.fill();
  g.restore();
}
// after the model (at their feet, lifted with them): the snap's spark, a thawing statue's cracks
export function moveOver(g, F, v, f) {
  const ph = f.ph;
  if (f.id === 'duke' && f.move === 'move3' && (ph === 'raise' || ph === 'snap')) snapWatch(g, v, f, ph);
  if (f.id === 'duke' && f.move === 'move2' && ph === 'potup') {   // the pot coming up over his shoulder, steaming
    const [hx, hy, hz] = potHand(f);
    if (P3('bit:steam') && frnd(0, 1) < 0.35) bit3(v, 'steam', f.x + hx, f.y + hy, hz + 8, { dz: frnd(20, 35), g: -26, drag: 1.6, grow: 1.3, s: frnd(2.4, 3.4), life: frnd(0.35, 0.5), al: 0.7, sh: false });
  }
  for (const o of F.objs || []) if (o.kind === 'pot' && o.ph === 'ride' && o.on === f.i && f.state !== 'ko') potOn(g, v, F, f, o);
  if (f.id === 'duke') heatGlow(g, v, f);
  const st = v.snapT && v.snapT[f.i], sa = v.t - (st ?? -9);
  if (sa >= 0 && sa < 0.35) {   // the snap: white spark at his fingers, three short lines
    const k = sa / 0.35, hx = -Math.sin(yawOf(f)) * 12, hy = -78 + Math.cos(f.face) * 3, s = 10 * (k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75);
    if (P3('bit:glint')) { g.save(); g.translate(hx, hy); drawProp3D(g, 'bit:glint', { frame: 2 + k * 3, scale: s * 0.62 / 4.4 }); g.restore(); }   // 3D: a cut-glass sparkle
    else { g.save(); starPath(g, hx, hy, s * 1.4, s * 0.3, 4, 0.3); g.fillStyle = '#ffffff'; g.fill(); starPath(g, hx, hy, s * 0.7, s * 0.25, 4, 0.3 + Math.PI / 4); g.fillStyle = bold() ? BK.yellow : '#ffd23c'; g.fill();
    g.strokeStyle = `rgba(255,255,255,${(1 - k).toFixed(3)})`; g.lineWidth = 2.5; g.lineCap = 'round';
    for (const an of [-2.2, -1.57, -0.9]) { const r0 = 8 + k * 10; g.beginPath(); g.moveTo(hx + Math.cos(an) * r0, hy + Math.sin(an) * r0); g.lineTo(hx + Math.cos(an) * (r0 + 7), hy + Math.sin(an) * (r0 + 7)); g.stroke(); }
    g.restore(); }
  }
  const E = FIGHTERS[f.id] && FIGHTERS[f.id].moves.evade;
  if (E && E.charges && f.state !== 'ko' && !f.gone) {   // Garbage Collect charges: pips by his feet
    const n = f.ev ?? E.charges, q = n < E.charges && E.recharge ? clamp(1 - (f.evT || 0) / E.recharge, 0, 1) : 0, y = 9 + (f.z || 0);
    for (let k = 0; k < E.charges; k++) {
      const x = (k - (E.charges - 1) / 2) * 9;
      g.fillStyle = bold() ? hexA(BK.ink, 0.55) : 'rgba(10,14,30,0.5)'; circle(g, x, y, 3.4); g.fill();
      const r = k < n ? 2.5 : k === n ? 2.5 * q : 0;
      if (r > 0.2) { g.fillStyle = k < n ? (PCOL[f.i] || '#fff') : 'rgba(255,255,255,0.55)'; circle(g, x, y, r); g.fill(); }
    }
  }
  if (f.state === 'frozen' && f.dur && f.t > f.dur - 0.35) {   // about to thaw: cracks over the statue
    const k = clamp((f.t - (f.dur - 0.35)) / 0.35, 0, 1), seed = f.i * 5.3;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    // cracks with depth: dark groove, light lip, a grey chip flaking off the end
    for (const [dx, dy, c, w] of [[0.6, 0.9, 'rgba(255,255,255,0.75)', 1.4], [0, 0, 'rgba(52,56,72,0.7)', 1.7]]) {
      g.strokeStyle = c; g.lineWidth = w;
      for (let j = 0; j < 5; j++) { const x0 = (hsh(seed + j) - 0.5) * 20, y0 = -10 - hsh(seed + j * 2) * 40; g.beginPath(); g.moveTo(x0 + dx, y0 + dy); let x = x0, y = y0; for (let n = 0; n < 3; n++) { x += (hsh(seed + j * 7 + n) - 0.5) * 15 * k; y += (hsh(seed + j * 9 + n) - 0.5) * 15 * k; g.lineTo(x + dx, y + dy); } g.stroke(); }
    }
    g.restore();
  }
}

// ---------------------------------------------------------------- the particle kinds
export function moveFx(g, F, v, p, k, dt) {
  switch (p.k) {
    case 'shard': {   // ice or statue shard tumbling
      p.vy += 520 * dt;
      g.save(); g.translate(p.x, p.y); g.rotate(p.a + p.t * p.sp); g.globalAlpha *= 1 - k * k;
      g.fillStyle = p.col || '#e6f6ff'; g.beginPath(); g.moveTo(0, -p.s * 1.4); g.lineTo(p.s * 0.8, 0); g.lineTo(0, p.s * 1.1); g.lineTo(-p.s * 0.7, 0); g.closePath(); g.fill();
      g.fillStyle = 'rgba(120,170,220,0.5)'; g.beginPath(); g.moveTo(0, -p.s * 1.4); g.lineTo(p.s * 0.8, 0); g.lineTo(0, 0); g.closePath(); g.fill();
      g.restore(); return true;
    }
    case 'drop': {   // coffee drop, a dot where it lands
      p.vz -= 800 * dt; p.z = Math.max(0, p.z + p.vz * dt);
      g.fillStyle = `rgba(110,64,30,${(0.9 * (1 - k * k)).toFixed(3)})`; g.beginPath(); g.ellipse(p.x, p.y - p.z, p.s, p.s * (p.z > 0 ? 1.25 : 0.5), 0, 0, TAU); g.fill();
      if (p.z > 0) { g.fillStyle = 'rgba(255,236,210,0.6)'; circle(g, p.x - p.s * 0.35, p.y - p.z - p.s * 0.4, p.s * 0.35); g.fill(); }
      return true;
    }
    case 'steam': {   // steam puff rising and swelling
      const r = p.s * (0.6 + k * 1.2), a = 0.55 * (1 - k) * clamp(k / 0.12, 0, 1);
      g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`; circle(g, p.x, p.y, r); g.fill(); circle(g, p.x + r * 0.7, p.y + r * 0.2, r * 0.7); g.fill();
      return true;
    }
    case 'dswoosh': {   // punch swooshes (prop3d jabline, jabhot)
      const ok = P3(p.id); if (!ok) return true;
      const q = ease(k / 0.35), a = (1 - k * k) * 0.9, side = p.side || 0, ox = -Math.sin(p.a) * side * 5, oy = Math.cos(p.a) * side * 3;
      g.save(); g.translate(p.x + ox + Math.cos(p.a) * 3 * q, p.y + oy + Math.sin(p.a) * 3 * q);
      drawProp3D(g, p.id, { yaw: p.a, scale: (p.id === 'jabhot' ? 1.15 : 1.1) * (0.8 + 0.2 * q), alpha: a });
      g.restore(); return true;
    }
    case 'popring': {   // a ring popping out along the floor
      const r = 6 + p.s * Math.sqrt(k), a = 1 - k;
      softDisc(g, p.x, p.y, r + 4, [[0, '255,255,255', 0], [0.75, '235,246,255', 0.4 * a], [1, '235,246,255', 0]], Math.max(0, r - 8));
      return true;
    }
    case 'bit': case 'bitin': {   // recycled bit (bitin: flying in to where he returns)
      let x = p.x, y = p.y;
      if (p.k === 'bitin') { const q = 1 - ease(k); x += p.ox * q; y += p.oy * q; } else p.vy += 200 * dt;
      g.save(); g.translate(x, y); g.rotate(p.a + p.t * 14); g.globalAlpha *= p.k === 'bitin' ? clamp(k * 3, 0, 1) : 1 - k * k;
      g.fillStyle = p.col; g.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); g.restore();
      return true;
    }
    case 'gcstreak': {   // the blink's streak, tapering and fading
      const a = 1 - k, dx = p.x2 - p.x, dy = p.y2 - p.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, y0 = p.y - 24, y1 = p.y2 - 24, h = clamp(k * 3, 0, 1);
      g.save(); g.globalAlpha *= a;
      g.fillStyle = 'rgba(248,152,32,0.32)'; g.beginPath(); g.moveTo(p.x + nx * 2, y0 + ny * 2); g.lineTo(p.x + dx * h + nx * 9, y0 + dy * h + ny * 9); g.lineTo(p.x + dx * h - nx * 9, y0 + dy * h - ny * 9); g.lineTo(p.x - nx * 2, y0 - ny * 2); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(p.x + dx * k * 0.6, y0 + dy * k * 0.6); g.lineTo(p.x + dx * h, y0 + (y1 - y0) * h); g.stroke();
      g.restore(); return true;
    }
    case 'flash': {
      if (!p.grey) return false;
      const r = p.s * (0.7 + 0.5 * k); g.fillStyle = `rgba(225,228,238,${(0.5 * (1 - k)).toFixed(3)})`; circle(g, p.x, p.y, r); g.fill();
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- the moves' icons (the keys, the feed)
export function moveIcon(g, kind, r, col) {
  const W = col || '#ffffff';
  g.fillStyle = W; g.strokeStyle = W; g.lineCap = 'round'; g.lineJoin = 'round';
  switch (kind) {
    case 'jab':   // a fist and two lines (a one-two)
      g.beginPath(); g.roundRect(-r * 0.05, -r * 0.4, r * 0.75, r * 0.72, r * 0.26); g.fill();
      g.beginPath(); g.roundRect(-r * 0.32, -r * 0.18, r * 0.36, r * 0.36, r * 0.1); g.fill();
      g.lineWidth = r * 0.13; for (const y of [-0.22, 0.18]) { g.beginPath(); g.moveTo(-r * 0.9, y * r); g.lineTo(-r * 0.5, y * r); g.stroke(); }
      return true;
    case 'stopworld':   // a clock face
      g.lineWidth = r * 0.14; circle(g, 0, 0, r * 0.7); g.stroke();
      g.lineWidth = r * 0.13; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -r * 0.45); g.moveTo(0, 0); g.lineTo(r * 0.32, r * 0.12); g.stroke();
      for (let k = 0; k < 4; k++) { const a = k * TAU / 4; circle(g, Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52, r * 0.06); g.fill(); }
      return true;
    case 'gc':   // a ring of bits with an arrow out
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.fillRect(-r * 0.25 + Math.cos(a) * r * 0.42 - r * 0.1, Math.sin(a) * r * 0.42 - r * 0.1, r * 0.2, r * 0.2); }
      g.lineWidth = r * 0.14; g.beginPath(); g.moveTo(r * 0.05, 0); g.lineTo(r * 0.75, 0); g.stroke();
      g.beginPath(); g.moveTo(r * 0.95, 0); g.lineTo(r * 0.6, -r * 0.28); g.lineTo(r * 0.6, r * 0.28); g.closePath(); g.fill();
      return true;
    case 'hotjava':   // a coffee pot with steam
      g.beginPath(); g.ellipse(-r * 0.08, r * 0.22, r * 0.52, r * 0.46, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(-r * 0.08, -r * 0.26, r * 0.32, r * 0.1, 0, 0, TAU); g.fill(); circle(g, -r * 0.08, -r * 0.38, r * 0.1); g.fill();
      g.lineWidth = r * 0.16; g.beginPath(); g.moveTo(r * 0.36, r * 0.12); g.lineTo(r * 0.7, -r * 0.2); g.stroke();
      g.lineWidth = r * 0.12; g.beginPath(); g.arc(-r * 0.62, r * 0.2, r * 0.2, Math.PI * 0.5, Math.PI * 1.5); g.stroke();
      g.lineWidth = r * 0.1; for (const x0 of [0.55, 0.85]) { g.beginPath(); g.moveTo(x0 * r, -r * 0.42); g.quadraticCurveTo(x0 * r + r * 0.14, -r * 0.6, x0 * r, -r * 0.78); g.stroke(); }
      return true;
  }
  return false;
}

// ---------------------------------------------------------------- Duke's sounds
// in the art plug-ins' shape (js/art/kits.js: sound(e), cues(F, play)), since his drawing lives here; the sounds are
// audio.js's (du*, f*)
const DUKE_CUES = new WeakMap();   // per fight: cues already played
export const DUKE_SOUND = {
  id: 'duke',
  sound(e) {
    switch (e.kind) {
      case 'tell': return e.move === 'move2' ? [['duPotUp', 0.7]] : e.move === 'move3' ? [['duWatch', 0.8]] : [];   // the jab's fists up: too quick to hear
      case 'jab': return [[e.hot >= 1.5 ? 'duJabHot' : 'duJab', 0.6 + 0.08 * (e.n || 1)]];
      case 'hit':   // by move: the jab's pop, bigger the harder; the pot's tap
        if (e.move === 'move1') return [['duPunch', 0.6 + 0.4 * (e.power || 0)]];
        if (e.move === 'move2') return [];
        return null;
      case 'boil': return [['fBoil', 1]];
      case 'potslap': return [['duPotSwing', 0.7]];
      case 'stopmiss': return [['duStopMiss', 0.8]];
      case 'blink': return e.move === 'evade' ? [['duBlinkOut', 0.8]] : null;
    }
    return null;   // (the rest: fight-ui.js's list)
  },
  // the beats that aren't events: a one-two that hit nothing, the watch ticking while the ripple grows, back in from a blink
  cues(F, play) {
    let M = DUKE_CUES.get(F); if (!M) DUKE_CUES.set(F, M = { ph: [], n: {} });
    for (const f of F.f) {
      if (f.id !== 'duke') continue;
      if (f.ph !== M.ph[f.i]) { if (f.ph === 'jabmiss') play('duJabMiss', 0.6); else if (f.ph === 'blinkin') play('duBlinkIn', 0.7); }
      M.ph[f.i] = f.ph;
    }
    for (const o of F.objs || []) {
      if (o.kind !== 'ring' || o.ph !== 'grow') continue;
      const k = 'r' + o.id, n = Math.floor((o.t || 0) / 0.125); if (M.n[k] !== n) { M.n[k] = n; if (n > 0) play(n % 2 ? 'duTock' : 'duTick', 0.7); }
    }
  },
};
