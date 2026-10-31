// @ts-check
// Fight mode's bots, with a personality (so the levels differ in more than timing). On top of the levels' numbers (LV in
// fight-ai.js) and the human side (fight-human.js), every bot gets a play style, made once on its first step (`styleOf`,
// plain data on fight.ai[i].P) from three things:
//   - its level's persona (PERSONA):
//       Chill: friendly and readable. A favourite move it leans on, a little pause facing you before it throws one
//         (`tele`; seldom and shorter before a quick close move, `teleQ` / `teleQT`: the pause costs a close
//         fighter its moment, a trap or a shot from range hardly anything), breaks now and then (backs off and lets you
//         breathe, `brk`, and often after landing a hit), forgets to evade (answers on foot, `forget`), doesn't chase
//         hard (`chase`; a close fighter, who has to get there, harder: `chaseClose`), seldom hits you on the floor and gets up the
//         same way every time (late, straight away).
//       Normal: balanced; goes for a ground hit when it's close, gets up a few different ways.
//       Ruthless: adapts. It notices what you keep doing (`read`: the move you throw most and from how far, how often you
//         evade its swings, how you get up) and answers it: stands just outside that move's range and answers its tell
//         every time, baits an evade you keep using with a quick feint and punishes the evade (`bait`), punishes a missed
//         move almost always (`unsafe`), waits out a roll and meets you as you get up (`wait`, `meaty`), gets up the way
//         you're not covering, and plays its kit's setups (`setup`, read by the kits as C.L.setup: venom then Coil, Lock
//         then Claw, Wave then Compose Up then Slap, Stop the World then jabs and the pot ...).
//   - a mild style per bot, rolled from its own rng stream (STYLES: aggressive, patient, tricky; the kit's `persona.styles`
//     weighs the roll), so two Normal bots don't play alike
//   - its fighter's character (the kit's `ai.persona`, plain data: `aggr` presses in, `keep` keeps away and hits and
//     runs, `patient` waits for openings, `trap` sets its `traps` moves before engaging, `rush` presses a trap-setter early,
//     `like` per-key leanings)
// Deterministic: randomness only from the bot's rng; memory only on fight.ai[i] (plain data).
import { Math } from './detmath.js';
import { RULES } from './fight.js';

// per level (Chill, Normal, Ruthless): the play style on top of the reaction numbers
export const PERSONA = [
  { name: 'chill', tele: 0.35, teleT: [0.15, 0.35], teleQ: 0.4, teleQT: 0.4, chaseClose: 0.6, brk: [8, 13], brkT: [0.8, 1.5], brkHit: 0.15, forget: 0.4, chase: 0.8, fav: 2.4, mix: 1,
    ground: 0.3, gReach: 40, wait: 0, meaty: 0.1, read: 0, bait: 0, unsafe: 0, setup: 0.15,
    rise: 0.45, riseAt: [0.2, 0.3], ways: [0.85, 0.15, 0, 0], stay: 0, varyT: 0 },
  { name: 'normal', tele: 0, teleT: [0, 0], teleQ: 1, teleQT: 1, chaseClose: 0, brk: null, brkT: [0, 0], brkHit: 0, forget: 0.08, chase: 0.9, fav: 1.15, mix: 0.8,
    ground: 0.65, gReach: 90, wait: 0.25, meaty: 0.4, read: 0.35, bait: 0.06, unsafe: 0.7, setup: 0.5,
    rise: 0.7, riseAt: [0.13, 0.3], ways: [0.5, 0.35, 0.1, 0.05], stay: 0.06, varyT: 0.5 },
  { name: 'ruthless', tele: 0, teleT: [0, 0], teleQ: 1, teleQT: 1, chaseClose: 0, brk: null, brkT: [0, 0], brkHit: 0, forget: 0, chase: 1, fav: 1, mix: 0.5,
    ground: 0.9, gReach: 150, wait: 0.75, meaty: 0.85, read: 1, bait: 0.2, unsafe: 0.95, setup: 0.9,
    rise: 0.85, riseAt: [0.12, 0.33], ways: [0.3, 0.4, 0.2, 0.1], stay: 0.12, varyT: 1 },
];
// a bot's own style (mild): multipliers and nudges on the persona
export const STYLES = {
  aggressive: { want: 0.82, rate: 1.2, rhythm: 0.75, ground: 1.25, gReach: 30, bait: 0.7, stay: 0.5, early: 1, ways: [0, 0, 0.15, 0], wait: 0.7 },
  patient: { want: 1.06, rate: 0.85, rhythm: 1.3, ground: 0.9, gReach: 0, bait: 1, stay: 1.2, early: 0, ways: [0.1, 0, 0, 0.1], wait: 1.3, punish: 1.15 },
  tricky: { want: 1, rate: 1, rhythm: 1, ground: 1, gReach: 10, bait: 1.8, stay: 1.8, early: 0.5, ways: [0, 0.15, 0.15, 0], wait: 1, feint: 0.05 },
};
export const STYLE_ORDER = ['aggressive', 'patient', 'tricky'];
const range = (rng, [a, b]) => a + (b - a) * rng();
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// the bot's style, made once (fight-ai.js, its first step): plain data. lv the level, persona its kit's ai.persona
/** @param {number} lv @param {import('./kits/index.js').BotHooks['persona']} persona @param {() => number} rng */
export function styleOf(lv, persona, rng) {
  const B = PERSONA[lv] || PERSONA[1], pe = persona || {}, w = pe.styles || [1, 1, 1];
  let r = rng() * (w[0] + w[1] + w[2]), s = 0; while (s < 2 && r >= w[s]) { r -= w[s]; s++; }
  const S = STYLES[STYLE_ORDER[s]], aggr = pe.aggr || 0, keep = pe.keep || 0, pat = pe.patient || 0, trap = pe.trap || 0;
  const like = [0, 1, 2, 3].map(k => (pe.like && pe.like[k]) || 1);
  // Chill's favourite move: one of the three, leaned on hard (its kit's liking weighs the pick)
  const fav = lv === 0 ? (rng() * 3) | 0 : -1;
  if (fav >= 0) for (let k = 0; k < 3; k++) like[k] *= k === fav ? B.fav : 0.65;
  const ways = B.ways.map((v, j) => v + (S.ways[j] || 0) * (lv ? 1 : 0.3));
  return {
    lv, style: STYLE_ORDER[s], fav, like,
    want: S.want * (1 - 0.22 * aggr + 0.35 * keep), rate: S.rate * (1 + 0.25 * aggr - 0.08 * pat - 0.1 * keep), mix: B.mix,
    rhythm: S.rhythm * (1 - 0.25 * aggr + 0.25 * pat), punish: (S.punish || 1) * (1 + 0.15 * pat),
    tele: B.tele, teleT: B.teleT, teleQ: B.teleQ, teleQT: B.teleQT, chaseClose: B.chaseClose, brk: B.brk, brkT: B.brkT, brkHit: B.brkHit, forget: B.forget, chase: B.chase * (1 + 0.2 * aggr - 0.2 * keep),
    ground: clamp(B.ground * S.ground * (1 + 0.2 * aggr), 0, 1), gReach: B.gReach + S.gReach + 30 * aggr,
    wait: clamp(B.wait * S.wait * (1 + 0.3 * pat), 0, 1), meaty: clamp(B.meaty * (1 + 0.2 * pat), 0, 1), read: B.read,
    bait: clamp(B.bait * S.bait + (lv ? S.feint || 0 : 0), 0, 0.5), unsafe: B.unsafe, setup: clamp(B.setup * (1 + 0.2 * trap), 0, 1),
    rise: B.rise, riseAt: B.riseAt, varyT: B.varyT, early: S.early, ways, stay: clamp(B.stay * S.stay, 0, 0.4),
    keep, hitRun: keep * (0.3 + 0.4 * (lv / 2)), rush: (pe.rush || 0) * (0.5 + 0.25 * lv), trap: trap * (0.2 + 0.35 * lv), traps: pe.traps || [], trapN: pe.trapN || 2,
  };
}
// the level's numbers as this bot plays them (its style on top; fight-ai.js m.L): a plain copy
export function levelOf(L, P) {
  return { ...L, rate: L.rate * P.rate, punish: clamp(L.punish * P.punish, 0, 1), combo: clamp(L.combo * P.punish, 0, 1),
    ground: P.ground, rise: P.rise, setup: P.setup };
}

// ---------------------------------------------------------------- reading the foe (every step; used by `read` bots)
// The foe as seen (perceive's o: a moment late): each move it starts (which, from how far), its evades just after a
// swing of ours, and how it gets up (seen at once: it's on the floor in front of us). Plain data on m.rd
const OWN = new Set(['wind', 'strike', 'recover']);
/** @param {import('./fight.js').Fight} F @param {Record<string, any>} m @param {import('./fight.js').Fighter} me
 * @param {import('./kits/index.js').Seen} o @param {import('./fight.js').Fighter} live */
export function readFoe(F, m, me, o, live) {
  const R = m.rd || (m.rd = { ms: -1, mv: [0, 0, 0], gap: [0, 0, 0], n: 0, ev: 0, myMs: -1, myT: -9, wind: 0, evAns: 0,
    rises: 0, stays: 0, side: [0, 0, 0], downW: 0, rollA: 0, riseT: 0 });
  if (o.ms !== R.ms && o.move && OWN.has(o.state)) {
    R.ms = o.ms;
    const k = ['move1', 'move2', 'move3', 'evade'].indexOf(o.move), gap = Math.hypot(o.x - me.x, o.y - me.y) - me.r - o.r;
    if (k >= 0 && k < 3) { R.mv[k] = R.mv[k] * 0.92 + 1; R.gap[k] = R.gap[k] * 0.92 + gap; R.n = R.n * 0.92 + 1; }
    if (k === 3) { R.ev++; if (o.T - R.myT < 0.5 && o.T >= R.myT) R.evAns++; }
  }
  if (me.ms !== R.myMs && me.move && me.move !== 'evade' && me.state === 'wind') { R.myMs = me.ms; R.myT = F.time; R.wind++; }
  // how it gets up: a roll (the way, against away from us) or staying down
  if (live.state === 'down') { R.downW = 1; R.downAt = R.downAt ?? F.time; }
  else if (R.downW) {
    R.downW = 0;
    if (live.state === 'getup' && live.roll) {
      R.rises++;
      const away = Math.atan2(live.y - me.y, live.x - me.x), d = Math.atan2(Math.sin(live.rollA - away), Math.cos(live.rollA - away));
      R.side[d < -0.5 ? 0 : d > 0.5 ? 2 : 1]++;
      R.rollA = d; R.riseT += F.time - (R.downAt ?? F.time);
    } else R.stays++;
    R.downAt = null;
  }
}
// the foe's move it keeps throwing (0..2), with the gap it throws it from, or null (not enough seen yet)
export function habitOf(R) {
  if (!R || R.n < 4) return null;
  let k = 0; for (let j = 1; j < 3; j++) if (R.mv[j] > R.mv[k]) k = j;
  const share = R.mv[k] / R.n; return share >= 0.42 ? { k, share, gap: R.gap[k] / R.mv[k] } : null;
}
// how often the foe evades a swing of ours (0..1), once a few swings are in
export const evadeHabit = R => R && R.wind >= 5 ? R.evAns / R.wind : 0;
// how the foe gets up: { roll (share of quick rises), side (its usual way: -1 right, 0 away, 1 left, null mixed) }
export function riseHabit(R) {
  const n = R ? R.rises + R.stays : 0; if (n < 3) return null;
  const s = R.side, top = s[0] >= s[1] && s[0] >= s[2] ? 0 : s[1] >= s[2] ? 1 : 2;
  return { roll: R.rises / n, side: R.rises >= 2 && s[top] / R.rises >= 0.6 ? top - 1 : null };
}

// ---------------------------------------------------------------- getting up (the floored bot: fight-ai.js riseBot)
// a plan once a knockdown: stay down (bait: they're out of reach, or waiting where the roll would go), or roll at a
// time (Chill late, the same each time; Ruthless anywhere in the window, so it can't be timed), and a way: away from
// them, to a side, past them (untouchable through the roll), toward the middle; a reading bot picks the way that ends
// furthest from where they're standing
export function risePlan(F, m, me, live, P, rng) {
  const gap = Math.hypot(live.x - me.x, live.y - me.y) - me.r - live.r, foeFree = live.state === 'idle' || live.state === 'walk';
  const plan = { go: rng() < P.rise, at: 0, j: 0, side: rng() < 0.5 ? -1 : 1, read: rng() < 0.5 * P.read };
  // stay down: they can't reach us for a ground hit before we'd be up anyway
  if (P.stay && (gap > 80 || !foeFree) && rng() < P.stay) { plan.go = false; plan.stay = 1; return plan; }
  const lo = P.riseAt[0], hi = P.riseAt[1];
  plan.at = P.varyT ? lo + (hi - lo) * Math.pow(rng(), 1 + P.early) : hi - (hi - lo) * 0.3 * rng();
  plan.at = Math.max(RULES.riseMin + 0.005, plan.at);
  plan.j = pickW(P.ways, rng);
  return plan;
}
// the roll's way, as it goes (plan: risePlan's; cl, toC: the walls round us, the way to the middle)
export function rollWay(plan, me, live, cl, toC) {
  const away = Math.atan2(me.y - live.y, me.x - live.x), sd = plan.side;
  const cand = [away + sd * 0.35, away + sd * Math.PI / 2, away + Math.PI + sd * 0.6, toC];
  let j = plan.j;
  if (plan.read) {   // the way that ends furthest from them (a foe waiting at the usual spot)
    let bd = -1;
    for (let q = 0; q < 3; q++) { const x = me.x + Math.cos(cand[q]) * RULES.rollDist, y = me.y + Math.sin(cand[q]) * RULES.rollDist, d = Math.hypot(x - live.x, y - live.y); if (d > bd) { bd = d; j = q; } }
  }
  const a = cand[j], w = clamp(1 - cl.d / 90, 0, 1);   // (near a wall: toward the middle)
  return Math.atan2(Math.sin(a) * (1 - w) + Math.sin(toC) * w * 1.4, Math.cos(a) * (1 - w) + Math.cos(toC) * w * 1.4);
}
function pickW(ws, rng) { let s = 0; for (const v of ws) s += v; let r = rng() * s; for (let j = 0; j < ws.length; j++) { if (r < ws[j]) return j; r -= ws[j]; } return 0; }

// ---------------------------------------------------------------- Chill's breaks and the telegraphed throw
// a break (Chill): now and then, and often after landing a hit, it backs off and takes a breath. Returns true while on
export function onBreak(F, K, P, rng, landed) {
  if (!P.brk) return false;
  if (K.brkR !== F.round) { K.brkR = F.round; K.brkNext = F.time + range(rng, P.brk); K.brkT = -1; }
  // (a fresh hit landed, not the chip of a swarm: a breath after it now and then, a few seconds after the last)
  if (landed && F.time > (K.brkLand || -9) + 0.6 && F.time > K.brkT + 4) { if (rng() < P.brkHit) K.brkNext = Math.min(K.brkNext, F.time); }
  if (landed) K.brkLand = F.time;
  if (F.time >= K.brkNext && !(F.time < K.brkT)) { K.brkT = F.time + range(rng, P.brkT); K.brkNext = K.brkT + range(rng, P.brk); }
  return F.time < K.brkT;
}
export { range as rangeOf };
