// Treat Twist engine: the board, matching, special treats, blockers, gravity and goals.
// It has no browser dependencies, so the game, the level generator (tools/gen-treat.mjs) and the
// tests (tools/test-treat.mjs) all run the same rules.
//
// A move is resolved in phases so the game can animate each one:
//   trySwap(st, a, b)  -> swaps (or refuses) and queues the move
//   step(st)           -> one phase: {phase: 'clear', ...} or {phase: 'fall', ...} or null when settled
//   endMove(st)        -> chocolate spreads, shuffles if stuck; returns {spread, shuffled}
// Phases describe what happened (cells cleared, specials fired, items moved) for the renderer.
import { mulberry32 } from './sudoku-engine.js';

// item kinds
export const NONE = 0, CANDY = 1, ING = 2, BOMB = 3;
// specials on a candy
export const PLAIN = 0, STRIPE_H = 1, STRIPE_V = 2, WRAPPED = 3, PRIMED = 5; // PRIMED: a wrapped treat waiting for its second burst
export const COLOURS = 6;

const rand = (st) => { st.r = (st.r + 0x6D2B79F5) | 0; let t = st.r; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const randInt = (st, n) => Math.floor(rand(st) * n);

// ---------- creating a board ----------
// level: {w, h, rows: [...] , jelly?: [...], colours, moves, goal, stars, seed, ingMax?}
//   rows: '#' no cell, '.' cell, '1'-'3' frosting layers, 'C' chocolate, 'L' locked candy
//   jelly rows: '1' or '2' layers of jelly under that cell
export function createState(level, seed = level.seed || 1) {
  const w = level.w, h = level.h, n = w * h;
  const st = {
    w, h, n, r: seed | 0, colours: level.colours || 5,
    cell: new Uint8Array(n), kind: new Uint8Array(n), c: new Int8Array(n).fill(-1), s: new Uint8Array(n), id: new Int32Array(n),
    jelly: new Uint8Array(n), frost: new Uint8Array(n), choc: new Uint8Array(n), lock: new Uint8Array(n), exit: new Uint8Array(n),
    nextId: 1, score: 0, moves: level.moves || 20, movesUsed: 0, collected: new Array(COLOURS).fill(0),
    goal: level.goal || { score: 1000 }, ingLeft: level.goal?.ing || 0, ingGot: 0, ingMax: level.ingMax || 2,
    chocHit: false, cascade: 0, pending: null, settled: true,
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, ch = level.rows[y][x];
    if (ch === '#') continue;
    st.cell[i] = 1;
    if (ch >= '1' && ch <= '3') st.frost[i] = +ch;
    else if (ch === 'C') st.choc[i] = 1;
    else if (ch === 'L') st.lock[i] = 1;
    const j = level.jelly?.[y]?.[x];
    if (j === '1' || j === '2') st.jelly[i] = +j;
  }
  // ingredients leave the board at the bottom cell of each column
  if (st.ingLeft) for (let x = 0; x < w; x++) for (let y = h - 1; y >= 0; y--) if (st.cell[y * w + x]) { st.exit[y * w + x] = 1; break; }
  fillBoard(st);
  return st;
}

export function cloneState(st) {
  const o = { ...st };
  for (const k of ['cell', 'kind', 'c', 's', 'id', 'jelly', 'frost', 'choc', 'lock', 'exit']) o[k] = st[k].slice();
  o.collected = st.collected.slice();
  o.goal = st.goal; o.pending = st.pending ? { ...st.pending } : null;
  return o;
}

const blocked = (st, i) => st.frost[i] > 0 || st.choc[i] > 0;
export const isCell = (st, i) => st.cell[i] === 1;
export const movable = (st, i) => st.cell[i] && !blocked(st, i) && !st.lock[i] && st.kind[i] !== NONE;
const matchable = (st, i) => st.cell[i] && st.kind[i] === CANDY && st.s[i] !== PRIMED && !blocked(st, i);

function put(st, i, kind, c = -1, s = PLAIN) { st.kind[i] = kind; st.c[i] = c; st.s[i] = s; st.id[i] = st.nextId++; }
function empty(st, i) { st.kind[i] = NONE; st.c[i] = -1; st.s[i] = PLAIN; st.id[i] = 0; }

// Fill every open cell with candies so there is no match yet but at least one move.
function fillBoard(st) {
  for (let tries = 0; tries < 200; tries++) {
    for (let i = 0; i < st.n; i++) {
      if (!st.cell[i] || blocked(st, i)) continue;
      let c;
      for (let k = 0; k < 20; k++) { c = randInt(st, st.colours); if (!wouldMatch(st, i, c)) break; }
      put(st, i, CANDY, c);
    }
    if (findMoves(st, 1).length) return;
  }
}
// Would colour c at i make a line of three with the candies already placed to its left or above?
function wouldMatch(st, i, c) {
  const { w } = st, x = i % w;
  const same = (j) => st.kind[j] === CANDY && st.c[j] === c && st.cell[j] && !blocked(st, j);
  if (x >= 2 && same(i - 1) && same(i - 2)) return true;
  if (i >= 2 * w && same(i - w) && same(i - 2 * w)) return true;
  return false;
}

// ---------- matching ----------
// All lines of three or more, grouped where they touch (an L or T shape is one group).
export function findGroups(st) {
  const { w, h } = st, runs = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const i = y * w + x;
      if (!matchable(st, i)) { x++; continue; }
      let e = x + 1;
      while (e < w && matchable(st, y * w + e) && st.c[y * w + e] === st.c[i]) e++;
      if (e - x >= 3) runs.push({ dir: 'h', cells: [...Array(e - x)].map((_, k) => y * w + x + k) });
      x = e;
    }
  }
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      const i = y * w + x;
      if (!matchable(st, i)) { y++; continue; }
      let e = y + 1;
      while (e < h && matchable(st, e * w + x) && st.c[e * w + x] === st.c[i]) e++;
      if (e - y >= 3) runs.push({ dir: 'v', cells: [...Array(e - y)].map((_, k) => (y + k) * w + x) });
      y = e;
    }
  }
  // join runs that share a cell
  const groups = [];
  for (const r of runs) {
    const hit = groups.filter((g) => r.cells.some((i) => g.set.has(i)));
    const g = { set: new Set(r.cells), runs: [r] };
    for (const o of hit) { o.set.forEach((i) => g.set.add(i)); g.runs.push(...o.runs); groups.splice(groups.indexOf(o), 1); }
    groups.push(g);
  }
  return groups.map((g) => ({ cells: [...g.set], runs: g.runs, c: st.c[g.runs[0].cells[0]] }));
}

// What special a group makes, and where. swapCells are the two cells of the player's swap (if any).
export function specialFor(st, g, swapCells = [], swapDir = null) {
  const long = Math.max(...g.runs.map((r) => r.cells.length));
  const hasH = g.runs.some((r) => r.dir === 'h'), hasV = g.runs.some((r) => r.dir === 'v');
  let kind = null;
  if (long >= 5) kind = 'bomb';
  else if (hasH && hasV) kind = 'wrapped';
  else if (long === 4) kind = 'stripe';
  if (!kind) return null;
  let spot = swapCells.find((i) => g.cells.includes(i));
  if (spot === undefined) {
    if (kind === 'wrapped') { // where the lines cross
      const hc = new Set(g.runs.filter((r) => r.dir === 'h').flatMap((r) => r.cells));
      spot = g.runs.filter((r) => r.dir === 'v').flatMap((r) => r.cells).find((i) => hc.has(i));
    }
    if (spot === undefined) { const r = g.runs.find((x) => x.cells.length === long); spot = r.cells[Math.floor((r.cells.length - 1) / 2)]; }
  }
  let s = PLAIN;
  if (kind === 'stripe') {
    // a sideways swipe makes a treat with sideways stripes (it clears its row); an up or down swipe, a column
    if (swapDir) s = swapDir === 'h' ? STRIPE_H : STRIPE_V;
    else s = g.runs[0].dir === 'h' ? STRIPE_V : STRIPE_H;
  } else if (kind === 'wrapped') s = WRAPPED;
  return { spot, kind, s };
}

// Does a candy at i sit in a line of three?
function matchAt(st, i) {
  if (!matchable(st, i)) return false;
  const { w, h } = st, x = i % w, y = (i / w) | 0, c = st.c[i];
  const same = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && matchable(st, yy * w + xx) && st.c[yy * w + xx] === c;
  let a = 1; for (let k = 1; same(x - k, y); k++) a++; for (let k = 1; same(x + k, y); k++) a++;
  if (a >= 3) return true;
  a = 1; for (let k = 1; same(x, y - k); k++) a++; for (let k = 1; same(x, y + k); k++) a++;
  return a >= 3;
}

const isSpecial = (st, i) => (st.kind[i] === CANDY && (st.s[i] === STRIPE_H || st.s[i] === STRIPE_V || st.s[i] === WRAPPED)) || st.kind[i] === BOMB;
function swapItems(st, a, b) {
  for (const k of ['kind', 'c', 's', 'id']) { const t = st[k][a]; st[k][a] = st[k][b]; st[k][b] = t; }
}
export const adjacent = (st, a, b) => (Math.abs(a - b) === 1 && Math.floor(a / st.w) === Math.floor(b / st.w)) || Math.abs(a - b) === st.w;

// Is swapping a and b allowed, and is it a special combo?
export function swapKind(st, a, b) {
  if (!adjacent(st, a, b) || !movable(st, a) || !movable(st, b)) return null;
  const ka = st.kind[a], kb = st.kind[b];
  if ((ka === BOMB && kb !== ING) || (kb === BOMB && ka !== ING)) return 'combo';
  if (isSpecial(st, a) && isSpecial(st, b)) return 'combo';
  swapItems(st, a, b);
  const ok = matchAt(st, a) || matchAt(st, b);
  swapItems(st, a, b);
  return ok ? 'match' : null;
}

// Every legal move (up to limit). Each move is [a, b].
export function findMoves(st, limit = Infinity) {
  const out = [], { w, n } = st;
  for (let i = 0; i < n && out.length < limit; i++) {
    if (!movable(st, i)) continue;
    if ((i % w) < w - 1 && swapKind(st, i, i + 1)) out.push([i, i + 1]);
    if (out.length < limit && i + w < n && swapKind(st, i, i + w)) out.push([i, i + w]);
  }
  return out;
}

// The player's swap. Returns false (and changes nothing) if it is not a legal move.
export function trySwap(st, a, b, { free = false } = {}) {
  const k = free ? (adjacent(st, a, b) && movable(st, a) && movable(st, b) ? (swapKind(st, a, b) || 'free') : null) : swapKind(st, a, b);
  if (!k) return false;
  swapItems(st, a, b);
  st.pending = { type: k === 'combo' ? 'combo' : 'swap', a, b, dir: Math.abs(a - b) === 1 ? 'h' : 'v' };
  if (!free) { st.moves--; st.movesUsed++; }
  st.cascade = 0; st.chocHit = false; st.settled = false; st.phaseNext = 'clear';
  return true;
}

// ---------- clearing ----------
const PTS = { 3: 60, 4: 120, 5: 200 };
function newPhase(st) {
  return { phase: 'clear', cleared: [], fired: [], created: [], hits: [], collected: [], ing: [], groups: [], score: 0, cascade: st.cascade, combo: null };
}

function cellsOfRow(st, y) { const o = []; for (let x = 0; x < st.w; x++) o.push(y * st.w + x); return o; }
function cellsOfCol(st, x) { const o = []; for (let y = 0; y < st.h; y++) o.push(y * st.w + x); return o; }
function area(st, i, r) {
  const o = [], { w, h } = st, x = i % w, y = (i / w) | 0;
  for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) if (xx >= 0 && yy >= 0 && xx < w && yy < h) o.push(yy * w + xx);
  return o;
}
function mostCommonColour(st) {
  const cnt = new Array(COLOURS).fill(0);
  for (let i = 0; i < st.n; i++) if (st.kind[i] === CANDY && st.cell[i] && !blocked(st, i)) cnt[st.c[i]]++;
  let best = 0; for (let c = 1; c < COLOURS; c++) if (cnt[c] > cnt[best]) best = c;
  return best;
}
function cellsOfColour(st, c) { const o = []; for (let i = 0; i < st.n; i++) if (st.kind[i] === CANDY && st.c[i] === c && st.cell[i] && !blocked(st, i)) o.push(i); return o; }

// One clear phase. Works through a queue of cells to hit; special treats that are hit add their own cells.
function clearPhase(st) {
  const ev = newPhase(st), queue = [], hitDone = new Set(), creates = [], adjacentHits = new Set(), consumed = new Set();
  const p = st.pending; st.pending = null;
  const fire = (i, cells, type) => { ev.fired.push({ i, type, c: st.c[i], cells }); cells.forEach((j) => queue.push(j)); };

  if (p && p.type === 'combo') {
    const { a, b } = p, A = { k: st.kind[a], s: st.s[a], c: st.c[a] }, B = { k: st.kind[b], s: st.s[b], c: st.c[b] };
    const stripe = (x) => x.k === CANDY && (x.s === STRIPE_H || x.s === STRIPE_V), wrap = (x) => x.k === CANDY && x.s === WRAPPED;
    consumed.add(a); consumed.add(b);
    const take = (i) => { hitDone.add(i); ev.cleared.push({ i, c: st.c[i], s: st.s[i], k: st.kind[i] }); hitJelly(st, ev, i); empty(st, i); };
    if (A.k === BOMB && B.k === BOMB) {
      ev.combo = 'bombbomb'; take(a); take(b);
      const all = []; for (let i = 0; i < st.n; i++) if (st.cell[i]) all.push(i);
      fire(b, all, 'all');
    } else if (A.k === BOMB || B.k === BOMB) {
      const [bi, oi, O] = A.k === BOMB ? [a, b, B] : [b, a, A];
      if (stripe(O) || wrap(O)) {
        ev.combo = stripe(O) ? 'bombstripe' : 'bombwrap';
        take(bi);
        const targets = cellsOfColour(st, O.c);
        for (const j of targets) { if (st.s[j] === PLAIN) st.s[j] = wrap(O) ? WRAPPED : (rand(st) < 0.5 ? STRIPE_H : STRIPE_V); }
        consumed.delete(oi);
        ev.converted = targets.map((j) => ({ i: j, s: st.s[j] }));
        fire(bi, targets, 'colour');
      } else {
        ev.combo = 'bomb'; take(bi);
        const col = O.k === CANDY ? O.c : mostCommonColour(st);
        consumed.delete(oi);
        fire(bi, cellsOfColour(st, col), 'colour');
      }
    } else if (stripe(A) && stripe(B)) {
      ev.combo = 'cross'; take(a); take(b);
      const x = b % st.w, y = (b / st.w) | 0;
      fire(b, [...cellsOfRow(st, y), ...cellsOfCol(st, x)], 'cross');
    } else if ((stripe(A) && wrap(B)) || (wrap(A) && stripe(B))) {
      ev.combo = 'bigcross'; take(a); take(b);
      const x = b % st.w, y = (b / st.w) | 0, cells = [];
      for (let d = -1; d <= 1; d++) { if (y + d >= 0 && y + d < st.h) cells.push(...cellsOfRow(st, y + d)); if (x + d >= 0 && x + d < st.w) cells.push(...cellsOfCol(st, x + d)); }
      fire(b, cells, 'bigcross');
    } else {
      ev.combo = 'bigblast'; take(a); take(b);
      fire(b, area(st, b, 2), 'blast');
      creates.push({ spot: b, kind: 'wrapped', s: PRIMED, c: B.c, combo: true });
    }
  } else if (p && p.type === 'party') {
    p.cells.forEach((i) => queue.push(i));
  } else {
    const groups = findGroups(st);
    const swapCells = p && p.type === 'swap' ? [p.a, p.b] : [];
    for (const g of groups) {
      const sp = specialFor(st, g, swapCells, swapCells.length ? p.dir : null);
      const n = g.cells.length, pts = Math.round((PTS[Math.min(5, n)] || 200 + (n - 5) * 40) * (1 + 0.5 * st.cascade));
      ev.score += pts; ev.groups.push({ cells: g.cells, c: g.c, pts, special: sp ? sp.kind : null });
      if (sp) creates.push({ ...sp, c: g.c });
      for (const i of g.cells) {
        queue.push(i);
        for (const j of neighbours(st, i)) if (st.frost[j] || st.choc[j]) adjacentHits.add(j);
      }
    }
    // primed wrapped treats burst a second time once everything has settled
    for (let i = 0; i < st.n; i++) if (st.kind[i] === CANDY && st.s[i] === PRIMED) queue.push(i);
  }
  if (!queue.length && !ev.fired.length && !creates.length && !ev.cleared.length) return null;

  while (queue.length) {
    const i = queue.shift();
    if (hitDone.has(i) || !st.cell[i]) continue;
    hitDone.add(i);
    hitCell(st, ev, i, fire, consumed.has(i));
  }
  for (const j of adjacentHits) if (!hitDone.has(j)) { hitDone.add(j); hitBlocker(st, ev, j); }
  for (const cr of creates) {
    if (st.kind[cr.spot] !== NONE && !(st.kind[cr.spot] === CANDY && st.s[cr.spot] === PRIMED && cr.combo)) continue;
    if (blocked(st, cr.spot)) continue;
    if (cr.kind === 'bomb') put(st, cr.spot, BOMB); else put(st, cr.spot, CANDY, cr.c, cr.s);
    ev.created.push({ i: cr.spot, kind: cr.kind, s: cr.s, c: cr.c, id: st.id[cr.spot] });
    if (!cr.combo) ev.score += cr.kind === 'bomb' ? 300 : cr.kind === 'wrapped' ? 200 : 120;
  }
  st.score += ev.score;
  st.cascade++;
  return ev;
}

function neighbours(st, i) {
  const { w, h } = st, x = i % w, y = (i / w) | 0, o = [];
  if (x > 0) o.push(i - 1); if (x < w - 1) o.push(i + 1); if (y > 0) o.push(i - w); if (y < h - 1) o.push(i + w);
  return o;
}
function hitJelly(st, ev, i) { if (st.jelly[i]) { st.jelly[i]--; ev.hits.push({ i, type: 'jelly', left: st.jelly[i] }); ev.score += 100; } }
function hitBlocker(st, ev, i) {
  if (st.frost[i]) { st.frost[i]--; ev.hits.push({ i, type: 'frost', left: st.frost[i] }); ev.score += 40; if (!st.frost[i]) hitJelly(st, ev, i); return true; }
  if (st.choc[i]) { st.choc[i] = 0; st.chocHit = true; ev.hits.push({ i, type: 'choc', left: 0 }); ev.score += 40; hitJelly(st, ev, i); return true; }
  return false;
}
// Hit one cell: break a lock, chip a blocker, or clear the item (firing it if it is special).
function hitCell(st, ev, i, fire, quiet) {
  if (st.lock[i]) { st.lock[i] = 0; ev.hits.push({ i, type: 'lock', left: 0 }); ev.score += 40; return; }
  if (hitBlocker(st, ev, i)) return;
  const k = st.kind[i];
  if (k === NONE) return;
  if (k === ING) return; // ingredients cannot be destroyed, only brought down
  const c = st.c[i], s = st.s[i];
  if (k === BOMB) {
    if (quiet) { ev.cleared.push({ i, c, s, k }); hitJelly(st, ev, i); empty(st, i); return; }
    ev.cleared.push({ i, c, s, k }); hitJelly(st, ev, i); empty(st, i);
    fire(i, cellsOfColour(st, mostCommonColour(st)), 'colour');
    return;
  }
  if (!quiet && s === WRAPPED) {
    // first burst: the treat stays and bursts again after the candies settle
    st.s[i] = PRIMED; hitJelly(st, ev, i);
    fire(i, area(st, i, 1).filter((j) => j !== i), 'blast');
    ev.primed = (ev.primed || []).concat(i);
    return;
  }
  ev.cleared.push({ i, c, s, k, id: st.id[i] });
  st.collected[c]++; ev.collected.push(c);
  if (ev.groups.length === 0 || !ev.groups.some((g) => g.cells.includes(i))) ev.score += 40;
  hitJelly(st, ev, i);
  empty(st, i);
  if (quiet) return;
  if (s === STRIPE_H) fire(i, cellsOfRow(st, (i / st.w) | 0), 'row');
  else if (s === STRIPE_V) fire(i, cellsOfCol(st, i % st.w), 'col');
  else if (s === PRIMED) fire(i, area(st, i, 1), 'blast');
}

// ---------- gravity ----------
// Candies fall straight down, then slide diagonally into gaps under blockers, and new candies drop in at the top.
function fallPhase(st) {
  const { w, h } = st, moves = new Map(), spawned = [], ing = [];
  const from = new Map(); // id -> original index
  const move = (a, b) => { const id = st.id[a]; if (!from.has(id)) from.set(id, a); swapItems(st, a, b); };
  const holds = (i) => st.cell[i] && !blocked(st, i);
  let changed = true, guard = 0;
  collectIngredients(st, ing);
  while (changed && guard++ < 200) {
    changed = false;
    // straight down
    for (let x = 0; x < w; x++) {
      for (let y = h - 1; y >= 0; y--) {
        const i = y * w + x;
        if (!holds(i) || st.kind[i] !== NONE) continue;
        for (let yy = y - 1; yy >= 0; yy--) {
          const j = yy * w + x;
          if (!st.cell[j]) break;
          if (blocked(st, j) || st.lock[j]) break;
          if (st.kind[j] !== NONE) { move(j, i); changed = true; break; }
        }
      }
    }
    // new candies at the top of each column
    for (let x = 0; x < w; x++) {
      let top = -1;
      for (let y = 0; y < h; y++) if (st.cell[y * w + x]) { top = y; break; }
      if (top < 0) continue;
      const i = top * w + x;
      if (holds(i) && st.kind[i] === NONE) { spawn(st, i); spawned.push({ i, id: st.id[i] }); changed = true; }
    }
    if (changed) continue;
    // diagonal slides into gaps that nothing can fall into from above
    for (let y = h - 1; y > 0 && !changed; y--) {
      for (let x = 0; x < w && !changed; x++) {
        const i = y * w + x;
        if (!holds(i) || st.kind[i] !== NONE) continue;
        if (feedable(st, i)) continue;
        for (const dx of [-1, 1]) {
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          const j = (y - 1) * w + xx;
          if (movable(st, j) && st.kind[j] !== NONE) { move(j, i); changed = true; break; }
        }
      }
    }
    collectIngredients(st, ing);
  }
  for (const [id, a] of from) { const b = st.id.indexOf(id); if (b >= 0 && b !== a) moves.set(id, { id, from: a, to: b }); }
  return { phase: 'fall', moves: [...moves.values()], spawned, ing };
}
// Can a gap at i still be filled from straight above (an open path up to the top of the column)?
function feedable(st, i) {
  const { w } = st, x = i % w;
  for (let y = ((i / w) | 0) - 1; y >= 0; y--) {
    const j = y * w + x;
    if (!st.cell[j]) return false;
    if (blocked(st, j) || st.lock[j]) return false;
    if (st.kind[j] !== NONE) return true;
  }
  return true; // the top of the column spawns
}
function spawn(st, i) {
  const ingOnBoard = st.kind.reduce((a, k, j) => a + (k === ING && st.cell[j] ? 1 : 0), 0);
  if (st.ingLeft > 0 && ingOnBoard < st.ingMax && (ingOnBoard === 0 || rand(st) < 0.08)) {
    st.ingLeft--; put(st, i, ING, randInt(st, 2)); return;
  }
  put(st, i, CANDY, randInt(st, st.colours));
}
function collectIngredients(st, out) {
  for (let i = 0; i < st.n; i++) if (st.exit[i] && st.kind[i] === ING) { out.push({ i, id: st.id[i], c: st.c[i] }); st.ingGot++; st.score += 1000; empty(st, i); }
}

// ---------- resolving ----------
// Next phase of the current move, or null once nothing more happens.
export function step(st) {
  if (st.phaseNext === 'fall') { st.phaseNext = 'clear'; return fallPhase(st); }
  const ev = clearPhase(st);
  if (ev) { st.phaseNext = 'fall'; return ev; }
  st.settled = true;
  return null;
}
// After the board settles: chocolate grows if none was broken this move, and a stuck board is shuffled.
export function endMove(st) {
  const out = { spread: null, shuffled: false };
  if (!st.chocHit && st.choc.some((v, i) => v && st.cell[i])) {
    const opts = [];
    for (let i = 0; i < st.n; i++) if (st.choc[i]) for (const j of neighbours(st, i)) if (st.kind[j] === CANDY && st.s[j] === PLAIN && !st.lock[j] && !blocked(st, j)) opts.push(j);
    if (opts.length) { const j = opts[randInt(st, opts.length)]; empty(st, j); st.choc[j] = 1; out.spread = j; }
  }
  st.chocHit = false;
  if (!findMoves(st, 1).length) out.shuffled = shuffle(st);
  return out;
}
export function resolveAll(st) {
  const evs = [];
  let e; while ((e = step(st))) evs.push(e);
  evs.push({ phase: 'end', ...endMove(st) });
  return evs;
}

// Shuffle the plain candies until there is a move and no ready-made match.
export function shuffle(st) {
  const cells = []; for (let i = 0; i < st.n; i++) if (movable(st, i) && st.kind[i] === CANDY && st.s[i] === PLAIN) cells.push(i);
  const cols = cells.map((i) => st.c[i]);
  for (let t = 0; t < 300; t++) {
    for (let k = cols.length - 1; k > 0; k--) { const j = randInt(st, k + 1); [cols[k], cols[j]] = [cols[j], cols[k]]; }
    if (t > 150) for (let k = 0; k < cols.length; k++) cols[k] = randInt(st, st.colours); // fall back to new colours
    cells.forEach((i, k) => { st.c[i] = cols[k]; });
    if (!findGroups(st).length && findMoves(st, 1).length) return true;
  }
  return true;
}

// ---------- boosters ----------
// The lollipop hammer breaks one cell (a candy, a lock or a layer of a blocker) without using a move.
export function hammer(st, i) {
  if (!st.cell[i]) return false;
  if (!(st.lock[i] || blocked(st, i) || (st.kind[i] !== NONE && st.kind[i] !== ING))) return false;
  st.pending = { type: 'party', cells: [i] }; st.cascade = 0; st.chocHit = true; st.settled = false; st.phaseNext = 'clear';
  return true;
}

// End of level: each move left turns a candy into a striped treat that goes off.
export function partyStep(st) {
  if (st.moves > 0) {
    const opts = []; for (let i = 0; i < st.n; i++) if (movable(st, i) && st.kind[i] === CANDY && st.s[i] === PLAIN) opts.push(i);
    st.moves--;
    if (!opts.length) return { converted: [] };
    const i = opts[randInt(st, opts.length)];
    st.s[i] = rand(st) < 0.5 ? STRIPE_H : STRIPE_V;
    st.pending = { type: 'party', cells: [i] }; st.cascade = 0; st.settled = false; st.phaseNext = 'clear';
    return { converted: [{ i, s: st.s[i] }] };
  }
  const left = []; for (let i = 0; i < st.n; i++) if (st.cell[i] && isSpecial(st, i) || (st.kind[i] === CANDY && st.s[i] === PRIMED)) left.push(i);
  if (!left.length) return null;
  st.pending = { type: 'party', cells: left }; st.cascade = 0; st.settled = false; st.phaseNext = 'clear';
  return { converted: [] };
}

// ---------- goals ----------
export const jellyLeft = (st) => st.jelly.reduce((a, v, i) => a + (st.cell[i] ? v : 0), 0);
export const frostLeft = (st) => st.frost.reduce((a, v, i) => a + (st.cell[i] && v ? 1 : 0), 0);
export const chocLeft = (st) => st.choc.reduce((a, v, i) => a + (st.cell[i] && v ? 1 : 0), 0);
// How much of each part of the goal is still to do.
export function goalStatus(st) {
  const g = st.goal, out = [];
  if (g.score) out.push({ type: 'score', need: g.score, have: st.score, done: st.score >= g.score });
  if (g.jelly) { const l = jellyLeft(st); out.push({ type: 'jelly', left: l, done: l === 0 }); }
  if (g.frost) { const l = frostLeft(st); out.push({ type: 'frost', left: l, done: l === 0 }); }
  if (g.choc) { const l = chocLeft(st); out.push({ type: 'choc', left: l, done: l === 0 }); }
  if (g.ing) out.push({ type: 'ing', need: g.ing, have: st.ingGot, left: Math.max(0, g.ing - st.ingGot), done: st.ingGot >= g.ing });
  if (g.collect) for (const [c, n] of Object.entries(g.collect)) out.push({ type: 'collect', c: +c, need: n, have: st.collected[+c], left: Math.max(0, n - st.collected[+c]), done: st.collected[+c] >= n });
  return out;
}
export const goalDone = (st) => goalStatus(st).every((x) => x.done);
export function starsFor(st, stars) { return goalDone(st) ? (st.score >= stars[2] ? 3 : st.score >= stars[1] ? 2 : 1) : 0; }

// ---------- a simple player, used to tune and check levels ----------
// Tries every legal move on a copy of the board and picks the one that helps the goal most, with a little randomness.
export function botMove(st, rng = Math.random, greed = 0.85) {
  const moves = findMoves(st);
  if (!moves.length) return null;
  if (rng() > greed) return moves[Math.floor(rng() * moves.length)];
  let best = null, bestV = -Infinity;
  const before = progress(st);
  for (const m of moves) {
    const t = cloneState(st);
    trySwap(t, m[0], m[1]);
    let e, steps = 0; while ((e = step(t)) && steps++ < 60);
    const v = progress(t) - before + rng() * 30;
    if (v > bestV) { bestV = v; best = m; }
  }
  return best;
}
function progress(st) {
  const g = st.goal; let v = st.score * 0.05;
  if (g.jelly) v -= jellyLeft(st) * 60;
  if (g.frost) v -= frostLeft(st) * 50;
  if (g.choc) v -= chocLeft(st) * 70;
  if (g.collect) for (const [c, n] of Object.entries(g.collect)) v += Math.min(n, st.collected[+c]) * 25;
  if (g.ing) {
    v += st.ingGot * 600;
    for (let i = 0; i < st.n; i++) if (st.kind[i] === ING) v += ((i / st.w) | 0) * 40;
  }
  for (let i = 0; i < st.n; i++) if (isSpecial(st, i)) v += 25;
  return v;
}
// Play a whole level. Returns {won, moves, score}.
export function botPlay(level, seed, botSeed, { maxMoves = null, greed = 0.85 } = {}) {
  const st = createState(level, seed);
  if (maxMoves) st.moves = maxMoves;
  const rng = mulberry32(botSeed);
  let guard = 0;
  while (st.moves > 0 && !goalDone(st) && guard++ < 400) {
    const m = botMove(st, rng, greed);
    if (!m) { shuffle(st); continue; }
    trySwap(st, m[0], m[1]);
    resolveAll(st);
  }
  return { won: goalDone(st), moves: st.movesUsed, score: st.score, st };
}
