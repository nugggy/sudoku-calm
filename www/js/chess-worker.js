// Thinks about chess moves off the main thread so the board never freezes while the computer plays.
import { replay, search, toUci } from './chess-engine.js';

self.onmessage = (e) => {
  const { id, fen, moves, level, time } = e.data;
  const p = replay(fen, moves);
  const r = search(p, { level, time });
  self.postMessage({ id, move: r.move === null ? null : toUci(r.move), score: r.score, depth: r.depth });
};
