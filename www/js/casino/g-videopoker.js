// Video Poker: Jacks or Better, full pay (9/6). Hold cards, draw once, with an optional double-up after a win.
import { Shoe, VP_TABLE, vpHand, vpPay, vpDraw } from './cards-engine.js';

const COINS = [5, 25, 100];

export default {
  id: 'videopoker', name: 'Video Poker', tag: 'Jacks or Better, full pay',
  art: () => '<div><img src="img/casino/card_JS.webp" alt="" style="width:34px"><img src="img/casino/card_JH.webp" alt="" style="width:34px;margin-left:-8px"><img src="img/casino/card_QD.webp" alt="" style="width:34px;margin-left:-8px"></div>',
  help: [
    'Choose a coin value and how many coins to bet (1 to 5), then Deal. You get five cards.',
    'Tap <b>Hold</b> under the cards you want to keep, then <b>Draw</b> to replace the rest. Your final hand pays by the table at the top.',
    'The lowest paying hand is a pair of jacks or better (jacks, queens, kings or aces). A royal flush pays 800 per coin when you bet 5 coins, so betting the maximum is best.',
    'After a win you can <b>Double up</b>: the dealer turns a card, you pick one of four. Higher doubles your win, the same rank keeps it, lower loses it.',
  ],
  create(ctx) {
    const { wallet, ui, sfx, buzz } = ctx;
    const root = ctx.root;
    let coin = 5, coins = 5, hand = [], held = [false, false, false, false, false], phase = 'bet', shoe = null, win = 0, timer = 0;
    const wait = (ms) => new Promise((r) => { timer = setTimeout(r, ms); });
    root.innerHTML = `<div class="vp-table">
      <table class="vp-pay" data-el="pay"></table>
      <div class="vp-msg" data-el="msg">Choose your bet and deal</div>
      <div class="vp-hand" data-el="hand"></div>
      <div class="vp-bet"><span>Coin</span><div class="cs-row-btns" data-el="coin"></div></div>
      <div class="vp-bet"><span data-el="betinfo"></span></div>
      <div class="cs-row-btns" data-el="acts"></div></div>`;
    const q = (k) => root.querySelector(`[data-el="${k}"]`);

    function renderPay(hit) {
      q('pay').innerHTML = VP_TABLE.map((r) => `<tr class="${hit === r.key ? 'hit' : ''}"><td>${r.name}</td>${[1, 2, 3, 4, 5].map((c) => `<td class="${c === coins ? 'col' : ''}">${(r.key === 'royal' && c === 5 ? r.max : r.pay) * c}</td>`).join('')}</tr>`).join('');
    }
    function renderHand(fresh = []) {
      q('hand').innerHTML = (hand.length ? hand : Array(5).fill(null)).map((c, i) => `<div class="slot"><div class="vp-held">${held[i] ? 'HELD' : ''}</div>
        ${c ? ui.cardHTML(c, { cls: fresh.includes(i) ? 'deal' : '' }) : ui.cardHTML(null, { faceDown: true })}
        <button class="vp-hold ${held[i] ? 'on' : ''}" data-hold="${i}" ${phase !== 'hold' ? 'disabled' : ''}>HOLD</button></div>`).join('');
      q('hand').querySelectorAll('.cs-card.deal').forEach((el, k) => { el.style.animationDelay = `${k * 90}ms`; });
    }
    function renderControls() {
      q('coin').innerHTML = COINS.map((v) => `<button class="cs-chip ${v === coin ? 'on' : ''}" data-coin="${v}" ${phase !== 'bet' && phase !== 'done' ? 'disabled' : ''}><img src="${ui.chipImg(v)}" alt=""><span>${v}</span></button>`).join('');
      q('betinfo').textContent = `Bet ${coins} coin${coins > 1 ? 's' : ''} = ${ui.fmt(coins * coin)} chips`;
      const a = q('acts');
      if (phase === 'bet' || phase === 'done') a.innerHTML = `${ui.button('Bet one')}${ui.button('Bet max')}${ui.button('Deal', 'gold')}${phase === 'done' && win ? ui.button('Double up', 'blue') : ''}`;
      else if (phase === 'hold') a.innerHTML = ui.button('Draw', 'gold');
      else if (phase === 'double') a.innerHTML = ui.button('Take win', 'gold');
      else a.innerHTML = '';
    }
    async function deal() {
      const cost = coins * coin;
      if (!(await ui.needChips(ctx, cost)) || !wallet.take(cost)) return;
      shoe = new Shoe(1); win = 0; held = [false, false, false, false, false];
      hand = [0, 1, 2, 3, 4].map(() => shoe.draw()); phase = 'hold';
      sfx.note(); renderPay(vpHand(hand)); renderHand([0, 1, 2, 3, 4]); renderControls();
      const k = vpHand(hand);
      q('msg').textContent = k ? `You have ${VP_TABLE.find((r) => r.key === k).name.toLowerCase()}. Hold and draw.` : 'Hold the cards you want, then Draw';
    }
    function draw() {
      const before = hand;
      hand = vpDraw(hand, held, () => shoe.draw());
      const fresh = hand.map((c, i) => (c !== before[i] ? i : -1)).filter((i) => i >= 0);
      const k = vpHand(hand), pay = vpPay(hand, coins, coin), cost = coins * coin;
      phase = 'done'; win = pay;
      renderPay(k); renderHand(fresh);
      if (pay) { wallet.give(pay); ui.banner(root, { text: VP_TABLE.find((r) => r.key === k).name, amount: pay - cost || pay, win: true }); buzz(k === 'royal' ? [60, 60, 60, 60, 120] : 30); }
      else sfx.error();
      ctx.stats.record(pay > cost ? 'win' : pay === cost ? 'push' : 'lose', pay - cost);
      q('msg').textContent = pay ? `${VP_TABLE.find((r) => r.key === k).name}: ${ui.fmt(pay)} chips` : 'No win this time';
      renderControls();
    }
    // Double up: the win is put back on the table; beat the dealer's card to double it.
    let dealerCard = null, picks = [];
    function startDouble() {
      if (!win || !wallet.take(win)) return;
      phase = 'double'; shoe = new Shoe(1);
      dealerCard = shoe.draw(); picks = [0, 1, 2, 3].map(() => shoe.draw());
      held = [false, false, false, false, false];
      hand = [dealerCard, ...picks];
      q('msg').textContent = `Double up ${ui.fmt(win)}: pick a card to beat the dealer`;
      q('hand').innerHTML = [dealerCard, ...picks].map((c, i) => `<div class="slot"><div class="vp-held">${i ? '' : 'DEALER'}</div>${ui.cardHTML(c, { faceDown: i > 0, cls: 'deal' })}
        ${i ? `<button class="vp-hold" data-pick="${i}">PICK</button>` : '<button class="vp-hold" disabled>&nbsp;</button>'}</div>`).join('');
      renderControls();
    }
    async function pick(i) {
      const el = q('hand').children[i].querySelector('.cs-card'); ui.flipCard(el);
      q('hand').querySelectorAll('[data-pick]').forEach((b) => (b.disabled = true));
      await wait(500);
      const mine = picks[i - 1].r, theirs = dealerCard.r;
      if (mine > theirs) { win *= 2; wallet.give(win); ui.banner(root, { text: 'Doubled', amount: win / 2, win: true }); ctx.stats.record('win', win / 2); }
      else if (mine === theirs) { wallet.give(win); ui.banner(root, { text: 'Same rank, win kept' }); }
      else { ui.banner(root, { text: 'Lower card', amount: -win }); ctx.stats.record('lose', -win); win = 0; sfx.error(); }
      phase = 'done';
      q('msg').textContent = win ? `You have ${ui.fmt(win)} to take or double again` : 'Choose your bet and deal';
      renderControls();
    }
    function takeWin() { wallet.give(win); phase = 'done'; q('msg').textContent = `Took ${ui.fmt(win)}`; win = 0; renderControls(); }

    root.addEventListener('click', (e) => {
      const h = e.target.closest('[data-hold]');
      if (h && phase === 'hold') { const i = +h.dataset.hold; held[i] = !held[i]; sfx.tap(); renderHand(); return; }
      const p = e.target.closest('[data-pick]'); if (p && phase === 'double') return pick(+p.dataset.pick);
      const c = e.target.closest('[data-coin]'); if (c && (phase === 'bet' || phase === 'done')) { coin = +c.dataset.coin; sfx.tap(); renderControls(); return; }
      const b = e.target.closest('.cs-btn'); if (!b) return;
      const t = b.textContent;
      if (t === 'Bet one') { coins = coins % 5 + 1; win = 0; sfx.tap(); renderPay(); renderControls(); }
      else if (t === 'Bet max') { coins = 5; renderPay(); deal(); }
      else if (t === 'Deal') deal();
      else if (t === 'Draw') draw();
      else if (t === 'Double up') startDouble();
      else if (t === 'Take win') takeWin();
    });
    renderPay(); renderHand(); renderControls();
    return { destroy() { clearTimeout(timer); if (phase === 'double' && win) wallet.give(win); } };
  },
};
