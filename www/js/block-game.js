// Block Pounce: drag pieces onto an 8x8 board; full rows and columns clear. No time limit, no levels.
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, sheet, dialog, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';

const N = 8;
const COLOURS = ['#ff5d73', '#ff9f43', '#ffd23f', '#3ddc84', '#38b6ff', '#8f6bff', '#ff6fd8'];
// Shapes as lists of [row, col] cells.
const SHAPES = [
  [[0, 0]],
  [[0, 0], [0, 1]], [[0, 0], [1, 0]],
  [[0, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
  [[0, 0], [0, 1], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]],
  [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]], [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]],
  [[0, 0], [1, 0], [1, 1]], [[0, 1], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 0]], [[0, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [2, 1]], [[0, 1], [1, 1], [2, 1], [2, 0]], [[0, 0], [0, 1], [1, 0], [2, 0]], [[0, 0], [0, 1], [1, 1], [2, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 0]], [[0, 0], [0, 1], [0, 2], [1, 2]], [[0, 0], [1, 0], [1, 1], [1, 2]], [[0, 2], [1, 0], [1, 1], [1, 2]],
  [[0, 0], [0, 1], [0, 2], [1, 1]], [[0, 1], [1, 0], [1, 1], [1, 2]], [[0, 0], [1, 0], [1, 1], [2, 0]], [[0, 1], [1, 0], [1, 1], [2, 1]],
  [[0, 0], [0, 1], [1, 1], [1, 2]], [[0, 1], [0, 2], [1, 0], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]], [[0, 1], [1, 0], [1, 1], [2, 0]],
  [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]],
];
const B = () => store.block;

const fits = (grid, shape, r, c) => shape.every(([dr, dc]) => { const rr = r + dr, cc = c + dc; return rr >= 0 && rr < N && cc >= 0 && cc < N && !grid[rr * N + cc]; });
const anyFit = (grid, shape) => { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (fits(grid, shape, r, c)) return true; return false; };

// Three new pieces, with at least one that fits the current board where possible.
function newTray(grid) {
  for (let t = 0; t < 30; t++) {
    const tray = [0, 1, 2].map(() => ({ s: (Math.random() * SHAPES.length) | 0, col: (Math.random() * COLOURS.length) | 0 }));
    if (tray.some((p) => anyFit(grid, SHAPES[p.s]))) return tray;
  }
  return [0, 1, 2].map(() => ({ s: 0, col: (Math.random() * COLOURS.length) | 0 }));
}

export function blockHelp() {
  sheet(`<h2>How to play Block Pounce</h2><div class="help-body">
    <p>Drag the pieces at the bottom onto the board. Fill a whole row or column to clear it.</p>
    <p>Clear several lines at once, or keep clearing turn after turn, for big combo bonuses.</p>
    <p>You get three pieces at a time. The game ends when none of them fit.</p>
  </div><button class="btn block-btn" data-x>Let's play</button>`, { onMount: (n, close) => { $('[data-x]', n).onclick = close; } });
}

export function blockScreen(app) {
  const b = B();
  const root = el(`<section class="screen block-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="block-scores"><div class="best"><img src="img/ui/crown.png" alt=""><span data-el="best"></span></div><div class="score" data-el="score">0</div></div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="block-board-wrap"><div class="block-board" data-el="board"></div><div class="block-pop" data-el="pop"></div></div>
    <div class="block-tray" data-el="tray"></div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  let g = b.current && b.current.grid ? b.current : { grid: new Array(N * N).fill(0), tray: null, score: 0, streak: 0 };
  if (!g.tray) g.tray = newTray(g.grid);
  const boardEl = q('board');
  for (let i = 0; i < N * N; i++) boardEl.appendChild(el('<div class="bcell"></div>'));
  const cells = $$('.bcell', boardEl);

  function persist() { b.current = g; save(); }

  function renderBoard(ghost = null, clearing = null) {
    cells.forEach((d, i) => {
      const v = g.grid[i];
      d.style.background = v ? COLOURS[v - 1] : '';
      d.className = 'bcell' + (v ? ' on' : '') + (ghost && ghost.cells.has(i) ? ' ghost' : '') + (clearing && clearing.has(i) ? ' clearing' : '');
      if (ghost && ghost.cells.has(i)) d.style.setProperty('--ghost', COLOURS[ghost.col]);
    });
    q('score').textContent = g.score.toLocaleString('en-AU');
    q('best').textContent = Math.max(b.best, g.score).toLocaleString('en-AU');
  }

  function pieceHtml(p, size) {
    const sh = SHAPES[p.s];
    const rows = Math.max(...sh.map(([r]) => r)) + 1, cols = Math.max(...sh.map(([, c]) => c)) + 1;
    return `<div class="bpiece" style="--bs:${size}px;grid-template-columns:repeat(${cols},var(--bs));grid-template-rows:repeat(${rows},var(--bs))">${sh.map(([r, c]) => `<i style="grid-row:${r + 1};grid-column:${c + 1};background:${COLOURS[p.col]}"></i>`).join('')}</div>`;
  }
  function renderTray() {
    q('tray').innerHTML = g.tray.map((p, i) => `<div class="bslot" data-i="${i}">${p ? pieceHtml(p, 20) : ''}</div>`).join('');
    $$('.bslot', root).forEach((s) => { const p = g.tray[+s.dataset.i]; if (p && !anyFit(g.grid, SHAPES[p.s])) s.classList.add('nofit'); });
  }

  // ---------- Drag a piece ----------
  let drag = null;
  q('tray').addEventListener('pointerdown', (e) => {
    const slot = e.target.closest('.bslot'); if (!slot) return;
    const i = +slot.dataset.i, p = g.tray[i]; if (!p) return;
    const cellPx = boardEl.getBoundingClientRect().width / N;
    const floating = el(`<div class="bfloat">${pieceHtml(p, cellPx - 2)}</div>`);
    document.body.appendChild(floating);
    slot.classList.add('lifted');
    q('tray').setPointerCapture(e.pointerId);
    drag = { i, p, floating, slot, cellPx };
    moveFloat(e);
    sfx.tap();
  });
  function target(e) {
    const r = boardEl.getBoundingClientRect();
    const fr = drag.floating.firstElementChild.getBoundingClientRect();
    const col = Math.round((fr.left - r.left) / drag.cellPx), row = Math.round((fr.top - r.top) / drag.cellPx);
    return fits(g.grid, SHAPES[drag.p.s], row, col) ? { row, col } : null;
  }
  function moveFloat(e) {
    const fw = drag.floating.firstElementChild.offsetWidth, fh = drag.floating.firstElementChild.offsetHeight;
    // the piece floats above the finger so it stays visible
    drag.floating.style.transform = `translate(${e.clientX - fw / 2}px, ${e.clientY - fh - 70}px)`;
    const t = target(e);
    drag.t = t;
    renderBoard(t ? { cells: new Set(SHAPES[drag.p.s].map(([dr, dc]) => (t.row + dr) * N + t.col + dc)), col: drag.p.col } : null);
  }
  q('tray').addEventListener('pointermove', (e) => { if (drag) moveFloat(e); });
  const end = () => {
    if (!drag) return;
    const d = drag; drag = null;
    d.floating.remove(); d.slot.classList.remove('lifted');
    if (d.t) place(d.i, d.t); else renderBoard();
  };
  q('tray').addEventListener('pointerup', end);
  q('tray').addEventListener('pointercancel', end);

  function place(i, { row, col }) {
    const p = g.tray[i], sh = SHAPES[p.s];
    sh.forEach(([dr, dc]) => { g.grid[(row + dr) * N + col + dc] = p.col + 1; });
    g.score += sh.length;
    g.tray[i] = null;
    sfx.place(); buzz(10);
    // full lines
    const clear = new Set();
    let lines = 0;
    for (let r = 0; r < N; r++) if ([...Array(N)].every((_, c) => g.grid[r * N + c])) { lines++; for (let c = 0; c < N; c++) clear.add(r * N + c); }
    for (let c = 0; c < N; c++) if ([...Array(N)].every((_, r) => g.grid[r * N + c])) { lines++; for (let r = 0; r < N; r++) clear.add(r * N + c); }
    if (lines) {
      g.streak++;
      const gained = 10 * lines * lines * Math.min(g.streak, 8);
      g.score += gained;
      renderBoard(null, clear);
      setTimeout(() => { clear.forEach((k) => { g.grid[k] = 0; }); renderBoard(); }, 330);
      const words = ['', 'Good', 'Great', 'Excellent', 'Amazing', 'Unbelievable'];
      popText(`${words[Math.min(lines, 5)]}${g.streak > 1 ? ` · combo ×${Math.min(g.streak, 8)}` : ''}<small>+${gained}</small>`);
      sfx.unit();
      if (g.grid.every((v, k) => !v || clear.has(k))) { g.score += 300; setTimeout(() => popText('Board cleared!<small>+300</small>'), 500); confetti(1800); }
    } else g.streak = 0;
    if (g.tray.every((x) => !x)) g.tray = newTray(g.grid.map((v, k) => (clear.has(k) ? 0 : v)));
    if (g.score > b.best) b.best = g.score;
    persist();
    setTimeout(() => { renderBoard(); renderTray(); checkOver(); }, lines ? 350 : 0);
  }

  function popText(html) {
    const pEl = q('pop');
    pEl.innerHTML = html;
    pEl.classList.remove('show'); void pEl.offsetWidth; pEl.classList.add('show');
  }

  async function checkOver() {
    const left = g.tray.filter(Boolean);
    if (!left.length || left.some((p) => anyFit(g.grid, SHAPES[p.s]))) return;
    const best = g.score >= b.best && g.score > 0;
    b.games = (b.games || 0) + 1;
    const final = g.score;
    b.current = null; save(true);
    cells.forEach((d, i) => setTimeout(() => d.classList.add('dead'), (i % N + Math.floor(i / N)) * 25));
    sfx.error();
    await new Promise((r) => setTimeout(r, 700));
    const v = await dialog({ hero: best ? 'img/ui/crown.png' : 'img/cats/cat08.png', title: best ? 'New best score!' : 'No more room', dismissible: false,
      text: `You scored ${final.toLocaleString('en-AU')}.${best ? '' : ` Your best is ${b.best.toLocaleString('en-AU')}.`}`,
      buttons: [{ label: 'Play again', value: 'again' }, { label: 'Back', value: 'back', cls: 'ghost' }] });
    if (v === 'again') { g = { grid: new Array(N * N).fill(0), tray: null, score: 0, streak: 0 }; g.tray = newTray(g.grid); renderBoard(); renderTray(); persist(); }
    else app.back();
  }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') blockHelp();
  });

  renderBoard(); renderTray(); persist();
  setTimeout(checkOver, 300);
  if (!b.seenHelp) { b.seenHelp = true; save(); setTimeout(blockHelp, 300); }
  return { root, destroy() { $$('.bfloat').forEach((n) => n.remove()); save(true); } };
}
