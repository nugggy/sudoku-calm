// Checks Arrow Away levels: every arrow is a connected path on the board, arrows never overlap,
// no arrow's path out crosses its own body, and every level can be cleared.
// Run with: node tools/test-arrow.mjs
import { makeLevel, canExit, isSolved, hint, DIRS } from '../www/js/arrow-engine.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; if (fail < 30) console.log('FAIL', msg); } };
const levels = [...Array(201).keys(), 250, 400, 777, 1000, 2500];
let fillSum = 0, arrowSum = 0, worst = 1, ms = 0;

for (const i of levels) {
  const t0 = performance.now();
  const L = makeLevel(i);
  ms += performance.now() - t0;
  const { w, h, mask, arrows } = L;
  const seen = new Int16Array(w * h).fill(-1);
  arrows.forEach((a, id) => {
    check(a.cells.length >= 2, `level ${i} arrow ${id} is too short`);
    check(a.c >= 0 && a.c < 10, `level ${i} arrow ${id} has no colour`);
    a.cells.forEach((k, j) => {
      check(mask[k], `level ${i} arrow ${id} leaves the board shape`);
      check(seen[k] < 0, `level ${i} arrows ${seen[k]} and ${id} overlap`);
      seen[k] = id;
      if (j) { const p = a.cells[j - 1]; check(Math.abs(p % w - k % w) + Math.abs(Math.floor(p / w) - Math.floor(k / w)) === 1, `level ${i} arrow ${id} is not connected`); }
    });
    const head = a.cells[a.cells.length - 1], neck = a.cells[a.cells.length - 2];
    check(head - neck === DIRS[a.dir][1] * w + DIRS[a.dir][0], `level ${i} arrow ${id} head does not point along its neck`);
    let x = head % w, y = Math.floor(head / w);
    for (;;) { x += DIRS[a.dir][0]; y += DIRS[a.dir][1]; if (x < 0 || y < 0 || x >= w || y >= h) break; check(!a.cells.includes(y * w + x), `level ${i} arrow ${id} would run into itself`); }
  });
  // greedy clear: removing any free arrow never hurts, so this decides whether the level can be won
  const removed = arrows.map(() => false);
  for (let left = arrows.length; left > 0; left--) {
    const id = hint(L, removed);
    if (id < 0) break;
    check(canExit(L, removed, id).ok, `level ${i} hint ${id} cannot leave`);
    removed[id] = true;
  }
  check(isSolved(L, removed), `level ${i} cannot be cleared`);
  const cells = mask.filter(Boolean).length, used = arrows.reduce((a, b) => a + b.cells.length, 0);
  fillSum += used / cells; arrowSum += arrows.length; worst = Math.min(worst, used / cells);
}

console.log(`Arrow Away: ${levels.length} levels, average fill ${(100 * fillSum / levels.length).toFixed(1)}% (lowest ${(100 * worst).toFixed(1)}%), ${(arrowSum / levels.length).toFixed(1)} arrows each, ${(ms / levels.length).toFixed(1)} ms per level`);
if (fail) { console.log(`${fail} problems`); process.exit(1); }
console.log('All Arrow Away levels are valid and can be cleared.');
