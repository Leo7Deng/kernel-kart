// Moonshot (deco 'moonshot'): the Earth's edge at the bottom of the map (art/cape.js), space, the Moon's at the top
// (art/moon.js). render.js bakes each world as its own tiled layer (moonshotLayers, baked per racer count since the
// rows have a bay per racer) and paints the sky live (moonshotSky). Also the live rockets, capsules, gauges, and how a
// kart on a ride is drawn and framed (flyLook, flyCam).
import { PCOL, TAU, clamp, fchance, frnd, lerp, mulberry } from '../core.js';
import { halfWAt, trackSample } from '../geometry.js';
import { BOARD_T, CAP, FLY_T, HATCH, ROLL_T, bayOf, inSpan, climbU, flyPose, onMoon, rowAhead, rowsOf } from '../race-rocket.js';
import { bold, BK } from '../look.js';
import { alpha, circ, linear, radial } from './paint.js';
import { capeGround, capeRoofs, capeStatic, capeUnder, inLand } from './cape.js';
import { moonDust, moonGround, moonLive, moonRoofs, moonStatic } from './moon.js';
import { RS, birds, booster, capsuleRide, capsulesOf, drawCapsule, drawRocket, landingDust, rampDeck, launchCloud, racerCol, rocketsOf, trail } from './rockets.js';
import { VIEW } from '../view.js';
import { timedOver, timedStatic, timedUnder } from './timed.js';
import { driverGauge, driverOver, driverUnder } from './massdriver.js';

export const SPACE = '#070a1c';

// ------------------------------------------------------------------------------------------------ the plan
// world-space shapes from the definition (layout units, scaled), cached per track
const plans = new WeakMap();
export function shotOf(T) {
  let P = plans.get(T); if (P) return P;
  const d = T.def.moonshot || {}, sc = T.def.scale, z = T.mech.rocket, W = p => p && { x: p[0] * sc, y: p[1] * sc }, Wl = L => (L || []).map(p => [p[0] * sc, p[1] * sc]);
  const E = d.earth || [2200, 1000, 9000], M = d.moon || [2200, 120, 9000];
  P = { sc, z, d, W, Wl,
    earth: { x: E[0] * sc, y: (E[1] + E[2]) * sc, r: E[2] * sc, top: E[1] * sc },
    moon: { x: M[0] * sc, y: (M[1] - M[2]) * sc, r: M[2] * sc, bottom: M[1] * sc } };
  const B = T.bbox;
  // the stars: everywhere in the black, drawn live and culled to the screen; brighter the further from the planet
  const rng = mulberry(4242), stars = [];
  for (let i = 0; i < B.w * B.h / 9000; i++) {
    const x = B.x - 800 + rng() * (B.w + 1600), y = B.y - 800 + rng() * (B.h + 1600);
    if (onEarth(P, x, y, 40) || onMoonDisc(P, x, y, 40)) continue;
    const up = clamp((limbE(P, x) - y - 150) / 900, 0, 1);
    stars.push([x, y, 0.6 + rng() ** 3 * 2.8, rng() * TAU, rng(), up]);
  }
  P.stars = stars;
  // clouds over the planet's edge (none over the harbour's moles out at sea)
  const crng = mulberry(77), clouds = [], sea = [];
  for (let s = 0; s < T.L; s += 40) if (!inSpan(z, s)) { const q = trackSample(T, s); if (q.y > P.earth.top && q.y < limbE(P, q.x) + 1300) sea.push([q.x, q.y]); }
  for (let x = B.x - 600; x < B.x + B.w + 600; x += 380 + crng() * 300) {
    const ly = limbE(P, x), C = { x: x + crng() * 200, y: ly + 120 + crng() * 900, r: 50 + crng() * 50, n: 4 + Math.floor(crng() * 4), sd: crng() * 100, v: 6 + crng() * 8, par: 0.12 + crng() * 0.22 };
    if (!sea.some(([qx, qy]) => qx > C.x - 450 && qx < C.x + 900 && Math.abs(qy - C.y) < 330)) clouds.push(C);
  }
  P.clouds = clouds;
  plans.set(T, P); return P;
}
// how far down the screen the planet's edge is at x; how far up the Moon's is
export const limbE = (P, x) => P.earth.y - Math.sqrt(Math.max(0, P.earth.r ** 2 - (x - P.earth.x) ** 2));
export const limbM = (P, x) => P.moon.y + Math.sqrt(Math.max(0, P.moon.r ** 2 - (x - P.moon.x) ** 2));
export const onEarth = (P, x, y, m = 0) => Math.hypot(x - P.earth.x, y - P.earth.y) < P.earth.r + m;
export const onMoonDisc = (P, x, y, m = 0) => Math.hypot(x - P.moon.x, y - P.moon.y) < P.moon.r + m;

// ------------------------------------------------------------------------------------------------ the layers
// the world being baked (render.js calls begin / end round each layer) and for how many racers; null: a thumbnail,
// both worlds
let bake = null;
export const bakeOf = () => bake;
// the two baked layers (render.js): the planet's part of the map and the Moon's, world rects
export function moonshotLayers(T, n) {
  const P = shotOf(T), B = T.view || T.bbox, M = 60, x0 = B.x - M, x1 = B.x + B.w + M;
  const set = world => ({ begin: () => { bake = { world, n }; }, end: () => { bake = null; } });
  const eTop = P.earth.top - 240, mBot = P.moon.bottom + 240;
  return [{ x: x0, y: eTop, w: x1 - x0, h: B.y + B.h + M - eTop, ...set('earth') }, { x: x0, y: B.y - M, w: x1 - x0, h: mBot - (B.y - M), ...set('moon') }];
}
// the race's count of racers, for the rows' bays (a thumbnail: four)
export const rowN = () => bake ? bake.n : 4;
const worldOn = w => !bake || bake.world === w;

// ------------------------------------------------------------------------------------------------ the ground (baked)
// Called from art/track.js (ground, tex 'moonshot') instead of a fill. Space is left clear (render.js paints it live).
let curT = null, curD = 1;
export function moonshotGround(g, T, D) {
  const P = shotOf(T), B = T.bbox; curT = T; curD = D;
  if (!bake) {   // (a thumbnail: no live sky under it: space and the glows over the whole canvas, whatever its shape)
    const M = g.getTransform().inverse(), c = g.canvas, xs = [], ys = [];
    for (const [px, py] of [[0, 0], [c.width, 0], [0, c.height], [c.width, c.height]]) { xs.push(M.a * px + M.c * py + M.e); ys.push(M.b * px + M.d * py + M.f); }
    const x0 = Math.min(B.x - 2000, ...xs), y0 = Math.min(B.y - 2000, ...ys), x1 = Math.max(B.x + B.w + 2000, ...xs), y1 = Math.max(B.y + B.h + 2000, ...ys);
    g.fillStyle = SPACE; g.fillRect(x0, y0, x1 - x0, y1 - y0); skyGlow(g, P, x0, y0, x1, y1);
  }
  if (worldOn('earth')) capeGround(g, T, P, D, null);
  if (worldOn('moon')) moonGround(g, T, P, D, null);
  T.keepOut = [[0, 0, 1e7]];   // (no scattered props: each world places its own)
}
// the static layer (drawMechanicsStatic): the rides' stretches painted back over, then each world's road and rows
export function moonshotStatic(g, T) {
  const P = shotOf(T), z = P.z, n = rowN();
  for (const [a, b] of z.spans) {
    const pts = []; for (let s = a; s <= b; s += 30) { const q = trackSample(T, s); pts.push([q.x, q.y]); }
    const rect = { x0: Math.min(...pts.map(p => p[0])) - 200, x1: Math.max(...pts.map(p => p[0])) + 200, y0: Math.min(...pts.map(p => p[1])) - 200, y1: Math.max(...pts.map(p => p[1])) + 200 };
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; const cut = new Path2D(); pts.forEach(([x, y], i) => i ? cut.lineTo(x, y) : cut.moveTo(x, y));
    g.beginPath(); g.rect(rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0); g.clip();
    // (no stroke-to-clip in canvas, so the band is built as a polygon)
    const band = new Path2D(), L = [], R = [];
    for (let s = a; s <= b; s += 20) { const q = trackSample(T, s), w = q.hw + 140; L.push([q.x + q.nx * w, q.y + q.ny * w]); R.push([q.x - q.nx * w, q.y - q.ny * w]); }
    [...L, ...R.reverse()].forEach(([x, y], i) => i ? band.lineTo(x, y) : band.moveTo(x, y)); band.closePath();
    g.clip(band); g.clearRect(rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0);
    if (!bake) { g.fillStyle = SPACE; g.fillRect(rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0); skyGlow(g, P, rect.x0, rect.y0, rect.x1, rect.y1); }
    if (worldOn('earth')) capeGround(g, T, P, curD, rect);
    if (worldOn('moon')) moonGround(g, T, P, curD, rect);
    g.restore();
  }
  if (worldOn('earth')) capeStatic(g, T, P, curD, n);
  if (worldOn('moon')) moonStatic(g, T, P, curD, n);
  timedStatic(g, T, bake ? bake.world : null);   // the launch complex's and the base's timed obstacles (art/timed.js)
}

// the roof layers (roofLayers): the assembly building's roof, the lava tube's lid, the base's glass tube
export function moonshotRoofs(T) { const P = shotOf(T); return [...capeRoofs(T, P), ...moonRoofs(T, P)]; }

// ------------------------------------------------------------------------------------------------ the sky
// the planet's blue rim fading through dusk to black; a faint cold rim round the Moon (live, and in thumbnails)
function skyGlow(g, P, x0, y0, x1, y1) {
  const E = P.earth, R = E.r, BD = bold();
  const y0c = Math.max(y0, E.top - 1400), y1c = Math.min(y1, E.y + R);   // (down the planet's round sides too)
  if (y1c > y0c) {
    g.fillStyle = BD ? radial(g, E.x, E.y, R, E.x, E.y, R + 900, [[0, '#5fb4ef'], [0.18, '#2f6cc0'], [0.45, '#2a2a6a'], [1, 'rgba(7,10,28,0)']])
      : radial(g, E.x, E.y, R - 10, E.x, E.y, R + 1300, [[0, 'rgba(190,235,255,1)'], [0.05, 'rgba(120,195,255,0.95)'], [0.16, 'rgba(60,125,225,0.75)'], [0.32, 'rgba(70,60,160,0.45)'], [0.5, 'rgba(120,60,130,0.2)'], [1, 'rgba(7,10,28,0)']]);
    g.fillRect(x0, y0c, x1 - x0, y1c - y0c);
  }
  const Mo = P.moon, m0 = Math.max(y0, Mo.y - Mo.r), m1 = Math.min(y1, Mo.bottom + 500);
  if (m1 > m0 && !BD) { g.fillStyle = radial(g, Mo.x, Mo.y, Mo.r - 10, Mo.x, Mo.y, Mo.r + 420, [[0, 'rgba(200,210,235,0.22)'], [1, 'rgba(200,210,235,0)']]); g.fillRect(x0, m0, x1 - x0, m1 - m0); }
}
// the sky under the baked layers (world space, the part on screen): the glow, twinkling stars, a shooting star
export function moonshotSky(ctx, race, x0, y0, x1, y1) {
  const T = race.track, P = shotOf(T), t = race.time, BD = bold();
  ctx.fillStyle = SPACE; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  if (!BD) {   // the Milky Way: a faint diagonal band
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, a = -0.5, L = 6000;
    ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = linear(ctx, cx - Math.sin(a) * 600, cy + Math.cos(a) * 600, cx + Math.sin(a) * 600, cy - Math.cos(a) * 600, [[0, 'rgba(90,80,160,0)'], [0.45, 'rgba(110,100,190,0.18)'], [0.5, 'rgba(160,150,220,0.22)'], [0.55, 'rgba(110,100,190,0.18)'], [1, 'rgba(90,80,160,0)']]); ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.restore();
    void L;
  }
  skyGlow(ctx, P, x0, y0, x1, y1);
  for (const [x, y, r, ph, k, up] of P.stars) {
    if (x < x0 || x > x1 || y < y0 || y > y1 || up <= 0.02) continue;
    const a = up * (BD ? 0.9 : 0.6 + 0.4 * Math.sin(t * (1.2 + k * 2) + ph));
    ctx.fillStyle = k < 0.12 ? `rgba(255,214,150,${a})` : k > 0.88 ? `rgba(170,200,255,${a})` : `rgba(255,255,255,${a})`;
    if (r > 2.6 && !BD) { ctx.fillRect(x - r * 2.4, y - 0.6, r * 4.8, 1.2); ctx.fillRect(x - 0.6, y - r * 2.4, 1.2, r * 4.8); }
    ctx.fillRect(x - r / 2, y - r / 2, r, r);
  }
  // satellites drifting across the gap between the worlds: a station with its solar wings, a little probe
  { const y0s = P.moon.bottom + 300, y1s = P.earth.top - 300;
    for (const [k, sp, big] of [[0, 34, true], [1, -52, false]]) {
      const W2 = T.bbox.w + 2400, x = T.bbox.x - 1200 + (((t * sp + k * 2100) % W2) + W2) % W2, y = lerp(y0s, y1s, k ? 0.62 : 0.35) + Math.sin(t * 0.2 + k) * 60;
      if (x < x0 - 300 || x > x1 + 300 || y < y0 - 200 || y > y1 + 200) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(0.15 + k * 0.5); const sc = big ? 1 : 0.55;
      ctx.fillStyle = BD ? '#3a5fb8' : linear(ctx, -110 * sc, 0, 110 * sc, 0, [[0, '#2b4ea8'], [0.5, '#4f78d8'], [1, '#2b4ea8']]);
      for (const sd of [-1, 1]) for (const r2 of big ? [-26, 26] : [0]) { ctx.fillRect(sd * 40 * sc + (sd > 0 ? 0 : -70 * sc), r2 * sc - 12 * sc, 70 * sc, 24 * sc); }
      ctx.fillStyle = '#c9ced6'; ctx.fillRect(-40 * sc, -3 * sc, 80 * sc, 6 * sc);
      ctx.fillStyle = BD ? '#f1f2f4' : linear(ctx, 0, -14 * sc, 0, 14 * sc, [[0, '#ffffff'], [1, '#aab2be']]); ctx.beginPath(); ctx.roundRect(-22 * sc, -14 * sc, 44 * sc, 28 * sc, 8 * sc); ctx.fill();
      if (big) { ctx.fillStyle = '#e0a93a'; ctx.beginPath(); ctx.roundRect(-10, -26, 20, 14, 4); ctx.fill(); }
      ctx.fillStyle = Math.floor(t * 2 + k) % 2 ? '#ff4b3e' : '#4bff8a'; circ(ctx, 0, 0, 3); ctx.fill();
      ctx.restore();
    } }
  if (!BD) {   // a shooting star now and then
    const n = Math.floor(t / 6), f = t / 6 - n;
    if (f < 0.12) { const rng = mulberry(n * 13 + 1), sx = x0 + rng() * (x1 - x0), sy = y0 + rng() * (y1 - y0), a = rng() * 0.6 + 0.3, L = 260 * (f / 0.12), hx = sx + Math.cos(a) * L * 2, hy = sy + Math.sin(a) * L * 2;
      if (!onEarth(P, hx, hy, 300) && !onMoonDisc(P, hx, hy, 40)) { ctx.strokeStyle = linear(ctx, hx, hy, hx - Math.cos(a) * L, hy - Math.sin(a) * L, [[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - Math.cos(a) * L, hy - Math.sin(a) * L); ctx.stroke(); } }
  }
}

// ------------------------------------------------------------------------------------------------ live, under the cars
// the bays lit in racers' colours, shadows, the sea and Moon's live bits
export function moonshotUnder(ctx, race) {
  const T = race.track, P = shotOf(T), z = P.z, t = race.time, BD = bold(), V = VIEW, R = rowsOf(race);
  const near = (x, y, m) => x > V.x0 - m && x < V.x1 + m && y > V.y0 - m && y < V.y1 + m;
  const local = race.localHumans || race.humans;
  // the next free bay glows in the colour of a player coming up to it (it's the one that catches you); a bay that just
  // caught someone flashes in their colour
  for (const k of [0, 1]) {
    const bays = k ? R.rbays : R.bays; if (!near(bays[0].dock.x, bays[0].dock.y, 1800) && !near(bays[R.n - 1].dock.x, bays[R.n - 1].dock.y, 1800)) continue;
    const by = []; for (const c of race.cars) { const b = k ? c.cbay : c.bay; if (b >= 0) by[b] = c; }
    for (let j = 0; j < R.n; j++) {
      const B = bays[j]; if (!near(B.dock.x, B.dock.y, 500)) continue;
      const c = by[j], dT = c ? (k ? c.cdockT : c.dockT) : 0, mine = !c && local.find(h => !((k ? h.cbay : h.bay) >= 0) && !h.finished && rowAhead(z, h.s) === k && bayOf(race, h, k) === j && h.s > B.s - 2200);
      const col = c ? racerCol(c) : mine ? PCOL[mine.pIndex] : null; if (!col || (dT > 0 && t - dT > 1.2)) continue;
      const pulse = 0.5 + 0.5 * Math.sin(t * 8), a = dT > 0 ? clamp(1 - (t - dT) / 1.2, 0, 1) : 0.35 + 0.35 * pulse;
      ctx.save(); ctx.globalAlpha = a;
      // the lane onto it on the road
      ctx.beginPath();
      for (let s = B.s - 220, i = 0; s <= B.s; s += 10, i++) { const q = trackSample(T, s), o = B.side * (q.hw - 2); i ? ctx.lineTo(q.x + q.nx * o, q.y + q.ny * o) : ctx.moveTo(q.x + q.nx * o, q.y + q.ny * o); }
      for (let s = B.s; s >= B.s - 220; s -= 10) { const q = trackSample(T, s), f = (s - (B.s - 220)) / 220, o = B.side * q.hw * (0.85 - 0.75 * f); ctx.lineTo(q.x + q.nx * o, q.y + q.ny * o); }
      ctx.closePath(); ctx.fillStyle = alpha(col, BD ? 0.45 : 0.32); ctx.fill();
      // the ramp's deck, and light running up it
      const D = rampDeck(B, HATCH[k]), P4 = [D.at(0, -1), D.at(1, -1), D.at(1, 1), D.at(0, 1)];
      ctx.beginPath(); P4.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fillStyle = alpha(col, 0.35); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.stroke();
      for (let m = 0; m < 3; m++) { const u = ((t * (dT > 0 ? 3 : 1.4) + m / 3) % 1), l = D.at(u - 0.07, -0.7), mm = D.at(u, 0), r = D.at(u - 0.07, 0.7); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(mm.x, mm.y); ctx.lineTo(r.x, r.y); ctx.stroke(); }
      ctx.restore();
    }
  }
  // the rockets' shadows on their pads: long and soft, down and to the right, sliding away and fading as they climb
  for (const Rk of rocketsOf(race)) if (!Rk.land && (!Rk.fly || Rk.u < 0.25) && near(Rk.E.x, Rk.E.y, 500)) {
    const h = Rk.fly ? Rk.u * 900 : 0, a = 0.24 * (1 - h / 260); if (a <= 0) continue;
    ctx.save(); ctx.translate(Rk.E.x + h * 0.5, Rk.E.y + h * 0.3); ctx.rotate(0.5); ctx.fillStyle = `rgba(14,26,40,${a})`; ctx.beginPath(); ctx.moveTo(0, -26); ctx.quadraticCurveTo(130, -28, 230, -7); ctx.quadraticCurveTo(242, 0, 230, 7); ctx.quadraticCurveTo(130, 28, 0, 26); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  for (const Ck of capsulesOf(race)) if (Ck.stand && near(Ck.P.x, Ck.P.y, 300)) {
    ctx.save(); ctx.translate(Ck.P.x, Ck.P.y); ctx.rotate(0.5); ctx.fillStyle = 'rgba(8,8,20,0.42)'; ctx.beginPath(); ctx.moveTo(0, -22); ctx.quadraticCurveTo(80, -22, 150, -5); ctx.quadraticCurveTo(158, 0, 150, 5); ctx.quadraticCurveTo(80, 22, 0, 22); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  if (onEarth(P, V.cx, V.cy, 800)) capeUnder(ctx, race, P);
  timedUnder(ctx, race);
  driverUnder(ctx, race);
  if (onMoonDisc(P, V.cx, V.cy, 1500)) {
    moonLive(ctx, race, P);
    const seen = c => (race.humans.length ? race.humans : race.cars.slice(0, 1)).some(h => Math.abs(h.x - c.x) < 1500 && Math.abs(h.y - c.y) < 1000);   // (near a player: whichever view it's in)
    if (V.first) for (const c of race.cars) if (!(c.flyT > 0) && c.speed > 120 && onMoon(z, c.s) && seen(c) && fchance(0.12)) moonDust(race, c, false);
  }
}

// ------------------------------------------------------------------------------------------------ live, over the cars
// the crawler, gantry arms, rockets, capsules, clouds, the gauges
export function moonshotOver(ctx, race) {
  const T = race.track, P = shotOf(T), z = P.z, t = race.time, BD = bold(), V = VIEW, R = rowsOf(race);
  const near = (x, y, m) => x > V.x0 - m && x < V.x1 + m && y > V.y0 - m && y < V.y1 + m;
  const Rs = rocketsOf(race), Cs = capsulesOf(race), airTop = limbE(P, (R.bays[0].pad.x + R.mpads[0].pad.x) / 2) - 60;
  // standing ones first (up the screen first, so nearer ones overlap), then the clouds of exhaust, then the ones flying
  const stand = [...Rs.filter(Rk => !Rk.fly).map(Rk => ({ y: Rk.y, d: () => {
    const hatch = Rk.dockT > 0 && !Rk.land ? 1 : 0, ign = Rk.e !== null && Rk.e > -1.1 && Rk.e < 0, B = R.bays[Rk.j], door = Rk.dockT > 0 && !Rk.land ? clamp(1 - (t - Rk.dockT - BOARD_T) / 0.3, 0, 1) : 0;
    ctx.save(); if (ign) ctx.translate(Math.sin(t * 57) * 1.2 * (Rk.e + 1.1), 0);
    drawRocket(ctx, Rk.x, Rk.y - (Rk.land ? 0 : 6), RS, { col: Rk.col, stage: Rk.land ? 2 : 1, flame: Rk.flame, t, legs: Rk.land ? 1 : 0, hatch, door, doorX: B.top.x > B.pad.x ? 1 : -1 });
    ctx.restore(); if (Rk.land) landingDust(ctx, Rk, BD); }, x: Rk.x })), ...Cs.filter(Ck => Ck.stand).map(Ck => ({ y: Ck.P.y, x: Ck.P.x, d: () => drawCapsuleStand(ctx, R.rbays[Ck.j], Ck, t, BD) }))].sort((a, b) => a.y - b.y);
  for (const S of stand) if (near(S.x, S.y, RS * 2)) S.d();
  for (const Rk of Rs) if (Rk.e !== null && near(Rk.E.x, Rk.E.y, 900)) { const B = R.bays[Rk.j], ox = B.pad.x - B.dock.x, oy = B.pad.y - B.dock.y, d = Math.hypot(ox, oy) || 1; launchCloud(ctx, Rk, ox / d, oy / d, t, BD); birds(ctx, Rk, t); }
  for (const Rk of Rs) if (Rk.fly) {
    trail(ctx, Rk, t, airTop, BD);
    booster(ctx, Rk, t, BD);
    if (!near(Rk.x, Rk.y, RS * 3)) continue;
    if (!BD && Rk.u < 0.12) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = radial(ctx, Rk.E.x, Rk.E.y, 0, Rk.E.x, Rk.E.y, 280, [[0, `rgba(255,190,110,${0.5 * (1 - Rk.u / 0.12)})`], [1, 'rgba(255,160,80,0)']]); circ(ctx, Rk.E.x, Rk.E.y, 280); ctx.fill(); ctx.restore(); }   // the pad lit by the flame
    if (V.first && Rk.e < 0.4 && !BD && fchance(0.6)) race.particles.push({ kind: 'spark', x: Rk.E.x + frnd(-50, 50), y: Rk.E.y + frnd(-15, 35), vx: frnd(-380, 380), vy: frnd(-180, 280), col: fchance(0.5) ? '#ffd27a' : '#ff9a3c', size: frnd(2, 4), life: frnd(0.3, 0.7), maxLife: 0.7, top: true });
    if (Rk.u > 0.84) landingDust(ctx, Rk, BD);
    drawRocket(ctx, Rk.x, Rk.y, RS * Rk.k, { col: Rk.col, stage: Rk.stage, flame: Rk.flame, t, legs: clamp((Rk.u - 0.85) / 0.1, 0, 1), hatch: 1 });
  }
  for (const Ck of Cs) if (!Ck.stand && near(Ck.x, Ck.y, 900)) capsuleRide(ctx, race, Ck, P, BD);
  timedOver(ctx, race);
  driverOver(ctx, race);
  clouds(ctx, P, t, BD);
  for (const h of race.localHumans || race.humans) { leapGauge(ctx, race, h, BD); crestGauge(ctx, race, h, BD); driverGauge(ctx, race, h, BD); }
}
// a capsule on its ascent stage on the Return Row, in its racer's colour
function drawCapsuleStand(ctx, B, Ck, t, BD) {
  const { P } = Ck, s = 104;
  ctx.save(); if (Ck.e !== null && Ck.e > -0.8 && Ck.e < 0) ctx.translate(Math.sin(t * 57) * 1.2, 0);
  // the legs
  for (const sd of [-1, 1]) { ctx.strokeStyle = BD ? BK.ink : '#6f747d'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(P.x + sd * s * 0.3, P.y - s * 0.28); ctx.lineTo(P.x + sd * s * 0.55, P.y - 2); ctx.stroke(); ctx.fillStyle = '#c9ced6'; ctx.beginPath(); ctx.ellipse(P.x + sd * s * 0.55, P.y, 9, 4, 0, 0, TAU); ctx.fill(); }
  // the stage: a gold-foil box
  ctx.fillStyle = BD ? '#e0b24a' : linear(ctx, P.x - s * 0.4, 0, P.x + s * 0.4, 0, [[0, '#f6d47a'], [0.5, '#e0a93a'], [1, '#9c6a1c']]);
  ctx.beginPath(); ctx.roundRect(P.x - s * 0.4, P.y - s * 0.52, s * 0.8, s * 0.3, 6); ctx.fill(); if (BD) { ctx.strokeStyle = BK.ink; ctx.lineWidth = 2.5; ctx.stroke(); }
  if (!BD) { ctx.strokeStyle = 'rgba(120,80,20,0.35)'; ctx.lineWidth = 1.2; for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(P.x - s * 0.4 + k * s * 0.2, P.y - s * 0.52); ctx.lineTo(P.x - s * 0.4 + k * s * 0.2 + 4, P.y - s * 0.22); ctx.stroke(); } }
  if (Ck.flame > 0) { ctx.globalAlpha = Ck.flame; ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.ellipse(P.x, P.y - s * 0.15, s * 0.22, s * 0.16 * (1 + Math.sin(t * 40) * 0.2), 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
  drawCapsule(ctx, P.x, P.y - s * 0.5, 92, Ck.col, BD);
  ctx.restore();
}
// a gauge over a kart: coloured zones between lo and hi, a needle at its speed (for the gauges below)
function gauge(ctx, c, fa, lo, hi, zones, t, BD) {
  const X = v => clamp((v - lo) / (hi - lo), 0, 1), w = 150, h = 16, x0 = c.x - w / 2, y0 = c.y - 112;
  ctx.save(); ctx.globalAlpha = fa;
  if (BD) { ctx.fillStyle = BK.ink; ctx.fillRect(x0 - 4, y0 - 4, w + 8, h + 8); } else { ctx.fillStyle = 'rgba(10,14,24,0.55)'; ctx.beginPath(); ctx.roundRect(x0 - 6, y0 - 6, w + 12, h + 12, 9); ctx.fill(); }
  let ok = false;
  for (const [a, b, col, good] of zones) { ctx.fillStyle = col; ctx.fillRect(x0 + w * X(a), y0, w * (X(b) - X(a)), h); if (good && c.speed >= a && c.speed <= b) ok = true; }
  const nx = x0 + w * X(c.speed);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = BD ? BK.ink : 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(nx, y0 - 2); ctx.lineTo(nx - 7, y0 - 12); ctx.lineTo(nx + 7, y0 - 12); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillRect(nx - 1.5, y0, 3, h);
  if (ok && !BD) { ctx.strokeStyle = `rgba(120,255,160,${0.5 + 0.5 * Math.sin(t * 12)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x0 - 6, y0 - 6, w + 12, h + 12, 9); ctx.stroke(); }
  ctx.restore();
}
// the Causeway Leap gauge: red too slow (into the lagoon), green, orange too fast (past the bend after the landing)
// (race-lowg.js vLo, vOk; the bar spans 60 either side of the window)
function leapGauge(ctx, race, c, BD) {
  const T = c.T; if (!T.mech || c.finished || c.air > 0 || c.flyT > 0) return;
  const g = T.mech.lowg.find(g => g.sR - c.s > 0 && g.sR - c.s < 1100); if (!g) return;
  const ds = g.sR - c.s, fa = clamp((1100 - ds) / 200, 0, 1) * clamp(ds / 30, 0, 1);
  gauge(ctx, c, fa, g.vLo - 60, g.vOk + 60, [[0, g.vLo, BD ? BK.red : '#e04646'], [g.vLo, g.vOk, BD ? BK.green : '#3fbf6a', true], [g.vOk, 2000, BD ? BK.yellow : '#ff9a3c']], race.time, BD);
}
// an Apennine Crests gauge (race-crests.js): green down in time for the turn, orange you'll float into it; a notch
// where you start to float
function crestGauge(ctx, race, c, BD) {
  const Z = c.T.mech && c.T.mech.crests; if (!Z || c.finished || c.air > 0 || c.flyT > 0) return;
  const C = Z.list.find(C => C.s - c.s > 0 && C.s - c.s < 800); if (!C) return;
  const ds = C.s - c.s, fa = clamp((800 - ds) / 200, 0, 1) * clamp((ds - C.w * 0.3) / 40, 0, 1);
  gauge(ctx, c, fa, C.vOk - 150, C.vOk + 70, [[0, C.vOk, BD ? BK.green : '#3fbf6a', true], [C.vOk, 2000, BD ? BK.yellow : '#ff9a3c']], race.time, BD);
}
// clouds over the planet's edge, higher than the ground, so they slide a little faster with the camera (parallax)
function clouds(ctx, P, t, BD) {
  const V = VIEW, x0 = V.x0 - 300, x1 = V.x1 + 300, y0 = V.y0 - 300, y1 = V.y1 + 300;
  for (const C of P.clouds) {
    const px = (C.x - V.cx) * C.par, py = (C.y - V.cy) * C.par;
    const x = C.x + Math.sin(t * 0.05 + C.sd) * 120 + (t * C.v) % 400 + px, y = C.y + py;
    if (x < x0 - 500 || x > x1 + 500 || y < y0 - 400 || y > y1 + 400) continue;
    const r = C.r * (1 + C.par), rng = mulberry(Math.round(C.sd * 1000));
    const puffs = []; for (let k = 0; k < C.n; k++) puffs.push([x + (k - C.n / 2) * r * 0.75 + rng() * r * 0.3, y + (rng() - 0.5) * r * 0.5, r * (0.6 + rng() * 0.5)]);
    for (const [qx, qy, pr] of puffs) { ctx.fillStyle = BD ? 'rgba(20,50,90,0.2)' : 'rgba(20,50,90,0.13)'; circ(ctx, qx + 60, qy + 80, pr); ctx.fill(); }
    for (const [qx, qy, pr] of puffs) { ctx.fillStyle = BD ? '#dfe6f2' : 'rgba(222,232,246,0.92)'; circ(ctx, qx, qy, pr); ctx.fill(); }
    for (const [qx, qy, pr] of puffs) { ctx.fillStyle = BD ? '#ffffff' : 'rgba(255,255,255,0.96)'; circ(ctx, qx - pr * 0.1, qy - pr * 0.16, pr * 0.86); ctx.fill(); }
  }
}

// ------------------------------------------------------------------------------------------------ a kart on a ride
// how a kart on a ride is drawn (render.js): how much of it shows (0 inside), how big, how high the gantry has it
export function flyLook(race, c) { const z = c.T.mech && c.T.mech.rocket; if (!z || !(c.flyT > 0)) return null; const P = flyPose(z, rowsOf(race), c, race.time); return { kart: P.kart, k: P.k, lift: P.lift || 0 }; }
// the camera on a rocket or capsule rider (render.js): zoom-out multiple and look-ahead (world units): out a little
// on the pad, far out looking ahead on the climb, back in to land or splash down
export function flyCam(c, t) {
  if (!(c.flyT > 0)) return null;
  if (c.flyK === 1) {
    const e = t - c.cL; if (e < 0) return { z: 0.86, dx: 0, dy: 60 };
    if (e < CAP.splash) { const f = Math.sin(Math.PI * clamp(e / CAP.splash * 1.05, 0, 1)); return { z: 0.86 - 0.3 * f, dx: 0, dy: 520 * f }; }
    return { z: 0.86 + 0.1 * clamp((e - CAP.splash) / 1, 0, 1), dx: 0, dy: 0 };
  }
  const e = t - c.rkL;
  if (e < 0) return { z: 0.86, dx: 0, dy: -60 };
  if (e < FLY_T) { const u = climbU(e / FLY_T), f = Math.sin(Math.PI * clamp(u * 1.1, 0, 1)); return { z: 0.86 - 0.3 * f, dx: 0, dy: -560 * f }; }
  return { z: 0.86 + 0.1 * clamp((e - FLY_T) / ROLL_T, 0, 1), dx: 0, dy: 0 };
}

// ------------------------------------------------------------------------------------------------ props
// none scattered: each world places its own (art/cape.js, art/moon.js)
export function moonshotProp() {}
// a lunar rover (a Garbage Collector bot on the Moon, race.js gcs): a little six-wheeled buggy with a dish
export function drawRover(ctx, gc, t) {
  ctx.save(); ctx.translate(gc.x, gc.y); ctx.rotate(gc.ang);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.roundRect(-18, -10, 54, 36, 8); ctx.fill();
  for (const wx of [-16, 0, 16]) for (const sd of [-1, 1]) { ctx.fillStyle = '#3d4249'; ctx.beginPath(); ctx.roundRect(wx - 7, sd * 16 - 5, 14, 10, 3); ctx.fill(); }
  ctx.fillStyle = '#e9edf2'; ctx.beginPath(); ctx.roundRect(-24, -13, 48, 26, 6); ctx.fill();
  ctx.fillStyle = '#d9a43a'; ctx.fillRect(-20, -9, 18, 18);
  ctx.fillStyle = '#26408b'; ctx.fillRect(2, -10, 18, 20); ctx.strokeStyle = '#8fb3ff'; ctx.lineWidth = 1; ctx.strokeRect(2, -10, 18, 20);
  ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-12, -22); ctx.stroke();
  ctx.save(); ctx.translate(-12, -24); ctx.rotate(t * 1.5); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, 0, 10, 5, 0, 0, TAU); ctx.fill(); ctx.restore();
  ctx.restore();
}
export { inLand, lerp };
