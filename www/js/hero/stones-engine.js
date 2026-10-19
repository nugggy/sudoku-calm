// Infinity Stones quest: the six world puzzles' rules, with no browser dependencies (tools/test-hero.mjs checks them).
import { rngOf } from './match-engine.js';

// ---------- Sliding tiles (3x3, 0 = gap) ----------
export function slideStart(seed, n = 3, steps = 80) {
  const rng = rngOf(seed), b = [...Array(n * n)].map((_, i) => (i + 1) % (n * n));
  let gap = n * n - 1, prev = -1;
  for (let s = 0; s < steps; s++) {
    const r = Math.floor(gap / n), c = gap % n, opts = [];
    if (r > 0) opts.push(gap - n); if (r < n - 1) opts.push(gap + n); if (c > 0) opts.push(gap - 1); if (c < n - 1) opts.push(gap + 1);
    const pick = opts.filter((o) => o !== prev); const o = pick[(rng() * pick.length) | 0];
    b[gap] = b[o]; b[o] = 0; prev = gap; gap = o;
  }
  if (slideSolved(b)) return slideStart(seed + 1, n, steps);
  return b;
}
export const slideSolved = (b) => b.every((v, i) => v === (i + 1) % b.length);
export function slideMove(b, i, n = 3) {
  const gap = b.indexOf(0), r = Math.floor(i / n), c = i % n, gr = Math.floor(gap / n), gc = gap % n;
  if (Math.abs(r - gr) + Math.abs(c - gc) !== 1) return false;
  b[gap] = b[i]; b[i] = 0; return true;
}
// Fewest moves (breadth-first), for the star target.
export function slideBest(b, n = 3) {
  const goal = b.map((_, i) => (i + 1) % b.length).join(','), seen = new Set([b.join(',')]);
  let front = [b.slice()];
  for (let d = 0; front.length; d++) {
    const next = [];
    for (const s of front) {
      if (s.join(',') === goal) return d;
      const gap = s.indexOf(0), r = Math.floor(gap / n), c = gap % n;
      for (const o of [r > 0 && gap - n, r < n - 1 && gap + n, c > 0 && gap - 1, c < n - 1 && gap + 1]) {
        if (o === false) continue;
        const t = s.slice(); t[gap] = t[o]; t[o] = 0; const k = t.join(',');
        if (!seen.has(k)) { seen.add(k); next.push(t); }
      }
    }
    front = next;
  }
  return -1;
}

// ---------- Lights out (5x5): press an orb to flip it and its four neighbours; switch every orb off ----------
export function lightsStart(seed, n = 5, presses = 7) {
  const rng = rngOf(seed), b = new Array(n * n).fill(0), used = new Set();
  while (used.size < presses) used.add((rng() * n * n) | 0);
  for (const i of used) lightsPress(b, i, n);
  return { board: b, presses: used.size };
}
export function lightsPress(b, i, n = 5) {
  const r = Math.floor(i / n), c = i % n;
  for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < n && cc < n) b[rr * n + cc] ^= 1; }
}
export const lightsSolved = (b) => b.every((v) => !v);

// ---------- Pipes (5x5): rotate tiles so energy flows from the left of the top-left... to the stone ----------
// Each tile is a bitmask of openings: 1 up, 2 right, 4 down, 8 left. rot turns it clockwise.
export const rotate = (m, k = 1) => { for (let i = 0; i < k; i++) m = ((m << 1) | (m >> 3)) & 15; return m; };
const DIRS = [[1, -1, 0, 4], [2, 0, 1, 8], [4, 1, 0, 1], [8, 0, -1, 2]]; // bit, dr, dc, opposite bit
export function pipesStart(seed, n = 5) {
  const rng = rngOf(seed);
  // random spanning tree over the grid (depth first), entry on the left of row 0... source (2, -1), sink (2, n)
  const open = new Array(n * n).fill(0), seen = new Array(n * n).fill(false);
  const stack = [[Math.floor(n / 2), 0]]; seen[Math.floor(n / 2) * n] = true;
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const opts = DIRS.filter(([, dr, dc]) => { const rr = r + dr, cc = c + dc; return rr >= 0 && cc >= 0 && rr < n && cc < n && !seen[rr * n + cc]; });
    if (!opts.length) { stack.pop(); continue; }
    const [bit, dr, dc, opp] = opts[(rng() * opts.length) | 0];
    open[r * n + c] |= bit; open[(r + dr) * n + c + dc] |= opp; seen[(r + dr) * n + c + dc] = true; stack.push([r + dr, c + dc]);
  }
  const mid = Math.floor(n / 2);
  open[mid * n] |= 8; open[mid * n + n - 1] |= 2; // source on the left, stone on the right
  const solution = open.slice();
  const tiles = open.map((m) => rotate(m, 1 + ((rng() * 3) | 0)));
  return { tiles, solution, n };
}
// Cells reached by energy flowing in from the left of the middle row.
export function pipesFlow(tiles, n) {
  const mid = Math.floor(n / 2), lit = new Set();
  if (!(tiles[mid * n] & 8)) return lit;
  const q = [mid * n]; lit.add(mid * n);
  while (q.length) {
    const i = q.shift(), r = Math.floor(i / n), c = i % n;
    for (const [bit, dr, dc, opp] of DIRS) {
      if (!(tiles[i] & bit)) continue;
      const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      const j = rr * n + cc; if (!(tiles[j] & opp) || lit.has(j)) continue;
      lit.add(j); q.push(j);
    }
  }
  return lit;
}
export const pipesSolved = (tiles, n) => { const mid = Math.floor(n / 2), lit = pipesFlow(tiles, n); return lit.has(mid * n + n - 1) && (tiles[mid * n + n - 1] & 2) && lit.size === n * n; };

// ---------- Sokoban (Time Stone): push both relics onto the glyphs ----------
// # wall, . glyph, $ relic, * relic on glyph, @ player, + player on glyph
export const SOKO = [
  '#######',
  '#.    #',
  '#.##$ #',
  '#  $  #',
  '# #@# #',
  '#     #',
  '#######',
];
export function sokoParse(rows = SOKO) {
  const w = rows[0].length, h = rows.length, walls = new Set(), goals = new Set(), boxes = new Set();
  let player = 0;
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    const i = r * w + c;
    if (ch === '#') walls.add(i);
    if (ch === '.' || ch === '*' || ch === '+') goals.add(i);
    if (ch === '$' || ch === '*') boxes.add(i);
    if (ch === '@' || ch === '+') player = i;
  }));
  return { w, h, walls, goals, boxes, player };
}
// One step: d is 'u' 'd' 'l' 'r'. Returns a new state, or null if blocked.
export function sokoStep(s, d) {
  const off = { u: -s.w, d: s.w, l: -1, r: 1 }[d], to = s.player + off;
  if (s.walls.has(to)) return null;
  const boxes = new Set(s.boxes);
  if (boxes.has(to)) { const b2 = to + off; if (s.walls.has(b2) || boxes.has(b2)) return null; boxes.delete(to); boxes.add(b2); }
  return { ...s, boxes, player: to };
}
export const sokoSolved = (s) => [...s.boxes].every((b) => s.goals.has(b));
// Fewest pushes and steps (breadth first over player + boxes). -> number of steps, or -1.
export function sokoBest(s = sokoParse()) {
  const key = (x) => `${x.player}|${[...x.boxes].sort((a, b) => a - b).join(',')}`;
  const seen = new Set([key(s)]); let front = [s];
  for (let d = 0; front.length && d < 200; d++) {
    const next = [];
    for (const x of front) {
      if (sokoSolved(x)) return d;
      for (const dir of 'udlr') { const y = sokoStep(x, dir); if (!y) continue; const k = key(y); if (!seen.has(k)) { seen.add(k); next.push(y); } }
    }
    front = next;
  }
  return -1;
}

// ---------- Memory (Soul Stone): 4x4 cards, 8 pairs ----------
export function memoryDeal(seed, pairs = 8) {
  const rng = rngOf(seed), cards = [...Array(pairs * 2)].map((_, i) => i % pairs);
  for (let i = cards.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards;
}

// ---------- Pattern (Mind Stone): repeat the flashing sequence ----------
export function patternSeq(seed, len = 7, pads = 6) { const rng = rngOf(seed); return [...Array(len)].map(() => (rng() * pads) | 0); }
