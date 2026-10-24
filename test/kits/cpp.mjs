// Cpp's moves (js/kits/cpp.js), checked by test/fight.test.mjs: each does what it says, its tell shows, its answer works.
// T: the test's tools ({ mk, place, run, has, kinds, tap, S, expect }); lands: what each move card's clip must show.
export const lands = {
  move1: ev => ev.some(e => e.kind === 'cpBoom' && e.who === 0 && e.hit) && ev.some(e => e.kind === 'down' && e.who === 1),
  move2: ev => ev.some(e => e.kind === 'cpGoo' && e.who === 0),
  move3: ev => ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move3') && ev.some(e => e.kind === 'down' && e.who === 1 && e.by === 0),
  evade: ev => ev.some(e => e.kind === 'cpDead' && e.who === 0) && !ev.some(e => e.kind === 'hit' && e.to === 0),
};

export function checks({ mk, place, run, has, kinds, tap, S, expect }) {
  const mineOf = F => F.objs.find(o => o.kind === 'cpmine');
  // ---- Segfault
  { // flicked out between them; it arms; walked onto, it clicks and blows them down
    const F = mk(['cpp', 'tux']); place(F, 150); const [cp, tux] = F.f, M = cp.stats.moves.move1, hp = tux.hp;
    run(F, S(M.startup) + 3, tap('light'));
    const m = mineOf(F);
    expect(m && m.ph === 'arm' && m.x > cp.x + 20 && m.x < tux.x - 20 && cp.pose === 'lay', `Segfault: a mine between them, arming (${m && m.ph}, ${m && m.x.toFixed(0)})`);
    let ev = run(F, S(M.arm));
    expect(m.ph === 'live' && has(ev, 'cpArm', 0), `Segfault: armed (${m.ph})`);
    ev = run(F, 90, {}, { x: -1 });
    expect(has(ev, 'cpClick', 0) && has(ev, 'cpBoom', 0, { hit: true }) && has(ev, 'down', 1) && tux.hp < hp, `Segfault: walked onto, it clicks and blows (${kinds(ev)})`);
  }
  { // off it the moment it clicks: the blast misses
    const F = mk(['cpp', 'tux']); place(F, 150); const tux = F.f[1], M = F.f[0].stats.moves.move1, hp = tux.hp;
    run(F, S(M.startup + M.arm) + 4, tap('light'));
    let clicked = false; const ev = [];
    for (let k = 0; k < 90; k++) { const e = run(F, 1, {}, { x: clicked ? 1 : -1 }); ev.push(...e); if (has(e, 'cpClick')) clicked = true; }
    expect(clicked && has(ev, 'cpBoom', 0, { hit: false }) && tux.hp === hp, `Segfault: walked off on the click (${kinds(ev)})`);
  }
  { // burrowed across it, untouchable: it pops harmlessly
    const F = mk(['cpp', 'gopher']); place(F, 150); const go = F.f[1], M = F.f[0].stats.moves.move1, hp = go.hp;
    run(F, S(M.startup + M.arm) + 4, tap('light'));
    const m = mineOf(F); go.x = m.x + 50;
    const ev = run(F, 60, {}, k => k < 2 ? { guard: true, x: -1 } : {});
    expect(has(ev, 'cpDud', 0) && !has(ev, 'cpBoom') && go.hp === hp, `Segfault: evaded over it, a dud (${kinds(ev)})`);
  }
  { // two at most
    const F = mk(['cpp', 'tux']); place(F, 200); const cp = F.f[0];
    for (let k = 0; k < 3; k++) { cp.cd = [0, 0, 0, 0]; run(F, 40, tap('light')); }
    expect(F.objs.filter(o => o.kind === 'cpmine').length === 2, `Segfault: two mines at most (${F.objs.filter(o => o.kind === 'cpmine').length})`);
  }
  // ---- Memory Leak
  { // he scurries off steering, a trail behind; walking in it is slow and eats your health
    const F = mk(['cpp', 'tux']); place(F, 120); const [cp, tux] = F.f, M = cp.stats.moves.move2;
    run(F, S(M.startup) + 2, tap('heavy'), { x: 0, y: 1 });
    expect(cp.ph === 'leak' && cp.pose === 'scurry', `Leak: scurrying (${cp.ph}, ${cp.pose})`);
    run(F, S(M.active) + 2, { x: 0, y: 1 });
    const lk = F.objs.find(o => o.kind === 'cpleak');
    expect(lk && lk.pts.length > 10, `Leak: a trail behind him (${lk && lk.pts.length} blobs)`);
    const p = lk.pts[Math.floor(lk.pts.length / 2)];
    Object.assign(tux, { x: p[0], y: p[1], vx: 0, vy: 0, state: 'idle', move: null }); cp.x = -180; cp.y = -150;
    const x0 = tux.x, hp = tux.hp, ev = run(F, 20, {}, { x: 0, y: -1 }), slowD = Math.hypot(tux.x - x0, tux.y - p[1]);
    const G = mk(['cpp', 'tux']); place(G, 120); const t2 = G.f[1]; Object.assign(t2, { x: p[0], y: p[1] }); run(G, 20, {}, { x: 0, y: -1 });
    const freeD = Math.hypot(t2.x - p[0], t2.y - p[1]);
    expect(has(ev, 'cpGoo', 0) && tux.hp < hp && slowD < freeD * 0.8, `Leak: slow and eats health in it (${slowD.toFixed(0)} vs ${freeD.toFixed(0)}, ${(hp - tux.hp).toFixed(2)})`);
  }
  // ---- Gnaw Frenzy
  { // three chomps, each one's bite marks first; the third floors them; Manual Memory's 15%
    const F = mk(['cpp', 'tux']); place(F, 40); const [cp, tux] = F.f, M = cp.stats.moves.move3, hp = tux.hp;
    run(F, 3, tap('special'));
    const b = F.objs.find(o => o.kind === 'cpbite');
    expect(cp.ph === 'rear' && cp.pose === 'rear' && b && b.ph === 'aim' && b.x > cp.x, `Gnaw: rearing, the bite marks ahead (${cp.ph})`);
    const ev = run(F, S(M.startup + M.active) + 6);
    const n = ev.filter(e => e.kind === 'hit' && e.who === 0 && e.move === 'move3').length, want = (M.hit.damage * 2 + M.last.damage) * 1.15;
    expect(n === 3 && has(ev, 'down', 1) && Math.abs((hp - tux.hp) - want) < 0.01, `Gnaw: three chomps, down, ${want.toFixed(2)} (${n}, ${(hp - tux.hp).toFixed(2)})`);
  }
  { // stepped aside before the first: every chomp misses (he only turns a little), he pants after, open
    const F = mk(['cpp', 'tux']); place(F, 40); const [cp, tux] = F.f, M = cp.stats.moves.move3, hp = tux.hp;
    const ev = run(F, S(M.startup + M.active) + 4, tap('special'), k => k > 6 ? { x: 0.3, y: -1 } : {});
    expect(tux.hp === hp && has(ev, 'cpPant', 0) && cp.ph === 'pant' && cp.pose === 'pant', `Gnaw: stepped aside, missed, panting (${kinds(ev)}, ${cp.ph})`);
  }
  // ---- Play Dead
  { // on his back, untouchable and rooted; then he scrambles up, open
    const F = mk(['cpp', 'tux']); place(F, 30); const cp = F.f[0], E = cp.stats.moves.evade, x0 = cp.x;
    let ev = run(F, 2, { guard: true, x: -1 });
    expect(cp.ph === 'dead' && cp.pose === 'dead' && cp.inv > 0 && has(ev, 'cpDead', 0) && F.objs.some(o => o.kind === 'cpstink'), `Play Dead: on his back, untouchable (${cp.ph})`);
    ev = run(F, S(E.active), { x: -1 });
    expect(Math.abs(cp.x - x0) < 0.5 && has(ev, 'cpUp', 0) && cp.state === 'recover' && cp.ph === 'scramble' && cp.inv <= 0, `Play Dead: rooted, then scrambles up, open (${cp.state}, ${(cp.x - x0).toFixed(1)})`);
  }
  { // the stink slows them walking in it
    const walk = dead => { const F = mk(['cpp', 'tux']); place(F, 20); const tux = F.f[1], y0 = tux.y; run(F, 2, dead ? { guard: true } : {}); run(F, 14, {}, { x: 0, y: -1 }); return y0 - tux.y; };
    const slowD = walk(true), freeD = walk(false);
    expect(slowD < freeD * 0.75, `Play Dead: the stink slows them (${slowD.toFixed(0)} vs ${freeD.toFixed(0)})`);
  }
  { // Manual Memory: hits on him do 15% more
    const F = mk(['tux', 'cpp']); place(F, 120); const cp = F.f[1], hp = cp.hp, M = F.f[0].stats.moves.move1;
    run(F, 80, tap('light'));
    expect(Math.abs((hp - cp.hp) - M.damage * 1.15) < 0.01, `Manual Memory: ${M.damage * 1.15} from the toboggan (${(hp - cp.hp).toFixed(2)})`);
  }
}
