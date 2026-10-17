// Builds www/levels/solitaire-deals.json: deal numbers the solver has proven winnable.
// Usage: node tools/gen-solitaire-deals.mjs [count]
import { writeFileSync } from 'node:fs';
import { deal, solve } from '../www/js/solitaire-engine.js';

const COUNT = +(process.argv[2] || 500);
const out = {};
for (const draw of [1, 3]) {
  const seeds = [];
  const t0 = Date.now();
  for (let seed = 1; seeds.length < COUNT; seed++) {
    if (solve(deal(seed, draw), 150000).won) seeds.push(seed);
    if (seeds.length && seeds.length % 100 === 0 && !out['_' + draw + seeds.length]) { out['_' + draw + seeds.length] = 1; console.log(`draw ${draw}: ${seeds.length} winnable deals (${((Date.now() - t0) / 1000).toFixed(0)}s)`); }
  }
  out['draw' + draw] = seeds;
}
writeFileSync('www/levels/solitaire-deals.json', JSON.stringify({ version: 1, draw1: out.draw1, draw3: out.draw3 }));
console.log('wrote', out.draw1.length, '+', out.draw3.length, 'deals');
