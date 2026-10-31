// Gradient Descent's tree fields: tree hits per kart (glade / forest), the time through each field, tree chains (a
// second crash within CHW s, default 1) and Mega Duck bonks from a duck sitting in a field, solo and in packs, drift on
// and off, at every bot level. The template for a one-mechanic measuring script on a track.
//   node test/ski-trees.mjs [--jobs=N]
import * as H from './harness.mjs';
import * as P from './pool.mjs';
const TR = 19;
function job(t) {
  return H.loadSim().then(sim => {
    const st = {}, seen = new Set(), pairs = new Set(); let fieldDucks = 0;   // per car
    const res = H.runRace(sim, { track: TR, seed: t.seed, level: t.level, idxs: t.idxs, laps: 1, noItems: t.noItems, drift: t.drift,
      onFrame(r) {
        const Z = r.track.mech.ski.zones.filter(z => z.kind === 'glade' || z.kind === 'forest');
        for (const c of r.cars) {
          const S = st[c.idx] || (st[c.idx] = { th: 0, trees: { glade: 0, forest: 0 }, t: { glade: [null, null], forest: [null, null] }, cd: 0, bonks: 0, fbonks: 0, chain: 0, lastHit: -9 });
          const z = Z.find(q => c.s >= q.s0 && c.s <= q.s1);
          const th = c.treeHits || 0;
          if (th > S.th && z) { S.trees[z.kind] += th - S.th; if (r.time - S.lastHit < (+process.env.CHW || 1.0)) S.chain++; S.lastHit = r.time; }
          S.th = th;
          for (const q of Z) { const T = S.t[q.kind]; if (T[0] === null && c.s >= q.s0) T[0] = r.time; if (T[1] === null && c.s >= q.s1) T[1] = r.time; }
          if ((c.duckCd || 0) !== S.cd) { S.cd = c.duckCd; S.bonks++;
            let best = null, bd = 1e9; for (const m of r.megas) { const d = Math.hypot(c.x - m.x, c.y - m.y) - m.r; if (d < bd) { bd = d; best = m; } }
            if (best && Z.some(q => best.s >= q.t0 && best.s <= q.t1) && !pairs.has(c.idx + ':' + r.megas.indexOf(best) + ':' + best.s)) { pairs.add(c.idx + ':' + r.megas.indexOf(best) + ':' + best.s); S.fbonks++; } }
        }
        for (const m of r.megas) if (!seen.has(m)) { seen.add(m); if (Z.some(q => m.s >= q.t0 && m.s <= q.t1)) fieldDucks++; }
      } });
    const o = Object.values(st); o[0].fd = fieldDucks; return Object.values(st).map(S => ({ g: S.trees.glade, f: S.trees.forest, gt: S.t.glade[1] - S.t.glade[0], ft: S.t.forest[1] - S.t.forest[0], b: S.bonks, fb: S.fbonks, ch: S.chain, fd: S.fd || 0 }));
  });
}
if (P.poolWorker(import.meta.url)) P.serve(job);
else {
  const sets = [];
  const grid = (k, n) => { const rng = H.mulberry(k * 31 + 7), pool = [...Array(10).keys()]; for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; } return pool.slice(0, n); };
  for (const level of [0, 1, 2]) {
    for (const ch of [3, 5, 1, 0]) for (let s = 1; s <= 6; s++) sets.push({ name: `solo drift L${level}`, level, seed: s, idxs: [ch], noItems: true, drift: true });
    for (let s = 1; s <= 24; s++) sets.push({ name: `4 bots drift L${level}`, level, seed: 100 + s, idxs: grid(s, 4), drift: true });
    for (let s = 1; s <= 12; s++) sets.push({ name: `8 bots drift L${level}`, level, seed: 200 + s, idxs: grid(s + 50, 8), drift: true });
    for (let s = 1; s <= 24; s++) sets.push({ name: `4 bots nodrift L${level}`, level, seed: 300 + s, idxs: grid(s + 90, 4), drift: false });
  }
  const out = await P.mapPool(import.meta.url, sets);
  const by = {};
  sets.forEach((t, i) => { const B = by[t.name] || (by[t.name] = { races: 0, cars: [] }); B.races++; B.cars.push(...out[i]); });
  const m = (a, k) => a.reduce((x, y) => x + y[k], 0) / a.length;
  console.log('set                    glade trees/kart  forest trees/kart  chains/kart  glade s  forest s  bonks/race  karts bonked by a field duck/race  field ducks/race');
  for (const [n, B] of Object.entries(by)) console.log(`${n.padEnd(22)} ${m(B.cars, 'g').toFixed(2).padStart(8)} ${m(B.cars, 'f').toFixed(2).padStart(16)} ${m(B.cars, 'ch').toFixed(2).padStart(12)} ${m(B.cars, 'gt').toFixed(2).padStart(9)} ${m(B.cars, 'ft').toFixed(2).padStart(8)} ${(B.cars.reduce((x, y) => x + y.b, 0) / B.races).toFixed(2).padStart(10)} ${(B.cars.reduce((x, y) => x + y.fb, 0) / B.races).toFixed(2).padStart(12)} ${(B.cars.reduce((x, y) => x + y.fd, 0) / B.races).toFixed(2).padStart(12)}`);
}
