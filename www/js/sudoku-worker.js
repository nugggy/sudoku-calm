// Generates puzzles off the main thread so the interface never stutters.
import { generate } from './sudoku-engine.js';

self.onmessage = (e) => {
  const { id, difficulty, seed } = e.data;
  const g = generate(difficulty, seed ?? undefined);
  self.postMessage({ id, puzzle: g.puzzle.join(''), solution: g.solution.join(''), difficulty, seed: g.seed });
};
