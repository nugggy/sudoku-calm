// Builds www/levels/bikepark.json: 60 Bike Park puzzles from easy to hard, each checked by the solver.
// Random 7 x 6 car parks are explored in full; from each we keep the start farthest from a solution, and the
// layout is hill-climbed (vehicles added or removed) to push towards harder puzzles. Some levels have gates on
// both sides of the exit row.
// Usage: node tools/gen-bikepark.mjs [seconds]      node tools/gen-bikepark.mjs --check
import { writeFileSync, readFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { parse, cluster, solve, toBoard, W, H } from '../www/js/moto/park-engine.js';

const OUT = new URL('../www/levels/bikepark.json', import.meta.url);
const COUNT = 60;

function rng32(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const BIKE_IDS = 'bcdefghijkmn', CAR_IDS = 'BCDEFGHIJKLMNP', TRUCK_IDS = 'QRSTUVWYZ';

function place(rng, g, row, id, len) {
  for (let tries = 0; tries < 80; tries++) {
    const h = rng() < 0.5;
    const r = (rng() * (h ? H : H - len + 1)) | 0, c = (rng() * (h ? W - len + 1 : W)) | 0;
    if (h && r === row) continue; // across the exit row it could never get out of the way
    const cells = Array.from({ length: len }, (_, k) => (h ? r * W + c + k : (r + k) * W + c));
    if (!cells.every((x) => g[x] === '.')) continue;
    cells.forEach((x) => (g[x] = id));
    return true;
  }
  return false;
}
const unused = (g, ids) => [...ids].find((L) => !g.includes(L));

function randomLayout(rng, both) {
  const row = 1 + ((rng() * 4) | 0);
  const g = new Array(W * H).fill('.');
  const a = row * W + ((rng() * 3) | 0) + (both ? 1 : 0);
  g[a] = 'A'; g[a + 1] = 'A';
  const fixed = (rng() * 4) | 0;
  for (let k = 0; k < fixed; k++) {
    const r = (rng() * H) | 0, c = (rng() * W) | 0;
    if (r !== row && g[r * W + c] === '.') g[r * W + c] = 'x#+'[(rng() * 3) | 0];
  }
  const n = 8 + ((rng() * 6) | 0);
  for (let k = 0; k < n; k++) {
    const t = rng();
    if (t < 0.38) { const id = unused(g, BIKE_IDS); if (id) place(rng, g, row, id, 2); }
    else if (t < 0.68) { const id = unused(g, CAR_IDS); if (id) place(rng, g, row, id, 2); }
    else { const id = unused(g, TRUCK_IDS); if (id) place(rng, g, row, id, 3); }
  }
  return `${g.join('')}:${row}:${both ? 'B' : 'R'}`;
}

function mutate(rng, level) {
  const [board, row, ex] = level.split(':');
  const g = [...board];
  const ids = [...new Set(g)].filter((c) => /[a-zA-Z]/.test(c) && c !== 'A');
  const op = rng();
  if (ids.length > 5 && op < 0.5) { const gone = ids[(rng() * ids.length) | 0]; g.forEach((c, i) => { if (c === gone) g[i] = '.'; }); }
  if (op > 0.3 || ids.length <= 5) {
    const t = rng();
    if (t < 0.38) { const id = unused(g, BIKE_IDS); if (id) place(rng, g, +row, id, 2); }
    else if (t < 0.68) { const id = unused(g, CAR_IDS); if (id) place(rng, g, +row, id, 2); }
    else { const id = unused(g, TRUCK_IDS); if (id) place(rng, g, +row, id, 3); }
  }
  if (rng() < 0.15) { // nudge an obstacle
    const r = (rng() * H) | 0, c = (rng() * W) | 0;
    if (r !== +row && g[r * W + c] === '.') g[r * W + c] = 'x#+'[(rng() * 3) | 0];
  }
  return `${g.join('')}:${row}:${ex}`;
}

function evaluate(rng, level) {
  const P = parse(level);
  const cl = cluster(P);
  if (!cl) return null;
  let max = -1;
  for (const d of cl.dist) if (d !== Infinity && d > max) max = d;
  if (max < 1) return null;
  const at = (d) => { const idx = []; cl.dist.forEach((x, i) => { if (x === d) idx.push(i); }); const s = cl.states[idx[(rng() * idx.length) | 0]]; return `${toBoard(P, s)}:${P.row}:${P.both ? 'B' : 'R'}`; };
  return { max, level: at(max), at };
}

function work(seed, until) {
  const rng = rng32(seed), out = [];
  const record = (ev) => {
    if (ev.max >= 3) out.push([ev.level, ev.max]);
    if (ev.max > 6 && rng() < 0.25) { const d = 3 + ((rng() * (ev.max - 3)) | 0); out.push([ev.at(d), d]); }
  };
  while (Date.now() < until) {
    const both = rng() < 0.25;
    let cur = null;
    for (let t = 0; t < 40 && !cur && Date.now() < until; t++) { const ev = evaluate(rng, randomLayout(rng, both)); if (ev) { record(ev); if (ev.max >= 8) cur = ev; } }
    if (!cur) continue;
    for (let stale = 0; stale < 100 && Date.now() < until; stale++) {
      const ev = evaluate(rng, mutate(rng, cur.level));
      if (!ev) continue;
      record(ev);
      if (ev.max >= cur.max) { if (ev.max > cur.max) stale = 0; cur = ev; }
    }
  }
  return out;
}

if (!isMainThread) {
  parentPort.postMessage(work(workerData.seed, workerData.until));
} else if (process.argv.includes('--check')) {
  // verify every stored level: solvable, and its stored par matches the solver
  const { levels, par } = JSON.parse(readFileSync(OUT, 'utf8'));
  let bad = 0;
  levels.forEach((lv, i) => { const s = solve(parse(lv)); if (!s || s.length !== par[i]) { bad++; console.log(`level ${i + 1}: expected ${par[i]}, solver says ${s ? s.length : 'unsolvable'}`); } });
  console.log(bad ? `${bad} problems` : `All ${levels.length} Bike Park levels solvable with the stored par`);
  process.exit(bad ? 1 : 0);
} else {
  const secs = +(process.argv[2] || 120), until = Date.now() + secs * 1000;
  const n = Math.max(1, Math.min(8, cpus().length - 1));
  console.log(`Searching for ${secs}s on ${n} threads`);
  const pools = await Promise.all(Array.from({ length: n }, (_, k) => new Promise((ok, bad) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { seed: 1000 + k * 7919, until } });
    w.on('message', ok); w.on('error', bad);
  })));
  const seen = new Set(), pool = [];
  for (const [lv, d] of pools.flat()) if (!seen.has(lv)) { seen.add(lv); pool.push([lv, d]); }
  const maxD = Math.max(...pool.map((x) => x[1]));
  console.log(`${pool.length} puzzles, hardest ${maxD} moves`);
  // targets climb from 3 to the hardest found (capped at 40); about one level in five has two gates
  const top = Math.min(40, maxD), used = new Set(), levels = [], par = [];
  for (let i = 0; i < COUNT; i++) {
    const target = Math.round(3 + Math.pow(i / (COUNT - 1), 1.2) * (top - 3));
    const want = i >= 7 && i % 5 === 2 ? 'B' : 'R';
    let best = null;
    for (const [lv, d] of pool) {
      if (used.has(lv) || !lv.endsWith(want)) continue;
      // early levels prefer roomier car parks so the idea is easy to see
      const crowd = new Set(lv.split(':')[0].replace(/[.x#+A]/g, '')).size;
      const score = Math.abs(d - target) + (d < (par[i - 1] || 0) ? 2 : 0) + (i < 12 ? Math.max(0, crowd - (4 + i / 2)) * 0.4 : 0);
      if (!best || score < best[2]) best = [lv, d, score];
    }
    if (!best) for (const [lv, d] of pool) { if (used.has(lv)) continue; const s = Math.abs(d - target); if (!best || s < best[2]) best = [lv, d, s]; }
    used.add(best[0]);
    const s = solve(parse(best[0]));
    levels.push(best[0]); par.push(s.length);
  }
  writeFileSync(OUT, JSON.stringify({ levels, par }));
  console.log('pars:', par.join(' '));
}
