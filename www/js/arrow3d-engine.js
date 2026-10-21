// Arrow Away in 3D: arrows on the surface of open shapes (an open box, a channel, steps and so on).
// Shared by the game screen and tools/test-arrow.mjs, so it has no browser dependencies.
//
// The surface is a set of unit square tiles. Each tile has a centre, an outward normal and four directions
// along it. Walking off a tile carries on to the next tile in that direction, folding up a wall, over an edge
// or straight on. Where nothing carries on, that side of the tile is an open rim.
//
// An arrow slides the way its head points, straight along the surface and round any folds, and leaves at a rim.
// A way out that runs round the shape and back on itself never reaches a rim, so no arrow is given one.
// Levels are built backwards, as in 2D: each new arrow's way out must miss every arrow placed before it,
// so taking them away in reverse order always works.
import { mulberry32 } from './sudoku-engine.js';

export const COLOURS = 10;

// ---------- vectors (plain arrays) ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const neg = (a) => [-a[0], -a[1], -a[2]];
const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

// ---------- shapes ----------
// Each shape lists tiles as {c: centre, n: normal}. Normals face the side the arrows are drawn on.
function tilesOf(shape, a, b, h) {
  const t = [];
  const floor = (y = 0) => { for (let x = 0; x < a; x++) for (let z = 0; z < b; z++) t.push({ c: [x + 0.5, y, z + 0.5], n: Y }); };
  if (shape === 'corner') {          // a floor and the wall behind it
    floor();
    for (let x = 0; x < a; x++) for (let y = 0; y < h; y++) t.push({ c: [x + 0.5, y + 0.5, 0], n: Z });
  } else if (shape === 'channel') {  // a floor between two walls
    floor();
    for (let z = 0; z < b; z++) for (let y = 0; y < h; y++) { t.push({ c: [0, y + 0.5, z + 0.5], n: X }); t.push({ c: [a, y + 0.5, z + 0.5], n: neg(X) }); }
  } else if (shape === 'box') {      // an open box, seen from inside
    floor();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < a; x++) { t.push({ c: [x + 0.5, y + 0.5, 0], n: Z }); t.push({ c: [x + 0.5, y + 0.5, b], n: neg(Z) }); }
      for (let z = 0; z < b; z++) { t.push({ c: [0, y + 0.5, z + 0.5], n: X }); t.push({ c: [a, y + 0.5, z + 0.5], n: neg(X) }); }
    }
  } else if (shape === 'cube') {     // a box upside down, seen from outside: a lid and four sides, open underneath
    for (let x = 0; x < a; x++) for (let z = 0; z < b; z++) t.push({ c: [x + 0.5, h, z + 0.5], n: Y });
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < a; x++) { t.push({ c: [x + 0.5, y + 0.5, 0], n: neg(Z) }); t.push({ c: [x + 0.5, y + 0.5, b], n: Z }); }
      for (let z = 0; z < b; z++) { t.push({ c: [0, y + 0.5, z + 0.5], n: neg(X) }); t.push({ c: [a, y + 0.5, z + 0.5], n: X }); }
    }
  } else if (shape === 'steps') {    // a staircase climbing away from you: treads and risers, open at both ends
    for (let s = 0; s < h; s++) {
      for (let x = 0; x < a; x++) for (let z = 0; z < b; z++) t.push({ c: [x + 0.5, s, s * b + z + 0.5], n: Y }); // tread
      if (s + 1 < h) for (let x = 0; x < a; x++) t.push({ c: [x + 0.5, s + 0.5, (s + 1) * b], n: neg(Z) });         // riser
    }
  } else if (shape === 'peak') {     // two roof slopes meeting at a ridge, with a gable end wall
    for (let x = 0; x < a; x++) for (let y = 0; y < h; y++) { t.push({ c: [x + 0.5, y + 0.5, 0], n: neg(Z) }); t.push({ c: [x + 0.5, y + 0.5, b], n: Z }); }
    for (let x = 0; x < a; x++) for (let z = 0; z < b; z++) t.push({ c: [x + 0.5, h, z + 0.5], n: Y });
    for (let z = 0; z < b; z++) for (let y = 0; y < h; y++) t.push({ c: [a, y + 0.5, z + 0.5], n: X });
  }
  return t;
}
export const SHAPES3D = ['corner', 'channel', 'cube', 'box', 'steps', 'peak'];
export const SHAPE_NAMES = { corner: 'Corner', channel: 'Channel', cube: 'Cube', box: 'Open box', steps: 'Steps', peak: 'Roof' };

const key = (c, n) => `${Math.round(c[0] * 2)},${Math.round(c[1] * 2)},${Math.round(c[2] * 2)},${n[0]},${n[1]},${n[2]}`;

// Build the surface: tiles with their four directions, and next[t*4+d] = the tile and direction you arrive with
// after stepping from tile t in direction d (-1 at a rim). Directions 0..3 are +u, +v, -u, -v; d+2 is the opposite.
export function buildSurface(tiles) {
  const at = new Map();
  tiles.forEach((t, i) => at.set(key(t.c, t.n), i));
  const cells = tiles.map((t) => {
    const n = t.n, u = n[0] ? Y : X, v = cross(n, u);
    return { c: t.c, n, dirs: [u, v, neg(u), neg(v)] };
  });
  const next = new Int32Array(cells.length * 4).fill(-1);
  cells.forEach((cl, i) => {
    for (let d = 0; d < 4; d++) {
      const tv = cl.dirs[d], h = sc(tv, 0.5), hn = sc(cl.n, 0.5);
      // a wall rising ahead, the same plane, or the surface folding away over an edge
      const tries = [[add(add(cl.c, h), hn), neg(tv), cl.n], [add(cl.c, tv), cl.n, tv], [add(add(cl.c, h), neg(hn)), tv, neg(cl.n)]];
      for (const [c2, n2, dir2] of tries) {
        const j = at.get(key(c2, n2));
        if (j === undefined) continue;
        const d2 = cells[j].dirs.findIndex((x) => eq(x, dir2));
        next[i * 4 + d] = j * 4 + d2;
        break;
      }
    }
  });
  return { cells, next };
}

// Size and shape for a 3D level: k counts 3D levels so far (0, 1, 2 ...), so they grow as you go.
export function shape3d(k) {
  const shape = SHAPES3D[k % SHAPES3D.length];
  const g = Math.min(4, Math.floor(k / SHAPES3D.length)); // 0 to 4
  const s = 3 + g;
  if (shape === 'steps') return { shape, a: s, b: 2, h: 2 + Math.min(3, g) };
  if (shape === 'cube' || shape === 'peak') return { shape, a: s, b: s, h: Math.max(2, s - 1) };
  return { shape, a: s, b: s, h: Math.max(2, s - 1) };
}

// The way out from a tile heading in direction d: the tiles crossed, and whether it ends at a rim (true)
// or comes back round to where it started (false).
export function rayOf(surf, t, d) {
  const out = [], seen = new Set([t * 4 + d]);
  let s = surf.next[t * 4 + d];
  while (s >= 0) {
    if (seen.has(s)) return { cells: out, exits: false };
    seen.add(s);
    out.push(s >> 2);
    s = surf.next[s];
  }
  return { cells: out, exits: true, lastDir: null };
}

export function make3DLevel(k, seed) {
  const spec = shape3d(k);
  const surf = buildSurface(tilesOf(spec.shape, spec.a, spec.b, spec.h));
  const n = surf.cells.length, rng = mulberry32(seed);
  const occ = new Int16Array(n).fill(-1), arrows = [];
  const maxLen = 3 + Math.min(5, 1 + Math.floor(k / 2));
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const free = (c) => occ[c] < 0;

  function tryPlace(head) {
    for (const d of shuffle([0, 1, 2, 3])) {
      const ray = rayOf(surf, head, d);
      if (!ray.exits || ray.cells.some((c) => occ[c] >= 0)) continue;
      // the neck is one step back from the head; arriving at the head from it must point the head along d
      const back = surf.next[head * 4 + ((d + 2) % 4)];
      if (back < 0) continue;
      const neck = back >> 2;
      if (!free(neck)) continue;
      const onRay = new Set(ray.cells);
      if (onRay.has(neck) || onRay.has(head)) continue;
      const body = [head, neck];
      const dirs = [d];          // direction of travel arriving at each body cell, head first (reversed later)
      let came = back & 3;       // we walked from head to neck heading this way
      const len = 2 + Math.floor(rng() * (maxLen - 1));
      let straight = 0;
      while (body.length < len) {
        const cur = body[body.length - 1], opts = [];
        for (let e = 0; e < 4; e++) {
          const s = surf.next[cur * 4 + e];
          if (s < 0) continue;
          const c = s >> 2;
          if (!free(c) || onRay.has(c) || body.includes(c)) continue;
          const same = e === came;
          opts.push({ s, e, wgt: same ? (straight >= 2 ? 0.4 : 1.4) : 1 });
        }
        if (!opts.length) break;
        let r = rng() * opts.reduce((a, o) => a + o.wgt, 0), pick = opts[0];
        for (const o of opts) { r -= o.wgt; if (r <= 0) { pick = o; break; } }
        straight = pick.e === came ? straight + 1 : 0;
        body.push(pick.s >> 2); came = pick.s & 3;
      }
      const id = arrows.length;
      body.forEach((c) => { occ[c] = id; });
      arrows.push({ cells: body.reverse(), dir: d });
      return true;
    }
    return false;
  }
  for (let pass = 0; pass < 6; pass++) {
    let placed = 0;
    for (const c of shuffle([...Array(n).keys()].filter(free))) if (free(c) && tryPlace(c)) placed++;
    if (!placed) break;
  }
  // grow tails into leftover gaps, never onto the way out of the arrow itself or of anything placed after it
  for (let round = 0; round < 3; round++) {
    const rayBy = [...Array(n)].map(() => []);
    arrows.forEach((a, id) => rayOf(surf, a.cells[a.cells.length - 1], a.dir).cells.forEach((c) => rayBy[c].push(id)));
    let grown = 0;
    for (const c of [...Array(n).keys()].filter(free)) {
      for (const e of shuffle([0, 1, 2, 3])) {
        const s = surf.next[c * 4 + e];
        if (s < 0) continue;
        const nb = s >> 2, j = occ[nb];
        if (j < 0 || arrows[j].cells[0] !== nb || arrows[j].cells.length >= maxLen + 2) continue;
        if (rayBy[c].some((id) => id >= j)) continue;
        arrows[j].cells.unshift(c); occ[c] = j; grown++;
        break;
      }
    }
    if (!grown) break;
  }
  // colour so that touching arrows differ
  const order = shuffle([...Array(COLOURS).keys()]);
  arrows.forEach((a, id) => {
    const near = new Set();
    for (const c of a.cells) for (let e = 0; e < 4; e++) { const s = surf.next[c * 4 + e]; if (s >= 0) { const o = occ[s >> 2]; if (o >= 0 && o < id) near.add(arrows[o].c); } }
    const start = Math.floor(rng() * COLOURS);
    for (let s = 0; s < COLOURS; s++) { const c = order[(start + s) % COLOURS]; if (!near.has(c)) { a.c = c; break; } }
    if (a.c === undefined) a.c = order[start];
  });
  return { kind: '3d', ...spec, surf, arrows, cellCount: n };
}

// ---------- playing ----------
export function occupancy3d(level, removed) {
  const occ = new Int16Array(level.cellCount).fill(-1);
  level.arrows.forEach((a, id) => { if (!removed[id]) a.cells.forEach((c) => { occ[c] = id; }); });
  return occ;
}

// Can arrow id leave? Same answer shape as the flat game's canExit.
export function canExit3d(level, removed, id, occ = occupancy3d(level, removed)) {
  const a = level.arrows[id], head = a.cells[a.cells.length - 1];
  const ray = rayOf(level.surf, head, a.dir);
  for (let s = 0; s < ray.cells.length; s++) {
    const o = occ[ray.cells[s]];
    if (o >= 0 && o !== id) return { ok: false, blockSteps: s + 1, blocker: o };
  }
  return { ok: ray.exits, edgeSteps: ray.cells.length + 1 };
}

export function hint3d(level, removed) {
  const occ = occupancy3d(level, removed);
  for (let id = level.arrows.length - 1; id >= 0; id--) if (!removed[id] && canExit3d(level, removed, id, occ).ok) return id;
  return -1;
}

// The 3D track an arrow slides along: tile centres from tail to head with the shared edge's midpoint between
// each pair (so the line bends neatly over folds), then on along its way out, then straight off the rim.
// Points are half a unit apart. Returns points and the surface normal at each, to lift the line off the tiles.
export function track3d(level, id, extra) {
  const { surf } = level, a = level.arrows[id], pts = [], nrm = [];
  const push = (p, n) => { pts.push(p); nrm.push(n); };
  const cellsOut = rayOf(surf, a.cells[a.cells.length - 1], a.dir).cells;
  const path = a.cells.concat(cellsOut);
  for (let i = 0; i < path.length; i++) {
    const cl = surf.cells[path[i]];
    if (i) {
      const pv = surf.cells[path[i - 1]];
      // the edge between two neighbouring tiles: halfway along the step out of the previous tile
      const dPrev = stepDir(surf, path[i - 1], path[i]);
      push(add(pv.c, sc(pv.dirs[dPrev], 0.5)), unit(add(pv.n, cl.n)));
    }
    push(cl.c, cl.n);
  }
  // off the rim: carry on in the direction of travel at the last tile
  const last = path[path.length - 1], lc = surf.cells[last];
  const lastDir = path.length > a.cells.length ? arriveDir(surf, path[path.length - 2], last) : a.dir;
  const dv = lc.dirs[lastDir];
  for (let s = 1; pts.length < (path.length * 2 - 1) + extra * 2; s++) push(add(lc.c, sc(dv, s * 0.5)), lc.n);
  return { pts, nrm };
}
function stepDir(surf, from, to) { for (let e = 0; e < 4; e++) { const s = surf.next[from * 4 + e]; if (s >= 0 && (s >> 2) === to) return e; } return 0; }
function arriveDir(surf, from, to) { for (let e = 0; e < 4; e++) { const s = surf.next[from * 4 + e]; if (s >= 0 && (s >> 2) === to) return s & 3; } return 0; }
function unit(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
