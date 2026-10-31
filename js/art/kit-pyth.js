// Pyth's moves drawn (the sim: js/kits/pyth.js). Cosmetic only. His long body is a chain of baked 3D segments
// (art/chain3d.js), the dust, sand, venom and apple bits are 3D props (art/prop3d.js); 2D stand-ins before the bake.
//   Whip     the body twists away, then the tail swings low through the arc with a smear and a groove behind its tip
//   Coil     drawn back into a trembling S, then his body springs out straight, the loops at his tail unwinding; caught,
//            his coils wrap them in a helix and squeeze; tossed, venom glints and drops (the poison: js/art/status.js)
//   Apple    a glint up high and a growing shadow, a shiny apple drops and bounces; eaten, it hops into his mouth with a
//            crunch, leaves and glints rising round him; squashed, chunks and a pulpy splat
//   Slither  flat and low, his body streaming behind him in an S, a wavy track left in the sand
// Tells are his body's own wind-ups, nothing on the floor. Calm: no shakes.
import { TAU, clamp, frnd } from '../core.js';
import { bold } from '../look.js';
import { puff } from '../draw-fight.js';
import { animBase, settleAnim } from './kits.js';
import * as M3 from './model3d.js';
import { bit3, bits3, defBit, defProp, drawProp3D, lathe3, propReady, propsFor } from './prop3d.js';
import { CE, SE, SHARED_BITS, bodyAt, bodyShadow, drawSegs, floorAt, segReady, segTube, spine } from './chain3d.js';
import { softShadow } from './arena-mat.js';

const ID = 'pyth';
const BLUE = '#3776ab', BLUE_D = '#25507d', YEL = '#ffd43b';
const backE = k => { k = clamp(k, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
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
// the venom: its drops (bits: thrown off the Coil's bite, dripping off the poisoned), the bubbles rising off the
// poisoned (glossy, a green-to-purple sheen) and a puff of its sickly mist
const VEN = '#7fd64a', VEN_D = '#3f8a2a';
function dropMesh() { const out = []; M3.ellipsoid(out, [0, 0, 0], [[2.1, 0, 0], [0, 2.1, 0], [0, 0, 2.9]], M3.hex(VEN), M3.WET, 14, 10); M3.ball(out, [-0.8, -0.9, 1.3], 0.55, M3.hex('#f4ffe6'), M3.GLOSS, 0, 8, 6); return out; }
function bubMesh() { const out = []; M3.ball(out, [0, 0, 0], 3, M3.hex('#a8e070'), M3.GLOSS, 0.55, 14, 10); M3.decal(out, [0.9, 1.1, -1.2], [0.4, 0.5, -0.7], 1.6, 1, 0.3, M3.hex('#9a6ad0'), 0, 0, M3.GLOSS); M3.ball(out, [-1, -1.2, 1.6], 0.7, M3.hex('#ffffff'), M3.GLOSS, 0, 8, 6); return out; }
function mistMesh() { const out = []; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU, rr = k ? 2.6 : 0; M3.ball(out, [Math.cos(a) * rr, Math.sin(a) * rr, k ? (hsh(k) - 0.5) * 2 : 1], k ? 2.3 + hsh(k + 1) : 3.2, M3.hex(k % 2 ? '#b9dd8e' : '#c6b4de'), M3.MATTE, 0.5, 12, 8); } return out; }
defBit('pyvdrop', { mesh: dropMesh, ink: VEN_D, out: 0.35, n: 1, r0: 2.5 });
defBit('pyvbub', { mesh: bubMesh, ink: '#4f7a3a', out: 0.35, n: 1, r0: 3 });
defBit('pyvmist', { mesh: mistMesh, ink: '#6e7f5a', r0: 4.5 });
// the apple: round and shiny, a dimple at the top with a stalk and a leaf, a dimple underneath; its chunks (cream
// flesh, a red skin side) and its leaf (bits: thrown off a bite, a squash)
const APL = '#e2372f', APL_D = '#7a1612', LEAF = '#5dbb4a';
function appleMesh() {
  const out = [];
  lathe3(out, [[0.9, 0], [0.35, 1.6], [0.5, 3.6], [1.6, 5.8], [3.4, 7.6], [5.8, 8.5], [8.2, 8.3], [10.3, 7.2], [11.8, 5.3], [12.6, 3.2], [12.5, 1.6], [11.6, 0]], M3.hex(APL), M3.GLOSS, 28);
  M3.decal(out, [-4.2, -4.6, 8.4], [-0.6, -0.65, 0.2], 3.4, 2.6, 0.5, M3.hex('#f2744a'), 0.4, 0, M3.GLOSS);   // (a ripe blush on the lit side)
  M3.decal(out, [-5.4, -6.4, 9.6], [-0.5, -0.7, 0.45], 1.1, 2.3, 0.4, M3.hex('#fff4ec'), 0.7, 0, M3.GLOSS);   // (a juicy shine)
  M3.decal(out, [-2.6, -3.6, 11.4], [-0.3, -0.45, 0.85], 0.7, 0.7, 0.3, M3.hex('#ffffff'), 0, 0, M3.GLOSS);
  M3.capsule(out, [0, 0, 11.2], [1.1, 0.4, 16.4], 0.9, M3.hex('#6b4423'));
  M3.ellipsoid(out, [4.6, 1.4, 15.6], [[4.8, 1.1, 1.9], [-0.6, 2.4, 0], [-0.3, 0, 0.45]], M3.hex(LEAF), M3.MATTE, 18, 10);   // (the leaf, a lighter vein down it)
  M3.capsule(out, [1.4, 0.7, 14.1], [8.2, 2.2, 17.4], 0.3, M3.hex('#9be07a'), M3.MATTE, 0);
  return out;
}
function chunkMesh() { const out = []; M3.ellipsoid(out, [0, 0, 0], [[2, 0, 0], [0, 1.6, 0], [0, 0, 1.4]], M3.hex('#fff3cf'), M3.MATTE, 12, 8); M3.decal(out, [0, 0, 1.3], [0, 0, 1], 1.9, 1.5, 0.35, M3.hex(APL), 0, 0, M3.GLOSS); return out; }
function leafMesh() { const out = []; M3.ellipsoid(out, [0, 0, 0], [[3, 0, 0], [0, 1.4, 0], [0, 0, 0.3]], M3.hex(LEAF), M3.MATTE, 14, 8); M3.capsule(out, [-3.2, 0, 0], [-1.6, 0, 0], 0.25, M3.hex('#3f8a2a')); return out; }
defProp('py:apple', { mesh: appleMesh, n: 1, ink: APL_D, out: 0.45, ppu: 1.6 });
defBit('pyachunk', { mesh: chunkMesh, ink: '#8a5a2a', out: 0.35, n: 12, r0: 2 });
defBit('pyaleaf', { mesh: leafMesh, ink: '#2f6a22', out: 0.3, n: 12, r0: 3 });
// a drop of apple juice (thrown off the bite)
defBit('pyajuice', { mesh: () => { const out = []; M3.ellipsoid(out, [0, 0, 0], [[1.3, 0, 0], [0, 1.3, 0], [0, 0, 1.7]], M3.hex('#ffe58a'), M3.GLOSS, 12, 8, 0.5); M3.ball(out, [-0.4, -0.5, 0.7], 0.4, M3.hex('#ffffff'), M3.GLOSS, 0, 6, 4); return out; }, ink: '#b8892a', out: 0.3, n: 1, r0: 1.6 });
propsFor(ID, ['py:seg', 'py:segN', 'py:bel', 'py:belN', 'bit:pyvdrop', 'bit:pyvbub', 'bit:pyvmist', 'py:apple', 'bit:pyachunk', 'bit:pyaleaf', 'bit:pyajuice', ...SHARED_BITS]);
const ready = () => segReady('py:seg') && segReady('py:segN') && segReady('py:bel') && segReady('py:belN');
// a body along a spine: its shadow, then the segments (sc: × the segment's size)
function snake(g, segs, a = 1) { drawSegs(g, segs.map(q => ({ ...q, y: q.y + BEL_DY * q.s })), 'py:bel', 'py:belN', a); drawSegs(g, segs, 'py:seg', 'py:segN', a); }
function body(g, segs, a = 1, shadowW = 9) { bodyShadow(g, segs, shadowW, a); snake(g, segs, a); }
const gapOf = s => SEG_R * 0.62 * Math.max(0.35, s);

// the view's own memory (spawn clocks), never on the sim's objects
const MEM = new WeakMap();
const every = (v, key, dt) => { let m = MEM.get(v); if (!m) MEM.set(v, m = {}); if (m[key] != null && v.t - m[key] < dt && v.t >= m[key]) return false; m[key] = v.t; return true; };
// sandy dust and grains of sand (3D bits)
const dust = (v, x, y, n, o = {}) => bits3(v, 'po:dust', x, y, 2, n, { speed: [15, 50], up: [10, 40], s: [3.5, 6], life: [0.45, 0.8], g: 40, drag: 3, grow: 0.9, fade: 'alpha', bo: 0, al: 0.85, sh: false, sp: 0, ...o });
const sand = (v, x, y, n, o = {}) => bits3(v, 'po:sand', x, y, 3, n, { speed: [40, 110], up: [80, 170], s: [1.5, 2.4], life: [0.45, 0.75], g: 620, bo: 0.2, ...o });
// venom drops thrown (they fall and spot the floor where they land) and its mist
const drops = (v, x, y, z, n, o = {}) => bits3(v, 'pyvdrop', x, y, z, n, { speed: [40, 100], up: [40, 120], s: [2.2, 3.2], life: [0.35, 0.55], g: 520, bo: 0, sh: false, ...o });
const mist = (v, x, y, z, n, o = {}) => bits3(v, 'pyvmist', x, y, z, n, { speed: [10, 30], up: [10, 26], s: [3, 4.5], life: [0.6, 0.9], g: -10, drag: 2.2, grow: 1.3, fade: 'alpha', bo: 0, al: 0.6, sh: false, sp: 0, ...o });

// how far his head is out past where the model's own head sits (the stretched body drawn behind): the Coil's spring
// (head out over out s to reach past his edge, stopped short by a wall: pyL), and after a miss, lying out there drawn
// back in
const MODEL_HEAD = 30;
const coilR = f => { const M = f.stats.moves.move2; return Math.min(M.reach, f.pyL || M.reach); };
function stretch(f) {
  const M = f.stats.moves.move2;
  if (f.ph === 'lunge') return Math.max(0, f.r + coilR(f) * (1 - Math.pow(1 - clamp(f.t / M.out, 0, 1), 2)) - MODEL_HEAD);
  if (f.ph === 'sprawl') return Math.max(0, (f.r + coilR(f) - MODEL_HEAD) * 0.8 * (1 - ease((f.pht || 0) / 0.45)));
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

export default {
  id: ID,
  anim(F, v, f) {
    const A = animBase(), k = f.pht || 0, sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
    switch (f.ph) {
      case 'coilback': {   // drawn back low onto his coil, bunched like a spring, a tremble building (the Coil's tell)
        const q = ease(k / Math.max(0.05, f.state === 'wind' ? f.dur : f.stats.moves.move2.startup));
        sq(0.1 * q); A.fwd = -7 * q; A.lean = -0.06 * q; A.wx = Math.sin(k * 52) * 0.9 * q; break;
      }
      case 'lunge': { const M = f.stats.moves.move2, u = clamp((f.t || 0) / M.out, 0, 1); A.fwd = stretch(f); sq(0.12 * Math.sin(Math.PI * u) - 0.05); A.lean = 0.08; break; }   // (sprung out long and low)
      case 'wrap': sq(0.035 * Math.sin(k * 26)); break;   // squeezing
      case 'toss': sq(-0.08 * Math.exp(-k * 9)); break;
      case 'sprawl': Object.assign(A, settleAnim(k, f.stats.moves.move2.miss, 'sprawl', 0.35)); A.fwd = stretch(f); break;   // (missed: his long body drawn back in and he settles back onto his coil: a delay, not a stun)
      case 'pull': case 'whip': case 'recoil': case 'unwind': Object.assign(A, batAnim(F, f, k)); break;   // (the bat swing: batAnim)
      case 'call': { const q = ease(k / 0.15); sq(-0.07 * q); A.hop = 1.5 * q; A.lean = -0.05 * q; A.wx = Math.sin(k * 30) * 0.3; break; }   // (looking up for it, up tall)
      case 'called': Object.assign(A, settleAnim(k, f.dur || f.stats.moves.move3.recovery, 'cast', 0.1)); A.mood = 'happy'; break;
      case 'slither': A.sx *= 1.16; A.sy *= 0.8; A.wx = Math.sin(k * 40) * 1.5; break;   // flat and low, wriggling
      case 'coilup': sq(0.08 * Math.exp(-k * 10)); break;
      default: return null;
    }
    return A;
  },
  // on the floor: the groove the whip's tip drags
  ground(g, F, v, o) { if (o.kind === 'pyArc') { g.save(); clipArena(g, F); arcBand(g, F, o, v.t); g.restore(); } else if (o.kind === 'pyApple') appleShadow(g, o); },
  // standing among the fighters: the whip's tail
  things(F, v, g, o, out) {
    if (o.kind === 'pyApple') { out.push({ y: o.y, d: () => appleDraw(g, v, o) }); return; }
    if (o.kind === 'pyArc' && ready()) { const f = F.f[o.owner], e = F.f[1 - o.owner]; if (f) out.push({ y: Math.min(f.y, e ? e.y : f.y) - 0.5, d: () => tail(g, F, v, o, f) }); }   // (on the floor: under both of them)
  },
  // once a frame, on the floor: the slither's tracks, the scuffs his coil digs as he lunges, venom spots
  floor(g, F, v) { tracks(g, v); scuffs(g, v); splats(g, v); pulps(g, v); },
  // before a fighter: Pyth's long body behind his head (the lunges, the sprawls, the slither), his tail coming back; the
  // far turns of his coils round whoever he holds
  behind(g, F, v, f) {
    // the tail coming back lies on the floor out toward the one it swept: drawn before whichever of the two comes first
    for (const H of F.f) if (H.id === ID && (H.ph === 'recoil' || H.ph === 'unwind') && ready()) { const o = F.f[1 - H.i]; if ((f === H && !(o && o.y < H.y)) || (f === o && o.y < H.y)) (H.ph === 'recoil' ? recoilTail : unwindTail)(g, H); }
    if (f.id === ID) {
      const ext = stretch(f);
      if (ext > 3) lungeBody(g, f, ext);
      if (f.ph === 'slither') { slitherBody(g, v, f); trackAdd(v, f); }
      if (f.ph === 'pull' && ready()) cockTail(g, v, f);   // (the bat swing's tell: the tail coiled back behind him)
      if (f.ph === 'coilback' && ready() && every(v, 'rr' + f.i, 0.16)) dust(v, f.x + frnd(-12, 12), f.y + frnd(-3, 5), 1, { speed: [6, 18], up: [4, 12], s: [2.5, 4], al: 0.55 });   // (his coil shifting in the dust as he draws back)
    }
    const H = holderOf(F, f);
    if (H && ready()) { g.save(); g.translate(f.x, f.y - (f.z || 0)); coil3(g, f, v.t, H, -1, F); g.restore(); }
    return null;
  },
  // healed: a green-gold glow running down him from his head to his coils (the apple going down), a faint wash after it
  tint(F, v, f) {
    const t0 = f.id === ID && v.pyHeal && v.pyHeal[f.i], age = t0 == null ? 9 : v.t - t0; if (age < 0 || age > 0.75) return null;
    return (o, w, h) => {
      const sx = w / 150, top = h * 0.72 - 62 * sx, bot = h * 0.72, u = clamp(age / 0.55, 0, 1), c = top + (bot - top) * ease(u), bw = 16 * sx, al = 1 - clamp((age - 0.55) / 0.2, 0, 1);
      o.fillStyle = `rgba(150,230,110,${(0.16 * al).toFixed(3)})`; o.fillRect(0, 0, w, h);
      const gr = o.createLinearGradient(0, c - bw, 0, c + bw);
      gr.addColorStop(0, 'rgba(190,255,130,0)'); gr.addColorStop(0.45, `rgba(214,255,150,${(0.62 * al).toFixed(3)})`); gr.addColorStop(0.6, `rgba(255,232,120,${(0.5 * al).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,232,120,0)');
      o.fillStyle = gr; o.fillRect(0, c - bw, w, bw * 2);
    };
  },
  // after a fighter: the near turns of his coils round them (the poisoned's bubbles and wash: js/art/status.js, for
  // anyone poisoned); an apple on its way into his mouth
  over(g, F, v, f) {
    const H = holderOf(F, f);
    if (H) { if (ready()) coil3(g, f, v.t, H, 1, F); else coils(g, f, v.t, H); }
    if (f.id === ID) gulp(g, v, f);
  },
  event(v, F, e, few) {
    switch (e.kind) {
      case 'pyRear': return true;
      case 'pySqueeze': {   // each squeeze: the coils pinch in, a puff of breath squeezed out of them either side of their head, a scuff of sand at their feet
        if (!ready()) { puff(v, e.x, e.y - 30, 1, '#ffffff'); return true; }
        for (const sd of [-1, 1]) bit3(v, 'steam', e.x + sd * 9, e.y, 42, { dx: sd * frnd(30, 50), dy: frnd(-6, 6), dz: frnd(10, 30), g: -12, drag: 2.4, grow: 1.4, s: frnd(2.4, 3.4), life: frnd(0.35, 0.5), al: 0.8, sh: false });
        dust(v, e.x, e.y + 2, few ? 1 : 2, { speed: [20, 45], up: [4, 12], s: [2.5, 4], al: 0.6 });
        return true;
      }
      case 'pyLunge': { const f = F.f[e.who]; if (f) { const x = f.x - Math.cos(f.face) * 12, y = f.y - Math.sin(f.face) * 12; if (ready()) { dust(v, x, y, few ? 2 : 4, { dir: f.face + Math.PI, spread: 1.6 }); sand(v, x, y, few ? 2 : 4, { dir: f.face + Math.PI, spread: 1.2, speed: [30, 80], up: [60, 120] }); } else puff(v, x, y, few ? 1 : 3, null); scuffAdd(v, x, y, f.face); } return true; }
      case 'pyCatch': if (ready()) { dust(v, e.x, e.y, few ? 3 : 5, { speed: [30, 70] }); sand(v, e.x, e.y, few ? 3 : 6); } else puff(v, e.x, e.y, few ? 2 : 3, null); return true;
      case 'pyToss': if (ready()) { dust(v, e.x, e.y, few ? 4 : 7, { speed: [50, 100], up: [10, 30], r: 10 }); sand(v, e.x, e.y, few ? 3 : 6, { speed: [60, 130] }); } else v.fx.push({ k: 'dring', x: e.x, y: e.y, t: 0, life: 0.4, s: 26, id: 4 }); return true;
      case 'pySprawl': if (ready()) { dust(v, e.x, e.y, few ? 3 : 5, { speed: [25, 60] }); sand(v, e.x, e.y, few ? 2 : 4); } else puff(v, e.x, e.y, few ? 2 : 3, null); return true;
      case 'pyWhip': { const f = F.f[e.who]; if (f && ready()) dust(v, f.x, f.y, few ? 1 : 3, { r: 10, speed: [20, 50] }); return true; }   // (the swing: a scuff of dust off his coil as he whips round)
      case 'pyBat': {   // the tail lands like a bat: sand and dust burst off them along the swing, a soft flash, the camera nudged in
        const a = e.a ?? 0;
        if (ready()) { sand(v, e.x, e.y, few ? 4 : 9, { dir: a, spread: 1.3, speed: [90, 190], up: [90, 190] }); dust(v, e.x, e.y, few ? 3 : 6, { dir: a, spread: 1.1, speed: [40, 100], r: 8 }); }
        else puff(v, e.x, e.y, few ? 2 : 4, null);
        v.fx.push({ k: 'flash', x: e.x, y: e.y - 22, t: 0, life: 0.12, s: e.tip ? 26 : 20 });
        if (e.tip) bits3(v, 'star', e.x, e.y, 34, few ? 2 : 3, { dir: a, spread: 1.4, speed: [60, 110], up: [90, 150], s: [3.2, 4.2], life: [0.5, 0.7], g: 380, sh: false });   // (the sweet spot: a home run, stars off them)
        v.punch = { t: v.t, x: e.x, y: e.y };
        return true;
      }
      case 'pyUnwind': if (ready()) dust(v, e.x, e.y, few ? 2 : 4, { r: 14, speed: [20, 50] }); else puff(v, e.x, e.y, 2, null); return true;   // (carried right round: dust off his coil)
      case 'pyPoison': {   // the bite: two green puncture glints, a spray of venom drops and a puff of sickly mist off them (bitten again: more)
        const a = e.a ?? 0, big = !!e.again;
        v.fx.push({ k: 'py:fangs', x: e.x - Math.cos(a) * 6, y: e.y, a, t: 0, life: 0.4, s: 1.1, ven: 1 });
        if (propReady('bit:pyvdrop')) { drops(v, e.x, e.y, 24, few ? 2 : big ? 7 : 5, { dir: a, spread: 1.6 }); mist(v, e.x, e.y, 22, few ? 1 : big ? 4 : 2, { dir: a, spread: 2 }); }
        else puff(v, e.x, e.y - 20, 2, '#a8d878');
        for (let k = 0; k < (few ? 1 : 3); k++) splatAdd(v, e.x + Math.cos(a) * frnd(8, 26) + frnd(-6, 6), e.y + Math.sin(a) * frnd(8, 26) + frnd(-4, 4), frnd(1.6, 2.8));
        return true;
      }
      case 'pyCall': {   // the apple called: a glint high over where it'll land, a leaf or two drifting down ahead of it
        v.fx.push({ k: 'py:glint', x: e.x, y: e.y - 118, t: 0, life: 0.45, s: 9 });
        if (propReady('bit:pyaleaf') && !few) bit3(v, 'pyaleaf', e.x + frnd(-10, 10), e.y + frnd(-4, 4), 100, { dz: -40, g: 60, drag: 1.6, bo: 0, s: 2.6, life: 1.1, sp: 6, fade: 'alpha', sh: false });
        return true;
      }
      case 'pyAppleLand': {   // a soft landing: a puff of dust, a few grains of sand
        if (ready()) { dust(v, e.x, e.y + 1, few ? 2 : 4, { speed: [20, 45], up: [6, 16], s: [3, 5], al: 0.7 }); sand(v, e.x, e.y, few ? 1 : 3, { speed: [30, 70], up: [50, 100] }); }
        else puff(v, e.x, e.y, 2, null);
        return true;
      }
      case 'pyEat': {   // into his mouth: it hops up to him, a crunch of chunks off it, the leaf fluttering away; then he heals
        const f = F.f[e.who]; if (!f) return true;
        const m = mouthOf(f);
        v.fx.push({ k: 'py:gulp', i: f.i, x: e.x, y: e.y, t: 0, life: 0.28 });
        if (propReady('bit:pyachunk')) bits3(v, 'pyachunk', m[0], m[1], m[2], few ? 3 : 7, { speed: [45, 110], up: [60, 140], s: [1.7, 2.6], life: [0.45, 0.7], g: 520, bo: 0.25 });
        if (propReady('bit:pyajuice')) bits3(v, 'pyajuice', m[0], m[1], m[2] + 2, few ? 3 : 8, { speed: [50, 120], up: [70, 160], s: [1.6, 2.4], life: [0.35, 0.55], g: 640, bo: 0 });
        (v.pyHeal || (v.pyHeal = {}))[f.i] = v.t;   // (the glow down his coils: tint)
        if (propReady('bit:pyaleaf')) bit3(v, 'pyaleaf', m[0], m[1], m[2] + 4, { dx: frnd(-30, 30), dy: frnd(-10, 10), dz: 50, g: 70, drag: 1.8, bo: 0, s: 2.8, life: 1.2, sp: 10, fade: 'alpha' });
        v.fx.push({ k: 'py:yum', i: f.i, x: f.x, y: f.y, t: 0, life: 1.1, n: few ? 4 : 7, seed: frnd(0, 99) });
        return true;
      }
      case 'pySquash': {   // stepped on: chunks sprayed low, a pulpy splat left on the floor
        if (propReady('bit:pyachunk')) bits3(v, 'pyachunk', e.x, e.y, 4, few ? 3 : 7, { speed: [60, 130], up: [40, 110], s: [1.6, 2.6], life: [0.45, 0.7], g: 600, bo: 0.2 });
        else puff(v, e.x, e.y, 2, '#ffe9b8');
        if (propReady('bit:pyaleaf')) bit3(v, 'pyaleaf', e.x, e.y, 6, { dx: frnd(-40, 40), dy: frnd(-14, 14), dz: 60, g: 90, drag: 1.6, bo: 0, s: 2.6, life: 1, sp: 8, fade: 'alpha' });
        pulpAdd(v, e.x, e.y);
        return true;
      }
      case 'pyRot': if (ready()) dust(v, e.x, e.y, few ? 1 : 2, { speed: [8, 20], up: [6, 14], s: [2.5, 4], al: 0.5 }); return true;   // (gone: a little dust where it was)
      case 'pySlither': if (ready()) dust(v, e.x, e.y, few ? 2 : 3, { speed: [20, 50] }); else puff(v, e.x, e.y, few ? 1 : 2, null); return true;
    }
    return false;
  },
  fx(g, F, v, p, k) {
    if (p.k === 'py:glint') { glintFx(g, p, k); return true; }
    if (p.k === 'py:yum') { yumFx(g, F, v, p, k); return true; }
    if (p.k === 'py:gulp') return true;   // (drawn with him: over, gulp)
    if (p.k === 'py:fangs') { fangsFx(g, p, k); return true; }
    return false;
  },
  icon(g, kind, r, col) {
    g.fillStyle = col || '#ffffff'; g.strokeStyle = col || '#ffffff'; g.lineCap = 'round'; g.lineJoin = 'round';
    switch (kind) {
      case 'pyCoil':   // a coil with a head reaching out of it
        g.lineWidth = r * 0.16; g.beginPath(); for (let k = 0; k <= 40; k++) { const a = k / 40 * TAU * 1.6, rr = r * (0.18 + 0.32 * k / 40); g.lineTo(-r * 0.2 + Math.cos(a) * rr, r * 0.12 + Math.sin(a) * rr * 0.8); } g.lineTo(r * 0.55, -r * 0.45); g.stroke();
        circle(g, r * 0.62, -r * 0.52, r * 0.2); g.fill();
        return true;
      case 'pyWhip':   // a tail swung round in a wide arc like a bat, its tip
        g.lineWidth = r * 0.12; g.globalAlpha *= 0.5; g.beginPath(); g.arc(-r * 0.4, r * 0.35, r * 0.95, -1.35, 0.1); g.stroke(); g.globalAlpha /= 0.5;
        g.lineWidth = r * 0.2; g.beginPath(); g.moveTo(-r * 0.4, r * 0.35); g.quadraticCurveTo(r * 0.1, -r * 0.1, r * 0.52, -r * 0.5); g.stroke();
        circle(g, r * 0.52, -r * 0.5, r * 0.12); g.fill();
        return true;
      case 'pyApple': {   // an apple: round with a dimple, a stalk and a leaf, a shine cut out of it
        g.beginPath(); g.moveTo(0, -r * 0.42);
        g.bezierCurveTo(r * 0.28, -r * 0.62, r * 0.82, -r * 0.5, r * 0.78, r * 0.05); g.bezierCurveTo(r * 0.74, r * 0.55, r * 0.35, r * 0.82, 0, r * 0.68);
        g.bezierCurveTo(-r * 0.35, r * 0.82, -r * 0.74, r * 0.55, -r * 0.78, r * 0.05); g.bezierCurveTo(-r * 0.82, -r * 0.5, -r * 0.28, -r * 0.62, 0, -r * 0.42); g.fill();
        g.lineWidth = r * 0.12; g.beginPath(); g.moveTo(0, -r * 0.38); g.quadraticCurveTo(r * 0.02, -r * 0.62, r * 0.12, -r * 0.8); g.stroke();
        g.beginPath(); g.ellipse(r * 0.38, -r * 0.7, r * 0.26, r * 0.11, -0.45, 0, TAU); g.fill();
        g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.ellipse(-r * 0.4, -r * 0.12, r * 0.1, r * 0.2, 0.4, 0, TAU); g.fill(); g.restore();
        return true;
      }
      case 'pySquashed': {   // the feed: an apple squashed flat, bits flying off it
        g.beginPath(); g.ellipse(0, r * 0.32, r * 0.82, r * 0.26, 0, 0, TAU); g.fill();
        for (const [x, y, q] of [[-0.62, -0.18, 0.13], [0.55, -0.3, 0.15], [0.05, -0.5, 0.11], [-0.25, -0.05, 0.09]]) { g.beginPath(); g.arc(r * x, r * y, r * q, 0, TAU); g.fill(); }
        return true;
      }
      case 'pySlither':   // an S, low and fast
        g.lineWidth = r * 0.18; g.beginPath(); g.moveTo(-r * 0.75, r * 0.3); g.bezierCurveTo(-r * 0.35, -r * 0.35, -r * 0.05, r * 0.6, r * 0.3, r * 0.05); g.quadraticCurveTo(r * 0.5, -r * 0.2, r * 0.75, -r * 0.15); g.stroke();
        circle(g, r * 0.78, -r * 0.16, r * 0.14); g.fill();
        return true;
    }
    return false;
  },
  sound(e) {
    switch (e.kind) {
      case 'tell': return e.move === 'move1' ? [['pyRattle', 0.55]] : null;   // (the whip's twist: the tail's tip rattling)
      case 'hit': return e.move === 'move1' || e.move === 'move2' ? [] : null;   // (his hits are heard off their own events: the thwack, the wrap and toss)
      case 'pyWhip': return [['pySwish', 0.75]];
      case 'pyBat': return e.tip ? [['pyThwack', 0.85], ['fThud', 0.45]] : [['pyThwack', 0.7], ['fThud', 0.3]];
      case 'pyUnwind': return [['pyWhiff', 0.5]];
      case 'pyRear': return [['pyHissShort', 0.55]];
      case 'pyLunge': return [['pySpring', 0.65]];
      case 'pyCatch': return [['pyWrap', 0.7]];
      case 'pySqueeze': return [['pySqueeze', 0.6]];
      case 'pyToss': return [['pyHeave', 0.7], ['fThud', 0.4]];
      case 'pySprawl': return [['pyFlop', 0.45]];
      case 'pyPoison': return [['pyVBite', 0.6]];
      case 'pyCall': return [['pyCallUp', 0.5]];
      case 'pyAppleLand': return [['pyBonk', 0.55]];
      case 'pyEat': return [['pyCrunch', 0.75], ['pyYum', 0.5]];
      case 'pySquash': return [['pySquelch', 0.7]];
      case 'cure': return [['fCure', 0.35]];   // (the poison wearing off: js/art/status.js)
      case 'pySlither': return [['pySlide', 0.7]];
    }
    return null;
  },
  sounds: {
    // the whip: the tail's tip rattling as he twists away
    pyRattle: ({ hiss }) => (v, t) => { for (let k = 0; k < 6; k++) hiss(t + k * 0.022, 0.016, (0.05 + 0.01 * k) * v, 'bandpass', 6200, 5000); },
    // the swing: a big low whoosh sweeping round
    pySwish: ({ osc, hiss }) => (v, t) => { hiss(t, 0.2, 0.14 * v, 'bandpass', 500, 2600); hiss(t + 0.06, 0.14, 0.06 * v, 'highpass', 2600, 1800); osc(t, 120, 0.16, 'sine', 0.05 * v, 60); },
    // it lands: a meaty thwack, like a bat on a ball
    pyThwack: ({ osc, hiss }) => (v, t) => { osc(t, 520, 0.03, 'square', 0.07 * v, -300); osc(t, 160, 0.12, 'sine', 0.15 * v, -70); hiss(t, 0.07, 0.1 * v, 'bandpass', 1600, 600); },
    // it missed: the swing whiffing on round, trailing off
    pyWhiff: ({ hiss }) => (v, t) => { hiss(t, 0.24, 0.08 * v, 'bandpass', 1400, 400); },
    pyHissShort: ({ hiss }) => (v, t) => { hiss(t, 0.1, 0.05 * v, 'bandpass', 5000, 6500); hiss(t + 0.06, 0.12, 0.07 * v, 'highpass', 4500, 3200); },
    // a head darting out: a quick low whoosh of a long body through the air
    pyStrike: ({ osc, hiss }) => (v, t) => { hiss(t, 0.09, 0.12 * v, 'bandpass', 900, 2600); osc(t, 160, 0.07, 'sine', 0.05 * v, 90); },
    // jaws snapping shut on nothing: a dry click
    pySnapAir: ({ osc }) => (v, t) => { osc(t, 1500, 0.02, 'square', 0.035 * v, -800); osc(t + 0.015, 900, 0.02, 'triangle', 0.03 * v, -400); },
    // a long body flopping onto the sand
    pyFlop: ({ osc, hiss }) => (v, t) => { osc(t, 140, 0.14, 'sine', 0.1 * v, -70); hiss(t, 0.16, 0.06 * v, 'lowpass', 900, 300); },
    // the coils closing round you: a leathery swish and a soft squeeze
    pyWrap: ({ osc, hiss }) => (v, t) => { hiss(t, 0.22, 0.09 * v, 'bandpass', 1400, 500); osc(t + 0.05, 110, 0.18, 'triangle', 0.09 * v, -30); },
    pySqueeze: ({ osc, hiss }) => (v, t) => { osc(t, 150, 0.12, 'triangle', 0.12 * v, -40); hiss(t, 0.1, 0.05 * v, 'bandpass', 700, 400); },   // a soft creak
    // the toss: a heave and a whoosh
    pyHeave: ({ osc, hiss }) => (v, t) => { hiss(t, 0.2, 0.1 * v, 'bandpass', 600, 2200); osc(t, 200, 0.16, 'sawtooth', 0.025 * v, 160); },
    // the Coil springing out: a long body whooshing out fast, a low twang of the spring under it
    pySpring: ({ osc, hiss }) => (v, t) => { hiss(t, 0.16, 0.12 * v, 'bandpass', 700, 2800); osc(t, 95, 0.2, 'triangle', 0.07 * v, 140); osc(t + 0.01, 190, 0.12, 'sine', 0.03 * v, 120); },
    // the apple called: a soft falling whistle, high to low
    pyCallUp: ({ osc }) => (v, t) => { osc(t + 0.12, 1700, 0.42, 'sine', 0.03 * v, -1100); osc(t + 0.12, 3400, 0.3, 'sine', 0.008 * v, -2200); },
    // it lands: a small hollow bonk and a bounce
    pyBonk: ({ osc }) => (v, t) => { osc(t, 420, 0.07, 'sine', 0.09 * v, -200); osc(t + 0.11, 520, 0.05, 'sine', 0.04 * v, -220); },
    // eaten: a crisp crunch (two bites of noise and a click) ...
    pyCrunch: ({ osc, hiss }) => (v, t) => { hiss(t, 0.05, 0.12 * v, 'bandpass', 3200, 1800); hiss(t + 0.07, 0.06, 0.1 * v, 'bandpass', 2600, 1500); osc(t, 1300, 0.015, 'square', 0.03 * v, -700); hiss(t + 0.15, 0.08, 0.05 * v, 'lowpass', 1800, 600); },
    // ... and a happy little rising chime as he heals
    pyYum: ({ arp }) => (v, t) => { arp(t + 0.18, [784, 988, 1319], 0.07, 0.12, 'triangle', 0.035 * v); },
    // squashed: a wet squelch
    pySquelch: ({ osc, hiss }) => (v, t) => { hiss(t, 0.14, 0.12 * v, 'lowpass', 1400, 300); osc(t, 260, 0.12, 'sine', 0.08 * v, -160); hiss(t + 0.04, 0.06, 0.05 * v, 'bandpass', 2400, 900); },
    // the bite: a crunch of fangs going in and a wet squelch
    pyVBite: ({ osc, hiss }) => (v, t) => { osc(t, 1000, 0.025, 'square', 0.05 * v, -600); osc(t + 0.02, 420, 0.14, 'sine', 0.09 * v, -260); hiss(t + 0.015, 0.12, 0.08 * v, 'lowpass', 1500, 400); },
    // wearing off: a soft breath out
    // the slither: sand hissing under a body sliding fast
    pySlide: ({ hiss }) => (v, t) => { hiss(t, 0.26, 0.1 * v, 'bandpass', 2200, 800); hiss(t + 0.05, 0.2, 0.05 * v, 'highpass', 3500, 2000); },
  },
};

// ---------------------------------------------------------------- the Apple
const A3a = a => clamp(a, 0, 1).toFixed(3);
// where it is in its life: dropping (z), its landing's squash and hop, a little wobble, shrinking away at the end
function appleLook(v, o) {
  const land = o.ph === 'sit' ? o.t - (o.fall || 0.5) : -1, end = Math.max(0, (o.t - (o.life - 0.7)) / 0.7);
  let sy = 1, hop = 0;
  if (land >= 0 && land < 0.4) { const q = land / 0.4; sy = 1 - 0.28 * Math.exp(-q * 6) * Math.cos(q * 14); hop = 6 * Math.max(0, Math.sin(Math.min(1, (land - 0.05) / 0.3) * Math.PI)) * (land > 0.05 ? 1 : 0); }
  else if (land < 0) sy = 1.08;   // (falling: a touch long)
  const s = (1 - 0.85 * ease(end)) * (o.r || 10) / 8.6 * 1.5;
  const sit = land >= 0.4 ? clamp((land - 0.4) / 0.3, 0, 1) : 0, ph = v.t * 3.1 + (o.id || 0), bob = sit * (1.4 + 1.4 * Math.sin(ph)) * (1 - end);   // (waiting: bobbing gently, as if it wants eating)
  if (sit) sy *= 1 + 0.035 * sit * Math.sin(ph + 1.2);
  const wob = land >= 0.4 ? Math.sin(v.t * 2.2 + (o.id || 0)) * 0.04 : 0;
  return { z: (o.z || 0) + hop + bob, bob, sy, s, al: 1 - ease(clamp((end - 0.6) / 0.4, 0, 1)), wob, spin: land < 0 ? o.t * 5 : 0 };
}
// its shadow on the floor: a soft one growing and darkening as it drops (the tell where it'll land), then under it
function appleShadow(g, o) {
  const fallU = o.ph === 'fall' ? clamp(o.t / (o.fall || 0.5), 0, 1) : 1, end = Math.max(0, (o.t - (o.life - 0.7)) / 0.7), r = (o.r || 9);
  softShadow(g, o.x + 1.5, o.y + 1.5, r * 1.45 * (0.55 + 0.6 * fallU) * (1 - 0.8 * ease(end)), r * 1.45 * (0.32 + 0.3 * fallU) * (1 - 0.8 * ease(end)), (0.14 + 0.2 * fallU) * (1 - end));
}
// the apple itself (among the fighters): the 3D prop, or a 2D one before the bake
function appleDraw(g, v, o) {
  const L = appleLook(v, o); if (L.s <= 0.02 || L.al <= 0.01) return;
  g.save(); g.translate(o.x, o.y - L.z); g.rotate(L.wob + Math.sin(L.spin) * 0.25);
  if (!drawProp3D(g, 'py:apple', { scale: L.s, sy: L.sy, alpha: L.al })) apple2(g, 0, 0, 8.6 * L.s, L.sy, L.al);
  g.restore();
  // a glint on it now and then while it sits
  if (o.ph === 'sit' && L.al > 0.9 && ((v.t + (o.id || 0) * 0.37) % 1.4) < 0.3) { const k = ((v.t + (o.id || 0) * 0.37) % 1.4) / 0.3; glintFx(g, { x: o.x - 3.2 * L.s, y: o.y - L.z - 11 * L.s, s: 4.5 }, k); }
}
// the 2D stand-in: a round red apple, a dimple, a stalk and a leaf, a shine (Classic Flat: inked)
function apple2(g, x, y, R, sy = 1, al = 1) {
  g.save(); g.globalAlpha *= al; g.translate(x, y - R * sy); g.scale(1, sy);
  const shape = () => { g.beginPath(); g.moveTo(0, -R * 0.78); g.bezierCurveTo(R * 0.45, -R * 1.1, R * 1.08, -R * 0.75, R * 1.0, 0); g.bezierCurveTo(R * 0.95, R * 0.75, R * 0.45, R * 1.05, 0, R * 0.9); g.bezierCurveTo(-R * 0.45, R * 1.05, -R * 0.95, R * 0.75, -R, 0); g.bezierCurveTo(-R * 1.08, -R * 0.75, -R * 0.45, -R * 1.1, 0, -R * 0.78); g.closePath(); };
  const BD = bold();
  g.fillStyle = APL; shape(); g.fill();
  g.fillStyle = 'rgba(122,22,18,0.35)'; g.beginPath(); g.ellipse(R * 0.3, R * 0.35, R * 0.62, R * 0.5, 0.3, 0, TAU); g.fill();   // (shade on the far side)
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(-R * 0.45, -R * 0.3, R * 0.14, R * 0.28, 0.5, 0, TAU); g.fill();
  if (BD) { g.strokeStyle = APL_D; g.lineWidth = 1.4; shape(); g.stroke(); }
  g.strokeStyle = '#6b4423'; g.lineWidth = 1.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, -R * 0.75); g.quadraticCurveTo(R * 0.05, -R * 1.1, R * 0.2, -R * 1.3); g.stroke();
  g.fillStyle = LEAF; g.beginPath(); g.ellipse(R * 0.55, -R * 1.15, R * 0.42, R * 0.17, -0.5, 0, TAU); g.fill();
  if (BD) { g.strokeStyle = '#2f6a22'; g.lineWidth = 1; g.stroke(); }
  g.restore();
}
// his mouth, about (world x, y, z): where the apple goes
const mouthOf = f => [f.x + Math.cos(f.face) * 10, f.y + Math.sin(f.face) * 6, 30];
// eaten: the apple hopping up into his mouth, shrinking as it goes in (the gulp's particle carries where it started)
function gulp(g, v, f) {
  for (const p of v.fx) {
    if (p.k !== 'py:gulp' || p.i !== f.i) continue;
    const k = clamp(p.t / p.life, 0, 1), [mx, my, mz] = mouthOf(f), x = p.x + (mx - p.x) * ease(k) - f.x, y = p.y + (my - p.y) * ease(k) - f.y, z = mz * Math.sin(k * Math.PI / 2) + 10 * Math.sin(k * Math.PI);
    g.save(); g.translate(x, y - z);
    if (!drawProp3D(g, 'py:apple', { scale: 1.4 * (1 - 0.75 * k), alpha: 1 - k * k })) apple2(g, 0, 0, 12 * (1 - 0.75 * k), 1, 1 - k * k);
    g.restore();
  }
}
// a glint: a soft four-pointed sparkle flaring and fading (white, a warm core)
function glintFx(g, p, k) {
  const al = Math.sin(clamp(k, 0, 1) * Math.PI), s = (p.s || 8) * (0.6 + 0.4 * Math.sin(clamp(k, 0, 1) * Math.PI)); if (al <= 0.01) return;
  g.save(); g.translate(p.x, p.y);
  softDisc(g, 0, 0, s * 0.9, [[0, '255,250,230', 0.5 * al], [1, '255,250,230', 0]]);
  g.fillStyle = `rgba(255,255,255,${A3a(al)})`;
  g.beginPath(); g.moveTo(0, -s); g.quadraticCurveTo(s * 0.12, -s * 0.12, s, 0); g.quadraticCurveTo(s * 0.12, s * 0.12, 0, s); g.quadraticCurveTo(-s * 0.12, s * 0.12, -s, 0); g.quadraticCurveTo(-s * 0.12, -s * 0.12, 0, -s); g.fill();
  g.restore();
}
// healed: little green leaves spiralling up round him, twinkling glints among them (no rings: the thing itself)
function yumFx(g, F, v, p, k) {
  const f = F.f[p.i]; if (!f) return;
  // a green plus of four little leaves popping up over his head and rising, a glint at its heart
  for (let j = 0; j < 2; j++) {
    const q = clamp((k - j * 0.18) / 0.8, 0, 1); if (q <= 0 || q >= 1) continue;
    const pop = q < 0.25 ? backE(q / 0.25) : 1, al = q < 0.7 ? 1 : 1 - (q - 0.7) / 0.3, s = (j ? 4.2 : 6) * pop, x = f.x + (j ? 14 : -4), y = f.y - (f.z || 0) - 66 - 26 * ease(q) + (j ? 10 : 0);
    g.save(); g.translate(x, y); g.rotate(Math.sin(q * 6 + j) * 0.12); g.globalAlpha *= al;
    for (let r = 0; r < 4; r++) {
      g.save(); g.rotate(r * Math.PI / 2);
      g.fillStyle = r % 2 ? '#7ed957' : LEAF; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(s * 0.55, -s * 0.5, 0, -s * 1.5); g.quadraticCurveTo(-s * 0.55, -s * 0.5, 0, 0); g.fill();
      if (bold()) { g.strokeStyle = '#2f6a22'; g.lineWidth = 1; g.stroke(); }
      g.restore();
    }
    g.fillStyle = 'rgba(255,255,240,0.9)'; g.beginPath(); g.arc(0, 0, s * 0.28, 0, TAU); g.fill();
    g.restore();
  }
  for (let j = 0; j < p.n; j++) {
    const d = j / p.n * 0.35, q = clamp((k - d) / (1 - d), 0, 1); if (q <= 0 || q >= 1) continue;
    const a = (p.seed || 0) + j * 2.4 + q * 3.2, rr = 20 + 6 * Math.sin(j * 1.7), x = f.x + Math.cos(a) * rr, y = f.y + Math.sin(a) * rr * 0.45 - 14 - 52 * ease(q), al = Math.sin(q * Math.PI);
    if (j % 3 === 2) { glintFx(g, { x, y, s: 7 }, q); continue; }
    g.save(); g.translate(x, y); g.rotate(a * 0.7 + Math.sin(q * 9 + j) * 0.6); g.globalAlpha *= al;
    const L = 6.5 * (0.7 + 0.3 * Math.sin(q * Math.PI));
    g.fillStyle = j % 2 ? '#7ed957' : LEAF; g.beginPath(); g.moveTo(-L, 0); g.quadraticCurveTo(0, -L * 0.62, L, 0); g.quadraticCurveTo(0, L * 0.62, -L, 0); g.fill();
    g.strokeStyle = bold() ? '#2f6a22' : 'rgba(47,106,34,0.7)'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(-L * 0.8, 0); g.lineTo(L * 0.7, 0); g.stroke();
    g.restore();
  }
}
// a squashed apple's pulp on the floor: a cream splat with bits of red skin in it, sinking in over two and a half
// seconds (the view's memory: [x, y, born, seed])
function pulpAdd(v, x, y) { const S = v.pyPu || (v.pyPu = []); S.push([x, y, v.t, frnd(0, 99)]); if (S.length > 8) S.shift(); }
function pulps(g, v) {
  const S = v.pyPu; if (!S || !S.length) return;
  g.save();
  for (const [x, y, t0, sd] of S) {
    const k = (v.t - t0) / 2.5; if (k < 0 || k >= 1) continue;
    const al = 1 - ease(k), rr = 11 * (0.6 + 0.4 * ease((v.t - t0) / 0.12));
    const blob = (sc, dy) => { g.beginPath(); for (let j = 0; j <= 12; j++) { const an = j / 12 * TAU, w = rr * sc * (0.75 + 0.45 * hsh(sd + (j % 12))); j ? g.lineTo(x + Math.cos(an) * w, y + dy + Math.sin(an) * w * 0.5) : g.moveTo(x + Math.cos(an) * w, y + dy + Math.sin(an) * w * 0.5); } g.closePath(); };
    g.fillStyle = `rgba(214,180,110,${A3a(0.35 * al)})`; blob(1.2, 0.6); g.fill();
    g.fillStyle = `rgba(255,240,196,${A3a(0.85 * al)})`; blob(0.9, 0); g.fill();
    for (let j = 0; j < 5; j++) { const an = sd + j * 1.3, w = rr * (0.3 + 0.55 * hsh(sd + j + 20)); g.fillStyle = `rgba(214,52,44,${A3a(0.9 * al)})`; g.beginPath(); g.ellipse(x + Math.cos(an) * w, y + Math.sin(an) * w * 0.5, 2.2, 1.2, an, 0, TAU); g.fill(); }
  }
  g.restore();
}
// the spots of venom on the floor: small irregular glossy blobs, dark green with a lighter wet rim, sinking in over a
// second and a half (the view's memory: [x, y, r, born, seed])
function splatAdd(v, x, y, r, delay = 0) { const S = v.pySp || (v.pySp = []); S.push([x, y, r, v.t + delay, frnd(0, 99)]); if (S.length > 30) S.shift(); }
function splats(g, v) {
  const S = v.pySp; if (!S || !S.length) return;
  g.save();
  for (const [x, y, r, t0, sd] of S) {
    const k = (v.t - t0) / 1.6; if (k < 0 || k >= 1) continue;
    const al = (1 - ease(k)) * clamp((v.t - t0) / 0.06, 0, 1), rr = r * (0.7 + 0.3 * ease(k / 0.2));
    const blob = (sc, dy) => { g.beginPath(); for (let j = 0; j <= 10; j++) { const an = j / 10 * TAU, w = rr * sc * (0.8 + 0.35 * hsh(sd + j % 10)); j ? g.lineTo(x + Math.cos(an) * w, y + dy + Math.sin(an) * w * 0.55) : g.moveTo(x + Math.cos(an) * w, y + dy + Math.sin(an) * w * 0.55); } g.closePath(); };
    g.fillStyle = `rgba(160,226,110,${A3(0.5 * al)})`; blob(1.25, 0.4); g.fill();
    g.fillStyle = `rgba(52,110,40,${A3(0.62 * al)})`; blob(1, 0); g.fill();
    g.fillStyle = `rgba(236,255,214,${A3(0.6 * al)})`; circle(g, x - rr * 0.3, y - rr * 0.2, rr * 0.22); g.fill();
  }
  g.restore();
}

// ---------------------------------------------------------------- the Coil
// the Coil's spring (and the sprawl after a miss): his body from the loops at his tail end, unwinding as his head goes
// out, along the floor straight to his head (the model, moved out ext along his facing), a ripple running down it that
// dies away as it straightens; thinner toward the tail
function lungeBody(g, f, ext) {
  const c = Math.cos(f.face), s = Math.sin(f.face), nx = -s, ny = c, k = f.pht || 0;
  const e = clamp(ext / Math.max(20, f.r + coilR(f) - MODEL_HEAD), 0, 1), loops = 1.25 - 0.95 * e, sd = f.i ? -1 : 1;
  const bx = f.x - c * 6, by = f.y - s * 6, head = ext + 6, coilL = loops * TAU * 9, runL = head - 6, all = coilL + Math.max(1, runL);
  const p = u => {
    const l = u * all;
    if (l < coilL) {   // the loops at his tail end, round where he pushed off (outermost at the tail)
      const v = l / coilL, a = f.face - sd * (1 - v) * loops * TAU, rr = 12 - 5 * (1 - v) * (1 - v);
      return [bx + Math.cos(a) * rr - c * 6, by + Math.sin(a) * rr - s * 6, 3.5];
    }
    const v = (l - coilL) / Math.max(1, runL), d = 6 + runL * v, wv = Math.sin(v * 7 - k * 26) * 4.5 * Math.sin(v * Math.PI) * (1 - 0.7 * e);
    return [bx + c * d + nx * wv, by + s * d + ny * wv, 4 + 5 * v * v];
  };
  if (!ready()) {
    const pts = []; for (let j = 0; j <= 28; j++) { const q = p(j / 28); pts.push([q[0], q[1] - q[2] - 6]); }
    softShadow(g, f.x + c * ext * 0.5, f.y + s * ext * 0.5 + 2, ext * 0.5 + 14, 9, 0.2, f.face);
    snakeBody(g, pts, u => 3.5 + 3.5 * u);
    return;
  }
  const segs = spine(floorAt(p, u => 0.5 + 0.47 * Math.sqrt(u)), gapOf, 72);
  body(g, segs, 1, 10);
}

// the coils round whoever he holds (seen as their model is): his body comes in low from him and winds up round them in
// a helix, 2.3 turns, drawn tighter as he squeezes (a pinch at each tick), the end of it tapering at the top. side -1:
// the far half of each turn (before their model), 1 the near half and the length running back to him
function coil3(g, f, t, H, side, F) {
  const k = clamp(H.pht / 0.22, 0, 1), pinch = H.pyN > 0 ? 1 - 0.15 * Math.exp(-(H.pyT || 0) / 0.07) : 1;
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

// ---------------------------------------------------------------- the Indentation Whip (the bat swing)
// his whole body: the twist away (a little overshoot, sunk onto his coil), the swing whipping him round with the tail
// (stretched up tall, a hop), landed: springing back square; missed: carried on right round, a whole turn, and settling
// (no stun look). side: the swing's way (f.pyW)
const TAU2 = Math.PI * 2;
function batAnim(F, f, k) {
  const A = animBase(), sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; }, mv = f.stats.moves.move1, sd = f.pyW || 1;
  const back = -0.75, thru = 1.05;
  if (f.ph === 'pull') { const q = clamp(k / Math.max(0.05, f.state === 'wind' ? f.dur : mv.startup), 0, 1), b = 1 + 2.7 * Math.pow(q - 1, 3) + 1.7 * Math.pow(q - 1, 2); A.spin = sd * back * b; sq(0.08 * ease(q)); A.fwd = -2.5 * ease(q); A.wx = Math.sin(k * 60) * 0.5 * q; }
  else if (f.ph === 'whip') { const q = clamp(k / mv.active, 0, 1), e = q * q * (3 - 2 * q); A.spin = sd * (back + (thru - back) * e); sq(-0.1 * Math.sin(Math.PI * q)); A.hop = 2 * Math.sin(Math.PI * q); }
  else if (f.ph === 'recoil') { A.spin = sd * thru * Math.exp(-k * 8) * Math.cos(k * 11); sq(0.07 * Math.exp(-k * 9) * Math.cos(k * 18)); }
  else {   // unwind: on round a whole turn, then settling
    const S = settleAnim(k, mv.miss, 'whip', mv.miss * 0.6); Object.assign(A, S);
    A.spin = sd * (thru + (TAU2 - thru) * ease(k / (mv.miss * 0.65)));
  }
  return A;
}
// the tail cocked (the bat swing's wind-up, drawn off the fighter: it's his body, not a mark): coiled round behind him
// on the side the swing starts from, its tip up off the floor and rattling, drawn back further as he twists
function cockTail(g, v, f) {
  const mv = f.stats.moves.move1, sd = f.pyW || 1, w = ease(clamp(f.t / Math.max(0.05, f.dur || mv.startup), 0, 1));
  const start = f.face - sd * mv.arc * Math.PI / 360, back = f.face + Math.PI, L = 30 + 34 * w;
  const p = u => { const b = back + (start - sd * 0.4 - back) * u * 0.9, rr = 9 + L * u, rat = u > 0.75 ? Math.sin(v.t * 46) * 1.6 * (u - 0.75) * 4 * w : 0; return [f.x + Math.cos(b) * rr - Math.sin(b) * rat, f.y + Math.sin(b) * rr + Math.cos(b) * rat, 4 + 16 * Math.pow(u, 3) * w]; };
  body(g, spine(floorAt(p, u => 0.92 - 0.6 * u), gapOf, 30), 1, 8);
}
// the tail swinging: it runs out low over the floor to the arc's edge, trailing a little behind its tip, two fading
// copies of it a moment behind (the smear), sand and dust kicked off along it
function tail(g, F, v, o, f) {
  const A = o.arc, mv = f.stats.moves.move1, reach = o.r1 - 4, s0 = o.s ?? -A / 2;
  const at = (s, al) => {
    const cur = o.a + o.side * s, p = u => { const b = cur - o.side * 0.38 * u * u, rr = 9 + (reach - 9) * u; return [o.x + Math.cos(b) * rr, o.y + Math.sin(b) * rr, 5 - 2 * u]; };
    const segs = al < 1 ? spine(floorAt(p, u => 0.9 - 0.68 * u), q => gapOf(q) * 1.7, 30) : spine(floorAt(p, u => 0.95 - 0.68 * u), gapOf, 48); if (al < 1) snake(g, segs, al); else body(g, segs, 1, 9);   // (a smear copy: thinner, its segments further apart so they don't pile up into a solid tail)
  };
  if (f.ph === 'whip') for (const [ds, al] of [[0.6, 0.12], [0.3, 0.24]]) if (s0 - ds > -A / 2) at(s0 - ds, al);   // (the smear)
  at(s0, 1);
  const cur = o.a + o.side * s0;
  // sand and dust kicked off the tip along the sweep (a few a frame, never too many)
  if (f.ph === 'whip' && every(v, 'wh' + f.i, 1 / 45)) {
    const tipR = reach - mv.tipW * 0.4, x = o.x + Math.cos(cur) * tipR, y = o.y + Math.sin(cur) * tipR, tng = cur + o.side * Math.PI / 2;
    sand(v, x, y, 2, { dir: tng, spread: 0.9, speed: [70, 150], up: [70, 140] });
    if (every(v, 'whd' + f.i, 1 / 15)) dust(v, x, y, 1, { dir: tng, spread: 0.6, speed: [30, 60], s: [4, 6.5] });
  }
}
// the tail coming back after the sweep: drawn in along the far side, shortening
function recoilTail(g, f) {
  const mv = f.stats.moves.move1, k = clamp((f.pht || 0) / (mv.recovery * 0.8), 0, 1); if (k >= 1) return;
  const end = f.face + (f.pyW || 1) * mv.arc * Math.PI / 360, L = (mv.r1 - 13) * (1 - ease(k));
  if (L < 6) return;
  const p = u => { const b = end + (f.pyW || 1) * 0.3 * u * u - (f.pyW || 1) * 0.8 * k * u, rr = 9 + L * u; return [f.x + Math.cos(b) * rr, f.y + Math.sin(b) * rr, 5 - 2 * u]; };
  body(g, spine(floorAt(p, u => 0.95 - 0.66 * u), gapOf, 36), 1, 9);
}

// the tail after a miss: trailing round behind him as the swing carries him on round, drawn in as he settles
function unwindTail(g, f) {
  const mv = f.stats.moves.move1, sd = f.pyW || 1, k = clamp((f.pht || 0) / (mv.miss * 0.7), 0, 1); if (k >= 1) return;
  const spin = 1.05 + (TAU2 - 1.05) * ease((f.pht || 0) / (mv.miss * 0.65)), end = f.face + sd * (mv.arc * Math.PI / 360 + spin - 1.05), L = (mv.r1 - 13) * (1 - ease(k));
  if (L < 6) return;
  const p = u => { const b = end - sd * 0.5 * u * u, rr = 9 + L * u; return [f.x + Math.cos(b) * rr, f.y + Math.sin(b) * rr, 5 - 2 * u]; };
  body(g, spine(floorAt(p, u => 0.95 - 0.66 * u), gapOf, 36), 1, 9);
}

// ---------------------------------------------------------------- the venom's bite marks
const A3 = a => clamp(a, 0, 1).toFixed(3);
// a bite landing: two little puncture glints on them (white, a cool blue rim; the venom's a sickly green one), a sparkle flaring and fading
function fangsFx(g, p, k) {
  const al = 1 - k * k, sc = p.s || 1, c = Math.cos(p.a + Math.PI / 2), s = Math.sin(p.a + Math.PI / 2);
  if (al <= 0.01) return;
  g.save();
  for (const sd of [-1, 1]) {
    const x = p.x + c * sd * 5 * sc, y = p.y - 24 + s * sd * 3 * sc, r = (2.6 + 3.4 * ease(k / 0.25)) * sc;
    const rim = p.ven ? '140,226,90' : '200,226,255';   // (the venom's bite: a sickly green rim)
    softDisc(g, x, y, r * 2.2, [[0, rim, 0.55 * al], [1, rim, 0]]);
    g.fillStyle = p.ven ? `rgba(240,255,226,${A3(al)})` : `rgba(255,255,255,${A3(al)})`; g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r * 0.3, y); g.lineTo(x, y + r); g.lineTo(x - r * 0.3, y); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(x - r, y); g.lineTo(x, y + r * 0.3); g.lineTo(x + r, y); g.lineTo(x, y - r * 0.3); g.closePath(); g.fill();
  }
  g.restore();
}
// the scuffs his coil digs into the sand as a lunge pushes off it: short grooves, fading (the view's memory)
function scuffAdd(v, x, y, a) { const S = v.pySc || (v.pySc = []); S.push([x, y, a, v.t]); if (S.length > 12) S.shift(); }
function scuffs(g, v) {
  const S = v.pySc; if (!S || !S.length) return;
  g.save(); g.lineCap = 'round';
  for (const [x, y, a, t0] of S) {
    const k = (v.t - t0) / 1.4; if (k < 0 || k >= 1) continue;
    const al = 1 - ease(k), c = Math.cos(a), s = Math.sin(a);
    for (const [dx, dy, col, w] of [[0.6, 1, `rgba(255,250,238,${A3(0.4 * al)})`, 2], [0, 0, `rgba(80,62,40,${A3(0.3 * al)})`, 2.6]]) {
      g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x + dx - c * 3, y + dy - s * 2); g.quadraticCurveTo(x + dx - c * 9 - s * 3, y + dy - s * 7 + c * 2, x + dx - c * 15, y + dy - s * 11); g.stroke();
    }
  }
  g.restore();
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

// the tracks he leaves in the sand: a snake's wavy furrow (a dark groove with a pale lip), one S after another, fading
// over a second and a half (the view's memory: [x, y, t, nx, ny, d] along his path, d the distance so far)
function trackAdd(v, f) {
  const L = v.pyTr || (v.pyTr = []), last = L.length && L[L.length - 1][6] === f.i && v.t - L[L.length - 1][2] < 0.15 ? L[L.length - 1] : null;
  const c = Math.cos(f.face), s = Math.sin(f.face), x = f.x - c * 10, y = f.y - s * 10, d = last ? last[5] + Math.hypot(x - last[0], y - last[1]) : 0;
  if (last && d - last[5] < 3) return;
  L.push([x, y, v.t, -s, c, d, f.i]);
  if (L.length > 120) L.splice(0, L.length - 120);
}
function tracks(g, v) {
  const L = v.pyTr; if (!L || !L.length) return;
  while (L.length && v.t - L[0][2] > 1.5) L.shift();
  g.save(); g.lineCap = 'round';
  for (let i = 1; i < L.length; i++) {
    const A = L[i - 1], B = L[i]; if (A[6] !== B[6] || B[5] - A[5] > 20) continue;
    const k = 1 - (v.t - B[2]) / 1.5, M = 5, pts = [];
    for (let m = 0; m <= M; m++) { const u = m / M, d = A[5] + (B[5] - A[5]) * u, w = Math.sin(d / 11) * 6, nx = A[3] + (B[3] - A[3]) * u, ny = A[4] + (B[4] - A[4]) * u; pts.push([A[0] + (B[0] - A[0]) * u + nx * w, A[1] + (B[1] - A[1]) * u + ny * w]); }
    const line = (dx, dy) => { g.beginPath(); pts.forEach(([x, y], m) => m ? g.lineTo(x + dx, y + dy) : g.moveTo(x + dx, y + dy)); g.stroke(); };
    g.strokeStyle = `rgba(255,250,238,${(0.45 * k).toFixed(3)})`; g.lineWidth = 3.4; line(0.6, 1.3);
    g.strokeStyle = `rgba(80,62,40,${(0.34 * k).toFixed(3)})`; g.lineWidth = 3.6; line(0, 0);
  }
  g.restore();
}

// ---------------------------------------------------------------- the tells on the floor
// the whip's swing (a HIT: nothing on the floor before it): a groove dragged through the dust behind the tip (a dark
// furrow with a light lip on its lower side), fading behind it
function arcBand(g, F, o, t) {
  const f = F.f[o.owner]; if (!f) return;
  const A = o.arc, r1 = o.r1, mv = f.stats.moves.move1;
  g.save();
  {
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
    if (f.ph === 'whip') {   // the swoosh: the air the tail just swept, a pale fan behind it fading back toward where it began, the tip's path brightest
      const sw = Math.min(1.1, Math.abs(cur - from)), N = 9, r0 = 14, rT = r1 - 2;
      for (let k = 0; k < N; k++) {
        const u0 = k / N, u1 = (k + 1) / N, b0 = cur - o.side * (1 - u0) * sw, b1 = cur - o.side * (1 - u1) * sw + o.side * 0.02, q = u1 * u1;
        g.fillStyle = `rgba(255,250,236,${(0.42 * q).toFixed(3)})`; g.beginPath(); g.arc(o.x, o.y, rT, b0, b1, o.side < 0); g.arc(o.x, o.y, r0, b1, b0, o.side > 0); g.closePath(); g.fill();
        g.strokeStyle = `rgba(255,255,250,${(0.85 * q).toFixed(3)})`; g.lineWidth = 4 * u1; g.beginPath(); g.arc(o.x, o.y, rT - mv.tipW * 0.45, b0, b1, o.side < 0); g.stroke();
      }
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
