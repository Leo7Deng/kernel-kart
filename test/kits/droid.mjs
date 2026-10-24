// Bugdroid's moves (js/kits/droid.js), checked by test/fight.test.mjs: each does what it says, its tell shows, its answer
// works. T: the test's tools ({ mk, place, run, has, kinds, tap, S, expect }); lands: what each move card's clip must show.
export const lands = {
  move1: ev => ev.some(e => e.kind === 'drBeam' && e.who === 0) && ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move1'),
  move2: ev => ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move2'),
  move3: ev => ev.some(e => e.kind === 'drEmp' && e.who === 0 && e.hit) && ev.some(e => e.kind === 'down' && e.who === 1),
  evade: ev => ev.some(e => e.kind === 'drAir' && e.who === 0) && !ev.some(e => e.kind === 'hit' && e.to === 0),
};

export function checks({ mk, place, run, has, kinds, tap, S, expect }) {
  // ---- Battery Beam
  { // held: the line through them, charging; let go: it settles, then fires; charged a while, more damage
    const F = mk(['droid', 'tux']); place(F, 150); const [dr, tux] = F.f, M = dr.stats.moves.move1, hp = tux.hp, hold = S(M.startup + 0.3);
    run(F, 4, { light: true });
    const ln = F.objs.find(o => o.kind === 'drbeam');
    expect(ln && ln.ph === 'aim' && Math.abs(Math.sin(ln.a)) < 0.02 && dr.pose === 'charge' && dr.bat < 2, `Beam: the line out at them, a cell spent (${ln && ln.ph}, ${dr.bat.toFixed(2)})`);
    run(F, hold - 4, { light: true });
    expect(dr.state === 'wind' && dr.ph === 'charge', `Beam: held past its startup, still charging (${dr.state})`);
    let ev = run(F, 2);
    expect(dr.ph === 'lock' && ln.ph === 'lock' && !has(ev, 'drBeam'), `Beam: let go, the line settles first (${dr.ph})`);
    ev = run(F, S(M.lock + 0.05));
    const ch = (hold / 60 - M.startup) / M.holdMax, want = M.damage * (1 + (M.full - 1) * ch);
    expect(has(ev, 'drBeam', 0) && has(ev, 'hit', 0, { move: 'move1' }) && Math.abs((hp - tux.hp) - want) < 0.5 && !has(ev, 'down', 1), `Beam: fires, ${want.toFixed(1)} (${(hp - tux.hp).toFixed(1)}, ${kinds(ev)})`);
  }
  { // fully charged: it knocks down
    const F = mk(['droid', 'tux']); place(F, 150); const M = F.f[0].stats.moves.move1;
    const ev = run(F, S(M.startup + M.holdMax + M.lock + 0.15), { light: true });
    expect(has(ev, 'hit', 0, { move: 'move1' }) && has(ev, 'down', 1), `Beam: full charge knocks down (${kinds(ev)})`);
  }
  { // stepped off the line before it fires: missed
    const F = mk(['droid', 'tux']); place(F, 150); const tux = F.f[1], hp = tux.hp, M = F.f[0].stats.moves.move1;
    const ev = run(F, S(M.startup + M.active) + 6, k => ({ light: k < 2 }), k => k > 6 ? { x: 0, y: -1 } : {});
    expect(has(ev, 'drBeam', 0) && tux.hp === hp, `Beam: off the line, missed (${kinds(ev)})`);
  }
  { // two cells, one a beam; none left, the key waits for one (its cooldown shows the wait)
    const F = mk(['droid', 'tux']); place(F, 300); const dr = F.f[0], B = dr.stats.battery;
    run(F, 2, tap('light'));
    expect(Math.abs(dr.bat - (B.max - 1)) < 0.01, `Battery: a beam takes a cell (${dr.bat.toFixed(2)})`);
    run(F, 90); dr.bat = 0.5; dr.cd = [0, 0, 0, 0]; run(F, 2);
    let ev = run(F, 4, tap('light'));
    expect(!has(ev, 'tell', 0) && dr.cd[0] > 1, `Battery: empty, no beam (cd ${dr.cd[0].toFixed(2)})`);
    run(F, S(0.5 * B.recharge) + 2); ev = run(F, 4, tap('light'));
    expect(has(ev, 'tell', 0, { move: 'move1' }), 'Battery: a cell back, it fires again');
  }
  // ---- Sideload
  { // the cube in front of him boots, then pops pellets at them: small staggering hits; one at a time
    const F = mk(['droid', 'tux']); place(F, 150); const [dr, tux] = F.f, M = dr.stats.moves.move2, hp = tux.hp;
    run(F, S(M.startup) + 3, tap('heavy'));
    const c = F.objs.find(o => o.kind === 'drcube');
    expect(c && c.ph === 'boot' && c.x > dr.x, `Sideload: the cube in front, booting (${c && c.ph})`);
    const ev = run(F, S(M.boot + M.every + 1.2));
    expect(has(ev, 'drPew', 0) && has(ev, 'hit', 0, { move: 'move2' }) && !has(ev, 'down', 1) && tux.hp < hp, `Sideload: pellets hit them, no knockdown (${kinds(ev)})`);
    dr.cd[1] = 0; run(F, 2, tap('heavy'));
    expect(dr.move !== 'move2', 'Sideload: one cube at a time');
  }
  { // walked into, it tips over: no more pellets
    const F = mk(['droid', 'tux']); place(F, 150); const tux = F.f[1], M = F.f[0].stats.moves.move2;
    run(F, S(M.startup) + 3, tap('heavy'));
    const ev = run(F, 120, {}, { x: -1 }), c = F.objs.find(o => o.kind === 'drcube');
    expect(has(ev, 'drCubeBreak', 0) && (!c || c.ph === 'broke'), `Sideload: kicked over (${kinds(ev)})`);
  }
  // ---- Factory Reset
  { // the crouch, then the wave floors anyone near; his battery comes back full; he reboots, open
    const F = mk(['droid', 'tux']); place(F, 40); const [dr, tux] = F.f, M = dr.stats.moves.move3; dr.bat = 0;
    run(F, 3, tap('special'));
    expect(dr.ph === 'crouch' && dr.pose === 'crouch', `Reset: crouched (${dr.ph})`);
    const ev = run(F, S(M.startup) + 2);
    expect(has(ev, 'drEmp', 0, { hit: true }) && has(ev, 'down', 1) && dr.bat === dr.stats.battery.max, `Reset: the wave floors them, battery full (${kinds(ev)}, ${dr.bat})`);
    run(F, 8);
    expect(dr.ph === 'reboot' && dr.state === 'recover', `Reset: rebooting, open (${dr.ph})`);
    const G = mk(['droid', 'tux']); place(G, 40); const t2 = G.f[1], h2 = t2.hp;
    const ev2 = run(G, S(M.startup) + 4, tap('special'), k => k > 4 ? { x: 1 } : {});
    expect(has(ev2, 'drEmp', 0, { hit: false }) && t2.hp === h2, `Reset: backed off, missed (${kinds(ev2)})`);
  }
  // ---- Airplane Mode
  { // see-through: untouchable, walking slowly the held way; then back online, open
    const F = mk(['droid', 'tux']); place(F, 120); const dr = F.f[0], E = dr.stats.moves.evade, y0 = dr.y;
    let ev = run(F, 2, { guard: true, x: 0, y: -1 });
    expect(has(ev, 'drAir', 0) && dr.inv > 0 && dr.ph === 'airplane' && dr.pose === 'airplane', `Airplane: untouchable (${dr.ph})`);
    ev = run(F, S(E.active), { x: 0, y: -1 });
    const d = y0 - dr.y;
    expect(has(ev, 'drOn', 0) && d > 20 && d < 70 && dr.inv <= 0 && dr.state === 'recover', `Airplane: walked a little (${d.toFixed(0)}), back online, open (${dr.state})`);
  }
}
