// Octo's moves drawn (the sim: js/kits/octo.js). Cosmetic only. Real 3D since 2026-10-24 (the user: "the 3d models look
// so good, but the animations and effects just look like simple 2d graphics"): his tentacles are chains of baked 3D
// segments (art/chain3d.js), dark like his model, two rows of pale suckers along their undersides, each segment's own
// ink line kept (a segmented tentacle), a curled tip; the ink is glossy 3D (puddles, splats and droplets: art/prop3d.js).
//   Pull Request  a tentacle coils back (a faint damp track of sucker prints runs out along the line), shoots out low
//                 over the floor waving, its tip curled; catching them it loops round their middle and reels them in
//                 to a slam (dust kicked up); missing, it slides back and he eases his arm down (a delay, not a stun)
//   Fork          a glossy ink puddle spreads where the clone will be, bubbling; the clone rises out of it in a burst of
//                 ink: Octo again, inky and see-through, a sheen on it, ink dripping off it; popped, it bursts into ink
//   Force Push    eight tentacles rise round him, curling over (their shadows reach out over the floor), and slam down
//                 flat: ink splats where their tips hit, dust rolling out, a ripple running through the floor
//   Ink Jet       a squirt of ink as he jets back, droplets flung and trailing, a glossy ink puddle left where he was
// Classic Flat first; with no WebGL (or before the bake) the old 2D shapes stand in. Calm: a gentle shake on the slam.
import { CHARACTERS, TAU, clamp, frnd, lerp } from '../core.js';
import { bold } from '../look.js';
import { sd } from '../fight-arenas.js';
import { SCALE, model, puff, shadow, tinted } from '../draw-fight.js';
import { animBase, settleAnim } from './kits.js';
import * as M3 from './model3d.js';
import { bit3, bits3, decal3, defBit, defProp, drawProp3D, propsFor } from './prop3d.js';
import { CE, SE, SHARED_BITS, bodyAt, bodyShadow, drawSegs, floorAt, segReady, segTube, spine } from './chain3d.js';

const ID = 'octo';
const INK = '#2f353e';
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
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
// a tentacle's segment: a short smooth dark tube along x (radius SEG_R; 'oc:segN' without its ink line, hiding the joins:
// one smooth tapering arm), and its sucker: a pale round cup on its +y side, a little below the middle (drawn over the
// arm on whichever side faces you, every other segment: a row of them along its underside)
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
// glossy ink on the floor (decals: seen from above, they keep the floor's metric). Ink is near black, so its top's
// shading normal leans away from the light (a flat-lit face would lift it to grey); the rim, a little raised lip, keeps
// its own and catches the light like a meniscus; the sky shows in it as a cool sheen and a couple of white streaks.
// 'oc:pool' radius 40 (the Ink Jet's puddle, the Fork's pool), 'oc:splat' radius 8 with drops flung round it
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
function armDraw(g, segs, a = 1) {
  drawSegs(g, segs, 'oc:seg', 'oc:segN', a);
  for (let k = 2; k < segs.length - 1; k += 2) {
    const q = segs[k], yaw = Math.cos(q.yaw) < 0 ? q.yaw : q.yaw + Math.PI;
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
// whoever a tentacle of his is reeling in: that arm
const reeledBy = (F, f) => f.state === 'grabbed' ? (F.objs || []).find(o => o.kind === 'ocArm' && o.ph === 'reel' && F.f[o.owner] && F.f[o.owner].id === ID && f.hold === o.owner) || null : null;

export default {
  id: ID,
  anim(F, v, f) {
    const A = animBase(), k = f.pht || 0, t = v.t + f.i, sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
    switch (f.ph) {
      case 'coil': sq(0.05 * ease(k / 0.15)); A.fwd = -3; A.wx = Math.sin(k * 24) * 0.8; break;
      case 'shoot': sq(-0.06); A.fwd = 3 * ease(k / 0.08); break;
      case 'reel': A.lean = -0.06; A.fwd = -2; A.wx = Math.sin(t * 30) * 0.6; break;
      case 'slam': sq(0.16 * Math.exp(-k * 11)); A.fwd = 4 * ease(k / 0.06); break;
      case 'droop': Object.assign(A, settleAnim(k, f.stats.moves.move1.miss, 'droop', 0.22)); break;   // (missed: the arm eases back down and he settles: a delay, not a stun)
      case 'fork': A.wx = Math.sin(k * 44) * 1.6; sq(0.05 * Math.sin(k * 22)); break;   // wobbling, about to split
      case 'forked': sq(0.08 * Math.exp(-k * 10)); A.mood = 'happy'; break;
      case 'rise': sq(-0.08 * ease(k / 0.3)); A.hop = 2 * ease(k / 0.3); break;   // up on all his tentacles
      case 'push': sq(0.2 * Math.exp(-k * 10)); break;
      case 'jet': sq(-0.1); A.hop = 5 * Math.sin(clamp(k / 0.2, 0, 1) * Math.PI); A.lean = -0.08; break;
      case 'land': sq(0.1 * Math.exp(-k * 10)); break;
      default: return null;
    }
    return A;
  },
  ground(g, F, v, o) {
    switch (o.kind) {
      case 'ocLine': dampTrack(g, F, o, v.t); break;
      case 'ocSpot': if (ready()) spot3(g, v, o); else inkBlot(g, o, clamp(o.t / 0.35, 0, 1), 1); break;
      case 'ocRing': g.save(); clipArena(g, F); reachShadows(g, F, o, v.t); g.restore(); break;
      case 'ocWave': g.save(); clipArena(g, F); ripple(g, o); g.restore(); break;
      case 'ocInk': if (ready()) puddle3(g, o, v.t); else inkPuddle(g, o, v.t); break;
    }
  },
  // standing among the fighters: the tentacle, and the clone
  things(F, v, g, o, out) {
    if (o.kind === 'ocArm' && o.len > 2) out.push({ y: o.sy + 0.5, d: () => ready() ? arm3(g, o, F, v) : tentacle(g, o, F, v.t) });
    else if (o.kind === 'ocClone' && o.t < o.life) out.push({ y: o.y, d: () => clone(g, F, v, o) });
  },
  // the tentacles rising round him (the far ones before his model, the near ones after); the far side of the loop round
  // whoever he's reeling in; ink trailing off him as he jets
  behind(g, F, v, f) {
    if (f.id === ID) {
      g.save(); g.translate(f.x, f.y); riseArms(g, f, -1, v.t); g.restore();
      if (f.ph === 'jet' && ready() && every(v, 'jet' + f.i, 1 / 30)) { const sp = Math.hypot(f.vx, f.vy) || 1; inkDrops(v, f.x - f.vx / sp * 8, f.y - f.vy / sp * 8, 12, 1, { dir: Math.atan2(-f.vy, -f.vx), spread: 0.8, speed: [20, 60], up: [30, 80], s: [1.2, 2] }); }
    }
    const arm = reeledBy(F, f);
    if (arm && ready()) { g.save(); g.translate(f.x, f.y - (f.z || 0)); loop(g, f, arm, F, v.t, -1); g.restore(); }
    return null;
  },
  over(g, F, v, f) {
    if (f.id === ID) riseArms(g, f, 1, v.t);
    const arm = reeledBy(F, f);
    if (arm && ready()) loop(g, f, arm, F, v.t, 1);
  },
  event(v, F, e, few) {
    const r3 = ready();
    switch (e.kind) {
      case 'ocCoil': case 'ocRise': case 'ocShoot': return true;
      case 'ocCatch': if (r3) inkDrops(v, e.x, e.y, 18, few ? 2 : 4, { speed: [30, 80] }); else v.fx.push({ k: 'splash', x: e.x, y: e.y - 18, t: 0, life: 0.3, s: 10, ink: 1 }); return true;
      case 'ocSlamArm': if (r3) { dust(v, e.x, e.y, few ? 3 : 6, { speed: [40, 90], r: 8 }); inkDrops(v, e.x, e.y, 6, few ? 1 : 3); } else { v.fx.push({ k: 'dring', x: e.x, y: e.y, t: 0, life: 0.4, s: 28, id: 5 }); puff(v, e.x, e.y, few ? 2 : 3, null); } return true;
      case 'ocDroop': if (r3) dust(v, e.x + frnd(-6, 6), e.y + frnd(-2, 4), few ? 1 : 2, { speed: [10, 30] }); else puff(v, e.x, e.y, 2, null); return true;
      case 'ocFork': if (r3) { inkDrops(v, e.x, e.y, 4, few ? 4 : 8, { speed: [30, 90], up: [120, 220] }); if (e.x0 != null) inkDrops(v, e.x0, e.y0, 20, few ? 1 : 3, { speed: [20, 50] }); }
        else { v.fx.push({ k: 'splash', x: e.x, y: e.y - 6, t: 0, life: 0.4, s: 16, ink: 1 }); if (e.x0 != null) v.fx.push({ k: 'splash', x: e.x0, y: e.y0 - 20, t: 0, life: 0.3, s: 10, ink: 1 }); }
        return true;
      case 'ocPop': if (r3) { inkDrops(v, e.x, e.y, 22, few ? 4 : (e.how === 'hit' ? 10 : 7), { speed: [40, 120], up: [80, 180], s: [1.4, 2.8] }); splat(v, e.x, e.y + 2, 9); }
        else { v.fx.push({ k: 'splash', x: e.x, y: e.y - 20, t: 0, life: 0.4, s: e.how === 'hit' ? 18 : 12, ink: 1 }); puff(v, e.x, e.y - 10, few ? 2 : 4, '#c9ccd6'); }
        return true;
      case 'ocSlam': {   // the tentacles hit the floor: ink splats at their tips, dust rolling out, a gentle shake
        if (r3) {
          const src = F.f[e.who], f = src;
          for (let j = 0; j < 8; j++) {
            const a = j / 8 * TAU + 0.2, L = SLAM_L * (0.92 + 0.12 * hsh(j + (f ? f.ms || 0 : 0))), x = e.x + Math.cos(a) * (13 + L), y = e.y + Math.sin(a) * (13 + L) * SE;
            if (!few || j % 2 === 0) splat(v, x, y, 5 + 3 * hsh(j * 3 + 1));
            if (j % 2 === 0) inkDrops(v, x, y, 3, few ? 1 : 2, { speed: [30, 70], up: [60, 120], s: [1.2, 2] });
          }
          for (let k = 0; k < (few ? 4 : 7); k++) { const a = k / (few ? 4 : 7) * TAU + frnd(-0.2, 0.2); dust(v, e.x + Math.cos(a) * 34, e.y + Math.sin(a) * 22, 1, { dir: a, spread: 0.3, speed: [50, 90] }); }
        } else {
          v.fx.push({ k: 'dring', x: e.x, y: e.y, t: 0, life: 0.5, s: 44, id: 6 });
          for (let k = 0; k < (few ? 4 : 8); k++) { const a = k / (few ? 4 : 8) * TAU + frnd(-0.2, 0.2); puff(v, e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 18, 1, null); }
        }
        v.shake = Math.max(v.shake, 0.2); return true;
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
      case 'ocPull':   // a tentacle reaching out, its tip curled round
        g.lineWidth = r * 0.22; g.beginPath(); g.moveTo(-r * 0.8, r * 0.45); g.quadraticCurveTo(-r * 0.1, r * 0.55, r * 0.35, -r * 0.05); g.stroke();
        g.lineWidth = r * 0.14; g.beginPath(); g.arc(r * 0.45, -r * 0.3, r * 0.26, Math.PI * 0.6, Math.PI * 2.1); g.stroke();
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
  sound(e) {
    switch (e.kind) {
      case 'ocShoot': return [['fWhip', 0.55]];
      case 'ocCatch': return [['fGrab', 0.7]];
      case 'ocSlamArm': return [['fSplash', 0.4]];
      case 'ocDroop': return [['fWhiff', 0.4]];
      case 'ocFork': return [['fFork', 0.55]];
      case 'ocPop': return [['fPop', 0.5]];
      case 'ocRise': return [['ocRise', 0.5]];
      case 'ocSlam': return [['fThud', 0.45]];
      case 'ocInkJet': return [['fSplash', 0.6]];
    }
    return null;
  },
  sounds: {
    ocRise: ({ osc, hiss }) => (v, t) => { osc(t, 140, 0.45, 'triangle', 0.08 * v, 120); hiss(t, 0.4, 0.04 * v, 'bandpass', 400, 900); },   // a low wet swell
  },
};

// ---------------------------------------------------------------- Pull Request
// the tentacle: out from its source's body along its angle, low over the floor, a wave running down it, tapering, its
// tip curled up (reeling: running into the loop round them instead); its soft shadow under it
function arm3(g, o, F, v) {
  const a = o.a, c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c, seed = (o.id || 1) * 1.3, reel = o.ph === 'reel';
  const foe = reel ? F.f.find(f => f.state === 'grabbed' && f.hold === o.owner) : null;
  const L = reel && foe ? Math.max(4, Math.hypot(foe.x - o.sx, foe.y - o.sy) - foe.r - 4 - 12) : o.len + 2;
  const zEnd = reel ? 17 * CE : 9;
  const p = u => { const wav = Math.sin(u * 5 + (o.t || 0) * 16 + seed) * (reel ? 1.5 : 3.5) * Math.sin(u * Math.PI), d = 12 + L * u; return [o.sx + c * d + nx * wav, o.sy + s * d + ny * wav, lerp(19, zEnd, u) + (reel ? 0 : 3 * Math.sin(u * Math.PI))]; };
  const segs = spine(floorAt(p, u => 1 - (reel ? 0.4 : 0.55) * u), gapOf, Math.max(12, Math.round(L / 6)));
  bodyShadow(g, segs, 7);
  armDraw(g, segs);
  if (!reel) {
    const q = segs[segs.length - 1];
    g.translate(q.x, q.y); drawProp3D(g, 'oc:tip', { yaw: floorYaw(a), scale: q.s * 1.05 }); g.translate(-q.x, -q.y);
  }
}
// the loop of it round whoever he's reeling in, round their middle (side -1 its far half, before their model; 1 its
// near half and the length coming in from him), at their feet (lifted)
function loop(g, f, arm, F, t, side) {
  const th0 = Math.atan2(arm.sy - f.y, arm.sx - f.x), R = f.r + 3.5, z0 = 15, z1 = 22, turns = 1.15;
  const p = u => { const th = th0 + u * turns * TAU; return [R * Math.cos(th), R * Math.sin(th), z0 + (z1 - z0) * u]; };
  const at0 = bodyAt(p, u => 0.6 - 0.25 * u), at = u => { const q = at0(u); q.th = th0 + u * turns * TAU; return q; };
  const segs = spine(at, gapOf, 40).filter(q => (Math.sin(q.th) >= 0 ? 1 : -1) === side);
  armDraw(g, segs);
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
// the clone: Octo again, inky and see-through with a sheen on it, standing in its puddle, ink dripping off it; it rises
// out of the puddle, does what he does, and pops (ink bursting off it: the event)
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
  const arms = o.ph === 'copy' && o.cp === 'move3' && own.ms === o.cms && (own.ph === 'rise' || own.ph === 'push');
  if (arms) { g.save(); g.translate(o.x, o.y); riseArms(g, own, -1, v.t); g.restore(); }
  g.save(); g.translate(o.x, o.y - hop); g.globalAlpha *= a;
  const yaw = (o.face || 0) + 0.35 * Math.sin(Math.PI / 2 - (o.face || 0));
  const sheen = (c, w, h) => { const gr = c.createLinearGradient(0, 0, w * 0.7, h * 0.8); gr.addColorStop(0.25, 'rgba(190,210,255,0.28)'); gr.addColorStop(0.5, 'rgba(190,210,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); };
  tinted(g, gg => model(gg, ch, { t: v.t + 3.1, scale: SCALE * s, smooth: true, yaw, mood: null, pose, shadow: false, fight: true }), r3 ? ['rgba(30,40,86,0.42)', sheen] : [bold() ? 'rgba(70,96,160,0.3)' : 'rgba(80,110,180,0.32)']);
  g.restore();
  if (arms) { g.save(); g.translate(o.x, o.y); riseArms(g, own, 1, v.t); g.restore(); }
  // ink dripping off it now and then
  if (r3 && o.ph !== 'poof' && every(v, 'drip' + o.id, 0.22)) { const k = hsh(v.t * 7.3), side = k < 0.5 ? -1 : 1; bit3(v, 'ink', o.x + side * (8 + 6 * hsh(v.t * 3.1)), o.y + 1, 14 + 16 * hsh(v.t * 5.7), { dz: -10, life: 0.6, s: 1.3 + 0.6 * hsh(v.t), g: 500, bo: 0, sp: 0 }); }
}

// ---------------------------------------------------------------- Force Push
// his eight tentacles round a source (at (0, 0): its feet): rising up out of him and curling over as he winds, flung
// down flat on the floor at the slam (out SLAM_L), then drawn back in. side -1: the far ones (behind the body), 1: the
// near ones. f: Octo (his phase drives them, his clone's too)
const SLAM_L = 46;
function riseArms(g, f, side, t) {
  const ph = f.ph, k = f.pht || 0;
  let up = 0, out = 0;
  if (ph === 'rise') up = ease(k / Math.max(0.1, (f.dur || 0.55) * 0.8));
  else if (ph === 'push') { if (k < 0.12) out = 1; else if (k < 0.45) { out = 1 - ease((k - 0.12) / 0.33); } else return; }
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
      p = u => { const r = 13 + L * u, b = a + bend * 0.18 * Math.sin(u * Math.PI) * out; return [Math.cos(b) * r, Math.sin(b) * r, 7 * (1 - u) + 2 + 3 * Math.max(0, u - 0.85) / 0.15 * out]; };
    } else {   // rising, leaning out, curling over at the top, swaying
      const h = 34 * up, sw = Math.sin(t * 5 + j) * 2.5 * up, lean = 15 + 6 * up;
      p = u => { const w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u, r = 13 * w0 + (lean + 10) * w1 + (lean + 4 - 9 * up * Math.max(0, u - 0.7) / 0.3) * w2, z = 7 * w0 + (7 + h * 0.75) * w1 + (7 + h) * w2;
        return [Math.cos(a) * r - sn * sw * u, Math.sin(a) * r + ca * sw * u, z]; };
    }
    armDraw(g, spine(bodyAt(p, u => 0.92 - 0.55 * u), gapOf, 18));
  }
}
// the slam's ripple: a ring running out through the floor (a light lip on its inner side, a soft dark trough outside
// it, lit from the top left), fading as it goes, a fainter one behind it
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
// the puddle: glossy 3D ink, spreading out as it lands, a couple of little splats beside it, a glint sliding over it,
// fading in its last second
function puddle3(g, o, t) {
  const age = o.t || 0, left = (o.life || 3.5) - age, a = clamp(age / 0.1, 0, 1) * clamp(left / 0.9, 0, 1); if (a <= 0.01) return;
  const r = (o.r || 32) * (0.55 + 0.45 * ease(age / 0.2)), seed = (o.id || 1) * 2.7;
  g.save(); g.globalAlpha *= 0.94;
  decal3(g, 'oc:pool', o.x, o.y, r, { alpha: a });
  g.restore();
  const q = (t * 0.35 + hsh(seed)) % 2.2; if (q < 1) { const x = o.x + r * (q - 0.5) * 0.9, y = o.y - r * 0.18 + r * (q - 0.5) * 0.25; g.fillStyle = `rgba(235,242,255,${(0.5 * a * Math.sin(q * Math.PI)).toFixed(3)})`; g.beginPath(); g.ellipse(x, y, 3.2, 1.1, -0.3, 0, TAU); g.fill(); }
}

// ---------------------------------------------------------------- the tells on the floor
// a Pull Request's line: a faint damp track running out from its source along the line, a row of little sucker marks
// down it (a pale dot over a soft dark one, so it reads on any floor), soft at both ends
function dampTrack(g, F, o, t) {
  const L = o.len || 0; if (L < 6) return;
  const c = Math.cos(o.a), s = Math.sin(o.a), a = clamp(o.t / 0.1, 0, 1), r0 = 18;
  const fade = d => clamp((d - r0) / 16, 0, 1) * clamp((L - d) / 24, 0, 1);
  g.save(); g.lineCap = 'round';
  const gr = g.createLinearGradient(o.x + c * r0, o.y + s * r0, o.x + c * L, o.y + s * L);
  gr.addColorStop(0, 'rgba(36,42,56,0)'); gr.addColorStop(0.15, `rgba(36,42,56,${(0.13 * a).toFixed(3)})`); gr.addColorStop(0.85, `rgba(36,42,56,${(0.13 * a).toFixed(3)})`); gr.addColorStop(1, 'rgba(36,42,56,0)');
  g.strokeStyle = gr; g.lineWidth = 11; g.beginPath(); g.moveTo(o.x + c * r0, o.y + s * r0); g.lineTo(o.x + c * L, o.y + s * L); g.stroke();
  for (let d = r0 + 10, k = 0; d < L - 4; d += 18, k++) {   // (little damp sucker prints: a soft dark ring with a paler middle)
    const q = fade(d) * a; if (q < 0.03) continue;
    const off = (k % 2 ? 3.5 : -3.5), x = o.x + c * d - s * off, y = o.y + s * d + c * off, rr = 2.4 * (1 - 0.3 * d / Math.max(L, 1));
    softDisc(g, x, y, rr + 1.6, [[0, '40,34,44', 0.06 * q], [0.6, '40,34,44', 0.2 * q], [1, '40,34,44', 0]]);
    g.fillStyle = `rgba(250,232,222,${(0.32 * q).toFixed(3)})`; circle(g, x - 0.3, y - 0.4, rr * 0.5); g.fill();
  }
  g.restore();
}
// a Force Push's reach: the soft shadows of his raised tentacles stretching out over the floor round its source as they
// rise (their ends: how far the slam goes)
function reachShadows(g, F, o, t) {
  const R = o.R || 118, u = ease(o.u || 0), n = 8;
  g.save(); g.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const a = k / n * TAU + 0.2 + Math.sin(t * 2 + k) * 0.03;
    let L = 14 + (R - 14) * u;
    for (let d = 14; d < L; d += 6) if (F.A && sd(F.A.bounds, o.x + Math.cos(a) * d, o.y + Math.sin(a) * d)[0] > -4) { L = d; break; }   // (never past the wall)
    if (L < 18) continue;
    const x0 = o.x + Math.cos(a) * 14, y0 = o.y + Math.sin(a) * 14, x1 = o.x + Math.cos(a) * L, y1 = o.y + Math.sin(a) * L;
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, `rgba(30,32,44,${(0.08 + 0.16 * u).toFixed(3)})`); gr.addColorStop(0.8, `rgba(30,32,44,${(0.06 + 0.12 * u).toFixed(3)})`); gr.addColorStop(1, 'rgba(30,32,44,0)');
    g.strokeStyle = gr;
    for (const w of [11, 6]) { g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(lerp(x0, x1, 0.5) - Math.sin(a) * 6, lerp(y0, y1, 0.5) + Math.cos(a) * 6, x1, y1); g.stroke(); }
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
function tentacle(g, o, F, t) {
  const L = o.len, a = o.a, c = Math.cos(a), s = Math.sin(a), nx = -s, n = 14, seed = (o.id || 1) * 1.3, h0 = 20, h1 = o.ph === 'reel' ? 20 : 12;
  const pts = [];
  for (let k = 0; k <= n; k++) { const u = k / n, wav = Math.sin(u * 5 + (o.t || 0) * 16 + seed) * 3.5 * Math.sin(u * Math.PI), d = 12 + (L + 2) * u; pts.push([o.sx + c * d + nx * wav, o.sy + s * d + c * wav - lerp(h0, h1, u)]); }
  g.strokeStyle = INK; g.lineCap = 'round';
  for (let k = 0; k < n; k++) { g.lineWidth = 9 * (1 - k / n * 0.7); g.beginPath(); g.moveTo(pts[k][0], pts[k][1]); g.lineTo(pts[k + 1][0], pts[k + 1][1]); g.stroke(); }
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
