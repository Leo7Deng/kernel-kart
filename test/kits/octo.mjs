// Octo's moves (js/kits/octo.js), checked by test/fight.test.mjs: each does what it says, its tell shows, its answer works.
export const lands = {
  move1: ev => ev.some(e => e.kind === 'ocSlamArm' && e.who === 0) && ev.some(e => e.kind === 'down' && e.who === 1),
  move2: ev => ev.some(e => e.kind === 'ocFork' && e.who === 0) && ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move2'),
  move3: ev => ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move3'),
  evade: ev => ev.some(e => e.kind === 'ocInkJet' && e.who === 0) && !ev.some(e => e.kind === 'hit' && e.to === 0),
};

export function checks({ mk, place, run, has, kinds, tap, S, expect }) {
  // ---- Pull Request
  { // the coil shows the track through them; the tentacle catches, reels them in and slams them down
    const F = mk(['octo', 'duke']); place(F, 110); const [oc, duke] = F.f, hp = duke.hp, M = oc.stats.moves.move1;
    let ev = run(F, 4, tap('light'));
    const ln = F.objs.find(o => o.kind === 'ocLine');
    expect(oc.ph === 'coil' && oc.pose === 'coil' && ln && Math.abs(Math.sin(ln.a)) < 0.05, `Pull: coiled, the track toward them (${oc.ph})`);
    ev = ev.concat(run(F, S(M.startup + 0.35)));
    expect(has(ev, 'ocCatch', 0), `Pull: caught (${kinds(ev)})`);
    ev = ev.concat(run(F, 40));
    expect(has(ev, 'ocSlamArm', 0) && has(ev, 'down', 1) && Math.abs((hp - duke.hp) - M.damage) < 1e-6, `Pull: reeled in and slammed down, ${M.damage} (${(hp - duke.hp).toFixed(1)}, ${kinds(ev)})`);
    expect(Math.abs(duke.x - oc.x) < 110, `Pull: reeled in close (${(duke.x - oc.x).toFixed(0)})`);
  }
  { // off the line during the coil: it flops back, he droops open
    const F = mk(['octo', 'duke']); place(F, 110); const duke = F.f[1], hp = duke.hp;
    const ev = run(F, 90, tap('light'), k => k > 4 && k < 40 ? { x: 0, y: -1 } : {});
    expect(!has(ev, 'ocCatch') && duke.hp === hp && has(ev, 'ocDroop', 0), `Pull: stepped off, missed (${kinds(ev)})`);
  }
  // ---- Fork
  { // the blot beside them, the clone pops up there; his next move comes from both: a Force Push from each
    const F = mk(['octo', 'duke']); place(F, 140); const [oc, duke] = F.f, M = oc.stats.moves.move2;
    run(F, 3, tap('heavy'));
    const sp = F.objs.find(o => o.kind === 'ocSpot');
    expect(sp && Math.abs(Math.hypot(sp.x - duke.x, sp.y - duke.y) - M.dist) < 4, `Fork: the blot ${M.dist} from them (${sp && Math.hypot(sp.x - duke.x, sp.y - duke.y).toFixed(0)})`);
    let ev = run(F, S(M.startup + 0.1));
    const cl = F.objs.find(o => o.kind === 'ocClone');
    expect(has(ev, 'ocFork', 0) && cl && sp && Math.hypot(cl.x - sp.x, cl.y - sp.y) < 1, `Fork: the clone on the blot (${kinds(ev)})`);
    run(F, S(M.recovery) + 2);
    ev = run(F, S(oc.stats.moves.move3.startup + 0.2), tap('special'));
    expect(ev.filter(e => e.kind === 'ocSlam' && e.who === 0).length === 2 && has(ev, 'hit', 0, { move: 'move2' }), `Fork: a push from each, the clone's lands (${kinds(ev)})`);
    run(F, 30);
    expect(!F.objs.some(o => o.kind === 'ocClone'), 'Fork: the clone gone after its one move');
  }
  { // left alone it lasts its time; one at a time; a toboggan into it pops it
    const F = mk(['octo', 'tux']); place(F, 140); const [oc, tux] = F.f, M = oc.stats.moves.move2;
    run(F, S(M.startup + M.active + M.recovery) + 3, tap('heavy'));
    oc.cd[1] = 0; run(F, 2, tap('heavy'));
    expect(oc.move !== 'move2', 'Fork: one clone at a time');
    const cl = F.objs.find(o => o.kind === 'ocClone');
    tux.x = cl.x - 80; tux.y = cl.y; tux.face = 0; oc.x = cl.x + 90; oc.y = cl.y;   // (Tux slides at Octo through his clone)
    const ev = run(F, 50, {}, k => ({ light: k < 2, x: 1, y: 0 }));
    expect(has(ev, 'ocPop', 0, { how: 'hit' }), `Fork: hit, the clone pops (${kinds(ev)})`);
    const G = mk(['octo', 'duke']); place(G, 140);
    const ev2 = run(G, S(M.startup + M.life + 0.6), tap('heavy'));
    expect(has(ev2, 'ocPop', 0, { how: 'old' }) && !G.objs.some(o => o.kind === 'ocClone'), `Fork: gone after ${M.life} s (${kinds(ev2)})`);
  }
  // ---- Force Push
  { // near: shoved far away and knocked down; near a wall, slammed into it; out of reach, nothing
    const F = mk(['octo', 'duke']); place(F, 40); const duke = F.f[1], x0 = duke.x, M = F.f[0].stats.moves.move3;
    run(F, 3, tap('special'));
    expect(F.objs.some(o => o.kind === 'ocRing') && F.f[0].ph === 'rise', 'Push: the tentacles rise, their shadows out');
    let ev = run(F, S(M.startup + 0.8));
    expect(has(ev, 'hit', 0, { move: 'move3' }) && duke.x - x0 > 70, `Push: shoved away (${(duke.x - x0).toFixed(0)}, ${kinds(ev)})`);
    const W = mk(['octo', 'duke']); place(W, 40, { a: { x: 90 }, b: { x: 140 } });
    ev = run(W, S(M.startup + 1), tap('special'));
    expect(has(ev, 'wall', 1), `Push: into the wall (${kinds(ev)})`);
    const G = mk(['octo', 'duke']); place(G, 140); const hp = G.f[1].hp;
    ev = run(G, S(M.startup + 0.4), tap('special'));
    expect(!has(ev, 'hit', 0) && G.f[1].hp === hp, `Push: out of reach, nothing (${kinds(ev)})`);
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
