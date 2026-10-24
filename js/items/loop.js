// Infinite Loop: drops a glowing loop-the-loop standing on the road behind you. The next kart to drive through it is
// flung round a full vertical loop (about a second, no spin-out) and comes out slower. It's there to be seen and
// missed: the steering line edges round it a little, and lifting or a different line takes you past. 15 s or one
// victim; a Firewall soaks it up; a Ghost, a Fast-Forward or a kart in the air passes through.
// A loop is plain data on race.loops: { T, s, lat, x, y, ang, life, arm, age, owner, used, victim }. A kart riding one
// has c.loopT (seconds left) and c.loopV (its speed going in); race.js updateCar hands it to ride() until it's out.
import { TAU, clamp, fchance, frnd, lerp } from '../core.js';
import { onBridge, trackSample } from '../geometry.js';
import { blockedByShield, phased } from '../rules.js';
import { popClone } from './thread.js';
import { bold } from '../look.js';

// the loop's radius and half its width across the road (what you have to miss), how long the ride takes, the share of
// your speed you come out with, and how long it stands there
export const LOOP_R = 34, LOOP_HW = 20, LOOP_T = 0.9, LOOP_EXIT = 0.7, LOOP_LIFE = 15;
const COL = '#36f59a', CORE = '#d9ffe9';

const wrapD = (T, d) => T.open ? d : ((d % T.L) + T.L * 1.5) % T.L - T.L / 2;
// does kart (or clone) k overlap the loop's footprint? Measured along the road, so a loop under a bridge isn't hit from the deck
const inLoop = (lp, k) => k.T === lp.T && Math.abs(wrapD(lp.T, k.s - lp.s)) < k.L / 2 + 6 && Math.abs(k.lat - lp.lat) < k.W / 2 + LOOP_HW;

// where a kart riding a loop is drawn (cosmetic: the race keeps it at the loop's foot): its offset on screen, how
// foreshortened it is (cos of the way round, negative upside down), how high (0..1), and how far round (0..1).
// The way round is timed on this screen from when it started, so it's smooth online too.
const rides = new WeakMap();
export function loopPose(race, c) {
  if (!(c.loopT > 0)) { rides.delete(c); return null; }
  let r = rides.get(c); if (!r || r.t0 > race.time) rides.set(c, r = { t0: race.time - (LOOP_T - c.loopT) });
  const f = clamp((race.time - r.t0) / LOOP_T, 0, 1), e = f * f * (3 - 2 * f), th = e * TAU;   // slows over the top
  const along = LOOP_R * Math.sin(th), h = LOOP_R * (1 - Math.cos(th));
  return { dx: Math.cos(c.heading) * along, dy: Math.sin(c.heading) * along - h, k: Math.cos(th), up: h / (2 * LOOP_R), th, f };
}

export default {
  id: 'loop', name: 'Infinite Loop', col: COL,
  short: 'loop-the-loop trap behind you',
  desc: 'Drops a glowing loop-the-loop on the road behind you. The next kart through it is flung round the loop and comes out slower: about a second lost. It\'s easy to see: go round it, or lift. Lasts 15 s; a Firewall soaks it up.',
  odds: { lead: 12, front: [6, 0] },   // dropped behind: for cars being chased (like Segfault)
  // fired: what happens. Return true to keep holding it (more charges left).
  use(race, c) {
    const lp = race.dropBehind(c, LOOP_R, { T: c.T, life: LOOP_LIFE, arm: 1, age: 0, owner: c, used: false, victim: null });
    const p = trackSample(c.T, lp.s); lp.ang = Math.atan2(p.ty, p.tx);
    race.loops.push(lp);
    race.fxRing(lp.x, lp.y, COL, 60, 0.4, 5); race.fxSparks(lp.x, lp.y, 8, CORE, 120);
  },
  // a bot holding it: fire now?
  wantUse(race, c) {
    for (const o of race.cars) { if (o === c) continue; const d = c.progress - o.progress; if (d > 0 && d < 140) return true; } return c.itemT > 4;
  },
  // every frame: whoever drives into a loop is sent round it (a Thread clone just pops)
  updateWorld(race, dt) {
    for (const lp of race.loops) {
      lp.life -= dt; lp.arm -= dt; lp.age += dt;
      if (lp.used) continue;
      for (const c of race.cars) {
        if (c.finished || (lp.arm > 0 && c === lp.owner) || c.air > 0 || phased(c) || c.moonT > 0 || c.lavaT > 0 || !inLoop(lp, c)) continue;
        if (blockedByShield(race, c)) { lp.life = 0; race.fxShards(lp.x, lp.y, 8, [COL, CORE], 150, 5); break; }   // a Firewall breaks it
        c.loopT = LOOP_T; c.loopV = c.speed; c.skx = c.sky = 0;
        lp.used = true; lp.victim = c; lp.life = LOOP_T + 0.5;
        race.fxHit(c, COL, 'loop'); race.feed('hit', 'loop', lp.owner, c);
        break;
      }
      if (!lp.used && race.clones.length) for (const k of race.clones) if (k.life > 0 && inLoop(lp, k)) { popClone(race, k); lp.used = true; lp.life = 0.4; break; }
    }
    race.loops = race.loops.filter(lp => lp.life > 0);
  },
  // a kart going round (from race.js updateCar, instead of driving): it stays at the loop's foot, facing along the road,
  // until it comes back down; then on it goes at LOOP_EXIT of the speed it went in with
  ride(race, c, dt) {
    c.loopT -= dt; c.skx = c.sky = 0;
    const p = trackSample(c.T, c.s); c.heading = Math.atan2(p.ty, p.tx);
    if (fchance(0.5)) { const P = loopPose(race, c); if (P) race.fxStars(c.x + P.dx + frnd(-10, 10), c.y + P.dy + frnd(-10, 10), 1, fchance(0.5) ? COL : CORE, 40, 0.4); }
    if (c.loopT > 0) return;
    c.loopT = 0; c.speed = c.loopV * LOOP_EXIT; c.kCmd = 0; c.lineS = c.lat; c.prevLat = c.lat; c.hitCd = Math.max(c.hitCd, 0.5);
    for (let k = 0; k < 4; k++) race.fxPuff(c.x + frnd(-16, 16), c.y + frnd(-16, 16), '#ffffff', frnd(8, 12), 0.4, frnd(-50, 50), frnd(-50, 50));
    race.sound('land', c, c.human ? 1 : 0.5);
  },
  // the steering line edges round a loop ahead (lightly: a player still has to lift or pick a line to miss it for sure;
  // a better bot leans more). edgeIn: how far out the line may go
  steer(race, c, tgt, edgeIn) {
    for (const lp of race.loops) {
      if (lp.used || lp.T !== c.T || (lp.arm > 0 && lp.owner === c)) continue;
      const ds = wrapD(lp.T, lp.s - c.s); if (ds < -c.L * 0.5 || ds > 320) continue;
      const clear = LOOP_HW + c.W * 0.5 + 8, d = tgt - lp.lat; if (Math.abs(d) >= clear) continue;
      let side = Math.abs(d) > 2 ? Math.sign(d) : (lp.lat > 0 ? -1 : 1);
      if (Math.abs(lp.lat + side * clear) > edgeIn) side = -side;
      const w = clamp(1.2 - ds / 300, 0, 1) * (c.human ? 0.35 : clamp(0.35 + (c.ai.skill - 0.92) * 2.2, 0.3, 0.75));
      tgt = lerp(tgt, clamp(lp.lat + side * clear, -edgeIn, edgeIn), w);
    }
    return tgt;
  },
  // the loop: a shadow and a base plate on the road (an ∞ glowing on it), then the ring standing up off it, two neon
  // rails joined by ties, with light running round it; up: the ones on a bridge deck (true) or the ground (false)
  drawWorld(ctx, race, up) {
    for (const lp of race.loops) {
      if (onBridge(race.track, lp.s) !== up) continue;
      const pop = Math.min(1, lp.age / 0.3), sq = pop < 1 ? 1 + Math.sin(pop * Math.PI) * 0.15 : 1;
      const a = clamp(lp.life / 0.5, 0, 1) * (lp.used && !lp.victim ? 0.5 : 1), R = LOOP_R * pop * sq, W = LOOP_HW;
      const tx = Math.cos(lp.ang), ty = Math.sin(lp.ang), nx = -ty, ny = tx;
      const P = (th, l) => [lp.x + tx * R * Math.sin(th) + nx * l, lp.y + ty * R * Math.sin(th) + ny * l - R * (1 - Math.cos(th))];
      ctx.save(); ctx.globalAlpha = a;
      // shadow, cast down-right
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(lp.x + 14, lp.y + 18, R * 1.05, W + 8, lp.ang, 0, TAU); ctx.fill();
      // base plate, with a glowing ∞
      ctx.save(); ctx.translate(lp.x, lp.y); ctx.rotate(lp.ang);
      ctx.fillStyle = '#1d2a33'; ctx.beginPath(); ctx.roundRect(-R * 0.9, -W - 4, R * 1.8, W * 2 + 8, 8); ctx.fill();
      ctx.strokeStyle = COL; ctx.lineWidth = 2; ctx.globalAlpha = a * (0.7 + 0.3 * Math.sin(race.time * 6)); ctx.beginPath();
      for (let i = 0; i <= 40; i++) { const t = i / 40 * TAU, s = 1 + Math.sin(t) ** 2; ctx.lineTo(13 * Math.cos(t) / s, 9 * Math.sin(t) * Math.cos(t) / s); }
      ctx.stroke(); ctx.restore(); ctx.globalAlpha = a;
      // the ring: the far rail, the ties, the near rail (the near one is the one lower on screen)
      const near = ny >= 0 ? W : -W, far = -near, N = 36;
      const rail = (l, col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); for (let i = 0; i <= N; i++) { const [x, y] = P(i / N * TAU, l); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); };
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      rail(far, '#0d5c3a', 6); rail(far, COL, 2.5);
      ctx.strokeStyle = 'rgba(54,245,154,0.55)'; ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) { const th = i / 12 * TAU, [x0, y0] = P(th, far), [x1, y1] = P(th, near); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
      const BD = bold();
      if (!BD) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; rail(near, 'rgba(54,245,154,0.35)', 10); ctx.restore(); }   // (flat: no glow)
      rail(near, '#0d5c3a', 6); rail(near, COL, 3); rail(near, CORE, 1.2);
      // light running round it, the way you'd go
      ctx.save(); ctx.globalCompositeOperation = BD ? 'source-over' : 'lighter';
      for (let k = 0; k < 5; k++) { const th = ((race.time * 0.9 + k / 5) % 1) * TAU; for (const l of [far, near]) { const [x, y] = P(th, l); ctx.fillStyle = BD ? '#ffffff' : 'rgba(217,255,233,0.9)'; ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill(); if (BD) continue; ctx.fillStyle = 'rgba(54,245,154,0.35)'; ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fill(); } }
      ctx.restore();
      ctx.restore();
    }
  },
};
