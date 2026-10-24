// Kernel Kart: drawing Tux's and Duke's three moves each (the rebuild, 2026-10-23, the user: "have big animations if
// needed"; the sim: js/fight-kits.js toboggan .. geyser, its phases, objects and events in docs/fight-api-tux-duke.md).
// Cosmetic only, like draw-kits.js, which hooks these in. Every move's tell has to read on every arena (the counterplay
// reads it), but as part of the world, not a sign on it (2026-10-23, the user: "i dont like the graphics of these like
// red outlines and stuff"): soft shadows, tracks, ripples and stains with no outlines and no player colours on the floor
// (the penguins' faint tint aside); each pairs a light part with a soft dark part so it reads on a pale floor and a dark
// one alike. And a notch calmer ("its a little too much/fast/whatever/big right now"): smaller squash, hops and bursts.
// In 3D since 2026-10-24 ("the animations and effects just look like simple 2d graphics"; "that is the calliber you
// should be at"): the set pieces, particles and floor marks are art/prop3d.js's baked props and bits (glacier, ice cube,
// ice patch, snow mounds, portal ring, coffee pot, geyser column, puddle; ice, snow, steam, drops, crystals, stone,
// cubes), the 2D looks below standing in until they're baked; a miss's recovery is a calm settle, not a stun.
//   moveAnim     a move (or an evade: Tux's Ice Block, Duke's Garbage Collect) played as a short run of poses: squash and stretch, hop, spin, wiggle, lean and fades, from the
//                move's phase (f.ph) and how long it's been in it (f.pht); anticipation, a soft settle after each change
//   hitAnim / poseFade   Tux's and Duke's hit reactions (hurt, stagger, getting up, a freeze), and the pose crossfade
//                (the pose before fades out under the new one over ~0.09 s)
//   moveGround   flat on the floor: the ice patch (3D: a slab of faceted ice, a glint sliding over it), the toboggan's carved groove and its path
//                (tobline: a faint snowy track with a row of little snow tufts, off the wall once, a soft puff where it
//                bounces), the iceberg's shadow (a soft round shadow growing and darkening as he comes down, its size
//                the reach, snowflakes drifting into it), the portal behind the foe (a small coffee-and-cream swirl on
//                the floor, a soft glow, a few sparkles), the time-stop ripple (a soft grey water ripple spreading from
//                Duke, a light crest and a soft trough, its full reach a very faint tint; a soft flash as it completes)
//                and the geyser's spot (a wet coffee stain, bubbling and cracking the ground as it brews)
//   moveThings   standing among the fighters: the glacier coming down with Tux on top and breaking as it lands, the little
//                fork penguins (tiny Tux waddling, popping out, belly-sliding, a faint tint of his colour under their
//                feet), the coffee pot in flight, brewing on its mark, the eruption; Duke's portal rings and fork()'s
//                snow mounds lie on the floor (moveGround); puddle3D the geyser's puddle
//   moveBehind   before a fighter: hidden while Duke's between portals or Tux is up out of shot (or riding the glacier);
//                the ice block's back, the toboggan's wake, snow off him as he leaps
//   moveOver     after a fighter: the snap's spark at his fingers, the frozen statue's cracks as it thaws, the ice
//                block's see-through front over Tux (hits clink off it with a spark; then it bursts into chunks)
//   moveEvent / moveFx / moveIcon   the events' particles (snow, ice shards, coffee drops, steam, warps ...), their
//                drawing, and the six moves' icons (the keys, the feed)
// Shakes only on the iceberg's landing and the eruption, softly; the iceberg landing on someone nudges the camera in a
// hair (v.punch, draw-fight.js camera).
import { PCOL, TAU, clamp, frnd, lerp } from './core.js';
import { CHARACTERS } from './core.js';
import { BK, bold } from './look.js';
import * as M3 from './art/model3d.js';
import { SCALE, burst, model, puff, shadow, starPath } from './draw-fight.js';
import { FIGHTERS } from './fight-chars.js';
import { ART, settleAnim } from './art/kits.js';
import { GLACIER_TOP, bit3, bits3, decal3, drawProp3D, propReady, propsFor, release3 } from './art/prop3d.js';

// the 3D set pieces (2026-10-24, the user: "the 3d models look so good, but the animations and effects just look like
// simple 2d graphics ... tux's jump down with ice should be like a whole good looking glacier with tux standing on top
// of it"; "that is the calliber you should be at"): baked with each fight's fighters (art/prop3d.js); until a prop is
// made (or with no WebGL) the 2D look below stands in
propsFor('tux', ['glacier', 'icecube', 'icepatch', 'snowpile']);
propsFor('duke', ['pot', 'gcol', 'froth', 'gsplash', 'portal', 'puddle/coffee']);
const P3 = id => propReady(id);
const BITS_GC = ['bitO', 'bitB', 'bitW', 'bitG', 'paper'];

const charOf = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
const hexA = (h, a) => { const n = parseInt(String(h).slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${clamp(a, 0, 1).toFixed(3)})`; };
const rgba = (r, g, b, a) => `rgba(${r},${g},${b},${clamp(a, 0, 1).toFixed(3)})`;
const hsh = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const backE = k => { k = clamp(k, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const ink = () => bold() ? BK.ink : '#141a2e';
const colOf = o => PCOL[o.owner ?? 0] || PCOL[0];
const JAVA_O = '#f89820', JAVA_B = '#5382a1';
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }
// a soft round shape: a radial gradient from the middle out, given as [at 0..1, 'r,g,b', alpha] stops, filled over r
function softDisc(g, x, y, r, stops, r0 = 0) {
  if (r <= 0.5) return;
  const gr = g.createRadialGradient(x, y, Math.max(0, r0), x, y, r);
  for (const [at, c, a] of stops) gr.addColorStop(clamp(at, 0, 1), `rgba(${c},${clamp(a, 0, 1).toFixed(3)})`);
  g.fillStyle = gr; circle(g, x, y, r); g.fill();
}

// ---------------------------------------------------------------- a move's animation (fighter() in draw-fight.js)
// { sx, sy: the model's squash and stretch, hop: up off the floor, spin: added to its yaw, lean (rad), fwd: moved along
// its facing, wx: a sideways wiggle on screen, alpha, s: its size, mood } or null outside a move. k: s in the phase.
// The quality pass (2026-10-24, the user: "all animations and looks to be better"; still a notch calm): every pose
// change has a little anticipation before it and a settle after it (a soft spring: a small overshoot that dies away), the
// crouch builds tension toward the launch, the slide leans into its steering, and the follow-throughs carry on a moment
const spring = (k, w, d) => Math.exp(-k * d) * Math.cos(k * w);   // (1 at the start, wobbling down to 0)
const bump = u => Math.sin(Math.PI * clamp(u, 0, 1));             // (0 .. 1 .. 0)
export function moveAnim(F, v, f) {
  const ph = f.ph; if (!ph) return null;
  if (ART[f.id] && ART[f.id].anim) return ART[f.id].anim(F, v, f);   // (a plug-in fighter's own: js/art/kit-<id>.js)
  const k = f.pht || 0, t = v.t + f.i, A = { sx: 1, sy: 1, hop: 0, spin: 0, lean: 0, fwd: 0, wx: 0, alpha: 1, s: 1, mood: undefined };
  const sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
  const wind = f.state === 'wind' ? Math.max(0.05, f.dur || 0.3) : 0, u = wind ? clamp(k / wind, 0, 1) : 1;
  switch (ph) {
    // ---- Tux
    case 'crouch': {   // down into it (a soft overshoot), then the wiggle building toward the launch, pulling back a touch
      sq(0.1 * (1 - spring(k, 26, 14)) + 0.014 * Math.sin(k * 38) * u);
      A.wx = Math.sin(k * 28) * (0.5 + 1.1 * u); A.lean = Math.sin(k * 28) * 0.03 * (0.4 + u); A.fwd = -1.5 - 1.6 * u;
      break;
    }
    case 'slide': {   // off stretched along the way he goes (settling), a gentle bob, leaning into the steering
      const s = 0.13 * spring(k, 16, 7) + 0.025, c = Math.abs(Math.cos(f.face)), d = Math.abs(Math.sin(f.face));
      A.sx *= 1 + s * c - s * 0.4 * d; A.sy *= 1 + s * d * 0.7 - s * 0.45 * c; A.hop = Math.abs(Math.sin(k * 14)) * 0.6;
      const ln = (F.objs || []).find(o => o.kind === 'tobline' && o.owner === f.i);
      if (ln) A.lean = clamp(-(ln.aw || 0) * 0.09 * Math.sign(Math.cos(f.face) || 1), -0.1, 0.1);
      A.fwd = 2 * (1 - spring(k, 12, 8));
      break;
    }
    case 'skid': sq(0.06 * spring(k, 20, 9)); A.wx = Math.sin(k * 26) * 0.8 * Math.exp(-k * 8); A.fwd = 3 * ease(k / 0.25); break;   // carried on a moment as he stops
    case 'belly': { const D = (FIGHTERS[f.id] && FIGHTERS[f.id].moves.move1 && FIGHTERS[f.id].moves.move1.belly) || 0.75, S = settleAnim(k, D, k < 0.22 ? 'slide' : 'crouch', 0.42); Object.assign(A, S); if (k < 0.22) A.fwd = 3 * ease(k / 0.22); break; }   // (missed: the slide runs out and he pushes up off his belly, back on his feet: a calm settle, not a daze; 2026-10-24)
    case 'leap': {   // a spring: down (anticipation), then a stretch up and off
      const w = Math.max(0.05, f.state === 'wind' ? f.dur : 0.2), q = clamp(k / w, 0, 1);
      if (q < 0.55) sq(0.15 * ease(q / 0.55)); else { const r = (q - 0.55) / 0.45; sq(0.15 * (1 - ease(r * 1.6)) - 0.2 * ease(r)); A.hop = r * r * 9; }
      break;
    }
    case 'up': sq(-0.2); break;
    case 'drop': A.sx *= 0.9; A.sy *= 1.15; break;
    case 'land': sq(0.24 * spring(k, 20, 7.5)); A.hop = Math.max(0, Math.sin(k * 20)) * 1.5 * Math.exp(-k * 10) + bergDown(f); break;   // the splat: squashed, wobbling back (off the glacier as it breaks under him)
    case 'dizzy': { const D = (FIGHTERS[f.id] && FIGHTERS[f.id].moves.move2 && FIGHTERS[f.id].moves.move2.dizzy) || 0.95; Object.assign(A, settleAnim(k, D, 'land', 0.4)); sq(0.18 * spring(k, 20, 7.5)); A.fwd = 0; A.hop = bergDown(f); break; }   // (landed on nothing: he lands his weight, straightens up and breathes out, a calm settle; 2026-10-24)
    case 'summon': {   // a dip, then up on his toes bouncing, flippers up
      if (k < 0.1) sq(0.06 * ease(k / 0.1));
      else { const r = k - 0.1; sq(0.06 * spring(r, 18, 10) - 0.05 + 0.02 * Math.sin(r * 20)); A.hop = Math.abs(Math.sin(r * 10)) * 2.6; }
      A.mood = 'happy'; break;
    }
    case 'fork': sq(-0.1 * spring(k, 24, 10)); A.mood = 'happy'; break;   // the pop as they come out
    // ---- Duke
    case 'spin': {   // spinning faster and smaller into nothing
      const q = clamp(k / Math.max(0.05, f.state === 'wind' ? f.dur : 0.22), 0, 1);
      A.spin = k * 18 + k * k * 90; A.s = 1 - 0.38 * q * q; A.sy *= 1 + 0.12 * q; A.alpha = 1 - Math.pow(q, 1.7); A.hop = P3('portal') ? -ease(q) * 9 : ease(q) * 6;   // (into the portal ring under him)
      if (k < 0.05) sq(0.05 * ease(k / 0.05));   // (a crouch into it)
      break;
    }
    case 'gone': A.alpha = 0; break;
    case 'out': { const q = clamp(k / 0.1, 0, 1); A.s = 0.6 + 0.4 * backE(q); A.hop = 9 * Math.sin(q * Math.PI / 2); sq(-0.12 * (1 - q * 0.5)); A.alpha = clamp(q * 3, 0, 1); break; }   // popping out of the mark, arms up
    case 'smash': sq(0.2 * spring(k, 22, 9)); A.fwd = 5 * ease(k / 0.06); A.hop = Math.max(0, 4 - k * 80); break;   // down, squashed into the floor, settling
    case 'stumble': { const D = (FIGHTERS[f.id] && FIGHTERS[f.id].moves.move1 && FIGHTERS[f.id].moves.move1.stumble) || 0.65; Object.assign(A, settleAnim(k, D, 'smash', 0.24)); A.fwd = 6 * ease(k / 0.3); break; }   // (missed: the smash's follow-through carries him a step on, then he straightens up, a calm settle; 2026-10-24)
    case 'raise': if (k < 0.06) sq(0.04 * ease(k / 0.06)); else sq(0.04 * (1 - ease((k - 0.06) / 0.08)) - 0.05 * ease((k - 0.06) / 0.1)); break;   // a dip, then up
    case 'snap': sq(-0.035 + 0.05 * spring(k, 24, 12)); A.wx = k < 0.1 ? Math.sin(k * 90) * 0.8 * (1 - k / 0.1) : 0; break;
    case 'stop': sq(-0.035 * Math.exp(-k * 8)); break;
    case 'throw': {   // back with the pot (a little overshoot), held: trembling with it
      const q = backE(clamp(k / 0.16, 0, 1)); sq(0.05 * q); A.fwd = -3 * q; A.lean = -0.05 * q;
      if (f.t > (f.dur || 0)) A.wx = Math.sin(t * 34) * 0.6;
      break;
    }
    case 'toss': sq(-0.09 * spring(k, 18, 8)); A.fwd = 6 * backE(clamp(k / 0.12, 0, 1)); break;   // the follow-through
    // ---- the evades
    case 'iceblock': sq(0.03 + 0.05 * spring(k, 30, 14)); break;   // (the ice round him: moveOver)
    case 'crack': Object.assign(A, settleAnim(k, 0.3, 'burst', 0.12)); A.fwd = 0; break;   // (the ice falls off him: he shakes it off and settles back, open but calm; 2026-10-24)
    case 'shatter': sq(-0.12 * spring(k, 22, 9)); A.hop = bump(k / 0.12) * 3; break;   // bursting out of the ice
    case 'blinkout': { const q = clamp(k / 0.06, 0, 1); A.s = 1 - 0.55 * q; A.alpha = 1 - q; sq(0.16 * q); break; }   // crumpling into bits
    case 'blinkin': { if (f.state === 'strike') { const q = clamp(k / 0.06, 0, 1); A.s = 0.5 + 0.5 * backE(q); A.alpha = q; } else sq(-0.07 * spring(k, 22, 12)); break; }   // back together, a little settle
  }
  return A;
}
// the glacier under Tux (the Iceberg Drop): its size from the move's reach, so it covers what the landing hits; as it
// slams down it breaks under him over BERG_FALL s and he drops with it onto the floor (bergDown: his height above it)
const BERG_FALL = 0.09;
const bergScale = f => ((FIGHTERS[f.id] && FIGHTERS[f.id].moves.move2 && FIGHTERS[f.id].moves.move2.R) || 54) * 0.92 / 48;
const bergBreak = f => f.move === 'move2' && (f.ph === 'land' || f.ph === 'dizzy') && (f.pht || 0) < BERG_FALL ? 1 - (f.pht || 0) / BERG_FALL : 0;
const bergDown = f => P3('glacier') ? GLACIER_TOP * bergScale(f) * Math.pow(bergBreak(f), 1.5) : 0;
// how high the glacier is (cosmetic: the sim has him 520 up, out of shot, till the drop): it comes into sight late in
// 'high', sinking steadily with the shadow under it, then the drop slams it down
function bergZ(f) {
  const M = (FIGHTERS[f.id] && FIGHTERS[f.id].moves.move2) || {}, hi = Math.max(0.1, (M.active || 0.88) - (M.up || 0.2) - (M.drop || 0.14)), k = f.pht || 0;
  if (f.ph === 'high') { const q = (k - (hi - 0.4)) / 0.4; return q < 0 ? -1 : 205 - 120 * Math.pow(clamp(q, 0, 1), 1.15); }
  if (f.ph === 'drop') return 85 * (1 - Math.pow(clamp(k / (M.drop || 0.14), 0, 1), 1.6));
  return -1;
}
// Tux's and Duke's hit reactions (2026-10-24, the quality pass; draw-fight.js calls it outside a move): a hit snaps them
// back (a squash and a lean along the push, springing back), a stagger sways and wobbles, getting up ends with a little
// stretch, a freeze lands with a small clunk. null when there's nothing to add
export function hitAnim(F, v, f) {
  const st = f.state, k = f.t || 0;
  if (st !== 'hurt' && st !== 'stagger' && st !== 'getup' && st !== 'frozen') return null;
  const A = { sx: 1, sy: 1, hop: 0, spin: 0, lean: 0, fwd: 0, wx: 0, alpha: 1, s: 1, mood: undefined };
  const sq = q => { A.sx *= 1 + q; A.sy *= 1 - q; };
  if (st === 'hurt') {
    const sp = Math.hypot(f.vx || 0, f.vy || 0), dir = sp > 20 ? Math.sign(f.vx || 0) : 0;
    sq(0.12 * spring(k, 20, 9)); A.lean = dir * 0.13 * spring(k, 14, 7); A.fwd = -2 * Math.exp(-k * 8);
  } else if (st === 'stagger') {
    A.lean = Math.sin(k * 6.5) * 0.09 * (0.6 + 0.4 * Math.exp(-k * 3)); sq(0.08 * spring(k, 18, 8) + 0.015 * Math.sin(k * 13));
  } else if (st === 'getup') {
    const q = clamp(k / (f.dur || 0.35), 0, 1); sq(q < 0.6 ? 0.05 * bump(q / 0.6) : -0.06 * bump((q - 0.6) / 0.4));
  } else if (st === 'frozen') sq(0.06 * spring(k, 30, 14));
  return A;
}
// the pose crossfade (2026-10-24: smoother blends between poses): when Tux's or Duke's pose changes, the pose he was in
// fades out under the new one over ~0.09 s, like a smear frame, so a change of keyframe doesn't pop. The walk's frames and
// a freeze don't blend. Returns { pose, a } to draw first, or null
const BLEND = 0.08;
export function poseFade(v, f, pose) {
  const P = v.poseB || (v.poseB = [{ p: '', t: -9, q: '' }, { p: '', t: -9, q: '' }]), b = P[f.i] || (P[f.i] = { p: '', t: -9, q: '' });
  if (pose !== b.p) { b.q = b.p; b.p = pose; b.t = v.t; }
  const k = (v.t - b.t) / BLEND;
  if (k >= 1 || k < 0 || !b.q || f.state === 'frozen' || (f.move === 'move2' && f.id === 'tux' && P3('glacier')) || /^walk/.test(b.q) || /^walk/.test(pose) || b.q === 'stand' && pose === '') return null;
  return { pose: b.q, a: 0.45 * (1 - ease(k)) };
}
// an aim cue's drawn place: the sim's (60 steps a second), followed very closely so it glides on a fast screen too
function glide(v, o) {
  const S = v.aimSm || (v.aimSm = new Map());
  let p = S.get(o.id);
  if (!p || v.t - p.t > 0.25 || v.t < p.t) { p = { x: o.x, y: o.y, t: v.t }; S.set(o.id, p); if (S.size > 24) for (const [id, q] of S) if (v.t - q.t > 1) S.delete(id); return p; }
  const kk = 1 - Math.exp(-(v.t - p.t) / 0.02); p.x += (o.x - p.x) * kk; p.y += (o.y - p.y) * kk; p.t = v.t;
  return p;
}

// ---------------------------------------------------------------- events
export function moveEvent(v, F, e, few) {
  const who = e.who ?? -1, f = F.f[who];
  switch (e.kind) {
    case 'tell': case 'ice': case 'dizzy': case 'stopmiss': case 'throw': return true;
    case 'iceblock':   // Tux freezes into his block: a little puff of frost round its foot
      if (P3('bit:snow')) bits3(v, 'snow', e.x, e.y, 2, few ? 3 : 6, { r: 20, speed: [30, 70], up: [30, 90], s: [2.6, 4], life: [0.4, 0.6], drag: 2, few });
      else snowBurst(v, e.x, e.y, 0, TAU, few ? 3 : 5, 0.6);
      v.fx.push({ k: 'popring', x: e.x, y: e.y, t: 0, life: 0.3, s: 24, col: '#dff3ff' });
      return true;
    case 'crack':   // left alone, the block cracks and falls away off him: chunks of it sliding off, tumbling down round his feet to melt
      if (P3('bit:ice')) {
        for (let k = 0; k < (few ? 4 : 8); k++) { const a = k / (few ? 4 : 8) * TAU + frnd(-0.3, 0.3), sp = frnd(25, 70); bit3(v, 'ice', e.x + Math.cos(a) * 16, e.y + Math.sin(a) * 9, frnd(14, 56), { dx: Math.cos(a) * sp, dy: Math.sin(a) * sp * 0.7, dz: frnd(10, 70), s: frnd(4, 7.5), life: frnd(0.9, 1.4), bo: 0.25, few }); }
        bits3(v, 'snow', e.x, e.y, 2, few ? 2 : 4, { r: 18, speed: [20, 50], up: [20, 60], s: [2.4, 3.6], life: [0.4, 0.6], drag: 2, few });
      } else {
        for (let k = 0; k < (few ? 3 : 6); k++) shards(v, e.x + frnd(-14, 14), e.y - frnd(6, 46), frnd(0, TAU), 0.3, 1, k % 3 ? '#e2f4ff' : '#ffffff');
        snowBurst(v, e.x, e.y, 0, TAU, few ? 2 : 3, 0.45);
      }
      return true;
    case 'shatter': {   // hit, the block shatters outward: ice flung off all round, most of it at whoever hit it, a frosty puff
      const d = F.f[who], h = F.f[e.to], aim = d && h ? Math.atan2(h.y - d.y, h.x - d.x) : 0, n = few ? 6 : 10;
      if (P3('bit:ice')) {   // the block bursting into chunks of ice, most of them flung at whoever hit it
        for (let k = 0; k < n + 2; k++) { const at = k < n * 0.6, a = at ? aim + frnd(-0.8, 0.8) : frnd(0, TAU), sp = at ? frnd(120, 230) : frnd(50, 120); bit3(v, 'ice', e.x + frnd(-12, 12), e.y + frnd(-4, 4), frnd(8, 54), { dx: Math.cos(a) * sp, dy: Math.sin(a) * sp * 0.7, dz: frnd(60, 200), s: frnd(3.5, 7.5), life: frnd(0.8, 1.3), bo: 0.3, sp: frnd(-40, 40), few }); }
        bits3(v, 'snow', e.x, e.y, 6, few ? 3 : 5, { r: 16, speed: [40, 100], up: [60, 140], s: [2.6, 4.2], life: [0.4, 0.65], drag: 2, few });
      } else {
        for (let k = 0; k < n; k++) shards(v, e.x + frnd(-12, 12), e.y - frnd(8, 46), k < n / 2 ? aim : frnd(0, TAU), k < n / 2 ? 1 : 0.5, 1, k % 3 ? '#e2f4ff' : '#ffffff');
        snowBurst(v, e.x, e.y, 0, TAU, few ? 3 : 6, 0.8);
      }
      v.fx.push({ k: 'popring', x: e.x, y: e.y, t: 0, life: 0.38, s: 36, col: '#dff3ff' });
      if (e.stag && h) {   // the shards reaching them: a few glints on them, and the frost they're staggered under (moveOver)
        (v.shatT || (v.shatT = [-9, -9]))[h.i] = v.t;
        for (let k = 0; k < (few ? 2 : 4); k++) { const b = aim + frnd(-0.5, 0.5), sp = frnd(60, 110); v.fx.push({ k: 'glint', x: h.x - Math.cos(aim) * 8, y: h.y - frnd(16, 40), vx: Math.cos(b) * sp, vy: Math.sin(b) * sp * 0.6 - 20, t: 0, life: 0.2, s: 5 }); }
      }
      return true;
    }
    case 'clink': {   // a hit clinking off the ice: a little white spark where it struck, a couple of glints
      const d = F.f[e.to], a = f && d ? Math.atan2(f.y - d.y, f.x - d.x) : 0, x = d ? d.x + Math.cos(a) * 20 : e.x, y = (d ? d.y + Math.sin(a) * 12 : e.y) - 28;
      v.fx.push({ k: 'clinkfx', x, y, t: 0, life: 0.2, s: 10, a: frnd(0, 1) });
      for (let k = 0; k < (few ? 2 : 3); k++) { const b = a + frnd(-1, 1), sp = frnd(90, 150); v.fx.push({ k: 'glint', x, y, vx: Math.cos(b) * sp, vy: Math.sin(b) * sp * 0.6 - 30, t: 0, life: 0.18, s: 6 }); }
      return true;
    }
    case 'blink': {   // Garbage Collect: he breaks up into little recycled bits, a faint streak to where he's going, the bits come back together there
      if (e.move !== 'evade') return false;   // (Cpp's Pointer: draw-kits.js)
      const x2 = e.x2 ?? e.x, y2 = e.y2 ?? e.y, cols = [JAVA_O, JAVA_B, '#ffffff', '#3fd68b'], n1 = few ? 5 : 8, n2 = few ? 4 : 7;
      if (P3('bit:bitO')) {   // in 3D: little cubes and a ball of paper bursting off him, others flying in together where he lands
        for (let k = 0; k < n1 + 1; k++) { const a = k / (n1 + 1) * TAU + frnd(-0.3, 0.3), sp = frnd(60, 130); bit3(v, BITS_GC[k % 5], e.x, e.y, frnd(8, 44), { dx: Math.cos(a) * sp, dy: Math.sin(a) * sp * 0.7, dz: frnd(40, 150), s: frnd(2.2, 3.3), life: frnd(0.35, 0.55), g: 520, bo: 0.3, sp: frnd(-50, 50), few }); }
        for (let k = 0; k < n2; k++) { const a = k / n2 * TAU, r = frnd(22, 34); bit3(v, BITS_GC[(k + 2) % 5], x2 + Math.cos(a) * r, y2 + Math.sin(a) * r * 0.7, frnd(8, 46), { to: [x2, y2, 22], s: frnd(2.2, 3), life: 0.18, fade: 'none', sh: false, sp: 30, few }); }
        for (let k = 1; k <= (few ? 2 : 4); k++) { const u = k / 5; bit3(v, BITS_GC[k % 5], e.x + (x2 - e.x) * u, e.y + (y2 - e.y) * u, 22 + frnd(-8, 8), { dx: frnd(-15, 15), dy: frnd(-10, 10), dz: frnd(-10, 20), g: 0, drag: 3, s: frnd(1.4, 2), life: 0.16 + u * 0.12, fade: 'alpha', sh: false, sp: 40, few }); }   // (a few left behind along the way, like a trail of crumbs)
        return true;
      }
      for (let k = 0; k < n1; k++) { const a = k / n1 * TAU + frnd(-0.3, 0.3), sp = frnd(55, 110); v.fx.push({ k: 'bit', x: e.x, y: e.y - frnd(8, 40), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, t: 0, life: frnd(0.22, 0.34), s: frnd(2.2, 3.2), a: frnd(0, TAU), col: cols[k % 4] }); }
      for (let k = 0; k < n2; k++) { const a = k / n2 * TAU, r = frnd(18, 28); v.fx.push({ k: 'bitin', x: x2, y: y2 - 24, ox: Math.cos(a) * r, oy: Math.sin(a) * r * 0.8, t: 0, life: 0.16, s: frnd(2.2, 3), a: frnd(0, TAU), col: cols[k % 4] }); }
      v.fx.push({ k: 'gcstreak', x: e.x, y: e.y, x2, y2, t: 0, life: 0.22, s: 1 });
      return true;
    }
    case 'toboggan': {   // off he shoots: a little snow sprayed back
      if (!f) return true;
      const a = f.face + Math.PI;
      if (P3('bit:snow')) bits3(v, 'snow', f.x + Math.cos(a) * 12, f.y + Math.sin(a) * 12, 3, few ? 3 : 6, { dir: a, spread: 1.4, speed: [60, 140], up: [60, 140], s: [2.8, 4.4], life: [0.45, 0.7], drag: 1.5, few });
      else snowBurst(v, f.x + Math.cos(a) * 12, f.y + Math.sin(a) * 12, a, 1.2, few ? 3 : 5, 0.8);
      return true;
    }
    case 'bounce': {   // off the wall: a soft puff of snow off it, a few flecks of ice (no shake)
      const a = Math.atan2(e.ny ?? -1, e.nx ?? 0);
      if (P3('bit:snow')) { bits3(v, 'snow', e.x, e.y, 6, few ? 3 : 6, { dir: a, spread: 2, speed: [60, 150], up: [70, 170], s: [3, 4.6], life: [0.45, 0.7], drag: 1.5, few }); bits3(v, 'ice', e.x, e.y, 10, few ? 2 : 3, { dir: a, spread: 1.6, speed: [80, 160], up: [80, 180], s: [2.2, 3.4], life: [0.6, 0.9], few }); }
      else { snowBurst(v, e.x, e.y, a, 1.6, few ? 3 : 5, 0.9); shards(v, e.x, e.y - 10, a, 1.4, few ? 2 : 3, '#e6f6ff'); }
      puff(v, e.x, e.y - 6, few ? 2 : 3, '#ffffff');
      return true;
    }
    case 'belly':   // flat on his belly: a puff of snow
      if (P3('bit:snow')) bits3(v, 'snow', e.x, e.y, 2, few ? 2 : 4, { r: 14, speed: [30, 70], up: [40, 100], s: [2.6, 4], life: [0.4, 0.6], drag: 2, few });
      else snowBurst(v, e.x, e.y, 0, TAU, few ? 2 : 4, 0.6);
      return true;
    case 'leap':   // up and away: a few soft streaks rising off the spot, a ring of snow
      if (P3('bit:snow')) bits3(v, 'snow', e.x, e.y, 2, few ? 4 : 8, { r: 14, speed: [50, 110], up: [50, 120], s: [2.8, 4.4], life: [0.45, 0.7], drag: 1.8, few });
      else { v.fx.push({ k: 'zoom', x: e.x, y: e.y, t: 0, life: 0.35, s: 1 }); snowBurst(v, e.x, e.y, 0, TAU, few ? 3 : 5, 0.65); }
      return true;
    case 'land': {   // the iceberg's belly flop: snow and ice flung out, a soft flash, a soft shake (the dust ring is the sim's 'shock')
      if (e.move !== 'move2') return false;
      v.shake = Math.max(v.shake, 0.38);
      const n = few ? 5 : 8, f2 = F.f[who];
      if (P3('glacier') && P3('bit:ice')) {   // the glacier slams down and breaks: chunky ice flung out to tumble and settle round it, snow thrown up
        const sc = f2 ? bergScale(f2) : 1, R = 44 * sc;
        for (let k = 0; k < n + 4; k++) { const a = k / (n + 4) * TAU + frnd(-0.25, 0.25), d = R * frnd(0.4, 0.9), sp = frnd(35, 105); bit3(v, 'ice', e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * 0.8, frnd(10, 46), { dx: Math.cos(a) * sp, dy: Math.sin(a) * sp * 0.75, dz: frnd(110, 260), s: frnd(4.5, 9), life: frnd(1.3, 2), bo: 0.32, sp: frnd(-36, 36), few }); }
        for (let k = 0; k < (few ? 2 : 3); k++) { const a = frnd(0, TAU), d = R * frnd(0.2, 0.6); bit3(v, 'ice', e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * 0.8, frnd(14, 30), { dx: Math.cos(a) * 30, dy: Math.sin(a) * 24, dz: frnd(60, 120), s: frnd(9, 12), life: frnd(1.8, 2.3), bo: 0.2, sp: frnd(-14, 14), few }); }   // (a few big ones)
        bits3(v, 'snow', e.x, e.y, 8, few ? 4 : 8, { r: R, speed: [50, 130], up: [100, 220], s: [3.4, 5.4], life: [0.55, 0.85], drag: 1.6, few });
      } else {
        for (let k = 0; k < n; k++) { const a = k / n * TAU + frnd(-0.2, 0.2); snowBurst(v, e.x + Math.cos(a) * 24, e.y + Math.sin(a) * 24, a, 0.3, 1, 1); }
        shards(v, e.x, e.y - 6, 0, TAU, few ? 3 : 5, '#dff3ff');
      }
      v.fx.push({ k: 'flash', x: e.x, y: e.y - 12, t: 0, life: 0.14, s: 26 });
      if (e.hit) punch(v, e.x, e.y);
      return true;
    }
    case 'fork':   // fork(): a soft white puff off him as the penguins pop out
      if (P3('bit:snow')) bits3(v, 'snow', e.x, e.y, 30, few ? 3 : 6, { speed: [40, 90], up: [40, 120], s: [2.8, 4.4], life: [0.45, 0.65], drag: 2, few });
      else puff(v, e.x, e.y - 22, few ? 2 : 4, '#ffffff');
      return true;
    case 'peng':   // a penguin bursting into snow (soak: it took a hit meant for Tux: a little white spark on it too)
      if (P3('bit:snow')) { bits3(v, 'snow', e.x, e.y, 8, few ? 3 : e.how === 'hit' || e.how === 'soak' ? 7 : 5, { speed: [40, 110], up: [70, 170], s: [2.6, 4.2], life: [0.45, 0.7], drag: 1.6, few }); bits3(v, 'ice', e.x, e.y, 8, few ? 1 : 2, { speed: [50, 110], up: [80, 160], s: [2, 3], life: [0.6, 0.9], few }); }
      else snowBurst(v, e.x, e.y - 6, 0, TAU, few ? 3 : e.how === 'hit' || e.how === 'soak' ? 6 : 4, 0.75);
      if (e.how === 'soak') v.fx.push({ k: 'clinkfx', x: e.x, y: e.y - 12, t: 0, life: 0.2, s: 9, a: 0.4 });
      return true;
    case 'vanish':   // Duke spinning into nothing: the ring he went into closing after him (moveGround), else a swirl closing in
      if (P3('portal')) (v.portA || (v.portA = [])).push({ x: e.x, y: e.y, t: v.t });
      else v.fx.push({ k: 'swirl', x: e.x, y: e.y, t: 0, life: 0.4, s: 1, dir: 1 });
      return true;
    case 'portal': return true;   // (the swirl on the floor: portalMark)
    case 'popout':   // out of the mark: the swirl opening out, a soft flash, a few streaks
      if (P3('portal') && P3('bit:bitO')) {   // bursting out of the ring: bits of it and sparks flung off
        v.fx.push({ k: 'flash', x: e.x, y: e.y - 24, t: 0, life: 0.12, s: 18 });
        for (let k = 0; k < (few ? 4 : 7); k++) { const a = k / (few ? 4 : 7) * TAU + frnd(-0.3, 0.3), sp = frnd(70, 140); bit3(v, k % 3 === 2 ? 'spark' : k % 2 ? 'bitB' : 'bitO', e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 10, 4, { dx: Math.cos(a) * sp, dy: Math.sin(a) * sp * 0.7, dz: frnd(120, 220), s: frnd(2.2, 3.2), life: frnd(0.4, 0.6), bo: 0.3, few }); }
      } else {
        v.fx.push({ k: 'swirl', x: e.x, y: e.y, t: 0, life: 0.3, s: 1, dir: -1 }, { k: 'flash', x: e.x, y: e.y - 30, t: 0, life: 0.12, s: 18 });
        burst(v, e.x, e.y - 30, 0, TAU, 30, few ? 3 : 5, 0.2);
      }
      return true;
    case 'smash':   // the slam: a ring of dust off the floor (no shake)
      v.fx.push({ k: 'dring', x: e.x, y: e.y, t: 0, life: 0.4, s: e.hit ? 32 : 24, id: 3 });
      if (P3('bit:rock')) bits3(v, 'rock', e.x, e.y, 2, few ? 2 : 4, { r: 10, speed: [40, 100], up: [90, 170], s: [1.6, 2.6], life: [0.5, 0.75], bo: 0.3, few });   // (chips of the floor kicked up)
      if (!e.hit) puff(v, e.x, e.y, few ? 2 : 3, null);
      return true;
    case 'stumble': puff(v, e.x, e.y, 2, null); return true;
    case 'snap': {   // (the spark at his fingers: moveOver) the ripple lifting grey crystals off the floor as it passes: they hang there, stopped
      (v.snapT || (v.snapT = [-9, -9]))[who] = v.t;
      const M = f && FIGHTERS[f.id] && FIGHTERS[f.id].moves.move2, R = (M && M.R) || 105, grow = M ? Math.max(0.1, M.startup - M.raise) : 0.54;
      if (P3('bit:tshard')) for (let k = 0; k < (few ? 5 : 10); k++) { const a = k / (few ? 5 : 10) * TAU + frnd(-0.3, 0.3), d = R * Math.sqrt(frnd(0.08, 0.9)); bit3(v, 'tshard', e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 0, { hold: Infinity, rise: d / R * grow, zT: frnd(12, 56), s: frnd(3.8, 6.2), life: 6, sp: frnd(-6, 6), grp: 'tsw', few }); }
      return true;
    }
    case 'freeze': {   // caught: a soft grey flash on them
      const o = F.f[e.to]; const x = o ? o.x : e.x, y = o ? o.y : e.y;
      v.fx.push({ k: 'flash', x, y: y - 26, t: 0, life: 0.2, s: 28, grey: 1 });
      if (P3('bit:tshard')) for (let k = 0; k < (few ? 2 : 4); k++) { const a = k / 4 * TAU + 0.4; bit3(v, 'tshard', x + Math.cos(a) * 22, y + Math.sin(a) * 10, frnd(10, 30), { hold: Infinity, rise: 0, zT: frnd(20, 60), s: frnd(3.6, 5.2), life: 6, sp: frnd(-6, 6), grp: 'tsw', few }); }   // (a few hanging round them too)
      return true;
    }
    case 'ringbreak': {   // Duke hit out of his snap: the ripple breaks into a few grey flecks
      release3(v, 'tsw', 40);
      const rg = (F.objs || []).find(o => o.kind === 'ring' && o.owner === who), R = rg ? Math.max(20, rg.r) : 50, n = few ? 4 : 7;
      for (let k = 0; k < n; k++) { const a = k / n * TAU; shards(v, e.x + Math.cos(a) * R, e.y + Math.sin(a) * R, a, 0.4, 1, '#d4d8e2'); }
      return true;
    }
    case 'thaw': {   // the statue cracks open: grey chips flung off, a soft white flash
      const x = f ? f.x : e.x, y = f ? f.y : e.y;
      release3(v, 'tsw', 70);
      if (P3('bit:stone')) { for (let k = 0; k < (few ? 4 : 7); k++) { const a = frnd(0, TAU), sp = frnd(50, 120); bit3(v, k % 3 ? 'stone' : 'tshard', x + Math.cos(a) * 8, y + Math.sin(a) * 5, frnd(10, 50), { dx: Math.cos(a) * sp, dy: Math.sin(a) * sp * 0.7, dz: frnd(60, 160), s: frnd(2.6, 4.4), life: frnd(0.7, 1.1), bo: 0.3, few }); } }   // the statue's grey skin cracking off in chips
      else for (let k = 0; k < (few ? 4 : 6); k++) shards(v, x + frnd(-10, 10), y - frnd(10, 46), frnd(0, TAU), 0.3, 1, k % 2 ? '#c8ccd6' : '#ffffff');
      v.fx.push({ k: 'flash', x, y: y - 26, t: 0, life: 0.12, s: 22 });
      return true;
    }
    case 'potland':
      puff(v, e.x, e.y, 2, null);
      if (P3('bit:drop')) bits3(v, 'drop', e.x, e.y, 4, few ? 2 : 4, { speed: [30, 70], up: [60, 130], s: [1.6, 2.4], life: [0.4, 0.6], bo: 0, few });
      else v.fx.push({ k: 'splash', x: e.x, y: e.y, t: 0, life: 0.3, s: 10 });
      return true;
    case 'erupt': {   // the geyser: coffee flung up and out, steam, a soft shake
      v.shake = Math.max(v.shake, 0.3);
      if (P3('bit:drop')) {   // glossy coffee drops flung up off it, steam boiling up
        bits3(v, 'drop', e.x, e.y, 30, few ? 5 : 10, { r: 8, speed: [30, 95], up: [150, 300], s: [2, 3.4], life: [0.7, 1.05], bo: 0, few });
        bits3(v, 'steam', e.x, e.y, 40, few ? 2 : 4, { r: 14, speed: [10, 30], up: [30, 60], g: -20, drag: 1.4, grow: 1.4, s: [5, 8], life: [0.9, 1.3], sh: false, few });
        v.fx.push({ k: 'flash', x: e.x, y: e.y - 26, t: 0, life: 0.12, s: 20 });
        return true;
      }
      for (let k = 0; k < (few ? 5 : 9); k++) { const a = frnd(0, TAU), sp = frnd(25, 85); v.fx.push({ k: 'drop', x: e.x + Math.cos(a) * 7, y: e.y + Math.sin(a) * 5, z: frnd(16, 55), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: frnd(130, 250), t: 0, life: frnd(0.6, 0.95), s: frnd(1.8, 3) }); }
      for (let k = 0; k < (few ? 2 : 4); k++) { const a = frnd(0, TAU); v.fx.push({ k: 'steam', x: e.x + Math.cos(a) * 14, y: e.y - frnd(18, 55), vx: Math.cos(a) * 16, vy: -frnd(18, 38), t: 0, life: frnd(0.8, 1.2), s: frnd(8, 12) }); }
      v.fx.push({ k: 'flash', x: e.x, y: e.y - 26, t: 0, life: 0.12, s: 20 });
      return true;
    }
  }
  return false;
}
// a big hit: the camera punches in a touch on it (draw-fight.js camera)
function punch(v, x, y) { v.punch = { t: v.t, x, y }; }
// snow: little white balls flung up and out, falling back (n of them round angle a, spread wide)
function snowBurst(v, x, y, a, spread, n, p) {
  for (let k = 0; k < n; k++) { const b = a + (n > 1 ? (k / (n - 1) - 0.5) : 0) * spread + frnd(-0.25, 0.25), sp = frnd(50, 130) * p; v.fx.push({ k: 'snow', x, y, z: 3, vx: Math.cos(b) * sp, vy: Math.sin(b) * sp * 0.6, vz: frnd(90, 200) * p, t: 0, life: frnd(0.5, 0.8), s: frnd(2.2, 4) }); }
}
// shards (ice, or a statue's stone) tumbling off
function shards(v, x, y, a, spread, n, col) {
  for (let k = 0; k < n; k++) { const b = a + (n > 1 ? (k / (n - 1) - 0.5) : 0) * spread + frnd(-0.3, 0.3), sp = frnd(70, 160); v.fx.push({ k: 'shard', x, y, vx: Math.cos(b) * sp, vy: Math.sin(b) * sp * 0.6 - frnd(60, 140), t: 0, life: frnd(0.45, 0.7), s: frnd(2.4, 4), a: frnd(0, TAU), sp: frnd(-12, 12), col }); }
}

// ---------------------------------------------------------------- on the floor
export function moveGround(g, F, v) {
  const objs = F.objs || [];
  for (const o of objs) if (o.kind === 'ice') icePatch(g, o, v.t);
  trails(g, F, v);
  if (P3('portal')) {   // Duke's ring opening under him as he spins (and closing after he's gone into it)
    for (const f of F.f) if (f.ph === 'spin') { const q = ease((f.pht || 0) / 0.1); portalRing(g, f.x, f.y, 22 * (0.35 + 0.65 * q), q, v.t, 1); }
    if (v.portA) { v.portA = v.portA.filter(p => v.t - p.t < 0.3); for (const p of v.portA) { const q = 1 - ease((v.t - p.t) / 0.3); portalRing(g, p.x, p.y, 22 * (0.3 + 0.7 * q), q, v.t, q); } }
  }
  if (v.piles) {   // fork(): the little mounds of snow the penguins popped out of, slumping and melting away
    v.piles = v.piles.filter(p => v.t - p.t < 0.9);
    for (const p of v.piles) { const k = (v.t - p.t) / 0.9; g.save(); g.translate(p.x, p.y); drawProp3D(g, 'snowpile', { frame: p.id, scale: 1 - 0.25 * k, sy: 1 - 0.6 * ease(k), alpha: 1 - k * k }); g.restore(); }
  }
  if (v.tswOn && !F.f.some(f => f.state === 'frozen') && !objs.some(o => o.kind === 'ring')) { release3(v, 'tsw', 40); v.tswOn = false; }   // (Stop the World over: its crystals fall)
  else if (objs.some(o => o.kind === 'ring')) v.tswOn = true;
  for (const o of objs) {
    if (o.kind === 'geyser') geyserMark(g, o, v);
    else if (o.kind === 'portal') { if (P3('portal')) portal3(g, o, v.t); else portalMark(g, o, v.t); }
    else if (o.kind === 'shadow') bergShadow(g, o, v.t, v);
    else if (o.kind === 'ring') stopRing(g, o, v.t);
    else if (o.kind === 'shock' && o.reach > 60) iceShock(g, o);
  }
  for (const o of objs) if (o.kind === 'tobline') tobLine(g, o, F, v.t);   // (over the rest: the one tell you must read in a hurry)
}
// Tux's ice patch: a pale sheet of ice the sim's size (o.r), a soft pale edge, a few cracks, a glint sliding over it
function icePatch(g, o, t) {
  const age = o.t || 0, left = (o.life || 4.5) - age, a = clamp(age / 0.15, 0, 1) * clamp(left / 0.6, 0, 1); if (a <= 0.01) return;
  const BD = bold(), r = (o.r || 78) * (age < 0.15 ? 0.6 + 0.4 * ease(age / 0.15) : 1), seed = (o.id || 1) * 3.7;
  // in 3D (2026-10-24): a slab of faceted glossy ice where the glacier broke, snow drifting on its rim, melting a touch
  // smaller as it goes; a glint sliding over it
  if (decal3(g, 'icepatch', o.x, o.y, r * (1 - 0.08 * clamp(1 - left / 1.2, 0, 1)), { frame: o.id || 0, alpha: a })) {
    const gp = (t * 0.55 + hsh(seed)) % 1.8;
    if (gp < 1) { const s = 6 * Math.sin(gp * Math.PI); g.save(); g.globalAlpha *= a; g.fillStyle = '#ffffff'; starPath(g, o.x - r * 0.5 + gp * r, o.y - r * 0.35 + gp * r * 0.3, s, s * 0.22, 4, 0); g.fill(); g.restore(); }
    return;
  }
  const edge = an => 1 + 0.045 * Math.sin(3 * an + seed) + 0.025 * Math.sin(5 * an + seed * 1.3);
  const path = q => { g.beginPath(); for (let i = 0; i <= 40; i++) { const an = i / 40 * TAU, d = r * q * edge(an); g.lineTo(o.x + Math.cos(an) * d, o.y + Math.sin(an) * d); } g.closePath(); };
  g.save(); g.globalAlpha *= a; g.lineCap = 'round'; g.lineJoin = 'round';
  g.fillStyle = 'rgba(20,40,90,0.2)'; path(1.05); g.fill();   // (a faint dark rim: it reads on a pale floor too)
  g.fillStyle = BD ? 'rgba(202,236,255,0.82)' : 'rgba(198,234,255,0.74)'; path(1); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.4)'; path(0.62); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.3;
  for (let k = 0; k < 5; k++) {
    const an = hsh(seed + k) * TAU, r0 = r * 0.12, r1 = r * (0.5 + 0.35 * hsh(seed + k * 2)), j = (hsh(seed + k * 3) - 0.5) * 0.5;
    g.beginPath(); g.moveTo(o.x + Math.cos(an) * r0, o.y + Math.sin(an) * r0); g.lineTo(o.x + Math.cos(an + j) * r1 * 0.55, o.y + Math.sin(an + j) * r1 * 0.55); g.lineTo(o.x + Math.cos(an - j * 0.5) * r1, o.y + Math.sin(an - j * 0.5) * r1); g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2; path(0.98); g.stroke();
  const gp = (t * 0.55 + hsh(seed)) % 1.8;   // the glint
  if (gp < 1) { const s = 7 * Math.sin(gp * Math.PI); g.fillStyle = '#ffffff'; starPath(g, o.x - r * 0.55 + gp * r * 1.1, o.y - r * 0.3 + gp * r * 0.25, s, s * 0.22, 4, 0); g.fill(); }
  g.restore();
}
// the toboggan's ice trail: a pale streak along where he slid, fading
function trails(g, F, v) {
  const T = v.trail || (v.trail = [[], []]);
  F.f.forEach((f, i) => {
    const L = T[i] || (T[i] = []), sliding = (f.ph === 'slide' || f.ph === 'skid' || f.ph === 'belly') && Math.hypot(f.vx || 0, f.vy || 0) > 30;
    if (sliding) { const last = L[L.length - 1], br = !last || v.t - last[2] > 0.12 || Math.hypot(last[0] - f.x, last[1] - f.y) > 40; if (br || Math.hypot(last[0] - f.x, last[1] - f.y) > 5) { L.push([f.x, f.y, v.t, br]); if (L.length > 80) L.shift(); } }
    while (L.length && v.t - L[0][2] > 1.4) L.shift();
    if (L.length < 2) return;
    g.save(); g.lineCap = 'round';
    // a groove carved in the floor (2026-10-24): a pale scraped band, a soft shaded channel down its middle with light
    // caught on its far side, and a raised lip of snow along each edge, a little shade under it (lit from the top left)
    // (drawn as smooth runs a few points long, each at its age's fade, so no joins show)
    g.lineJoin = 'round'; g.lineCap = 'butt';
    const nrm = k => { const p = L[Math.max(0, k - 1)], q = L[Math.min(L.length - 1, k + 1)], d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [-(q[1] - p[1]) / d, (q[0] - p[0]) / d]; };
    const run = (k0, k1, off, dx, dy, c, w) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); for (let k = k0; k <= k1; k++) { const [nx, ny] = off ? nrm(k) : [0, 0]; const x = L[k][0] + nx * off + dx, y = L[k][1] + ny * off + dy; k === k0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); };
    for (let k0 = 0; k0 < L.length - 1;) {
      let k1 = k0 + 1; while (k1 < L.length - 1 && k1 - k0 < 5 && !L[k1 + 1][3]) k1++;
      if (L[k1][3]) { k0 = k1; continue; }
      const a = clamp(1 - (v.t - L[k1][2]) / 1.4, 0, 1);
      if (a > 0.01) {
        run(k0, k1, 0, 0, 0, `rgba(214,236,252,${(0.42 * a).toFixed(3)})`, 19);
        run(k0, k1, 0, 0, 0.6, `rgba(70,108,150,${(0.22 * a).toFixed(3)})`, 8);
        run(k0, k1, 0, -0.4, -1.2, `rgba(255,255,255,${(0.4 * a).toFixed(3)})`, 2.5);
        for (const sd of [-1, 1]) { run(k0, k1, 8.5 * sd, 0.5, 1.3, `rgba(60,96,140,${(0.18 * a).toFixed(3)})`, 3.4); run(k0, k1, 8.5 * sd, 0, 0, `rgba(255,255,255,${(0.72 * a).toFixed(3)})`, 3); }
      }
      k0 = k1;
    }
    g.restore();
  });
}
// the toboggan's path: where he'll slide (from him, off one wall), like a fresh track in snow: a faint soft band Tux's
// width along a gentle curve (it bends the way the held direction steers him), and down it a row of soft oval prints,
// each a white top over a soft blue-grey shade so it reads on pale ice and dark stone alike, drifting slowly along while
// he aims; a soft puff of snow where it'll bounce. When he goes (the aim locks), the prints swell softly once and settle,
// stay put on the floor as he passes over them, and fade. No colours, no outline (2026-10-24, the user: "i still want
// the aiming and feel of the aim to look better")
function tobLine(g, o, F, t) {
  const P = o.pts; if (!P || P.length < 2) return;
  const go = o.ph === 'go', w = Math.max(10, o.w || 17), M = (FIGHTERS[(F.f[o.owner] || {}).id] || FIGHTERS.tux).moves.move1;
  const seg = []; let L = 0;
  for (let k = 1; k < P.length; k++) { const d = Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]); seg.push([L, d, k]); L += d; }
  if (L < 6) return;
  const at = s => { for (const [s0, d, k] of seg) if (s <= s0 + d || k === P.length - 1) { const u = d ? clamp((s - s0) / d, 0, 1) : 0; return [lerp(P[k - 1][0], P[k][0], u), lerp(P[k - 1][1], P[k][1], u), Math.atan2(P[k][1] - P[k - 1][1], P[k][0] - P[k - 1][0])]; } const n = P.length - 1; return [P[n][0], P[n][1], 0]; };
  const lk = go ? Math.max(0, (o.t || 0) - (o.lt || 0)) : 0, settle = go ? bump(lk / 0.2) : 0;
  const a = go ? clamp(1 - (lk - 0.3) / 0.5, 0, 0.85) : clamp((o.t || 0) / 0.12, 0, 1) * 0.85;
  if (a <= 0.01) return;
  const fade = s => clamp((L - s) / 40, 0, 1) * clamp(s / 22, 0, 1);   // (soft at both ends)
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  // the band: packed snow along a smooth curve through the points (wide and faint, narrower and a touch stronger)
  g.beginPath(); g.moveTo(P[0][0], P[0][1]);
  for (let k = 1; k < P.length - 1; k++) g.quadraticCurveTo(P[k][0], P[k][1], (P[k][0] + P[k + 1][0]) / 2, (P[k][1] + P[k + 1][1]) / 2);
  g.lineTo(P[P.length - 1][0], P[P.length - 1][1]);
  g.strokeStyle = `rgba(226,240,252,${((0.1 + 0.05 * settle) * a).toFixed(3)})`; g.lineWidth = w * 1.9; g.stroke();
  g.strokeStyle = `rgba(238,247,255,${((0.12 + 0.05 * settle) * a).toFixed(3)})`; g.lineWidth = w * 1.05; g.stroke();
  // the prints: drifting along while he aims, fixed on the floor once he goes (the path starts at him, so they're
  // counted back from how far he's slid)
  const sp = 17, trav = go ? lk * M.speed : -t * 18, off = ((-trav % sp) + sp) % sp, base = Math.floor(trav / sp), sc = 1 + 0.22 * settle;
  for (let s = off + 8, n = 0; s < L - 4; s += sp, n++) {
    const q = fade(s) * a; if (q < 0.03) continue;
    const [x, y, an] = at(s), side = (((n + base) & 1) ? 1 : -1) * 2.6, px = x - Math.sin(an) * side, py = y + Math.cos(an) * side * 0.8;
    g.fillStyle = `rgba(60,96,140,${(0.2 * q).toFixed(3)})`; g.beginPath(); g.ellipse(px + 0.5, py + 1.1, 4.1 * sc, 2.6 * sc, an, 0, TAU); g.fill();
    g.fillStyle = `rgba(255,255,255,${(0.64 * q).toFixed(3)})`; g.beginPath(); g.ellipse(px, py, 3.4 * sc, 2.1 * sc, an, 0, TAU); g.fill();
  }
  // where it bounces off the wall: a small soft puff of snow
  for (const k of o.bi || []) {
    const p = P[k]; if (!p) continue;
    const [x, y] = p, br = 1 + 0.06 * Math.sin(t * 5) + 0.15 * settle;
    softDisc(g, x + 1, y + 2, 14 * br, [[0, '60,96,140', 0.2 * a], [1, '60,96,140', 0]]);
    for (const [dx, dy, r] of [[-5, 1, 6.5], [4, -1, 7.5], [0, -5, 6]]) softDisc(g, x + dx, y + dy, r * br, [[0, '255,255,255', 0.72 * a], [0.6, '255,255,255', 0.48 * a], [1, '255,255,255', 0]]);
  }
  g.restore();
}
// the iceberg's shadow where he'll land: a real soft round shadow on the floor with a soft falloff, growing and darkening
// as he comes down (its size is the reach); a few snowflakes drifting down into it, leading it the way it's moving. When it
// locks for the drop it settles: a soft draw-in and a touch darker, no flash
function bergShadow(g, o, t, v) {
  const p = glide(v, o), R = o.R || 54, lock = !!o.lock, lk = lock ? Math.max(0, (o.t || 0) - (o.lt || 0)) : -1;
  let r = Math.max(4, o.r || 12); const u = clamp((r - 12) / Math.max(1, R - 12), 0, 1), pulse = lk >= 0 ? bump(lk / 0.22) : 0;
  r *= 1 - 0.06 * pulse;
  const d = 0.22 + 0.24 * u + (lock ? 0.08 + 0.05 * pulse : 0);
  g.save();
  softDisc(g, p.x, p.y, r * 1.3, [[0, '18,22,44', d * 0.2], [0.75, '18,22,44', d * 0.12], [1, '18,22,44', 0]]);   // (the falloff round it)
  softDisc(g, p.x, p.y, r * 1.04, [[0, '18,22,44', d], [0.5, '18,22,44', d * 0.92], [0.8, '18,22,44', d * 0.55], [1, '18,22,44', 0]]);
  if (u > 0.1) {   // snowflakes drifting down into it, from a little ahead of where it's going
    const vx = lock ? 0 : o.vx || 0, vy = lock ? 0 : o.vy || 0, spd = Math.hypot(vx, vy), lead = clamp(spd / 115, 0, 1), ux = spd > 1 ? vx / spd : 0, uy = spd > 1 ? vy / spd : 0;
    for (let k = 0; k < 6; k++) {
      const sd = (o.id || 1) * 7.1 + k * 3.3, q = (t * 0.75 + hsh(sd)) % 1, fall = 1 - q;
      const x = p.x + (hsh(sd + 1) - 0.5) * r * 1.2 + Math.sin(t * 1.8 + k) * 3 + ux * r * 0.7 * lead * fall, y = p.y + (hsh(sd + 2) - 0.5) * r * 0.7 + uy * r * 0.5 * lead * fall - fall * 44;
      const fa = Math.sin(q * Math.PI) * Math.min(1, u * 1.3) * 0.85;
      g.fillStyle = `rgba(80,110,150,${(0.28 * fa).toFixed(3)})`; circle(g, x + 0.5, y + 0.8, 2.2); g.fill();
      g.fillStyle = `rgba(255,255,255,${fa.toFixed(3)})`; circle(g, x, y, 1.8); g.fill();
    }
  }
  g.restore();
}
// the landing: a soft icy ripple rolling out over the floor (the dust is draw-fight.js's shockwave)
function iceShock(g, o) {
  const k = clamp(o.t / (o.life || 0.3), 0, 1), r = Math.max(6, o.r || 10), a = 1 - k;
  softDisc(g, o.x, o.y, r + 6, [[0, '200,232,255', 0], [0.7, '200,232,255', 0.2 * a], [0.9, '255,255,255', 0.35 * a], [1, '255,255,255', 0]], Math.max(0, r - 14));
}
// Duke's portal behind them: a small soft swirl on the floor, coffee brown and cream turning slowly, a gentle glow over
// it and a few sparkles twinkling just above; it opens softly, then swells and fades as he pops out
function portalMark(g, o, t) {
  const age = o.t || 0, life = o.life || 0.75, outK = o.ph === 'out' ? clamp((age - (life - 0.3)) / 0.3, 0, 1) : 0;
  const k = ease(age / 0.14), r = (o.r || 20) * 1.2 * (0.4 + 0.6 * k) * (1 + 0.4 * outK), a = (1 - outK) * clamp(age / 0.08, 0, 1);
  if (a <= 0.01) return;
  g.save(); g.globalAlpha *= a; g.lineCap = 'round';
  softDisc(g, o.x, o.y, r * 1.3, [[0, '84,52,30', 0.4], [0.55, '96,62,36', 0.24], [1, '96,62,36', 0]]);   // (a soft dark under it: reads on a pale floor)
  softDisc(g, o.x, o.y, r * 1.1, [[0, '255,244,226', 0.5], [0.5, '246,222,190', 0.22], [1, '246,222,190', 0]]);   // (the glow)
  for (let j = 0; j < 3; j++) {   // the swirl: three soft arms turning in
    const a0 = -t * 3.2 + j * TAU / 3;
    g.beginPath();
    for (let q = 0; q <= 1.0001; q += 0.1) { const rr = r * (0.15 + 0.75 * q), an = a0 + q * 2.6; g.lineTo(o.x + Math.cos(an) * rr, o.y + Math.sin(an) * rr); }
    g.strokeStyle = j === 1 ? 'rgba(255,248,236,0.6)' : 'rgba(120,78,46,0.42)'; g.lineWidth = j === 1 ? 1.6 : 2.4; g.stroke();
  }
  for (let j = 0; j < 3; j++) {   // sparkles just above it
    const q = (t * 1.3 + j / 3) % 1, an = j * 2.1 + t * 0.8, x = o.x + Math.cos(an) * r * 0.7, y = o.y + Math.sin(an) * r * 0.5 - 4 - q * 12, s = 2.6 * Math.sin(q * Math.PI);
    if (s < 0.3) continue;
    starPath(g, x, y, s * 1.5, s * 0.4, 4, 0); g.fillStyle = 'rgba(255,248,232,0.85)'; g.fill();
  }
  g.restore();
}
// Duke's portal in 3D (2026-10-24, "a swirling 3D portal ring he spins into and bursts out of"): a ring of Java orange,
// blue and cream lying on the floor and spinning (art/prop3d.js 'portal'), a well of coffee and cream swirling down
// inside it, a few motes rising off it. portalRing: R its radius, a its alpha; portal3: the mark behind the foe, opening,
// then bursting wide and fading as he pops out
const PSQ = Math.sin(28 * Math.PI / 180);   // (seen from the models' 28°: the well squashed as the ring is)
function portalRing(g, x, y, R, open, t, a) {
  if (a <= 0.01 || R < 2) return;
  const sc = R / 22, rr = 18.6 * sc;
  g.save(); g.globalAlpha *= a;
  g.save(); g.translate(x, y - 1.5 * sc); g.scale(1, PSQ);
  const wg = g.createRadialGradient(0, 0, 0, 0, 0, rr);
  wg.addColorStop(0, 'rgba(34,18,8,0.95)'); wg.addColorStop(0.45, 'rgba(92,52,24,0.9)'); wg.addColorStop(0.85, 'rgba(214,170,120,0.85)'); wg.addColorStop(1, 'rgba(246,226,196,0.7)');
  g.fillStyle = wg; circle(g, 0, 0, rr); g.fill();
  g.save(); circle(g, 0, 0, rr); g.clip(); g.lineCap = 'round';
  for (let j = 0; j < 4; j++) {   // the arms of the swirl wheeling down into it
    const a0 = -t * 4.2 + j * TAU / 4; g.beginPath();
    for (let q = 0; q <= 1.0001; q += 0.08) { const r = rr * (0.12 + 0.9 * q), an = a0 + q * 3.2; g.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
    g.strokeStyle = j % 2 ? 'rgba(255,244,226,0.55)' : 'rgba(248,152,32,0.4)'; g.lineWidth = (j % 2 ? 2.2 : 3) * sc; g.stroke();
  }
  g.restore(); g.restore();
  g.save(); g.translate(x, y); drawProp3D(g, 'portal', { frame: t * 14, scale: sc }); g.restore();
  for (let j = 0; j < 3; j++) {   // motes rising off it
    const q = (t * 1.2 + j / 3) % 1, an = j * 2.1 + t * 0.9, s = 2.4 * Math.sin(q * Math.PI) * open;
    if (s < 0.3) continue;
    starPath(g, x + Math.cos(an) * rr * 0.7, y + Math.sin(an) * rr * 0.3 - 6 - q * 22 * sc, s * 1.5, s * 0.4, 4, 0); g.fillStyle = 'rgba(255,246,228,0.9)'; g.fill();
  }
  g.restore();
}
function portal3(g, o, t) {
  const age = o.t || 0, life = o.life || 0.75, outK = o.ph === 'out' ? clamp((age - (life - 0.3)) / 0.3, 0, 1) : 0, k = ease(age / 0.14);
  portalRing(g, o.x, o.y, (o.r || 20) * 1.15 * (0.4 + 0.6 * k) * (1 + 0.5 * ease(outK)), k, t, (1 - outK * outK) * clamp(age / 0.08, 0, 1));
}
// Stop the World: a soft grey ripple spreading out from Duke while he snaps, like a ripple on still water: a light crest
// at its edge over a soft darker trough just inside it (both gradients, no line), the water inside a touch greyer, a
// fainter ripple or two following it out; its full reach only a very faint tint. Completing, a soft pale flash; broken,
// it fades (moveEvent's flecks)
function stopRing(g, o, t) {
  const R = o.R || 105, ph = o.ph;
  const ripple = (r, a) => softDisc(g, o.x, o.y, r + 5, [[0, '70,74,92', 0], [0.42, '70,74,92', 0.17 * a], [0.74, '238,240,246', 0.42 * a], [1, '238,240,246', 0]], Math.max(0, r - 18));
  g.save();
  if (ph === 'grow') {
    const r = Math.max(2, o.r || 0), u = r / R;
    softDisc(g, o.x, o.y, R, [[0, '150,154,170', 0.06], [0.95, '150,154,170', 0.07], [1, '150,154,170', 0]]);   // (the full reach: a faint tint)
    softDisc(g, o.x, o.y, r, [[0, '128,132,148', 0.08 + 0.06 * u], [1, '128,132,148', 0.12 + 0.06 * u]]);   // (inside: a touch greyer)
    for (let j = 0; j < 2; j++) { const q = (t * 1.6 + j * 0.5) % 1; if (r * q > 14) ripple(r * q, 0.35 * (1 - q)); }
    ripple(r, 1);
  } else if (ph === 'done') {
    const left = (o.life || 0) - (o.t || 0), k = 1 - clamp(left / 0.25, 0, 1);
    softDisc(g, o.x, o.y, R * (1 + 0.06 * k), [[0, '240,242,248', 0.22 * (1 - k)], [0.85, '240,242,248', 0.12 * (1 - k)], [1, '240,242,248', 0]]);
    ripple(R * (1 + 0.06 * k), 1 - k);
  } else if (ph === 'break') {
    const left = (o.life || 0) - (o.t || 0), k = 1 - clamp(left / 0.2, 0, 1);
    ripple(Math.max(4, o.r || 0) + k * 10, 1 - k);
  }
  g.restore();
}
// the geyser's spot: a wet coffee stain on the floor (a soft irregular patch, darker toward the middle, a wet glint),
// faint while he aims with a subtle ring of little bubbles round its rim turning slowly as it glides; when the pot leaves
// (the aim locks) it settles: a soft draw-in and one soft ripple rolling out of it, then darker. Brewing it darkens,
// bubbles rise and pop in it and the ground cracks out from it. No ring line
function geyserMark(g, o, v) {
  const ph = o.ph, r0 = o.r || 34, pt = o.pt || 0, t = o.t || 0, seed = (o.id || 1) * 2.3, p = ph === 'aim' ? glide(v, o) : o;
  const brew = ph === 'brew' ? clamp(pt / 0.35, 0, 1) : ph === 'erupt' ? 1 : 0, fade = ph === 'erupt' ? clamp(1 - pt / 0.35, 0, 1) : clamp(t / 0.1, 0, 1);
  const lockK = ph === 'fly' ? pt : -1, settle = lockK >= 0 ? bump(lockK / 0.2) : 0, r = r0 * (1 - 0.06 * settle);
  const A = (ph === 'aim' ? 0.36 : ph === 'fly' ? 0.46 + 0.08 * settle : 0.5 + 0.22 * brew) * fade;
  if (A <= 0.01) return;
  const x0 = p.x, y0 = p.y, edge = an => 1 + 0.07 * Math.sin(3 * an + seed) + 0.04 * Math.sin(5 * an + seed * 1.7);
  g.save();
  if (lockK >= 0 && lockK < 0.4) { const q = lockK / 0.4, rr = r0 * (0.9 + 0.55 * ease(q)); softDisc(g, x0, y0, rr + 6, [[0, '120,72,36', 0], [0.7, '120,72,36', 0.14 * (1 - q)], [0.88, '255,240,220', 0.28 * (1 - q)], [1, '255,240,220', 0]], Math.max(0, rr - 10)); }   // (the ripple as it locks)
  // the stain: soft round dark under it, then an irregular wet patch
  softDisc(g, x0, y0, r * 1.14, [[0, '74,42,20', A * 0.55], [0.8, '74,42,20', A * 0.35], [1, '74,42,20', 0]]);
  g.beginPath(); for (let i = 0; i <= 32; i++) { const an = i / 32 * TAU, d = r * 0.86 * edge(an); g.lineTo(x0 + Math.cos(an) * d, y0 + Math.sin(an) * d * 0.96); } g.closePath();
  const gr = g.createRadialGradient(x0, y0, 0, x0, y0, r * 0.95);
  gr.addColorStop(0, `rgba(92,52,24,${(A * 0.9).toFixed(3)})`); gr.addColorStop(1, `rgba(120,72,36,${(A * 0.45).toFixed(3)})`);
  g.fillStyle = gr; g.fill();
  g.fillStyle = `rgba(255,240,220,${(0.22 * fade).toFixed(3)})`; g.beginPath(); g.ellipse(x0 - r * 0.32, y0 - r * 0.3, r * 0.22, r * 0.09, -0.4, 0, TAU); g.fill();   // (a wet glint)
  if (brew > 0 && ph === 'brew') {
    g.strokeStyle = `rgba(70,40,18,${(0.32 * brew * fade).toFixed(3)})`; g.lineWidth = 1.2; g.lineCap = 'round';   // the ground cracking out from it
    for (let k = 0; k < 4; k++) { const an = k / 4 * TAU + 0.4 + hsh(seed + k) * 0.5, j = (hsh(seed + k * 2) - 0.5) * 0.6, L = r * (0.72 + 0.28 * brew); g.beginPath(); g.moveTo(x0 + Math.cos(an) * r * 0.7, y0 + Math.sin(an) * r * 0.7); g.lineTo(x0 + Math.cos(an + j * 0.4) * L * 0.95, y0 + Math.sin(an + j * 0.4) * L * 0.95); g.lineTo(x0 + Math.cos(an + j) * L * 1.1, y0 + Math.sin(an + j) * L * 1.1); g.stroke(); }
    for (let k = 0; k < 6; k++) {   // bubbles rising and popping in it
      const q = (pt * 2.8 + hsh(seed + k * 5)) % 1, an = hsh(seed + k * 7) * TAU, d = r * 0.6 * Math.sqrt(hsh(seed + k * 3)), x = x0 + Math.cos(an) * d, y = y0 + Math.sin(an) * d, rb = 1 + 2.6 * q * brew;
      g.fillStyle = `rgba(150,96,52,${(0.9 * (1 - q * q)).toFixed(3)})`; circle(g, x, y, rb); g.fill();
      g.fillStyle = `rgba(255,236,210,${(0.6 * (1 - q)).toFixed(3)})`; circle(g, x - rb * 0.35, y - rb * 0.35, rb * 0.35); g.fill();
    }
  } else if (ph === 'aim' || ph === 'fly') {   // the ring of little bubbles round the rim (aiming), swelling and popping in turn
    const n = 9, rot = (o.t || 0) * 0.5, ring = ph === 'aim' ? 1 : 1 - clamp(pt / 0.25, 0, 1);
    for (let k = 0; k < n && ring > 0.02; k++) {
      const an = rot + k / n * TAU, q = (t * 1.1 + hsh(seed + k)) % 1, rb = (0.9 + 1.5 * Math.sin(q * Math.PI)) * ring, x = x0 + Math.cos(an) * r * 0.8, y = y0 + Math.sin(an) * r * 0.74;
      g.fillStyle = `rgba(70,40,18,${(0.3 * ring * fade).toFixed(3)})`; circle(g, x + 0.4, y + 0.7, rb + 0.4); g.fill();
      g.fillStyle = `rgba(214,170,124,${(0.75 * ring * fade).toFixed(3)})`; circle(g, x, y, rb); g.fill();
      g.fillStyle = `rgba(255,244,228,${(0.7 * ring * fade).toFixed(3)})`; circle(g, x - rb * 0.35, y - rb * 0.35, rb * 0.35); g.fill();
    }
  }
  g.restore();
}

// Duke's coffee puddle in 3D (draw-fight.js groundObjs calls this first; false: its 2D one): a glossy wet puddle the
// sim's size, fading and shrinking a little as it dries
export function puddle3D(g, o) {
  if (!propReady('puddle', 'coffee')) return false;
  const life = o.life ?? 4, age = o.t || 0, left = life - age, u = clamp(age / life, 0, 1), a = clamp(age / 0.18, 0, 1) * clamp(left / 1.2, 0, 1);
  if (a <= 0.01) return true;
  const r = (o.r || 38) * (1 - 0.1 * u) * (age < 0.18 ? 0.7 + 0.3 * age / 0.18 : 1);
  return decal3(g, 'puddle', o.x, o.y, r * 0.95, { state: 'coffee', frame: 0, alpha: a * 0.94 });
}

// ---------------------------------------------------------------- among the fighters
export function moveThings(F, v, g) {
  const out = [];
  if (P3('glacier')) for (const f of F.f) {   // Tux riding his glacier down onto its shadow, and it breaking under him as it lands
    if (f.air && (f.ph === 'high' || f.ph === 'drop')) {
      const z = bergZ(f); if (z < 0) continue;
      const sh = (F.objs || []).find(o => o.kind === 'shadow' && o.owner === f.i), p = sh ? glide(v, sh) : f, x = p.x, y = p.y;
      out.push({ y, d: () => bergRide(g, F, v, f, x, y, z, 1) });
    } else if (bergBreak(f) > 0) out.push({ y: f.y - 0.5, d: () => bergRide(g, F, v, f, f.x, f.y, 0, bergBreak(f)) });
  }
  for (const o of F.objs || []) {
    if (o.kind === 'peng' && o.ph !== 'wait' && o.ph !== 'burst' && o.t < o.life) out.push({ y: o.y, d: () => penguin(g, o, v, F) });
    else if (o.kind === 'geyser') {
      if (o.ph === 'fly') out.push({ y: o.py, d: () => potFly(g, o, v) });
      else if (o.ph === 'brew') out.push({ y: o.y, d: () => potBrew(g, o, v) });
      else if (o.ph === 'erupt') out.push({ y: o.y + 1, d: () => column(g, o, v) });
    }
  }
  return out;
}
// the glacier (art/prop3d.js): z up in the air (cosmetic: bergZ), q 1 whole, less as it breaks on landing (squashed into
// the floor, spreading a little and fading: the chunks are the land event's), Tux surfing on top while it's whole
function bergRide(g, F, v, f, x, y, z, q) {
  const sc = bergScale(f), frame = f.i * 2 + 1;
  g.save(); g.translate(x, y - z);
  if (q < 1) drawProp3D(g, 'glacier', { frame, scale: sc * (1 + 0.16 * (1 - q)), sy: Math.max(0.05, q), alpha: 0.35 + 0.65 * q });
  else {
    g.rotate(Math.sin(v.t * 3.1 + f.i) * 0.025);
    drawProp3D(g, 'glacier', { frame, scale: sc });
    if (v.fx.length < 120 && frnd(0, 1) < 0.22) { const a = frnd(0, TAU); bit3(v, 'snow', x + Math.cos(a) * 40 * sc, y + Math.sin(a) * 18 * sc, z + frnd(30, 60) * sc, { dz: -frnd(20, 60), g: 380, s: frnd(1.8, 3), life: 0.45 }); }   // (snow shaken off it as it comes down)
    g.translate(0, -(GLACIER_TOP - 1.5) * sc);
    model(g, charOf(f.id), { t: v.t + f.i * 2.3, scale: SCALE, smooth: true, yaw: f.face + 0.35 * Math.sin(Math.PI / 2 - f.face), lean: Math.sin(v.t * 4.4 + f.i) * 0.05, mood: 'happy', pose: 'ride', shadow: false, fight: true });
  }
  g.restore();
}
// a little fork penguin: tiny Tux (his own model, small) popping out of him with a hop, waddling at them, then sliding
// in on his belly; a faint tint of Tux's colour under its feet says whose it is
function penguin(g, o, v, F) {
  const ch = charOf((F.f[o.owner] || {}).id || 'tux'), pt = o.pt || 0, col = colOf(o), a = o.a || 0;
  let s = 1, hop = 0, pose = 'stand', yaw = a + 0.35 * Math.sin(Math.PI / 2 - a), lean = 0;
  if (o.ph === 'pop') { const u = clamp(pt / 0.18, 0, 1); s = 0.4 + 0.6 * backE(u); hop = Math.sin(u * Math.PI) * 10; pose = 'air'; }
  else if (o.ph === 'waddle') { pose = M3.walkPose ? M3.walkPose(pt * 2.4) : 'stand'; hop = Math.abs(Math.sin(pt * 14)) * 1.3; lean = Math.sin(pt * 7) * 0.12; }
  else if (o.ph === 'slide') { pose = 'slide'; yaw = a; }
  const R = 9 * s;
  shadow(g, o.x, o.y, hop, 8 * s);
  g.save(); g.beginPath(); g.ellipse(o.x, o.y + 1, R + 4, (R + 4) * 0.5, 0, 0, TAU); g.fillStyle = hexA(col, 0.2); g.fill(); g.restore();
  g.save(); g.translate(o.x, o.y - hop);
  model(g, ch, { t: v.t + (o.id || 0), scale: SCALE * 0.42 * s, smooth: true, yaw, lean, mood: o.ph === 'slide' ? 'happy' : null, pose, shadow: false, fight: true });
  g.restore();
  if (P3('bit:snow')) {   // in 3D: a puff of snow off a foot at each step, a spray off its belly, a burst as it pops out
    const S = v.pstep || (v.pstep = new Map()), id = o.id || 0, nx = S.get(id);
    if (o.ph === 'pop' && nx === undefined) { bits3(v, 'snow', o.x, o.y, 6, 3, { speed: [20, 60], up: [40, 90], s: [2, 3], life: [0.35, 0.5], drag: 2 }); S.set(id, v.t + 0.2); if (P3('snowpile')) (v.piles || (v.piles = [])).push({ x: o.x, y: o.y, t: v.t, id }); }
    else if (o.ph === 'waddle' && v.t >= (nx ?? 0)) { bit3(v, 'snow', o.x + frnd(-4, 4), o.y + frnd(-2, 2), 1, { dx: frnd(-20, 20), dy: frnd(-10, 10), dz: frnd(30, 60), g: 400, s: frnd(1.4, 2.2), life: 0.35, drag: 2 }); S.set(id, v.t + 0.2); }
    else if (o.ph === 'slide' && v.t >= (nx ?? 0)) { bit3(v, 'snow', o.x - Math.cos(a) * 8, o.y - Math.sin(a) * 8, 2, { dx: -Math.cos(a) * frnd(20, 60) + frnd(-20, 20), dy: -Math.sin(a) * frnd(10, 30) + frnd(-10, 10), dz: frnd(40, 90), g: 500, s: frnd(1.8, 2.8), life: 0.4, drag: 1.5 }); S.set(id, v.t + 0.06); }
    if (S.size > 24) for (const k of S.keys()) { S.delete(k); if (S.size <= 12) break; }
  } else if (o.ph === 'slide' && v.fx.length < 130 && frnd(0, 1) < 0.2) v.fx.push({ k: 'snow', x: o.x - Math.cos(a) * 8, y: o.y - Math.sin(a) * 8, z: 2, vx: -Math.cos(a) * frnd(20, 60) + frnd(-20, 20), vy: -Math.sin(a) * frnd(10, 30), vz: frnd(40, 90), t: 0, life: 0.4, s: frnd(1.6, 2.6) });
}
// Duke's coffee pot: a round blue pot, a red lid with a knob, a spout and a handle, lit from the top left (s: its size)
function drawPot(g, s = 1) {
  const BD = bold(), RED = BD ? BK.red : '#e8231a';
  g.save(); g.scale(s, s); g.lineCap = 'round';
  g.strokeStyle = '#2f5470'; g.lineWidth = 2.6; g.beginPath(); g.arc(-7.5, 0, 4, Math.PI * 0.55, Math.PI * 1.45); g.stroke();   // the handle
  g.fillStyle = '#4a7898'; g.beginPath(); g.moveTo(5, -2); g.lineTo(12, -7); g.lineTo(13, -5); g.lineTo(6, 2.5); g.closePath(); g.fill();   // the spout
  g.fillStyle = JAVA_B; circle(g, 0, 0, 7.5); g.fill();
  g.fillStyle = '#3d6585'; g.beginPath(); g.arc(0, 0, 7.5, -0.2, Math.PI * 0.9); g.arc(-1.5, -1, 6, Math.PI * 0.9, -0.2, true); g.fill();   // its shaded side
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(-2.6, -3, 2.4, 1.4, -0.6, 0, TAU); g.fill();
  g.fillStyle = RED; g.beginPath(); g.ellipse(0, -7, 5, 2, 0, 0, TAU); g.fill(); circle(g, 0, -9.5, 1.6); g.fill();
  g.restore();
}
function potFly(g, o, v) {
  const pz = o.pz || 0, sk = 1 / (1 + pz / 120);
  if (P3('pot')) {   // the 3D pot tumbling along its arc, a thread of steam left behind it
    g.fillStyle = `rgba(20,16,42,${(0.3 * sk).toFixed(3)})`; g.beginPath(); g.ellipse(o.px, o.py, 11 * sk, 4.4 * sk, 0, 0, TAU); g.fill();
    if (v && frnd(0, 1) < 0.35) bit3(v, 'steam', o.px, o.py, pz + 8, { dz: 10, g: -10, drag: 2, grow: 0.9, s: frnd(2.2, 3.4), life: frnd(0.4, 0.6), al: 0.75, sh: false });
    const pt = o.pt || 0;
    g.save(); g.translate(o.px, o.py - pz - 6); g.rotate(Math.sin(pt * 9) * 0.7); g.translate(0, 6); drawProp3D(g, 'pot', { yaw: pt * 15, scale: 1.1 }); g.restore();
    return;
  }
  g.fillStyle = `rgba(20,16,42,${(0.3 * sk).toFixed(3)})`; g.beginPath(); g.ellipse(o.px, o.py, 10 * sk, 4 * sk, 0, 0, TAU); g.fill();
  for (let k = 1; k <= 3; k++) { const x = o.px - (o.x - (o.sx ?? o.px)) * 0.04 * k, y = o.py - pz - 8 + k * 5; g.fillStyle = `rgba(255,255,255,${(0.35 * (1 - k / 4)).toFixed(3)})`; circle(g, x - k * 3, y - k * 4, 3 + k); g.fill(); }
  g.save(); g.translate(o.px, o.py - pz); g.rotate((o.pt || 0) * 11); drawPot(g, 1.15); g.restore();
}
// landed on its mark: shaking, steam puffing out of its spout, coffee bubbling up round it
function potBrew(g, o, v) {
  const pt = o.pt || 0, sh = Math.sin(pt * 50) * 1 * (0.4 + pt / 0.4);
  shadow(g, o.x, o.y, 0, 10);
  if (P3('pot')) {   // landed on its mark: the 3D pot rattling, coffee bubbling up round it, steam puffing out of its spout faster and faster
    for (let k = 0; k < 5; k++) {
      const q = (pt * 3 + k * 0.23) % 1, an = k * 1.3 + 0.4, d = 14 + (k % 2) * 8, x = o.x + Math.cos(an) * d, y = o.y + Math.sin(an) * d * 0.7 - q * 8, r = 2 + 2.5 * Math.sin(q * Math.PI);
      g.fillStyle = 'rgba(150,92,46,0.9)'; circle(g, x, y, r); g.fill(); g.fillStyle = 'rgba(255,236,210,0.7)'; circle(g, x - r * 0.35, y - r * 0.35, r * 0.35); g.fill();
    }
    const yaw = -0.5;
    g.save(); g.translate(o.x + sh, o.y); g.rotate(sh * 0.04); drawProp3D(g, 'pot', { yaw, scale: 1.2 }); g.restore();
    if (frnd(0, 1) < 0.12 + 0.3 * clamp(pt / 0.4, 0, 1)) bit3(v, 'steam', o.x + Math.cos(yaw) * 13, o.y + Math.sin(yaw) * 6, 14, { dx: frnd(5, 20), dz: frnd(30, 50), g: -30, drag: 1.2, grow: 1.3, s: frnd(2.4, 3.8), life: frnd(0.5, 0.8), al: 0.85, sh: false });
    return;
  }
  for (let k = 0; k < 5; k++) {   // bubbles round it
    const q = (pt * 3 + k * 0.23) % 1, an = k * 1.3 + 0.4, d = 14 + (k % 2) * 8, x = o.x + Math.cos(an) * d, y = o.y + Math.sin(an) * d * 0.7 - q * 8, r = 2 + 2.5 * Math.sin(q * Math.PI);
    g.fillStyle = 'rgba(150,92,46,0.9)'; circle(g, x, y, r); g.fill(); g.fillStyle = 'rgba(255,236,210,0.7)'; circle(g, x - r * 0.35, y - r * 0.35, r * 0.35); g.fill();
  }
  g.save(); g.translate(o.x + sh, o.y - 8); g.rotate(sh * 0.03); drawPot(g, 1.15); g.restore();
  if (v.fx.length < 130 && frnd(0, 1) < 0.15) v.fx.push({ k: 'steam', x: o.x + 14, y: o.y - 18, vx: frnd(5, 20), vy: -frnd(25, 45), t: 0, life: frnd(0.5, 0.8), s: frnd(4, 7) });
}
// the eruption: a column of coffee shooting up off the mark, a lighter stripe down it, white froth at its top, a splash
// round its foot, steam boiling off it; it shoots up fast, holds, and falls back
function column(g, o, v) {
  const pt = o.pt || 0, E = 0.35, up = ease(pt / 0.09), down = clamp((E - pt) / 0.13, 0, 1), BD = bold();
  const H = 90 * up * (0.35 + 0.65 * down), w = (o.r || 34) * 0.55 * (0.75 + 0.25 * down), x = o.x, y = o.y, wob = k => Math.sin(v.t * 18 + k * 3) * 1.5;
  if (P3('gcol') && P3('froth') && P3('gsplash')) {   // in 3D: a glossy coffee column shooting up out of a splash, its streaks flowing, froth on top, the pot blown up off it
    const sc = w / 15, r = o.r || 34;
    g.save(); g.translate(x, y); drawProp3D(g, 'gsplash', { frame: v.t * 9, scale: r / 26 * (0.6 + 0.4 * up) }); g.restore();
    if (H > 3) { g.save(); g.translate(x, y - 2); drawProp3D(g, 'gcol', { frame: v.t * 16, scale: sc, sy: H / (100 * sc) }); g.restore(); }
    g.save(); g.translate(x, y - H - 1); drawProp3D(g, 'froth', { frame: v.t * 10, scale: sc * 1.1 * (0.55 + 0.45 * up) });
    if (down > 0.05) { g.translate(0, -10 - 16 * up); g.rotate(pt * 8); drawProp3D(g, 'pot', { yaw: pt * 22, scale: 1.05, alpha: down }); }
    g.restore();
    if (frnd(0, 1) < 0.35) { const a = frnd(0, TAU), sp = frnd(25, 70); bit3(v, 'drop', x + Math.cos(a) * w * 0.6, y + Math.sin(a) * w * 0.3, H * frnd(0.7, 1), { dx: Math.cos(a) * sp, dy: Math.sin(a) * sp * 0.5, dz: frnd(40, 140), s: frnd(1.8, 3), life: 0.8, bo: 0 }); }
    if (frnd(0, 1) < 0.18) bit3(v, 'steam', x + frnd(-w, w), y, H * frnd(0.5, 1), { dx: frnd(-16, 16), dz: frnd(20, 40), g: -20, drag: 1.2, grow: 1.4, s: frnd(4.5, 7), life: frnd(0.7, 1.1), sh: false });
    return;
  }
  g.save();
  g.fillStyle = BD ? '#6e4020' : 'rgba(110,64,32,0.95)'; g.beginPath(); g.ellipse(x, y, w * 1.6, w * 0.7, 0, 0, TAU); g.fill();
  g.fillStyle = BD ? '#8a5530' : '#8c5630'; g.beginPath();
  g.moveTo(x - w, y); for (let k = 0; k <= 6; k++) { const q = k / 6; g.lineTo(x - w * (1 - 0.35 * q) + wob(k), y - H * q); }
  for (let k = 6; k >= 0; k--) { const q = k / 6; g.lineTo(x + w * (1 - 0.35 * q) + wob(k + 7), y - H * q); }
  g.closePath(); g.fill();
  g.fillStyle = BD ? '#b47a48' : 'rgba(190,130,80,0.9)'; g.beginPath(); g.moveTo(x - w * 0.6, y); g.lineTo(x - w * 0.35 + wob(2), y - H * 0.95); g.lineTo(x - w * 0.1 + wob(3), y - H * 0.95); g.lineTo(x - w * 0.25, y); g.closePath(); g.fill();
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI - Math.PI / 2 + Math.sin(v.t * 9 + k) * 0.2, fx = x + Math.cos(a + Math.PI / 2) * w * 0.7, fy = y - H - 2 + Math.abs(Math.sin(a)) * 4; g.fillStyle = '#ffffff'; circle(g, fx, fy, w * 0.42 + (k % 2) * 2); g.fill(); }
  g.fillStyle = 'rgba(255,248,236,0.9)'; g.beginPath(); g.ellipse(x, y - 1, w * 1.25, w * 0.42, 0, 0, Math.PI); g.fill();
  g.restore();
  if (v.fx.length < 130 && frnd(0, 1) < 0.3) { const a = frnd(0, TAU), sp = frnd(25, 70); v.fx.push({ k: 'drop', x: x + frnd(-w, w), y, z: H * frnd(0.6, 1), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, vz: frnd(40, 140), t: 0, life: 0.8, s: frnd(1.8, 3) }); }
  if (v.fx.length < 130 && frnd(0, 1) < 0.18) v.fx.push({ k: 'steam', x: x + frnd(-w, w), y: y - H * frnd(0.5, 1), vx: frnd(-16, 16), vy: -frnd(20, 40), t: 0, life: frnd(0.7, 1.1), s: frnd(7, 11) });
}

// ---------------------------------------------------------------- round a fighter
// before the model: 'hide' while he's out of sight (between portals, up out of shot); the toboggan's spray, the leap's
// streaks, the spin's swirl
export function moveBehind(g, F, v, f) {
  if (f.gone || (f.air && (f.ph === 'high' || (f.ph === 'drop' && P3('glacier')) || (f.z || 0) > 300))) return 'hide';   // (riding the glacier down: moveThings draws him on it)
  const ph = f.ph;
  if (ph === 'iceblock' && P3('icecube')) { g.save(); g.translate(f.x, f.y); drawProp3D(g, 'icecube', { yaw: 0.55, scale: 1.1, clip: ease((f.pht || 0) / 0.08) }); g.restore(); }   // (the ice behind him: moveOver lays its front over him)
  if ((ph === 'slide' || ph === 'skid') && v.fx.length < 130) {   // spray off his sides, a fleck of ice now and then
    const S = v.spray || (v.spray = [0, 0]);
    if (v.t >= S[f.i]) {
      S[f.i] = v.t + (ph === 'slide' ? 0.055 : 0.1);
      const a = f.face, c = Math.cos(a), s = Math.sin(a);
      if (P3('bit:snow')) {   // a wake of 3D snow thrown off both sides and back, now and then a chip of ice
        S.n = (S.n || 0) + 1;
        for (const side of [-1, 1]) bit3(v, S.n % 4 === 0 && side > 0 ? 'ice' : 'snow', f.x - c * 10 - s * side * 10, f.y - s * 10 + c * side * 10, 3, { dx: -c * frnd(25, 60) - s * side * frnd(35, 80), dy: (-s * frnd(25, 60) + c * side * frnd(35, 80)) * 0.7, dz: frnd(60, 130), s: S.n % 4 === 0 && side > 0 ? frnd(1.8, 2.6) : frnd(2.2, 3.6), life: frnd(0.35, 0.55), drag: 1.6, g: 560 });
      } else for (const side of [-1, 1]) v.fx.push({ k: 'snow', x: f.x - c * 10 - s * side * 10, y: f.y - s * 10 + c * side * 10, z: 3, vx: -c * frnd(25, 55) - s * side * frnd(30, 70), vy: (-s * frnd(25, 55) + c * side * frnd(30, 70)) * 0.6, vz: frnd(50, 110), t: 0, life: frnd(0.3, 0.5), s: frnd(1.6, 2.6) });
    }
  }
  if (ph === 'up' && f.z > 6 && P3('bit:snow')) { if (f.z < 300 && frnd(0, 1) < 0.5) bit3(v, 'snow', f.x + frnd(-8, 8), f.y, Math.max(0, f.z - 12), { dz: -frnd(40, 90), g: 300, s: frnd(1.8, 2.8), life: 0.4 }); }   // (snow falling off him as he shoots up)
  else if (ph === 'up' && f.z > 6) {   // streaks under him as he shoots up
    g.save(); g.lineCap = 'round';
    for (let k = 0; k < 4; k++) { const x = f.x + (k - 1.5) * 9, y0 = f.y - f.z + 10, y1 = Math.min(f.y - 6, y0 + 40 + k % 2 * 24); g.strokeStyle = `rgba(255,255,255,${k % 2 ? 0.28 : 0.42})`; g.lineWidth = k % 2 ? 2 : 3; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); }
    g.restore();
  }
  if (ph === 'spin' && !P3('portal')) {   // a swirl of streaks round him as he spins away (with the 3D ring: none, he goes into it)
    const u = clamp((f.pht || 0) / 0.22, 0, 1);
    g.save(); g.lineCap = 'round';
    for (let k = 0; k < 3; k++) { const a0 = v.t * 15 + k * TAU / 3, R = 22 - 7 * u; g.strokeStyle = k === 1 ? `rgba(248,152,32,${(0.5 * (1 - u * 0.5)).toFixed(3)})` : `rgba(255,255,255,${(0.5 * (1 - u * 0.5)).toFixed(3)})`; g.lineWidth = 2.4; g.beginPath(); g.ellipse(f.x, f.y - 24, R, R * 0.55, 0, a0, a0 + 2); g.stroke(); }
    g.restore();
  }
  return null;
}
// after the model (at their feet, lifted with them): the snap's spark, a statue's cracks as it thaws, the ice block's front
export function moveOver(g, F, v, f) {
  const ph = f.ph;
  const st = v.snapT && v.snapT[f.i], sa = v.t - (st ?? -9);
  if (sa >= 0 && sa < 0.35) {   // the snap: a white spark at his raised fingers and three short lines flicking off it
    const k = sa / 0.35, hx = -Math.sin(f.face) * 12, hy = -70 + Math.cos(f.face) * 3, s = 10 * (k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75);
    g.save(); starPath(g, hx, hy, s * 1.4, s * 0.3, 4, 0.3); g.fillStyle = '#ffffff'; g.fill(); starPath(g, hx, hy, s * 0.7, s * 0.25, 4, 0.3 + Math.PI / 4); g.fillStyle = bold() ? BK.yellow : '#ffd23c'; g.fill();
    g.strokeStyle = `rgba(255,255,255,${(1 - k).toFixed(3)})`; g.lineWidth = 2.5; g.lineCap = 'round';
    for (const an of [-2.2, -1.57, -0.9]) { const r0 = 8 + k * 10; g.beginPath(); g.moveTo(hx + Math.cos(an) * r0, hy + Math.sin(an) * r0); g.lineTo(hx + Math.cos(an) * (r0 + 7), hy + Math.sin(an) * (r0 + 7)); g.stroke(); }
    g.restore();
  }
  if (ph === 'iceblock') { const act = (FIGHTERS[f.id] && FIGHTERS[f.id].moves.evade && FIGHTERS[f.id].moves.evade.active) || 0.6; if (P3('icecube')) iceCube3(g, f.pht || 0, v.t, f.i, act); else iceCube(g, f.pht || 0, v.t, f.i, act); }
  const shT = v.shatT && v.shatT[f.i], sha = v.t - (shT ?? -9);
  if (f.state === 'stagger' && sha >= 0 && sha < 1.4) {   // staggered by the shards: three little ice crystals circling over their head, frost settling
    const fa = clamp(sha / 0.12, 0, 1) * clamp((1.4 - sha) / 0.3, 0, 1);
    g.save(); g.lineCap = 'round';
    for (let s = 0; s < 3; s++) {
      const a = v.t * 3.2 + s * TAU / 3, x = Math.cos(a) * 15, y = -62 + Math.sin(a) * 5, z = 3.6 + Math.sin(a) * 0.8;
      for (const [c, lw, dy] of [['rgba(60,96,140,' + (0.35 * fa).toFixed(3) + ')', 2.4, 0.8], ['rgba(255,255,255,' + (0.95 * fa).toFixed(3) + ')', 1.5, 0]]) {
        g.strokeStyle = c; g.lineWidth = lw; g.beginPath();
        for (let j = 0; j < 3; j++) { const b = a * 0.3 + j * Math.PI / 3; g.moveTo(x - Math.cos(b) * z, y + dy - Math.sin(b) * z); g.lineTo(x + Math.cos(b) * z, y + dy + Math.sin(b) * z); }
        g.stroke();
      }
    }
    g.restore();
  }
  const E = FIGHTERS[f.id] && FIGHTERS[f.id].kit3 && FIGHTERS[f.id].moves.evade;
  if (E && E.charges && f.state !== 'ko' && !f.gone) {   // Duke's Garbage Collect charges: little pips by his feet (the next one filling)
    const n = f.ev ?? E.charges, q = n < E.charges && E.recharge ? clamp(1 - (f.evT || 0) / E.recharge, 0, 1) : 0, y = 9 + (f.z || 0);
    for (let k = 0; k < E.charges; k++) {
      const x = (k - (E.charges - 1) / 2) * 9;
      g.fillStyle = bold() ? hexA(BK.ink, 0.55) : 'rgba(10,14,30,0.5)'; circle(g, x, y, 3.4); g.fill();
      const r = k < n ? 2.5 : k === n ? 2.5 * q : 0;
      if (r > 0.2) { g.fillStyle = k < n ? (PCOL[f.i] || '#fff') : 'rgba(255,255,255,0.55)'; circle(g, x, y, r); g.fill(); }
    }
  }
  if (f.state === 'frozen' && f.dur && f.t > f.dur - 0.35) {   // about to thaw: cracks running over the statue
    const k = clamp((f.t - (f.dur - 0.35)) / 0.35, 0, 1), seed = f.i * 5.3;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    // cracks with depth (2026-10-24): a dark groove, a light lip under it, a chip of grey flaking off the end of each
    for (const [dx, dy, c, w] of [[0.6, 0.9, 'rgba(255,255,255,0.75)', 1.4], [0, 0, 'rgba(52,56,72,0.7)', 1.7]]) {
      g.strokeStyle = c; g.lineWidth = w;
      for (let j = 0; j < 5; j++) { const x0 = (hsh(seed + j) - 0.5) * 20, y0 = -10 - hsh(seed + j * 2) * 40; g.beginPath(); g.moveTo(x0 + dx, y0 + dy); let x = x0, y = y0; for (let n = 0; n < 3; n++) { x += (hsh(seed + j * 7 + n) - 0.5) * 15 * k; y += (hsh(seed + j * 9 + n) - 0.5) * 15 * k; g.lineTo(x + dx, y + dy); } g.stroke(); }
    }
    g.restore();
  }
}

// Tux's Ice Block: a cute cube of ice round him (drawn over him, see-through: he shows inside), rising up round him as it
// forms over a soft frosty puff at its foot, a lighter top, soft pale edges and a shine, a couple of bubbles in it. In its
// last moments thin cracks run up it (2026-10-24: the crack is coming, the moment to hit him; hitting it before that
// shatters it back at you)
function iceCube(g, k, t, i, active = 0.6) {
  const u = ease(k / 0.08), w = 25, h = 58 * u, top = 10, x0 = -w, y1 = 5, y0 = y1 - h;
  if (h < 2) return;
  g.save(); g.lineJoin = 'round';
  softDisc(g, 0, 3, 34, [[0, '235,247,255', 0.4 * (1 - ease(k / 0.4) * 0.6)], [0.7, '235,247,255', 0.2], [1, '235,247,255', 0]]);   // (frost at its foot)
  g.fillStyle = bold() ? 'rgba(178,226,255,0.5)' : 'rgba(170,222,255,0.45)'; g.beginPath(); g.roundRect(x0, y0, w * 2, h, 7); g.fill();
  g.fillStyle = 'rgba(232,248,255,0.75)'; g.beginPath(); g.moveTo(x0 + 4, y0); g.lineTo(x0 + 12, y0 - top); g.lineTo(w + 8, y0 - top); g.lineTo(w, y0); g.closePath(); g.fill();   // the top
  g.fillStyle = 'rgba(140,200,240,0.45)'; g.beginPath(); g.moveTo(w, y0); g.lineTo(w + 8, y0 - top); g.lineTo(w + 8, y1 - top); g.lineTo(w, y1); g.closePath(); g.fill();   // the side in shade
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5; g.beginPath(); g.roundRect(x0, y0, w * 2, h, 7); g.stroke();
  g.beginPath(); g.moveTo(x0 + 4, y0); g.lineTo(x0 + 12, y0 - top); g.lineTo(w + 8, y0 - top); g.lineTo(w + 8, y1 - top); g.lineTo(w, y1); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.roundRect(x0 + 6, y0 + 7, 5, h * 0.5, 2.5); g.fill(); g.beginPath(); g.roundRect(x0 + 14, y0 + 7, 3, h * 0.25, 1.5); g.fill();   // the shine
  for (let j = 0; j < 3; j++) { const q = (t * 0.4 + j * 0.37 + i * 0.2) % 1; g.strokeStyle = `rgba(255,255,255,${(0.7 * Math.sin(q * Math.PI)).toFixed(3)})`; g.lineWidth = 1.2; circle(g, -6 + j * 9, y1 - 6 - q * h * 0.8, 1.6 + j * 0.4); g.stroke(); }
  const cr = clamp((k - (active - 0.2)) / 0.2, 0, 1);
  if (cr > 0) {   // the cracks running up it
    g.strokeStyle = `rgba(255,255,255,${(0.9 * cr).toFixed(3)})`; g.lineWidth = 1.3; g.lineCap = 'round';
    for (let j = 0; j < 3; j++) {
      const sx = -14 + j * 13, L = h * 0.75 * cr; g.beginPath(); g.moveTo(sx, y1 - 2);
      for (let n = 1; n <= 3; n++) g.lineTo(sx + (hsh(i * 3 + j * 5 + n) - 0.5) * 12, y1 - 2 - L * n / 3);
      g.stroke();
    }
  }
  g.restore();
}

// the 3D ice block's front (2026-10-24): the same block laid over him see-through, so he shows through clear glossy ice
// (its back is drawn before him: moveBehind); in its last moments cracks run up it, each a dark groove with a light lip
function iceCube3(g, k, t, i, active = 0.6) {
  const u = ease(k / 0.08);
  drawProp3D(g, 'icecube', { yaw: 0.55, scale: 1.1, clip: u, alpha: 0.46 });
  const cr = clamp((k - (active - 0.2)) / 0.2, 0, 1);
  if (cr > 0) {
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [dx, dy, c, w] of [[0.7, 1, `rgba(255,255,255,${(0.8 * cr).toFixed(3)})`, 1.5], [0, 0, `rgba(40,90,140,${(0.55 * cr).toFixed(3)})`, 1.6]]) {
      g.strokeStyle = c; g.lineWidth = w;
      for (let j = 0; j < 3; j++) { const sx = -15 + j * 13, L = 52 * cr; g.beginPath(); g.moveTo(sx + dx, -2 + dy); for (let n = 1; n <= 3; n++) g.lineTo(sx + (hsh(i * 3 + j * 5 + n) - 0.5) * 12 + dx, -2 - L * n / 3 + dy); g.stroke(); }
    }
    g.restore();
  }
}

// ---------------------------------------------------------------- the particle kinds
export function moveFx(g, F, v, p, k, dt) {
  switch (p.k) {
    case 'snow': {   // a little ball of snow: up, and down onto the floor
      p.vz -= 700 * dt; p.z = Math.max(0, p.z + p.vz * dt);
      const r = p.s * (1 - k * 0.3);
      g.fillStyle = `rgba(150,190,225,${(0.6 * (1 - k * k)).toFixed(3)})`; circle(g, p.x + 0.6, p.y - p.z + 0.8, r); g.fill();
      g.fillStyle = `rgba(255,255,255,${(1 - k * k).toFixed(3)})`; circle(g, p.x, p.y - p.z, r); g.fill();
      return true;
    }
    case 'shard': {   // a shard of ice (or of a statue) tumbling off
      p.vy += 520 * dt;
      g.save(); g.translate(p.x, p.y); g.rotate(p.a + p.t * p.sp); g.globalAlpha *= 1 - k * k;
      g.fillStyle = p.col || '#e6f6ff'; g.beginPath(); g.moveTo(0, -p.s * 1.4); g.lineTo(p.s * 0.8, 0); g.lineTo(0, p.s * 1.1); g.lineTo(-p.s * 0.7, 0); g.closePath(); g.fill();
      g.fillStyle = 'rgba(120,170,220,0.5)'; g.beginPath(); g.moveTo(0, -p.s * 1.4); g.lineTo(p.s * 0.8, 0); g.lineTo(0, 0); g.closePath(); g.fill();
      g.restore(); return true;
    }
    case 'drop': {   // a drop of coffee flung up, falling back, a dot on the floor where it lands
      p.vz -= 800 * dt; p.z = Math.max(0, p.z + p.vz * dt);
      g.fillStyle = `rgba(110,64,30,${(0.9 * (1 - k * k)).toFixed(3)})`; g.beginPath(); g.ellipse(p.x, p.y - p.z, p.s, p.s * (p.z > 0 ? 1.25 : 0.5), 0, 0, TAU); g.fill();
      if (p.z > 0) { g.fillStyle = 'rgba(255,236,210,0.6)'; circle(g, p.x - p.s * 0.35, p.y - p.z - p.s * 0.4, p.s * 0.35); g.fill(); }
      return true;
    }
    case 'steam': {   // a soft puff of steam rising and swelling
      const r = p.s * (0.6 + k * 1.2), a = 0.55 * (1 - k) * clamp(k / 0.12, 0, 1);
      g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`; circle(g, p.x, p.y, r); g.fill(); circle(g, p.x + r * 0.7, p.y + r * 0.2, r * 0.7); g.fill();
      return true;
    }
    case 'zoom': {   // the leap: streaks rushing up off the spot
      const a = 1 - k;
      g.save(); g.lineCap = 'round';
      for (let j = 0; j < 4; j++) { const x = p.x + (j - 1.5) * 9, y0 = p.y - 10 - k * 90 - (j % 2) * 14, y1 = y0 + 40 * (1 - k * 0.5); g.strokeStyle = `rgba(255,255,255,${(0.45 * a).toFixed(3)})`; g.lineWidth = j % 2 ? 2 : 3; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); }
      g.restore(); return true;
    }
    case 'swirl': {   // Duke's warp: three arcs (Java orange, blue, white) closing in on the spot (dir -1: opening out)
      const q = p.dir > 0 ? k : 1 - k, R = 8 + 26 * (1 - q), a = (1 - Math.abs(k - 0.4) * 1.4) * 0.6;
      g.save(); g.lineCap = 'round';
      for (let j = 0; j < 3; j++) { const a0 = j * TAU / 3 + k * 10 * (p.dir || 1); g.strokeStyle = [JAVA_O, '#8fb8d8', '#ffffff'][j]; g.globalAlpha = clamp(a, 0, 1); g.lineWidth = 2.6 * (1 - k * 0.5); g.beginPath(); g.ellipse(p.x, p.y - 26, R, R * 0.75, 0, a0, a0 + 2.2); g.stroke(); }
      g.restore(); return true;
    }
    case 'popring': {   // a ring popping out along the floor
      const r = 6 + p.s * Math.sqrt(k), a = 1 - k;
      softDisc(g, p.x, p.y, r + 4, [[0, '255,255,255', 0], [0.75, '235,246,255', 0.4 * a], [1, '235,246,255', 0]], Math.max(0, r - 8));
      return true;
    }
    case 'clinkfx': {   // a hit clinking off: a small white four-point spark that pops and shrinks
      const s = p.s * (k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75 * 0.8);
      g.save(); starPath(g, p.x, p.y, s * 1.6, s * 0.22, 4, p.a); g.fillStyle = '#ffffff'; g.fill(); starPath(g, p.x, p.y, s * 0.7, s * 0.2, 4, p.a + Math.PI / 4); g.fillStyle = '#bfe8ff'; g.fill(); g.restore();
      return true;
    }
    case 'bit': case 'bitin': {   // a recycled bit of Duke: a little tumbling square (bitin: flying in to where he comes back)
      let x = p.x, y = p.y;
      if (p.k === 'bitin') { const q = 1 - ease(k); x += p.ox * q; y += p.oy * q; } else p.vy += 200 * dt;
      g.save(); g.translate(x, y); g.rotate(p.a + p.t * 14); g.globalAlpha *= p.k === 'bitin' ? clamp(k * 3, 0, 1) : 1 - k * k;
      g.fillStyle = p.col; g.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); g.restore();
      return true;
    }
    case 'gcstreak': {   // the blink between: a streak from where he was to where he is, tapering and fading
      const a = 1 - k, dx = p.x2 - p.x, dy = p.y2 - p.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, y0 = p.y - 24, y1 = p.y2 - 24, h = clamp(k * 3, 0, 1);
      g.save(); g.globalAlpha *= a;
      g.fillStyle = 'rgba(248,152,32,0.32)'; g.beginPath(); g.moveTo(p.x + nx * 2, y0 + ny * 2); g.lineTo(p.x + dx * h + nx * 9, y0 + dy * h + ny * 9); g.lineTo(p.x + dx * h - nx * 9, y0 + dy * h - ny * 9); g.lineTo(p.x - nx * 2, y0 - ny * 2); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(p.x + dx * k * 0.6, y0 + dy * k * 0.6); g.lineTo(p.x + dx * h, y0 + (y1 - y0) * h); g.stroke();
      g.restore(); return true;
    }
    case 'flash': {
      if (!p.grey) return false;
      const r = p.s * (0.7 + 0.5 * k); g.fillStyle = `rgba(225,228,238,${(0.5 * (1 - k)).toFixed(3)})`; circle(g, p.x, p.y, r); g.fill();
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- the six moves' icons (the keys, the feed)
export function moveIcon(g, kind, r, col) {
  const W = col || '#ffffff';
  g.fillStyle = W; g.strokeStyle = W; g.lineCap = 'round'; g.lineJoin = 'round';
  switch (kind) {
    case 'toboggan':   // a penguin on its belly shooting along, speed lines behind
      g.beginPath(); g.ellipse(r * 0.18, r * 0.12, r * 0.5, r * 0.27, -0.08, 0, TAU); g.fill();
      g.beginPath(); g.arc(r * 0.62, -r * 0.08, r * 0.2, 0, TAU); g.fill();
      g.lineWidth = r * 0.13; for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(-r * 0.9, r * 0.12 + k * r * 0.24); g.lineTo(-r * 0.48, r * 0.12 + k * r * 0.24); g.stroke(); }
      return true;
    case 'iceberg':   // a heavy shape falling onto its shadow
      g.globalAlpha *= 0.55; g.beginPath(); g.ellipse(0, r * 0.62, r * 0.7, r * 0.22, 0, 0, TAU); g.fill(); g.globalAlpha /= 0.55;
      g.beginPath(); g.moveTo(-r * 0.5, -r * 0.1); g.lineTo(-r * 0.2, -r * 0.8); g.lineTo(r * 0.25, -r * 0.65); g.lineTo(r * 0.5, -r * 0.1); g.lineTo(r * 0.1, r * 0.25); g.closePath(); g.fill();
      return true;
    case 'fork':   // a fork(): one dot branching into three
      g.lineWidth = r * 0.13; g.beginPath(); g.moveTo(0, -r * 0.45); g.lineTo(0, 0); g.moveTo(0, 0); g.lineTo(-r * 0.55, r * 0.4); g.moveTo(0, 0); g.lineTo(0, r * 0.4); g.moveTo(0, 0); g.lineTo(r * 0.55, r * 0.4); g.stroke();
      circle(g, 0, -r * 0.55, r * 0.24); g.fill();
      for (const x of [-0.6, 0, 0.6]) { circle(g, x * r, r * 0.55, r * 0.19); g.fill(); }
      return true;
    case 'portal':   // a portal on the floor with an arrow popping out of it
      g.lineWidth = r * 0.14; g.beginPath(); g.ellipse(0, r * 0.45, r * 0.75, r * 0.3, 0, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(0, r * 0.35); g.lineTo(0, -r * 0.45); g.stroke();
      g.beginPath(); g.moveTo(0, -r * 0.85); g.lineTo(-r * 0.35, -r * 0.35); g.lineTo(r * 0.35, -r * 0.35); g.closePath(); g.fill();
      return true;
    case 'stopworld':   // a clock face
      g.lineWidth = r * 0.14; circle(g, 0, 0, r * 0.7); g.stroke();
      g.lineWidth = r * 0.13; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -r * 0.45); g.moveTo(0, 0); g.lineTo(r * 0.32, r * 0.12); g.stroke();
      for (let k = 0; k < 4; k++) { const a = k * TAU / 4; circle(g, Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52, r * 0.06); g.fill(); }
      return true;
    case 'iceblock':   // a cube of ice with a shine
      g.globalAlpha *= 0.85; g.beginPath(); g.roundRect(-r * 0.62, -r * 0.42, r * 1.1, r * 1.05, r * 0.16); g.fill(); g.globalAlpha /= 0.85;
      g.beginPath(); g.moveTo(-r * 0.52, -r * 0.42); g.lineTo(-r * 0.32, -r * 0.72); g.lineTo(r * 0.72, -r * 0.72); g.lineTo(r * 0.72, r * 0.32); g.lineTo(r * 0.48, r * 0.63); g.lineTo(r * 0.48, -r * 0.42); g.closePath(); g.globalAlpha *= 0.55; g.fill(); g.globalAlpha /= 0.55;
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-r * 0.42, -r * 0.26, r * 0.14, r * 0.58);
      return true;
    case 'gc':   // a blink: a ring of little squares (bits) with an arrow out of it
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.fillRect(-r * 0.25 + Math.cos(a) * r * 0.42 - r * 0.1, Math.sin(a) * r * 0.42 - r * 0.1, r * 0.2, r * 0.2); }
      g.lineWidth = r * 0.14; g.beginPath(); g.moveTo(r * 0.05, 0); g.lineTo(r * 0.75, 0); g.stroke();
      g.beginPath(); g.moveTo(r * 0.95, 0); g.lineTo(r * 0.6, -r * 0.28); g.lineTo(r * 0.6, r * 0.28); g.closePath(); g.fill();
      return true;
    case 'geyser':   // a column shooting up off a mark, drops off its top
      g.globalAlpha *= 0.6; g.beginPath(); g.ellipse(0, r * 0.62, r * 0.7, r * 0.22, 0, 0, TAU); g.fill(); g.globalAlpha /= 0.6;
      g.beginPath(); g.moveTo(-r * 0.28, r * 0.6); g.lineTo(-r * 0.16, -r * 0.45); g.lineTo(r * 0.16, -r * 0.45); g.lineTo(r * 0.28, r * 0.6); g.closePath(); g.fill();
      circle(g, 0, -r * 0.55, r * 0.26); g.fill(); circle(g, -r * 0.5, -r * 0.62, r * 0.11); g.fill(); circle(g, r * 0.52, -r * 0.7, r * 0.11); g.fill();
      return true;
  }
  return false;
}
