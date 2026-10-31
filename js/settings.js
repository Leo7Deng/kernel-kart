// Player settings (menu > Settings), saved as kk-settings. No DOM, so fx.js and render.js can read it. All cosmetic or
// audio except drift (race-drift.js), handed to each race as it's made (cfg.drift; online the host's); off is the
// classic two-button game. look: 'classic', 'flat', 'racing', 'premium' (js/look.js; old 'bold' loads as 'flat').
// models3d / cars3d: 3D racers and cars (experiments, off by default, separate so riders and cars can be judged apart).
// mapArt: cover pictures on the map cards (js/art/covers.js). textSize: 'normal', 'large', 'xl' (menus and HUD).
export const DEFAULTS = { music: 1, sfx: 1, muted: false, shake: true, flashes: true, reduced: false, fps: false, drift: true, look: 'classic', models3d: false, cars3d: false, mapArt: false, textSize: 'normal' };
export const TEXT_SIZES = [['normal', 'Normal', 1], ['large', 'Large', 1.15], ['xl', 'Extra large', 1.3]];
export const textScale = () => (TEXT_SIZES.find(t => t[0] === settings.textSize) || TEXT_SIZES[0])[2];
export const settings = { ...DEFAULTS };
try {
  const s = JSON.parse(localStorage.getItem('kk-settings') || '{}');
  for (const k in DEFAULTS) if (typeof s[k] === typeof DEFAULTS[k]) settings[k] = s[k];
  for (const k of ['music', 'sfx']) settings[k] = Math.min(1, Math.max(0, settings[k]) || 0);
  if (settings.look === 'bold') settings.look = 'flat';
  if (!['classic', 'flat', 'racing', 'premium'].includes(settings.look)) settings.look = 'classic';
  if (!TEXT_SIZES.some(t => t[0] === settings.textSize)) settings.textSize = 'normal';
} catch (e) { }
export const saveSettings = () => { try { localStorage.setItem('kk-settings', JSON.stringify(settings)); } catch (e) { } };
