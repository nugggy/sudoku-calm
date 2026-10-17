// Crate Mate engine: level parsing, walking paths, deadlock checks and a push-optimal solver.
// Levels use the usual Sokoban text: # wall, space floor, $ crate, . spot, * crate on spot, @ worker, + worker on spot.

export const DIRS = ['u', 'r', 'd', 'l'];
export const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

export function parseLevel(rows) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const n = w * h, wall = new Uint8Array(n), goal = new Uint8Array(n), inside = new Uint8Array(n);
  const boxes = []; let player = -1;
  rows.forEach((row, y) => { for (let x = 0; x < w; x++) {
    const ch = row[x] || ' ', i = y * w + x;
    if (ch === '#') wall[i] = 1;
    if (ch === '.' || ch === '*' || ch === '+') goal[i] = 1;
    if (ch === '$' || ch === '*') boxes.push(i);
    if (ch === '@' || ch === '+') player = i;
  } });
  // the inside of the warehouse is whatever the worker can reach with crates ignored
  const st = [player]; inside[player] = 1;
  while (st.length) { const i = st.pop(), x = i % w; for (let d = 0; d < 4; d++) {
    if ((d === 1 && x === w - 1) || (d === 3 && x === 0)) continue;
    const j = i + DX[d] + DY[d] * w; if (j < 0 || j >= n || wall[j] || inside[j]) continue; inside[j] = 1; st.push(j);
  } }
  const goals = []; for (let i = 0; i < n; i++) if (goal[i]) goals.push(i);
  return { w, h, wall, goal, inside, goals, boxes: boxes.sort((a, b) => a - b), player };
}

// Neighbour of cell i in direction d, or -1 for walls and the outside.
export const step = (lv, i, d) => {
  const x = i % lv.w;
  if ((d === 1 && x === lv.w - 1) || (d === 3 && x === 0)) return -1;
  const j = i + DX[d] + DY[d] * lv.w;
  return j < 0 || j >= lv.w * lv.h || !lv.inside[j] ? -1 : j;
};

// Shortest walk for the worker from a to b without touching crates: an array of directions, or null.
export function walkPath(lv, boxSet, a, b) {
  if (a === b) return [];
  if (!lv.inside[b] || boxSet.has(b)) return null;
  const prev = new Int16Array(lv.w * lv.h).fill(-1), q = [a]; prev[a] = a;
  for (let k = 0; k < q.length; k++) {
    const i = q[k];
    for (let d = 0; d < 4; d++) {
      const j = step(lv, i, d); if (j < 0 || prev[j] >= 0 || boxSet.has(j)) continue;
      prev[j] = i; if (j === b) { const path = []; let c = j; while (c !== a) { const p = prev[c]; path.push([0, 1, 2, 3].find((dd) => step(lv, p, dd) === c)); c = p; } return path.reverse(); }
      q.push(j);
    }
  }
  return null;
}

// A crate off a spot with walls on two touching sides can never move again.
export function cornerStuck(lv, i) {
  if (lv.goal[i]) return false;
  const wl = (d) => step(lv, i, d) < 0;
  return (wl(0) || wl(2)) && (wl(1) || wl(3));
}

// Squares from which a crate can still reach some spot (pulling backwards from every spot).
export function liveSquares(lv) {
  const n = lv.w * lv.h, dist = new Int16Array(n).fill(-1), q = [];
  for (const g of lv.goals) { dist[g] = 0; q.push(g); }
  for (let k = 0; k < q.length; k++) {
    const g = q[k];
    for (let d = 0; d < 4; d++) {
      const a = step(lv, g, d); if (a < 0 || dist[a] >= 0) continue;
      const b = step(lv, a, d); if (b < 0) continue;
      dist[a] = dist[g] + 1; q.push(a);
    }
  }
  return dist; // -1 = dead square
}

// Four crates or walls in a 2x2 block cannot move; dead unless every crate in it sits on a spot.
export function frozenSquare(lv, occ, t) {
  const x = t % lv.w, y = (t / lv.w) | 0;
  const at = (cx, cy) => (cx < 0 || cy < 0 || cx >= lv.w || cy >= lv.h || !lv.inside[cy * lv.w + cx] ? -1 : cy * lv.w + cx);
  const blocked = (i) => i < 0 || occ[i];
  for (const dy of [-1, 1]) for (const dx of [-1, 1]) {
    const sq = [t, at(x, y + dy), at(x + dx, y), at(x + dx, y + dy)];
    if (sq.every(blocked) && sq.some((i) => i >= 0 && !lv.goal[i])) return true;
  }
  return false;
}

// Push-optimal A* over crate positions. The worker position is normalised to the smallest
// reachable cell, so states that differ only by where the worker stands are merged.
// Returns {pushes, lines, pushList:[{from, dir}], moves: 'udlr' string with capitals for pushes, nodes} or null.
export function solve(lv, { maxNodes = 2e6, boxes = lv.boxes, player = lv.player } = {}) {
  const n = lv.w * lv.h;
  if (n > 128) throw new Error('board too big for the solver');
  const live = liveSquares(lv), nb = boxes.length;
  if (boxes.some((b) => live[b] < 0)) return null;
  const NB = new Int16Array(n * 4).fill(-1);
  for (let i = 0; i < n; i++) if (lv.inside[i]) for (let d = 0; d < 4; d++) NB[i * 4 + d] = step(lv, i, d);
  const occ = new Uint8Array(n), seen = new Uint8Array(n), stack = new Int16Array(n);
  const P = [1]; for (let k = 1; k <= nb; k++) P.push(P[k - 1] * 128);
  const reachMin = (p) => { // flood fill from p, marks seen[], returns smallest cell
    seen.fill(0); let top = 0, mn = p; stack[top++] = p; seen[p] = 1;
    while (top) { const i = stack[--top]; if (i < mn) mn = i; for (let d = 0; d < 4; d++) { const j = NB[i * 4 + d]; if (j >= 0 && !seen[j] && !occ[j]) { seen[j] = 1; stack[top++] = j; } } }
    return mn;
  };
  const enc = (bx, p) => { let k = 0; for (let i = 0; i < nb; i++) k += bx[i] * P[i]; return k + p * P[nb]; };
  const heur = (bx) => { let s = 0; for (const b of bx) s += live[b]; return s; };

  const keys = [], par = [], mv = [], gs = [], players = [], index = new Map(), closed = [];
  const buckets = [];
  const push = (f, id) => { (buckets[f] || (buckets[f] = [])).push(id); };
  const start = boxes.slice().sort((a, b) => a - b);
  start.forEach((b) => (occ[b] = 1));
  const k0 = enc(start, reachMin(player));
  start.forEach((b) => (occ[b] = 0));
  index.set(k0, 0); keys.push(k0); par.push(-1); mv.push(-1); gs.push(0); players.push(player); closed.push(false);
  push(heur(start), 0);
  const bx = new Array(nb);
  for (let f = 0; f < buckets.length; f++) {
    const bucket = buckets[f]; if (!bucket) continue;
    while (bucket.length) {
      const id = bucket.pop();
      if (closed[id] || gs[id] + heur(decode(keys[id])) !== f) continue;
      closed[id] = true;
      const cur = decode(keys[id]);
      if (cur.every((b) => lv.goal[b])) return finish(id, keys.length);
      cur.forEach((b) => (occ[b] = 1));
      reachMin(players[id]);
      const reach = seen.slice();
      for (let bi = 0; bi < nb; bi++) {
        const b = cur[bi];
        for (let d = 0; d < 4; d++) {
          const t = NB[b * 4 + d], from = NB[b * 4 + ((d + 2) & 3)];
          if (t < 0 || from < 0 || occ[t] || !reach[from] || live[t] < 0) continue;
          occ[b] = 0; occ[t] = 1;
          if (!frozenSquare(lv, occ, t)) {
            for (let i = 0; i < nb; i++) bx[i] = i === bi ? t : cur[i];
            const sorted = bx.slice().sort((x, y) => x - y);
            const k = enc(sorted, reachMin(b));
            const g = gs[id] + 1;
            let cid = index.get(k);
            if (cid === undefined) {
              cid = keys.length; index.set(k, cid); keys.push(k); par.push(id); mv.push(b * 4 + d); gs.push(g); players.push(b); closed.push(false);
              push(g + heur(sorted), cid);
            } else if (!closed[cid] && g < gs[cid]) { gs[cid] = g; par[cid] = id; mv[cid] = b * 4 + d; players[cid] = b; push(g + heur(sorted), cid); }
          }
          occ[t] = 0; occ[b] = 1;
        }
      }
      cur.forEach((b) => (occ[b] = 0));
      if (keys.length > maxNodes) return null;
    }
  }
  return null;

  function decode(k) {
    const out = new Array(nb);
    for (let i = 0; i < nb; i++) { out[i] = k % 128; k = Math.floor(k / 128); }
    return out;
  }
  function finish(id, nodes) {
    const list = [];
    for (let c = id; par[c] >= 0; c = par[c]) list.push({ from: mv[c] >> 2, dir: mv[c] & 3 });
    list.reverse();
    // replay to build the full move string and count box lines (runs of one crate in one direction)
    const set = new Set(boxes); let p = player, moves = '', lines = 0, last = null;
    for (const { from, dir } of list) {
      const stand = step(lv, from, (dir + 2) & 3);
      moves += walkPath(lv, set, p, stand).map((d) => DIRS[d]).join('') + DIRS[dir].toUpperCase();
      set.delete(from); set.add(step(lv, from, dir)); p = from;
      if (!last || last.to !== from || last.dir !== dir) lines++;
      last = { to: step(lv, from, dir), dir };
    }
    return { pushes: list.length, lines, pushList: list, moves, nodes };
  }
}
