// Fight mode's bots: fightAI(fight, i, rng) returns fighter i's held input for this step, like a player's.
//
// They react at human speed (the user: "the bot difficulties react way faster than a human"): a bot decides from what
// the foe was doing a moment ago (`see` s, plus up to `seeJit`, rolled again each think: a ring of the foe's last steps
// on fight.ai[i], perceive()), its own state it knows at once, and where the foe is it follows closer (`track` s behind,
// carried on by their walk). So a move has to have been on screen for its reaction time before the bot answers it: a jab
// or a tapped heavy whose startup is shorter can't be blocked on sight, only on a read (`guess`: up close to a foe who's
// been swinging it guards before seeing anything). Something new seen (a wind-up, a charge, a whiff, a block...) makes
// it think again once it's seen; otherwise it thinks every `think` s (plus up to `jitter`). Its own light landing it
// feels a little quicker (`feel` x its lag) before it confirms it into a heavy or special.
//
// What it does (2026-10-23, Fight became a real fight: js/fight.js's header): it blocks front-on and turns into a foe
// stepping round it (lets go of the guard a moment to turn, `turn`); a slow wind-up seen in its reach gets a jab into it
// (a counter hit, `ctr`), a step out of its reach (`stepOut`) or a block; it punishes a whiff off the swing seen and its
// frame data (`punish`); it confirms a landed light into its heavy or special (`confirm`); a turtle gets stepped round
// and hit from the side (`flank`) or kept under pressure until it gasses out (`pressure`); it minds its own stamina
// (`stamCare`: backs off to breathe when it's low) and pushes a tired foe (`gasPush`); it stays off walls (`edge`: circles
// or steps out when pinned) and stands on the foe's open side so knockbacks drive them into one; the longer-armed one
// keeps just outside the other's reach (`space`). Levels 0 Chill, 1 Normal, 2 Ruthless differ in that speed a little and
// more in how often they make each of those choices.
// Memory lives on fight.ai[i] as plain data; randomness only from rng (the bot's own stream, seeded from the fight's seed).
import { clearance, heatState, rayClear, sd, solidBetween } from './fight-arenas.js';
import { armorOf } from './fight-chars.js';
import { KITS, countering, crates } from './fight-kits.js';
import { plugOf } from './kits/index.js';
//
// Tux and Duke (three big moves each, 2026-10-23: kitBot below): every level sees and thinks at the same human speed
// (the user: levels differ in decisions, not speed). They answer each move's tell once it's been on screen for their
// reaction time: out of the toboggan's line (or a block front-on, to punish him lying there), out of the iceberg's
// shadow, the time-stop ring and the geyser's mark, turned to the portal's mark and blocking (or a step away), a block or
// a step against a sliding penguin (or a step through a waddling one). They punish a recovery or a freeze with whatever
// lands in the time left, use all three moves in the open by range and the foe's guard, keep their stamina for them, and
// mind the walls. `answer` (how often a tell is answered), `smart` (the better answer: a block that leaves the toboggan
// open...), `punish`, `combo`, `rate` (how keen on moves), `steer` (the toboggan steered at them) and `stamCare` differ
// by level.
export const LV = [   // per level (exported for tuning scripts)
  { see: 0.3, seeJit: 0.1, track: 0.12, think: 0.22, jitter: 0.1, feel: 0.5, guess: 0.04, block: 0.4, stepOut: 0.15, ctr: 0.08, punish: 0.25, confirm: 0.25, flank: 0.08,
    guardUp: 0.65, pressure: 0.18, gasPush: 0.3, stamCare: 0.3, edge: 0.6, aggro: 0.16, space: 0.3, turn: 0.25, combo: 0.3, armor: 0.3, kit: 0.8, charge: 0.25,
    answer: 0.45, smart: 0.2, rate: 0.6, steer: 0.3 },
  { see: 0.3, seeJit: 0.1, track: 0.12, think: 0.22, jitter: 0.1, feel: 0.45, guess: 0.08, block: 0.55, stepOut: 0.28, ctr: 0.3, punish: 0.6, confirm: 0.6, flank: 0.18,
    guardUp: 0.85, pressure: 0.25, gasPush: 0.6, stamCare: 0.65, edge: 0.8, aggro: 0.2, space: 0.55, turn: 0.55, combo: 0.65, armor: 0.65, kit: 1, charge: 0.45,
    answer: 0.72, smart: 0.5, rate: 0.85, steer: 0.7 },
  { see: 0.3, seeJit: 0.1, track: 0.12, think: 0.22, jitter: 0.1, feel: 0.4, guess: 0.12, block: 0.7, stepOut: 0.4, ctr: 0.45, punish: 0.85, confirm: 0.75, flank: 0.22,
    guardUp: 0.95, pressure: 0.32, gasPush: 0.7, stamCare: 0.9, edge: 1, aggro: 0.2, space: 0.75, turn: 0.85, combo: 0.9, armor: 0.95, kit: 1.15, charge: 0.6,
    answer: 0.9, smart: 0.8, rate: 1, steer: 1 },
];
const KEYS = ['light', 'heavy', 'special', 'guard'];
const SEEN = 48;                   // the foe's last 48 steps (0.8 s): what the bot can be seeing now
const WALKING = new Set(['idle', 'walk', 'block', 'charge', 'step']);   // (where the foe is now: where it was plus its walk since)
// what's worth a second look the moment it's seen (a walk or a stop isn't)
const NOTICE = new Set(['wind', 'charge', 'strike', 'recover', 'block', 'step', 'grab', 'hurt', 'stagger', 'down', 'getup', 'dizzy', 'frozen', 'float', 'grabbed']);
const HELPLESS = new Set(['hurt', 'stagger', 'dizzy', 'frozen', 'float', 'grabbed']);
const snap = (o, T) => ({ T, x: o.x, y: o.y, z: o.z, vx: o.vx, vy: o.vy, state: o.state, move: o.move, t: o.t, dur: o.dur, charge: o.charge, under: o.under, spCd: o.spCd,
  meter: o.meter, face: o.face, bat: o.bat, stam: o.stam, gassed: o.gassed, stepCd: o.stepCd, guardArc: o.guardArc, stepAtk: o.stepAtk, ph: o.ph, gone: o.gone, air: o.air, ev: o.ev, cd: o.cd ? [...o.cd] : null });
// the reach of someone's jab (the three-move fighters have none: a short stand-in, for the old bots' spacing)
const jabReach = st => st.moves.light1 ? st.moves.light1.reach : 26;

// the foe as the bot sees it now: the step from m.lag ago (never older than the last one it saw), with `age` (how old)
// and `left` (its state's time left, by now); its position carried on by its walk since
function perceive(F, m, o, L) {
  if (!m.seen || m.rnd !== F.round) { m.seen = []; m.sk = 0; m.rnd = F.round; m.pT = -1; }
  const s = snap(o, F.time);
  if (m.seen.length < SEEN) m.seen.push(s); else { m.seen[m.sk] = s; m.sk = (m.sk + 1) % SEEN; }
  const want = Math.max(F.time - m.lag, m.pT) + 1e-9, wantP = F.time - L.track + 1e-9;
  let e = null, p = null, old = null;
  for (const q of m.seen) {
    if (q.T <= want && (!e || q.T > e.T)) e = q;
    if (q.T <= wantP && (!p || q.T > p.T)) p = q;
    if (!old || q.T < old.T) old = q;
  }
  if (!e) e = old; if (!p) p = old;   // (the round just began: the first look)
  m.pT = e.T;
  const age = F.time - e.T, pa = F.time - p.T, P = { ...e, stats: o.stats, r: o.r, i: o.i, age, pAge: pa, left: e.dur - e.t - age };
  P.x = p.x; P.y = p.y; P.z = p.z; P.vx = p.vx; P.vy = p.vy;
  if (WALKING.has(p.state)) { P.x += p.vx * pa; P.y += p.vy * pa; }
  // a move seen (its wind-up, its swing or its recovery): by the frame data, how long until they're free again (`after`)
  // and whether by now it's over and they're stuck in its recovery (`stuck`: we know it didn't hit us)
  const mv = e.move && o.stats.moves[e.move], rec = mv ? mv.recovery || 0 : 0;
  P.after = e.state === 'recover' ? P.left : !mv || mv.do === 'counter' ? -1 : e.state === 'strike' ? P.left + rec : e.state === 'wind' ? P.left + (mv.active || 0) + rec : -1;
  P.stuck = P.after > 0 && P.after <= rec + 1e-6;
  return P;
}

export function fightAI(F, i, rng) {
  const m = F.ai[i], me = F.f[i], live = F.f[1 - i], L = LV[F.cfg.bots[i] ?? 1] || LV[1], M = me.stats.moves;
  if (!m.init) Object.assign(m, { init: 1, next: 0, mx: 0, my: 0, hold: { light: 0, heavy: 0, special: 0, guard: 0 }, queue: { light: 0, heavy: 0, special: 0, guard: 0 },
    last: { light: false, heavy: false, special: false, guard: false }, chain: 0, range: 0, hideT: 0, hx: 0, hy: 0, lag: L.see + rng() * L.seeJit, nk: '', heat: 0, spHeat: 0,
    plan: '', inT: 0, hurtT: 0, confFor: '', confT: -1, confGo: false, stepNow: 0, stepDir: 0, bpress: 0, turnT: 0 });
  const o = perceive(F, m, live, L);   // (the foe, a moment late)
  const hpSum = me.hp + live.hp; if (hpSum !== m.hpS || m.hpT == null || F.phase === 'intro') { m.hpS = hpSum; m.hpT = F.time; }
  const tap = (k, n = 2) => { m.queue[k] = n; };
  const hold = (k, n) => { if (m.hold[k] > 0) m.hold[k] = Math.max(m.hold[k], n); else m.queue[k] = n; };
  const block = n => { if (!(m.hold.guard > 0) && !m.last.guard) m.bpress = 1; m.stepNow = 0; hold('guard', n); };   // (pressed with no direction: a block, not a step)
  // a string of lights: the rest of the chain, or one or two then the heavy if it lands
  const string = () => { m.confGo = rng() < L.confirm; m.chain = m.confGo ? (rng() < 0.5 ? 1 : 0) : rng() < L.combo ? fullChain(me) : rng() < 0.5 ? 1 : 0; tap('light', 2); };
  const cs = F.objs.length ? crates(F) : null, A = cs && cs.length ? { ...F.A, solids: [...F.A.solids, ...cs] } : F.A;
  const dx = o.x - me.x, dy = o.y - me.y, dist = Math.hypot(dx, dy) || 1, gap = dist - me.r - o.r, toFoe = Math.atan2(dy, dx);
  // the walls: how much room we have and which way is open (away from the nearest wall, leaning toward the middle)
  const cl = clearance(A, me.x, me.y, me.r), dc = Math.hypot(me.x, me.y) || 1, wk = clamp01(1 - cl.d / 90);
  const toC = Math.atan2(-me.y / dc * (1 - wk) + cl.ny * wk * 1.5, -me.x / dc * (1 - wk) + cl.nx * wk * 1.5);
  const g = { A, cl, dist, gap, toFoe, toC, string };
  let mx = m.mx, my = m.my;
  // something new seen (a wind-up, a charge, a whiff...): think again now. A foe swinging up close warms up the guesses
  const start = Math.round((o.T - o.t) * 60), nk = o.state + ':' + o.move + ':' + start;
  m.heat *= 0.994; m.spHeat *= 0.997;   // (halve in about two and four seconds)
  if (nk !== m.nk) {
    m.nk = nk;
    if (NOTICE.has(o.state)) m.next = Math.min(m.next, F.time);
    if ((o.state === 'wind' || o.state === 'charge') && gap < jabReach(o.stats) + 30) m.heat += 1;
    if (o.state === 'wind' && o.move === 'special') m.spHeat += 1;
  }

  if (me.state === 'grab') {
    // Pyth's coil: toss them toward the nearest wall (the foe in our coils: where it really is)
    const oc = clearance(A, live.x, live.y, live.r);
    if (oc.d < 160) { mx = -oc.nx; my = -oc.ny; } else { mx = Math.cos(me.face); my = Math.sin(me.face); }
  } else if (['grabbed', 'hurt', 'stagger', 'frozen', 'dizzy', 'ko', 'win', 'down', 'getup', 'float'].includes(me.state)) {
    mx = 0; my = 0; m.chain = 0; m.plan = ''; m.confGo = false; m.hurtT = F.time + 0.6; m.next = Math.min(m.next, F.time + 0.05);
  } else if (me.stats.kit3) {
    [mx, my] = kitBot(F, i, m, me, o, L, rng, tap, hold, block, g, mx, my);   // (Tux and Duke: three moves, below)
  } else {
    if (/^light/.test(me.move || '') && (me.state === 'strike' || me.state === 'recover')) {
      // a landed light, felt: into the heavy (or a special that's quick up close); else keep tapping through the chain
      const key = me.move + ':' + Math.round(me.mt * 60 - F.time * 60);
      if (me.conf && m.confFor !== key) { m.confFor = key; m.confT = F.time; }
      if (me.conf && m.confGo && m.confFor === key && F.time - m.confT >= m.lag * L.feel) {
        m.confGo = false; m.chain = 0;
        const sp = M.special, spOk = me.spCd <= 0 && me.lockT <= 0 && (!me.stats.battery || me.bat >= 1) && CONFIRM_SP.has(sp.do) && rng() < 0.4;
        tap(spOk ? 'special' : 'heavy', 2); mx = Math.cos(toFoe); my = Math.sin(toFoe);
      } else if (m.chain > 0 && chainable(me) && m.chainFor !== me.move && !m.last.light && !m.hold.light) { tap('light', 1); m.chain--; m.chainFor = me.move; }
    }
    if (!/^light/.test(me.move || '')) m.chainFor = null;
    // a charged heavy: let go once they're in its range (and up)
    if (me.state === 'charge' && me.charge > 0.3 + 0.4 * L.charge * (o.state === 'idle' || o.state === 'walk' ? 0 : 1) && o.state !== 'down' && o.state !== 'getup' && inHeavyRange(me, o, gap, dist)) m.hold.heavy = 0;
    // a step: a light at its end (round a blocker into their side), or during it (a forward step: a lunging jab), buffered
    if (me.state === 'step' && m.plan === 'flank' && me.t > me.dur - 0.1) { m.plan = ''; string(); }
    if (me.state === 'step' && m.plan === 'lunge' && me.t > 0.05) { m.plan = ''; string(); }
    if (me.state === 'recover' && me.move === 'special' && m.plan === 'blink' && me.t > me.dur - 0.12) { m.plan = ''; string(); }
    // blocking: let go to turn into someone stepping round us (a guard turns slowly)
    if (me.state === 'block' && me.stun <= 0) {
      const off = Math.abs(angDiff(toFoe, me.face));
      if (off > 0.8 * me.guardArc && m.turnT <= F.time && o.state !== 'strike') { m.turnT = F.time + 0.4; if (rng() < L.turn) { m.hold.guard = 0; m.queue.guard = 0; } }
    }
    const free = me.state === 'idle' || me.state === 'walk' || (me.state === 'block' && me.stun <= 0);
    if (free) {
      const r = react(F, i, m, me, o, L, M, rng, tap, hold, block, g);
      if (r) [mx, my] = r;
      else if (F.time >= m.next) {
        m.next = F.time + L.think + rng() * L.jitter; m.lag = L.see + rng() * L.seeJit;
        [mx, my] = decide(F, i, m, me, o, L, M, rng, tap, hold, block, g);
      }
    }
  }
  m.mx = mx; m.my = my;   // (what we want; the steering below is redone every step)
  if (me.z <= 0 && (me.state === 'idle' || me.state === 'walk' || me.state === 'block')) {
    // off a heat vent that's about to flare (or burning), the sooner the better the bot
    for (const h of A.hazards) if (h.kind === 'heat') {
      const s = heatState(h, F.rt), [d, gx, gy] = sd(h, me.x, me.y);
      if ((s === 2 || s > 0.35) && d < me.r + 18) { const w = L.edge; mx = mx * (1 - w) + gx * w; my = my * (1 - w) + gy * w; }
    }
    [mx, my] = steer(A, me, i, mx, my);   // round the pillars and crates, not into them
  }
  // never walk into a wall (the sim stops you, but don't push into it)
  if (me.z <= 0 && cl.d < 6) { const into = -(mx * cl.nx + my * cl.ny); if (into > 0) { mx += into * cl.nx; my += into * cl.ny; } }
  const out = { x: mx, y: my, light: false, heavy: false, special: false, guard: false };
  for (const k of KEYS) {
    if (m.hold[k] > 0) { out[k] = true; m.hold[k]--; }
    else if (m.queue[k] > 0 && !m.last[k]) { out[k] = true; m.hold[k] = m.queue[k] - 1; m.queue[k] = 0; }
    m.last[k] = out[k];
  }
  // the guard's press: a block with no direction held, a step with its way
  if (out.guard && m.stepNow) { out.x = Math.cos(m.stepDir); out.y = Math.sin(m.stepDir); m.stepNow = 0; m.bpress = 0; }
  else if (out.guard && m.bpress) { out.x = 0; out.y = 0; m.bpress = 0; }
  return out;
}

// the specials worth cancelling a landed light into (quick, right there)
const CONFIRM_SP = new Set(['zap', 'dive', 'dig']);
// seconds until the foe's melee move could land on us (by now, off what we saw), or null: nothing coming, or we're out
// of its reach (with a lunge's, a hop's or a slide's travel)
function incoming(o, me, gap) {
  if (!o.move || !(o.state === 'wind' || o.state === 'charge' || o.state === 'strike')) return null;
  const mv = o.stats.moves[o.move]; if (!mv || !mv.contact) return null;
  if (o.state === 'strike' && !(o.move === 'heavy' && mv.hop) && !mv.speed) return null;
  const travel = mv.lunge ? mv.lunge * mv.active * 0.7 : mv.hop ? mv.hop * 1.3 : mv.speed ? mv.speed * mv.active : 0;
  if (gap > (mv.reach || 0) + travel + (o.stepAtk ? 14 : 0) + 6) return null;
  const lunge = mv.speed ? gap / mv.speed : mv.hop ? mv.active : 0.03;
  if (o.state === 'charge') return Math.max(0.05, mv.maxCharge * (1 - o.charge)) + lunge;   // (they could let go any moment)
  if (o.state === 'wind') return o.left + lunge;
  return mv.hop ? o.left : gap / mv.speed;
}

const chainable = f => /^light\d$/.test(f.move || '') && +f.move.slice(5) < (f.stats.chain || 3);
const fullChain = f => (f.stats.chain || 3) - 1;   // (presses after the first)
function inHeavyRange(me, o, gap, dist) {
  const h = me.stats.moves.heavy;
  if (h.hop) return dist > 10 && dist < h.hop * (1 + 0.3 * me.charge) + h.reach + o.r - 6 && o.z < 10;
  return gap < h.lunge * (1 + 0.3 * me.charge) * h.active + h.reach - 8 && o.z < 10;
}
function heavySafe(A, me, a) {   // a hop forward (Tux's belly flop): not straight into a wall or a solid
  const h = me.stats.moves.heavy; if (!h.hop) return true;
  return rayClear(A, me.x, me.y, a, h.hop, me.r * 0.6, -4);
}
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const unit = a => [Math.cos(a), Math.sin(a)];
// the foe (as seen) winding up something with armor that soaks a light
const armored = o => !!(o.move && (o.state === 'wind' || o.state === 'charge') && armorOf(o, 1));

// walking (mx, my): a solid just ahead turns the walk along its side (the side the walk already leans to; head-on, a
// fixed side per fighter), easing off it as we get close
function steer(A, me, i, mx, my) {
  const mag = Math.hypot(mx, my); if (mag < 0.1 || !A.solids.length) return [mx, my];
  const ux = mx / mag, uy = my / mag, ahead = me.r + 22;
  const c = clearance(A, me.x + ux * ahead, me.y + uy * ahead, me.r, true);
  if (c.d > 6) return [mx, my];
  let tx = -c.ny, ty = c.nx; const dot = tx * ux + ty * uy;
  if (Math.abs(dot) < 0.15) { if (i) { tx = -tx; ty = -ty; } } else if (dot < 0) { tx = -tx; ty = -ty; }
  const push = clamp01((6 - c.d) / 24) * 0.7, sx = tx + c.nx * push, sy = ty + c.ny * push, l = Math.hypot(sx, sy) || 1;
  return [sx / l * mag, sy / l * mag];
}
// a step that way (an angle) on the next guard press
function stepTo(m, tap, a) { m.stepNow = 1; m.stepDir = a; m.bpress = 0; m.hold.guard = 0; tap('guard', 2); return unit(a); }
// of two ways to step, the one with room (off the walls)
const roomier = (A, me, a1, a2) => rayClear(A, me.x, me.y, a1, 80, me.r) || !rayClear(A, me.x, me.y, a2, 80, me.r) ? a1 : a2;

// every step while free, off what's been seen: a whiff to punish, a hit coming (jab into a slow wind-up, step out of a
// heavy's reach, or block it), a read, the kits' threats. Returns a walk (the keys already queued) or null
function react(F, i, m, me, o, L, M, rng, tap, hold, block, g) {
  const { A, gap, toFoe, string } = g;
  const lightT = M.light1.startup + M.light1.active * 0.5, myReach = M.light1.reach + 4;
  // a whiff seen (stuck in its recovery), with time left to land something: a heavy, a jab, or a step in and a lunging jab
  if (o.stuck && m.punFor !== m.nk && gap < myReach + 60 && o.z < 10) {
    m.punFor = m.nk;
    if (rng() < L.punish) {
      const close = gap < myReach;
      if (o.after > M.heavy.startup + 0.1 && inHeavyRange(me, o, gap, g.dist) && heavySafe(A, me, toFoe) && rng() < 0.45) { m.hold.guard = 0; tap('heavy', 2); return unit(toFoe); }
      if (close && o.after > lightT) { m.hold.guard = 0; string(); return unit(toFoe); }
      if (!close && o.after > lightT + 0.12 && me.stepCd <= 0 && me.stam > 0.2) { m.plan = 'lunge'; return stepTo(m, tap, toFoe); }
    }
  }
  // a hit seen coming at us
  const t = incoming(o, me, gap), key = 'h' + m.nk;
  if (t != null && m.thrFor !== key) {
    m.thrFor = key;
    const om = o.stats.moves[o.move], heavyish = o.move === 'heavy' || o.move === 'special' || o.move === 'super';
    if (t < 0.03) return null;   // (too late: it's as good as landed)
    // a slow wind-up in our reach, not armored: jab into it (a counter hit)
    if (o.state !== 'strike' && t > lightT + 0.03 && gap < myReach - 2 && !armored(o) && rng() < L.ctr * (heavyish ? 1.3 : 0.5)) { m.hold.guard = 0; string(); return unit(toFoe); }
    // Ferris: his Borrow Checker up in time to catch it (the stance is up 3 frames in, for 0.55 s; from in front only)
    if (M.special.do === 'counter' && t > M.special.startup + 0.02 && t < 0.5 && me.spCd <= 0 && me.lockT <= 0 && rng() < L.ctr + 0.15) { m.hold.guard = 0; tap('special', 2); return unit(toFoe); }
    // a heavy one, with time: step out of its reach (sideways off a lunge, back off a flop)
    if (heavyish && t > 0.1 && me.stepCd <= 0 && me.stam > 0.15 && rng() < L.stepOut) {
      const side = toFoe + (rng() < 0.5 ? 1 : -1) * Math.PI / 2;
      return stepTo(m, tap, om.hop ? roomier(A, me, toFoe + Math.PI, side) : roomier(A, me, side, side + Math.PI));
    }
    if (rng() < L.block * (me.stam < 0.2 ? 0.6 : 1)) { block(Math.round((t + (om.active || 0.1) + 0.12) * 60)); return [0, 0]; }
  }
  // a read: a foe who's been swinging up close gets guarded against before anything is seen
  if (me.state !== 'block' && gap < jabReach(o.stats) + 6 && (o.state === 'idle' || o.state === 'walk') && m.guessFor !== m.nk) {
    m.guessFor = m.nk;
    if (rng() < L.guess * Math.min(3, m.heat)) {
      if (M.special.do === 'counter' && me.spCd <= 0 && me.lockT <= 0 && rng() < 0.4) { tap('special', 2); return unit(toFoe); }   // (Ferris: the stance on a read)
      block(14 + (rng() * 10 | 0)); return [0, 0];
    }
  }
  return kitThreat(F, i, m, me, o, L, M, rng, tap, hold, block, g);
}

// thought out every `think` s: where to stand, what to throw out
function decide(F, i, m, me, o, L, M, rng, tap, hold, block, g) {
  const { A, cl, dist, gap, toFoe, toC, string } = g;
  let mx = 0, my = 0;
  const lightReach = M.light1.reach, foeReach = jabReach(o.stats);
  const outreach = lightReach > foeReach + 8;   // the longer arms: fight from where only you can hit (Duke on Tux)
  const edgeZone = 20 + 40 * L.edge + (F.phase === 'sudden' ? 15 : 0);
  const tired = me.gassed > 0 || (me.stam < 0.25 + 0.15 * L.stamCare && rng() < L.stamCare);
  const push = (o.gassed > 0 || o.stam < 0.3) && rng() < L.gasPush;   // (a tired foe: keep at them)
  // where to stand: on the open side of the foe (away from the wall nearest them), so hits drive them into it
  const oc = clearance(A, o.x, o.y, o.r), od = Math.hypot(o.x, o.y) || 1, ow = clamp01(1 - oc.d / 160);
  let sx = -o.x / od * (1 - ow) + oc.nx * ow, sy = -o.y / od * (1 - ow) + oc.ny * ow, sl = Math.hypot(sx, sy);
  if (od < 40 && ow < 0.3 || sl < 0.2) { sx = -Math.cos(toFoe); sy = -Math.sin(toFoe); sl = 1; }
  sx = sx / sl * 0.35 - Math.cos(toFoe) * 0.65; sy = sy / sl * 0.35 - Math.sin(toFoe) * 0.65; sl = Math.hypot(sx, sy) || 1;   // (mostly the side we're on: not running round them)
  // footsies: wait just outside their reach (the longer arms: inside your own), go in now and then (m.inT: walking in
  // to hit), breathe further out when tired
  const calm = clamp01((F.time - m.hpT - 2) / 4);   // (nobody hurt for a while: someone has to go in)
  if (m.inT <= F.time && (o.state === 'idle' || o.state === 'walk' || o.state === 'block') && rng() < L.aggro * 0.25 + (push ? 0.3 : 0) + calm * 0.5) m.inT = F.time + 0.5 + rng() * 0.4;
  const goIn = m.inT > F.time;
  const want = tired && !push ? me.r + o.r + foeReach + 40
    : me.r + o.r + (goIn ? lightReach * 0.5 : outreach ? (lightReach + foeReach) / 2 + 2 : foeReach + 10);
  const tx = o.x + sx / sl * want, ty = o.y + sy / sl * want;
  const goTo = (x, y) => { const ddx = x - me.x, ddy = y - me.y, d = Math.hypot(ddx, ddy); return d < 4 ? [0, 0] : [ddx / d, ddy / d]; };
  [mx, my] = goTo(tx, ty);
  // pinned against a wall with the foe on the open side: circle out round him (or step out) rather than backing into it
  let edgy = false;
  const pinned = (cl.nx * (o.x - me.x) + cl.ny * (o.y - me.y)) / dist > 0.2;
  if (cl.d < edgeZone && pinned) {
    const [cx, cy] = unit(toC);
    let tA = toC + Math.PI / 2; if (Math.cos(tA) * (o.x - me.x) + Math.sin(tA) * (o.y - me.y) > 0) tA += Math.PI;   // the side away from the foe
    const w = clamp01((edgeZone - cl.d) / edgeZone) * L.edge;
    if (w > 0.5 && gap < 50 && me.stepCd <= 0 && me.stam > 0.25 && rng() < L.edge * 0.5) return stepTo(m, tap, Math.atan2(cy * 0.5 + Math.sin(tA), cx * 0.5 + Math.cos(tA)));
    mx = mx * (1 - w) + (cx * 0.6 + Math.cos(tA)) * (0.4 + w); my = my * (1 - w) + (cy * 0.6 + Math.sin(tA)) * (0.4 + w);
    edgy = w > 0.5;
  }
  if (me.state === 'block' && m.hold.guard <= 0) return [mx, my];   // (letting go of a block from before)

  // supers
  if (F.cfg.supers && M.super && me.meter >= 1 && me.lockT <= 0 && superNow(M.super, me, o, dist, gap)) { tap('special', 2); m.chain = 0; return [0, 0]; }
  // a helpless foe (stunned, frozen, afloat, yanked in, staggered): a charged heavy if there's time, else a string
  if (HELPLESS.has(o.state) && o.left > 0.12 && o.z < 30) {
    if (o.left > M.heavy.startup + 0.25 && inHeavyRange(me, o, gap, dist) && heavySafe(A, me, toFoe)) { hold('heavy', Math.max(1, Math.round(Math.min(M.heavy.maxCharge, o.left - M.heavy.startup - 0.1) * 60))); return unit(toFoe); }
    if (gap < lightReach + 2) { tap('light', 1); m.chain = fullChain(me); m.confGo = false; return unit(toFoe); }
    return goTo(o.x, o.y);
  }
  if (o.state === 'down' || o.state === 'getup') return [mx, my];   // (stand ready on their open side)
  if (tired && !push) return [mx, my];   // (breathe: keep away until it's back)
  // Ferris holding his Borrow Checker: don't hit into it. Step round it, or wait it out
  if (countering(o) && gap < lightReach + 30 && rng() < L.armor) {
    if (me.stepCd <= 0 && rng() < L.flank) { m.plan = 'flank'; return stepTo(m, tap, roomier(A, me, toFoe + 1.3, toFoe - 1.3)); }
    return [-Math.cos(toFoe) * 0.4, -Math.sin(toFoe) * 0.4];
  }
  // a blocker: step round to their side and hit them there, or keep the pressure on until they gas out
  if (o.state === 'block' && gap < lightReach + 24) {
    const round = Math.abs(angDiff(Math.atan2(me.y - o.y, me.x - o.x), o.face)) > (o.guardArc || 1.2) * 0.9;
    if (round && gap < lightReach + 2) { tap('light', 1); m.chain = fullChain(me); return unit(toFoe); }   // (already round it)
    if (me.stepCd <= 0 && me.stam > 0.3 && rng() < L.flank) { m.plan = 'flank'; return stepTo(m, tap, roomier(A, me, toFoe + 1.25, toFoe - 1.25)); }
    if (gap < lightReach + 2 && (push || rng() < L.pressure)) { string(); return unit(toFoe); }
    if (gap >= lightReach + 2) return goTo(o.x, o.y);
    return [mx * 0.3, my * 0.3];
  }
  if (edgy && gap > lightReach) return [mx, my];   // first get off the wall
  if (outreach && gap < foeReach + 4 && o.z < 10 && (o.state === 'idle' || o.state === 'walk') && !edgy && rng() < L.space) {
    // inside the foe's reach: back out (and a little toward the middle) before poking again
    m.next = Math.min(m.next, F.time + 0.07);
    const [ax, ay] = unit(toFoe); return [-ax * 0.9 + Math.cos(toC) * 0.3, -ay * 0.9 + Math.sin(toC) * 0.3];
  }
  // the foe winding up with armor that soaks a jab: no jabbing into it. Step out, or hold back and block it
  if (armored(o) && gap < lightReach + 40 && rng() < L.armor) {
    if (me.stepCd <= 0 && rng() < 0.5) return stepTo(m, tap, roomier(A, me, toFoe + Math.PI, toFoe + Math.PI / 2));
    block(30); return [0, 0];
  }
  // in their reach and they're free to swing: the guard up now and then (a decision, not a reaction: their jab is
  // quicker than anyone can see), more so just after being hit or when we're behind on stamina
  if (gap < foeReach + 6 && o.z < 10 && (o.state === 'idle' || o.state === 'walk' || o.state === 'step') && rng() < L.guardUp * (m.hurtT > F.time ? 1.6 : 1) * (me.stam < o.stam - 0.2 ? 1.3 : 1)) {
    block(24 + (rng() * 36 | 0)); return [0, 0];
  }
  // in reach: a poke, a string, a heavy, a kit move up close (going in: likely; else now and then, or back out)
  if (gap < lightReach + 2 && o.z < 10) {
    if (rng() > (goIn ? 0.75 : L.aggro * 0.3) + (push ? 0.25 : 0)) {   // not now: back out to where we wait (behind the guard, often)
      if (gap < foeReach + 4 && rng() < L.guardUp * 0.6) { block(20 + (rng() * 24 | 0)); return [0, 0]; }
      return [mx, my];
    }
    m.inT = 0;
    { const k = kitClose(F, i, m, me, o, L, M, rng, tap, hold, g); if (k) return k; }
    if (rng() < 0.68) { string(); return unit(toFoe); }
    if (inHeavyRange(me, o, gap, dist) && heavySafe(A, me, toFoe)) { hold('heavy', 1 + (rng() < L.charge ? rng() * 20 | 0 : 0)); return unit(toFoe); }
    string(); return unit(toFoe);
  }
  // mid range
  if (o.z < 10) {
    // a forward step into a lunging jab from just outside reach
    if (gap > lightReach + 4 && gap < lightReach + 70 && me.stepCd <= 0 && me.stam > 0.35 && (o.state === 'idle' || o.state === 'walk') && rng() < 0.18 * L.aggro) { m.plan = 'lunge'; return stepTo(m, tap, toFoe); }
    { const k = kitSpecial(F, i, m, me, o, L, M, rng, tap, hold, g); if (k) return k; }
    if (inHeavyRange(me, o, gap, dist) && gap > 20 && heavySafe(A, me, toFoe) && rng() < 0.2 * L.aggro) { hold('heavy', 1 + (rng() < L.charge ? rng() * 30 | 0 : 0)); return unit(toFoe); }
  }
  return [mx, my];
}

// ---------------------------------------------------------------- the kits (js/fight-kits.js)
// when a super is worth firing (its do), from how far they are
function superNow(sv, me, o, dist, gap) {
  if (o.state === 'down' || o.state === 'getup') return false;
  switch (sv.do) {
    case 'swarm': return dist > 50 && dist < 230;
    case 'own': return dist < sv.range - 10 || (o.meter || 0) > 0.5;
    case 'lift': return dist < sv.range - 20 && o.z < 10;
    case 'spin': return gap < 22;
    case 'compose': return dist < 260 && o.z < 10;
    case 'chain': return dist > 30 && dist < 230;
    case 'ub': return gap < 70;
    case 'field': return dist < 250 && o.z < 10;
  }
  return gap < 60;
}
// the foe's kit coming at us (seen): what to do (a walk to take, the keys already queued), or null
function kitThreat(F, i, m, me, o, L, M, rng, tap, hold, block, g) {
  const { A, dist, gap, toFoe, toC } = g, om = o.move && o.stats.moves[o.move], od = om && om.do;
  const away = (x, y, w = 0.4) => { const a = Math.atan2(me.y - y, me.x - x); return [Math.cos(a) + Math.cos(toC) * w, Math.sin(a) + Math.sin(toC) * w]; };
  const sideStep = () => { const s = toFoe + Math.PI / 2; return stepTo(m, tap, roomier(A, me, s, s + Math.PI)); };
  for (const b of F.objs) {
    if (b.owner === i || b.t < o.age) continue;   // (not seen yet)
    // a Boot Loop under us: out of it before it stuns (the sooner the better the bot)
    if (b.kind === 'field' && Math.hypot(me.x - b.x, me.y - b.y) < b.r + 10 && rng() < 0.35 + 0.5 * L.edge) return away(b.x, b.y);
    // a container's shadow on us: out from under it
    if (b.kind === 'crate' && b.z > 0 && b.aimed && b.t >= b.wait && Math.max(Math.abs(me.x - b.x), Math.abs(me.y - b.y)) < b.w / 2 + me.r + 6 && rng() < L.block + 0.3) return away(b.x, b.y, 0.2);
  }
  // the little Tuxes and gophers coming: block them (or step)
  const near = F.objs.find(b => b.kind === 'gorou' && b.owner !== i && !b.hit && b.t >= Math.max(o.age, b.wait || 0) && Math.hypot(b.x - me.x, b.y - me.y) < 60);
  if (near && m.objFor !== near.id) { m.objFor = near.id; if (rng() < L.block) { if (me.stepCd <= 0 && rng() < 0.4) return sideStep(); block(18); return [0, 0]; } }
  const tk = 'k' + m.nk; if (m.kitFor === tk) return null;
  // Gopher tunnelling at us: step aside as he comes up, or block the pop
  if (o.under && dist < 64) {
    m.kitFor = tk;
    if (rng() < L.block) { if (me.stepCd <= 0 && rng() < 0.55) return sideStep(); block(18); return [0, 0]; }
  }
  // a coil, a tentacle or a zap winding up with us in its reach: step out of it (the coil can't be blocked), or block
  if (o.state === 'wind' && (od === 'coil' || od === 'pull' || od === 'zap') && gap < om.reach + 12 && o.left > 0.04) {
    m.kitFor = tk;
    if (rng() < L.block + 0.1) {
      if (me.stepCd <= 0 && (od === 'coil' || rng() < L.stepOut)) return sideStep();
      if (od !== 'coil') { block(16); return [0, 0]; }
    }
  }
  // Merge Conflict spinning at us: out of its way (or block it up close)
  if (o.state === 'strike' && od === 'spin' && dist < 120) {
    m.kitFor = tk;
    if (rng() < L.block + 0.2) { if (gap < 14) { block(14); return [0, 0]; } return away(o.x, o.y); }
  }
  return null;
}
const SPECIAL_RATE = { dig: 0.2, coil: 0.3, pull: 0.3, crate: 0.2, dive: 0.28, blink: 0.22, zap: 0.32 };
// the special in the open, mid range (and a container to shove at them)
function kitSpecial(F, i, m, me, o, L, M, rng, tap, hold, g) {
  const sp = M.special, { A, dist, gap, toFoe } = g;
  if (sp.do === 'crate') {   // one of ours between us and them: shove it at them
    for (const b of F.objs) if (b.kind === 'crate' && b.z <= 0 && b.owner === i) {
      const [bd] = sd(b, me.x, me.y), ba = Math.atan2(b.y - me.y, b.x - me.x), od = Math.hypot(o.x - b.x, o.y - b.y);
      if (bd - me.r < M.light1.reach && Math.abs(angDiff(ba, toFoe)) < 0.35 && od < 170 && Math.hypot(b.x - me.x, b.y - me.y) < dist && rng() < 0.6) { tap('light', 1); return unit(ba); }
    }
  }
  if (me.spCd > 0 || me.lockT > 0 || (me.stats.battery && me.bat < 1) || o.z >= 10 || o.state === 'ko' || o.state === 'down' || o.state === 'getup') return null;
  if (countering(o) && sp.do !== 'coil' && sp.do !== 'crate' && sp.do !== 'blink' && rng() < L.armor) return null;   // (not into a Borrow Checker; the coil wraps it)
  const go = rng() < (SPECIAL_RATE[sp.do] || 0.2) * L.kit, at = unit(toFoe);
  switch (sp.do) {
    case 'dig': if (dist > 70 && dist < 230 && go) { tap('special', 2); return at; } break;
    case 'coil': if (gap > 16 && gap < sp.reach - 6 && o.state !== 'strike' && (go || (o.state === 'block' && rng() < 0.5))) { tap('special', 2); return at; } break;
    case 'pull': if (gap > 34 && gap < sp.reach - 8 && !solidBetween(A, me.x, me.y, o.x, o.y) && go) { tap('special', 2); return at; } break;
    case 'crate': if (dist > 70 && dist < 200 && go && !F.objs.some(b => b.kind === 'crate' && b.owner === i && Math.hypot(b.x - me.x, b.y - me.y) < 70)) { tap('special', 2); return at; } break;
    case 'dive': if (dist > 60 && dist < 220 && rayClear(A, me.x, me.y, toFoe, dist - o.r - me.r, me.r * 0.8) && go) { tap('special', 2); return at; } break;
    case 'blink': if (dist > 50 && dist < 120 && go) { tap('special', 2); m.plan = 'blink'; return at; } break;   // (past them: then a string into their back)
    case 'zap': if (gap > 12 && gap < sp.reach - 8 && go) { tap('special', 2); return at; } break;
  }
  return null;
}
// up close: the kits that are best in someone's face (a zap, the coil on a blocker, a blink out from a wall)
function kitClose(F, i, m, me, o, L, M, rng, tap, hold, g) {
  const sp = M.special, { toFoe, cl, toC } = g;
  if (me.spCd > 0 || me.lockT > 0 || (me.stats.battery && me.bat < 1)) return null;
  if (sp.do === 'zap' && rng() < 0.25 * L.kit) { tap('special', 2); return unit(toFoe); }
  if (sp.do === 'coil' && o.state === 'block' && rng() < 0.5 * L.kit) { tap('special', 2); return unit(toFoe); }
  if (sp.do === 'blink' && cl.d < 40 && rng() < 0.35 * L.kit) { tap('special', 2); return [Math.cos(toC), Math.sin(toC)]; }   // (pinned: out past them)
  if (sp.do === 'dig' && cl.d < 40 && rng() < 0.2 * L.kit) { tap('special', 2); return [0, 0]; }
  return null;
}

// ---------------------------------------------------------------- Tux and Duke (three moves and an evade each: fight-kits.js)
const CDK = ['move1', 'move2', 'move3', 'evade'];   // (fighter.cd's order)
const KEY = { move1: 'light', move2: 'heavy', move3: 'special', evade: 'guard' };
const BUSY = new Set(['wind', 'recover', 'hurt', 'stagger', 'dizzy', 'frozen']);   // (the foe can't walk off right now)
// fighter i's held input as a three-move bot: in a move, the stick that aims or steers it; free, an answer to what's
// coming (walking off it, or the evade timed to it), a punish timed to the foe's opening, or (every think) where to
// stand and which move to throw out. Returns the walk (the keys already queued)
function kitBot(F, i, m, me, o, L, rng, tap, hold, block, g, mx, my) {
  const K = m.k3 || (m.k3 = { ans: {}, steer: false, aimT: 0 });
  const MP = plugOf(me); PC = MP || plugOf(F.f[1 - i]) ? plugCtx(F, i, m, me, o, L, rng, tap, hold, block, K, g) : null;   // (a plug-in fighter: its own bot hooks, js/kits/<id>.js ai)
  if (MP && me.move && (me.state === 'wind' || me.state === 'strike')) return (MP.ai && MP.ai.stick && MP.ai.stick(F, i, me, o, PC)) || [0, 0];
  if (me.move && (me.state === 'wind' || me.state === 'strike')) return moveStick(F, i, m, me, o, L, rng, K, g);
  if (me.ph === 'shatter' && me.state === 'recover') return shattered(F, i, m, me, L, rng, tap, K, g);
  if (!(me.state === 'idle' || me.state === 'walk')) return [0, 0];
  const t = answer(F, i, m, me, o, L, rng, tap, K, g); if (t) return t;
  const p = punishK(F, i, m, me, o, L, rng, tap, K, g); if (p) return p;
  if (F.time >= m.next) {
    m.next = F.time + L.think + rng() * L.jitter; m.lag = L.see + rng() * L.seeJit;
    for (const k in K.ans) if (!F.objs.some(b => b.id === +k.slice(1))) delete K.ans[k];   // (the answers to things that are gone)
    return neutral(F, i, m, me, o, L, rng, tap, K, g);
  }
  return [mx, my];
}
// Tux's ice just shattered on them (felt at once, it's ours): the shards stagger them right there, so the toboggan (or a
// fork) goes in, pressed now and buffered through the short shake-off
function shattered(F, i, m, me, L, rng, tap, K, g) {
  if (K.shatFor === me.ms) return [0, 0];
  K.shatFor = me.ms;
  const o = F.f[1 - i], toO = Math.atan2(o.y - me.y, o.x - me.x), dist = Math.hypot(o.x - me.x, o.y - me.y);
  if (o.state !== 'stagger' || rng() >= 0.35 + 0.6 * L.combo) return [0, 0];
  if (ready(F, me, 0) && rayClear(g.A, me.x, me.y, toO, Math.max(0, dist - o.r - me.r), me.r * 0.8)) { fire(tap, 0, 3); return unit(toO); }
  if (ready(F, me, 2)) { fire(tap, 2, 3); return [0, 0]; }
  return [0, 0];
}
// one of ours ready (k 0..2 the moves, 3 the evade): off cooldown, its kit willing (one fork / geyser at a time, a
// Garbage Collect charge left)
function ready(F, me, k) {
  const mv = me.stats.moves[CDK[k]];
  if (!mv || me.cd[k] > 0) return false;
  if (me.lockT > 0 && k < 3) return false;   // (locked by Ferris's Ownership Lock: the evade only)
  const MP = plugOf(me); if (MP) { const Kt = KITS[mv.do]; return !(Kt && Kt.can && !Kt.can(F, me, mv)) && !(MP.ai && MP.ai.ready && !MP.ai.ready(F, me, k, mv)); }
  if (mv.do === 'fork' && F.objs.some(b => b.kind === 'peng' && b.owner === me.i && b.t < b.life)) return false;
  if (mv.do === 'geyser' && F.objs.some(b => b.kind === 'geyser' && b.owner === me.i && b.t < b.life)) return false;
  if (mv.do === 'gc' && !(me.ev >= 1)) return false;
  return true;
}
const fire = (tap, k, n = 2) => tap(KEY[CDK[k]], n);
// the evade, with the way held (Duke blinks that way; Tux just freezes)
const evade = (m, tap, a) => stepTo(m, tap, a);
// in a move: the toboggan steered (and aimed in its crouch) at them, the iceberg's shadow and the geyser's mark moved
// onto where they'll be (and the geyser let go once it's there)
function moveStick(F, i, m, me, o, L, rng, K, g) {
  const mv = me.stats.moves[me.move];
  if (K.steerFor !== me.ms) { K.steerFor = me.ms; K.steer = rng() < L.steer; }   // (decided as it starts)
  const toO = Math.atan2(o.y - me.y, o.x - me.x);
  if (mv.do === 'toboggan') return me.state === 'wind' || K.steer ? unit(toO) : [0, 0];
  const lead = s => [o.x + o.vx * s, o.y + o.vy * s];   // (where they'll be in s, walking on)
  if (mv.do === 'iceberg') {
    const sh = F.objs.find(b => b.kind === 'shadow' && b.owner === i); if (!sh) return [0, 0];
    const left = me.state === 'wind' ? me.dur - me.t + mv.active - mv.drop : Math.max(0, me.dur - mv.drop - me.t);
    const [tx, ty] = lead(Math.min(0.5, left) * 0.6), dx = tx - sh.x, dy = ty - sh.y, d = Math.hypot(dx, dy);
    return d < 6 ? [0, 0] : [dx / d * Math.min(1, d / 20), dy / d * Math.min(1, d / 20)];
  }
  if (mv.do === 'geyser' && me.state === 'wind') {
    const gz = F.objs.find(b => b.kind === 'geyser' && b.owner === i && b.ph === 'aim'); if (!gz) { m.hold.special = 0; return [0, 0]; }
    // where they'll be when it blows (a little, they see it coming), nudged toward the open side: it throws them at the wall
    const oc = clearance(g.A, o.x, o.y, o.r), [lx, ly] = lead(0.35);
    const tx = lx - oc.nx * (oc.d < 80 ? 10 : 0), ty = ly - oc.ny * (oc.d < 80 ? 10 : 0), dx = tx - gz.x, dy = ty - gz.y, d = Math.hypot(dx, dy);
    if (d < 10 || F.time > K.aimT) { m.hold.special = 0; m.queue.special = 0; return [0, 0]; }
    return [dx / d, dy / d];
  }
  return [0, 0];
}
// answers to the foe's tells, seen (on screen for our reaction time). Each threat: when it lands (T s from now), how
// long it lasts, the way out and how far that is. Decided once each: walk off it, walk and evade if that won't make it,
// evade (timed: Tux's ice up just before it lands and through it; Duke's blink just before), or (missed) nothing.
// The most urgent one is answered. Returns the walk, or null
function answer(F, i, m, me, o, L, rng, tap, K, g) {
  const { toC, cl } = g, E = me.stats.moves.evade, W = 150 * me.stats.walk, tux = me.id === 'tux';
  const off = a => { const w = clamp01(1 - cl.d / 70) * 0.8; const x = Math.cos(a) + Math.cos(toC) * w, y = Math.sin(a) + Math.sin(toC) * w, l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
  const away = b => Math.atan2(me.y - b.y, me.x - b.x);
  const th = [];   // [key, T, dur, way out, how far]
  for (const b of F.objs) {
    if (b.owner === i || b.t < o.age || b.t >= b.life) continue;   // (ours, or not seen yet)
    const d = Math.hypot(me.x - b.x, me.y - b.y), ow = F.f[b.owner], om = ow.stats.moves;
    if (b.kind === 'ring' && b.ph === 'grow') {   // Stop the World: out before it completes (or, close and quick, hit him)
      const need = b.R + 10 - d, T = ow.state === 'wind' ? ow.dur - ow.t : 0;
      if (need <= 0) continue;
      if (tux && ready(F, me, 0) && d < 90 && T > me.stats.moves.move1.startup + d / me.stats.moves.move1.speed + 0.05 && !(('h' + b.id) in K.ans)) {
        K.ans['h' + b.id] = rng() < L.smart * 0.5; if (K.ans['h' + b.id]) { fire(tap, 0); return unit(g.toFoe); }
      }
      th.push(['r' + b.id, T, 0.05, away(b), need]);
    } else if (b.kind === 'shadow') {   // the iceberg: out from under it (it follows at its aim speed until it locks)
      const mv = om.move2, T = ow.state === 'wind' ? ow.dur - ow.t + mv.active : ow.state === 'strike' ? ow.dur - ow.t : 0, need = b.R + me.r * 0.5 + 4 - d;
      if (need <= 0 || T <= 0) continue;
      th.push(['s' + b.id, T, 0.05, away(b), need * (b.lock ? 1 : W / Math.max(20, W - mv.aimSpeed))]);
    } else if (b.kind === 'geyser' && b.ph !== 'aim') {   // the geyser: off the mark before it blows
      const mv = om.move3, T = b.ph === 'fly' ? mv.flight - b.pt + mv.brew : b.ph === 'brew' ? mv.brew - b.pt : 0, need = b.r + me.r * 0.5 + 4 - d;
      if (need <= 0) continue;
      th.push(['g' + b.id, T, b.ph === 'erupt' ? mv.erupt - b.pt : mv.erupt, away(b), need]);
    } else if (b.kind === 'portal' && b.ph === 'open') {   // Duke's coming out of it, lunging: away from the mark
      const mv = om.move1, need = mv.reach + mv.lunge + ow.r + me.r + 6 - d;
      if (need <= 0) continue;
      th.push(['p' + b.id, mv.gone + mv.out - b.t, 0.1, away(b), need]);
    } else if (b.kind === 'tobline' && b.pts.length > 1) {   // the toboggan: out of its line, sideways
      // (sliding: the line from where he is the way he's going now, he steers; crouching: the line shown, with room to spare)
      const pts = ow.state === 'strike' && ow.ph === 'slide' ? [[ow.x, ow.y], [ow.x + Math.cos(ow.face) * 400, ow.y + Math.sin(ow.face) * 400]] : b.pts;
      let best = 1e9, segA = 0, along = 0, run = 0;
      for (let k = 0; k + 1 < pts.length; k++) {
        const [x0, y0] = pts[k], [x1, y1] = pts[k + 1], ex = x1 - x0, ey = y1 - y0, Lk = Math.hypot(ex, ey) || 1, u = clamp01(((me.x - x0) * ex + (me.y - y0) * ey) / (Lk * Lk));
        const dd = Math.hypot(me.x - x0 - ex * u, me.y - y0 - ey * u);
        if (dd < best) { best = dd; segA = Math.atan2(ey, ex); along = run + u * Lk; }
        run += Lk;
      }
      const mv = om.move1, need = b.w + me.r + 6 + (ow.state === 'strike' ? 14 : 34) - best;   // (well clear: he steers a little)
      if (need <= 0) continue;
      const Tl = (ow.state === 'wind' ? ow.dur - ow.t : 0) + along / mv.speed;
      const side = Math.sign(Math.sin(Math.atan2(me.y - pts[0][1], me.x - pts[0][0]) - segA)) || 1;
      th.push(['t' + b.id, Tl, 0.1, segA + side * Math.PI / 2, need]);
    } else if (b.kind === 'peng' && b.ph === 'slide' && Math.cos(b.a - Math.atan2(me.y - b.y, me.x - b.x)) > 0.8 && d < 110) {   // a penguin sliding at us
      const lat = Math.abs(Math.sin(b.a - Math.atan2(me.y - b.y, me.x - b.x))) * d, mv = om.move3;
      th.push(['q' + b.id, Math.max(0, d - b.r - me.r) / mv.slideSpeed, 0.05, b.a + Math.PI / 2, b.r + me.r + 4 - lat]);
    }
  }
  const FP = plugOf(F.f[1 - i]); if (FP && FP.ai && FP.ai.threats) th.push(...(FP.ai.threats(F, i, me, o, PC) || []));   // (a plug-in foe's own tells)
  if (!th.length) return null;
  th.sort((x, y) => x[1] - y[1]);
  const [key, T, dur, a, need] = th[0];
  const walkable = need <= W * Math.max(0, T - 0.05) * 0.9;
  // (Tux ices Duke's portal smash more often than he walks off it: the shards stagger Duke, and the toboggan follows)
  if (!(key in K.ans)) K.ans[key] = rng() >= L.answer ? 'none' : tux && key[0] === 'p' && ready(F, me, 3) && rng() < 0.35 + 0.55 * L.smart ? 'evade'
    : walkable ? (rng() < 0.3 + 0.6 * L.smart ? 'walk+' : 'walk') : 'evade';
  const c = K.ans[key];
  if (c === 'none' || c === 'done') return null;
  const MP = plugOf(me);
  if (MP) {   // (a plug-in fighter's evade: its own timing, else untouchable through it like Tux's ice)
    const [now, late] = MP.ai && MP.ai.evadeWhen ? MP.ai.evadeWhen(T, dur, E, me) : [T > 0.02 && T + dur < E.active - 0.03, T + dur < E.active - 0.03];
    if ((c === 'evade' || (c === 'walk+' && !walkable && late)) && ready(F, me, 3) && (now || late)) { K.ans[key] = 'done'; return evade(m, tap, a); }
    return off(a);
  }
  // the evade's moment: Tux's ice up just before it lands and through it (its whole length); Duke's blink just before
  const now = tux ? T > 0.03 && T + dur < E.active - 0.03 : T > 0.01 && T < 0.2;
  const late = tux ? T + dur < E.active - 0.03 : T < 0.2;
  if ((c === 'evade' || (c === 'walk+' && !walkable && late)) && ready(F, me, 3)) {
    if (now || (tux && late)) { K.ans[key] = 'done'; return evade(m, tap, a); }
    return off(a);   // (walking off meanwhile: maybe it's enough)
  }
  return off(a);
}
// the foe open (a recovery, a freeze, a stagger, a long tell, the ice cracking, down and getting up): one of ours timed
// to land while they're open (seen), once per thing seen
function punishK(F, i, m, me, o, L, rng, tap, K, g) {
  const { A, dist, gap, toFoe } = g, M = me.stats.moves, oE = o.stats.moves.evade;
  if (o.z > 30 || o.gone || m.punFor === m.nk) return null;
  // the window they're open in, [a, b] s from now
  let a = 0, b = 0;
  if (o.state === 'strike' && o.ph === 'iceblock') { a = Math.max(0, o.left); b = a + oE.recovery; }
  else if (o.state === 'down' || o.state === 'getup') { a = Math.max(0, o.left) + (o.state === 'down' ? 0.35 : 0); b = a + 0.35; }
  else if (BUSY.has(o.state)) b = o.left;
  else return null;
  if (b < 0.12) return null;
  m.punFor = m.nk;
  if (rng() >= (o.state === 'frozen' || o.state === 'hurt' ? L.combo : L.punish)) return null;
  const fits = T => T >= a - 0.02 && T <= b - 0.02;
  const line = rayClear(A, me.x, me.y, toFoe, Math.max(0, dist - o.r - me.r), me.r * 0.8);
  const MP = plugOf(me); if (MP) return MP.ai && MP.ai.punish ? MP.ai.punish(F, i, me, o, PC, { a, b, fits, line }) || null : null;
  if (me.id === 'tux') {
    if (line && ready(F, me, 0) && fits(M.move1.startup + Math.max(0, gap) / M.move1.speed)) { fire(tap, 0); return unit(toFoe); }
    if (ready(F, me, 1) && dist < M.move2.far && fits(M.move2.startup + M.move2.active)) { fire(tap, 1); return unit(toFoe); }
  } else {
    if (ready(F, me, 0) && fits(M.move1.startup + M.move1.gone + M.move1.out)) { fire(tap, 0); return [0, 0]; }
    if (ready(F, me, 1) && ready(F, me, 0) && o.state !== 'frozen' && a < 0.05 && dist < M.move2.R - 25 && M.move2.startup < b - 0.05) { fire(tap, 1); return [0, 0]; }   // (freeze them, then the portal)
    const gT = M.move3.startup + M.move3.active + M.move3.flight + M.move3.brew;
    if (ready(F, me, 2) && dist > M.move3.near && dist < M.move3.far && gT <= b - 0.05 && gT + M.move3.erupt >= a) { K.aimT = F.time + 0.2; fire(tap, 2, 24); return [0, 0]; }
  }
  return null;
}
// every think, free and nothing coming: where to stand (mid range, the open side of them, off the walls) and now and
// then a move, by range and what they're doing. Keener once their evade is spent (bait it, then commit)
function neutral(F, i, m, me, o, L, rng, tap, K, g) {
  const { A, cl, dist, toFoe, toC } = g, M = me.stats.moves, tux = me.id === 'tux';
  const MP = plugOf(me), want = MP ? (MP.ai && MP.ai.want) || 160 : tux ? 140 : 175;
  // the spot: on the far side of them from the nearest wall (their open side), mostly the side we're on
  const oc = clearance(A, o.x, o.y, o.r), ow = clamp01(1 - oc.d / 160);
  let sx = Math.cos(toFoe + Math.PI) * 0.75 + oc.nx * ow * 0.5, sy = Math.sin(toFoe + Math.PI) * 0.75 + oc.ny * ow * 0.5; const sl = Math.hypot(sx, sy) || 1;
  const tx = o.x + sx / sl * want, ty = o.y + sy / sl * want, ddx = tx - me.x, ddy = ty - me.y, dd = Math.hypot(ddx, ddy);
  let walk = dd < 8 ? [0, 0] : [ddx / dd, ddy / dd];
  // pinned on a wall with them coming: round them, toward the middle
  if (cl.d < 30 + 30 * L.edge && (cl.nx * (o.x - me.x) + cl.ny * (o.y - me.y)) / dist > 0.2) {
    let tA = toC + Math.PI / 2; if (Math.cos(tA) * (o.x - me.x) + Math.sin(tA) * (o.y - me.y) > 0) tA += Math.PI;
    walk = [Math.cos(toC) * 0.6 + Math.cos(tA) * 0.8, Math.sin(toC) * 0.6 + Math.sin(tA) * 0.8];
  }
  if (o.state === 'down' || o.state === 'getup' || o.gone || o.air) return walk;
  if (o.ph === 'iceblock') return walk;   // (fresh ice: never attack into it, it shatters back; wait for the crack: punishK)
  const busy = BUSY.has(o.state), spent = o.stats.moves.evade ? (o.stats.moves.evade.charges ? !(o.ev >= 1) : o.cd && o.cd[3] > 0.5) : false;
  // the moves that make sense now, each with its chance this think (x the level's keenness); one roll picks
  const opts = [], add = (k, p, walkTo, n = 2) => { if (p > 0 && ready(F, me, k)) opts.push([k, p, walkTo, n]); };
  if (MP) { if (MP.ai && MP.ai.neutral) MP.ai.neutral(F, i, me, o, PC, { add, busy, spent, line: rayClear(A, me.x, me.y, toFoe, Math.max(0, dist - o.r - me.r), me.r * 0.8) }); }
  else if (tux) {
    const line = rayClear(A, me.x, me.y, toFoe, Math.max(0, dist - o.r - me.r), me.r * 0.8);
    add(1, dist < M.move2.far ? (busy ? 0.3 : 0.1) : 0, unit(toFoe));
    add(0, line && dist > 60 && dist < 320 ? 0.16 : 0, unit(toFoe));
    add(2, dist > 100 ? 0.14 : 0, [0, 0]);
  } else {
    add(1, dist < M.move2.R - 30 && !o.air ? (busy || o.ph === 'summon' || o.ph === 'crouch' ? 0.5 : 0.06) : 0, [0, 0]);
    const iceUp = o.stats.moves.evade && o.stats.moves.evade.do === 'iceblock' && !(o.cd && o.cd[3] > 0);   // (his ice ready: the smash may shatter it back on us)
    add(0, iceUp ? 0.14 * (1 - 0.6 * L.smart) : 0.14, [0, 0]);
    add(2, dist > M.move3.near + 20 && dist < M.move3.far ? (oc.d < 70 ? 0.3 : 0.16) : 0, [0, 0], 40);
  }
  let r = rng() / L.rate / (spent ? 1 + L.smart : 1);
  for (const [k, p, walkTo, n] of opts) {
    if (r < p) { if (n > 2) K.aimT = F.time + 0.25 + rng() * 0.25; fire(tap, k, n); return walkTo; }
    r -= p;
  }
  return walk;
}

// the plug-in fighters' bots (js/kits/<id>.js ai): what their hooks get (js/kits/index.js lists it); PC is this step's
let PC = null;
function plugCtx(F, i, m, me, o, L, rng, tap, hold, block, K, g) {
  return { F, i, m, me, o, live: F.f[1 - i], L, rng, tap, hold, block, K, g, unit, fire: (k, n) => fire(tap, k, n), ready: k => ready(F, me, k), stepTo: a => evade(m, tap, a) };
}

function angDiff(a, b) { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
