// Fight bots' play style: the fight-roundrobin.mjs fights, counting ground hits and get-ups, meaty hits, move variety,
// kit setups paid off (venom then Coil, Lock then Claw...), distance, breaks taken, win rates.
//   node test/fight-bot-style.mjs <level 0|1|2> [arenas, default ring] [fights per pair, default 12] [--jobs=N] [--json=path]
// (run with nice -n 19; spread over every core: test/pool.mjs)
import { writeFileSync } from 'node:fs';
import { Fight } from '../js/fight.js';
import { FIGHTERS, FIGHT_ORDER } from '../js/fight-chars.js';
import { rrFights } from './fight-roundrobin.mjs';
import { mapPool, poolWorker, serve } from './pool.mjs';

const MK = ['move1', 'move2', 'move3', 'evade'];
// a kit's setups: [name, setup (what it landed, a test on the event), payoff move key, within s]; a payoff counts when
// that move's hit lands within the window after the setup landed on the same foe
const SETUPS = {
  pyth: [['Coil > Whip', e => e.kind === 'pyToss', 'move1', 3.2], ['Coil > Apple', e => e.kind === 'pyToss', 'move3', 3.2]],
  ferris: [['Lock > Claw', e => e.kind === 'feLocked', 'move1', 2.5], ['Lock > unsafe', e => e.kind === 'feLocked', 'move2', 2.5]],
  docky: [['Wave > Slap', e => e.kind === 'hit' && e.move === 'move2', 'move1', 2], ['Compose > Slap', e => e.kind === 'hit' && e.move === 'move3', 'move1', 2]],
  duke: [['Freeze > Jab', e => e.kind === 'freeze', 'move1', 2], ['Freeze > Java', e => e.kind === 'freeze', 'move2', 2.5]],
  cpp: [['Leak > Pointer', e => e.kind === 'cpGoo' || (e.kind === 'hit' && e.move === 'move3'), 'move1', 2.5], ['Pointer > Free', e => e.kind === 'cpStick' || (e.kind === 'hit' && e.move === 'move1'), 'move2', 3]],
  gopher: [['Deadlock > Dig', e => e.kind === 'hit' && e.move === 'move3', 'move1', 2], ['Rush > Dig', e => e.kind === 'hit' && e.move === 'move2', 'move1', 2]],
  octo: [['Push > Blame', e => e.kind === 'hit' && e.move === 'move2', 'move1', 2]],
  swifty: [['Gust > Closure', e => e.kind === 'hit' && e.move === 'move3', 'move2', 2.5], ['Closure > Catch', e => e.kind === 'hit' && e.move === 'move2', 'move1', 2]],
  droid: [['Service > Beam', e => e.kind === 'hit' && e.move === 'move2', 'move1', 2.5], ['Cube > Beam', e => e.kind === 'hit' && e.move === 'move3', 'move1', 2]],
  tux: [['Armour > Fish', e => e.kind === 'hit' && e.move === 'move3', 'move1', 3], ['Slide > Fish', e => e.kind === 'hit' && e.move === 'move2', 'move1', 2]],
};
const LANDS = new Set(['hit', 'freeze', 'feLocked', 'cpGoo', 'cpStick', 'cpBite']);
const blank = () => ({ rounds: 0, w: 0, g: 0, thrown: [0, 0, 0, 0], landed: [0, 0, 0, 0], ent: 0, entN: 0, ghit: 0, downs: 0, downNear: 0, ghitNear: 0,
  rises: 0, stays: 0, sc: {}, style: {}, riseToward: 0, riseSide: 0, riseAway: 0, riseT: 0, meaty: 0, hits: 0, combo: 0, setup: {}, gapSum: 0, gapN: 0, far: 0, idleNear: 0 });

function fightStyle({ cfg }) {
  const F = new Fight(cfg), cap = (F.cfg.roundTime + 64) * 60 * F.cfg.bestOf * 3;
  const S = [blank(), blank()], ids = F.f.map(f => f.id);
  let rnd = -1, cnt = [[0, 0, 0], [0, 0, 0]], lastMs = [-1, -1], lastLand = [{}, {}], setupAt = [[], []], downAt = [-1, -1], lastDown = [0, 0], upAt = [-9, -9], downNear = [0, 0];
  const endRound = () => { for (let i = 0; i < 2; i++) { const c = cnt[i], n = c[0] + c[1] + c[2]; if (n >= 3) { let h = 0; for (const v of c) if (v) h -= v / n * Math.log(v / n); S[i].ent += h / Math.log(3); S[i].entN++; } S[i].rounds++; } cnt = [[0, 0, 0], [0, 0, 0]]; };
  let n = 0;
  while (F.phase !== 'over' && n < cap) {
    F.step(); n++;
    if (F.round !== rnd) { if (rnd >= 0) endRound(); rnd = F.round; setupAt = [[], []]; lastLand = [{}, {}]; }
    for (let i = 0; i < 2; i++) {
      const f = F.f[i], o = F.f[1 - i];
      if (f.ms !== lastMs[i] && f.move) { lastMs[i] = f.ms; const k = MK.indexOf(f.move); if (k >= 0) { S[i].thrown[k]++; if (k < 3) cnt[i][k]++; } }
      if (F.phase === 'fight') {
        const gap = Math.hypot(f.x - o.x, f.y - o.y) - f.r - o.r; S[i].gapSum += gap; S[i].gapN++; if (gap > 220) S[i].far++;
        if (gap < 120 && (f.state === 'idle' || f.state === 'walk') && Math.hypot(f.vx, f.vy) < 25) S[i].idleNear++;
      }
      if (f.state === 'down' && downAt[i] < 0) { downAt[i] = F.time; lastDown[i] = F.time; S[i].downs++; downNear[i] = 0; }
      if (f.state === 'down' && Math.hypot(f.x - o.x, f.y - o.y) - f.r - o.r < 90 && (o.state === 'idle' || o.state === 'walk')) downNear[i] = 1;
      if (f.state !== 'down' && downAt[i] >= 0) {
        if (f.state === 'getup' && !f.roll) S[i].stays++;
        if (downNear[i]) S[1 - i].downNear++;
        downAt[i] = -1;
      }
      if (f.state === 'idle' && f.safeT > 0 && upAt[i] < F.time - 0.5) upAt[i] = F.time;
    }
    for (const e of F.events) {
      if (e.who == null) continue;
      const a = e.who, d = e.to;
      if (e.kind === 'rise') {
        const f = F.f[a], o = F.f[1 - a], toO = Math.atan2(o.y - f.y, o.x - f.x); let df = Math.abs(((e.a - toO) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
        S[a].rises++; S[a].riseT += F.time - lastDown[a]; if (df < Math.PI / 3) S[a].riseToward++; else if (df < 2 * Math.PI / 3) S[a].riseSide++; else S[a].riseAway++;
      }
      if (d == null || d === a) continue;
      if (LANDS.has(e.kind) && e.move) {
        const k = MK.indexOf(e.move);
        if (e.kind === 'hit') {
          S[a].hits++;
          if (k >= 0) S[a].landed[k]++;
          if (e.ground) { S[a].ghit++; if (downNear[d]) S[a].ghitNear++; }
          if (F.time - upAt[d] < 0.4 && !e.ground) S[a].meaty++;
          for (const kk in lastLand[a]) if (kk !== e.move && F.time - lastLand[a][kk] < 2) { S[a].combo++; break; }
          for (const s of setupAt[a]) if (s[1] === e.move && F.time - s[0] <= s[2] && !s[3]) { s[3] = 1; S[a].setup[s[4]] = (S[a].setup[s[4]] || 0) + 1; }
        }
        lastLand[a][e.move] = F.time;
      }
      for (const [name, test, pay, win] of SETUPS[ids[a]] || []) if (test(e)) {
        const k = 'n:' + name; S[a].setup[k] = (S[a].setup[k] || 0) + 1;
        setupAt[a].push([F.time, pay, win, 0, name]);
      }
    }
    F.events.length = 0;
  }
  endRound();
  for (let i = 0; i < 2; i++) { const m = F.ai[i]; if (m && m.sc) { S[i].sc = { ...m.sc }; S[i].style = { [m.P.style]: 1 }; } }
  const won = F.phase === 'over' ? F.winner : -1;
  if (won >= 0 && ids[0] !== ids[1]) { S[won].w++; S[0].g++; S[1].g++; }
  return { ids, S };
}
if (poolWorker(import.meta.url)) serve(fightStyle);

export function addStyle(T, { ids, S }) {
  for (let i = 0; i < 2; i++) {
    const t = T[ids[i]] || (T[ids[i]] = blank()), s = S[i];
    for (const k in s) {
      if (k === 'setup' || k === 'sc' || k === 'style') { for (const q in s[k]) t[k][q] = (t[k][q] || 0) + s[k][q]; }
      else if (Array.isArray(s[k])) s[k].forEach((v, j) => { t[k][j] += v; });
      else t[k] += s[k];
    }
  }
}
export function styleReport(T, title, byStyle) {
  const out = [], p = s => out.push(s), pc = (a, b) => b ? (100 * a / b).toFixed(0) + '%' : '-', f2 = v => v.toFixed(2);
  const all = blank(); for (const id in T) addStyle({ all }, { ids: ['all', 'all'], S: [T[id], blank()] });
  const A = all, R = A.rounds || 1;
  p(`## ${title}\n`);
  p(`All: ground hits/round ${f2(A.ghit / R)} (near and free for ${pc(A.downNear, A.downs)} of downs, of those hit ${pc(A.ghitNear, A.downNear)}), downs/round ${f2(A.downs / R)}, rises ${pc(A.rises, A.downs)} of downs (toward ${pc(A.riseToward, A.rises)}, side ${pc(A.riseSide, A.rises)}, away ${pc(A.riseAway, A.rises)}; at ${(A.riseT / (A.rises || 1)).toFixed(2)} s), stayed down ${pc(A.stays, A.downs)}, meaty hits/round ${f2(A.meaty / R)}, variety ${f2(A.ent / (A.entN || 1))}, combo hits ${pc(A.combo, A.hits)}, moves/round ${f2((A.thrown[0] + A.thrown[1] + A.thrown[2]) / R)}, evades/round ${f2(A.thrown[3] / R)}, gap ${(A.gapSum / (A.gapN || 1)).toFixed(0)}, far ${pc(A.far, A.gapN)}, standing near ${pc(A.idleNear, A.gapN)}\n`);
  p('Style per round: ' + Object.entries(A.sc).map(([k, v]) => `${k} ${f2(v / R)}`).join(', ') + `; top move share ${pc(Math.max(...A.thrown.slice(0, 3)), A.thrown[0] + A.thrown[1] + A.thrown[2])}\n`);
  if (byStyle) {
    p('| Style | Bots | Gap | Moves/rd | Evades/rd | Ground hits/rd | Stayed down | Rises toward/side/away | Meaty/rd | Combo | Win |'); p('|---|---|---|---|---|---|---|---|---|---|---|');
    for (const st in byStyle) { const t = byStyle[st], r = t.rounds || 1; p(`| ${st} | ${t.n} | ${(t.gapSum / (t.gapN || 1)).toFixed(0)} | ${f2((t.thrown[0] + t.thrown[1] + t.thrown[2]) / r)} | ${f2(t.thrown[3] / r)} | ${f2(t.ghit / r)} | ${pc(t.stays, t.downs)} | ${pc(t.riseToward, t.rises)}/${pc(t.riseSide, t.rises)}/${pc(t.riseAway, t.rises)} | ${f2(t.meaty / r)} | ${pc(t.combo, t.hits)} | ${pc(t.w, t.g)} |`); }
    p('');
  }
  p('| Fighter | Win | Ground hits/rd | Rises | Stayed | Meaty/rd | Variety | Combo | Moves/rd (1/2/3/evade) | Gap | Setups paid off |');
  p('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const id of FIGHT_ORDER) {
    const t = T[id]; if (!t) continue; const r = t.rounds || 1;
    const su = (SETUPS[id] || []).map(([nm]) => `${nm} ${t.setup[nm] || 0}/${t.setup['n:' + nm] || 0}`).join(', ');
    p(`| ${FIGHTERS[id].name} | ${pc(t.w, t.g)} | ${f2(t.ghit / r)} | ${pc(t.rises, t.downs)} | ${pc(t.stays, t.downs)} | ${f2(t.meaty / r)} | ${f2(t.ent / (t.entN || 1))} | ${pc(t.combo, t.hits)} | ${t.thrown.map(v => (v / r).toFixed(1)).join('/')} | ${(t.gapSum / (t.gapN || 1)).toFixed(0)} | ${su} |`);
  }
  return out.join('\n');
}

if (!poolWorker(import.meta.url) && import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), pos = args.filter(a => !a.startsWith('--')), js = args.find(a => a.startsWith('--json='));
  const LVL = +(pos[0] ?? 1), ARS = (pos[1] || 'ring').split(','), N = +pos[2] || 12, t0 = Date.now();
  const fights = rrFights(LVL, ARS, FIGHT_ORDER, N);
  const res = await mapPool(import.meta.url, fights);
  const T = {}, B = {}; for (const r of res) { addStyle(T, r); for (let i = 0; i < 2; i++) { const st = Object.keys(r.S[i].style)[0]; if (!st) continue; addStyle(B, { ids: [st, st], S: [r.S[i], blank()] }); B[st].n = (B[st].n || 0) + 1; } }
  console.log(styleReport(T, `${['Chill', 'Normal', 'Ruthless'][LVL]}: ${fights.length} fights on ${ARS.join(', ')}`, B));
  if (0) console.log(styleReport(T, `${['Chill', 'Normal', 'Ruthless'][LVL]}: ${fights.length} fights on ${ARS.join(', ')}`));
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (js) writeFileSync(js.slice(7), JSON.stringify(T));
}
