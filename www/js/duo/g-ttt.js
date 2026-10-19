// Noughts and Crosses, best of five rounds. The starter alternates each round.
import { tttWin, tttFull } from './rules.js';
import { mine, whoName } from './core.js';
import { playerBar, fitBoard } from './ui.js';

const X = '<svg viewBox="0 0 40 40" class="tt-x"><path d="M9 9l22 22M31 9 9 31"/></svg>';
const O = '<svg viewBox="0 0 40 40" class="tt-o"><circle cx="20" cy="20" r="12"/></svg>';
const mark = (p) => (p === 0 ? X : O);

export default {
  id: 'ttt', name: 'Noughts and Crosses', tag: 'Best of five, three in a row', cat: 'party', realtime: false,
  art: () => `<div class="art-ttt">${[0, -1, 1, -1, 0, 1, 1, -1, 0].map((v) => `<i>${v < 0 ? '' : mark(v)}</i>`).join('')}</div>`,
  help: [
    'Take turns placing your mark. Three in a row across, down or diagonally wins the round.',
    'The match is best of five rounds: the first to three round wins takes it. Whoever starts swaps each round.',
  ],
  create(ctx) {
    let b = new Array(9).fill(0), round = 0, starter = ctx.first, turn = starter, over = false, roundOver = false;
    const wins = [0, 0];
    ctx.root.innerHTML = '';
    const bar = playerBar(ctx, [mark(0), mark(1)]);
    const area = document.createElement('div');
    area.className = 'dg-area';
    area.innerHTML = `<div class="tt-wrap"><div class="tt-round"></div><div class="tt-board">${[...Array(9)].map((_, i) => `<button class="tt-cell" data-i="${i}" aria-label="Square ${i + 1}"></button>`).join('')}</div></div>`;
    ctx.root.append(bar.el, area);
    const wrap = area.querySelector('.tt-wrap');
    const unfit = fitBoard(area, wrap, 3, 3.6, 120);
    const cells = [...area.querySelectorAll('.tt-cell')];

    function draw(win) {
      cells.forEach((c, i) => {
        const v = b[i];
        if (v && !c.firstChild) { c.innerHTML = mark(v - 1); c.firstChild.classList.add('pop'); }
        if (!v) c.innerHTML = '';
        c.classList.toggle('won', !!win && win.cells.includes(i));
      });
      area.querySelector('.tt-round').textContent = over ? 'Match over' : `Round ${round + 1} of 5`;
      bar.set({ turn: over || roundOver ? -1 : turn, score: wins, text: roundOver && !over ? 'Next round coming up' : null });
    }

    function nextRound() {
      round++; starter = 1 - starter; turn = starter; roundOver = false;
      b = new Array(9).fill(0);
      draw();
      early.splice(0).forEach((m) => { if (m.round === round) play(m.i, m.p); else if (m.round > round) early.push(m); });
    }

    function finishRound(win) {
      roundOver = true;
      if (win) wins[win.player]++;
      const done = wins[0] === 3 || wins[1] === 3 || round === 4;
      draw(win);
      if (win) { ctx.sfx.unit(); ctx.toast(`${whoName(ctx, win.player)} takes round ${round + 1}`); } else ctx.toast(`Round ${round + 1} is a draw`);
      if (done) {
        over = true;
        setTimeout(() => {
          draw(win);
          const w = wins[0] === wins[1] ? null : wins[0] > wins[1] ? 0 : 1;
          ctx.end({ winner: w, text: `${wins[0]} ${wins[0] === 1 ? 'round' : 'rounds'} to ${wins[1]}` });
        }, 900);
      } else setTimeout(() => { if (ctx.alive()) nextRound(); }, 1300);
    }

    function play(i, p) {
      if (over || roundOver || p !== turn || b[i]) return false;
      b[i] = p + 1;
      ctx.sfx.place(); ctx.buzz(10);
      const win = tttWin(b);
      if (win || tttFull(b)) finishRound(win);
      else { turn = 1 - turn; draw(); }
      return true;
    }

    area.addEventListener('click', (e) => {
      const c = e.target.closest('[data-i]');
      if (!c || over || roundOver) return;
      if (!mine(ctx, turn)) { ctx.toast('Wait for your turn'); return; }
      const i = +c.dataset.i, p = turn;
      if (b[i]) { ctx.sfx.error(); return; }
      if (play(i, p)) ctx.send({ t: 'move', i, p, round });
    });
    // the other phone may start the next round a moment before this one does, so hold early moves
    const early = [];
    const off = ctx.onMsg((m) => { if (m.t !== 'move') return; if (m.round === round && !roundOver) play(m.i, m.p); else if (m.round > round || roundOver) early.push(m); });
    draw();
    const bot = () => {
      if (over || roundOver || !mine(ctx, turn)) return false;
      const free = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0), i = free[Math.floor(Math.random() * free.length)], p = turn;
      return play(i, p) && (ctx.send({ t: 'move', i, p, round }), true);
    };
    return { destroy() { off(); unfit(); }, state: () => ({ b: b.join(''), wins: wins.join(), round, turn }), bot };
  },
};
