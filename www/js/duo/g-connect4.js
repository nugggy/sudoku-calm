// Connect Four: drop discs into a seven-column frame, first to line up four wins.
import { c4New, c4Drop, c4CanDrop, c4Win, c4Full } from './rules.js';
import { mine } from './core.js';
import { playerBar, fitBoard } from './ui.js';

const disc = (p) => `<i class="c4-disc p${p}"></i>`;

export default {
  id: 'connect4', name: 'Connect Four', tag: 'Drop discs, line up four', cat: 'board', realtime: false,
  art: () => `<div class="art-c4">${[0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1].map((v, i) => `<i class="${[2, 8, 9, 15, 16, 17, 20].includes(i) ? 'p' + v : ''}"></i>`).join('')}</div>`,
  help: [
    'Take turns dropping a disc into a column. It falls to the lowest free space.',
    'Line up four of your discs across, down or diagonally to win. A full frame with no line is a draw.',
  ],
  create(ctx) {
    const b = c4New();
    let turn = ctx.first, over = false, last = -1;
    ctx.root.innerHTML = '';
    const bar = playerBar(ctx, [disc(0), disc(1)]);
    const area = document.createElement('div');
    area.className = 'dg-area';
    area.innerHTML = `<div class="c4-wrap"><div class="c4-board">${[...Array(42)].map((_, i) => `<div class="c4-cell" data-i="${i}"></div>`).join('')}</div><div class="c4-cols">${[...Array(7)].map((_, c) => `<button class="c4-col" data-c="${c}" aria-label="Column ${c + 1}"></button>`).join('')}</div></div>`;
    ctx.root.append(bar.el, area);
    const wrap = area.querySelector('.c4-wrap');
    const unfit = fitBoard(area, wrap, 7, 6.4, 64);
    const cells = [...area.querySelectorAll('.c4-cell')];

    function draw(win) {
      cells.forEach((cell, i) => {
        const v = b[i];
        if (v && !cell.firstChild) cell.innerHTML = disc(v - 1);
        cell.classList.toggle('last', i === last);
        cell.classList.toggle('won', !!win && win.cells.includes(i));
      });
      area.querySelectorAll('.c4-col').forEach((col) => col.classList.toggle('full', !c4CanDrop(b, +col.dataset.c)));
      bar.set({ turn: over ? -1 : turn });
    }

    function play(col, p) {
      if (over || p !== turn || !c4CanDrop(b, col)) return false;
      const r = c4Drop(b, col, p);
      last = r * 7 + col;
      draw();
      const d = cells[last].firstChild;
      if (d) d.style.setProperty('--fall', `${(r + 1) * -100}%`), d.classList.add('drop');
      ctx.sfx.place(); ctx.buzz(12);
      const win = c4Win(b);
      if (win) { over = true; draw(win); setTimeout(() => ctx.end({ winner: win.player, text: 'Four in a row' }), 900); return true; }
      if (c4Full(b)) { over = true; draw(); setTimeout(() => ctx.end({ winner: null, text: 'The frame is full' }), 700); return true; }
      turn = 1 - turn;
      draw();
      return true;
    }

    area.addEventListener('click', (e) => {
      const col = e.target.closest('[data-c]');
      if (!col || over) return;
      if (!mine(ctx, turn)) { ctx.toast('Wait for your turn'); return; }
      const c = +col.dataset.c;
      if (!c4CanDrop(b, c)) { ctx.sfx.error(); return; }
      const p = turn;
      if (play(c, p)) ctx.send({ t: 'move', c, p });
    });
    const off = ctx.onMsg((m) => { if (m.t === 'move') play(m.c, m.p); });
    draw();
    // state() and bot() are for tests: bot plays a random legal move when it is this phone's turn.
    const bot = () => {
      if (over || !mine(ctx, turn)) return false;
      const cols = [0, 1, 2, 3, 4, 5, 6].filter((c) => c4CanDrop(b, c)), c = cols[Math.floor(Math.random() * cols.length)], p = turn;
      return play(c, p) && (ctx.send({ t: 'move', c, p }), true);
    };
    return { destroy() { off(); unfit(); }, state: () => ({ b: b.join(''), turn, over }), bot };
  },
};
