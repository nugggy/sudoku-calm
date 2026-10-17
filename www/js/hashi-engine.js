// Island Hop (Hashiwokakero) engine: board model, propagation solver, solution counter and grader.
// Shared by the game screen and tools/gen-hashi.mjs.

// A stored puzzle is {w, h, g, s, d}: g is the grid row by row with islands as digits and runs of
// water as letters (a = 1 cell, b = 2, ...), s is the solution as one digit (0-2) per edge in the
// order buildBoard() lists them, d is the difficulty tier (1 easy to 4 expert).
export const packGrid = (g) => g.replace(/\.+/g, (m) => { let out = ''; for (let k = m.length; k > 0; k -= 26) out += String.fromCharCode(96 + Math.min(26, k)); return out; });
export const unpackGrid = (p) => p.replace(/[a-z]/g, (ch) => '.'.repeat(ch.charCodeAt(0) - 96));
export const boardOf = (P) => buildBoard(P.w, P.h, unpackGrid(P.g));

// g here is the plain grid: '.' water, '1'-'8' islands.
export function buildBoard(w, h, g) {
  const islands = [], at = new Int16Array(w * h).fill(-1);
  for (let i = 0; i < w * h; i++) if (g[i] !== '.') { at[i] = islands.length; islands.push({ r: Math.floor(i / w), c: i % w, n: +g[i], edges: [] }); }
  // each island links to the first island to its right and below it
  const edges = [];
  islands.forEach((isl, a) => {
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const cells = [];
      for (let r = isl.r + dr, c = isl.c + dc; r < h && c < w; r += dr, c += dc) {
        const k = r * w + c;
        if (at[k] >= 0) { if (cells.length) edges.push({ a, b: at[k], horiz: dr === 0, cells: cells.slice(), cross: [] }); break; }
        cells.push(k);
      }
    }
  });
  // two edges cross when they share a water cell
  const byCell = new Map();
  edges.forEach((e, ei) => { e.cells.forEach((k) => { if (!byCell.has(k)) byCell.set(k, []); byCell.get(k).push(ei); }); islands[e.a].edges.push(ei); islands[e.b].edges.push(ei); });
  for (const list of byCell.values()) for (const x of list) for (const y of list) if (x !== y && !edges[x].cross.includes(y)) edges[x].cross.push(y);
  return { w, h, islands, edges };
}

// Edge from island a heading in direction (dr, dc), or -1.
export function edgeToward(B, a, dr, dc) {
  const isl = B.islands[a];
  for (const ei of isl.edges) {
    const e = B.edges[ei], o = B.islands[e.a === a ? e.b : e.a];
    if (Math.sign(o.r - isl.r) === dr && Math.sign(o.c - isl.c) === dc) return ei;
  }
  return -1;
}

// Are all islands joined by the edges where use(e) is true?
export function connected(B, use) {
  const n = B.islands.length;
  if (n <= 1) return true;
  const seen = new Uint8Array(n), stack = [0];
  seen[0] = 1;
  let count = 1;
  while (stack.length) {
    const a = stack.pop();
    for (const ei of B.islands[a].edges) {
      if (!use(ei)) continue;
      const e = B.edges[ei], o = e.a === a ? e.b : e.a;
      if (!seen[o]) { seen[o] = 1; count++; stack.push(o); }
    }
  }
  return count === n;
}

// Is `counts` (bridges per edge) a full valid solution?
export function isSolved(B, counts) {
  for (const isl of B.islands) { let s = 0; for (const ei of isl.edges) s += counts[ei]; if (s !== isl.n) return false; }
  for (let ei = 0; ei < B.edges.length; ei++) if (counts[ei]) for (const x of B.edges[ei].cross) if (counts[x]) return false;
  return connected(B, (ei) => counts[ei] > 0);
}

// ---------- Solver state: lo/hi bounds on the bridge count of every edge ----------
function initState(B) {
  const lo = new Int8Array(B.edges.length), hi = new Int8Array(B.edges.length);
  B.edges.forEach((e, ei) => { hi[ei] = Math.min(2, B.islands[e.a].n, B.islands[e.b].n); });
  // two 1s (or two 2s) joined fully would cut themselves off, unless they are the whole puzzle
  if (B.islands.length > 2) B.edges.forEach((e, ei) => { const na = B.islands[e.a].n, nb = B.islands[e.b].n; if (na === nb && na <= 2) hi[ei] = Math.min(hi[ei], na - 1); });
  return { lo, hi };
}
const copy = (S) => ({ lo: S.lo.slice(), hi: S.hi.slice() });

// Local rules (island totals and crossings), repeated until nothing changes. Returns false on contradiction.
// With simple = true only the obvious rules run: an island that needs every possible bridge, or has all it needs.
function propagate(B, S, simple = false) {
  const { lo, hi } = S;
  for (let changed = true; changed;) {
    changed = false;
    for (const isl of B.islands) {
      let sl = 0, sh = 0;
      for (const ei of isl.edges) { sl += lo[ei]; sh += hi[ei]; }
      if (sl > isl.n || sh < isl.n) return false;
      if (simple && sl !== isl.n && sh !== isl.n) continue;
      for (const ei of isl.edges) {
        const nl = Math.max(lo[ei], isl.n - (sh - hi[ei])), nh = Math.min(hi[ei], isl.n - (sl - lo[ei]));
        if (nl > nh) return false;
        if (nl !== lo[ei] || nh !== hi[ei]) { sl += nl - lo[ei]; sh += nh - hi[ei]; lo[ei] = nl; hi[ei] = nh; changed = true; }
      }
    }
    for (let ei = 0; ei < B.edges.length; ei++) {
      if (!lo[ei]) continue;
      for (const x of B.edges[ei].cross) { if (lo[x]) return false; if (hi[x]) { hi[x] = 0; changed = true; } }
    }
  }
  return connected(B, (ei) => hi[ei] > 0);
}

// One application of the general island rule (e.g. a 3 with two neighbours needs a bridge to each). True if it changed anything.
function generalStep(B, S) {
  const { lo, hi } = S;
  for (const isl of B.islands) {
    let sl = 0, sh = 0;
    for (const ei of isl.edges) { sl += lo[ei]; sh += hi[ei]; }
    let changed = false;
    for (const ei of isl.edges) {
      const nl = Math.max(lo[ei], isl.n - (sh - hi[ei])), nh = Math.min(hi[ei], isl.n - (sl - lo[ei]));
      if (nl !== lo[ei] || nh !== hi[ei]) { sl += nl - lo[ei]; sh += nh - hi[ei]; lo[ei] = nl; hi[ei] = nh; changed = true; }
    }
    if (changed) return true;
  }
  return false;
}

// Edges whose removal would split the possible-bridge graph must carry at least one bridge.
function cutEdges(B, S) {
  const n = B.islands.length, disc = new Int32Array(n).fill(-1), low = new Int32Array(n), out = [];
  let t = 0;
  const dfs = (u, viaEdge) => {
    disc[u] = low[u] = t++;
    for (const ei of B.islands[u].edges) {
      if (ei === viaEdge || !S.hi[ei]) continue;
      const e = B.edges[ei], v = e.a === u ? e.b : e.a;
      if (disc[v] < 0) { dfs(v, ei); low[u] = Math.min(low[u], low[v]); if (low[v] > disc[u]) out.push(ei); }
      else low[u] = Math.min(low[u], disc[v]);
    }
  };
  dfs(0, -1);
  return out.filter((ei) => S.lo[ei] === 0);
}

const solvedState = (S) => S.lo.every((v, i) => v === S.hi[i]);

// Count solutions up to `limit` with propagation and backtracking. Returns {count, solution}.
export function countSolutions(B, limit = 2) {
  let count = 0, solution = null;
  const rec = (S) => {
    if (!propagate(B, S)) return;
    // choose the open edge with the tightest island
    let best = -1, bestScore = 99;
    for (const isl of B.islands) {
      let open = 0, pick = -1;
      for (const ei of isl.edges) if (S.lo[ei] < S.hi[ei]) { open++; pick = ei; }
      if (open && open < bestScore) { bestScore = open; best = pick; }
    }
    if (best < 0) {
      if (connected(B, (ei) => S.lo[ei] > 0)) { count++; if (!solution) solution = Array.from(S.lo); }
      return;
    }
    for (let v = S.hi[best]; v >= S.lo[best] && count < limit; v--) {
      const T = copy(S); T.lo[best] = T.hi[best] = v; rec(T);
    }
  };
  rec(initState(B));
  return { count, solution };
}

// Human-style solve, always using the easiest rule that makes progress. Returns {solved, t1, t2, t3, order, solution}:
// t1 counts uses of the general island rule, t2 connection deductions, t3 single-edge trials,
// and order lists edges in the order they first got a bridge (used for hints).
export function logicSolve(B, maxT3 = 999) {
  const S = initState(B), order = [], seen = new Uint8Array(B.edges.length);
  let t1 = 0, t2 = 0, t3 = 0;
  const fail = () => ({ solved: false, t1, t2, t3, order });
  const note = () => { for (let ei = 0; ei < B.edges.length; ei++) if (!seen[ei] && S.lo[ei] > 0) { seen[ei] = 1; order.push(ei); } };
  for (;;) {
    if (!propagate(B, S, true)) return fail();
    note();
    if (solvedState(S)) break;
    if (generalStep(B, S)) { t1++; continue; }
    const cuts = cutEdges(B, S);
    if (cuts.length) { S.lo[cuts[0]] = 1; t2++; continue; }
    // trial: try each value of an open edge, rule out a value that leads to a contradiction
    let progress = false;
    for (let ei = 0; ei < B.edges.length && !progress; ei++) {
      if (S.lo[ei] === S.hi[ei]) continue;
      for (let v = S.lo[ei]; v <= S.hi[ei]; v++) {
        const T = copy(S); T.lo[ei] = T.hi[ei] = v;
        if (propagate(B, T)) continue;
        if (v === S.lo[ei]) S.lo[ei]++; else if (v === S.hi[ei]) S.hi[ei]--; else continue;
        progress = true; break;
      }
    }
    if (!progress || ++t3 > maxT3) return fail();
  }
  if (!connected(B, (ei) => S.lo[ei] > 0)) return fail();
  return { solved: true, t1, t2, t3, order, solution: Array.from(S.lo) };
}
