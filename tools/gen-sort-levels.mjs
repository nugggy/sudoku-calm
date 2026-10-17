// Builds www/levels/sort-levels.json: pre-checked Cosy Cat Sort levels (building some takes seconds).
// Usage: node tools/gen-sort-levels.mjs [count]
import { writeFileSync } from 'node:fs';
import { newLevel, encodeLevel, decodeLevel } from '../www/js/sort-engine.js';

const COUNT = +(process.argv[2] || 600);
const levels = [];
const t0 = Date.now();
for (let L = 0; L < COUNT; L++) {
  const st = newLevel(L);
  const enc = encodeLevel(st);
  if (JSON.stringify(encodeLevel(decodeLevel(L, enc))) !== JSON.stringify(enc)) throw new Error('round trip failed at ' + L);
  levels.push(enc);
  if ((L + 1) % 50 === 0) console.log(`${L + 1} levels, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
writeFileSync('www/levels/sort-levels.json', JSON.stringify({ version: 1, levels }));
console.log('wrote', levels.length, 'levels');
