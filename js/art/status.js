// Fight: how the shared poison status looks, on any fighter (Pyth's venom, Cpp's sludge). Cosmetic, called by draw-kits.js:
//   statusTint(F, v, f)       a sickly green-to-purple wash, pulsing
//   statusOver(g, F, v, f)    bubbles rising and popping, drips, mist at the feet (Pyth's venom bits, kit-pyth.js)
//   statusEvent(v, F, e, few) 'cure': a last breath of mist (sound 'fCure', returned by the poisoners' arts)
import { frnd, clamp } from '../core.js';
import { FIGHTERS } from '../fight-chars.js';
import { bit3, bits3, propReady, propsFor } from './prop3d.js';

for (const id of Object.keys(FIGHTERS)) propsFor(id, ['bit:pyvdrop', 'bit:pyvbub', 'bit:pyvmist']);
const A3 = a => clamp(a, 0, 1).toFixed(3);
// the view's own memory: when each fighter was last seen poisoned from (a fade in), spawn clocks
const MEM = new WeakMap();
const mem = v => { let m = MEM.get(v); if (!m) MEM.set(v, m = { on: {}, at: {} }); return m; };
const every = (v, key, dt) => { const m = mem(v).at; if (m[key] != null && v.t - m[key] < dt && v.t >= m[key]) return false; m[key] = v.t; return true; };
// how strongly the poison shows on f now (0..1): fading in over 0.15 s, out over its last half second
function amount(v, f) {
  const m = mem(v).on;
  if (!(f.psnT > 0) || f.state === 'ko') { m[f.i] = null; return 0; }
  if (m[f.i] == null || m[f.i] > v.t) m[f.i] = v.t;
  return clamp((v.t - m[f.i]) / 0.15, 0, 1) * clamp(f.psnT / 0.5, 0, 1);
}

export function statusTint(F, v, f) {
  const a = amount(v, f) * (0.3 + 0.1 * Math.sin(v.t * 9 + f.i));
  if (a <= 0.01) return null;
  return (o, w, h) => {
    const gr = o.createLinearGradient(0, h * 0.75, 0, h * 0.15);
    gr.addColorStop(0, `rgba(92,214,48,${A3(a * 1.2)})`); gr.addColorStop(0.5, `rgba(120,190,70,${A3(a * 0.75)})`); gr.addColorStop(1, `rgba(150,64,210,${A3(a * 1.05)})`);
    o.fillStyle = gr; o.fillRect(0, 0, w, h);
  };
}

const mist = (v, x, y, z, n, o = {}) => bits3(v, 'pyvmist', x, y, z, n, { speed: [10, 30], up: [10, 26], s: [3, 4.5], life: [0.6, 0.9], g: -10, drag: 2.2, grow: 1.3, fade: 'alpha', bo: 0, al: 0.6, sh: false, sp: 0, ...o });
export function statusOver(g, F, v, f) {
  const a = amount(v, f); if (a < 0.2 || !propReady('bit:pyvbub')) return;
  if (every(v, 'pb' + f.i, 0.13)) bit3(v, 'pyvbub', f.x + frnd(-0.85, 0.85) * f.r, f.y + frnd(3, f.r * 0.7), frnd(12, 38) + (f.z || 0), { dx: frnd(-6, 6), dy: frnd(-3, 3), dz: frnd(18, 34), g: -20, drag: 1.5, s: frnd(2.6, 3.8), life: frnd(0.55, 0.85), bo: 0, sh: false, few: true });
  if (every(v, 'pd' + f.i, 0.42)) bit3(v, 'pyvdrop', f.x + frnd(-0.7, 0.7) * f.r, f.y + frnd(3, f.r * 0.6), frnd(14, 24) + (f.z || 0), { dz: -5, g: 520, s: frnd(2.2, 2.8), life: 0.3, bo: 0, sh: false, few: true });
  if (every(v, 'pm' + f.i, 0.5)) mist(v, f.x + frnd(-6, 6), f.y, 6, 1, { speed: [4, 12], up: [6, 14], al: 0.35, few: true });
}

export function statusEvent(v, F, e, few) {
  if (e.kind !== 'cure') return false;
  if (propReady('bit:pyvmist')) mist(v, e.x, e.y, 26, few ? 1 : 3, { up: [20, 40], al: 0.45 });
  return true;
}
// the poison wearing off: a soft breath out, a little rising sparkle of relief (the poisoners' arts play it)
export const STATUS_SOUNDS = {
  fCure: ({ hiss, osc }) => (v, t) => { hiss(t, 0.3, 0.035 * v, 'lowpass', 1400, 500); osc(t + 0.05, 620, 0.18, 'sine', 0.03 * v, 360); },
};
