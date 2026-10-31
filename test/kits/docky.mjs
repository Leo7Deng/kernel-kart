// Docky's moves (js/kits/docky.js), checked by test/fight.test.mjs: each does what it says, its tell shows, its answer works.
// T: the test's tools ({ mk, place, run, has, kinds, tap, S, expect }); lands: what each move card's clip must show.
import { slapReach } from '../../js/kits/docky.js';
import { RULES } from '../../js/fight.js';

export const lands = {
  move1: ev => ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move1') && ev.some(e => e.kind === 'down' && e.who === 1),
  move2: ev => ev.some(e => e.kind === 'dkCatch' && e.who === 0) && ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move2') && ev.some(e => e.kind === 'dkDump' && e.who === 0),
  move3: ev => ev.some(e => e.kind === 'dkUp' && e.who === 0) && ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move3'),
  evade: ev => ev.some(e => e.kind === 'dkDive' && e.who === 0) && ev.some(e => e.kind === 'dkSurface' && e.who === 0) && !ev.some(e => e.kind === 'hit' && e.to === 0),
};

export function checks({ mk, place, run, has, kinds, tap, S, expect }) {
  const waveOf = F => F.objs.find(o => o.kind === 'dkWave');
  const boxesOf = F => F.objs.filter(o => o.kind === 'dkBox' && o.t < o.life);
  const edge = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
  // ---- Tidal Wave (he rides it in)
  { // he rears up, the swell in front of him; he rides the wave out, it catches them, carries them, and drops them
    // staggered right in front of him where it breaks; he lands there, close
    const F = mk(['docky', 'duke']); place(F, 120); const [dk, duke] = F.f, M = dk.stats.moves.move2, x0 = dk.x;
    run(F, 4, tap('heavy'));
    let w = waveOf(F);
    expect(dk.ph === 'swell' && dk.pose === 'swell' && w && w.ph === 'swell' && w.x > dk.x + dk.r, `Tidal Wave: rearing up, the swell in front (${dk.ph}, ${w && w.ph})`);
    let ev = run(F, S(M.startup) - 2);
    w = waveOf(F);
    expect(w && w.ph === 'roll' && has(ev, 'dkSurge', 0) && dk.ph === 'surf', `Tidal Wave: it sets off, he's on it (${w && w.ph}, ${dk.ph}, ${kinds(ev)})`);
    ev = ev.concat(run(F, S(0.45)));
    expect(has(ev, 'dkCatch', 0) && has(ev, 'hit', 0, { move: 'move2' }) && w.carry === 1 && duke.state === 'hurt', `Tidal Wave: caught (${kinds(ev)}, ${duke.state})`);
    expect(dk.x > x0 + 80 && w.x - dk.x > dk.r && w.x - dk.x < dk.r + M.ride + 8, `Tidal Wave: riding it in, behind its front (${(dk.x - x0).toFixed(0)} on, ${(w.x - dk.x).toFixed(0)} behind)`);
    const x1 = duke.x;
    ev = run(F, S(0.2));
    expect(duke.x > x1 + 30 && Math.abs(duke.x - w.x) < 30, `Tidal Wave: carried along at its front (${(duke.x - x1).toFixed(0)})`);
    ev = run(F, S(M.run));
    const brk = ev.find(e => e.kind === 'dkBreak' && e.who === 0);
    expect(brk && (has(ev, 'dkDump', 0) || has(ev, 'wall', 1)) && has(ev, 'dkLand', 0, { hit: true }), `Tidal Wave: it breaks, they're dropped (or slammed on the wall), he lands (${kinds(ev)})`);
    expect(brk && Math.hypot(dk.x - brk.x, dk.y - brk.y) < dk.r + M.ride + 30 && edge(dk, duke) < 60, `Tidal Wave: he ends where it broke, next to them (${brk && Math.hypot(dk.x - brk.x, dk.y - brk.y).toFixed(0)} from it, ${edge(dk, duke).toFixed(0)} from them)`);
    run(F, S(0.6));
    expect(!waveOf(F), 'Tidal Wave: gone after it breaks');
  }
  { // on open floor they're dropped staggered, not down: his Tail Slap follows before they can get away
    const F = mk(['docky', 'duke']); place(F, 40, { a: { x: -200, y: 0 }, b: { x: -130, y: 0 } }); const [dk, duke] = F.f, M = dk.stats.moves.move2;
    let ev = run(F, S(M.startup + 0.1), tap('heavy'));
    ev = ev.concat(run(F, S(M.run + 1), () => ({ light: dk.state === 'recover' && dk.ph === 'land' && dk.dur - dk.t < 0.1 })));   // (pressed as he lands: buffered)
    expect(has(ev, 'dkDump', 0) && !ev.some(e => e.kind === 'dkDump' && e.why === 'wall'), `wave then slap: dropped on the open floor (${kinds(ev)})`);
    expect(has(ev, 'hit', 0, { move: 'move1' }) && has(ev, 'down', 1), `wave then slap: the slap lands on them as they stagger (${kinds(ev)})`);
  }
  { // not aimed: held or not, it goes the way he faced as he pressed (the key held changes nothing)
    const F = mk(['docky', 'duke']); place(F, 150); const dk = F.f[0], M = dk.stats.moves.move2;
    const ev = run(F, S(M.startup) + 4, k => ({ heavy: true, x: k > 2 ? 0.3 : 0, y: k > 2 ? 1 : 0 }));
    const w = waveOf(F);
    expect(has(ev, 'dkSurge', 0) && w && w.ph === 'roll' && Math.abs(w.a) < 1e-9, `Tidal Wave: straight the way he faced (${w && w.a.toFixed(2)}, ${kinds(ev)})`);
  }
  { // it rolls straight: out of its way sideways, it misses; he wipes out where it breaks, open, and is punished there
    const F = mk(['docky', 'tux']); place(F, 150); const [dk, tux] = F.f, hp = tux.hp, M = dk.stats.moves.move2;
    let wiped = -1;
    const ev = run(F, S(M.startup + M.run + 0.15), tap('heavy'), k => k > 4 && k < 50 ? { x: 0, y: -1 } : {});
    expect(!has(ev, 'hit', 0) && tux.hp === hp && has(ev, 'dkBreak', 0) && has(ev, 'dkLand', 0, { hit: false }) && dk.ph === 'wipe' && dk.state === 'recover', `Tidal Wave: sidestepped, he wipes out (${dk.ph}, ${kinds(ev)})`);
    expect(Math.abs(dk.dur - M.miss) < 1e-9 && M.miss > M.recovery + 0.25, `Tidal Wave: the wipe-out is long (${M.miss} v ${M.recovery})`);
    const hp2 = dk.hp; dk.iso = 0; tux.cd = [0, 0, 0, 0];
    const ev2 = run(F, 50, {}, k => { if (wiped < 0) wiped = k; return { heavy: k < 2, x: dk.x - tux.x, y: dk.y - tux.y }; });   // (Tux's toboggan at him as he gets up)
    expect(has(ev2, 'hit', 1) && dk.hp < hp2, `Tidal Wave: punished on the wipe-out (${kinds(ev2)})`);
  }
  { // evade through it: it's thin, it passes
    const F = mk(['docky', 'swifty']); place(F, 140); const sw = F.f[1], hp = sw.hp, M = F.f[0].stats.moves.move2;
    let at = -1;   // (the hop just as the wave reaches her)
    const ev = run(F, S(M.startup + M.run + 0.3), tap('heavy'), k => { const w = waveOf(F); if (at < 0 && w && w.ph === 'roll' && sw.x - w.x < 40) at = k; return at >= 0 && k < at + 2 ? { guard: true, x: -1, y: 0 } : {}; });   // (over it, toward him)
    expect(has(ev, 'swHop', 1) && !has(ev, 'hit', 0) && sw.hp === hp, `Tidal Wave: hopped over (${kinds(ev)})`);
  }
  { // carried into a wall: slammed, down
    const F = mk(['docky', 'duke']); place(F, 60, { a: { x: 90 }, b: { x: 170 } });
    const ev = run(F, 100, tap('heavy'));
    expect(has(ev, 'dkCatch', 0) && has(ev, 'wall', 1) && has(ev, 'down', 1), `Tidal Wave: into the wall (${kinds(ev)})`);
  }
  { // hit off it while he rides: the wave breaks there
    const F = mk(['docky', 'tux']); place(F, 200); const [dk, tux] = F.f, M = dk.stats.moves.move2;
    run(F, S(M.startup) + 6, tap('heavy'));
    dk.iso = 0; F.hitF(tux, dk, { damage: 5, kb: 120 }, { obj: true, dir: Math.PI });
    const ev = run(F, 12);   // (and the hitstop)
    expect(has(ev, 'dkBreak', 0) && (!waveOf(F) || waveOf(F).ph === 'break'), `Tidal Wave: knocked off it, it breaks (${kinds(ev)})`);
  }
  { // hit out of his rearing up: the swell goes, no wave
    const F = mk(['docky', 'tux']); place(F, 40); const [dk, tux] = F.f;
    let ev = run(F, 8, tap('heavy'));
    F.hitF(tux, dk, { damage: 5, kb: 120 }, { obj: true, dir: Math.PI });   // (a hit on him while he rears up)
    ev = ev.concat(F.events.splice(0), run(F, 50));
    expect(has(ev, 'counter', 1) && !has(ev, 'dkSurge') && !waveOf(F), `Tidal Wave: cut short, no wave (${kinds(ev)})`);
  }
  // ---- Tail Slap (a tell, a short lurch, down only off the tip)
  { // off the tip of his tail: the twist (tail cocked back), the spin, his tail launches them (down, far, longer than a knockdown); a short settle after
    const F = mk(['docky', 'duke']); place(F, 40); const [dk, duke] = F.f, M = dk.stats.moves.move1, x0 = duke.x, hp = duke.hp;
    let ev = run(F, 3, tap('light'));
    expect(dk.ph === 'coil' && dk.pose === 'coil' && !F.objs.some(o => o.kind !== 'dkSlam'), `Tail Slap: the twist, nothing on the floor (${dk.ph})`);
    ev = ev.concat(run(F, S(M.startup + M.active) + 12));   // (and the hitstop)
    const hit = ev.find(e => e.kind === 'hit' && e.who === 0 && e.move === 'move1');
    expect(hit && has(ev, 'dkSmack', 0) && has(ev, 'down', 1) && dk.ph === 'follow' && dk.state === 'recover' && Math.abs(dk.dur - M.recovery) < 1e-9, `Tail Slap: launched, down (${kinds(ev)})`);
    expect(duke.state === 'down' && duke.dur > RULES.downT + M.down - 1e-9 && hp - duke.hp >= M.damage * 0.95, `Tail Slap: ${(hp - duke.hp).toFixed(0)} damage, down ${duke.dur.toFixed(2)} s`);
    run(F, 30);
    expect(duke.x > x0 + 50, `Tail Slap: sent flying (${(duke.x - x0).toFixed(0)})`);
  }
  { // the tail swings all round: behind him too
    const F = mk(['docky', 'duke']); place(F, 36); const dk = F.f[0];
    let ev = run(F, 1, { light: true }); dk.face = Math.PI;   // (turned away from them)
    ev = ev.concat(run(F, 40));
    expect(has(ev, 'hit', 0, { move: 'move1' }) && has(ev, 'down', 1), `Tail Slap: all round him (${kinds(ev)})`);
  }
  { // right up close, inside the tip: his body's bump, staggered, not down (and no slam)
    const F = mk(['docky', 'duke']); place(F, 6); const [dk, duke] = F.f, M = dk.stats.moves.move1, hp = duke.hp;
    const ev = run(F, S(M.startup + M.active) + 4, tap('light'));
    expect(has(ev, 'hit', 0, { move: 'move1' }) && !has(ev, 'down', 1) && duke.state === 'hurt' && Math.abs((hp - duke.hp) - M.near.damage) < 1e-6, `Tail Slap: up close only a stagger (${kinds(ev)}, ${duke.state}, ${(hp - duke.hp).toFixed(1)})`);
  }
  { // its reach is the spray you see: from 52 off he lurches in a short step and the tip catches someone standing there
    const F = mk(['docky', 'duke']); place(F, 52); const M = F.f[0].stats.moves.move1;
    const ev = run(F, S(M.startup + M.active) + 4, tap('light'));
    expect(slapReach(M) < 74 && has(ev, 'hit', 0, { move: 'move1' }) && has(ev, 'down', 1), `Tail Slap: a short lurch, the tip catches them at 52 (reach ${slapReach(M).toFixed(0)}, ${kinds(ev)})`);
  }
  { // the tell can be answered: backing straight off as his tail cocks back (0.1 s in, at walking speed), it misses
    const F = mk(['docky', 'duke']); place(F, 52); const M = F.f[0].stats.moves.move1;
    const ev = run(F, S(M.startup + M.active) + 4, tap('light'), k => k >= 6 ? { x: 1, y: 0 } : {});
    expect(!has(ev, 'hit', 0) && F.f[0].ph === 'unwind', `Tail Slap: backed out of on its tell (${kinds(ev)})`);
  }
  { // out of reach: a whiff; he's left unwinding, longer, and a hit lands on him then
    const F = mk(['docky', 'tux']); place(F, 96); const [dk, tux] = F.f, M = dk.stats.moves.move1, hp = tux.hp;
    const ev = run(F, S(M.startup + M.active) + 2, tap('light'));
    expect(!has(ev, 'hit', 0) && tux.hp === hp && dk.ph === 'unwind' && dk.state === 'recover' && Math.abs(dk.dur - M.miss) < 1e-9 && M.miss > M.recovery + 0.1, `Tail Slap: whiffed, unwinding (${dk.ph}, ${kinds(ev)})`);
    const hp2 = dk.hp; dk.iso = 0;
    const ev2 = run(F, 40, {}, tap('heavy'));   // (Tux's toboggan into the opening)
    expect(has(ev2, 'hit', 1) && dk.hp < hp2, `Tail Slap: punished on the whiff (${kinds(ev2)})`);
  }
  { // slapped into the arena's wall: a slam (more damage, down longer)
    const F = mk(['docky', 'duke']); place(F, 30, { a: { x: 118, y: 0 }, b: { x: 190, y: 0 } }); const [dk, duke] = F.f, M = dk.stats.moves.move1;
    dk.face = 0;
    const hp = duke.hp, ev = run(F, S(M.startup + M.active + M.slam.window), tap('light'));
    expect(has(ev, 'dkSlamIn', 0) && hp - duke.hp >= M.damage + M.slam.damage - 1 && duke.state === 'down', `Tail Slap: slammed into the wall (${(hp - duke.hp).toFixed(0)}, ${kinds(ev)})`);
  }
  // ---- Compose Up (back, behind them)
  { // the tower on his back, the cracks behind them following them; then the wall bursts up behind them, solid, and sinks after
    const F = mk(['docky', 'duke']); place(F, 60); const [dk, duke] = F.f, M = dk.stats.moves.move3;
    let ev = run(F, 4, tap('special'));
    let bs = boxesOf(F);
    expect(dk.ph === 'stack' && dk.pose === 'stack' && bs.length === M.n && bs.every(b => b.ph === 'mark' && b.x > duke.x + duke.r && b.z > 0), `Compose Up: the stack, ${bs.length} cracks behind them (${dk.ph})`);
    run(F, 6, {}, { x: 0, y: 1 }); run(F, 1);
    bs = boxesOf(F);
    const mid = bs.find(b => b.k === 1);
    expect(mid && Math.abs(mid.y - duke.y) < 20, `Compose Up: the cracks follow them (${mid && mid.y.toFixed(0)} v ${duke.y.toFixed(0)})`);
    ev = run(F, S(M.startup + M.rise) + 2);
    bs = boxesOf(F);
    expect(has(ev, 'dkBuild', 0) && has(ev, 'dkUp', 0) && bs.length === M.n && bs.every(b => b.ph === 'up' && b.z <= 0), `Compose Up: the wall is up (${kinds(ev)})`);
    expect(F.contactsAll(mid.x, mid.y, 4).some(c => c.solid && c.solid.kind === 'dkBox'), 'Compose Up: solid');
    run(F, S(M.life + M.sink) + 2);
    expect(!boxesOf(F).length, 'Compose Up: sunk after a while');
  }
  { // backing off: they stop at it (no getting away), and backing into it as it rises pops them back toward him
    const F = mk(['docky', 'duke']); place(F, 40); const [dk, duke] = F.f, M = dk.stats.moves.move3;
    const ev = run(F, S(M.startup + M.rise + 0.8), tap('special'), { x: 1, y: 0 });
    expect(has(ev, 'dkUp', 0) && (has(ev, 'hit', 0, { move: 'move3' }) || boxesOf(F).some(b => b.x > duke.x)), `Compose Up: backing off, walled in (${kinds(ev)})`);
    expect(edge(dk, duke) < 120, `Compose Up: kept near him (${edge(dk, duke).toFixed(0)})`);
    const F2 = mk(['docky', 'duke']); place(F2, 40); const d2 = F2.f[1];
    const ev2 = run(F2, S(M.startup + M.rise) + 4, tap('special'), k => k > S(M.startup) - 4 ? { x: 1, y: 0 } : {});   // (backing late, into it as it rises)
    expect(has(ev2, 'hit', 0, { move: 'move3' }) && has(ev2, 'dkPop', 0) && d2.vx < 0, `Compose Up: popped back toward him (${kinds(ev2)})`);
  }
  { // the answer: don't back into it as it rises, then walk round its end: away and free
    const F = mk(['docky', 'duke']); place(F, 40); const [dk, duke] = F.f, M = dk.stats.moves.move3, T = S(M.startup + M.rise) + 2;
    const ev = run(F, T + S(1.4), tap('special'), k => k < T ? {} : k < T + S(0.6) ? { x: 0, y: 1 } : { x: 1, y: 0 });
    expect(has(ev, 'dkUp', 0) && !has(ev, 'hit', 0) && duke.x > Math.max(...boxesOf(F).map(b => b.x)) + 10, `Compose Up: round its end (${duke.x.toFixed(0)}, ${kinds(ev)})`);
  }
  { // Tail Slap into his own wall: a slam, the container clangs
    const F = mk(['docky', 'duke']); place(F, 30); const [dk, duke] = F.f, M3 = dk.stats.moves.move3, M2 = dk.stats.moves.move1;
    run(F, S(M3.startup + M3.active + M3.recovery + M3.rise) + 4, tap('special'));
    const hp = duke.hp;
    const ev = run(F, S(M2.startup + M2.active + M2.slam.window), tap('light'));
    expect(has(ev, 'hit', 0, { move: 'move1' }) && has(ev, 'dkSlamIn', 0) && has(ev, 'dkClang', 0) && hp - duke.hp >= M2.damage + M2.slam.damage - 1, `Tail Slap into his wall: slammed (${(hp - duke.hp).toFixed(0)}, ${kinds(ev)})`);
  }
  { // one wall at a time: building again sinks the last one
    const F = mk(['docky', 'duke']); place(F, 60); const dk = F.f[0], M = dk.stats.moves.move3;
    run(F, S(M.startup + M.active + M.recovery + M.rise) + 4, tap('special'));
    dk.cd = [0, 0, 0, 0];
    run(F, 3, tap('special'));
    const bs = boxesOf(F);
    expect(!bs.some(b => b.ph === 'up') && bs.filter(b => b.ph === 'sink').length === M.n, `Compose Up: one wall at a time (${bs.map(b => b.ph).join(',')})`);
  }
  { // no room behind them (against the arena's wall): no containers there
    const F = mk(['docky', 'duke']); place(F, 30, { a: { x: 160 }, b: { x: 205 } }); const M = F.f[0].stats.moves.move3;
    run(F, S(M.startup + M.rise) + 6, tap('special'));
    expect(boxesOf(F).filter(b => b.ph === 'up').length === 0, `Compose Up: nothing built in the wall (${boxesOf(F).map(b => b.ph).join(',')})`);
  }
  // ---- Swim (a fast moving dive)
  { // under the held way, fast and a good way off: untouchable, not there to bump, then he surfaces, open; a cooldown after
    const F = mk(['docky', 'duke']); place(F, 120, { a: { y: 120 }, b: { y: 120 } }); const dk = F.f[0], E = dk.stats.moves.evade, y0 = dk.y, x0 = dk.x;
    let ev = run(F, 2, { guard: true, x: 0, y: -1 });
    expect(dk.move === 'evade' && dk.gone && dk.inv > 0 && dk.ph === 'swim' && dk.pose === 'dive' && has(ev, 'dkDive', 0), `Swim: under, untouchable (${dk.ph})`);
    run(F, S(E.active / 2));
    expect(dk.y < y0 - E.dist * 0.3 && dk.gone && dk.inv > 0, `Swim: moving under, untouchable (${(dk.y - y0).toFixed(0)})`);
    ev = run(F, S(E.active / 2) + 2);
    expect(Math.abs(dk.y - (y0 - E.dist)) < 6 && Math.abs(dk.x - x0) < 3 && has(ev, 'dkSurface', 0) && dk.ph === 'surface' && dk.state === 'recover' && dk.inv <= 0 && !dk.gone, `Swim: ${E.dist} the held way, then he surfaces, open (${(dk.y - y0).toFixed(0)}, ${dk.state})`);
    expect(!has(ev, 'hit', 0), `Swim: surfacing hits nobody (${kinds(ev)})`);
    run(F, S(E.recovery) + 2); run(F, 1, { guard: true }); run(F, 1);
    expect(dk.move !== 'evade' && dk.cd[3] > 0, 'Swim: a cooldown after');
  }
  { // nothing held: away from them; faster and further than Gopher's burrow
    const F = mk(['docky', 'duke']); place(F, 60); const dk = F.f[0], E = dk.stats.moves.evade, x0 = dk.x, B = mk(['gopher', 'duke']).f[0].stats.moves.evade;
    run(F, S(E.active) + 3, tap('guard'));
    expect(dk.x < x0 - E.dist * 0.75, `Swim: away from them when nothing's held (${(dk.x - x0).toFixed(0)})`);
    expect(E.dist > B.dist && E.dist / E.active > B.dist / B.active, `Swim: further (${E.dist} v ${B.dist}) and faster (${(E.dist / E.active).toFixed(0)} v ${(B.dist / B.active).toFixed(0)} u/s) than the burrow`);
  }
  { // through a toboggan: nothing (dived as it sets off: quick)
    const F = mk(['docky', 'tux']); place(F, 130); const dk = F.f[0], hp = dk.hp;
    const ev = run(F, 50, k => ({ guard: k >= 18 && k < 20 }), tap('heavy'));
    expect(has(ev, 'dkDive', 0) && dk.hp === hp && !has(ev, 'hit', 1), `Swim: the toboggan through nothing (${kinds(ev)})`);
  }
  { // no attack out of it: a move pressed while he swims doesn't cut it short
    const F = mk(['docky', 'duke']); place(F, 120, { a: { y: 100 }, b: { y: 100 } }); const dk = F.f[0], E = dk.stats.moves.evade;
    run(F, 6, k => ({ guard: k < 2, y: -1 }));
    const ev = run(F, 4, k => ({ light: k < 2, heavy: k >= 2 }));
    expect(dk.move === 'evade' && dk.ph === 'swim' && !has(ev, 'tell', 0), `Swim: no move out of it (${dk.move}, ${dk.ph})`);
    run(F, S(E.active));
    expect(dk.ph === 'surface' && dk.state === 'recover', `Swim: he surfaces all the same (${dk.ph})`);
  }
}
