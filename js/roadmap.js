// Kernel Kart: "In the works", the menu's list of what's being worked on right now and ideas not yet started. Kept by
// hand by whoever runs the work (the coordinator session updates it as work starts and lands): `now` is in progress,
// `ideas` is worth doing but nobody's on it. Plain text only (drawn with textContent).
export const ROADMAP = {
  updated: '2026-10-25',
  // [title, what, eta]: eta is 'queued' (waiting for a free helper) or { start, lo, hi } (ISO times): when it started, and
  // the earliest and latest it's expected to land, guessed from how long similar jobs took (small art jobs 10-25 min, a
  // new map or the menu 1.5-2.5 h, more with several helpers sharing the machine) and revised at each check-in (about
  // every 20 min while anything runs). The dialog shows how long it's been going and the range left, counting down.
  now: [
  ],
  ideas: [
    ['Front-runner ratings for the reworked maps', 'Re-measure Moonshot (now round eight).'],
    ['Thread\'s value', 'Measure whether Thread got too strong now that its clone leads the way.'],
    ['Always-on online server', 'Host the online rooms on the home desktop (or a free cloud host) with a permanent address, so the web version can play online any time without someone running the game.'],
    ['Sharper 3D on the menu and podium', 'Bigger, crisper renders of the 3D racers for the turntables and the podium (they reuse the small race sprites now).'],
    ['Camera on the huge open roads', 'Keep the shared camera from zooming far out over the ski fields and wide roads when several players are on screen.'],
    ['Race replays', 'Watch the last race again from any kart\'s view (races already replay exactly, so this is mostly a viewer).'],
    ['Unlocks and stickers', 'Small cosmetic rewards for winning cups and beating ghosts: kart paints, mascot hats, stickers.'],
    ['Daily challenge', 'One track and racer each day, with a time to beat shared through ghost links.'],
    ['Spectating online', 'Friends can join a room just to watch the race.'],
    ['Weather on more maps', 'Now and then, rain or snow on other tracks, like Neon Overflow\'s rain and its drying racing line.'],
    ['New track ideas', 'Something that chases the leader, a switch that changes the road for the next lap, a lane-blocking piston section, a ski jump you can steer in the air.'],
  ],
};
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
// the dialog (the same frame as What's new): a summary line, then a card per job with a progress bar you can read at a
// glance (filled: the time it's been going; the lighter band: when it's expected, earliest to latest; a marker: now), and
// the ideas as a compact list
const fmtClock = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function barState(eta, now = Date.now()) {
  if (eta === 'queued') return { q: true };
  const s = Date.parse(eta.start), lo = Date.parse(eta.lo), hi = Date.parse(eta.hi), end = hi + (hi - s) * 0.08;
  const pct = t => Math.max(0, Math.min(100, (t - s) / (end - s) * 100));
  return { now: pct(now), lo: pct(lo), hi: pct(hi), late: now > hi, soon: now >= lo && now <= hi, loT: lo, hiT: hi };
}
function jobCard(t, d, eta) {
  const li = el('li', 'rm-job'), top = el('div', 'rm-top'), name = el('b', 'rm-name', t), chip = el('span', 'rm-chip'), bar = el('div', 'rm-bar'), meta = el('div', 'rm-meta');
  top.append(name, chip); li.append(top);
  if (eta === 'queued') { li.classList.add('queued'); chip.textContent = 'waiting'; meta.textContent = 'starts when a helper frees up'; li.append(meta); }
  else {
    bar.append(el('i', 'rm-band'), el('i', 'rm-fill'), el('i', 'rm-now')); bar.setAttribute('role', 'progressbar');
    const eta2 = el('span', 'rm-eta'); eta2.dataset.eta = JSON.stringify(eta); meta.append(eta2, el('span', 'rm-win', `expected ${fmtClock(Date.parse(eta.lo))}–${fmtClock(Date.parse(eta.hi))}`));
    li.append(bar, meta); li.dataset.eta = JSON.stringify(eta);
  }
  const desc = el('div', 'rm-desc', d); li.append(desc);
  return li;
}
function paint(li) {
  if (!li.dataset.eta) return;
  const e = JSON.parse(li.dataset.eta), b = barState(e), q = c => li.querySelector(c);
  q('.rm-fill').style.width = b.now + '%'; q('.rm-now').style.left = b.now + '%';
  q('.rm-band').style.left = b.lo + '%'; q('.rm-band').style.width = (b.hi - b.lo) + '%';
  li.classList.toggle('late', b.late); li.classList.toggle('soon', b.soon);
  q('.rm-chip').textContent = b.late ? 'running late' : b.soon ? 'landing soon' : 'in progress';
  q('.rm-bar').setAttribute('aria-valuenow', Math.round(b.now)); q('.rm-bar').setAttribute('aria-label', li.querySelector('.rm-name').textContent + ': ' + left(e));
  q('.rm-eta').textContent = left(e);
}
export function openRoadmap() {
  if (document.querySelector('.cl-back')) return;
  const back = el('div', 'cl-back'), box = el('div', 'panel cl-box rm-box'), head = el('div', 'cl-head'), close = el('button', 'cl-x', '✕'), list = el('div', 'cl-list');
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'In the works');
  head.append(el('h2', null, 'In the works'), el('span', 'cl-ver', 'updated ' + ROADMAP.updated), close);
  // the summary: how many going, how many waiting, and when the next one should land
  const run = ROADMAP.now.filter(r => r[2] && r[2] !== 'queued'), wait = ROADMAP.now.length - run.length, sum = el('div', 'rm-sum');
  const tile = (n, l, cls) => { const t = el('div', 'rm-tile ' + cls); t.append(el('b', null, String(n)), el('span', null, l)); return t; };
  const next = soonest(), nextT = tile(next ? left(next, true) || 'soon' : '—', 'until the next one lands', 'next');
  sum.append(tile(run.length, run.length === 1 ? 'being worked on' : 'being worked on', 'run'), tile(wait, 'waiting', 'wait'), nextT);
  const now = el('ul', 'rm-jobs'); for (const [t, d, eta] of [...ROADMAP.now].sort((a, b) => (a[2] === 'queued') - (b[2] === 'queued') || (a[2] !== 'queued' && b[2] !== 'queued' ? Date.parse(a[2].hi) - Date.parse(b[2].hi) : 0))) now.append(jobCard(t, d, eta));
  const ideas = el('ul', 'rm-ideas'); for (const [t, d] of ROADMAP.ideas) { const li = el('li', null); li.append(el('b', null, t), el('span', null, d)); ideas.append(li); }
  const sec = (title, node) => { const s2 = el('section', 'rm-sec'); s2.append(el('h3', null, title), node); return s2; };
  list.append(sum, sec('Being worked on', now), sec('Ideas for later', ideas));
  box.append(head, list); back.append(box); document.body.append(back);
  const tick = () => { for (const li of back.querySelectorAll('.rm-job')) paint(li); const n = soonest(); nextT.querySelector('b').textContent = n ? (left(n, true) || 'soon') : '—'; }; tick();
  const timer = setInterval(tick, 1000);
  const shut = () => { clearInterval(timer); back.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); shut(); } };
  document.addEventListener('keydown', onKey, true);
  close.onclick = shut; back.addEventListener('mousedown', e => { if (e.target === back) shut(); });
  close.focus();
}
// how far along an estimate is: "started 40 min ago · about 10-35 min left" (or "about 30 min to 1 h 15 min left"), then "should land any minute (started ...)"
// past the earliest, "running late (started ...)" past the latest; short: just the range left, for the button
const mins = ms => Math.max(0, Math.round(ms / 60000));
const dur = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h` + (m % 60 ? ` ${m % 60} min` : '');
const span = (a, b) => b < 60 ? `${a}-${b} min` : `${dur(a)} to ${dur(b)}`;
export function left(eta, short = false) {
  if (eta === 'queued') return short ? '' : 'queued: starts when a helper frees up';
  const now = Date.now(), lo = mins(Date.parse(eta.lo) - now), hi = mins(Date.parse(eta.hi) - now), ago = 'started ' + dur(mins(now - Date.parse(eta.start))) + ' ago';
  const rest = hi <= 0 ? 'running late' : lo <= 0 ? `any minute, up to ${dur(hi)}` : `about ${span(lo, hi)} left`;
  return short ? (hi <= 0 ? 'late' : lo <= 0 ? `≤${hi} min` : `${lo}-${hi} min`) : `${ago} · ${rest}`;
}
// the soonest estimate of what's being worked on (for the button)
const soonest = () => ROADMAP.now.map(r => r[2]).filter(e => e && e !== 'queued').sort((a, b) => Date.parse(a.hi) - Date.parse(b.hi))[0];
export const roadmapBtn = () => { const e = soonest(); return `<button id="roadmap" class="whatsnew settings-btn" title="What's being worked on, and ideas for later">In the works${e ? ` <span class="rm-next" data-eta='${JSON.stringify(e)}'>${left(e, true)}</span>` : ''}</button>`; };
// keeps the button's countdown ticking while the menu's up
setInterval(() => { if (typeof document === 'undefined') return; for (const c of document.querySelectorAll('.rm-next')) c.textContent = left(JSON.parse(c.dataset.eta), true); }, 1000);
