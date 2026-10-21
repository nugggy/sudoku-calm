// Builds www/levels/gridlock.json: Rush Hour style car park puzzles sorted from easy to hard.
// Random layouts are explored in full; from each one we keep the start position that is farthest
// from a solution (the hardest puzzle that layout can make), plus a few easier ones for the early levels.
// Usage: node tools/gen-gridlock.mjs [seconds] [pool.json]
// With a pool file the explored puzzles are saved there, and reused on later runs to re-pick levels quickly.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { mulberry32 } from '../www/js/sudoku-engine.js';
import { parse, cluster, toBoard, normalise, solve, N, EXIT_ROW, LETTERS } from '../www/js/gridlock-engine.js';



function randomLayout(rng, count) {
  const g = new Array(36).fill('o');
  const free = (cells) => cells.every((c) => g[c] === 'o');
  const red = [EXIT_ROW * N + ((rng() * 3) | 0)]; red.push(red[0] + 1);
  red.forEach((c) => (g[c] = 'A'));
  let placed = 0;
  for (let tries = 0; placed < count && tries < 400; tries++) {
    const len = rng() < 0.72 ? 2 : 3, h = rng() < 0.5;
    const r = (rng() * (h ? N : N - len + 1)) | 0, c = (rng() * (h ? N - len + 1 : N)) | 0;
    if (h && r === EXIT_ROW) continue; // a car across the exit row could never get out of the way
    const cells = [...Array(len)].map((_, k) => (h ? r * N + c + k : (r + k) * N + c));
    if (!free(cells)) continue;
    cells.forEach((x) => (g[x] = LETTERS[placed]));
    placed++;
  }
  return g.join('');
}

// Tweak a layout: drop a vehicle, add one, or both.
function mutate(rng, board) {
  const g = [...board];
  const ids = [...new Set(g)].filter((c) => c !== 'o' && c !== 'A');
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
      cells.forEach((x) => (g[x] = spare));
      break;
    }
  }
  return g.join('');
}

// Explore a layout in full: -> {max, hardest board, pick(d)} or null when the red car can never leave.
function evaluate(rng, board) {
  const { vs, pos } = parse(board);
  const cl = cluster(vs, pos);
  let max = -1;
  for (const d of cl.dist) if (d !== Infinity && d > max) max = d;
  if (max < 0) return null;
  const pick = (d) => { const idx = []; cl.dist.forEach((x, i) => { if (x === d) idx.push(i); }); return toBoard(vs, cl.states[idx[(rng() * idx.length) | 0]]); };
  return { max, board: pick(max), pick };
}

// One worker: random layouts for variety, then hill climbing to push towards the hardest puzzles.
function work(seed, until) {
  const rng = mulberry32(seed);
  const out = [];
  const record = (ev) => {
    if (ev.max >= 3) out.push([ev.board, ev.max]);
    if (ev.max > 6 && rng() < 0.2) { const d = 3 + ((rng() * (ev.max - 3)) | 0); out.push([ev.pick(d), d]); }
  };
  while (Date.now() < until) {
    let cur = null;
    for (let t = 0; t < 40 && !cur; t++) { const ev = evaluate(rng, randomLayout(rng, 8 + ((rng() * 6) | 0))); if (ev) { record(ev); if (ev.max >= 8) cur = ev; } }
    if (!cur) continue;
    // climb: keep any tweak that is at least as hard, give up after a run of failures
    for (let stale = 0; stale < 120 && Date.now() < until; stale++) {
      const ev = evaluate(rng, mutate(rng, cur.board));
      if (!ev) continue;
      record(ev);
      if (ev.max > cur.max) stale = 0;
      if (ev.max >= cur.max) cur = ev;
    }
  }
  return out;
}

if (!isMainThread) {
  parentPort.postMessage(work(workerData.seed, workerData.until));
} else {
  const secs = +(process.argv[2] || 600), cache = process.argv[3];
  let found;
  if (cache && existsSync(cache)) found = JSON.parse(readFileSync(cache, 'utf8'));
  else {
    const until = Date.now() + secs * 1000;
    const threads = Math.max(1, cpus().length - 1);
    console.log(`exploring for ${secs}s on ${threads} threads`);
    found = (await Promise.all([...Array(threads)].map((_, t) => new Promise((res, rej) => {
      const w = new Worker(new URL(import.meta.url), { workerData: { seed: 9100 + t * 7919, until } });
      w.on('message', res); w.on('error', rej);
    })))).flat();
    if (cache) writeFileSync(cache, JSON.stringify(found));
  }
  // dedupe, keeping the layout's optimal count
  // and leave out boards that Villain Lockdown already uses
  const { LOCKDOWN } = await import('../www/js/hero/lockdown-levels.js');
  const lockdown = new Set(LOCKDOWN.map((l) => normalise(l.board)));
  const pool = new Map();
  for (const [b, m] of found) { const k = normalise(b); if (!pool.has(k) && !lockdown.has(k)) pool.set(k, m); }
  const byMoves = new Map();
  for (const [b, m] of pool) { if (!byMoves.has(m)) byMoves.set(m, []); byMoves.get(m).push(b); }
  const hist = [...byMoves.keys()].sort((a, b) => a - b).map((m) => `${m}:${byMoves.get(m).length}`).join(' ');
  console.log('found', pool.size, 'distinct puzzles by moves', hist);

  // Difficulty curve. A run of puzzles with the same move count all play alike (shift a blocker, drive out),
  // so the first dozen climb quickly by hand, then a steady rise to the hardest found. Within each block of ten
  // the target goes up and down a little: an easier breather after a hard one, and a tougher one to end on.
  const top = Math.max(...byMoves.keys());
  const TOTAL = 320;
  const START = [3, 4, 5, 4, 6, 7, 5, 8, 9, 7, 10, 11];
  const WAVE = [-1, -1, 0, 1, 0, 1, 2, -1, 1, 3];
  const wantAt = (i) => {
    if (i < START.length) return START[i];
    const u = (i - START.length) / (TOTAL - 1 - START.length);
    const base = 9 + (top - 9) * Math.pow(u, 1.2);
    return Math.max(5, Math.min(top, Math.round(base + WAVE[i % WAVE.length] * (1 + base / 20))));
  };
  const rng = mulberry32(4242);
  const levels = [];
  // Hill climbing leaves near twins: the same board with one car added, taken away or moved.
  // Describe a board by its vehicles (lane, length and spot) and skip boards that share all but one.
  const lanes = (b) => { const { vs, pos } = parse(b); return vs.map((v, i) => `${v.h ? 'h' : 'v'}${v.line}${v.len}${pos[i]}`).sort(); };
  const diff = (a, b) => { const c = b.slice(); let n = 0; for (const x of a) { const i = c.indexOf(x); if (i < 0) n++; else c.splice(i, 1); } return n + c.length; };
  const chosen = [];
  const tooClose = (b) => { const l = lanes(b); return chosen.some((c) => diff(l, c) <= 2); };
  const order = [...Array(TOTAL).keys()].sort((a, b) => wantAt(b) - wantAt(a) || b - a);
  for (const i of order) { // hardest first, so the rare top boards win any twin clash
    const t = i / (TOTAL - 1);
    const want = wantAt(i);
    // find the nearest move count with an unused board, preferring a little easier
    let done = false;
    for (let off = 0; off < 60 && !done; off++) {
      for (const m of [want - off, want + off]) {
        const list = byMoves.get(m);
        if (!list?.length) continue;
        // early levels get quieter car parks, later ones busier: about 6 vehicles rising to 13
        const busy = 6 + t * 7, cars = (b) => new Set(b.replace(/o/g, '')).size;
        list.sort((a, b) => Math.abs(cars(a) - busy) - Math.abs(cars(b) - busy) + (rng() - 0.5));
        const k = list.findIndex((b) => !tooClose(b));
        if (k < 0) continue;
        const b = list.splice(k, 1)[0];
        levels[i] = [b, m]; chosen.push(lanes(b)); done = true; break;
      }
    }
    if (!done) throw new Error(`no board left for level ${i + 1} (want ${want} moves)`);
  }
  // verify every level with the solver before writing
  for (const [b, m] of levels) {
    const { vs, pos } = parse(b);
    const s = solve(vs, pos);
    if (!s || s.length !== m) throw new Error(`bad level ${b} ${m} ${s && s.length}`);
  }
  // set: bumped whenever the levels change, so saved stars are not shown against different puzzles
  writeFileSync(new URL('../www/levels/gridlock.json', import.meta.url), JSON.stringify({ set: 2, levels: levels.map(([b, m]) => b + m) }));
  console.log('wrote', levels.length, 'levels, moves:', levels.map(([, m]) => m).join(' '));
}
