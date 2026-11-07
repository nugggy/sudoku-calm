// Bubble Pop: the grid, shots and bounces, popping and dropping, and that a simple player can clear every level
// within its shots.
//   node tools/test-bubble.mjs
import { COLS, ROW_H, rowLen, cellX, cellY, neighbours, get, count, trace, place, points, level, LEVEL_COUNT, pushRows, nextColour, seeded, lowest, starsFor } from '../www/js/bubble-engine.js';

let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log('FAIL', msg); } };
const clone = (b) => b.map((r) => r.slice());
const board = (rows) => rows.map((s, r) => s.split('').slice(0, rowLen(r)).map((ch) => (ch === '.' ? -1 : +ch)));

// ---------- Grid ----------
check(rowLen(0) === COLS && rowLen(1) === COLS - 1, 'odd rows are one shorter');
check(neighbours(0, 0).length === 2 && neighbours(1, 3).length === 6, 'neighbour counts');
for (let r = 0; r < 6; r++) for (let c = 0; c < rowLen(r); c++) for (const [a, z] of neighbours(r, c)) {
  const d = Math.hypot(cellX(r, c) - cellX(a, z), cellY(r) - cellY(a));
  check(Math.abs(d - 1) < 1e-9, `neighbours ${r},${c} and ${a},${z} are one bubble apart`);
}

// ---------- Shots ----------
{
  const b = [];
  const t = trace(b, COLS / 2, 14, 0);
  check(t.cell[0] === 0 && t.cell[1] === 4, `straight up an empty board sticks to the ceiling in the middle (${t.cell})`);
  const s = trace(b, COLS / 2, 14, 0.6);
  check(s.path.length >= 3, 'an angled shot bounces off the wall');
  check(s.path.every(([x]) => x >= 0.5 - 1e-9 && x <= COLS - 0.5 + 1e-9), 'shots stay inside the walls');
}
{
  const b = board(['000000000', '........']);
  const t = trace(b, COLS / 2, 14, 0);
  check(t.cell[0] === 1, `a shot under a full row sticks below it (${t.cell})`);
}

// ---------- Popping and dropping ----------
{
  const b = board(['112222222', '1.......', '3........']);
  b[2][0] = 3; // hangs from row 1, which hangs from the ones on row 0
  const res = place(b, 1, 1, 1);
  check(res.popped.length === 4, `four 1s pop (${res.popped.length})`);
  check(res.dropped.some(([r, c]) => r === 2 && c === 0), 'the 3 below them drops');
  check(get(b, 2, 0) === -1 && count(b) === 7, 'only the 2s are left');
}
{
  const b = board(['12', '3']);
  const res = place(b, 1, 1, 1);
  check(res.popped.length === 0 && res.dropped.length === 0, 'two of a colour do not pop');
  check(points({ popped: [1, 2, 3], dropped: [] }) === 30 && points({ popped: [1, 2, 3], dropped: [1, 2, 3, 4, 5] }) > 30 + 100, 'drops are worth more in bulk');
}
{
  const b = board(['012345012', '01234501']);
  pushRows(b, seeded(3), 4);
  check(b.length === 4 && b.every((row, r) => row.length === rowLen(r)), 'new rows keep every row the right width');
}

// ---------- Levels ----------
// A simple player: try many angles, keep the shot that scores most, otherwise one that lands next to its own colour.
function bestShot(b, colour, rows) {
  let best = null;
  for (let a = -1.4; a <= 1.4; a += 0.025) {
    const t = trace(b, COLS / 2, rows, a);
    if (!t.cell) continue;
    const bb = clone(b), res = place(bb, t.cell[0], t.cell[1], colour);
    const near = neighbours(...t.cell).filter(([r, c]) => get(b, r, c) === colour).length;
    const score = points(res) * 10 + near - t.cell[0] * 0.01;
    if (!best || score > best.score) best = { score, a, cell: t.cell };
  }
  return best;
}
let cleared = 0, starTotal = 0;
for (let n = 0; n < LEVEL_COUNT; n++) {
  const L = level(n), b = clone(L.board), rand = seeded(L.seed), base = 15;
  check(L.board.every((row, r) => row.length === rowLen(r)), `level ${n + 1} rows are the right width`);
  check(L.board[0].some((v) => v >= 0), `level ${n + 1} has bubbles on the top row`);
  let cur = nextColour(b, rand, L.colours), nxt = nextColour(b, rand, L.colours), shots = L.shots;
  while (shots > 0 && count(b)) {
    // swap when the other bubble scores better, as a player would
    const s1 = bestShot(b, cur, base), s2 = bestShot(b, nxt, base);
    if (s2.score > s1.score) [cur, nxt] = [nxt, cur];
    const s = s2.score > s1.score ? s2 : s1;
    place(b, s.cell[0], s.cell[1], cur);
    shots--;
    if (lowest(b) > 13) break;
    cur = nxt; nxt = nextColour(b, rand, L.colours);
  }
  if (!count(b)) { cleared++; starTotal += starsFor(shots, L.shots); }
  else if (n < 20) check(false, `level ${n + 1} can be cleared within ${L.shots} shots (${count(b)} left)`);
}
console.log(`Simple player cleared ${cleared} of ${LEVEL_COUNT} levels, ${starTotal} stars`);
check(cleared >= LEVEL_COUNT * 0.85, `most levels can be cleared by a simple player (${cleared})`);

console.log(fails ? `${fails} failed` : 'All Bubble Pop checks passed');
process.exit(fails ? 1 : 0);
