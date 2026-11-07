// Computer players for the turn-based Play Together games: Connect Four, Noughts and Crosses, Draughts, Reversi,
// Mancala, Dots and Boxes and Battleships. No browser dependencies, so tools/test-duo-ai.mjs can check them in Node.
//
// Each takes the game's own state (as rules.js and tbc-rules.js keep it), the computer's player number, the level
// ('easy' | 'medium' | 'hard') and rng() in [0, 1), and returns a legal move in the shape the game already sends.
// opts.ms caps the thinking time (searches deepen one ply at a time and keep the last finished answer), so a turn
// never holds up the screen for long; opts.depth overrides the level's search depth (tests).
// Every level takes a move that wins on the spot; Easy then blunders at random, Medium searches a few plies and
// Hard searches as deep as its time allows.
import { C4, c4CanDrop, tttWin, drMoves, drPlay, drKey, drOwner, drKing, rvMoves, rvPlay, dbEdges, FLEET } from './rules.js';
import { kalahPlay, kalahMoves, storeOf, pitsOf } from './tbc-rules.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const pick = (a, rng) => a[Math.floor(rng() * a.length)];
// thinking time per level in ms, before opts.ms
const CAP = { easy: 80, medium: 180, hard: 260 };
const WIN = 1e6;
// thrown to drop a search depth once the time cap has passed
const TIMEOUT = { timeout: true };

// Runs search(depth) for depth 1, 2, ... maxDepth until the clock runs out, and returns the last finished result.
// search(depth, check) must call check() now and then; check throws once the deadline has passed.
function deepen(maxDepth, ms, search) {
  const end = now() + ms;
  let nodes = 0, best = null;
  const check = () => { if ((++nodes & 255) === 0 && now() > end) throw TIMEOUT; };
  for (let d = 1; d <= maxDepth; d++) {
    try { best = search(d, d === 1 ? () => {} : check); } catch (e) { if (e !== TIMEOUT) throw e; break; }
    if (best.score >= WIN / 2 || now() > end) break; // a forced win is found, or no time for the next depth
  }
  return best;
}
// Picks one of the moves that scored within tol of the best, so the computer does not always play the same game.
function choose(scored, rng, tol = 0) {
  const top = Math.max(...scored.map((m) => m.score));
  return pick(scored.filter((m) => m.score >= top - tol), rng).move;
}

// ---------- Connect Four: negamax with alpha-beta over the 69 four-in-a-row windows ----------
const C4_ORDER = [3, 2, 4, 1, 5, 0, 6];
const C4_WINDOWS = [];
for (let r = 0; r < C4.H; r++) for (let c = 0; c < C4.W; c++) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const w = [];
    for (let k = 0; k < 4; k++) { const rr = r + dr * k, cc = c + dc * k; if (rr >= 0 && rr < C4.H && cc >= 0 && cc < C4.W) w.push(rr * 7 + cc); }
    if (w.length === 4) C4_WINDOWS.push(w);
  }
}
const C4_DEPTH = { easy: 2, medium: 5, hard: 9 };
// True when the disc v just placed at i makes four.
function c4Line(g, i, v) {
  const r = Math.floor(i / 7), c = i % 7;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let n = 1;
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s;
      while (rr >= 0 && rr < 6 && cc >= 0 && cc < 7 && g[rr * 7 + cc] === v) { n++; rr += dr * s; cc += dc * s; }
    }
    if (n >= 4) return true;
  }
  return false;
}
// Score for disc v: open threes and twos in each window, the opponent's counted against, and the centre column.
// A three whose empty square can be filled straight away counts extra.
function c4Eval(g, h, v) {
  let sc = 0;
  for (const w of C4_WINDOWS) {
    let mine = 0, theirs = 0, gap = -1;
    for (const i of w) { const x = g[i]; if (x === v) mine++; else if (x) theirs++; else gap = i; }
    if (mine && theirs) continue;
    const n = mine || theirs, sign = mine ? 1 : -1;
    if (n === 3) sc += sign * (5 - Math.floor(gap / 7) === h[gap % 7] ? 90 : 40);
    else if (n === 2) sc += sign * 6;
  }
  for (let r = 0; r < 6; r++) { const x = g[r * 7 + 3]; if (x) sc += x === v ? 5 : -5; }
  return sc;
}
// b: the board from rules.js (row 0 at the top); p: the computer's player number. Returns a column.
export function c4Ai(b, p, level = 'medium', rng = Math.random, opts = {}) {
  const g = Int8Array.from(b), h = new Int8Array(7);
  for (let c = 0; c < 7; c++) for (let r = 0; r < 6; r++) if (g[r * 7 + c]) h[c]++;
  const v0 = p + 1, cols = C4_ORDER.filter((c) => c4CanDrop(b, c));
  const at = (c) => (5 - h[c]) * 7 + c;
  // four on the spot
  for (const c of cols) { const i = at(c); g[i] = v0; const w = c4Line(g, i, v0); g[i] = 0; if (w) return c; }
  if (level === 'easy' && rng() < 0.3) return pick(cols, rng);
  let filled = h.reduce((a, x) => a + x, 0);
  function nega(depth, alpha, beta, v, ply, check) {
    check();
    if (filled === 42) return 0;
    for (const c of C4_ORDER) if (h[c] < 6) { const i = at(c); g[i] = v; const w = c4Line(g, i, v); g[i] = 0; if (w) return WIN - ply; }
    if (depth === 0) return c4Eval(g, h, v);
    let best = -WIN;
    for (const c of C4_ORDER) {
      if (h[c] >= 6) continue;
      const i = at(c);
      g[i] = v; h[c]++; filled++;
      const sc = -nega(depth - 1, -beta, -alpha, 3 - v, ply + 1, check);
      g[i] = 0; h[c]--; filled--;
      if (sc > best) best = sc;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }
  let order = cols.slice();
  const res = deepen(opts.depth || C4_DEPTH[level] || 5, opts.ms ?? CAP[level], (depth, check) => {
    const scored = [];
    for (const c of order) {
      const i = at(c);
      g[i] = v0; h[c]++; filled++;
      try { scored.push({ move: c, score: -nega(depth - 1, -WIN, WIN, 3 - v0, 1, check) }); } finally { g[i] = 0; h[c]--; filled--; }
    }
    order = scored.slice().sort((a, b2) => b2.score - a.score).map((m) => m.move);
    return { scored, score: Math.max(...scored.map((m) => m.score)) };
  });
  return choose(res.scored, rng);
}

// ---------- Noughts and Crosses: full minimax (the board is tiny) ----------
function tttScore(b, v, ply) {
  const w = tttWin(b);
  if (w) return w.player + 1 === v ? 10 - ply : ply - 10;
  if (b.every(Boolean)) return 0;
  let best = -99;
  for (let i = 0; i < 9; i++) if (!b[i]) { b[i] = v; best = Math.max(best, -tttScore(b, 3 - v, ply + 1)); b[i] = 0; }
  return best;
}
// b: nine squares, 0 empty, 1 player 0, 2 player 1. Easy blocks only some of the time, Medium sometimes plays
// a random square, Hard never loses.
export function tttAi(b0, p, level = 'medium', rng = Math.random) {
  const b = b0.slice(), v = p + 1, free = b.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
  const wins = (who) => free.filter((i) => { b[i] = who; const w = tttWin(b); b[i] = 0; return !!w; });
  const now1 = wins(v);
  if (now1.length) return pick(now1, rng);
  if (level === 'easy') { const block = wins(3 - v); return block.length && rng() < 0.4 ? pick(block, rng) : pick(free, rng); }
  if (level === 'medium' && rng() < 0.25) return pick(free, rng);
  const scored = free.map((i) => { b[i] = v; const s = -tttScore(b, 3 - v, 1); b[i] = 0; return { move: i, score: s }; });
  return choose(scored, rng);
}

// ---------- Draughts: alpha-beta over drMoves, which already enforces compulsory and continued captures ----------
const DR_DEPTH = { easy: 2, medium: 4, hard: 12 };
// Score for player p: material (kings worth more), men moving up, a guarded back row, the centre, mobility, and
// when ahead, swapping pieces off and kings closing in so a won ending gets finished.
function drEval(b, p) {
  let mat = [0, 0], pos = [0, 0], cnt = [0, 0];
  const kings = [[], []], all = [[], []];
  for (let i = 0; i < 64; i++) {
    const v = b[i];
    if (!v) continue;
    const o = drOwner(v), r = i >> 3, c = i & 7;
    cnt[o]++; all[o].push(i);
    if (drKing(v)) { mat[o] += 175; kings[o].push(i); } else {
      mat[o] += 100;
      pos[o] += (o === 0 ? 7 - r : r) * 4;
      if ((o === 0 && r === 7) || (o === 1 && r === 0)) pos[o] += 8;
    }
    if (r >= 2 && r <= 5 && c >= 2 && c <= 5) pos[o] += 3;
  }
  const q = 1 - p;
  let sc = mat[p] - mat[q] + pos[p] - pos[q];
  sc += 2 * (drMoves(b, p).length - drMoves(b, q).length);
  const lead = mat[p] - mat[q];
  if (lead > 0) {
    sc += (12 - cnt[q]) * 6;
    for (const k of kings[p]) for (const t of all[q]) sc -= Math.max(Math.abs((k >> 3) - (t >> 3)), Math.abs((k & 7) - (t & 7)));
  } else if (lead < 0) {
    sc -= (12 - cnt[p]) * 6;
    for (const k of kings[q]) for (const t of all[p]) sc += Math.max(Math.abs((k >> 3) - (t >> 3)), Math.abs((k & 7) - (t & 7)));
  }
  return sc;
}
// b: the board from rules.js; p: the computer's player. Returns the move key (drKey) the game sends.
export function drAi(b0, p, level = 'medium', rng = Math.random, opts = {}) {
  const moves = drMoves(b0, p);
  if (moves.length === 1) return drKey(moves[0]);
  // take every last piece, or leave the other side with no move
  for (const m of moves) { const b = b0.slice(); drPlay(b, m); if (!drMoves(b, 1 - p).length) return drKey(m); }
  if (level === 'easy' && rng() < 0.3) return drKey(pick(moves, rng));
  function nega(b, depth, alpha, beta, side, ply, check, ext) {
    check();
    const ms = drMoves(b, side);
    if (!ms.length) return -WIN + ply;
    // captures are compulsory, so carry on through a run of them before judging the position
    if (depth <= 0 && !(ms[0].caps.length && ext < 6)) return drEval(b, side);
    let best = -WIN;
    const nd = depth <= 0 ? 0 : depth - 1, ne = depth <= 0 ? ext + 1 : ext;
    for (const m of ms) {
      const c = b.slice();
      drPlay(c, m);
      const sc = -nega(c, nd, -beta, -alpha, 1 - side, ply + 1, check, ne);
      if (sc > best) best = sc;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }
  let order = moves.slice();
  const res = deepen(opts.depth || DR_DEPTH[level] || 4, opts.ms ?? CAP[level], (depth, check) => {
    const scored = [];
    let alpha = -WIN;
    for (const m of order) {
      const c = b0.slice();
      drPlay(c, m);
      // a narrow window after the first move is enough to tell which moves are the best
      const sc = -nega(c, depth - 1, -WIN, -alpha + 1, 1 - p, 1, check, 0);
      scored.push({ move: m, score: sc });
      if (sc > alpha) alpha = sc;
    }
    order = scored.slice().sort((a, b2) => b2.score - a.score).map((x) => x.move);
    return { scored, score: alpha };
  });
  return drKey(choose(res.scored, rng));
}

// ---------- Reversi: alpha-beta with square weights, corners, mobility, and an exact finish near the end ----------
const RV_W = [
  120, -25, 20, 5, 5, 20, -25, 120,
  -25, -45, -5, -5, -5, -5, -45, -25,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -25, -45, -5, -5, -5, -5, -45, -25,
  120, -25, 20, 5, 5, 20, -25, 120,
];
// the squares next to each corner, which are only dangerous while that corner is empty
const RV_NEAR = { 0: [1, 8, 9], 7: [6, 14, 15], 56: [48, 49, 57], 63: [54, 55, 62] };
const RV_DEPTH = { easy: 2, medium: 4, hard: 9 };
const RV_EXACT = { hard: 14 }; // empty squares left when Hard plays the ending out exactly
function rvEval(b, p) {
  const me = p + 1;
  let sc = 0, discs = 0;
  for (let i = 0; i < 64; i++) {
    const v = b[i];
    if (!v) continue;
    discs++;
    let w = RV_W[i];
    if (w < 0) { for (const k in RV_NEAR) if (RV_NEAR[k].includes(i) && b[k]) { w = 4; break; } }
    sc += v === me ? w : -w;
  }
  const m1 = rvMoves(b, p).length, m2 = rvMoves(b, 1 - p).length;
  sc += (m1 - m2) * (discs < 44 ? 8 : 4);
  if (!m1 && !m2) { const d = b.reduce((a, v) => a + (v === me ? 1 : v ? -1 : 0), 0); return d > 0 ? WIN / 4 + d : d < 0 ? -WIN / 4 + d : 0; }
  return sc;
}
function rvDiff(b, p) { const me = p + 1; let d = 0; for (const v of b) d += v === me ? 1 : v ? -1 : 0; return d; }
// b: the board from rules.js; p: the computer's player (who must have a move). Returns the square to play.
export function rvAi(b0, p, level = 'medium', rng = Math.random, opts = {}) {
  const moves = rvMoves(b0, p);
  if (moves.length === 1) return moves[0];
  // a move that ends the game with more discs
  for (const i of moves) {
    const b = b0.slice(); rvPlay(b, i, p);
    if (!rvMoves(b, 0).length && !rvMoves(b, 1).length && rvDiff(b, p) > 0) return i;
  }
  if (level === 'easy' && rng() < 0.35) return pick(moves, rng);
  const empties = b0.filter((v) => !v).length;
  const exact = empties <= (RV_EXACT[level] || 0);
  // corners first, then by square weight: better moves first means more cut-offs
  const ordered = (b, side) => rvMoves(b, side).sort((x, y) => RV_W[y] - RV_W[x]);
  // exactNow: this pass searches to the end of the game, so positions are judged by discs alone
  let exactNow = false;
  function nega(b, depth, alpha, beta, side, check, passed) {
    check();
    if (depth === 0) return exactNow ? rvDiff(b, side) : rvEval(b, side);
    const ms = ordered(b, side);
    if (!ms.length) {
      if (passed) { const d = rvDiff(b, side); return exactNow ? d : d > 0 ? WIN / 4 + d : d < 0 ? -WIN / 4 + d : 0; }
      return -nega(b, depth, -beta, -alpha, 1 - side, check, true);
    }
    let best = -WIN;
    for (const i of ms) {
      const c = b.slice(); rvPlay(c, i, side);
      const sc = -nega(c, depth - 1, -beta, -alpha, 1 - side, check, false);
      if (sc > best) best = sc;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }
  let order = moves.slice().sort((x, y) => RV_W[y] - RV_W[x]);
  const maxD = exact ? empties : opts.depth || RV_DEPTH[level] || 4;
  const res = deepen(maxD, opts.ms ?? CAP[level], (depth, check) => {
    exactNow = exact && depth === maxD;
    const scored = [];
    for (const i of order) {
      const c = b0.slice(); rvPlay(c, i, p);
      scored.push({ move: i, score: -nega(c, depth - 1, -WIN, WIN, 1 - p, check, false) });
    }
    order = scored.slice().sort((a, b2) => b2.score - a.score).map((x) => x.move);
    return { scored, score: Math.max(...scored.map((m) => m.score)) };
  });
  return choose(res.scored, rng);
}

// ---------- Mancala (Kalah): alpha-beta where an extra turn keeps the same side to move ----------
const KALAH_DEPTH = { easy: 1, medium: 4, hard: 14 };
const kClone = (s) => ({ pits: s.pits.slice(), turn: s.turn, over: s.over, winner: s.winner, last: s.last });
function kalahEval(s, p) {
  const q = 1 - p, d = s.pits[storeOf(p)] - s.pits[storeOf(q)];
  if (s.over) return d > 0 ? WIN / 4 + d : d < 0 ? -WIN / 4 + d : 0;
  const side = (x) => pitsOf(x).reduce((a, i) => a + s.pits[i], 0);
  return d * 4 + (side(p) - side(q));
}
// s: the Kalah state from tbc-rules.js with s.turn the computer. Returns the pit to sow.
export function kalahAi(s0, level = 'medium', rng = Math.random, opts = {}) {
  const p = s0.turn, moves = kalahMoves(s0);
  if (moves.length === 1) return moves[0];
  for (const i of moves) { const s = kClone(s0); kalahPlay(s, i); if (s.over && s.winner === p) return i; }
  if (level === 'easy' && rng() < 0.3) return pick(moves, rng);
  // scores are always from p's side: p maximises, the other side minimises, whoever has the extra turn
  function mm(s, depth, alpha, beta, check) {
    check();
    if (s.over || depth === 0) return kalahEval(s, p);
    const max = s.turn === p;
    let best = max ? -WIN : WIN;
    for (const i of kalahMoves(s)) {
      const c = kClone(s); kalahPlay(c, i);
      const sc = mm(c, depth - 1, alpha, beta, check);
      if (max) { if (sc > best) best = sc; if (best > alpha) alpha = best; } else { if (sc < best) best = sc; if (best < beta) beta = best; }
      if (alpha >= beta) break;
    }
    return best;
  }
  let order = moves.slice();
  const res = deepen(opts.depth || KALAH_DEPTH[level] || 4, opts.ms ?? CAP[level], (depth, check) => {
    const scored = order.map((i) => { const c = kClone(s0); kalahPlay(c, i); return { move: i, score: mm(c, depth - 1, -WIN, WIN, check) }; });
    order = scored.slice().sort((a, b2) => b2.score - a.score).map((x) => x.move);
    return { scored, score: Math.max(...scored.map((m) => m.score)) };
  });
  return choose(res.scored, rng);
}

// ---------- Dots and Boxes: take free boxes, never give a third side while there is a choice, and on Hard keep
// control of the long chains at the end by turning down the last two boxes of a chain (the double-cross) ----------
const dbGeo = new Map();
// Edge and box lists for an n x n grid: edges[k] is the edge id, eb[k] the boxes beside edge k, be[x] box x's edges.
function geo(n) {
  if (dbGeo.has(n)) return dbGeo.get(n);
  const edges = dbEdges(n), idx = new Map(edges.map((e, k) => [e, k]));
  const be = [...Array(n * n)].map((_, x) => { const r = Math.floor(x / n), c = x % n; return [`h${r}_${c}`, `h${r + 1}_${c}`, `v${r}_${c}`, `v${r}_${c + 1}`].map((e) => idx.get(e)); });
  const eb = edges.map(() => []);
  be.forEach((es, x) => es.forEach((k) => eb[k].push(x)));
  const g = { edges, be, eb };
  dbGeo.set(n, g);
  return g;
}
// A light copy of the position: on[k] for drawn edges and sides[x] for drawn sides of each box.
function dbModel(s) {
  const g = geo(s.n), on = g.edges.map((e) => s.edges[e] !== undefined);
  const sides = g.be.map((es) => es.filter((k) => on[k]).length);
  return { g, on, sides };
}
const dbDraw = (m, k) => { m.on[k] = true; let made = 0; for (const x of m.g.eb[k]) if (++m.sides[x] === 4) made++; return made; };
const dbUndraw = (m, k) => { m.on[k] = false; for (const x of m.g.eb[k]) m.sides[x]--; };
const dbFree = (m) => m.on.map((v, k) => (v ? -1 : k)).filter((k) => k >= 0);
const dbTakes = (m, k) => m.g.eb[k].some((x) => m.sides[x] === 3);
const dbSafe = (m, k) => m.g.eb[k].every((x) => m.sides[x] < 2);
// Boxes the next player takes by grabbing everything on offer after edge k is drawn (k is undone afterwards).
function dbGiveaway(m, k) {
  const drawn = [k];
  let got = dbDraw(m, k) ? -1 : 0; // k itself completing a box is not a giveaway
  if (got < 0) { dbUndraw(m, k); return -1; }
  for (let again = true; again;) {
    again = false;
    for (const e of dbFree(m)) if (dbTakes(m, e)) { got += dbDraw(m, e); drawn.push(e); again = true; }
  }
  drawn.reverse().forEach((e) => dbUndraw(m, e));
  return got;
}
// Splits a position with no safe move and nothing to take into chains and loops: [{len, loop, edges, boxes}].
// Returns null when some box has two or more undrawn sides into other boxes plus more (a junction), where the
// simple chain sums do not apply.
function dbChains(m) {
  const { g } = m, n2 = g.be.length, seen = new Array(n2).fill(false), out = [];
  for (let x = 0; x < n2; x++) if (m.sides[x] < 4 && m.sides[x] !== 2) return null;
  for (let x0 = 0; x0 < n2; x0++) {
    if (seen[x0] || m.sides[x0] === 4) continue;
    const boxes = [], edges = new Set(), stack = [x0];
    seen[x0] = true;
    let ground = 0;
    while (stack.length) {
      const x = stack.pop();
      boxes.push(x);
      for (const k of g.be[x]) {
        if (m.on[k]) continue;
        edges.add(k);
        const y = g.eb[k].find((z) => z !== x);
        if (y === undefined || m.sides[y] === 4) { if (y === undefined) ground++; continue; }
        if (!seen[y]) { seen[y] = true; stack.push(y); }
      }
    }
    out.push({ len: boxes.length, loop: ground === 0, edges: [...edges], boxes });
  }
  return out;
}
// Net boxes (controller minus opener) when the opener must open one of these chains and loops next.
function dbControl(chains, memo = new Map()) {
  if (!chains.length) return 0;
  const key = chains.map((c) => (c.loop ? 'L' : 'C') + c.len).sort().join();
  if (memo.has(key)) return memo.get(key);
  let best = Infinity;
  chains.forEach((c, i) => {
    const rest = chains.filter((_, j) => j !== i), f = dbControl(rest, memo);
    let v = c.len - f; // the controller takes it all and opens the next one
    if (!c.loop && c.len >= 3) v = Math.max(v, c.len - 4 + f); // or keeps control by giving up the last two
    if (c.loop && c.len >= 4) v = Math.max(v, c.len - 8 + f); // the last four of a loop
    best = Math.min(best, v);
  });
  memo.set(key, best);
  return best;
}
// The edge to open a chain with: the middle of a pair (so it cannot be turned down), otherwise an end.
function dbOpening(m, c) {
  if (!c.loop && c.len === 2) { const mid = c.edges.find((k) => m.g.eb[k].length === 2 && m.g.eb[k].every((x) => c.boxes.includes(x))); if (mid !== undefined) return mid; }
  const end = c.edges.find((k) => m.g.eb[k].filter((x) => c.boxes.includes(x)).length === 1);
  return end !== undefined ? end : c.edges[0];
}
// s: the Dots and Boxes state from rules.js; p: the computer. Returns an edge id.
export function dbAi(s, p, level = 'medium', rng = Math.random) {
  const m = dbModel(s), free = dbFree(m), E = (k) => m.g.edges[k];
  const takes = free.filter((k) => dbTakes(m, k));
  const safe = free.filter((k) => dbSafe(m, k));
  if (takes.length) {
    // edges that close two boxes at once first
    const two = takes.filter((k) => m.g.eb[k].filter((x) => m.sides[x] === 3).length === 2);
    if (level === 'hard' && !two.length) {
      const dc = dbDoubleCross(m, takes);
      if (dc !== null) return E(dc);
    }
    return E(pick(two.length ? two : takes, rng));
  }
  if (safe.length && (level !== 'easy' || rng() < 0.5)) return E(pick(safe, rng));
  if (level === 'easy') return E(pick(free, rng));
  if (level === 'hard') {
    const chains = dbChains(m);
    if (chains) {
      const scored = chains.map((c, i) => {
        const rest = chains.filter((_, j) => j !== i), f = dbControl(rest);
        let v = c.len - f;
        if (!c.loop && c.len >= 3) v = Math.max(v, c.len - 4 + f);
        if (c.loop && c.len >= 4) v = Math.max(v, c.len - 8 + f);
        return { move: dbOpening(m, c), score: -v * 100 - c.len };
      });
      return E(choose(scored, rng));
    }
  }
  // give away as few boxes as possible
  const scored = free.map((k) => ({ move: k, score: -dbGiveaway(m, k) }));
  return E(choose(scored, rng));
}
// Hard, with one box on offer: if it is the end of a chain of two and the rest of the board is all chains,
// decide whether to take both and open the next chain, or draw the far edge and hand both boxes over so the
// other player has to open the next chain. Returns the edge to draw, or null to just take the box.
function dbDoubleCross(m, takes) {
  const open = m.sides.map((v, x) => (v === 3 ? x : -1)).filter((x) => x >= 0);
  if (open.length !== 1 || takes.length !== 1) return null;
  const e1 = takes[0], a = open[0], bx = m.g.eb[e1].find((x) => x !== a);
  if (bx === undefined || m.sides[bx] !== 2) return null;
  const e2 = m.g.be[bx].find((k) => k !== e1 && !m.on[k]);
  if (e2 === undefined) return null;
  const far = m.g.eb[e2].find((x) => x !== bx);
  if (far !== undefined && m.sides[far] >= 2) return null; // the chain carries on past bx
  // what is left once both boxes are gone
  dbDraw(m, e1); dbDraw(m, e2);
  const rest = dbFree(m).some((k) => dbSafe(m, k)) ? null : dbChains(m);
  dbUndraw(m, e2); dbUndraw(m, e1);
  if (!rest || !rest.length) return null;
  return dbControl(rest) > 2 ? e2 : null;
}

// ---------- Battleships: random legal fleet (randomFleet in rules.js); shots by hunt and target ----------
// shots: Map cell -> 'miss' | 'hit' | 'sunk' for the computer's shots so far; sunk: the cells of each enemy ship
// sunk so far. Easy shoots mostly at random with some follow-up, Medium hunts on a checkerboard and then works
// along a hit line, Hard shoots where the remaining ships fit in the most ways. Returns a cell 0 to 99.
export function shipsAi(shots, sunk, level = 'medium', rng = Math.random) {
  const unknown = [...Array(100).keys()].filter((i) => !shots.has(i));
  const hits = [...shots].filter(([, r]) => r === 'hit').map(([i]) => i), hs = new Set(hits);
  // the cell one step from i, or -1 off the grid
  const step = (i, dr, dc) => { const r = Math.floor(i / 10) + dr, c = (i % 10) + dc; return r >= 0 && r < 10 && c >= 0 && c < 10 ? r * 10 + c : -1; };
  const around = [...new Set(hits.flatMap((i) => [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dr, dc]) => step(i, dr, dc))))].filter((i) => i >= 0 && !shots.has(i));
  const left = FLEET.slice();
  for (const sh of sunk) { const k = left.indexOf(sh.length); if (k >= 0) left.splice(k, 1); }
  if (level === 'easy') return around.length && rng() < 0.55 ? pick(around, rng) : pick(unknown, rng);
  if (level === 'medium') {
    if (hits.length) {
      // carry on along a line of two or more hits, from either end
      const line = [];
      for (const i of hits) for (const [dr, dc] of [[0, 1], [1, 0]]) {
        if (!hs.has(step(i, dr, dc))) continue;
        let a = i, z = i;
        while (hs.has(step(a, -dr, -dc))) a = step(a, -dr, -dc);
        while (hs.has(step(z, dr, dc))) z = step(z, dr, dc);
        for (const e of [step(a, -dr, -dc), step(z, dr, dc)]) if (e >= 0 && !shots.has(e)) line.push(e);
      }
      if (line.length) return pick(line, rng);
      if (around.length) return pick(around, rng);
    }
    // hunt on a grid spaced by the shortest ship still afloat
    const gap = Math.min(...left);
    const grid = unknown.filter((i) => (Math.floor(i / 10) + (i % 10)) % gap === 0);
    return pick(grid.length ? grid : unknown, rng);
  }
  // Hard: count every way each remaining ship could lie; with hits on the board only placements through them count
  const heat = new Array(100).fill(0);
  for (const len of left) for (const vert of [false, true]) for (let r = 0; r < (vert ? 11 - len : 10); r++) for (let c = 0; c < (vert ? 10 : 11 - len); c++) {
    let through = 0, bad = false;
    const cells = [];
    for (let k = 0; k < len; k++) {
      const i = (r + (vert ? k : 0)) * 10 + c + (vert ? 0 : k), sh = shots.get(i);
      if (sh === 'miss' || sh === 'sunk') { bad = true; break; }
      if (sh === 'hit') through++;
      cells.push(i);
    }
    if (bad || (hits.length && !through)) continue;
    const w = hits.length ? 1 + through * through * 8 : 1;
    for (const i of cells) if (!shots.has(i)) heat[i] += w;
  }
  const scored = unknown.map((i) => ({ move: i, score: heat[i] + ((Math.floor(i / 10) + (i % 10)) % 2 === 0 ? 0.5 : 0) }));
  return choose(scored, rng);
}

// ---------- Shared by the games: how long the computer pauses before its move ----------
// Calls think() after a short, natural pause (about 400 to 900 ms in all, including the thinking), then play(move).
// The thinking starts a frame or two into the pause so the turn text can show first. Nothing happens once
// the game screen has gone (ctx.alive() false).
export function aiTurn(ctx, think, play) {
  const t0 = now(), wait = 400 + Math.random() * 500;
  setTimeout(() => {
    if (!ctx.alive()) return;
    const mv = think();
    setTimeout(() => { if (ctx.alive() && mv !== null && mv !== undefined) play(mv); }, Math.max(0, wait - (now() - t0)));
  }, 60);
}
