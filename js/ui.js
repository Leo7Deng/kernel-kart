// Kernel Kart: menus and results screen.
import { frontrunHTML } from './frontrun.js';   // the Front-runner meter under Show more (test/frontrun.mjs)
import { podiumFigure, turntable, turning } from './turntable.js';   // the results' winner and the podium's racers, live
import { drawCar, drawCarShadow, drawItemIcon, drawMascot } from './art.js';
import { sfx } from './audio.js';
import { BODIES, CHARACTERS, DKEYS, IKEYS, KEYS, ORD, PCOL, STAT_NUM, setKeys } from './core.js';
import { TEXT_SIZES, settings, saveSettings, textScale } from './settings.js';
import { VERSION, openChangelog, unseenCount } from './changelog.js';
import { Input } from './input.js';
import { onlinePending, onlinePodium, onlineResults } from './net-ui.js';
import { FAR_GAP, ITEMS, ITEM_ORDER, PACK_GAP, gapK, itemChances, placeChances } from './items/index.js';
import { Race } from './race.js';
import { resetTrackCache, warmRace3D } from './render.js';
import { bakesLeft } from './art/warm.js';
import { portrait3D } from './art/model3d.js';
import { clipOf } from './clip.js';
import { openClip } from './clip-ui.js';
import { TRACKS } from './tracks.js';
import { endTimeTrial, ghostLinkPending, openGhostLink, showTTResults, startTimeTrial } from './timetrial-ui.js';
import { logoSvg } from './art/logo.js';
import { coverReady, coverThumb, covers, warmCover } from './art/covers.js';
import { holdPainter, paint, painterOn, sooner } from './art/painter.js';
import { drawMini } from './art/pictures.js';
import { bgTrack } from './menu-bg.js';
import { menu, modeIcon, returnView, showView } from './menu.js';
import { LOOKS, bold, lookFonts, setLook } from './look.js';
import { noteRecent, raceKeys, touchKeys } from './qol.js';

// the Style setting (js/look.js) on the page: <html data-look="classic|flat|racing|premium"> picks the CSS (style.css,
// then look-flat.css for Classic Flat; Racing and Premium also get data-modern: look-modern.css, then their own file), and
// a look's fonts are only fetched once it's picked (every face asked for at once: the HUD draws with them on a canvas,
// which doesn't fetch a font by itself; once they're in, setLook again so sprites cached with a stand-in font redraw)
export function applyLook() {
  const de = document.documentElement, look = settings.look, F = lookFonts();
  de.dataset.look = look;
  if (look === 'racing' || look === 'premium') de.dataset.modern = ''; else delete de.dataset.modern;
  if (F && F.url && !document.getElementById('kk-fonts-' + look)) { const l = document.createElement('link'); l.id = 'kk-fonts-' + look; l.rel = 'stylesheet'; l.href = F.url;
    l.onload = () => { if (document.fonts) Promise.all(F.faces.map(f => document.fonts.load(f).catch(() => {}))).then(() => { if (settings.look === look) setLook(look); }); }; document.head.append(l); }
}
applyLook();
// the Text size setting: the page's root font size (the menus, the results, the room and the pause card are in rem; the
// browser's own text size still counts), and the race's HUD reads textScale itself (render.js hudScale)
export function applyTextSize() {
  const de = document.documentElement, k = textScale();
  de.style.fontSize = k === 1 ? '' : `${k * 100}%`; de.dataset.text = settings.textSize;
}
applyTextSize();


// ---------------------------------------------------------------- UI / menus
// what's on screen: the menu, a race, the results over a race that's still finishing behind them, or a cup's podium.
// cup: the cup being run (null in a single race); leaving for the menu abandons it.
export const game = { state: 'menu', race: null, cup: null, toMenu() {
  if (this.race && this.race.net) return this.race.net.quit();   // online (net.js): back to the room, or out of it
  if (this.race && this.race.tt && this.state === 'race') return endTimeTrial(this.race);   // a time trial: its results, with the laps so far
  this.state = 'menu'; this.race = null; showMenu(); } };
const ui = document.getElementById('ui');
let toastT = null;
export function toast(t) { let el = document.getElementById('toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#000c;color:#fff;padding:8px 16px;border-radius:10px;font-weight:700;z-index:9'; document.body.appendChild(el); } el.textContent = t; el.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => el.style.display = 'none', 1200); }

// the menu's choices, all saved in localStorage (kk-setup) and restored on the next visit. mode: 'single', 'cup', 'tt' (time
// trial: P1 alone on ttTrack, timetrial-ui.js) or 'online' (host or join a room, net-ui.js). cupTracks: your own cup, by
// track name; cupPick: the ready-made cup chosen (its name), '' for your own. netPick: your racer online (pre-picked in a
// room). learn: which How to play sections are open. cupMode and tt mirror mode, for anything still reading them.
export const MODES = ['single', 'cup', 'tt', 'online', 'fight'];
export const setup = { mode: 'single', humans: 1, picks: [0, 1, 2, 3], track: 0, ttTrack: 0, laps: 3, aiLevel: 1, bots: 3, active: 0, cupTracks: [], cupPick: '', netPick: -1, learn: {}, cupMode: false, tt: false, random: false, fightSupers: true, fightIds: ['tux', 'duke'], fightBots: [null, 1] };   // fight*: Fight mode's picks (fight-ui.js)   // random: a single race on a random track (picked at START)
try { Object.assign(setup, JSON.parse(localStorage.getItem('kk-setup') || '{}')); } catch (e) { }
const okTrack = i => Number.isInteger(i) && i >= 0 && i < TRACKS.length, okChar = i => Number.isInteger(i) && i >= 0 && i < CHARACTERS.length;
if (!okTrack(setup.track)) setup.track = 0;   // a saved pick from a track list that has since changed
if (!okTrack(setup.ttTrack)) setup.ttTrack = setup.track;
if (!Array.isArray(setup.picks) || setup.picks.length < 4 || !setup.picks.every(okChar)) setup.picks = [0, 1, 2, 3];   // racers removed since (two players may have the same racer)
if (!okChar(setup.netPick)) setup.netPick = setup.picks[0];
if (!MODES.includes(setup.mode)) setup.mode = setup.tt ? 'tt' : setup.cupMode ? 'cup' : 'single';   // saved before there was a mode
if (![1, 2, 3, 4].includes(setup.humans)) setup.humans = 1;
setup.active = Math.min(Math.max(0, setup.active | 0), setup.humans - 1);
if (![2, 3, 5].includes(setup.laps)) setup.laps = 3;
if (![0, 1, 2].includes(setup.aiLevel)) setup.aiLevel = 1;
if (!(setup.bots >= 0 && setup.bots <= 3)) setup.bots = 3;
if (!setup.learn || typeof setup.learn !== 'object') setup.learn = {};
export function setMode(m) { setup.mode = m; setup.cupMode = m === 'cup'; setup.tt = m === 'tt'; }
setMode(setup.mode);

// ---------------------------------------------------------------- cups
// 3 to 5 tracks back to back with the same racers, laps and bots, points per finishing place. The grid of each race after the
// first starts in reverse order of the standings (the leader at the back).
export const CUP_MIN = 3, CUP_MAX = 5;
export const trackByName = n => TRACKS.findIndex(t => t.name === n);
setup.cupTracks = [...new Set(Array.isArray(setup.cupTracks) ? setup.cupTracks : [])].filter(n => trackByName(n) >= 0).slice(0, CUP_MAX);   // tracks removed since
// the ready-made cups, each with its trophy's colour
// every track in exactly one themed cup, each building from a gentler track to a showpiece finale; then one longer
// all-stars cup of the signature mechanics. (The user asked to rethink them: the old ones had tracks twice, two not at all.)
export const PRESET_CUPS = [
  ['Coast Cup', '#3cc8dc', 'Merge Bay', 'Async Atoll', 'Sakura Stack', 'Crab Harbor'],              // waves and hurricanes, the koi canal, the crab
  ['Sun Cup', '#ffc93c', 'Cron Canyon', 'Ruby Ruins', "Pharaoh's Jackpot", 'Pyth Plateau'],         // desert and ancient stone: trains, boulders, jackpots, the phoenix
  ['Magma Cup', '#ff6a3d', 'Assembly Line', 'Kernel Pretzel', "Duke's Volcano"],               // heat and industry: slag, the split, the lava river
  ['Peak Cup', '#9fdcff', 'Pipeline Pass', 'Cryo Caldera', 'Recursion Ridge', 'Heap Space'],                           // up through snow and ice to the stars
  ['City Cup', '#ff2bd6', 'Gateway 8080', 'Race Condition', 'Neon Overflow'],                         // the city: the airport by day, the clocktower at dusk, the streets at night in the rain
  ['Kernel Cup', '#b9a2ff', 'Crab Harbor', 'Pyth Plateau', "Duke's Volcano", 'Moonshot', 'Gradient Descent'],   // the grand final: three of the best, the giant one-lap finale, then the ski run down to the lodge
].map(([name, col, ...ts]) => ({ name, col, tracks: ts.map(trackByName).filter(i => i >= 0) })).filter(c => c.tracks.length >= CUP_MIN);
if (!PRESET_CUPS.some(c => c.name === setup.cupPick)) setup.cupPick = '';   // a cup that's gone
if (!PRESET_CUPS.some(c => c.name === setup.trackFilter)) setup.trackFilter = '';   // the track list's filter (a cup's tracks, '' all)
export const CUSTOM_COL = '#ffc93c';
const cupCol = name => (PRESET_CUPS.find(c => c.name === name) || { col: CUSTOM_COL }).col;
export const CUP_POINTS = { 1: [10], 2: [10, 5], 3: [10, 6, 3], 4: [10, 7, 5, 3] };   // by field size
const cupPoints = (place, n) => (CUP_POINTS[n] || CUP_POINTS[4])[place - 1] || 0;
// the standings: points, then wins, then the better last race. before: as they were before the race just scored
function cupStandings(cup, before = false) {
  const pl = r => { const p = cup.places.get(rk(r)); return before ? p.slice(0, -1) : p; };
  const pts = r => cup.pts.get(rk(r)) - (before ? cup.gain.get(rk(r)) || 0 : 0);
  const last = r => pl(r).at(-1) ?? 9, wins = r => pl(r).filter(p => p === 1).length;
  return [...cup.racers].sort((a, b) => pts(b) - pts(a) || wins(b) - wins(a) || last(a) - last(b));
}
export const esc = t => String(t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
// a human's tag: P1..P4 in their colour, or online their name; a cup racer whose player left the room is a bot now
const nameTag = (pIndex, name) => ` <span class="ptag" style="color:${PCOL[pIndex] || 'var(--muted)'}">${name ? esc(name) : 'P' + (pIndex + 1)}</span>`;
const racerTag = r => r.left ? ` <span class="ptag left">${esc(r.name)} · left</span>` : r.human ? nameTag(r.pIndex, r.name) : '';
const chip = p => `<span class="cup-chip p${Math.min(p, 4)}">${ORD(p)}</span>`;
const placeChips = (cup, r, before) => { const p = cup.places.get(rk(r)); return (before ? p.slice(0, -1) : p).map(chip).join(''); };

// a racer's seat in the race (and the cup): its key ('p0'.. a player, 'b0'.. a bot; online 'p' + player id), set when the
// racers are picked and copied onto its kart, never the character: two players may race the same one
export const rk = r => r.key ?? r.ch.id;
export const keyCars = (race, racers) => race.cars.forEach((c, i) => { c.key = racers[i].key; });
// a cup: its tracks in order, the racers (the same every race), points and places so far by racer (rk), and the points each
// got in the race last scored (gain; scoredN is that race's number, -1 before the first). Online the host runs it
// (net-ui.js) and sends it to everyone (cupWire); their copy is `remote`, `me` is this screen's player id.
export function newCup(name, tracks, racers, more = {}) {
  return { name, tracks: [...tracks], race: 0, racers, pts: new Map(racers.map(r => [rk(r), 0])), places: new Map(racers.map(r => [rk(r), []])), gain: new Map(), scoredN: -1, ...more };
}
// the grid of the cup's next race: as picked for the first, then in reverse order of the standings (the leader at the back)
export const cupGrid = cup => cup.race === 0 ? cup.racers : cupStandings(cup).reverse();
function scoreCup(cup, sorted) {
  if (cup.scoredN === cup.race) return;   // once per race
  cup.scoredN = cup.race; cup.gain = new Map();
  sorted.forEach((c, i) => { const p = cupPoints(i + 1, sorted.length), k = rk(c); cup.gain.set(k, p); cup.pts.set(k, cup.pts.get(k) + p); cup.places.get(k).push(i + 1); });
}
export const cupWire = cup => ({ name: cup.name, tracks: cup.tracks, race: cup.race, scoredN: cup.scoredN, pts: [...cup.pts], places: [...cup.places], gain: [...cup.gain],
  racers: cup.racers.map(r => ({ ci: CHARACTERS.indexOf(r.ch), key: rk(r), human: r.human, pIndex: r.pIndex, name: r.name || '', pid: r.pid ?? null, left: !!r.left })) });
export const cupFromWire = (w, me) => ({ ...w, racers: w.racers.map(r => ({ ...r, ch: CHARACTERS[r.ci] })), pts: new Map(w.pts), places: new Map(w.places), gain: new Map(w.gain), online: true, remote: true, me });

export function startCup(tracks, name) {
  game.cup = newCup(name, tracks, pickRacers());
  startRace();
}
export const fmtTime = t => t ? `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}` : '—';
// Personal bests, by track name: { lap, race: { [laps]: seconds } }
export const loadBests = () => { try { return JSON.parse(localStorage.getItem('kk-best') || '{}') || {}; } catch (e) { return {}; } };
const saveBests = b => { try { localStorage.setItem('kk-best', JSON.stringify(b)); } catch (e) { } };
export const saveSetup = () => { try { localStorage.setItem('kk-setup', JSON.stringify(setup)); } catch (e) { } };

const miniCache = new Map();
// the boot screen (boot.js) and the store of drawn pictures (thumb-store.js) reach the cache through this: has, draw (one
// now, here), want(def, pri) (a promise of a track's preview, and its cover with Map cover art on: drawn on the painter's
// worker), put (a picture restored from the store: a canvas or an ImageBitmap), hold (none drawn ahead of time while the
// boot screen runs) and onDrawn(name, canvas or file) (each preview drawn, to be stored)
export const minis = { has: name => miniCache.has(name), draw: def => miniBase(def), want: (def, pri) => wantPreview(def, pri), put: (name, img) => { if (!miniCache.has(name)) miniCache.set(name, img); }, hold: false, onDrawn: null };
// a track's preview is drawn once (art/pictures.js drawMini), at the biggest size the menu shows (the map screen's
// 480x288), and every smaller one is that picture shrunk: drawing a track is slow (0.1-0.9 s), shrinking a picture isn't.
// It's drawn on the painter's worker (art/painter.js) where the browser can, so the menu never stalls for one; here
// (miniBase) only where it can't.
function miniBase(def) {
  if (!miniCache.has(def.name)) {
    const c = drawMini(def);
    miniCache.set(def.name, c);
    if (minis.onDrawn) minis.onDrawn(def.name, c);
  }
  return miniCache.get(def.name);
}
// the painter's pictures, or drawn here if it can't (one an idle moment, not all at once)
let hereQ = Promise.resolve();
const here = f => (hereQ = hereQ.then(() => new Promise(r => (typeof requestIdleCallback !== 'undefined' ? requestIdleCallback : setTimeout)(() => { try { f(); } catch (e) { } r(); }))));
const miniAsk = new Map(), coverAsk = new Map();
function miniWant(def, pri = 1) {
  if (miniCache.has(def.name)) return Promise.resolve();
  if (!painterOn()) return here(() => miniBase(def));
  if (!miniAsk.has(def.name)) miniAsk.set(def.name, paint('mini', def.name, pri).then(r => {
    miniAsk.delete(def.name);
    if (miniCache.has(def.name)) return;
    if (!r) return here(() => miniBase(def));
    miniCache.set(def.name, r.pic); if (minis.onDrawn) minis.onDrawn(def.name, r.blob || r.pic);
  }));
  else sooner('mini', def.name, pri);
  return miniAsk.get(def.name);
}
function coverWant(name, pri = 1) {
  if (coverReady(name)) return Promise.resolve();
  if (!painterOn()) return here(() => warmCover(name));
  if (!coverAsk.has(name)) coverAsk.set(name, paint('cover', name, pri).then(r => {
    coverAsk.delete(name);
    if (coverReady(name)) return;
    if (!r) return here(() => warmCover(name));
    covers.put(name, r.pic); if (covers.onDrawn) covers.onDrawn(name, r.blob || r.pic);
  }));
  else sooner('cover', name, pri);
  return coverAsk.get(name);
}
const wantPreview = (def, pri) => Promise.all([miniWant(def, pri), settings.mapArt ? coverWant(def.name, pri) : null]);
// a preview at w x h (CSS px; drawn at 2x). One not drawn yet comes as a blank canvas, painted when the painter has it.
// Each size is shrunk from the big one once (the first time, for twenty restored pictures, was the slow part of opening
// the map screen: 0.1-0.3 s at a 4x slower CPU), and copied after; the map's tiles are shrunk ahead (warmMinis)
const shrunk = new Map();   // name|w|h -> canvas
function shrink(name, w, h) {
  const key = name + '|' + w + '|' + h; let c = shrunk.get(key);
  if (!c) {
    const src = miniCache.get(name); if (!src) return null;
    c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
    const k = Math.max(c.width / src.width, c.height / src.height), g = c.getContext('2d');   // (cover: a box of another shape crops a sliver)
    g.imageSmoothingQuality = 'high'; g.drawImage(src, (c.width - src.width * k) / 2, (c.height - src.height * k) / 2, src.width * k, src.height * k);
    shrunk.set(key, c);
  }
  return c;
}
const TILE_W = 150, TILE_H = 90;   // (the map screen's tiles: menu.js)
export function miniTrack(def, w, h) {
  const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
  const fill = () => { const s = shrink(def.name, w, h); if (s) c.getContext('2d').drawImage(s, 0, 0); };
  if (miniCache.has(def.name) || !painterOn()) { miniBase(def); fill(); } else miniWant(def, 0).then(fill);
  return c;
}
// track thumbnails in markup: <span class="mini" data-mini="trackIdx" data-w data-h> placeholders. One already drawn is filled
// at once; the rest when the painter has them (or, drawing here, one track a frame), so a screen full of them comes up at
// once and they pop in, instead of the screen freezing for seconds the first time
const miniWait = [];
let miniPump = 0;
// With Settings → Map cover art on, the map screen's track and cup cards get the map's cover picture instead (art/covers.js)
const isCover = el => settings.mapArt && !!el.closest('.mtile, .mcup');
const thumbOf = (t, el) => (isCover(el) ? coverThumb(t.name, +el.dataset.w || 72, +el.dataset.h || 46) : miniTrack(t, +el.dataset.w || 72, +el.dataset.h || 46));
export function fillMinis(root) {
  for (const el of root.querySelectorAll('[data-mini]')) {
    const t = TRACKS[+el.dataset.mini]; if (!t || el.firstChild) continue;
    if (isCover(el) ? coverReady(t.name) : miniCache.has(t.name)) el.appendChild(thumbOf(t, el));
    else if (painterOn()) (isCover(el) ? coverWant(t.name, 0) : miniWant(t, 0)).then(() => { if (el.isConnected && !el.firstChild && (isCover(el) ? coverReady(t.name) : miniCache.has(t.name))) el.appendChild(thumbOf(t, el)); });
    else miniWait.push(el);
  }
  if (miniWait.length && !miniPump) miniPump = requestAnimationFrame(pumpMinis);
}
function pumpMinis() {
  miniPump = 0;
  const el = miniWait.find(e => e.isConnected && !e.firstChild); miniWait.splice(0, miniWait.length, ...miniWait.filter(e => e.isConnected && !e.firstChild));
  if (!el) return;
  const t = TRACKS[+el.dataset.mini]; if (isCover(el)) warmCover(t.name); else miniBase(t);
  for (const e of miniWait.filter(e => +e.dataset.mini === +el.dataset.mini && !e.firstChild && isCover(e) === isCover(el))) e.appendChild(thumbOf(t, e));
  if (miniWait.some(e => !e.firstChild)) miniPump = requestAnimationFrame(pumpMinis);
}
// every track's preview ahead of time while you're on the menu (the map screen then opens straight away); the chosen
// track first. On the painter's worker: all asked for at once (it draws them one by one, held in a race). Drawn here
// (no worker): one in each idle moment, not while a turntable turns (Who's racing, the room: a preview is 0.1-0.9 s in
// one go, a freeze in the spin); it waits for a screen without one (the map screen draws any still missing one a frame)
let warming = false;
holdPainter(() => game.state !== 'menu' && game.state !== 'room');
export function warmMinis(first = 0) {
  if (warming || typeof document === 'undefined') return; warming = true;
  const order = [first, ...TRACKS.keys()].filter((v, i, a) => a.indexOf(v) === i && TRACKS[v]);
  const idle = typeof requestIdleCallback !== 'undefined' ? f => requestIdleCallback(f, { timeout: 2000 }) : f => setTimeout(f, 60);
  if (painterOn()) {   // (a moment later: the boot screen holds it before then)
    const ask = () => { if (minis.hold) { setTimeout(ask, 200); return; } for (const i of order) wantPreview(TRACKS[i], 2).then(() => idle(() => shrink(TRACKS[i].name, TILE_W, TILE_H))); };
    setTimeout(ask, 0); return;
  }
  const step = () => { if (order.length && turning()) { setTimeout(() => idle(step), 400); return; } if (minis.hold) { setTimeout(step, 200); return; } const i = order.shift(); if (i == null) return; if (game.state !== 'menu' && game.state !== 'room') { warming = false; return; } miniBase(TRACKS[i]); if (settings.mapArt) warmCover(TRACKS[i].name); idle(step); };   // (a race stops it; the menu starts it again)
  idle(step);
}
// a track's one line on its card: what makes it special. The full desc (the exact mechanics) is folded under "Show more".
// Kept here rather than in tracks.js; a track missing from it gets its desc's first sentence.
export const TAGLINES = {
  'Crab Harbor': 'A giant crab slams its claws across the road.',
  "Pharaoh's Jackpot": 'Gamble on golden boxes at the corners.',
  "Duke's Volcano": 'Lava globs and a lava river round a live volcano.',
  'Moonshot': 'The grand final: sea cliffs and a spaceport, a rocket to the Moon\'s crater bowl, canyon, launch rail and low-gravity crests, a capsule home.',
  'Sakura Stack': 'A garden figure-eight with a lifting drawbridge.',
  'Pyth Plateau': 'Step pyramids and a new road every lap.',
  'Merge Bay': 'An island town with two forks and big waves.',
  'Kernel Pretzel': 'Kickers on the Big Loop, a burnable shortcut by the volcano.',
  'Pipeline Pass': 'A mountain descent ending in a cannon leap.',
  'Heap Space': 'Low gravity, a hungry moon and a wormhole.',
  'Assembly Line': 'Stamping presses and a pouring slag pit.',
  'Cron Canyon': 'A freight train crosses the road four times.',
  'Cryo Caldera': 'Ice all the way round: lift early.',
  'Async Atoll': 'Hurricanes sweep the atoll; a banked seawall.',
  'Ruby Ruins': 'Rolling boulders and a temple that hides the road.',
  'Recursion Ridge': 'Real hills, switchbacks, and a cliff to jump.',
  'Race Condition': 'A haywire clocktower: race the minute hand, time the pendulum.',
  'Neon Overflow': 'A rainy city at night on three levels: a cloverleaf, a car park corkscrew, a rooftop jump.',
  'Gateway 8080': 'Jet blast, taxiing jets and moving walkways.',
  'Gradient Descent': 'Ski from the summit to the lodge: drift through the trees, fly the Big Air.',
};
// the "Show more" text: the mechanics in a sentence or two (the full desc in tracks.js is the long reference)
export const DETAILS = {
  'Crab Harbor': 'When it rears a claw, watch the shadow: floor it to beat the slam or lift and let it land. From lap 2 it pinches with both claws.',
  "Pharaoh's Jackpot": 'Item boxes only on the Strip. Lift early to tuck onto the golden boxes at six corners: two alike pays an item, three the jackpot, a cobra is a bust.',
  "Duke's Volcano": 'Lift and let a glob crust over, or get past before it lands. When a ford\'s lamps flash, cross before the lava front or wait.',
  'Moonshot': 'Always one lap. Lift for the Causeway Leap\'s window. Time the gantry arms, beat the test firing or wait it out, beat the crawler across or let it pass. A rocket for every racer at the Launch Row and a capsule at the Return Row: drive in flat out, the first there leaves first. On the Moon Kepler Bowl is banked: ride the wall hot or drop to the floor. Hadley Rille has walls, not run-off: lift in time. Hit the mass driver\'s first ring on the green to be launched (the gauge shows when you\'d get there flat out), never on the red, and lift hard for the catch after it. Over the Apennine Crests lift before each crest (the gauge\'s green): float off one and you can\'t turn. Time the airlock\'s doors in the base.',
  'Sakura Stack': 'When the bell rings the drawbridge lifts: floor it and leap the canal while it\'s low, or wait for it to come down.',
  'Pyth Plateau': 'The straight ends in a T and each lap turns a different way. Follow your dotted line.',
  'Merge Bay': 'At each fork, lift into the gold lane for the sharp road or stay in the white lane for the sweep. Waves shove you toward land.',
  'Kernel Pretzel': 'Flat out for the Big Loop: hold the gas over the kickers, let go at each lip for a trick. Or lift into the orange lane for the Caldera, and into the Ash Run while the volcano has burnt a gap in its thicket.',
  'Pipeline Pass': 'Three stages downhill: switchbacks, a narrow ledge, then hit the Cannon flat out to clear the crevasse.',
  'Heap Space': 'Hit the moon ramp in the speed window or fall in the crater (or get pulled into orbit). Dive into the wormhole while it glows.',
  'Assembly Line': 'Ride the green wave through the presses. When the slag pours, keep your speed up round the outside wall.',
  'Cron Canyon': 'At each crossing, floor it and beat the train or stop and wait. Each one is a different call.',
  'Cryo Caldera': 'Low grip everywhere. Snowploughs cross, a ramp flings you over a crevasse, and the road crosses itself.',
  'Async Atoll': 'In a hurricane, lift in the crosswind or scrape the wall, and ride the tailwind; the eye is calm. Carry speed high on the banked seawall.',
  'Ruby Ruins': 'When the serpent\'s eyes glow, beat the boulder down to the hairpin or let it go first. Remember the bends inside the temple.',
  'Recursion Ridge': 'Uphill slows you, downhill runs you past top speed. At the top, take the safe Ramp or fly off the Cliff in the speed window.',
  'Race Condition': 'Round the Dial the clock runs backwards and its minute hand sweeps the balcony your way: beat it over the arch, or let it get ahead before you follow it in. On the Drop, time the pendulum. When the tower strikes, every pad fires double.',
  'Neon Overflow': 'In the rain every corner grips less: lift earlier, and stay on the darker dry line the pack wipes into the road. Lift for a puddle or aquaplane. The Cloverleaf tightens as it climbs, so do the Corkscrew loops; hit the Gap fast or drop into the alley.',
  'Gateway 8080': 'Be behind a jet as it takes off and its blast slingshots you down the straight. Where jets cross (red lights), beat them or wait. Ride the walkways; the Travelator shortcut runs the wrong way, so boost up it.',
  'Gradient Descent': 'One run down, and on snow lifting barely slows you. In the tree fields your drift carves you in and letting go sweeps you out: nothing steers for you, so weave the trees yourself (the arrows on the snow show where each way takes you). At each split, hold drift across the flags to take the lane (the Park, the Ledge), let go for the piste. In the Park trick every lip (let go of the gas at it), slide the box and pump the halfpipe (drift the way you swing): clean, it beats the piste by a second or more. Off the Big Air, every drift press is a third of a flip: land on whole flips for a big boost, on a third and you crash. The Ledge is the narrow shelf (run wide and you fall); the piste round it has a kicker line to trick. Weave the moguls: hit one fast and it launches you.',
};
export const tagline = t => TAGLINES[t.name] || t.desc.split(/(?<=[.:])\s/)[0];
export const details = t => DETAILS[t.name] || t.desc;
// which track cards have their full text open: this visit only (a redraw keeps it, the next visit starts folded)
const openDescs = new Set();
// a track card's text: the tagline, the full desc folded away, and the Show more toggle (wired by wireMore). id: unique on the page
// clips: offer the track's "Watch how" clip under the text, if it has one (clip.js; offline menus only, never in a room)
export function trackText(t, id, { clips = false } = {}) {
  const open = openDescs.has(t.name), clip = clips && clipOf(t.name);
  return `<div class="d tl">${t.laps ? `<span class="lapfix">${t.laps} LAP${t.laps > 1 ? 'S' : ''}</span> ` : ''}${esc(tagline(t))}</div><div class="td-more${open ? ' open' : ''}" id="td-${id}"><div><div class="d td-full">${esc(details(t))}${frontrunHTML(t)}${clip ? `<span class="clip-line">${esc(clip.text)} <button type="button" class="clip-go" data-clip="${esc(t.name)}">Watch how</button></span>` : ''}</div></div></div>
    <button type="button" class="more" data-more="${esc(t.name)}" aria-controls="td-${id}" aria-expanded="${open}">${open ? 'Show less' : 'Show more'}</button>`;
}
// the Show more toggles in root: open or fold the full text in place (the card's own click, picking the track, is left alone)
export function wireMore(root) {
  for (const b of root.querySelectorAll('[data-clip]')) b.onclick = e => { e.stopPropagation(); openClip(b.dataset.clip); };   // (not the card's click: that picks the track)
  for (const b of root.querySelectorAll('[data-more]')) b.onclick = e => {
    e.stopPropagation();
    const n = b.dataset.more, open = !openDescs.has(n), box = root.querySelector('#' + b.getAttribute('aria-controls'));
    if (open) openDescs.add(n); else openDescs.delete(n);
    b.setAttribute('aria-expanded', open); b.textContent = open ? 'Show less' : 'Show more'; if (box) box.classList.toggle('open', open);
  };
}
const mini = (t, w, h) => `<span class="mini" data-mini="${t}"${w ? ` data-w="${w}" data-h="${h}"` : ''} title="${esc(TRACKS[t].name)}"></span>`;
// a trophy (inline SVG, so it costs nothing to draw): bowl, handles, stem and plinth in the cup's colour, with a shine
export const trophy = (col, cls = '') => `<svg class="trophy ${cls}" viewBox="0 0 48 48" aria-hidden="true">
  <path d="M13 11H7v2.5c0 5 3.2 8.4 7.5 9M35 11h6v2.5c0 5-3.2 8.4-7.5 9" fill="none" stroke="${col}" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M12 5h24v9c0 8.6-5.4 14.5-12 14.5S12 22.6 12 14z" fill="${col}"/><path d="M24 5h12v9c0 8.6-5.4 14.5-12 14.5z" fill="#000" fill-opacity=".16"/>
  <path d="M21 28h6l1 7h-8z" fill="${col}"/><rect x="14" y="34.5" width="20" height="5" rx="1.6" fill="${col}"/><rect x="11" y="39.5" width="26" height="5.5" rx="1.8" fill="#2b2233"/>
  <path d="M16.5 9v4.5c0 4 1.6 7 3.8 8.6" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2.4" stroke-linecap="round"/></svg>`;
// a canvas's drop shadow drawn into it once, instead of a CSS filter the browser redoes on every scroll and hover. The
// flat looks (js/look.js): a lighter, tighter one (hard: whether it gets one at all there)
export function withShadow(src, blur, dy, hard = 0) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d');
  if (bold()) { if (hard) { g.shadowColor = 'rgba(0,0,0,0.28)'; g.shadowBlur = blur * 0.6; g.shadowOffsetY = dy * 0.45; } g.drawImage(src, 0, 0); return c; }
  g.shadowColor = 'rgba(0,0,0,0.38)'; g.shadowBlur = blur; g.shadowOffsetY = dy; g.drawImage(src, 0, 0); return c;
}
const copyCanvas = src => { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); return c; };
// the tags on a racer's card for everyone who picked it, side by side ({ col, txt (html) })
export const ownerTags = ts => ts.length ? `<div style="position:absolute;top:6px;left:8px;right:8px;display:flex;flex-wrap:wrap;gap:4px;z-index:1">${ts.map(t => `<div class="tag" style="position:static;background:${t.col}">${t.txt}</div>`).join('')}</div>` : '';
// a racer card's text: name, language, blurb, trait and body, and the stat bars (the menu and the online room share it)
export function charInfo(ch) {
  const st = ch.stats;
  return `<div class="n">${ch.name}</div><div class="l">${ch.lang}</div><div class="b">${ch.blurb}</div>
        <div class="trait">${ch.trait} · ${BODIES[ch.body].name}</div>
        <div class="stats">${stat('SPD', st.top)}${stat('ACC', st.accel)}${stat('GRIP', st.grip)}${stat('WGT', (st.weight - 0.5) / 1.5)}</div>`;
}
// a stat: its name, its bar and its number
const stat = (k, v) => `<span class="sl">${k}</span>${statBar(v)}<b class="sv">${STAT_NUM(v)}</b>`;
// a racer card's colours (the stage's spotlight and the floor glow under the car)
export const charColors = (el, ch) => { el.style.setProperty('--rc', ch.color); el.style.setProperty('--ra', ch.accent || ch.color); };
// a stat bar: over 100 it wraps round in gold, below 0 it runs red the other way
const statBar = v => v > 1 ? `<span class="bar over"><i style="width:100%"></i><b style="width:${Math.min(100, (v - 1) * 100)}%"></b></span>`
  : v < 0 ? `<span class="bar neg"><i style="width:${Math.min(100, -v * 100)}%"></i></span>` : `<span class="bar"><i style="width:${Math.max(2, v * 100)}%"></i></span>`;
// the car side-on to the camera (nose right) with its driver sitting up in it (cached: the menu redraws on every click)
const portraitCache = new Map();
export function portrait(ch) {
  const key = ch.id + '|' + settings.look;
  if (!portraitCache.has(key)) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), B = BODIES[ch.body], k = Math.min(2.7, 224 / B.L);
    g.translate(128 - B.seat * k * 0.3, 178); g.scale(k, k); drawCarShadow(g, ch, 0); drawCar(g, ch);
    g.translate(B.seat, 0); drawMascot(g, ch, { t: 0.4, scale: 2.4 / k, look: [0.5, 0.25] });
    portraitCache.set(key, withShadow(c, 18, 13, 8));
  }
  return copyCanvas(portraitCache.get(key));
}
// a roster card's racer (menu.js Who's racing): the racer alone, no car, turned three-quarters toward you: its 3D model
// (art/model3d.js portrait3D: one frame made on the 3D bakery, not a sheet), the 2D mascot till it's made and with no
// WebGL (whatever Settings > 3D models says, like the turntables). Cached per racer and look; a card drawn while the 3D
// one is still being made is painted again when it is. warmRoster queues all ten (the menu's first screen), so they're
// usually made before Who's racing opens.
const RP = 256, RK = 3.15, RY = 200, RB = 232, RYAW = Math.PI / 2 - 0.55;   // canvas px, px a unit, the seat's height, where its feet go, the yaw
const rosterCache = new Map();
function rosterArt(ch, wake) {
  const key = ch.id + '|' + settings.look, hit = rosterCache.get(key);
  if (hit && hit.three) return hit.cv;
  const P = portrait3D(ch.id, RK, RYAW, wake);
  if (!P && hit) return hit.cv;
  const a = document.createElement('canvas'); a.width = a.height = RP; const ga = a.getContext('2d', { willReadFrequently: true });
  if (P) { const C = P.cell; ga.drawImage(P.cv, C[0], C[1], C[2], C[3], Math.round(RP / 2 + C[4] * RK), Math.round(RY + C[5] * RK), C[2], C[3]); }
  else { ga.translate(RP / 2, RY); drawMascot(ga, ch, { t: 0.4, scale: RK, look: [0.5, 0.25], shadow: false }); }
  // centred on what's drawn, its feet at RB (the models' boxes are for every heading; the 2D and 3D ones then sit alike)
  const px = ga.getImageData(0, 0, RP, RP).data; let x0 = RP, x1 = 0, y1 = 0;
  for (let y = 0; y < RP; y++) for (let x = 0; x < RP; x++) if (px[(y * RP + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  const c = document.createElement('canvas'); c.width = c.height = RP;
  if (x1 >= x0) c.getContext('2d').drawImage(a, Math.round(RP / 2 - (x0 + x1 + 1) / 2), Math.round(RB - y1 - 1));
  const cv = withShadow(c, 18, 13, 8);
  rosterCache.set(key, { cv, three: !!P });
  return cv;
}
export function rosterPortrait(ch) {
  const c = document.createElement('canvas'); c.width = c.height = RP;
  const paint = src => { const g = c.getContext('2d'); g.clearRect(0, 0, RP, RP); g.drawImage(src, 0, 0); };
  paint(rosterArt(ch, () => { if (c.isConnected) paint(rosterArt(ch)); }));
  return c;
}
// ... and the cards' pictures made ahead too, one an idle moment (all ten at once was a 70-80 ms stall opening Who's
// racing): each as soon as its 3D one is made (the 2D one meanwhile)
let rosterRun = false;
export function warmRoster() {
  for (const ch of CHARACTERS) portrait3D(ch.id, RK, RYAW);
  if (rosterRun || typeof document === 'undefined') return; rosterRun = true;
  const idle = f => (typeof requestIdleCallback !== 'undefined' ? requestIdleCallback(f, { timeout: 1500 }) : setTimeout(f, 50));
  const todo = [...CHARACTERS]; let tries = 0;
  const step = () => {
    const ch = todo.shift();
    if (!ch || tries++ > 400 || game.state !== 'menu' && game.state !== 'room') { rosterRun = false; return; }
    const hit = rosterCache.get(ch.id + '|' + settings.look), P = portrait3D(ch.id, RK, RYAW);
    if (!hit || P && !hit.three) rosterArt(ch);
    if (P === undefined) todo.push(ch);   // (its 3D one still on the bakery: again later)
    if (!todo.length) { rosterRun = false; return; }
    setTimeout(() => idle(step), P === undefined ? 150 : 0);
  };
  setTimeout(() => idle(step), 0);
}

// every button and card in the menus clicks
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('button, .char, .track')) sfx.play('click'); }, true);
// C in an online room opens What's new (nobody is driving there, so no player key is in the way; the menu's own keys,
// C among them, are menu.js's)
document.addEventListener('keydown', e => {
  if (game.state !== 'room' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 'c' || document.querySelector('.cl-back')) return;
  if (e.target.closest && e.target.closest('input, textarea')) return;
  e.preventDefault(); openChangelog();
});
export const whatsNewBtn = () => { const n = unseenCount(); return `<button id="changelog" class="whatsnew" title="What's new (C)">What's new <span class="wn-v">v${VERSION}</span>${n ? `<span class="wn-dot">${n < 0 ? 'new' : n > 9 ? '9+' : n}</span>` : ''}</button>`; };

// ----- Settings (menu): volumes, mute, shake, flashes, reduced effects, FPS. Saved in kk-settings; applied at start-up.
sfx.setMusicVolume(settings.music); sfx.setSfxVolume(settings.sfx); if (settings.muted) sfx.setMuted(true);
sfx.onMute = m => { settings.muted = m; saveSettings(); const b = document.getElementById('set-muted'); if (b) b.checked = m; };   // Backspace in a race too
let fpsEl = null, fpsN = 0, fpsT = 0;
export function fpsTick(now) {
  if (!settings.fps) { if (fpsEl) { fpsEl.remove(); fpsEl = null; } return; }
  if (!fpsEl) { fpsEl = document.createElement('div'); fpsEl.className = 'fps'; document.body.append(fpsEl); fpsN = 0; fpsT = now; }
  fpsN++;
  if (now - fpsT >= 500) { fpsEl.textContent = Math.round(fpsN * 1000 / (now - fpsT)) + ' FPS'; fpsN = 0; fpsT = now; }
}
export function openSettings(onChange) {
  if (document.querySelector('.set-back')) return;
  const back = document.createElement('div'); back.className = 'cl-back set-back';
  const pct = v => Math.round(v * 100) + '%';
  const slider = (id, label, v) => `<label class="set-row"><span>${label}</span><input type="range" id="${id}" min="0" max="100" step="1" value="${Math.round(v * 100)}"><b id="${id}-v">${pct(v)}</b></label>`;
  const check = (id, label, on, hint) => `<label class="set-row"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" class="switch" id="${id}"${on ? ' checked' : ''}></label>`;
  const looks = `<div class="set-row set-look"><span>Style<small>How the menus and the race's HUD look: Classic (glossy) or Classic Flat (the same, calmer: the one being worked on). Racing and Premium are archived: they still work but don't get new art</small></span>
    <span class="seg" id="set-look" role="radiogroup" aria-label="Style">${LOOKS.map(([v, t]) => `<button data-look="${v}" role="radio" aria-checked="${settings.look === v}"${settings.look === v ? ' class="sel"' : ''}>${t}</button>`).join('')}</span></div>`;
  const textSizes = `<div class="set-row set-look"><span>Text size<small>Bigger words in the menus and the race's HUD, for a phone or a TV across the room</small></span>
    <span class="seg" id="set-text" role="radiogroup" aria-label="Text size">${TEXT_SIZES.map(([v, t]) => `<button data-text="${v}" role="radio" aria-checked="${settings.textSize === v}"${settings.textSize === v ? ' class="sel"' : ''}>${t}</button>`).join('')}</span></div>`;
  back.innerHTML = `<div class="panel cl-box set-box" role="dialog" aria-label="Settings"><div class="cl-head"><h2>Settings</h2><span class="cl-ver"></span><button class="cl-x" id="set-x">✕</button></div>
    ${looks}${textSizes}${slider('set-music', 'Music volume', settings.music)}${slider('set-sfx', 'Sound effects volume', settings.sfx)}
    ${check('set-muted', 'Mute all', sfx.muted, 'Backspace in a race')}
    ${check('set-shake', 'Screen shake', settings.shake)}${check('set-flashes', 'Flashes', settings.flashes, 'the white and red screen flashes')}
    ${check('set-reduced', 'Reduced effects', settings.reduced, 'fewer particles; the race itself is the same')}
    ${check('set-fps', 'Show FPS', settings.fps, 'a frame counter in the corner')}
    ${check('set-drift', 'Drift', settings.drift, 'a third key (E, or Shift) to slide through corners for a mini-turbo; off is the classic two-button game. Online, the host\'s choice goes for the room')}
    ${check('set-3d', '3D models (experimental)', settings.models3d, 'Every racer rides as a 3D model that turns with its kart')}
    ${check('set-cars3d', '3D cars (experimental)', settings.cars3d, 'Every racer\'s car as a cartoon 3D model, still its exact size on the road')}
    ${check('set-mapart', 'Map cover art (experimental)', settings.mapArt, 'The track cards show a picture of each map instead of its layout; the big preview keeps the layout')}</div>`;
  document.body.append(back);
  const q = id => back.querySelector('#' + id);
  const vol = (id, key, fn) => q(id).oninput = e => { settings[key] = e.target.value / 100; q(id + '-v').textContent = pct(settings[key]); fn(settings[key]); saveSettings(); };
  vol('set-music', 'music', v => sfx.setMusicVolume(v)); vol('set-sfx', 'sfx', v => sfx.setSfxVolume(v));
  q('set-sfx').onchange = () => sfx.play('click');
  q('set-muted').onchange = e => { sfx.setMuted(e.target.checked); };
  for (const [id, key] of [['set-shake', 'shake'], ['set-flashes', 'flashes'], ['set-reduced', 'reduced'], ['set-fps', 'fps'], ['set-drift', 'drift'], ['set-3d', 'models3d'], ['set-cars3d', 'cars3d']]) q(id).onchange = e => { settings[key] = e.target.checked; saveSettings(); if (typeof onChange === 'function') onChange(); };
  q('set-mapart').onchange = e => { settings.mapArt = e.target.checked; saveSettings(); if (game.state === 'menu') showMenu(menu.view); };
  // the Text size: at once (the menu drawn again, so its laid-out parts fit the new size; a race's HUD as it's drawn)
  for (const b of back.querySelectorAll('#set-text button')) b.onclick = () => {
    if (settings.textSize === b.dataset.text) return;
    settings.textSize = b.dataset.text; saveSettings(); applyTextSize();
    for (const o of back.querySelectorAll('#set-text button')) { const on = o === b; o.classList.toggle('sel', on); o.setAttribute('aria-checked', on); }
    if (game.state === 'menu') showMenu(menu.view);
  };
  // the Style: switched live (the page's CSS at once; the menu is drawn again for its canvases, the race's art as it's drawn)
  for (const b of back.querySelectorAll('#set-look button')) b.onclick = () => {
    if (settings.look === b.dataset.look) return;
    setLook(b.dataset.look); saveSettings(); applyLook();
    for (const o of back.querySelectorAll('#set-look button')) { const on = o === b; o.classList.toggle('sel', on); o.setAttribute('aria-checked', on); }
    if (game.state === 'menu') showMenu(menu.view);
  };
  const shut = () => { back.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); shut(); } };
  document.addEventListener('keydown', onKey, true);
  q('set-x').onclick = shut; back.addEventListener('mousedown', e => { if (e.target === back) shut(); });
  q('set-x').focus();
}

// ----- the menu: a flow of full screens (menu.js: the title, the racers, the track or cup, Online, How to play). view: the
// screen to open (by default where you start races from: the title on the first visit, the track screen after a race, the
// Online screen after a room). Back on the menu any race or cup is over.
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
// the grid at a glance in the online room, beside the Bots buttons: a chip per kart, the players in their colours then the
// bots, and the sum. slots: the players' slots (some may have left)
export const whoSum = (humans, bots, slots = [...Array(humans).keys()]) => `<span class="who-chips" aria-hidden="true">${slots.map(i => `<i style="background:${PCOL[i]}">P${i + 1}</i>`).join('')}${'<i class="bot">BOT</i>'.repeat(bots)}</span>
  <span>${plural(humans, 'player')} + ${bots ? plural(bots, 'bot') : 'no bots'} = <b>${plural(humans + bots, 'kart')}</b></span>`;

export function showMenu(view) {
  Input.reset(); sfx.music('menu');
  game.state = 'menu'; game.race = null; game.cup = null;
  openDescs.clear();   // track texts start folded
  if (onlinePending()) { setMode('online'); view = 'online'; }   // a shared #join= link, or a room that just ended (its note shows on the Online screen)
  showView(view || returnView(), view ? 1 : -1);
  if (ghostLinkPending()) setTimeout(openGhostLink);   // a friend's ghost link (#ghost=…, timetrial-ui.js): open it over the menu
}

// the online room's Single race / Cup switch; set gets whether it's a cup
export function modeSwitch(el, cupMode, set, readOnly = false) {
  const cur = cupMode ? 'cup' : 'single';
  el.innerHTML = `<span class="seg">${[['single', 'Single race'], ['cup', 'Cup']].map(([m, l]) => `<button data-mode="${m}" class="${cur === m ? 'sel' : ''}"${readOnly ? ' disabled' : ''}>${l}</button>`).join('')}</span>
    <span class="help">${cupMode ? '3 to 5 tracks back to back, points for every place' : readOnly ? 'One race: anyone picks the track, the host can make it a cup' : 'Pick a track, or switch to <b>Cup</b> for 3 to 5 in a row'}</span>`;
  if (!readOnly) el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => set(b.dataset.mode === 'cup'));
}
// the cup section: the ready-made cups as cards (trophy, name, the tracks in order) and your own cup as numbered slots,
// filled by clicking the tracks below. o: { tracks (your own cup, or online the room's cup, track indices), name (the
// room's cup), by(slot) (online: who put that track in, as html), readOnly (just show the pick), sel (the menu: the chosen ready-made cup's index, -1
// for your own; online the chosen card is the one matching tracks), onPreset(i), onOwn() (the menu: back to your own cup),
// onDrop(slot), onClear() }
export function cupPicker(el, o) {
  const tracks = o.tracks, menu = o.sel !== undefined;
  const chosen = (c, i) => menu ? i === o.sel : c.tracks.length === tracks.length && c.tracks.every((t, j) => t === tracks[j]);
  const card = (c, i, sel) => `<button class="cup-card${sel ? ' sel' : ''}"${i >= 0 ? ` data-preset="${i}"` : ''} style="--cc:${c.col}"${o.readOnly ? ' disabled' : ''}>
      <span class="cc-top">${trophy(c.col)}<span class="cc-t"><span class="cc-name">${esc(c.name)}</span><span class="cc-meta">${c.tracks.length} races</span></span>
        ${o.readOnly ? '' : `<span class="cc-go">${sel ? '✓ Chosen' : 'Choose'}</span>`}</span>
      <span class="cc-tracks">${c.tracks.map(t => mini(t, 64, 40)).join('')}</span>
      <span class="cc-names">${c.tracks.map(t => esc(TRACKS[t].name)).join(' · ')}</span></button>`;
  if (o.readOnly) {
    el.innerHTML = `<div class="cupbox">${tracks.length >= CUP_MIN ? card({ name: o.name || 'Custom Cup', col: cupCol(o.name), tracks }, -1, true) : '<div class="help">The host is still picking the cup\'s tracks.</div>'}</div>`;
    fillMinis(el); return;
  }
  const ownOn = !menu || o.sel < 0;
  const slots = Array.from({ length: CUP_MAX }, (_, i) => tracks[i] != null
    ? `<div class="slot full"><span class="sb">${i + 1}</span>${mini(tracks[i], 92, 56)}<span class="sn">${esc(TRACKS[tracks[i]].name)}</span>${o.by ? o.by(i) : ''}<button class="sx" data-drop="${i}" title="Take it out">✕</button></div>`
    : `<div class="slot empty${i < CUP_MIN ? ' need' : ''}"><span class="sb">${i + 1}</span><span class="sn">${i === tracks.length ? 'Click a track below' : i < CUP_MIN ? 'Needed' : 'Optional'}</span></div>`).join('');
  el.innerHTML = `<div class="cupbox">
    <div class="cup-sec"><span class="cup-lbl">Ready-made cups</span><span class="help">pick one, or build your own below</span></div>
    <div class="cup-cards">${PRESET_CUPS.map((c, i) => card(c, i, chosen(c, i))).join('')}</div>
    <div class="cup-own${ownOn ? '' : ' off'}"><div class="cup-sec"><span class="cup-lbl">${menu ? 'Your own cup' : 'Or build one'}</span><span class="help">click 3 to 5 tracks below in race order, click again to take one out</span>
      ${!ownOn && tracks.length >= CUP_MIN ? '<button class="cup-clear" id="cupown">Race this one</button>' : ''}${tracks.length ? '<button class="cup-clear" id="cupclear">Clear</button>' : ''}</div>
    <div class="cup-slots">${slots}</div></div>
    <div class="help cup-rules">Same racers, laps and bots every race. Points per place: <b>${CUP_POINTS[4].join(' / ')}</b> with 4 karts. From race 2 the grid starts in reverse order of the standings, so the leader starts at the back.</div></div>`;
  fillMinis(el);
  el.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => o.onPreset(+b.dataset.preset));
  el.querySelectorAll('[data-drop]').forEach(b => b.onclick = e => { e.stopPropagation(); o.onDrop(+b.dataset.drop); });
  const clr = el.querySelector('#cupclear'); if (clr) clr.onclick = o.onClear;
  const ownB = el.querySelector('#cupown'); if (ownB) ownB.onclick = o.onOwn;
}

// the menu's item odds chart: the game's own tables (placeChances, what a box rolls from), for a place and a distance behind the
// leader. The rows are built once; moving the slider only changes bar widths and numbers.
const oddsView = { rank: 2, gap: 1200 };
const ODDS_FULL = 30;   // a bar this many percent fills its track
export function oddsChart(s) {
  const bars = s.querySelector('#oddsBars'), slider = s.querySelector('#oddsGap'), lbl = s.querySelector('#oddsGapLbl'), places = s.querySelector('#oddsPlace');
  const rows = {};
  for (const k of ITEM_ORDER) {
    const d = document.createElement('div'); d.className = 'odds-row';
    const cv = document.createElement('canvas'); cv.width = cv.height = 44; const g = cv.getContext('2d'); g.translate(22, 22); drawItemIcon(g, k, 15); d.appendChild(cv);
    d.insertAdjacentHTML('beforeend', `<span class="n" style="color:${ITEMS[k].col}">${ITEMS[k].name}</span><span class="bar"><i style="background:${ITEMS[k].col}"></i></span><span class="p"></span>`);
    bars.appendChild(d); rows[k] = { d, fill: d.querySelector('i'), p: d.querySelector('.p') };
  }
  const draw = () => {
    const n = Math.max(2, setup.humans + setup.bots), pack = setup.humans >= 3; oddsView.rank = Math.min(oddsView.rank, n);
    const lead = oddsView.rank === 1, gap = lead && !pack ? 0 : oddsView.gap;   // 1st with 3+ players: the slider is the lead over 2nd
    places.innerHTML = '';
    for (let r = 1; r <= n; r++) { const b = document.createElement('button'); b.textContent = ORD(r); b.className = oddsView.rank === r ? 'sel' : ''; b.onclick = () => { oddsView.rank = r; draw(); }; places.appendChild(b); }
    slider.value = gap; slider.disabled = lead && !pack;
    const far = FAR_GAP * (pack ? PACK_GAP : 1), k = gapK(gap, pack);
    lbl.innerHTML = lead && !pack ? 'You\'re leading: nobody to trail.' : lead ? `<b>${gap}</b> units ahead of 2nd · 3+ players: the bigger your lead, the fewer Firewalls and Ghosts` : `<b>${gap}</b> units behind the leader, about ${(gap / 400).toFixed(1)} s at full speed · ${k >= 1 ? 'as far back as it counts' : Math.round(k * 100) + '% of the way to "far" (' + far + ')'}${pack ? ' · 3+ players: far comes sooner, leader-only items are likelier' : ''}`;
    const t = lead ? placeChances(1, n, 0, { pack, lead: k }) : placeChances(oddsView.rank, n, k, { pack }); let sum = 0; for (const i in t) sum += t[i];
    for (const i of ITEM_ORDER) { const pct = sum ? 100 * (t[i] || 0) / sum : 0, r = rows[i]; r.fill.style.width = Math.min(100, pct / ODDS_FULL * 100) + '%'; r.p.textContent = pct >= 0.5 ? Math.round(pct) + '%' : '·'; r.d.classList.toggle('off', pct < 0.5); }
  };
  slider.oninput = () => { oddsView.gap = +slider.value; draw(); };
  return draw;
}

const PRO_TIPS = [
  'Drafting: Tuck in close behind an opponent to draft their slipstream and gain massive free speed!',
  'Cornering: Release the gas to slow for corners — lower speed lets you cut a much tighter racing line.',
  'Item Boxes: Drive through ? boxes to pick up items. The further back you are, the stronger the roll!',
  'Rubber Duck: Holding a duck shows your projected bouncing trajectory. Time your release!',
  'Mega Duck: The giant duck bulges onto the road from the inside curb. Steer wide around the outside!',
  'Fast-Forward: Slamming into a Mega Duck while using Fast-Forward pops it instantly with a burst!',
  'Shield & Firewall: Keep your defenses active to absorb homing ducks, mines, and rival collisions.',
  'Jump Ramps: Full throttle before a jump ramp gives you maximum airtime to soar cleanly across gaps.',
  'Controls: Backspace toggles audio mute, Escape abandons race and returns to the main menu.'
];

// the cup so far on the loading screen: every track as a thumbnail, done ones ticked, this one lit, and who leads
function cupTrail(cup) {
  const steps = cup.tracks.map((t, i) => { const st = i < cup.race ? 'done' : i === cup.race ? 'now' : 'next';
    return `<div class="ct ${st}">${mini(t, 96, 58)}<span class="ct-b">${st === 'done' ? '✓' : i + 1}</span><span class="ct-n">${esc(TRACKS[t].name)}</span></div>`; }).join('<i class="ct-link"></i>');
  const lead = cup.race > 0 ? cupStandings(cup)[0] : null;
  return `<div class="cup-trail">${steps}</div>${lead ? `<div class="ct-lead">${trophy(cupCol(cup.name))} Leading: <b>${lead.ch.name}</b>${racerTag(lead)} · ${cup.pts.get(rk(lead))} pts · they start at the back</div>` : ''}`;
}

// each player's keys on the loading screen, in their colour (qol.js raceKeys; a touch screen: how the touch zones work)
function keysRow(racers, drift) {
  const hs = racers.filter(r => r.human).sort((a, b) => a.pIndex - b.pIndex), solo = hs.length === 1;
  return `<div class="loading-keys" aria-label="Controls">${hs.map(r => `<div class="lk" style="--pc:${PCOL[r.pIndex]}"><span class="lk-tag">${solo ? 'YOU' : 'P' + (r.pIndex + 1)}</span>${raceKeys(r.pIndex, { drift, solo })}</div>`).join('')}${touchKeys(hs.length, drift)}</div>`;
}
// o (a time trial): { top: the badge over the name, badges: instead of laps/humans/bots/skill }
export function showLoading(trackIdx, racers, onReady, o = {}) {
  game.state = 'loading';
  ui.innerHTML = '';
  const track = TRACKS[trackIdx];
  bgTrack(trackIdx);
  const tip = PRO_TIPS[Math.floor(Math.random() * PRO_TIPS.length)];
  const s = document.createElement('div');
  s.className = 'screen loading-screen';

  const gridSlots = ['POLE', 'P2', 'P3', 'P4'];
  const gridCardsHtml = racers.map((r, i) => {
    const ch = r.ch;
    const isHuman = r.human;
    const tag = isHuman ? `P${r.pIndex + 1}` : 'BOT';
    const tagCol = isHuman ? PCOL[r.pIndex] : 'var(--muted)';
    return `
      <div class="loading-grid-card ${isHuman ? 'human' : ''}">
        <div class="loading-slot-badge ${i === 0 ? 'pole' : ''}">${gridSlots[i] || `P${i + 1}`}</div>
        <div class="loading-portrait-wrap" id="racer-port-${i}"></div>
        <div class="loading-racer-name">${ch.name}</div>
        <div class="loading-racer-meta">${ch.lang} · ${BODIES[ch.body].name}</div>
        <div class="loading-racer-trait">${ch.trait}</div>
        <div class="loading-racer-tag" style="background:${tagCol}">${tag}</div>
      </div>
    `;
  }).join('');

  s.innerHTML = `
    <div class="panel loading-panel">
      <div class="loading-header">
        <div class="loading-brand">${logoSvg({ anim: false })}</div>
        <div class="loading-top-badge">${o.top ? o.top : game.cup ? `Cup: race ${game.cup.race + 1} of ${game.cup.tracks.length}` : 'RACE PREPARATION'}</div>
        <h1 class="logo" style="font-size:clamp(32px, 5vw, 56px)">${track.name}</h1>
        <div class="sub" style="margin:4px 0 4px">${esc(tagline(track))}</div><div class="loading-desc">${esc(details(track))}</div>
        <div class="loading-badges">
          ${game.cup ? `<span class="l-badge cup">${game.cup.name.toUpperCase()}</span>` : ''}
          ${o.badges ? o.badges.map(b => `<span class="l-badge">${b}</span>`).join('') : `<span class="l-badge">${track.laps ? `${track.laps} LAP${track.laps > 1 ? 'S' : ''}` : `${setup.laps} ${track.open ? 'STAGES' : 'LAPS'}`}</span>
          <span class="l-badge">${setup.humans} ${setup.humans === 1 ? 'HUMAN' : 'HUMANS'}</span>
          <span class="l-badge">${setup.bots} ${setup.bots === 1 ? 'BOT' : 'BOTS'}</span>
          <span class="l-badge">${['CHILL', 'NORMAL', 'RUTHLESS'][setup.aiLevel]} AI</span>`}
        </div>
        ${game.cup ? cupTrail(game.cup) : ''}
      </div>

      <div class="loading-middle">
        <div class="loading-map-card">
          <div class="loading-map-canvas" id="loading-map"></div>
        </div>
        <div class="loading-grid-wrap">
          <div class="loading-subheading">STARTING GRID</div>
          <div class="loading-grid-cards">${gridCardsHtml}</div>
          ${keysRow(racers, o.drift ?? settings.drift)}
        </div>
      </div>

      <div class="loading-tip">
        <span class="tip-pill">PRO TIP</span>
        <span class="tip-msg">${tip}</span>
      </div>

      <div class="loading-progress-wrap">
        <div class="loading-progress-labels">
          <span id="load-status-text">STARTING ENGINES...</span>
          <span id="load-status-pct">0%</span>
        </div>
        <div class="loading-progress-track">
          <div class="loading-progress-bar" id="load-bar"></div>
        </div>
        <div class="loading-skip-hint">Press <kbd>Space</kbd> or <kbd>Enter</kbd> or click to launch</div>
      </div>
    </div>
  `;
  ui.appendChild(s);
  fillMinis(s);

  const mapWrap = s.querySelector('#loading-map');
  if (mapWrap) mapWrap.appendChild(miniTrack(track, 180, 110));

  racers.forEach((r, i) => {
    const wrap = s.querySelector(`#racer-port-${i}`);
    if (wrap) wrap.appendChild(portrait(r.ch));
  });

  let launched = false;
  const launch = () => {
    if (launched) return;
    launched = true;
    window.removeEventListener('keydown', onKey);
    if (!s.isConnected) return;   // left for the menu before it launched
    s.removeEventListener('click', launch);
    sfx.play('start');
    onReady();
  };

  const onKey = e => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      launch();
    }
  };
  window.addEventListener('keydown', onKey);
  s.addEventListener('click', launch);

  const startT = performance.now();
  const dur = 1200;
  const bar = s.querySelector('#load-bar');
  const pct = s.querySelector('#load-status-pct');
  const txt = s.querySelector('#load-status-text');
  // Settings > 3D models / cars: their sheets are made now, a bit between frames (render.js warmRace3D), and the bar
  // waits for them (up to WAIT3D more), so the race's first frame doesn't stall making them; launched early (a key, a
  // click), the race makes the rest through its countdown
  const WAIT3D = 6000, need3D = warmRace3D({ cars: racers });

  function tick(now) {
    if (launched || !s.isConnected) return;
    const left = need3D ? bakesLeft(0) : 0, more = left && now - startT < dur + WAIT3D;
    const progress = Math.min(1, (now - startT) / dur, more ? 0.01 + 0.99 * Math.max(0, 1 - left / need3D) : 1);
    const pVal = Math.round(progress * 100);
    if (bar) bar.style.width = pVal + '%';
    if (pct) pct.textContent = pVal + '%';
    if (progress >= 0.8 && txt) txt.textContent = 'REV ENGINES!';
    if (progress >= 1) {
      setTimeout(launch, 80);
    } else {
      requestAnimationFrame(tick);
    }
  }
  requestAnimationFrame(tick);
}

// the humans (several may have the same racer) and a random mix of bots from whoever's left (a racer twice only if there
// aren't enough), on a shuffled grid
function botPool(taken, n) {
  const free = CHARACTERS.map((_, ci) => ci).filter(ci => !taken.includes(ci)).sort(() => Math.random() - 0.5);
  while (free.length < n) free.push(...CHARACTERS.map((_, ci) => ci).sort(() => Math.random() - 0.5));
  return free.slice(0, n);
}
function pickRacers() {
  const humans = setup.humans;
  const racers = [];
  for (let i = 0; i < humans; i++) racers.push({ ch: CHARACTERS[setup.picks[i]], human: true, pIndex: i, key: 'p' + i });
  botPool(setup.picks.slice(0, humans), setup.bots).forEach((ci, n) => racers.push({ ch: CHARACTERS[ci], human: false, pIndex: -1, key: 'b' + n }));
  // shuffle grid a bit, humans spread out
  for (let i = racers.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [racers[i], racers[j]] = [racers[j], racers[i]]; }
  return racers;
}

// a race is going on screen: a box left open over the screen before it (What's new, In the works, the room's QR code or
// name box, Settings: they sit on the page, not in #ui) is closed by its own ✕, and nothing keeps the focus. Online the race
// comes when the host starts it, whatever is open: a box left over the race took the first tap on an iPad and a name field
// in focus took the keys (2026-10-22). The pause card and the reconnect card are left be.
export function clearForRace() {
  for (const b of document.querySelectorAll('.cl-back:not(.pause-back):not(.net-recon), .clip-back')) { const x = b.querySelector('.cl-x, .clip-x'); if (x) x.click(); if (b.isConnected) b.remove(); }
  const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur();
}

// a single race on setup.track, or the cup's next race (its racers; after the first race the cup leader starts at the back)
export function startRace(opts = {}) {
  const cup = game.cup, humans = setup.humans;
  if (!cup && setup.random && !opts.again) { let t; do { t = Math.floor(Math.random() * TRACKS.length); } while (TRACKS.length > 1 && t === setup.track); setup.track = t; }   // (UI only: not the race's own luck)
  const trackIdx = opts.track ?? (cup ? cup.tracks[cup.race] : setup.track);
  const racers = opts.racers || (!cup ? pickRacers() : cupGrid(cup));   // (opts.racers: restartRace, the same grid again)
  Input.humans = humans; setKeys(humans); Input.reset();

  const launch = () => {
    game.race = new Race(trackIdx, { racers, laps: TRACKS[trackIdx].laps || setup.laps, autoUse: setup.autoUse, aiLevel: setup.aiLevel, drift: settings.drift });
    keyCars(game.race, racers);
    game.race.packMode = setup.humans >= 3;   // 3+ players: stronger catch-up so the leader can't just drive off
    resetTrackCache(); sfx.music('race' + trackIdx); noteRecent(TRACKS[trackIdx].name);
    ui.innerHTML = ''; game.state = 'race'; clearForRace();
  };

  if (opts.immediate) { launch(); return; }
  showLoading(trackIdx, racers, launch);
}


// the race on screen again from the start (the pause card's Restart, pause-ui.js): the same racers on the same grid and
// track, no loading screen; a time trial starts again; a cup's race is run again (it's only scored at its results)
export function restartRace() {
  const r = game.race; if (!r || r.net) return;
  if (r.tt) return startTimeTrial({ immediate: true });
  sfx.play('start'); startRace({ immediate: true, again: true, track: r.trackIdx, racers: r.cars.map(c => ({ ch: c.ch, human: c.human, pIndex: c.pIndex, key: c.key })) });
}

let resultsKey = null;
// screen keys that go away with their screen (the results and the podium); none while the changelog is open over them.
// Enter and Space on a focused button press that button (a keyboard user tabbing to Menu gets Menu), not the screen's key
export function screenKeys(state, map) {
  if (resultsKey) document.removeEventListener('keydown', resultsKey);
  resultsKey = e => {
    if (game.state !== state) { document.removeEventListener('keydown', resultsKey); return; }
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.cl-back')) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea')) return;   // typing in the chat (online, chat-ui.js)
    const k = e.key.toLowerCase();
    if ((k === 'enter' || k === ' ') && e.target && e.target.closest && e.target.closest('button, a, summary, [role=button]')) return;
    const fn = map[k];
    if (!fn) return;
    e.preventDefault(); e.stopPropagation(); fn();   // stopped here: the next screen's own keys (the loading screen's Enter) mustn't get this press too
  };
  document.addEventListener('keydown', resultsKey);
}
export const leave = fn => () => { document.removeEventListener('keydown', resultsKey); fn(); };
// C opens What's new on the results too, unless C is someone's gas key (4 players)
const changelogKey = () => KEYS.includes('c') || IKEYS.includes('c') || DKEYS.includes('c') ? {} : { c: openChangelog };


// ---------------------------------------------------------------- the results
// Every end-of-race screen (a race's results with a cup's standings, the cup's podium, a time trial's; online too) is drawn
// in the menu's full-screen frame (menu.css .mscreen, then results.css): a top bar with the way out (Menu, Quit cup,
// Leave room: Esc), the mode and the track, and What's new; a body of cards; a footer with the big button on the right.
// It sits over the race, which carries on behind it (main.js: the bots still finishing), see-through round the cards.
// o: { cls, label (the screen's name for a screen reader), back (the way out's words), mode (html: icon and words over
// the title), title, extra (html after the title: the cup's pips), body, foot }
const BACK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export function resultsFrame(o) {
  document.documentElement.classList.toggle('kk-still', !!settings.reduced);
  const s = document.createElement('div');
  s.className = 'screen mscreen rscreen ' + (o.cls || ''); s.tabIndex = -1;
  s.setAttribute('role', 'main'); s.setAttribute('aria-label', o.label);
  s.innerHTML = `<header class="m-top r-top">
      <button type="button" class="m-back" id="rback" title="${esc(o.back)} (Esc)" aria-label="${esc(o.back)} (Esc)">${BACK_SVG}<span>${esc(o.back)}</span></button>
      <div class="m-head"><span class="m-mode">${o.mode}</span><h1 class="m-h">${o.title}</h1></div>${o.extra || ''}
      <div class="m-util">${whatsNewBtn()}</div></header>
    <div class="m-body r-body">${o.body}</div>
    <footer class="m-foot r-foot">${o.foot}</footer><div class="sr-only" aria-live="polite" id="rlive"></div>`;
  ui.innerHTML = ''; ui.appendChild(s);
  s.querySelector('#changelog').onclick = openChangelog;
  fillMinis(s);
  s.querySelectorAll('[data-port]').forEach(el => el.appendChild(portrait(CHARACTERS[+el.dataset.port])));
  s.focus({ preventScroll: true });   // (Enter goes on, Tab starts at the top)
  return s;
}
// a line for a screen reader once the screen is in
export const announce = (s, t) => setTimeout(() => { const el = s.querySelector('#rlive'); if (el && s.isConnected) el.textContent = t; }, 450);
// a place: the number big, its ending small (read as "1st")
export const posHtml = n => `${n}<small>${ORD(n).slice(String(n).length)}</small>`;
const gapTxt = d => d < 60 ? `+${d.toFixed(2)}` : `+${fmtTime(d)}`;
// a secondary button in the footer (its key on a keycap where there's a keyboard)
export const resBtn = (id, html, key) => `<button type="button" class="r-btn" id="${id}"${key ? ` aria-keyshortcuts="${key}"` : ''}>${html}${key ? `<kbd class="kb-only">${key}</kbd>` : ''}</button>`;
// the button to the next track, with its picture
export const nextTrackBtn = (t, key = 'N', id = 'next', word = 'Next track') => `<button type="button" class="r-btn r-nexttrack" id="${id}" aria-keyshortcuts="${key}" aria-label="${word}: ${esc(TRACKS[t].name)} (${key})">${mini(t, 96, 58)}<span class="ms-t"><small>${word}</small><b>${esc(TRACKS[t].name)}</b></span><kbd class="kb-only">${key}</kbd></button>`;
const cupPipsHtml = cup => `<ol class="r-pips" aria-label="Race ${Math.min(cup.race + 1, cup.tracks.length)} of ${cup.tracks.length}">${cup.tracks.map((t, i) => `<li class="${i < cup.race ? 'done' : i === cup.race ? 'now' : ''}" title="${esc(TRACKS[t].name)}"></li>`).join('')}</ol>`;

// The results of a race (online too: net-ui.js onlineResults puts in the room's buttons and the chat). The winner big on
// their turntable (turntable.js) with this screen's own players' places and any new personal best; the finishing order,
// each row with the racer, their tag in their colour (YOU, P1-P4, or online their name; bots dimmer), the time and the gap
// to the winner, the best lap; this screen's players outlined in their colour. Rows of karts still out fill in as they
// finish (and in a single race move up and down while they're still racing). A cup race adds the points each place
// scored and the standings played out (cupBoard), how far into the cup it is and the next track.
export function showResults(race) {
  if (race.tt) return showTTResults(race);
  sfx.music('results');
  game.state = 'results';
  const sorted = [...race.cars].sort((a, b) => a.rank - b.rank), win = sorted[0];
  const name = TRACKS[race.trackIdx].name, bests = loadBests(), tb = bests[name] = bests[name] || {};
  tb.race = tb.race || {};
  const newLap = new Set(), newRace = new Set();
  for (const c of race.cars) {
    if (!race.feels(c)) continue;   // this screen's players (online: not the others')
    if (c.bestLap > 0 && c.bestLap < (tb.lap || Infinity)) { tb.lap = c.bestLap; newLap.add(c); }
    if (c.finished && c.finishTime > 0 && c.finishTime < (tb.race[race.laps] || Infinity)) { tb.race[race.laps] = c.finishTime; newRace.add(c); }
  }
  if (newLap.size || newRace.size) saveBests(bests);
  for (const c of newLap) if (c.bestLap !== tb.lap) newLap.delete(c);   // (two players both beat it: the record is the better one's)
  for (const c of newRace) if (c.finishTime !== tb.race[race.laps]) newRace.delete(c);
  // a cup race scores once, by the places as the humans finish (bots still out get the place they're running in). Online
  // only the host scores; the others get its scores with the cup (net-ui.js) and wait for them if they're here first
  const cup = game.cup && game.cup.tracks[game.cup.race] === race.trackIdx ? game.cup : null;
  if (cup && !cup.remote) scoreCup(cup, sorted);
  const scored = cup && cup.scoredN === cup.race, lastRace = cup && cup.race === cup.tracks.length - 1;
  const online = !!race.net, nHum = race.cars.filter(c => c.human).length, me = c => race.feels(c), mineCars = sorted.filter(me);
  const tag = c => online ? (c.netName || 'P' + (c.pIndex + 1)) : nHum === 1 ? 'YOU' : 'P' + (c.pIndex + 1);
  const you = c => online || nHum === 1 ? 'You' : tag(c);   // this screen's player, in a sentence
  const unit = race.track.open ? 'stage' : 'lap', Unit = unit === 'stage' ? 'Stage' : 'Lap';
  const pill = t => `<span class="r-new">${t}</span>`;
  const timeCell = c => c.finished
    ? `<b>${fmtTime(c.finishTime)}</b><small>${c === win ? 'winner' : win.finished ? gapTxt(c.finishTime - win.finishTime) : ''}</small>${newRace.has(c) ? pill('Record') : ''}`
    : `<b class="run">${Unit} ${Math.min(race.laps, Math.max(1, c.lap))}/${race.laps}</b><small>still racing</small>`;
  const lapCell = c => `<small>Best ${unit}</small><b${newLap.has(c) ? ' class="pb"' : ''}>${fmtTime(c.bestLap)}</b>${newLap.has(c) ? pill('Best') : ''}`;
  const rowKey = c => `${c.finished}|${c.lap}|${c.bestLap}`;
  const row = (c, i) => `<li class="rr ${c.human ? 'human' : 'bot'}${me(c) ? ' me' : ''}${i === 0 ? ' first' : ''}" data-car="${race.cars.indexOf(c)}" data-k="${rowKey(c)}" style="--d:${i}${c.human ? `;--pc:${PCOL[c.pIndex]}` : ''}">
      <span class="rr-pos">${posHtml(i + 1)}</span><span class="rr-port" data-port="${CHARACTERS.indexOf(c.ch)}" aria-hidden="true"></span>
      <span class="rr-who"><b class="rr-nm">${esc(c.ch.name)}</b>${c.human ? `<span class="rr-tag">${esc(tag(c))}</span>` : '<span class="rr-bot">Bot</span>'}</span>
      <span class="rr-time">${timeCell(c)}</span><span class="rr-lap">${lapCell(c)}</span>
      ${cup ? `<span class="gain" data-id="${esc(rk(c))}">${scored ? '+' + (cup.gain.get(rk(c)) ?? 0) : ''}</span>` : ''}</li>`;
  // the winner, and how this screen's other players did
  const wMine = me(win), wCol = win.human ? PCOL[win.pIndex] : win.ch.color;
  const others = mineCars.filter(c => c !== win).map(c => `<li style="--pc:${PCOL[c.pIndex]}"><span class="rr-tag">${esc(you(c))}</span><b>${ORD(sorted.indexOf(c) + 1)}</b><span>${c.finished && win.finished ? gapTxt(c.finishTime - win.finishTime) : 'still racing'}</span></li>`).join('');
  const pbs = mineCars.flatMap(c => [newRace.has(c) && `New record: <b>${fmtTime(c.finishTime)}</b>`, newLap.has(c) && `New best ${unit}: <b>${fmtTime(c.bestLap)}</b>`]
    .filter(Boolean).map(t => `<li>${mineCars.length > 1 ? `<span class="rr-tag" style="--pc:${PCOL[c.pIndex]}">${esc(tag(c))}</span>` : ''}<span>${t}</span></li>`)).join('');
  const hero = `<section class="r-card r-hero${wMine ? ' mine' : ''}" style="--pc:${wCol}" aria-labelledby="rh-k">
      <div class="rh-stage"><canvas class="rh-tt" aria-hidden="true"></canvas><span class="rh-medal" aria-hidden="true">1</span></div>
      <div class="rh-info"><h2 class="rh-kick" id="rh-k">${wMine && you(win) === 'You' ? 'You win!' : esc(win.human ? tag(win) : win.ch.name) + ' wins!'}</h2>
        ${win.human ? `<p class="rh-name">${esc(win.ch.name)}<span class="rr-tag">${esc(tag(win))}</span></p>` : ''}
        <p class="rh-time">${win.finished ? `<b>${fmtTime(win.finishTime)}</b>` : ''}<span>Best ${unit} ${fmtTime(win.bestLap)}</span></p>
        ${others ? `<ul class="rh-you" aria-label="${mineCars.length > 1 ? 'Your places' : 'Your place'}">${others}</ul>` : ''}
        ${pbs ? `<ul class="rh-pb" aria-label="New bests">${pbs}</ul>` : ''}</div></section>`;
  const order = `<section class="r-card r-order" aria-labelledby="ro-h"><h2 class="r-h" id="ro-h">${cup ? 'This race<small>points by place</small>' : 'Finishing order'}</h2><ol class="r-list" role="list">${sorted.map(row).join('')}</ol></section>`;
  const board = cup ? `<section class="r-card r-board board" aria-labelledby="rb-h"><h2 class="r-h" id="rb-h">Cup standings<small>after race ${cup.race + 1} of ${cup.tracks.length}</small></h2>
      <div class="sb-list" role="list">${scored ? '' : '<div class="board-wait" role="status">Waiting for the host\'s scores…</div>'}</div><p class="board-skip">Click or press Enter to skip</p></section>` : '';
  // the footer: in a cup what's next (the next track, or the podium); the buttons (online: the room's, net-ui.js)
  const left = cup ? cup.tracks.length - cup.race - 1 : 0;
  const nextBit = !cup ? '' : lastRace ? `<div class="r-next">${trophy(cupCol(cup.name), 'r-next-trophy')}<span class="ms-t"><small>That was the last race</small><b>The podium is next</b></span></div>`
    : `<div class="r-next">${mini(cup.tracks[cup.race + 1], 96, 58)}<span class="ms-t"><small>Next · race ${cup.race + 2} of ${cup.tracks.length}</small><b>${esc(TRACKS[cup.tracks[cup.race + 1]].name)}</b><small>${left === 1 ? 'the last race' : plural(left, 'race') + ' left'}</small></span></div>`;
  const btns = online ? '' : cup ? `<button type="button" class="big m-go" id="again" aria-keyshortcuts="Enter">${lastRace ? 'PODIUM' : 'NEXT RACE'}</button>`
    : `${nextTrackBtn((setup.track + 1) % TRACKS.length)}<button type="button" class="big m-go" id="again" aria-keyshortcuts="Enter">RACE AGAIN</button>`;
  const s = resultsFrame({
    cls: 'r-race' + (cup ? ' r-cup' : '') + (online ? ' r-online' : ''), label: `Results: ${name}`, back: cup ? 'Quit cup' : 'Menu',
    mode: cup ? `${trophy(cupCol(cup.name))}${esc(cup.name)} · race ${cup.race + 1} of ${cup.tracks.length}` : `${modeIcon(online ? 'online' : 'single')}${online ? 'Online · results' : 'Results'}`,
    title: esc(name), extra: cup ? cupPipsHtml(cup) : '',
    body: hero + order + board + (online ? '<div class="r-chat" id="rchat"></div>' : ''),
    foot: `${nextBit}<div class="r-btns" id="resbtns">${btns}</div>`,
  });
  if (!cup) s.classList.add('board-done');
  turntable(s.querySelector('.rh-tt'), { ch: win.ch, col: wCol, happy: true, phase: 0.8 }).set(win.ch, true);
  const ms = mineCars.filter(c => c !== win).map(c => `${you(c)} came ${ORD(sorted.indexOf(c) + 1)}`).join('. ');
  announce(s, `${wMine ? (you(win) === 'You' ? 'You win' : tag(win) + ' wins') : win.ch.name + ' wins'}${win.finished ? ' in ' + fmtTime(win.finishTime) : ''}.${ms ? ' ' + ms + '.' : ''}${pbs ? ' New personal best.' : ''}`);
  // the karts still out: their rows fill in as they finish (a single race also reorders them as they pass each other)
  const list = s.querySelector('.r-list');
  const live = setInterval(() => {
    if (!s.isConnected || game.race !== race) return clearInterval(live);
    for (const li of list.children) {
      const c = race.cars[+li.dataset.car], k = rowKey(c); if (li.dataset.k === k) continue;
      const fin = c.finished && !li.dataset.k.startsWith('true');
      li.dataset.k = k; li.querySelector('.rr-time').innerHTML = timeCell(c); li.querySelector('.rr-lap').innerHTML = lapCell(c);
      if (fin) { li.classList.remove('just'); void li.offsetWidth; li.classList.add('just'); }
    }
    if (cup) return;   // (a cup's places were scored as they stood)
    const now = [...race.cars].sort((a, b) => a.rank - b.rank);
    if (now.every((c, i) => +list.children[i].dataset.car === race.cars.indexOf(c))) return;
    now.forEach((c, i) => { const li = list.querySelector(`[data-car="${race.cars.indexOf(c)}"]`); list.appendChild(li); li.querySelector('.rr-pos').innerHTML = posHtml(i + 1); });
  }, 250);
  const boardCtl = scored ? cupBoard(s, cup) : { busy: () => false, skip() { } };
  s.addEventListener('click', e => { if (boardCtl.busy() && !e.target.closest('button, input, a')) boardCtl.skip(); });
  const skipOr = fn => () => boardCtl.busy() ? boardCtl.skip() : fn();
  if (online) {   // online: the host takes everyone on (net-ui.js; Enter is its big button), the others wait for it
    const go = skipOr(() => { const b = s.querySelector('#resbtns .big'); if (b) b.click(); });
    screenKeys('results', { enter: go, ' ': skipOr(() => { }), n: skipOr(() => { const b = s.querySelector('#netNext'); if (b) b.click(); }), ...changelogKey() });   // Space is the gas: it only skips; N: the next track
    return onlineResults(race, s, cup);
  }
  const again = leave(!cup ? () => startRace({ again: true }) : lastRace ? () => showPodium(cup) : () => { cup.race++; startRace(); });
  const next = leave(() => { setup.track = (setup.track + 1) % TRACKS.length; saveSetup(); startRace({ again: true }); }), menu = leave(showMenu);
  s.querySelector('#again').onclick = again; s.querySelector('#rback').onclick = menu;
  if (!cup) s.querySelector('#next').onclick = next;
  screenKeys('results', { enter: skipOr(again), ' ': skipOr(again), m: menu, escape: menu, ...(cup ? {} : { n: next }), ...changelogKey() });
}

// one row of the cup standings: place, how far they moved in the last race, who, their places so far, the points the last
// race gave, points
const mvHtml = d => d > 0 ? `<b class="up" aria-label="up ${d}">▲${d}</b>` : d < 0 ? `<b class="down" aria-label="down ${-d}">▼${-d}</b>` : '<b class="same" aria-label="same place">–</b>';
const mine = (cup, r) => cup.online ? r.pid === cup.me : r.human;   // this screen's players
function boardRow(cup, r, o) {
  const g = o.gain ? cup.gain.get(rk(r)) || 0 : null;
  return `<div class="sb${r.human ? ' human' : ' bot'}${mine(cup, r) ? ' me' : ''}${o.lead ? ' lead' : ''}" role="listitem" data-id="${esc(rk(r))}" style="--d:${o.d || 0}${r.human ? `;--pc:${PCOL[r.pIndex]}` : ''}"><i class="flash"></i>
    <span class="pos">${o.pos}</span><span class="mv">${o.mv == null ? '' : mvHtml(o.mv)}</span><span class="sb-port" data-port="${CHARACTERS.indexOf(r.ch)}" aria-hidden="true"></span>
    <span class="who"><b class="nm">${esc(r.ch.name)}</b>${standTag(r)}</span>
    <span class="chips" aria-label="places so far">${placeChips(cup, r, o.before)}</span><span class="sb-gain">${g ? '+' + g : ''}</span><span class="pts">${o.pts}</span></div>`;
}
// a racer's tag in the standings: P1..P4 in their colour (online their name), a player who left the room, a bot
const standTag = r => r.left ? `<span class="rr-tag left">${esc(r.name)} · left</span>` : r.human ? `<span class="rr-tag" style="--pc:${PCOL[r.pIndex]}">${r.name ? esc(r.name) : 'P' + (r.pIndex + 1)}</span>` : '<span class="rr-bot">Bot</span>';
const portsIn = el => el.querySelectorAll('[data-port]').forEach(p => { if (!p.firstChild) p.appendChild(portrait(CHARACTERS[+p.dataset.port])); });
// the cup standings after a race, played out in quick steps: the standings as they were; each racer's points popping out
// of the race result and flying into their total, which counts up; then the rows sliding into the new order (measured
// before and after the move, then eased from the old place to the new) with how far each one moved. A click, Enter or
// Space skips to the end, and so does reduced motion (the OS's or Settings > Reduced effects). Returns { busy(), skip() }.
function cupBoard(s, cup) {
  const list = s.querySelector('.sb-list'), first = cup.race === 0;
  const before = cupStandings(cup, true), after = cupStandings(cup), rankB = new Map(before.map((r, i) => [rk(r), i]));
  const timers = [], anims = [], flies = []; let done = false;
  const at = (ms, fn) => timers.push(setTimeout(() => { if (!done) fn(); }, ms));
  const play = (el, kf, o) => { const a = el.animate(kf, o); anims.push(a); return a; };
  const pop = (el, o = {}) => play(el, [{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1.2)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 240, easing: 'ease-out', fill: 'backwards', ...o });
  const end = () => { done = true; s.classList.add('board-done'); };
  const finish = () => {
    if (done) return;
    timers.forEach(clearTimeout); anims.forEach(a => a.cancel()); flies.forEach(f => f.remove());
    s.classList.add('instant'); s.querySelectorAll('.gain').forEach(g => g.classList.add('on'));
    list.innerHTML = after.map((r, i) => boardRow(cup, r, { pos: i + 1, pts: cup.pts.get(rk(r)), mv: first ? null : rankB.get(rk(r)) - i, lead: i === 0, gain: true })).join('');
    portsIn(list); end();
  };
  const ctl = { busy: () => !done, skip: finish };
  if (settings.reduced || reduceMotion()) { finish(); return ctl; }
  list.innerHTML = before.map((r, i) => boardRow(cup, r, { pos: first ? '–' : i + 1, pts: cup.pts.get(rk(r)) - (cup.gain.get(rk(r)) || 0), before: true, d: i })).join('');
  portsIn(list);
  const rows = new Map([...list.children].map(el => [el.dataset.id, el]));
  const order = [...s.querySelectorAll('.rr')], STEP = 230, t0 = 380 + order.length * 45, tR = t0 + order.length * STEP + 420;
  order.forEach((rr, i) => at(t0 + i * STEP, () => fly(rr)));
  at(tR, reorder);
  at(tR + 650 + after.length * 40, () => { const lead = rows.get(rk(after[0])); lead.classList.add('lead'); pop(lead.querySelector('.pos')); end(); });
  return ctl;

  function fly(rr) {
    const g = rr.querySelector('.gain'), id = g.dataset.id, row = rows.get(id); if (!row) return;
    const ptsEl = row.querySelector('.pts'), gain = cup.gain.get(id) || 0;
    g.classList.add('on'); pop(g);
    if (!gain) return land(row, ptsEl, id);
    const a = g.getBoundingClientRect(), b = ptsEl.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2, dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay, lift = Math.min(60, 24 + Math.abs(dx) * 0.08);
    const f = document.createElement('div'); f.className = 'fly-pts' + (rr.classList.contains('human') ? ' human' : ''); f.textContent = '+' + gain; f.setAttribute('aria-hidden', 'true');
    f.style.left = ax + 'px'; f.style.top = ay + 'px'; document.body.appendChild(f); flies.push(f);
    play(f, [{ transform: 'translate(-50%,-50%) scale(.8)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: 0.15 },
      { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - lift}px)) scale(1.25)`, opacity: 1, offset: 0.55 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.7)`, opacity: 0.9 }], { duration: 420, delay: 60, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'backwards' })
      .onfinish = () => { f.remove(); land(row, ptsEl, id); };
  }
  function land(row, ptsEl, id) {
    if (done) return;
    const from = +ptsEl.textContent || 0, to = cup.pts.get(id), start = performance.now(), dur = 260;
    const tick = now => { if (done) return; const k = Math.min(1, (now - start) / dur); ptsEl.textContent = Math.round(from + (to - from) * k); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    play(ptsEl, [{ transform: 'scale(1)' }, { transform: 'scale(1.35)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
    play(row.querySelector('.flash'), [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], 500);
    const gn = cup.gain.get(id) || 0; if (gn) { const sg = row.querySelector('.sb-gain'); sg.textContent = '+' + gn; pop(sg); }
    const chips = row.querySelector('.chips'); chips.insertAdjacentHTML('beforeend', chip(cup.places.get(id).at(-1))); pop(chips.lastElementChild);
    sfx.play('lap', 0.35);
  }
  function reorder() {
    const top0 = new Map([...rows].map(([id, el]) => { el.style.animation = 'none'; return [id, el.getBoundingClientRect().top]; }));   // moving a row would replay its entrance
    after.forEach((r, i) => { const el = rows.get(rk(r)); list.appendChild(el); el.querySelector('.pos').textContent = i + 1; });
    let moved = false;
    after.forEach((r, i) => {
      const el = rows.get(rk(r)), d = top0.get(rk(r)) - el.getBoundingClientRect().top;
      if (Math.abs(d) > 1) {
        moved = true; el.style.zIndex = d > 0 ? 3 : 2;   // the ones climbing pass over the ones dropping
        play(el, [{ transform: `translateY(${d}px)` }, { transform: `translateY(${d * 0.45}px) scale(${d > 0 ? 1.03 : 0.98})`, offset: 0.5 }, { transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.3,.7,.2,1)' })
          .onfinish = () => { el.style.zIndex = ''; };
      }
      if (!first) { const mv = el.querySelector('.mv'); mv.innerHTML = mvHtml(rankB.get(rk(r)) - i); pop(mv, { delay: 380 + i * 40 }); }
    });
    if (moved) sfx.play('shortcut', 0.4);
  }
}

// the end of a cup: the top three on the podium (the champion in the middle, highest, cheering; turntable.js
// podiumFigure), confetti, the final standings and the cup's tracks. Online everyone sees it; the host takes them back to
// the room (net-ui.js onlinePodium)
export function showPodium(cup) {
  game.state = 'podium'; game.race = null; bgTrack(cup.tracks[cup.tracks.length - 1]);
  const order = cupStandings(cup), champ = order[0], champMine = mine(cup, champ);
  sfx.music('results'); sfx.play(champMine ? 'win' : 'rivalWin');
  const step = (r, place) => r ? `<div class="pod-col pod${place}${mine(cup, r) ? ' me' : ''}"${r.human ? ` style="--pc:${PCOL[r.pIndex]}"` : ''}><div class="pod-art" data-art="${place}"></div>
      <div class="pod-step"><span class="pod-num">${place}</span><span class="pod-name">${esc(r.ch.name)}</span><span class="pod-tag">${standTag(r)}</span><span class="pod-pts">${cup.pts.get(rk(r))} pts</span></div></div>` : '';
  const COLS = ['#ff5a3c', '#ffb02e', '#ffc93c', '#3fa7ff', '#2fc27a', '#ff5d73', '#b29bff', '#ffffff'];
  const calm = settings.reduced || reduceMotion();
  const confetti = calm ? '' : Array.from({ length: 70 }, () => `<i style="left:${(Math.random() * 100).toFixed(1)}%;background:${COLS[Math.floor(Math.random() * COLS.length)]};animation-delay:${(1.2 + Math.random() * 2.5).toFixed(2)}s;animation-duration:${(2.6 + Math.random() * 2).toFixed(2)}s;--dx:${Math.round(Math.random() * 160 - 80)}px"></i>`).join('');
  const champWho = champMine ? (cup.online || cup.racers.filter(r => r.human).length === 1 ? 'You win' : `${esc(champ.name || 'P' + (champ.pIndex + 1))} wins`) : `${esc(champ.ch.name)} wins`;
  const s = resultsFrame({
    cls: 'r-podium' + (cup.online ? ' r-online' : ''), label: `${cup.name}: the podium`, back: 'Menu',
    mode: `${trophy(cupCol(cup.name))}${esc(cup.name)} · ${plural(cup.tracks.length, 'race')}`, title: 'Champion',
    body: `<section class="r-card r-pod" aria-labelledby="rp-h"><h2 class="rp-sum" id="rp-h"><b>${champWho}</b> the ${esc(cup.name)} with ${cup.pts.get(rk(champ))} points</h2>
        <div class="pod-stage"><div class="pod-rays"></div><div class="podium">${step(order[1], 2)}${step(order[0], 1)}${step(order[2], 3)}</div></div></section>
      <section class="r-card r-board board final" aria-labelledby="rb-h"><h2 class="r-h" id="rb-h">Final standings</h2>
        <div class="sb-list" role="list">${order.map((r, i) => boardRow(cup, r, { pos: i + 1, pts: cup.pts.get(rk(r)), lead: i === 0, d: i })).join('')}</div>
        <div class="pod-trail" aria-hidden="true">${cup.tracks.map(t => mini(t, 64, 40)).join('<i class="ct-link"></i>')}</div></section>
      ${cup.online ? '<div class="r-chat" id="rchat"></div>' : ''}`,
    foot: `<div class="r-btns" id="podbtns">${resBtn('again', 'Race this cup again', 'R')}<button type="button" class="big m-go" id="menu" aria-keyshortcuts="Enter">MENU</button></div>`,
  });
  s.insertAdjacentHTML('afterbegin', `<div class="confetti" aria-hidden="true">${confetti}</div>`);
  // the mascots on their steps: the champion big and happy, second and third smaller
  for (const p of [1, 2, 3]) {
    const r = order[p - 1], w = s.querySelector(`[data-art="${p}"]`); if (!r || !w) continue;
    const art = document.createElement('canvas'); art.setAttribute('aria-hidden', 'true'); w.appendChild(art);   // (live: they sway, the champion hops; turntable.js)
    podiumFigure(art, { ch: r.ch, size: p === 1 ? 3.6 * 100 / 260 : 2.7 * 100 / 200, mood: p === 1 ? 'happy' : undefined, hop: p === 1, phase: p * 1.7, yaw: Math.PI * [0.5, 0.3, 0.7][p - 1] });
  }
  announce(s, `${champWho.replace(/<[^>]+>/g, '')} the ${cup.name} with ${cup.pts.get(rk(champ))} points.`);
  if (cup.online) { onlinePodium(s, cup); screenKeys('podium', { enter: () => { const b = s.querySelector('#podbtns .big'); if (b) b.click(); }, ...changelogKey() }); return; }
  const menu = leave(showMenu), again = leave(() => startCup(cup.tracks, cup.name));
  s.querySelector('#menu').onclick = menu; s.querySelector('#rback').onclick = menu; s.querySelector('#again').onclick = again;
  screenKeys('podium', { enter: menu, ' ': menu, escape: menu, m: menu, r: again, ...changelogKey() });
}
