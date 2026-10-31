// node test/net.test.mjs: online play without a browser.
//  1 relay over real WebSockets (1b room picks, 1c chat); 2 race sync on every track; 3 own-kart prediction over a
//  laggy link (3b drift, 3c Moonshot rocket rides); 4 rocket start; 5 every item on every track; 6 slow link and 30 fps;
//  7 a lost snapshot; 8 lossy Wi-Fi (WebSocket and DataChannel); 9 the next race in the same room.
import http from 'node:http';
import WebSocket from 'ws';
import { createRelay, CODE_LETTERS, NET_PATH } from '../server/relay.mjs';
import { mulberry } from './harness.mjs';

let fails = 0;
const ok = (cond, what) => { if (!cond) { fails++; console.error('FAIL ' + what); } };

// ---------------------------------------------------------------- 1. relay
{
  const server = http.createServer(), relay = createRelay();
  relay.attach(server);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `ws://127.0.0.1:${server.address().port}${NET_PATH}`;
  // a connection that queues what it receives, so the test can wait for the next message of a type
  const open = () => new Promise((res, rej) => {
    const ws = new WebSocket(url), inbox = [], waiting = [];
    ws.on('message', raw => { const m = JSON.parse(String(raw)); const w = waiting.findIndex(x => x.t === m.t); if (w >= 0) waiting.splice(w, 1)[0].res(m); else inbox.push(m); });
    ws.next = t => { const i = inbox.findIndex(m => m.t === t); if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]); return new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('timed out waiting for ' + t)), 2000); waiting.push({ t, res: m => { clearTimeout(to); res(m); } }); }); };
    ws.put = m => ws.send(JSON.stringify(m));
    ws.on('open', () => res(ws)); ws.on('error', rej);
  });
  const host = await open(), a = await open(), b = await open();
  const hello = await host.next('hello'); ok(Array.isArray(hello.lan), 'hello lists the LAN addresses');
  host.put({ t: 'host' });
  const room = await host.next('room');
  ok(room.code.length === 4 && [...room.code].every(ch => CODE_LETTERS.includes(ch)), `room code ${room.code} is 4 unambiguous letters`);
  a.put({ t: 'join', code: 'ZZZZ' === room.code ? 'YYYY' : 'ZZZZ', name: 'Ann' });
  ok((await a.next('error')).msg, 'a wrong code is refused');
  a.put({ t: 'join', code: room.code.toLowerCase(), name: 'Ann' });
  const ja = await a.next('joined'); ok(ja.id === 1, 'first player gets id 1');
  const pa = await host.next('peer'); ok(pa.id === 1 && pa.name === 'Ann', 'host hears who joined');
  b.put({ t: 'join', code: room.code, name: 'Bob' });
  ok((await b.next('joined')).id === 2, 'second player gets id 2'); await host.next('peer');
  host.put({ t: 'send', d: { k: 'hi' } });
  ok((await a.next('msg')).d.k === 'hi' && (await b.next('msg')).d.k === 'hi', 'host broadcast reaches everyone');
  host.put({ t: 'send', to: 2, d: { k: 'just bob' } });
  ok((await b.next('msg')).d.k === 'just bob', 'host can send to one player');
  a.put({ t: 'send', to: 2, d: { k: 'in', g: 1 } });   // a player can only talk to the host, whatever `to` says
  const fromA = await host.next('msg'); ok(fromA.from === 1 && fromA.d.g === 1, 'player input reaches the host, marked with who sent it');
  a.close();
  ok((await host.next('left')).id === 1, 'host hears a player leave');
  host.close();
  ok((await b.next('closed')).t === 'closed', 'players hear the host leave');
  b.close(); relay.close(); server.close();
  console.log('relay ok');
}

// ---------------------------------------------------------------- 1c. chat (js/net-chat.js) over the real relay
// the host checks each line (rate, length, empty) and sends it to everyone; joiners get the history; never read as HTML
{
  const { CHAT_GAP, CHAT_KEEP, CHAT_MAX, CHAT_SLACK, chatLine, chatLineEl, chatRequest } = await import('../js/net-chat.js');
  const server = http.createServer(), relay = createRelay();
  relay.attach(server);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `ws://127.0.0.1:${server.address().port}${NET_PATH}`;
  // a connection that keeps what it gets; wait(pred) for the next one that matches
  const open = () => new Promise((res, rej) => {
    const ws = new WebSocket(url), inbox = [], waiting = [];
    ws.on('message', raw => { const m = JSON.parse(String(raw)); const w = waiting.findIndex(x => x.pred(m)); if (w >= 0) waiting.splice(w, 1)[0].res(m); else inbox.push(m); });
    ws.wait = (pred, ms = 2000) => { const i = inbox.findIndex(pred); if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]); return new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('timed out')), ms); waiting.push({ pred, res: m => { clearTimeout(to); res(m); } }); }); };
    ws.chats = () => inbox.filter(m => m.t === 'msg' && m.d.k === 'chat');
    ws.put = m => ws.send(JSON.stringify(m));
    ws.on('open', () => res(ws)); ws.on('error', rej);
  });
  const isChat = m => m.t === 'msg' && m.d && m.d.k === 'chat', isLog = m => m.t === 'msg' && m.d && m.d.k === 'chatLog';
  // the host's side, as net.js runs it: a player's line through chatRequest, then to everyone
  const host = await open(), room = { players: [{ id: 0, name: 'Hosty', slot: 0 }], chat: [] };
  host.on('message', raw => {
    const m = JSON.parse(String(raw));
    if (m.t === 'peer') { room.players.push({ id: m.id, name: m.name, slot: room.players.length }); host.put({ t: 'send', to: m.id, d: { k: 'chatLog', log: room.chat } }); }
    else if (m.t === 'msg' && m.d.k === 'chat') { const p = room.players.find(o => o.id === m.from), r = chatRequest(room, p, m.d.text, performance.now(), CHAT_SLACK); if (r.m) host.put({ t: 'send', d: { k: 'chat', m: r.m } }); }
  });
  host.put({ t: 'host' });
  const code = (await host.wait(m => m.t === 'room')).code;
  const hostSays = text => { const r = chatRequest(room, room.players[0], text, performance.now()); if (r.m) host.put({ t: 'send', d: { k: 'chat', m: r.m } }); return r; };
  ok(hostSays('welcome!').m, 'the host says something before anyone is in');
  const a = await open(); a.put({ t: 'join', code, name: 'Ann' });
  const logA = await a.wait(isLog);
  ok(logA.d.log.length === 1 && logA.d.log[0].text === 'welcome!' && logA.d.log[0].name === 'Hosty', 'a player who joins gets what was said before');
  const nasty = '<img src=x onerror=alert(1)> <b>hi</b> & https://example.com';
  a.put({ t: 'send', d: { k: 'chat', text: '   ' + nasty + '  \n' } });
  const echo = await a.wait(isChat);
  ok(echo.d.m.text === nasty && echo.d.m.name === 'Ann' && echo.d.m.id === 1 && echo.d.m.slot === 1, 'a player\'s line comes back from the host to everyone, trimmed, with who said it');
  const b = await open(); b.put({ t: 'join', code, name: 'Bob' });
  const logB = await b.wait(isLog);
  ok(logB.d.log.length === 2 && logB.d.log[1].text === nasty, 'the next one to join gets both lines');
  // shown as text: the stand-in document fails the test if anything sets innerHTML
  const doc = { createElement: tag => { const el = { tag, kids: [], style: {}, className: '', textContent: '', append(...k) { this.kids.push(...k); } }; Object.defineProperty(el, 'innerHTML', { set() { throw new Error('innerHTML set'); } }); return el; } };
  let shown = null; try { shown = chatLineEl(doc, chatLine(logB.d.log[1]), '#ff5d73', false); } catch { }
  ok(shown && shown.kids[0].textContent === 'Ann' && shown.kids[1].textContent === nasty && shown.kids[0].style.color === '#ff5d73', 'a line is drawn as plain text (no HTML, no links), the name in the player\'s colour');
  // too soon after your last line: dropped (the host allows CHAT_GAP less the link's slack)
  a.put({ t: 'send', d: { k: 'chat', text: 'spam' } });
  await new Promise(r => setTimeout(r, CHAT_GAP + 50));
  a.put({ t: 'send', d: { k: 'chat', text: 'x'.repeat(300) } });
  a.put({ t: 'send', d: { k: 'chat', text: '   ' } });
  b.put({ t: 'send', d: { k: 'chat', text: 'hi from bob' } });
  const seen = [];
  for (let i = 0; i < 2; i++) seen.push((await b.wait(isChat)).d.m);
  await new Promise(r => setTimeout(r, 150));
  seen.push(...b.chats().map(m => m.d.m));
  ok(!seen.some(m => m.text === 'spam'), 'a second line within ' + CHAT_GAP + ' ms is dropped by the host');
  const long = seen.find(m => m.name === 'Ann');
  ok(long && long.text.length === CHAT_MAX, `a long line is cut to ${CHAT_MAX} characters`);
  ok(seen.some(m => m.name === 'Bob' && m.text === 'hi from bob') && seen.length === 2, 'each player has their own wait, and an empty line goes nowhere');
  ok(hostSays('the host').m && !hostSays('again').m, 'the host keeps the same pace');
  // the room keeps the last CHAT_KEEP lines; and the rules' edges in Node
  const r2 = { chat: [] }, p = { id: 3, name: 'Zed', slot: 3 };
  for (let i = 0; i < CHAT_KEEP + 10; i++) chatRequest(r2, p, 'line ' + i, i * 1000);
  ok(r2.chat.length === CHAT_KEEP && r2.chat[0].text === 'line 10', `the room keeps the last ${CHAT_KEEP} lines`);
  ok(chatRequest(r2, p, 'a\u202eb\u0000c', 1e9).m.text === 'a b c', 'control and direction-override characters become spaces');
  ok(chatLine({ text: 5 }) === null && chatLine({ id: 1, name: '<x>', slot: 9, text: 'ok' }).slot === 0, 'a malformed line is dropped or made safe');
  ok(Array.from(chatRequest(r2, p, '😀'.repeat(200), 2e9).m.text).length === CHAT_MAX, 'an emoji is never cut in half');
  a.close(); b.close(); host.close(); relay.close(); server.close();
  console.log('chat ok');
}

// ---------------------------------------------------------------- 1b. picking together (js/net-room.js, run by the host)
{
  const { roomRequest, COOL, SLACK } = await import('../js/net-room.js');
  const host = { id: 0, pick: 0, slot: 0 }, pia = { id: 1, pick: 1, slot: 1 };
  const room = { players: [host, pia], cfg: { track: 0, mode: 'single', cupTracks: [], cupName: 'Custom Cup', trackBy: 0, cupBy: [] }, racing: false };
  let r = roomRequest(room, pia, { k: 'pickTrack', t: 3 }, 1000, SLACK);
  ok(r.ok && room.cfg.track === 3 && room.cfg.trackBy === 1, 'a player picks the track, and is named as who picked it');
  r = roomRequest(room, pia, { k: 'pickTrack', t: 4 }, 1500, SLACK);
  ok(!r.ok && r.wait > 0 && r.sec === 'maps' && room.cfg.track === 3, 'a second track pick within 2 s is dropped, with the wait');
  ok(roomRequest(room, pia, { k: 'pick', ci: 2 }, 1500, SLACK).ok && pia.pick === 2, 'the racer is its own section: still free');
  ok(roomRequest(room, pia, { k: 'pick', ci: 3 }, 2000, SLACK).wait > 0, 'and its own 2 s too');
  ok(roomRequest(room, pia, { k: 'pick', ci: 0 }, 9000, SLACK).ok && pia.pick === 0 && host.pick === 0, 'a racer someone has can be picked too (players may share one)');
  ok(roomRequest(room, pia, { k: 'pick', ci: 2 }, 9000 + COOL, SLACK).ok && pia.pick === 2, 'and left again');
  ok(roomRequest(room, host, { k: 'pickTrack', t: 5 }, 1600).ok && room.cfg.trackBy === 0, 'the host isn\'t held up by the player\'s wait');
  ok(roomRequest(room, host, { k: 'pickTrack', t: 8 }, 1601).ok && roomRequest(room, host, { k: 'pickTrack', t: 5 }, 1602).ok && room.cfg.track === 5, 'the host has no wait at all: track picks back to back go through');
  ok([2, 3, 4, 0].every((ci, i) => roomRequest(room, host, { k: 'pick', ci }, 1700 + i).ok) && host.pick === 0 && !host.cool, 'nor racer picks (and no wait is started for it)');
  r = roomRequest(room, pia, { k: 'pickTrack', t: 6 }, 1000 + COOL - SLACK, SLACK);
  ok(r.ok && room.cfg.track === 6, 'after the wait (less the link\'s slack) the next pick goes through');
  ok(roomRequest(room, pia, { k: 'pickTrack', t: -1 }, 50000, SLACK).ok && room.cfg.random && room.cfg.trackBy === 1, 'a player picks Random');
  ok(!roomRequest(room, host, { k: 'pickTrack', t: -1 }, 50000).ok, 'Random again changes nothing');
  ok(roomRequest(room, host, { k: 'pickTrack', t: 6 }, 51000).ok && !room.cfg.random && room.cfg.track === 6, 'picking the track Random had last time is a real pick (Random off)');
  ok(!roomRequest(room, pia, { k: 'pickTrack', t: -2 }, 60000, SLACK).ok, 'no other negative track');
  ok(!roomRequest(room, pia, { k: 'cupEdit', op: 'add', t: 1 }, 99000, SLACK).ok, 'no cup edits in a single race');
  room.cfg.mode = 'cup';
  ok(!roomRequest(room, pia, { k: 'pickTrack', t: 2 }, 99000, SLACK).ok, 'no single track pick in a cup');
  let now = 100000;
  for (const t of [4, 2, 4]) { roomRequest(room, pia, { k: 'cupEdit', op: 'add', t }, now, SLACK); now += COOL; }
  ok(room.cfg.cupTracks.join() === '4,2' && room.cfg.cupBy.join() === '1,1', 'a player adds cup tracks (not one twice), each marked as theirs');
  ok(roomRequest(room, host, { k: 'cupEdit', op: 'add', t: 7 }, now).ok && room.cfg.cupBy.join() === '1,1,0', 'the host adds one too');
  ok(roomRequest(room, pia, { k: 'cupEdit', op: 'drop', t: 4 }, now, SLACK).ok && room.cfg.cupTracks.join() === '2,7' && room.cfg.cupBy.join() === '1,0', 'dropping a track by its index keeps who-picked-what in line');
  ok(roomRequest(room, pia, { k: 'cupEdit', op: 'preset', tracks: [0, 1, 2], name: 'Coast Cup' }, now + COOL, SLACK).ok && room.cfg.cupName === 'Coast Cup' && room.cfg.cupBy.join() === '1,1,1', 'a player picks a ready-made cup');
  ok(!roomRequest(room, host, { k: 'cupEdit', op: 'preset', tracks: [0, 0, 1], name: 'X' }, now + 9e3).ok, 'a cup with a track twice is refused');
  room.racing = true;
  ok(!roomRequest(room, host, { k: 'cupEdit', op: 'clear' }, now + 9e4).ok, 'nothing changes while a race is on');
  const joiner = { id: 2, pick: 5, slot: 2 }; room.players.push(joiner); room.racing = false;
  ok(roomRequest(room, joiner, { k: 'pick', ci: 6, first: true }, 0, SLACK).ok && roomRequest(room, joiner, { k: 'pick', ci: 7 }, 10, SLACK).ok, 'the racer you bring as you join doesn\'t start the wait');
  ok(roomRequest(room, joiner, { k: 'pick', ci: 4, first: true }, 20, SLACK).wait > 0, '...only once');
  ok(roomRequest(room, joiner, { k: 'pick', ci: 4 }, 30, SLACK).wait > 0 && joiner.pick === 7, 'players still wait their 2 s');
  // a player's own copy of the room (net.js playerAsk): the change at once, no wait checked, nothing if it changes nothing
  const { applyRequest } = await import('../js/net-room.js');
  const copy = { players: [{ ...joiner }], cfg: { ...room.cfg }, racing: false };
  ok(applyRequest(copy, copy.players[0], { k: 'pick', ci: 9 }) && copy.players[0].pick === 9 && joiner.pick === 7, 'a player\'s pick applies to their own copy of the room at once');
  ok(!applyRequest(copy, copy.players[0], { k: 'pick', ci: 9 }) && !applyRequest({ ...copy, racing: true }, copy.players[0], { k: 'pick', ci: 1 }), '...and not again, nor during a race');
  // names (a room link joins with a made-up one; ✎ in the room changes it): plain text, at most 12 characters, its own wait
  joiner.name = 'Hot Fix';
  ok(roomRequest(room, joiner, { k: 'name', name: '  Pia\u0007 the Great Racer ' }, 9e5, SLACK).ok && joiner.name === 'Pia the Grea', 'a player changes their name (cleaned, cut to 12)');
  ok(roomRequest(room, joiner, { k: 'name', name: 'Pia 2' }, 9e5 + 10, SLACK).wait > 0 && roomRequest(room, joiner, { k: 'pick', ci: 3 }, 9e5 + 10, SLACK).ok, 'names have their own 2 s wait');
  ok(!roomRequest(room, joiner, { k: 'name', name: '   ' }, 9e6, SLACK).ok && !roomRequest(room, joiner, { k: 'name', name: 5 }, 9e6 + COOL, SLACK).ok && joiner.name === 'Pia the Grea', 'an empty or odd name is refused');
  console.log('room picks ok');
}

// ---------------------------------------------------------------- 2. sync
{
  const { Race } = await import('../js/race.js');
  const { TRACKS } = await import('../js/tracks.js');
  const { CHARACTERS } = await import('../js/core.js');
  const { Input } = await import('../js/input.js');
  const { hostSync, clientSync } = await import('../js/net-sync.js');
  const DT = 1 / 60;
  let bytes = 0, snaps = 0, maxBytes = 0;
  for (let track = 0; track < TRACKS.length; track++) {
    Math.random = mulberry(track + 1);
    const racers = [{ ch: CHARACTERS[0], human: true, pIndex: 0 }, { ch: CHARACTERS[3], human: true, pIndex: 1 }, { ch: CHARACTERS[5], human: false, pIndex: -1 }, { ch: CHARACTERS[6], human: false, pIndex: -1 }];
    const host = new Race(track, { racers, laps: 2, aiLevel: 1 }); host.countdown = 0.5; host.packMode = false;
    const copy = new Race(track, { racers, laps: 2, aiLevel: 1 });
    let clock = 0, last = null, sentP = 0;
    const view = clientSync(copy, { me: 1, now: () => clock });
    const H = hostSync(host, { local: [host.cars[0]], now: () => clock, send: s => { const txt = JSON.stringify(s); bytes += txt.length; snaps++; maxBytes = Math.max(maxBytes, txt.length); last = s; sentP += s.pa.length; view.receive(JSON.parse(txt)); } });
    ok(copy.localHumans[0] === copy.cars[1], `${TRACKS[track].name}: the player's own kart is theirs`);
    let fired = 0;
    for (let f = 0; f < 60 * 40; f++) {
      clock += DT;
      Input.pressed[0] = (f % 180) < 150;          // the host's player: mostly flat out, lifting now and then
      Input.fire[0] = f % 97 === 0;
      if (f % 2 === 0) H.setInput(1, { g: (f % 240) < 200, f: fired += f % 131 === 0 ? 1 : 0, q: last ? last.q : 0 });   // the remote player, 30 times a second
      if (f === 60 * 25 && track % 2) H.toBot(1);   // on half the tracks the remote player leaves mid-race
      host.update(DT); copy.update(DT);
    }
    // after a snapshot arrives (no easing yet) the copy is where the host was when it was sent
    view.receive(JSON.parse(JSON.stringify(H.snapshot())));
    for (let i = 0; i < host.cars.length; i++) {
      const h = host.cars[i], c = copy.cars[i];
      ok(Math.abs(h.x - c.x) < 0.01 && Math.abs(h.y - c.y) < 0.01 && Math.abs(h.speed - c.speed) < 0.01 && h.lap === c.lap && h.rank === c.rank && h.item === c.item, `${TRACKS[track].name}: car ${i} matches the host`);
      ok(c.T === copy.routes[host.routes.indexOf(h.T)], `${TRACKS[track].name}: car ${i} is on the same route`);
    }
    ok(copy.projectiles.length === host.projectiles.length && copy.mines.length === host.mines.length, `${TRACKS[track].name}: projectiles and mines come across`);
    ok(Math.abs(copy.time - host.time) < 0.01 && copy.started === host.started, `${TRACKS[track].name}: race clock matches`);
    if (host.storms) ok(host.storms.length && JSON.stringify(copy.storms) === JSON.stringify(host.storms), `${TRACKS[track].name}: the hurricanes are where the host has them`);
    ok(sentP > 100, `${TRACKS[track].name}: particles come across`);
    ok(copy.cars[1].human === !(track % 2), `${TRACKS[track].name}: a player who leaves becomes a bot`);
    ok(host.cars[0].progress > 0 && host.cars[1].progress > 0, `${TRACKS[track].name}: both players drove`);
    ok(last && !JSON.stringify(last).includes('null,null,null,null,null,null,null,null'), `${TRACKS[track].name}: no runaway arrays`);
  }
  // 2b. two players on the same racer: each drives their own kart (by slot, not by racer), the host's copy matches, and
  // the seat keys (ui.js rk: what a cup scores by) stay on each screen
  {
    Math.random = mulberry(77);
    const racers = [{ ch: CHARACTERS[2], human: true, pIndex: 0, key: 'p0' }, { ch: CHARACTERS[2], human: true, pIndex: 1, key: 'p1' }, { ch: CHARACTERS[5], human: false, pIndex: -1, key: 'b0' }];
    const host = new Race(1, { racers, laps: 2, aiLevel: 1 }), copy = new Race(1, { racers, laps: 2, aiLevel: 1 }); host.countdown = 0.5;
    for (const R of [host, copy]) R.cars.forEach((c, i) => { c.key = racers[i].key; });
    let clock = 0, last = null;
    const view = clientSync(copy, { me: 1, now: () => clock });
    const H = hostSync(host, { local: [host.cars[0]], now: () => clock, send: sn => { last = JSON.stringify(sn); view.receive(JSON.parse(last)); } });
    ok(copy.localHumans.length === 1 && copy.localHumans[0] === copy.cars[1], 'same racer: the player\'s own kart is their slot\'s');
    for (let f = 0; f < 60 * 20; f++) { clock += DT; Input.pressed[0] = f % 200 < 120; H.setInput(1, { g: true, f: 0, q: 0 }); host.update(DT); copy.update(DT); }
    view.receive(JSON.parse(JSON.stringify(H.snapshot())));
    ok(host.cars[1].progress > host.cars[0].progress + 50, 'same racer: each player\'s input drives their own kart (the one flat out is ahead)');
    for (let i = 0; i < host.cars.length; i++) ok(Math.abs(host.cars[i].x - copy.cars[i].x) < 0.01 && copy.cars[i].key === racers[i].key, `same racer: car ${i} matches the host and keeps its seat`);
    ok(last && !last.includes('"key"'), 'same racer: the seat keys are not in the snapshots');
  }
  console.log(`sync ok: ${snaps} snapshots, ${(bytes / snaps / 1024).toFixed(1)} KB on average (largest ${(maxBytes / 1024).toFixed(1)} KB), ${(bytes / snaps * 20 / 1024).toFixed(0)} KB/s per player`);
}

// ---------------------------------------------------------------- 3. the player's own kart over a laggy link
// Every message takes `ow` s each way plus up to `jit` (in order); the player's screen runs its own ~60 Hz frames.
//   delay: frames from a gas press to the drawn kart speeding up (without prediction: to the host's race using it)
//   error: prediction vs the host's kart when its snapshot was taken
//   jumps: frames where the drawn kart moves more than 8 units off its own physics (a correction)
{
  const { Race } = await import('../js/race.js');
  const { TRACKS } = await import('../js/tracks.js');
  const { CHARACTERS } = await import('../js/core.js');
  const { Input } = await import('../js/input.js');
  const { hostSync, clientSync } = await import('../js/net-sync.js');
  const pct = (a, q) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(q * b.length))] : NaN; };
  const mean = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const hard = c => ['spinT', 'squished', 'pinned', 'stall', 'frozen', 'bubbled', 'moonT', 'lavaT', 'pull', 'dragged'].some(k => c[k] > 0) || c.finished || !c.human;
  for (const [ow, jit] of [[0.04, 0.015], [0.12, 0.04]]) {
    const delayP = [], delayB = [], errs = [], R = { jumps: 0, frames: 0, snaps: 0, stunSnaps: 0, emptied: 0, fired: 0, resimSteps: 0, resims: 0 };
    for (let track = 0; track < TRACKS.length; track++) {
      Math.random = mulberry(100 + track);
      const rr = mulberry(7 + track);
      const racers = [{ ch: CHARACTERS[0], human: true, pIndex: 0 }, { ch: CHARACTERS[3], human: true, pIndex: 1 }, { ch: CHARACTERS[5], human: false, pIndex: -1 }, { ch: CHARACTERS[6], human: false, pIndex: -1 }];
      const host = new Race(track, { racers, laps: 2, aiLevel: 1 }); host.countdown = 0.5; host.packMode = false;
      const copy = new Race(track, { racers, laps: 2, aiLevel: 1 }), plain = new Race(track, { racers, laps: 2, aiLevel: 1 });
      let gOn = true, flipAt = 1.2, wantFire = false, ct = 0;
      const view = clientSync(copy, { me: 1, gas: () => gOn, fire: () => { const f = wantFire; wantFire = false; return f; }, now: () => t });
      const base = clientSync(plain, { me: 1, predict: false, now: () => t });
      const toHost = [], toPlayer = []; let t = 0, lastH = 0, lastP = 0;
      const H = hostSync(host, { local: [host.cars[0]], now: () => t, send: s => { lastP = Math.max(lastP, t + ow + rr() * jit); toPlayer.push({ at: lastP, txt: JSON.stringify(s) }); } });
      let hostNext = 0, playerNext = 0, playerLast = 0, hf = 0, sent = '', sentAt = -1;
      let press = null, pf = 0;   // a press being timed on the predicted screen: { f: frames since, minP }
      const waits = [];          // presses waiting to show on the plain screen: { n, f0, h: host time it took effect }
      const prevP = { x: 0, y: 0 }, prevB = { x: 0, y: 0 }, vP = [0], vB = [0];
      while (t < 32) {
        t = Math.min(hostNext, playerNext, toHost.length ? toHost[0].at : 1e9, toPlayer.length ? toPlayer[0].at : 1e9);
        while (toHost.length && toHost[0].at <= t) H.setInput(1, toHost.shift().m);
        while (toPlayer.length && toPlayer[0].at <= t) {
          const txt = toPlayer.shift().txt, snap = JSON.parse(txt), a = snap.ack[1];
          view.receive(snap); base.receive(JSON.parse(txt));
          if (a) for (const w of waits) if (w.h === null && a[0] === w.n) w.h = snap.race.time - a[1];
        }
        if (hostNext <= t) { Input.pressed[0] = (hf % 180) < 150; Input.fire[0] = hf % 97 === 0; host.update(1 / 60); hf++; hostNext += 1 / 60; }
        if (playerNext <= t) {
          const dt = t - playerLast; playerLast = t; playerNext += (1 / 60) * (0.9 + 0.2 * rr()); ct += dt;
          if (dt <= 0) continue;
          pf++;
          let pressed = false;
          if (ct >= flipAt) { gOn = !gOn; pressed = gOn; flipAt = ct + (gOn ? 1 + rr() * 2.5 : 0.35 + rr() * 0.6); }
          const me = copy.cars[1], had = me.item && !me.item2 && me.charges <= 1 && copy.started;
          if (rr() < dt / 6) wantFire = true;
          const firing = wantFire;
          copy.update(dt); plain.update(dt);
          if (firing && had && !hard(me)) { R.fired++; if (!me.item) R.emptied++; }
          const m = view.input(), key = m.g + ':' + m.f + ':' + m.n;
          if (key !== sent || t - sentAt > 0.1) { lastH = Math.max(lastH, t + ow + rr() * jit); toHost.push({ at: lastH, m: { ...m } }); sent = key; sentAt = t; }
          // the drawn karts: how fast they move on screen, and how far off their own motion
          const b = plain.cars[1], dP = Math.hypot(me.x - prevP.x, me.y - prevP.y), dB = Math.hypot(b.x - prevB.x, b.y - prevB.y);
          const latest = view.latest, hostMe = host.cars[1];
          if (copy.started && latest && !hard(hostMe) && !hard(me) && dP < 300) { R.frames++; if (view.stats.jump > 8) R.jumps++; }
          vP.push(dP / dt); vB.push(dB / dt);
          prevP.x = me.x; prevP.y = me.y; prevB.x = b.x; prevB.y = b.y;
          if (pressed && copy.started && !hard(hostMe) && !(me.air > 0)) { press = { f: 0, minP: vP[vP.length - 2] }; waits.push({ n: m.n, f0: pf, h: null }); }
          if (press) {
            press.f++;
            const v1 = vP[vP.length - 1];
            if (v1 > press.minP + 2) { delayP.push(press.f); press = null; } else { press.minP = Math.min(press.minP, v1); if (press.f > 60 || !gOn || hard(hostMe)) press = null; }
          }
          for (let i = waits.length - 1; i >= 0; i--) { const w = waits[i]; if (w.h !== null && plain.time >= w.h) { delayB.push(pf - w.f0 + 1); waits.splice(i, 1); } else if (pf - w.f0 > 120) waits.splice(i, 1); }
        }
      }
      ok(!view.stats.broke, `${TRACKS[track].name}: prediction ran without an error` + (view.stats.broke ? ': ' + view.stats.broke.stack : ''));
      errs.push(...view.stats.err); R.snaps += view.stats.snaps; R.stunSnaps += view.stats.stunSnaps; R.resims += view.stats.resims; R.resimSteps += view.stats.steps;
    }
    const ms = f => (f * 1000 / 60).toFixed(0);
    console.log(`prediction at ${ow * 1000} ms each way (+${jit * 1000} jitter): own kart responds in ${pct(delayP, 0.5)} frame(s) median, ${(100 * delayP.filter(f => f <= 2).length / delayP.length).toFixed(0)}% within 2 (${delayP.length} presses; without prediction ${pct(delayB, 0.5)} frames = ${ms(pct(delayB, 0.5))} ms median, ${ms(pct(delayB, 0.95))} ms p95);` +
      ` error vs host ${mean(errs).toFixed(1)} mean, ${pct(errs, 0.95).toFixed(1)} p95, ${pct(errs, 0.99).toFixed(1)} p99 units (${errs.length} snapshots);` +
      ` jumps > 8 units in ${R.jumps} of ${R.frames} driving frames; ${R.snaps} snaps (${R.stunSnaps} from hits/jumps); item slot emptied at once ${R.emptied}/${R.fired}; ${(R.resimSteps / R.resims).toFixed(1)} steps per snapshot`);
    // (80%: the share swings a few points with the race itself)
    ok(pct(delayP, 0.5) <= 1 && delayP.filter(f => f <= 2).length >= delayP.length * 0.8, `prediction: own kart responds within a frame or two at ${ow * 1000} ms`);
    ok(pct(delayB, 0.5) > pct(delayP, 0.5), 'prediction: faster than without it');
    ok(R.emptied === R.fired, 'prediction: the item slot empties as soon as you fire');
    ok(pct(errs, 0.95) < 10, `prediction: within 10 units of the host 95% of the time at ${ow * 1000} ms`);
    ok(R.jumps < R.frames * 0.005, `prediction: next to no visible corrections in ordinary driving at ${ow * 1000} ms`);
  }
}
// ---------------------------------------------------------------- 3c. Moonshot's Launch Row online (race-rocket.js)
// A remote player (bot throttle) rides a rocket to the Moon and back over a 60 ms link: the host books the bays, the
// player's screen shows the ride where the host has it, then predicts its kart again.
{
  const { Race } = await import('../js/race.js');
  const { TRACKS } = await import('../js/tracks.js');
  const { CHARACTERS } = await import('../js/core.js');
  const { Input } = await import('../js/input.js');
  const { hostSync, clientSync } = await import('../js/net-sync.js');
  const track = TRACKS.findIndex(d => d.name === 'Moonshot'), ow = 0.06;
  Math.random = mulberry(31);
  const rr = mulberry(32);
  const racers = [{ ch: CHARACTERS[0], human: true, pIndex: 0 }, { ch: CHARACTERS[3], human: true, pIndex: 1 }, { ch: CHARACTERS[5], human: false, pIndex: -1 }, { ch: CHARACTERS[6], human: false, pIndex: -1 }];
  const host = new Race(track, { racers, laps: 1, aiLevel: 1 }); host.countdown = 0.5;
  const copy = new Race(track, { racers, laps: 1, aiLevel: 1 });
  let g = true;
  const view = clientSync(copy, { me: 1, gas: () => g, now: () => t });
  const toHost = [], toPlayer = []; let t = 0, lastH = 0, lastP = 0;
  const H = hostSync(host, { local: [host.cars[0]], now: () => t, send: s => { lastP = Math.max(lastP, t + ow + rr() * 0.02); toPlayer.push({ at: lastP, txt: JSON.stringify(s) }); } });
  let hostNext = 0, playerNext = 0, playerLast = 0, sawRide = 0, rideErr = [], after = [], out = null, sawCap = 0, capErr = [], out2 = null; let nErr = null, nErr1 = null, nErr2 = null; const trail = [];   // (trail: the host's kart over the last 0.6 s)
  const z = host.track.mech.rocket;
  while (t < 230 && !(out2 !== null && t > out2 + 4)) {
    t = Math.min(hostNext, playerNext, toHost.length ? toHost[0].at : 1e9, toPlayer.length ? toPlayer[0].at : 1e9);
    while (toHost.length && toHost[0].at <= t) H.setInput(1, toHost.shift().m);
    while (toPlayer.length && toPlayer[0].at <= t) view.receive(JSON.parse(toPlayer.shift().txt));
    if (hostNext <= t) { Input.pressed[0] = host.started ? host.aiThrottle(host.cars[0], 1 / 60, -1) : true; host.update(1 / 60); hostNext += 1 / 60; const hc = host.cars[1]; trail.push([t, hc.x, hc.y]); while (trail[0][0] < t - 0.6) trail.shift(); if (out === null && hc.dockT > 0 && !(hc.flyT > 0)) out = t; if (out2 === null && hc.cdockT > 0 && !(hc.flyT > 0)) out2 = t; }
    if (playerNext <= t) {
      const dt = t - playerLast; playerLast = t; playerNext += 1 / 60; if (dt <= 0) continue;
      const me = copy.cars[1];
      g = copy.started ? copy.aiThrottle(me, dt, -1) : true;
      copy.update(dt);
      const hc = host.cars[1];
      if (me.flyT > 0 && me.flyK === 0) { sawRide++; rideErr.push(Math.min(...trail.map(([, x, y]) => Math.hypot(me.x - x, me.y - y)))); }
      if (me.flyT > 0 && me.flyK === 1) { sawCap++; capErr.push(Math.min(...trail.map(([, x, y]) => Math.hypot(me.x - x, me.y - y)))); }
      if (out !== null && t > out + 1 && nErr === null) nErr = view.stats.err.length;
      if (hc.cdockT > 0 && nErr1 === null) nErr1 = view.stats.err.length;
      if (out2 !== null && t > out2 + 1 && nErr2 === null) nErr2 = view.stats.err.length;
      const m = view.input(); toHost.push({ at: (lastH = Math.max(lastH, t + ow + rr() * 0.02)), m: { ...m } });
    }
  }
  const hc = host.cars[1], mean = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length); after = nErr === null ? [] : view.stats.err.slice(nErr, nErr1 === null ? undefined : nErr1); const after2 = nErr2 === null ? [] : view.stats.err.slice(nErr2);
  ok(!view.stats.broke, 'Launch Row online: the prediction ran without an error' + (view.stats.broke ? ': ' + view.stats.broke.stack : ''));
  ok(hc.bay >= 0 && hc.dockT > 0, `Launch Row online: the host took the remote player aboard (bay ${hc.bay})`);
  ok(copy.cars[1].bay === hc.bay, 'Launch Row online: the player\'s screen has the same bay');
  ok(sawRide > 300, `Launch Row online: the player's screen shows the ride (${sawRide} frames)`);
  ok(out !== null && (hc.s > z.sGate || hc.finished), 'Launch Row online: the remote player rolled out onto the Moon');   // (or finished: a finished kart's s starts again)
  ok(mean(rideErr) < 25, `Launch Row online: the ride drawn on the host's path (${mean(rideErr).toFixed(1)} units off on average)`);
  ok(after.length && mean(after) < 3, `Launch Row online: predicting its kart again on the Moon (${mean(after).toFixed(1)} units off on average)`);
  ok(hc.cbay >= 0 && hc.cdockT > 0 && copy.cars[1].cbay === hc.cbay, `Return Row online: the host took the remote player aboard a capsule (bay ${hc.cbay}), the same on the player's screen`);
  ok(sawCap > 300, `Return Row online: the player's screen shows the capsule ride (${sawCap} frames)`);
  ok(out2 !== null && (hc.s >= z.sOut || hc.finished), 'Return Row online: the remote player drove up the slipway');
  ok(mean(capErr) < 25, `Return Row online: the capsule drawn on the host's path (${mean(capErr).toFixed(1)} units off on average)`);
  ok(after2.length && mean(after2) < 3, `Return Row online: predicting its kart again on the beach road (${mean(after2).toFixed(1)} units off on average)`);
  console.log(`Return Row online: capsule bay ${hc.cbay}, aboard at ${hc.cdockT.toFixed(1)} s, ride shown ${sawCap} frames ${mean(capErr).toFixed(1)} units off the host's path, then predicting its kart ${mean(after2).toFixed(1)} units off`);
  console.log(`Launch Row online: bay ${hc.bay}, aboard at ${hc.dockT.toFixed(1)} s, ride shown ${sawRide} frames ${mean(rideErr).toFixed(1)} units off the host's path on average, then predicting its kart again on the Moon ${mean(after).toFixed(1)} units off the host on average`);
}
// ---------------------------------------------------------------- 3b. the drift button online (race-drift.js)
// The remote player drifts every slow corner (input's second bit): the host's kart drifts and fires mini-turbos, and
// the prediction stays with it.
{
  const { Race } = await import('../js/race.js');
  const { TRACKS } = await import('../js/tracks.js');
  const { CHARACTERS } = await import('../js/core.js');
  const { Input } = await import('../js/input.js');
  const { hostSync, clientSync } = await import('../js/net-sync.js');
  const { vmaxAt } = await import('../js/geometry.js');
  const pct = (a, q) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(q * b.length))] : NaN; };
  const errs = []; let hostDrifts = 0, hostTurbos = 0, myDrifts = 0, broke = null;
  for (const track of [1, 3, 4]) {
    Math.random = mulberry(300 + track);
    const rr = mulberry(9 + track), ow = 0.04, jit = 0.015;
    const racers = [{ ch: CHARACTERS[0], human: true, pIndex: 0 }, { ch: CHARACTERS[3], human: true, pIndex: 1 }, { ch: CHARACTERS[5], human: false, pIndex: -1 }];
    const host = new Race(track, { racers, laps: 2, aiLevel: 1, drift: true }); host.countdown = 0.5;
    const copy = new Race(track, { racers, laps: 2, aiLevel: 1, drift: true });
    let drift = false, t = 0, lastH = 0, lastP = 0, hostNext = 0, playerNext = 0, playerLast = 0, sent = '', sentAt = -1, wasOn = false, wasMt = false, myOn = false;
    const view = clientSync(copy, { me: 1, gas: () => 1 | (drift ? 2 : 0), now: () => t });
    const toHost = [], toPlayer = [];
    const H = hostSync(host, { local: [host.cars[0]], now: () => t, send: s => { lastP = Math.max(lastP, t + ow + rr() * jit); toPlayer.push({ at: lastP, txt: JSON.stringify(s) }); } });
    while (t < 30) {
      t = Math.min(hostNext, playerNext, toHost.length ? toHost[0].at : 1e9, toPlayer.length ? toPlayer[0].at : 1e9);
      while (toHost.length && toHost[0].at <= t) H.setInput(1, toHost.shift().m);
      while (toPlayer.length && toPlayer[0].at <= t) view.receive(JSON.parse(toPlayer.shift().txt));
      if (hostNext <= t) {
        Input.pressed[0] = true; host.update(1 / 60); hostNext += 1 / 60;
        const hc = host.cars[1]; if (hc.dOn && !wasOn) hostDrifts++; wasOn = hc.dOn; if (hc.mtT > 0 && !wasMt) hostTurbos++; wasMt = hc.mtT > 0;
      }
      if (playerNext <= t) {
        const dt = t - playerLast; playerLast = t; playerNext += (1 / 60) * (0.9 + 0.2 * rr());
        if (dt <= 0) continue;
        const me = copy.cars[1]; let slow = false;
        for (let d = 0; d <= 160; d += 10) if (vmaxAt(me.T, me.s + d, me.grip) < me.top * 0.6) slow = true;
        drift = slow && me.speed > 120 || (drift && me.dOn && me.dT < 1.6 && slow);
        copy.update(dt); if (me.dOn && !myOn) myDrifts++; myOn = !!me.dOn;
        const m = view.input(), key = m.g + ':' + m.f + ':' + m.n;
        if (key !== sent || t - sentAt > 0.1) { lastH = Math.max(lastH, t + ow + rr() * jit); toHost.push({ at: lastH, m: { ...m } }); sent = key; sentAt = t; }
      }
    }
    if (view.stats.broke) broke = view.stats.broke;
    errs.push(...view.stats.err);
  }
  Input.reset();
  console.log(`drift online: the host's kart drifted ${hostDrifts} times (the player's screen ${myDrifts}) and fired ${hostTurbos} mini-turbos; prediction error ${pct(errs, 0.5).toFixed(1)} median, ${pct(errs, 0.95).toFixed(1)} p95 units (${errs.length} snapshots)`);
  ok(!broke, 'drift online: prediction ran without an error' + (broke ? ': ' + broke.stack : ''));
  ok(hostDrifts > 5 && hostTurbos >= 1 && myDrifts >= hostDrifts * 0.7, 'drift online: the drift input reaches the host (the player\'s screen counts a few more: a reconcile can restart one)');
  ok(pct(errs, 0.95) < 12, 'drift online: the prediction stays within 12 units of the host 95% of the time');
}
// ---------------------------------------------------------------- 4. the rocket start over a laggy link
// The player holds the gas at a moment of its own screen's countdown (s before GO); the host must judge it as offline
// (race-start.js): rocket in the last 0.35 s, wheelspin from over a second out.
{
  const { Race } = await import('../js/race.js');
  const { CHARACTERS } = await import('../js/core.js');
  const { Input } = await import('../js/input.js');
  const { hostSync, clientSync } = await import('../js/net-sync.js');
  const ow = 0.12, got = [];
  for (const [X, want] of [[1.2, 'spin'], [0.6, 'spin'], [0.25, 'rocket'], [0.03, 'rocket'], [-0.04, 'rocket'], [-0.25, 'plain']]) {
    Math.random = mulberry(3); const rr = mulberry(5);
    const racers = [{ ch: CHARACTERS[0], human: true, pIndex: 0 }, { ch: CHARACTERS[3], human: true, pIndex: 1 }];
    const host = new Race(0, { racers, laps: 1, aiLevel: 1 }), copy = new Race(0, { racers, laps: 1, aiLevel: 1 });
    let g = false, t = 0, lastH = 0, lastP = 0, hostNext = 0, playerNext = 0, playerLast = 0, goSeen = null, out = null;
    const view = clientSync(copy, { me: 1, gas: () => g, now: () => t }), toHost = [], toPlayer = [];
    const H = hostSync(host, { local: [host.cars[0]], now: () => t, send: s => { lastP = Math.max(lastP, t + ow + rr() * 0.04); toPlayer.push({ at: lastP, txt: JSON.stringify(s) }); } });
    while (t < 5 && !out) {
      t = Math.min(hostNext, playerNext, toHost.length ? toHost[0].at : 1e9, toPlayer.length ? toPlayer[0].at : 1e9);
      while (toHost.length && toHost[0].at <= t) H.setInput(1, toHost.shift().m);
      while (toPlayer.length && toPlayer[0].at <= t) view.receive(JSON.parse(toPlayer.shift().txt));
      if (hostNext <= t) { Input.pressed[0] = false; host.update(1 / 60); hostNext += 1 / 60; const c = host.cars[1]; if (host.started && host.time - host.goT > 0.15) out = c.wheelspin > 0 ? 'spin' : c.boost > 0 ? 'rocket' : 'plain'; }
      if (playerNext <= t) {
        const dt = t - playerLast; playerLast = t; playerNext += 1 / 60; if (dt <= 0) continue;
        copy.update(dt);   // (then the screen shows this frame: the player reacts to it)
        if (goSeen === null && copy.started) goSeen = t;
        if (!g && (X > 0 ? !copy.started && copy.countdown <= X : goSeen !== null && t - goSeen >= -X)) g = true;
        toHost.push({ at: (lastH = Math.max(lastH, t + ow + rr() * 0.04)), m: { ...view.input() } });
      }
    }
    got.push(`${X}:${out}`);
    ok(out === want, `rocket start at ${ow * 1000} ms: holding from ${X > 0 ? X + ' s before' : -X + ' s after'} GO on the player's screen gives ${want} (got ${out})`);
  }
  console.log('rocket start online: ' + got.join(' '));
}
// ---------------------------------------------------------------- 5. every item on every track, over a laggy link
// Both players fire every item in turn on every track, 60 ms each way. On the player's screen: nothing throws, no field a
// snapshot can't carry (Map, Set...), no race state changed between snapshots but what it eases (prediction must not
// write into it), and what it draws is where the host had it. Snapshot sizes are kept in bounds.
{
  const { Race } = await import('../js/race.js');
  const { TRACKS } = await import('../js/tracks.js');
  const { CHARACTERS } = await import('../js/core.js');
  const { Input } = await import('../js/input.js');
  const { ITEM_ORDER } = await import('../js/items/index.js');
  const { hostSync, clientSync, codec } = await import('../js/net-sync.js');
  const pct = (a, q) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(q * b.length))] : 0; };
  const LOCAL_RACE = ['track', 'routes', 'cars', 'humans', 'localHumans', 'particles', 'boxes', 'gcs', 'rng', 'touching', 'cam', 'miniPath', 'trackIdx', 'laps', 'autoUse', 'aiLevel', 'lapLen', 'packMode', 'net', 'paused', 'shake', 'flash'];
  const EASED = new Set(['time', 'countdown', 'started', 'zap', 'projectiles', 'clones', 'train', 'crab']);   // what the player's screen moves on itself
  const odd = (v, path, d, out, seen) => {   // what a snapshot can't carry
    if (!v || typeof v !== 'object' || seen.has(v)) return; seen.add(v);
    if (v instanceof Map || v instanceof Set || ArrayBuffer.isView(v)) { out.add(path + ' (' + v.constructor.name + ')'); return; }
    if (d > 6) { out.add(path + ' (too deep)'); return; }
    for (const k of Object.keys(v)) odd(v[k], path + '.' + k, d + 1, out, seen);
  };
  const ow = 0.06, sizes = [];
  for (let track = 0; track < TRACKS.length; track++) {
    const name = TRACKS[track].name;
    Math.random = mulberry(900 + track); const rr = mulberry(40 + track);
    const racers = [{ ch: CHARACTERS[0], human: true, pIndex: 0 }, { ch: CHARACTERS[3], human: true, pIndex: 1 }, { ch: CHARACTERS[5], human: false, pIndex: -1 }, { ch: CHARACTERS[6], human: false, pIndex: -1 }];
    const host = new Race(track, { racers, laps: 3, aiLevel: 1 }); host.countdown = 0.5; host.packMode = false;
    const copy = new Race(track, { racers, laps: 3, aiLevel: 1 });
    let g = true, wantFire = false, t = 0, lastH = 0, lastP = 0, hostNext = 0, playerNext = 0, playerLast = 0, flip = 1;
    const view = clientSync(copy, { me: 1, gas: () => g, fire: () => { const f = wantFire; wantFire = false; return f; }, now: () => t }), Cc = codec(copy);
    const toHost = [], toPlayer = [], bytes = [], errors = [], applied = new Map(), mutated = new Set(), unc = new Set(), cloneOff = [], hostRel = [], prOff = [], prPath = new Map();
    const H = hostSync(host, { local: [host.cars[0]], now: () => t, send: s => { const txt = JSON.stringify(s); bytes.push(txt.length); lastP = Math.max(lastP, t + ow + rr() * 0.02); toPlayer.push({ at: lastP, txt }); } });
    const give = [2, 2.5], next = [0, 7];
    while (t < 45 && !host.over) {
      t = Math.min(hostNext, playerNext, toHost.length ? toHost[0].at : 1e9, toPlayer.length ? toPlayer[0].at : 1e9);
      while (toHost.length && toHost[0].at <= t) H.setInput(1, toHost.shift().m);
      while (toPlayer.length && toPlayer[0].at <= t) {
        const snap = JSON.parse(toPlayer.shift().txt);
        for (const [k, j] of applied) if (!EASED.has(k) && JSON.stringify(Cc.enc(copy[k])) !== j) mutated.add(k);
        try { view.receive(snap); } catch (e) { errors.push('receive: ' + e.message); }
        for (const k of new Set([...Object.keys(snap.race), ...applied.keys()])) applied.set(k, JSON.stringify(Cc.enc(copy[k])));
      }
      if (hostNext <= t) {
        try {
          for (const p of [0, 1]) { const c = host.cars[p]; if (host.started && !c.item && !c.finished && host.time > give[p]) { c.item = ITEM_ORDER[next[p]++ % ITEM_ORDER.length]; c.charges = 1; c.itemT = 0; give[p] = host.time + 2.2 + rr(); } }
          Input.pressed[0] = (hostNext % 3) < 2.6; Input.fire[0] = !!(host.cars[0].item && host.cars[0].itemT > 0.9);
          host.update(1 / 60);
          { const hc = host.cars[1], hk = host.clones.find(k => k.owner === hc); hostRel.push([host.time, hk ? hk.nid : -1, hk ? Math.hypot(hk.x - hc.x, hk.y - hc.y) : 0]); if (hostRel.length > 240) hostRel.shift(); }
          for (const q of host.projectiles) if (q.nid !== undefined) (prPath.get(q.nid) || prPath.set(q.nid, []).get(q.nid)).push([host.time, q.x, q.y]);
          if (Math.round(host.time * 60) % 120 === 0) {
            const seen = new Set([...host.cars, ...host.routes]);
            for (const k of Object.keys(host)) if (!LOCAL_RACE.includes(k) && typeof host[k] !== 'function') odd(host[k], 'race.' + k, 0, unc, seen);
            for (const c of host.cars) for (const k of Object.keys(c)) if (!['ch', 'st', 'ai', 'rng', 'hist'].includes(k)) odd(c[k], 'car.' + k, 1, unc, seen);
          }
        } catch (e) { errors.push('host: ' + e.message); hostNext = 1e9; }
        hostNext += 1 / 60;
      }
      if (playerNext <= t) {
        const dt = t - playerLast; playerLast = t; playerNext += (1 / 60) * (0.9 + 0.2 * rr()); if (dt <= 0) continue;
        if (t > flip) { g = !g; flip = t + (g ? 1 + rr() * 2.5 : 0.3 + rr() * 0.5); }
        const me = copy.cars[1];
        if (me.item && rr() < dt / 0.9) wantFire = true;
        try { copy.update(dt); } catch (e) { errors.push('player: ' + e.message); }
        toHost.push({ at: (lastH = Math.max(lastH, t + ow + rr() * 0.02)), m: { ...view.input() } });
        const L = view.latest, hr = L && hostRel.findLast(e => e[0] <= L.t + 1e-6), ck = copy.clones.find(k => k.owner === me), hk = hr && ck && hr[1] === ck.nid && hr;
        if (hk && ck && ck.age >= 0.3) cloneOff.push(Math.abs(Math.hypot(ck.x - me.x, ck.y - me.y) - hk[2]));
        for (const q of copy.projectiles) { const P = prPath.get(q.nid), k = P ? P.findIndex(e => e[0] >= copy.time) : -1; if (k > 0) { const a = P[k - 1], b = P[k], u = (copy.time - a[0]) / (b[0] - a[0]); prOff.push(Math.hypot(q.x - a[1] - (b[1] - a[1]) * u, q.y - a[2] - (b[2] - a[2]) * u)); } }
      }
    }
    if (view.stats.broke) errors.push('prediction: ' + view.stats.broke.message);
    ok(!errors.length, `${name}: items online run without an error` + (errors.length ? ': ' + [...new Set(errors)].slice(0, 3).join('; ') : ''));
    ok(!unc.size, `${name}: race state a snapshot can carry` + (unc.size ? ': ' + [...unc].join(', ') : ''));
    ok(!mutated.size, `${name}: the player's screen leaves the race state alone between snapshots` + (mutated.size ? ': ' + [...mutated].join(', ') : ''));
    // (the clone keeps its station as it was a moment ago, so a lift or hit moves it off briefly; the average swings
    // 3..27 by track, so 30. Measured against the newest snapshot the screen has, not the host's race now; skipped
    // while it fades in (first 0.3 s, it starts where the host made it))
    const cm = cloneOff.reduce((a, b) => a + b, 0) / Math.max(1, cloneOff.length);
    ok(!cloneOff.length || (cm < 30 && pct(cloneOff, 0.95) < 90), `${name}: own Thread clone drawn beside the kart (${cm.toFixed(0)} units off on average, ${pct(cloneOff, 0.95).toFixed(0)} at p95)`);
    ok(!prOff.length || pct(prOff, 0.95) < 30, `${name}: projectiles drawn on their path (${pct(prOff, 0.95).toFixed(0)} units off at p95)`);
    const avg = bytes.reduce((a, b) => a + b, 0) / bytes.length, max = Math.max(...bytes);
    ok(avg < 9 * 1024 && max < 30 * 1024, `${name}: snapshots ${(avg / 1024).toFixed(1)} KB on average, ${(max / 1024).toFixed(1)} KB at most`);
    sizes.push(`${name} ${(avg / 1024).toFixed(1)}/${(pct(bytes, 0.95) / 1024).toFixed(1)}/${(max / 1024).toFixed(1)}`);
  }
  console.log('items online: snapshot KB avg/p95/max: ' + sizes.join(', '));
}
// ---------------------------------------------------------------- 6. a slow link and a slow machine
// 24 KB/s (less than the snapshots want), 120 ms each way + 60 ms jitter, queued; the screen runs 30 fps with hitches;
// an item every ~2.5 s. Checked: flow control keeps snapshots fresh; an item on your own kart shows the frame you press
// it, its effects play once; if the host had no item after all, the effect goes away.
{
  const { Race } = await import('../js/race.js');
  const { CHARACTERS, seedCosmetic } = await import('../js/core.js');
  const { Input } = await import('../js/input.js');
  const { hostSync, clientSync } = await import('../js/net-sync.js');
  const pct = (a, q) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(q * b.length))] : NaN; };
  const ow = 0.12, jit = 0.06, RATE = 24 * 1024, ON = { boost: 'boost', oc: 'oc', shield: 'shield', sudo: 'sudo', grow: 'grow', ghost: 'ghost', ff: 'ff' };
  const items = ['boost', 'duck', 'shield', 'tomato', 'ghost', 'oc', 'leak', 'sudo', 'grow', 'ff', 'thread', 'boost'];
  seedCosmetic(); Math.random = mulberry(61); const rr = mulberry(62);   // (snapshot size depends on the cosmetic particles: same draws every run)
  const racers = [{ ch: CHARACTERS[0], human: true, pIndex: 0 }, { ch: CHARACTERS[3], human: true, pIndex: 1 }, { ch: CHARACTERS[5], human: false, pIndex: -1 }];
  const host = new Race(0, { racers, laps: 3, aiLevel: 1 }), copy = new Race(0, { racers, laps: 3, aiLevel: 1 }); host.countdown = 0.5;
  let t = 0, wantFire = false, linkFree = 0, lastH = 0;
  const view = clientSync(copy, { me: 1, gas: () => true, fire: () => { const f = wantFire; wantFire = false; return f; }, now: () => t });
  const toHost = [], toPlayer = [], ages = [], P = Race.prototype;
  const H = hostSync(host, { local: [host.cars[0]], now: () => t, send: s => {
    const txt = JSON.stringify(s), sent = t; linkFree = Math.max(linkFree, t) + txt.length / RATE;
    toPlayer.push({ at: Math.max(toPlayer.length ? toPlayer[toPlayer.length - 1].at : 0, linkFree + ow + rr() * jit), txt, sent });
  } });
  let uses = 0; const me = copy.cars[1];
  copy.sound = function (n, a, v) { if (a === me && /^use_/.test(n)) uses++; return P.sound.call(this, n, a, v); };
  let hostNext = 0, playerNext = 0, playerLast = 0, giveAt = 1.5, k = 0, pressAt = null, drawn = null, presses = 0, shown = [], fired = 0, gone = null, steal = false;
  while (t < 32) {
    t = Math.min(hostNext, playerNext, toHost.length ? toHost[0].at : 1e9, toPlayer.length ? toPlayer[0].at : 1e9);
    while (toHost.length && toHost[0].at <= t) {
      const m = toHost.shift().m;
      if (steal && m.f > fired) { host.cars[1].item = null; host.cars[1].item2 = null; steal = false; }   // the host has nothing to fire after all
      fired = Math.max(fired, m.f); H.setInput(1, m);
    }
    while (toPlayer.length && toPlayer[0].at <= t) { const o = toPlayer.shift(); ages.push(t - o.sent); view.receive(JSON.parse(o.txt)); }
    if (hostNext <= t) {
      if (host.started && host.time > giveAt && !host.cars[1].item) { const c = host.cars[1]; c.item = items[k++ % items.length]; c.charges = 1; c.itemT = 0; giveAt = host.time + 2.5; steal = k === 3; }
      Input.pressed[0] = true; host.update(1 / 60); hostNext += 1 / 60;
    }
    if (playerNext <= t) {
      const dt = t - playerLast; playerLast = t; playerNext += (rr() < 0.02 ? 0.15 : 1 / 30); if (dt <= 0) continue;
      let item = null;   // (what the screen showed last frame: the player reacts to that)
      if (pressAt !== null && t >= pressAt) { pressAt = null; if (drawn) { wantFire = true; item = drawn; presses++; } }
      copy.update(dt); drawn = copy.started && !me.finished && me.item;
      if (drawn && pressAt === null) pressAt = t + 0.15 + rr() * 0.2;
      if (item && ON[item]) shown.push(me[ON[item]] > 0);
      if (item === 'shield' && k === 3) gone = { t, item };   // the one the host has no item for
      if (gone && t - gone.t > 1.2 && gone.ok === undefined) gone.ok = !(me.shield > 0);
      const m = view.input(), key = m.g + ':' + m.f + ':' + m.n + ':' + m.q;
      if (key !== lastH) { toHost.push({ at: Math.max(toHost.length ? toHost[toHost.length - 1].at : 0, t + ow + rr() * jit), m: { ...m } }); lastH = key; }
    }
  }
  const o = H.peers.get(1);
  console.log(`slow link (24 KB/s, ${ow * 1000}+${jit * 1000} ms) and a 30 fps player: snapshots ${(ages.length / 32).toFixed(1)}/s arriving ${(pct(ages, 0.5) * 1000).toFixed(0)} ms old (p50), ${(pct(ages, 0.95) * 1000).toFixed(0)} p95, ${(Math.max(...ages) * 1000).toFixed(0)} max (${o.skipped} skipped);` +
    ` own-kart items shown the frame they're fired ${shown.filter(Boolean).length}/${shown.length}; item rings and sounds ${uses} for ${presses} presses (${view.stats.used} fired on the player's screen, the rest when the host's word came)`);
  // (the snapshots want ~35 KB/s, so without flow control the queue grows without end. Over 20 cosmetic seeds: 0.62..0.90 s
  // at p95, 1.36..1.45 s at most, so bounds 1.0 and 1.6)
  ok(pct(ages, 0.95) < 1.0 && Math.max(...ages) < 1.6, 'slow link: the player\'s view stays fresh (flow control)');
  ok(shown.length >= 5 && shown.every(Boolean), 'slow link: an item on your own kart shows the frame you fire it');
  ok(uses <= presses && uses >= view.stats.used && view.stats.used >= 8, `slow link: each item's ring and sound plays once on the player's screen (${uses} for ${presses} presses)`);
  ok(gone && gone.ok, 'slow link: an item the host had no longer goes away again');
  ok(!view.stats.broke, 'slow link: prediction ran without an error' + (view.stats.broke ? ': ' + view.stats.broke.stack : ''));
}
// ---------------------------------------------------------------- 7. a lost snapshot
{
  const { Race } = await import('../js/race.js');
  const { CHARACTERS } = await import('../js/core.js');
  const { hostSync, clientSync } = await import('../js/net-sync.js');
  const mk = () => { Math.random = mulberry(5); return new Race(6, { racers: [0, 3, 5, 6].map((ci, i) => ({ ch: CHARACTERS[ci], human: i < 2, pIndex: i < 2 ? i : -1 })), laps: 3, aiLevel: 1 }); };
  const host = mk(), cl = mk(), LAT = 0.03, dt = 1 / 60;
  let clock = 0, drop = 0; const down = [], up = [], took = [];
  const hs = hostSync(host, { local: [host.cars[0]], now: () => clock, send: (d, slot) => { if (slot !== 1) return true; if (drop > 0) { drop--; return true; } down.push([clock + LAT, JSON.parse(JSON.stringify(d))]); return true; } });
  cl.localHumans = [cl.cars.find(c => c.human && c.pIndex === 1)];
  const cs = clientSync(cl, { me: 1, gas: () => 1, fire: () => false, now: () => clock });
  const hm = host.cars.find(c => c.human && c.pIndex === 1), me = cl.localHumans[0];
  let grant = null;
  for (let f = 0; f < 60 * 50 && took.length < 6; f++) {
    host.update(dt); clock += dt;
    while (down.length && down[0][0] <= clock) cs.receive(down.shift()[1]);
    cl.update(dt);
    up.push([clock + LAT, cs.input()]); while (up.length && up[0][0] <= clock) hs.setInput(1, up.shift()[1]);
    if (host.started && grant === null && host.time > 3 + took.length * 5) { hm.item = 'shield'; hm.charges = 1; hm.item2 = null; hm.itemT = 0; grant = clock; drop = 1; }   // the snapshot that carries it is lost
    if (grant !== null && (me.item === 'shield' || clock - grant > 3)) { took.push(clock - grant); hm.item = null; grant = null; }
  }
  ok(took.length >= 5 && Math.max(...took) < 0.5, `a lost snapshot: the player's item slot is right again within a round trip (${took.map(t => Math.round(t * 1000)).join(', ')} ms)`);
}
// ---------------------------------------------------------------- 8. a lossy Wi-Fi link (test/net-lossy.mjs)
// 3% loss and a 100-300 ms stall every ~3 s, both ways, over a WebSocket (head-of-line blocking): own kart doesn't snap,
// others don't stutter, no quick gas tap is lost on the host.
{
  const { lossyRun, lossyLine } = await import('./net-lossy.mjs');
  const A = await lossyRun({ kind: 'tcp', ow: 0.01, jit: 0.01, loss: 0.03, every: 3, dur: 30, tracks: [0, 6] });
  console.log(lossyLine('lossy link (WebSocket):', A));
  ok(!A.broke, 'lossy link: prediction ran without an error' + (A.broke ? ': ' + A.broke.stack : ''));
  ok(A.snapFrames / (A.frames / 3600) < 5, 'lossy link: your own kart hardly ever snaps');
  ok(A.stutter / A.oFrames < 0.02, 'lossy link: the other karts don\'t stutter');
  ok(A.lifts > 10 && A.liftsSeen >= A.lifts, `lossy link: every lift off the gas reaches the host (${A.liftsSeen} of ${A.lifts})`);
  // the same over the DataChannel: a lost snapshot is gone (the next doesn't depend on it), one that comes late is dropped,
  // a lost input is covered by the next (it repeats the last gas changes); sounds and rings play once each
  const U = await lossyRun({ kind: 'udp', ow: 0.01, jit: 0.02, loss: 0.03, every: 3, dur: 30, tracks: [0, 6] });
  console.log(lossyLine('lossy link (DataChannel):', U));
  ok(!U.broke, 'lossy channel: prediction ran without an error' + (U.broke ? ': ' + U.broke.stack : ''));
  ok(U.nobase === 0 && U.lostSnaps > 10 && U.stale > 0, `lossy channel: every snapshot that arrives in order can be used (${U.lostSnaps} lost, ${U.stale} late and dropped, ${U.nobase} unusable)`);
  ok(U.snapFrames / (U.frames / 3600) < 5 && U.stutter / U.oFrames < 0.02, 'lossy channel: your own kart hardly ever snaps, the others don\'t stutter');
  ok(U.lifts > 10 && U.liftsSeen >= U.lifts, `lossy channel: every lift off the gas reaches the host (${U.liftsSeen} of ${U.lifts})`);
  ok(U.wrong === 0 && U.used > 500, `lossy channel: each snapshot used leaves the cars' items, laps and places as the host had them (${U.wrong} of ${U.used} off)`);
  ok(U.evGot >= U.evSent * 0.97, `lossy channel: sounds and hits sent again until they arrive (${U.evGot} of ${U.evSent})`);
}
// ---------------------------------------------------------------- 9. the next race in the same room
// A new race starts while the last one's inputs and snapshots are still arriving. Each carries its race number (net.js
// s.rn, rid here), so the last race's are dropped instead of making the new race's look stale.
{
  const { Race } = await import('../js/race.js');
  const { CHARACTERS } = await import('../js/core.js');
  const { Input } = await import('../js/input.js');
  const { hostSync, clientSync } = await import('../js/net-sync.js');
  const mk = () => { Math.random = mulberry(9); const r = new Race(1, { racers: [0, 3, 5].map((ci, i) => ({ ch: CHARACTERS[ci], human: i < 2, pIndex: i < 2 ? i : -1 })), laps: 2, aiLevel: 1 }); r.countdown = 0.3; return r; };
  const dt = 1 / 60;
  let clock = 0, gas = 0, oldIn = null, oldFull = null;
  const pair = rid => {
    const host = mk(), cl = mk(), down = [];
    const hs = hostSync(host, { rid, local: [host.cars[0]], now: () => clock, send: (d, slot) => { if (slot === 1) down.push(JSON.parse(JSON.stringify(d))); return true; } });
    const cs = clientSync(cl, { rid, me: 1, gas: () => gas, fire: () => false, now: () => clock });
    return { host, cl, hs, cs, down };
  };
  // race A: the player taps the gas on and off a lot (n climbs into the hundreds)
  const A = pair(1);
  for (let f = 0; f < 60 * 12; f++) {
    clock += dt; gas = f % 6 < 3 ? 1 : 0; Input.pressed[0] = true;
    A.host.update(dt); while (A.down.length) { const d = A.down.shift(); if (d.full) oldFull = d; A.cs.receive(d); }
    A.cl.update(dt); oldIn = A.cs.input(); A.hs.setInput(1, oldIn);
  }
  ok(oldIn.n > 200 && oldFull, `next race: race A's player made ${oldIn.n} gas changes`);
  // race B: the first frames, then race A's last input and a full snapshot of A arrive late; the player holds the gas
  const B = pair(2); gas = 1;
  const hm = B.host.cars.find(c => c.human && c.pIndex === 1), p0 = [0, 0];
  for (let f = 0; f < 60 * 8; f++) {
    clock += dt; Input.pressed[0] = true;
    B.host.update(dt);
    if (f === 20) { B.hs.setInput(1, oldIn); B.cs.receive(oldFull); p0[0] = B.host.cars[0].progress; p0[1] = hm.progress; }
    while (B.down.length) B.cs.receive(B.down.shift());
    B.cl.update(dt); B.hs.setInput(1, B.cs.input());
  }
  const went = (hm.progress - p0[1]) / (B.host.cars[0].progress - p0[0]);   // (vs the host's own kart, flat out: ~57% when it works, a slower racer)
  ok(went > 0.4 && hm.speed > 0, `next race: a late input from the last race doesn't stop the player driving (${Math.round(went * 100)}% as far as the host's kart)`);
  ok(Math.abs(B.cl.time - B.host.time) < 0.2, `next race: a late snapshot from the last race doesn't freeze the player's screen (${B.cl.time.toFixed(2)} s vs the host's ${B.host.time.toFixed(2)} s)`);
}
if (fails) { console.error(fails + ' failed'); process.exit(1); }
console.log('ok');
