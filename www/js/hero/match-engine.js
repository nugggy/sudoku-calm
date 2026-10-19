// Power Match engine: an n x n board of gem kinds (0..k-1), matches of three or more in a line, gravity and refills.
// No browser dependencies, so tools/test-hero.mjs can check it.
export function rngOf(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// board[r][c] = kind, or -1 for empty
export function findMatches(b) {
  const n = b.length, hit = new Set();
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const k = b[r][c]; if (k < 0) continue;
    if (c + 2 < n && b[r][c + 1] === k && b[r][c + 2] === k) { let e = c; while (e < n && b[r][e] === k) hit.add(r * n + e++); }
    if (r + 2 < n && b[r + 1][c] === k && b[r + 2][c] === k) { let e = r; while (e < n && b[e][c] === k) hit.add(e++ * n + c); }
  }
  return hit;
}
const swapped = (b, r1, c1, r2, c2) => { const x = b.map((row) => row.slice()); [x[r1][c1], x[r2][c2]] = [x[r2][c2], x[r1][c1]]; return x; };
export const swapMakesMatch = (b, r1, c1, r2, c2) => findMatches(swapped(b, r1, c1, r2, c2)).size > 0;
// One swap that makes a match, or null.
export function findMove(b) {
  const n = b.length;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (c + 1 < n && swapMakesMatch(b, r, c, r, c + 1)) return [r, c, r, c + 1];
    if (r + 1 < n && swapMakesMatch(b, r, c, r + 1, c)) return [r, c, r + 1, c];
  }
  return null;
}
// A fresh board with no matches showing and at least one move.
export function newBoard(rng, n = 8, k = 6) {
  for (;;) {
    const b = [];
    for (let r = 0; r < n; r++) {
      b.push([]);
      for (let c = 0; c < n; c++) {
        let v, tries = 0;
        do { v = (rng() * k) | 0; tries++; } while (tries < 20 && ((c >= 2 && b[r][c - 1] === v && b[r][c - 2] === v) || (r >= 2 && b[r - 1][c] === v && b[r - 2][c] === v)));
        b[r].push(v);
      }
    }
    if (!findMatches(b).size && findMove(b)) return b;
  }
}
// Removes the given cells, lets gems fall and fills from the top. Returns the falls: [{c, from, to, kind}] (from < 0 = new).
export function collapse(b, cells, rng, k) {
  const n = b.length, falls = [];
  for (const i of cells) b[Math.floor(i / n)][i % n] = -1;
  for (let c = 0; c < n; c++) {
    let w = n - 1;
    for (let r = n - 1; r >= 0; r--) if (b[r][c] >= 0) { if (w !== r) { b[w][c] = b[r][c]; b[r][c] = -1; falls.push({ c, from: r, to: w, kind: b[w][c] }); } w--; }
    let src = -1;
    for (let r = w; r >= 0; r--) { b[r][c] = (rng() * k) | 0; falls.push({ c, from: src--, to: r, kind: b[r][c] }); }
  }
  return falls;
}
// Shuffles in place until there is a move and no match.
export function shuffle(b, rng) {
  const n = b.length, flat = b.flat();
  for (let tries = 0; tries < 200; tries++) {
    for (let i = flat.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [flat[i], flat[j]] = [flat[j], flat[i]]; }
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) b[r][c] = flat[r * n + c];
    if (!findMatches(b).size && findMove(b)) return true;
  }
  return false;
}

// Level goals. Levels alternate between reaching a score and collecting gems of one or two kinds.
export const MATCH_LEVELS = 30;
export function matchLevel(i) {
  const r = rngOf(9001 + i * 31);
  const moves = 22 + Math.round(r() * 6) - Math.floor(i / 6);
  const kinds = i < 4 ? 5 : 6;
  if (i % 3 === 1) { const a = (r() * kinds) | 0; return { kinds, moves, goal: 'collect', want: [{ kind: a, n: 14 + i }] }; }
  if (i % 3 === 2 && i > 4) { const a = (r() * kinds) | 0, b = (a + 1 + ((r() * (kinds - 1)) | 0)) % kinds; return { kinds, moves, goal: 'collect', want: [{ kind: a, n: 10 + Math.floor(i * 0.6) }, { kind: b, n: 10 + Math.floor(i * 0.6) }] }; }
  return { kinds, moves, goal: 'score', target: 2500 + i * 320 };
}
