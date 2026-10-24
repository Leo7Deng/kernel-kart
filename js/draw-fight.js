// Kernel Kart: drawing Fight mode (fight-ui.js runs it, js/fight.js is the sim). Everything here is cosmetic: it reads
// the fight's plain state and its events, and keeps its own camera, particles, feed and HUD easing per fight (a WeakMap,
// never on the fight). Seen like a race: top-down, x right and y down, the 3D models from 28° above.
//   the place  the sky, the floating island and its stone court with its low wall: draw-arena.js (the wall pulses
//              red in sudden death, no words)
//   fighters   the 3D models whatever Settings says (art/model3d.js drawMascot3D, the 2D mascot only with no WebGL),
//              yaw = face, the sim's pose and a mood for the face; squash and stretch, a lunge on a strike, a white flash
//              when hit, greyed while frozen; a step leans the way it goes off a puff of dust (and a step attack trails a
//              lunge streak); knocked down they fall flat away from the hit (Tux on his belly, the others tipped over)
//              on a ring of dust, then hop back up translucent while untouchable; gassed they pant (a sweat drop, a puff
//              of breath). The front shield (frontShield): a clear curved wall in their colour in front of them, guardArc
//              either side of their facing, the half behind them drawn before the model and the half in front after;
//              a blocked hit flashes on it where it struck, a side or back hit that got round it shows as the arc
//              ghosting out with a swoosh round its end to where the hit came in. An armor sheen running over the model
//              as armor soaks a hit (armorSheen), sparkles rising off them while their super is ready (no glow discs or
//              halos behind them: the user's call)
//   effects    flat impact streaks, a counter hit's big sharp star, a flank's burst off their side or back, landing
//              dust, a dust burst off the wall on a wall bounce, the shockwave ring, Duke's cup (a paper cup tumbling on
//              its arc), its splash and its puddle (a thin film of coffee), clones popping; two attacks meeting: a
//              white-hot four-point glint and metal sparks flung out across the line (clash, ember); a shake only for
//              knockdowns, KOs and wall slams (Settings > Screen shake)
//   Tux, Duke  their three moves and evade each (2026-10-23): draw-moves.js, through the kits' hooks: each move played as a
//              run of poses with squash, stretch, hops, spins and fades (moveAnim), its tell drawn bold in the mover's
//              colour on the floor (the torpedo's line, the iceberg's shadow, the portal mark, the time-stop ring, the
//              geyser's mark), Stop the World greying the whole world but Duke (stopWorld), a big hit punching the camera
//              in a touch (v.punch). Their HUD card has no stamina or super: their moves' icons with cooldown sweeps (and
//              Duke's evade charges), and a human's keys show each move's icon and name (drawLegend)
//   kits       the other eight's specials and supers (Gopher's mound, containers, the tentacle, coils, arcs...):
//              draw-kits.js, hooked in here (kitEvent, kitGround, kitThings, kitBehind/kitOver/kitTint round a fighter,
//              kitFx in the particle loop, kitIcon among the icons)
//   moments    the round intro, 3-2-1 and the start, the KO's held frame, the winners' hops, confetti and the match won's
//              wash, streamers and portrait: draw-moments.js, hooked in here (momentHold round the world, momentCam,
//              momentPose, momentWash, momentUnder / momentOver in the HUD)
//   HUD        a card per player in their colour (portrait, name, health with a draining trail, round pips, the stamina
//              bar under the health (flashing while gassed), the super meter beside it when supers are on, Bugdroid's
//              battery cells), the round clock (in sudden death a red disc with the damage multiplier), and an icon feed
//              at the bottom (counter hits, flanks, knockdowns, KOs, supers, the kits' big moments)
//   touch      the virtual sticks and buttons fight-ui.js lays out, drawn last
import { FACE_Y, FONT, alpha, drawMascot } from './art.js';
import * as M3 from './art/model3d.js';
import { CHARACTERS, PCOL, TAU, clamp, frnd, lerp } from './core.js';
import { ARENAS, arenaBox } from './fight-arenas.js';
import { RIM, UNDER, drawFront, drawLowClouds, drawSolid, drawTop, drawUnder, drawVoid, zstep } from './draw-arena.js';
import { ACTIONS, LAYOUTS, PAD, actionOf, keyLabel } from './fight-keys.js';
import { BK, BOLD_DISPLAY, BOLD_FONT, BOLD_W, bold, bpanel } from './look.js';
import { SAFE } from './qol.js';
import { DPR, H, W, ctx } from './render.js';
import { settings } from './settings.js';
import { FIGHTERS } from './fight-chars.js';
import { kitBehind, kitEvent, kitFx, kitGround, kitIcon, kitOver, kitThings, kitTint } from './draw-kits.js';
import { hitAnim, moveAnim, poseFade, puddle3D } from './draw-moves.js';
import { confetti, momentAfter, momentCam, momentEvent, momentHold, momentMark, momentOver, momentPose, momentTick, momentUnder, momentWash } from './draw-moments.js';

export const SCALE = 1.25;   // the models' size (a race's is 0.92)
const STRIDE = 26;           // units walked per walk cycle (two steps)
const FEED_T = 4.5, FEED_SHOW = 4;
const charOf = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
const views = new WeakMap();
const viewOf = F => {
  let v = views.get(F);
  if (!v) views.set(F, v = { cam: null, fx: [], feed: [], shake: 0, hp: F.f.map(f => f.hp), land: [-9, -9], phase: F.phase, phaseT: 0, clones: new Set(), id: 0, t: 0, prevRound: F.round, pipT: [-9, -9], wd: [0, 0], wl: [null, null],
    lastHp: F.f.map(f => f.hp), hurt: F.f.map(() => ({ t: -9, k: 0 })), full: F.f.map(() => false), ready: [-9, -9], sup: null,
    armor: [{ t: -9, k: '' }, { t: -9, k: '' }], bhit: [{ t: -9, a: 0 }, { t: -9, a: 0 }], arc: [0, 0], byp: [{ t: -9, a: 0, face: 0 }, { t: -9, a: 0, face: 0 }],
    stam: F.f.map(stamOf), was: F.f.map(f => f.state), gas: F.f.map(gassedOf), fall: [1, -1], stepA: [0, Math.PI], pant: [0, 0],
    furrow: [[], []], ctr: [-9, -9], iso: [-9, -9], zapT: [-9, -9], heal: [0, 0], ko: null, celeb: -1, streamers: null });
  // (ko, celeb, streamers: the big beats', draw-moments.js; furrow ... heal: the kits' looks, draw-kits.js: Gopher's
  // furrow, a counter's flare, Isolation's sheen, a zap's stun, the healing's motes; armor ... pant: the combat looks:
  // the armor sheen, a blocked hit's flash on the shield, the shield's eased show, a flank getting round it, the stamina
  // bars' eased fill, the states last seen (a step, a knockdown, getting up), gassed, which way a knockdown fell, a
  // step's direction, the next pant)
  return v;
};
// stamina 0..1 (a sim without it: its shield pool stands in)
export const stamOf = f => clamp(f.stam ?? f.guardHp ?? 1, 0, 1);
const gassedOf = f => (f.gassed || 0) > 0;
const DOWN = new Set(['down', 'ko']);    // (lying on the ground)
const STEPS = new Set(['step', 'dodge']);
const arcOf = f => f.guardArc || 70 * Math.PI / 180;   // the front shield's half-angle
const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const wrap = a => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
export const hudScale = () => { const k = clamp(Math.min(W, H) / 540, 0.68, 1); return k; };

// ---------------------------------------------------------------- what happened: particles, shakes and the feed
// (call once after each update; the sounds are fight-ui.js's)
export function fightEvents(F) {
  const v = viewOf(F), few = settings.reduced;
  for (const e of F.events || []) {
    // who: the attacker (hit, block, counter, flank, super, ...), but the victim on ko and wall and the lander on land
    // (js/fight.js); the feed always reads attacker > victim
    const P = e.power || 0, who = e.who ?? -1, foe = who >= 0 ? 1 - who : -1;
    momentEvent(v, F, e);
    switch (e.kind) {
      case 'hit': {   // a short sharp burst of streaks the way the hit goes, and a small flash on the body
        const A = F.f[who], a = A ? Math.atan2(e.y - A.y, e.x - A.x) : frnd(0, TAU);
        burst(v, e.x - Math.cos(a) * 6, e.y - 24, a, 0.7 + P * 0.4, 16 + P * 26, few ? 4 : 5 + Math.round(P * 4), 0.16 + P * 0.1);
        v.fx.push({ k: 'flash', x: e.x - Math.cos(a) * 8, y: e.y - 24, t: 0, life: 0.09 + P * 0.05, s: 12 + P * 14 });
        break;
      }
      case 'block': {   // sparks glancing off the front shield where it was struck, and a flash on it there (frontShield)
        const D = F.f[e.to], A = F.f[who];
        if (!D) break;
        const a = A ? angTo(D, A) : D.face, aa = onArc(D, a), R = shieldR(D), x = D.x + Math.cos(aa) * R, y = D.y + Math.sin(aa) * R * SQ - 24;
        v.bhit[D.i] = { t: v.t, a: aa };
        for (let k = 0; k < (few ? 3 : 5); k++) { const t = aa + (k % 2 ? 1 : -1) * Math.PI / 2 + frnd(-0.4, 0.4), sp = frnd(110, 190); v.fx.push({ k: 'glint', x, y: y + frnd(-8, 8), vx: Math.cos(t) * sp + Math.cos(aa) * 50, vy: Math.sin(t) * sp * 0.5 - frnd(10, 50), t: 0, life: frnd(0.16, 0.26), s: frnd(5, 8) }); }
        break;
      }
      case 'counter': {   // a counter hit (caught in their wind-up): a big sharp star where it landed and a wider ring of streaks
        const A = F.f[who], D = F.f[e.to ?? foe], a = A && D ? angTo(A, D) : 0, x = e.x ?? (D ? D.x : 0), y = e.y ?? (D ? D.y : 0);
        v.fx.push({ k: 'cstar', x: x - Math.cos(a) * 4, y: y - 26, a: frnd(-0.3, 0.3), t: 0, life: 0.32, s: 26 });
        burst(v, x - Math.cos(a) * 4, y - 26, a, 2.2, 44, few ? 5 : 9, 0.24);
        addFeed(v, F, 'chit', who, D ? D.i : foe); break;
      }
      case 'flank': {   // a hit from the side or behind: a burst off that side of them, and their shield shown got round
        const A = F.f[who], D = F.f[e.to ?? foe]; if (!D) break;
        const back = e.side === 'back', a = A ? angTo(D, A) : D.face + Math.PI, x = D.x + Math.cos(a) * (D.r || 16), y = D.y + Math.sin(a) * (D.r || 16) * SQ;
        v.fx.push({ k: 'fburst', x, y: y - 24, a: a + Math.PI, t: 0, life: back ? 0.3 : 0.24, s: back ? 22 : 16, n: few ? 3 : back ? 5 : 3 });
        if (v.arc[D.i] > 0.15 || D.state === 'block') v.byp[D.i] = { t: v.t, a, face: D.face };
        addFeed(v, F, back ? 'flankb' : 'flank', who, D.i); break;
      }
      case 'trade':   // both landed at once: a small hot glint between them
      case 'clash': {   // two attacks meeting: a hot white glint where they met, metal sparks flung out across the line
        const A = F.f[who], B = F.f[e.to ?? foe], a = A && B ? angTo(A, B) : 0, big = e.kind === 'clash' && e.beat < 0;
        const x = e.x ?? (A && B ? (A.x + B.x) / 2 : 0), y = e.y ?? (A && B ? (A.y + B.y) / 2 : 0);
        v.fx.push({ k: 'clash', x, y: y - 26, a, t: 0, life: big ? 0.22 : 0.16, s: (big ? 20 : 13) * (0.8 + P * 0.4) });
        const n = few ? 3 : big ? 9 : 5;
        for (let k = 0; k < n; k++) {
          const side = k % 2 ? 1 : -1, b = a + side * Math.PI / 2 + frnd(-0.7, 0.7), sp = frnd(140, 260) * (big ? 1 : 0.75);
          v.fx.push({ k: 'ember', x, y: y - 26, vx: Math.cos(b) * sp, vy: Math.sin(b) * sp * 0.7 - frnd(40, 110), t: 0, life: frnd(0.25, 0.42), s: frnd(5, 9) });
        }
        break;
      }
      case 'armor': {   // armor soaking a hit: a sheen running over the model (fighter()), a small dull burst, no flinch
        const D = F.f[e.to], A = F.f[who];
        if (D) { v.armor[D.i] = { t: v.t, k: e.armor || 'light' }; const a = A ? Math.atan2(D.y - A.y, D.x - A.x) : 0; burst(v, e.x - Math.cos(a) * 10, e.y - 26, a + Math.PI, 0.9, 12 + P * 8, few ? 3 : 4, 0.13); }
        break;
      }
      case 'land':
        if (who >= 0) v.land[who] = v.t;
        if (kitEvent(v, F, e, few)) break;   // (Tux's Iceberg Drop: draw-moves.js)
        if (e.move === 'heavy') puff(v, e.x, e.y, few ? 5 : 10, null);   // (Tux's belly flop coming down)
        else if (P > 0.15) puff(v, e.x, e.y, few ? 3 : 6, null);
        break;
      case 'splash': v.fx.push({ k: 'splash', x: e.x, y: e.y - (e.z || 0), t: 0, life: 0.45, s: 22 }); break;   // Duke's cup lands: a few droplets (the puddle is the sim's)
      case 'pop':   // a Fork Bomb clone: a soft white puff and a little burst of streaks all round
        puff(v, e.x, e.y - 10, few ? 3 : 5, '#ffffff'); burst(v, e.x, e.y - 14, 0, TAU, 14, few ? 4 : 6, 0.18); break;
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
      case 'super':   // the cut-in (drawFight and the HUD play it from v.sup)
        addFeed(v, F, 'super', who, -1);
        if (who >= 0) { v.sup = { i: who, t: v.t }; v.full[who] = false; }
        break;
      case 'burn': puff(v, e.x, e.y - 6, few ? 3 : 6, '#ffd9b0'); v.fx.push({ k: 'flash', x: e.x, y: e.y - 20, t: 0, life: 0.15, s: 26 }); break;   // a heat vent flaring under them
      case 'pad': puff(v, e.x, e.y, few ? 2 : 4, null); break;
      // (a step, a knockdown, getting up and running out of stamina: from the fighters' states below, so a snapshot
      // without the events still shows them)
      case 'down': if (who >= 0) addFeed(v, F, 'down', e.by ?? 1 - who, who); break;   // (by -1: a heat vent)
      case 'step': case 'getup': case 'gassed': case 'whiff': case 'sudden': case 'round': case 'win': break;
      default:   // the kits' (draw-kits.js), and their lines in the feed
        kitEvent(v, F, e, few);
        if (e.kind === 'coil' || e.kind === 'own' || e.kind === 'ub') addFeed(v, F, e.kind, who, e.to ?? foe);
        else if (e.kind === 'borrow') addFeed(v, F, 'counter', who, e.to ?? foe);   // (Ferris's Borrow Checker catching a hit: the claw)
        else if (e.kind === 'zap' && P >= 0.8 && foe >= 0) v.zapT[foe] = v.t;
        else if (e.kind === 'jolt' && e.to >= 0) v.zapT[e.to] = v.t;
        else if (e.kind === 'freeze') addFeed(v, F, 'stopworld', who, e.to ?? foe);   // (Stop the World caught them)
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
        v.fx.push({ k: 'dring', x: f.x + v.fall[i] * 14, y: f.y, t: 0, life: 0.5, s: 46, id: i + 1 });
        if (st === 'down' && !(f.stats && f.stats.kit3)) v.shake = Math.max(v.shake, 0.32);   // (Tux and Duke: their moves' own shakes only, the iceberg's and the geyser's)
      }
      if (st === 'getup') puff(v, f.x, f.y, few ? 2 : 3, null);
      v.was[i] = st;
    }
    const gs = gassedOf(f);
    if (gs && !v.gas[i]) v.pant[i] = v.t;   // (gassed: pants straight away)
    v.gas[i] = gs;
  });
  // damage taken, from the health itself (so every kind counts: hits, chip on a block, clones, coffee; online too)
  F.f.forEach((f, i) => {
    const was = v.lastHp[i] ?? f.hp;
    if (f.hp < was - 0.01) {
      const k = clamp(0.55 + (was - f.hp) / (f.maxHp || 100) * 4, 0.55, 1), H = v.hurt[i];
      v.hurt[i] = { t: v.t, k: v.t - H.t < 0.12 ? Math.max(k, H.k) : k };
    }
    else if (f.hp > was + 0.01 && f.state !== 'ko' && F.phase !== 'intro') {   // (healing: Gopher's Garbage Collector: a little green mote now and then)
      v.heal[i] += f.hp - was;
      if (v.heal[i] > 0.6) { v.heal[i] = 0; v.fx.push({ k: 'mote', x: f.x + frnd(-12, 12), y: f.y - (f.z || 0) - frnd(10, 40), vx: 0, vy: -frnd(20, 40), t: 0, life: frnd(0.7, 1), s: frnd(1.6, 2.4), col: '190,255,200' }); }
    }
    v.lastHp[i] = f.hp;
    // the super meter filling up: a few sparkles off them, once (fight-ui.js plays the chime)
    const full = F.cfg.supers !== false && (f.meter || 0) >= 1;
    if (full && !v.full[i] && f.state !== 'ko') {
      v.ready[i] = v.t; const col = PCOL[i];
      for (let k = 0; k < (few ? 4 : 7); k++) { const a = k / (few ? 4 : 7) * TAU + frnd(-0.3, 0.3), sp = frnd(70, 120); v.fx.push({ k: 'spark', x: f.x, y: f.y - (f.z || 0) - 26, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - 30, t: 0, life: frnd(0.45, 0.65), s: frnd(4, 6), col }); }
    }
    v.full[i] = full;
  });
  if (v.fx.length > 140) v.fx.splice(0, v.fx.length - 140);
}
// time passing without a frame drawn (the dev hook's fast-forward): the effects age and go as they would on screen
export function fightTick(F, dt) {
  const v = viewOf(F); v.t += dt;
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
// the front shield's shape: a curved wall round the fighter at radius shieldR, the ground ring seen squashed by SQ
const SQ = 0.72;
const shieldR = f => (f.r || (f.stats && f.stats.radius) || 16) + 13;
const onArc = (f, a) => f.face + clamp(wrap(a - f.face), -arcOf(f), arcOf(f));   // (angle a moved onto the covered part)
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
  const mF = 115, zF = fit(x1 - x0 + mF * 2, y1 - y0 + mF * 2), cF = [(x0 + x1) / 2, (y0 + y1) / 2];
  const cP = [(B.x0 + B.x1) / 2, (B.y0 + B.y1 + RIM + R * UNDER * 0.7) / 2];
  let z, c;
  if (zF >= zP) { z = Math.min(zF, zP * 1.35); const w = clamp(1 - zP / z, 0, 1) * 1.3; c = [lerp(cP[0], cF[0], w), lerp(cP[1], cF[1], w)]; }
  else { z = zF; c = cF; }
  const M = momentCam(F, v, z); if (M) { c = [M.x, M.y]; z = M.z; }   // (a KO, the match won: draw-moments.js)
  const Pn = v.punch, pa = Pn ? v.t - Pn.t : 9;   // a big hit: a quick punch in on it (draw-moves.js punch)
  if (!M && pa >= 0 && pa < 0.4 && !settings.reduced) { const e = Math.sin(clamp(pa / 0.4, 0, 1) * Math.PI) * (pa < 0.1 ? pa / 0.1 : 1); z *= 1 + 0.025 * e; c = [lerp(c[0], Pn.x, 0.05 * e), lerp(c[1], Pn.y - 20, 0.05 * e)]; }   // (a hair: 2026-10-23, the user found it too much)
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
function groundObjs(g, F, v) {
  const BD = bold();
  for (const o of F.objs || []) {
    if (o.kind === 'puddle') { if (!puddle3D(g, o)) puddle(g, o, v.t); }   // (the 3D one, draw-moves.js; this one till it's made)
    else if (o.kind === 'shock') shockwave(g, o);
  }
  kitGround(g, F, v);
}
// Duke's coffee, calm like the stone it lands on: no outlines, soft shading lit from the top left.
// The puddle: a thin film of coffee the size of the sim's slippery zone (o.r), a smooth slightly irregular outline, a
// translucent warm brown pooling darker toward its rim, a soft highlight top left; a faint ring stain as it dries,
// shrinking a little and fading out smoothly; a few faint wisps of steam only while fresh
function puddle(g, o, t) {
  const life = o.life ?? 4, age = o.t || 0, left = life - age, u = clamp(age / life, 0, 1);
  const a = clamp(age / 0.18, 0, 1) * clamp(left / 1.2, 0, 1);
  if (a <= 0.01) return;
  const r = (o.r || 38) * (1 - 0.1 * u) * (age < 0.18 ? 0.7 + 0.3 * age / 0.18 : 1), ph = ((o.id ?? 1) * 1.37) % TAU;
  const edge = an => 1 + 0.045 * Math.sin(2 * an + ph) + 0.03 * Math.sin(3 * an + ph * 1.7) + 0.012 * Math.sin(5 * an + ph * 0.6);
  const path = k => { g.beginPath(); for (let i = 0; i <= 40; i++) { const an = i / 40 * TAU, q = r * k * edge(an); g.lineTo(Math.cos(an) * q, Math.sin(an) * q * 0.92); } g.closePath(); };
  g.save(); g.translate(o.x, o.y); g.globalAlpha *= a;
  const dry = clamp((u - 0.35) / 0.5, 0, 1);
  const gr = g.createRadialGradient(-r * 0.15, -r * 0.15, 0, 0, 0, r * 1.08);
  gr.addColorStop(0, `rgba(150,98,54,${0.2 - 0.1 * dry})`);
  gr.addColorStop(0.7, `rgba(136,84,42,${0.24 - 0.12 * dry})`);
  gr.addColorStop(0.9, `rgba(104,60,28,${0.36 - 0.04 * dry})`);   // pooling darker toward the rim (the ring stain as it dries)
  gr.addColorStop(1, 'rgba(96,54,24,0.18)');
  g.fillStyle = gr; path(1); g.fill();
  // wet: the sky caught across it, brightest toward the top left
  g.save(); path(0.97); g.clip();
  const wg = g.createLinearGradient(-r, -r, r * 0.4, r * 0.5);
  wg.addColorStop(0, `rgba(235,244,255,${0.3 * (1 - dry)})`); wg.addColorStop(0.5, `rgba(235,244,255,${0.06 * (1 - dry)})`); wg.addColorStop(1, 'rgba(235,244,255,0)');
  g.fillStyle = wg; g.fillRect(-r * 1.2, -r * 1.2, r * 2.4, r * 2.4);
  g.restore();
  // the soft highlight from the top left
  const hx = -r * 0.36, hy = -r * 0.34, hg = g.createRadialGradient(hx, hy, 0, hx, hy, r * 0.5);
  hg.addColorStop(0, `rgba(255,248,236,${0.42 * (1 - 0.6 * dry)})`); hg.addColorStop(1, 'rgba(255,248,236,0)');
  g.fillStyle = hg; g.beginPath(); g.ellipse(hx, hy, r * 0.5, r * 0.32, -0.5, 0, TAU); g.fill();
  // steam: a few faint wisps, only while fresh
  const fresh = clamp(1 - age / 1.4, 0, 1);
  if (fresh > 0.02) {
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1.6; g.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      const q = (t * 0.7 + k * 0.5) % 1, x = (k ? 0.22 : -0.18) * r, y = -q * 22;
      g.globalAlpha = a * fresh * Math.sin(q * Math.PI) * 0.8;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 4 * Math.sin(t * 3 + k * 2), y - 6, x + 1, y - 12); g.stroke();
    }
  }
  g.restore();
}
// Duke's cup in flight: a small white paper cup with a Java-red sleeve and the coffee showing at the top, tumbling along
// its arc, a soft shadow on the ground under it and a thin trail of steam behind it
function coffee(g, o, t) {
  const BD = bold(), s = 1 / (1 + o.z / 140);
  const sg = g.createRadialGradient(o.x, o.y, 0, o.x, o.y, 9 * s);
  sg.addColorStop(0, `rgba(20,16,42,${0.24 * s})`); sg.addColorStop(1, 'rgba(20,16,42,0)');
  g.fillStyle = sg; g.beginPath(); g.ellipse(o.x, o.y, 9 * s, 4 * s, 0, 0, TAU); g.fill();
  // the steam trail: a few soft wisps left behind along the arc
  const sp = Math.hypot(o.vx, o.vy, o.vz) || 1;
  for (let k = 1; k <= 4; k++) {
    const d = k * 7, x = o.x - o.vx / sp * d, y = o.y - o.z + o.vz / sp * d - k * 1.5, al = 0.32 * (1 - k / 5);
    const wg = g.createRadialGradient(x, y, 0, x, y, 3 + k * 1.2);
    wg.addColorStop(0, `rgba(255,255,255,${al})`); wg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = wg; g.beginPath(); g.arc(x, y, 3 + k * 1.2, 0, TAU); g.fill();
  }
  g.save(); g.translate(o.x, o.y - o.z); g.rotate((o.t || 0) * 9 + 0.3);
  // the cup: tapered, shaded light on the left to a soft grey on the right
  const cg = g.createLinearGradient(-6, 0, 6, 0); cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.55, '#f1efe9'); cg.addColorStop(1, '#cfcac0');
  g.fillStyle = cg; g.beginPath(); g.moveTo(-6.5, -8); g.lineTo(6.5, -8); g.lineTo(4.6, 8); g.quadraticCurveTo(0, 9.2, -4.6, 8); g.closePath(); g.fill();
  // the sleeve
  const rg = g.createLinearGradient(-6, 0, 6, 0), red = BD ? BK.red : '#d8343a';
  rg.addColorStop(0, red); rg.addColorStop(1, '#9e2228');
  g.fillStyle = rg; g.beginPath(); g.moveTo(-6, -3); g.lineTo(6, -3); g.lineTo(5.4, 2.6); g.lineTo(-5.4, 2.6); g.closePath(); g.fill();
  // the rim and the coffee in it
  g.fillStyle = '#fbfaf7'; g.beginPath(); g.ellipse(0, -8, 6.6, 2.2, 0, 0, TAU); g.fill();
  g.fillStyle = '#6a3f20'; g.beginPath(); g.ellipse(0, -8, 5.4, 1.6, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,240,220,0.35)'; g.beginPath(); g.ellipse(-1.8, -8.4, 1.8, 0.5, 0, 0, TAU); g.fill();
  g.restore();
}

// ---------------------------------------------------------------- the fighters
const OFF = typeof document !== 'undefined' ? document.createElement('canvas') : null;
export function model(g, ch, o) {
  if (!M3.drawMascot3D(g, ch, o)) drawMascot(g, ch, { t: o.t, scale: o.scale, mood: o.mood, shadow: false, lean: o.lean, look: [Math.cos(o.yaw || 0), Math.sin(o.yaw || 0)], face: Math.cos(o.yaw || 0) < 0 ? -1 : 1 });
}
// draw(g) at the current transform, through a little canvas when it needs a tint (the hit flash, frozen grey)
export function tinted(g, draw, tint) {
  if (Array.isArray(tint)) { tint = tint.filter(Boolean); if (!tint.length) tint = null; }
  if (!tint || !OFF) { draw(g); return; }
  const m = g.getTransform(), sx = m.a, sy = m.d, w = Math.ceil(150 * Math.max(sx, sy)), h = w;
  if (OFF.width < w || OFF.height < h) { OFF.width = w; OFF.height = h; }
  const o = OFF.getContext('2d'); o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, OFF.width, OFF.height);
  o.setTransform(sx, 0, 0, sy, w / 2, h * 0.72); o.globalAlpha = 1; draw(o);
  o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = 'source-atop'; for (const c of [].concat(tint)) { if (typeof c === 'function') c(o, w, h); else { o.fillStyle = c; o.fillRect(0, 0, w, h); } } o.globalCompositeOperation = 'source-over';
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(OFF, 0, 0, w, h, m.e - w / 2, m.f - h * 0.72, w, h); g.restore();
}
export function shadow(g, x, y, z, r = 17) {
  const s = 1 / (1 + Math.max(0, z) / 110);
  g.fillStyle = bold() ? `rgba(20,16,42,${0.26 * s})` : `rgba(8,10,16,${0.3 * s})`; g.beginPath(); g.ellipse(x + 2, y + 1.5, r * s, r * 0.36 * s, 0, 0, TAU); g.fill();
}
const LIE = new Set(['slide', 'flop', 'belly']);
function longShadow(g, x, y, z, yaw) {   // seen from 28° up: the length along x stays, along y shrinks
  const s = 1 / (1 + Math.max(0, z) / 110), u = Math.cos(yaw), w = Math.sin(yaw) * Math.sin(28 * Math.PI / 180);
  g.fillStyle = bold() ? `rgba(20,16,42,${0.26 * s})` : `rgba(8,10,16,${0.3 * s})`; g.beginPath(); g.ellipse(x + 2, y + 1.5, Math.max(10, Math.hypot(u, w) * 27) * s, 9 * s, Math.atan2(w, u), 0, TAU); g.fill();
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
function fighter(g, F, v, f, humans) {
  const ch = charOf(f.id), t = v.t + f.i * 2.3, BD = bold(), col = PCOL[f.i], st = f.state, i = f.i;
  let x = f.x, y = f.y;
  const hide = f.stats && kitBehind(g, F, v, f) === 'hide';   // (Gopher underground: only his mound shows)
  if (hide) { marker(g, F, v, f, humans, x, y); return; }
  // knocked down (or out): falling flat away from the other one in ~0.18 s with a little bounce, lying there; getting
  // up: back on their feet with a little hop. Tux flops on his belly (his model's lying pose), the others tip over
  const belly = M3.poses3D && M3.poses3D(f.id).includes('flop'), fall = v.fall[i];
  let lie = 0, bob = 0, hop = 0;
  if (DOWN.has(st)) { const k = clamp(f.t / 0.18, 0, 1); lie = smooth(k); const b = f.t - 0.18; if (b > 0 && b < 0.16) bob = Math.sin(b / 0.16 * Math.PI) * 3; }
  else if (st === 'getup') { const d = f.dur || 0.35, k = clamp(f.t / d, 0, 1); lie = 1 - smooth(clamp(k / 0.6, 0, 1)); hop = Math.sin(k * Math.PI) * 9; }
  const td = f.id === 'tux' || f.id === 'duke';   // (Tux's and Duke's hit reactions and pose blends: draw-moves.js)
  const flop = belly && lie > 0.5, A = f.stats && f.ph ? moveAnim(F, v, f) : td && f.stats ? hitAnim(F, v, f) : null;   // (A: a three-move fighter's move playing: draw-moves.js)
  const up = f.air && (f.z || 0) > 30;   // (up out of shot: the iceberg's own shadow is on the floor instead)
  const fpose = (A && A.pose) || f.pose;   // (a move's anim can name the pose to draw: an own move's calm settle, draw-moves.js / kits.js settleAnim)
  if (up) { /* no shadow of his own */ }
  else if (LIE.has(fpose) || flop) longShadow(g, f.x, f.y, f.z, flop ? (fall > 0 ? 0 : Math.PI) : f.face);   // (lying on his belly: a long shadow along him)
  else if (lie > 0.05) longShadow(g, f.x - fall * 4 * lie, f.y, 0, 0);
  else shadow(g, f.x, f.y, f.z, f.stats && f.stats.radius ? f.stats.radius + 2 : 17);
  // the lunge: forward on a strike, a lean back on a wind-up
  const fc = Math.cos(f.face), fs = Math.sin(f.face);
  let lunge = 0;
  if (A) lunge = A.fwd;
  else if (st === 'strike') lunge = 7 * Math.sin(Math.min(1, f.t / 0.08) * Math.PI / 2);
  else if (st === 'wind' || st === 'charge') lunge = -3 - 2 * (f.charge || 0);
  x += fc * lunge; y += fs * lunge;
  if (st === 'frozen') clockRing(g, f.x, f.y, f.dur ? clamp(1 - f.t / f.dur, 0, 1) : 1, v.t);
  if (f.flash > 0 && F.hitstop > 0) x += Math.sin(v.t * 95) * 2;   // shaking in the hitstop
  if (st === 'stagger') x += Math.sin(v.t * 9 + i) * 1.6;           // (staggered: swaying)
  // squash and stretch: a landing squashes, rising stretches, a charge crouches, a step stretches, gassed they heave
  const landAge = v.t - v.land[i], gassed = gassedOf(f);
  let sq = landAge < 0.25 && !A ? 0.22 * (1 - landAge / 0.25) : 0;
  if (f.z > 0) sq -= clamp((f.vz || 0) / 900, -0.12, 0.16);
  if (st === 'charge') sq += 0.06 + 0.06 * (f.charge || 0) + Math.sin(v.t * 30) * 0.015 * (f.charge || 0);
  if (st === 'strike' && !A) sq -= 0.06;
  if (STEPS.has(st)) sq -= 0.05;
  if (gassed && lie === 0) sq += 0.03 + 0.03 * Math.sin(v.t * 15);
  sq *= 1 - lie;
  // a step attack (the sim's stepAtk): a lunge streak behind them
  const sp = Math.hypot(f.vx || 0, f.vy || 0), mv = f.move && f.stats && f.stats.moves[f.move], walk = (f.stats && f.stats.walk) || 1;
  if (f.stepAtk && (st === 'wind' || st === 'strike')) lungeStreak(g, f, x, y, BD);
  frontShield(g, v, f, -1);   // (the part of the shield behind them)
  g.save(); g.translate(x + (A ? A.wx : 0), y - (f.z || 0) - hop - bob - (A ? A.hop : 0));
  if (A && A.alpha < 1) { if (A.alpha <= 0.01) { g.restore(); return; } g.globalAlpha *= A.alpha; }
  if (st === 'getup') g.globalAlpha *= 0.5 + 0.1 * Math.sin(v.t * 26);   // (untouchable: see-through)
  else if (f.inv > 0 && !STEPS.has(st) && !DOWN.has(st)) g.globalAlpha *= 0.55 + 0.45 * Math.abs(Math.sin(v.t * 30));
  if (lie > 0 && !flop) g.translate(-fall * 18 * lie, -7 * lie);   // (tipped over round the feet: the body back over where they stand)
  // super ready: sparkles rising off them (after the model; no glow behind them)
  const ready = F.cfg.supers !== false && (f.meter || 0) >= 1 && st !== 'ko';
  g.save(); g.scale((1 + sq) * (A ? A.sx * A.s : 1), (1 - sq) * (A ? A.sy * A.s : 1));
  // a step leans the way it goes; knocked down they tip over (lying face up, turned to the camera)
  const lean = (flop ? 0 : lie > 0 ? fall * 1.45 * lie : STEPS.has(st) ? clamp(Math.cos(f.stepA ?? v.stepA[i]), -1, 1) * 0.2 : 0) + (A ? A.lean : 0);
  let yaw = (LIE.has(fpose) ? f.face : f.face + 0.35 * Math.sin(Math.PI / 2 - f.face)) + (A ? A.spin : 0);   // (turned a touch toward the camera: a profile reads poorly from above)
  if (flop) yaw = fall > 0 ? 0 : Math.PI;
  else if (lie > 0) yaw = lerp(yaw, Math.PI / 2 + fall * 0.3, lie);
  // the pose: the sim's, else standing on his legs, or a frame of the walk cycle from the distance walked (a step: mid-stride)
  const wk = st === 'walk' && sp > 0.1 * WALK * walk;   // (Tux's icy glide, idle, stands)
  if (v.wd) { const L = v.wl[i]; if (L) v.wd[i] += Math.hypot(f.x - L[0], f.y - L[1]); v.wl[i] = [f.x, f.y]; }   // (a drawer-side distance, for a snapshot without walkDist)
  let pose = POSE_AS[fpose] ?? fpose;
  if (flop) pose = 'flop';
  else if (lie > 0.05) pose = 'hurt';
  else if (STEPS.has(st)) pose = M3.walkPose ? M3.walkPose(0.25) : 'stand';
  else if (st === 'stagger' && !pose) pose = 'hurt';
  if (!pose) pose = wk && M3.walkPose ? M3.walkPose((f.walkDist ?? v.wd[i]) / STRIDE) : 'stand';
  const MP = momentPose(F, v, f);   // (a ready pose before a round, the winner's hops: draw-moments.js)
  const mood0 = moodOf(F, f) || (A && A.mood) || null;
  const o = { t, scale: SCALE, smooth: true, yaw, lean, mood: MP && MP.mood !== undefined ? MP.mood || mood0 : mood0, pose: MP && MP.pose != null ? MP.pose || pose : pose, shadow: false, fight: true };
  if (MP && MP.hop) g.translate(0, -MP.hop);
  // the tints: Stop the World greys them out under a cold blue wash; damage taken turns them red for a moment (a pale
  // pink at the very hit, the red strongest for ~0.15 s, gone by 0.5 s; deeper for a bigger chunk)
  const H = v.hurt[i], ha = v.t - H.t, red = (ha >= 0 && ha < 0.5 ? H.k * (ha < 0.15 ? 1 : 1 - (ha - 0.15) / 0.35) : 0) * (v.t - v.armor[i].t < SHEEN_T ? 0.35 : 1);   // (softer under an armor sheen)
  const wm = clamp(ha / 0.07, 0, 1), rc = `${Math.round(255)},${Math.round(lerp(200, 50, wm))},${Math.round(lerp(200, 58, wm))}`;
  const tint = [st === 'frozen' ? (BD ? 'rgba(168,172,186,0.84)' : 'rgba(170,174,188,0.82)') : null,   // (Stop the World: a grey statue)
    st === 'frozen' ? 'rgba(255,255,255,0.1)' : null,
    red > 0.01 ? `rgba(${rc},${(red * (BD ? 0.26 : 0.25)).toFixed(3)})` : null,
    armorSheen(v.armor[i], v.t), f.stats ? kitTint(F, v, f) : null];
  const pb = td && !MP ? poseFade(v, f, o.pose || 'stand') : null;
  if (pb) { g.save(); g.globalAlpha *= pb.a; model(g, ch, { ...o, pose: pb.pose }); g.restore(); }   // (the pose it was in, fading out under the new one)
  tinted(g, gg => model(gg, ch, o), tint);
  g.restore();
  if (ready) sparkles(g, col, v.t + i * 1.7, BD);
  if (st === 'frozen') {   // Stop the World: a frosty clock face over them, its hand ticking round
    const cy = -66, hand = f.dur ? f.t / f.dur * TAU : 0;
    g.fillStyle = BD ? alpha('#ffffff', 0.85) : 'rgba(235,245,255,0.82)'; g.beginPath(); g.arc(0, cy, 9, 0, TAU); g.fill();
    g.strokeStyle = BD ? alpha(BK.ink, 0.6) : 'rgba(36,48,74,0.6)'; g.lineWidth = 1.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, cy); g.lineTo(Math.sin(hand) * 6, cy - Math.cos(hand) * 6); g.moveTo(0, cy); g.lineTo(0, cy - 4); g.stroke();
  }
  if (f.stats) kitOver(g, F, v, f);
  g.restore();
  frontShield(g, v, f, 1);   // (the part in front of them, over the model)
  // gassed: panting, a sweat drop flicking off their head and a little puff of breath, by turns
  if (gassed && F.phase !== 'over' && v.t >= v.pant[i]) {
    const n = Math.round(v.pant[i] * 10) % 2, hx = x, hy = y - (f.z || 0) - hop;
    if (n) v.fx.push({ k: 'sweat', x: hx + (Math.cos(f.face) < 0 ? 12 : -12), y: hy - 60, vx: (Math.cos(f.face) < 0 ? 40 : -40), vy: -50, t: 0, life: 0.5, s: 3.4 });
    else v.fx.push({ k: 'breath', x: hx + Math.cos(f.face) * 15, y: hy - 42 + Math.sin(f.face) * 5, vx: Math.cos(f.face) * 26, vy: -8, t: 0, life: 0.55, s: 4.5 });
    v.pant[i] = v.t + 0.32;
  }
  marker(g, F, v, f, humans, x, y);
}
// a step attack's lunge: a few pale streaks trailing behind them, the way they're going
function lungeStreak(g, f, x, y, BD) {
  const sp = Math.hypot(f.vx, f.vy), ux = sp > 30 ? f.vx / sp : Math.cos(f.face), uy = sp > 30 ? f.vy / sp : Math.sin(f.face);   // (the way they're going, else the way they face)
  g.save(); g.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    const off = (k - 1) * 8, sx = x - uy * off - ux * 10, sy = y - 24 + ux * off * 0.5 - uy * 10 * SQ, L = k === 1 ? 40 : 28;
    const ex = sx - ux * L, ey = sy - uy * L * 0.7, gr = g.createLinearGradient(sx, sy, ex, ey);
    gr.addColorStop(0, BD ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = gr; g.lineWidth = k === 1 ? 4 : 2.6; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
  }
  g.restore();
}
// the front shield: a clear curved wall in their colour round the front of them, guardArc either side of where they
// face (so it reads at a glance which side is covered), rising as it comes up. side -1 draws the part behind them
// (before the model), 1 the part in front (after). A blocked hit flashes white on it where it struck and dents it; a
// side or back hit that got round it (v.byp) shows it ghosting out, its outline dashed, with a swoosh round its end to
// where the hit came in.
function frontShield(g, v, f, side) {
  const i = f.i, show = v.arc[i], B = v.byp[i], ba = v.t - B.t, ghost = ba >= 0 && ba < 0.45 ? 1 - ba / 0.45 : 0;
  if (show < 0.02 && ghost <= 0) return;
  const BD = bold(), col = PCOL[i], R = shieldR(f), A = arcOf(f), N = 24, x0 = f.x, y0 = f.y - (f.z || 0);
  const ring = (face, open, r0, h, dent) => {   // the arc's points [x, y, angle] at height h
    const out = [];
    for (let n = 0; n <= N; n++) { const a = face + (n / N * 2 - 1) * A * open, r = r0 - (dent ? dent(a) : 0); out.push([x0 + Math.cos(a) * r, y0 + Math.sin(a) * r * SQ - h, a]); }
    return out;
  };
  const runs = (pts) => {   // the stretches of the arc on this side (behind: further up the screen than they stand)
    const out = []; let cur = null;
    for (let n = 0; n < N; n++) {
      const mid = (pts[n][2] + pts[n + 1][2]) / 2, mine = (Math.sin(mid) >= 0 ? 1 : -1) === side;
      if (mine) { if (!cur) out.push(cur = [n]); cur.push(n + 1); } else cur = null;
    }
    return out;
  };
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  if (show >= 0.02) {
    const Hh = v.bhit[i], ha = v.t - Hh.t, hit = ha >= 0 && ha < 0.22 ? 1 - ha / 0.22 : 0;
    const dent = hit ? a => hit * 5 * Math.pow(Math.max(0, Math.cos(a - Hh.a)), 6) : null;
    const open = 0.55 + 0.45 * show, h0 = 3, h1 = lerp(10, 34, show);
    const lo = ring(f.face, open, R, h0, dent), hi = ring(f.face, open, R, h1, dent);
    for (const run of runs(lo)) {
      g.beginPath(); run.forEach((n, k) => k ? g.lineTo(hi[n][0], hi[n][1]) : g.moveTo(hi[n][0], hi[n][1])); for (let k = run.length - 1; k >= 0; k--) g.lineTo(lo[run[k]][0], lo[run[k]][1]); g.closePath();
      if (BD) g.fillStyle = alpha(col, (side < 0 ? 0.34 : 0.26) * show);
      else { const gr = g.createLinearGradient(0, y0 - h1, 0, y0 - h0); gr.addColorStop(0, alpha(col, 0.42 * show)); gr.addColorStop(1, alpha(col, 0.12 * show)); g.fillStyle = gr; }
      g.fill();
      const edge = (P, w, s) => { g.strokeStyle = s; g.lineWidth = w; g.beginPath(); run.forEach((n, k) => k ? g.lineTo(P[n][0], P[n][1]) : g.moveTo(P[n][0], P[n][1])); g.stroke(); };
      edge(lo, BD ? 4.5 : 4, alpha(col, show));   // (its foot on the ground: the clearest cue from above)
      edge(hi, BD ? 3.2 : 2.6, alpha(col, show));
      edge(hi.map(p => [p[0], p[1] + 3.5]), 1.3, `rgba(255,255,255,${((BD ? 0.55 : 0.7) * show).toFixed(3)})`);
      for (const n of [0, N]) if (run.includes(n)) { g.strokeStyle = alpha(col, show); g.lineWidth = BD ? 3.2 : 2.6; g.beginPath(); g.moveTo(lo[n][0], lo[n][1]); g.lineTo(hi[n][0], hi[n][1]); g.stroke(); }
    }
    if (hit > 0 && (Math.sin(Hh.a) >= 0 ? 1 : -1) === side) {   // the blocked hit: a white flash on it where it struck
      const r = R - hit * 5, cx = x0 + Math.cos(Hh.a) * r, cy = y0 + Math.sin(Hh.a) * r * SQ - (h0 + h1) / 2;
      g.fillStyle = `rgba(255,255,255,${(0.9 * hit).toFixed(3)})`; g.beginPath(); g.ellipse(cx, cy, 5 + 4 * (1 - hit), 11 + 6 * (1 - hit), 0, 0, TAU); g.fill();
    }
  }
  if (ghost > 0 && side > 0) {   // got round it: the shield's outline as it was, dashed and fading, and the hit's path round its end
    const lo = ring(B.face, 1, R, 3), hi = ring(B.face, 1, R, 30);
    g.setLineDash([4, 5]); g.strokeStyle = alpha(col, 0.8 * ghost); g.lineWidth = 2;
    for (const P of [lo, hi]) { g.beginPath(); P.forEach((p, k) => k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); }
    g.setLineDash([]);
    const d = wrap(B.a - B.face), s = Math.sign(d) || 1, a0 = B.face + s * A, a1 = B.a, Rs = R + 7, n = 14, k = clamp(ba / 0.16, 0, 1);
    const P = []; for (let j = 0; j <= n; j++) { const a = lerp(a0, a0 + wrap(a1 - a0) * k, j / n); P.push([x0 + Math.cos(a) * Rs, y0 + Math.sin(a) * Rs * SQ - 24]); }
    g.strokeStyle = `rgba(255,255,255,${(0.95 * ghost).toFixed(3)})`; g.lineWidth = 3.5; g.beginPath(); P.forEach((p, j) => j ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke();
    const [ex, ey] = P[n], [px, py] = P[n - 1], ta = Math.atan2(ey - py, ex - px);   // (an arrowhead on the end, the way it went)
    g.fillStyle = `rgba(255,255,255,${(0.95 * ghost).toFixed(3)})`; g.beginPath(); g.moveTo(ex + Math.cos(ta) * 7, ey + Math.sin(ta) * 7); g.lineTo(ex + Math.cos(ta + 2.3) * 6, ey + Math.sin(ta + 2.3) * 6); g.lineTo(ex + Math.cos(ta - 2.3) * 6, ey + Math.sin(ta - 2.3) * 6); g.closePath(); g.fill();
  }
  g.restore();
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
// armor soaking a hit: a band of light running down over the model from its top left (through tinted(), so only on the
// model itself), pale steel for light armor, warm gold for super armor; ~0.4 s
const SHEEN_T = 0.4;
function armorSheen(AR, t) {
  const age = t - AR.t; if (!(age >= 0 && age < SHEEN_T)) return null;
  const k = age / SHEEN_T, p = -0.15 + 1.3 * k, c = AR.k === 'super' ? '255,222,140' : '232,242,255', al = 0.95 * Math.sin(Math.PI * Math.min(1, k * 1.15));
  return (o, w, h) => {
    const s = w / 150, cx = w / 2, by = h * 0.72, gr = o.createLinearGradient(cx - 34 * s, by - 78 * s, cx + 34 * s, by), st = x => clamp(x, 0, 1);   // (over the model: tinted() draws it centred, feet at 0.72 down)
    gr.addColorStop(st(p - 0.16), `rgba(${c},0)`); gr.addColorStop(st(p - 0.03), `rgba(${c},${(al * 0.7).toFixed(3)})`);
    gr.addColorStop(st(p), `rgba(255,255,255,${al.toFixed(3)})`); gr.addColorStop(st(p + 0.05), `rgba(${c},${(al * 0.5).toFixed(3)})`); gr.addColorStop(st(p + 0.16), `rgba(${c},0)`);
    o.fillStyle = gr; o.fillRect(0, 0, w, h);
    o.fillStyle = `rgba(${c},${(0.12 * (1 - k)).toFixed(3)})`; o.fillRect(0, 0, w, h);   // (a faint overall lift at the moment it soaks)
  };
}
// super ready: sparkles drifting up off them
function sparkles(g, col, t, BD) {
  for (let k = 0; k < 4; k++) {
    const ph = (t * 0.8 + k / 4) % 1, x = Math.sin(k * 2.4 + 0.7) * 22 + Math.sin(t * 3 + k) * 3, y = -14 - ph * 58, s = 3.2 * Math.sin(ph * Math.PI) + 0.6;
    g.save(); g.globalAlpha *= Math.sin(ph * Math.PI);
    starPath(g, x, y, s * 1.6, s * 0.45, 4, 0); g.fillStyle = k % 2 ? '#ffffff' : (BD ? alpha(col, 1) : col); g.fill();
    if (!BD && k % 2 === 0) { g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1; g.stroke(); }
    g.restore();
  }
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
function clone(g, o, v, F) {
  const ch = charOf((F.f[o.owner] || {}).id || 'tux'), t = v.t + o.x * 0.01;
  shadow(g, o.x, o.y, 0, 9);
  g.save(); g.translate(o.x, o.y - Math.abs(Math.sin(t * 12)) * 3);
  model(g, ch, { t, scale: SCALE * 0.5, smooth: true, yaw: o.face ?? Math.atan2(o.vy || 0, o.vx || 1), lean: Math.sin(t * 12) * 0.15, mood: null, pose: M3.walkPose ? M3.walkPose(t * 3) : 'stand', shadow: false, fight: true });
  g.restore();
}

// ---------------------------------------------------------------- particles
// the belly flop's shockwave: a low wave of dust rolling out along the ground (soft puffs on the front, thinner behind),
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
    if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.k === 'sweat') p.vy += 420 * dt; else { p.vx *= 1 - 3 * dt; p.vy *= 1 - 3 * dt; } }
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
    } else if (p.k === 'fburst') {   // a flank: a little fan of wedges off the side (or back) it hit, pointing back where it came from
      const out = p.s * (0.4 + 0.8 * Math.sqrt(k)), fade = 1 - k, n = p.n || 3, back = p.a + Math.PI;
      g.save(); g.globalAlpha *= fade;
      for (let j = 0; j < n; j++) {
        const b = back + (n > 1 ? (j / (n - 1) - 0.5) * 1.5 : 0), c = Math.cos(b), sn = Math.sin(b) * 0.75, L = p.s * (j === (n - 1) / 2 ? 0.75 : 0.55), w = 3.6 * (1 - k * 0.5);
        const x0 = p.x + c * out * 0.45, y0 = p.y + sn * out * 0.45, x1 = p.x + c * (out * 0.45 + L), y1 = p.y + sn * (out * 0.45 + L);
        g.fillStyle = BD ? BK.yellow : '#ffd23c'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 - sn * w, y1 + c * w); g.lineTo(x1 + sn * w, y1 - c * w); g.closePath(); g.fill();
        g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(x0, y0); g.lineTo((x0 + x1) / 2 - sn * w * 0.4, (y0 + y1) / 2 + c * w * 0.4); g.lineTo((x0 + x1) / 2 + sn * w * 0.4, (y0 + y1) / 2 - c * w * 0.4); g.closePath(); g.fill();
      }
      g.restore();
    } else if (p.k === 'dring') {   // a knockdown: a ring of dust rolling out from where they hit the ground
      shockwave(g, { x: p.x, y: p.y, t: p.t, life: p.life, r: 8 + Math.sqrt(k) * p.s, id: p.id });
    } else if (p.k === 'sweat') {   // gassed: a sweat drop flicking off, a little teardrop falling
      const a = Math.atan2(p.vy, p.vx), r = p.s;
      g.save(); g.translate(p.x, p.y); g.rotate(a + Math.PI / 2); g.globalAlpha *= 1 - k * k;
      g.fillStyle = BD ? BK.cyan : '#8fdcff'; g.beginPath(); g.moveTo(0, -r * 2); g.quadraticCurveTo(r, -r * 0.4, r, r * 0.2); g.arc(0, r * 0.2, r, 0, Math.PI); g.quadraticCurveTo(-r, -r * 0.4, 0, -r * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(-r * 0.35, r * 0.05, r * 0.32, 0, TAU); g.fill();
      g.restore();
    } else if (p.k === 'breath') {   // gassed: a little puff of breath, swelling and fading
      const r = p.s * (0.6 + k * 1.2), al = 0.6 * (1 - k) * (k < 0.15 ? k / 0.15 : 1);
      g.fillStyle = `rgba(255,255,255,${al.toFixed(3)})`; g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.arc(p.x + r * 0.9, p.y - r * 0.3, r * 0.7, 0, TAU); g.fill();
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
    } else if (p.k === 'glint') {   // a spark glancing off a guard: a short bright streak along its way
      const sp = Math.hypot(p.vx, p.vy) || 1, L = p.s * (1 - k * 0.5), ux = p.vx / sp, uy = p.vy / sp;
      g.strokeStyle = `rgba(230,250,255,${(0.95 * (1 - k)).toFixed(3)})`; g.lineWidth = 2 * (1 - k) + 0.6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(p.x - ux * L, p.y - uy * L); g.lineTo(p.x, p.y); g.stroke();
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
      const f = F && F.f[p.i]; if (!f) continue;
      const hx = f.x, hy = f.y - (f.z || 0) - 54, fade = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2;
      for (let s = 0; s < 3; s++) {
        const a = p.t * 4.2 * (1 - k * 0.5) + s * TAU / 3, x = hx + Math.cos(a) * 20, y = hy + Math.sin(a) * 6, z = 4.8 + Math.sin(a) * 1.1;
        g.save(); g.globalAlpha *= fade; starPath(g, x, y, z * 1.5, z * 0.65, 5, a); g.fillStyle = BD ? BK.yellow : '#ffd23c'; g.fill();
        starPath(g, x - 0.5, y - 0.6, z * 0.7, z * 0.3, 5, a); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fill(); g.restore();
      }
    } else if (p.k === 'ring') {
      if (k <= 0) continue;
      const c = p.col || (p.c === 'super' ? (BD ? BK.yellow : '#ffd23c') : (BD ? BK.cyan : '#7fe3ff'));
      g.strokeStyle = alpha(c, 0.9 * (1 - k)); g.lineWidth = 4 * (1 - k) + 1; g.beginPath(); g.arc(p.x, p.y, 8 + p.s * k, 0, TAU); g.stroke();
    } else if (p.k === 'spark') {   // the super-ready sparkles: little four-point stars flying out and fading
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
  else if (kind === 'heavy') { starPath(g, 0, 0, r * 0.9, r * 0.42, 8, -Math.PI / 2); g.fillStyle = col || Wt; g.fill(); }
  else if (kind === 'guard') {   // the front shield: a body and a thick arc in front of it
    g.fillStyle = alpha(col || Wt, 0.55); g.beginPath(); g.arc(-r * 0.22, 0, r * 0.26, 0, TAU); g.fill();
    g.strokeStyle = col || Wt; g.lineWidth = r * 0.22; g.beginPath(); g.arc(-r * 0.22, 0, r * 0.66, -1.05, 1.05); g.stroke();
  }
  else if (kind === 'step') {   // a quick step: where they were, faint, and where they are, a dash between
    g.strokeStyle = alpha(col || Wt, 0.5); g.lineWidth = r * 0.1; g.beginPath(); g.arc(-r * 0.42, 0, r * 0.26, 0, TAU); g.stroke();
    g.fillStyle = col || Wt; g.beginPath(); g.arc(r * 0.42, 0, r * 0.3, 0, TAU); g.fill();
    g.strokeStyle = col || Wt; g.lineWidth = r * 0.12; for (const yy of [-0.2, 0.2]) { g.beginPath(); g.moveTo(-r * 0.12, yy * r); g.lineTo(r * 0.06, yy * r); g.stroke(); }
  }
  else if (kind === 'coffee') {
    g.fillStyle = col || Wt; g.beginPath(); g.moveTo(-r * 0.42, -r * 0.4); g.lineTo(r * 0.42, -r * 0.4); g.lineTo(r * 0.3, r * 0.55); g.lineTo(-r * 0.3, r * 0.55); g.closePath(); g.fill();
    g.strokeStyle = col || Wt; g.lineWidth = r * 0.14; g.beginPath(); g.arc(r * 0.48, 0, r * 0.2, -1.3, 1.3); g.stroke();
    g.lineWidth = r * 0.1; for (let k = -1; k <= 1; k += 2) { g.beginPath(); g.moveTo(k * r * 0.15, -r * 0.55); g.quadraticCurveTo(k * r * 0.15 + r * 0.12, -r * 0.72, k * r * 0.15, -r * 0.9); g.stroke(); }
  }
  else if (kind === 'slide') {   // Tux's toboggan: an oval body shooting along with speed lines
    g.fillStyle = col || Wt; g.beginPath(); g.ellipse(r * 0.15, r * 0.1, r * 0.48, r * 0.26, 0, 0, TAU); g.fill();
    g.strokeStyle = col || Wt; g.lineWidth = r * 0.12; for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(-r * 0.85, r * 0.1 + k * r * 0.24); g.lineTo(-r * 0.45, r * 0.1 + k * r * 0.24); g.stroke(); }
  }
  else if (kind === 'super') { g.fillStyle = col || Y; g.beginPath(); g.moveTo(r * 0.15, -r * 0.85); g.lineTo(-r * 0.45, r * 0.12); g.lineTo(-r * 0.02, r * 0.12); g.lineTo(-r * 0.18, r * 0.85); g.lineTo(r * 0.45, -r * 0.15); g.lineTo(r * 0.02, -r * 0.15); g.closePath(); g.fill(); }
  else if (kind === 'ko') { starPath(g, 0, 0, r * 0.9, r * 0.45, 7, -Math.PI / 2); g.fillStyle = col || Rd; g.fill(); g.strokeStyle = Wt; g.lineWidth = r * 0.14; g.beginPath(); g.moveTo(-r * 0.22, -r * 0.22); g.lineTo(r * 0.22, r * 0.22); g.moveTo(r * 0.22, -r * 0.22); g.lineTo(-r * 0.22, r * 0.22); g.stroke(); }
  else if (kind === 'chit') {   // a counter hit: a big sharp red star, long white spikes behind it
    starPath(g, 0, 0, r * 1, r * 0.08, 4, Math.PI / 4); g.fillStyle = Wt; g.fill();
    starPath(g, 0, 0, r * 0.78, r * 0.3, 8, -Math.PI / 2); g.fillStyle = col || Rd; g.fill();
    starPath(g, 0, 0, r * 0.4, r * 0.17, 8, -Math.PI / 2 + Math.PI / 8); g.fillStyle = Y; g.fill();
  }
  else if (kind === 'flank' || kind === 'flankb') {   // got round the shield: the foe, their shield in front, a hit coming in from the side (or behind)
    g.fillStyle = alpha(Wt, 0.4); g.beginPath(); g.arc(0, 0, r * 0.3, 0, TAU); g.fill();
    g.strokeStyle = col || Wt; g.lineWidth = r * 0.16; g.beginPath(); g.arc(0, 0, r * 0.6, -0.95, 0.95); g.stroke();
    const back = kind === 'flankb', ax = back ? -r * 0.98 : -r * 0.1, ay = back ? 0 : -r * 0.98, bx = back ? -r * 0.42 : 0, by = back ? 0 : -r * 0.42, a = Math.atan2(by - ay, bx - ax);
    g.strokeStyle = Y; g.lineWidth = r * 0.17; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx - Math.cos(a) * r * 0.12, by - Math.sin(a) * r * 0.12); g.stroke();
    g.fillStyle = Y; g.beginPath(); g.moveTo(bx + Math.cos(a) * r * 0.08, by + Math.sin(a) * r * 0.08); g.lineTo(bx - Math.cos(a - 0.6) * r * 0.32, by - Math.sin(a - 0.6) * r * 0.32); g.lineTo(bx - Math.cos(a + 0.6) * r * 0.32, by - Math.sin(a + 0.6) * r * 0.32); g.closePath(); g.fill();
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
// { x, y, z }) and hud: false }
export function drawFight(F, dt, o = {}) {
  const v = viewOf(F), g = o.g || ctx, BD = bold(), humans = o.humans || [], VW = o.w || W, VH = o.h || H, D = o.dpr || DPR, clip = o.hud === false;
  v.t += dt; v.cardUp = !!o.results;   // (the results card is up: it has the winner's portrait, so the canvas's goes)
  if (F.phase !== v.phase) { v.phase = F.phase; v.phaseT = 0; if (F.phase === 'roundEnd' && F.roundWinner != null) v.pipT[F.roundWinner] = v.t; } else v.phaseT += dt;
  momentTick(v, F);
  v.shake = Math.max(0, v.shake - dt * 2.2);
  F.f.forEach((f, i) => {   // the front shield's show and the stamina bars, eased
    v.arc[i] += ((f.state === 'block' ? 1 : 0) - v.arc[i]) * (1 - Math.exp(-(f.state === 'block' ? 24 : 16) * dt));
    v.stam[i] += (stamOf(f) - v.stam[i]) * (1 - Math.exp(-12 * dt));
    if (dt === 0) { v.stam[i] = stamOf(f); if (f.state === 'block') v.arc[i] = 1; }   // (a still frame: shown as it is)
  });
  g.setTransform(D, 0, 0, D, 0, 0);
  const HS = hudScale(), hudH = clip ? 0 : 86 * HS + SAFE.t, pad = clip ? 0 : 12;
  const vb = { x: pad, y: hudH, w: VW - pad * 2, h: VH - hudH - pad - (clip ? 0 : 50 * HS) };
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
  // the fighters, the clones and the cups, nearer ones over farther
  const things = [...F.f.map(f => ({ y: f.y, d: () => fighter(g, F, v, f, humans) })),
    ...((F.A && F.A.solids) || []).map(o => ({ y: o.y + (o.shape === 'box' ? o.h / 2 - 4 : o.r * 0.4), d: () => drawSolid(g, o) })),
    ...(F.objs || []).filter(ob => ob.kind === 'clone').map(ob => ({ y: ob.y, d: () => clone(g, ob, v, F) })),
    ...kitThings(F, v, g),
    ...(F.objs || []).filter(ob => ob.kind === 'coffee').map(ob => ({ y: ob.y, d: () => coffee(g, ob, v.t) }))];
  things.sort((a, b) => a.y - b.y).forEach(t => t.d());
  drawFront(g, F, v.t, zs);   // (the wall's front stretch over them, the vents' heat)
  particles(g, v, dt, F);
  stopWorld(g, F, v, humans, VW, VH, D);
  superWorld(g, F, v, humans, VW, VH, D);
  if (!clip) { momentMark(g, v, F, D); momentWash(g, F, v, VW, VH, D); }
  g.restore();
  });
  if (!clip) momentAfter(g, v, VW, VH, D);
  v.names = o.names || null;   // (online: the players' names on the cards)
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
// a super, the moment it's used (v.sup, from the 'super' event, so every screen plays it): the world dims for ~0.4 s
// while the one using it is drawn again over the dim with speed lines in their colour bursting off them; the
// HUD adds the cut-in (superCut). Then the super's own effect plays as usual.
const SUP_T = 0.85;
function superWorld(g, F, v, humans, VW, VH, D) {
  const S = v.sup, sa = S ? v.t - S.t : 9, f = S && F.f[S.i];
  if (!f || sa < 0 || sa > SUP_T) return;
  const BD = bold(), col = PCOL[S.i], env = sa < 0.06 ? sa / 0.06 : sa < 0.4 ? 1 : clamp(1 - (sa - 0.4) / 0.3, 0, 1);
  if (env > 0) { g.save(); g.setTransform(D, 0, 0, D, 0, 0); g.fillStyle = `rgba(12,10,34,${(0.5 * env).toFixed(3)})`; g.fillRect(0, 0, VW, VH); g.restore(); }
  const x = f.x, y = f.y - (f.z || 0) - 26, k = clamp(sa / 0.6, 0, 1);
  if (sa < 0.05 || S.sy == null) { const m = g.getTransform(); S.sy = (m.b * x + m.d * y + m.f) / D / VH; }   // (where they are on screen: the cut-in keeps clear of them)
  if (k < 1) {   // speed lines bursting outward
    g.save(); g.lineCap = 'round';
    for (let n = 0; n < 16; n++) {
      const a = n / 16 * TAU + (n % 2) * 0.12, r0 = 34 + k * 260 + (n % 3) * 14, r1 = r0 + 70 * (1 - k) + 12;
      g.strokeStyle = alpha(n % 4 === 0 ? '#ffffff' : col, 0.9 * (1 - k)); g.lineWidth = (n % 2 ? 3 : 5) * (1 - k * 0.5);
      g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0 * 0.8); g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1 * 0.8); g.stroke();
    }
    g.restore();
  }
  if (env > 0) fighter(g, F, v, f, humans);
}
// the HUD's part of a super: a band in their colour sweeping across the middle of the screen with their portrait riding
// it (from their side, a beat in the middle, out the far side), the super's bolt beside it, speed lines in the band. No words.
function superCut(g, F, v, Wh, Hh) {
  const S = v.sup, sa = S ? v.t - S.t : 9;
  if (!S || sa < 0 || sa > SUP_T || !F.f[S.i]) return;
  const BD = bold(), col = PCOL[S.i], dir = S.i === 1 ? -1 : 1, cy = Hh * ((S.sy ?? 0.5) < 0.5 ? 0.68 : 0.32), bh = 74;
  const open = sa < 0.12 ? sa / 0.12 : sa > SUP_T - 0.15 ? (SUP_T - sa) / 0.15 : 1, e = 1 - Math.pow(1 - clamp(open, 0, 1), 3);
  const h = bh * e;
  g.save();
  g.translate(Wh / 2, cy); g.transform(1, 0, -0.18, 1, 0, 0);
  if (BD) { g.fillStyle = BK.ink; g.fillRect(-Wh, -h / 2 - 5, Wh * 2, h + 10); }
  else { g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(-Wh, -h / 2 - 4, Wh * 2, h + 8); }
  g.fillStyle = col; g.fillRect(-Wh, -h / 2, Wh * 2, h);
  g.save(); g.beginPath(); g.rect(-Wh, -h / 2, Wh * 2, h); g.clip();
  g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineCap = 'round';
  for (let n = 0; n < 9; n++) {   // speed lines running against the portrait's travel
    const yy = ((n * 37) % 64 - 32) / 64 * bh, len = 60 + (n * 53) % 90, xx = ((n * 211 - dir * sa * 1800) % (Wh * 1.6) + Wh * 1.6) % (Wh * 1.6) - Wh * 0.8;
    g.lineWidth = n % 3 ? 2 : 3.5; g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + len, yy); g.stroke();
  }
  g.restore();
  g.restore();
  // the portrait: in fast from their side, a slow drift through the middle, out the far side
  const pin = clamp(sa / 0.16, 0, 1), pout = clamp((sa - 0.62) / 0.2, 0, 1);
  const px = Wh / 2 + dir * (-50 - Math.pow(1 - pin, 3) * Wh * 0.6 + Math.max(0, sa - 0.16) * 60 + pout * pout * Wh * 0.8);
  const R = 46;
  if (h > 20) {
    g.save(); g.globalAlpha *= clamp(h / bh * 1.4, 0, 1);
    fightHead(g, charOf(F.f[S.i].id), px, cy, R, '#ffffff', 'happy', v.t);
    if (BD) { g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.beginPath(); g.arc(px, cy, R, 0, TAU); g.stroke(); }
    g.translate(px + dir * (R + 30), cy); const s = 1 + 0.15 * Math.sin(sa * 30);
    g.scale(s, s); fightIcon(g, 'super', 26, BD ? BK.ink : 'rgba(20,16,42,0.55)'); g.translate(-2, -2); fightIcon(g, 'super', 26, BD ? BK.yellow : '#ffd23c');
    g.restore();
  }
}
function hud(g, F, v, dt, HS, humans, keys) {
  const BD = bold(), top = 10 + SAFE.t, TXT = BD ? BK.text : '#ffffff', SOFT = BD ? BK.muted : '#9aa3bd';
  g.save(); g.scale(HS, HS);
  momentUnder(g, F, v, dt, W / HS, H / HS);   // (the match won: streamers, the big portrait; under the cards)
  const Wh = W / HS, cw = Math.min(380, (Wh - 120) / 2 - 12), ch = 70, need = Math.ceil((F.cfg.bestOf || 3) / 2);
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
    const nm = v.names && v.names[i] ? String(v.names[i]).slice(0, 14) : '', tag = nm ? nm : isBot ? 'BOT' : humans.length > 1 || (F.cfg.bots && F.cfg.bots.every(b => b == null)) ? 'P' + (i + 1) : '';
    g.fillText(C.name, nx, y + 17);
    const nw = g.measureText(C.name).width;
    if (tag) { g.font = txt(10, 800); const tw = g.measureText(tag).width + 10, tx = right ? nx - nw - 8 - tw : nx + nw + 8; g.fillStyle = isBot && !nm ? (BD ? BK.surface2 : 'rgba(255,255,255,0.18)') : col; g.beginPath(); g.roundRect(tx, y + 10, tw, 15, 7); g.fill(); g.fillStyle = TXT; g.textAlign = 'center'; g.fillText(tag, tx + tw / 2, y + 18); }
    // the round pips (wins), at the far end of the name row
    for (let k = 0; k < need; k++) {
      const cx = right ? x + 16 + k * 18 : x + cw - 16 - k * 18, on = k < f.wins, pop = on && k === f.wins - 1 && hurtT < 0.5 ? 1 + 0.6 * Math.sin(hurtT / 0.5 * Math.PI) : 1;
      g.beginPath(); g.arc(cx, y + 17, 6.5 * pop, 0, TAU); g.fillStyle = on ? (BD ? BK.yellow : '#ffc93c') : (BD ? BK.well : 'rgba(0,0,0,0.35)'); g.fill();
      if (!on) { g.strokeStyle = BD ? BK.line : 'rgba(255,255,255,0.25)'; g.lineWidth = 1.5; g.stroke(); }
    }
    // health: a bar in their colour, a pale trail draining after it
    const bx = right ? x + 12 : px + 34, bw = cw - 12 - 34 - 34 + 0, by = y + 30, bh = 13;
    const hp = clamp(f.hp / f.maxHp, 0, 1), hold = v.t - v.hurt[i].t < 0.45;   // (the trail holds a moment, then drains)
    if (!hold) v.hp[i] = Math.max(f.hp, lerp(v.hp[i], f.hp, 1 - Math.exp(-3.2 * dt)));
    if (f.hp > v.hp[i]) v.hp[i] = f.hp;
    const trail = clamp(v.hp[i] / f.maxHp, 0, 1);
    g.fillStyle = BD ? BK.well : 'rgba(0,0,0,0.45)'; g.beginPath(); g.roundRect(bx, by, bw, bh, 7); g.fill();
    const seg = (a, b, fill) => { if (b <= a) return; const x0 = right ? bx + bw * (1 - b) : bx + bw * a, w = bw * (b - a); g.fillStyle = fill; g.beginPath(); g.roundRect(x0, by, w, bh, Math.min(7, w / 2)); g.fill(); };
    seg(0, trail, hold ? (BD ? '#ffe2dc' : 'rgba(255,230,225,0.9)') : (BD ? '#ff8f80' : 'rgba(255,120,105,0.85)'));   // (the chunk just lost: pale, then red as it drains)
    const low = hp < 0.3, hcol = low && Math.sin(v.t * 10) > 0 ? (BD ? BK.red : '#ff4b3e') : col;
    seg(0, hp, hcol);
    if (!BD && hp > 0) { const x0 = right ? bx + bw * (1 - hp) : bx; g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.roundRect(x0 + 2, by + 2, Math.max(0, bw * hp - 4), 4, 2); g.fill(); }
    // under the health, from the portrait's side: the stamina bar (green, amber when low; gassed it flashes red), and
    // with supers on the super meter beside it, a thin bar with its bolt that glows when full
    const at = (a, w) => right ? bx + bw - a - w : bx + a, ry = by + bh + 5, rh = 8, K3 = kit3(f.id), sups = F.cfg.supers !== false && !!(FIGHTERS[f.id] && FIGHTERS[f.id].moves.super);
    if (K3) {   // Tux and Duke (2026-10-23: no stamina, no super): their three moves and evade as little icons, each with its cooldown
      ACTS4.forEach((a, k) => { const r = 8, cx = at(k * 24 + r, 0); moveChip(g, cx, ry + r - 2, r, f, KIT_ACT[a], col, 1); });
    }
    else {
    const sW = sups ? Math.round(bw * 0.62) : bw, st = clamp(v.stam[i], 0, 1), gas = gassedOf(f), fl = gas && Math.sin(v.t * 18) > 0;
    const RD = BD ? BK.red : '#ff4b3e';
    g.fillStyle = gas ? alpha(RD, fl ? 0.45 : 0.22) : BD ? BK.well : 'rgba(0,0,0,0.45)'; g.beginPath(); g.roundRect(at(0, sW), ry, sW, rh, 4); g.fill();
    if (st > 0.002) {
      const w = Math.max(rh, sW * st), sc = gas ? (fl ? RD : (BD ? '#ffb2a8' : '#ffb7ad')) : st < 0.3 ? (BD ? BK.yellow : '#ffc93c') : (BD ? BK.green : '#5fe08f');
      g.fillStyle = sc; g.beginPath(); g.roundRect(at(0, w), ry, w, rh, 4); g.fill();
      if (!BD) { g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.roundRect(at(0, w) + 2, ry + 1.5, Math.max(0, w - 4), 2.5, 1.2); g.fill(); }
    }
    if (sups) {
      const m = clamp(f.meter || 0, 0, 1), full = m >= 1, Y = BD ? BK.yellow : '#ffd23c', rt = v.t - v.ready[i];
      const mA = sW + 22, mW = Math.max(12, bw - mA), mh = 5, my = ry + (rh - mh) / 2, mx = at(mA, mW), p = full ? 0.75 + 0.25 * Math.sin(v.t * 6) : 1;
      if (full) {   // ready: a flat halo round the bar, brighter for a moment as it fills
        const pop = rt >= 0 && rt < 0.5 ? 1 - rt / 0.5 : 0, gw = 2 + 2 * p + 3 * pop;
        g.fillStyle = alpha(Y, (BD ? 0.3 : 0.25) * p + 0.4 * pop); g.beginPath(); g.roundRect(mx - gw, my - gw, mW + gw * 2, mh + gw * 2, 2.5 + gw); g.fill();
      }
      g.fillStyle = BD ? BK.well : 'rgba(0,0,0,0.4)'; g.beginPath(); g.roundRect(mx, my, mW, mh, 2.5); g.fill();
      const mw = mW * m;
      g.fillStyle = full ? Y : (BD ? BK.violet : '#b18cff'); if (mw > 0.5) { g.beginPath(); g.roundRect(right ? mx + mW - mw : mx, my, mw, mh, 2.5); g.fill(); }
      if (full) {   // a shimmer running along it
        const sx = mx - 20 + ((v.t * 0.9) % 1.4) / 1.4 * (mW + 40);
        g.save(); g.beginPath(); g.roundRect(mx, my, mW, mh, 2.5); g.clip(); g.fillStyle = 'rgba(255,255,255,0.75)';
        g.beginPath(); g.moveTo(sx, my + mh); g.lineTo(sx + 5, my); g.lineTo(sx + 11, my); g.lineTo(sx + 6, my + mh); g.closePath(); g.fill(); g.restore();
      }
      const ip = full && rt >= 0 && rt < 0.4 ? 1 + 0.7 * Math.sin(rt / 0.4 * Math.PI) : full ? 1 + 0.08 * Math.sin(v.t * 6) : 1;
      g.save(); g.translate(at(sW + 11, 0), ry + rh / 2); g.scale(ip, ip); fightIcon(g, 'super', 7.5, full ? Y : SOFT); g.restore();
    }
    }
    // Bugdroid's battery: a little cell per zap charge under the stamina, filling as it recharges
    const BT = f.stats && f.stats.battery;
    if (BT) {
      const my = ry + rh + 3, cw2 = 11, chh = 6;
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
    const right = K.fi === 1, col = PCOL[K.fi], u = 27, Hh = H / HS;
    const base = F.round > 1 || F.phase === 'over' ? 0.4 : 0.85, id = F.f[K.fi] && F.f[K.fi].id;
    const sz = K.src === 'pad' ? padSize(u) : keysSize(K.L, u), y = Hh - sz.h - 14 - SAFE.b / HS, f = F.f[K.fi];
    g.save(); g.translate(right ? Wh - 16 - sz.w : 16, y);
    if (K.src === 'pad') drawPad(g, K.held, col, u, base, id, f); else drawKeys(g, K.L, K.held, col, u, base, id, f);
    g.restore();
    if (kit3(id)) {   // the moves' names over the keys, each with its key, its icon and its cooldown
      const lh = legendSize(u).h; g.save(); g.translate(right ? Wh - 16 - legendSize(u).w : 16, y - lh - 6); drawLegend(g, id, K.src === 'pad' ? 'pad' : K.L, K.held, col, u, base, f, right); g.restore();
    }
  }
  // the round clock in the middle (in sudden death a pulsing red disc with the damage multiplier), the round under it as dots
  const cx = Wh / 2, cy = top + 30, r = 26;
  if (F.phase === 'sudden') {
    const p = 0.5 + 0.5 * Math.sin(v.t * 7);
    g.fillStyle = alpha(BD ? BK.red : '#ff4b3e', 0.75 + 0.25 * p); g.beginPath(); g.arc(cx, cy, r * (1 + 0.08 * p), 0, TAU); g.fill();
    g.font = disp(16); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff';
    g.fillText('×' + (F.dmgMul || 1.5).toFixed(1), cx, cy + 1.5);
  } else {
    panel(g, cx - r, cy - r, r * 2, r * 2, r, 0.84);
    const s = Math.ceil(F.clock ?? 0), warn = s <= 10 && F.phase === 'fight';
    g.font = disp(s >= 100 ? 18 : 22); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = warn && Math.sin(v.t * 10) > 0 ? (BD ? BK.red : '#ff6b5e') : TXT;
    g.fillText(String(s), cx, cy + 1.5);
  }
  const nr = F.cfg.bestOf || 3;
  for (let k = 0; k < nr; k++) { g.beginPath(); g.arc(cx + (k - (nr - 1) / 2) * 11, cy + r + 9, 3.2, 0, TAU); g.fillStyle = k < F.round ? TXT : (BD ? alpha(BK.text, 0.25) : 'rgba(255,255,255,0.3)'); g.fill(); }
  // the round's end: a burst over the winner's new pip is in the card; the loser's side dims a touch
  // the icon feed at the bottom middle
  feed(g, F, v, dt, Wh, H / HS, humans);
  momentOver(g, F, v, Wh, H / HS);   // (the round intro, 3 2 1, the start: draw-moments.js)
  superCut(g, F, v, Wh, H / HS);
  g.restore();
}
function feed(g, F, v, dt, Wh, Hh, humans) {
  const BD = bold(), FH = 36, top = Hh - FH - 12 - (v.reserve || SAFE.b) / hudScale(), live = v.feed.filter(e => v.t - e.t < FEED_T);
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
      if (p[0] === 'h') { const i = +p.slice(2), f = F.f[i]; fightHead(g, charOf(f.id), mx, cy, 12, PCOL[i], p === 'h:' + e.b && e.kind !== 'super' ? 'dizzy' : null, v.t); }
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
// a three-move fighter's keys (Tux and Duke since 2026-10-23): light, heavy and special fire move1..3, guard the evade
export const KIT_ACT = { light: 'move1', heavy: 'move2', special: 'move3', guard: 'evade' };
const ACTS4 = ['light', 'heavy', 'special', 'guard'];
export const kit3 = id => !!(FIGHTERS[id] && FIGHTERS[id].kit3);
const actIcon = (a, id) => {
  const M = FIGHTERS[id] && FIGHTERS[id].moves;
  if (kit3(id) && KIT_ACT[a]) { const mv = M[KIT_ACT[a]]; return (mv && mv.icon) || (a === 'guard' ? 'guard' : 'light'); }
  return a === 'special' ? ((M && M.special && M.special.icon) || 'slide') : a;
};
// a move's short name for the key display
const SHORT = { toboggan: 'Torpedo', iceberg: 'Iceberg', fork: 'fork()', iceblock: 'Ice Block', portal: 'Portal', stopworld: 'Stop World', geyser: 'Geyser', gc: 'GC' };
export const shortName = mv => mv ? mv.short || SHORT[mv.icon] || mv.name : '';
// how much of a move's cooldown is left (1: just used or going on, 0: ready); Duke's evade: its charges instead
export function cdLeft(f, mk) {
  if (!f || !mk) return 0;
  const St = FIGHTERS[f.id], mv = St && St.moves[mk]; if (!mv) return 0;
  if (f.move === mk && f.state !== 'recover') return 1;
  const C = chargesOf(f, mk); if (C) return C.n > 0 ? 0 : 1 - C.q;
  const c = (f.cd || [])[['move1', 'move2', 'move3', 'evade'].indexOf(mk)] || 0;
  return mv.cooldown ? clamp(c / mv.cooldown, 0, 1) : c > 0 ? 1 : 0;
}
// an evade with charges (Duke's): { n, max, q: the next one's refill 0..1 }
export function chargesOf(f, mk = 'evade') {
  const E = f && FIGHTERS[f.id] && FIGHTERS[f.id].moves[mk]; if (!E || !E.charges) return null;
  const n = f.ev ?? E.charges; return { n, max: E.charges, q: n < E.charges && E.recharge ? clamp(1 - (f.evT || 0) / E.recharge, 0, 1) : 0 };
}
// the cooldown left as a dark sweep over a round thing (from 12 o'clock, clockwise: the part still to come back)
function sweep(g, x, y, r, left) {
  if (left <= 0.005) return;
  g.fillStyle = 'rgba(10,8,26,0.62)'; g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * left); g.closePath(); g.fill();
}
// a charge's pips (Duke's evade): filled while there, the next one filling
function pips(g, x, y, C, col) {
  for (let k = 0; k < C.max; k++) { const px = x + (k - (C.max - 1) / 2) * 7; g.beginPath(); g.arc(px, y, 2.6, 0, TAU); g.fillStyle = bold() ? BK.well : 'rgba(0,0,0,0.5)'; g.fill(); const q = k < C.n ? 1 : k === C.n ? C.q : 0; if (q > 0) { g.beginPath(); g.arc(px, y, 2.6 * (k < C.n ? 1 : 0.5 + 0.5 * q), 0, TAU); g.fillStyle = k < C.n ? col : alpha(col, 0.5); g.fill(); } }
}
// one move as a round chip (the HUD card's): its icon, the cooldown sweep, Duke's charges under it
function moveChip(g, x, y, r, f, mk, col, a = 1) {
  const BD = bold(), mv = FIGHTERS[f.id].moves[mk], left = cdLeft(f, mk), C = chargesOf(f, mk);
  g.save(); g.globalAlpha *= a;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = left > 0 ? (BD ? BK.well : 'rgba(0,0,0,0.45)') : (BD ? BK.surface2 : 'rgba(255,255,255,0.16)'); g.fill();
  g.save(); g.translate(x, y); fightIcon(g, mv ? mv.icon : mk, r * 0.78, left > 0 ? (BD ? BK.muted : '#9aa3bd') : '#ffffff'); g.restore();
  sweep(g, x, y, r, left);
  if (left <= 0) { g.strokeStyle = alpha(col, 0.9); g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); }
  if (C) pips(g, x, y + r + 4, C, col);
  g.restore();
}
// the moves' names (a three-move fighter's), a row each over the keys: the key, the icon, the name, the cooldown as a bar
export const legendSize = u => ({ w: u * 4.6, h: u * 0.62 * 4 + 3 * 3 });
export function drawLegend(g, id, L, held, col, u, base = 1, f = null, right = false) {
  const BD = bold(), M = FIGHTERS[id].moves, rh = u * 0.62, W = legendSize(u).w, TX = BD ? BK.text : '#ffffff';
  ACTS4.forEach((a, k) => {
    const mk = KIT_ACT[a], mv = M[mk], y = k * (rh + 3), on = !!(held && held[a]), left = cdLeft(f, mk), C = chargesOf(f, mk);
    g.globalAlpha = on ? 1 : Math.max(base, 0.55);
    if (BD) bpanel(g, 0, y, W, rh, rh / 2, 0.8); else { g.fillStyle = 'rgba(16,20,34,0.72)'; g.beginPath(); g.roundRect(0, y, W, rh, rh / 2); g.fill(); }
    if (left > 0) { g.fillStyle = BD ? BK.well : 'rgba(0,0,0,0.4)'; g.beginPath(); g.roundRect(0, y, W, rh, rh / 2); g.fill(); g.fillStyle = alpha(col, 0.35); g.beginPath(); g.roundRect(0, y, Math.max(rh, W * (1 - left)), rh, rh / 2); g.fill(); }   // (filling back up)
    if (on) { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.roundRect(1, y + 1, W - 2, rh - 2, rh / 2 - 1); g.stroke(); }
    const lab = L === 'pad' ? PAD[a] : keyLabel(LAYOUTS[L].keys[a][0]);
    g.font = `800 ${Math.round(rh * 0.5)}px ${BD ? BOLD_FONT : FONT}`; g.textBaseline = 'middle'; g.textAlign = 'center';
    const kw = Math.max(rh * 0.95, g.measureText(lab).width + 8);
    g.fillStyle = left > 0 ? (BD ? BK.surface : 'rgba(255,255,255,0.12)') : col; g.beginPath(); g.roundRect(3, y + 2.5, kw, rh - 5, 4); g.fill();
    g.fillStyle = '#ffffff'; g.fillText(lab, 3 + kw / 2, y + rh / 2 + 0.5);
    g.save(); g.translate(3 + kw + rh * 0.55, y + rh / 2); fightIcon(g, mv ? mv.icon : a, rh * 0.38, left > 0 ? (BD ? BK.muted : '#9aa3bd') : '#ffffff'); g.restore();
    g.font = `700 ${Math.round(rh * 0.46)}px ${BD ? BOLD_FONT : FONT}`; g.textAlign = 'left'; g.fillStyle = left > 0 ? (BD ? BK.muted : '#9aa3bd') : TX;
    g.fillText(shortName(mv), 3 + kw + rh * 1.1, y + rh / 2 + 0.5);
    if (C) pips(g, W - 6 - (C.max - 1) * 3.5 - 2, y + rh / 2, C, col);
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
    if (kit3(id) && KIT_ACT[a]) {   // a three-move fighter's: the move's icon big on the key, its cooldown swept over it, Duke's charges
      const mk = KIT_ACT[a], left = cdLeft(f, mk), C = chargesOf(f, mk), ix = x + w - u * 0.3, iy = y + h - u * 0.32, ir = u * 0.25;
      g.save(); g.translate(ix, iy); fightIcon(g, actIcon(a, id), ir, on ? '#ffffff' : left > 0 ? alpha(MU, 0.6) : TX); g.restore();
      if (f) { g.save(); g.beginPath(); g.roundRect(x, y, w, h, Math.min(5, h * 0.25)); g.clip(); sweep(g, x + w / 2, y + h / 2, Math.hypot(w, h) / 2, left); g.restore(); }
      if (C && f) pips(g, x + w / 2, y + h - 3.5, C, col);
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
  for (const [a, lab, ox, oy, lc] of [...(ACTIONS.includes('grab') ? [['grab', 'Y', 0, -1, '#f5c400']] : []), ['heavy', 'X', -1, 0, '#3f8cff'], ['special', 'B', 1, 0, '#ff4b3e'], ['light', 'A', 0, 1, '#2fc27a']]) {
    const on = !!h[a], x = fx + ox * q, y = fy + oy * q;
    g.globalAlpha = on ? 1 : base; g.fillStyle = on ? col : BD ? BK.surface2 : 'rgba(22,26,44,0.82)'; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
    g.strokeStyle = on ? '#fff' : lc; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = on ? '#fff' : lc; g.font = `800 ${u * 0.36}px ${bold() ? BOLD_FONT : FONT}`; g.fillText(lab, x, y + 0.5);
  }
  g.globalAlpha = base;
  for (const [a, ox, oy] of [...(ACTIONS.includes('grab') ? [['grab', 0.75, -1.25]] : []), ['heavy', -1.75, -0.6], ['special', 1.75, -0.6], ['light', 0.75, 1.25]]) { g.save(); g.translate(fx + ox * q, fy + oy * q); fightIcon(g, actIcon(a, id), u * 0.18, h[a] ? '#fff' : MU); g.restore(); }
  g.restore();
}
