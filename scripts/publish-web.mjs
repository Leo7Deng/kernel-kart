// npm run publish:web: put the game on the web (GitHub Pages, https://leo7deng.github.io/kernel-kart/). From a clean
// copy of the last commit (never the working tree: other sessions edit it), it builds dist/ (here, where the git history
// is, so What's new is complete) and force-pushes two snapshot commits with no history to the public repo: the source to
// `main` and the built game to `gh-pages`. The user's calls: no private email in public (2026-10-21), and (2026-10-22) no
// history and nothing on their GitHub profile: the snapshots are authored by an address no GitHub account has, so they
// don't count as contributions, and the source's .gitattributes marks every file vendored, so GitHub's language stats
// leave the repo out. Online rooms still need a server (npm run play or npm run server): Pages only serves files.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, symlinkSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const R = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'https://github.com/Leo7Deng/kernel-kart.git';
const WHO = ['-c', 'user.name=Kernel Kart', '-c', 'user.email=kernel-kart@example.invalid'];   // (no GitHub account has it: not a contribution)
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const out = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();

const head = out('git', ['rev-parse', '--short', 'HEAD'], R);
const tmp = mkdtempSync(join(tmpdir(), 'kk-publish-')), wt = join(tmp, 'tree'), src = join(tmp, 'src'), site = join(tmp, 'site');
try {
  // a clean copy of HEAD to build from (it shares this repo's history, for the changelog)
  run('git', ['worktree', 'add', '--detach', wt, 'HEAD'], R);
  symlinkSync(join(R, 'node_modules'), join(wt, 'node_modules'), 'dir');
  run('npx', ['vite', 'build'], wt);
  // the source: one commit, no history, every file vendored for GitHub's language stats
  mkdirSync(src); execFileSync('sh', ['-c', `git archive HEAD | tar -x -C "${src}"`], { cwd: R });
  writeFileSync(join(src, '.gitattributes'), '* linguist-vendored\n');
  run('git', ['init', '-q', '-b', 'main'], src); run('git', ['add', '-A'], src);
  run('git', [...WHO, 'commit', '-q', '-m', `Kernel Kart at ${head}`], src);
  run('git', ['push', '-f', REPO, 'main'], src);
  // the built game, for GitHub Pages
  cpSync(join(wt, 'dist'), site, { recursive: true }); writeFileSync(join(site, '.nojekyll'), '');
  run('git', ['init', '-q', '-b', 'gh-pages'], site); run('git', ['add', '-A'], site);
  run('git', [...WHO, 'commit', '-q', '-m', `Kernel Kart at ${head}`], site);
  run('git', ['push', '-f', REPO, 'gh-pages'], site);
  console.log('\npublished: https://leo7deng.github.io/kernel-kart/ (Pages takes a minute or two to update)');
} finally {
  try { run('git', ['worktree', 'remove', '--force', wt], R); } catch { }
  rmSync(tmp, { recursive: true, force: true });
}
