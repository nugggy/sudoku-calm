// Shared bits for the turn-based Play Together games: the player bar, a pass-the-phone cover and an animation helper.
import { whoName, turnText, esc } from './core.js';

// Player bar across the top of a game: two name chips with a piece swatch and score, and a turn line.
// pieces: [html0, html1] small swatches. Returns { el, set({turn, score, text}) }.
export function playerBar(ctx, pieces) {
  const el = document.createElement('div');
  el.className = 'dg-bar';
  const chip = (p) => `<div class="dg-p" data-p="${p}"><span class="dg-sw">${pieces[p]}</span><span class="dg-n">${whoName(ctx, p)}${!ctx.local && p === ctx.me ? ' <small>(you)</small>' : ''}</span><b class="dg-s"></b></div>`;
  el.innerHTML = `<div class="dg-chips">${chip(0)}${chip(1)}</div><div class="dg-turn"></div>`;
  return {
    el,
    set({ turn = -1, score = null, text = null } = {}) {
      el.querySelectorAll('.dg-p').forEach((c) => {
        const p = +c.dataset.p;
        c.classList.toggle('on', p === turn);
        c.querySelector('.dg-s').textContent = score ? score[p] : '';
      });
      el.querySelector('.dg-turn').innerHTML = text !== null ? text : turn >= 0 ? turnText(ctx, turn) : '';
      el.classList.toggle('mine', turn >= 0 && (ctx.local || turn === ctx.me));
    },
  };
}

// A full cover over the game for pass and play when a player's board must stay hidden (Battleships).
export function passCover(root, name, text, onReady) {
  const c = document.createElement('div');
  c.className = 'dg-cover';
  c.innerHTML = `<div class="dg-cover-box"><svg viewBox="0 0 64 64" class="dg-cover-ic" aria-hidden="true"><rect x="18" y="6" width="28" height="52" rx="5" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="32" cy="50" r="3" fill="currentColor"/><path d="M4 30h10m-4-4 4 4-4 4M60 30H50m4-4-4 4 4 4" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <h2>Pass the phone to ${esc(name)}</h2><p>${esc(text)}</p><button class="btn duo-btn" data-ready>I'm ${esc(name)}, show my board</button></div>`;
  root.appendChild(c);
  c.querySelector('[data-ready]').onclick = () => { c.remove(); onReady && onReady(); };
  return c;
}

// Short helper for a one-off CSS animation class.
export function flash(node, cls, ms = 600) {
  if (!node) return;
  node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls);
  setTimeout(() => node.classList.remove(cls), ms);
}

// Picks the square size so a board of cols x rows fills the space it has.
export function fitBoard(area, board, cols, rows, max = 72) {
  const fit = () => {
    const w = area.clientWidth - 40, h = area.clientHeight - 28;
    if (w <= 0 || h <= 0) return;
    const s = Math.floor(Math.min(w / cols, h / rows, max));
    board.style.setProperty('--cs', s + 'px');
  };
  const ro = new ResizeObserver(fit);
  ro.observe(area);
  fit();
  return () => ro.disconnect();
}
