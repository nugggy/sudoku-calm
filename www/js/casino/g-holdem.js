// Texas Hold'em: no-limit against three computer players with different styles. Buy in from your chips, cash out any time between hands.
import { Holdem, STYLES, STREETS } from './holdem-engine.js';
import { bestHand } from './cards-engine.js';

const NAMES = ['Mia', 'Jack', 'Priya', 'Leo', 'Sam', 'Ruby', 'Omar', 'Zoe', 'Kai', 'Ivy'];
const STYLE_ORDER = ['tight', 'loose', 'tricky'];

export default {
  id: 'holdem', name: "Texas Hold'em", tag: 'No-limit poker against three rivals',
  art: () => '<div><img src="img/casino/card_AD.webp" alt="" style="width:40px;transform:rotate(-10deg)"><img src="img/casino/card_AC.webp" alt="" style="width:40px;margin-left:-14px;transform:rotate(6deg)"><img src="img/casino/chip_500.webp" alt="" style="width:30px;margin-left:-6px"></div>',
  help: [
    'Each player gets two cards. Five shared cards are dealt in the middle: three on the flop, then the turn and the river. Make the best five-card hand from your two and the five on the table.',
    'In each round you can <b>Fold</b> (give up), <b>Check</b> (pass when nobody has bet), <b>Call</b> (match the bet) or <b>Raise</b> (use the slider). <b>All in</b> puts in every chip you have at the table.',
    'Hands from best to worst: royal flush, straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, one pair, high card.',
    'You buy in from your chips and play against three computer players: a tight one who only plays good hands, a loose one who plays lots of hands, and a tricky one who bluffs and slow-plays. The blinds rise every 10 hands. Cash out between hands to take your stack back.',
  ],
  create(ctx) {
    const { wallet, ui, sfx, buzz } = ctx;
    const root = ctx.root;
    let game = null, buyin = 0, timer = 0, lastAct = {}, showdown = false, nameIdx = 0;
    const wait = (ms) => new Promise((r) => { timer = setTimeout(r, ms); });

    function lobby() {
      game = null;
      const have = wallet.get();
      const opts = [200, 500, 1000, 2500].filter((v) => v <= Math.max(have, 200));
      if (have >= 50 && have < 200) opts.unshift(have); // a short stack can still sit down with what it has
      root.innerHTML = `<div class="he-table" style="display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px">
        <div class="cs-label">Choose your buy-in</div>
        <div class="cs-row-btns">${opts.map((v) => `<button class="cs-btn ${v === opts[Math.min(1, opts.length - 1)] ? 'gold' : ''}" data-buy="${v}">${ui.fmt(v)}</button>`).join('')}</div>
        <p class="cs-note">Blinds start at 5/10 and rise every 10 hands. You can cash out between hands.</p></div>`;
    }
    async function sit(v) {
      if (!(await ui.needChips(ctx, v))) return;
      if (!ctx.alive() || !wallet.take(v)) return;
      buyin = v; sfx.place();
      const players = [{ name: 'You', stack: v }];
      STYLE_ORDER.forEach((s) => players.push({ name: NAMES[nameIdx++ % NAMES.length], stack: v, style: s }));
      game = new Holdem(players);
      nextHand();
    }
    function cashOut(silent) {
      if (!game) return;
      const stack = game.p[0].stack; game.p[0].stack = 0;
      if (stack) wallet.give(stack);
      const net = stack - buyin;
      ctx.stats.record(net > 0 ? 'win' : net < 0 ? 'lose' : 'push', net);
      if (!silent) { ui.banner(root, net >= 0 ? { text: 'Cashed out', amount: net, win: net > 0 } : { text: 'Cashed out', amount: net }); }
      game = null;
    }

    async function nextHand() {
      if (!ctx.alive() || !game) return;
      // replace any computer player who has gone broke, so there are always three rivals
      game.p.forEach((p, i) => { if (i && p.stack <= 0) { p.stack = buyin; p.name = NAMES[nameIdx++ % NAMES.length]; } });
      if (game.p[0].stack <= 0) return busted();
      lastAct = {}; showdown = false;
      game.startHand();
      render();
      loop();
    }
    async function loop() {
      while (game && !game.over && game.toAct > 0) {
        render(); await wait(650 + Math.random() * 450);
        if (!ctx.alive() || !game) return;
        const i = game.toAct, a = game.decide(i), before = game.contrib[i];
        game.act(i, a);
        lastAct[i] = a.type === 'raise' ? (game.allin[i] ? 'All in' : `Raise ${game.bet[i] || game.contrib[i] - before}`) : a.type === 'call' ? 'Call' : a.type === 'check' ? 'Check' : 'Fold';
        if (a.type === 'raise' || a.type === 'call') sfx.place(); else if (a.type === 'fold') sfx.erase(); else sfx.tap();
      }
      if (!game) return;
      if (game.over) return handOver();
      render(); // the human's turn
    }
    function human(type, to) {
      if (!game || game.over || game.toAct !== 0) return;
      game.act(0, { type, to });
      lastAct[0] = type === 'raise' ? (game.allin[0] ? 'All in' : `Raise to ${to}`) : type[0].toUpperCase() + type.slice(1);
      if (type === 'raise' || type === 'call') sfx.place(); else if (type === 'fold') sfx.erase(); else sfx.tap();
      loop();
    }
    async function handOver() {
      showdown = game.result.showdown;
      render();
      const won = game.result.won[0] || 0, put = game.contrib[0];
      if (won > put) { ui.banner(root, { text: game.result.hands[0] ? game.result.hands[0].name : 'You win the pot', amount: won - put, win: true, ms: 2200 }); buzz(30); }
      else if (game.result.showdown && put) sfx.error();
    }
    function busted() {
      root.querySelector('.he-actions').innerHTML = `${ui.button('Buy in again', 'gold')}${ui.button('Leave table')}`;
      root.querySelector('.he-msg').textContent = 'You are out of chips at this table.';
      cashOut(true);
    }

    function seatHTML(i, me) {
      const p = game.p[i], live = !game.folded[i] && game.inHand[i];
      const reveal = me || (showdown && live && game.over);
      const winHand = game.over && game.result.hands[i];
      const hl = winHand && game.result.won[i] ? winHand.best : [];
      const cards = game.hole[i].length ? game.hole[i].map((c) => ui.cardHTML(c, { faceDown: !reveal, cls: hl.includes(c) ? 'hl' : !live ? 'dim' : '' })).join('') : '';
      return `<div class="he-seat ${game.toAct === i ? 'turn' : ''} ${!game.inHand[i] || game.folded[i] ? 'out' : ''}">
        ${game.dealer === i ? '<span class="dl">D</span>' : ''}
        <div><div class="nm">${p.name}</div>${p.style ? `<div class="sty">${STYLES[p.style].name}</div>` : ''}<div class="stk">${ui.fmt(p.stack)}</div></div>
        <div class="cs-hand">${cards}</div>
        ${game.over && game.result.won[i] ? `<span class="act">Wins ${ui.fmt(game.result.won[i])}</span>` : lastAct[i] ? `<span class="act">${lastAct[i]}</span>` : ''}</div>`;
    }
    function render() {
      if (!game) return;
      const o = game.toAct === 0 && !game.over ? game.options(0) : null;
      const winners = game.over ? Object.keys(game.result.won).map(Number) : [];
      const boardHl = game.over && winners.length && game.result.hands[winners[0]] ? game.result.hands[winners[0]].best : [];
      const msg = game.over
        ? winners.map((w) => `${game.p[w].name} ${w ? 'wins' : 'win'} ${ui.fmt(game.result.won[w])}${game.result.hands[w] ? ` with ${game.result.hands[w].name.toLowerCase()}` : ''}`).join(', ')
        : o ? (o.canCheck ? 'Your move' : `${ui.fmt(o.toCall)} to call`) : `${game.p[game.toAct]?.name || ''} is thinking`;
      const step = game.blinds[1];
      root.innerHTML = `<div class="he-table">
        <div class="he-opps">${[1, 2, 3].map((i) => seatHTML(i)).join('')}</div>
        <div class="he-mid"><div class="cs-label">${STREETS[game.street]} · Blinds ${game.blinds[0]}/${game.blinds[1]} · Hand ${game.handNo}</div>
          <div class="he-board">${game.board.map((c) => ui.cardHTML(c, { cls: boardHl.includes(c) ? 'hl' : '' })).join('')}</div>
          <div class="he-pot"><img src="${ui.chipImg(500)}" alt="">Pot ${ui.fmt(game.pot())}</div></div>
        <div class="he-me">${seatHTML(0, true)}<div class="he-msg">${msg}</div>
          ${o && o.canRaise ? `<div class="he-raise"><span>Raise</span><input type="range" min="${o.minTo}" max="${o.maxTo}" step="${Math.max(1, Math.floor(step / 2))}" value="${o.minTo}"><b>${ui.fmt(o.minTo)}</b></div>` : ''}
          <div class="cs-row-btns he-actions">${o ? `${ui.button('Fold', 'red')}${ui.button(o.canCheck ? 'Check' : `Call ${ui.fmt(o.toCall)}`)}${o.canRaise ? ui.button('Raise', 'gold') + ui.button('All in') : ''}`
            : game.over ? `${ui.button('Next hand', 'gold')}${ui.button('Cash out')}` : ''}</div></div></div>`;
      const r = root.querySelector('.he-raise input');
      if (r) r.oninput = () => { root.querySelector('.he-raise b').textContent = ui.fmt(+r.value); };
    }

    root.addEventListener('click', (e) => {
      const buy = e.target.closest('[data-buy]');
      if (buy) return sit(+buy.dataset.buy);
      const b = e.target.closest('.cs-btn'); if (!b) return;
      const t = b.textContent;
      if (t === 'Fold') human('fold');
      else if (t === 'Check') human('check');
      else if (t.startsWith('Call')) human('call');
      else if (t === 'Raise') human('raise', +root.querySelector('.he-raise input').value);
      else if (t === 'All in') human('raise', game.options(0).maxTo);
      else if (t === 'Next hand') nextHand();
      else if (t === 'Cash out') { cashOut(); lobby(); }
      else if (t === 'Buy in again' || t === 'Leave table') lobby();
    });
    lobby();
    return { destroy() { clearTimeout(timer); cashOut(true); } };
  },
};
