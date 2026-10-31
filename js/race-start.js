// Kernel Kart: the rocket start. Start holding the gas within ROCKET_WINDOW before GO (or ROCKET_LATE after) and you
// launch on a short boost; hold earlier and you burn out (wheels spin). Pressing later is a plain start. Bots do it too.
import { Math } from './detmath.js';   // deterministic maths, the same on every computer (detmath.js)
import { clamp, frnd } from './core.js';
import { Input } from './input.js';

export const ROCKET_WINDOW = 0.35;   // start holding within this long before GO...
export const ROCKET_LATE = 0.1;      // ...or this long after it: a rocket start
export const SPIN_T = 1.3;           // how long a burnout lasts: stuck dead for the first BLOWN s, then crawling off (accel cut, see updateCar)
export const BLOWN = 0.7;            // a burnout's dead-stop part (more punishing, and unmistakable)

export const startRules = {
  // every frame until just after GO. Before: when each player's hold began (c.gasAt: countdown left then, 0 = not
  // holding). At GO: launches. Just after: a player pressing right on the beat still gets a rocket.
  startUpdate() {
    if (!this.started) {
      for (const c of this.cars) if (c.human) { const held = Input.pressed[c.pIndex]; if (!held) c.gasAt = 0; else if (!c.gasAt) c.gasAt = Math.max(this.countdown, 1e-3); }
      return;
    }
    if (!this.goT) { this.goT = this.time; for (const c of this.cars) this.launch(c); return; }
    if (this.time - this.goT <= ROCKET_LATE) for (const c of this.cars) if (c.human && c.launchWait && Input.pressed[c.pIndex]) { c.launchWait = false; this.rocket(c); }
  },
  launch(c) {
    if (c.human) {
      const at = c.gasAt; c.gasAt = 0;
      if (!at) { c.launchWait = true; return; }   // not holding: there's still a moment to press
      if (at <= ROCKET_WINDOW) this.rocket(c);
      else this.wheelspin(c);   // held, but not in the window: a burnout
      return;
    }
    const sk = c.ai.skill, r = c.rng();
    if (r < clamp(0.2 + (sk - 0.92) * 3.2, 0.15, 0.8)) this.rocket(c);
    else if (r > 1 - clamp(0.12 - (sk - 0.92) * 0.8, 0.02, 0.12)) this.wheelspin(c);
  },
  // a launch: a kick of 0.45 s of the kart's own acceleration and its extra accel for 0.7 s, so it's worth the same
  // head start to a quick launcher as a slow one
  rocket(c) {
    c.boost = Math.max(c.boost, 0.7); c.launchB = 0.7; c.speed += c.acc * 0.45;   // launchB: no jump to boost speed (race.js), it's all your own acceleration
    this.fxBoost(c);
    const bx = c.x - Math.cos(c.heading) * c.L * 0.5, by = c.y - Math.sin(c.heading) * c.L * 0.5;
    for (let i = 0; i < 6; i++) this.particles.push({ kind: 'fire', x: bx, y: by, vx: -Math.cos(c.heading) * frnd(90, 180) + frnd(-30, 30), vy: -Math.sin(c.heading) * frnd(90, 180) + frnd(-30, 30), size: frnd(7, 12), life: frnd(0.3, 0.5), maxLife: 0.5, top: true });
    this.sound('rocket', c, c.human ? 1 : 0.5);
  },
  // held off the timing: a burnout in tyre smoke
  wheelspin(c) {
    c.wheelspin = SPIN_T; c.speed = 0; this.fxHit(c, '#ff7a1a', 'burnout');
    for (let i = 0; i < 18; i++) { const side = i % 2 ? 1 : -1, x = c.x - Math.cos(c.heading) * c.L * 0.4 - Math.sin(c.heading) * side * c.W * 0.45, y = c.y - Math.sin(c.heading) * c.L * 0.4 + Math.cos(c.heading) * side * c.W * 0.45; this.fxPuff(x, y, i % 3 ? '#d7d9e0' : '#8e9099', frnd(14, 26), frnd(0.9, 1.4), frnd(-70, 70) - Math.cos(c.heading) * 80, frnd(-70, 70) - Math.sin(c.heading) * 80); }
    for (const side of [-1, 1]) this.fxSparks(c.x - Math.cos(c.heading) * c.L * 0.42 - Math.sin(c.heading) * side * c.W * 0.45, c.y - Math.sin(c.heading) * c.L * 0.42 + Math.cos(c.heading) * side * c.W * 0.45, 7, '#ffb347', 170);
    this.fxRing(c.x, c.y, '#c8cad3', 46, 0.35, 5);   // everyone sees a burnout
    this.sound('wheelspin', c, c.human ? 0.7 : 0.4);
  },
};
