// Casino Night: card and table games played with free play chips. No real money, no purchases, no ads.
//
// Game module API (also in www/js/casino/README.md):
//   www/js/casino/g-<id>.js exports default { id, name, tag, art: () => html, help: [paragraphs], create(ctx) }
//   ctx = { root (element to fill), wallet (wallet.js), ui (all of ui.js), sfx, buzz, toast,
//           stats: { record(result 'win' | 'lose' | 'push', netChips) }, alive() }
//   create returns { destroy() }. Games must take and give chips only through ctx.wallet.
//   Games load from GAME_IDS by dynamic import; a missing or broken file is skipped.
import { store, save } from '../store.js';
import { icon } from '../icons.js';
import { el, $, sheet, toast } from '../ui.js';
import { sfx, buzz } from '../sound.js';
import { wallet, canTopUp, topUp, record, TOPUP_TO } from './wallet.js';
import * as ui from './ui.js';

const GAME_IDS = ['blackjack', 'holdem', 'roulette', 'craps', 'baccarat', 'videopoker', 'pokies'];
export const CASINO_GAMES = [];
let loading = null;
function loadGames() {
  if (!loading) {
    loading = Promise.allSettled(GAME_IDS.map((id) => import(`./g-${id}.js`))).then((rs) => {
      CASINO_GAMES.length = 0;
      rs.forEach((r, k) => {
        if (r.status === 'fulfilled' && r.value.default && r.value.default.create) CASINO_GAMES.push(r.value.default);
        else console.warn('Casino Night: could not load', GAME_IDS[k], r.reason);
      });
      return CASINO_GAMES;
    });
  }
  return loading;
}
const gameById = (id) => CASINO_GAMES.find((g) => g.id === id);
const CB = () => store.casino || (wallet.get(), store.casino); // wallet.get() creates the defaults
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const casinoHelp = () => sheet(`<h2>Casino Night</h2><div class="help-body">
  <p>Blackjack, Texas Hold'em, roulette, craps, baccarat, video poker and pokies, all sharing one pile of chips.</p>
  <p>Pick a chip, tap the betting spot to place it, then deal or spin. Each game has its own How to play.</p>
  <p>Run out of chips and you can have a free top-up to ${ui.fmt(TOPUP_TO)} whenever you like.</p>
  <p class="cs-note">Play chips only. No real money is used or won.</p>
  </div><button class="btn cs-gold-btn" data-x>Got it</button>`, { onMount: (n, close) => { $('[data-x]', n).onclick = close; } });

// Landing card art: a fanned pair of aces over a little chip stack.
export const casinoCardArt = () => `<div class="art-casino">
  <img class="c1" src="img/casino/card_AS.webp" alt=""><img class="c2" src="img/casino/card_AH.webp" alt="">
  <img class="ch1" src="img/casino/chip_5.webp" alt=""><img class="ch2" src="img/casino/chip_100.webp" alt=""><img class="ch3" src="img/casino/chip_500.webp" alt=""></div>`;

export function casinoHubScreen(app) {
  const root = el(`<section class="screen casino-theme casino-hub">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title"></div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  async function render() {
    if (!CASINO_GAMES.length) body.innerHTML = '<div class="cs-loading"><div class="spinner"></div></div>';
    await loadGames();
    const st = CB().stats || {};
    body.innerHTML = `<div class="cs-hero">${casinoCardArt()}</div><h1 class="cs-title">Casino Night</h1>
      <div class="cs-bal-row"></div>
      ${canTopUp() ? `<button class="btn cs-gold-btn" data-act="topup">Free top-up to ${ui.fmt(TOPUP_TO)} chips</button>` : ''}
      <div class="cs-grid">${CASINO_GAMES.map((g) => `<button class="cs-card-btn" data-id="${g.id}">
        ${st[g.id]?.played ? '' : '<span class="new-badge">New</span>'}
        <div class="cs-art">${g.art()}</div><div class="cs-name">${esc(g.name)}</div><div class="cs-tag">${esc(g.tag)}</div>
        ${st[g.id]?.played ? `<div class="cs-played">${st[g.id].played} played</div>` : ''}</button>`).join('')}</div>
      <p class="cs-note">Play chips only. No real money is used or won. Best balance ${ui.fmt(CB().best || 0)}.</p>`;
    $('.cs-bal-row', body).appendChild(ui.balancePill());
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return casinoHelp();
    if (a === 'topup') { topUp(); sfx.win(); toast('Topped up. Good luck'); return render(); }
    const c = e.target.closest('[data-id]');
    if (c) { sfx.tap(); app.go('casinogame', { id: c.dataset.id }); }
  });
  render();
  if (!CB().seenHelp) { CB().seenHelp = true; save(); setTimeout(casinoHelp, 350); }
  return { root, refresh: render };
}

export function casinoGameScreen(app, { id }) {
  const root = el(`<section class="screen casino-theme casino-game cs-g-${id}">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title"></div>
      <div class="cs-top-bal"></div><button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="cs-stage"></div></section>`);
  const stage = $('.cs-stage', root);
  $('.cs-top-bal', root).appendChild(ui.balancePill());
  let inst = null, alive = true, game = null;
  const help = () => game && sheet(`<h2>How to play ${esc(game.name)}</h2><div class="help-body">${game.help.map((p) => `<p>${p}</p>`).join('')}
    <p class="cs-note">Play chips only. No real money is used or won.</p></div><button class="btn cs-gold-btn" data-x>Got it</button>`,
    { onMount: (n, close) => { $('[data-x]', n).onclick = close; } });
  loadGames().then(() => {
    if (!alive) return;
    game = gameById(id);
    if (!game) { stage.innerHTML = '<p class="cs-note">This game could not load.</p>'; return; }
    $('.title', root).textContent = game.name;
    const ctx = { root: stage, wallet, ui, sfx, buzz, toast, stats: { record: (result, net) => record(id, result, net) }, alive: () => alive };
    try { inst = game.create(ctx); } catch (err) { console.error(err); stage.innerHTML = '<p class="cs-note">This game could not start.</p>'; }
    const seen = CB().seenGames || (CB().seenGames = {});
    if (!seen[id]) { seen[id] = true; save(); setTimeout(help, 300); }
  });
  root.addEventListener('click', (e) => {
    const a = e.target.closest('.topbar [data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') help();
  });
  return { root, destroy() { alive = false; try { inst?.destroy(); } catch (err) { console.error(err); } } };
}
