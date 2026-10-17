// Spider Solitaire: build King-to-Ace runs in one suit to clear them. One, two or four suits.
import { store, save, fmtTime } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, sheet, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet } from './kit.js';
import { SUITS, RANKS } from './solitaire-engine.js';

const FACE_ART = { 11: 'cat02', 12: 'cat04', 13: 'cat14' };
const SP = () => store.spider;
const SUIT_SETS = { 1: [0], 2: [0, 1], 4: [0, 1, 2, 3] };
export const spiderHelp = () => helpSheet('How to play Spider Solitaire', [
  'Build runs from King down to Ace in one suit. A finished run lifts off the table.',
  'You can put any card on a card one higher. Only runs of one suit can be moved together.',
  'Tap the stock to deal a new card onto every column. Every column needs at least one card first.',
  'Clear all eight runs to win.',
], 'spider-btn');

const isRedSuit = (s) => s === 1 || s === 2;
function newGame(suits) {
  const set = SUIT_SETS[suits];
  const cards = [];
  for (let k = 0; k < 104; k++) cards.push({ id: k, s: set[k % set.length === 0 ? 0 : k % set.length], r: (k % 13) + 1, up: false });
  // fix suit spread: equal numbers of each suit
  cards.forEach((c, k) => { c.s = set[Math.floor(k / 13) % set.length]; });
  for (let i = cards.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [cards[i], cards[j]] = [cards[j], cards[i]]; }
  const tab = [...Array(10)].map(() => []);
  let p = 0;
  for (let col = 0; col < 10; col++) { const n = col < 4 ? 6 : 5; for (let k = 0; k < n; k++) tab[col].push(cards[p++]); tab[col][tab[col].length - 1].up = true; }
  return { suits, tab, stock: cards.slice(p), done: 0, score: 500, moves: 0, elapsed: 0 };
}

function cardHtml(c) {
  const red = isRedSuit(c.s) ? ' red' : '';
  const centre = FACE_ART[c.r] ? `<img class="face-art" src="img/cats/${FACE_ART[c.r]}.png" alt="">${c.r >= 12 ? '<img class="face-crown" src="img/ui/crown.png" alt="">' : ''}` : `<span class="pip">${SUITS[c.s]}</span>`;
  return `<div class="pcard${red}" data-id="${c.id}"><div class="front"><span class="corner">${RANKS[c.r - 1]}<i>${SUITS[c.s]}</i></span>${centre}</div><div class="back"></div></div>`;
}

export function spiderHomeScreen(app) {
  const root = el(`<section class="screen sol-theme spider-home">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title"></div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  function render() {
    const sp = SP();
    body.innerHTML = `<div class="kit-hero"><img src="img/ui/spider.png" alt=""></div><h1 class="kit-title" style="color:#fff">Spider Solitaire</h1>
      ${sp.current ? `<button class="btn sol-btn" data-act="continue">Continue game<small>${sp.current.suits} suit${sp.current.suits > 1 ? 's' : ''} · ${sp.current.done}/8 runs</small></button>` : ''}
      ${[1, 2, 4].map((n) => `<button class="mines-level spider-level" data-s="${n}"><b>${n} suit${n > 1 ? 's' : ''}</b><span>${n === 1 ? 'Relaxing' : n === 2 ? 'A good challenge' : 'For experts'}</span><em>${sp.won[n] || 0} won</em></button>`).join('')}`;
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return spiderHelp();
    if (a === 'continue') return app.go('spidergame', {});
    const b = e.target.closest('[data-s]');
    if (b) { SP().current = null; app.go('spidergame', { suits: +b.dataset.s }); }
  });
  render();
  return { root, refresh: render };
}

export function spiderGameScreen(app, { suits }) {
  const sp = SP();
  let g = sp.current && !suits ? sp.current : newGame(suits || 1);
  if (suits) sp.played[suits] = (sp.played[suits] || 0) + 1;
  let history = [], tick = null, done = false, lay = null;
  const root = el(`<section class="screen sol-theme spider-game">
    <header class="topbar sol-top"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="sol-stats"><span>Score <b data-el="score"></b></span><span>Runs <b data-el="runs"></b></span><span data-el="time"></span></div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="sol-table" data-el="table"></div>
    <div class="sol-bar">
      <button class="sol-tool" data-act="hint">${icon.bulb}<span>Hint</span></button>
      <button class="sol-tool" data-act="undo">${icon.undo}<span>Undo</span></button>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const table = q('table');
  const els = new Map();
  const all = () => [...g.tab.flat(), ...g.stock];

  function measure() {
    const W = table.clientWidth, H = table.clientHeight, gap = 3;
    const cw = Math.floor((W - gap * 11) / 10), ch = Math.round(cw * 1.42);
    table.style.setProperty('--cw', cw + 'px'); table.style.setProperty('--ch', ch + 'px');
    lay = { W, H, gap, cw, ch, x: (i) => gap + i * (cw + gap), top: gap + ch + 10 };
  }
  function mount() {
    table.innerHTML = '<div class="spider-stock" data-act="deal"></div><div class="spider-found" data-el="found"></div>';
    els.clear();
    // cards removed in finished runs are not in the game any more; build elements for the rest
    for (const c of all()) { const n = el(cardHtml(c)); table.appendChild(n); els.set(c.id, n); }
  }
  function render() {
    const L = lay;
    const stockEl = $('.spider-stock', table);
    stockEl.style.transform = `translate(${L.x(9)}px, ${L.gap}px)`;
    stockEl.innerHTML = [...Array(Math.ceil(g.stock.length / 10))].map((_, i) => `<div class="pcard down" style="position:absolute;left:${-i * 6}px;top:0"><div class="back"></div></div>`).join('');
    q('found').style.transform = `translate(${L.x(0)}px, ${L.gap}px)`;
    q('found').innerHTML = [...Array(g.done)].map((_, i) => `<div class="pcard" style="position:absolute;left:${i * 10}px"><div class="front"><span class="corner">K<i>${SUITS[g.foundSuits ? g.foundSuits[i] : 0]}</i></span><span class="pip">${SUITS[g.foundSuits ? g.foundSuits[i] : 0]}</span></div></div>`).join('');
    g.stock.forEach((c) => { const n = els.get(c.id); n.style.transform = `translate(${L.x(9)}px,${L.gap}px)`; n.classList.add('down'); n.style.zIndex = 1; n.style.visibility = 'hidden'; });
    const avail = L.H - L.top - L.ch - 6;
    g.tab.forEach((col, ci) => {
      let dn = L.ch * 0.12, upo = L.ch * 0.27;
      const need = col.filter((c) => !c.up).length * dn + Math.max(0, col.filter((c) => c.up).length - 1) * upo;
      if (need > avail) { const k = avail / need; dn *= k; upo *= k; }
      let y = L.top;
      col.forEach((c, k) => {
        const n = els.get(c.id);
        n.style.visibility = '';
        n.style.transform = `translate(${L.x(ci)}px,${y}px)`;
        n.style.zIndex = 10 + k;
        n.classList.toggle('down', !c.up);
        y += c.up ? upo : dn;
      });
    });
    q('score').textContent = g.score; q('runs').textContent = `${g.done}/8`; q('time').textContent = fmtTime(g.elapsed);
    $('[data-act="undo"]', root).disabled = !history.length;
  }

  const snapshot = () => JSON.parse(JSON.stringify(g));
  const runLen = (col, k) => { for (let j = k; j < col.length - 1; j++) if (!col[j + 1].up || col[j + 1].s !== col[j].s || col[j + 1].r !== col[j].r - 1) return false; return col[k].up; };
  const canDrop = (col, card) => !col.length || col[col.length - 1].r === card.r + 1;

  function moveRun(from, k, to) {
    const src = g.tab[from];
    if (from === to || !runLen(src, k) || !canDrop(g.tab[to], src[k])) return false;
    history.push(snapshot()); if (history.length > 200) history.shift();
    const run = src.splice(k);
    g.tab[to].push(...run);
    if (src.length && !src[src.length - 1].up) src[src.length - 1].up = true;
    g.moves++; g.score = Math.max(0, g.score - 1);
    sfx.tap();
    checkRun(to);
    render(); persist();
    checkWin();
    return true;
  }

  function checkRun(ci) {
    const col = g.tab[ci];
    if (col.length < 13) return;
    const run = col.slice(-13);
    if (run.every((c, k) => c.up && c.s === run[0].s && c.r === 13 - k)) {
      col.splice(-13);
      run.forEach((c) => { const n = els.get(c.id); n.classList.add('lifted-off'); setTimeout(() => { n.remove(); els.delete(c.id); }, 450); });
      g.done++; (g.foundSuits ||= []).push(run[0].s);
      g.score += 100;
      if (col.length && !col[col.length - 1].up) col[col.length - 1].up = true;
      sfx.unit(); buzz(25); toast('Run complete!');
    }
  }

  function deal() {
    if (!g.stock.length) { toast('No more cards to deal'); return; }
    if (g.tab.some((c) => !c.length)) { toast('Fill every empty column before dealing'); buzz(20); return; }
    history.push(snapshot());
    for (let ci = 0; ci < 10; ci++) { const c = g.stock.shift(); c.up = true; g.tab[ci].push(c); }
    sfx.cross();
    for (let ci = 0; ci < 10; ci++) checkRun(ci);
    render(); persist();
  }

  function bestTarget(from, k) {
    const card = g.tab[from][k];
    const opts = [...Array(10).keys()].filter((t) => t !== from && canDrop(g.tab[t], card));
    if (!opts.length) return -1;
    opts.sort((a, b) => {
      const score = (t) => { const col = g.tab[t]; if (!col.length) return 0; return col[col.length - 1].s === card.s ? 3 : 2; };
      return score(b) - score(a);
    });
    return opts[0];
  }
  function hint() {
    for (let from = 0; from < 10; from++) {
      const col = g.tab[from];
      for (let k = 0; k < col.length; k++) {
        if (!runLen(col, k)) continue;
        const t = bestTarget(from, k);
        // skip pointless moves onto an empty column when the run is already the whole column
        if (t >= 0 && !(g.tab[t].length === 0 && k === 0)) {
          col.slice(k).forEach((c) => els.get(c.id).classList.add('hinted'));
          const dest = g.tab[t].length ? els.get(g.tab[t][g.tab[t].length - 1].id) : null;
          dest && dest.classList.add('hinted');
          setTimeout(() => $$('.hinted', table).forEach((n) => n.classList.remove('hinted')), 1800);
          sfx.hint(); return;
        }
      }
    }
    if (g.stock.length) { toast('Deal more cards from the stock'); $('.spider-stock', table).classList.add('hinted'); setTimeout(() => $('.spider-stock', table).classList.remove('hinted'), 1800); }
    else toast('No moves left. Try undo.');
  }

  // tap or drag
  let drag = null;
  const locate = (id) => { for (let ci = 0; ci < 10; ci++) { const k = g.tab[ci].findIndex((c) => c.id === id); if (k >= 0) return [ci, k]; } return null; };
  table.addEventListener('pointerdown', (e) => {
    if (done) return;
    if (e.target.closest('.spider-stock')) { deal(); return; }
    const n = e.target.closest('.pcard[data-id]'); if (!n || n.classList.contains('down')) return;
    const loc = locate(+n.dataset.id); if (!loc) return;
    const [ci, k] = loc;
    if (!runLen(g.tab[ci], k)) { n.classList.remove('nope'); void n.offsetWidth; n.classList.add('nope'); buzz(15); return; }
    table.setPointerCapture(e.pointerId);
    const cards = g.tab[ci].slice(k).map((c) => { const el2 = els.get(c.id); const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el2.style.transform); return { n: el2, x: +m[1], y: +m[2] }; });
    drag = { ci, k, cards, x0: e.clientX, y0: e.clientY, moved: false };
  });
  table.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < 8) return;
    drag.moved = true;
    drag.cards.forEach(({ n, x, y }, i) => { n.classList.add('dragging'); n.style.zIndex = 500 + i; n.style.transform = `translate(${x + dx}px,${y + dy}px)`; });
  });
  const end = (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    d.cards.forEach(({ n }) => n.classList.remove('dragging'));
    if (!d.moved) { const t = bestTarget(d.ci, d.k); if (t < 0 || !moveRun(d.ci, d.k, t)) { buzz(15); render(); } return; }
    const r = table.getBoundingClientRect();
    const col = Math.max(0, Math.min(9, Math.floor((e.clientX - r.left) / (lay.cw + lay.gap))));
    if (!moveRun(d.ci, d.k, col)) render();
  };
  table.addEventListener('pointerup', end);
  table.addEventListener('pointercancel', end);

  function persist() { sp.current = g; save(); }

  async function checkWin() {
    if (g.done < 8 || done) return;
    done = true; stopTimer();
    sp.won[g.suits] = (sp.won[g.suits] || 0) + 1;
    sp.best[g.suits] = Math.max(sp.best[g.suits] || 0, g.score);
    sp.current = null; save(true);
    sfx.win(); confetti(3000);
    const v = await dialog({ hero: 'img/ui/spider.png', title: 'You won!', dismissible: false, text: `Score ${g.score} · ${g.moves} moves · ${fmtTime(g.elapsed)}`, buttons: [{ label: 'New game', value: 'new' }, { label: 'Back', value: 'back', cls: 'ghost' }] });
    if (v === 'new') app.replace('spidergame', { suits: g.suits }); else app.back();
  }

  function startTimer() { stopTimer(); if (!done) tick = setInterval(() => { g.elapsed++; q('time').textContent = fmtTime(g.elapsed); if (g.elapsed % 5 === 0) persist(); }, 1000); }
  function stopTimer() { clearInterval(tick); tick = null; }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') spiderHelp();
    else if (a === 'hint') hint();
    else if (a === 'undo' && history.length) { g = history.pop(); mount(); render(); persist(); sfx.erase(); }
  });
  const onResize = () => { measure(); render(); };
  window.addEventListener('resize', onResize);
  requestAnimationFrame(() => { measure(); mount(); render(); persist(); startTimer(); if (!sp.seenHelp) { sp.seenHelp = true; save(); setTimeout(spiderHelp, 400); } });
  return { root, destroy() { stopTimer(); window.removeEventListener('resize', onResize); if (!done) persist(); save(true); }, onHide() { stopTimer(); }, onShow() { startTimer(); } };
}
