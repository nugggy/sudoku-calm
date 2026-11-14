// Rules for Snakes and Ladders in Play Together. No browser dependencies, so tools/test-duo-ludo.mjs can check
// the board and play whole games in Node. Every state is plain JSON; the roller's phone draws the number and
// sends it, and both phones apply it the same way.
//
// Squares 1 to 100 snake up the board from the bottom left (row by row, turning at each end), so 100 is at the
// top left. Counters start off the board (0) and enter with the first roll. A 6 earns another roll. The exact
// number is needed to land on 100: any steps left over bounce back down.

// Ladders climb from foot to top, snakes slide from head to tail. A fixed layout spread over the board, with no
// square used twice, nothing on 100, and long and short ones in both halves of the board.
export const LADDERS = { 3: 22, 8: 26, 20: 41, 28: 55, 50: 69, 57: 76, 71: 92, 80: 99 };
export const SNAKES = { 16: 6, 33: 11, 47: 25, 62: 19, 74: 53, 89: 68, 95: 75, 98: 78 };
export const SNL_JUMPS = { ...LADDERS, ...SNAKES };
export const SNL_END = 100;

// Column (0 at the left) and row (0 at the bottom) of square n.
export function snlCell(n) {
  const row = Math.floor((n - 1) / 10), k = (n - 1) % 10;
  return { col: row % 2 ? 9 - k : k, row };
}

export function snlNew(first = 0) {
  return { pos: [0, 0], turn: first, over: false, winner: null };
}

// Square reached from `from` with a roll of d, before any ladder or snake, and the squares stepped on.
export function snlSteps(from, d) {
  const steps = [];
  let at = from, dir = 1;
  for (let k = 0; k < d; k++) {
    if (at === SNL_END) dir = -1;
    at += dir;
    steps.push(at);
  }
  return steps;
}

// Rolls d for the player to move and moves their counter. Returns {player, d, from, steps, land, jump, to,
// bounce, extra, win}: steps are the squares walked, land where the walk stopped, and jump the ladder or
// snake taken from there ({from, to, kind: 'ladder' | 'snake'}) or null.
export function snlRoll(s, d) {
  if (s.over || !(d >= 1 && d <= 6)) return null;
  const p = s.turn, from = s.pos[p], steps = snlSteps(from, d), land = steps[steps.length - 1];
  const to = SNL_JUMPS[land] || land;
  const jump = to !== land ? { from: land, to, kind: to > land ? 'ladder' : 'snake' } : null;
  s.pos[p] = to;
  const win = to === SNL_END, extra = !win && d === 6;
  if (win) { s.over = true; s.winner = p; } else if (!extra) s.turn = 1 - p;
  return { player: p, d, from, steps, land, jump, to, bounce: from + d > SNL_END, extra, win };
}
