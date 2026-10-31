// Fight mode online over a laggy (and maybe lossy) link, in one process on a simulated clock: how your own fighter feels
// on the player's screen. `node test/fight-lag.mjs` prints a table; test/fight-net.test.mjs runs a few with checks.
//
// The host runs the fight (the player on fighter 0, a Normal bot on fighter 1); the player's screen (js/fight-net.js
// FightClient) runs at ~60 fps with a little wobble and plays a script off what it sees: walking at the foe, round it
// and away, stopping, and pressing the move keys and the evade (taps, a heavy held now and then). The link: test/net-lossy.mjs
// makeLink (tcp: a WebSocket; udp: a WebRTC DataChannel), one-way `ow` plus up to `jit`, loss, stalls.
// Measured on the player's screen:
//   walk:  frames from starting to walk (after standing still) to your drawn fighter moving (p50/p95)
//   move:  frames from pressing a move key (or the evade) while free and off cooldown to your drawn fighter starting it
//   err:   how far our own copy of the fight had us from where the host's snapshot put us, at that snapshot's moment (p50/p95)
//   jumps: frames where your drawn fighter moves more than JUMP units off its own motion (a correction you can see), while
//          neither the host nor this screen has you knocked about; without prediction, off the host's motion that frame
//   lost:  presses that the host never started a move from (a tap that got lost or came too late to count)
import { mulberry } from './harness.mjs';
import { makeLink, stallsFor } from './net-lossy.mjs';

const pct = (a, q) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(q * b.length))] : NaN; };
export const JUMP = 4;
const KNOCK = new Set(['hurt', 'stagger', 'down', 'getup', 'ko', 'dizzy', 'float', 'frozen', 'grabbed', 'win']);
const KEYS = ['light', 'heavy', 'special', 'guard'], CD = { light: 0, heavy: 1, special: 2, guard: 3 };

export async function lagFight({ ow = 0.04, jit = 0.02, kind = 'tcp', loss = 0, every = 0, dur = 30, seed = 1, predict = true, ids = ['tux', 'duke'], mod = '../js/fight-net.js' }) {
  const { FightHost, FightClient } = await import(mod);
  const rr = mulberry(500 + seed * 17), lr = mulberry(90 + seed * 31);
  const stalls = stallsFor(lr, every, dur + 2);
  const up = makeLink(kind, lr, { ow, jit, loss, stalls }), down = makeLink(kind, lr, { ow, jit, loss, stalls });
  const cfg = { ids, bots: [null, 1], supers: true, seed: 900 + seed, bestOf: 99, roundTime: 99 };
  let t = 0;
  const H = new FightHost(JSON.parse(JSON.stringify(cfg)), { rn: 1, me: -1, send: d => { const txt = JSON.stringify(d); down.send(txt, t, txt.length); } });
  const P = new FightClient(JSON.parse(JSON.stringify(H.F.cfg)), { rn: 1, me: 0, predict, send: d => { const txt = JSON.stringify(d); up.send(txt, t, txt.length); } });
  const R = { walk: [], move: [], err: [], jumps: 0, frames: 0, presses: 0, lost: 0, snaps: 0, bytes: 0, upBytes: 0, steps: 0 };
  let hostNext = 0, playerNext = 0, playerLast = 0;
  // the script: a way to walk (or stand) for a while, and a press now and then
  let dir = { x: 0, y: 0 }, dirUntil = 0, still = 0, hold = null, nextPress = 1;
  let walkWait = null; const moveWait = [];
  let lastDrawn = null, lastHost = null;
  const hostF = () => H.F.f[0];
  while (t < dur) {
    t = Math.min(hostNext, playerNext, up.next(), down.next());
    for (const txt of up.due(t)) { R.upBytes += txt.length; const m = JSON.parse(txt); if (m.k === 'fin') H.input(0, m); }
    for (const txt of down.due(t)) { R.bytes += txt.length; R.snaps++; P.receive(JSON.parse(txt)); }
    if (hostNext <= t) { H.frame(1 / 60, null); hostNext += 1 / 60; }
    if (playerNext <= t) {
      const dt = t - playerLast; playerLast = t; playerNext += (1 / 60) * (0.9 + 0.2 * rr()); if (dt <= 0) continue;
      const V = P.F, me = V.f[0], foe = V.f[1], live = V.phase === 'fight' || V.phase === 'sudden';
      // where to walk: at them, round them, away, or stand
      if (t >= dirUntil) {
        const dx = foe.x - me.x, dy = foe.y - me.y, d = Math.hypot(dx, dy) || 1, r = rr();
        dirUntil = t + 0.25 + rr() * 0.5;
        if (r < 0.35) { dir = { x: 0, y: 0 }; dirUntil = t + 0.15 + rr() * 0.3; }
        else if (r < 0.6) dir = { x: dx / d, y: dy / d };
        else if (r < 0.85) dir = { x: -dy / d * (rr() < 0.5 ? 1 : -1), y: dx / d };
        else dir = { x: -dx / d, y: -dy / d };
      }
      const inp = { x: Math.round(dir.x * 100) / 100, y: Math.round(dir.y * 100) / 100 };
      const free = f => f.state === 'idle' || f.state === 'walk';
      // walking from a standstill: when does the drawn fighter go?
      const moving = inp.x || inp.y;
      if (!moving) still++;
      else { if (still >= 6 && live && free(me) && !walkWait && free(hostF())) walkWait = { f: 0, x: me.x, y: me.y }; still = 0; }
      // a press: a tap (1-3 frames), the heavy sometimes held
      if (hold && --hold.n <= 0) hold = null;
      if (!hold && live && t >= nextPress) {
        const key = KEYS[Math.floor(rr() * 4)];
        hold = { key, n: key === 'heavy' && rr() < 0.4 ? 20 : 1 + Math.floor(rr() * 3) };
        nextPress = t + 0.4 + rr() * 0.8;
        R.presses++;
        if (free(me) && !(me.cd[CD[key]] > 0) && (key !== 'guard' || me.id !== 'duke' || me.ev > 0)) moveWait.push({ f: 0, ms: me.ms, hms: hostF().ms, t });
      }
      if (hold) inp[hold.key] = true;
      P.frame(dt, inp);
      const D = P.F.f[0];
      if (walkWait) { walkWait.f++; if (Math.hypot(D.x - walkWait.x, D.y - walkWait.y) > 1.5) { R.walk.push(walkWait.f); walkWait = null; } else if (walkWait.f > 40) walkWait = null; }
      for (let i = moveWait.length - 1; i >= 0; i--) {
        const w = moveWait[i]; w.f++;
        if (D.ms > w.ms) { R.move.push(w.f); moveWait.splice(i, 1); }
        else if (w.f > 45) { if (!(hostF().ms > w.hms)) R.lost++; moveWait.splice(i, 1); }
      }
      // jumps: off its own motion (the client's own measure), or without prediction off the host's motion
      const h = hostF(), calm = !KNOCK.has(h.state) && !KNOCK.has(D.state) && live;
      if (calm && lastDrawn) {
        R.frames++;
        const off = predict && P.stats ? P.stats.jump : Math.hypot(D.x - lastDrawn.x - (h.x - lastHost.x), D.y - lastDrawn.y - (h.y - lastHost.y));
        if (off > JUMP) R.jumps++;
      }
      lastDrawn = { x: D.x, y: D.y }; lastHost = { x: h.x, y: h.y };
    }
  }
  R.err = (P.stats && P.stats.err) || []; R.steps = P.stats ? P.stats.steps : 0; R.broke = P.stats && P.stats.broke; R.dur = dur;
  return R;
}
const f1 = v => Number.isFinite(v) ? String(v) : '-';
export function lagLine(name, R) {
  return `${name.padEnd(34)} walk ${f1(pct(R.walk, 0.5))}/${f1(pct(R.walk, 0.95))} frames (${R.walk.length}), move ${f1(pct(R.move, 0.5))}/${f1(pct(R.move, 0.95))} (${R.move.length}), lost ${R.lost}/${R.presses};` +
    ` err ${R.err.length ? pct(R.err, 0.5).toFixed(1) + '/' + pct(R.err, 0.95).toFixed(1) : '-'}; jumps > ${JUMP} in ${R.jumps}/${R.frames} frames; ${(R.bytes / R.dur / 1024).toFixed(0)} KB/s down, ${(R.upBytes / R.dur / 1024).toFixed(1)} up; ${(R.steps / R.dur).toFixed(0)} steps/s` + (R.broke ? ' BROKE ' + R.broke.message : '');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mod = process.env.MOD || '../js/fight-net.js', dur = +(process.env.DUR || 30), kinds = (process.env.KIND || 'tcp').split(',');
  const pairs = [['tux', 'duke'], ['duke', 'tux'], ['gopher', 'ferris']];
  for (const kind of kinds) for (const [nm, o] of [['40 ms each way +20 jitter', { ow: 0.04, jit: 0.02 }], ['120 ms each way +40 jitter', { ow: 0.12, jit: 0.04 }], ['40 ms, 3% loss + stalls', { ow: 0.04, jit: 0.02, loss: 0.03, every: 3 }]])
    for (const predict of process.env.BOTH ? [false, true] : [true]) {
      const all = { walk: [], move: [], err: [], jumps: 0, frames: 0, presses: 0, lost: 0, bytes: 0, upBytes: 0, steps: 0, dur: 0 };
      for (const [k, ids] of pairs.entries()) {
        const R = await lagFight({ ...o, kind, dur, predict, ids, seed: k + 1, mod });
        for (const q of ['walk', 'move', 'err']) all[q].push(...R[q]);
        for (const q of ['jumps', 'frames', 'presses', 'lost', 'bytes', 'upBytes', 'steps', 'dur']) all[q] += R[q];
        if (R.broke) all.broke = R.broke;
      }
      console.log(lagLine(`${kind} ${nm}${predict ? '' : ' (no pred)'}`, all));
    }
}
