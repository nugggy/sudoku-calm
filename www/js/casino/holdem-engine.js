// No-limit Texas Hold'em table: blinds, betting rounds, all-ins, side pots and computer players.
// No browser code: tools/test-casino.mjs plays thousands of hands with it to check chips are never lost or made.
import { Shoe, bestHand, buildPots, awardPots, HAND_NAMES } from './cards-engine.js';

export const BLINDS = [[5, 10], [10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400]];
export const HANDS_PER_LEVEL = 10;
export const STREETS = ['Pre-flop', 'Flop', 'Turn', 'River'];

// Each computer player has a style: how many starting hands they play, how often they bluff and how keenly they call.
export const STYLES = {
  tight: { name: 'Tight', play: 8, raise: 10, bluff: 0.03, slack: -0.04, aggro: 0.55 },
  loose: { name: 'Loose', play: 4, raise: 8, bluff: 0.07, slack: 0.09, aggro: 0.4 },
  tricky: { name: 'Tricky', play: 5.5, raise: 9, bluff: 0.18, slack: 0.02, aggro: 0.7, slowplay: 0.3 },
};

// Chen formula: a quick score for two starting cards (higher is better, about -1 to 20).
export function chen(a, b) {
  const hi = Math.max(a.r, b.r), lo = Math.min(a.r, b.r);
  const base = (r) => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);
  let s = base(hi);
  if (hi === lo) s = Math.max(5, s * 2);
  if (a.s === b.s) s += 2;
  const gap = hi - lo - 1;
  if (hi !== lo) { s -= gap <= 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5; if (gap <= 1 && hi < 12) s += 1; }
  return Math.ceil(s);
}

// Chance of winning against `opp` random hands, by simulation.
export function equity(hole, board, opp, rnd, sims = 160) {
  if (opp <= 0) return 1;
  const known = new Set([...hole, ...board].map((c) => c.r + c.s));
  const deck = [];
  for (const s of ['S', 'H', 'D', 'C']) for (let r = 2; r <= 14; r++) if (!known.has(r + s)) deck.push({ r, s });
  let wins = 0;
  for (let k = 0; k < sims; k++) {
    // partial shuffle: just enough cards for the opponents and the rest of the board
    const need = opp * 2 + (5 - board.length);
    for (let i = 0; i < need; i++) { const j = i + Math.floor(rnd() * (deck.length - i)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const full = board.concat(deck.slice(opp * 2, need));
    const mine = bestHand(hole.concat(full)).score;
    let best = true, tie = 0;
    for (let o = 0; o < opp; o++) {
      const s = bestHand([deck[o * 2], deck[o * 2 + 1]].concat(full)).score;
      if (s > mine) { best = false; break; }
      if (s === mine) tie++;
    }
    if (best) wins += tie ? 1 / (tie + 1) : 1;
  }
  return wins / sims;
}

export class Holdem {
  // players: [{ name, stack, style ('tight'|'loose'|'tricky') or null for the human }]
  constructor(players, { rnd = Math.random, level = 0 } = {}) {
    this.p = players.map((x) => ({ name: x.name, stack: x.stack, style: x.style || null, human: !x.style }));
    this.rnd = rnd; this.level = level; this.handNo = 0; this.dealer = Math.floor(rnd() * players.length);
    this.log = []; this.over = true;
  }
  get blinds() { return BLINDS[Math.min(BLINDS.length - 1, this.level)]; }
  seated(i) { return this.p[i].stack > 0 || this.contrib?.[i] > 0; }
  next(i, cond = () => true) { const n = this.p.length; for (let k = 1; k <= n; k++) { const j = (i + k) % n; if (cond(j)) return j; } return -1; }
  live(i) { return !this.folded[i] && this.inHand[i]; }
  canAct(i) { return this.live(i) && !this.allin[i]; }

  startHand() {
    const n = this.p.length;
    this.inHand = this.p.map((x) => x.stack > 0);
    if (this.inHand.filter(Boolean).length < 2) { this.over = true; return false; }
    this.handNo++;
    if (this.handNo > 1 && (this.handNo - 1) % HANDS_PER_LEVEL === 0) this.level++;
    this.shoe = new Shoe(1, this.rnd, 1);
    this.board = []; this.street = 0; this.over = false; this.result = null;
    this.hole = this.p.map(() => []);
    this.bet = Array(n).fill(0); this.contrib = Array(n).fill(0);
    this.folded = Array(n).fill(false); this.allin = Array(n).fill(false); this.acted = Array(n).fill(false);
    this.dealer = this.next(this.dealer, (j) => this.inHand[j]);
    const heads = this.inHand.filter(Boolean).length === 2;
    // heads up: the dealer posts the small blind and acts first before the flop
    this.sbSeat = heads ? this.dealer : this.next(this.dealer, (j) => this.inHand[j]);
    this.bbSeat = this.next(this.sbSeat, (j) => this.inHand[j]);
    const [sb, bb] = this.blinds;
    this.post(this.sbSeat, sb); this.post(this.bbSeat, bb);
    this.current = bb; this.minRaise = bb;
    for (let r = 0; r < 2; r++) for (let k = 0; k < n; k++) { const j = (this.sbSeat + k) % n; if (this.inHand[j]) this.hole[j].push(this.shoe.draw()); }
    this.toAct = this.next(this.bbSeat, (j) => this.canAct(j));
    this.log = [`Hand ${this.handNo}: blinds ${sb}/${bb}`];
    this.settleIfDone();
    return true;
  }
  post(i, amt) { const a = Math.min(amt, this.p[i].stack); this.p[i].stack -= a; this.bet[i] += a; this.contrib[i] += a; if (!this.p[i].stack) this.allin[i] = true; return a; }
  pot() { return this.contrib.reduce((a, b) => a + b, 0); }

  // What player i may do now.
  options(i) {
    const toCall = Math.max(0, this.current - this.bet[i]), stack = this.p[i].stack;
    const minTo = Math.min(this.bet[i] + stack, this.current + this.minRaise);
    return { toCall: Math.min(toCall, stack), canCheck: toCall === 0, canRaise: stack > toCall, minTo, maxTo: this.bet[i] + stack };
  }
  // a: { type: 'fold' | 'check' | 'call' | 'raise', to } (raise "to" a total bet for this street; all-in is raise to maxTo)
  act(i, a) {
    if (this.over || i !== this.toAct) return false;
    const o = this.options(i), who = this.p[i].name;
    if (a.type === 'fold') { this.folded[i] = true; this.log.push(`${who} folds`); }
    else if (a.type === 'check') { if (!o.canCheck) return this.act(i, { type: 'call' }); this.log.push(`${who} checks`); }
    else if (a.type === 'call') { if (o.canCheck) return this.act(i, { type: 'check' }); this.post(i, o.toCall); this.log.push(`${who} calls ${o.toCall}${this.allin[i] ? ' (all in)' : ''}`); }
    else if (a.type === 'raise') {
      if (!o.canRaise) return this.act(i, { type: 'call' });
      const to = Math.max(o.minTo, Math.min(o.maxTo, Math.round(a.to)));
      const raiseBy = to - this.current;
      this.post(i, to - this.bet[i]);
      if (raiseBy >= this.minRaise) { this.minRaise = raiseBy; this.acted = this.acted.map((v, j) => (j === i ? v : false)); }
      // a short all-in raise does not reopen the betting for players who have already acted
      if (to > this.current) this.current = to;
      this.log.push(`${who} ${this.allin[i] ? 'is all in for' : 'raises to'} ${to}`);
    }
    this.acted[i] = true;
    this.toAct = this.next(i, (j) => this.canAct(j) && (!this.acted[j] || this.bet[j] < this.current));
    this.settleIfDone();
    return true;
  }
  settleIfDone() {
    const liveN = this.p.filter((x, j) => this.live(j)).length;
    if (liveN <= 1) return this.finish();
    const pending = this.p.some((x, j) => this.canAct(j) && (!this.acted[j] || this.bet[j] < this.current));
    if (pending && this.toAct >= 0) return;
    // street finished: move on, or run the board out when nobody (or only one player) can still bet
    const canBet = this.p.filter((x, j) => this.canAct(j)).length;
    if (this.street === 3) return this.finish();
    this.street++;
    if (this.street === 1) this.board.push(this.shoe.draw(), this.shoe.draw(), this.shoe.draw());
    else this.board.push(this.shoe.draw());
    this.bet.fill(0); this.current = 0; this.minRaise = this.blinds[1]; this.acted.fill(false);
    this.log.push(`${STREETS[this.street]}`);
    if (canBet <= 1) { this.toAct = -1; return this.settleIfDone(); }
    this.toAct = this.next(this.dealer, (j) => this.canAct(j));
  }
  finish() {
    this.over = true; this.toAct = -1;
    const n = this.p.length, liveIdx = this.p.map((x, j) => j).filter((j) => this.live(j));
    const order = []; for (let k = 1; k <= n; k++) order.push((this.dealer + k) % n);
    let won, hands = {};
    if (liveIdx.length === 1) { won = { [liveIdx[0]]: this.pot() }; }
    else {
      while (this.board.length < 5) this.board.push(this.shoe.draw());
      const scores = this.p.map((x, j) => (this.live(j) ? (hands[j] = bestHand(this.hole[j].concat(this.board))).score : -1));
      won = awardPots(buildPots(this.contrib, this.p.map((x, j) => !this.live(j))), scores, order);
    }
    for (const [j, amt] of Object.entries(won)) this.p[j].stack += amt;
    this.result = { won, hands, showdown: liveIdx.length > 1 };
    const names = Object.entries(won).map(([j, a]) => `${this.p[j].name} wins ${a}${hands[j] ? ` with ${hands[j].name.toLowerCase()}` : ''}`);
    this.log.push(...names);
  }

  // Computer decision for player i. Returns an action for act().
  decide(i) {
    const me = this.p[i], st = STYLES[me.style] || STYLES.tight, o = this.options(i), rnd = this.rnd;
    const pot = this.pot(), bb = this.blinds[1];
    const opp = this.p.filter((x, j) => j !== i && this.live(j)).length;
    const raiseTo = (mult) => ({ type: 'raise', to: Math.max(o.minTo, Math.round((this.current + Math.max(bb, pot * mult)) / 5) * 5) });
    if (this.street === 0) {
      const c = chen(this.hole[i][0], this.hole[i][1]) - Math.max(0, opp - 2) * 0.5;
      const bluff = rnd() < st.bluff;
      if (c >= st.raise + 2 && o.canRaise) return rnd() < 0.3 ? { type: 'raise', to: o.maxTo } : raiseTo(0.9);
      if ((c >= st.raise || bluff) && o.canRaise && this.current <= bb * 3) return raiseTo(0.6);
      if (c >= st.play) return o.toCall > me.stack * 0.35 && c < st.raise + 1 ? { type: o.canCheck ? 'check' : 'fold' } : { type: o.canCheck ? 'check' : 'call' };
      return { type: o.canCheck ? 'check' : 'fold' };
    }
    const e = equity(this.hole[i], this.board, opp, rnd, 140);
    const odds = o.toCall / (pot + o.toCall || 1);
    if (o.canCheck) {
      if (e > 0.62 && o.canRaise && !(st.slowplay && rnd() < st.slowplay)) return raiseTo(0.5 + 0.3 * rnd());
      if (rnd() < st.bluff * 1.5 && o.canRaise) return raiseTo(0.5);
      return { type: 'check' };
    }
    if (e > 0.78 && o.canRaise && rnd() < st.aggro) return e > 0.9 && rnd() < 0.4 ? { type: 'raise', to: o.maxTo } : raiseTo(0.75);
    if (e >= odds + 0.05 - st.slack) return { type: 'call' };
    if (rnd() < st.bluff && o.canRaise && this.street < 3) return raiseTo(0.7);
    return { type: 'fold' };
  }
}
export { HAND_NAMES };
