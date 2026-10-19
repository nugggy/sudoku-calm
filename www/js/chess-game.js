// Chess: play the computer at eight levels, or pass and play with a friend on one phone.
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, sheet, dialog, toast, confetti, esc } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet } from './kit.js';
import {
  START_FEN, WHITE, BLACK, P, N, B, R, Q, K, colourOf, typeOf, sqOf, fileOf, rankOf, sqName, parseSq,
  mFrom, mTo, mPromo, mFlag, CAP, replay, makeMove, legalMoves, status, san, toUci, inCheck, search, VALUE,
} from './chess-engine.js';

const CB = () => store.chess;
export const LEVEL_NAMES = ['', 'Beginner', 'Novice', 'Casual', 'Club', 'Strong', 'Expert', 'Master', 'Champion'];
const PIECE_NAMES = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
const img = (pc) => `img/chess/${colourOf(pc) === WHITE ? 'w' : 'b'}${' PNBRQK'[typeOf(pc)]}.svg`;
const pieceImg = (c, t) => `img/chess/${c}${' PNBRQK'[t]}.svg`;

export const chessHelp = () => helpSheet('How to play Chess', [
  'Each side has a king, a queen, two rooks, two bishops, two knights and eight pawns. White moves first, then you take turns.',
  'Tap a piece to see where it can go, then tap a highlighted square. You can also drag pieces. Moving onto an enemy piece captures it.',
  'Put the enemy king in check so it has no way out. That is checkmate, and it wins the game.',
  'Special moves: castling (move the king two squares towards a rook that has not moved), en passant, and promotion when a pawn reaches the far side.',
  'The game is a draw by stalemate (no legal move but not in check), threefold repetition, the fifty-move rule, or when neither side has enough pieces to mate.',
  'Against the computer, pick a level from Beginner to Champion. Undo takes back your last move, and Hint shows a good move. In two-player mode, the board can turn round after every move.',
], 'chess-btn');

// ---------- Worker ----------
let worker = null, reqId = 0;
const pending = new Map();
function getWorker() {
  if (!worker) {
    try {
      worker = new Worker(new URL('./chess-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => { const p = pending.get(e.data.id); if (p) { pending.delete(e.data.id); p(e.data); } };
      worker.onerror = () => { worker = null; };
    } catch { worker = null; }
  }
  return worker;
}
function think(fen, moves, level, time) {
  const w = getWorker();
  if (!w) {
    return new Promise((resolve) => setTimeout(() => {
      const r = search(replay(fen, moves), { level, time });
      resolve({ move: r.move === null ? null : toUci(r.move) });
    }, 30));
  }
  return new Promise((resolve) => { const id = ++reqId; pending.set(id, resolve); w.postMessage({ id, fen, moves, level, time }); });
}

// ---------- Art ----------
function miniBoard(cls, cells) {
  // cells: 16 entries (4 x 4, top row first), each '' or a piece code such as 'wK'
  return `<div class="${cls}">${cells.map((c, i) => `<i class="${(Math.floor(i / 4) + i) % 2 ? 'd' : 'l'}">${c ? `<img src="img/chess/${c}.svg" alt="">` : ''}</i>`).join('')}</div>`;
}
export const chessCardArt = () => miniBoard('art-chess', ['', 'bK', '', '', 'bP', '', '', '', '', '', 'wN', '', '', 'wQ', '', 'wK']);
const heroArt = () => miniBoard('ch-hero', ['bR', '', 'bK', '', '', 'bP', 'bP', '', '', 'wB', '', 'wN', 'wQ', '', 'wK', '']);

// ---------- Home ----------
export function chessHomeScreen(app) {
  const cb = CB();
  const root = el(`<section class="screen chess-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title"></div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  function render() {
    const cur = cb.current, st = cb.stats;
    const contSub = cur ? (cur.mode === 'ai' ? `Against the computer, ${LEVEL_NAMES[cur.level]}` : 'Two players') + ` · move ${Math.floor(cur.moves.length / 2) + 1}` : '';
    body.innerHTML = `<div class="kit-hero">${heroArt()}</div><h1 class="kit-title">Chess</h1>
      ${cur ? `<button class="btn kit-btn" data-act="continue">Continue game<small>${esc(contSub)}</small></button>` : ''}
      <div class="section-title">Play the computer</div>
      <div class="card ch-card">
        <div class="ch-levels">${LEVEL_NAMES.slice(1).map((n, i) => `<button class="ch-level ${cb.level === i + 1 ? 'on' : ''}" data-level="${i + 1}"><b>${i + 1}</b>${n}</button>`).join('')}</div>
        <div class="ch-row"><span>Play as</span><div class="seg" data-seg="colour">${[['w', 'White'], ['r', 'Random'], ['b', 'Black']].map(([v, l]) => `<button data-v="${v}" class="${cb.colour === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <button class="btn ${cur ? 'secondary' : 'kit-btn'}" data-act="ai">New game<small>${LEVEL_NAMES[cb.level]} level</small></button>
      </div>
      <div class="section-title">Two players</div>
      <div class="card ch-card">
        <button class="set-row ch-toggle" data-act="flip"><div class="txt">Turn the board after each move<small>So each player sees their own pieces at the bottom</small></div><div class="switch ${cb.flip ? 'on' : ''}"></div></button>
        <button class="btn secondary" data-act="two">Start a two-player game</button>
      </div>
      <div class="home-streak ch-stats"><div><b>${st.won}</b>Won</div><div><b>${st.drawn}</b>Drawn</div><div><b>${st.lost}</b>Lost</div><div><b>${st.bestLevelBeaten ? LEVEL_NAMES[st.bestLevelBeaten] : '-'}</b>Best win</div></div>`;
  }
  async function start(mode) {
    if (cb.current && cb.current.moves.length) {
      const ok = await dialog({ title: 'Start a new game?', text: 'Your game in progress will be lost.', buttons: [{ label: 'New game', value: true }, { label: 'Cancel', value: false, cls: 'ghost' }] });
      if (!ok) return;
    }
    const human = mode === 'ai' ? (cb.colour === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : cb.colour) : 'w';
    cb.current = { mode, level: cb.level, human, fen: START_FEN, moves: [], view: human };
    save(true);
    app.go('chessgame');
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    const lv = e.target.closest('[data-level]');
    const sb = e.target.closest('[data-seg] button');
    if (lv) { cb.level = +lv.dataset.level; save(); sfx.tap(); render(); return; }
    if (sb) { cb.colour = sb.dataset.v; save(); sfx.tap(); render(); return; }
    if (a === 'back') app.back();
    else if (a === 'help') chessHelp();
    else if (a === 'continue') app.go('chessgame');
    else if (a === 'ai') start('ai');
    else if (a === 'two') start('two');
    else if (a === 'flip') { cb.flip = !cb.flip; save(); sfx.tap(); render(); }
  });
  render();
  return { root, refresh: render };
}

// ---------- Game ----------
const START_COUNT = [0, 8, 2, 2, 2, 1, 0];

export function chessGameScreen(app) {
  const cb = CB();
  const g = cb.current;
  if (!g) { setTimeout(() => app.back(), 0); return { root: el('<section class="screen chess-theme"></section>') }; }
  const ai = g.mode === 'ai';
  let pos = replay(g.fen, g.moves);
  let sans = [], legal = [], sel = -1, hint = null, thinking = false, token = 0, over = null, alive = true, lastMove = null;

  const root = el(`<section class="screen chess-theme chess-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">${ai ? `${LEVEL_NAMES[g.level]} level` : 'Two players'}</div>
      <button class="icon-btn" data-act="turn" aria-label="Turn the board round"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v13M3.5 13.5 7 17l3.5-3.5M17 20V7M13.5 10.5 17 7l3.5 3.5"/></svg></button>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="ch-mid" data-el="mid">
      <div class="ch-player" data-el="top"></div>
      <div class="ch-wrap" data-el="wrap"><div class="ch-board" data-el="board"></div></div>
      <div class="ch-player" data-el="bottom"></div>
    </div>
    <div class="ch-moves" data-el="moves"></div>
    <div class="ch-bar">
      <button class="ch-tool" data-act="undo"><span class="ch-round">${icon.undo}</span>Undo</button>
      <button class="ch-tool" data-act="hint"><span class="ch-round">${icon.bulb}</span>Hint</button>
      <button class="ch-tool" data-act="end"><span class="ch-round"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg></span>${ai ? 'Resign' : 'Draw or resign'}</button>
      <button class="ch-tool" data-act="new"><span class="ch-round">${icon.plus}</span>New game</button>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const boardEl = q('board'), wrap = q('wrap');

  const view = () => (g.view === 'b' ? BLACK : WHITE);
  const humanTurn = () => !ai || pos.turn === (g.human === 'w' ? WHITE : BLACK);
  // screen cell (0-63, top-left first) <-> board square
  const cellSq = (i) => { const r = Math.floor(i / 8), c = i % 8; return view() === WHITE ? sqOf(c, 7 - r) : sqOf(7 - c, r); };
  const sqCell = (s) => (view() === WHITE ? (7 - rankOf(s)) * 8 + fileOf(s) : rankOf(s) * 8 + (7 - fileOf(s)));

  // the game object lives in the store, so saving is enough (and a newer game is never overwritten)
  function persist() { if (!over && cb.current === g) save(); }
  function rebuild() {
    pos = replay(g.fen, g.moves);
    // notation, worked out on a fresh copy so each move sees its own position
    const p2 = replay(g.fen, []);
    sans = [];
    for (const u of g.moves) { const L = legalMoves(p2), m = L.find((x) => toUci(x) === u); if (m === undefined) break; sans.push(san(p2, m, L)); makeMove(p2, m); }
    const last = pos.stack[pos.stack.length - 1];
    lastMove = last ? [mFrom(last.m), mTo(last.m)] : null;
    legal = legalMoves(pos);
  }

  function capturedHTML(colour) {
    // pieces of `colour` that have been taken
    const have = [0, 0, 0, 0, 0, 0, 0];
    for (let s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } const pc = pos.b[s]; if (pc && colourOf(pc) === colour) have[typeOf(pc)]++; }
    let out = '';
    for (const t of [P, N, B, R, Q]) for (let k = have[t]; k < START_COUNT[t]; k++) out += `<img src="${pieceImg(colour === WHITE ? 'w' : 'b', t)}" alt="">`;
    return out;
  }
  function material(colour) {
    let m = 0;
    for (let s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } const pc = pos.b[s]; if (pc && typeOf(pc) !== K) m += (colourOf(pc) === colour ? 1 : -1) * VALUE[typeOf(pc)]; }
    return Math.round(m / 100);
  }
  function playerHTML(colour) {
    const name = ai ? (colour === (g.human === 'w' ? WHITE : BLACK) ? 'You' : `Computer · ${LEVEL_NAMES[g.level]}`) : colour === WHITE ? 'White' : 'Black';
    const toMove = !over && pos.turn === colour;
    const diff = material(colour);
    const note = toMove ? (thinking && !humanTurn() ? '<span class="ch-think">Thinking<i></i><i></i><i></i></span>' : inCheck(pos) ? '<span class="ch-note chk">Check</span>' : '<span class="ch-note">To move</span>') : '';
    return `<span class="ch-dot ${colour === WHITE ? 'w' : 'b'} ${toMove ? 'on' : ''}"></span><b>${name}</b>
      <span class="ch-caps">${capturedHTML(colour ^ 1)}${diff > 0 ? `<em>+${diff}</em>` : ''}</span>${note}`;
  }

  function render(anim) {
    const v = view();
    const targets = sel >= 0 ? legal.filter((m) => mFrom(m) === sel) : [];
    const tset = new Map(targets.map((m) => [mTo(m), m]));
    const chkSq = inCheck(pos) ? pos.kings[pos.turn] : -1;
    let html = '';
    for (let i = 0; i < 64; i++) {
      const s = cellSq(i), r = Math.floor(i / 8), c = i % 8, pc = pos.b[s];
      const cls = ['ch-sq', (fileOf(s) + rankOf(s)) % 2 ? 'l' : 'd'];
      if (lastMove && (s === lastMove[0] || s === lastMove[1])) cls.push('last');
      if (s === sel) cls.push('sel');
      if (s === chkSq) cls.push('chk');
      if (hint && (s === hint[0] || s === hint[1])) cls.push('hint');
      if (tset.has(s)) cls.push(pc || mFlag(tset.get(s)) & CAP ? 'cap' : 'dot');
      html += `<div class="${cls.join(' ')}" data-sq="${s}">`;
      if (c === 0) html += `<span class="ch-rank">${rankOf(s) + 1}</span>`;
      if (r === 7) html += `<span class="ch-file">${'abcdefgh'[fileOf(s)]}</span>`;
      if (pc) html += `<img class="ch-pc" src="${img(pc)}" alt="${colourOf(pc) === WHITE ? 'White' : 'Black'} ${PIECE_NAMES[typeOf(pc)]}" draggable="false">`;
      html += '</div>';
    }
    boardEl.innerHTML = html;
    boardEl.classList.toggle('flipped', v === BLACK);
    q('top').innerHTML = playerHTML(v ^ 1);
    q('bottom').innerHTML = playerHTML(v);
    // move list
    let ml = '';
    for (let i = 0; i < sans.length; i += 2) ml += `<span class="ch-mv"><i>${i / 2 + 1}.</i>${esc(sans[i])}${sans[i + 1] ? ` ${esc(sans[i + 1])}` : ''}</span>`;
    const mv = q('moves');
    mv.innerHTML = ml || '<span class="ch-mv empty">Moves appear here</span>';
    mv.scrollLeft = mv.scrollWidth;
    $('[data-act="undo"]', root).classList.toggle('off', !canUndo());
    $('[data-act="hint"]', root).classList.toggle('off', !!over || !humanTurn());
    $('[data-act="end"]', root).classList.toggle('off', !!over);
    if (anim) slide(anim);
  }
  // slides the moved piece from its old square (FLIP animation)
  function slide([f, t]) {
    const to = $(`[data-sq="${t}"] .ch-pc`, boardEl), fromCell = $(`[data-sq="${f}"]`, boardEl), toCell = $(`[data-sq="${t}"]`, boardEl);
    if (!to || !fromCell || !toCell) return;
    const a = fromCell.getBoundingClientRect(), b = toCell.getBoundingClientRect();
    to.style.transition = 'none';
    to.style.transform = `translate(${a.left - b.left}px,${a.top - b.top}px)`;
    to.style.zIndex = 3;
    void to.offsetWidth;
    to.style.transition = 'transform .2s ease-out';
    to.style.transform = '';
    setTimeout(() => { to.style.zIndex = ''; }, 220);
  }

  function layout() {
    const mid = q('mid'), w = mid.clientWidth - 28, h = mid.clientHeight - q('top').offsetHeight - q('bottom').offsetHeight - 26;
    const size = Math.max(200, Math.floor(Math.min(w, h, 560) / 8) * 8);
    boardEl.style.width = boardEl.style.height = size + 'px';
  }

  function canUndo() {
    if (over || !g.moves.length) return false;
    if (!ai) return true;
    return g.moves.length >= (g.human === 'w' ? 1 : 2);
  }

  function play(m, animate = true) {
    const u = toUci(m), cap = mFlag(m) & CAP;
    sans.push(san(pos, m, legal));
    g.moves.push(u);
    makeMove(pos, m);
    lastMove = [mFrom(m), mTo(m)];
    legal = legalMoves(pos);
    sel = -1; hint = null;
    if (inCheck(pos)) sfx.hint(); else if (cap) { sfx.cross(); buzz(15); } else sfx.place();
    const st = status(pos);
    if (st.over) { persist(); render(animate ? lastMove : null); finish(st); return; }
    if (!ai && cb.flip) g.view = pos.turn === WHITE ? 'w' : 'b';
    persist();
    render(animate && !(!ai && cb.flip) ? lastMove : null);
    if (ai && !humanTurn()) computerMove();
  }

  async function computerMove() {
    const my = ++token;
    thinking = true; render();
    const t0 = Date.now();
    const r = await think(g.fen, g.moves.slice(), g.level);
    const wait = 450 - (Date.now() - t0);
    if (wait > 0) await new Promise((res) => setTimeout(res, wait));
    if (!alive || my !== token) return;
    thinking = false;
    const m = r.move && legal.find((x) => toUci(x) === r.move);
    if (m === undefined || m === null) { render(); return; }
    play(m);
  }

  async function finish(st, resignedBy = -1, agreed = false) {
    over = st;
    thinking = false; token++;
    const humanC = g.human === 'w' ? WHITE : BLACK;
    const winner = st.result === 'white' ? WHITE : st.result === 'black' ? BLACK : -1;
    if (ai) {
      const s = cb.stats;
      s.played++;
      if (winner === -1) s.drawn++;
      else if (winner === humanC) { s.won++; s.bestLevelBeaten = Math.max(s.bestLevelBeaten, g.level); } else s.lost++;
    }
    cb.current = null; save(true);
    render();
    const why = { checkmate: 'Checkmate.', stalemate: 'Stalemate: no legal move, but not in check.', repetition: 'The same position came up three times.', fifty: 'Fifty moves without a capture or a pawn move.', material: 'Neither side has enough pieces left to checkmate.' }[st.reason] || '';
    let title, text;
    if (resignedBy >= 0) {
      title = ai ? (resignedBy === humanC ? 'You resigned' : 'The computer resigned') : `${resignedBy === WHITE ? 'White' : 'Black'} resigned`;
      text = ai ? (resignedBy === humanC ? 'Better luck next game.' : 'You win.') : `${resignedBy === WHITE ? 'Black' : 'White'} wins.`;
    } else if (agreed) { title = 'Draw agreed'; text = 'The game ends in a draw.'; }
    else if (winner === -1) { title = 'Draw'; text = why; }
    else if (ai) { title = winner === humanC ? 'You won' : 'The computer won'; text = winner === humanC ? `${why} You beat the computer at ${LEVEL_NAMES[g.level]} level.` : `${why} Try again, or pick an easier level.`; }
    else { title = `${winner === WHITE ? 'White' : 'Black'} wins`; text = why; }
    if (ai ? winner === humanC : winner >= 0) { sfx.win(); confetti(); } else if (winner === -1) sfx.unit();
    await new Promise((res) => setTimeout(res, 700));
    if (!alive) return;
    const v = await dialog({
      hero: winner === -1 ? 'img/art/ui/sports-medal.svg' : !ai || winner === humanC ? 'img/art/ui/trophy.svg' : pieceImg(winner === WHITE ? 'w' : 'b', K), title, text,
      buttons: [{ label: 'Play again', value: 'again' }, { label: 'Look at the board', value: 'look', cls: 'secondary' }, { label: 'Back', value: 'back', cls: 'ghost' }],
    });
    if (v === 'again') newGame(true);
    else if (v === 'back') app.back();
  }

  function newGame(skipAsk) {
    const go = () => {
      const human = ai ? (cb.colour === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : g.human) : 'w';
      cb.current = { mode: g.mode, level: g.level, human, fen: START_FEN, moves: [], view: human };
      save(true);
      app.replace('chessgame');
    };
    if (skipAsk || over || !g.moves.length) return go();
    dialog({ title: 'Start a new game?', text: 'This game will be lost.', buttons: [{ label: 'New game', value: true }, { label: 'Cancel', value: false, cls: 'ghost' }] }).then((ok) => ok && go());
  }

  function tryMove(from, to) {
    const ms = legal.filter((m) => mFrom(m) === from && mTo(m) === to);
    if (!ms.length) return false;
    if (ms.length > 1 && mPromo(ms[0])) { choosePromo(ms); return true; }
    play(ms[0], false);
    return true;
  }
  function choosePromo(ms) {
    const c = pos.turn === WHITE ? 'w' : 'b';
    const pop = el(`<div class="ch-promo"><div class="ch-promo-box"><p>Promote to</p><div>${[Q, R, B, N].map((t) => `<button data-t="${t}" aria-label="${PIECE_NAMES[t]}"><img src="${pieceImg(c, t)}" alt=""></button>`).join('')}</div></div></div>`);
    wrap.appendChild(pop);
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]');
      pop.remove();
      if (!b) { sel = -1; render(); return; }
      play(ms.find((m) => mPromo(m) === +b.dataset.t), false);
    });
  }

  // ---------- Input: tap a piece then a square, or drag ----------
  let drag = null;
  const sqAt = (x, y) => { const c = document.elementFromPoint(x, y)?.closest('[data-sq]'); return c && boardEl.contains(c) ? +c.dataset.sq : -1; };
  const ownPiece = (s) => { const pc = pos.b[s]; return pc && colourOf(pc) === pos.turn; };
  boardEl.addEventListener('pointerdown', (e) => {
    if (over || !humanTurn() || thinking) return;
    const s = sqAt(e.clientX, e.clientY);
    if (s < 0) return;
    if (sel >= 0 && s !== sel && !ownPiece(s)) {
      if (tryMove(sel, s)) return;
      sfx.error(); sel = -1; render(); return;
    }
    if (!ownPiece(s)) { if (sel >= 0) { sel = -1; render(); } return; }
    const wasSel = sel === s;
    sel = s; hint = null; sfx.tap(); render();
    const pc = $(`[data-sq="${s}"] .ch-pc`, boardEl);
    drag = { s, x: e.clientX, y: e.clientY, pc, moving: false, wasSel, id: e.pointerId };
    boardEl.setPointerCapture?.(e.pointerId);
  });
  boardEl.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moving && Math.hypot(dx, dy) > 6) { drag.moving = true; drag.pc?.classList.add('drag'); }
    if (drag.moving && drag.pc) {
      drag.pc.style.transform = `translate(${dx}px,${dy}px) scale(1.18)`;
      $$('.ch-sq.over', boardEl).forEach((c) => c.classList.remove('over'));
      const t = sqAt(e.clientX, e.clientY);
      if (t >= 0) $(`[data-sq="${t}"]`, boardEl)?.classList.add('over');
    }
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.moving) { if (d.wasSel) { sel = -1; render(); } return; }
    if (d.pc) { d.pc.style.transform = ''; d.pc.classList.remove('drag'); }
    const t = sqAt(e.clientX, e.clientY);
    if (t >= 0 && t !== d.s && tryMove(d.s, t)) return;
    render();
  };
  boardEl.addEventListener('pointerup', endDrag);
  boardEl.addEventListener('pointercancel', endDrag);

  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (!a) return;
    if (a === 'back') return app.back();
    if (a === 'help') return chessHelp();
    if (a === 'turn') { g.view = g.view === 'b' ? 'w' : 'b'; persist(); sfx.tap(); render(); return; }
    if (a === 'new') return newGame(false);
    if (over) return;
    if (a === 'undo') {
      if (!canUndo()) { toast('Nothing to undo'); return; }
      token++; thinking = false;
      if (ai) {
        const humanC = g.human === 'w' ? WHITE : BLACK;
        let removedHuman = false;
        while (g.moves.length) {
          const mover = g.moves.length % 2 === 1 ? WHITE : BLACK; // the start position always has White to move
          g.moves.pop();
          if (mover === humanC) removedHuman = true;
          if (removedHuman) break;
        }
      } else {
        g.moves.pop();
        if (cb.flip) g.view = g.moves.length % 2 ? 'b' : 'w';
      }
      sel = -1; hint = null; sfx.erase();
      rebuild(); persist(); render();
    } else if (a === 'hint') {
      if (!humanTurn() || thinking) return;
      toast('Looking for a good move');
      const my = token;
      const r = await think(g.fen, g.moves.slice(), 6, 900);
      if (!alive || my !== token || over || !r.move) return;
      hint = [parseSq(r.move.slice(0, 2)), parseSq(r.move.slice(2, 4))];
      sel = -1; sfx.hint(); render();
    } else if (a === 'end') {
      const humanC = g.human === 'w' ? WHITE : BLACK;
      const turnName = pos.turn === WHITE ? 'White' : 'Black';
      sheet(`<h2>${ai ? 'End the game' : 'Draw or resign'}</h2>
        <button class="sheet-item" data-x="draw">${ai ? 'Offer a draw' : 'Agree a draw'}</button>
        <button class="sheet-item" data-x="resign">${ai ? 'Resign' : `${turnName} resigns`}</button>`, {
        onMount(node, close) {
          node.addEventListener('click', (ev) => {
            const x = ev.target.closest('[data-x]')?.dataset.x;
            if (!x) return;
            close();
            if (x === 'resign') {
              const loser = ai ? humanC : pos.turn;
              finish({ over: true, result: loser === WHITE ? 'black' : 'white', reason: 'resign' }, loser);
            } else if (!ai) finish({ over: true, result: 'draw', reason: 'agreed' }, -1, true);
            else {
              // the computer accepts when it is not ahead, and only once the game is under way
              const r = search(replay(g.fen, g.moves), { level: 5, time: 300 });
              const compScore = pos.turn === humanC ? -r.score : r.score;
              if (g.moves.length >= 20 && compScore <= 30) finish({ over: true, result: 'draw', reason: 'agreed' }, -1, true);
              else toast('The computer wants to play on');
            }
          });
        },
      });
    }
  });

  const ro = new ResizeObserver(() => { layout(); });
  rebuild();
  layout();
  render();
  ro.observe(q('mid'));
  // pick up a game where it is the computer's turn (a fresh game as Black, or after leaving mid-thought)
  const st0 = status(pos);
  if (st0.over) finish(st0);
  else if (ai && !humanTurn()) setTimeout(() => alive && computerMove(), 400);
  if (!cb.seenHelp) { cb.seenHelp = true; save(); setTimeout(chessHelp, 350); }
  return { root, destroy() { alive = false; token++; ro.disconnect(); persist(); save(true); } };
}
