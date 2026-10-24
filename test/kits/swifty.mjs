// Swifty's moves (js/kits/swifty.js), checked by test/fight.test.mjs: each does what it says, its tell shows, its answer works.
// T: the test's tools ({ mk, place, run, has, kinds, tap, S, expect }); lands: what each move card's clip must show.
import { loopAt } from '../../js/kits/swifty.js';

export const lands = {
  move1: ev => ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move1') && ev.some(e => e.kind === 'down' && e.who === 1),
  move2: ev => ev.some(e => e.kind === 'swGust' && e.who === 0) && ev.some(e => e.kind === 'hit' && e.who === 0 && e.move === 'move2') && ev.some(e => e.kind === 'wall' && e.who === 1),
  move3: ev => ev.some(e => e.kind === 'swSnip' && e.who === 0),
  evade: ev => ev.some(e => e.kind === 'swHop' && e.who === 0) && !ev.some(e => e.kind === 'hit' && e.to === 0),
};

export function checks({ mk, place, run, has, kinds, tap, S, expect }) {
  // ---- Dive Bomb
  { // up, the shimmer marks her line through them; she dives along it: down they go; she bounces off
    const F = mk(['swifty', 'duke']); place(F, 140); const [sw, duke] = F.f, M = sw.stats.moves.move1;
    run(F, 4, tap('light'));
    const ln = F.objs.find(o => o.kind === 'swLine');
    expect(sw.ph === 'rise' && sw.pose === 'hover' && ln && ln.ph === 'aim' && ln.len > 140 && Math.abs(Math.sin(ln.a)) < 0.05, `Dive Bomb: up, the line through them (${sw.ph}, ${ln && ln.len})`);
    const ev = run(F, S(M.startup + 0.4));
    expect(has(ev, 'swDive', 0) && has(ev, 'hit', 0, { move: 'move1' }) && has(ev, 'down', 1) && sw.ph === 'bounce', `Dive Bomb: lands, knocks down (${kinds(ev)})`);
  }
  { // stepped off the line before she dives: missed, she tumbles (open)
    const F = mk(['swifty', 'duke']); place(F, 150); const duke = F.f[1], hp = duke.hp;
    const ev = run(F, 70, tap('light'), k => k > 4 && k < 40 ? { x: 0, y: -1 } : {});
    expect(duke.hp === hp && has(ev, 'swTumble', 0) && F.f[0].ph === 'tumble', `Dive Bomb: off the line, she tumbles (${kinds(ev)})`);
  }
  { // she can't turn once she goes; into a wall: a tumble
    const F = mk(['swifty', 'duke']); place(F, 300, { a: { x: 0, y: 0 }, b: { x: 0, y: 220 } });
    const ev = run(F, 80, k => ({ light: k < 2, x: 1, y: 0 }));
    expect(has(ev, 'swTumble', 0) && !has(ev, 'hit', 0), `Dive Bomb: the held way, into the wall: a tumble (${kinds(ev)})`);
  }
  // ---- Gust
  { // in the cone: pushed away hard (no knockdown in the open); beside her: nothing
    const F = mk(['swifty', 'duke']); place(F, 50, { a: { x: -120 }, b: { x: -50 } }); const duke = F.f[1], x0 = duke.x, M = F.f[0].stats.moves.move2;
    let ev = run(F, 4, tap('heavy'));
    expect(F.f[0].ph === 'flap' && F.f[0].pose === 'flap' && F.objs.some(o => o.kind === 'swCone'), `Gust: wings up, the cone (${F.f[0].ph})`);
    ev = ev.concat(run(F, S(M.startup + M.active + 0.4)));
    expect(has(ev, 'hit', 0, { move: 'move2' }) && !has(ev, 'down', 1) && duke.x > x0 + 80, `Gust: blown away (${(duke.x - x0).toFixed(0)}, ${kinds(ev)})`);
    const G = mk(['swifty', 'duke']); place(G, 50); G.f[1].y = 110; G.f[1].x = G.f[0].x + 20; const hp = G.f[1].hp;
    ev = run(G, S(M.startup + M.active + 0.2), k => ({ heavy: k < 2, x: 1, y: 0 }));
    expect(!has(ev, 'hit', 0) && G.f[1].hp === hp, `Gust: beside her, nothing (${kinds(ev)})`);
  }
  { // near a wall: blown into it, a slam (down)
    const F = mk(['swifty', 'duke']); place(F, 50, { a: { x: 60 }, b: { x: 140 } });
    const ev = run(F, 80, tap('heavy'));
    expect(has(ev, 'wall', 1) && has(ev, 'down', 1), `Gust: into the wall (${kinds(ev)})`);
  }
  // ---- Closure
  { // the loop shows while she winds up; the feather flies it, hitting them on the way out; one at a time
    const F = mk(['swifty', 'duke']); place(F, 110); const [sw, duke] = F.f, M = sw.stats.moves.move3;
    run(F, 2, tap('special'));
    const b = F.objs.find(o => o.kind === 'swFeather');
    expect(b && b.ph === 'aim' && sw.ph === 'cock' && sw.pose === 'cock' && b.out >= M.near && b.width === M.width, `Closure: the loop shown (${b && b.ph}, ${sw.ph})`);
    const ev = run(F, S(M.startup + 0.5));
    expect(b.ph === 'fly' && has(ev, 'swSnip', 0) && has(ev, 'hit', 0, { move: 'move3' }) && !has(ev, 'down', 1), `Closure: hits on the way out (${kinds(ev)})`);
    sw.cd[2] = 0; run(F, 2, tap('special'));
    expect(sw.move !== 'move3' && F.objs.filter(o => o.kind === 'swFeather').length === 1, `Closure: one feather at a time (${sw.move})`);
    const ev2 = run(F, S(M.flight));
    expect(has(ev2, 'swCatch', 0) && !F.objs.some(o => o.kind === 'swFeather'), `Closure: back home (${kinds(ev2)})`);
  }
  { // standing where the way back comes: hit on the way back, pulled toward her
    const F = mk(['swifty', 'duke']); place(F, 110); const [sw, duke] = F.f, M = sw.stats.moves.move3;
    run(F, 2, tap('special')); const b = F.objs.find(o => o.kind === 'swFeather');
    const [x, y] = loopAt(b, 0.72, sw.x, sw.y), st0 = duke.stats; duke.x = x; duke.y = y; duke.stats = { ...st0, walk: 0 };
    const ev = run(F, S(M.startup + M.flight));
    duke.stats = F.f[0].stats.moves && duke.stats;
    const back = ev.find(e => e.kind === 'hit' && e.who === 0 && e.move === 'move3');
    expect(back && has(ev, 'swSnip', 0), `Closure: hit on the way back (${kinds(ev)})`);
  }
  { // a solid in the way stops it
    const F = mk(['swifty', 'duke']); place(F, 160); const sw = F.f[0];
    F.objs.push({ id: ++F.oid, kind: 'dkBox', shape: 'box', x: sw.x + 50, y: sw.y, w: 34, h: 34, r: 3, z: 0, vx: 0, vy: 0, vz: 0, ph: 'down', k: 0, a: 0, mk: 'move1', solid: 1, t: 0, life: 9, owner: 1, by: -1, hit: false, mv: null, ms: 0 });
    const ev = run(F, 60, tap('special'));
    expect(has(ev, 'swDrop', 0) && !has(ev, 'hit', 0), `Closure: stopped by a crate (${kinds(ev)})`);
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
    const ev = run(F, 90, k => k >= 28 && k < 30 ? { guard: true, x: 0, y: -1 } : {}, tap('light'));
    expect(has(ev, 'swHop', 0) && sw.hp === hp && !has(ev, 'hit', 1), `Wing Hop: out of the toboggan (${kinds(ev)})`);
  }
}
