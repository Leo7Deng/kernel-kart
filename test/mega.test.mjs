// node test/mega.test.mjs: the Mega Duck is comically large, solid where it's drawn, and never walls off the road.
import { loadSim } from './harness.mjs';

const sim = await loadSim(), fails = [];   // load the game first: item modules are only safe to import after the registry
const { placeMega, laneLeft, MEGA_R } = await import('../js/items/mega.js');
const { STEP } = await import('../js/core.js');
const { halfWAt, trackSample } = await import('../js/geometry.js');
let n = 0, sizes = [];
const check = (ok, msg) => { n++; if (!ok) fails.push(msg); };

// placement on every track, every 150 units, both sides of the road
for (let ti = 0; ti < sim.TRACKS.length; ti++) {
  const race = new sim.Race(ti, { racers: [{ ch: sim.CHARACTERS[0], human: false, pIndex: 0 }], laps: 3, aiLevel: 1 });
  for (const T of race.routes) for (let s0 = 0; s0 < T.L; s0 += 150) for (const side of [-1, 1]) for (const size of [1, 1.35]) {
    const { s, lat, r } = placeMega(T, s0, side, size), hw = halfWAt(T, s), where = `${sim.TRACKS[ti].name} s=${s} side=${side}`;
    const lane = hw + (side * lat - r);                           // from the far edge to the duck's inner edge
    check(lane >= 62, `${where}: open lane ${lane.toFixed(0)} < 62`);   // the widest kart (48) plus a little room
    { const p = trackSample(T, s), left = laneLeft(T, s, p.x + p.nx * lat, p.y + p.ny * lat, r);   // nowhere along this stretch is the road shut
      check(left >= 60 || r <= 60, `${where}: road nearly shut by r=${r.toFixed(0)} (gap ${left.toFixed(0)})`); }
    const p = trackSample(T, s), cx = p.x + p.nx * lat, cy = p.y + p.ny * lat;
    for (let i = 0; i < T.N; i += 4) {                            // never over another stretch of road
      let ds = i * STEP - s; if (!T.open) ds = ((ds % T.L) + T.L * 1.5) % T.L - T.L / 2;
      const q = T.pts[i];
      if (Math.abs(ds) < 1.5 * Math.hypot(q[0] - p.x, q[1] - p.y) + 150) continue;   // the same stretch of road
      const gap = Math.hypot(q[0] - cx, q[1] - cy) - T.hw[i];
      if (gap < r) { check(false, `${where}: radius ${r.toFixed(0)} reaches road at s=${i * STEP} (gap ${gap.toFixed(0)})`); break; }
    }
    sizes.push(r);
  }
}
sizes.sort((a, b) => a - b);
const median = sizes[sizes.length >> 1];
check(median >= 180, `median radius ${median.toFixed(0)} should be comically large (>= 180; up to ${MEGA_R} where the track leaves room)`);

// solid: a kart driving into it is stopped at its edge and slowed
{
  const race = new sim.Race(0, { racers: [{ ch: sim.CHARACTERS[1], human: false, pIndex: 0 }], laps: 1, aiLevel: 1 });
  race.time = 1; const car = race.cars[0]; car.x = 0; car.y = 0; car.heading = 0; car.speed = 300;
  race.megas.push({ T: race.track, s: 0, lat: 0, x: 250, y: 0, r: 240, life: 9, age: 0, ang: 0 });
  sim.ITEMS.mega.updateWorld(race, 1 / 60);
  check(Math.hypot(car.x - 250, car.y) >= 240 + car.W * 0.55 - 0.01, `kart inside the duck's drawn radius after a bump`);
  check(car.speed < 300, `kart not slowed by the bump (${car.speed})`);
}
// fast-forward pops it
{
  const race = new sim.Race(0, { racers: [{ ch: sim.CHARACTERS[0], human: false, pIndex: 0 }], laps: 1, aiLevel: 1 });
  const car = race.cars[0]; car.x = 0; car.y = 0; car.ff = 2;
  race.megas.push({ T: race.track, s: 0, lat: 0, x: 100, y: 0, r: 200, life: 9, age: 0, ang: 0 });
  sim.ITEMS.mega.updateWorld(race, 1 / 60);
  check(race.megas.length === 0 || race.megas[0].life <= 0.15, `fast-forward didn't pop it`);
}
console.log(`${n} checks; duck radius on the road: min ${sizes[0].toFixed(0)}, median ${median.toFixed(0)}, max ${sizes[sizes.length - 1].toFixed(0)}`);
if (fails.length) { console.error([...new Set(fails)].slice(0, 15).map(f => 'FAIL ' + f).join('\n') + (fails.length > 15 ? `\n… ${fails.length - 15} more` : '')); process.exit(1); }
console.log('ok');
