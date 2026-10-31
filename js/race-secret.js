// Secret shortcuts (`secrets`): a spot far out in a corner's outer run-off (a sun stone, a mine mouth) takes a kart that
// arrives blazing (boosting or just stopped, a Ghost, or Memory Leak oil, per `by`) and puts it back up the track at a set
// speed, as a phoenix or down a mine. Otherwise it only stirs. With `pocket` the run-off only reaches it for a blazing
// kart. A gamble: you have to fire a boost into a corner and keep your foot in on the grass; taken, it saves a second or two.
// secrets: [{ at: [x, y, r], to: [x, y], kind, by?, pocket?, hint?, via?, portal?, fire, look?, bots?, v? }] (layout
// units): trigger, exit (further up the same lap, never over the line), kind (SECRET), `via` a point the flight bends
// toward, `portal` a mine's exit beside the road, `fire` how far before the trigger a bot fires (`look` where it starts
// saving a Turbo, default 900; `bots` scales how often), `v` exit speed as a share of top speed, `hint` an event-feed
// sign as a player starts its lap. On a course it belongs to the routes whose run-off it's in.
// While c.secretT > 0 updateCar hands the kart to secretRide (an early return), along rideAt's path; secretPose is
// cosmetic from c.secretT, so it eases online. Nothing hits or touches it meanwhile.
import { Math } from './detmath.js';   // deterministic maths, the same on every computer (detmath.js)
import { TAU, clamp, fchance, frnd, lerp } from './core.js';
import { halfWAt, trackSample } from './geometry.js';
import { nearestS } from './race-mechanics.js';
import { SINK_T } from './race-volcano.js';
import { blockedByShield, untouchable } from './rules.js';


// per kind: ride length (s), height (world units up the screen), take-off and landing lean (shares of the ride spent
// catching fire at the trigger / back before the end); in, out: sounds (audio.js); col, spark: burst colours
export const SECRET = {
  phoenix: { T: 3.4, H: 420, rise: 0.12, back: 0.16, in: 'phoenix', out: 'phoenixLand', col: '#ffd43b', spark: '#ffe082' },   // up in flames over the temple, a rocket swoop down onto the road
  mine: { T: 2.2, H: 0, rise: 0.15, back: 0.15, in: 'mineIn', out: 'mineOut', col: '#ffb74d', spark: '#d9a066' },              // Cron Canyon: into a mine mouth, along the tunnel underground, out of another portal
};
// a boost's heat lingers this long after it runs out (s): the corner's exit, where you run widest, is often just past it
export const HOT = 0.6;

export function buildSecrets(T) {
  const sc = T.def.scale, out = [];
  (T.def.secrets || []).forEach((d, k) => {
    const x = d.at[0] * sc, y = d.at[1] * sc, r = d.at[2] * sc;
    const sIn = nearestS(T, x, y), A = trackSample(T, sIn), lat = (x - A.x) * A.nx + (y - A.y) * A.ny;
    // not this route's: the spot isn't in its run-off (a course: another lap's road)
    if (Math.abs(lat) < A.hw || Math.abs(lat) - r > A.hw + (T.def.runoff || 75) + (d.pocket ? 220 : 0) || Math.hypot(x - A.x - A.nx * lat, y - A.y - A.ny * lat) > 40) return;
    const sOut = nearestS(T, d.to[0] * sc, d.to[1] * sc), B = trackSample(T, sOut);
    if (sOut <= sIn + 200 || Math.hypot(B.x - d.to[0] * sc, B.y - d.to[1] * sc) > B.hw) return;   // (forwards, on this road, never over the line)
    const kind = SECRET[d.kind] ? d.kind : 'phoenix';
    const z = { k, kind, x, y, r, sIn, side: Math.sign(lat), sOut, B, latOut: clamp((d.toLat || 0) * sc, -B.hw * 0.6, B.hw * 0.6), v: d.v || 1, fire: d.fire || 500, look: (d.fire || 500) + (d.look || 900), bots: d.bots ?? 1,
      by: d.by || ['boost', 'oil'], pocket: d.pocket ? Math.abs(lat) + r * 0.6 : 0,   // (the pocket ends across the stone: a kart carried right out there is held against the end of it, on the stone)
      hint: !!d.hint, lat,
      via: d.via ? { x: d.via[0] * sc, y: d.via[1] * sc } : null, sFire: sIn - (d.fire || 500),
      pillar: d.pillar ? { x: d.pillar[0] * sc, y: d.pillar[1] * sc } : null };   // (pillar: where the phoenix's pillar of fire erupts from, if not the trigger: the top of a pyramid)
    // a mine: the mouth just beyond the trigger (away from the road), and the portal you come out of beside the road
    if (kind === 'mine') { z.mouth = { x: x + A.nx * z.side * r * 0.9, y: y + A.ny * z.side * r * 0.9, a: Math.atan2(A.ny * z.side, A.nx * z.side) }; const P = d.portal || d.to; z.portal = { x: P[0] * sc, y: P[1] * sc }; z.portal.a = Math.atan2(B.y + B.ny * z.latOut - z.portal.y, B.x + B.nx * z.latOut - z.portal.x); }
    out.push(z);
  });
  return out;
}

// the ride's ground path from (x0, y0): a cubic bending toward `via` and coming in along the road (so it lands facing
// the right way). u: 0..1
function pathAt(z, x0, y0, u) {
  const B = z.B, ex = B.x + B.nx * z.latOut, ey = B.y + B.ny * z.latOut, d = Math.hypot(ex - x0, ey - y0);
  const v = z.via || { x: (x0 + ex) / 2, y: (y0 + ey) / 2 };
  const p1x = lerp(x0, v.x, 0.9), p1y = lerp(y0, v.y, 0.9), p2x = ex - B.tx * d * 0.45, p2y = ey - B.ty * d * 0.45, w = 1 - u;
  const a = w * w * w, b = 3 * w * w * u, c = 3 * w * u * u, e = u * u * u;
  return { x: a * x0 + b * p1x + c * p2x + e * ex, y: a * y0 + b * p1y + c * p2y + e * ey };
}
// a mine's: drive into the mouth, straight along the tunnel underground (easing in and out), out of the portal onto the road
function minePath(z, K, x0, y0, f) {
  const M = z.mouth, Pt = z.portal, ex = z.B.x + z.B.nx * z.latOut, ey = z.B.y + z.B.ny * z.latOut, e = q => q * q * (3 - 2 * q);
  if (f < K.rise) { const q = f / K.rise; return { x: lerp(x0, M.x, q), y: lerp(y0, M.y, q), h: 0 }; }
  if (f < 1 - K.back) { const q = e((f - K.rise) / (1 - K.rise - K.back)); return { x: lerp(M.x, Pt.x, q), y: lerp(M.y, Pt.y, q), h: 0 }; }
  const q = (f - 1 + K.back) / K.back; return { x: lerp(Pt.x, ex, q), y: lerp(Pt.y, ey, q), h: 0 };
}
// where the ride has the kart at f (0 at the take-off, 1 at the landing): on the ground (x, y) and how high (h)
export function rideAt(z, x0, y0, f) {
  const K = SECRET[z.kind]; if (z.kind === 'mine') return minePath(z, K, x0, y0, f);
  const fl = flight(K, f), p = pathAt(z, x0, y0, fl.u); return { x: p.x, y: p.y, h: fl.h, u: fl.u };
}
// how far along the path (u) and how high (h) the ride is at f (0 at the take-off, 1 at the landing)
function flight(K, f) {
  const g = clamp((f - K.rise) / (1 - K.rise - K.back * 0.35), 0, 1), u = g * g * (3 - 2 * g);   // eases off the trigger and onto the road
  const hf = clamp((f - K.rise * 0.5) / (1 - K.rise * 0.5 - K.back * 0.35), 0, 1);
  return { u, h: K.H * Math.pow(Math.sin(Math.PI * hf), 0.75) };
}

// in the state a secret wants: boosting (or just stopped), phased out by a Ghost, or oiled, as it says (by)
export const blazing = (c, z) => z.by.some(k => k === 'boost' ? c.boost > -HOT || c.mtT > -HOT :   // (a drift's mini-turbo counts as a boost, race-drift.js)
  k === 'ghost' ? c.ghost > 0 : k === 'oil' ? c.oiled > 0 : false);
// a kart on the trigger (any part of it), blazing: taken
export function secretCar(c) {
  const T = c.T; if (!T.mech.secrets.length || c.finished || c.air > 0 || c.ff > 0) return;
  for (const z of T.mech.secrets) {
    const ds = z.sIn - c.s;
    if (z.hint && c.human && ds > 0 && ds < 1500 && c.secretWarn !== c.lap) { c.secretWarn = c.lap; this.feed('warn', 'sun', c); }   // (a sign in the feed: something's out there this lap)
    if (Math.abs(ds) > z.r + 200 || c.lat * z.side < halfWAt(T, c.s) * 0.9 || Math.hypot(c.x - z.x, c.y - z.y) > z.r + c.W * 0.5) continue;
    if (!blazing(c, z)) continue;   // no fire in you: it only stirs (draw-mechanics.js)
    const K = SECRET[z.kind];
    c.secretT = K.T; c.secretK = z.k; c.secretX = c.x; c.secretY = c.y;
    c.boost = c.turbo = c.oiled = c.oc = 0; if (c.mtT > 0) c.mtT = 0; c.ocT = null; c.spinT = 0; c.skx = c.sky = 0; c.kCmd = 0; c.slide = 0; c.trick = false;
    this.fxRing(c.x, c.y, K.col, 90, 0.6, 8); this.fxStars(c.x, c.y, 10, K.spark, 150, 0.6); this.sound(K.in, c);
    if (z.kind === 'phoenix') {   // a pillar of fire erupts from the stone: a fireball, rings of fire, a blinding flash
      this.fxBoom(c.x, c.y, 2.2); this.fxRing(c.x, c.y, '#ff8a2a', 200, 0.55, 14); this.fxRing(c.x, c.y, '#ffd166', 300, 0.8, 7); this.fxRing(c.x, c.y, '#ffffff', 120, 0.3, 6);
      const px = z.pillar ? z.pillar.x : c.x, py = z.pillar ? z.pillar.y : c.y;
      for (let i = 0; i < 40; i++) fire(this, px + frnd(-34, 34), py + frnd(-22, 22), frnd(-70, 70), frnd(-900, -200), frnd(18, 36), frnd(0.5, 1), true);
      for (let i = 0; i < 16; i++) { const a = frnd(0, TAU), v = frnd(120, 260); fire(this, c.x, c.y, Math.cos(a) * v, Math.sin(a) * v * 0.7, frnd(16, 26), frnd(0.5, 0.9), false); }
      this.flashFor(c, { t: 0.7, max: 0.7, col: '255,180,80' }); this.jolt(c, 1); nearby(this, c, 0.35);
    }
    return;
  }
}

// the ride: runs instead of the car's own update (race.js) until it's back on the road
export function secretRide(c, dt) {
  const T = c.T, z = secretOf(c), K = SECRET[z.kind];
  c.secretT -= dt;
  const f = clamp(1 - c.secretT / K.T, 0, 1), P = rideAt(z, c.secretX, c.secretY, f), Q = rideAt(z, c.secretX, c.secretY, Math.min(1, f + 0.01));
  c.speed = clamp(Math.hypot(P.x - c.x, P.y - c.y) / Math.max(dt, 1e-4), 0, 1200);   // (what the HUD shows: how fast its shadow goes)
  if (Math.hypot(Q.x - P.x, Q.y - P.y) > 0.5) c.heading = Math.atan2(Q.y - P.y, Q.x - P.x);
  c.x = P.x; c.y = P.y;
  c.skx = c.sky = 0; c.jx = c.jy = 0;
  if (z.kind === 'phoenix') phoenixFx(this, c, K, f, P, Q, z);
  if (c.secretT > 0) return;
  // back on the road, at a set speed, pointing along it
  const B = trackSample(T, z.sOut);
  c.secretT = 0; c.s = z.sOut; c.lat = c.prevLat = c.lineS = z.latOut; c.x = B.x + B.nx * z.latOut; c.y = B.y + B.ny * z.latOut;
  c.heading = Math.atan2(B.ty, B.tx); c.speed = c.top * z.v; c.kCmd = 0; c.off = false; c.reach = 1; c.hitCd = Math.max(c.hitCd, 0.4);
  c.progress = this.progressOf(c);
  this.fxRing(c.x, c.y, K.col, 110, 0.55, 9); this.fxStars(c.x, c.y, 12, K.spark, 190, 0.6); this.sound(K.out, c);
  if (z.kind === 'phoenix') blast(this, c);   // (everyone it comes down on burns out)
  if (z.kind === 'phoenix') {   // it hits the road like a meteor: a blinding fireball, shockwaves, a ring of flame racing out, a mushroom of fire, sparks raining, a scorched crater
    const x = c.x, y = c.y;
    this.fxBoom(x, y, 3); this.fxFlash(x, y, '#fff6d5', 260, 0.3);
    this.fxRing(x, y, '#ffffff', 260, 0.45, 10); this.fxRing(x, y, '#ff8a2a', 420, 0.8, 18); this.fxRing(x, y, '#ffd166', 560, 1.1, 8); this.fxRing(x, y, '#ff5a1f', 700, 1.5, 5);
    for (let i = 0; i < 60; i++) { const a = i / 60 * TAU + frnd(-0.08, 0.08), r = frnd(30, 260), v = frnd(60, 200); fire(this, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, Math.cos(a) * v, Math.sin(a) * v * 0.8, frnd(20, 40) * (1.3 - r / 400), frnd(0.8, 1.8), false); }   // (a ring of flame over the ground, burning out)
    for (let i = 0; i < 24; i++) fire(this, x + frnd(-30, 30), y + frnd(-20, 20), frnd(-30, 30), frnd(-900, -400), frnd(26, 44), frnd(0.6, 1), true);   // the mushroom's stem...
    for (let i = 0; i < 26; i++) { const a = frnd(-Math.PI, 0), v = frnd(120, 300); fire(this, x + Math.cos(a) * 40, y - frnd(300, 420), Math.cos(a) * v, Math.sin(a) * v * 0.35, frnd(30, 50), frnd(0.8, 1.4), true); }   // ...and its cap
    for (let i = 0; i < 40; i++) fire(this, x + frnd(-260, 260), y - frnd(150, 500), frnd(-40, 40), frnd(0, 60), frnd(4, 8), frnd(0.9, 1.6), true, 600);   // sparks raining down
    for (let i = 0; i < 24; i++) fire(this, x + frnd(-160, 160), y + frnd(-100, 100), frnd(-30, 30), frnd(-90, -30), frnd(4, 8), frnd(1.6, 3), true, -25);   // embers drifting up
    for (let i = 0; i < 6; i++) this.fxPuff(x + frnd(-50, 50), y + frnd(-40, 40), '#2b1a10', frnd(40, 70), frnd(3.2, 4.2));   // the scorched crater, fading
    this.fxSparks(x, y, 40, '#ffb238', 520); this.flashFor(c, { t: 0.6, max: 0.75, col: '255,220,150' }); this.jolt(c, 1.6); nearby(this, c, 0.6);
  }
}
// everyone else's screen whose kart is near: a smaller shake
function nearby(race, c, k) { for (const o of race.cars) if (o !== c && Math.hypot(o.x - c.x, o.y - c.y) < 1100) race.jolt(o, k); }
// a flame (a 'fire' particle: a glowing ball cooling to smoke, fx.js); g: it falls (or rises, negative) as it goes
function fire(race, x, y, vx, vy, size, life, top, g = 0) { race.particles.push({ kind: 'fire', x, y, vx, vy, size, life, maxLife: life, top, ...(g ? { g } : {}) }); }
// the phoenix's fire as it flies (cosmetic; race particles, so they go online): flames off it, falling feathers, ground fire
function phoenixFx(race, c, K, f, P, Q, z) {
  const h = P.h, x = c.x, y = c.y - h, dx = Q.x - P.x, dy = Q.y - Q.h - P.y + P.h, d = Math.hypot(dx, dy) || 1, bx = -dx / d, by = -dy / d, k = 1 + 1.2 * h / K.H;
  if (f < K.rise + 0.06) { const px = z.pillar ? z.pillar.x : c.secretX, py = z.pillar ? z.pillar.y : c.secretY; for (let i = 0; i < 6; i++) fire(race, px + frnd(-34, 34), py + frnd(-16, 16), frnd(-50, 50), frnd(-1100, -400), frnd(20, 38), frnd(0.4, 0.8), true); return; }   // the pillar of fire
  if (f > 1 - K.back * 0.4) return;
  for (let i = 0; i < 6; i++) { const sp = frnd(60, 300), w = frnd(-1, 1) * 130 * k; fire(race, x + by * w + frnd(-20, 20), y - bx * w + frnd(-20, 20), bx * sp + frnd(-60, 60), by * sp + frnd(-60, 60), frnd(18, 36) * k * 0.7, frnd(0.45, 0.85), true); }   // flames pouring off it, wing tip to wing tip
  for (let i = 0; i < 2; i++) fire(race, x + frnd(-120, 120) * k, y + frnd(-10, 40), frnd(-40, 40), frnd(20, 100), frnd(6, 11), frnd(0.9, 1.5), true, 420);   // burning feathers falling
  fire(race, c.x + frnd(-50, 50), c.y + frnd(-40, 40), frnd(-25, 25), frnd(-25, 25), frnd(26, 44), frnd(1.2, 2.2), false);   // flames bursting along the ground under its path, burning out
  if (fchance(0.35)) race.fxPuff(c.x + frnd(-30, 30), c.y + frnd(-30, 30), '#3b2416', frnd(18, 28), 2.4);   // and scorch
}
// the phoenix lands like a meteor: karts within BLAST melt down as at the volcano (lavaSink). Untouchable karts shrug it
// off, a Firewall soaks it, its rider is spared. Warning: a target ring as it dives (art/phoenix.js)
export const BLAST = 270;
export const landingOf = z => ({ x: z.B.x + z.B.nx * z.latOut, y: z.B.y + z.B.ny * z.latOut });
function blast(race, c) {
  for (const o of race.cars) {
    if (o === c || o.finished || o.lavaT > 0 || o.secretT > 0 || o.moonT > 0 || Math.hypot(o.x - c.x, o.y - c.y) > BLAST || untouchable(o)) continue;
    o.hitCd = 1.5;
    if (blockedByShield(race, o)) { o.speed *= 0.5; continue; }
    o.lavaT = SINK_T; o.lavaS = o.s; o.lavaBy = 'phoenix'; o.speed = 0; o.skx = o.sky = 0; o.spinT = 0; o.trick = false; o.air = 0;
    race.fxHit(o, '#ff6d00', 'phoenix'); race.feed('hit', 'phoenix', c, o);
    for (let i = 0; i < 10; i++) fire(race, o.x + frnd(-20, 20), o.y + frnd(-14, 14), frnd(-40, 40), frnd(-260, -80), frnd(14, 24), frnd(0.5, 0.9), true);
  }
}
// a pocket secret: a blazing kart heading its way can run past the run-off's end to it. The run-off limit (race.js) for this kart
export function secretRunoff(c, lim) {
  for (const z of c.T.mech.secrets) if (z.pocket && c.lat * z.side > 0 && Math.abs(c.s - z.sIn) < z.r + 260 && blazing(c, z)) lim = Math.max(lim, z.pocket);
  return lim;
}
export const secretOf = c => c.T.mech.secrets.find(z => z.k === c.secretK) || c.T.mech.secrets[0];

// how a kart on a ride looks now (drawing only; null when not on one): f 0..1, h height, kart how much of it shows, bird
// how much phoenix, dir its screen heading (rad), flap the wingbeat
export function secretPose(c) {
  if (!(c.secretT > 0) || !c.T.mech) return null;
  const z = secretOf(c); if (!z) return null;
  const K = SECRET[z.kind], f = clamp(1 - c.secretT / K.T, 0, 1), at = q => rideAt(z, c.secretX, c.secretY, clamp(q, 0, 1)), { h } = at(f);
  const kart = z.kind === 'mine' ? (f < K.rise ? 1 - f / K.rise : f > 1 - K.back ? clamp((f - 1 + K.back) / (K.back * 0.4), 0, 1) : 0)   // (into the dark, and out of the portal)
    : f < K.rise ? 1 - f / K.rise * 0.85 : f > 1 - K.back ? (f - 1 + K.back) / K.back : 0.15 * clamp(1 - (f - K.rise) / 0.08, 0, 1);
  const bird = z.kind !== 'phoenix' ? 0 : clamp(Math.min((f - K.rise * 0.35) / (K.rise * 0.9), (1 - f) / (K.back * 0.9)), 0, 1);
  const Q = at(f + 0.02), R = at(f - 0.02), dx = Q.x - R.x, dy = Q.y - Q.h - R.y + R.h;
  return { z, kind: z.kind, f, h, kart, bird, dir: Math.hypot(dx, dy) > 0.5 ? Math.atan2(dy, dx) : -Math.PI / 2, flap: f * K.T * 7.5, trail: k => { const p = at(f - k); return { x: p.x, y: p.y - p.h, h: p.h }; } };
}

// a bot: now and then a good one with a Turbo goes for it, fires on time and keeps its foot in
// the secrets coming up for a kart and how far ahead: its own road and (on a course) next lap's past the line
function ahead(race, c) {
  const out = c.T.mech.secrets.map(z => ({ z, ds: z.sIn - c.s }));
  const N = race.routes.length > 1 && !race.track.forks && c.lap < race.laps ? race.routeFor(c.lap + 1) : null;
  if (N && N !== c.T && N.mech) for (const z of N.mech.secrets) out.push({ z, ds: c.T.L - c.s + z.sIn, next: true });
  return out;
}
export function secretAI(c, skill, brake, plan) {
  for (const { z, ds, next } of ahead(this, c)) {
    if (ds < -80 || ds > z.look) continue;
    const lap = c.lap + (next ? 1 : 0);
    if (c.ai.secretLap !== lap && c.item === 'boost' && ds > Math.min(z.fire, 220)) { c.ai.secretLap = lap; c.ai.secretGo = c.rng() < secretOdds(this, c) * z.bots; }   // (once a lap, as soon as it has a Turbo for it)
    if (!c.ai.secretGo) continue;
    if (c.item !== 'boost' && !(c.boost > 0)) { c.ai.secretGo = false; continue; }   // lost it (fired it at someone, hit)
    if (!next && ds < z.fire + 60) { plan.zones.push({ s0: c.s - 10, s1: z.sIn + 60, v: 1e4, vMax: 1e4 }); c.ai.stayWide = true; c.ai.carry = true; }   // flat out, out of the apex
  }
}
// how likely a bot with a Turbo goes for it: never a weak one, about a third for a strong one, more when behind, less leading
function secretOdds(race, c) {
  let p = 0.12 + (c.ai.skill - 1) * 2.8;
  if (c.rank === 1 && race.cars.length > 1) p -= 0.08; else if (c.rank === race.cars.length && race.cars.length > 1) p += 0.08;
  return clamp(p, 0, 0.4);
}
// a bot's Turbo near a secret it's going for: hold it until the firing point, then fire (null: nothing to say)
export function secretUse(race, c) {
  if (!c.ai.secretGo || c.item !== 'boost' || !c.T.mech) return null;
  for (const { z, ds } of ahead(race, c)) { if (ds < -80 || ds > z.look) continue; return ds <= z.fire; }
  return null;
}
