// Fight mode's bots, made human (so they don't always find the best move). One shared layer every fighter's
// bot goes through (js/fight-ai.js kitBot calls it at its decision points, so a plug-in's own `ai` hooks get it too):
//   - imperfect choices: the neutral roll's chances bent by habit and noise (humanPick), a think now and then wasted
//     (`idle`), a move thrown out of range or for no reason (`wild`)
//   - habits: one or two favourite moves overused and one neglected, a move it opens each round with, and repeating the
//     last move thrown (`repeat`), all rolled once per fighter from its own rng stream (the fight's seed): readable
//   - hesitation and commitment: a pause before deciding (`hes`, slowing to a dither), wandering about undecided
//     (`wander`), sticking with the walk it chose for a while longer (`commit`); none of that, nor a wasted think, `pocket`
//     of the time a quick close move of its own is ready with them inside its reach (Chill only: the dithering cost a
//     close fighter its moment and a zoner hardly anything)
//   - panics: the evade burnt at nothing when the foe comes close or starts something (`panic`)
//   - misreads: an attack noticed at all only `notice` of the time, once per go of the foe's move (every threat it
//     makes, noticed together: no second look a moment later; js/fight-ai.js answer is the one place every fighter's
//     threats are answered); noticed, answered the wrong way (`wrong`: a moment walking into it), or the evade burnt far
//     too early (`early`). test/fight-human.mjs measures how many seen attacks each level gets out of.
//   - the wrong key (`slip` of the presses): a different move or the evade fires than the one meant (humanTap)
//   - uneven punishing: on top of the level's own punish chance, `pun` of the openings taken (Chill rarely, Normal
//     sometimes, Ruthless usually but not always)
//   - tired attention: after landing a hit it may relax a moment (`relax` for `relaxT` s): slower to think, misses more
//     tells and openings
//   - links missed: a fighter's own link out of its evade (Gopher's Burrow into Dig & Pop, Ferris's Shell Tuck into
//     unsafe { }) only `link` of the times the kit's own roll wanted it (humanLink)
//   - committing: a bot goes for it on its own rhythm (humanGo: every `rhythm` s, for `goT` s, it walks nearer, `close`,
//     and is keener on a move, `keen`, until it throws one; Ruthless, `smartGo`, not into a foe it sees winding up); now
//     and then it was about to press anyway just as the foe starts something and does, `blindT` s later, before it's
//     seen it (`blind`, inside its reaction time: humanTick notes the foe's real start, humanFree has it decide then;
//     with nothing in range, a move at nothing `blindWild` of the time), so it's already committed when the threat
//     registers; and its evade gets spent getting somewhere (`spend` of the thinks), so it's not always back when they
//     swing. Once in a move it's stuck in it like a player (the sim only takes a press when free: fight.js act).
// Strongest at Chill, lightest at Ruthless (HUMAN, per level). Deterministic: rng is the bot's own stream, never
// Math.random. Memory is plain data on fight.ai[i].hum (with the per-level measurements in .st: test/fight-human.mjs).
// HUMAN_CFG.on = false turns the behaviour off (the same rng draws), still counting .st; HUMAN_CFG.commit = false just
// the committing.
import { Math } from './detmath.js';
export const HUMAN_CFG = { on: true, commit: true };
export const HUMAN = [
  { habit: 1, noise: 0.9, idle: 0.1, wild: 0.1, repeat: 0.35, opener: 0.6, hes: 0.15, hesT: [0.15, 0.45], wander: 0.07, wanderT: [0.4, 1.1],
    commit: 0.15, commitT: [0.3, 0.7], panic: 0.14, notice: 0.52, wrong: 0.16, wrongT: [0.15, 0.4], early: 0.18, slip: 0.04, pun: 0.45,
    relax: 0.6, relaxT: [0.5, 1.4], relaxMiss: 0.5, link: 0.45,
    blind: 0.45, blindT: [0.08, 0.3], blindWild: 0.7, rhythm: [0.9, 2], goT: [0.6, 1.2], keen: 4, close: 0.55, smartGo: 0, spend: 0.04, pocket: 0.8 },
  { habit: 0.55, noise: 0.45, idle: 0.06, wild: 0.035, repeat: 0.2, opener: 0.35, hes: 0.1, hesT: [0.1, 0.3], wander: 0.04, wanderT: [0.4, 0.9],
    commit: 0.12, commitT: [0.2, 0.5], panic: 0.06, notice: 0.64, wrong: 0.08, wrongT: [0.12, 0.3], early: 0.1, slip: 0.015, pun: 0.75,
    relax: 0.35, relaxT: [0.3, 0.8], relaxMiss: 0.35, link: 0.75,
    blind: 0.3, blindT: [0.08, 0.3], blindWild: 0.5, rhythm: [1.4, 2.8], goT: [0.5, 1.0], keen: 2.8, close: 0.45, smartGo: 0, spend: 0.025, pocket: 0 },
  { habit: 0.25, noise: 0.12, idle: 0.015, wild: 0.004, repeat: 0.1, opener: 0.2, hes: 0.06, hesT: [0.05, 0.2], wander: 0.015, wanderT: [0.3, 0.6],
    commit: 0.06, commitT: [0.15, 0.35], panic: 0.004, notice: 0.86, wrong: 0.02, wrongT: [0.1, 0.2], early: 0.015, slip: 0, pun: 0.9,
    relax: 0.2, relaxT: [0.2, 0.5], relaxMiss: 0.25, link: 0.92,
    blind: 0.12, blindT: [0.08, 0.25], blindWild: 0.2, rhythm: [2, 3.6], goT: [0.4, 0.8], keen: 1.8, close: 0.3, smartGo: 1, spend: 0.01, pocket: 0 },
];
const range = (rng, [a, b]) => a + (b - a) * rng();
const lvOf = (F, i) => F.cfg.bots[i] ?? 1;
const Hof = (F, i) => HUMAN[lvOf(F, i)] || HUMAN[1];
export const newHumanStats = () => ({ thinks: 0, dec: 0, best: 0, idle: 0, wild: 0, repeat: 0, opener: 0, hes: 0, wander: 0, commit: 0, panic: 0,
  tells: 0, answered: 0, smart: 0, none: 0, wrong: 0, early: 0, open: 0, punGo: 0, punTry: 0, punLand: 0, landed: 0, relax: 0, linkGo: 0, linkTry: 0,
  rec: [0, 0, 0, 0],
  // the attacks it could see coming (a threat listed with it in reach, while it was free to answer): how many, how many
  // got it anyway; split by what it decided ('ans' answered, 'no' not, 'mis' a misread: wrong or early, 'und' never
  // the most urgent one); cSeen/cGot: those it could have got out of when first seen (walkable in time, or its evade
  // ready with a moment to spare)
  seen: 0, got: 0, cSeen: 0, cGot: 0, sAns: 0, gAns: 0, sNo: 0, gNo: 0, sMis: 0, gMis: 0, sUnd: 0, gUnd: 0,
  // evades burnt with nothing landing yet (a panic, a guess, or an answer far too early) and how many were punished (hit
  // within a second of it); presses: every move or evade pressed, slip: the wrong key pressed
  burnt: 0, burntPun: 0, presses: 0, slip: 0,
  // committing (humanFree, humanGo): presses blind just after the foe's (blind: planned, blindGo: thrown), goes on its own
  // rhythm (go; goGo: and threw a move in it), evades spent to get somewhere (spend)
  blind: 0, blindGo: 0, go: 0, goGo: 0, spend: 0,
  // the foe's moves as they start (humanWatch, the real moment, not as seen): what the bot was doing then ('aMv' in a
  // move of its own: winding up, swinging or recovering; 'aEv' evading; 'aNoEv' free with its evade not back; 'aFree'
  // free with it ready; 'aOth' knocked about; 'h...': and it got hit before the foe's next move, within 2.5 s), and the same for the moves a bot foe threw on its own intent ('n...': its
  // neutral's, not a punish, a follow-up or an answer); trades (both hit within 0.25 s), hits on it (hitOn: a new one
  // 0.2 s after the last) and how many found it mid-move (caught)
  aMv: 0, aEv: 0, aNoEv: 0, aFree: 0, aOth: 0, hMv: 0, hEv: 0, hNoEv: 0, hFree: 0, hOth: 0, nMv: 0, nEv: 0, nNoEv: 0, nFree: 0, nOth: 0, trades: 0, hitOn: 0, caught: 0 });   // rec: the openings after a move ([seen, gone for, thrown, landed]: a recovery, a miss's daze, a stagger, a freeze, the ice cracking)
// the foe's state as seen, an opening after a move? (not a wind-up to hit into, a hit to follow up, or a knockdown)
const AFTER = new Set(['recover', 'dizzy', 'stagger', 'frozen']);
const GOT = new Set(['hurt', 'stagger', 'dizzy', 'frozen', 'grabbed', 'down', 'ko']);   // (got by something)
const isRec = o => AFTER.has(o.state);

// the bot's human side (made on its first step): its habits, rolled once from its own rng stream
function hum(F, i, m, rng) {
  if (m.hum) return m.hum;
  const h = { st: newHumanStats(), fav: [1, 1, 1, 1], opener: -1, lastK: -1, rnd: -1, fhp: null, relaxT: -1, wanderT: -1, wanderA: 0,
    wrongT: -1, pnk: '', punT: -1, punHp: 0, watch: {}, watched: {}, burnT: -1, burnHp: 0 };
  m.hum = h;
  if (!HUMAN_CFG.on) return h;
  const H = Hof(F, i), s = H.habit;
  // one or two favourite moves (overused) and one it neglects; a move to open rounds with
  const a = rng() * 3 | 0, b = rng() < 0.4 ? (a + 1 + (rng() * 2 | 0)) % 3 : -1, c = [0, 1, 2].find(k => k !== a && k !== b);
  h.fav[a] = 1 + s * (1 + rng() * 1.5); if (b >= 0) h.fav[b] = 1 + s * (0.4 + rng() * 0.8);
  if (c != null && rng() < 0.7) h.fav[c] = 1 - s * (0.3 + rng() * 0.4);
  h.opener = rng() < 0.7 ? a : rng() * 3 | 0;
  return h;
}
const relaxed = (F, h) => F.time < h.relaxT;

// the measurements (.st only, no say in what it does): did a seen attack get it, was an evade burnt for nothing punished
const gotNow = (me, hp, lk) => me.hp < hp - 1e-9 || GOT.has(me.state) || (me.lockT || 0) > lk + 1e-6;
function watchTick(F, h, me) {
  for (const k in h.watch) {
    const w = h.watch[k], got = gotNow(me, w.hp, w.lk);
    if (!got && F.time <= w.end) continue;
    const c = w.c, b = c == null ? 'Und' : c === 'none' ? 'No' : c === 'wrong' || c === 'early' ? 'Mis' : 'Ans';
    h.st.seen++; h.st['s' + b]++; if (got) { h.st.got++; h.st['g' + b]++; }
    if (w.can) { h.st.cSeen++; if (got) h.st.cGot++; }
    delete h.watch[k];
  }
  if (h.burnT >= 0) {
    if (gotNow(me, h.burnHp, h.burnLk)) { h.st.burntPun++; h.burnT = -1; } else if (F.time > h.burnT + 1.4) h.burnT = -1;
  }
  if (F.round !== h.wr) { h.wr = F.round; h.watch = {}; h.watched = {}; h.burnT = -1; }
}
// a threat seen (fight-ai.js answer: each listed, the first time): an attack (not soft: spacing, a puddle to stay off)
// is watched till it's over (T + dur s and a moment) for whether it got them
export function humanSee(F, m, me, key, T, dur, soft, can) {
  const h = m.hum; if (!h || soft || dur >= 5 || h.watched[key]) return;
  h.watched[key] = 1;
  h.watch[key] = { end: F.time + Math.max(0, T) + dur + 0.25, hp: me.hp, lk: me.lockT || 0, c: null, can };
}
// an evade burnt with nothing landing yet (a panic, a guess, an answer far too early): punished if hit within a second
function burn(F, h, me) { h.st.burnt++; h.burnT = F.time; h.burnHp = me.hp; h.burnLk = me.lockT || 0; }

// the measurements, every step (fightAI, whatever the bot is doing; .st only, no say in what it does): the foe's moves
// as they really start (what the bot was in then), trades and hits that found it mid-move. evRdy: its evade ready
const OWN = new Set(['wind', 'strike', 'recover']);
export function humanWatch(F, m, me, live, evRdy, fm) {
  const h = m.hum; if (!h) return;
  const st = h.st, w = h.w || (h.w = { fms: live.ms, mhp: me.hp, fhp: live.hp, meT: -9, foeT: -9, hitT: -9, fhT: -9, inMv: false, rnd: F.round });
  if (w.rnd !== F.round) { w.rnd = F.round; w.fms = live.ms; w.mhp = me.hp; w.fhp = live.hp; w.meT = w.foeT = -9; }
  if (w.pc && (me.hp < w.mhp - 1e-9 || F.time > w.pT + 2.5)) { if (me.hp < w.mhp - 1e-9) st['h' + w.pc]++; w.pc = ''; }   // (that move got it, or 2.5 s on it didn't)
  if (live.ms !== w.fms) {
    w.fms = live.ms;
    if (live.move && live.move !== 'evade' && OWN.has(live.state)) {
      const mine = me.move && OWN.has(me.state), c = mine ? (me.move === 'evade' ? 'Ev' : 'Mv') : me.state === 'idle' || me.state === 'walk' ? (evRdy ? 'Free' : 'NoEv') : 'Oth';
      st['a' + c]++; if (fm && fm.why === 'neu' && F.time - fm.whyT < 0.5) st['n' + c]++;   // (n: thrown on its own intent, the neutral's: not a punish, a follow-up or an answer)
      w.pc = c; w.pT = F.time;
    }
  }
  if (me.hp < w.mhp - 1e-9 && F.time - w.hitT > 0.2) { w.hitT = F.time; st.hitOn++; if (w.inMv) st.caught++; if (F.time - w.foeT < 0.25) { st.trades++; w.foeT = -9; } else w.meT = F.time; }
  if (live.hp < w.fhp - 1e-9 && F.time - w.fhT > 0.2) { w.fhT = F.time; if (F.time - w.meT < 0.25) { st.trades++; w.meT = -9; } else w.foeT = F.time; }
  w.mhp = me.hp; w.fhp = live.hp; w.inMv = !!(me.move && me.move !== 'evade' && OWN.has(me.state));
}

// every step (kitBot, first thing): what it's landed (the foe's health dropping: maybe relax a moment; a punish that
// went in), and the round's start
export function humanTick(F, i, m, me, live, rng) {
  const h = hum(F, i, m, rng);
  watchTick(F, h, me);
  if (h.rnd !== F.round) {
    h.rnd = F.round; h.fhp = live.hp; h.relaxT = -1; h.wanderT = -1; h.first = 1; h.ntc = {}; h.bms = live.ms; h.blindT = -1; h.goT = -1; h.keenNow = 0;
    if (HUMAN_CFG.on && HUMAN_CFG.commit) h.goNext = F.time + range(rng, Hof(F, i).rhythm) * 0.6;   // (its first go a little sooner)
    return;
  }
  // the foe starting something (the real moment): now and then it was about to press anyway and does, a moment later,
  // before it's seen (blindT, inside its reaction time: humanFree)
  if (HUMAN_CFG.on && HUMAN_CFG.commit && live.ms !== h.bms) {
    h.bms = live.ms;
    const H = Hof(F, i);
    if (live.move && live.move !== 'evade' && live.state === 'wind' && live.t < 0.1 && (me.state === 'idle' || me.state === 'walk') && !(h.blindT >= 0) && rng() < H.blind) {
      h.blindT = F.time + Math.min(range(rng, H.blindT), Math.max(0.05, m.lag - 0.03)); h.blindMs = live.ms; h.st.blind++;
    }
  }
  if (live.hp < h.fhp) {
    h.st.landed++;
    if (h.punT >= F.time && live.hp < h.punHp) { h.st.punLand++; if (h.punTR) h.st.rec[3]++; h.punT = -1; }
    if (HUMAN_CFG.on) { const H = Hof(F, i); if (rng() < H.relax) { h.relaxT = F.time + range(rng, H.relaxT); h.st.relax++; } }
  }
  h.fhp = live.hp;
  if (h.punT >= 0 && h.punT < F.time) h.punT = -1;
}

// free, nothing to answer or punish (kitBot, before its think): a panic (the evade at nothing), wandering, a pause
// before deciding, sticking with the walk a while longer. Returns a walk (the keys already pressed through C) or null.
// C: { ready(k), evade(angle), toFoe, gap, still (its evade goes nowhere: Bugdroid's surge, never spent to get somewhere) }
export function humanFree(F, i, m, me, o, rng, C) {
  const h = m.hum; if (!HUMAN_CFG.on || !h) return null;
  const H = Hof(F, i);
  // a panic: they came close or started something and the evade goes, at nothing
  if (h.pnk !== m.nk) {
    h.pnk = m.nk;
    if (C.gap < 90 && o.state !== 'down' && o.state !== 'getup' && C.ready(3) && rng() < H.panic * (o.state === 'wind' ? 1.5 : 1)) {
      h.st.panic++; burn(F, h, me); return C.evade(C.toFoe + Math.PI + (rng() - 0.5) * 2);
    }
  }
  // the blind press (humanTick): due, still free and its move not seen yet: it decides now, keen (humanPick)
  if (h.blindT >= 0 && F.time >= h.blindT) {
    const due = F.time <= h.blindT + 0.1 && o.ms !== h.blindMs; h.blindT = -1;
    if (due) { m.next = F.time; h.keenNow = 'blind'; h.wanderT = -1; return null; }
  }
  if (F.time < h.wanderT) return [Math.cos(h.wanderA), Math.sin(h.wanderA)];   // (wandering: undecided)
  if (F.time < m.next) return null;
  h.keenNow = 0;   // (a keen think's left over from one that came to nothing)
  h.st.thinks++;
  // the evade spent to get somewhere (round them, in at them), not kept back for when they swing
  if (HUMAN_CFG.commit && !C.still && C.gap > 40 && C.gap < 220 && C.ready(3) && rng() < H.spend * (F.time < h.goT ? 2 : 1)) {
    h.st.spend++; m.next = F.time + range(rng, H.hesT);
    return C.evade(C.toFoe + (rng() < 0.5 ? 1 : -1) * (0.5 + rng() * 0.9));
  }
  const r = rng(), relax = relaxed(F, h) ? 0.25 : 0;
  // in the pocket (a quick close move ready, them inside its reach: fight-ai.js inPocket): no dithering about it, a
  // player with a jab in range presses it (`pocket` of the time). Marked for humanPick's wasted think too
  h.pocketNow = H.pocket > 0 && C.pocket && C.pocket() && rng() < H.pocket;
  if (h.pocketNow) return null;
  if (r < H.wander) {   // walking about undecided, round them or away
    h.st.wander++; h.wanderT = F.time + range(rng, H.wanderT); m.next = h.wanderT;
    h.wanderA = C.toFoe + (rng() < 0.5 ? 1 : -1) * (Math.PI / 2 + rng() * Math.PI * 0.4);
    return [Math.cos(h.wanderA), Math.sin(h.wanderA)];
  }
  if (r < H.wander + H.hes + relax) { h.st.hes++; m.next = F.time + range(rng, H.hesT); return [m.mx * 0.3, m.my * 0.3]; }   // (a pause before deciding)
  if (r < H.wander + H.hes + relax + H.commit && Math.hypot(m.mx, m.my) > 0.3) { h.st.commit++; m.next = F.time + range(rng, H.commitT); return [m.mx, m.my]; }   // (on with the walk it chose)
  return null;
}

// the neutral's one roll (fight-ai.js neutral): opts [[k, chance, walk, frames], ...], r the roll already drawn (in
// chance units). Returns the index into opts, -1 for nothing, or { wild: k } (move k thrown, in range or not). Off: the
// plain roll. "Best" (the measurements): the option with the top chance, when a move is thrown
export function humanPick(F, i, m, rng, opts, r, ready) {
  const h = m.hum || { st: newHumanStats(), fav: [1, 1, 1, 1] };
  let top = -1; for (let j = 0; j < opts.length; j++) if (top < 0 || opts[j][1] > opts[top][1]) top = j;
  const done = j => { if (j >= 0) { h.st.dec++; if (j === top) h.st.best++; h.lastK = opts[j][0]; } return j; };
  if (!HUMAN_CFG.on) { for (let j = 0; j < opts.length; j++) { if (r < opts[j][1]) return done(j); r -= opts[j][1]; } return -1; }
  const H = Hof(F, i), first = h.first; h.first = 0;
  // keen (humanGo: going in on its own rhythm; humanFree: the blind press): the roll leans to a move, and a move thrown
  // ends the go (it's committed)
  const kn = h.keenNow || 0, blind = kn === 'blind'; h.keenNow = 0;
  if (blind) r *= 0.12; else if (kn > 1) r /= kn;
  const went = j => { if (blind && (j >= 0 || (j && j.wild != null))) h.st.blindGo++; if (kn && (j >= 0 || (j && j.wild != null))) { if (!blind) h.st.goGo++; h.goT = -1; } return j; };
  return went(pick(F, h, H, first, rng, opts, r, ready, done, blind));
}
function pick(F, h, H, first, rng, opts, r, ready, done, blind) {
  // the round's opener, a habit
  if (first && h.opener >= 0 && ready(h.opener) && rng() < H.opener * H.habit) { h.st.opener++; h.st.dec++; h.lastK = h.opener; return { wild: h.opener }; }
  if (!blind && rng() < H.idle && !h.pocketNow) { h.st.idle++; return -1; }   // (a think that comes to nothing; not in the pocket: humanFree)
  if (rng() < H.wild) {   // a move for no good reason (out of range, into nothing)
    const ks = [0, 1, 2].filter(ready); if (ks.length) { const k = ks[rng() * ks.length | 0]; h.st.wild++; h.st.dec++; h.lastK = k; const j = opts.findIndex(q => q[0] === k); return j >= 0 ? done(j) : { wild: k }; }
  }
  if (!opts.length) return -1;
  const rj = opts.findIndex(q => q[0] === h.lastK);   // the last move again (a pattern)
  if (rj >= 0 && rng() < H.repeat) { h.st.repeat++; return done(rj); }
  // the chances, bent by habit and noise (as often a move as before, just not always the fitting one)
  let sum = 0, wsum = 0; const w = opts.map(q => { const v = q[1] * h.fav[q[0]] * Math.exp(H.noise * (rng() * 2 - 1)); sum += q[1]; wsum += v; return v; });
  const k = wsum > 0 ? sum / wsum : 0;
  for (let j = 0; j < opts.length; j++) { if (r < w[j] * k) return done(j); r -= w[j] * k; }
  if (blind && rng() < H.blindWild) { const ks = [0, 1, 2].filter(ready); if (ks.length) { const q = ks[rng() * ks.length | 0]; h.st.wild++; h.st.dec++; h.lastK = q; return { wild: q }; } }   // (pressed at nothing much)
  return -1;
}

// going in on its own rhythm (fight-ai.js neutral, every think): every `rhythm` s it goes for `goT` s: nearer them
// (the walk's distance less `close`) and keener on a move (`keen`, humanPick), until it throws one. smartGo: not into a
// foe seen winding up or swinging (it waits a moment). Returns how much nearer (0: not going)
export function humanGo(F, i, m, o, rng) {
  const h = m.hum; if (!HUMAN_CFG.on || !HUMAN_CFG.commit || !h || h.goNext == null) return 0;
  const H = Hof(F, i);
  if (F.time >= h.goNext && !(F.time < h.goT)) {
    if (H.smartGo && (o.state === 'wind' || o.state === 'strike')) h.goNext = F.time + 0.3;
    else { h.goT = F.time + range(rng, H.goT); h.goNext = h.goT + range(rng, H.rhythm) * ((m.P && m.P.rhythm) || 1); h.st.go++; }   // (its style's rhythm: js/fight-style.js)
  }
  if (F.time < h.goT) { if (!h.keenNow) h.keenNow = H.keen; return H.close; }
  return 0;
}

// a tell's answer, decided once (fight-ai.js answer): c the bot's own ('none', 'walk', 'walk+', 'evade'); maybe a
// misread: not answered, the wrong way ('wrong'), or the evade burnt now ('early'). canEvade: its evade ready
export function humanAnswer(F, i, m, rng, c, canEvade, key) {
  const h = m.hum || { st: newHumanStats(), watch: {} }; h.st.tells++;
  if (HUMAN_CFG.on && c !== 'none') {
    const H = Hof(F, i);
    if (!noticed(F, h, H, rng)) c = 'none';
    else if (rng() < H.wrong) { c = 'wrong'; h.wrongT = F.time + range(rng, H.wrongT); }
    else if (canEvade && rng() < H.early) c = 'early';
  }
  if (c === 'none') h.st.none++; else if (c === 'wrong') h.st.wrong++; else if (c === 'early') h.st.early++;
  else { h.st.answered++; if (c !== 'walk') h.st.smart++; }
  if (key != null && h.watch[key]) h.watch[key].c = c;
  return c;
}
// what's being answered (fight-ai.js answer, before deciding): the go of the foe's move it comes from (ms), or soft
// (spacing, a puddle: not an attack)
export function humanFace(m, ms, soft) { if (m.hum) { m.hum.curMs = ms; m.hum.curSoft = !!soft; } }
// noticed at all? `notice` of the time (less while relaxed), decided once per go of the foe's move: every threat it
// makes (a jab's wind-up and its swing, Gopher's three lanes, a beam aiming then locked) noticed together or not at all,
// so a missed one isn't seen again a moment later. Soft ones each time
function noticed(F, h, H, rng) {
  const p = H.notice * (relaxed(F, h) ? 1 - H.relaxMiss : 1);
  if (h.curSoft || h.curMs == null) return rng() < p;
  const n = h.ntc || (h.ntc = {});
  if (!(h.curMs in n)) n[h.curMs] = rng() < p;
  return n[h.curMs];
}
// acting on a misread (fight-ai.js answer, each step): 'wrong' walks into it (the angle to walk) until it's sorted out
// (then a plain walk off); 'early' burns the evade now ('evade'). Else null
export function humanMisread(F, m, K, key, a, me) {
  const c = K.ans[key];
  if (c === 'wrong') { if (F.time < m.hum.wrongT) return a + Math.PI; K.ans[key] = 'walk'; return null; }
  if (c === 'early') { K.ans[key] = 'done'; if (m.hum && me) burn(F, m.hum, me); return 'evade'; }
  return null;
}

// an opening seen (fight-ai.js punishK): go, the bot's own roll (its level's punish or combo chance) said yes; b the
// window's end (s from now). True: go for it
export function humanPunish(F, i, m, rng, go, b, o) {
  const h = m.hum || { st: newHumanStats() }, rec = isRec(o); h.st.open++; h.punB = b; h.punRec = rec;
  if (rec) h.st.rec[0]++;
  if (!go) return false;
  if (HUMAN_CFG.on) { const H = Hof(F, i); if (rng() >= H.pun * (relaxed(F, h) ? 1 - H.relaxMiss : 1)) return false; }
  h.st.punGo++; if (rec) h.st.rec[1]++;
  return true;
}
// the punish thrown (a move, or the walk in to it): did it land? (humanTick watches the foe's health till b + 0.5 s)
export function humanPunTry(F, m, live, walk) {
  const h = m.hum; if (h) { h.st.punTry++; if (h.punRec) h.st.rec[2]++; h.punTR = h.punRec; h.punT = F.time + Math.max(0, h.punB || 0) + 0.5; h.punHp = live.hp; }
  return walk;
}

// a link out of an evade (a kit's ai.stick, once per evade: C.link(p)): go the kit's own chance p said yes, then the human
// side, `link` of the time (less while relaxed). True: go for it
export function humanLink(F, i, m, rng, go) {
  const h = m.hum || { st: newHumanStats() };
  if (!go) return false;
  h.st.linkTry++;
  if (HUMAN_CFG.on) { const H = Hof(F, i); if (rng() >= H.link * (relaxed(F, h) ? 1 - H.relaxMiss : 1)) return false; }
  h.st.linkGo++;
  return true;
}

// the wrong key (kitBot wraps its tap with this): now and then a fresh press goes to a different key than meant (`slip`
// of the presses): another move or the evade that's ready fires instead (wasted, or a whiff), the meant one doesn't
const KEYI = { light: 0, heavy: 1, special: 2, guard: 3 }, KEYN = ['light', 'heavy', 'special', 'guard'];
export function humanTap(F, i, m, rng, tap, ready) {
  return (k, n) => {
    const h = m.hum, ki = KEYI[k];
    if (h && ki != null && !(m.queue[k] > 0) && !(m.hold[k] > 0)) {
      h.st.presses++;
      const sl = Hof(F, i).slip;
      if (HUMAN_CFG.on && sl && rng() < sl) {
        const ks = [0, 1, 2, 3].filter(j => j !== ki && ready(j));
        if (ks.length) { h.st.slip++; return tap(KEYN[ks[rng() * ks.length | 0]], n); }
      }
    }
    return tap(k, n);
  };
}
