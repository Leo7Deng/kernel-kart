// Kernel Kart: tunnels. A roof hides the road inside on screen (only your player tag shows), so you drive it from
// memory. Purely visual: the race and the bots treat the road as normal.
import { nearestS } from './race-mechanics.js';


// tunnels: [{ from, to, roof: [x, y, half-size] }] (layout units): the stretch under the roof, and the building over it
export function buildTunnels(T) {
  const sc = T.def.scale;
  return (T.def.tunnels || []).map(d => ({ s0: nearestS(T, d.from[0] * sc, d.from[1] * sc), s1: nearestS(T, d.to[0] * sc, d.to[1] * sc), x: d.roof[0] * sc, y: d.roof[1] * sc, half: d.roof[2] * sc }));
}
