// Kernel Kart: Fight mode's body language between moves (draw-fight.js fighter() draws it; all cosmetic, from the
// fight's plain state and the drawer's own clock, so an online screen plays it from snapshots too):
//   knocked down  popped up and back off the hit, stretched, tipping over; a squash on landing, one bounce, dust; lying
//                 in the body's own way (LIE)
//   getting up    lying -> crouched (a squash) -> sprung up (a stretch) -> a settle once on their feet
//   KO'd          the body eased clear of the winner (drawing only: the sim's place stays)
//   idle, walk    breathing, a small tic of their own now and then; a bob in step and a lean into it
import { TAU, clamp } from './core.js';
import { ARENAS, arenaBox } from './fight-arenas.js';
import * as M3 from './art/model3d.js';
import { settings } from './settings.js';

const smooth = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
const DOWN = new Set(['down', 'ko']);
export const AIR = 0.2;   // a knockdown's flight (s) before the body lands

// how each one lies: pose (a lying mesh pose: lies along +x), head (+1: the head at +x), flip (no lying pose: tipped
// right over onto its back, legs kicking), flat (lies down where it is, no tipping), tip (the pose tipped over), crouch
// (the pose getting up)
const LIE = {
  tux: { pose: 'flop', head: 1, crouch: 'crouch' },
  cpp: { pose: 'dead', head: -1, crouch: 'pant' },
  pyth: { flat: 'sprawl', crouch: 'coil' },          // (uncoils flat where he is)
  ferris: { flip: 1, tip: 'hurt', crouch: 'shell' },  // (over onto his back, legs kicking)
  gopher: { tip: 'pop', crouch: 'pant' },            // (sprawled, arms out)
  docky: { tip: 'hurt', crouch: 'coil' },            // (rolled onto his side)
  duke: { tip: 'hurt', crouch: 'guard' },
  octo: { tip: 'droop', crouch: 'coil' },
  swifty: { tip: 'tumble', crouch: 'perch' },
  droid: { tip: 'reboot', crouch: 'crouch' },
};
const has = (id, p) => !!p && M3.poses3D(id).includes(p);
export function lieOf(id) {
  const L = LIE[id] || {};
  return { pose: has(id, L.pose) ? L.pose : null, head: L.head || 1, flip: !!L.flip, flat: has(id, L.flat) ? L.flat : null, tip: has(id, L.tip) ? L.tip : 'hurt', crouch: has(id, L.crouch) ? L.crouch : 'wind' };
}

// the drawer's memory per fighter: the state before this one, the KO'd body's shift, the winner's turn and step
export function bodyOf(v, f) {
  const B = v.body || (v.body = [null, null]);
  let b = B[f.i];
  if (!b) b = B[f.i] = { st: f.state, prev: '', lt: v.t, dt: 0, kx: 0, cy: null, wx: 0, winAt: -1 };
  b.dt = clamp(v.t - b.lt, 0, 0.1); b.lt = v.t;   // (0 when it's drawn twice a frame: Stop the World)
  if (b.st !== f.state) { b.prev = b.st; b.st = f.state; }
  return b;
}

// knocked down: { lie (0..1 tipped over), hop (up), sq (+ squashed flat, - stretched), back (shifted the way it fell) };
// getting up: lie back to 0 through a crouch and a spring; just up: a settle
export function bodyFall(F, v, f, b) {
  const st = f.state, fall = v.fall[f.i], few = settings.reduced, o = { lie: 0, hop: 0, sq: 0, back: 0 };
  if (DOWN.has(st)) {
    const u = f.t || 0;
    if (u < AIR) { const q = u / AIR; o.lie = smooth(q * 1.1); o.hop = (few ? 9 : 15) * Math.sin(Math.PI * q); o.sq = -0.08 * Math.sin(Math.PI * q); o.back = fall * 10 * smooth(q); }
    else { const k = u - AIR; o.lie = 1; o.back = fall * 10; o.sq = 0.17 * Math.exp(-k * 14) * Math.cos(k * 22); o.hop = k < 0.17 ? (few ? 2 : 4.5) * Math.sin(Math.PI * k / 0.17) : 0; }
    // KO'd: eased clear of the winner (lying across them read badly), never further than the arena
    if (st === 'ko') {
      const w = F.f[1 - f.i], B = arenaBox(F.A || ARENAS.ring);
      let tgt = 0;
      if (w && Math.abs(w.y - f.y) < 40) tgt = Math.max(0, 70 - (f.x + o.back - w.x) * fall) * fall;
      tgt = clamp(f.x + o.back + tgt, B.x0 + 34, B.x1 - 34) - f.x - o.back;
      if (Math.abs(tgt) > Math.abs(b.kx)) b.kx += (tgt - b.kx) * (1 - Math.exp(-6 * b.dt));
    }
  } else if (st === 'getup' && !f.roll) {
    const q = clamp((f.t || 0) / (f.dur || 0.15), 0, 1);
    o.lie = 1 - smooth(q / 0.45); o.back = fall * 10 * (1 - smooth(q));
    o.sq = q < 0.45 ? 0.15 * smooth(q / 0.3) : 0.15 - 0.26 * smooth((q - 0.45) / 0.55);
    o.hop = q < 0.45 ? 0 : (few ? 4 : 8) * Math.sin(Math.PI * (q - 0.45) / 0.55);
  } else if (b.prev === 'getup' && (st === 'idle' || st === 'walk') && f.t < 0.35 && !f.roll) {
    const k = f.t; o.sq = -0.11 * Math.exp(-k * 11) * Math.cos(k * 26);   // (the stretch out of the spring settling)
  }
  if (st !== 'ko') b.kx = 0;
  return o;
}
// the pose while down or getting up (null: as usual): lying, tipping over, crouched; Ferris on his back kicks his legs
export function fallPose(f, v, L, lie) {
  if (DOWN.has(f.state)) {
    if (L.flip && lie > 0.5) return M3.walkPose ? M3.walkPose(v.t * (f.state === 'ko' ? 1.6 : 3.2)) : 'hurt';
    return (L.pose || L.flat) && lie > 0.5 ? L.pose || L.flat : L.tip;
  }
  if (f.state === 'getup' && !f.roll) return lie > 0.55 ? L.pose || L.flat || L.tip : L.crouch;
  return null;
}

// idle and walking: { sq, lean, hop, wx, yaw (added), pose (null: as usual), glow (0..1: Duke's nose) }
const TIC = 4.2;   // (s between idle tics, each its own phase)
export function bodyIdle(f, v, walking, phase, sp, walk) {
  const o = { sq: 0, lean: 0, hop: 0, wx: 0, yaw: 0, pose: null, glow: 0 }, t = v.t + f.i * 1.7, id = f.id;
  if (walking) {
    o.hop = 1.6 * Math.abs(Math.sin(phase * TAU));   // (up passing, down on each step)
    o.lean = clamp((f.vx || 0) / (150 * walk), -1, 1) * 0.07;
    o.sq = -0.012 * Math.cos(phase * TAU * 2);
    if (id === 'pyth') { o.wx = Math.sin(phase * TAU) * 2.2; o.lean += Math.sin(phase * TAU + 1) * 0.06; o.sq += 0.02 * Math.sin(phase * TAU * 2); }   // (an S-wave through his coil)
    return o;
  }
  o.sq = 0.014 * Math.sin(t * TAU * 0.5);   // breathing
  const k = t % TIC - (TIC - 1.1);   // (the tic: the last 1.1 s of each cycle)
  if (k <= 0) return o;
  const q = k / 1.1, bell = Math.sin(Math.PI * q);
  switch (id) {
    case 'pyth': o.lean = Math.sin(q * TAU * 2) * 0.07 * bell; o.wx = Math.sin(q * TAU * 2) * 1.5 * bell; if (q > 0.3 && q < 0.6) o.pose = 'cast'; break;   // head sway, a tongue flick
    case 'octo': o.sq = 0.04 * Math.sin(q * TAU * 2) * bell; o.hop = 2 * bell; if (q > 0.2 && q < 0.8) o.pose = 'coil'; break;   // tentacles curling up, a little float
    case 'duke': o.yaw = 0.35 * Math.sin(q * TAU) * bell; o.glow = bell; break;   // a look round, his nose glowing (glow: draw-fight.js)
    case 'gopher': o.hop = q < 0.5 ? 3 * Math.sin(q / 0.5 * Math.PI) : 0; o.sq = q > 0.45 && q < 0.65 ? 0.05 * Math.sin((q - 0.45) / 0.2 * Math.PI) : 0; if (q > 0.55) o.pose = 'whistle'; break;   // a sniff and a hop
    case 'ferris': if (q > 0.2 && q < 0.4 || q > 0.55 && q < 0.75) o.pose = 'pinch'; break;   // claws snapping twice
    case 'tux': o.lean = 0.05 * Math.sin(q * TAU * 2) * bell; if (q > 0.25 && q < 0.75) o.pose = 'armup'; break;   // a flipper flap
    case 'docky': o.sq = -0.03 * bell; if (q > 0.3 && q < 0.7) o.pose = 'spout'; break;   // a puff from his spout
    case 'swifty': if (q > 0.2 && q < 0.7) o.pose = 'flap'; o.hop = 2.5 * bell; break;   // wings stretched
    case 'cpp': o.yaw = 0.3 * Math.sin(q * TAU * 1.5) * bell; if (q > 0.3 && q < 0.6) o.pose = 'gnaw'; break;   // a nibble
    case 'droid': if (q > 0.25 && q < 0.75) o.pose = 'antenna'; o.sq = 0.02 * Math.sin(q * TAU * 3) * bell; break;   // antennas twitching
  }
  if (o.pose && !M3.poses3D(id).includes(o.pose)) o.pose = null;
  return o;
}
