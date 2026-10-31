// Pyth's moves (js/kits/pyth.js), checked by test/fight.test.mjs: each does what it says, its tell shows, its answer works.
// T: the test's tools ({ mk, place, run, has, kinds, tap, S, expect }); lands: what each move card's clip must show.
export const lands = {
  move2: ev => ev.some(e => e.kind === 'pyCatch' && e.who === 0) && ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move2') && ev.some(e => e.kind === 'down' && e.who === 1),
  move3: ev => ev.some(e => e.kind === 'pyCall' && e.who === 0) && ev.some(e => e.kind === 'pyEat' && e.who === 0),
  move1: ev => ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move1'),
  evade: ev => ev.some(e => e.kind === 'pySlither' && e.who === 0) && !ev.some(e => e.kind === 'hit' && e.to === 0),
};

export function checks({ mk, place, run, has, kinds, tap, S, expect }) {
  // ---- Coil (his close grab)
  { // up close: drawn back, nothing on the floor, then his body springs out, catches them, drags them in, squeezes,
    // tosses them down poisoned (slow, no evade); 13.5 in all
    const F = mk(['pyth', 'duke']); const M = F.f[0].stats.moves.move2; place(F, M.reach - 10); const [py, duke] = F.f, hp = duke.hp;
    let ev = run(F, 3, tap('heavy'));
    expect(py.ph === 'coilback' && py.pose === 'coil' && !F.objs.length, `Coil: drawn back into his S, nothing on the floor (${py.ph}, ${F.objs.map(o => o.kind)})`);
    ev = ev.concat(run(F, S(M.startup + M.out + 0.05)));
    expect(has(ev, 'pyCatch', 0) && duke.state === 'grabbed' && py.ph === 'wrap', `Coil: caught from ${M.reach - 10} off (${duke.state}, ${kinds(ev)})`);
    ev = ev.concat(run(F, S(M.pull + 0.02)));
    expect(Math.hypot(duke.x - py.x, duke.y - py.y) < py.r + duke.r + 6, `Coil: dragged in (${Math.hypot(duke.x - py.x, duke.y - py.y).toFixed(0)})`);
    ev = ev.concat(run(F, S(M.wrapT + 0.2)));
    expect(ev.filter(e => e.kind === 'pySqueeze').length === M.ticks && has(ev, 'hit', 0, { move: 'move2' }) && has(ev, 'down', 1), `Coil: squeezed ${M.ticks} times, tossed down (${kinds(ev)})`);
    const total = M.bite.damage + M.ticks * M.squeeze + M.toss.damage;
    expect(Math.abs((hp - duke.hp) - total) < 1e-6, `Coil: ${total} in all (${(hp - duke.hp).toFixed(2)})`);
    expect(has(ev, 'pyPoison', 0, { to: 1 }) && duke.psnT > 0 && duke.psnSlow === M.slow, `Coil: tossed poisoned (${duke.psnT.toFixed(2)})`);
  }
  { // a short reach, well inside the whip's, a straight line (off it, nothing); the toss goes the held way
    const M = mk(['pyth', 'duke']).f[0].stats.moves;
    expect(M.move2.reach < M.move1.r1 / 2 && M.move2.width < 14, `Coil: a short straight line (reach ${M.move2.reach} past his edge, whip ${M.move1.r1} round him)`);
    const F = mk(['pyth', 'duke']); place(F, 60); const duke = F.f[1]; const hp = duke.hp;
    run(F, 3, tap('heavy')); duke.y = 40; run(F, S(M.move2.startup + M.move2.active));
    expect(duke.hp === hp, 'Coil: off his line, nothing');
    const G = mk(['pyth', 'duke']); place(G, 40);
    run(G, S(M.move2.startup + M.move2.out + 0.05), tap('heavy')); run(G, S(M.move2.pull + M.move2.wrapT + 0.25), { x: 0, y: 1 });
    expect(G.f[1].y > G.f[0].y + 20, `Coil: tossed the held way (down: ${(G.f[1].y - G.f[0].y).toFixed(0)})`);
  }
  { // further than its reach: a whiff, stretched out, open (punished)
    const F = mk(['pyth', 'tux']); const M = F.f[0].stats.moves.move2; place(F, M.reach + M.slide * M.out + M.width + 16); const hp = F.f[1].hp;
    const ev = run(F, S(M.startup + M.active) + 3, tap('heavy'));
    expect(!has(ev, 'pyCatch') && F.f[1].hp === hp && has(ev, 'pySprawl', 0) && F.f[0].dur >= M.miss - 1e-9, `Coil: out of reach, a whiff, open ${M.miss} s (${kinds(ev)})`);
    const [py, tx] = F.f; tx.x = py.x + py.r + tx.r + 40; tx.y = py.y;
    const ev2 = run(F, 30, {}, tap('heavy'));
    expect(has(ev2, 'hit', 1, { move: 'move2' }), `Coil: punished after the whiff: Tux's toboggan lands (${kinds(ev2)})`);
  }
  { // a wall in the way stops it short
    const F = mk(['pyth', 'duke'], 'court'); place(F, 90); const [py, duke] = F.f; py.x = -105 - 24 - py.r - 30; py.y = -105; duke.x = -105 + 24 + duke.r + 20; duke.y = -105; const hp = duke.hp;
    run(F, S(0.32 + 0.24) + 3, tap('heavy'));
    expect(duke.hp === hp && py.pyL < 40, `Coil: a pillar in the way stops it (${py.pyL})`);
  }
  { // a blink just before it lands: through nothing
    const F = mk(['pyth', 'duke']); const M = F.f[0].stats.moves.move2; place(F, 50); const duke = F.f[1], hp = duke.hp;
    const k0 = S(M.startup) - 2;
    const ev = run(F, 40, tap('heavy'), k => k >= k0 && k < k0 + 2 ? { guard: true, x: 0, y: -1 } : {});
    expect(!has(ev, 'pyCatch') && duke.hp === hp, `Coil: evaded (${kinds(ev)})`);
  }
  { // the poison: no evade till it wears off; and no bonus on the poisoned (the Coil does the same)
    const F = mk(['pyth', 'duke']); const M = F.f[0].stats.moves.move2; place(F, 40); const duke = F.f[1];
    run(F, S(M.startup + M.out + M.pull + M.wrapT + 0.2), tap('heavy'));
    run(F, S(0.9)); run(F, 3, {}, { guard: true, x: 0, y: 1 }); run(F, 2);
    expect(duke.psnT > 0 && duke.move !== 'evade', `Coil: poisoned, no evade (${duke.move}, ${duke.psnT.toFixed(2)})`);
    const ev = run(F, S(M.dose) + 2);
    expect(duke.psnT === 0 && has(ev, 'cure', 0, { to: 1 }), `Coil: the poison wears off (${duke.psnT})`);
    const coil = poisoned => { const G = mk(['pyth', 'duke']); place(G, 40); if (poisoned) G.poison(G.f[1], 9, M.slow, 0); const h = G.f[1].hp; run(G, S(M.startup + M.out + M.pull + M.wrapT) + 20, tap('heavy')); return h - G.f[1].hp; };
    const c0 = coil(false), c1 = coil(true);
    expect(c0 > 0 && Math.abs(c0 - c1) < 1e-6, `Coil: no bonus on the poisoned (${c0.toFixed(1)} v ${c1.toFixed(1)})`);
  }
  // ---- Apple
  { // he looks up; an apple drops on open floor, away from both; landed, he walks over it and eats it: healed, capped
    const F = mk(['pyth', 'duke']); place(F, 100); const [py, duke] = F.f, A = py.stats.moves.move3; py.hp = py.maxHp - 30;
    let ev = run(F, 3, tap('special'));
    expect(py.ph === 'call' && py.pose === 'cast', `Apple: he looks up (${py.ph}, ${py.pose})`);
    ev = ev.concat(run(F, S(A.startup + A.active) + 1));
    const ap = F.objs.find(o => o.kind === 'pyApple');
    expect(ap && has(ev, 'pyCall', 0) && ap.ph === 'fall' && Math.hypot(ap.x - py.x, ap.y - py.y) >= A.away[0] - 1 && Math.hypot(ap.x - duke.x, ap.y - duke.y) >= A.away[1] - 1, `Apple: dropped away from both (${ap && [ap.x.toFixed(0), ap.y.toFixed(0)]})`);
    ev = run(F, S(A.fall));
    expect(ap.ph === 'sit' && has(ev, 'pyAppleLand', 0), `Apple: landed (${ap.ph})`);
    run(F, S(0.6)); run(F, 3, tap('special')); run(F, S(1));
    expect(F.objs.filter(o => o.kind === 'pyApple').length === 1 && py.cd[2] > 0, 'Apple: one at a time');
    py.x = ap.x - py.r - ap.r - 1; py.y = ap.y; py.state = 'idle'; py.move = null; duke.x = ap.x + 160 > 200 ? ap.x - 180 : ap.x + 160; duke.y = ap.y;
    const hp = py.hp;
    ev = run(F, S(0.4), { x: 1, y: 0 });
    expect(has(ev, 'pyEat', 0) && Math.abs(py.hp - hp - A.heal) < 1e-6 && !F.objs.some(o => o.kind === 'pyApple'), `Apple: eaten, +${A.heal} (${(py.hp - hp).toFixed(1)}, ${kinds(ev)})`);
    py.hp = py.maxHp - 3; py.cd[2] = 0;
    run(F, S(A.startup + A.active + A.fall) + 2, tap('special')); const ap2 = F.objs.find(o => o.kind === 'pyApple');
    py.x = ap2.x; py.y = ap2.y; run(F, 2);
    expect(py.hp <= py.maxHp + 1e-9 && Math.abs(py.hp - py.maxHp) < 1e-6, `Apple: never past full (${py.hp.toFixed(1)} / ${py.maxHp})`);
  }
  { // anyone else over it squashes it; untouched, it goes; at full health he leaves it
    const F = mk(['pyth', 'duke']); place(F, 100); const [py, duke] = F.f, A = py.stats.moves.move3; py.hp = py.maxHp - 30;
    run(F, S(A.startup + A.active + A.fall) + 2, tap('special'));
    const ap = F.objs.find(o => o.kind === 'pyApple');
    duke.x = ap.x; duke.y = ap.y; const ev = run(F, 2);
    expect(has(ev, 'pySquash', 0, { by: 1 }) && !F.objs.some(o => o.kind === 'pyApple') && py.hp === py.maxHp - 30, `Apple: squashed by the other (${kinds(ev)})`);
    const G = mk(['pyth', 'duke']); place(G, 100); const g = G.f[0];
    run(G, S(A.startup + A.active + A.fall) + 2, tap('special'));
    const b = G.objs.find(o => o.kind === 'pyApple'); g.x = b.x; g.y = b.y; run(G, 2);
    expect(G.objs.some(o => o.kind === 'pyApple'), 'Apple: at full health he leaves it');
    g.x = b.x - 150 < -150 ? b.x + 150 : b.x - 150; g.y = b.y;
    const ev2 = run(G, S(A.life) + 2);
    expect(has(ev2, 'pyRot', 0) && !G.objs.some(o => o.kind === 'pyApple'), `Apple: gone after ${A.life} s (${kinds(ev2)})`);
  }
  { // every arena, many drops: on open floor (inside, off the solids, off the vents and belts), never in reach of either
    for (const ar of ['ring', 'court', 'hall', 'rink']) {
      const F = mk(['pyth', 'duke'], ar); const A = F.f[0].stats.moves.move3; let bad = '';
      for (let k = 0; k < 120 && !bad; k++) {
        const [py, du] = F.f; py.x = (k * 37 % 200) - 100; py.y = (k * 53 % 80) - 40; du.x = -py.x * 0.7; du.y = ((k * 29) % 60) - 30;
        F.objs.length = 0; py.state = 'idle'; py.move = null; py.cd = [0, 0, 0, 0]; py.hp = py.maxHp - 20;
        run(F, S(A.startup + A.active) + 1, tap('special'));
        const ap = F.objs.find(o => o.kind === 'pyApple');
        if (!ap) { bad = `no apple (${k})`; break; }
        const sdB = (s, x, y) => { if (s.shape === 'circle') return Math.hypot(x - (s.x || 0), y - (s.y || 0)) - s.r; const qx = Math.abs(x - (s.x || 0)) - s.w / 2, qy = Math.abs(y - (s.y || 0)) - s.h / 2; return Math.max(qx, qy); };
        if (sdB(F.A.bounds, ap.x, ap.y) > -20) bad = `by the wall at ${ap.x.toFixed(0)},${ap.y.toFixed(0)}`;
        else if (F.A.solids.some(s => sdB(s, ap.x, ap.y) < 12)) bad = `in a solid at ${ap.x.toFixed(0)},${ap.y.toFixed(0)}`;
        else if (F.A.hazards.some(h => h.kind !== 'ice' && sdB(h, ap.x, ap.y) < 8)) bad = `on a ${F.A.hazards.find(h => sdB(h, ap.x, ap.y) < 8).kind} at ${ap.x.toFixed(0)},${ap.y.toFixed(0)}`;
      }
      expect(!bad, `Apple: lands on open floor in ${ar} (${bad})`);
    }
  }
  // ---- Indentation Whip (his HIT: the baseball-bat tail swing)
  { // a blink's twist, nothing on the floor; then it lands fast up close (hugging him too) and sends them flying, down;
    // the sweet spot (the tail's end) harder; out of its reach it whiffs, carried round, open, and punished there
    const M = mk(['pyth', 'duke']).f[0].stats.moves.move1;
    const at = (gap, foe = 'duke') => { const F = mk(['pyth', foe]); place(F, gap); const hp = F.f[1].hp, x0 = F.f[1].x; const e0 = run(F, 3, tap('light')); const objs = F.objs.length, ph = F.f[0].ph; const ev = e0.concat(run(F, S(M.startup + M.active) + 1)); return { F, ev, hp, x0, objs, ph }; };
    const body = at(30), hug = at(0), tip = at(Math.round(M.r1 - M.tipW * 0.5 - 15 - 16)), far = at(Math.round(M.r1 - 33 + 30), 'tux');
    expect(body.ph === 'pull' && body.objs === 0, `Whip: twisting away, nothing on the floor (${body.ph}, ${body.objs})`);
    expect(has(body.ev, 'hit', 0, { move: 'move1' }) && has(body.ev, 'pyBat', 0) && has(body.ev, 'down', 1) && Math.abs((body.hp - body.F.f[1].hp) - M.damage) < 1e-6, `Whip: lands up close, ${M.damage}, down (${kinds(body.ev)})`);
    expect(has(hug.ev, 'hit', 0, { move: 'move1' }), `Whip: right up against him it lands too (${kinds(hug.ev)})`);
    expect(has(tip.ev, 'hit', 0, { move: 'move1' }) && Math.abs((tip.hp - tip.F.f[1].hp) - M.tip.damage) < 1e-6, `Whip: the sweet spot, ${M.tip.damage} (${(tip.hp - tip.F.f[1].hp).toFixed(1)})`);
    let k0 = -1; { const F = mk(['pyth', 'duke']); place(F, 30); for (let k = 0; k < 40 && k0 < 0; k++) if (has(run(F, 1, { light: k < 2 }), 'hit', 0)) k0 = k; }
    expect(k0 >= 0 && k0 <= S(M.startup + M.active * 0.6) + 1, `Whip: fast, it lands ${k0} frames in`);
    expect(!has(far.ev, 'hit', 0) && far.F.f[1].hp === far.hp && has(far.ev, 'pyUnwind', 0) && far.F.f[0].ph === 'unwind' && far.F.f[0].dur >= M.miss - 1e-9, `Whip: out of reach, a whiff, carried round, open ${M.miss} s (${kinds(far.ev)})`);
    const [py, tx] = far.F.f; tx.x = py.x + py.r + tx.r + 40; tx.y = py.y;
    const ev = run(far.F, 30, {}, tap('heavy'));
    expect(has(ev, 'hit', 1, { move: 'move2' }), `Whip: punished after the whiff: Tux's toboggan lands (${kinds(ev)})`);
  }
  // ---- Slither
  { // the held way, untouchable; none held: sideways; a cooldown
    const F = mk(['pyth', 'duke']); place(F, 120); const py = F.f[0], E = py.stats.moves.evade, y0 = py.y, x0 = py.x;
    let ev = run(F, 2, { guard: true, x: 0, y: -1 });
    expect(has(ev, 'pySlither', 0) && py.inv > 0 && py.ph === 'slither', `Slither: untouchable (${py.ph})`);
    run(F, S(E.active) + 1);
    expect(Math.abs(py.y - (y0 - E.dist)) < 2 && Math.abs(py.x - x0) < 2 && py.inv <= 0, `Slither: ${E.dist} the held way (${(py.y - y0).toFixed(0)})`);
    run(F, S(E.recovery) + 2); run(F, 2, { guard: true }); run(F, 1);
    expect(py.move !== 'evade' && py.cd[3] > 0, 'Slither: on cooldown');
    const G = mk(['pyth', 'duke']); place(G, 120); const g = G.f[0], gy = g.y;
    run(G, 2, { guard: true }); run(G, S(E.active) + 1);
    expect(Math.abs(g.y - gy) > E.dist * 0.8, `Slither: none held, sideways round them (${(g.y - gy).toFixed(0)})`);
  }
}
