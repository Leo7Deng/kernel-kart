// Kernel Kart: a short signature of a fighter's kit (its stats and every move's numbers), so measured data (the select
// screen's matchups, js/fight-matchup-data.js) can tell whether it was measured on the kit that's in the game now. Any
// change to the fighter's FIGHTERS entry changes it. (Behaviour changed only in code, numbers untouched, won't show:
// re-measure that fighter by hand.) Words only (names, blurbs, tells, the select screen's tagline and difficulty) don't
// count: rewording a move doesn't make its numbers stale.
import { FIGHTERS } from './fight-chars.js';
const WORDS = new Set(['name', 'short', 'lang', 'role', 'blurb', 'tagline', 'difficulty', 'tell', 'answer', 'passive', 'balance']);
const flat = (k, v) => typeof v === 'function' || WORDS.has(k) ? undefined : v instanceof Set ? [...v].sort() : v instanceof Map ? [...v] : v;
export function kitSig(id) {
  const s = JSON.stringify(FIGHTERS[id] || null, flat) || '';
  let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
