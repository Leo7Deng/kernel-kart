// npm run play: play the game from a clean copy of the last commit, never from the working tree. Other sessions (and
// helpers) edit files here all the time; a reload mid-edit could load half a change. This keeps a git worktree in .play
// at HEAD, moves it to each new commit as it lands, and runs the dev server on it, so a reload (or the in-game update
// notice) only ever gives you finished, committed work.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const R = join(dirname(fileURLToPath(import.meta.url)), '..'), P = join(R, '.play');
const git = (...a) => execFileSync('git', a, { cwd: R, encoding: 'utf8' }).trim();
const head = () => git('rev-parse', 'HEAD');

if (!existsSync(P)) { git('worktree', 'prune'); git('worktree', 'add', '--detach', P, 'HEAD'); }
if (!existsSync(join(P, 'node_modules'))) symlinkSync(join(R, 'node_modules'), join(P, 'node_modules'), 'dir');
// the server runs from the copy, with the copy's own vite.config.js (its update notice watches git HEAD, which is this repo's).
// A commit that changes the server itself (vite.config.js, server/, package.json) gets a fresh server: Vite's own in-place
// config reload doesn't carry over things like the online relay's socket.
let vite = null, at = '';
const start = () => {
  // (the leaderboard's file lives here in the main checkout, not in the copy: server/board.mjs)
  vite = spawn(join(R, 'node_modules', '.bin', 'vite'), ['--host', ...process.argv.slice(2)], { cwd: P, stdio: 'inherit', env: { ...process.env, KK_BOARD_FILE: process.env.KK_BOARD_FILE || join(R, '.kk-board.json') } });
  vite.on('exit', (code, sig) => { if (!vite.restarting) process.exit(code ?? 0); });
};
const restart = () => { const old = vite; old.restarting = true; old.once('exit', start); old.kill('SIGTERM'); };
const sync = () => {
  try {
    const h = head(); if (h === at) return;
    const was = at; execFileSync('git', ['checkout', '--detach', '--force', h], { cwd: P, stdio: 'ignore' }); at = h;
    console.log(`[play] now at ${h.slice(0, 7)} ${git('log', '-1', '--format=%s', h)}`);
    if (was && vite && git('diff', '--name-only', was, h, '--', 'vite.config.js', 'server', 'package.json', 'package-lock.json')) {
      if (git('diff', '--name-only', was, h, '--', 'package.json', 'package-lock.json')) { console.log('[play] packages changed: installing'); execFileSync('npm', ['install'], { cwd: R, stdio: 'inherit' }); }
      console.log('[play] the server changed: restarting it'); restart();
    }
  } catch (e) { console.log('[play] sync failed:', e.message.split('\n')[0]); }
};
sync(); start(); setInterval(sync, 2000);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { vite.restarting = true; vite.kill(s); process.exit(0); });
