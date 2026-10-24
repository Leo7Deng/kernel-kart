// Fight mode's maps (js/fight.js runs the fight on one, fight-ai.js reads it, draw-arena.js draws it). DOM-free data plus
// the geometry the sim, the bots and the drawer share. World units like the fight's (a mascot ~46 tall), x right, y down
// the screen, every arena centred on (0, 0).
//
// An arena:
//   id, name, blurb       the setup screen's card
//   look                  the drawer's id for its art ('sky' the floating ring; the rest flat placeholders for now)
//   bounds                its outline, a solid wall all round: { shape: 'circle', r } | { shape: 'box', w, h, r (corner
//                         radius) } | { shape: 'poly', pts: [[x, y], ...] } (any simple polygon, either winding)
//   solids                obstacles inside that block walking and knockback (a wall-bounce off them like the walls), and
//                         Duke's coffee and Tux's clones: { kind ('pillar', 'crate', ...: the drawer's), shape: 'circle',
//                         x, y, r, tall } | { kind, shape: 'box', x, y, w, h, r (corner), tall }. tall: its height (a cup
//                         lobbed over it below that height hits it)
//   hazards               zones on the floor, each { kind, shape ('circle' x y r | 'box' x y w h r | 'poly' pts), ... }:
//                           ice    { grip }                    friction and grip times grip (0..1) while on it
//                           heat   { period, warn, on, at, dmg, kb }   a vent: every period s (from at s into the round)
//                                  it glows for warn s, then burns for on s: anyone on the ground in it loses dmg of
//                                  their max health and is popped up and away from its middle (kb), once per burn
//                           pad    { vz, push }                a bounce pad: stepping on throws you up (vz) and on
//                                  along your way (push)
//                           belt   { vx, vy }                  a conveyor: carries anyone on the ground on it
//   spawns                [[x, y], [x, y]]: where fighter 0 and 1 start each round (facing each other)
// Everything is plain numbers, so the online snapshot needs nothing: a fight's arena is its cfg.arena id.
export const ARENAS = {
  ring: {
    id: 'ring', name: 'Sky Ring', look: 'sky',
    blurb: 'The floating stone ring: open ground, a low wall all round. Pin them against it.',
    bounds: { shape: 'circle', r: 225 },
    solids: [], hazards: [],
    spawns: [[-95, 0], [95, 0]],
  },
  court: {
    id: 'court', name: 'Pillar Court', look: 'court',
    blurb: 'A square yard with four stone pillars: hide from coffee behind one, bounce them off another.',
    bounds: { shape: 'box', w: 450, h: 450, r: 30 },
    solids: [
      { kind: 'pillar', shape: 'circle', x: -105, y: -105, r: 24, tall: 90 },
      { kind: 'pillar', shape: 'circle', x: 105, y: -105, r: 24, tall: 90 },
      { kind: 'pillar', shape: 'circle', x: -105, y: 105, r: 24, tall: 90 },
      { kind: 'pillar', shape: 'circle', x: 105, y: 105, r: 24, tall: 90 },
    ],
    hazards: [],
    spawns: [[-150, 0], [150, 0]],
  },
  hall: {
    id: 'hall', name: 'Data Bus', look: 'hall',
    blurb: 'A long narrow hall: no circling round, two crates to dodge, and the side lanes run like conveyors.',
    bounds: { shape: 'box', w: 680, h: 190, r: 18 },
    solids: [
      { kind: 'crate', shape: 'box', x: -170, y: -42, w: 40, h: 40, r: 4, tall: 34 },
      { kind: 'crate', shape: 'box', x: 170, y: 42, w: 40, h: 40, r: 4, tall: 34 },
    ],
    hazards: [
      { kind: 'belt', shape: 'box', x: 0, y: -70, w: 600, h: 40, r: 0, vx: 55, vy: 0 },
      { kind: 'belt', shape: 'box', x: 0, y: 70, w: 600, h: 40, r: 0, vx: -55, vy: 0 },
    ],
    spawns: [[-80, 0], [80, 0]],
  },
  rink: {
    id: 'rink', name: 'Cold Boot', look: 'rink',
    blurb: 'An ice rink round a hot core: slide in the middle, and keep off the vents when they flare.',
    bounds: { shape: 'circle', r: 240 },
    solids: [],
    hazards: [
      { kind: 'ice', shape: 'circle', x: 0, y: 0, r: 85, grip: 0.25 },
      { kind: 'heat', shape: 'circle', x: 0, y: -158, r: 42, period: 7, warn: 1.4, on: 0.9, at: 2, dmg: 0.065, kb: 260 },
      { kind: 'heat', shape: 'circle', x: 0, y: 158, r: 42, period: 7, warn: 1.4, on: 0.9, at: 5.5, dmg: 0.065, kb: 260 },
    ],
    spawns: [[-110, 0], [110, 0]],
  },
};
export const ARENA_ORDER = ['ring', 'court', 'hall', 'rink'];
export const WALL_TALL = 18;   // the outer wall's height (a cup lobbed lower than this into it breaks on it)
export const arenaOf = id => ARENAS[id] || ARENAS[ARENA_ORDER[0]];

// ---------------------------------------------------------------- signed distances
// sd(shape, x, y): the signed distance from the shape's outline (< 0 inside) and its gradient (unit, pointing outward)
function sdBox(px, py, hw, hh, rc) {
  rc = Math.min(rc || 0, hw, hh);
  const qx = Math.abs(px) - (hw - rc), qy = Math.abs(py) - (hh - rc), sx = px < 0 ? -1 : 1, sy = py < 0 ? -1 : 1;
  if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy); return [l - rc, sx * qx / l, sy * qy / l]; }
  return qx > qy ? [qx - rc, sx, 0] : [qy - rc, 0, sy];
}
function sdPoly(pts, px, py) {
  let best = 1e9, bx = 0, by = 0, inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[j], [cx, cy] = pts[i], ex = cx - ax, ey = cy - ay, L = ex * ex + ey * ey || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / L)), nx = ax + ex * t, ny = ay + ey * t, d = Math.hypot(px - nx, py - ny);
    if (d < best) { best = d; bx = nx; by = ny; }
    if ((ay > py) !== (cy > py) && px < ax + (py - ay) * ex / (ey || 1e-9)) inside = !inside;
  }
  const d = best || 1e-6, gx = (px - bx) / d, gy = (py - by) / d;
  return inside ? [-best, -gx, -gy] : [best, gx, gy];
}
export function sd(s, x, y) {
  if (s.shape === 'circle') { const dx = x - (s.x || 0), dy = y - (s.y || 0), d = Math.hypot(dx, dy) || 1e-6; return [d - s.r, dx / d, dy / d]; }
  if (s.shape === 'box') return sdBox(x - (s.x || 0), y - (s.y || 0), s.w / 2, s.h / 2, s.r);
  return sdPoly(s.pts, x, y);
}
export const within = (s, x, y, pad = 0) => sd(s, x, y)[0] < -pad;

// the clearance of a body of radius r at (x, y): how far its edge is from the nearest wall or solid (< 0: overlapping),
// and the unit direction away from it (into open ground). solidsOnly: ignore the outer wall
export function clearance(A, x, y, r = 0, solidsOnly = false) {
  let best = 1e9, nx = 0, ny = 0;
  if (!solidsOnly) { const [d, gx, gy] = sd(A.bounds, x, y); if (-d < best) { best = -d; nx = -gx; ny = -gy; } }
  for (const o of A.solids) { const [d, gx, gy] = sd(o, x, y); if (d < best) { best = d; nx = gx; ny = gy; } }
  return { d: best - r, nx, ny };
}
// the contacts a body of radius r at (x, y) makes: each { pen (how deep), nx, ny (the way out), solid (null: the wall) }
export function contacts(A, x, y, r) {
  const out = [];
  const [d, gx, gy] = sd(A.bounds, x, y);
  if (d + r > 0) out.push({ pen: d + r, nx: -gx, ny: -gy, solid: null });
  for (const o of A.solids) { const [e, hx, hy] = sd(o, x, y); if (e < r) out.push({ pen: r - e, nx: hx, ny: hy, solid: o }); }
  return out;
}
// whether a body of radius r gets from (x, y) a distance len along angle a without touching a wall or solid (pad: extra room)
export function rayClear(A, x, y, a, len, r, pad = 0) {
  const c = Math.cos(a), s = Math.sin(a), n = Math.max(2, Math.ceil(len / 12));
  for (let k = 1; k <= n; k++) { const t = len * k / n; if (clearance(A, x + c * t, y + s * t, r).d < pad) return false; }
  return true;
}
// a solid between two points (for a thrown cup), or null
export function solidBetween(A, x0, y0, x1, y1) {
  const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(L / 10));
  for (const o of A.solids) for (let k = 1; k < n; k++) { const t = k / n; if (sd(o, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)[0] < 2) return o; }
  return null;
}
// the arena's bounding box (the camera and the thumbnails)
export function arenaBox(A) {
  const b = A.bounds;
  if (b.shape === 'circle') return { x0: -b.r, y0: -b.r, x1: b.r, y1: b.r };
  if (b.shape === 'box') return { x0: -b.w / 2, y0: -b.h / 2, x1: b.w / 2, y1: b.h / 2 };
  const xs = b.pts.map(p => p[0]), ys = b.pts.map(p => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
// a heat vent's state at round time t: 0 quiet, 0..1 glowing (the warning, rising), 2 burning. It burns from at s into
// the round for on s, then every period s; it glows for the warn s before each burn
export function heatState(h, t) {
  const at = h.at || 0, p = ((t - at) % h.period + h.period) % h.period;
  if (t >= at && p < h.on) return 2;
  if (t >= at - h.warn && p >= h.period - h.warn) return (p - (h.period - h.warn)) / h.warn;
  return 0;
}
