// Gridlock engine: 6x6 Rush Hour boards, move generation and a breadth-first solver.
// Boards are 36-character strings read row by row: 'o' is empty, 'x' a wall, 'A' the red car
// (always across on row 3, exiting on the right), other letters are the other vehicles.
export const N = 6, EXIT_ROW = 2;
export const LETTERS = 'BCDEFGHIJKLMNPQRSTUVWYZ'; // no O or X, so boards stay easy to read

// -> { vs: [{id, h, len, line}], pos: [] } where line is the fixed row (across) or column (down)
// and pos the moving coordinate. The red car is always vs[0].
export function parse(board) {
  const seen = new Map(), walls = [];
  for (let i = 0; i < 36; i++) {
    const ch = board[i];
    if (ch === 'o' || ch === '.') continue;
    if (ch === 'x') { walls.push(i); continue; }
    if (!seen.has(ch)) seen.set(ch, []);
    seen.get(ch).push(i);
  }
  const vs = [], pos = [];
  for (const [id, cells] of seen) {
    const h = cells[1] - cells[0] === 1;
    const r = Math.floor(cells[0] / N), c = cells[0] % N;
    vs.push({ id, h, len: cells.length, line: h ? r : c });
    pos.push(h ? c : r);
  }
  const a = vs.findIndex((v) => v.id === 'A');
  if (a > 0) { [vs[0], vs[a]] = [vs[a], vs[0]]; [pos[0], pos[a]] = [pos[a], pos[0]]; }
  return { vs, pos, walls };
}

export const cellsOf = (v, p) => [...Array(v.len)].map((_, k) => (v.h ? v.line * N + p + k : (p + k) * N + v.line));

export function grid(vs, pos, walls = []) {
  const g = new Int8Array(36);
  for (const w of walls) g[w] = -1;
  vs.forEach((v, i) => { for (const c of cellsOf(v, pos[i])) g[c] = i + 1; });
  return g;
}

export function toBoard(vs, pos, walls = []) {
  const g = grid(vs, pos, walls);
  return [...g].map((x) => (x < 0 ? 'x' : x ? vs[x - 1].id : 'o')).join('');
}

// How far vehicle i can slide: returns [min, max] for its position.
export function range(vs, pos, i, g = grid(vs, pos)) {
  const v = vs[i], at = (k) => (v.h ? g[v.line * N + k] : g[k * N + v.line]);
  let lo = pos[i], hi = pos[i];
  while (lo > 0 && !at(lo - 1)) lo--;
  while (hi + v.len < N && !at(hi + v.len)) hi++;
  return [lo, hi];
}

// Every position reachable in one move: [[vehicle, newPos], ...]
export function moves(vs, pos, walls = []) {
  const g = grid(vs, pos, walls), out = [];
  for (let i = 0; i < vs.length; i++) {
    const [lo, hi] = range(vs, pos, i, g);
    for (let p = lo; p <= hi; p++) if (p !== pos[i]) out.push([i, p]);
  }
  return out;
}

export const isGoal = (pos) => pos[0] === N - 2;
// positions fit in base 5, so up to 22 vehicles pack into a safe integer
export const keyOf = (pos) => { let k = 0; for (let i = pos.length - 1; i >= 0; i--) k = k * 5 + pos[i]; return k; };
const unkey = (k, n) => { const p = new Array(n); for (let i = 0; i < n; i++) { p[i] = k % 5; k = Math.floor(k / 5); } return p; };

// Optimal solution as a list of [vehicle, newPos], or null. A move slides one vehicle any distance.
export function solve(vs, pos, walls = [], limit = 2e6) {
  if (isGoal(pos)) return [];
  const start = keyOf(pos), parent = new Map([[start, -1]]), via = new Map();
  let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (const k of frontier) {
      const p = unkey(k, vs.length);
      for (const [i, np] of moves(vs, p, walls)) {
        const q = p.slice(); q[i] = np;
        const nk = keyOf(q);
        if (parent.has(nk)) continue;
        parent.set(nk, k); via.set(nk, [i, np]);
        if (isGoal(q)) {
          const path = []; let c = nk;
          while (c !== start) { path.push(via.get(c)); c = parent.get(c); }
          return path.reverse();
        }
        next.push(nk);
      }
    }
    if (parent.size > limit) return null;
    frontier = next;
  }
  return null;
}

// Whole connected set of positions around pos, with each one's distance to the nearest goal
// (Infinity when no goal is reachable). Used by the level generator to find the hardest start.
export function cluster(vs, pos, walls = []) {
  const n = vs.length, adj = new Map(), order = [pos.slice()];
  const id = new Map([[keyOf(pos), 0]]);
  for (let h = 0; h < order.length; h++) {
    const p = order[h], list = [];
    for (const [i, np] of moves(vs, p, walls)) {
      const q = p.slice(); q[i] = np;
      const k = keyOf(q);
      let j = id.get(k);
      if (j === undefined) { j = order.length; id.set(k, j); order.push(q); }
      list.push(j);
    }
    adj.set(h, list);
  }
  const dist = new Array(order.length).fill(Infinity);
  let frontier = [];
  order.forEach((p, i) => { if (isGoal(p)) { dist[i] = 0; frontier.push(i); } });
  for (let d = 1; frontier.length; d++) {
    const next = [];
    for (const i of frontier) for (const j of adj.get(i)) if (dist[j] === Infinity) { dist[j] = d; next.push(j); }
    frontier = next;
  }
  return { states: order, dist, n };
}

// Same layout with vehicles relabelled in reading order (A stays the red car), for spotting duplicates.
export function normalise(board) {
  const map = new Map([['A', 'A'], ['o', 'o'], ['x', 'x']]);
  let next = 0;
  return [...board].map((ch) => { if (!map.has(ch)) map.set(ch, LETTERS[next++]); return map.get(ch); }).join('');
}
