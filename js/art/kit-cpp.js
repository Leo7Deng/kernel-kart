// Kernel Kart: drawing Cpp's (Keith the rat's) Fight moves (2026-10-24; the sim is js/kits/cpp.js, the hooks
// js/art/kits.js). Scruffy and a bit grubby but cute, Classic Flat first; the tells are part of the floor.
//   Segfault      a squat little tin mine with a C++-blue band and a tiny lamp, flicked out in a hop; arming, it settles
//                 and a soft soot stain spreads round it to the reach of its trigger, its lamp lighting a warm amber;
//                 clicked, it jumps, the lamp blinks fast and the stain darkens out to the blast's reach; then a puff of
//                 smoke and a ring of dust
//   Memory Leak   a trail of grey-green sludge: soft glossy puddles that ooze together, little bubbles rising and
//                 popping, fading out; whoever's walking in it gets green drips round their feet
//   Gnaw Frenzy   each chomp's tell: soft bite marks on the floor where he'll land (two arcs of little tooth dents, a pale
//                 lip over a soft dark dent), darkening as he rears; then crumbs flicked up as the jaws snap
//   Play Dead     a soft green-grey stink cloud swirling slowly round him, a few wavy wisps rising off it, and Keith
//                 on his back, legs up and tongue out, twitching
// Shakes: only a mine going off under someone, softly.
import { TAU, clamp, frnd } from '../core.js';
import { bold } from '../look.js';
import { puff } from '../draw-fight.js';
import { animBase } from './kits.js';

const ID = 'cpp';
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const hsh = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const A3 = a => clamp(a, 0, 1).toFixed(3);
const SOOT = '46,38,34', GOO = '128,150,92', GOOD = '74,92,52', GOOL = '214,232,170', STINK = '176,200,120', WISP = '140,168,96';
const TIN = '#9aa3ad', TIND = '#6c7480', CPP_BLUE = '#00599c', LAMP = '255,170,60';
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }

// ---------------------------------------------------------------- Segfault
// the soot stain round a mine: the trigger's reach once it arms, the blast's once it clicks
function stain(g, F, o) {
  const mv = F.f[o.owner].stats.moves.move1;
  let r = 0, a = 0;
  if (o.ph === 'arm') { const u = clamp(o.t / mv.arm, 0, 1); r = o.trig * ease(u) * 0.8; a = 0.12 * u; }
  else if (o.ph === 'live') { r = o.trig + 2 + Math.sin(o.t * 3) * 1; a = 0.16 + 0.03 * Math.sin(o.t * 3); }
  else if (o.ph === 'click') { const u = clamp((o.t - o.ct) / mv.fuse, 0, 1); r = o.trig + (o.R - o.trig) * ease(u); a = 0.2 + 0.14 * u; }
  else if (o.ph === 'boom') { const u = clamp((o.life - o.t) / 0.45, 0, 1); r = o.R * 0.8; a = 0.28 * u; }   // (scorched, fading)
  else if (o.ph === 'fizz' || o.ph === 'dud') { r = o.trig * 0.6; a = 0.1 * clamp((o.life - o.t) / 0.3, 0, 1); }
  if (r < 2 || a <= 0.005) return;
  const gr = g.createRadialGradient(o.x, o.y, 0, o.x, o.y, r);
  gr.addColorStop(0, `rgba(${SOOT},${A3(a * 1.4)})`); gr.addColorStop(0.65, `rgba(${SOOT},${A3(a)})`); gr.addColorStop(1, `rgba(${SOOT},0)`);
  g.fillStyle = gr; g.beginPath(); g.ellipse(o.x, o.y, r, r * 0.9, 0, 0, TAU); g.fill();
  // a few soot flecks scattered in it (uneven, so it reads as a stain, not a disc)
  for (let k = 0; k < 7; k++) { const an = hsh(o.id * 5 + k) * TAU, rr = r * (0.35 + 0.6 * hsh(o.id + k * 3)); g.fillStyle = `rgba(${SOOT},${A3(a * 1.6)})`; circle(g, o.x + Math.cos(an) * rr, o.y + Math.sin(an) * rr * 0.9, 0.5 + hsh(k + o.id) * 0.7); g.fill(); }
}
// the tin: a squat cylinder, a blue band, a rivet ring on its lid, the little lamp
function tin(g, F, v, o) {
  if (o.ph === 'boom') return;
  const mv = F.f[o.owner].stats.moves.move1, BD = bold();
  let x = o.x, y = o.y, z = 0, s = 1, al = 1;
  if (o.ph === 'arm' && o.t < 0.2) { const u = o.t / 0.2; x = (o.fx ?? o.x) + (o.x - (o.fx ?? o.x)) * u; y = (o.fy ?? o.y) + (o.y - (o.fy ?? o.y)) * u; z = Math.sin(u * Math.PI) * 18; }   // (flicked out in a hop)
  else if (o.ph === 'arm' && o.t < 0.32) z = Math.sin((o.t - 0.2) / 0.12 * Math.PI) * 3;
  if (o.ph === 'click') z = Math.abs(Math.sin((o.t - o.ct) * 30)) * 2.5;
  if (o.ph === 'dud' || o.ph === 'fizz') { const u = clamp((o.life - o.t) / 0.35, 0, 1); al = u; s = 0.8 + 0.2 * u; }
  g.save(); g.globalAlpha *= al;
  g.fillStyle = `rgba(20,16,42,${BD ? 0.22 : 0.26})`; g.beginPath(); g.ellipse(x + 1, y + 1, 8 * s, 3.4 * s, 0, 0, TAU); g.fill();
  g.translate(x, y - z); g.scale(s, s);
  const w = 7.5, h = 5;
  g.fillStyle = TIND; g.beginPath(); g.ellipse(0, 0, w, w * 0.42, 0, 0, Math.PI); g.lineTo(-w, -h); g.ellipse(0, -h, w, w * 0.42, 0, Math.PI, 0, true); g.closePath(); g.fill();   // (the side)
  g.fillStyle = CPP_BLUE; g.fillRect(-w, -h * 0.62, w * 2, h * 0.34);
  g.fillStyle = BD ? '#b4bcc6' : TIN; g.beginPath(); g.ellipse(0, -h, w, w * 0.42, 0, 0, TAU); g.fill();   // (the lid)
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(-2, -h - 0.8, w * 0.45, w * 0.14, -0.2, 0, TAU); g.fill();
  for (let k = 0; k < 6; k++) { const an = k / 6 * TAU; g.fillStyle = 'rgba(70,76,88,0.6)'; circle(g, Math.cos(an) * w * 0.72, -h + Math.sin(an) * w * 0.3, 0.6); g.fill(); }
  // the lamp: dark while arming, a soft amber glow once live, blinking fast on the click
  const live = o.ph === 'live' || o.ph === 'click', blink = o.ph === 'click' ? (Math.sin((o.t - o.ct) * 60) > 0 ? 1 : 0.35) : 0.75 + 0.25 * Math.sin(o.t * 4);
  if (live) { const gr = g.createRadialGradient(0, -h - 2.5, 0, 0, -h - 2.5, 7); gr.addColorStop(0, `rgba(${LAMP},${A3(0.45 * blink)})`); gr.addColorStop(1, `rgba(${LAMP},0)`); g.fillStyle = gr; circle(g, 0, -h - 2.5, 7); g.fill(); }
  g.fillStyle = live ? `rgba(${LAMP},${A3(0.6 + 0.4 * blink)})` : '#5b5f66'; circle(g, 0, -h - 2, 1.9); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.6)'; circle(g, -0.6, -h - 2.6, 0.6); g.fill();
  g.restore();
}

// ---------------------------------------------------------------- Memory Leak
function sludge(g, F, o, t) {
  const mv = F.f[o.owner].stats.moves.move2, BD = bold();
  const live = o.pts.filter(p => o.t - p[2] < mv.goo);
  if (!live.length) return;
  // each blob its own size and a little off the line (seeded by where it was laid), drying up (shrinking) as it ages;
  // drawn opaque in layers (a dark rim, the goo, a few glints) so the blobs run together into one uneven trail
  const blobs = live.map(([x, y, at]) => {
    const h = hsh(x * 0.37 + y * 0.71), h2 = hsh(x * 0.11 - y * 0.29), age = o.t - at, dry = clamp((mv.goo - age) / 1.2, 0, 1), wet = clamp(age / 0.12, 0, 1);
    return { x: x + (h2 - 0.5) * 7, y: y + (h - 0.5) * 5, r: o.r * (0.62 + 0.55 * h) * (0.35 + 0.65 * dry) * (0.6 + 0.4 * wet), h, a: Math.min(1, dry * 2.5) };
  });
  g.save();
  for (const b of blobs) { g.globalAlpha = b.a * 0.55; g.fillStyle = `rgb(${GOOD})`; g.beginPath(); g.ellipse(b.x + 0.6, b.y + 1.4, b.r * 1.08, b.r * 0.8, b.h * 2, 0, TAU); g.fill(); }
  for (const b of blobs) { g.globalAlpha = b.a * (BD ? 0.9 : 0.82); g.fillStyle = `rgb(${GOO})`; g.beginPath(); g.ellipse(b.x, b.y, b.r, b.r * 0.72, b.h * 2, 0, TAU); g.fill(); }
  blobs.forEach((b, k) => {
    if (k % 3 === 1) { g.globalAlpha = b.a * 0.5; g.fillStyle = `rgb(${GOOL})`; g.beginPath(); g.ellipse(b.x - b.r * 0.3, b.y - b.r * 0.22, b.r * 0.26, b.r * 0.1, -0.3, 0, TAU); g.fill(); }
    if (k % 4 === 2) {   // a bubble rising in it now and then and popping
      const ph = (t * 0.7 + b.h * 3) % 1;
      if (ph < 0.8) { g.globalAlpha = b.a * 0.6 * (1 - ph); g.strokeStyle = `rgb(${GOOL})`; g.lineWidth = 0.8; circle(g, b.x + (b.h - 0.5) * b.r * 0.6, b.y, 1 + 1.4 * ph); g.stroke(); }
    }
  });
  g.restore();
}
// green drips round the feet of whoever's walking in the sludge
function drips(g, f, v) {
  for (let k = 0; k < 4; k++) {
    const an = k / 4 * TAU + v.t * 2, ph = (v.t * 2.2 + k * 0.27) % 1, x = Math.cos(an) * 12, y = Math.sin(an) * 4 + 1 - Math.sin(ph * Math.PI) * 5;
    g.fillStyle = `rgba(${GOO},${A3(0.8 * (1 - ph))})`; g.beginPath(); g.ellipse(x, y, 1.8, 2.3, 0, 0, TAU); g.fill();
  }
}

// ---------------------------------------------------------------- Gnaw Frenzy
// the bite marks where a chomp lands: two facing arcs of little tooth dents, soft, darkening while he rears
function biteMarks(g, F, o, t) {
  const mv = F.f[o.owner].stats.moves.move3, snap = o.ph === 'snap';
  const u = snap ? 1 : clamp(o.t / (o.k ? mv.rear : mv.startup), 0, 1), a = snap ? clamp((o.life - o.t) / 0.3, 0, 1) : 0.35 + 0.65 * ease(u);
  const c = Math.cos(o.a), s = Math.sin(o.a), R = 12 + 2 * (snap ? 1 : u);
  g.save(); g.translate(o.x, o.y);
  // a soft shadow of the jaws first
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.5);
  gr.addColorStop(0, `rgba(${SOOT},${A3(0.14 * a)})`); gr.addColorStop(1, `rgba(${SOOT},0)`);
  g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, R * 1.5, R * 1.25, 0, 0, TAU); g.fill();
  for (const side of [-1, 1]) for (let k = 0; k < 5; k++) {
    const q = (k - 2) / 2, an = o.a + side * (Math.PI / 2) + q * 0.9 * -side, x = Math.cos(an) * R * 0.9 + c * side * -2, y = (Math.sin(an) * R * 0.9 + s * side * -2) * 0.9;
    const tw = k === 2 ? 2.4 : 1.8;
    g.fillStyle = `rgba(255,248,232,${A3(0.45 * a)})`; g.beginPath(); g.ellipse(x - 0.6, y - 0.7, tw, tw * 0.62, an, 0, TAU); g.fill();   // (the pale lip)
    g.fillStyle = `rgba(${SOOT},${A3(0.5 * a)})`; g.beginPath(); g.ellipse(x + 0.3, y + 0.3, tw * 0.8, tw * 0.48, an, 0, TAU); g.fill();   // (the dent)
  }
  g.restore();
}

// ---------------------------------------------------------------- Play Dead
function stinkCloud(g, F, o, t) {
  const grow = ease(o.t / 0.3), fade = clamp((o.life - o.t) / 0.5, 0, 1), a = grow * fade;
  if (a <= 0.01) return;
  for (let k = 0; k < 7; k++) {
    const an = k / 7 * TAU + t * 0.5 + o.id, rr = o.r * (0.35 + 0.3 * hsh(k + o.id)) * grow, x = o.x + Math.cos(an) * rr, y = o.y + Math.sin(an) * rr * 0.8, br = o.r * (0.42 + 0.12 * hsh(k * 3 + o.id)) * grow;
    const gr = g.createRadialGradient(x, y, 0, x, y, br);
    gr.addColorStop(0, `rgba(${STINK},${A3(0.17 * a)})`); gr.addColorStop(1, `rgba(${STINK},0)`);
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, br, br * 0.8, 0, 0, TAU); g.fill();
  }
}
function wisps(g, F, v, o) {   // wavy wisps of stink rising off the cloud
  const fade = clamp((o.life - o.t) / 0.5, 0, 1) * ease(o.t / 0.3);
  g.save(); g.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    const ph = (v.t * 0.7 + k / 4) % 1, an = hsh(k + o.id) * TAU, x0 = o.x + Math.cos(an) * o.r * 0.55, y0 = o.y + Math.sin(an) * o.r * 0.4, rise = ph * 46;
    g.strokeStyle = `rgba(${WISP},${A3(0.6 * fade * Math.sin(ph * Math.PI))})`; g.lineWidth = 2.2;
    g.beginPath(); for (let j = 0; j <= 6; j++) { const q = j / 6, x = x0 + Math.sin(q * 5 + v.t * 4 + k) * 3.5, y = y0 - rise - q * 16; j ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
  }
  g.restore();
}

export default {
  id: ID,
  anim(F, v, f) {
    const A = animBase(), k = f.pht || 0, t = v.t + f.i, sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
    switch (f.ph) {
      case 'fiddle': sq(0.08 * ease(k / 0.12)); A.wx = Math.sin(k * 38) * 0.7; break;   // (crouched over it, fiddling)
      case 'flick': sq(-0.06 * Math.exp(-k * 10)); A.fwd = 2; break;
      case 'shudder': sq(0.05); A.wx = Math.sin(k * 70) * 1.3; break;   // (a shiver: something's leaking)
      case 'leak': A.hop = Math.abs(Math.sin(k * 26)) * 2.6; A.lean = Math.sin(k * 26) * 0.05; sq(-0.03); break;   // (scurrying)
      case 'leakend': sq(0.04 + 0.03 * Math.sin(k * 16)); break;
      case 'rear': { const r = f.state === 'wind' ? f.dur || 0.36 : f.stats.moves.move3.rear; sq(0.1 * ease(k / (r * 0.6))); A.fwd = -3 * ease(k / r); A.wx = k > r * 0.7 ? Math.sin(k * 60) * 0.5 : 0; break; }   // (rearing back, a tremble at the lock)
      case 'chomp': sq(-0.12 * (1 - clamp(k / 0.1, 0, 1)) - 0.02); A.fwd = 4 * ease(k / 0.06); break;
      case 'chew': A.hop = Math.abs(Math.sin(k * 20)) * 1.2 * (1 - clamp(k / 0.3, 0, 1)); break;
      case 'pant': sq(0.05 + 0.04 * Math.sin(t * 14)); A.mood = 'dizzy'; break;   // (winded: heaving)
      case 'dead': {   // (a flop, then twitching; lying across the screen, not along it, so he reads as lying down)
        A.hop = k < 0.12 ? Math.sin(k / 0.12 * Math.PI) * 5 : 0; A.wx = k > 0.2 ? Math.sin(k * 30) * 0.4 : 0; A.mood = 'blink';
        A.spin = (Math.cos(f.face) >= 0 ? 0 : Math.PI) - (f.face + 0.35 * Math.sin(Math.PI / 2 - f.face));
        break;
      }
      case 'scramble': { const u = clamp(k / 0.3, 0, 1); A.hop = 7 * Math.sin(u * Math.PI); sq(-0.06 * (1 - u)); break; }
      default: return null;
    }
    return A;
  },
  ground(g, F, v, o) {
    if (o.kind === 'cpmine') stain(g, F, o);
    else if (o.kind === 'cpleak') sludge(g, F, o, v.t);
    else if (o.kind === 'cpbite') biteMarks(g, F, o, v.t);
    else if (o.kind === 'cpstink') stinkCloud(g, F, o, v.t);
  },
  things(F, v, g, o, out) {
    if (o.kind === 'cpmine') out.push({ y: o.y, d: () => tin(g, F, v, o) });
    else if (o.kind === 'cpstink') out.push({ y: o.y + o.r * 0.5, d: () => wisps(g, F, v, o) });
  },
  behind(g, F, v, f) {   // lying on his back: a long shadow across under him
    if (f.id === ID && f.ph === 'dead') { g.fillStyle = `rgba(20,16,42,${bold() ? 0.2 : 0.24})`; g.beginPath(); g.ellipse(f.x + 2, f.y + 2, 30, 9, 0, 0, TAU); g.fill(); }
    return null;
  },
  over(g, F, v, f) {
    for (const o of F.objs) if (o.kind === 'cpleak' && o.on && o.owner !== f.i && F.f[o.owner] && F.f[o.owner].id === ID) { drips(g, f, v); break; }
    if (f.id === ID && f.ph === 'pant') {   // (a bead of sweat flying off now and then)
      const ph = (v.t * 1.6) % 1; g.fillStyle = `rgba(190,225,255,${A3(0.8 * (1 - ph))})`; g.beginPath(); g.ellipse(10 + ph * 8, -48 + ph * 10, 1.6, 2.4, 0.3, 0, TAU); g.fill();
    }
  },
  event(v, F, e, few) {
    switch (e.kind) {
      case 'cpFlick': puff(v, e.x0 ?? e.x, e.y0 ?? e.y, 1, null); return true;
      case 'cpArm': v.fx.push({ k: 'glint', x: e.x, y: e.y - 8, vx: 0, vy: -10, t: 0, life: 0.18, s: 4 }); return true;
      case 'cpClick': v.fx.push({ k: 'glint', x: e.x, y: e.y - 8, vx: 0, vy: -20, t: 0, life: 0.15, s: 6 }); return true;
      case 'cpBoom': {
        for (let k = 0; k < (few ? 4 : 8); k++) { const a = frnd(0, TAU), sp = frnd(30, 70); v.fx.push({ k: 'smoke', x: e.x + Math.cos(a) * 8, y: e.y - 6 + Math.sin(a) * 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5 - 24, t: 0, life: frnd(0.6, 1), s: frnd(7, 11) }); }
        v.fx.push({ k: 'dring', x: e.x, y: e.y, t: 0, life: 0.4, s: 46, id: frnd(0, 9) });
        for (let k = 0; k < (few ? 3 : 6); k++) { const a = frnd(0, TAU), sp = frnd(80, 150); v.fx.push({ k: 'spark2', x: e.x, y: e.y - 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - 40, t: 0, life: frnd(0.15, 0.28), s: frnd(4, 6) }); }
        if (e.hit) v.shake = Math.max(v.shake, 0.2);
        return true;
      }
      case 'cpDud': case 'cpFizz': for (let k = 0; k < (few ? 2 : 3); k++) v.fx.push({ k: 'smoke', x: e.x + frnd(-4, 4), y: e.y - 6, vx: frnd(-15, 15), vy: -frnd(20, 40), t: 0, life: frnd(0.5, 0.8), s: frnd(4, 6) }); return true;
      case 'cpLeak': puff(v, e.x, e.y, few ? 1 : 2, '#c9d6b0'); return true;
      case 'cpGoo': return true;
      case 'cpLunge': return true;
      case 'cpChomp':
        if (e.hit) { for (let k = 0; k < (few ? 2 : 4); k++) { const a = frnd(0, TAU), sp = frnd(40, 90); v.fx.push({ k: 'clod', x: e.x, y: e.y, z: 14, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, vz: frnd(60, 120), t: 0, life: frnd(0.35, 0.5), s: frnd(1, 1.6), a: frnd(0, TAU) }); } }
        else puff(v, e.x, e.y, 1, null);
        return true;
      case 'cpPant': return true;
      case 'cpDead': puff(v, e.x, e.y, few ? 2 : 4, '#c9d6b0'); return true;
      case 'cpUp': puff(v, e.x, e.y, few ? 1 : 2, null); return true;
    }
    return false;
  },
  icon(g, kind, r, col) {
    const W = col || '#ffffff';
    g.fillStyle = W; g.strokeStyle = W; g.lineCap = 'round'; g.lineJoin = 'round';
    switch (kind) {
      case 'cpMine':   // a squat tin with its lamp on top
        g.beginPath(); g.ellipse(0, r * 0.35, r * 0.72, r * 0.3, 0, 0, Math.PI); g.lineTo(-r * 0.72, -r * 0.05); g.ellipse(0, -r * 0.05, r * 0.72, r * 0.3, 0, Math.PI, 0, true); g.closePath(); g.fill();
        g.globalAlpha *= 0.55; g.beginPath(); g.ellipse(0, -r * 0.05, r * 0.72, r * 0.3, 0, 0, TAU); g.fill(); g.globalAlpha /= 0.55;
        circle(g, 0, -r * 0.45, r * 0.18); g.fill();
        g.lineWidth = r * 0.08; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * r * 0.3, -r * 0.62); g.lineTo(s * r * 0.48, -r * 0.8); g.stroke(); }
        return true;
      case 'cpLeak':   // a drip over a little puddle
        g.beginPath(); g.moveTo(0, -r * 0.85); g.bezierCurveTo(r * 0.45, -r * 0.2, r * 0.42, r * 0.25, 0, r * 0.25); g.bezierCurveTo(-r * 0.42, r * 0.25, -r * 0.45, -r * 0.2, 0, -r * 0.85); g.fill();
        g.globalAlpha *= 0.6; g.beginPath(); g.ellipse(0, r * 0.62, r * 0.8, r * 0.2, 0, 0, TAU); g.fill(); g.globalAlpha /= 0.6;
        return true;
      case 'cpGnaw':   // two big buck teeth under a lip
        g.beginPath(); g.ellipse(0, -r * 0.45, r * 0.8, r * 0.3, 0, 0, TAU); g.fill();
        for (const s of [-1, 1]) { g.beginPath(); g.roundRect(s > 0 ? r * 0.04 : -r * 0.38, -r * 0.3, r * 0.34, r * 0.95, r * 0.08); g.fill(); }
        return true;
      case 'cpDead':   // a round body on its back, four little legs up, a tail
        g.beginPath(); g.ellipse(0, r * 0.2, r * 0.65, r * 0.42, 0, 0, TAU); g.fill();
        g.lineWidth = r * 0.14; for (const x of [-0.4, -0.15, 0.15, 0.4]) { g.beginPath(); g.moveTo(x * r, -r * 0.05); g.lineTo(x * r * 1.2, -r * 0.6); g.stroke(); }
        g.lineWidth = r * 0.08; g.beginPath(); g.moveTo(r * 0.6, r * 0.3); g.quadraticCurveTo(r * 0.95, r * 0.4, r * 0.85, r * 0.75); g.stroke();
        return true;
    }
    return false;
  },
  sound(e) {
    switch (e.kind) {
      case 'cpFlick': return [['fToss', 0.4]];
      case 'cpArm': return [['cpTick', 0.5]];
      case 'cpClick': return [['cpTick', 0.9]];
      case 'cpBoom': return e.hit ? [['fThud', 0.8], ['fGlitch', 0.35]] : [['fThud', 0.6]];
      case 'cpDud': return [['fPop', 0.4]];
      case 'cpFizz': return [['fWhiff', 0.25]];
      case 'cpLeak': return [['cpSquelch', 0.7]];
      case 'cpGoo': return [['cpSquelch', 0.5]];
      case 'cpLunge': return [['fStep', 0.35]];
      case 'cpChomp': return e.hit ? [['cpChomp', 0.9]] : [['cpChomp', 0.45]];
      case 'cpPant': return [['fPant', 0.5]];
      case 'cpDead': return [['fBelly', 0.5]];
      case 'cpUp': return [['fStep', 0.5]];
    }
    return null;
  },
  sounds: {
    cpTick: ({ osc }) => (v, t) => { osc(t, 2200, 0.025, 'square', 0.05 * v); osc(t + 0.04, 1800, 0.02, 'square', 0.04 * v); },   // a tin's click
    cpSquelch: ({ osc, hiss }) => (v, t) => { osc(t, 180, 0.16, 'sine', 0.1 * v, 120); hiss(t, 0.14, 0.05 * v, 'lowpass', 600); },   // a wet squelch
    cpChomp: ({ osc, hiss }) => (v, t) => { osc(t, 520, 0.05, 'square', 0.07 * v, -300); hiss(t, 0.05, 0.08 * v, 'bandpass', 2400, 600); },   // a snap of teeth
  },
};
