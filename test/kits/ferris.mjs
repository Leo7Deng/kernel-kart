// Ferris's moves (js/kits/ferris.js), checked by test/fight.test.mjs: unsafe { }, his HIT (his other
// moves' checks are still written out in fight.test.mjs). T: the test's tools ({ mk, place, run, has, kinds, tap, S,
// expect }); lands: what each move card's clip must show.
import { Fight } from '../../js/fight.js';
export const lands = {
  move1: ev => ev.some(e => e.kind === 'feFling' && e.who === 0),
  move2: ev => ev.some(e => e.kind === 'feSpin' && e.who === 0 && e.hit) && ev.some(e => e.kind === 'down' && e.who === 1 && e.by === 0),
  move3: ev => ev.some(e => e.kind === 'feLocked' && e.who === 0),
  evade: ev => ev.some(e => e.kind === 'feTuck' && e.who === 0) && !ev.some(e => e.kind === 'hit' && e.to === 0),
};

// how far off a bot's aim goes, on average (units sideways of the foe, the moment it fires), at a foe standing still
export function aimError(lv, ev = 'feShoot', id = 'ferris') {
  let sum = 0, n = 0;
  for (let seed = 1; seed <= 8 && n < 40; seed++) {
    const F = new Fight({ ids: [id, 'tux'], bots: [lv, null], seed });
    for (let k = 0; k < 60 * 120 && F.phase !== 'over'; k++) {
      F.step();
      for (const e of F.events) if (e.kind === ev && e.who === 0) {
        const me = F.f[0], o = F.f[1], dx = o.x - me.x, dy = o.y - me.y;
        if (dx * Math.cos(me.face) + dy * Math.sin(me.face) > 0) { sum += Math.abs(dy * Math.cos(me.face) - dx * Math.sin(me.face)); n++; }
      }
      F.events.length = 0;
    }
  }
  return n ? sum / n : 0;
}

export function checks({ mk, place, run, has, kinds, tap, S, expect }) {
  // ---- Borrow Claw's aim (easier for players, a little worse for bots)
  { // a human holding no direction: the claw sticks to them, and catches someone walking slowly sideways
    const F = mk(['ferris', 'tux']); place(F, 100); const tux = F.f[1], ev = []; let y = 0;
    for (let k = 0; k < 60 && !has(ev, 'feCatch'); k++) { ev.push(...run(F, 1, tap('light')(k), { x: 0, y: 0.4 })); y = tux.y; }
    expect(has(ev, 'feCatch', 0, { to: 1 }) && Math.abs(y) > 15, `Borrow Claw: tracks a slow sidestep and catches (${kinds(ev)}, ${y.toFixed(0)} sideways)`);
  }
  // ---- Borrow Claw into unsafe { }: pressed while he holds them, he spins with them in his claw
  { // caught, then unsafe pressed: heaved up, spun round once (they go round with him), slammed out and down: the claw's
    // hit and the spin's together, more than the fling; it costs him unsafe's self and starts its cooldown
    const F = mk(['ferris', 'tux']); place(F, 100); const [fe, tux] = F.f, M = fe.stats.moves.move1, U = fe.stats.moves.move2, hp = tux.hp;
    let ev = run(F, S(M.startup + M.shoot) + 4, tap('light'));
    expect(has(ev, 'feCatch', 0, { to: 1 }) && tux.state === 'grabbed', `claw into the spin: caught (${kinds(ev)})`);
    run(F, S(M.reel) + 2); const h0 = fe.hp, a0 = Math.atan2(tux.y - fe.y, tux.x - fe.x);
    ev = run(F, 2, tap('heavy'));
    expect(fe.ph === 'heave' && fe.move === 'move1' && tux.state === 'grabbed' && fe.cd[1] > 0 && Math.abs(h0 - fe.hp - U.self) < 1e-6 && has(ev, 'feHeave', 0), `claw into the spin: heaved up, unsafe's cooldown and self (${fe.ph}, ${fe.cd[1]}, ${(h0 - fe.hp).toFixed(1)})`);
    run(F, S(M.spin.heave + M.spin.time / 2));
    const a1 = Math.atan2(tux.y - fe.y, tux.x - fe.x);
    expect(fe.ph === 'clawspin' && tux.state === 'grabbed' && Math.abs(Math.cos(a1 - a0) + 1) < 0.6, `claw into the spin: swung round with him (${fe.ph}, ${(a1 - a0).toFixed(2)} rad)`);
    ev = run(F, S(M.spin.time / 2) + 6);
    expect(has(ev, 'hit', 0, { move: 'move2' }) && has(ev, 'down', 1) && has(ev, 'feSpin', 0, { held: 1 }) && Math.abs((hp - tux.hp) - M.spin.damage) < 1e-6 && M.spin.damage > M.damage * 1.15, `claw into the spin: slammed out and down, ${M.spin.damage} (${kinds(ev)}, ${(hp - tux.hp).toFixed(1)})`);
  }
  { // unsafe still cooling down: the press does nothing, the fling as usual
    const F = mk(['ferris', 'tux']); place(F, 100); const [fe, tux] = F.f, M = fe.stats.moves.move1, hp = tux.hp;
    run(F, S(M.startup + M.shoot + M.reel) + 6, tap('light')); fe.cd[1] = 5;
    const ev = run(F, S(M.holdT) + 4, tap('heavy'));
    expect(!has(ev, 'feHeave') && has(ev, 'feFling', 0) && has(ev, 'down', 1) && Math.abs((hp - tux.hp) - M.damage) < 1e-6, `claw into the spin: not while unsafe cools down (${kinds(ev)})`);
  }
  { // not pressed: the fling lands them down near him (kb 250)
    const F = mk(['ferris', 'tux']); place(F, 100); const [fe, tux] = F.f, M = fe.stats.moves.move1;
    run(F, S(M.startup + M.shoot + M.reel + M.holdT) + 4, tap('light'));
    run(F, 80);
    const d = Math.hypot(tux.x - fe.x, tux.y - fe.y) - fe.r - tux.r;
    expect(M.kb < 250 && d < 110, `the fling: down a short way off (${d.toFixed(0)} from him)`);
  }
  { // a Chill bot aims worse than a Ruthless one
    const chill = aimError(0), ruth = aimError(2);
    expect(chill > ruth + 5, `Borrow Claw: a Chill bot's aim is off by more than a Ruthless one's (${chill.toFixed(1)} v ${ruth.toFixed(1)})`);
  }
  // ---- unsafe { }: a HIT (fast, no aim, no hold, no floor tell)
  { // up close: the twist, then one brutal spin floors them, almost at once; it costs him a little
    const F = mk(['ferris', 'tux']); place(F, 6); const [fe, tux] = F.f, M = fe.stats.moves.move2, hp = tux.hp, h0 = fe.hp;
    run(F, 3, tap('heavy'));
    expect(fe.ph === 'brace' && fe.pose === 'brace', `unsafe: the twist (${fe.ph}, ${fe.pose})`);
    let at = -1; const ev = [];
    for (let k = 3; k < S(M.startup + M.active) + 6; k++) { const e = run(F, 1); ev.push(...e); if (at < 0 && has(e, 'hit', 0, { move: 'move2' })) at = k; }
    expect(at >= 0 && at <= S(M.startup + M.active) + 1 && has(ev, 'feSpin', 0, { hit: true }) && has(ev, 'down', 1) && Math.abs((hp - tux.hp) - M.damage) < 1e-6, `unsafe: the spin floors them by ${(at / 60).toFixed(2)} s, ${M.damage} damage (${kinds(ev)}, ${(hp - tux.hp).toFixed(1)})`);
    expect(Math.abs(h0 - fe.hp - M.self) < 1e-6 && fe.ph === 'spun', `unsafe: it cost him ${M.self} (${(h0 - fe.hp).toFixed(1)}, ${fe.ph})`);
  }
  { // all round him: behind him too
    const F = mk(['ferris', 'tux']); place(F, 6); const [fe, tux] = F.f, M = fe.stats.moves.move2, hp = tux.hp;
    run(F, 1, tap('heavy')); fe.face = Math.PI;
    const ev = run(F, S(M.startup + M.active) + 2);
    expect(has(ev, 'hit', 0, { move: 'move2' }) && tux.hp < hp, `unsafe: hits behind him too (${kinds(ev)})`);
  }
  { // at range: it whiffs, he spins past and settles, open for its miss time
    const F = mk(['ferris', 'tux']); place(F, 60); const [fe, tux] = F.f, M = fe.stats.moves.move2, hp = tux.hp;
    const ev = run(F, S(M.startup + M.active) + 2, tap('heavy'));
    expect(!has(ev, 'hit', 0) && tux.hp === hp && has(ev, 'feSpent', 0) && fe.ph === 'spent' && fe.state === 'recover' && Math.abs(fe.dur - M.miss) < 1e-6, `unsafe: whiffs at range, open ${M.miss} s (${kinds(ev)}, ${fe.ph}, ${fe.state})`);
  }
  // ---- Ownership Lock slows: a ball and chain drags at their feet while they're locked
  { // locked: they walk at x slow, the ball and chain on them; it falls off when the lock wears off
    const walk = lock => {
      const F = mk(['ferris', 'tux']); place(F, 80); const [fe, tux] = F.f, M = fe.stats.moves.move3;
      if (lock) run(F, S(M.form) + 3, tap('special'));
      else { run(F, S(M.form) + 3); }
      const y0 = tux.y, ev = run(F, 30, {}, { x: 0, y: -1 });
      return [y0 - tux.y, F, ev];
    };
    const [slowD, F] = walk(true), [freeD] = walk(false), tux = F.f[1], M = F.f[0].stats.moves.move3;
    const ch = F.objs.find(o => o.kind === 'fechain');
    expect(tux.lockT > 0 && ch && ch.ph === 'on' && slowD < freeD * (M.slow + 0.15) && slowD > freeD * (M.slow - 0.15), `Lock: locked, they walk at x${M.slow} (${slowD.toFixed(0)} vs ${freeD.toFixed(0)}, ${ch && ch.ph})`);
    expect(Math.hypot(ch.bx - tux.x, ch.by - tux.y) <= tux.r + 12.5, `Lock: the ball dragged along behind them (${Math.hypot(ch.bx - tux.x, ch.by - tux.y).toFixed(1)})`);
    const ev = run(F, S(M.lock) + 4);
    expect(!(tux.lockT > 0) && has(ev, 'feUnchain', 0) && ch.ph === 'off', `Lock: the ball and chain falls off when it wears off (${kinds(ev)})`);
  }
  // ---- Lock's aim, as a human presses it (out of range: as far toward the foe as it goes): the press through the sim's own input path (setInput, the special key)
  { const lockAt = (fx, fy, ox, oy, hold = {}) => {
      const F = mk(['ferris', 'tux'], 'ring'); place(F, 100); const [fe, tux] = F.f;
      Object.assign(fe, { x: fx, y: fy, face: Math.atan2(oy - fy, ox - fx) }); Object.assign(tux, { x: ox, y: oy });
      let r = null; for (let k = 0; k < 6 && !r; k++) { run(F, 1, { ...hold, special: k < 2 }); r = F.objs.find(o => o.kind === 'felock'); }
      return [r, fe.stats.moves.move3.range];
    };
    for (const [nm, fx, fy, ox, oy] of [['right', -190, 0, 190, 0], ['left', 190, 0, -190, 0], ['down', 0, -190, 0, 190], ['up', 0, 190, 0, -190]]) {
      for (const [hn, hold] of [['nothing held', {}], ['held away', { x: Math.sign(fx - ox), y: Math.sign(fy - oy) }]]) {
        const [r, range] = lockAt(fx, fy, ox, oy, hold), D = Math.hypot(ox - fx, oy - fy), ex = fx + (ox - fx) / D * range, ey = fy + (oy - fy) / D * range;
        expect(r && Math.hypot(r.x - ex, r.y - ey) < 1, `Lock: foe out of range ${nm}, ${hn}: as far as it reaches toward them (${r && r.x.toFixed(0)}, ${r && r.y.toFixed(0)} vs ${ex.toFixed(0)}, ${ey.toFixed(0)})`);
      }
    }
    for (const [nm, ox, oy] of [['right', 120, 30], ['left', -150, -20], ['down', -20, 140], ['up', 10, -160]]) {
      const [r] = lockAt(0, 0, ox, oy);
      expect(r && Math.hypot(r.x - ox, r.y - oy) < 1, `Lock: foe in range ${nm}, nothing held: on them (${r && r.x.toFixed(0)}, ${r && r.y.toFixed(0)})`);
    }
    { // in range, held well off them: that way, as far as they are
      const [r] = lockAt(0, 0, 120, 0, { x: 0, y: 1 });
      expect(r && Math.abs(r.x) < 1 && Math.abs(r.y - 120) < 1, `Lock: held down with them right: down, as far as they are (${r && r.x.toFixed(0)}, ${r && r.y.toFixed(0)})`);
    }
    { // in range, held away into the wall right behind him: not dropped at his feet, on them instead
      const [r] = lockAt(0, 170, 0, 40, { x: 0, y: 1 });
      expect(r && Math.hypot(r.x, r.y - 40) < 1, `Lock: held into the wall behind him: on them, not at his feet (${r && r.x.toFixed(0)}, ${r && r.y.toFixed(0)})`);
    }
  }
  // ---- Lock then claw: on someone locked the claw homes on them, the chain holds them, the fling hits harder
  { // locked, walking sideways: a claw aimed well off still catches them, they barely move while it comes, and it hurts more
    const F = mk(['ferris', 'tux']); place(F, 90); const [fe, tux] = F.f, M1 = fe.stats.moves.move1, M2 = fe.stats.moves.move3;
    run(F, S(M2.form) + 3, tap('special'));
    expect(tux.lockT > 0, `Lock then claw: locked (${tux.lockT})`);
    fe.face += 0.5; fe.cd[0] = 0;
    const hp = tux.hp, y0 = tux.y, ev = run(F, S(M1.startup + M1.shoot) + 2, tap('light'), { x: 0, y: 1 });
    expect(has(ev, 'feCatch', 0, { to: 1 }) && Math.abs(tux.y - y0) < 6, `Lock then claw: homes and catches, the chain taut (${kinds(ev)}, ${(tux.y - y0).toFixed(1)} sideways)`);
    run(F, S(M1.reel + M1.holdT) + 4);
    expect(Math.abs((hp - tux.hp) - M1.damage * M1.owned) < 1e-6, `Lock then claw: the fling does x${M1.owned} (${(hp - tux.hp).toFixed(1)})`);
  }
  { // locked, but their evade still answers it: slithered off sideways as it winds, it stops homing and misses
    const F = mk(['ferris', 'pyth']); place(F, 90); const [fe, py] = F.f, M1 = fe.stats.moves.move1, M2 = fe.stats.moves.move3;
    run(F, S(M2.form) + 3, tap('special'));
    expect(py.lockT > 0, `Lock then claw: Pyth locked (${py.lockT})`);
    fe.cd[0] = 0;
    const ev = run(F, S(M1.startup + M1.shoot + M1.clamp), tap('light'), k => k >= 4 && k < 7 ? { guard: true, x: 0, y: 1 } : { x: 0, y: 1 });
    expect(!has(ev, 'feCatch') && has(ev, 'feClamp', 0) && !fe.homed, `Lock then claw: evaded, it misses (${kinds(ev)})`);
  }
  // ---- Shell then unsafe: unsafe pressed while he rolls bursts out of the shell into the spin there
  { // a roll in at them; unsafe while rolling: the shell stops dead and judders (open), then the spin floors them
    const F = mk(['ferris', 'tux']); place(F, 120); const [fe, tux] = F.f, M = fe.stats.moves.move2, hp = tux.hp;
    let ev = run(F, 19, k => ({ guard: k < 2, x: 1 }));
    expect(fe.move === 'evade' && fe.ph === 'tuck' && fe.inv > 0, `Shell then unsafe: rolling (${fe.move}, ${fe.ph})`);
    const x0 = fe.x;
    ev = run(F, 2, tap('heavy'));
    expect(fe.move === 'move2' && fe.state === 'wind' && fe.ph === 'burst' && fe.pose === 'shell' && fe.inv <= 0 && has(ev, 'feBurst', 0) && Math.abs(fe.x - x0) < 8 && fe.cd[1] > 0 && fe.cd[3] > 0, `Shell then unsafe: out of the roll, juddering, open (${fe.move}, ${fe.ph}, ${fe.inv}, ${(fe.x - x0).toFixed(1)})`);
    ev = run(F, S(M.startup + M.active) + 6);
    expect(has(ev, 'feSpin', 0, { hit: true }) && has(ev, 'down', 1) && tux.hp < hp, `Shell then unsafe: the spin floors them (${kinds(ev)})`);
  }
  { // open while it judders: a hit lands on him
    const F = mk(['ferris', 'duke']); place(F, 120); const [fe, duke] = F.f, hp = fe.hp;
    run(F, 6, k => ({ guard: k < 2, x: -1 })); run(F, 2, tap('heavy'));
    expect(fe.ph === 'burst', `juddering (${fe.ph})`);
    duke.x = fe.x + fe.r + duke.r + 2; duke.y = fe.y; duke.face = Math.PI;
    const ok = F.hitF(duke, fe, duke.stats.moves.move1.hit, { dir: 0 });
    expect(ok && fe.hp < hp, `Shell then unsafe: hit while the shell judders (${ok}, ${F.lastRes})`);
  }
  { // unsafe on cooldown: pressing it in the shell does nothing, the roll goes on
    const F = mk(['ferris', 'tux']); place(F, 120); const fe = F.f[0];
    run(F, 4, k => ({ guard: k < 2, x: 0, y: 1 })); fe.cd[1] = 1;
    run(F, 3, tap('heavy'));
    expect(fe.move === 'evade' && fe.ph === 'tuck', `Shell then unsafe: not while unsafe cools down (${fe.move}, ${fe.ph})`);
  }
  { // a whiff is punishable: the other walks in and lands their own spin while he settles
    const F = mk(['ferris', 'ferris']); place(F, 54);   // (past the reach)
    const [a] = F.f, M = a.stats.moves.move2, w = S(M.startup + M.active), hp = a.hp;
    const ev = run(F, w + 40, tap('heavy'), k => k >= w && k < w + 6 ? { x: -1 } : k >= w + 6 && k < w + 8 ? { heavy: true } : {});
    expect(has(ev, 'feSpent', 0) && has(ev, 'hit', 1, { move: 'move2' }) && has(ev, 'down', 0) && a.hp < hp - M.self, `unsafe: a whiff punished (${kinds(ev)})`);
  }
}
