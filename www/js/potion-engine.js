// Potion Pour engine: flasks of coloured layers, pour rules, a solver and a level generator.
// Shared by the game screen and tools/gen-potion.mjs, so it has no browser dependencies.
import { mulberry32 } from './sudoku-engine.js';

export const CAP = 4;

// A flask is an array of colour indexes, bottom first.
export const topRun = (f) => { if (!f.length) return { c: -1, n: 0 }; const c = f[f.length - 1]; let n = 1; while (n < f.length && f[f.length - 1 - n] === c) n++; return { c, n }; };
export const canPour = (s, a, b) => { if (a === b || !s[a].length || s[b].length >= CAP) return false; return !s[b].length || s[b][s[b].length - 1] === s[a][s[a].length - 1]; };
export const pourCount = (s, a, b) => (canPour(s, a, b) ? Math.min(topRun(s[a]).n, CAP - s[b].length) : 0);
export function pour(s, a, b) {
  const n = pourCount(s, a, b), c = s[a][s[a].length - 1];
  for (let i = 0; i < n; i++) { s[a].pop(); s[b].push(c); }
  return n;
}
export const isFull = (f) => f.length === CAP && f.every((x) => x === f[0]);
export const isSolved = (s) => s.every((f) => !f.length || isFull(f));
const key = (s) => s.map((f) => f.join(',')).sort().join('|');

// Useful moves only: never pour a finished flask, never move a whole single-colour flask into an empty one,
// and treat all empty flasks as the same target.
function moves(s) {
  const out = [];
  for (let a = 0; a < s.length; a++) {
    if (!s[a].length || isFull(s[a])) continue;
    const run = topRun(s[a]);
    let emptyDone = false;
    for (let b = 0; b < s.length; b++) {
      if (!canPour(s, a, b)) continue;
      if (!s[b].length) { if (emptyDone || run.n === s[a].length) continue; emptyDone = true; }
      const n = Math.min(run.n, CAP - s[b].length);
      // prefer moves that finish a colour or clear a flask, then pours onto colour, then into empties
      out.push([a, b, (s[b].length ? 10 : 0) + (n === run.n ? 4 : 0) + (run.n === s[a].length ? 3 : 0) + n]);
    }
  }
  return out.sort((x, y) => y[2] - x[2]);
}

// Depth-first search with a memo of seen positions. Returns the move list, or null when there is none
// (or the node limit runs out). `stats.nodes` reports the work done, which the generator uses as a grade.
export function solve(start, { limit = 200000, ordered = true, stats = {} } = {}) {
  const seen = new Set(); const path = []; let nodes = 0;
  function dfs(s) {
    if (isSolved(s)) return true;
    const k = key(s); if (seen.has(k)) return false; seen.add(k);
    if (++nodes > limit) return false;
    let ms = moves(s);
    if (!ordered) ms = ms.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    for (const [a, b] of ms) {
      const t = s.map((f) => f.slice()); pour(t, a, b);
      path.push([a, b]);
      if (dfs(t)) return true;
      path.pop();
      if (nodes > limit) return false;
    }
    return false;
  }
  const ok = dfs(start.map((f) => f.slice()));
  stats.nodes = nodes; stats.exhausted = nodes > limit;
  return ok ? path : null;
}

// How many colours and spare flasks a level index uses. Colours rise from 3 to 12 over 520 levels.
export const PLAN = [[3, 8], [4, 12], [5, 20], [6, 30], [7, 40], [8, 50], [9, 60], [10, 70], [11, 80], [12, 150]];
export const LEVEL_COUNT = PLAN.reduce((t, p) => t + p[1], 0);
export function recipe(level) {
  let i = level;
  for (const [k, len] of PLAN) { if (i < len) return { k, spare: 2, pos: i / Math.max(1, len - 1) }; i -= len; }
  return { k: 12, spare: 2, pos: 1 };
}

// Random deal: k colours, CAP layers each, k full flasks then the spare empties.
export function deal(k, spare, rng) {
  const all = []; for (let c = 0; c < k; c++) for (let i = 0; i < CAP; i++) all.push(c);
  for (let i = all.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [all[i], all[j]] = [all[j], all[i]]; }
  const s = [...Array(k + spare)].map(() => []);
  all.forEach((c, i) => s[Math.floor(i / CAP)].push(c));
  return s;
}

// Colours are relabelled in order of first appearance from the top-left, so palettes spread nicely.
export function relabel(s) {
  const map = new Map();
  for (const f of s) for (let i = f.length - 1; i >= 0; i--) if (!map.has(f[i])) map.set(f[i], map.size);
  return s.map((f) => f.map((c) => map.get(c)));
}

// A fair deal: nothing finished at the start, no flask with three of a colour stacked, and solvable.
export function acceptable(s) {
  if (isSolved(s)) return false;
  for (const f of s) { if (isFull(f)) return false; if (f.length && topRun(f).n >= 3) return false; }
  return true;
}

// Builds candidate deals for a level and grades them by how hard an unguided search finds them.
export function candidates(level, count = 8) {
  const { k, spare } = recipe(level);
  const rng = mulberry32(90210 + level * 7919);
  const out = [];
  for (let t = 0; t < 400 && out.length < count; t++) {
    const s = deal(k, spare, rng);
    if (!acceptable(s)) continue;
    const sol = solve(s, { limit: 300000 });
    if (!sol) continue;
    const st = {}; solve(s, { limit: 40000, ordered: false, stats: st });
    out.push({ s: relabel(s), moves: sol.length, grade: st.nodes + sol.length * 20 });
  }
  return out;
}

export const encode = (s) => s.map((f) => f.map((c) => String.fromCharCode(97 + c)).join('')).join('|');
export const decode = (str) => str.split('|').map((f) => [...f].map((ch) => ch.charCodeAt(0) - 97));
