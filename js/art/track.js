// Kernel Kart art: the track, baked once per race into a cached layer. A believable little world seen from above,
// lit from the top left (every shadow falls down and to the right): textured ground per theme, asphalt with grain,
// rubber and skid marks, kerbs on the corners, tyre walls where the run-off ends, a start gantry, and scenery.
import { STEP, TAU, clamp, mulberry } from '../core.js';
import { RUNOFF, halfWAt, projectToTrack, trackSample } from '../geometry.js';
import { canopy, drawLandmark, drawProp, findClearings, palm } from './props.js';
import { oasis } from './pharaoh.js';
import { plateauGround, sunGateShadow } from './plateau.js';
import { canyonGround, canyonRailworks, drawRailworks } from './canyon.js';
import { PCB, pcbGround, pcbTrim, pinHeader } from './chips.js';
import { KICK_H, KICK_LEN } from '../race-kickers.js';
import { bayBasin, bayGround, bayLighthouse, bayOf, bayShore, forkArt } from './bay.js';
import { shoreGround, shoreOf } from './shore.js';
import { drawMechanicsStatic, volcanoFlank } from '../draw-mechanics.js';
import { alpineGround, alpineStatic, alpineWalls, terrainOf } from './alpine.js';
import { skiGround, skiRoad, skiStatic } from './ski.js';
import { clockGround } from './clock.js';
import { neonGap, neonGround, neonSlab } from './neon.js';
import { airportGround } from './airport.js';
import { moonshotGround } from './moonshot.js';
import { alpha, circ, ell, linear, mix, poly, radial, shade, smooth, star } from './paint.js';

// per theme (the track's `deco`): the surfaces. Anything unknown falls back to the track's own theme colours. Road extras
// (see road): trap = gravel traps outside the corners in that colour; drift = sand/snow/ash blown onto the road's edges
// (driftN: how much); banks = plowed snow along the run-off; lights = lamps in the shoulder; line: 'polish' = the racing
// line polished lighter, not rubbered darker (wet: the dry line); oil = more oil stains.
export const LOOK = {
  trees:  { ground: '#78b15a', ground2: '#8cc068', road: '#686b72', verge: '#c9b98f', tex: 'grass', trap: '#d4ccb6' },
  sakura: { ground: '#93c97a', ground2: '#a7d48b', road: '#6a6d76', verge: '#e6dcc4', tex: 'grass', petals: true, trap: '#ddd3bf' },
  water:  { ground: '#1b6d9c', ground2: '#2584b0', road: '#686b72', verge: '#efe6d2', tex: 'bay', kerb: ['#1f6fb2', '#f4f1ea'], drift: '#f1e2b6', driftN: 0.3 },   // Merge Bay: a seaside town on a bay (art/bay.js), kerbs in harbour blue
  plateau:{ ground: '#d3b26c', ground2: '#c98d5a', road: '#69646a', verge: '#e7d2a2', tex: 'plateau', kerb: ['#3776ab', '#ffd43b'], drift: '#d9b47c', driftN: 0.6, trap: '#d9bf8f' },   // Pyth Plateau: dry golden grass and red earth, kerbs in Pyth's blue and yellow
  snow:   { ground: '#e9f1f8', ground2: '#f7fbfe', road: '#6a717c', verge: '#cfdced', tex: 'snow', drift: '#f6f9fc', banks: true },
  lava:   { ground: '#3a2b2f', ground2: '#46343a', road: '#58565d', verge: '#2a1f22', tex: 'basalt', trap: '#3a2f33', drift: '#8c8285', driftN: 0.6 },
  chips:  { ground: PCB.mask, ground2: PCB.mask2, road: '#4a4d58', verge: '#c9a352', tex: 'pcb', kerb: ['#eef1f5', '#d8403a'], metal: true },   // Silicon Circuit: a navy board, the road a fat trace edged in gold (art/chips.js)
  autumn: { ground: '#a7a35a', ground2: '#b8ad62', road: '#686b72', verge: '#c9b98f', tex: 'grass', trap: '#d4ccb6' },
  clouds: { ground: '#9fd3f0', ground2: '#b8e1f6', road: '#6b6f7a', verge: '#f4f8fb', tex: 'snow' },
  canyon: { ground: '#b45a32', ground2: '#c96d3e', road: '#625b5c', verge: '#d9a36b', tex: 'strata', trap: '#cf9466', drift: '#d9925e', driftN: 0.7 },
  ice:    { ground: '#cfe5f4', ground2: '#e6f2fb', road: '#7d9cb8', verge: '#f7fbff', tex: 'glacier', kerb: ['#2f7fd0', '#f4f8fc'], glaze: true, line: 'polish', drift: '#ffffff', banks: true },
  space:  { ground: '#0c1026', ground2: '#1a1f4a', road: '#6a6f88', verge: '#2b3150', tex: 'stars', kerb: ['#7df9ff', '#e8ecff'], edge: '#c9d2ff', lights: '#7df9ff' },
  factory:{ ground: '#6d717a', ground2: '#7a7e87', road: '#474b57', verge: '#3a3d45', tex: 'concrete', kerb: ['#f2c94c', '#23252d'], oil: 2.5 },
  neon:   { ground: '#10131f', ground2: '#10131f', road: '#2e3346', verge: '#3a4260', tex: 'city', kerb: ['#00e5ff', '#ff2bd6'], edge: '#7df9ff', lights: '#ff2bd6' },   // Neon Overflow: a city at night (art/neon.js)
  atoll:  { ground: '#1d6a82', ground2: '#25788f', road: '#5e626d', verge: '#e6d3a1', tex: 'ocean', wet: true },
  pharaoh:{ ground: '#e6c27e', ground2: '#f0d39c', road: '#5c5560', verge: '#d6a73c', tex: 'dunes', kerb: ['#e8ad1f', '#1f3f93'], edge: '#ffd54f', drift: '#f0d39c' },   // the road edged in gold, kerbs in gold and lapis
  jungle: { ground: '#2d5e2f', ground2: '#3b733a', road: '#7a7462', verge: '#9c8456', tex: 'jungle', kerb: ['#e2d3a4', '#6f7d45'], paved: true },
  crab:   { ground: '#edd4a2', ground2: '#f6e3ba', road: '#67636c', verge: '#f4e4bd', tex: 'shore', kerb: ['#e8562a', '#f6efe2'] },
  alpine: { ground: '#86c068', ground2: '#86c068', road: '#5f6168', verge: '#cfc8b6', tex: 'alpine', kerb: ['#d8342c', '#f4f2ec'] },   // Recursion Ridge: the ground is a height field (art/alpine.js)
  clock:  { ground: '#6f6862', ground2: '#6f6862', road: '#5a5760', verge: '#b58a3c', tex: 'clock', kerb: ['#c9962f', '#2a2522'], paved: true },   // Race Condition: a city far below, the tower's floors and the plaza (art/clock.js); kerbs in brass and black
  moonshot:{ ground: '#0b1030', ground2: '#0b1030', road: '#5d616b', verge: '#e4e1d6', tex: 'moonshot', kerb: ['#e8473c', '#f4f1ea'] },   // Moonshot: a spaceport island on the planet, space, the Moon (art/moonshot.js)
  ski:    { ground: '#e9f1f8', ground2: '#f6fafd', road: '#f4f8fc', verge: '#ffffff', tex: 'ski', drift: '#ffffff', driftN: 1 },   // Gradient Descent: a snowy mountain, the piste groomed snow (art/ski.js)
  airport:{ ground: '#8cc46a', ground2: '#8cc46a', road: '#5d616b', verge: '#e4e1d6', tex: 'airport', kerb: ['#f4c430', '#2b2f38'] },   // Gateway 8080: grass in mowing stripes, aprons, taxiways, the runway (art/airport.js)
};
export function lookOf(T) {
  const th = T.theme, L = LOOK[th.deco];
  return L ? { ...L, kind: th.deco } : { ground: th.grass, ground2: th.grass2 || th.grass, road: th.road, verge: th.verge, tex: 'grass', kind: th.deco };
}

// distance from a point to the nearest road centreline (any route), from a coarse spatial hash; cached per track
const fields = new WeakMap();
export function distField(T) {
  if (fields.has(T)) return fields.get(T);
  const C = 120, grid = new Map(), routes = T.routes || [T];
  for (const R of routes) for (let i = 0; i < R.N; i += 3) { const p = R.pts[i], k = Math.floor(p[0] / C) + ',' + Math.floor(p[1] / C); let b = grid.get(k); if (!b) grid.set(k, b = []); b.push(p[0], p[1], R.hw[i]); }
  const f = (x, y, reach = 400) => {   // distance to the nearest road EDGE (negative on the road), up to `reach`
    const cx = Math.floor(x / C), cy = Math.floor(y / C), n = Math.ceil(reach / C);
    let best = reach;
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) { const b = grid.get((cx + i) + ',' + (cy + j)); if (!b) continue; for (let k = 0; k < b.length; k += 3) { const d = Math.hypot(b[k] - x, b[k + 1] - y) - b[k + 2]; if (d < best) best = d; } }
    return best;
  };
  fields.set(T, f); return f;
}

// on a course with forks: is (x, y) on the tarmac of a route other than R? (where two roads split, one's kerbs would
// otherwise be painted across the other's lane). Shared stretches don't count: there the other road is R's own.
const others = new WeakMap();
function onOtherRoad(T, R, x, y, inset = 4) {
  const routes = T.routes || [T]; if (routes.length < 2) return false;
  let f = others.get(T);
  if (!f) {
    const C = 100, grid = new Map();
    routes.forEach((Q, k) => { for (let i = 0; i < Q.N; i += 2) { const p = Q.pts[i], key = Math.floor(p[0] / C) + ',' + Math.floor(p[1] / C); let b = grid.get(key); if (!b) grid.set(key, b = []); b.push(p[0], p[1], Q.hw[i], k); } });
    f = (R, x, y, inset) => {
      const cx = Math.floor(x / C), cy = Math.floor(y / C), mine = routes.indexOf(R);
      let own = 1e9; const near = [];
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const b = grid.get((cx + i) + ',' + (cy + j)); if (!b) continue; for (let n = 0; n < b.length; n += 4) { const d = Math.hypot(b[n] - x, b[n + 1] - y); if (b[n + 3] === mine) own = Math.min(own, d); else if (d < b[n + 2] - inset) near.push(d); } }
      return near.some(d => Math.abs(d - own) > 3);   // (the same distance as from R's own centreline: a shared stretch)
    };
    others.set(T, f);
  }
  return f(R, x, y, inset);
}

// the road surface between offsets: a closed ribbon along a route, `off` past its half-width on each side
function band(Rt, off) {
  const p = new Path2D(), edge = (i, side) => [Rt.pts[i][0] - Rt.tan[i][1] * side * (Rt.hw[i] + off), Rt.pts[i][1] + Rt.tan[i][0] * side * (Rt.hw[i] + off)];
  for (let i = 0; i < Rt.N; i++) { const [x, y] = edge(i, 1); i ? p.lineTo(x, y) : p.moveTo(x, y); }
  if (Rt.open) { const t = Rt.tan[Rt.N - 1], a = Math.atan2(t[1], t[0]); p.arc(Rt.pts[Rt.N - 1][0], Rt.pts[Rt.N - 1][1], Math.max(0.1, Rt.hw[Rt.N - 1] + off), a + Math.PI / 2, a - Math.PI / 2, true); }
  for (let i = Rt.N - 1; i >= 0; i--) { const [x, y] = edge(i, -1); p.lineTo(x, y); }
  if (Rt.open) { const t = Rt.tan[0], a = Math.atan2(t[1], t[0]); p.arc(Rt.pts[0][0], Rt.pts[0][1], Math.max(0.1, Rt.hw[0] + off), a - Math.PI / 2, a + Math.PI / 2, true); }
  p.closePath(); return p;
}
// a line along a route at lateral offset `lat` (+ = left of travel, the normal), from s0 to s1
function lane(T, s0, s1, lat, step = STEP * 2) {
  const p = new Path2D();
  for (let s = s0, k = 0; s <= s1 + 0.01; s += step, k++) { const q = trackSample(T, s), o = typeof lat === 'function' ? lat(q, s) : lat; k ? p.lineTo(q.x + q.nx * o, q.y + q.ny * o) : p.moveTo(q.x + q.nx * o, q.y + q.ny * o); }
  return p;
}

// ---------------------------------------------------------------- ground
let D = 1;   // how much fine detail (grain, texture, marks) to draw: 1 in a race, 0 for the menu's thumbnails
function ground(g, T, A, rng, dist) {
  if (A.tex === 'moonshot') return moonshotGround(g, T, D);   // (space stays clear: render.js paints it live, art/moonshot.js)
  const B = T.bbox, X0 = B.x - 400, Y0 = B.y - 400, W = B.w + 800, H = B.h + 800, area = W * H;
  g.fillStyle = A.ground; g.fillRect(X0, Y0, W, H);
  // big soft patches of a second tone
  for (let i = 0; i < 26; i++) {
    const x = X0 + rng() * W, y = Y0 + rng() * H, r = 120 + rng() * 260;
    g.fillStyle = radial(g, x, y, 0, x, y, r, [[0, alpha(hexish(A.ground2), 0.55)], [1, alpha(hexish(A.ground2), 0)]]);
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const n = Math.min(60000, area / 260) * D, dark = shade(A.ground, -0.14), light = shade(A.ground, 0.16);
  switch (A.tex) {
    case 'grass': {
      g.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const x = X0 + rng() * W, y = Y0 + rng() * H, l = 3 + rng() * 4, a = -1.3 + rng() * 0.6;
        g.strokeStyle = rng() < 0.5 ? dark : light; g.globalAlpha = 0.35 + rng() * 0.3; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      g.globalAlpha = 1;
      // flower patches
      for (let i = 0; i < area / 90000 * D; i++) {
        const x = X0 + rng() * W, y = Y0 + rng() * H; if (dist(x, y, 90) < 70) continue;
        const col = ['#fff6d5', '#ffd1e0', '#fff27a', '#ffffff', '#c9b6ff'][Math.floor(rng() * 5)];
        for (let k = 0; k < 9; k++) { const fx = x + (rng() - 0.5) * 50, fy = y + (rng() - 0.5) * 34; circ(g, fx, fy, 1.6 + rng()); g.fillStyle = col; g.fill(); }
      }
      if (A.petals) for (let i = 0; i < area / 3000 * D; i++) { const x = X0 + rng() * W, y = Y0 + rng() * H; ell(g, x, y, 2.4, 1.4, rng() * 3); g.fillStyle = rng() < 0.5 ? '#ffc4d6' : '#ffe1ea'; g.fill(); }
      break;
    }
    case 'dunes': {   // wind ripples, all one way, and grains
      g.lineCap = 'round';
      for (let i = 0; i < n / 6; i++) {
        const x = X0 + rng() * W, y = Y0 + rng() * H, l = 18 + rng() * 30;
        g.strokeStyle = rng() < 0.6 ? alpha('#a8823f', 0.18) : alpha('#fff3d6', 0.3); g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 5, x + l, y + 1.5); g.stroke();
      }
      for (let i = 0; i < n / 2; i++) { g.fillStyle = rng() < 0.5 ? alpha('#9d7a3c', 0.25) : alpha('#fff8e5', 0.35); g.fillRect(X0 + rng() * W, Y0 + rng() * H, 1.4, 1.4); }
      break;
    }
    case 'snow': {
      for (let i = 0; i < 40; i++) { const x = X0 + rng() * W, y = Y0 + rng() * H, r = 60 + rng() * 140; g.save(); g.translate(x, y); g.scale(1, 0.45); g.fillStyle = radial(g, 0, 0, 0, 0, 0, r, [[0, alpha('#9fbad6', 0.3)], [1, alpha('#9fbad6', 0)]]); g.fillRect(-r, -r, r * 2, r * 2); g.restore(); }
      g.lineCap = 'round';
      for (let i = 0; i < area / 400000 * D; i++) {   // ski tracks
        let x = X0 + rng() * W, y = Y0 + rng() * H, a = rng() * TAU; const pts = [];
        for (let k = 0; k < 30; k++) { a += (rng() - 0.5) * 0.4; x += Math.cos(a) * 14; y += Math.sin(a) * 14; pts.push([x, y, a]); }
        for (const o of [-3, 3]) { g.beginPath(); pts.forEach(([px, py, pa], k) => { const qx = px - Math.sin(pa) * o, qy = py + Math.cos(pa) * o; k ? g.lineTo(qx, qy) : g.moveTo(qx, qy); }); g.strokeStyle = alpha('#9db3cc', 0.35); g.lineWidth = 1.4; g.stroke(); }
      }
      for (let i = 0; i < n / 3; i++) { g.fillStyle = rng() < 0.7 ? '#ffffff' : alpha('#a9c2dc', 0.5); g.fillRect(X0 + rng() * W, Y0 + rng() * H, 1.5, 1.5); }
      break;
    }
    case 'sea': {
      for (let i = 0; i < 50; i++) { const x = X0 + rng() * W, y = Y0 + rng() * H, r = 100 + rng() * 220; g.fillStyle = radial(g, x, y, 0, x, y, r, [[0, alpha('#0f6382', 0.28)], [1, alpha('#0f6382', 0)]]); g.fillRect(x - r, y - r, r * 2, r * 2); }
      break;   // shallows and waves are drawn around the road (they need the shoreline)
    }
    case 'basalt': {   // dark rock: cracks, some glowing (and the mountain the road climbs, under a volcano with a `flank`)
      volcanoFlank(g, T, D);
      for (let i = 0; i < area / 9000 * (0.3 + 0.7 * D); i++) {
        let x = X0 + rng() * W, y = Y0 + rng() * H, a = rng() * TAU; const glow = rng() < 0.18;
        g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4 + rng() * 4; k++) { a += (rng() - 0.5) * 1.4; x += Math.cos(a) * (8 + rng() * 14); y += Math.sin(a) * (8 + rng() * 14); g.lineTo(x, y); }
        g.lineJoin = 'round'; g.strokeStyle = glow ? alpha('#ff7a1a', 0.75) : alpha('#1b1214', 0.7); g.lineWidth = glow ? 1.8 : 1.4; g.stroke();
        if (glow) { g.strokeStyle = alpha('#ff9a3c', 0.18); g.lineWidth = 7; g.stroke(); }
      }
      for (let i = 0; i < n / 3; i++) { g.fillStyle = rng() < 0.5 ? alpha('#5c4a50', 0.5) : alpha('#1d1416', 0.5); g.fillRect(X0 + rng() * W, Y0 + rng() * H, 2, 2); }
      break;
    }
    case 'strata': {   // red rock: wavy sandstone layers, cracks and dry brush
      g.lineCap = 'round';
      for (let i = 0; i < area / 30000 * (0.4 + 0.6 * D); i++) {
        const x = X0 + rng() * W, y = Y0 + rng() * H, l = 80 + rng() * 200, a = -0.2 + rng() * 0.4, amp = 6 + rng() * 10;
        g.strokeStyle = rng() < 0.5 ? alpha('#7a3218', 0.35) : alpha('#e89a62', 0.35); g.lineWidth = 2 + rng() * 3;
        g.beginPath(); for (let k = 0; k <= 12; k++) { const f = k / 12, px = x + Math.cos(a) * l * f, py = y + Math.sin(a) * l * f + Math.sin(f * 6 + x) * amp; k ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke();
      }
      for (let i = 0; i < area / 60000 * D; i++) { const x = X0 + rng() * W, y = Y0 + rng() * H; if (dist(x, y, 80) < 50) continue; g.strokeStyle = '#7d7a3e'; g.lineWidth = 1.2; for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); g.stroke(); } }
      for (let i = 0; i < n / 3; i++) { g.fillStyle = rng() < 0.5 ? alpha('#6e2a12', 0.25) : alpha('#f2b07a', 0.3); g.fillRect(X0 + rng() * W, Y0 + rng() * H, 1.6, 1.6); }
      canyonGround(g, T, X0, Y0, W, H, dist, D, findClearings(T, dist, A.kind));   // sand drifts, the wash, buttes, scrub, the telegraph line (art/canyon.js)
      break;
    }
    case 'glacier': {   // glacier ice: pale blue with long crack networks, drifts of snow, and glints
      for (let i = 0; i < 30; i++) { const x = X0 + rng() * W, y = Y0 + rng() * H, r = 90 + rng() * 200; g.save(); g.translate(x, y); g.scale(1, 0.5); g.fillStyle = radial(g, 0, 0, 0, 0, 0, r, [[0, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-r, -r, r * 2, r * 2); g.restore(); }
      g.lineJoin = 'round';
      for (let i = 0; i < area / 25000 * (0.4 + 0.6 * D); i++) {
        let x = X0 + rng() * W, y = Y0 + rng() * H, a = rng() * TAU;
        g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { a += (rng() - 0.5) * 1.2; x += Math.cos(a) * (14 + rng() * 22); y += Math.sin(a) * (14 + rng() * 22); g.lineTo(x, y); }
        g.strokeStyle = alpha('#6f9fc4', 0.45); g.lineWidth = 1.3; g.stroke(); g.strokeStyle = alpha('#ffffff', 0.6); g.lineWidth = 0.6; g.stroke();
      }
      for (let i = 0; i < n / 4; i++) { g.fillStyle = rng() < 0.7 ? '#ffffff' : alpha('#8fb7d8', 0.6); g.fillRect(X0 + rng() * W, Y0 + rng() * H, 1.5, 1.5); }
      break;
    }
    case 'stars': {   // deep space: nebula clouds, a scatter of stars, a few bright ones with a twinkle cross
      for (let i = 0; i < 14; i++) { const x = X0 + rng() * W, y = Y0 + rng() * H, r = 200 + rng() * 380, c = ['#5b3fd6', '#2a74d6', '#c43fa8'][Math.floor(rng() * 3)]; g.fillStyle = radial(g, x, y, 0, x, y, r, [[0, alpha(c, 0.22)], [1, alpha(c, 0)]]); g.fillRect(x - r, y - r, r * 2, r * 2); }
      for (let i = 0; i < n / 2; i++) { const b = rng(); g.fillStyle = alpha(b < 0.8 ? '#ffffff' : (b < 0.9 ? '#ffd9a8' : '#a8d4ff'), 0.3 + rng() * 0.6); const s2 = rng() < 0.92 ? 1.2 : 2.2; g.fillRect(X0 + rng() * W, Y0 + rng() * H, s2, s2); }
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1;
      for (let i = 0; i < area / 160000 * D; i++) { const x = X0 + rng() * W, y = Y0 + rng() * H, r = 5 + rng() * 6; circ(g, x, y, 1.8); g.fillStyle = '#ffffff'; g.fill(); g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); g.stroke(); }
      break;
    }
    case 'concrete': {   // a factory floor: slab joints, oil stains, painted walkways, drain grates
      g.strokeStyle = 'rgba(40,42,48,0.35)'; g.lineWidth = 1.5;
      for (let x = Math.floor(X0 / 160) * 160; x < X0 + W; x += 160) { g.beginPath(); g.moveTo(x, Y0); g.lineTo(x, Y0 + H); g.stroke(); }
      for (let y = Math.floor(Y0 / 160) * 160; y < Y0 + H; y += 160) { g.beginPath(); g.moveTo(X0, y); g.lineTo(X0 + W, y); g.stroke(); }
      for (let i = 0; i < area / 40000 * (0.4 + 0.6 * D); i++) { const x = X0 + rng() * W, y = Y0 + rng() * H, r = 14 + rng() * 40; g.save(); g.translate(x, y); g.scale(1, 0.6 + rng() * 0.4); g.fillStyle = radial(g, 0, 0, 0, 0, 0, r, [[0, 'rgba(25,24,30,0.35)'], [0.7, 'rgba(25,24,30,0.15)'], [1, 'rgba(25,24,30,0)']]); g.fillRect(-r, -r, r * 2, r * 2); g.restore(); }
      for (let i = 0; i < area / 260000 * D; i++) {   // walkway lines, kept off the road
        const x = X0 + rng() * W, y = Y0 + rng() * H, horiz = rng() < 0.5, l = 160 + rng() * 300; let ok = true;
        for (let k = 0; k <= 8; k++) if (dist(horiz ? x + l * k / 8 : x, horiz ? y : y + l * k / 8, 120) < 40) { ok = false; break; }
        if (!ok) continue;
        g.fillStyle = 'rgba(242,201,76,0.75)'; if (horiz) { g.fillRect(x, y, l, 4); g.fillRect(x, y + 34, l, 4); } else { g.fillRect(x, y, 4, l); g.fillRect(x + 34, y, 4, l); }
      }
      for (let i = 0; i < area / 200000 * D; i++) { const x = X0 + rng() * W, y = Y0 + rng() * H; if (dist(x, y, 80) < 30) continue; g.fillStyle = '#3a3d45'; g.fillRect(x - 12, y - 12, 24, 24); g.fillStyle = '#1d1f25'; for (let k = 0; k < 5; k++) g.fillRect(x - 10, y - 10 + k * 4.4, 20, 2.2); }
      for (let i = 0; i < n / 3; i++) { g.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)'; g.fillRect(X0 + rng() * W, Y0 + rng() * H, 1.6, 1.6); }
      break;
    }
    case 'grid': {   // a glowing floor grid, brighter near the road, with sparks of light at the crossings
      g.lineWidth = 1.2;
      for (let x = Math.floor(X0 / 80) * 80; x < X0 + W; x += 80) { g.strokeStyle = alpha('#3b4cff', 0.22); g.beginPath(); g.moveTo(x, Y0); g.lineTo(x, Y0 + H); g.stroke(); }
      for (let y = Math.floor(Y0 / 80) * 80; y < Y0 + H; y += 80) { g.strokeStyle = alpha('#ff2bd6', 0.14); g.beginPath(); g.moveTo(X0, y); g.lineTo(X0 + W, y); g.stroke(); }
      for (let i = 0; i < area / 30000 * (0.3 + 0.7 * D); i++) { const x = Math.round((X0 + rng() * W) / 80) * 80, y = Math.round((Y0 + rng() * H) / 80) * 80, c = rng() < 0.5 ? '#00e5ff' : '#ff2bd6'; g.fillStyle = radial(g, x, y, 0, x, y, 14, [[0, alpha(c, 0.8)], [1, alpha(c, 0)]]); g.fillRect(x - 14, y - 14, 28, 28); }
      for (let i = 0; i < n / 4; i++) { g.fillStyle = alpha('#ffffff', 0.25 + rng() * 0.4); g.fillRect(X0 + rng() * W, Y0 + rng() * H, 1.2, 1.2); }
      break;
    }
    case 'ocean': {   // a stormy sea: deep swells, then foam streaks and whitecaps all running with the wind; lagoons lighter
      const wd = T.def.hurricane ? T.def.hurricane.breeze : [0, 1], wa = Math.atan2(wd[1], wd[0]), sc = T.def.scale || 1;
      for (let i = 0; i < 36; i++) { const x = X0 + rng() * W, y = Y0 + rng() * H, r = 160 + rng() * 320; g.fillStyle = radial(g, x, y, 0, x, y, r, [[0, alpha('#0b4459', 0.32)], [1, alpha('#0b4459', 0)]]); g.fillRect(x - r, y - r, r * 2, r * 2); }
      for (const [lx, ly, lr] of T.def.lagoons || []) {
        const x = lx * sc, y = ly * sc, r = lr * sc;
        g.fillStyle = radial(g, x - r * 0.2, y - r * 0.2, 0, x, y, r * 1.25, [[0, '#7fd9d2'], [0.55, '#4cbcc4'], [0.85, alpha('#3aa6b5', 0.6)], [1, alpha('#3aa6b5', 0)]]);
        g.fillRect(x - r * 1.3, y - r * 1.3, r * 2.6, r * 2.6);
      }
      g.lineCap = 'round';
      for (let i = 0; i < area / 7000 * (0.3 + 0.7 * D); i++) {   // foam streaks, long and thin, down the wind
        const x = X0 + rng() * W, y = Y0 + rng() * H; if (dist(x, y, 160) < 110) continue;
        const l = 16 + rng() * 34, a = wa + (rng() - 0.5) * 0.25;
        g.strokeStyle = alpha('#e8f6f8', 0.12 + rng() * 0.2); g.lineWidth = 1.2 + rng() * 1.6;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      for (let i = 0; i < area / 26000 * D; i++) {   // whitecaps: a breaking crest facing downwind, with spray behind it
        const x = X0 + rng() * W, y = Y0 + rng() * H, r = 6 + rng() * 8; if (dist(x, y, 160) < 120) continue;
        g.strokeStyle = alpha('#ffffff', 0.55 + rng() * 0.3); g.lineWidth = 2.2; g.beginPath(); g.arc(x, y, r, wa - 1.1, wa + 1.1); g.stroke();
        g.fillStyle = alpha('#ffffff', 0.18); circ(g, x - Math.cos(wa) * r * 0.6, y - Math.sin(wa) * r * 0.6, r * 0.7); g.fill();
      }
      break;
    }
    case 'jungle': {   // the rainforest floor from above: deep shade under the canopy, sun flecks, leaf litter, ferns, moss and flowers
      for (let i = 0; i < 46; i++) { const x = X0 + rng() * W, y = Y0 + rng() * H, r = 140 + rng() * 300; g.fillStyle = radial(g, x, y, 0, x, y, r, [[0, alpha('#143a1a', 0.42)], [1, alpha('#143a1a', 0)]]); g.fillRect(x - r, y - r, r * 2, r * 2); }
      for (let i = 0; i < area / 70000 * (0.4 + 0.6 * D); i++) { const x = X0 + rng() * W, y = Y0 + rng() * H, r = 18 + rng() * 40; g.fillStyle = radial(g, x, y, 0, x, y, r, [[0, alpha('#b6e07a', 0.22)], [1, alpha('#b6e07a', 0)]]); g.fillRect(x - r, y - r, r * 2, r * 2); }   // sun through gaps in the canopy
      const litter = ['#5b4a2a', '#7a6a34', '#3f6a2c', '#2b5226', '#8c7a3e'];
      for (let i = 0; i < n * 0.6; i++) { ell(g, X0 + rng() * W, Y0 + rng() * H, 2 + rng() * 1.6, 1 + rng() * 0.6, rng() * TAU); g.fillStyle = alpha(litter[Math.floor(rng() * 5)], 0.4); g.fill(); }
      if (D > 0.5) for (let i = 0; i < area / 12000; i++) {   // ferns: fronds fanning out from a crown, leaflets along each
        const x = X0 + rng() * W, y = Y0 + rng() * H, r = 14 + rng() * 16; if (dist(x, y, 90) < 40 + r) continue;
        const k = 5 + Math.floor(rng() * 3), a0 = rng() * TAU, dk = rng() < 0.5 ? '#2a5a26' : '#245020', lt = rng() < 0.5 ? '#5f9a44' : '#4e8a3c';
        for (let j = 0; j < k; j++) {
          const a = a0 + j / k * TAU + (rng() - 0.5) * 0.4, ca = Math.cos(a), sa = Math.sin(a), l = r * (0.75 + rng() * 0.35);
          g.strokeStyle = dk; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + ca * l, y + sa * l); g.stroke();
          g.strokeStyle = Math.cos(a + Math.PI * 0.75) > 0 ? lt : dk; g.lineWidth = 2.2; g.beginPath();
          for (let t = 0.25; t < 0.95; t += 0.14) { const px = x + ca * l * t, py = y + sa * l * t, w = l * 0.22 * Math.sin(Math.PI * t) + 1.5; g.moveTo(px - sa * w, py + ca * w); g.lineTo(px + ca * 2, py + sa * 2); g.lineTo(px + sa * w, py - ca * w); }
          g.stroke();
        }
      }
      for (let i = 0; i < area / 50000 * D; i++) {   // flowers in the undergrowth: heliconia reds, orchid pinks, yellow
        const x = X0 + rng() * W, y = Y0 + rng() * H; if (dist(x, y, 90) < 60) continue;
        const col = ['#e8452f', '#f2a33a', '#e45aa8', '#ffe066', '#ffffff'][Math.floor(rng() * 5)];
        for (let k = 0; k < 6; k++) { circ(g, x + (rng() - 0.5) * 30, y + (rng() - 0.5) * 22, 1.8 + rng() * 1.4); g.fillStyle = col; g.fill(); }
      }
      for (let i = 0; i < n / 4; i++) { g.fillStyle = rng() < 0.5 ? alpha('#10301a', 0.35) : alpha('#9fd06a', 0.25); g.fillRect(X0 + rng() * W, Y0 + rng() * H, 1.6, 1.6); }
      // the forest itself: a mass of crowns wherever there's room, clear of the road, the landmarks and the gorge
      const sc = T.def.scale || 1, keep = [...findClearings(T, dist, A.kind).map(m => [m.x, m.y, m.r + 20]), ...(T.mech ? T.mech.boulders.map(z => [z.gorge.x, z.gorge.y, z.gorge.r + 30]) : [])];
      const crowns = [], pal = [['#1b4220', '#2b6430', '#4a8c3e'], ['#204b1d', '#36722b', '#62a046'], ['#18391b', '#285a2a', '#3f7d38']];
      for (let i = 0; i < area / 7000 * (0.4 + 0.6 * D); i++) {
        const x = X0 + rng() * W, y = Y0 + rng() * H, r = (28 + rng() * 34) * Math.min(1.2, sc / 1.3);
        if (dist(x, y, 300) < 80 + r || keep.some(([kx, ky, kr]) => Math.hypot(kx - x, ky - y) < kr + r * 0.6)) continue;
        crowns.push({ x, y, r, p: pal[Math.floor(rng() * 3)], f: rng() < 0.08 ? (rng() < 0.5 ? '#ff7a2e' : '#f5d13c') : null });
      }
      crowns.sort((a, b) => a.y - b.y);
      for (const c of crowns) { ell(g, c.x + c.r * 0.45, c.y + c.r * 0.55, c.r * 1.05, c.r * 0.85); g.fillStyle = 'rgba(8,24,12,0.3)'; g.fill(); }
      for (const c of crowns) canopy(g, c.x, c.y, c.r, c.p, rng, c.f);
      break;
    }
    case 'shore': { shoreGround(g, T, X0, Y0, W, H, dist, D); break; }   // Crab Harbor (art/shore.js)
    case 'alpine': { alpineGround(g, T, X0, Y0, W, H, rng, dist, D); break; }
    case 'ski': { skiGround(g, T, X0, Y0, W, H, rng, dist, D); break; }   // Gradient Descent: snow, forests, the Ridge's drop (art/ski.js)   // hills, forest, rock and snow from the road's heights (art/alpine.js)
    case 'clock': { clockGround(g, T, X0, Y0, W, H, rng, dist, D); break; }   // Race Condition: the city far below, the tower and the plaza (art/clock.js)
    case 'city': { neonGround(g, T, X0, Y0, W, H, rng, dist, D); break; }   // Neon Overflow's streets and blocks (art/neon.js)
    case 'airport': { airportGround(g, T, X0, Y0, W, H, rng, dist, D); break; }   // Gateway 8080: grass, aprons, taxiways and the runway (art/airport.js)
    case 'plateau': { plateauGround(g, rng, X0, Y0, W, H, n, dist, D, T, findClearings(T, dist, A.kind)); break; }   // (clear of the landmarks: art/plateau.js)
    case 'bay': { bayGround(g, T, rng, X0, Y0, W, H, dist, D); bayLighthouse(g, T); break; }   // Merge Bay (art/bay.js)
    case 'pcb': { pcbGround(g, T, X0, Y0, W, H, rng, dist, D, findClearings(T, dist, A.kind)); break; }   // Silicon Circuit's board (art/chips.js)
  }
}
const hexish = c => c[0] === '#' ? c : '#888888';
// ---------------------------------------------------------------- atoll: islands strung along the road, open water round them
// The land is a chain of soft discs along the road, wobbling in size (sandy motus with jungle in the middle). There's
// none along the causeway (race-hurricane.js), and only a wall's width outside a banked seawall (race-banks.js).
const lands = new WeakMap();
export function atollLand(T) {
  if (lands.has(T)) return lands.get(T);
  const M = T.mech, discs = [];
  for (let s = 0; s < T.L; s += 36) {
    let k = 1;
    for (const z of M && M.hurricane ? [M.hurricane] : []) k = Math.min(k, clamp((Math.max(z.s0 - s, s - z.s1) - 40) / 280, 0, 1));
    if (k <= 0) continue;
    const q = trackSample(T, s);
    let x = q.x, y = q.y, r = (200 + 60 * Math.sin(s / 530) + 40 * Math.sin(s / 207 + 1.3)) * (0.4 + 0.6 * k);
    for (const z of M ? M.banks : []) {
      const f = clamp(Math.min(s - z.s0 + 160, z.s1 + 160 - s) / 160, 0, 1);
      if (f > 0) { const sh = (r - q.hw - 14) * f; x += q.nx * z.side * sh; y += q.ny * z.side * sh; }   // only a wall's width of land outside
    }
    discs.push({ x, y, r });
  }
  const onLand = (x, y, pad = 0) => discs.some(d => (d.x - x) ** 2 + (d.y - y) ** 2 < (d.r + pad) ** 2), wd = T.def.hurricane ? T.def.hurricane.breeze : [0, 1];
  onLand.wind = Math.atan2(wd[1], wd[0]);   // which way the palms lean
  const out = { discs, onLand };
  lands.set(T, out); return out;
}
function island(g, T) {
  const { discs } = atollLand(T), ring = pad => { const p = new Path2D(); for (const d of discs) { const r = d.r + pad; if (r > 1) { p.moveTo(d.x + r, d.y); p.arc(d.x, d.y, r, 0, TAU); } } return p; };
  g.fillStyle = alpha('#56c6c6', 0.3); g.fill(ring(130));    // the reef shelf
  g.fillStyle = alpha('#86ddd3', 0.5); g.fill(ring(60));     // shallows
  g.fillStyle = alpha('#ffffff', 0.75); g.fill(ring(15));    // surf
  g.fillStyle = '#c9b27a'; g.fill(ring(5));                  // wet sand
  g.fillStyle = '#e8d5a3'; g.fill(ring(0));                  // beach
  g.fillStyle = '#4f8a43'; g.fill(ring(-80));                // jungle
  g.fillStyle = '#5f9d4d'; g.fill(ring(-100));
  if (D > 0.5) { const rng = mulberry(T.N + 77); g.fillStyle = alpha('#3d7336', 0.5); for (const d of discs) if (d.r > 150 && rng() < 0.7) { const a = rng() * TAU, o = rng() * (d.r - 120); circ(g, d.x + Math.cos(a) * o, d.y + Math.sin(a) * o, 18 + rng() * 22); g.fill(); } }   // darker clumps
}
// palm groves on the islands, clear of the road (on top of the island, under the run-off and the road)
function groves(g, T) {
  const { discs, onLand } = atollLand(T), dist = distField(T), rng = mulberry(T.N + 91), spots = [];
  for (const d of discs) for (let k = 0; k < 4; k++) {
    if (rng() > 0.55) continue;
    const a = rng() * TAU, o = rng() * (d.r - 30), x = d.x + Math.cos(a) * o, y = d.y + Math.sin(a) * o, r = 16 + rng() * 10;
    if (dist(x, y, 200) < 50 + r || !onLand(x, y, -r) || spots.some(p => Math.hypot(p.x - x, p.y - y) < (p.r + r) * 1.4)) continue;
    spots.push({ x, y, r });
  }
  for (const p of spots) { ell(g, p.x + p.r * 0.5, p.y + p.r * 0.6, p.r * 1.05, p.r * 0.8); g.fillStyle = 'rgba(14,18,28,0.22)'; g.fill(); }
  for (const p of spots) if (onLand.palms) onLand.palms.push({ x: p.x, y: p.y, r: p.r, k: onLand.palms.length }); else palm(g, p.x, p.y, p.r, rng, onLand.wind);   // (in a hurricane they bend with the wind: drawn live, art/hurricane.js)
}

// ---------------------------------------------------------------- shore: Crab Harbor's seaside (art/shore.js)
export { shoreOf };

// ---------------------------------------------------------------- road
// The tarmac, textured once into the cached layer and lit from the top left. Bottom up: the run-off (a worn ring, and
// gravel traps outside the corners where the theme has them, `traps`), the shoulder, then the asphalt itself: drifts
// of colour, a repair or two, the rubbered-in racing line (tucked to the inside through the corners, where the karts
// drive) and the polished middle of the straights, grime along the edges, the painted edge lines, aggregate grain over
// all of it, then sealed cracks, oil, braking marks into the tight corners and whatever the theme blows onto the edges
// (sand, snow, ash, petals). All of it faint: the karts, items and hazards on top have to read at a glance.
const LIT = [-0.6, -0.8];   // toward the light
const ri = (R, i) => R.open ? clamp(i, 0, R.N - 1) : ((i % R.N) + R.N) % R.N;   // a sample index, wrapped round a closed lap
const rp = (R, j, o) => [R.pts[j][0] - R.tan[j][1] * o, R.pts[j][1] + R.tan[j][0] * o];   // the point `o` left of sample j
const lineAt = (R, j) => R.ins[j] * Math.max(0, R.hw[j] - 26) * 0.85;   // where the karts drive: the racing line's offset
// a closed strip along a route from sample i0 to i1 (may run past the lap's end) between offsets a(j, i) and b(j, i)
function strip(R, i0, i1, a, b, step = 2) {
  const p = new Path2D(), I = [];
  for (let i = i0; i < i1; i += step) I.push(i);
  I.push(i1);
  I.forEach((i, k) => { const j = ri(R, i), [x, y] = rp(R, j, a(j, i)); k ? p.lineTo(x, y) : p.moveTo(x, y); });
  for (let k = I.length - 1; k >= 0; k--) { const j = ri(R, I[k]), [x, y] = rp(R, j, b(j, I[k])); p.lineTo(x, y); }
  p.closePath(); return p;
}
// a strip the whole way round whose opacity op(j) changes along the road: one fill per run at the same opacity (to 1%)
function graded(g, R, col, a, b, op, step = 4) {
  const end = R.open ? R.N - 1 : R.N, lv = i => Math.round(clamp(op(ri(R, i)), 0, 1) * 100);
  let i0 = 0, l0 = lv(0);
  for (let i = Math.min(step, end); ; i = Math.min(i + step, end)) {
    const l = i >= end ? -1 : lv(i);
    if (l !== l0) { if (l0 > 0) { g.fillStyle = alpha(col, l0 / 100); g.fill(strip(R, i0, i, a, b)); } i0 = i; l0 = l; }
    if (i >= end) break;
  }
}
// runs of samples where f(i) gives the same non-zero side, longer than minLen
function runsOf(R, f, minLen = 14) {
  const out = []; let run = null;
  for (let i = 0; i < R.N; i++) {
    const v = f(i);
    if (v && run && run.side === v) run.i1 = i; else { if (run && run.i1 - run.i0 > minLen) out.push(run); run = v ? { i0: i, i1: i, side: v } : null; }
  }
  if (run && run.i1 - run.i0 > minLen) out.push(run);
  return out;
}
// smooth 0..1 noise along a route (a new random value every `every` samples, eased between)
function noise1(n, rng, every = 24) {
  const v = Array.from({ length: Math.ceil(n / every) + 2 }, () => rng()), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const f = i / every, a = Math.floor(f), t = f - a, s = t * t * (3 - 2 * t); out[i] = v[a] + (v[a + 1] - v[a]) * s; }
  return out;
}
// textures, made once: the asphalt's aggregate (dark and light specks and a few bigger stones, lit from the top left)
// and gravel (pebbles with their shadows). Laid on as patterns, twice at different scales and angles so they don't repeat.
let tiles = null;
function texTiles() {
  if (tiles !== null) return tiles;
  if (typeof document === 'undefined' || typeof DOMMatrix === 'undefined') return (tiles = false);
  const N = 256, make = (seed, draw) => { const c = document.createElement('canvas'); c.width = c.height = N; draw(c.getContext('2d'), mulberry(seed)); return c; };
  const wrapped = (x, y, m, f) => { for (const dx of [0, -N, N]) for (const dy of [0, -N, N]) if (x + dx > -m && x + dx < N + m && y + dy > -m && y + dy < N + m) f(x + dx, y + dy); };
  tiles = {
    grain: make(11, (t, r) => {
      for (let i = 0; i < 11000; i++) { t.fillStyle = r() < 0.55 ? `rgba(0,0,0,${(0.1 + r() * 0.16).toFixed(3)})` : `rgba(255,255,255,${(0.05 + r() * 0.1).toFixed(3)})`; t.fillRect(Math.floor(r() * N), Math.floor(r() * N), 1, 1); }
      for (let i = 0; i < 900; i++) {
        const x = r() * N, y = r() * N, s = 1.4 + r() * 1.6, a = (0.06 + r() * 0.12).toFixed(3);
        wrapped(x, y, 4, (px, py) => { t.fillStyle = 'rgba(0,0,0,0.16)'; t.fillRect(px + 0.7, py + 0.7, s, s); t.fillStyle = `rgba(255,255,255,${a})`; t.fillRect(px, py, s, s); });
      }
    }),
    gravel: make(23, (t, r) => {
      for (let i = 0; i < 2400; i++) {
        const x = r() * N, y = r() * N, rx = 1.5 + r() * 2.2, ry = rx * (0.6 + r() * 0.4), a = r() * 3, v = r();
        const top = v < 0.5 ? `rgba(255,255,255,${(0.1 + r() * 0.22).toFixed(3)})` : v < 0.75 ? `rgba(0,0,0,${(0.04 + r() * 0.08).toFixed(3)})` : 'rgba(255,248,230,0.1)';
        wrapped(x, y, 6, (px, py) => {
          t.fillStyle = 'rgba(0,0,0,0.1)'; t.beginPath(); t.ellipse(px + 0.8, py + 1, rx, ry, a, 0, TAU); t.fill();
          t.fillStyle = top; t.beginPath(); t.ellipse(px, py, rx, ry, a, 0, TAU); t.fill();
          t.fillStyle = 'rgba(255,255,255,0.22)'; t.beginPath(); t.ellipse(px - rx * 0.3, py - ry * 0.35, rx * 0.4, ry * 0.32, a, 0, TAU); t.fill();
        });
      }
    }),
  };
  return tiles;
}
const tilePat = (g, tile, scale, rot = 0, dx = 0, dy = 0) => { const p = g.createPattern(tile, 'repeat'); p.setTransform(new DOMMatrix().translate(dx, dy).rotate(rot).scale(scale)); return p; };

function road(g, T, A, rng) {
  if (A.kind === 'ski') return skiRoad(g, T, D);   // Gradient Descent: a groomed piste and open snowfields (art/ski.js)
  const routes = T.routes || [T], fillB = (col, off) => { g.fillStyle = col; for (const R of routes) g.fill(band(R, off)); };
  const lim = T.def.runoff || RUNOFF, tx = D > 0.5 ? texTiles() : null;
  // shoreline / run-off apron
  if (A.tex === 'bay') { bayShore(g, T, fillB, rng, D); fillB(A.verge, 16); }   // Merge Bay: a promenade, the beach and its groynes (art/bay.js)
  else if (A.tex === 'sea') {
    fillB(alpha('#5fd0e0', 0.55), 130); fillB(alpha('#8be3e6', 0.7), 70); fillB(alpha('#c9f1ea', 0.85), 34);
    fillB(alpha('#ffffff', 0.7), 24); fillB(A.verge, 20);
    // waves out at sea: little white crests
    const B = T.bbox, dist = distField(T); g.lineCap = 'round';
    for (let i = 0; i < B.w * B.h / 9000 * D; i++) { const x = B.x - 200 + rng() * (B.w + 400), y = B.y - 200 + rng() * (B.h + 400); if (dist(x, y, 200) < 150) continue; g.strokeStyle = alpha('#ffffff', 0.25 + rng() * 0.35); g.lineWidth = 2; g.beginPath(); g.arc(x, y, 7 + rng() * 6, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
  } else {
    if (A.tex === 'stars') {   // a space station: the run-off is a metal deck with a lit rim, floating over the stars
      fillB(alpha('#7df9ff', 0.25), lim + 6); fillB('#1c2140', lim + 3); fillB('#2a3054', lim);
    } else if (A.tex === 'ocean') { atollLand(T).onLand.palms = T.def.hurricane && D > 0.5 ? [] : null; island(g, T); if (D > 0.5) groves(g, T); }   // (palms: see groves)   // islands along the road, a beach for a run-off
    if (A.tex !== 'stars') { const c = A.tex === 'snow' ? alpha(A.verge, 0.04) : alpha(shade(A.verge, -0.25), 0.022); for (let f = 0.95; f > 0.38; f -= D > 0.5 ? 0.05 : 1) fillB(c, lim * (D > 0.5 ? f : 0.65)); }   // run-off: a worn ring round the road, soft at its edge
    fillB(A.verge, 16);
  }
  if (tx && !A.metal) { g.fillStyle = tilePat(g, tx.grain, 0.7); for (const R of routes) g.fill(band(R, 16)); }   // grit on the shoulder (not on a plated one)
  if (A.banks && D > 0.5) snowBanks(g, T, routes, lim);
  // the road's soft shadow, down and to the right
  for (const [o, a] of [[7, 0.07], [4, 0.09], [1.5, 0.12]]) { g.save(); g.translate(2, 3); fillB(`rgba(0,0,0,${a})`, o); g.restore(); }
  fillB(A.road, 0);
  g.save(); const all = new Path2D(); for (const R of routes) all.addPath(band(R, 0)); g.clip(all);
  // big soft drifts of colour, a little lighter or darker
  for (let i = 0; i < T.L / 110 * D; i++) {
    const R = routes[Math.floor(rng() * routes.length)], j = Math.floor(rng() * R.N), [x, y] = rp(R, j, (rng() * 2 - 1) * R.hw[j]), r = 50 + rng() * 110, dark = rng() < 0.55;
    g.fillStyle = radial(g, x, y, 0, x, y, r, [[0, dark ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.045)'], [1, dark ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,0)']]); g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // repairs: patches of newer (or older) tarmac, with a sealed seam round them
  if (!A.paved) for (let i = 0; i < Math.max(2, T.L / 1300) * D; i++) {
    const R = routes[Math.floor(rng() * routes.length)], j0 = Math.floor(rng() * R.N), n = 14 + Math.floor(rng() * 40), hw = R.hw[j0], w = hw * (0.25 + rng() * 0.45), o = (rng() * 2 - 1) * (hw - w / 2 - 8);
    const p = strip(R, j0, j0 + n, () => o - w / 2, () => o + w / 2, 3);
    g.fillStyle = shade(A.road, (rng() < 0.6 ? -1 : 1) * (0.025 + rng() * 0.025)); g.fill(p);
    g.strokeStyle = alpha('#121318', 0.16); g.lineWidth = 1; g.stroke(p);
  }
  if (A.paved) for (const R of routes) paving(g, R, rng);
  // the racing line, rubbered in (darker; on ice polished, in the rain the dry line), strongest through the corners;
  // the middle of the straights polished a touch lighter; grime along the edges, where nobody drives
  const rub = A.wet ? '#d5dde6' : A.line === 'polish' ? '#f2f8ff' : '#000000', rk = rub === '#000000' ? 1 : 0.7;
  if (D > 0.5) for (const R of routes) {
    const on = j => Math.abs(R.ins[j]);
    graded(g, R, rub, j => lineAt(R, j) - 30, j => lineAt(R, j) + 30, j => rk * (0.015 + 0.04 * on(j)));
    for (const w of [-13, 13]) graded(g, R, rub, j => lineAt(R, j) + w - 6, j => lineAt(R, j) + w + 6, j => rk * (0.01 + 0.04 * on(j)));
    graded(g, R, '#ffffff', j => -R.hw[j] * 0.45, j => R.hw[j] * 0.45, j => 0.035 * (1 - on(j)) ** 2);
    for (const sd of [-1, 1]) graded(g, R, '#000000', j => sd * (R.hw[j] - 16), j => sd * (R.hw[j] + 1), () => 0.05, 40);
  }
  // painted edge lines: worn here and there, most where the karts run over them. Where two roads split, not across the
  // other road's lane (the split's own paint shows the way there): `keep` is 0 for those samples.
  for (const R of routes) {
    const nz = noise1(R.N, rng);
    for (const sd of [-1, 1]) {
      const a = j => sd * (R.hw[j] - 7.4), b = j => sd * (R.hw[j] - 4.6);
      const keep = routes.length > 1 ? Uint8Array.from({ length: R.N }, (_, j) => { const [x, y] = rp(R, j, (a(j) + b(j)) / 2); return onOtherRoad(T, R, x, y, 12) ? 0 : 1; }) : null;
      if (A.edge || D <= 0.5) { g.save(); if (A.edge) { g.shadowColor = A.edge; g.shadowBlur = 10; } if (keep) graded(g, R, A.edge || '#f4f4f0', a, b, j => keep[j] * 0.9, 2); else { g.fillStyle = A.edge || alpha('#f4f4f0', 0.9); g.fill(strip(R, 0, R.open ? R.N - 1 : R.N, a, b)); } g.restore(); }
      else graded(g, R, '#f4f4f0', a, b, j => keep && !keep[j] ? 0 : 0.94 - 0.22 * nz[j] - 0.18 * Math.max(0, sd * R.ins[j]) * D, 6);
    }
  }
  // the aggregate, over everything (the lines too, so they look painted on, not pasted)
  if (tx) { g.fillStyle = tilePat(g, tx.grain, 0.55); g.fill(all); g.fillStyle = tilePat(g, tx.grain, 0.42, 37, 31, 17); g.fill(all); }
  if (A.wet) for (let i = 0; i < T.L / 220 * (0.3 + 0.7 * D); i++) {   // rain: puddles off the line, dark, with the grey sky in them
    const R = routes[0], s = rng() * R.L, q = trackSample(R, s), j = ri(R, Math.round(s / STEP)), c = lineAt(R, j);
    let o = (rng() * 2 - 1) * q.hw * 0.8; if (Math.abs(o - c) < 34) o = clamp(c + (o < c ? -1 : 1) * (34 + rng() * 16), -q.hw * 0.82, q.hw * 0.82);
    const x = q.x + q.nx * o, y = q.y + q.ny * o, a = Math.atan2(q.ty, q.tx), l = 14 + rng() * 30, w = 5 + rng() * 9;
    ell(g, x, y, l, w, a); g.fillStyle = alpha('#2a2d35', 0.28); g.fill();
    ell(g, x - 2, y - 2, l * 0.7, w * 0.45, a); g.fillStyle = alpha('#b9c6d3', 0.18); g.fill();
  }
  if (A.wet && D > 0.5) for (let i = 0; i < T.L / 120; i++) {   // and a sheen: the sky in long streaks down the wet tarmac
    const R = routes[0], s0 = rng() * R.L, o = (rng() * 2 - 1) * R.halfW * 0.85, l = 40 + rng() * 150;
    g.strokeStyle = alpha('#dbe6f0', 0.04 + rng() * 0.05); g.lineWidth = 4 + rng() * 9; g.lineCap = 'round'; g.stroke(lane(R, s0, Math.min(R.L, s0 + l), o, 6));
  }
  if (A.glaze) for (let i = 0; i < T.L / 30 * (0.3 + 0.7 * D); i++) {   // ice: glassy streaks along the road
    const R = routes[Math.floor(rng() * routes.length)], s0 = rng() * R.L, o = (rng() * 2 - 1) * R.halfW * 0.9, l = 40 + rng() * 120;
    g.strokeStyle = alpha('#ffffff', 0.12 + rng() * 0.18); g.lineWidth = 3 + rng() * 6; g.lineCap = 'round'; g.stroke(lane(R, s0, Math.min(R.L, s0 + l), o, 6));
  }
  // cracks, sealed with tar (a glossy top edge toward the light)
  if (!A.paved) for (let i = 0; i < T.L / 380 * D; i++) {
    const R = routes[Math.floor(rng() * routes.length)], j = Math.floor(rng() * R.N); let [x, y] = rp(R, j, (rng() * 2 - 1) * R.hw[j] * 0.9), a = Math.atan2(R.tan[j][1], R.tan[j][0]) + (rng() < 0.6 ? Math.PI / 2 : 0) + (rng() - 0.5) * 0.8;
    const p = new Path2D(); p.moveTo(x, y);
    for (let k = 0, n = 3 + rng() * 6; k < n; k++) { a += (rng() - 0.5) * 1.1; const l = 4 + rng() * 8; x += Math.cos(a) * l; y += Math.sin(a) * l; p.lineTo(x, y); }
    g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = alpha('#141519', 0.38); g.lineWidth = 1.7; g.stroke(p);
    g.save(); g.translate(-0.6, -0.7); g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = 0.7; g.stroke(p); g.restore();
  }
  // oil: faint stains, mostly on the line and where the karts sit on the grid
  const oil = (x, y, r) => { for (let k = 0; k < 3; k++) { const ox = x + (rng() - 0.5) * r, oy = y + (rng() - 0.5) * r * 0.7, rr = r * (0.4 + rng() * 0.6); g.fillStyle = radial(g, ox, oy, 0, ox, oy, rr, [[0, 'rgba(12,12,16,0.15)'], [0.6, 'rgba(12,12,16,0.07)'], [1, 'rgba(12,12,16,0)']]); g.fillRect(ox - rr, oy - rr, rr * 2, rr * 2); } };
  if (D > 0.5) {
    for (let i = 0; i < T.L / 650 * (A.oil || 1); i++) { const R = routes[Math.floor(rng() * routes.length)], j = Math.floor(rng() * R.N), [x, y] = rp(R, j, lineAt(R, j) + (rng() - 0.5) * 50); oil(x, y, 7 + rng() * 12); }
    for (let i = 0; i < 6; i++) { const s = T.open ? 420 - i * 96 : T.L - 90 - i * 96, q = trackSample(T, s), o = (i % 2 ? -1 : 1) * halfWAt(T, s) * 0.42; oil(q.x + q.nx * o, q.y + q.ny * o, 9); }
  }
  // braking marks into the tight corners: pairs of streaks along the line, fading in and out
  if (D > 0.5) for (const R of routes) for (const run of runsOf(R, i => Math.abs(R.curv[i]) > 1 / 170 ? Math.sign(R.curv[i]) : 0)) {
    for (let m = 0, n = 1 + Math.floor(rng() * 3); m < n; m++) {
      const jit = (rng() - 0.5) * 22, s0 = run.i0 * STEP - 140 - rng() * 90, s1 = run.i0 * STEP + (run.i1 - run.i0) * STEP * (0.2 + rng() * 0.6), a = 0.045 + rng() * 0.05;
      const lat = w => (q, s) => R.ins[ri(R, Math.round(s / STEP))] * Math.max(0, q.hw - 26) * 0.85 + jit + w;
      g.lineCap = 'butt'; g.strokeStyle = alpha('#0b0b0d', a); g.lineWidth = 3.2;
      for (const w of [-11, 11]) { g.stroke(lane(R, s0, s1, lat(w), 4)); g.stroke(lane(R, s0 + (s1 - s0) * 0.25, s1 - (s1 - s0) * 0.2, lat(w), 4)); }
    }
  }
  // what the theme blows onto the edges: sand, snow, ash; petals
  if (A.drift && D > 0.5) for (const R of routes) for (const sd of [-1, 1]) {
    for (let i = 0; i < R.L / 55 * (A.driftN || 1); i++) {
      const j = Math.floor(rng() * R.N), [x, y] = rp(R, j, sd * (R.hw[j] + 4 - rng() ** 2 * 18)), ang = Math.atan2(R.tan[j][1], R.tan[j][0]) + (rng() - 0.5) * 0.3, l = 14 + rng() * 40, w = 3 + rng() * 6;
      ell(g, x, y, l, w, ang); g.fillStyle = alpha(A.drift, 0.1 + rng() * 0.16); g.fill();
      ell(g, x + sd * R.tan[j][1] * w * 0.4, y - sd * R.tan[j][0] * w * 0.4, l * 0.6, w * 0.5, ang); g.fillStyle = alpha(A.drift, 0.14 + rng() * 0.16); g.fill();
    }
    g.fillStyle = alpha(A.drift, 0.55);
    for (let i = 0; i < R.L / 4 * (A.driftN || 1); i++) { const j = Math.floor(rng() * R.N), [x, y] = rp(R, j, sd * (R.hw[j] - rng() ** 2 * 26)); g.fillRect(x, y, 1.3, 1.3); }
  }
  if (A.petals && D > 0.5) for (const R of routes) for (let i = 0; i < R.L / 14; i++) {
    const j = Math.floor(rng() * R.N), sd = rng() < 0.5 ? -1 : 1, [x, y] = rp(R, j, sd * (R.hw[j] + 4 - rng() ** 2 * 30));
    ell(g, x, y, 2.4, 1.4, rng() * 3); g.fillStyle = rng() < 0.5 ? '#ffc4d6' : '#ffe1ea'; g.fill();
  }
  g.restore();
  if (A.lights && D > 0.5) edgeLights(g, routes, A.lights);
}

// little lights set into the shoulder along both edges, every 44 units (space station, circuit board)
function edgeLights(g, routes, col) {
  for (const R of routes) for (const sd of [-1, 1]) for (let i = 0; i < R.N; i += 22) {
    const [x, y] = rp(R, i, sd * (R.hw[i] + 9));
    g.fillStyle = radial(g, x, y, 0, x, y, 9, [[0, alpha(col, 0.42)], [1, alpha(col, 0)]]); g.fillRect(x - 9, y - 9, 18, 18);
    circ(g, x + 0.5, y + 0.7, 2.4); g.fillStyle = 'rgba(10,12,20,0.7)'; g.fill();
    circ(g, x, y, 1.7); g.fillStyle = col; g.fill(); circ(g, x - 0.5, y - 0.6, 0.7); g.fillStyle = '#ffffff'; g.fill();
  }
}
// plowed snow piled along the far edge of the run-off: lumps with a shaded side and a lit top, and their shadow
function snowBanks(g, T, routes, lim) {
  const rng = mulberry(T.N + 313), dist = distField(T), lumps = [];
  for (const R of routes) for (const sd of [-1, 1]) for (let i = 0; i < R.N; i += 3 + Math.floor(rng() * 4)) {
    const o = sd * (R.hw[i] + lim + 19 + rng() * 9), [x, y] = rp(R, i, o);
    if (dist(x, y, lim + 50) < lim + 14 || (T.ponds || []).some(p => Math.hypot(p.x - x, p.y - y) < p.r * 1.3 + 24)) continue;   // another road nearer, or a pond
    lumps.push([x, y, 4 + rng() * 8]);
  }
  g.fillStyle = 'rgba(60,85,120,0.16)'; for (const [x, y, r] of lumps) { circ(g, x + 3, y + 4, r); g.fill(); }
  g.fillStyle = '#c4d3e4'; for (const [x, y, r] of lumps) { circ(g, x, y, r); g.fill(); }
  g.fillStyle = '#f6faff'; for (const [x, y, r] of lumps) { circ(g, x - r * 0.18, y - r * 0.24, r * 0.8); g.fill(); }
}
// gravel traps on the outside of the corners, out past the exit (the theme's `trap` colour): a raked bed of pebbles,
// sunk a little (its rim shades the near side), tapered at the ends, none where it would run into other road or a pond.
// Drawn straight on the ground, under ponds, rails and the road.
function traps(g, T, A) {
  if (!A.trap) return;
  const lim = T.def.runoff || RUNOFF, dist = distField(T), wT = clamp(lim - 12, 18, 60), tx = D > 0.5 ? texTiles() : null;
  for (const R of T.routes || [T]) for (const run of runsOf(R, i => Math.abs(R.curv[i]) > 1 / 300 ? -Math.sign(R.curv[i]) : 0, 20)) {
    const i0 = run.i0 - 30, i1 = run.i1 + 60, n = i1 - i0, raw = new Float32Array(n + 1), f = new Float32Array(n + 1);
    for (let k = 0; k <= n; k++) {
      const j = ri(R, i0 + k), [x, y] = rp(R, j, run.side * (R.hw[j] + 16 + wT));
      raw[k] = dist(x, y, wT + 40) > wT + 8 && !(T.ponds || []).some(p => Math.hypot(p.x - x, p.y - y) < p.r * 1.3 + 20) ? 1 : 0;
    }
    let peak = 0;
    for (let k = 0; k <= n; k++) {   // shrink away from anything in the way, then ease the edges
      let m = 1; for (let d = -12; d <= 12; d++) m = Math.min(m, raw[clamp(k + d, 0, n)]);
      f[k] = m * Math.min(1, k / 50, (n - k) / 50); f[k] = f[k] * f[k] * (3 - 2 * f[k]); peak = Math.max(peak, f[k]);
    }
    if (peak < 0.5) continue;
    const at = i => f[clamp(i - i0, 0, n)], inner = j => run.side * (R.hw[j] + 12), outer = (j, i) => run.side * (R.hw[j] + 12 + (wT + 4) * at(i));
    const p = strip(R, i0, i1, inner, outer);
    g.fillStyle = A.trap; g.fill(p);
    if (!tx) continue;
    g.save(); g.clip(p);
    g.fillStyle = tilePat(g, tx.gravel, 0.6, 21); g.fill(p);
    g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 1.4;   // rake lines
    for (const t of [0.35, 0.55, 0.75]) { const q = new Path2D(); for (let i = i0; i <= i1; i += 3) { const j = ri(R, i), [x, y] = rp(R, j, run.side * (R.hw[j] + 12 + (wT + 4) * at(i) * t)); i === i0 ? q.moveTo(x, y) : q.lineTo(x, y); } g.stroke(q); }
    g.translate(2.5, 3.5); g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 5; g.stroke(p);   // the rim's shadow on the near side
    g.restore();
    g.strokeStyle = alpha(shade(A.trap, -0.35), 0.55); g.lineWidth = 1.2; g.stroke(p);
  }
}

// an old paved causeway: big stone setts laid in rows across the road (each row half a sett along from the last), some
// a touch lighter or darker, worn smooth down the middle, with moss in the joints near the edges
function paving(g, R, rng) {
  const L = 34, Wd = 30, P = (q, o) => [q.x + q.nx * o, q.y + q.ny * o];
  for (let s = 0, k = 0; s < R.L - L * 0.5; s += L, k++) {
    const a = trackSample(R, s), b = trackSample(R, Math.min(s + L, R.L)), hw = Math.min(a.hw, b.hw);
    for (let o = -hw + ((k % 2) ? Wd / 2 : 0) - Wd; o < hw; o += Wd) {
      const o0 = Math.max(o, -hw), o1 = Math.min(o + Wd, hw); if (o1 - o0 < 4) continue;
      const tone = rng(); if (tone > 0.35 && tone < 0.75) continue;
      poly(g, [P(a, o0 + 1.5), P(a, o1 - 1.5), P(b, o1 - 1.5), P(b, o0 + 1.5)]);
      g.fillStyle = tone < 0.35 ? alpha('#ffffff', 0.025 + tone * 0.08 * D) : alpha('#000000', 0.03 + (tone - 0.75) * 0.12); g.fill();
    }
    // the joints: one across the road, and the ones between the setts of this row
    const [x0, y0] = P(a, -hw), [x1, y1] = P(a, hw);
    g.strokeStyle = alpha('#29251d', 0.24); g.lineWidth = 1.3; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1);
    for (let o = -hw + ((k % 2) ? Wd / 2 : 0); o < hw - 3; o += Wd) { if (o < -hw + 3) continue; const [p0, p1] = P(a, o), [r0, r1] = P(b, o); g.moveTo(p0, p1); g.lineTo(r0, r1); }
    g.stroke();
    if (D > 0.5) for (const sd of [-1, 1]) if (rng() < 0.5) {   // moss creeping in from the verge
      const o = sd * (hw - 2 - rng() * 10), [mx, my] = P(trackSample(R, s + rng() * L), o);
      for (let j = 0; j < 4; j++) { circ(g, mx + (rng() - 0.5) * 8, my + (rng() - 0.5) * 8, 1.2 + rng() * 1.6); g.fillStyle = alpha(rng() < 0.5 ? '#4f7a35' : '#6e9440', 0.7); g.fill(); }
    }
  }
}

// raised kerbs in the theme's two colours (red and white by default): wide and bold on the inside of every corner
// (the apex), and on the outside from the middle of the corner out past its exit. Each block is lit from the top left
// (a bright bevel on the side facing the light, a dark one away from it) and throws a shadow down and to the right;
// rubber smeared on the apex kerbs where the karts clip them.
function kerbs(g, T, A) {
  if (A.kind === 'ski') return;   // (a piste has poles, not kerbs: art/ski.js)
  const cols = A.kerb || ['#d8342c', '#f3f1ec'], tx = D > 0.5 ? texTiles() : null;
  for (const R of T.routes || [T]) {
    const runs = [];
    for (const apex of [false, true]) for (const r of runsOf(R, i => Math.abs(R.curv[i]) > (apex ? 1 / 330 : 1 / 260) ? Math.sign(R.curv[i]) * (apex ? 1 : -1) : 0)) {
      const len = r.i1 - r.i0;
      runs.push(apex ? { ...r, i0: r.i0 - 6, i1: r.i1 + 6, in: 4, out: 11, apex } : { ...r, i0: r.i0 + Math.floor(len * 0.3), i1: r.i1 + 28, in: 3, out: 9 });
    }
    for (const r of runs) kerbRun(g, R, r, cols, tx, T);
  }
}
function kerbRun(g, R, r, [kc1, kc2], tx, T) {
  if (R.open) { r.i0 = Math.max(0, r.i0); r.i1 = Math.min(R.N - 1, r.i1); }
  const span = r.i1 - r.i0, nb = Math.max(1, Math.round(span / 7)), o1 = j => r.side * (R.hw[j] - r.in), B = [];
  // on the inside of a tight corner the kerb narrows rather than reach past the corner's centre
  const o2 = j => r.side * (Math.sign(R.curv[j]) === r.side ? Math.max(R.hw[j] - r.in + 3, Math.min(R.hw[j] + r.out, 0.96 / Math.abs(R.curv[j]))) : R.hw[j] + r.out);
  for (let b = 0; b < nb; b++) {   // blocks of about 14 units, each a quad (one squeezed shut on the inside of a kink is left out)
    const a = ri(R, r.i0 + Math.round(b * span / nb)), c = ri(R, r.i0 + Math.round((b + 1) * span / nb));
    const q = [rp(R, a, o1(a)), rp(R, a, o2(a)), rp(R, c, o2(c)), rp(R, c, o1(c))], tx0 = R.tan[a][0], ty0 = R.tan[a][1];
    const along = (P, Q) => (Q[0] - P[0]) * tx0 + (Q[1] - P[1]) * ty0;
    if (along(q[0], q[3]) < 2 || along(q[1], q[2]) < 1) continue;
    { const m = rp(R, a, (o1(a) + o2(a)) / 2); if (onOtherRoad(T, R, m[0], m[1])) continue; }   // across another road's lane where two roads split
    B.push({ q, b, a, c });
  }
  if (!B.length) return;
  if (D > 0.5) { g.fillStyle = 'rgba(0,0,0,0.2)'; for (const { q } of B) { poly(g, q.map(([x, y]) => [x + 1.6, y + 2.2])); g.fill(); } }
  const top = new Path2D();
  for (const { q, b } of B) { poly(g, q); g.fillStyle = b % 2 ? kc2 : kc1; g.fill(); q.forEach(([x, y], k) => k ? top.lineTo(x, y) : top.moveTo(x, y)); top.closePath(); }
  if (D <= 0.5) return;
  for (const { a, c } of B) {
    const lit = (-R.tan[a][1] * LIT[0] + R.tan[a][0] * LIT[1]) * r.side;   // how much the outer face looks toward the light
    const bevel = (o, d, l) => { poly(g, [rp(R, a, o(a)), rp(R, a, o(a) - r.side * d), rp(R, c, o(c) - r.side * d), rp(R, c, o(c))]); g.fillStyle = l > 0 ? `rgba(255,255,255,${(0.45 * l).toFixed(3)})` : `rgba(0,0,0,${(-0.32 * l).toFixed(3)})`; g.fill(); };
    bevel(o2, 3, lit);         // the outer face
    bevel(o1, -2.5, -lit);     // the face toward the road
  }
  if (tx) { g.fillStyle = tilePat(g, tx.grain, 0.5); g.fill(top); }   // the paint's texture
  if (r.apex && span > 40) { g.fillStyle = 'rgba(10,10,12,0.12)'; g.fill(strip(R, r.i0 + Math.floor(span * 0.25), r.i1 - Math.floor(span * 0.25), o1, j => o1(j) + r.side * 7)); }   // rubber where the karts clip it
  const p = new Path2D(); for (let i = r.i0; i <= r.i1; i++) { const j = ri(R, i), [x, y] = rp(R, j, o2(j)); i === r.i0 ? p.moveTo(x, y) : p.lineTo(x, y); }
  g.strokeStyle = 'rgba(20,20,24,0.4)'; g.lineWidth = 1; g.stroke(p);
}

// tyre walls where the run-off ends on the outside of the corners (cars really do stop there)
function barriers(g, T, A, holes = []) {
  const lim = T.def.runoff || RUNOFF, dist = distField(T), hedge = []; let prev = null;
  for (const R of T.routes || [T]) {
    for (let i = 0; i < R.N; i += 4) {
      const k = R.curv[i]; if (Math.abs(k) < 1 / 300) continue;
      const side = -Math.sign(k), o = side * (R.hw[i] + lim + 12), x = R.pts[i][0] - R.tan[i][1] * o, y = R.pts[i][1] + R.tan[i][0] * o;
      if (dist(x, y, lim + 60) < lim + 4) continue;   // too close to another bit of road
      if (holes.some(h => nearPoly(h, x, y, 8))) continue;   // or in a ravine
      if (T.rail && Math.abs((x - T.rail.ax) * T.rail.uy - (y - T.rail.ay) * T.rail.ux) < 50 && (x - T.rail.ax) * T.rail.ux + (y - T.rail.ay) * T.rail.uy > -T.rail.ext - 50 && (x - T.rail.ax) * T.rail.ux + (y - T.rail.ay) * T.rail.uy < T.rail.len + T.rail.ext + 50) continue;   // or on a railway's ballast
      if (A.tex === 'bay' && !bayOf(T).inLoop(x, y)) continue;   // (Merge Bay: only in the park; outside it's the beach and the sea)
      if (R.mech && [...(R.mech.hurricane ? [R.mech.hurricane] : []), ...R.mech.banks, ...R.mech.crab].some(z => i * STEP > z.s0 - 100 && i * STEP < z.s1 + 100)) continue;   // a causeway, a seawall or a crab's beach: water there, not tyres
      if (A.kind === 'water') {   // Merge Bay's park: a low clipped hedge, not tyres
        hedge.push([x, y]);   // (drawn after, all in one go: one soft rounded hedge)
        continue;
      }
      if (A.kind === 'crab') {   // by the sea: weathered timber posts, a rope slung between them
        const pv = prev; prev = [x, y];   // (the post before, if it's the one just along)
        if (pv && Math.hypot(pv[0] - x, pv[1] - y) < 40) { g.strokeStyle = 'rgba(60,40,20,0.2)'; g.lineWidth = 2; g.beginPath(); g.moveTo(pv[0] + 2.5, pv[1] + 4); g.quadraticCurveTo((pv[0] + x) / 2 + 2.5, (pv[1] + y) / 2 + 7, x + 2.5, y + 4); g.stroke(); g.strokeStyle = '#d9c398'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(pv[0], pv[1]); g.quadraticCurveTo((pv[0] + x) / 2, (pv[1] + y) / 2 + 3, x, y); g.stroke(); }
        circ(g, x + 2.5, y + 3.5, 4.6); g.fillStyle = 'rgba(60,40,20,0.3)'; g.fill();
        circ(g, x, y, 4.4); g.fillStyle = '#6e5235'; g.fill(); circ(g, x - 0.8, y - 0.9, 3); g.fillStyle = '#a88a62'; g.fill(); circ(g, x - 1.2, y - 1.4, 1.2); g.fillStyle = '#d2bc96'; g.fill();
        continue;
      }
      if (A.kind === 'jungle') {   // a line of mossy boulders, not tyres
        const r = 5 + ((i * 7919) % 5) * 0.5;
        circ(g, x + 2.5, y + 3.5, r + 0.4); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fill();
        circ(g, x, y, r); g.fillStyle = (i / 4) % 3 ? '#8a8474' : '#77725f'; g.fill();
        circ(g, x - r * 0.3, y - r * 0.35, r * 0.55); g.fillStyle = (i / 4) % 2 ? '#6d8d43' : '#a7a08c'; g.fill();
        continue;
      }
      if (A.kind === 'chips') { pinHeader(g, x, y, Math.atan2(R.tan[i][1], R.tan[i][0])); continue; }   // Silicon Circuit: a pin header, not tyres
      const n = (i / 4) % 6, col = A.kind === 'factory' ? (Math.floor(i / 12) % 2 ? '#f2c94c' : '#23252d') : A.kind === 'space' ? (Math.floor(i / 24) % 2 ? '#7df9ff' : '#e8ecff') : A.kind === 'neon' ? (Math.floor(i / 24) % 2 ? '#00e5ff' : '#ff2bd6') : A.kind === 'chips' ? '#2a2d34' : A.kind === 'pharaoh' ? (Math.floor(i / 12) % 2 ? '#e8ad1f' : '#1f3f93') : (n < 3 ? '#1b1c20' : (Math.floor(i / 24) % 2 ? '#d8342c' : '#f1efe9'));
      circ(g, x + 2.5, y + 3.5, 5.6); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fill();
      circ(g, x, y, 5.4); g.fillStyle = col; g.fill(); circ(g, x, y, 2.4); g.fillStyle = col === '#f1efe9' ? '#b9b6ad' : '#0c0c0e'; g.fill();
      circ(g, x - 1.6, y - 1.8, 1.4); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fill();
    }
  }
  if (hedge.length) for (const [dx, dy, w, col] of [[3, 4, 18, 'rgba(40,80,40,0.14)'], [0, 0, 18, '#72bf62'], [-2.5, -3, 8, '#86cd72']]) {   // Merge Bay's hedges: one soft rounded line through the spots, a shadow and a lit top
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
    hedge.forEach(([x, y], k) => { const p = hedge[k - 1]; if (p && Math.hypot(p[0] - x, p[1] - y) < 30) g.lineTo(x + dx, y + dy); else g.moveTo(x + dx, y + dy); });
    g.stroke();
  }
}

// ---------------------------------------------------------------- start line, grid, gantry
function startLine(g, T) {
  const chequer = (s, gantry) => {
    const p = trackSample(T, s), hw = p.hw;
    g.save(); g.translate(p.x, p.y); g.rotate(Math.atan2(p.ty, p.tx));
    const rows = 10, sq = hw * 2 / rows;
    for (let i = 0; i < rows; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#1b1c22' : '#f6f6f2'; g.fillRect(-sq + j * sq, -hw + i * sq, sq, sq); }
    if (gantry) {   // an overhead gantry with start lights, and its shadow on the road
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-8 + 10, -hw - 30 + 14, 16, hw * 2 + 60);
      for (const sy of [-1, 1]) { g.fillStyle = '#3a3d45'; g.beginPath(); g.roundRect(-6, sy * (hw + 22) - 6, 12, 12, 2); g.fill(); }
      g.fillStyle = linear(g, -7, 0, 7, 0, [[0, '#4b4f58'], [0.5, '#9aa0a9'], [1, '#3e424a']]); g.fillRect(-7, -hw - 26, 14, hw * 2 + 52);
      for (let k = -2; k <= 2; k++) { g.fillStyle = '#16171b'; g.beginPath(); g.roundRect(-5, k * 13 - 5, 10, 10, 2); g.fill(); g.fillStyle = '#7a1c1c'; g.beginPath(); g.arc(0, k * 13, 3.2, 0, TAU); g.fill(); }
    }
    g.restore();
  };
  // grid boxes: painted brackets where the cars line up
  const slot = (s, lat) => {
    const p = trackSample(T, s); g.save(); g.translate(p.x + p.nx * lat, p.y + p.ny * lat); g.rotate(Math.atan2(p.ty, p.tx));
    g.strokeStyle = 'rgba(245,245,240,0.85)'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(34, -18); g.lineTo(40, -18); g.lineTo(40, 18); g.lineTo(34, 18); g.stroke(); g.restore();
  };
  for (let i = 0; i < 6; i++) { const s = T.open ? 420 - i * 96 : T.L - 90 - i * 96; slot(s, (i % 2 ? -1 : 1) * halfWAt(T, s) * 0.42); }
  chequer(0, !T.open);
  if (T.open) {
    if (T.finishS !== undefined) chequer(T.finishS, true);
    if (T.sectors) for (let k = 1; k < T.sectors; k++) {
      const p = trackSample(T, T.finishS * k / T.sectors), hw = p.hw;
      g.save(); g.translate(p.x, p.y); g.rotate(Math.atan2(p.ty, p.tx));
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(-4, -hw, 8, hw * 2); g.fillStyle = '#f2a516'; for (let y = -hw; y < hw; y += 20) g.fillRect(-4, y, 8, 10);
      g.restore();
    }
  }
}

// ---------------------------------------------------------------- ramps
// Kickers across the road, drawn like the bridges: height reads as up the screen, so the sloped top is lifted off its
// footprint by its height, the side faces that look down the screen show below it, and its shadow falls down and to the
// right. A curved transition (shallow at the foot, steep at the lip) up to a steel lip; chevrons on the face and kerbs
// leading in. Built per theme: a timber trestle, a steel kicker on beams, packed rock, packed snow or a block of ice.
// A cannon (the ramp before a ravine) is longer and taller, with boost stripes up to it, guard rails and lamps on the
// lip; the low-g moon ramp is a station-steel kicker. render.js lifts karts up its face with the same profile.
export const RAMP_LIFT = 48;   // render.js: a kart lifted by 1 is drawn this many units up the screen
const rampSets = new WeakMap();
export function rampsOf(T) {
  let R = rampSets.get(T); if (R) return R;
  R = T.jumps.map(j => {
    const cannon = T.gaps.some(g => { let d = g.s0 - j.s; if (!T.open) d = ((d % T.L) + T.L) % T.L; return d >= 0 && d < 500; });
    return { s: j.s, len: cannon ? 150 : 104, H: cannon ? 28 : 18, cannon, moon: false };
  });
  for (const lg of T.mech ? T.mech.lowg : []) R.push({ s: lg.sR, len: 124, H: 22, cannon: false, moon: !lg.splash });   // (splash: an Earth leap, Moonshot's Causeway Leap: a plain ramp)
  for (const z of T.mech ? T.mech.cliffs : []) R.push({ s: z.sLip, len: 124, H: 26, cannon: true, moon: false, cliff: true });   // a cliff's kicker (drawn with the cliff, art/alpine.js)
  for (const k of T.mech ? T.mech.kickers : []) R.push({ s: k.s, len: KICK_LEN, H: KICK_H, cannon: false, moon: false, mid: (k.lat0 + k.lat1) / 2, half: (k.lat1 - k.lat0) / 2, lat0: k.lat0, lat1: k.lat1 });   // the Kicker Park's kickers, each across part of the road (race-kickers.js)
  if (T.mech && T.mech.ski) R.push(...T.mech.ski.ramps);   // Gradient Descent's park: its kickers, and the halfpipe's walls (own: drawn with the pipe, art/ski.js; race-ski.js)
  rampSets.set(T, R); return R;
}
// the kicker's height at d along it (d from -len at its foot to 0 at the lip): a curved transition, steepest at the lip
export const rampZ = (r, d) => d <= -r.len || d > 0 ? 0 : r.H * Math.pow((d + r.len) / r.len, 1.7);
const RAMP = {   // build, top face, side face, the dark inside, frame/trim, painted marks, lip stripes
  base:    { build: 'timber', top: '#bf9662', side: '#8a6440', dark: '#3a2715', frame: '#a57a4c', mark: '#fff8e8', lip: ['#ffcf33', '#1c1c20'] },
  sakura:  { build: 'timber', top: '#c99c6c', side: '#b03a2c', dark: '#4a1410', frame: '#d2452f', mark: '#fff3f6', lip: ['#f2c14e', '#5a1712'] },
  atoll:   { build: 'timber', top: '#b9ab8f', side: '#7e6f57', dark: '#2f2a22', frame: '#ece6d6', mark: '#ffffff', lip: ['#ff7a3c', '#f4f1e8'] },
  water:   { build: 'timber', top: '#b9ab8f', side: '#7e6f57', dark: '#2f2a22', frame: '#ece6d6', mark: '#ffffff', lip: ['#ff7a3c', '#f4f1e8'] },
  factory: { build: 'steel', top: '#8a8f99', side: '#5d626c', dark: '#1d1f25', frame: '#f2c94c', mark: '#f2c94c', lip: ['#f2c94c', '#23252d'], tread: true },
  lava:    { build: 'steel', top: '#6a6268', side: '#4a4247', dark: '#160f12', frame: '#7d7176', mark: '#ffb35c', lip: ['#ff8a2a', '#1c1416'], rivets: true, glow: '#ff7a1a' },
  chips:   { build: 'steel', top: '#2f7d55', side: '#1f5a3c', dark: '#0b2216', frame: '#c9a65a', mark: '#f2d27a', lip: ['#e8c25a', '#0f3322'], traces: true },
  space:   { build: 'steel', top: '#4a5280', side: '#2c3360', dark: '#0b0e22', frame: '#c3cbef', mark: '#7df9ff', lip: ['#a8bbff', '#1f2433'], strips: '#7df9ff' },
  neon:    { build: 'steel', top: '#2e3560', side: '#1c2240', dark: '#070a16', frame: '#ff2bd6', mark: '#00e5ff', lip: ['#00e5ff', '#1a1f3a'], strips: '#ff2bd6' },
  canyon:  { build: 'rock', top: '#c98652', side: '#b0603a', dark: '#5a2a18', frame: '#7a4a2a', mark: '#fff1dc', lip: ['#ffcf33', '#1c1c20'], strata: ['#d98f5a', '#b45f38', '#c8774a', '#9a4c2c'] },
  plateau: { build: 'rock', top: '#e2cfa6', side: '#b8462f', dark: '#5a2216', frame: '#8a3a26', mark: '#ffffff', lip: ['#ffd43b', '#3776ab'], strata: ['#c25236', '#b8462f', '#efe1c2', '#a8412b'], blocks: true },
  snow:    { build: 'snow', top: '#f4f8fc', side: '#cddcec', dark: '#7e93ad', frame: '#8a6a4a', mark: '#ff5a3c', lip: ['#ff5a3c', '#f6f8fb'] },
  ice:     { build: 'ice', top: '#cfe9f8', side: '#8cc3e4', dark: '#2e6c98', frame: '#ffffff', mark: '#2f7fd0', lip: ['#2f7fd0', '#f4f8fc'] },
  ski:     { build: 'timber', top: '#f6f9fc', side: '#a97f52', dark: '#3a2715', frame: '#2f6fd6', mark: '#e8392b', lip: ['#e8392b', '#f6f8fb'] },   // Gradient Descent's Big Air: a snow table on a timber frame
  alpine:  { build: 'timber', top: '#c39a68', side: '#8a6440', dark: '#3a2715', frame: '#d8342c', mark: '#ffffff', lip: ['#d8342c', '#f4f2ec'] },
};
function drawRamp(g, T, A, r) {
  const P = r.moon ? RAMP.space : RAMP[A.kind] || RAMP.base, rng = mulberry(Math.round(r.s) + 29), L = r.len;
  const Q = new Map(), qAt = d => { const k = Math.round(d * 2); let q = Q.get(k); if (!q) Q.set(k, q = trackSample(T, r.s + k / 2)); return q; };
  const wAt = r.half ? () => r.half : d => qAt(d).hw - 1, mid = r.mid || 0;   // (a kicker spans only part of the road: its middle and half-width across it, race-kickers.js)
  // a point on the ramp: d along it, y across (+ = the road's left normal), on its top (lifted by its height) or its foot
  const at = (d, y, up = 1) => { const q = qAt(d); return [q.x + q.nx * (mid + y), q.y + q.ny * (mid + y) - rampZ(r, d) * up]; };
  const D0 = -L, n = Math.ceil(L / 4), ds = []; for (let k = 0; k <= n; k++) ds.push(D0 + L * k / n);
  const qm = qAt(-L / 2), ql = qAt(0), LX = -Math.SQRT1_2, LY = -Math.SQRT1_2;   // toward the sun (top left)
  const faceCol = (nx, ny, base) => { const l = nx * LX + ny * LY; return l > 0 ? mix(base, '#ffffff', 0.16 * l) : mix(base, P.dark, -0.38 * l); };
  const edge = (y, up) => ds.map(d => at(d, typeof y === 'function' ? y(d) : y, up));
  const topPoly = (y0, y1, d0 = D0, d1 = 0) => { const e = ds.filter(d => d >= d0 - 0.01 && d <= d1 + 0.01); return [...e.map(d => at(d, y0(d))), ...e.reverse().map(d => at(d, y1(d)))]; };
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  // 1. kerbs leading in along both edges (a cannon's run-in is longer and has boost stripes painted on the road)
  const [kc1, kc2] = r.moon ? ['#7df9ff', '#e8ecff'] : A.kerb || ['#d8342c', '#f3f1ec'], run = r.cannon ? 150 : 70;
  for (let d = -L - run, k = 0; d < 0; d += 12, k++) for (const sd of [-1, 1]) {
    const a = qAt(d), b = qAt(Math.min(0, d + 12)), o = (q, e) => { const w = r.half ? mid + sd * (r.half + e) : sd * (q.hw + e); return [q.x + q.nx * w, q.y + q.ny * w]; };
    poly(g, [o(a, -4), o(a, 7), o(b, 7), o(b, -4)]); g.fillStyle = k % 2 ? kc2 : kc1; g.fill();
    poly(g, [o(a, 2), o(a, 7), o(b, 7), o(b, 2)]); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fill();
  }
  if (r.cannon) for (let k = 0; k < 3; k++) {   // boost chevrons on the run-in, brighter toward the ramp
    const d = -L - 30 - k * 34, w = wAt(d) * 0.78, c = (dd, y) => at(dd, y, 0);
    poly(g, [c(d - 10, -w), c(d + 12, 0), c(d - 10, w), c(d - 24, w), c(d - 2, 0), c(d - 24, -w)]);
    g.fillStyle = alpha(k % 2 ? '#ffcf33' : '#ff8a2a', 0.6 - k * 0.15); g.fill();
  }
  // 2. its shadow on the road: the footprint, the top cast down and to the right, and the walls between (soft edged).
  // Every piece wound the same way, so one nonzero fill is their union
  const sh = (d, y, k) => { const [x, yy] = at(d, y, 0), z = rampZ(r, d) * k; return [x + z * 1.5, yy + z * 2.1]; };
  const wind = P => { let a = 0; for (let i = 0; i < P.length; i++) { const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length]; a += x0 * y1 - x1 * y0; } return a < 0 ? P.slice().reverse() : P; };
  for (const [k, a] of [[1.14, 0.08], [1, 0.14], [0.84, 0.1]]) {
    const p = new Path2D(), add = P => { wind(P).forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y)); p.closePath(); };
    const ring = kk => [...ds.map(d => sh(d, wAt(d), kk)), ...ds.slice().reverse().map(d => sh(d, -wAt(d), kk))];
    const F = ring(0), S = ring(k); add(F); add(S);
    for (let i = 0; i < F.length; i++) { const j = (i + 1) % F.length; add([F[i], F[j], S[j], S[i]]); }
    g.fillStyle = `rgba(12,10,20,${a})`; g.fill(p);
  }
  // 3. the faces that look down the screen: the two sides (only one shows), and the drop at the lip if it faces down
  for (const sd of [-1, 1]) {
    const nx = qm.nx * sd, ny = qm.ny * sd; if (ny < 0.02) continue;
    const foot = edge(d => sd * wAt(d), 0), top = edge(d => sd * wAt(d)), face = [...foot, ...top.slice().reverse()], col = faceCol(nx, ny, P.side);
    sideFace(g, P, face, foot, top, col, rng, r);
  }
  if (ql.ty > 0.02) {
    const w = wAt(0), [ax, ay] = at(0, -w, 0), [bx, by] = at(0, w, 0), [cx, cy] = at(0, w), [ex, ey] = at(0, -w);
    const face = [[ax, ay], [bx, by], [cx, cy], [ex, ey]], col = faceCol(ql.tx, ql.ty, P.side);
    sideFace(g, P, face, [[ax, ay], [bx, by]], [[ex, ey], [cx, cy]], col, rng, r, true);
  }
  // 4. the top face: a gradient up the slope (the steep end catches the sun if it faces it), then its build
  const lit = (ql.tx + ql.ty) * Math.SQRT1_2, topP = topPoly(d => -wAt(d), d => wAt(d)), [fx, fy] = at(D0, 0), [lx, ly] = at(0, 0);
  poly(g, topP); g.fillStyle = linear(g, fx, fy, lx, ly, [[0, shade(P.top, -0.08)], [0.6, P.top], [1, shade(P.top, 0.16 * lit)]]); g.fill();
  g.save(); poly(g, topP); g.clip(); topFace(g, P, at, wAt, L, rng, r); g.restore();
  // chevrons up the face (a cannon gets full-width boost stripes)
  const chev = (d, w, col, k = 9) => { poly(g, [at(d - k, -w), at(d + k, 0), at(d - k, w), at(d - k * 2.1, w), at(d - k * 0.1, 0), at(d - k * 2.1, -w)]); g.fillStyle = col; g.fill(); };
  if (r.cannon) for (let k = 0; k < 4; k++) chev(-L * 0.2 - k * L * 0.18, wAt(0) * 0.86, alpha(k % 2 ? '#ffcf33' : '#ff8a2a', 0.92), 11);
  else for (const f of [0.66, 0.4]) chev(-L * f, wAt(0) * 0.42, alpha(P.mark, 0.85));
  // the foot: a steel plate where the ramp meets the road
  poly(g, topPoly(d => -wAt(d), d => wAt(d), D0, D0 + 5)); g.fillStyle = shade(P.top, -0.25); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(...at(D0, -wAt(D0))); g.lineTo(...at(D0, wAt(D0))); g.stroke();
  // 5. trim along both top edges, then the lip: a striped steel band, its bright leading edge, and the plate's edge below it
  for (const sd of [-1, 1]) { poly(g, topPoly(d => sd * wAt(d), d => sd * (wAt(d) - 4))); g.fillStyle = faceCol(qm.nx * sd, qm.ny * sd, P.frame); g.fill(); }
  const lipP = topPoly(d => -wAt(d), d => wAt(d), -8, 0); poly(g, lipP); g.fillStyle = P.lip[0]; g.fill();
  g.save(); poly(g, lipP); g.clip(); g.fillStyle = P.lip[1];
  for (let y = -wAt(0) - 16; y < wAt(0) + 16; y += 18) { poly(g, [at(-8, y), at(-8, y + 9), at(0, y + 15), at(0, y + 6)]); g.fill(); }
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(...at(0, -wAt(0))); g.lineTo(...at(0, wAt(0))); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1; g.beginPath(); g.moveTo(...at(-8, -wAt(-8))); g.lineTo(...at(-8, wAt(-8))); g.stroke();
  // 6. a cannon: guard rails along the sides of the face and a lamp post at each end of the lip
  if (r.cannon || r.moon) {
    for (const sd of [-1, 1]) {
      const post = d => { const [x, y] = at(d, sd * (wAt(d) - 2)); return [x, y, y - 9]; };
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2.5; g.beginPath(); for (let d = -L + 12; d <= 0; d += 18) { const [x, y] = post(d); g.moveTo(x + 2, y + 2); g.lineTo(x + 6, y - 4); } g.stroke();
      g.strokeStyle = shade(P.frame, -0.35); g.lineWidth = 2.6; g.beginPath(); for (let d = -L + 12; d <= 0; d += 18) { const [x, y, y2] = post(d); g.moveTo(x, y); g.lineTo(x, y2); } g.stroke();
      const rail = new Path2D(); ds.filter(d => d >= -L + 12).forEach((d, i) => { const [x, , y2] = post(d); i ? rail.lineTo(x, y2) : rail.moveTo(x, y2); });
      g.strokeStyle = shade(P.frame, -0.3); g.lineWidth = 3.4; g.stroke(rail); g.strokeStyle = r.moon ? '#e8ecff' : P.lip[0]; g.lineWidth = 1.8; g.stroke(rail);
    }
    for (const sd of [-1, 1]) {
      const q = qAt(0), o = sd * (q.hw + 14), x = q.x + q.nx * o, y = q.y + q.ny * o, top = y - r.H - 30, glow = r.moon ? '#9fdcff' : '#ffd36b';
      ell(g, x + 14, y + 18, 5, 3); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + 2, y + 2); g.lineTo(x + 2 + (r.H + 30) * 0.7, y + 2 + (r.H + 30) * 0.95); g.stroke();   // its shadow
      g.strokeStyle = '#3a3d45'; g.lineWidth = 3.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, top); g.stroke();
      g.strokeStyle = '#8a8f99'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 0.8, y - 1); g.lineTo(x - 0.8, top); g.stroke();
      g.fillStyle = radial(g, x, top, 0, x, top, 26, [[0, alpha(glow, 0.55)], [1, alpha(glow, 0)]]); circ(g, x, top, 26); g.fill();
      circ(g, x, top, 4.6); g.fillStyle = '#2a2c33'; g.fill(); circ(g, x, top, 3); g.fillStyle = mix(glow, '#ffffff', 0.55); g.fill();
    }
  }
  g.restore();
}
// a face of the ramp's body that shows below its top (a side, or the drop at the lip), in its build
function sideFace(g, P, face, foot, top, col, rng, r, front = false) {
  poly(g, face);
  if (P.build === 'timber' || P.build === 'steel') {   // an open frame: the dark inside, posts, braces, a stringer and a sill
    g.fillStyle = alpha(P.dark, 0.92); g.fill();
    g.save(); poly(g, face); g.clip();
    const n = foot.length - 1, step = front ? 6 : Math.max(1, Math.round(n / Math.max(2, Math.round(r.len / 22))));
    g.strokeStyle = col; g.lineWidth = P.build === 'steel' ? 2.6 : 2.2;
    g.beginPath();
    for (let i = 0; i <= n; i += front ? n : step) { if (top[i][1] - foot[i][1] > -1.5) continue; g.moveTo(foot[i][0], foot[i][1]); g.lineTo(top[i][0], top[i][1]); }
    if (!front) for (let i = 0; i + step <= n; i += step) { g.moveTo(foot[i][0], foot[i][1]); g.lineTo(top[i + step][0], top[i + step][1]); }
    g.stroke();
    if (front) { g.lineWidth = 1.2; g.strokeStyle = alpha(col, 0.7); for (let k = 1; k < 4; k++) { const f = k / 4; g.beginPath(); g.moveTo(foot[0][0] + (top[0][0] - foot[0][0]) * f, foot[0][1] + (top[0][1] - foot[0][1]) * f); g.lineTo(foot[1][0] + (top[1][0] - foot[1][0]) * f, foot[1][1] + (top[1][1] - foot[1][1]) * f); g.stroke(); } }
    g.restore();
    if (P.build === 'steel' && !front) { g.fillStyle = P.dark; for (let i = 0; i <= n; i += step) if (top[i][1] - foot[i][1] < -5) { circ(g, top[i][0], top[i][1] + 2.5, 1.1); g.fill(); } }
  } else if (P.build === 'rock') {   // packed rock: bands of strata (or sandstone blocks), darker toward the ground
    g.fillStyle = col; g.fill(); g.save(); poly(g, face); g.clip();
    const bands = 4; for (let k = 0; k < bands; k++) {
      const f0 = k / bands, f1 = (k + 1) / bands, lerpP = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      poly(g, [...foot.map((p, i) => lerpP(p, top[i], f0)), ...foot.map((p, i) => lerpP(p, top[i], f1)).reverse()]);
      g.fillStyle = alpha(P.strata[k % P.strata.length], 0.55); g.fill();
      if (P.blocks) { g.strokeStyle = alpha(P.dark, 0.35); g.lineWidth = 0.8; for (let i = k % 2 ? 2 : 0; i < foot.length; i += 4) { const a = lerpP(foot[i], top[i], f0), b = lerpP(foot[i], top[i], f1); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); } }
    }
    g.fillStyle = linear(g, 0, Math.max(...foot.map(p => p[1])), 0, Math.min(...top.map(p => p[1])), [[0, alpha(P.dark, 0.35)], [1, alpha(P.dark, 0)]]); poly(g, face); g.fill();
    g.restore();
  } else if (P.build === 'snow') {   // packed snow, blue in the shade at the bottom, lumps hanging over the top edge
    g.fillStyle = col; g.fill(); g.save(); poly(g, face); g.clip();
    g.fillStyle = linear(g, 0, Math.max(...foot.map(p => p[1])), 0, Math.min(...top.map(p => p[1])), [[0, alpha(P.dark, 0.4)], [1, alpha(P.dark, 0)]]); poly(g, face); g.fill();
    g.restore();
    g.fillStyle = '#ffffff'; for (let i = 1; i < top.length - 1; i += 2) { if (top[i][1] - foot[i][1] > -3 || rng() < 0.4) continue; ell(g, top[i][0], top[i][1] + 1.5, 2.5 + rng() * 2, 1.6 + rng()); g.fill(); }
  } else {   // ice: a translucent block, deep blue at the bottom, a bright rim along the top, a crack or two
    g.fillStyle = linear(g, 0, Math.max(...foot.map(p => p[1])), 0, Math.min(...top.map(p => p[1])), [[0, P.dark], [1, col]]); g.fill();
    g.save(); poly(g, face); g.clip(); g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 0.9;
    for (let k = 0; k < 3; k++) { const i = Math.floor(rng() * top.length); g.beginPath(); g.moveTo(...top[i]); g.lineTo(top[i][0] + (rng() - 0.5) * 8, (top[i][1] + foot[i][1]) / 2); g.lineTo(foot[i][0] + (rng() - 0.5) * 10, foot[i][1]); g.stroke(); }
    g.restore();
  }
  // its top edge catches the light; a crisp line along the bottom where it stands on the road
  g.strokeStyle = alpha('#ffffff', P.build === 'ice' || P.build === 'snow' ? 0.8 : 0.28); g.lineWidth = 1.2; g.beginPath(); top.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1; g.beginPath(); foot.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.stroke();
}
// the top face's surface, clipped to it: planks, tread plate, packed rock, groomed snow or glassy ice
function topFace(g, P, at, wAt, L, rng, r) {
  const W = wAt(0) + 4, line = (d0, y0, d1, y1, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(...at(d0, y0)); g.lineTo(...at(d1, y1)); g.stroke(); };
  if (P.build === 'timber') {   // planks across the road, each its own tone, nailed at the stringers
    for (let d = -L, k = 0; d < 0; d += 8, k++) {
      const t = rng(); poly(g, [at(d, -W), at(d, W), at(d + 8, W), at(d + 8, -W)]); g.fillStyle = t < 0.5 ? `rgba(0,0,0,${0.03 + t * 0.1})` : `rgba(255,240,210,${(t - 0.5) * 0.18})`; g.fill();
      line(d, -W, d, W, 'rgba(40,24,10,0.45)', 1);
      g.fillStyle = 'rgba(30,20,10,0.55)'; for (const y of [-W + 10, -W * 0.33, W * 0.33, W - 10]) { const [x, yy] = at(d + 4, y); g.fillRect(x - 0.7, yy - 0.7, 1.4, 1.4); }
    }
    for (let k = 0; k < 14; k++) { const d = -L + rng() * L, y = (rng() * 2 - 1) * W; line(d, y, d + 1, y + 6 + rng() * 14, 'rgba(60,36,16,0.18)', 0.8); }   // grain
  } else if (P.build === 'steel') {
    for (let d = -L; d < 0; d += 26) line(d, -W, d, W, alpha(P.dark, 0.45), 1.2);   // plate seams
    if (P.tread) for (let d = -L + 3, k = 0; d < -2; d += 6, k++) for (let y = -W + (k % 2) * 4; y < W; y += 8) { const sgn = (k % 2) ? 1 : -1; line(d - 1.4, y - 1.4 * sgn, d + 1.4, y + 1.4 * sgn, 'rgba(255,255,255,0.22)', 1.2); }
    if (P.rivets) for (let d = -L + 4; d < 0; d += 13) for (const y of [-W + 8, -W * 0.3, W * 0.3, W - 8]) { const [x, yy] = at(d, y); circ(g, x, yy, 1.4); g.fillStyle = 'rgba(20,14,16,0.6)'; g.fill(); circ(g, x - 0.4, yy - 0.4, 0.7); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fill(); }
    if (P.glow) for (let k = 0; k < 5; k++) { const d = -L + rng() * L * 0.9, y = (rng() * 2 - 1) * W * 0.7; line(d, y, d + 6 + rng() * 8, y + (rng() - 0.5) * 18, alpha(P.glow, 0.45), 1.4); }   // heat glowing in the seams
    if (P.traces) { for (let k = 0; k < 9; k++) { const y = (k / 8 * 2 - 1) * W * 0.85, d0 = -L + rng() * 20, d1 = -10 - rng() * 30; line(d0, y, d1, y, alpha(P.frame, 0.55), 1.4); const [x, yy] = at(d1, y); circ(g, x, yy, 2); g.fillStyle = alpha(P.frame, 0.75); g.fill(); } }
    if (P.strips) for (const y of [-W + 9, W - 9]) line(-L + 6, y, -4, y, alpha(P.strips, 0.75), 2);
  } else if (P.build === 'rock') {   // packed earth and rock: two worn wheel tracks, grit, a crack
    for (const y of [-W * 0.38, W * 0.38]) { poly(g, [at(-L, y - 10), at(0, y - 10), at(0, y + 10), at(-L, y + 10)]); g.fillStyle = 'rgba(70,30,10,0.12)'; g.fill(); }
    for (let k = 0; k < L * W * 0.04; k++) { const [x, y] = at(-L + rng() * L, (rng() * 2 - 1) * W); g.fillStyle = rng() < 0.5 ? 'rgba(80,40,20,0.3)' : 'rgba(255,240,215,0.3)'; g.fillRect(x, y, 1.6, 1.6); }
    for (let k = 0; k < 3; k++) { let d = -L + rng() * L * 0.8, y = (rng() * 2 - 1) * W * 0.8; g.strokeStyle = 'rgba(60,25,10,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(...at(d, y)); for (let j = 0; j < 3; j++) { d += 4 + rng() * 8; y += (rng() - 0.5) * 16; g.lineTo(...at(d, y)); } g.stroke(); }
  } else if (P.build === 'snow') {   // groomed corduroy up the face, sparkles
    for (let y = -W; y < W; y += 5) line(-L, y, 0, y, 'rgba(120,150,190,0.16)', 1.2);
    for (let k = 0; k < L * W * 0.02; k++) { const [x, y] = at(-L + rng() * L, (rng() * 2 - 1) * W); g.fillStyle = rng() < 0.7 ? '#ffffff' : 'rgba(150,185,220,0.5)'; g.fillRect(x, y, 1.4, 1.4); }
  } else {   // ice: glassy streaks up the face, frosted edges, cracks
    for (let k = 0; k < 7; k++) { const y = (rng() * 2 - 1) * W * 0.8, d0 = -L + rng() * L * 0.5; line(d0, y, Math.min(-2, d0 + 30 + rng() * 50), y + (rng() - 0.5) * 6, 'rgba(255,255,255,0.4)', 2 + rng() * 4); }
    for (let k = 0; k < 4; k++) { let d = -L + rng() * L, y = (rng() * 2 - 1) * W; g.strokeStyle = 'rgba(60,120,170,0.35)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(...at(d, y)); for (let j = 0; j < 4; j++) { d += (rng() - 0.3) * 12; y += (rng() - 0.5) * 18; g.lineTo(...at(Math.min(0, d), y)); } g.stroke(); }
  }
}
// ---------------------------------------------------------------- ravines: the gaps a cannon jump clears
// Seen from straight above with a touch of perspective: the opening (exactly the stretch the race treats as the gap,
// carried on across the run-off and out into the ground, tapering shut), its walls closing in toward a floor far
// below in bands of rock, and that floor (a river, deep ice, or boulders). Lit from the top left like everything
// else: the wall on the down-right side faces the light, the up-left wall is in shade and its rim throws a shadow in.
// The strata darken with depth but never go black, so you can always read what's down there.
const RAVINE = {
  canyon: { strata: ['#e3a468', '#c4673b', '#d6864f', '#a94d2b', '#cd7b4b', '#97442b', '#ba6339'], deep: '#43241a', floor: 'river', bed: '#7a4630', rock: '#a65a34', lip: '#f3c590', haze: '#d9a07a' },
  ice:    { strata: ['#e6f4fc', '#b5dcf2', '#cde8f8', '#95c8e8', '#aed6ef', '#7cb5dc', '#9ecdeb'], deep: '#1e405e', floor: 'ice', bed: '#1f6c78', rock: '#f4f9ff', lip: '#ffffff', haze: '#c4e6f4', snow: true },
  snow:   { strata: ['#b6bfca', '#919cab', '#a8b2be', '#7d8897', '#99a4b1', '#6f7a89'], deep: '#2d3746', floor: 'rocks', bed: '#4d5866', rock: '#8f99a6', lip: '#ffffff', haze: '#d6e2ee', snow: true },
};
const RGB = c => c[0] === '#' ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : (c.match(/[\d.]+/g) || [128, 128, 128]).slice(0, 3).map(Number);
const mix3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const css3 = (c, a = 1) => `rgba(${c.map(v => Math.round(Math.max(0, Math.min(255, v)))).join(',')},${a})`;
const hex3 = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
function ravineLook(A) {
  if (RAVINE[A.kind]) return RAVINE[A.kind];
  const base = mix3(RGB(hexish(A.ground)), [150, 138, 126], 0.45), tone = k => hex3(k > 0 ? mix3(base, [255, 255, 255], k) : mix3(base, [0, 0, 0], -k));
  return { strata: [0.25, 0.05, 0.18, -0.08, 0.1, -0.15].map(tone), deep: hex3(mix3(base, [24, 26, 34], 0.72)), floor: 'rocks', bed: tone(-0.45), rock: tone(-0.1), lip: tone(0.45), haze: tone(0.5) };
}
// a point within r of a closed polygon (or inside it)
function nearPoly(P, x, y, r) {
  let inside = false, best = Infinity;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, ay] = P[j], [bx, by] = P[i];
    if ((by > y) !== (ay > y) && x < ax + (bx - ax) * (y - ay) / (by - ay)) inside = !inside;
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(ax + dx * t - x, ay + dy * t - y));
  }
  return inside || best < r;
}
// the ravine's outline and its depth contours, in the gap's own frame (u along the road from s0, v across it, + left)
function ravineShape(T, gp, dist, marks, rng) {
  const len = gp.s1 - gp.s0, lim = T.def.runoff || RUNOFF, K = 10;
  const at = (u, v) => { const q = trackSample(T, gp.s0 + u); return [q.x + q.nx * v, q.y + q.ny * v]; }, hwAt = u => trackSample(T, gp.s0 + u).hw;
  let hwMax = 0; for (let u = 0; u <= len; u += 20) hwMax = Math.max(hwMax, hwAt(u));
  const full = hwMax + lim + 8;   // full width across the road and the whole run-off: anywhere a kart can be
  // past the run-off it runs on into the ground and tapers shut, stopping short of other road, ponds and landmarks
  const clearAt = (x, y, own) => dist(x, y, own + 40) > own - 25 && !(T.ponds || []).some(p => Math.hypot(p.x - x, p.y - y) < p.r * 1.3 + 24) && !marks.some(c => Math.hypot(c.x - x, c.y - y) < c.r + 24);
  // each end bends off a little, like a real crack, and runs out as far as it has room
  const cu = len / 2, bendP = (rng() * 2 - 1) * len * 0.45, bendM = (rng() * 2 - 1) * len * 0.45;
  const reach = (side, bend) => {
    let ext = 40;
    for (let e = 50; e <= 560; e += 10) {
      const p = [[cu + bend, full + e + 20], [cu * 0.3 + bend * 0.5, full + e * 0.6 + 20], [len - cu * 0.3 + bend * 0.5, full + e * 0.6 + 20], [bend * 0.1, full + e * 0.25 + 20], [len + bend * 0.1, full + e * 0.25 + 20]];
      if (!p.every(([u, v]) => { const [x, y] = at(u, side * v); return clearAt(x, y, v - hwAt(u)); })) break;
      ext = e;
    }
    return ext;
  };
  const extP = reach(1, bendP), extM = reach(-1, bendM), pts = [];
  const ph0 = rng() * TAU, ph1 = rng() * TAU, jag = (v, road) => (road ? 1.2 : 4) * Math.sin(v * 0.05 + ph0) + (rng() * 2 - 1) * (road ? 2 : 5);
  const lip = (u, v, k) => { const road = Math.abs(v) < hwAt(u) + 3; pts.push({ u: u + jag(v + k, road), v, road }); };
  // an end: out along one lip to a point, back along the other (narrowing like a crack, bending as it goes)
  const hu = p => len / 2 * Math.pow(Math.max(0, 1 - Math.pow(p, 2.2)), 0.6) * (1 - 0.3 * p), M = 24;
  const cap = (side, ext, bend) => {
    const at2 = (p, s) => pts.push({ u: cu + bend * p * p + s * hu(p) + (p > 0 && p < 1 ? (rng() * 2 - 1) * 5 : 0), v: side * (full + ext * p + (p > 0 ? (rng() * 2 - 1) * 3 : 0)), road: false });
    const s1 = side > 0 ? -1 : 1;   // going out along the near lip's side (u = 0) for +v, the far lip's side for -v
    for (let k = 0; k <= M; k++) at2(k / M, s1);
    for (let k = M - 1; k >= 1; k--) at2(k / M, -s1);
  };
  const midU = v => { const p = v > full ? (v - full) / extP : v < -full ? (-full - v) / extM : 0; return cu + (v > 0 ? bendP : bendM) * p * p; };
  for (let v = -full; v < full - 1; v += 8) lip(0, v, 0);
  cap(1, extP, bendP);
  for (let v = full; v > -full + 1; v -= 8) lip(len, v, ph1 * 40);
  cap(-1, extM, bendM);
  // the floor: the outline drawn in toward the middle (perspective), the walls in between in bands of strata
  const vTop = full + extP, vBot = -(full + extM), cv = (vTop + vBot) / 2, halfV = (vTop - vBot) / 2;
  const inset = len * 0.34, fu = 1 - inset / (len / 2), fv = Math.max(0.2, 1 - inset * 0.85 / halfV);
  const ease = t => (1 - 1 / (1 + 2.2 * t)) / (1 - 1 / 3.2);   // equal depths look thinner further down
  const n = pts.length, waves = [];
  for (let k = 0; k <= K; k++) { const m1 = 2 + k % 3, m2 = 7 + k, a = rng() * TAU, b = rng() * TAU; waves.push(i => 0.3 * Math.sin(TAU * m1 * i / n + a) + 0.12 * Math.sin(TAU * m2 * i / n + b)); }
  const tAt = (k, i) => k === 0 ? 0 : k === K ? 1 : k === 1 ? 0.022 + 0.008 * waves[1](i) : 0.03 + (k - 1 + waves[k](i)) / (K - 1) * 0.97;
  const C = [];
  for (let k = 0; k <= K; k++) C.push(pts.map((p, i) => { const f = ease(tAt(k, i)); return at(p.u + (cu + (p.u - cu) * fu - p.u) * f, p.v + (cv + (p.v - cv) * fv - p.v) * f); }));
  return { len, K, pts, C, at, cu, cv, midU, uHalf: len / 2 * fu, vLo: cv - halfV * fv, vHi: cv + halfV * fv };
}
const trace = (p, P, dx = 0, dy = 0) => { P.forEach(([x, y], i) => i ? p.lineTo(x + dx, y + dy) : p.moveTo(x + dx, y + dy)); p.closePath(); return p; };
function boulder(g, x, y, r, col, rng, deep) {
  const sh = [], body = [];
  for (let k = 0; k < 7; k++) { const a = k / 7 * TAU, q = r * (0.75 + rng() * 0.35); body.push([x + Math.cos(a) * q, y + Math.sin(a) * q * 0.85]); sh.push([x + Math.cos(a) * q + r * 0.35, y + Math.sin(a) * q * 0.85 + r * 0.45]); }
  poly(g, sh); g.fillStyle = css3(deep, 0.45); g.fill();
  poly(g, body); g.fillStyle = radial(g, x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1, [[0, css3(mix3(col, [255, 255, 255], 0.3))], [0.6, css3(col)], [1, css3(mix3(col, deep, 0.45))]]); g.fill();
}
function ravineFloor(g, R, S, A, rng) {
  const { at, len, midU, uHalf, vLo, vHi } = S, F = S.C[S.K], deep = RGB(R.deep), bed = RGB(R.bed);
  g.fillStyle = css3(bed); g.fill(trace(new Path2D(), F));
  const along = (uf, step = 8) => { const p = new Path2D(); let k = 0; for (let v = vLo - 30; v <= vHi + 30; v += step, k++) { const [x, y] = at(uf(v), v); k ? p.lineTo(x, y) : p.moveTo(x, y); } return p; };
  const spot = () => { const v = vLo + rng() * (vHi - vLo); return [midU(v) + (rng() * 2 - 1) * uHalf * 0.9, v]; };
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (R.floor === 'river') {   // a thin river winding along the bottom, with sandbanks, ripples and rocks
    const a = rng() * TAU, b = rng() * TAU, ru = v => midU(v) + uHalf * (0.32 * Math.sin(v * 0.028 + a) + 0.14 * Math.sin(v * 0.067 + b)), river = along(ru);
    for (let k = 0; k < 10; k++) { const [u, v] = spot(); const [x, y] = at(u, v); ell(g, x, y, 6 + rng() * 10, 3 + rng() * 4, rng() * 3); g.fillStyle = css3(mix3(bed, [0, 0, 0], 0.15), 0.6); g.fill(); }
    g.strokeStyle = css3(mix3(bed, [230, 190, 140], 0.35)); g.lineWidth = len * 0.11; g.stroke(river);   // wet sand
    g.strokeStyle = '#2c7690'; g.lineWidth = len * 0.065; g.stroke(river);
    g.strokeStyle = '#4ea4ba'; g.lineWidth = len * 0.028; g.stroke(river);
    g.strokeStyle = 'rgba(220,246,250,0.7)'; g.lineWidth = 1.4; g.setLineDash([5, 17]); g.stroke(along(v => ru(v) - len * 0.012)); g.setLineDash([3, 23]); g.stroke(along(v => ru(v) + len * 0.016)); g.setLineDash([]);
    for (let k = 0; k < 14; k++) { const [u, v] = spot(); if (Math.abs(u - ru(v)) < len * 0.05) continue; const [x, y] = at(u, v); boulder(g, x, y, 2.5 + rng() * 5, mix3(RGB(R.rock), deep, 0.25), rng, deep); }
  } else if (R.floor === 'ice') {   // deep blue-green ice at the bottom, a paler seam down the middle, cracks and a glint
    g.strokeStyle = css3([45, 145, 152], 0.7); g.lineWidth = uHalf * 1.1; g.stroke(along(midU, 12));
    g.strokeStyle = css3([96, 192, 196], 0.5); g.lineWidth = uHalf * 0.4; g.stroke(along(v => midU(v) + uHalf * 0.12 * Math.sin(v * 0.04), 12));
    g.strokeStyle = 'rgba(190,240,244,0.4)'; g.lineWidth = 1;
    for (let k = 0; k < 12; k++) { let [u, v] = spot(); g.beginPath(); for (let j = 0; j < 4; j++) { const [x, y] = at(u, v); j ? g.lineTo(x, y) : g.moveTo(x, y); u += (rng() * 2 - 1) * 10; v += (rng() * 2 - 1) * 16; } g.stroke(); }
    for (let k = 0; k < 7; k++) { const [u, v] = spot(), [x, y] = at(u, v), r = 3 + rng() * 5; poly(g, [[x - r, y + r * 0.3], [x - r * 0.2, y - r], [x + r, y - r * 0.2], [x + r * 0.4, y + r]]); g.fillStyle = css3([168, 222, 238], 0.85); g.fill(); poly(g, [[x - r, y + r * 0.3], [x - r * 0.2, y - r], [x + r * 0.1, y]]); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fill(); }
    const gv = vLo + (vHi - vLo) * 0.3, [gx, gy] = at(midU(gv) - uHalf * 0.3, gv);
    star(g, gx, gy, 7, 4, 0.22, 0); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill(); circ(g, gx, gy, 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.5; for (const [du, dv, l] of [[-0.55, 0.12, 22], [-0.5, 0.55, 14], [0.1, 0.8, 10]]) { const v0 = vLo + (vHi - vLo) * dv, [x0, y0] = at(midU(v0) + uHalf * du, v0), [x1, y1] = at(midU(v0) + uHalf * du, v0 + l); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  } else {   // boulders and scree (snow on them in the snow)
    for (let k = 0; k < 120; k++) { const [u, v] = spot(), [x, y] = at(u, v); g.fillStyle = css3(rng() < 0.5 ? mix3(bed, [0, 0, 0], 0.25) : mix3(bed, [255, 255, 255], 0.2), 0.7); g.fillRect(x, y, 1.6, 1.6); }
    if (R.snow) for (let k = 0; k < 9; k++) { const [u, v] = spot(), [x, y] = at(u, v); ell(g, x, y, 6 + rng() * 12, 4 + rng() * 6, rng() * 3); g.fillStyle = 'rgba(232,240,248,0.75)'; g.fill(); }
    for (let k = 0; k < 16; k++) { const [u, v] = spot(), [x, y] = at(u, v), r = 2.5 + rng() * 6; boulder(g, x, y, r, mix3(RGB(R.rock), deep, 0.3), rng, deep); if (R.snow && rng() < 0.6) { ell(g, x - r * 0.25, y - r * 0.35, r * 0.6, r * 0.38); g.fillStyle = 'rgba(240,246,252,0.9)'; g.fill(); } }
  }
}
function ravine(g, T, A, gp, dist, marks) {
  const R = ravineLook(A), rng = mulberry(Math.round(gp.s) + 11), S = ravineShape(T, gp, dist, marks, rng), { pts, C, K } = S, n = pts.length;
  const rimP = C[0], rim = trace(new Path2D(), rimP), deep = RGB(R.deep), strata = R.strata.map(RGB), LX = Math.SQRT1_2, LY = Math.SQRT1_2;
  const out = rimP.map((p, i) => { const f = C[K][i], dx = p[0] - f[0], dy = p[1] - f[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; });   // from the floor out to the rim
  const road = RGB(hexish(A.road)), soil = R.snow ? [244, 249, 253] : mix3(RGB(hexish(A.ground)), [0, 0, 0], 0.12), warm = [255, 244, 226];
  g.strokeStyle = 'rgba(0,0,0,0.1)'; g.lineWidth = 10; g.lineJoin = 'round'; g.stroke(rim);   // the ground dips a little toward the edge
  g.save(); g.clip(rim);
  g.fillStyle = css3(deep); g.fill(rim);
  ravineFloor(g, R, S, A, rng);
  // the walls: quads between depth contours, each band a stratum, darker with depth, lit by which way it faces
  g.lineWidth = 0.9; g.lineJoin = 'round';
  const off = Math.floor(rng() * strata.length);
  for (let k = 0; k < K; k++) {
    const dk = Math.pow(k / (K - 1), 1.1) * 0.74, A0 = C[k], A1 = C[k + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, L = ((out[i][0] + out[j][0]) * LX + (out[i][1] + out[j][1]) * LY) / 2;
      let c = k === 0 ? (pts[i].road && pts[j].road ? mix3(road, [0, 0, 0], 0.25) : soil) : strata[(k + off) % strata.length];
      c = mix3(c, deep, dk);
      c = L > 0 ? mix3(c, warm, L * 0.28 * (1 - dk)) : mix3(c, deep, -L * 0.5);
      poly(g, [A0[i], A0[j], A1[j], A1[i]]); g.fillStyle = g.strokeStyle = css3(c); g.fill(); g.stroke();
    }
  }
  if (D > 0.5) for (let i = 0; i < n; i++) {   // gullies running down the walls
    if (rng() > 0.09) continue;
    const k0 = 1 + Math.floor(rng() * 4), k1 = Math.min(K, k0 + 3 + Math.floor(rng() * 5)), j = (i + 1) % n;
    g.beginPath(); for (let k = k0; k <= k1; k++) { const w = rng() * 0.6, x = C[k][i][0] + (C[k][j][0] - C[k][i][0]) * w, y = C[k][i][1] + (C[k][j][1] - C[k][i][1]) * w; k > k0 ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.strokeStyle = css3(deep, 0.2); g.lineWidth = 1 + rng() * 1.6; g.stroke();
  }
  // haze settling in the depths, then the shadow the up-left rim throws in (soft: a few shifted copies of the outline)
  for (const [k, a] of [[K - 4, 0.08], [K - 2, 0.08], [K, 0.07]]) { g.fillStyle = alpha(R.haze, a); g.fill(trace(new Path2D(), C[k])); }
  for (const f of [0.05, 0.11, 0.19, 0.29, 0.42]) { const d = S.len * f, p = trace(new Path2D(), rimP); trace(p, rimP, d * LX, d * LY); g.fillStyle = css3(deep, 0.1); g.fill(p, 'evenodd'); }
  // fallen chunks of road on the top of the wall below the road's edge
  if (D > 0.5) for (let i = 0; i < n; i++) if (pts[i].road && rng() < 0.35) { const d = 5 + rng() * 22, [x, y] = rimP[i], cx = x - out[i][0] * d, cy = y - out[i][1] * d, r = 1.5 + rng() * 2.5; poly(g, [[cx - r, cy], [cx, cy - r], [cx + r, cy + r * 0.3], [cx - r * 0.2, cy + r]]); g.fillStyle = css3(mix3(road, deep, 0.35)); g.fill(); }
  g.restore();
  // the rim: a dark break line, a crisp lit lip just outside it (lighter where it's the road's broken edge)
  g.strokeStyle = css3(deep, 0.6); g.lineWidth = 2; g.stroke(rim);
  const lipAt = (i, d) => [rimP[i][0] + out[i][0] * d, rimP[i][1] + out[i][1] * d];
  g.strokeStyle = alpha(R.lip, 0.75); g.lineWidth = 1.6; g.stroke(trace(new Path2D(), rimP.map((_, i) => lipAt(i, 1.8))));
  g.strokeStyle = css3(mix3(road, [255, 255, 255], 0.3), 0.85); g.lineWidth = 1.8; g.lineCap = 'round';
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; if (!pts[i].road || !pts[j].road) continue; const a = lipAt(i, 1.8), b = lipAt(j, 1.8); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  // icicles hanging from the lip into a crevasse
  if (R.floor === 'ice') for (let i = 0; i < n; i += 2) {
    if (rng() < 0.35) continue;
    const [x, y] = rimP[i], ix = -out[i][0], iy = -out[i][1], px = -iy, py = ix, l = (pts[i].road ? 5 : 7) + rng() * 12, w = 1.8 + rng() * 1.8;
    poly(g, [[x + px * w, y + py * w], [x - px * w, y - py * w], [x + ix * l, y + iy * l]]); g.fillStyle = 'rgba(232,247,255,0.92)'; g.fill();
    poly(g, [[x + px * w, y + py * w], [x, y], [x + ix * l, y + iy * l]]); g.fillStyle = 'rgba(150,200,230,0.5)'; g.fill();
  }
  if (D > 0.5) for (let i = 0; i < n; i++) {
    const [x, y] = rimP[i], [ox, oy] = out[i];
    if (pts[i].road) {   // the asphalt breaks up at the edge: loose chunks and cracks running back from it
      if (rng() < 0.45) { const d = 3 + rng() * 6, cx = x + ox * d + oy * (rng() - 0.5) * 6, cy = y + oy * d - ox * (rng() - 0.5) * 6, r = 1.6 + rng() * 2; poly(g, [[cx - r, cy - r * 0.4], [cx + r * 0.3, cy - r], [cx + r, cy + r * 0.2], [cx - r * 0.1, cy + r]]); g.fillStyle = css3(mix3(road, [0, 0, 0], 0.18)); g.fill(); g.strokeStyle = css3(mix3(road, [255, 255, 255], 0.25), 0.7); g.lineWidth = 0.8; g.stroke(); }
      if (rng() < 0.22) { let cx = x, cy = y; g.beginPath(); g.moveTo(cx, cy); for (let k = 0; k < 3; k++) { const d = 4 + rng() * 7, sd = (rng() - 0.5) * 7; cx += ox * d + oy * sd; cy += oy * d - ox * sd; g.lineTo(cx, cy); } g.strokeStyle = 'rgba(20,20,24,0.45)'; g.lineWidth = 1; g.stroke(); }
    } else if (rng() < 0.3) {   // rocks (or snow clumps) along the edge
      const d = 4 + rng() * 12, cx = x + ox * d, cy = y + oy * d, r = 2.2 + rng() * 4;
      if (R.snow) { ell(g, cx + r * 0.4, cy + r * 0.5, r * 1.2, r * 0.8); g.fillStyle = 'rgba(110,145,185,0.35)'; g.fill(); ell(g, cx, cy, r * 1.2, r * 0.8); g.fillStyle = '#f7fbff'; g.fill(); ell(g, cx - r * 0.35, cy - r * 0.3, r * 0.5, r * 0.3); g.fillStyle = '#ffffff'; g.fill(); }
      else boulder(g, cx, cy, r, RGB(R.rock), rng, mix3(deep, [0, 0, 0], 0.2));
    }
  }
  return rimP;
}
// every gap on the track; returns their outlines (to keep props out of them)
function gaps(g, T, A, dist, marks) {
  return T.gaps.map(gp => {
    const rimP = A.kind === 'neon' ? neonGap(g, T, gp) : ravine(g, T, A, gp, dist, marks);   // (Neon Overflow's Gap: an alley between two roofs, art/neon.js)
    // warning stripes at the near edge
    const e = trackSample(T, gp.s0 - 14);
    g.save(); g.translate(e.x, e.y); g.rotate(Math.atan2(e.ty, e.tx)); g.fillStyle = '#ffcf33'; g.fillRect(-5, -e.hw, 10, e.hw * 2); g.fillStyle = '#1c1c20'; for (let y = -e.hw; y < e.hw; y += 16) g.fillRect(-5, y, 10, 8); g.restore();
    return rimP;
  });
}
function forks(g, T) {
  if (!T.forks || !T.forkS) return;
  T.forks.forEach((f, k) => {
    const fs = T.forkS[k]; if (!fs) return;
    if (f.split) { splitArt(g, T, T.routes[fs.alt], fs); return; }
    if (f.gate || f.thicket) return;   // a logic gate's fork, a thicket's: draw-mechanics.js paints its own
    forkArt(g, T, T.routes[fs.alt], fs, k);   // two painted lanes, a gore and signs naming the roads (art/bay.js)
  });
}
// A long split (Kernel Pretzel): both roads painted all the way in, so you can see the choice from far off. On the
// approach the road is two lanes, each with its own train of big arrows that follows its road apart (the outside road's
// white, the inside road's lava orange) and a pictogram (a loop, a volcano). Where they part, hatching fills the gore
// from its tip, the commit point (past it you're on whichever road you're nearer), to the nose, where a crash cushion
// stands, and past it a sign with an arrow down each road.
const SPLIT_COL = ['#f4f7fb', '#ff9a3c'];   // outside road, inside road
function splitArt(g, T, alt, fs) {
  const hw = T.halfW, side = fs.side, sA = fs.s - 760, sGlyph = fs.s - 520;
  // how far the inside road's centreline is from this one's at s (+: toward the inside), and where that is on the inside road
  let q = null;
  const apart = s => { const p = trackSample(T, s); q = projectToTrack(alt, p.x, p.y, q ? q.s : s, 90); const a = trackSample(alt, q.s); return { o: Math.hypot(a.x - p.x, a.y - p.y), sa: q.s }; };
  const at = (R, s, lat) => { const p = trackSample(R, s); return [p.x + p.nx * lat, p.y + p.ny * lat]; };
  let sNose = fs.sLock, sNoseAlt = fs.sAlt, sSign = null, signGap = 0;
  const oTip = apart(fs.sLock).o;
  for (let s = fs.sLock; s < fs.sLock + 900; s += 4) { const a = apart(s); if (a.o < 2 * hw + 4) { sNose = s; sNoseAlt = a.sa; } else if (a.o - 2 * hw > 120) { sSign = s; signGap = a.o; break; } }
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  // the lane divider down the approach, running into the gore's tip
  q = null; const div = new Path2D();
  for (let s = sA, k = 0; s <= fs.sLock; s += 6, k++) { const [x, y] = at(T, s, side * apart(s).o / 2); k ? div.lineTo(x, y) : div.moveTo(x, y); }
  g.strokeStyle = 'rgba(245,245,240,0.85)'; g.lineWidth = 3; g.setLineDash([22, 18]); g.stroke(div); g.setLineDash([]);
  // the gore: a V from the tip to the nose, hatched
  q = null; const L = [], Rr = [];
  for (let s = fs.sLock; s <= sNose; s += 6) { const { o } = apart(s), w = 0.42 * hw * clamp((o - oTip) / (2 * hw - oTip), 0, 1); L.push(at(T, s, side * (o / 2 - w))); Rr.push(at(T, s, side * (o / 2 + w))); }
  if (L.length > 2) {
    const V = new Path2D(); [...L, ...Rr.reverse()].forEach(([x, y], i) => i ? V.lineTo(x, y) : V.moveTo(x, y)); V.closePath();
    g.save(); g.clip(V); const d0 = Math.hypot(L[L.length - 1][0] - L[0][0], L[L.length - 1][1] - L[0][1]) + hw * 2;
    g.strokeStyle = 'rgba(255,207,51,0.9)'; g.lineWidth = 7;
    for (let k = -2 * d0; k < 2 * d0; k += 20) { g.beginPath(); g.moveTo(L[0][0] + k - d0, L[0][1] - d0); g.lineTo(L[0][0] + k + d0, L[0][1] + d0); g.stroke(); }
    g.restore(); g.strokeStyle = 'rgba(245,245,240,0.92)'; g.lineWidth = 3; g.stroke(V);
  }
  // the arrow trains: each lane's arrows follow its own road, easing onto its middle as the roads part
  const ease = s => clamp((s - (fs.s - 150)) / Math.max(1, sNose - (fs.s - 150)), 0, 1);
  const train = (R, sEnd, sgn, col) => {
    const pts = []; for (let s = sA; s <= sEnd + 280; s += 8) pts.push(at(R, s, sgn * hw * 0.44 * (1 - ease(s))));
    for (let i = 4; i < pts.length - 4; i += 15) {
      if (Math.abs(sA + i * 8 - sGlyph) < 60) continue;   // (room for the pictogram)
      const [x, y] = pts[i], a = Math.atan2(pts[i + 3][1] - pts[i - 3][1], pts[i + 3][0] - pts[i - 3][0]);
      g.save(); g.translate(x, y); g.rotate(a);
      poly(g, [[-22, -5], [4, -5], [4, -14], [24, 0], [4, 14], [4, 5], [-22, 5]]);
      g.save(); g.translate(1.5, 2); g.fillStyle = 'rgba(20,16,22,0.35)'; g.fill(); g.restore();
      g.fillStyle = alpha(col, 0.9); g.fill(); g.restore();
    }
  };
  train(T, sNose, -side, SPLIT_COL[0]); train(alt, sNoseAlt, side, SPLIT_COL[1]);
  // a pictogram painted in each lane (upright on screen, like everything you read): a loop for the outside road, a
  // volcano for the inside one; or the track's own (`splitGlyphs`: Recursion Ridge's ramp and cliff)
  const names = T.def.splitGlyphs || ['loop', 'volcano'];
  const glyph = (s, sgn, kind) => {
    const p = trackSample(T, s), name = names[kind]; g.save(); g.translate(p.x + p.nx * sgn * hw * 0.44, p.y + p.ny * sgn * hw * 0.44); g.scale(1.35, 1.35);
    g.fillStyle = g.strokeStyle = alpha(SPLIT_COL[kind], 0.85);
    if (name === 'loop') { g.lineWidth = 6; g.beginPath(); g.arc(0, 2, 15, -Math.PI * 0.35, Math.PI * 1.25); g.stroke(); poly(g, [[8, -22], [20, -8], [3, -6]]); g.fill(); }
    else if (name === 'volcano') { poly(g, [[-22, 16], [-6, -10], [6, -10], [22, 16]]); g.fill(); g.beginPath(); g.arc(0, -16, 6, 0, TAU); g.arc(-8, -22, 4, 0, TAU); g.arc(7, -24, 4.5, 0, TAU); g.fill(); }
    else if (name === 'ramp') { poly(g, [[-22, -16], [22, 14], [22, 18], [-22, 18]]); g.fill(); }   // a long slope down
    else { poly(g, [[-22, -16], [-8, -16], [-8, 18], [-22, 18]]); g.fill(); g.fillRect(8, 10, 14, 8); g.lineWidth = 4; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(-6, -18); g.quadraticCurveTo(10, -30, 16, 6); g.stroke(); g.setLineDash([]); }   // a ledge, the drop and the flight
    g.restore();
  };
  glyph(sGlyph, -side, 0); glyph(sGlyph, side, 1);
  // the crash cushion at the nose: a row of yellow drums
  { const nose = at(T, sNose, side * (hw + 6)), b = at(alt, sNoseAlt + 40, -side * (alt.halfW + 6)), a = Math.atan2(b[1] - nose[1], b[0] - nose[0]);
    for (let k = 0; k < 3; k++) { const x = nose[0] + Math.cos(a) * k * 15, y = nose[1] + Math.sin(a) * k * 15;
      circ(g, x + 2.5, y + 3.5, 7.4); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill(); circ(g, x, y, 7); g.fillStyle = '#ffcf33'; g.fill(); g.strokeStyle = '#1c1c20'; g.lineWidth = 2; circ(g, x, y, 4.2); g.stroke(); } }
  // the sign in the gap past the nose: an arrow down each road, the way that road actually goes
  if (sSign !== null) {
    const [x, y] = at(T, sSign, side * signGap / 2), dir = (R, s) => { const p = trackSample(R, s); return Math.atan2(p.ty, p.tx); };
    const aL = dir(T, sSign + 160), aC = dir(alt, sNoseAlt + 200);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.roundRect(x - 44 + 9, y - 52 + 12, 88, 50, 7); g.fill();   // shadow, down-right
    g.fillStyle = '#4a4e57'; g.fillRect(x - 30, y - 8, 5, 16); g.fillRect(x + 25, y - 8, 5, 16);           // posts
    g.fillStyle = '#1d5f3b'; g.beginPath(); g.roundRect(x - 44, y - 56, 88, 50, 7); g.fill(); g.strokeStyle = '#f4f7fb'; g.lineWidth = 2.5; g.beginPath(); g.roundRect(x - 40, y - 52, 80, 42, 5); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x - 40, y - 52, 80, 6);
    for (const [cx, a, kind] of [[x - 19, aL, 0], [x + 19, aC, 1]]) {
      g.save(); g.translate(cx, y - 31); g.rotate(a); g.fillStyle = SPLIT_COL[kind];
      poly(g, [[-13, -3.5], [3, -3.5], [3, -9], [14, 0], [3, 9], [3, 3.5], [-13, 3.5]]); g.fill(); g.restore();
    }
  }
  g.restore();
}
// the railway's ballast and sleepers, a straight line right across the map (but not over `skip`: [d0, d1] stretches
// along it where it's on a bridge, drawn by the theme)
function rail(g, T, skip = []) {
  const R = T.rail; if (!R) return null;
  const X = R.ext, ends = [[R.ax - R.ux * X, R.ay - R.uy * X], [R.ax + R.ux * (R.len + X), R.ay + R.uy * (R.len + X)]];   // (X: how far past its ends it goes on, geometry.js)
  const pieces = [], at = d => [R.ax + R.ux * d, R.ay + R.uy * d];
  let from = -X; for (const [a, b] of [...skip].sort((p, q) => p[0] - q[0])) { if (a > from) pieces.push([from, a]); from = Math.max(from, b); } pieces.push([from, R.len + X]);
  g.lineCap = 'butt'; g.strokeStyle = '#a69a8a'; g.lineWidth = 66;
  for (const [a, b] of pieces) { g.beginPath(); g.moveTo(...at(a)); g.lineTo(...at(b)); g.stroke(); }
  g.strokeStyle = '#6b5440'; g.lineWidth = 8;
  for (let d = -X; d < R.len + X; d += 20) { if (skip.some(([a, b]) => d > a - 4 && d < b + 4)) continue; const x = R.ax + R.ux * d, y = R.ay + R.uy * d; g.beginPath(); g.moveTo(x - R.uy * 26, y + R.ux * 26); g.lineTo(x + R.uy * 26, y - R.ux * 26); g.stroke(); }
  return ends;
}
function railTop(g, T, ends) {
  const R = T.rail; if (!R) return;
  // at each level crossing, the road is laid with timber planks between and beside the rails (the ends cut along the road)
  for (const cr of R.crossings) {
    const P = (d, o) => [R.ax + R.ux * (cr.d + d) - R.uy * o, R.ay + R.uy * (cr.d + d) + R.ux * o];   // d along the rail from the crossing, o across it
    const tu = cr.tx * R.ux + cr.ty * R.uy, tp = -cr.tx * R.uy + cr.ty * R.ux, sl = tu / (Math.sign(tp) || 1) / Math.max(0.3, Math.abs(tp)), e = cr.span + 4;   // (the road's edges run at sl along the rail per unit across)
    poly(g, [P(-e - 22 * sl, -22), P(e - 22 * sl, -22), P(e + 22 * sl, 22), P(-e + 22 * sl, 22)]); g.fillStyle = '#5c4632'; g.fill();
    g.strokeStyle = 'rgba(30,18,8,0.5)'; g.lineWidth = 1;
    for (const o of [-14.5, -7, 7, 14.5]) { g.beginPath(); g.moveTo(...P(-e + o * sl, o)); g.lineTo(...P(e + o * sl, o)); g.stroke(); }
  }
  for (const o of [-14, 14]) { g.strokeStyle = '#4c525b'; g.lineWidth = 5; g.beginPath(); g.moveTo(ends[0][0] + R.uy * o, ends[0][1] - R.ux * o); g.lineTo(ends[1][0] + R.uy * o, ends[1][1] - R.ux * o); g.stroke(); g.strokeStyle = '#dfe4ea'; g.lineWidth = 1.8; g.stroke(); }
}
function pond(g, p) {
  const ring = (k, col) => { g.beginPath(); for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU, w = 1 + 0.07 * Math.sin(a * 3 + p.r) + 0.05 * Math.cos(a * 5 + 1); const x = p.x + Math.cos(a) * p.r * k * w * 1.25, y = p.y + Math.sin(a) * p.r * k * w * 0.9; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.fillStyle = col; g.fill(); };
  ring(1.12, '#cbbf9e'); ring(1.04, '#8a9a8a');
  const r = p.r * 1.2; ring(1, radial(g, p.x - r * 0.2, p.y - r * 0.2, 4, p.x, p.y, r, [[0, '#6fc3d6'], [0.7, '#3d9bb5'], [1, '#2c7e98']]));
  const rng = mulberry(Math.round(p.r * 13));
  for (let k = 0; k < 3; k++) {   // koi
    const a = rng() * TAU, d = p.r * 0.45 * rng(), x = p.x + Math.cos(a) * d * 1.2, y = p.y + Math.sin(a) * d * 0.8, h = rng() * TAU;
    g.save(); g.translate(x, y); g.rotate(h); ell(g, 0, 0, 7, 3); g.fillStyle = k % 2 ? '#ff8a3d' : '#f4f1ea'; g.fill(); poly(g, [[-6, 0], [-11, -3], [-11, 3]]); g.fill(); if (k % 2 === 0) { circ(g, 2, 0, 1.6); g.fillStyle = '#e8532b'; g.fill(); } g.restore();
  }
  for (let k = 0; k < 5; k++) {   // lily pads
    const a = rng() * TAU, x = p.x + Math.cos(a) * p.r * 0.85, y = p.y + Math.sin(a) * p.r * 0.6;
    g.beginPath(); g.moveTo(x, y); g.arc(x, y, 9, 0.4 + a, TAU + a - 0.1); g.closePath(); g.fillStyle = '#5aa35a'; g.fill(); g.strokeStyle = 'rgba(0,0,0,0.15)'; g.lineWidth = 1; g.stroke();
    if (k % 2) { circ(g, x + 2, y - 2, 3.2); g.fillStyle = '#ffd1e3'; g.fill(); }
  }
  g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.arc(p.x - p.r * 0.3, p.y - p.r * 0.2, p.r * 0.35, Math.PI * 1.1, Math.PI * 1.5); g.stroke();
}

// a geothermal pool on the ice: a snow rim melting into turquoise water, mineral bands, and steam
function hotSpring(g, p) {
  const ring = (k, col) => { g.beginPath(); for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU, w = 1 + 0.08 * Math.sin(a * 3 + p.r) + 0.05 * Math.cos(a * 5); const x = p.x + Math.cos(a) * p.r * k * w * 1.2, y = p.y + Math.sin(a) * p.r * k * w * 0.9; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.fillStyle = col; g.fill(); };
  ring(1.15, '#ffffff'); ring(1.05, '#e9d9a8'); ring(0.97, '#d9b56a');
  const r = p.r * 1.2; ring(0.9, radial(g, p.x - r * 0.15, p.y - r * 0.15, 4, p.x, p.y, r, [[0, '#9ff3f0'], [0.55, '#2fc0cf'], [1, '#147f9b']]));
  const rng = mulberry(Math.round(p.r * 17));
  for (let k = 0; k < 9; k++) { const a = rng() * TAU, d = rng() * p.r * 0.6, x = p.x + Math.cos(a) * d * 1.2, y = p.y + Math.sin(a) * d * 0.8, pr = p.r * (0.25 + rng() * 0.3); g.fillStyle = radial(g, x, y, 0, x, y, pr, [[0, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(x - pr, y - pr, pr * 2, pr * 2); }
}

// stands of snowy pines out in the open snowfields (Pipeline Pass is big, and the props alone leave it bare): clumps of
// pine props, well off the road and the run-off, clear of the other props (drawTrack keeps them off landmarks and ravines)
const stands = new WeakMap();
function pineStands(T, dist) {
  if (stands.has(T)) return stands.get(T);
  const B = T.bbox, rng = mulberry(T.N * 13 + 5), out = [], clear = T.halfW * 1.4 + 70;
  const free = (x, y, r) => dist(x, y, clear + r + 40) > clear + r && !(T.deco || []).some(d => Math.hypot(d.x - x, d.y - y) < (d.r + r) * 1.15) && !out.some(d => Math.hypot(d.x - x, d.y - y) < (d.r + r) * 0.85);
  for (let n = 0, tries = 0; n < B.w * B.h / 550000 && tries < 500; tries++) {
    const cx = B.x + rng() * B.w, cy = B.y + rng() * B.h, R = 110 + rng() * 130;
    if (dist(cx, cy, clear + R + 60) < clear + R * 0.5) continue;
    n++;
    for (let k = 0, m = 7 + Math.floor(rng() * 11); k < m * 3 && m > 0; k++) {
      const a = rng() * TAU, d = Math.sqrt(rng()) * R, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.8, r = 22 + rng() * 16;
      if (free(x, y, r)) { out.push({ x, y, r, v: rng() * 0.55 }); m--; }   // (v under 0.55: drawProp's snowy pine)
    }
  }
  stands.set(T, out); return out;
}

// ---------------------------------------------------------------- the whole track
export function drawTrack(g, T, detail = 1) {
  D = detail;
  const A = lookOf(T), rng = mulberry(T.N * 7 + 3), dist = distField(T);
  g.lineJoin = 'round'; g.lineCap = 'round';
  ground(g, T, A, rng, dist);
  traps(g, T, A);
  for (const p of T.ponds || []) (A.kind === 'ice' ? hotSpring : A.kind === 'pharaoh' ? oasis : A.kind === 'water' ? bayBasin : pond)(g, p);
  const works = A.kind === 'canyon' && T.rail ? canyonRailworks(T, dist) : null, railEnds = rail(g, T, works ? works.trestles : []);
  if (works) drawRailworks(g, T, works);   // trestles over the wash, cuttings through the ridges (art/canyon.js)
  if (A.kind === 'alpine') alpineWalls(g, T, D);   // the road's retaining walls and cuttings, under the road (art/alpine.js)
  if (A.kind === 'neon') neonSlab(g, T, D);   // the Spiral and the Skyway standing up off the street (art/neon.js)
  road(g, T, A, rng);
  kerbs(g, T, A);
  if (A.kind === 'chips') pcbTrim(g, T, D, dist);   // vias stitched along the gold shoulder (art/chips.js)
  railTop(g, T, railEnds);
  // scenery spots: a track's planets (gravity wells, race-lowg.js) are its landmarks where it has them, else the biggest clearings
  const sc = T.def.scale || 1, marks = T.def.planets ? T.def.planets.map(([x, y, r, look]) => ({ x: x * sc, y: y * sc, r: r * sc, look })) : findClearings(T, dist, A.kind);
  forks(g, T); for (const r of rampsOf(T)) if (!r.moon && !r.cliff && !r.own) drawRamp(g, T, A, r);
  if (A.kind === 'alpine') alpineStatic(g, T, A, D, drawRamp);
  if (A.kind === 'ski') skiStatic(g, T, A, D, drawRamp);   // the trees, poles, moguls, the Park, the Ledge, the Big Air, the start hut, the finish, the lodge, the chairlift (art/ski.js)   // cuttings and guard rails, the gorge bridge, the Cliff, the observatory and the cable car (art/alpine.js)
  const holes = gaps(g, T, A, dist, marks);
  startLine(g, T);
  if (A.kind === 'plateau') sunGateShadow(g, T);   // the Sun Gate's shadow across the Sun Road (the gate itself is a roof layer: render.js)
  if (D > 0.5 && A.kind !== 'alpine' && A.kind !== 'ski' && A.kind !== 'clock' && A.kind !== 'neon' && A.kind !== 'moonshot') barriers(g, T, A, holes);   // (on the mountain the guard rails and the walls do it; on the clocktower its railings, art/clock.js)
  // scenery: a landmark or two, then the props (shadows first, then the props on top), none of them over a ravine
  marks.forEach((c, i) => drawLandmark(g, c, A.kind, T, i));
  const land = A.tex === 'ocean' ? atollLand(T).onLand : A.tex === 'shore' ? shoreOf(T).onLand : A.tex === 'bay' ? bayOf(T).onLand : A.tex === 'alpine' ? terrainOf(T).H : null;   // (on the mountain: how high it stands)   // on an atoll or a coast, a prop is on land or out on the water
  const deco = [...(T.deco || []), ...(A.kind === 'snow' ? pineStands(T, dist) : [])].filter(d => !holes.some(h => nearPoly(h, d.x, d.y, d.r + 12)) && !marks.some(m => Math.hypot(m.x - d.x, m.y - d.y) < m.r * 1.15 + d.r) && !(T.keepOut || []).some(([x, y, r]) => Math.hypot(x - d.x, y - d.y) < r + d.r)).sort((a, b) => a.y - b.y);
  for (const d of deco) drawProp(g, d, A.kind, true, land);
  for (const d of deco) drawProp(g, d, A.kind, false, land);
  drawMechanicsStatic(g, T);
  for (const r of rampsOf(T)) if (r.moon) drawRamp(g, T, A, r);   // the low-g ramp sits over the crater's rim
}

// ---------------------------------------------------------------- bridges
// The upper deck where the track crosses itself, baked into its own layer that render.js draws over the cars below.
// Height reads as "up the screen": the deck's side shows as a band under its lower edge, its shadow falls down and to
// the right on the ground, piers stand either side of the lower road, and over the last stretch at each end the deck
// ramps down to the ground (side band and shadow shrink to nothing) and fades into the road it continues.
const BRIDGE = {   // per theme: deck side (light/dark), parapet top and outer edge, posts, piers, lamp light, extras
  crab:    { side: '#8a6a48', sideDk: '#4f3a26', rail: '#c9a77a', railDk: '#6b4f33', post: '#5c4330', pier: '#7a6450', lamp: '#ffe2a0', timber: true },
  base:    { side: '#9a9da4', sideDk: '#5f636b', rail: '#d9dbde', railDk: '#8b8f96', post: '#aeb2b8', pier: '#b3b6bb', lamp: '#ffe7a8' },
  sakura:  { side: '#a8382a', sideDk: '#5a1712', rail: '#d2452f', railDk: '#7e2219', post: '#e0523f', cap: '#f2c14e', pier: '#b9b2a6', lamp: '#ffcf70', lantern: true },
  canyon:  { side: '#8a5a33', sideDk: '#4f3018', rail: '#b07a46', railDk: '#5e3a1d', post: '#6b4423', pier: '#7a4f2b', lamp: '#ffd27a', timber: true },
  space:   { side: '#3c4475', sideDk: '#161a36', rail: '#c3cbef', railDk: '#5a6292', post: '#e8ecff', pier: '#4b5488', lamp: '#7df9ff', glow: '#7df9ff' },
  neon:    { side: '#2a3156', sideDk: '#0d1222', rail: '#3b4370', railDk: '#1c2240', post: '#ff2bd6', pier: '#262c4d', lamp: '#00e5ff', glow: '#ff2bd6' },
  lava:    { side: '#4d4247', sideDk: '#221a1d', rail: '#7d7176', railDk: '#3a3034', post: '#5c5156', pier: '#3f3539', lamp: '#ffab45', rivets: true },
  factory: { side: '#5d616b', sideDk: '#2c2f36', rail: '#f2c94c', railDk: '#23252d', post: '#23252d', pier: '#6d717a', lamp: '#fff1c2', hazard: true },
  snow:    { side: '#9aa6b4', sideDk: '#5e6a78', rail: '#cfd6de', railDk: '#7f8b98', post: '#b3bcc6', pier: '#a9b3be', lamp: '#ffe7a8', snow: true },
  ice:     { side: '#93acc4', sideDk: '#55708c', rail: '#d6e6f4', railDk: '#7f9ab4', post: '#b9cde0', pier: '#a3bad0', lamp: '#d9f2ff', snow: true },
  clock:   { side: '#5b4a3c', sideDk: '#2a211b', rail: '#c9962f', railDk: '#5c4318', post: '#2e2a28', pier: '#6d6258', lamp: '#ffd27a', rivets: true },
  moonshot: { side: '#cfcac0', sideDk: '#77736c', rail: '#eef1f5', railDk: '#9aa0a8', post: '#ff8a3c', pier: '#bdb7ab', lamp: '#7df9ff', glow: '#7df9ff', deck: '#4d5161' },   // (the Moon's bridges: its basalt road, white rails, cyan lamps)
  jungle:  { side: '#8c856f', sideDk: '#4a4636', rail: '#c2b896', railDk: '#7a7258', post: '#9a917a', pier: '#8a836d', lamp: '#ffcf6e', vines: true },
};
const DECK_RAMP = 80, DECK_SIDE = 15, PIER_H = 34, DECK_SHADOW = [28, 40];   // how long each end ramp is; the side band's height, how far the piers show below the deck, and the shadow's offset at full height

// the deck sampled every few units along its pass: track samples plus d (distance from the crossing) and z (0 at the
// ends of the ramps, 1 over the raised middle)
function deckSamples(T, Bd) {
  const span = Bd.s1 - Bd.s, n = Math.ceil((Bd.s1 - Bd.s0) / 4), S = [];
  for (let k = 0; k <= n; k++) {
    const s = Bd.s0 + (Bd.s1 - Bd.s0) * k / n, q = trackSample(T, s), e = Math.max(0, span - Math.abs(s - Bd.s));
    q.d = s - Bd.s; q.z = e >= DECK_RAMP ? 1 : (1 - Math.cos(Math.PI * e / DECK_RAMP)) / 2; S.push(q);
  }
  return S;
}
// a closed ribbon along the deck between lateral offsets a(q) and b(q), each point moved by off(q) = [dx, dy]
function ribbon(S, a, b, off, i0 = 0, i1 = S.length - 1) {
  const p = new Path2D(), at = (q, o, f) => [q.x + q.nx * o + f[0], q.y + q.ny * o + f[1]], Z = [0, 0];
  for (let i = i0; i <= i1; i++) { const [x, y] = at(S[i], a(S[i]), off ? off(S[i]) : Z); i === i0 ? p.moveTo(x, y) : p.lineTo(x, y); }
  for (let i = i1; i >= i0; i--) { const [x, y] = at(S[i], b(S[i]), off ? off(S[i]) : Z); p.lineTo(x, y); }
  p.closePath(); return p;
}
// a rectangle centred at (x, y), long side along (ux, uy)
function rect(x, y, ux, uy, len, wid) {
  const vx = -uy, vy = ux, a = len / 2, b = wid / 2;
  return [[x - ux * a - vx * b, y - uy * a - vy * b], [x + ux * a - vx * b, y + uy * a - vy * b], [x + ux * a + vx * b, y + uy * a + vy * b], [x - ux * a + vx * b, y - uy * a + vy * b]];
}

export function drawBridge(g, T, Bd) {
  const A = lookOf(T), P = { ...BRIDGE.base, ...(BRIDGE[A.kind] || {}) }, S = deckSamples(T, Bd), span = Bd.s1 - Bd.s, last = S.length - 1;
  const PW = P.timber ? 8 : 10, out = q => q.hw + PW, rng = mulberry(Math.round(Bd.s) + 7);
  const at = (q, o) => [q.x + q.nx * o, q.y + q.ny * o];
  const near = d => S.reduce((b, q) => Math.abs(q.d - d) < Math.abs(b.d - d) ? q : b, S[0]);
  g.save(); g.lineJoin = 'round'; g.lineCap = 'butt';
  // piers: one each side of the lower road (in its run-off), under the raised part of the deck, lined up with the road below
  const qu = trackSample(T, Bd.sUnder), piers = [];
  for (const side of [-1, 1]) {
    const off = side * (qu.hw + 38);
    let best = null; for (const q of S) { const e = (q.x - qu.x) * qu.nx + (q.y - qu.y) * qu.ny - off; if (q.z > 0.95 && (!best || Math.abs(e) < Math.abs(best.e))) best = { q, e }; }
    if (!best || Math.abs(best.e) > 8) continue;
    const q = best.q, sinA = Math.max(0.3, Math.abs(q.tx * qu.ty - q.ty * qu.tx));
    piers.push({ x: q.x, y: q.y, len: (q.hw + PW) * 2 / sinA + 34, wid: P.timber ? 12 : 20 });
  }
  // 1. the shadow on the ground below, deep under the middle and gone at the ends where the deck meets the ground
  const shadowOff = q => [DECK_SHADOW[0] * q.z, DECK_SHADOW[1] * q.z];
  for (let k = 0; k < 7; k++) { const o = 14 - k * 3; g.fillStyle = 'rgba(10,8,20,0.085)'; g.fill(ribbon(S, q => out(q) + o * q.z, q => -out(q) - o * q.z, shadowOff)); }   // soft edged: stacked, each a little narrower
  // 2. the piers (their caps peek out either side of the deck), with their own long shadows
  for (const p of piers) {
    const col = new Path2D();   // its shadow: the pier swept from its top down to the ground
    for (let t = 0; t <= 1.3; t += 0.1) { const r = rect(p.x + DECK_SHADOW[0] * t, p.y + DECK_SHADOW[1] * t, qu.tx, qu.ty, p.len, p.wid); r.forEach(([x, y], i) => i ? col.lineTo(x, y) : col.moveTo(x, y)); col.closePath(); }
    g.fillStyle = 'rgba(10,8,20,0.22)'; g.fill(col, 'nonzero');
    if (P.timber) {   // a timber trestle bent: two posts and a cross brace each side
      for (const e of [-1, 1]) {
        const ex = p.x + qu.tx * e * (p.len / 2 - 6), ey = p.y + qu.ty * e * (p.len / 2 - 6);
        for (let t = 1; t > 0; t -= 0.1) { poly(g, rect(ex, ey + PIER_H * t, qu.tx, qu.ty, 14, p.wid)); g.fillStyle = mix(P.pier, P.sideDk, t); g.fill(); }
        poly(g, rect(ex, ey, qu.tx, qu.ty, 14, p.wid)); g.fillStyle = P.pier; g.fill();
        g.strokeStyle = P.sideDk; g.lineWidth = 2; g.beginPath(); g.moveTo(ex - qu.tx * 6 - qu.nx * 5, ey - qu.ty * 6 - qu.ny * 5); g.lineTo(ex + qu.tx * 6 + qu.nx * 5, ey + qu.ty * 6 + qu.ny * 5); g.stroke();
      }
    } else {
      for (let t = 1; t > 0; t -= 0.1) { poly(g, rect(p.x, p.y + PIER_H * t, qu.tx, qu.ty, p.len, p.wid)); g.fillStyle = shade(P.pier, -0.15 - 0.3 * t); g.fill(); }   // the column below the deck's side
      poly(g, rect(p.x, p.y, qu.tx, qu.ty, p.len, p.wid)); g.fillStyle = linear(g, p.x - 10, p.y - 10, p.x + 10, p.y + 10, [[0, shade(P.pier, 0.12)], [1, shade(P.pier, -0.12)]]); g.fill();
    }
  }
  // 3. the deck's side: the footprint stacked from the bottom of the side band up to the deck, darkest at the bottom
  for (let k = 8; k >= 1; k--) {
    const t = k / 8; g.fillStyle = mix(P.side, P.sideDk, t * t);
    g.fill(ribbon(S, q => out(q), q => -out(q), q => [0, DECK_SIDE * q.z * t]));
  }
  if (P.timber || P.rivets || P.hazard) {   // girder stiffeners / timber planks down the side band
    g.strokeStyle = alpha(P.sideDk, 0.7); g.lineWidth = P.timber ? 1.2 : 2;
    for (let i = 0; i <= last; i += P.timber ? 2 : 6) for (const sd of [-1, 1]) {
      const q = S[i], h = DECK_SIDE * q.z; if (h < 3 || sd * q.ny < 0.15) continue;   // only the sides that face down the screen show
      const [x, y] = at(q, sd * out(q)); g.beginPath(); g.moveTo(x, y + 1); g.lineTo(x, y + h - 1); g.stroke();
    }
  }
  if (P.snow) {   // icicles under the side that faces down the screen
    g.fillStyle = 'rgba(240,248,255,0.95)';
    for (let i = 2; i < last; i += 3) for (const sd of [-1, 1]) {
      const q = S[i], h = DECK_SIDE * q.z; if (h < 6 || sd * q.ny < 0.3 || rng() < 0.35) continue;
      const [x, y] = at(q, sd * out(q)), l = 4 + rng() * 9; g.beginPath(); g.moveTo(x - 2.2, y + h - 1); g.lineTo(x + 2.2, y + h - 1); g.lineTo(x, y + h + l); g.closePath(); g.fill();
    }
  }
  if (P.vines) {   // vines hanging down the side that faces down the screen, a leaf here and there along them
    for (let i = 2; i < last; i += 2) for (const sd of [-1, 1]) {
      const q = S[i], h = DECK_SIDE * q.z; if (h < 5 || sd * q.ny < 0.2 || rng() < 0.45) continue;
      const [x, y] = at(q, sd * out(q)), l = h * (0.6 + rng() * 0.9), sw = (rng() - 0.5) * 6;
      g.strokeStyle = rng() < 0.5 ? '#3f6b2c' : '#4f7f33'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + sw, y + l * 0.6, x + sw * 0.4, y + l); g.stroke();
      for (let t = 0.3; t <= 1; t += 0.35) { ell(g, x + sw * t * 0.7 + 1.5, y + l * t, 2.6, 1.5, 0.6); g.fillStyle = '#5f9a3e'; g.fill(); }
    }
  }
  // 4. the road surface, grained like the road it continues, with its edge lines
  const deck = ribbon(S, q => q.hw, q => -q.hw);
  g.fillStyle = P.deck || A.road; g.fill(deck);   // (a theme's own deck colour, if it has one)
  g.save(); g.clip(deck);
  const tx = D > 0.5 ? texTiles() : null;
  if (tx) { g.fillStyle = tilePat(g, tx.grain, 0.55); g.fill(deck); g.fillStyle = tilePat(g, tx.grain, 0.42, 37, 31, 17); g.fill(deck); }
  // the parapets' shadow on the deck (down and to the right of each wall)
  for (const sd of [-1, 1]) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fill(ribbon(S, q => sd * (q.hw - 1), q => sd * (q.hw + PW), q => [3.5 * (0.4 + 0.6 * q.z), 5 * (0.4 + 0.6 * q.z)])); }
  // expansion joints where the ramps meet the raised deck, and a seam at each pier
  for (const d of [-(span - DECK_RAMP), span - DECK_RAMP]) {
    const q = near(d), [x0, y0] = at(q, q.hw), [x1, y1] = at(q, -q.hw);
    g.strokeStyle = 'rgba(20,20,26,0.55)'; g.lineWidth = 4; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = 'rgba(200,205,212,0.55)'; g.lineWidth = 1.2; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]);
  }
  for (let d = -(span - DECK_RAMP) + 60; d < span - DECK_RAMP - 30; d += 60) {   // concrete panel seams
    const q = near(d), [x0, y0] = at(q, q.hw), [x1, y1] = at(q, -q.hw);
    g.strokeStyle = 'rgba(0,0,0,0.13)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
  g.restore();
  g.save(); g.clip(deck); if (A.edge) { g.shadowColor = A.edge; g.shadowBlur = 10 * g.getTransform().a; }
  g.strokeStyle = A.edge || alpha('#f4f4f0', 0.92); g.lineWidth = 2.6; g.lineJoin = 'round';
  for (const sd of [-1, 1]) { const p = new Path2D(); S.forEach((q, i) => { const [x, y] = at(q, sd * (q.hw - 6)); i ? p.lineTo(x, y) : p.moveTo(x, y); }); g.stroke(p); }
  g.restore();
  // fade the road out over the last few units at each end, so it blends into the road underneath (things there show)
  g.save(); g.globalCompositeOperation = 'destination-out';
  for (const [iE, dir] of [[0, 1], [last, -1]]) {
    const n = 7, a = S[iE], b = S[iE + dir * n], gr = g.createLinearGradient(b.x, b.y, a.x, a.y); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gr; g.fill(ribbon(S, q => q.hw + 0.5, q => -q.hw - 0.5, null, Math.min(iE, iE + dir * n), Math.max(iE, iE + dir * n)));
  }
  g.restore();
  // 5. the parapets: a little side face, the outer edge, then the lit top; posts along them and a block at each end
  for (const sd of [-1, 1]) {
    const wall = ribbon(S, q => sd * q.hw, q => sd * out(q));
    g.fillStyle = P.sideDk; g.fill(ribbon(S, q => sd * q.hw, q => sd * out(q), q => [0, 2.5 + 2 * q.z]));
    g.fillStyle = P.railDk; g.fill(wall);
    g.fillStyle = P.rail; g.fill(ribbon(S, q => sd * (q.hw + 1.5), q => sd * (out(q) - 3)));
    if (P.hazard) for (let i = 0; i < last; i += 4) { if ((i / 4) % 2) continue; g.fillStyle = P.post; g.fill(ribbon(S, q => sd * (q.hw + 1.5), q => sd * (out(q) - 3), null, i, Math.min(last, i + 2))); }
    if (P.glow) { g.save(); g.shadowColor = P.glow; g.shadowBlur = 8 * g.getTransform().a; g.strokeStyle = P.glow; g.lineWidth = 1.6; const p = new Path2D(); S.forEach((q, i) => { const [x, y] = at(q, sd * (q.hw + PW * 0.45)); i ? p.lineTo(x, y) : p.moveTo(x, y); }); g.stroke(p); g.restore(); }
    if (P.snow) { g.fillStyle = 'rgba(250,253,255,0.96)'; g.fill(ribbon(S, q => sd * (q.hw + 2.5), q => sd * (out(q) - 2.5))); for (let i = 1; i < last; i += 2) { if (rng() < 0.5) continue; const [x, y] = at(S[i], sd * (S[i].hw + PW / 2)); circ(g, x, y, 3 + rng() * 2.5); g.fill(); } }
    if (P.vines) for (let i = 1; i < last; i += 2) {   // ivy over the parapet, in clumps, lit from the top left
      if (rng() < 0.55) continue; const [x, y] = at(S[i], sd * (S[i].hw + PW / 2 + (rng() - 0.5) * 6));
      for (let k = 0; k < 3; k++) { const lx = x + (rng() - 0.5) * 9, ly = y + (rng() - 0.5) * 9; ell(g, lx, ly, 3.4, 2.2, rng() * 3); g.fillStyle = '#365f26'; g.fill(); ell(g, lx - 0.8, ly - 0.8, 2.2, 1.3, rng() * 3); g.fillStyle = '#6aa646'; g.fill(); }
    }
    for (let i = 3; i < last - 2; i += P.lantern ? 8 : 6) {   // posts
      const q = S[i], [x, y] = at(q, sd * (q.hw + PW / 2));
      if (P.lantern) { circ(g, x + 1.5, y + 2, 4.6); g.fillStyle = P.sideDk; g.fill(); circ(g, x, y, 4.2); g.fillStyle = P.post; g.fill(); circ(g, x - 0.8, y - 0.8, 2); g.fillStyle = P.cap; g.fill(); }
      else if (P.timber) { g.fillStyle = P.sideDk; g.fillRect(x - 2.5, y - 2.5, 6, 6); g.fillStyle = P.post; g.fillRect(x - 3, y - 3, 5.5, 5.5); }
      else if (P.glow) { circ(g, x, y, 1.8); g.fillStyle = P.post; g.fill(); }
      else if (P.rivets) { circ(g, x, y, 1.6); g.fillStyle = '#2a2226'; g.fill(); circ(g, x - 0.5, y - 0.5, 0.8); g.fillStyle = '#9a8e93'; g.fill(); }
      else if (!P.hazard && !P.snow) { g.fillStyle = shade(P.railDk, -0.15); g.fillRect(x - 1, y - PW / 2 + 1, 2, PW - 2); }
    }
    for (const q of [S[1], S[last - 1]]) {   // end blocks where the deck meets the ground
      const [x, y] = at(q, sd * (q.hw + PW / 2)); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 6, y - 5, 14, 14);
      g.fillStyle = P.railDk; g.fillRect(x - 7.5, y - 7.5, 15, 15); g.fillStyle = P.rail; g.fillRect(x - 6, y - 6, 11, 11);
      if (P.snow) { circ(g, x - 0.5, y - 0.5, 5.5); g.fillStyle = '#fbfdff'; g.fill(); }
      if (P.lantern) { circ(g, x - 0.5, y - 0.5, 3.4); g.fillStyle = P.cap; g.fill(); }
    }
  }
  // 6. lamps on the parapets, alternating sides, each throwing a warm pool of light on the deck
  const lamps = [[-(span - DECK_RAMP - 24), 1], [0, -1], [span - DECK_RAMP - 24, 1]];
  for (const [d, sd] of lamps) {
    const q = near(d), [x, y] = at(q, sd * (q.hw + PW / 2)), [lx, ly] = at(q, sd * (q.hw - 26));
    g.save(); g.clip(deck); g.fillStyle = radial(g, lx, ly, 0, lx, ly, 46, [[0, alpha(P.lamp, 0.2)], [1, alpha(P.lamp, 0)]]); circ(g, lx, ly, 46); g.fill(); g.restore();
    circ(g, x + 2, y + 3, 6.5); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill();
    if (P.lantern) {   // a paper lantern on a red post
      g.fillStyle = P.railDk; g.fillRect(x - 4, y - 4, 8, 8);
      g.save(); g.shadowColor = P.lamp; g.shadowBlur = 12 * g.getTransform().a; ell(g, x, y - 2, 5.5, 6.5); g.fillStyle = '#ff9a4a'; g.fill(); g.restore();
      g.strokeStyle = 'rgba(120,30,20,0.6)'; g.lineWidth = 0.8; for (const k of [-2.5, 0.5, 3]) { g.beginPath(); g.moveTo(x - 5, y - 2 + k); g.lineTo(x + 5, y - 2 + k); g.stroke(); }
      g.fillStyle = '#3a1410'; g.fillRect(x - 3, y - 9.5, 6, 2); g.fillRect(x - 3, y + 4, 6, 2);
    } else {
      circ(g, x, y, 5); g.fillStyle = shade(P.railDk, -0.2); g.fill(); circ(g, x - 0.8, y - 0.8, 3.6); g.fillStyle = shade(P.rail, -0.1); g.fill();
      g.save(); g.shadowColor = P.lamp; g.shadowBlur = 12 * g.getTransform().a; circ(g, x, y, 2.6); g.fillStyle = mix(P.lamp, '#ffffff', 0.5); g.fill(); g.restore();
    }
  }
  g.restore();
}
export { mix };
