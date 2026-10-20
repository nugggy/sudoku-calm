// Checks the Casino Night rules: shoe, blackjack, poker hands and side pots, Hold'em chip conservation,
// baccarat third-card rules, video poker pays and the wallet. Run with: node tools/test-casino.mjs
import { Shoe, newDeck, shuffle, cards, bjValue, isBlackjack, dealerHits, bjSettle, insuranceNet, bjStrategy, eval5, bestHand, buildPots, awardPots,
  bacValue, bankerDraws, bacCoup, bacNet, vpHand, vpPay, vpDraw, parseCard } from '../www/js/casino/cards-engine.js';
import { Holdem, chen, equity } from '../www/js/casino/holdem-engine.js';
import { mulberry32 } from '../www/js/sudoku-engine.js';

let fail = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fail++; console.log('FAIL', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// ---------- shoe and shuffle ----------
{
  const s = new Shoe(6, mulberry32(1));
  eq(s.left, 312, 'six-deck shoe size');
  const seen = {}; for (let i = 0; i < 312; i++) { const c = s.draw(); seen[c.r + c.s] = (seen[c.r + c.s] || 0) + 1; }
  ok(Object.keys(seen).length === 52 && Object.values(seen).every((n) => n === 6), 'each card appears six times');
  ok(s.cutReached, 'cut card reached after the whole shoe');
  // fairness: the top card of a shuffled deck is spread evenly over 52 cards
  const rnd = mulberry32(7), counts = Array(52).fill(0);
  for (let k = 0; k < 52000; k++) { const d = shuffle(newDeck(), rnd); const c = d[0]; counts[(c.r - 2) * 4 + 'SHDC'.indexOf(c.s)]++; }
  ok(Math.max(...counts) < 1200 && Math.min(...counts) > 800, `shuffle spreads the top card evenly (min ${Math.min(...counts)}, max ${Math.max(...counts)})`);
}

// ---------- blackjack ----------
eq(bjValue(cards('AS 6H')), { total: 17, soft: true }, 'soft 17');
eq(bjValue(cards('AS 6H TD')), { total: 17, soft: false }, 'ace drops to 1');
eq(bjValue(cards('AS AH 9D')), { total: 21, soft: true }, 'two aces and a nine');
eq(bjValue(cards('KS QH 2D')).total, 22, 'bust total');
ok(isBlackjack(cards('AS KH')) && !isBlackjack(cards('AS 5H 5D')), 'blackjack needs two cards');
ok(!dealerHits(cards('AS 6H')), 'dealer stands on soft 17');
ok(dealerHits(cards('TS 6H')) && !dealerHits(cards('TS 7H')), 'dealer hits 16, stands 17');
eq(bjSettle(cards('AS KH'), cards('TS 7H')), 1.5, 'blackjack pays 3:2');
eq(bjSettle(cards('AS KH'), cards('AD QC')), 0, 'blackjack against blackjack pushes');
eq(bjSettle(cards('AS KH'), cards('AD QC'), { split: true }), -1, 'split 21 is not blackjack');
eq(bjSettle(cards('TS 9H'), cards('TD 6C 8S')), 1, 'dealer bust');
eq(bjSettle(cards('TS 5H 9C'), cards('TD 6C 8S')), -1, 'player bust loses even if dealer busts');
eq(bjSettle(cards('TS 8H'), cards('9D 9C')), 0, 'push');
eq(bjSettle(cards('TS 6H'), cards('TD 9C'), { surrendered: true }), -0.5, 'surrender returns half');
eq(insuranceNet(50, cards('AS KD')), 100, 'insurance pays 2:1');
eq(insuranceNet(50, cards('AS 7D')), -50, 'insurance lost');
const up = (c) => parseCard(c);
eq(bjStrategy(cards('8S 8H'), up('TD')), 'split', 'always split eights');
eq(bjStrategy(cards('AS AH'), up('6D')), 'split', 'always split aces');
eq(bjStrategy(cards('TS TH'), up('6D')), 'stand', 'never split tens');
eq(bjStrategy(cards('6S 5H'), up('TD')), 'double', '11 doubles against 10');
eq(bjStrategy(cards('TS 6H'), up('TD')), 'surrender', '16 surrenders against 10');
eq(bjStrategy(cards('TS 6H'), up('TD'), { canSurrender: false }), 'hit', '16 hits against 10 without surrender');
eq(bjStrategy(cards('TS 2H'), up('4D')), 'stand', '12 stands against 4');
eq(bjStrategy(cards('AS 7H'), up('9D')), 'hit', 'soft 18 hits against 9');
eq(bjStrategy(cards('AS 7H'), up('5D')), 'double', 'soft 18 doubles against 5');
eq(bjStrategy(cards('AS 7H'), up('5D'), { canDouble: false }), 'stand', 'soft 18 stands when doubling is not allowed');
eq(bjStrategy(cards('9S 9H'), up('7D')), 'stand', 'nines stand against 7');

// ---------- poker hands ----------
const cat = (s) => eval5(cards(s)).cat;
eq(cat('AS KS QS JS TS'), 8, 'royal flush is a straight flush');
ok(eval5(cards('AS KS QS JS TS')).royal, 'royal flag');
eq(cat('5H 4H 3H 2H AH'), 8, 'steel wheel');
eq(cat('9C 9D 9H 9S 2D'), 7, 'four of a kind');
eq(cat('9C 9D 9H 2S 2D'), 6, 'full house');
eq(cat('KD 9D 7D 4D 2D'), 5, 'flush');
eq(cat('5C 4D 3H 2S AD'), 4, 'wheel straight');
eq(cat('9C 9D 9H 5S 2D'), 3, 'three of a kind');
eq(cat('9C 9D 5H 5S 2D'), 2, 'two pair');
eq(cat('9C 9D 7H 5S 2D'), 1, 'one pair');
eq(cat('KC 9D 7H 5S 2D'), 0, 'high card');
const sc = (s) => eval5(cards(s)).score;
ok(sc('6C 5D 4H 3S 2D') > sc('5C 4D 3H 2S AD'), 'six-high straight beats the wheel');
ok(sc('AC AD KH 5S 2D') > sc('AH AS QH JS TD'), 'pair kicker');
ok(sc('KC KD 5H 5S 2D') < sc('KH KS 5D 5C 3D'), 'two pair kicker');
ok(sc('AC KD 9H 5S 2D') === sc('AD KH 9C 5D 2S'), 'equal hands tie');
ok(sc('2C 2D 2H AS AD') > sc('AC KC 9C 5C 2C'), 'full house beats flush');
{
  const b = bestHand(cards('AS KS 2D 7C QS JS TS'));
  eq(b.name, 'Royal flush', 'best five of seven finds the royal');
  const b2 = bestHand(cards('9C 9D 9H 2S 2D 2H KC'));
  eq(b2.cat, 6, 'two trips make a full house');
  ok(b2.best.filter((c) => c.r === 9).length === 3, 'full house uses the higher trips');
  const b3 = bestHand(cards('AH KH 4H 3H 2H 5C 6C'));
  eq(b3.cat, 5, 'flush beats the straight on the board');
}

// ---------- side pots ----------
{
  // A all in for 100, B all in for 300, C calls 300, D folded after putting in 50
  const pots = buildPots([100, 300, 300, 50], [false, false, false, true]);
  eq(pots, [{ amount: 350, eligible: [0, 1, 2] }, { amount: 400, eligible: [1, 2] }], 'main and side pot');
  const won = awardPots(pots, [900, 500, 700, -1], [0, 1, 2, 3]);
  eq(won, { 0: 350, 2: 400 }, 'short stack wins the main pot, best other hand the side pot');
  const split = awardPots([{ amount: 101, eligible: [0, 1] }], [5, 5], [1, 0]);
  eq(split, { 1: 51, 0: 50 }, 'tied pot splits with the odd chip to the first seat');
  const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  eq(total(awardPots(buildPots([40, 40, 10, 10], [false, true, false, true]), [3, -1, 9, -1], [0, 1, 2, 3])), 100, 'folded chips stay in the pots');
}

// ---------- Hold'em: chips are never lost or made, and hands always finish ----------
{
  ok(chen(parseCard('AS'), parseCard('AH')) >= 20 && chen(parseCard('7S'), parseCard('2H')) <= 0, 'Chen scores: aces high, 7-2 low');
  const e1 = equity(cards('AS AH'), [], 1, mulberry32(3), 600), e2 = equity(cards('7S 2H'), [], 1, mulberry32(3), 600);
  ok(e1 > 0.75 && e2 < 0.42, `equity: aces ${e1.toFixed(2)}, seven-two ${e2.toFixed(2)}`);
  const rnd = mulberry32(42);
  let hands = 0, bad = 0;
  for (let t = 0; t < 12; t++) {
    const g = new Holdem([{ name: 'You', stack: 500 }, { name: 'A', stack: 500, style: 'tight' }, { name: 'B', stack: 500, style: 'loose' }, { name: 'C', stack: 500, style: 'tricky' }], { rnd });
    for (let h = 0; h < 30 && g.startHand(); h++) {
      hands++;
      let guard = 0;
      while (!g.over && guard++ < 200) {
        const i = g.toAct;
        // the human seat plays randomly, including all-ins, to stress side pots
        const o = g.options(i);
        const a = i === 0 ? (rnd() < 0.15 ? { type: 'fold' } : rnd() < 0.2 && o.canRaise ? { type: 'raise', to: rnd() < 0.3 ? o.maxTo : o.minTo } : { type: 'call' }) : g.decide(i);
        if (!g.act(i, a)) { bad++; break; }
      }
      if (!g.over) bad++;
      const sum = g.p.reduce((s, p) => s + p.stack, 0);
      if (sum !== 2000) { bad++; console.log('chip total', sum, g.log.join(' | ')); break; }
      if (g.p.some((p) => p.stack < 0)) bad++;
    }
  }
  ok(bad === 0, `Hold'em: ${hands} hands finished with all 2000 chips accounted for`);
}

// ---------- baccarat ----------
eq(bacValue(cards('7S 8H')), 5, 'baccarat totals drop the tens digit');
eq(bacValue(cards('KS QH')), 0, 'picture cards count zero');
eq(bacValue(cards('AS 9H')), 0, 'ace counts one');
ok(bankerDraws(5, null) && !bankerDraws(6, null), 'banker draws on 0 to 5 when the player stands');
ok(bankerDraws(3, 7) && !bankerDraws(3, 8), 'banker 3 draws unless the player third card is 8');
ok(bankerDraws(4, 2) && bankerDraws(4, 7) && !bankerDraws(4, 1) && !bankerDraws(4, 8), 'banker 4 table');
ok(bankerDraws(5, 4) && !bankerDraws(5, 3), 'banker 5 table');
ok(bankerDraws(6, 6) && bankerDraws(6, 7) && !bankerDraws(6, 5), 'banker 6 table');
ok(!bankerDraws(7, 6), 'banker stands on 7');
{
  const seq = cards('9S KH 2D 5C'); let k = 0;
  const r = bacCoup(() => seq[k++]);
  ok(r.natural && r.winner === 'player' && r.player.length === 2, 'natural 9 wins without drawing');
  const seq2 = cards('2S 3H TD 4C 8D'); k = 0; // player 5 draws an 8 (3), banker 4 stands on an 8
  const r2 = bacCoup(() => seq2[k++]);
  ok(r2.player.length === 3 && r2.banker.length === 2 && r2.winner === 'banker', 'banker 4 stands against a player 8');
}
eq(bacNet('banker', 100, 'banker'), 95, 'banker win pays less 5%');
eq(bacNet('player', 100, 'tie'), 0, 'player bet pushes on a tie');
eq(bacNet('tie', 10, 'tie'), 80, 'tie pays 8 to 1');
eq(bacNet('tie', 10, 'player'), -10, 'tie bet lost');
{ // win rates should match the textbook figures: player 44.62%, banker 45.86%, tie 9.52%
  const rnd = mulberry32(5), N = 150000, c = { player: 0, banker: 0, tie: 0 };
  for (let i = 0; i < N; i++) { const sh = new Shoe(8, rnd); c[bacCoup(() => sh.draw()).winner]++; }
  const f = (k) => (c[k] / N) * 100;
  ok(Math.abs(f('player') - 44.62) < 0.5 && Math.abs(f('banker') - 45.86) < 0.5 && Math.abs(f('tie') - 9.52) < 0.35, `baccarat win rates: player ${f('player').toFixed(2)}%, banker ${f('banker').toFixed(2)}%, tie ${f('tie').toFixed(2)}%`);
}

// ---------- video poker ----------
eq(vpHand(cards('AS KS QS JS TS')), 'royal', 'royal flush');
eq(vpPay(cards('AS KS QS JS TS'), 5, 1), 4000, 'royal pays 800 per coin at max bet');
eq(vpPay(cards('AS KS QS JS TS'), 4, 1), 1000, 'royal pays 250 per coin below max bet');
eq(vpHand(cards('9H 8H 7H 6H 5H')), 'sflush', 'straight flush');
eq(vpHand(cards('JS JD 4H 5C 9S')), 'jacks', 'pair of jacks pays');
eq(vpHand(cards('TS TD 4H 5C 9S')), null, 'pair of tens does not pay');
eq(vpPay(cards('JS JD 4H 5C 9S'), 5, 5), 25, 'jacks returns the bet');
eq(vpPay(cards('9S 9D 9H 5C 5S'), 1, 25), 225, 'full house pays 9');
eq(vpPay(cards('2S 7S 9S JS KS'), 1, 1), 6, 'flush pays 6');
{
  const hand = cards('AS KD 4H 5C 9S'), draws = cards('AD AH 2C'); let k = 0;
  const out = vpDraw(hand, [true, false, false, false, true], () => draws[k++]);
  eq(out.map((c) => c.r + c.s), ['14S', '14D', '14H', '2C', '9S'], 'held cards stay, others are replaced in order');
}

// ---------- wallet ----------
{
  const { wallet, topUp, canTopUp } = await import('../www/js/casino/wallet.js');
  const start = wallet.get();
  ok(!wallet.take(start + 1) && wallet.get() === start, 'cannot bet more than you have');
  ok(wallet.take(start) && wallet.get() === 0, 'can bet everything');
  ok(!wallet.take(1) && wallet.get() === 0, 'never below zero');
  wallet.give(-50); ok(wallet.get() === 0, 'negative give is ignored');
  ok(canTopUp() && topUp() === 1000 && wallet.get() === 1000, 'free top-up to 1000 when broke');
  ok(!canTopUp() && topUp() === 0, 'no top-up while you still have chips');
}

console.log(fail ? `${fail} of ${checks} Casino Night checks failed` : `All ${checks} Casino Night checks passed`);
process.exit(fail ? 1 : 0);
