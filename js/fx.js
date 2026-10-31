// Kernel Kart: visual effects: spawners the race calls on events, the ambient effects render adds each frame, the
// particle update, and drawing particles and karts' status effects. Cosmetic only: frnd/fchance, never race/car rng.
//
// A particle is a plain object { kind, x, y, vx, vy, life, maxLife, ... }. Kinds:
//   dot (default) · puff (soft dust/smoke that grows) · smoke (bigger, slower, greyer) · star (spinning sparkle)
//   ring (expanding outline) · ringIn (a ring closing in) · spark (a streak) · confetti (falls and flutters)
//   wheel / debris (tumbles off with a height) · hash (a spinning #, sudo) · beam (a column of light)
//   flash (a bright pop) · shard (a tumbling fragment) · fire (cools to smoke) · drop (arcs up and splats)
//   bolt (flickering lightning) · strike (a lightning bolt from the sky) · coin (a gold coin flipping up and bouncing)
//   chev (a glowing ⏩ double chevron pointing along rot: Fast-Forward)
// `top: true` draws it above the karts; everything else is drawn on the ground under them.
import { TAU, clamp, frnd, fchance, rnd } from './core.js';
import { ICONS } from './art/icons.js';
import { ITEMS } from './items/index.js';
import { sfx } from './audio.js';
import { GROW_T } from './items/grow.js';
import { FF_T } from './items/ff.js';
import { clearingsOf } from './art/props.js';
import { settings } from './settings.js';
import { DRIFT, DRIFT_PIVOT, driftPt, driftTier, tierCol } from './race-drift.js';
import { beamSprite, bubbleSprite, bubbleSpriteBold, glowSprite, puffSprite, shieldSprite, shieldSpriteBold, stamp } from './fx-sprites.js';
import { BK, bold, boldCol } from './look.js';
import { inView } from './view.js';
import { drawIconBold } from './art/icons.js';

const GOLD = '#ffc93c', RIDE = -16;   // RIDE: the middle of a kart and its rider (mascots stand up toward -y)

// ----- spawners
// mixed into Race.prototype in race.js
// hits from the track itself that go in the feed (as the hazard's icon), when they get a player
const HAZ_FEED = { burnout: 'fire', train: 'train', stamp: 'press', lava: 'lava', wave: 'wave', gc: 'gc', fall: 'fall', splash: 'splash', boulder: 'boulder', slag: 'slag', claw: 'crab', gate: 'gate', drawbridge: 'drawbridge', crash: 'cliff', hand: 'clock', pendulum: 'pendulum', jet: 'jet', thicket: 'fire', pad: 'rocket', tree: 'tree', skifall: 'fall', skicrash: 'cliff' };
const FIRE = ['#fff3b0', '#ffd166', '#ff9f43', '#ff6b3d'];
export const fxSpawners = {
  // a sound from car (or point) `at`: full from a player's own kart, fading with distance from the nearest player,
  // silent well off screen; with no players (a demo) heard from the leader
  sound(name, at, vol = 1) {
    let k = 1;
    if (!at || !this.feels(at)) {
      const local = this.localHumans || this.humans, ears = local.length ? local : this.cars.filter(c => c.rank === 1);
      let d = 1e9; for (const h of ears) d = Math.min(d, Math.hypot(h.x - at.x, h.y - at.y));
      k = 0.75 * clamp(1 - d / 1300, 0, 1) ** 1.5;
    }
    sfx.play(name, vol * k);
  },
  // is car c a player at this screen? (online only race.localHumans; others are felt on their own screens)
  feels(c) { return (this.localHumans || this.humans).includes(c); },
  // a shake and a screen-wide flash for a player hit or powered up (online, net-sync.js passes them to that player)
  jolt(c, k) { if (this.feels(c)) this.shake = Math.max(this.shake || 0, k); },
  flashFor(c, f) { if (this.feels(c)) this.flash = f; },
  // for every screen: a sound from nowhere in particular (the train's horn) and a shake (Kernel Panic, Fast-Forward
  // launch); online the host passes both on (net-sync.js)
  cue(name) { sfx.play(name); },
  shakeAll(k) { this.shake = Math.max(this.shake || 0, k); },
  fxRing(x, y, col, r1 = 60, life = 0.4, w = 5) { this.particles.push({ kind: 'ring', x, y, vx: 0, vy: 0, col, r1, w, life, maxLife: life, top: true }); },
  // a ring that closes in instead of spreading out (Ctrl+Z, tow beams)
  fxRingIn(x, y, col, r1 = 60, life = 0.4, w = 5) { this.particles.push({ kind: 'ringIn', x, y, vx: 0, vy: 0, col, r1, w, life, maxLife: life, top: true }); },
  fxFlash(x, y, col = '#ffffff', r = 40, life = 0.15) { this.particles.push({ kind: 'flash', x, y, vx: 0, vy: 0, col, size: r, life, maxLife: life, top: true }); },
  fxStars(x, y, n, col, spd = 120, life = 0.6) {
    for (let i = 0; i < n; i++) { const a = frnd(0, TAU), v = frnd(0.4, 1) * spd; this.particles.push({ kind: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, col, size: frnd(5, 9), rot: frnd(0, TAU), spin: frnd(-8, 8), life, maxLife: life, top: true }); }
  },
  fxSparks(x, y, n = 6, col = '#ffd166', spd = 140) {
    for (let i = 0; i < n; i++) { const a = frnd(0, TAU), v = frnd(0.5, 1.2) * spd; this.particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, col, size: frnd(2, 4), life: frnd(0.18, 0.35), maxLife: 0.35, top: true }); }
  },
  fxPuff(x, y, col, size = 10, life = 0.6, vx = 0, vy = 0) { this.particles.push({ kind: 'puff', x, y, vx, vy, col, size, life, maxLife: life }); },
  // tumbling bits (box fragments, shield glass, debris, clods). cols: one colour or a list to cycle
  fxShards(x, y, n, cols, spd = 160, size = 6, life = 0.6) {
    for (let i = 0; i < n; i++) { const a = frnd(0, TAU), v = frnd(0.4, 1) * spd; this.particles.push({ kind: 'shard', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, col: Array.isArray(cols) ? cols[i % cols.length] : cols, size: frnd(0.6, 1.2) * size, rot: frnd(0, TAU), spin: frnd(-12, 12), life: frnd(0.7, 1) * life, maxLife: life, top: true }); }
  },
  // blobs thrown up that land and splat: goo, bubble water
  fxDrops(x, y, n, col, spd = 120, size = 4) {
    for (let i = 0; i < n; i++) { const a = frnd(0, TAU), v = frnd(0.3, 1) * spd; this.particles.push({ kind: 'drop', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, z: 6, vz: frnd(120, 260), col, size: frnd(0.7, 1.3) * size, life: 1.1, maxLife: 1.1, top: true }); }
  },
  // crackling lightning bolts out from a point
  fxBolts(x, y, n, col, r = 46, life = 0.35) { for (let i = 0; i < n; i++) this.particles.push({ kind: 'bolt', x, y, vx: 0, vy: 0, col, rot: frnd(0, TAU), size: r * frnd(0.7, 1.1), life: life * frnd(0.6, 1), maxLife: life, top: true }); },
  // lightning onto (x, y): a jagged flickering streak, a flash and a scorch mark
  fxStrike(x, y, col = '#ff4d6d') {
    this.particles.push({ kind: 'strike', x, y, vx: 0, vy: 0, col, life: 0.45, maxLife: 0.45, top: true });
    this.fxFlash(x, y, '#ffffff', 50, 0.18); this.fxRing(x, y, col, 60, 0.35, 6); this.fxBolts(x, y, 5, col, 40);
    this.particles.push({ kind: 'puff', x, y, vx: 0, vy: 0, col: '#2d3047', size: 16, life: 1.2, maxLife: 1.2 });   // scorch
  },
  // a fireball cooling from white-yellow to orange to grey smoke
  fxBoom(x, y, scale = 1) {
    this.fxFlash(x, y, '#fff6d5', 55 * scale, 0.14);
    for (let i = 0; i < 9; i++) { const a = frnd(0, TAU), v = frnd(30, 120) * scale; this.particles.push({ kind: 'fire', x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: frnd(10, 18) * scale, life: frnd(0.45, 0.75), maxLife: 0.75, top: true }); }
    for (let i = 0; i < 5; i++) this.fxPuff(x + frnd(-18, 18), y + frnd(-18, 18), '#5a5f73', frnd(12, 20) * scale, frnd(0.8, 1.2), frnd(-30, 30), frnd(-30, 30));
    this.fxSparks(x, y, 14, FIRE[1], 230 * scale); this.fxShards(x, y, 6, ['#3d4052', '#53576e'], 200 * scale, 5);
  },
  // speed lines streaming back off a kart
  fxStreaks(c, n, col = '#ffffff', spd = 260) {
    const bx = -Math.cos(c.heading), by = -Math.sin(c.heading), nx = -by, ny = bx;
    for (let i = 0; i < n; i++) { const o = frnd(-22, 22), v = spd * frnd(0.7, 1.2); this.particles.push({ kind: 'spark', x: c.x + nx * o + bx * 16, y: c.y + ny * o + by * 16, vx: bx * v, vy: by * v, col, size: 2.5, life: 0.3, maxLife: 0.3, top: true }); }
  },
  // memory leak: all four wheels pop off and bounce away
  fxWheels(c) {
    const ch = Math.cos(c.heading), sh = Math.sin(c.heading);
    for (const [ax, ay] of [[0.32, 0.5], [0.32, -0.5], [-0.32, 0.5], [-0.32, -0.5]]) {
      const lx = ax * c.L, ly = ay * c.W, x = c.x + lx * ch - ly * sh, y = c.y + lx * sh + ly * ch, out = Math.sign(ay);
      const vx = Math.cos(c.heading) * c.speed * 0.5 - sh * out * frnd(110, 190), vy = Math.sin(c.heading) * c.speed * 0.5 + ch * out * frnd(110, 190);
      this.particles.push({ kind: 'wheel', x, y, vx, vy, z: 4, vz: frnd(260, 380), rot: frnd(0, TAU), spin: frnd(-14, 14), size: 9, life: 1.5, maxLife: 1.5, top: true });
    }
  },
  fxConfetti(x, y, n, spread = 60, cols = ['#ff6f91', '#ffd166', '#7bdff2', '#a0e7a0', '#cdb4db', '#ff9f68']) {
    for (let i = 0; i < n; i++) this.particles.push({ kind: 'confetti', x: x + frnd(-spread, spread), y: y + frnd(-spread, spread), vx: frnd(-160, 160), vy: frnd(-260, -60), g: 320, col: cols[i % cols.length], size: frnd(4, 7), rot: frnd(0, TAU), spin: frnd(-12, 12), life: frnd(1.2, 2), maxLife: 2, top: true });
  },
  // bits of car flying off: tumbling shards with a height, like the wheels
  fxDebris(x, y, n, vx0 = 0, vy0 = 0, cols = ['#3a3d45', '#c9ced6', '#1b1c20']) {
    for (let i = 0; i < n; i++) { const a = frnd(0, TAU), v = frnd(60, 220); this.particles.push({ kind: 'debris', x, y, vx: vx0 + Math.cos(a) * v, vy: vy0 + Math.sin(a) * v, z: 6, vz: frnd(200, 420), rot: frnd(0, TAU), spin: frnd(-20, 20), size: frnd(3, 6.5), col: cols[i % cols.length], life: frnd(0.8, 1.3), maxLife: 1.3, top: true }); }
  },
  // a few bursts of colour around a point
  fxFireworks(x, y, n = 4) {
    const cols = ['#ff6f91', '#ffd166', '#7bdff2', '#a0e7a0', '#cdb4db'];
    for (let k = 0; k < n; k++) { const px = x + frnd(-90, 90), py = y + frnd(-90, 90), col = cols[k % cols.length]; this.fxRing(px, py, col, frnd(40, 70), 0.6, 4); this.fxSparks(px, py, 12, col, 200); this.fxStars(px, py, 4, col, 90, 0.8); }
  },
  // something hit car c: flash, shockwave, a burst showing what it was, its sound, and a shake if it's a player.
  // hitType: 'duck', 'bubble', 'leak', 'panic', 'pull', 'gc', 'fall', 'sudo', 'ff', 'train', 'stamp', 'squish', 'lava',
  // 'slag', 'wave', 'splash', 'boulder', 'loop', 'gate', 'drawbridge', 'crash', 'jet', 'thicket', ... (cases below), or nothing for a mine
  fxHit(c, col, hitType = 'mine') {
    const { x, y } = c;
    this.spillBits(c);   // every hit comes through here, so every hit spills bits (race-bits.js)
    this.fxFlash(x, y + RIDE, '#ffffff', 34, 0.12); this.fxRing(x, y, col, 70, 0.45, 6);
    let shake = 0.6;
    switch (hitType) {
      case 'duck': this.fxConfetti(x, y, 12, 10, ['#ffd166', '#ffffff', '#f5b300']); this.fxStars(x, y, 6, '#ffd166', 150); break;
      case 'bubble': this.fxDrops(x, y, 14, '#e0b3ff', 160, 4); this.fxRing(x, y, '#ffffff', 50, 0.3, 3); this.fxSparks(x, y, 8, '#f3c6ff', 140); shake = 0.35; break;
      case 'leak': this.fxDrops(x, y, 12, '#8bc34a', 130, 5); for (let i = 0; i < 4; i++) this.fxPuff(x + frnd(-14, 14), y + frnd(-14, 14), '#9ccc65', frnd(10, 15), 0.7); shake = 0.4; break;
      case 'panic': this.fxStrike(x, y, '#ff4d6d'); this.fxSparks(x, y, 10, '#ff4d6d', 180); break;
      case 'pull': this.fxRingIn(x, y, col, 70, 0.4, 5); this.fxSparks(x, y, 8, col, 120); shake = 0.3; break;
      case 'gc': this.fxShards(x, y, 10, ['#78909c', '#b0bec5', '#455a64'], 200, 6); this.fxSparks(x, y, 10, '#ffd166', 170); break;
      case 'fall': for (let i = 0; i < 10; i++) this.fxPuff(x + frnd(-20, 20), y + frnd(-20, 20), '#a1887f', frnd(12, 20), 0.9, frnd(-50, 50), frnd(-50, 50)); this.fxShards(x, y, 6, '#8d6e63', 140, 5); break;
      case 'sudo': shake = 0.8; break;   // fxSudoWreck draws the rest
      case 'ff': this.fxBowled(c); break;
      case 'train': this.fxBoom(x, y, 1.4); shake = 0.9; break;
      case 'stamp': this.fxShards(x, y, 10, ['#ffb300', '#3d4052'], 200, 6); for (let i = 0; i < 6; i++) this.fxPuff(x + frnd(-20, 20), y + frnd(-20, 20), '#9e9e9e', frnd(10, 15), 0.6); shake = 0.8; break;
      case 'lava': this.fxBoom(x, y, 0.9); this.fxDrops(x, y, 12, '#ff7a1a', 150, 4); for (let i = 0; i < 4; i++) this.fxPuff(x + frnd(-16, 16), y + frnd(-16, 16), '#4e3b36', frnd(12, 18), 0.9, frnd(-30, 30), frnd(-40, 0)); shake = 0.75; break;
      case 'slag': this.fxSparks(x, y, 16, '#ffb300', 230); this.fxDrops(x, y, 12, '#ff6d00', 160, 4); for (let i = 0; i < 5; i++) this.fxPuff(x + frnd(-18, 18), y + frnd(-18, 18), '#3e2723', frnd(12, 18), 0.9, frnd(-40, 40), frnd(-50, 0)); shake = 0.7; break;
      case 'wave': this.fxDrops(x, y, 14, '#d9f6ff', 170, 4); for (let i = 0; i < 6; i++) this.fxPuff(x + frnd(-22, 22), y + frnd(-22, 22), '#ffffff', frnd(9, 14), 0.6, frnd(-80, 80), frnd(-80, 80)); shake = 0.5; break;
      case 'splash': this.fxDrops(x, y, 18, '#b3e5fc', 190, 5); this.fxRing(x, y, '#ffffff', 60, 0.5, 4); for (let i = 0; i < 6; i++) { const a = i * TAU / 6; this.fxPuff(x + Math.cos(a) * 16, y + Math.sin(a) * 16, '#e1f5fe', frnd(10, 15), 0.7, Math.cos(a) * 90, Math.sin(a) * 90); } shake = 0.6; break;
      case 'boulder': this.fxShards(x, y, 10, ['#9d9175', '#6b6150', '#c9bc98'], 190, 6); for (let i = 0; i < 8; i++) this.fxPuff(x + frnd(-24, 24), y + frnd(-24, 24), '#bcae8a', frnd(12, 18), 0.8, frnd(-60, 60), frnd(-60, 60)); this.fxStars(x, y, 5, '#ffd166', 130); shake = 0.85; break;
      case 'loop': this.fxRing(x, y, '#36f59a', 80, 0.5, 6); this.fxStars(x, y, 8, '#d9ffe9', 150); this.fxSparks(x, y, 8, '#36f59a', 140); shake = 0.3; break;
      case 'claw': for (let i = 0; i < 6; i++) this.fxPuff(x + frnd(-20, 20), y + frnd(-20, 20), '#e8d5aa', frnd(10, 15), 0.6, frnd(-70, 70), frnd(-70, 70)); this.fxStars(x, y, 6, '#ffd166', 150); this.fxShards(x, y, 6, ['#f2662f', '#b8361a', '#ffb27a'], 170, 5); shake = 0.7; break;
      case 'gate': this.fxSparks(x, y, 16, '#ffd27a', 240); this.fxShards(x, y, 8, ['#e8362b', '#d7dbe0', '#2a2d34'], 200, 6); this.fxStars(x, y, 5, '#ffd166', 140); shake = 0.85; break;
      case 'drawbridge': this.fxShards(x, y, 8, ['#d2452f', '#8a5a33', '#f2c14e'], 180, 6); for (let i = 0; i < 5; i++) this.fxPuff(x + frnd(-18, 18), y + frnd(-18, 18), '#d9d2c4', frnd(9, 14), 0.6, frnd(-60, 60), frnd(-60, 60)); this.fxStars(x, y, 5, '#ffd166', 140); shake = 0.75; break;
      case 'crash': for (let i = 0; i < 9; i++) this.fxPuff(x + frnd(-26, 26), y + frnd(-26, 26), i % 2 ? '#ffffff' : '#b9b2a6', frnd(12, 19), 0.8, frnd(-90, 90), frnd(-90, 90)); this.fxShards(x, y, 8, ['#8d857b', '#b4ab9e', '#5f5a56'], 190, 6); this.fxStars(x, y, 5, '#ffd166', 140); shake = 0.85; break;   // past a cliff's landing slope (race-cliff.js)
      case 'hand': case 'pendulum': this.fxSparks(x, y, 14, '#ffd27a', 220); this.fxShards(x, y, 7, ['#c9962f', '#2a2522', '#f3d48a'], 190, 6); this.fxStars(x, y, 6, '#ffd166', 150); this.fxRing(x, y, '#fff1c2', 55, 0.3, 4); shake = hitType === 'pendulum' ? 0.8 : 0.7; break;   // clocktower hand or pendulum (race-clock.js): brass clang
      case 'drift': for (let i = 0; i < 9; i++) { const a = i * TAU / 9; this.fxPuff(x + Math.cos(a) * 16, y + Math.sin(a) * 16, '#e9e9ee', frnd(10, 16), 0.8, Math.cos(a) * 70, Math.sin(a) * 70); } this.fxStars(x, y, 5, '#ffd166', 130); shake = 0.5; break;   // over-held drift (race-drift.js)
      case 'burnout': this.fxBoom(x, y, 0.85); for (let i = 0; i < 16; i++) this.fxPuff(x + frnd(-22, 22), y + frnd(-22, 22), i % 3 ? '#2e2e34' : '#6b6c74', frnd(16, 28), frnd(1.1, 1.7), frnd(-60, 60), frnd(-90, 10)); this.fxSparks(x, y, 14, '#ff9a2e', 200); this.fxShards(x, y, 8, ['#1f1f24', '#3a3a42', '#ff7a1a'], 180, 5); shake = 0.8; break;   // engine blown at the start (race-start.js)
      case 'jet': this.fxBoom(x, y, 1.1); this.fxShards(x, y, 8, ['#e9edf3', '#9aa3b0', '#ffd23f'], 210, 6); for (let i = 0; i < 6; i++) this.fxPuff(x + frnd(-20, 20), y + frnd(-20, 20), '#d9dde4', frnd(10, 16), 0.7, frnd(-80, 80), frnd(-80, 80)); shake = 0.9; break;   // race-jets.js
      case 'thicket': this.fxShards(x, y, 10, ['#5a3d2b', '#8a6a4a', '#2a1d1a'], 200, 6); for (let i = 0; i < 6; i++) this.fxPuff(x + frnd(-20, 20), y + frnd(-20, 20), '#5a4a4e', frnd(11, 17), 0.8, frnd(-60, 60), frnd(-70, 10)); this.fxSparks(x, y, 10, '#ffb300', 180); this.fxStars(x, y, 5, '#ffd166', 140); shake = 0.8; break;   // race-thicket.js: splinters, ash, embers
      case 'zap': this.fxSparks(x, y, 16, '#ff8a8a', 230); this.fxRing(x, y, '#ff4d4d', 60, 0.35, 5); this.fxStars(x, y, 5, '#ffd166', 130); for (let i = 0; i < 5; i++) this.fxPuff(x + frnd(-16, 16), y + frnd(-16, 16), '#d3d0c8', frnd(9, 14), 0.6, frnd(-60, 60), frnd(-60, 60)); shake = 0.7; break;   // mass driver discharging (race-driver.js)
      case 'pad': this.fxSparks(x, y, 12, '#ffd27a', 200); this.fxShards(x, y, 6, ['#ff5a3c', '#f4f1ea', '#2b2f38'], 170, 5); this.fxStars(x, y, 5, '#ffd166', 130); shake = 0.6; break;   // rocket's barrier (race-rocket.js)
      case 'squish': for (let i = 0; i < 8; i++) { const a = i * TAU / 8; this.fxPuff(x + Math.cos(a) * 18, y + Math.sin(a) * 18, '#ffffff', frnd(9, 13), 0.5, Math.cos(a) * 140, Math.sin(a) * 140); } this.fxStars(x, y, 6, '#ffd1dc', 140); shake = 0.6; break;
      case 'tree': for (let i = 0; i < 12; i++) { const a = i * TAU / 12; this.fxPuff(x + Math.cos(a) * 14, y + Math.sin(a) * 14, i % 3 ? '#ffffff' : '#dbe9f6', frnd(10, 17), 0.8, Math.cos(a) * frnd(60, 130), Math.sin(a) * frnd(60, 130)); } this.fxShards(x, y, 7, ['#2f6b46', '#3f8a57', '#6b4a2f'], 170, 5); this.fxStars(x, y, 5, '#ffd166', 130); shake = 0.75; break;   // race-ski.js: snow off branches, needles, twigs
      case 'skicrash': for (let i = 0; i < 14; i++) { const a = i * TAU / 14; this.fxPuff(x + Math.cos(a) * 18, y + Math.sin(a) * 18, i % 3 ? '#ffffff' : '#d6e6f5', frnd(12, 20), 0.9, Math.cos(a) * frnd(70, 150), Math.sin(a) * frnd(70, 150)); } this.fxStars(x, y, 6, '#ffd166', 140); shake = 0.85; break;   // ski jump landing gone wrong (race-cliff.js, snow)
      case 'skifall': for (let i = 0; i < 10; i++) this.fxPuff(x + frnd(-22, 22), y + frnd(-22, 22), '#ffffff', frnd(12, 20), 0.9, frnd(-50, 50), frnd(-50, 50)); this.fxShards(x, y, 6, ['#dbe9f6', '#9fb6cc'], 140, 5); break;   // off the Ridge's edge (race-ski.js)
      default: this.fxBoom(x, y); shake = 0.7;
    }
    this.jolt(c, shake);
    this.sound('hit_' + hitType, c);
    if (HAZ_FEED[hitType]) this.feed('haz', HAZ_FEED[hitType], null, c);
  },
  // a Firewall soaked it up: the dome of hexes shatters
  fxBlock(c) {
    const y = c.y + RIDE;
    this.fxRing(c.x, y, '#40c4ff', 70, 0.4, 7); this.fxRing(c.x, y, '#ffffff', 50, 0.3, 3); this.fxFlash(c.x, y, '#b3ecff', 40, 0.15);
    this.fxShards(c.x, y, 12, ['#40c4ff', '#b3ecff', '#ffffff'], 190, 7); this.fxSparks(c.x, y, 10, '#9be7ff', 150);
    this.sound('block', c);
  },
  // gold coins flipping off a kart and bouncing (a slot machine paying out, race-jackpot.js)
  fxCoins(x, y, n) { for (let i = 0; i < n; i++) { const a = frnd(0, TAU), v = frnd(50, 170); this.particles.push({ kind: 'coin', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, z: 20, vz: frnd(200, 420), rot: frnd(0, TAU), spin: frnd(-14, 14), size: frnd(5, 7.5), life: frnd(0.9, 1.3), maxLife: 1.3, top: true }); } },
  // a "this didn't work" puff (Ctrl+Z blocked, nothing to pull)
  fxFizzle(c) { for (let i = 0; i < 5; i++) this.fxPuff(c.x + frnd(-12, 12), c.y - 10 + frnd(-8, 8), '#9e9e9e', frnd(7, 11), 0.6, frnd(-20, 20), frnd(-50, -20)); this.sound('denied', c); },
  // an item box bursts: rainbow glass and sparkles (no pop-up of what you got)
  fxPickup(c, box) {
    this.fxRing(box.x, box.y, '#ffffff', 46, 0.35, 5);
    for (let i = 0; i < 6; i++) { const a = frnd(0, TAU), v = frnd(80, 160); this.particles.push({ kind: 'debris', x: box.x, y: box.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, z: 8, vz: frnd(120, 260), rot: frnd(0, TAU), spin: frnd(-16, 16), size: frnd(4, 7), col: box.gold ? ['#ffd54f', '#ffb300', '#1e4fa3'][i % 3] : `hsl(${(i * 60 + this.time * 200) % 360},90%,70%)`, life: 0.7, maxLife: 0.7, top: true }); }
    this.fxStars(box.x, box.y, 8, `hsl(${(this.time * 200) % 360},85%,65%)`, 130, 0.5);
    this.sound('pickup', c, 0.8);
  },
  // car c fired item id: a ring in the item's colour, and its sound
  fxUse(c, id) {
    this.fxRing(c.x, c.y, ITEMS[id].col, 55, 0.35, 5);
    this.sound('use_' + id, c);
  },
  fxBoost(c) {
    const bx = c.x - Math.cos(c.heading) * c.L * 0.5, by = c.y - Math.sin(c.heading) * c.L * 0.5;
    this.fxRing(bx, by, '#ffb74d', 46, 0.3, 5); this.fxRing(c.x, c.y, '#ffffff', 56, 0.35, 2);
    this.fxSparks(bx, by, 8, '#ffb300', 130);
    this.fxStreaks(c, 6); for (let i = 0; i < 5; i++) this.fxPuff(bx, by, '#ffffff', frnd(6, 11), 0.45, -Math.cos(c.heading) * 140 + frnd(-30, 30), -Math.sin(c.heading) * 140 + frnd(-30, 30));
  },
  // a drift's mini-turbo (race-drift.js): ring, sparks, speed lines in the tier's colour out the back
  fxDriftBoost(c, t) {
    const col = tierCol(t), ch = Math.cos(c.heading), sh = Math.sin(c.heading), bx = c.x - ch * c.L * 0.5, by = c.y - sh * c.L * 0.5;
    this.fxRing(bx, by, col, 30 + 10 * t, 0.3, 3 + t); this.fxSparks(bx, by, 5 + 4 * t, col, 140 + 30 * t); this.fxStreaks(c, 2 + 2 * t, col);
    for (let i = 0; i < 1 + t; i++) this.fxPuff(bx, by, '#ffffff', frnd(6, 10), 0.4, -ch * 120 + frnd(-30, 30), -sh * 120 + frnd(-30, 30));
  },
  // ...and a pop of sparks off each rear wheel as a tier is reached
  fxDriftTier(c, t) {
    const col = tierCol(t), ch = Math.cos(c.heading), sh = Math.sin(c.heading);
    for (const sd of [-1, 1]) { const x = c.x - ch * c.L * 0.38 - sh * sd * c.W * 0.45, y = c.y - sh * c.L * 0.38 + ch * sd * c.W * 0.45; this.fxSparks(x, y, 3 + t, col, 110); }
  },
  // Fast-Forward pressed (the ⏩ over the kart is ffOver): white-hot flash, cyan and magenta shockwaves (tape colour
  // split), chevrons ahead and sparks out the back
  fxFF(c) {
    const h = c.heading, ch = Math.cos(h), sh = Math.sin(h);
    const bx = c.x - ch * c.L * 0.5, by = c.y - sh * c.L * 0.5;   // the kick out the back
    this.fxSparks(bx, by, 10, '#7df4ff', 170); for (let i = 0; i < 5; i++) this.fxPuff(bx, by, '#e0fbff', frnd(7, 12), 0.45, -ch * 160 + frnd(-40, 40), -sh * 160 + frnd(-40, 40));
    this.fxFlash(c.x, c.y, '#c9fbff', 80, 0.25);
    this.fxRing(c.x, c.y, '#00e5ff', 120, 0.55, 9); this.fxRing(c.x + sh * 4, c.y - ch * 4, '#ff3fd2', 95, 0.42, 4); this.fxRing(c.x, c.y, '#ffffff', 64, 0.3, 3);
    for (let i = 0; i < 7; i++) { const a = h + (i - 3) * 0.2 + frnd(-0.05, 0.05), v = frnd(750, 950); this.particles.push({ kind: 'chev', x: c.x + ch * c.L * 0.4, y: c.y + sh * c.L * 0.4, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: a, col: i % 3 === 1 ? '#ff6fe0' : '#7df4ff', size: frnd(9, 13), life: frnd(0.35, 0.5), maxLife: 0.5, top: true }); }
    this.fxStreaks(c, 14, '#00e5ff', 380);
    this.flashFor(c, { t: 0.4, max: 0.4, col: '0,229,255' });
  },
  // Fast-Forward running out: a sonic boom as it drops back to speed
  fxFFEnd(c) {
    const ch = Math.cos(c.heading), sh = Math.sin(c.heading);
    this.fxFlash(c.x, c.y, '#e6ffff', 60, 0.18);
    this.fxRing(c.x, c.y, '#ffffff', 140, 0.5, 7); this.fxRing(c.x, c.y, '#00e5ff', 100, 0.4, 4);
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8, v = frnd(160, 220); this.fxPuff(c.x + Math.cos(a) * 22, c.y + Math.sin(a) * 22, '#f2feff', frnd(8, 12), 0.5, Math.cos(a) * v + ch * 120, Math.sin(a) * v + sh * 120); }
    for (let i = 0; i < 3; i++) this.particles.push({ kind: 'chev', x: c.x + ch * (c.L * 0.7 + i * 18), y: c.y + sh * (c.L * 0.7 + i * 18), vx: ch * 900, vy: sh * 900, rot: c.heading, col: '#7df4ff', size: 12 - i * 2, life: 0.35, maxLife: 0.35, top: true });
    this.jolt(c, 0.25);
  },
  // a kart bowled by a Fast-Forward (the shove is already in its skid): cyan spark, sparks and chevrons the way it's
  // thrown, a colour-split smear left behind
  fxBowled(c) {
    const d = Math.hypot(c.skx, c.sky) || 1, ux = c.skx / d, uy = c.sky / d, ix = c.x - ux * c.W * 0.5, iy = c.y - uy * c.W * 0.5;
    this.fxFlash(ix, iy, '#7df4ff', 46, 0.16);
    this.fxRing(ix, iy, '#ff3fd2', 46, 0.3, 3);
    for (let i = 0; i < 12; i++) { const a = Math.atan2(uy, ux) + frnd(-0.7, 0.7), v = frnd(200, 420); this.particles.push({ kind: 'spark', x: ix, y: iy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, col: i % 3 ? '#7df4ff' : '#ffffff', size: frnd(2, 3.5), life: frnd(0.2, 0.35), maxLife: 0.35, top: true }); }
    for (let i = 0; i < 3; i++) { const a = Math.atan2(uy, ux) + (i - 1) * 0.35; this.particles.push({ kind: 'chev', x: c.x, y: c.y, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, rot: a, col: i === 1 ? '#ffffff' : '#7df4ff', size: 11, life: 0.4, maxLife: 0.4, top: true }); }
    this.particles.push({ kind: 'smear', x: c.x, y: c.y, vx: -ux * 40, vy: -uy * 40, rot: c.heading, L: c.L, W: c.W, ux, uy, life: 0.45, maxLife: 0.45 });
    this.fxStars(c.x, c.y, 5, '#7df4ff', 150);
  },
  // sudo granted: gold light column, shockwaves, #s, and a gold flash for a player
  fxSudo(c) {
    this.particles.push({ kind: 'beam', x: c.x, y: c.y, vx: 0, vy: 0, col: GOLD, life: 0.7, maxLife: 0.7, top: true });
    this.fxRing(c.x, c.y, GOLD, 90, 0.55, 8); this.fxRing(c.x, c.y, '#ffffff', 60, 0.35, 4); this.fxRing(c.x, c.y, '#ff9f1c', 120, 0.7, 3);
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + frnd(-0.2, 0.2), v = frnd(120, 200); this.particles.push({ kind: 'hash', x: c.x, y: c.y + RIDE, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, rot: frnd(0, TAU), spin: frnd(-6, 6), size: frnd(7, 11), col: i % 3 ? GOLD : '#fff3c4', life: frnd(0.6, 0.9), maxLife: 0.9, top: true }); }
    this.fxSparks(c.x, c.y, 14, '#ffe08a', 220);
    this.flashFor(c, { t: 0.45, max: 0.45, col: '255,201,60' });
  },
  // a sudo kart r rams v: heavy gold impact, v shedding bits, a big shake
  fxSudoWreck(r, v) {
    const mx = (r.x + v.x) / 2, my = (r.y + v.y) / 2, dx = v.x - r.x, dy = v.y - r.y, d = Math.hypot(dx, dy) || 1;
    this.fxHit(v, GOLD, 'sudo');
    this.fxRing(mx, my, '#ffffff', 110, 0.4, 10); this.fxRing(mx, my, GOLD, 150, 0.7, 5);
    for (let i = 0; i < 18; i++) { const a = Math.atan2(dy, dx) + frnd(-0.9, 0.9), s = frnd(200, 420); this.particles.push({ kind: 'spark', x: mx, y: my, vx: Math.cos(a) * s, vy: Math.sin(a) * s, col: i % 2 ? '#fff3c4' : GOLD, size: frnd(2.5, 4.5), life: frnd(0.25, 0.45), maxLife: 0.45, top: true }); }
    this.fxDebris(v.x, v.y, 10, dx / d * 160, dy / d * 160);
    for (let i = 0; i < 6; i++) this.particles.push({ kind: 'hash', x: mx, y: my + RIDE, vx: frnd(-160, 160), vy: frnd(-200, 40), rot: frnd(0, TAU), spin: frnd(-8, 8), size: frnd(6, 9), col: GOLD, life: 0.7, maxLife: 0.7, top: true });
    this.jolt(r, 1); this.jolt(v, 1);
    this.flashFor(v, { t: 0.3, max: 0.3, col: '255,255,255' });
  },
};

// ----- ambient effects, added by the renderer each frame (the headless race never runs them)
const DUST = { plateau: '#dcbf86', pharaoh: '#ecd09a', water: '#efdcae', snow: '#ffffff', lava: '#6e5c63', chips: '#a9bddc', neon: '#7df9ff', space: '#c9d2ff', canyon: '#d08a5a', ice: '#ffffff', atoll: '#f3e2b8', factory: '#9a9ea8', clock: '#a89a88', sakura: '#b08a5c', airport: '#a9a596', trees: '#a8875a', autumn: '#b08a5c', clouds: '#ffffff' };
// what a landing throws up: off the road dust and chassis sparks, beside it per theme (snow, glitter, sand, ash, spray).
// bits: the kind of thing
const LAND = { snow: ['#ffffff', 'snow', '#ffffff'], ice: ['#f2fbff', 'snow', '#d8f4ff'], plateau: ['#dcbf86', 'grit', '#b8462f'], pharaoh: ['#ecd09a', 'grit', '#c8901c'], canyon: ['#d99a68', 'grit', '#8f4a2a'],
  lava: ['#6e5c63', 'sparks', '#ff9a3c'], atoll: ['#f3e2b8', 'spray', '#e6f7ff'], water: ['#efdcae', 'spray', '#e6f7ff'], space: ['#c9d2ff', 'sparks', '#9ff6ff'],
  factory: ['#b3b6bd', 'sparks', '#ffd27a'], chips: ['#a9bddc', 'sparks', '#ffe08a'], clock: ['#b3a690', 'sparks', '#ffd27a'] };
const was = new WeakMap();
export function fxAmbient(race, dt, kind) {
  if (dt <= 0) return;
  const dust = DUST[kind] || '#a8875a';
  for (const c of race.cars) {
    const w = was.get(c) || {}, ch = Math.cos(c.heading), sh = Math.sin(c.heading), back = -c.L * 0.42;
    const rear = side => [c.x + back * ch - side * c.W * 0.42 * sh, c.y + back * sh + side * c.W * 0.42 * ch];
    if (c.off && c.air <= 0 && c.speed > 50 && c.ghost <= 0 && fchance(Math.min(1, c.speed / 260) * 32 * dt)) {   // dust or spray off the road
      const [x, y] = rear(fchance(0.5) ? 1 : -1);
      race.particles.push({ kind: 'puff', x, y, vx: -ch * c.speed * 0.25 + frnd(-30, 30), vy: -sh * c.speed * 0.25 + frnd(-30, 30), col: dust, size: frnd(7, 13), life: frnd(0.5, 0.8), maxLife: 0.8 });
      if (kind === 'trees' || kind === 'sakura') race.particles.push({ x, y, vx: frnd(-60, 60), vy: frnd(-60, 60), col: '#5c9a45', size: 2.5, life: 0.5, maxLife: 0.5 });
    }
    if (c.dAmt > 0.2 && !c.off && c.air <= 0 && c.speed > 60) {   // drifting: tyre smoke off the rear and sparks in the charge's colour
      const t = c.dOn ? driftTier(c) : 0, out = -(c.dSide || 1);   // outside of the drift, where the rear steps out
      for (const sd of [-1, 1]) {
        const [x, y] = driftPt(c, -c.L * 0.38, sd * c.W * 0.44), ox = -sh * out, oy = ch * out;
        if (fchance((sd === out ? 30 : 16) * c.dAmt * dt)) race.particles.push({ kind: 'smoke', x, y, vx: -ch * c.speed * 0.18 + ox * frnd(20, 60) + frnd(-15, 15), vy: -sh * c.speed * 0.18 + oy * frnd(20, 60) + frnd(-15, 15), col: '#ececf0', size: frnd(9, 15), life: frnd(0.6, 1), maxLife: 1 });
        if (t && fchance((14 + 10 * t) * dt)) for (let k = 0; k < 1 + (t > 1 ? 1 : 0); k++) { const a = Math.atan2(-sh, -ch) + frnd(-0.8, 0.8) + out * 0.5, v = frnd(90, 200); race.particles.push({ kind: 'spark', x: x + frnd(-3, 3), y: y + frnd(-3, 3), vx: Math.cos(a) * v, vy: Math.sin(a) * v, col: fchance(0.3) ? '#ffffff' : tierCol(t), size: frnd(1.8, 3.2), life: frnd(0.15, 0.3), maxLife: 0.3, top: true }); }
      }
    }
    if (!c.off && c.air <= 0 && c.slide > 0.35 && c.speed > 170 && fchance(18 * dt)) {   // tyre smoke when sliding
      const [x, y] = rear(fchance(0.5) ? 1 : -1);
      race.particles.push({ kind: 'smoke', x, y, vx: -ch * 40 + frnd(-20, 20), vy: -sh * 40 + frnd(-20, 20), col: '#e6e6ea', size: frnd(8, 12), life: frnd(0.7, 1.1), maxLife: 1.1 });
    }
    if (!(w.air > 0) && c.air > 0 && !(c.moonT > 0) && w.air !== undefined) {   // off a lip: a puff and a few sparks
      const [x, y] = [c.x + back * ch, c.y + back * sh], v = c.speed * 0.3;
      for (let i = 0; i < 3; i++) race.particles.push({ kind: 'puff', x: x + frnd(-8, 8), y: y + frnd(-8, 8), vx: -ch * v + frnd(-40, 40), vy: -sh * v + frnd(-40, 40), col: kind === 'snow' || kind === 'ice' ? '#ffffff' : dust, size: frnd(6, 10), life: 0.45, maxLife: 0.45 });
      for (let i = 0; i < 4; i++) { const a = Math.atan2(-sh, -ch) + frnd(-0.9, 0.9), sp = frnd(120, 260); race.particles.push({ kind: 'spark', x: x + frnd(-10, 10), y: y + frnd(-10, 10), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, col: i % 2 ? '#fff1c4' : '#ffc45a', size: frnd(1.8, 3), life: frnd(0.16, 0.3), maxLife: 0.3, top: true }); }
    }
    if (w.air > 0 && c.air <= 0 && !(c.moonT > 0) && !(c.spinT > 0.9)) {   // landing: a ring and a burst of the surface, harder after a long flight
      const k = clamp(w.airT / 0.9, 0.4, 1), [pc, bits, bc] = c.off ? (LAND[kind] || [dust, 'grit', '#7a5a3a']) : (kind === 'snow' || kind === 'ice' ? LAND[kind] : ['#d9d6cf', 'sparks', '#ffd98a']);
      race.particles.push({ kind: 'ring', x: c.x, y: c.y, vx: 0, vy: 0, col: 'rgba(255,255,255,0.7)', r1: 34 + 26 * k, w: 5, life: 0.35, maxLife: 0.35 });
      const n = 5 + Math.round(3 * k);
      for (let i = 0; i < n; i++) { const a = i / n * TAU + frnd(-0.3, 0.3), sp = frnd(50, 90) * k; race.particles.push({ kind: 'puff', x: c.x + Math.cos(a) * c.L * 0.45 + ch * 6, y: c.y + Math.sin(a) * c.W * 0.6 + sh * 6, vx: Math.cos(a) * sp + ch * c.speed * 0.15, vy: Math.sin(a) * sp * 0.75 + sh * c.speed * 0.15, col: pc, size: frnd(8, 13), life: frnd(0.5, 0.7), maxLife: 0.7 }); }
      for (let i = 0; i < 2 + Math.round(3 * k); i++) {
        const side = i % 2 ? 1 : -1, a = Math.atan2(sh, ch) + side * frnd(1.9, 2.7), sp = frnd(90, 200) * k;   // flung sideways and back
        if (bits === 'sparks') race.particles.push({ kind: 'spark', x: c.x - ch * c.L * 0.3, y: c.y - sh * c.L * 0.3, vx: Math.cos(a) * sp * 1.4, vy: Math.sin(a) * sp * 1.4, col: bc, size: frnd(2, 3.4), life: frnd(0.2, 0.34), maxLife: 0.34, top: true });
        else race.particles.push({ kind: 'drop', x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, z: 6, vz: frnd(160, 300) * k, col: bc, size: bits === 'grit' ? frnd(1.6, 2.6) : frnd(2, 3.2), life: frnd(0.6, 0.9), maxLife: 0.9, top: true });
      }
    }
    if (w.sudo > 0 && c.sudo <= 0) {   // root expires: the gold blows away
      for (let i = 0; i < 10; i++) race.particles.push({ kind: 'puff', x: c.x + frnd(-25, 25), y: c.y + RIDE + frnd(-25, 25), vx: frnd(-50, 50), vy: frnd(-80, 0), col: '#ffe08a', size: frnd(6, 10), life: 0.7, maxLife: 0.7, top: true });
    }
    was.set(c, { air: c.air, airT: c.airT, sudo: c.sudo });
  }
  if (kind === 'ice') geysers(race, dt);
}
// Cryo Caldera's geysers burble, then whoosh up a steam column that drifts off; the race clock only picks the moment
function geysers(race, dt) {
  const spots = clearingsOf(race.track); if (!spots) return;
  spots.forEach((g, i) => {
    const period = 9 + (i * 3.7) % 5, u = (race.time + i * 4.3) % period, R = g.r * 0.6;
    if (u < 1.1) { if (fchance(14 * dt)) race.particles.push({ kind: 'puff', x: g.x + frnd(-R, R) * 0.2, y: g.y + frnd(-R, R) * 0.2, vx: frnd(-20, 20), vy: frnd(-40, -10), col: '#e8fbff', size: frnd(5, 9), life: 0.5, maxLife: 0.5 }); return; }
    if (u >= 2.9) return;
    if (u - dt < 1.1) { race.sound('geyser', g, 0.9); race.particles.push({ kind: 'ring', x: g.x, y: g.y, vx: 0, vy: 0, col: 'rgba(220,250,255,0.9)', r1: R * 1.4, w: 6, life: 0.5, maxLife: 0.5 }); }
    const k = u < 1.6 ? (u - 1.1) / 0.5 : 1 - (u - 1.6) / 1.3;   // builds fast, then tails off
    for (let n = 0; n < 3; n++) if (fchance(30 * k * dt)) race.particles.push({ kind: 'smoke', x: g.x + frnd(-8, 8), y: g.y - frnd(0, 30), vx: frnd(-35, 35), vy: -frnd(240, 420) * (0.5 + k * 0.5), col: n ? '#ffffff' : '#d6f3fb', size: frnd(10, 18), life: frnd(1, 1.6), maxLife: 1.6, top: true });
    if (fchance(22 * k * dt)) { const a = frnd(0, TAU), v = frnd(40, 150); race.particles.push({ kind: 'drop', x: g.x, y: g.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, z: 30, vz: frnd(260, 480), col: '#bfefff', size: frnd(1.6, 2.6), life: 1.3, maxLife: 1.3, top: true }); }
  });
}

const KEEP = new Set(['ring', 'ringIn', 'flash', 'beam', 'strike', 'hash', 'wheel']);   // signals kept in reduced effects
export function updateParticles(race, dt) {
  for (const p of race.particles) {
    if (settings.reduced && !p.seen) { p.seen = 1; if (!KEEP.has(p.kind) && !fchance(0.4)) p.life = 0; }   // reduced effects: most new particles never appear
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
    const drag = p.kind === 'confetti' ? 0.985 : p.kind === 'wheel' || p.kind === 'debris' || p.kind === 'drop' || p.kind === 'coin' ? 0.96 : p.kind === 'spark' ? 0.88 : p.kind === 'chev' ? 0.96 : p.kind === 'smoke' ? 0.94 : 0.9;
    if (p.kind === 'wheel' || p.kind === 'debris' || p.kind === 'coin') { p.z += p.vz * dt; p.vz -= 1100 * dt; if (p.z < 0) { p.z = 0; p.vz = -p.vz * 0.45; } }
    if (p.kind === 'drop' && p.z > 0) { p.z += p.vz * dt; p.vz -= (p.gz || 900) * dt; if (p.z <= 0) { p.z = 0; p.vx = p.vy = 0; } }   // lands and stays as a splat
    p.vx *= drag; p.vy *= drag; if (p.g) p.vy += p.g * dt; if (p.spin) p.rot += p.spin * dt;
  }
  race.particles = race.particles.filter(p => p.life > 0);
  if (race.shake) race.shake = Math.max(0, race.shake - dt * 2.5);
  if (race.zap) { race.zap.t -= dt; if (race.zap.t <= 0) race.zap = null; }
  if (race.flash) { race.flash.t -= dt; if (race.flash.t <= 0) race.flash = null; }
}

// ⏩ pointing along +x, size s: a wide glow stroke, the colour, then a white-hot core
function chevrons(ctx, s, col) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
  for (const o of [-s * 0.38, s * 0.38]) { ctx.moveTo(o - s * 0.42, -s * 0.62); ctx.lineTo(o + s * 0.24, 0); ctx.lineTo(o - s * 0.42, s * 0.62); }
  for (const [w, c, a] of [[0.5, col, 0.35], [0.26, col, 1], [0.1, '#ffffff', 1]]) { ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = c; ctx.lineWidth = s * w; ctx.stroke(); ctx.restore(); }
}
const star5 = (ctx, r) => { ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); };
function hashMark(ctx, s, col, w = s * 0.22) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath();
  for (const o of [-0.3, 0.3]) { ctx.moveTo(o * s + 0.15 * s, -s * 0.55); ctx.lineTo(o * s - 0.15 * s, s * 0.55); ctx.moveTo(-s * 0.55, o * s); ctx.lineTo(s * 0.55, o * s); }
  ctx.stroke();
}
// a particle well off the view isn't drawn; these kinds stay near where they spawn (with room for their size)
const SMALL = new Set(['puff', 'smoke', 'spark', 'star', 'shard', 'fire', 'drop', 'flash', 'confetti', 'coin', 'wheel', 'debris', 'hash', 'chev', 'ring', 'ringIn', 'bolt']);
const offView = p => SMALL.has(p.kind) && !inView(p.x, p.y, 60 + (p.size || 0) * 4 + (p.r1 || 0) + (p.w || 0) + Math.abs(p.z || 0));
export function drawParticles(ctx, race, top) {
  if (bold()) return drawParticlesBold(ctx, race, top);
  for (const p of race.particles) {
    if (!!p.top !== top || offView(p)) continue;
    const f = clamp(p.life / p.maxLife, 0, 1), age = 1 - f;
    ctx.save(); ctx.translate(p.x, p.y);
    switch (p.kind) {
      case 'ringIn': ctx.globalAlpha = Math.min(1, f * 2); ctx.strokeStyle = p.col; ctx.lineWidth = p.w * (1 - f) + 1; ctx.beginPath(); ctx.arc(0, 0, 6 + p.r1 * f * f, 0, TAU); ctx.stroke(); break;
      case 'flash': ctx.globalAlpha = f; ctx.globalCompositeOperation = 'lighter'; stamp(ctx, glowSprite(p.col, 0.9), 0, 0, p.size * (1.15 + 0.6 * age)); break;   // a soft pop of light
      case 'shard': ctx.globalAlpha = Math.min(1, f * 2.5); ctx.rotate(p.rot); ctx.fillStyle = p.col; ctx.beginPath(); ctx.moveTo(p.size, 0); ctx.lineTo(-p.size * 0.6, p.size * 0.55); ctx.lineTo(-p.size * 0.4, -p.size * 0.6); ctx.closePath(); ctx.fill(); break;
      case 'fire': { const col = age < 0.18 ? FIRE[0] : age < 0.35 ? FIRE[1] : age < 0.55 ? FIRE[2] : age < 0.7 ? FIRE[3] : '#6b6f80';
        ctx.globalAlpha = Math.min(1, f * 1.6) * 0.9; const r = p.size * (0.5 + age * 0.9) * 1.3;
        stamp(ctx, age < 0.7 ? glowSprite(col, age < 0.35 ? 0.6 : 0.25) : puffSprite(col), 0, 0, r); break; }   // cooling into a soft puff
      case 'drop':
        ctx.globalAlpha = Math.min(1, f * 2.5); ctx.fillStyle = p.col;
        if (p.z > 0) { ctx.beginPath(); ctx.arc(0, -p.z * 0.6, p.size, 0, TAU); ctx.fill(); } else { ctx.beginPath(); ctx.ellipse(0, 0, p.size * 1.6, p.size, 0, 0, TAU); ctx.fill(); }
        break;
      case 'bolt': {
        ctx.globalAlpha = Math.floor(p.life * 40) % 2 ? f : f * 0.4; ctx.rotate(p.rot); ctx.strokeStyle = p.col; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(8, 0); for (let k = 1; k <= 4; k++) ctx.lineTo(8 + p.size * k / 4, (k % 2 ? 1 : -1) * p.size * 0.12 * frnd(0.5, 1.5)); ctx.stroke(); break; }
      case 'strike': {                                     // redrawn jagged every frame so it crackles
        const H = 520, segs = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const pts = [[frnd(-30, 30), -H]]; for (let k = 1; k < segs; k++) pts.push([frnd(-26, 26) * (1 - k / segs * 0.6), -H + H * k / segs]); pts.push([0, 0]);
        for (const [c2, w, a] of [[p.col, 16, 0.35], [p.col, 8, 0.8], ['#ffffff', 3.5, 1]]) { ctx.globalAlpha = a * (Math.floor(p.life * 30) % 3 ? f : f * 0.3); ctx.strokeStyle = c2; ctx.lineWidth = w * (0.5 + f * 0.5); ctx.beginPath(); pts.forEach(([px, py], k) => k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.stroke(); }
        break; }
      case 'ring': ctx.globalAlpha = f; ctx.strokeStyle = p.col; ctx.lineWidth = p.w * f + 1; ctx.beginPath(); ctx.arc(0, 0, 10 + p.r1 * (1 - f * f), 0, TAU); ctx.stroke(); break;
      case 'star': ctx.globalAlpha = Math.min(1, f * 2); ctx.rotate(p.rot); ctx.fillStyle = p.col; star5(ctx, p.size * (0.5 + f * 0.5)); ctx.fill(); ctx.fillStyle = '#ffffffb0'; star5(ctx, p.size * 0.35 * f); ctx.fill(); break;
      case 'spark': {
        ctx.globalAlpha = f; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = p.col;
        const len = Math.hypot(p.vx, p.vy) * 0.045 + 2;
        ctx.rotate(Math.atan2(p.vy, p.vx)); ctx.beginPath(); ctx.roundRect(-len, -p.size * 0.5, len * 2, p.size, p.size / 2); ctx.fill();
        break;
      }
      case 'wheel': {
        ctx.globalAlpha = Math.min(1, f * 3);
        ctx.fillStyle = '#00000030'; ctx.beginPath(); ctx.ellipse(2, 3, p.size * 1.1, p.size * 0.6, 0, 0, TAU); ctx.fill();
        ctx.translate(0, -p.z * 0.6); ctx.rotate(p.rot);
        ctx.fillStyle = '#17181c'; ctx.beginPath(); ctx.arc(0, 0, p.size, 0, TAU); ctx.fill();
        ctx.fillStyle = '#c9ccd8'; ctx.beginPath(); ctx.arc(0, 0, p.size * 0.5, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#17181c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-p.size * 0.45, 0); ctx.lineTo(p.size * 0.45, 0); ctx.stroke(); break; }
      case 'debris': {
        ctx.globalAlpha = Math.min(1, f * 3);
        ctx.fillStyle = '#00000030'; ctx.beginPath(); ctx.ellipse(2, 3, p.size, p.size * 0.5, 0, 0, TAU); ctx.fill();
        ctx.translate(0, -p.z * 0.6); ctx.rotate(p.rot); ctx.scale(1, Math.abs(Math.cos(p.rot * 1.3)) * 0.7 + 0.3);
        ctx.fillStyle = p.col; ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2); break; }
      case 'coin': {   // edge-on flipping coin: narrowing ellipse, rim, glint
        ctx.globalAlpha = Math.min(1, f * 3);
        ctx.fillStyle = '#00000030'; ctx.beginPath(); ctx.ellipse(2, 3, p.size, p.size * 0.45, 0, 0, TAU); ctx.fill();
        const w = Math.abs(Math.cos(p.rot)) * 0.85 + 0.15; ctx.translate(0, -p.z * 0.6); ctx.scale(w, 1);
        ctx.fillStyle = '#b07a12'; ctx.beginPath(); ctx.arc(0.8, 0.8, p.size, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.arc(0, 0, p.size, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.arc(-p.size * 0.25, -p.size * 0.3, p.size * 0.4, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#c8901c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, p.size * 0.68, 0, TAU); ctx.stroke(); break; }
      case 'puff': ctx.globalAlpha = f * 0.6; stamp(ctx, puffSprite(p.col), 0, 0, p.size * (0.6 + age * 1.1) * 1.25); break;   // cached soft sprite
      case 'smoke': ctx.globalAlpha = f * 0.42; stamp(ctx, puffSprite(p.col), 0, 0, p.size * (0.7 + age * 2.2) * 1.25); break;
      case 'confetti': ctx.globalAlpha = Math.min(1, f * 3); ctx.rotate(p.rot); ctx.scale(1, Math.abs(Math.cos(p.rot * 1.7)) + 0.2); ctx.fillStyle = p.col; ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66); break;
      case 'hash': ctx.globalAlpha = Math.min(1, f * 2.5); ctx.rotate(p.rot); hashMark(ctx, p.size * (0.7 + 0.3 * f), '#7a4a00', p.size * 0.34); hashMark(ctx, p.size * (0.7 + 0.3 * f), p.col); break;
      case 'chev': ctx.globalAlpha = f; ctx.globalCompositeOperation = 'lighter'; ctx.rotate(p.rot); chevrons(ctx, p.size, p.col); break;
      case 'smear': {   // a bowled kart's colour-split ghost
        ctx.globalAlpha = f * 0.55; ctx.globalCompositeOperation = 'lighter';
        for (const [o, col] of [[-1, '#ff3fd2'], [1, '#00e5ff']]) { ctx.save(); ctx.translate(-p.ux * (10 + 26 * age) + o * p.uy * 4, -p.uy * (10 + 26 * age) - o * p.ux * 4); ctx.rotate(p.rot); ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(-p.L / 2, -p.W / 2, p.L, p.W, p.W / 2.4); ctx.fill(); ctx.restore(); }
        break; }
      case 'beam': {   // a light column up off the kart, narrowing as it fades
        const h = 260 * (0.4 + age), w = 50 * f + 12;
        ctx.globalAlpha = f; ctx.save(); ctx.scale(1.6, 0.6); stamp(ctx, glowSprite('#ffc93c', 0.7), 0, 0, w * 0.9); ctx.restore();   // its foot
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = f; ctx.drawImage(beamSprite(), -w / 2, -h, w, h); break; }
      default: ctx.globalAlpha = f * 0.9; ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(0, 0, p.size * (0.6 + 0.4 * f), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// a flat look's particles (js/look.js): same kinds, solid palette shapes, no outlines, additive light or soft sprites
function drawParticlesBold(ctx, race, top) {
  ctx.lineJoin = 'round';
  for (const p of race.particles) {
    if (!!p.top !== top || offView(p)) continue;
    const f = clamp(p.life / p.maxLife, 0, 1), age = 1 - f, col = boldCol(p.col);
    ctx.save(); ctx.translate(p.x, p.y);
    switch (p.kind) {
      case 'ringIn': case 'ring': {
        const r = p.kind === 'ring' ? 10 + p.r1 * (1 - f * f) : 6 + p.r1 * f * f, w = p.kind === 'ring' ? p.w * f + 1 : p.w * (1 - f) + 1;
        ctx.globalAlpha = (p.kind === 'ring' ? f : Math.min(1, f * 2)) * 0.85; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); break; }
      case 'flash': ctx.globalAlpha = Math.min(1, f * 1.6) * 0.3; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, p.size * (0.5 + 0.5 * age), 0, TAU); ctx.fill(); break;
      case 'shard': ctx.globalAlpha = Math.min(1, f * 2.5); ctx.rotate(p.rot); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(p.size, 0); ctx.lineTo(-p.size * 0.6, p.size * 0.55); ctx.lineTo(-p.size * 0.4, -p.size * 0.6); ctx.closePath(); ctx.fill(); break;
      case 'fire': ctx.globalAlpha = Math.min(1, f * 1.6) * 0.9; ctx.fillStyle = age < 0.3 ? BK.yellow : age < 0.6 ? '#ee8a3e' : age < 0.75 ? BK.red : '#6f737c'; ctx.beginPath(); ctx.arc(0, 0, p.size * (0.5 + age * 0.9) * 0.9, 0, TAU); ctx.fill(); break;
      case 'drop': ctx.globalAlpha = Math.min(1, f * 2.5); ctx.fillStyle = col; ctx.beginPath(); if (p.z > 0) ctx.arc(0, -p.z * 0.6, p.size, 0, TAU); else ctx.ellipse(0, 0, p.size * 1.6, p.size, 0, 0, TAU); ctx.fill(); break;
      case 'bolt': {
        ctx.globalAlpha = Math.floor(p.life * 40) % 2 ? f : f * 0.4; ctx.rotate(p.rot); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(8, 0); for (let k = 1; k <= 4; k++) ctx.lineTo(8 + p.size * k / 4, (k % 2 ? 1 : -1) * p.size * 0.12 * frnd(0.5, 1.5));
        ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke(); break; }
      case 'strike': {
        const H = 520, segs = 9; ctx.lineCap = 'round';
        const pts = [[frnd(-30, 30), -H]]; for (let k = 1; k < segs; k++) pts.push([frnd(-26, 26) * (1 - k / segs * 0.6), -H + H * k / segs]); pts.push([0, 0]);
        ctx.globalAlpha = Math.floor(p.life * 30) % 3 ? f : f * 0.3; ctx.beginPath(); pts.forEach(([px, py], k) => k ? ctx.lineTo(px, py) : ctx.moveTo(px, py));
        ctx.strokeStyle = col; ctx.lineWidth = 6 * (0.5 + f * 0.5); ctx.stroke(); break; }
      case 'star': ctx.globalAlpha = Math.min(1, f * 2); ctx.rotate(p.rot); ctx.fillStyle = col; star5(ctx, p.size * (0.5 + f * 0.5)); ctx.fill(); break;
      case 'spark': { ctx.globalAlpha = f; ctx.fillStyle = col; const len = Math.hypot(p.vx, p.vy) * 0.045 + 2; ctx.rotate(Math.atan2(p.vy, p.vx)); ctx.fillRect(-len, -p.size * 0.5, len * 2, p.size); break; }
      case 'wheel': {
        ctx.globalAlpha = Math.min(1, f * 3); ctx.translate(0, -p.z * 0.6); ctx.rotate(p.rot);
        ctx.fillStyle = '#2a2d33'; ctx.beginPath(); ctx.arc(0, 0, p.size, 0, TAU); ctx.fill(); ctx.fillStyle = '#9ba1ac'; ctx.beginPath(); ctx.arc(0, 0, p.size * 0.45, 0, TAU); ctx.fill(); break; }
      case 'debris': ctx.globalAlpha = Math.min(1, f * 3); ctx.translate(0, -p.z * 0.6); ctx.rotate(p.rot); ctx.scale(1, Math.abs(Math.cos(p.rot * 1.3)) * 0.7 + 0.3); ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2, p.size * 0.25); ctx.fill(); break;
      case 'coin': { ctx.globalAlpha = Math.min(1, f * 3); ctx.translate(0, -p.z * 0.6); ctx.scale(Math.abs(Math.cos(p.rot)) * 0.85 + 0.15, 1); ctx.fillStyle = '#c99628'; ctx.beginPath(); ctx.arc(0, 0, p.size, 0, TAU); ctx.fill(); ctx.fillStyle = BK.yellow; ctx.beginPath(); ctx.arc(0, 0, p.size * 0.78, 0, TAU); ctx.fill(); break; }
      case 'puff': ctx.globalAlpha = f * 0.4; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, p.size * (0.6 + age * 1.1), 0, TAU); ctx.fill(); break;
      case 'smoke': ctx.globalAlpha = f * 0.28; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, p.size * (0.7 + age * 2.2), 0, TAU); ctx.fill(); break;
      case 'confetti': ctx.globalAlpha = Math.min(1, f * 3); ctx.rotate(p.rot); ctx.scale(1, Math.abs(Math.cos(p.rot * 1.7)) + 0.2); ctx.fillStyle = col; ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66); break;
      case 'hash': ctx.globalAlpha = Math.min(1, f * 2.5); ctx.rotate(p.rot); hashMark(ctx, p.size * (0.7 + 0.3 * f), col); break;
      case 'chev': {
        ctx.globalAlpha = f; ctx.rotate(p.rot); const s = p.size; ctx.lineCap = 'round'; ctx.beginPath();
        for (const o of [-s * 0.38, s * 0.38]) { ctx.moveTo(o - s * 0.42, -s * 0.62); ctx.lineTo(o + s * 0.24, 0); ctx.lineTo(o - s * 0.42, s * 0.62); }
        ctx.strokeStyle = col; ctx.lineWidth = s * 0.24; ctx.stroke(); break; }
      case 'smear':
        ctx.globalAlpha = f * 0.5;
        for (const [o, c2] of [[-1, BK.pink], [1, BK.cyan]]) { ctx.save(); ctx.translate(-p.ux * (10 + 26 * age) + o * p.uy * 4, -p.uy * (10 + 26 * age) - o * p.ux * 4); ctx.rotate(p.rot); ctx.strokeStyle = c2; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-p.L / 2, -p.W / 2, p.L, p.W, p.W * 0.3); ctx.stroke(); ctx.restore(); }
        break;
      case 'beam': { const h = 260 * (0.4 + age), w = 34 * f + 8; ctx.globalAlpha = f * 0.6; ctx.fillStyle = BK.yellow; ctx.beginPath(); ctx.roundRect(-w / 2, -h, w, h, w / 2); ctx.fill(); break; }
      default: ctx.globalAlpha = f * 0.85; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, p.size * (0.6 + 0.4 * f), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ----- per-kart status effects
const trails = new WeakMap();   // recent positions, for afterimages (sudo gold, fast-forward cyan)
function trail(c) {
  let tr = trails.get(c); if (!tr) trails.set(c, tr = []);
  const last = tr[tr.length - 1];
  if (c.sudo > 0 || c.ff > 0) { if (!last || Math.hypot(c.x - last.x, c.y - last.y) > 18) { tr.push({ x: c.x, y: c.y, h: c.heading }); if (tr.length > 6) tr.shift(); } }
  else tr.length = 0;
  return tr;
}
// a car-shaped glow (the footprint, rounded) at x, y facing h
function ghostCar(ctx, c, x, y, h, col, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(h); ctx.globalAlpha = a; ctx.fillStyle = col;
  ctx.beginPath(); ctx.roundRect(-c.L / 2, -c.W / 2, c.L, c.W, c.W / 2.4); ctx.fill(); ctx.restore();
}
// malloc: a glowing pink heap-block slab exactly the giant's footprint (its hitbox), memory cells filling in as it's
// allocated and flickering in use, selection brackets at the corners
export function mallocVis(c) {   // drawn size: a springy pop growing, a warning flicker in its last second
  if (c.growK === 1) return 1;
  const age = GROW_T - c.grow;
  let k = c.growK * (1 + (c.grow > 0 && age < 0.7 ? Math.sin(age * 22) * Math.exp(-age * 5) * 0.12 : 0));
  if (c.grow > 0 && c.grow < 1 && Math.floor(c.grow * 12) % 2) k *= 0.86;
  return k;
}
function heapBlock(ctx, c, t) {
  const f = clamp((c.growK - 1) / 0.6, 0, 1), age = GROW_T - c.grow, fill = c.grow > 0 ? clamp(age / 0.45, 0, 1) : 1;
  const L = c.L + 30, W = c.W + 30, cols = 10, rows = 5, cw = L / cols, chh = W / rows;
  ctx.save(); ctx.rotate(c.heading); ctx.globalAlpha = f;
  // the glow: widening translucent slabs, not shadowBlur (a 24 px blur every frame stuttered); none in flat looks
  if (!bold()) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const ga = 0.16 + 0.06 * Math.sin(t * 5);
  for (const [e, a] of [[20, 0.18], [13, 0.3], [6, 1]]) { ctx.fillStyle = `rgba(255,92,138,${ga * a})`; ctx.beginPath(); ctx.roundRect(-L / 2 - e, -W / 2 - e, L + e * 2, W + e * 2, 8 + e); ctx.fill(); }
  ctx.restore();
  }
  ctx.fillStyle = 'rgba(40,6,22,0.35)'; ctx.beginPath(); ctx.roundRect(-L / 2, -W / 2, L, W, 8); ctx.fill();
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    if ((cols - 1 - i) / cols > fill) continue;   // cells fill from the nose back
    const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453, r = h - Math.floor(h), on = Math.sin(t * (3 + r * 5) + r * 20) > 0.2;
    ctx.fillStyle = on ? `rgba(255,${150 + Math.floor(r * 80)},${190 + Math.floor(r * 40)},0.8)` : 'rgba(255,92,138,0.32)';
    ctx.beginPath(); ctx.roundRect(-L / 2 + i * cw + 1.5, -W / 2 + j * chh + 1.5, cw - 3, chh - 3, 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,92,138,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -t * 30;
  ctx.beginPath(); ctx.roundRect(-L / 2, -W / 2, L, W, 8); ctx.stroke(); ctx.setLineDash([]);
  const b = 12 + Math.sin(t * 6) * 1.5;   // corner brackets
  ctx.lineCap = 'round';
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * (L / 2 + 5), y = sy * (W / 2 + 5);
    for (const [w, col] of [[6, 'rgba(194,24,91,0.9)'], [3, '#ffd1dc']]) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x - sx * b, y); ctx.lineTo(x, y); ctx.lineTo(x, y - sy * b); ctx.stroke(); }
  }
  ctx.restore();
}
// a player holding the gas in the countdown (race-start.js): revving (render.js shakes the kart) and exhaust puffs;
// the same whatever the timing (it only shows the gas is held)
// Drawn from the clock, nothing spawned, so it costs nothing online.
export function drawRev(ctx, c, t) {
  const spr = puffSprite('#9aa0ab');
  ctx.save(); ctx.translate(c.x, c.y);
  ctx.rotate(c.heading);
  const bx = -c.L / 2 + 2;
  for (let k = 0; k < 4; k++) {
    const ph = (t * 2.4 + k / 4) % 1, side = k % 2 ? 1 : -1;
    ctx.globalAlpha = (1 - ph) * 0.6; stamp(ctx, spr, bx - ph * 34, side * c.W * 0.22, 7 + ph * 12);
  }
  ctx.restore();
}
// ----- Fast-Forward: the media player's ⏩ as a rocket, all drawn from c.ff and the clock (nothing spawned, same
// online). ffFade: in over 0.15 s, out over the last 0.3
const ffFade = c => Math.min(1, (FF_T - c.ff) / 0.15, c.ff / 0.3 + 0.25);
const FF_C = '#00e5ff', FF_M = '#ff3fd2';
// afterimages split like a fast tape: magenta to one side, cyan to the other
function ffTrail(ctx, c, tr, t) {
  const j = Math.sin(t * 37) * 1.5;   // the split jitters
  ctx.save(); ctx.globalCompositeOperation = bold() ? 'source-over' : 'lighter';
  tr.forEach((p, i) => {
    const a = (0.05 + i * 0.035) * ffFade(c), nx = -Math.sin(p.h), ny = Math.cos(p.h), o = 4 + j;
    ghostCar(ctx, c, p.x + nx * o, p.y + ny * o, p.h, FF_M, a); ghostCar(ctx, c, p.x - nx * o, p.y - ny * o, p.h, FF_C, a * 1.3);
  });
  ctx.restore();
}
// a drift (race-drift.js): mini-turbo flame colours per tier (outer, middle), and the rear wheels' glow and spark arcs
// while charging (white, then the tier's colour)
const MT_FLAME = [['#2962ff', '#64d2ff'], ['#ff5722', '#ffb74d'], ['#7c4dff', '#d29bff']];
function driftGlow(ctx, c, t) {
  const tier = driftTier(c), col = tierCol(tier), out = -(c.dSide || 1), k = tier ? 0.32 + 0.1 * tier : 0.14, BD = bold();
  ctx.save(); ctx.globalCompositeOperation = BD ? 'source-over' : 'lighter';
  for (const sd of [-1, 1]) {
    const x = -c.L * 0.38, y = sd * c.W * 0.44, fl = 0.8 + 0.2 * Math.sin(t * 50 + sd * 2);
    if (!BD) { ctx.globalAlpha = k * fl * c.dAmt; stamp(ctx, glowSprite(col, 0), x - 4, y + out * 3, 13 + 5 * tier); }   // flat: just the sparks
    if (!tier) continue;
    ctx.strokeStyle = col; ctx.lineWidth = BD ? 2 : 1.6; ctx.lineCap = 'round'; ctx.globalAlpha = 0.9 * c.dAmt;
    const seed = Math.floor(t * 24) + sd * 7;
    for (let j = 0; j < 1 + tier; j++) {
      const r = n => { const v = Math.sin((seed + j * 13) * 12.9898 + n * 78.233) * 43758.5453; return v - Math.floor(v); };
      const a = Math.PI + (r(1) - 0.5) * 1.6 + out * 0.6, l = 7 + r(2) * (8 + 4 * tier);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
  }
  ctx.restore();
}
// on the road round the kart (turned to its heading): time-warp ripple, tape-scrub lines, glow, twin plumes with shock
// diamonds, a bow shock round the nose
function ffUnder(ctx, c, t) {
  const F = ffFade(c), W = c.W, bx = -c.L / 2 + 2, nose = c.L / 2, BD = bold();
  ctx.save(); ctx.globalCompositeOperation = BD ? 'source-over' : 'lighter';
  // the glow it throws on the road (not in a flat look)
  if (!BD) { ctx.globalAlpha = 0.45 * F; ctx.save(); ctx.translate(-c.L * 0.6, 0); ctx.scale(2.6, 1); stamp(ctx, glowSprite(FF_C, 0), 0, 0, W * 0.9); ctx.restore(); }
  // time-warp ripple: rings peeling off and widening back
  ctx.lineWidth = 2.5;
  for (let k = 0; k < 3; k++) {
    const ph = (t * 2.6 + k / 3) % 1, x = -c.L * 0.2 - ph * 190;
    ctx.globalAlpha = F * (1 - ph) * Math.min(1, ph * 6) * 0.55; ctx.strokeStyle = k % 2 ? FF_M : FF_C;
    ctx.beginPath(); ctx.ellipse(x, 0, 16 + ph * 34, W * (0.75 + ph * 1.4), 0, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
  }
  // tape-scrub lines streaking back past both sides
  ctx.lineCap = 'round';
  for (let k = 0; k < 10; k++) {
    const ph = (t * (4.2 + (k % 3) * 0.7) + k * 0.137) % 1, side = k % 2 ? 1 : -1, y = side * (W * 0.62 + ((k * 7) % 5) * 7), x = nose + 20 - ph * (c.L + 220), len = 30 + (k % 4) * 14;
    ctx.globalAlpha = F * (1 - ph) * 0.8; ctx.strokeStyle = k % 5 === 0 ? FF_M : k % 3 === 0 ? FF_C : '#ffffff'; ctx.lineWidth = k % 3 === 0 ? 2.5 : 1.6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len, y); ctx.stroke();
  }
  // twin plumes: cyan sheath, white-hot core, shock diamonds
  const fl = 1 + Math.sin(t * 53) * 0.12 + Math.sin(t * 31) * 0.08, L = 160 * fl * Math.min(1, c.ff * 3) * Math.min(1, F * 1.5);
  ctx.globalAlpha = F;
  for (const [y, ph] of [[-W * 0.25, 0], [W * 0.25, 1.7]]) {
    const fy = Math.sin(t * 41 + ph) * 1.2;
    for (const [col, w, k] of BD ? [[BK.cyan, 10, 0.8], ['#bfe9f4', 4, 0.4]] : [['rgba(0,229,255,0.3)', 16, 1], ['rgba(0,229,255,0.85)', 10, 0.82], ['#b2ffff', 6.5, 0.55], ['#ffffff', 3.5, 0.3]]) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(bx, y - w); ctx.quadraticCurveTo(bx - L * k * 0.5, y - w * 0.9 + fy, bx - L * k, y + fy); ctx.quadraticCurveTo(bx - L * k * 0.5, y + w * 0.9 + fy, bx, y + w); ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    for (let d = 0; d < 3; d++) { const x = bx - L * (0.12 + d * 0.16), r = 4.4 - d * 1, a = (0.9 - d * 0.25) * (0.75 + 0.25 * Math.sin(t * 60 + d * 2 + ph)); ctx.globalAlpha = F * a; ctx.beginPath(); ctx.moveTo(x + r * 1.8, y); ctx.lineTo(x, y - r); ctx.lineTo(x - r * 1.8, y); ctx.lineTo(x, y + r); ctx.fill(); }
  }
  // bow shock: light pushed ahead of the nose, swept back like a cone
  const sh = (t * 6) % 1;
  for (const [k, a] of [[0, 1], [0.5, 0.55]]) {
    const x = nose + 8 + ((sh + k) % 1) * 16, spread = W * 1.05, back = 48, al = F * a * (1 - ((sh + k) % 1) * 0.6);
    for (const [w, col, m] of BD ? [[2.5, BK.cyan, 1]] : [[7, 'rgba(0,229,255,0.35)', 1], [3, 'rgba(190,255,255,0.95)', 1], [1.4, '#ffffff', 0.7]]) {
      ctx.globalAlpha = al * m; ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x - back, -spread); ctx.quadraticCurveTo(x + 12, -spread * 0.15, x + 12, 0); ctx.quadraticCurveTo(x + 12, spread * 0.15, x - back, spread); ctx.stroke();
    }
  }
  ctx.restore();
}
// over the kart and rider: the picture tearing like a fast-forwarding tape: magenta/cyan split outline, rolling scanlines
function ffOver(ctx, c, t) {
  const F = ffFade(c), j = 2.5 + Math.sin(t * 37) * 1.5;
  ctx.save(); ctx.globalCompositeOperation = bold() ? 'source-over' : 'lighter';
  ctx.save(); ctx.rotate(c.heading); ctx.lineWidth = 2;
  for (const [o, col] of [[j, FF_M], [-j, FF_C]]) { ctx.globalAlpha = 0.75 * F; ctx.strokeStyle = col; ctx.beginPath(); ctx.roundRect(-c.L / 2 - 2 + o * 0.6, -c.W / 2 - 2 + o, c.L + 4, c.W + 4, c.W / 2.4); ctx.stroke(); }
  ctx.restore();
  const age = FF_T - c.ff;
  if (age < 0.7) {   // the ⏩ lighting up over the rider: a pop, then up and away
    const pop = 1 + Math.sin(age * 20) * Math.exp(-age * 7) * 0.35;
    ctx.save(); ctx.translate(0, -104 - age * 30); ctx.scale(pop, pop); ctx.globalAlpha = Math.min(1, age * 14, (0.7 - age) * 4);   // (above the player tag)
    chevrons(ctx, 26, FF_C); ctx.restore();
  }
  const rx = c.L * 0.62, ry = c.W * 0.5 + 34, cy = RIDE - 8;
  ctx.beginPath(); ctx.ellipse(0, cy, rx, ry, 0, 0, TAU); ctx.clip();
  ctx.fillStyle = '#ffffff'; const off = (t * 46) % 4;
  ctx.globalAlpha = 0.12 * F; ctx.beginPath(); for (let y = cy - ry + off; y < cy + ry; y += 4) ctx.rect(-rx, y, rx * 2, 1.1); ctx.fill();
  const band = ((t * 1.7) % 1.4 - 0.2) * ry * 2 + cy - ry;   // tracking band rolling down
  ctx.globalAlpha = 0.22 * F; ctx.fillStyle = FF_C; ctx.fillRect(-rx, band, rx * 2, 6); ctx.fillStyle = FF_M; ctx.fillRect(-rx, band + 6, rx * 2, 2);
  ctx.restore();
}
// a local player on Fast-Forward: screen-space speed lines toward their kart and a cyan edge glow (before the HUD).
// Off in reduced effects; the glow is off with flashes off.
export function drawFFScreen(ctx, race, W, H, ox, oy, sc) {
  if (settings.reduced) return;
  for (const c of race.localHumans || race.humans) {
    if (!(c.ff > 0)) continue;
    const F = ffFade(c), cx = (W / 2 + ox + c.x * sc) / 2, cy = (H / 2 + oy + c.y * sc) / 2, R = Math.hypot(W, H), r0 = Math.min(W, H) * 0.36, seed = Math.floor(race.time * 16);   // centred between screen middle and kart
    ctx.save();
    const BD = bold();
    if (settings.flashes && !BD) { const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, R * 0.7); g.addColorStop(0, 'rgba(0,229,255,0)'); g.addColorStop(1, `rgba(0,229,255,${0.26 * F})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    ctx.globalCompositeOperation = BD ? 'source-over' : 'lighter';
    for (let k = 0; k < 44; k++) {   // re-dealt 16×/s so they flicker
      const r = n => { const v = Math.sin((seed * 44 + k) * 12.9898 + n * 78.233) * 43758.5453; return v - Math.floor(v); };
      if (r(5) < 0.3) continue;
      const a = (k + r(1) * 0.9) / 44 * TAU, ca = Math.cos(a), sa = Math.sin(a), r1 = r0 * (1.05 + r(2) * 0.6), w = 5 + r(3) * 11;
      ctx.globalAlpha = (0.12 + 0.24 * r(4)) * F; ctx.fillStyle = r(6) < 0.3 ? '#7df4ff' : '#ffffff';
      ctx.beginPath(); ctx.moveTo(cx + ca * r1, cy + sa * r1); ctx.lineTo(cx + ca * R - sa * w, cy + sa * R + ca * w); ctx.lineTo(cx + ca * R + sa * w, cy + sa * R - ca * w); ctx.fill();
    }
    ctx.restore();
  }
}
// under the kart: afterimages, sudo sigil, boost flames, slipstream
export function drawCarUnder(ctx, c, t) {
  const tr = trail(c);
  if (tr.length && c.ff > 0) ffTrail(ctx, c, tr, t);
  else if (tr.length) { ctx.save(); ctx.globalCompositeOperation = bold() ? 'source-over' : 'lighter'; tr.forEach((p, i) => ghostCar(ctx, c, p.x, p.y, p.h, c.sudo > 0 ? '#ffb72b' : '#22d3ee', 0.08 + i * 0.045)); ctx.restore(); }
  ctx.save(); ctx.translate(c.x + c.jx, c.y + c.jy);
  if (c.growK > 1.02) heapBlock(ctx, c, t);
  if (c.sudo > 0) {   // root sigil: a turning ring of #s
    const R = c.L * 0.72, pulse = 1 + 0.06 * Math.sin(t * 9), fade = Math.min(1, c.sudo / 0.5);
    ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(255,190,40,0.18)'; ctx.beginPath(); ctx.ellipse(0, 0, R * 1.25 * pulse, R * 1.0 * pulse, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.rotate(t * 1.4); ctx.strokeStyle = 'rgba(255,201,60,0.85)'; ctx.lineWidth = 2.5; ctx.setLineDash([10, 7]); ctx.beginPath(); ctx.arc(0, 0, R * pulse, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, R * 0.82 * pulse, 0, TAU); ctx.stroke();
    for (let k = 0; k < 6; k++) { ctx.save(); ctx.rotate(k * TAU / 6); ctx.translate(R * 0.91 * pulse, 0); ctx.rotate(-t * 1.4 - k * TAU / 6); hashMark(ctx, 7, '#ffd75e', 1.6); ctx.restore(); }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  ctx.rotate(c.heading);
  if (c.dYaw) { const px = c.L * DRIFT_PIVOT; ctx.translate(px, 0); ctx.rotate(c.dYaw); ctx.translate(-px, 0); }   // turned with a drift's slide
  if (c.dOn && c.dAmt > 0.3 && c.air <= 0) driftGlow(ctx, c, t);   // rear wheels glowing in the charge's colour
  if (c.ff > 0) ffUnder(ctx, c, t);                      // fast-forward
  else if (c.oc > 0) {                                  // overclock: one huge violet plasma jet with a blue-white core
    const fl = 1 + Math.sin(t * 47) * 0.18 + Math.sin(t * 29) * 0.12, L = 175 * fl * Math.min(1, c.oc * 3), bx = -c.L / 2 + 2;
    if (!bold()) { ctx.globalAlpha = 0.4; stamp(ctx, glowSprite('#ff6d00', 0), 0, 0, c.L * 0.95); ctx.globalAlpha = 1; }   // not in a flat look
    for (const [col, w, k] of bold() ? [[BK.violet, 17, 0.85], [BK.cyan, 10, 0.6], ['#e6e2ff', 4, 0.36]] : [['#7c4dff80', 26, 1], ['#b388ff', 18, 0.85], ['#80d8ff', 11, 0.62], ['#ffffff', 5, 0.38]]) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(bx, -w); ctx.quadraticCurveTo(bx - L * k * 0.55, -w * 1.1, bx - L * k, 0); ctx.quadraticCurveTo(bx - L * k * 0.55, w * 1.1, bx, w); ctx.fill();
    }
    ctx.strokeStyle = '#e1d5ff'; ctx.lineWidth = 2; ctx.lineCap = 'round';                // crackle along the jet
    for (let k = 0; k < 2; k++) { let x = bx, y = 0; ctx.beginPath(); ctx.moveTo(x, y); for (let j = 0; j < 5; j++) { x -= L * 0.16; y = frnd(-11, 11); ctx.lineTo(x, y); } ctx.stroke(); }
  } else if (c.boost > 0) {   // flames out the back, with a hot glow
    const fl = 1 + Math.sin(t * 40) * 0.15 + Math.sin(t * 23) * 0.1, L = 38 * fl * Math.min(1, c.boost * 3), bx = -c.L / 2 + 2;
    const BD = bold();
    if (!BD) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5; ctx.translate(bx - L * 0.4, 0); ctx.scale(L * 0.85 / 32, c.W * 0.7 / 32); stamp(ctx, glowSprite('#ff8c28', 0), 0, 0, 32);   // soft glow, not a hard oval
    ctx.restore();
    }
    for (const y of [-c.W * 0.22, c.W * 0.22]) {
      ctx.fillStyle = '#ff5722'; ctx.beginPath(); ctx.moveTo(bx, y - 6.5); ctx.quadraticCurveTo(bx - L, y, bx, y + 6.5); ctx.fill();
      ctx.fillStyle = '#ffca28'; ctx.beginPath(); ctx.moveTo(bx, y - 4); ctx.quadraticCurveTo(bx - L * 0.65, y, bx, y + 4); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(bx, y - 1.8); ctx.quadraticCurveTo(bx - L * 0.35, y, bx, y + 1.8); ctx.fill();
    }
  }
  if (c.mtT > 0 && !(c.boost > 0) && !(c.oc > 0) && !(c.ff > 0)) {   // drift mini-turbo: a flame in the tier's colour, longer each tier
    const [o, m] = MT_FLAME[(c.mtTier || 1) - 1], tl = DRIFT.TIERS[(c.mtTier || 1) - 1][1], fl = 1 + Math.sin(t * 43) * 0.16 + Math.sin(t * 27) * 0.1, L = (24 + 9 * (c.mtTier || 1)) * fl * Math.min(1, c.mtT / tl * 3, (tl - c.mtT) * 12 + 0.4), bx = -c.L / 2 + 2;
    const BD = bold();
    if (!BD) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; ctx.translate(bx - L * 0.4, 0); ctx.scale(L * 0.85 / 32, c.W * 0.6 / 32); stamp(ctx, glowSprite(m, 0), 0, 0, 32); ctx.restore(); }
    for (const y of [-c.W * 0.22, c.W * 0.22]) {
      ctx.fillStyle = o; ctx.beginPath(); ctx.moveTo(bx, y - 6); ctx.quadraticCurveTo(bx - L, y, bx, y + 6); ctx.fill();
      ctx.fillStyle = m; ctx.beginPath(); ctx.moveTo(bx, y - 3.8); ctx.quadraticCurveTo(bx - L * 0.65, y, bx, y + 3.8); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(bx, y - 1.6); ctx.quadraticCurveTo(bx - L * 0.35, y, bx, y + 1.6); ctx.fill();
    }
  }
  if (c.slip && c.speed > 120) {
    ctx.strokeStyle = '#ffffff90'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) { const ph = (t * 4 + k / 3) % 1, x = -20 - ph * 60, y = (k - 1) * 16; ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 22, y); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
const GOO = [[-14, -10, 8, -11, -6], [10, 8, 7, 10, 6], [16, -12, 5, 8, -5], [-6, 14, 5, -8, 5]];   // Memory Leak splats: x, y, radius, droplet offset
// over the kart and rider: sudo ram, tow beam, shield, goo, freeze, bubble, panic, dizzy stars
export function drawCarOver(ctx, c, t) {
  ctx.save(); ctx.translate(c.x + c.jx, c.y + c.jy);
  if (c.ff > 0) ffOver(ctx, c, t);
  if (c.pull > 0 && c.pullTarget) {   // tow beam: a twisting cable with pulses running back
    const dx = c.pullTarget.x - c.x, dy = c.pullTarget.y - c.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
    const BD = bold();
    ctx.save(); ctx.globalCompositeOperation = BD ? 'source-over' : 'lighter'; ctx.lineCap = 'round';
    for (const [w, col, ph] of BD ? [[3, BK.cyan, 0], [3, BK.cyan, Math.PI]] : [[9, 'rgba(38,198,218,0.25)', 0], [3, 'rgba(120,240,255,0.9)', 0], [3, 'rgba(120,240,255,0.9)', Math.PI]]) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
      for (let k = 0; k <= 24; k++) { const f = k / 24, wv = Math.sin(f * 16 - t * 22 + ph) * 6 * Math.sin(f * Math.PI); ctx.lineTo(dx * f + nx * wv, dy * f + ny * wv); } ctx.stroke();
    }
    ctx.fillStyle = '#e0f7fa'; for (let k = 0; k < 5; k++) { const f = (t * 1.6 + k / 5) % 1; ctx.beginPath(); ctx.arc(dx * (1 - f), dy * (1 - f), 4, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  if (c.sudo > 0) {
    const fade = Math.min(1, c.sudo / 0.5);
    // the ram: a gold ring all round (anyone it touches is flung)
    const BD = bold();
    ctx.save(); ctx.rotate(c.heading); ctx.globalCompositeOperation = BD ? 'source-over' : 'lighter'; ctx.globalAlpha = fade * (0.8 + 0.2 * Math.sin(t * 9));
    const aura = c.L * 0.5 + 6;
    for (const [w, col] of BD ? [[3, BK.yellow]] : [[12, 'rgba(255,170,30,0.35)'], [5, 'rgba(255,214,90,0.9)'], [2, '#ffffff']]) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.ellipse(0, 0, aura, Math.max(aura * 0.7, c.W * 0.5 + 8), 0, 0, TAU); ctx.stroke(); }
    ctx.restore();
    // crackle: little arcs of lightning jumping off the body
    ctx.save(); ctx.globalCompositeOperation = BD ? 'source-over' : 'lighter'; ctx.strokeStyle = BD ? BK.yellow : '#fff1b0'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
    const seed = Math.floor(t * 18);
    for (let k = 0; k < 2; k++) {
      const r = n => { const s = Math.sin((seed + k * 31) * 12.9898 + n * 78.233) * 43758.5453; return s - Math.floor(s); };
      const a = r(1) * TAU, x0 = Math.cos(a) * c.L * 0.45, y0 = Math.sin(a) * c.W * 0.6 + RIDE * 0.4;
      ctx.beginPath(); ctx.moveTo(x0, y0); let x = x0, y = y0; for (let j = 0; j < 4; j++) { x += Math.cos(a) * 7 + (r(j + 2) - 0.5) * 10; y += Math.sin(a) * 7 + (r(j + 7) - 0.5) * 10; ctx.lineTo(x, y); } ctx.stroke();
    }
    ctx.restore();
    // how long it has left: a gold arc that runs down
    ctx.strokeStyle = 'rgba(122,74,0,0.5)'; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.arc(0, RIDE, c.L * 0.62, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(c.sudo / 4, 0, 1)); ctx.stroke();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5; ctx.stroke();
  }
  if (c.oiled > 0) {   // no wheels: belly-scraping sparks out the back
    const ch = Math.cos(c.heading), sh = Math.sin(c.heading);
    for (let k = 0; k < 3; k++) { const b = -c.L * 0.45 - frnd(0, 14), l = frnd(-0.5, 0.5) * c.W; ctx.fillStyle = fchance(0.5) ? '#ffd166' : '#ff9f43'; ctx.beginPath(); ctx.arc(b * ch - l * sh, b * sh + l * ch, rnd(1.5, 3.5), 0, TAU); ctx.fill(); }
    // goo splats on kart and rider: dark rim, green, wet highlight, a flung droplet each
    const a = Math.min(1, c.oiled * 3); ctx.globalAlpha = a;
    for (const [x, y, r, ox, oy] of GOO) {
      ctx.fillStyle = '#3d6e17'; ctx.beginPath(); ctx.arc(x, y, r + 1.4, 0, TAU); ctx.moveTo(x + ox + 3.4, y + oy); ctx.arc(x + ox, y + oy, 3.4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8ccf45'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.moveTo(x + ox + 2, y + oy); ctx.arc(x + ox, y + oy, 2, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(220,255,170,0.85)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.38, r * 0.34, r * 0.2, -0.6, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (c.frozen > 0) {   // a block of ice round the kart and its rider
    const w = Math.max(c.L, 60) + 18, h = c.W + 62, y0 = -h + c.W / 2 + 12;
    ctx.fillStyle = 'rgba(200,236,255,0.62)'; ctx.beginPath(); ctx.roundRect(-w / 2, y0, w, h, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = 'rgba(160,215,245,0.5)'; ctx.fillRect(-w / 2, y0 + h - 12, w, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.roundRect(-w / 2 + 7, y0 + 7, 9, h * 0.45, 4); ctx.fill(); ctx.beginPath(); ctx.roundRect(-w / 2 + 20, y0 + 7, 5, h * 0.2, 2.5); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(w * 0.1, y0 + 10); ctx.lineTo(w * 0.2, y0 + 30); ctx.lineTo(w * 0.15, y0 + 44); ctx.stroke();
  }
  if (c.bubbled > 0) {   // wobbling soap bubble with a sliding sheen
    const bob = Math.sin(t * 5) * 4, R = Math.max(c.L * 0.62, 50), wob = 1 + Math.sin(t * 7) * 0.04;
    ctx.save(); ctx.translate(0, RIDE + bob); ctx.scale(wob, 1 / wob);
    if (bold()) { const spr = bubbleSpriteBold(R), m = spr.width / 6; ctx.drawImage(spr, -m, -m, m * 2, m * 2); }   // flat: no rainbow swirl
    else {
    const spr = bubbleSprite(R), m = spr.width / 6; ctx.drawImage(spr, -m, -m, m * 2, m * 2);   // film, rim, highlights (cached)
    ctx.lineCap = 'round'; ctx.lineWidth = 3;   // colour swirl drifting round
    for (const [k, hue] of [[0, 300], [Math.PI, 190]]) { ctx.strokeStyle = `hsla(${(hue + t * 60) % 360},85%,78%,0.45)`; ctx.beginPath(); ctx.arc(0, 0, R * 0.9, t * 0.8 + k, t * 0.8 + k + 1.1); ctx.stroke(); }
    }
    ctx.restore();
  }
  if (c.shield > 0) {   // Firewall: hex dome, flickering out at the end
    const blink = c.shield < 1 && Math.floor(t * 10) % 2;
    if (!blink) {
      const R = Math.max(c.L * 0.62, 50) + 4;
      ctx.save(); ctx.translate(0, RIDE);
      const BD = bold(), spr = BD ? shieldSpriteBold(R) : shieldSprite(R), m = spr.width / 6; ctx.drawImage(spr, -m, -m, m * 2, m * 2);   // cached: was ~170 hex paths a frame
      const sweep = (t * 2) % TAU; ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, R, sweep, sweep + 0.6); ctx.stroke();
      ctx.restore();
    }
  }
  if (c.stall > 0) {   // Kernel Panic: flashing sign over the rider
    const y = RIDE - 52 + Math.sin(t * 20) * 2;
    if (bold()) { ctx.save(); ctx.translate(0, y); drawIconBold(ctx, 'panic', 14); ctx.restore(); }   // flat: no glow
    else {
    ctx.globalAlpha = 0.45 + 0.35 * Math.sin(t * 16); stamp(ctx, glowSprite('#ff2d4b', 0.3), 0, y, 30); ctx.globalAlpha = 1;   // pulsing red glow behind
    ctx.save(); ctx.translate(0, y); ICONS.panic(ctx, 14, t); ctx.restore();
    }
  }
  if (c.spinT > 0 || c.stall > 0 || c.squished > 0) {   // dizzy stars
    for (let k = 0; k < 3; k++) { const a = t * 6 + k * TAU / 3; ctx.save(); ctx.translate(Math.cos(a) * 22, RIDE - 32 + Math.sin(a) * 7); ctx.rotate(a); ctx.fillStyle = '#ffd166'; star5(ctx, 6); ctx.fill(); ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); }
  }
  ctx.restore();
}
