// Builds www/levels/wordsearch-levels.json: the hard Word Search puzzles that follow the first 50.
// Puzzles 1 to 50 are still made on the phone by wsSpec in wordsearch-game.js; these 1,000 carry on from there,
// growing from 12×12 to 15×15 with more and longer words, more diagonal and backwards words, and look-alike
// letter traps in the filler. Every puzzle is checked: each word appears exactly once in its grid.
// Usage: node tools/gen-wordsearch.mjs          (generate)
//        node tools/gen-wordsearch.mjs --check  (re-verify the saved file)
import { writeFileSync, readFileSync } from 'node:fs';
import { mulberry32 } from '../www/js/sudoku-engine.js';

const THEMES = JSON.parse(readFileSync(new URL('../www/levels/wordsearch.json', import.meta.url), 'utf8')).themes;
const OUT = new URL('../www/levels/wordsearch-levels.json', import.meta.url);
export const FIRST = 50;   // puzzle index of the first pre-built level (wordsearch-game.js uses the same number)
const COUNT = 1000;
// Directions, in the order the saved file refers to them: across, down, then the two forward diagonals,
// then their backwards versions.
const DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
const STRAIGHT = [0, 1], DIAG = [2, 3], BACK = [4, 5], BACK_DIAG = [6, 7];
const LETTERS = 'AAABCDEEEEFGHIIIJKLMNNOOOPQRRSSTTTUUVWXYZ';
// Words the filler must never spell out by accident, in any direction.
const BLOCK = ['FUCK', 'SHIT', 'CUNT', 'PISS', 'DICK', 'COCK', 'TWAT', 'SLUT', 'WANK', 'PRICK', 'BITCH', 'ARSE', 'WHORE', 'NAZI', 'RAPE', 'PORN', 'SEX', 'FAG', 'KILL', 'DEAD'];

// Level recipe for the k-th pre-built puzzle (0 to 999): t runs from 0 to 1 across the set.
export function recipe(k) {
  const t = k / (COUNT - 1);
  return {
    size: k < 120 ? 12 : k < 350 ? 13 : k < 650 ? 14 : 15,
    count: Math.min(20, 14 + Math.floor(k / 160)),
    diag: 0.58 + 0.3 * t,        // share of words on a diagonal
    back: 0.52 + 0.28 * t,       // share of words written backwards
    lenBias: 1 + 2.5 * t,        // how strongly longer words are preferred
    decoys: 0.5 + 1.0 * t,       // look-alike fragments per word
    themeFill: 0.3 + 0.4 * t,    // share of filler letters taken from the theme's own words
  };
}

const rev = (w) => [...w].reverse().join('');

// Every place a word can be read in a grid, as a set of cell lists (a palindrome read both ways counts once).
function occurrences(grid, size, word) {
  const seen = new Set();
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (grid[r * size + c] !== word[0]) continue;
    for (const [dr, dc] of DIRS) {
      const er = r + dr * (word.length - 1), ec = c + dc * (word.length - 1);
      if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
      let k = 1;
      while (k < word.length && grid[(r + dr * k) * size + c + dc * k] === word[k]) k++;
      if (k < word.length) continue;
      const cells = [...Array(word.length)].map((_, j) => (r + dr * j) * size + c + dc * j).sort((a, b) => a - b).join(',');
      seen.add(cells);
    }
  }
  return seen;
}

function pickWords(theme, R, size, rng) {
  // weighted sample without replacement, favouring longer words more as the set goes on
  const pool = [...new Set([...theme.words, ...theme.more])].filter((w) => w.length <= size && w.length >= 3)
    .map((w) => ({ w, key: Math.pow(rng(), 1 / Math.pow(w.length, R.lenBias)) }))
    .sort((a, b) => b.key - a.key).map((x) => x.w);
  const out = [];
  for (const w of pool) {
    if (out.length >= R.count) break;
    // no word hidden inside another (STAR inside STARFISH would show up twice)
    if (out.some((o) => o.includes(w) || w.includes(o) || o.includes(rev(w)) || w.includes(rev(o)))) continue;
    out.push(w);
  }
  return out.length === R.count ? out.sort((a, b) => b.length - a.length) : null;
}

function tryPlace(grid, size, word, dirChoices, rng, tries = 400) {
  for (let t = 0; t < tries; t++) {
    const d = dirChoices[(rng() * dirChoices.length) | 0], [dr, dc] = DIRS[d];
    const r = (rng() * size) | 0, c = (rng() * size) | 0;
    const er = r + dr * (word.length - 1), ec = c + dc * (word.length - 1);
    if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
    let fits = true;
    for (let k = 0; k < word.length; k++) { const g = grid[(r + dr * k) * size + c + dc * k]; if (g && g !== word[k]) { fits = false; break; } }
    if (!fits) continue;
    for (let k = 0; k < word.length; k++) grid[(r + dr * k) * size + c + dc * k] = word[k];
    return [r, c, d];
  }
  return null;
}

function verify(lv) {
  const { n: size, g, w } = lv;
  if (g.length !== size * size || !/^[A-Z]+$/.test(g)) return 'bad grid';
  const grid = [...g];
  for (const [word, r, c, d] of w) {
    const [dr, dc] = DIRS[d];
    for (let k = 0; k < word.length; k++) {
      const rr = r + dr * k, cc = c + dc * k;
      if (rr < 0 || rr >= size || cc < 0 || cc >= size || grid[rr * size + cc] !== word[k]) return `${word} not at its spot`;
    }
    if (occurrences(grid, size, word).size !== 1) return `${word} appears more than once`;
  }
  // a blocked word is fine only when it sits wholly inside a placed word (GRAPE, PEACOCK, SKILLET)
  const wordCells = w.map(([word, r, c, d]) => new Set([...word].map((_, k) => (r + DIRS[d][0] * k) * size + c + DIRS[d][1] * k)));
  for (const b of BLOCK) {
    for (const cells of occurrences(grid, size, b)) {
      const list = cells.split(',').map(Number);
      if (!wordCells.some((s) => list.every((i) => s.has(i)))) return `spells ${b}`;
    }
  }
  return null;
}

function build(k) {
  const level = FIRST + k;
  const theme = THEMES[level % THEMES.length];
  const R = recipe(k);
  const rng = mulberry32(90210 + level * 7919);
  for (let attempt = 0; attempt < 200; attempt++) {
    const words = pickWords(theme, R, R.size, rng);
    if (!words) throw new Error(`theme ${theme.name} has too few words for level ${level + 1}`);
    const grid = new Array(R.size * R.size).fill('');
    const placed = [];
    let ok = true;
    for (const word of words) {
      const diag = rng() < R.diag, back = rng() < R.back;
      const want = diag ? (back ? BACK_DIAG : DIAG) : (back ? BACK : STRAIGHT);
      const at = tryPlace(grid, R.size, word, want, rng) || tryPlace(grid, R.size, word, [0, 1, 2, 3, 4, 5, 6, 7], rng);
      if (!at) { ok = false; break; }
      placed.push([word, ...at]);
    }
    if (!ok) continue;
    // Look-alike traps: the start of a word, or the whole word with its last letter changed, laid in the gaps.
    const decoys = Math.round(words.length * R.decoys);
    for (let i = 0; i < decoys; i++) {
      const w = words[(rng() * words.length) | 0];
      let frag;
      if (rng() < 0.5 && w.length >= 4) {
        const last = w[w.length - 1];
        let sub = last;
        while (sub === last) sub = LETTERS[(rng() * LETTERS.length) | 0];
        frag = w.slice(0, -1) + sub;
      } else frag = w.slice(0, Math.max(2, Math.min(w.length - 1, 2 + ((rng() * (w.length - 2)) | 0))));
      tryPlace(grid, R.size, frag, [0, 1, 2, 3, 4, 5, 6, 7], rng, 60);
    }
    const themeLetters = words.join('');
    const base = grid.slice();
    for (let fill = 0; fill < 40; fill++) {
      const g = base.map((ch) => ch || (rng() < R.themeFill ? themeLetters[(rng() * themeLetters.length) | 0] : LETTERS[(rng() * LETTERS.length) | 0]));
      const lv = { t: level % THEMES.length, n: R.size, g: g.join(''), w: placed };
      if (!verify(lv)) return lv;
    }
  }
  throw new Error(`could not build level ${level + 1}`);
}

function stats(levels) {
  const d = levels.flatMap((l) => l.w.map((x) => x[3]));
  const words = levels.flatMap((l) => l.w.map((x) => x[0]));
  return `${words.length} words, average length ${(words.reduce((a, w) => a + w.length, 0) / words.length).toFixed(1)}, `
    + `${Math.round((100 * d.filter((x) => [2, 3, 6, 7].includes(x)).length) / d.length)}% diagonal, ${Math.round((100 * d.filter((x) => x >= 4).length) / d.length)}% backwards`;
}

if (process.argv.includes('--check')) {
  const { first, levels } = JSON.parse(readFileSync(OUT, 'utf8'));
  let bad = 0;
  if (first !== FIRST || levels.length !== COUNT) { bad++; console.log(`expected ${COUNT} levels from ${FIRST}`); }
  levels.forEach((lv, k) => {
    const why = verify(lv) || (lv.n !== recipe(k).size ? 'wrong size' : lv.w.length !== recipe(k).count ? 'wrong word count' : null);
    if (why) { bad++; console.log(`bad level ${FIRST + k + 1}: ${why}`); }
  });
  console.log(`${levels.length} levels checked, ${bad} bad`);
  for (const [a, b] of [[0, 120], [120, 350], [350, 650], [650, 1000]]) console.log(`levels ${FIRST + a + 1} to ${FIRST + b}: ${levels[a].n}×${levels[a].n}, ${stats(levels.slice(a, b))}`);
  process.exit(bad ? 1 : 0);
} else {
  const levels = [];
  for (let k = 0; k < COUNT; k++) {
    levels.push(build(k));
    if (k % 100 === 0) console.log(`level ${FIRST + k + 1}: ${levels[k].n}×${levels[k].n}, ${levels[k].w.length} words`);
  }
  writeFileSync(OUT, '{"version":1,"first":' + FIRST + ',"levels":[\n' + levels.map((l) => JSON.stringify(l)).join(',\n') + '\n]}\n');
  console.log(`wrote ${levels.length} levels: ${stats(levels)}`);
}
