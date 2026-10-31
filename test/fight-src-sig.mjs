// Source signatures for the fight measurements (test/fight-odds.mjs's incremental mode): what a fight's result can
// depend on, split into the shared core and each fighter's own kit.
//   core: every file the sim reaches from js/fight.js (static imports) except the kits' own files, one hash per file
//   fighter: js/kits/<id>.js plus any other kit file it imports (Swifty's aim is Docky's)
// Comments and whitespace don't count, so rewording a note doesn't make a measurement stale. read(path) returns a
// repo-relative file's text (or null): the working tree's by default, or a commit's (gitReader).
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url);
export const fsReader = p => { try { return readFileSync(new URL(p, ROOT), 'utf8'); } catch { return null; } };
export const gitReader = commit => p => { try { return execSync(`git show ${commit}:${p}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch { return null; } };

// code without comments, whitespace runs as one space (strings and templates kept as they are)
export function code(s) {
  let out = '', i = 0;
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (c === '/' && d === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; out += ' '; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1; while (j < s.length && s[j] !== c) j += s[j] === '\\' ? 2 : 1;
      out += s.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i++;
  }
  return out.replace(/\s+/g, ' ').trim();
}
export const hash = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };

const KIT = /^js\/kits\/(?!lib\.js|index\.js|_)([\w-]+)\.js$/;
const deps = (p, src) => [...src.matchAll(/(?:^|[\s;])(?:import|export)\b[^'"`;]*?from\s*['"](\.[^'"]+)['"]|(?:^|[\s;])import\s*['"](\.[^'"]+)['"]/g)]
  .map(m => new URL(m[1] || m[2], 'file:///' + p).pathname.slice(1));

// { core: { path: hash }, fighters: { id: hash } } for the given fighter ids
export function srcSigs(ids, read = fsReader) {
  const core = {}, kits = {}, seen = new Set(), todo = ['js/fight.js'];
  while (todo.length) {
    const p = todo.pop(); if (seen.has(p)) continue; seen.add(p);
    const src = read(p); if (src == null) { core[p] = 'missing'; continue; }
    const c = code(src);
    if (KIT.test(p)) kits[p] = { c, deps: deps(p, c).filter(q => KIT.test(q)) }; else core[p] = hash(c);
    todo.push(...deps(p, c));
  }
  const fighters = {};
  for (const id of ids) {
    const parts = [], walk = (p, done = new Set()) => { if (done.has(p) || !kits[p]) return; done.add(p); parts.push(p + '\n' + kits[p].c); kits[p].deps.forEach(q => walk(q, done)); };
    walk(`js/kits/${id}.js`);
    fighters[id] = parts.length ? hash(parts.join('\n')) : 'missing';
  }
  return { core, fighters };
}
