// npm run server: the built game (dist/), the online room relay and the leaderboard (board.mjs) on one port, without the dev server.
// PORT=8080 by default. It listens on every interface, so anyone on the same Wi-Fi can open the address it prints.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBoard } from './board.mjs';
import { createRelay, lanAddresses } from './relay.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = +(process.env.PORT || 8080);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

if (!fs.existsSync(path.join(ROOT, 'index.html'))) { console.error('No dist/ build: run `npm run build` first (npm run server does it for you).'); process.exit(1); }

const board = createBoard({ log: m => console.log('[board] ' + m) });
const server = http.createServer((req, res) => {
  if (board.handle(req, res)) return;
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.resolve(ROOT, '.' + p);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }   // nothing outside dist/
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});
const relay = createRelay({ log: m => console.log('[online] ' + m) });
relay.attach(server);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Kernel Kart on http://localhost:${PORT}/`);
  for (const ip of lanAddresses()) console.log(`  same Wi-Fi:  http://${ip}:${PORT}/`);
});
