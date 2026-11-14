// Checks the Play Together dice games Ludo and Snakes and Ladders (www/js/duo/ludo-rules.js, snakes-rules.js and
// ludoAi in ai-board.js). Ludo: the board, legal moves, captures and safe squares, the exact roll home, the extra
// roll on a 6 and the third 6 that ends the turn, that the computer only plays legal moves, and over many games
// that Hard and Medium beat Easy and Hard holds its own against Medium (the dice decide a lot in Ludo).
// Snakes and Ladders: the layout (nothing shared, nothing on 100, every square reachable and 100 reachable from
// every square), the bounce back from 100 and that games always finish.
// Two phones: whole games where each side keeps its own state and only the rolls and moves travel between them
// (as JSON, like the real link), checking both sides end the same. The real game screens are also played
// against each other in headless Chrome by tools/test-duo.mjs (tools/duo/pair.html).
// Run with: node tools/test-duo-ludo.mjs
import { LUDO, LUDO_TRACK, LUDO_SAFE, LUDO_START, ludoCell, ludoAbs, ludoNew, ludoRoll, ludoMove, ludoMoves, ludoTarget, ludoThreats } from '../www/js/duo/ludo-rules.js';
import { LADDERS, SNAKES, SNL_JUMPS, SNL_END, snlCell, snlNew, snlRoll, snlSteps } from '../www/js/duo/snakes-rules.js';
import { ludoAi } from '../www/js/duo/ai-board.js';
import { makePair } from '../www/js/duo/core.js';
import { mulberry32 } from '../www/js/sudoku-engine.js';

let fail = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fail++; console.log('FAIL', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const rng = mulberry32(2026);
const die = (r = rng) => 1 + Math.floor(r() * 6);
const t0 = Date.now();

// ---------- Ludo: the board ----------
{
  ok(LUDO_TRACK.length === 52 && new Set(LUDO_TRACK.map((c) => c.join())).size === 52, 'ludo: 52 different track squares');
  ok(LUDO_TRACK.every(([c, r], i) => { const [c2, r2] = LUDO_TRACK[(i + 1) % 52]; return Math.abs(c - c2) <= 1 && Math.abs(r - r2) <= 1; }), 'ludo: each track square touches the next');
  ok(LUDO_TRACK.every(([c, r]) => (c >= 6 && c <= 8) || (r >= 6 && r <= 8)), 'ludo: the track stays on the cross');
  eq(ludoCell(0, 0), [6, 13], 'ludo: player 0 starts at the bottom left'); eq(ludoCell(1, 0), [8, 1], 'ludo: player 1 starts at the top right');
  for (const p of [0, 1]) {
    const col = [51, 52, 53, 54, 55].map((r) => ludoCell(p, r));
    ok(col.every(([c]) => c === 7), `ludo: player ${p}'s home column runs up the middle`);
    const [c50, r50] = ludoCell(p, 50), [c51, r51] = ludoCell(p, 51);
    ok(Math.abs(c50 - c51) + Math.abs(r50 - r51) === 1, `ludo: player ${p} turns straight into the home column`);
    ok(LUDO_SAFE.includes(ludoAbs(p, 0)) && LUDO_SAFE.includes(ludoAbs(p, 8)), `ludo: player ${p}'s start and first star are safe`);
  }
  ok(LUDO_START[1] - LUDO_START[0] === -26, 'ludo: the players sit opposite each other');
}

// ---------- Ludo: rolls and moves ----------
const S = (pos0, pos1, turn = 0) => ({ ...ludoNew(turn), pos: [pos0.slice(), pos1.slice()] });
{
  // everyone in the yard: only a 6 moves, and anything else passes the turn
  let s = ludoNew(0);
  let r = ludoRoll(s, 4);
  ok(r.pass && s.turn === 1 && s.roll === 0, 'ludo: no 6 with every pawn in the yard passes the turn');
  s = ludoNew(0); r = ludoRoll(s, 6);
  eq(r.moves, [0, 1, 2, 3], 'ludo: a 6 can bring any pawn out');
  let m = ludoMove(s, 2);
  ok(m.to === 0 && s.pos[0][2] === 0 && m.extra && s.turn === 0 && s.roll === 0, 'ludo: a 6 brings a pawn to its start and earns another roll');
  ok(ludoMove(s, 2) === null, 'ludo: no move before rolling');
  // plain move along the track, then the turn passes
  r = ludoRoll(s, 3);
  eq(r.moves, [2], 'ludo: only the pawn on the board can move a 3');
  m = ludoMove(s, 2);
  ok(m.to === 3 && !m.extra && s.turn === 1, 'ludo: a 3 moves three squares and passes the turn');
  eq(m.path, [1, 2, 3], 'ludo: the path steps through every square');
  // the third 6 in a row ends the turn without moving
  s = S([5, -1, -1, -1], [-1, -1, -1, -1]);
  ludoRoll(s, 6); ludoMove(s, 0);
  ludoRoll(s, 6); ludoMove(s, 0);
  ok(s.turn === 0 && s.sixes === 2, 'ludo: two 6s keep the turn');
  r = ludoRoll(s, 6);
  ok(r.forfeit && s.turn === 1 && s.pos[0][0] === 17 && s.sixes === 0, 'ludo: the third 6 in a row ends the turn without a move');
  s = S([5, -1, -1, -1], [-1, -1, -1, -1]);
  ludoRoll(s, 6); ludoMove(s, 0); ludoRoll(s, 2); ludoMove(s, 0);
  ok(s.turn === 1 && s.sixes === 0, 'ludo: a roll that is not a 6 resets the count');
  // exact roll home
  s = S([53, -1, -1, -1], [-1, -1, -1, -1]);
  ok(ludoTarget(s, 0, 0, 4) === null && ludoTarget(s, 0, 0, 3) === 56, 'ludo: home needs the exact number');
  r = ludoRoll(s, 5);
  ok(r.pass && s.pos[0][0] === 53, 'ludo: overshooting home is not a move');
  s = S([53, 56, 56, 56], [-1, -1, -1, -1]);
  ludoRoll(s, 3); m = ludoMove(s, 0);
  ok(m.home && m.win && s.over && s.winner === 0, 'ludo: the fourth pawn home wins');
  ok(ludoRoll(s, 4) === null, 'ludo: no rolls after the game is over');
  // a pawn home cannot move again
  s = S([56, 10, -1, -1], [-1, -1, -1, -1]);
  ludoRoll(s, 1);
  eq(ludoMoves(s), [1], 'ludo: a pawn that is home stays home');
}

// ---------- Ludo: captures and safe squares ----------
{
  // player 0 at rel 10 (track 49), player 1 at track 1 (its rel 40): a 4 from player 0 lands on track 1
  let s = S([10, -1, -1, -1], [40, -1, -1, -1]);
  ok(ludoAbs(0, 14) === ludoAbs(1, 40), 'ludo: test squares line up');
  ludoRoll(s, 4); let m = ludoMove(s, 0);
  eq(m.captured, [0], 'ludo: landing on the other pawn captures it');
  ok(s.pos[1][0] === -1, 'ludo: the captured pawn goes back to the yard');
  // two pawns on one square are both sent back
  s = S([10, -1, -1, -1], [40, 40, -1, -1]);
  ludoRoll(s, 4); m = ludoMove(s, 0);
  eq(m.captured, [0, 1], 'ludo: a stack of two is captured together');
  // a star square is safe: player 0's rel 8 is a star (track 47); player 1 there is its rel 34
  s = S([4, -1, -1, -1], [34, -1, -1, -1]);
  ok(ludoAbs(1, 34) === ludoAbs(0, 8) && LUDO_SAFE.includes(ludoAbs(0, 8)), 'ludo: star square lines up');
  ludoRoll(s, 4); m = ludoMove(s, 0);
  ok(!m.captured.length && s.pos[1][0] === 34, 'ludo: no capture on a star');
  // start squares are safe: player 1 sits on player 0's start (its rel 26); player 0 brings a pawn out
  s = S([-1, -1, -1, -1], [26, -1, -1, -1]);
  ludoRoll(s, 6); m = ludoMove(s, 0);
  ok(!m.captured.length && s.pos[1][0] === 26, 'ludo: no capture on a start square');
  // own pawns share a square
  s = S([3, 5, -1, -1], [-1, -1, -1, -1]);
  ludoRoll(s, 2); m = ludoMove(s, 0);
  ok(s.pos[0][0] === 5 && s.pos[0][1] === 5 && !m.captured.length, 'ludo: your own pawns can share a square');
  // pawns in the home column cannot be captured and do not capture
  s = S([52, -1, -1, -1], [-1, -1, -1, -1]);
  ok(ludoAbs(0, 52) === -1, 'ludo: the home column is off the shared track');
  // threats: a player 1 pawn three squares behind
  s = S([20, -1, -1, -1], [ludoRelOf(1, ludoAbs(0, 17)), -1, -1, -1]);
  ok(ludoThreats(s, 1, ludoAbs(0, 20)) === 1, 'ludo: a pawn three behind is a threat');
  ok(ludoThreats(s, 1, ludoAbs(0, 24)) === 0, 'ludo: a pawn seven behind is not');
}
function ludoRelOf(p, a) { return (a - LUDO_START[p] + 52) % 52; }

// ---------- Ludo: the computer ----------
// Plays one game between two levels (null is a random player); returns the winner.
function ludoGame(lv0, lv1, first, r = rng, checkLegal = true) {
  const s = ludoNew(first), lv = [lv0, lv1];
  for (let n = 0; n < 5000 && !s.over; n++) {
    const res = ludoRoll(s, die(r));
    if (!res || res.pass || res.forfeit) continue;
    const moves = ludoMoves(s);
    const k = lv[s.turn] ? ludoAi(s, lv[s.turn], r) : moves[Math.floor(r() * moves.length)];
    if (checkLegal) ok(moves.includes(k), `ludo ai ${lv[s.turn]}: pawn ${k} is not a legal move`);
    ludoMove(s, k);
  }
  ok(s.over, 'ludo: game finished');
  return s.winner;
}
{
  // with two choices, Medium and Hard capture rather than walk on
  const c = S([10, 2, -1, -1], [40, -1, -1, -1], 0);
  ludoRoll(c, 4);
  for (const lv of ['medium', 'hard']) for (let k = 0; k < 5; k++) ok(ludoAi(c, lv, rng) === 0, `ludo ai ${lv}: takes the capture`);
  // Medium and Hard bring a pawn home rather than walk another on
  const h = S([54, 56, 30, 20], [-1, -1, -1, -1], 0);
  ludoRoll(h, 2);
  for (const lv of ['medium', 'hard']) for (let k = 0; k < 5; k++) ok(ludoAi(h, lv, rng) === 0, `ludo ai ${lv}: brings a pawn home`);
  // Medium and Hard do not stop right in front of the other player when they can avoid it
  const d = S([20, 30, -1, -1], [ludoRelOf(1, ludoAbs(0, 21)), -1, -1, -1], 0);
  ludoRoll(d, 2);
  for (const lv of ['medium', 'hard']) for (let k = 0; k < 5; k++) ok(ludoAi(d, lv, rng) !== 0 || ludoThreats(d, 1, ludoAbs(0, 22)) === 0, `ludo ai ${lv}: keeps away from the other pawn`);
}
const rates = [];
function rate(a, b, n) {
  let won = 0;
  for (let k = 0; k < n; k++) if (ludoGame(a, b, k % 2) === 0) won++;
  rates.push(`${a || 'random'} v ${b || 'random'}: ${won}/${n} (${Math.round((100 * won) / n)}%)`);
  return won / n;
}
ok(rate('easy', null, 200) > 0.35, 'ludo: Easy holds its own against random play');
const hardEasy = rate('hard', 'easy', 400);
ok(hardEasy >= 0.6, `ludo: Hard beats Easy at least 60% of the time (got ${Math.round(hardEasy * 100)}%)`);
const medEasy = rate('medium', 'easy', 400);
ok(medEasy >= 0.55, `ludo: Medium beats Easy more often than not (got ${Math.round(medEasy * 100)}%)`);
const hardMed = rate('hard', 'medium', 600);
ok(hardMed >= 0.47, `ludo: Hard holds its own against Medium (got ${Math.round(hardMed * 100)}%)`);

// ---------- Snakes and Ladders: the layout ----------
{
  const ends = [...Object.entries(LADDERS), ...Object.entries(SNAKES)].flat().map(Number);
  ok(new Set(ends).size === ends.length, 'snakes: no square is the end of two ladders or snakes');
  ok(Object.keys(LADDERS).length >= 7 && Object.keys(SNAKES).length >= 7, 'snakes: about eight of each');
  ok(Object.entries(LADDERS).every(([a, b]) => +b > +a), 'snakes: ladders go up');
  ok(Object.entries(SNAKES).every(([a, b]) => +b < +a), 'snakes: snakes go down');
  ok(!(SNL_END in SNL_JUMPS) && !Object.values(SNL_JUMPS).includes(SNL_END), 'snakes: nothing starts or ends on 100');
  ok(Object.keys(SNAKES).every((h) => !(h in LADDERS)), 'snakes: no snake head on a ladder foot');
  ok(Object.values(SNL_JUMPS).every((t) => !(t in SNL_JUMPS)), 'snakes: no ladder or snake ends where another starts');
  ok(ends.every((n) => n >= 2 && n <= 99), 'snakes: everything is on the board');
  ok(Object.entries(SNL_JUMPS).every(([a, b]) => snlCell(+a).row !== snlCell(+b).row), 'snakes: every ladder and snake changes row');
  // board numbering: 1 bottom left, 10 bottom right, 11 above 10, 100 top left
  eq([1, 10, 11, 20, 91, 100].map((n) => snlCell(n)), [{ col: 0, row: 0 }, { col: 9, row: 0 }, { col: 9, row: 1 }, { col: 0, row: 1 }, { col: 9, row: 9 }, { col: 0, row: 9 }], 'snakes: boustrophedon numbering');
  // every square a counter can stop on is reachable from the start, and 100 is reachable from every one of them
  const next = (n) => [1, 2, 3, 4, 5, 6].map((d) => { const st = snlSteps(n, d), l = st[st.length - 1]; return SNL_JUMPS[l] || l; });
  const reach = new Set([0]), todo = [0];
  while (todo.length) for (const m of next(todo.pop())) if (!reach.has(m)) { reach.add(m); todo.push(m); }
  const rest = [...Array(101).keys()].filter((n) => !(n in SNL_JUMPS));
  ok(rest.every((n) => reach.has(n)), `snakes: every square is reachable (missing ${rest.filter((n) => !reach.has(n)).join(' ')})`);
  const toEnd = new Set([SNL_END]);
  for (let changed = true; changed;) { changed = false; for (const n of rest) if (!toEnd.has(n) && next(n).some((m) => toEnd.has(m))) { toEnd.add(n); changed = true; } }
  ok(rest.every((n) => toEnd.has(n)), 'snakes: 100 can be reached from every square');
}

// ---------- Snakes and Ladders: rolls ----------
{
  let s = snlNew(0);
  let r = snlRoll(s, 2);
  ok(r.to === 2 && s.pos[0] === 2 && s.turn === 1, 'snakes: first roll enters the board');
  r = snlRoll(s, 3);
  ok(r.jump && r.jump.kind === 'ladder' && r.to === 22 && s.pos[1] === 22, 'snakes: a ladder climbs');
  s = { ...snlNew(0), pos: [13, 0] };
  r = snlRoll(s, 3);
  ok(r.jump && r.jump.kind === 'snake' && r.to === 6, 'snakes: a snake slides down');
  s = { ...snlNew(0), pos: [40, 0] };
  r = snlRoll(s, 6);
  ok(r.extra && s.turn === 0, 'snakes: a 6 earns another roll');
  s = { ...snlNew(0), pos: [97, 0] };
  r = snlRoll(s, 5);
  eq(r.steps, [98, 99, 100, 99, 98], 'snakes: steps bounce back from 100');
  ok(r.bounce && r.land === 98 && r.to === 78 && !r.win, 'snakes: a bounce can land on a snake');
  s = { ...snlNew(0), pos: [97, 0] };
  r = snlRoll(s, 3);
  ok(r.win && s.over && s.winner === 0 && !r.extra, 'snakes: the exact number wins');
  s = { ...snlNew(0), pos: [94, 0] };
  r = snlRoll(s, 6);
  ok(r.win && !r.extra, 'snakes: a 6 onto 100 wins without another roll');
  ok(snlRoll(s, 1) === null, 'snakes: no rolls after the game is over');
  // whole games always finish
  let longest = 0, total = 0;
  for (let g = 0; g < 2000; g++) {
    const t = snlNew(g % 2);
    let n = 0;
    while (!t.over && n < 5000) { snlRoll(t, die()); n++; }
    ok(t.over, 'snakes: game finished');
    longest = Math.max(longest, n); total += n;
  }
  rates.push(`snakes: 2000 games, ${Math.round(total / 2000)} rolls on average, longest ${longest}`);
}

// ---------- Two phones: only the rolls and moves travel ----------
// A stand-in for each game screen with the same message protocol as g-ludo.js and g-snakes.js: on its turn a
// phone draws the roll from its own ctx.rng and sends {t: 'mv', m: {k: 'roll', d}}, then {k: 'move', i}. The
// other phone applies exactly what it receives. Messages go through makePair, which copies them as JSON and
// delivers them after a delay.
function standIn(kind) {
  return {
    create(ctx) {
      const s = kind === 'ludo' ? ludoNew(ctx.first) : snlNew(ctx.first), r = mulberry32(ctx.me * 7 + 3);
      const apply = (m) => {
        if (m.k === 'roll') (kind === 'ludo' ? ludoRoll : snlRoll)(s, m.d); else ludoMove(s, m.i);
        if (s.over) ctx.end({ winner: s.winner });
      };
      const act = () => {
        if (s.over || s.turn !== ctx.me) return;
        const m = kind === 'snakes' || !s.roll ? { k: 'roll', d: 1 + Math.floor(ctx.rng() * 6) } : { k: 'move', i: ludoAi(s, ctx.me ? 'hard' : 'medium', r) };
        ctx.send({ t: 'mv', m }); apply(m);
        setTimeout(act, 0);
      };
      ctx.onMsg((msg) => { if (msg.t === 'mv') { apply(msg.m); setTimeout(act, 0); } });
      setTimeout(act, 0);
      return { state: () => JSON.stringify(s), destroy() {} };
    },
  };
}
for (const kind of ['ludo', 'snakes']) {
  for (let g = 0; g < 6; g++) {
    const pair = makePair(standIn(kind), { first: g % 2, seed: 500 + g, latency: g % 3 });
    for (let w = 0; w < 4000 && !(pair.results[0] && pair.results[1]); w++) await new Promise((res) => setTimeout(res, 1));
    const [a, b] = pair.results;
    ok(a && b && a.winner === b.winner && pair.game[0].state() === pair.game[1].state(), `${kind} two phones game ${g}: both phones agree`);
    pair.destroy();
  }
}

console.log(rates.join('\n'));
console.log(`Dice games: ${checks} checks, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
