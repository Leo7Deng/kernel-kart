// Kernel Kart's logo, as inline SVG (crisp at any size, nothing to draw on a canvas): KERNEL over a big KART in chunky
// italic letters with a thick ink outline, a red extrusion and a glossy gradient, speed lines trailing off the K, a
// chequered ribbon under it, and a terminal prompt chip (>_) in front of KERNEL for the "kernel". The lettering uses the
// page's Bungee font; textLength pins each word's width, so the layout holds even before the font has loaded.
// On the menu it bobs gently and a shine sweeps across it now and then (style.css .kk-logo; off with reduced motion).
// The flat looks (js/look.js) restyle it through its classes (look-flat.css: flat fills, no gloss, shine or bob;
// look-modern.css and look-racing.css / look-premium.css: the look's own lettering, no extrusion or gloss).
let uid = 0;
const FONT = 'font-family="Bungee, Fredoka, sans-serif"';
// a word: [x, baseline, size, width, text]
const KERNEL = [150, 98, 86, 400, 'KERNEL'], KART = [64, 226, 146, 494, 'KART'];
const word = ([x, y, size, len, txt], paint = '') => `<text x="${x}" y="${y}" font-size="${size}" textLength="${len}" lengthAdjust="spacingAndGlyphs" ${paint}>${txt}</text>`;
// the extrusion: the word stacked down-right a step at a time (the deepest first)
const extrude = (w, col, n, dx, dy) => Array.from({ length: n }, (_, i) => word(w, `transform="translate(${((n - i) * dx).toFixed(1)} ${((n - i) * dy).toFixed(1)})" fill="${col}" stroke="${col}" stroke-width="13"`)).join('');
// the chequered ribbon's squares (two rows)
const SQ = [];
for (let c = 0; c < 28; c++) for (let r = 0; r < 2; r++) if ((c + r) % 2 === 0) SQ.push(`<rect x="${92 + c * 17.5}" y="${239 + r * 12}" width="17.5" height="12"/>`);
const RIBBON = 'M100 239h476l-11 24H89z';

// o: { cls (extra classes), title (for screen readers), anim (false: no shine, bob or blink) }
export function logoSvg(o = {}) {
  const id = 'kkl' + (++uid), cls = 'kk-logo' + (o.anim === false ? ' still' : '') + (o.cls ? ' ' + o.cls : '');
  return `<svg class="${cls}" viewBox="0 0 640 282" role="img" aria-label="${o.title || 'Kernel Kart'}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".52" stop-color="#f1f3ff"/><stop offset=".53" stop-color="#d3d9f7"/><stop offset="1" stop-color="#aab4e6"/></linearGradient>
    <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff38a"/><stop offset=".46" stop-color="#ffc523"/><stop offset=".47" stop-color="#ffa514"/><stop offset="1" stop-color="#ff5520"/></linearGradient>
    <linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff2e63" stop-opacity="0"/><stop offset=".3" stop-color="#ff2e63"/><stop offset="1" stop-color="#ff7a2e"/></linearGradient>
    <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id}t" gradientUnits="userSpaceOnUse" x1="-6" y1="0" x2="54" y2="0"><stop offset="0" stop-color="#7fe3ff" stop-opacity="0"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
    <clipPath id="${id}c">${word(KERNEL, FONT)}${word(KART, FONT)}</clipPath>
    <clipPath id="${id}b"><path d="${RIBBON}"/></clipPath>
  </defs>
  <g class="kk-bob"><g transform="translate(34 0) skewX(-11)">
    <path class="kk-swoosh" d="M26 250C150 276 420 276 608 236l-9 22C420 294 150 294 16 270z" fill="url(#${id}r)"/>
    <path class="kk-rib" d="${RIBBON}" fill="#fff"/><g class="kk-sq" clip-path="url(#${id}b)" fill="#14102a">${SQ.join('')}</g>
    <path d="${RIBBON}" fill="none" stroke="#14102a" stroke-width="5" stroke-linejoin="round"/>
    <g stroke-linecap="round" fill="none" stroke="url(#${id}t)" class="kk-speed"><path d="M2 134H52" stroke-width="10"/><path d="M22 166H50" stroke-width="7"/><path d="M-6 198H46" stroke-width="12"/></g>
    <g ${FONT} stroke-linejoin="round">
      <g class="kk-ex">${extrude(KERNEL, '#7d1626', 6, 1.1, 1.5)}${extrude(KART, '#8a1f12', 8, 1.3, 1.9)}</g>
      ${word(KERNEL, 'class="kk-ol" fill="none" stroke="#14102a" stroke-width="15"')}${word(KART, 'class="kk-ol" fill="none" stroke="#14102a" stroke-width="18"')}
      ${word(KERNEL, `class="kk-w" fill="url(#${id}w)"`)}${word(KART, `class="kk-g" fill="url(#${id}g)"`)}
    </g>
    <g class="kk-gloss" clip-path="url(#${id}c)">
      <rect x="0" y="26" width="640" height="30" fill="#fff" opacity=".22"/><rect x="0" y="104" width="640" height="50" fill="#fff" opacity=".2"/>
      <rect class="kk-shine" x="-200" y="0" width="120" height="282" fill="url(#${id}s)"/>
    </g>
    <g transform="translate(26 22) rotate(-3)">
      <g fill="#ffc523" stroke="#14102a" stroke-width="2.5">${[0, 1, 2].map(i => `<rect x="-10" y="${14 + i * 17}" width="14" height="8" rx="2.5"/><rect x="95" y="${14 + i * 17}" width="14" height="8" rx="2.5"/>`).join('')}</g>
      <rect x="0" y="0" width="99" height="76" rx="15" fill="#14102a"/><rect x="4.5" y="4.5" width="90" height="67" rx="11" fill="#2a8a5c"/><rect x="9" y="9" width="81" height="58" rx="8" fill="#0c2a1f"/>
      <path d="M22 24l18 14-18 14" fill="none" stroke="#5dffa6" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round"/>
      <rect class="kk-cursor" x="47" y="46" width="30" height="8.5" rx="2" fill="#5dffa6"/>
      <rect x="9" y="9" width="81" height="17" rx="8" fill="#fff" opacity=".08"/>
    </g>
  </g></g></svg>`;
}

// the favicon / app icon (favicon.svg is the same picture): the chip with a bold K and a chequered strip. Paths only: a
// standalone SVG can't load the page's fonts.
export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8a3d"/><stop offset="1" stop-color="#e0263a"/></linearGradient><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff38a"/><stop offset=".5" stop-color="#ffc523"/><stop offset="1" stop-color="#ff8a12"/></linearGradient></defs><g fill="#ffc523" stroke="#14102a" stroke-width="1.5"><rect x="1" y="16" width="8" height="6" rx="2"/><rect x="1" y="29" width="8" height="6" rx="2"/><rect x="1" y="42" width="8" height="6" rx="2"/><rect x="55" y="16" width="8" height="6" rx="2"/><rect x="55" y="29" width="8" height="6" rx="2"/><rect x="55" y="42" width="8" height="6" rx="2"/></g><rect x="5" y="5" width="54" height="54" rx="13" fill="#14102a"/><rect x="8" y="8" width="48" height="48" rx="10" fill="url(#a)"/><path d="M8 46h48v4a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6z" fill="#fff"/><g fill="#14102a"><rect x="8" y="46" width="6" height="5"/><rect x="20" y="46" width="6" height="5"/><rect x="32" y="46" width="6" height="5"/><rect x="44" y="46" width="6" height="5"/><rect x="14" y="51" width="6" height="5"/><rect x="26" y="51" width="6" height="5"/><rect x="38" y="51" width="6" height="5"/><rect x="50" y="51" width="6" height="5"/></g><path d="M22 12h10.5l-2.4 11L41 12h12.5L38 27.5 46.5 42h-12l-5-9.6-2.5 9.6H16.5z" fill="url(#b)" stroke="#14102a" stroke-width="3" stroke-linejoin="round"/><rect x="8" y="8" width="48" height="12" rx="6" fill="#fff" opacity=".14"/></svg>`;
