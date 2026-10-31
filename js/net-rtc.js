// A WebRTC DataChannel between the host and each player for race snapshots and inputs. Over a WebSocket (TCP) one lost
// Wi-Fi packet holds up everything behind it (200+ ms) and karts stuttered; this channel is unordered with no
// retransmits, which works because each snapshot goes against the last acknowledged one and inputs repeat recent gas
// changes. Everything else stays on the WebSocket, as does the race while this isn't up. Signalled through the relay
// ({ k: 'rtc' }), no STUN/TURN (LAN only); where mDNS names (abcd.local) don't resolve, the address the relay saw stands
// in. Not open within OPEN_MS: the WebSocket carries on. No DOM: only RTCPeerConnection.
export const OPEN_MS = 6000;           // give up on a channel that hasn't opened by then (the WebSocket carries on)
const GATHER_MS = 2500;                // wait at most this long for this machine's own addresses
const BACKLOG = 64 * 1024;             // a snapshot isn't sent while this much is still waiting to leave (the next is newer)
export const rtcSupported = () => typeof RTCPeerConnection === 'function';

const isV4 = a => /^\d{1,3}(\.\d{1,3}){3}$/.test(a || '');
const loop = a => !a || /^127\./.test(a) || a === '0.0.0.0';
// the address the relay saw (an IPv4 address mapped into IPv6 too), or '' if it's no use to anyone else (this machine)
export const plainIp = a => { const v = String(a || '').replace(/^::ffff:/i, ''); return isV4(v) && !loop(v) ? v : ''; };
// The other side's description, each mDNS candidate also offered at the addresses it could be at (where the relay saw
// it, or this server's own addresses if that was localhost); ICE picks whichever answers.
export function withAddresses(sdp, ips) {
  const want = [...new Set(ips.filter(isV4))]; if (!want.length) return sdp;
  const out = [];
  for (const line of sdp.split(/\r\n/)) {
    out.push(line);
    const m = /^a=candidate:(\S+) (\d+) (\S+) (\d+) (\S+\.local) (\d+) (.*)$/i.exec(line);
    if (m) for (const ip of want) out.push(`a=candidate:${m[1]} ${m[2]} ${m[3]} ${m[4]} ${ip} ${m[6]} ${m[7]}`);
  }
  return out.join('\r\n');
}
const gathered = pc => new Promise(res => {
  if (pc.iceGatheringState === 'complete') return res();
  const t = setTimeout(res, GATHER_MS);
  pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
});

// One channel to one other machine. role 'host' makes the offer, 'player' answers it. o.signal(msg) sends a signalling
// message to the other side (through the relay); o.ips(): the addresses to try for the other side's mDNS candidates
// (from what it says and what the relay told us); o.onMessage(d) for each message that comes over it; o.onState(open)
// when it opens or goes. Returns { handle(msg) for a signalling message from the other side, send(d), open, close() }.
export function rtcLink(role, o) {
  let pc = null, dc = null, done = false, timer = null;
  const L = { open: false, failed: false, sent: 0, got: 0, at: 0 };
  const fail = () => { if (done) return; done = true; L.failed = !L.open; L.open = false; clearTimeout(timer); try { dc && dc.close(); } catch { } try { pc && pc.close(); } catch { } o.onState(false); };
  const wire = ch => {
    dc = ch;
    ch.onopen = () => { if (done) return; L.open = true; L.at = performance.now(); clearTimeout(timer); o.onState(true); };
    ch.onclose = () => fail();
    ch.onerror = () => { };
    ch.onmessage = e => { if (typeof e.data !== 'string') return; let d; try { d = JSON.parse(e.data); } catch { return; } L.got++; L.at = performance.now(); o.onMessage(d); };
  };
  try {
    pc = new RTCPeerConnection({ iceServers: [] });
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') fail(); };
    if (role === 'host') wire(pc.createDataChannel('kk-race', { ordered: false, maxRetransmits: 0 }));
    else pc.ondatachannel = e => wire(e.channel);
  } catch { L.failed = true; done = true; return { handle() { }, send: () => false, close() { }, L }; }
  timer = setTimeout(fail, OPEN_MS);
  const describe = async () => { await pc.setLocalDescription(role === 'host' ? await pc.createOffer() : await pc.createAnswer()); await gathered(pc); if (!done) o.signal({ k: 'rtc', type: pc.localDescription.type, sdp: pc.localDescription.sdp }); };
  if (role === 'host') describe().catch(fail);
  return {
    L,
    get open() { return L.open; },
    async handle(m) {
      if (done || !m || typeof m.sdp !== 'string') return;
      try {
        if (role === 'player' && m.type === 'offer') { await pc.setRemoteDescription({ type: 'offer', sdp: withAddresses(m.sdp, o.ips(m)) }); await describe(); }
        else if (role === 'host' && m.type === 'answer') await pc.setRemoteDescription({ type: 'answer', sdp: withAddresses(m.sdp, o.ips(m)) });
      } catch { fail(); }
    },
    // false: it didn't go (not open, or still sending the last ones: skip it, the next is newer)
    send(d) {
      if (!L.open || !dc || dc.readyState !== 'open' || dc.bufferedAmount > BACKLOG) return false;
      try { dc.send(JSON.stringify(d)); L.sent++; return true; } catch { return false; }
    },
    close: fail,
  };
}
