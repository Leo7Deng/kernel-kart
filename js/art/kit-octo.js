// Octo's Fight art (sim: js/kits/octo.js). Real 3D: tentacles are chains of baked segments (art/chain3d.js) with pale
// suckers and a curled tip; ink is glossy 3D (art/prop3d.js).
// git blame: the tentacle coils behind him as he aims while a damp track of sucker prints runs out to its exact reach;
// settled, a wet bead runs down the track and the tentacle comes when it reaches the end: it thwacks flat (ink splat,
// an inky skid), or slaps the floor and flops
// Fork: a spat glob of ink splats on the spot; an ink branch beaded like a commit graph runs out to it as a see-through
// clone rises from a puddle; popped, it bursts
// Force Push: eight tentacles flick up (higher and trembling when held), their tip shadows where they'll land, then
// slam flat to its reach: splats, dust, a floor ripple, sucker prints drying
// Ink Jet: a squirt as he jets back, an ink cloud where he was, a puddle under it
// 2D stand-ins with no WebGL or before the bake. Calm: a gentle shake only when a hit lands.
import { CHARACTERS, TAU, clamp, frnd, lerp } from '../core.js';
import { bold } from '../look.js';
import { SCALE, model, puff, shadow, tinted } from '../draw-fight.js';
import { animBase, settleAnim } from './kits.js';
import * as M3 from './model3d.js';
import { bit3, bits3, decal3, defBit, defProp, drawProp3D, propReady, propsFor } from './prop3d.js';
import { SE, SHARED_BITS, bodyAt, bodyShadow, drawSegs, floorAt, segReady, segTube, spine } from './chain3d.js';
import { softFill } from './arena-mat.js';

const ID = 'octo';
const INK = '#2f353e';
const SRC_R = 14;   // (js/kits/octo.js: a tentacle leaves its body this far out)
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const backE = k => { k = clamp(k, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const hsh = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const charOf = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }
function softDisc(g, x, y, r, stops, r0 = 0) {
  if (r <= 0.5) return;
  const gr = g.createRadialGradient(x, y, Math.max(0, r0), x, y, r);
  for (const [at, c, a] of stops) gr.addColorStop(clamp(at, 0, 1), `rgba(${c},${clamp(a, 0, 1).toFixed(3)})`);
  g.fillStyle = gr; circle(g, x, y, r); g.fill();
}

// ---------------------------------------------------------------- the 3D pieces (baked with his fights)
// a tentacle segment: a smooth dark tube along x (radius SEG_R; 'oc:segN' hides the joins), and its sucker: a pale cup
// on its +y side (on every other segment, turned to face you)
const SEG_R = 4;
function suckMesh() {
  const out = [], S = M3.hex('#efc9b8'), S2 = M3.hex('#b98577'), n = M3.norm([0, 0.88, -0.42]), p = M3.scl(n, SEG_R * 0.98);
  M3.decal(out, p, n, 1.7, 1.7, 0.55, S, 0, 0.3, M3.MATTE);
  M3.decal(out, M3.add(p, M3.scl(n, 0.42)), n, 0.75, 0.75, 0.2, S2);
  return out;
}
defProp('oc:seg', { mesh: () => segTube([], 2.2, SEG_R, () => M3.hex(INK)), n: 32, sym: 2, ink: '#0d1117' });
defProp('oc:segN', { mesh: () => segTube([], 2.2, SEG_R, () => M3.hex(INK), 0), n: 32, sym: 2, ink: '#0d1117', out: 0 });
defProp('oc:suck', { mesh: suckMesh, n: 24, ink: '#8a5a4e', out: 0.35 });
// its tip: tapering and curling up and back over itself (its root at (0, 0, 0), heading along x)
function tipMesh() {
  const out = [], D = M3.hex(INK), pts = [];
  for (let i = 0; i <= 14; i++) { const u = i / 14, a = u * 1.5 * Math.PI, R = 4.6 * (1 - 0.45 * u); pts.push([Math.sin(a) * R + u * 2, 0, (1 - Math.cos(a)) * R * 0.9]); }
  M3.tube(out, pts, t => 2.4 - 1.75 * t, D, M3.MATTE, 1, 10);
  return out;
}
defProp('oc:tip', { mesh: tipMesh, n: 16, ink: '#0d1117' });
// glossy ink on the floor (decals). Ink is near black, so its top's normal leans away from the light (flat-lit it would
// turn grey); the raised rim catches light like a meniscus, the sky shows as a cool sheen.
// 'oc:pool' radius 40 (Ink Jet's puddle, Fork's pool), 'oc:splat' radius 8 with drops
const INKC = M3.hex('#11131b'), LIP = M3.hex('#262b3c'), SKY = M3.hex('#5a6b98'), TILT = M3.norm([1, 0, 1]);
function inkMesh(R, seed, drops) {
  const out = [], nu = 40, rim = a => R * (1 + 0.09 * Math.sin(3 * a + seed) + 0.06 * Math.sin(5 * a + seed * 2.1) + 0.03 * Math.sin(9 * a + seed));
  M3.grid(out, (i, j) => { const a = TAU * j / nu, u = i / 5, r = rim(a) * u * 0.9, z = 0.9 + 0.25 * (1 - u * u); return [[Math.cos(a) * r, Math.sin(a) * r, z], TILT, TILT]; }, nu, 5, INKC, M3.MATTE, 0);
  M3.grid(out, (i, j) => { const a = TAU * j / nu, b = Math.PI * i / 4, r = rim(a) * (0.9 + 0.1 * (1 - Math.cos(b)) / 2) , z = 0.15 + 0.9 * Math.sin(b), nn = M3.norm([Math.cos(a) * Math.cos(b) * 1.2, Math.sin(a) * Math.cos(b) * 1.2, Math.sin(b) + 0.2]); return [[Math.cos(a) * r, Math.sin(a) * r, z], nn, nn]; }, nu, 4, LIP, M3.MATTE, 0);
  M3.decal(out, [-R * 0.3, -R * 0.12, 1.2], TILT, R * 0.38, R * 0.2, 0.1, SKY, -0.55, 0, M3.MATTE);   // (the sky in it)
  M3.decal(out, [-R * 0.36, -R * 0.22, 1.3], [0, 0, 1], R * 0.22, R * 0.05, 0.1, M3.hex('#ffffff'), -0.55, 0, M3.GLOSS);
  M3.decal(out, [-R * 0.12, -R * 0.38, 1.3], [0, 0, 1], R * 0.07, R * 0.035, 0.1, M3.hex('#ffffff'), -0.5, 0, M3.GLOSS);
  for (let k = 0; k < drops; k++) { const a = k * 2.39 + seed, r = R * (1.22 + 0.25 * hsh(k + seed)), w = R * (0.05 + 0.05 * hsh(k * 3 + seed)); M3.ellipsoid(out, [Math.cos(a) * r, Math.sin(a) * r, 0.4], [[w * 1.3, 0, 0], [0, w, 0], [0, 0, w * 0.5]], LIP, M3.MATTE, 12, 6, 0); }
  return out;
}
defProp('oc:pool', { mesh: () => inkMesh(40, 0.7, 6), n: 1, decal: true, ink: '#05060a', out: 0.6, r0: 40 });
defBit('oc:splat', { mesh: () => inkMesh(8, 2.3, 5), n: 1, tumble: false, decal: true, ink: '#05060a', out: 0.35, r0: 8 });
propsFor(ID, ['oc:seg', 'oc:segN', 'oc:suck', 'oc:tip', 'bit:oc:splat', 'oc:pool', ...SHARED_BITS]);
const ready = () => segReady('oc:seg') && segReady('oc:segN');
// an arm: its segments (one smooth body), then a sucker on every other one, turned to the side facing you
function armDraw(g, segs, a = 1, idx = null, N = segs.length) {   // (a run of an arm: idx each segment's place along the whole arm, N its length)
  drawSegs(g, segs, 'oc:seg', 'oc:segN', a);
  for (let m = 0; m < segs.length; m++) {
    const k = idx ? idx[m] : m; if (k < 2 || k % 2 || k >= N - 1) continue;
    const q = segs[m], yaw = Math.cos(q.yaw) < 0 ? q.yaw : q.yaw + Math.PI;
    g.translate(q.x, q.y); drawProp3D(g, 'oc:suck', { yaw, scale: q.s, alpha: a }); g.translate(-q.x, -q.y);
  }
}
const gapOf = s => SEG_R * 0.85 * Math.max(0.4, s);
// a screen yaw for a heading on the floor (a segment seen along the way it's drawn)
const floorYaw = a => Math.atan2(Math.sin(a) / SE, Math.cos(a));
const MEM = new WeakMap();
const every = (v, key, dt) => { let m = MEM.get(v); if (!m) MEM.set(v, m = {}); if (m[key] != null && v.t - m[key] < dt && v.t >= m[key]) return false; m[key] = v.t; return true; };
const inkDrops = (v, x, y, z, n, o = {}) => bits3(v, 'ink', x, y, z, n, { speed: [40, 110], up: [60, 150], s: [1.4, 2.4], life: [0.5, 0.8], g: 700, bo: 0.1, ...o });
const dust = (v, x, y, n, o = {}) => bits3(v, 'po:dust', x, y, 2, n, { speed: [20, 60], up: [10, 40], s: [3.5, 6], life: [0.45, 0.8], g: 40, drag: 3, grow: 0.9, fade: 'alpha', bo: 0, al: 0.85, sh: false, sp: 0, ...o });
const splat = (v, x, y, s) => bit3(v, 'oc:splat', x, y, 0, { g: 0, life: 1.4, s, fade: 'alpha', sh: false, sp: 0, a: 0, al: 0.95 });

// clip to the arena's floor (a mark on it never runs out over its wall)
function clipArena(g, F) {
  const b = F.A && F.A.bounds; if (!b) return;
  g.beginPath();
  if (b.shape === 'circle') g.arc(0, 0, b.r, 0, TAU); else if (g.roundRect) g.roundRect(-b.w / 2, -b.h / 2, b.w, b.h, b.r || 0); else g.rect(-b.w / 2, -b.h / 2, b.w, b.h);
  g.clip();
}
// a tentacle's source: Octo (src 0) or his clone (its id)
const srcOf = (F, own, src) => !src ? own : F.objs.find(b => b.id === src && b.kind === 'ocClone') || null;
// the blame's coil, 0..1 wound up, and whether it's settled (the last lock s)
function coilOf(f) {
  const M = f.stats && f.stats.moves.move1; if (!M || f.ph !== 'coil') return null;
  const dur = f.state === 'wind' ? f.dur || M.startup : M.startup, t = f.pht || 0, aimT = Math.max(0.05, dur - M.lock);
  return { u: clamp(t / aimT, 0, 1), lk: t >= aimT, lq: clamp((t - aimT) / Math.max(0.05, M.lock), 0, 1) };
}

const CUES = new WeakMap();   // (per fight: the cues already played)
const ART_O = {
  id: ID,
  anim(F, v, f) {
    const A = animBase(), k = f.pht || 0, sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
    switch (f.ph) {
      case 'coil': { const c = coilOf(f), q = ease(c ? c.u : 1); sq(0.07 * q); A.fwd = -4 * q; A.lean = -0.07 * q; if (c && c.lk) A.wx = Math.sin(k * 80) * 0.6; break; }   // (sunk back as it winds; settled, tense and trembling)
      case 'shoot': sq(-0.07 * Math.exp(-k * 8)); A.fwd = 4 * ease(k / 0.06); break;   // (thrown after it)
      case 'blamed': sq(0.06 * Math.exp(-k * 10)); A.fwd = 3 * Math.exp(-k * 6); A.mood = 'happy'; break;
      case 'droop': Object.assign(A, settleAnim(k, f.stats.moves.move1.miss, 'droop', 0.3)); break;   // (missed: the tentacle flops back and he settles: a delay, not a stun)
      case 'fork': {   // a deep breath, puffed up and wobbling, turned to the spot; then he spits the glob of ink at it
        const sp = spotOf(F, f), mv = f.stats.moves.move3, T0 = mv.startup * GLOB_AT, turn = sp ? clamp(angD(Math.atan2(sp.y - f.y, sp.x - f.x), f.face), -1.3, 1.3) : 0;
        if (k < T0) { const q = k / T0; A.pose = 'rise'; sq(-0.1 * ease(q) + 0.03 * Math.sin(k * 44) * q); A.hop = 3 * ease(q); A.lean = -0.08 * ease(q); A.wx = Math.sin(k * 44) * 1.2 * q; A.spin = turn * ease(q) * 0.7; }
        else { const q = k - T0, e = Math.exp(-q * 14); A.pose = q < 0.1 ? 'ink' : 'fork'; sq(0.16 * e * Math.cos(q * 30)); A.fwd = 4 * Math.sin(clamp(q / 0.16, 0, 1) * Math.PI); A.hop = 3 * Math.exp(-q * 20); A.spin = turn * 0.7; A.wx = Math.sin(k * 44) * 0.8; }
        break;
      }
      case 'forked': {   // the clone pops up: he bounces with it, delighted, and turns back
        const e = Math.exp(-k * 8); sq(0.1 * e * Math.cos(k * 24)); A.hop = 5 * Math.max(0, Math.sin(clamp(k / 0.24, 0, 1) * Math.PI)); A.mood = 'happy';
        const cl = (F.objs || []).find(b => b.kind === 'ocClone' && b.owner === f.i && b.ph === 'pop'); if (cl) A.spin = clamp(angD(Math.atan2(cl.y - f.y, cl.x - f.x), f.face), -1.3, 1.3) * 0.7 * (1 - ease(k / 0.3));
        break;
      }
      case 'rise': { const q = clamp(k / Math.max(0.05, f.state === 'wind' ? f.dur : 0.14), 0, 1), ch = f.ocC || 0; sq(-0.14 * ease(q) - 0.06 * ch); A.hop = 7 * ease(q) + 4 * ch; A.wx = Math.sin(k * 70) * (0.5 * q + 0.8 * ch); break; }   // bobbing up on all his tentacles; held, up higher and trembling as they gather
      case 'push': sq(0.26 * Math.exp(-k * 10) * Math.cos(k * 14)); A.hop = Math.max(0, 7 - k * 160); break;   // slammed down with them, squashed, springing back
      case 'gather': Object.assign(A, settleAnim(k, f.stats.moves.move2.miss, 'slam', 0.3)); break;   // (missed: the tentacles gather back slowly and he settles: a delay, not a stun)
      case 'jet': sq(-0.1); A.hop = 5 * Math.sin(clamp(k / 0.2, 0, 1) * Math.PI); A.lean = -0.08; break;
      case 'land': sq(0.1 * Math.exp(-k * 10)); break;
      default: return null;
    }
    return A;
  },
  ground(g, F, v, o) {
    switch (o.kind) {
      case 'ocLine': g.save(); clipArena(g, F); dampTrack(g, F, v, o); g.restore(); break;
      case 'ocSpot': {   // only once his glob of ink has landed: the blot spreading, the branch running out to it from him
        const T = globClock(F, o), t = o.t - T.T1; if (t < 0) break;
        const o2 = { ...o, t: t * 0.35 / Math.max(0.05, forkUp(F, o) - T.T1) };
        branch(g, F, v, o, clamp(o2.t / 0.35, 0, 1), 1); if (ready()) spot3(g, v, o2); else inkBlot(g, o, clamp(o2.t / 0.35, 0, 1), 1);
        break;
      }
      case 'ocClone': branch(g, F, v, o, 1, cloneLink(F, o)); break;
      case 'ocRing': tipShadows(g, F, v, o); break;
      case 'ocWave': g.save(); clipArena(g, F); ripple(g, o); g.restore(); break;
      case 'ocInk': if (ready()) puddle3(g, o, v.t); else inkPuddle(g, o, v.t); break;
    }
  },
  // standing among the fighters: the shot tentacle, the clone, the Ink Jet's cloud
  things(F, v, g, o, out) {
    if (o.kind === 'ocArm' && o.len > 2) out.push({ y: o.sy + Math.sin(o.a) * 3, d: () => shotArm(g, F, v, o) });
    else if (o.kind === 'ocClone' && o.t < o.life) out.push({ y: o.y, d: () => clone(g, F, v, o) });
    else if (o.kind === 'ocInk' && o.t < CLOUD) out.push({ y: o.y + 2, d: () => inkCloud(g, F, v, o) });
    else if (o.kind === 'ocSpot') glob(F, v, g, o, out);
  },
  // marks that outlive a move: the Force Push's sucker prints, the blame's wet streaks and the skid of whoever it knocked back
  floor(g, F, v) { g.save(); clipArena(g, F); streaks(g, F, v); g.restore(); prints(g, v); },
  // the blame's coil behind him (or in front: over), the tentacles rising round him; ink trailing off him as he jets
  behind(g, F, v, f) {
    if (f.id === ID) {
      g.save(); g.translate(f.x, f.y); riseArms(g, f, -1, v.t); coilArm(g, f, f, -1, v.t); g.restore();
      if (f.ph === 'jet' && ready() && every(v, 'jet' + f.i, 1 / 30)) { const sp = Math.hypot(f.vx, f.vy) || 1; inkDrops(v, f.x - f.vx / sp * 8, f.y - f.vy / sp * 8, 12, 1, { dir: Math.atan2(-f.vy, -f.vx), spread: 0.8, speed: [20, 60], up: [30, 80], s: [1.2, 2] }); }
    }
    return null;
  },
  over(g, F, v, f) {
    if (f.id === ID) { riseArms(g, f, 1, v.t); coilArm(g, f, f, 1, v.t); }
  },
  event(v, F, e, few) {
    const r3 = ready();
    switch (e.kind) {
      case 'ocCoil': { const f = F.f[e.who]; if (f && r3) inkDrops(v, f.x - Math.cos(f.face) * 14, f.y - Math.sin(f.face) * 10, 26, few ? 1 : 2, { speed: [15, 40], up: [20, 60], s: [1.1, 1.7] }); return true; }   // (a drip or two shaken off the coil)
      case 'ocLock': return true;
      case 'ocShoot': {   // the tentacle whips out: a few drops flung off its root along the line
        const a = Math.atan2(e.y2 - e.y, e.x2 - e.x);
        if (r3) inkDrops(v, e.x + Math.cos(a) * 16, e.y + Math.sin(a) * 16, 12, few ? 1 : 3, { dir: a, spread: 0.6, speed: [60, 130], up: [30, 80], s: [1.1, 1.8] });
        return true;
      }
      case 'ocWhack': {   // its tip thwacks flat on them: an ink splat, drops flung the way they're knocked, dust, the camera nudged in (the
        // skid of their slide back: floor)
        const a = e.a ?? 0, own = !e.src;
        if (r3) {
          splat(v, e.x + Math.cos(a) * 4, e.y + Math.sin(a) * 3, own ? 8 : 6);
          inkDrops(v, e.x, e.y, 16, few ? 3 : own ? 9 : 6, { dir: a, spread: 1.3, speed: [70, 160], up: [80, 170], s: [1.4, 2.6] });
          dust(v, e.x, e.y, few ? 1 : 3, { dir: a, spread: 1.4, speed: [40, 90], r: 6 });
        } else { v.fx.push({ k: 'splash', x: e.x, y: e.y - 16, t: 0, life: 0.35, s: own ? 16 : 12, ink: 1 }); puff(v, e.x, e.y - 6, few ? 1 : 3, null); }
        v.fx.push({ k: 'flash', x: e.x, y: e.y - 20, t: 0, life: 0.12, s: own ? 22 : 16 });
        if (own) { v.shake = Math.max(v.shake, 0.12); v.punch = { t: v.t, x: e.x, y: e.y }; }
        skid(v, F, e);
        streakTo(v, F, e, e.x - Math.cos(a) * (F.f[e.to] ? F.f[e.to].r : 16), e.y - Math.sin(a) * (F.f[e.to] ? F.f[e.to].r : 16));
        return true;
      }
      case 'ocFlop': {   // a miss: its tip slaps the floor at full stretch, a splat, a puff of dust, its sucker prints
        const S = srcOf(F, F.f[e.who], e.src), a = S ? Math.atan2(e.y - S.y, e.x - S.x) : 0;
        if (r3) { splat(v, e.x, e.y, 5); dust(v, e.x, e.y, few ? 1 : 2, { r: 5, speed: [20, 50] }); inkDrops(v, e.x, e.y, 3, few ? 1 : 2, { speed: [30, 60], up: [40, 90], s: [1.1, 1.8] }); }
        else v.fx.push({ k: 'splash', x: e.x, y: e.y - 4, t: 0, life: 0.3, s: 9, ink: 1 });
        print(v, e.x, e.y, a);
        streakTo(v, F, e, e.x, e.y);
        return true;
      }
      case 'ocRise': { const f = F.f[e.who]; if (f && r3) dust(v, f.x, f.y, few ? 1 : 2, { r: 12, speed: [15, 40] }); return true; }   // (the flick: a little dust off the floor round him)
      case 'ocFork': if (r3) { inkDrops(v, e.x, e.y, 4, few ? 4 : 8, { speed: [30, 90], up: [120, 220] }); if (e.x0 != null) inkDrops(v, e.x0, e.y0, 20, few ? 1 : 3, { speed: [20, 50] }); }
        else { v.fx.push({ k: 'splash', x: e.x, y: e.y - 6, t: 0, life: 0.4, s: 16, ink: 1 }); if (e.x0 != null) v.fx.push({ k: 'splash', x: e.x0, y: e.y0 - 20, t: 0, life: 0.3, s: 10, ink: 1 }); }
        return true;
      case 'ocPop': if (r3) { inkDrops(v, e.x, e.y, 22, few ? 4 : (e.how === 'hit' ? 10 : 7), { speed: [40, 120], up: [80, 180], s: [1.4, 2.8] }); splat(v, e.x, e.y + 2, 9); }
        else { v.fx.push({ k: 'splash', x: e.x, y: e.y - 20, t: 0, life: 0.4, s: e.how === 'hit' ? 18 : 12, ink: 1 }); puff(v, e.x, e.y - 10, few ? 2 : 4, '#c9ccd6'); }
        return true;
      case 'ocSlam': {   // the tentacles hit the floor: ink splats at their tips, dust rolling out (the shake: only when it lands)
        if (r3) {
          const f = F.f[e.who], SL = slamL(f);
          for (let j = 0; j < 8; j++) {
            const a = j / 8 * TAU + 0.2, L = SL * (0.92 + 0.12 * hsh(j + (f ? f.ms || 0 : 0))), x = e.x + Math.cos(a) * (21 + L), y = e.y + Math.sin(a) * (21 + L);
            if (j % 2 === 0 && (!few || j % 4 === 0)) splat(v, x, y, 5 + 3 * hsh(j * 3 + 1));
            print(v, x, y, a);   // (its suckers' prints left on the floor: floor)
            if (j % 2 === 0) inkDrops(v, x, y, 3, few ? 1 : 2, { speed: [30, 70], up: [60, 120], s: [1.2, 2] });
          }
          for (let k = 0; k < (few ? 4 : 7); k++) { const a = k / (few ? 4 : 7) * TAU + frnd(-0.2, 0.2); dust(v, e.x + Math.cos(a) * 34, e.y + Math.sin(a) * 22, 1, { dir: a, spread: 0.3, speed: [50, 90] }); }
        } else {
          v.fx.push({ k: 'dring', x: e.x, y: e.y, t: 0, life: 0.5, s: 44, id: 6 });
          for (let k = 0; k < (few ? 4 : 8); k++) { const a = k / (few ? 4 : 8) * TAU + frnd(-0.2, 0.2); puff(v, e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 18, 1, null); }
        }
        return true;
      }
      case 'ocBurst': {   // the slam lands on them: ink and dust burst off them along the blast, a gentle shake, the camera nudged in
        const a = e.a ?? 0;
        if (r3) { inkDrops(v, e.x, e.y, 16, few ? 4 : 9, { dir: a, spread: 1.4, speed: [70, 160], up: [90, 190], s: [1.5, 2.8] }); dust(v, e.x, e.y, few ? 2 : 5, { dir: a, spread: 1.2, speed: [50, 110], r: 8 }); splat(v, e.x, e.y + 2, 7); }
        else v.fx.push({ k: 'splash', x: e.x, y: e.y - 18, t: 0, life: 0.35, s: 16, ink: 1 });
        v.fx.push({ k: 'flash', x: e.x, y: e.y - 22, t: 0, life: 0.12, s: 22 });
        v.shake = Math.max(v.shake, 0.18); v.punch = { t: v.t, x: e.x, y: e.y };
        return true;
      }
      case 'ocWallSlam': {   // shoved into a wall: a big ink splat thrown up the wall and on the floor at its foot, chips and dust off
        // the wall, ink drops flung back, a soft shake (the Push's own payoff)
        const a = Math.atan2(e.ny ?? -1, e.nx ?? 0);   // (off the wall, back into the arena)
        if (r3) {
          splat(v, e.x, e.y, 13); splat(v, e.x + Math.cos(a + 1.3) * 10, e.y + Math.sin(a + 1.3) * 7, 7); splat(v, e.x + Math.cos(a - 1.3) * 10, e.y + Math.sin(a - 1.3) * 7, 6);
          inkDrops(v, e.x, e.y, 24, few ? 5 : 12, { dir: a, spread: 2.2, speed: [60, 150], up: [120, 240], s: [1.6, 3] });
          dust(v, e.x, e.y, few ? 3 : 6, { dir: a, spread: 2, speed: [50, 120], r: 10 });
          if (propReady('bit:stone')) bits3(v, 'stone', e.x, e.y, 30, few ? 2 : 5, { dir: a, spread: 1.8, speed: [60, 140], up: [80, 180], s: [1.6, 2.6], life: [0.6, 0.9], bo: 0.3, few });
        } else { v.fx.push({ k: 'splash', x: e.x, y: e.y - 20, t: 0, life: 0.45, s: 24, ink: 1 }); puff(v, e.x, e.y - 12, few ? 3 : 6, null); }
        v.fx.push({ k: 'flash', x: e.x, y: e.y - 24, t: 0, life: 0.14, s: 30 });
        v.shake = Math.max(v.shake, 0.32); v.punch = { t: v.t, x: e.x, y: e.y };
        return true;
      }
      case 'ocInkJet': {   // a squirt of ink back where he was, a few drops flung
        const a = Math.atan2((e.y2 ?? e.y) - e.y, (e.x2 ?? e.x) - e.x) + Math.PI;
        if (r3) { inkDrops(v, e.x, e.y, 14, few ? 3 : 7, { dir: a, spread: 1.4, speed: [50, 130], up: [70, 150] }); return true; }
        v.fx.push({ k: 'splash', x: e.x, y: e.y - 8, t: 0, life: 0.45, s: 18, ink: 1 });
        for (let k = 0; k < (few ? 2 : 5); k++) { const b = a + frnd(-0.6, 0.6), sp = frnd(40, 100); v.fx.push({ k: 'ocDrop', x: e.x, y: e.y, z: frnd(10, 24), vx: Math.cos(b) * sp, vy: Math.sin(b) * sp * 0.6, vz: frnd(60, 140), t: 0, life: 0.6, s: frnd(1.6, 2.4) }); }
        return true;
      }
    }
    return false;
  },
  fx(g, F, v, p, k, dt) {
    if (p.k !== 'ocDrop') return false;
    p.vz -= 800 * dt; p.z = Math.max(0, p.z + p.vz * dt);
    g.fillStyle = `rgba(28,32,44,${(0.85 * (1 - k * k)).toFixed(3)})`; g.beginPath(); g.ellipse(p.x, p.y - p.z, p.s, p.s * (p.z > 0 ? 1.25 : 0.5), 0, 0, TAU); g.fill();
    return true;
  },
  icon(g, kind, r, col) {
    g.fillStyle = col || '#ffffff'; g.strokeStyle = col || '#ffffff'; g.lineCap = 'round'; g.lineJoin = 'round';
    switch (kind) {
      case 'ocBlame':   // a tentacle shooting out along a dotted track, its tip curled
        g.globalAlpha *= 0.55; for (let k = 0; k < 3; k++) { circle(g, r * (0.05 + k * 0.28), r * 0.5, r * 0.08); g.fill(); } g.globalAlpha /= 0.55;
        g.lineWidth = r * 0.24; g.beginPath(); g.moveTo(-r * 0.75, r * 0.15); g.quadraticCurveTo(-r * 0.2, -r * 0.35, r * 0.45, -r * 0.05); g.stroke();
        g.lineWidth = r * 0.14; g.beginPath(); g.arc(r * 0.5, -r * 0.3, r * 0.22, Math.PI * 0.5, Math.PI * 2.1); g.stroke();
        return true;
      case 'ocFork':   // a branch: one dot splitting into two
        g.lineWidth = r * 0.14; g.beginPath(); g.moveTo(-r * 0.2, r * 0.65); g.lineTo(-r * 0.2, -r * 0.6); g.moveTo(-r * 0.2, r * 0.25); g.quadraticCurveTo(r * 0.45, r * 0.1, r * 0.45, -r * 0.3); g.stroke();
        circle(g, -r * 0.2, r * 0.65, r * 0.17); g.fill(); circle(g, -r * 0.2, -r * 0.62, r * 0.17); g.fill(); circle(g, r * 0.45, -r * 0.38, r * 0.17); g.fill();
        return true;
      case 'ocPush':   // a body with tentacles slamming out all round
        circle(g, 0, -r * 0.12, r * 0.3); g.fill();
        g.lineWidth = r * 0.12; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.26; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.42, -r * 0.12 + Math.sin(a) * r * 0.36); g.lineTo(Math.cos(a) * r * 0.85, -r * 0.12 + Math.sin(a) * r * 0.7); g.stroke(); }
        return true;
      case 'ocInk':   // a drop of ink, a splash under it
        g.beginPath(); g.moveTo(0, -r * 0.75); g.quadraticCurveTo(r * 0.5, -r * 0.05, r * 0.38, r * 0.25); g.arc(0, r * 0.22, r * 0.38, 0, Math.PI); g.quadraticCurveTo(-r * 0.5, -r * 0.05, 0, -r * 0.75); g.fill();
        g.globalAlpha *= 0.5; g.beginPath(); g.ellipse(0, r * 0.75, r * 0.7, r * 0.16, 0, 0, TAU); g.fill(); g.globalAlpha /= 0.5;
        return true;
    }
    return false;
  },
  // his own wet, rubbery sounds (beats that aren't events: cues)
  sound(e) {
    switch (e.kind) {
      case 'ocCoil': return [['ocCoil', 0.45]];
      case 'ocLock': return [['ocLock', 0.35]];
      case 'ocShoot': return [['ocThwip', e.src ? 0.5 : 0.7]];
      case 'ocWhack': return [['ocSmack', e.src ? 0.6 : 0.8]];
      case 'ocFlop': return [['ocFlop', 0.5]];
      case 'ocFork': return [['ocBloop', 0.7], ['fFork', 0.3]];
      case 'ocPop': return [['ocPopClone', 0.6]];
      case 'ocRise': return [['ocRise', 0.5]];
      case 'ocSlam': return [['ocSlap', 0.7]];
      case 'ocBurst': return [['ocWhump', 0.7]];
      case 'ocWallSlam': return [['fThud', 0.75], ['ocSmack', 0.6]];
      case 'ocInkJet': return [['ocSquirt', 0.7]];
    }
    return null;
  },
  // beats that aren't events: Fork's breath, the glob spat and its splat (a missed blame's flop is an event, ocFlop)
  cues(F, play) {
    let M = CUES.get(F); if (!M) CUES.set(F, M = { ph: [], seen: new Set() });
    for (const f of F.f) { if (f.id === ID && f.ph !== M.ph[f.i] && f.ph === 'fork') play('ocInhale', 0.6); M.ph[f.i] = f.ph; }
    for (const o of F.objs || []) {
      if (o.kind !== 'ocSpot' || !F.f[o.owner]) continue;
      const T = globClock(F, o), once = (k, n, vol) => { const key = k + o.id; if (M.seen.has(key)) return; M.seen.add(key); if (M.seen.size > 300) M.seen.clear(); play(n, vol); };
      if (o.t >= T.T0) once('s', 'ocSpit', 0.7);
      if (o.t >= T.T1) once('l', 'ocSplat', 0.7);
    }
  },
  sounds: {
    ocRise: ({ osc, hiss }) => (v, t) => { osc(t, 140, 0.45, 'triangle', 0.08 * v, 120); hiss(t, 0.4, 0.04 * v, 'bandpass', 400, 900); },   // a low wet swell
    ocCoil: ({ osc, hiss }) => (v, t) => { hiss(t, 0.35, 0.05 * v, 'bandpass', 700, 1400); osc(t, 220, 0.35, 'triangle', 0.05 * v, -90); },   // a wet creak, winding up
    ocLock: ({ osc }) => (v, t) => { osc(t, 900, 0.06, 'sine', 0.07 * v, 500); osc(t + 0.05, 1300, 0.05, 'sine', 0.04 * v, 300); },   // a little wet plip: settled
    ocThwip: ({ osc, hiss }) => (v, t) => { hiss(t, 0.12, 0.1 * v, 'bandpass', 800, 2800); osc(t, 260, 0.1, 'sine', 0.07 * v, 400); },   // the tentacle shooting out: a rubbery thwip
    ocSmack: ({ osc, hiss }) => (v, t) => { hiss(t, 0.08, 0.16 * v, 'bandpass', 1400, 500); osc(t, 160, 0.14, 'sine', 0.2 * v, -70); osc(t + 0.01, 420, 0.05, 'triangle', 0.06 * v, -200); },   // a wet smack
    ocFlop: ({ osc, hiss }) => (v, t) => { osc(t, 200, 0.18, 'sine', 0.08 * v, -110); hiss(t + 0.05, 0.12, 0.05 * v, 'lowpass', 700); },   // a miss: the tip flopping down
    ocInhale: ({ hiss, osc }) => (v, t) => { hiss(t, 0.14, 0.05 * v, 'bandpass', 600, 1500); osc(t, 200, 0.14, 'sine', 0.03 * v, 140); },   // a deep breath in
    ocSpit: ({ osc, hiss }) => (v, t) => { osc(t, 520, 0.06, 'sine', 0.1 * v, -320); hiss(t, 0.05, 0.08 * v, 'bandpass', 1800, 900); },   // ptoo
    ocSplat: ({ osc, hiss }) => (v, t) => { hiss(t, 0.1, 0.1 * v, 'lowpass', 1600, 400); osc(t, 180, 0.08, 'sine', 0.08 * v, -90); },   // the glob splatting
    ocBloop: ({ osc }) => (v, t) => { osc(t, 180, 0.12, 'sine', 0.12 * v, 320); osc(t + 0.1, 420, 0.1, 'sine', 0.08 * v, 300); osc(t + 0.18, 840, 0.06, 'triangle', 0.04 * v); },   // the clone blooping up out of the puddle
    ocPopClone: ({ osc, hiss }) => (v, t) => { osc(t, 600, 0.06, 'sine', 0.1 * v, -400); hiss(t, 0.14, 0.08 * v, 'bandpass', 1200, 500); },   // the clone popping into ink
    ocSlap: ({ osc, hiss }) => (v, t) => { for (let k = 0; k < 3; k++) hiss(t + k * 0.025, 0.06, 0.1 * v, 'bandpass', 1300 - k * 200, 500); osc(t, 110, 0.2, 'sine', 0.18 * v, -40); },   // the tentacles slapping down
    ocWhump: ({ osc, hiss }) => (v, t) => { osc(t, 90, 0.25, 'sine', 0.25 * v, -40); hiss(t, 0.25, 0.1 * v, 'lowpass', 1200, 200); },   // the push's shockwave landing on them
    ocSquirt: ({ osc, hiss }) => (v, t) => { hiss(t, 0.22, 0.12 * v, 'bandpass', 900, 2200); osc(t, 300, 0.2, 'sine', 0.06 * v, -180); },   // the ink jet squirting
  },
};

// ---------------------------------------------------------------- git blame
// the coil (source at (0, 0), its feet; S its facing, f the Octo driving it): wound up behind his right, tighter and
// higher as he aims; settled, it trembles. side -1: before the body, 1: after
function coilArm(g, S, f, side, t) {
  const c = coilOf(f); if (!c || !ready()) return;
  const f0 = S.face || 0, aA = f0 + Math.PI * 0.7, aB = f0 - Math.PI * 0.7, a0 = Math.sin(aA) < Math.sin(aB) ? aA : aB, sn = Math.sin(a0); if ((sn >= 0 ? 1 : -1) !== side) return;   // (behind him, on the side away from you: it rises over his shoulder)
  const b = (S.face || 0) + Math.PI, bx = Math.cos(b), by = Math.sin(b), q = ease(c.u), tr = c.lk ? Math.sin(t * 70) * 0.9 : 0;
  const r1 = 24 + 8 * q, z1 = 16 + 18 * q, rho0 = 13 - 3 * q, turns = Math.PI * (1.1 + 1.0 * q);
  const P1 = [Math.cos(a0) * r1, Math.sin(a0) * r1, z1];
  const p = u => {
    if (u < 0.35) { const w = u / 0.35; return [Math.cos(a0) * (10 + (r1 - 10) * w), Math.sin(a0) * (10 + (r1 - 10) * w), 10 + (z1 - 10) * w * w]; }
    const s = (u - 0.35) / 0.65, th = s * turns, rho = rho0 * (1 - 0.5 * s), C = [P1[0], P1[1], P1[2] + rho0];
    return [C[0] + bx * rho * Math.sin(th) - by * tr, C[1] + by * rho * Math.sin(th) + bx * tr, C[2] - rho * Math.cos(th)];
  };
  armDraw(g, spine(bodyAt(p, u => 1.45 - 0.75 * u), gapOf, 40));
}
// the damp track (the blame's tell, out to its reach): a band with sucker prints popping up, darker once settled, a tip
// print at its end; settled, a wet bead runs down and arrives as the tentacle comes
function dampTrack(g, F, v, o) {
  const own = F.f[o.owner]; if (!own) return;
  const L = SRC_R + (o.len || 0), r0 = 20; if (L < r0 + 6) return;
  const c = Math.cos(o.a), s = Math.sin(o.a), BD = bold(), a = clamp(o.t / 0.1, 0, 1), cl = o.src ? 0.75 : 1;
  const st = coilOf(own), lk = o.lk ? 1 : 0, lq = st ? st.lq : lk;
  const band = (BD ? 0.15 : 0.11) + (BD ? 0.13 : 0.1) * lk;
  g.save(); g.lineCap = 'round';
  const gr = g.createLinearGradient(o.x + c * r0, o.y + s * r0, o.x + c * L, o.y + s * L);
  gr.addColorStop(0, 'rgba(36,42,56,0)'); gr.addColorStop(0.12, `rgba(36,42,56,${(band * a * cl).toFixed(3)})`); gr.addColorStop(0.9, `rgba(36,42,56,${(band * a * cl).toFixed(3)})`); gr.addColorStop(1, `rgba(36,42,56,${(band * 0.5 * a * cl).toFixed(3)})`);
  g.strokeStyle = gr; g.lineWidth = 16; g.beginPath(); g.moveTo(o.x + c * r0, o.y + s * r0); g.lineTo(o.x + c * L, o.y + s * L); g.stroke();
  for (let d = r0 + 8, k = 0; d < L - 6; d += 15, k++) {   // the sucker prints: a soft dark ring with a paler middle, popping up as the track reaches them
    const pop = backE(clamp((L - d) / 14, 0, 1)), q = a * cl * clamp((d - r0) / 10, 0, 1); if (q < 0.03 || pop < 0.05) continue;
    const off = (k % 2 ? 4.4 : -4.4), x = o.x + c * d - s * off, y = o.y + s * d + c * off, rr = (3.4 - 1.1 * d / Math.max(L, 1)) * pop;
    softDisc(g, x, y, rr + 1.8, [[0, '40,34,44', (0.08 + 0.1 * lk) * q], [0.6, '40,34,44', (0.22 + 0.2 * lk) * q], [1, '40,34,44', 0]]);
    g.fillStyle = `rgba(250,232,222,${((0.3 + 0.25 * lk) * q).toFixed(3)})`; circle(g, x - 0.3, y - 0.4, rr * 0.5); g.fill();
  }
  // its end: where the tip will land, a soft damp round blot with a ring, firmer once settled
  const ex = o.x + c * (L - 4), ey = o.y + s * (L - 4), ea = (0.18 + 0.32 * lk) * a * cl;
  softDisc(g, ex, ey, 9, [[0, '36,40,54', 0.9 * ea], [0.55, '36,40,54', 0.55 * ea], [1, '36,40,54', 0]]);
  g.strokeStyle = `rgba(36,40,54,${(0.8 * ea).toFixed(3)})`; g.lineWidth = BD ? 1.6 : 1.3; circle(g, ex, ey, 6); g.stroke();
  // the wet bead running down it once it's settled: when it gets to the end, the tentacle comes
  if (lk) {
    const d = r0 + (L - 10 - r0) * ease(lq), x = o.x + c * d, y = o.y + s * d;
    softDisc(g, x + 0.6, y + 1.2, 6, [[0, '14,16,26', 0.3 * cl], [1, '14,16,26', 0]]);
    g.fillStyle = `rgba(22,25,36,${(0.9 * cl).toFixed(3)})`; g.beginPath(); g.ellipse(x, y, 3.6, 2.8, o.a, 0, TAU); g.fill();
    g.fillStyle = `rgba(215,226,255,${(0.75 * cl).toFixed(3)})`; circle(g, x - 1.1, y - 1, 1); g.fill();
  }
  g.restore();
}
// the shot tentacle (an ocArm): out low along its line, rippling, tip curled; the clone's a little see-through
function shotArm(g, F, v, o) {
  const own = F.f[o.owner], S = own && srcOf(F, own, o.src); if (!own) return;
  const L = o.len || 0, c = Math.cos(o.a), s = Math.sin(o.a), nx = -s, ny = c, al = o.src ? (S ? 0.72 : 0.4) : 1, out = o.ph === 'out', seed = (o.id || 1) * 1.3;
  if (!ready()) { tentacle2D(g, o, v.t, al); return; }
  // an S-ripple running down it from his body to the tip (bigger as it whips out), its tip lifting into the curl
  const amp = out ? 6.5 : 3, env = u => Math.sin(Math.PI * Math.min(1, u * 1.15)) * (0.45 + 0.55 * u);
  const p = u => {
    const d = SRC_R * 0.6 + (L + SRC_R * 0.4) * u, wav = Math.sin(u * 8.5 - v.t * 22 + seed) * amp * env(u), up = Math.cos(u * 8.5 - v.t * 22 + seed) * amp * 0.35 * env(u);
    return [o.sx + c * d + nx * wav, o.sy + s * d + ny * wav, 13 * Math.pow(1 - u, 1.6) + 3 + up + (o.res === 'hit' && !out ? 4 * u : 0)];
  };
  const segs = spine(floorAt(p, u => 1.75 - 1.15 * u), gapOf, 56);
  bodyShadow(g, segs, 12, al);
  armDraw(g, segs, al);
  const q = segs[segs.length - 1];
  if (q) { g.translate(q.x, q.y); drawProp3D(g, 'oc:tip', { yaw: q.yaw, scale: Math.max(0.55, q.s) * 1.05, alpha: al }); g.translate(-q.x, -q.y); }
}
// the blame's aftermath: a drying streak of sucker prints along the tentacle's path, and the inky skid of whoever it knocked
const STREAK = 1.7, SKID = 2.2;
function streakTo(v, F, e, x1, y1) {
  const own = F.f[e.who], S = own && srcOf(F, own, e.src); if (!S) return;
  const L = v.ocSt || (v.ocSt = []); L.push({ x: S.x, y: S.y, x1, y1, t0: v.t, cl: e.src ? 0.7 : 1 }); if (L.length > 8) L.shift();
}
function skid(v, F, e) {
  const o = F.f[e.to]; if (!o) return;
  const L = v.ocSk || (v.ocSk = []); L.push({ to: e.to, t0: v.t, pts: [[o.x, o.y]] }); if (L.length > 4) L.shift();
}
function streaks(g, F, v) {
  const BD = bold();
  if (v.ocSt) {
    v.ocSt = v.ocSt.filter(p => v.t >= p.t0 && v.t - p.t0 < STREAK);
    for (const p of v.ocSt) {
      const k = (v.t - p.t0) / STREAK, al = (1 - k * k) * p.cl, dx = p.x1 - p.x, dy = p.y1 - p.y, D = Math.hypot(dx, dy); if (D < 24) continue;
      const c = dx / D, s = dy / D;
      g.lineCap = 'round'; g.strokeStyle = `rgba(30,34,48,${((BD ? 0.16 : 0.12) * al).toFixed(3)})`; g.lineWidth = 7 * (1 - 0.3 * k);
      g.beginPath(); g.moveTo(p.x + c * 20, p.y + s * 20); g.lineTo(p.x1, p.y1); g.stroke();
      for (let d = 26, m = 0; d < D - 4; d += 15, m++) {
        const off = m % 2 ? 3 : -3, x = p.x + c * d - s * off, y = p.y + s * d + c * off, r = 1.9 - 0.6 * d / D;
        g.strokeStyle = `rgba(30,32,44,${(0.35 * al).toFixed(3)})`; g.lineWidth = 1; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
      }
    }
  }
  if (v.ocSk) {
    v.ocSk = v.ocSk.filter(p => v.t >= p.t0 && v.t - p.t0 < SKID);
    for (const p of v.ocSk) {
      const o = F.f[p.to], age = v.t - p.t0;
      if (o && age < 0.45) { const l = p.pts[p.pts.length - 1]; if (Math.hypot(o.x - l[0], o.y - l[1]) > 3) p.pts.push([o.x, o.y]); }
      if (p.pts.length < 2) continue;
      const al = clamp(1 - (age - 0.6) / (SKID - 0.6), 0, 1);
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const [w, a] of [[9, 0.1], [3.5, 0.28]]) {
        g.strokeStyle = `rgba(26,29,42,${(a * al * (BD ? 1.2 : 1)).toFixed(3)})`; g.lineWidth = w;
        g.beginPath(); p.pts.forEach(([x, y], k) => k ? g.lineTo(x, y + 4) : g.moveTo(x, y + 4)); g.stroke();
      }
    }
  }
}

// ---------------------------------------------------------------- Fork
// where the clone will pop up: a glossy ink puddle spreading, bubbles rising through it and popping
function spot3(g, v, o) {
  const u = clamp(o.t / 0.35, 0, 1), r = (o.r || 18) * (0.35 + 0.65 * ease(u));
  decal3(g, 'oc:pool', o.x, o.y, r, { alpha: clamp(o.t / 0.08, 0, 1) });
  for (let k = 0; k < 3; k++) {
    const q = (v.t * 2.2 + k / 3 + hsh(o.id + k)) % 1, an = hsh(k * 7 + (o.id || 0)) * TAU, d = r * 0.5 * hsh(k * 3 + 1), bx = o.x + Math.cos(an) * d, by = o.y + Math.sin(an) * d * 0.8;
    const sz = 0.9 + 1.6 * Math.sin(q * Math.PI); if (q > 0.85) continue;
    g.save(); g.translate(bx, by - sz * 0.6); drawProp3D(g, 'bit:ink', { frame: k * 4, scale: sz / 4, alpha: 0.95 }); g.restore();
  }
}
// the clone: inky, see-through Octo with a sheen, dripping; rises from the puddle, blames from its own angle, pops (event)
function clone(g, F, v, o) {
  const own = F.f[o.owner]; if (!own) return;
  const pt = o.pt || 0, ch = charOf(own.id), r3 = ready();
  let s = 1, a = 0.8, hop = 0, pose = 'stand';
  if (o.ph === 'pop') { const u = clamp(pt / 0.2, 0, 1); s = 0.5 + 0.5 * ease(u); hop = Math.sin(u * Math.PI) * 8; pose = 'air'; }
  else if (o.ph === 'poof') { const u = clamp(pt / 0.3, 0, 1); s = 1 + 0.2 * u; a *= 1 - u; }
  else if (o.ph === 'copy' && own.ms === o.cms && own.move) pose = own.pose || 'stand';
  if (o.ph !== 'poof' && o.dur - o.t < 0.6 && o.ph !== 'copy') a *= 0.55 + 0.45 * Math.abs(Math.sin(v.t * 14));   // (about to go: flickering)
  if (a <= 0.01) return;
  if (r3) decal3(g, 'oc:pool', o.x, o.y + 1, 16 * (o.ph === 'poof' ? 1 + 0.4 * clamp(pt / 0.3, 0, 1) : 1), { alpha: Math.min(1, a * 1.15) });
  else inkBlot(g, { x: o.x, y: o.y, r: 15, id: o.id }, 1, 0.55 * a);
  shadow(g, o.x, o.y, hop, 18 * s);
  const coil = o.ph === 'copy' && o.cp === 'move1' && own.ms === o.cms && own.ph === 'coil' ? { face: o.face } : null;   // (the clone coiling with him, turned its own way)
  if (coil) { g.save(); g.translate(o.x, o.y); g.globalAlpha *= 0.8; coilArm(g, coil, own, -1, v.t + 1.7); g.restore(); }
  g.save(); g.translate(o.x, o.y - hop); g.globalAlpha *= a;
  const yaw = (o.face || 0) + 0.35 * Math.sin(Math.PI / 2 - (o.face || 0));
  const sheen = (c, w, h) => { const gr = c.createLinearGradient(0, 0, w * 0.7, h * 0.8); gr.addColorStop(0.25, 'rgba(190,210,255,0.28)'); gr.addColorStop(0.5, 'rgba(190,210,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); };
  tinted(g, gg => model(gg, ch, { t: v.t + 3.1, scale: SCALE * s, smooth: true, yaw, mood: null, pose, shadow: false, fight: true }), r3 ? ['rgba(30,40,86,0.42)', sheen] : [bold() ? 'rgba(70,96,160,0.3)' : 'rgba(80,110,180,0.32)']);
  g.restore();
  if (coil) { g.save(); g.translate(o.x, o.y); g.globalAlpha *= 0.8; coilArm(g, coil, own, 1, v.t + 1.7); g.restore(); }
  // ink dripping off it now and then
  if (r3 && o.ph !== 'poof' && every(v, 'drip' + o.id, 0.22)) { const k = hsh(v.t * 7.3), side = k < 0.5 ? -1 : 1; bit3(v, 'ink', o.x + side * (8 + 6 * hsh(v.t * 3.1)), o.y + 1, 14 + 16 * hsh(v.t * 5.7), { dz: -10, life: 0.6, s: 1.3 + 0.6 * hsh(v.t), g: 500, bo: 0, sp: 0 }); }
}

// ---------------------------------------------------------------- Force Push
// his eight tentacles round his feet: flicked up as he winds, slammed flat to the reach (slamL), drawn back (slowly on a
// miss). side -1: the far ones (behind the body), 1: the near ones
const slamL = f => { const M = f && f.stats && f.stats.moves.move2, ch = (f && f.ocC) || 0; return Math.max(30, (M ? M.R + ((M.Rmax || M.R) - M.R) * ch : 76) - 19); };
function riseArms(g, f, side, t) {
  const ph = f.ph, k = f.pht || 0, SLAM_L = slamL(f);
  let up = 0, out = 0;
  const ch = f.ocC || 0;
  if (ph === 'rise') up = ease(k / Math.max(0.06, (f.dur || 0.14) * 0.85)) * (1 + 0.35 * ch);
  else if (ph === 'push') { if (k < 0.1) out = 1; else if (k < 0.34) { out = 1 - ease((k - 0.1) / 0.24); } else return; }
  else if (ph === 'gather') { if (k < 0.16) out = 1; else if (k < 0.5) { out = 1 - ease((k - 0.16) / 0.34); } else return; }
  else return;
  if (up < 0.02 && out < 0.02) return;
  if (!ready()) { riseArms2D(g, f, side, t, up, out); return; }
  for (let j = 0; j < 8; j++) {
    const a = j / 8 * TAU + 0.2, sn = Math.sin(a);
    if ((sn >= 0 ? 1 : -1) !== side) continue;
    const ca = Math.cos(a), bend = (j % 2 ? 1 : -1);
    let p;
    if (out > 0) {   // flat on the floor out from him, a little sideways bend, its tip curling up
      const L = 8 + SLAM_L * (0.92 + 0.12 * hsh(j + (f.ms || 0))) * out;
      p = u => { const r = 13 + L * u, w = (bend * 0.14 * Math.sin(u * Math.PI) + 0.1 * Math.sin(u * 9 - k * 26 + j * 1.7) * u) * out, b = a + w * Math.min(1, 26 / r), fl = 1 + (1 / SE - 1) * Math.min(1, u * 1.6); return [Math.cos(b) * r, Math.sin(b) * r * fl, 7 * (1 - u) + 2 + 3 * Math.max(0, u - 0.85) / 0.15 * out]; };   // (flat on the floor out to the reach in the floor's own measure (fl: the floor isn't foreshortened, the body round him is), so the tips land on the world circle the slam hits; a ripple running out along each)
    } else {   // rising, leaning out, curling over at the top, swaying
      const h = 34 * up, sw = Math.sin(t * (5 + 20 * ch) + j) * (2.5 + 2 * ch) * up, lean = 15 + 6 * up + 6 * ch;
      p = u => { const w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u, r = 13 * w0 + (lean + 10) * w1 + (lean + 4 - 9 * up * Math.max(0, u - 0.7) / 0.3) * w2, z = 7 * w0 + (7 + h * 0.75) * w1 + (7 + h) * w2;
        const rip = sw * u + Math.sin(u * 7 - t * 9 + j * 1.3) * 3 * up * Math.sin(Math.PI * u);   // (swaying, an S-ripple running up it)
        return [Math.cos(a) * r - sn * rip, Math.sin(a) * r + ca * rip, z]; };
    }
    const segs = spine(bodyAt(p, u => 1.05 - 0.72 * u), gapOf, 24);
    armDraw(g, segs);
    const q = segs[segs.length - 1];   // its curled tip
    if (q) { g.translate(q.x, q.y); drawProp3D(g, 'oc:tip', { yaw: q.yaw, scale: Math.max(0.45, q.s) * 0.8 }); g.translate(-q.x, -q.y); }
  }
}
// the slam's ripple: a lit ring running out through the floor, a fainter one behind
function ripple(g, o) {
  const k = clamp(o.t / o.life, 0, 1), a = (1 - k) * (1 - k);
  if (a <= 0.01) return;
  for (const [q, al] of [[1, 1], [0.66, 0.5]]) {
    const r = Math.max(6, o.r * q * (0.85 + 0.15 * k)), w = 3 + 4 * (1 - k);
    g.lineWidth = w; g.strokeStyle = `rgba(70,62,58,${(0.22 * a * al).toFixed(3)})`; g.beginPath(); g.arc(o.x + 0.8, o.y + 1.6, r + w * 0.4, 0, TAU); g.stroke();
    g.lineWidth = w * 0.6; g.strokeStyle = `rgba(255,252,244,${(0.45 * a * al).toFixed(3)})`; g.beginPath(); g.arc(o.x - 0.4, o.y - 0.8, r - w * 0.3, 0, TAU); g.stroke();
  }
}

// ---------------------------------------------------------------- Ink Jet
// the puddle: glossy ink spreading as it lands, splats beside it, a sliding glint, fading in its last second
function puddle3(g, o, t) {
  const age = o.t || 0, left = (o.life || 3.5) - age, a = clamp(age / 0.1, 0, 1) * clamp(left / 0.9, 0, 1); if (a <= 0.01) return;
  const r = (o.r || 32) * (0.55 + 0.45 * ease(age / 0.2)), seed = (o.id || 1) * 2.7;
  g.save(); g.globalAlpha *= 0.94;
  decal3(g, 'oc:pool', o.x, o.y, r, { alpha: a });
  g.restore();
  const q = (t * 0.35 + hsh(seed)) % 2.2; if (q < 1) { const x = o.x + r * (q - 0.5) * 0.9, y = o.y - r * 0.18 + r * (q - 0.5) * 0.25; g.fillStyle = `rgba(235,242,255,${(0.5 * a * Math.sin(q * Math.PI)).toFixed(3)})`; g.beginPath(); g.ellipse(x, y, 3.2, 1.1, -0.3, 0, TAU); g.fill(); }
}

// ---------------------------------------------------------------- the tells on the floor
// the Fork's branch: an ink line from Octo's feet to the clone's spot (u how far), bowing like a commit-graph branch,
// drops (commits) popping up along it; a its strength (the tell 1, then faint, brighter while it blames, its drops then
// running away from him: the way the clone's hit knocks you)
// ---------------------------------------------------------------- Fork's glob of ink
// the spot spawns at the press and the clone pops up at the startup's end (sim clock). The breath takes GLOB_AT of it,
// the glob splats on the spot at T1, and the blot and branch spread from there
const GLOB_AT = 0.4;
const angD = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const spotOf = (F, f) => { let r = null; for (const b of F.objs || []) if (b.kind === 'ocSpot' && b.owner === f.i && (!r || b.id > r.id)) r = b; return r; };
function globClock(F, o) {
  const f = F.f[o.owner], up = forkUp(F, o), D = f ? Math.hypot(o.x - f.x, o.y - f.y) : 100;
  const T0 = up * GLOB_AT; return { T0, T1: Math.min(up - 0.06, T0 + 0.08 + 0.06 * clamp(D / 200, 0, 1)), D };
}
const MOUTH_O = [11, 0, 24];   // (his mouth: model units, x forward, z up)
function onOcto(f, A, p) {
  const yaw = M3.camYaw(ID, f.face + 0.35 * Math.sin(Math.PI / 2 - f.face) + (A ? A.spin : 0)), c = Math.cos(yaw), s = Math.sin(yaw), S = SCALE * (A ? A.s : 1);
  const gx = (c * p[0] + s * p[1]) * S, gy = (s * p[0] - c * p[1]) * S * SE, z = p[2] * S * Math.cos(M3.ELEV) * (A ? A.sy : 1), fw = A ? A.fwd : 0;
  return [f.x + gx + Math.cos(f.face) * fw + (A ? A.wx : 0), f.y + gy + Math.sin(f.face) * fw, z + (A ? A.hop : 0) + (f.z || 0)];
}
// an inky glob: a dark round drop with a sky sheen, a soft shadow under it
function inkGlob(g, x, y, z, r, sx = 1) {
  g.fillStyle = `rgba(14,16,26,${(0.2 / (1 + z / 40)).toFixed(3)})`; g.beginPath(); g.ellipse(x + 1, y + 1, r * 1.1, r * 0.45, 0, 0, TAU); g.fill();
  g.save(); g.translate(x, y - z); g.scale(sx, 1 / sx);
  g.fillStyle = bold() ? BK_INK : '#262a38'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.fillStyle = 'rgba(190,206,245,0.7)'; g.beginPath(); g.arc(-r * 0.35, -r * 0.4, r * 0.3, 0, TAU); g.fill();
  g.restore();
}
const BK_INK = '#2b2f3f';
const SPAT = new WeakMap();
function glob(F, v, g, o, out) {
  const f = F.f[o.owner]; if (!f) return;
  const T = globClock(F, o);
  if (o.t >= T.T1) {   // splat: once
    let S = SPAT.get(v); if (!S) SPAT.set(v, S = new Set());
    if (!S.has(o.id)) { S.add(o.id); if (S.size > 100) S.clear(); if (ready()) { inkDrops(v, o.x, o.y, 2, 6, { speed: [40, 90], up: [40, 90] }); splat(v, o.x, o.y, 9); } }
    return;
  }
  if (o.t < T.T0 || f.ph !== 'fork') return;   // (still in his mouth)
  const A = ART_O.anim(F, v, f), P = onOcto(f, A, MOUTH_O), p = (o.t - T.T0) / (T.T1 - T.T0), H = 12 + T.D * 0.12;
  const x = P[0] + (o.x - P[0]) * p, y = P[1] + (o.y - P[1]) * p, z = P[2] * (1 - p) + H * 4 * p * (1 - p);
  out.push({ y: y + 1, d: () => { for (let j = 1; j <= 2; j++) { const q = Math.max(0, p - j * 0.12); inkGlob(g, P[0] + (o.x - P[0]) * q, P[1] + (o.y - P[1]) * q, P[2] * (1 - q) + H * 4 * q * (1 - q), 2.6 - j * 0.7); } inkGlob(g, x, y, z, 4.2, 1.15); } });
}
const forkUp = (F, o) => { const f = F.f[o.owner]; return (f && f.stats && f.stats.moves.move3.startup) || 0.35; };
const blaming = (o, own) => o.ph === 'copy' && o.cp === 'move1' && own.ms === o.cms && (own.ph === 'coil' || own.ph === 'shoot');
function cloneLink(F, o) {
  const own = F.f[o.owner]; if (!own) return 0;
  if (o.ph === 'poof') return 0.3 * (1 - clamp((o.pt || 0) / 0.25, 0, 1));
  if (o.ph === 'pop') return 0.6 - 0.3 * clamp((o.pt || 0) / 0.2, 0, 1);
  return 0.3 + 0.45 * (blaming(o, own) ? 1 : 0);
}
function branch(g, F, v, o, u, a) {
  const f = F.f[o.owner]; if (!f || a <= 0.01 || u <= 0.01) return;
  const x0 = f.x, y0 = f.y, x1 = o.x, y1 = o.y, dx = x1 - x0, dy = y1 - y0, D = Math.hypot(dx, dy); if (D < 30) return;
  const nx = -dy / D, ny = dx / D, bow = D * 0.18 * (hsh((o.id || 1) * 0.37) < 0.5 ? 1 : -1), cx = x0 + dx * 0.5 + nx * bow, cy = y0 + dy * 0.5 + ny * bow;
  const at = q => { const w = 1 - q; return [w * w * x0 + 2 * w * q * cx + q * q * x1, w * w * y0 + 2 * w * q * cy + q * q * y1]; };
  const qe = 1 - clamp(14 / D, 0, 0.3), q0 = clamp(20 / D, 0, 0.4), q1 = q0 + (qe - q0) * u, BD = bold();
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  const path = (ox, oy) => { g.beginPath(); for (let k = 0; k <= 24; k++) { const [x, y] = at(q0 + (q1 - q0) * k / 24); k ? g.lineTo(x + ox, y + oy) : g.moveTo(x + ox, y + oy); } };
  g.strokeStyle = `rgba(14,16,26,${(0.16 * a).toFixed(3)})`; g.lineWidth = 6; path(0.6, 1.4); g.stroke();   // (soft shade under it)
  g.strokeStyle = `rgba(30,34,48,${((BD ? 0.85 : 0.75) * a).toFixed(3)})`; g.lineWidth = 3.4; path(0, 0); g.stroke();
  g.strokeStyle = `rgba(150,170,220,${(0.45 * a).toFixed(3)})`; g.lineWidth = 1; path(-0.5, -0.9); g.stroke();   // (the sky's sheen along it)
  const n = Math.max(2, Math.round(D / 34)), out = o.kind === 'ocClone' && blaming(o, f), flow = out ? (v.t * 1.6) % 1 : 0;
  for (let k = 0; k <= n; k++) {
    const q = q0 + (qe - q0) * (k + 0.5 + flow) / (n + 1);   // (blaming: the drops run out, away from him)
    if (q > q1 || q < q0) continue;
    const pop = backE(clamp((q1 - q) * D / 14, 0, 1)), [x, y] = at(q), r = 4 * pop;
    if (r < 0.3) continue;
    g.fillStyle = `rgba(14,16,26,${(0.22 * a).toFixed(3)})`; circle(g, x + 0.7, y + 1.4, r); g.fill();
    g.fillStyle = `rgba(36,40,56,${Math.min(1, a * 1.15).toFixed(3)})`; circle(g, x, y, r); g.fill();
    g.fillStyle = `rgba(210,222,255,${(0.7 * a).toFixed(3)})`; circle(g, x - r * 0.35, y - r * 0.38, r * 0.3); g.fill();
  }
  g.restore();
}
// the Force Push's tell: each tentacle tip's shadow where it'll slap down (the same reach R it hits at, growing as he
// gathers), darkening as they rise; a tremble when gathering
function tipShadows(g, F, v, o) {
  const f = F.f[o.owner]; if (!f || f.ph !== 'rise') return;
  const u = clamp(o.u || 0, 0, 1), ch = f.ocC || 0, R = o.R || 86, A = (0.06 + 0.2 * ease(u)) * (1 + 0.35 * ch);
  for (let j = 0; j < 8; j++) {
    const a = j / 8 * TAU + 0.2, d = 21 + (R - 19) * (0.92 + 0.12 * hsh(j + (f.ms || 0))) + Math.sin(v.t * 30 + j * 2) * 1.2 * ch;
    const x = o.x + Math.cos(a) * d, y = o.y + Math.sin(a) * d;
    g.save(); g.translate(x, y); g.rotate(a);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 13); gr.addColorStop(0, `rgba(20,22,36,${A.toFixed(3)})`); gr.addColorStop(0.6, `rgba(20,22,36,${(A * 0.6).toFixed(3)})`); gr.addColorStop(1, 'rgba(20,22,36,0)');
    g.fillStyle = gr; g.scale(1.15, 0.8); circle(g, 0, 0, 13); g.fill();
    g.restore();
  }
}
// sucker prints where a slammed tip lay: pairs of damp rings shrinking toward the tip, drying over a couple of seconds
const PRINT_LIFE = 1.8;
function print(v, x, y, a) { const L = v.ocPr || (v.ocPr = []); L.push({ x, y, a, t0: v.t }); if (L.length > 32) L.splice(0, L.length - 32); }
function prints(g, v) {
  const L = v.ocPr; if (!L || !L.length) return;
  v.ocPr = L.filter(p => v.t >= p.t0 && v.t - p.t0 < PRINT_LIFE);
  for (const p of v.ocPr) {
    const k = (v.t - p.t0) / PRINT_LIFE, al = clamp((v.t - p.t0) / 0.08, 0, 1) * (1 - k * k), c = Math.cos(p.a), s = Math.sin(p.a);
    for (let m = 0; m < 3; m++) for (const sd of [-1, 1]) {
      const back = 6 + m * 8, side = sd * (2.6 + m * 0.6), x = p.x - c * back - s * side, y = p.y - s * back + c * side, r = 1.7 + m * 0.5;
      g.strokeStyle = `rgba(30,32,44,${(0.42 * al).toFixed(3)})`; g.lineWidth = 1.1; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
      g.fillStyle = `rgba(30,32,44,${(0.16 * al).toFixed(3)})`; circle(g, x, y, r * 0.55); g.fill();
    }
  }
}
// the Ink Jet's cloud: wisps of ink smoke curling up and over where he was, drawn out in streaks the way it was squirted,
// thinning and fading; a soft shadow on the floor. Each wisp a tapering ribbon along a curling path, a cool sheen on its
// lit edge
const CLOUD = 1;
function ribbon(g, pts, w0, fill, sheen) {
  const n = pts.length; if (n < 2) return;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, q = i / (n - 1), w = w0 * Math.sin(Math.PI * Math.min(1, 0.15 + q * 0.95)) * (1 - 0.55 * q);
    L.push([pts[i][0] - dy / d * w, pts[i][1] + dx / d * w]); R.push([pts[i][0] + dy / d * w, pts[i][1] - dx / d * w]);
  }
  g.beginPath(); g.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) g.lineTo(L[i][0], L[i][1]);
  for (let i = n - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
  g.closePath(); g.fillStyle = fill; g.fill();
  if (sheen) { g.beginPath(); for (let i = 1; i < n - 2; i++) i === 1 ? g.moveTo(R[i][0], R[i][1]) : g.lineTo(R[i][0], R[i][1]); g.strokeStyle = sheen; g.lineWidth = 1.2; g.stroke(); }
}
function inkCloud(g, F, v, o) {
  const k = o.t || 0, f = F.f[o.owner], away = f ? Math.atan2(o.y - f.y, o.x - f.x) : 0, seed = (o.id || 1) * 1.7, BD = bold();
  const gone = clamp((k - 0.3) / (CLOUD - 0.3), 0, 1), al = clamp(k / 0.05, 0, 1) * (1 - gone);
  if (al <= 0.01) return;
  const gr = ease(k / 0.35), ca = Math.cos(away), sa = Math.sin(away);
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  softDisc(g, o.x, o.y + 2, 24 * (0.6 + 0.6 * gr), [[0, '14,16,26', 0.18 * al], [1, '14,16,26', 0]]);
  // streaks: thin dark trails shot out the way it squirted, low over the floor
  for (let j = 0; j < 4; j++) {
    const off = (hsh(seed + j * 5) - 0.5) * 18, len = (26 + 22 * hsh(seed + j)) * gr * (1 + 0.3 * gone), z = 6 + 6 * hsh(seed + j * 2), pts = [];
    for (let i = 0; i <= 8; i++) { const q = i / 8, d = -6 + len * q, wob = Math.sin(q * 5 + j + k * 6) * 2.5 * q; pts.push([o.x + ca * d - sa * (off + wob), o.y + (sa * d + ca * (off + wob)) * 0.5 - z - 4 * q]); }
    ribbon(g, pts, 2.6 + 1.2 * hsh(seed + j * 9), `rgba(22,24,36,${(0.55 * al * (1 - 0.5 * gone)).toFixed(3)})`, null);
  }
  // wisps: each rising and curling round, unwinding and drifting back as it thins
  const W = [];
  for (let j = 0; j < 7; j++) {
    const b = away + (hsh(seed + j) - 0.5) * 2.4, sp = (6 + 16 * hsh(seed + j * 3)) * gr, rise = 10 + 12 * gr + 18 * k + (j % 3) * 5;
    const cx = o.x + Math.cos(b) * sp, cy = o.y + Math.sin(b) * sp * 0.5 - rise, R = (7 + 6 * hsh(seed + j * 5)) * (0.4 + 0.8 * gr) * (1 + 0.35 * gone), dir = j % 2 ? 1 : -1, a0 = hsh(seed + j * 7) * TAU + dir * k * 4;
    const turns = 1.6 - 0.6 * gone, pts = [];
    for (let i = 0; i <= 16; i++) { const q = i / 16, a = a0 + dir * q * turns * Math.PI, r = R * (1 - 0.7 * q); pts.push([cx + Math.cos(a) * r + ca * q * 6 * gone, cy + Math.sin(a) * r * 0.8 - q * 4]); }
    W.push([cy, pts, 3.2 + 3 * hsh(seed + j * 11) * (0.5 + 0.5 * gr)]);
  }
  W.sort((p, q) => q[0] - p[0]);   // (the lower ones first)
  const sheen = `rgba(${BD ? '120,132,180' : '110,122,168'},${(0.55 * al).toFixed(3)})`;
  for (const [, pts, w] of W) {
    ribbon(g, pts, w * 1.7, `rgba(30,33,50,${(0.32 * al).toFixed(3)})`, null);   // (a soft halo of thinner smoke round it)
    ribbon(g, pts, w, `rgba(18,20,32,${(0.82 * al).toFixed(3)})`, sheen);
  }
  g.restore();
}
// ---------------------------------------------------------------- 2D stand-ins (no WebGL, or before the bake)
function inkBlot(g, o, u, a) {
  const r = (o.r || 18) * (0.3 + 0.7 * ease(u)), seed = (o.id || 1) * 1.9;
  if (a <= 0.01) return;
  const edge = an => 1 + 0.12 * Math.sin(3 * an + seed) + 0.07 * Math.sin(5 * an + seed * 1.3);
  g.save(); g.globalAlpha *= a;
  softDisc(g, o.x, o.y, r * 1.35, [[0, '30,34,46', 0.18], [1, '30,34,46', 0]]);
  g.beginPath(); for (let i = 0; i <= 28; i++) { const an = i / 28 * TAU, d = r * edge(an); g.lineTo(o.x + Math.cos(an) * d, o.y + Math.sin(an) * d * 0.9); } g.closePath();
  g.fillStyle = bold() ? 'rgba(38,42,56,0.55)' : 'rgba(30,34,48,0.5)'; g.fill();
  g.restore();
}
function inkPuddle(g, o, t) {
  const age = o.t || 0, left = (o.life || 3.5) - age, a = clamp(age / 0.15, 0, 1) * clamp(left / 0.9, 0, 1); if (a <= 0.01) return;
  const r = (o.r || 32) * (age < 0.15 ? 0.6 + 0.4 * age / 0.15 : 1), seed = (o.id || 1) * 2.7;
  const edge = an => 1 + 0.07 * Math.sin(3 * an + seed) + 0.04 * Math.sin(5 * an + seed * 1.6);
  const path = q => { g.beginPath(); for (let i = 0; i <= 36; i++) { const an = i / 36 * TAU, d = r * q * edge(an); g.lineTo(o.x + Math.cos(an) * d, o.y + Math.sin(an) * d * 0.92); } g.closePath(); };
  g.save(); g.globalAlpha *= a;
  g.fillStyle = bold() ? 'rgba(30,32,58,0.42)' : 'rgba(24,26,52,0.4)'; path(1); g.fill();
  g.fillStyle = 'rgba(18,18,40,0.22)'; path(0.72); g.fill();
  g.fillStyle = 'rgba(236,242,255,0.45)'; g.beginPath(); g.ellipse(o.x - r * 0.34, o.y - r * 0.32, r * 0.26, r * 0.08, -0.35, 0, TAU); g.fill();
  g.restore();
}
function riseArms2D(g, f, side, t, up, out) {
  const n = 8; g.save(); g.lineCap = 'round'; g.strokeStyle = bold() ? INK : '#2b3038';
  for (let j = 0; j < n; j++) {
    const a = j / n * TAU + 0.2, sn = Math.sin(a); if ((sn >= 0 ? 1 : -1) !== side) continue;
    const P0 = [Math.cos(a) * 18, sn * 12 - 2], P1 = out > 0 ? [Math.cos(a) * (18 + 10 + 16 * out), sn * (12 + 10 + 16 * out) - 1] : [Math.cos(a) * (27 + 3 * up), sn * 17 - 4 - 26 * up];
    g.lineWidth = 5; g.beginPath(); g.moveTo(P0[0], P0[1]); g.lineTo(P1[0], P1[1]); g.stroke();
  }
  g.restore();
}
// the shot tentacle in 2D: a tapered wavy arm with suckers, tip curling, falling from body height to the floor
function tentacle2D(g, o, t, al) {
  const L = o.len, a = o.a, c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c, n = 14, seed = (o.id || 1) * 1.3, h0 = 16, h1 = 4, BD = bold();
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const u = k / n, wav = Math.sin(u * 5 + (o.t || 0) * 16 + seed) * 3.5 * Math.sin(u * Math.PI), d = 12 + (L + 2) * u;
    pts.push([o.sx + c * d + nx * wav, o.sy + s * d + ny * wav - lerp(h0, h1, u)]);
  }
  const W = k => 5.6 * (1 - k / n * 0.7);
  const side = sgn => pts.map(([x, y], k) => [x + nx * W(k) * sgn, y + ny * W(k) * sgn * 0.7]);
  const A = side(1), B = side(-1).reverse();
  const body = () => { g.beginPath(); A.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); const [tx, ty] = pts[n]; g.quadraticCurveTo(tx + c * 4, ty + s * 4 - 2, B[0][0], B[0][1]); B.forEach(([x, y]) => g.lineTo(x, y)); g.closePath(); };
  g.save(); g.globalAlpha *= al;
  softFill(g, () => { g.save(); g.translate(3, 10); body(); g.restore(); }, 0.18, 3);   // its shadow on the floor
  if (BD) g.fillStyle = INK;
  else { const gr = g.createLinearGradient(pts[0][0] + nx * 6, pts[0][1] + ny * 6, pts[0][0] - nx * 6, pts[0][1] - ny * 6); gr.addColorStop(0, '#4a4f5a'); gr.addColorStop(0.5, '#2d3139'); gr.addColorStop(1, '#16191f'); g.fillStyle = gr; }
  body(); g.fill();
  for (let k = 2; k < n - 1; k += 2) { const [x, y] = pts[k], r = W(k) * 0.42; g.fillStyle = '#f2d2c2'; g.beginPath(); g.ellipse(x - nx * W(k) * 0.45, y - ny * W(k) * 0.3 + 1, r, r * 0.7, a, 0, TAU); g.fill(); }
  const [tx, ty] = pts[n];   // the curl at its tip
  g.strokeStyle = BD ? INK : '#22262e'; g.lineWidth = 2.6; g.beginPath(); g.arc(tx + c * 2 - nx * 2.5, ty + s * 2 - ny * 2.5 - 1, 3, a - 0.5, a + Math.PI * 1.2); g.stroke();
  g.restore();
}
export default ART_O;
