// Kernel Kart: low gravity. Under the dome a ramp throws you more than twice as far as anywhere else, over a crater.
// Too slow at the lip and you drop into the crater (and restart from well before the ramp); too fast and you sail
// straight on past the bend beyond it: a little too fast lands you in the dust, a lot too fast and a moon out past the
// bend catches you in its gravity (`moon`): you're pulled into orbit, spiral down onto it and pop, then respawn at a
// standstill on the road past the bend. In the air you
// can't steer or change speed, so the whole call is made before the lip: how fast to hit it. The window is the same speeds for everyone.
import { clamp, lerp } from './core.js';
import { halfWAt, projectToTrack, trackSample, wrapS } from './geometry.js';
import { nearestS } from './race-mechanics.js';


// airtime off a low-gravity ramp at speed v (a normal ramp is clamp(v / 560, 0.3, 0.9))
export const lowgAir = (g, v) => clamp(v / 560, 0.3, 1) * g.g;
export const MOON_T = 2.4;   // how long a moon's orbit lasts before you pop
export const CRASH_KEEP = 0.4, CRASH_SPIN = 0.6;   // a crash landing past the bend (`crash`, Moonshot's Causeway Leap): the share of your speed it keeps, and the spin

export function buildLowG(T) {
  const sc = T.def.scale;
  return (T.def.lowg || []).map(d => {
    const sR = nearestS(T, d.at[0] * sc, d.at[1] * sc), sC = nearestS(T, d.crater[0] * sc, d.crater[1] * sc), half = d.crater[2] * sc / 2;
    const g = { sR, c0: sC - half, c1: sC + half, g: d.g || 2.2, A: trackSample(T, sR), dome: d.dome ? { x: d.dome[0] * sc, y: d.dome[1] * sc, r: d.dome[2] * sc } : null, splash: !!d.splash, crash: !!d.crash, early: d.early || 0, vLo: 0, vHi: 0, sLand: sR };
    // the window: leaving the lip on the centre line, pointing down the road, where do you come down? Clean: at least
    // `clear` past the crater, and at least `edge` inside the road's edge (Moonshot's: inside its middle half, where you
    // still make the bend after it)
    const h = Math.atan2(g.A.ty, g.A.tx), clear = d.clear ?? 40, edge = d.edge ?? 22;
    for (let v = 100; v <= 700; v += 2) {
      const dist = v * lowgAir(g, v), q = projectToTrack(T, g.A.x + Math.cos(h) * dist, g.A.y + Math.sin(h) * dist, sR + dist, 300);
      if (!g.vLo) { if (q.s > g.c1 + clear) g.vLo = v; else continue; }
      if (Math.abs(q.lat) < halfWAt(T, q.s) - edge) { g.vHi = v; g.sLand = q.s; } else break;
    }
    g.vOk = Math.min(g.vHi, d.ok || 1e4);   // (ok: the fastest that still makes the bend past the landing, when that's less: Moonshot's)
    if (d.moon) {   // [x, y, r, pull]: the moon past the bend, and how close its gravity reaches
      g.moon = { x: d.moon[0] * sc, y: d.moon[1] * sc, r: d.moon[2] * sc, pull: d.moon[3] * sc, s: wrapS(T, g.sLand + 60) };
      const B = T.bbox, m = g.moon, e = m.pull * 0.6, x0 = Math.min(B.x, m.x - e), y0 = Math.min(B.y, m.y - e);   // the camera goes as far as the moon
      Object.assign(B, { x: x0, y: y0, w: Math.max(B.x + B.w, m.x + e) - x0, h: Math.max(B.y + B.h, m.y + e) - y0 });   // (the props are already scattered: nothing in the race reads the box)
    }
    // the track's planets (T.def.planets, [x, y, r]: drawn as the theme's gas giants): run off the road anywhere along the
    // corner beside one and its gravity has you too. You respawn where you ran off.
    g.planets = (T.def.planets || []).map(([x, y, r]) => {
      const p = { x: x * sc, y: y * sc, r: r * sc * 0.6, pull: 0, s: null };
      let edge = 1e9; for (let i = 0; i < T.N; i += 2) edge = Math.min(edge, Math.hypot(T.pts[i][0] - p.x, T.pts[i][1] - p.y) - T.hw[i]);
      p.pull = (edge + 60) * 0.94; return p;   // reaches over the road (it only takes karts off it), so running wide anywhere along the corner does it (6% less since 2026-10-22, the user's call: about 35 past the edge)
    });
    return g;
  });
}

export function lowgCar(c, dt, prevS) {
  const T = c.T;
  for (const [i, g] of T.mech.lowg.entries()) {
    const ds = g.sR - c.s;
    if (c.human && ds > 350 && ds < 1000 && c.lowgWarn !== c.lap + i * 100) { c.lowgWarn = c.lap + i * 100; this.feed('warn', 'lowg', c); }   // (i: a lap with two leaps warns of each)
    // the lip: off you go, for a long time
    if (prevS < g.sR && c.s >= g.sR && c.air <= 0 && c.speed > 60 && !c.off && c.ff <= 0 && c.oc <= 0) {
      c.trick = c.human ? (!c.gas && this.time - (c.gasOffAt === undefined ? -9 : c.gasOffAt) < 0.25) : c.rng() < clamp(0.3 + (c.ai.skill - 0.92) * 3, 0.2, 0.85);
      c.landS = null; c.jumpCd = 1.2; c.jumpAt = g.sR; c.air = c.airT = lowgAir(g, c.speed); c.moonJump = true;
      this.fxRing(c.x, c.y, '#b9c6ff', 50, 0.4, 5); this.sound(c.trick ? 'trick' : 'jump', c, c.human ? 1 : 0.5);
    }
    // too close to the moon (flying off the ramp, or off the road): caught in its gravity
    for (const m of g.moon ? [g.moon, ...g.planets] : g.planets) {
      if (!((m === g.moon && c.moonJump) || c.off) || c.finished || c.ff > 0 || Math.hypot(c.x - m.x, c.y - m.y) >= m.pull) continue;
      const a = Math.atan2(c.y - m.y, c.x - m.x), vx = Math.cos(c.heading), vy = Math.sin(c.heading);
      c.moonT = MOON_T; c.moonM = m; c.moonS = m.s ?? c.s; c.moonA = a; c.moonR0 = Math.hypot(c.x - m.x, c.y - m.y); c.moonDir = Math.sign(-Math.sin(a) * vx + Math.cos(a) * vy) || 1;   // orbit the way you were going
      c.air = 0; c.moonJump = false; c.trick = false; c.speed = 0; c.skx = c.sky = 0;
      this.fxRing(c.x, c.y, '#c5cae9', 70, 0.5, 6); this.sound('fall', c); this.feed('haz', 'lowg', null, c); this.spillBits(c);   // (your bits fly out: race-bits.js)
      return;
    }
    if (c.moonJump && c.air <= 0) {   // down: a little too fast, the dust past the bend (the run-off)
      c.moonJump = false;
      // (crash: a lot too fast, past the road's edge, and it's a crash landing in the scrub: CRASH_KEEP of your speed, a stagger)
      if (g.crash && c.jumpAt === g.sR && Math.abs(c.lat) > halfWAt(T, c.s) - c.W * 0.35) {
        c.speed *= CRASH_KEEP; c.boost = 0; c.spinT = Math.max(c.spinT, CRASH_SPIN); c.skx = c.sky = 0;
        this.jolt(c, 0.7); this.sound('hit_crash', c, c.human ? 0.8 : 0.4); this.feed('haz', 'lowg', null, c);
        for (let i = 0; i < 9; i++) this.fxPuff(c.x + (i - 4) * 8, c.y + (i % 3 - 1) * 9, '#c9d6a0', 16, 1.0, (i - 4) * 34, (i % 3 - 1) * 30);
        this.fxStars(c.x, c.y, 4, '#ffd166', 110);
      }
    }
    // on the ground over the crater: in you go
    if (c.air <= 0 && c.s > g.c0 && c.s < g.c1 && !c.finished && c.spinT <= 0 && c.ff <= 0 && c.oc <= 0) {
      const runUp = Math.max(380, (g.vLo * 1.2) ** 2 / (2 * c.acc) + 80), back = wrapS(T, g.sR - runUp);   // room to reach the window from a standstill
      const q = trackSample(T, back), lat = clamp(c.lat, -q.hw + c.W, q.hw - c.W);
      c.s = back; c.lat = c.prevLat = c.lineS = lat; c.x = q.x + q.nx * lat; c.y = q.y + q.ny * lat; c.heading = Math.atan2(q.ty, q.tx);
      c.speed = 0; c.skx = c.sky = 0; c.spinT = 1.0; c.hitCd = 1.5; c.kCmd = 0; c.trick = false; c.progress = this.progressOf(c);
      this.fxHit(c, g.splash ? '#b3e5fc' : '#9fa8da', g.splash ? 'splash' : 'fall');   // (splash: into water, Moonshot's Causeway Leap)
    }
  }
}

// caught by a moon or a planet: spiral down onto it, faster and tighter, then pop and respawn on the road past the bend. Runs instead of
// the car's own update (race.js), so nothing else moves it, times it or hits it meanwhile.
export function moonOrbit(c, dt) {
  const m = c.moonM, f = clamp(1 - (c.moonT -= dt) / MOON_T, 0, 1), T = c.T;
  const r = lerp(c.moonR0, m.r * 0.4, f * f), w = 2.5 + 9 * f;
  c.moonA += c.moonDir * w * dt; c.x = m.x + Math.cos(c.moonA) * r; c.y = m.y + Math.sin(c.moonA) * r;
  c.heading = c.moonA + c.moonDir * Math.PI / 2; c.spin += 9 * f * dt;
  if (f > 0.15 && Math.floor(this.time * 20) % 3 === 0) this.fxStars(c.x, c.y, 1, '#e8eaf6', 60, 0.4);
  if (c.moonT > 0) return;
  this.fxBoom(c.x, c.y, 0.9); this.sound('hit_mine', c);   // pop
  const q = trackSample(T, c.moonS);
  c.moonT = 0; c.s = c.moonS; c.lat = c.prevLat = c.lineS = 0; c.x = q.x; c.y = q.y; c.heading = Math.atan2(q.ty, q.tx); c.spin = 0;
  c.speed = 0; c.skx = c.sky = 0; c.spinT = 1.0; c.hitCd = 1.5; c.kCmd = 0; c.progress = this.progressOf(c);
  this.fxRing(c.x, c.y, '#c5cae9', 60, 0.45, 5);
}

// a bot hits the lip at a speed inside the window (a better bot aims nearer the middle of it); the road past the lip
// doesn't matter, it's in the air
// (early: be down to it this far short of the lip: lifting slows you less as you slow, so a bot planning to lift right
// up to the lip arrives too fast. Moonshot's; c.ai.leapNear: no boosts into it, and the timed obstacles past it (the
// gantry arms) don't slow it short of the window: it times them after the landing, race-timed.js)
export function lowgAI(c, skill, brake, plan) {
  c.ai.leapNear = false;
  for (const g of c.T.mech.lowg) {
    const ds = g.sR - c.s; if (ds < 0 || ds > 1400) continue;
    const vT = g.vLo + (g.vOk - g.vLo) * clamp(0.5 + (skill - 1) * 1.2, 0.3, 0.6);
    plan.cut = Math.min(plan.cut, ds); plan.caps.push({ ds: Math.max(0, ds - g.early), v: vT });
    if (g.early) c.ai.leapNear = true;
  }
}
