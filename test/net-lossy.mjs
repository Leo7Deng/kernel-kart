// A lossy Wi-Fi link between the host and one player, in one process, and what it does to the player's screen.
// `node test/net-lossy.mjs` prints a table (a few tracks per scenario); test/net.test.mjs part 8 runs a short one with checks.
//
// The link (both ways, the same Wi-Fi): one-way latency `ow` plus up to `jit`, random packet loss `loss` (per ~1.4 KB
// packet) and `stalls`: every `every` seconds on average the air is busy for 100-300 ms and nothing gets through until
// it ends. Two kinds:
//   tcp: what a WebSocket does with that: in order, always delivered; a lost packet waits for its retransmit (200-300 ms)
//        and holds up everything behind it (head-of-line blocking), a stall delivers it all at once at its end.
//   udp: an unreliable, unordered channel (a WebRTC DataChannel, ordered: false, maxRetransmits: 0): a message with a
//        lost packet is gone, nothing waits for anything else, a stall queues what it can (some is dropped) and delivers
//        it at its end, possibly out of order.
// Measured on the player's screen (60 fps with a little wobble), all while racing:
//   gap:      ms between snapshots arriving (p50/p95/max)
//   snap:     frames where your own kart moves more than 8 units off its own motion (a visible correction), per minute
//   stutter:  frames where another kart's drawn step is off its speed by more than 40% (and 6 units), per cent of frames
//   starve:   frames where the others are drawn at (or past) the newest snapshot: nothing left to ease toward, per cent
//   in:       ms from a gas change to the host using it (p50/p95), and lifts the host never saw (a short tap lost)
//   fire:     ITEM -> the host fires it (p50/p95), and -> your screen shows a Rubber Duck you fired (the host's, p50/p95)
import { mulberry } from './harness.mjs';

const pct = (a, q) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(q * b.length))] : NaN; };

export function stallsFor(rr, every, dur) {   // [start, end] windows
  const out = []; if (!every) return out;
  for (let t = 0.5; t < dur;) { t += -Math.log(1 - rr()) * every; const d = 0.1 + rr() * 0.2; out.push([t, t + d]); t += d; }
  return out;
}
export function makeLink(kind, rr, { ow, jit = 0, loss = 0, stalls = [], stallDrop = 0.3, mtu = 1400 }) {
  const q = []; let lastAt = 0;
  const inStall = at => stalls.find(s => at >= s[0] && at < s[1]);
  const put = (at, m) => { let i = q.length; while (i > 0 && q[i - 1].at > at) i--; q.splice(i, 0, { at, m }); };
  return {
    q,
    send(m, t, bytes) {
      const segs = Math.max(1, Math.ceil(bytes / mtu));
      if (kind === 'tcp') {
        let at = t + ow + rr() * jit;
        for (let i = 0; i < segs; i++) if (rr() < loss) at = Math.max(at, t + ow + 0.2 + rr() * 0.1);   // a retransmit
        const s = inStall(at); if (s) at = s[1] + rr() * 0.03;
        at = Math.max(at, lastAt); lastAt = at; put(at, m);
      } else {
        for (let i = 0; i < segs; i++) if (rr() < loss) return;   // lost: a message is only as good as all its packets
        let at = t + ow + rr() * jit;
        const s = inStall(at); if (s) { if (rr() < stallDrop) return; at = s[1] + rr() * 0.03; }
        put(at, m);
      }
    },
    due(t) { const out = []; while (q.length && q[0].at <= t) out.push(q.shift().m); return out; },
    next() { return q.length ? q[0].at : 1e9; },
  };
}

// one race on `track` for `dur` seconds over that link; returns the raw numbers
export async function lossyRace({ track = 0, kind = 'tcp', ow = 0.01, jit = 0.01, loss = 0, every = 0, dur = 40, seed = 1 }) {
  const { Race } = await import('../js/race.js');
  const { CHARACTERS } = await import('../js/core.js');
  const { Input } = await import('../js/input.js');
  const { hostSync, clientSync } = await import('../js/net-sync.js');
  Math.random = mulberry(300 + track * 7 + seed);
  const rr = mulberry(1000 + track * 13 + seed), lr = mulberry(77 + track + seed * 31);
  const stalls = stallsFor(lr, every, dur + 2);
  const up = makeLink(kind, lr, { ow, jit, loss, stalls }), down = makeLink(kind, lr, { ow, jit, loss, stalls });
  const racers = [{ ch: CHARACTERS[0], human: true, pIndex: 0 }, { ch: CHARACTERS[3], human: true, pIndex: 1 }, { ch: CHARACTERS[5], human: false, pIndex: -1 }, { ch: CHARACTERS[6], human: false, pIndex: -1 }];
  const host = new Race(track, { racers, laps: 5, aiLevel: 1 }); host.countdown = 0.5; host.packMode = false;
  const copy = new Race(track, { racers, laps: 5, aiLevel: 1 });
  let t = 0, g = true, flip = 1.5, wantFire = false;
  const view = clientSync(copy, { me: 1, gas: () => g, fire: () => { const f = wantFire; wantFire = false; return f; }, now: () => t });
  // what each snapshot should leave on the player's screen (the cars' items, laps, places): checked as each one is used,
  // so a snapshot built against one the player never got would show; and every event the host sent, to see how many arrive
  const want = new Map(), sentEv = new Set(), gotEv = new Set(), digest = R => JSON.stringify(R.cars.map(c => [c.item, c.item2, c.charges, c.lap, c.rank, c.finished]));
  let sentN = 0;
  const H = hostSync(host, { local: [host.cars[0]], now: () => t, lossy: () => kind === 'udp', send: s => { const txt = JSON.stringify(s); sentN++; want.set(s.q, digest(host)); for (const e of s.ev) if (!e.iu) sentEv.add(e.i); down.send(txt, t, txt.length); } });
  const hard = c => ['spinT', 'squished', 'pinned', 'stall', 'frozen', 'bubbled', 'moonT', 'lavaT', 'pull', 'dragged', 'loopT', 'secretT', 'sweptT', 'flyT'].some(k => c[k] > 0) || c.finished || !c.human || c.air > 0;
  const R = { arr: [], frames: 0, snapFrames: 0, oFrames: 0, stutter: 0, starve: 0, inLat: [], lifts: 0, liftsSeen: 0, toFire: [], toDuck: [], bytes: 0, snaps: 0, errs: [], delay: 0, used: 0, wrong: 0 };
  // the host: what gas it applied for the player, step by step; when it fired the player's item
  const P = Race.prototype; let hostFire = null;
  host.useItem = function (c, s) { if (c === host.cars[1] && hostFire) { R.toFire.push(t - hostFire.t); hostFire.host = true; } return P.useItem.call(this, c, s); };
  const changes = [];   // the player's gas changes: { n, g, t, seen }
  let hostG = false, hostNext = 0, playerNext = 0, playerLast = 0, sentKey = '', sentAt = -1, giveAt = 3, k = 0, duck = null;
  const prev = new Map();
  while (t < dur) {
    t = Math.min(hostNext, playerNext, up.next(), down.next());
    for (const txt of up.due(t)) {
      const m = JSON.parse(txt);
      for (const c of changes) if (!c.got && c.n <= m.n) { c.got = true; if (c.n === m.n) R.inLat.push(t - c.t); }
      H.setInput(1, m);
    }
    for (const txt of down.due(t)) {
      R.arr.push(t); R.bytes += txt.length; R.snaps++;
      const s = JSON.parse(txt), n0 = (view.stats.stale || 0) + (view.stats.nobase || 0);
      view.receive(s);
      if ((view.stats.stale || 0) + (view.stats.nobase || 0) === n0) { R.used++; if (digest(copy) !== want.get(s.q)) R.wrong++; for (const e of s.ev) if (!e.iu) gotEv.add(e.i); }
    }
    if (hostNext <= t) {
      if (host.started && host.time > giveAt && !host.cars[1].item && !host.cars[1].finished) { const c = host.cars[1]; c.item = k++ % 2 ? 'duck' : 'boost'; c.charges = 1; c.item2 = null; c.itemT = 0; giveAt = host.time + 2.5; }
      Input.pressed[0] = (Math.floor(host.time * 60) % 180) < 150;
      host.update(1 / 60); hostNext += 1 / 60;
      const hg = Input.pressed[1];   // (what the host just drove the player's kart with)
      if (hg !== hostG) { hostG = hg; if (!hg && host.started) R.liftsSeen++; }
    }
    if (playerNext <= t) {
      const dt = t - playerLast; playerLast = t; playerNext += (1 / 60) * (0.9 + 0.2 * rr()); if (dt <= 0) continue;
      const me = copy.cars[1];
      if (copy.started && host.started && t > flip && t < dur - 1) {   // (none in the last second: still on its way when the run ends)
        g = !g; if (!g) R.lifts++;
        // mostly long holds and lifts, now and then a quick tap off the gas (60-150 ms): the kind a burst used to swallow
        flip = t + (g ? 0.8 + rr() * 2 : rr() < 0.4 ? 0.06 + rr() * 0.09 : 0.3 + rr() * 0.5);
      }
      if (me.item && copy.started && !duck && rr() < dt / 0.5) { wantFire = true; hostFire = { t, host: false }; if (me.item === 'duck') duck = { t, n: copy.projectiles.filter(p => p.owner === me).length }; }
      copy.update(dt);
      const m = view.input();
      if (changes.length === 0 || changes[changes.length - 1].n !== m.n) changes.push({ n: m.n, t });
      const key = m.g + ':' + m.f + ':' + m.n + ':' + m.q + ':' + (m.r || 0);
      if (key !== sentKey || t - sentAt > 0.1) { const txt = JSON.stringify(m); up.send(txt, t, txt.length); sentKey = key; sentAt = t; }
      if (duck) { const n = copy.projectiles.filter(p => p.owner === me).length; if (n > duck.n) { R.toDuck.push(t - duck.t); duck = null; } else if (t - duck.t > 3) duck = null; }
      if (!copy.started || !view.latest) { for (const c of copy.cars) prev.set(c, { x: c.x, y: c.y }); continue; }
      if (!hard(me) && !hard(host.cars[1])) { R.frames++; if (view.stats.jump > 8) R.snapFrames++; }
      if (copy.time >= view.latest.t - 1e-9) R.starve++;
      R.delay += copy.time > 0 ? Math.max(0, host.time - copy.time) : 0;
      for (const c of copy.cars) {
        const p = prev.get(c); prev.set(c, { x: c.x, y: c.y });
        if (c === me || !p || hard(c) || c.speed < 150) continue;
        const d = Math.hypot(c.x - p.x, c.y - p.y), want = c.speed * dt;
        if (d > 300) continue;
        R.oFrames++; if (Math.abs(d - want) > Math.max(6, 0.4 * want)) R.stutter++;
      }
    }
  }
  R.errs = view.stats.err; R.broke = view.stats.broke; R.pFrames = R.frames;
  R.stale = view.stats.stale || 0; R.nobase = view.stats.nobase || 0; R.lostSnaps = sentN - R.snaps; R.evSent = sentEv.size; R.evGot = [...sentEv].filter(i => gotEv.has(i)).length;
  return R;
}

export async function lossyRun(o) {
  const tracks = o.tracks || [0, 3, 6, 9], all = { arr: [], gaps: [], frames: 0, snapFrames: 0, oFrames: 0, stutter: 0, starve: 0, pf: 0, inLat: [], lifts: 0, liftsSeen: 0, toFire: [], toDuck: [], errs: [], bytes: 0, snaps: 0, broke: null, dur: 0, delay: 0 };
  for (const track of tracks) {
    const R = await lossyRace({ ...o, track });
    for (let i = 1; i < R.arr.length; i++) all.gaps.push(R.arr[i] - R.arr[i - 1]);
    for (const k of ['frames', 'snapFrames', 'oFrames', 'stutter', 'starve', 'lifts', 'liftsSeen', 'bytes', 'snaps', 'delay', 'used', 'wrong', 'stale', 'nobase', 'lostSnaps', 'evSent', 'evGot']) all[k] = (all[k] || 0) + R[k];
    for (const k of ['inLat', 'toFire', 'toDuck', 'errs']) all[k].push(...R[k]);
    all.pf += R.pFrames; all.dur += o.dur || 40; if (R.broke) all.broke = R.broke;
  }
  return all;
}
const ms = v => Number.isFinite(v) ? (v * 1000).toFixed(0) : '-';
export function lossyLine(name, A) {
  return `${name.padEnd(26)} gap ${ms(pct(A.gaps, 0.5))}/${ms(pct(A.gaps, 0.95))}/${ms(Math.max(...A.gaps))} ms; own snaps ${(A.snapFrames / (A.frames / 3600)).toFixed(1)}/min; others stutter ${(100 * A.stutter / A.oFrames).toFixed(1)}%, starve ${(100 * A.starve / A.pf).toFixed(1)}%, ${ms(A.delay / A.pf)} ms behind;` +
    ` in ${ms(pct(A.inLat, 0.5))}/${ms(pct(A.inLat, 0.95))} ms, lifts lost ${A.lifts - A.liftsSeen}/${A.lifts}; fire ${ms(pct(A.toFire, 0.5))}/${ms(pct(A.toFire, 0.95))}, duck shown ${ms(pct(A.toDuck, 0.5))}/${ms(pct(A.toDuck, 0.95))} ms; err p95 ${pct(A.errs, 0.95).toFixed(1)}; ${(A.bytes / A.dur / 1024).toFixed(0)} KB/s; snapshots lost ${A.lostSnaps}, late ${A.stale}, unusable ${A.nobase}, wrong ${A.wrong}/${A.used}; events arrived ${A.evGot}/${A.evSent}` + (A.broke ? ' BROKE ' + A.broke.message : '');
}
export const SCENARIOS = [
  ['clean (10 ms)', { ow: 0.01, jit: 0.01 }],
  ['1% loss', { ow: 0.01, jit: 0.01, loss: 0.01 }],
  ['3% loss', { ow: 0.01, jit: 0.01, loss: 0.03 }],
  ['3% loss + stalls/3s', { ow: 0.01, jit: 0.01, loss: 0.03, every: 3 }],
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const kinds = (process.env.KIND || 'tcp').split(','), dur = +(process.env.DUR || 40), tracks = process.env.TRACKS ? process.env.TRACKS.split(',').map(Number) : undefined;
  const pick = process.env.SC ? process.env.SC.split(',').map(Number) : SCENARIOS.map((_, i) => i);   // SC=3: only the fourth
  for (const kind of kinds) for (const [name, o] of SCENARIOS.filter((_, i) => pick.includes(i))) console.log(lossyLine(kind + ' ' + name, await lossyRun({ ...o, kind, dur, tracks })));
}
