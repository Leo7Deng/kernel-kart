// The "Front-runner" meter under a track's Show more (ui.js trackText): how hard the leader is to catch there, 0-10,
// with the reason in a line. The numbers are measured by test/frontrun.mjs (npm run frontrun) into js/frontrun-data.js.
import DATA from './frontrun-data.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// the meter's HTML for track t ('' if it hasn't been measured): ten pips, the score and the reason
export function frontrunHTML(t) {
  const d = DATA[t.name]; if (!d) return '';
  const on = Math.round(d.score), word = d.score >= 6.5 ? 'the leader is hard to catch' : d.score >= 3.5 ? 'the lead can go either way' : 'the pack catches up';
  const pips = Array.from({ length: 10 }, (_, i) => `<i${i < on ? ' class="on"' : ''}></i>`).join('');
  const tip = `Front-runner ${d.score.toFixed(1)} of 10 (likely ${d.lo.toFixed(1)}-${d.hi.toFixed(1)}): ${word}.${d.provisional ? ' Provisional: this track is being reworked.' : ''}`;
  return `<span class="fr" title="${esc(tip)}"><span class="fr-top"><span class="fr-k">Front-runner</span><span class="fr-m" role="meter" aria-label="Front-runner" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${d.score}">${pips}</span><b>${d.score.toFixed(1)}</b>${d.provisional ? '<span class="fr-p">provisional</span>' : ''}</span><span class="fr-why">${esc(d.reason)}</span></span>`;
}
