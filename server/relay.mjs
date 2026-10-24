// Kernel Kart online: the room relay. A WebSocket server (on /kk-net) that only keeps rooms and passes messages on; the
// game itself runs in the host's browser (js/net.js). Used by the dev server (vite.config.js) and by server/net.mjs.
//
// Messages are JSON. From a page:
//   { t: 'host' }                  open a room: answered with { t: 'room', code, id: 0 }
//   { t: 'join', code, name }      join one: { t: 'joined', code, id } (or { t: 'error', msg })
//   { t: 'send', to, d }           pass d on. The host sends to one player (to: id) or to everyone (to left out);
//                                  a player's message always goes to the host.
//   { t: 'leave' }                 leave the room (closing the page does the same)
// To a page: { t: 'hello', lan, you } on connecting (this machine's Wi-Fi addresses, for the share link; the address the
//   page connected from),
//   { t: 'msg', from, d } for a message passed on, and to the host { t: 'peer', id, name } when someone joins and
//   { t: 'left', id } when they go. If the host goes, everyone left gets { t: 'closed' } and the room is gone.
import os from 'node:os';
import { WebSocketServer } from 'ws';

export const NET_PATH = '/kk-net';
export const CODE_LETTERS = 'ABCDEFGHJKMNPRSTUVWXYZ';   // no I, L, O or Q: nothing you could misread or mistype
const MAX_PLAYERS = 4;                                   // a grid holds four karts

// this machine's IPv4 addresses on the local network (what a friend on the same Wi-Fi types in): real network cards
// first (192.168.*, then 10.*, then 172.16-31.*), VPNs and virtual machines last. KK_SHARE_IP=<address> puts that one first.
export function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) for (const a of list || [])
    if ((a.family === 'IPv4' || a.family === 4) && !a.internal)
      out.push({ ip: a.address, vpn: /^(utun|tun|tap|feth|zt|tailscale|wg|docker|br-|veth|vboxnet|vmnet|bridge)/i.test(name) });
  const rank = a => a.ip === process.env.KK_SHARE_IP ? -20 : (a.vpn ? 10 : 0) + (a.ip.startsWith('192.168.') ? 0 : a.ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(a.ip) ? 2 : 3);
  return out.sort((a, b) => rank(a) - rank(b)).map(a => a.ip);
}

export function createRelay({ log = () => { } } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20 });
  const rooms = new Map();   // code -> { code, host: ws, peers: Map(id -> ws), next }
  const send = (ws, m) => { if (ws.readyState === 1) ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };
  const newCode = () => { for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]; if (!rooms.has(c)) return c; } };
  const leave = ws => {
    const room = ws.room; if (!room) return; ws.room = null;
    if (ws === room.host) {
      for (const p of room.peers.values()) { send(p, { t: 'closed' }); p.room = null; }
      rooms.delete(room.code); log(`room ${room.code} closed`);
    } else {
      room.peers.delete(ws.id); send(room.host, { t: 'left', id: ws.id }); log(`room ${room.code}: player ${ws.id} left`);
    }
  };
  wss.on('connection', (ws, req) => {
    ws.room = null; ws.id = -1; ws.alive = true;
    // you: the address this page connected from, as seen here (js/net-rtc.js offers it for its race channel's mDNS candidates)
    send(ws, { t: 'hello', lan: lanAddresses(), you: String((req && req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/i, '') });
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', raw => {
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      if (!m || typeof m !== 'object') return;
      if (m.t === 'host') {
        leave(ws);
        const room = { code: newCode(), host: ws, peers: new Map(), next: 1 };
        rooms.set(room.code, room); ws.room = room; ws.id = 0;
        send(ws, { t: 'room', code: room.code, id: 0 }); log(`room ${room.code} opened`);
      } else if (m.t === 'join') {
        const room = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!room) return send(ws, { t: 'error', msg: 'No room with that code. Check the letters with the host.' });
        if (room.peers.size + 1 >= MAX_PLAYERS) return send(ws, { t: 'error', msg: 'That room is full (four players).' });
        leave(ws);
        ws.room = room; ws.id = room.next++; room.peers.set(ws.id, ws);
        send(ws, { t: 'joined', code: room.code, id: ws.id });
        send(room.host, { t: 'peer', id: ws.id, name: String(m.name || '').slice(0, 16) }); log(`room ${room.code}: player ${ws.id} joined`);
      } else if (m.t === 'send' && ws.room) {
        const room = ws.room, out = JSON.stringify({ t: 'msg', from: ws.id, d: m.d });
        // a race snapshot to a player whose connection is still sending earlier ones is dropped, not queued: the next one
        // is newer anyway, and a queue would keep them seconds behind (everything else always goes)
        const fwd = p => { if (m.d && m.d.k === 'snap' && p.bufferedAmount > 64 * 1024) return; send(p, out); };
        if (ws !== room.host) send(room.host, out);
        else if (m.to === undefined || m.to === null) for (const p of room.peers.values()) fwd(p);
        else { const p = room.peers.get(m.to); if (p) fwd(p); }
      } else if (m.t === 'leave') leave(ws);
    });
    ws.on('close', () => leave(ws));
    ws.on('error', () => { });
  });
  // a dropped Wi-Fi connection doesn't always close the socket: ping, and drop anyone who stops answering
  const beat = setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch { } } }, 5000);
  beat.unref?.();
  return {
    wss, rooms,
    // hand it an http server: it takes the upgrades on /kk-net and leaves every other one alone (Vite's own, say)
    attach(server) {
      server.on('upgrade', (req, socket, head) => {
        if (new URL(req.url, 'http://x').pathname !== NET_PATH) return;
        wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
      });
    },
    close() { clearInterval(beat); for (const ws of wss.clients) ws.terminate(); wss.close(); },
  };
}
