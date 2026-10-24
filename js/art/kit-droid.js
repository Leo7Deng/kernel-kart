// Kernel Kart: drawing Bugdroid's Fight moves (2026-10-24; the sim is js/kits/droid.js, the hooks js/art/kits.js).
// Clean and friendly, Android green, Classic Flat first; the tells are soft light and dust, nothing outlined.
//   Battery Beam    his antennae glow, brighter as it charges, while a faint line of light motes drifts along the floor
//                   where he points (drifting while it turns; settling still and a touch brighter just before it fires);
//                   then a soft green beam with a white core, its glow on the floor, fading quickly
//   Sideload        a little app cube (white top, green sides, one round lens) plugged into the floor: a ring of light
//                   fills on its top while it boots, then it turns its lens to you and pops soft glowing pellets; kicked,
//                   it tips over and fades
//   Factory Reset   static: specks of light drifting in from the reach of the wave while he crouches, sparks at his
//                   antennae; then a ring of dust rolling out to that reach; rebooting, a little spinner of dots over him
//   Airplane Mode   see-through, arms out like wings
// His battery: two small cells by his feet, filling as they charge. Shakes: only the wave flooring someone, softly.
import { TAU, clamp, frnd } from '../core.js';
import { bold } from '../look.js';
import { puff } from '../draw-fight.js';
import { animBase } from './kits.js';

const ID = 'droid';
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const hsh = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const A3 = a => clamp(a, 0, 1).toFixed(3);
const G = '61,220,132', GL = '200,255,222', GD = '22,110,64';
const ANT = 52;   // (how high his antennae's tips are, world units)
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }
function glow(g, x, y, r, rgb, a) {
  if (a <= 0.005 || r <= 0.5) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${rgb},${A3(a)})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; circle(g, x, y, r); g.fill();
}

// ---------------------------------------------------------------- Battery Beam
// the line of light motes on the floor (aim: drifting outward; lock: still, a touch brighter)
function motes(g, F, o, t) {
  if (o.ph !== 'aim' && o.ph !== 'lock') return;
  const f = F.f[o.owner], lock = o.ph === 'lock', a = clamp(o.t / 0.15, 0, 1) * (lock ? 0.85 : 0.45 + 0.25 * (o.ch || 0));
  const c = Math.cos(o.a), s = Math.sin(o.a), r0 = (f ? f.r : 17) + 6, L = o.len, gap = 15, drift = lock ? 0 : (t * 40) % gap;
  // a very faint band under the motes, so it reads on a busy floor
  const gr = g.createLinearGradient(o.x + c * r0, o.y + s * r0, o.x + c * L, o.y + s * L);
  gr.addColorStop(0, `rgba(${GD},${A3(0.1 * a)})`); gr.addColorStop(1, `rgba(${GD},0)`);
  g.save(); g.lineCap = 'round'; g.strokeStyle = gr; g.lineWidth = o.w * 1.6; g.beginPath(); g.moveTo(o.x + c * r0, o.y + s * r0); g.lineTo(o.x + c * L, o.y + s * L); g.stroke(); g.restore();
  for (let d = r0 + drift; d < L; d += gap) {
    const q = (d - r0) / Math.max(1, L - r0), al = a * (1 - q * 0.6) * (0.7 + 0.3 * Math.sin(t * 9 + d * 0.3)), x = o.x + c * d, y = o.y + s * d;
    glow(g, x, y, lock ? 5 : 4, G, al * 0.5);
    g.fillStyle = `rgba(${GL},${A3(al)})`; circle(g, x, y, lock ? 1.6 : 1.2); g.fill();
  }
}
// the beam itself, at his chest's height, its glow on the floor
function beam(g, F, v, o) {
  if (o.ph !== 'fire' && o.ph !== 'fade') return;
  const f = F.f[o.owner], age = o.t - (o.ft ?? o.t), fade = o.ph === 'fade' ? clamp((o.life - o.t) / 0.3, 0, 1) : 1, a = fade * clamp(age / 0.03, 0, 1);
  if (a <= 0.01) return;
  const c = Math.cos(o.a), s = Math.sin(o.a), r0 = (f ? f.r : 17) - 2, Z = 24, x0 = o.x + c * r0, y0 = o.y + s * r0, x1 = o.x + c * o.len, y1 = o.y + s * o.len, w = 1 + (o.ch || 0) * 0.6;
  g.save(); g.lineCap = 'round';
  g.strokeStyle = `rgba(${G},${A3(0.14 * a)})`; g.lineWidth = 16 * w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();   // (its light on the floor)
  for (const [lw, col, al] of [[13 * w, G, 0.22], [6.5 * w, G, 0.55], [2.6 * w, '245,255,248', 0.95]]) { g.strokeStyle = `rgba(${col},${A3(al * a)})`; g.lineWidth = lw * (0.7 + 0.3 * fade); g.beginPath(); g.moveTo(x0, y0 - Z); g.lineTo(x1, y1 - Z); g.stroke(); }
  glow(g, x1, y1 - Z, 12 * w, GL, 0.6 * a);
  g.restore();
}

// ---------------------------------------------------------------- Sideload
function appCube(g, F, v, o) {
  const mv = F.f[o.owner].stats.moves.move2, BD = bold();
  let al = 1, tip = 0, drop = 0;
  if (o.t < 0.15) drop = (1 - o.t / 0.15) * 14;
  if (o.ph === 'off') al = clamp((o.life - o.t) / 0.4, 0, 1);
  if (o.ph === 'broke') { const u = clamp(1 - (o.life - o.t) / 0.45, 0, 1); tip = ease(u * 2) * 1.2; al = 1 - clamp((u - 0.4) / 0.6, 0, 1); }
  const s = 9;
  g.save(); g.globalAlpha *= al;
  g.fillStyle = 'rgba(20,16,42,0.22)'; g.beginPath(); g.ellipse(o.x + 1, o.y + 1, s * 1.15, s * 0.5, 0, 0, TAU); g.fill();
  g.translate(o.x, o.y - drop); if (tip) { const dir = Math.cos(o.ka || 0) >= 0 ? 1 : -1; g.translate(dir * s, 0); g.rotate(dir * tip); g.translate(-dir * s, 0); }
  // a little isometric cube: two green sides, a white top
  const h = s * 1.5, k = s * 0.55;
  g.fillStyle = BD ? '#2bb46c' : '#33c477'; g.beginPath(); g.moveTo(-s, -h); g.lineTo(0, -h + k); g.lineTo(0, k); g.lineTo(-s, 0); g.closePath(); g.fill();   // (left side)
  g.fillStyle = BD ? '#3ddc84' : '#45e08c'; g.beginPath(); g.moveTo(s, -h); g.lineTo(0, -h + k); g.lineTo(0, k); g.lineTo(s, 0); g.closePath(); g.fill();   // (right side)
  g.fillStyle = '#f4fbf6'; g.beginPath(); g.moveTo(0, -h - k); g.lineTo(s, -h); g.lineTo(0, -h + k); g.lineTo(-s, -h); g.closePath(); g.fill();   // (top)
  // the boot: a ring of light filling on its top
  const top = -h;
  if (o.ph === 'boot') { const u = clamp(o.t / mv.boot, 0, 1); g.strokeStyle = `rgba(${G},0.9)`; g.lineWidth = 1.6; g.beginPath(); g.ellipse(0, top, s * 0.5, s * 0.28, 0, -Math.PI / 2, -Math.PI / 2 + TAU * u); g.stroke(); }
  else if (o.ph === 'live') { g.fillStyle = `rgba(${G},0.85)`; g.beginPath(); g.ellipse(0, top, s * 0.3, s * 0.17, 0, 0, TAU); g.fill(); }
  // the lens: on the side it faces (it turns round the cube with its aim)
  if (o.ph === 'live' || o.ph === 'boot') {
    const lx = Math.cos(o.a) * s * 0.72, ly = -h * 0.5 + Math.sin(o.a) * k * 0.7, front = Math.sin(o.a) > -0.35, pulse = o.ph === 'live' ? 0.6 + 0.4 * Math.max(0, 1 - ((o.nx - o.t) / mv.every)) : 0.3;
    if (front) { g.fillStyle = '#1d3b2c'; circle(g, lx, ly, 2.8); g.fill(); g.fillStyle = `rgba(${GL},${A3(pulse)})`; circle(g, lx, ly, 1.6); g.fill(); glow(g, lx, ly, 6, G, 0.35 * pulse); }
  }
  g.restore();
}
function pellet(g, F, v, o) {
  const z = o.z || 12;
  g.fillStyle = 'rgba(20,16,42,0.16)'; g.beginPath(); g.ellipse(o.x, o.y + 1, 4, 1.8, 0, 0, TAU); g.fill();
  glow(g, o.x, o.y - z, 9, G, 0.45);
  g.fillStyle = `rgba(${GL},0.95)`; circle(g, o.x, o.y - z, 3.2); g.fill();
  g.fillStyle = '#ffffff'; circle(g, o.x - 0.8, o.y - z - 0.8, 1.2); g.fill();
}

// ---------------------------------------------------------------- Factory Reset
function staticIn(g, f, v) {   // specks drifting in from the wave's reach, and its reach a very faint tint
  const R = f.stats.moves.move3.R, u = clamp((f.pht || 0) / Math.max(0.1, f.dur || 0.62), 0, 1);
  const gr = g.createRadialGradient(f.x, f.y, R * 0.6, f.x, f.y, R);
  gr.addColorStop(0, `rgba(${G},0)`); gr.addColorStop(0.85, `rgba(${G},${A3(0.07 + 0.07 * u)})`); gr.addColorStop(1, `rgba(${G},0)`);
  g.fillStyle = gr; g.beginPath(); g.ellipse(f.x, f.y, R, R * 0.92, 0, 0, TAU); g.fill();
  for (let k = 0; k < 22; k++) {
    const q = (v.t * (1.1 + 0.5 * u) + hsh(k)) % 1, an = hsh(k * 7.3) * TAU + q * 0.4, r = R * (1 - 0.75 * q), al = Math.sin(q * Math.PI) * (0.45 + 0.4 * u);
    g.fillStyle = `rgba(${GL},${A3(al)})`; circle(g, f.x + Math.cos(an) * r, f.y + Math.sin(an) * r * 0.92, 1.9); g.fill();
  }
}
function battery(g, F, v, f) {   // two small cells by his feet
  const B = f.stats.battery; if (!B || f.state === 'ko' || f.state === 'down') return;
  for (let k = 0; k < B.max; k++) {
    const x = (k - (B.max - 1) / 2) * 9 - 3, y = 14, q = clamp((f.bat || 0) - k, 0, 1);
    g.fillStyle = 'rgba(20,24,30,0.45)'; g.beginPath(); g.roundRect(x - 0.6, y - 0.6, 7.2, 4.2, 1.2); g.fill();
    g.fillStyle = 'rgba(20,24,30,0.45)'; g.fillRect(x + 6.6, y + 0.9, 1.2, 1.2);
    if (q > 0) { g.fillStyle = q >= 1 ? `rgba(${G},0.95)` : `rgba(${G},0.45)`; g.beginPath(); g.roundRect(x + 0.4, y + 0.4, 5.2 * q, 2.2, 0.8); g.fill(); }
  }
}

export default {
  id: ID,
  anim(F, v, f) {
    const A = animBase(), k = f.pht || 0, t = v.t + f.i, sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
    switch (f.ph) {
      case 'charge': sq(0.04 * ease(k / 0.2)); A.wx = Math.sin(k * 50) * 0.3 * clamp(k / 0.5, 0, 1); break;   // (a hum, building)
      case 'lock': sq(0.05); break;
      case 'beam': sq(-0.05 * Math.exp(-k * 12)); A.fwd = -3 * Math.exp(-k * 8); break;   // (a little kick back)
      case 'cool': break;
      case 'plug': sq(0.06 * ease(k / 0.15)); break;
      case 'plugged': sq(-0.04 * Math.exp(-k * 10)); break;
      case 'crouch': { const u = clamp(k / Math.max(0.1, f.dur || 0.62), 0, 1); sq(0.06 + 0.06 * u); A.wx = Math.sin(k * 80) * 0.8 * u; break; }   // (lower and lower, shaking)
      case 'emp': sq(-0.12 * Math.exp(-k * 9)); A.hop = 5 * Math.sin(clamp(k / 0.2, 0, 1) * Math.PI); break;
      case 'reboot': A.lean = Math.sin(t * 2) * 0.04; A.mood = 'dizzy'; break;
      case 'airplane': A.alpha = 0.45; A.hop = 2 + Math.sin(k * 8) * 1.5; A.lean = Math.sin(k * 6) * 0.06; break;   // (see-through, gliding)
      case 'online': A.alpha = 0.45 + 0.55 * clamp(k / 0.12, 0, 1); break;
      default: return null;
    }
    return A;
  },
  ground(g, F, v, o) { if (o.kind === 'drbeam') motes(g, F, o, v.t); },
  things(F, v, g, o, out) {
    if (o.kind === 'drbeam' && (o.ph === 'fire' || o.ph === 'fade')) out.push({ y: o.y + Math.max(0, Math.sin(o.a) * o.len) + 1, d: () => beam(g, F, v, o) });
    else if (o.kind === 'drcube') out.push({ y: o.y, d: () => appCube(g, F, v, o) });
    else if (o.kind === 'drpel') out.push({ y: o.y, d: () => pellet(g, F, v, o) });
  },
  behind(g, F, v, f) {
    if (f.id === ID && f.ph === 'crouch') staticIn(g, f, v);
    return null;
  },
  over(g, F, v, f) {
    if (f.id !== ID) return;
    if (f.ph === 'charge' || f.ph === 'lock') {   // the antennae glowing, brighter as it charges
      const ch = f.ph === 'lock' ? 1 : clamp((f.pht || 0) / 1.2, 0, 1), fl = 0.8 + 0.2 * Math.sin(v.t * 30);
      for (const s of [-1, 1]) glow(g, s * 6, -ANT, 5 + 6 * ch, GL, (0.35 + 0.5 * ch) * fl);
    } else if (f.ph === 'crouch') {   // sparks jumping at the antennae
      for (const s of [-1, 1]) { glow(g, s * 6, -ANT + 6, 7, GL, 0.5 + 0.3 * Math.sin(v.t * 40 + s)); if (Math.sin(v.t * 23 + s * 2) > 0.6) { g.strokeStyle = `rgba(${GL},0.9)`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(s * 6, -ANT + 6); g.lineTo(s * 10, -ANT + 1); g.lineTo(s * 8, -ANT - 3); g.stroke(); } }
    } else if (f.ph === 'reboot') {   // a little spinner of dots over his head
      for (let k = 0; k < 8; k++) { const an = k / 8 * TAU, on = ((Math.floor(v.t * 12) - k) % 8 + 8) % 8; g.fillStyle = `rgba(${GL},${A3(0.85 - on * 0.1)})`; circle(g, Math.cos(an) * 6, -ANT - 12 + Math.sin(an) * 6, 1.3); g.fill(); }
    }
    battery(g, F, v, f);
  },
  event(v, F, e, few) {
    switch (e.kind) {
      case 'drBeam': for (let k = 0; k < (few ? 2 : 5); k++) { const a = frnd(0, TAU), sp = frnd(60, 140); v.fx.push({ k: 'spark2', x: e.x2, y: e.y2 - 24, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - 20, t: 0, life: frnd(0.15, 0.3), s: frnd(4, 7) }); } return true;
      case 'drCube': puff(v, e.x, e.y, few ? 1 : 3, null); return true;
      case 'drPew': return true;
      case 'drPop': for (let k = 0; k < (few ? 1 : 3); k++) { const a = frnd(0, TAU), sp = frnd(40, 90); v.fx.push({ k: 'spark2', x: e.x, y: e.y - 12, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, t: 0, life: 0.18, s: 4 }); } return true;
      case 'drCubeOff': return true;
      case 'drCubeBreak': puff(v, e.x, e.y, few ? 2 : 3, null); return true;
      case 'drEmp': {
        v.fx.push({ k: 'dring', x: e.x, y: e.y, t: 0, life: 0.45, s: e.R || 86, id: frnd(0, 9) });
        for (let k = 0; k < (few ? 4 : 9); k++) { const a = frnd(0, TAU), sp = frnd(90, 170); v.fx.push({ k: 'spark2', x: e.x + Math.cos(a) * 10, y: e.y - 26, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - 20, t: 0, life: frnd(0.2, 0.35), s: frnd(5, 8) }); }
        if (e.hit) v.shake = Math.max(v.shake, 0.22);
        return true;
      }
      case 'drReboot': return true;
      case 'drAir': case 'drOn': for (let k = 0; k < (few ? 2 : 4); k++) { const a = frnd(0, TAU); v.fx.push({ k: 'mote', x: e.x + Math.cos(a) * 14, y: e.y - 20 + Math.sin(a) * 10, vx: 0, vy: -frnd(20, 40), t: 0, life: frnd(0.4, 0.6), s: frnd(1.4, 2.2), col: GL }); } return true;
    }
    return false;
  },
  icon(g, kind, r, col) {
    const W = col || '#ffffff';
    g.fillStyle = W; g.strokeStyle = W; g.lineCap = 'round'; g.lineJoin = 'round';
    switch (kind) {
      case 'drBeam':   // a little dome head with antennae, a beam out of it
        g.beginPath(); g.arc(-r * 0.35, r * 0.15, r * 0.42, Math.PI, 0); g.closePath(); g.fill();
        g.lineWidth = r * 0.09; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(-r * 0.35 + s * r * 0.18, -r * 0.18); g.lineTo(-r * 0.35 + s * r * 0.32, -r * 0.45); g.stroke(); }
        g.lineWidth = r * 0.16; g.beginPath(); g.moveTo(r * 0.12, -r * 0.02); g.lineTo(r * 0.9, -r * 0.02); g.stroke();
        return true;
      case 'drCube':   // a little cube
        g.beginPath(); g.moveTo(0, -r * 0.75); g.lineTo(r * 0.68, -r * 0.4); g.lineTo(0, -r * 0.05); g.lineTo(-r * 0.68, -r * 0.4); g.closePath(); g.fill();
        g.globalAlpha *= 0.7; g.beginPath(); g.moveTo(-r * 0.68, -r * 0.3); g.lineTo(-r * 0.05, r * 0.05); g.lineTo(-r * 0.05, r * 0.8); g.lineTo(-r * 0.68, r * 0.45); g.closePath(); g.fill(); g.globalAlpha /= 0.7;
        g.globalAlpha *= 0.85; g.beginPath(); g.moveTo(r * 0.68, -r * 0.3); g.lineTo(r * 0.05, r * 0.05); g.lineTo(r * 0.05, r * 0.8); g.lineTo(r * 0.68, r * 0.45); g.closePath(); g.fill(); g.globalAlpha /= 0.85;
        return true;
      case 'drReset':   // a ring rolling out round a dot
        g.lineWidth = r * 0.14; g.beginPath(); g.arc(0, 0, r * 0.72, 0, TAU); g.stroke();
        g.globalAlpha *= 0.5; g.beginPath(); g.arc(0, 0, r * 0.46, 0, TAU); g.stroke(); g.globalAlpha /= 0.5;
        circle(g, 0, 0, r * 0.2); g.fill();
        return true;
      case 'drAir':   // a little airplane
        g.beginPath(); g.ellipse(0, 0, r * 0.85, r * 0.13, -0.6, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(-r * 0.05, -r * 0.02); g.lineTo(-r * 0.5, -r * 0.62); g.lineTo(-r * 0.25, -r * 0.65); g.lineTo(r * 0.25, -r * 0.1); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(r * 0.05, r * 0.02); g.lineTo(r * 0.5, r * 0.62); g.lineTo(r * 0.25, r * 0.65); g.lineTo(-r * 0.25, r * 0.1); g.closePath(); g.fill();
        return true;
    }
    return false;
  },
  sound(e) {
    switch (e.kind) {
      case 'drBeam': return [['drBeam', 0.6 + 0.4 * (e.ch || 0)]];
      case 'drCube': return [['fCrate', 0.35]];
      case 'drPew': return [['drPew', 0.5]];
      case 'drPop': return e.hit ? [['fJab', 0.5]] : null;
      case 'drCubeOff': return [['fWhiff', 0.25]];
      case 'drCubeBreak': return [['fBlock', 0.45]];
      case 'drEmp': return e.hit ? [['fJolt', 0.8], ['fHeavy', 0.4]] : [['fZap', 0.7]];
      case 'drReboot': return [['drBoot', 0.45]];
      case 'drAir': return [['fBlink', 0.45]];
      case 'drOn': return [['drBoot', 0.3]];
    }
    return null;
  },
  sounds: {
    drBeam: ({ osc, hiss }) => (v, t) => { osc(t, 880, 0.22, 'sawtooth', 0.05 * v, -500); osc(t, 1320, 0.18, 'sine', 0.06 * v, -300); hiss(t, 0.2, 0.05 * v, 'bandpass', 3000, 800); },   // a soft zing
    drPew: ({ osc }) => (v, t) => { osc(t, 1200, 0.06, 'square', 0.035 * v, -700); },   // a little pew
    drBoot: ({ osc }) => (v, t) => { [523, 659, 784].forEach((f, k) => osc(t + k * 0.07, f, 0.08, 'triangle', 0.05 * v)); },   // a start-up chime
  },
};
