// Mancala (Kalah): sow seeds round the board, land in your store for another turn, capture from an empty pit.
import { kalahNew, kalahLegal, kalahPlay, storeOf, pitsOf } from './tbc-rules.js';
import { frame, mover, canAct, turnText, viewer, finish, winText, fx, sleep, label, esc } from './tbc-ui.js';

const SEED_COLS = ['#e8604c', '#3b7ddd', '#f2b631', '#3fae6a', '#9a7cf0', '#f08a4b', '#2bb5b8'];
// Seed positions inside a pit are fixed per (pit, seed number), so a pit looks the same on both phones.
function seedSpots(pit, n, w, h) {
  let x = (pit * 9301 + 49297) % 233280;
  const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.36;
    out.push([50 + Math.cos(a) * r * w, 50 + Math.sin(a) * r * h, SEED_COLS[Math.floor(rnd() * SEED_COLS.length)]]);
  }
  return out;
}
const seedsHTML = (pit, n, w = 100, h = 100) => seedSpots(pit, Math.min(n, 24), w, h).map(([x, y, c]) => `<i style="left:${x}%;top:${y}%;--sc:${c}"></i>`).join('');

export default {
  id: 'mancala', name: 'Mancala', tag: 'Sow the seeds, fill your store', realtime: false, cat: 'board',
  art: () => `<div class="tbc-art-mancala">${[3, 5, 2, 4].map((n, i) => `<div class="mc-pit"><div class="mc-seeds">${seedsHTML(i + 3, n)}</div></div>`).join('')}</div>`,
  help: [
    'Each player owns six pits and a store. Your pits run down the left, and your store is at the bottom.',
    'Tap one of your pits to pick up all its seeds and sow them one at a time anticlockwise into the following pits, including your own store but skipping your friend\'s.',
    'If the last seed lands in your store, you go again. If it lands in an empty pit on your side, you capture it and every seed in the pit opposite.',
    'When one side runs out of seeds, the other player keeps what is left on their side. Most seeds in the store wins.',
  ],
  create(ctx) {
    const s = kalahNew(ctx.first);
    const ui = frame(ctx, 'tbc-mancala');
    const me = viewer(ctx), them = 1 - me;
    let shown = s.pits.slice(), hot = -1, flash = null;

    // Portrait board: their store at the top, my store at the bottom, my pits down the left-hand side and
    // theirs up the right, so sowing runs anticlockwise.
    function render() {
      const pit = (i, side) => {
        const mine = pitsOf(s.turn).includes(i) && canAct(ctx, s.turn) && !s.over && !m.busy && shown[i] > 0;
        return `<button class="mc-pit ${side} ${mine ? 'can' : ''} ${i === s.last ? 'last' : ''} ${i === hot ? 'hot' : ''} ${flash && flash.includes(i) ? 'cap' : ''}" data-pit="${i}" aria-label="Pit with ${shown[i]} seeds">
          <div class="mc-seeds">${seedsHTML(i, shown[i])}</div><b>${shown[i]}</b></button>`;
      };
      const store = (p) => `<div class="mc-store ${p === me ? 'mine' : 'theirs'} ${hot === storeOf(p) ? 'hot' : ''}" style="--pc:${p ? '#3b7ddd' : '#e8604c'}">
        <div class="mc-seeds">${seedsHTML(storeOf(p), shown[storeOf(p)], 100, 40)}</div><b>${shown[storeOf(p)]}</b><span>${esc(label(ctx, p))}</span></div>`;
      const mine = pitsOf(me), theirs = pitsOf(them);
      ui.body.innerHTML = `<div class="mc-board">${store(them)}
        <div class="mc-cols"><div class="mc-col">${mine.map((i) => pit(i, 'mine')).join('')}</div>
        <div class="mc-col">${theirs.slice().reverse().map((i) => pit(i, 'theirs')).join('')}</div></div>${store(me)}</div>`;
      ui.turn(s.over ? -1 : s.turn);
      ui.score([s.pits[6], s.pits[13]]);
      if (!s.over) ui.status(turnText(ctx, s.turn) + (canAct(ctx, s.turn) ? ': tap a pit on your side' : ''));
    }

    const m = mover(ctx, async (i) => {
      if (!kalahLegal(s, i)) return;
      const before = s.pits.slice();
      const r = kalahPlay(s, i);
      // animate the sowing seed by seed, then show any capture or end-of-game sweep
      shown = before; shown[i] = 0; hot = i; render(); fx(ctx, 'tap');
      for (const at of r.trace) { await sleep(150); if (!ctx.alive()) return; shown[at]++; hot = at; render(); fx(ctx, 'soft'); }
      await sleep(200);
      if (r.capture) { flash = [r.capture.pit, r.capture.opp]; render(); fx(ctx, 'good'); ctx.toast && ctx.toast(`${ctx.names[r.player]} captures ${r.capture.seeds}`); await sleep(650); flash = null; }
      else if (r.extra && !s.over) { fx(ctx, 'good'); ctx.toast && ctx.toast(`${ctx.names[r.player]} goes again`); }
      shown = s.pits.slice(); hot = -1; render();
      if (s.over) {
        const sc = `, ${Math.max(s.pits[6], s.pits[13])} to ${Math.min(s.pits[6], s.pits[13])}`;
        ui.status(winText(ctx, s.winner, sc)); fx(ctx, 'win');
        finish(ctx, s.winner, winText(ctx, s.winner, sc));
      }
    }, () => render());

    ui.body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pit]');
      if (!b || m.busy || s.over) return;
      const i = +b.dataset.pit;
      if (!canAct(ctx, s.turn) || !kalahLegal(s, i)) { fx(ctx, 'bad'); return; }
      m.local(i);
    });
    ctx.onMsg((msg) => { if (msg.t === 'mv') m.remote(msg.m); });
    render();
    return { destroy() { ctx.root.innerHTML = ''; } };
  },
};
