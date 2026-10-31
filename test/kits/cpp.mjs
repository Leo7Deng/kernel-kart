// Cpp's moves (js/kits/cpp.js), checked by test/fight.test.mjs: each does what it says, its tell shows, its answer works.
// T: the test's tools ({ mk, place, run, has, kinds, tap, S, expect }); lands: what each move card's clip must show.
export const lands = {
  move1: ev => ev.some(e => e.kind === 'cpStick' && e.who === 0 && e.to === 1),
  move2: ev => ev.filter(e => e.kind === 'cpBite' && e.who === 0).length >= 3 && ev.some(e => e.kind === 'cpSwarm' && e.who === 0),
  move3: ev => ev.some(e => e.kind === 'cpGoo' && e.who === 0),
  evade: ev => ev.some(e => e.kind === 'cpDead' && e.who === 0) && !ev.some(e => e.kind === 'hit' && e.to === 0),
};

export function checks({ mk, place, run, has, kinds, tap, S, expect }) {
  const goo = F => F.objs.filter(o => o.kind === 'cpleak');
  const flies = F => F.objs.filter(o => o.kind === 'cpfly' && o.t < o.life);
  const wet = (ob, p) => ob.t >= p[2] && ob.t - p[2] < ob.goo;
  const base = { owner: 0, mv: null, ms: 0, t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, hit: false };
  // a trail of his laid by hand: n blobs from (x0, y0) to (x1, y1)
  const trail = (F, x0, y0, x1, y1, n = 9, goo = 12) => { const ob = { ...base, kind: 'cpleak', pts: Array.from({ length: n }, (_, k) => [x0 + (x1 - x0) * k / (n - 1), y0 + (y1 - y0) * k / (n - 1), 0]), r: 20, goo, src: 'leak', on: 0, life: goo + 0.2 }; ob.id = ++F.oid; F.objs.push(ob); return ob; };
  // a fly of his by hand: stuck on fighter 1, or a sentry at (x, y)
  const fly = (F, st, x = 0, y = 0) => { const ob = { ...base, kind: 'cpfly', st, x, y, z: 22, hx: x, hy: y, on: st === 'stuck' ? 1 : -1, oa: F.oid * 2.4, sT: 9, ttl: 9, rest: 0, dT: 0, was: '', wv: -1, wn: 0, life: 99 }; ob.id = ++F.oid; F.objs.push(ob); return ob; };
  const idle = (o, x, y) => Object.assign(o, { x, y, vx: 0, vy: 0, state: 'idle', move: null });
  // ---- Dangling Pointer
  { // flicked at them in range: it sticks (a nibble, no flinch) and buzzes on them, eating a little health
    const F = mk(['cpp', 'tux']); place(F, 150); const [cp, tux] = F.f, M = cp.stats.moves.move1, hp = tux.hp;
    let ev = run(F, 2, tap('light'));
    expect(cp.ph === 'flick' && cp.pose === 'wind', `Pointer: the wind-up (${cp.ph}, ${cp.pose})`);
    ev = ev.concat(run(F, S(M.startup + 0.5)));
    const f = flies(F)[0];
    expect(has(ev, 'cpFlick', 0) && has(ev, 'cpStick', 0) && f && f.st === 'stuck' && f.on === 1 && !has(ev, 'hit', 0) && tux.state !== 'hurt', `Pointer: the fly sticks to them, no flinch (${kinds(ev)}, ${f && f.st}, ${tux.state})`);
    const h1 = tux.hp; run(F, 120);
    expect(hp - h1 >= M.damage - 0.01 && h1 > tux.hp, `Pointer: a nibble, then it buzzes on them (${(hp - h1).toFixed(2)}, ${(h1 - tux.hp).toFixed(2)})`);
  }
  { // out of its range it misses and settles as a sentry over his nearest sludge
    const F = mk(['cpp', 'tux']); place(F, 330); const cp = F.f[0], M = cp.stats.moves.move1;
    const t = trail(F, -10, 60, 30, 60, 5);
    const ev = run(F, S(M.startup + M.range / M.speed) + 12, tap('light'));
    const f = flies(F)[0], d = f && Math.min(...t.pts.map(p => Math.hypot(p[0] - f.hx, p[1] - f.hy)));
    expect(f && f.st === 'sentry' && has(ev, 'cpSettle', 0, { goo: 1 }) && d < 1, `Pointer: a miss hovers over his sludge as a sentry (${f && f.st}, ${d && d.toFixed(0)}, ${kinds(ev)})`);
  }
  { // a sentry darts at whoever walks close, and sticks to them; one walked round from afar stays put
    const F = mk(['cpp', 'tux']); place(F, 300); const [cp, tux] = F.f, M = cp.stats.moves.move1;
    const s = fly(F, 'sentry', 60, 0); idle(tux, 160, 0);
    let ev = run(F, 30);
    expect(s.st === 'sentry' && !has(ev, 'cpDart', 0), `Pointer: a sentry waits while they're away (${s.st})`);
    ev = run(F, 60, {}, { x: -1 });
    expect(has(ev, 'cpDart', 0) && has(ev, 'cpStick', 0) && s.st === 'stuck', `Pointer: it darts at them as they come close and sticks (${kinds(ev)}, ${s.st})`);
  }
  { // an evade swats half the flies on you off, the same ones every step of it
    const F = mk(['tux', 'cpp']); place(F, 200); const tux = F.f[0];
    for (let k = 0; k < 4; k++) { const f = fly(F, 'stuck'); f.owner = 1; f.on = 0; }
    const ev = run(F, 8, { guard: true });
    expect(flies(F).length === 2 && ev.filter(e => e.kind === 'cpSwat').length === 2 && tux.move === 'evade', `Pointer: an evade swats half the flies off (${flies(F).length} left, ${kinds(ev)})`);
  }
  { // in his sludge, every fly on you slows you more
    const walk = n => { const F = mk(['cpp', 'tux']); place(F, 300); const tux = F.f[1]; trail(F, 100, -140, 100, 140, 25); idle(tux, 100, 100); for (let k = 0; k < n; k++) fly(F, 'stuck'); run(F, 30, {}, { x: 0, y: -1 }); return 100 - tux.y; };
    const d0 = walk(0), d3 = walk(3);
    expect(d3 < d0 * 0.85, `Pointer: carrying flies, his sludge slows you harder (${d3.toFixed(0)} vs ${d0.toFixed(0)})`);
  }
  { // at most cap flies: past it, the oldest sentry buzzes off
    const F = mk(['cpp', 'tux']); place(F, 300); const cp = F.f[0], M = cp.stats.moves.move1;
    for (let k = 0; k < M.cap; k++) fly(F, 'sentry', -150, -150 + k * 30);
    cp.cd = [0, 0, 0, 0]; run(F, S(M.startup) + 3, tap('light'));
    expect(flies(F).length === M.cap, `Pointer: at most ${M.cap} flies (${flies(F).length})`);
  }
  // ---- Use After Free
  { // no flies, no call
    const F = mk(['cpp', 'tux']); place(F, 150); const cp = F.f[0];
    run(F, 4, tap('heavy'));
    expect(cp.move !== 'move2', `Free: nothing to call without flies (${cp.move})`);
  }
  { // the call: they rise, then dive; each bites, three together stagger, and they're used up
    const F = mk(['cpp', 'tux']); place(F, 150); const [cp, tux] = F.f, U = cp.stats.moves.move2, hp = tux.hp;
    fly(F, 'stuck'); fly(F, 'stuck'); fly(F, 'sentry', -40, -60);
    let ev = run(F, 3, tap('heavy'));
    expect(cp.ph === 'call' && cp.pose === 'rear' && has(ev, 'cpCall', 0, { n: 3 }) && flies(F).every(f => f.st === 'rise'), `Free: the call, his flies rise (${cp.ph}, ${cp.pose}, ${flies(F).map(f => f.st)})`);
    ev = run(F, S(U.startup + U.diveT));
    const n = ev.filter(e => e.kind === 'cpBite' && e.who === 0).length;
    expect(n === 3 && has(ev, 'cpSwarm', 0) && has(ev, 'hit', 0, { move: 'move2' }) && flies(F).length === 0 && tux.hp < hp - 3 * U.damage, `Free: three bites, a stagger, all used up (${n}, ${kinds(ev)}, ${(hp - tux.hp).toFixed(1)})`);
  }
  { // one fly is a nibble: no flinch
    const F = mk(['cpp', 'tux']); place(F, 150); const [cp, tux] = F.f, U = cp.stats.moves.move2, hp = tux.hp;
    fly(F, 'stuck');
    const ev = run(F, S(U.startup + 0.5), tap('heavy'));
    expect(has(ev, 'cpBite', 0) && !has(ev, 'hit', 0) && !has(ev, 'cpSwarm', 0) && Math.abs(hp - tux.hp - U.damage) < 0.3, `Free: one bite, no flinch (${kinds(ev)}, ${(hp - tux.hp).toFixed(2)})`);
  }
  { // answered: an evade as they rise swats the ones on you off, and as the rest close in, they find nothing
    const F = mk(['cpp', 'tux']); place(F, 150); const [cp, tux] = F.f, U = cp.stats.moves.move2, hp = tux.hp;
    fly(F, 'stuck'); fly(F, 'stuck'); fly(F, 'sentry', -60, 0);
    const ev = run(F, S(U.startup + U.diveT), tap('heavy'), k => k >= S(U.startup) - 2 && k < S(U.startup) + 2 ? { guard: true, x: -1 } : {});
    expect(!has(ev, 'cpBite', 0) && ev.filter(e => e.kind === 'cpSwat').length === 3 && tux.hp === hp, `Free: evaded, nothing bites (${kinds(ev)})`);
  }
  // ---- Memory Leak
  { // he scurries off steering, a trail behind; walking in it poisons you (slow, no evade, no damage)
    const F = mk(['cpp', 'tux']); place(F, 120); const [cp, tux] = F.f, M = cp.stats.moves.move3;
    run(F, S(M.startup) + 2, tap('special'), { x: 0, y: 1 });
    expect(cp.ph === 'leak' && cp.pose === 'scurry', `Leak: scurrying (${cp.ph}, ${cp.pose})`);
    run(F, S(M.active) + 2, { x: 0, y: 1 });
    const lk = goo(F).find(o => o.src === 'leak');
    expect(lk && lk.pts.length > 10 && lk.goo === M.goo, `Leak: a trail behind him (${lk && lk.pts.length} blobs, lasting ${lk && lk.goo} s)`);
    const p = lk.pts[Math.floor(lk.pts.length / 2)];
    idle(tux, p[0], p[1]); cp.x = -180; cp.y = -150;
    const x0 = tux.x, hp = tux.hp, ev = run(F, 20, {}, { x: 0, y: -1 }), slowD = Math.hypot(tux.x - x0, tux.y - p[1]);
    const G = mk(['cpp', 'tux']); place(G, 120); const t2 = G.f[1]; Object.assign(t2, { x: p[0], y: p[1] }); run(G, 20, {}, { x: 0, y: -1 });
    const freeD = Math.hypot(t2.x - p[0], t2.y - p[1]);
    expect(has(ev, 'cpGoo', 0) && tux.hp === hp && slowD < freeD * 0.8 && tux.psnT > 0, `Leak: poisoned in it: slow, no damage (${slowD.toFixed(0)} vs ${freeD.toFixed(0)}, ${(hp - tux.hp).toFixed(2)}, poison ${tux.psnT.toFixed(2)})`);
    // poisoned: no evade (the press does nothing) while it lasts, a moment after stepping out; then it wears off
    run(F, 2, {}, { guard: true }); run(F, 2);
    expect(tux.move !== 'evade', `Leak: poisoned, no evade (${tux.move}, ${tux.state})`);
    tux.x = 150; tux.y = 150; const ev2 = run(F, S(M.psn) + 4);
    expect(tux.psnT === 0 && has(ev2, 'cure', 0), `Leak: the poison wears off ${M.psn} s after stepping out (${tux.psnT})`);
    run(F, 2, {}, { guard: true });
    expect(tux.move === 'evade', `Leak: cured, the evade works again (${tux.move})`);
  }
  { // two trails at a time: a third dries up the oldest
    const F = mk(['cpp', 'tux']); place(F, 200); const cp = F.f[0], M = cp.stats.moves.move3;
    for (const y of [1, -1, 1]) { cp.cd = [0, 0, 0, 0]; run(F, S(M.startup + M.active + M.recovery) + 4, tap('special'), { x: 0, y }); }
    run(F, 30);
    const n = goo(F).filter(o => o.src === 'leak' && o.pts.some(p => wet(o, p))).length;
    expect(n === 2, `Leak: two trails at a time (${n})`);
  }
  { // his sludge breeds flies: sentries hatch over it
    const F = mk(['cpp', 'tux']); place(F, 330); const cp = F.f[0], M = cp.stats.moves.move3;
    const t = trail(F, -60, 100, 60, 100, 11, 30);
    const ev = run(F, S(M.breed * 2.2));
    const L = flies(F), d = L.length && Math.min(...t.pts.map(p => Math.hypot(p[0] - L[0].hx, p[1] - L[0].hy)));
    expect(ev.filter(e => e.kind === 'cpHatch').length >= 2 && L.length >= 2 && L.every(f => f.st === 'sentry') && d < 1, `Leak: flies hatch over his sludge (${kinds(ev)}, ${L.length})`);
  }
  // ---- Sewer Rat: he skates on his own sludge
  {
    const walk = on => { const F = mk(['cpp', 'tux']); place(F, 300); const cp = F.f[0]; idle(cp, -100, 0); if (on) trail(F, -110, 0, 110, 0, 19); run(F, 30, { x: 1 }); return [cp.x + 100, cp]; };
    const [onD, cp] = walk(true), [offD] = walk(false);
    expect(onD > offD * 1.25 && cp.ph === 'skate', `Sewer Rat: quicker on his sludge (${onD.toFixed(0)} vs ${offD.toFixed(0)}, ${cp.ph})`);
  }
  // ---- Play Dead
  { // on his back, untouchable and rooted; then he flips up in a splash of sludge, open
    const F = mk(['cpp', 'tux']); place(F, 30); const cp = F.f[0], E = cp.stats.moves.evade, x0 = cp.x;
    let ev = run(F, 2, { guard: true, x: -1 });
    expect(cp.ph === 'dead' && cp.pose === 'dead' && cp.inv > 0 && has(ev, 'cpDead', 0) && F.objs.some(o => o.kind === 'cpstink'), `Play Dead: on his back, untouchable (${cp.ph})`);
    ev = run(F, S(E.active), { x: -1 });
    const pd = goo(F).find(o => o.src === 'dead');
    expect(Math.abs(cp.x - x0) < 0.5 && has(ev, 'cpUp', 0) && cp.state === 'recover' && cp.ph === 'scramble' && cp.inv <= 0 && pd && pd.goo === E.plife && Math.hypot(pd.pts[0][0] - cp.x, pd.pts[0][1] - cp.y) < 2, `Play Dead: rooted, then up in a splash, open (${cp.state}, ${(cp.x - x0).toFixed(1)}, ${!!pd})`);
  }
  { // the stink slows them walking in it
    const walk = dead => { const F = mk(['cpp', 'tux']); place(F, 20); const tux = F.f[1], y0 = tux.y; run(F, 2, dead ? { guard: true } : {}); run(F, 14, {}, { x: 0, y: -1 }); return y0 - tux.y; };
    const slowD = walk(true), freeD = walk(false);
    expect(slowD < freeD * 0.75, `Play Dead: the stink slows them (${slowD.toFixed(0)} vs ${freeD.toFixed(0)})`);
  }
}
