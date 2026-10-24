// Kernel Kart art: the painter's worker (art/painter.js asks it): the menu's big still pictures drawn here, off the
// page's thread, so the menu never stalls while one is drawn (a track's preview takes 0.1-0.9 s in one go, a backdrop
// layer 0.1-0.2 s; several times that on an iPad). The same drawing code as the page (art/pictures.js, art/covers.js)
// onto an OffscreenCanvas; a picture goes back as an ImageBitmap (moved, not copied), with its encoded file for the
// store of drawn pictures (thumb-store.js) when one's asked for, encoded here too. The art modules ask for a canvas
// with document.createElement in places: here that's an OffscreenCanvas. Text is drawn in the fallback fonts (a worker
// doesn't have the page's web fonts; at a preview's size the few words on a track are a few pixels high).
// Messages: { id, kind ('mini' | 'cover' | 'layer', or 'path': a layer's place and path without its picture), name (the
// track's), look (settings.look), enc ('' or a type to encode it as) } -> { id, pic (ImageBitmap), blob, box (a layer's
// place in the world, its size, ground and path: art/pictures.js) } or { id, err } (dead: this browser can't draw here).
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
