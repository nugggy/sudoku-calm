// Casino Night rules: shoe, blackjack, poker hand evaluation, baccarat and video poker.
// No browser code here, so tools/test-casino.mjs can check every rule directly.
// A card is { r, s }: r 2..14 (11 J, 12 Q, 13 K, 14 A), s 'S' 'H' 'D' 'C'.

export const SUITS = ['S', 'H', 'D', 'C'];
export const RANK_NAME = { 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
export const rankName = (r) => RANK_NAME[r] || String(r);
export const cardCode = (c) => `${c.r === 14 ? 'A' : c.r === 13 ? 'K' : c.r === 12 ? 'Q' : c.r === 11 ? 'J' : c.r === 10 ? 'T' : c.r}${c.s}`;
export function parseCard(code) { // 'AS', 'TD', '9H'
  const m = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
  return { r: m[code[0]] || +code[0], s: code[1] };
}
export const cards = (str) => str.trim().split(/\s+/).map(parseCard);

export function newDeck() { const d = []; for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push({ r, s }); return d; }
// Fisher-Yates with a supplied random function (Math.random in play, a seeded one in tests).
export function shuffle(a, rnd = Math.random) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// A multi-deck shoe with a cut card: once the cut card comes out, the shoe is reshuffled before the next round.
export class Shoe {
  constructor(decks = 6, rnd = Math.random, penetration = 0.75) { this.decks = decks; this.rnd = rnd; this.pen = penetration; this.reshuffle(); }
  reshuffle() { this.cards = []; for (let i = 0; i < this.decks; i++) this.cards.push(...newDeck()); shuffle(this.cards, this.rnd); this.cut = Math.floor(this.cards.length * this.pen); this.dealt = 0; this.cutReached = false; }
  draw() { if (!this.cards.length) this.reshuffle(); const c = this.cards.pop(); this.dealt++; if (this.dealt >= this.cut) this.cutReached = true; return c; }
  get left() { return this.cards.length; }
  get total() { return this.decks * 52; }
}

// ---------- Blackjack ----------
export const bjCardValue = (c) => (c.r === 14 ? 11 : Math.min(10, c.r));
export function bjValue(hand) {
  let total = 0, aces = 0;
  for (const c of hand) { total += bjCardValue(c); if (c.r === 14) aces++; }
  while (total > 21 && aces) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}
export const isBlackjack = (hand) => hand.length === 2 && bjValue(hand).total === 21;
// The dealer stands on all 17s, soft 17 included.
export const dealerHits = (hand) => bjValue(hand).total < 17;
// Net result multiple of the hand's stake: 1.5 blackjack, 1 win, 0 push, -1 loss.
export function bjSettle(hand, dealer, { split = false, surrendered = false } = {}) {
  if (surrendered) return -0.5;
  const p = bjValue(hand).total, d = bjValue(dealer).total;
  const pbj = !split && isBlackjack(hand), dbj = isBlackjack(dealer);
  if (p > 21) return -1;
  if (pbj && dbj) return 0;
  if (pbj) return 1.5;
  if (dbj) return -1;
  if (d > 21) return 1;
  return p > d ? 1 : p < d ? -1 : 0;
}
// Insurance pays 2:1 when the dealer has blackjack.
export const insuranceNet = (stake, dealer) => (isBlackjack(dealer) ? stake * 2 : -stake);

// Basic strategy for 4 to 8 decks, dealer stands on soft 17, double after split, late surrender.
// Returns 'hit' | 'stand' | 'double' | 'split' | 'surrender'. Up card value: 2..11 (11 = ace).
export function bjStrategy(hand, up, { canDouble = true, canSplit = true, canSurrender = true } = {}) {
  const u = bjCardValue(up), { total, soft } = bjValue(hand);
  if (canSplit && hand.length === 2 && bjCardValue(hand[0]) === bjCardValue(hand[1])) {
    const v = hand[0].r === 14 ? 11 : bjCardValue(hand[0]);
    const split = v === 11 || v === 8 || (v === 9 && ![7, 10, 11].includes(u)) || ((v === 7 || v === 2 || v === 3) && u <= 7) || (v === 6 && u <= 6) || (v === 4 && (u === 5 || u === 6));
    if (split) return 'split';
  }
  if (canSurrender && hand.length === 2 && !soft) {
    if (total === 16 && [9, 10, 11].includes(u)) return 'surrender';
    if (total === 15 && u === 10) return 'surrender';
  }
  const dbl = (cond) => (cond ? (canDouble ? 'double' : 'hit') : null);
  if (soft) {
    if (total >= 20) return 'stand';
    if (total === 19) return u === 6 && canDouble ? 'double' : 'stand';
    if (total === 18) { if (u >= 2 && u <= 6) return canDouble ? 'double' : 'stand'; return u <= 8 ? 'stand' : 'hit'; }
    if (total === 17) return dbl(u >= 3 && u <= 6) || 'hit';
    if (total === 15 || total === 16) return dbl(u >= 4 && u <= 6) || 'hit';
    return dbl(u === 5 || u === 6) || 'hit';
  }
  if (total >= 17) return 'stand';
  if (total >= 13) return u <= 6 ? 'stand' : 'hit';
  if (total === 12) return u >= 4 && u <= 6 ? 'stand' : 'hit';
  if (total === 11) return dbl(true);
  if (total === 10) return dbl(u <= 9) || 'hit';
  if (total === 9) return dbl(u >= 3 && u <= 6) || 'hit';
  return 'hit';
}

// ---------- Poker hands ----------
export const HAND_NAMES = ['High card', 'One pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush', 'Royal flush'];
// Scores exactly five cards: a bigger number is a better hand. cat 0..8 (8 = straight flush).
export function eval5(h) {
  const rs = h.map((c) => c.r).sort((a, b) => b - a);
  const flush = h.every((c) => c.s === h[0].s);
  const uniq = [...new Set(rs)];
  let straightHigh = 0;
  if (uniq.length === 5) { if (rs[0] - rs[4] === 4) straightHigh = rs[0]; else if (rs[0] === 14 && rs[1] === 5) straightHigh = 5; }
  const cnt = {}; rs.forEach((r) => { cnt[r] = (cnt[r] || 0) + 1; });
  // ranks ordered by count then rank, for tie-breaks
  const groups = Object.entries(cnt).map(([r, n]) => [+r, n]).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const order = groups.map((g) => g[0]);
  let cat;
  if (straightHigh && flush) cat = 8;
  else if (groups[0][1] === 4) cat = 7;
  else if (groups[0][1] === 3 && groups[1][1] === 2) cat = 6;
  else if (flush) cat = 5;
  else if (straightHigh) cat = 4;
  else if (groups[0][1] === 3) cat = 3;
  else if (groups[0][1] === 2 && groups[1][1] === 2) cat = 2;
  else if (groups[0][1] === 2) cat = 1;
  else cat = 0;
  const tb = straightHigh && (cat === 8 || cat === 4) ? [straightHigh] : order;
  let score = cat;
  for (let i = 0; i < 5; i++) score = score * 15 + (tb[i] || 0);
  return { cat, score, royal: cat === 8 && straightHigh === 14 };
}
// Best five of five to seven cards. Returns { cat, score, name, best: [5 cards] }.
export function bestHand(cs) {
  let top = null, best = null;
  const n = cs.length, idx = [0, 1, 2, 3, 4];
  const combos = [];
  (function pick(start, chosen) {
    if (chosen.length === 5) { combos.push(chosen.slice()); return; }
    for (let i = start; i < n; i++) { chosen.push(i); pick(i + 1, chosen); chosen.pop(); }
  })(0, []);
  for (const c of n === 5 ? [idx] : combos) {
    const five = c.map((i) => cs[i]), e = eval5(five);
    if (!top || e.score > top.score) { top = e; best = five; }
  }
  return { cat: top.cat, score: top.score, name: top.royal ? HAND_NAMES[9] : HAND_NAMES[top.cat], best };
}

// Splits chips into main and side pots. contrib[i] = chips player i put in this hand, folded[i] = true if out.
// Returns [{ amount, eligible: [player indexes] }]. Folded players' chips stay in the pots they reached.
export function buildPots(contrib, folded) {
  const levels = [...new Set(contrib.filter((c, i) => c > 0 && !folded[i]))].sort((a, b) => a - b);
  const pots = []; let prev = 0;
  for (const lv of levels) {
    let amount = 0;
    contrib.forEach((c) => { amount += Math.max(0, Math.min(c, lv) - prev); });
    const eligible = contrib.map((c, i) => i).filter((i) => !folded[i] && contrib[i] >= lv);
    if (amount > 0) pots.push({ amount, eligible });
    prev = lv;
  }
  // chips above the highest live player's level (from folded players who bet more) go to the last pot
  const extra = contrib.reduce((a, c) => a + Math.max(0, c - prev), 0);
  if (extra && pots.length) pots[pots.length - 1].amount += extra;
  return pots;
}
// Hands out each pot to the best hand among its eligible players (ties split, odd chips to the earliest seat in `order`).
export function awardPots(pots, scores, order) {
  const won = {};
  for (const p of pots) {
    const best = Math.max(...p.eligible.map((i) => scores[i]));
    const winners = order.filter((i) => p.eligible.includes(i) && scores[i] === best);
    const share = Math.floor(p.amount / winners.length);
    let odd = p.amount - share * winners.length;
    for (const w of winners) { won[w] = (won[w] || 0) + share + (odd > 0 ? 1 : 0); if (odd > 0) odd--; }
  }
  return won;
}

// ---------- Baccarat (Punto Banco) ----------
export const bacValue = (hand) => hand.reduce((a, c) => a + (c.r >= 10 && c.r <= 13 ? 0 : c.r === 14 ? 1 : c.r), 0) % 10;
// Does the banker draw a third card? p3 is the player's third card value (0..9), or null if the player stood.
export function bankerDraws(bankerTotal, p3) {
  if (p3 === null) return bankerTotal <= 5;
  if (bankerTotal <= 2) return true;
  if (bankerTotal === 3) return p3 !== 8;
  if (bankerTotal === 4) return p3 >= 2 && p3 <= 7;
  if (bankerTotal === 5) return p3 >= 4 && p3 <= 7;
  if (bankerTotal === 6) return p3 === 6 || p3 === 7;
  return false;
}
// Plays out a coup from a draw function. Returns { player, banker, pv, bv, winner: 'player' | 'banker' | 'tie', natural }.
export function bacCoup(draw) {
  const player = [draw(), draw()], banker = [draw(), draw()];
  let pv = bacValue(player), bv = bacValue(banker);
  const natural = pv >= 8 || bv >= 8;
  if (!natural) {
    let p3 = null;
    if (pv <= 5) { const c = draw(); player.push(c); p3 = bacValue([c]); pv = bacValue(player); }
    if (bankerDraws(bv, p3)) { banker.push(draw()); bv = bacValue(banker); }
  }
  return { player, banker, pv, bv, natural, winner: pv > bv ? 'player' : bv > pv ? 'banker' : 'tie' };
}
// Net result of a bet: player 1:1, banker 1:1 less 5% commission, tie 8:1. Player and banker bets push on a tie.
export function bacNet(bet, stake, winner) {
  if (bet === 'tie') return winner === 'tie' ? stake * 8 : -stake;
  if (winner === 'tie') return 0;
  if (bet !== winner) return -stake;
  return bet === 'banker' ? Math.floor(stake * 0.95) : stake;
}

// ---------- Video poker: Jacks or Better, full pay (9/6) ----------
// Pays per coin, as the total returned (so a pair of jacks gives the bet back). Royal flush pays 800 per coin at 5 coins.
export const VP_TABLE = [
  { key: 'royal', name: 'Royal flush', pay: 250, max: 800 },
  { key: 'sflush', name: 'Straight flush', pay: 50 },
  { key: 'quads', name: 'Four of a kind', pay: 25 },
  { key: 'full', name: 'Full house', pay: 9 },
  { key: 'flush', name: 'Flush', pay: 6 },
  { key: 'straight', name: 'Straight', pay: 4 },
  { key: 'trips', name: 'Three of a kind', pay: 3 },
  { key: 'twopair', name: 'Two pair', pay: 2 },
  { key: 'jacks', name: 'Jacks or better', pay: 1 },
];
export function vpHand(h) {
  const e = eval5(h);
  if (e.royal) return 'royal';
  return [null, null, 'twopair', 'trips', 'straight', 'flush', 'full', 'quads', 'sflush'][e.cat]
    || (e.cat === 1 && Object.entries(h.reduce((m, c) => ((m[c.r] = (m[c.r] || 0) + 1), m), {})).some(([r, n]) => n === 2 && +r >= 11) ? 'jacks' : null);
}
// Total returned for a bet of `coins` coins of `coin` chips each (0 for a losing hand).
export function vpPay(h, coins, coin) {
  const k = vpHand(h); if (!k) return 0;
  const row = VP_TABLE.find((t) => t.key === k);
  return (k === 'royal' && coins === 5 ? row.max : row.pay) * coins * coin;
}
// Replaces every card not held. held: array of 5 booleans.
export const vpDraw = (hand, held, draw) => hand.map((c, i) => (held[i] ? c : draw()));
