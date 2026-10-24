// Docky's moves (js/kits/docky.js), checked by test/fight.test.mjs: each does what it says, its tell shows, its answer works.
// T: the test's tools ({ mk, place, run, has, kinds, tap, S, expect }); lands: what each move card's clip must show.
export const lands = {
  move1: ev => ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move1') && ev.some(e => e.kind === 'down' && e.who === 1),
  move2: ev => ev.some(e => e.kind === 'dkLand' && e.who === 0 && e.move === 'move2') && ev.some(e => e.kind === 'bounce' && e.who === 1) && !ev.some(e => e.kind === 'hit' && e.to === 0),
  move3: ev => ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move3') && ev.some(e => e.kind === 'down' && e.who === 1),
  evade: ev => ev.some(e => e.kind === 'dkDive' && e.who === 0) && !ev.some(e => e.kind === 'hit' && e.to === 0),
};

export function checks({ mk, place, run, has, kinds, tap, S, expect }) {
  const boxesOf = F => F.objs.filter(o => o.kind === 'dkBox');
  // ---- Container Drop
  { // the shadows in a line toward them (the middle one on them); they come down one after another; under one: down;
    // then they stand as crates (solid) and go after a while
    const F = mk(['docky', 'duke']); place(F, 110); const [dk, duke] = F.f, M = dk.stats.moves.move1;
    run(F, 2, tap('light'));
    const bs = boxesOf(F);
    expect(dk.ph === 'heave' && dk.pose === 'heave' && bs.length === M.n && bs.every(b => b.ph === 'mark' && b.z > 0), `Container Drop: heaving, ${M.n} shadows (${dk.ph}, ${bs.length})`);
    expect(bs.some(b => Math.max(Math.abs(b.x - duke.x), Math.abs(b.y - duke.y)) < 2) && bs.every(b => Math.abs(b.y - dk.y) < 1), 'Container Drop: in a line toward them, one on them');
    const ev = run(F, S(M.startup + M.delay + M.every * 2 + M.fall + 0.2));
    expect(ev.filter(e => e.kind === 'dkLand' && e.who === 0).length === M.n && has(ev, 'hit', 0, { move: 'move1' }) && has(ev, 'down', 1), `Container Drop: they land, under one: down (${kinds(ev)})`);
    const b = boxesOf(F)[0];
    expect(b && b.ph === 'down' && F.contactsAll(b.x, b.y, 4).some(c => c.solid === b), 'Container Drop: a solid crate after');
    const ev2 = run(F, S(M.life + 0.2));
    expect(!boxesOf(F).length && has(ev2, 'dkPoof', 0), `Container Drop: the crates go after ${M.life} s`);
  }
  { // the line turns after them while he heaves (slowly)
    const F = mk(['docky', 'duke']); place(F, 120); const M = F.f[0].stats.moves.move1;
    run(F, 2, tap('light')); const a0 = boxesOf(F)[0].a;
    run(F, S(M.startup) - 4, {}, { x: 0, y: 1 });
    const a1 = boxesOf(F)[0].a;
    expect(a1 > a0 + 0.1 && a1 - a0 <= M.aimTurn * M.startup + 0.01, `Container Drop: the line turns after them, slowly (${(a1 - a0).toFixed(2)} rad)`);
  }
  { // stepped off the line, sideways: nothing lands on them
    const F = mk(['docky', 'duke']); place(F, 110); const duke = F.f[1], hp = duke.hp, M = F.f[0].stats.moves.move1;
    const ev = run(F, S(M.startup + M.delay + M.every * 2 + M.fall + 0.2), tap('light'), k => k > 12 && k < 40 ? { x: 0, y: -1 } : {});
    expect(!has(ev, 'hit', 0) && duke.hp === hp, `Container Drop: off the line, missed (${kinds(ev)})`);
  }
  { // hit out of his heave: the shadows go, nothing falls
    const F = mk(['docky', 'tux']); place(F, 40);
    const ev = run(F, 60, k => ({ light: k >= 6 && k < 8 }), tap('light'));
    expect(has(ev, 'counter', 1) && !has(ev, 'dkLand') && !boxesOf(F).length, `Container Drop: cut short, nothing falls (${kinds(ev)})`);
  }
  // ---- Compose Up
  { // the wall between him and them: solid; a toboggan bounces off it; a hit at him through it clangs off
    const F = mk(['docky', 'tux']); place(F, 120); const [dk, tux] = F.f, M = dk.stats.moves.move2;
    let ev = run(F, 2, tap('heavy'));
    expect(dk.ph === 'stack' && dk.pose === 'stack' && boxesOf(F).length === M.n, `Compose Up: stacking, the wall's shadows (${dk.ph})`);
    ev = ev.concat(run(F, S(M.startup + M.fall + 0.1)));
    const bs = boxesOf(F);
    expect(has(ev, 'dkBuild', 0) && bs.length === M.n && bs.every(b => b.ph === 'down' && b.x > dk.x + 20 && b.x < tux.x - 20), `Compose Up: the wall stands between them (${kinds(ev)})`);
    const hp = dk.hp;
    ev = run(F, 70, {}, tap('light'));
    expect(has(ev, 'bounce', 1) && dk.hp === hp && !has(ev, 'hit', 1), `Compose Up: the toboggan bounces off it (${kinds(ev)})`);
    place(F, 120, { a: { x: dk.x, y: dk.y }, b: { x: dk.x + 90, y: dk.y } }); F.hitstop = 0;
    const ok = F.hitF(tux, dk, tux.stats.moves.move1, {});
    expect(ok && F.lastRes === 'soak' && dk.hp === hp && F.events.some(e => e.kind === 'dkClang'), `Compose Up: a hit at him through it clangs off (${F.lastRes})`);
    F.events.length = 0;
    run(F, S(M.life));
    expect(!boxesOf(F).length, 'Compose Up: gone after a while');
  }
  { // too close: the wall lands on them, a shove back (no knockdown)
    const F = mk(['docky', 'duke']); place(F, 12); const duke = F.f[1], x0 = duke.x;
    const ev = run(F, 40, tap('heavy'));
    expect(has(ev, 'hit', 0, { move: 'move2' }) && !has(ev, 'down', 1) && duke.x > x0 + 15, `Compose Up: shoved back (${(duke.x - x0).toFixed(0)}, ${kinds(ev)})`);
  }
  // ---- Ship It
  { // the horn (the wake ahead), then the ram: knocks them down
    const F = mk(['docky', 'duke']); place(F, 140); const dk = F.f[0], M = dk.stats.moves.move3;
    let ev = run(F, 4, tap('special'));
    const w = F.objs.find(o => o.kind === 'dkWake');
    expect(dk.ph === 'horn' && dk.pose === 'horn' && has(ev, 'dkHorn', 0) && w && w.len > 140, `Ship It: the horn, the wake ahead (${dk.ph}, ${w && w.len})`);
    ev = run(F, S(M.startup + 0.6));
    expect(has(ev, 'dkRam', 0) && has(ev, 'hit', 0, { move: 'move3' }) && has(ev, 'down', 1) && dk.ph === 'dock', `Ship It: rams them down (${kinds(ev)})`);
  }
  { // unstoppable while ramming: a hit hurts him but doesn't stop him
    const F = mk(['docky', 'duke']); place(F, 260); const [dk, duke] = F.f, M = dk.stats.moves.move3;
    run(F, S(M.startup) + 4, tap('special'));
    const hp = dk.hp; dk.iso = 0;
    const ok = F.hitF(duke, dk, { damage: 6, kb: 200, kd: true }, { obj: true, dir: Math.PI });
    expect(ok && F.lastRes === 'armor' && dk.hp < hp && dk.state === 'strike' && dk.ph === 'ram', `Ship It: hit while ramming, on he goes (${F.lastRes}, ${dk.state}/${dk.ph})`);
  }
  { // stepped aside in the horn: he misses and ends beached, open
    const F = mk(['docky', 'duke']); place(F, 140); const duke = F.f[1], hp = duke.hp, M = F.f[0].stats.moves.move3;
    const ev = run(F, S(M.startup + M.active + 0.2), tap('special'), k => k > 26 && k < 60 ? { x: 0, y: -1 } : {});   // (late in the horn: he's turning after them till then)
    expect(duke.hp === hp && has(ev, 'dkBeach', 0) && F.f[0].ph === 'beached', `Ship It: stepped aside, beached (${kinds(ev)})`);
  }
  { // his own crate in the way: shoved ahead of him into them (down)
    const F = mk(['docky', 'duke']); place(F, 190); const [dk, duke] = F.f, M = dk.stats.moves.move3;
    F.objs.push({ id: ++F.oid, kind: 'dkBox', shape: 'box', x: dk.x + 60, y: dk.y, w: 34, h: 34, r: 3, z: 0, vx: 0, vy: 0, vz: 0, ph: 'down', k: 0, a: 0, mk: 'move1', wait: 0, fall: 0.3, ft: 0, t: 0, life: 9, solid: 1, by: -1, hit: false, owner: 0, mv: null, ms: 0 });
    const ev = run(F, S(M.startup + M.active), tap('special'), { x: 0, y: 0 });
    expect(has(ev, 'dkShove', 0) && has(ev, 'hit', 0, { move: 'move3' }) && has(ev, 'down', 1), `Ship It: the crate shoved into them (${kinds(ev)})`);
  }
  // ---- Dive
  { // under: untouchable, not there to bump (a toboggan slides through), then the breach splashes anyone next to him
    const F = mk(['docky', 'tux']); place(F, 130); const dk = F.f[0], E = dk.stats.moves.evade, hp = dk.hp;
    let ev = run(F, 50, k => ({ guard: k >= 32 && k < 34 }), tap('light'));
    expect(has(ev, 'dkDive', 0) && dk.hp === hp && !has(ev, 'hit', 1), `Dive: the toboggan through nothing (${kinds(ev)})`);
    const G = mk(['docky', 'duke']); place(G, 8); const d2 = G.f[0];
    ev = run(G, 2, { guard: true });
    expect(d2.gone && d2.inv > 0 && d2.ph === 'under' && d2.pose === 'dive', `Dive: under, untouchable (${d2.ph})`);
    ev = ev.concat(run(G, S(E.active) + 1));
    expect(has(ev, 'dkBreach', 0, { hit: true }) && has(ev, 'hit', 0, { move: 'evade' }) && d2.state === 'recover' && d2.inv <= 0, `Dive: the breach splashes them back, then open (${kinds(ev)})`);
    run(G, S(E.recovery) + 2); run(G, 1, { guard: true }); run(G, 1);
    expect(d2.move !== 'evade' && d2.cd[3] > 0, 'Dive: a cooldown after');
  }
}
