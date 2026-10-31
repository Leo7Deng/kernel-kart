// Kernel Kart: Fight's kit drawing hooks for draw-fight.js: calls each fighter's art plug-in (js/art/kit-<id>.js via
// js/art/kits.js; Duke's in draw-moves.js) at each layer. Cosmetic only. Effects: good looking, not over the top, never
// just circles or rings of colour. Layers: kitEvent, kitGround (art.ground/floor), kitThings (y-sorted: art.things,
// art.stand), kitBehind/kitOver (art.behind may return 'hide'), kitSink, kitTint, kitFx (art.fx + mote, spark2), kitIcon.
import { moveBehind, moveEvent, moveFx, moveGround, moveIcon, moveOver, moveThings } from './draw-moves.js';   // Duke's moves and evade
import { ART, ARTS, artsIn } from './art/kits.js';
import { shadows3, step3, things3 } from './art/prop3d.js';
import { statusEvent, statusOver, statusTint } from './art/status.js';
import { TAU } from './core.js';

// ---------------------------------------------------------------- events
export function kitEvent(v, F, e, few) {
  const who = e.who ?? -1;
  { const A = F.f[who] && ART[F.f[who].id]; if (A && A.event && A.event(v, F, e, few)) return true; }
  if (moveEvent(v, F, e, few)) return true;
  if (statusEvent(v, F, e, few)) return true;
  if (e.kind === 'iso') { const D = F.f[e.to]; if (D) v.iso[D.i] = v.t; return true; }   // (Docky's Isolation: kitTint's cool band)
  return false;
}

// ---------------------------------------------------------------- on the ground
export function kitGround(g, F, v) {
  moveGround(g, F, v);
  for (const o of F.objs || []) { const A = F.f[o.owner] && ART[F.f[o.owner].id]; if (A && A.ground) A.ground(g, F, v, o); }
  for (const A of artsIn(F)) if (A.floor) A.floor(g, F, v);
  shadows3(g, v);
}

// ---------------------------------------------------------------- among the fighters
export function kitThings(F, v, g) {
  const out = [];
  out.push(...moveThings(F, v, g));
  things3(v, g, out);
  for (const o of F.objs || []) { const A = F.f[o.owner] && ART[F.f[o.owner].id]; if (A && A.things) A.things(F, v, g, o, out); }
  for (const A of artsIn(F)) if (A.stand) A.stand(F, v, g, out);   // Cpp's gush in pieces
  return out;
}

// ---------------------------------------------------------------- round a fighter
// before the model (at the fighter's feet, not lifted): 'hide' hides the model (Gopher underground, Docky under water)
export function kitBehind(g, F, v, f) {
  const mh = moveBehind(g, F, v, f);
  if (mh) { const A = ART[f.id]; if (f.gone && A && A.behind) A.behind(g, F, v, f); return mh; }   // gone: Docky's pool still draws while he's under
  for (const A of artsIn(F)) { const r = A.behind && A.behind(g, F, v, f); if (r === 'hide') return 'hide'; }
  return null;
}
// after the model
export function kitOver(g, F, v, f) {
  moveOver(g, F, v, f);
  for (const A of artsIn(F)) if (A.over) A.over(g, F, v, f);
  statusOver(g, F, v, f);
}
// sunk into the floor (art.sink: Gopher's Deadlock hole): { d (drawn lower, cut at the floor line), wx (wriggle) } or null
export function kitSink(F, v, f) {
  for (const A of artsIn(F)) { const s = A.sink && A.sink(F, v, f); if (s && s.d > 0) return s; }
  return null;
}
// tints on the model (tinted() in draw-fight.js); Docky's Isolation soaking a hit runs a cool blue band over him
export function kitTint(F, v, f) {
  for (const A of artsIn(F)) { const c = A.tint && A.tint(F, v, f); if (c) return c; }
  { const c = statusTint(F, v, f); if (c) return c; }   // poisoned
  const ia = v.t - (v.iso[f.i] ?? -9); if (ia >= 0 && ia < 0.5) return `rgba(110,190,255,${(0.42 * (1 - ia / 0.5)).toFixed(3)})`;
  return null;
}

// ---------------------------------------------------------------- the particle kinds
export function kitFx(g, F, v, p, k, dt) {
  if (p.k === 'p3') { step3(p, dt); return true; }
  if (moveFx(g, F, v, p, k, dt)) return true;
  for (const A of ARTS) if (A.fx && A.fx(g, F, v, p, k, dt)) return true;
  switch (p.k) {
    case 'mote': {   // rising mote of light (healing, Bugdroid)
      g.fillStyle = `rgba(${p.col || '220,255,225'},${(Math.sin(k * Math.PI) * 0.85).toFixed(3)})`; g.beginPath(); g.arc(p.x, p.y, p.s * (1 - k * 0.4), 0, TAU); g.fill(); return true;
    }
    case 'spark2': {   // short green-white streak
      const sp = Math.hypot(p.vx, p.vy) || 1, L = p.s * (1 - k * 0.5);
      g.strokeStyle = `rgba(200,255,220,${(1 - k).toFixed(3)})`; g.lineWidth = 1.6 * (1 - k) + 0.4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(p.x - p.vx / sp * L, p.y - p.vy / sp * L); g.lineTo(p.x, p.y); g.stroke(); return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- icons (the keys' corner icons, the feed)
export function kitIcon(g, kind, r, col) {
  if (moveIcon(g, kind, r, col)) return true;
  for (const A of ARTS) if (A.icon && A.icon(g, kind, r, col)) return true;
  return false;
}
