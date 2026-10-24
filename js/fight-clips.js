// Kernel Kart: Fight mode's scripted move clips (the setup screen's, fight-moves.js draws them; test/fight.test.mjs checks
// every one lands). DOM-free. A clip is the real sim (js/fight.js) with a fixed seed and a scripted input timeline for
// the demonstrator (fighter 0) and the target (fighter 1: standing, blocking or attacking, as fits the move).
import { ARENA, Fight } from './fight.js';
import { FIGHTERS, FIGHT_ORDER } from './fight-chars.js';

// ---------------------------------------------------------------- the scripted clips
// a clip: where the two stand (x of each), how long it runs, the camera ({ x, y, w }: the width in units it shows), an
// optional set-up, and the inputs over time for each: [from, to, input]
const P = (a, b, inp) => [a, b, inp];
const SPECIAL = {   // a special's clip, by its do (fight-kits.js): where the two stand, how long, the camera, and anything after the press
  slide: { x: [-110, 40], cam: { x: -20, w: 300 } },
  lob: { x: [-95, 75], cam: { x: -10, w: 290 } },
  dig: { x: [-100, 50], len: 2.6, cam: { x: -15, w: 300 } },
  counter: { x: [-26, 26], cam: { x: 0, w: 230 }, b: [P(0.55, 0.62, { light: 1 })] },
  coil: { x: [-80, 20], len: 2.8, cam: { x: -20, w: 260 } },
  pull: { x: [-90, 20], len: 2.6, cam: { x: -25, w: 270 }, more: [P(0.78, 0.83, { light: 1 }), P(0.95, 1, { light: 1 }), P(1.12, 1.17, { light: 1 }), P(1.29, 1.34, { light: 1 }), P(1.46, 1.51, { light: 1 })] },
  crate: { x: [-90, 70], len: 2.8, cam: { x: -10, w: 300 }, more: [P(0.95, 1.02, { light: 1 })] },
  dive: { x: [-120, 50], cam: { x: -25, w: 310 } },
  blink: { x: [-110, 40], cam: { x: -25, w: 280 }, more: [P(0.62, 0.68, { light: 1 }), P(0.85, 0.9, { light: 1 })] },
  zap: { x: [-70, 20], cam: { x: -20, w: 250 }, more: [P(0.78, 0.84, { heavy: 1 })] },
};
const SUPER = {
  clones: { x: [-60, 70] }, freeze: { x: [-60, 70] }, swarm: { x: [-90, 70], cam: { x: -5, w: 290 } }, own: { x: [-60, 50] },
  lift: { x: [-40, 40], len: 3, more: [P(0.6, 1.05, { x: 1 }), P(1.1, 1.15, { light: 1 }), P(1.3, 1.35, { light: 1 }), P(1.5, 1.55, { light: 1 }), P(1.95, 2.02, { heavy: 1 })] },
  spin: { x: [-30, 25], cam: { x: 0, w: 240 } }, compose: { x: [-80, 60], len: 3.4, cam: { x: 0, w: 290 } }, chain: { x: [-100, 60], len: 3, cam: { x: -10, w: 300 } },
  ub: { x: [-40, 30], cam: { x: 0, w: 260 } }, field: { x: [-70, 30], len: 3.2, cam: { x: -10, w: 260 } },
};
export function script(id, k) {
  const St = FIGHTERS[id], M = St.moves, R = ARENA.r, T = FIGHTERS[other(id)];   // (T: the one it's shown on)
  if (St.kit3) return (St.clips && St.clips[k]) || (M[k] && M[k].clip) || null;   // (Tux's and Duke's moves and evades: fight-chars.js's own clips)
  switch (k) {
    case 'light': { const n = St.chain || 3, gap = n > 3 ? 0.2 : 0.3, d = St.radius + T.radius + M.light1.reach * 0.35; return { x: [-d / 2, d / 2], len: 2.2, cam: { x: 0, w: 210 }, a: [...Array(n)].map((_, j) => P(0.25 + j * gap, 0.32 + j * gap, { light: 1 })) }; }
    case 'heavy': return { x: [-50, 34], len: 2.2, cam: { x: 0, w: 230 }, a: [P(0.3, 0.38, { heavy: 1 })] };
    case 'charge': return { x: [-50, 34], len: 2.8, cam: { x: 0, w: 240 }, a: [P(0.2, 1.25, { heavy: 1 })] };
    case 'special': { const c = SPECIAL[M.special.do] || SPECIAL.slide; return { x: c.x, len: c.len || 2.4, cam: c.cam, a: [P(0.3, 0.38, { special: 1 }), ...(c.more || [])], b: c.b }; }
    case 'super': { const c = SUPER[M.super.do] || SUPER.clones; return { x: c.x, len: c.len || 2.8, cam: c.cam || { x: 5, w: 260 }, set: F => { F.f[0].meter = 1; }, a: [P(0.3, 0.38, { special: 1 }), ...(c.more || [])] }; }
    case 'guard': { const d = St.radius + T.radius + (T.moves.light1 || { reach: 24 }).reach * 0.6; return { x: [-d / 2 - 1, d / 2 - 1], len: 2.8, cam: { x: -10, w: 240 }, a: [P(0.1, 1.45, { guard: 1 }), P(1.8, 1.9, { guard: 1, x: -1 })],
      b: [P(0.25, 0.32, { light: 1 }), P(0.5, 0.57, { light: 1 }), P(0.78, 0.85, { light: 1 }), P(1.85, 1.92, { light: 1 })] }; }
    // a step: round a blocker's shield to their side, and a jab there (a flank)
    case 'step': { const d = St.radius + T.radius + 30; return { x: [-d / 2 - 6, d / 2], len: 2.4, cam: { x: 0, y: -20, w: 250 }, a: [P(0.3, 0.4, { guard: 1, x: 0.5, y: -0.86 }), P(0.62, 0.68, { light: 1, x: 0.3, y: 1 }), P(0.8, 0.86, { light: 1, x: 0.3, y: 1 })], b: [P(0, 1.6, { guard: 1 })] }; }
    // a step attack: a step in and a lunging jab off it
    case 'lunge': { const d = St.radius + T.radius + M.light1.reach + 55; return { x: [-d / 2, d / 2], len: 2.2, cam: { x: 0, w: 260 }, a: [P(0.3, 0.4, { guard: 1, x: 1 }), P(0.42, 0.48, { light: 1, x: 1 })] }; }
  }
  return null;
}
export const other = id => FIGHT_ORDER.find(o => o !== id) || id;
export function fresh(c) {
  const F = new Fight({ ids: [c.id, other(c.id)], bots: [null, null], seed: 7, supers: true, roundTime: 99 });
  F.phase = 'fight'; F.pt = 0;
  F.f.forEach((f, i) => { f.x = c.sc.x[i]; f.y = 0; f.face = i ? Math.PI : 0; f.hp = f.maxHp = Math.max(f.maxHp, 400); });
  if (c.sc.set) c.sc.set(F);
  c.F = F; c.t = 0;
}
export const inputAt = (tl, t) => { const o = { x: 0, y: 0, light: false, heavy: false, special: false, guard: false }; for (const [a, b, inp] of tl || []) if (t >= a && t < b) for (const k in inp) o[k] = typeof o[k] === 'boolean' ? !!inp[k] : inp[k]; return o; };

