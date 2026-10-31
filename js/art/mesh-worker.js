// Kernel Kart art: the 3D bakery's worker (art/warm.js offThread): builds mascot meshes (model3d.js meshOf), car meshes
// and frame cuts (car3d.js carMesh) and Fight props (prop3d.js propMesh) off the page's thread, transferring the arrays
// back. WebGL stays on the page (Safari's workers can't all do it).
import { meshOf } from './model3d.js';
import { carMesh } from './car3d.js';
import { propMesh } from './prop3d.js';

const RUN = { mascot: (id, mood) => meshOf(id, mood), car: (ch, look, view) => carMesh(ch, look, view), prop: (id, st) => propMesh(id, st) };
self.onmessage = e => {
  const { id, kind, args } = e.data;
  try {
    const r = RUN[kind](...args), moved = Object.values(r).filter(v => v instanceof Float32Array).map(v => v.buffer);
    self.postMessage({ id, r }, moved);
  } catch (err) { self.postMessage({ id, err: String(err) }); }
};
