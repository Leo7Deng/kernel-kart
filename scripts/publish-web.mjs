// npm run publish:web: put the game on the web (GitHub Pages, https://leo7deng.github.io/kernel-kart/). From a clean
// copy of HEAD, it builds dist/ and force-pushes two history-free snapshot commits: the source to `main`, the build to
// `gh-pages`. No private email and nothing on the user's GitHub profile: authored by an address no account has, every
// file marked vendored. Online rooms still need a server: Pages only serves files.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, symlinkSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const R = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'https://github.com/Leo7Deng/kernel-kart.git';
const WHO = ['-c', 'user.name=Kernel Kart', '-c', 'user.email=kernel-kart@example.invalid'];   // (no GitHub account has it: not a contribution)
const PUSH = ['-c', 'http.version=HTTP/1.1', '-c', 'http.postBuffer=524288000'];   // (a flaky connection failed big pushes with HTTP 408)
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
  run('git', [...PUSH, 'push', '-f', REPO, 'main'], src);
  // the built game, for GitHub Pages
  cpSync(join(wt, 'dist'), site, { recursive: true }); writeFileSync(join(site, '.nojekyll'), '');
  run('git', ['init', '-q', '-b', 'gh-pages'], site); run('git', ['add', '-A'], site);
  run('git', [...WHO, 'commit', '-q', '-m', `Kernel Kart at ${head}`], site);
  run('git', [...PUSH, 'push', '-f', REPO, 'gh-pages'], site);
  console.log('\npublished: https://leo7deng.github.io/kernel-kart/ (Pages takes a minute or two to update)');
} finally {
  try { run('git', ['worktree', 'remove', '--force', wt], R); } catch { }
  rmSync(tmp, { recursive: true, force: true });
}
