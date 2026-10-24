// The changelog modal: built from git history by vite.config.js (virtual:changelog), each change tagged by kind, with a filter
// row (the last filter is remembered, kk-wn-filter). DOM only, built when opened.
import log from 'virtual:changelog';

export const VERSION = log.version;

// the kinds of change (vite.config.js classifyCommit tags each entry with one or two), in the order of the filter row
const KINDS = [['maps', 'Maps'], ['balance', 'Balance'], ['items', 'Items'], ['racers', 'Racers'], ['racing', 'Racing'], ['online', 'Online'],
  ['menu', 'Menu & HUD'], ['look', 'Look & sound'], ['fixes', 'Fixes'], ['other', 'Other']];
const LABEL = Object.fromEntries(KINDS);

// what the player has seen: the newest listed change's hash when they last opened it (kk-seen). unseenCount() is how many listed
// changes came since (-1: never opened); those are marked "new" in the list. Hidden commits (docs, tests) don't count, but a
// remembered hash can be one of them: log.seq has every commit, newest first.
const newest = log.versions[0] && log.versions[0].entries[0] ? log.versions[0].entries[0].h : '';
const hidden = new Set(log.hidden || []);
const loadSeen = () => { try { return localStorage.getItem('kk-seen'); } catch (e) { return null; } };
export function unseenCount() {
  const seen = loadSeen();
  if (!newest || seen === newest) return 0;
  if (!seen) return -1;
  let n = 0;
  for (const h of log.seq || []) { if (h === seen) return n; if (!hidden.has(h)) n++; }
  return -1;   // the hash it remembers is gone from the history: treat it as never opened
}
const loadFilter = () => { try { const f = localStorage.getItem('kk-wn-filter'); return f && LABEL[f] ? f : 'all'; } catch (e) { return 'all'; } };
const saveFilter = f => { try { localStorage.setItem('kk-wn-filter', f); } catch (e) { } };

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const chip = (k, tag = 'span') => { const c = el(tag, 'cl-k', LABEL[k] || k); c.dataset.k = k; return c; };

export function openChangelog() {
  if (document.querySelector('.cl-back')) return;
  const unseen = unseenCount(), fresh = unseen < 0 ? 0 : unseen;   // never opened: nothing to mark, it's all new
  try { if (newest) localStorage.setItem('kk-seen', newest); } catch (e) { }
  document.querySelectorAll('.wn-dot').forEach(d => d.remove());
  const isNew = new Set(log.versions.flatMap(v => v.entries).slice(0, fresh).map(e => e.h));
  const count = { all: 0 };
  for (const v of log.versions) for (const e of v.entries) { count.all++; for (const k of e.c || []) count[k] = (count[k] || 0) + 1; }
  let filter = loadFilter();
  if (!count[filter]) filter = 'all';

  const back = el('div', 'cl-back'), box = el('div', 'panel cl-box');
  const head = el('div', 'cl-head'), close = el('button', 'cl-x', '✕');
  head.append(el('h2', null, 'What’s new'), el('span', 'cl-ver', 'v' + log.version), close);
  const bar = el('div', 'cl-filters'), list = el('div', 'cl-list');
  bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Show changes of one kind');
  for (const [k, name] of [['all', 'All'], ...KINDS]) {
    if (!count[k]) continue;
    const b = k === 'all' ? el('button', 'cl-k', name) : chip(k, 'button');
    b.dataset.k = k; b.classList.add('cl-f');
    b.append(el('small', null, String(count[k])));
    b.onclick = () => { filter = k; saveFilter(k); draw(); };
    bar.append(b);
  }
  function draw() {
    bar.querySelectorAll('.cl-f').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === filter)));
    list.textContent = '';
    if (!log.versions.length) list.append(el('div', 'help', 'No history available in this build.'));
    for (const v of log.versions) {
      const shown = filter === 'all' ? v.entries : v.entries.filter(e => (e.c || []).includes(filter));
      if (!shown.length) continue;
      const sec = el('section', 'cl-ver-sec');
      sec.append(el('h3', null, 'v' + v.v), el('span', 'cl-date', v.date + ' · ' + shown.length + (shown.length === 1 ? ' change' : ' changes')));
      const ul = el('ul');
      for (const e of shown) {
        const li = el('li'), line = el('div', 'cl-line'), text = el('span', 'cl-s');   // the tags lead the sentence and it wraps under them
        if (isNew.has(e.h)) text.append(el('span', 'cl-new', 'new'));
        for (const k of e.c || []) text.append(chip(k));
        text.append(e.s);
        line.append(text, el('span', 'cl-meta', e.h + ' · ' + e.t));
        li.append(line);
        if (e.body) {
          const more = el('button', 'cl-more', 'more'), det = el('div', 'cl-body', e.body);
          det.hidden = true;
          more.onclick = () => { det.hidden = !det.hidden; more.textContent = det.hidden ? 'more' : 'less'; };
          line.append(more); li.append(det);
        }
        ul.append(li);
      }
      sec.append(ul); list.append(sec);
    }
    list.scrollTop = 0;
  }
  draw();
  box.append(head, bar, list); back.append(box); document.body.append(back);
  const shut = () => { back.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); shut(); } };
  document.addEventListener('keydown', onKey, true);
  close.onclick = shut;
  back.addEventListener('mousedown', e => { if (e.target === back) shut(); });
  close.focus();
}
