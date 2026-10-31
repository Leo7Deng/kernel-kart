// Tux's moves (js/kits/tux.js), checked by test/fight.test.mjs: each does what it says, its tell
// shows, its answer works. T: the test's tools ({ mk, place, run, has, kinds, tap, S, expect }); lands: what each move
// card's clip must show.
export const lands = {
  move1: ev => ev.some(e => e.kind === 'txThwack' && e.who === 0 && e.wal) && ev.some(e => e.kind === 'down' && e.who === 1),   // (three in a row: the wallop floors him)
  move2: ev => ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move2') && ev.some(e => e.kind === 'txRam' && e.who === 0),
  move3: ev => ev.some(e => e.kind === 'txArmor' && e.who === 0) && ev.some(e => e.kind === 'txChip' && e.who === 0) && ev.some(e => e.kind === 'txThwack' && e.who === 0 && e.frz) && ev.some(e => e.kind === 'down' && e.who === 1),
  evade: ev => ev.some(e => e.kind === 'txDive' && e.who === 0) && !ev.some(e => e.kind === 'hit' && e.to === 0),
};

export function checks({ mk, place, run, has, kinds, tap, S, expect }) {
  const armUp = F => { const M = F.f[0].stats.moves.move3; run(F, S(M.startup + M.active) + 2, tap('special')); };
  // ---- Frozen Fish
  { // the fish out from behind his back (the tell), a short slap: 7, a stagger, no knockdown; a row of one
    const F = mk(['tux', 'duke']); place(F, 14); const [tux, duke] = F.f, M = tux.stats.moves.move1, hp = duke.hp;
    let ev = run(F, 3, tap('light'));
    expect(tux.state === 'wind' && tux.ph === 'fishout' && tux.pose === 'fishback' && has(ev, 'txFishOut', 0), `Fish: out from behind his back (${tux.ph}, ${tux.pose})`);
    ev = ev.concat(run(F, S(M.startup + M.active) + 6));
    expect(has(ev, 'txSlap', 0) && has(ev, 'hit', 0, { move: 'move1' }) && has(ev, 'txThwack', 0, { n: 1 }) && !has(ev, 'down', 1) && Math.abs(hp - duke.hp - M.damage) < 1e-6, `Fish: a slap, ${M.damage}, no knockdown (${kinds(ev)}, ${(hp - duke.hp).toFixed(2)})`);
    expect(tux.fishN === 1, `Fish: a row of one (${tux.fishN})`);
  }
  { // slaps in a row build: the third is the wallop, wound up higher and longer, and it knocks down (the row's gone after)
    const F = mk(['tux', 'duke']); place(F, 14); const [tux, duke] = F.f, M = tux.stats.moves.move1, L = M.last;
    for (let n = 0; n < 2; n++) { run(F, S(M.startup + M.active + M.recovery) + 4, tap('light')); place(F, 14); }
    expect(tux.fishN === 2, `Fish: two in a row (${tux.fishN})`);
    const hp = duke.hp;
    let ev = run(F, 3, tap('light'));
    expect(tux.ph === 'walup' && tux.pose === 'walup' && Math.abs(tux.dur - L.startup) < 1e-9, `Fish: the third is the wallop, raised overhead (${tux.ph}, ${tux.dur})`);
    ev = ev.concat(run(F, S(L.startup + L.active) + 8));
    expect(has(ev, 'txThwack', 0, { wal: 1 }) && has(ev, 'down', 1) && Math.abs(hp - duke.hp - L.damage) < 1e-6 && tux.fishN === 0, `Fish: the wallop floors him, ${L.damage} (${kinds(ev)}, ${(hp - duke.hp).toFixed(2)}), the row gone (${tux.fishN})`);
  }
  { // the row breaks: a whiff (open, punished), or too long without one
    const F = mk(['tux', 'tux']); const M = F.f[0].stats.moves.move1; place(F, M.reach + 30); const [tux, t2] = F.f, hp = t2.hp;
    tux.fishN = 1; tux.fishT = 0; tux.fishH = tux.hurtN;
    let ev = run(F, S(M.startup + M.active) + 2, tap('light'));
    expect(!has(ev, 'hit', 0) && t2.hp === hp && has(ev, 'txFlop', 0) && tux.ph === 'fishmiss' && tux.state === 'recover' && Math.abs(tux.dur - M.miss) < 1e-9 && tux.fishN === 0, `Fish: out of reach, a whiff, open ${M.miss} s, the row gone (${kinds(ev)}, ${tux.ph}, ${tux.fishN})`);
    t2.x = tux.x + tux.r + t2.r + 8; t2.y = tux.y; t2.face = Math.PI;
    ev = run(F, 30, {}, tap('light'));
    expect(has(ev, 'hit', 1, { move: 'move1' }), `Fish: punished after a whiff (${kinds(ev)})`);
    const G = mk(['tux', 'duke']); place(G, 200); const g0 = G.f[0]; g0.fishN = 2; g0.fishT = 0; g0.fishH = g0.hurtN;
    run(G, S(M.row) + 2);
    expect(g0.fishN === 0, `Fish: the row's gone after ${M.row} s (${g0.fishN})`);
  }
  { // hit as the fish comes out: a counter hit, no slap
    const F = mk(['tux', 'duke']); place(F, 10);
    run(F, 1, tap('light'));
    const ev = run(F, 20, {}, tap('light'));
    expect(has(ev, 'counter', 1) && !has(ev, 'txSlap', 0), `Fish: hit out of the wind-up (${kinds(ev)})`);
  }
  // ---- Belly Slide
  { // the flop (the tell), then on his belly: it rams them down
    const F = mk(['tux', 'duke']); place(F, 100); const [tux, duke] = F.f;
    run(F, 3, tap('heavy'));
    expect(tux.ph === 'flop' && tux.pose === 'crouch', `Slide: the flop (${tux.ph}, ${tux.pose})`);
    const ev = run(F, 50);
    expect(has(ev, 'txSlide', 0) && has(ev, 'hit', 0, { move: 'move2' }) && has(ev, 'txRam', 0) && has(ev, 'down', 1), `Slide: it rams them down (${kinds(ev)})`);
  }
  { // steered the held way, no quicker than its turn
    const F = mk(['tux', 'duke']); place(F, 300); const tux = F.f[0], M = tux.stats.moves.move2;
    run(F, S(M.startup) + 1, tap('heavy'));
    const a0 = tux.face, n = 12;
    run(F, n, { x: 0, y: 1 });
    const turned = tux.face - a0;
    expect(turned > 0.05 && turned <= M.turn * n / 60 + 1e-6, `Slide: steered the held way, at most ${M.turn} rad/s (${turned.toFixed(3)} in ${n} frames)`);
  }
  { // missing: flat on his belly, open, punished; a streak of frost left, and the next slide along it is quicker
    const F = mk(['tux', 'tux']); const [tux, t2] = F.f, M = tux.stats.moves.move2; place(F, Math.round(M.speed * M.active) + 60); const hp = t2.hp;
    tux.y = t2.y = -40;
    let ev = run(F, S(M.startup + M.active) + 8, tap('heavy'));
    expect(t2.hp === hp && !has(ev, 'hit', 0) && has(ev, 'txBelly', 0) && tux.ph === 'belly' && tux.state === 'recover', `Slide: a miss, flat on his belly (${kinds(ev)}, ${tux.ph})`);
    const st = F.objs.find(o => o.kind === 'txStreak');
    expect(st && st.pts.length >= 4, `Slide: a frost streak laid behind him (${st && st.pts.length} points)`);
    t2.x = tux.x + tux.r + t2.r + 40; t2.y = tux.y; t2.face = Math.PI;
    ev = run(F, 30, {}, tap('heavy'));
    expect(has(ev, 'hit', 1, { move: 'move2' }), `Slide: punished lying there (${kinds(ev)})`);
    const G = mk(['tux', 'duke']); place(G, 300); const g0 = G.f[0]; g0.x = -150; g0.y = 0; G.f[1].x = 150; G.f[1].y = 120;
    G.objs.push({ id: ++G.oid, kind: 'txStreak', pts: [[-200, 0], [-100, 0], [0, 0], [100, 0], [200, 0]], fade: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0, t: 0, life: 9, owner: 0, hit: false, mv: 'move2', ms: -5 });
    run(G, S(M.startup) + 8, k => ({ heavy: k < 2, x: 1 }));
    expect(Math.hypot(g0.vx, g0.vy) > M.speed * (1 + (M.streak - 1) * 0.4), `Slide: quicker along his old streak (${Math.hypot(g0.vx, g0.vy).toFixed(0)} of ${M.speed})`);
  }
  { // a wall head on: he bounces off it and slides on
    const F = mk(['tux', 'duke']); place(F, 300, { a: { x: 0, y: 0 }, b: { x: 0, y: 200 } }); const tux = F.f[0];
    tux.x = (F.A.bounds.shape === 'circle' ? F.A.bounds.r : F.A.bounds.w / 2) - 60;
    let ev = run(F, 1, { heavy: true }); tux.face = 0;
    ev = ev.concat(run(F, 30));
    expect(has(ev, 'txBounce', 0) && Math.cos(tux.face) < 0, `Slide: off the wall and on (${kinds(ev)}, facing ${tux.face.toFixed(2)})`);
  }
  // ---- Ice Armour
  { // the ice growing (the tell), then armour: a hit chips it, no damage, he doesn't flinch; the last chip bursts it,
    // staggering whoever's next to him; its cooldown only starts once it's gone
    const F = mk(['tux', 'duke']); place(F, 14); const [tux, duke] = F.f, A = tux.stats.moves.move3, hp = tux.hp;
    let ev = run(F, 3, tap('special'));
    expect(tux.ph === 'armup' && tux.state === 'wind' && has(ev, 'txArmUp', 0), `Armour: the ice growing (${tux.ph})`);
    ev = run(F, S(A.startup + A.active));
    expect(tux.arm === A.chips && has(ev, 'txArmor', 0), `Armour: on, ${A.chips} chips (${tux.arm})`);
    run(F, 10);
    ev = run(F, 8, {}, tap('light'));   // (Duke's one-two: its first jab)
    expect(tux.hp === hp && tux.arm === A.chips - 1 && has(ev, 'txChip', 0) && tux.state !== 'hurt' && !has(ev, 'hit', 1), `Armour: Duke's jab chips it, no damage, no flinch (${kinds(ev)}, ${tux.arm}, ${tux.state})`);
    expect(tux.cd[2] >= A.cooldown - 1e-6, `Armour: its cooldown held while it lasts (${tux.cd[2].toFixed(2)})`);
    const dh = duke.hp; ev = [];
    for (let k = 0; k < 90 && tux.arm > 0; k++) ev.push(...run(F, 1, {}, { light: k % 30 < 2 }));
    expect(tux.arm === 0 && has(ev, 'txShatter', 0, { why: 'break', stag: 1 }) && duke.hp < dh && tux.hp === hp, `Armour: the last chip bursts it, the shards hit Duke (${kinds(ev)}, ${(dh - duke.hp).toFixed(1)})`);
    const G = mk(['tux', 'duke']); place(G, 200); armUp(G); const g0 = G.f[0];
    const e2 = run(G, S(A.last) + 2);
    expect(g0.arm === 0 && has(e2, 'txShatter', 0, { why: 'out', stag: -1 }), `Armour: it runs out after ${A.last} s, nobody near (${kinds(e2)})`);
    expect(g0.cd[2] > A.cooldown - 0.2, `Armour: its cooldown starts then (${g0.cd[2].toFixed(2)})`);
  }
  { // hit as it grows: a counter hit, no armour
    const F = mk(['tux', 'duke']); place(F, 10);
    run(F, 1, tap('special'));
    const ev = run(F, 20, {}, tap('light'));
    expect(has(ev, 'counter', 1) && !has(ev, 'txArmor', 0) && F.f[0].arm === 0, `Armour: hit out of the wind-up (${kinds(ev)})`);
  }
  { // armoured, the fish freezes whoever it slaps (stuck a moment), and the slide ploughs through hits and through them
    const F = mk(['tux', 'duke']); place(F, 14); armUp(F); const [tux, duke] = F.f, M = tux.stats.moves.move1;
    place(F, 14); run(F, 4);
    let ev = run(F, S(M.startup + M.active) + 4, tap('light'));
    expect(has(ev, 'txThwack', 0, { frz: 1 }) && duke.state === 'stagger' && tux.iceT > 0 && tux.iceTo === 1, `Armour: the fish freezes him (${kinds(ev)}, ${duke.state})`);
    const G = mk(['tux', 'duke']); place(G, 90); armUp(G); place(G, 90); run(G, 4); const g0 = G.f[0], d2 = G.f[1], S2 = g0.stats.moves.move2;
    ev = run(G, S(S2.startup) + 3, tap('heavy'), k => ({ light: k > S(S2.startup) - 2 && k < S(S2.startup) + 1 }));
    ev = ev.concat(run(G, 25));
    expect(has(ev, 'hit', 0, { move: 'move2' }) && has(ev, 'txRam', 0, { plow: 1 }) && d2.state === 'down', `Armour: the slide ploughs through him (${kinds(ev)}, ${d2.state})`);
  }
  { // one suit at a time; Duke's pot doesn't stick on it
    const F = mk(['tux', 'duke']); place(F, 4); armUp(F); const tux = F.f[0];
    run(F, 20); tux.cd[2] = 0; run(F, 2, tap('special')); run(F, 1);
    expect(tux.move !== 'move3', `Armour: not again while it's on (${tux.move})`);
    place(F, 4);
    const ev = run(F, S(0.4), {}, tap('heavy'));
    expect(!F.objs.some(o => o.kind === 'pot') && has(ev, 'txChip', 0), `Armour: no pot sticks on it (${kinds(ev)})`);
  }
  // ---- Snow Dive
  { // the held way, untouchable under the snow, then up, open; away from them if nothing's held; a cooldown
    const F = mk(['tux', 'duke']); place(F, 120); const tux = F.f[0], E = tux.stats.moves.evade, y0 = tux.y, x0 = tux.x;
    let ev = run(F, 2, { guard: true, x: 0, y: -1 });
    expect(tux.move === 'evade' && tux.inv > 0 && has(ev, 'txDive', 0), `Dive: in (${tux.ph})`);
    run(F, S(E.dive) + 2);
    expect(tux.ph === 'under' && tux.under && tux.inv > 0, `Dive: under the snow, untouchable (${tux.ph})`);
    ev = run(F, S(E.active));
    expect(has(ev, 'txPop', 0) && tux.y < y0 - E.dist * 0.85 && tux.y > y0 - E.dist - 4 && Math.abs(tux.x - x0) < 2 && tux.state === 'recover' && tux.inv <= 0, `Dive: up ${E.dist} away, open (${(tux.y - y0).toFixed(0)}, ${tux.state})`);
    run(F, 30); run(F, 2, { guard: true });
    expect(tux.move !== 'evade', 'Dive: on cooldown after');
    const G = mk(['tux', 'duke']); place(G, 120); const g0 = G.f[0], gx = g0.x;
    run(G, 2, { guard: true }); run(G, S(E.active) + 2);
    expect(g0.x < gx - E.dist * 0.8, `Dive: nothing held, away from them (${(g0.x - gx).toFixed(0)})`);
  }
  { // out from under Duke's jab
    const F = mk(['tux', 'duke']); place(F, 12); const tux = F.f[0], hp = tux.hp;
    const ev = run(F, 40, k => ({ guard: k < 2, y: -1 }), k => ({ light: k > 1 && k < 4 }));
    expect(has(ev, 'txDive', 0) && tux.hp === hp && !has(ev, 'hit', 1), `Dive: through Duke's jab (${kinds(ev)})`);
  }
}
