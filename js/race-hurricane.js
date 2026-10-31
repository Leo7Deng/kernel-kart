// Async Atoll's hurricanes (`hurricane`): every so often one tracks across the map on a gently curving path, a spiral of
// cloud bands round a calm eye. The wind circles the eye (anticlockwise, a little inward), strongest in the eyewall,
// fading outward, dead calm in the eye. Along the road it carries you or holds you back; across it shoves you sideways
// (with the square of the wind). The steering pushes back at most half your speed: past that you're pressed against the
// edge (the causeway's breakwater, or the kerb elsewhere: never off the road) and scrape until slow enough to steer off.
// Islands shelter you (LAND); the banked seawall shelters you from the part across. The call: ride a tailwind flat out,
// lift a touch in a crosswind or pay on the wall, drive the eye flat out.
// race.storms: plain numbers from race.rng (the next added ~20 s before the last reaches the middle): path middle
// (mx, my), heading there (a), bend (k per 1000 units), speed (v), eyewall radius (rm), time at the middle (tm), time from
// the map's edge to the middle (h). Everything else follows from those and the clock.
import { Math } from './detmath.js';   // deterministic maths, the same on every computer (detmath.js)
import { TAU, clamp } from './core.js';
import { trackSample } from './geometry.js';
import { untouchable } from './rules.js';
import { nearestS } from './race-mechanics.js';
import { bankFade } from './race-banks.js';


export const TAIL = 0.22;      // a wind of strength 1 straight down the road carries you this much faster over the ground
export const WALL = 6;         // the causeway's breakwater: its inner face, past the edge of the tarmac
export const OUT = 3.2;        // the storm reaches this many eyewall radii out
export const EYE = 0.45;       // the calm eye, as a share of the eyewall radius
export const INFLOW = 0.35;    // the wind spirals in at this angle (radians) off going straight round
export const LAND = 0.85;      // the wind over the islands, as a share of the wind out on the open causeway
const SCRAPE = 450;            // speed lost scraping along the wall (per second), plus a share of how hard you're pressed into it
const KNOCK = 0.88;            // and the speed you keep when you hit it
export const PEAK = 1.5;       // the eyewall's wind (1: as strong as pins you to the wall at `hold` speed straight across)
const DECAY = 0.7;             // outside the eyewall the wind falls off as (eyewall radius / r) to this power
const ASYM = 0.15;             // the side of the storm where it blows the way the storm is going is this much stronger
const CI = Math.cos(INFLOW), SI = Math.sin(INFLOW);
const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
const r3 = x => Math.round(x * 1000) / 1000;   // (the snapshots round to this, so the host keeps them so too: every screen works out the same storm)

export function buildHurricane(T) {
  const d = T.def.hurricane; if (!d) return null;
  const sc = T.def.scale, cw = d.causeway, B = T.bbox;
  const s0 = nearestS(T, cw.from[0] * sc, cw.from[1] * sc), s1 = nearestS(T, cw.to[0] * sc, cw.to[1] * sc);
  // the causeway's sea breeze: which way the breakwaters' foam and the ocean's streaks lie in the calm
  const bl = Math.hypot(d.breeze[0], d.breeze[1]) || 1;
  return { s0, s1, socks: (cw.socks || []).map(p => ({ x: p[0] * sc, y: p[1] * sc })), hold: d.hold || 380, gap: d.gap || [4, 13], first: d.first || [1, 6],
    cx: B.x + B.w / 2, cy: B.y + B.h / 2, rmap: Math.hypot(B.w, B.h) / 2, bx: d.breeze[0] / bl, by: d.breeze[1] / bl };
}
// how much wind reaches the road at s (causeway all, islands LAND), and of the part across (the seawall shelters that)
export function exposure(T, s) {
  const H = T.mech.hurricane, k = clamp((Math.max(H.s0 - s, s - H.s1) - 40) / 280, 0, 1);
  return 1 - k * (1 - LAND);
}
export function crossShelter(T, s) { let m = 1; for (const z of T.mech.banks) m = Math.min(m, 1 - bankFade(z, s)); return m; }

// ---------------------------------------------------------------- the storms
// a new storm entering at te: a path through the middle of the map, any heading, bending a little either way, random size and speed
function makeStorm(H, rng, te) {
  const a = rng() * TAU, off = (rng() * 2 - 1) * 520, along = (rng() * 2 - 1) * 260;
  const mx = Math.round(H.cx - Math.sin(a) * off + Math.cos(a) * along), my = Math.round(H.cy + Math.cos(a) * off + Math.sin(a) * along);
  const k = r3((rng() < 0.5 ? -1 : 1) * (0.06 + 0.12 * rng())), v = Math.round(140 + 40 * rng()), rm = Math.round(375 + 100 * rng());
  const h = r3((H.rmap + 0.8 * OUT * rm) / v);   // (from where it's just reaching the map to the middle)
  return { mx, my, a: r3(a), k, v, rm, tm: r3(te + h), h };
}
// the race's storms: the first a few seconds after the start, each next a while after the last has gone; added from
// race.rng as the race goes, announced on every screen
export function hurricaneUpdate() {
  const H = this.track.mech.hurricane; if (!H || !this.started || this.calm) return;   // (calm, a time trial: no storms, race.storms unset; the sea breeze only)
  const L = this.storms || (this.storms = []);
  while (!L.length || L[L.length - 1].tm < this.time + 20) {
    const last = L[L.length - 1], te = last ? last.tm + last.h + H.gap[0] + this.rng() * (H.gap[1] - H.gap[0]) : this.time + H.first[0] + this.rng() * (H.first[1] - H.first[0]);
    L.push(makeStorm(H, this.rng, te));
  }
  const n = L.filter(S => this.time > S.tm - S.h + 2).length;   // a storm reaching the atoll: thunder, and a sign on every screen
  if (n > (this.stormsSeen || 0)) { this.stormsSeen = n; this.cue('thunder'); if (this.humans.length) this.feed('warn', 'storm', null); }
}
// where storm S is at time t: SX, SY (and its heading, SA). No objects made: this runs a lot.
export let SX = 0, SY = 0, SA = 0;
export function stormAt(S, t) {
  const u = (t - S.tm) * S.v, kk = S.k / 1000, a = S.a + kk * u;
  SX = S.mx + (Math.sin(a) - Math.sin(S.a)) / kk; SY = S.my - (Math.cos(a) - Math.cos(S.a)) / kk; SA = a;
}
// how strong storm S is at time t (0..1), as it comes and goes (it eases in over its first seconds and out over its last)
export const stormLife = (S, t) => smooth(Math.min(1, (S.h - Math.abs(t - S.tm)) / 3));
// wind strength at r from an eye with eyewall radius rm: 0 in the eye, 1 at the eyewall, gone by OUT radii
export function windProfile(r, rm) {
  if (r < rm) return smooth((r / rm - EYE) / (1 - EYE));
  return Math.pow(rm / r, DECAY) * smooth((OUT * rm - r) / (0.3 * OUT * rm));
}
// the wind at (x, y), time t, from all storms: WX, WY (up to about PEAK in an eyewall)
export let WX = 0, WY = 0;
export function windAt(L, x, y, t) {
  WX = 0; WY = 0;
  if (!L) return 0;
  for (const S of L) {
    const dt = t - S.tm; if (dt < -S.h || dt > S.h) continue;
    stormAt(S, t);
    const dx = x - SX, dy = y - SY, R = OUT * S.rm, r2 = dx * dx + dy * dy; if (r2 > R * R || r2 < 1) continue;
    const r = Math.sqrt(r2), tx = dy / r, ty = -dx / r;   // round the eye, anticlockwise on screen
    const g = PEAK * windProfile(r, S.rm) * stormLife(S, t) * (1 + ASYM * (tx * Math.cos(SA) + ty * Math.sin(SA)));
    WX += g * (CI * tx - SI * dx / r); WY += g * (CI * ty - SI * dy / r);
  }
  return Math.hypot(WX, WY);
}

// the sideways shove at speed v from a signed crosswind `side`: at the track's `hold` speed a full crosswind shoves at
// half your speed, as hard as the steering can push back; faster and you drift onto the downwind edge
export const shove = (H, side, v) => side * Math.abs(side) * v * v / (2 * H.hold);
// the wind on the road at s for this kart: along (+ with you) and across (+ to the left of travel)
let ALONG = 0, SIDE = 0;
function roadWind(L, T, q, s, t) {
  const g = windAt(L, q.x, q.y, t); if (g <= 0) { ALONG = SIDE = 0; return 0; }
  const e = exposure(T, s);
  ALONG = (WX * q.tx + WY * q.ty) * e; SIDE = (WX * q.nx + WY * q.ny) * e * crossShelter(T, s);
  return g * e;
}

export function hurricaneCar(c, dt) {
  const T = c.T, H = T.mech.hurricane; if (!H) return;
  const L = this.storms;
  c.gustNear = 0; c.scraping = false;
  if (!L || c.finished) return;
  const v = Math.max(c.speed, 150);
  // a strong crosswind (or the eyewall) on the road in the next 1.5 s: no place to fire a boost (race-ai.js straightAhead)
  if (!c.human) for (let d = 0; d <= v * 1.5; d += 70) {
    const s = c.s + d, g = roadWind(L, T, trackSample(T, s), s, this.time + d / v);
    c.gustNear = Math.max(c.gustNear, SIDE * SIDE, g > 1 ? 0.25 : 0);
  }
  // a sign as a strong wind comes up on the road ahead: which way it'll blow you (across, with you, against you)
  if (c.human && this.time - (c.stormWarn ?? -99) > 8) for (let d = v; d <= v * 2.5; d += 80) {
    const s = c.s + d, g = roadWind(L, T, trackSample(T, s), s, this.time + d / v);
    if (g > 0.8) { c.stormWarn = this.time; this.feed('warn', SIDE * SIDE > 0.45 * g * g ? 'cross' : ALONG > 0 ? 'tail' : 'head', c); break; }
  }
  if (c.air > 0 || c.oc > 0) return;
  const q = trackSample(T, c.s), g = roadWind(L, T, q, c.s, this.time);
  let push = 0;
  if (g > 0 && !untouchable(c)) {
    const fwd = TAIL * ALONG * c.speed;
    push = shove(H, SIDE, c.speed);
    c.x += (q.nx * push + q.tx * fwd) * dt; c.y += (q.ny * push + q.ty * fwd) * dt; c.lat += push * dt;
    if (c.human && g > 0.8 && this.time - (c.gustT || -9) > 2) { c.gustT = this.time; this.sound('gust', c); }
  }
  // the edge: the causeway's breakwaters hold everyone on; elsewhere only the wind can't take you off (pinned against the
  // kerb). Pressed into it you scrape: the nose turns along it and you lose speed, more the harder you're pressed
  const lim = q.hw - c.W * 0.35 - 1, out = Math.sign(c.lat);   // (your side against the wall, still on the tarmac)
  if (Math.abs(c.lat) <= lim) return;
  const causeway = c.s >= H.s0 && c.s <= H.s1;
  if (!causeway && !(push * out > 0 && Math.abs(c.lat - push * dt) <= lim + 0.5)) return;
  const back = c.lat - out * lim; c.x -= q.nx * back; c.y -= q.ny * back; c.lat = c.prevLat = out * lim;
  const road = Math.atan2(q.ty, q.tx); let dh = road - c.heading; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
  const into = out * ((Math.cos(c.heading) * q.nx + Math.sin(c.heading) * q.ny) * c.speed + push);   // how fast you were going into it
  if (Math.abs(dh) < Math.PI / 2 && out * dh < 0) c.heading += dh * (1 - Math.exp(-8 * dt));   // nosing into it: straightened up along it
  if (c.speed < 40 || into <= 0) return;
  c.scraping = true;
  if (this.time - (c.wallT ?? -9) > 0.4) { c.speed *= KNOCK; this.fxSparks(c.x + q.nx * out * c.W * 0.5, c.y + q.ny * out * c.W * 0.5, 8, '#ffd166', 170); }   // hitting it: a knock
  c.wallT = this.time;
  c.speed = Math.max(0, c.speed - (SCRAPE + 2 * into) * dt);
  if ((c.scrapeFx = (c.scrapeFx || 0) - dt) <= 0) {
    c.scrapeFx = 0.07;
    const ch = Math.cos(c.heading), sh = Math.sin(c.heading), x = c.x + q.nx * out * c.W * 0.5 - ch * c.L * 0.1, y = c.y + q.ny * out * c.W * 0.5 - sh * c.L * 0.1;
    this.fxSparks(x, y, 3, '#ffd166', 120);
    if (c.human && this.time - (c.scrapeSnd || -9) > 0.35) { c.scrapeSnd = this.time; this.sound('scrape', c, 0.7); }
  }
}

// the line in the wind: a crosswind pushes the line off by about 60 w/v (the kart crabs at most at half its speed), so it
// holds that far upwind; past that it can't help
export function hurricaneLine(c, tgt, edgeIn) {
  const T = c.T, H = T.mech.hurricane; if (!H || !this.storms) return tgt;
  const q = trackSample(T, c.s); if (roadWind(this.storms, T, q, c.s, this.time) <= 0) return tgt;
  const push = shove(H, SIDE, c.speed);
  return tgt - clamp(60 * push / Math.max(c.speed, 60), -edgeIn * 0.6, edgeIn * 0.6);
}
// a bot in the storm: in a crosswind no faster than it can hold off the edge (better bots cut it finer), looking ahead to
// where the storm will be. Tail or headwinds need nothing
export function hurricaneAI(c, skill, brake, plan) {
  const T = c.T, H = T.mech.hurricane, L = this.storms; if (!H || !L || !L.length) return;
  const m = clamp(0.9 + (skill - 0.92) * 0.9, 0.86, 1), v = Math.max(c.speed, 150);
  let best = null, bv = Infinity;
  for (let d = 0; d <= 960; d += 60) {
    const s = c.s + d; roadWind(L, T, trackSample(T, s), s, this.time + d / v);
    const P = SIDE * SIDE; if (P < 0.05) continue;
    const cap = H.hold / P * m, eq = cap * cap + 2 * brake * d;
    if (eq < bv) { bv = eq; best = { ds: d, v: cap }; }
  }
  if (best) plan.caps.push(best);
}
