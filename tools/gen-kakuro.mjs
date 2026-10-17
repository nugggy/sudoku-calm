// Builds www/levels/kakuro.json: Kakuro puzzles that each have exactly one solution.
// Usage: node tools/gen-kakuro.mjs [count]
import { writeFileSync } from 'node:fs';
import { mulberry32 } from '../www/js/sudoku-engine.js';
import { runsOf, countSolutions } from '../www/js/kakuro-engine.js';

const COUNT = +(process.argv[2] || 120);
const plan = (i) => (i < 20 ? 5 : i < 55 ? 6 : 7); // 7x7 is the largest that still fits a phone comfortably

function pattern(size, rng) {
  // first row and column are clue blocks; extra blocks are placed with 180-degree symmetry
  const white = [...Array(size)].map((_, r) => [...Array(size)].map((_, c) => r > 0 && c > 0));
  const extra = Math.floor((size - 1) * (size - 1) * (size <= 5 ? 0.12 + rng() * 0.12 : 0.2 + rng() * 0.12));
  for (let k = 0; k < extra; k++) {
    const r = 1 + ((rng() * (size - 1)) | 0), c = 1 + ((rng() * (size - 1)) | 0);
    white[r][c] = false; white[size - r][size - c] = false;
  }
  // every white square must be in an across run and a down run of at least two
  for (let pass = 0; pass < 6; pass++) for (let r = 1; r < size; r++) for (let c = 1; c < size; c++) {
    if (!white[r][c]) continue;
    const h = (c > 1 && white[r][c - 1]) || (c < size - 1 && white[r][c + 1]);
    const v = (r > 1 && white[r - 1][c]) || (r < size - 1 && white[r + 1][c]);
    if (!h || !v) white[r][c] = false;
  }
  return white;
}

function fill(size, white, runs, rng) {
  const cellRuns = new Map();
  runs.forEach((run, ri) => run.cells.forEach((i) => { if (!cellRuns.has(i)) cellRuns.set(i, []); cellRuns.get(i).push(ri); }));
  const cells = [...cellRuns.keys()];
  const used = runs.map(() => 0), val = new Map();
  function rec(k) {
    if (k === cells.length) return true;
    const i = cells[k];
    // extreme digits make sums with fewer possible combinations, which keeps the answer unique
    const bias = [0, 0.7, 0.45, 0.2, 0, 0, 0, 0.2, 0.45, 0.7];
    const ds = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => [d, rng() + bias[d]]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    for (const d of ds) {
      if (cellRuns.get(i).some((ri) => used[ri] & (1 << d))) continue;
      val.set(i, d); cellRuns.get(i).forEach((ri) => (used[ri] |= 1 << d));
      if (rec(k + 1)) return true;
      cellRuns.get(i).forEach((ri) => (used[ri] &= ~(1 << d))); val.delete(i);
    }
    return false;
  }
  return rec(0) ? val : null;
}

const puzzles = [];
for (let i = 0; i < COUNT; i++) {
  const size = plan(i), rng = mulberry32(6161 + i * 389);
  let made = null;
  for (let t = 0; t < 3000 && !made; t++) {
    const white = pattern(size, rng);
    const isW = (r, c) => r >= 0 && c >= 0 && r < size && c < size && white[r][c];
    const runs = runsOf(size, size, isW);
    const whiteCount = white.flat().filter(Boolean).length;
    if (whiteCount < (size - 1) * (size - 1) * 0.5 || runs.some((r) => r.cells.length > 6)) continue;
    for (let f = 0; f < 25 && !made; f++) {
      const val = fill(size, white, runs, rng);
      if (!val) break;
      const sums = runs.map((r) => r.cells.reduce((a, c) => a + val.get(c), 0));
      if (countSolutions(size, size, runs, sums, 2) === 1) {
        const cells = [...Array(size * size)].map((_, k) => (val.has(k) ? String(val.get(k)) : '#')).join('');
        made = { size, cells };
      }
    }
  }
  if (!made) throw new Error('no kakuro ' + i);
  puzzles.push(made);
  if ((i + 1) % 20 === 0) console.log(i + 1, 'puzzles');
}
writeFileSync('www/levels/kakuro.json', JSON.stringify({ version: 1, puzzles }));
console.log('wrote', puzzles.length, 'kakuro puzzles');
