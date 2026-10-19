// Checks the rules of the Play Together games Mancala, Nine Men's Morris, Five in a Row, Word Duel and
// Memory Duel, then plays random full games of each between two simulated phones that only share moves
// (sent as JSON, like the real link) and checks both phones always agree.
// Run with: node tools/test-duo-c.mjs
import {
  kalahNew, kalahPlay, kalahMoves, kalahLegal,
  morrisNew, morrisMoves, morrisPlay, morrisLegal, morrisRemovable, morrisFlying, MORRIS_MILLS, MORRIS_ADJ,
  gomokuNew, gomokuPlay, gomokuLegal, fiveAt,
  wordNew, wordSet, wordGuess, wordNext, wordGuesser, wordPattern, WORD,
  memoryNew, memoryFlip, memoryLegal,
} from '../www/js/duo/tbc-rules.js';
import { mulberry32 } from '../www/js/sudoku-engine.js';

let fail = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fail++; console.log('FAIL', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const sum = (a) => a.reduce((x, y) => x + y, 0);

// ---------- Kalah ----------
{
  let s = kalahNew(0);
  eq(s.pits, [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0], 'kalah start');
  // pit 2 with 4 seeds ends in the store: extra turn
  let r = kalahPlay(s, 2);
  eq(r.trace, [3, 4, 5, 6], 'kalah sow trace'); ok(r.extra && s.turn === 0, 'kalah extra turn in own store');
  ok(!kalahLegal(s, 2), 'kalah empty pit is not a move'); ok(!kalahLegal(s, 8), 'kalah cannot sow the other side');
  // sowing skips the opponent's store
  s = kalahNew(0); s.pits = [0, 0, 0, 0, 0, 10, 0, 1, 1, 1, 1, 1, 1, 0];
  r = kalahPlay(s, 5);
  ok(!r.trace.includes(13), 'kalah skips the opponent store'); eq(r.trace, [6, 7, 8, 9, 10, 11, 12, 0, 1, 2], 'kalah long sow');
  // capture: last seed in an own empty pit with seeds opposite
  s = kalahNew(0); s.pits = [1, 0, 3, 3, 3, 3, 0, 3, 3, 3, 3, 5, 3, 0];
  r = kalahPlay(s, 0);
  ok(r.capture && r.capture.seeds === 6 && s.pits[6] === 6 && s.pits[1] === 0 && s.pits[11] === 0, 'kalah capture');
  ok(s.turn === 1, 'kalah turn passes after capture');
  // no capture when the opposite pit is empty
  s = kalahNew(0); s.pits = [1, 0, 3, 3, 3, 3, 0, 3, 3, 3, 3, 0, 3, 0];
  r = kalahPlay(s, 0); ok(!r.capture && s.pits[1] === 1, 'kalah no capture from an empty opposite pit');
  // end sweep: player 0 empties their row, player 1 keeps their seeds
  s = kalahNew(0); s.pits = [0, 0, 0, 0, 0, 1, 20, 2, 2, 2, 2, 2, 2, 15];
  r = kalahPlay(s, 5);
  ok(s.over && r.sweep && s.pits[13] === 27 && s.pits[6] === 21 && s.winner === 1, 'kalah end sweep and winner');
  ok(sum(s.pits) === 48, 'kalah seeds conserved');
}

// ---------- Nine Men's Morris ----------
{
  ok(MORRIS_MILLS.length === 16, 'morris has 16 mills');
  ok(MORRIS_ADJ.every((n, i) => n.every((j) => MORRIS_ADJ[j].includes(i))), 'morris adjacency is symmetric');
  eq(MORRIS_ADJ.map((n) => n.length).reduce((a, b) => a + b, 0) / 2, 32, 'morris has 32 lines');
  const s = morrisNew(0);
  const play = (m) => { const r = morrisPlay(s, m); ok(r, `morris move ${JSON.stringify(m)} legal`); return r; };
  play({ k: 'place', to: 0 }); play({ k: 'place', to: 8 });
  play({ k: 'place', to: 1 }); play({ k: 'place', to: 9 });
  const r = play({ k: 'place', to: 2 });
  ok(r.mill && s.remove && s.turn === 0, 'morris mill on placing');
  ok(!morrisLegal(s, { k: 'place', to: 5 }), 'morris must remove after a mill');
  play({ k: 'remove', at: 8 });
  ok(s.turn === 1 && s.b[8] === -1, 'morris piece removed and turn passes');
  // removal rule: pieces in a mill are safe while others exist
  const t = morrisNew(1);
  t.b[0] = t.b[1] = t.b[2] = 1; t.b[20] = 1; t.b[8] = 0; t.b[9] = 0; t.hand = [0, 0]; t.turn = 0;
  t.b[16] = 0; t.b[17] = -1;
  morrisPlay(t, { k: 'move', from: 16, to: 17 }) || ok(false, 'morris move 16 to 17');
  eq(t.b[17], 0, 'morris slide');
  const u = morrisNew(0);
  u.hand = [0, 0]; u.b[0] = u.b[1] = u.b[2] = 1; u.b[20] = 1; u.b[8] = u.b[16] = 0; u.b[9] = 0; u.turn = 0;
  // player 0 slides 16 -> 17 making 9-17? no: build a vertical mill 1,9,17 needs b[1] = 0. use 8,9,10 instead
  u.b[10] = -1; u.b[11] = 0; u.b[16] = -1;
  const r2 = morrisPlay(u, { k: 'move', from: 11, to: 10 });
  ok(r2 && r2.mill, 'morris mill by sliding');
  eq(morrisRemovable(u), [20], 'morris cannot take from a mill while a loose piece exists');
  u.b[20] = -1;
  eq(morrisRemovable(u).sort((a, b) => a - b), [0, 1, 2], 'morris may take from a mill when all pieces are in mills');
  // flying with three pieces
  const f = morrisNew(0);
  f.hand = [0, 0]; f.b[0] = f.b[9] = f.b[22] = 0; f.b[4] = f.b[13] = f.b[18] = f.b[5] = 1; f.turn = 0;
  ok(morrisFlying(f, 0), 'morris three pieces fly');
  ok(morrisLegal(f, { k: 'move', from: 0, to: 20 }), 'morris flying to a far point');
  ok(!morrisLegal(f, { k: 'move', from: 4, to: 20 }), 'morris cannot move the other player');
  // losing when down to two pieces
  const l = morrisNew(0);
  l.hand = [0, 0]; l.b[0] = l.b[1] = 0; l.b[3] = 0; l.b[8] = l.b[9] = 1; l.b[10] = 1; l.b[20] = 1; l.turn = 1;
  l.b[11] = -1;
  // player 1 slides 20 -> 21? make a mill 8,9,10 is already full; slide 20 -> 19 and back is quiet.
  l.b[10] = -1; l.b[11] = 1;
  morrisPlay(l, { k: 'move', from: 11, to: 10 });
  ok(l.remove, 'morris mill before the final take');
  morrisPlay(l, { k: 'remove', at: 3 });
  ok(l.over && l.winner === 1, 'morris down to two pieces loses');
  // the opponent with no pieces on the board yet: a mill does not wait for a removal
  const z = morrisNew(0);
  z.b[0] = z.b[1] = 0; z.hand = [7, 9];
  const rz = morrisPlay(z, { k: 'place', to: 2 });
  ok(rz && !z.remove && z.turn === 1, 'morris mill with nothing to take');
}

// ---------- Five in a Row ----------
{
  const lines = { across: [1, 0], down: [0, 1], diag: [1, 1], anti: [1, -1] };
  for (const [name, [dx, dy]] of Object.entries(lines)) {
    const s = gomokuNew(0);
    const x0 = 5, y0 = 5, cells = [...Array(5)].map((_, k) => (y0 + dy * k) * s.n + x0 + dx * k);
    let filler = 0;
    for (let k = 0; k < 5; k++) {
      ok(!s.over, `gomoku ${name} not over early`);
      gomokuPlay(s, cells[k]);
      if (k < 4) { while (!gomokuLegal(s, filler) || Math.abs((filler % s.n) - 5) < 6) filler++; gomokuPlay(s, filler); }
    }
    ok(s.over && s.winner === 0 && s.line.length === 5, `gomoku five ${name}`);
  }
  const s = gomokuNew(0);
  [0, 1, 2, 3].forEach((x) => { s.b[x] = 0; });
  ok(!fiveAt(s, 3), 'gomoku four is not a win');
  s.b[5] = 0; s.b[4] = 0;
  ok(fiveAt(s, 4) && fiveAt(s, 4).length === 6, 'gomoku six in a row counts');
  ok(!gomokuLegal(s, 0), 'gomoku occupied point');
}

// ---------- Word Duel ----------
{
  const s = wordNew(0);
  ok(!wordSet(s, 'cat'), 'word too short rejected'); ok(!wordSet(s, 'elephantine'), 'word too long rejected');
  ok(wordSet(s, 'Apple'), 'word set'); eq(s.word, 'apple', 'word lower cased');
  ok(wordGuesser(s) === 1, 'other player guesses');
  ok(wordGuess(s, 'p').hit, 'hit'); eq(wordPattern(s), '_pp__', 'pattern');
  ok(wordGuess(s, 'p') === null, 'repeated letter ignored');
  ok(!wordGuess(s, 'z').hit && s.misses === 1, 'miss counted');
  wordGuess(s, 'a'); wordGuess(s, 'l');
  const r = wordGuess(s, 'e');
  ok(r.roundOver && r.solved && r.points === WORD.BALLOONS - 1 + 1, 'solved scores balloons left plus one');
  eq(s.score, [0, WORD.BALLOONS], 'score goes to the guesser');
  wordNext(s);
  ok(s.setter === 1 && !s.word, 'setter swaps');
  wordSet(s, 'quiz');
  for (const l of 'abcdefg') wordGuess(s, l);
  ok(s.history[1].solved === false && s.history[1].points === 0, 'failed word scores nothing');
  for (let k = 2; k < WORD.ROUNDS; k++) { wordNext(s); wordSet(s, 'word'); for (const l of 'word') wordGuess(s, l); }
  wordNext(s);
  ok(s.over && s.round === WORD.ROUNDS, 'six rounds then over');
  ok(s.winner === (s.score[0] > s.score[1] ? 0 : s.score[1] > s.score[0] ? 1 : null), 'word winner by score');
}

// ---------- Memory Duel ----------
{
  const s = memoryNew(0, 4, mulberry32(7), 30);
  ok(s.cards.length === 8 && new Set(s.cards).size === 4, 'memory deal has pairs');
  const twin = (i) => s.cards.findIndex((k, j) => j !== i && k === s.cards[i]);
  const a = 0, b = twin(0);
  memoryFlip(s, a); const r = memoryFlip(s, b);
  ok(r.match && s.turn === 0 && s.score[0] === 1, 'memory match scores and goes again');
  const c = [...Array(8).keys()].find((i) => !s.gone.includes(i));
  const d = [...Array(8).keys()].find((i) => !s.gone.includes(i) && i !== c && s.cards[i] !== s.cards[c]);
  memoryFlip(s, c); const r2 = memoryFlip(s, d);
  ok(!r2.match && s.turn === 1 && s.miss.length === 2, 'memory miss passes the turn');
  ok(!memoryLegal(s, a), 'memory found cards cannot be flipped');
  const x = memoryNew(1, 10, mulberry32(99), 30), y = memoryNew(1, 10, mulberry32(99), 30);
  eq(x.cards, y.cards, 'memory same seed same deal');
}

// ---------- Two simulated phones ----------
// Each phone keeps its own state; the player to move picks a random legal move on their phone, and the
// move travels to the other phone as JSON. After every move both states must match exactly.
function duel(name, make, movesFor, apply, extra = () => {}) {
  for (let g = 0; g < 40; g++) {
    const rng = mulberry32(1000 + g), pick = (a) => a[Math.floor(rng() * a.length)];
    const phones = [make(g), make(g)];
    let n = 0;
    while (!phones[0].over && n++ < 2000) {
      const p = phones[0].turn ?? 0;
      const mine = phones[p === undefined ? 0 : p];
      const opts = movesFor(mine, rng);
      if (!opts.length) break;
      const mv = JSON.parse(JSON.stringify(pick(opts)));
      apply(mine, mv);
      apply(phones[1 - (mine === phones[0] ? 0 : 1)], JSON.parse(JSON.stringify(mv)));
      extra(phones);
      if (JSON.stringify(phones[0]) !== JSON.stringify(phones[1])) { ok(false, `${name} game ${g}: phones disagree after move ${n}`); break; }
    }
    ok(phones[0].over, `${name} game ${g} finished (${n} moves)`);
  }
}
duel('mancala', (g) => kalahNew(g % 2), (s) => kalahMoves(s), (s, i) => kalahPlay(s, i));
duel('morris', (g) => morrisNew(g % 2), (s) => morrisMoves(s), (s, m) => morrisPlay(s, m));
duel('gomoku', (g) => gomokuNew(g % 2), (s) => {
  // play near existing stones so games end in a reasonable number of moves
  const near = [];
  s.b.forEach((v, i) => { if (v >= 0) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = (i % s.n) + dx, y = Math.floor(i / s.n) + dy; if (x >= 0 && y >= 0 && x < s.n && y < s.n && s.b[y * s.n + x] < 0) near.push(y * s.n + x); } });
  return near.length ? near : [112];
}, (s, i) => gomokuPlay(s, i));
{
  // Word Duel moves alternate between the setter's word and the guesser's letters
  const WORDS = ['apple', 'river', 'turtle', 'garden', 'planet', 'bridge', 'yellow', 'quiet'];
  duel('wordduel', (g) => { const s = wordNew(g % 2); s.turn = s.setter; return s; },
    (s, rng) => (!s.word ? [{ k: 'set', w: WORDS[Math.floor(rng() * WORDS.length)] }] : [...'abcdefghijklmnopqrstuvwxyz'].filter((c) => !s.guessed.includes(c)).map((l) => ({ k: 'guess', l }))),
    (s, mv) => {
      if (mv.k === 'set') { wordSet(s, mv.w); s.turn = wordGuesser(s); return; }
      const r = wordGuess(s, mv.l);
      if (r && r.roundOver) { wordNext(s); s.turn = s.setter; }
    });
}
duel('memory', (g) => memoryNew(g % 2, 10, mulberry32(g), 30), (s) => s.cards.map((_, i) => i).filter((i) => memoryLegal(s, i)), (s, i) => memoryFlip(s, i));

console.log(`${checks} checks, ${fail} failed`);
if (fail) process.exit(1);
console.log('All Play Together board game checks passed (Mancala, Morris, Five in a Row, Word Duel, Memory Duel)');
