// Pyth's moves drawn (the sim: js/kits/pyth.js). Cosmetic only. Real 3D since 2026-10-24 (the user: "the 3d models look
// so good, but the animations and effects just look like simple 2d graphics"): his long body is a chain of baked 3D
// segments (art/chain3d.js: Python blue on top, the yellow belly along its lower side, one smooth outline round it),
// toon-shaded like his model, and the dust and sand are shaded 3D bits (art/prop3d.js). Each move is a little set piece:
//   Coil          the lunge's long body sliding out low over the floor behind his head; caught, his body coils round
//                 them in a real helix, the far turns behind them and the near ones in front, squeezing with each tick
//   antigravity   a warm glow pooling on the floor, pebbles lifting off it and hanging there, bobbing, motes of light
//                 rising; the one it lifts floats in a soft 3D halo of light with motes circling them
//   Whip          the tail pulled back behind him, its tip up and rattling, then sweeping the arc low over the floor
//                 kicking sand and dust along it, a groove dragged through the dust behind its tip
//   Slither       flat and low, his body streaming behind him in an S, sand kicked up to both sides
// The tells stay part of the floor, soft and natural (the user's rule): the Coil's S-shaped scuff, the glow, the whip's
// swept band. Classic Flat first; with no WebGL (or before the bake) the old 2D shapes stand in. Calm: no shakes.
import { TAU, clamp, frnd } from '../core.js';
import { bold } from '../look.js';
import { puff } from '../draw-fight.js';
import { animBase, settleAnim } from './kits.js';
import * as M3 from './model3d.js';
import { bits3, defProp, drawProp3D, propsFor } from './prop3d.js';
import { CE, SE, SHARED_BITS, bodyAt, bodyShadow, drawSegs, floorAt, segReady, segTube, spine } from './chain3d.js';

const ID = 'pyth';
const BLUE = '#3776ab', BLUE_D = '#25507d', YEL = '#ffd43b';
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const hsh = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }
function softDisc(g, x, y, r, stops, r0 = 0) {
  if (r <= 0.5) return;
  const gr = g.createRadialGradient(x, y, Math.max(0, r0), x, y, r);
  for (const [at, c, a] of stops) gr.addColorStop(clamp(at, 0, 1), `rgba(${c},${clamp(a, 0, 1).toFixed(3)})`);
  g.fillStyle = gr; circle(g, x, y, r); g.fill();
}

// ---------------------------------------------------------------- the 3D pieces (baked with his fights)
// his body: a chain of short tubes (art/chain3d.js), Python blue, radius SEG_R world units, 32 headings (a curve's
// steps stay small), 'py:segN' the same without its ink line (hides the joins); and his belly, a thinner yellow chain
// run along just under it, peeking out below it as a band along its lower side (two smooth tubes: a colour band baked
// round one segment would step at every join)
const SEG_R = 5.5, BEL_R = 3.9, BEL_DY = 4.2;
const tubeOf = (r, col, o) => () => segTube([], 3, r, () => M3.hex(col), o, 24);
defProp('py:seg', { mesh: tubeOf(SEG_R, BLUE, 1), n: 32, sym: 2, ink: '#122b44' });
defProp('py:segN', { mesh: tubeOf(SEG_R, BLUE, 0), n: 32, sym: 2, ink: '#122b44', out: 0 });
defProp('py:bel', { mesh: tubeOf(BEL_R, YEL, 1), n: 32, sym: 2, ink: '#6b4c08' });
defProp('py:belN', { mesh: tubeOf(BEL_R, YEL, 0), n: 32, sym: 2, ink: '#6b4c08', out: 0 });
// antigravity's halo: a soft ring of warm light, lying round whoever floats (its far half and its near half apart, so
// they go behind and in front of them), radius 20
function haloMesh(st) {
  const out = [], R = 20, r = 2.1, nu = 40, nv = 10, C = M3.hex('#fff1bd'), far = st === 'b';
  M3.grid(out, (i, j) => { const a = (far ? 0 : Math.PI) + Math.PI * j / nu, b = TAU * i / nv, c = [Math.cos(a), Math.sin(a), 0], nn = M3.norm(M3.add(M3.scl(c, Math.cos(b)), [0, 0, Math.sin(b)])); return [M3.add(M3.scl(c, R + r * Math.cos(b)), [0, 0, r * Math.sin(b)]), nn, nn]; }, nu, nv, C, M3.GLOSS, 0.6);
  return out;
}
defProp('py:halo', { mesh: haloMesh, n: 1, ink: '#e0aa3c', out: 0.5, states: ['b', 'f'] });
// a mote of light: a small warm bead (drawn over a soft glow)
defProp('py:mote', { mesh: () => { const out = []; M3.ball(out, [0, 0, 0], 2.2, M3.hex('#ffdc6e'), M3.GLOSS, 0.5, 14, 9); return out; }, n: 1, ink: '#b87a14', out: 0.45 });
propsFor(ID, ['py:seg', 'py:segN', 'py:bel', 'py:belN', 'py:halo/b', 'py:halo/f', 'py:mote', ...SHARED_BITS]);
const ready = () => segReady('py:seg') && segReady('py:segN') && segReady('py:bel') && segReady('py:belN');
// a body along a spine: its shadow, then the segments (sc: × the segment's size)
function snake(g, segs, a = 1) { drawSegs(g, segs.map(q => ({ ...q, y: q.y + BEL_DY * q.s })), 'py:bel', 'py:belN', a); drawSegs(g, segs, 'py:seg', 'py:segN', a); }
function body(g, segs, a = 1, shadowW = 9) { bodyShadow(g, segs, shadowW, a); snake(g, segs, a); }
const gapOf = s => SEG_R * 0.62 * Math.max(0.35, s);

// a warm soft glow (one baked radial sprite, drawn wherever a light wants it)
let GLOW = null;
function glowAt(g, x, y, r, a) {
  if (a <= 0.01 || typeof document === 'undefined') return;
  if (!GLOW) { GLOW = document.createElement('canvas'); GLOW.width = GLOW.height = 64; const c = GLOW.getContext('2d'), gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,250,222,1)'); gr.addColorStop(0.3, 'rgba(255,236,170,0.55)'); gr.addColorStop(1, 'rgba(255,226,140,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); }
  const a0 = g.globalAlpha; g.globalAlpha = a0 * clamp(a, 0, 1); g.drawImage(GLOW, x - r, y - r, r * 2, r * 2); g.globalAlpha = a0;
}
// the view's own memory (spawn clocks), never on the sim's objects
const MEM = new WeakMap();
const every = (v, key, dt) => { let m = MEM.get(v); if (!m) MEM.set(v, m = {}); if (m[key] != null && v.t - m[key] < dt && v.t >= m[key]) return false; m[key] = v.t; return true; };
// sandy dust and grains of sand (3D bits)
const dust = (v, x, y, n, o = {}) => bits3(v, 'po:dust', x, y, 2, n, { speed: [15, 50], up: [10, 40], s: [3.5, 6], life: [0.45, 0.8], g: 40, drag: 3, grow: 0.9, fade: 'alpha', bo: 0, al: 0.85, sh: false, sp: 0, ...o });
const sand = (v, x, y, n, o = {}) => bits3(v, 'po:sand', x, y, 3, n, { speed: [40, 110], up: [80, 170], s: [1.5, 2.4], life: [0.45, 0.75], g: 620, bo: 0.2, ...o });

// how far the lunge's head is out past where the model's own head sits (the stretched body drawn behind)
const MODEL_HEAD = 30;
function stretch(f) {
  const M = f.stats.moves.move1;
  if (f.ph === 'lunge') return Math.max(0, f.r + M.reach * (1 - Math.pow(1 - clamp(f.t / M.out, 0, 1), 2)) - MODEL_HEAD);
  if (f.ph === 'sprawl') return Math.max(0, (f.r + M.reach - MODEL_HEAD) * 0.8 * (1 - ease((f.pht || 0) / 0.35)));
  return 0;
}

// clip to the arena's floor (a mark on it never runs out over its wall)
function clipArena(g, F) {
  const b = F.A && F.A.bounds; if (!b) return;
  g.beginPath();
  if (b.shape === 'circle') g.arc(0, 0, b.r, 0, TAU); else if (g.roundRect) g.roundRect(-b.w / 2, -b.h / 2, b.w, b.h, b.r || 0); else g.rect(-b.w / 2, -b.h / 2, b.w, b.h);
  g.clip();
}
const holderOf = (F, f) => { if (f.state !== 'grabbed') return null; const H = F.f[f.hold]; return H && H.id === ID && H.ph === 'wrap' ? H : null; };
const glowOn = (F, f) => f.state === 'float' ? (F.objs || []).find(o => o.kind === 'pyGlow' && o.ph === 'lift' && o.to === f.i) || null : null;

export default {
  id: ID,
  anim(F, v, f) {
    const A = animBase(), k = f.pht || 0, t = v.t + f.i, sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
    switch (f.ph) {
      case 'rear': sq(-0.08 * ease(k / 0.15)); A.wx = Math.sin(k * 9) * 1.3; A.lean = Math.sin(k * 9) * 0.04; A.fwd = -2; break;   // up tall, swaying
      case 'lunge': sq(-0.06); A.fwd = stretch(f); break;
      case 'wrap': sq(0.035 * Math.sin(k * 26)); break;   // squeezing
      case 'toss': sq(-0.08 * Math.exp(-k * 9)); break;
      case 'sprawl': Object.assign(A, settleAnim(k, f.stats.moves.move1.miss, 'sprawl', 0.3)); A.fwd = stretch(f); break;   // (missed: his long body drawn back in and he settles back onto his coil: a delay, not a stun)
      case 'cast': A.hop = Math.abs(Math.sin(k * 7)) * 1.5; sq(-0.04); A.mood = 'happy'; break;   // looking up, tongue out
      case 'pull': sq(0.06 * ease(k / 0.2)); A.fwd = -3; A.wx = f.t > 0.25 ? Math.sin(t * 30) * 0.6 : 0; break;
      case 'whip': { const s = (F.objs || []).find(o => o.kind === 'pyArc' && o.owner === f.i); A.spin = s ? s.s * s.side * 0.45 : 0; sq(-0.04); break; }
      case 'recoil': sq(0.04 * Math.exp(-k * 8)); break;
      case 'slither': A.sx *= 1.16; A.sy *= 0.8; A.wx = Math.sin(k * 40) * 1.5; break;   // flat and low, wriggling
      case 'coilup': sq(0.08 * Math.exp(-k * 10)); break;
      default: return null;
    }
    return A;
  },
  // on the floor: the Coil's scuff, antigravity's glow, the whip's swept band and the groove its tip drags
  ground(g, F, v, o) {
    if (o.kind === 'pyHiss') hissTrack(g, F, o, v.t);
    else if (o.kind === 'pyGlow') glow(g, F, o, v.t);
    else if (o.kind === 'pyArc') { g.save(); clipArena(g, F); arcBand(g, F, o, v.t); g.restore(); }
  },
  // standing among the fighters: antigravity's pebbles and motes, the whip's tail
  things(F, v, g, o, out) {
    if (o.kind === 'pyGlow' && ready()) glowThings(F, v, g, o, out);
    else if (o.kind === 'pyArc' && ready()) { const f = F.f[o.owner], e = F.f[1 - o.owner]; if (f) out.push({ y: Math.min(f.y, e ? e.y : f.y) - 0.5, d: () => tail(g, F, v, o, f) }); }   // (on the floor: under both of them)
  },
  // before a fighter: Pyth's long body behind his head (the lunge, the sprawl, the slither), his tail coming back; the
  // far turns of his coils round whoever he holds, the far half of the halo round whoever floats
  behind(g, F, v, f) {
    // the tail coming back lies on the floor out toward the one it swept: drawn before whichever of the two comes first
    // (so they stand over it), once a frame
    for (const H of F.f) if (H.id === ID && H.ph === 'recoil' && ready()) { const o = F.f[1 - H.i]; if ((f === H && !(o && o.y < H.y)) || (f === o && o.y < H.y)) recoilTail(g, H); }
    if (f.id === ID) {
      const ext = stretch(f);
      if (ext > 3) lungeBody(g, f, ext);
      if (f.ph === 'slither') slitherBody(g, v, f);
      if (f.ph === 'rear' && ready() && every(v, 'rr' + f.i, 0.2)) dust(v, f.x + frnd(-12, 12), f.y + frnd(-3, 5), 1, { speed: [6, 18], up: [4, 12], s: [2.5, 4], al: 0.55 });   // (his coil shifting in the dust as he rears)
    }
    const H = holderOf(F, f);
    if (H && ready()) { g.save(); g.translate(f.x, f.y - (f.z || 0)); coil3(g, f, v.t, H, -1, F); g.restore(); }
    const gl = glowOn(F, f);
    if (gl) { g.save(); g.translate(f.x, f.y - (f.z || 0)); halo(g, f, v.t, gl, -1); g.restore(); }
    return null;
  },
  // after a fighter: the near turns of his coils round them, the near half of the halo
  over(g, F, v, f) {
    const H = holderOf(F, f);
    if (H) { if (ready()) coil3(g, f, v.t, H, 1, F); else coils(g, f, v.t, H); }
    const gl = glowOn(F, f);
    if (gl) halo(g, f, v.t, gl, 1);
  },
  event(v, F, e, few) {
    switch (e.kind) {
      case 'pyRear': case 'pySqueeze': return true;
      case 'pyLunge': { const f = F.f[e.who]; if (f) { const x = f.x - Math.cos(f.face) * 12, y = f.y - Math.sin(f.face) * 12; if (ready()) { dust(v, x, y, few ? 2 : 4, { dir: f.face + Math.PI, spread: 1.6 }); sand(v, x, y, few ? 2 : 4, { dir: f.face + Math.PI, spread: 1.2, speed: [30, 80], up: [60, 120] }); } else puff(v, x, y, few ? 1 : 3, null); } return true; }
      case 'pyCatch': if (ready()) { dust(v, e.x, e.y, few ? 3 : 5, { speed: [30, 70] }); sand(v, e.x, e.y, few ? 3 : 6); } else puff(v, e.x, e.y, few ? 2 : 3, null); return true;
      case 'pyToss': if (ready()) { dust(v, e.x, e.y, few ? 4 : 7, { speed: [50, 100], up: [10, 30], r: 10 }); sand(v, e.x, e.y, few ? 3 : 6, { speed: [60, 130] }); } else v.fx.push({ k: 'dring', x: e.x, y: e.y, t: 0, life: 0.4, s: 26, id: 4 }); return true;
      case 'pySprawl': if (ready()) { dust(v, e.x, e.y, few ? 3 : 5, { speed: [25, 60] }); sand(v, e.x, e.y, few ? 2 : 4); } else puff(v, e.x, e.y, few ? 2 : 3, null); return true;
      case 'pyCast': return true;
      case 'pyLift': if (!ready()) for (let k = 0; k < (few ? 4 : 8); k++) { const a = frnd(0, TAU), r = frnd(4, 20); v.fx.push({ k: 'mote', x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r * 0.5, vx: 0, vy: -frnd(30, 60), t: 0, life: frnd(0.6, 1), s: frnd(1.6, 2.6), col: '255,236,170' }); } return true;
      case 'pyFizzle': if (ready()) dust(v, e.x, e.y, few ? 2 : 3, { speed: [10, 30], r: 20, al: 0.6 }); return true;
      case 'pyWhip': return true;
      case 'pySlither': if (ready()) dust(v, e.x, e.y, few ? 2 : 3, { speed: [20, 50] }); else puff(v, e.x, e.y, few ? 1 : 2, null); return true;
    }
    return false;
  },
  icon(g, kind, r, col) {
    g.fillStyle = col || '#ffffff'; g.strokeStyle = col || '#ffffff'; g.lineCap = 'round'; g.lineJoin = 'round';
    switch (kind) {
      case 'pyCoil':   // a coil with a head reaching out of it
        g.lineWidth = r * 0.16; g.beginPath(); for (let k = 0; k <= 40; k++) { const a = k / 40 * TAU * 1.6, rr = r * (0.18 + 0.32 * k / 40); g.lineTo(-r * 0.2 + Math.cos(a) * rr, r * 0.12 + Math.sin(a) * rr * 0.8); } g.lineTo(r * 0.55, -r * 0.45); g.stroke();
        circle(g, r * 0.62, -r * 0.52, r * 0.2); g.fill();
        return true;
      case 'pyAnti':   // a little body floating up off a glow
        g.globalAlpha *= 0.55; g.beginPath(); g.ellipse(0, r * 0.6, r * 0.72, r * 0.22, 0, 0, TAU); g.fill(); g.globalAlpha /= 0.55;
        circle(g, 0, -r * 0.28, r * 0.3); g.fill();
        for (const [x, y] of [[-0.45, 0.2], [0.42, 0.05], [0.05, 0.32]]) { circle(g, x * r, y * r, r * 0.07); g.fill(); }
        return true;
      case 'pyWhip':   // a tail sweeping a wide arc, its tip
        g.lineWidth = r * 0.12; g.globalAlpha *= 0.5; g.beginPath(); g.arc(-r * 0.4, r * 0.35, r * 0.95, -1.35, 0.1); g.stroke(); g.globalAlpha /= 0.5;
        g.lineWidth = r * 0.2; g.beginPath(); g.moveTo(-r * 0.4, r * 0.35); g.quadraticCurveTo(r * 0.1, -r * 0.1, r * 0.52, -r * 0.5); g.stroke();
        circle(g, r * 0.52, -r * 0.5, r * 0.12); g.fill();
        return true;
      case 'pySlither':   // an S, low and fast
        g.lineWidth = r * 0.18; g.beginPath(); g.moveTo(-r * 0.75, r * 0.3); g.bezierCurveTo(-r * 0.35, -r * 0.35, -r * 0.05, r * 0.6, r * 0.3, r * 0.05); g.quadraticCurveTo(r * 0.5, -r * 0.2, r * 0.75, -r * 0.15); g.stroke();
        circle(g, r * 0.78, -r * 0.16, r * 0.14); g.fill();
        return true;
    }
    return false;
  },
  sound(e) {
    switch (e.kind) {
      case 'pyRear': return [['fCoil', 0.55]];
      case 'pyLunge': return [['fWhiff', 0.7]];
      case 'pyCatch': return [['fGrab', 0.7]];
      case 'pySqueeze': return [['pySqueeze', 0.6]];
      case 'pyToss': return [['fThrow', 0.6]];
      case 'pySprawl': return [['fBelly', 0.4]];
      case 'pyCast': return [['fPop', 0.3]];
      case 'pyLift': return [['fLift', 0.6]];
      case 'pyFizzle': return [['fWhiff', 0.3]];
      case 'pyWhip': return [['fWhip', 0.7]];
      case 'pySlither': return [['fStep', 0.7]];
    }
    return null;
  },
  sounds: {
    pySqueeze: ({ osc, hiss }) => (v, t) => { osc(t, 150, 0.12, 'triangle', 0.12 * v, -40); hiss(t, 0.1, 0.05 * v, 'bandpass', 700, 400); },   // a soft creak
  },
};

// ---------------------------------------------------------------- the Coil
// the lunge (and the sprawl after a miss): his body sliding out low over the floor from where he was to his head (the
// model, moved out ext along his facing), a slither's wave running down it, thinning toward the tail end
function lungeBody(g, f, ext) {
  const c = Math.cos(f.face), s = Math.sin(f.face), nx = -s, ny = c, k = f.pht || 0;
  if (!ready()) {
    const n = 14, pts = [];
    for (let j = 0; j <= n; j++) { const u = j / n, d = -8 + (ext + 14) * u, wv = Math.sin(u * 7 - k * 20) * 3 * Math.sin(u * Math.PI); pts.push([f.x + c * d + nx * wv, f.y + s * d + ny * wv - 9 - 6 * u]); }
    g.fillStyle = 'rgba(20,16,42,0.16)'; g.beginPath(); g.ellipse(f.x + c * ext * 0.5, f.y + s * ext * 0.5 + 2, ext * 0.5 + 8, 6, f.face, 0, TAU); g.fill();
    snakeBody(g, pts, u => 4.5 + 2.5 * u);
    return;
  }
  const L = ext + 22, p = u => { const d = -16 + L * u, wv = Math.sin(u * 6.5 - k * 22) * 4 * Math.sin(u * Math.PI); return [f.x + c * d + nx * wv, f.y + s * d + ny * wv, 4.5 + 6 * u * u]; };
  const segs = spine(floorAt(p, u => 0.55 + 0.42 * Math.sqrt(u)), gapOf, 32);
  body(g, segs, 1, 10);
}

// the coils round whoever he holds (seen as their model is): his body comes in low from him and winds up round them in
// a helix, 2.3 turns, drawn tighter as he squeezes (a pinch at each tick), the end of it tapering at the top. side -1:
// the far half of each turn (before their model), 1 the near half and the length running back to him
function coil3(g, f, t, H, side, F) {
  const k = clamp(H.pht / 0.22, 0, 1), pinch = H.pyN > 0 ? 1 - 0.08 * Math.exp(-(H.pyT || 0) / 0.06) : 1;
  const R = (f.r + 6.5) * (1.3 - 0.3 * ease(k)) * pinch, th0 = Math.atan2(H.y - f.y, H.x - f.x), turns = 2.3, z0 = 8, z1 = 36;
  const p = u => { const th = th0 + u * turns * TAU; return [R * Math.cos(th), R * Math.sin(th), z0 + (z1 - z0) * u + 1.2 * Math.sin(t * 9 + u * 9) * k]; };
  const at0 = bodyAt(p, u => 0.95 - 0.38 * u * u), at = u => { const q = at0(u); q.th = th0 + u * turns * TAU; return q; };
  const segs = spine(at, gapOf, 72);
  // grouped by half-turn: each its own two passes, bottom up (so a turn's outline shows over the one under it)
  const groups = new Map();
  for (const q of segs) {
    const sn = Math.sin(q.th); if ((sn >= 0 ? 1 : -1) !== side) continue;
    const key = Math.floor(q.th / Math.PI); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(q);
  }
  // the length of him running from his body to the first turn (on whichever side of them he is)
  const sn0 = Math.sin(th0);
  if ((sn0 >= 0 ? 1 : -1) === side) {
    const ex = R * Math.cos(th0), ey = R * Math.sin(th0) * SE, ez = z0 * CE, ox = H.x - f.x, oy = H.y - f.y, oc = Math.cos(H.face), os = Math.sin(H.face);
    const sx = ox + oc * 8, sy = oy + os * 8, q = u => [sx + (ex - sx) * u - os * 5 * Math.sin(u * Math.PI), sy + (ey - sy) * u + oc * 5 * Math.sin(u * Math.PI), 6 + (ez - 6) * u];
    body(g, spine(floorAt(q, 0.98), gapOf, 20), 1, 9);
  }

  for (const key of [...groups.keys()].sort((a, b) => a - b)) { snake(g, groups.get(key)); }
}

// ---------------------------------------------------------------- antigravity
// the glow on the floor: a warm pool of light brightening as it comes on (a soft darker rim under it so it reads on a
// pale floor); it lifts and fades, or fizzles out. (Its pebbles and motes stand among the fighters: glowThings)
function glowAmt(F, o) {
  const mv = F.f[o.owner].stats.moves.move2;
  let u = clamp((o.t || 0) / mv.delay, 0, 1), a = clamp((o.t || 0) / 0.12, 0, 1);
  if (o.ph === 'fizz') a *= clamp((o.life - o.t) / 0.35, 0, 1);
  if (o.ph === 'lift') { u = 1; a = clamp((o.life - o.t) / 0.5, 0, 1); }
  return [u, a];
}
function glow(g, F, o, t) {
  const r = o.r || 38, [u, a] = glowAmt(F, o);
  if (a <= 0.01) return;
  const pulse = 1 + 0.03 * Math.sin(t * 6);
  softDisc(g, o.x, o.y, r * 1.12, [[0, '120,90,30', 0], [0.75, '120,90,30', 0.1 * a], [1, '120,90,30', 0]]);
  softDisc(g, o.x, o.y, r * pulse, [[0, '255,240,180', (0.2 + 0.4 * u) * a], [0.6, '255,226,140', (0.12 + 0.26 * u) * a], [1, '255,226,140', 0]]);
  softDisc(g, o.x, o.y, r * 0.42, [[0, '255,252,232', (0.15 + 0.4 * u) * a], [1, '255,252,232', 0]]);
  if (!ready()) for (let k = 0; k < 7; k++) {   // (2D stand-ins for the motes)
    const sd = (o.id || 1) * 3.1 + k * 1.7, q = (t * (0.7 + 0.3 * hsh(sd)) + hsh(sd + 1)) % 1, an = hsh(sd + 2) * TAU, d = r * 0.75 * Math.sqrt(hsh(sd + 3));
    const x = o.x + Math.cos(an) * d + Math.sin(t * 2 + k) * 2, y = o.y + Math.sin(an) * d * 0.8 - q * (18 + 26 * u), al = Math.sin(q * Math.PI) * a * (0.4 + 0.6 * u);
    g.fillStyle = `rgba(255,248,214,${al.toFixed(3)})`; circle(g, x, y, 1.6); g.fill();
  }
}
// pebbles lifting off the glow and hanging there, bobbing and turning slowly, higher as it comes on (lifted: they shoot
// up and fade; fizzled: they drop back), and motes of light rising off it, each over a soft glow
function glowThings(F, v, g, o, out) {
  const r = o.r || 38, [u, a] = glowAmt(F, o), t = v.t, seed = (o.id || 1) * 2.3;
  if (a <= 0.01) return;
  const since = o.ph === 'lift' || o.ph === 'fizz' ? Math.max(0, o.t - (o.life - (o.ph === 'lift' ? F.f[o.owner].stats.moves.move2.float : 0.35))) : 0;
  for (let k = 0; k < 7; k++) {
    const sd = seed + k * 3.7, an = hsh(sd) * TAU, d = r * (0.25 + 0.6 * Math.sqrt(hsh(sd + 1))), x = o.x + Math.cos(an) * d, y = o.y + Math.sin(an) * d * 0.85;
    let z = (3 + (7 + 12 * hsh(sd + 2)) * ease(u)) + Math.sin(t * 2.6 + k * 1.9) * 1.6 * u, al = 1;
    if (o.ph === 'lift') { z += since * since * 160 + since * 30; al = clamp(1 - since / 0.6, 0, 1); }
    else if (o.ph === 'fizz') z = Math.max(0, z * (1 - since / 0.2));
    if (al <= 0.01) continue;
    const sz = 1.5 + 1.5 * hsh(sd + 3), kind = k % 3 ? 'bit:rock' : 'bit:po:sand';
    out.push({ y, d: () => {
      const q = 1 / (1 + z / 40); g.fillStyle = `rgba(60,44,20,${(0.22 * a * al * q).toFixed(3)})`; g.beginPath(); g.ellipse(x + 0.5, y + 0.5, sz * 1.2 * q, sz * 0.5 * q, 0, 0, TAU); g.fill();
      g.save(); g.translate(x, y - z); drawProp3D(g, kind, { frame: hsh(sd + 4) * 12 + t * (0.8 + hsh(sd + 5)) * u, scale: sz / 4, alpha: a * al }); g.restore();
    } });
  }
  const n = o.ph === 'lift' ? 5 : 6;
  for (let k = 0; k < n; k++) {
    const sd = seed + 40 + k * 1.7, q = (t * (0.45 + 0.25 * hsh(sd)) + hsh(sd + 1)) % 1, an = hsh(sd + 2) * TAU + t * 0.6, d = r * 0.7 * Math.sqrt(hsh(sd + 3));
    const x = o.x + Math.cos(an) * d, y = o.y + Math.sin(an) * d * 0.8, z = 4 + q * (26 + 30 * u), al = Math.sin(q * Math.PI) * a * (0.35 + 0.65 * u);
    if (al <= 0.02) continue;
    out.push({ y, d: () => { glowAt(g, x, y - z, 10, al * 0.85); g.save(); g.translate(x, y - z); drawProp3D(g, 'py:mote', { scale: 0.8 + 0.45 * hsh(sd + 4), alpha: al }); g.restore(); } });
  }
}
// the halo round whoever floats: a soft ring of warm light round their middle bobbing gently (its far half behind them,
// its near half in front), a glow behind them, three motes circling it. At (0, 0): their feet, lifted
function halo(g, f, t, o, side) {
  const a = clamp((o.life - o.t) / 0.35, 0, 1) * clamp(f.t / 0.25, 0, 1);
  if (a <= 0.01) return;
  const R = f.r + 9, hz = 25 + Math.sin(t * 3.1) * 1.6, sc = R / 20;
  if (!ready()) return;
  if (side < 0) glowAt(g, 0, -hz - 6, R * 1.9, 0.5 * a);
  g.save(); g.translate(0, -hz * CE); drawProp3D(g, 'py:halo', { state: side < 0 ? 'b' : 'f', scale: sc, alpha: 0.88 * a }); g.restore();
  for (let k = 0; k < 3; k++) {
    const th = t * 1.8 + k * TAU / 3, sn = Math.sin(th); if ((sn >= 0 ? 1 : -1) !== side) continue;
    const x = Math.cos(th) * R, y = sn * R * SE - (hz + 2 * Math.sin(t * 4 + k)) * CE;
    glowAt(g, x, y, 6, 0.7 * a); g.save(); g.translate(x, y); drawProp3D(g, 'py:mote', { scale: 0.7, alpha: a }); g.restore();
  }
}

// ---------------------------------------------------------------- the Indentation Whip
// the tail: pulled back, it curls round behind him from the side the sweep starts, its tip up off the floor and rattling
// (longer as he winds); sweeping, it runs out low over the floor to the arc's edge, trailing a little behind its tip,
// sand and dust kicked off along it
function tail(g, F, v, o, f) {
  const A = o.arc, mv = f.stats.moves.move3, start = o.a - o.side * A / 2;
  if (o.ph !== 'go') {
    const w = ease(clamp(f.t / Math.max(0.05, f.dur), 0, 1)), L = 30 + 46 * w, back = o.a + Math.PI;
    const p = u => { const b = back + (start - o.side * 0.5 - back) * u * 0.9, rr = 9 + L * u, rat = u > 0.75 ? Math.sin(v.t * 46) * 1.6 * (u - 0.75) * 4 * w : 0; return [o.x + Math.cos(b) * rr - Math.sin(b) * rat, o.y + Math.sin(b) * rr + Math.cos(b) * rat, 4 + 14 * Math.pow(u, 3) * w]; };
    body(g, spine(floorAt(p, u => 0.92 - 0.6 * u), gapOf, 30), 1, 8);
    return;
  }
  const cur = o.a + o.side * (o.s ?? -A / 2), reach = o.r1 - 4;
  const p = u => { const b = cur - o.side * 0.38 * u * u, rr = 9 + (reach - 9) * u; return [o.x + Math.cos(b) * rr, o.y + Math.sin(b) * rr, 5 - 2 * u]; };
  body(g, spine(floorAt(p, u => 0.95 - 0.68 * u), gapOf, 48), 1, 9);
  // sand and dust kicked off the tip along the sweep (a few a frame, never too many)
  if (f.ph === 'whip' && every(v, 'wh' + f.i, 1 / 45)) {
    const tipR = reach - mv.tipW * 0.4, x = o.x + Math.cos(cur) * tipR, y = o.y + Math.sin(cur) * tipR, tng = cur + o.side * Math.PI / 2;
    sand(v, x, y, 2, { dir: tng, spread: 0.9, speed: [70, 150], up: [70, 140] });
    if (every(v, 'whd' + f.i, 1 / 15)) dust(v, x, y, 1, { dir: tng, spread: 0.6, speed: [30, 60], s: [4, 6.5] });
  }
}
// the tail coming back after the sweep: drawn in along the far side, shortening
function recoilTail(g, f) {
  const mv = f.stats.moves.move3, k = clamp((f.pht || 0) / (mv.recovery * 0.8), 0, 1); if (k >= 1) return;
  const end = f.face + (f.pyW || 1) * mv.arc * Math.PI / 360, L = (mv.r1 - 13) * (1 - ease(k));
  if (L < 6) return;
  const p = u => { const b = end + (f.pyW || 1) * 0.3 * u * u - (f.pyW || 1) * 0.8 * k * u, rr = 9 + L * u; return [f.x + Math.cos(b) * rr, f.y + Math.sin(b) * rr, 5 - 2 * u]; };
  body(g, spine(floorAt(p, u => 0.95 - 0.66 * u), gapOf, 36), 1, 9);
}

// ---------------------------------------------------------------- Slither
// his body streaming out behind him in a running S, flat to the floor, sand kicked up to both sides behind him
function slitherBody(g, v, f) {
  if (!ready()) {
    if (v.fx.length < 130 && frnd(0, 1) < 0.5) v.fx.push({ k: 'dust', x: f.x - Math.cos(f.face) * 10, y: f.y - Math.sin(f.face) * 10, vx: frnd(-20, 20), vy: frnd(-12, 4), t: 0, life: 0.4, s: frnd(4, 6), c: null });
    return;
  }
  const c = Math.cos(f.face), s = Math.sin(f.face), nx = -s, ny = c, k = f.pht || 0, L = 58;
  const p = u => { const d = 4 - L * u, wv = Math.sin(u * 7.5 + k * 34) * 6 * Math.min(1, u * 3); return [f.x + c * d + nx * wv, f.y + s * d + ny * wv, 3.5 - 1 * u]; };
  body(g, spine(floorAt(p, u => 0.85 - 0.55 * u), gapOf, 32), 1, 9);
  if (every(v, 'sl' + f.i, 1 / 30)) {
    const x = f.x - c * 14, y = f.y - s * 14;
    for (const sd of [1, -1]) sand(v, x, y, 1, { dir: f.face + Math.PI + sd * 1.1, spread: 0.5, speed: [60, 120], up: [60, 120] });
    if (every(v, 'sld' + f.i, 1 / 12)) dust(v, x, y, 1, { dir: f.face + Math.PI, spread: 1.4, speed: [15, 40] });
  }
}

// ---------------------------------------------------------------- the tells on the floor
// the Coil's line: a soft S-shaped scuff through the dust from him out along where he'll strike, running out as he
// rears (a darker trough with a pale crest beside it, soft at both ends), a few grains of sand rolling out along it;
// once he strikes it fades behind his head
function hissTrack(g, F, o, t) {
  const L = o.len || 0; if (L < 6) return;
  const go = o.ph === 'go', a = go ? clamp(1 - (o.t - 0.35) / 0.2, 0, 1) * 0.8 : clamp(o.t / 0.1, 0, 1);
  if (a <= 0.01) return;
  const c = Math.cos(o.a), s = Math.sin(o.a), nx = -s, ny = c, f = F.f[o.owner], r0 = (f ? f.r : 15) + 4;
  const at = (d, k) => { const u = d / Math.max(1, L), wv = Math.sin(d * 0.085 + 0.6) * 6 * Math.sin(Math.min(1, u * 1.4) * Math.PI / 2); return [o.x + c * d + nx * (wv + k), o.y + s * d + ny * (wv + k)]; };
  const grad = (rgb, al) => { const [x0, y0] = at(r0, 0), [x1, y1] = at(L, 0), gr = g.createLinearGradient(x0, y0, x1, y1), q = Math.min(0.4, 22 / Math.max(1, L - r0));
    gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(q, `rgba(${rgb},${(al * a).toFixed(3)})`); gr.addColorStop(1 - q, `rgba(${rgb},${(al * a).toFixed(3)})`); gr.addColorStop(1, `rgba(${rgb},0)`); return gr; };
  const line = k => { g.beginPath(); for (let d = r0; d <= L; d += 4) { const [x, y] = at(Math.min(d, L), k); d === r0 ? g.moveTo(x, y) : g.lineTo(x, y); } };
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = grad('52,40,30', 0.11); g.lineWidth = 14; line(0); g.stroke();   // (the trough: soft, wide)
  g.strokeStyle = grad('52,40,30', 0.1); g.lineWidth = 6; line(1); g.stroke();
  g.strokeStyle = grad('255,248,232', 0.32); g.lineWidth = 2.4; line(-6); g.stroke();   // (the crest beside it)
  const r3 = ready();
  for (let k = 0; k < 5; k++) {   // grains of sand rolling out along it toward its end
    const q = (t * 0.9 + k / 5) % 1, d = r0 + (L - r0) * q, [x, y] = at(d, (hsh(k + (o.id || 0)) - 0.5) * 10), al = Math.sin(q * Math.PI) * a * 0.9;
    if (r3) { g.save(); g.translate(x, y - 1.5); drawProp3D(g, 'bit:po:sand', { frame: q * 30 + k * 3, scale: 0.45, alpha: al }); g.restore(); continue; }
    g.fillStyle = `rgba(80,64,48,${(0.35 * al).toFixed(3)})`; circle(g, x + 0.5, y + 0.8, 1.7); g.fill();
    g.fillStyle = `rgba(255,250,236,${al.toFixed(3)})`; circle(g, x, y - 1, 1.4); g.fill();
  }
  g.restore();
}
// the whip: before it, a faint swept band of dust over the arc (soft at its ends, darker toward its outer edge where the
// tip goes), a few grains drifting round it the way it'll sweep; sweeping, a groove dragged through the dust behind the
// tip (a dark furrow with a light lip on its lower side), fading behind it
function arcBand(g, F, o, t) {
  const f = F.f[o.owner]; if (!f) return;
  const A = o.arc, r0 = o.r0, r1 = o.r1, mv = f.stats.moves.move3, go = o.ph === 'go';
  const wind = go ? 1 : clamp(f.t / Math.max(0.05, f.dur), 0, 1), a0 = go ? 0.8 : 0.35 + 0.65 * ease(wind / 0.5);
  const tipAt = (r1 - mv.tipW - r0) / (r1 - r0), n = 8;
  g.save();
  const gr = g.createRadialGradient(o.x, o.y, r0, o.x, o.y, r1 + 4);
  gr.addColorStop(0, 'rgba(60,48,36,0)'); gr.addColorStop(0.25, 'rgba(60,48,36,0.07)'); gr.addColorStop(clamp(tipAt, 0.3, 0.9), 'rgba(60,48,36,0.12)');
  gr.addColorStop(0.95, 'rgba(60,48,36,0.22)'); gr.addColorStop(1, 'rgba(60,48,36,0)');
  g.fillStyle = gr;
  const fadeGo = go ? 1 - clamp(o.t / 0.5, 0, 1) * 0.6 : 1;
  for (let k = 0; k < n; k++) {   // nested, each a little narrower: soft toward the ends of the arc (no seams)
    const d = A * 0.22 * k / n, b0 = o.a - A / 2 + d, b1 = o.a + A / 2 - d;
    g.globalAlpha = a0 * fadeGo * 1.6 / n;
    g.beginPath(); g.arc(o.x, o.y, r1 + 4, b0, b1); g.arc(o.x, o.y, r0, b1, b0, true); g.closePath(); g.fill();
  }
  g.globalAlpha = 1;
  if (!go) {   // grains drifting round the arc the way it'll sweep
    for (let k = 0; k < 6; k++) {
      const q = (t * 0.8 + k / 6) % 1, b = o.a + o.side * (-A / 2 + A * q), rr = r0 + (r1 - r0) * (0.5 + 0.45 * hsh(k + (o.id || 0))), x = o.x + Math.cos(b) * rr, y = o.y + Math.sin(b) * rr, al = Math.sin(q * Math.PI) * a0 * 0.8;
      g.fillStyle = `rgba(80,64,48,${(0.3 * al).toFixed(3)})`; circle(g, x + 0.5, y + 0.8, 1.7); g.fill();
      g.fillStyle = `rgba(255,250,236,${al.toFixed(3)})`; circle(g, x, y - 1, 1.4); g.fill();
    }
  } else {
    const cur = o.a + o.side * (o.s ?? -A / 2), from = o.a - o.side * A / 2, rr = r1 - 4 - mv.tipW * 0.4;
    const m = 14, span = Math.min(1.3, Math.abs(cur - from)), fade = clamp(1 - (f.pht || 0) / 0.6, 0, 1);
    g.lineCap = 'round';
    for (let k = 0; k < m; k++) {   // (the groove: in short pieces, fading toward where it began)
      const u0 = k / m, u1 = (k + 1) / m, b0 = cur - o.side * (1 - u0) * span, b1 = cur - o.side * (1 - u1) * span, q = u1 * fade;
      if (q < 0.03) continue;
      const lo = Math.min(b0, b1), hi = Math.max(b0, b1) + 0.01;
      g.strokeStyle = `rgba(255,250,238,${(0.45 * q).toFixed(3)})`; g.lineWidth = 2.2; g.beginPath(); g.arc(o.x + 0.6, o.y + 1.4, rr, lo, hi); g.stroke();
      g.strokeStyle = `rgba(70,54,38,${(0.3 * q).toFixed(3)})`; g.lineWidth = 3; g.beginPath(); g.arc(o.x, o.y, rr, lo, hi); g.stroke();
    }
    if (f.ph === 'whip' && !ready()) {   // (2D stand-in for the tail)
      const pts = [], N = 16;
      for (let k = 0; k <= N; k++) { const u = k / N, rr2 = 10 + (r1 - 6) * u, b = cur - o.side * 0.35 * u * u; pts.push([o.x + Math.cos(b) * rr2, o.y + Math.sin(b) * rr2 - 6 * (1 - u)]); }
      snakeBody(g, pts, u => 6.5 - 4.6 * u);
    }
  }
  g.restore();
}

// ---------------------------------------------------------------- 2D stand-ins (no WebGL, or before the bake)
// a snake's body along pts (screen points), w(u) its half-width: blue on top, the yellow belly along its lower edge
function snakeBody(g, pts, w) {
  const n = pts.length - 1; if (n < 1) return;
  const side = sgn => pts.map(([x, y], k) => {
    const [ax, ay] = pts[Math.max(0, k - 1)], [bx, by] = pts[Math.min(n, k + 1)], l = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / l, ny = (bx - ax) / l, ww = w(k / n);
    return [x + nx * ww * sgn, y + ny * ww * sgn];
  });
  const A = side(1), B = side(-1);
  const shape = () => { g.beginPath(); A.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); for (let k = n; k >= 0; k--) g.lineTo(B[k][0], B[k][1]); g.closePath(); };
  if (!bold()) { g.strokeStyle = 'rgba(18,43,68,0.55)'; g.lineWidth = 1.6; shape(); g.stroke(); }
  g.fillStyle = BLUE; shape(); g.fill();
  g.strokeStyle = YEL; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let k = 0; k < n; k++) {
    const lo = (p, q) => (p[1] > q[1] ? p : q);
    const p0 = lo(A[k], B[k]), p1 = lo(A[k + 1], B[k + 1]), m0 = pts[k], m1 = pts[k + 1], q = 0.45;
    g.lineWidth = Math.max(1, w(k / n) * 0.7); g.beginPath(); g.moveTo(m0[0] + (p0[0] - m0[0]) * q, m0[1] + (p0[1] - m0[1]) * q); g.lineTo(m1[0] + (p1[0] - m1[0]) * q, m1[1] + (p1[1] - m1[1]) * q); g.stroke();
  }
}
// the coils round whoever he's wrapped up: three loops of him, tightening, his body running back to him
function coils(g, f, t, H) {
  const k = clamp(H.pht / 0.22, 0, 1), squeeze = 1 + 0.06 * Math.sin(t * 18) * k, BD = bold();
  const dx = H.x - f.x, dy = H.y - f.y;
  g.save(); g.lineCap = 'round';
  for (let b = 0; b < 3; b++) { const y = -12 - b * 11, rx = (f.r + 7 - b * 1.5) * (1.25 - 0.25 * k) / squeeze; g.strokeStyle = BLUE_D; g.lineWidth = 6; g.beginPath(); g.ellipse(0, y, rx, 5.5, 0, Math.PI, TAU); g.stroke(); }
  g.strokeStyle = BLUE; g.lineWidth = 7; g.beginPath(); g.moveTo(dx * 0.62, dy * 0.62 - 10); g.quadraticCurveTo(dx * 0.3, dy * 0.3 - 4, 0, -10); g.stroke();
  for (let b = 0; b < 3; b++) {
    const y = -12 - b * 11, rx = (f.r + 7 - b * 1.5) * (1.25 - 0.25 * k) / squeeze;
    if (!BD) { g.strokeStyle = 'rgba(18,43,68,0.5)'; g.lineWidth = 8; g.beginPath(); g.ellipse(0, y, rx, 5.5, 0, 0, Math.PI); g.stroke(); }
    g.strokeStyle = BLUE; g.lineWidth = 6.5; g.beginPath(); g.ellipse(0, y, rx, 5.5, 0, 0, Math.PI); g.stroke();
    g.strokeStyle = YEL; g.lineWidth = 2.2; g.beginPath(); g.ellipse(0, y + 2, rx * 0.96, 5, 0, 0.3, Math.PI - 0.3); g.stroke();
  }
  g.restore();
}
