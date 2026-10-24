// Bubble: traps the leader.
import { TAU, clamp, fchance, frnd, lerp } from '../core.js';
import { drawItemIcon } from '../art.js';
import { halfWAt, projectToTrack, trackSample } from '../geometry.js';
import { Projectile } from '../race.js';
import { blockedByShield, phased } from '../rules.js';
import { glowSprite, stamp } from '../fx-sprites.js';
import { bold } from '../look.js';
import { clonesOf, popClone } from './thread.js';

export default {
  id: 'bubble', name: 'Bubble', col: '#c77dff',
  short: 'traps the leader',
  desc: 'Chases down the race leader (whoever leads among those still racing) and traps them in a bubble for ~2 s.',
  odds: { front: [8, 8], back: [8, 10], last: [8, 10] }, pack: 0.7,   // 2 s off the leader from anywhere (with 3-4 players 0.7 of that, the user's call 2026-10-22: it was 1.25, a quarter more)
  // fired: what happens. Return true to keep holding it (more charges left).
  use(race, c, sorted) {
    const t = sorted.find(o => o !== c && !o.finished) || null;
    race.projectiles.push(new Projectile('bubble', c, t, c.s + 30, c.lat));
  },
  // a bot holding it: fire now?
  wantUse(race, c) {
    return c.itemT > 0.6;
  },
  // in flight: chases the target along the road (hopping onto its route if it's on another one) and traps it
  updateProjectile(race, pr, dt) {
    // its target crossed the line before it got there: it goes for whoever leads the race now (not its own thrower)
    if (pr.target && !pr.target.clone && pr.target.finished) pr.target = race.cars.filter(o => o !== pr.owner && !o.finished).sort((a, b) => a.rank - b.rank)[0] || null;
    if (pr.target && !pr.target.finished && pr.target.T !== pr.T) {   // target's on another route: hop onto it
      const tg = pr.target, q = projectToTrack(tg.T, pr.x || pr.owner.x, pr.y || pr.owner.y, tg.s, 400), L = tg.T.L;
      pr.T = tg.T; pr.s = q.s; pr.lat = clamp(q.lat, -halfWAt(tg.T, q.s), halfWAt(tg.T, q.s));
      let d = tg.s - pr.s; d = ((d % L) + L * 1.5) % L - L / 2; if (d < 0) pr.s = (tg.s - 40 + L) % L;
    }
    // a decoy: closing in on a kart that has a Thread clone beside it, it goes for whichever is nearer up the road (a
    // clone that's popped hands it back to its owner)
    if (pr.target && pr.target.clone && pr.target.life <= 0) pr.target = pr.target.owner;
    if (pr.target && !pr.target.clone && race.clones.length) {
      const fwd = o => { let d = o.s - pr.s; if (d < 0) d += pr.T.open ? 1e9 : pr.T.L; return o.T === pr.T ? d : 1e9; }, dT = fwd(pr.target);
      if (dT < 400) for (const k of clonesOf(race, pr.target)) if (fwd(k) < dT) { pr.target = k; break; }
    }
    const T = pr.T, spd = 950, tgt = pr.target;
    if (tgt && !tgt.finished) {
      let ds = tgt.s - pr.s; if (ds < 0) ds += T.open ? 1e9 : T.L; // always chase forward
      if (phased(tgt) && ds < 30) { pr.target = null; pr.life = Math.min(pr.life, 1.2); }   // caught a ghost: it sails on through and pops
      pr.s += Math.min(spd * dt, ds + 0.1); pr.lat = lerp(pr.lat, tgt.lat, 1 - Math.exp(-4 * dt));
    } else { pr.s += spd * dt; }
    if (pr.s >= T.L) { if (T.open) pr.life = 0; else pr.s -= T.L; }
    const p = trackSample(T, pr.s); pr.x = p.x + p.nx * pr.lat; pr.y = p.y + p.ny * pr.lat;
    if (tgt && tgt.clone && Math.hypot(tgt.x - pr.x, tgt.y - pr.y) < 22) { pr.life = 0; popClone(race, tgt); return; }   // it took the clone
    for (const c of race.cars) {
      if (c !== pr.target || c.finished || pr.life <= 0 || phased(c)) continue;   // only its target: it passes the cars in between, so it can't trap one in front of you
      if (Math.hypot(c.x - pr.x, c.y - pr.y) < 22) {
        pr.life = 0;
        if (blockedByShield(race, c)) break;
        c.bubbled = 1.65; race.fxHit(c, '#c77dff', 'bubble'); race.feed('hit', 'bubble', pr.owner, c);
        break;
      }
    }
  },
  drawProjectile(ctx, race, p) {
    if (fchance(0.5)) race.particles.push({ x: p.x + frnd(-6, 6), y: p.y + frnd(-6, 6), vx: frnd(-15, 15), vy: frnd(-15, 15), life: 0.45, maxLife: 0.45, col: '#e3c2ff', size: 5 });   // a trail of fizz
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = '#00000022'; ctx.beginPath(); ctx.ellipse(4, 8, 16, 9, 0, 0, TAU); ctx.fill();
    ctx.translate(0, Math.sin(race.time * 10) * 3 - 4);
    if (!bold()) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55; stamp(ctx, glowSprite(this.col, 0.2), 0, 0, 34); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }   // a soft violet glow round it (not in the flat looks)
    drawItemIcon(ctx, 'bubble', 20);
    ctx.restore();
  },
};
