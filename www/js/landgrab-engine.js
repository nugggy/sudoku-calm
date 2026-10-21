// Land Grab rules, kept apart from drawing so they can be tested on their own.
// A square field of cells. Each player owns some cells and moves one cell per tick in one of four directions.
// Leaving your land draws a trail; getting back home claims the trail and everything it encloses.
// You are out if you touch the edge, cross your own trail, or someone crosses yours.
export const N = 90;                 // the field is N by N cells
export const TICK = 1 / 8;           // seconds per move: everyone travels at 8 cells a second
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left
const START = 2;                     // a new player gets a (2*START+1) square of land

// The field's shape. Cells outside the shape (or under water and rocks) work like the edge: run into them and you are out.
// hole: what the closed-off cells inside the field look like ('water' or 'rock'); everything else is plain outside.
const C = (N - 1) / 2;
const ROCKS = [[22, 20, 5], [66, 24, 6], [45, 45, 7], [20, 64, 6], [68, 68, 5], [44, 16, 3], [44, 76, 4], [12, 42, 3], [78, 46, 3]];
export const MAPS = [
  { id: 'classic', name: 'Classic', shape: () => true },
  { id: 'round', name: 'Round', shape: (x, y) => (x - C) ** 2 + (y - C) ** 2 <= 45 ** 2 },
  { id: 'lake', name: 'Lake', hole: 'water', shape: (x, y) => (x - C) ** 2 + (y - C) ** 2 > 15 ** 2 },
  { id: 'cross', name: 'Cross', shape: (x, y) => Math.abs(x - C) <= 20 || Math.abs(y - C) <= 20 },
  { id: 'diamond', name: 'Diamond', shape: (x, y) => Math.abs(x - C) + Math.abs(y - C) <= 58 },
  { id: 'rocks', name: 'Rocks', hole: 'rock', shape: (x, y) => ROCKS.every(([rx, ry, r]) => Math.max(Math.abs(x - rx), Math.abs(y - ry)) > r || Math.abs(x - rx) + Math.abs(y - ry) > r * 1.5) },
];
export const mapById = (id) => MAPS.find((m) => m.id === id) || MAPS[0];

export function maskOf(map) {
  const m = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) m[y * N + x] = map.shape(x, y) ? 1 : 0;
  return m;
}

// Closed cells that are not joined to the border of the square: the water or rocks inside the field.
export function holesOf(open) {
  const outer = new Uint8Array(N * N), stack = [];
  for (let k = 0; k < N; k++) for (const i of [k, (N - 1) * N + k, k * N, k * N + N - 1]) if (!open[i] && !outer[i]) { outer[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop(), x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const j = ny * N + nx; if (!open[j] && !outer[j]) { outer[j] = 1; stack.push(j); }
    }
  }
  const holes = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) holes[i] = !open[i] && !outer[i] ? 1 : 0;
  return holes;
}

export function createWorld(rng = Math.random, map = MAPS[0]) {
  const open = maskOf(map);
  let area = 0; for (let i = 0; i < N * N; i++) area += open[i];
  return { owner: new Uint8Array(N * N), trail: new Uint8Array(N * N), open, area, map, players: [], tick: 0, rng, events: [] };
}

// id is 1-based so 0 can mean "nobody" in owner and trail.
export function addPlayer(w, props) {
  const p = { id: w.players.length + 1, x: 0, y: 0, px: 0, py: 0, dir: 1, want: -1, alive: false, cells: 0, kills: 0, trail: [], box: null, bestPct: 0, area: w.area, ...props };
  w.players.push(p);
  return p;
}

const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
export const open = (w, x, y) => inside(x, y) && w.open[y * N + x] === 1;
export const pct = (p) => (p.cells / p.area) * 100;

// Put a player down on a clear patch, away from everyone else's heads.
export function spawn(w, p) {
  const ok = (cx, cy) => {
    for (let y = cy - START - 1; y <= cy + START + 1; y++) for (let x = cx - START - 1; x <= cx + START + 1; x++) {
      if (!open(w, x, y)) return false;
      const i = y * N + x; if (w.owner[i] || w.trail[i]) return false;
    }
    return w.players.every((q) => !q.alive || q === p || Math.abs(q.x - cx) + Math.abs(q.y - cy) > 14);
  };
  let cx = -1, cy = -1;
  for (let t = 0; t < 400; t++) {
    const x = START + 2 + ((w.rng() * (N - 2 * START - 4)) | 0), y = START + 2 + ((w.rng() * (N - 2 * START - 4)) | 0);
    if (ok(x, y)) { cx = x; cy = y; break; }
  }
  if (cx < 0) return false; // the field is too full for now: try again later
  p.alive = true; p.x = p.px = cx; p.y = p.py = cy; p.trail = []; p.cells = 0; p.kills = 0;
  p.dir = (w.rng() * 4) | 0; p.want = -1; p.bestPct = 0;
  p.box = { x0: cx - START, y0: cy - START, x1: cx + START, y1: cy + START };
  for (let y = cy - START; y <= cy + START; y++) for (let x = cx - START; x <= cx + START; x++) setOwner(w, y * N + x, p.id);
  return true;
}

function setOwner(w, i, id) {
  const was = w.owner[i];
  if (was === id) return;
  if (was) w.players[was - 1].cells--;
  w.owner[i] = id;
  if (id) w.players[id - 1].cells++;
}

// Ask for a turn. Turning straight back is not allowed (it would run over your own trail).
export function steer(p, d) {
  if (d === p.dir || (d + 2) % 4 === p.dir) { if (d === p.dir) p.want = -1; return; }
  p.want = d;
}

export function kill(w, p, by = null) {
  if (!p.alive) return;
  p.alive = false;
  for (const i of p.trail) if (w.trail[i] === p.id) w.trail[i] = 0;
  p.trail = [];
  for (let i = 0; i < N * N; i++) if (w.owner[i] === p.id) setOwner(w, i, 0);
  if (by && by !== p) by.kills++;
  w.events.push({ k: 'die', p: p.id, by: by ? by.id : 0 });
}

// One move for everyone at once, then sort out who ran into what.
export function step(w) {
  w.tick++;
  const movers = w.players.filter((p) => p.alive);
  for (const p of movers) {
    if (p.want >= 0) { p.dir = p.want; p.want = -1; }
    p.px = p.x; p.py = p.y;
    p.x += DIRS[p.dir][0]; p.y += DIRS[p.dir][1];
  }
  const dead = new Map(); // player -> killer (or null)
  const out = (p, by) => { if (!dead.has(p)) dead.set(p, by); };
  for (const p of movers) if (!open(w, p.x, p.y)) out(p, null);
  // trails: crossing your own ends you, crossing someone else's ends them
  for (const p of movers) {
    if (dead.has(p) && !open(w, p.x, p.y)) continue;
    const t = w.trail[p.y * N + p.x];
    if (!t) continue;
    if (t === p.id) out(p, null);
    else out(w.players[t - 1], p);
  }
  // heads meeting (same cell, or passing through each other): whoever is on their own land survives
  for (let a = 0; a < movers.length; a++) for (let b = a + 1; b < movers.length; b++) {
    const p = movers[a], q = movers[b];
    if (!open(w, p.x, p.y) || !open(w, q.x, q.y)) continue;
    const same = p.x === q.x && p.y === q.y, swap = p.x === q.px && p.y === q.py && q.x === p.px && q.y === p.py;
    if (!same && !swap) continue;
    const pHome = w.owner[p.y * N + p.x] === p.id, qHome = w.owner[q.y * N + q.x] === q.id;
    if (pHome && !qHome) out(q, p);
    else if (qHome && !pHome) out(p, q);
    else { out(p, q); out(q, p); }
  }
  for (const [p, by] of dead) kill(w, p, by && !dead.has(by) ? by : null);
  // the survivors: lay trail or come home
  for (const p of movers) {
    if (!p.alive) continue;
    const i = p.y * N + p.x;
    if (w.owner[i] === p.id) { if (p.trail.length) capture(w, p); }
    else { w.trail[i] = p.id; p.trail.push(i); }
  }
  for (const p of w.players) if (p.alive) p.bestPct = Math.max(p.bestPct, pct(p));
}

// Home again: the trail becomes land, and so does every cell it closed off from the outside.
export function capture(w, p) {
  const b = p.box;
  for (const i of p.trail) {
    if (w.trail[i] === p.id) w.trail[i] = 0;
    const x = i % N, y = (i / N) | 0;
    if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
    claim(w, p, i);
  }
  p.trail = [];
  // flood from just outside the box through cells that are not ours; whatever the flood cannot reach is enclosed
  const x0 = b.x0 - 1, y0 = b.y0 - 1, bw = b.x1 - b.x0 + 3, bh = b.y1 - b.y0 + 3;
  const seen = new Uint8Array(bw * bh), stack = [];
  const push = (lx, ly) => {
    if (lx < 0 || ly < 0 || lx >= bw || ly >= bh) return;
    const k = ly * bw + lx; if (seen[k]) return;
    const x = x0 + lx, y = y0 + ly;
    if (inside(x, y) && w.owner[y * N + x] === p.id) return;
    seen[k] = 1; stack.push(k);
  };
  for (let lx = 0; lx < bw; lx++) { push(lx, 0); push(lx, bh - 1); }
  for (let ly = 0; ly < bh; ly++) { push(0, ly); push(bw - 1, ly); }
  while (stack.length) {
    const k = stack.pop(), lx = k % bw, ly = (k / bw) | 0;
    push(lx + 1, ly); push(lx - 1, ly); push(lx, ly + 1); push(lx, ly - 1);
  }
  for (let ly = 1; ly < bh - 1; ly++) for (let lx = 1; lx < bw - 1; lx++) {
    if (seen[ly * bw + lx]) continue;
    const x = x0 + lx, y = y0 + ly, i = y * N + x;
    if (w.owner[i] !== p.id && w.open[i]) claim(w, p, i); // a lake or rock inside the loop stays as it is
  }
  w.events.push({ k: 'claim', p: p.id });
}

function claim(w, p, i) {
  const was = w.owner[i];
  setOwner(w, i, p.id);
  // took the last of someone's land: they are out
  if (was && was !== p.id) { const q = w.players[was - 1]; if (q.alive && q.cells === 0) kill(w, q, p); }
}

// ---------- computer players ----------
// Each bot heads out a little way, turns, runs alongside its land and comes back to close the loop.
// It cuts the loop short and runs home when someone gets close enough to cut its trail first,
// and now and then goes after a trail that is close by.
export function makeBrain(rng, level = 0.5) {
  return { plan: [], level, out: 3 + ((rng() * 4) | 0), side: 4 + ((rng() * 6) | 0) };
}

function homePath(w, p, limit = 70) {
  // breadth first search from the head to the nearest cell of our own land, never touching our trail
  const start = p.y * N + p.x;
  const prev = new Map([[start, -1]]);
  let frontier = [start];
  for (let d = 0; d < limit && frontier.length; d++) {
    const next = [];
    for (const c of frontier) {
      const cx = c % N, cy = (c / N) | 0;
      for (let k = 0; k < 4; k++) {
        if (c === start && (k + 2) % 4 === p.dir) continue;
        const x = cx + DIRS[k][0], y = cy + DIRS[k][1];
        if (!open(w, x, y)) continue;
        const i = y * N + x;
        if (prev.has(i) || w.trail[i] === p.id) continue;
        prev.set(i, c);
        if (w.owner[i] === p.id) {
          let s = i; const path = [];
          while (prev.get(s) !== -1) { path.push(s); s = prev.get(s); }
          return { len: path.length, first: dirTo(start, path[path.length - 1]) };
        }
        next.push(i);
      }
    }
    frontier = next;
  }
  return null;
}
const dirTo = (a, b) => { const dx = (b % N) - (a % N), dy = ((b / N) | 0) - ((a / N) | 0); return dx > 0 ? 1 : dx < 0 ? 3 : dy > 0 ? 2 : 0; };

function safe(w, p, d) {
  if ((d + 2) % 4 === p.dir) return false;
  const x = p.x + DIRS[d][0], y = p.y + DIRS[d][1];
  if (!open(w, x, y)) return false;
  if (w.trail[y * N + x] === p.id) return false;
  return true;
}

// room to run in a direction before the edge or our own trail
function room(w, p, d, max = 12) {
  let x = p.x, y = p.y, n = 0;
  while (n < max) { x += DIRS[d][0]; y += DIRS[d][1]; if (!open(w, x, y) || w.trail[y * N + x] === p.id) break; n++; }
  return n;
}

export function think(w, p, br) {
  const rng = w.rng, home = w.owner[p.y * N + p.x] === p.id;
  let want = p.dir;
  if (!home && p.trail.length) {
    const hp = homePath(w, p);
    // how soon could someone reach our trail?
    let threat = Infinity;
    for (const q of w.players) {
      if (!q.alive || q === p) continue;
      const near = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
      if (near > 30) continue;
      for (let k = 0; k < p.trail.length; k += 2) {
        const i = p.trail[k], d = Math.abs(q.x - (i % N)) + Math.abs(q.y - ((i / N) | 0));
        if (d < threat) threat = d;
      }
    }
    const margin = 2 + Math.round((1 - br.level) * 5);
    if (hp && (threat <= hp.len + margin || p.trail.length > 18 + br.level * 40)) { br.plan = []; want = hp.first; }
    else if (br.plan.length) { want = br.plan[0].d; if (--br.plan[0].n <= 0) br.plan.shift(); }
    else if (hp) want = hp.first;
    // a trail within reach that we can cut before its owner gets home
    if (br.level > 0.3 && rng() < br.level * 0.6 && hp && hp.len < 6) {
      const prey = huntTarget(w, p);
      if (prey !== null) want = prey;
    }
  } else {
    // at home: pick a way out with room to spare and walk to the edge of our land
    if (!br.leave || !safe(w, p, br.leave.d)) {
      const opts = [0, 1, 2, 3].filter((d) => safe(w, p, d)).map((d) => ({ d, r: room(w, p, d, 30) }));
      opts.sort((a, b) => b.r - a.r + (rng() - 0.5) * 8);
      const grow = 1 + Math.min(2, p.cells / 400);
      br.out = Math.max(2, Math.round((2 + rng() * 5) * grow * (0.6 + br.level)));
      br.side = Math.max(3, Math.round((3 + rng() * 8) * grow * (0.6 + br.level)));
      br.leave = { d: opts.length ? opts[0].d : p.dir, turn: rng() < 0.5 ? 1 : 3 };
    }
    br.plan = [];
    want = br.leave.d;
  }
  // just left home: lay out the loop
  if (!home && br.leave && p.trail.length === 1) {
    const { d, turn } = br.leave, s = (d + turn) % 4, back = (d + 2) % 4;
    br.plan = [{ d, n: br.out - 1, stage: 1 }, { d: s, n: br.side, stage: 1 }, { d: back, n: br.out + 2, stage: 1 }];
    br.leave = null;
    want = br.plan[0].d; if (--br.plan[0].n <= 0) br.plan.shift();
  }
  // never walk into the edge or our own trail
  if (!safe(w, p, want)) {
    const alt = [0, 1, 2, 3].filter((d) => safe(w, p, d)).sort((a, b) => room(w, p, b) - room(w, p, a));
    if (alt.length) want = alt[0];
    br.plan = [];
  }
  steer(p, want);
}

function huntTarget(w, p) {
  let best = null, bestD = 7;
  for (const q of w.players) {
    if (!q.alive || q === p || !q.trail.length) continue;
    for (const i of q.trail) {
      const x = i % N, y = (i / N) | 0, d = Math.abs(x - p.x) + Math.abs(y - p.y);
      if (d >= bestD) continue;
      // only if we get there before its owner can get home
      const dir = Math.abs(x - p.x) > Math.abs(y - p.y) ? (x > p.x ? 1 : 3) : (y > p.y ? 2 : 0);
      if (!safe(w, p, dir)) continue;
      best = dir; bestD = d;
    }
  }
  return best;
}
