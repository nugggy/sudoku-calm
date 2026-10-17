// Builds www/levels/crate.json: original Crate Mate (Sokoban) levels.
// Each level starts life solved on a random warehouse floor. A breadth-first search of pulls
// (pushes played backwards) finds the starts that are furthest from solved. The warehouse is then
// improved by hill climbing (move a wall or a spot, keep the change if the level got no easier).
// Finally the forward push-optimal solver checks every level independently and grades it.
// Work is spread over worker threads, one job per tier and seed.
// Usage: node tools/gen-crate.mjs [seed]
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { mulberry32 } from '../www/js/sudoku-engine.js';
import { parseLevel, solve, step } from '../www/js/crate-engine.js';

// Tiers by crate count. W x H is the inside of the warehouse; with walls the board is at most 10 x 12.
// climb = hill-climbing rounds per level (a random share of them when spread, for a range of difficulty),
// cap = most states the pull search may visit.
const TIERS = [
  { boxes: 1, count: 14, W: [4, 6], H: [4, 6], floor: [9, 16], minPush: 3, minLines: 2, climb: 16, spread: true, cap: 4e4 },
  { boxes: 2, count: 32, W: [4, 7], H: [4, 7], floor: [11, 20], minPush: 6, minLines: 3, climb: 30, spread: true, cap: 2e5 },
  { boxes: 3, count: 50, W: [5, 7], H: [5, 8], floor: [14, 24], minPush: 11, minLines: 5, climb: 50, spread: true, cap: 4e5 },
  { boxes: 4, count: 54, W: [5, 8], H: [5, 9], floor: [16, 28], minPush: 18, minLines: 7, climb: 100, spread: true, cap: 6e5 },
  { boxes: 5, count: 40, W: [6, 8], H: [6, 10], floor: [19, 30], minPush: 28, minLines: 9, climb: 160, cap: 8e5 },
  { boxes: 6, count: 28, W: [6, 8], H: [6, 10], floor: [21, 32], minPush: 34, minLines: 11, climb: 160, cap: 8e5 },
];

const rint = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---------- Warehouse shapes ----------
const floorCells = (g) => { const o = []; g.forEach((r, y) => r.forEach((c, x) => { if (c === ' ') o.push([x, y]); })); return o; };
function connected(g) {
  const f = floorCells(g); if (!f.length) return false;
  const seen = new Set([f[0].join()]), st = [f[0]];
  while (st.length) { const [x, y] = st.pop(); for (const [dx, dy] of N4) { const k = `${x + dx},${y + dy}`; if (g[y + dy][x + dx] === ' ' && !seen.has(k)) { seen.add(k); st.push([x + dx, y + dy]); } } }
  return seen.size === f.length;
}

// A few overlapping rooms carved out of rock, then pillars until the floor is the size wanted.
function makeRoom(rng, t) {
  const W = rint(rng, ...t.W), H = rint(rng, ...t.H);
  const g = [...Array(H + 2)].map(() => Array(W + 2).fill('#'));
  const rects = rint(rng, 2, 4);
  for (let k = 0; k < rects; k++) {
    const rw = rint(rng, 2, Math.max(2, W - 1)), rh = rint(rng, 2, Math.max(2, H - 1));
    const x0 = rint(rng, 1, W - rw + 1), y0 = rint(rng, 1, H - rh + 1);
    for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) g[y][x] = ' ';
  }
  if (!connected(g)) return null;
  const target = Math.min(rint(rng, ...t.floor), Math.floor(floorCells(g).length * (0.94 - rng() * 0.1)));
  for (let k = 0; k < 300 && floorCells(g).length > target; k++) {
    const f = floorCells(g), [x, y] = f[Math.floor(rng() * f.length)];
    g[y][x] = '#'; if (!connected(g)) g[y][x] = ' ';
  }
  const n = floorCells(g).length;
  return n < t.floor[0] || n > t.floor[1] ? null : g;
}

// ---------- Pull search ----------
// Breadth-first search of pulls from the solved position. Every state found is at its exact
// push distance from solved, so the deepest layer holds the hardest starting positions.
function farthest(lv, cap) {
  const n = lv.w * lv.h, nb = lv.goals.length;
  const P = [1]; for (let k = 1; k <= nb; k++) P.push(P[k - 1] * 128);
  const NB = new Int16Array(n * 4).fill(-1);
  for (let i = 0; i < n; i++) if (lv.inside[i]) for (let d = 0; d < 4; d++) NB[i * 4 + d] = step(lv, i, d);
  const occ = new Uint8Array(n), seen = new Uint8Array(n), stack = new Int16Array(n);
  const flood = (p) => { seen.fill(0); let top = 0, mn = p; stack[top++] = p; seen[p] = 1; while (top) { const i = stack[--top]; if (i < mn) mn = i; for (let d = 0; d < 4; d++) { const j = NB[i * 4 + d]; if (j >= 0 && !seen[j] && !occ[j]) { seen[j] = 1; stack[top++] = j; } } } return mn; };
  const enc = (bx, p) => { let k = 0; for (let i = 0; i < nb; i++) k += bx[i] * P[i]; return k + p * P[nb]; };
  const dec = (k) => { const b = new Array(nb); for (let i = 0; i < nb; i++) { b[i] = k % 128; k = Math.floor(k / 128); } return { b, p: k }; };
  const visited = new Set();
  let layer = [];
  const start = lv.goals.slice().sort((a, b) => a - b);
  start.forEach((b) => (occ[b] = 1));
  const done = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (lv.inside[i] && !occ[i] && !done[i]) {
    const m = flood(i); for (let j = 0; j < n; j++) if (seen[j]) done[j] = 1;
    const k = enc(start, m); if (!visited.has(k)) { visited.add(k); layer.push(k); }
  }
  start.forEach((b) => (occ[b] = 0));
  let depth = 0, best = layer;
  const nbx = new Array(nb);
  while (layer.length && visited.size < cap) {
    const next = [];
    for (const k of layer) {
      const { b, p } = dec(k);
      b.forEach((x) => (occ[x] = 1));
      flood(p); const reach = seen.slice();
      for (let bi = 0; bi < nb; bi++) for (let d = 0; d < 4; d++) {
        const p1 = NB[b[bi] * 4 + d]; if (p1 < 0 || !reach[p1]) continue;
        const p2 = NB[p1 * 4 + d]; if (p2 < 0 || occ[p2]) continue;
        for (let i = 0; i < nb; i++) nbx[i] = i === bi ? p1 : b[i];
        const sorted = nbx.slice().sort((x, y) => x - y);
        occ[b[bi]] = 0; occ[p1] = 1;
        const nk = enc(sorted, flood(p2));
        occ[p1] = 0; occ[b[bi]] = 1;
        if (!visited.has(nk)) { visited.add(nk); next.push(nk); }
      }
      b.forEach((x) => (occ[x] = 0));
    }
    if (!next.length) break;
    depth++; layer = next; best = next;
  }
  // only starts where no crate begins on a spot
  const states = best.map(dec).filter((s) => s.b.every((x) => !lv.goal[x]));
  return { depth: states.length ? depth : 0, states };
}

function evaluate(g, goals, t) {
  const gg = g.map((r) => r.slice());
  goals.forEach(([x, y]) => (gg[y][x] = '.'));
  const f = floorCells(gg); if (!f.length) return { depth: 0 };
  gg[f[0][1]][f[0][0]] = '@'; // any floor cell will do: the parser only needs a way in
  const lv = parseLevel(gg.map((r) => r.join('')));
  const far = farthest(lv, t.cap);
  return { depth: far.depth, states: far.states, lv };
}

// Nudge the warehouse: turn a floor cell to wall or back, or move a spot.
function mutate(rng, g, goals, t) {
  const g2 = g.map((r) => r.slice()), goals2 = goals.map((p) => p.slice());
  const isGoal = (x, y) => goals2.some((p) => p[0] === x && p[1] === y);
  const r = rng();
  if (r < 0.4) { // move a spot
    const free = floorCells(g2).filter(([x, y]) => !isGoal(x, y));
    goals2[Math.floor(rng() * goals2.length)] = free[Math.floor(rng() * free.length)];
  } else if (r < 0.75) { // add a pillar
    const f = floorCells(g2).filter(([x, y]) => !isGoal(x, y));
    if (f.length <= t.floor[0]) return null;
    const [x, y] = f[Math.floor(rng() * f.length)]; g2[y][x] = '#';
  } else { // open up a wall next to the floor
    const H = g2.length - 2, W = g2[0].length - 2, c = [];
    for (let y = 1; y <= H; y++) for (let x = 1; x <= W; x++) if (g2[y][x] === '#' && N4.some(([dx, dy]) => g2[y + dy][x + dx] === ' ')) c.push([x, y]);
    if (!c.length || floorCells(g2).length >= t.floor[1]) return null;
    const [x, y] = c[Math.floor(rng() * c.length)]; g2[y][x] = ' ';
  }
  if (!connected(g2)) return null;
  return { g: g2, goals: goals2 };
}

function attempt(rng, t) {
  let g = makeRoom(rng, t); if (!g) return null;
  const free = floorCells(g).map((c) => [c, rng()]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  let goals = free.slice(0, t.boxes);
  let cur = evaluate(g, goals, t);
  const climb = t.spread ? Math.floor(t.climb * rng()) : t.climb;
  if (cur.depth < Math.min(t.minPush * 0.4, 8) && climb) return null; // a hopeless seed
  for (let it = 0; it < climb; it++) {
    const m = mutate(rng, g, goals, t); if (!m) continue;
    const ev = evaluate(m.g, m.goals, t);
    if (ev.depth >= cur.depth) { g = m.g; goals = m.goals; cur = ev; }
    if (it === climb >> 1 && cur.depth < t.minPush * 0.7) return null;
  }
  if (cur.depth < t.minPush) return null;
  const lv = cur.lv;
  const s = cur.states[Math.floor(rng() * cur.states.length)];
  // place the worker on a random cell of its region
  const occ = new Set(s.b), region = [], st = [s.p], seen = new Set([s.p]);
  while (st.length) { const i = st.pop(); region.push(i); for (let d = 0; d < 4; d++) { const j = step(lv, i, d); if (j >= 0 && !seen.has(j) && !occ.has(j)) { seen.add(j); st.push(j); } } }
  return finishLevel(lv, s.b, region[Math.floor(rng() * region.length)], cur.depth, t);
}

// Verify with the forward solver, trim dead decorative pockets, crop, and verify again.
function finishLevel(lv, boxes, player, depth, t) {
  const sol = solve(lv, { boxes, player, maxNodes: 5e6 });
  if (!sol || sol.pushes !== depth) { if (sol) console.warn('solver disagrees', sol.pushes, depth); return null; }
  if (sol.lines < t.minLines) return null;
  // cells used by the solution: the worker's walk, every crate square and the spots
  const used = new Set([player, ...boxes, ...lv.goals]);
  let p = player;
  for (const ch of sol.moves) { const d = 'urdl'.indexOf(ch.toLowerCase()); p = step(lv, p, d); used.add(p); if (ch !== ch.toLowerCase()) used.add(step(lv, p, d)); }
  const floor = new Set(); for (let i = 0; i < lv.w * lv.h; i++) if (lv.inside[i]) floor.add(i);
  const deg = (i) => [-lv.w, 1, lv.w, -1].filter((o) => floor.has(i + o)).length;
  for (let changed = true; changed;) {
    changed = false;
    for (const i of [...floor]) if (!used.has(i) && deg(i) <= 1) { floor.delete(i); changed = true; }
  }
  // rebuild as text, cropped to the floor plus one ring of wall
  const xs = [...floor].map((i) => i % lv.w), ys = [...floor].map((i) => (i / lv.w) | 0);
  const x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
  const isFloor = (x, y) => x >= 0 && y >= 0 && x < lv.w && y < lv.h && floor.has(y * lv.w + x);
  // rock that cannot reach the edge is enclosed by the warehouse, so it is wall as well
  const W = x1 - x0 + 1, H = y1 - y0 + 1, outside = new Set(), st = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && !isFloor(x + x0, y + y0)) { outside.add(y * W + x); st.push([x, y]); }
  while (st.length) { const [x, y] = st.pop(); for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || outside.has(ny * W + nx) || isFloor(nx + x0, ny + y0)) continue; outside.add(ny * W + nx); st.push([nx, ny]); } }
  const box = new Set(boxes), rows = [];
  for (let y = y0; y <= y1; y++) {
    let r = '';
    for (let x = x0; x <= x1; x++) {
      if (isFloor(x, y)) { const i = y * lv.w + x, gl = lv.goal[i]; r += i === player ? (gl ? '+' : '@') : box.has(i) ? (gl ? '*' : '$') : gl ? '.' : ' '; continue; }
      let nearFloor = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isFloor(x + dx, y + dy)) nearFloor = true;
      r += nearFloor || !outside.has((y - y0) * W + (x - x0)) ? '#' : ' ';
    }
    rows.push(r.replace(/\s+$/, ''));
  }
  if (rows.length > 12 || Math.max(...rows.map((r) => r.length)) > 10) return null;
  const sol2 = solve(parseLevel(rows), { maxNodes: 5e6 });
  if (!sol2 || sol2.pushes !== sol.pushes) { console.warn('trimming changed the level'); return null; }
  return { rows, pushes: sol2.pushes, lines: sol2.lines, boxes: boxes.length, nodes: sol2.nodes };
}

// The same walls and spots under any rotation or mirror count as a duplicate.
function canon(rows) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const grid = (x, y) => { const c = rows[y][x] || ' '; return c === '#' ? '#' : '.+*'.includes(c) ? '.' : ' '; };
  const out = [];
  for (let s = 0; s < 8; s++) {
    const tw = s & 4 ? h : w, th = s & 4 ? w : h; let str = '';
    for (let y = 0; y < th; y++) { for (let x = 0; x < tw; x++) { let sx = s & 4 ? y : x, sy = s & 4 ? x : y; if (s & 1) sx = w - 1 - sx; if (s & 2) sy = h - 1 - sy; str += grid(sx, sy); } str += '/'; }
    out.push(str);
  }
  return out.sort()[0];
}

// Difficulty: optimal pushes, box lines, crate count and how hard the solver had to search.
const grade = (L) => L.pushes + 1.5 * L.lines + 5 * L.boxes + 3 * Math.log2(L.nodes + 1);

function runJob({ tier, seed, count }) {
  const t = TIERS[tier], rng = mulberry32(seed), got = [];
  for (let tries = 0; got.length < count && tries < count * 3000; tries++) {
    const L = attempt(rng, t); if (L) got.push(L);
  }
  return got;
}

if (!isMainThread) parentPort.postMessage(runJob(workerData));
else {
  const SEED = +(process.argv[2] || 2026);
  // split each tier into jobs, asking for a few spares so duplicates can be dropped
  const jobs = [];
  TIERS.forEach((t, tier) => {
    const parts = Math.max(1, Math.ceil(t.count / 4)), want = Math.ceil((t.count * 1.2) / parts);
    for (let k = 0; k < parts; k++) jobs.push({ tier, seed: SEED * 1000 + tier * 100 + k, count: want });
  });
  const results = new Array(jobs.length), t0 = Date.now();
  let next = 0, finished = 0;
  await new Promise((resolve) => {
    let running = 0;
    const launch = () => {
      if (next >= jobs.length) { if (!running) resolve(); return; }
      const i = jobs.length - 1 - next++; // hardest jobs first, they take longest
      const w = new Worker(new URL(import.meta.url), { workerData: jobs[i] });
      running++;
      w.on('message', (m) => { results[i] = m; });
      w.on('error', (e) => { console.error(e); results[i] = []; });
      w.on('exit', () => { running--; process.stdout.write(`job ${++finished}/${jobs.length} done at ${((Date.now() - t0) / 1000).toFixed(0)}s\n`); launch(); });
    };
    for (let k = 0; k < Math.max(1, cpus().length - 2); k++) launch();
  });
  const all = [], seenKeys = new Set();
  TIERS.forEach((t, tier) => {
    const got = [];
    jobs.forEach((j, i) => { if (j.tier !== tier) return; for (const L of results[i] || []) { const k = canon(L.rows); if (!seenKeys.has(k) && got.length < t.count) { seenKeys.add(k); got.push(L); } } });
    const ps = got.map((L) => L.pushes);
    console.log(`${t.boxes} ${t.boxes === 1 ? 'crate' : 'crates'}: ${got.length} levels, pushes ${Math.min(...ps)} to ${Math.max(...ps)}`);
    all.push(...got);
  });
  all.sort((a, b) => grade(a) - grade(b));
  const levels = all.map(({ rows, pushes, lines, boxes }) => ({ rows, pushes, lines, boxes }));
  writeFileSync(new URL('../www/levels/crate.json', import.meta.url), JSON.stringify({ seed: SEED, levels }));
  console.log(`wrote ${levels.length} levels in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
