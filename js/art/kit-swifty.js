// Swifty's drawing for Fight (2026-10-24, the rebuild; the sim is js/kits/swifty.js). Cosmetic only. Classic Flat first
// (bold(): flat fills), Classic soft-shaded. The tells are part of the world (no outlines, chevrons, arrows or player
// colours on the floor; a notch calm):
//   Dive Bomb: she hangs up in the air, wings beating, her shadow small under her; a shimmer on the floor along her
//     dive line (a faint band of warm haze with pale glints running along it), fading behind her as she dives
//   Gust: wings up; dust and little leaves skitter outward over the floor in the cone in front of her, the cone itself
//     only a faint haze; the blow sends a puff of dust and feathers out along it
//   Closure: a faint trail of little feathers lying along the whole loop the feather will fly (from where it is round
//     to her), thinning out behind it as it goes; the feather itself spins along at head height with a soft shadow
//   Wing Hop: a little dust kicked off the floor, a few feathers on the landing
import { TAU, clamp, frnd } from '../core.js';
import { bold } from '../look.js';
import { puff } from '../draw-fight.js';
import { animBase } from './kits.js';
import { loopAt } from '../kits/swifty.js';

const ID = 'swifty';
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const hsh = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const OR = '#f67a34', CREAM = '#fff4ec';
// a little feather: a leaf shape along angle a, s long, cream with an orange-red tip (flat: two flat tones)
function feather(g, x, y, a, s, al, tip = true) {
  if (al <= 0.01) return;
  g.save(); g.translate(x, y); g.rotate(a); g.globalAlpha *= al;
  g.fillStyle = bold() ? CREAM : '#fff8f2';
  g.beginPath(); g.moveTo(-s, 0); g.quadraticCurveTo(-s * 0.2, -s * 0.42, s, -s * 0.06); g.quadraticCurveTo(-s * 0.1, s * 0.34, -s, 0); g.fill();
  if (tip) { g.fillStyle = bold() ? '#e2492e' : 'rgba(226,73,46,0.9)'; g.beginPath(); g.moveTo(s * 0.35, -s * 0.2); g.quadraticCurveTo(s * 0.7, -s * 0.22, s, -s * 0.06); g.quadraticCurveTo(s * 0.6, s * 0.08, s * 0.3, s * 0.08); g.fill(); }
  g.strokeStyle = 'rgba(160,90,60,0.55)'; g.lineWidth = Math.max(0.6, s * 0.08); g.beginPath(); g.moveTo(-s * 1.15, 0.2); g.lineTo(s * 0.85, -s * 0.04); g.stroke();   // (the quill)
  g.restore();
}
function shimmer(g, F, v, o) {
  const f = F.f[o.owner]; if (!f || !(o.len > 8)) return;
  const c = Math.cos(o.a), s = Math.sin(o.a), go = o.ph === 'go';
  const s0 = go ? Math.max(0, (f.x - o.x) * c + (f.y - o.y) * s) : 10, L = o.len;
  if (L - s0 < 8) return;
  const A = go ? 0.7 : clamp((o.t || 0) / 0.15, 0, 1), at = d => [o.x + c * d, o.y + s * d];
  g.save(); g.lineCap = 'round';
  const [x0, y0] = at(s0), [x1, y1] = at(L);
  g.strokeStyle = `rgba(60,40,30,${(0.08 * A).toFixed(3)})`; g.lineWidth = 26; g.beginPath(); g.moveTo(x0, y0 + 1.5); g.lineTo(x1, y1 + 1.5); g.stroke();   // (a soft dark under it: reads on a pale floor)
  g.strokeStyle = `rgba(255,236,200,${(0.16 * A).toFixed(3)})`; g.lineWidth = 18; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  // the glints: short pale wavering streaks running along it (the haze)
  for (let j = 0; j < 9; j++) {
    const q = (v.t * (go ? 0.4 : 1.1) + hsh(j + (o.id || 0))) % 1, d = s0 + (L - s0) * q, lat = (hsh(j * 3) - 0.5) * 14 + Math.sin(v.t * 9 + j) * 1.6, [x, y] = at(d);
    const al = Math.sin(q * Math.PI) * A * 0.75, len = 6 + 5 * hsh(j * 7);
    g.strokeStyle = `rgba(255,250,236,${al.toFixed(3)})`; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x - s * lat - c * len / 2, y + c * lat - s * len / 2); g.quadraticCurveTo(x - s * (lat + 1.5), y + c * (lat + 1.5), x - s * lat + c * len / 2, y + c * lat + s * len / 2); g.stroke();
  }
  g.restore();
}
function cone(g, F, v, o) {
  const f = F.f[o.owner]; if (!f) return;
  const mv = f.stats.moves.move2, R = mv.range, h = mv.arc * Math.PI / 360, blow = o.ph === 'blow';
  const A = blow ? clamp(1 - (o.pt || 0) / 0.35, 0, 1) : clamp((o.t || 0) / 0.15, 0, 1);
  if (A <= 0.01) return;
  g.save();
  const gr = g.createRadialGradient(o.x, o.y, 10, o.x, o.y, R);
  gr.addColorStop(0, `rgba(235,240,246,${(0.09 * A).toFixed(3)})`); gr.addColorStop(0.8, `rgba(235,240,246,${(0.07 * A).toFixed(3)})`); gr.addColorStop(1, 'rgba(235,240,246,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(o.x, o.y); g.arc(o.x, o.y, R, o.a - h, o.a + h); g.closePath(); g.fill();
  // wind streaks over the floor, flowing outward (soft curved strokes)
  g.lineCap = 'round';
  for (let j = 0; j < 8; j++) {
    const q = (v.t * (blow ? 2.4 : 1.3) + hsh(j + 2)) % 1, an = o.a + (hsh(j * 5) - 0.5) * 2 * h * 0.85, d = 20 + (R - 20) * q, x = o.x + Math.cos(an) * d, y = o.y + Math.sin(an) * d;
    const al = Math.sin(q * Math.PI) * A * (blow ? 0.8 : 0.5), L = 9 + 6 * hsh(j);
    g.strokeStyle = `rgba(90,80,70,${(al * 0.25).toFixed(3)})`; g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(x - Math.cos(an) * L, y - Math.sin(an) * L + 1); g.quadraticCurveTo(x - Math.cos(an + 0.5) * L * 0.4, y - Math.sin(an + 0.5) * L * 0.4 + 1, x, y + 1); g.stroke();
    g.strokeStyle = `rgba(255,255,255,${al.toFixed(3)})`; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x - Math.cos(an) * L, y - Math.sin(an) * L); g.quadraticCurveTo(x - Math.cos(an + 0.5) * L * 0.4, y - Math.sin(an + 0.5) * L * 0.4, x, y); g.stroke();
  }
  g.restore();
  if (!blow && v.fx.length < 120 && frnd(0, 1) < 0.35) {   // a leaf or a bit of dust skittering out over the floor
    const an = o.a + frnd(-h, h) * 0.8, d = frnd(20, R * 0.6), sp = frnd(70, 120);
    v.fx.push({ k: 'swLeaf', x: o.x + Math.cos(an) * d, y: o.y + Math.sin(an) * d, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, t: 0, life: frnd(0.45, 0.7), s: frnd(2.2, 3.4), a: frnd(0, TAU), leaf: frnd(0, 1) < 0.4 });
  }
}
// the feather's loop: little feathers lying along it from where it is now round to her
function trail(g, F, v, o) {
  const f = F.f[o.owner]; if (!f) return;
  const mv = f.stats.moves.move3, u0 = o.ph === 'fly' ? clamp((o.ft || 0) / mv.flight, 0, 1) : 0;
  const A = o.ph === 'aim' ? clamp((o.t || 0) / 0.12, 0, 1) * 0.9 : 0.8;
  const n = 22;
  for (let j = 1; j < n; j++) {
    const u = j / n; if (u <= u0 + 0.03) continue;
    const [x, y] = loopAt(o, u, f.x, f.y), [x2, y2] = loopAt(o, Math.min(1, u + 0.01), f.x, f.y), a = Math.atan2(y2 - y, x2 - x);
    const al = A * clamp((u - u0) / 0.1, 0, 1) * clamp((1 - u) / 0.12, 0, 1) * 0.8;
    g.fillStyle = `rgba(80,40,20,${(0.2 * al).toFixed(3)})`; g.beginPath(); g.ellipse(x + 0.6, y + 1, 4, 1.6, a, 0, TAU); g.fill();
    feather(g, x, y, a + 0.4 * Math.sin(j * 2.3), 4.4, al, false);
  }
}

export default {
  id: ID,
  anim(F, v, f) {
    const A = animBase(), k = f.pht || 0, t = v.t + f.i, sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
    const flap = q => { sq(0.05 * Math.sin(t * 26) * q); A.hop += Math.sin(t * 13) * 1.6 * q; };
    switch (f.ph) {
      case 'rise': A.hop = 28 * ease(k / 0.25); flap(1); break;   // up and hanging there, wings beating
      case 'dive': { A.hop = 28 * (1 - ease(k / 0.12)); const c = Math.abs(Math.cos(f.face)); A.sx *= 1 + 0.08 * c; A.sy *= 1 - 0.05 * c; break; }
      case 'bounce': { const u = clamp(k / 0.28, 0, 1); A.hop = Math.sin(u * Math.PI) * 14; A.mood = 'happy'; break; }
      case 'tumble': A.lean = Math.sin(t * 9) * 0.14 * (1 - clamp(k / 0.6, 0, 1)); A.mood = 'dizzy'; A.hop = Math.abs(Math.sin(k * 10)) * 2 * (1 - clamp(k / 0.4, 0, 1)); break;
      case 'flap': A.hop = 16 * ease(k / 0.2); flap(1.2); break;
      case 'gust': A.hop = 16 - 16 * ease(k / 0.6); A.fwd = -4 * Math.exp(-k * 6); sq(0.06 * Math.exp(-k * 10)); break;
      case 'cock': A.fwd = -2 * ease(k / 0.15); A.lean = -0.05; if (f.t > (f.dur || 0) * 0.7) A.wx = Math.sin(t * 36) * 0.5; break;
      case 'fling': sq(-0.07 * Math.exp(-k * 10)); A.fwd = 4 * ease(k / 0.08); break;
      case 'hop': sq(-0.08); flap(0.6); break;
      case 'perch': sq(0.12 * Math.exp(-k * 9) * Math.cos(k * 18)); break;
      default: return null;
    }
    return A;
  },
  ground(g, F, v, o) {
    if (o.kind === 'swLine') shimmer(g, F, v, o);
    else if (o.kind === 'swCone') cone(g, F, v, o);
    else if (o.kind === 'swFeather') trail(g, F, v, o);
  },
  things(F, v, g, o, out) {
    if (o.kind !== 'swFeather' || o.ph !== 'fly') return;
    out.push({ y: o.y, d: () => {
      g.fillStyle = 'rgba(20,16,42,0.18)'; g.beginPath(); g.ellipse(o.x + 1, o.y + 1, 7, 2.6, 0, 0, TAU); g.fill();   // its shadow
      feather(g, o.x, o.y - 22, (o.va || 0) + v.t * 14, 9, 1);   // spinning along at head height
    } });
  },
  behind(g, F, v, f) {
    if (f.id !== ID) return null;
    if (f.ph === 'dive' && Math.hypot(f.vx || 0, f.vy || 0) > 200) {   // a few soft feathery streaks off her
      const sp = Math.hypot(f.vx, f.vy), ux = f.vx / sp, uy = f.vy / sp, h = 20 + 28 * (1 - ease((f.pht || 0) / 0.12));
      g.save(); g.lineCap = 'round';
      for (let k = 0; k < 4; k++) {
        const off = (k - 1.5) * 5, x = f.x - uy * off, y = f.y - h + ux * off * 0.6, L = 22 + (k % 2) * 10;
        const gr = g.createLinearGradient(x, y, x - ux * L, y - uy * L);
        gr.addColorStop(0, k % 2 ? 'rgba(255,255,255,0.55)' : 'rgba(255,190,140,0.5)'); gr.addColorStop(1, 'rgba(255,220,190,0)');
        g.strokeStyle = gr; g.lineWidth = 2.6 - Math.abs(k - 1.5) * 0.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x - ux * L, y - uy * L); g.stroke();
      }
      g.restore();
    }
    return null;
  },
  over(g, F, v, f) {
    if (f.id !== ID || f.ph !== 'tumble') return;
    const tt = v.t * 3.4;   // (dizzy: three little stars round her head)
    for (let j = 0; j < 3; j++) { const a = tt + j * TAU / 3, x = Math.cos(a) * 11, y = -46 + Math.sin(a) * 3.5; g.fillStyle = 'rgba(255,224,110,0.9)'; g.beginPath(); for (let q = 0; q < 10; q++) { const b = -Math.PI / 2 + q * Math.PI / 5, r = q % 2 ? 1.3 : 2.9; g.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r); } g.closePath(); g.fill(); }
  },
  event(v, F, e, few) {
    const fl = (x, y, n, sp = 80) => { for (let k = 0; k < n; k++) { const a = frnd(0, TAU), s = frnd(sp * 0.4, sp); v.fx.push({ k: 'swFeatherP', x, y: y - frnd(10, 30), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 30, t: 0, life: frnd(0.7, 1.1), s: frnd(3.2, 4.6), a: frnd(0, TAU) }); } };
    switch (e.kind) {
      case 'swRise': case 'swFlap': puff(v, e.x, e.y, few ? 2 : 3, null); return true;   // (the downdraft off her wings)
      case 'swDive': case 'swFling': return true;
      case 'swTumble': puff(v, e.x, e.y, few ? 1 : 2, null); fl(e.x, e.y, few ? 1 : 3, 60); return true;
      case 'swGust': {   // the blow: a puff of dust and leaves out along it
        const a = e.a || 0;
        for (let k = 0; k < (few ? 4 : 8); k++) { const b = a + frnd(-0.5, 0.5), sp = frnd(140, 230); v.fx.push({ k: 'swLeaf', x: e.x + Math.cos(b) * 18, y: e.y + Math.sin(b) * 18, vx: Math.cos(b) * sp, vy: Math.sin(b) * sp, t: 0, life: frnd(0.5, 0.8), s: frnd(2.4, 3.6), a: frnd(0, TAU), leaf: k % 3 === 0 }); }
        return true;
      }
      case 'swFeathers': fl(e.x, e.y, few ? 3 : 6, 110); return true;   // (peppered)
      case 'swSnip': v.fx.push({ k: 'clinkfx', x: e.x, y: e.y - 24, t: 0, life: 0.16, s: 7, a: frnd(0, 1) }); fl(e.x, e.y, few ? 1 : 2, 60); return true;
      case 'swCatch': v.fx.push({ k: 'spark', x: e.x, y: e.y - 26, vx: 0, vy: -20, t: 0, life: 0.35, s: 4, col: OR }); return true;
      case 'swDrop': fl(e.x, e.y + 10, 1, 30); puff(v, e.x, e.y, 1, null); return true;
      case 'swHop': puff(v, e.x, e.y, few ? 2 : 3, null); return true;
      case 'swLand': puff(v, e.x, e.y, few ? 1 : 2, null); fl(e.x, e.y, few ? 1 : 2, 40); return true;
    }
    return false;
  },
  fx(g, F, v, p, k, dt) {
    if (p.k === 'swFeatherP') {   // a feather drifting down, rocking side to side
      p.vy += 40 * dt; p.vx *= 1 - 2 * dt;
      feather(g, p.x + Math.sin(p.t * 7 + p.a) * 3, p.y, p.a + Math.sin(p.t * 6) * 0.7, p.s, 1 - k * k);
      return true;
    }
    if (p.k === 'swLeaf') {   // a leaf or a bit of dust blown over the floor
      const al = Math.sin(clamp(k, 0, 1) * Math.PI) * 0.85;
      g.save(); g.translate(p.x, p.y); g.rotate(p.a + p.t * 9); g.globalAlpha *= al;
      if (p.leaf) { g.fillStyle = bold() ? '#9cc56a' : 'rgba(150,196,104,0.95)'; g.beginPath(); g.ellipse(0, 0, p.s, p.s * 0.5, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(90,130,60,0.6)'; g.fillRect(-p.s, -0.3, p.s * 2, 0.6); }
      else { g.fillStyle = 'rgba(236,230,220,0.8)'; g.beginPath(); g.arc(0, 0, p.s * 0.6, 0, TAU); g.fill(); }
      g.restore(); return true;
    }
    return false;
  },
  icon(g, kind, r, col) {
    const W = col || '#ffffff';
    g.fillStyle = W; g.strokeStyle = W; g.lineCap = 'round';
    switch (kind) {
      case 'swDive':   // a bird stooping: swept wings in a V pointing down-right, a streak behind
        g.beginPath(); g.moveTo(r * 0.6, r * 0.55); g.quadraticCurveTo(-r * 0.05, r * 0.05, -r * 0.7, -r * 0.2); g.quadraticCurveTo(-r * 0.05, -r * 0.05, r * 0.15, -r * 0.65); g.quadraticCurveTo(r * 0.2, r * 0.05, r * 0.6, r * 0.55); g.fill();
        g.lineWidth = r * 0.1; g.globalAlpha *= 0.6; g.beginPath(); g.moveTo(-r * 0.2, r * 0.45); g.lineTo(-r * 0.75, r * 0.15); g.stroke(); g.globalAlpha /= 0.6;
        return true;
      case 'swGust':   // three curls of wind
        g.lineWidth = r * 0.13;
        for (const [y, L] of [[-r * 0.42, 0.9], [0, 1.2], [r * 0.42, 0.75]]) { g.beginPath(); g.moveTo(-r * 0.7, y); g.lineTo(-r * 0.7 + r * L, y); g.arc(-r * 0.7 + r * L, y - r * 0.14, r * 0.14, Math.PI / 2, -Math.PI * 0.9, true); g.stroke(); }
        return true;
      case 'swClosure':   // a feather on a loop
        g.lineWidth = r * 0.1; g.globalAlpha *= 0.65; g.beginPath(); g.ellipse(0, 0, r * 0.72, r * 0.45, -0.4, 0.5, TAU - 0.2); g.stroke(); g.globalAlpha /= 0.65;
        g.save(); g.rotate(-0.4); g.beginPath(); g.moveTo(-r * 0.55, 0); g.quadraticCurveTo(-r * 0.1, -r * 0.3, r * 0.55, -r * 0.03); g.quadraticCurveTo(-r * 0.05, r * 0.22, -r * 0.55, 0); g.fill(); g.restore();
        return true;
      case 'swHop':   // a spread wing
        g.beginPath(); g.moveTo(-r * 0.7, r * 0.3); g.quadraticCurveTo(-r * 0.2, -r * 0.7, r * 0.75, -r * 0.45); g.lineTo(r * 0.45, -r * 0.15); g.lineTo(r * 0.65, -r * 0.05); g.lineTo(r * 0.3, r * 0.15); g.lineTo(r * 0.45, r * 0.3); g.quadraticCurveTo(-r * 0.1, r * 0.25, -r * 0.7, r * 0.3); g.fill();
        return true;
    }
    return false;
  },
  sound(e) {
    switch (e.kind) {
      case 'swRise': case 'swFlap': return [['swFlap', 0.7]];
      case 'swDive': return [['fDive', 0.9]];
      case 'swTumble': return [['fStep', 0.5]];
      case 'swGust': return [['swWind', 0.9]];
      case 'swFeathers': return [['fWhiff', 0.4]];
      case 'swFling': return [['fWhip', 0.6]];
      case 'swSnip': return [['fWhip', 0.5]];
      case 'swCatch': return [['swChirp', 0.6]];
      case 'swDrop': return [['fPop', 0.3]];
      case 'swHop': return [['swFlap', 0.6]];
      case 'swLand': return [['fStep', 0.4]];
    }
    return null;
  },
  sounds: {
    // wings beating: three soft airy thumps
    swFlap: ({ osc, hiss }) => (v, t) => { for (let k = 0; k < 3; k++) { hiss(t + k * 0.09, 0.07, 0.1 * v, 'bandpass', 700, 300); osc(t + k * 0.09, 120, 0.06, 'sine', 0.06 * v, -30); } },
    // a gust: a rising then falling sweep of air
    swWind: ({ hiss }) => (v, t) => { hiss(t, 0.5, 0.18 * v, 'bandpass', 500, 2400); hiss(t + 0.15, 0.4, 0.08 * v, 'highpass', 3000, 1500); },
    // a little chirp: the feather back in her wing
    swChirp: ({ osc }) => (v, t) => { osc(t, 2300, 0.05, 'sine', 0.06 * v, 900); osc(t + 0.07, 2800, 0.06, 'sine', 0.05 * v, -600); },
  },
};
