// Reversi: place a disc to trap a line of your opponent's discs and flip them.
import { rvNew, rvMoves, rvPlay, rvCount, rvNext } from './rules.js';
import { mine, whoName } from './core.js';
import { playerBar, fitBoard } from './ui.js';

// Player 0 is dark, player 1 is light, whoever moves first.
const disc = (p) => `<i class="rv-disc p${p}"></i>`;

export default {
  id: 'reversi', name: 'Reversi', tag: 'Trap and flip your rival\'s discs', cat: 'board', realtime: false,
  art: () => `<div class="art-rv">${[0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1].map((v) => `<i>${disc(v)}</i>`).join('')}</div>`,
  help: [
    'Place a disc so that one or more straight lines of your opponent\'s discs sit between it and another of your discs. Those discs flip to your colour.',
    'If you cannot flip anything you miss your turn. When neither player can move, the player with more discs wins.',
    'Dots show where you can play.',
  ],
  create(ctx) {
    const b = rvNew(ctx.first);
    let turn = ctx.first, over = false, last = -1;
    ctx.root.innerHTML = '';
    const bar = playerBar(ctx, [disc(0), disc(1)]);
    const area = document.createElement('div');
    area.className = 'dg-area';
    area.innerHTML = `<div class="rv-board">${[...Array(64)].map((_, i) => `<button class="rv-cell" data-i="${i}"></button>`).join('')}</div>`;
    ctx.root.append(bar.el, area);
    const board = area.querySelector('.rv-board');
    const unfit = fitBoard(area, board, 8, 8, 60);
    const cells = [...area.querySelectorAll('.rv-cell')];

    function draw(flipped = []) {
      const hints = !over && mine(ctx, turn) ? new Set(rvMoves(b, turn)) : new Set();
      cells.forEach((c, i) => {
        const v = b[i];
        const cur = c.firstChild && c.firstChild.classList.contains('rv-disc') ? (c.firstChild.classList.contains('p0') ? 1 : 2) : 0;
        if (v !== cur) c.innerHTML = v ? disc(v - 1) : '';
        if (flipped.includes(i)) c.firstChild?.classList.add('flip');
        c.classList.toggle('hint', hints.has(i));
        c.classList.toggle('last', i === last);
      });
      bar.set({ turn: over ? -1 : turn, score: rvCount(b) });
    }

    function play(i, p) {
      if (over || p !== turn) return false;
      const f = rvPlay(b, i, p);
      if (!f) return false;
      last = i;
      ctx.sfx.place(); ctx.buzz(10);
      const nx = rvNext(b, p);
      if (nx < 0) {
        over = true; draw(f);
        const [a, c] = rvCount(b);
        setTimeout(() => ctx.end({ winner: a === c ? null : a > c ? 0 : 1, text: `${a} ${a === 1 ? 'disc' : 'discs'} to ${c}` }), 900);
      } else {
        if (nx === p) ctx.toast(`${whoName(ctx, 1 - p)} has no move and passes`);
        turn = nx; draw(f);
      }
      return true;
    }

    area.addEventListener('click', (e) => {
      const c = e.target.closest('[data-i]');
      if (!c || over) return;
      if (!mine(ctx, turn)) { ctx.toast('Wait for your turn'); return; }
      const i = +c.dataset.i, p = turn;
      if (!play(i, p)) { ctx.sfx.error(); return; }
      ctx.send({ t: 'move', i, p });
    });
    const off = ctx.onMsg((m) => { if (m.t === 'move') play(m.i, m.p); });
    draw();
    const bot = () => {
      if (over || !mine(ctx, turn)) return false;
      const mv = rvMoves(b, turn), i = mv[Math.floor(Math.random() * mv.length)], p = turn;
      return play(i, p) && (ctx.send({ t: 'move', i, p }), true);
    };
    return { destroy() { off(); unfit(); }, state: () => ({ b: b.join(''), turn, over }), bot };
  },
};
