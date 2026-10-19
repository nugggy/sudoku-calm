// Chess engine: board, legal moves, rules of the game, notation and a computer player.
// Shared by the game screen, the worker and tools/test-chess.mjs, so it has no browser dependencies.
// The board is 0x88: square = rank * 16 + file, rank 0 is White's back rank.

export const WHITE = 0, BLACK = 1;
export const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
const BL = 8; // colour bit for black pieces
export const colourOf = (p) => (p & BL ? BLACK : WHITE);
export const typeOf = (p) => p & 7;
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const N_OFF = [33, 31, 18, 14, -33, -31, -18, -14];
const B_OFF = [17, 15, -17, -15];
const R_OFF = [16, 1, -16, -1];
const K_OFF = [17, 15, -17, -15, 16, 1, -16, -1];

export const sqOf = (file, rank) => rank * 16 + file;
export const fileOf = (s) => s & 7;
export const rankOf = (s) => s >> 4;
export const sqName = (s) => 'abcdefgh'[s & 7] + ((s >> 4) + 1);
export const parseSq = (n) => sqOf(n.charCodeAt(0) - 97, +n[1] - 1);

// A move is one integer: from | to << 7 | promotion type << 14 | flags << 17.
export const CAP = 1, EP = 2, CASTLE = 4, DOUBLE = 8;
export const mFrom = (m) => m & 127;
export const mTo = (m) => (m >> 7) & 127;
export const mPromo = (m) => (m >> 14) & 7;
export const mFlag = (m) => m >> 17;
const enc = (f, t, pr, fl) => f | (t << 7) | (pr << 14) | (fl << 17);

// ---------- Hashing (two 32-bit Zobrist keys, so collisions are vanishingly rare) ----------
let seed = 0x2545f491;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
const ZP_LO = new Int32Array(16 * 128), ZP_HI = new Int32Array(16 * 128);
for (let i = 0; i < 16 * 128; i++) { ZP_LO[i] = rnd(); ZP_HI[i] = rnd(); }
const ZC_LO = [...Array(16)].map(rnd), ZC_HI = [...Array(16)].map(rnd);
const ZE_LO = [...Array(8)].map(rnd), ZE_HI = [...Array(8)].map(rnd);
const ZS_LO = rnd(), ZS_HI = rnd();

// Castling rights kept after a piece moves from or to a square (1 = White short, 2 = White long, 4 = Black short, 8 = Black long).
const CR = new Int8Array(128).fill(15);
CR[0] = 13; CR[7] = 14; CR[4] = 12; CR[112] = 7; CR[119] = 11; CR[116] = 3;

export function fromFEN(fen = START_FEN) {
  const [board, turn, castle, ep, half, full] = fen.trim().split(/\s+/);
  const p = { b: new Int8Array(128), turn: turn === 'b' ? BLACK : WHITE, castle: 0, ep: -1, half: +half || 0, full: +full || 1, kings: [-1, -1], lo: 0, hi: 0, epKey: false, stack: [] };
  let r = 7, f = 0;
  for (const ch of board) {
    if (ch === '/') { r--; f = 0; continue; }
    if (/\d/.test(ch)) { f += +ch; continue; }
    const t = ' pnbrqk'.indexOf(ch.toLowerCase());
    const pc = t | (ch === ch.toLowerCase() ? BL : 0);
    p.b[sqOf(f, r)] = pc;
    if (t === K) p.kings[colourOf(pc)] = sqOf(f, r);
    f++;
  }
  for (const ch of castle || '-') p.castle |= { K: 1, Q: 2, k: 4, q: 8 }[ch] || 0;
  if (ep && ep !== '-') p.ep = parseSq(ep);
  rehash(p);
  return p;
}

export function toFEN(p) {
  let out = '';
  for (let r = 7; r >= 0; r--) {
    let gap = 0;
    for (let f = 0; f < 8; f++) {
      const pc = p.b[sqOf(f, r)];
      if (!pc) { gap++; continue; }
      if (gap) { out += gap; gap = 0; }
      const ch = ' pnbrqk'[typeOf(pc)];
      out += colourOf(pc) === WHITE ? ch.toUpperCase() : ch;
    }
    if (gap) out += gap;
    if (r) out += '/';
  }
  const cs = (p.castle & 1 ? 'K' : '') + (p.castle & 2 ? 'Q' : '') + (p.castle & 4 ? 'k' : '') + (p.castle & 8 ? 'q' : '');
  return `${out} ${p.turn ? 'b' : 'w'} ${cs || '-'} ${p.ep >= 0 ? sqName(p.ep) : '-'} ${p.half} ${p.full}`;
}

// The en passant square only counts towards the position when a pawn could actually take there.
function epMatters(p) {
  if (p.ep < 0) return false;
  const pawn = P | (p.turn ? BL : 0), d = p.turn ? 16 : -16;
  for (const x of [p.ep + d - 1, p.ep + d + 1]) if (!(x & 0x88) && p.b[x] === pawn) return true;
  return false;
}
function rehash(p) {
  let lo = 0, hi = 0;
  for (let s = 0; s < 128; s++) if (!(s & 0x88) && p.b[s]) { lo ^= ZP_LO[p.b[s] * 128 + s]; hi ^= ZP_HI[p.b[s] * 128 + s]; }
  lo ^= ZC_LO[p.castle]; hi ^= ZC_HI[p.castle];
  p.epKey = epMatters(p);
  if (p.epKey) { lo ^= ZE_LO[p.ep & 7]; hi ^= ZE_HI[p.ep & 7]; }
  if (p.turn) { lo ^= ZS_LO; hi ^= ZS_HI; }
  p.lo = lo; p.hi = hi;
}

export function attacked(p, s, by) {
  const b = p.b, bc = by ? BL : 0;
  if (by === WHITE) { if ((!((s - 15) & 0x88) && b[s - 15] === P) || (!((s - 17) & 0x88) && b[s - 17] === P)) return true; }
  else if ((!((s + 15) & 0x88) && b[s + 15] === (P | BL)) || (!((s + 17) & 0x88) && b[s + 17] === (P | BL))) return true;
  for (const o of N_OFF) { const x = s + o; if (!(x & 0x88) && b[x] === (N | bc)) return true; }
  for (const o of K_OFF) { const x = s + o; if (!(x & 0x88) && b[x] === (K | bc)) return true; }
  for (const o of B_OFF) {
    for (let x = s + o; !(x & 0x88); x += o) { const pc = b[x]; if (pc) { if (pc === (B | bc) || pc === (Q | bc)) return true; break; } }
  }
  for (const o of R_OFF) {
    for (let x = s + o; !(x & 0x88); x += o) { const pc = b[x]; if (pc) { if (pc === (R | bc) || pc === (Q | bc)) return true; break; } }
  }
  return false;
}
export const inCheck = (p) => attacked(p, p.kings[p.turn], p.turn ^ 1);

function addPromos(out, f, t, fl, capsOnly) {
  if (capsOnly) { out.push(enc(f, t, Q, fl)); return; }
  for (const pr of [Q, N, R, B]) out.push(enc(f, t, pr, fl));
}

// Pseudo-legal moves (the mover's king may be left in check). capsOnly: captures and queen promotions, for quiescence.
export function genMoves(p, capsOnly = false, out = []) {
  const b = p.b, us = p.turn, them = us ^ 1;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const pc = b[s];
    if (!pc || colourOf(pc) !== us) continue;
    const t = typeOf(pc);
    if (t === P) {
      const dir = us ? -16 : 16, last = us ? 0 : 7, one = s + dir;
      if (!(one & 0x88) && !b[one]) {
        if (rankOf(one) === last) addPromos(out, s, one, 0, capsOnly);
        else if (!capsOnly) {
          out.push(enc(s, one, 0, 0));
          if (rankOf(s) === (us ? 6 : 1) && !b[one + dir]) out.push(enc(s, one + dir, 0, DOUBLE));
        }
      }
      for (const x of [one - 1, one + 1]) {
        if (x & 0x88) continue;
        const tp = b[x];
        if (tp && colourOf(tp) === them) { if (rankOf(x) === last) addPromos(out, s, x, CAP, capsOnly); else out.push(enc(s, x, 0, CAP)); }
        else if (x === p.ep && !tp) out.push(enc(s, x, 0, EP | CAP));
      }
    } else if (t === N || t === K) {
      for (const o of t === N ? N_OFF : K_OFF) {
        const x = s + o;
        if (x & 0x88) continue;
        const tp = b[x];
        if (!tp) { if (!capsOnly) out.push(enc(s, x, 0, 0)); }
        else if (colourOf(tp) === them) out.push(enc(s, x, 0, CAP));
      }
      if (t === K && !capsOnly) {
        const base = us ? 112 : 0, sh = us ? 4 : 1, lg = us ? 8 : 2;
        if (s === base + 4 && p.castle & (sh | lg) && !attacked(p, s, them)) {
          if (p.castle & sh && !b[base + 5] && !b[base + 6] && b[base + 7] === (R | (us ? BL : 0)) && !attacked(p, base + 5, them) && !attacked(p, base + 6, them)) out.push(enc(s, base + 6, 0, CASTLE));
          if (p.castle & lg && !b[base + 3] && !b[base + 2] && !b[base + 1] && b[base] === (R | (us ? BL : 0)) && !attacked(p, base + 3, them) && !attacked(p, base + 2, them)) out.push(enc(s, base + 2, 0, CASTLE));
        }
      }
    } else {
      const offs = t === B ? B_OFF : t === R ? R_OFF : K_OFF;
      for (const o of offs) {
        for (let x = s + o; !(x & 0x88); x += o) {
          const tp = b[x];
          if (!tp) { if (!capsOnly) out.push(enc(s, x, 0, 0)); continue; }
          if (colourOf(tp) === them) out.push(enc(s, x, 0, CAP));
          break;
        }
      }
    }
  }
  return out;
}

const zx = (p, pc, s) => { p.lo ^= ZP_LO[pc * 128 + s]; p.hi ^= ZP_HI[pc * 128 + s]; };

export function makeMove(p, m) {
  const f = mFrom(m), t = mTo(m), fl = mFlag(m), pr = mPromo(m), b = p.b, us = p.turn;
  const pc = b[f];
  let capSq = t;
  if (fl & EP) capSq = t + (us === WHITE ? -16 : 16);
  const cap = b[capSq];
  p.stack.push({ m, cap, castle: p.castle, ep: p.ep, half: p.half, lo: p.lo, hi: p.hi, epKey: p.epKey });
  if (cap) { zx(p, cap, capSq); b[capSq] = 0; }
  zx(p, pc, f); b[f] = 0;
  const placed = pr ? pr | (us ? BL : 0) : pc;
  b[t] = placed; zx(p, placed, t);
  if (fl & CASTLE) {
    const [rf, rt] = fileOf(t) === 6 ? [t + 1, t - 1] : [t - 2, t + 1];
    const rook = b[rf];
    zx(p, rook, rf); b[rf] = 0; b[rt] = rook; zx(p, rook, rt);
  }
  if (typeOf(pc) === K) p.kings[us] = t;
  p.lo ^= ZC_LO[p.castle]; p.hi ^= ZC_HI[p.castle];
  p.castle &= CR[f] & CR[t];
  p.lo ^= ZC_LO[p.castle]; p.hi ^= ZC_HI[p.castle];
  if (p.epKey) { p.lo ^= ZE_LO[p.ep & 7]; p.hi ^= ZE_HI[p.ep & 7]; }
  p.ep = fl & DOUBLE ? (f + t) >> 1 : -1;
  p.half = cap || typeOf(pc) === P ? 0 : p.half + 1;
  if (us === BLACK) p.full++;
  p.turn ^= 1; p.lo ^= ZS_LO; p.hi ^= ZS_HI;
  p.epKey = epMatters(p);
  if (p.epKey) { p.lo ^= ZE_LO[p.ep & 7]; p.hi ^= ZE_HI[p.ep & 7]; }
}

export function undoMove(p) {
  const u = p.stack.pop(), m = u.m, f = mFrom(m), t = mTo(m), fl = mFlag(m), b = p.b;
  p.turn ^= 1;
  const us = p.turn, pc = mPromo(m) ? P | (us ? BL : 0) : b[t];
  b[f] = pc; b[t] = 0;
  if (fl & EP) b[t + (us === WHITE ? -16 : 16)] = u.cap; else b[t] = u.cap;
  if (fl & CASTLE) {
    const [rf, rt] = fileOf(t) === 6 ? [t + 1, t - 1] : [t - 2, t + 1];
    b[rf] = b[rt]; b[rt] = 0;
  }
  if (typeOf(pc) === K) p.kings[us] = f;
  if (us === BLACK) p.full--;
  p.castle = u.castle; p.ep = u.ep; p.half = u.half; p.lo = u.lo; p.hi = u.hi; p.epKey = u.epKey;
}

// Plays a null move (only used by the search).
function makeNull(p) {
  p.stack.push({ m: 0, cap: 0, castle: p.castle, ep: p.ep, half: p.half, lo: p.lo, hi: p.hi, epKey: p.epKey });
  if (p.epKey) { p.lo ^= ZE_LO[p.ep & 7]; p.hi ^= ZE_HI[p.ep & 7]; }
  p.ep = -1; p.epKey = false; p.half++;
  p.turn ^= 1; p.lo ^= ZS_LO; p.hi ^= ZS_HI;
}
function undoNull(p) {
  const u = p.stack.pop();
  p.turn ^= 1; p.castle = u.castle; p.ep = u.ep; p.half = u.half; p.lo = u.lo; p.hi = u.hi; p.epKey = u.epKey;
}

export function legalMoves(p) {
  const out = [], us = p.turn;
  for (const m of genMoves(p)) {
    makeMove(p, m);
    if (!attacked(p, p.kings[us], us ^ 1)) out.push(m);
    undoMove(p);
  }
  return out;
}

export function perft(p, depth) {
  if (!depth) return 1;
  let n = 0;
  const us = p.turn;
  for (const m of genMoves(p)) {
    makeMove(p, m);
    if (!attacked(p, p.kings[us], us ^ 1)) n += depth === 1 ? 1 : perft(p, depth - 1);
    undoMove(p);
  }
  return n;
}

// ---------- Rules for the end of the game ----------
export function insufficient(p) {
  const minors = [];
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const t = typeOf(p.b[s]);
    if (!t || t === K) continue;
    if (t === P || t === R || t === Q) return false;
    minors.push([t, (fileOf(s) + rankOf(s)) & 1]);
  }
  if (minors.length <= 1) return true;
  return minors.every(([t, c]) => t === B && c === minors[0][1]);
}

// How many times the current position has occurred (same side to move, castling and en passant rights).
export function repetitions(p) {
  let n = 1;
  const st = p.stack;
  for (let k = 2; k <= p.half && k <= st.length; k += 2) { const e = st[st.length - k]; if (e.lo === p.lo && e.hi === p.hi) n++; }
  return n;
}

// {over, result: 'white' | 'black' | 'draw', reason}
export function status(p) {
  const moves = legalMoves(p);
  if (!moves.length) return inCheck(p) ? { over: true, result: p.turn ? 'white' : 'black', reason: 'checkmate' } : { over: true, result: 'draw', reason: 'stalemate' };
  if (insufficient(p)) return { over: true, result: 'draw', reason: 'material' };
  if (p.half >= 100) return { over: true, result: 'draw', reason: 'fifty' };
  if (repetitions(p) >= 3) return { over: true, result: 'draw', reason: 'repetition' };
  return { over: false, moves };
}

// ---------- Notation ----------
const LETTER = ' PNBRQK';
export function san(p, m, legal = legalMoves(p)) {
  const f = mFrom(m), t = mTo(m), fl = mFlag(m), pr = mPromo(m), pc = p.b[f], tp = typeOf(pc);
  let s;
  if (fl & CASTLE) s = fileOf(t) === 6 ? 'O-O' : 'O-O-O';
  else {
    if (tp === P) s = fl & CAP ? 'abcdefgh'[fileOf(f)] : '';
    else {
      s = LETTER[tp];
      const others = legal.filter((o) => o !== m && mTo(o) === t && p.b[mFrom(o)] === pc);
      if (others.length) {
        if (!others.some((o) => fileOf(mFrom(o)) === fileOf(f))) s += 'abcdefgh'[fileOf(f)];
        else if (!others.some((o) => rankOf(mFrom(o)) === rankOf(f))) s += rankOf(f) + 1;
        else s += sqName(f);
      }
    }
    if (fl & CAP) s += 'x';
    s += sqName(t);
    if (pr) s += '=' + LETTER[pr];
  }
  makeMove(p, m);
  if (inCheck(p)) s += legalMoves(p).length ? '+' : '#';
  undoMove(p);
  return s;
}
export const toUci = (m) => sqName(mFrom(m)) + sqName(mTo(m)) + (mPromo(m) ? ' pnbrqk'[mPromo(m)] : '');
export function fromUci(p, u) {
  return legalMoves(p).find((m) => toUci(m) === u) ?? null;
}
// Rebuilds a game from its starting position and a list of moves in UCI form.
export function replay(fen, uciMoves) {
  const p = fromFEN(fen);
  for (const u of uciMoves) { const m = fromUci(p, u); if (m === null) break; makeMove(p, m); }
  return p;
}

// ---------- Evaluation ----------
// Piece-square tables from Tomasz Michniewski's simplified evaluation function, written from White's side with a8 first.
export const VALUE = [0, 100, 320, 330, 500, 900, 0];
const PST = [null,
  [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
];
const KING_END = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];
const PHASE = [0, 0, 1, 1, 2, 4, 0];
const centreDist = (s) => Math.max(3 - fileOf(s), fileOf(s) - 4) + Math.max(3 - rankOf(s), rankOf(s) - 4);
const kingDist = (a, c) => Math.max(Math.abs(fileOf(a) - fileOf(c)), Math.abs(rankOf(a) - rankOf(c)));

// Score in centipawns from the side to move's point of view.
export function evaluate(p) {
  const b = p.b;
  let mg = 0, phase = 0, kMid = 0, kEnd = 0;
  const mat = [0, 0], bishops = [0, 0];
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const pc = b[s];
    if (!pc) continue;
    const t = typeOf(pc), c = colourOf(pc), sign = c === WHITE ? 1 : -1;
    const idx = c === WHITE ? (7 - rankOf(s)) * 8 + fileOf(s) : rankOf(s) * 8 + fileOf(s);
    phase += PHASE[t];
    if (t === K) { kMid += sign * PST[K][idx]; kEnd += sign * KING_END[idx]; continue; }
    mat[c] += VALUE[t];
    if (t === B) bishops[c]++;
    mg += sign * (VALUE[t] + PST[t][idx]);
  }
  const w = Math.min(phase, 24) / 24;
  let score = mg + Math.round(kMid * w + kEnd * (1 - w));
  if (bishops[0] >= 2) score += 30;
  if (bishops[1] >= 2) score -= 30;
  // in a won ending, drive the losing king to the edge and bring our king closer
  const diff = mat[0] - mat[1];
  if (w < 0.5 && Math.abs(diff) >= 300) {
    const winner = diff > 0 ? WHITE : BLACK, loser = winner ^ 1;
    const bonus = centreDist(p.kings[loser]) * 10 + (14 - kingDist(p.kings[0], p.kings[1])) * 4;
    score += winner === WHITE ? bonus : -bonus;
  }
  return p.turn === WHITE ? score : -score;
}

// ---------- Search ----------
export const MATE = 30000;
const INF = 32000;
const TT_BITS = 18, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
let TT = null;
function tt() {
  if (!TT) TT = { lo: new Int32Array(TT_SIZE), hi: new Int32Array(TT_SIZE), depth: new Int8Array(TT_SIZE), flag: new Int8Array(TT_SIZE), score: new Int16Array(TT_SIZE), move: new Int32Array(TT_SIZE) };
  return TT;
}
export function clearHash() { TT = null; }

// Strength by level: search depth, thinking time, random error added to each move's score, and a chance of a random move.
export const LEVELS = [null,
  { depth: 1, time: 250, noise: 350, blunder: 0.3 },
  { depth: 1, time: 250, noise: 180, blunder: 0.12 },
  { depth: 2, time: 350, noise: 90, blunder: 0.04 },
  { depth: 3, time: 450, noise: 45, blunder: 0 },
  { depth: 4, time: 650, noise: 15, blunder: 0 },
  { depth: 5, time: 900, noise: 0, blunder: 0 },
  { depth: 7, time: 1300, noise: 0, blunder: 0 },
  { depth: 40, time: 1800, noise: 0, blunder: 0 },
];

// opts: {level 1-8, time (ms), depth, rng}. Returns {move, score, depth, nodes}; move is null when the game is over.
export function search(p, opts = {}) {
  const L = LEVELS[opts.level || 6];
  const maxDepth = opts.depth ?? L.depth, timeLimit = opts.time ?? L.time, rng = opts.rng || Math.random;
  const T = tt();
  const deadline = Date.now() + timeLimit;
  const killers = [...Array(128)].map(() => [0, 0]);
  const hist = new Int32Array(16 * 128);
  let nodes = 0, stop = false;

  const root = legalMoves(p);
  if (!root.length) return { move: null, score: inCheck(p) ? -MATE : 0, depth: 0, nodes: 0 };
  if (root.length === 1) return { move: root[0], score: 0, depth: 0, nodes: 0 };
  if (L.blunder && rng() < L.blunder) return { move: root[Math.floor(rng() * root.length)], score: 0, depth: 0, nodes: 0 };

  const isDraw = () => {
    if (p.half >= 100) return true;
    const st = p.stack;
    for (let k = 2; k <= p.half && k <= st.length; k += 2) { const e = st[st.length - k]; if (e.lo === p.lo && e.hi === p.hi) return true; }
    return false;
  };
  const tick = () => { if ((++nodes & 1023) === 0 && Date.now() > deadline) stop = true; return stop; };

  function order(moves, ttMove, ply) {
    const b = p.b, sc = new Array(moves.length);
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (m === ttMove) sc[i] = 1e7;
      else if (mFlag(m) & CAP) sc[i] = 1e6 + 10 * VALUE[typeOf(b[mTo(m)]) || P] - VALUE[typeOf(b[mFrom(m)])] / 10 + (mPromo(m) ? VALUE[mPromo(m)] : 0);
      else if (mPromo(m)) sc[i] = 9e5 + VALUE[mPromo(m)];
      else if (m === killers[ply][0]) sc[i] = 8e5;
      else if (m === killers[ply][1]) sc[i] = 7e5;
      else sc[i] = hist[b[mFrom(m)] * 128 + mTo(m)];
    }
    return sc;
  }
  function pick(moves, sc, i) {
    let best = i;
    for (let j = i + 1; j < moves.length; j++) if (sc[j] > sc[best]) best = j;
    if (best !== i) { [moves[i], moves[best]] = [moves[best], moves[i]]; [sc[i], sc[best]] = [sc[best], sc[i]]; }
    return moves[i];
  }

  function quiesce(alpha, beta, ply) {
    if (tick()) return 0;
    const stand = evaluate(p);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const moves = genMoves(p, true), sc = order(moves, 0, Math.min(ply, 127)), us = p.turn;
    for (let i = 0; i < moves.length; i++) {
      const m = pick(moves, sc, i);
      // delta pruning: even winning this piece cannot lift the score to alpha
      if (!mPromo(m) && stand + VALUE[typeOf(p.b[mTo(m)]) || P] + 200 < alpha) continue;
      makeMove(p, m);
      if (attacked(p, p.kings[us], us ^ 1)) { undoMove(p); continue; }
      const s = -quiesce(-beta, -alpha, ply + 1);
      undoMove(p);
      if (stop) return 0;
      if (s >= beta) return s;
      if (s > alpha) alpha = s;
    }
    return alpha;
  }

  function negamax(depth, alpha, beta, ply, allowNull) {
    if (tick()) return 0;
    if (ply && isDraw()) return 0;
    const chk = inCheck(p);
    if (chk) depth++;
    if (depth <= 0) return quiesce(alpha, beta, ply);
    const idx = p.lo & TT_MASK;
    let ttMove = 0;
    if (T.lo[idx] === p.lo && T.hi[idx] === p.hi) {
      ttMove = T.move[idx];
      if (ply && T.depth[idx] >= depth) {
        let s = T.score[idx];
        if (s > MATE - 500) s -= ply; else if (s < -MATE + 500) s += ply;
        const fl = T.flag[idx];
        if (fl === 0 || (fl === 1 && s >= beta) || (fl === 2 && s <= alpha)) return s;
      }
    }
    // null move pruning: if passing still beats beta, this line is good enough
    if (allowNull && !chk && depth >= 3 && ply && beta < MATE - 500) {
      let big = 0;
      for (let s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } const pc = p.b[s]; if (pc && colourOf(pc) === p.turn && typeOf(pc) > P && typeOf(pc) < K) { big = 1; break; } }
      if (big && evaluate(p) >= beta) {
        makeNull(p);
        const s = -negamax(depth - 3, -beta, -beta + 1, ply + 1, false);
        undoNull(p);
        if (stop) return 0;
        if (s >= beta) return beta;
      }
    }
    const moves = genMoves(p), kp = Math.min(ply, 127), sc = order(moves, ttMove, kp), us = p.turn, a0 = alpha;
    let best = -INF, bestMove = 0, legal = 0;
    for (let i = 0; i < moves.length; i++) {
      const m = pick(moves, sc, i);
      makeMove(p, m);
      if (attacked(p, p.kings[us], us ^ 1)) { undoMove(p); continue; }
      legal++;
      let s;
      if (legal === 1) s = -negamax(depth - 1, -beta, -alpha, ply + 1, true);
      else {
        // late quiet moves are searched one ply shallower first
        const quiet = !(mFlag(m) & CAP) && !mPromo(m) && !chk;
        const red = quiet && legal > 4 && depth >= 3 && !inCheck(p) ? 1 : 0;
        s = -negamax(depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
        if (s > alpha && !stop) s = -negamax(depth - 1, -beta, -alpha, ply + 1, true);
      }
      undoMove(p);
      if (stop) return 0;
      if (s > best) { best = s; bestMove = m; }
      if (s > alpha) alpha = s;
      if (alpha >= beta) {
        if (!(mFlag(m) & CAP)) {
          if (killers[kp][0] !== m) { killers[kp][1] = killers[kp][0]; killers[kp][0] = m; }
          hist[p.b[mFrom(m)] * 128 + mTo(m)] += depth * depth;
        }
        break;
      }
    }
    if (!legal) return chk ? -MATE + ply : 0;
    let st = best;
    if (st > MATE - 500) st += ply; else if (st < -MATE + 500) st -= ply;
    T.lo[idx] = p.lo; T.hi[idx] = p.hi; T.depth[idx] = depth; T.move[idx] = bestMove; T.score[idx] = st;
    T.flag[idx] = best >= beta ? 1 : best <= a0 ? 2 : 0;
    return best;
  }

  // Weaker levels score every root move with a full window, add noise, and take the best of those.
  if (L.noise) {
    let pickMove = root[0], pickScore = -INF, bestTrue = -INF, depthDone = 0;
    for (let d = 1; d <= maxDepth; d++) {
      const scores = [];
      for (const m of root) {
        makeMove(p, m);
        const s = -negamax(d - 1, -INF, INF, 1, true);
        undoMove(p);
        if (stop) break;
        scores.push([m, s]);
      }
      if (stop && d > 1) break;
      depthDone = d;
      pickScore = -INF;
      for (const [m, s] of scores) {
        // never miss a forced mate the engine has seen, otherwise wobble the score
        const noisy = Math.abs(s) > MATE - 500 ? s : s + (rng() * 2 - 1) * L.noise;
        if (noisy > pickScore) { pickScore = noisy; pickMove = m; bestTrue = s; }
      }
      if (stop) break;
    }
    return { move: pickMove, score: bestTrue, depth: depthDone, nodes };
  }

  let bestMove = root[0], bestScore = 0, depthDone = 0;
  for (let d = 1; d <= maxDepth; d++) {
    const sc = root.map((m) => (m === bestMove ? 1e7 : 0));
    let alpha = -INF, curBest = 0, curScore = -INF;
    for (let i = 0; i < root.length; i++) {
      const m = pick(root, sc, i);
      makeMove(p, m);
      let s;
      if (i === 0) s = -negamax(d - 1, -INF, -alpha, 1, true);
      else {
        s = -negamax(d - 1, -alpha - 1, -alpha, 1, true);
        if (s > alpha && !stop) s = -negamax(d - 1, -INF, -alpha, 1, true);
      }
      undoMove(p);
      if (stop) break;
      if (s > curScore) { curScore = s; curBest = m; }
      if (s > alpha) alpha = s;
    }
    if (stop) {
      // keep a partly searched iteration only if it already found something better than the last one
      if (curBest && curScore > bestScore && depthDone) { bestMove = curBest; bestScore = curScore; }
      break;
    }
    bestMove = curBest; bestScore = curScore; depthDone = d;
    if (Math.abs(bestScore) > MATE - 500) break; // a forced mate has been found
    if (Date.now() > deadline - timeLimit * 0.45) break; // the next iteration would not finish in time
  }
  return { move: bestMove, score: bestScore, depth: depthDone, nodes };
}
