// Kernel Kart art: the painter's worker (art/painter.js): the menu's big still pictures drawn off the page's thread
// (a preview takes 0.1-0.9 s in one go), with the page's drawing code (art/pictures.js, art/covers.js) on an
// OffscreenCanvas; document.createElement gives an OffscreenCanvas here. Text uses fallback fonts (no web fonts in a
// worker; tiny at a preview's size). The picture goes back as a transferred ImageBitmap, plus its encoded file for
// thumb-store.js when asked.
// Messages: { id, kind ('mini' | 'cover' | 'layer' | 'path': a layer's place and path only), name (track), look
// (settings.look), enc ('' or a type) } -> { id, pic, blob, box (a layer's place, size, ground and path) } or
// { id, err } (this browser can't draw here).
import { coverPicture } from './covers.js';
import { drawLayer, drawMini, layerBox, pathOf } from './pictures.js';
import { lookIs, setLook } from '../look.js';
import { buildTrack } from '../geometry.js';
import { TRACKS } from '../tracks.js';

// (nothing above makes a canvas as it loads, only when drawing: by then this is set)
if (typeof document === 'undefined') self.document = { createElement: () => new OffscreenCanvas(1, 1) };
let ok = null;
const can2d = () => { if (ok === null) try { ok = !!new OffscreenCanvas(1, 1).getContext('2d'); } catch (e) { ok = false; } return ok; };
self.onmessage = async e => {
  const { id, kind, name, look, enc } = e.data;
  try {
    if (!can2d()) { self.postMessage({ id, err: 'no 2d', dead: true }); return; }
    if (look && !lookIs(look)) setLook(look);
    const def = TRACKS.find(t => t.name === name);
    if (!def && kind !== 'cover') throw new Error('no track ' + name);
    let c, box = null;
    if (kind === 'mini') c = drawMini(def);
    else if (kind === 'cover') c = coverPicture(name);
    else if (kind === 'layer') c = drawLayer(def).canvas;
    else if (kind !== 'path') throw new Error('kind ' + kind);
    if (kind === 'layer' || kind === 'path') { const T = buildTrack(def), L = layerBox(T); box = { x: L.x, y: L.y, w: L.w, h: L.h, cw: L.cw, ch: L.ch, ground: L.ground, path: pathOf(T) }; }
    const blob = c && enc ? await c.convertToBlob({ type: enc, quality: 0.9 }).catch(() => null) : null;
    const pic = c ? c.transferToImageBitmap() : null;
    const moved = pic ? [pic] : []; if (box) moved.push(box.path.pts.buffer, box.path.tan.buffer, box.path.hw.buffer);
    self.postMessage({ id, pic, blob, box }, moved);
  } catch (err) { self.postMessage({ id, err: String(err && err.message || err) }); }
};
