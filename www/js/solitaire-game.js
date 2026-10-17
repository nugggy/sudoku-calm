// Solitaire (Klondike). Cards are drawn in HTML; each card keeps its element and glides between piles.
import { deal, clone, apply, drawStock, moves, bestTarget, legal, cardsAt, isWon, allFaceUp, suitOf, rankOf, isRed, SUITS, RANKS } from './solitaire-engine.js';
import { store, save, fmtTime } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, sheet, dialog, toast } from './ui.js';
import { sfx, buzz } from './sound.js';

const FACE_ART = { 11: 'cat02', 12: 'cat04', 13: 'cat14' }; // Jack, Queen, King
let deals = null;
async function loadDeals() {
  if (deals) return deals;
  try { deals = await (await fetch('levels/solitaire-deals.json')).json(); } catch { deals = { draw1: [1], draw3: [1] }; }
  return deals;
}
const SOL = () => store.sol;

export function solHelp() {
  sheet(`<h2>How to play Solitaire</h2><div class="help-body">
    <p>Build each suit up from Ace to King on the four spaces at the top right.</p>
    <p>In the seven columns, stack cards downwards in alternating colours, such as a red 7 on a black 8. Only a King can go into an empty column.</p>
    <p>Tap a card to send it to the best place, or drag it. Tap the deck to turn over new cards.</p>
    <p>Every deal can be won. Undo and hints are always free.</p>
  </div><button class="btn sol-btn" data-x>Deal me in</button>`, { onMount: (n, close) => { $('[data-x]', n).onclick = close; } });
}

function cardHtml(c) {
  const r = rankOf(c), s = SUITS[suitOf(c)], red = isRed(c) ? ' red' : '';
  const centre = FACE_ART[r]
    ? `<img class="face-art" src="img/cats/${FACE_ART[r]}.png" alt="">${r === 13 || r === 12 ? '<img class="face-crown" src="img/ui/crown.png" alt="">' : ''}`
    : `<span class="pip">${s}</span>`;
  return `<div class="pcard${red}" data-c="${c}"><div class="front"><span class="corner">${RANKS[r - 1]}<i>${s}</i></span>${centre}<span class="corner br">${RANKS[r - 1]}<i>${s}</i></span></div><div class="back"></div></div>`;
}

export function solitaireScreen(app) {
  const sol = SOL();
  const root = el(`<section class="screen sol-theme">
    <header class="topbar sol-top"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="sol-stats"><span>Score <b data-el="score">0</b></span><span>Moves <b data-el="moves">0</b></span><span data-el="time">00:00</span></div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="sol-table" data-el="table"></div>
    <div class="sol-bar">
      <button class="sol-tool" data-act="new">${icon.plus}<span>New</span></button>
      <button class="sol-tool" data-act="hint">${icon.bulb}<span>Hint</span></button>
      <button class="sol-tool hidden" data-act="auto"><img src="img/ui/sparkles.png" alt=""><span>Auto finish</span></button>
      <button class="sol-tool" data-act="undo">${icon.undo}<span>Undo</span></button>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const table = q('table');
  let g;            // {seed, draw, s, score, moves, elapsed, done}
  let history = [];
  let tick = null, layout = null;
  const cardEls = new Map();

  // ---------- Layout ----------
  function measure() {
    const W = table.clientWidth, H = table.clientHeight;
    const gap = Math.max(4, Math.round(W * 0.012));
    const cw = Math.floor((W - gap * 8) / 7);
    const ch = Math.round(cw * 1.42);
    table.style.setProperty('--cw', cw + 'px');
    table.style.setProperty('--ch', ch + 'px');
    const x = (i) => gap + i * (cw + gap);
    layout = { W, H, gap, cw, ch, x, topY: gap, tabY: gap * 2 + ch + 6 };
  }

  function slots() {
    // empty pile outlines
    $$('.sol-slot', table).forEach((n) => n.remove());
    const L = layout;
    const add = (x, y, cls, inner = '') => { const n = el(`<div class="sol-slot ${cls}" style="transform:translate(${x}px,${y}px)">${inner}</div>`); table.prepend(n); return n; };
    add(L.x(0), L.topY, 'stock', '<span>↻</span>').dataset.pile = 'stock';
    for (let f = 0; f < 4; f++) add(L.x(3 + f), L.topY, 'found', `<span>${SUITS[f]}</span>`).dataset.pile = 'found' + f;
    for (let c = 0; c < 7; c++) add(L.x(c), L.tabY, 'tab', '<span>K</span>').dataset.pile = 'tab' + c;
  }

  // Where every card should be right now.
  function place(dragging = null) {
    const L = layout, s = g.s;
    const pos = new Map();
    let z = 1;
    s.stock.forEach((c, i) => pos.set(c, { x: L.x(0) + Math.min(i, 3) * 0.6, y: L.topY - Math.min(i, 3) * 0.6, up: false, z: z++ }));
    const fan = s.draw === 3 ? Math.round(L.cw * 0.3) : 0;
    const shown = s.draw === 3 ? 3 : 1;
    s.waste.forEach((c, i) => {
      const fromTop = s.waste.length - 1 - i;
      const k = Math.max(0, Math.min(shown, s.waste.length) - 1 - fromTop);
      pos.set(c, { x: L.x(1) + (fromTop < shown ? k * fan : 0), y: L.topY, up: true, z: z++ });
    });
    s.found.forEach((f, fi) => f.forEach((c) => pos.set(c, { x: L.x(3 + fi), y: L.topY, up: true, z: z++ })));
    const avail = L.H - L.tabY - L.ch - 8;
    s.tab.forEach((t, col) => {
      let dn = L.ch * 0.13, upOff = L.ch * 0.3;
      const need = t.down.length * dn + Math.max(0, t.up.length - 1) * upOff;
      if (need > avail) { const k = avail / need; dn *= k; upOff *= k; }
      let y = L.tabY;
      t.down.forEach((c) => { pos.set(c, { x: L.x(col), y, up: false, z: z++ }); y += dn; });
      t.up.forEach((c) => { pos.set(c, { x: L.x(col), y, up: true, z: z++ }); y += upOff; });
    });
    for (const [c, p] of pos) {
      const n = cardEls.get(c);
      if (dragging && dragging.cards.includes(c)) continue;
      n.style.transform = `translate(${p.x}px,${p.y}px)`;
      n.style.zIndex = p.z;
      n.classList.toggle('down', !p.up);
    }
    return pos;
  }

  function render() {
    place();
    q('score').textContent = g.score;
    q('moves').textContent = g.moves;
    q('time').textContent = fmtTime(g.elapsed);
    $('[data-act="auto"]', root).classList.toggle('hidden', !(allFaceUp(g.s) && !g.s.stock.length && !g.s.waste.length) || g.done);
    $('[data-act="undo"]', root).disabled = !history.length;
  }

  function persist() { sol.current = { seed: g.seed, draw: g.draw, s: g.s, score: g.score, moves: g.moves, elapsed: g.elapsed }; save(); }

  function snapshot() { history.push({ s: clone(g.s), score: g.score, moves: g.moves }); if (history.length > 300) history.shift(); }

  function doMove(src, dst) {
    if (!legal(g.s, src, dst)) return false;
    snapshot();
    const r = apply(g.s, src, dst);
    g.score = Math.max(0, g.score + r.score);
    g.moves++;
    if (dst.to === 'found') sfx.place(); else sfx.tap();
    if (r.flipped) setTimeout(() => sfx.note(), 120);
    render(); persist();
    checkWin();
    return true;
  }

  function stockTap() {
    if (!g.s.stock.length && !g.s.waste.length) return;
    snapshot();
    const r = drawStock(g.s);
    g.score = Math.max(0, g.score + r.score);
    g.moves++;
    sfx.cross();
    render(); persist();
  }

  // ---------- Pointer: tap to auto-move, or drag ----------
  let drag = null;
  function srcFromCard(c) {
    const s = g.s;
    if (s.waste.length && s.waste[s.waste.length - 1] === c) return { from: 'waste' };
    for (let f = 0; f < 4; f++) if (s.found[f].length && s.found[f][s.found[f].length - 1] === c) return { from: 'found', suit: f };
    for (let col = 0; col < 7; col++) { const i = s.tab[col].up.indexOf(c); if (i >= 0) return { from: 'tab', col, idx: i }; }
    return null;
  }
  function pileAt(x, y) {
    const L = layout, r = table.getBoundingClientRect();
    const px = x - r.left, py = y - r.top;
    const col = Math.max(0, Math.min(6, Math.floor((px - L.gap / 2) / (L.cw + L.gap))));
    if (py < L.tabY - 4 && col >= 3) return { to: 'found' };
    if (py >= L.tabY - L.ch * 0.3) return { to: 'tab', col };
    return null;
  }
  table.addEventListener('pointerdown', (e) => {
    if (g.done) return;
    const cardEl = e.target.closest('.pcard');
    const slot = e.target.closest('.sol-slot');
    if ((cardEl && cardEl.classList.contains('down') && g.s.stock.includes(+cardEl.dataset.c)) || (slot && slot.dataset.pile === 'stock')) { stockTap(); return; }
    if (!cardEl || cardEl.classList.contains('down')) return;
    const c = +cardEl.dataset.c;
    const src = srcFromCard(c);
    if (!src) return;
    clearHint();
    const cards = cardsAt(g.s, src);
    table.setPointerCapture(e.pointerId);
    const start = cards.map((k) => { const n = cardEls.get(k); const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(n.style.transform); return { n, x: +m[1], y: +m[2] }; });
    drag = { src, cards, start, x0: e.clientX, y0: e.clientY, moved: false };
  });
  table.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < 8) return;
    drag.moved = true;
    drag.start.forEach(({ n, x, y }, i) => { n.classList.add('dragging'); n.style.zIndex = 500 + i; n.style.transform = `translate(${x + dx}px,${y + dy}px)`; });
  });
  const end = (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    d.start.forEach(({ n }) => n.classList.remove('dragging'));
    if (!d.moved) {
      const dst = bestTarget(g.s, d.src);
      if (!dst || !doMove(d.src, dst)) { d.start.forEach(({ n }) => { n.classList.remove('nope'); void n.offsetWidth; n.classList.add('nope'); }); buzz(15); }
      return;
    }
    const dst = pileAt(e.clientX, e.clientY);
    if (!dst || !doMove(d.src, dst)) render();
  };
  table.addEventListener('pointerup', end);
  table.addEventListener('pointercancel', end);

  // ---------- Hints, auto finish, win ----------
  let hintTimer = null;
  function clearHint() { clearTimeout(hintTimer); $$('.hinted', table).forEach((n) => n.classList.remove('hinted')); }
  function hint() {
    clearHint();
    const m = moves(g.s).find((x) => x.w >= 30 || x.dst.to === 'found' || x.src.from === 'waste');
    if (m) {
      cardsAt(g.s, m.src).forEach((c) => cardEls.get(c).classList.add('hinted'));
      const target = m.dst.to === 'found' ? $(`[data-pile="found${suitOf(cardsAt(g.s, m.src)[0])}"]`, table) : (() => { const t = g.s.tab[m.dst.col]; const top = t.up[t.up.length - 1]; return top !== undefined ? cardEls.get(top) : $(`[data-pile="tab${m.dst.col}"]`, table); })();
      target && target.classList.add('hinted');
    } else if (g.s.stock.length || g.s.waste.length) {
      const top = g.s.stock[g.s.stock.length - 1];
      (top !== undefined ? cardEls.get(top) : $('[data-pile="stock"]', table)).classList.add('hinted');
      toast('Turn over a card from the deck');
    } else { toast('No moves left. Try Undo or a new game.'); return; }
    sfx.hint();
    hintTimer = setTimeout(clearHint, 2600);
  }

  async function autoFinish() {
    $('[data-act="auto"]', root).classList.add('hidden');
    for (let guard = 0; guard < 60 && !isWon(g.s); guard++) {
      const m = moves(g.s).find((x) => x.dst.to === 'found');
      if (!m) break;
      snapshot();
      g.score += apply(g.s, m.src, m.dst).score; g.moves++;
      sfx.place();
      render();
      await new Promise((r) => setTimeout(r, 90));
    }
    persist(); checkWin();
  }

  function checkWin() {
    if (!isWon(g.s) || g.done) return;
    g.done = true; stopTimer();
    const st = sol.stats;
    st.won++; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak);
    const newBest = !st.bestTime || g.elapsed < st.bestTime;
    if (newBest) st.bestTime = g.elapsed;
    if (!st.fewestMoves || g.moves < st.fewestMoves) st.fewestMoves = g.moves;
    st.bestScore = Math.max(st.bestScore, g.score);
    sol.current = null;
    save(true);
    sfx.win();
    cascade().then(async () => {
      const v = await dialog({ hero: 'img/ui/trophy.png', title: 'You won!', dismissible: false,
        text: `Score ${g.score} · ${g.moves} moves · ${fmtTime(g.elapsed)}${newBest ? '\nNew best time!' : ''}`,
        buttons: [{ label: 'New game', value: 'new' }, { label: 'Back', value: 'back', cls: 'ghost' }] });
      if (v === 'new') newGame(g.draw); else app.back();
    });
  }

  // The classic bouncing-cards finale, drawn on a canvas.
  function cascade() {
    return new Promise((resolve) => {
      const cv = el('<canvas class="sol-cascade"></canvas>');
      root.appendChild(cv);
      const dpr = window.devicePixelRatio || 1, R = table.getBoundingClientRect();
      cv.width = R.width * dpr; cv.height = R.height * dpr;
      Object.assign(cv.style, { left: table.offsetLeft + 'px', top: table.offsetTop + 'px', width: R.width + 'px', height: R.height + 'px' });
      const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
      const { cw, ch, x, topY } = layout;
      const order = [];
      for (let r = 13; r >= 1; r--) for (let f = 0; f < 4; f++) order.push({ c: f * 13 + r - 1, f });
      const drawCard = (c, px, py) => {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#c9ced8'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px, py, cw, ch, 5) : ctx.rect(px, py, cw, ch); ctx.fill(); ctx.stroke();
        ctx.fillStyle = isRed(c) ? '#d8344a' : '#222';
        ctx.font = `700 ${Math.round(cw * 0.3)}px system-ui`; ctx.fillText(RANKS[rankOf(c) - 1], px + 4, py + cw * 0.32);
        ctx.font = `${Math.round(cw * 0.5)}px system-ui`; ctx.fillText(SUITS[suitOf(c)], px + cw * 0.28, py + ch * 0.68);
      };
      let i = 0, cur = null, frames = 0;
      const H = R.height;
      (function step() {
        frames++;
        if (!cur && i < order.length) {
          const o = order[i++];
          cur = { c: o.c, x: x(3 + o.f), y: topY, vx: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 4), vy: -Math.random() * 6 };
        }
        if (cur) {
          cur.vy += 0.5; cur.x += cur.vx; cur.y += cur.vy;
          if (cur.y + ch > H) { cur.y = H - ch; cur.vy *= -0.72; }
          drawCard(cur.c, cur.x, cur.y);
          if (cur.x < -cw || cur.x > R.width) cur = null;
        }
        if ((i < order.length || cur) && frames < 2400) requestAnimationFrame(step);
        else { setTimeout(() => { cv.remove(); resolve(); }, 300); }
      })();
      cv.addEventListener('pointerdown', () => { frames = 99999; });
    });
  }

  // ---------- Timer ----------
  function startTimer() { stopTimer(); if (!g.done) tick = setInterval(() => { g.elapsed++; q('time').textContent = fmtTime(g.elapsed); if (g.elapsed % 5 === 0) persist(); }, 1000); }
  function stopTimer() { clearInterval(tick); tick = null; }
  const onVis = () => { if (document.hidden) { stopTimer(); persist(); } else if (g && !g.done && root.style.display !== 'none') startTimer(); };
  document.addEventListener('visibilitychange', onVis);

  // ---------- Games ----------
  function mountCards() {
    table.querySelectorAll('.pcard').forEach((n) => n.remove());
    cardEls.clear();
    for (let c = 0; c < 52; c++) { const n = el(cardHtml(c)); table.appendChild(n); cardEls.set(c, n); }
  }

  async function newGame(draw = sol.draw) {
    const D = await loadDeals();
    const list = D['draw' + draw];
    sol.draw = draw;
    sol.next = sol.next || {};
    const k = sol.next[draw] ?? Math.floor(Math.random() * list.length);
    sol.next[draw] = (k + 1) % list.length;
    if (g && !g.done && g.moves > 0) sol.stats.streak = 0; // abandoning a game ends the streak
    g = { seed: list[k], draw, s: deal(list[k], draw), score: 0, moves: 0, elapsed: 0, done: false };
    sol.stats.played++;
    history = [];
    // deal animation: cards start on the deck and fly to their places
    const L = layout;
    cardEls.forEach((n) => { n.style.transition = 'none'; n.style.transform = `translate(${L.x(0)}px,${L.topY}px)`; n.classList.add('down'); });
    void table.offsetWidth;
    cardEls.forEach((n) => { n.style.transition = ''; });
    requestAnimationFrame(() => { render(); });
    sfx.cross();
    persist(); startTimer();
  }

  function newGameSheet() {
    sheet(`<h2>New game</h2>
      <button class="sheet-item" data-d="1">Draw one card<span class="dots"><i class="on"></i></span></button>
      <button class="sheet-item" data-d="3">Draw three cards<span class="dots"><i class="on"></i><i class="on"></i><i class="on"></i></span></button>
      <button class="sheet-item" data-replay>${icon.restart}Replay this deal</button>`, {
      onMount(node, close) {
        node.addEventListener('click', (e) => {
          const b = e.target.closest('[data-d]');
          if (b) { close(); newGame(+b.dataset.d); return; }
          if (e.target.closest('[data-replay]')) {
            close();
            g = { seed: g.seed, draw: g.draw, s: deal(g.seed, g.draw), score: 0, moves: 0, elapsed: 0, done: false };
            history = []; render(); persist(); startTimer();
          }
        });
      },
    });
  }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') solHelp();
    else if (a === 'new') newGameSheet();
    else if (a === 'hint') hint();
    else if (a === 'auto') autoFinish();
    else if (a === 'undo') {
      if (!history.length || g.done) return;
      const h = history.pop();
      g.s = h.s; g.score = h.score; g.moves = h.moves + 1;
      sfx.erase(); clearHint(); render(); persist();
    }
  });

  const onResize = () => { if (!g) return; measure(); slots(); render(); };
  window.addEventListener('resize', onResize);

  requestAnimationFrame(async () => {
    measure(); slots(); mountCards();
    const c = sol.current;
    if (c && c.s) { g = { ...c, done: false }; render(); startTimer(); }
    else await newGame(sol.draw);
    if (!sol.seenHelp) { sol.seenHelp = true; save(); setTimeout(solHelp, 400); }
  });

  return {
    root,
    destroy() { stopTimer(); if (g && !g.done) persist(); save(true); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('resize', onResize); },
    onHide() { stopTimer(); },
    onShow() { if (g && !g.done) startTimer(); },
  };
}
