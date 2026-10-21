// Checks Arrow Away levels: every arrow is a connected path on the board, arrows never overlap,
// no arrow's path out crosses its own body, and every level can be cleared.
// Run with: node tools/test-arrow.mjs
import { makeLevel, canExit, isSolved, hint, DIRS, is3D } from '../www/js/arrow-engine.js';
import { canExit3d, hint3d, rayOf, track3d } from '../www/js/arrow3d-engine.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; if (fail < 30) console.log('FAIL', msg); } };
const levels = [...Array(201).keys(), 250, 400, 777, 1000, 2500];
let fillSum = 0, arrowSum = 0, worst = 1, ms = 0, n3d = 0, bent = 0, folded = 0;

// 3D levels: tiles link up both ways, arrows are connected along the surface, every way out reaches an open rim
// without looping or running into its own arrow, and the level can be cleared.
function check3d(i, L) {
  const { surf, arrows } = L;
  n3d++;
  for (let s = 0; s < surf.next.length; s++) {
    const t = surf.next[s]; if (t < 0) continue;
    const back = surf.next[(t >> 2) * 4 + (((t & 3) + 2) % 4)];
    check(back >= 0 && (back >> 2) === (s >> 2) && (back & 3) === (((s & 3) + 2) % 4), `level ${i} tile link ${s} is one way`);
  }
  const seen = new Int16Array(L.cellCount).fill(-1);
  arrows.forEach((a, id) => {
    check(a.cells.length >= 2, `level ${i} arrow ${id} is too short`);
    a.cells.forEach((c, j) => {
      check(seen[c] < 0, `level ${i} arrows ${seen[c]} and ${id} overlap`); seen[c] = id;
      if (j) check([0, 1, 2, 3].some((e) => (surf.next[a.cells[j - 1] * 4 + e] >> 2) === c && surf.next[a.cells[j - 1] * 4 + e] >= 0), `level ${i} arrow ${id} is not connected`);
    });
    const head = a.cells.at(-1), neck = a.cells.at(-2), e = [0, 1, 2, 3].find((d) => surf.next[neck * 4 + d] >= 0 && (surf.next[neck * 4 + d] >> 2) === head);
    check((surf.next[neck * 4 + e] & 3) === a.dir, `level ${i} arrow ${id} head does not point along its neck`);
    const r = rayOf(surf, head, a.dir);
    check(r.exits, `level ${i} arrow ${id} would go round and round`);
    check(!r.cells.some((c) => a.cells.includes(c)), `level ${i} arrow ${id} would run into itself`);
    const t = track3d(L, id, 2); check(t.pts.length === t.nrm.length, `level ${i} arrow ${id} track`);
    if (new Set(a.cells.map((c) => surf.cells[c].n.join())).size > 1) bent++;
    if (new Set([head, ...r.cells].map((c) => surf.cells[c].n.join())).size > 1) folded++;
  });
  const removed = arrows.map(() => false);
  for (let left = arrows.length; left > 0; left--) { const id = hint3d(L, removed); if (id < 0) break; check(canExit3d(L, removed, id).ok, `level ${i} hint ${id} cannot leave`); removed[id] = true; }
  check(removed.every(Boolean), `level ${i} cannot be cleared`);
}

for (const i of levels) {
  const t0 = performance.now();
  const L = makeLevel(i);
  ms += performance.now() - t0;
  if (L.kind === '3d') { check3d(i, L); continue; }
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

console.log(`3D: ${n3d} levels; ${bent} arrows bend round an edge, ${folded} leave over a fold`);
console.log(`Arrow Away: ${levels.length - n3d} flat levels, average fill ${(100 * fillSum / (levels.length - n3d)).toFixed(1)}% (lowest ${(100 * worst).toFixed(1)}%), ${(arrowSum / (levels.length - n3d)).toFixed(1)} arrows each, ${(ms / levels.length).toFixed(1)} ms per level`);
if (fail) { console.log(`${fail} problems`); process.exit(1); }
console.log('All Arrow Away levels are valid and can be cleared.');
