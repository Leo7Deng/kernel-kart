// Kernel Kart: Fight mode's move cards on the setup screen (fight-ui.js): for a fighter, each move with its name, its key
// and pad button, a one-line description (Tux and Duke's: what it does, its tell and its answer), and a small looping clip
// of it. The clips are the real sim (js/fight.js) with a
// fixed seed and a scripted input timeline for the demonstrator (fighter 0) and the target (fighter 1: standing, blocking
// or attacking, as fits the move), restarted every couple of seconds and drawn by draw-fight.js into the card's canvas
// with a fixed close camera and no HUD, so a clip always shows the move as it really is. Only the clips on screen run
// (an IntersectionObserver), at about 30 fps, and they all stop when the screen goes.
import { FIGHTERS } from './fight-chars.js';
import { drawFight, fightEvents } from './draw-fight.js';
import { fresh, inputAt, script } from './fight-clips.js';
import { LAYOUTS, PAD, keyLabel } from './fight-keys.js';

export const MOVE_ORDER = ['light', 'heavy', 'charge', 'special', 'super', 'guard', 'step', 'lunge'];
// a three-move fighter's (Tux and Duke since 2026-10-23): its three moves and its evade, on the light, heavy, special
// and guard keys; their names, blurbs, tells and answers are fight-chars.js's
export const MOVES4 = ['move1', 'move2', 'move3', 'evade'];
const KEY4 = { move1: 'light', move2: 'heavy', move3: 'special', evade: 'guard' };
const is3 = id => !!(FIGHTERS[id] && FIGHTERS[id].kit3);
export const moveOrder = id => is3(id) ? MOVES4 : MOVE_ORDER;
const mv4 = (id, k) => is3(id) && MOVES4.includes(k) ? FIGHTERS[id].moves[k] || null : null;
export const moveTell = (id, k) => (mv4(id, k) || {}).tell || '';
export const moveAnswer = (id, k) => (mv4(id, k) || {}).answer || '';
// what holding the key does, for a three-move move
export const moveHold = (id, k) => { const m = mv4(id, k); return !m ? '' : m.hold === 'aim' ? 'hold to aim' : m.hold === 'steer' ? 'hold to steer' : k === 'evade' ? (m.charges ? `tap · ${m.charges} charges` : 'tap') : 'tap'; };
const KIND = { light: 'Light', heavy: 'Heavy', charge: 'Heavy, held', special: 'Special', super: 'Super', guard: 'Guard', step: 'Guard + direction', lunge: 'Light during a step' };
// what every fighter shares: blocking, stepping, step attacks, the charge
const SHARED = {
  charge: 'Hold it and let go: more damage and knockback, and from half charged it shrugs off light hits. Held 0.8 s it fires by itself, fully charged: that knocks them down.',
  guard: 'Hold to block: your shield covers your front, so keep turned to them. A blocked hit only chips you, but costs stamina, and out of stamina it staggers you. A hit from the side or behind gets round it.',
  step: 'Guard with a direction held: a quick step that way. Step out of reach of a swing, or round a blocker to hit their side or back. Costs stamina.',
  lunge: 'Light during a step toward them is a lunging jab with more reach; heavy is a running heavy. Good for closing in on a blocker\'s side.',
};
// the one-line descriptions (names from fight-chars.js where it has them)
const DESC = {
  tux: {
    light: 'Tap for quick flipper slaps; the third in a row is a finisher that knocks them back.',
    heavy: 'Hop forward and land with a shockwave that pushes everyone near away.',
    special: 'A fast belly slide in a straight line that rams whoever is in the way and knocks them down. A wall stops it.',
    super: 'With a full meter: three little Tux clones waddle at them and pop.',
  },
  duke: {
    light: 'Very fast jabs; the third in a row is a finisher. Each hit warms him up.',
    heavy: 'The nose glows, then a long lunge, nose first. Good reach.',
    special: 'Lob a hot coffee: it stings, and the puddle it leaves is slippery for 4 s.',
    super: 'With a full meter: they freeze for 1.5 s, greyed out. Hit them all you like.',
  },
  gopher: {
    light: 'Quick paw swipes with a fair reach; the third in a row is a finisher.',
    heavy: 'A two-pawed slam with a short hop forward.',
    special: 'He digs in and tunnels at them (nothing can touch him underground), then pops up under them and knocks them down. Blockable as he comes up, or step off his mound.',
    super: 'With a full meter: a swarm of six little gophers runs at them, each one hitting once.',
  },
  ferris: {
    light: 'Short, sharp pinches; his claws don\'t reach far. The third in a row is a finisher.',
    heavy: 'Both claws hammered down in front: big damage, little reach.',
    special: 'A counter stance for half a second: any hit on him is caught whole, and if they\'re close he pinches back hard. Step round it or wait it out.',
    super: 'With a full meter: takes their super meter for himself, locks their special for 5 s, and dizzies them if they\'re near.',
  },
  pyth: {
    light: 'Whips of his long tail: the longest jabs in the game, but light ones.',
    heavy: 'A long lunge, head first, from well outside their reach.',
    special: 'He strikes out and coils round them from across the arena, squeezes, then tosses them down. Can\'t be blocked: step out of its way. Slow to recover if it misses.',
    super: 'With a full meter: lifts them off the floor for nearly 2 s. They float helpless: hit them all you like.',
  },
  octo: {
    light: 'Five quick little slaps in a row, one arm after another; the fifth is a finisher.',
    heavy: 'A big double-armed slam with a short lunge.',
    special: 'A tentacle shoots out a long way and yanks them in, right in front of him and open for a moment: follow up. Blockable.',
    super: 'With a full meter: he spins all eight arms for a second, hitting everything round him again and again; the last spin knocks them down.',
  },
  docky: {
    light: 'Slow, light fin slaps; the third in a row is a finisher.',
    heavy: 'A spout of water from his blowhole right in front that knocks them back.',
    special: 'Drops a shipping container in front of him: it hits whoever is under it, then stands there for 5 s like a wall. Hit it and it slides off into them and knocks them down. Two at a time.',
    super: 'With a full meter: five containers rain down round them, one after another. Watch their shadows.',
  },
  swifty: {
    light: 'The fastest jabs in the game, but light; the third in a row is a finisher.',
    heavy: 'A long flying kick.',
    special: 'A fast diving dash right across the arena that rams whoever is in the way. A wall stops it.',
    super: 'With a full meter: three homing dives in a row, the last one knocking them down.',
  },
  cpp: {
    light: 'Hard little bites: the hardest jabs in the game. The third in a row is a finisher.',
    heavy: 'A lunging smash that hits harder than anyone\'s.',
    special: 'He blinks a short way, the way you hold (or at them): past them if they\'re in the way. No damage: get in, get out, get behind them.',
    super: 'With a full meter: undefined behavior. One of four things: they crash (dizzy), a blast round him that knocks them down, he swaps places with them and it hurts them, or both get hurt (them more).',
  },
  droid: {
    light: 'Slow but solid robot jabs; the third in a row is a finisher.',
    heavy: 'A big, slow punch with a good lunge.',
    special: 'A short electric beam from his antennae: stuns them for a moment, long enough for a heavy. Two charges that recharge by themselves.',
    super: 'With a full meter: an electric field under them for 4 s. Stand in it and you\'re stunned: get out.',
  },
};
const NAME = (id, k) => {
  const M = FIGHTERS[id].moves || {}, n = m => (m && m.name) || '';
  if (mv4(id, k)) return n(M[k]);
  if (k === 'light') return n(M.light1 || M.light);
  if (k === 'heavy' || k === 'charge') return n(M.heavy);
  if (k === 'guard') return 'Front shield';
  if (k === 'step') return 'Step';
  if (k === 'lunge') return 'Lunge';
  return n(M[k]);
};
export const moveName = NAME;
export const moveDesc = (id, k) => mv4(id, k) ? mv4(id, k).blurb || '' : (DESC[id] || DESC.tux)[k] || SHARED[k] || '';
export const moveKind = k => KIND[k] || (k === 'evade' ? 'Evade' : MOVES4.includes(k) ? 'Move ' + k.slice(4) : '');
// the keys for a move in a layout ('solo', 'p1', 'p2'), as keycap labels ('+' between two held together), and the pad button
export function moveKeys(L, k) {
  const K = LAYOUTS[L].keys, c = a => keyLabel(K[a][0]), dirs = ['up', 'left', 'down', 'right'].map(c).join('');
  if (KEY4[k]) return [c(KEY4[k])];
  return { light: [c('light')], heavy: [c('heavy')], charge: ['hold', c('heavy')], special: [c('special')], super: [c('special')], guard: [c('guard')], step: [c('guard'), '+', dirs], lunge: [c('light')] }[k];
}
export function movePad(k) { if (KEY4[k]) return PAD[KEY4[k]]; return { light: PAD.light, heavy: PAD.heavy, charge: PAD.heavy, special: PAD.special, super: PAD.special, guard: PAD.guard, step: PAD.guard, lunge: PAD.light }[k]; }

// a clip on a canvas: step(dt) runs and draws it
export function makeClip(cv, id, k) {
  const sc = script(id, k); if (!sc) return null;
  const c = { cv, id, k, sc, F: null, t: 0 };
  fresh(c);
  c.step = dt => {
    if (c.t >= sc.len) fresh(c);
    if (dt > 0) {
      const F = c.F;
      F.setInput(0, inputAt(sc.a, c.t)); F.setInput(1, inputAt(sc.b, c.t));
      F.update(dt); fightEvents(F); c.t += dt;   // (the events' effects too: the move cards show the moves' particles and props)
      if (F.phase !== 'fight' && F.phase !== 'sudden') c.t = sc.len;   // (someone fell or went down: start again)
    }
    const D = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * D) || cv.height !== Math.round(h * D)) { cv.width = Math.round(w * D); cv.height = Math.round(h * D); }
    const z = w / sc.cam.w;
    drawFight(c.F, dt, { g: cv.getContext('2d'), w, h, dpr: D, hud: false, cam: { x: sc.cam.x, y: (sc.cam.y || 0) - 16, z } });
  };
  return c;
}

// ---------------------------------------------------------------- running the clips on screen
const clips = new Set(), seen = new WeakSet();
let raf = 0, last = 0, io = null;
export function runClips(list) {
  for (const c of list) clips.add(c);
  if (typeof IntersectionObserver !== 'undefined') {
    if (!io) io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); }, { threshold: 0.05 });
    for (const c of list) io.observe(c.cv);
  }
  for (const c of list) c.step(0);   // (a still frame straight away)
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
}
export function stopClips() { for (const c of clips) if (io) io.unobserve(c.cv); clips.clear(); if (raf) cancelAnimationFrame(raf); raf = 0; }
function tick(now) {
  raf = 0;
  for (const c of [...clips]) if (!c.cv.isConnected) { clips.delete(c); if (io) io.unobserve(c.cv); }
  if (!clips.size) return;
  const dt = (now - last) / 1000;
  if (dt >= 1 / 31) {   // (about 30 fps)
    last = now;
    for (const c of clips) if (!io || seen.has(c.cv)) c.step(Math.min(0.05, dt));
  }
  raf = requestAnimationFrame(tick);
}
