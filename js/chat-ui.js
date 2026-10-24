// Kernel Kart online: the room's chat on screen (the rules are net-chat.js, the messages net.js). A Chat panel in the
// room and under an online race's results and podium (one panel, moved from screen to screen, so a half-typed line and
// the focus survive the room being redrawn); in a race, the lines that come in show for a few seconds in a small stack on
// the left, under the player cards, and T or / (keys no player has online) opens a line to type in: while it's open the
// keys go to it alone (the gas is let go as it opens), Enter sends, Esc closes. On touch a chat button above the item
// button opens it. A quiet blip for a line someone else sent.
import { sfx } from './audio.js';
import { DKEYS, IKEYS, KEYS, PCOL } from './core.js';
import { Input } from './input.js';
import { net, sayChat } from './net.js';
import { CHAT_MAX, QUICK, chatLineEl } from './net-chat.js';
import { game } from './ui.js';

const SHOW = 4, SHOW_TYPING = 5;   // lines in the race's stack: as they come in, and while you type
const lineEl = m => chatLineEl(document, m, PCOL[m.slot] || PCOL[0], !!net.s && m.id === net.s.me);
const say = (input, text) => {
  const r = sayChat(text);
  if (r.wait) { input.classList.remove('nudge'); void input.offsetWidth; input.classList.add('nudge'); return false; }   // too soon: keep it, try again
  return true;
};
const inputEl = (cls, ph) => {
  const i = document.createElement('input'); i.className = cls; i.maxLength = CHAT_MAX; i.placeholder = ph;
  i.autocomplete = 'off'; i.spellcheck = false; i.setAttribute('enterkeyhint', 'send'); i.setAttribute('aria-label', 'Chat message'); return i;
};

// ---------------------------------------------------------------- the panel (room, results, podium)
let panel = null, log = null, field = null, focused = false;
function makePanel() {
  panel = document.createElement('div'); panel.className = 'panel chat-panel net';
  panel.innerHTML = '<h2>Chat</h2><div class="chat-log" role="log" aria-live="polite"></div><div class="chat-row"></div><div class="chat-quick"></div>';
  log = panel.querySelector('.chat-log');
  field = inputEl('chat-in', 'Say something…');
  const send = () => { if (say(field, field.value)) field.value = ''; field.focus(); };
  field.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); send(); } else if (e.key === 'Escape') field.blur(); };
  // the room is redrawn on every change and takes the panel with it, which blurs the line: mountChat focuses it again
  // straight away, so only a blur that's still a blur a moment later is the player's
  field.onfocus = () => { focused = true; };
  field.onblur = () => setTimeout(() => { if (document.activeElement !== field) focused = false; });
  const b = document.createElement('button'); b.className = 'chat-send'; b.textContent = 'Send'; b.onclick = send;
  panel.querySelector('.chat-row').append(field, b);
  const quick = panel.querySelector('.chat-quick');
  for (const q of QUICK) { const k = document.createElement('button'); k.textContent = q; k.onclick = () => say(field, q); quick.appendChild(k); }
}
function fillLog() {
  if (!log) return;
  log.replaceChildren(...((net.s && net.s.chat) || []).map(lineEl));
  log.scrollTop = log.scrollHeight;
}
// put the chat panel on screen: in place of el (a placeholder), or at the end of a screen (append)
export function mountChat(el, append = false) {
  if (!net.s) return;
  if (!panel) makePanel();
  if (append) el.appendChild(panel); else el.replaceWith(panel);
  fillLog();
  if (focused) field.focus({ preventScroll: true });
}
const panelShown = () => panel && panel.isConnected && game.state !== 'race';
// is the panel on screen (not scrolled away)?
function panelInView() {
  if (!panelShown()) return false;
  const r = log.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight;
}

// ---------------------------------------------------------------- in a race
let hud = null, lines = null, row = null, line = null, btn = null, typing = false;
const inRace = () => !!net.s && game.state === 'race' && !!game.race && !!game.race.net;
function makeHud() {
  hud = document.createElement('div'); hud.id = 'chatHud'; hud.className = 'chat-hud'; hud.hidden = true;
  hud.innerHTML = '<div class="ch-lines"></div><div class="ch-type net" hidden></div>';
  lines = hud.querySelector('.ch-lines'); row = hud.querySelector('.ch-type');
  line = inputEl('ch-in', 'Say something…');
  const hint = document.createElement('span'); hint.className = 'ch-hint'; hint.textContent = 'Enter to send · Esc to close';
  row.append(line, hint);
  line.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); if (say(line, line.value)) { line.value = ''; closeType(); } }
    else if (e.key === 'Escape') { e.preventDefault(); line.value = ''; closeType(); }   // (Esc: never mind)
  };
  line.onblur = () => setTimeout(() => { if (typing && document.activeElement !== line) closeType(); });   // clicked or tapped away
  btn = document.createElement('button'); btn.id = 'chatBtn'; btn.className = 'chat-btn'; btn.hidden = true; btn.title = 'Chat (T)'; btn.setAttribute('aria-label', 'Chat');
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5z"/></svg>';
  btn.onpointerdown = e => e.preventDefault();   // (the open line keeps the focus, so a second tap closes it rather than reopening it)
  btn.onclick = () => { if (typing) closeType(); else openType(); };
  document.body.append(hud, btn);
}
// a line in the stack: it fades out after a few seconds (still: the recent ones shown while you type, which stay)
function stackLine(m, still) {
  const el = lineEl(m); el.classList.add(still ? 'still' : 'fade');
  if (!still) setTimeout(() => el.remove(), 7000);   // (a timer, not animationend: with reduced motion there's no fade, but it still goes)
  lines.appendChild(el);
  while (lines.children.length > (typing ? SHOW_TYPING : SHOW)) lines.firstElementChild.remove();
}
function openType() {
  if (!inRace() || typing) return;
  // whatever is held lets go now: its key-up will land in the chat line, not with the game
  for (let i = 0; i < 4; i++) Input.release(i);
  Input.drift.fill(false);
  typing = true; hud.classList.add('typing'); row.hidden = false; hud.hidden = false;
  lines.replaceChildren(); for (const m of (net.s.chat || []).slice(-SHOW_TYPING)) stackLine(m, true);
  line.focus();
}
function closeType() {
  if (!typing) return;
  typing = false; hud.classList.remove('typing'); row.hidden = true; lines.replaceChildren();
  if (document.activeElement === line) line.blur();
}
// T or / in an online race (only when nobody's keys use them: online it's always Q, W, E, Space, Enter and Shift)
addEventListener('keydown', e => {
  if (!inRace() || typing || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target && e.target.closest && e.target.closest('input, textarea')) return;
  const k = e.key.toLowerCase();
  if ((k !== 't' && k !== '/') || KEYS.includes(k) || IKEYS.includes(k) || DKEYS.includes(k)) return;
  if (!hud) makeHud();
  e.preventDefault(); e.stopImmediatePropagation(); openType();   // (preventDefault: the T isn't typed into the line)
}, true);
// what's on screen when: the race's stack and button only in an online race; out of one, the stack only peeks a line
// that comes in while the chat panel is scrolled out of sight
let wasRace = false;
setInterval(() => {
  if (!hud) { if (net.s) makeHud(); else return; }
  const race = inRace();
  if (!race && typing) closeType();
  if (wasRace && !race) lines.replaceChildren();   // the race is over: its lines go with it
  wasRace = race;
  if (!race && !lines.children.length) hud.hidden = true;
  else if (race) hud.hidden = false;
  hud.classList.toggle('peek', !race);
  btn.hidden = !(race && Input.touchActive);
}, 200);

net.onChat = m => {
  if (!net.s) return;
  if (!m) { fillLog(); return; }   // the whole log (just joined)
  if (log && panel.isConnected) { const near = log.scrollHeight - log.scrollTop - log.clientHeight < 40; log.appendChild(lineEl(m)); if (near || m.id === net.s.me) log.scrollTop = log.scrollHeight; }
  if (m.id !== net.s.me) sfx.play('chat', 0.8);
  if (!hud) makeHud();
  if (inRace() || (!panelInView() && game.state !== 'menu')) { stackLine(m, typing); hud.hidden = false; hud.classList.toggle('peek', !inRace()); }
};
