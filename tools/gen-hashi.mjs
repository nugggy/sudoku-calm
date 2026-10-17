// Builds www/levels/hashi.json: Island Hop (Hashiwokakero) puzzles that each have exactly one solution,
// can be solved by reasoning (no deep guessing), and get harder from level to level.
// Usage: node tools/gen-hashi.mjs
import { writeFileSync } from 'node:fs';
import { mulberry32 } from '../www/js/sudoku-engine.js';
import { buildBoard, countSolutions, logicSolve, packGrid } from '../www/js/hashi-engine.js';

// [board size, levels] from small to large. 12 x 12 is the largest that keeps cells over 30 px on a phone.
const BANDS = [[7, 40], [8, 50], [9, 60], [10, 60], [11, 60], [12, 50]];
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];

// Grow a connected set of islands and bridges, then read the island numbers off the bridges.
function grow(N, target, rng) {
  const occ = new Uint8Array(N * N); // 0 water, 1 island, 2 bridge
  const isl = [], bridges = new Map(); // "a,b" (cell indexes, a < b) -> count
  const put = (k) => { occ[k] = 1; isl.push(k); };
  put(Math.floor(N / 4 + rng() * N / 2) * N + Math.floor(N / 4 + rng() * N / 2));
  const freeAround = (r, c) => DIRS.every(([dr, dc]) => { const rr = r + dr, cc = c + dc; return rr < 0 || cc < 0 || rr >= N || cc >= N || occ[rr * N + cc] !== 1; });
  for (let t = 0; t < 4000 && isl.length < target; t++) {
    const from = isl[(rng() * isl.length) | 0], [dr, dc] = DIRS[(rng() * 4) | 0];
    const r0 = Math.floor(from / N), c0 = from % N, opts = [];
    for (let d = 1; ; d++) {
      const r = r0 + dr * d, c = c0 + dc * d;
      if (r < 0 || c < 0 || r >= N || c >= N || occ[r * N + c]) break;
      if (d >= 2 && freeAround(r, c)) opts.push(d);
    }
    if (!opts.length) continue;
    // short hops are more common, the odd long one keeps the layout interesting
    const d = opts[Math.floor(Math.pow(rng(), 1.6) * Math.min(opts.length, Math.ceil(N * 0.6)))];
    const k = (r0 + dr * d) * N + c0 + dc * d;
    for (let s = 1; s < d; s++) occ[(r0 + dr * s) * N + c0 + dc * s] = 2;
    put(k);
    bridges.set(Math.min(from, k) + ',' + Math.max(from, k), rng() < 0.38 ? 2 : 1);
  }
  // extra bridges between neighbours make loops, which is where the harder reasoning comes from
  const g = [...Array(N * N)].map((_, k) => (occ[k] === 1 ? '1' : '.')).join('');
  const B = buildBoard(N, N, g);
  const cellOf = (a) => B.islands[a].r * N + B.islands[a].c;
  const key = (e) => { const x = cellOf(e.a), y = cellOf(e.b); return Math.min(x, y) + ',' + Math.max(x, y); };
  for (const e of B.edges) {
    if (bridges.has(key(e)) || rng() > 0.45) continue;
    if (e.cells.some((k) => occ[k])) continue;
    e.cells.forEach((k) => (occ[k] = 2));
    bridges.set(key(e), rng() < 0.35 ? 2 : 1);
  }
  const sol = B.edges.map((e) => bridges.get(key(e)) || 0);
  const nums = B.islands.map((_, a) => B.islands[a].edges.reduce((s, ei) => s + sol[ei], 0));
  const grid = [...g]; B.islands.forEach((it, a) => (grid[it.r * N + it.c] = String(nums[a])));
  return { grid: grid.join(''), sol, count: isl.length };
}

function makeCandidate(N, rng) {
  const target = Math.round(N * N * (0.15 + rng() * 0.2));
  const { grid, sol, count } = grow(N, target, rng);
  if (count < Math.max(6, target * 0.75)) return null;
  const B = buildBoard(N, N, grid);
  const L = logicSolve(B, 60);
  if (!L.solved) return null;
  const { count: n, solution } = countSolutions(B, 2);
  if (n !== 1 || solution.join('') !== sol.join('') || L.solution.join('') !== sol.join('')) return null;
  // difficulty: more islands, connection deductions and trials all add up
  const score = count + L.t1 + L.t2 * 4 + L.t3 * 6;
  return { w: N, h: N, g: packGrid(grid), s: sol.join(''), score, t1: L.t1, t2: L.t2, t3: L.t3, islands: count };
}

// tier for the level label: trials make it hard, lots of general-rule steps make it medium
const tier = (p) => (p.t3 >= 3 ? 4 : p.t3 + p.t2 >= 1 ? 3 : p.t1 >= p.islands * 0.4 ? 2 : 1);

const puzzles = [], seen = new Set();
BANDS.forEach(([N, want], b) => {
  const rng = mulberry32(4242 + N * 977);
  const pool = [];
  for (let t = 0; pool.length < want * 12 && t < want * 2000; t++) {
    const c = makeCandidate(N, rng);
    if (c && !seen.has(c.g)) { seen.add(c.g); pool.push(c); }
  }
  if (pool.length < want) throw new Error(`only ${pool.length} puzzles for ${N}x${N}`);
  pool.sort((x, y) => x.score - y.score);
  // each band covers a window of its own difficulty range, sliding harder as boards grow
  const lo = 0.04 * b, hi = Math.min(1, 0.55 + 0.09 * b);
  const start = puzzles.length;
  let prev = -1;
  for (let i = 0; i < want; i++) {
    const q = lo + (hi - lo) * (i / (want - 1));
    // strictly increasing picks, so no puzzle repeats
    prev = Math.min(pool.length - (want - i), Math.max(prev + 1, Math.round(q * (pool.length - 1))));
    puzzles.push(pool[prev]);
  }
  // within a board size, easier tiers come first so the label never steps back
  puzzles.splice(start, want, ...puzzles.slice(start).sort((x, y) => tier(x) - tier(y) || x.score - y.score));
  console.log(`${N}x${N}: ${want} levels from ${pool.length} candidates, scores ${Math.min(...puzzles.slice(start).map((p) => p.score))}-${Math.max(...puzzles.slice(start).map((p) => p.score))}`);
});

const out = puzzles.map((p) => ({ w: p.w, h: p.h, g: p.g, s: p.s, d: tier(p) }));
writeFileSync('www/levels/hashi.json', JSON.stringify({ version: 1, puzzles: out }));
const tiers = [1, 2, 3, 4].map((d) => out.filter((p) => p.d === d).length);
console.log('wrote', out.length, 'puzzles; tiers easy/medium/hard/expert:', tiers.join('/'));
