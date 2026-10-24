// Pyth's moves (js/kits/pyth.js), checked by test/fight.test.mjs: each does what it says, its tell shows, its answer works.
// T: the test's tools ({ mk, place, run, has, kinds, tap, S, expect }); lands: what each move card's clip must show.
export const lands = {
  move1: ev => ev.some(e => e.kind === 'pyCatch' && e.who === 0) && ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move1') && ev.some(e => e.kind === 'down' && e.who === 1),
  move2: ev => ev.some(e => e.kind === 'pyLift' && e.who === 0),
  move3: ev => ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move3'),
  evade: ev => ev.some(e => e.kind === 'pySlither' && e.who === 0) && !ev.some(e => e.kind === 'hit' && e.to === 0),
};

export function checks({ mk, place, run, has, kinds, tap, S, expect }) {
  // ---- Coil
  { // the rear shows the line through them; the lunge wraps them up, squeezes four times, tosses them down: 18 in all
    const F = mk(['pyth', 'duke']); place(F, 60); const [py, duke] = F.f, hp = duke.hp, M = py.stats.moves.move1;
    let ev = run(F, 4, tap('light'));
    const h = F.objs.find(o => o.kind === 'pyHiss');
    expect(py.ph === 'rear' && py.pose === 'rear' && h && h.ph === 'aim' && Math.abs(Math.sin(h.a)) < 0.05, `Coil: reared up, the line out toward them (${py.ph}, ${h && h.a.toFixed(2)})`);
    ev = ev.concat(run(F, S(M.startup + M.out + 0.05)));
    expect(has(ev, 'pyCatch', 0) && duke.state === 'grabbed' && py.ph === 'wrap', `Coil: caught and wrapped (${duke.state}, ${kinds(ev)})`);
    ev = ev.concat(run(F, S(M.wrapT + 0.2)));
    expect(ev.filter(e => e.kind === 'pySqueeze').length === M.ticks && has(ev, 'hit', 0, { move: 'move1' }) && has(ev, 'down', 1), `Coil: squeezed ${M.ticks} times, tossed down (${kinds(ev)})`);
    const total = M.bite.damage + M.ticks * M.squeeze + M.toss.damage;
    expect(Math.abs((hp - duke.hp) - total) < 1e-6, `Coil: ${total} in all (${(hp - duke.hp).toFixed(2)})`);
  }
  { // the toss goes the held way
    const F = mk(['pyth', 'duke']); place(F, 60); const duke = F.f[1], M = F.f[0].stats.moves.move1;
    run(F, S(M.startup + M.out + 0.05), tap('light')); run(F, S(M.wrapT + 0.25), { x: 0, y: 1 });
    expect(duke.y > F.f[0].y + 20, `Coil: tossed the held way (down: ${(duke.y - F.f[0].y).toFixed(0)})`);
  }
  { // stepped off the line during the rear: missed, sprawled out, open
    const F = mk(['pyth', 'duke']); place(F, 60); const duke = F.f[1], hp = duke.hp;
    const ev = run(F, 70, tap('light'), k => k > 4 && k < 40 ? { x: 0, y: -1 } : {});
    expect(!has(ev, 'pyCatch') && duke.hp === hp && has(ev, 'pySprawl', 0), `Coil: off the line, a miss (${kinds(ev)})`);
  }
  { // a blink just before it lands: through nothing
    const F = mk(['pyth', 'duke']); place(F, 60); const duke = F.f[1], hp = duke.hp, M = F.f[0].stats.moves.move1;
    const k0 = S(M.startup) - 2;
    const ev = run(F, 70, tap('light'), k => k >= k0 && k < k0 + 2 ? { guard: true, x: 0, y: -1 } : {});
    expect(!has(ev, 'pyCatch') && duke.hp === hp, `Coil: evaded (${kinds(ev)})`);
  }
  // ---- import antigravity
  { // the glow on them; still there when it's done: afloat, helpless, a small hit
    const F = mk(['pyth', 'duke']); place(F, 120); const [py, duke] = F.f, M = py.stats.moves.move2, hp = duke.hp;
    run(F, 1, { heavy: true });
    const gl = F.objs.find(o => o.kind === 'pyGlow');
    expect(gl && Math.hypot(gl.x - duke.x, gl.y - duke.y) < 1, 'antigravity: the glow under them');
    const ev = run(F, S(M.delay + 0.1));
    expect(has(ev, 'pyLift', 0) && duke.state === 'float' && duke.z > 4 && Math.abs((hp - duke.hp) - M.damage) < 1e-6, `antigravity: afloat (${duke.state}, z ${duke.z.toFixed(1)}, ${kinds(ev)})`);
    run(F, S(M.float + 0.3));
    expect(duke.state !== 'float' && duke.z === 0, `antigravity: back down after (${duke.state})`);
  }
  { // walked off the glow: it fizzles; one glow at a time
    const F = mk(['pyth', 'duke']); place(F, 120); const duke = F.f[1], M = F.f[0].stats.moves.move2;
    const ev = run(F, S(M.delay + 0.2), tap('heavy'), k => k > 4 ? { x: 1, y: 0 } : {});
    expect(has(ev, 'pyFizzle', 0) && !has(ev, 'pyLift') && duke.state !== 'float', `antigravity: walked off (${kinds(ev)})`);
    const G = mk(['pyth', 'duke']); place(G, 120); run(G, 50, tap('heavy')); G.f[0].cd[1] = 0; run(G, 2, tap('heavy'));
    expect(G.f[0].move !== 'move2' && G.objs.filter(o => o.kind === 'pyGlow').length === 1, `antigravity: one glow at a time (${G.f[0].move})`);
  }
  { // hit out of his cast: it fizzles
    const F = mk(['pyth', 'tux']); place(F, 40); const tux = F.f[1];
    const ev = run(F, 60, k => ({ heavy: k === 22 }), k => ({ light: k === 0 }));   // (the toboggan gets there during the cast)
    expect(has(ev, 'counter', 1) && has(ev, 'pyFizzle', 0) && tux.state !== 'float', `antigravity: countered, fizzled (${kinds(ev)})`);
  }
  // ---- Indentation Whip
  { // the arc shows; the body of it staggers, the tip knocks down; inside it or outside it, nothing
    const M = mk(['pyth', 'duke']).f[0].stats.moves.move3;
    const at = (gap, what) => { const F = mk(['pyth', 'duke']); place(F, gap); const hp = F.f[1].hp; run(F, 3, tap('special')); const arc = F.objs.find(o => o.kind === 'pyArc'); const ev = run(F, S(M.startup + M.active + 0.1)); return { F, ev, arc, hp, what }; };
    const body = at(70), tip = at(118), hug = at(2), far = at(140);
    expect(body.arc && body.arc.ph === 'aim' && body.F.f[0].ph === 'whip' || body.F.f[0].ph === 'recoil', 'Whip: the arc shown, then the sweep');
    expect(has(body.ev, 'hit', 0, { move: 'move3' }) && !has(body.ev, 'down', 1), `Whip: the body of it staggers (${kinds(body.ev)})`);
    expect(has(tip.ev, 'hit', 0, { move: 'move3' }) && has(tip.ev, 'down', 1), `Whip: the tip knocks down (${kinds(tip.ev)})`);
    expect(!has(hug.ev, 'hit', 0) && hug.F.f[1].hp === hug.hp, `Whip: right up against him, it passes over (${kinds(hug.ev)})`);
    expect(!has(far.ev, 'hit', 0) && far.F.f[1].hp === far.hp, `Whip: outside it, nothing (${kinds(far.ev)})`);
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
