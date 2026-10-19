// Rules for the Play Together turn-based games built by fork C: Mancala (Kalah), Nine Men's Morris,
// Five in a Row, Word Duel and Memory Duel. No browser dependencies, so tools/test-duo-c.mjs can use them.
// Every state is plain JSON and every move is applied the same way on both phones.

// ---------- Mancala (Kalah, 6 pits, 4 seeds) ----------
// pits[0..5] belong to player 0 (store at 6), pits[7..12] to player 1 (store at 13).
export const KALAH = { PITS: 6, SEEDS: 4 };
export const storeOf = (p) => (p ? 13 : 6);
export const pitsOf = (p) => (p ? [7, 8, 9, 10, 11, 12] : [0, 1, 2, 3, 4, 5]);
export const ownerOfPit = (i) => (i < 6 ? 0 : i > 6 && i < 13 ? 1 : -1);

export function kalahNew(first = 0, seeds = KALAH.SEEDS) {
  const pits = new Array(14).fill(seeds);
  pits[6] = 0; pits[13] = 0;
  return { pits, turn: first, over: false, winner: null, last: -1 };
}
export const kalahLegal = (s, i) => !s.over && ownerOfPit(i) === s.turn && s.pits[i] > 0;
export const kalahMoves = (s) => pitsOf(s.turn).filter((i) => s.pits[i] > 0);

// Sows pit i for the player to move. Returns {trace, capture, extra, sweep} describing what happened so
// the screen can animate it: trace lists every pit a seed landed in, in order.
export function kalahPlay(s, i) {
  if (!kalahLegal(s, i)) return null;
  const p = s.turn, skip = storeOf(1 - p), trace = [];
  let n = s.pits[i], at = i;
  s.pits[i] = 0;
  while (n > 0) {
    at = (at + 1) % 14;
    if (at === skip) continue;
    s.pits[at]++; n--; trace.push(at);
  }
  let capture = null, extra = false;
  if (at === storeOf(p)) extra = true;
  else if (ownerOfPit(at) === p && s.pits[at] === 1 && s.pits[12 - at] > 0) {
    const got = s.pits[12 - at] + 1;
    capture = { pit: at, opp: 12 - at, seeds: got };
    s.pits[storeOf(p)] += got; s.pits[at] = 0; s.pits[12 - at] = 0;
  }
  s.last = i;
  // the game ends when either row is empty; the other player keeps the seeds left on their side
  let sweep = null;
  const empty0 = pitsOf(0).every((k) => !s.pits[k]), empty1 = pitsOf(1).every((k) => !s.pits[k]);
  if (empty0 || empty1) {
    sweep = [0, 0];
    for (const q of [0, 1]) for (const k of pitsOf(q)) { sweep[q] += s.pits[k]; s.pits[storeOf(q)] += s.pits[k]; s.pits[k] = 0; }
    s.over = true;
    s.winner = s.pits[6] > s.pits[13] ? 0 : s.pits[13] > s.pits[6] ? 1 : null;
  } else if (!extra) s.turn = 1 - p;
  return { trace, capture, extra, sweep, player: p };
}

// ---------- Nine Men's Morris ----------
// Points are numbered 0..23: outer square 0..7, middle 8..15, inner 16..23, clockwise from top left.
// Within a square, even indexes are corners and odd indexes are the middle of a side.
export const MORRIS_ADJ = (() => {
  const adj = [...Array(24)].map(() => []);
  const link = (a, b) => { adj[a].push(b); adj[b].push(a); };
  for (let sq = 0; sq < 3; sq++) for (let k = 0; k < 8; k++) link(sq * 8 + k, sq * 8 + ((k + 1) % 8));
  for (let k = 1; k < 8; k += 2) { link(k, 8 + k); link(8 + k, 16 + k); }
  return adj;
})();
export const MORRIS_MILLS = (() => {
  const m = [];
  for (let sq = 0; sq < 3; sq++) for (const k of [0, 2, 4, 6]) m.push([sq * 8 + k, sq * 8 + k + 1, sq * 8 + ((k + 2) % 8)]);
  for (let k = 1; k < 8; k += 2) m.push([k, 8 + k, 16 + k]);
  return m;
})();
export const MORRIS_DRAW_PLIES = 50; // moves in a row (both players) without a mill in the moving stage

export function morrisNew(first = 0) {
  return { b: new Array(24).fill(-1), hand: [9, 9], turn: first, remove: false, quiet: 0, over: false, winner: null, reason: '', last: null };
}
export const morrisCount = (s, p) => s.b.filter((x) => x === p).length;
export const inMill = (s, i) => s.b[i] >= 0 && MORRIS_MILLS.some((m) => m.includes(i) && m.every((k) => s.b[k] === s.b[i]));
const makesMill = (s, i) => MORRIS_MILLS.some((m) => m.includes(i) && m.every((k) => s.b[k] === s.b[i]));
export const morrisFlying = (s, p) => s.hand[p] === 0 && morrisCount(s, p) === 3;

// Pieces the player to move may take after making a mill: anything not in a mill, unless every piece is.
export function morrisRemovable(s) {
  const opp = 1 - s.turn, all = [];
  for (let i = 0; i < 24; i++) if (s.b[i] === opp) all.push(i);
  const free = all.filter((i) => !inMill(s, i));
  return free.length ? free : all;
}
// Every legal move for the player to move, as {k:'place'|'move'|'remove', ...}.
export function morrisMoves(s) {
  if (s.over) return [];
  const p = s.turn, out = [];
  if (s.remove) return morrisRemovable(s).map((at) => ({ k: 'remove', at }));
  if (s.hand[p] > 0) { for (let i = 0; i < 24; i++) if (s.b[i] < 0) out.push({ k: 'place', to: i }); return out; }
  const fly = morrisFlying(s, p);
  for (let i = 0; i < 24; i++) {
    if (s.b[i] !== p) continue;
    const targets = fly ? [...Array(24).keys()] : MORRIS_ADJ[i];
    for (const t of targets) if (s.b[t] < 0) out.push({ k: 'move', from: i, to: t });
  }
  return out;
}
const sameMove = (a, b) => a.k === b.k && a.to === b.to && a.from === b.from && a.at === b.at;
export const morrisLegal = (s, m) => morrisMoves(s).some((x) => sameMove(x, m));

// Applies a move. Returns {mill} when a mill was made (the same player then removes a piece).
export function morrisPlay(s, m) {
  if (!morrisLegal(s, m)) return null;
  const p = s.turn;
  s.last = m;
  if (m.k === 'remove') {
    s.b[m.at] = -1; s.remove = false; s.quiet = 0;
    s.turn = 1 - p; morrisCheckEnd(s);
    return { removed: m.at };
  }
  if (m.k === 'place') { s.b[m.to] = p; s.hand[p]--; } else { s.b[m.from] = -1; s.b[m.to] = p; }
  // a mill takes a piece, unless the opponent has nothing on the board yet
  if (makesMill(s, m.to) && morrisCount(s, 1 - p) > 0) { s.remove = true; return { mill: true }; }
  const moving = s.hand[0] === 0 && s.hand[1] === 0;
  if (moving) s.quiet++;
  s.turn = 1 - p;
  morrisCheckEnd(s);
  return { mill: false };
}
function morrisCheckEnd(s) {
  const p = s.turn, opp = 1 - p;
  if (s.hand[p] === 0 && morrisCount(s, p) < 3) { s.over = true; s.winner = opp; s.reason = 'down to two pieces'; return; }
  if (!morrisMoves(s).length) { s.over = true; s.winner = opp; s.reason = 'no moves left'; return; }
  if (s.quiet >= MORRIS_DRAW_PLIES) { s.over = true; s.winner = null; s.reason = `${MORRIS_DRAW_PLIES} moves without a mill`; }
}

// ---------- Five in a Row ----------
export const GOMOKU_N = 15;
export function gomokuNew(first = 0, n = GOMOKU_N) { return { n, b: new Array(n * n).fill(-1), turn: first, over: false, winner: null, line: null, last: -1, moves: 0 }; }
// The run of stones through cell i (five or more wins). Returns the cells of the longest run of 5+, or null.
export function fiveAt(s, i) {
  const n = s.n, p = s.b[i], x0 = i % n, y0 = Math.floor(i / n);
  if (p < 0) return null;
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const cells = [i];
    for (const sgn of [1, -1]) {
      let x = x0 + dx * sgn, y = y0 + dy * sgn;
      while (x >= 0 && y >= 0 && x < n && y < n && s.b[y * n + x] === p) { cells.push(y * n + x); x += dx * sgn; y += dy * sgn; }
    }
    if (cells.length >= 5) return cells.sort((a, b) => a - b);
  }
  return null;
}
export const gomokuLegal = (s, i) => !s.over && i >= 0 && i < s.b.length && s.b[i] < 0;
export function gomokuPlay(s, i) {
  if (!gomokuLegal(s, i)) return null;
  s.b[i] = s.turn; s.last = i; s.moves++;
  const line = fiveAt(s, i);
  if (line) { s.over = true; s.winner = s.turn; s.line = line; }
  else if (s.moves >= s.b.length) { s.over = true; s.winner = null; }
  else s.turn = 1 - s.turn;
  return { line };
}

// ---------- Word Duel ----------
// Six rounds: players take turns setting a secret word for the other to guess, three each.
// The guesser has BALLOONS misses. A solved word scores the balloons left plus one; a failed word scores 0.
export const WORD = { ROUNDS: 6, BALLOONS: 7, MIN: 4, MAX: 8 };
export function wordNew(first = 0) { return { round: 0, setter: first, word: null, guessed: [], misses: 0, score: [0, 0], history: [], over: false, winner: null }; }
export const wordGuesser = (s) => 1 - s.setter;
export const wordClean = (w) => String(w || '').toLowerCase().replace(/[^a-z]/g, '');
export const wordOkShape = (w) => /^[a-z]+$/.test(w) && w.length >= WORD.MIN && w.length <= WORD.MAX;
export function wordSet(s, w) { if (s.over || s.word) return false; w = wordClean(w); if (!wordOkShape(w)) return false; s.word = w; s.guessed = []; s.misses = 0; return true; }
export const wordSolved = (s) => !!s.word && [...s.word].every((c) => s.guessed.includes(c));
export const wordFailed = (s) => s.misses >= WORD.BALLOONS;
export const wordPattern = (s) => [...(s.word || '')].map((c) => (s.guessed.includes(c) ? c : '_')).join('');
// Applies a letter guess. Returns {hit, roundOver, points} or null for a repeated or invalid letter.
export function wordGuess(s, l) {
  l = String(l || '').toLowerCase();
  if (s.over || !s.word || !/^[a-z]$/.test(l) || s.guessed.includes(l)) return null;
  s.guessed.push(l);
  const hit = s.word.includes(l);
  if (!hit) s.misses++;
  const solved = wordSolved(s), failed = !solved && wordFailed(s);
  if (!solved && !failed) return { hit, roundOver: false };
  const points = solved ? WORD.BALLOONS - s.misses + 1 : 0, g = wordGuesser(s);
  s.score[g] += points;
  s.history.push({ setter: s.setter, word: s.word, solved, points });
  return { hit, roundOver: true, solved, points };
}
// Moves on to the next round (call after the reveal), swapping setter and guesser.
export function wordNext(s) {
  s.round++; s.word = null; s.guessed = []; s.misses = 0; s.setter = 1 - s.setter;
  if (s.round >= WORD.ROUNDS) { s.over = true; s.winner = s.score[0] > s.score[1] ? 0 : s.score[1] > s.score[0] ? 1 : null; }
}

// ---------- Memory Duel ----------
// A seeded deal of face-down pairs. Players take turns flipping two cards; a match scores and goes again.
export function shuffle(arr, rng) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
export function memoryNew(first, pairs, rng, kinds) {
  const pick = shuffle([...Array(kinds).keys()], rng).slice(0, pairs);
  return { cards: shuffle([...pick, ...pick], rng), gone: [], up: [], miss: null, turn: first, score: [0, 0], over: false, winner: null, flips: 0 };
}
export const memoryLegal = (s, i) => !s.over && i >= 0 && i < s.cards.length && !s.gone.includes(i) && !s.up.includes(i);
// Flips card i. When a second card is turned the pair resolves straight away: a match leaves the board
// and the same player goes again; a miss is remembered in s.miss (so both phones can show it briefly)
// and the turn passes.
export function memoryFlip(s, i) {
  if (!memoryLegal(s, i)) return null;
  s.miss = null; s.flips++;
  s.up.push(i);
  if (s.up.length < 2) return { first: true };
  const [a, b] = s.up; s.up = [];
  if (s.cards[a] === s.cards[b]) {
    s.gone.push(a, b); s.score[s.turn]++;
    if (s.gone.length === s.cards.length) { s.over = true; s.winner = s.score[0] > s.score[1] ? 0 : s.score[1] > s.score[0] ? 1 : null; }
    return { match: true, pair: [a, b] };
  }
  s.miss = [a, b]; s.turn = 1 - s.turn;
  return { match: false, pair: [a, b] };
}
