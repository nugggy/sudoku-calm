// 2048: slide the tiles, merge equal numbers, reach 2048 (and keep going).
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, dialog, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet } from './kit.js';

const N = 4;
const S = () => store.g2048;
export const help2048 = () => helpSheet('How to play 2048', [
  'Swipe up, down, left or right. Every tile slides as far as it can.',
  'Two tiles with the same number merge into one, adding them together.',
  'Reach the 2048 tile to win, then keep going for a higher score. The game ends when no tile can move.',
], 'g2048-btn');

export function screen2048(app) {
  const s = S();
  const root = el(`<section class="screen g2048-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">2048</div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="g2048-scores"><div><span>Score</span><b data-el="score">0</b></div><div><span>Best</span><b data-el="best">0</b></div></div>
    <div class="g2048-wrap"><div class="g2048-board" data-el="board">${'<div class="g2048-cell"></div>'.repeat(N * N)}</div></div>
    <div class="g2048-bar"><button class="btn secondary small" data-act="undo">${icon.undo} Undo</button><button class="btn small g2048-btn" data-act="new">New game</button></div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const board = q('board');
  let g, prev = null, idc = 1;
  const tiles = new Map(); // id -> element

  function fresh() { const t = { cells: new Array(N * N).fill(null), score: 0, won: false, over: false }; add(t); add(t); return t; }
  function add(t) {
    const empty = t.cells.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
    if (!empty.length) return;
    t.cells[empty[(Math.random() * empty.length) | 0]] = { v: Math.random() < 0.9 ? 2 : 4, id: idc++, isNew: true };
  }
  const clone = (t) => ({ ...t, cells: t.cells.map((c) => (c ? { ...c } : null)) });

  function slide(dir) {
    const before = clone(g);
    let moved = false, gained = 0;
    const lines = [];
    for (let k = 0; k < N; k++) {
      const idxs = [...Array(N)].map((_, j) => (dir === 'left' ? k * N + j : dir === 'right' ? k * N + (N - 1 - j) : dir === 'up' ? j * N + k : (N - 1 - j) * N + k));
      lines.push(idxs);
    }
    g.cells.forEach((c) => { if (c) { c.isNew = false; c.merged = false; } });
    for (const idxs of lines) {
      const row = idxs.map((i) => g.cells[i]).filter(Boolean);
      const out = [];
      for (let j = 0; j < row.length; j++) {
        if (j + 1 < row.length && row[j].v === row[j + 1].v) {
          const v = row[j].v * 2;
          out.push({ v, id: idc++, merged: true, from: [row[j].id, row[j + 1].id] });
          gained += v; j++;
        } else out.push(row[j]);
      }
      idxs.forEach((i, j) => { const nv = out[j] || null; if ((g.cells[i] && g.cells[i].id) !== (nv && nv.id)) moved = true; g.cells[i] = nv; });
    }
    if (!moved) return false;
    prev = before;
    g.score += gained;
    add(g);
    if (g.score > s.best) s.best = g.score;
    if (gained) { sfx.place(); buzz(8); } else sfx.tap();
    return true;
  }

  function canMove() {
    for (let i = 0; i < N * N; i++) {
      if (!g.cells[i]) return true;
      const r = Math.floor(i / N), c = i % N, v = g.cells[i].v;
      if (c < N - 1 && g.cells[i + 1]?.v === v) return true;
      if (r < N - 1 && g.cells[i + N]?.v === v) return true;
    }
    return false;
  }

  function render() {
    const cellSize = board.clientWidth / N;
    const live = new Set();
    g.cells.forEach((c, i) => {
      if (!c) return;
      live.add(c.id);
      let n = tiles.get(c.id);
      const x = (i % N) * cellSize, y = Math.floor(i / N) * cellSize;
      if (!n) {
        n = el(`<div class="g2048-tile"><span></span></div>`);
        board.appendChild(n); tiles.set(c.id, n);
        n.style.transition = 'none';
        n.style.transform = `translate(${x}px,${y}px)`;
        void n.offsetWidth; n.style.transition = '';
        n.classList.add(c.merged ? 'merged' : 'appear');
      }
      n.style.transform = `translate(${x}px,${y}px)`;
      n.dataset.v = c.v > 2048 ? 'big' : c.v;
      n.firstElementChild.textContent = c.v;
      n.style.setProperty('--ts', cellSize + 'px');
      n.style.fontSize = (c.v >= 1024 ? 0.3 : c.v >= 128 ? 0.36 : 0.44) * cellSize + 'px';
    });
    // tiles that merged away slide to their target, then disappear
    for (const [id, n] of tiles) if (!live.has(id)) {
      const target = g.cells.find((c) => c && c.from && c.from.includes(id));
      if (target) { const i = g.cells.indexOf(target); n.style.transform = `translate(${(i % N) * cellSize}px,${Math.floor(i / N) * cellSize}px)`; n.style.zIndex = 0; }
      tiles.delete(id); setTimeout(() => n.remove(), 130);
    }
    q('score').textContent = g.score.toLocaleString('en-AU');
    q('best').textContent = s.best.toLocaleString('en-AU');
    $('[data-act="undo"]', root).disabled = !prev;
  }

  async function move(dir) {
    if (g.over || !slide(dir)) return;
    render();
    s.current = g; save();
    if (!g.won && g.cells.some((c) => c && c.v === 2048)) {
      g.won = true; save(); sfx.win(); confetti();
      const v = await dialog({ hero: 'img/ui/trophy.png', title: 'You made 2048!', text: 'Keep going for a higher score, or start fresh.', buttons: [{ label: 'Keep going', value: 'go' }, { label: 'New game', value: 'new', cls: 'ghost' }] });
      if (v === 'new') newGame();
    } else if (!canMove()) {
      g.over = true; s.games = (s.games || 0) + 1; s.current = null; save(true); sfx.error();
      const v = await dialog({ hero: 'img/cats/cat08.png', title: 'No more moves', dismissible: false, text: `You scored ${g.score.toLocaleString('en-AU')}.`, buttons: [{ label: 'Play again', value: 'new' }, { label: 'Back', value: 'back', cls: 'ghost' }] });
      if (v === 'new') newGame(); else app.back();
    }
  }
  function newGame() { tiles.forEach((n) => n.remove()); tiles.clear(); g = fresh(); prev = null; s.current = g; save(); render(); }

  // swipe and keyboard
  let start = null;
  const wrap = $('.g2048-wrap', root);
  wrap.addEventListener('pointerdown', (e) => { start = [e.clientX, e.clientY]; wrap.setPointerCapture(e.pointerId); });
  wrap.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start[0], dy = e.clientY - start[1]; start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  const onKey = (e) => { const d = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key]; if (d) { e.preventDefault(); move(d); } };
  document.addEventListener('keydown', onKey);

  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') help2048();
    else if (a === 'undo' && prev) { tiles.forEach((n) => n.remove()); tiles.clear(); g = prev; prev = null; s.current = g; save(); render(); sfx.erase(); }
    else if (a === 'new') { if (g.score > 0 && !g.over) { const ok = await dialog({ title: 'Start a new game?', text: 'Your current game will end.', buttons: [{ label: 'New game', value: true }, { label: 'Cancel', value: false, cls: 'ghost' }] }); if (!ok) return; } newGame(); }
  });

  requestAnimationFrame(() => {
    g = s.current && !s.current.over ? s.current : fresh();
    g.cells.forEach((c) => { if (c) c.id = idc++; });
    render();
    if (!s.seenHelp) { s.seenHelp = true; save(); setTimeout(help2048, 300); }
  });
  return { root, destroy() { document.removeEventListener('keydown', onKey); save(true); } };
}
