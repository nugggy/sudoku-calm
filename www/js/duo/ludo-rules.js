// Rules for Ludo in Play Together: two players on opposite corners, four pawns each. No browser
// dependencies, so tools/test-duo-ludo.mjs can use them. Every state is plain JSON and every roll and
// move is applied the same way on both phones (the roller's phone draws the number and sends it).
//
// A pawn's position is counted along its own path: -1 in the yard, 0 on its start square, 1..50 round
// the shared track, 51..55 up its home column and 56 home in the centre. A 6 brings a pawn out and earns
// another roll, but a third 6 in a row ends the turn without moving. Landing on the other player's pawns
// sends them back to the yard, except on the safe squares (the four start squares and the four stars).
// A pawn needs the exact number to reach home. With no legal move the turn passes.
export const LUDO = { TRACK: 52, LAST: 50, HOME: 56, PAWNS: 4 };
// where each player's path starts on the shared 52-square track (player 0 bottom left, player 1 top right)
export const LUDO_START = [39, 13];
// the start squares of all four corners and the star squares eight steps after each
export const LUDO_SAFE = [0, 8, 13, 21, 26, 34, 39, 47];
const SAFE = new Set(LUDO_SAFE);

// The 15 x 15 board, column and row from the top left. LUDO_TRACK[a] is track square a, clockwise from the
// top-left corner's start square; ludoCell(p, rel) maps a path position to its square.
export const LUDO_TRACK = [];
{
  const run = (c, r, dc, dr, n) => { for (let k = 0; k < n; k++) LUDO_TRACK.push([c + dc * k, r + dr * k]); };
  run(1, 6, 1, 0, 5); run(6, 5, 0, -1, 6); run(7, 0, 1, 0, 1); run(8, 0, 0, 1, 6); run(9, 6, 1, 0, 6); run(14, 7, 0, 1, 1);
  run(14, 8, -1, 0, 6); run(8, 9, 0, 1, 6); run(7, 14, -1, 0, 1); run(6, 14, 0, -1, 6); run(5, 8, -1, 0, 6); run(0, 7, 0, -1, 2);
}
// The corner each player sits in, counted clockwise from the top left (0 top left, 1 top right, 2 bottom right, 3 bottom left).
export const LUDO_CORNER = [3, 1];
// Turns a square a quarter clockwise round the centre q times.
const turn = ([c, r], q) => { for (let k = 0; k < q; k++) [c, r] = [14 - r, c]; return [c, r]; };
// Square for player p's path position rel (0..55): the track, then the home column into the centre.
export function ludoCell(p, rel) {
  if (rel <= LUDO.LAST) return LUDO_TRACK[(LUDO_START[p] + rel) % LUDO.TRACK];
  return turn([rel - LUDO.LAST, 7], LUDO_CORNER[p]);
}
// Track square (0..51) for path position rel, or -1 when the pawn is not on the shared track.
export const ludoAbs = (p, rel) => (rel >= 0 && rel <= LUDO.LAST ? (LUDO_START[p] + rel) % LUDO.TRACK : -1);
export const ludoSafe = (a) => SAFE.has(a);

export function ludoNew(first = 0) {
  return { pos: [[-1, -1, -1, -1], [-1, -1, -1, -1]], turn: first, roll: 0, sixes: 0, over: false, winner: null };
}

// Where pawn k of player p would end up with a roll of d, or null when it cannot move.
export function ludoTarget(s, p, k, d) {
  const from = s.pos[p][k];
  if (from === -1) return d === 6 ? 0 : null;
  if (from >= LUDO.HOME) return null;
  return from + d <= LUDO.HOME ? from + d : null;
}
// The pawns the player to move can move with the current roll (none before rolling).
export const ludoMoves = (s) => (s.over || !s.roll ? [] : [0, 1, 2, 3].filter((k) => ludoTarget(s, s.turn, k, s.roll) !== null));

function endTurn(s) { s.turn = 1 - s.turn; s.roll = 0; s.sixes = 0; }

// Rolls d for the player to move. Returns {player, d, moves, forfeit, pass}: forfeit for the third 6 in a
// row and pass when no pawn can move, both of which hand the turn over straight away.
export function ludoRoll(s, d) {
  if (s.over || s.roll || !(d >= 1 && d <= 6)) return null;
  const p = s.turn;
  s.sixes = d === 6 ? s.sixes + 1 : 0;
  if (s.sixes === 3) { endTurn(s); return { player: p, d, moves: [], forfeit: true, pass: false }; }
  s.roll = d;
  const moves = ludoMoves(s);
  if (!moves.length) { endTurn(s); return { player: p, d, moves, forfeit: false, pass: true }; }
  return { player: p, d, moves, forfeit: false, pass: false };
}

// Moves pawn k by the current roll. Returns {player, k, from, to, path, captured, extra, home, win} so the
// screen can animate it: path lists every position the pawn steps on, captured the other player's pawns
// sent back to the yard.
export function ludoMove(s, k) {
  if (!ludoMoves(s).includes(k)) return null;
  const p = s.turn, q = 1 - p, d = s.roll, from = s.pos[p][k], to = ludoTarget(s, p, k, d);
  const path = [];
  if (from === -1) path.push(0); else for (let r = from + 1; r <= to; r++) path.push(r);
  s.pos[p][k] = to;
  const captured = [];
  const a = ludoAbs(p, to);
  if (a >= 0 && !SAFE.has(a)) s.pos[q].forEach((r, j) => { if (ludoAbs(q, r) === a) { captured.push(j); s.pos[q][j] = -1; } });
  const home = to === LUDO.HOME, win = s.pos[p].every((r) => r === LUDO.HOME);
  if (win) { s.over = true; s.winner = p; s.roll = 0; }
  const extra = !win && d === 6;
  if (extra) s.roll = 0; else if (!win) endTurn(s);
  return { player: p, k, from, to, path, captured, extra, home, win };
}

// How many of player q's pawns could land on track square a with their next roll (a 1 to 6 behind it on
// the track, and not about to turn off into their home column). Safe squares are never at risk.
export function ludoThreats(s, q, a) {
  if (a < 0 || SAFE.has(a)) return 0;
  let n = 0;
  for (const r of s.pos[q]) {
    if (r < 0 || r > LUDO.LAST) continue;
    const gap = (a - ludoAbs(q, r) + LUDO.TRACK) % LUDO.TRACK;
    if (gap >= 1 && gap <= 6 && r + gap <= LUDO.LAST) n++;
  }
  return n;
}
