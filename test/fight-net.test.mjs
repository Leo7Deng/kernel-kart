// node test/fight-net.test.mjs: Fight mode online (js/fight-net.js) without a browser, over the real relay. Checks the
// player's inputs (even a one-frame tap) reach its fighter, every event arrives once, the player's and a watcher's view
// settle on the host's, and the room's seats and picks (js/net-room.js; a touch-only player watches).
import http from 'node:http';
import WebSocket from 'ws';
import { createRelay, NET_PATH } from '../server/relay.mjs';
import { FightClient, FightHost, fightSeats, packInput, unpackInput, snapOf } from '../js/fight-net.js';
import { roomRequest } from '../js/net-room.js';

let fails = 0;
const ok = (cond, what) => { if (!cond) { fails++; console.error('FAIL ' + what); } };

// ---------------------------------------------------------------- the room: seats and picks
{
  const ok1 = fightSeats([{ id: 0, slot: 0, name: 'Hal', fighter: 'gopher' }], { fightBot: 2 });
  ok(ok1.seats[0] === 0 && ok1.seats[1] === -1 && ok1.bots[0] === null && ok1.bots[1] === 2 && ok1.ids[0] === 'gopher', 'a lone player fights a bot at the room\'s level');
  const ppl = [{ id: 0, slot: 0, name: 'Hal', kb: true }, { id: 3, slot: 2, name: 'Cy', fighter: 'tux' }, { id: 1, slot: 1, name: 'Ann', kb: false }, { id: 2, slot: 3, name: 'Bo' }];
  const s2 = fightSeats(ppl, {});
  ok(s2.seats[0] === 0 && s2.seats[1] === 3 && s2.bots.every(b => b === null), 'the first two players by slot who can fight are seated (a touch-only one is skipped)');
  ok(s2.supers === true, 'supers on unless the room says off');
  ok(s2.bestOf === 3 && s2.roundTime === 60, 'a room with no match setting fights first to 2 (best of 3), 60 s rounds');
  const s5 = fightSeats(ppl, { fightRounds: 5, fightTime: 90 }), s1 = fightSeats(ppl, { fightRounds: 1, fightTime: 40 }), sx = fightSeats(ppl, { fightRounds: 4, fightTime: 1e9 });
  ok(s5.bestOf === 9 && s5.roundTime === 90 && s1.bestOf === 1 && s1.roundTime === 40, 'the host\'s rounds and round time reach the fight (first to 5: best of 9; first to 1: one round)');
  ok(sx.bestOf === 3 && sx.roundTime === 60, 'a rounds or time setting the menus don\'t offer falls back to the default');
  const room = { players: ppl, cfg: { mode: 'fight' }, racing: false };
  ok(roomRequest(room, ppl[2], { k: 'fpick', id: 'gopher' }, 0).ok && ppl[2].fighter === 'gopher', 'a player picks a fighter');
  ok(!roomRequest(room, ppl[2], { k: 'fpick', id: 'tux' }, 500).ok, 'a second fighter pick within the wait is refused');
  ok(!roomRequest(room, ppl[3], { k: 'fpick', id: 'clippy' }, 0).ok, 'a fighter that isn\'t one is refused');
  ok(roomRequest(room, ppl[2], { k: 'fdev', kb: true }, 600).ok && ppl[2].kb === true, 'the device flag has no wait');
  ok(fightSeats(ppl, {}).seats[1] === 1, 'once their device can fight, they take their seat');
  const p = packInput({ x: 0.333, y: -1, light: true, guard: true }), u = unpackInput(p);
  ok(u.light && u.guard && !u.heavy && !('grab' in u) && Math.abs(u.x - 0.33) < 1e-9 && u.y === -1, 'input packs and unpacks (no grab since 2026-10-23)');
}

// ---------------------------------------------------------------- host and player over the relay
const server = http.createServer(), relay = createRelay();
relay.attach(server);
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `ws://127.0.0.1:${server.address().port}${NET_PATH}`;
const open = () => new Promise((res, rej) => {
  const ws = new WebSocket(url), inbox = [];
  ws.on('message', raw => inbox.push(JSON.parse(String(raw))));
  ws.take = t => { const i = inbox.findIndex(m => m.t === t); return i >= 0 ? inbox.splice(i, 1)[0] : null; };
  ws.drain = () => inbox.splice(0);
  ws.put = m => ws.send(JSON.stringify(m));
  ws.on('open', () => res(ws)); ws.on('error', rej);
});
const tick = () => new Promise(r => setTimeout(r, 1));
async function until(f, what, ms = 3000) { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error('timed out: ' + what); await tick(); } }

const hws = await open(), pws = await open(), wws = await open();
hws.put({ t: 'host' });
let room; await until(() => (room = hws.take('room')), 'room');
pws.put({ t: 'join', code: room.code, name: 'Pat' }); wws.put({ t: 'join', code: room.code, name: 'Wat' });
await until(() => pws.take('joined'), 'joined'); await until(() => wws.take('joined'), 'joined 2');

const seat = fightSeats([{ id: 0, slot: 0, name: 'Hal', fighter: 'tux' }, { id: 1, slot: 1, name: 'Pat', fighter: 'duke' }, { id: 2, slot: 2, name: 'Wat', kb: false }], { fightSupers: true });
const cfg = { ids: seat.ids, bots: seat.bots, supers: true, seed: 777, bestOf: 3, roundTime: 20 };
const H = new FightHost(cfg, { rn: 5, me: 0, send: d => hws.put({ t: 'send', d }) });
const P = new FightClient(cfg, { rn: 5, me: 1, send: d => pws.put({ t: 'send', d }) });
const Wt = new FightClient(cfg, { rn: 5, me: -1, send: () => ok(false, 'a watcher sends nothing') });
const hostEv = [], playerEv = [], watchEv = [];
let taps = 0, lightStarts = 0, heavyWinds = 0, moveStarts = 0, lastMove = null;
// what the host's fight is given for the player's fighter each fixed step (a one-frame tap must land as a press)
{ const set = H.F.setInput.bind(H.F); let was = false; H.F.setInput = (i, inp) => { if (i === 1) { if (inp.light && !was) lightStarts++; was = !!inp.light; if (inp.heavy) heavyWinds++; } set(i, inp); }; }
const pump = () => {
  for (const m of hws.drain()) if (m.t === 'msg' && m.d && m.d.k === 'fin' && m.from === 1) H.input(1, m.d);
  for (const m of pws.drain()) if (m.t === 'msg' && m.d && m.d.k === 'fsnap') P.receive(m.d);
  for (const m of wws.drain()) if (m.t === 'msg' && m.d && m.d.k === 'fsnap') Wt.receive(m.d);
};
const DT = 1 / 60;
let frames = 0;
// the player's script: walk at the host, a one-frame light tap every 0.4 s, a held heavy now and then; the host walks in
for (; frames < 60 * 30 && H.F.phase !== 'over'; frames++) {
  const t = frames * DT, me = P.F.f[1], foe = P.F.f[0], dx = foe.x - me.x, dy = foe.y - me.y, d = Math.hypot(dx, dy) || 1;
  const live = H.F.phase === 'fight' || H.F.phase === 'sudden';
  const tap = live && frames % 24 === 0, heavy = live && frames % 150 > 120;
  if (tap) taps++;
  P.frame(DT, { x: dx / d, y: dy / d, light: tap, heavy });
  Wt.frame(DT, null);
  H.frame(DT, { x: -Math.sign(H.F.f[0].x) * 0.3, y: 0, light: frames % 37 === 0 });
  hostEv.push(...H.F.events); playerEv.push(...P.F.events); watchEv.push(...Wt.F.events);
  const hf = H.F.f[1];
  if (hf.move !== lastMove) { if (hf.move && hf.state === 'wind') moveStarts++; lastMove = hf.move; }
  for (let k = 0; k < 3; k++) { await tick(); pump(); }
}
// both stand still (the host needs the let-go too: our fighter is predicted), then the player's view settles past DELAY
for (let k = 0; k < 40; k++) { P.frame(DT, { x: 0, y: 0 }); Wt.frame(DT, null); H.frame(DT, { x: 0, y: 0 }); hostEv.push(...H.F.events); playerEv.push(...P.F.events); watchEv.push(...Wt.F.events); for (let j = 0; j < 3; j++) { await tick(); pump(); } }
H.flush(); await tick();
await until(() => { pump(); return P.lastQ === H.q && Wt.lastQ === H.q; }, 'the last snapshot');
for (let k = 0; k < 20; k++) { P.frame(DT, { x: 0, y: 0 }); Wt.frame(DT, null); playerEv.push(...P.F.events); watchEv.push(...Wt.F.events); }

ok(H.q > 50, `the host sent snapshots (${H.q})`);
ok(lightStarts >= 0.9 * taps, `the player's one-frame light taps reach its fighter (${lightStarts} presses on the host from ${taps} taps)`);
ok(heavyWinds > 0, `a held heavy reaches the host (${heavyWinds} steps held)`);
ok(moveStarts > 0, `the player's presses start its moves (${moveStarts})`);
const cnt = (L, k) => L.filter(e => e.kind === k).length;
const near = (k, a, b) => a === b;
for (const k of ['hit', 'round', 'tell']) ok(near(k, cnt(playerEv, k), cnt(hostEv, k)) && cnt(watchEv, k) === cnt(hostEv, k), `every '${k}' event reaches the player and the watcher once (host ${cnt(hostEv, k)}, player ${cnt(playerEv, k)}, watcher ${cnt(watchEv, k)})`);
ok(cnt(hostEv, 'hit') > 0, 'there was fighting');
const host = snapOf(H.F), view = snapOf(P.F), watch = snapOf(Wt.F);
for (const [nm, v] of [['player', view], ['watcher', watch]]) {
  ok(v.phase === host.phase && v.round === host.round && JSON.stringify(v.wins) === JSON.stringify(host.wins), `${nm}: phase, round and wins as the host's (${v.phase} ${v.round} ${v.wins} / ${host.phase} ${host.round} ${host.wins})`);
  for (let i = 0; i < 2; i++) {
    const a = v.f[i], b = host.f[i], err = Math.hypot(a.x - b.x, a.y - b.y);
    ok(err < 0.05 && a.hp === b.hp && a.state === b.state && a.pose === b.pose, `${nm}: fighter ${i} as the host's once settled (off by ${err.toFixed(3)}, hp ${a.hp}/${b.hp}, ${a.state}/${b.state})`);
  }
}
// a snapshot from another fight (a rematch's rn) is ignored, and so is an old one
ok(!P.receive({ k: 'fsnap', rn: 6, q: 9999, s: host, ev: [] }) && !P.receive({ k: 'fsnap', rn: 5, q: 1, s: host, ev: [] }), 'another fight\'s or an old snapshot is ignored');
console.log(`fight-net: ${frames} frames, ${H.q} snapshots (~${(JSON.stringify(snapOf(H.F)).length / 1024).toFixed(1)} KB each), ${cnt(hostEv, 'hit')} hits, ${moveStarts} moves from ${taps} taps; phase ${host.phase}`);

// every fighter's kit on the wire: bot fights, the snapshot through JSON onto a drawn-only copy every 3 steps; the
// copy's fighters and world objects (every kit's) match the host's
{
  const { Fight } = await import('../js/fight.js');
  const { applySnap } = await import('../js/fight-net.js');
  const kinds = new Set();
  const { PLUGINS } = await import('../js/kits/index.js');
  const pairs = [['tux', 'duke'], ['duke', 'tux'], ['tux', 'tux'], ['duke', 'duke'], ['tux', 'duke'], ...PLUGINS.flatMap(p => [[p.id, 'tux'], ['duke', p.id], [p.id, p.id]])];
  pairs.forEach((ids, k) => {
    const F = new Fight({ ids, bots: [k % 3, 1], seed: 50 + k, supers: true }), V = new Fight({ ids, bots: [null, null], seed: 1 });
    let bad = '';
    for (let n = 0; n < 60 * 40 && F.phase !== 'over' && !bad; n++) {
      F.step(); F.events.length = 0;
      if (n % 3) continue;
      applySnap(V, JSON.parse(JSON.stringify(snapOf(F))));
      for (const o of F.objs) kinds.add(o.kind);
      if (V.objs.length !== F.objs.length || V.objs.some((o, j) => o.kind !== F.objs[j].kind || Math.abs(o.x - F.objs[j].x) > 0.01)) bad = `objects differ at step ${n}`;
      else if (V.f.some((f, j) => f.state !== F.f[j].state || Math.abs(f.x - F.f[j].x) > 0.01 || f.under !== F.f[j].under || f.lockT !== +F.f[j].lockT.toFixed(2)
        || f.down !== F.f[j].down || f.ph !== F.f[j].ph || f.gone !== F.f[j].gone || f.air !== F.f[j].air || f.cd.some((c, q) => Math.abs(c - F.f[j].cd[q]) > 0.006) || f.flankSide !== F.f[j].flankSide || Math.abs(f.stam - F.f[j].stam) > 0.006 || Math.abs(f.gassed - F.f[j].gassed) > 0.006 || Math.abs(f.counter - F.f[j].counter) > 0.006 || Math.abs(f.guardArc - F.f[j].guardArc) > 0.006)) bad = `fighters differ at step ${n}`;
    }
    ok(!bad, `${ids.join(' v ')} on the wire: ${bad || 'ok'}`);
  });
  ok(['txStreak', 'ring', 'gorun', 'gocrack', 'godl', 'gopit', 'feclaw', 'felock', 'pyArc', 'pyApple', 'ocClone', 'ocRing', 'ocInk', 'dkWave', 'dkBox', 'swCone', 'swFeather', 'cpfly', 'cpleak', 'cpstink', 'drbeam', 'drcube', 'drpel'].every(k => kinds.has(k)), `the kits' objects went over the wire (${[...kinds].join(', ')})`);
}

// ---------------------------------------------------------------- your own fighter over a laggy link (test/fight-lag.mjs)
// predicted: at 40 and 120 ms each way a press shows the frame you make it, nothing jumps, the guess stays close; over
// a lossy DataChannel (3% loss, stalls) presses still get there
{
  const { lagFight, lagLine } = await import('./fight-lag.mjs');
  const p50 = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; }, p95 = a => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * 0.95))]; };
  for (const [ow, jit] of [[0.04, 0.02], [0.12, 0.04]]) {
    const R = await lagFight({ ow, jit, dur: 25, seed: 3 }), B = await lagFight({ ow, jit, dur: 25, seed: 3, predict: false });
    console.log(lagLine(`${ow * 1000} ms`, R)); console.log(lagLine(`${ow * 1000} ms, no prediction`, B));
    ok(!R.broke, 'prediction never breaks');
    ok(p50(R.move) <= 1 && R.move.filter(f => f <= 2).length >= 0.9 * R.move.length, `a move starts on screen within a frame or two of the press at ${ow * 1000} ms (median ${p50(R.move)}; without prediction ${p50(B.move)})`);
    ok(p50(R.walk) <= 2 && p50(R.walk) < p50(B.walk), `walking starts within two frames at ${ow * 1000} ms (median ${p50(R.walk)}; without prediction ${p50(B.walk)})`);
    ok(R.jumps <= R.frames * 0.01, `next to no visible corrections at ${ow * 1000} ms (${R.jumps} of ${R.frames} frames)`);
    ok(p95(R.err) < 6, `our guess at the host's state is close at ${ow * 1000} ms (p95 ${p95(R.err).toFixed(1)} units)`);
  }
  const L = await lagFight({ ow: 0.04, jit: 0.02, kind: 'udp', loss: 0.03, every: 3, dur: 15, seed: 4 });
  console.log(lagLine('udp 3% loss + stalls', L));
  ok(!L.broke && L.lost <= Math.max(2, 0.06 * L.presses) && L.jumps <= L.frames * 0.03, `a lossy unordered line: presses get there (${L.lost} of ${L.presses} lost), few corrections (${L.jumps} of ${L.frames})`);
}

// ---------------------------------------------------------------- the room's sessions (js/net.js, in Node)
// net.js itself, twice (host and player copies of the module), on one relay, with stand-in browser bits
globalThis.WebSocket = WebSocket;
globalThis.location = { protocol: 'http:', host: `127.0.0.1:${server.address().port}`, hostname: '127.0.0.1', href: 'http://127.0.0.1/' };
globalThis.addEventListener ||= () => { }; globalThis.removeEventListener ||= () => { };
const wait = ms => new Promise(r => setTimeout(r, ms));
const NA = await import('../js/net.js?host'), NB = await import('../js/net.js?player');
await NA.hostRoom('Hal', 0, { track: 0, laps: 3, bots: 0, aiLevel: 1, mode: 'fight' });
await until(() => NA.net.s.code, 'a room code');
const code = NA.net.s.code, rr = relay.rooms.get(code);
// the phantom player: a room link's own join and a press of Join at once must not leave a seat nobody is in
{
  const r = await Promise.allSettled([NB.joinRoom(code, 'Hot Fix'), NB.joinRoom(code, 'Pat')].map(p => Promise.race([p, wait(2000).then(() => 'hung')])));
  await wait(200);
  ok(r[0].status === 'rejected' && r[0].reason.stale && r[1].status === 'fulfilled' && r[1].value !== 'hung', `two joins at once: the older gives up quietly, the newer gets in (${r.map(x => x.status)})`);
  ok(NA.net.s.players.map(p => p.name).join() === 'Hal,Pat' && rr.peers.size === 1, `...and only the newer is in the room (${NA.net.s.players.map(p => p.name)}; ${rr.peers.size} on the relay)`);
}

// coming back mid-fight: a bot fights on for a dropped player; on reconnect (old id) they're back on their fighter
{
  NA.hostFight();
  await until(() => NB.net.s.fight, 'the fight on the player\'s screen');
  const id = NB.net.s.me, i = NA.net.s.fightSeats.indexOf(id);
  ok(i >= 0 && NB.net.s.fight.me === i, `Pat has a seat (${i})`);
  NB.net.s.ws.terminate();   // (the Wi-Fi drops)
  await until(() => NA.net.s.fight.F.cfg.bots[i] != null, 'a bot standing in');
  ok(NA.net.s.fightSeats[i] === -1, 'while they\'re gone a bot fights for them');
  await until(() => NB.net.s && !NB.net.s.recon && NB.net.s.fight && NA.net.s.fightSeats[i] === id, 'back in the fight', 8000);
  ok(NB.net.s.me === id && NB.net.s.fight.me === i && NA.net.s.fight.F.cfg.bots[i] === null && NA.net.s.players.length === 2 && rr.peers.size === 1, `back on their old id (${NB.net.s.me}), on their fighter, the bot out, nobody twice (${NA.net.s.players.map(p => p.name + '#' + p.id)})`);
  NB.net.s.fight.frame(1 / 60, { x: 1, y: 0, light: true }); await wait(100);
  ok(NA.net.s.fight.queue[i].length > 0 || NA.net.s.fight.lastN[i] > 0, 'their input drives their fighter again');
  NA.hostToRoom(); await wait(100);
}
// a connection that's somehow still up when its player comes back on a new one: dropped at once, not a second player
{
  const s1 = await open(), s2 = await open();
  s1.put({ t: 'join', code, name: 'Twin' }); let j1; await until(() => (j1 = s1.take('joined')), 'joined twin');
  await until(() => NA.net.s.players.some(p => p.id === j1.id), 'the host has them');
  s2.put({ t: 'join', code, name: 'Twin', back: { id: j1.id, key: j1.key } }); let j2; await until(() => (j2 = s2.take('joined')), 'came back');
  await wait(100);
  ok(j2.id === j1.id && s1.readyState !== 1 && NA.net.s.players.filter(p => p.name === 'Twin').length === 1 && rr.peers.size === 2, `the same player back on a new connection: their old id (${j2.id}/${j1.id}), the old one dropped, one of them in the room (${NA.net.s.players.map(p => p.name)})`);
  s2.put({ t: 'join', code, name: 'Imp', back: { id: NB.net.s.me, key: 'not-it' } }); await wait(100);
  ok(rr.peers.size === 2 && NB.net.s && !NB.net.s.recon && rr.peers.get(NB.net.s.me), 'a wrong key takes nobody\'s seat');
  s1.close(); s2.close();
}

NB.leaveRoom(); NA.leaveRoom();
for (const ws of [hws, pws, wws]) ws.close();
server.close();
console.log(fails ? `${fails} failure(s)` : 'fight-net: all checks passed');
process.exit(fails ? 1 : 0);
