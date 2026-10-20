// Shared Casino Night pieces: balance pill, chip picker, chip stacks, cards with deal and flip animations, win banners.
import { el, $, $$, dialog, toast } from '../ui.js';
import { sfx } from '../sound.js';
import { wallet, canTopUp, topUp, MIN_BET, TOPUP_TO } from './wallet.js';
import { cardCode } from './cards-engine.js';

export const CHIPS = [5, 25, 100, 500, 1000];
export const chipImg = (v) => `img/casino/chip_${v}.webp`;
export const cardImg = (c) => `img/casino/card_${cardCode(c)}.webp`;
export const cardBack = () => 'img/casino/card_back.webp';
export const fmt = (n) => Math.round(n).toLocaleString('en-AU');

// A pill showing the chip balance; it updates itself and stops when removed from the page.
export function balancePill() {
  const n = el(`<div class="cs-balance"><img src="${chipImg(100)}" alt=""><b></b></div>`);
  const b = $('b', n);
  let shown = wallet.get();
  b.textContent = fmt(shown);
  const off = wallet.onChange((v) => {
    if (!n.isConnected) { off(); return; }
    const from = shown, t0 = performance.now(); shown = v;
    n.classList.remove('up', 'down'); void n.offsetWidth; n.classList.add(v >= from ? 'up' : 'down');
    const step = (now) => { const t = Math.min(1, (now - t0) / 500); b.textContent = fmt(from + (v - from) * t); if (t < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  return n;
}

// Row of tappable chips. onPick(value) fires on every tap; selected() is the last chip chosen.
export function betPicker({ onPick, values = CHIPS } = {}) {
  let sel = values[0];
  const n = el(`<div class="cs-picker">${values.map((v) => `<button class="cs-chip ${v === sel ? 'on' : ''}" data-v="${v}" aria-label="${v} chip"><img src="${chipImg(v)}" alt=""><span>${v >= 1000 ? v / 1000 + 'K' : v}</span></button>`).join('')}</div>`);
  n.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    sel = +b.dataset.v; $$('.cs-chip', n).forEach((x) => x.classList.toggle('on', x === b));
    sfx.tap(); onPick && onPick(sel);
  });
  n.selected = () => sel;
  return n;
}

// Html for a stack of chip images making up `amount` (largest chips first, at most 8 shown).
export function chipStack(amount) {
  if (!amount) return '';
  const out = []; let left = amount;
  for (const v of [...CHIPS].reverse()) while (left >= v && out.length < 8) { out.push(v); left -= v; }
  out.reverse();
  return `<div class="cs-stack" style="height:${40 + (out.length - 1) * 5}px">${out.map((v, i) => `<img src="${chipImg(v)}" alt="" style="bottom:${i * 5}px">`).join('')}<b>${fmt(amount)}</b></div>`;
}

export function cardHTML(card, { faceDown = false, cls = '' } = {}) {
  return `<div class="cs-card ${faceDown ? 'down' : ''} ${cls}"><img class="f" src="${card ? cardImg(card) : cardBack()}" alt=""><img class="b" src="${cardBack()}" alt=""></div>`;
}
// Appends a card that slides in from the shoe (top right). Returns the card element.
export function dealCard(container, card, { faceDown = false, delay = 0, cls = '' } = {}) {
  const c = el(cardHTML(card, { faceDown, cls }));
  c.style.animationDelay = `${delay}ms`;
  c.classList.add('deal');
  container.appendChild(c);
  setTimeout(() => sfx.note(), delay);
  return c;
}
export function flipCard(cardEl, card) {
  if (card) $('.f', cardEl).src = cardImg(card);
  cardEl.classList.remove('down'); cardEl.classList.add('flip');
  sfx.tap();
}

// A banner over the table: a counting amount for wins, a short message otherwise. Fades after a moment.
export function banner(root, { text, amount = 0, win = false, ms = 1700 }) {
  root.querySelector('.cs-banner')?.remove();
  const n = el(`<div class="cs-banner ${win ? 'cs-won' : 'cs-lost'}"><b>${text}</b>${amount ? '<span></span>' : ''}</div>`);
  root.appendChild(n);
  if (amount) {
    const s = $('span', n), t0 = performance.now();
    const step = (now) => { const t = Math.min(1, (now - t0) / 700); s.textContent = `${amount > 0 ? '+' : ''}${fmt(amount * t)}`; if (t < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  if (win) sfx.unit();
  setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 400); }, ms);
  return n;
}

export const button = (label, cls = '') => `<button class="cs-btn ${cls}">${label}</button>`;

// Checks there are enough chips for a bet. When the balance is below the smallest bet, offers the free top-up.
export async function needChips(ctx, n) {
  if (wallet.canAfford(n)) return true;
  if (canTopUp()) {
    const v = await dialog({ hero: chipImg(1000), title: 'Out of chips', text: `Have a free top-up to ${fmt(TOPUP_TO)} chips. These are play chips only, so there is nothing to pay.`,
      buttons: [{ label: 'Top me up', value: true }, { label: 'Not now', value: false, cls: 'ghost' }] });
    if (v) { topUp(); sfx.win(); return wallet.canAfford(n); }
    return false;
  }
  toast(`Not enough chips for that bet (you have ${fmt(wallet.get())})`);
  return false;
}

export { MIN_BET };
