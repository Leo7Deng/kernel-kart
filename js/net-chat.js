// The room's chat rules (DOM-free; screens: chat-ui.js). Players send { k: 'chat', text } to the host, which runs
// chatRequest (trimmed, CHAT_MAX chars, one per CHAT_GAP ms) and broadcasts { k: 'chat', m: { id, name, slot, text } };
// it keeps the last CHAT_KEEP lines for joiners ({ k: 'chatLog', log }). Text is only ever shown as text, never HTML.

export const CHAT_MAX = 120, CHAT_GAP = 700, CHAT_SLACK = 200, CHAT_KEEP = 50;
export const QUICK = ['gg', 'nice!', 'oops', 'rematch?'];   // the quick-chat buttons (chat-ui.js)

// one line of text: no control or direction-override characters, spaces collapsed, trimmed, at most CHAT_MAX characters
// (counted as characters, so an emoji isn't cut in half)
export function cleanChat(t) {
  if (typeof t !== 'string') return '';
  const s = t.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, CHAT_MAX).join('').trim();
}

// the host: player p says text at now (ms); slack forgives link jitter. { m } to send to everyone (already in room.chat),
// { wait } (too soon: dropped) or {} (nothing to say)
export function chatRequest(room, p, text, now, slack = 0) {
  const t = cleanChat(text); if (!t) return {};
  if (p.chatAt != null && now - p.chatAt < CHAT_GAP - slack) return { wait: CHAT_GAP - slack - (now - p.chatAt) };
  p.chatAt = now;
  const m = { id: p.id, name: Array.from(cleanChat(String(p.name || ''))).slice(0, 16).join('') || 'Player', slot: p.slot, text: t };
  addLine(room, m);
  return { m };
}
// a line from the host as a player gets it: checked again (the name and text are only ever shown as text anyway)
export function chatLine(m) {
  if (!m || typeof m !== 'object') return null;
  const text = cleanChat(m.text); if (!text) return null;
  return { id: Number.isInteger(m.id) ? m.id : -1, name: Array.from(cleanChat(String(m.name || ''))).slice(0, 16).join('') || 'Player', slot: Number.isInteger(m.slot) && m.slot >= 0 && m.slot < 4 ? m.slot : 0, text };
}
export function addLine(room, m) {
  const log = room.chat || (room.chat = []);
  log.push(m); if (log.length > CHAT_KEEP) log.splice(0, log.length - CHAT_KEEP);
}
// a line as it's drawn (doc: the page's document; the test hands it a stand-in): the name in the player's colour, then
// what they said, both set as text, so nothing anyone types is ever read as HTML or turned into a link
export function chatLineEl(doc, m, col, mine) {
  const d = doc.createElement('div'); d.className = 'chat-line' + (mine ? ' mine' : '');
  const n = doc.createElement('b'); n.className = 'chat-name'; n.textContent = m.name; n.style.color = col;
  const t = doc.createElement('span'); t.className = 'chat-text'; t.textContent = m.text;
  d.append(n, t); return d;
}
