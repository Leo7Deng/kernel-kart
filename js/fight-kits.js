// Fight mode's fighter kits: what each move with a `do` does (js/fight-chars.js), and the world objects they leave
// (fight.objs: plain data, drawn by draw-fight.js, carried online like everything else). DOM-free, deterministic:
// randomness only from the fight's own stream (F.rngs[2]).
//
// js/fight.js runs a kit through its hooks (all optional; c = { inp, mag, dirA }: the held input):
//   can(F, f, mv)               may it start now (a three-move move: one fork or geyser alive at a time)
//   press(F, f, o, mv, c)       a three-move move pressed: its wind-up (the tell) begins
//   wind(F, f, o, mv, dt, c)    every step of the wind-up (aiming, the time-stop ring growing...)
//   hold(F, f, o, mv, c)        true: keep winding past the startup (the key still held: the geyser's aim)
//   start(F, f, o, mv)          its active part begins (strikeStart)
//   step(F, f, o, mv, dt, c)    every step of the active part (strikeStep)
//   end(F, f, o, mv)            the active part ran out (true: it dealt with what comes next itself)
//   wall(F, f, c)               the fighter meets a wall during it (true: dealt with)
//   blocked(F, a, d, mv, ang)   a direct hit of it was blocked (true: dealt with); the old roster's only (no shield for Tux and Duke)
//   moves                       true: it sets its own velocity (no ground friction meanwhile)
//   phases(mv)                  its phases for the docs (test/fight-frames.mjs): [phase, state, seconds, pose, what]
// OBJ[kind] steps a world object. The three-move fighters' phases, objects, events and poses: docs/fight-api-tux-duke.md.
//   toboggan   Tux's Toboggan Torpedo: a crouch (his line shows), then a belly slide that rams, bouncing off one wall
//   iceberg    Tux's Iceberg Drop: up out of shot, his shadow aimed, a belly flop on it that floors everyone near; ice
//   fork       Tux's fork() Bomb: three little penguins that waddle at them and belly-slide into them
//   portal     Duke's Write Once, Run Anywhere: gone, a mark behind them, out of it with a two-handed smash
//   stopworld  Duke's Stop the World: a snap, a ring growing out from him; inside when it completes: frozen
//   geyser     Duke's Coffee Geyser: a pot at the marked spot, a moment later a geyser there, then a puddle
//   iceblock   Tux's evade, Ice Block: frozen into ice, untouchable and rooted, then the crack (open); a hit on it
//              shatters it, and the shards stagger whoever hit it (from close by)
//   gc         Duke's evade, Garbage Collect: a short blink the held way (or away from them), two charges
// The other eight's (unused since 2026-10-23, kept for their rebuild):
//   dig      Gopher's Dig: underground (untouchable), runs at them, pops up under them and knocks them down
//   swarm    Gopher's Goroutines: a swarm of little gophers running through them, each hitting once
//   counter  Ferris's Borrow Checker: a counter stance; a hit on it from in front is blocked and pinched back (event 'borrow')
//   own      Ferris's Ownership: takes their super meter, locks their special for a while, dizzies them up close
//   coil     Pyth's Coil: a hold from range (wraps them up and squeezes, then tosses them down); can't be blocked, step out of it
//   lift     Pyth's import antigravity: they float helpless a moment, just off the floor (hits don't knock them down)
//   pull     Octo's Pull Request: a tentacle from range that catches them and yanks them in, open
//   spin     Octo's Merge Conflict: spins, hitting all round him again and again, the last spin knocks down
//   crate    Docky's Container: a shipping container dropped in front, a solid for a while; hit it and it slides
//   compose  Docky's docker compose: containers rain down round them (each a solid once down)
//   dive     Swifty's Swift Dive: a fast diving dash that rams
//   chain    Swifty's Optional Chaining: three homing dives in a row
//   blink    Cpp's Pointer: he blinks to a spot a short way ahead (past them, if they're in the way)
//   ub       Cpp's Undefined Behavior: one of four big effects, from the fight's seeded stream
//   zap      Bugdroid's Antenna Zap: a short beam that stuns
//   field    Bugdroid's Boot Loop: an electric field under them; stay in it and you're stunned
import { TAU, clamp } from './core.js';
import { contacts, sd } from './fight-arenas.js';
import { armorOf } from './fight-chars.js';
import { GRABBABLE, comboScale } from './fight.js';
import { PLUGINS } from './kits/index.js';

export const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
export const turnTo = (a, b, max) => { const d = angDiff(b, a); return a + clamp(d, -max, max); };
const angMid = (a, b) => b + angDiff(a, b) / 2;
const D2R = Math.PI / 180;
const kitMove = (f, k = f.move) => k && f.stats.moves[k];
export const kitOf = f => { const mv = kitMove(f); return mv && mv.do ? KITS[mv.do] : null; };
// Ferris holding his counter stance right now
export const countering = f => f.state === 'strike' && f.move === 'special' && f.stats.moves.special.do === 'counter';
// the containers that are down (solids for everyone) in the fight (and a plug-in's solid world objects: solid: 1)
export const crates = F => F.objs.filter(o => (o.kind === 'crate' || o.solid) && o.z <= 0);
// how far a point is from a segment (x0,y0)-(x1,y1), and how far along it (0..1)
function segDist(px, py, x0, y0, x1, y1) {
  const ex = x1 - x0, ey = y1 - y0, L = ex * ex + ey * ey || 1, t = clamp(((px - x0) * ex + (py - y0) * ey) / L, 0, 1);
  return [Math.hypot(px - x0 - ex * t, py - y0 - ey * t), t];
}
// the first point along (x0,y0) -> (x1,y1) inside a solid or a container (a beam or a tentacle stops there), or null
function blockedAt(F, x0, y0, x1, y1, pad = 2) {
  const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(L / 8)), cs = crates(F);
  for (let k = 1; k <= n; k++) {
    const t = k / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    if (F.A.solids.some(o => sd(o, x, y)[0] < pad) || cs.some(o => sd(o, x, y)[0] < pad)) return t;
  }
  return null;
}
const spawn = (F, o) => { o.id = ++F.oid; F.objs.push(o); return o; };

// ---------------------------------------------------------------- the three-move fighters' helpers
// the move's phase (f.ph, the drawer's pose key; f.pht: how long in it)
export function setPh(f, ph) { if (f.ph !== ph) { f.ph = ph; f.pht = 0; } }
// still the same go of the same move (an object tied to a wind-up dies when it's cut short)
const sameGo = (f, ob) => f.move === ob.mv && f.ms === ob.ms;
const mine = (F, f, kind) => F.objs.find(b => b.kind === kind && b.owner === f.i && b.t < b.life);
const D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// a point inside the arena (pad units from the wall), clear of the solids' insides: pulled toward the middle until it is
function inside(F, x, y, pad) {
  for (let k = 0; k < 24; k++) {
    if (sd(F.A.bounds, x, y)[0] < -pad && !F.A.solids.some(o => sd(o, x, y)[0] < 2)) break;
    x *= 0.9; y *= 0.9;
  }
  return [x, y];
}
// a toboggan's ice: on an ice patch (Tux's own, or the arena's)
const onIce = (F, f) => f.ice > 0;
// the foe's little penguins near (x, y) burst (any of a move's hit areas: a slide, a landing, a smash, an eruption, the ring)
export function popPeng(F, x, y, r, by) {
  for (const ob of F.objs) if (ob.kind === 'peng' && ob.owner !== by && ob.ph !== 'wait' && ob.t < ob.life && Math.hypot(ob.x - x, ob.y - y) <= r + ob.r) burst(F, ob, 'popped');
}
function burst(F, ob, how) { ob.life = ob.t; ob.ph = 'burst'; F.ev('peng', ob.x, ob.y, how === 'hit' ? 0.6 : 0.4, ob.owner, { move: 'move3', how }); }
// the toboggan's line: from Tux along his facing, off one wall (glancing ones slide along), to where the slide would end.
// It curves the way it would steer if the held direction stays held (the crouch still turning toward it, then the slide's
// steering), so the track shows the curve. pts: a point every ~22 units (rounded), bi: the indices where it bounces
function tobLine(F, f, mv, c) {
  const ln = mine(F, f, 'tobline'); if (!ln) return;
  const go = f.state === 'strike', held = c && c.mag > 0.3, step = 6, dta = step / mv.speed;
  let x = f.x, y = f.y, a = f.face, left = mv.speed * (go ? Math.max(0, f.dur - f.t) : mv.active), bnc = go ? f.bnc || 0 : 0, run = 0;
  if (!go && held) a = turnTo(a, c.dirA, mv.aimTurn * Math.max(0, f.dur - f.t) * 0.8);   // (the rest of the crouch's turn)
  const pts = [[x, y]], bi = [];
  for (let it = 0; it < 300 && left > 0; it++) {
    if (held) a = turnTo(a, c.dirA, mv.steer * dta);
    const nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step, cs = F.contactsAll(nx, ny, f.r);
    if (cs.length) {
      let k = cs[0]; for (const q of cs) if (q.pen > k.pen) k = q;
      const dx = Math.cos(a), dy = Math.sin(a), dn = dx * k.nx + dy * k.ny;
      if (dn > -0.35) { const tx = dx - dn * k.nx, ty = dy - dn * k.ny; a = Math.atan2(ty, tx); x += k.nx * 0.5; y += k.ny * 0.5; left -= 3; continue; }   // (glancing: along it)
      if (bnc >= mv.bounces) break;
      bnc++; bi.push(pts.length); pts.push([x, y]); run = 0; a = Math.atan2(dy - 2 * dn * k.ny, dx - 2 * dn * k.nx); continue;
    }
    x = nx; y = ny; left -= step; run += step;
    if (run >= 22) { pts.push([x, y]); run = 0; }
  }
  if (run > 0 || pts.length < 2) pts.push([x, y]);
  ln.pts = pts.map(([px, py]) => [Math.round(px * 10) / 10, Math.round(py * 10) / 10]); ln.bi = bi; ln.x = f.x; ln.y = f.y;
}
// aiming (2026-10-24, the user: "i still want the aiming and feel of the aim to look better"): the held direction turns
// or moves an aim at a steady top speed with a little easing in and out, so it starts and stops smoothly and never jitters.
// A key (8 ways: diagonals at full speed like the straights) is full speed; a stick ramps up past its dead zone
export const aimMag = m => m < 0.25 ? 0 : Math.min(1, (m - 0.25) / 0.55);
// turn f's facing toward `want` (eased: aw, the turn's speed, kept on the move's object) at most max rad/s
function turnEase(f, ob, want, max, dt) {
  const d = angDiff(want, f.face), tw = clamp(d / 0.12, -max, max);
  ob.aw = (ob.aw || 0) + (tw - (ob.aw || 0)) * (1 - Math.exp(-dt / 0.06));
  f.face += ob.aw * dt;
}
// move an aim object (the shadow, the geyser's mark) the held way: its velocity eases toward speed x the held amount
function aimMove(ob, c, speed, ease, dt) {
  const m = c ? aimMag(c.mag) : 0, k = 1 - Math.exp(-dt / ease);
  ob.vx += ((m ? Math.cos(c.dirA) * speed * m : 0) - ob.vx) * k; ob.vy += ((m ? Math.sin(c.dirA) * speed * m : 0) - ob.vy) * k;
  ob.x += ob.vx * dt; ob.y += ob.vy * dt;
}
// keep an aim object pad clear of the walls and solids, sliding along them (no speed into them)
function keepAim(F, ob, pad) {
  for (let it = 0; it < 3; it++) {
    const cs = contacts(F.A, ob.x, ob.y, pad); if (!cs.length) break;
    let k = cs[0]; for (const q of cs) if (q.pen > k.pen) k = q;
    ob.x += k.nx * k.pen; ob.y += k.ny * k.pen;
    const vn = ob.vx * k.nx + ob.vy * k.ny; if (vn < 0) { ob.vx -= vn * k.nx; ob.vy -= vn * k.ny; }
  }
  [ob.x, ob.y] = inside(F, ob.x, ob.y, pad * 0.5);   // (a corner it can't slide out of: the old pull toward the middle)
}
// the toboggan over: flat on his belly, open
function belly(F, f, mv) {
  setPh(f, 'belly'); F.go(f, 'recover', mv.belly);
  F.ev('belly', f.x, f.y, 0.5, f.i, { move: 'move1' });
  const ln = mine(F, f, 'tobline'); if (ln) ln.life = ln.t;
}
// the iceberg's shadow moved the held way (bots hold toward the foe), kept inside the arena
function aimShadow(F, f, sh, mv, dt, c) {
  if (sh.lock) return;
  aimMove(sh, c, mv.aimSpeed, mv.aimEase, dt);
  keepAim(F, sh, mv.R * 0.3);
}
// the geyser's mark: near..far from Duke (no speed on past either), inside the arena
function clampMark(F, f, g, mv) {
  const dx = g.x - f.x, dy = g.y - f.y, d = Math.hypot(dx, dy) || 1, k = clamp(d, mv.near, mv.far) / d;
  if (k !== 1) { const ux = dx / d, uy = dy / d, vr = g.vx * ux + g.vy * uy; if ((k < 1) === (vr > 0)) { g.vx -= vr * ux; g.vy -= vr * uy; } }
  g.x = f.x + dx * k; g.y = f.y + dy * k;
  keepAim(F, g, g.r * 0.5);
}
// where Duke's portal opens: behind them (their back, `behind` past touching), turned round them until it fits
function portalSpot(F, f, o, mv) {
  const dist = o.r + f.r + mv.behind;
  for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
    const b = o.face + Math.PI + k * 0.45, x = o.x + Math.cos(b) * dist, y = o.y + Math.sin(b) * dist;
    if (!F.contactsAll(x, y, f.r + 1).length) return [x, y, Math.atan2(o.y - y, o.x - x)];
  }
  return [f.x, f.y, Math.atan2(o.y - f.y, o.x - f.x)];
}
function stumble(F, f, mv) { setPh(f, 'stumble'); F.go(f, 'recover', mv.stumble); F.ev('stumble', f.x, f.y, 0.4, f.i, { move: 'move1' }); }
// frozen by Stop the World: a statue for mv.freeze s; the hits on them store their knockback (x kbMul) till the thaw
export function freezeF(F, o, mv, by) {
  F.release(o);
  o.move = null; o.charge = 0; o.ph = ''; o.gone = 0;
  o.frozenT = mv.freeze; o.fzx = 0; o.fzy = 0; o.fzkd = 0; o.fzMul = mv.kbMul ?? 0.5; o.fzBy = by;
  F.go(o, 'frozen', mv.freeze); o.vx = o.vy = o.vz = 0;
}

export const KITS = {
  // ---------------------------------------------------------------- Tux
  toboggan: {
    moves: true,
    press(F, f, o, mv, c) {   // aimed at them to start with (the held way turns it from there)
      setPh(f, 'crouch'); f.bnc = 0; f.face = Math.atan2(o.y - f.y, o.x - f.x);
      spawn(F, { kind: 'tobline', x: f.x, y: f.y, z: 0, vx: 0, vy: 0, vz: 0, r: f.r, w: f.r, pts: [], bi: [], aw: 0, ph: 'aim', t: 0, lt: 0, life: 99, owner: f.i, hit: false, mv: f.move, ms: f.ms });
      tobLine(F, f, mv, c);
    },
    wind(F, f, o, mv, dt, c) {   // crouched, wiggling: turning (eased) the held way, else back at them
      const ln = mine(F, f, 'tobline'), want = c.mag > 0.3 ? c.dirA : Math.atan2(o.y - f.y, o.x - f.x);
      if (ln) turnEase(f, ln, want, mv.aimTurn, dt); else f.face = turnTo(f.face, want, mv.aimTurn * dt);
      tobLine(F, f, mv, c);
    },
    start(F, f, o, mv) {
      setPh(f, 'slide'); f.bnc = 0;
      const ln = mine(F, f, 'tobline'); if (ln) { ln.ph = 'go'; ln.lt = ln.t; tobLine(F, f, mv, F.ctl(f)); }   // (lt: when it locked, for the drawer's settle)
      F.ev('toboggan', f.x, f.y, 0.7, f.i, { move: 'move1' });
    },
    step(F, f, o, mv, dt, c) {
      const ln = mine(F, f, 'tobline');   // (steering, eased: the held way, else straight on)
      if (ln) { turnEase(f, ln, c.mag > 0.3 ? c.dirA : f.face, c.mag > 0.3 ? mv.steer * Math.max(0.3, aimMag(c.mag)) : mv.steer, dt); tobLine(F, f, mv, c); }
      else if (c.mag > 0.3) f.face = turnTo(f.face, c.dirA, mv.steer * dt);
      const sp = mv.speed * (onIce(F, f) ? mv.iceSpeed : 1);
      f.vx = Math.cos(f.face) * sp; f.vy = Math.sin(f.face) * sp;
      const pg = !f.hit && F.objs.find(p => p.kind === 'peng' && p.owner === o.i && p.ph !== 'wait' && p.t < p.life && D(p, f) <= f.r + p.r);
      if (pg) {   // (one of their penguins in the way: it takes the hit, the slide stops there)
        burst(F, pg, 'soak'); f.hit = true; f.vx *= 0.35; f.vy *= 0.35; setPh(f, 'skid'); F.go(f, 'recover', mv.recovery);
        const ln = mine(F, f, 'tobline'); if (ln) ln.life = ln.t;
        return;
      }
      if (!f.hit && o.z < 20 && !o.gone && D(f, o) <= f.r + o.r + mv.reach
        && F.hitF(f, o, mv, { dir: angMid(Math.atan2(o.y - f.y, o.x - f.x), f.face) })) {   // (pushed between the slide and the contact line; untouchable: on through)
        f.hit = true;
        if (f.state === 'strike') {   // it landed (or clinked off the ice: a stop all the same)
          f.vx *= 0.35; f.vy *= 0.35; setPh(f, 'skid'); F.go(f, 'recover', mv.recovery);
          const ln = mine(F, f, 'tobline'); if (ln) ln.life = ln.t;
        }
      }
    },
    end(F, f, o, mv) { belly(F, f, mv); return true; },   // (ran out: slides to a stop flat on his belly)
    wall(F, f, c) {
      const mv = kitMove(f), dx = Math.cos(f.face), dy = Math.sin(f.face), dn = dx * c.nx + dy * c.ny;
      if (dn > -0.35) { const vn = f.vx * c.nx + f.vy * c.ny; f.vx -= vn * c.nx; f.vy -= vn * c.ny; f.face = Math.atan2(dy - dn * c.ny, dx - dn * c.nx); return true; }   // (glancing: along it)
      if ((f.bnc || 0) < mv.bounces) {   // off the wall, once
        f.bnc = (f.bnc || 0) + 1; f.face = Math.atan2(dy - 2 * dn * c.ny, dx - 2 * dn * c.nx);
        F.ev('bounce', f.x - c.nx * f.r, f.y - c.ny * f.r, 0.6, f.i, { move: 'move1', nx: c.nx, ny: c.ny });
        return true;
      }
      f.vx *= 0.15; f.vy *= 0.15;
      F.ev('wall', f.x - c.nx * f.r, f.y - c.ny * f.r, 0.3, f.i, { nx: c.nx, ny: c.ny });
      belly(F, f, mv); return true;
    },
    phases: mv => [['crouch', 'wind', mv.startup, 'crouch', 'crouches and wiggles, turning; his line shows'], ['slide', 'strike', 'up to ' + mv.active, 'slide', `${mv.speed} u/s (x${mv.iceSpeed} on ice), steers ${mv.steer} rad/s, ${mv.bounces} wall bounce`],
      ['skid', 'recover', mv.recovery, 'slide', 'hit: skids to a stop'], ['belly', 'recover', mv.belly, 'belly', 'missed or stopped: flat, open']],
  },
  iceberg: {
    moves: true,
    press(F, f, o, mv, c) {
      setPh(f, 'leap');
      const toO = Math.atan2(o.y - f.y, o.x - f.x), d = Math.min(D(f, o), mv.far);   // (on them to start with, at most far away)
      const sh = spawn(F, { kind: 'shadow', x: f.x + Math.cos(toO) * d, y: f.y + Math.sin(toO) * d, z: 0, vx: 0, vy: 0, vz: 0, r: 12, R: mv.R, lock: 0, lt: 0, x0: f.x, y0: f.y, t: 0, life: 99, owner: f.i, hit: false, mv: f.move, ms: f.ms });
      keepAim(F, sh, mv.R * 0.3);
    },
    wind(F, f, o, mv, dt, c) { const sh = mine(F, f, 'shadow'); if (sh) aimShadow(F, f, sh, mv, dt, c); },
    start(F, f) {
      setPh(f, 'up'); f.air = 1; f.inv = Math.max(f.inv, 2 / 60);
      const sh = mine(F, f, 'shadow'); if (sh) { sh.x0 = f.x; sh.y0 = f.y; }
      F.ev('leap', f.x, f.y, 0.6, f.i, { move: 'move2' });
    },
    step(F, f, o, mv, dt, c) {
      f.inv = Math.max(f.inv, 2 / 60); f.vx = f.vy = 0; f.air = 1;
      const sh = mine(F, f, 'shadow'); if (!sh) return;
      const T = f.t, tDrop = f.dur - mv.drop;
      if (T < tDrop) aimShadow(F, f, sh, mv, dt, c); else if (!sh.lock) { sh.lock = 1; sh.lt = sh.t; sh.vx = sh.vy = 0; }   // (lt: when it locked)
      sh.r = 12 + (mv.R - 12) * Math.min(1, T / tDrop);
      if (T < mv.up) { setPh(f, 'up'); const u = T / mv.up; f.z = mv.high * u * u; f.x = sh.x0 + (sh.x - sh.x0) * u; f.y = sh.y0 + (sh.y - sh.y0) * u; }
      else if (T < tDrop) { setPh(f, 'high'); f.z = mv.high; f.x = sh.x; f.y = sh.y; }
      else { setPh(f, 'drop'); const u = Math.min(1, (T - tDrop) / mv.drop); f.z = mv.high * (1 - u * u); f.x = sh.x; f.y = sh.y; }
    },
    end(F, f, o, mv) {   // the landing: a shockwave ring floors everyone near (from above: no block), the floor freezes
      const sh = mine(F, f, 'shadow'), x = sh ? sh.x : f.x, y = sh ? sh.y : f.y;
      if (sh) sh.life = sh.t;
      f.x = x; f.y = y; f.z = 0; f.air = 0; f.inv = 0; f.vx = f.vy = 0;
      F.keepIn(f);
      spawn(F, { kind: 'shock', x, y, z: 0, vx: 0, vy: 0, vz: 0, r: 0, reach: mv.R + 10, t: 0, life: 0.3, owner: f.i, hit: true });
      spawn(F, { kind: 'ice', x, y, z: 0, vx: 0, vy: 0, vz: 0, r: mv.ice.r, grip: mv.ice.grip, t: 0, life: mv.ice.life, owner: f.i, hit: false });
      popPeng(F, x, y, mv.R + 10, f.i);
      const d = Math.hypot(o.x - x, o.y - y);
      let hit = false;
      if (o.state !== 'ko' && o.z < 30 && !o.gone && d - o.r * 0.5 <= mv.R)
        hit = F.hitF(f, o, mv, { dir: d > 2 ? Math.atan2(o.y - y, o.x - x) : f.face, obj: true, unblockable: true, noFlank: true, move: 'move2' }) && F.lastRes === 'hit';   // (off the ice: a miss)
      f.hit = hit;
      if (f.state === 'stagger') { F.ev('land', x, y, 1, f.i, { move: 'move2', hit }); F.ev('ice', x, y, 0.5, f.i, { move: 'move2' }); return true; }   // (onto their ice block: its shards stagger him)
      F.ev('land', x, y, 1, f.i, { move: 'move2', hit }); F.ev('ice', x, y, 0.5, f.i, { move: 'move2' });
      F.hitstop = Math.max(F.hitstop, 4 / 60);
      if (hit) { setPh(f, 'land'); F.go(f, 'recover', mv.recovery); }
      else { setPh(f, 'dizzy'); F.go(f, 'recover', mv.dizzy); F.ev('dizzy', x, y, 0.4, f.i, { move: 'move2' }); }
      return true;
    },
    phases: mv => [['leap', 'wind', mv.startup, 'leap', 'springs up; the shadow appears'], ['up', 'strike', mv.up, 'air', 'up out of shot, untouchable'],
      ['high', 'strike', Math.round((mv.active - mv.up - mv.drop) * 100) / 100, '(off screen)', `the shadow grows, moving ${mv.aimSpeed} u/s the held way`], ['drop', 'strike', mv.drop, 'flop', 'onto the shadow (it stops)'],
      ['land', 'recover', mv.recovery, 'land', `hit (everyone within R ${mv.R})`], ['dizzy', 'recover', mv.dizzy, 'dizzy', 'hit nothing: open']],
  },
  fork: {
    can(F, f) { return !F.objs.some(b => b.kind === 'peng' && b.owner === f.i && b.t < b.life); },
    press(F, f) { setPh(f, 'summon'); },
    start(F, f, o, mv) {
      setPh(f, 'fork');
      for (let k = 0; k < mv.n; k++) {
        const a = f.face + (k - (mv.n - 1) / 2) * 0.8, x = f.x + Math.cos(a) * (f.r + 4), y = f.y + Math.sin(a) * (f.r + 4);
        spawn(F, { kind: 'peng', x, y, z: 0, vx: 0, vy: 0, vz: 0, r: mv.r, a, ph: 'wait', pt: 0, wait: k * mv.wait, t: 0, life: mv.life + k * mv.wait, owner: f.i, hit: false });
      }
      F.ev('fork', f.x, f.y, 0.6, f.i, { move: 'move3' });
    },
    phases: mv => [['summon', 'wind', mv.startup, 'summon', 'flippers up: open'], ['fork', 'strike', mv.active, 'summon', `${mv.n} penguins pop out`], ['fork', 'recover', mv.recovery, 'summon', '']],
  },

  // ---------------------------------------------------------------- Duke
  portal: {
    moves: true,
    press(F, f) { setPh(f, 'spin'); },
    start(F, f, o, mv) {
      F.ev('vanish', f.x, f.y, 0.6, f.i, { move: 'move1' });
      const [x, y, a] = portalSpot(F, f, o, mv);
      setPh(f, 'gone'); f.gone = 1; f.inv = Math.max(f.inv, 2 / 60); f.vx = f.vy = 0;
      f.x = x; f.y = y; f.face = a;   // (there, out of sight: the camera frames the mark, and they turn to it)
      spawn(F, { kind: 'portal', x, y, z: 0, vx: 0, vy: 0, vz: 0, r: 20, a, ph: 'open', t: 0, life: mv.gone + mv.out + 0.2, owner: f.i, hit: false });
      F.ev('portal', x, y, 0.7, f.i, { move: 'move1' });
    },
    step(F, f, o, mv, dt) {
      const pt = mine(F, f, 'portal');
      f.vx = f.vy = 0;
      if (f.t < mv.gone) { f.gone = 1; f.inv = Math.max(f.inv, 2 / 60); if (pt) { f.x = pt.x; f.y = pt.y; f.face = pt.a; } return; }
      if (f.gone) { f.gone = 0; f.inv = 0; setPh(f, 'out'); if (pt) pt.ph = 'out'; F.ev('popout', f.x, f.y, 0.7, f.i, { move: 'move1' }); }
      if (f.ph === 'out') {   // out of it, a lunge at them (up to `lunge` units: walking off isn't enough, a step is)
        f.face = turnTo(f.face, Math.atan2(o.y - f.y, o.x - f.x), mv.outTurn * dt);
        const room = Math.max(0, D(f, o) - f.r - o.r - mv.reach * 0.4), v = Math.min(mv.lunge / mv.out, room / dt);
        f.vx = Math.cos(f.face) * v; f.vy = Math.sin(f.face) * v;
      }
      if (f.t < mv.gone + mv.out || f.ph === 'smash') return;
      f.vx = f.vy = 0;
      // the smash: two hands down in front of him
      setPh(f, 'smash');
      const fx = f.x + Math.cos(f.face) * (f.r + mv.reach * 0.5), fy = f.y + Math.sin(f.face) * (f.r + mv.reach * 0.5);
      let hit = false;
      if (o.z < 20 && !o.gone && F.reaches(f, o, mv, 2)) { f.hit = F.hitF(f, o, mv, { dir: angMid(Math.atan2(o.y - f.y, o.x - f.x), f.face) }); hit = f.hit && F.lastRes === 'hit'; }
      popPeng(F, fx, fy, mv.reach * 0.6 + 6, f.i);   // (and any penguin under his hands)
      F.ev('smash', fx, fy, hit ? 1 : 0.6, f.i, { move: 'move1', hit });
      if (f.state !== 'strike') return;
      if (hit) F.go(f, 'recover', mv.recovery); else stumble(F, f, mv);
    },
    end(F, f, o, mv) { f.gone = 0; f.inv = 0; stumble(F, f, mv); return true; },
    phases: mv => [['spin', 'wind', mv.startup, 'spin', 'spins and vanishes'], ['gone', 'strike', mv.gone, '(not drawn)', 'the mark shimmers behind them; untouchable'],
      ['out', 'strike', mv.out, 'smashup', 'pops out, arms overhead'], ['smash', 'strike', '1 frame', 'smash', `the slam: reach ${mv.reach}, ${mv.arc}°`],
      ['smash', 'recover', mv.recovery, 'smash', 'hit'], ['stumble', 'recover', mv.stumble, 'stumble', 'missed (or off the ice): open']],
  },
  stopworld: {
    press(F, f) { setPh(f, 'raise'); },
    wind(F, f, o, mv) {
      const tr = mv.raise * (f.dur / mv.startup);   // (gassed: every part slower)
      if (f.ph === 'raise' && f.t >= tr) {
        setPh(f, 'snap');
        spawn(F, { kind: 'ring', x: f.x, y: f.y, z: 0, vx: 0, vy: 0, vz: 0, r: 0, R: mv.R, ph: 'grow', t: 0, life: 99, owner: f.i, hit: false, mv: f.move, ms: f.ms });
        F.ev('snap', f.x, f.y, 0.8, f.i, { move: 'move2' });
      }
      const rg = mine(F, f, 'ring');
      if (rg && rg.ph === 'grow') { rg.x = f.x; rg.y = f.y; rg.r = mv.R * clamp((f.t - tr) / Math.max(1e-6, f.dur - tr), 0, 1); }
    },
    start(F, f, o, mv) {
      setPh(f, 'stop');
      const rg = mine(F, f, 'ring'); if (rg) { rg.r = mv.R; rg.ph = 'done'; rg.life = rg.t + 0.25; }
      popPeng(F, f.x, f.y, mv.R, f.i);
      if (D(f, o) <= mv.R && o.z < 30 && !o.gone && o.inv <= 0 && !['ko', 'down', 'getup', 'frozen'].includes(o.state)) {
        freezeF(F, o, mv, f.i); f.hit = true;
        F.ev('freeze', o.x, o.y, 1, f.i, { move: 'move2', to: o.i });
      } else F.ev('stopmiss', f.x, f.y, 0.4, f.i, { move: 'move2' });
    },
    end(F, f, o, mv) { F.go(f, 'recover', f.hit ? mv.recovery : mv.miss); return true; },
    phases: mv => [['raise', 'wind', mv.raise, 'snap', 'one arm up'], ['snap', 'wind', Math.round((mv.startup - mv.raise) * 100) / 100, 'snap', `the ring grows to ${mv.R} (hit him: it breaks)`],
      ['stop', 'strike', mv.active, 'snap', `inside: frozen ${mv.freeze} s`], ['stop', 'recover', `${mv.recovery} / ${mv.miss} missed`, 'snap', '']],
  },
  geyser: {
    can(F, f) { return !F.objs.some(b => b.kind === 'geyser' && b.owner === f.i && b.t < b.life); },
    press(F, f, o, mv, c) {
      setPh(f, 'throw');
      const g = spawn(F, { kind: 'geyser', x: o.x, y: o.y, z: 0, vx: 0, vy: 0, vz: 0, r: mv.r, ph: 'aim', pt: 0, px: f.x, py: f.y, pz: 0, sx: f.x, sy: f.y, t: 0, life: 99, owner: f.i, hit: false, mv: f.move, ms: f.ms });   // (on them to start with)
      clampMark(F, f, g, mv);
    },
    wind(F, f, o, mv, dt, c) {
      const g = mine(F, f, 'geyser'); if (!g) return;
      aimMove(g, f.rel ? null : c, mv.aimSpeed, f.rel ? mv.aimEase * 0.5 : mv.aimEase, dt);   // (let go: it settles at once)
      clampMark(F, f, g, mv);
      f.face = Math.atan2(g.y - f.y, g.x - f.x);
    },
    hold(F, f, o, mv) { return !f.rel && f.t < f.dur + mv.holdMax; },
    start(F, f) {
      setPh(f, 'toss');
      const g = mine(F, f, 'geyser');
      if (g) { g.ph = 'fly'; g.pt = 0; g.vx = g.vy = 0; g.sx = g.px = f.x + Math.cos(f.face) * f.r; g.sy = g.py = f.y + Math.sin(f.face) * f.r; g.pz = 28; }
      F.ev('throw', f.x, f.y, 0.5, f.i, { move: 'move3' });
    },
    phases: mv => [['throw', 'wind', `${mv.startup} (+ up to ${mv.holdMax} held)`, 'throw', 'the mark shows; held, it moves'], ['toss', 'strike', mv.active, 'toss', 'the pot leaves'], ['toss', 'recover', mv.recovery, 'toss', 'open'],
      ['(the pot)', '', `${mv.flight} + ${mv.brew} + ${mv.erupt}`, '', `flies, brews, erupts (r ${mv.r}), then a puddle`]],
  },

  // ---------------------------------------------------------------- the evades (the fourth key: fight.js 'evade')
  // Tux's Ice Block: frozen into a block of ice, untouchable (hits clink off: fight.js hitF) and rooted, then the crack
  iceblock: {
    moves: true,
    start(F, f) { setPh(f, 'iceblock'); f.vx = f.vy = 0; f.inv = Math.max(f.inv, 2 / 60); F.ev('iceblock', f.x, f.y, 0.6, f.i, { move: 'evade' }); },
    step(F, f) { f.vx = f.vy = 0; f.inv = Math.max(f.inv, 2 / 60); },
    end(F, f, o, mv) { f.inv = 0; setPh(f, 'crack'); F.go(f, 'recover', mv.recovery); F.ev('crack', f.x, f.y, 0.5, f.i, { move: 'evade' }); return true; },
    // a hit clinked off it (fight.js hitF; d in the ice, a the hitter): it shatters outward. Tux is out at once (a short
    // shake-off, untouchable, no crack); the hitter, within mv.shatter of him (edge to edge), is staggered by the shards
    clinked(F, a, d) {
      const mv = d.stats.moves.evade, dist = D(a, d), near = a !== d && a.state !== 'ko' && !a.gone && a.z < 30 && dist - a.r - d.r <= mv.shatter;
      setPh(d, 'shatter'); F.go(d, 'recover', mv.shatterRec); d.inv = Math.max(d.inv, mv.shatterRec); d.vx = d.vy = 0;
      F.ev('shatter', d.x, d.y, 0.7, d.i, { move: 'evade', to: a.i, stag: near });
      if (!near) return;
      const ang = dist > 1 ? Math.atan2(a.y - d.y, a.x - d.x) : a.face + Math.PI;
      F.release(a); a.move = null; a.charge = 0; a.ph = ''; a.gone = 0; a.air = 0; a.z = 0; a.inv = 0; a.hit = true;
      a.vx = Math.cos(ang) * mv.shatterKb; a.vy = Math.sin(ang) * mv.shatterKb;
      F.go(a, 'stagger', mv.stagger);
    },
    phases: mv => [['iceblock', 'strike', mv.active, 'iceblock', 'in the ice: untouchable, rooted'], ['crack', 'recover', mv.recovery, 'crack', 'the ice cracks: open'],
      ['shatter', 'recover', mv.shatterRec, 'burst', `hit: it shatters, the hitter (within ${mv.shatter}) staggered ${mv.stagger} s`]],
  },
  // Duke's Garbage Collect: a blink the held way (none held: away from them), untouchable for the blink; a charge a go
  gc: {
    moves: true,
    can(F, f) { return f.ev >= 1; },
    start(F, f, o, mv) {
      f.ev -= 1; if (f.evT <= 0) f.evT = mv.recharge;
      setPh(f, 'blinkout'); f.vx = f.vy = 0; f.inv = Math.max(f.inv, 2 / 60);
      const c = F.ctl(f), a = c.mag > 0.3 ? c.dirA : Math.atan2(f.y - o.y, f.x - o.x);
      let x = f.x + Math.cos(a) * mv.dist, y = f.y + Math.sin(a) * mv.dist;
      for (let k = 0; k < 24 && (F.contactsAll(x, y, f.r).length || Math.hypot(o.x - x, o.y - y) < f.r + o.r); k++) { x -= Math.cos(a) * mv.dist / 24; y -= Math.sin(a) * mv.dist / 24; }   // (not into a wall or onto them)
      f.bx = x; f.by = y; f.face = a;
      F.ev('blink', f.x, f.y, 0.5, f.i, { move: 'evade', x2: x, y2: y });
    },
    step(F, f, o, mv) {
      f.vx = f.vy = 0; f.inv = Math.max(f.inv, 2 / 60);
      if (f.ph === 'blinkout' && f.t >= mv.active / 2) { f.x = f.bx; f.y = f.by; setPh(f, 'blinkin'); }
    },
    end(F, f, o, mv) { f.inv = 0; if (f.ph === 'blinkout') { f.x = f.bx; f.y = f.by; } setPh(f, 'blinkin'); F.go(f, 'recover', mv.recovery); return true; },
    phases: mv => [['blinkout', 'strike', mv.active / 2, 'blinkout', 'vanishing: untouchable'], ['blinkin', 'strike', mv.active / 2, 'blinkin', `there (${mv.dist} the held way): untouchable`],
      ['blinkin', 'recover', mv.recovery, 'blinkin', `back: open (${mv.charges} charges, each back ${mv.recharge} s after it's spent)`]],
  },

  // ---------------------------------------------------------------- Gopher
  dig: {
    moves: true,
    start(F, f) { f.under = 1; F.ev('dig', f.x, f.y, 0.5, f.i, { move: 'special' }); },
    step(F, f, o, mv, dt, c) {
      f.under = 1; f.inv = Math.max(f.inv, 2 / 60);
      // underground: toward the held direction, else homing in on them
      const toO = Math.atan2(o.y - f.y, o.x - f.x);
      f.face = turnTo(f.face, c.mag > 0.3 && f.stats && F.cfg.bots[f.i] == null ? c.dirA : toO, mv.steer * dt);
      f.vx = Math.cos(f.face) * mv.speed; f.vy = Math.sin(f.face) * mv.speed;
      if (f.t > 0.12 && Math.hypot(o.x - f.x, o.y - f.y) < 8 + o.r * 0.5 && o.z < 12) KITS.dig.pop(F, f, o, mv);
    },
    end(F, f, o, mv) { KITS.dig.pop(F, f, o, mv); return true; },
    pop(F, f, o, mv) {   // up out of the ground: whoever is over him goes down (from the way he came: a dig round them flanks)
      f.under = 0; f.inv = 0; f.vx *= 0.2; f.vy *= 0.2;
      F.ev('popup', f.x, f.y, 0.7, f.i, { move: 'special' });
      const d = Math.hypot(o.x - f.x, o.y - f.y);
      if (d <= f.r + o.r + mv.reach && o.z < 14) { f.hit = true; F.hitF(f, o, mv, { dir: d > 2 ? Math.atan2(o.y - f.y, o.x - f.x) : f.face, from: f.face + Math.PI, obj: true, move: 'special' }); }
      F.go(f, 'recover', mv.recovery);
    },
  },
  swarm: {
    start(F, f, o, mv) {   // a fan of little gophers from his feet, a few frames apart
      for (let k = 0; k < mv.n; k++) {
        const u = mv.n > 1 ? k / (mv.n - 1) - 0.5 : 0, a = f.face + u * 1.3, side = f.face + (u < 0 ? -1 : 1) * Math.PI / 2;
        spawn(F, { kind: 'gorou', x: f.x + Math.cos(side) * Math.abs(u) * 18 + Math.cos(a) * (f.r + 4), y: f.y + Math.sin(side) * Math.abs(u) * 18 + Math.sin(a) * (f.r + 4), z: 0,
          vx: Math.cos(a) * mv.speed, vy: Math.sin(a) * mv.speed, vz: 0, r: mv.r, t: 0, wait: (k % 3) * 0.07 + (k > 2 ? 0.05 : 0), life: mv.life, owner: f.i, hit: false });
      }
    },
  },

  // ---------------------------------------------------------------- Ferris
  counter: {
    start(F, f) { F.ev('stance', f.x, f.y, 0.4, f.i, { move: 'special' }); },
    // a hit (from a, with move mv) on Ferris holding the stance, from in front: blocked whole, and pinched back if a is in reach
    catch(F, a, d, mv, opt) {
      const cm = d.stats.moves.special, dist = Math.hypot(a.x - d.x, a.y - d.y);
      F.ev('borrow', d.x, d.y, 0.8, d.i, { move: 'special', to: a.i });
      F.hitstop = Math.max(F.hitstop, 6 / 60);
      d.hit = true; d.face = Math.atan2(a.y - d.y, a.x - d.x);
      F.go(d, 'recover', 0.2);
      if (a !== d && a.state !== 'ko' && a.state !== 'grabbed' && dist - a.r - d.r <= cm.reach && a.z < 20) {
        if (a.move === 'super' && a.state === 'wind') a.meter = 1;
        F.hitF(d, a, cm, { dir: d.face, unblockable: true, obj: true, noFlank: true, move: 'special', dmgMul: 1 + cm.back * (mv.damage || 0) / cm.damage });
      }
      return true;
    },
  },
  own: {
    start(F, f, o, mv) {
      F.ev('own', o.x, o.y, 0.8, f.i, { move: 'super', to: o.i });
      if (o.state === 'ko') return;
      f.meter = Math.min(1, (o.meter || 0) * mv.keep); o.meter = 0; o.lockT = mv.lock;   // (he keeps a share of what he borrows)
      if (Math.hypot(o.x - f.x, o.y - f.y) <= mv.range && o.z < 10 && o.state !== 'grabbed' && o.state !== 'frozen') {
        F.release(o); o.move = null; o.charge = 0; o.vx *= 0.3; o.vy *= 0.3; F.go(o, 'dizzy', mv.dizzy);
      }
    },
  },

  // ---------------------------------------------------------------- Pyth
  coil: {
    step(F, f, o, mv) {
      if (f.hit) return;
      const d = Math.hypot(o.x - f.x, o.y - f.y) - f.r - o.r, a = Math.atan2(o.y - f.y, o.x - f.x);
      if (d <= mv.reach && Math.abs(angDiff(a, f.face)) <= mv.arc * D2R / 2 + Math.atan2(o.r, Math.max(d + f.r + o.r, 1)) && o.z < 10 && o.inv <= 0 && o.hold < 0
        && (GRABBABLE.has(o.state) || armorOf(o, 3) || countering(o)) && blockedAt(F, f.x, f.y, o.x, o.y, 1) == null) {
        if (o.move === 'super' && o.state === 'wind') o.meter = 1;
        F.release(o); o.move = null; o.charge = 0;
        f.hold = o.i; o.hold = f.i; o.vx = o.vy = 0; f.hit = true;
        f.gd0 = d + f.r + o.r; f.thr = 'special';
        F.go(o, 'grabbed'); F.go(f, 'grab', mv.hold); f.vx = f.vy = 0; f.face = a;
        F.ev('coil', o.x, o.y, 0.6, f.i, { move: 'special', to: o.i });
      }
    },
  },
  lift: {
    start(F, f, o, mv) {
      if (['ko', 'frozen', 'grabbed', 'down', 'getup'].includes(o.state) || o.under || Math.hypot(o.x - f.x, o.y - f.y) > mv.range) { F.ev('whiff', f.x, f.y, 0.3, f.i, { move: 'super' }); return; }
      F.release(o);
      if (o.move === 'super' && o.state === 'wind') o.meter = 1;
      o.move = null; o.charge = 0; o.vz = 0; o.vx *= 0.3; o.vy *= 0.3; o.floatH = mv.h;
      F.go(o, 'float', mv.float);
      F.ev('lift', o.x, o.y, 0.8, f.i, { move: 'super', to: o.i });
    },
  },

  // ---------------------------------------------------------------- Octo
  pull: {
    start(F, f, o, mv) {
      spawn(F, { kind: 'tentacle', x: f.x, y: f.y, z: 0, vx: 0, vy: 0, vz: 0, r: 0, a: f.face, len: 0, reach: mv.reach + f.r, t: 0, life: mv.active + 0.26, owner: f.i, hit: false, caught: -1 });
    },
  },
  spin: {
    moves: true,
    start(F, f) { f.tick = 0; F.ev('spin', f.x, f.y, 0.7, f.i, { move: 'super' }); },
    step(F, f, o, mv, dt) {
      const toO = Math.atan2(o.y - f.y, o.x - f.x);
      f.vx = Math.cos(toO) * mv.speed; f.vy = Math.sin(toO) * mv.speed;
      f.tick -= dt;
      if (f.tick <= 0) { f.tick += mv.tick; KITS.spin.hit(F, f, o, mv, mv.hit); }
    },
    end(F, f, o, mv) { KITS.spin.hit(F, f, o, mv, mv.last); f.vx *= 0.3; f.vy *= 0.3; return false; },
    hit(F, f, o, mv, sub) {
      if (o.z > 20 || Math.hypot(o.x - f.x, o.y - f.y) - f.r - o.r > mv.reach) return;
      if (F.hitF(f, o, sub, { dir: Math.atan2(o.y - f.y, o.x - f.x), move: 'super' })) f.hit = true;
    },
  },

  // ---------------------------------------------------------------- Docky
  crate: {
    start(F, f, o, mv) {
      const mine = F.objs.filter(b => b.kind === 'crate' && b.owner === f.i && !b.sup);
      if (mine.length >= mv.max) { const old = mine[0]; old.life = old.t; F.ev('poof', old.x, old.y, 0.4, f.i, { move: 'special' }); }
      let x = f.x + Math.cos(f.face) * mv.dist, y = f.y + Math.sin(f.face) * mv.dist;
      // (not into the wall or a pillar: back toward him until it fits)
      for (let k = 0; k < 8 && !fits(F, x, y, mv.size / 2); k++) { x -= Math.cos(f.face) * 6; y -= Math.sin(f.face) * 6; }
      dropCrate(F, f.i, x, y, mv, 'special', 0);
    },
  },
  compose: {
    start(F, f, o, mv) {
      for (let k = 0; k < mv.n; k++) spawn(F, { kind: 'crate', shape: 'box', x: o.x, y: o.y, w: mv.size, h: mv.size, r: 3, tall: 30, z: 999, vx: 0, vy: 0, vz: 0,
        t: 0, wait: k * mv.every, aimed: 0, fall: mv.fall, life: k * mv.every + mv.fall + mv.life, owner: f.i, hit: false, sup: 1, mk: 'super', by: -1, k });
    },
  },

  // ---------------------------------------------------------------- Swifty
  dive: {
    moves: true,
    start(F, f) { F.ev('dive', f.x, f.y, 0.6, f.i, { move: 'special' }); },
    step(F, f, o, mv, dt, c) {
      if (c.mag > 0.3) f.face = turnTo(f.face, c.dirA, mv.steer * dt);
      f.vx = Math.cos(f.face) * mv.speed; f.vy = Math.sin(f.face) * mv.speed;
      f.z = Math.sin(Math.PI * Math.min(1, f.t / mv.active)) * mv.hopH;
      if (!f.hit && o.z < 20 && Math.hypot(o.x - f.x, o.y - f.y) <= f.r + o.r + mv.reach) {
        f.hit = true;
        F.hitF(f, o, mv, { dir: angMid(Math.atan2(o.y - f.y, o.x - f.x), f.face) });
        if (f.state === 'strike') { f.vx *= 0.3; f.vy *= 0.3; f.z = 0; F.go(f, 'recover', mv.recovery); }
      }
    },
    end(F, f) { f.z = 0; return false; },
    wall(F, f, c) {
      if (Math.cos(f.face) * c.nx + Math.sin(f.face) * c.ny >= -0.5) return false;
      f.vx *= 0.2; f.vy *= 0.2; f.z = 0; F.go(f, 'recover', kitMove(f).recovery);
      F.ev('wall', f.x - c.nx * f.r, f.y - c.ny * f.r, 0.2, f.i, { nx: c.nx, ny: c.ny });
      return true;
    },
  },
  chain: {   // n dives, each homing; between them a short hover (gap) to turn round
    moves: true,
    start(F, f, o, mv) { f.seg = 0; f.face = Math.atan2(o.y - f.y, o.x - f.x); F.ev('dive', f.x, f.y, 0.6, f.i, { move: 'super' }); },
    step(F, f, o, mv, dt) {
      const gap = f.seg > 0 ? mv.gap : 0, t = f.t - gap;
      if (t < 0) {   // hovering: slow, turn to them
        const k = Math.exp(-10 * dt); f.vx *= k; f.vy *= k; f.z = Math.max(0, f.z - 120 * dt);
        f.face = turnTo(f.face, Math.atan2(o.y - f.y, o.x - f.x), 14 * dt); return;
      }
      if (o.state !== 'ko') f.face = turnTo(f.face, Math.atan2(o.y - f.y, o.x - f.x), mv.turn * dt);
      f.vx = Math.cos(f.face) * mv.speed; f.vy = Math.sin(f.face) * mv.speed;
      f.z = Math.sin(Math.PI * Math.min(1, t / mv.active)) * 14;
      if (!f.hit && o.z < 20 && Math.hypot(o.x - f.x, o.y - f.y) <= f.r + o.r + mv.reach) {
        f.hit = true;
        const last = f.seg >= mv.n - 1;
        F.hitF(f, o, last ? mv.last : mv.hit, { dir: angMid(Math.atan2(o.y - f.y, o.x - f.x), f.face), move: 'super' });
        if (f.state === 'strike') KITS.chain.next(F, f, mv);
      }
    },
    end(F, f, o, mv) { return KITS.chain.next(F, f, mv); },
    wall(F, f, c) {
      if (Math.cos(f.face) * c.nx + Math.sin(f.face) * c.ny >= -0.3) return false;
      f.vx *= 0.2; f.vy *= 0.2;
      F.ev('wall', f.x - c.nx * f.r, f.y - c.ny * f.r, 0.2, f.i, { nx: c.nx, ny: c.ny });
      KITS.chain.next(F, f, kitMove(f));
      return true;
    },
    next(F, f, mv) {   // the next dive, or done
      f.seg = (f.seg || 0) + 1; f.hit = false;
      if (f.seg >= mv.n) { f.z = 0; f.vx *= 0.3; f.vy *= 0.3; F.go(f, 'recover', mv.recovery); return true; }
      F.go(f, 'strike', mv.gap + mv.active); F.ev('dive', f.x, f.y, 0.5, f.i, { move: 'super' });
      return true;
    },
  },

  // ---------------------------------------------------------------- Cpp
  blink: {
    start(F, f, o, mv) {
      const inp = F.inp[f.i], m = Math.hypot(inp.x, inp.y), a = m > 0.3 ? Math.atan2(inp.y, inp.x) : Math.atan2(o.y - f.y, o.x - f.x);   // (the way he holds, else at them)
      let x = f.x + Math.cos(a) * mv.dist, y = f.y + Math.sin(a) * mv.dist;
      // landing on them: right past them instead (a cross-up)
      const [sd0, along] = segDist(o.x, o.y, f.x, f.y, x, y);
      if (sd0 < f.r + o.r && along > 0.15) { const p = Math.hypot(o.x - f.x, o.y - f.y) + f.r + o.r + 4; x = f.x + Math.cos(a) * Math.max(mv.dist, p); y = f.y + Math.sin(a) * Math.max(mv.dist, p); }
      for (let k = 0; k < 24 && (!fits(F, x, y, f.r) || Math.hypot(o.x - x, o.y - y) < f.r + o.r); k++) { x -= Math.cos(a) * 6; y -= Math.sin(a) * 6; }
      if (!fits(F, x, y, f.r)) { x = f.x; y = f.y; }
      F.ev('blink', f.x, f.y, 0.5, f.i, { move: 'special', x2: x, y2: y, face: f.face });
      f.x = x; f.y = y; f.vx = f.vy = 0; f.inv = Math.max(f.inv, mv.active + 0.03); f.face = Math.atan2(o.y - y, o.x - x);
    },
  },
  ub: {
    start(F, f, o, mv) {
      const k = Math.min(3, Math.floor(F.rngs[2]() * 4)), d = Math.hypot(o.x - f.x, o.y - f.y), dir = Math.atan2(o.y - f.y, o.x - f.x);
      F.ev('ub', f.x, f.y, 1, f.i, { move: 'super', ub: k, to: o.i, x2: o.x, y2: o.y });
      if (o.state === 'ko') return;
      if (k === 0) {   // segfault: they crash
        F.hitF(f, o, mv.seg, { dir, obj: true, unblockable: true, noFlank: true, move: 'super' });
        if (o.hp > 0 && o.state === 'hurt') { o.vx *= 0.2; o.vy *= 0.2; F.go(o, 'dizzy', mv.seg.dizzy); }
      } else if (k === 1) {   // stack overflow: a blast round him
        if (d - o.r <= mv.boom.r && o.z < 30) F.hitF(f, o, mv.boom, { dir, obj: true, noFlank: true, move: 'super' });
      } else if (k === 2) {   // use after free: he and they swap places, and it hurts them
        const [x, y] = [f.x, f.y]; f.x = o.x; f.y = o.y; o.x = x; o.y = y; F.keepIn(f); F.keepIn(o);
        F.release(o); f.face = Math.atan2(o.y - f.y, o.x - f.x);
        F.hitF(f, o, mv.swap, { dir: f.face, obj: true, unblockable: true, noFlank: true, move: 'super' });
      } else {   // double free: both take a hit, they take more
        F.hitF(f, o, mv.dbl, { dir, obj: true, unblockable: true, noFlank: true, move: 'super' });
        f.hp = Math.max(1, f.hp - mv.dbl.self * F.dmgMul); f.flash = 0.15;
      }
    },
  },

  // ---------------------------------------------------------------- Bugdroid
  zap: {
    start(F, f, o, mv) {
      const a = f.face, x0 = f.x + Math.cos(a) * (f.r - 2), y0 = f.y + Math.sin(a) * (f.r - 2);
      let x1 = f.x + Math.cos(a) * (f.r + mv.reach), y1 = f.y + Math.sin(a) * (f.r + mv.reach);
      const bt = blockedAt(F, x0, y0, x1, y1); if (bt != null) { x1 = x0 + (x1 - x0) * bt; y1 = y0 + (y1 - y0) * bt; }
      const [dd] = segDist(o.x, o.y, x0, y0, x1, y1);
      const hit = dd <= o.r + mv.width / 2 && o.z < 20;
      spawn(F, { kind: 'beam', x: x0, y: y0, x2: hit ? o.x - Math.cos(a) * o.r * 0.4 : x1, y2: hit ? o.y - Math.sin(a) * o.r * 0.4 : y1, z: 0, vx: 0, vy: 0, vz: 0, r: 0, t: 0, life: mv.active + 0.06, owner: f.i, hit, k: F.oid % 7 });
      F.ev('zap', x1, y1, hit ? 0.8 : 0.4, f.i, { move: 'special' });
      if (hit && F.hitF(f, o, mv, { dir: a, obj: true, move: 'special' }) && o.hp > 0 && o.state === 'hurt' && o.t === 0) {
        o.vx *= 0.3; o.vy *= 0.3; F.go(o, 'dizzy', mv.stun * comboScale(o.combo)); f.hit = true;
      }
    },
  },
  field: {
    start(F, f, o, mv) {
      let x = o.x, y = o.y;
      if (Math.hypot(o.x - f.x, o.y - f.y) > 260) { x = f.x + Math.cos(f.face) * 120; y = f.y + Math.sin(f.face) * 120; }
      spawn(F, { kind: 'field', x, y, z: 0, vx: 0, vy: 0, vz: 0, r: mv.r, t: 0, life: mv.life, owner: f.i, hit: false });
      F.ev('field', x, y, 0.8, f.i, { move: 'super' });
    },
  },
};

// a body of radius r fits at (x, y): no wall, solid or container in the way
function fits(F, x, y, r) { return !F.contactsAll(x, y, r).length; }
function dropCrate(F, owner, x, y, mv, mk, wait) {
  return spawn(F, { kind: 'crate', shape: 'box', x, y, w: mv.size, h: mv.size, r: 3, tall: 30, z: 70, vx: 0, vy: 0, vz: 0, t: 0, wait, aimed: 1, fall: mv.fall,
    life: wait + mv.fall + mv.life, owner, hit: false, sup: 0, mk, by: -1 });
}
// shove a container that f's melee move mv reaches (Docky's, or anyone's): it slides off the way they hit it
export function shoveCrate(F, f, mv, mul = 1) {
  for (const ob of F.objs) {
    if (ob.kind !== 'crate' || ob.z > 0) continue;
    const [d] = sd(ob, f.x, f.y), a = Math.atan2(ob.y - f.y, ob.x - f.x);
    if (d - f.r > (mv.reach || 0) + 2 || Math.abs(angDiff(a, f.face)) > (mv.arc || 90) * D2R / 2 + 0.4) continue;
    const sv = F.f[ob.owner].stats.moves.special.shove || { v: 330 }, v = sv.v * mul / (ob.sup ? 1.2 : 1);
    ob.vx = Math.cos(f.face) * v; ob.vy = Math.sin(f.face) * v; ob.by = f.i; ob.hit = false;
    F.ev('shove', ob.x, ob.y, 0.6, f.i, { move: 'special' });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- the world objects
export const OBJ = {
  // ---------------------------------------------------------------- Tux and Duke's
  // the toboggan's line: gone once his crouch or slide is cut short
  tobline(F, ob, dt, own) { if (!sameGo(own, ob) || (own.state !== 'wind' && own.state !== 'strike')) ob.life = ob.t; },
  // the iceberg's shadow (fight-kits iceberg moves it): gone if he never left the ground
  shadow(F, ob, dt, own) { if (!sameGo(own, ob)) ob.life = ob.t; },
  shock(F, ob) { ob.r = ob.reach * Math.min(1, ob.t / 0.15); },   // (the landing's ring: only drawn, the hit was the landing)
  ice() {},
  portal() {},
  // a little penguin: out of Tux after its wait, popping out, waddling at them, then a belly slide into them
  peng(F, ob, dt, own, foe, M) {
    const mv = M.move3;
    ob.pt += dt;
    if (ob.ph === 'wait') { if (ob.t >= ob.wait) { ob.ph = 'pop'; ob.pt = 0; } return; }
    if (ob.t >= ob.life - 1e-9) { burst(F, ob, 'old'); return; }
    const dx = foe.x - ob.x, dy = foe.y - ob.y, d = Math.hypot(dx, dy) || 1;
    const open = foe.z < 12 && !foe.gone && foe.state !== 'ko';
    // a step into one kicks it to bits
    if (foe.state === 'step' && d <= ob.r + foe.r + 2) { burst(F, ob, 'popped'); return; }
    if (ob.ph === 'pop') {   // out of him, a hop forward
      ob.vx = Math.cos(ob.a) * mv.walk * 0.8; ob.vy = Math.sin(ob.a) * mv.walk * 0.8;
      if (ob.pt >= mv.popT) { ob.ph = 'waddle'; ob.pt = 0; }
    } else if (ob.ph === 'waddle') {
      if (foe.state !== 'ko') ob.a = turnTo(ob.a, Math.atan2(dy, dx), mv.turn * dt);
      ob.vx = Math.cos(ob.a) * mv.walk; ob.vy = Math.sin(ob.a) * mv.walk;
      if (d <= mv.slideAt && open) { ob.ph = 'slide'; ob.pt = 0; ob.a = Math.atan2(dy, dx); }
    } else if (ob.ph === 'slide') {
      ob.vx = Math.cos(ob.a) * mv.slideSpeed; ob.vy = Math.sin(ob.a) * mv.slideSpeed;
      if (ob.pt >= mv.slideT) { burst(F, ob, 'old'); return; }
    }
    ob.x += ob.vx * dt; ob.y += ob.vy * dt;
    const cs = F.contactsAll(ob.x, ob.y, ob.r);
    if (cs.length) {
      if (ob.ph === 'slide') { burst(F, ob, 'wall'); return; }
      for (const c of cs) { ob.x += c.nx * c.pen; ob.y += c.ny * c.pen; }   // (waddling: along the wall)
    }
    if (ob.ph === 'slide' && !ob.hit && open && foe.inv <= 0 && Math.hypot(foe.x - ob.x, foe.y - ob.y) <= ob.r + foe.r) {
      if (F.hitF(own, foe, mv, { dir: ob.a, obj: true, move: 'move3' })) { ob.hit = true; burst(F, ob, F.lastRes === 'hit' ? 'hit' : F.lastRes); }
    }
  },
  // Stop the World's ring: growing with Duke's snap (fight-kits stopworld); hit out of it, it breaks
  ring(F, ob, dt, own) {
    if (ob.ph === 'grow' && !(sameGo(own, ob) && own.state === 'wind')) { ob.ph = 'break'; ob.life = ob.t + 0.2; F.ev('ringbreak', ob.x, ob.y, 0.5, ob.owner, { move: 'move2' }); }
  },
  // the coffee geyser: the mark (while Duke aims), the pot flying, brewing, the eruption, then a puddle
  geyser(F, ob, dt, own, foe, M) {
    const mv = M.move3;
    ob.pt += dt;
    if (ob.ph === 'aim') { if (!(sameGo(own, ob) && own.state === 'wind')) ob.life = ob.t; return; }   // (hit out of his throw: no pot)
    if (ob.ph === 'fly') {
      const u = Math.min(1, ob.pt / mv.flight);
      ob.px = ob.sx + (ob.x - ob.sx) * u; ob.py = ob.sy + (ob.y - ob.sy) * u; ob.pz = 28 * (1 - u) + Math.sin(Math.PI * u) * 70;
      if (u >= 1) { ob.ph = 'brew'; ob.pt = 0; ob.pz = 0; F.ev('potland', ob.x, ob.y, 0.4, ob.owner, { move: 'move3' }); }
      return;
    }
    if (ob.ph === 'brew') {
      if (ob.pt >= mv.brew) { ob.ph = 'erupt'; ob.pt = 0; F.ev('erupt', ob.x, ob.y, 1, ob.owner, { move: 'move3' }); popPeng(F, ob.x, ob.y, ob.r + 6, ob.owner); }
      return;
    }
    // erupting: whoever's on it goes up (from below: no block), once
    const d = Math.hypot(foe.x - ob.x, foe.y - ob.y);
    if (!ob.hit && !(ob.ck > ob.pt) && foe.z < 30 && !foe.gone && foe.state !== 'ko' && d - foe.r * 0.5 <= ob.r) {
      if (F.hitF(own, foe, mv, { dir: d > 2 ? Math.atan2(foe.y - ob.y, foe.x - ob.x) : Math.atan2(foe.y - own.y, foe.x - own.x), obj: true, unblockable: true, noFlank: true, move: 'move3' })) ob.hit = true;   // (clinking off the ice shatters it: spent on it all the same)
    }
    if (ob.pt >= mv.erupt) {
      ob.life = ob.t;
      if (!F.A.solids.some(o => sd(o, ob.x, ob.y)[0] < 8)) spawn(F, { kind: 'puddle', x: ob.x, y: ob.y, z: 0, vx: 0, vy: 0, vz: 0, r: mv.puddle, t: 0, life: mv.puddleLife, owner: ob.owner, hit: false });
      F.ev('splash', ob.x, ob.y, 0.4, ob.owner, { move: 'move3' });
    }
  },
  puddle() {},

  // ---------------------------------------------------------------- the other eight's
  // a little gopher of the swarm: out after its wait, homing a little until it's hit them once, then on straight
  gorou(F, ob, dt, own, foe, M) {
    if (ob.t < ob.wait) return;
    const mv = M.super, dx = foe.x - ob.x, dy = foe.y - ob.y, d = Math.hypot(dx, dy) || 1;
    if (!ob.hit && foe.state !== 'ko') {
      const cur = Math.atan2(ob.vy, ob.vx), na = turnTo(cur, Math.atan2(dy, dx), 2.6 * dt);
      ob.vx = Math.cos(na) * mv.speed; ob.vy = Math.sin(na) * mv.speed;
    }
    ob.x += ob.vx * dt; ob.y += ob.vy * dt;
    if (!ob.hit && foe.z < 12 && d <= ob.r + foe.r && foe.inv <= 0 && foe.state !== 'grabbed') {
      ob.hit = true;
      F.hitF(own, foe, mv, { dir: Math.atan2(ob.vy, ob.vx), move: 'super', obj: true });
    } else if (F.contactsAll(ob.x, ob.y, ob.r).length) { ob.life = 0; F.ev('pop', ob.x, ob.y, 0.25, ob.owner, { move: 'super', gopher: 1 }); }
  },
  // Octo's tentacle: out along its angle over the move's active frames, catching them on the way, then back
  tentacle(F, ob, dt, own, foe, M) {
    const mv = M.special, act = mv.active;
    ob.x = own.x; ob.y = own.y;
    if (own.move !== 'special' && ob.caught < 0) { ob.life = Math.min(ob.life, ob.t + 0.12); ob.hit = true; }   // (Octo hit out of it: back it goes)
    if (!ob.hit) {
      ob.len = ob.reach * Math.min(1, ob.t / (act * 0.75));
      const x1 = ob.x + Math.cos(ob.a) * ob.len, y1 = ob.y + Math.sin(ob.a) * ob.len;
      const bt = blockedAt(F, ob.x + Math.cos(ob.a) * own.r, ob.y + Math.sin(ob.a) * own.r, x1, y1);
      const [dd] = segDist(foe.x, foe.y, ob.x, ob.y, x1, y1);
      if (bt != null) { ob.hit = true; F.ev('slap', x1, y1, 0.3, ob.owner, { move: 'special' }); }
      else if (dd <= foe.r + 4 && foe.z < 12 && foe.inv <= 0 && foe.state !== 'grabbed' && foe.state !== 'ko') {
        ob.hit = true; own.hit = true;
        const a = Math.atan2(own.y - foe.y, own.x - foe.x);
        if (F.hitF(own, foe, mv, { dir: a, from: a, obj: true, move: 'special' }) && foe.state === 'hurt' && foe.t === 0 && foe.hp > 0) {
          // yanked in: sliding to just in front of him, open for a moment
          const travel = Math.max(0, Math.hypot(own.x - foe.x, own.y - foe.y) - own.r - foe.r - 4);
          foe.vx = Math.cos(a) * travel * foe.stats.kbDecay; foe.vy = Math.sin(a) * travel * foe.stats.kbDecay;
          F.go(foe, 'hurt', mv.stagger); ob.caught = foe.i;
          F.ev('yank', foe.x, foe.y, 0.6, ob.owner, { move: 'special', to: foe.i });
        }
        ob.len = Math.hypot(foe.x - ob.x, foe.y - ob.y);
      } else if (ob.t >= act) ob.hit = true;
      ob.t0 = ob.t;
    } else {
      // reeling in (the tip on whoever it caught while they slide in)
      if (ob.caught >= 0) { const c = F.f[ob.caught]; ob.a = Math.atan2(c.y - ob.y, c.x - ob.x); ob.len = Math.max(0, Math.hypot(c.x - ob.x, c.y - ob.y) - c.r * 0.3); }
      else ob.len = Math.max(0, ob.len - ob.reach * 6 * dt);
    }
  },
  beam() {},
  // a container: falling (after its wait: a shadow first, aimed then), landing (a hit on whoever is under it), then a
  // solid; shoved, it slides until it meets something, hitting whoever it runs into
  crate(F, ob, dt, own, foe, M) {
    const mv = M[ob.mk];
    if (ob.t < ob.wait) return;
    if (!ob.aimed) {   // docker compose: aimed now, just ahead of them, the later ones round them
      ob.aimed = 1;
      const a = F.rngs[2]() * TAU, r = ob.k ? mv.spread * (0.6 + 0.4 * F.rngs[2]()) : 0;
      let x = foe.x + foe.vx * 0.25 + Math.cos(a) * r, y = foe.y + foe.vy * 0.25 + Math.sin(a) * r;
      for (let k = 0; k < 10 && !fits(F, x, y, ob.w / 2 + 18); k++) { x += (-x) * 0.15; y += (-y) * 0.15; }   // (room left round it to stand)
      ob.x = x; ob.y = y; ob.z = 120;
    }
    if (ob.z > 0) {
      const u = clamp((ob.t - ob.wait) / ob.fall, 0, 1);
      ob.z = (ob.sup ? 120 : 70) * (1 - u * u);
      if (u >= 1) {
        ob.z = 0;
        F.ev('crate', ob.x, ob.y, ob.sup ? 0.8 : 0.6, ob.owner, { move: ob.mk });
        for (const f of F.f) {
          if (f.state === 'ko' || f.z > 20) continue;
          const [d, gx, gy] = sd(ob, f.x, f.y);
          if (d >= f.r) continue;
          if (f === foe) F.hitF(own, foe, mv, { dir: Math.atan2(gy, gx), obj: true, noFlank: true, move: ob.mk });
          if (f.state !== 'grabbed') F.keepIn(f);
        }
      }
      return;
    }
    const sp = Math.hypot(ob.vx, ob.vy);
    if (sp < 1) { ob.vx = ob.vy = 0; return; }
    ob.x += ob.vx * dt; ob.y += ob.vy * dt;
    const k = Math.exp(-3.2 * dt); ob.vx *= k; ob.vy *= k;
    // into a wall, a solid or another container: it stops dead with a thump
    const hitSolid = sd(F.A.bounds, ob.x, ob.y)[0] > -ob.w / 2 || F.A.solids.some(o => sd(o, ob.x, ob.y)[0] < ob.w / 2) || F.objs.some(o => o !== ob && o.kind === 'crate' && o.z <= 0 && Math.abs(o.x - ob.x) < (o.w + ob.w) / 2 && Math.abs(o.y - ob.y) < (o.h + ob.h) / 2);
    if (hitSolid) {
      ob.x -= ob.vx * dt; ob.y -= ob.vy * dt; ob.vx = ob.vy = 0;
      F.ev('wall', ob.x, ob.y, 0.35, -1, { nx: 0, ny: -1, crate: 1 }); return;
    }
    if (sp > 90 && ob.by >= 0) for (const f of F.f) {
      if (f.i === ob.by || f.state === 'ko' || f.z > 16 || ob.hit) continue;
      if (sd(ob, f.x, f.y)[0] < f.r + 1) {
        ob.hit = true;
        const by = F.f[ob.by], sv = F.f[ob.owner].stats.moves.special.shove;
        F.hitF(by, f, sv, { dir: Math.atan2(ob.vy, ob.vx), obj: true, move: 'special' });
        ob.vx *= 0.15; ob.vy *= 0.15;
      }
    }
  },
  // Bugdroid's Boot Loop: whoever stands in it (on the ground) long enough is stunned, then gets a moment's rest
  field(F, ob, dt, own, foe, M) {
    const mv = M.super;
    if (foe.state === 'ko' || foe.z > 6 || Math.hypot(foe.x - ob.x, foe.y - ob.y) > ob.r) { foe.fieldT = 0; return; }
    if (foe.fieldCd > 0 || ['grabbed', 'frozen', 'dizzy', 'float', 'down', 'getup'].includes(foe.state)) return;
    foe.fieldT += dt;
    if (foe.fieldT >= mv.dwell) {
      foe.fieldT = 0; foe.fieldCd = mv.stun + mv.immune;
      F.ev('jolt', foe.x, foe.y, 0.7, ob.owner, { move: 'super', to: foe.i });
      if (F.hitF(own, foe, mv, { dir: Math.atan2(foe.y - ob.y, foe.x - ob.x), obj: true, unblockable: true, noFlank: true, move: 'super' }) && foe.hp > 0 && foe.state === 'hurt') {
        foe.vx *= 0.2; foe.vy *= 0.2; F.go(foe, 'dizzy', mv.stun);
      }
    }
  },
};

// ---------------------------------------------------------------- the plug-in fighters' kits and objects (js/kits/<id>.js)
for (const p of PLUGINS) {
  for (const k in p.kits || {}) { if (KITS[k]) throw new Error(`fight kit '${k}' (${p.id}) is taken`); KITS[k] = p.kits[k]; }
  for (const k in p.objs || {}) { if (OBJ[k]) throw new Error(`fight object '${k}' (${p.id}) is taken`); OBJ[k] = p.objs[k]; }
}
