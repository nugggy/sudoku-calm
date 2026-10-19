// Arrow Away engine: arrows that wind across a grid and leave in the direction they point.
// Shared by the game screen and tools/test-arrow.mjs, so it has no browser dependencies.
//
// A level is {w, h, mask, arrows}. mask[i] is true for cells that belong to the board.
// Each arrow is {cells, dir, c}: cells run from the tail to the head, dir is where the head points,
// and c is a colour index (neighbouring arrows get different colours).
//
// Levels are built backwards. Arrows are placed one at a time, and each new arrow's path out
// (the straight line from its head to the edge) must miss every arrow placed before it. Taking the
// arrows away in reverse order therefore always works. Removing an arrow only ever frees space,
// so tapping any arrow that can leave never spoils the puzzle.
import { mulberry32 } from './sudoku-engine.js';

export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left
export const COLOURS = 10;

const SHAPES = ['circle', 'heart', 'diamond', 'plus'];
function inShape(shape, x, y, w, h) {
  const u = ((x + 0.5) / w) * 2 - 1, v = ((y + 0.5) / h) * 2 - 1;
  if (shape === 'circle') return u * u + v * v <= 1.08;
  if (shape === 'diamond') return Math.abs(u) + Math.abs(v) <= 1.15;
  if (shape === 'plus') return Math.abs(u) < 0.42 || Math.abs(v) < 0.42;
  if (shape === 'heart') { const X = u * 1.3, Y = -v * 1.35 + 0.25, a = X * X + Y * Y - 1; return a * a * a - X * X * Y * Y * Y <= 0; }
  return true;
}

// Board size and shape for level i: small boards first, growing to about 12 x 16, then varied sizes.
export function levelShape(i) {
  const rng = mulberry32(i * 2654435761 + 97);
  let w, h;
  if (i < 80) { const t = Math.pow(i / 80, 0.85); w = 4 + Math.round(8 * t); h = 5 + Math.round(11 * t); }
  else { w = 10 + Math.floor(rng() * 4); h = 14 + Math.floor(rng() * 5); }
  const shape = i >= 10 && i % 5 === 4 ? SHAPES[Math.floor(i / 5) % SHAPES.length] : 'rect';
  if (shape !== 'rect') { w = Math.min(14, w + 2); h = Math.min(18, h + 2); }
  return { w, h, shape };
}

export function makeLevel(i) {
  const { w, h, shape } = levelShape(i);
  const rng = mulberry32((i + 1) * 7919 + 13);
  const n = w * h;
  const mask = [...Array(n)].map((_, k) => inShape(shape, k % w, Math.floor(k / w), w, h));
  const occ = new Int16Array(n).fill(-1);
  const arrows = [];
  const t = Math.min(1, i / 60);
  const maxLen = Math.round(3 + 5 * t);
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const shuffle = (a) => { for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };
  const rayOf = (head, d) => {
    const out = []; let x = head % w + DIRS[d][0], y = Math.floor(head / w) + DIRS[d][1];
    while (inside(x, y)) { out.push(y * w + x); x += DIRS[d][0]; y += DIRS[d][1]; }
    return out;
  };
  const free = (k) => mask[k] && occ[k] < 0;

  function tryPlace(head) {
    for (const d of shuffle([0, 1, 2, 3])) {
      const ray = rayOf(head, d);
      if (ray.some((k) => occ[k] >= 0)) continue;
      const bx = head % w - DIRS[d][0], by = Math.floor(head / w) - DIRS[d][1];
      if (!inside(bx, by) || !free(by * w + bx)) continue;
      const onRay = new Set(ray);
      const body = [head, by * w + bx];
      const len = 2 + Math.floor(rng() * (maxLen - 1));
      let straight = 0;
      while (body.length < len) {
        const cur = body[body.length - 1], cx = cur % w, cy = Math.floor(cur / w);
        const prev = body[body.length - 2], pdx = cx - prev % w, pdy = cy - Math.floor(prev / w);
        const opts = [];
        for (const [dx, dy] of DIRS) {
          const nx = cx + dx, ny = cy + dy, k = ny * w + nx;
          if (!inside(nx, ny) || !free(k) || onRay.has(k) || body.includes(k)) continue;
          // favour turns once the arrow has run straight for a while, so paths wind
          const same = dx === pdx && dy === pdy;
          opts.push({ k, wgt: same ? (straight >= 2 ? 0.4 : 1.4) : 1 });
        }
        if (!opts.length) break;
        let r = rng() * opts.reduce((a, o) => a + o.wgt, 0), pick = opts[0];
        for (const o of opts) { r -= o.wgt; if (r <= 0) { pick = o; break; } }
        const nx = pick.k % w, ny = Math.floor(pick.k / w);
        straight = nx - cx === pdx && ny - cy === pdy ? straight + 1 : 0;
        body.push(pick.k);
      }
      const id = arrows.length;
      body.forEach((k) => { occ[k] = id; });
      arrows.push({ cells: body.reverse(), dir: d });
      return true;
    }
    return false;
  }

  // keep sweeping the empty cells until nothing more fits
  for (let pass = 0; pass < 6; pass++) {
    let placed = 0;
    for (const k of shuffle([...Array(n).keys()].filter(free))) if (free(k) && tryPlace(k)) placed++;
    if (!placed) break;
  }

  // Grow tails into leftover gaps. A cell can join arrow j only if it is not on arrow j's own path
  // out, and not on the path out of any arrow placed after j (that arrow must leave while j is still there).
  for (let round = 0; round < 3; round++) {
    const rayBy = [...Array(n)].map(() => []);
    arrows.forEach((a, id) => rayOf(a.cells[a.cells.length - 1], a.dir).forEach((k) => rayBy[k].push(id)));
    let grown = 0;
    for (const k of [...Array(n).keys()].filter(free)) {
      const x = k % w, y = Math.floor(k / w);
      for (const [dx, dy] of shuffle(DIRS.slice())) {
        const nx = x + dx, ny = y + dy;
        if (!inside(nx, ny)) continue;
        const j = occ[ny * w + nx];
        if (j < 0 || arrows[j].cells[0] !== ny * w + nx || arrows[j].cells.length >= maxLen + 2) continue;
        if (rayBy[k].some((id) => id >= j)) continue;
        arrows[j].cells.unshift(k); occ[k] = j; grown++;
        break;
      }
    }
    if (!grown) break;
  }

  // colour so that touching arrows differ
  const order = shuffle([...Array(COLOURS).keys()]);
  arrows.forEach((a, id) => {
    const near = new Set();
    for (const k of a.cells) {
      const x = k % w, y = Math.floor(k / w);
      for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (inside(nx, ny)) { const o = occ[ny * w + nx]; if (o >= 0 && o < id) near.add(arrows[o].c); } }
    }
    const start = Math.floor(rng() * COLOURS);
    for (let s = 0; s < COLOURS; s++) { const c = order[(start + s) % COLOURS]; if (!near.has(c)) { a.c = c; break; } }
    if (a.c === undefined) a.c = order[start];
  });

  return { w, h, shape, mask, arrows };
}

// Which arrow (if any) sits on each cell, ignoring removed ones. removed is an array of booleans.
export function occupancy(level, removed) {
  const occ = new Int16Array(level.w * level.h).fill(-1);
  level.arrows.forEach((a, id) => { if (!removed[id]) a.cells.forEach((k) => { occ[k] = id; }); });
  return occ;
}

// Can arrow id leave? blockSteps is how many cells ahead of the head the blocker is,
// and edgeSteps how far the head travels to cross the edge when the way is clear.
export function canExit(level, removed, id, occ = occupancy(level, removed)) {
  const { w, h } = level, a = level.arrows[id], head = a.cells[a.cells.length - 1], [dx, dy] = DIRS[a.dir];
  let x = head % w, y = Math.floor(head / w), s = 0;
  for (;;) {
    x += dx; y += dy; s++;
    if (x < 0 || y < 0 || x >= w || y >= h) return { ok: true, edgeSteps: s };
    const o = occ[y * w + x];
    if (o >= 0 && o !== id) return { ok: false, blockSteps: s, blocker: o };
  }
}

export const isSolved = (level, removed) => level.arrows.every((_, id) => removed[id]);

// Any arrow that can leave right now, or -1.
export function hint(level, removed) {
  const occ = occupancy(level, removed);
  for (let id = level.arrows.length - 1; id >= 0; id--) if (!removed[id] && canExit(level, removed, id, occ).ok) return id;
  return -1;
}
