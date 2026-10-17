// Builds www/levels/pawgram.json from tools/pawgram-candidates.json (made by pawgram_images.py).
// Keeps only pictures that line-by-line logic can solve, uses each picture once, easiest first.
import { readFileSync, writeFileSync } from 'node:fs';
import { puzzleClues, solve } from '../www/js/pawgram-engine.js';

const cand = JSON.parse(readFileSync('tools/pawgram-candidates.json', 'utf8'));
const PLAN = [[15, 90], [10, 80], [5, 16]]; // biggest boards get first pick of pictures
const used = new Set();
const chosen = { 5: [], 10: [], 15: [] };
for (const [n, want] of PLAN) {
  const pool = [];
  for (const c of cand) {
    if (c.n !== n || used.has(c.name)) continue;
    const clues = puzzleClues(n, c.cells);
    const r = solve(n, clues);
    if (!r.solved || r.grid.join('') !== c.cells) continue;
    // interesting puzzles have many separate runs and few completely full or empty lines
    const lines = [...clues.rows, ...clues.cols];
    const blocks = lines.reduce((t, l) => t + (l[0] === 0 ? 0 : l.length), 0) / lines.length;
    const trivial = lines.filter((l) => l[0] === 0 || l[0] === n).length / lines.length;
    pool.push({ ...c, steps: r.steps, interest: blocks - 3 * trivial + (c.kind === 'dark' ? 0.3 : 0) });
  }
  // best version of each picture, then the most interesting pictures
  const best = new Map();
  for (const p of pool) if (!best.has(p.name) || best.get(p.name).interest < p.interest) best.set(p.name, p);
  const picks = [...best.values()].sort((a, b) => b.interest - a.interest).slice(0, want);
  for (const p of picks) { used.add(p.name); chosen[n].push(p); }
  console.log(`${n}x${n}: ${chosen[n].length} puzzles from ${pool.length} solvable`);
}
// Compress colours to a per-level palette.
const levels = [5, 10, 15].flatMap((n) => chosen[n].sort((a, b) => a.steps - b.steps)).map((p) => {
  const palette = [...new Set(p.colours.filter(Boolean))];
  const idx = p.colours.map((c) => (c ? (palette.indexOf(c) + 1).toString(36).padStart(2, '0') : '00')).join('');
  return { name: p.name, n: p.n, cells: p.cells, palette, idx };
});
writeFileSync('www/levels/pawgram.json', JSON.stringify({ version: 1, levels }));
console.log('wrote', levels.length, 'levels,', Math.round(JSON.stringify(levels).length / 1024), 'KB');
