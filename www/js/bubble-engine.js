// Bubble Pop rules (no browser dependencies, tested by tools/test-bubble.mjs).
//
// Bubbles sit on a hex grid COLS wide, with every odd row shifted half a bubble right (so odd rows hold one fewer).
// Sizes are in bubble diameters: the board is COLS wide, rows are ROW_H apart. A shot travels in a straight line,
// bounces off the side walls, and sticks in the free cell nearest to where it touches a bubble or the ceiling.
// Three or more of one colour joined together pop, then anything no longer hanging from the ceiling drops.
export const COLS = 9;
export const ROW_H = Math.sqrt(3) / 2;
export const COLOURS = 6;

export const rowLen = (r) => (r % 2 ? COLS - 1 : COLS);
export const cellX = (r, c) => c + 0.5 + (r % 2 ? 0.5 : 0);
export const cellY = (r) => r * ROW_H + 0.5;
export const inside = (r, c) => r >= 0 && c >= 0 && c < rowLen(r);
export function neighbours(r, c) {
  const o = r % 2 ? 1 : 0;
  return [[r, c - 1], [r, c + 1], [r - 1, c - 1 + o], [r - 1, c + o], [r + 1, c - 1 + o], [r + 1, c + o]].filter(([a, b]) => inside(a, b));
}

// A board is an array of rows, each an array of colour numbers (0 to COLOURS - 1) or -1 for empty.
export const emptyRow = (r) => new Array(rowLen(r)).fill(-1);
export const get = (b, r, c) => (b[r] && b[r][c] !== undefined ? b[r][c] : -1);
export function set(b, r, c, v) { while (b.length <= r) b.push(emptyRow(b.length)); b[r][c] = v; }
export const count = (b) => b.reduce((n, row) => n + row.filter((v) => v >= 0).length, 0);
export const coloursLeft = (b) => [...new Set(b.flat().filter((v) => v >= 0))].sort((a, z) => a - z);
export function trim(b) { while (b.length && b[b.length - 1].every((v) => v < 0)) b.pop(); return b; }
export const lowest = (b) => { for (let r = b.length - 1; r >= 0; r--) if (b[r].some((v) => v >= 0)) return r; return -1; };

// ---------- Shooting ----------
// Follows a shot from (x, y) at angle a (radians, measured from straight up, positive to the right).
// Returns { path: [[x, y], ...] (start, each bounce, the end), cell: [r, c] } where the bubble comes to rest.
export function trace(b, x, y, a, maxBounces = 12) {
  let dx = Math.sin(a), dy = -Math.cos(a);
  const path = [[x, y]], step = 0.05;
  for (let i = 0; i < 4000; i++) {
    x += dx * step; y += dy * step;
    if (x < 0.5) { x = 1 - x; dx = -dx; path.push([0.5, y]); if (path.length > maxBounces + 1) break; }
    if (x > COLS - 0.5) { x = 2 * (COLS - 0.5) - x; dx = -dx; path.push([COLS - 0.5, y]); if (path.length > maxBounces + 1) break; }
    if (y <= 0.5) { path.push([x, 0.5]); return { path, cell: snap(b, x, 0.5) }; }
    // touching a bubble: centres closer than about one diameter (a little less, so shots can slip through gaps)
    const r0 = Math.max(0, Math.floor((y - 0.5) / ROW_H) - 1);
    for (let r = r0; r <= r0 + 2 && r < b.length; r++) {
      for (let c = 0; c < rowLen(r); c++) {
        if (get(b, r, c) < 0) continue;
        const ex = cellX(r, c) - x, ey = cellY(r) - y;
        if (ex * ex + ey * ey < 0.85 * 0.85) { path.push([x, y]); return { path, cell: snap(b, x, y) }; }
      }
    }
  }
  path.push([x, y]);
  return { path, cell: snap(b, x, y) };
}

// The free cell nearest to a point that is attached to the ceiling or to a bubble.
export function snap(b, x, y) {
  let best = null, bd = Infinity;
  const r0 = Math.max(0, Math.round((y - 0.5) / ROW_H) - 1);
  for (let r = r0; r <= r0 + 2; r++) {
    for (let c = 0; c < rowLen(r); c++) {
      if (get(b, r, c) >= 0) continue;
      if (r > 0 && !neighbours(r, c).some(([a, z]) => get(b, a, z) >= 0)) continue;
      const d = (cellX(r, c) - x) ** 2 + (cellY(r) - y) ** 2;
      if (d < bd) { bd = d; best = [r, c]; }
    }
  }
  return best || [Math.max(0, r0), Math.max(0, Math.min(rowLen(Math.max(0, r0)) - 1, Math.round(x - 0.5)))];
}

// Places a bubble and works out what happens. Returns { popped: [[r, c, colour]], dropped: [[r, c, colour]] }.
export function place(b, r, c, colour) {
  set(b, r, c, colour);
  const group = flood(b, r, c, (v) => v === colour);
  const popped = [], dropped = [];
  if (group.length >= 3) {
    for (const [a, z] of group) { popped.push([a, z, colour]); b[a][z] = -1; }
    // anything not joined to the ceiling falls
    const held = new Set();
    for (let k = 0; k < rowLen(0); k++) if (get(b, 0, k) >= 0) for (const [a, z] of flood(b, 0, k, (v) => v >= 0)) held.add(a * 100 + z);
    for (let a = 0; a < b.length; a++) for (let z = 0; z < b[a].length; z++) if (b[a][z] >= 0 && !held.has(a * 100 + z)) { dropped.push([a, z, b[a][z]]); b[a][z] = -1; }
  }
  trim(b);
  return { popped, dropped };
}
function flood(b, r, c, ok) {
  const seen = new Set([r * 100 + c]), out = [[r, c]];
  for (let i = 0; i < out.length; i++) for (const [a, z] of neighbours(...out[i])) {
    const k = a * 100 + z;
    if (!seen.has(k) && ok(get(b, a, z))) { seen.add(k); out.push([a, z]); }
  }
  return out;
}

// Points: 10 for each popped bubble, and dropped bubbles are worth more the more of them fall at once.
export const points = (res) => res.popped.length * 10 + res.dropped.length * 20 * (1 + Math.floor(res.dropped.length / 5));

// ---------- Endless ----------
// New bubbles push in from the top two rows at a time, so every row keeps its offset and width.
export function pushRows(b, rand, colours) {
  b.unshift(emptyRow(0).map(() => Math.floor(rand() * colours)), emptyRow(1).map(() => Math.floor(rand() * colours)));
  return b;
}

// ---------- Levels ----------
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
export const LEVEL_COUNT = 60;
// Level n (from 0): how many colours, rows and shots, and a pattern. Early levels are small with few colours.
export function level(n) {
  const r = rng(n * 7919 + 13);
  const colours = Math.min(COLOURS, 3 + Math.floor(n / 10));
  const rows = Math.min(11, 4 + Math.floor(n / 6) + (n % 3 === 2 ? 1 : 0));
  const pattern = ['rows', 'stripes', 'diamond', 'clusters', 'wave', 'checks'][n % 6];
  const b = [];
  for (let y = 0; y < rows; y++) {
    const row = emptyRow(y);
    for (let x = 0; x < row.length; x++) {
      let v;
      if (pattern === 'rows') v = Math.floor(y / 2) % colours;
      else if (pattern === 'stripes') v = Math.floor(x / 2) % colours;
      else if (pattern === 'diamond') v = (Math.abs(x - 4) + Math.abs(y - rows / 2) | 0) % colours;
      else if (pattern === 'wave') v = Math.floor((x + Math.round(Math.sin(y) * 2) + 10) / 3) % colours;
      else if (pattern === 'checks') v = (Math.floor(x / 3) + Math.floor(y / 2)) % colours;
      else v = -2;
      row[x] = v;
    }
    b.push(row);
  }
  // clusters, and some randomness in every pattern so no two levels play the same
  for (let y = 0; y < rows; y++) for (let x = 0; x < b[y].length; x++) {
    if (b[y][x] === -2) b[y][x] = Math.floor(r() * colours);
    else if (r() < 0.12 + n * 0.004) b[y][x] = Math.floor(r() * colours);
  }
  // gaps in later levels (never in the top row, so nothing starts loose)
  if (n >= 8) for (let y = 1; y < rows; y++) for (let x = 0; x < b[y].length; x++) if (r() < 0.06) b[y][x] = -1;
  dropLoose(b);
  const total = count(b);
  const shots = Math.ceil(total / (2.6 - Math.min(0.9, n * 0.015))) + 4;
  return { board: trim(b), colours, shots, seed: n * 31 + 7 };
}
function dropLoose(b) {
  const held = new Set();
  for (let k = 0; k < rowLen(0); k++) if (get(b, 0, k) >= 0) for (const [a, z] of flood(b, 0, k, (v) => v >= 0)) held.add(a * 100 + z);
  for (let a = 0; a < b.length; a++) for (let z = 0; z < b[a].length; z++) if (b[a][z] >= 0 && !held.has(a * 100 + z)) b[a][z] = -1;
}
export const starsFor = (shotsLeft, shots) => (shotsLeft >= shots * 0.3 ? 3 : shotsLeft >= shots * 0.12 ? 2 : 1);

// The next bubble: a colour still on the board (any colour once it is empty).
export function nextColour(b, rand, colours) {
  const left = coloursLeft(b);
  return left.length ? left[Math.floor(rand() * left.length)] : Math.floor(rand() * colours);
}
export { rng as seeded };
