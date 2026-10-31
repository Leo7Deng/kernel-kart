// Fight mode's punish table, scripted from the moves (no bots, analysis only). Per move: its frame data and, whiffed at
// an untouchable dummy, the opening after its strike and the gap then. Per fighter: each move's quickest hit on a still
// target by gap. Combined: per attacker move and defender, the quickest punish in the opening, and after a perfect evade.
//   node test/fight-punish-table.mjs [--json=path]
import { writeFileSync } from 'node:fs';
import { Fight } from '../js/fight.js';
import { FIGHTERS, FIGHT_ORDER } from '../js/fight-chars.js';

const KEY = { move1: 'light', move2: 'heavy', move3: 'special', evade: 'guard' };
const MOVES = ['move1', 'move2', 'move3'];
const LANDS = new Set(['hit', 'freeze', 'feLocked', 'cpGoo', 'cpStick', 'cpBite']);
const FREE = new Set(['idle', 'walk']);
const GAPS = [8, 25, 45, 70, 100, 140, 190, 250, 320];
const BLANK = { x: 0, y: 0, light: false, heavy: false, special: false, guard: false };
const DT = 1 / 60;

// a fight in the open, a at the left facing b gap units away; returns F
function setup(a, b, gap) {
  const F = new Fight({ ids: [a, b], bots: [null, null], seed: 1, roundTime: 99, arena: 'ring' });
  F.phase = 'fight'; F.pt = 0;
  const A = F.f[0], B = F.f[1], half = (gap + A.r + B.r) / 2;
  A.x = -half; A.y = 0; B.x = half; B.y = 0; A.face = 0; B.face = Math.PI;
  return F;
}
// fighter 0 throws k (pressed 2 steps, the stick at the foe); `ghost`: the foe can't be touched. Records when its strike
// starts and ends, when it's free, the first landing on the foe, the gap at its strike's end
function throwMove(a, b, k, gap, ghost, maxT = 4) {
  const F = setup(a, b, gap), A = F.f[0], B = F.f[1];
  const r = { strikeT: -1, endT: -1, freeT: -1, landT: -1, gapEnd: null, started: false };
  for (let n = 0; n < maxT * 60; n++) {
    F.setInput(0, { ...BLANK, x: 1, [KEY[k]]: n < 2 });
    F.setInput(1, BLANK);
    if (ghost) B.inv = 99;
    F.step();
    const t = (n + 1) * DT;
    if (A.move === k) r.started = true;
    if (r.started && r.strikeT < 0 && A.state === 'strike') r.strikeT = t;
    if (r.started && r.strikeT >= 0 && r.endT < 0 && A.state !== 'strike') { r.endT = t; r.gapEnd = Math.hypot(B.x - A.x, B.y - A.y) - A.r - B.r; }
    if (r.started && n > 2 && r.freeT < 0 && FREE.has(A.state)) { r.freeT = t; if (r.endT < 0) r.endT = t; }
    if (r.landT < 0) for (const e of F.events) if (LANDS.has(e.kind) && e.who === 0 && (e.to == null || e.to === 1)) { r.landT = t; break; }
    F.events.length = 0;
    if (r.freeT >= 0 && (!ghost ? r.landT >= 0 || t > r.freeT + 2 : true)) break;
  }
  return r;
}

// how soon after pressing the evade move k can start (held from just after: a kit that lets you burst out of the evade
// starts it early; else once the evade's over)
function evadeOut(a, k, free) {
  const F = setup(a, a, 200), A = F.f[0];
  for (let n = 0; n < 4 * 60; n++) {
    F.setInput(0, { ...BLANK, x: 1, guard: n < 2, [KEY[k]]: n >= 3 && n % 2 === 1 });
    F.setInput(1, BLANK); F.step(); F.events.length = 0;
    if (A.move === k) return Math.min((n + 1) * DT, free);
  }
  return free;
}
export function table() {
  const T = { moves: {}, hit: {}, evade: {}, punish: {} };
  for (const a of FIGHT_ORDER) {
    const M = FIGHTERS[a].moves;
    // its evade: how long until free again, pressed in place
    { const r = throwMove(a, a, 'evade', 200, false); T.evade[a] = { free: r.freeT, startup: M.evade.startup || 0, cooldown: M.evade.cooldown ?? null, charges: M.evade.charges || 0, out: MOVES.map(k => evadeOut(a, k, r.freeT)) }; }
    for (const k of MOVES) {
      const mv = M[k], w = throwMove(a, a, k, 45, true), h = throwMove(a, a, k, 45, false);
      T.moves[a + ':' + k] = { name: mv.name, startup: mv.startup, active: mv.active, recovery: mv.recovery, cooldown: mv.cooldown,
        free: w.freeT, strikeT: w.strikeT, opening: w.freeT >= 0 && w.endT >= 0 ? w.freeT - w.endT : null, gapEnd: w.gapEnd,
        hitMoment: h.landT >= 0 ? h.landT : w.strikeT };
    }
  }
  // each fighter's moves, the quickest hit by gap on each target standing still
  for (const d of FIGHT_ORDER) for (const a of FIGHT_ORDER) for (const k of MOVES) {
    T.hit[d + '>' + a + ':' + k] = GAPS.map(g => { const r = throwMove(d, a, k, g, false, 3); return r.landT >= 0 ? r.landT : null; });
  }
  // the quickest hit with move k at a gap: thrown from there (the slower of the gaps measured either side), or after
  // walking in to a gap it lands from (at the defender's walk speed, from a standstill: a little optimistic)
  const hitAt = (d, a, k, gap) => {
    const row = T.hit[d + '>' + a + ':' + k], W = 150 * FIGHTERS[d].walk; let best = null;
    const j = GAPS.findIndex(g => g >= gap);
    if (j >= 0) { const v = [row[j], j > 0 ? row[j - 1] : row[j]]; if (!v.some(x => x == null)) best = Math.max(...v); }
    for (let q = 0; q < GAPS.length && GAPS[q] < gap; q++) if (row[q] != null) { const t = row[q] + (gap - GAPS[q]) / W; if (best == null || t < best) best = t; }
    return best;
  };
  for (const a of FIGHT_ORDER) for (const k of MOVES) {
    const mv = T.moves[a + ':' + k];
    for (const d of FIGHT_ORDER) {
      const gap = Math.max(0, mv.gapEnd ?? 45), open = mv.opening ?? 0, ev = T.evade[d];
      // after a perfect evade: the defender pressed it so it covered the moment of the hit; free once it's over
      // (with a move it can burst out of the evade into, that move goes sooner)
      const evWinOf = j => mv.free - (mv.hitMoment - ev.startup + ev.out[MOVES.indexOf(j)]), evWin = Math.max(...MOVES.map(evWinOf));
      let best = null, bestE = null;
      for (const j of MOVES) {
        const t = hitAt(d, a, j, gap); if (t == null) continue;
        if (t <= open && (!best || t < best.t)) best = { t, by: j };
        if (t <= evWinOf(j) && (!bestE || t < bestE.t)) bestE = { t, by: j };
      }
      T.punish[a + ':' + k + '>' + d] = { gap, open, evWin, best, bestE };
    }
  }
  return T;
}

const f2 = v => v == null ? '-' : v.toFixed(2);
const nm = (id, k) => FIGHTERS[id].moves[k].name;
export function print(T) {
  const out = [], p = s => out.push(s);
  p('### Every move thrown into nothing (a whiff, or a perfect evade): seconds\n');
  p('| Fighter | Move | Startup | Active | Recovery | Cooldown | Free after | Opening after its strike | Gap then |'); p('|---|---|---|---|---|---|---|---|---|');
  for (const a of FIGHT_ORDER) for (const k of MOVES) { const m = T.moves[a + ':' + k]; p(`| ${FIGHTERS[a].name} | ${m.name} | ${f2(m.startup)} | ${f2(m.active)} | ${f2(m.recovery)} | ${f2(m.cooldown)} | ${f2(m.free)} | ${f2(m.opening)} | ${m.gapEnd == null ? '-' : Math.round(m.gapEnd)} |`); }
  p('\n### Each fighter\'s fastest hit and reach (on a still target, its own mirror)\n');
  p('| Fighter | Evade over after (a move out of it sooner) | ' + MOVES.map(k => k).join(' | ') + ' | Fastest hit | Reach |'); p('|---|---|---|---|---|---|---|');
  for (const d of FIGHT_ORDER) {
    let fast = null, reach = 0; const cells = MOVES.map(k => {
      const row = T.hit[d + '>' + d + ':' + k], ok = row.map((t, j) => t != null ? j : -1).filter(j => j >= 0);
      const q = ok.length ? Math.min(...ok.map(j => row[j])) : null, far = ok.length ? GAPS[Math.max(...ok)] : 0;
      if (q != null && (!fast || q < fast.t)) fast = { t: q, k }; reach = Math.max(reach, far);
      return `${nm(d, k)}: ${q == null ? 'never' : f2(q) + ' s'}, ${ok.length ? GAPS[Math.min(...ok)] + '-' + far : '-'} u`;
    });
    const E = T.evade[d], outs = MOVES.map((k, j) => E.out[j] < E.free - 0.02 ? `${nm(d, k)} at ${f2(E.out[j])}` : '').filter(Boolean);
    p(`| ${FIGHTERS[d].name} | ${f2(E.free)} s${outs.length ? ' (' + outs.join(', ') + ')' : ''} | ${cells.join(' | ')} | ${fast ? `${f2(fast.t)} s (${nm(d, fast.k)})` : '-'} | ${reach} u |`);
  }
  p('\n### Punishing a whiffed / evaded move: the defender\'s quickest move that lands in the opening (at the gap then), and after a perfect evade\n');
  p('| Attacker move | Opening | ' + FIGHT_ORDER.map(d => FIGHTERS[d].name).join(' | ') + ' |'); p('|---|---|' + FIGHT_ORDER.map(() => '---').join('|') + '|');
  const none = [];
  for (const a of FIGHT_ORDER) for (const k of MOVES) {
    const m = T.moves[a + ':' + k];
    p(`| ${FIGHTERS[a].name} ${m.name} | ${f2(m.opening)} s @${m.gapEnd == null ? '-' : Math.round(m.gapEnd)} | ` + FIGHT_ORDER.map(d => {
      const P = T.punish[a + ':' + k + '>' + d];
      if (!P.bestE) none.push([d, a, k, P]);
      return P.best ? `${nm(d, P.best.by)} ${f2(P.best.t)}${P.bestE ? '' : ' (not after an evade)'}` : 'none';
    }).join(' | ') + ' |');
  }
  p('\n### No punish at all after a perfect evade (defender: attacker moves)\n');
  for (const d of FIGHT_ORDER) {
    const l = none.filter(x => x[0] === d); if (!l.length) continue;
    p(`- ${FIGHTERS[d].name} (${l.length}/${FIGHT_ORDER.length * 3}): ` + l.map(([, a, k, P]) => `${FIGHTERS[a].name} ${nm(a, k)} (${f2(Math.max(0, P.evWin))} s after the evade)`).join(', '));
  }
  return out.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const T = table(); console.log(print(T));
  const j = process.argv.find(a => a.startsWith('--json=')); if (j) writeFileSync(j.slice(7), JSON.stringify(T));
}
