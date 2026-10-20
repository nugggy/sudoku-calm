// Baccarat (Punto Banco): bet on Player, Banker or Tie; the third-card rules play themselves. Bead plate road.
import { Shoe, bacValue, bankerDraws, bacNet } from './cards-engine.js';

let shoe = null, road = [];

export default {
  id: 'baccarat', name: 'Baccarat', tag: 'Player, Banker or Tie',
  art: () => '<div><img src="img/casino/card_9D.webp" alt="" style="width:42px;transform:rotate(-8deg)"><img src="img/casino/card_KS.webp" alt="" style="width:42px;margin-left:-16px;transform:rotate(8deg)"></div>',
  help: [
    'Bet on which hand will finish closer to 9: <b>Player</b> or <b>Banker</b>, or bet on a <b>Tie</b>. You do not make any decisions after the deal; the cards are drawn by fixed rules.',
    'Aces count 1, tens and picture cards count 0, and only the last digit of the total counts (7 and 8 make 5).',
    'An 8 or 9 on the first two cards is a natural and nobody draws. Otherwise the Player draws on 0 to 5, and the Banker draws by the standard table.',
    'Player pays 1 to 1. Banker pays 1 to 1 less a 5% commission. Tie pays 8 to 1, and Player and Banker bets are returned on a tie.',
    'The bead plate shows recent results: blue for Player, red for Banker and green for Tie.',
  ],
  create(ctx) {
    const { wallet, ui, sfx } = ctx;
    if (!shoe) shoe = new Shoe(8);
    const root = ctx.root;
    let bets = { player: 0, banker: 0, tie: 0 }, last = null, phase = 'bet', P = [], B = [], timer = 0;
    root.innerHTML = `<div class="bac-table">
      <div class="bac-sides">
        <div class="bac-side"><div class="cs-label">Player <span class="cs-total" data-el="pv"></span></div><div class="cs-hand" data-el="ph"></div></div>
        <div class="bac-side"><div class="cs-label">Banker <span class="cs-total" data-el="bv"></span></div><div class="cs-hand" data-el="bh"></div></div>
      </div>
      <div class="bac-spots">
        <button class="cs-spot player" data-bet="player">Player<small>1 to 1</small></button>
        <button class="cs-spot tie" data-bet="tie">Tie<small>8 to 1</small></button>
        <button class="cs-spot banker" data-bet="banker">Banker<small>1 to 1, less 5%</small></button>
      </div>
      <div class="bac-road" data-el="road"></div>
    </div><div class="cs-row-btns" data-el="acts"></div><div data-el="picker"></div>`;
    const q = (k) => root.querySelector(`[data-el="${k}"]`);
    const picker = ui.betPicker({});
    q('picker').appendChild(picker);
    const total = () => bets.player + bets.banker + bets.tie;
    const wait = (ms) => new Promise((r) => { timer = setTimeout(r, ms); });

    function renderBets() {
      for (const k of ['player', 'banker', 'tie']) {
        const s = root.querySelector(`[data-bet="${k}"]`);
        s.classList.toggle('has', !!bets[k]);
        s.querySelector('.cs-stack')?.remove();
        if (bets[k]) s.insertAdjacentHTML('beforeend', ui.chipStack(bets[k]));
      }
      q('acts').innerHTML = phase === 'bet' ? `${ui.button('Clear')}${last && !total() ? ui.button('Rebet') : ''}${ui.button('Deal', 'gold')}` : phase === 'done' ? ui.button('New coup', 'gold') : '';
      q('picker').style.visibility = phase === 'bet' ? 'visible' : 'hidden';
    }
    function renderRoad() {
      const r = road.slice(-60);
      q('road').innerHTML = r.map((w) => `<i class="${w[0]}">${w === 'tie' ? 'T' : w === 'player' ? 'P' : 'B'}</i>`).join('');
      q('road').scrollLeft = 9999;
    }
    async function deal() {
      const amt = total();
      if (!amt) { if (last) { bets = { ...last }; renderBets(); return deal(); } ctx.toast('Tap Player, Banker or Tie to bet'); return; }
      if (!(await ui.needChips(ctx, amt)) || !wallet.take(amt)) return;
      last = { ...bets }; phase = 'deal'; renderBets();
      if (shoe.cutReached) { shoe.reshuffle(); ctx.toast('Shuffling a fresh shoe'); }
      P = []; B = []; q('ph').innerHTML = ''; q('bh').innerHTML = ''; q('pv').textContent = ''; q('bv').textContent = '';
      const give = async (hand, el) => { const c = shoe.draw(); hand.push(c); ui.dealCard(el, c); await wait(380); };
      await give(P, q('ph')); await give(B, q('bh')); await give(P, q('ph')); await give(B, q('bh'));
      if (!ctx.alive()) return;
      let pv = bacValue(P), bv = bacValue(B);
      q('pv').textContent = pv; q('bv').textContent = bv;
      if (pv < 8 && bv < 8) {
        let p3 = null;
        if (pv <= 5) { await wait(300); await give(P, q('ph')); p3 = bacValue([P[2]]); pv = bacValue(P); q('pv').textContent = pv; }
        if (bankerDraws(bv, p3)) { await wait(300); await give(B, q('bh')); bv = bacValue(B); q('bv').textContent = bv; }
      }
      if (!ctx.alive()) return;
      const winner = pv > bv ? 'player' : bv > pv ? 'banker' : 'tie';
      road.push(winner); renderRoad();
      let net = 0, back = 0;
      for (const k of ['player', 'banker', 'tie']) if (bets[k]) { const n = bacNet(k, bets[k], winner); net += n; back += bets[k] + n; }
      if (back > 0) wallet.give(back);
      ctx.stats.record(net > 0 ? 'win' : net < 0 ? 'lose' : 'push', net);
      const name = winner === 'tie' ? 'Tie' : `${winner === 'player' ? 'Player' : 'Banker'} wins ${Math.max(pv, bv)} to ${Math.min(pv, bv)}`;
      ui.banner(root, net > 0 ? { text: name, amount: net, win: true } : net < 0 ? { text: name, amount: net } : { text: `${name}, bet returned` });
      if (net < 0) sfx.error();
      phase = 'done'; bets = { player: 0, banker: 0, tie: 0 }; renderBets();
    }
    root.addEventListener('click', (e) => {
      const s = e.target.closest('[data-bet]');
      if (s && phase === 'bet') {
        const add = picker.selected();
        if (!wallet.canAfford(total() + add)) { ui.needChips(ctx, total() + add); return; }
        bets[s.dataset.bet] += add; sfx.place(); renderBets(); return;
      }
      const b = e.target.closest('.cs-btn'); if (!b) return;
      const t = b.textContent;
      if (t === 'Clear') { bets = { player: 0, banker: 0, tie: 0 }; renderBets(); }
      else if (t === 'Rebet') { bets = { ...last }; sfx.place(); renderBets(); }
      else if (t === 'Deal') deal();
      else if (t === 'New coup') { phase = 'bet'; q('ph').innerHTML = ''; q('bh').innerHTML = ''; q('pv').textContent = ''; q('bv').textContent = ''; renderBets(); }
    });
    renderBets(); renderRoad();
    return { destroy() { clearTimeout(timer); } };
  },
};
