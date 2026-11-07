// Checks the Play Together computer players in www/js/duo/ai-board.js (Connect Four, Noughts and Crosses, Draughts,
// Reversi, Mancala, Dots and Boxes and Battleships). For each game: the computer only ever makes legal moves, it
// takes a win that is there on the spot, and it plays complete games against a random player at each level
// (Hard must win nearly all of them, Medium most). Noughts and Crosses on Hard is also checked never to lose,
// against every possible line of play. Searches run with a short time cap so the whole file takes about a minute.
// Run with: node tools/test-duo-ai.mjs
import * as R from '../www/js/duo/rules.js';
import { kalahNew, kalahPlay, kalahMoves } from '../www/js/duo/tbc-rules.js';
import { c4Ai, tttAi, drAi, rvAi, kalahAi, dbAi, shipsAi } from '../www/js/duo/ai-board.js';
import { mulberry32 } from '../www/js/sudoku-engine.js';

let fail = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fail++; console.log('FAIL', msg); } };
const t0 = Date.now();
const rng = mulberry32(2026);
const pick = (a) => a[Math.floor(rng() * a.length)];
const LEVELS = ['easy', 'medium', 'hard'];
const AI = 1; // the computer is always player 1, as in the games
const OPTS = { ms: 30 }; // per move; the games give the computer about 80 to 260 ms
const NEED = { hard: 0.9, medium: 0.7, easy: 0 };
const rates = [];
// Plays n games of one kind at each level (the computer and the random player take turns to start) and checks the win rate.
function rate(name, n, game) {
  const row = [name];
  for (const lv of LEVELS) {
    let won = 0, lost = 0;
    for (let k = 0; k < n; k++) { const w = game(lv, k % 2); if (w === AI) won++; else if (w === 1 - AI) lost++; }
    row.push(`${lv} ${won}/${n}${lost ? ` (lost ${lost})` : ''}`);
    ok(won / n >= NEED[lv], `${name} ${lv}: won ${won} of ${n}, needs ${Math.round(NEED[lv] * 100)}%`);
  }
  rates.push(row.join('  '));
}

// ---------- Connect Four ----------
function c4Game(lv, first) {
  const b = R.c4New();
  for (let turn = first; ; turn = 1 - turn) {
    const cols = [0, 1, 2, 3, 4, 5, 6].filter((c) => R.c4CanDrop(b, c));
    const c = turn === AI ? c4Ai(b, AI, lv, rng, OPTS) : pick(cols);
    if (turn === AI) ok(cols.includes(c), `c4 ${lv}: column ${c} is not legal`);
    R.c4Drop(b, c, turn);
    const w = R.c4Win(b);
    if (w) return w.player;
    if (R.c4Full(b)) return null;
  }
}
{
  // three in a row along the bottom with the fourth square open
  const b = R.c4New();
  [[0, 1], [6, 0], [1, 1], [6, 0], [2, 1], [5, 0]].forEach(([c, p]) => R.c4Drop(b, c, p));
  for (const lv of LEVELS) for (let k = 0; k < 5; k++) ok(c4Ai(b, AI, lv, rng, OPTS) === 3, `c4 ${lv}: takes the winning column`);
  // the person threatens three up column 2: Medium and Hard block it
  const d = R.c4New();
  [[2, 0], [4, 1], [2, 0], [5, 1], [2, 0]].forEach(([c, p]) => R.c4Drop(d, c, p));
  for (const lv of ['medium', 'hard']) for (let k = 0; k < 5; k++) ok(c4Ai(d, AI, lv, rng, OPTS) === 2, `c4 ${lv}: blocks the three`);
}
rate('Connect Four', 20, c4Game);

// ---------- Noughts and Crosses ----------
// One match, best of five rounds with the starter swapping, as in g-ttt.js.
function tttMatch(lv, first) {
  const wins = [0, 0];
  for (let round = 0, starter = first; round < 5 && wins[0] < 3 && wins[1] < 3; round++, starter = 1 - starter) {
    const b = new Array(9).fill(0);
    for (let turn = starter; ; turn = 1 - turn) {
      const free = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
      const i = turn === AI ? tttAi(b, AI, lv, rng) : pick(free);
      if (turn === AI) ok(free.includes(i), `ttt ${lv}: square ${i} is not free`);
      b[i] = turn + 1;
      const w = R.tttWin(b);
      if (w) { wins[w.player]++; break; }
      if (R.tttFull(b)) break;
    }
  }
  return wins[0] === wins[1] ? null : wins[0] > wins[1] ? 0 : 1;
}
{
  for (const lv of LEVELS) for (let k = 0; k < 5; k++) ok(tttAi([2, 2, 0, 1, 1, 0, 0, 0, 1], AI, lv, rng) === 2, `ttt ${lv}: completes the row`);
  ok(tttAi([1, 1, 0, 0, 2, 0, 0, 0, 0], AI, 'hard', rng) === 2, 'ttt hard: blocks');
  // Hard never loses: every reply the person could make, and every equally good choice the computer could make
  let lines = 0, losses = 0;
  const choices = (b) => [...new Set([0, 0.17, 0.34, 0.51, 0.68, 0.85, 0.999].map((x) => tttAi(b, AI, 'hard', () => x)))];
  const walk = (b, turn) => {
    const w = R.tttWin(b);
    if (w || R.tttFull(b)) { lines++; if (w && w.player !== AI) losses++; return; }
    const moves = turn === AI ? choices(b) : b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    for (const i of moves) { b[i] = turn + 1; walk(b, 1 - turn); b[i] = 0; }
  };
  walk(new Array(9).fill(0), 0);
  walk(new Array(9).fill(0), AI);
  ok(losses === 0 && lines > 100, `ttt hard: lost ${losses} of ${lines} possible games`);
  rates.push(`Noughts and Crosses: Hard never loses (${lines} possible games checked)`);
}
rate('Noughts and Crosses (best of five)', 60, tttMatch);

// ---------- Draughts ----------
function drGame(lv, first) {
  const b = R.drNew();
  let quiet = 0;
  for (let turn = first, ply = 0; ply < 400; turn = 1 - turn, ply++) {
    const ms = R.drMoves(b, turn);
    if (!ms.length) return 1 - turn;
    let mv;
    if (turn === AI) { const key = drAi(b, AI, lv, rng, OPTS); mv = ms.find((m) => R.drKey(m) === key); ok(mv, `draughts ${lv}: ${key} is not legal`); if (!mv) return null; }
    else mv = pick(ms);
    const man = !R.drKing(b[mv.path[0]]);
    R.drPlay(b, mv);
    quiet = mv.caps.length || man ? 0 : quiet + 1;
    if (quiet >= 80) return null;
  }
  return null;
}
{
  // two captures on offer: the double jump takes both of the person's last pieces
  const b = new Array(64).fill(0);
  b[17] = 3; b[19] = 3; b[26] = 1; b[44] = 1;
  const keys = R.drMoves(b, AI).map(R.drKey);
  ok(keys.includes('17-35-53') && keys.length > 1, 'draughts: test position has a choice');
  for (const lv of LEVELS) for (let k = 0; k < 5; k++) ok(drAi(b, AI, lv, rng, OPTS) === '17-35-53', `draughts ${lv}: takes the last two pieces`);
  // a capture is compulsory: with one on offer the computer must take it
  const c = R.drNew();
  R.drPlay(c, { path: [40, 33], caps: [] }); R.drPlay(c, { path: [17, 24], caps: [] }); R.drPlay(c, { path: [42, 35], caps: [] }); R.drPlay(c, { path: [21, 28], caps: [] });
  const caps = R.drMoves(c, AI);
  for (const lv of LEVELS) ok(caps.map(R.drKey).includes(drAi(c, AI, lv, rng, OPTS)), `draughts ${lv}: captures when it must`);
}
rate('Draughts', 12, drGame);

// ---------- Reversi ----------
function rvGame(lv, first) {
  const b = R.rvNew(first);
  for (let turn = first; turn >= 0;) {
    const ms = R.rvMoves(b, turn);
    const i = turn === AI ? rvAi(b, AI, lv, rng, OPTS) : pick(ms);
    if (turn === AI) ok(ms.includes(i), `reversi ${lv}: ${i} is not legal`);
    R.rvPlay(b, i, turn);
    turn = R.rvNext(b, turn);
  }
  const [a, c] = R.rvCount(b);
  return a === c ? null : a > c ? 0 : 1;
}
{
  // nearly full boards (some with only a few of the person's discs left) where one move ends the game with the
  // computer ahead and another does not
  let found = 0;
  for (let g = 0; g < 50000 && found < 8; g++) {
    const q = rng() < 0.5 ? 0.5 : 0.06, b = [...Array(64)].map(() => (rng() < q ? 1 : 2));
    for (let k = 2 + Math.floor(rng() * 3); k > 0; k--) b[Math.floor(rng() * 64)] = 0;
    const ms = R.rvMoves(b, AI);
    if (ms.length < 2) continue;
    const good = ms.filter((i) => { const c = b.slice(); R.rvPlay(c, i, AI); const [x, y] = R.rvCount(c); return !R.rvMoves(c, 0).length && !R.rvMoves(c, 1).length && y > x; });
    if (!good.length || good.length === ms.length) continue;
    found++;
    for (const lv of LEVELS) ok(good.includes(rvAi(b, AI, lv, rng, OPTS)), `reversi ${lv}: plays the move that wins on the spot`);
  }
  ok(found > 0, 'reversi: found winning-move positions to test');
}
rate('Reversi', 16, rvGame);

// ---------- Mancala ----------
function kalahGame(lv, first) {
  const s = kalahNew(first);
  while (!s.over) {
    const ms = kalahMoves(s);
    const i = s.turn === AI ? kalahAi(s, lv, rng, OPTS) : pick(ms);
    if (s.turn === AI) ok(ms.includes(i), `mancala ${lv}: pit ${i} is not legal`);
    kalahPlay(s, i);
  }
  return s.winner;
}
{
  let found = 0;
  const clone = (s) => ({ ...s, pits: s.pits.slice() });
  for (let g = 0; g < 600 && found < 8; g++) {
    const s = kalahNew(g % 2);
    while (!s.over) {
      const ms = kalahMoves(s);
      if (s.turn === AI && ms.length > 1) {
        const good = ms.filter((i) => { const c = clone(s); kalahPlay(c, i); return c.over && c.winner === AI; });
        if (good.length && good.length < ms.length) {
          found++;
          for (const lv of LEVELS) ok(good.includes(kalahAi(s, lv, rng, OPTS)), `mancala ${lv}: plays the move that wins on the spot`);
        }
      }
      kalahPlay(s, pick(ms));
    }
  }
  ok(found > 0, 'mancala: found winning-move positions to test');
}
rate('Mancala', 30, kalahGame);

// ---------- Dots and Boxes ----------
function dbGame(lv, first, n = 3 + (Math.floor(rng() * 3))) {
  const s = R.dbNew(n), all = R.dbEdges(n);
  for (let turn = first; !R.dbOver(s);) {
    const free = all.filter((e) => s.edges[e] === undefined);
    const e = turn === AI ? dbAi(s, AI, lv, rng) : pick(free);
    if (turn === AI) ok(free.includes(e), `dots ${lv}: ${e} is not free`);
    const made = R.dbPlay(s, e, turn);
    if (!made.length) turn = 1 - turn;
  }
  return s.score[0] === s.score[1] ? null : s.score[0] > s.score[1] ? 0 : 1;
}
{
  // whenever a box can be closed, every level closes one
  let found = 0;
  for (let g = 0; g < 40; g++) {
    const s = R.dbNew(4), all = R.dbEdges(4);
    for (let turn = 0; !R.dbOver(s);) {
      const free = all.filter((e) => s.edges[e] === undefined);
      const closing = free.filter((e) => { const c = { ...s, edges: { ...s.edges }, boxes: s.boxes.slice(), score: s.score.slice() }; return R.dbPlay(c, e, AI).length > 0; });
      if (turn === AI && closing.length && closing.length < free.length && found < 30) {
        found++;
        for (const lv of LEVELS) {
          const e = dbAi(s, AI, lv, rng), c = { ...s, edges: { ...s.edges }, boxes: s.boxes.slice(), score: s.score.slice() };
          // Hard may hand over the last two boxes of a chain on purpose to keep control
          ok(lv === 'hard' || R.dbPlay(c, e, AI).length > 0, `dots ${lv}: closes a free box`);
        }
      }
      const made = R.dbPlay(s, pick(free), turn);
      if (!made.length) turn = 1 - turn;
    }
  }
  ok(found > 0, 'dots: found free-box positions to test');
  // the last box: closing it wins
  const s = R.dbNew(2);
  [['h0_0', 0], ['h0_1', 1], ['v0_0', 0], ['v0_2', 1], ['v1_0', 0], ['v1_2', 1], ['h2_0', 0], ['h2_1', 1], ['h1_0', 0], ['v0_1', 1], ['h1_1', 1]].forEach(([e, p]) => R.dbPlay(s, e, p));
  for (const lv of LEVELS) ok(dbAi(s, AI, lv, rng) === 'v1_1', `dots ${lv}: takes the last box`);
  // a long chain endgame: Hard against Medium
  let hw = 0, games = 30;
  for (let k = 0; k < games; k++) {
    const t = R.dbNew(4 + (k % 2)), all = R.dbEdges(t.n);
    for (let turn = k % 2; !R.dbOver(t);) { const e = dbAi(t, turn, turn === AI ? 'hard' : 'medium', rng); if (!R.dbPlay(t, e, turn).length) turn = 1 - turn; void all; }
    if (t.score[AI] > t.score[1 - AI]) hw++;
  }
  rates.push(`Dots and Boxes: Hard beat Medium in ${hw} of ${games} games`);
  ok(hw >= games / 2, `dots: Hard should beat Medium more often than not (${hw} of ${games})`);
}
rate('Dots and Boxes', 20, dbGame);

// ---------- Battleships ----------
// Both sides fire in turn at a random legal fleet; the computer uses shipsAi, the random player fires anywhere new.
function shipsGame(lv, first) {
  const fleets = [R.randomFleet(rng), R.randomFleet(rng)], hit = [new Set(), new Set()];
  const shots = [new Map(), new Map()], sunk = [[], []];
  ok(R.fleetValid(fleets[0]) && R.fleetValid(fleets[1]), 'ships: random fleets are legal');
  for (let turn = first, n = 0; n < 400; turn = 1 - turn, n++) {
    const free = [...Array(100).keys()].filter((i) => !shots[turn].has(i));
    const i = turn === AI ? shipsAi(shots[turn], sunk[turn], lv, rng) : pick(free);
    if (turn === AI) ok(free.includes(i), `ships ${lv}: ${i} was already fired at`);
    const res = R.answerShot(fleets[1 - turn], hit[1 - turn], i);
    shots[turn].set(i, res.r === 'miss' ? 'miss' : 'hit');
    if (res.r === 'sunk') { sunk[turn].push(res.ship); res.ship.forEach((x) => shots[turn].set(x, 'sunk')); }
    if (res.over) return turn;
  }
  return null;
}
{
  // only the patrol boat is left, hit once with three sides already missed: Medium and Hard finish it
  const shots = new Map([[44, 'hit'], [34, 'miss'], [54, 'miss'], [43, 'miss']]);
  const sunk = [[0, 1, 2, 3, 4], [10, 11, 12, 13], [20, 21, 22], [70, 71, 72]];
  for (const lv of ['medium', 'hard']) for (let k = 0; k < 5; k++) ok(shipsAi(shots, sunk, lv, rng) === 45, `ships ${lv}: sinks the last ship`);
  // two hits in a row: Medium and Hard carry on along the line
  const line = new Map([[55, 'hit'], [56, 'hit']]);
  for (const lv of ['medium', 'hard']) for (let k = 0; k < 5; k++) ok([54, 57].includes(shipsAi(line, [], lv, rng)), `ships ${lv}: follows the line of hits`);
}
rate('Battleships', 40, shipsGame);

console.log('Win rates against a random player (the computer\'s wins out of games played):');
rates.forEach((r) => console.log('  ' + r));
console.log(`${checks} checks, ${fail} failed, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(fail ? 'Play Together computer players: problems found' : 'All Play Together computer player checks passed');
process.exit(fail ? 1 : 0);
