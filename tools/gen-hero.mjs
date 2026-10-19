// Builds the Marvel Heroes level files:
//   www/js/hero/shield-levels.js    Shield Throw rooms (generated from fixed seeds, par from the greedy planner)
//   www/js/hero/lockdown-levels.js  Villain Lockdown corridors (6x6 sliding blocks, solved by the Gridlock solver)
// Usage: node tools/gen-hero.mjs [seconds for the lockdown search, default 40]
import { writeFileSync, readFileSync } from 'node:fs';
import { mulberry32 } from '../www/js/sudoku-engine.js';
import { parse, cluster, toBoard, normalise, solve, N, EXIT_ROW, LETTERS } from '../www/js/gridlock-engine.js';
import { shieldLevel, SHIELD_LEVELS } from '../www/js/hero/shield-engine.js';

// ---------- Shield Throw ----------
const shield = [];
for (let i = 0; i < SHIELD_LEVELS; i++) {
  const l = shieldLevel(i);
  const r2 = (v) => Math.round(v * 100) / 100;
  shield.push({ walls: l.walls.map((w) => w.map(r2)), drones: l.drones.map((d) => ({ x: r2(d.x), y: r2(d.y) })), par: l.par });
}
writeFileSync('www/js/hero/shield-levels.js', `// Shield Throw rooms, built by tools/gen-hero.mjs from shield-engine.js. Do not edit by hand.\nexport const SHIELD = ${JSON.stringify(shield)};\n`);
console.log('shield:', shield.map((l) => l.par).join(' '));

// ---------- Villain Lockdown ----------
const COUNT = 60, secs = +(process.argv[2] || 40);
const taken = new Set(JSON.parse(readFileSync('www/levels/gridlock.json', 'utf8')).levels.map((b) => normalise(b.slice(0, 36))));
const rng = mulberry32(777);
function randomLayout(count) {
  const g = new Array(36).fill('o');
  const red = [EXIT_ROW * N + ((rng() * 3) | 0)]; red.push(red[0] + 1); red.forEach((c) => (g[c] = 'A'));
  if (rng() < 0.3) { const w = (rng() * 36) | 0; if (g[w] === 'o' && Math.floor(w / N) !== EXIT_ROW) g[w] = 'x'; }
  let placed = 0;
  for (let tries = 0; placed < count && tries < 400; tries++) {
    const len = rng() < 0.7 ? 2 : 3, h = rng() < 0.5;
    const r = (rng() * (h ? N : N - len + 1)) | 0, c = (rng() * (h ? N - len + 1 : N)) | 0;
    if (h && r === EXIT_ROW) continue;
    const cells = [...Array(len)].map((_, k) => (h ? r * N + c + k : (r + k) * N + c));
    if (!cells.every((x) => g[x] === 'o')) continue;
    cells.forEach((x) => (g[x] = LETTERS[placed])); placed++;
  }
  return g.join('');
}
// Tweak a layout: drop a vehicle, add one, or both.
function mutate(board) {
  const g = [...board];
  const ids = [...new Set(g)].filter((c) => c !== 'o' && c !== 'A' && c !== 'x');
  const op = rng();
  if (ids.length > 4 && op < 0.55) { const gone = ids[(rng() * ids.length) | 0]; g.forEach((c, i) => { if (c === gone) g[i] = 'o'; }); }
  if (op > 0.3 || ids.length <= 4) {
    const spare = [...LETTERS].find((L) => !g.includes(L));
    for (let tries = 0; spare && tries < 60; tries++) {
      const len = rng() < 0.7 ? 2 : 3, h = rng() < 0.5;
      const r = (rng() * (h ? N : N - len + 1)) | 0, c = (rng() * (h ? N - len + 1 : N)) | 0;
      if (h && r === EXIT_ROW) continue;
      const cells = [...Array(len)].map((_, k) => (h ? r * N + c + k : (r + k) * N + c));
      if (!cells.every((x) => g[x] === 'o')) continue;
      cells.forEach((x) => (g[x] = spare)); break;
    }
  }
  return g.join('');
}
const byMoves = new Map();
const until = Date.now() + secs * 1000;
let cur = null, stale = 0;
while (Date.now() < until) {
  const board = cur && stale < 120 ? mutate(cur.board) : randomLayout(7 + ((rng() * 7) | 0));
  if (!cur || stale >= 120) { cur = null; stale = 0; }
  const { vs, pos, walls } = parse(board);
  const cl = cluster(vs, pos, walls);
  let max = -1; for (const d of cl.dist) if (d !== Infinity && d > max) max = d;
  if (max < 2) { stale++; continue; }
  if (!cur || max >= cur.max) { if (cur && max > cur.max) stale = 0; cur = { board, max }; } else stale++;
  // the hardest start, plus one easier one now and then
  for (const want of [max, 2 + ((rng() * (max - 1)) | 0)]) {
    if ((byMoves.get(want) || []).length >= 40) continue;
    const idx = []; cl.dist.forEach((x, k) => { if (x === want) idx.push(k); });
    const b = toBoard(vs, cl.states[idx[(rng() * idx.length) | 0]], walls), key = normalise(b);
    if (taken.has(key)) continue;
    taken.add(key);
    if (!byMoves.has(want)) byMoves.set(want, []);
    byMoves.get(want).push(b);
  }
}
const top = Math.max(...byMoves.keys());
console.log('lockdown pool:', [...byMoves.keys()].sort((a, b) => a - b).map((m) => `${m}:${byMoves.get(m).length}`).join(' '));
const levels = [];
for (let i = 0; i < COUNT; i++) {
  let want = Math.round(2 + (i / (COUNT - 1)) ** 1.15 * (Math.min(top, 34) - 2));
  while (want > 2 && !(byMoves.get(want) || []).length) want--;
  while (!(byMoves.get(want) || []).length) want++;
  const b = byMoves.get(want).shift();
  const { vs, pos, walls } = parse(b);
  const sol = solve(vs, pos, walls);
  if (!sol) throw new Error('unsolvable board slipped through');
  levels.push({ board: b, par: sol.length });
}
writeFileSync('www/js/hero/lockdown-levels.js', `// Villain Lockdown corridors, built by tools/gen-hero.mjs. Each board was solved by the Gridlock solver; par is the fewest moves.\nexport const LOCKDOWN = ${JSON.stringify(levels)};\n`);
console.log('lockdown pars:', levels.map((l) => l.par).join(' '));
