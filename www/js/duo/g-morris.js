// Nine Men's Morris: place nine pieces each, then slide them; three in a row (a mill) takes a piece.
import { morrisNew, morrisMoves, morrisLegal, morrisPlay, morrisRemovable, morrisFlying, morrisCount, MORRIS_ADJ, MORRIS_MILLS } from './tbc-rules.js';
import { frame, mover, canAct, turnText, finish, winText, fx, PCOL } from './tbc-ui.js';

// Board position of each point on a 7 x 7 grid (see the numbering in tbc-rules.js).
const PT = [...Array(24)].map((_, i) => {
  const sq = Math.floor(i / 8), k = i % 8, lo = sq, hi = 6 - sq, mid = 3;
  return [[lo, lo], [mid, lo], [hi, lo], [hi, mid], [hi, hi], [mid, hi], [lo, hi], [lo, mid]][k];
});
const LINES = (() => { const seen = new Set(), out = []; MORRIS_ADJ.forEach((n, a) => n.forEach((b) => { const k = Math.min(a, b) + '-' + Math.max(a, b); if (!seen.has(k)) { seen.add(k); out.push([a, b]); } })); return out; })();
const X = (v) => 17 + v * (166 / 6);
const stone = (x, y, p, cls = '') => `<g class="mr-stone ${cls}" transform="translate(${x} ${y})"><circle r="11.5" fill="${PCOL[p]}"/><circle r="11.5" class="mr-shine"/><circle r="6" class="mr-ring"/></g>`;
const boardLines = () => `<rect x="4" y="4" width="192" height="192" rx="10" class="mr-wood"/>${LINES.map(([a, b]) => `<line x1="${X(PT[a][0])}" y1="${X(PT[a][1])}" x2="${X(PT[b][0])}" y2="${X(PT[b][1])}" class="mr-line"/>`).join('')}`;

export default {
  id: 'morris', name: "Nine Men's Morris", tag: 'Make mills, take pieces', realtime: false, cat: 'board',
  art: () => `<svg class="tbc-art-morris" viewBox="0 0 200 200">${boardLines()}${[[0, 0], [8, 1], [16, 0], [3, 1], [11, 1], [21, 0]].map(([i, p]) => stone(X(PT[i][0]), X(PT[i][1]), p)).join('')}</svg>`,
  help: [
    'Take turns placing your nine pieces on the empty points. Three of your pieces in a straight line along the board is a mill.',
    'Each time you make a mill, take one of your friend\'s pieces. You cannot take a piece that is in a mill unless all of their pieces are.',
    'Once every piece is placed, take turns sliding a piece along a line to the next empty point. A mill can be broken and made again.',
    'With only three pieces left you can fly to any empty point. A player with two pieces, or no move, loses. Fifty moves in a row with no mill is a draw.',
  ],
  create(ctx) {
    const s = morrisNew(ctx.first);
    const ui = frame(ctx, 'tbc-morris');
    let sel = -1, flashMill = null;

    function hint() {
      const p = s.turn, who = turnText(ctx, p);
      if (s.remove) return `${who}: mill! Take one of ${ctx.names[1 - p]}'s pieces`;
      if (s.hand[p] > 0) return `${who}: place a piece (${s.hand[p]} left)`;
      if (morrisFlying(s, p)) return `${who}: three left, so you can fly anywhere`;
      return `${who}: slide a piece`;
    }
    function render() {
      const act = canAct(ctx, s.turn) && !s.over && !m.busy;
      const moves = act ? morrisMoves(s) : [];
      const targets = new Set(), from = new Set(), takes = new Set();
      for (const mv of moves) {
        if (mv.k === 'place') targets.add(mv.to);
        if (mv.k === 'remove') takes.add(mv.at);
        if (mv.k === 'move') { from.add(mv.from); if (mv.from === sel) targets.add(mv.to); }
      }
      const last = s.last;
      let g = boardLines();
      if (flashMill) g += flashMill.map((i) => `<circle cx="${X(PT[i][0])}" cy="${X(PT[i][1])}" r="16" class="mr-mill"/>`).join('');
      for (let i = 0; i < 24; i++) {
        const [cx, cy] = PT[i].map(X), p = s.b[i];
        const isLast = last && (last.to === i || last.at === i);
        if (p >= 0) g += stone(cx, cy, p, `${i === sel ? 'sel' : ''} ${takes.has(i) ? 'take' : ''} ${from.has(i) && act ? 'can' : ''} ${isLast ? 'last' : ''}`);
        else g += `<circle cx="${cx}" cy="${cy}" r="${targets.has(i) ? 6 : 4}" class="mr-pt ${targets.has(i) ? 'tgt' : ''} ${last && last.from === i ? 'from' : ''}"/>`;
        g += `<circle cx="${cx}" cy="${cy}" r="15" class="mr-hit" data-pt="${i}"/>`;
      }
      const hand = (p) => `<div class="mr-hand" style="--pc:${PCOL[p]}">${[...Array(s.hand[p])].map(() => '<i></i>').join('')}<span>${s.hand[p] ? `${s.hand[p]} to place` : `${morrisCount(s, p)} on the board`}</span></div>`;
      ui.body.innerHTML = `${hand(1)}<svg class="mr-board" viewBox="0 0 200 200">${g}</svg>${hand(0)}`;
      ui.turn(s.over ? -1 : s.turn);
      ui.score([morrisCount(s, 0) + s.hand[0], morrisCount(s, 1) + s.hand[1]]);
      if (!s.over) ui.status(hint());
    }

    const m = mover(ctx, async (mv) => {
      if (!morrisLegal(s, mv)) return;
      const p = s.turn;
      const r = morrisPlay(s, mv);
      sel = -1;
      if (r.mill) {
        flashMill = MORRIS_MILLS.filter((line) => line.includes(mv.to) && line.every((k) => s.b[k] === p)).flat();
        fx(ctx, 'good');
      } else if (mv.k === 'remove') { fx(ctx, 'bad'); flashMill = null; } else { fx(ctx, 'move'); flashMill = null; }
      render();
      if (s.over) { const t = winText(ctx, s.winner, s.reason ? ` (${s.reason})` : ''); ui.status(t); fx(ctx, 'win'); finish(ctx, s.winner, t); }
    }, () => render());

    ui.body.addEventListener('click', (e) => {
      const h = e.target.closest('[data-pt]');
      if (!h || m.busy || s.over || !canAct(ctx, s.turn)) return;
      const i = +h.dataset.pt, p = s.turn;
      let mv = null;
      if (s.remove) mv = { k: 'remove', at: i };
      else if (s.hand[p] > 0) mv = { k: 'place', to: i };
      else if (s.b[i] === p) { sel = sel === i ? -1 : i; fx(ctx, 'tap'); render(); return; }
      else if (sel >= 0) mv = { k: 'move', from: sel, to: i };
      if (!mv) return;
      if (!morrisLegal(s, mv)) { fx(ctx, 'bad'); if (s.remove && !morrisRemovable(s).includes(i)) ctx.toast && ctx.toast('That piece is in a mill'); return; }
      m.local(mv);
    });
    ctx.onMsg((msg) => { if (msg.t === 'mv') m.remote(msg.m); });
    render();
    return { destroy() { ctx.root.innerHTML = ''; } };
  },
};
