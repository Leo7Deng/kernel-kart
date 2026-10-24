// Kernel Kart: jackpots. Clusters of golden boxes sit right on the inside edge at the apex of a corner, where only a
// tight line goes: lift early and the line tucks in onto them (the steering's reach, race.js), stay on the gas and you
// sail past in the middle. Drive through one and a slot machine spins over your kart: three reels stop one after
// another and pay out. Two alike: an item, as from any box. Three alike: the jackpot, an item in every free hand and a
// rush of coins (a short boost). A cobra on the reels: bust, nothing, and the kart coughs to a crawl for a moment.
// On average a golden box pays a little more than a plain one, so the lift is a fair bet: take it, or keep your speed.
// Bots go for it now and then, more the better they are and the further back they run.
import { clamp, frnd } from './core.js';
import { curvAt, halfWAt, wrapS } from './geometry.js';
import { nearestS } from './race-mechanics.js';


export const SPIN = 1.05, SHOW = 0.75, GOLD_BACK = 1.6, GOLD_R = 26;   // the reels spin this long, the result stays up this long; a golden box comes back after this and is this easy to touch (a plain one: 32)
export const REEL_STOP = [0.45, 0.75, 1.05];             // when each reel stops (from the pickup)
export const ODDS = { bust: 0.2, win: 0.45, jackpot: 0.35 };
// what each pays in speed (a boost for this long, s) besides the items, and how long a bust stalls you
export const PAY = { win: 0.7, jackpot: 1.6, bust: 0.2 };
// reel symbols: 0 scarab, 1 Eye of Horus, 2 ankh, 3 cobra (the bust)
export const COBRA = 3;

export function buildJackpots(T) {
  const sc = T.def.scale;
  return (T.def.jackpots || []).map(d => {
    const s = nearestS(T, d.at[0] * sc, d.at[1] * sc), n = d.n || 3, gap = d.gap || 46;
    let k = 0, kW = 1e-6; for (let ds = -220; ds <= 220; ds += 4) { const kk = curvAt(T, s + ds); k += kk; kW = Math.max(kW, Math.abs(kk)); }
    const side = Math.sign(k) || 1, hw = halfWAt(T, s), lat = side * (hw - (d.inset || 16));   // 16 in from the edge (was 6, right on the kerb: the user found them too hard to reach)
    // `gap` apart along the kerb they sit on (much tighter round the corner than the centreline is)
    const along = dir => { const out = [s]; let acc = 0; for (let q = s; out.length <= n; q += dir * 2) { acc += 2 * Math.abs(1 - curvAt(T, q) * lat); if (acc >= gap) { out.push(q); acc = 0; } } return out; };
    const fwd = along(1), back = along(-1), first = -Math.floor((n - 1) / 2);
    const boxes = []; for (let i = first; i < first + n; i++) boxes.push({ s: wrapS(T, i < 0 ? back[-i] : fwd[i]), lat });
    return { s, s0: boxes[0].s, s1: boxes[n - 1].s, side, lat, kW, hw, boxes };
  });
}

// three reel symbols that read as the outcome: three alike, two alike and one other, or a cobra in a mixed line
function reelsFor(out) {
  const a = Math.floor(frnd(0, 3)), b = (a + 1 + Math.floor(frnd(0, 2))) % 3;
  if (out === 'jackpot') return [a, a, a];
  if (out === 'win') { const odd = Math.floor(frnd(0, 3)); return [0, 1, 2].map(i => i === odd ? b : a); }
  const at = Math.floor(frnd(0, 3)); return [0, 1, 2].map(i => i === at ? COBRA : i % 2 ? a : b);   // bust
}
// car c drove through a golden box: the outcome is drawn now (from its own luck) and paid when the reels stop.
// roll(): an item as a plain box would roll it for this car (its place and gap, items/index.js)
export function jackpotSpin(c, roll) {
  const r = c.rng(), out = r < ODDS.bust ? 'bust' : r < ODDS.bust + ODDS.win ? 'win' : 'jackpot';
  const items = out === 'bust' ? [] : out === 'win' ? [roll()] : [roll(), roll()];
  c.slot = { t: SPIN, out, sym: reelsFor(out), items };
  this.fxRing(c.x, c.y, '#ffd54f', 50, 0.35, 5); this.fxStars(c.x, c.y, 6, '#ffd54f', 120, 0.5);
  this.sound('slotSpin', c, c.human ? 1 : 0.6);
}
// once a frame per car: run the reels down and pay out when the last one stops
export function jackpotCar(c, dt) {
  const S = c.slot; if (!S) return;
  const t0 = S.t; S.t -= dt;
  for (const at of REEL_STOP) { const u = SPIN - at; if (t0 > u && S.t <= u && at < SPIN) this.sound('reel', c, c.human ? 0.8 : 0.4); }
  if (t0 > 0 && S.t <= 0) {
    if (S.out === 'bust') {
      if (!(c.stall > 0)) c.stallBy = null; c.stall = Math.max(c.stall, PAY.bust);
      for (let k = 0; k < 6; k++) this.fxPuff(c.x + frnd(-18, 18), c.y + frnd(-18, 18), '#d9b97a', frnd(10, 16), 0.8, frnd(-50, 50), frnd(-60, 10));
      this.sound('bust', c, c.human ? 1 : 0.6);
    } else {
      for (const it of S.items) { if (!c.item) { c.item = it; c.itemT = 0; c.charges = 1; } else if (!c.item2) c.item2 = it; }
      c.boost = Math.max(c.boost, PAY[S.out]); c.speed = Math.max(c.speed, c.top * (S.out === 'jackpot' ? 1.1 : 1.04)); this.fxBoost(c);   // a rush of coins
      if (S.out === 'jackpot') { this.fxCoins(c.x, c.y, 18); this.fxRing(c.x, c.y, '#ffd54f', 90, 0.5, 7); this.sound('jackpot', c, c.human ? 1 : 0.6); }
      else { this.fxCoins(c.x, c.y, 6); this.sound('slotWin', c, c.human ? 1 : 0.6); }
    }
  }
  if (S.t < -SHOW) c.slot = null;
}

// a bot coming to a jackpot corner: going for it this lap (decided once per corner and lap, more often the better it
// drives, the further back it is and with both hands free) means arriving slow enough that the line is tucked right onto the golden boxes
export function jackpotAI(c, skill, brake, plan) {
  const T = c.T, M = T.mech; if (!M.jackpots.length || c.item2 || c.slot || c.finished) return;
  const nCars = this.cars.length, behind = nCars > 1 ? (c.rank - 1) / (nCars - 1) : 0;
  M.jackpots.forEach((J, k) => {
    let ds = J.s0 - c.s; if (ds < -T.L / 2) ds += T.L; if (ds > T.L / 2) ds -= T.L;
    if (ds > 1300 || ds < -(J.s1 - J.s0) - 40) return;
    const want = c.ai.jack || (c.ai.jack = {}), key = c.lap * 8 + k;
    if (want[key] === undefined) want[key] = c.rng() < clamp(0.1 + (skill - 0.92) * 1.6 + 0.5 * behind + (c.item ? 0 : 0.15), 0.1, 0.85);   // (more with both hands free: a jackpot fills both)
    if (!want[key]) return;
    const edgeIn = J.hw - c.W * 0.7, need = clamp((Math.abs(J.lat) - 22) / edgeIn, 0, 1);
    const v = Math.sqrt(Math.max(1, c.grip * 1.12 * (1 / J.kW - need * edgeIn) / 1.08));
    plan.caps.push({ ds: ds + (J.s - J.s0) - 170, v });   // tucked in by the middle box
  });
}
