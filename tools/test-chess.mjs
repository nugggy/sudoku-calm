// Checks the chess engine: move generation counts (perft) on standard test positions, the end-of-game rules,
// notation, and that the computer player sees simple tactics. Run with: node tools/test-chess.mjs
import { fromFEN, toFEN, perft, status, san, legalMoves, makeMove, undoMove, fromUci, toUci, search, replay, START_FEN } from '../www/js/chess-engine.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('FAIL', msg); } };

// Perft positions from the Chess Programming Wiki.
const PERFT = [
  [START_FEN, [20, 400, 8902, 197281]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];
const t0 = Date.now();
for (const [fen, counts] of PERFT) {
  const p = fromFEN(fen);
  counts.forEach((n, i) => { const got = perft(p, i + 1); check(got === n, `perft ${fen} depth ${i + 1}: ${got}, expected ${n}`); });
  check(toFEN(p) === fen, `position restored after perft: ${toFEN(p)}`);
}
console.log(`perft done in ${Date.now() - t0} ms`);

// End of game.
check(status(fromFEN('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')).reason === 'checkmate', 'fool\'s mate is checkmate');
check(status(fromFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).reason === 'stalemate', 'stalemate');
check(status(fromFEN('8/8/4k3/8/8/2K5/5N2/8 w - - 0 1')).reason === 'material', 'king and knight is a draw');
check(status(fromFEN('8/8/4k3/8/8/2KB4/8/3b4 w - - 0 1')).reason === 'material', 'bishops on the same colour is a draw');
check(!status(fromFEN('8/8/4k3/8/8/2KB4/8/2b5 w - - 0 1')).over, 'bishops on opposite colours play on');
check(status(fromFEN('8/8/4k3/8/8/2K5/5R2/8 w - - 100 80')).reason === 'fifty', 'fifty-move rule');
const rep = replay(START_FEN, ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']);
check(status(rep).reason === 'repetition', 'threefold repetition');
check(!status(replay(START_FEN, ['g1f3', 'g8f6', 'f3g1', 'f6g8'])).over, 'twofold repetition plays on');

// Notation.
const sanOf = (fen, u) => { const p = fromFEN(fen); return san(p, fromUci(p, u)); };
check(sanOf(START_FEN, 'g1f3') === 'Nf3', 'Nf3');
check(sanOf('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1') === 'O-O', 'short castling');
check(sanOf('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1c1') === 'O-O-O', 'long castling');
check(sanOf('7k/8/8/8/8/8/8/R5RK w - - 0 1', 'a1b1') === 'Rab1', 'file disambiguation');
check(sanOf('7k/P7/8/8/8/8/8/7K w - - 0 1', 'a7a8q') === 'a8=Q+', 'promotion with check');
check(sanOf('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a8') === 'Ra8#', 'mate sign');
check(sanOf('7k/8/8/3pP3/8/8/8/7K w - d6 0 2', 'e5d6') === 'exd6', 'en passant');
check(legalMoves(fromFEN('7k/P7/8/8/8/8/8/7K w - - 0 1')).filter((m) => toUci(m).startsWith('a7a8')).length === 4, 'four promotion choices');
// en passant that would expose the king is not allowed
check(!legalMoves(fromFEN('8/8/8/K2pP2r/8/8/8/7k w - d6 0 2')).some((m) => toUci(m) === 'e5d6'), 'pinned en passant is illegal');
// make and undo leave the hash untouched
{ const p = fromFEN(START_FEN), lo = p.lo; for (const m of legalMoves(p)) { makeMove(p, m); undoMove(p); } check(p.lo === lo, 'hash restored'); }

// The computer player.
const best = (fen, level, u, msg) => { const p = fromFEN(fen); const r = search(p, { level }); check(toUci(r.move) === u, `${msg}: played ${r.move ? toUci(r.move) : 'nothing'} (depth ${r.depth})`); };
for (const lv of [3, 5, 8]) best('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', lv, 'a1a8', `level ${lv} finds back-rank mate in 1`);
best('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', 6, 'h5f7', 'level 6 finds scholar\'s mate');
best('6k1/8/8/8/3q4/8/3R4/3K4 w - - 0 1', 6, 'd2d4', 'level 6 takes a free queen');
{
  // the queen is attacked by a pawn: level 6 must move it (or defend sensibly) rather than leave it hanging
  const p = fromFEN('rnb1kbnr/pppp1ppp/8/4p3/3q4/2P5/PP1PPPPP/RNBQKBNR b KQkq - 0 3');
  const r = search(p, { level: 6 });
  check(toUci(r.move).startsWith('d4'), `level 6 saves its queen: played ${toUci(r.move)}`);
}
{
  // a strong level should beat a weak one most of the time
  let strong = 0, games = 4;
  for (let g = 0; g < games; g++) {
    const p = fromFEN(START_FEN), strongSide = g % 2;
    let st;
    for (let ply = 0; ply < 160; ply++) {
      st = status(p);
      if (st.over) break;
      const r = search(p, { level: p.turn === strongSide ? 6 : 1, time: 150 });
      makeMove(p, r.move);
    }
    st = status(p);
    if (st.over && st.result === (strongSide === 0 ? 'white' : 'black')) strong++;
    else if (!st.over) { // unfinished: count clear material advantage as a win
      const { evaluate } = await import('../www/js/chess-engine.js');
      const e = evaluate(p) * (p.turn === strongSide ? 1 : -1);
      if (e > 300) strong++;
    }
  }
  check(strong >= 3, `level 6 beat level 1 in ${strong} of ${games} games`);
}
{
  const p = fromFEN(START_FEN), t = Date.now();
  const r = search(p, { level: 8 });
  const ms = Date.now() - t;
  console.log(`level 8 from the start: ${toUci(r.move)}, depth ${r.depth}, ${r.nodes} nodes, ${ms} ms`);
  check(ms < 2500, `level 8 stays within its time (${ms} ms)`);
}

console.log(fail ? `${fail} chess checks failed` : 'All chess checks passed');
process.exit(fail ? 1 : 0);
