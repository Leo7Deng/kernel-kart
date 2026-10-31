// Kernel Kart: time trial drawing: the ghost kart and the HUD (clock, record, splits, laps). Only when race.tt is set.
import { FONT, RIDE_UP, alpha, drawCar, drawMascot } from './art.js';
import { BODIES, CHARACTERS, clamp } from './core.js';
import { fmtDelta, fmtLap } from './timetrial.js';
import { RIVAL } from './ghost-share.js';
import { BK, BOLD_DISPLAY, BOLD_FONT, BOLD_W, bold, lookGen } from './look.js';

const GHOST = '#9fe6ff';
// HUD colours and fonts per look (js/look.js); DW: the display font's style and weight
const CLASSIC = { GOLD: '#ffc93c', GOLDF: '#ffc93c', SOFT: '#9aa3bd', DISPLAY: `"Bungee", ${FONT}`, DW: '', FNT: FONT, GOOD: '#45d98e', BAD: '#ff6a50', TXT: '#ffffff', DOWN: '#ffd9d2', CHIP: 'rgba(255,255,255,0.1)', CHIPT: '#dfe4f2', OFF: 'rgba(255,255,255,0.09)', LIVE: '#c9cfdf', MARK: 'rgba(255,201,60,0.16)', HEAD: '#ffb02e' };
// a flat look's palette and fonts, rebuilt when the look changes (lookGen)
let flatP = null, flatGen = -1;
const flatPal = () => {
  if (flatGen !== lookGen()) { flatGen = lookGen(); flatP = { GOLD: BK.yellow, GOLDF: BK.yellow, SOFT: BK.muted, DISPLAY: BOLD_DISPLAY, DW: BOLD_W, FNT: BOLD_FONT, GOOD: BK.green, BAD: BK.red, TXT: BK.text, DOWN: '#f0a29c', CHIP: BK.surface2, CHIPT: BK.text, OFF: 'rgba(255,255,255,0.08)', LIVE: BK.dim, MARK: alpha(BK.yellow, 0.16), HEAD: BK.muted }; }
  return flatP;
};
const pal = () => bold() ? flatPal() : CLASSIC;
// flat fonts have proportional digits, so a ticking time is drawn a character at a time in 0-wide cells (no jitter)
function tabText(ctx, txt, x, y) {
  if (!bold()) return ctx.fillText(txt, x, y);
  const a = ctx.textAlign, dw = ctx.measureText('0').width, cw = ch => ch >= '0' && ch <= '9' ? dw : ctx.measureText(ch).width;
  const W = [...txt].reduce((s, ch) => s + cw(ch), 0);
  let px = a === 'right' || a === 'end' ? x - W : a === 'center' ? x - W / 2 : x;
  ctx.textAlign = 'center';
  for (const ch of txt) { const w = cw(ch); ctx.fillText(ch, px + w / 2, y); px += w; }
  ctx.textAlign = a;
}
const SPLIT_T = 3, FLASH_T = 3;   // how long a split, and a lap's time, stay up
let off = null;
// the ghost: your best lap's kart and mascot drawn into its own canvas, washed pale blue, laid see-through over the road
// (fainter when you're on top of it); up: bridge-deck layer or under. A friend's ghost (tt.rival) the same in RIVAL pink.
export function drawGhost(ctx, race, up) {
  const tt = race.tt; if (!tt) return;
  paintGhost(ctx, race, tt.ghostPose(), up, 'rgba(150,225,255,0.55)', 0.32, null);
  if (tt.rival) paintGhost(ctx, race, tt.ghostPose(tt.rival), up, 'rgba(255,122,217,0.62)', 0.46, tt.rival.name);
}
function paintGhost(ctx, race, g, up, wash, a0, name) {
  if (!g || g.up !== up) return;
  const ch = CHARACTERS.find(c => c.id === g.ch) || race.cars[0].ch, B = BODIES[ch.body] || BODIES.kart;
  const m = ctx.getTransform(), k0 = Math.hypot(m.a, m.b), k = Math.min(4, k0), S = 240, px = Math.ceil(S * k);
  if (!off) off = document.createElement('canvas');
  if (off.width !== px) { off.width = px; off.height = px; }
  const o = off.getContext('2d');
  o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, px, px);
  o.setTransform(k, 0, 0, k, px / 2, px / 2 + 30 * k);   // kart's middle a bit low: its rider sticks up
  const h = g.lift, big = 1 + 0.32 * h, cx = Math.cos(g.h), cy = Math.sin(g.h);
  o.save(); o.translate(0, -h * 48); o.scale(big, big); o.rotate(g.h); drawCar(o, ch, { steer: g.steer, brake: g.brake }); o.restore();
  o.save(); o.translate(cx * B.seat, cy * B.seat - h * 48 - (RIDE_UP[ch.body] || 0)); o.scale(big, big);
  drawMascot(o, ch, { t: race.time, scale: 0.92, look: [cx, cy], face: cx < 0 ? -1 : 1, shadow: false }); o.restore();
  o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = 'source-atop'; o.fillStyle = wash; o.fillRect(0, 0, px, px); o.globalCompositeOperation = 'source-over';
  const c = race.cars[0], d = Math.hypot(c.x - g.x, c.y - g.y), near = clamp((d - 30) / 100, 0, 1);
  ctx.save(); ctx.globalAlpha = a0 + 0.3 * near;
  ctx.drawImage(off, 0, 0, px, px, g.x - S / 2, g.y - 30 - S / 2, S, S);
  ctx.restore();
  if (!name) return;
  // name tag: a pink pill under the kart (yours is over yours), constant size on screen
  const P = pal(), u = (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) / (k0 || 1), th = 18 * u, ty = g.y - h * 48 + 34 + th / 2 + 5 * u;
  ctx.save(); ctx.globalAlpha = 0.6 + 0.35 * near; ctx.font = `700 ${12 * u}px ${P.FNT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(name).width + 14 * u;
  ctx.fillStyle = RIVAL; ctx.beginPath(); ctx.roundRect(g.x - tw / 2, ty - th / 2, tw, th, th / 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(g.x - 5 * u, ty - th / 2 + 0.5); ctx.lineTo(g.x + 5 * u, ty - th / 2 + 0.5); ctx.lineTo(g.x, ty - th / 2 - 5 * u); ctx.fill();
  ctx.fillStyle = '#2a0822'; ctx.fillText(name, g.x, ty + 0.5 * u);
  ctx.restore();
}
// the ghost on the minimap: a pale ring
export function drawGhostDot(ctx, race, map) {
  const tt = race.tt; if (!tt) return;
  const dot = (g, col, fill) => { if (!g) return; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(map(g.x, 'x'), map(g.y, 'y'), 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); };
  dot(tt.ghostPose(), GHOST, 'rgba(159,230,255,0.25)');
  if (tt.rival) dot(tt.ghostPose(tt.rival), RIVAL, 'rgba(255,122,217,0.3)');
}

// the player's card: the clock (a finished lap holds a moment, gold + NEW BEST on a best), lap, speed bar, last lap
export function drawTTCard(ctx, race, c, b) {
  const P = pal();
  const tt = race.tt, { x, y, w, h, tx, rr } = b, now = race.time, compact = w < 260;
  const fl = tt.flash && now - tt.flash.at < FLASH_T ? tt.flash : null, best = fl && fl.newBest;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = `600 12px ${P.FNT}`; ctx.fillStyle = P.SOFT; ctx.fillText(`TIME TRIAL · ${c.ch.name}`, tx, y + 22);
  const T = race.track, ln = Math.max(1, Math.min(c.lap, race.laps)), lt = `${T.open ? 'STAGE' : 'LAP'} ${ln}${tt.plan.endless ? '' : '/' + race.laps}`;   // hot laps: no end
  ctx.font = `700 11px ${P.FNT}`; const lw = ctx.measureText(lt).width + 14, lx = x + w - 12 - lw;
  ctx.fillStyle = P.CHIP; rr(lx, y + 8, lw, 19, 9.5); ctx.fillStyle = P.CHIPT; ctx.fillText(lt, lx + 7, y + 21.5);
  const segN = 14, segW = (x + w - 12 - tx) / segN, lit = clamp(c.speed / (c.top * 1.3), 0, 1) * segN;
  for (let k = 0; k < segN; k++) { const on = k < lit; ctx.fillStyle = !on ? P.OFF : c.off ? '#d2b07a' : k < 8 ? P.GOOD : k < 12 ? '#ffd23f' : '#ff5a3c'; rr(tx + k * segW, y + 33, segW - 2, 7, 2); }
  // the clock
  const t = fl ? fl.t : tt.now, size = compact ? 24 : 30;
  ctx.save(); ctx.translate(tx, y + h - 13);
  if (best) { const p = 1 + 0.12 * Math.exp(-(now - fl.at) * 5) * Math.cos((now - fl.at) * 18); ctx.scale(p, p); }
  ctx.font = `${P.DW}${size}px ${P.DISPLAY}`; ctx.fillStyle = best ? P.GOLD : fl ? (fl.d > 0 ? P.DOWN : P.TXT) : tt.unitStart === null ? P.SOFT : P.TXT;
  tabText(ctx, fmtLap(Math.max(t, 1e-3)), 0, 0); ctx.restore();
  // NEW BEST while a best lap's time is up; else last lap (gold if a best) or the current one
  const rx = x + w - 12; ctx.textAlign = 'right';
  if (best) {
    ctx.font = `${P.DW}13px ${P.DISPLAY}`; const pw = ctx.measureText('NEW BEST').width + 18, pulse = 0.75 + 0.25 * Math.sin(now * 10);
    ctx.globalAlpha = pulse; ctx.fillStyle = P.GOLDF; rr(rx - pw, y + h - 34, pw, 24, 12); ctx.globalAlpha = 1;
    ctx.fillStyle = '#3a2a00'; ctx.fillText('NEW BEST', rx - 9, y + h - 16.5);
  } else if (tt.laps.length && !compact) {
    const last = tt.laps[tt.laps.length - 1];
    ctx.font = `700 10px ${P.FNT}`; ctx.fillStyle = P.SOFT; ctx.fillText(`LAST ${tt.plan.unit === 'run' ? 'RUN' : 'LAP'}`, rx, y + h - 33);
    ctx.font = `${P.DW}15px ${P.DISPLAY}`; ctx.fillStyle = last.newBest ? P.GOLD : P.TXT; tabText(ctx, fmtLap(last.t), rx, y + h - 14);
  }
  ctx.textAlign = 'left';
}

// the target over the road: your best in gold and the live gap to your ghost (timetrial.js liveGap, held 0.1 s so it
// reads; green up, red down); with no best yet, what sets one. Then quarter splits and the lap against the best.
const shownGap = new WeakMap();
export function drawTTSplit(ctx, race, b) {
  const P = pal(), tt = race.tt, { W, y: y0, glass } = b, now = race.time;
  const word = tt.plan.unit === 'run' ? 'RUN' : 'LAP', rec = tt.record;
  // the live gap, held 0.1 s; none before the attempt starts or after it ends
  let g = shownGap.get(tt); if (!g || now - g.at >= 0.1 || now < g.at) { g = { at: now, d: tt.live && !tt.done && tt.unitStart !== null && now - tt.live.at < 0.6 ? tt.live.d : null }; shownGap.set(tt, g); }
  const lbl = `700 10px ${P.FNT}`, big = `${P.DW}24px ${P.DISPLAY}`, rv = tt.rival, rvName = rv ? rv.name.toUpperCase() : '';
  ctx.font = big; const bw = ctx.measureText(rec ? fmtLap(rec.t) : '—:——').width, gw = ctx.measureText('+00.00').width, rw = rv ? ctx.measureText(fmtLap(rv.t)).width : 0;
  ctx.font = lbl; const lw = Math.max(ctx.measureText(`BEST ${word}`).width, rec ? 0 : ctx.measureText(`finish a ${word.toLowerCase()} to set one`).width);
  const rlw = rv ? ctx.measureText(rvName).width : 0, glbl = rv ? `VS ${rvName}` : 'VS BEST', glw = ctx.measureText(glbl).width;
  // a friend's ghost: its time in its colour and the gap to it
  const hasGap = !!(rv || (rec && tt.ghost)), rcol = rv ? 22 + Math.max(rw, rlw) : 0, w = 28 + Math.max(bw, lw) + rcol + (hasGap ? 22 + Math.max(gw, glw, 60) : 0), hgt = 56;
  // centred over the road clear of the card; under it if no room
  let x = W / 2 - w / 2, y = b.cardY;
  if (x < b.cardR + 12) { x = b.cardX; y = b.cardY + b.cardH + 8; }
  glass(x, y, w, hgt, 18, 0.86);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.font = lbl; ctx.fillStyle = P.SOFT; ctx.fillText(`BEST ${word}`, x + 14, y + 19);
  if (rec) { ctx.font = big; ctx.fillStyle = P.GOLD; tabText(ctx, fmtLap(rec.t), x + 14, y + 45); }
  else { ctx.font = `${P.DW}15px ${P.DISPLAY}`; ctx.fillStyle = P.SOFT; ctx.fillText('—', x + 14, y + 41); ctx.font = lbl; ctx.fillText(`finish a ${word.toLowerCase()} to set one`, x + 34, y + 39); }
  if (rv) {
    const rx = x + 14 + Math.max(bw, lw) + 12;
    ctx.fillStyle = P.CHIP; ctx.fillRect(rx - 1, y + 10, 1.5, hgt - 20);
    ctx.font = lbl; ctx.fillStyle = RIVAL; ctx.fillText(rvName, rx + 10, y + 19);
    ctx.font = big; tabText(ctx, fmtLap(rv.t), rx + 10, y + 45);
  }
  if (hasGap) {
    const gx = x + 14 + Math.max(bw, lw) + rcol + 12;
    ctx.fillStyle = P.CHIP; ctx.fillRect(gx - 1, y + 10, 1.5, hgt - 20);
    ctx.font = lbl; ctx.fillStyle = rv ? RIVAL : P.SOFT; ctx.fillText(glbl, gx + 10, y + 19);
    const d = g.d, col = d === null ? P.SOFT : d < -0.005 ? P.GOOD : d > 0.005 ? P.BAD : P.TXT;
    ctx.font = big; ctx.fillStyle = col; tabText(ctx, d === null ? '—' : fmtDelta(d), gx + 10, y + 45);
  }
  // the split, just under the target
  const sp = tt.split; if (!sp) return;
  const age = now - sp.at; if (age < 0 || age > SPLIT_T) return;
  const line = sp.k >= tt.nCp, label = line ? word : `SPLIT ${sp.k + 1}`;
  const txt = fmtDelta(sp.d), col = sp.d < 0 ? P.GOOD : sp.d > 0 ? P.BAD : P.TXT;
  ctx.save(); ctx.globalAlpha = clamp((SPLIT_T - age) / 0.4, 0, 1); ctx.translate(x + w / 2, y + hgt + 30); const p = 1 + 0.18 * Math.exp(-age * 9); ctx.scale(p, p);
  ctx.font = `${P.DW}22px ${P.DISPLAY}`; const tw = ctx.measureText(txt).width; ctx.font = `700 11px ${P.FNT}`; const lw2 = ctx.measureText(label).width;
  const sw = tw + lw2 + 44; glass(-sw / 2, -21, sw, 42, 21, 0.86);
  ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(-sw / 2 + 6, -15, 4, 30, 2); ctx.fill();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = P.SOFT; ctx.fillText(label, -sw / 2 + 18, 1);
  ctx.font = `${P.DW}22px ${P.DISPLAY}`; ctx.fillStyle = col; ctx.fillText(txt, -sw / 2 + 26 + lw2, 2);
  ctx.restore(); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
}

// standings: this session's laps (best in gold), the current one, and the record
export function drawTTLaps(ctx, race, b) {
  const P = pal();
  const tt = race.tt, { W, pad, top, glass, rr } = b, sw = 184, sx = W - pad - sw, rowH = 26, word = tt.plan.unit === 'run' ? 'RUN' : 'LAP';
  const laps = tt.laps.slice(-6), live = !tt.done && tt.unitStart !== null, n = laps.length + (live ? 1 : 0);
  const hgt = 34 + rowH * Math.max(1, n) + 30;
  glass(sx, top, sw, hgt, 16, 0.72);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = `${P.DW}12px ${P.DISPLAY}`; ctx.fillStyle = P.HEAD; ctx.fillText(word === 'RUN' ? 'THIS RUN' : 'LAPS', sx + 14, top + 18);
  const first = tt.laps.length - laps.length;
  const row = (i, label, t, col, mark) => {
    const y = top + 34 + rowH * i + rowH / 2;
    if (mark) { ctx.fillStyle = P.MARK; rr(sx + 4, y - rowH / 2 + 2, sw - 8, rowH - 4, 9); }
    ctx.textAlign = 'left'; ctx.font = `${P.DW}13px ${P.DISPLAY}`; ctx.fillStyle = P.SOFT; ctx.fillText(label, sx + 14, y + 1);
    ctx.textAlign = 'right'; ctx.font = `700 14px ${P.FNT}`; ctx.fillStyle = col; tabText(ctx, t, sx + sw - 14, y + 1);
  };
  const bi = tt.bestIdx - first;
  laps.forEach((l, i) => row(i, String(first + i + 1), fmtLap(l.t), i === bi ? P.GOLD : P.TXT, i === bi));
  if (live) row(laps.length, String(tt.laps.length + 1), fmtLap(Math.max(tt.now, 1e-3)), P.LIVE, false);
  else if (!laps.length) row(0, '–', tt.done ? 'no time' : 'on the grid', P.SOFT, false);
  const fy = top + hgt - 16; ctx.strokeStyle = P.CHIP; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx + 12, fy - 14); ctx.lineTo(sx + sw - 12, fy - 14); ctx.stroke();
  ctx.textAlign = 'left'; ctx.font = `700 10px ${P.FNT}`; ctx.fillStyle = P.SOFT; ctx.fillText(`BEST ${word}`, sx + 14, fy + 1);
  ctx.textAlign = 'right'; ctx.font = `700 14px ${P.FNT}`; ctx.fillStyle = tt.record ? P.GOLD : P.SOFT; ctx.fillText(tt.record ? fmtLap(tt.record.t) : '—', sx + sw - 14, fy + 1);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
}
