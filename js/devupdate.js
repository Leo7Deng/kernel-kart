// Dev only: the dev server no longer reloads the page by itself. Poll its version (it moves when a change is committed, not
// on every save) and offer the update instead, with the commit's one-sentence subject:
// a small corner notice during a race, a card with buttons on the menu / results. F9 reloads in both cases.
import { game } from './ui.js';

const KEY = 'F9', POLL_MS = 2000;

export function initDevUpdate() {
  if (!import.meta.env.DEV) return;
  let loaded = null, loadedHead = '', seen = null, changes = [], minor = false, wip = [], dismissed = null, el = null, mode = null, shown = '';

  const reload = () => location.reload();
  const hide = () => { if (el) { el.remove(); el = null; mode = null; } };
  addEventListener('keydown', e => { if (e.key === KEY && el) reload(); });   // only while the notice is up

  function show() {
    const racing = game.state === 'race' || game.state === 'loading';
    if (!racing && dismissed === seen) { hide(); return; }
    if (racing && minor) { hide(); return; }   // (an In the works update doesn't interrupt a race)
    const want = racing ? 'corner' : minor ? 'quiet' : 'card';   // (quiet: only behind-the-scenes changes, like In the works: a small chip, not the card)
    // the sentence: the newest commit's subject; before anything's committed, which files are being edited
    const first = changes[0] || 'A new version is ready', more = changes.length - 1;   // the server only bumps on a commit, so there's always a subject
    if (el && mode === want && shown === first + more) return;
    hide();
    el = document.createElement('div'); mode = want; shown = first + more;
    el.className = 'kk-update ' + want;
    if (want === 'quiet') {
      el.setAttribute('role', 'status');
      el.innerHTML = `<span class="ku-q" aria-hidden="true">✎</span><i></i><button class="go" title="Reload (${KEY})">Reload</button><button class="later" aria-label="Dismiss">✕</button>`;
      el.querySelector('i').textContent = /^In the works/.test(first) ? 'In the works was updated' : 'Small behind-the-scenes update';
      el.querySelector('.go').onclick = reload;
      el.querySelector('.later').onclick = () => { dismissed = seen; hide(); };
    } else if (want === 'corner') {
      const text = first + (more > 0 ? ` (and ${more} more)` : '');
      el.title = text;
      el.innerHTML = `<span class="ku-dot"></span><i></i><u><kbd>${KEY}</kbd> update</u>`;
      el.querySelector('i').textContent = text;
    } else {
      const list = changes.slice(1, 6).map(() => '<li></li>').join('');
      el.setAttribute('role', 'status');
      el.innerHTML = `<span class="ku-ico" aria-hidden="true">★</span><div class="ku-body"><b>Update ready</b><p class="what"></p>${list ? `<ul>${list}</ul>` : ''}</div>`
        + `<div class="ku-btns"><button class="later">Later</button><button class="go">Update <kbd>${KEY}</kbd></button></div>`;
      el.querySelector('.what').textContent = first;
      el.querySelectorAll('li').forEach((li, i) => { li.textContent = changes[i + 1]; });
      el.querySelector('.go').onclick = reload;
      el.querySelector('.later').onclick = () => { dismissed = seen; hide(); };
    }
    document.body.appendChild(el);
  }

  async function poll() {
    try {
      const r = await fetch('/__kk_version' + (loadedHead ? '?since=' + loadedHead : ''), { cache: 'no-store' });
      const j = await r.json();
      if (loaded === null) { loaded = j.v; loadedHead = j.head || ''; }
      changes = j.changes || []; minor = !!j.minor; wip = j.wip || [];   // the sentence follows the newest state (show() redraws when it changes)
      seen = j.v;
    } catch { /* server down or restarting: try again */ }
    if (seen !== null && seen !== loaded && changes.length) show();   // only a finished (committed) change, with its sentence: a save mid-edit isn't an update
  }
  poll(); setInterval(poll, POLL_MS);
}
