// Chess between two people, on one phone or two. Uses the same rules engine and pieces as the Chess game.
import { fromFEN, legalMoves, makeMove, status, san, toUci, fromUci, inCheck, mFrom, mTo, mPromo, sqName, colourOf, typeOf, WHITE, Q, R, B, N } from '../chess-engine.js';
import { mine, whoName } from './core.js';
import { playerBar, fitBoard } from './ui.js';

const img = (pc) => `img/chess/${colourOf(pc) === WHITE ? 'w' : 'b'}${' PNBRQK'[typeOf(pc)]}.svg`;
const REASON = { checkmate: 'Checkmate', stalemate: 'Stalemate', material: 'Not enough pieces left to mate', fifty: 'Fifty moves with no capture or pawn move', repetition: 'The same position three times' };

export default {
  id: 'chess', name: 'Chess', tag: 'The classic, face to face', cat: 'board', realtime: false,
  art: () => `<div class="art-dchess">${['bR', '', 'bK', '', '', 'bP', '', 'wN', 'wQ', '', 'wP', '', '', 'wK', '', ''].map((p, i) => `<i class="${((i >> 2) + i) % 2 ? 'd' : 'l'}">${p ? `<img src="img/chess/${p}.svg" alt="">` : ''}</i>`).join('')}</div>`,
  help: [
    'The player who goes first has White. Tap a piece, then tap where it should go. Dots show the legal moves.',
    'Every rule applies: castling, en passant, promotion, and draws by stalemate, repetition, the fifty-move rule and too little material.',
    'You can resign, or offer a draw that your friend can accept.',
  ],
  create(ctx) {
    const pos = fromFEN();
    // player `first` plays White
    const colour = (p) => (p === ctx.first ? 0 : 1);
    const playerOf = (c) => (c === 0 ? ctx.first : 1 - ctx.first);
    let over = false, sel = -1, last = null, offer = -1;
    const moves = [];
    const flip = !ctx.local && colour(ctx.me) === 1;
    const sqAt = (k) => { const f = flip ? 7 - (k & 7) : k & 7, r = flip ? k >> 3 : 7 - (k >> 3); return r * 16 + f; };
    ctx.root.innerHTML = '';
    const bar = playerBar(ctx, [0, 1].map((p) => `<img class="dch-sw" src="img/chess/${colour(p) === 0 ? 'w' : 'b'}K.svg" alt="">`));
    const area = document.createElement('div');
    area.className = 'dg-area duo-chess';
    area.innerHTML = `<div class="ch-board">${[...Array(64)].map((_, k) => { const s = sqAt(k), d = ((s >> 4) + (s & 7)) % 2 === 0; return `<div class="ch-sq ${d ? 'd' : 'l'}" data-s="${s}">${(k & 7) === 0 ? `<span class="ch-rank">${(s >> 4) + 1}</span>` : ''}${k >> 3 === 7 ? `<span class="ch-file">${'abcdefgh'[s & 7]}</span>` : ''}</div>`; }).join('')}</div>`;
    const tools = document.createElement('div');
    tools.className = 'dg-tools';
    tools.innerHTML = '<div class="dch-moves"></div><div class="dg-tool-row"><button class="btn ghost" data-act="draw">Offer a draw</button><button class="btn ghost" data-act="resign">Resign</button></div>';
    ctx.root.append(bar.el, area, tools);
    const board = area.querySelector('.ch-board');
    const unfit = fitBoard(area, board, 8, 8, 58);
    const sqs = new Map([...area.querySelectorAll('.ch-sq')].map((n) => [+n.dataset.s, n]));
    const turnPlayer = () => playerOf(pos.turn);

    function draw() {
      const legal = sel >= 0 ? legalMoves(pos).filter((m) => mFrom(m) === sel) : [];
      const to = new Map(legal.map((m) => [mTo(m), !!pos.b[mTo(m)]]));
      const chk = inCheck(pos) ? pos.kings[pos.turn] : -1;
      for (const [s, n] of sqs) {
        const pc = pos.b[s];
        let im = n.querySelector('.ch-pc');
        if (pc) { if (!im) { im = document.createElement('img'); im.className = 'ch-pc'; im.alt = ''; n.appendChild(im); } if (im.dataset.p !== String(pc)) { im.src = img(pc); im.dataset.p = String(pc); } }
        else if (im) im.remove();
        n.classList.toggle('sel', s === sel);
        n.classList.toggle('last', !!last && (s === last[0] || s === last[1]));
        n.classList.toggle('dot', to.has(s) && !to.get(s));
        n.classList.toggle('cap', to.has(s) && to.get(s));
        n.classList.toggle('chk', s === chk);
      }
      tools.querySelector('.dch-moves').innerHTML = moves.length ? moves.map((m, i) => `${i % 2 ? '' : `<i>${i / 2 + 1}.</i>`}${m}`).join(' ') : '<span class="dim">Moves appear here</span>';
      const mv = tools.querySelector('.dch-moves'); mv.scrollLeft = mv.scrollWidth;
      tools.querySelector('[data-act="draw"]').textContent = offer >= 0 && offer !== ctx.me && !ctx.local ? 'Accept the draw' : 'Offer a draw';
      bar.set({ turn: over ? -1 : turnPlayer(), text: !over && inCheck(pos) ? `${whoName(ctx, turnPlayer())} is in check` : null });
    }

    function play(uci, p) {
      if (over || p !== turnPlayer()) return false;
      const m = fromUci(pos, uci);
      if (m === null) return false;
      const note = san(pos, m);
      const cap = !!pos.b[mTo(m)];
      makeMove(pos, m);
      moves.push(note); last = [mFrom(m), mTo(m)]; sel = -1; offer = -1;
      if (cap) { ctx.sfx.unit(); ctx.buzz(15); } else { ctx.sfx.place(); ctx.buzz(8); }
      const st = status(pos);
      if (st.over) {
        over = true; draw();
        setTimeout(() => ctx.end({ winner: st.result === 'draw' ? null : playerOf(st.result === 'white' ? 0 : 1), text: REASON[st.reason] }), 900);
      } else draw();
      return true;
    }

    function choosePromotion(from, to, done) {
      const c = pos.turn === 0 ? 'w' : 'b';
      const box = document.createElement('div');
      box.className = 'ch-promo';
      box.innerHTML = `<div class="ch-promo-box"><p>Promote to</p><div>${[[Q, 'Q'], [R, 'R'], [B, 'B'], [N, 'N']].map(([t, l]) => `<button data-t="${'  nbrq'[t]}"><img src="img/chess/${c}${l}.svg" alt="${l}"></button>`).join('')}</div></div>`;
      area.appendChild(box);
      box.addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); box.remove(); if (b) done(sqName(from) + sqName(to) + b.dataset.t); else { sel = -1; draw(); } });
    }

    function send(uci, p) { if (play(uci, p)) ctx.send({ t: 'move', uci, p }); }

    area.addEventListener('click', (e) => {
      const n = e.target.closest('[data-s]');
      if (!n || over) return;
      const p = turnPlayer();
      if (!mine(ctx, p)) { ctx.toast('Wait for your turn'); return; }
      const s = +n.dataset.s, pc = pos.b[s];
      if (pc && colourOf(pc) === pos.turn) { sel = s === sel ? -1 : s; ctx.sfx.tap(); draw(); return; }
      if (sel < 0) return;
      const cand = legalMoves(pos).filter((m) => mFrom(m) === sel && mTo(m) === s);
      if (!cand.length) { sel = -1; draw(); return; }
      if (cand.some((m) => mPromo(m))) choosePromotion(sel, s, (u) => send(u, p));
      else send(toUci(cand[0]), p);
    });

    tools.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (!a || over) return;
      // the player resigning or offering: on one phone it is whoever is to move
      const me = ctx.local ? turnPlayer() : ctx.me;
      if (a === 'resign') { ctx.send({ t: 'resign', p: me }); resign(me); }
      else if (a === 'draw') {
        if (ctx.local || (offer >= 0 && offer !== me)) { ctx.send({ t: 'agree' }); agree(); }
        else { offer = me; ctx.send({ t: 'offer', p: me }); ctx.toast('Draw offered'); draw(); }
      }
    });
    function resign(p) { if (over) return; over = true; draw(); ctx.end({ winner: 1 - p, text: `${whoName(ctx, p)} resigned` }); }
    function agree() { if (over) return; over = true; draw(); ctx.end({ winner: null, text: 'Draw agreed' }); }

    const off = ctx.onMsg((m) => {
      if (m.t === 'move') play(m.uci, m.p);
      else if (m.t === 'resign') resign(m.p);
      else if (m.t === 'agree') agree();
      else if (m.t === 'offer') { offer = m.p; ctx.toast(`${whoName(ctx, m.p)} offers a draw`); draw(); }
    });
    draw();
    const bot = () => {
      if (over || !mine(ctx, turnPlayer())) return false;
      // long random games can go on for ever, so the test bots agree a draw after 120 moves
      if (moves.length >= 120) { ctx.send({ t: 'agree' }); agree(); return true; }
      const lm = legalMoves(pos), m = lm[Math.floor(Math.random() * lm.length)], p = turnPlayer();
      send(toUci(m), p);
      return true;
    };
    return { destroy() { off(); unfit(); }, state: () => ({ moves: moves.join(' '), over }), bot };
  },
};
