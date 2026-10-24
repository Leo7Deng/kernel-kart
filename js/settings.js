// Player settings (menu > Settings), saved in localStorage as kk-settings. No DOM here, so fx.js and render.js can read it.
// Everything is cosmetic or audio: nothing in a race's state reads these. One rule: drift (the drift button,
// race-drift.js), handed to each race as it's made (cfg.drift: ui.js, timetrial-ui.js; online the host's, net.js); off,
// the game is the classic two-button one. look: 'classic' (glossy), 'flat' (Classic Flat), 'racing' or 'premium' (js/look.js), drawing only; the old 'bold'
// (the Bold, Cartoon and Clean styles that came before) loads as 'flat'. models3d: the racers as turning 3D models in races
// (js/art/model3d.js), an experiment, off by default; cars3d: every racer's car in 3D (js/art/car3d.js), another, on its own so cars and riders can be judged apart. mapArt: the map screen's track cards show a cover
// picture of each map (js/art/covers.js) instead of its layout, an experiment, off by default. textSize: 'normal', 'large' or
// 'xl' (TEXT_SIZES): the menus' text (ui.js applyTextSize, the page's rem) and the race's HUD (render.js hudScale) bigger.
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
