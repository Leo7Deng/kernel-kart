// The menu's "Watch how" clips (shown by clip-ui.js): a real race on a fixed seed, one kart alone (no boxes, bits or
// items, drift on) driven by scripted keys, so it shows exactly what the game does. DOM-free: sim.test.mjs fails a clip
// that no longer does what it shows.
// A clip: racer, seed, `lap` (default 1) and keys by lap position s (negative: before the line, on the lap before):
// the bots' throttle until `press`, then flat out with drift held, let go `letGo` s after the sparks turn blue, the
// bots' throttle again from `until`. Shown from `from` until `tail` s after the kart is back from the secret. `say`
// holds each step's caption (run, press for pressFor, hold, blue for blueFor, let, taken, dive for diveT, back).
import { CHARACTERS, mulberry } from './core.js';
import { Input } from './input.js';
import { DRIFT } from './race-drift.js';
import { Race } from './race.js';
import { TRACKS } from './tracks.js';
import { sfx } from './audio.js';

export const CLIP_DT = 1 / 60;
export const CLIPS = {
  // Cron Canyon's mine on the drift alone (a mini-turbo counts as a boost): drift just before the Mesa Jump, turn in
  // early so the exit runs wide, let go at blue and the mini-turbo carries you onto the hot mine.
  'Cron Canyon': { text: 'No Turbo? Drift just before the Mesa Jump, keep the gas down and let go as the sparks turn blue: you run wide into the mine (not on Gopher, Ferris or Bugdroid).', title: 'The mine on a drift',
    racer: 'tux', seed: 1, from: 1250, press: 2230, letGo: 0.25, until: 3600, tail: 1.6,   // (Tux: every seed from press 2210-2250 and letGo 0.15-0.35)
    say: { run: 'Flat out down the East Straight to the Mesa Jump.', press: 'Drift just before the Mesa Jump, and hold it.', pressFor: 400, hold: 'Holding the drift, gas flat, into the Carousel.',
      blue: 'Blue sparks: let go!', let: 'Let go: the mini-turbo carries you wide, onto the mine.', taken: 'Still hot from the mini-turbo: down the mine.', back: 'Out of the portal: about 1 s up on the normal line.' } },
  // Pyth Plateau's phoenix on the drift alone, lap 3: drift the Temple Hairpin flat, let go at blue and the exit throws
  // you wide with the mini-turbo hot, onto the sun altar past the run-off.
  'Pyth Plateau': { text: 'No Turbo? On lap 3, keep the gas down into the Temple Hairpin, drift it and let go as the sparks turn blue: the mini-turbo throws you wide onto the sun altar.', title: 'The phoenix on a drift',
    racer: 'tux', seed: 1, lap: 3, from: -700, press: 220, letGo: 0.1, until: 1300, tail: 2,   // (Tux: every seed from press 200-230 and letGo 0-0.2)
    say: { run: 'Lap 3: flat out down the straight to the Temple Hairpin.', press: 'Keep the gas down and drift into the hairpin.', pressFor: 250, hold: 'Holding the drift round the hairpin.',
      blue: 'Blue sparks: let go!', blueFor: 0.35, let: 'Let go: the mini-turbo throws you wide, out to the sun altar.', taken: 'Still hot from the mini-turbo: up as the phoenix.', dive: 'Down like a meteor on the straight past the Carousel.', diveT: 1.2,
      back: 'Back on the road: about 2 s up on the normal line.' } },
};
export const clipOf = name => CLIPS[name] || null;

// where the kart is on the clip's lap (s), negative while it's still on the lap before (how far before the line), and
// -Infinity / Infinity further back or on
export function clipAt(k) {
  const c = k.car, lap = k.def.lap || 1;
  return c.lap === lap ? c.s : c.lap === lap - 1 ? c.s - c.T.L : c.lap < lap ? -Infinity : Infinity;
}

// a clip's race, built and run up to where it starts showing, on its own Math.random (restored after) so it plays the
// same every time
export function clipStart(def) {
  const ti = TRACKS.findIndex(t => t.name === def.track), k = { def, rand: mulberry(def.seed), f: 0, blueT: 0, letT: 0, takenT: 0, backT: 0, done: false, gas: false, drift: false };
  withClip(k, () => {
    k.race = new Race(ti, { racers: [{ ch: CHARACTERS.find(c => c.id === def.racer), human: true, pIndex: 0 }], laps: 3, aiLevel: 2, drift: true });
    k.race.boxes = []; k.race.bits = []; k.race.clip = true;   // (clip: render.js leaves the standings off)
  });
  k.car = k.race.cars[0]; k.car.ai.skill = 1.04;   // (its throttle, up to the press: the bots' at a sharp skill)
  // the run-up, not shown: the countdown as usual (and the laps before the clip's), so by the time it shows the start lights and keys are long gone
  while (clipAt(k) < def.from && k.f < 60 * 100) clipStep(k);
  return k;
}
// one fixed step of the clip: its keys, then the race
export function clipStep(k) {
  const { def, race: r, car: c } = k;
  withClip(k, () => {
    let gas = r.started ? r.aiThrottle(c, CLIP_DT, -1) : true;
    const at = clipAt(k), on = at >= def.press && at < def.until;
    if (on) gas = true;
    const drift = on && !k.letT && !(k.blueT && r.time >= k.blueT + def.letGo - 1e-9) && !(c.secretT > 0);
    k.gas = gas; k.drift = drift;
    const was = c.dOn, p0 = Input.pressed[0], d0 = Input.drift[0];
    Input.pressed[0] = gas; Input.drift[0] = drift;
    try { r.update(CLIP_DT); } finally { Input.pressed[0] = p0; Input.drift[0] = d0; }
    r.over = false; k.f++;
    if (c.dOn && !k.blueT && c.dCharge >= DRIFT.TIERS[0][0]) k.blueT = r.time;
    if (was && !c.dOn && !k.letT) k.letT = r.time;
    if (c.secretT > 0 && !k.takenT) k.takenT = r.time;
    if (k.takenT && !(c.secretT > 0) && !k.backT) k.backT = r.time;
    if ((k.backT && r.time >= k.backT + def.tail) || (!(c.secretT > 0) && clipAt(k) > def.until + 1500) || k.f > 60 * 120) k.done = true;
  });
}
// the clip's own luck and silence for the length of fn
function withClip(k, fn) {
  const rand = Math.random, play = sfx.play, tempo = sfx.tempo;
  Math.random = k.rand; sfx.play = () => {}; sfx.tempo = () => {};
  try { fn(); } finally { Math.random = rand; sfx.play = play; sfx.tempo = tempo; }
}
for (const [name, d] of Object.entries(CLIPS)) d.track = name;
