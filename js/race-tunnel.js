// Kernel Kart: tunnels. The road runs through a building (a temple) and its roof hides the road inside: on screen you see
// the roof and your own player tag moving across it, but not the bends or the other karts. So the call is made from
// memory: lift where you know the bend is, or carry speed and hope. It's only what you can see: the race runs the road
// in there as it does anywhere else, and the bots (who don't look at the screen) drive it as normal.
import { nearestS } from './race-mechanics.js';


// tunnels: [{ from, to, roof: [x, y, half-size] }] (layout units): the stretch under the roof, and the building over it
export function buildTunnels(T) {
  const sc = T.def.scale;
  return (T.def.tunnels || []).map(d => ({ s0: nearestS(T, d.from[0] * sc, d.from[1] * sc), s1: nearestS(T, d.to[0] * sc, d.to[1] * sc), x: d.roof[0] * sc, y: d.roof[1] * sc, half: d.roof[2] * sc }));
}
