// Fight mode's training room on screen: the overlay over the fight (js/fight-practice.js is the logic,
// fight-ui.js starts it and calls it every frame). Two columns of small panels, HTML over the canvas under the HUD cards:
//   left    your moves (key or button, icon, name, damage, startup / active / recovery frames, its cooldown live, the
//           first line of its card)
//   right   the dummy (its five modes, keys 1-5, the recording's progress), your last move's frames as it ran (and what it
//           left you with: ahead or behind, or on a whiff whether the dummy's quickest move fits in your recovery), the
//           last hit (damage, stagger, knockdown, counter, on the floor), the combo
//           and two tabs: Trials (your fighter's combo trials, js/fight-trials.js: pick one, its steps with their keys
//           and icons light up as you go, a hint when an attempt breaks, Watch plays its demo in a card over the
//           middle) and the Checklist (the generic nine)
//   keys    1-5 the dummy, T record, R reset, H hides it (a small pill brings it back), C the next trial, V watch it; by
//           touch the same as buttons
import { KEYS, MODES, REC_T, TRIALS, demoFrame, hintText, trialDemo } from './fight-practice.js';
import { drawFight, fightEvents, fightIcon } from './draw-fight.js';
import { LAYOUTS, keyLabel } from './fight-keys.js';
import { PCOL, TAU } from './core.js';
import { esc } from './ui.js';

const ACT = { move1: 'light', move2: 'heavy', move3: 'special', evade: 'guard' };
const STORE = 'kk-practice';
export function loadDone(id) { try { const o = JSON.parse(localStorage.getItem(STORE) || '{}'); return Array.isArray(o[id]) ? o[id] : []; } catch (e) { return []; } }
function saveDone(id, done) { try { const o = JSON.parse(localStorage.getItem(STORE) || '{}'); o[id] = [...done]; localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) { } }
const first = t => { const s = String(t || ''); const m = /^(.*?[.!?])(\s|$)/.exec(s); return m ? m[1] : s; };
const sec = x => (+x).toFixed(1);
const fr = n => `${n}<i>f</i>`;

// mount the overlay for practice P into the #ui layer; o: { touch () => bool, act(name) (reset, menu, sound...) }
export function mountPractice(P, o = {}) {
  const F = P.F, me = F.f[0], d = F.f[1], touch = () => !!(o.touch && o.touch());
  const el = document.createElement('div'); el.className = 'fp'; el.style.setProperty('--c0', PCOL[0]); el.style.setProperty('--c1', PCOL[1]);
  const keyOf = k => keyLabel(LAYOUTS.solo.keys[ACT[k]][0]);
  const mvRows = P.moves().map(m => `<li class="fp-mv" data-k="${m.k}" title="${esc(m.mv.blurb || '')}">
      <span class="fp-key"><kbd class="kb-only">${esc(keyOf(m.k))}</kbd><canvas width="56" height="56" data-icon="${esc(m.mv.icon || ACT[m.k])}" aria-hidden="true"></canvas></span>
      <span class="fp-mvb"><b>${esc(m.name)}</b><small>${m.k === 'evade' ? 'evade' : m.dmg != null ? `${+(+m.dmg).toFixed(1)} dmg${m.kd ? ' · floors' : ''}` : ''}<span class="fp-f" title="startup / active / recovery, in 60ths of a second">${fr(m.f[0])} ${fr(m.f[1])} ${fr(m.f[2])}</span></small><em>${esc(first(m.mv.blurb))}</em></span>
      <span class="fp-cd"><i class="fp-cdv"></i><i class="fp-cdbar"><i></i></i></span></li>`).join('');
  // a trial's steps: the key (none for one that follows by itself), the move's icon, what it is
  const stepRows = T => T.steps.map((st, j) => { const mv = me.stats.moves[st.m] || {}; return `<li data-s="${j}" class="${st.auto ? 'auto' : ''}"><span class="fp-sk">${st.auto ? '' : `<kbd class="kb-only">${esc(keyOf(st.m))}</kbd>`}<canvas width="44" height="44" data-icon="${esc(mv.icon || ACT[st.m])}" aria-hidden="true"></canvas></span><span>${esc(st.what)}</span></li>`; }).join('');
  const cRows = P.combos.map(T => `<li class="fp-c" data-c="${T.k}"><button type="button" class="fp-ch" data-pick="${T.k}"><i aria-hidden="true"></i><b>${esc(T.name)}</b><small>${T.steps.length} steps</small></button>
      <div class="fp-cb"><p class="fp-how">${esc(T.how)}${T.mode && T.mode !== 'stand' ? ` <em>Dummy: ${esc((MODES.find(m => m[0] === T.mode) || [])[1] || T.mode)}.</em>` : ''}</p><ol class="fp-st">${stepRows(T)}</ol><p class="fp-ht"></p>
        <button type="button" class="fp-watch" data-fp="watch"><kbd class="kb-only">V</kbd>Watch it</button></div></li>`).join('');
  el.innerHTML = `<div class="fp-col fp-l">
      <section class="fp-p"><h3>Your moves <small>${esc(me.stats.name || me.id)}</small></h3><ul class="fp-mvs">${mvRows}</ul></section>
    </div>
    <div class="fp-col fp-r">
      <section class="fp-p fp-dm"><h3>Dummy <small>${esc(d.stats.name || d.id)}</small></h3>
        <div class="fp-modes" role="group" aria-label="What the dummy does">${MODES.map(([k, n], j) => `<button type="button" data-mode="${k}" title="${esc(MODES[j][2])}"><kbd class="kb-only">${j + 1}</kbd>${esc(n)}</button>`).join('')}</div>
        <p class="fp-hint"></p>
        <button type="button" class="fp-rec" data-fp="record"></button><i class="fp-recbar"><i></i></i></section>
      <section class="fp-p fp-fd"><h3>Last move <small class="fp-fdn">none yet</small></h3>
        <div class="fp-frames"><span><b class="fp-s">–</b><small>startup</small></span><span><b class="fp-a">–</b><small>active</small></span><span><b class="fp-rc">–</b><small>recovery</small></span></div>
        <p class="fp-adv"></p></section>
      <section class="fp-p fp-hit"><h3>Last hit</h3>
        <div class="fp-hrow"><b class="fp-dmg">–</b><span class="fp-tags"></span><span class="fp-combo"><b>0</b><small>combo</small></span></div>
        <p class="fp-hsub"></p></section>
      <section class="fp-p fp-tr"><h3 class="fp-tabh">${P.combos.length ? `<button type="button" class="fp-tab" data-tab="trials">Trials <small class="fp-cn"></small></button>` : ''}<button type="button" class="fp-tab" data-tab="list">Checklist <small class="fp-trn"></small></button><button type="button" class="fp-fold" data-fp="trials" aria-label="Fold"></button></h3>
        <ul class="fp-cl">${cRows}</ul>
        <ul class="fp-trl">${TRIALS.map(([k, t]) => `<li data-t="${k}"><i aria-hidden="true"></i>${esc(t)}</li>`).join('')}</ul></section>
      <div class="fp-btns"><button type="button" data-fp="reset"><kbd class="kb-only">R</kbd>Reset</button><button type="button" data-fp="hide"><kbd class="kb-only">H</kbd>Hide</button><button type="button" data-fp="menu"><kbd class="kb-only">Esc</kbd>Menu</button></div>
    </div>
    <button type="button" class="fp-show" data-fp="hide"><kbd class="kb-only">H</kbd>Training info</button>
    <div class="fp-demo" hidden><div class="fp-dh"><b class="fp-dn"></b><button type="button" data-fp="watch"><kbd class="kb-only">V</kbd>Close</button></div><canvas class="fp-dcv"></canvas><ol class="fp-dst"></ol></div>`;
  // the move icons, on their side's colour
  const paintIcons = box => box.querySelectorAll('canvas[data-icon]').forEach(cv => { const g = cv.getContext('2d'), n = cv.width / 2; g.fillStyle = PCOL[0]; g.beginPath(); g.arc(n, n, n - 1, 0, TAU); g.fill(); g.save(); g.translate(n, n); try { fightIcon(g, cv.dataset.icon, n * 0.62, '#ffffff'); } catch (e) { } g.restore(); });
  paintIcons(el);
  const $ = s => el.querySelector(s);
  const ui = { el, hidden: false, trialsOpen: !touch() && !matchMedia('(max-height: 700px)').matches, tab: P.combos.length ? 'trials' : 'list', demo: null, demoT: 0, last: 0 };
  // the trial picked at the start: the first one not done yet (the dummy's mode left as it is)
  if (P.combos.length && !P.trial) P.pickTrial((P.combos.find(T => !P.done.has(T.k)) || P.combos[0]).k, false);
  const act = a => {
    if (a === 'hide') return ui.toggle();
    if (a === 'trials') { ui.trialsOpen = !ui.trialsOpen; return draw(true); }
    if (a === 'record') { P.record(); return draw(true); }
    if (a === 'watch') return ui.watch();
    if (o.act) o.act(a);
  };
  el.querySelectorAll('[data-fp]').forEach(b => b.onclick = () => act(b.dataset.fp));
  el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { P.setMode(b.dataset.mode); if (o.act) o.act('mode'); draw(true); });
  el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { ui.tab = b.dataset.tab; ui.trialsOpen = true; draw(true); });
  el.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => ui.pick(b.dataset.pick));
  // pick a trial (the dummy set to its mode); the next one (C); its demo on or off (V)
  ui.pick = k => { const was = ui.demo && ui.demo.T.k; P.pickTrial(k); ui.tab = 'trials'; ui.trialsOpen = true; if (ui.demo && was !== k) ui.watch(true); draw(true); };
  ui.next = () => { if (!P.combos.length) return; const j = P.combos.findIndex(T => T.k === P.trial); ui.pick(P.combos[(j + 1) % P.combos.length].k); };
  ui.watch = force => {
    if (ui.demo && !force) { ui.demo = null; return draw(true); }
    const T = P.combos.find(t => t.k === P.trial); if (!T) return;
    ui.demo = trialDemo(me.id, T.k); ui.demoT = 0; ui.last = performance.now();
    const ol = $('.fp-dst'); ol.innerHTML = stepRows(T); paintIcons(ol);
    put('.fp-dn', 'text', T.name);
    draw(true);
  };
  // the demo, a frame: the real sim with both fighters scripted, drawn into the card (a fixed camera, no HUD); it starts
  // over a moment after it ends
  function demoTick() {
    const c = ui.demo, cv = $('.fp-dcv'), now = performance.now(), dt = Math.min(0.1, (now - ui.last) / 1000); ui.last = now;
    if (c.n >= c.len) { ui.demoT += dt; if (ui.demoT > 0.8) { ui.demo = trialDemo(me.id, c.T.k); ui.demoT = 0; } return; }
    demoFrame(c, dt); fightEvents(c.F);
    const D = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * D) || cv.height !== Math.round(h * D)) { cv.width = Math.round(w * D); cv.height = Math.round(h * D); }
    const cam = c.sc.cam; drawFight(c.F, dt, { g: cv.getContext('2d'), w, h, dpr: D, hud: false, cam: { x: cam.x, y: (cam.y || 0) - 16, z: w / cam.w } });
    const pi = (c.P.prog[c.T.k] || {}).i || 0, won = c.P.done.has(c.T.k);
    el.querySelectorAll('.fp-dst>li').forEach((li, j) => put(li, 'class', (c.T.steps[j].auto ? 'auto ' : '') + (won || j < pi ? 'ok' : j === pi ? 'now' : '')));
  }
  ui.toggle = () => { ui.hidden = !ui.hidden; draw(true); };
  ui.mode = j => { const m = MODES[j]; if (m) { P.setMode(m[0]); draw(true); } };
  // what changed since last frame only (the text is set when it differs)
  // (memo: per element, so rows that share a selector string don't share a memory)
  let memo = new WeakMap();
  const put = (sel, prop, v) => { const e = typeof sel === 'string' ? $(sel) : sel; if (!e) return; let m = memo.get(e); if (!m) memo.set(e, m = new Map()); if (m.get(prop) === v) return; m.set(prop, v); { if (prop === 'html') e.innerHTML = v; else if (prop === 'text') e.textContent = v; else if (prop[0] === '-') e.style.setProperty(prop, v); else e.setAttribute(prop, v); } };
  function draw(force) {
    if (force) memo = new WeakMap();
    el.classList.toggle('fp-hid', ui.hidden); el.classList.toggle('fp-touch', touch());
    el.classList.toggle('fp-tron', ui.tab === 'trials' && ui.trialsOpen);   // (by touch, little room: the trials open hide the last move and hit)
    if (ui.hidden) return;
    // the moves' cooldowns
    for (const m of P.moves()) {
      const li = el.querySelector(`.fp-mv[data-k="${m.k}"]`); if (!li) continue;
      const ready = m.cd <= 0.001, txt = m.charges != null ? `${m.charges}/${m.maxCh}${m.charges < m.maxCh ? ' · ' + sec(m.cd) : ''}` : ready ? 'ready' : sec(m.cd) + ' s';
      put(li.querySelector('.fp-cdv'), 'text', txt);
      put(li, 'class', 'fp-mv' + (ready || m.charges > 0 ? ' on' : '') + (me.move === m.k ? ' now' : ''));
      put(li.querySelector('.fp-cdbar>i'), '-w', (m.full ? Math.max(0, Math.min(1, 1 - m.cd / m.full)) * 100 : 100).toFixed(0) + '%');
    }
    // the checklist
    put('.fp-trn', 'text', `${TRIALS.filter(([k]) => P.done.has(k)).length}/${TRIALS.length}`);
    put('.fp-cn', 'text', `${P.combos.filter(T => P.done.has(T.k)).length}/${P.combos.length}`);
    put('.fp-tr', 'class', 'fp-p fp-tr' + (ui.trialsOpen ? '' : ' fold') + ' tab-' + ui.tab);
    put('.fp-fold', 'aria-expanded', String(ui.trialsOpen));
    el.querySelectorAll('[data-tab]').forEach(b => put(b, 'aria-pressed', String(b.dataset.tab === ui.tab)));
    for (const [k] of TRIALS) put(el.querySelector(`[data-t="${k}"]`), 'class', P.done.has(k) ? 'ok' : '');
    // the combo trials: ticked, the picked one open, its steps lit as far as the attempt's got, the hint, a fresh tick
    for (const T of P.combos) {
      const li = el.querySelector(`[data-c="${T.k}"]`), on = P.trial === T.k, won = P.won && P.won.k === T.k && F.time - P.won.t < 1.2;
      put(li, 'class', 'fp-c' + (P.done.has(T.k) ? ' ok' : '') + (on ? ' on' : '') + (won ? ' won' : ''));
      if (!on) continue;
      const pi = (P.prog[T.k] || {}).i || 0;
      li.querySelectorAll('.fp-st>li').forEach((s, j) => put(s, 'class', (T.steps[j].auto ? 'auto ' : '') + (won || (pi > 0 && j < pi) ? 'ok' : j === pi ? 'now' : '')));
      put(li.querySelector('.fp-ht'), 'text', won ? 'Done!' : P.hint && P.hint.k === T.k ? hintText(T, P.hint) : pi > 0 ? `Step ${pi + 1} next.` : '');
      put(li.querySelector('.fp-ht'), 'class', 'fp-ht' + (won ? ' good' : P.hint && P.hint.k === T.k && pi === 0 ? ' bad' : ''));
      put(li.querySelector('.fp-watch'), 'html', `<kbd class="kb-only">V</kbd>${ui.demo ? 'Stop the demo' : 'Watch it'}`);
    }
    const dm = $('.fp-demo'); if (dm.hidden !== !ui.demo) dm.hidden = !ui.demo;
    // the dummy
    el.querySelectorAll('[data-mode]').forEach(b => put(b, 'aria-pressed', String(b.dataset.mode === P.mode)));
    const M = MODES.find(m => m[0] === P.mode);
    put('.fp-hint', 'text', P.recording ? 'Recording: you\'re the dummy now. Your fighter waits.' : P.mode === 'replay' && !P.rec.length ? 'Nothing recorded yet.' : M[2]);
    const rec = P.mode === 'replay';
    put('.fp-rec', 'class', 'fp-rec' + (rec ? '' : ' off') + (P.recording ? ' live' : ''));
    put('.fp-rec', 'html', P.recording ? `<kbd class="kb-only">T</kbd>Stop · ${sec(Math.max(0, REC_T - P.recT))} s` : `<kbd class="kb-only">T</kbd>${P.rec.length ? 'Record again' : 'Record 5 s'}`);
    put('.fp-recbar', 'class', 'fp-recbar' + (rec ? '' : ' off'));
    put('.fp-recbar>i', '-w', ((P.recording ? P.recT / REC_T : P.rec.length ? (P.play % P.rec.length) / P.rec.length : 0) * 100).toFixed(1) + '%');
    // your last move
    const D = P.fd;
    if (D) {
      put('.fp-fdn', 'text', D.name);
      put('.fp-s', 'html', fr(D.startup)); put('.fp-a', 'html', fr(D.active)); put('.fp-rc', 'html', fr(D.recovery));
      let v;
      if (D.cut) v = '<span class="bad">Cut short: you were hit</span>';
      else if (D.hit && D.adv != null) v = D.adv > 0 ? `<span class="good">+${D.adv}</span> on hit: you act ${D.adv} frames before them` : D.adv < 0 ? `<span class="bad">${D.adv}</span> on hit: they act first` : '<span>±0</span> on hit: even';
      else if (D.hit) v = P.wait != null ? 'Hit: counting…' : 'Hit';
      else if (D.evade) v = `Evade: ${D.recovery} frames open after it`;
      else if (D.fast && D.recovery > D.fast.f) v = `<span class="bad">Unsafe</span> on a miss: their ${esc(D.fast.name)} (${D.fast.f} f) fits in your ${D.recovery} f recovery`;
      else v = `<span class="good">Safe</span> on a miss: ${D.recovery} f recovery`;
      put('.fp-adv', 'html', v);
    }
    // the last hit and the combo
    const L = P.last;
    if (L) {
      put('.fp-dmg', 'text', L.iso ? '0' : (+L.dmg).toFixed(1));
      put('.fp-tags', 'html', [L.counter && '<i class="t-ctr">Counter</i>', L.ground && '<i class="t-gnd">On the floor</i>', L.kd && '<i class="t-kd">Knockdown</i>', L.iso && '<i>Isolated</i>'].filter(Boolean).join(''));
      put('.fp-hsub', 'text', `${L.name}${L.stun ? ` · stagger ${sec(L.stun)} s (${Math.round(L.stun * 60)} f)` : ''}`);
    }
    const C = P.combo;
    put('.fp-combo>b', 'text', String(C.n)); put('.fp-combo', 'class', 'fp-combo' + (C.live && C.n > 1 ? ' live' : ''));
    put('.fp-combo>small', 'text', C.n > 1 ? `hits · ${(+C.dmg).toFixed(1)}` : 'combo');
    if (P.fresh.length) saveDone(me.id, P.done);
  }
  ui.update = () => { draw(false); if (ui.demo && !ui.hidden) demoTick(); };
  ui.destroy = () => { ui.demo = null; el.remove(); };
  draw(true);
  return ui;
}
