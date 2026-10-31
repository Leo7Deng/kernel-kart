// node test/ghost-share.test.mjs: a friend's ghost survives the trip. A bot's time-trial ghost on every track is packed
// into a link (ghost-share.js) and unpacked: it must match, the link stay a sensible length, and a kept friend's ghost
// load back as a rival.
import { loadSim, mulberry } from './harness.mjs';

const sim = await loadSim(), fails = [];
const store = new Map();
globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const { TimeTrial, ttName, ttPlan, ttKey } = await import('../js/timetrial.js');
const G = await import('../js/ghost-share.js');
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const DT = 1 / 60, only = process.argv.slice(2).map(Number).filter(n => n >= 0);
const sizes = [];

for (let ti = 0; ti < sim.TRACKS.length; ti++) {
  if (only.length && !only.includes(ti)) continue;
  const def = sim.TRACKS[ti], plan = ttPlan(def), key = ttKey(ttName(def), false);
  sim.setRandom(mulberry(ti * 17 + 3));
  const race = new sim.Race(ti, { racers: [{ ch: sim.CHARACTERS[ti % sim.CHARACTERS.length], human: false, pIndex: 0 }], laps: plan.endless ? 2 : plan.laps, aiLevel: 2, calm: true });
  race.boxes = []; race.bits = []; race.countdown = 0.01;
  const tt = new TimeTrial(race, plan, null);
  check(tt.name === key, `${def.name}: a time trial's records go under ${tt.name}, not ${key}`);
  let frames = 0; while (!race.cars[0].finished && frames < 60 * 400) { race.update(DT); frames++; }
  const g = tt.ghost; check(g, `${def.name}: no ghost`); if (!g) continue;
  const meta = { track: def.name, rev: def.rev || 0, drift: false, clear: true, name: 'Pia', ch: g.ch, t: g.t, cp: g.cp };
  const p = await G.encodeGhostPayload(meta, g.s), link = G.ghostLink('https://leo7deng.github.io/kernel-kart/', p);
  const back = await G.decodeGhostPayload(G.ghostParam(link));
  check(back.meta.track === def.name && back.meta.clear === true && back.meta.name === 'Pia' && back.meta.ch === g.ch && Math.abs(back.meta.t - g.t) < 0.006, `${def.name}: meta ${JSON.stringify(back.meta)}`);
  check(back.meta.cp.length === g.cp.length && back.meta.cp.every((v, i) => Math.abs(v - g.cp[i]) < 0.006), `${def.name}: splits differ`);
  check(back.s.length === g.s.length, `${def.name}: ${back.s.length / 4} samples back, ${g.s.length / 4} sent`);
  // every other sample is kept (heading to 1/200 rad), the ones between rebuilt within a few units (allow a handful more)
  let worst = 0, off = 0, far = 0, n = g.s.length / 4;
  for (let i = 0; i < n; i++) {
    const k = i * 4, dh = Math.abs(Math.atan2(Math.sin((back.s[k + 2] - g.s[k + 2]) / 10000), Math.cos((back.s[k + 2] - g.s[k + 2]) / 10000))), dp = Math.hypot(back.s[k] - g.s[k], back.s[k + 1] - g.s[k + 1]);
    if (i % 2 === 0 || i === n - 1) { if (dp > 0 || back.s[k + 3] !== g.s[k + 3]) off++; worst = Math.max(worst, dh); }
    else if (dp > 6) far++;
  }
  check(!off && worst < 0.003 && far <= Math.max(5, n / 150), `${def.name}: ${off} kept samples moved, heading off by ${worst.toFixed(4)} rad, ${far} between samples further than 6`);
  // pasted into a sentence, or with the .kk end lost, it still opens
  for (const l of [link + '.', link + ' and', link.replace(/\.kk$/, '')]) {
    const b = await G.decodeGhostPayload(G.ghostParam(l)).catch(() => null);
    check(b && b.s.length === g.s.length, `${def.name}: link as pasted (${l.slice(-12)}) doesn't open`);
  }
  // the raw (uncompressed) form decodes too: a browser without CompressionStream sends those
  const raw = 'r' + G.b64url(G.packGhost(meta, g.s)), back2 = await G.decodeGhostPayload(raw);
  check(back2.s.length === g.s.length && back2.s[40] === g.s[40], `${def.name}: raw payload`);
  // a link from before time trials lost their obstacles has no clear flag (timetrial-ui.js openGhostLink turns it away)
  const oldStyle = await G.decodeGhostPayload('r' + G.b64url(G.packGhost({ ...meta, clear: undefined }, g.s)));
  check(oldStyle.meta.clear === false, `${def.name}: an old link reads as clear`);
  sizes.push([def.name, g.t, link.length, raw.length]);
  check(link.length < 35 * g.t + 300, `${def.name}: link ${link.length} chars for a ${g.t.toFixed(1)} s ghost`);
  // kept as a friend's ghost and raced
  const e = G.addRival(key, back.meta, back.s, { via: 'link' });
  check(e && G.loadRivals(key).sel === e.id, `${def.name}: friend's ghost not kept`);
  const rival = G.loadRival(key);
  check(rival && rival.name === 'Pia' && rival.s.length === g.s.length, `${def.name}: friend's ghost doesn't load back`);
  sim.setRandom(mulberry(ti * 17 + 4));
  const race2 = new sim.Race(ti, { racers: [{ ch: sim.CHARACTERS[(ti + 1) % sim.CHARACTERS.length], human: false, pIndex: 0 }], laps: plan.endless ? 1 : plan.laps, aiLevel: 2, calm: true });
  race2.boxes = []; race2.bits = []; race2.countdown = 0.01;
  const tt2 = new TimeTrial(race2, plan, null, rival);
  let seen = 0, gap = 0; frames = 0;
  while (!race2.cars[0].finished && frames < 60 * 400) { race2.update(DT); frames++; if (tt2.ghostPose(tt2.rival)) seen++; if (tt2.live) gap++; }
  check(seen > 100 && gap > 100, `${def.name}: rival ghost shown ${seen} frames, live gap ${gap}`);
}
// a second ghost from the same friend replaces theirs; the list is capped; deleting works
{
  const key = 'test', s = new Int16Array(400).fill(3);
  for (let i = 0; i < G.RIVAL_MAX + 3; i++) G.addRival(key, { name: 'F' + i, ch: 'gopher', t: 30 + i, cp: [] }, s);
  G.addRival(key, { name: 'f0', ch: 'tux', t: 20, cp: [] }, s);
  const o = G.loadRivals(key);
  check(o.list.length === G.RIVAL_MAX && o.list.filter(e => e.name.toLowerCase() === 'f0').length === 1 && o.list[0].t === 20, `friends' list: ${o.list.map(e => e.name + ' ' + e.t)}`);
  G.dropRival(key, o.list[0].id);
  check(G.loadRivals(key).list.length === G.RIVAL_MAX - 1 && G.loadRivals(key).sel === null, 'friends\' list: delete');
}
// the room's board (net-board.js): each player's best on the room's track, sent only on a change, none for a cup or
// Random, without players who left
{
  const B = await import('../js/net-board.js');
  const room = { cfg: { mode: 'single', track: 2, drift: true }, players: [{ id: 0, name: 'Host', slot: 0 }, { id: 3, name: 'Pia', slot: 1 }] };
  const key = B.roomKey(room.cfg), d = { k: 'ttBest', key, t: 31.42, ch: 'gopher', d: 'zAbc_-9' };
  check(key === ttKey(ttName(sim.TRACKS[2]), true), `board key ${key}`);
  check(B.boardRequest(room, room.players[1], d).ok, 'board: a best was not taken');
  check(!B.boardRequest(room, room.players[1], d).ok, 'board: the same best again counted as a change');
  check(!B.boardRequest(room, room.players[0], { ...d, key: 'Other' }).ok, 'board: a best for another track was taken');
  check(!B.boardRequest(room, room.players[0], { ...d, d: '<script>' }).ok && !B.boardRequest(room, room.players[0], { ...d, t: -1 }).ok, 'board: junk taken');
  check(B.boardRequest(room, room.players[0], { ...d, t: 30.1, d: '' }).ok, 'board: a best without its ghost was not taken');
  const m = B.boardMsg(room, key), back = B.boardFrom(JSON.parse(JSON.stringify(m)));
  check(back && back.rows.length === 2 && B.boardRows(room, back)[0].id === 0 && B.boardRows(room, back)[1].p.name === 'Pia', `board rows ${JSON.stringify(back)}`);
  room.players.pop();
  check(B.boardMsg(room, key).rows.length === 1, 'board: a player who left is still on it');
  check(B.roomKey({ ...room.cfg, mode: 'cup' }) === null && B.roomKey({ ...room.cfg, random: true }) === null, 'board: a cup or Random has a key');
}
// junk links fail cleanly
for (const bad of ['', 'x123', 'zAAAA', 'r' + G.b64url(new Uint8Array([1, 200, 1]))]) {
  let threw = false; try { await G.decodeGhostPayload(bad); } catch { threw = true; }
  check(threw, `junk payload ${JSON.stringify(bad)} decoded`);
}
for (const [n, t, l, r] of sizes) console.log(`${n.padEnd(20)} ${t.toFixed(2).padStart(6)} s  link ${String(l).padStart(5)} chars (${(l / t).toFixed(0)}/s), uncompressed ${r}`);
if (fails.length) { console.error(fails.map(f => 'FAIL ' + f).join('\n')); process.exit(1); }
console.log('ghost share ok');
