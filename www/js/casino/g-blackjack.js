// Blackjack: six-deck shoe, dealer stands on all 17s, blackjack pays 3:2, double, split to three hands,
// insurance, late surrender and a basic strategy hint.
import { Shoe, bjValue, isBlackjack, dealerHits, bjSettle, insuranceNet, bjStrategy, bjCardValue } from './cards-engine.js';

let shoe = null; // kept for the session so the cut card means something

const ACT_NAMES = { hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split', surrender: 'Surrender' };

export default {
  id: 'blackjack', name: 'Blackjack', tag: 'Beat the dealer to 21',
  art: () => '<div class="cs-art-cards"><img src="img/casino/card_AS.webp" alt="" style="width:46px;transform:rotate(-8deg)"><img src="img/casino/card_KH.webp" alt="" style="width:46px;margin-left:-18px;transform:rotate(8deg)"></div>',
  help: [
    'Get closer to 21 than the dealer without going over. Number cards count their number, picture cards count 10 and aces count 1 or 11.',
    'Pick a chip and tap the betting circle, then Deal. <b>Hit</b> takes a card, <b>Stand</b> keeps your total, <b>Double</b> doubles your bet for exactly one more card, and <b>Split</b> turns a pair into two hands (up to three). Split aces get one card each.',
    'An ace and a ten-value card on the first two cards is a blackjack and pays 3 to 2. The dealer draws to 16 and stands on all 17s.',
    'When the dealer shows an ace you can take <b>Insurance</b> for half your bet; it pays 2 to 1 if the dealer has blackjack. <b>Surrender</b> on your first two cards gives back half your bet.',
    'Tap <b>Hint</b> to see the basic strategy move for your hand. The shoe holds six decks and is reshuffled once the cut card comes out.',
  ],
  create(ctx) {
    const { wallet, ui, sfx, buzz } = ctx;
    if (!shoe) shoe = new Shoe(6);
    let bet = 0, lastBet = 0, phase = 'bet', hands = [], cur = 0, dealer = [], holeShown = false, insurance = 0, busy = false;
    const root = ctx.root;
    root.innerHTML = `<div class="bj-table">
      <div class="bj-shoe"><span>Shoe</span><i><u></u></i></div>
      <div class="bj-dealer"><div class="cs-label">Dealer <span class="cs-total" data-el="dt"></span></div><div class="cs-hand" data-el="dh"></div></div>
      <div class="bj-hint" data-el="hint"></div>
      <div class="bj-player"><div class="bj-hands" data-el="hands"></div></div>
    </div>
    <div class="cs-row-btns" data-el="acts"></div>
    <div data-el="picker"></div>`;
    const q = (k) => root.querySelector(`[data-el="${k}"]`);
    const picker = ui.betPicker({ onPick: () => {} });
    q('picker').appendChild(picker);

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    function cardsHTML(list, hideSecond) {
      return list.map((c, i) => {
        const fresh = !c._shown; c._shown = true;
        const down = hideSecond && i === 1;
        return ui.cardHTML(c, { faceDown: down, cls: fresh ? 'deal' : '' });
      }).join('');
    }
    function render() {
      const dv = bjValue(dealer);
      q('dh').innerHTML = cardsHTML(dealer, !holeShown);
      q('dt').textContent = dealer.length ? (holeShown ? dv.total : bjCardValue(dealer[0])) : '';
      if (phase === 'bet') {
        q('hands').innerHTML = `<div class="bj-hand"><div class="cs-hand"></div><button class="cs-spot ${bet ? 'has' : ''}" data-act="spot">${bet ? ui.chipStack(bet) : 'Tap to bet'}</button></div>`;
      } else {
        q('hands').innerHTML = hands.map((h, i) => {
          const v = bjValue(h.cards);
          const tag = h.surrendered ? 'Surrendered' : v.total > 21 ? 'Bust' : isBlackjack(h.cards) && !h.split ? 'Blackjack' : `${v.soft && v.total < 21 ? 'Soft ' : ''}${v.total}`;
          return `<div class="bj-hand ${i === cur && phase === 'play' && hands.length > 1 ? 'active' : ''}"><div class="cs-hand">${cardsHTML(h.cards)}</div>
            <span class="cs-total">${tag}${h.result ? ` · ${h.result}` : ''}</span>${ui.chipStack(h.bet)}</div>`;
        }).join('');
      }
      const left = shoe.left / shoe.total;
      root.querySelector('.bj-shoe u').style.width = `${Math.round(left * 100)}%`;
      renderActs();
    }
    function renderActs() {
      const a = q('acts'); let html = '';
      if (busy) html = '';
      else if (phase === 'bet') html = `${ui.button('Clear')}${lastBet && !bet ? ui.button('Rebet') : ''}${ui.button('Deal', 'gold')}`;
      else if (phase === 'insure') html = `${ui.button('Insurance')}${ui.button('No insurance', 'gold')}`;
      else if (phase === 'play') {
        const h = hands[cur], two = h.cards.length === 2;
        const canSplit = two && bjCardValue(h.cards[0]) === bjCardValue(h.cards[1]) && hands.length < 3 && wallet.canAfford(h.bet);
        html = `${ui.button('Hit', 'gold')}${ui.button('Stand')}${two && wallet.canAfford(h.bet) ? ui.button('Double') : ''}${canSplit ? ui.button('Split') : ''}${two && hands.length === 1 ? ui.button('Surrender') : ''}${ui.button('Hint', 'blue')}`;
      } else if (phase === 'done') html = `${ui.button('New hand', 'gold')}`;
      a.innerHTML = html;
      q('picker').style.visibility = phase === 'bet' ? 'visible' : 'hidden';
    }

    async function deal() {
      if (!bet) { if (lastBet) bet = lastBet; else { ctx.toast('Tap the circle to place a bet'); return; } }
      if (!(await ui.needChips(ctx, bet))) return;
      if (!ctx.alive() || !wallet.take(bet)) return;
      if (shoe.cutReached) { shoe.reshuffle(); ctx.toast('Shuffling a fresh shoe'); }
      lastBet = bet; busy = true; phase = 'play'; holeShown = false; insurance = 0; cur = 0;
      hands = [{ cards: [], bet, split: false }]; dealer = [];
      q('hint').textContent = '';
      for (const target of ['p', 'd', 'p', 'd']) {
        (target === 'p' ? hands[0].cards : dealer).push(shoe.draw()); render(); await wait(300);
        if (!ctx.alive()) return;
      }
      busy = false;
      if (dealer[0].r === 14 && wallet.canAfford(Math.floor(bet / 2))) { phase = 'insure'; q('hint').textContent = 'The dealer shows an ace. Insurance?'; render(); return; }
      afterPeek();
    }
    function afterPeek() {
      if (isBlackjack(dealer) || isBlackjack(hands[0].cards)) return dealerTurn();
      phase = 'play'; render();
    }
    function insure(yes) {
      insurance = yes ? Math.floor(bet / 2) : 0;
      if (insurance && !wallet.take(insurance)) insurance = 0;
      q('hint').textContent = '';
      afterPeek();
    }
    async function nextHand() {
      cur++;
      while (cur < hands.length && hands[cur].done) cur++;
      if (cur >= hands.length) return dealerTurn();
      const h = hands[cur];
      if (h.cards.length === 1) { h.cards.push(shoe.draw()); render(); await wait(280); if (h.aces) { h.done = true; return nextHand(); } }
      render();
    }
    async function act(kind) {
      const h = hands[cur];
      q('hint').textContent = '';
      if (kind === 'hint') {
        const best = bjStrategy(h.cards, dealer[0], { canDouble: h.cards.length === 2 && wallet.canAfford(h.bet), canSplit: hands.length < 3 && wallet.canAfford(h.bet), canSurrender: hands.length === 1 && h.cards.length === 2 });
        q('hint').textContent = `Basic strategy says: ${ACT_NAMES[best]}`; sfx.hint(); return;
      }
      if (kind === 'hit') {
        h.cards.push(shoe.draw()); render();
        const v = bjValue(h.cards).total;
        if (v > 21) { buzz(30); h.done = true; await wait(450); return nextHand(); }
        if (v === 21) { h.done = true; await wait(300); return nextHand(); }
        return;
      }
      if (kind === 'stand') { h.done = true; return nextHand(); }
      if (kind === 'double') {
        if (!wallet.take(h.bet)) return;
        h.bet *= 2; h.doubled = true; h.cards.push(shoe.draw()); h.done = true; render(); await wait(450); return nextHand();
      }
      if (kind === 'surrender') { h.surrendered = true; h.done = true; return dealerTurn(); }
      if (kind === 'split') {
        if (!wallet.take(h.bet)) return;
        const aces = h.cards[0].r === 14;
        const nh = { cards: [h.cards.pop()], bet: h.bet, split: true, aces };
        h.split = true; h.aces = aces;
        hands.splice(cur + 1, 0, nh);
        h.cards.push(shoe.draw()); render(); await wait(300);
        if (aces) { h.done = true; return nextHand(); }
        if (bjValue(h.cards).total === 21) { h.done = true; return nextHand(); }
        render();
      }
    }
    async function dealerTurn() {
      phase = 'dealer'; busy = true; holeShown = true; render(); await wait(450);
      const live = hands.some((h) => !h.surrendered && bjValue(h.cards).total <= 21) && !(hands.length === 1 && isBlackjack(hands[0].cards));
      while (live && dealerHits(dealer)) { dealer.push(shoe.draw()); render(); await wait(480); if (!ctx.alive()) return; }
      settle();
    }
    function settle() {
      let net = 0, back = 0;
      if (insurance) { const n = insuranceNet(insurance, dealer); net += n; if (n > 0) back += insurance + n; }
      for (const h of hands) {
        const m = bjSettle(h.cards, dealer, { split: h.split, surrendered: h.surrendered });
        const n = Math.floor(h.bet * m);
        net += n; back += h.bet + n;
        h.result = m > 1 ? 'Blackjack!' : m > 0 ? 'Win' : m === 0 ? 'Push' : m === -0.5 ? 'Half back' : 'Lose';
      }
      if (back > 0) wallet.give(back);
      ctx.stats.record(net > 0 ? 'win' : net < 0 ? 'lose' : 'push', net);
      const dv = bjValue(dealer).total;
      ui.banner(root, net > 0 ? { text: isBlackjack(hands[0].cards) && hands.length === 1 && !isBlackjack(dealer) ? 'Blackjack!' : 'You win', amount: net, win: true }
        : net < 0 ? { text: dv > 21 ? 'Close one' : isBlackjack(dealer) ? 'Dealer blackjack' : 'Dealer wins', amount: net } : { text: 'Push' });
      if (net < 0) sfx.error();
      phase = 'done'; busy = false; bet = 0; render();
    }

    root.addEventListener('click', (e) => {
      if (busy) return;
      if (e.target.closest('[data-act="spot"]') && phase === 'bet') {
        const add = picker.selected();
        if (!wallet.canAfford(bet + add)) { ui.needChips(ctx, bet + add); return; }
        bet += add; sfx.place(); render(); return;
      }
      const b = e.target.closest('.cs-btn'); if (!b) return;
      const t = b.textContent;
      if (t === 'Clear') { bet = 0; render(); }
      else if (t === 'Rebet') { bet = lastBet; sfx.place(); render(); }
      else if (t === 'Deal') deal();
      else if (t === 'Insurance') insure(true);
      else if (t === 'No insurance') insure(false);
      else if (t === 'New hand') { phase = 'bet'; hands = []; dealer = []; bet = 0; q('hint').textContent = ''; render(); }
      else act(t.toLowerCase());
    });
    render();
    return { destroy() {} };
  },
};
