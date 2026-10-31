// Kernel Kart: drawing Fight mode (fight-ui.js runs it, js/fight.js is the sim). Everything here is cosmetic: it reads
// the fight's plain state and its events, and keeps its own camera, particles, feed and HUD easing per fight (a WeakMap,
// never on the fight). Seen like a race: top-down, x right and y down, the 3D models from 28° above.
//   the place  the sky, the floating island and its stone court with its low wall: draw-arena.js (the wall pulses
//              red in sudden death, no words)
//   fighters   the 3D models whatever Settings says (art/model3d.js drawMascot3D, the 2D mascot only with no WebGL),
//              yaw = face, the sim's pose and a mood for the face; squash and stretch, a lean back in a tell, a white
//              flash when hit, greyed while frozen; a pad's glide leans the way it goes off a puff of dust; knocked down
//              they fall flat away from the hit on a ring of dust, then hop back up translucent while untouchable
//   effects    flat impact streaks, a counter hit's big sharp star, a trade's white-hot glint and metal sparks flung
//              out across the line (clash, ember), a dust burst off the wall on a wall bounce; a shake only for KOs and
//              wall slams (Settings > Screen shake)
//   moves      every fighter's three moves and evade: its art plug-in (js/art/kit-<id>.js, through draw-kits.js's hooks;
//              Duke's: draw-moves.js), each move played as a run of poses with squash, stretch, hops, spins and fades
//              (moveAnim), its tell drawn on the floor; Stop the World greying the whole world but Duke (stopWorld), a
//              big hit punching the camera in a touch (v.punch)
//   moments    the round intro, 3-2-1 and the start, the KO's held frame, the winners' hops, confetti and the match won's
//              wash, streamers and portrait: draw-moments.js, hooked in here (momentHold round the world, momentCam,
//              momentPose, momentWash, momentUnder / momentOver in the HUD)
//   HUD        a card per player in their colour (portrait, name, health with a draining trail, round pips, the moves
//              as round chips (full colour when ready; cooling: greyed, swept, the seconds left on it; a pop and a glint
//              when back; the special bigger with a gold star; Duke's evade charges as pips), Bugdroid's battery cells),
//              a human's keys with each move's key, icon, name and seconds left (drawLegend; the cooldown pieces, cdSecs,
//              readyPop, cdNum, readyGlint..., shared with the touch buttons, fight-touch.js), the round clock (in sudden
//              death a red disc with the damage multiplier), and an icon feed
//              at the bottom (counter hits, knockdowns, KOs, the kits' big moments)
//   touch      the virtual sticks and buttons fight-ui.js lays out, drawn last
import { FACE_Y, FONT, alpha, drawMascot } from './art.js';
import * as M3 from './art/model3d.js';
import { CHARACTERS, PCOL, TAU, clamp, frnd, lerp } from './core.js';
import { ARENAS, arenaBox } from './fight-arenas.js';
import { RIM, UNDER, drawFront, drawLowClouds, drawSolid, drawTop, drawUnder, drawVoid, zstep } from './draw-arena.js';
import { LAYOUTS, PAD, actionOf, keyLabel } from './fight-keys.js';
import { BK, BOLD_DISPLAY, BOLD_FONT, BOLD_W, bold, bpanel } from './look.js';
import { SAFE } from './qol.js';
import { DPR, H, W, ctx } from './render.js';
import { settings } from './settings.js';
import { FIGHTERS } from './fight-chars.js';
import { winsToTake } from './fight.js';
import { kitBehind, kitEvent, kitFx, kitGround, kitIcon, kitOver, kitSink, kitThings, kitTint } from './draw-kits.js';
import { hitAnim, moveAnim, poseFade } from './draw-moves.js';
import { drawProp3D, orbit3, propReady } from './art/prop3d.js';
import { softShadow } from './art/arena-mat.js';
import { glow } from './art/kit3-light.js';
import { AIR, bodyFall, bodyIdle, bodyOf, fallPose, lieOf } from './draw-body.js';
import { confetti, momentAfter, momentCam, momentEvent, momentHold, momentMark, momentOver, momentPose, momentProp, momentSpot, momentTick, momentUnder, momentWash } from './draw-moments.js';

export const SCALE = 1.25;   // the models' size (a race's is 0.92)
const STRIDE = 26;           // units walked per walk cycle (two steps)
const FEED_T = 4.5, FEED_SHOW = 4;
const charOf = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
const views = new WeakMap();
const viewOf = F => {
  let v = views.get(F);
  if (!v) views.set(F, v = { cam: null, fx: [], feed: [], shake: 0, hp: F.f.map(f => f.hp), phase: F.phase, phaseT: 0, id: 0, t: 0, prevRound: F.round, pipT: [-9, -9], wd: [0, 0], wl: [null, null],
    lastHp: F.f.map(f => f.hp), hurt: F.f.map(() => ({ t: -9, k: 0 })),
    was: F.f.map(f => f.state), fall: [1, -1], stepA: [0, Math.PI], iso: [-9, -9], heal: [0, 0], ko: null, celeb: -1, streamers: null });
  // (ko, celeb, streamers: the big beats', draw-moments.js; iso: Docky's Isolation sheen, draw-kits.js; heal: healing's
  // motes; was ... stepA: the states last seen (a pad's glide, a knockdown, getting up), which way a knockdown fell, a
  // glide's direction)
  return v;
};
const DOWN = new Set(['down', 'ko']);    // (lying on the ground)
const STEPS = new Set(['step']);   // (a bounce pad's glide)
const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
export const hudScale = () => { const k = clamp(Math.min(W, H) / 540, 0.68, 1); return k; };
// a HUD card's size at this width (in HUD units, Wh = the screen's width / hudScale): normally the move chips sit beside
// the portrait under the health; when that's too narrow for them (a phone upright: they ran into the clock and the other
// card) they get a row of their own across the card, under the portrait, and the card grows (fight-touch.js pauseRect
// sits under it)
const CHIPS_W = 200;   // (the four chips, the special's bigger, with their gaps and Duke's charge pips)
export function hudCard(Wh) { const cw = Math.min(400, (Wh - 120) / 2 - 12), row = cw - 80 < CHIPS_W * 0.9; return { cw, ch: row ? 118 : 98, row }; }

// ---------------------------------------------------------------- what happened: particles, shakes and the feed
// (call once after each update; the sounds are fight-ui.js's)
export function fightEvents(F) {
  const v = viewOf(F), few = settings.reduced;
  for (const e of F.events || []) {
    // who: the attacker (hit, counter, trade, ...), but the victim on ko, wall and down
    // (js/fight.js); the feed always reads attacker > victim
    const P = e.power || 0, who = e.who ?? -1, foe = who >= 0 ? 1 - who : -1;
    momentEvent(v, F, e);
    switch (e.kind) {
      case 'hit': {   // a short sharp burst of streaks the way the hit goes, and a small flash on the body
        const A = F.f[who], a = A ? Math.atan2(e.y - A.y, e.x - A.x) : frnd(0, TAU);
        if (e.ground) {   // on someone knocked down (fight.js groundHit): lighter, no flash: a few short streaks down onto the body, dust off the floor under them, the body jolted
          burst(v, e.x - Math.cos(a) * 4, e.y - 12, Math.PI / 2 + Math.cos(a) * 0.5, 0.9, 11 + P * 12, few ? 3 : 4, 0.12);
          kick(v, e.x + Math.cos(a) * 6, e.y + 2, a, few ? 2 : 3);
          if (e.to >= 0) { (v.gbump || (v.gbump = [-9, -9]))[e.to] = v.t; addFeed(v, F, 'ghit', who, e.to); }
          break;
        }
        burst(v, e.x - Math.cos(a) * 6, e.y - 24, a, 0.7 + P * 0.4, 16 + P * 26, few ? 4 : 5 + Math.round(P * 4), 0.16 + P * 0.1);
        v.fx.push({ k: 'flash', x: e.x - Math.cos(a) * 8, y: e.y - 24, t: 0, life: 0.09 + P * 0.05, s: 12 + P * 14 });
        break;
      }
      case 'counter': {   // a counter hit (caught in their wind-up): a big sharp star where it landed and a wider ring of streaks
        const A = F.f[who], D = F.f[e.to ?? foe], a = A && D ? angTo(A, D) : 0, x = e.x ?? (D ? D.x : 0), y = e.y ?? (D ? D.y : 0);
        v.fx.push({ k: 'cstar', x: x - Math.cos(a) * 4, y: y - 26, a: frnd(-0.3, 0.3), t: 0, life: 0.32, s: 26 });
        burst(v, x - Math.cos(a) * 4, y - 26, a, 2.2, 44, few ? 5 : 9, 0.24);
        addFeed(v, F, 'chit', who, D ? D.i : foe); break;
      }
      case 'trade': {   // both landed at once: a hot white glint where they met, metal sparks flung out across the line
        const A = F.f[who], B = F.f[e.to ?? foe], a = A && B ? angTo(A, B) : 0, big = false;
        const x = e.x ?? (A && B ? (A.x + B.x) / 2 : 0), y = e.y ?? (A && B ? (A.y + B.y) / 2 : 0);
        v.fx.push({ k: 'clash', x, y: y - 26, a, t: 0, life: big ? 0.22 : 0.16, s: (big ? 20 : 13) * (0.8 + P * 0.4) });
        const n = few ? 3 : big ? 9 : 5;
        for (let k = 0; k < n; k++) {
          const side = k % 2 ? 1 : -1, b = a + side * Math.PI / 2 + frnd(-0.7, 0.7), sp = frnd(140, 260) * (big ? 1 : 0.75);
          v.fx.push({ k: 'ember', x, y: y - 26, vx: Math.cos(b) * sp, vy: Math.sin(b) * sp * 0.7 - frnd(40, 110), t: 0, life: frnd(0.25, 0.42), s: frnd(5, 9) });
        }
        break;
      }
      case 'wall': {   // knocked into a wall (or a solid): a crack-flash along it, chips of stone off it, dust
        const nx = e.nx ?? 0, ny = e.ny ?? -1;
        if (P > 0.25) {
          v.shake = Math.max(v.shake, 0.2 + P * 0.35);
          v.fx.push({ k: 'crack', x: e.x, y: e.y - 12, nx, ny, t: 0, life: 0.3, s: 14 + P * 14, seed: frnd(0, 99) });
          for (let k = 0; k < (few ? 3 : 4 + Math.round(P * 3)); k++) { const a = Math.atan2(ny, nx) + frnd(-0.9, 0.9), sp = frnd(80, 170) * (0.6 + P * 0.6); v.fx.push({ k: 'chip', x: e.x, y: e.y - 12, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - frnd(60, 140), t: 0, life: frnd(0.4, 0.6), s: frnd(2.2, 3.6), a: frnd(0, TAU), sp: frnd(-12, 12) }); }
          puff(v, e.x + nx * 6, e.y + ny * 6 - 6, few ? 2 : 4, null);
        } else puff(v, e.x, e.y, 2, null);
        break;
      }
      case 'ko': {   // a heavy burst, a white flash, and stars circling their head for a moment
        const A = F.f[1 - who], a = A ? Math.atan2(e.y - A.y, e.x - A.x) : 0;
        burst(v, e.x, e.y - 26, a, 1.2, 46, few ? 6 : 10, 0.32);
        v.fx.push({ k: 'flash', x: e.x, y: e.y - 26, t: 0, life: 0.16, s: 34 });
        if (who >= 0) v.fx.push({ k: 'kostars', i: who, t: 0, life: 1.6, s: 1 });
        v.shake = Math.max(v.shake, 0.6); addFeed(v, F, 'ko', foe, who); break;
      }
      case 'burn': puff(v, e.x, e.y - 6, few ? 3 : 6, '#ffd9b0'); v.fx.push({ k: 'flash', x: e.x, y: e.y - 20, t: 0, life: 0.15, s: 26 }); break;   // a heat vent flaring under them
      case 'pad': puff(v, e.x, e.y, few ? 2 : 4, null); break;
      // (a pad's glide, a knockdown and getting up: from the fighters' states below, so a snapshot
      // without the events still shows them)
      case 'down': if (who >= 0) addFeed(v, F, 'down', e.by ?? 1 - who, who); break;   // (by -1: a heat vent)
      case 'rise': {   // a quick rise (fight.js rise): dust kicked back off the push, and a little where the hands push off the floor
        const a = e.a ?? 0; kick(v, e.x - Math.cos(a) * 6, e.y + 1, a + Math.PI, few ? 2 : 4);
        puff(v, e.x - Math.cos(a) * 12, e.y + 2, few ? 1 : 2, null); break;
      }
      case 'step': case 'getup': case 'whiff': case 'sudden': case 'round': case 'win': break;
      default:   // the kits' (draw-kits.js), and their lines in the feed
        kitEvent(v, F, e, few);
        if (e.kind === 'freeze') addFeed(v, F, 'stopworld', who, e.to ?? foe);   // (Stop the World caught them)
        else if (e.kind === 'erupt') addFeed(v, F, 'hotjava', e.back ? foe : who, e.to ?? foe);   // (Hot Java boiling over on them: Duke's, or passed back onto him, theirs)
        else if (e.kind === 'pyEat') addFeed(v, F, 'pyApple', who, -1);   // (Pyth ate his apple)
        else if (e.kind === 'pySquash') addFeed(v, F, 'pySquashed', e.by ?? foe, who);   // (they squashed it on him)
    }
  }
  F.f.forEach((f, i) => {
    // the states as they change: a step kicks up dust behind it; knocked down, a ring of dust where they land (and which
    // way they fall: away from the other one); up again, a little puff
    const st = f.state, was = v.was[i];
    if (st !== was) {
      if (STEPS.has(st)) {
        const sp = Math.hypot(f.vx || 0, f.vy || 0), a = f.stepA ?? (sp > 20 ? Math.atan2(f.vy, f.vx) : v.stepA[i]);
        v.stepA[i] = a; kick(v, f.x - Math.cos(a) * 8, f.y - Math.sin(a) * 4, a + Math.PI, few ? 2 : 4);
      }
      if (DOWN.has(st) && !DOWN.has(was)) {
        const o = F.f[1 - i], dx = o ? f.x - o.x : 0;
        v.fall[i] = Math.abs(dx) > 6 ? Math.sign(dx) : Math.abs(f.vx || 0) > 10 ? Math.sign(f.vx) : (i ? 1 : -1);
        (v.land || (v.land = [0, 0]))[i] = 1;   // (the dust when they land: below)
      }
      if (st === 'getup' && !f.roll) puff(v, f.x, f.y, few ? 2 : 3, null);
      if (was === 'getup' && v.rolled && v.rolled[i]) { v.rolled[i] = 0; puff(v, f.x, f.y, few ? 1 : 2, null); }   // (out of a roll: a little dust where they come up)
      v.was[i] = st;
    }
    if (v.land && v.land[i] && (!DOWN.has(st) || f.t >= AIR)) {   // landed (draw-body.js bodyFall): a ring of dust where the body hits, a puff off it
      v.land[i] = 0;
      if (DOWN.has(st)) { const x = f.x + v.fall[i] * 24; v.fx.push({ k: 'dring', x, y: f.y, t: 0, life: 0.5, s: 46, id: i + 1 }); puff(v, x, f.y, few ? 2 : 4, null); }
    }
    if (st === 'getup' && f.roll) {   // rolling: a trail of dust puffs off the floor behind them
      const R = v.rolled || (v.rolled = [0, 0]), D = v.rollD || (v.rollD = [-9, -9]); R[i] = 1;
      if (v.t - D[i] > (few ? 0.09 : 0.05)) { D[i] = v.t; kick(v, f.x - Math.cos(f.rollA || 0) * 8, f.y + 1, (f.rollA || 0) + Math.PI, 1); }
    }
  });
  // damage taken, from the health itself (so every kind counts: hits, the kits' things, the walls; online too)
  F.f.forEach((f, i) => {
    const was = v.lastHp[i] ?? f.hp;
    if (f.hp < was - 0.01) {
      const k = clamp(0.55 + (was - f.hp) / (f.maxHp || 100) * 4, 0.55, 1), H = v.hurt[i];
      v.hurt[i] = { t: v.t, k: v.t - H.t < 0.12 ? Math.max(k, H.k) : k };
    }
    else if (f.hp > was + 0.01 && f.state !== 'ko' && F.phase !== 'intro') {   // (healing: a little green mote now and then)
      v.heal[i] += f.hp - was;
      const HB = v.hb || (v.hb = [null, null]); if (!HB[i] || v.t - HB[i].t > 0.9) HB[i] = { lo: was, t: v.t };   // (the HUD's green sweep up the bar)
      if (v.heal[i] > 0.6) { v.heal[i] = 0; v.fx.push({ k: 'mote', x: f.x + frnd(-12, 12), y: f.y - (f.z || 0) - frnd(10, 40), vx: 0, vy: -frnd(20, 40), t: 0, life: frnd(0.7, 1), s: frnd(1.6, 2.4), col: '190,255,200' }); }
    }
    v.lastHp[i] = f.hp;
  });
  if (v.fx.length > 140) v.fx.splice(0, v.fx.length - 140);
}
// time passing without a frame drawn (the dev hook's fast-forward): the effects age and go as they would on screen
export function fightTick(F, dt) {
  const v = viewOf(F); v.t += dt;
  if (F.phase !== v.phase) { v.phase = F.phase; v.phaseT = 0; } else v.phaseT += dt;   // (the beats keep time too)
  for (const p of v.fx) p.t += dt;
  v.fx = v.fx.filter(p => p.t < p.life);
}
export function puff(v, x, y, n, col) {
  for (let k = 0; k < n; k++) { const a = frnd(0, TAU), sp = frnd(30, 80); v.fx.push({ k: 'dust', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5 - 12, t: 0, life: frnd(0.4, 0.7), s: frnd(6, 11), c: col }); }
}
// a burst of n streaks fanning round angle a (spread: the fan's full width), each its own length and speed
export function burst(v, x, y, a, spread, s, n, life) {
  const rs = []; for (let k = 0; k < n; k++) rs.push([a + (n > 1 ? (k / (n - 1) - 0.5) : 0) * spread + frnd(-0.12, 0.12), frnd(0.6, 1.1)]);
  v.fx.push({ k: 'burst', x, y, t: 0, life, s, rs });
}
// dust kicked off the ground one way (angle a): a step pushing off
function kick(v, x, y, a, n) {
  for (let k = 0; k < n; k++) { const b = a + frnd(-0.6, 0.6), sp = frnd(50, 110); v.fx.push({ k: 'dust', x, y, vx: Math.cos(b) * sp, vy: Math.sin(b) * sp * 0.5 - 10, t: 0, life: frnd(0.3, 0.5), s: frnd(4, 7), c: null }); }
}
function addFeed(v, F, kind, a, b) { v.feed.push({ id: ++v.id, kind, a, b, t: v.t, x: null, al: 0 }); if (v.feed.length > 12) v.feed.shift(); }

// ---------------------------------------------------------------- the camera
// framing both fighters and the arena: the whole arena at least, a little closer when they're close together (the walls
// keep everyone in it, so it never has to go wider)
function camera(F, v, dt, vb) {
  const B = arenaBox(F.A || ARENAS.ring), R = Math.max(B.x1 - B.x0, B.y1 - B.y0) / 2, bw = B.x1 - B.x0, bh = B.y1 - B.y0;
  const fit = (w, h) => Math.min(vb.w / w, vb.h / h);
  const zP = fit(bw + 100, bh + RIM + R * UNDER * 0.7 + 80);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const f of F.f) { x0 = Math.min(x0, f.x); x1 = Math.max(x1, f.x); y0 = Math.min(y0, f.y - (f.air ? Math.min(f.z || 0, 30) : f.z) - 50); y1 = Math.max(y1, f.y + 10); }   // (Tux up out of shot: the camera stays on the floor)
  for (const o of F.objs || []) if (o.cam && o.t < o.life) { x0 = Math.min(x0, o.x); x1 = Math.max(x1, o.x); y0 = Math.min(y0, o.y - 60); y1 = Math.max(y1, o.y + 10); }   // (a world object worth keeping in shot, cam: 1: Pyth's apple)
  const mF = 115, zF = fit(x1 - x0 + mF * 2, y1 - y0 + mF * 2), cF = [(x0 + x1) / 2, (y0 + y1) / 2];
  const cP = [(B.x0 + B.x1) / 2, (B.y0 + B.y1 + RIM + R * UNDER * 0.7) / 2];
  let z, c;
  if (zF >= zP) { z = Math.min(zF, zP * 1.35); const w = clamp(1 - zP / z, 0, 1) * 1.3; c = [lerp(cP[0], cF[0], w), lerp(cP[1], cF[1], w)]; }
  else { z = zF; c = cF; }
  const M = momentCam(F, v, z); if (M) { c = [M.x, M.y]; z = M.z; }   // (a KO, the match won: draw-moments.js)
  const Pn = v.punch, pa = Pn ? v.t - Pn.t : 9;   // a big hit: a quick punch in on it (draw-moves.js punch)
  if (!M && pa >= 0 && pa < 0.4 && !settings.reduced) { const e = Math.sin(clamp(pa / 0.4, 0, 1) * Math.PI) * (pa < 0.1 ? pa / 0.1 : 1); z *= 1 + 0.025 * e; c = [lerp(c[0], Pn.x, 0.05 * e), lerp(c[1], Pn.y - 20, 0.05 * e)]; }   // (a hair: more was too much)
  if (!v.cam) v.cam = { x: c[0], y: c[1], z };
  const C = v.cam, k = 1 - Math.exp(-(M ? M.k : pa < 0.4 ? 8 : 3) * dt);
  C.z = Math.exp(lerp(Math.log(C.z), Math.log(z), k)); C.x = lerp(C.x, c[0], k); C.y = lerp(C.y, c[1], k);
  return C;
}

export function starPath(g, x, y, R, r, n, rot = 0) {
  g.beginPath();
  for (let k = 0; k < n * 2; k++) { const a = rot + k / (n * 2) * TAU, q = k % 2 ? r : R; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
  g.closePath();
}

// ---------------------------------------------------------------- the world objects on the ground and in the air
function groundObjs(g, F, v) { kitGround(g, F, v); }

// ---------------------------------------------------------------- the fighters
const OFF = typeof document !== 'undefined' ? document.createElement('canvas') : null;
export function model(g, ch, o) {
  if (!M3.drawMascot3D(g, ch, o)) drawMascot(g, ch, { t: o.t, scale: o.scale, mood: o.mood, shadow: false, lean: o.lean, look: [Math.cos(o.yaw || 0), Math.sin(o.yaw || 0)], face: Math.cos(o.yaw || 0) < 0 ? -1 : 1 });
}
// draw(g) at the current transform, through a little canvas when it needs a tint (the hit flash, frozen grey)
export function tinted(g, draw, tint) {
  if (Array.isArray(tint)) { tint = tint.filter(Boolean); if (!tint.length) tint = null; }
  if (!tint || !OFF) { draw(g); return; }
  const m = g.getTransform(), sx = m.a, sy = m.d, w = Math.ceil(150 * Math.max(sx, sy)), h = Math.ceil(w * 1.3);   // (room under the feet too: a body tipped or flipped over)
  if (OFF.width < w || OFF.height < h) { OFF.width = w; OFF.height = h; }
  const o = OFF.getContext('2d'); o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, OFF.width, OFF.height);
  o.setTransform(sx, 0, 0, sy, w / 2, h * 0.62); o.globalAlpha = 1; draw(o);
  o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = 'source-atop'; for (const c of [].concat(tint)) { if (typeof c === 'function') c(o, w, h); else { o.fillStyle = c; o.fillRect(0, 0, w, h); } } o.globalCompositeOperation = 'source-over';
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(OFF, 0, 0, w, h, m.e - w / 2, m.f - h * 0.62, w, h); g.restore();
}
export function shadow(g, x, y, z, r = 17) {
  const s = 1 / (1 + Math.max(0, z) / 110);
  softShadow(g, x + 2, y + 1.5, r * s * 1.2, r * 0.36 * s * 1.2, (bold() ? 0.3 : 0.34) * s);   // (soft, like the rest: art/arena-mat.js)
}
const LIE = new Set(['slide', 'flop', 'belly']);
function longShadow(g, x, y, z, yaw) {   // seen from 28° up: the length along x stays, along y shrinks
  const s = 1 / (1 + Math.max(0, z) / 110), u = Math.cos(yaw), w = Math.sin(yaw) * Math.sin(28 * Math.PI / 180);
  softShadow(g, x + 2, y + 1.5, Math.max(10, Math.hypot(u, w) * 27) * s * 1.15, 9 * s * 1.2, (bold() ? 0.3 : 0.34) * s, Math.atan2(w, u));
}
function moodOf(F, f) {
  if (f.state === 'ko') return 'ko';
  if (f.state === 'dizzy' || f.state === 'down' || f.state === 'stagger' || f.state === 'grabbed' || (f.state === 'hurt' && f.t < 0.25)) return 'dizzy';
  if (f.state === 'win' || (F.phase === 'roundEnd' && F.roundWinner === f.i) || (F.phase === 'over' && F.winner === f.i)) return 'happy';
  return null;
}
// the sim's poses the models don't have, as ones they do ('' : the walk or standing)
const POSE_AS = { stagger: 'hurt', down: 'hurt', getup: 'wind', step: '' };
const smooth = k => k * k * (3 - 2 * k);
const WALK = 150;
const HELD = new Set(['potup']);   // (poses holding a thing that's gone in the next: not faded out, or the thing hangs there a moment)
function fighter(g, F, v, f, humans) {
  const ch = charOf(f.id), t = v.t + f.i * 2.3, BD = bold(), col = PCOL[f.i], st = f.state, i = f.i;
  let x = f.x, y = f.y;
  const hide = f.stats && kitBehind(g, F, v, f) === 'hide';   // (Gopher underground: only his mound shows)
  if (hide) { marker(g, F, v, f, humans, x, y); return; }
  // knocked down (or out): popped up and back off the hit, stretched, tipping over (bodyFall: draw-body.js), landing
  // flat away from the other one with a squash, a bounce and dust; lying in the body's own way (LIE: Tux on his belly,
  // Ferris on his back legs kicking...). Getting up: lying -> crouched (squash) -> sprung up (stretch) -> settling
  const b = bodyOf(v, f), LP = lieOf(f.id), fall = v.fall[i], BF = bodyFall(F, v, f, b);
  const belly = !!LP.pose;
  let lie = BF.lie, bob = 0, hop = BF.hop, sqB = BF.sq, back = BF.back;
  if (st === 'getup' && f.roll) { const k = clamp(f.t / (f.dur || 0.2), 0, 1); lie = 1 - smooth(clamp(k / 0.45, 0, 1)); hop = Math.sin(clamp((k - 0.3) / 0.7, 0, 1) * Math.PI) * 2.5; }   // (a quick rise: pushed up off the floor and scrambling off low the way it goes, below)
  if (DOWN.has(st) && v.gbump) { const q = (v.t - v.gbump[i]) / 0.18; if (q >= 0 && q < 1) bob += Math.sin(q * TAU) * 2.6 * (1 - q); }   // (hit on the floor: jolted into it and back)
  x += back + b.kx;   // (KO'd: eased clear of the winner, drawing only)
  // (the quick rise, no tumble: the push up off the floor, then a scramble the way it goes, leaning into it low and
  // straightening as it comes out)
  const rollK = st === 'getup' && f.roll ? clamp(f.t / (f.dur || 0.2), 0, 1) : -1, rollS = Math.cos(f.rollA || 0) < -0.2 ? -1 : 1;
  const rollLean = rollK >= 0 ? rollS * 0.42 * Math.sin(clamp(rollK / 0.9, 0, 1) * Math.PI) * (1 - lie) : 0;
  const td = f.id === 'tux' || f.id === 'duke';   // (Tux's and Duke's hit reactions and pose blends: draw-moves.js)
  const won = st === 'win';   // (a winner's celebration is draw-moments.js's, not the move they won with)
  const flop = belly && lie > 0.5, A = won ? null : f.stats && f.ph ? moveAnim(F, v, f) : td && f.stats && st !== 'getup' ? hitAnim(F, v, f) : null;   // (A: a three-move fighter's move playing: draw-moves.js)
  const up = f.air && (f.z || 0) > 30;   // (up out of shot: the iceberg's own shadow is on the floor instead)
  const fpose = (A && A.pose) || f.pose;   // (a move's anim can name the pose to draw: an own move's calm settle, draw-moves.js / kits.js settleAnim)
  if (up) { /* no shadow of his own */ }
  else if (LIE.has(fpose) || flop) longShadow(g, x, f.y, f.z, flop ? (fall > 0 ? 0 : Math.PI) : f.face);   // (lying on his belly: a long shadow along him)
  else if (lie > 0.05 && !LP.flat) longShadow(g, x - fall * 4 * lie, f.y, hop, 0);
  else shadow(g, x, f.y, (f.z || 0) + hop, (f.stats && f.stats.radius ? f.stats.radius + 2 : 17) * (LP.flat ? 1 + 0.25 * lie : 1));
  // the lunge: forward on a strike, a lean back on a wind-up
  const fc = Math.cos(f.face), fs = Math.sin(f.face);
  let lunge = 0;
  if (A) lunge = A.fwd;
  else if (st === 'strike') lunge = 7 * Math.sin(Math.min(1, f.t / 0.08) * Math.PI / 2);
  else if (st === 'wind') lunge = -3;
  x += fc * lunge; y += fs * lunge;
  if (st === 'frozen') clockRing(g, f.x, f.y, f.dur ? clamp(1 - f.t / f.dur, 0, 1) : 1, v.t);
  if (f.flash > 0 && F.hitstop > 0) x += Math.sin(v.t * 95) * 2;   // shaking in the hitstop
  if (st === 'stagger') x += Math.sin(v.t * 9 + i) * 1.6;           // (staggered: swaying)
  // squash and stretch: rising stretches, a strike and a glide stretch
  let sq = 0;
  if (f.z > 0) sq -= clamp((f.vz || 0) / 900, -0.12, 0.16);
  if (st === 'strike' && !A) sq -= 0.06;
  if (STEPS.has(st)) sq -= 0.05;
  if (rollK >= 0) sq += 0.09 * Math.sin(clamp((rollK - 0.25) / 0.75, 0, 1) * Math.PI);   // (the scramble: crouched low, springing out of it)
  sq *= 1 - lie;
  sq += sqB;   // (the knockdown's own: stretched in the air, a squash landing, crouched and sprung getting up)
  const sp = Math.hypot(f.vx || 0, f.vy || 0), mv = f.move && f.stats && f.stats.moves[f.move], walk = (f.stats && f.stats.walk) || 1;
  g.save(); g.translate(x + (A ? A.wx : 0), y - (f.z || 0) - hop - bob - (A ? A.hop : 0));
  if (A && A.alpha < 1) { if (A.alpha <= 0.01) { g.restore(); return; } g.globalAlpha *= A.alpha; }
  if (st === 'getup' && f.roll) { /* (the quick rise: solid, the scramble shows it) */ }
  else if (st === 'getup') { /* (solid: the safeT flicker after it shows they can't be hit) */ }
  else if (f.inv > 0 && !STEPS.has(st) && !DOWN.has(st)) g.globalAlpha *= 0.55 + 0.45 * Math.abs(Math.sin(v.t * 30));
  else if (f.safeT > 0 && st !== 'ko') g.globalAlpha *= 0.78 + 0.22 * Math.abs(Math.sin(v.t * 22));   // (just up off a knockdown, safe a moment (fight.js safeT): a soft flicker)
  const tip = lie > 0 && !flop && !LP.flat, flip = LP.flip && lie > 0 && DOWN.has(st) ? fall * Math.PI * lie : 0;
  if (flip) g.translate(-26 * Math.sin(flip), -26 + 26 * Math.cos(flip) + 30 * lie);   // (Ferris: over onto his back round his middle: the lean turns him round his feet, this puts his middle back)
  else if (tip) g.translate(-fall * 18 * lie, -7 * lie);   // (tipped over round the feet: the body back over where they stand)
  // a step leans the way it goes; knocked down they tip over (lying face up, turned to the camera)
  let lean = flip ? flip : (flop || LP.flat ? 0 : lie > 0 ? fall * 1.45 * lie + rollLean : rollK >= 0 ? rollLean : STEPS.has(st) ? clamp(Math.cos(f.stepA ?? v.stepA[i]), -1, 1) * 0.2 : 0) + (A ? A.lean : 0);
  let yaw = (LIE.has(fpose) ? f.face : f.face + 0.35 * Math.sin(Math.PI / 2 - f.face)) + (A ? A.spin : 0);   // (turned a touch toward the camera: a profile reads poorly from above)
  if (rollK >= 0) { const ra = f.rollA || 0; yaw = ra + 0.35 * Math.sin(Math.PI / 2 - ra); }   // (the scramble: turned the way it goes)
  if (flop) yaw = (fall > 0) === (LP.head > 0) ? 0 : Math.PI;   // (the head away from the other one)
  else if (lie > 0) yaw = lerp(yaw, Math.PI / 2 + (flip ? -fall * 0.5 : fall * 0.3), lie);
  // the pose: the sim's, else standing on his legs, or a frame of the walk cycle from the distance walked (a step: mid-stride)
  const wk = st === 'walk' && sp > 0.1 * WALK * walk;   // (Tux's icy glide, idle, stands)
  if (v.wd) { const L = v.wl[i]; if (L) v.wd[i] += Math.hypot(f.x - L[0], f.y - L[1]); v.wl[i] = [f.x, f.y]; }   // (a drawer-side distance, for a snapshot without walkDist)
  let pose = POSE_AS[fpose] ?? fpose;
  const FP = fallPose(f, v, LP, lie);
  if (FP) pose = FP;
  else if (lie > 0.05) pose = 'hurt';
  else if (STEPS.has(st)) pose = M3.walkPose ? M3.walkPose(0.25) : 'stand';
  else if (rollK >= 0) pose = M3.walkPose ? M3.walkPose(0.1 + rollK * 0.9) : 'stand';   // (the scramble: a quick stride or two off the floor)
  else if (st === 'stagger' && !pose) pose = 'hurt';
  if (!pose) pose = wk && M3.walkPose ? M3.walkPose((f.walkDist ?? v.wd[i]) / STRIDE) : 'stand';
  const MP = momentPose(F, v, f, b);   // (a ready pose before a round, the winner's celebration: draw-moments.js)
  // standing about or walking: breathing, a tic now and then, a bob in step (draw-body.js)
  const BI = !MP && !A && lie === 0 && !f.air && (wk || (st === 'idle' && pose === 'stand')) ? bodyIdle(f, v, wk, (f.walkDist ?? v.wd[i]) / STRIDE, sp, walk) : null;
  if (BI) { sq += BI.sq; lean += BI.lean; yaw += BI.yaw; if (BI.pose) pose = BI.pose; g.translate(BI.wx, -BI.hop); }
  if (MP) { if (MP.yaw != null) yaw = MP.yaw; sq += MP.sq || 0; lean += MP.lean || 0; g.translate(MP.wx || 0, -(MP.hop || 0)); }
  g.save(); g.scale((1 + sq) * (A ? A.sx * A.s : 1), (1 - sq) * (A ? A.sy * A.s : 1));
  const mood0 = moodOf(F, f) || (A && A.mood) || null;
  const o = { t, scale: SCALE, smooth: true, yaw, lean, mood: MP && MP.mood !== undefined ? MP.mood || mood0 : mood0, pose: MP && MP.pose != null ? MP.pose || pose : pose, shadow: false, fight: true };
  // the tints: Stop the World greys them out under a cold blue wash; damage taken turns them red for a moment (a pale
  // pink at the very hit, the red strongest for ~0.15 s, gone by 0.5 s; deeper for a bigger chunk)
  const H = v.hurt[i], ha = v.t - H.t, red = (ha >= 0 && ha < 0.5 ? H.k * (ha < 0.15 ? 1 : 1 - (ha - 0.15) / 0.35) : 0);
  const wm = clamp(ha / 0.07, 0, 1), rc = `${Math.round(255)},${Math.round(lerp(200, 50, wm))},${Math.round(lerp(200, 58, wm))}`;
  const tint = [st === 'frozen' ? (BD ? 'rgba(168,172,186,0.84)' : 'rgba(170,174,188,0.82)') : null,   // (Stop the World: a grey statue)
    st === 'frozen' ? 'rgba(255,255,255,0.1)' : null,
    red > 0.01 ? `rgba(${rc},${(red * (BD ? 0.26 : 0.25)).toFixed(3)})` : null,
    f.stats ? kitTint(F, v, f) : null];
  const pb0 = poseFade(v, f, o.pose || 'stand'), pb = (td || MP || BI || lie > 0 || st === 'getup') && F.phase !== 'intro' && !(pb0 && HELD.has(pb0.pose)) ? pb0 : null;   // (the celebration's, the tics', a fall's and a get-up's pose changes blended)
  const ko3 = st === 'ko' && propReady('bit:star'), km = flop || LP.flat ? 'flat' : flip ? 'flip' : '';   // (knocked out: little 3D stars round their head, the far ones behind it)
  if (ko3) koStars3(g, f, v, -1, lie, fall, km);
  if (pb) { g.save(); g.globalAlpha *= pb.a; model(g, ch, { ...o, pose: pb.pose }); g.restore(); }   // (the pose it was in, fading out under the new one)
  const sink = f.stats ? kitSink(F, v, f) : null;   // (sunk into a hole: drawn lower, cut off at the floor line)
  if (sink) { g.save(); g.beginPath(); g.rect(-200, -400, 400, 400 + 0.5); g.clip(); g.translate(sink.wx || 0, sink.d / Math.max(0.2, (1 - sq) * (A ? A.sy * A.s : 1))); }
  tinted(g, gg => model(gg, ch, o), tint);
  if (sink) g.restore();
  if (BI && BI.glow > 0.02) glow(g, Math.cos(o.yaw) * 13, -35 + Math.sin(o.yaw) * 2, 12, '255,96,72', 0.75 * BI.glow);   // (Duke's nose, glowing in his idle tic)
  g.restore();
  if (ko3) koStars3(g, f, v, 1, lie, fall, km);
  if (MP) momentProp(g, F, v, f, b, o.pose);
  if (st === 'frozen') {   // Stop the World: a frosty clock face over them, its hand ticking round
    const cy = -66, hand = f.dur ? f.t / f.dur * TAU : 0;
    if (propReady('watch')) {   // (a little frosty pocket watch, bobbing gently, its hand ticking round)
      const by = cy - 9 + Math.sin(v.t * 2.2 + i) * 1.2, S = 1.3;   // (high enough to clear their head)
      g.save(); g.translate(0, by); g.rotate(Math.sin(v.t * 1.7 + i) * 0.06); drawProp3D(g, 'watch', { scale: S });
      g.strokeStyle = BD ? BK.ink : '#2a3448'; g.lineWidth = 1.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, 0.3); g.lineTo(Math.sin(hand) * 4.6 * S * 0.75, 0.3 - Math.cos(hand) * 4.6 * S * 0.75); g.stroke();
      g.restore();
    } else {
    g.fillStyle = BD ? alpha('#ffffff', 0.85) : 'rgba(235,245,255,0.82)'; g.beginPath(); g.arc(0, cy, 9, 0, TAU); g.fill();
    g.strokeStyle = BD ? alpha(BK.ink, 0.6) : 'rgba(36,48,74,0.6)'; g.lineWidth = 1.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, cy); g.lineTo(Math.sin(hand) * 6, cy - Math.cos(hand) * 6); g.moveTo(0, cy); g.lineTo(0, cy - 4); g.stroke();
    }
  }
  if (f.stats) kitOver(g, F, v, f);
  g.restore();
  marker(g, F, v, f, humans, x, y);
}
// who's who: a small marker over a human's head in their colour (only with a human to mark)
function marker(g, F, v, f, humans, x, y) {
  const col = PCOL[f.i], BD = bold();
  if (humans.includes(f.i)) {
    const my = y - (f.z || 0) - 66 - Math.sin(v.t * 4) * 2;
    g.fillStyle = col; g.beginPath(); g.moveTo(x - 7, my - 6); g.lineTo(x + 7, my - 6); g.lineTo(x, my + 3); g.closePath(); g.fill();
    if (!BD) { g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.5; g.stroke(); }
  }
}
// knocked out: three little puffy 3D gold stars tumbling round over their head, quick at first and slowing; round where
// the head lies once they're down (tipped over, or Tux flat on his belly). side -1 the far ones (before the model), 1 the
// near ones. At their feet (the fighter's frame, lie's shift applied)
function koStars3(g, f, v, side, lie, fall, mode) {
  const t = f.t || 0, T = 1.6, ang = t < T ? 4.2 * (t - 0.25 * t * t / T) : 4.2 * 0.75 * T + 2.1 * (t - T);
  let x = 0, y = -56;
  if (mode === 'flat') { x = f.id === 'pyth' ? 0 : (fall > 0 ? 1 : -1) * 20; y = -34; }
  else if (mode === 'flip') { x = fall * 6; y = -20; }
  else if (lie > 0) { const L = fall * 1.45 * lie; x = Math.sin(L) * 50; y = lerp(-56, -Math.cos(L) * 50 - 12, lie); }
  g.save(); g.translate(x, y);
  orbit3(g, 'star', ang, { n: 3, R: 15, s: 4, spin: 1, tumble: 2.4, a: clamp(t / 0.15, 0, 1), side });
  g.restore();
}
// Stop the World on the ground round a frozen fighter: a soft frosty pool (no rim), the time left as a faint pale arc
// running down, four soft ticks and a hand sweeping round
function clockRing(g, x, y, left, t) {
  const BD = bold(), R = 32, sy = 0.42, B = BD ? BK.blue : '#58b8ff';
  g.save(); g.translate(x, y); g.scale(1, sy);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, R); gr.addColorStop(0, alpha(B, 0.14)); gr.addColorStop(0.8, alpha(B, 0.1)); gr.addColorStop(1, alpha(B, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
  g.strokeStyle = alpha('#ffffff', 0.5); g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.arc(0, 0, R - 5, -Math.PI / 2, -Math.PI / 2 + TAU * left); g.stroke();
  g.strokeStyle = alpha('#ffffff', 0.4); g.lineWidth = 1.4;
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * (R - 12), Math.sin(a) * (R - 12)); g.lineTo(Math.cos(a) * (R - 8), Math.sin(a) * (R - 8)); g.stroke(); }
  const a = -Math.PI / 2 + TAU * (1 - left); g.strokeStyle = alpha(B, 0.5); g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * (R - 12), Math.sin(a) * (R - 12)); g.stroke();
  g.restore();
}

// a knockdown's ring of dust: a low wave of dust rolling out along the ground (soft puffs on the front, thinner behind),
// pebbles hopping up off it, and a faint pale line where the air ripples just ahead of it
function shockwave(g, o) {
  const k = clamp(o.t / (o.life || 0.25), 0, 1), r = Math.max(4, o.r || 10 + k * 90), fade = 1 - k * k, n = 18, ph = (o.id || 1) * 1.7;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + ph, w = 0.75 + 0.25 * Math.sin(i * 2.7 + ph), x = o.x + Math.cos(a) * r * w, y = o.y + Math.sin(a) * r * 0.9 * w, pr = (6 + 7 * k) * (0.8 + 0.4 * Math.sin(i * 1.9));
    const gr = g.createRadialGradient(x - pr * 0.25, y - pr * 0.4, 0, x, y - pr * 0.2, pr);
    gr.addColorStop(0, `rgba(252,249,242,${(0.75 * fade).toFixed(3)})`); gr.addColorStop(0.6, `rgba(222,212,194,${(0.45 * fade).toFixed(3)})`); gr.addColorStop(1, 'rgba(226,216,198,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y - pr * 0.2, pr, 0, TAU); g.fill();
    if (i % 3 === 0) {   // a pebble hopping up
      const h = Math.sin(Math.min(1, k * 1.4) * Math.PI) * (6 + (i % 5) * 2);
      g.fillStyle = `rgba(110,96,78,${(0.8 * fade).toFixed(3)})`; g.beginPath(); g.ellipse(x * 1 + Math.cos(a) * 4, y - h, 1.8, 1.4, a, 0, TAU); g.fill();
    }
  }
  g.strokeStyle = `rgba(255,255,255,${(0.22 * fade).toFixed(3)})`; g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(o.x, o.y, r * 1.06, r * 0.95, 0, 0, TAU); g.stroke();
}
function particles(g, v, dt, F) {
  const BD = bold();
  for (const p of v.fx) {
    p.t += dt; const k = clamp(p.t / p.life, 0, 1);
    if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 3 * dt; p.vy *= 1 - 3 * dt; }
    if (kitFx(g, F, v, p, k, dt)) continue;   // (the kits' kinds: draw-kits.js)
    if (p.k === 'confetti') { confetti(g, p, k, dt); continue; }   // (a round won: draw-moments.js)
    if (p.k === 'cstar') {   // a counter hit: a big sharp star that pops, turns a little and shrinks, long white spikes behind it
      const s = p.s * (k < 0.18 ? 0.5 + 2.8 * k : 1 - (k - 0.18) * 0.55), a = p.a + k * 0.5, fade = 1 - k * k;
      g.save(); g.globalAlpha *= fade;
      starPath(g, p.x, p.y, s * 1.55, s * 0.1, 4, a + Math.PI / 4); g.fillStyle = '#ffffff'; g.fill();
      starPath(g, p.x, p.y, s, s * 0.3, 8, a); g.fillStyle = BD ? BK.red : '#ff5a3c'; g.fill();
      if (!BD) { g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 2; g.stroke(); }
      starPath(g, p.x, p.y, s * 0.55, s * 0.2, 8, a + Math.PI / 8); g.fillStyle = BD ? BK.yellow : '#ffe066'; g.fill();
      g.beginPath(); g.arc(p.x, p.y, s * 0.18, 0, TAU); g.fillStyle = '#ffffff'; g.fill();
      g.restore();
    } else if (p.k === 'dring') {   // a knockdown: a ring of dust rolling out from where they hit the ground
      shockwave(g, { x: p.x, y: p.y, t: p.t, life: p.life, r: 8 + Math.sqrt(k) * p.s, id: p.id });
    } else if (p.k === 'burst') {   // streaks flying out from the hit: tapered, white at the head, warm behind
      const out = p.s * (0.25 + 0.9 * Math.sqrt(k)), fade = 1 - k;
      for (const [a, m] of p.rs) {
        const L = p.s * 0.7 * m * (1 - k * 0.6), c = Math.cos(a), s = Math.sin(a), x1 = p.x + c * out * m, y1 = p.y + s * out * m * 0.8, x0 = x1 - c * L, y0 = y1 - s * L * 0.8, w = 2.6 * m * fade + 0.4;
        const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, `rgba(255,214,120,0)`); gr.addColorStop(1, `rgba(255,252,240,${(0.95 * fade).toFixed(3)})`);
        g.fillStyle = gr; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 - s * w, y1 + c * w); g.lineTo(x1 + c * w * 1.2, y1 + s * w * 1.2); g.lineTo(x1 + s * w, y1 - c * w); g.closePath(); g.fill();
      }
    } else if (p.k === 'flash') {   // a small soft flash on the body at the moment of a hit
      const r = p.s * (0.7 + 0.5 * k), gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      gr.addColorStop(0, `rgba(255,255,250,${(0.9 * (1 - k)).toFixed(3)})`); gr.addColorStop(0.4, `rgba(255,236,190,${(0.45 * (1 - k)).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,236,190,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.fill();
    } else if (p.k === 'clash') {   // two attacks meeting: a white-hot four-point glint, long across the line they met on, warm round its core
      const fade = 1 - k, s = p.s * (k < 0.2 ? 0.5 + 2.5 * k : 1 - (k - 0.2) * 0.4), ax = p.a + Math.PI / 2;
      const core = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, s * 0.9);
      core.addColorStop(0, `rgba(255,255,250,${(0.95 * fade).toFixed(3)})`); core.addColorStop(0.35, `rgba(255,226,150,${(0.55 * fade).toFixed(3)})`); core.addColorStop(1, 'rgba(255,190,110,0)');
      g.fillStyle = core; g.beginPath(); g.arc(p.x, p.y, s * 0.9, 0, TAU); g.fill();
      for (const [a, L, w] of [[ax, 1.7, 0.16], [p.a, 0.9, 0.13], [ax + 0.78, 0.55, 0.08], [ax - 0.78, 0.55, 0.08]]) {
        const c = Math.cos(a), sn = Math.sin(a), l = s * L, ww = s * w;
        const gr = g.createLinearGradient(p.x - c * l, p.y - sn * l, p.x + c * l, p.y + sn * l);
        gr.addColorStop(0, 'rgba(255,240,200,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${fade.toFixed(3)})`); gr.addColorStop(1, 'rgba(255,240,200,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(p.x - c * l, p.y - sn * l); g.lineTo(p.x - sn * ww, p.y + c * ww); g.lineTo(p.x + c * l, p.y + sn * l); g.lineTo(p.x + sn * ww, p.y - c * ww); g.closePath(); g.fill();
      }
    } else if (p.k === 'ember') {   // a metal spark off a clash: a short streak along its way, white-hot cooling to orange, falling
      p.vy += 420 * dt;
      const sp = Math.hypot(p.vx, p.vy) || 1, L = p.s * (1 - k * 0.4), ux = p.vx / sp, uy = p.vy / sp, cg = Math.round(lerp(250, 150, k)), cb = Math.round(lerp(230, 60, k));
      g.strokeStyle = `rgba(255,${cg},${cb},${(1 - k * k).toFixed(3)})`; g.lineWidth = 1.8 * (1 - k) + 0.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(p.x - ux * L, p.y - uy * L); g.lineTo(p.x, p.y); g.stroke();
    } else if (p.k === 'crack') {   // a wall bounce: a jagged white-hot crack flashing along the wall
      const tx = -p.ny, ty = p.nx, L = p.s, fade = 1 - k;
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
      for (const [w, c] of [[4.5 * fade + 1, `rgba(255,236,190,${(0.5 * fade).toFixed(3)})`], [1.6, `rgba(255,255,255,${(0.95 * fade).toFixed(3)})`]]) {
        g.strokeStyle = c; g.lineWidth = w; g.beginPath();
        for (let i = 0; i <= 6; i++) { const u = (i / 6 - 0.5) * 2 * L, j = Math.sin(p.seed + i * 2.3) * 3.5 * (i % 6 ? 1 : 0); g.lineTo(p.x + tx * u - p.nx * j, p.y + ty * u * 0.8 - p.ny * j); }
        for (const u of [-0.45, 0.3]) { const bx = p.x + tx * u * L, by = p.y + ty * u * L * 0.8; g.moveTo(bx, by); g.lineTo(bx + p.nx * 7 + tx * 3, by + p.ny * 6 - 3); }
        g.stroke();
      }
      g.restore();
    } else if (p.k === 'chip') {   // a chip of stone off the wall: a little shaded flake tumbling down
      p.vy += 520 * dt;
      g.save(); g.translate(p.x, p.y); g.rotate(p.a + p.t * p.sp); g.globalAlpha *= 1 - k * k;
      g.fillStyle = '#b8a98e'; g.beginPath(); g.moveTo(-p.s, -p.s * 0.6); g.lineTo(p.s * 0.9, -p.s * 0.8); g.lineTo(p.s * 0.6, p.s * 0.7); g.lineTo(-p.s * 0.8, p.s * 0.5); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,250,236,0.6)'; g.beginPath(); g.moveTo(-p.s, -p.s * 0.6); g.lineTo(p.s * 0.9, -p.s * 0.8); g.lineTo(0, 0); g.closePath(); g.fill();
      g.restore();
    } else if (p.k === 'kostars') {   // KO: three little stars circling over their head, slowing and fading
      const f = F && F.f[p.i]; if (!f || (f.state === 'ko' && propReady('bit:star'))) continue;   // (in 3D: koStars3, round their head)
      const hx = f.x, hy = f.y - (f.z || 0) - 54, fade = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2;
      for (let s = 0; s < 3; s++) {
        const a = p.t * 4.2 * (1 - k * 0.5) + s * TAU / 3, x = hx + Math.cos(a) * 20, y = hy + Math.sin(a) * 6, z = 4.8 + Math.sin(a) * 1.1;
        g.save(); g.globalAlpha *= fade; starPath(g, x, y, z * 1.5, z * 0.65, 5, a); g.fillStyle = BD ? BK.yellow : '#ffd23c'; g.fill();
        starPath(g, x - 0.5, y - 0.6, z * 0.7, z * 0.3, 5, a); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fill(); g.restore();
      }
    } else if (p.k === 'spark') {   // little four-point stars flying out and fading (Swifty's art)
      g.save(); g.globalAlpha *= 1 - k; starPath(g, p.x, p.y, p.s * (1.4 - k * 0.6), p.s * 0.4, 4, 0); g.fillStyle = p.t % 0.2 < 0.1 ? '#ffffff' : p.col; g.fill(); g.restore();
    } else if (p.k === 'dust') {   // a soft puff that billows out and fades (light grey-white, never brown)
      const r = p.s * (0.6 + k * 1.1), a = (p.c ? 0.7 : 0.55) * (1 - k) * (k < 0.15 ? k / 0.15 : 1), gr = g.createRadialGradient(p.x - r * 0.25, p.y - r * 0.3, 0, p.x, p.y, r);
      gr.addColorStop(0, `rgba(252,250,246,${a.toFixed(3)})`); gr.addColorStop(0.65, `rgba(236,232,226,${(a * 0.6).toFixed(3)})`); gr.addColorStop(1, 'rgba(236,232,226,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.fill();
    } else if (p.k === 'splash') {   // the cup landing: a few small droplets flicking out and falling back
      g.fillStyle = p.ink ? `rgba(28,30,40,${(0.7 * (1 - k)).toFixed(3)})` : `rgba(108,62,28,${(0.7 * (1 - k)).toFixed(3)})`;   // (coffee; ink off Octo's tentacle)
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.5 + Math.sin(i * 7.3) * 0.4, r = p.s * (0.25 + 0.75 * k) * (0.7 + 0.3 * Math.sin(i * 3.1)); g.beginPath(); g.ellipse(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.6 - Math.sin(k * Math.PI) * (8 + 3 * (i % 2)), 1.8 * (1 - k * 0.5), 1.5 * (1 - k * 0.5), 0, 0, TAU); g.fill(); }
    }
  }
  v.fx = v.fx.filter(p => p.t < p.life);
}

// ---------------------------------------------------------------- HUD bits
const disp = (s) => bold() ? `${BOLD_W}${s}px ${BOLD_DISPLAY}` : `${s}px "Bungee", ${FONT}`;
const txt = (s, w = 700) => `${w} ${s}px ${bold() ? BOLD_FONT : FONT}`;
function panel(g, x, y, w, h, r, a = 0.82) {
  if (bold()) return bpanel(g, x, y, w, h, r, a);
  g.fillStyle = 'rgba(0,0,0,0.1)'; g.beginPath(); g.roundRect(x - 3, y + 3, w + 6, h + 6, r + 3); g.fill();
  g.fillStyle = `rgba(16,20,34,${a})`; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 1; g.beginPath(); g.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, r); g.stroke();
}
// a mascot's head in a round frame: its 3D model's portrait (art/model3d.js portrait3D, a bust at the size it's drawn),
// the plain face while the mood's is still being made, the 2D mascot till then (and with no WebGL). again: called once
// the portrait is made (a canvas drawn once redraws itself; one drawn every frame needs none)
export function fightHead(g, ch, x, y, r, ring, mood, t, again) {
  const BD = bold();
  g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = BD ? (ring || BK.surface2) : 'rgba(255,255,255,0.14)'; g.fill();
  if (!BD && ring) { g.strokeStyle = ring; g.lineWidth = 2.5; g.stroke(); }
  g.clip();
  const m = g.getTransform(), size = Math.ceil(2 * r * Math.hypot(m.a, m.b) / 8) * 8, port = md => M3.portrait3D ? M3.portrait3D(ch.id, { mood: md || '', size }, again) : null;
  const P = port(mood) || (mood ? port('') : null);
  if (P) g.drawImage(P, x - r, y - r, 2 * r, 2 * r);
  else { g.translate(x, y + (FACE_Y[ch.id] ?? 32) * r / 14); drawMascot(g, ch, { t, scale: r / 14, shadow: false, mood, look: [0.3, 0.2] }); }
  g.restore();
}
// the feed's and the buttons' little icons (r: their radius); no words anywhere
export function fightIcon(g, kind, r, col) {
  const BD = bold(), Y = BD ? BK.yellow : '#ffd23c', C = BD ? BK.cyan : '#7fe3ff', Rd = BD ? BK.red : '#ff4b3e', Wt = '#ffffff';
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  if (kitIcon(g, kind, r, col)) { g.restore(); return; }
  if (kind === 'light') { starPath(g, 0, 0, r * 0.62, r * 0.3, 5, -Math.PI / 2); g.fillStyle = col || Wt; g.fill(); }
  else if (kind === 'guard') {   // the front shield: a body and a thick arc in front of it
    g.fillStyle = alpha(col || Wt, 0.55); g.beginPath(); g.arc(-r * 0.22, 0, r * 0.26, 0, TAU); g.fill();
    g.strokeStyle = col || Wt; g.lineWidth = r * 0.22; g.beginPath(); g.arc(-r * 0.22, 0, r * 0.66, -1.05, 1.05); g.stroke();
  }
  else if (kind === 'ko') { starPath(g, 0, 0, r * 0.9, r * 0.45, 7, -Math.PI / 2); g.fillStyle = col || Rd; g.fill(); g.strokeStyle = Wt; g.lineWidth = r * 0.14; g.beginPath(); g.moveTo(-r * 0.22, -r * 0.22); g.lineTo(r * 0.22, r * 0.22); g.moveTo(r * 0.22, -r * 0.22); g.lineTo(-r * 0.22, r * 0.22); g.stroke(); }
  else if (kind === 'chit') {   // a counter hit: a big sharp red star, long white spikes behind it
    starPath(g, 0, 0, r * 1, r * 0.08, 4, Math.PI / 4); g.fillStyle = Wt; g.fill();
    starPath(g, 0, 0, r * 0.78, r * 0.3, 8, -Math.PI / 2); g.fillStyle = col || Rd; g.fill();
    starPath(g, 0, 0, r * 0.4, r * 0.17, 8, -Math.PI / 2 + Math.PI / 8); g.fillStyle = Y; g.fill();
  }
  else if (kind === 'ghit') {   // a hit on someone down: the body lying flat, a small star striking down onto it, the streak it came down along
    g.fillStyle = alpha(col || Wt, 0.75); g.beginPath(); g.roundRect(-r * 0.72, r * 0.18, r * 1.05, r * 0.3, r * 0.15); g.fill();
    g.beginPath(); g.arc(r * 0.56, r * 0.28, r * 0.21, 0, TAU); g.fill();
    g.strokeStyle = alpha(Y, 0.7); g.lineWidth = r * 0.12; g.beginPath(); g.moveTo(-r * 0.36, -r * 0.88); g.lineTo(-r * 0.12, -r * 0.3); g.stroke();
    starPath(g, -r * 0.05, -r * 0.08, r * 0.3, r * 0.13, 6, -Math.PI / 2); g.fillStyle = Y; g.fill();
  }
  else if (kind === 'down') {   // knocked down: a body lying flat on the ground, a little star over it
    g.fillStyle = col || Wt; g.beginPath(); g.roundRect(-r * 0.72, r * 0.02, r * 1.05, r * 0.34, r * 0.17); g.fill();
    g.beginPath(); g.arc(r * 0.56, r * 0.12, r * 0.24, 0, TAU); g.fill();
    g.strokeStyle = alpha(col || Wt, 0.55); g.lineWidth = r * 0.1; g.beginPath(); g.moveTo(-r * 0.9, r * 0.56); g.lineTo(r * 0.9, r * 0.56); g.stroke();
    starPath(g, r * 0.3, -r * 0.42, r * 0.3, r * 0.12, 5, -Math.PI / 2); g.fillStyle = Y; g.fill();
  }
  else if (kind === 'sudden') {   // the edge tiles crumbling: a ring with a gap and a falling piece
    g.strokeStyle = col || Wt; g.lineWidth = r * 0.22; g.beginPath(); g.arc(0, -r * 0.1, r * 0.55, Math.PI * 0.75, Math.PI * 2.25); g.stroke();
    g.fillStyle = col || Wt; g.save(); g.translate(0, r * 0.62); g.rotate(0.4); g.fillRect(-r * 0.16, -r * 0.1, r * 0.32, r * 0.2); g.restore();
  }
  else if (kind === 'pause') { g.fillStyle = col || Wt; g.beginPath(); g.roundRect(-r * 0.36, -r * 0.42, r * 0.24, r * 0.84, r * 0.06); g.roundRect(r * 0.12, -r * 0.42, r * 0.24, r * 0.84, r * 0.06); g.fill(); }
  g.restore();
}

// ---------------------------------------------------------------- the frame
// F: the fight; dt: real seconds since the last frame (0 when paused); o: { humans: [fighter indexes this screen's
// players control], touch: fight-ui.js touch layout or null, paused }
// o: { humans: [fighter indexes this screen's players control], keys: [{ fi, L (fight-keys.js layout), src: 'key'|'pad',
// held }] for the key display, and for a small clip (fight-moves.js) g, w, h, dpr (its own canvas), cam (a fixed camera
// { x, y, z }) and hud: false; inset: px kept clear at the bottom (fight-touch.js touchInset) }
export function drawFight(F, dt, o = {}) {
  const v = viewOf(F), g = o.g || ctx, BD = bold(), humans = o.humans || [], VW = o.w || W, VH = o.h || H, D = o.dpr || DPR, clip = o.hud === false;
  v.t += dt; v.cardUp = !!o.results;   // (the results card is up: it has the winner's portrait, so the canvas's goes)
  if (F.phase !== v.phase) { v.phase = F.phase; v.phaseT = 0; if (F.phase === 'roundEnd' && F.roundWinner != null) v.pipT[F.roundWinner] = v.t; } else v.phaseT += dt;
  momentTick(v, F);
  v.shake = Math.max(0, v.shake - dt * 2.2);
  g.setTransform(D, 0, 0, D, 0, 0);
  const HS = hudScale(), hudH = clip ? 0 : (hudCard(W / HS).ch - 12) * HS + SAFE.t, pad = clip ? 0 : 12;
  const vb = { x: pad, y: hudH, w: VW - pad * 2, h: VH - hudH - pad - (clip ? 0 : 50 * HS) - (o.inset || 0) };   // (o.inset: px more kept clear at the bottom: the touch controls in portrait, fight-touch.js)
  const C = o.cam || camera(F, v, dt, vb);
  momentHold(g, v, F, VW, VH, D, !clip && !o.g, () => {   // (a KO holds the frame a moment: draw-moments.js)
  drawVoid(g, v.t, C, VW, VH, D);
  const zs = zstep(C.z * D);
  const sh = settings.shake && !clip ? v.shake * 6 : 0, shx = Math.sin(v.t * 73) * sh, shy = Math.cos(v.t * 61) * sh;
  g.save(); g.translate(vb.x + vb.w / 2 + shx, vb.y + vb.h / 2 + shy); g.scale(C.z, C.z); g.translate(-C.x, -C.y);
  drawUnder(g, F, v.t, zs);
  drawLowClouds(g, F, v.t, D);
  drawTop(g, F, v.t, zs);
  groundObjs(g, F, v);
  // the fighters, the solids and the kits' things, nearer ones over farther
  const things = [...F.f.map(f => ({ y: f.y, d: () => fighter(g, F, v, f, humans) })),
    ...((F.A && F.A.solids) || []).map(o => ({ y: o.y + (o.shape === 'box' ? o.h / 2 - 4 : o.r * 0.4), d: () => drawSolid(g, o) })),
    ...kitThings(F, v, g)];
  things.sort((a, b) => a.y - b.y).forEach(t => t.d());
  drawFront(g, F, v.t, zs);   // (the wall's front stretch over them, the vents' heat)
  particles(g, v, dt, F);
  stopWorld(g, F, v, humans, VW, VH, D);
  if (!clip) { momentMark(g, v, F, D); momentWash(g, F, v, VW, VH, D); momentSpot(g, F, v, VW, VH, D); }
  g.restore();
  });
  if (!clip) momentAfter(g, v, VW, VH, D);
  v.names = o.names || null;   // (online: the players' names on the cards)
  v.reserve = o.inset ? o.inset + SAFE.b : 0;   // (the feed above the touch controls in portrait)
  if (!clip) hud(g, F, v, dt, HS, humans, o.keys || []);
}

// Stop the World: while someone's frozen the world goes soft grey (half the colour drained out of it, easing in and out,
// barely dimmed) and only the ones still free (Duke) are drawn again over it in colour
const ease01 = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
function stopWorld(g, F, v, humans, VW, VH, D) {
  const fr = F.f.find(f => f.state === 'frozen'); if (!fr || settings.reduced) return;
  const d = fr.dur || 1.1, amt = ease01(fr.t / 0.25) * ease01((d - fr.t) / 0.25); if (amt <= 0.01) return;
  g.save(); g.setTransform(D, 0, 0, D, 0, 0);
  g.globalCompositeOperation = 'saturation'; g.fillStyle = `rgba(128,128,128,${(0.5 * amt).toFixed(3)})`; g.fillRect(0, 0, VW, VH);
  g.globalCompositeOperation = 'source-over'; g.fillStyle = `rgba(30,34,60,${(0.04 * amt).toFixed(3)})`; g.fillRect(0, 0, VW, VH);
  g.restore();
  for (const f of F.f) if (f.state !== 'frozen' && !f.gone) { g.save(); g.globalAlpha *= amt; fighter(g, F, v, f, humans); g.restore(); }
}
function hud(g, F, v, dt, HS, humans, keys) {
  const BD = bold(), top = 10 + SAFE.t, TXT = BD ? BK.text : '#ffffff', SOFT = BD ? BK.muted : '#9aa3bd';
  g.save(); g.scale(HS, HS);
  momentUnder(g, F, v, dt, W / HS, H / HS);   // (the match won: streamers, the big portrait; under the cards)
  const Wh = W / HS, { cw, ch, row } = hudCard(Wh), PR = !!F.cfg.practice, need = PR ? 0 : winsToTake(F.cfg);   // (PR: the training room, js/fight-practice.js: no rounds, no clock)
  F.f.forEach((f, i) => {
    const right = i === 1, x = right ? Wh - 12 - cw : 12, y = top / HS * HS, C = charOf(f.id), col = PCOL[i];
    const hurtT = v.t - v.pipT[i];
    panel(g, x, y, cw, ch, 16, 0.84);
    if (F.phase === 'roundEnd' && F.roundWinner === i) { g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); g.roundRect(x + 1.5, y + 1.5, cw - 3, ch - 3, BD ? Math.min(16, BK.r) - 1 : 15); g.stroke(); }
    // portrait, name, BOT
    const px = right ? x + cw - 36 : x + 36, py = y + 35;
    fightHead(g, C, px, py, 25, col, moodOf(F, f), v.t);
    const isBot = F.cfg.bots && F.cfg.bots[i] != null;
    g.font = txt(16, 700); g.fillStyle = TXT; g.textBaseline = 'middle'; g.textAlign = right ? 'right' : 'left';
    const nx = right ? px - 34 : px + 34;
    const nm = v.names && v.names[i] ? String(v.names[i]).slice(0, 14) : '', tag = nm ? nm : PR ? (i ? 'DUMMY' : 'YOU') : isBot ? 'BOT' : humans.length > 1 || (F.cfg.bots && F.cfg.bots.every(b => b == null)) ? 'P' + (i + 1) : '';
    g.fillText(C.name, nx, y + 17);
    const nw = g.measureText(C.name).width;
    if (tag) { g.font = txt(10, 800); const tw = g.measureText(tag).width + 10, tx = right ? nx - nw - 8 - tw : nx + nw + 8; g.fillStyle = isBot && !nm ? (BD ? BK.surface2 : 'rgba(255,255,255,0.18)') : col; g.beginPath(); g.roundRect(tx, y + 10, tw, 15, 7); g.fill(); g.fillStyle = TXT; g.textAlign = 'center'; g.fillText(tag, tx + tw / 2, y + 18); }
    // the rounds won, at the far end of the name row: a gold star each, an empty socket for each still to win (the
    // newest pops in as the round is won)
    for (let k = 0; k < need; k++) {
      const sp = need > 3 ? 16 : 19, cx = right ? x + 16 + k * sp : x + cw - 16 - k * sp, on = k < f.wins, pk = on && k === f.wins - 1 ? hurtT : 9;
      const pop = pk < 0.6 ? 1 + 0.7 * Math.sin(Math.min(1, pk / 0.45) * Math.PI) * (1 - pk / 0.6) : 1, R = (need > 3 ? 7 : 8) * pop;
      if (on) {
        if (pk < 0.5 && !settings.reduced) { g.save(); g.globalAlpha = 1 - pk / 0.5; starPath(g, cx, y + 17, R * 2.3, R * 0.5, 8, pk * 2); g.fillStyle = '#ffffff'; g.fill(); g.restore(); }
        if (BD) { starPath(g, cx + 1, y + 18.5, R, R * 0.5, 5, -Math.PI / 2); g.fillStyle = BK.ink; g.fill(); }
        starPath(g, cx, y + 17, R, R * 0.5, 5, -Math.PI / 2); g.fillStyle = BD ? BK.yellow : '#ffc93c'; g.fill();
        if (!BD) { g.strokeStyle = '#b8860b'; g.lineWidth = 1; g.stroke(); }
      } else {
        starPath(g, cx, y + 17, R * 0.92, R * 0.46, 5, -Math.PI / 2); g.fillStyle = BD ? BK.well : 'rgba(0,0,0,0.35)'; g.fill();
        g.strokeStyle = BD ? BK.line : 'rgba(255,255,255,0.25)'; g.lineWidth = 1.2; g.stroke();
      }
    }
    // health: a bar in their colour, a pale trail draining after it
    const bx = right ? x + 12 : px + 34, bw = cw - 12 - 34 - 34 + 0, by = y + 29, bh = 15;
    const hp = clamp(f.hp / f.maxHp, 0, 1), hold = v.t - v.hurt[i].t < 0.45;   // (the trail holds a moment, then drains)
    if (!hold) v.hp[i] = Math.max(f.hp, lerp(v.hp[i], f.hp, 1 - Math.exp(-3.2 * dt)));
    if (f.hp > v.hp[i]) v.hp[i] = f.hp;
    const trail = clamp(v.hp[i] / f.maxHp, 0, 1);
    g.fillStyle = BD ? BK.well : 'rgba(0,0,0,0.45)'; g.beginPath(); g.roundRect(bx, by, bw, bh, 7); g.fill();
    const seg = (a, b, fill) => { if (b <= a) return; const x0 = right ? bx + bw * (1 - b) : bx + bw * a, w = bw * (b - a); g.fillStyle = fill; g.beginPath(); g.roundRect(x0, by, w, bh, Math.min(7, w / 2)); g.fill(); };
    seg(0, trail, hold ? (BD ? '#ffe2dc' : 'rgba(255,230,225,0.9)') : (BD ? '#ff8f80' : 'rgba(255,120,105,0.85)'));   // (the chunk just lost: pale, then red as it drains)
    const low = hp < 0.3, hcol = low && Math.sin(v.t * 10) > 0 ? (BD ? BK.red : '#ff4b3e') : col;
    seg(0, hp, hcol);
    const HB = v.hb && v.hb[i], ha = HB ? v.t - HB.t : 9;   // healed: the new health green, a light sweeping up it, settling into their colour
    if (ha < 0.9) {
      const lo = clamp(HB.lo / f.maxHp, 0, hp), k = ha / 0.9;
      g.save(); g.globalAlpha = 1 - k * k; seg(lo, hp, BD ? BK.green || '#4cc95a' : 'rgba(92,214,104,0.95)'); g.restore();
      const u = clamp(ha / 0.35, 0, 1); if (u < 1) { const q = lo + (hp - lo) * u, w = 0.035; g.save(); g.globalAlpha = Math.sin(u * Math.PI); seg(Math.max(lo, q - w), Math.min(hp, q + w), BD ? '#eaffd8' : 'rgba(236,255,214,0.95)'); g.restore(); }
    }
    if (!BD && hp > 0) { const x0 = right ? bx + bw * (1 - hp) : bx; g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.roundRect(x0 + 2, by + 2, Math.max(0, bw * hp - 4), 4, 2); g.fill(); }
    if (BD && hp > 0) { const x0 = right ? bx + bw * (1 - hp) : bx; g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x0 + 4, by + 3, Math.max(0, bw * hp - 8), 3); }   // (flat: one soft band of light along the top, no gloss)
    // a notch every quarter, so a chunk of health reads at a glance
    g.fillStyle = BD ? alpha(BK.ink, 0.45) : 'rgba(0,0,0,0.3)';
    for (const q of [0.25, 0.5, 0.75]) g.fillRect(Math.round(bx + bw * q) - 1, by + 3, 2, bh - 6);
    // under the health, from the portrait's side: the three moves and the evade as little chips, each with its cooldown
    const at = (a, w) => right ? bx + bw - a - w : bx + a, ry = by + bh + 5;
    {
      let ox = 0; const SP = specialOf(f.id);
      // (a narrow screen, a phone upright: the chips get their own row across the card, under the portrait, a touch smaller)
      const k = row ? Math.min(1, (cw - 24) / CHIPS_W) : 1, cy = row ? y + 66 + 21 * k : ry + 20, ax = (a) => row ? (right ? x + cw - 12 - a : x + 12 + a) : at(a, 0);
      ACTS4.forEach(a => { const mk = KIT_ACT[a], r = (mk === SP ? 21 : 18) * k, cx = ax(ox + r); moveChip(g, cx, cy, r, f, mk, col, right ? -1 : 1); ox += r * 2 + (mk === 'evade' ? 0 : 12 * k); });
    }
    // Bugdroid's battery: a little cell per charge under the chips, filling as it recharges
    const BT = f.stats && f.stats.battery;
    if (BT) {
      const my = ry + 44, cw2 = 11, chh = 6;
      for (let k = 0; k < BT.max; k++) {
        const x = at(k * (cw2 + 5), cw2 + 2), q = clamp((f.bat || 0) - k, 0, 1), G = '#3ddc84';
        g.fillStyle = BD ? BK.well : 'rgba(0,0,0,0.4)'; g.beginPath(); g.roundRect(x, my, cw2, chh, 2); g.fill(); g.fillRect(x + cw2, my + 1.5, 2, chh - 3);
        if (q > 0) { g.fillStyle = q >= 1 ? G : alpha(G, 0.45); g.beginPath(); g.roundRect(x + 1, my + 1, (cw2 - 2) * q, chh - 2, 1.5); g.fill(); }
      }
    }
  });
  // each human's keys (or pad) in the bottom corner on their side, lighting up in their colour while held; dimmer after
  // the first round
  for (const K of keys) {
    const right = K.fi === 1, col = PCOL[K.fi], u = 40, Hh = H / HS;
    const base = F.round > 1 || F.phase === 'over' ? 0.4 : 0.85, id = F.f[K.fi] && F.f[K.fi].id;
    const sz = K.src === 'pad' ? padSize(u) : keysSize(K.L, u), y = Hh - sz.h - 14 - SAFE.b / HS, f = F.f[K.fi];
    g.save(); g.translate(right ? Wh - 16 - sz.w : 16, y);
    if (K.src === 'pad') drawPad(g, K.held, col, u, base, id, f); else drawKeys(g, K.L, K.held, col, u, base, id, f);
    g.restore();
    { const lh = legendSize(u).h; g.save(); g.translate(right ? Wh - 16 - legendSize(u).w : 16, y - lh - 6); drawLegend(g, id, K.src === 'pad' ? 'pad' : K.L, K.held, col, u, base, f, right); g.restore(); }   // (the moves' names over the keys, each with its key, its icon and its cooldown)
  }
  // the round clock in the middle (in sudden death a pulsing red badge with the damage multiplier), the round's number on
  // a tab under it
  const cx = Wh / 2, cy = top + 30, r = 26, cwid = 66, chh = 52;
  if (F.phase === 'sudden') {
    const p = 0.5 + 0.5 * Math.sin(v.t * 7), sw = cwid * (1 + 0.06 * p), shh = chh * (1 + 0.06 * p);
    if (BD) { g.fillStyle = BK.ink; g.beginPath(); g.roundRect(cx - sw / 2 + 2, cy - shh / 2 + 3, sw, shh, 16); g.fill(); }
    g.fillStyle = alpha(BD ? BK.red : '#ff4b3e', 0.8 + 0.2 * p); g.beginPath(); g.roundRect(cx - sw / 2, cy - shh / 2, sw, shh, 16); g.fill();
    g.font = disp(20); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff';
    g.fillText('×' + (F.dmgMul || 1.5).toFixed(1), cx, cy + 1.5);
  } else {
    panel(g, cx - cwid / 2, cy - chh / 2, cwid, chh, 16, 0.86);
    const s = Math.ceil(F.clock ?? 0), warn = !PR && s <= 10 && F.phase === 'fight', beat = warn ? 1 + 0.12 * Math.max(0, Math.sin(v.t * Math.PI * 2)) : 1;
    g.save(); g.translate(cx, cy + 1.5); g.scale(beat, beat);
    g.font = disp(s >= 100 || PR ? 22 : 28); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = warn ? (BD ? BK.red : '#ff6b5e') : TXT;
    g.fillText(PR ? '∞' : String(s), 0, 0);
    g.restore();
  }
  if (!PR) {   // the round: a small tab hanging under the clock (R1, R2 ...)
    const lbl = 'R' + F.round; g.font = txt(11, 800); const tw = g.measureText(lbl).width + 14, ty = cy + chh / 2 - 2;
    g.fillStyle = BD ? BK.surface2 : 'rgba(40,36,90,0.92)'; g.beginPath(); g.roundRect(cx - tw / 2, ty, tw, 17, [0, 0, 8, 8]); g.fill();
    g.fillStyle = BD ? BK.yellow : '#ffd23c'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(lbl, cx, ty + 9);
  }
  // the round's end: a burst over the winner's new pip is in the card; the loser's side dims a touch
  // the icon feed at the bottom middle
  feed(g, F, v, dt, Wh, H / HS, humans);
  v.reserveH = v.reserve ? v.reserve / HS + 50 : 0;   // (the touch controls' room at the bottom, in HUD units: the round's score band sits above it)
  momentOver(g, F, v, Wh, H / HS);   // (the round intro, 3 2 1, the start: draw-moments.js)
  g.restore();
}
function feed(g, F, v, dt, Wh, Hh, humans) {
  const BD = bold(), FH = 36, top = Hh - FH - 12 - (v.reserve || SAFE.b) / hudScale() - (v.reserve ? 50 : 0),   // (touch upright: above the buttons, touchInset leaves out the 50 the arena keeps anyway)
    live = v.feed.filter(e => v.t - e.t < FEED_T);
  const parts = e => [...(e.a >= 0 ? ['h:' + e.a] : []), 'i', ...(e.b >= 0 ? ['>', 'h:' + e.b] : [])];
  const PW = p => p[0] === 'h' ? 26 : p === 'i' ? 28 : 7;
  const ws = live.map(e => 14 + parts(e).reduce((s, p) => s + PW(p), 0) + 4 * (parts(e).length - 1));
  const shown = ws.slice(-FEED_SHOW), total = shown.reduce((s, w) => s + w, 0) + 8 * Math.max(0, shown.length - 1);
  let x = Wh / 2 + total / 2;
  for (let k = live.length - 1; k >= 0; k--) {
    const e = live[k], w = ws[k], age = v.t - e.t; x -= w; const tx = x; x -= 8;
    if (e.x == null) e.x = tx + 80;
    e.x = lerp(e.x, tx, 1 - Math.exp(-11 * dt));
    e.al = live.length - 1 - k >= FEED_SHOW ? Math.max(0, e.al - dt * 4) : clamp(age / 0.25, 0, 1) * clamp((FEED_T - age) / 0.7, 0, 1);
    if (e.al < 0.01) continue;
    g.save(); g.globalAlpha = e.al;
    const mine = humans.includes(e.a) ? e.a : humans.includes(e.b) ? e.b : -1;
    panel(g, e.x, top, w, FH, FH / 2, mine >= 0 ? 0.86 : 0.7);
    if (mine >= 0) { g.strokeStyle = PCOL[mine]; g.lineWidth = 2; g.beginPath(); g.roundRect(e.x + 1, top + 1, w - 2, FH - 2, BD ? Math.min(FH / 2 - 1, BK.r - 1) : FH / 2 - 1); g.stroke(); }
    let px = e.x + 7; const cy = top + FH / 2;
    for (const p of parts(e)) {
      const pw = PW(p), mx = px + pw / 2;
      if (p[0] === 'h') { const i = +p.slice(2), f = F.f[i]; fightHead(g, charOf(f.id), mx, cy, 12, PCOL[i], p === 'h:' + e.b ? 'dizzy' : null, v.t); }
      else if (p === 'i') { g.save(); g.translate(mx, cy); fightIcon(g, e.kind, 13); g.restore(); }
      else { g.strokeStyle = BD ? BK.muted : 'rgba(255,255,255,0.55)'; g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(mx - 2, cy - 4); g.lineTo(mx + 2, cy); g.lineTo(mx - 2, cy + 4); g.stroke(); }
      px += pw + 4;
    }
    g.restore();
  }
  v.feed = v.feed.filter(e => v.t - e.t < FEED_T + 1);
}

// ---------------------------------------------------------------- the keys and pads (the HUD and the setup screen)
// a layout's keys as they sit on the keyboard (fight-keys.js), u px a key; a key's action as a tiny icon in its corner;
// held: { up, left, down, right, light, heavy, special, guard } lights them in col; base: the alpha of the rest
// the keys: light, heavy and special fire move1..3, guard the evade
export const KIT_ACT = { light: 'move1', heavy: 'move2', special: 'move3', guard: 'evade' };
const ACTS4 = ['light', 'heavy', 'special', 'guard'];
const actIcon = (a, id) => {
  const M = FIGHTERS[id] && FIGHTERS[id].moves;
  if (KIT_ACT[a]) { const mv = M && M[KIT_ACT[a]]; return (mv && mv.icon) || (a === 'guard' ? 'guard' : 'light'); }
  return a;
};
// a move's short name for the key display
const SHORT = { jab: 'Jab', stopworld: 'Stop World', hotjava: 'Hot Java', gc: 'GC' };
export const shortName = mv => mv ? mv.short || SHORT[mv.icon] || mv.name : '';
// how much of a move's cooldown is left (1: just used or going on, 0: ready); Duke's evade: its charges instead
export function cdLeft(f, mk) {
  if (!f || !mk) return 0;
  const St = FIGHTERS[f.id], mv = St && St.moves[mk]; if (!mv) return 0;
  if (f.move === mk && f.state !== 'recover') return 1;
  if (mk === 'evade' && f.psnT > 0) return 1;   // (poisoned: no evade till it wears off, fight.js poison: locked, a venom drop on it)
  const C = chargesOf(f, mk); if (C) return C.n > 0 ? 0 : 1 - C.q;
  const c = (f.cd || [])[['move1', 'move2', 'move3', 'evade'].indexOf(mk)] || 0;
  return mv.cooldown ? clamp(c / mv.cooldown, 0, 1) : c > 0 ? 1 : 0;
}
// an evade with charges (Duke's): { n, max, q: the next one's refill 0..1 }
export function chargesOf(f, mk = 'evade') {
  const E = f && FIGHTERS[f.id] && FIGHTERS[f.id].moves[mk]; if (!E || !E.charges) return null;
  const n = f.ev ?? E.charges; return { n, max: E.charges, q: n < E.charges && E.recharge ? clamp(1 - (f.evT || 0) / E.recharge, 0, 1) : 0 };
}
// ---- cooldowns at a glance. Everywhere a move shows (the card's chips, the keys' legend, the keys, the touch buttons):
// ready, it's in full colour; cooling, it's greyed with a dark sweep that a clock hand clears clockwise from 12 as it
// comes back, the seconds left on it ("1.2", "3"), and the moment it's back a little pop: it swells, a white ring flies
// off and a sparkle glints. Charges (Duke's evade) as pips. The special (the longest cooldown of the three) is a touch
// bigger with a little gold star. All of it read from the move data and f.cd, whatever the order.
const CD_KEYS = ['move1', 'move2', 'move3', 'evade'];   // (f.cd's order, fight.js)
// the special of a three-move fighter: the move with the longest cooldown (ties: the later key)
export function specialOf(id) {
  const M = FIGHTERS[id] && FIGHTERS[id].moves; if (!M) return null;
  let best = null, b = -1; for (const mk of ['move1', 'move2', 'move3']) { const c = (M[mk] && M[mk].cooldown) || 0; if (M[mk] && c >= b) { b = c; best = mk; } }
  return best;
}
// seconds till a move's back (0: ready): its cooldown left (while it's going on: the whole one still to come); a charged
// one with none left: the next charge's
export function cdSecs(f, mk) {
  if (!f || !mk) return 0;
  const mv = FIGHTERS[f.id] && FIGHTERS[f.id].moves[mk]; if (!mv) return 0;
  if (mk === 'evade' && f.psnT > 0) return Math.max(f.psnT, (f.cd || [])[3] || 0);   // (poisoned: till it wears off)
  const C = chargesOf(f, mk); if (C) return C.n > 0 ? 0 : Math.max(0, f.evT || 0);
  const c = (f.cd || [])[CD_KEYS.indexOf(mk)] || 0;
  return f.move === mk && f.state !== 'recover' ? Math.max(c, mv.cooldown || 0) : c;
}
// the poison status's lock on the evade: a glossy drop of venom hanging over its icon, sickly green with a dark rim and
// a glint, wobbling a touch (s: its height)
export const venomLocked = (f, mk) => !!(f && mk === 'evade' && f.psnT > 0);
export function venomDrop(g, x, y, s) {
  const BD = bold(), t = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000, w = s * (0.62 + 0.03 * Math.sin(t * 7));
  g.save(); g.translate(x, y);
  const path = () => { g.beginPath(); g.moveTo(0, -s * 0.55); g.bezierCurveTo(w * 0.15, -s * 0.3, w * 0.5, -s * 0.02, w * 0.5, s * 0.17); g.arc(0, s * 0.17, w * 0.5, 0, Math.PI); g.bezierCurveTo(-w * 0.5, -s * 0.02, -w * 0.15, -s * 0.3, 0, -s * 0.55); g.closePath(); };
  path(); g.fillStyle = BD ? '#5fbf3a' : '#7fd64a'; g.fill();
  g.lineWidth = Math.max(1, s * 0.09); g.strokeStyle = BD ? BK.ink || '#1d2a14' : '#2f6a1e'; g.stroke();
  g.fillStyle = 'rgba(160,90,210,0.45)'; g.beginPath(); g.arc(w * 0.12, s * 0.28, w * 0.22, 0, TAU); g.fill();   // (the venom's purple sheen low in it)
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(-w * 0.17, s * 0.06, w * 0.09, s * 0.13, -0.4, 0, TAU); g.fill();
  g.restore();
}
export const secsText = s => s <= 0.05 ? '' : s < 2 ? s.toFixed(1) : String(Math.round(s));
// how fresh a move's coming back is: 1 the moment it's ready (or a charge comes back), easing to 0 over POP_T (kept per
// fighter, so every place that draws it pops together; f null: 0)
const POP_T = 0.5, popSeen = new WeakMap();
const nowS = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
export function readyPop(f, mk, left, C) {
  if (!f || !mk) return 0;
  let m = popSeen.get(f); if (!m) popSeen.set(f, m = {});
  const t = nowS(), s = C ? C.n : left > 0 ? 0 : 1, o = m[mk];
  if (!o) { m[mk] = { s, t: -9 }; return 0; }
  if (s > o.s) o.t = t;
  o.s = s;
  return clamp(1 - (t - o.t) / POP_T, 0, 1);
}
export const popBump = p => p > 0 ? 1 + 0.22 * Math.sin((1 - p) * Math.PI) : 1;   // (the swell: 1 → 1.22 → 1)
// the cooldown still to come as a dark sweep over a round thing: the part from the clock hand on round to 12
function sweep(g, x, y, r, left) {
  if (left <= 0.005) return;
  const a0 = -Math.PI / 2 + TAU * (1 - left);
  g.fillStyle = 'rgba(10,8,26,0.6)'; g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, a0, -Math.PI / 2 + TAU); g.closePath(); g.fill();
}
// the part come back as an arc round the rim in the player's colour, a bright dot on the clock hand
export function cdRim(g, x, y, r, left, col, lw = 2) {
  if (left <= 0.005) return;
  const a1 = -Math.PI / 2 + TAU * (1 - left);
  g.save(); g.lineCap = 'round'; g.lineWidth = lw;
  g.strokeStyle = 'rgba(10,8,26,0.55)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  if (left < 0.995) { g.strokeStyle = col; g.beginPath(); g.arc(x, y, r, -Math.PI / 2, a1); g.stroke(); }
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x + Math.cos(a1) * r, y + Math.sin(a1) * r, lw * 0.75, 0, TAU); g.fill();
  g.restore();
}
// the seconds left, bold white with a dark edge, centred on x, y
export function cdNum(g, x, y, s, size) {
  const tx = secsText(s); if (!tx) return;
  g.save(); g.font = `800 ${Math.round(size)}px ${bold() ? BOLD_FONT : FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = Math.max(2.5, size * 0.3); g.strokeStyle = 'rgba(10,8,26,0.9)'; g.strokeText(tx, x, y + size * 0.05);
  g.fillStyle = '#ffffff'; g.fillText(tx, x, y + size * 0.05); g.restore();
}
// the moment it's back (p 1 → 0): a white flash over it, a ring flung out and a sparkle glinting on its top right
export function readyGlint(g, x, y, r, p) {
  if (p <= 0) return;
  const q = 1 - p;
  g.save(); g.globalAlpha *= p;
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.lineWidth = 1.5 + 2.5 * p; g.strokeStyle = '#ffffff'; g.beginPath(); g.arc(x, y, r * (1 + 0.7 * q), 0, TAU); g.stroke();
  starPath(g, x + r * 0.72, y - r * 0.72, r * (0.35 + 0.35 * Math.sin(q * Math.PI)), r * 0.09, 4, q * 1.4); g.fillStyle = '#ffffff'; g.fill();
  g.restore();
}
// the special's mark: a little gold star with a dark edge
export function specialStar(g, x, y, s) {
  g.save(); starPath(g, x, y, s, s * 0.45, 5, -Math.PI / 2);
  g.lineJoin = 'round'; g.lineWidth = Math.max(1.5, s * 0.35); g.strokeStyle = 'rgba(10,8,26,0.85)'; g.stroke();
  g.fillStyle = bold() ? BK.yellow : '#ffc93c'; g.fill(); g.restore();
}
// a charge's pips (Duke's evade): filled while there, the next one filling; across (or down, vert)
function pips(g, x, y, C, col, s = 2.6, vert = false) {
  for (let k = 0; k < C.max; k++) {
    const d = (k - (C.max - 1) / 2) * s * 2.7, px = vert ? x : x + d, py = vert ? y + d : y, q = k < C.n ? 1 : k === C.n ? C.q : 0;
    g.beginPath(); g.arc(px, py, s + 0.8, 0, TAU); g.fillStyle = 'rgba(10,8,26,0.7)'; g.fill();
    if (q > 0) { g.beginPath(); g.arc(px, py, s * (k < C.n ? 1 : 0.4 + 0.6 * q), 0, TAU); g.fillStyle = k < C.n ? col : alpha(col, 0.55); g.fill(); }
  }
}
// one move as a round chip (the HUD card's, for everyone on screen): its icon, greyed with the sweep, the seconds and the
// rim filling while it cools, the pop when it's back; Duke's charges beside it (side: which way is out), his heat round it
function moveChip(g, x, y, r, f, mk, col, side = 1) {
  const BD = bold(), mv = FIGHTERS[f.id].moves[mk], left = cdLeft(f, mk), C = chargesOf(f, mk), p = readyPop(f, mk, left, C), sp = specialOf(f.id) === mk;
  g.save(); g.translate(x, y); const b = popBump(p); g.scale(b, b);
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fillStyle = left > 0 ? (BD ? BK.well : 'rgba(0,0,0,0.5)') : col; g.fill();
  if (left <= 0) { g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.5; g.stroke(); }
  g.save(); if (left > 0) g.globalAlpha *= 0.45; fightIcon(g, mv ? mv.icon : mk, r * 0.74, '#ffffff'); g.restore();
  sweep(g, 0, 0, r, left);
  cdRim(g, 0, 0, r, left, col, 2);
  if (left > 0) cdNum(g, 0, 0, cdSecs(f, mk), r * 1.05);
  if (venomLocked(f, mk)) venomDrop(g, r * 0.62, -r * 0.6, r * 0.8);
  readyGlint(g, 0, 0, r, p);
  if (sp) specialStar(g, r * 0.78, -r * 0.78, r * 0.36);
  g.restore();
  if (C) pips(g, x + side * (r + 8), y, C, col, 3.4, true);
  if (mv && mv.hot && f) heatRing(g, x, y, r + 3, f);
}
// Duke's HotSpot: how hot his jab is, a warm arc filling round its chip (or along its row), amber to red-orange, one
// notch a level, glowing at full heat (f null or cold: nothing)
function heatRing(g, x, y, r, f) {
  const H = FIGHTERS[f.id].moves.move1.hot, h = clamp((f.hot || 0) / H.max, 0, 1), BD = bold();
  if (h <= 0.02) return;
  const col = h >= 0.99 ? (BD ? BK.red : '#ff5a1f') : (BD ? BK.yellow : '#ffb347');
  g.save(); g.lineCap = 'round'; g.lineWidth = 2.6;
  g.strokeStyle = BD ? BK.well : 'rgba(0,0,0,0.45)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  g.strokeStyle = col; g.beginPath(); g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * h); g.stroke();
  if (h >= 0.99 && !BD) { g.globalAlpha *= 0.35; g.lineWidth = 6; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); }
  g.restore();
}
// the moves (a three-move fighter's), a row each over the keys: the key in the player's colour, the move's icon on a
// round chip, its name (the special's with its star) and, cooling, the row greyed with a bar filling back up in their
// colour, the chip swept and the seconds left at the row's end; back, the row flashes and a glint runs along it
export const legendSize = u => ({ w: u * 5, h: u * 0.72 * 4 + 3 * 3 });
export function drawLegend(g, id, L, held, col, u, base = 1, f = null, right = false) {
  const BD = bold(), M = FIGHTERS[id].moves, rh = u * 0.72, W = legendSize(u).w, TX = BD ? BK.text : '#ffffff', MU = BD ? BK.muted : '#9aa3bd', SP = specialOf(id);
  ACTS4.forEach((a, k) => {
    const mk = KIT_ACT[a], mv = M[mk], y = k * (rh + 3), on = !!(held && held[a]), left = cdLeft(f, mk), C = chargesOf(f, mk), p = readyPop(f, mk, left, C), cool = left > 0;
    g.save(); g.globalAlpha = on || cool || p > 0 ? 1 : Math.max(base, 0.9);
    if (BD) bpanel(g, 0, y, W, rh, rh / 2, 0.85); else { g.fillStyle = 'rgba(16,20,34,0.78)'; g.beginPath(); g.roundRect(0, y, W, rh, rh / 2); g.fill(); }
    if (cool) { g.fillStyle = BD ? BK.well : 'rgba(0,0,0,0.45)'; g.beginPath(); g.roundRect(0, y, W, rh, rh / 2); g.fill(); g.fillStyle = alpha(col, 0.4); g.beginPath(); g.roundRect(0, y, Math.max(rh, W * (1 - left)), rh, rh / 2); g.fill(); }   // (filling back up)
    if (on) { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.roundRect(1, y + 1, W - 2, rh - 2, rh / 2 - 1); g.stroke(); }
    const lab = L === 'pad' ? PAD[a] : keyLabel(LAYOUTS[L].keys[a][0]);
    g.font = `800 ${Math.round(rh * 0.5)}px ${BD ? BOLD_FONT : FONT}`; g.textBaseline = 'middle'; g.textAlign = 'center';
    const kw = Math.max(rh * 0.95, g.measureText(lab).width + 8);
    g.fillStyle = cool ? (BD ? BK.surface : 'rgba(255,255,255,0.12)') : col; g.beginPath(); g.roundRect(3, y + 2.5, kw, rh - 5, 4); g.fill();
    g.fillStyle = cool ? MU : '#ffffff'; g.fillText(lab, 3 + kw / 2, y + rh / 2 + 0.5);
    const cx = 3 + kw + rh * 0.62, cy = y + rh / 2, cr = rh * 0.42;   // the move's chip
    g.save(); g.translate(cx, cy); const b = popBump(p); g.scale(b, b);
    g.beginPath(); g.arc(0, 0, cr, 0, TAU); g.fillStyle = cool ? 'rgba(10,8,26,0.5)' : alpha(col, 0.9); g.fill();
    g.save(); if (cool) g.globalAlpha *= 0.5; fightIcon(g, mv ? mv.icon : a, cr * 0.82, '#ffffff'); g.restore();
    sweep(g, 0, 0, cr, left); readyGlint(g, 0, 0, cr, p);
    if (venomLocked(f, mk)) venomDrop(g, cr * 0.6, -cr * 0.55, cr * 0.85);
    g.restore();
    g.font = `${mk === SP ? 800 : 700} ${Math.round(rh * 0.48)}px ${BD ? BOLD_FONT : FONT}`; g.textAlign = 'left'; g.fillStyle = cool ? MU : TX;
    const nx = cx + cr + 5, nm = shortName(mv); g.fillText(nm, nx, cy + 0.5);
    if (mk === SP) specialStar(g, nx + g.measureText(nm).width + rh * 0.32, cy - rh * 0.05, rh * 0.2);
    let ex = W - 7;   // the row's end: the seconds left, Duke's pips before them
    if (cool) { const s = cdSecs(f, mk), tx = secsText(s); if (tx) { g.font = `800 ${Math.round(rh * 0.56)}px ${BD ? BOLD_FONT : FONT}`; const tw = g.measureText(tx).width; cdNum(g, ex - tw / 2, cy, s, rh * 0.56); ex -= tw + 6; } }
    if (C) pips(g, ex - (C.max - 1) * 3.5 - 3, cy, C, col, 2.4);
    if (p > 0) {   // back: the row flashes white and a glint runs along it
      g.save(); g.beginPath(); g.roundRect(0, y, W, rh, rh / 2); g.clip();
      g.fillStyle = `rgba(255,255,255,${(0.35 * p).toFixed(3)})`; g.fillRect(0, y, W, rh);
      const gx = -rh + (1 - p) * (W + rh * 2); g.fillStyle = `rgba(255,255,255,${(0.7 * p).toFixed(3)})`;
      g.beginPath(); g.moveTo(gx, y + rh); g.lineTo(gx + rh * 0.5, y); g.lineTo(gx + rh * 1.1, y); g.lineTo(gx + rh * 0.6, y + rh); g.closePath(); g.fill();
      g.restore();
    }
    if (mv && mv.hot && f) { const H = mv.hot, h = clamp((f.hot || 0) / H.max, 0, 1); if (h > 0.02) { g.fillStyle = h >= 0.99 ? (BD ? BK.red : '#ff5a1f') : (BD ? BK.yellow : '#ffb347'); g.beginPath(); g.roundRect(rh * 0.6, y + rh - 3, (W - rh * 1.2) * h, 2.5, 1.25); g.fill(); } }   // (Duke's HotSpot: how hot, a warm bar under the jab's row)
    g.restore();
  });
  g.globalAlpha = 1;
}
const DIR_ACTS = new Set(['up', 'left', 'down', 'right']);
export function keysSize(L, u) { let w = 0, h = 0; for (const [, c, r, kw = 1] of LAYOUTS[L].draw) { w = Math.max(w, (c + kw) * u); h = Math.max(h, (r + 1) * u); } return { w, h }; }
function cap(g, x, y, w, h, on, col, base) {
  const BD = bold(), r = Math.min(5, h * 0.25);
  g.globalAlpha = on ? 1 : base;
  if (!BD) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.roundRect(x, y + 1.5, w, h, r); g.fill(); }
  g.fillStyle = on ? col : BD ? BK.surface2 : 'rgba(22,26,44,0.82)'; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill();
  if (!on) { g.strokeStyle = BD ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.28)'; g.lineWidth = 1; g.beginPath(); g.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, r); g.stroke(); }
}
export function drawKeys(g, L, held, col, u, base = 1, id = 'tux', f = null) {
  const BD = bold(), TX = BD ? BK.text : '#ffffff', MU = BD ? BK.muted : '#b9bfd6';
  g.save(); g.textBaseline = 'middle';
  for (const [code, c, r, kw = 1] of LAYOUTS[L].draw) {
    const a = actionOf(L, code), on = !!(a && held && held[a]), x = c * u, y = r * u, w = kw * u - 3, h = u - 3, lab = keyLabel(code);
    cap(g, x, y, w, h, on, col, base);
    g.fillStyle = on ? '#ffffff' : TX;
    if (!a || DIR_ACTS.has(a)) { g.font = `700 ${u * (lab.length > 1 ? 0.38 : 0.48)}px ${bold() ? BOLD_FONT : FONT}`; g.textAlign = 'center'; g.fillText(lab, x + w / 2, y + h / 2 + 0.5); continue; }
    g.font = `700 ${u * (lab.length > 1 ? 0.34 : 0.42)}px ${bold() ? BOLD_FONT : FONT}`; g.textAlign = 'left';
    g.fillText(lab, x + u * 0.14, y + h * 0.36);
    if (KIT_ACT[a]) {   // the move's icon big on the key, its cooldown swept over it, Duke's charges
      // (cooling: swept, the icon greyed (the legend over the keys has the seconds); back: a flash and a glint; the special's star in its corner)
      const mk = KIT_ACT[a], left = cdLeft(f, mk), C = chargesOf(f, mk), p = readyPop(f, mk, left, C), ix = x + w - u * 0.3, iy = y + h - u * 0.32, ir = u * 0.25;
      g.save(); g.translate(ix, iy); if (left > 0 && !on) g.globalAlpha *= 0.45; fightIcon(g, actIcon(a, id), ir, on ? '#ffffff' : left > 0 ? MU : TX); g.restore();
      if (f) { g.save(); g.beginPath(); g.roundRect(x, y, w, h, Math.min(5, h * 0.25)); g.clip(); sweep(g, x + w / 2, y + h / 2, Math.hypot(w, h) / 2, left); readyGlint(g, x + w / 2, y + h / 2, Math.max(w, h) * 0.55, p); g.restore(); }
      if (C && f) pips(g, x + w / 2, y + h - 3.5, C, col, 2.2);
      if (venomLocked(f, mk)) venomDrop(g, ix + ir * 0.7, iy - ir * 0.75, ir * 0.9);
      if (specialOf(id) === mk) specialStar(g, x + w - u * 0.14, y + u * 0.14, u * 0.11);
      continue;
    }
    g.save(); g.translate(x + w - u * 0.27, y + h - u * 0.27); fightIcon(g, actIcon(a, id), u * 0.22, on ? '#ffffff' : MU); g.restore();
  }
  g.restore();
}
export const padSize = u => ({ w: u * 6.3, h: u * 3 });
export function drawPad(g, held, col, u, base = 1, id = 'tux', f = null) {
  const BD = bold(), TX = BD ? BK.text : '#ffffff', MU = BD ? BK.muted : '#b9bfd6', h = held || {};
  g.save(); g.textBaseline = 'middle'; g.textAlign = 'center';
  // the d-pad / stick
  const dx = u * 1.2, dy = u * 1.5, s = u * 0.62;
  for (const [k, ox, oy] of [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]]) cap(g, dx + ox * s - s / 2, dy + oy * s - s / 2, s, s, !!h[k], col, base);
  cap(g, dx - s / 2, dy - s / 2, s, s, false, col, base);
  // LB (guard)
  cap(g, u * 2.55, u * 0.15, u * 1.4, u * 0.62, !!h.guard, col, base); g.fillStyle = h.guard ? '#fff' : TX; g.font = `700 ${u * 0.34}px ${bold() ? BOLD_FONT : FONT}`; g.fillText('LB', u * 3.0, u * 0.47);
  g.save(); g.translate(u * 3.65, u * 0.46); fightIcon(g, actIcon('guard', id), u * 0.2, h.guard ? '#fff' : MU); g.restore();
  // A B X Y
  const fx = u * 4.9, fy = u * 1.75, q = u * 0.62, rr = u * 0.33;
  for (const [a, lab, ox, oy, lc] of [['heavy', 'X', -1, 0, '#3f8cff'], ['special', 'B', 1, 0, '#ff4b3e'], ['light', 'A', 0, 1, '#2fc27a']]) {
    const on = !!h[a], x = fx + ox * q, y = fy + oy * q;
    g.globalAlpha = on ? 1 : base; g.fillStyle = on ? col : BD ? BK.surface2 : 'rgba(22,26,44,0.82)'; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
    g.strokeStyle = on ? '#fff' : lc; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = on ? '#fff' : lc; g.font = `800 ${u * 0.36}px ${bold() ? BOLD_FONT : FONT}`; g.fillText(lab, x, y + 0.5);
  }
  g.globalAlpha = base;
  for (const [a, ox, oy] of [['heavy', -1.75, -0.6], ['special', 1.75, -0.6], ['light', 0.75, 1.25]]) { g.save(); g.translate(fx + ox * q, fy + oy * q); fightIcon(g, actIcon(a, id), u * 0.18, h[a] ? '#fff' : MU); g.restore(); }
  g.restore();
}
