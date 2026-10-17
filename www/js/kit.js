// Shared building blocks for game screens: a home screen with a level map, and help sheets.
import { el, $, sheet } from './ui.js';
import { icon } from './icons.js';

export function helpSheet(title, paras, btnCls = '') {
  sheet(`<h2>${title}</h2><div class="help-body">${paras.map((p) => `<p>${p}</p>`).join('')}</div><button class="btn ${btnCls}" data-x>Got it</button>`,
    { onMount: (n, close) => { $('[data-x]', n).onclick = close; } });
}

// opts: {app, cls, title, hero (html), play: () => ({label, sub}), onPlay, levels?: () => ({count, current, done(i), label(i)}), onLevel, help, extra?: () => html}
export function levelHome(opts) {
  const root = el(`<section class="screen ${opts.cls}">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title"></div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  async function render() {
    if (opts.load) await opts.load();
    const p = opts.play();
    let levels = '';
    if (opts.levels) {
      const L = opts.levels();
      levels = `<div class="section-title">${L.heading || 'Levels'}</div><div class="kit-levels">${[...Array(L.count)].map((_, i) => `<button class="kit-level ${L.done(i) ? 'done' : ''} ${i === L.current ? 'current' : ''}" data-idx="${i}" ${i > L.current && !L.done(i) ? 'disabled' : ''}>${L.label ? L.label(i) : i + 1}</button>`).join('')}</div>`;
    }
    body.innerHTML = `<div class="kit-hero">${opts.hero}</div><h1 class="kit-title">${opts.title}</h1>
      <button class="btn kit-btn" data-act="play">${p.label}${p.sub ? `<small>${p.sub}</small>` : ''}</button>
      ${opts.extra ? opts.extra() : ''}${levels}`;
    setTimeout(() => $('.kit-level.current', body)?.scrollIntoView({ block: 'center' }), 0);
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return opts.app.back();
    if (a === 'help') return opts.help();
    if (a === 'play') return opts.onPlay();
    if (opts.onExtra && e.target.closest('[data-extra]')) return opts.onExtra(e.target.closest('[data-extra]').dataset.extra);
    const b = e.target.closest('[data-idx]');
    if (b && opts.onLevel) opts.onLevel(+b.dataset.idx);
  });
  render();
  return { root, refresh: render };
}
