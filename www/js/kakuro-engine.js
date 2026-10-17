// Kakuro engine: runs, a solution counter (for building unique puzzles) and digit combinations.
// A puzzle is {w, h, cells: string} where '#' is a block and '.' a white square, plus the solution digits.

export function runsOf(w, h, isWhite) {
  const runs = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w;) {
    if (!isWhite(r, c)) { c++; continue; }
    const start = c; while (c < w && isWhite(r, c)) c++;
    runs.push({ dir: 'across', cells: [...Array(c - start)].map((_, k) => r * w + start + k), clueAt: r * w + start - 1 });
  }
  for (let c = 0; c < w; c++) for (let r = 0; r < h;) {
    if (!isWhite(r, c)) { r++; continue; }
    const start = r; while (r < h && isWhite(r, c)) r++;
    runs.push({ dir: 'down', cells: [...Array(r - start)].map((_, k) => (start + k) * w + c), clueAt: (start - 1) * w + c });
  }
  return runs;
}

const popcount = (m) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
// Smallest / largest possible sum of `n` distinct digits from mask `free`.
function bounds(free, n) {
  const ds = []; for (let d = 1; d <= 9; d++) if (free & (1 << d)) ds.push(d);
  if (ds.length < n) return null;
  let lo = 0, hi = 0; for (let i = 0; i < n; i++) { lo += ds[i]; hi += ds[ds.length - 1 - i]; }
  return [lo, hi];
}

// Counts solutions (up to `limit`) given run sums. `fixed` optionally pins digits.
export function countSolutions(w, h, runs, sums, limit = 2) {
  const cellRuns = new Map();
  runs.forEach((run, ri) => run.cells.forEach((i) => { if (!cellRuns.has(i)) cellRuns.set(i, []); cellRuns.get(i).push(ri); }));
  const cells = [...cellRuns.keys()];
  const val = new Map();
  const used = runs.map(() => 0), sum = runs.map(() => 0), filled = runs.map(() => 0);
  let count = 0;
  function candidates(i) {
    let out = [];
    for (let d = 1; d <= 9; d++) {
      let ok = true;
      for (const ri of cellRuns.get(i)) {
        const run = runs[ri];
        if (used[ri] & (1 << d)) { ok = false; break; }
        const rem = run.cells.length - filled[ri] - 1, left = sums[ri] - sum[ri] - d;
        if (rem === 0) { if (left !== 0) { ok = false; break; } continue; }
        const b = bounds(0x3fe & ~used[ri] & ~(1 << d), rem);
        if (!b || left < b[0] || left > b[1]) { ok = false; break; }
      }
      if (ok) out.push(d);
    }
    return out;
  }
  function rec(depth) {
    if (depth === cells.length) { count++; return count >= limit; }
    // most constrained cell first
    let best = null, bestC = null;
    for (const i of cells) { if (val.has(i)) continue; const c = candidates(i); if (!best || c.length < bestC.length) { best = i; bestC = c; if (c.length <= 1) break; } }
    if (!bestC.length) return false;
    for (const d of bestC) {
      val.set(best, d);
      for (const ri of cellRuns.get(best)) { used[ri] |= 1 << d; sum[ri] += d; filled[ri]++; }
      if (rec(depth + 1)) return true;
      for (const ri of cellRuns.get(best)) { used[ri] &= ~(1 << d); sum[ri] -= d; filled[ri]--; }
      val.delete(best);
    }
    return false;
  }
  rec(0);
  return count;
}

// All sets of `n` distinct digits adding up to `total`, e.g. combos(16, 2) -> [[7, 9]].
export function combos(total, n, from = 1, acc = [], out = []) {
  if (acc.length === n) { if (acc.reduce((a, b) => a + b, 0) === total) out.push(acc.slice()); return out; }
  for (let d = from; d <= 9; d++) { acc.push(d); combos(total, n, d + 1, acc, out); acc.pop(); }
  return out;
}

export { popcount };
