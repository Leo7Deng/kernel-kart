// Kernel Kart: drawing a race frame: camera, track layers, cars, effects and the HUD.
import { onBridge, trackSample } from './geometry.js';
import { FONT, HEIGHT, RIDE_UP, alpha, drawBridge, drawCar, drawCarShadow, drawHazardSign, drawItemIcon, drawKeycap, drawLapFlag, drawMascot, drawPlaceBadge, FACE_Y, drawTrack, lookOf, shade, twinLook } from './art.js';
import { linear, radial } from './art/paint.js';
import { itemBoxes } from './art/icons.js';
import { drawPad } from './art/pads.js';
import { RAMP_LIFT, rampZ, rampsOf } from './art/track.js';
import { drawCrossing, drawGarbageTruck, drawTrain } from './art/vehicles.js';
import { BODIES, DKEYS, IKEYS, KEYS, ORD, PCOL, STEP, TAU, clamp, lerp } from './core.js';
import { DRIFT, driftPt, driftTier, tierCol } from './race-drift.js';
import { drawCarOver, drawCarUnder, drawFFScreen, drawParticles, drawRev, fxAmbient, mallocVis } from './fx.js';
import { Input } from './input.js';
import { ITEMS } from './items/index.js';
import { OC_T } from './items/oc.js';
import { drawMines } from './items/mine.js';
import { drawBoulders, drawMechanics, drawMechanicsOver, drawRoofLights, roofLayers } from './draw-mechanics.js';
import { drawAmbient, drawAmbientOver } from './draw-ambient.js';
import { miniStorms } from './art/hurricane.js';
import { sunGate } from './art/plateau.js';
import { drawGhost, drawGhostDot, drawTTCard, drawTTLaps, drawTTSplit } from './draw-timetrial.js';
import { FEED_T } from './race.js';
import { loopPose } from './items/loop.js';
import { secretPose } from './race-secret.js';
import { birdScale, secretShadow } from './art/phoenix.js';
import { MOON_T } from './race-lowg.js';
import { SINK_T } from './race-volcano.js';
import { settings, textScale } from './settings.js';
import { drawLinkIcon } from './net-link.js';
import { ROCKET_WINDOW } from './race-start.js';
import { drawMascot3D, has3D, queue3D } from './art/model3d.js';
import { car3DMade, drawCar3D, seatUp3D, warmCars3D } from './art/car3d.js';
import { bakesLeft, setPrimer } from './art/warm.js';
import { BIT_CAP, bitSpots, loosePos } from './race-bits.js';
import { cliffPose, drawWings, hillScreen, hillZoom, kartHill, sweptPose, wingShape } from './art/alpine.js';
import { wetRoad } from './art/neon.js';
import { drawRover, flyCam, flyLook, moonshotLayers, moonshotSky } from './art/moonshot.js';
import { VIEW, inView } from './view.js';
import { SAFE } from './qol.js';
const NO_SAFE = { l: 0, t: 0, r: 0, b: 0 };   // (a race drawn into a menu clip's canvas: no notch there)
import { BK, BOLD_DISPLAY, BOLD_FONT, BOLD_W, bbox, bold, bpanel, chequer, lookIs, plate } from './look.js';


export let cv = document.getElementById('game'), ctx = cv.getContext('2d');
export let DPR = 1, W = 0, H = 0;
function resize() { DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * DPR; cv.height = H * DPR; }
// HUD scale: 1 on laptop/tablet, down to 0.68 on a phone. The HUD is laid out in W / HS x H / HS and drawn scaled
// (W and H are swapped while it's drawn, hudFull keeps the real ones); touch buttons stay full size (input.js hit-tests
// real pixels). Text size can raise it, but the layout screen never goes under 460 tall.
const hudScale = (w, h) => { const k = clamp(Math.min(w, h) / 540, 0.68, 1), t = textScale(); return t === 1 ? k : Math.max(k, Math.min(k * t, Math.min(w, h) / 460)); };
let hudFull = null;
addEventListener('resize', resize); resize();

let trackCache = null;
const MOONSHOT_PX = 34e6;   // Moonshot's two worlds (art/moonshot.js): pixels for both baked layers together
// A very big map's cached layer (T.def.tiles) as tiles of at most 4000 px a side (browser limit), drawn through one
// context that forwards every call to all of them. Each tile draws a little past its part and blits only its part
// (no seams); tyre marks go through the same context.
function tiled(mk, bx, by, bw, bh, res, draw) {
  const nx = Math.ceil(bw * res / 4000), ny = Math.ceil(bh * res / 4000), tw = bw / nx, th = bh / ny, PAD = 8, tiles = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const t = mk(bx + i * tw - PAD, by + j * th - PAD, tw + PAD * 2, th + PAD * 2, null);
    tiles.push({ ...t, part: { canvas: t.canvas, x: bx + i * tw, y: by + j * th, w: tw, h: th, k: res, sx: PAD * res, sy: PAD * res } });
  }
  const gs = tiles.map(t => t.g), g = new Proxy(gs[0], {
    get(o, k) { const v = o[k]; return typeof v === 'function' ? (...a) => { let r; for (const c of gs) r = c[k](...a); return r; } : v; },
    set(o, k, v) { for (const c of gs) c[k] = v; return true; },
  });
  draw(g);
  return { tiles: tiles.map(t => t.part), g, x: bx, y: by, w: bw, h: bh };
}
export const resetTrackCache = () => { trackCache = null; };   // a new race: redraw the track layers
// a race drawn into another canvas (the menu's clips): this module's screen is swapped for that one for the frame
// and put back. view: { canvas, w, h, dpr, cache } (cache: that canvas's own track layers)
export function renderTo(view, race, dt) {
  if (hudFull) { [W, H] = hudFull; hudFull = null; }   // (a frame that threw mid-HUD)
  const keep = [cv, ctx, DPR, W, H, trackCache, Input.driftOn, Input.touchActive];
  cv = view.canvas; ctx = cv.getContext('2d'); DPR = view.dpr; W = view.w; H = view.h; trackCache = view.cache || null; Input.touchActive = false;
  try { render(race, dt); } finally { view.cache = trackCache; [cv, ctx, DPR, W, H, trackCache, Input.driftOn, Input.touchActive] = keep; }
}
// cosmetic per-car pose (turn amount, side-on mascot facing), kept off the car objects so the sim stays untouched
const MASCOT_SCALE = 0.92, poses = new WeakMap(), skids = new WeakMap();   // skids: a drifting kart's rear wheels last frame (the tyre marks)
function updatePose(c, dt, t) {
  let p = poses.get(c);
  if (!p) poses.set(c, p = { h: c.heading, yaw: 0, steer: 0, lean: 0, face: Math.cos(c.heading) < 0 ? -1 : 1, air: 0, airT: 1, landT: -9, landA: 0 });
  // a landing (not a fall): how hard, for the squash and the hop after it
  if (p.air > 0 && c.air <= 0 && !(c.moonT > 0) && !(c.spinT > 0.9)) { p.landT = t; p.landA = clamp(p.airT / 0.9, 0.35, 1); }
  p.air = c.air; p.airT = c.airT;
  if (dt > 0) {
    const dh = Math.atan2(Math.sin(c.heading - p.h), Math.cos(c.heading - p.h)); p.h = c.heading;
    p.yaw = lerp(p.yaw, clamp(dh / dt, -6, 6), 1 - Math.exp(-8 * dt));
    p.steer = clamp(p.yaw * 0.14, -0.55, 0.55); p.lean = clamp(-p.yaw * 0.07, -0.3, 0.3);
    const cx = Math.cos(c.heading); if (Math.abs(cx) > 0.35) p.face = Math.sign(cx);
  }
}
const pose = c => poses.get(c);
const MINI_ELEV = ['#4f9a5a', '#7aa451', '#a39a62', '#a7a3a0', '#e8eef5'];   // the minimap's road by height, low to high
// how a kart sits over a ramp and in the air (cosmetic, from the race's air time). h: height in RAMP_LIFT units
// (ramp face, then a parabola over the air time, a hop on landing); hs: height under it (where the shadow lies);
// sq: squash (+) or stretch (-); spin: a trick.
const smooth01 = x => x * x * (3 - 2 * x);
function jumpPose(c, T, ramps, t) {
  let hs = 0, f = 0, lip = 0.35, pk = 0;
  for (const r of ramps) {
    let d = c.s - r.s; if (!T.open) { if (d > T.L / 2) d -= T.L; if (d < -T.L / 2) d += T.L; }
    if (c.air > 0 && Math.abs(r.s - c.jumpAt) < 1) { lip = r.H / RAMP_LIFT; pk = r.peak || 0; }   // (peak: a ramp with a hop of its own height, Gradient Descent's moguls)
    if (d > -r.len && d <= 0 && !(c.moonT > 0) && (r.half ? c.lat > r.lat0 - c.W * 0.3 && c.lat < r.lat1 + c.W * 0.3 : Math.abs(c.lat) < trackSample(T, c.s).hw)) { hs = rampZ(r, d) / RAMP_LIFT; f = rampZ(r, d) / r.H; }
  }
  const P = poses.get(c); let h = hs, sq = 0.22 * f * f, spin = 0;
  if (c.sweptT > 0) { const W = sweptPose(c, t); return { h: W.h, hs: 0, sq: W.sq, spin: 0, pitch: W.pitch, roll: W.roll, wob: 0, under: W.under, water: W.water, face: W.face, shake: W.shake }; }   // swept down a torrent (art/alpine.js)
  const CP = c.air > 0 && c.cliffJump ? cliffPose(c, t) : null;   // flying off a cliff: its real arc over the falling ground (art/alpine.js)
  if (CP) {
    const te = c.airT - c.air; h = CP.h; sq = -0.5 * Math.exp(-te * 9);
    if (c.trick) spin = TAU * smooth01(clamp((CP.u - 0.06) / 0.8, 0, 1));
    return { h, hs: 0, sq, spin, pitch: CP.pitch, roll: CP.roll, wob: CP.wob, wing: CP.wing, flip: CP.flip };   // (flip: a ski jump's flips, rolled over sideways)
  }
  if (c.air > 0) {
    const u = clamp(1 - c.air / c.airT, 0, 1), peak = pk || clamp(c.airT / 0.62, 0.5, c.moonJump || c.cliffJump ? 2.1 : c.crestJ ? 1.8 : 1.5), te = c.airT - c.air;
    h = Math.max(hs, lip * (1 - u) + peak * 4 * u * (1 - u));
    sq = -0.5 * Math.exp(-te * 9);
    if (c.trick) spin = TAU * smooth01(clamp((u - 0.06) / 0.8, 0, 1));
  } else if (P) {
    const lt = t - P.landT, A = P.landA;
    if (lt >= 0 && lt < 0.7) { sq += A * Math.exp(-lt * 7) * Math.cos(lt * 22); if (lt > 0.05 && lt < 0.29) h += A * 0.13 * Math.sin(Math.PI * (lt - 0.05) / 0.24); }
  }
  return { h, hs, sq, spin, pitch: 0, roll: 0, wob: 0 };
}
// a raised kart's shadow: further down-right, smaller and fainter with h; at h = 0 exactly drawCarShadow's
function liftShadow(ctx, c, a, h, J, t) {
  const B = BODIES[c.ch.body] || BODIES.kart, hb = HEIGHT[c.ch.body] ?? 1, s = 1 - Math.min(0.42, h * 0.24), rad = Math.min(14, B.W / 2), al = 0.22 / (1 + h * 0.45);
  ctx.save(); ctx.translate(2 + hb * 3 + h * 22, 3 + hb * 4 + h * 30); ctx.rotate(a); ctx.scale(s, s);
  if (J && J.wing) { ctx.fillStyle = `rgba(10,12,20,${al * 0.8})`; for (const w of wingShape(c, J.wing, J.roll, t)) { ctx.beginPath(); ctx.moveTo(...w.front); ctx.lineTo(...w.tip); ctx.lineTo(...w.mid); ctx.lineTo(...w.back); ctx.fill(); } }   // hang-glider wings off the Cliff (art/alpine.js)
  for (const [g, k, rg] of [[3 + h * 12, Math.min(1, h * 3) * 0.6, h * 12], [3, 1, 0], [0, 1, 0]]) {
    if (k <= 0) continue; ctx.fillStyle = `rgba(10,12,20,${al * k})`; ctx.beginPath(); ctx.roundRect(-B.L / 2 - g, -B.W / 2 - g, B.L + g * 2, B.W + g * 2, rad + rg); ctx.fill();
  }
  ctx.restore();
}
// The camera: small tracks fit the screen; big ones follow the humans, zooming out to keep all of them in shot (online
// too), or the leader with no humans. One view always: the user rejected split screen. Per screen, off the race.
const camState = new WeakMap();
export const snapCamera = race => camState.delete(race);   // (a jump cut: the next frame frames the players afresh)
// the screen's usable part (under the HUD cards) and zoom limits
function viewBox(T, r, hudH, pad) {
  const B = T.bbox, vw = r.w - pad * 2, vh = r.h - hudH - pad * 2;
  const fit = Math.min(vw / B.w, vh / B.h), zMax = Math.max(fit, Math.min(vw / 1150, vh / 680));
  return { vw, vh, top: hudH, vcx: r.x + r.w / 2, vcy: r.y + hudH + pad + vh / 2, fit, zMax };
}
// the players' box (each kart now and in 0.75 s): its middle and the zoom that fits it
function framing(T, cars, vb, t) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const c of cars) for (const k of [0, 0.75]) {
    const SP = c.secretT > 0 && secretPose(c), FC = c.flyT > 0 ? flyCam(c, t) : null;   // (a phoenix: its shadow and itself, up in the sky; a rocket: where it's heading)
    const x = c.x + (SP || FC ? 0 : Math.cos(c.heading) * c.speed * k), y = c.y + (SP ? -(SP.h + 60 * birdScale(SP)) * k / 0.75 : FC ? FC.dy * k / 0.75 : Math.sin(c.heading) * c.speed * k);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const m = 280, raw = Math.min(vb.vw / (x1 - x0 + m * 2), vb.vh / (y1 - y0 + m * 2));
  let k = T.mech && T.mech.elev ? hillZoom(cars) : 1;   // (on a track with heights: closer on a slow climb, further out flying downhill, art/alpine.js)
  const fl = cars.map(c => c.flyT > 0 ? flyCam(c, t) : null); if (fl.every(Boolean)) k *= Math.min(...fl.map(f => f.z));   // (everyone in it on a ride: framed for the ride, art/moonshot.js)
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, raw, z: clamp(raw, vb.fit, vb.zMax) * k };
}
function viewsFor(race, dt) {
  const T = race.track, HS = hudScale(W, H), hudH = Math.min(110, H / HS * 0.16) * HS, pad = 16, B = T.bbox, t = race.time;   // (hudH: the HUD's band at the top, scaled with it)
  const local = race.localHumans || race.humans, players = race.localHumans ? [...local, ...race.humans.filter(c => !local.includes(c))] : race.humans;   // (online: yours first)
  const rect = { x: 0, y: 0, w: W, h: H }, vb = viewBox(T, rect, hudH, pad);
  const sh = settings.shake ? (race.shake || 0) * 7 : 0, shx = Math.sin(race.time * 73) * sh, shy = Math.cos(race.time * 61) * sh;
  const out = { views: [], hudH, pad, fit: vb.fit, zMax: vb.zMax };
  if (!T.def.camera) {   // a small track: the whole of it
    const z = vb.fit, cx = B.x + B.w / 2, cy = B.y + B.h / 2;
    out.views.push({ rect, sc: z, ox: vb.vcx - cx * z + shx, oy: vb.vcy - cy * z + shy, players: local, vb });
    return out;
  }
  let tg = players.filter(c => !c.finished); if (!tg.length) tg = players.length ? players : [race.cars.find(c => c.rank === 1) || race.cars[0]];
  const f = framing(T, tg, vb, t);
  let c = camState.get(race);
  if (!c) camState.set(race, c = { x: f.x, y: f.y, z: f.z });
  c.z = Math.exp(lerp(Math.log(c.z), Math.log(f.z), 1 - Math.exp(-2 * dt)));
  c.x = lerp(c.x, f.x, 1 - Math.exp(-4 * dt)); c.y = lerp(c.y, f.y, 1 - Math.exp(-4 * dt));
  const z = c.z, hx = vb.vw / (2 * z), hy = vb.vh / (2 * z), CB = T.view || B;   // (a track may let the camera out past its box: race-clock.js, Moonshot)
  const cx = CB.w <= hx * 2 ? B.x + B.w / 2 : clamp(c.x, CB.x + hx, CB.x + CB.w - hx), cy = CB.h <= hy * 2 ? B.y + B.h / 2 : clamp(c.y, CB.y + hy, CB.y + CB.h - hy);
  out.views.push({ rect, sc: z, ox: vb.vcx - cx * z + shx, oy: vb.vcy - cy * z + shy, players, vb });
  return out;
}
// where the boost pads are, on every route of a course (a pad two routes share is one pad), cached per track
const padSpots = new WeakMap();
function padsOf(race) {
  let L = padSpots.get(race.track); if (L) return L;
  L = [];
  for (const R of race.routes) for (const pd of R.pads) {
    const p = trackSample(R, pd.s), x = p.x + p.nx * pd.lat, y = p.y + p.ny * pd.lat;
    if (!L.some(o => Math.hypot(o.x - x, o.y - y) < 30)) L.push({ x, y, ang: Math.atan2(p.ty, p.tx), up: onBridge(R, pd.s) });
  }
  padSpots.set(race.track, L); return L;
}
// the event feed chips' eased position and fade, per race (never on the race)
const warmed = new WeakSet();
const gameCtx = ctx;
setPrimer(c => { gameCtx.save(); gameCtx.setTransform(1, 0, 0, 1, 0, 0); gameCtx.drawImage(c, 0, 0, 1, 1, 0, 0, 1, 1); gameCtx.restore(); });   // (art/warm.js prime)
// 3D sheets (model3d.js, car3d.js) for a race, queued on the bakery (warm.js), players' first. ui.js showLoading calls
// it with the grid to come and waits; the first frame calls it again for anything not queued (drawn 2D until made).
// Returns how many sheets are still needed (0: all made, or no 3D).
export function warmRace3D(race) {
  if (!settings.models3d && !settings.cars3d) return 0;
  const cars = [...race.cars].sort((a, b) => (b.human ? 1 : 0) - (a.human ? 1 : 0));
  if (settings.models3d) queue3D(cars.map(c => c.ch.id));
  if (settings.cars3d) warmCars3D(cars.map(c => ({ ch: c.ch, look: twinLook(race, c) })));
  return bakesLeft(0);
}
// HUD heads and avatars (~300 canvas calls each) cached in little canvases at screen resolution and the same sub-pixel
// offset, reblitted until `every` s of race time old. key: everything else it depends on; box: extent round (x, y)
// [l, t, r, b] in HUD units; moving (a feed chip sliding or fading): one picture, blitted where it is and faded whole.
const hudSprites = new Map();
function hudSprite(g0, key, t, every, x, y, box, draw, moving = false) {
  const m = g0.getTransform();
  if (m.b || m.c || m.a !== m.d) { draw(g0, x, y); return; }   // (only for the HUD's plain scale)
  const S = m.a, X = m.e + x * S, Y = m.f + y * S, a = g0.globalAlpha;
  let ix, iy, ox, oy, k;
  if (moving) { ox = Math.ceil(-box[0] * S); oy = Math.ceil(-box[1] * S); ix = X - ox; iy = Y - oy; k = `${key}|${S}|~`; }
  else { ix = Math.floor(X + box[0] * S); iy = Math.floor(Y + box[1] * S); ox = Math.round((X - ix) * 16) / 16; oy = Math.round((Y - iy) * 16) / 16; k = `${key}|${S}|${ox}|${oy}|${a}`; }
  let e = hudSprites.get(k);
  if (!e) {
    if (hudSprites.size >= 160) hudSprites.clear();   // (rows reorder, chips come and go: the old ones go now and then)
    const cv = document.createElement('canvas'); cv.width = Math.ceil(ox + box[2] * S) + 1; cv.height = Math.ceil(oy + box[3] * S) + 1;
    hudSprites.set(k, e = { cv, g: cv.getContext('2d'), t: NaN });
  }
  if (!(t >= e.t && t - e.t < every)) {
    const g = e.g; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.clearRect(0, 0, e.cv.width, e.cv.height);
    g.setTransform(S, 0, 0, S, ox, oy); g.globalAlpha = moving ? 1 : a; draw(g, 0, 0); e.t = t;
  }
  g0.save(); g0.setTransform(1, 0, 0, 1, 0, 0); g0.globalAlpha = moving ? a : 1; g0.drawImage(e.cv, ix, iy); g0.restore();
}
const HEAD_DT = 1 / 15, AVATAR_DT = 1 / 24;   // how often a HUD picture steps its animation on: a small head 15 times a second, a card avatar 24 (a cartoon's rate)
const feedView = new WeakMap(), FEED_SHOW = 4, FEED_H = 38, FEED_HEAD = 13, FEED_ICON = 14;
export function render(race, dt) {
  const T = race.track, B = T.bbox, BD = bold(), RC = BD && lookIs('racing');   // BD: a flat look (js/look.js: Classic Flat, Racing, Premium): flat, no glows; RC: Racing's own touches
  // this screen's players: every human, or online only this machine's. slot: their keys and touch zone.
  const local = race.localHumans || race.humans, slot = c => race.localHumans ? race.localHumans.indexOf(c) : c.pIndex;
  Input.driftOn = !!race.drift;   // the drift key and touch button only do anything (and only show) with drift on (race-drift.js)
  if (hudFull) { [W, H] = hudFull; hudFull = null; }   // (a frame that threw mid-HUD)
  if (!warmed.has(race)) { warmed.add(race); warmRace3D(race); }   // the 3D models' and cars' sheets, if the loading screen didn't (or not all)
  const VS = viewsFor(race, dt), pad = VS.pad;
  let hudH = VS.hudH;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = lookOf(T).ground; ctx.fillRect(0, 0, W, H);
  // cached track (and bridge deck) layers, drawn once in world space
  const moonshot = lookOf(T).kind === 'moonshot', key = `${race.trackIdx}|${W}|${H}|${DPR}${moonshot ? '|' + race.cars.length : ''}`;   // (Moonshot's rows have a bay for every racer: art/moonshot.js)
  if (!trackCache || trackCache.key !== key) {
    const M = T.def.camera ? 120 : 360, CB = T.view || B, big = T.def.tiles;   // a margin of scenery past the track's box (or as far as the camera goes)
    // (a very big map, `tiles`: a budget in millions of pixels for its layer, cut into tiles no bigger than 4000 a side)
    const res = big ? Math.min(VS.zMax * DPR, Math.sqrt(big * 1e6 / ((CB.w + M * 2) * (CB.h + M * 2)))) : T.def.camera ? Math.min(VS.zMax * DPR, 4096 / (CB.w + M * 2), 4096 / (CB.h + M * 2)) : Math.min(VS.fit * DPR, 4096 / (CB.w + M * 2));
    const mk = (bx, by, bw, bh, draw) => { const oc = document.createElement('canvas'); oc.width = Math.ceil(bw * res); oc.height = Math.ceil(bh * res); const g = oc.getContext('2d'); g.setTransform(res, 0, 0, res, -bx * res, -by * res); if (draw) draw(g); return { canvas: oc, g, x: bx, y: by, w: bw, h: bh }; };
    // too big for one layer (Moonshot): one baked layer per `world` part, tiled within a pixel budget; painted live
    // between them (moonshotSky)
    const LY = moonshot ? moonshotLayers(T, race.cars.length) : null;
    if (LY) { const area = LY.reduce((a, L) => a + L.w * L.h, 0), r2 = Math.min(res, Math.sqrt(MOONSHOT_PX / area));
      const mkR = (bx, by, bw, bh, draw) => { const oc = document.createElement('canvas'); oc.width = Math.ceil(bw * r2); oc.height = Math.ceil(bh * r2); const g = oc.getContext('2d'); g.setTransform(r2, 0, 0, r2, -bx * r2, -by * r2); if (draw) draw(g); return { canvas: oc, g, x: bx, y: by, w: bw, h: bh }; };
      trackCache = { key, bases: LY.map(L => tiled(mkR, L.x, L.y, L.w, L.h, r2, g => { L.begin(); g.beginPath(); g.rect(L.x, L.y, L.w, L.h); g.clip(); drawTrack(g, T); L.end(); })), sky: true }; }
    else trackCache = { key, bases: [big ? tiled(mk, CB.x - M, CB.y - M, CB.w + M * 2, CB.h + M * 2, res, g => drawTrack(g, T)) : mk(CB.x - M, CB.y - M, CB.w + M * 2, CB.h + M * 2, g => drawTrack(g, T))] };
    trackCache.decks = T.bridges.map(b => { const r = (b.s1 - b.s0) / 2 + T.halfW * 1.5 + 90; return mk(b.x - r, b.y - r, r * 2, r * 2, g => drawBridge(g, T, b)); });
    trackCache.roofs = [...roofLayers(T), ...(lookOf(T).kind === 'plateau' ? sunGate(T) : [])].map(L => mk(L.x, L.y, L.w, L.h, L.draw));   // roofs over the road: a mechanic's (draw-mechanics.js), Pyth Plateau's Sun Gate (art/plateau.js)
  }
  // tyre marks: karts in the run-off leave faint tracks, painted straight onto the cached ground for this race
  { const baseAt = (x, y) => { for (const L of trackCache.bases) if (x >= L.x && y >= L.y && x < L.x + L.w && y < L.y + L.h) return L.g; return null; };   // (the layer a point is on: most tracks have one)
    for (const L of trackCache.bases) L.g.fillStyle = '#00000014';
    for (const c of race.cars) if (c.off && c.speed > 30 && !onBridge(c.T || T, c.s)) for (const sy of [-11, 11]) { const x = c.x - Math.cos(c.heading) * 20 - Math.sin(c.heading) * sy, y = c.y - Math.sin(c.heading) * 20 + Math.cos(c.heading) * sy, g = baseAt(x, y); if (!g) continue; g.beginPath(); g.arc(x, y, 3.2, 0, TAU); g.fill(); }
    // and a drifting kart's rear tyres lay dark rubber on the road, a stroke from where they were last frame (race-drift.js)
    for (const L of trackCache.bases) L.g.lineCap = 'round';
    for (const c of race.cars) {
      const on = c.dAmt > 0.25 && !c.off && c.air <= 0 && c.speed > 60 && !onBridge(c.T || T, c.s), was = skids.get(c);
      if (!on) { if (was) skids.delete(c); continue; }
      const now = [-1, 1].map(sd => driftPt(c, -c.L * 0.36, sd * c.W * 0.4));
      const g = baseAt(c.x, c.y);
      if (was && g) { g.strokeStyle = `rgba(20,20,24,${0.1 + 0.12 * c.dAmt})`; g.lineWidth = Math.max(3.5, c.W * 0.15); g.beginPath(); for (let k = 0; k < 2; k++) { g.moveTo(was[k][0], was[k][1]); g.lineTo(now[k][0], now[k][1]); } g.stroke(); }
      skids.set(c, now);
    } }
  // once a frame, whatever the views: each kart's pose, the ambient life, how it sits on the ramps
  const order = [...race.cars].sort((a, b) => b.rank - a.rank), hills = !!(T.mech && T.mech.elev);
  for (const c of race.cars) updatePose(c, dt, race.time);
  fxAmbient(race, dt, lookOf(T).kind);
  const JP = new Map(race.cars.map(c => [c, jumpPose(c, c.T || T, rampsOf(c.T || T), race.time)]));   // up a ramp, in the air: up off its shadow and a bit bigger (each on its own route's ramps)
  // the world, for the view (the whole screen)
  const drawWorld = (V, first) => {
  const sc = V.sc, ox = V.ox, oy = V.oy, R = V.rect;
  Object.assign(VIEW, { x0: (R.x - ox) / sc, y0: (R.y - oy) / sc, x1: (R.x + R.w - ox) / sc, y1: (R.y + R.h - oy) / sc, sc, w: R.w, h: R.h, first });
  VIEW.cx = (VIEW.x0 + VIEW.x1) / 2; VIEW.cy = (VIEW.y0 + VIEW.y1) / 2;
  ctx.save();
  ctx.setTransform(DPR * sc, 0, 0, DPR * sc, ox * DPR, oy * DPR);
  // only the part of a cached layer that's on screen (drawing all of a big layer every frame is slow)
  const blit = L => {
    if (L.tiles) { for (const t of L.tiles) blit(t); return; }   // (a tiled layer: each tile's own part of it)
    const vx0 = Math.max(L.x, VIEW.x0), vy0 = Math.max(L.y, VIEW.y0), vx1 = Math.min(L.x + L.w, VIEW.x1), vy1 = Math.min(L.y + L.h, VIEW.y1);
    if (vx1 <= vx0 || vy1 <= vy0) return;
    const kx = L.k || L.canvas.width / L.w, ky = L.k || L.canvas.height / L.h, ox0 = L.sx || 0, oy0 = L.sy || 0;   // (a tile: its part starts PAD in)
    ctx.drawImage(L.canvas, ox0 + (vx0 - L.x) * kx, oy0 + (vy0 - L.y) * ky, (vx1 - vx0) * kx, (vy1 - vy0) * ky, vx0, vy0, vx1 - vx0, vy1 - vy0);
  };
  if (trackCache.sky) moonshotSky(ctx, race, VIEW.x0, VIEW.y0, VIEW.x1, VIEW.y1);   // (between the layers: the glow round the planet and the stars, art/moonshot.js)
  for (const L of trackCache.bases) blit(L);
  if (T.mech && T.mech.rain) wetRoad(ctx, race);   // the rain on the road: sheen, reflections, the dry line, puddles (art/neon.js)
  // routes: a dotted line where each player's road goes next; at a long split, bright down the one you're set for,
  // faint down the other
  if (race.routes.length > 1) for (const h of local) {
    if (h.finished) continue;
    ctx.fillStyle = PCOL[h.pIndex];
    const sg = race.splitGuess(h), far = sg ? 1200 : 900;
    const at = (d, R) => !sg || h.s + d < sg.fs.sLock ? trackSample(h.T, h.s + d) : trackSample(R, (R === h.T ? h.s : sg.fs.sAlt - sg.fs.sLock + h.s) + d);
    for (const [R, k0] of sg ? [[sg.route === h.T ? sg.alt : h.T, 0.22], [sg.route, 1]] : [[h.T, 1]]) {
      for (let d = 90, k = 0; d < far; d += 34, k++) {
        if (sg && k0 < 1 && h.s + d < sg.fs.sLock) continue;   // (the faint road only past the split)
        const q = at(d, R), a = 0.85 * k0 * Math.min(1, (far - d) / 300), ph = (race.time * 3 - k * 0.35) % 1;
        ctx.globalAlpha = a * (0.55 + 0.45 * Math.max(0, Math.sin(ph * TAU))); ctx.beginPath(); ctx.arc(q.x, q.y, 5.5, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  // boost pads, every route's once (bridge-deck ones on the deck), lit briefly by a launch
  const drawPads = up => { for (const P of padsOf(race)) {
    const sx = ox + P.x * sc, sy = oy + P.y * sc, m = 120 * sc;
    if (P.up !== up || sx < -m || sy < -m || sx > W + m || sy > H + m) continue;
    let f = 0; for (const c of race.cars) if (c.padCd > 0 && Math.abs(c.x - P.x) < 140 && Math.abs(c.y - P.y) < 140) f = Math.max(f, c.padCd / 0.5);
    drawPad(ctx, P, race.time, f * f);
  } };
  const groundItems = up => { drawPads(up); drawMines(ctx, race, up); ITEMS.leak.drawWorld(ctx, race, up); if (race.loops.length) ITEMS.loop.drawWorld(ctx, race, up); };   // on the road (or on a bridge deck)
  groundItems(false);
  // level crossings: crossbucks, lamps and gate arms (art/vehicles.js)
  if (T.rail) for (const cr of T.rail.crossings) drawCrossing(ctx, T, cr, race.crossingState(cr), race.time);
  itemBoxes(ctx, race, race.time);   // item boxes: a bobbing glass cube over a glowing spot on the road, its shadow staying on the ground (art/icons.js)
  // bits (race-bits.js): chips on the road; a thrown one arcs out and blinks before it fades
  {
    const spots = bitSpots(race), t = race.time;
    const bit = (x, y, h, k, a, i) => {
      if (k <= 0 || a <= 0 || !inView(x, y, 40 + Math.abs(h))) return;
      const bob = Math.sin(t * 3.4 + i * 1.7) * 2;
      ctx.globalAlpha = a;
      if (!BD) { ctx.fillStyle = radial(ctx, x, y, 1, x, y, 24, [[0, 'rgba(100,255,218,0.5)'], [1, 'rgba(100,255,218,0)']]); ctx.beginPath(); ctx.arc(x, y, 24, 0, TAU); ctx.fill(); }
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 5, 7, 3, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(x, y - 6 + bob - h); ctx.rotate(Math.PI / 4 + Math.sin(t * 1.3 + i) * 0.25); ctx.scale(k, k); drawItemIcon(ctx, 'bit', 12); ctx.restore();
      ctx.globalAlpha = 1;
    };
    (race.bits || []).forEach((back, i) => { if (back > t || !spots[i]) return; const since = back ? t - back : 1; bit(spots[i].x, spots[i].y, 0, since < 0.25 ? 0.4 + since * 2.4 + Math.sin(since * 12.6) * 0.15 : 1, 1, i); });
    (race.loose || []).forEach((o, i) => { const p = loosePos(o, t); bit(p.x, p.y, p.h, 1, p.fade < 1 && Math.floor(t * 8) % 2 ? p.fade * 0.35 : p.fade, i + 50); });
  }
  // Overclock: a beam to where a player's Overclock aims, with a reticle and the burn time running down
  for (const h of local) if (h.oc > 0 && h.ocT) {
    const x0 = h.x, y0 = h.y, x1 = h.ocT.x, y1 = h.ocT.y, D = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / D, uy = (y1 - y0) / D;
    const fa = Math.min(1, h.oc / 0.25), lock = clamp((OC_T - h.oc) / 0.35, 0, 1), t = race.time;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = fa;
    if (BD) { ctx.setLineDash([14, 10]); ctx.strokeStyle = '#f08a3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]); }   // flat: a dashed line, no light
    else {
    ctx.strokeStyle = linear(ctx, x0, y0, x1, y1, [[0, 'rgba(255,110,20,0)'], [0.3, 'rgba(255,110,20,0.14)'], [1, 'rgba(255,120,30,0.3)']]);
    ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = linear(ctx, x0, y0, x1, y1, [[0, 'rgba(255,220,160,0)'], [0.35, 'rgba(255,220,160,0.4)'], [1, 'rgba(255,230,180,0.7)']]);
    ctx.lineWidth = 2; ctx.stroke();
    const SP = 46;
    for (let d = (t * 320) % SP + 30; d < D - 30; d += SP) {   // chevrons pointing at the target, streaming towards it
      const x = x0 + ux * d, y = y0 + uy * d, a = Math.min(1, (d - 30) / 70) * Math.min(1, (D - 30 - d) / 40);
      ctx.beginPath(); ctx.moveTo(x - ux * 6 - uy * 9, y - uy * 6 + ux * 9); ctx.lineTo(x + ux * 4, y + uy * 4); ctx.lineTo(x - ux * 6 + uy * 9, y - uy * 6 - ux * 9);
      ctx.strokeStyle = `rgba(70,25,0,${0.4 * a})`; ctx.lineWidth = 6.5; ctx.stroke();
      ctx.strokeStyle = `rgba(255,160,60,${a})`; ctx.lineWidth = 3.5; ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = radial(ctx, x1, y1, 0, x1, y1, 46, [[0, 'rgba(255,140,40,0.45)'], [0.5, 'rgba(255,110,20,0.15)'], [1, 'rgba(255,110,20,0)']]);
    ctx.beginPath(); ctx.arc(x1, y1, 46, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.save(); ctx.globalAlpha = fa; ctx.lineCap = 'round';
    const r = 19 + Math.sin(t * 9) * 1.5;
    ctx.strokeStyle = 'rgba(60,20,0,0.35)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x1 + 1, y1 + 1.5, r, 0, TAU); ctx.stroke();   // a dark edge, down-right: reads on a pale road
    ctx.strokeStyle = '#ff8a1e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x1, y1, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#ffd59a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x1, y1, r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * h.oc / OC_T); ctx.stroke();   // burn time left
    ctx.fillStyle = '#fff3e0'; ctx.beginPath(); ctx.arc(x1, y1, 3.5, 0, TAU); ctx.fill();
    const pr = r + 12 + 16 * (1 - lock) ** 2;   // lock-on pointers, closing in
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4 + t * 1.2, cx = x1 + Math.cos(a) * pr, cy = y1 + Math.sin(a) * pr, ca = Math.cos(a), sa = Math.sin(a);
      ctx.beginPath(); ctx.moveTo(cx - ca * 6, cy - sa * 6); ctx.lineTo(cx + ca * 4 - sa * 6, cy + sa * 4 + ca * 6); ctx.lineTo(cx + ca * 4 + sa * 6, cy + sa * 4 - ca * 6); ctx.closePath();
      ctx.fillStyle = '#ff6d00'; ctx.strokeStyle = 'rgba(60,20,0,0.55)'; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  // Rubber Duck: where a player's duck would go if fired now
  for (const h of local) if (h.item === 'duck' && race.started && !h.finished) ITEMS.duck.drawAim(ctx, race, h);
  ITEMS.mega.drawWorld(ctx, race);
  // Garbage Collector bots: garbage trucks crossing the road, plows fitted on snow and ice (art/vehicles.js)
  { const kind = lookOf(T).kind, snowy = ['snow', 'ice'].includes(kind); for (const g of race.gcs) if (kind === 'moonshot') drawRover(ctx, g, race.time); else drawGarbageTruck(ctx, g, race.time, snowy); }   // (on the Moon: rovers, art/moonshot.js)
  drawMechanics(ctx, race);   // wormholes, slag, press shadows (draw-mechanics.js)
  drawAmbient(ctx, race);     // a track's ambient life under the cars: gull shadows, blinking LEDs (draw-ambient.js)
  // Bridges: the deck covers the road below. A kart counts as on the deck a little before its end (its nose reaches
  // over first); items on the road below go under.
  const decks = trackCache.decks.length > 0;
  const deckD = (b, s, R = T) => { let d = s - b.s; if (!R.open) d = ((d % R.L) + R.L * 1.5) % R.L - R.L / 2; return Math.abs(d) - (b.s1 - b.s); };   // < 0: on the deck
  const onDeck = c => (c.T || T).bridges.some(b => deckD(b, c.s, c.T || T) < c.L * 0.5 + 50);   // (on a course, its own route's bridges: the same decks, its own distances)
  const nearDeck = (x, y) => T.bridges.some(b => Math.hypot(x - b.x, y - b.y) < b.s1 - b.s + 2 * T.halfW);
  let dustUp = null;
  if (decks) {
    const up = new Set(race.cars.filter(onDeck)); dustUp = [];
    if (up.size) for (const p of race.particles) {
      if (p.top || !nearDeck(p.x, p.y)) continue;
      let best = null, bd = 140 * 140; for (const c of race.cars) { const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2; if (d < bd) { bd = d; best = c; } }
      if (best && up.has(best)) dustUp.push(p);
    }
  }
  // particles
  if (dustUp && dustUp.length) { const set = new Set(dustUp); drawParticles(ctx, { particles: race.particles.filter(p => !set.has(p)) }, false); }
  else drawParticles(ctx, race, false);
  ctx.globalAlpha = 1;
  // cars, then mascots above every car (sorted down the screen), then status effects; under-bridge cars, deck, deck cars
  const trickA = c => JP.get(c).spin;
  const fade = c => c.ghost > 0 ? 0.32 + 0.12 * Math.sin(race.time * 9 + c.idx) : (c.hitCd > 0 && c.spinT <= 0 && Math.floor(race.time * 14) % 2 ? 0.6 : 1);
  const drawBody = c => {
    const P = pose(c), J = JP.get(c), h = J.h, LP = loopPose(race, c), SP = secretPose(c), FL = flyLook(race, c);
    if (FL && FL.kart <= 0.02) return;   // inside a rocket or a capsule (race-rocket.js; the rocket's drawn by art/moonshot.js)
    // drifting: the body turned about a point near the nose, rear stepped out by DY; centre and shadow move to (bx, by)
    const DY = c.dYaw || 0, [bx, by] = DY ? driftPt(c, 0, 0) : [c.x, c.y];
    if (SP) { ctx.save(); ctx.translate(c.x + c.jx, c.y + c.jy); secretShadow(ctx, c, SP); ctx.restore(); if (SP.kart <= 0.02) return; }   // on a secret ride: its shadow on the ground, and the kart while it still shows (art/phoenix.js)
    drawCarUnder(ctx, c, race.time);
    const TL = twinLook(race, c);   // a racer someone else has too: the kart in the player's colour (art/cars.js; no ring on the ground: the user found it ugly)
    const rev = !race.started && c.human && c.gasAt > 0;   // holding the gas in the countdown
    if (rev) drawRev(ctx, c, race.time);
    ctx.save(); ctx.translate(bx + c.jx, by + c.jy);
    if (rev) ctx.translate(Math.sin(race.time * 61) * 0.9, Math.sin(race.time * 47) * 0.9);   // the engine shaking the kart
    const burn = c.wheelspin > 0 ? Math.min(1, c.wheelspin / 0.25) : 0;   // a burnout (race-start.js): the kart shaking and fishtailing on the spot
    if (burn) ctx.translate(Math.sin(race.time * 73) * 2.4 * burn, Math.sin(race.time * 59) * 2.4 * burn);
    const EP = hills && !(c.sweptT > 0) && kartHill(c); if (EP) ctx.scale(EP.k, EP.k);   // on a track with heights: a touch bigger up high (nearer you), art/alpine.js
    if (LP) { drawCarShadow(ctx, c.ch, c.heading, LP.up * 0.6); ctx.translate(LP.dx, LP.dy); ctx.scale(1 + 0.25 * LP.up, 1 + 0.25 * LP.up); }   // round an Infinite Loop: up and over, foreshortened
    if (FL) { ctx.translate(0, -FL.lift); ctx.scale(FL.k, FL.k); }   // lifted into a rocket by its gantry's arm or rolling out of it (smaller: going in through its door)
    if (c.growK !== 1) { const k = mallocVis(c); ctx.scale(k, k); }                          // malloc giant (a springy pop, a flicker before it shrinks)
    if (c.moonT > 0) { const k = 0.35 + 0.65 * c.moonT / MOON_T; ctx.scale(k, k); }              // spiralling down onto a moon: smaller and smaller
    if (c.sweptT > 0 && J.water) { ctx.translate(0, Math.sin(race.time * 5 + c.idx) * 2); const k = 0.92 - 0.14 * J.under; ctx.scale(k, k); }   // swept down a torrent (race-cliff.js): bobbing low in the water, now and then going under
    if (c.lavaT > 0) { const k = 0.3 + 0.7 * c.lavaT / SINK_T; ctx.scale(k, k); ctx.rotate(Math.sin(race.time * 9) * 0.06); }   // sinking into lava (draw-mechanics.js closes the lava over it)
    if (LP) { /* round a loop: its shadow is drawn at the loop's foot, above */ }
    else if (SP) ctx.translate(0, -SP.h);   // (its shadow's drawn above; the kart goes up with the fire)
    else if (h > 0) { ctx.save(); ctx.translate(0, -J.hs * RAMP_LIFT); liftShadow(ctx, c, c.heading + c.spin + DY, h - J.hs, J, race.time); ctx.restore(); }   // on a ramp's face, or under it in the air
    else if (EP) { ctx.save(); ctx.translate(EP.sh * 0.8, EP.sh); drawCarShadow(ctx, c.ch, c.heading + c.spin + DY, 0); ctx.restore(); }   // (high up: its shadow a little further off)
    else if (!(c.sweptT > 0)) drawCarShadow(ctx, c.ch, c.heading + c.spin + DY, 0);   // (none on the water)
    ctx.translate(0, -h * RAMP_LIFT); ctx.scale(1 + 0.28 * h, 1 + 0.28 * h);
    const yaw = c.heading + c.spin + DY + J.spin + J.wob + (burn ? Math.sin(race.time * 21) * 0.13 * burn : 0);
    ctx.rotate(yaw); ctx.scale(1 - c.squash * 0.18 - J.sq * 0.08, 1 + c.squash * 0.18 + J.sq * 0.14);
    if (J.pitch || J.roll) ctx.scale(Math.cos(J.pitch), Math.cos(J.roll));   // in a flight: nose up off the lip, nose down on the drop, rocking
    const FK = J.flip ? Math.cos(J.flip) : 1; if (J.flip) ctx.scale(1, Math.sign(FK || 1) * Math.max(0.16, Math.abs(FK)));   // a ski jump's flip (race-cliff.js FLIP): rolled over, edge on at a quarter, its belly up at a half
    if (EP) { ctx.translate(EP.nose, 0); ctx.scale(EP.fs, 1); }   // on a slope: foreshortened, nose up the hill
    if (LP) ctx.scale(Math.sign(LP.k || 1) * (0.2 + 0.8 * Math.abs(LP.k)), 1);
    ctx.globalAlpha = fade(c) * (SP ? SP.kart : 1) * (FL ? FL.kart : 1) * (1 - 0.55 * (J.under || 0));
    if (c.ff > 0 && !BD) { ctx.fillStyle = '#00e5ff55'; ctx.beginPath(); ctx.ellipse(-6, 0, c.L * 0.85, c.W * 1.1, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#00e5ff30'; ctx.beginPath(); ctx.ellipse(-30, 0, c.L * 1.1, c.W * 0.8, 0, 0, TAU); ctx.fill(); }
    if (c.squished > 0) ctx.scale(1.18, 1.3 + 0.05 * Math.sin(race.time * 20));             // squashed flat: spread out
    if (J.wing) drawWings(ctx, c, J.wing, J.roll, race.time, c.spin + J.spin + J.wob);   // flying off the Cliff: hang-glider wings (art/alpine.js)
    // the front wheels: counter-steered in a drift (pointing down the road the kart is really going), else into the turn
    const steer = DY ? lerp(P.steer, clamp(-DY * 1.15, -0.62, 0.62), Math.min(1, Math.abs(DY) * 5)) : P.steer;
    const co = { steer, brake: race.started && !c.finished && !c.gas && c.speed > 25, look: TL };
    if (!(settings.cars3d && drawCar3D(ctx, c.ch, { ...co, yaw, rotated: true }))) drawCar(ctx, c.ch, co);   // Settings > 3D cars (art/car3d.js), else the 2D car
    if (FK < 0) { ctx.globalAlpha *= Math.min(1, -FK * 1.4); ctx.fillStyle = '#2e3440'; ctx.beginPath(); ctx.roundRect(-c.L * 0.44, -c.W * 0.4, c.L * 0.88, c.W * 0.8, 7); ctx.fill(); ctx.fillStyle = '#4c566a'; ctx.fillRect(-c.L * 0.36, -c.W * 0.07, c.L * 0.72, c.W * 0.14); for (const ax of [-0.3, 0.3]) ctx.fillRect(c.L * ax - 2, -c.W * 0.46, 4, c.W * 0.92); }   // upside down: its belly (the floor pan, the driveshaft, the axles)
    ctx.restore();
  };
  const drawRider = c => {
    const P = pose(c), J = JP.get(c), h = J.h, DY = c.dYaw || 0, [bx, by] = DY ? driftPt(c, 0, 0) : [c.x, c.y], a = c.heading + c.spin + DY, k = mallocVis(c), seat = BODIES[c.ch.body].seat * (1 - c.squash * 0.18) * k, up = (settings.cars3d && car3DMade(c.ch, twinLook(race, c)) ? seatUp3D(c.ch) : RIDE_UP[c.ch.body] || 0) * k;   // (on the 2D car while its 3D one's being made)
    const SP = secretPose(c); if (SP && SP.kart <= 0.02) return;   // on a secret ride: it rides the phoenix instead (art/phoenix.js)
    const FL = flyLook(race, c); if (FL && FL.kart <= 0.5) return;   // (inside a rocket or a capsule)
    const LP = loopPose(race, c), bob = c.speed > 20 ? Math.sin(race.time * (8 + c.speed / 40) + c.idx * 2) * 0.7 : 0, dizzy = c.spinT > 0 || c.stall > 0 || c.wheelspin > 0 || (c.sweptT > 0 && !!J.face) || (LP && LP.f > 0.6), ko = c.spinT > 0.75 || c.squished > 0 || c.pinned > 0 || c.moonT > 0 || c.lavaT > 0 || (c.sweptT > 0 && J.face === 'ko');   // ko: the big hits (a train, a fall, squashed, sinking in lava)
    ctx.save(); ctx.translate(bx + c.jx + Math.cos(a) * seat, by + c.jy + Math.sin(a) * seat - h * RAMP_LIFT + bob - up - (FL ? FL.lift : 0));
    if (LP) { ctx.translate(LP.dx, LP.dy); ctx.scale(1 + 0.25 * LP.up, 1 + 0.25 * LP.up); ctx.rotate(-LP.th * (Math.cos(c.heading) >= 0 ? 1 : -1)); }   // round the loop, head over heels
    ctx.scale((1 + 0.28 * h) * k, (1 + 0.28 * h) * k); if (hills) { const EP = kartHill(c); if (EP) ctx.scale(EP.k, EP.k); } if (J.sq) ctx.scale(1 + J.sq * 0.16, 1 - J.sq * 0.2); if (c.moonT > 0) { const km = 0.35 + 0.65 * c.moonT / MOON_T; ctx.scale(km, km); } if (c.lavaT > 0) { const kl = 0.3 + 0.7 * c.lavaT / SINK_T; ctx.translate(0, (1 - kl) * 30); ctx.scale(kl, kl); } if (c.squished > 0) ctx.scale(1.3, 0.5); ctx.globalAlpha = fade(c); if (SP) { ctx.translate(0, -SP.h); ctx.globalAlpha *= SP.kart; }   // a malloc giant's rider is big too; a landing squashes it, a lip stretches it; a squashed one is flattened
    const m3 = settings.models3d && has3D(c.ch.id);   // Settings > 3D models: a turning 3D model (art/model3d.js) facing the way the body does (a trick spin turns it round, not over)
    const mo = { t: race.time + c.idx * 3.1, scale: MASCOT_SCALE, smooth: true, look: [Math.cos(c.heading), Math.sin(c.heading)], face: P.face, yaw: a + J.spin + J.wob,
      lean: P.lean + (m3 ? 0 : trickA(c)) + (J.flip || 0) - DY * (m3 ? 0.2 : 0.55) + (dizzy ? Math.sin(race.time * 11) * 0.28 : 0) + (c.sweptT > 0 && J.water ? Math.sin(race.time * 13 + c.idx) * 0.45 : 0) + (J.shake ? Math.sin(race.time * 31) * 0.55 * J.shake : 0), mood: ko ? 'ko' : dizzy ? 'dizzy' : (LP || (c.finished && c.rank === 1) ? 'happy' : null), sudo: c.sudo > 0 };
    if (!(m3 && drawMascot3D(ctx, c.ch, mo))) drawMascot(ctx, c.ch, mo);
    ctx.restore();
  };
  // karts well off the view aren't drawn, unless doing something drawn far from them (a ride, jump, trail, jet, giant)
  const away = c => !(c.moonT > 0 || c.lavaT > 0 || c.loopT > 0 || c.secretT > 0 || c.sweptT > 0 || c.flyT > 0 || c.air > 0 || JP.get(c).h > 0 || c.growK !== 1 || c.sudo > 0 || c.ff > 0 || c.oc > 0) && !inView(c.x, c.y, 260);
  const layer = all => {
    const cars = all.filter(c => !away(c));
    for (const c of settings.cars3d ? [...cars].sort((a, b) => a.y - b.y) : cars) drawBody(c);   // (3D cars stand up off the road: nearer ones over farther)
    for (const c of [...cars].sort((a, b) => a.y - b.y)) drawRider(c);
    for (const c of cars) drawCarOver(ctx, c, race.time);
  };
  const under = decks ? race.projectiles.filter(p => !(p.T || T).bridges.some(b => deckD(b, p.s, p.T || T) < 40) && nearDeck(p.x, p.y)) : [];
  if (race.tt) drawGhost(ctx, race, false);   // a time trial's ghost, under the karts (draw-timetrial.js)
  if (race.clones.length) ITEMS.thread.drawWorld(ctx, race, k => !decks || !onDeck(k));   // Thread clones, ghostly, under the real karts
  layer(order.filter(c => !decks || !onDeck(c)));
  if (decks) {
    for (const p of under) ITEMS[p.type].drawProjectile(ctx, race, p);
    for (const d of trackCache.decks) blit(d);
    groundItems(true); if (dustUp.length) { drawParticles(ctx, { particles: dustUp }, false); ctx.globalAlpha = 1; }
    if (race.tt) drawGhost(ctx, race, true);
    if (race.clones.length) ITEMS.thread.drawWorld(ctx, race, onDeck);
    layer(order.filter(onDeck));
  }
  // boulders over the karts, then roofs over the road that hide what's under them, and their lights
  drawBoulders(ctx, race); for (const L of trackCache.roofs) blit(L); drawRoofLights(ctx, race);
  for (const c of order) { // labels on top of everything
    ctx.save(); ctx.translate(c.x + c.jx, c.y + c.jy);
    // player tag
    if (c.human) {
      if (c.growK !== 1) ctx.translate(0, -(mallocVis(c) - 1) * 46);   // over a malloc giant's head
      if (c.secretT > 0) { const SP = secretPose(c); if (SP) ctx.translate(0, -SP.h - SP.bird * 70 * birdScale(SP)); }   // over the phoenix
      if (BD) {   // a flat look: a flat pill in the player's colour (Racing: a skewed plate)
        ctx.fillStyle = PCOL[c.pIndex]; ctx.beginPath(); ctx.moveTo(-5, -63); ctx.lineTo(5, -63); ctx.lineTo(0, -57); ctx.closePath(); ctx.fill();
        if (RC) plate(ctx, -15, -82, 30, 20, 'P' + (c.pIndex + 1), PCOL[c.pIndex], '#ffffff', 15);
        else { ctx.beginPath(); ctx.roundRect(-17, -82, 34, 20, Math.min(10, BK.r - 4)); ctx.fill();
          ctx.font = `${BOLD_W || '400 '}${BOLD_W ? 12.5 : 11.5}px ${BOLD_DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff'; ctx.fillText('P' + (c.pIndex + 1), 0, -71.5); }
        ctx.textBaseline = 'alphabetic';
      } else {
      ctx.fillStyle = PCOL[c.pIndex]; ctx.beginPath(); ctx.moveTo(-6, -64); ctx.lineTo(6, -64); ctx.lineTo(0, -57); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.roundRect(-17, -82, 34, 20, 10); ctx.fill();
      ctx.font = `700 13px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText('P' + (c.pIndex + 1), 0, -71.5); ctx.textBaseline = 'alphabetic';
      }
      if (race.time < 5.5 && !Input.touchActive && slot(c) >= 0) { ctx.save(); ctx.scale(1.1, 1.1); const dk = DKEYS[slot(c)].toUpperCase(), dOn = !!Input.drift[slot(c)];   // gas, item and drift (race-drift.js)
        if (race.tt && !race.drift) drawKeycap(ctx, 0, -106, KEYS[slot(c)].toUpperCase(), c.gas || c.gasAt > 0, PCOL[c.pIndex]);
        else if (race.tt) { drawKeycap(ctx, -20, -106, KEYS[slot(c)].toUpperCase(), c.gas || c.gasAt > 0, PCOL[c.pIndex]); drawKeycap(ctx, 20, -106, dk, dOn, PCOL[c.pIndex]); }
        else if (!race.drift) { drawKeycap(ctx, -20, -106, KEYS[slot(c)].toUpperCase(), c.gas || c.gasAt > 0, PCOL[c.pIndex]); drawKeycap(ctx, 20, -106, IKEYS[slot(c)].toUpperCase(), false, PCOL[c.pIndex]); }
        else { drawKeycap(ctx, -38, -106, KEYS[slot(c)].toUpperCase(), c.gas || c.gasAt > 0, PCOL[c.pIndex]); drawKeycap(ctx, 0, -106, IKEYS[slot(c)].toUpperCase(), false, PCOL[c.pIndex]); drawKeycap(ctx, 38, -106, dk, dOn, PCOL[c.pIndex]); } ctx.restore(); }
    }
    ctx.restore();
  }
  drawParticles(ctx, race, true);
  drawMechanicsOver(ctx, race);   // press heads, the low-g dome (draw-mechanics.js)
  drawAmbientOver(ctx, race);     // gulls in the air, steam off hot springs (draw-ambient.js)
  for (const p of race.projectiles) if (!under.includes(p)) ITEMS[p.type].drawProjectile(ctx, race, p);

  // ------------- HUD (screen space)
  // the train (over the cars: it wins)
  if (race.train && race.train.on) drawTrain(ctx, T.rail, race.train, race.time);
  // screen-space effects for this view's players: Fast-Forward speed lines, downhill wind
  ctx.setTransform(DPR, 0, 0, DPR, R.x * DPR, R.y * DPR);
  drawFFScreen(ctx, race, R.w, R.h, ox - R.x, oy - R.y, sc);
  if (T.mech && T.mech.elev) hillScreen(ctx, race, R.w, R.h, ox - R.x, oy - R.y, sc);
  ctx.restore();
  };
  VS.views.forEach((V, i) => drawWorld(V, i === 0));
  const HS = hudScale(W, H), SA = cv.id === 'game' ? SAFE : NO_SAFE; hudFull = [W, H]; W = (W - SA.l - SA.r) / HS; H = (H - SA.t - SA.b) / HS; hudH = VS.hudH / HS;   // the HUD, scaled down on a phone (hudScale), inside the notch and the home bar (qol.js SAFE)
  ctx.setTransform(DPR * HS, 0, 0, DPR * HS, SA.l * DPR, SA.t * DPR);
  // a card per player: online, everyone's (yours first), so you can see what the others are holding; the key hints are yours only
  const humans = race.localHumans ? [...local, ...race.humans.filter(c => !local.includes(c))] : local, mine = c => local.includes(c);
  // a flat look (look.js) swaps the fonts (DISPLAY for titles and numbers, DW its style and weight)
  const n = humans.length, SOFT = BD ? BK.muted : '#9aa3bd', DISPLAY = BD ? BOLD_DISPLAY : `"Bungee", ${FONT}`, DW = BD ? BOLD_W : '', FNT = BD ? BOLD_FONT : FONT, TXT = BD ? BK.text : '#ffffff', LEAD = BD ? BK.yellow : '#ffc93c';
  const rr = (x, y, w, h, r = 0) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); };
  // glass panels from layered fills (shadowBlur is too slow); a flat look uses look.js bpanel
  const glass = BD ? (x, y, w, h, r, a) => bpanel(ctx, x, y, w, h, r, a)
    : (x, y, w, h, r, a = 0.8) => { ctx.fillStyle = 'rgba(0,0,0,0.09)'; for (const e of [6, 3]) rr(x - e, y - e + 6, w + e * 2, h + e * 2, r + e); ctx.fillStyle = `rgba(16,20,34,${a})`; rr(x, y, w, h, r); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.stroke(); };
  // a mascot's head in a little round frame
  // (cached: hudSprite; moving: a feed chip still sliding or fading)
  const head = (ch, x, y, r, ring, mood = null, moving = false) => {
    const bg = BD ? (ring || BK.surface2) : 'rgba(255,255,255,0.1)';
    const draw = (g, x, y) => { g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = bg; g.fill(); if (!BD && ring) { g.strokeStyle = ring; g.lineWidth = 2; g.stroke(); } g.clip(); g.translate(x, y + (FACE_Y[ch.id] ?? 32) * r / 14); drawMascot(g, ch, { t: race.time, scale: r / 14, shadow: false, mood }); g.restore(); };
    hudSprite(ctx, `h|${ch.id}|${r}|${bg}|${!BD && ring}|${mood}`, race.time, HEAD_DT, x, y, [-r - 2, -r - 2, r + 2, r + 2], draw, moving);
  };
  // the drift key (race-drift.js): lit while it's held, in the colour its sparks have reached, with a ring filling up to the next tier
  const driftCap = (c, x, y, col) => {
    const t = c.dOn ? driftTier(c) : 0, lit = !!c.dHeld, dc = t ? tierCol(t) : col;
    if (c.dOn && t < 3) { const nxt = DRIFT.TIERS[t][0], prev = t ? DRIFT.TIERS[t - 1][0] : 0, f = clamp((c.dCharge - prev) / (nxt - prev), 0, 1);
      ctx.strokeStyle = tierCol(t + 1); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y + 1, 15, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke(); }
    else if (t === 3) { ctx.save(); ctx.globalAlpha = 0.55 + 0.45 * Math.sin(race.time * 18); ctx.strokeStyle = dc; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y + 1, 15, 0, TAU); ctx.stroke(); ctx.restore(); }
    drawKeycap(ctx, x, y, DKEYS[slot(c)].toUpperCase(), lit, dc, 0.62);
  };
  const cardH = Math.max(hudH - 24, 84);   // (no thinner than its contents need: a phone on its side is only ~390 tall)
  // where each card goes: in a row along the top of the screen
  const cards = [];
  { const lay = (list, R) => { const k = list.length, w = race.tt ? Math.min(340, R.w - pad * 2) : Math.min(270, (R.w - pad * (k + 1)) / k), right = R.x > 0;   // (a time trial's card has the clock in it; in a view on the right, the cards go in its right corner, clear of the middle)
      list.forEach((c, i) => cards.push({ c, x: right ? R.x + R.w - (k - i) * (w + pad) : R.x + pad + i * (w + pad), y: R.y + 12, w })); };
    lay(humans, { x: 0, y: 0, w: W, h: H }); }
  cards.forEach(({ c, x, y, w: cardW }) => {
    const col = PCOL[c.pIndex], compact = cardW < 210;
    glass(x, y, cardW, cardH, 20);
    if (BD && !lookIs('flat')) { ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, cardW, cardH, BK.r); ctx.clip(); ctx.fillStyle = col;   // the card's left edge in the player's colour (Racing: a slanted stripe and a red bar along the top)
      if (RC) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 9, y); ctx.lineTo(x + 3, y + cardH); ctx.lineTo(x, y + cardH); ctx.fill(); ctx.fillStyle = BK.accent; ctx.fillRect(x + 9, y, cardW, 3); } else ctx.fillRect(x, y, 4, cardH); ctx.restore(); }
    else { ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(x + 8, y + 12, 4, cardH - 24, 2); ctx.fill(); }
    // avatar: the mascot popping out of a ring in the player's colour
    const ax = x + 44, ay = y + cardH / 2 + 2;
    if (BD) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ax, ay, 26, 0, TAU); ctx.fill(); }
    else { ctx.fillStyle = radial(ctx, ax - 8, ay - 10, 2, ax, ay, 27, [[0, shade(col, 0.35)], [1, shade(col, -0.25)]]); ctx.beginPath(); ctx.arc(ax, ay, 26, 0, TAU); ctx.fill(); }
    { const mood = c.spinT > 0.75 || c.squished > 0 || c.pinned > 0 || c.moonT > 0 || c.lavaT > 0 ? 'ko' : c.spinT > 0 || c.stall > 0 ? 'dizzy' : (c.loopT > 0 || (c.finished && c.rank === 1) ? 'happy' : null), sudo = c.sudo > 0;
      hudSprite(ctx, `a|${c.ch.id}|${mood}|${sudo}`, race.time, AVATAR_DT, ax, ay, [-45, -71, 45, 28], (g, ax, ay) => { g.save(); g.beginPath(); g.arc(ax, ay, 26, 0, TAU); g.rect(ax - 44, ay - 70, 88, 70); g.clip(); g.translate(ax, ay + 22); drawMascot(g, c.ch, { t: race.time, scale: 0.86, shadow: false, mood, sudo }); g.restore(); }); }
    // bits held: a badge on the avatar, gold at the cap (none in a time trial)
    if (race.bits && race.bits.length) { const bx = ax - 18, by = ay + 13, full = c.bits >= BIT_CAP;
      if (BD) bbox(ctx, bx, by, 36, 18, 9, BK.surface, full ? BK.yellow : '');
      else { ctx.fillStyle = '#141826'; rr(bx, by, 36, 18, 9); ctx.strokeStyle = full ? '#ffc93c' : c.bits ? '#1de9b6' : 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(bx, by, 36, 18, 9); ctx.stroke(); }
      ctx.save(); ctx.translate(bx + 10, by + 9); ctx.rotate(Math.PI / 4); ctx.globalAlpha = c.bits ? 1 : 0.4; drawItemIcon(ctx, 'bit', 7.5); ctx.restore();
      ctx.font = `700 12px ${FNT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = full ? LEAD : c.bits ? TXT : SOFT; ctx.fillText(String(c.bits || 0), bx + 26, by + 9.5); ctx.textBaseline = 'alphabetic'; }
    const tx = x + 80, slotS = 46, slotX = x + cardW - slotS - 12, slotY = y + (cardH - slotS) / 2;
    if (race.tt) { drawTTCard(ctx, race, c, { x, y, w: cardW, h: cardH, tx, rr }); return; }   // no place and no items: the clock instead
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = `600 12px ${FNT}`; ctx.fillStyle = SOFT; ctx.fillText(`P${c.pIndex + 1} · ${c.ch.name}`, tx, y + 22);
    // place: a big number with a small suffix, gold when leading
    const pl = c.finished ? 'FIN' : String(c.rank), suf = c.finished ? '' : ORD(c.rank).slice(String(c.rank).length).toUpperCase();
    let pw;
    if (RC) {   // Racing: the place on a number plate, yellow when leading
      const ph = compact ? 25 : 29, fs = compact ? 21 : 25; ctx.font = `${DW}${fs}px ${DISPLAY}`; const plw = ctx.measureText(pl + suf).width + 16;
      plate(ctx, tx + 4, y + cardH - 13 - ph, plw, ph, pl + suf, c.rank === 1 ? BK.plate : '#ffffff', BK.plateText, fs); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; pw = plw - 14;
    } else {
    ctx.font = `${DW}${compact ? 26 : 32}px ${DISPLAY}`;
    ctx.fillStyle = c.rank === 1 ? LEAD : TXT; ctx.fillText(pl, tx, y + cardH - 14);
    pw = ctx.measureText(pl).width; ctx.font = `${DW}13px ${DISPLAY}`; ctx.fillText(suf, tx + pw + 2, y + cardH - (compact ? 28 : 33));
    }
    if (!compact) { const lt = `${T.open ? 'STAGE' : 'LAP'} ${Math.max(1, Math.min(c.lap, race.laps))}/${race.laps}`; ctx.font = `700 11px ${FNT}`; const lw = ctx.measureText(lt).width + 14, lx = tx + pw + 30; ctx.fillStyle = BD ? BK.surface2 : 'rgba(255,255,255,0.1)'; rr(lx, y + cardH - 32, lw, 19, BD ? Math.min(9.5, BK.r - 4) : 9.5); ctx.fillStyle = BD ? BK.text : '#dfe4f2'; ctx.fillText(lt, lx + 7, y + cardH - 18.5); }
    // speed: a row of segments, green to red, blue in a slipstream, sandy on the grass
    const segN = 12, segW = (slotX - 12 - tx) / segN, lit = clamp(c.speed / (c.top * 1.3), 0, 1) * segN;
    for (let k = 0; k < segN; k++) { const on = k < lit; ctx.fillStyle = !on ? (BD ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.09)') : c.off ? '#d2b07a' : c.slip ? (BD ? BK.blue : '#4fc3f7') : k < 7 ? (BD ? BK.green : '#45d98e') : k < 10 ? (BD ? BK.yellow : '#ffd23f') : (BD ? BK.red : '#ff5a3c'); rr(tx + k * segW, y + 31, segW - 2, 7, 2); }
    // item slot: what you'll fire next, with a little pop when it arrives, and the second item you're holding in a badge
    if (BD) { const sr = Math.min(12, BK.r - 2); bbox(ctx, slotX, slotY, slotS, slotS, sr, BK.well, c.item ? '' : BK.line); if (c.item) { ctx.strokeStyle = ITEMS[c.item].col; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(slotX + 1, slotY + 1, slotS - 2, slotS - 2, sr - 1); ctx.stroke(); } }   // a flat look: a well with a rim in the item's colour
    else { ctx.fillStyle = 'rgba(255,255,255,0.07)'; rr(slotX, slotY, slotS, slotS, 12); ctx.strokeStyle = c.item ? ITEMS[c.item].col : 'rgba(255,255,255,0.18)'; ctx.lineWidth = c.item ? 2.5 : 1.5; ctx.beginPath(); ctx.roundRect(slotX, slotY, slotS, slotS, 12); ctx.stroke(); }
    const scx = slotX + slotS / 2, scy = slotY + slotS / 2;
    if (c.item) {
      const pop = 1 + 0.25 * Math.exp(-c.itemT * 9) + Math.sin(race.time * 8) * 0.04;
      if (!BD) { ctx.fillStyle = radial(ctx, scx, scy, 2, scx, scy, 30, [[0, alpha(ITEMS[c.item].col, 0.45)], [1, alpha(ITEMS[c.item].col, 0)]]); ctx.fillRect(slotX - 8, slotY - 8, slotS + 16, slotS + 16); }
      ctx.save(); ctx.translate(scx, scy); ctx.scale(pop, pop); drawItemIcon(ctx, c.item, 16); ctx.restore();
      if (c.item2) { const bx = slotX + 1, by = slotY + slotS - 1;
        if (BD) { ctx.fillStyle = BK.surface2; ctx.beginPath(); ctx.arc(bx, by, 13, 0, TAU); ctx.fill(); ctx.strokeStyle = ITEMS[c.item2].col; ctx.lineWidth = 2; ctx.stroke(); }
        else { ctx.fillStyle = '#141826'; ctx.beginPath(); ctx.arc(bx, by, 13, 0, TAU); ctx.fill(); ctx.strokeStyle = ITEMS[c.item2].col; ctx.lineWidth = 2; ctx.stroke(); }
        ctx.save(); ctx.translate(bx, by); drawItemIcon(ctx, c.item2, 9); ctx.restore(); }
      if (c.charges > 1) { ctx.fillStyle = BD ? BK.text : '#ffffff'; ctx.beginPath(); ctx.arc(slotX + slotS - 2, slotY + 2, 9, 0, TAU); ctx.fill(); ctx.fillStyle = BD ? BK.ink : '#141826'; ctx.font = `700 11px ${FNT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('×' + c.charges, slotX + slotS - 2, slotY + 2.5); }
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center'; ctx.font = `700 10px ${FNT}`; ctx.fillStyle = '#ffffff';
      if (mine(c)) { const hint = Input.touchActive ? 'tap ⚡' : 'press ' + IKEYS[slot(c)].toUpperCase();
        if (BD) { ctx.font = `600 10px ${FNT}`; const hw = ctx.measureText(hint).width + 12; ctx.fillStyle = BK.panel; rr(scx - hw / 2, y + cardH + 4, hw, 15, Math.min(4, BK.r)); ctx.fillStyle = BK.text; ctx.fillText(hint, scx, y + cardH + 14.5); }   // a flat look: a small tag
        else ctx.fillText(hint, scx, y + cardH + 14); }
    } else { ctx.fillStyle = BD ? BK.muted : 'rgba(255,255,255,0.25)'; ctx.font = `${DW}20px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', scx, scy + 1); }
    ctx.textBaseline = 'alphabetic';
    if (!Input.touchActive && !compact && mine(c)) { drawKeycap(ctx, slotX - 22, y + 18, KEYS[slot(c)].toUpperCase(), c.gas || c.gasAt > 0, col, 0.62); if (race.drift) driftCap(c, slotX - 48, y + 18, col); }
  });
  // the bots' items: a narrow chip per bot after the player cards (face and item). Not in a time trial or a clip.
  if (!race.tt && !race.clip && cards.length) {
    const bots = race.cars.filter(c => !c.human), last = cards[cards.length - 1], chH = cardH, slotS = 44, cw = 12 + 48 + 8 + slotS + 10, gap = 8;
    let x = last.x + last.w + pad, y = 12;
    if (bots.length && x + bots.length * (cw + gap) > W - pad) { x = cards[0].x; y = 12 + cardH + 6; }   // no room beside the cards: a row under them
    ctx.save(); ctx.globalAlpha = 0.85;
    bots.forEach((c, n) => {
      if (x + cw > W - pad) return;
      glass(x, y, cw, chH, BD ? Math.min(14, BK.r) : 16, 0.6);
      ctx.font = `700 10px ${FNT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = SOFT; ctx.fillText(`BOT ${n + 1}`, x + 36, y + 14);   // its name
      head(c.ch, x + 36, y + chH / 2 + 7, 21, null, c.spinT > 0.75 ? 'ko' : null);
      const sx = x + cw - 10 - slotS, sy = y + (chH - slotS) / 2, ix = sx + slotS / 2, iy = sy + slotS / 2;
      ctx.fillStyle = BD ? BK.well : 'rgba(255,255,255,0.07)'; rr(sx, sy, slotS, slotS, BD ? Math.min(11, BK.r - 2) : 11);
      if (c.item) { ctx.strokeStyle = ITEMS[c.item].col; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(sx + 1, sy + 1, slotS - 2, slotS - 2, BD ? Math.min(10, BK.r - 3) : 10); ctx.stroke();
        ctx.save(); ctx.translate(ix, iy); drawItemIcon(ctx, c.item, 15); ctx.restore();
        if (c.item2) { const bx = sx + 1, by = sy + slotS - 1; ctx.fillStyle = BD ? BK.surface2 : '#141826'; ctx.beginPath(); ctx.arc(bx, by, 11, 0, TAU); ctx.fill(); ctx.strokeStyle = ITEMS[c.item2].col; ctx.lineWidth = 2; ctx.stroke(); ctx.save(); ctx.translate(bx, by); drawItemIcon(ctx, c.item2, 7.5); ctx.restore(); } }
      else { ctx.fillStyle = BD ? BK.muted : 'rgba(255,255,255,0.25)'; ctx.font = `${DW}18px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', ix, iy + 1); ctx.textBaseline = 'alphabetic'; }
      x += cw + gap;
    });
    ctx.restore();
  }
  // standings: place, the mascot's face, name (a time trial: your laps instead, and the split against your ghost)
  if (race.tt) { if (W > 700) drawTTLaps(ctx, race, { W, pad, top: hudH + pad, glass, rr }); const k0 = cards[0] || { x: pad, y: 12, w: 0 }; drawTTSplit(ctx, race, { W, glass, cardX: k0.x, cardY: k0.y, cardH, cardR: k0.x + k0.w }); }   // (the target goes beside the card, or under it)
  else if (W > 700 && !race.clip) {   // (not in a menu clip, clip.js: one kart, and the list would sit over what it shows)
    const sorted = [...race.cars].sort((a, b) => a.rank - b.rank);
    const sw = 184, sx = W - pad - sw, sy = hudH + pad, rowH = 30;
    glass(sx, sy, sw, rowH * race.cars.length + 12, 16, 0.72);
    if (RC) { ctx.fillStyle = BK.accent; ctx.fillRect(sx, sy, sw, 3); }   // Racing: a red bar along the top
    sorted.forEach((c, i) => {
      const y = sy + 6 + rowH * i + rowH / 2;
      if (c.human) { ctx.fillStyle = alpha(PCOL[c.pIndex], BD ? 0.2 : 0.18); rr(sx + 4, y - rowH / 2 + 2, sw - 8, rowH - 4, BD ? Math.min(10, BK.r - 2) : 10); if (BD) { ctx.fillStyle = PCOL[c.pIndex]; rr(sx + 4, y - rowH / 2 + 2, 3, rowH - 4, 1.5); } }
      if (RC) plate(ctx, sx + 9, y - 9, 18, 18, String(i + 1), i === 0 ? BK.plate : '#ffffff', BK.plateText, 15);   // Racing: each place on a little plate
      else { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${DW}14px ${DISPLAY}`; ctx.fillStyle = i === 0 ? LEAD : BD ? BK.text : '#dfe4f2'; ctx.fillText(i + 1, sx + 18, y + 1); }
      head(c.ch, sx + 44, y, 11, c.human ? PCOL[c.pIndex] : null);
      ctx.textAlign = 'left'; ctx.font = `${c.human ? 700 : 500} 13px ${FNT}`; ctx.fillStyle = BD ? (c.human ? BK.text : BK.dim) : c.human ? '#ffffff' : '#c9cfdf';
      ctx.fillText(`${c.ch.name}${c.human ? ' · ' + (c.netName || 'P' + (c.pIndex + 1)) : ''}`, sx + 62, y + 1);   // online: the player's name
      if (c.finished) { ctx.fillStyle = BD ? BK.green : '#45d98e'; ctx.font = `700 13px ${FNT}`; ctx.textAlign = 'right'; ctx.fillText('✓', sx + sw - 12, y + 1); }
    });
    ctx.textBaseline = 'alphabetic';
  }
  // minimap on the big tracks: the whole lap, everyone on it, and the bit you're looking at
  if (T.def.camera) {
    // where: bottom left
    const MR = { w: Math.min(220, W * 0.3), h: H * 0.36 };
    let mw = MR.w, mh = mw * B.h / B.w; if (mh > MR.h) { mh = MR.h; mw = mh * B.w / B.h + 16; }   // (a tall map: as tall as fits)
    const mx = pad, my = H - pad - mh - 8, ms = (mw - 16) / B.w, gaps = T.mech && T.mech.rocket ? T.mech.rocket.spans : null;   // gaps: the rides' stretches, not road (race-rocket.js): dotted
    const inGap = s => gaps && gaps.some(([a, b]) => s > a && s < b);
    glass(mx, my - 8, mw, mh + 16, 16, 0.72);
    if (!race.miniPath || race.miniPath.ms !== ms || race.miniPath.mx !== mx || race.miniPath.my !== my) race.miniPath = { ms, mx, my, gap: gaps && new Path2D(), paths: race.routes.map(R => { const p = new Path2D(); let was = true; for (let k = 0; k < R.N; k += 3) { const q = R.pts[k]; const X = mx + 8 + (q[0] - B.x) * ms, Y = my + (q[1] - B.y) * ms, g = inGap(k * STEP); if (was || g) p.moveTo(X, Y); else p.lineTo(X, Y); was = g; } if (!T.open && !gaps) p.closePath(); return p; }) };
    if (gaps && !race.miniPath.gapDone) { const G = race.miniPath.gap; for (const [a, b] of gaps) { for (let s = a; s <= b; s += 60) { const q = trackSample(T, s), X = mx + 8 + (q.x - B.x) * ms, Y = my + (q.y - B.y) * ms; s === a ? G.moveTo(X, Y) : G.lineTo(X, Y); } } race.miniPath.gapDone = true; }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; if (!BD) { ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = Math.max(4, T.halfW * 2 * ms) + 3; for (const p of race.miniPath.paths) ctx.stroke(p); }
    ctx.strokeStyle = BD ? BK.mini : '#5c6378'; ctx.lineWidth = Math.max(4, T.halfW * 2 * ms); for (const p of race.miniPath.paths) ctx.stroke(p);
    if (race.miniPath.gap) { ctx.strokeStyle = BD ? 'rgba(236,238,242,0.35)' : 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([3, 5]); ctx.stroke(race.miniPath.gap); ctx.setLineDash([]); }   // (the rocket's way up and the capsule's down)
    if (T.mech && T.mech.elev) {   // a track with heights (race-elevation.js): the road tinted by how high it is, valley green to summit white
      const MP = race.miniPath; if (!MP.elev) { MP.elev = MINI_ELEV.map(col => ({ col, p: new Path2D() })); for (const R of race.routes) { const E = R.mech.elev; for (let k = 0; k + 6 < R.N; k += 6) { const b = MP.elev[Math.min(MINI_ELEV.length - 1, Math.floor(E.h[k + 3] / (T.mech.elev.hi + 1) * MINI_ELEV.length))], q = R.pts[k], q2 = R.pts[k + 6]; b.p.moveTo(mx + 8 + (q[0] - B.x) * ms, my + (q[1] - B.y) * ms); b.p.lineTo(mx + 8 + (q2[0] - B.x) * ms, my + (q2[1] - B.y) * ms); } } }
      ctx.lineWidth = Math.max(2, T.halfW * 2 * ms - 1.5); for (const b of MP.elev) { ctx.strokeStyle = b.col; ctx.stroke(b.p); }
    }
    if (race.routes.length > 1) for (const h of local) if (!h.finished) { const sg = race.splitGuess(h); ctx.strokeStyle = PCOL[h.pIndex] + 'c0'; ctx.lineWidth = 2.5; ctx.setLineDash([4, 4]); ctx.stroke(race.miniPath.paths[race.routes.indexOf(sg ? sg.route : h.T)]); ctx.setLineDash([]); }   // (at a long split: the road you're set for)
    ctx.save(); ctx.beginPath(); ctx.roundRect(mx, my - 8, mw, mh + 16, BD ? Math.min(16, BK.r) : 16); ctx.clip();
    if (T.mech && T.mech.hurricane) miniStorms(ctx, race, (x, y) => [mx + 8 + (x - B.x) * ms, my + (y - B.y) * ms], ms);   // the hurricanes, and where they're heading (art/hurricane.js)
    ctx.strokeStyle = BD ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2; for (const V of VS.views) { const sc = V.sc, R = V.rect; ctx.strokeRect(mx + 8 + ((R.x + pad - V.ox) / sc - B.x) * ms, my + ((R.y + V.vb.top + pad - V.oy) / sc - B.y) * ms, V.vb.vw / sc * ms, V.vb.vh / sc * ms); } ctx.restore();   // (each view's part of the map)
    if (race.tt) drawGhostDot(ctx, race, (v, a) => a === 'x' ? mx + 8 + (v - B.x) * ms : my + (v - B.y) * ms);
    for (const c of order) { const X = mx + 8 + (c.x - B.x) * ms, Y = my + (c.y - B.y) * ms; if (c.rank === 1) { ctx.fillStyle = BD ? alpha(BK.yellow, 0.4) : 'rgba(255,201,60,0.35)'; ctx.beginPath(); ctx.arc(X, Y, 8, 0, TAU); ctx.fill(); } const num = c.human && race.humans.length > 1;   // (2+ players: each dot carries its number, not just its colour)
      ctx.fillStyle = c.human ? PCOL[c.pIndex] : twinLook(race, c) ? '#8a90a0' : c.ch.color; ctx.beginPath(); ctx.arc(X, Y, num ? 7 : c.human ? 5 : 3.5, 0, TAU); ctx.fill(); ctx.strokeStyle = BD ? BK.ink : '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      if (num) { ctx.fillStyle = '#ffffff'; ctx.font = `800 9px ${FNT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(c.pIndex + 1), X, Y + 0.5); ctx.textBaseline = 'alphabetic'; } }
  }
  // the event feed (Race.feed): icon chips at the bottom middle, no words (who, what, whom). Newest slides in from the
  // right, older fade left; chips about this screen's players get a rim in their colour.
  {
    const top = H - pad - FEED_H - 6, view = feedView.get(race) || new Map(); feedView.set(race, view);
    const here = c => c && local.includes(c), car = i => i >= 0 ? race.cars[i] : null, ring = c => c && c.human ? PCOL[c.pIndex] : null;
    const evs = race.ticker.filter(e => (e.p === undefined || local.some(h => h.pIndex === e.p)) && race.time >= e.t && race.time - e.t < FEED_T);
    // what's in a chip, left to right: ['h', car, mood] a head, ['i', draw] an icon, ['>'] which way it went
    const parts = e => {
      const a = car(e.a), b = car(e.b);
      if (e.k === 'hit') return [...(a && a !== b ? [['h', a]] : []), ['i', r => drawItemIcon(ctx, e.i, r * 0.92)], ['>'], ['h', b, 'dizzy']];
      if (e.k === 'panic') return [['h', a], ['i', r => { drawItemIcon(ctx, 'panic', r * 0.92); if (e.n > 1) { ctx.fillStyle = BD ? BK.text : '#ffffff'; ctx.beginPath(); ctx.arc(r * 0.8, r * 0.7, 8, 0, TAU); ctx.fill(); ctx.fillStyle = BD ? BK.ink : '#141826'; ctx.font = `700 10px ${FNT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('×' + e.n, r * 0.8, r * 0.72); } }]];
      if (e.k === 'haz') return [['i', r => drawHazardSign(ctx, e.i, r, false)], ['>'], ['h', b, 'ko']];
      if (e.k === 'warn') return [...(a ? [['h', a]] : []), ['i', r => drawHazardSign(ctx, e.i, r, true, e.n)]];
      if (e.k === 'lap') return [['h', a], ['i', r => drawLapFlag(ctx, r, e.n, e.n >= race.laps, race.time)]];
      if (e.k === 'fin') return [['h', a, e.n === 1 ? 'happy' : null], ['i', r => drawPlaceBadge(ctx, r, e.n)]];
      return [];
    };
    const PW = { h: FEED_HEAD * 2, i: FEED_ICON * 2, '>': 7 }, GAP = 4, EDGE = 7;
    const PS = evs.map(parts), WS = PS.map(ps => EDGE * 2 + ps.reduce((s, p) => s + PW[p[0]], 0) + GAP * (ps.length - 1));
    const shown = WS.slice(-FEED_SHOW), total = shown.reduce((s, w) => s + w, 0) + 8 * Math.max(0, shown.length - 1);
    let x = W / 2 + total / 2; const live = new Set();
    for (let k = evs.length - 1; k >= 0; k--) {
      const e = evs[k], ps = PS[k], w = WS[k], age = race.time - e.t;
      x -= w; const tx = x; x -= 8; live.add(e.id);
      let v = view.get(e.id); if (!v) view.set(e.id, v = { x: tx + 90, a: 0 });
      v.x = lerp(v.x, tx, 1 - Math.exp(-11 * dt));
      v.a = evs.length - 1 - k >= FEED_SHOW ? Math.max(0, v.a - dt * 4) : clamp(age / 0.25, 0, 1) * clamp((FEED_T - age) / 0.7, 0, 1);   // past the last slot: fades out as it slides on
      if (v.a < 0.01) continue;
      const a = car(e.a), b = car(e.b), me = here(b) ? b : here(a) ? a : null, cy = top + FEED_H / 2;
      ctx.save(); ctx.globalAlpha = v.a;
      glass(v.x, top, w, FEED_H, FEED_H / 2, me ? 0.86 : 0.7);
      if (me || (e.k === 'fin' && e.n === 1)) { ctx.strokeStyle = me ? PCOL[me.pIndex] : LEAD; ctx.lineWidth = BD ? 1.5 : 2; ctx.beginPath(); ctx.roundRect(v.x + 1, top + 1, w - 2, FEED_H - 2, BD ? Math.max(0, Math.min(FEED_H / 2 - 1, BK.r - 1)) : FEED_H / 2 - 1); ctx.stroke(); }
      let px = v.x + EDGE;
      for (const p of ps) {
        const pw = PW[p[0]], mx = px + pw / 2;
        if (p[0] === 'h') { if (p[1]) head(p[1].ch, mx, cy, FEED_HEAD, ring(p[1]), p[2], v.a < 1 || Math.abs(v.x - tx) > 0.01); }
        else if (p[0] === 'i') { ctx.save(); ctx.translate(mx, cy); p[1](FEED_ICON); ctx.restore(); }
        else { ctx.strokeStyle = BD ? BK.muted : 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(mx - 2, cy - 4); ctx.lineTo(mx + 2, cy); ctx.lineTo(mx - 2, cy + 4); ctx.stroke(); }
        px += pw + GAP;
      }
      ctx.restore();
    }
    for (const id of view.keys()) if (!live.has(id)) view.delete(id);
    ctx.textBaseline = 'alphabetic';
  }
  // winner banner: the winner's car and driver under a spotlight
  if (race.winner && race.winT < 5 && !race.tt) {
    const w = race.winner, t = race.winT, pop = t < 0.4 ? t / 0.4 : 1, s2 = 0.5 + 0.5 * (1 + 2.7 * Math.pow(pop - 1, 3) + 1.7 * Math.pow(pop - 1, 2));
    ctx.save(); ctx.translate(W / 2, H * 0.44); ctx.scale(s2, s2); ctx.globalAlpha = t > 4.3 ? (5 - t) / 0.7 : 1;
    glass(-290, -95, 580, 190, 28, 0.86);
    if (BD) { ctx.fillStyle = BK.surface; ctx.beginPath(); ctx.roundRect(-280, -85, 222, 170, Math.min(12, BK.r)); ctx.fill();   // a flat look: the car on a plain well (Racing: a chequered strip along the top, Premium: an amber hairline)
      if (RC) chequer(ctx, -290, -95, 58, 10, 0.9); else if (lookIs('premium')) { ctx.strokeStyle = alpha(BK.accent, 0.55); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(-286, -91, 572, 182, BK.r - 2); ctx.stroke(); } }
    else {
    ctx.strokeStyle = 'rgba(255,201,60,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-284, -89, 568, 178, 24); ctx.stroke();
    ctx.fillStyle = radial(ctx, -170, -10, 4, -170, 0, 110, [[0, 'rgba(255,236,190,0.35)'], [1, 'rgba(255,236,190,0)']]); ctx.fillRect(-290, -95, 240, 190);
    }
    ctx.save(); ctx.translate(-170, 34); const ks = Math.min(1.45, 118 / BODIES[w.ch.body].L); ctx.scale(ks, ks); drawCarShadow(ctx, w.ch, 0); drawCar(ctx, w.ch, { look: twinLook(race, w) }); ctx.translate(BODIES[w.ch.body].seat, -(RIDE_UP[w.ch.body] || 0)); drawMascot(ctx, w.ch, { t: race.time, scale: 1.25 / ks, mood: 'happy' }); ctx.restore();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${DW}${BD ? (RC ? 64 : 50) : 56}px ${DISPLAY}`;
    if (BD) { ctx.fillStyle = BK.yellow; ctx.fillText('WINNER', 70, -26); }
    else { ctx.fillStyle = linear(ctx, 0, -60, 0, 0, [[0, '#fff1a8'], [1, '#ffb02e']]); ctx.fillText('WINNER', 70, -26); }
    ctx.font = `600 26px ${FNT}`; ctx.fillStyle = TXT; ctx.fillText(w.human ? `P${w.pIndex + 1} · ${w.ch.name}` : `${w.ch.name} (bot)`, 70, 30);
    ctx.restore(); ctx.textBaseline = 'alphabetic';
  }
  // countdown: three reds then green; the last light flickers green in the rocket-start window (race-start.js)
  if (!race.started || race.time < 4.4) {
    const win = !race.started && race.countdown <= ROCKET_WINDOW;
    const nn = Math.ceil(race.countdown), go = race.started, reds = go ? 0 : clamp(4 - nn, 0, 3);
    const a = go ? clamp(1 - (race.time - 3.6) * 1.2, 0, 1) : 1;
    const f = Math.max(0, go ? race.time - 3.6 : 1 - (race.countdown - Math.floor(race.countdown))), bounce = 1 + 0.18 * Math.exp(-f * 8);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H * 0.3);
    glass(-130, -42, 260, 84, 22, 0.9);
    if (RC) chequer(ctx, -130, -42, 52, 5);   // Racing: a chequered strip along the gantry's top
    for (let k = 0; k < 3; k++) {
      const lx = -78 + k * 78, on = go || k < reds, early = win && k === 2, colr = go || early ? (BD ? BK.green : '#38e07b') : (BD ? BK.red : '#ff3b30');
      ctx.fillStyle = BD ? BK.ink : '#05060a'; ctx.beginPath(); ctx.arc(lx, 0, 27, 0, TAU); ctx.fill();
      if (BD) { const lit = on && !(early && Math.floor(race.time * 14) % 2); ctx.fillStyle = lit ? colr : BK.lampOff; ctx.beginPath(); ctx.arc(lx, 0, 22, 0, TAU); ctx.fill();
        ctx.fillStyle = lit ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)'; ctx.beginPath(); ctx.ellipse(lx, -9, 12, 6, 0, 0, TAU); ctx.fill(); continue; }   // flat: flat lamps with a flat lens highlight, no glow (the rocket window blinks)
      ctx.fillStyle = on ? radial(ctx, lx - 7, -8, 2, lx, 0, 24, [[0, '#ffffff'], [0.35, colr], [1, shade(colr, -0.45)]]) : '#1d2130'; ctx.beginPath(); ctx.arc(lx, 0, 22, 0, TAU); ctx.fill();
      if (on) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = radial(ctx, lx, 0, 10, lx, 0, 60, [[0, alpha(colr, early ? 0.2 + 0.3 * (0.5 + 0.5 * Math.sin(race.time * 45)) : 0.45)], [1, alpha(colr, 0)]]); ctx.beginPath(); ctx.arc(lx, 0, 60, 0, TAU); ctx.fill(); ctx.restore(); }
    }
    const txt = go ? 'GO!' : (nn > 3 ? 'READY' : String(nn));
    ctx.translate(0, 112); ctx.scale(bounce, bounce);
    ctx.font = `${DW}${go ? 92 : 72}px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (BD && lookIs('flat')) { ctx.lineJoin = 'round'; ctx.lineWidth = 9; ctx.strokeStyle = BK.ink; ctx.strokeText(txt, 3, 5); ctx.strokeText(txt, 0, 0); }   // Classic Flat: Classic's ink outline and a hard offset, no blur
    else if (BD) { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 3; }   // Racing, Premium: no outline, a soft shadow (only for these few frames)
    else { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillText(txt, 4, 7); ctx.lineJoin = 'round'; ctx.lineWidth = 10; ctx.strokeStyle = '#141826'; ctx.strokeText(txt, 0, 0); }
    ctx.fillStyle = go ? (BD ? BK.green : '#38e07b') : (nn > 3 ? (BD ? BK.yellow : '#ffc93c') : '#ffffff'); ctx.fillText(txt, 0, 0);
    ctx.restore(); ctx.textBaseline = 'alphabetic';
  }
  // online with a poor link (net-link.js): a Wi-Fi sign, so a jerky race is put down to the connection
  if (race.net && race.net.link && race.net.link() === 1) drawLinkIcon(ctx, W / 2, H - 30, BD ? BK.panel : 'rgba(10,8,30,0.72)', performance.now() / 1000);
  [W, H] = hudFull; hudFull = null; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);   // the rest full size: the touch buttons
  // touch: a pause button in the top right corner (the pause card: pause-ui.js)
  if (Input.touchActive && !race.net && !race.paused) { const b = Input.pauseButtonRect();
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(b.x - 6, b.y - 7, 4, 14); ctx.fillRect(b.x + 2, b.y - 7, 4, 14); }
  // touch: item buttons, this screen's players' only (online the others have their own screens)
  if (Input.touchActive && !race.tt) humans.filter(mine).forEach(c => {
    const b = Input.itemButtonRect(slot(c));
    ctx.save(); ctx.translate(b.x, b.y);
    ctx.fillStyle = c.item ? ITEMS[c.item].col : '#00000055'; ctx.strokeStyle = PCOL[c.pIndex]; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill(); ctx.stroke();
    if (c.item) drawItemIcon(ctx, c.item, 22); else { ctx.fillStyle = '#fff8'; ctx.font = `700 28px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⚡', 0, 2); ctx.textBaseline = 'alphabetic'; }
    if (local.length > 1) { const bx = -b.r * 0.72, by = -b.r * 0.72; ctx.fillStyle = PCOL[c.pIndex]; ctx.beginPath(); ctx.roundRect(bx - 14, by - 9, 28, 18, 9); ctx.fill();   // whose button: the player's tag, not just their colour
      ctx.fillStyle = '#ffffff'; ctx.font = `800 11px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('P' + (c.pIndex + 1), bx, by + 0.5); ctx.textBaseline = 'alphabetic'; }
    ctx.restore();
  });
  // touch: drift buttons (race-drift.js), held like the gas: lit while held, in the colour its sparks have reached
  if (Input.touchActive && race.drift) humans.filter(mine).forEach(c => {
    const b = Input.driftButtonRect(slot(c)), t = c.dOn ? driftTier(c) : 0;
    ctx.save(); ctx.translate(b.x, b.y);
    ctx.fillStyle = c.dHeld ? (t ? tierCol(t) : shade(PCOL[c.pIndex], -0.1)) : '#00000055'; ctx.strokeStyle = PCOL[c.pIndex]; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(-4, 8, 17, -Math.PI * 0.95, -Math.PI * 0.2); ctx.stroke();   // a curved arrow: drift
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(14, -6); ctx.lineTo(4, -12); ctx.lineTo(9, 2); ctx.closePath(); ctx.fill();
    ctx.font = `700 10px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('DRIFT', 0, 18); ctx.textBaseline = 'alphabetic';
    ctx.restore();
  });
  // touch zones: the screen split between this screen's players (online, one)
  if (Input.touchActive && local.length > 1) {
    ctx.strokeStyle = '#ffffff33'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); if (local.length > 2) { ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); } ctx.stroke(); ctx.setLineDash([]);
  }
  if (race.zap) drawZap(race);
  if (race.paused) return;   // the pause card is the page's, over the race (pause-ui.js)
  if (race.flash && settings.flashes && BD) { const f = race.flash, a = clamp(f.t / f.max, 0, 1); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = `rgba(${f.col},${0.3 * a})`; ctx.fillRect(0, 0, W, H); }   // a flat look: a flat flash
  else if (race.flash && settings.flashes) { const f = race.flash, a = clamp(f.t / f.max, 0, 1); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, `rgba(${f.col},${0.12 * a})`); g.addColorStop(1, `rgba(${f.col},${0.55 * a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
}


// Kernel Panic: the whole screen flashes red (the bolts onto each car are particles, see fxStrike)
function drawZap(race) {
  const f = clamp(race.zap.t / 0.7, 0, 1);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = `rgba(255,23,68,${0.14 * f * (Math.floor(race.zap.t * 20) % 3 ? 1 : 0.4)})`; ctx.fillRect(0, 0, W, H);
}
