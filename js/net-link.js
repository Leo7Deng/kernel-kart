// Kernel Kart online: how good each player's link is, so a slow race can be put down to the Wi-Fi. DOM-free.
//   In the room: each player's heartbeat (net.js, { k: 'hb', t, rtt }) is answered at once by the host ({ k: 'pong', t }),
//   which gives the player its round trip; the next heartbeat carries it to the host, which sends everyone's
//   ({ k: 'pings', p: [[id, ms]...] }, at most every PING_GAP): net-ui.js draws a chip per player (linkChip).
//   In a race: a player's screen judges its own link from the host's snapshots (net-sync.js clientSync stats: how long
//   since the last one, how far behind it draws the others); render.js shows an icon while it's poor (drawLinkIcon).
export const PING_GAP = 1500;
// a round trip (ms) as a level: 3 good, 2 fair, 1 poor, 0 not known
export const linkLevel = ms => ms == null || !(ms >= 0) ? 0 : ms < 90 ? 3 : ms < 220 ? 2 : 1;
const WORD = ['Not measured yet', 'Slow link', 'Fair link', 'Good link'];
const COL = ['#8f8bb8', '#ff5d5d', '#ffb02e', '#3fd28a'];
// the room's chip: three bars, the round trip in ms
export function linkChip(ms) {
  const lv = linkLevel(ms), bars = [1, 2, 3].map(i => `<rect x="${i * 6 - 4}" y="${14 - i * 4}" width="4" height="${i * 4}" rx="1.2" fill="${lv && i <= lv ? COL[lv] : 'rgba(255,255,255,.22)'}"/>`).join('');
  const t = lv ? `${Math.round(ms)} ms` : '…';
  return `<span class="np-link lv${lv}" title="${WORD[lv]}${lv ? `: ${Math.round(ms)} ms there and back` : ''}" aria-label="${WORD[lv]}${lv ? `, ${Math.round(ms)} milliseconds` : ''}"><svg viewBox="0 0 16 14" aria-hidden="true">${bars}</svg>${t}</span>`;
}
// a player's own link in a race, from the snapshots: { stale (s since the last), delay (s the others are drawn behind) }.
// Poor when they stop coming for half a second or arrive so unevenly the others are drawn 0.3 s behind; once poor it
// stays so for 2 s after it recovers, so the icon doesn't flicker
export function raceLink() {
  let poorUntil = -1;
  return (stats, now) => {
    if (!stats || stats.at == null) return 3;
    const bad = now - stats.at > 0.5 || stats.delay > 0.3;
    if (bad) poorUntil = now + 2;
    return now < poorUntil ? 1 : 3;
  };
}
// the race HUD's icon for a poor link: a Wi-Fi sign with one bar lit, in a dark pill (cx, cy its middle)
export function drawLinkIcon(ctx, cx, cy, panel = 'rgba(10,8,30,0.72)', t = 0) {
  ctx.save(); ctx.translate(cx, cy);
  ctx.fillStyle = panel; ctx.beginPath(); ctx.roundRect(-24, -17, 48, 34, 17); ctx.fill();
  ctx.lineCap = 'round'; ctx.lineWidth = 3.4;
  for (let i = 1; i <= 3; i++) { ctx.strokeStyle = i === 1 ? COL[1] : 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(0, 9, i * 6, -Math.PI * 0.78, -Math.PI * 0.22); ctx.stroke(); }
  ctx.fillStyle = COL[1]; ctx.globalAlpha = 0.65 + 0.35 * Math.sin(t * 6); ctx.beginPath(); ctx.arc(0, 9, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
