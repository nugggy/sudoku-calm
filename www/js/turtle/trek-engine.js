// Tortoise Trek rules and solver, shared by the game, tools/gen-turtle-trek.mjs and tools/test-turtle.mjs.
// A level is rows of text: '#' rock, '.' sand, 'o' mud (stops the tortoise), 'S' start, 'L' lettuce.
// The tortoise slides in a straight line until the next square is a rock or the edge, or it lands in mud.
// It must come to rest on the lettuce.
export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export function parse(rows) {
  const h = rows.length, w = rows[0].length, cells = [];
  let start = 0, goal = 0;
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    const i = y * w + x;
    cells[i] = ch === '#' ? '#' : ch === 'o' ? 'o' : '.';
    if (ch === 'S') start = i;
    if (ch === 'L') goal = i;
  }));
  return { w, h, cells, start, goal };
}

// Where the tortoise stops when it slides from square i in direction d. Returns i if it cannot move.
export function slide(lv, i, d) {
  const [dx, dy] = DIRS[d];
  let x = i % lv.w, y = (i - x) / lv.w;
  for (;;) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= lv.w || ny >= lv.h) break;
    const c = lv.cells[ny * lv.w + nx];
    if (c === '#') break;
    x = nx; y = ny;
    if (c === 'o') break;
  }
  return y * lv.w + x;
}
// The squares passed over on the way (for the animation and for eating the lettuce in passing: it does not count).
export function path(lv, i, d) {
  const out = [i], end = slide(lv, i, d), [dx, dy] = DIRS[d];
  let j = i;
  while (j !== end) { j += dy * lv.w + dx; out.push(j); }
  return out;
}

// Breadth-first search for the fewest slides. Returns the list of directions, or null if it cannot be done.
export function solve(lv) {
  const prev = new Map([[lv.start, null]]), q = [lv.start];
  for (let k = 0; k < q.length; k++) {
    const i = q[k];
    if (i === lv.goal) {
      const moves = []; let j = i;
      while (prev.get(j)) { const [p, d] = prev.get(j); moves.unshift(d); j = p; }
      return moves;
    }
    for (const d of Object.keys(DIRS)) {
      const n = slide(lv, i, d);
      if (n !== i && !prev.has(n)) { prev.set(n, [i, d]); q.push(n); }
    }
  }
  return null;
}
