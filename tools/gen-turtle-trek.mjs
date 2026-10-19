// Builds the 30 Tortoise Trek levels (www/js/turtle/trek-levels.js). Each level is a random field of rocks
// (and mud from level 13) whose shortest solution, found by breadth-first search, is exactly the target number
// of slides. Targets rise from 3 to 15. Run: node tools/gen-turtle-trek.mjs
import { writeFileSync } from 'node:fs';
import { parse, solve, slide, DIRS } from '../www/js/turtle/trek-engine.js';

let seed = 20261019;
const R = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x80000000; };

// how many squares the tortoise can reach: a dull level has very few
function reach(lv) {
  const seen = new Set([lv.start]), q = [lv.start];
  for (let k = 0; k < q.length; k++) for (const d of Object.keys(DIRS)) { const n = slide(lv, q[k], d); if (!seen.has(n)) { seen.add(n); q.push(n); } }
  return seen.size;
}

const out = [];
for (let i = 0; i < 30; i++) {
  const [w, h] = i < 10 ? [6, 7] : i < 20 ? [7, 9] : [8, 10];
  const par = 3 + Math.round(i * 0.42);
  let tries = 0, found = null;
  while (!found) {
    tries++;
    const rows = [];
    const dens = 0.12 + R() * 0.1;
    for (let y = 0; y < h; y++) { let r = ''; for (let x = 0; x < w; x++) r += R() < dens ? '#' : '.'; rows.push(r); }
    const cells = rows.map((r) => [...r]);
    if (i >= 12) for (let k = 0, n = 1 + ((R() * 3) | 0); k < n; k++) cells[(R() * h) | 0][(R() * w) | 0] = 'o';
    const free = []; cells.forEach((r, y) => r.forEach((c, x) => { if (c === '.') free.push([x, y]); }));
    if (free.length < 4) continue;
    const s = free[(R() * free.length) | 0], g = free[(R() * free.length) | 0];
    if (s === g) continue;
    cells[s[1]][s[0]] = 'S'; cells[g[1]][g[0]] = 'L';
    const lvRows = cells.map((r) => r.join(''));
    const lv = parse(lvRows), sol = solve(lv);
    if (!sol || sol.length !== par) continue;
    if (reach(lv) < par * 2 + 4) continue;
    found = { rows: lvRows, par };
  }
  out.push(found);
  console.log(`level ${i + 1}: ${found.par} slides (${tries} tries)`);
}

writeFileSync(new URL('../www/js/turtle/trek-levels.js', import.meta.url),
  `// Tortoise Trek levels, made by tools/gen-turtle-trek.mjs. par is the fewest slides that solve the level.\nexport const LEVELS = [\n${out.map((l) => `  { par: ${l.par}, rows: ${JSON.stringify(l.rows)} },`).join('\n')}\n];\n`);
