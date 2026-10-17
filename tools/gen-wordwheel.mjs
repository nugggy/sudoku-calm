// Builds www/levels/wordwheel.json: letter wheels whose words fill a small crossword.
// Words come from the common list in www/levels/words.json (SCOWL).
// Usage: node tools/gen-wordwheel.mjs [count]
import { readFileSync, writeFileSync } from 'node:fs';
import { mulberry32 } from '../www/js/sudoku-engine.js';

const W = JSON.parse(readFileSync('www/levels/words.json', 'utf8'));
const common = new Set(Object.values(W.common).flatMap((s) => s.split(' ')).filter(Boolean));
const byLen = {}; for (const w of common) (byLen[w.length] ||= []).push(w);
for (const k of Object.keys(byLen)) byLen[k].sort();
const COUNT = +(process.argv[2] || 250);

const counts = (w) => { const m = {}; for (const ch of w) m[ch] = (m[ch] || 0) + 1; return m; };
const fits = (w, pool) => { const m = { ...pool }; for (const ch of w) { if (!m[ch]) return false; m[ch]--; } return true; };
function subWords(base) {
  const pool = counts(base), out = [];
  for (let n = 3; n <= base.length; n++) for (const w of byLen[n] || []) if (fits(w, pool)) out.push(w);
  return out;
}

const plan = (i) => (i < 15 ? { n: 4, min: 3, max: 5, size: 6 } : i < 60 ? { n: 5, min: 4, max: 7, size: 7 } : i < 150 ? { n: 6, min: 6, max: 9, size: 9 } : { n: 7, min: 8, max: 12, size: 10 });

function layout(words, size, rng, max) {
  const grid = [...Array(size)].map(() => new Array(size).fill(null));
  const placed = [];
  const inside = (r, c) => r >= 0 && r < size && c >= 0 && c < size;
  const at = (r, c) => (inside(r, c) ? grid[r][c] : null);
  function can(w, r, c, dir) {
    const dr = dir === 'down' ? 1 : 0, dc = dir === 'across' ? 1 : 0;
    if (!inside(r, c) || !inside(r + dr * (w.length - 1), c + dc * (w.length - 1))) return -1;
    if (at(r - dr, c - dc) || at(r + dr * w.length, c + dc * w.length)) return -1;
    let x = 0;
    for (let k = 0; k < w.length; k++) {
      const rr = r + dr * k, cc = c + dc * k, cur = grid[rr][cc];
      if (cur) { if (cur.ch !== w[k] || cur[dir]) return -1; x++; continue; }
      if (at(rr + dc, cc + dr) || at(rr - dc, cc - dr)) return -1;
    }
    return x;
  }
  function put(w, r, c, dir) {
    const dr = dir === 'down' ? 1 : 0, dc = dir === 'across' ? 1 : 0;
    for (let k = 0; k < w.length; k++) { const rr = r + dr * k, cc = c + dc * k; grid[rr][cc] = grid[rr][cc] || { ch: w[k] }; grid[rr][cc][dir] = true; }
    placed.push({ w, r, c, dir });
  }
  const [first, ...rest] = words;
  put(first, Math.floor(size / 2), Math.floor((size - first.length) / 2), 'across');
  for (let pass = 0; pass < 3; pass++) for (const w of rest) {
    if (placed.length >= max) break;
    if (placed.some((p) => p.w === w)) continue;
    let best = null;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) for (const dir of ['across', 'down']) { const x = can(w, r, c, dir); if (x > 0 && (!best || x > best.x || (x === best.x && rng() < 0.3))) best = { r, c, dir, x }; }
    if (best) put(w, best.r, best.c, best.dir);
  }
  let r0 = size, r1 = -1, c0 = size, c1 = -1;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (grid[r][c]) { r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c); }
  return { w: c1 - c0 + 1, h: r1 - r0 + 1, words: placed.map((p) => ({ ...p, r: p.r - r0, c: p.c - c0 })) };
}

const levels = [];
const usedBases = new Set();
for (let i = 0; i < COUNT; i++) {
  const p = plan(i), rng = mulberry32(9090 + i * 541);
  let best = null;
  for (let t = 0; t < 400 && !best; t++) {
    const base = byLen[p.n][(rng() * byLen[p.n].length) | 0];
    if (usedBases.has([...base].sort().join(''))) continue;
    const subs = subWords(base);
    if (subs.length < p.min) continue;
    // the base word first (it uses every letter), then a random mix favouring longer words
    const pick = [base, ...subs.filter((w) => w !== base).sort((a, b) => (b.length - a.length) + (rng() - 0.5) * 3)];
    const L = layout(pick, p.size, rng, p.max);
    if (L.words.length >= p.min) { best = { base, L }; usedBases.add([...base].sort().join('')); }
  }
  if (!best) throw new Error('no level ' + i);
  const letters = [...best.base].sort(() => rng() - 0.5).join('');
  levels.push({ letters, w: best.L.w, h: best.L.h, words: best.L.words });
}
writeFileSync('www/levels/wordwheel.json', JSON.stringify({ version: 1, levels }));
console.log('wrote', levels.length, 'levels; examples:', levels.slice(0, 3).map((l) => l.letters + ':' + l.words.map((w) => w.w).join('/')).join('  '));
