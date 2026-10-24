// Memory Leak: slick behind you.
import { TAU, clamp } from '../core.js';
import { onBridge } from '../geometry.js';
import { hitsCar } from '../race.js';
import { blockedByShield, phased } from '../rules.js';
import { make } from '../fx-sprites.js';
import { bold } from '../look.js';
import { hitClone } from './thread.js';

export const SLICK_R = 20;

// the puddle, drawn into a 72×64 sprite (centre 36, 32): a wet dark stain on the road, a dark rim, the goo lit from the
// top left, and a glint. Its wobbly outline is a smooth curve through 14 points seeded by where it lies (sx, sy).
function puddle(g, sx, sy, flat) {
  g.translate(36, 32);
  const blob = k => {
    const p = []; for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, w = 1 + 0.18 * Math.sin(a * 3 + sx) + 0.1 * Math.cos(a * 5 + sy); p.push([Math.cos(a) * 22 * k * w, Math.sin(a) * 18.5 * k * w]); }
    g.beginPath(); const mid = i => [(p[i % 14][0] + p[(i + 1) % 14][0]) / 2, (p[i % 14][1] + p[(i + 1) % 14][1]) / 2];
    g.moveTo(...mid(13)); for (let i = 0; i < 14; i++) g.quadraticCurveTo(p[i][0], p[i][1], ...mid(i)); g.closePath();
  };
  if (flat) {   // a flat look (js/look.js): one flat green with a slightly darker edge, no gloss
    blob(1); g.fillStyle = '#5f9a3a'; g.fill(); blob(0.9); g.fillStyle = '#7fb84f'; g.fill(); return;
  }
  g.save(); g.translate(1.5, 2); blob(1.16); g.fillStyle = 'rgba(10,20,4,0.35)'; g.fill(); g.restore();   // wet stain, down-right
  blob(1.06); g.fillStyle = '#2f5a12'; g.fill();
  blob(1); const gr = g.createRadialGradient(-8, -7, 2, 0, 0, 24); gr.addColorStop(0, '#d4f58a'); gr.addColorStop(0.45, '#8bd448'); gr.addColorStop(1, '#4f8c22'); g.fillStyle = gr; g.fill();
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(-8, -8, 6.5, 3, -0.5, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(-1, -11, 1.6, 0, TAU); g.fill();
}

export default {
  id: 'leak', name: 'Memory Leak', col: '#7cb342',
  short: 'slick behind you',
  desc: 'Leaves a slick behind you. Anyone who drives through loses grip and slides wide. A Firewall soaks it up.',
  odds: { lead: 16, front: [5, 0] },   // dropped behind: for cars being chased
  // fired: what happens. Return true to keep holding it (more charges left).
  use(race, c) {
    race.slicks.push(race.dropBehind(c, SLICK_R, { life: 20, arm: 1, owner: c })); race.fxDrops(c.x - Math.cos(c.heading) * 24, c.y - Math.sin(c.heading) * 24, 6, '#8bc34a', 60, 4);
  },
  // a bot holding it: fire now?
  wantUse(race, c) {
    for (const o of race.cars) { if (o === c) continue; const d = c.progress - o.progress; if (d > 0 && d < 90) return true; } return c.itemT > 4;
  },
  // slicks on the road: whoever drives through (once armed, for the owner) loses grip for a moment
  updateWorld(race, dt) {
    for (const sl of race.slicks) {
      sl.life -= dt; sl.arm -= dt;
      for (const c of race.cars) {
        if (c.finished || (sl.arm > 0 && c === sl.owner) || c.oiled > 0 || phased(c)) continue;
        if (hitsCar(c, sl.x, sl.y, SLICK_R)) {
          if (blockedByShield(race, c)) { sl.life = 0; break; }   // the Firewall soaks it up and the slick is gone (it used to pop, then you slid anyway on the next frame)
          c.oiled = 1.4; c.heading += (c.rng() - 0.5) * 0.5; race.fxWheels(c); race.fxHit(c, '#7cb342', 'leak'); race.feed('hit', 'leak', sl.owner, c);
        }
      }
      if (race.clones.length) hitClone(race, sl.x, sl.y, SLICK_R, sl.arm > 0 ? sl.owner : null);   // a Thread clone skids out and pops (the slick stays)
    }
    race.slicks = race.slicks.filter(sl => sl.life > 0);
  },
  // a glossy puddle of goo, smooth edged, with bubbles that swell and pop; up: the ones on a bridge deck (true) or on the
  // ground (false). The puddle itself is a cached sprite (its shape comes from where it lies); only the bubbles are live.
  drawWorld(ctx, race, up) {
    for (const sl of race.slicks) {
      if (onBridge(sl.T || race.track, sl.s) !== up) continue;
      ctx.save(); ctx.translate(sl.x, sl.y); ctx.globalAlpha = clamp(sl.life, 0, 1) * 0.92;
      const BD = bold(), key = `slick|${Math.round(sl.x)}|${Math.round(sl.y)}${BD ? '|c' : ''}`;
      ctx.drawImage(make(key, 72, 64, g => puddle(g, sl.x, sl.y, BD)), -36, -32, 72, 64);
      for (let k = 0; k < 3; k++) { if (BD) break; const b = (race.time * 0.7 + k / 3 + sl.x * 0.01) % 1, bx = [7, -10, 2][k], by = [5, 6, -9][k]; ctx.strokeStyle = `rgba(230,255,190,${0.8 * (1 - b)})`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(bx, by, 1.5 + b * 4, 0, TAU); ctx.stroke(); }
      ctx.restore();
    }
  },
};
