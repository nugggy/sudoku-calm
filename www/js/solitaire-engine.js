// Klondike solitaire engine: dealing, rules, scoring, hints and a solver (to pick winnable deals).
// Cards are numbers 0..51: suit = floor(c / 13) (0 spades, 1 hearts, 2 diamonds, 3 clubs), rank = c % 13 + 1.
// Pure functions, shared by the game and the deal builder.

import { mulberry32 } from './sudoku-engine.js';

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const suitOf = (c) => Math.floor(c / 13);
export const rankOf = (c) => (c % 13) + 1;
export const isRed = (c) => suitOf(c) === 1 || suitOf(c) === 2;

export const SCORE = { wasteToTableau: 5, toFoundation: 10, flip: 5, fromFoundation: -15, recycle: -20 };

// state: {tab:[{down:[...], up:[...]}x7], stock:[...] (top = end), waste:[...] (top = end), found:[[...]x4], draw}
export function deal(seed, draw = 1) {
  const rng = mulberry32(seed);
  const deck = [...Array(52).keys()];
  for (let i = 51; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const tab = [];
  let p = 0;
  for (let i = 0; i < 7; i++) {
    const down = deck.slice(p, p + i); p += i;
    tab.push({ down, up: [deck[p++]] });
  }
  return { tab, stock: deck.slice(p).reverse(), waste: [], found: [[], [], [], []], draw };
}

export const clone = (s) => ({ tab: s.tab.map((t) => ({ down: t.down.slice(), up: t.up.slice() })), stock: s.stock.slice(), waste: s.waste.slice(), found: s.found.map((f) => f.slice()), draw: s.draw });
export const isWon = (s) => s.found.every((f) => f.length === 13);

export function canFound(s, c) {
  const f = s.found[suitOf(c)];
  return rankOf(c) === f.length + 1;
}
export function canStack(onto, c) {
  if (onto === undefined) return rankOf(c) === 13; // empty column takes a King
  return rankOf(onto) === rankOf(c) + 1 && isRed(onto) !== isRed(c);
}

// Move sources: {from:'waste'} | {from:'tab', col, idx} (idx into up) | {from:'found', suit}
// Targets: {to:'found'} | {to:'tab', col}
export function cardsAt(s, src) {
  if (src.from === 'waste') return s.waste.length ? [s.waste[s.waste.length - 1]] : [];
  if (src.from === 'found') { const f = s.found[src.suit]; return f.length ? [f[f.length - 1]] : []; }
  return s.tab[src.col].up.slice(src.idx);
}

export function legal(s, src, dst) {
  const cards = cardsAt(s, src);
  if (!cards.length) return false;
  if (dst.to === 'found') return cards.length === 1 && canFound(s, cards[0]) && src.from !== 'found';
  if (src.from === 'tab' && src.col === dst.col) return false;
  const pile = s.tab[dst.col];
  const top = pile.up.length ? pile.up[pile.up.length - 1] : pile.down.length ? null : undefined;
  if (top === null) return false; // face-down card on top (cannot happen in practice)
  return canStack(top, cards[0]);
}

// Applies a move. Returns {score, flipped} or null if illegal.
export function apply(s, src, dst) {
  if (!legal(s, src, dst)) return null;
  const cards = cardsAt(s, src);
  let score = 0, flipped = false;
  if (src.from === 'waste') s.waste.pop();
  else if (src.from === 'found') s.found[src.suit].pop();
  else {
    const t = s.tab[src.col];
    t.up.splice(src.idx);
    if (!t.up.length && t.down.length) { t.up.push(t.down.pop()); flipped = true; score += SCORE.flip; }
  }
  if (dst.to === 'found') { s.found[suitOf(cards[0])].push(cards[0]); score += SCORE.toFoundation; }
  else {
    s.tab[dst.col].up.push(...cards);
    if (src.from === 'waste') score += SCORE.wasteToTableau;
    if (src.from === 'found') score += SCORE.fromFoundation;
  }
  return { score, flipped };
}

// Turns over the next card(s) from the stock, or recycles the waste when the stock is empty.
export function drawStock(s) {
  if (s.stock.length) {
    const n = Math.min(s.draw, s.stock.length);
    for (let i = 0; i < n; i++) s.waste.push(s.stock.pop());
    return { score: 0, recycled: false };
  }
  if (!s.waste.length) return null;
  s.stock = s.waste.reverse();
  s.waste = [];
  return { score: SCORE.recycle, recycled: true };
}

// All useful moves, best first (used for hints, tap-to-move and the solver).
export function moves(s) {
  const out = [];
  const pushIf = (src, dst, w) => { if (legal(s, src, dst)) out.push({ src, dst, w }); };
  // to foundations
  if (s.waste.length) pushIf({ from: 'waste' }, { to: 'found' }, 100);
  s.tab.forEach((t, col) => { if (t.up.length) pushIf({ from: 'tab', col, idx: t.up.length - 1 }, { to: 'found' }, t.up.length === 1 && t.down.length ? 110 : 90); });
  // tableau to tableau: moving a whole face-up run that uncovers a card is best
  s.tab.forEach((t, col) => {
    for (let idx = 0; idx < t.up.length; idx++) {
      const card = t.up[idx];
      const revealing = idx === 0 && t.down.length > 0;
      const kingShuffle = idx === 0 && !t.down.length && rankOf(card) === 13; // a king already at the bottom
      s.tab.forEach((d, dc) => {
        if (dc === col) return;
        if (!d.up.length && !d.down.length && (kingShuffle || idx === 0 && !t.down.length)) return;
        const w = revealing ? 80 : idx === 0 ? 20 : 30;
        pushIf({ from: 'tab', col, idx }, { to: 'tab', col: dc }, w);
      });
    }
  });
  // waste to tableau
  if (s.waste.length) s.tab.forEach((_, dc) => pushIf({ from: 'waste' }, { to: 'tab', col: dc }, 50));
  return out.sort((a, b) => b.w - a.w);
}

// Finds the best destination for a tapped card (foundation first, then a column).
export function bestTarget(s, src) {
  const cards = cardsAt(s, src);
  if (!cards.length) return null;
  if (cards.length === 1 && src.from !== 'found' && canFound(s, cards[0])) return { to: 'found' };
  const cols = [...Array(7).keys()].filter((c) => !(src.from === 'tab' && c === src.col) && legal(s, src, { to: 'tab', col: c }));
  if (!cols.length) return null;
  // prefer a column with cards over an empty one, unless the card is a King
  cols.sort((a, b) => (s.tab[b].up.length > 0) - (s.tab[a].up.length > 0));
  return { to: 'tab', col: cols[0] };
}

// Cards can go to the foundations safely when no column could still need them.
export function autoSafe(s, c) {
  if (!canFound(s, c)) return false;
  const r = rankOf(c);
  if (r <= 2) return true;
  const red = isRed(c);
  const opp = red ? [0, 3] : [1, 2];
  return opp.every((suit) => s.found[suit].length >= r - 1);
}

export const allFaceUp = (s) => s.tab.every((t) => !t.down.length);

// ---------- Solver (depth-first with memory), used offline to choose winnable deals ----------
function key(s) {
  const tabs = s.tab.map((t) => t.down.length + ':' + t.up.join(',')).sort().join('|');
  return tabs + '#' + s.found.map((f) => f.length).join(',') + '#' + s.stock.join(',') + '/' + s.waste.join(',');
}

export function solve(start, limit = 200000) {
  const seen = new Set();
  let nodes = 0;
  function dfs(s) {
    if (isWon(s)) return true;
    if (++nodes > limit) return false;
    const k = key(s);
    if (seen.has(k)) return false;
    seen.add(k);
    // safe foundation moves are always made first (no branching)
    for (const m of moves(s)) {
      if (m.dst.to === 'found') {
        const c = cardsAt(s, m.src)[0];
        if (autoSafe(s, c)) { const t = clone(s); apply(t, m.src, m.dst); return dfs(t); }
      }
    }
    for (const m of moves(s)) {
      const t = clone(s);
      apply(t, m.src, m.dst);
      if (dfs(t)) return true;
      if (nodes > limit) return false;
    }
    const t = clone(s);
    if (drawStock(t) && dfs(t)) return true;
    return false;
  }
  const won = dfs(clone(start));
  return { won, nodes };
}
