// Builds www/levels/potion.json: Potion Pour levels, each checked solvable by the solver.
// Usage: node tools/gen-potion.mjs          (generate)
//        node tools/gen-potion.mjs --check  (re-verify the saved file)
import { writeFileSync, readFileSync } from 'node:fs';
import { candidates, recipe, solve, acceptable, decode, encode, isSolved, CAP, LEVEL_COUNT } from '../www/js/potion-engine.js';

const OUT = new URL('../www/levels/potion.json', import.meta.url);

function check() {
  const { levels } = JSON.parse(readFileSync(OUT, 'utf8'));
  let bad = 0;
  levels.forEach((str, i) => {
    const s = decode(str), { k, spare } = recipe(i);
    const counts = {}; s.flat().forEach((c) => (counts[c] = (counts[c] || 0) + 1));
    const ok = s.length === k + spare && Object.keys(counts).length === k && Object.values(counts).every((n) => n === CAP)
      && s.every((f) => f.length <= CAP) && acceptable(s) && !isSolved(s) && solve(s, { limit: 500000 });
    if (!ok) { bad++; console.log('bad level', i + 1, str); }
  });
  console.log(`${levels.length} levels checked, ${bad} bad`);
  process.exit(bad ? 1 : 0);
}

if (process.argv.includes('--check')) check();
else {
  const levels = [], grades = [];
  for (let i = 0; i < LEVEL_COUNT; i++) {
    const { k, pos } = recipe(i);
    // more candidates for big levels, then pick harder ones as a colour block goes on
    const c = candidates(i, k >= 12 ? 14 : 8).sort((a, b) => a.grade - b.grade);
    if (!c.length) throw new Error('no level ' + i);
    const q = k >= 12 ? 0.3 + 0.7 * pos : 0.15 + 0.75 * pos;
    const pick = c[Math.min(c.length - 1, Math.round(q * (c.length - 1)))];
    levels.push(encode(pick.s)); grades.push(pick.grade);
    if (i % 50 === 0) console.log(`level ${i + 1}: ${k} colours, grade ${pick.grade}`);
  }
  writeFileSync(OUT, JSON.stringify({ version: 1, cap: CAP, levels }) + '\n');
  console.log(`wrote ${levels.length} levels, grades ${Math.min(...grades)} to ${Math.max(...grades)}`);
}
