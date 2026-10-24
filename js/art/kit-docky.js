// Docky's drawing for Fight (2026-10-24, the rebuild; the sim is js/kits/docky.js). Cosmetic only. Classic Flat first
// (bold(): flat two-tone fills), Classic soft-shaded. The tells are part of the world (the user: no outlines, chevrons,
// arrows or player colours on the floor; a notch calm):
//   Container Drop: a soft square shadow on the floor for each container, faint while he heaves, darkening and firming
//     as its container drops out of the sky onto it; down, a thump of dust and a little shake (only the drop's)
//   Compose Up: the same soft shadows in a row in front of him while the tower piles up on his back; the wall is
//     containers stacked two high
//   Ship It: a faint wake on the floor ahead of him while the horn blows (a soft band of water with pale foam drifting
//     along it), steam puffing out of his blowhole; spray off him as he rams
//   Dive: he's gone; rings of ripples spread where he went under, bubbles rising, churning faster just before he comes
//     up; up, a splash of water drops
import { TAU, clamp, frnd } from '../core.js';
import { bold } from '../look.js';
import { mat, mix, rgba as hexA, tone } from './arena-mat.js';
import { puff } from '../draw-fight.js';
import { animBase } from './kits.js';

const ID = 'docky';
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const hsh = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); };
const CRATES = ['#2f9bea', '#4fb3f3', '#1f80d0'];   // (Docker blues, one per container in turn)
const MATS = CRATES.map(c => mat(c));
const WATER = '120,190,240';

// ---------------------------------------------------------------- a container (a small shipping container, ribbed)
// footprint centred on (x, y), w wide, d deep, H tall, lifted z; k which blue; a its opacity
function container(g, x, y, w, d, H, z, k, a = 1) {
  const BD = bold(), M = MATS[k % MATS.length], x0 = x - w / 2, y0 = y - d / 2 - z, ty = y0 - H, fy = y0 + d - H;
  g.save(); g.globalAlpha *= a;
  if (BD) {   // flat: a lit top, a front in shade, ribs in a deeper tone
    g.fillStyle = tone(M.base, -0.28); g.beginPath(); g.roundRect(x0, fy, w, H, [0, 0, 3, 3]); g.fill();
    g.fillStyle = tone(M.base, 0.3); g.beginPath(); g.roundRect(x0, ty, w, d, 3); g.fill();
    g.fillStyle = tone(M.base, -0.45);
    for (let j = 1; j < 5; j++) g.fillRect(x0 + j * w / 5 - 0.8, fy + 3, 1.6, H - 6);
    g.fillStyle = tone(M.base, 0.05);
    for (let j = 1; j < 4; j++) g.fillRect(x0 + 3, ty + j * d / 4 - 0.6, w - 6, 1.2);
  } else {
    const fg = g.createLinearGradient(0, fy, 0, fy + H); fg.addColorStop(0, M.dark); fg.addColorStop(1, mix(M.dark, M.deep, 0.7));
    g.fillStyle = fg; g.beginPath(); g.roundRect(x0, fy, w, H, [0, 0, 3, 3]); g.fill();
    const tg = g.createLinearGradient(x0, ty, x0 + w, ty + d); tg.addColorStop(0, M.hi); tg.addColorStop(0.6, M.lit); tg.addColorStop(1, M.base);
    g.fillStyle = tg; g.beginPath(); g.roundRect(x0, ty, w, d, 3); g.fill();
    for (let j = 1; j < 5; j++) { const rx = x0 + j * w / 5; g.fillStyle = hexA(M.hi, 0.18); g.fillRect(rx - 1.6, fy + 3, 1.2, H - 6); g.fillStyle = `rgba(${M.ao},0.2)`; g.fillRect(rx - 0.4, fy + 3, 1.4, H - 6); }
    for (let j = 1; j < 4; j++) { g.fillStyle = `rgba(${M.ao},0.1)`; g.fillRect(x0 + 3, ty + j * d / 4, w - 6, 1.2); }
    g.fillStyle = hexA(M.hi, 0.45); g.fillRect(x0 + 2, ty + d - 1.6, w - 4, 1.6);   // (the top's front edge catching the light)
  }
  // the doors' latch bars on the front (two little pale rods) and a tiny whale-blue badge
  g.fillStyle = BD ? '#e8f4fd' : 'rgba(236,246,255,0.75)';
  g.fillRect(x - 4, fy + 4, 1.4, H - 8); g.fillRect(x + 2.6, fy + 4, 1.4, H - 8);
  g.restore();
}
// a soft square shadow on the floor (no outline: layered see-through rounded squares, each a little smaller)
function softSquare(g, x, y, s, a) {
  if (a <= 0.005) return;
  const q = s * 1.2, cx = x + 1.5, cy = y + 1.5, gr = g.createRadialGradient(cx, cy, 0, cx, cy, q * 0.68);
  gr.addColorStop(0, `rgba(18,24,48,${a.toFixed(3)})`); gr.addColorStop(0.6, `rgba(18,24,48,${(a * 0.85).toFixed(3)})`); gr.addColorStop(0.82, `rgba(18,24,48,${(a * 0.35).toFixed(3)})`); gr.addColorStop(1, 'rgba(18,24,48,0)');
  g.fillStyle = gr; g.beginPath(); g.roundRect(cx - q / 2, cy - q / 2, q, q, q * 0.3); g.fill();
}

// the ripples where he dove: rings spreading out (a light crest over a soft trough), a few bubbles
function ripples(g, x, y, t, k, churn) {
  g.save();
  for (let j = 0; j < 3; j++) {
    const q = (t * (0.9 + churn * 1.2) + j / 3) % 1, r = 8 + q * 32, a = (1 - q) * (0.5 + 0.4 * churn) * clamp(k / 0.1, 0, 1);
    g.strokeStyle = `rgba(30,70,120,${(0.32 * a).toFixed(3)})`; g.lineWidth = 3.4; g.beginPath(); g.ellipse(x, y + 1.2, r, r * 0.5, 0, 0, TAU); g.stroke();
    g.strokeStyle = `rgba(240,250,255,${(0.95 * a).toFixed(3)})`; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, r, r * 0.5, 0, 0, TAU); g.stroke();
  }
  g.fillStyle = `rgba(${WATER},0.5)`; g.beginPath(); g.ellipse(x, y, 17, 8.5, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(x - 4, y - 2, 7, 2.5, 0, 0, TAU); g.fill();   // (the dark water he's under)
  for (let j = 0; j < 4 + Math.round(churn * 3); j++) {   // bubbles
    const q = (t * (1.4 + churn * 2) + hsh(j) ) % 1, bx = x + (hsh(j * 3) - 0.5) * 22, by = y - q * 10, rb = 1 + 1.6 * q;
    g.strokeStyle = `rgba(245,252,255,${(0.85 * (1 - q)).toFixed(3)})`; g.lineWidth = 1; circle(g, bx, by, rb); g.stroke();
  }
  g.restore();
}

export default {
  id: ID,
  anim(F, v, f) {
    const A = animBase(), k = f.pht || 0, t = v.t + f.i, sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
    switch (f.ph) {
      case 'heave': { const u = clamp(k / Math.max(0.1, f.dur || 0.42), 0, 1); sq(0.07 * ease(u / 0.3) - 0.1 * Math.max(0, u - 0.6)); A.fwd = -3 * ease(u); A.wx = Math.sin(k * 44) * 0.7 * u; break; }   // rearing back, the cargo rattling
      case 'toss': sq(-0.1 * Math.exp(-k * 10)); A.fwd = 4 * ease(k / 0.1); break;
      case 'stack': A.hop = Math.abs(Math.sin(k * 12)) * 1.6; sq(-0.04 + 0.02 * Math.sin(k * 24)); break;
      case 'build': sq(0.08 * Math.exp(-k * 12)); A.fwd = 3 * ease(k / 0.08); break;
      case 'horn': { const u = clamp(k / 0.3, 0, 1); A.s = 1 + 0.07 * ease(u); sq(-0.03 * ease(u)); if (f.t > (f.dur || 0) * 0.6) A.wx = Math.sin(t * 40) * 0.6; break; }   // puffed up, trembling as it ends
      case 'ram': { A.fwd = 3; A.hop = Math.abs(Math.sin(k * 13)) * 1.2; const c = Math.abs(Math.cos(f.face)); A.sx *= 1 + 0.05 * c; A.sy *= 1 - 0.03 * c; break; }
      case 'dock': sq(0.1 * Math.exp(-k * 10)); break;
      case 'beached': A.lean = Math.sin(t * 3) * 0.06; A.mood = 'dizzy'; sq(0.02 * Math.sin(t * 6)); break;
      case 'under': A.alpha = 0; break;
      case 'breach': { const u = clamp(k / 0.3, 0, 1); A.hop = Math.sin(u * Math.PI) * 12; sq(-0.12 * (1 - u)); A.mood = 'happy'; break; }
      default: return null;
    }
    return A;
  },
  ground(g, F, v, o) {
    if (o.kind === 'dkBox') {
      if (o.ph === 'mark') {   // faint while he heaves or stacks
        softSquare(g, o.x, o.y, o.w * 0.86, (o.mk === 'move1' ? 0.2 : 0.15) * clamp((o.t || 0) / 0.12, 0, 1) * (0.9 + 0.1 * Math.sin(v.t * 6)));
      } else if (o.ph === 'wait' || o.ph === 'fall') {   // darkening and firming as it comes down
        const u = o.ph === 'fall' ? clamp((o.ft || 0) / (o.fall || 0.3), 0, 1) : 0;
        softSquare(g, o.x, o.y, o.w * (0.86 + 0.14 * u), 0.2 + 0.26 * u * u);
      }
    } else if (o.kind === 'dkWake') wake(g, F, v, o);
  },
  things(F, v, g, o, out) {
    if (o.kind !== 'dkBox') return;
    if (o.ph === 'fall') {   // dropping out of the sky onto its shadow
      const u = clamp((o.ft || 0) / (o.fall || 0.3), 0, 1), z = (o.mk === 'move2' ? 70 : 220) * (1 - u * u);
      out.push({ y: o.y + o.h / 2 - 2, d: () => container(g, o.x, o.y, o.w, o.h, o.mk === 'move2' ? 18 : 22, z, o.k + (o.id || 0), clamp(u * 4, 0, 1)) });
    } else if (o.ph === 'down' || o.ph === 'slide') {
      const left = (o.life || 3) - (o.t || 0), a = clamp(left / 0.3, 0, 1), sink = (1 - a) * 6;
      out.push({ y: o.y + o.h / 2 - 2, d: () => {
        g.save(); g.fillStyle = `rgba(18,24,48,${(0.22 * a).toFixed(3)})`; g.beginPath(); g.ellipse(o.x + 2, o.y + o.h / 2 - 1, o.w * 0.62, 5, 0, 0, TAU); g.fill(); g.restore();   // (a soft contact shadow)
        if (o.mk === 'move2') {   // the wall: two high
          container(g, o.x, o.y, o.w, o.h, 16, -sink, o.k + (o.id || 0), a);
          container(g, o.x + (o.k % 2 ? 1.5 : -1.5), o.y, o.w - 3, o.h - 3, 15, 16 - sink, o.k + 1 + (o.id || 0), a);
        } else container(g, o.x, o.y, o.w, o.h, 22, -sink, o.k + (o.id || 0), a);
      } });
    }
  },
  behind(g, F, v, f) {
    if (f.id !== ID) return null;
    if (f.ph === 'under' && f.move === 'evade') { const E = f.stats.moves.evade; ripples(g, f.x, f.y, v.t, f.pht || 0, clamp((f.t - E.active * 0.6) / (E.active * 0.4), 0, 1)); return 'hide'; }
    if (f.ph === 'ram' && Math.hypot(f.vx || 0, f.vy || 0) > 150) {   // spray off his front, foam left behind
      if (v.fx.length < 120 && frnd(0, 1) < 0.5) { const c = Math.cos(f.face), s = Math.sin(f.face), side = frnd(0, 1) < 0.5 ? 1 : -1; v.fx.push({ k: 'dkDrop', x: f.x + c * 16 - s * side * 12, y: f.y + s * 10 + c * side * 6, z: 6, vx: -s * side * frnd(40, 90) - c * 30, vy: c * side * frnd(20, 50) - s * 20, vz: frnd(80, 150), t: 0, life: frnd(0.4, 0.6), s: frnd(1.6, 2.6) }); }
    }
    return null;
  },
  over(g, F, v, f) {
    if (f.id !== ID) return;
    if (f.ph === 'horn' && v.fx.length < 120 && frnd(0, 1) < 0.25) v.fx.push({ k: 'steam', x: f.x + Math.cos(f.face) * 10 + frnd(-3, 3), y: f.y - 52, vx: frnd(-10, 10), vy: -frnd(25, 45), t: 0, life: frnd(0.6, 0.9), s: frnd(4, 7) });   // (steam out of the blowhole)
    if (f.ph === 'beached') {   // three little stars round his head
      const tt = v.t * 3;
      for (let j = 0; j < 3; j++) { const a = tt + j * TAU / 3, x = Math.cos(a) * 14, y = -50 + Math.sin(a) * 4; g.fillStyle = 'rgba(255,224,110,0.9)'; star(g, x, y, 3.2); }
    }
  },
  event(v, F, e, few) {
    switch (e.kind) {
      case 'dkToss': puff(v, e.x, e.y - 30, few ? 2 : 3, null); return true;
      case 'dkBuild': puff(v, e.x, e.y, few ? 1 : 2, null); return true;
      case 'dkLand': {   // a container down: a thump of dust out from under it (the drop's: a little shake)
        const n = few ? 5 : 9;
        for (let k = 0; k < n; k++) { const a = k / n * TAU + frnd(-0.2, 0.2), sp = frnd(50, 90); v.fx.push({ k: 'dust', x: e.x + Math.cos(a) * 14, y: e.y + Math.sin(a) * 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, t: 0, life: frnd(0.4, 0.65), s: frnd(5, 8) }); }
        if (e.move === 'move1') v.shake = Math.max(v.shake, 0.12);
        return true;
      }
      case 'dkCrush': v.fx.push({ k: 'flash', x: e.x, y: e.y - 18, t: 0, life: 0.12, s: 20 }); return true;
      case 'dkPoof': puff(v, e.x, e.y - 8, few ? 2 : 4, null); return true;
      case 'dkHorn': return true;   // (the steam: over())
      case 'dkRam': puff(v, e.x - Math.cos((F.f[e.who] || {}).face || 0) * 14, e.y, few ? 2 : 3, null); return true;
      case 'dkShove': puff(v, e.x, e.y, few ? 2 : 3, null); return true;
      case 'dkThunk': for (let k = 0; k < (few ? 3 : 5); k++) { const a = frnd(0, TAU), sp = frnd(40, 70); v.fx.push({ k: 'dust', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, t: 0, life: 0.45, s: 6 }); } return true;
      case 'dkBeach': puff(v, e.x, e.y, few ? 2 : 4, null); if (e.why === 'wall') v.shake = Math.max(v.shake, 0.14); return true;
      case 'dkDive': case 'dkBreach': {   // a splash: water drops flung up and out, a ring on the floor
        const n = e.kind === 'dkBreach' ? (few ? 6 : 11) : (few ? 4 : 7);
        for (let k = 0; k < n; k++) { const a = k / n * TAU + frnd(-0.3, 0.3), sp = frnd(40, 100); v.fx.push({ k: 'dkDrop', x: e.x + Math.cos(a) * 8, y: e.y + Math.sin(a) * 4, z: 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.55, vz: frnd(120, e.kind === 'dkBreach' ? 260 : 190), t: 0, life: frnd(0.5, 0.8), s: frnd(1.8, 3) }); }
        v.fx.push({ k: 'popring', x: e.x, y: e.y, t: 0, life: 0.4, s: e.kind === 'dkBreach' ? 36 : 26 });
        return true;
      }
      case 'dkClang': {   // a hit clanging off his wall: a little white spark on the steel
        v.fx.push({ k: 'clinkfx', x: e.x, y: e.y - 22, t: 0, life: 0.2, s: 10, a: frnd(0, 1) });
        for (let k = 0; k < (few ? 2 : 3); k++) { const b = frnd(0, TAU), sp = frnd(90, 150); v.fx.push({ k: 'glint', x: e.x, y: e.y - 22, vx: Math.cos(b) * sp, vy: Math.sin(b) * sp * 0.6 - 30, t: 0, life: 0.18, s: 6 }); }
        return true;
      }
    }
    return false;
  },
  fx(g, F, v, p, k, dt) {
    if (p.k !== 'dkDrop') return false;   // a drop of water: up, and down onto the floor (a little dark dot as it lands)
    p.vz -= 760 * dt; p.z = Math.max(0, p.z + p.vz * dt);
    const a = 1 - k * k, r = p.s * (p.z > 0 ? 1 : 0.7);
    g.fillStyle = `rgba(40,110,180,${(0.45 * a).toFixed(3)})`; g.beginPath(); g.ellipse(p.x + 0.4, p.y - p.z + 0.6, r, r * (p.z > 0 ? 1.2 : 0.5), 0, 0, TAU); g.fill();
    g.fillStyle = `rgba(${WATER},${(0.95 * a).toFixed(3)})`; g.beginPath(); g.ellipse(p.x, p.y - p.z, r * 0.85, r * (p.z > 0 ? 1.05 : 0.42), 0, 0, TAU); g.fill();
    if (p.z > 0) { g.fillStyle = `rgba(255,255,255,${(0.8 * a).toFixed(3)})`; circle(g, p.x - r * 0.3, p.y - p.z - r * 0.35, r * 0.3); g.fill(); }
    return true;
  },
  icon(g, kind, r, col) {
    const W = col || '#ffffff';
    g.fillStyle = W; g.strokeStyle = W;
    switch (kind) {
      case 'dkDrop':   // a container falling onto its shadow
        g.beginPath(); g.roundRect(-r * 0.5, -r * 0.75, r, r * 0.62, r * 0.08); g.fill();
        g.globalAlpha *= 0.55; g.beginPath(); g.ellipse(0, r * 0.62, r * 0.55, r * 0.16, 0, 0, TAU); g.fill(); g.globalAlpha /= 0.55;
        g.lineWidth = r * 0.1; g.lineCap = 'round'; g.beginPath(); g.moveTo(-r * 0.2, -r * 0.02); g.lineTo(-r * 0.2, r * 0.28); g.moveTo(r * 0.2, -r * 0.02); g.lineTo(r * 0.2, r * 0.28); g.stroke();
        return true;
      case 'dkWall':   // containers stacked: two on the bottom, one on top
        g.beginPath(); g.roundRect(-r * 0.78, r * 0.05, r * 0.74, r * 0.52, r * 0.07); g.roundRect(r * 0.04, r * 0.05, r * 0.74, r * 0.52, r * 0.07); g.roundRect(-r * 0.37, -r * 0.55, r * 0.74, r * 0.52, r * 0.07); g.fill();
        return true;
      case 'dkShip':   // a whale's head ramming, a wave off its nose
        g.beginPath(); g.ellipse(-r * 0.1, 0, r * 0.62, r * 0.42, 0, 0, TAU); g.fill();
        g.lineWidth = r * 0.14; g.lineCap = 'round'; g.beginPath(); g.arc(r * 0.62, 0, r * 0.28, -1.1, 1.1); g.stroke();
        g.beginPath(); g.moveTo(-r * 0.75, -r * 0.55); g.lineTo(-r * 0.95, -r * 0.55); g.moveTo(-r * 0.7, r * 0.55); g.lineTo(-r * 0.9, r * 0.55); g.stroke();
        return true;
      case 'dkDive':   // a tail diving into rings of water
        g.lineWidth = r * 0.12; g.beginPath(); g.ellipse(0, r * 0.45, r * 0.75, r * 0.22, 0, 0, TAU); g.stroke();
        g.beginPath(); g.moveTo(0, r * 0.35); g.quadraticCurveTo(-r * 0.05, -r * 0.1, -r * 0.4, -r * 0.55); g.quadraticCurveTo(0, -r * 0.3, r * 0.4, -r * 0.55); g.quadraticCurveTo(r * 0.05, -r * 0.1, 0, r * 0.35); g.fill();
        return true;
    }
    return false;
  },
  sound(e) {
    switch (e.kind) {
      case 'dkToss': return [['fToss', 0.7]];
      case 'dkBuild': return [['fCrate', 0.5]];
      case 'dkLand': return [['fCrate', e.move === 'move1' ? 0.8 : 0.5]];
      case 'dkCrush': return [['fHeavy', 0.6]];
      case 'dkPoof': return [['fPop', 0.35]];
      case 'dkHorn': return [['dkHorn', 0.9]];
      case 'dkRam': return [['fTorpedo', 0.6]];
      case 'dkShove': case 'dkThunk': return [['fCrate', 0.55]];
      case 'dkBeach': return [['fBelly', 0.7]];
      case 'dkDive': return [['dkSplash', 0.7]];
      case 'dkBreach': return [['dkSplash', 0.9]];
      case 'dkClang': return [['fIso', 0.7]];
    }
    return null;
  },
  sounds: {
    // a ship's horn: two low notes together, swelling and fading, a breath of air under them
    dkHorn: ({ osc, hiss }) => (v, t) => { osc(t, 98, 0.55, 'sawtooth', 0.06 * v, 0); osc(t, 147, 0.55, 'sawtooth', 0.045 * v, 0); osc(t, 196, 0.5, 'sine', 0.05 * v, -4); hiss(t, 0.5, 0.05 * v, 'lowpass', 500, 300); },
    // a splash: a soft plop and a hiss of water
    dkSplash: ({ osc, hiss }) => (v, t) => { osc(t, 220, 0.12, 'sine', 0.18 * v, -160); hiss(t, 0.35, 0.16 * v, 'bandpass', 1800, 700); for (let k = 0; k < 3; k++) osc(t + 0.06 + k * 0.05, 900 + k * 250, 0.04, 'sine', 0.04 * v, 300); },
  },
};
function star(g, x, y, s) { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, q = k % 2 ? s * 0.45 : s; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } g.closePath(); g.fill(); }
// Ship It's wake: a soft band of water along his run, a darker trough under a pale crest, pale foam drifting along it;
// faint while the horn blows, fading out behind him as he goes
function wake(g, F, v, o) {
  const f = F.f[o.owner]; if (!f || !(o.len > 6)) return;
  const c = Math.cos(o.a), s = Math.sin(o.a), w = f.r, go = o.ph === 'go';
  let s0 = 0; if (go) s0 = Math.max(0, (f.x - o.x) * c + (f.y - o.y) * s);
  const L = o.len, A = go ? 0.6 : clamp((o.t || 0) / 0.15, 0, 1) * (0.8 + 0.2 * Math.sin(v.t * 6));
  if (L - s0 < 6) return;
  const at = d => [o.x + c * d, o.y + s * d];
  g.save(); g.lineCap = 'round';
  const [x0, y0] = at(s0 + 6), [x1, y1] = at(L);
  g.strokeStyle = `rgba(30,70,120,${(0.1 * A).toFixed(3)})`; g.lineWidth = w * 2.2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.strokeStyle = `rgba(${WATER},${(0.16 * A).toFixed(3)})`; g.lineWidth = w * 1.4; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  // foam: little pale ovals drifting along, on either side
  const sp = 15, off = go ? 0 : (v.t * 30) % sp;
  for (let d = s0 + 10 + off, j = 0; d < L - 4; d += sp, j++) {
    const q = clamp((L - d) / 30, 0, 1) * clamp((d - s0) / 20, 0, 1) * A; if (q < 0.03) continue;
    const side = j % 2 ? 1 : -1, lat = side * w * (0.45 + 0.2 * hsh(j + (o.id || 0))), [x, y] = at(d);
    const fx = x - s * lat, fy = y + c * lat;
    g.fillStyle = `rgba(30,70,120,${(0.2 * q).toFixed(3)})`; g.beginPath(); g.ellipse(fx + 0.5, fy + 1, 4, 2, o.a, 0, TAU); g.fill();
    g.fillStyle = `rgba(245,252,255,${(0.85 * q).toFixed(3)})`; g.beginPath(); g.ellipse(fx, fy, 3.4, 1.7, o.a, 0, TAU); g.fill();
  }
  g.restore();
}
