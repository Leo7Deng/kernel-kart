// Fight bots, how human they decide (js/fight-human.js), per level: bot v bot over every pair, then again with the human
// layer off. Prints the share of "best" decisions (neutral, tells, openings), punish conversion, tells answered and the
// human habits per minute.
//   node test/fight-human.mjs [fights per pair, default 1] [arena id] [--on | --off] [--per (by fighter)] [--lv=0,2]
//   [--vs=2 (each level vs a Ruthless bot, only its side counted) | --vs=p (vs a scripted player, player() below)]
//   [--nocommit (the human layer without HUMAN_CFG.commit)]
// Then per level: attacks it could see coming and the share avoided, by what it decided; evades burnt with nothing
// landing (per minute) and punished; the wrong key (share of presses).
import { ARENA_ORDER, ARENAS } from '../js/fight-arenas.js';
import { Fight } from '../js/fight.js';
import { FIGHT_ORDER } from '../js/fight-chars.js';
import { HUMAN_CFG, newHumanStats } from '../js/fight-human.js';

const args = process.argv.slice(2), flags = args.filter(a => a.startsWith('--')), pos = args.filter(a => !a.startsWith('--'));
const N = +pos[0] || 1, arena = pos[1] && ARENAS[pos[1]] ? pos[1] : ARENA_ORDER[0];
const modes = flags.includes('--on') ? [true] : flags.includes('--off') ? [false] : [false, true];
const NAMES = ['Chill', 'Normal', 'Ruthless'];
const pc = (a, b) => b ? (100 * a / b).toFixed(0).padStart(3) + '%' : '   -';
export function measure(lv, n, ar, on, vs = null, commit = true) {
  HUMAN_CFG.on = on; HUMAN_CFG.commit = commit;
  const S = newHumanStats(), per = {}; let secs = 0, fights = 0, rounds = 0;
  FIGHT_ORDER.forEach((a, ka) => FIGHT_ORDER.forEach((b, kb) => {
    for (let s = 1; s <= n; s++) {
      const seed = s * 7919 + ka * 131 + kb * 17 + lv, P = vs === 'p' ? player(seed) : null;
      const F = new Fight({ ids: [a, b], bots: [lv, P ? null : vs ?? lv], seed, arena: ar });
      for (let k = 0; F.phase !== 'over' && k < 60 * 600; k++) { if (P) F.setInput(1, P(F)); F.step(); F.events.length = 0; }
      fights++; rounds += F.rounds.length; for (const r of F.rounds) secs += r.time;
      F.ai.forEach((m, j) => {
        if (!m.hum || (vs != null && j)) return;   // (against a set level: only the one at this level counted)
        const P = per[F.f[j].id] || (per[F.f[j].id] = newHumanStats());
        for (const T of [S, P]) for (const q in T) if (q === 'rec') m.hum.st.rec.forEach((v, k) => { T.rec[k] += v; }); else T[q] += m.hum.st[q] || 0;
      });
    }
  }));
  HUMAN_CFG.on = true; HUMAN_CFG.commit = true;
  return { S, per, secs, fights, rounds };
}
// a scripted player (--vs=p, fighter 1), blind to the bot: holds a distance it changes every 1.5-3 s (20-110), and every
// 0.3-2.5 s presses a random ready move within 160 (now and then the evade). Its own rng, so it never touches the bots'
export function player(seed) {
  let x = (seed * 2654435761) >>> 0 || 1;
  const r = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  let want = 60, wantT = 0, next = 1, side = 1, key = '', keyN = 0;
  return F => {
    const me = F.f[1], b = F.f[0], dx = b.x - me.x, dy = b.y - me.y, gap = Math.hypot(dx, dy) - me.r - b.r, a = Math.atan2(dy, dx);
    if (F.time > wantT) { want = 20 + r() * 90; wantT = F.time + 1.5 + r() * 1.5; side = r() < 0.5 ? 1 : -1; }
    const inp = { x: 0, y: 0, light: false, heavy: false, special: false, guard: false };
    const w = gap > want + 15 ? a : gap < want - 15 ? a + Math.PI : a + side * Math.PI / 2;
    inp.x = Math.cos(w); inp.y = Math.sin(w);
    if (keyN > 0) { inp[key] = true; keyN--; inp.x = Math.cos(a); inp.y = Math.sin(a); return inp; }
    if (me.move && (me.state === 'wind' || me.state === 'strike')) { inp.x = Math.cos(a); inp.y = Math.sin(a); return inp; }
    if (F.time >= next && gap < 160 && (me.state === 'idle' || me.state === 'walk')) {
      next = F.time + Math.min(2.5, Math.max(0.3, -Math.log(1 - r()) * 0.9));
      const ks = [0, 1, 2].filter(k => me.cd[k] <= 0), ev = r() < 0.1 && me.cd[3] <= 0;
      if (ev || ks.length) { key = ev ? 'guard' : ['light', 'heavy', 'special'][ks[r() * ks.length | 0]]; keyN = 2; }
    }
    return inp;
  };
}
const isMain = import.meta.url === `file://${process.argv[1]}`;
const seenRows = [], perF = flags.includes('--per'), vsf = flags.find(f => f.startsWith('--vs=')), VS = vsf ? (vsf.slice(5) === 'p' ? 'p' : +vsf.slice(5)) : null;
if (isMain) {
  console.log(`decisions at each level in ${ARENAS[arena].name}, every pair ${N}x (${FIGHT_ORDER.length ** 2 * N} fights a level)`);
  console.log('level     layer  best(all) neutral-best  tells-answered smart wrong early  punish: open->go  thrown landed/open landed/thrown  after a move: seen go landed  round   per min: wild idle repeat hes wander commit panic relax');
  const lvf = flags.find(f => f.startsWith('--lv=')), lvs = lvf ? lvf.slice(5).split(',').map(Number) : [0, 1, 2];
  for (const lv of lvs) for (const on of modes) {
    const { S, per, secs, rounds } = measure(lv, N, arena, on, VS, !flags.includes('--nocommit')), min = secs / 60;
    const best = S.best + S.smart + S.punLand, all = S.dec + S.tells + S.open;
    const pm = v => (v / min).toFixed(1).padStart(5);
    console.log(`${NAMES[lv].padEnd(9)} ${on ? 'on ' : 'off'}    ${pc(best, all)}      ${pc(S.best, S.dec)} of ${String(S.dec).padStart(5)}  ${pc(S.answered, S.tells)} of ${String(S.tells).padStart(5)} ${pc(S.smart, S.tells)} ${pc(S.wrong, S.tells)} ${pc(S.early, S.tells)}   ${pc(S.punGo, S.open)} of ${String(S.open).padStart(5)}  ${pc(S.punTry, S.open)} ${pc(S.punLand, S.open)} ${pc(S.punLand, S.punTry)}  ${String(S.rec[0]).padStart(5)} ${pc(S.rec[1], S.rec[0])} ${pc(S.rec[3], S.rec[0])}  ${(secs / rounds).toFixed(1).padStart(5)} s   ` +
      [S.wild, S.idle, S.repeat, S.hes, S.wander, S.commit, S.panic, S.relax].map(pm).join(''));
    seenRows.push([NAMES[lv] + (on ? '' : ' (off)') + (VS != null ? ' v ' + (NAMES[VS] || 'player') : ''), S, min * (VS != null ? 1 : 2), per]);   // (bot-minutes)
  }
  const row = (name, S, min) => `${name.padEnd(16)} ${pc(S.cSeen - S.cGot, S.cSeen)} of ${String(S.cSeen).padStart(5)}  ${pc(S.seen - S.got, S.seen)} of ${String(S.seen).padStart(5)}   ${pc(S.sAns, S.seen)} ${pc(S.sAns - S.gAns, S.sAns)}   ${pc(S.sNo, S.seen)} ${pc(S.sNo - S.gNo, S.sNo)}   ${pc(S.sMis, S.seen)} ${pc(S.sMis - S.gMis, S.sMis)}   ${pc(S.sUnd, S.seen)}   ${(S.burnt / min).toFixed(1).padStart(5)} ${pc(S.burntPun, S.burnt)}   ${pc(S.best, S.dec)} ${pc(S.smart, S.tells)}   ${(100 * S.slip / Math.max(1, S.presses)).toFixed(1).padStart(4)}% of ${S.presses}`;
  const head = 'seen attacks     avoidable: avoided  all: avoided    answered(av)  missed(av)  misread(av)  undecided  burnt/min pun  best smart  wrong key';
  for (const [name, S, min, per] of seenRows) {
    console.log('\n' + name + ' ' + head); console.log(row('  all', S, min));
    if (perF) for (const id of FIGHT_ORDER) if (per[id]) console.log(row('  ' + id, per[id], min / FIGHT_ORDER.length));
  }
  // committed (humanWatch): as each foe move started, what the bot was in (own move, evade, free without/with evade) and
  // the share of those moves that got it; blind presses, own-rhythm goes, evades spent, trades
  const crow = (name, S, min) => {
    const n = S.aMv + S.aEv + S.aNoEv + S.aFree, nn = S.nMv + S.nEv + S.nNoEv + S.nFree;
    return `${name.padEnd(16)} ${String(n).padStart(6)}  ${pc(S.aMv, n)} ${pc(S.aEv, n)} ${pc(S.aNoEv, n)} ${pc(S.aFree, n)}   ${pc(S.aMv + S.aNoEv, n)}     ${String(nn).padStart(6)}  ${pc(S.nMv, nn)} ${pc(S.nNoEv, nn)}   ${pc(S.nMv + S.nNoEv, nn)}     ${pc(S.hMv + S.hEv + S.hNoEv + S.hFree, n)}  ${pc(S.hMv, S.aMv)} ${pc(S.hNoEv, S.aNoEv)} ${pc(S.hFree, S.aFree)}    ${(S.trades / min).toFixed(2).padStart(5)}   ${pc(S.caught, S.hitOn)} of ${String(S.hitOn).padStart(5)}   ${[S.blind, S.blindGo, S.go, S.goGo, S.spend].map(v => (v / min).toFixed(1).padStart(5)).join('')}`;
  };
  console.log('\ncommitted when the foe starts a move   starts   move evad noEv free  committed|noEv   own-intent: starts move noEv  committed|noEv   landed: all  in-move noEv free   trades/min  hits mid-move   per min: blind thrown  go threw spend');
  for (const [name, S, min, per] of seenRows) {
    console.log(crow(name, S, min));
    if (perF) for (const id of FIGHT_ORDER) if (per[id]) console.log(crow('  ' + id, per[id], min / FIGHT_ORDER.length));
  }
}
