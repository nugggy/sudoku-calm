// Checks Turtle Bay logic: every Tortoise Trek level is well formed and solvable in exactly its stated par,
// sliding rules behave, and Shell Match has enough distinct pictures for the largest board.
// Run with: node tools/test-turtle.mjs
import { parse, slide, solve, path } from '../www/js/turtle/trek-engine.js';
import { LEVELS } from '../www/js/turtle/trek-levels.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('FAIL', msg); } };

// sliding rules on a small hand-made field
const lv = parse(['S..#', '....', '.o..', '...L']);
check(slide(lv, 0, 'right') === 2, 'slides until the rock');
check(slide(lv, 0, 'down') === 12, 'slides to the bottom edge');
check(slide(lv, 1, 'down') === 9, 'mud stops the tortoise');
check(slide(lv, 0, 'up') === 0, 'cannot slide off the top');
check(path(lv, 0, 'right').join() === '0,1,2', 'path lists every square passed');
check(solve(parse(['S#', '#L'])) === null, 'an impossible level has no solution');

check(LEVELS.length === 30, `30 Tortoise Trek levels (found ${LEVELS.length})`);
let prevPar = 0;
LEVELS.forEach((l, i) => {
  const rows = l.rows, w = rows[0].length;
  check(rows.every((r) => r.length === w && /^[#.oSL]+$/.test(r)), `level ${i + 1}: rows are well formed`);
  const text = rows.join('');
  check((text.match(/S/g) || []).length === 1 && (text.match(/L/g) || []).length === 1, `level ${i + 1}: one start and one lettuce`);
  const sol = solve(parse(rows));
  check(sol && sol.length === l.par, `level ${i + 1}: solvable in exactly ${l.par} slides (solver found ${sol ? sol.length : 'none'})`);
  // replay the solution to be sure it really ends on the lettuce
  if (sol) { const p = parse(rows); let pos = p.start; for (const d of sol) pos = slide(p, pos, d); check(pos === p.goal, `level ${i + 1}: solution ends on the lettuce`); }
  check(l.par >= prevPar, `level ${i + 1}: par never drops (${prevPar} then ${l.par})`);
  prevPar = l.par;
});

// Shell Match needs 10 pictures for the large board; the module imports the store, so read the list as text
const { readFileSync } = await import('node:fs');
const src = readFileSync(new URL('../www/js/turtle/g-match.js', import.meta.url), 'utf8');
const pics = JSON.parse(src.match(/MATCH_PICS = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
check(new Set(pics).size >= 10, 'Shell Match has at least 10 different pictures');

console.log(fail ? `${fail} check(s) failed` : `All Turtle Bay checks passed (${LEVELS.length} Tortoise Trek levels, par ${LEVELS[0].par} to ${LEVELS[LEVELS.length - 1].par})`);
process.exit(fail ? 1 : 0);
