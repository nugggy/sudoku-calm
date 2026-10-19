// Dots and Boxes: draw lines between dots; close a box to claim it and go again.
import { dbNew, dbPlay, dbOver, dbEdges } from './rules.js';
import { mine, esc } from './core.js';
import { playerBar } from './ui.js';

const SIZES = [3, 4, 5, 6];
const sw = (p) => `<i class="db-sw p${p}"></i>`;

export default {
  id: 'dots', name: 'Dots and Boxes', tag: 'Close a box, take another turn', cat: 'board', realtime: false,
  art: () => '<svg class="art-dots" viewBox="0 0 96 64"><rect x="18" y="8" width="24" height="24" class="a"/><rect x="42" y="32" width="24" height="24" class="b"/><path d="M18 8h48M18 8v24h24M42 32V8M42 56h24V32H42M66 8v24" /><g>' +
    [18, 42, 66].map((x) => [8, 32, 56].map((y) => `<circle cx="${x}" cy="${y}" r="4"/>`).join('')).join('') + '</g></svg>',
  help: [
    'Take turns drawing a line between two neighbouring dots.',
    'Draw the fourth side of a box to claim it, and then you must draw another line.',
    'When every box is claimed, the player with more boxes wins. The host picks the size of the grid.',
  ],
  create(ctx) {
    let s = null, turn = ctx.first, over = false, last = '';
    ctx.root.innerHTML = '';
    const bar = playerBar(ctx, [sw(0), sw(1)]);
    const area = document.createElement('div');
    area.className = 'dg-area';
    ctx.root.append(bar.el, area);

    function pickSize() {
      if (ctx.isHost) {
        area.innerHTML = `<div class="dg-pick"><h3>Choose a grid</h3><div class="dg-pick-row">${SIZES.map((n) => `<button class="btn secondary" data-n="${n}">${n} × ${n}<small>${n * n} boxes</small></button>`).join('')}</div></div>`;
      } else area.innerHTML = `<div class="dg-pick"><div class="spinner"></div><p>Waiting for ${esc(ctx.names[0])} to choose a grid</p></div>`;
      bar.set({ text: '' });
    }

    function start(n) {
      s = dbNew(n);
      const G = 60, pad = 14, W = n * G + pad * 2;
      const dot = (r, c) => [pad + c * G, pad + r * G];
      const edgeSvg = dbEdges(n).map((e) => {
        const [r, c] = e.slice(1).split('_').map(Number), [x1, y1] = dot(r, c), [x2, y2] = e[0] === 'h' ? dot(r, c + 1) : dot(r + 1, c);
        return `<g class="db-e" data-e="${e}"><line class="hit" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line class="ln" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/></g>`;
      }).join('');
      const boxes = [...Array(n * n)].map((_, i) => { const [x, y] = dot(Math.floor(i / n), i % n); return `<rect class="db-box" data-b="${i}" x="${x + 4}" y="${y + 4}" width="${G - 8}" height="${G - 8}" rx="6"/>`; }).join('');
      const dots = [...Array((n + 1) * (n + 1))].map((_, i) => { const [x, y] = dot(Math.floor(i / (n + 1)), i % (n + 1)); return `<circle class="db-dot" cx="${x}" cy="${y}" r="5.5"/>`; }).join('');
      area.innerHTML = `<svg class="db-board" viewBox="0 0 ${W} ${W}">${boxes}${edgeSvg}${dots}</svg>`;
      draw();
    }

    function draw() {
      if (!s) return;
      area.querySelectorAll('.db-e').forEach((g) => {
        const v = s.edges[g.dataset.e];
        g.setAttribute('class', `db-e${v !== undefined ? ' on p' + v : ''}${g.dataset.e === last ? ' last' : ''}`);
      });
      area.querySelectorAll('.db-box').forEach((r) => { const v = s.boxes[+r.dataset.b]; r.setAttribute('class', `db-box${v >= 0 ? ' p' + v : ''}`); });
      bar.set({ turn: over ? -1 : turn, score: s.score });
    }

    function play(e, p) {
      if (!s || over || p !== turn) return false;
      const made = dbPlay(s, e, p);
      if (made === null) return false;
      last = e;
      if (made.length) { ctx.sfx.unit(); ctx.buzz(20); } else { ctx.sfx.place(); ctx.buzz(8); turn = 1 - turn; }
      if (dbOver(s)) {
        over = true; draw();
        const [a, b] = s.score;
        setTimeout(() => ctx.end({ winner: a === b ? null : a > b ? 0 : 1, text: `${a} ${a === 1 ? 'box' : 'boxes'} to ${b}` }), 800);
      } else draw();
      return true;
    }

    area.addEventListener('click', (e) => {
      const n = e.target.closest('[data-n]');
      if (n && ctx.isHost && !s) { const v = +n.dataset.n; ctx.send({ t: 'size', n: v }); start(v); return; }
      const g = e.target.closest('[data-e]');
      if (!g || !s || over) return;
      if (!mine(ctx, turn)) { ctx.toast('Wait for your turn'); return; }
      const ed = g.dataset.e, p = turn;
      if (s.edges[ed] !== undefined) return;
      if (play(ed, p)) ctx.send({ t: 'move', e: ed, p });
    });
    const off = ctx.onMsg((m) => {
      if (m.t === 'size' && !s) start(m.n);
      else if (m.t === 'move') play(m.e, m.p);
    });
    pickSize();
    const bot = () => {
      if (!s) { if (ctx.isHost) { const v = 3; ctx.send({ t: 'size', n: v }); start(v); return true; } return false; }
      if (over || !mine(ctx, turn)) return false;
      const free = dbEdges(s.n).filter((x) => s.edges[x] === undefined), ed = free[Math.floor(Math.random() * free.length)], p = turn;
      return play(ed, p) && (ctx.send({ t: 'move', e: ed, p }), true);
    };
    return { destroy() { off(); }, state: () => (s ? { e: JSON.stringify(s.edges), sc: s.score.join(), turn } : null), bot };
  },
};
