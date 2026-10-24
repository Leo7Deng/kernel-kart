// Mega Duck: giant duck in the leader's way.
import { topDuck } from '../art/icons.js';
import { STEP, TAU, clamp } from '../core.js';
import { curvAt, halfWAt, insideAt, trackSample, wrapS } from '../geometry.js';

// Comically large: the radius you see is the radius you hit (drawn from above, the duck fills its circle). It's too
// big to fit on the road, so its centre sits off one edge and it bulges onto the road, always leaving a lane for the
// widest kart. It shrinks only where it would reach another bit of track (a hairpin's
// other leg, a figure-eight), so it never sits over road that isn't blocked.
export const MEGA_R = 300;
// where it goes near distance s: {s, lat, r}. Right at a crossing (a bridge, a hairpin's other leg) there's no room, so
// it slides along the road (up to 600 either way) to the nearest spot where it can be big without reaching other road.
// size: a random scale (0.7..1.35) for variety; it still shrinks wherever the road needs it to
export function placeMega(T, s, side, size = 1) {
  let best = null;
  for (let k = 0; k <= 20; k++) {
    const d = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 60, at = wrapS(T, s + d), pl = placeAt(T, at, side, size);
    if (!pl.ok) continue;
    if (pl.r >= 140 * Math.min(1, size)) return { s: at, ...pl };
    if (!best || pl.r > best.r) best = { s: at, ...pl };
  }
  return best || { s, ...placeAt(T, s, side, size) };
}
function placeAt(T, s, side, size) {
  const hw = halfWAt(T, s), lane = Math.max(66, hw * 0.6);    // the open lane: the widest kart (Ferris, 48) plus a little room to steer (was 75: it blocks a bit more now)
  const p = trackSample(T, s);
  let r = clamp(hw * 2.7, 140, MEGA_R) * size, lat = 0, ok = false;
  for (let pass = 0; pass < 12 && !ok; pass++) {
    lat = side * (lane - hw + r);                              // the inner edge of the circle stops `lane` short of the far edge
    const cx = p.x + p.nx * lat, cy = p.y + p.ny * lat;
    let room = Infinity;                                       // distance to the nearest road that isn't this stretch
    for (let i = 0; i < T.N; i += 4) {
      let ds = i * STEP - s; if (!T.open) ds = ((ds % T.L) + T.L * 1.5) % T.L - T.L / 2;
      const q = T.pts[i];
      if (Math.abs(ds) < 1.5 * Math.hypot(q[0] - p.x, q[1] - p.y) + 150) continue;   // this same stretch: not another road
      room = Math.min(room, Math.hypot(q[0] - cx, q[1] - cy) - T.hw[i] - 20);
    }
    if (room < r) { r = Math.max(60, room); continue; }
    if (laneLeft(T, s, cx, cy, r) < 62 && r > 60) { r = Math.max(60, r - 25); continue; }   // the road folds round it: smaller
    ok = true;
  }
  return { lat, r, ok };
}
// the narrowest open gap left on this stretch of road by a duck at (cx, cy) of radius r: at every cross-section it
// touches (within 2r along the road either way), the widest uncovered part of the road. Where turns fold back on
// themselves the circle can cover the road twice over; this catches that.
export function laneLeft(T, s, cx, cy, r) {
  let worst = Infinity;
  for (let d = -2 * r; d <= 2 * r; d += 12) {
    const q = trackSample(T, wrapS(T, s + d)), dx = cx - q.x, dy = cy - q.y, dt = dx * q.tx + dy * q.ty;
    if (Math.abs(dt) >= r) continue;
    const dn = dx * q.nx + dy * q.ny, h = Math.sqrt(r * r - dt * dt), a = dn - h, b = dn + h;   // covered: lat a..b
    const gap = b <= -q.hw || a >= q.hw ? 2 * q.hw : Math.max(a + q.hw, q.hw - b, 0);
    worst = Math.min(worst, gap);
  }
  return worst;
}

export default {
  id: 'mega', name: 'Mega Duck', col: '#ffca28',
  short: 'comically large duck in the leader\'s way',
  desc: 'Inflates a comically large rubber duck on the inside of the next corner ahead of the leader, right on the racing line, for 9 s. Go round the outside. In 1st it drops behind you instead.',
  odds: { front: [7, 0], back: [7, 0], last: [9, 0] }, pack: 0.5,   // costs the leader a corner: that only matters if you're close enough to pass
  // fired: what happens. Return true to keep holding it (more charges left).
  use(race, c, sorted) {
    // on the inside of the next corner ahead of the leader (the racing line), or behind you if you lead
    const lead = sorted.find(o => !o.finished) || c, R = lead.T;
    let s, side;
    if (lead === c) {
      s = race.dropBehind(c, 0, {}).s - 260 - MEGA_R; side = Math.sign(c.lat) || (c.idx % 2 ? 1 : -1);
    } else {
      let best = -1, bk = 0;
      for (let d = 350; d <= 1300; d += 20) { const k = Math.abs(curvAt(R, lead.s + d)); if (k > bk) { bk = k; best = d; } }
      const corner = bk > 1 / 900;
      s = lead.s + (corner ? best : 500);
      side = corner ? Math.sign(insideAt(R, s)) || 1 : Math.sign(lead.lat) || 1;
    }
    const pl = placeMega(R, wrapS(R, s), side, 0.7 + 0.65 * c.rng()); s = pl.s;   // a random size: sometimes small, sometimes huge
    const { lat, r } = pl, p = trackSample(R, s);
    race.megas.push({ by: c, T: R, s, lat, x: p.x + p.nx * lat, y: p.y + p.ny * lat, r, life: 9, age: 0, ang: Math.atan2(p.ty, p.tx) + Math.PI });
    race.fxRing(p.x + p.nx * lat, p.y + p.ny * lat, '#ffca28', r * 1.35, 0.6, 8);
    race.fxConfetti(p.x + p.nx * lat, p.y + p.ny * lat, 14, r * 0.6, ['#ffd166', '#ffffff', '#f5b300']); race.sound('use_mega', { x: p.x, y: p.y });
  },
  // a bot holding it: fire now?
  wantUse(race, c) {
    return c.itemT > 0.8 + c.ai.noise;
  },
  // big and solid: hit one and you bounce off it, slower. A fast-forward or a malloc giant pops it.
  updateWorld(race, dt) {
    for (const m of race.megas) {
      m.life -= dt; m.age += dt;
      for (const c of race.cars) {
        if (c.finished || c.ghost > 0 || c.air > 0) continue;   // not untouchable(): a fast-forward pops it (below)
        const dx = c.x - m.x, dy = c.y - m.y, d = Math.hypot(dx, dy) || 1, min = m.r + c.W * 0.55;
        if (d >= min) continue;
        if (c.ff > 0 || c.grow > 0) { m.life = Math.min(m.life, 0.15); race.fxRing(m.x, m.y, '#ffca28', m.r * 1.3, 0.4, 8); continue; }   // fast-forward or a malloc giant pops it
        const nx = dx / d, ny = dy / d, push = min - d; c.x += nx * push; c.y += ny * push;
        const into = -(Math.cos(c.heading) * nx + Math.sin(c.heading) * ny);
        if (into > 0.2 && (c.duckCd || 0) < race.time) {
          c.duckCd = race.time + 0.8;
          c.speed *= 1 - 0.6 * into;
          c.skx += nx * 420;   // bounced well clear
          c.sky += ny * 420;
          c.squash = 0.8;
          m.wob = 1;
          race.fxStars(c.x, c.y, 6, '#f5b300', 140);
          race.sound('megaBonk', c); if (m.by !== c && !(m.hit || (m.hit = [])).includes(c.idx)) { m.hit.push(c.idx); race.feed('hit', 'mega', m.by, c); }   // once per kart, not every bonk
        }
      }
      m.wob = (m.wob || 0) * Math.exp(-4 * dt);
    }
    race.megas = race.megas.filter(m => m.life > 0);
  },
  // a giant bath duck, puffing up when it lands and wobbling when bonked
  drawWorld(ctx, race) {
    for (const m of race.megas) {
      const pop = Math.min(1, m.age / 0.35), sq = 1 + Math.sin(m.age * 18) * 0.12 * (m.wob || 0), fade = clamp(m.life / 0.4, 0, 1);
      ctx.save(); ctx.translate(m.x, m.y); ctx.globalAlpha = fade;
      ctx.fillStyle = '#00000030'; ctx.beginPath(); ctx.arc(m.r * 0.08, m.r * 0.1, m.r * pop, 0, TAU); ctx.fill();
      ctx.scale(pop * sq, pop / sq); ctx.rotate(m.ang);
      topDuck(ctx, m.r); ctx.restore();   // fills its hit circle: what you see is what you hit
    }
  },
};
