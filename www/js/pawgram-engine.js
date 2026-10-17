// Pawgram (nonogram) engine: clues, line-by-line logic solving, and hints.
// Cell values: -1 unknown, 0 empty (crossed), 1 filled. Pure functions, shared with the level builder.

export function cluesOf(line) {
  const out = [];
  let run = 0;
  for (const v of line) {
    if (v === 1) run++;
    else if (run) { out.push(run); run = 0; }
  }
  if (run) out.push(run);
  return out.length ? out : [0];
}

export function puzzleClues(n, cells) {
  const g = typeof cells === 'string' ? [...cells].map(Number) : cells;
  const rows = [], cols = [];
  for (let r = 0; r < n; r++) rows.push(cluesOf(g.slice(r * n, r * n + n)));
  for (let c = 0; c < n; c++) cols.push(cluesOf([...Array(n)].map((_, r) => g[r * n + c])));
  return { rows, cols };
}

// For one line with some cells known, works out which cells must be filled or empty in every
// arrangement that fits the clue. Returns the improved line, or null if nothing fits.
export function solveLine(line, clue) {
  const n = line.length;
  const blocks = clue.length === 1 && clue[0] === 0 ? [] : clue;
  const k = blocks.length;
  const fits = (i, len) => {
    if (i + len > n) return false;
    for (let j = i; j < i + len; j++) if (line[j] === 0) return false;
    return true;
  };
  // ok[b][i]: blocks b.. can be placed in cells i..n-1 (cell i is free to use)
  const ok = [...Array(k + 1)].map(() => new Array(n + 1).fill(false));
  ok[k][n] = true;
  for (let i = n - 1; i >= 0; i--) ok[k][i] = line[i] !== 1 && ok[k][i + 1];
  for (let b = k - 1; b >= 0; b--) {
    for (let i = n - 1; i >= 0; i--) {
      const len = blocks[b], end = i + len;
      const skip = line[i] !== 1 && ok[b][i + 1];
      const place = fits(i, len) && (end === n ? b === k - 1 : line[end] !== 1 && ok[b + 1][end + 1]);
      ok[b][i] = skip || place;
    }
  }
  if (!ok[0][0]) return null;
  const canFill = new Array(n).fill(false), canEmpty = new Array(n).fill(false);
  const reach = [...Array(k + 1)].map(() => new Array(n + 1).fill(false));
  reach[0][0] = true;
  for (let i = 0; i < n; i++) {
    for (let b = 0; b <= k; b++) {
      if (!reach[b][i] || !ok[b][i]) continue;
      if (line[i] !== 1 && ok[b][i + 1]) { canEmpty[i] = true; reach[b][i + 1] = true; }
      if (b < k) {
        const len = blocks[b], end = i + len;
        if (fits(i, len) && (end === n ? b === k - 1 : line[end] !== 1 && ok[b + 1][end + 1])) {
          for (let j = i; j < end; j++) canFill[j] = true;
          if (end < n) { canEmpty[end] = true; reach[b + 1][end + 1] = true; }
        }
      }
    }
  }
  const out = line.slice();
  for (let i = 0; i < n; i++) {
    if (canFill[i] && !canEmpty[i]) out[i] = 1;
    else if (!canFill[i] && canEmpty[i]) out[i] = 0;
    else if (!canFill[i] && !canEmpty[i]) return null;
  }
  return out;
}

// Line-by-line solve. Returns {solved, grid, steps} where steps counts line improvements (difficulty).
export function solve(n, clues, start = null) {
  const g = start ? start.slice() : new Array(n * n).fill(-1);
  let steps = 0, changed = true;
  const row = (r) => g.slice(r * n, r * n + n);
  const col = (c) => [...Array(n)].map((_, r) => g[r * n + c]);
  while (changed) {
    changed = false;
    for (let r = 0; r < n; r++) {
      const before = row(r), after = solveLine(before, clues.rows[r]);
      if (!after) return { solved: false, grid: g, steps, contradiction: true };
      if (after.some((v, i) => v !== before[i])) { after.forEach((v, i) => { g[r * n + i] = v; }); changed = true; steps++; }
    }
    for (let c = 0; c < n; c++) {
      const before = col(c), after = solveLine(before, clues.cols[c]);
      if (!after) return { solved: false, grid: g, steps, contradiction: true };
      if (after.some((v, i) => v !== before[i])) { after.forEach((v, i) => { g[i * n + c] = v; }); changed = true; steps++; }
    }
  }
  return { solved: !g.includes(-1), grid: g, steps };
}

// Hint: the first line where logic finds something new, from the player's (always correct) marks.
// Returns {line:'row'|'column', index, cells:[{i, v}]} or null.
export function findHint(n, clues, state) {
  const g = state.map((v) => (v === 1 ? 1 : v === 0 ? 0 : -1));
  for (let r = 0; r < n; r++) {
    const before = g.slice(r * n, r * n + n), after = solveLine(before, clues.rows[r]);
    const cells = after ? after.map((v, i) => (v !== before[i] ? { i: r * n + i, v } : null)).filter(Boolean) : [];
    if (cells.length) return { line: 'row', index: r, cells };
  }
  for (let c = 0; c < n; c++) {
    const before = [...Array(n)].map((_, r) => g[r * n + c]), after = solveLine(before, clues.cols[c]);
    const cells = after ? after.map((v, r) => (v !== before[r] ? { i: r * n + c, v } : null)).filter(Boolean) : [];
    if (cells.length) return { line: 'column', index: c, cells };
  }
  return null;
}
