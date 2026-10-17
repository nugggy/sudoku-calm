// Sudoku engine: solving, generating, grading and hint finding.
// Pure functions with no DOM access, so it runs in a worker and in Node tests.

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert', 'master', 'extreme'];

export const DIFFICULTY_LABELS = {
  easy: 'Easy', medium: 'Medium', hard: 'Hard',
  expert: 'Expert', master: 'Master', extreme: 'Extreme',
};

// Technique levels used by the grader. Higher is harder.
export const T = {
  NAKED_SINGLE: 1, HIDDEN_SINGLE: 2, LOCKED: 3, PAIR: 4, TRIPLE: 5, XWING: 6, GUESS: 7,
};

// How each difficulty is built: target clue count and the allowed hardest technique.
const BANDS = {
  easy:    { clues: [38, 42], minT: 1, maxT: 2 },
  medium:  { clues: [32, 35], minT: 2, maxT: 2 },
  hard:    { clues: [28, 31], minT: 3, maxT: 4 },
  expert:  { clues: [26, 28], minT: 5, maxT: 7 },
  master:  { clues: [24, 25], minT: 7, maxT: 7 },
  extreme: { clues: [20, 22], minT: 7, maxT: 7, slack: 3 },
};

// ---------- Geometry ----------
export const ROW = (i) => (i / 9) | 0;
export const COL = (i) => i % 9;
export const BOX = (i) => ((ROW(i) / 3) | 0) * 3 + ((COL(i) / 3) | 0);

export const UNITS = [];      // 27 units: 9 rows, 9 cols, 9 boxes
export const UNIT_KIND = [];  // 'row' | 'column' | 'box'
for (let r = 0; r < 9; r++) { UNITS.push([...Array(9)].map((_, c) => r * 9 + c)); UNIT_KIND.push('row'); }
for (let c = 0; c < 9; c++) { UNITS.push([...Array(9)].map((_, r) => r * 9 + c)); UNIT_KIND.push('column'); }
for (let b = 0; b < 9; b++) {
  const br = ((b / 3) | 0) * 3, bc = (b % 3) * 3, u = [];
  for (let k = 0; k < 9; k++) u.push((br + ((k / 3) | 0)) * 9 + bc + (k % 3));
  UNITS.push(u); UNIT_KIND.push('box');
}
export const PEERS = [...Array(81)].map((_, i) => {
  const s = new Set();
  for (let j = 0; j < 81; j++) if (j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))) s.add(j);
  return [...s];
});
const CELL_UNITS = [...Array(81)].map((_, i) => [ROW(i), 9 + COL(i), 18 + BOX(i)]);

const popcount = (m) => { let c = 0; while (m) { m &= m - 1; c++; } return c; };
const bitToDigit = (b) => 31 - Math.clz32(b); // bit (1<<d) -> d
const ALL = 0b1111111110; // bits 1..9

// ---------- Random ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- Backtracking solver (bitmask, minimum remaining values) ----------
// Returns number of solutions found, up to `limit`. Writes first solution to `out` if given.
export function countSolutions(board, limit = 2, out = null, rng = null) {
  const g = board.slice();
  const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = g[i];
    if (v) {
      const b = 1 << v;
      if ((rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]) & b) return 0;
      rows[ROW(i)] |= b; cols[COL(i)] |= b; boxes[BOX(i)] |= b;
    }
  }
  let count = 0;
  const empties = [];
  for (let i = 0; i < 81; i++) if (!g[i]) empties.push(i);

  function rec(depth) {
    if (depth === empties.length) {
      if (count === 0 && out) for (let i = 0; i < 81; i++) out[i] = g[i];
      count++;
      return count >= limit;
    }
    // choose empty cell with fewest candidates
    let best = -1, bestMask = 0, bestN = 10, bestK = -1;
    for (let k = depth; k < empties.length; k++) {
      const i = empties[k];
      const m = ALL & ~(rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]);
      const n = popcount(m);
      if (n < bestN) { bestN = n; best = i; bestMask = m; bestK = k; if (n <= 1) break; }
    }
    if (bestN === 0) return false;
    [empties[depth], empties[bestK]] = [empties[bestK], empties[depth]];
    let digits = [];
    for (let d = 1; d <= 9; d++) if (bestMask & (1 << d)) digits.push(d);
    if (rng) shuffle(digits, rng);
    const r = ROW(best), c = COL(best), bx = BOX(best);
    for (const d of digits) {
      const b = 1 << d;
      g[best] = d; rows[r] |= b; cols[c] |= b; boxes[bx] |= b;
      if (rec(depth + 1)) return true;
      rows[r] &= ~b; cols[c] &= ~b; boxes[bx] &= ~b; g[best] = 0;
    }
    [empties[depth], empties[bestK]] = [empties[bestK], empties[depth]];
    return false;
  }
  rec(0);
  return count;
}

export function solve(board) {
  const out = new Array(81).fill(0);
  return countSolutions(board, 1, out) ? out : null;
}

export function generateSolved(rng) {
  const out = new Array(81).fill(0);
  countSolutions(new Array(81).fill(0), 1, out, rng);
  return out;
}

// ---------- Human-style solver ----------
// Works on a candidate grid. Each step returns a description usable for hints.

export function candidatesFor(board) {
  const cand = new Array(81).fill(0);
  for (let i = 0; i < 81; i++) {
    if (board[i]) continue;
    let m = ALL;
    for (const p of PEERS[i]) if (board[p]) m &= ~(1 << board[p]);
    cand[i] = m;
  }
  return cand;
}

function place(board, cand, i, d) {
  board[i] = d; cand[i] = 0;
  const b = ~(1 << d);
  for (const p of PEERS[i]) cand[p] &= b;
}

// Finds one logical step. Returns null if none of the known techniques apply.
// Placement steps: {type:'place', cell, digit, tech, unit}
// Elimination steps: {type:'elim', elims:[[cell,digit],...], tech, cells, unit}
export function findStep(board, cand, maxTech = T.XWING) {
  // Naked single
  for (let i = 0; i < 81; i++) {
    if (!board[i] && cand[i] && popcount(cand[i]) === 1) {
      return { type: 'place', cell: i, digit: bitToDigit(cand[i]), tech: T.NAKED_SINGLE };
    }
  }
  // Hidden single (boxes first, as people usually scan boxes)
  const order = [18, 19, 20, 21, 22, 23, 24, 25, 26, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
  for (const u of order) {
    for (let d = 1; d <= 9; d++) {
      const b = 1 << d;
      let spot = -1, n = 0;
      for (const i of UNITS[u]) {
        if (board[i] === d) { n = -1; break; }
        if (!board[i] && (cand[i] & b)) { spot = i; n++; }
      }
      if (n === 1) return { type: 'place', cell: spot, digit: d, tech: T.HIDDEN_SINGLE, unit: u };
    }
  }
  if (maxTech < T.LOCKED) return null;

  // Locked candidates: pointing (box -> line) and claiming (line -> box)
  for (let u = 0; u < 27; u++) {
    for (let d = 1; d <= 9; d++) {
      const b = 1 << d;
      const spots = UNITS[u].filter((i) => !board[i] && (cand[i] & b));
      if (spots.length < 2) continue;
      const targets = [];
      if (u >= 18) {
        const r = ROW(spots[0]), c = COL(spots[0]);
        if (spots.every((i) => ROW(i) === r)) targets.push(r);
        if (spots.every((i) => COL(i) === c)) targets.push(9 + c);
      } else {
        const bx = BOX(spots[0]);
        if (spots.every((i) => BOX(i) === bx)) targets.push(18 + bx);
      }
      for (const t of targets) {
        const elims = UNITS[t].filter((i) => !spots.includes(i) && !board[i] && (cand[i] & b)).map((i) => [i, d]);
        if (elims.length) return { type: 'elim', elims, tech: T.LOCKED, cells: spots, unit: u, digit: d };
      }
    }
  }
  if (maxTech < T.PAIR) return null;

  // Naked pairs / hidden pairs
  for (let u = 0; u < 27; u++) {
    const cells = UNITS[u].filter((i) => !board[i]);
    for (let a = 0; a < cells.length; a++) {
      if (popcount(cand[cells[a]]) !== 2) continue;
      for (let c = a + 1; c < cells.length; c++) {
        if (cand[cells[c]] !== cand[cells[a]]) continue;
        const m = cand[cells[a]];
        const elims = [];
        for (const i of cells) if (i !== cells[a] && i !== cells[c] && (cand[i] & m)) {
          for (let d = 1; d <= 9; d++) if (cand[i] & m & (1 << d)) elims.push([i, d]);
        }
        if (elims.length) return { type: 'elim', elims, tech: T.PAIR, cells: [cells[a], cells[c]], unit: u };
      }
    }
    // hidden pair
    const where = {};
    for (let d = 1; d <= 9; d++) {
      const s = cells.filter((i) => cand[i] & (1 << d));
      if (s.length === 2) where[d] = s;
    }
    const ds = Object.keys(where).map(Number);
    for (let x = 0; x < ds.length; x++) for (let y = x + 1; y < ds.length; y++) {
      const [p, q] = where[ds[x]];
      const [p2, q2] = where[ds[y]];
      if (p === p2 && q === q2) {
        const keep = (1 << ds[x]) | (1 << ds[y]);
        const elims = [];
        for (const i of [p, q]) for (let d = 1; d <= 9; d++) if ((cand[i] & (1 << d)) && !(keep & (1 << d))) elims.push([i, d]);
        if (elims.length) return { type: 'elim', elims, tech: T.PAIR, cells: [p, q], unit: u };
      }
    }
  }
  if (maxTech < T.TRIPLE) return null;

  // Naked triples
  for (let u = 0; u < 27; u++) {
    const cells = UNITS[u].filter((i) => !board[i] && popcount(cand[i]) <= 3);
    for (let a = 0; a < cells.length; a++) for (let b2 = a + 1; b2 < cells.length; b2++) for (let c = b2 + 1; c < cells.length; c++) {
      const m = cand[cells[a]] | cand[cells[b2]] | cand[cells[c]];
      if (popcount(m) !== 3) continue;
      const trio = [cells[a], cells[b2], cells[c]];
      const elims = [];
      for (const i of UNITS[u]) if (!board[i] && !trio.includes(i) && (cand[i] & m)) {
        for (let d = 1; d <= 9; d++) if (cand[i] & m & (1 << d)) elims.push([i, d]);
      }
      if (elims.length) return { type: 'elim', elims, tech: T.TRIPLE, cells: trio, unit: u };
    }
  }
  if (maxTech < T.XWING) return null;

  // X-Wing (rows and columns)
  for (let d = 1; d <= 9; d++) {
    const b = 1 << d;
    for (const base of [0, 9]) {
      const lines = [];
      for (let k = 0; k < 9; k++) {
        const pos = UNITS[base + k].filter((i) => !board[i] && (cand[i] & b));
        if (pos.length === 2) lines.push({ k, pos });
      }
      for (let x = 0; x < lines.length; x++) for (let y = x + 1; y < lines.length; y++) {
        const A = lines[x].pos, B = lines[y].pos;
        const key = base === 0 ? COL : ROW;
        if (key(A[0]) !== key(B[0]) || key(A[1]) !== key(B[1])) continue;
        const cover = base === 0 ? [9 + COL(A[0]), 9 + COL(A[1])] : [ROW(A[0]), ROW(A[1])];
        const corners = [...A, ...B];
        const elims = [];
        for (const cu of cover) for (const i of UNITS[cu]) if (!corners.includes(i) && !board[i] && (cand[i] & b)) elims.push([i, d]);
        if (elims.length) return { type: 'elim', elims, tech: T.XWING, cells: corners, digit: d };
      }
    }
  }
  return null;
}

// Grades a puzzle: returns the hardest technique needed (T.GUESS if logic alone fails).
export function grade(puzzle) {
  const board = puzzle.slice();
  const cand = candidatesFor(board);
  let hardest = 0, steps = 0;
  while (board.includes(0)) {
    const s = findStep(board, cand);
    if (!s) return { tech: T.GUESS, steps };
    hardest = Math.max(hardest, s.tech);
    steps++;
    if (s.type === 'place') place(board, cand, s.cell, s.digit);
    else for (const [i, d] of s.elims) cand[i] &= ~(1 << d);
  }
  return { tech: hardest, steps };
}

// ---------- Generator ----------
function carve(solution, targetClues, rng, symmetric) {
  const puzzle = solution.slice();
  const order = shuffle([...Array(81).keys()], rng);
  let clues = 81;
  for (const i of order) {
    if (clues <= targetClues) break;
    if (!puzzle[i]) continue;
    const j = 80 - i;
    const pair = symmetric && j !== i && puzzle[j] ? [i, j] : [i];
    const saved = pair.map((k) => puzzle[k]);
    for (const k of pair) puzzle[k] = 0;
    if (countSolutions(puzzle, 2) === 1) clues -= pair.length;
    else pair.forEach((k, n) => { puzzle[k] = saved[n]; });
  }
  return { puzzle, clues };
}

// Generates a puzzle at the given difficulty. `seed` makes it deterministic (daily challenges).
export function generate(difficulty, seed = (Math.random() * 2 ** 32) >>> 0) {
  const band = BANDS[difficulty] || BANDS.easy;
  const rng = mulberry32(seed);
  let best = null, bestScore = Infinity;
  const tries = difficulty === 'easy' || difficulty === 'medium' ? 30 : 120;
  for (let t = 0; t < tries; t++) {
    const solution = generateSolved(rng);
    const target = band.clues[0] + ((rng() * (band.clues[1] - band.clues[0] + 1)) | 0);
    const symmetric = difficulty !== 'extreme' && difficulty !== 'master';
    const { puzzle, clues } = carve(solution, target, rng, symmetric);
    const g = grade(puzzle);
    const techOk = g.tech >= band.minT && g.tech <= band.maxT;
    const clueOk = clues <= band.clues[1] + (band.slack || 1);
    const score = (techOk ? 0 : 10 * Math.min(Math.abs(g.tech - band.minT), Math.abs(g.tech - band.maxT)))
      + (clueOk ? 0 : clues - band.clues[1]);
    if (score < bestScore) { bestScore = score; best = { puzzle, solution, clues, tech: g.tech }; }
    if (score === 0) break;
  }
  return { ...best, difficulty, seed };
}

// ---------- Hints for the game screen ----------
// `board` holds givens and the player's entries. `solution` is the answer.
// Returns {kind, cell, digit, message, unitCells}.
export function findHint(board, solution, selected = -1) {
  for (let i = 0; i < 81; i++) {
    if (board[i] && board[i] !== solution[i]) {
      return { kind: 'mistake', cell: i, digit: solution[i], message: 'This number is not correct. Try removing it.' };
    }
  }
  const b = board.slice();
  const cand = candidatesFor(b);
  // Keep applying eliminations until a placement appears, so the hint is always a number.
  for (let guard = 0; guard < 200; guard++) {
    const s = findStep(b, cand);
    if (!s) break;
    if (s.type === 'place') {
      const unitCells = s.unit != null ? UNITS[s.unit] : PEERS[s.cell].concat(s.cell);
      let message;
      if (s.tech === T.NAKED_SINGLE) {
        message = `Every other number already appears in this cell's row, column or box, so it must be ${s.digit}.`;
      } else {
        message = `Look at this ${UNIT_KIND[s.unit]}. ${s.digit} can only go in one cell.`;
      }
      if (guard > 0) message += ' (Some notes were ruled out first using advanced logic.)';
      return { kind: 'logic', cell: s.cell, digit: s.digit, message, unitCells };
    }
    for (const [i, d] of s.elims) cand[i] &= ~(1 << d);
  }
  const cell = selected >= 0 && !board[selected] ? selected : board.findIndex((v) => !v);
  return { kind: 'reveal', cell, digit: solution[cell], message: 'This one needs advanced logic. Here is the answer for this cell.' };
}

// Serialise boards to compact strings for storage.
export const toStr = (b) => b.join('');
export const fromStr = (s) => s.split('').map(Number);
