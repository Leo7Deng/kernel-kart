// Kernel Kart art: the 3D bakery's worker (art/warm.js offThread). It builds a 3D mascot's mesh (art/model3d.js meshOf)
// or a 3D car's meshes and their frames' cuts (art/car3d.js carMesh), or a Fight prop's (art/prop3d.js propMesh) off the page's thread, and sends the vertex arrays
// back moved (transferred), so the page only draws them (WebGL stays on the page: Safari's workers can't all do it).
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
