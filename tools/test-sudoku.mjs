import { generate, countSolutions, grade, findHint, DIFFICULTIES } from '../www/js/sudoku-engine.js';
let fail = 0;
for (const d of DIFFICULTIES) {
  const times = [];
  for (let k = 0; k < 4; k++) {
    const t0 = performance.now();
    const g = generate(d, 1000 + k);
    times.push(performance.now() - t0);
    const n = countSolutions(g.puzzle, 2);
    const ok = n === 1 && g.puzzle.every((v, i) => !v || v === g.solution[i]);
    if (!ok) { fail++; console.log('FAIL', d, k, n); }
    if (k === 0) console.log(d.padEnd(8), 'clues', g.clues, 'tech', g.tech);
  }
  console.log('   ms', times.map((t) => t.toFixed(0)).join(', '));
}
// determinism (daily challenges rely on it)
const a = generate('hard', 42), b = generate('hard', 42);
if (a.puzzle.join('') !== b.puzzle.join('')) { fail++; console.log('FAIL determinism'); }
// hint on fresh puzzle should be a correct logical placement
const g = generate('medium', 7);
const h = findHint(g.puzzle, g.solution);
if (h.digit !== g.solution[h.cell] || h.kind !== 'logic') { fail++; console.log('FAIL hint', h); }
const wrong = g.puzzle.slice(); const e = wrong.indexOf(0); wrong[e] = g.solution[e] % 9 + 1;
if (findHint(wrong, g.solution).kind !== 'mistake') { fail++; console.log('FAIL mistake hint'); }
console.log(fail ? `${fail} FAILURES` : 'ALL PASS');
