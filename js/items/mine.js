// Mines: dropped by Segfault (one) and Fork Bomb (three). Whoever drives over one spins out.
import { Math } from '../detmath.js';
import { drawItemIcon } from '../art.js';
import { TAU } from '../core.js';
import { onBridge } from '../geometry.js';
import { hitsCar } from '../race.js';
import { blockedByShield, phased } from '../rules.js';
import { glowSprite, stamp } from '../fx-sprites.js';
import { BK, bold } from '../look.js';
import { hitClone } from './thread.js';
export const MINE_R = 11;

// arm: seconds before it can hit the car that dropped it
export function updateMines(race, dt) {
  for (const m of race.mines) {
    m.life -= dt; m.arm -= dt;
    for (const c of race.cars) {
      if (c.finished || (m.arm > 0 && c === m.owner) || c.hitCd > 0 || c.spinT > 0 || phased(c)) continue;
      if (hitsCar(c, m.x, m.y, MINE_R)) {
        m.life = 0;
        if (!blockedByShield(race, c)) { c.spinT = 0.7; c.speed *= 0.4; c.hitCd = 1.5; race.fxHit(c, '#ff4d6d'); race.feed('hit', m.item || 'tomato', m.owner, c); }
      }
    }
    if (m.life > 0 && race.clones.length && hitClone(race, m.x, m.y, MINE_R, m.arm > 0 ? m.owner : null)) { m.life = 0; race.fxBoom(m.x, m.y, 0.7); }   // a Thread clone sets it off
  }
  race.mines = race.mines.filter(m => m.life > 0);
}
// the Segfault bomb, see-through until armed, with a flaring fuse; up: on a bridge deck (true) or the ground (false)
export function drawMines(ctx, race, up) {
  for (const m of race.mines) {
    if (onBridge(m.T || race.track, m.s) !== up) continue;
    ctx.save(); ctx.translate(m.x, m.y); ctx.globalAlpha = m.arm > 0 ? 0.55 : 1;
    ctx.fillStyle = '#00000028'; ctx.beginPath(); ctx.ellipse(3, 5, MINE_R + 3, MINE_R, 0, 0, TAU); ctx.fill();
    drawItemIcon(ctx, 'tomato', MINE_R + 4);
    if (m.arm <= 0) {   // armed: the fuse spark flares and fades on a beat (a soft glow, not a flat disc)
      const k = Math.max(0, Math.sin(race.time * 10 + m.x));
      if (bold()) { const r = 3 + 3 * k; ctx.fillStyle = k > 0.5 ? BK.yellow : BK.red; ctx.beginPath(); ctx.arc(MINE_R * 0.55, -MINE_R * 1.3, r, 0, Math.PI * 2); ctx.fill(); }   // flat: a blinking round spark
      else { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + 0.75 * k;
      stamp(ctx, glowSprite('#ffb02e', 0.9), MINE_R * 0.55, -MINE_R * 1.3, 7 + 5 * k); ctx.globalCompositeOperation = 'source-over'; }
    }
    ctx.restore();
  }
}
