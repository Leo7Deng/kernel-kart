// `&shot` in the URL (the menu, #fight=..., #demo=...): screenshot mode for headless Chrome (.claude/kk-tools/shoot.mjs).
// Under software GL the 3D warm-up stalls for many seconds, so here only what's drawn now is made (art/warm.js), Fight
// draws its models live and there's no boot screen. window.kkShotReady() is true once what's on screen is drawn.
export const SHOT = typeof location !== 'undefined' && /[#&]shot\b/.test(location.hash);
const checks = [() => document.fonts.status === 'loaded'];
export const shotWait = f => { if (SHOT) checks.push(f); };
if (SHOT) {
  if (window.kkLive === undefined) window.kkLive = true;
  window.kkShotReady = () => checks.every(f => { try { return !!f(); } catch (e) { return true; } });
}
