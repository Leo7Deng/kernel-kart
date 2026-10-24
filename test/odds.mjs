// npm run odds: the item odds as a table, straight from the game (placeChances, what rollItem rolls from): the
// chance of each item for a car at a given place and distance behind the leader. Prints Markdown for README.md.
import { loadSim } from './harness.mjs';

await loadSim();   // load the game first: item modules are only safe to import after the registry
const { ITEMS, ITEM_ORDER, placeChances, gapK } = await import('../js/items/index.js');

const cols = [   // [header, place, cars, distance behind the leader in world units]
  ['1st', 1, 4, 0], ['2nd, close', 2, 4, 150], ['2nd, far', 2, 4, 3200], ['3rd, close', 3, 4, 300], ['3rd, far', 3, 4, 3200],
  ['4th, close', 4, 4, 450], ['4th, halfway', 4, 4, 1600], ['4th, far', 4, 4, 3200], ['2nd of 2, close', 2, 2, 150], ['2nd of 2, far', 2, 2, 3200],
];
const pct = cols.map(([, rank, n, gap]) => {
  const t = placeChances(rank, n, gapK(gap)); let sum = 0;
  for (const k in t) sum += t[k];
  return Object.fromEntries(ITEM_ORDER.map(k => [k, 100 * (t[k] || 0) / sum]));
});
console.log(`| Item | ${cols.map(c => c[0]).join(' | ')} |`);
console.log(`|---|${cols.map(() => '---').join('|')}|`);
for (const k of ITEM_ORDER) console.log(`| ${ITEMS[k].name} | ${pct.map(p => p[k] >= 0.5 ? Math.round(p[k]) + '%' : '·').join(' | ')} |`);
