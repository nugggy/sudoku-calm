// The Sudoku game screen.
import { DIFFICULTY_LABELS, ROW, COL, BOX, PEERS, UNITS, findHint, generate, hashString } from './sudoku-engine.js';
import { store, save, fmtTime, todayKey } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, dialog, toast, confetti, sheet, esc } from './ui.js';
import { sfx, buzz } from './sound.js';

const BASE_POINTS = { easy: 10, medium: 20, hard: 30, expert: 45, master: 60, extreme: 80 };
const MAX_MISTAKES = 3;
const FREE_HINTS = 3;

// ---------- Puzzle supply (worker + pre-generated pool) ----------
let worker = null, reqId = 0;
const pending = new Map();
function getWorker() {
  if (!worker) {
    try {
      worker = new Worker(new URL('./sudoku-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => { const p = pending.get(e.data.id); if (p) { pending.delete(e.data.id); p(e.data); } };
    } catch { worker = null; }
  }
  return worker;
}
function requestPuzzle(difficulty, seed) {
  const w = getWorker();
  if (!w) {
    const g = generate(difficulty, seed);
    return Promise.resolve({ puzzle: g.puzzle.join(''), solution: g.solution.join(''), difficulty, seed: g.seed });
  }
  return new Promise((resolve) => { const id = ++reqId; pending.set(id, resolve); w.postMessage({ id, difficulty, seed }); });
}
export function prefetch(difficulty) {
  if (store.pool[difficulty]) return;
  requestPuzzle(difficulty).then((p) => { if (!store.pool[difficulty]) { store.pool[difficulty] = p; save(); } });
}

export const DAILY_DIFFICULTY = ['hard', 'easy', 'medium', 'medium', 'hard', 'medium', 'expert']; // by weekday, Sunday first
export function dailyDifficulty(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return DAILY_DIFFICULTY[new Date(y, m - 1, d).getDay()];
}

function newGameState(p, difficulty, daily = null) {
  return {
    difficulty, daily,
    puzzle: p.puzzle, solution: p.solution, board: p.puzzle,
    notes: new Array(81).fill(0), mistakes: 0, hintsUsed: 0, elapsed: 0, score: 0,
    history: [], units: new Array(27).fill(false), secondChances: 0, done: false,
    started: Date.now(),
  };
}

// Starts a new game. Abandoning an unfinished game breaks that difficulty's win streak.
// Regular games and daily challenges are saved in separate slots so neither overwrites the other.
export const slot = (daily) => (daily ? 'dailyGame' : 'game');

export async function startGame(difficulty, daily = null) {
  const old = store.game;
  if (!daily && old && !old.done && old.board !== old.puzzle) store.stats[old.difficulty].streak = 0;
  let p;
  if (daily) p = await requestPuzzle(difficulty, hashString('daily-' + daily));
  else if (store.pool[difficulty]) { p = store.pool[difficulty]; delete store.pool[difficulty]; }
  else p = await requestPuzzle(difficulty);
  store[slot(daily)] = newGameState(p, difficulty, daily);
  if (!daily) store.stats[difficulty].started++;
  save(true);
  if (!daily) prefetch(difficulty);
  return store[slot(daily)];
}

// ---------- Screen ----------
export function sudokuScreen(app, params = {}) {
  const g = store[slot(params.daily)];
  const S = store.settings;
  const board = g.board.split('').map(Number);
  const puzzle = g.puzzle.split('').map(Number);
  const sol = g.solution.split('').map(Number);
  const notes = g.notes;
  let selected = puzzle.findIndex((v) => !v);
  let notesMode = false;
  let paused = false;
  let tick = null;
  let hintCells = null;

  const root = el(`<section class="screen game">
    <header class="topbar">
      <button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">${g.daily ? 'Daily challenge' : ''}</div>
      <button class="icon-btn" data-act="theme" aria-label="Appearance">${icon.palette}</button>
      <button class="icon-btn" data-act="settings" aria-label="Settings">${icon.gear}</button>
    </header>
    <div class="game-info">
      <div class="stat"><span class="k">Difficulty</span><span class="v">${DIFFICULTY_LABELS[g.difficulty]}</span></div>
      <div class="stat" data-el="mistakes-wrap"><span class="k">Mistakes</span><span class="v" data-el="mistakes"></span></div>
      <div class="stat"><span class="k">Score</span><span class="v" data-el="score"></span></div>
      <div class="stat" data-el="time-wrap"><span class="k">Time</span><span class="v"><span data-el="time"></span><button class="pause" data-act="pause" aria-label="Pause">${icon.pause}</button></span></div>
    </div>
    <div class="board-wrap">
      <div class="board" role="grid" aria-label="Sudoku board"></div>
      <div class="pause-cover"><button class="play" data-act="resume" aria-label="Resume">${icon.play}</button><div>Paused</div></div>
    </div>
    <div class="hint-banner" data-el="hint"><img src="img/art/ui/light-bulb.svg" alt=""><span data-el="hint-text"></span><button data-act="hint-ok">Got it</button></div>
    <div class="tools">
      <button class="tool" data-act="undo"><span class="ic">${icon.undo}</span>Undo</button>
      <button class="tool" data-act="erase"><span class="ic">${icon.erase}</span>Erase</button>
      <button class="tool" data-act="notes"><span class="ic">${icon.pencil}</span>Notes<span class="badge" data-el="notes-badge">OFF</span></button>
      <button class="tool" data-act="hint"><span class="ic">${icon.bulb}</span>Hint<span class="badge blue" data-el="hint-badge"></span></button>
    </div>
    <div class="numpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button class="num" data-num="${d}">${d}<small></small></button>`).join('')}</div>
  </section>`);

  const boardEl = $('.board', root);
  for (let i = 0; i < 81; i++) {
    boardEl.appendChild(el(`<div class="cell" role="gridcell" data-i="${i}"><span class="v"></span><div class="notes">${'<span></span>'.repeat(9)}</div></div>`));
  }
  const cells = $$('.cell', boardEl);
  const q = (name) => $(`[data-el="${name}"]`, root);
  root.style.setProperty('--font-scale', S.fontScale);

  // ---------- Rendering ----------
  function render() {
    const selV = selected >= 0 ? board[selected] : 0;
    const wrongs = new Set();
    if (S.highlightDupes) {
      for (let i = 0; i < 81; i++) if (board[i] && board[i] !== sol[i] && !puzzle[i]) {
        for (const p of PEERS[i]) if (board[p] === board[i]) { wrongs.add(p); wrongs.add(i); }
      }
    }
    for (let i = 0; i < 81; i++) {
      const c = cells[i], v = board[i];
      const related = selected >= 0 && S.highlightArea && (ROW(i) === ROW(selected) || COL(i) === COL(selected) || BOX(i) === BOX(selected));
      c.className = 'cell'
        + (related ? ' area' : '')
        + (S.highlightSame && selV && v === selV ? ' same' : '')
        + (i === selected ? ' sel' : '')
        + (!puzzle[i] && v ? ' entry' : '')
        + (!puzzle[i] && v && v !== sol[i] && S.autoCheck ? ' wrong' : '')
        + (wrongs.has(i) && S.autoCheck ? ' dupe' : '')
        + (hintCells && hintCells.focus.includes(i) ? ' hint-focus' : '')
        + (hintCells && hintCells.target === i ? ' hint-target' : '');
      c.firstElementChild.textContent = v || '';
      const ns = c.lastElementChild.children;
      for (let d = 1; d <= 9; d++) {
        const on = !v && (notes[i] & (1 << d));
        ns[d - 1].textContent = on ? d : '';
        ns[d - 1].className = on && S.highlightSame && selV === d ? 'hl' : '';
      }
    }
    // numpad
    const counts = new Array(10).fill(0);
    board.forEach((v, i) => { if (v && v === sol[i]) counts[v]++; });
    $$('.num', root).forEach((b) => {
      const d = +b.dataset.num;
      b.classList.toggle('used', S.hideUsed && counts[d] >= 9);
      b.classList.toggle('note-mode', notesMode);
      b.lastElementChild.textContent = S.showRemaining ? 9 - counts[d] : '';
    });
    q('mistakes').textContent = S.mistakeLimit ? `${g.mistakes}/${MAX_MISTAKES}` : `${g.mistakes}`;
    q('mistakes').classList.toggle('bad', g.mistakes > 0);
    q('mistakes-wrap').style.visibility = S.autoCheck ? '' : 'hidden';
    q('score').textContent = g.score.toLocaleString('en-AU');
    q('time').textContent = fmtTime(g.elapsed);
    q('time-wrap').style.visibility = S.showTimer ? '' : 'hidden';
    const nt = $('[data-act="notes"]', root);
    nt.classList.toggle('on', notesMode);
    q('notes-badge').textContent = notesMode ? 'ON' : 'OFF';
    const left = S.unlimitedHints ? '∞' : Math.max(0, FREE_HINTS - g.hintsUsed);
    q('hint-badge').textContent = left;
    $('[data-act="undo"]', root).disabled = !g.history.length;
  }

  function persist() {
    g.board = board.join('');
    save();
  }

  // ---------- Timer ----------
  function startTimer() {
    stopTimer();
    if (g.done || paused) return;
    tick = setInterval(() => {
      g.elapsed++;
      q('time').textContent = fmtTime(g.elapsed);
      if (g.elapsed % 5 === 0) save();
    }, 1000);
  }
  function stopTimer() { clearInterval(tick); tick = null; }
  function setPaused(p) {
    paused = p;
    root.querySelector('.board-wrap').classList.toggle('paused', p);
    if (p) { stopTimer(); save(true); } else startTimer();
  }
  const onVis = () => { if (document.hidden && !g.done) setPaused(true); };
  document.addEventListener('visibilitychange', onVis);

  // ---------- Moves ----------
  function pushHistory(changes) { g.history.push(changes); if (g.history.length > 300) g.history.shift(); }
  const snapshot = (i) => [i, board[i], notes[i]];
  const locked = (i) => puzzle[i] || (S.autoCheck && board[i] && board[i] === sol[i]);

  function clearHint() {
    hintCells = null;
    q('hint').classList.remove('show');
  }

  function animateCells(list, cls, stagger = 0) {
    list.forEach((i, k) => {
      const c = cells[i];
      setTimeout(() => { c.classList.remove(cls); void c.offsetWidth; c.classList.add(cls); setTimeout(() => c.classList.remove(cls), 600); }, k * stagger);
    });
  }

  function checkUnits(i) {
    let any = false;
    for (const u of [ROW(i), 9 + COL(i), 18 + BOX(i)]) {
      if (g.units[u]) continue;
      if (UNITS[u].every((k) => board[k] === sol[k])) {
        g.units[u] = true; any = true;
        const order = UNITS[u].slice().sort((a, b) => Math.hypot(ROW(a) - ROW(i), COL(a) - COL(i)) - Math.hypot(ROW(b) - ROW(i), COL(b) - COL(i)));
        setTimeout(() => animateCells(order, 'wave', 35), 60);
        g.score += BASE_POINTS[g.difficulty] * 3;
      }
    }
    if (any) sfx.unit();
  }

  function placeDigit(d) {
    if (selected < 0 || g.done || paused) return;
    const i = selected;
    if (locked(i)) { cells[i].classList.add('shake'); setTimeout(() => cells[i].classList.remove('shake'), 400); buzz(20); return; }
    clearHint();
    if (notesMode) {
      if (board[i]) return;
      pushHistory([snapshot(i)]);
      notes[i] ^= 1 << d;
      sfx.note();
      persist(); render();
      return;
    }
    if (board[i] === d) return;
    const changes = [snapshot(i)];
    board[i] = d; notes[i] = 0;
    const correct = d === sol[i];
    if (S.autoRemoveNotes && (correct || !S.autoCheck)) {
      for (const p of PEERS[i]) if (notes[p] & (1 << d)) { changes.push([p, board[p], notes[p]]); notes[p] &= ~(1 << d); }
    }
    pushHistory(changes);
    cells[i].classList.remove('pop'); void cells[i].offsetWidth; cells[i].classList.add('pop');
    if (S.autoCheck && !correct) {
      g.mistakes++;
      sfx.error();
      persist(); render();
      if (S.mistakeLimit && g.mistakes >= MAX_MISTAKES) gameOver();
      return;
    }
    if (correct) {
      const speed = Math.max(0, (600 - g.elapsed) / 600);
      g.score += Math.round(BASE_POINTS[g.difficulty] * (1 + speed));
      sfx.place(); buzz(8);
      checkUnits(i);
    } else sfx.place();
    persist(); render();
    checkWin();
  }

  function erase() {
    if (selected < 0 || g.done || paused) return;
    const i = selected;
    if (locked(i) || (!board[i] && !notes[i])) return;
    clearHint();
    pushHistory([snapshot(i)]);
    board[i] = 0; notes[i] = 0;
    sfx.erase();
    persist(); render();
  }

  function undo() {
    if (!g.history.length || g.done || paused) return;
    clearHint();
    const changes = g.history.pop();
    for (const [i, v, n] of changes) { board[i] = v; notes[i] = n; }
    selected = changes[0][0];
    sfx.tap();
    persist(); render();
  }

  function hint() {
    if (g.done || paused) return;
    if (!S.unlimitedHints && g.hintsUsed >= FREE_HINTS) {
      dialog({ hero: 'img/art/ui/light-bulb.svg', title: 'No hints left', text: `You have used all ${FREE_HINTS} hints for this game. You can turn on unlimited hints in Settings.`,
        buttons: [{ label: 'Turn on unlimited hints', value: 'on' }, { label: 'Keep going', value: null, cls: 'ghost' }] })
        .then((v) => { if (v === 'on') { S.unlimitedHints = true; save(); render(); } });
      return;
    }
    const h = findHint(board, sol, selected);
    if (h.cell < 0) return;
    g.hintsUsed++;
    sfx.hint();
    selected = h.cell;
    if (h.kind === 'mistake') {
      pushHistory([snapshot(h.cell)]);
      board[h.cell] = 0;
    } else {
      pushHistory([snapshot(h.cell)]);
      board[h.cell] = h.digit; notes[h.cell] = 0;
      if (S.autoRemoveNotes) for (const p of PEERS[h.cell]) notes[p] &= ~(1 << h.digit);
      cells[h.cell].classList.add('pop');
      checkUnits(h.cell);
    }
    hintCells = { focus: h.unitCells || [], target: h.cell };
    q('hint-text').textContent = h.message;
    q('hint').classList.add('show');
    persist(); render();
    checkWin();
  }

  async function gameOver() {
    stopTimer();
    save(true);
    const v = await dialog({
      hero: 'img/art/cats/cat09.svg', title: 'Game over', dismissible: false,
      text: `You made ${MAX_MISTAKES} mistakes and lost this game.`,
      buttons: [
        { label: 'Second chance', value: 'second' },
        { label: 'Restart this puzzle', value: 'restart', cls: 'secondary' },
        { label: 'New game', value: 'new', cls: 'ghost' },
      ],
    });
    if (v === 'second') {
      // Undo the last mistake and keep playing. No ads, ever.
      g.mistakes = MAX_MISTAKES - 1; g.secondChances++;
      for (let i = 0; i < 81; i++) if (board[i] && board[i] !== sol[i]) board[i] = 0;
      persist(); render(); startTimer();
    } else {
      if (!g.daily) store.stats[g.difficulty].streak = 0;
      if (v === 'restart') {
        Object.assign(g, newGameState({ puzzle: g.puzzle, solution: g.solution }, g.difficulty, g.daily));
        save(true); app.replace('sudoku', params);
      } else {
        // 'new', or back pressed: the game is lost
        g.done = true; save(true);
        if (v === 'new') app.newGameSheet();
      }
    }
  }

  function checkWin() {
    if (!board.every((v, i) => v === sol[i])) {
      if (!S.autoCheck && board.every((v) => v)) toast('The board is full, but something is not right yet.');
      return;
    }
    g.done = true;
    stopTimer();
    const st = store.stats[g.difficulty];
    const prevBest = st.bestTime;
    const prevScore = st.bestScore;
    if (g.daily) {
      store.daily[g.daily] = { time: g.elapsed, score: g.score };
    } else {
      st.won++; st.totalTime += g.elapsed;
      if (!g.mistakes) st.perfect++;
      if (!st.bestTime || g.elapsed < st.bestTime) st.bestTime = g.elapsed;
      if (g.score > st.bestScore) st.bestScore = g.score;
      st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak);
    }
    save(true);
    // a final sweep across the whole board, then the win screen
    const all = [...Array(81).keys()].sort((a, b) => (ROW(a) + COL(a)) - (ROW(b) + COL(b)));
    animateCells(all, 'wave', 8);
    sfx.win();
    setTimeout(() => showWin(prevBest, prevScore), 1100);
  }

  function showWin(prevBest, prevScore) {
    confetti();
    const st = store.stats[g.difficulty];
    const newBest = !g.daily && (!prevBest || g.elapsed < prevBest);
    const newScore = !g.daily && g.score > prevScore;
    const node = el(`<div class="win">
      <img class="trophy" src="img/art/ui/${g.daily ? 'glowing-star' : 'trophy'}.svg" alt="">
      <h1>${g.mistakes ? 'Well done' : 'Excellent'}</h1>
      <div class="sub">${g.daily ? 'Daily challenge complete' : `${DIFFICULTY_LABELS[g.difficulty]} puzzle solved`}</div>
      <div class="rows">
        <div class="row"><span><img src="img/art/ui/bar-chart.svg" alt="">Difficulty</span><b>${DIFFICULTY_LABELS[g.difficulty]}</b></div>
        <div class="row"><span><img src="img/art/ui/gem-stone.svg" alt="">Score</span><b>${g.score.toLocaleString('en-AU')}${newScore ? '<span class="new">BEST</span>' : ''}</b></div>
        <div class="row"><span><img src="img/art/ui/calendar.svg" alt="">Time</span><b>${fmtTime(g.elapsed)}${newBest ? '<span class="new">BEST</span>' : ''}</b></div>
        ${g.daily ? '' : `<div class="row"><span><img src="img/art/ui/sports-medal.svg" alt="">Best time</span><b>${fmtTime(st.bestTime)}</b></div>
        <div class="row"><span><img src="img/art/ui/fire.svg" alt="">Win streak</span><b>${st.streak}</b></div>`}
        <div class="row"><span><img src="img/art/ui/thinking-face.svg" alt="">Mistakes</span><b>${g.mistakes}</b></div>
      </div>
      <div class="actions">
        ${g.daily ? '<button class="btn" data-act="daily">Back to daily challenges</button>' : '<button class="btn" data-act="new">New game</button>'}
        <button class="btn ghost" data-act="home">Main menu</button>
      </div>
    </div>`);
    document.getElementById('overlay-root').appendChild(node);
    node.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (!a) return;
      node.remove();
      if (a === 'new') { app.backTo('home'); app.newGameSheet(); }
      else app.backTo('home');
    });
  }

  function appearanceSheet() {
    const html = `<h2>Appearance</h2>
      <div class="set-group">
        <div class="set-row"><div class="txt">Theme</div><div class="seg" data-k="theme">
          ${['light', 'dark', 'system'].map((t) => `<button data-v="${t}" class="${S.theme === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></div>
        <div class="set-row"><div class="txt">Colour</div><div class="swatches">
          ${[['blue', '#3c6bdc'], ['green', '#2f9e66'], ['purple', '#7a5bd6'], ['pink', '#d4507c'], ['orange', '#e07b28']].map(([k, c]) => `<button class="swatch ${S.accent === k ? 'on' : ''}" data-accent="${k}" style="background:${c};color:${c}" aria-label="${k}"></button>`).join('')}</div></div>
        <div class="set-row"><div class="txt">Number size</div><div class="seg" data-k="font">
          ${[[0.9, 'Small'], [1, 'Normal'], [1.12, 'Large']].map(([v, l]) => `<button data-v="${v}" class="${S.fontScale === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      </div>`;
    sheet(html, {
      onMount(node) {
        node.addEventListener('click', (e) => {
          const b = e.target.closest('button'); if (!b) return;
          const seg = b.closest('.seg');
          if (seg?.dataset.k === 'theme') S.theme = b.dataset.v;
          else if (seg?.dataset.k === 'font') { S.fontScale = +b.dataset.v; root.style.setProperty('--font-scale', S.fontScale); }
          else if (b.dataset.accent) S.accent = b.dataset.accent;
          else return;
          save(); app.applyTheme();
          $$('.seg button, .swatch', node).forEach((x) => {
            const k = x.closest('.seg')?.dataset.k;
            x.classList.toggle('on', k === 'theme' ? x.dataset.v === S.theme : k === 'font' ? +x.dataset.v === S.fontScale : x.dataset.accent === S.accent);
          });
        });
      },
    });
  }

  // ---------- Events ----------
  boardEl.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.cell'); if (!c || paused) return;
    selected = +c.dataset.i;
    if (hintCells && hintCells.target !== selected) hintCells.focus = [];
    sfx.tap();
    render();
  });
  root.addEventListener('click', (e) => {
    const n = e.target.closest('[data-num]');
    if (n) { placeDigit(+n.dataset.num); return; }
    const a = e.target.closest('[data-act]')?.dataset.act;
    switch (a) {
      case 'back': app.back(); break;
      case 'settings': app.go('settings'); break;
      case 'theme': appearanceSheet(); break;
      case 'pause': setPaused(true); break;
      case 'resume': setPaused(false); break;
      case 'undo': undo(); break;
      case 'erase': erase(); break;
      case 'notes': notesMode = !notesMode; sfx.tap(); render(); break;
      case 'hint': hint(); break;
      case 'hint-ok': clearHint(); render(); break;
    }
  });
  const onKey = (e) => {
    if (e.key >= '1' && e.key <= '9') placeDigit(+e.key);
    else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') erase();
    else if (e.key === 'n') { notesMode = !notesMode; render(); }
    else if (e.key.startsWith('Arrow') && selected >= 0) {
      const r = ROW(selected), c = COL(selected);
      const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      selected = ((r + dr + 9) % 9) * 9 + ((c + dc + 9) % 9); render();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') undo();
  };
  document.addEventListener('keydown', onKey);

  render();
  if (g.done) {
    // Finished game re-opened: nothing to play.
    setTimeout(() => app.back(), 0);
  } else startTimer();

  return {
    root,
    destroy() { stopTimer(); save(true); document.removeEventListener('visibilitychange', onVis); document.removeEventListener('keydown', onKey); },
    onHide() { stopTimer(); save(true); },
    onShow() { root.style.setProperty('--font-scale', S.fontScale); render(); if (!paused) startTimer(); },
  };
}

export function continueLabel() {
  const g = store.game;
  if (!g || g.done) return null;
  return `${g.daily ? 'Daily' : DIFFICULTY_LABELS[g.difficulty]} · ${fmtTime(g.elapsed)}`;
}

export { todayKey, esc };
