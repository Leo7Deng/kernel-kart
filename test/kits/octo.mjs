// Octo's moves (js/kits/octo.js), checked by test/fight.test.mjs: each does what it says, its tell shows, its answer works.
export const lands = {
  move1: ev => ev.some(e => e.kind === 'ocWhack' && e.who === 0 && !e.src) && ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move1'),
  move3: ev => ev.some(e => e.kind === 'ocFork' && e.who === 0) && ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move3'),
  move2: ev => ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move2'),
  evade: ev => ev.some(e => e.kind === 'ocInkJet' && e.who === 0) && !ev.some(e => e.kind === 'hit' && e.to === 0),
};

export function checks({ mk, place, run, has, kinds, tap, S, expect }) {
  const gapOf = F => Math.hypot(F.f[1].x - F.f[0].x, F.f[1].y - F.f[0].y) - F.f[0].r - F.f[1].r;
  // ---- git blame (the aimed tentacle: Pull Request's, without the reel)
  { // the coil shows the track at them, settling at its end; the tentacle shoots along it and knocks them back out to his
    // range, staggered (not down, never pulled in)
    const F = mk(['octo', 'duke']); place(F, 90); const [oc, duke] = F.f, hp = duke.hp, M = oc.stats.moves.move1;
    let ev = run(F, 4, tap('light'));
    const ln = F.objs.find(o => o.kind === 'ocLine');
    expect(oc.ph === 'coil' && oc.pose === 'coil' && ln && Math.abs(Math.sin(ln.a)) < 0.05 && !ln.lk, `Blame: coiled, the track at them, not settled yet (${oc.ph})`);
    ev = ev.concat(run(F, S(M.startup - M.lock) - 2));
    expect(ln.lk === 1 && has(ev, 'ocLock', 0), `Blame: the track settles before it shoots (${kinds(ev)})`);
    const g0 = gapOf(F);
    ev = ev.concat(run(F, S(M.lock + 0.3)));
    expect(has(ev, 'ocWhack', 0) && has(ev, 'hit', 0, { move: 'move1' }) && !has(ev, 'down', 1) && Math.abs((hp - duke.hp) - M.hit.damage) < 1e-6, `Blame: it lands, ${M.hit.damage}, no knockdown (${(hp - duke.hp).toFixed(1)}, ${kinds(ev)})`);
    run(F, 50);
    const g1 = gapOf(F);
    expect(g1 > g0 + 30 && Math.abs(g1 - M.keep) < 25, `Blame: knocked back out to his range (${g0.toFixed(0)} -> ${g1.toFixed(0)}, keep ${M.keep})`);
  }
  { // a human's aim follows a slow sideways walker until it settles; a step off the line once it has makes it miss: he
    // droops, open, and gets punished there
    const F = mk(['octo', 'duke']); place(F, 110); const M = F.f[0].stats.moves.move1;
    let ev = run(F, S(M.startup + 0.3), tap('light'), { x: 0, y: 0.35 });
    expect(has(ev, 'hit', 0, { move: 'move1' }), `Blame: tracked a slow walker and landed (${kinds(ev)})`);
    const G = mk(['octo', 'tux']); place(G, 110); const [oc, tux] = G.f, hp = tux.hp, lk = S(M.startup - M.lock);
    ev = run(G, S(M.startup + 0.35), tap('light'), k => k >= lk && k < lk + 24 ? { x: 0, y: -1 } : {});
    expect(!has(ev, 'ocWhack') && tux.hp === hp && has(ev, 'ocFlop', 0) && oc.ph === 'droop' && oc.state === 'recover', `Blame: stepped off once it settled, missed, open (${kinds(ev)}, ${oc.ph})`);
    tux.x = oc.x + oc.r + tux.r + 40; tux.y = oc.y; tux.face = Math.PI;
    ev = run(G, 30, {}, tap('heavy'));
    expect(has(ev, 'hit', 1, { move: 'move2' }), `Blame: punished after the miss: Tux's toboggan lands (${kinds(ev)})`);
  }
  { // up close it's slow: rushed in its coil, Tux's toboggan hits him first and it's gone
    const F = mk(['octo', 'tux']); place(F, 40); const oc = F.f[0], hp = oc.hp;
    const ev = run(F, 40, tap('light'), k => ({ heavy: k >= 3 && k < 5 }));
    expect(has(ev, 'hit', 1, { move: 'move2' }) && oc.hp < hp && !has(ev, 'ocWhack', 0), `Blame: rushed in its coil, Tux hits first (${kinds(ev)})`);
  }
  // ---- Fork
  { // the blot beside them, the clone pops up there; his next blame comes from both, two tracks; the clone's hit knocks
    // them AWAY from Octo
    const F = mk(['octo', 'duke']); place(F, 140); const [oc, duke] = F.f, M = oc.stats.moves.move3, B = oc.stats.moves.move1;
    run(F, 3, tap('special'));
    const sp = F.objs.find(o => o.kind === 'ocSpot');
    expect(sp && Math.abs(Math.hypot(sp.x - duke.x, sp.y - duke.y) - M.dist) < 4, `Fork: the blot ${M.dist} from them (${sp && Math.hypot(sp.x - duke.x, sp.y - duke.y).toFixed(0)})`);
    let ev = run(F, S(M.startup + 0.1));
    const cl = F.objs.find(o => o.kind === 'ocClone');
    expect(has(ev, 'ocFork', 0) && cl && sp && Math.hypot(cl.x - sp.x, cl.y - sp.y) < 1, `Fork: the clone on the blot (${kinds(ev)})`);
    run(F, S(M.recovery) + 2);
    ev = run(F, 4, tap('light'));
    const lines = F.objs.filter(o => o.kind === 'ocLine');
    expect(lines.length === 2 && lines.some(l => l.src === cl.id), `Fork: two tracks, his and the clone's (${lines.length})`);
    const d0 = Math.hypot(duke.x - oc.x, duke.y - oc.y);
    ev = ev.concat(run(F, S(B.startup + 0.25)));
    expect(ev.some(e => e.kind === 'ocShoot' && e.who === 0 && e.src) && has(ev, 'hit', 0, { move: 'move3' }), `Fork: a blame from each, the clone's lands (${kinds(ev)})`);
    run(F, 40);
    const d1 = Math.hypot(duke.x - oc.x, duke.y - oc.y);
    expect(d1 > d0 + 20 && !has(ev, 'down', 1), `Fork: knocked away from Octo, never toward him (${d0.toFixed(0)} -> ${d1.toFixed(0)})`);
    run(F, 30);
    expect(!F.objs.some(o => o.kind === 'ocClone'), 'Fork: the clone gone after its one blame');
  }
  { // the clone alone (Octo's own blame stepped off): it never pulls, wherever it stands
    const F = mk(['octo', 'duke']); place(F, 140); const [oc, duke] = F.f;
    run(F, 40, tap('special'));
    const cl = F.objs.find(o => o.kind === 'ocClone');
    duke.x = oc.x + 60; duke.y = oc.y; cl.x = oc.x + 250; cl.y = oc.y; cl.face = Math.PI;   // (the clone behind them, its blame pointing back at Octo)
    const d0 = Math.hypot(duke.x - oc.x, duke.y - oc.y);
    oc.face = Math.PI / 2;
    const ev = run(F, 60, k => ({ light: k < 2, x: 0, y: 1 }));
    const d1 = Math.hypot(duke.x - oc.x, duke.y - oc.y);
    expect(has(ev, 'hit', 0, { move: 'move3' }) && d1 > d0 + 30, `Fork: the clone's blame from behind them still knocks them away from Octo (${d0.toFixed(0)} -> ${d1.toFixed(0)}, ${kinds(ev)})`);
  }
  { // left alone it lasts its time; one at a time; a toboggan into it pops it
    const F = mk(['octo', 'tux']); place(F, 140); const [oc, tux] = F.f, M = oc.stats.moves.move3;
    run(F, S(M.startup + M.active + M.recovery) + 3, tap('special'));
    oc.cd[2] = 0; run(F, 2, tap('special'));
    expect(oc.move !== 'move3', 'Fork: one clone at a time');
    const cl = F.objs.find(o => o.kind === 'ocClone');
    tux.x = cl.x - 80; tux.y = cl.y; tux.face = 0; oc.x = cl.x + 60; oc.y = cl.y;   // (Tux slides at Octo through his clone)
    const ev = run(F, 50, {}, k => ({ heavy: k < 2, x: 1, y: 0 }));
    expect(has(ev, 'ocPop', 0, { how: 'hit' }), `Fork: hit, the clone pops (${kinds(ev)})`);
    const G = mk(['octo', 'duke']); place(G, 140);
    const ev2 = run(G, S(M.startup + M.life + 0.6), tap('special'));
    expect(has(ev2, 'ocPop', 0, { how: 'old' }) && !G.objs.some(o => o.kind === 'ocClone'), `Fork: gone after ${M.life} s (${kinds(ev2)})`);
  }
  // ---- Force Push (tap or hold)
  { // tapped up close: a blink's flick, nothing on the floor, then the slam lands fast and blasts them off their feet;
    // near a wall, into it; out of its reach it whiffs, open, and gets punished there
    const F = mk(['octo', 'duke']); place(F, 20); const duke = F.f[1], x0 = duke.x, M = F.f[0].stats.moves.move2, hp = duke.hp;
    let ev = run(F, 3, tap('heavy'));
    expect(F.f[0].ph === 'rise' && !F.objs.some(o => o.kind !== 'ocRing'), `Push: the flick, nothing drawn on the floor (${F.f[0].ph})`);
    ev = ev.concat(run(F, S(M.startup + 0.8)));
    expect(has(ev, 'hit', 0, { move: 'move2' }) && has(ev, 'ocBurst', 0) && has(ev, 'down', 1) && duke.x - x0 > 50 && Math.abs((hp - duke.hp) - M.damage) < 1e-6, `Push: blasted away and down, ${M.damage} (${(duke.x - x0).toFixed(0)}, ${kinds(ev)})`);
    let k0 = -1; { const G = mk(['octo', 'duke']); place(G, 20); for (let k = 0; k < 40 && k0 < 0; k++) if (has(run(G, 1, { heavy: k < 2 }), 'hit', 0)) k0 = k; }
    expect(k0 >= 0 && k0 <= S(M.startup + M.active) + 1, `Push: tapped, it lands ${k0} frames in`);
    const W = mk(['octo', 'duke']); place(W, 20, { a: { x: 120 }, b: { x: 155 } }); const wd = W.f[1], wh = wd.hp;
    ev = run(W, S(M.startup + 1), tap('heavy'));
    expect(has(ev, 'wall', 1) && has(ev, 'ocWallSlam', 0) && wh - wd.hp > M.damage + M.slam - 1e-6, `Push: slammed into the wall, ${M.damage} + ${M.slam} + the wall's (${(wh - wd.hp).toFixed(1)}, ${kinds(ev)})`);
    const G = mk(['octo', 'tux']); place(G, Math.round(M.R + 10)); const [oc, d2] = G.f, h2 = d2.hp;
    ev = run(G, S(M.startup + M.active) + 2, tap('heavy'));
    expect(!has(ev, 'hit', 0) && d2.hp === h2 && oc.ph === 'gather' && oc.state === 'recover' && oc.dur >= M.miss - 1e-9, `Push: out of reach, a whiff, open ${M.miss} s (${kinds(ev)}, ${oc.ph})`);
    d2.x = oc.x + oc.r + d2.r + 40; d2.y = oc.y;
    ev = run(G, 30, {}, tap('heavy'));
    expect(has(ev, 'hit', 1, { move: 'move2' }), `Push: punished after the whiff: Tux's toboggan lands (${kinds(ev)})`);
  }
  { // held: the tentacles gather for a bigger slam: it reaches someone a tap can't, and harder (down, further)
    const F = mk(['octo', 'duke']); place(F, Math.round(F.f[0].stats.moves.move2.R + 4)); const [oc, duke] = F.f, M = oc.stats.moves.move2, hp = duke.hp, x0 = duke.x;   // (out of a tap's reach)
    const hold = S(M.startup + M.holdMax) + 2;
    let ev = run(F, hold - 4, { heavy: true });
    expect(oc.state === 'wind' && oc.ocC > 0.8, `Push held: still gathering (${oc.state}, ${oc.ocC.toFixed(2)})`);
    ev = ev.concat(run(F, 60));
    expect(has(ev, 'hit', 0, { move: 'move2' }) && has(ev, 'down', 1) && (hp - duke.hp) > M.damage * 1.3 && duke.x - x0 > 60, `Push held: the bigger slam lands from further, harder (${(hp - duke.hp).toFixed(1)}, ${(duke.x - x0).toFixed(0)}, ${kinds(ev)})`);
  }
  // ---- Ink Jet
  { // back away from them (none held), untouchable, a slippery ink puddle where he was
    const F = mk(['octo', 'duke']); place(F, 100); const [oc, duke] = F.f, E = oc.stats.moves.evade, x0 = oc.x;
    const ev = run(F, 2, { guard: true });
    expect(has(ev, 'ocInkJet', 0) && oc.inv > 0, 'Ink Jet: untouchable');
    run(F, S(E.active) + 1);
    const ink = F.objs.find(o => o.kind === 'ocInk');
    expect(oc.x < x0 - E.dist * 0.9 && ink && Math.abs(ink.x - x0) < 1 && ink.slick, `Ink Jet: ${E.dist} back, the ink where he was (${(oc.x - x0).toFixed(0)})`);
    duke.x = ink.x; duke.y = ink.y; run(F, 1);
    expect(duke.slip === 1, 'Ink Jet: the ink is slippery');
  }
}
