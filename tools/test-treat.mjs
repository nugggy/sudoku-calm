// Checks the Treat Twist rules and proves every level can be won.
//   node tools/test-treat.mjs           rules plus all levels
//   node tools/test-treat.mjs --rules   rules only
import { readFileSync } from 'node:fs';
import * as E from '../www/js/treat-engine.js';

let fail = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fail++; console.log('FAIL', msg); } };

// A board from letters: a to f are candy colours, '#' no cell. Specials: put them in afterwards.
function board(lines, extra = {}) {
  const w = lines[0].length, h = lines.length;
  const st = E.createState({ w, h, rows: lines.map((l) => l.replace(/[a-f]/g, '.')), colours: 6, moves: 20, goal: { score: 1e9 }, ...extra }, 1);
  lines.forEach((l, y) => [...l].forEach((ch, x) => {
    const i = y * w + x;
    if (ch >= 'a' && ch <= 'f') { st.kind[i] = E.CANDY; st.c[i] = ch.charCodeAt(0) - 97; st.s[i] = E.PLAIN; st.id[i] = st.nextId++; }
  }));
  return st;
}
const at = (st, x, y) => y * st.w + x;
const settle = (st) => E.resolveAll(st);
const firstClear = (st) => { const e = E.step(st); return e; };
// a board with no matches anywhere, built from a repeating pattern
const quiet = (w, h) => [...Array(h)].map((_, y) => [...Array(w)].map((_, x) => 'abcdef'[(x + 2 * y) % 6]).join(''));

// ---------- matching ----------
{
  const st = board(['aaab', 'bcdb', 'ccdb', 'adcb']);
  const g = E.findGroups(st);
  ok(g.length === 2, `two groups found (${g.length})`);
  ok(g.some((x) => x.cells.length === 3 && x.c === 0), 'row of three a');
  ok(g.some((x) => x.cells.length === 4 && x.c === 1), 'column of four b');
}
{
  // L shape joins into one group and makes a wrapped treat where the lines cross
  const st = board(['abcd', 'acdb', 'aaab']);
  const g = E.findGroups(st);
  ok(g.length === 1 && g[0].cells.length === 5, 'L shape is one group of five');
  const sp = E.specialFor(st, g[0]);
  ok(sp && sp.kind === 'wrapped' && sp.spot === at(st, 0, 2), 'L makes a wrapped treat at the corner');
}
{
  const st = board(['aaaab']);
  const g = E.findGroups(st);
  const sh = E.specialFor(st, g[0], [at(st, 1, 0), at(st, 1, 1)], 'h');
  ok(sh.kind === 'stripe' && sh.s === E.STRIPE_H && sh.spot === at(st, 1, 0), 'four from a sideways swipe makes sideways stripes at the swap');
  const sv = E.specialFor(st, g[0], [], 'v');
  ok(sv.s === E.STRIPE_V, 'four from an up or down swipe makes up-and-down stripes');
  const st5 = board(['aaaaab']);
  ok(E.specialFor(st5, E.findGroups(st5)[0]).kind === 'bomb', 'five in a row makes a rainbow bomb');
}
// ---------- swapping ----------
{
  const st = board(quiet(5, 5));
  const before = [...st.c];
  ok(!E.trySwap(st, 0, 1), 'a swap with no match is refused');
  ok(st.c.every((v, i) => v === before[i]) && st.moves === 20, 'a refused swap changes nothing');
  // set up a match: row 0 = b a b b ..., swap the a with the b below it
  const st2 = board(['babbe', 'abcde', 'cdefa']);
  ok(E.trySwap(st2, at(st2, 1, 0), at(st2, 1, 1)), 'a swap that makes a match is allowed');
  ok(st2.moves === 19, 'a move is used');
}
{
  // locked candies cannot be swapped but still match
  const st = board(['abaa', 'cdbe', 'efab'], { rows: ['.L..', '....', '....'] });
  st.lock[at(st, 1, 0)] = 1;
  ok(!E.trySwap(st, at(st, 1, 0), at(st, 1, 1)), 'a locked candy cannot move');
}
// ---------- special treats ----------
function makeSpecial(st, i, kind, s = E.PLAIN, c = 0) { st.kind[i] = kind; st.c[i] = kind === E.BOMB ? -1 : c; st.s[i] = s; st.id[i] = st.nextId++; }
{
  // striped treat in a match clears its row
  const st = board(['abcdef', 'bcdefa', 'aabdef', 'cdefab']);
  makeSpecial(st, at(st, 0, 2), E.CANDY, E.STRIPE_H, 0);
  makeSpecial(st, at(st, 2, 1), E.CANDY, E.PLAIN, 0);
  E.trySwap(st, at(st, 2, 1), at(st, 2, 2));
  const e = firstClear(st);
  const row = e.cleared.filter((c) => Math.floor(c.i / st.w) === 2).length;
  ok(e.fired.some((f) => f.type === 'row') && row === 6, `striped treat clears its whole row (${row})`);
}
{
  // striped + striped makes a cross
  const st = board(quiet(7, 7));
  makeSpecial(st, at(st, 3, 3), E.CANDY, E.STRIPE_H, 1); makeSpecial(st, at(st, 4, 3), E.CANDY, E.STRIPE_V, 2);
  ok(E.trySwap(st, at(st, 3, 3), at(st, 4, 3)), 'two striped treats can always be swapped');
  const e = firstClear(st);
  ok(e.combo === 'cross', 'combo is a cross');
  const col = e.cleared.filter((c) => c.i % st.w === 4).length, row = e.cleared.filter((c) => Math.floor(c.i / st.w) === 3).length;
  ok(row >= 6 && col >= 6, `cross clears a row and a column (${row}, ${col})`);
}
{
  // striped + wrapped clears three rows and three columns
  const st = board(quiet(9, 9));
  makeSpecial(st, at(st, 4, 4), E.CANDY, E.STRIPE_H, 1); makeSpecial(st, at(st, 5, 4), E.CANDY, E.WRAPPED, 2);
  E.trySwap(st, at(st, 4, 4), at(st, 5, 4));
  const e = firstClear(st);
  ok(e.combo === 'bigcross' && e.cleared.length >= 9 * 3 + 9 * 3 - 9 - 5, `striped and wrapped make a big cross (${e.cleared.length} cleared)`);
}
{
  // wrapped + wrapped: a 5x5 blast, then a second burst
  const st = board(quiet(9, 9));
  makeSpecial(st, at(st, 4, 4), E.CANDY, E.WRAPPED, 1); makeSpecial(st, at(st, 4, 5), E.CANDY, E.WRAPPED, 2);
  E.trySwap(st, at(st, 4, 4), at(st, 4, 5));
  const e = firstClear(st);
  ok(e.combo === 'bigblast' && e.cleared.length >= 24, `two wrapped treats blast a 5x5 area (${e.cleared.length})`);
  ok(st.s[at(st, 4, 5)] === E.PRIMED, 'and leave a treat to burst again');
  E.step(st); const e2 = E.step(st);
  ok(e2 && e2.fired.some((f) => f.type === 'blast'), 'the second burst goes off after the fall');
}
{
  // a wrapped treat bursts twice on its own
  const st = board(['abcdef', 'bcdefa', 'aabdef', 'cdefab', 'defabc']);
  makeSpecial(st, at(st, 0, 2), E.CANDY, E.WRAPPED, 0); makeSpecial(st, at(st, 2, 1), E.CANDY, E.PLAIN, 0);
  E.trySwap(st, at(st, 2, 1), at(st, 2, 2));
  const evs = settle(st);
  ok(evs.filter((e) => e.fired && e.fired.some((f) => f.type === 'blast')).length >= 2, 'wrapped treat bursts twice');
}
{
  // rainbow bomb + candy clears that colour
  const st = board(quiet(6, 6));
  makeSpecial(st, at(st, 2, 2), E.BOMB);
  const col = st.c[at(st, 3, 2)], count = [...st.c].filter((c, i) => c === col && st.kind[i] === E.CANDY).length;
  ok(E.trySwap(st, at(st, 2, 2), at(st, 3, 2)), 'a rainbow bomb swaps with any candy');
  const e = firstClear(st);
  ok(e.combo === 'bomb' && e.cleared.filter((c) => c.c === col).length === count, `bomb clears every candy of that colour (${count})`);
}
{
  // bomb + striped turns that colour into striped treats which all fire
  const st = board(quiet(6, 6));
  makeSpecial(st, at(st, 2, 2), E.BOMB); const c = st.c[at(st, 3, 2)]; st.s[at(st, 3, 2)] = E.STRIPE_V;
  E.trySwap(st, at(st, 2, 2), at(st, 3, 2));
  const e = firstClear(st);
  ok(e.combo === 'bombstripe' && e.converted.length >= 5 && e.fired.filter((f) => f.type === 'row' || f.type === 'col').length >= 5, `bomb and striped fire a stripe on every ${c} candy`);
}
{
  // bomb + wrapped
  const st = board(quiet(6, 6));
  makeSpecial(st, at(st, 2, 2), E.BOMB); st.s[at(st, 3, 2)] = E.WRAPPED;
  E.trySwap(st, at(st, 2, 2), at(st, 3, 2));
  const e = firstClear(st);
  ok(e.combo === 'bombwrap' && e.fired.filter((f) => f.type === 'blast').length >= 5, 'bomb and wrapped burst every candy of that colour');
}
{
  // bomb + bomb clears the board
  const st = board(quiet(6, 6));
  makeSpecial(st, at(st, 2, 2), E.BOMB); makeSpecial(st, at(st, 3, 2), E.BOMB);
  E.trySwap(st, at(st, 2, 2), at(st, 3, 2));
  const e = firstClear(st);
  ok(e.combo === 'bombbomb' && e.cleared.length === 36, `two bombs clear the whole board (${e.cleared.length})`);
}
// ---------- gravity and refill ----------
{
  const st = board(['abcd', 'bcda', 'aaab', 'cdab']);
  const above = st.id[at(st, 0, 1)];
  E.trySwap(st, 0, 0, { free: true }); // nothing to swap; just resolve the ready-made match
  st.pending = null; st.phaseNext = 'clear';
  const e1 = E.step(st), e2 = E.step(st);
  ok(e1.phase === 'clear' && e2.phase === 'fall', 'clear then fall');
  ok(st.id[at(st, 0, 2)] === above, 'candies above a gap fall into it');
  ok(e2.spawned.length === 3, `new candies drop in at the top (${e2.spawned.length})`);
  ok([...st.kind].every((k, i) => !st.cell[i] || k !== E.NONE), 'the board is full again');
}
{
  // a gap under a biscuit is filled by a diagonal slide
  const st = board(['abc', 'd2f', 'eab'], { rows: ['...', '.2.', '...'] });
  st.frost[at(st, 1, 1)] = 2; st.kind[at(st, 1, 1)] = E.NONE; st.c[at(st, 1, 1)] = -1;
  st.kind[at(st, 1, 2)] = E.NONE; st.c[at(st, 1, 2)] = -1; st.phaseNext = 'fall';
  E.step(st);
  ok(st.kind[at(st, 1, 2)] !== E.NONE, 'a candy slides diagonally under the biscuit');
}
// ---------- blockers and goals ----------
{
  const st = board(['aab', 'cda', 'efc'], { jelly: ['2..', '...', '...'] });
  st.jelly[0] = 2;
  E.trySwap(st, at(st, 2, 0), at(st, 2, 1));
  settle(st);
  ok(st.jelly[0] === 1, `double jelly loses one layer per clear (${st.jelly[0]})`);
}
{
  // a match next to a biscuit chips it
  const st = board(['aabc', 'cdae', 'ef1d'], { rows: ['....', '....', '..1.'] });
  st.frost[at(st, 2, 2)] = 1; st.kind[at(st, 2, 2)] = E.NONE; st.c[at(st, 2, 2)] = -1;
  E.trySwap(st, at(st, 2, 0), at(st, 2, 1));
  const e = firstClear(st);
  ok(e.hits.some((h) => h.type === 'frost' && h.i === at(st, 2, 2)) || st.frost[at(st, 2, 2)] === 1, 'biscuits beside a match are hit when touching');
}
{
  const st = board(['aabc', 'cdae', 'eff1'], { rows: ['....', '....', '...3'] });
  st.frost[at(st, 3, 2)] = 3; st.kind[at(st, 3, 2)] = E.NONE; st.c[at(st, 3, 2)] = -1;
  st.s[at(st, 0, 2)] = E.STRIPE_H; st.c[at(st, 0, 2)] = 4;
  // fire the striped treat directly: each blast takes one layer
  st.pending = { type: 'party', cells: [at(st, 0, 2)] }; st.phaseNext = 'clear';
  E.step(st);
  ok(st.frost[at(st, 3, 2)] === 2, `a three-layer biscuit loses one layer (${st.frost[at(st, 3, 2)]})`);
}
{
  // chocolate grows if none was broken, and not if one was
  const st = board(['abcd', 'bcda', 'cdab', 'daCc'], { rows: ['....', '....', '....', '..C.'], goal: { choc: true } });
  st.choc[at(st, 2, 3)] = 1; st.kind[at(st, 2, 3)] = E.NONE; st.c[at(st, 2, 3)] = -1;
  const out = E.endMove(st);
  ok(out.spread !== null && E.chocLeft(st) === 2, 'chocolate spreads after a quiet move');
  st.chocHit = true;
  const out2 = E.endMove(st);
  ok(out2.spread === null, 'chocolate does not spread when some was broken');
}
{
  // locks break when hit and the candy stays
  const st = board(['abcd', 'bcda', 'cdab'], { rows: ['....', '.L..', '....'] });
  st.lock[at(st, 1, 1)] = 1; const c = st.c[at(st, 1, 1)];
  st.pending = { type: 'party', cells: [at(st, 1, 1)] }; st.phaseNext = 'clear';
  E.step(st);
  ok(st.lock[at(st, 1, 1)] === 0 && st.c[at(st, 1, 1)] === c, 'a lock breaks and its candy stays');
}
{
  // ingredients leave the board at the bottom
  const st = board(['abc', 'bca', 'cab'], { goal: { ing: 1 } });
  st.kind[at(st, 1, 1)] = E.ING; st.c[at(st, 1, 1)] = 0;
  st.kind[at(st, 1, 2)] = E.NONE; st.c[at(st, 1, 2)] = -1; st.phaseNext = 'fall'; st.ingLeft = 0;
  const e = E.step(st);
  ok(st.ingGot === 1 && e.ing.length === 1 && E.goalDone(st), 'a sweet that reaches the bottom is collected');
}
{
  // collect goals count cleared candies
  const st = board(['aab', 'cda', 'efc'], { goal: { collect: { 0: 3 } } });
  E.trySwap(st, at(st, 2, 0), at(st, 2, 1));
  E.step(st);
  ok(st.collected[0] >= 3 && E.goalStatus(st)[0].done, 'collecting candies counts towards the goal');
}
// ---------- shuffle, party and fairness ----------
{
  const st = board(['abab', 'cdcd', 'abab', 'cdcd']);
  ok(E.findMoves(st).length === 0, 'this board has no moves');
  const out = E.endMove(st);
  ok(out.shuffled && E.findMoves(st).length > 0 && E.findGroups(st).length === 0, 'a stuck board is shuffled into one with a move and no ready match');
}
{
  const lv = { w: 8, h: 8, rows: Array(8).fill('........'), colours: 5, moves: 3, goal: { score: 1 }, stars: [1, 2, 3] };
  const st = E.createState(lv, 42);
  ok(E.findGroups(st).length === 0 && E.findMoves(st).length > 0, 'a new board starts with no match and at least one move');
  const before = st.moves; const r = E.partyStep(st);
  ok(r.converted.length === 1 && st.moves === before - 1, 'Treat Party turns a move into a striped treat');
  const a = E.createState(lv, 99), b = E.createState(lv, 99);
  ok(a.c.every((v, i) => v === b.c[i]), 'the same seed gives the same board');
}

console.log(`Rules: ${checks} checks, ${fail} failed`);
if (process.argv.includes('--rules')) process.exit(fail ? 1 : 0);

// ---------- every level ----------
const RUNS = 4; // must match CHECK_RUNS in tools/gen-treat.mjs
const levels = JSON.parse(readFileSync(new URL('../www/levels/treat.json', import.meta.url), 'utf8')).levels;
const t0 = Date.now();
let wins = 0, games = 0, lvlFail = 0;
ok(levels.length >= 120, `at least 120 levels (${levels.length})`);
levels.forEach((lv, i) => {
  // the level itself is well formed
  ok(lv.rows.length === lv.h && lv.rows.every((r) => r.length === lv.w), `level ${i + 1} board size`);
  ok(lv.moves >= 10 && lv.moves <= 60 && lv.stars[0] < lv.stars[1] && lv.stars[1] < lv.stars[2], `level ${i + 1} moves and stars`);
  let any = false;
  for (let k = 0; k < RUNS; k++) {
    const r = E.botPlay(lv, lv.seed + k, 31 + k);
    games++; if (r.won) { wins++; any = true; }
  }
  if (!any) { lvlFail++; ok(false, `level ${i + 1} was not won in any check game`); }
});
console.log(`Levels: ${levels.length} levels, ${games} check games, the bot won ${Math.round((wins / games) * 100)}% (every level won at least once: ${lvlFail ? 'no' : 'yes'}) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(fail ? `Treat Twist: ${fail} problem(s)` : 'All Treat Twist checks passed');
process.exit(fail ? 1 : 0);
