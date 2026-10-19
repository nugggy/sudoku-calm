// Memory Duel: one shared grid of face-down animal pairs. Take turns turning over two cards; a match
// scores and you go again. Both phones get the same deal from the shared seed.
import { memoryNew, memoryLegal, memoryFlip } from './tbc-rules.js';
import { frame, mover, canAct, turnText, finish, winText, fx, esc } from './tbc-ui.js';

// Kenney Animal Pack Redux (CC0), already in the app.
const ANIMALS = ['bear', 'buffalo', 'chick', 'chicken', 'cow', 'crocodile', 'dog', 'duck', 'elephant', 'frog', 'giraffe', 'goat', 'gorilla', 'hippo', 'horse',
  'monkey', 'moose', 'narwhal', 'owl', 'panda', 'parrot', 'penguin', 'pig', 'rabbit', 'rhino', 'sloth', 'snake', 'walrus', 'whale', 'zebra'];
const img = (k) => `img/kenney/animals/${ANIMALS[k]}.png`;
const SIZES = [{ pairs: 8, cols: 4, label: 'Small', sub: '16 cards' }, { pairs: 10, cols: 4, label: 'Medium', sub: '20 cards' }, { pairs: 15, cols: 5, label: 'Large', sub: '30 cards' }];

export default {
  id: 'memory', name: 'Memory Duel', tag: 'Find more animal pairs than your friend', realtime: false, cat: 'party',
  art: () => `<div class="tbc-art-memory">${[6, -1, 23, -1].map((k) => `<div class="mm-card ${k < 0 ? 'back' : ''}">${k >= 0 ? `<img src="${img(k)}" alt="">` : ''}</div>`).join('')}</div>`,
  help: [
    'All the cards start face down. On your turn, turn over two cards.',
    'If they match, you keep the pair and go again. If not, everyone gets a good look, they turn back over and it is your friend\'s turn.',
    'When every pair has been found, the player with the most pairs wins.',
  ],
  create(ctx) {
    const ui = frame(ctx, 'tbc-memory');
    let s = null, size = null, peek = null, peekTimer = 0;

    // The host picks the board size; on one phone either player can.
    function picker() {
      ui.turn(-1); ui.score(null);
      if (!ctx.local && !ctx.isHost) { ui.status(''); ui.body.innerHTML = '<div class="wd-wait"><div class="spinner"></div>Waiting for the board size</div>'; return; }
      ui.status('Choose a board');
      ui.body.innerHTML = `<div class="mm-sizes">${SIZES.map((z, i) => `<button type="button" class="btn secondary" data-size="${i}">${z.label}<small>${z.sub}</small></button>`).join('')}</div>`;
    }
    function start(i) {
      size = SIZES[i];
      s = memoryNew(ctx.first, size.pairs, ctx.rng, ANIMALS.length);
      render();
    }
    function render() {
      ui.turn(s.over ? -1 : s.turn);
      ui.score(s.score);
      if (!s.over) ui.status(turnText(ctx, s.turn) + (canAct(ctx, s.turn) ? (s.up.length ? ': turn over one more' : ': turn over two cards') : ''));
      const shown = new Set([...s.up, ...(peek || [])]);
      ui.body.innerHTML = `<div class="mm-grid" style="--cols:${size.cols}">${s.cards.map((k, i) => {
        const gone = s.gone.includes(i), up = shown.has(i);
        return `<button type="button" class="mm-card ${up || gone ? 'up' : ''} ${gone ? 'gone' : ''} ${peek && peek.includes(i) ? 'miss' : ''}" data-c="${i}" aria-label="${up || gone ? esc(ANIMALS[k]) : 'Face-down card'}">
          <span class="mm-back"></span><span class="mm-face"><img src="${img(k)}" alt=""></span></button>`;
      }).join('')}</div>`;
    }

    const m = mover(ctx, async (mv) => {
      if (mv.k === 'size') { if (!s) start(mv.i); return; }
      if (!s || !memoryLegal(s, mv.i)) return;
      clearTimeout(peekTimer); peek = null;
      const r = memoryFlip(s, mv.i);
      if (r.first) fx(ctx, 'tap');
      else if (r.match) fx(ctx, 'good');
      else {
        // a miss stays face up for a moment on both phones, then turns back over
        fx(ctx, 'soft');
        peek = r.pair;
        peekTimer = setTimeout(() => { if (!ctx.alive() || !s) return; peek = null; render(); }, 1300);
      }
      render();
      if (s.over) { const t = winText(ctx, s.winner, `, ${Math.max(...s.score)} pairs to ${Math.min(...s.score)}`); ui.status(t); fx(ctx, 'win'); finish(ctx, s.winner, t); }
    }, () => render());

    ui.body.addEventListener('click', (e) => {
      const z = e.target.closest('[data-size]');
      if (z && !s) { m.local({ k: 'size', i: +z.dataset.size }); return; }
      const c = e.target.closest('[data-c]');
      if (!c || !s || s.over || m.busy || !canAct(ctx, s.turn)) return;
      const i = +c.dataset.c;
      if (!memoryLegal(s, i)) return;
      m.local({ k: 'flip', i });
    });
    ctx.onMsg((msg) => { if (msg.t === 'mv') m.remote(msg.m); });
    picker();
    return { destroy() { clearTimeout(peekTimer); ctx.root.innerHTML = ''; } };
  },
};
