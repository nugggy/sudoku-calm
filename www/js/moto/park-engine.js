// Bike Park engine: a 7 x 6 car park, sliding vehicles, fixed obstacles and a breadth-first solver.
// A level is 'board:row:exits' where board is 42 characters read row by row: '.' is empty, 'x' a cone, '#' a
// planter, '+' a pillar (all fixed), 'A' your bike (always across, 2 long), and other letters the other vehicles.
// Lower-case letters b-n are bikes and scooters (2 long), upper-case B-P are cars (2 long) and Q-Z trucks (3 long).
// row is the exit row (0-5); exits is 'R' (gate on the right) or 'B' (gates on both sides of that row).
export const W = 7, H = 6;
export const FIXED = 'x#+';

// -> { vs: [{ id, h, len, line, kind }], pos: [], walls: [cell], row, both }
export function parse(level) {
  const [board, row, exits] = level.split(':');
  const seen = new Map(), walls = [];
  for (let i = 0; i < W * H; i++) {
    const ch = board[i];
    if (ch === '.') continue;
    if (FIXED.includes(ch)) { walls.push(i); continue; }
    if (!seen.has(ch)) seen.set(ch, []);
    seen.get(ch).push(i);
  }
  const vs = [], pos = [];
  for (const [id, cells] of seen) {
    const h = cells.length === 1 || cells[1] - cells[0] === 1;
    const r = Math.floor(cells[0] / W), c = cells[0] % W;
    vs.push({ id, h, len: cells.length, line: h ? r : c, kind: id === 'A' ? 'me' : id === id.toLowerCase() ? 'bike' : id >= 'Q' ? 'truck' : 'car' });
    pos.push(h ? c : r);
  }
  const a = vs.findIndex((v) => v.id === 'A');
  if (a > 0) { [vs[0], vs[a]] = [vs[a], vs[0]]; [pos[0], pos[a]] = [pos[a], pos[0]]; }
  return { vs, pos, walls, row: +row, both: exits === 'B', board };
}

export const cellsOf = (v, p) => Array.from({ length: v.len }, (_, k) => (v.h ? v.line * W + p + k : (p + k) * W + v.line));
const span = (v) => (v.h ? W : H);

export function grid(vs, pos, walls) {
  const g = new Int8Array(W * H);
  for (const w of walls) g[w] = -1;
  vs.forEach((v, i) => { for (const c of cellsOf(v, pos[i])) g[c] = i + 1; });
  return g;
}
export function toBoard(P, pos) {
  const g = grid(P.vs, pos, P.walls);
  const fixed = new Map(P.walls.map((w) => [w, P.board[w]]));
  return [...g].map((x, i) => (x < 0 ? fixed.get(i) : x ? P.vs[x - 1].id : '.')).join('');
}

// How far vehicle i can slide: [min, max] for its position.
export function range(vs, pos, i, g) {
  const v = vs[i], n = span(v), at = (k) => (v.h ? g[v.line * W + k] : g[k * W + v.line]);
  let lo = pos[i], hi = pos[i];
  while (lo > 0 && !at(lo - 1)) lo--;
  while (hi + v.len < n && !at(hi + v.len)) hi++;
  return [lo, hi];
}
export function moves(P, pos) {
  const g = grid(P.vs, pos, P.walls), out = [];
  for (let i = 0; i < P.vs.length; i++) {
    const [lo, hi] = range(P.vs, pos, i, g);
    for (let p = lo; p <= hi; p++) if (p !== pos[i]) out.push([i, p]);
  }
  return out;
}
// Your bike is out when it reaches the gate end of its row.
export const isGoal = (P, pos) => pos[0] === W - 2 || (P.both && pos[0] === 0);
// positions are below 7, so up to 18 vehicles pack into a safe integer
export const keyOf = (pos) => { let k = 0; for (let i = pos.length - 1; i >= 0; i--) k = k * 7 + pos[i]; return k; };
const unkey = (k, n) => { const p = new Array(n); for (let i = 0; i < n; i++) { p[i] = k % 7; k = Math.floor(k / 7); } return p; };

// Optimal solution as [[vehicle, newPos], ...] or null. One move slides one vehicle any distance.
export function solve(P, pos = P.pos, limit = 3e6) {
  if (isGoal(P, pos)) return [];
  const start = keyOf(pos), parent = new Map([[start, -1]]), via = new Map();
  let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (const k of frontier) {
      const p = unkey(k, P.vs.length);
      for (const [i, np] of moves(P, p)) {
        const q = p.slice(); q[i] = np;
        const nk = keyOf(q);
        if (parent.has(nk)) continue;
        parent.set(nk, k); via.set(nk, [i, np]);
        if (isGoal(P, q)) {
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

// Every position reachable from pos, each with its distance to the nearest goal (Infinity if none).
export function cluster(P, pos = P.pos, limit = 400000) {
  const order = [pos.slice()], id = new Map([[keyOf(pos), 0]]), adj = [];
  for (let h = 0; h < order.length; h++) {
    if (order.length > limit) return null;
    const list = [];
    for (const [i, np] of moves(P, order[h])) {
      const q = order[h].slice(); q[i] = np;
      const k = keyOf(q);
      let j = id.get(k);
      if (j === undefined) { j = order.length; id.set(k, j); order.push(q); }
      list.push(j);
    }
    adj.push(list);
  }
  const dist = new Array(order.length).fill(Infinity);
  let frontier = [];
  order.forEach((p, i) => { if (isGoal(P, p)) { dist[i] = 0; frontier.push(i); } });
  for (let d = 1; frontier.length; d++) {
    const next = [];
    for (const i of frontier) for (const j of adj[i]) if (dist[j] === Infinity) { dist[j] = d; next.push(j); }
    frontier = next;
  }
  return { states: order, dist };
}
