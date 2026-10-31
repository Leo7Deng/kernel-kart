// Kernel Kart: Fight mode's scripted move clips (the setup screen's, fight-moves.js draws them; test/fight.test.mjs checks
// every one lands). DOM-free. A clip is the real sim (js/fight.js) with a fixed seed and a scripted input timeline for
// the demonstrator (fighter 0) and the target (fighter 1: standing, blocking or attacking, as fits the move).
import { Fight } from './fight.js';
import { FIGHTERS, FIGHT_ORDER } from './fight-chars.js';

// ---------------------------------------------------------------- the scripted clips
// a clip (each fighter's own: FIGHTERS[id].clips[k], or the move's clip): where the two stand (x of each), how long it
// runs, the camera ({ x, y, w }: the width in units it shows), an optional set-up (set(F)), and the inputs over time for
// each, [from, to, input]: a for the one showing it, b for the other
export function script(id, k) {
  const St = FIGHTERS[id], M = St.moves;
  return (St.clips && St.clips[k]) || (M[k] && M[k].clip) || null;
}
export const other = id => FIGHT_ORDER.find(o => o !== id) || id;
export function fresh(c) {
  const F = new Fight({ ids: [c.id, other(c.id)], bots: [null, null], seed: 7, roundTime: 99 });
  F.phase = 'fight'; F.pt = 0;
  F.f.forEach((f, i) => { f.x = c.sc.x[i]; f.y = 0; f.face = i ? Math.PI : 0; f.hp = f.maxHp = Math.max(f.maxHp, 400); });
  if (c.sc.set) c.sc.set(F);
  c.F = F; c.t = 0;
}
export const inputAt = (tl, t) => { const o = { x: 0, y: 0, light: false, heavy: false, special: false, guard: false }; for (const [a, b, inp] of tl || []) if (t >= a && t < b) for (const k in inp) o[k] = typeof o[k] === 'boolean' ? !!inp[k] : inp[k]; return o; };

