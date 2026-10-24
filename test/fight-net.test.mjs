// node test/fight-net.test.mjs: Fight mode online (js/fight-net.js) without a browser. A host and a player (and a watcher)
// over real WebSockets through the relay (server/relay.mjs): the host runs the fight, the player sends its held input and
// draws the host's snapshots. Checks that the player's inputs (even a one-frame tap) reach its fighter, that every event
// reaches the player once, that the player's view settles on the host's state, that the watcher sees it too, and the
// room's seats and picks (js/net-room.js: fpick, fdev; a touch-only player watches).
import http from 'node:http';
import WebSocket from 'ws';
import { createRelay, NET_PATH } from '../server/relay.mjs';
import { FightClient, FightHost, fightSeats, packInput, unpackInput, snapOf } from '../js/fight-net.js';
import { roomRequest } from '../js/net-room.js';

let fails = 0;
const ok = (cond, what) => { if (!cond) { fails++; console.error('FAIL ' + what); } };

// ---------------------------------------------------------------- the room: seats and picks
{
  const ok1 = fightSeats([{ id: 0, slot: 0, name: 'Hal', fighter: 'duke' }], { fightBot: 2 });
  ok(ok1.seats[0] === 0 && ok1.seats[1] === -1 && ok1.bots[0] === null && ok1.bots[1] === 2 && ok1.ids[0] === 'duke', 'a lone player fights a bot at the room\'s level');
  const ppl = [{ id: 0, slot: 0, name: 'Hal', kb: true }, { id: 3, slot: 2, name: 'Cy', fighter: 'tux' }, { id: 1, slot: 1, name: 'Ann', kb: false }, { id: 2, slot: 3, name: 'Bo' }];
  const s2 = fightSeats(ppl, {});
  ok(s2.seats[0] === 0 && s2.seats[1] === 3 && s2.bots.every(b => b === null), 'the first two players by slot who can fight are seated (a touch-only one is skipped)');
  ok(s2.supers === true, 'supers on unless the room says off');
  const room = { players: ppl, cfg: { mode: 'fight' }, racing: false };
  ok(roomRequest(room, ppl[2], { k: 'fpick', id: 'duke' }, 0).ok && ppl[2].fighter === 'duke', 'a player picks a fighter');
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
// let the last snapshot land and the player's view settle (past DELAY)
H.flush(); await tick();
await until(() => { pump(); return P.lastQ === H.q && Wt.lastQ === H.q; }, 'the last snapshot');
for (let k = 0; k < 20; k++) { P.frame(DT, { x: 0, y: 0 }); Wt.frame(DT, null); playerEv.push(...P.F.events); watchEv.push(...Wt.F.events); }

ok(H.q > 50, `the host sent snapshots (${H.q})`);
ok(lightStarts >= 0.9 * taps, `the player's one-frame light taps reach its fighter (${lightStarts} presses on the host from ${taps} taps)`);
ok(heavyWinds > 0, `a held heavy reaches the host (${heavyWinds} steps held)`);
ok(moveStarts > 0, `the player's presses start its moves (${moveStarts})`);
const cnt = (L, k) => L.filter(e => e.kind === k).length;
for (const k of ['hit', 'round', 'tell']) ok(cnt(playerEv, k) === cnt(hostEv, k) && cnt(watchEv, k) === cnt(hostEv, k), `every '${k}' event reaches the player and the watcher once (host ${cnt(hostEv, k)}, player ${cnt(playerEv, k)}, watcher ${cnt(watchEv, k)})`);
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

// every fighter's kit on the wire: bot fights (Tux and Duke both ways and mirrored; the old roster in pairs), the
// snapshot through JSON onto a drawn-only copy every 3 steps: the copy's fighters (their move's phase, Duke gone, Tux up
// out of shot, the cooldowns...) and world objects (the toboggan's line, the shadow, the ice, the penguins, the portal,
// the ring, the geyser, the puddle; the plug-ins' (Gopher's goroutines, cracks and stake, Ferris's claw and chain ring, Pyth's
// and Octo's, Docky's containers and wake, Swifty's line, cone and feather); the old roster's fields) match the host's
{
  const { Fight } = await import('../js/fight.js');
  const { FIGHT_LEGACY } = await import('../js/fight-chars.js');
  const { applySnap } = await import('../js/fight-net.js');
  const kinds = new Set();
  const { PLUGINS } = await import('../js/kits/index.js');
  const pairs = [['tux', 'duke'], ['duke', 'tux'], ['tux', 'tux'], ['duke', 'duke'], ['tux', 'duke'], ...PLUGINS.flatMap(p => [[p.id, 'tux'], ['duke', p.id], [p.id, p.id]]), ...FIGHT_LEGACY.map((id, k) => [id, FIGHT_LEGACY[(k + 3) % FIGHT_LEGACY.length]])];
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
  ok(['tobline', 'shadow', 'shock', 'ice', 'peng', 'portal', 'ring', 'geyser', 'puddle', 'gorun', 'gocrack', 'gostake', 'feclaw', 'felock', 'pyHiss', 'pyGlow', 'pyArc', 'ocArm', 'ocClone', 'ocRing', 'ocInk', 'dkBox', 'dkWake', 'swLine', 'swCone', 'swFeather', 'cpmine', 'cpleak', 'cpbite', 'cpstink', 'drbeam', 'drcube', 'drpel'].every(k => kinds.has(k)), `the kits' objects went over the wire (${[...kinds].join(', ')})`);
}

for (const ws of [hws, pws, wws]) ws.close();
server.close();
console.log(fails ? `${fails} failure(s)` : 'fight-net: all checks passed');
process.exit(fails ? 1 : 0);
