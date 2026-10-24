// Kernel Kart: shared helpers, constants and the characters.

// ---------------------------------------------------------------- helpers
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const rnd = (a, b) => a + Math.random() * (b - a);
export const STEP = 2;                     // track resample spacing (world units)
// gas/item/drift keys per player, spread across the keyboard. With 2 players they sit at opposite ends. The third key
// of each set (drift, race-drift.js: the experimental drift button) sits just right of the pair; one player can also
// drift with Shift.
const KEYSETS = { 1: [['q', 'w', 'e']], 2: [['q', 'w', 'e'], ['o', 'p', '[']], 3: [['q', 'w', 'e'], ['v', 'b', 'n'], ['[', ']', '\\']], 4: [['q', 'w', 'e'], ['c', 'v', 'b'], ['n', 'm', ','], ['o', 'p', '[']] };
export let KEYS = ['q'], IKEYS = ['w'], DKEYS = ['e'];
export function setKeys(humans) { KEYS = KEYSETS[humans].map(k => k[0]); IKEYS = KEYSETS[humans].map(k => k[1]); DKEYS = KEYSETS[humans].map(k => k[2]); }
export const CAR_L = 70, CAR_W = 34;      // a standard kart's footprint (each body has its own, see BODIES)
export const WORLD_SCALE = 1.3;            // tracks are authored in ~1200x700 and scaled up      // kart footprint in world units  // one button per player
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
// No special traits: each racer is its stats, its car's size and its weight (the user removed the side-effect traits).
// One exception the user asked for: Cpp's `fragile` (hits wear off that many times slower; see shakeOff in rules.js).
export const CHARACTERS = [
  { id: 'gopher', name: 'Gopher', lang: 'Go',      body: 'kart',   color: '#6ad7e5', accent: '#2a7f93', stats: { accel: 0.8, top: 0.33, grip: 0.62, weight: 0.9 },               trait: 'Quick off the line', blurb: 'A classic kart. Rockets off the line and out of corners, runs out of puff on long straights.',
    balance: 'The lowest top speed (0.33) on a strong launch (0.80) and fair grip (0.62): a little slower than average alone (+0.21%), best on the twisty ones (Crab Harbor -2.8%, Merge Bay -2.3%), worst where the straights or the hills run on (Race Condition +3.0%, Gradient Descent +4.9%). The launch pays back after every hit and stall. Places 2.49 ±0.14 (640 races, 20 tracks, 2026-10-22; four 640-race runs, drift on and off: 2.45). It placed 2.60 at top 0.30 and grip 0.60, the lowest of the regulars; top 0.33 alone still left it 2.58-2.62 with drift on, so grip came up a little too.' },
  { id: 'ferris', name: 'Ferris', lang: 'Rust',    body: 'truck',  color: '#f46623', accent: '#7a2c0a', stats: { accel: 0.3, top: 0.55, grip: 0.72, weight: 1.6 },             trait: 'Heavy & grippy', blurb: 'A monster truck that corners on rails and bulldozes anyone it touches. Slow to get going.',
    balance: 'Grip 0.72 takes corners nearly flat: the second-quickest alone (-1.64%), best on the corner-heavy tracks (Pipeline Pass and Assembly Line -4.3%), worst where top speed rules (Heap Space +1.4%, Kernel Pretzel +3.1%). Paid for in races by the slowest launch (0.30) after every spin and the big 90x48 truck that gets hit and can\'t hug the inside. Places 2.24 ±0.14 (640 races, 20 tracks, 2026-10-22; four 640-race runs, drift on and off: 2.36: this run was kind to it, the others put it 2.35-2.44).' },
  { id: 'pyth',   name: 'Pyth',   lang: 'Python',  body: 'sports', color: '#3b7bbf', accent: '#ffd43b', stats: { accel: 0.76, top: 0.47, grip: 0.54, weight: 0.8 },             trait: 'Nippy', blurb: 'A little rear-engined sports car: quick to get going, a bit tail-happy in the corners.',
    balance: 'Middling everything with a good launch (0.76): a little quicker than average alone (-0.63%) and within about 2% of the field on every track (best Kernel Pretzel -2.2%, Assembly Line -2.0%; worst Gateway 8080 +0.7%, Gradient Descent +1.1%), light (0.8) so it gets shoved. Places 2.43 ±0.13 (640 races, 20 tracks, 2026-10-22; four 640-race runs, drift on and off: 2.44): even all-rounders do well when the launch saves them after hits.' },
  { id: 'octo',   name: 'Octo',   lang: 'Git',     body: 'kart',   color: '#a7a7a7', accent: '#f05032', stats: { accel: 0.58, top: 0.57, grip: 0.57, weight: 1.0 },            trait: 'All-rounder', blurb: 'Perfectly balanced: no strengths, no weaknesses.',
    balance: 'The reference kart: middle stats, middle pace on every track (-0.41% alone; best Kernel Pretzel -3.1%, Pyth Plateau -1.6%; worst Gradient Descent +1.6%, Assembly Line +2.6%). No weakness to exploit, so it places 2.30 ±0.13 (640 races, 20 tracks, 2026-10-22; four 640-race runs, drift on and off: 2.37), among the best but inside the range.' },
  { id: 'tux',    name: 'Tux',    lang: 'Linux',   body: 'sled',   color: '#2b2b2b', accent: '#f6c21a', stats: { accel: 0.56, top: 0.66, grip: 0.5, weight: 1.0 },            trait: 'Long and fast', blurb: 'A bobsled. Quick on the straights, long and a little slidey in the bends.',
    balance: 'Quick on straights (top 0.66) but low grip (0.50) and a long sled: +0.41% alone (-0.26% with drift on: drifting covers its grip), best on Assembly Line (-2.3%) and Race Condition (-1.4%), worst where the corners pile up (Kernel Pretzel +2.7%, Crab Harbor +3.3%). Places 2.59 ±0.13 (640 races, 20 tracks, 2026-10-22; four 640-race runs, drift on and off: 2.52). Grip came up from 0.48: with drift on it placed 2.60-2.63.' },
  { id: 'duke',   name: 'Duke',   lang: 'Java',    body: 'f1',     color: '#f0f0f0', accent: '#e0162b', stats: { accel: 0.68, top: 0.92, grip: 0.4, weight: 0.9 },            trait: 'Top speed', blurb: 'A long, low formula car. The fastest thing on a straight. Barely any grip.',
    balance: 'The fastest thing on a straight bar Cpp (top 0.92) with little grip (0.40): -0.85% alone, best on Heap Space (-3.5%) and Gradient Descent (-2.9%), worst on Neon Overflow (+1.3%) and Crab Harbor (+1.9%). Light (0.9) and long, so it loses shoves and can\'t hug the inside. Places 2.50 ±0.14 (640 races, 20 tracks, 2026-10-22; four 640-race runs, drift on and off: 2.48). Top came down from 0.94: drift lets it take the corners its grip can\'t, and with drift on it placed 2.18-2.29.' },
  { id: 'docky',  name: 'Docky',  lang: 'Docker',  body: 'van',    color: '#2496ed', accent: '#0b4f8a', stats: { accel: 0.3, top: 0.9, grip: 0.59, weight: 2.0 },              trait: 'Heaviest', blurb: 'A whale in a container lorry. Huge, heavy and fast once rolling. Takes an age to get there.',
    balance: 'Fast once rolling (top 0.90) with fair grip (0.59): the quickest alone (-1.74%; -2.34% with drift on) and never slower than average anywhere (best Gradient Descent -5.7%, Duke\'s Volcano -3.5%; worst Crab Harbor -0.4%, Recursion Ridge 0.0%). Paid for by the worst launch (0.30) after every start, spin and stall, and the biggest target; heavy (2.0), so it wins shoves. Places 2.27 ±0.14 (640 races, 20 tracks, 2026-10-22; four 640-race runs, drift on and off: 2.31), still the strongest of the regulars but inside the range: watch it. It placed 2.21-2.23 at top 0.94 and grip 0.62.' },
  { id: 'swifty', name: 'Swifty', lang: 'Swift',   body: 'buggy',  color: '#f05138', accent: '#ffb199', stats: { accel: 0.98, top: 0.66, grip: 0.38, weight: 0.5 },             trait: 'Lightest', blurb: 'A tiny dune buggy. Lightning launch and good speed, but slippery and easily shoved.',
    balance: 'The best launch (0.98) and good speed (0.66) on the least grip of the regulars (0.38) and the lightest weight (0.5): about average alone (+0.38%), best where a launch out of a slow corner meets a long straight (Merge Bay -3.2%, Recursion Ridge -1.5%; with drift on Pipeline Pass -6.9%), worst on stop-start bends (Race Condition +2.9%, Assembly Line +6.7%), and shoved around in a pack. Places 2.54 ±0.13 (640 races, 20 tracks, 2026-10-22; four 640-race runs, drift on and off: 2.48), inside the range.' },
  { id: 'cpp',    name: 'Cpp',    lang: 'C++',     body: 'hyper',  color: '#659ad2', accent: '#00599c', stats: { accel: 1.0, top: 1.0, grip: 0.04, weight: 0.56 }, trait: 'All speed, no grip', blurb: "A concept hypercar with every safety check stripped out: flat-out speed and launch, no grip at all and no weight, so every corner and every shove is a fight.",
    balance: 'The user set it exactly: speed and launch 100 (top and accel 1.0, the most in the game), grip 5 and weight 5 on the menu (grip 0.04, weight 0.56), no trait. Grip is worth more than speed on these tracks, so it is the weakest racer by a distance: +4.66% alone (only Gradient Descent suits it, -1.8%; Merge Bay +10.5%, Duke\'s Volcano +11.6%), places 3.26 ±0.12 (640 races, 20 tracks, 2026-10-22; four 640-race runs, drift on and off: 3.20). A little grip (0.1) with more speed (1.75 top, 1.5 accel) placed 2.72, if it ever needs to be competitive.' },
  { id: 'droid',  name: 'Bugdroid', lang: 'Android', body: 'ekart', color: '#3ddc84', accent: '#073042', stats: { accel: 0.8, top: 0.36, grip: 0.64, weight: 0.7 }, trait: 'Hairpin king', blurb: 'A boxy little electric kart. Instant torque and loads of grip carry it through the hairpins; runs out of volts on the straights.',
    balance: 'High grip (0.64) and a quick launch (0.80) on a low top speed (0.36), in a small, light kart (62x34, weight 0.7): it carries its speed through the hairpins and is back up to speed fast after every hit, then runs out of volts on the long straights. Alone -0.40% (+0.64% with drift on: the others gain more from drifting), best on Assembly Line (-3.1%) and Merge Bay (-2.5%), worst on Heap Space (+1.9%) and Gradient Descent (+2.9%); light, so it loses shoves. Places 2.35 ±0.14 (640 races, 20 tracks, 2026-10-22; four 640-race runs, drift on and off: 2.39). It placed 2.20 at grip 0.66 and accel 0.85, the best of the regulars, so both came down a little (the user\'s starting stats, top 0.45 and grip 0.70, placed 2.00).' },
];
export const STAT_NUM = v => Math.round(1 + v * 99);   // what the menu shows
export const TOP_SPEED = st => 410 * (0.832 + 0.36 * st.top);   // was 432: everyone 5% slower on the straights. Spread narrowed 25% (was 0.76 + 0.48 * top, same average): top speed was worth too much on the big tracks
// The Turbo item kept its pre-cut speeds: while a Turbo burns, speeds are scaled back up to the old 432 base,
// so it's slightly stronger relative to the karts. Pads, trick landings and slingshots use the plain base.
export const TURBO_SCALE = 432 / 410;
export const ACCEL     = st => 167 * (0.534 + 0.9533 * st.accel);   // 176 until 2026-10-21 (the user: everyone's acceleration slightly worse, the stats unchanged; 8% tried first, then 5%): 5% less for everyone. Before that 0.55 + 0.90: same at the lowest accel (0.30), ~6% steeper above it, so launch and grip pay a bit more next to top speed
export const GRIP      = st => 430 * (0.7253 + 0.5567 * st.grip);   // was 0.74 + 0.52: same at the lowest grip (0.40), ~7% steeper above it. was 470: corners ask for a bit more lifting (the user found it too easy to take everything flat)
export const LIFT_DECEL = v => 200 + 0.85 * v;   // deceleration when you let go of the button
let cosmetic = mulberry(0x5eed);
export const seedCosmetic = (seed = 0x5eed) => { cosmetic = mulberry(seed); };   // (the tests: a measurement that sends particles doesn't depend on what ran before it)
export const frnd = (a, b) => a + cosmetic() * (b - a);
export const fchance = p => cosmetic() < p;
