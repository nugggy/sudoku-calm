// Builds www/levels/meow-levels.json: Meowdoku levels ordered from easiest to hardest.
// Usage: node tools/gen-meow-levels.mjs [--quick]
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateLevel, encodeLevel, countSolutions, gradeLevel, decodeLevel } from '../www/js/meow-engine.js';

const quick = process.argv.includes('--quick');
// [board size, number of levels]
const PLAN = quick ? [[4, 2], [5, 3], [6, 3], [7, 3], [8, 3], [9, 2], [10, 2]]
  : [[4, 5], [5, 15], [6, 30], [7, 50], [8, 80], [9, 120], [10, 200], [11, 250], [12, 250]];
const OVERSAMPLE = 4;

const levels = [];
let seed = 1;
for (const [n, count] of PLAN) {
  const t0 = Date.now();
  const pool = new Map();
  let attempts = 0;
  const over = n >= 12 ? 2 : n >= 11 ? 3 : OVERSAMPLE; // big boards are slow to build
  while (pool.size < Math.ceil(count * over) && attempts < count * 40) {
    attempts++;
    const lv = generateLevel(n, seed++ * 7919);
    if (lv) pool.set(encodeLevel(lv), lv);
  }
  const sorted = [...pool.values()].sort((a, b) => a.score - b.score);
  // evenly spaced picks across the difficulty range so each size ramps up
  const picks = [];
  for (let k = 0; k < count && sorted.length; k++) picks.push(sorted[Math.round(k * (sorted.length - 1) / Math.max(1, count - 1))]);
  const uniq = [...new Map(picks.map((p) => [encodeLevel(p), p])).values()];
  for (const p of uniq) levels.push(encodeLevel(p));
  const sc = uniq.map((p) => p.score);
  console.log(`${n}x${n}: ${uniq.length} levels from pool ${pool.size} (attempts ${attempts}), score ${sc[0]}..${sc[sc.length - 1]}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
// verify every level: unique solution and solvable by logic
for (const s of levels) {
  const lv = decodeLevel(s);
  if (countSolutions(lv.n, lv.regions, 2).count !== 1 || !gradeLevel(lv.n, lv.regions).solved) throw new Error('bad level ' + s);
}
mkdirSync('www/levels', { recursive: true });
writeFileSync('www/levels/meow-levels.json', JSON.stringify({ version: 1, levels }));
console.log('wrote', levels.length, 'levels');
