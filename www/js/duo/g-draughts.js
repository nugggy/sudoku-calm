// English draughts: men move forward diagonally, captures are compulsory and must be carried on, kings move both ways.
import { drNew, drMoves, drPlay, drOwner, drKing, drCount, drKey } from './rules.js';
import { mine, whoName } from './core.js';
import { playerBar, fitBoard } from './ui.js';

const CROWN = '<svg viewBox="0 0 24 24" class="dr-crown"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>';
const QUIET_LIMIT = 80; // plies with no capture and no man moved before the game is drawn

export default {
  id: 'draughts', name: 'Draughts', tag: 'Jump, capture and crown your kings', cat: 'board', realtime: false,
  art: () => `<div class="art-dr">${[...Array(16)].map((_, i) => { const r = i >> 2, c = i & 3, d = (r + c) % 2; const v = d ? ['', 'a', '', 'b', 'a', '', 'b', '', '', 'a', '', '', 'b', '', 'b', ''][i] : ''; return `<i class="${d ? 'd' : ''}">${v ? `<b class="${v}"></b>` : ''}</i>`; }).join('')}</div>`,
  help: [
    'Move a piece one square diagonally forward onto an empty dark square.',
    'Jump over an opposing piece to capture it. If you can capture, you must, and you keep jumping while you can with the same piece.',
    'A piece that reaches the far side is crowned a king and can move and capture backwards too.',
    'Take all your opponent\'s pieces, or leave them with no move, to win.',
  ],
  create(ctx) {
    const b = drNew();
    let turn = ctx.first, over = false, sel = -1, path = [], lastMv = null, quiet = 0;
    // the player who moves first has the dark pieces
    const tone = (p) => (p === ctx.first ? 'dark' : 'light');
    // each phone sees its own pieces at the bottom; player 0 starts at the bottom of the board
    const flip = !ctx.local && ctx.me === 1;
    const view = (i) => (flip ? 63 - i : i);
    ctx.root.innerHTML = '';
    const piece = (p, king) => `<i class="dr-pc ${tone(p)}">${king ? CROWN : ''}</i>`;
    const bar = playerBar(ctx, [piece(0), piece(1)]);
    const area = document.createElement('div');
    area.className = 'dg-area';
    area.innerHTML = `<div class="dr-board">${[...Array(64)].map((_, k) => { const i = view(k), d = ((i >> 3) + (i & 7)) % 2; return `<div class="dr-sq ${d ? 'd' : 'l'}" data-i="${i}"></div>`; }).join('')}</div>`;
    ctx.root.append(bar.el, area);
    const board = area.querySelector('.dr-board');
    const unfit = fitBoard(area, board, 8, 8, 60);
    const sq = new Map([...area.querySelectorAll('.dr-sq')].map((n) => [+n.dataset.i, n]));

    let legal = drMoves(b, turn);
    const candidates = () => legal.filter((m) => m.path[0] === sel && path.every((s, k) => m.path[k] === s));

    function draw() {
      const cand = sel >= 0 ? candidates() : [];
      const next = new Set(cand.map((m) => m.path[path.length]).filter((x) => x !== undefined));
      const movable = !over && mine(ctx, turn) && sel < 0 ? new Set(legal.map((m) => m.path[0])) : new Set();
      for (const [i, n] of sq) {
        const v = b[i];
        const html = v ? piece(drOwner(v), drKing(v)) : '';
        if (n.dataset.v !== String(v)) { n.innerHTML = html; n.dataset.v = String(v); }
        n.classList.toggle('sel', i === sel || path.includes(i));
        n.classList.toggle('to', next.has(i));
        n.classList.toggle('can', movable.has(i));
        n.classList.toggle('last', !!lastMv && (lastMv.path[0] === i || lastMv.path[lastMv.path.length - 1] === i));
      }
      bar.set({ turn: over ? -1 : turn, score: drCount(b).map((n) => 12 - n).reverse(), text: !over && legal.length && legal[0].caps.length && mine(ctx, turn) ? 'You must capture' : null });
    }

    function play(key, p) {
      if (over || p !== turn) return false;
      const mv = legal.find((m) => drKey(m) === key);
      if (!mv) return false;
      const man = !drKing(b[mv.path[0]]);
      const crowned = drPlay(b, mv);
      lastMv = mv; sel = -1; path = [];
      quiet = mv.caps.length || man ? 0 : quiet + 1;
      if (mv.caps.length) { ctx.sfx.unit(); ctx.buzz(20); } else { ctx.sfx.place(); ctx.buzz(8); }
      if (crowned) ctx.toast(`${whoName(ctx, p)} has a new king`);
      turn = 1 - turn;
      legal = drMoves(b, turn);
      if (!legal.length) {
        over = true; draw();
        setTimeout(() => ctx.end({ winner: p, text: drCount(b)[turn] ? `${whoName(ctx, turn)} has no move left` : 'Every piece taken' }), 800);
      } else if (quiet >= QUIET_LIMIT) {
        over = true; draw();
        setTimeout(() => ctx.end({ winner: null, text: 'Forty moves each with no capture' }), 800);
      } else draw();
      return true;
    }

    area.addEventListener('click', (e) => {
      const n = e.target.closest('[data-i]');
      if (!n || over) return;
      if (!mine(ctx, turn)) { ctx.toast('Wait for your turn'); return; }
      const i = +n.dataset.i;
      if (drOwner(b[i]) === turn && path.length <= 1) {
        if (!legal.some((m) => m.path[0] === i)) { ctx.sfx.error(); ctx.toast(legal[0]?.caps.length ? 'You must capture' : 'That piece cannot move'); return; }
        sel = i; path = [i]; ctx.sfx.tap(); draw(); return;
      }
      if (sel < 0) return;
      const cand = candidates().filter((m) => m.path[path.length] === i);
      if (!cand.length) { sel = -1; path = []; draw(); return; }
      path.push(i);
      const done = cand.find((m) => m.path.length === path.length);
      if (done && cand.length === 1) { const p = turn, key = drKey(done); if (play(key, p)) ctx.send({ t: 'move', key, p }); }
      else { ctx.sfx.tap(); draw(); }
    });
    const off = ctx.onMsg((m) => { if (m.t === 'move') play(m.key, m.p); });
    draw();
    const bot = () => {
      if (over || !mine(ctx, turn)) return false;
      const mv = legal[Math.floor(Math.random() * legal.length)], p = turn, key = drKey(mv);
      return play(key, p) && (ctx.send({ t: 'move', key, p }), true);
    };
    return { destroy() { off(); unfit(); }, state: () => ({ b: b.join(''), turn, over }), bot };
  },
};
