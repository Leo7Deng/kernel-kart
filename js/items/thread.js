// Thread: a solid decoy clone drives just ahead of you to one side for 8 s; hits pop it, boxes it takes are yours.
// Clones are plain data on race.clones (online snapshots carry them); not cars: no place, laps or finish.
import { Math } from '../detmath.js';
import { BODIES, TAU, clamp, frnd } from '../core.js';
import { RIDE_UP, drawCar, drawCarShadow, drawMascot } from '../art.js';
import { halfWAt, projectToTrack, trackSample, wrapS } from '../geometry.js';
import { hitsCar } from '../race.js';
import { isGiant } from './grow.js';
import { bold } from '../look.js';

// life, side gap (on top of both half-widths), lead (share of your length: the user wants it in front), colour
export const THREAD_T = 8, THREAD_GAP = 12, THREAD_AHEAD = 0.9, THREAD_COL = '#6fa8ff';

// the clones of car c still running
export const clonesOf = (race, c) => race.clones.filter(k => k.owner === c && k.life > 0);
// a hazard of radius r at (x, y): does it touch a clone (other than one of `skip`'s)? If so that clone pops; true if one did
export function hitClone(race, x, y, r, skip = null) {
  for (const k of race.clones) {
    if (k.life <= 0 || k.owner === skip || !hitsCar(k, x, y, r)) continue;
    popClone(race, k); return true;
  }
  return false;
}
// a clone pops: it was hit (or its 8 s ran out: quiet = true, a softer unravel)
export function popClone(race, k, quiet = false) {
  if (k.popped) return;
  k.popped = true; k.life = 0;
  race.fxRing(k.x, k.y, THREAD_COL, quiet ? 50 : 70, 0.4, quiet ? 4 : 6); race.fxFlash(k.x, k.y - 16, '#e3f0ff', quiet ? 24 : 36, 0.15);
  race.fxShards(k.x, k.y, quiet ? 6 : 12, ['#9fc8ff', '#ffffff', '#4f86f7'], quiet ? 110 : 180, 6);
  if (!quiet) race.fxStars(k.x, k.y, 6, '#cfe3ff', 140);
  race.sound('threadPop', k, quiet ? 0.6 : 1);
}

export default {
  id: 'thread', name: 'Thread', col: THREAD_COL,
  short: 'a clone of you drives just ahead, 8 s',
  desc: 'Spawns a clone of your kart that drives just ahead of you, to one side, for 8 s. It\'s solid, so karts behind bump into it; a Bubble or a Pull Request coming for you may take the clone instead if it\'s nearer; any item box it drives through is yours. Anything that hits it pops it.',
  odds: { lead: 5, front: [9, 5], back: [8, 4], last: [6, 2] },   // a pack item: a body to block with and a second hand for the boxes; a little defence for the leader
  // fired; return true to keep holding it (charges left)
  use(race, c) {
    // on the side with more road, or the other side from a clone you already have (with one each side, the older one pops)
    const mine = clonesOf(race, c); if (mine.length >= 2) popClone(race, mine[0], true);
    const T = c.T, hw = halfWAt(T, c.s), held = clonesOf(race, c)[0];
    const side = held ? -held.side : Math.abs(c.lat) > 4 ? -Math.sign(c.lat) : (c.idx % 2 ? 1 : -1);
    const B = BODIES[c.ch.body] || BODIES.kart, lat = clamp(c.lat + side * (c.W0 + B.W) / 2, -hw + B.W * 0.6, hw - B.W * 0.6);
    const k = { clone: true, owner: c, T, s: wrapS(T, c.s + c.L0 * THREAD_AHEAD), lat, x: c.x, y: c.y, heading: c.heading, speed: c.speed, vLat: 0, life: THREAD_T, age: 0, side, L: c.L0, W: c.W0, weight: c.weight0, touch: [] };
    const p = trackSample(T, k.s); k.x = p.x + p.nx * lat; k.y = p.y + p.ny * lat;
    race.clones.push(k);
    race.fxRing(k.x, k.y, THREAD_COL, 60, 0.4, 5); race.fxStars(k.x, k.y, 6, '#cfe3ff', 110);
  },
  // a bot holding it: fire now? Someone right behind (a body to block them, a decoy), something homing in, or a box ahead
  wantUse(race, c) {
    for (const o of race.cars) { if (o === c || o.finished) continue; const d = c.progress - o.progress; if (d > 0 && d < 220) return true; }
    for (const p of race.projectiles) if (p.target === c && p.life > 0) return true;
    for (const b of race.boxes) { if (b.t > 0) continue; const bo = b.on.get(c.T); if (!bo) continue; let ds = bo.s - c.s; if (ds < 0) ds += c.T.L; if (ds > 150 && ds < 450) return c.itemT > 0.5; }
    return c.itemT > 4;
  },
  // every frame (after the cars have moved): each clone keeps station beside its owner, bumps karts, picks up boxes
  updateWorld(race, dt, sorted, leader) {
    for (const k of race.clones) {
      const o = k.owner;
      k.life -= dt; k.age += dt;
      if (o.finished || k.life <= 0) { popClone(race, k, true); continue; }
      if (o.T !== k.T) { const q = projectToTrack(o.T, k.x, k.y, o.s, 120); k.T = o.T; k.s = q.s; k.lat = q.lat; }   // a new route (or a fork): onto yours
      const T = k.T, L = T.L;
      let ds = o.s - k.s; if (!T.open) ds = ((ds % L) + L * 1.5) % L - L / 2;
      if (Math.abs(ds) > 500 || Math.hypot(o.x - k.x, o.y - k.y) > 650 || o.moonT > 0 || o.lavaT > 0) { popClone(race, k); continue; }   // you were thrown somewhere: the thread snaps
      // its line: just ahead of you on its side; if the road's too narrow for that, straight in front of you instead
      const hw = halfWAt(T, k.s), lim = hw - k.W * 0.6, beside = (o.W + k.W) / 2 + THREAD_GAP;
      const want = clamp(o.lat + k.side * beside, -lim, lim), room = Math.abs(want - o.lat) >= (o.W + k.W) / 2 + 4;
      const dsT = room ? o.L0 * THREAD_AHEAD : (o.L + k.L) / 2 + 14;
      // speed: yours, plus whatever closes the gap to its station (it drives your speed profile, not its own)
      const vT = Math.max(0, o.speed + clamp((ds - dsT) * 2.5, -160, 160));
      k.speed += (vT - k.speed) * (1 - Math.exp(-4 * dt));
      k.s += k.speed * dt;
      if (T.open && k.s >= L - 1) { popClone(race, k, true); continue; }
      k.s = wrapS(T, k.s);
      const lat0 = k.lat; k.lat += ((room ? want : clamp(o.lat, -lim, lim)) - k.lat) * (1 - Math.exp(-3 * dt));
      k.lat = clamp(k.lat, -hw + k.W / 2, hw - k.W / 2);
      k.vLat = (k.lat - lat0) / dt;
      const p = trackSample(T, k.s); k.x = p.x + p.nx * k.lat; k.y = p.y + p.ny * k.lat; k.heading = Math.atan2(p.ty, p.tx) + Math.atan2(k.vLat, Math.max(k.speed, 60));
      // karts against it: solid, by weight, like car-on-car contact (race.js collideCars), but a Fast-Forward, a sudo
      // or a malloc giant just pops it
      for (const c of race.cars) {
        if (c === o || c.finished || c.T !== T || c.ghost > 0 || c.air > 0 || c.moonT > 0 || c.lavaT > 0 || c.loopT > 0) continue;
        let d = c.s - k.s; if (!T.open) d = ((d % L) + L * 1.5) % L - L / 2;
        const dl = c.lat - k.lat, ox = (c.L + k.L) / 2 - Math.abs(d), oy = (c.W + k.W) / 2 - Math.abs(dl), ti = k.touch.indexOf(c.idx);
        if (ox <= 0 || oy <= 0) { if (ti >= 0) k.touch.splice(ti, 1); continue; }
        if (c.ff > 0 || c.sudo > 0 || isGiant(c)) { popClone(race, k); break; }
        const first = ti < 0; if (first) k.touch.push(c.idx);
        const fc = k.weight / (c.weight + k.weight), fk = 1 - fc;
        let hard = 0;
        if (oy < ox) {                                  // side by side: pushed apart across the road
          const sg = dl === 0 ? 1 : Math.sign(dl), sep = oy + 0.5;
          c.x += p.nx * sg * sep * fc; c.y += p.ny * sg * sep * fc; k.lat -= sg * sep * fk;
          const rel = (k.vLat - c.vLat) * sg;
          if (first && rel > 0) { const j = Math.min(rel, 90) * 1.3; c.skx += p.nx * sg * j * fc; c.sky += p.ny * sg * j * fc; hard = rel; }
        } else {                                        // nose to tail
          const sep = ox + 0.5, back = d < 0 ? c : k, front = back === c ? k : c, fBack = back === c ? fc : fk;
          if (back === c) { c.x -= p.tx * sep * fc; c.y -= p.ty * sep * fc; k.s = wrapS(T, k.s + sep * fk); } else { c.x += p.tx * sep * fc; c.y += p.ty * sep * fc; k.s = wrapS(T, k.s - sep * fk); }
          const rel = back.speed - front.speed;
          if (first && rel > 0) { const j = Math.min(rel, 120) * 1.3; back.speed -= j * fBack; front.speed += j * (1 - fBack); hard = rel; }
        }
        if (hard > 8 && c.bumpCd <= 0) {
          c.bumpCd = 0.25; c.squash = Math.min(1, hard / 90);
          const x = (c.x + k.x) / 2, y = (c.y + k.y) / 2;
          race.fxStars(x, y, 4, '#cfe3ff', 110, 0.4); race.fxSparks(x, y, 6, '#9fc8ff', 130); race.sound('bump', c.human ? c : { x, y }, clamp(hard / 60, 0.4, 1));
        }
      }
      if (k.life <= 0) continue;
      // in the way of a Mega Duck or a Garbage Collector bot: popped
      if (race.megas.some(m => Math.hypot(k.x - m.x, k.y - m.y) < m.r + k.W * 0.55) || race.gcs.some(g => hitsCar(k, g.x, g.y, 17))) { popClone(race, k); continue; }
      // an item box: it's yours, if you've a hand free
      if (race.started && !o.finished && o.lap >= 1 && !o.item2) {
        let hit = null, hd = 1e9;
        for (const b of race.boxes) { if (b.t > 0 || b.gold) continue; const dd = Math.hypot(k.x - b.x, k.y - b.y); if (dd < 32 && dd < hd) { hit = b; hd = dd; } }
        if (hit) { hit.t = 0.6; race.giveItem(o, sorted, leader); race.fxPickup(o, hit); race.fxSparks(k.x, k.y, 6, '#cfe3ff', 120); }   // (not a jackpot's golden box: that one you tuck in for yourself)
      }
    }
    race.clones = race.clones.filter(k => k.life > 0);
  },
  // a translucent ghost-blue copy of the owner's car and mascot, and a faint thread from it to the owner. Drawn into a
  // small offscreen canvas first so it can be tinted as one piece.
  drawWorld(ctx, race, which = null) {
    for (const k of race.clones) {
      if (which && !which(k)) continue;
      const o = k.owner, fade = clamp(k.age / 0.3, 0, 1) * clamp(k.life / 0.5, 0, 1), flick = k.life < 1.5 && Math.floor(k.life * 10) % 2 ? 0.55 : 1;
      // the thread: a sagging line from your kart to the clone, shimmering
      ctx.save(); ctx.globalAlpha = 0.5 * fade; ctx.strokeStyle = '#a9cbff'; ctx.lineWidth = 1.6; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -race.time * 40;
      const mx = (o.x + k.x) / 2, my = (o.y + k.y) / 2 + 10 + Math.sin(race.time * 3) * 3;
      ctx.beginPath(); ctx.moveTo(o.x, o.y - 14); ctx.quadraticCurveTo(mx, my, k.x, k.y - 14); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
      const m = ctx.getTransform(), z = Math.min(4, Math.hypot(m.a, m.b)), R = 90, px = Math.ceil(R * 2 * z);
      const cv = ghostCanvas(px), g = cv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, px, px); g.setTransform(z, 0, 0, z, R * z, R * z);
      const B = BODIES[o.ch.body] || BODIES.kart;
      g.save(); g.rotate(k.heading); drawCar(g, o.ch, {}); g.restore();
      g.save(); g.translate(Math.cos(k.heading) * B.seat, Math.sin(k.heading) * B.seat - (RIDE_UP[o.ch.body] || 0) + Math.sin(race.time * 9 + k.age) * 0.7);
      drawMascot(g, o.ch, { t: race.time + 1.7, scale: 0.92, look: [Math.cos(k.heading), Math.sin(k.heading)], face: Math.cos(k.heading) < 0 ? -1 : 1, shadow: false }); g.restore();
      g.globalCompositeOperation = 'source-atop'; g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = 'rgba(140,190,255,0.62)'; g.fillRect(0, 0, px, px); g.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(k.x, k.y);
      ctx.globalAlpha = 0.35 * fade; drawCarShadow(ctx, o.ch, k.heading);
      const BD = bold();   // a flat look (js/look.js): no glow, a faint dashed outline round the clone instead
      if (BD) { ctx.globalAlpha = 0.6 * fade * flick; ctx.strokeStyle = '#8fb6ff'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.ellipse(0, 0, k.L * 0.62, k.W * 0.8, k.heading, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      else { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.18 * fade * flick; ctx.fillStyle = '#4f86f7';
      ctx.beginPath(); ctx.ellipse(0, 0, k.L * 0.58, k.W * 0.75, k.heading, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
      ctx.globalAlpha = 0.72 * fade * flick; ctx.drawImage(cv, 0, 0, px, px, -R, -R, R * 2, R * 2);
      if (!BD) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.22 * fade * flick; ctx.drawImage(cv, 0, 0, px, px, -R, -R, R * 2, R * 2); ctx.globalCompositeOperation = 'source-over'; }   // a ghostly glow
      ctx.restore();
      if (fade > 0.5 && Math.floor(race.time * 30 + k.age * 7) % 9 === 0) race.particles.push({ kind: 'star', x: k.x + frnd(-k.L / 2, k.L / 2), y: k.y + frnd(-k.W / 2, k.W / 2), vx: 0, vy: -20, col: '#cfe3ff', size: 4, rot: 0, spin: 3, life: 0.5, maxLife: 0.5, top: true });
    }
  },
};
// one offscreen canvas, reused (a clone or two at a time, drawn one after the other)
let ghostCv = null;
function ghostCanvas(px) {
  if (!ghostCv) ghostCv = document.createElement('canvas');
  if (ghostCv.width < px) ghostCv.width = ghostCv.height = px;
  return ghostCv;
}
