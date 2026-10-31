// Swifty's moves (js/kits/swifty.js), checked by test/fight.test.mjs: each does what it says, its tell shows, its answer works.
// T: the test's tools ({ mk, place, run, has, kinds, tap, S, expect }); lands: what each move card's clip must show.
import { loopAt } from '../../js/kits/swifty.js';
import { Fight } from '../../js/fight.js';

// a bot at level lv's aim: how far sideways the foe stands off Swifty's Closure as it's flung (units, the mean over a
// few bot fights against a Normal Duke)
function aimErr(lv) {
  let sum = 0, n = 0;
  for (let s = 1; s <= 4; s++) {
    const F = new Fight({ ids: ['swifty', 'duke'], bots: [lv, 1], seed: 400 + s }), d = F.f[0], o = F.f[1];
    let was = '';
    for (let k = 0; k < 60 * 90 && F.phase !== 'over'; k++) {
      F.step(); F.events.length = 0;
      const now = d.state + d.move;
      if (now !== was && d.state === 'strike' && d.move === 'move2' && o.state !== 'down' && o.state !== 'getup') { const a = Math.atan2(o.y - d.y, o.x - d.x), r = Math.hypot(o.x - d.x, o.y - d.y); if (Math.cos(a - d.face) > 0) { sum += Math.abs(Math.sin(a - d.face)) * r; n++; } }
      was = now;
    }
  }
  return { mean: n ? sum / n : 0, n };
}
// one of Cpp's flies (fighter 1's), set by hand: a sentry hovering at (x, y), or stuck on fighter 0
const fly = (F, st, x, y) => { const c = F.f[1], b = { id: ++F.oid, kind: 'cpfly', st, x, y, z: 22, vx: 0, vy: 0, vz: 0, r: 0, hx: x, hy: y, on: st === 'stuck' ? 0 : -1, oa: 0, sT: 9, ttl: 9, rest: 9, dT: 0, was: '', wv: -1, wn: 0, t: 0, life: 99, owner: c.i, hit: false, mv: null, ms: 0 }; F.objs.push(b); return b; };

export const lands = {
  move3: ev => ev.some(e => e.kind === 'swGust' && e.who === 0) && ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move3') && ev.some(e => e.kind === 'wall' && e.who === 1),
  move1: ev => ev.some(e => e.kind === 'swClip' && e.who === 0) && ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move1'),
  move2: ev => ev.some(e => e.kind === 'swSnip' && e.who === 0),
  evade: ev => ev.some(e => e.kind === 'swHop' && e.who === 0) && ev.some(e => e.kind === 'swTuck' && e.who === 0) && ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move1') && !ev.some(e => e.kind === 'hit' && e.to === 0),   // (Hop then Catch)
};

export function checks({ mk, place, run, has, kinds, tap, S, expect }) {
  // ---- do / try / catch (her hit-and-run)
  { // a quick crouch (nothing on the floor), then the dart: clipped, and she flips back off them, out of reach
    const F = mk(['swifty', 'duke']); place(F, 60); const [sw, duke] = F.f, M = sw.stats.moves.move1, hp = duke.hp, x0 = duke.x;
    let ev = run(F, 3, tap('light'));
    expect(sw.ph === 'crouch' && sw.pose === 'flick' && !F.objs.length, `Catch: the crouch, nothing on the floor (${sw.ph}, ${sw.pose})`);
    let top = sw.x;
    for (let k = 0; k < S(M.startup + M.active) + 8; k++) { ev.push(...run(F, 1)); top = Math.max(top, sw.x); }
    expect(has(ev, 'swClip', 0) && has(ev, 'hit', 0, { move: 'move1' }) && Math.abs((hp - duke.hp) - M.damage) < 1e-6 && (sw.ph === 'flip' || sw.ph === 'alight'), `Catch: clipped them, ${M.damage} (${kinds(ev)})`);
    run(F, 14);
    expect(sw.x < top - 25 && duke.x > x0 + 30, `Catch: she flips back off them (${(sw.x - top).toFixed(0)}), they're pushed off (${(duke.x - x0).toFixed(0)})`);
  }
  { // at the end of its reach it still lands; past it, a whiff: she skids, open, and gets punished
    const F = mk(['swifty', 'duke']); const M = F.f[0].stats.moves.move1; place(F, M.reach + M.dash - 6); const duke = F.f[1], hp = duke.hp;
    const ev = run(F, S(M.startup + M.active) + 8, tap('light'));
    expect(has(ev, 'hit', 0, { move: 'move1' }) && duke.hp < hp, `Catch: lands at ${M.reach + M.dash - 6} (${kinds(ev)})`);
    const G = mk(['swifty', 'tux']); place(G, M.reach + M.dash + 30); const [sw, tux] = G.f, hp2 = tux.hp;
    const ev2 = run(G, S(M.startup + M.active) + 2, tap('light'));
    expect(!has(ev2, 'hit', 0) && tux.hp === hp2 && has(ev2, 'swSkid', 0) && sw.ph === 'skid' && Math.abs(sw.dur - M.miss) < 1e-9, `Catch: a whiff, she skids, open (${sw.ph}, ${kinds(ev2)})`);
    const h = sw.hp, ev3 = run(G, 40, {}, tap('heavy'));
    expect(has(ev3, 'hit', 1) && sw.hp < h, `Catch: punished on the skid (${kinds(ev3)})`);
  }
  { // bugs in her way are swallowed (a little health back each), and so are the ones stuck on her
    const F = mk(['swifty', 'cpp']); place(F, 150); const sw = F.f[0], M = sw.stats.moves.move1;
    sw.hp = sw.maxHp - 10;
    const a = fly(F, 'sentry', sw.x + 60, sw.y + 6), b = fly(F, 'stuck', sw.x, sw.y), far = fly(F, 'sentry', sw.x + 40, sw.y + 90);
    const ev = run(F, S(M.startup + M.active) + 2, tap('light'));
    expect(ev.filter(e => e.kind === 'swGulp' && e.who === 0).length === 2 && a.t >= a.life && b.t >= b.life && far.t < far.life, `Catch: two bugs swallowed, not the far one (${kinds(ev)})`);
    expect(Math.abs(sw.hp - (sw.maxHp - 10 + 2 * M.heal)) < 0.1, `Catch: ${2 * M.heal} health back (${(sw.hp - sw.maxHp + 10).toFixed(1)})`);
  }
  // ---- Gust
  { // in the cone: pushed away hard (no knockdown in the open)
    const F = mk(['swifty', 'duke']); place(F, 50, { a: { x: -120 }, b: { x: -50 } }); const duke = F.f[1], x0 = duke.x, M = F.f[0].stats.moves.move3;
    let ev = run(F, 4, tap('special'));
    expect(F.f[0].ph === 'flap' && F.f[0].pose === 'flap' && F.objs.some(o => o.kind === 'swCone') && has(ev, 'swFlap', 0), `Gust: wings up, the cone (${F.f[0].ph})`);
    ev = ev.concat(run(F, S(M.startup + M.active + 0.4)));
    expect(has(ev, 'swGust', 0) && has(ev, 'hit', 0, { move: 'move3' }) && has(ev, 'swFeathers', 0) && !has(ev, 'swGustMiss', 0) && !has(ev, 'down', 1) && duke.x > x0 + 80, `Gust: blown away (${(duke.x - x0).toFixed(0)}, ${kinds(ev)})`);
  }
  { // near a wall: blown into it, a slam (down)
    const F = mk(['swifty', 'duke']); place(F, 50, { a: { x: 60 }, b: { x: 140 } });
    const ev = run(F, 80, tap('special'));
    expect(has(ev, 'wall', 1) && has(ev, 'down', 1), `Gust: into the wall (${kinds(ev)})`);
  }
  { // beyond its reach: nothing (its miss), and she's open as she lands
    const F = mk(['swifty', 'tux']); const M = F.f[0].stats.moves.move3; place(F, M.range + 30); const [sw, tux] = F.f, hp = tux.hp;
    const ev = run(F, S(M.startup + M.active) + 2, tap('special'));
    expect(!has(ev, 'hit', 0) && tux.hp === hp && has(ev, 'swGustMiss', 0) && sw.ph === 'gust' && sw.state === 'recover', `Gust: out of reach, nothing; landing (${sw.ph}, ${kinds(ev)})`);
  }
  { // a wind, not one shove: walking into the cone while it blows is held back (they make less ground than in calm air)
    const walkIn = gust => {
      const F = mk(['swifty', 'duke']); const M = F.f[0].stats.moves.move3; place(F, M.range + 4); const duke = F.f[1];
      if (gust) { run(F, S(M.startup) + 1, tap('special')); } else run(F, S(M.startup) + 1);
      const x0 = duke.x, ev = run(F, S(M.active) - 2, {}, { x: -1, y: 0 });
      return [x0 - duke.x, ev];
    };
    const [calm] = walkIn(false), [held, ev] = walkIn(true);
    expect(held < calm - 20 && !has(ev, 'hit', 0), `Gust: walking into it is slow (${held.toFixed(0)} vs ${calm.toFixed(0)} in calm air)`);
  }
  { // light things in it are blown along: Cpp's flies off their posts, out away from her
    const F = mk(['swifty', 'cpp']); place(F, 260); const sw = F.f[0], M = sw.stats.moves.move3;
    const b = fly(F, 'sentry', sw.x + 90, sw.y), x0 = b.x;
    run(F, S(M.startup + M.active) + 2, tap('special'));
    expect(b.t < b.life && b.x > x0 + 40 && b.hx === b.x, `Gust: Cpp's fly blown along (${(b.x - x0).toFixed(0)})`);
  }
  // ---- Closure
  { // the loop shows while she winds up; the feather flies it, hitting them on the way out; one at a time
    const F = mk(['swifty', 'duke']); place(F, 110); const [sw, duke] = F.f, M = sw.stats.moves.move2;
    run(F, 2, tap('heavy'));
    const b = F.objs.find(o => o.kind === 'swFeather');
    expect(b && b.ph === 'aim' && sw.ph === 'cock' && sw.pose === 'cock' && b.out >= M.near && b.width === M.width, `Closure: the loop shown (${b && b.ph}, ${sw.ph})`);
    const ev = run(F, S(M.startup + 0.5));
    expect(b.ph === 'fly' && has(ev, 'swSnip', 0) && has(ev, 'hit', 0, { move: 'move2' }) && !has(ev, 'down', 1), `Closure: hits on the way out (${kinds(ev)})`);
    run(F, S(M.recovery)); sw.cd[1] = 0; run(F, 2, tap('heavy'));   // (her landing over: the feather still out)
    expect(sw.move !== 'move2' && F.objs.filter(o => o.kind === 'swFeather').length === 1, `Closure: one feather at a time (${sw.move})`);
    const ev2 = run(F, S(M.flight));
    expect(has(ev2, 'swCatch', 0) && !F.objs.some(o => o.kind === 'swFeather'), `Closure: back home (${kinds(ev2)})`);
  }
  { // standing where the way back comes: hit on the way back, pulled toward her
    const F = mk(['swifty', 'duke']); place(F, 110); const [sw, duke] = F.f, M = sw.stats.moves.move2;
    run(F, 2, tap('heavy')); const b = F.objs.find(o => o.kind === 'swFeather');
    const [x, y] = loopAt(b, 0.72, sw.x, sw.y), st0 = duke.stats; duke.x = x; duke.y = y; duke.stats = { ...st0, walk: 0 };
    const ev = run(F, S(M.startup + M.flight));
    duke.stats = F.f[0].stats.moves && duke.stats;
    const back = ev.find(e => e.kind === 'hit' && e.who === 0 && e.move === 'move2');
    expect(back && has(ev, 'swSnip', 0), `Closure: hit on the way back (${kinds(ev)})`);
  }
  { // a solid in the way stops it
    const F = mk(['swifty', 'duke']); place(F, 160); const sw = F.f[0];
    F.objs.push({ id: ++F.oid, kind: 'testBlock', shape: 'box', x: sw.x + 50, y: sw.y, w: 34, h: 34, r: 3, z: 0, vx: 0, vy: 0, vz: 0, solid: 1, t: 0, life: 9, owner: 1, hit: false, mv: null, ms: 0 });
    const ev = run(F, 60, tap('heavy'));
    expect(has(ev, 'swDrop', 0) && !has(ev, 'hit', 0), `Closure: stopped by a solid (${kinds(ev)})`);
  }
  // ---- aiming (easier for players, slightly worse for bots)
  for (const [key, mk2, kind] of [['special', 'move3', 'hit'], ['heavy', 'move2', 'swSnip']]) { // a player holding nothing: it tracks someone walking slowly sideways, and lands
    const F = mk(['swifty', 'duke']); place(F, 150);
    const ev = run(F, 120, tap(key), { x: 0, y: 0.35 });
    expect(has(ev, kind, 0, kind === 'hit' ? { move: mk2 } : {}), `aim assist: ${mk2} tracks a slow walker and lands (${kinds(ev)})`);
  }
  { // a Chill bot's aim is off by more than a Ruthless one's
    const e0 = aimErr(0), e2 = aimErr(2);
    expect(e0.n > 5 && e2.n > 5 && e0.mean > e2.mean + 5, `bots' aim: Chill ${e0.mean.toFixed(0)} off (${e0.n}), Ruthless ${e2.mean.toFixed(0)} (${e2.n})`);
  }
  // ---- Wing Hop
  { // a long hop the held way, untouchable in the air, then a landing (open); a cooldown after
    const F = mk(['swifty', 'duke']); place(F, 120, { a: { y: 80 }, b: { y: 80 } }); const sw = F.f[0], E = sw.stats.moves.evade, y0 = sw.y;
    run(F, 2, { guard: true, x: 0, y: -1 });
    expect(sw.move === 'evade' && sw.inv > 0 && sw.ph === 'hop' && sw.pose === 'glide', `Wing Hop: up, untouchable (${sw.ph})`);
    const ev = run(F, S(E.active) + 1);
    expect(Math.abs(sw.y - (y0 - E.dist)) < 6 && has(ev, 'swLand', 0) && sw.ph === 'perch' && sw.state === 'recover' && sw.inv <= 0, `Wing Hop: ${E.dist} up, then the landing, open (${(sw.y - y0).toFixed(0)})`);
    run(F, S(E.recovery) + 2); run(F, 1, { guard: true }); run(F, 1);
    expect(sw.move !== 'evade' && sw.cd[3] > 0, 'Wing Hop: a cooldown after');
  }
  { // out of a toboggan's way
    const F = mk(['swifty', 'tux']); place(F, 130); const sw = F.f[0], hp = sw.hp;
    const ev = run(F, 90, k => k >= 28 && k < 30 ? { guard: true, x: 0, y: -1 } : {}, k => ({ heavy: k >= 14 && k < 16 }));   // (Tux's dash: its squat is 14 frames shorter than his old crouch)
    expect(has(ev, 'swHop', 0) && sw.hp === hp && !has(ev, 'hit', 1), `Wing Hop: out of the toboggan (${kinds(ev)})`);
  }
  // ---- Hop then Catch: the Catch during the Wing Hop swoops down out of the air
  { // a hop in at them; the Catch up in the air: the tuck (up there, no longer untouchable), the swoop down, it lands
    const F = mk(['swifty', 'duke']); place(F, 130); const [sw, duke] = F.f, M = sw.stats.moves.move1, hp = duke.hp;
    let ev = run(F, 8, k => ({ guard: k < 2, x: 1 }));
    expect(sw.move === 'evade' && sw.ph === 'hop' && sw.z > 5, `Hop then Catch: up in the hop (${sw.ph}, z ${sw.z.toFixed(1)})`);
    ev = ev.concat(run(F, 2, tap('light')));
    const z0 = sw.z;
    expect(sw.move === 'move1' && sw.state === 'strike' && sw.ph === 'tuck' && z0 > 5 && sw.inv <= 0 && has(ev, 'swTuck', 0), `Hop then Catch: the tuck, up in the air (${sw.move}, ${sw.ph}, z ${z0.toFixed(1)}, inv ${sw.inv})`);
    expect(sw.cd[0] > 0 && sw.cd[3] > 0, `Hop then Catch: both cooldowns spent (${sw.cd})`);
    let hitZ = -1; const ev2 = [];
    for (let k = 0; k < S(M.air.active + M.flipT) + 14; k++) { const e = run(F, 1); ev2.push(...e); if (hitZ < 0 && has(e, 'hit', 0, { move: 'move1' })) hitZ = sw.z; }
    expect(has(ev2, 'swClip', 0) && has(ev2, 'hit', 0, { move: 'move1' }) && duke.hp < hp && hitZ > 0, `Hop then Catch: it lands from the air (z ${hitZ.toFixed(1)}; ${kinds(ev2)})`);
    expect(sw.z === 0 && sw.state === 'recover', `Hop then Catch: back on her feet after (${sw.z}, ${sw.state})`);
  }
  { // from the air, missing: she skids, open (the ground dart's miss time)
    const F = mk(['swifty', 'duke']); place(F, 120); const sw = F.f[0], M = sw.stats.moves.move1;
    run(F, 8, k => ({ guard: k < 2, x: -1 })); run(F, 2, tap('light'));
    const ev = run(F, S(M.air.active) + 2);
    expect(sw.ph === 'skid' && sw.state === 'recover' && Math.abs(sw.dur - M.miss) < 1e-6 && !has(ev, 'hit', 0) && sw.z === 0, `Hop then Catch: a miss, she skids, open (${sw.ph}, ${kinds(ev)})`);
  }
  { // a plain Catch is still the crouch on the ground
    const F = mk(['swifty', 'duke']); place(F, 20); const sw = F.f[0];
    run(F, 2, tap('light'));
    expect(sw.ph === 'crouch' && sw.state === 'wind' && sw.z === 0, `plain Catch: the crouch (${sw.ph})`);
  }
}
