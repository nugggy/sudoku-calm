// Five in a Row: take turns placing stones on a 15 x 15 board; five or more in a line wins.
// The board can be zoomed (buttons or pinch) and scrolled. A first tap shows where the stone will go;
// tapping the same point again places it, so a slip of the finger never costs a move.
import { gomokuNew, gomokuLegal, gomokuPlay, GOMOKU_N } from './tbc-rules.js';
import { frame, mover, canAct, turnText, finish, winText, fx, PCOL } from './tbc-ui.js';

const N = GOMOKU_N, STAR = [3, 7, 11];
const STONE = ['img/duo/disc_red.webp', 'img/duo/disc_blue.webp'];
const st = (x, y, p, cls = '') => `<g class="gm-stone ${cls}" transform="translate(${x} ${y})"><circle r=".44" fill="${PCOL[p]}"/><image href="${STONE[p]}" x="-.46" y="-.46" width=".92" height=".92"/></g>`;
const grid = (n) => {
  let g = `<rect x="-.6" y="-.6" width="${n + 0.2}" height="${n + 0.2}" rx=".35" class="gm-wood"/>`;
  for (let k = 0; k < n; k++) g += `<line x1="0" y1="${k}" x2="${n - 1}" y2="${k}" class="gm-line"/><line x1="${k}" y1="0" x2="${k}" y2="${n - 1}" class="gm-line"/>`;
  return g;
};

export default {
  id: 'gomoku', name: 'Five in a Row', tag: 'Line up five stones first', realtime: false, cat: 'board',
  art: () => `<svg class="tbc-art-gomoku" viewBox="-.6 -.6 7.2 7.2">${grid(7)}${[[1, 5, 0], [2, 4, 0], [3, 3, 0], [4, 2, 0], [2, 2, 1], [3, 2, 1], [4, 4, 1], [5, 3, 1]].map(([x, y, p]) => st(x, y, p)).join('')}</svg>`,
  help: [
    'Take turns placing a stone on any empty point where the lines cross.',
    'The first player to get five or more stones in an unbroken line, across, down or diagonally, wins.',
    'Tap a point to see your stone there, then tap it again to place it. Use the zoom buttons or pinch to make the board bigger, and drag to look around.',
  ],
  create(ctx) {
    const s = gomokuNew(ctx.first);
    const ui = frame(ctx, 'tbc-gomoku');
    let ghost = -1, cell = 0;
    ui.body.innerHTML = `<div class="gm-wrap"><div class="gm-scroll"><svg class="gm-board"></svg></div>
      <div class="gm-zoom"><button type="button" data-z="-1" aria-label="Zoom out">&minus;</button><button type="button" data-z="1" aria-label="Zoom in">+</button></div></div>`;
    const scroll = ui.body.querySelector('.gm-scroll'), svg = ui.body.querySelector('.gm-board');

    function fitCell() { const w = scroll.clientWidth || 340; return Math.max(18, Math.floor((w - 8) / (N + 0.2))); }
    function size(c, keepCentre = true) {
      const old = cell, cx = (scroll.scrollLeft + scroll.clientWidth / 2) / (old * (N + 0.2) || 1), cy = (scroll.scrollTop + scroll.clientHeight / 2) / (old * (N + 0.2) || 1);
      cell = Math.max(fitCell(), Math.min(64, Math.round(c)));
      const px = cell * (N + 0.2);
      svg.style.width = px + 'px'; svg.style.height = px + 'px';
      if (keepCentre && old) { scroll.scrollLeft = cx * px - scroll.clientWidth / 2; scroll.scrollTop = cy * px - scroll.clientHeight / 2; }
    }
    function render() {
      let g = grid(N);
      for (const y of STAR) for (const x of STAR) g += `<circle cx="${x}" cy="${y}" r=".1" class="gm-dot"/>`;
      s.b.forEach((p, i) => { if (p >= 0) g += st(i % N, Math.floor(i / N), p, `${i === s.last ? 'last' : ''} ${s.line && s.line.includes(i) ? 'won' : ''}`); });
      if (ghost >= 0 && s.b[ghost] < 0) g += st(ghost % N, Math.floor(ghost / N), s.turn, 'ghost');
      svg.setAttribute('viewBox', `-.6 -.6 ${N + 0.2} ${N + 0.2}`);
      svg.innerHTML = g;
      ui.turn(s.over ? -1 : s.turn);
      ui.score(null);
      if (!s.over) ui.status(turnText(ctx, s.turn) + (canAct(ctx, s.turn) ? (ghost >= 0 ? ': tap again to place' : ': tap a point') : ''));
    }

    const m = mover(ctx, async (i) => {
      if (!gomokuLegal(s, i)) return;
      const r = gomokuPlay(s, i);
      ghost = -1;
      fx(ctx, r.line ? 'good' : 'move');
      render();
      if (s.over) { const t = winText(ctx, s.winner, s.winner == null ? ': the board is full' : ' with five in a row'); ui.status(t); fx(ctx, 'win'); finish(ctx, s.winner, t, 1800); }
    }, () => render());

    // Pointer handling: one finger taps or drags (native scroll), two fingers pinch to zoom.
    const pts = new Map();
    let pinch = null, down = null;
    scroll.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), c: cell }; down = null; }
      else down = { x: e.clientX, y: e.clientY };
    });
    scroll.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pts.size === 2) { const [a, b] = [...pts.values()]; size(pinch.c * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d); e.preventDefault(); }
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) down = null;
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!down || e.type !== 'pointerup') { down = null; return; }
      down = null;
      if (m.busy || s.over || !canAct(ctx, s.turn)) return;
      const r = svg.getBoundingClientRect(), u = r.width / (N + 0.2);
      const x = Math.round((e.clientX - r.left) / u - 0.6), y = Math.round((e.clientY - r.top) / u - 0.6);
      if (x < 0 || y < 0 || x >= N || y >= N) return;
      const i = y * N + x;
      if (!gomokuLegal(s, i)) { fx(ctx, 'bad'); return; }
      if (ghost === i) m.local(i);
      else { ghost = i; fx(ctx, 'tap'); render(); }
    };
    scroll.addEventListener('pointerup', up);
    scroll.addEventListener('pointercancel', up);
    ui.body.querySelector('.gm-zoom').addEventListener('click', (e) => { const b = e.target.closest('[data-z]'); if (b) size(cell * (+b.dataset.z > 0 ? 1.35 : 1 / 1.35)); });

    ctx.onMsg((msg) => { if (msg.t === 'mv') m.remote(msg.m); });
    const ro = new ResizeObserver(() => { if (cell < fitCell()) size(fitCell(), false); });
    ro.observe(scroll);
    size(fitCell(), false);
    render();
    return { destroy() { ro.disconnect(); ctx.root.innerHTML = ''; } };
  },
};
