// Fight mode's fighters: FIGHTERS[id], every number the sim (js/fight.js) and the bots (js/fight-ai.js) use, plus the
// names and blurbs the setup screen and README show. Every fighter is a kit: its entry comes from its plug-in,
// js/kits/<id>.js (its `fighter`: the shape is in js/kits/index.js), gathered below. Times are seconds, distances world units (a mascot is ~46 tall),
// speeds units/s. A move's kb is its knockback speed (units/s) before weight; `reach` is measured from the body's edge; `arc` is the hit cone in degrees round the
// facing. Filled in when this file loads (so a fighter only writes what it needs): a move's or a sub-hit's kb (0 when
// it has damage and no kb), each sub-hit in SUBS never going stale on its own (stale: false), and the cooldowns scaled
// per key (CD_MUL).
import { PLUGINS } from './kits/index.js';

// the pickable fighters, in the roster's order
export const FIGHT_ORDER = ['tux', 'duke', 'gopher', 'ferris', 'pyth', 'octo', 'docky', 'swifty', 'cpp', 'droid'];
// fighters still being reworked: the roster greys their tiles with a WIP tag, they stay pickable
// (and in Random). Take each one out as its rework lands
export const FIGHT_WIP = [];
export const FIGHT_PICK = FIGHT_ORDER;
export const FIGHT_SOON = [];   // (racers shown greyed out as "soon", not pickable)
// a fighter's moves, in key order (the light, heavy and special keys fire them: fight.js MOVE_OF), then the evade on guard
export const MOVE_KEYS = ['move1', 'move2', 'move3'];

export const FIGHTERS = {};
// every fighter (js/kits/<id>.js, listed in js/kits/index.js) brings its own FIGHTERS entry
for (const p of PLUGINS) { const st = FIGHTERS[p.id] = p.fighter; if (Array.isArray(st.phFade)) st.phFade = new Set(st.phFade); }

// ---------------------------------------------------------------- filled in at load
// a move's own sub-hits (Duke's jabs and their boil-over, the pot's tap and boil...): moves that never go stale on their own
export const SUBS = ['hit', 'last', 'boil', 'shove', 'seg', 'boom', 'swap', 'dbl'];
function fillMove(mv) {
  if (mv.damage !== undefined && mv.kb === undefined) mv.kb = 0;
  for (const k of SUBS) if (mv[k] && typeof mv[k] === 'object') mv[k] = { stale: false, kb: 0, ...mv[k] };
}
// cooldowns: each move's own number stays its relative weight,
// and the slot scales it (the first key's move, the basic one, the most); an evade's recharge too. Applied once here, so
// the sim, the bots, the cooldown sweeps and the move list all see the same seconds
export const CD_MUL = { move1: 0.3, move2: 0.55, move3: 0.6, evade: 0.6 };
const r2 = x => Math.round(x * 100) / 100;
for (const st of Object.values(FIGHTERS)) for (const k in CD_MUL) { const mv = st.moves[k]; if (!mv) continue; if (mv.cooldown) mv.cooldown = r2(mv.cooldown * CD_MUL[k]); if (mv.recharge) mv.recharge = r2(mv.recharge * CD_MUL[k]); }
for (const st of Object.values(FIGHTERS)) for (const k in st.moves) fillMove(st.moves[k]);
