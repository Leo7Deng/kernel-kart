// Kernel Kart: shared helpers, constants and the characters.

// ---------------------------------------------------------------- helpers
import { Math } from './detmath.js';   // deterministic maths, the same on every computer (detmath.js)
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const rnd = (a, b) => a + Math.random() * (b - a);
export const STEP = 2;                     // track resample spacing (world units)
// gas/item/drift keys per player, spread across the keyboard (one player can also drift with Shift)
const KEYSETS = { 1: [['q', 'w', 'e']], 2: [['q', 'w', 'e'], ['o', 'p', '[']], 3: [['q', 'w', 'e'], ['v', 'b', 'n'], ['[', ']', '\\']], 4: [['q', 'w', 'e'], ['c', 'v', 'b'], ['n', 'm', ','], ['o', 'p', '[']] };
export let KEYS = ['q'], IKEYS = ['w'], DKEYS = ['e'];
export function setKeys(humans) { KEYS = KEYSETS[humans].map(k => k[0]); IKEYS = KEYSETS[humans].map(k => k[1]); DKEYS = KEYSETS[humans].map(k => k[2]); }
export const CAR_L = 70, CAR_W = 34;      // a standard kart's footprint (each body has its own, see BODIES)
export const WORLD_SCALE = 1.3;            // tracks are authored in ~1200x700 and scaled up
export const PCOL = ['#ff5d73', '#3fa7ff', '#2fc27a', '#f5a524'];
export const ORD = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)]);
// Randomness has three sources, so changing one thing (an item use, a particle) doesn't reshuffle everything else:
//   frnd/fchance: cosmetic only (particles, puffs, sounds), never affects the race
//   car.rng: one stream per car for its own luck (bot reactions, tricks, fork plans, item rolls, slides)
//   race.rng: the race's own (train timing). Math.random is only used to seed these and to set up the grid.
export function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- characters
// Car bodies: footprint in world units (length × width) and where the driver sits (x, in drawing units). A bigger car is
// a bigger target and can't hug the inside of a corner as tightly; how hard it shoves is its driver's weight.
export const BODIES = {
  kart:   { L: 70, W: 34, seat: -6,  name: 'Go-kart' },
  ekart:  { L: 62, W: 34, seat: -4,  name: 'Electric kart' },
  buggy:  { L: 62, W: 30, seat: -4,  name: 'Dune buggy' },
  bubble: { L: 62, W: 36, seat: -3,  name: 'Bubble car' },
  beetle: { L: 64, W: 34, seat: -4,   name: 'Beetle' },
  sports: { L: 68, W: 38, seat: -3,  name: 'Sports car' },
  sled:   { L: 78, W: 28, seat: -8,  name: 'Bobsled' },
  f1:     { L: 82, W: 30, seat: -9,  name: 'Formula car' },
  hyper:  { L: 84, W: 40, seat: -1,  name: 'Hypercar' },
  truck:  { L: 90, W: 48, seat: 7,   name: 'Monster truck' },
  van:    { L: 94, W: 40, seat: 18,  name: 'Container lorry' },
};
// Stats are relative ratings (0..1), not absolute speeds. Everyone has a weakness.
// accel: launch & corner exit. top: top speed. grip: how hard it can turn. weight: who wins a shove (0.5 light … 2 heavy).
// No special traits beyond stats, car size and weight, except Cpp's `fragile` (hits wear off that many times slower;
// see shakeOff in rules.js).
export const CHARACTERS = [
  { id: 'gopher', name: 'Gopher', lang: 'Go',      body: 'kart',   color: '#6ad7e5', accent: '#2a7f93', stats: { accel: 0.8, top: 0.33, grip: 0.62, weight: 0.9 },               trait: 'Quick off the line', blurb: 'A classic kart. Rockets off the line and out of corners, runs out of puff on long straights.',
    balance: 'The lowest top speed (0.33) on a strong launch (0.80) and fair grip (0.62): a little slower than average alone (+0.61%; +1.02% with drift on), best on the twisty ones (Merge Bay -3.0%, Assembly Line -1.8%), worst where the straights or the hills run on (Recursion Ridge +3.3%, Gradient Descent +5.5%, +6.9% with drift on: the ski run is all top speed). The launch pays back after every hit and stall. Places 2.38 ±0.13 (640 races, 20 tracks, 2026-10-29; 2.52 ±0.13 with drift on, where the others\' drifting closes on its corners). It placed 2.60 at top 0.30 and grip 0.60, the lowest of the regulars; top 0.33 alone still left it 2.58-2.62 with drift on, so grip came up a little too.' },
  { id: 'ferris', name: 'Ferris', lang: 'Rust',    body: 'truck',  color: '#f46623', accent: '#7a2c0a', stats: { accel: 0.3, top: 0.55, grip: 0.72, weight: 1.6 },             trait: 'Heavy & grippy', blurb: 'A monster truck that corners on rails and bulldozes anyone it touches. Slow to get going.',
    balance: 'Grip 0.72 takes corners nearly flat: the second-quickest alone (-1.52%; -1.01% with drift on, where drifting gives everyone some of that grip), best on the corner-heavy tracks (Pipeline Pass -4.0%, Kernel Pretzel -3.6%), worst where top speed rules (Gradient Descent 0.0%, Duke\'s Volcano +5.3% with drift off; with drift on the Volcano is its best, -6.0%, and Heap Space its worst, +1.9%). Paid for in races by a slow launch (0.30, only Docky\'s is slower) after every spin and the big 90x48 truck that gets hit and can\'t hug the inside. Places 2.36 ±0.14 (640 races, 20 tracks, 2026-10-29; 2.54 ±0.14 with drift on).' },
  { id: 'pyth',   name: 'Pyth',   lang: 'Python',  body: 'sports', color: '#3b7bbf', accent: '#ffd43b', stats: { accel: 0.76, top: 0.47, grip: 0.54, weight: 0.8 },             trait: 'Nippy', blurb: 'A little rear-engined sports car: quick to get going, a bit tail-happy in the corners.',
    balance: 'Middling everything with a good launch (0.76): about average alone (-0.32%; +0.46% with drift on) and within about 2.5% of the field on every track with drift off (best Kernel Pretzel -2.6%, Merge Bay -1.8%; worst Gateway 8080 +0.6%, Gradient Descent +2.3%). With drift on Gradient Descent is the exception (+7.2%): its low top speed (0.47) is what the ski run rewards least, and the drifting there pays the fast karts most. Light (0.8) so it gets shoved. Places 2.43 ±0.14 (640 races, 20 tracks, 2026-10-29; 2.40 ±0.12 with drift on): even all-rounders do well when the launch saves them after hits.' },
  { id: 'octo',   name: 'Octo',   lang: 'Git',     body: 'kart',   color: '#a7a7a7', accent: '#f05032', stats: { accel: 0.58, top: 0.57, grip: 0.57, weight: 1.0 },            trait: 'All-rounder', blurb: 'Perfectly balanced: no strengths, no weaknesses.',
    balance: 'The reference kart: middle stats, middle pace on every track (-0.45% alone, -0.50% with drift on; best Recursion Ridge -2.3%, Pyth Plateau -1.9%, with drift on Kernel Pretzel -3.1%; worst Assembly Line +2.5%, with drift on Crab Harbor +4.7%). No weakness to exploit, so it places 2.36 ±0.13 (640 races, 20 tracks, 2026-10-29; 2.31 ±0.14 with drift on), among the best but inside the range.' },
  { id: 'tux',    name: 'Tux',    lang: 'Linux',   body: 'sled',   color: '#2b2b2b', accent: '#f6c21a', stats: { accel: 0.56, top: 0.66, grip: 0.5, weight: 1.0 },            trait: 'Long and fast', blurb: 'A bobsled. Quick on the straights, long and a little slidey in the bends.',
    balance: 'Quick on straights (top 0.66) but low grip (0.50) and a long sled: average alone (-0.10%; +0.02% with drift on), best where a straight or a fast sweep follows the corners (Async Atoll -1.9%, Duke\'s Volcano -1.9%; with drift on Gradient Descent -3.8%), worst where the corners pile up (Pipeline Pass +2.1%, Crab Harbor +3.0%, +5.5% with drift on). Places 2.53 ±0.13 (640 races, 20 tracks, 2026-10-29; 2.47 ±0.13 with drift on). Grip came up from 0.48: with drift on it placed 2.60-2.63.' },
  { id: 'duke',   name: 'Duke',   lang: 'Java',    body: 'f1',     color: '#f0f0f0', accent: '#e0162b', stats: { accel: 0.68, top: 0.92, grip: 0.4, weight: 0.9 },            trait: 'Top speed', blurb: 'A long, low formula car. The fastest thing on a straight. Barely any grip.',
    balance: 'The fastest thing on a straight bar Cpp (top 0.92) with little grip (0.40): -0.41% alone (-0.76% with drift on), the quickest of all on Gradient Descent (-4.3%, -7.5% with drift on: the ski run is top speed and drift) and Heap Space (-3.1%), worst on the stop-start ones (Race Condition +3.2%, Merge Bay +3.8%; with drift on Duke\'s Volcano +7.3%). Light (0.9) and long, so it loses shoves and can\'t hug the inside. Places 2.33 ±0.13 (640 races, 20 tracks, 2026-10-29; 2.35 ±0.14 with drift on). Top came down from 0.94: drift lets it take the corners its grip can\'t, and with drift on it placed 2.18-2.29.' },
  { id: 'docky',  name: 'Docky',  lang: 'Docker',  body: 'van',    color: '#2496ed', accent: '#0b4f8a', stats: { accel: 0.28, top: 0.9, grip: 0.59, weight: 2.0 }, driftGrip: 1.4, trait: 'Heaviest', blurb: 'A whale in a container lorry. Huge, heavy and fast once rolling. Takes an age to get there.',
    balance: 'Fast once rolling (top 0.90) with fair grip (0.59): the quickest alone (-1.86%, -1.87% with drift on; a full drift adds only 0.4 to its grip, `driftGrip` 1.4 against everyone\'s 1.5, since a lorry doesn\'t tuck in as tight sliding), best on Async Atoll and Duke\'s Volcano, worst on Crab Harbor and Recursion Ridge (within 1% there). Paid for by the worst launch in the game (0.28) after every start, spin, stall and shove, and the biggest target; heavy (2.0), so it wins shoves. Places 2.43 ±0.14 with drift off, 2.37 ±0.14 with drift on (640 races, 20 tracks), mid-pack.' },
  { id: 'swifty', name: 'Swifty', lang: 'Swift',   body: 'buggy',  color: '#f05138', accent: '#ffb199', stats: { accel: 0.98, top: 0.66, grip: 0.38, weight: 0.5 },             trait: 'Lightest', blurb: 'A tiny dune buggy. Lightning launch and good speed, but slippery and easily shoved.',
    balance: 'The best launch (0.98) and good speed (0.66) on the least grip of the regulars (0.38) and the lightest weight (0.5): about average alone (+0.10%; -0.07% with drift on), best where a launch meets a long run (Crab Harbor -3.7%, Gradient Descent -3.1%, -4.8% with drift on; Gateway 8080 -2.9% with drift on), worst on stop-start bends (Pipeline Pass +3.0%, Assembly Line +3.1%; with drift on Duke\'s Volcano +6.8%), and shoved around in a pack. Places 2.50 ±0.13 (640 races, 20 tracks, 2026-10-29; 2.49 ±0.13 with drift on), inside the range.' },
  { id: 'cpp',    name: 'Cpp',    lang: 'C++',     body: 'hyper',  color: '#659ad2', accent: '#00599c', stats: { accel: 1.0, top: 1.0, grip: 0.04, weight: 0.56 }, trait: 'All speed, no grip', blurb: "A concept hypercar with every safety check stripped out: flat-out speed and launch, no grip at all and no weight, so every corner and every shove is a fight.",
    balance: 'The user set it exactly: speed and launch 100 (top and accel 1.0, the most in the game), grip 5 and weight 5 on the menu (grip 0.04, weight 0.56), no trait. Grip is worth more than speed on these tracks, so it is the weakest racer by a distance: +4.34% alone (+3.32% with drift on), only Gradient Descent suits it (-0.9%, -2.1% with drift on) and Heap Space nearly (+1.8%); worst Assembly Line +7.4% and Merge Bay +10.0% (with drift on Race Condition +8.9%). Places 3.29 ±0.11 (640 races, 20 tracks, 2026-10-29; 3.22 ±0.11 with drift on). A little grip (0.1) with more speed (1.75 top, 1.5 accel) placed 2.72, if it ever needs to be competitive.' },
  { id: 'droid',  name: 'Bugdroid', lang: 'Android', body: 'ekart', color: '#3ddc84', accent: '#073042', stats: { accel: 0.8, top: 0.36, grip: 0.64, weight: 0.7 }, trait: 'Hairpin king', blurb: 'A boxy little electric kart. Instant torque and loads of grip carry it through the hairpins; runs out of volts on the straights.',
    balance: 'High grip (0.64) and a quick launch (0.80) on a low top speed (0.36), in a small, light kart (62x34, weight 0.7): it carries its speed through the hairpins and is back up to speed fast after every hit, then runs out of volts on the long straights. Alone -0.47% (+0.57% with drift on: the others gain more from drifting), best on Merge Bay (-4.4%) and Assembly Line (-2.7%), worst on Heap Space (+1.2%) and Gradient Descent (+4.1%, +8.6% with drift on: the slowest there); light, so it loses shoves. Places 2.36 ±0.15 (640 races, 20 tracks, 2026-10-29; 2.44 ±0.14 with drift on). It placed 2.20 at grip 0.66 and accel 0.85, the best of the regulars, so both came down a little (the user\'s starting stats, top 0.45 and grip 0.70, placed 2.00).' },
];
export const STAT_NUM = v => Math.round(1 + v * 99);   // what the menu shows
export const TOP_SPEED = st => 410 * (0.832 + 0.36 * st.top);
// a burning Turbo scales speeds back up to the old 432 base, so it's slightly stronger than pads and trick boosts
export const TURBO_SCALE = 432 / 410;
export const ACCEL     = st => 167 * (0.534 + 0.9533 * st.accel);
export const GRIP      = st => 430 * (0.7253 + 0.5567 * st.grip);
export const LIFT_DECEL = v => 200 + 0.85 * v;   // deceleration when you let go of the button
let cosmetic = mulberry(0x5eed);
export const seedCosmetic = (seed = 0x5eed) => { cosmetic = mulberry(seed); };   // (tests: so particles don't depend on what ran before)
export const frnd = (a, b) => a + cosmetic() * (b - a);
export const fchance = p => cosmetic() < p;
