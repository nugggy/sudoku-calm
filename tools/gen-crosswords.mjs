// Builds www/levels/crosswords.json from tools/crossword-bank.txt (WORD|clue per line).
// Each puzzle is a freeform crossword: interlocking words, no two words side by side.
// Usage: node tools/gen-crosswords.mjs [count]
import { readFileSync, writeFileSync } from 'node:fs';
import { mulberry32 } from '../www/js/sudoku-engine.js';

const bank = readFileSync('tools/crossword-bank.txt', 'utf8').trim().split(/\r?\n/).map((l) => l.split('|')).filter(([w, c]) => w && c && /^[A-Z]+$/.test(w));
const COUNT = +(process.argv[2] || 150);

// puzzle size and word count rise with the level
const plan = (i) => (i < 40 ? { size: 7, min: 6, max: 8 } : i < 100 ? { size: 9, min: 9, max: 12 } : { size: 11, min: 12, max: 16 });

function tryBuild(rng, { size, min, max }, usedRecently) {
  const pool = bank.filter(([w]) => w.length <= size && !usedRecently.has(w)).sort(() => rng() - 0.5);
  const grid = [...Array(size)].map(() => new Array(size).fill(null));
  const placed = [];
  const inside = (r, c) => r >= 0 && r < size && c >= 0 && c < size;
  const cellAt = (r, c) => (inside(r, c) ? grid[r][c] : null);

  function canPlace(w, r, c, dir) {
    const dr = dir === 'down' ? 1 : 0, dc = dir === 'across' ? 1 : 0;
    const er = r + dr * (w.length - 1), ec = c + dc * (w.length - 1);
    if (!inside(r, c) || !inside(er, ec)) return -1;
    if (cellAt(r - dr, c - dc) || cellAt(er + dr, ec + dc)) return -1; // no letter right before or after
    let crossings = 0;
    for (let k = 0; k < w.length; k++) {
      const rr = r + dr * k, cc = c + dc * k, cur = grid[rr][cc];
      if (cur) { if (cur.ch !== w[k] || cur[dir]) return -1; crossings++; continue; }
      // empty cell: the neighbours beside it (across the word) must be empty, so words never touch side by side
      if (cellAt(rr + dc, cc + dr) || cellAt(rr - dc, cc - dr)) return -1;
    }
    return crossings;
  }
  function place(w, clue, r, c, dir) {
    const dr = dir === 'down' ? 1 : 0, dc = dir === 'across' ? 1 : 0;
    for (let k = 0; k < w.length; k++) {
      const rr = r + dr * k, cc = c + dc * k;
      grid[rr][cc] = grid[rr][cc] || { ch: w[k] };
      grid[rr][cc][dir] = true;
    }
    placed.push({ word: w, clue, r, c, dir });
  }

  // start with a longish word across the middle
  const first = pool.find(([w]) => w.length >= Math.min(6, size - 1));
  if (!first) return null;
  place(first[0], first[1], Math.floor(size / 2), Math.floor((size - first[0].length) / 2), 'across');
  const used = new Set([first[0]]);
  for (let pass = 0; pass < 3 && placed.length < max; pass++) {
    for (const [w, clue] of pool) {
      if (placed.length >= max) break;
      if (used.has(w)) continue;
      let best = null;
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) for (const dir of ['across', 'down']) {
        const x = canPlace(w, r, c, dir);
        if (x > 0 && (!best || x > best.x || (x === best.x && rng() < 0.3))) best = { r, c, dir, x };
      }
      if (best) { place(w, clue, best.r, best.c, best.dir); used.add(w); }
    }
  }
  if (placed.length < min) return null;

  // crop to the letters actually used
  let r0 = size, r1 = -1, c0 = size, c1 = -1;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (grid[r][c]) { r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c); }
  const entries = placed.map((p) => ({ ...p, r: p.r - r0, c: p.c - c0 }));
  // number the starting squares, reading left to right, top to bottom
  const starts = [...new Set(entries.map((e) => e.r * 100 + e.c))].sort((a, b) => a - b);
  entries.forEach((e) => { e.num = starts.indexOf(e.r * 100 + e.c) + 1; });
  entries.sort((a, b) => (a.dir === b.dir ? a.num - b.num : a.dir === 'across' ? -1 : 1));
  const crossings = entries.reduce((t, e) => t, 0) + placed.length;
  return { w: c1 - c0 + 1, h: r1 - r0 + 1, entries, score: crossings };
}

const puzzles = [];
const recent = [];
for (let i = 0; i < COUNT; i++) {
  const rng = mulberry32(4242 + i * 977);
  let best = null;
  for (let t = 0; t < 60; t++) {
    const p = tryBuild(rng, plan(i), new Set(recent.flat()));
    if (p && (!best || p.entries.length > best.entries.length)) best = p;
    if (best && best.entries.length >= plan(i).max) break;
  }
  if (!best) throw new Error('could not build puzzle ' + i);
  puzzles.push({ w: best.w, h: best.h, entries: best.entries.map(({ word, clue, r, c, dir, num }) => ({ word, clue, r, c, dir, num })) });
  recent.push(best.entries.map((e) => e.word)); if (recent.length > 3) recent.shift(); // avoid repeats in back-to-back puzzles
}
writeFileSync('www/levels/crosswords.json', JSON.stringify({ version: 1, puzzles }));
const sizes = puzzles.map((p) => `${p.w}x${p.h}/${p.entries.length}`);
console.log('wrote', puzzles.length, 'crosswords. First:', sizes.slice(0, 3).join(' '), 'Last:', sizes.slice(-3).join(' '));
