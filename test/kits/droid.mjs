// Bugdroid's moves (js/kits/droid.js), checked by test/fight.test.mjs: each does what it says, its tell shows, its answer
// works. T: the test's tools ({ mk, place, run, has, kinds, tap, S, expect }); lands: what each move card's clip must show.
import { aimError } from './ferris.mjs';   // (how far off a bot's aim goes, over a few bot fights)
export const lands = {
  move1: ev => ev.some(e => e.kind === 'drBeam' && e.who === 0) && ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move1'),
  move3: ev => ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move3'),
  move2: ev => ev.some(e => e.kind === 'drSvcZap' && e.who === 0 && e.hit),
  evade: ev => ev.some(e => e.kind === 'drSoak' && e.who === 0 && e.near) && ev.some(e => e.kind === 'drShocked' && e.who === 0) && !ev.some(e => e.kind === 'hit' && e.to === 0),
};

export function checks({ mk, place, run, has, kinds, tap, S, expect }) {
  // ---- Battery Beam's aim (easier for players, a little worse for bots)
  { // a human holding no direction: the beam sticks to them, and hits someone walking slowly sideways
    const F = mk(['droid', 'tux']); place(F, 140); const tux = F.f[1], ev = []; let y = 0;
    for (let k = 0; k < 90 && !has(ev, 'hit', 0); k++) { ev.push(...run(F, 1, { light: k < 40 }, { x: 0, y: 0.4 })); y = tux.y; }
    expect(has(ev, 'hit', 0, { move: 'move1' }) && Math.abs(y) > 15, `Beam: tracks a slow sidestep and hits (${kinds(ev)}, ${y.toFixed(0)} sideways)`);
  }
  { // a Chill bot aims worse than a Ruthless one
    const chill = aimError(0, 'drBeam', 'droid'), ruth = aimError(2, 'drBeam', 'droid');
    expect(chill > ruth + 5, `Beam: a Chill bot's aim is off by more than a Ruthless one's (${chill.toFixed(1)} v ${ruth.toFixed(1)})`);
  }
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
    const F = mk(['droid', 'tux']); place(F, 150); const [dr, tux] = F.f, M = dr.stats.moves.move3, hp = tux.hp;
    run(F, S(M.startup) + 3, tap('special'));
    const c = F.objs.find(o => o.kind === 'drcube');
    expect(c && c.ph === 'boot' && c.x > dr.x, `Sideload: the cube in front, booting (${c && c.ph})`);
    const ev = run(F, S(M.boot + M.every + 1.2));
    expect(has(ev, 'drPew', 0) && has(ev, 'hit', 0, { move: 'move3' }) && !has(ev, 'down', 1) && tux.hp < hp, `Sideload: pellets hit them, no knockdown (${kinds(ev)})`);
    dr.cd[2] = 0; run(F, 2, tap('special'));
    expect(dr.move !== 'move3', 'Sideload: one cube at a time');
  }
  { // walked up to, it zaps them away (a fence); walked into again while it recharges, it tips over
    const F = mk(['droid', 'tux']); place(F, 150); const tux = F.f[1], M = F.f[0].stats.moves.move3;
    run(F, S(M.startup) + 3, tap('special'));
    let ev = [];
    for (let k = 0; k < 200 && !has(ev, 'drCubeZap'); k++) ev.push(...run(F, 1, {}, { x: -1 }));
    const c = F.objs.find(o => o.kind === 'drcube');
    expect(has(ev, 'drCubeZap', 0) && has(ev, 'hit', 0, { move: 'move3' }) && c && c.ph !== 'broke', `Sideload: zaps whoever walks up to it (${kinds(ev)})`);
    run(F, 30); tux.x = c.x + c.r + tux.r - 1; tux.y = c.y; tux.vx = tux.vy = 0;
    ev = run(F, 20, {}, { x: -1 });
    expect(has(ev, 'drCubeBreak', 0) && c.ph === 'broke', `Sideload: walked into while it recharges, kicked over (${kinds(ev)})`);
  }
  // ---- Background Service (a trap on the floor, not a close hit)
  { // flicked to where they stand: it slides there, arms, and stepping on it once armed shocks them (no knockdown), a
    // cell back to him; stepping off it before it arms, nothing
    const F = mk(['droid', 'tux']); place(F, 110); const [dr, tux] = F.f, M = dr.stats.moves.move2, hp = tux.hp; dr.bat = 0;
    let ev = run(F, 3, tap('heavy'));
    expect(dr.ph === 'flick' && dr.pose === 'twist', `Service: the flick (${dr.ph}, ${dr.pose})`);
    ev = run(F, S(M.startup + 0.05) - 3, {}, { x: 1 });
    const sv = F.objs.find(o => o.kind === 'drsvc');
    expect(sv && sv.ph === 'slide' && has(ev, 'drFlick', 0), `Service: the tile sliding out (${sv && sv.ph})`);
    ev = run(F, S(M.active + 0.1), {}, { x: 1 });
    expect(sv.ph === 'arm' && Math.abs(sv.x - (dr.x + 0)) > M.minD - 1 && tux.hp === hp && !has(ev, 'drSvcZap'), `Service: bedded in where they were, arming; they stepped off (${sv.ph}, ${(sv.x - dr.x).toFixed(0)} off)`);
    run(F, S(M.arm));
    expect(sv.ph === 'live', `Service: armed (${sv.ph})`);
    Object.assign(tux, { x: sv.x + 30, y: sv.y, vx: 0, vy: 0 }); dr.bat = 0;
    ev = run(F, 40, {}, { x: -1 });
    expect(has(ev, 'drSvcZap', 0, { hit: true }) && has(ev, 'hit', 0, { move: 'move2' }) && !has(ev, 'down', 1) && Math.abs((hp - tux.hp) - M.damage) < 1e-6 && dr.bat >= 0.99, `Service: stepped on: shocked, ${M.damage}, no knockdown, a cell back (${kinds(ev)}, ${(hp - tux.hp).toFixed(1)}, bat ${dr.bat.toFixed(2)})`);
    expect(!F.objs.some(o => o.kind === 'drsvc' && o.ph === 'live'), 'Service: used up');
  }
  { // locked up long enough for his beam: shocked, then the beam lands before they're free
    const F = mk(['droid', 'tux']); place(F, 140); const [dr, tux] = F.f, M = dr.stats.moves.move2, B = dr.stats.moves.move1;
    run(F, 3, tap('heavy')); run(F, S(M.startup + M.active + M.arm) + 2, {}, { x: 1 });
    const sv = F.objs.find(o => o.kind === 'drsvc'); Object.assign(tux, { x: sv.x + 22, y: sv.y, vx: 0, vy: 0 }); dr.cd = [0, 0, 0, 0];
    let ev = []; for (let k = 0; k < 40 && !has(ev, 'drSvcZap'); k++) ev.push(...run(F, 1, {}, { x: -1 }));
    expect(tux.state === 'hurt', `Service: locked up (${tux.state})`);
    ev = run(F, S(B.startup + B.lock + 0.1), tap('light'), { x: 0, y: -1 });
    expect(has(ev, 'hit', 0, { move: 'move1' }), `Service: the beam lands on them while they're locked up (${kinds(ev)})`);
  }
  { // two at a time: a third switches the oldest off; at least minD off him
    const F = mk(['droid', 'tux']); place(F, 10); const dr = F.f[0], M = dr.stats.moves.move2;
    for (let n = 0; n < 3; n++) { run(F, 2, tap('heavy')); run(F, 60); dr.cd[1] = 0; F.f[1].x = dr.x + 400; F.f[1].y = dr.y; }
    const L = F.objs.filter(o => o.kind === 'drsvc' && o.ph !== 'off');
    expect(L.length === M.max && L.every(o => Math.hypot(o.x - dr.x, o.y - dr.y) >= M.minD - 1), `Service: ${M.max} at a time, ${M.minD}+ off him (${L.length}, ${L.map(o => Math.hypot(o.x - dr.x, o.y - dr.y).toFixed(0))})`);
  }
  // ---- Power Surge
  { // rooted; sparks gather (a hit then lands), then the lightning: a hit from close by is soaked and its thrower
    // shocked (locked up); he's back quickly after soaking one
    const F = mk(['droid', 'tux']); place(F, 20); const [dr, tux] = F.f, E = dr.stats.moves.evade, T1 = tux.stats.moves.move1, hp = dr.hp;
    let ev = run(F, 2, { guard: true, x: 0, y: -1 });
    expect(has(ev, 'drGather', 0) && dr.ph === 'gather' && Math.abs(dr.vx) + Math.abs(dr.vy) < 1, `Surge: rooted, the sparks gathering (${dr.ph})`);
    run(F, S(E.gather) + 1, { x: 0, y: -1 });
    expect(dr.ph === 'surge', `Surge: live (${dr.ph})`);
    ev = run(F, S(T1.startup + T1.active) + 4, {}, tap('light'));
    expect(dr.hp === hp && has(ev, 'drSoak', 0, { near: 1 }) && has(ev, 'drShocked', 0) && has(ev, 'hit', 0, { move: 'evade' }), `Surge: the fish soaked, Tux shocked (${kinds(ev)}, ${tux.state})`);
    for (let k = 0; k < 60 && dr.state === 'strike'; k++) run(F, 1);
    expect(dr.ph === 'surged' && Math.abs(dr.dur - E.recovery) < 1e-6, `Surge: soaked one, back quickly (${dr.ph}, ${dr.dur})`);
  }
  { // in the gather it's not live yet: a hit lands
    const F = mk(['droid', 'tux']); place(F, 20); const [dr, tux] = F.f, T1 = tux.stats.moves.move1, hp = dr.hp;
    const k0 = S(T1.startup) + 1;
    const ev = run(F, 40, k => k >= k0 && k < k0 + 2 ? { guard: true } : {}, tap('light'));
    expect(dr.hp < hp && !has(ev, 'drSoak'), `Surge: pressed too late (the sparks still gathering), the hit lands (${kinds(ev)})`);
  }
  { // nothing comes: drained, rooted and open for a while, and punished there
    const F = mk(['droid', 'tux']); place(F, 120); const [dr, tux] = F.f, E = dr.stats.moves.evade, hp = dr.hp;
    run(F, 2, { guard: true }); const ev = run(F, S(E.active) + 1, { x: 1 });
    expect(has(ev, 'drDrained', 0) && dr.ph === 'drained' && Math.abs(dr.dur - E.miss) < 1e-6, `Surge: nothing came, drained ${E.miss} s (${dr.ph})`);
    const x0 = dr.x; Object.assign(tux, { x: dr.x + dr.r + tux.r + 10, y: dr.y });
    const ev2 = run(F, 20, { x: 1 }, tap('light'));
    expect(has(ev2, 'hit', 1) && dr.hp < hp && Math.abs(dr.x - x0) < 40, `Surge: drained, he's open and hit (${kinds(ev2)})`);
  }
  { // from afar (a pellet, a fly) it just fizzles: soaked, nobody shocked
    const F = mk(['droid', 'cpp']); place(F, 120); const [dr, cp] = F.f, E = dr.stats.moves.evade;
    run(F, 3, {}, tap('light')); run(F, 6, {}, {});
    run(F, 2, { guard: true });
    const ev = run(F, S(E.active));
    expect(!has(ev, 'drShocked') && cp.state !== 'hurt', `Surge: a shot from afar isn't shocked back (${kinds(ev)})`);
  }
}
