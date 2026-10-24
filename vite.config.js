import { defineConfig } from 'vite';
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { createBoard } from './server/board.mjs';
import { createRelay } from './server/relay.mjs';

// Dev only: the page must not reload under a player mid-race. HMR is off (no websocket, so no reload or hot swap), and this
// plugin counts committed changes (git HEAD moving) at /__kk_version; js/devupdate.js polls it and offers an update notice instead.
// It also reports git HEAD and the commit subjects since a hash (?since=), which are the one-sentence "what changed".
const git = (...args) => new Promise(resolve =>
  execFile('git', args, { timeout: 1500 }, (err, out) => resolve(err ? '' : String(out).trim())));
function kkVersion() {
  return {
    name: 'kk-version',
    apply: 'serve',
    configureServer(server) {
      let v = Date.now();
      let head = '';
      server.middlewares.use('/__kk_version', async (req, res) => {
        let changes = [], minor = false;
        try {
          const h = await git('rev-parse', 'HEAD');
          if (h && h !== head) { if (head) v = Math.max(v + 1, Date.now()); head = h; }   // a commit counts even if no watched file changed
          const since = new URL(req.url, 'http://x').searchParams.get('since') || '';
          let out = /^[0-9a-f]{7,40}$/i.test(since) && since !== head ? await git('log', '--format=%x1e%s%x1f', '--name-only', '-n', '40', since + '..' + head) : '';
          let one = false;
          if (!out && since !== head) { one = true; out = await git('log', '--format=%x1e%s%x1f', '--name-only', '-n', '20', head); }   // unknown since: just the latest
          const recs = out.split('\x1e').slice(1).map(r => { const [s, f = ''] = r.split('\x1f'); return { s: s.trim(), files: f.split('\n').filter(Boolean) }; });
          const shown = recs.filter(r => !classifyCommit(r.s, r.files).hide).map(r => r.s);
          // the player-facing ones (as in What's new); if they're all behind the scenes (docs, tests, merges), still say what they were
          changes = (shown.length ? shown : recs.map(r => r.s)).slice(0, one ? 1 : 10); minor = recs.length > 0 && !shown.length;   // (minor: only behind-the-scenes ones, like In the works: a quieter notice)
          // edits not committed yet: which files (so the notice can say what's being worked on, and that it isn't finished)
          var wip = (await git('status', '--porcelain', '--', 'js', 'style.css', 'index.html')).split('\n').map(l => l.slice(3).trim()).filter(Boolean).map(f => f.replace(/^.*\//, ''));
        } catch { /* no git: version only */ }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ v, head, changes, minor, wip: wip || [] }));
      });
    },
  };
}

// What's new lists what changed in the game, each change tagged by kind (Maps, Balance, Items, ...), from its subject and the
// files it touched; behind-the-scenes commits (docs, tests, tooling, merges, refactors, balance notes, and updates to the
// In the works list, js/roadmap.js: things show up here once they're done) are hidden.
// classifyCommit(subject, files) -> { hide: true } or { c: ['maps', 'balance'] } (one or two kinds, the main one first).
const DEV_ONLY = /^(js\/roadmap\.js|README\.md|CLAUDE\.md|test\/|scripts\/|\.claude\/|\.gitignore$|jsconfig\.json$|package(-lock)?\.json$|lab\.html$|vite\.config\.js$|server\/net\.mjs$)/;
const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let NAMES = null;   // the track, racer and item names, read from the source once (plus the ones that were removed or renamed)
function names() {
  if (NAMES) return NAMES;
  const read = f => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };
  const tracks = ['Gopher Warren', 'Tux Tundra', 'Cron Crossing', 'Cloud Nine', 'Maple Mutex', 'Octo Oceanway', 'Neon Circuit', 'Snake Pit', 'Pyth Pyramids'];
  for (const l of read('js/tracks.js').split('\n')) { const m = /\{\s*name:\s*(['"])(.+?)\1.*\bdesc:/.exec(l); if (m) tracks.push(m[2].replace(/\\'/g, "'")); }
  const racers = ['Lamb', 'Bugsy', 'Keith'];
  for (const m of read('js/core.js').matchAll(/\bid:\s*'\w+',\s*name:\s*'([^']+)'/g)) racers.push(m[1]);
  const items = ['Undo', 'Rubber Duck', 'Mega Duck'];
  let files = []; try { files = readdirSync('js/items'); } catch { }
  for (const f of files) { const m = /\bname:\s*(['"])(.+?)\1/.exec(read('js/items/' + f)); if (m) items.push(m[2]); }
  const alt = a => [...new Set(a)].sort((x, y) => y.length - x.length).map(esc).join('|');
  return (NAMES = { tracks: new RegExp('\\b(' + alt(tracks) + ")(?!\\w)"), racers: new RegExp('\\b(' + alt(racers) + ')\\b'), items: new RegExp('(^|[^\\w-])(' + alt(items) + ')(?![\\w-])') });
}
const WORDS = {
  maps: /\b((?<!any )tracks?\b(?! layers)|maps?|circuit|asphalt|kerbs|(?<!top-right )corners?|hairpins?|crevasse|ramps?|kickers?|jumps?|wormholes?|low-g|moon|volcano(es)?|lava|eruptions?|crab|slag|crucible|ladle|waves?|squalls?|banked|carousel|boulders?|bridges?|geysers?|presses|freight|level crossings?|ravines?|landmarks?|saturns?|stage gate)\b/i,
  items: /\b(items?|power-ups?|odds|catch-up|roulette|boxes)\b/i,
  racers: /\b(racers?|roster|mascots?|drivers?|car art|cartoon cars|real cars|monster truck|hypercar|accel|grip|top speed)\b/i,
  racing: /\b(rocket start|on the grid|bits|steering|bots|karts lean)\b/i,
  online: /\b(online|multiplayer|rooms?|share link)\b/i,
  menu: /\b(menus?|hud|results|podium|cups?|time trial|settings|pause|what's new|update notice|version number|loading screen|event icons|icon chips|text messages|keyboard|start lights|camera|personal bests)\b/i,
  look: /\b(looks?|redrawn|redraw|drawn|art|restyled|effects|smoke|glow(s|ing)?|icons?|painted|paint|textured|sparks|plumes|flash(es)?|lightning|sounds?|audio|music|shadows?|shadowBlur|faces?|eyes|exhaust|puffs)\b/i,
};
const FIX = /^fix\b|\bfix(es|ed)?\b|\bcrash(es)?\b|\bbugs?\b|soft lock|no longer (crash|lag|stutter|clip|pile)|\bstutter|\blag\b|\bclip\b|recover when|never step|backwards|pile-ups|for real\b/i;
const BALANCE = /\b(less often|more often|more common|less common|rare|rarer|faster|slower|quicker|stronger|weaker|buff(ed)?|nerf(ed)?|odds|trimmed|costs? (a little )?(more|less)|a touch|a bit more|a little (more|less)|half as|less grip|more grip|harder|sooner|chances|(?<!carrying )speeds?|balance)\b|\d\s*%|\(was |instead of \d|\d(\.\d+)?\s*(x|×)\b|\d -> \d/i;
const BY_FILE = [
  ['online', f => /^(js\/net(-sync)?\.js|server\/)/.test(f)],
  ['menu', f => /^(js\/(ui|net-ui|timetrial-ui|timetrial|draw-timetrial|settings|changelog|devupdate|input)\.js|style\.css|index\.html)$/.test(f)],
  ['items', f => /^js\/(items\/|race-items\.js|art\/icons\.js)/.test(f)],
  ['racers', f => /^js\/(core\.js|art\/(cars|mascots)\.js)$/.test(f)],
  ['racing', f => /^js\/(race|race-ai|race-start|race-bits|rules|main)\.js$/.test(f)],
  ['maps', f => /^js\/(tracks|geometry|draw-mechanics|race-(?!ai|items|start|bits)[\w-]+)\.js$|^js\/art\/(track|props|vehicles|pharaoh|plateau|crab)\.js$/.test(f)],
  ['look', f => /^js\/(art\/|art\.js|fx[\w-]*\.js|render\.js|audio\.js)/.test(f)],
];
export function classifyCommit(subject, files) {
  const game = files.filter(f => !DEV_ONLY.test(f));
  if (!game.length) return { hide: true };   // docs, tests, tooling only (and merges, which list no files)
  if (/\bbalance notes?\b/i.test(subject) && game.every(f => f === 'js/core.js')) return { hide: true };
  if (/\b(refactor(ed|s)?|tidy|no-op|one module per|one place for|switch to es modules|split randomness)\b/i.test(subject) || /^(README|CLAUDE\.md):/.test(subject)) return { hide: true };
  if (/^baseline\b/i.test(subject)) return { c: ['other'] };
  const N = names();
  let s = subject;
  const at = {};
  const hit = (k, re, g = 0) => { const m = re.exec(s); if (m && !(k in at && at[k] <= m.index)) at[k] = m.index + (g ? m[1].length : 0); return m; };
  // names first, blanked out once matched so "Duke's Volcano" is a track and not Duke
  for (const [k, re, g] of [['maps', N.tracks], ['items', N.items, 1], ['racers', N.racers]]) {
    for (let m; (m = hit(k, re, g));) s = s.slice(0, m.index) + ' '.repeat(m[0].length) + s.slice(m.index + m[0].length);
  }
  for (const k in WORDS) hit(k, WORDS[k]);
  if (FIX.test(subject)) at.fixes = subject.search(FIX);
  const gameplay = files.some(f => /^(test\/golden\.json|js\/(items\/|core\.js|tracks\.js|race[\w-]*\.js|geometry\.js|rules\.js))/.test(f));
  // a balance change: tuning words on a commit that changes how the game plays (not a brand-new track, item or racer), or new item odds
  const fresh = /\b(new (track|item|racer)|whole new|from scratch|is now|^add)\b/i.test(subject);
  if (!fresh && gameplay && BALANCE.test(subject)) at.balance = subject.search(BALANCE);
  else if (!fresh && files.includes('test/golden.json') && files.includes('js/items/index.js')) at.balance = subject.length;
  let c = Object.keys(at).sort((a, b) => at[a] - at[b]);
  if (!c.some(k => k !== 'balance' && k !== 'fixes')) {   // the subject names no part of the game: go by the files it touched
    const n = BY_FILE.map(([k, t]) => [k, game.filter(t).length]).filter(x => x[1]).sort((a, b) => b[1] - a[1]);
    if (n.length) c.push(n[0][0]);
  }
  if (!c.length) c = ['other'];
  const main = c[0], second = ['balance', 'fixes'].find(k => k !== main && c.includes(k)) || c.find(k => k !== main);
  return { c: second ? [main, second] : [main] };
}

// virtual:changelog: the whole git history as versions. One version per calendar day (local author date), counted up from the
// first day (0.1, 0.2, ...; from a release on, 1.0, 1.1, ...: RELEASES); the game's version is the newest day's number plus its commit count (0.7.23), counting every commit,
// shown or hidden, so it matches the update notice. A day with only hidden commits keeps its number but isn't listed.
// seq is every commit hash, newest first, and hidden the hidden ones, so the "new" count can find any remembered hash.
// Dev recomputes on each load.
// RELEASES: when each major version starts (local time, as git prints it). From there the days count again from 0 under the
// next major (1.0, 1.1, ...), so a big batch of new tracks and items reads as a new version. 1.0: the user, 2026-10-18,
// after the new maps (Duke's Volcano, Silicon Circuit, Pyth Plateau, Pharaoh's Jackpot, Crab Harbor) and items.
const RELEASES = ['2026-10-18 13:20'];
export function buildChangelog() {
  let out = '';
  try {
    out = execFileSync('git', ['log', '--no-merges', '--reverse', '--name-only', '--date=format-local:%Y-%m-%d %H:%M',
      '--format=%x1e%h%x1f%ad%x1f%s%x1f%b%x1f'], { encoding: 'utf8', maxBuffer: 64 << 20, timeout: 20000 });
  } catch { /* no git: empty list */ }
  NAMES = null;
  const days = [], seq = [], hidden = [];
  let major = 0, day0 = 0;   // the current major version, and how many days came before it
  for (const rec of out.split('\x1e').slice(1)) {
    const [h, when, s, raw = '', fl = ''] = rec.split('\x1f');
    const para = raw.split(/\n\s*\n/).map(x => x.split('\n').filter(l => !/^co-authored-by:/i.test(l.trim())).join(' ').trim()).find(Boolean) || '';
    const body = para.length > 300 ? para.slice(0, 297).replace(/\s+\S*$/, '') + '...' : para;
    const [date, t] = when.split(' ');
    while (major < RELEASES.length && when >= RELEASES[major]) { major++; day0 = days.length; }
    let d = days[days.length - 1];
    if (!d || d.date !== date || d.major !== major) days.push(d = { v: major ? major + '.' + (days.length - day0) : '0.' + (days.length + 1), major, date, n: 0, entries: [] });
    d.n++; seq.unshift(h);
    const k = classifyCommit(s.trim(), fl.split('\n').filter(Boolean));
    if (k.hide) hidden.push(h);
    else d.entries.unshift({ s: s.trim(), h, t, body, c: k.c });
  }
  days.reverse();
  const top = days[0];
  return { version: top ? top.v + '.' + top.n : '0.0.0', versions: days.filter(d => d.entries.length), seq, hidden };
}
function kkChangelog() {
  const ID = 'virtual:changelog', RID = '\0' + ID;
  return {
    name: 'kk-changelog',
    // Vite keeps a loaded module until it's invalidated, and git moving isn't a file change: drop it with each page load
    // (a block, not an expression: a function returned from configureServer is run as a post hook with no request, and
    // middlewares.use returns the app, which then crashed the server on start)
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (/^\/(\?|$)|\.html(\?|$)/.test(req.url || '')) { const m = server.moduleGraph.getModuleById(RID); if (m) server.moduleGraph.invalidateModule(m); }
        next();
      });
    },
    resolveId: id => (id === ID ? RID : null),
    load: id => (id === RID ? 'export default ' + JSON.stringify(buildChangelog()) : null),
  };
}

// virtual:art-hash: a hash of the code that draws the menu's stored pictures (the track previews, map covers and the
// backdrop's layer: art/paint-worker.js and everything it imports, found by reading the imports), so the store of drawn
// pictures (js/thumb-store.js) keeps them across updates that don't touch the drawing (before, every commit threw them
// all away, and the user updates often). tracks.js is left out (each track's own definition is hashed in the page, so a
// change to one track redraws only that one), and so are files that can't change a picture (sound, keys, the menus'
// helpers). Dev reads the files again on each page load, so edits not yet committed count too.
const ART_ROOT = 'js/art/paint-worker.js', ART_SKIP = /^js\/(tracks|audio|input|qol)\.js$/;
export function artHash() {
  const seen = new Set(), todo = [ART_ROOT];
  while (todo.length) {
    const f = todo.pop(); if (seen.has(f)) continue; seen.add(f);
    let src = ''; try { src = readFileSync(f, 'utf8'); } catch { continue; }
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g))
      todo.push(posix.normalize(posix.join(posix.dirname(f), m[1] || m[2])));
  }
  const h = createHash('sha1');
  for (const f of [...seen].filter(f => !ART_SKIP.test(f)).sort()) { h.update(f + '\0'); try { h.update(readFileSync(f)); } catch { } }
  return h.digest('hex').slice(0, 16);
}
function kkArtHash() {
  const ID = 'virtual:art-hash', RID = '\0' + ID;
  return {
    name: 'kk-art-hash',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (/^\/(\?|$)|\.html(\?|$)/.test(req.url || '')) { const m = server.moduleGraph.getModuleById(RID); if (m) server.moduleGraph.invalidateModule(m); }
        next();
      });
    },
    resolveId: id => (id === ID ? RID : null),
    load: id => (id === RID ? 'export default ' + JSON.stringify(artHash()) : null),
  };
}

// online rooms (server/relay.mjs): the WebSocket relay rides on the dev (and preview) server's own port, at /kk-net; and
// the leaderboard (server/board.mjs) on /kk-board
function kkNet() {
  const hook = server => {
    if (!server.httpServer) return;
    const relay = createRelay({ log: m => server.config.logger.info('[online] ' + m) }); relay.attach(server.httpServer);
    const board = createBoard({ log: m => server.config.logger.info('[board] ' + m) });
    server.middlewares.use((req, res, next) => { if (!board.handle(req, res)) next(); });
    server.httpServer.on('close', () => { relay.close(); board.flush(); });
  };
  return { name: 'kk-net', configureServer: hook, configurePreviewServer: hook };
}

// base './': the built dist/ works from any folder or subpath. host: true listens on the local network too, so a
// friend on the same Wi-Fi can open the "Network" address Vite prints (and join an online room)
export default defineConfig({ base: './', server: { hmr: false, host: true }, preview: { host: true }, plugins: [kkVersion(), kkChangelog(), kkArtHash(), kkNet()] });
