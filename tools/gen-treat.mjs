// Builds the Treat Twist levels into www/levels/treat.json.
//   node tools/gen-treat.mjs            all 120 levels
//   node tools/gen-treat.mjs 1 20       just levels 1 to 20 (merged into the existing file)
// Each level is designed from its number (board shape, blockers, goal), then the bot in treat-engine.js plays it
// many times: the move limit is set so the bot wins a set share of games (most early on, fewer later), and the
// star scores come from how well it did. tools/test-treat.mjs replays the check games to prove every level can be won.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createState, botPlay } from '../www/js/treat-engine.js';
import { mulberry32 } from '../www/js/sudoku-engine.js';

export const COUNT = 120, WORLD = 15;
export const CHECK_RUNS = 4; // the test replays these games; at least one must win
const OUT = new URL('../www/levels/treat.json', import.meta.url);

// ---------- board shapes ----------
// Every column is one unbroken run of cells, so candies always have a way down.
const SHAPES = {
  square: (w, h) => grid(w, h, () => true),
  rounded: (w, h) => grid(w, h, (x, y) => !((x === 0 || x === w - 1) && (y === 0 || y === h - 1))),
  diamond: (w, h) => { const cx = (w - 1) / 2; return grid(w, h, (x, y) => { const d = Math.abs(x - cx); return y >= Math.max(0, Math.round(d - 1.5)) && y <= h - 1 - Math.max(0, Math.round(d - 1.5)); }); },
  plus: (w, h) => grid(w, h, (x, y) => { const edge = x < 2 || x > w - 3; return !edge || (y >= 2 && y <= h - 3); }),
  bowl: (w, h) => grid(w, h, (x, y) => { const d = Math.min(x, w - 1 - x); return y >= Math.max(0, 3 - d * 1.5); }),
  tower: (w, h) => grid(w, h, (x, y) => { const d = Math.min(x, w - 1 - x); return y >= Math.max(0, 3 - d); }),
  heart: (w, h) => grid(w, h, (x, y) => { const cx = (w - 1) / 2, d = Math.abs(x - cx); if (y < 1 && (d < 1 || d > 3)) return false; return y <= h - 1 - Math.max(0, Math.round(d - 1.5)); }),
  arch: (w, h) => grid(w, h, (x, y) => { const mid = x >= 3 && x <= w - 4; return !mid || y <= h - 3; }),
};
function grid(w, h, f) { return [...Array(h)].map((_, y) => [...Array(w)].map((_, x) => (f(x, y) ? '.' : '#')).join('')); }

// ---------- designing a level ----------
const set = (rows, x, y, ch) => { if (rows[y][x] === '#') return; rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1); };
const mirror = (w, fn) => (x, y) => { fn(x, y); fn(w - 1 - x, y); };

function design(i, scale = 1) {
  const n = i + 1, world = Math.floor(i / WORLD), inWorld = i % WORLD;
  const rng = mulberry32(9001 + i * 7717);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  // board size grows over the first levels
  const w = n <= 3 ? 7 : n <= 8 ? 8 : 9, h = n <= 3 ? 7 : n <= 8 ? 8 : 9;
  const shapeName = n <= 5 ? 'square' : pick(n < 20 ? ['square', 'rounded', 'diamond', 'bowl'] : Object.keys(SHAPES));
  const rows = SHAPES[shapeName](w, h);
  const jelly = rows.map((r) => r.replace(/[^#]/g, '.'));
  const colours = n <= 12 ? 5 : n <= 30 ? (rng() < 0.4 ? 6 : 5) : (rng() < 0.75 ? 6 : 5);
  const lv = { n, w, h, shape: shapeName, colours, goal: {}, rows, jelly, ingMax: 2 };
  // which goal: new ideas are introduced one at a time, then mixed
  let kind;
  if (n <= 3) kind = 'score';
  else if (n <= 5) kind = 'collect';
  else if (n <= 9) kind = 'jelly';
  else if (n <= 13) kind = 'frost';
  else if (n <= 15) kind = 'jellycollect';
  else if (n <= 20) kind = 'ing';
  else if (n <= 25) kind = pick(['jelly', 'collect']);
  else if (n <= 30) kind = 'jelly2';
  else if (n <= 35) kind = 'frost';
  else if (n <= 40) kind = 'choc';
  else kind = ['jelly', 'collect', 'ing', 'frost', 'choc', 'score', 'jellying', 'jelly2', 'frostcollect', 'ingcollect'][(i * 7 + world) % 10];
  lv.kind = kind;
  const level = world * 0.6 + inWorld * 0.08; // difficulty within the set
  const cellsOf = () => { const o = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[y][x] === '.') o.push([x, y]); return o; };

  const addJelly = (layers) => {
    const style = pick(['all', 'middle', 'rows', 'ring', 'cross']);
    for (const [x, y] of cellsOf()) {
      const cx = Math.abs(x - (w - 1) / 2), cy = Math.abs(y - (h - 1) / 2);
      const on = style === 'all' ? true : style === 'middle' ? cx <= 2.5 && cy <= 2.5 : style === 'rows' ? y >= h - 4 || y <= 1 : style === 'ring' ? cx >= 2.5 || cy >= 2.5 : cx <= 1 || cy <= 1;
      if (on && rng() < Math.min(1, 0.5 * scale)) set(jelly, x, y, String(layers === 2 && (cx + cy) % 2 < 1.5 ? 2 : 1));
    }
  };
  const addFrost = (maxLayer, amount) => {
    const style = pick(['band', 'corners', 'middle', 'columns']);
    const opts = cellsOf().filter(([x, y]) => {
      if (y < 2) return false; // keep the top open so candies keep coming
      const cx = Math.abs(x - (w - 1) / 2), cy = Math.abs(y - (h - 1) / 2);
      return style === 'band' ? y === h - 3 || y === h - 4 : style === 'corners' ? cx >= 2.5 && y >= h - 3 : style === 'middle' ? cx <= 1.5 && cy <= 1.5 : (x === 2 || x === w - 3) && y >= 3;
    });
    const take = opts.slice(0, Math.max(2, Math.round(opts.length * Math.min(1, amount * scale))));
    for (const [x, y] of take) set(rows, x, y, String(Math.min(3, 1 + Math.floor(rng() * maxLayer * Math.min(1.5, scale)))));
  };
  const addLocks = (k) => {
    const opts = cellsOf().filter(([x, y]) => x < w / 2 && y >= 2);
    for (let t = 0; t < k && opts.length; t++) { const [x, y] = opts.splice(Math.floor(rng() * opts.length), 1)[0]; mirror(w, (a, b) => set(rows, a, b, 'L'))(x, y); }
  };
  const addChoc = (k) => {
    const opts = cellsOf().filter(([x, y]) => y >= h - 3 && x < w / 2);
    for (let t = 0; t < k && opts.length; t++) { const [x, y] = opts.splice(Math.floor(rng() * opts.length), 1)[0]; mirror(w, (a, b) => set(rows, a, b, 'C'))(x, y); }
  };
  const collect = (count, amt) => {
    const cs = []; while (cs.length < count) { const c = Math.floor(rng() * colours); if (!cs.includes(c)) cs.push(c); }
    lv.goal.collect = Object.fromEntries(cs.map((c, k) => [c, Math.round(amt * (k ? 0.8 : 1))]));
  };
  const amt = Math.round((14 + level * 4) * scale);
  if (kind === 'score') lv.goal.score = 1; // the target is set after playing it
  if (kind === 'collect') collect(n <= 5 ? 1 : 2, amt);
  if (kind === 'jelly' || kind === 'jellycollect' || kind === 'jellying') { addJelly(1); lv.goal.jelly = true; }
  if (kind === 'jelly2') { addJelly(2); lv.goal.jelly = true; }
  if (kind === 'jellycollect') collect(1, Math.round(amt * 0.7));
  if (kind === 'frost' || kind === 'frostcollect') { addFrost(n <= 13 ? 1 : Math.min(3, 1 + Math.floor(level / 1.5)), Math.min(0.9, 0.5 + level * 0.06)); lv.goal.frost = true; }
  if (kind === 'frostcollect') collect(1, Math.round(amt * 0.6));
  if (kind === 'ing' || kind === 'jellying' || kind === 'ingcollect') lv.goal.ing = Math.max(1, Math.min(5, Math.round((1 + n / 30 + (kind === 'ing' ? 1 : 0)) * scale)));
  if (kind === 'ingcollect') collect(1, Math.round(amt * 0.6));
  if (kind === 'choc') { addChoc(Math.max(1, Math.min(4, Math.round((n <= 40 ? 1 : 1.5 + level / 4) * scale)))); if (scale > 1.4) addFrost(2, 0.3 * scale); lv.goal.choc = true; }
  // extra blockers on later levels make them busier
  if (n >= 21 && n <= 25) addLocks(2);
  if (n > 40 && rng() < 0.5) addLocks(1 + Math.floor(rng() * 2));
  if (n > 40 && kind !== 'frost' && kind !== 'frostcollect' && rng() < 0.4) addFrost(2, 0.4);
  // remove jelly rows if none were added
  if (!lv.jelly.some((r) => /[12]/.test(r))) delete lv.jelly;
  return lv;
}

// How many of the bot's games should win within the move limit: high at first, lower later, easier at the start of a world.
function targetWinRate(i) {
  const world = Math.floor(i / WORLD), inWorld = i % WORLD;
  if (i < 10) return 0.95;
  return Math.max(0.55, 0.88 - world * 0.035 - inWorld * 0.01);
}
const quantile = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };
const round = (v, to) => Math.max(to, Math.round(v / to) * to);

// The range the move limit should land in: short at first, longer later.
function moveRange(i) { if (i < 10) return [12, 26]; const t = i / COUNT; return [Math.round(16 + 6 * t), Math.round(30 + 10 * t)]; }

function tune(i, runs = 24, startScale = 1) {
  let scale = startScale, best = null;
  const [lo, hi] = moveRange(i);
  for (let iter = 0; iter < 9; iter++) {
    const lv = design(i, scale);
    lv.seed = 5000 + i * 31;
    const q = targetWinRate(i);
    if (lv.goal.score) {
      const M = Math.round(18 + Math.min(10, i / 8));
      const scores = [];
      for (let k = 0; k < runs; k++) scores.push(botPlay({ ...lv, moves: M, goal: { score: 1e12 } }, lv.seed + 100 + k, 700 + k, { maxMoves: M }).score);
      lv.moves = M; lv.goal.score = round(quantile(scores, 1 - q), 500);
      lv.stars = [lv.goal.score, round(quantile(scores, 0.6), 500), round(quantile(scores, 0.9), 500)];
      best = lv;
      break;
    }
    const used = [], scores = [];
    let wins = 0;
    for (let k = 0; k < runs; k++) {
      const r = botPlay({ ...lv, moves: 90 }, lv.seed + 100 + k, 700 + k, { maxMoves: 90 });
      if (r.won) { wins++; used.push(r.moves); scores.push(r.score); }
    }
    if (wins < runs * 0.85) { scale /= 1.3; continue; } // too hard even with plenty of moves
    const M = quantile(used, q) + 1;
    lv.moves = Math.max(lo, Math.min(hi + 6, M));
    lv.stars = [round(quantile(scores, 0.05) * 0.5, 500), round(quantile(scores, 0.5), 500), round(quantile(scores, 0.85), 500)];
    best = lv;
    if (M < lo && iter < 8) { scale *= 1.3; continue; }
    if (M > hi && iter < 8) { scale /= 1.25; continue; }
    break;
  }
  if (!best) throw new Error(`Level ${i + 1} could not be tuned`);
  const lv = best;
  if (lv.stars[1] <= lv.stars[0]) lv.stars[1] = lv.stars[0] + 1000;
  if (lv.stars[2] <= lv.stars[1]) lv.stars[2] = lv.stars[1] + 2000;
  // the check games the test replays: make sure at least one of them wins
  let proven = false;
  for (let extra = 0; extra <= 15 && !proven; extra++) {
    if ([...Array(CHECK_RUNS)].some((_, k) => botPlay(lv, lv.seed + k, 31 + k).won)) { proven = true; break; }
    if (lv.goal.score) { lv.goal.score = Math.max(500, lv.goal.score - 500); lv.stars[0] = lv.goal.score; } else lv.moves++;
  }
  if (!proven) { if (startScale < 0.2) throw new Error(`Level ${i + 1} could not be proven winnable`); return tune(i, runs, scale / 1.4); }
  if (lv.stars[1] <= lv.stars[0]) lv.stars[1] = lv.stars[0] + 1000;
  if (lv.stars[2] <= lv.stars[1]) lv.stars[2] = lv.stars[1] + 2000;
  lv.scale = Math.round(scale * 100) / 100;
  return lv;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('gen-treat.mjs')) {
  const from = +(process.argv[2] || 1) - 1, to = +(process.argv[3] || COUNT);
  const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')).levels : [];
  const levels = old.slice();
  const t0 = Date.now();
  for (let i = from; i < to; i++) {
    const lv = tune(i);
    const { n, kind, shape, scale, ...keep } = lv;
    levels[i] = keep;
    const g = Object.entries(lv.goal).map(([k, v]) => (k === 'collect' ? `collect ${Object.values(v).join('+')}` : k === 'score' ? `score ${v}` : k === 'ing' ? `${v} ingredients` : k)).join(', ');
    console.log(`${String(n).padStart(3)} x${String(scale).padEnd(4)} ${shape.padEnd(8)} ${lv.colours}c ${String(lv.moves).padStart(2)} moves  ${g}`);
  }
  writeFileSync(OUT, JSON.stringify({ levels }));
  console.log(`Wrote ${levels.length} levels in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
export { design };
