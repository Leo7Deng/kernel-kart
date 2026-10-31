// Gopher's moves (js/kits/gopher.js), checked by test/fight.test.mjs: Dig & Pop, Burrow then Pop, and Deadlock
// (the Goroutine Rush and Burrow checks are still written out in fight.test.mjs). T: the test's tools ({ mk, place, run,
// has, kinds, tap, S, expect }); lands: what each move card's clip must show.
export const lands = {
  move1: ev => ev.some(e => e.kind === 'gopop' && e.who === 0 && e.hit) && ev.some(e => e.kind === 'down' && e.who === 1 && e.by === 0),
  move2: ev => ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move2'),
  move3: ev => ev.some(e => e.kind === 'gocave' && e.who === 0) && ev.some(e => e.kind === 'gopop' && e.who === 0 && e.hit && e.pit),   // (stuck, then up under them)
  evade: ev => ev.some(e => e.kind === 'goburrow' && e.who === 0) && ev.some(e => e.kind === 'gorumble' && e.who === 0) && ev.some(e => e.kind === 'gopop' && e.who === 0 && e.hit) && !ev.some(e => e.kind === 'hit' && e.to === 0),   // (Burrow then Pop)
};

export function checks({ mk, place, run, has, kinds, tap, S, expect }) {
  // ---- Dig & Pop: a HIT (fast, no aim, no hold, no floor tell)
  { // up close: the crouch, then the uppercut out of the ground launches them, almost at once
    const F = mk(['gopher', 'tux']); place(F, 6); const [go, tux] = F.f, M = go.stats.moves.move1, hp = tux.hp;
    run(F, 3, tap('light'));
    expect(go.ph === 'scoop' && go.pose === 'scoop' && !F.objs.some(o => o.kind === 'gocrack'), `Dig & Pop: the crouch, nothing on the floor yet (${go.ph}, ${go.pose})`);
    let at = -1; const ev = [];
    for (let k = 3; k < S(M.startup + M.active) + 6; k++) { const e = run(F, 1); ev.push(...e); if (at < 0 && has(e, 'hit', 0, { move: 'move1' })) at = k; }
    expect(at >= 0 && at <= S(M.startup + M.active) + 1 && has(ev, 'gopop', 0, { hit: true }) && has(ev, 'down', 1) && tux.hp < hp, `Dig & Pop: the uppercut floors them by ${(at / 60).toFixed(2)} s (${kinds(ev)})`);
    expect(Math.abs((hp - tux.hp) - M.damage) < 1e-6 && go.ph === 'uppercut', `Dig & Pop: ${M.damage} damage (${(hp - tux.hp).toFixed(1)}, ${go.ph})`);
  }
  { // at range: it whiffs, and he's left standing in his hole, open, for its miss time
    const F = mk(['gopher', 'tux']); place(F, 60); const [go, tux] = F.f, M = go.stats.moves.move1, hp = tux.hp;
    const ev = run(F, S(M.startup + M.active) + 2, tap('light'));
    expect(!has(ev, 'hit', 0) && tux.hp === hp && has(ev, 'gopop', 0, { hit: false }) && go.ph === 'whiff' && go.state === 'recover' && Math.abs(go.dur - M.miss) < 1e-6, `Dig & Pop: whiffs at range, open ${M.miss} s (${kinds(ev)}, ${go.ph}, ${go.state})`);
  }
  { // behind him: nothing (it only hits in front)
    const F = mk(['gopher', 'tux']); place(F, 6); const [go, tux] = F.f, M = go.stats.moves.move1, hp = tux.hp;
    run(F, 1, tap('light')); go.face = Math.PI;
    const ev = run(F, S(M.startup + M.active) + 2);
    expect(tux.hp === hp && !has(ev, 'hit', 0), `Dig & Pop: nothing behind him (${kinds(ev)})`);
  }
  { // a whiff is punishable: the other walks in and lands their own uppercut while he's still in his hole
    const F = mk(['gopher', 'gopher']); place(F, 54);   // (past the reach)
    const [a, b] = F.f, M = a.stats.moves.move1, w = S(M.startup + M.active), hp = a.hp;
    const ev = run(F, w + 40, tap('light'), k => k >= w && k < w + 6 ? { x: -1 } : k >= w + 6 && k < w + 8 ? { light: true } : {});
    expect(has(ev, 'gopop', 0, { hit: false }) && has(ev, 'hit', 1, { move: 'move1' }) && has(ev, 'down', 0) && a.hp < hp, `Dig & Pop: a whiff punished (${kinds(ev)})`);
  }
  // ---- Burrow then Pop: Dig & Pop while underground cancels the burrow into the uppercut, right there
  { // a burrow in at them; Dig & Pop under: the mound stops and rumbles (still under, untouchable), then the uppercut
    // bursts up out of the ground where he is and floors them
    const F = mk(['gopher', 'tux']); place(F, 60); const [go, tux] = F.f, M = go.stats.moves.move1, hp = tux.hp;
    let ev = run(F, 21, k => ({ guard: k < 2, x: 1 }));
    expect(go.move === 'evade' && go.under && go.ph === 'burrow', `Burrow then Pop: under (${go.move}, ${go.ph})`);
    const x0 = go.x;
    ev = ev.concat(run(F, 3, tap('light')));
    expect(go.move === 'move1' && go.state === 'wind' && go.ph === 'rumble' && go.under && go.inv > 0 && has(ev, 'gorumble', 0) && Math.abs(go.x - x0) < 8, `Burrow then Pop: the burrow cancelled, rumbling under where he is (${go.move}, ${go.ph}, ${go.under}, ${(go.x - x0).toFixed(1)})`);
    expect(go.cd[0] > 0 && go.cd[3] > 0, `Burrow then Pop: both cooldowns spent (${go.cd})`);
    const ev2 = run(F, S(M.startup + M.active) + 12);
    expect(has(ev2, 'goout', 0) && has(ev2, 'hit', 0, { move: 'move1' }) && has(ev2, 'gopop', 0, { hit: true }) && has(ev2, 'down', 1) && tux.hp < hp && !go.under, `Burrow then Pop: the uppercut out of the ground floors them (${kinds(ev2)})`);
    expect(Math.abs((hp - tux.hp) - M.deepDmg) < 1e-6, `Burrow then Pop: the uppercut, harder out of the ground, ${M.deepDmg} (${(hp - tux.hp).toFixed(1)})`);
  }
  { // untouchable while it rumbles: a hit then goes through nothing
    const F = mk(['gopher', 'duke']); place(F, 30); const [go, duke] = F.f, hp = go.hp;
    run(F, 6, k => ({ guard: k < 2, x: -1 })); run(F, 2, tap('light'));
    expect(go.ph === 'rumble', `rumbling (${go.ph})`);
    duke.x = go.x + go.r + duke.r + 2; duke.y = go.y; duke.face = Math.PI;
    const ok = F.hitF(duke, go, duke.stats.moves.move1.hit, { dir: 0 });
    expect(!ok && go.hp === hp, `Burrow then Pop: nothing hits him while he rumbles under (${ok}, ${F.lastRes})`);
  }
  { // a plain Dig & Pop (not out of a burrow) is still the crouch, above ground
    const F = mk(['gopher', 'tux']); place(F, 6); const go = F.f[0];
    run(F, 3, tap('light'));
    expect(go.ph === 'scoop' && !go.under && go.inv <= 0, `plain Dig & Pop: the crouch, above ground (${go.ph})`);
  }
  // ---- the steered Burrow: longer, steered the held way, at most its cap
  { // set off one way, steered round the other: the mound turns, and runs no further than its cap
    const F = mk(['gopher', 'tux']); place(F, 200); const go = F.f[0], E = go.stats.moves.evade, x0 = go.x, y0 = go.y;
    let path = 0, px = go.x, py = go.y;
    for (let k = 0; k < S(E.active) - 1; k++) { run(F, 1, k < 2 ? { guard: true, x: 0, y: -1 } : { x: 1, y: 0 }); path += Math.hypot(go.x - px, go.y - py); px = go.x; py = go.y; }
    expect(go.move === 'evade' && go.under && go.x > x0 + 40 && go.y < y0 - 30, `steered Burrow: turned the held way (${(go.x - x0).toFixed(0)}, ${(go.y - y0).toFixed(0)})`);
    expect(path <= E.dist + 2 && path > E.dist * 0.8, `steered Burrow: at most ${E.dist} (${path.toFixed(0)})`);
    const ev = run(F, 4);
    expect(has(ev, 'goout', 0) && !go.under && go.state === 'recover', `steered Burrow: pops up open at the end (${kinds(ev)})`);
  }
  // ---- Deadlock: the crack races along the floor; it reaches them: stuck in the ground, then he comes
  { // it reaches a still foe: they sink in, stuck (no walking, no evade), pinned for its stuck s, then free
    const F = mk(['gopher', 'tux']); place(F, 120); const [go, tux] = F.f, M = go.stats.moves.move3, hp = tux.hp;
    run(F, 3, tap('special'));
    expect(go.ph === 'rear' && go.state === 'wind' && !F.objs.some(o => o.kind === 'godl'), `Deadlock: rearing up, no crack yet (${go.ph})`);
    let ev = run(F, S(M.startup) + 1);
    const cr = F.objs.find(o => o.kind === 'godl');
    expect(cr && cr.ph === 'run' && go.ph === 'slam' && has(ev, 'goslam', 0), `Deadlock: paws in, the crack sets off (${kinds(ev)})`);
    ev = run(F, S(120 / M.speed) + 4);
    expect(has(ev, 'gocave', 0) && tux.state === 'dizzy' && Math.abs((hp - tux.hp) - M.damage) < 1e-6 && F.objs.some(o => o.kind === 'gopit' && o.ph === 'stuck'), `Deadlock: caught, stuck (${kinds(ev)}, ${tux.state}, ${(hp - tux.hp).toFixed(1)})`);
    expect(go.state === 'recover' && go.dur <= M.recovery + 1e-6, `Deadlock: he's up quickly once it catches (${go.state}, ${go.dur})`);
    const x0 = tux.x, y0 = tux.y;
    ev = run(F, S(M.stuck) - 20, k => ({ x: -1, y: 0.5, guard: k % 10 === 0 }));
    expect(tux.state === 'dizzy' && Math.hypot(tux.x - x0, tux.y - y0) < 0.01 && tux.move !== 'evade', `Deadlock: stuck in place, no evade (${tux.state}, ${(tux.x - x0).toFixed(2)})`);
    ev = run(F, 30);
    expect(tux.state !== 'dizzy' && has(ev, 'goclimb', 0) && go.dlNo > 0, `Deadlock: out after ${M.stuck} s (${kinds(ev)}, ${tux.state})`);
  }
  { // the payoff: Dig & Pop on someone stuck hits harder (pitDmg more), and knocks them out of the hole
    const F = mk(['gopher', 'tux']); place(F, 120); const [go, tux] = F.f, M = go.stats.moves.move3, P1 = go.stats.moves.move1;
    run(F, S(M.startup + 120 / M.speed) + 6, tap('special'));
    expect(tux.state === 'dizzy', `Deadlock: stuck for the pop (${tux.state})`);
    go.x = tux.x - go.r - tux.r - 6; go.y = tux.y; go.face = 0; go.state = 'idle'; go.move = null; go.ph = '';
    const hp = tux.hp, ev = run(F, S(P1.startup + P1.active) + 4, tap('light'));
    expect(has(ev, 'gopop', 0, { hit: true, pit: true }) && Math.abs((hp - tux.hp) - (P1.damage + P1.pitDmg)) < 1e-6 && has(ev, 'down', 1), `Deadlock: Dig & Pop out of the hole, ${P1.damage + P1.pitDmg} (${(hp - tux.hp).toFixed(1)}, ${kinds(ev)})`);
    expect(!F.objs.some(o => o.kind === 'gopit' && o.ph === 'stuck') && has(ev, 'goclimb', 0, { hit: true }), `Deadlock: knocked out of the hole (${kinds(ev)})`);
  }
  { // stepping off its line once it's coming: it runs out, and he's left panting, open
    const F = mk(['gopher', 'tux']); place(F, 180); const [go, tux] = F.f, M = go.stats.moves.move3, hp = tux.hp;
    const ev = run(F, S(M.startup + M.len / M.speed) + 8, tap('special'), k => k >= S(M.startup) && k < S(M.startup) + 16 ? { x: 0, y: 1 } : {});
    expect(!has(ev, 'gocave') && has(ev, 'gofizz', 0) && tux.hp === hp && tux.state !== 'dizzy', `Deadlock: stepped off the line, it runs out (${kinds(ev)})`);
    expect(go.ph === 'pant' && go.state === 'recover' && Math.abs(go.dur - M.miss) < 1e-6, `Deadlock: panting, open ${M.miss} s (${go.ph}, ${go.state}, ${go.dur})`);
  }
  { // just up off a knockdown (safe): it runs on under them
    const F = mk(['gopher', 'tux']); place(F, 120); const [go, tux] = F.f, M = go.stats.moves.move3;
    run(F, S(M.startup) + 2, tap('special')); tux.safeT = 0.6;
    const ev = run(F, S(120 / M.speed) + 4);
    expect(!has(ev, 'gocave') && tux.state !== 'dizzy', `Deadlock: not on someone safe off a get-up (${kinds(ev)}, ${tux.state})`);
  }
  { // just out of one of his holes: not stuck again straight away (no chains)
    const F = mk(['gopher', 'tux']); place(F, 120); const [go, tux] = F.f, M = go.stats.moves.move3;
    run(F, S(M.startup + 120 / M.speed + M.stuck) + 12, tap('special'));
    expect(tux.state !== 'dizzy' && go.dlNo > 0, `Deadlock: free again (${tux.state}, ${go.dlNo})`);
    go.cd[2] = 0; go.state = 'idle'; go.move = null; go.ph = ''; tux.x = go.x + 120; tux.y = go.y; tux.vx = tux.vy = 0;
    const ev = run(F, S(M.startup + 120 / M.speed) + 6, tap('special'));
    expect(!has(ev, 'gocave') && tux.state !== 'dizzy', `Deadlock: not again while they're just out (${kinds(ev)})`);
  }
  { // hit out of it while it runs: the crack stops
    const F = mk(['gopher', 'tux']); place(F, 200); const [go, tux] = F.f, M = go.stats.moves.move3;
    run(F, S(M.startup) + 4, tap('special'));
    const cr = F.objs.find(o => o.kind === 'godl');
    F.hitF(tux, go, go.stats.moves.move2, { dir: Math.PI, obj: true });
    const ev = run(F, S(200 / M.speed) + 4);
    expect(cr && cr.ph === 'out' && !has(ev, 'gocave'), `Deadlock: stopped when he's hit (${cr && cr.ph}, ${kinds(ev)})`);
  }
  { // a player's aim starts on them: a target off to one side still gets caught, without holding anything
    const F = mk(['gopher', 'tux']); place(F, 120); const [go, tux] = F.f, M = go.stats.moves.move3;
    tux.y = go.y + 60; go.face = 0;
    const ev = run(F, S(M.startup + 140 / M.speed) + 6, tap('special'));
    expect(has(ev, 'gocave', 0), `Deadlock: aimed at them (${kinds(ev)})`);
  }
  { // Dig & Pop on cooldown: pressing it under does nothing, the burrow goes on
    const F = mk(['gopher', 'tux']); place(F, 100); const go = F.f[0];
    run(F, 6, k => ({ guard: k < 2, x: 1 })); go.cd[0] = 1;
    run(F, 3, tap('light'));
    expect(go.move === 'evade' && go.ph === 'burrow', `Burrow then Pop: not while Dig & Pop cools down (${go.move}, ${go.ph})`);
  }
}
