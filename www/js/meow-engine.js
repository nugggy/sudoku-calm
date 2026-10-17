// Meowdoku engine. An N x N board split into N colour regions.
// Place N cats: one per row, one per column, one per region, and no two cats may touch (diagonals included).
// Pure functions so the level generator (Node) and the game (browser) share the same logic.

import { mulberry32 } from './sudoku-engine.js';

export const UNKNOWN = 0, CROSS = 1, CAT = 2;

const shuffle = (a, rng) => {
  for (let i = a.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export function neighbours8(n, i) {
  const r = (i / n) | 0, c = i % n, out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc);
  }
  return out;
}
function neighbours4(n, i) {
  const r = (i / n) | 0, c = i % n, out = [];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  return out;
}

// Groups of cells: rows, columns and regions. Used by the solver and by hints.
export function groupsOf(n, regions) {
  const rows = [], cols = [], regs = [...Array(n)].map(() => []);
  for (let r = 0; r < n; r++) rows.push([...Array(n)].map((_, c) => r * n + c));
  for (let c = 0; c < n; c++) cols.push([...Array(n)].map((_, r) => r * n + c));
  regions.forEach((g, i) => regs[g].push(i));
  return { rows, cols, regs };
}

// Counts solutions up to `limit`. Returns {count, first, second} where first/second are column-per-row arrays.
export function countSolutions(n, regions, limit = 2) {
  const colUsed = new Array(n).fill(false), regUsed = new Array(n).fill(false);
  const pos = new Array(n);
  const found = [];
  function rec(r) {
    if (r === n) { found.push(pos.slice()); return found.length >= limit; }
    for (let c = 0; c < n; c++) {
      if (colUsed[c]) continue;
      if (r > 0 && Math.abs(pos[r - 1] - c) <= 1) continue;
      const g = regions[r * n + c];
      if (regUsed[g]) continue;
      colUsed[c] = regUsed[g] = true; pos[r] = c;
      if (rec(r + 1)) return true;
      colUsed[c] = regUsed[g] = false;
    }
    return false;
  }
  rec(0);
  return { count: found.length, first: found[0], second: found[1] };
}

// ---------- Logic solver (for grading and hints) ----------
// state: array of UNKNOWN / CROSS / CAT per cell.

function blockedBy(n, regions, i) {
  // every cell a cat at i rules out
  const r = (i / n) | 0, c = i % n, g = regions[i], out = new Set();
  for (let k = 0; k < n * n; k++) {
    if (k === i) continue;
    if (((k / n) | 0) === r || k % n === c || regions[k] === g) out.add(k);
  }
  for (const k of neighbours8(n, i)) out.add(k);
  return [...out];
}

const describeGroup = (kind, idx, n) => kind === 'row' ? `row ${idx + 1}` : kind === 'column' ? `column ${idx + 1}` : 'this colour region';

// Returns the next logical step or null. Steps:
// {type:'cat', cell, tech, reason, focus:[cells]}
// {type:'cross', cells:[...], tech, reason, focus:[cells]}
export function findStep(n, regions, state, groups = groupsOf(n, regions)) {
  const all = [];
  groups.rows.forEach((g, k) => all.push({ kind: 'row', k, cells: g }));
  groups.cols.forEach((g, k) => all.push({ kind: 'column', k, cells: g }));
  groups.regs.forEach((g, k) => all.push({ kind: 'region', k, cells: g }));

  // Tech 1a: cells blocked by an existing cat but not yet crossed out.
  for (let i = 0; i < n * n; i++) {
    if (state[i] !== CAT) continue;
    const cells = blockedBy(n, regions, i).filter((k) => state[k] === UNKNOWN);
    if (cells.length) {
      return { type: 'cross', cells, tech: 1, focus: [i],
        reason: 'A cat blocks its whole row, column and colour region, plus the cells touching it. Cross those out.' };
    }
  }
  // Tech 1b: a group with only one open cell left must hold the cat.
  for (const G of all) {
    if (G.cells.some((i) => state[i] === CAT)) continue;
    const open = G.cells.filter((i) => state[i] === UNKNOWN);
    if (open.length === 1) {
      return { type: 'cat', cell: open[0], tech: 1, focus: G.cells,
        reason: `There is only one place left for a cat in ${describeGroup(G.kind, G.k, n)}.` };
    }
  }
  const rowOf = (i) => (i / n) | 0, colOf = (i) => i % n;

  // Tech 2: a region squeezed into one row/column claims that line (and the reverse).
  for (const R of groups.regs.map((cells, k) => ({ cells, k }))) {
    if (R.cells.some((i) => state[i] === CAT)) continue;
    const open = R.cells.filter((i) => state[i] === UNKNOWN);
    if (!open.length) continue;
    for (const [lineOf, lines, word] of [[rowOf, groups.rows, 'row'], [colOf, groups.cols, 'column']]) {
      const l = lineOf(open[0]);
      if (open.every((i) => lineOf(i) === l)) {
        const cells = lines[l].filter((i) => state[i] === UNKNOWN && regions[i] !== R.k);
        if (cells.length) return { type: 'cross', cells, tech: 2, focus: open,
          reason: `This colour region's cat has to be in ${word} ${l + 1}, so nothing else in that ${word} can have a cat.` };
      }
    }
  }
  for (const [lines, word] of [[groups.rows, 'row'], [groups.cols, 'column']]) {
    for (let l = 0; l < n; l++) {
      if (lines[l].some((i) => state[i] === CAT)) continue;
      const open = lines[l].filter((i) => state[i] === UNKNOWN);
      if (!open.length) continue;
      const g = regions[open[0]];
      if (open.every((i) => regions[i] === g)) {
        const cells = groups.regs[g].filter((i) => state[i] === UNKNOWN && !lines[l].includes(i));
        if (cells.length) return { type: 'cross', cells, tech: 2, focus: open,
          reason: `${word[0].toUpperCase() + word.slice(1)} ${l + 1} can only get its cat from one colour region, so the rest of that region is ruled out.` };
      }
    }
  }

  // Tech 3: k regions confined to k rows/columns (k = 2..3), and k lines confined to k regions.
  const regOpen = groups.regs.map((cells) => cells.some((i) => state[i] === CAT) ? null : cells.filter((i) => state[i] === UNKNOWN));
  for (const [lineOf, lines, word] of [[rowOf, groups.rows, 'rows'], [colOf, groups.cols, 'columns']]) {
    const lineSets = regOpen.map((o) => o && new Set(o.map(lineOf)));
    const ids = [...Array(n).keys()].filter((g) => lineSets[g] && lineSets[g].size <= 3);
    for (const k of [2, 3]) {
      for (const combo of combos(ids, k)) {
        const u = new Set();
        combo.forEach((g) => lineSets[g].forEach((l) => u.add(l)));
        if (u.size !== k) continue;
        const cells = [];
        u.forEach((l) => lines[l].forEach((i) => { if (state[i] === UNKNOWN && !combo.includes(regions[i])) cells.push(i); }));
        if (cells.length) return { type: 'cross', cells, tech: 3, focus: combo.flatMap((g) => regOpen[g]),
          reason: `These ${k} colour regions fit only inside ${k} ${word}, so their cats fill those ${word}. Everything else there is ruled out.` };
      }
    }
    // reverse: k lines whose open cells use only k regions
    const lineRegs = lines.map((cells) => cells.some((i) => state[i] === CAT) ? null : new Set(cells.filter((i) => state[i] === UNKNOWN).map((i) => regions[i])));
    const lids = [...Array(n).keys()].filter((l) => lineRegs[l] && lineRegs[l].size <= 3 && lineRegs[l].size > 0);
    for (const k of [2, 3]) {
      for (const combo of combos(lids, k)) {
        const u = new Set();
        combo.forEach((l) => lineRegs[l].forEach((g) => u.add(g)));
        if (u.size !== k) continue;
        const cells = [];
        u.forEach((g) => groups.regs[g].forEach((i) => { if (state[i] === UNKNOWN && !combo.includes(lineOf(i))) cells.push(i); }));
        if (cells.length) return { type: 'cross', cells, tech: 3, focus: combo.flatMap((l) => lines[l]),
          reason: `These ${k} ${word} can only get their cats from ${k} colour regions, so those regions have no cats anywhere else.` };
      }
    }
  }

  // Tech 4: a cat here would leave some row, column or region with nowhere to go.
  for (let i = 0; i < n * n; i++) {
    if (state[i] !== UNKNOWN) continue;
    const blocked = new Set(blockedBy(n, regions, i));
    for (const G of all) {
      if (G.cells.includes(i) || G.cells.some((k) => state[k] === CAT)) continue;
      if (G.cells.every((k) => state[k] !== UNKNOWN || blocked.has(k))) {
        return { type: 'cross', cells: [i], tech: 4, focus: G.cells,
          reason: `A cat here would block every open cell in ${describeGroup(G.kind, G.k, n)}, so this cell is ruled out.` };
      }
    }
  }
  return null;
}

function* combos(arr, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc.slice(); return; }
  for (let i = start; i < arr.length; i++) { acc.push(arr[i]); yield* combos(arr, k, i + 1, acc); acc.pop(); }
}

const TECH_WEIGHT = { 1: 1, 2: 4, 3: 9, 4: 14 };

// Solves using logic only. Returns {solved, score, hardest}.
export function gradeLevel(n, regions) {
  const groups = groupsOf(n, regions);
  const state = new Array(n * n).fill(UNKNOWN);
  let score = 0, hardest = 0, guard = 0;
  while (state.filter((s) => s === CAT).length < n && guard++ < 4000) {
    const s = findStep(n, regions, state, groups);
    if (!s) return { solved: false, score, hardest };
    score += TECH_WEIGHT[s.tech]; hardest = Math.max(hardest, s.tech);
    if (s.type === 'cat') state[s.cell] = CAT;
    else s.cells.forEach((i) => { state[i] = CROSS; });
  }
  return { solved: true, score, hardest };
}

// ---------- Generator ----------
function randomPlacement(n, rng) {
  const pos = [], used = new Array(n).fill(false);
  function rec(r) {
    if (r === n) return true;
    for (const c of shuffle([...Array(n).keys()], rng)) {
      if (used[c] || (r > 0 && Math.abs(pos[r - 1] - c) <= 1)) continue;
      used[c] = true; pos[r] = c;
      if (rec(r + 1)) return true;
      used[c] = false;
    }
    return false;
  }
  return rec(0) ? pos : null;
}

function growRegions(n, cats, rng) {
  const regions = new Array(n * n).fill(-1);
  cats.forEach((i, g) => { regions[i] = g; });
  // Each region grows at its own random speed, so sizes vary like in the real game.
  const weight = cats.map(() => 0.3 + rng() * 1.7);
  let left = n * n - n;
  while (left > 0) {
    const frontier = [];
    for (let i = 0; i < n * n; i++) {
      if (regions[i] !== -1) continue;
      for (const k of neighbours4(n, i)) if (regions[k] !== -1) frontier.push([i, regions[k]]);
    }
    let total = 0;
    for (const [, g] of frontier) total += weight[g];
    let pick = rng() * total, chosen = frontier[0];
    for (const f of frontier) { pick -= weight[f[1]]; if (pick <= 0) { chosen = f; break; } }
    regions[chosen[0]] = chosen[1];
    left--;
  }
  return regions;
}

function regionConnectedWithout(n, regions, g, removed) {
  const cells = [];
  for (let i = 0; i < n * n; i++) if (regions[i] === g && i !== removed) cells.push(i);
  if (!cells.length) return false;
  const seen = new Set([cells[0]]), stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop();
    for (const k of neighbours4(n, i)) if (k !== removed && regions[k] === g && !seen.has(k)) { seen.add(k); stack.push(k); }
  }
  return seen.size === cells.length;
}

// Builds one level with a unique solution that logic alone can solve.
export function generateLevel(n, seed) {
  const rng = mulberry32(seed);
  for (let attempt = 0; attempt < 400; attempt++) {
    const pos = randomPlacement(n, rng);
    const cats = pos.map((c, r) => r * n + c);
    const catSet = new Set(cats);
    const regions = growRegions(n, cats, rng);
    let res = countSolutions(n, regions, 2);
    for (let fix = 0; fix < 300 && res.count > 1; fix++) {
      // pick a cell used by the other solution but not ours, and hand it to a neighbouring region
      const alt = (res.first.join() === pos.join() ? res.second : res.first);
      const diffRows = shuffle([...Array(n).keys()].filter((r) => alt[r] !== pos[r]), rng);
      let moved = false;
      for (const r of diffRows) {
        const i = r * n + alt[r];
        if (catSet.has(i)) continue;
        const from = regions[i];
        const options = shuffle(neighbours4(n, i).map((k) => regions[k]).filter((g) => g !== from), rng);
        if (!options.length || !regionConnectedWithout(n, regions, from, i)) continue;
        regions[i] = options[0];
        moved = true;
        break;
      }
      if (!moved) break;
      res = countSolutions(n, regions, 2);
    }
    if (res.count !== 1) continue;
    const g = gradeLevel(n, regions);
    if (!g.solved) continue;
    return { n, regions, solution: pos, score: g.score, hardest: g.hardest };
  }
  return null;
}

// Compact level format: size + region letters, e.g. "5:aabbbacc..."
export const encodeLevel = (lv) => `${lv.n}:${lv.regions.map((g) => String.fromCharCode(97 + g)).join('')}`;
export function decodeLevel(s) {
  const [n, r] = s.split(':');
  const size = +n;
  const regions = [...r].map((ch) => ch.charCodeAt(0) - 97);
  const { first } = countSolutions(size, regions, 1);
  return { n: size, regions, solution: first };
}

// Rule check for the player's board. Returns a Set of cat cells that break a rule.
export function conflicts(n, regions, state) {
  const cats = [];
  state.forEach((s, i) => { if (s === CAT) cats.push(i); });
  const bad = new Set();
  for (let a = 0; a < cats.length; a++) for (let b = a + 1; b < cats.length; b++) {
    const i = cats[a], j = cats[b];
    const ri = (i / n) | 0, ci = i % n, rj = (j / n) | 0, cj = j % n;
    if (ri === rj || ci === cj || regions[i] === regions[j] || (Math.abs(ri - rj) <= 1 && Math.abs(ci - cj) <= 1)) { bad.add(i); bad.add(j); }
  }
  return bad;
}

// Hint for the player: mistakes first, then the next logical step, then a reveal.
export function findHint(level, state) {
  const { n, regions, solution } = level;
  const isSol = (i) => solution[(i / n) | 0] === i % n;
  const wrongCats = state.map((s, i) => s === CAT && !isSol(i) ? i : -1).filter((i) => i >= 0);
  if (wrongCats.length) return { kind: 'mistake', cells: wrongCats, message: 'This cat is in the wrong spot. Tap it to remove it.' };
  const badCross = state.map((s, i) => s === CROSS && isSol(i) ? i : -1).filter((i) => i >= 0);
  if (badCross.length) return { kind: 'mistake', cells: badCross.slice(0, 1), message: 'This cell was crossed out by mistake. A cat belongs here.' };
  const step = findStep(n, regions, state);
  if (step) return { kind: step.type, cells: step.type === 'cat' ? [step.cell] : step.cells, focus: step.focus, message: step.reason };
  const r = solution.findIndex((c, r2) => state[r2 * n + c] !== CAT);
  return { kind: 'cat', cells: [r * n + solution[r]], message: 'Here is a cat to get you going.' };
}
