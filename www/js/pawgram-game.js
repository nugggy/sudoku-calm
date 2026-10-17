// Pawgram: picture logic puzzles (nonograms). Fill squares to match the clues and reveal a picture.
import { puzzleClues, findHint } from './pawgram-engine.js';
import { store, save, fmtTime } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, sheet, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';

const LIVES = 3;
const FREE_HINTS = 3;
const UNKNOWN = -1, EMPTY = 0, FILLED = 1;

let levels = null;
export async function loadPawLevels() {
  if (levels) return levels;
  try { levels = (await (await fetch('levels/pawgram.json')).json()).levels; } catch { levels = []; }
  return levels;
}
const P = () => store.paw;
const nameOf = (lv) => lv.name.replace(/\b\w/, (c) => c.toUpperCase());
const colourAt = (lv, i) => { const j = parseInt(lv.idx.slice(i * 2, i * 2 + 2), 36); return j ? '#' + lv.palette[j - 1] : null; };

// Small pixel-art picture of a level, drawn on a canvas.
export function pixelArt(lv, size = 72, solvedOnly = false) {
  const c = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  c.width = c.height = size * dpr;
  c.style.width = c.style.height = size + 'px';
  c.className = 'pixel-art';
  const ctx = c.getContext('2d');
  const cell = (size * dpr) / lv.n;
  for (let i = 0; i < lv.n * lv.n; i++) {
    const col = solvedOnly ? (lv.cells[i] === '1' ? '#344861' : null) : colourAt(lv, i);
    if (!col) continue;
    ctx.fillStyle = col;
    ctx.fillRect((i % lv.n) * cell, Math.floor(i / lv.n) * cell, Math.ceil(cell), Math.ceil(cell));
  }
  return c;
}

export function pawHelp() {
  sheet(`<h2>How to play</h2><div class="help-body">
    <p>Each number is a run of filled squares in that row or column, in order. <b>3 1</b> means three filled squares together, a gap of at least one, then one more.</p>
    <p>Use <b>Fill</b> to colour squares and <b>Cross</b> to mark squares you know are empty. Drag along a row or column to mark several at once.</p>
    <p>A wrong square costs a heart. Lose all three and you can keep going with a second chance.</p>
    <p>Finish the picture to see it in full colour and add it to your gallery. Every puzzle can be solved with logic alone.</p>
  </div><button class="btn paw-btn" data-x>Let's go</button>`, { onMount: (n, close) => { $('[data-x]', n).onclick = close; } });
}

// ---------- Home ----------
export function pawHomeScreen(app) {
  const root = el(`<section class="screen paw-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title"></div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button>
      <button class="icon-btn" data-act="settings" aria-label="Settings">${icon.gear}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  async function render() {
    const L = await loadPawLevels();
    const p = P();
    const next = Math.min(p.level, L.length - 1);
    const lv = L[next];
    const solved = Object.keys(p.solved).length;
    body.innerHTML = `
      <div class="paw-hero"><div class="paw-hero-art"></div><h1>Pawgram</h1><p>Solve the clues, reveal the picture</p></div>
      <button class="btn paw-btn" data-act="play">${p.current && p.current.idx === next ? 'Continue' : 'Play'} puzzle ${next + 1}<small>${lv ? `${lv.n}×${lv.n}` : ''}</small></button>
      <div class="paw-stats"><div><b>${solved}</b>of ${L.length} solved</div><div><b>${p.perfect || 0}</b>without mistakes</div></div>
      <button class="btn secondary paw-sec" data-act="gallery">Gallery<small>${solved} picture${solved === 1 ? '' : 's'} collected</small></button>
      <div class="section-title">All puzzles</div>
      <div class="paw-levels">${L.map((x, i) => `<button class="paw-level ${p.solved[i] ? 'done' : ''} ${i === next ? 'current' : ''}" data-idx="${i}" ${i > p.level && !p.solved[i] ? 'disabled' : ''}>${p.solved[i] ? '' : i + 1}<span>${x.n}×${x.n}</span></button>`).join('')}</div>`;
    // the hero shows a pixel cat; solved levels show their pictures
    $('.paw-hero-art', body).appendChild(pixelArt(L.find((x) => /cat face/i.test(x.name)) || L[0], 96));
    $$('.paw-level.done', body).forEach((b) => b.prepend(pixelArt(L[+b.dataset.idx], 40)));
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return pawHelp();
    if (a === 'settings') return app.go('settings');
    if (a === 'play') return app.go('pawgame', { idx: Math.min(P().level, (levels || []).length - 1) });
    if (a === 'gallery') return app.go('pawgallery');
    const b = e.target.closest('[data-idx]');
    if (b) app.go('pawgame', { idx: +b.dataset.idx });
  });
  render();
  return { root, refresh: render };
}

// ---------- Gallery ----------
export function pawGalleryScreen(app) {
  const root = el(`<section class="screen paw-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">Gallery</div><div class="spacer"></div></header>
    <div class="scroll"><div class="paw-gallery"></div></div></section>`);
  loadPawLevels().then((L) => {
    const g = $('.paw-gallery', root);
    const ids = Object.keys(P().solved).map(Number).sort((a, b) => a - b);
    if (!ids.length) { g.outerHTML = '<p class="paw-empty">Solved pictures appear here.</p>'; return; }
    for (const i of ids) {
      const tile = el(`<button class="paw-tile" data-idx="${i}"><span>${nameOf(L[i])}</span></button>`);
      tile.prepend(pixelArt(L[i], 88));
      g.appendChild(tile);
    }
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="back"]')) return app.back();
    const t = e.target.closest('[data-idx]');
    if (!t) return;
    const lv = levels[+t.dataset.idx];
    sheet(`<h2>${nameOf(lv)}</h2><div class="paw-big"></div><button class="btn paw-btn" data-x>Close</button>`, {
      onMount: (n, close) => { $('.paw-big', n).appendChild(pixelArt(lv, Math.min(300, innerWidth - 80))); $('[data-x]', n).onclick = close; },
    });
  });
  return { root };
}

// ---------- Game ----------
export function pawGameScreen(app, { idx }) {
  const p = P();
  const S = store.settings;
  const root = el(`<section class="screen paw-theme paw-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title" data-el="title">Puzzle ${idx + 1}</div>
      <div class="paw-lives" data-el="lives"></div></header>
    <div class="paw-info"><span data-el="size"></span><span data-el="time"></span></div>
    <div class="paw-board-wrap" data-el="wrap"><div class="spinner"></div></div>
    <div class="paw-hint-banner" data-el="hint"><img src="img/ui/light-bulb.png" alt=""><span data-el="hint-text"></span></div>
    <div class="paw-controls">
      <div class="paw-mode">
        <button data-mode="1" class="on"><span class="sq"></span>Fill</button>
        <button data-mode="0"><span class="x">${icon.x}</span>Cross</button>
      </div>
      <button class="tool paw-hint" data-act="hint"><span class="ic">${icon.bulb}</span>Hint<span class="badge blue" data-el="hints"></span></button>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  let lv, n, sol, clues, state, lives, hintsUsed, elapsed, mistakes, mode = FILLED, done = false, tick = null;
  let cells = [], rowClueEls = [], colClueEls = [];

  function persist() { p.current = { idx, state, lives, hintsUsed, elapsed, mistakes }; save(); }

  function build() {
    const wrap = q('wrap');
    const maxRow = Math.max(...clues.rows.map((r) => r.length));
    const maxCol = Math.max(...clues.cols.map((c) => c.length));
    const avail = Math.min(innerWidth - 16, 560);
    // the clue strips take room too: size the cells to fit everything on screen
    const cell = Math.floor(Math.min((avail - 4) / (n + maxRow * 0.62), (innerHeight - 330) / (n + maxCol * 0.62)));
    wrap.innerHTML = '';
    wrap.style.setProperty('--cell', cell + 'px');
    const board = el(`<div class="paw-board" style="grid-template-columns:auto repeat(${n}, var(--cell));grid-template-rows:auto repeat(${n}, var(--cell))"></div>`);
    board.appendChild(el('<div class="paw-corner"></div>'));
    colClueEls = clues.cols.map((c, ci) => { const d = el(`<div class="paw-cclue ${ci % 5 === 4 && ci < n - 1 ? 'b5' : ''}">${c.map((x) => `<span>${x}</span>`).join('')}</div>`); board.appendChild(d); return d; });
    cells = [];
    rowClueEls = [];
    for (let r = 0; r < n; r++) {
      const rc = el(`<div class="paw-rclue ${r % 5 === 4 && r < n - 1 ? 'b5' : ''}">${clues.rows[r].map((x) => `<span>${x}</span>`).join('')}</div>`);
      board.appendChild(rc); rowClueEls.push(rc);
      for (let c = 0; c < n; c++) {
        const edge = `${r === 0 ? ' et' : ''}${c === 0 ? ' el' : ''}${r === n - 1 ? ' eb' : ''}${c === n - 1 ? ' er' : ''}`;
        const d = el(`<div class="paw-cell${edge} ${c % 5 === 4 && c < n - 1 ? 'br5' : ''} ${r % 5 === 4 && r < n - 1 ? 'bb5' : ''}" data-i="${r * n + c}"></div>`);
        board.appendChild(d); cells.push(d);
      }
    }
    wrap.appendChild(board);
    board.addEventListener('pointerdown', onDown);
    board.addEventListener('pointermove', onMove);
    board.addEventListener('pointerup', onUp);
    board.addEventListener('pointercancel', onUp);
  }

  const lineDone = (cellsIdx) => cellsIdx.every((i) => sol[i] !== 1 || state[i] === FILLED);
  const rowIdx = (r) => [...Array(n)].map((_, c) => r * n + c);
  const colIdx = (c) => [...Array(n)].map((_, r) => r * n + c);

  function render() {
    cells.forEach((d, i) => {
      const v = state[i];
      d.className = d.className.replace(/ ?(f|x|bad)\b/g, '') + (v === FILLED ? ' f' : v === EMPTY ? ' x' : '') + (mistakes.includes(i) ? ' bad' : '');
      d.innerHTML = v === EMPTY ? icon.x : '';
    });
    rowClueEls.forEach((d, r) => d.classList.toggle('done', lineDone(rowIdx(r))));
    colClueEls.forEach((d, c) => d.classList.toggle('done', lineDone(colIdx(c))));
    q('lives').innerHTML = [...Array(LIVES)].map((_, i) => `<img src="img/ui/red-heart.png" class="${i < lives ? '' : 'lost'}" alt="">`).join('');
    q('hints').textContent = S.unlimitedHints ? '∞' : Math.max(0, FREE_HINTS - hintsUsed);
    q('time').textContent = fmtTime(elapsed);
  }

  // Finished lines get their remaining squares crossed automatically.
  function autoCross(i) {
    const r = Math.floor(i / n), c = i % n;
    for (const line of [rowIdx(r), colIdx(c)]) {
      if (lineDone(line)) line.forEach((k) => { if (state[k] === UNKNOWN) state[k] = EMPTY; });
    }
  }

  function mark(i, want) {
    if (done || state[i] !== UNKNOWN) return false;
    if (sol[i] === want) {
      state[i] = want;
      if (want === FILLED) { autoCross(i); sfx.note(); } else sfx.cross();
      return true;
    }
    // a mistake: show the right answer and lose a heart
    state[i] = sol[i];
    mistakes.push(i);
    lives--;
    sfx.error(); buzz(40);
    if (sol[i] === FILLED) autoCross(i);
    return 'mistake';
  }

  // ---------- Touch: tap, or drag along one row or column ----------
  let drag = null;
  const cellFrom = (e) => { const t = document.elementFromPoint(e.clientX, e.clientY); return t && t.closest('.paw-cell') ? +t.closest('.paw-cell').dataset.i : -1; };
  function onDown(e) {
    const i = cellFrom(e);
    if (i < 0 || done) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    hideHint();
    drag = { start: i, axis: null, last: i };
    apply(i);
  }
  function onMove(e) {
    if (!drag) return;
    let i = cellFrom(e);
    if (i < 0 || i === drag.last) return;
    const r0 = Math.floor(drag.start / n), c0 = drag.start % n, r = Math.floor(i / n), c = i % n;
    if (!drag.axis) drag.axis = Math.abs(r - r0) >= Math.abs(c - c0) ? 'col' : 'row';
    i = drag.axis === 'row' ? r0 * n + c : r * n + c0; // keep to the first direction
    if (i === drag.last) return;
    // fill in any squares skipped by a fast swipe
    const from = drag.last, step = drag.axis === 'row' ? (i > from ? 1 : -1) : (i > from ? n : -n);
    for (let k = from + step; ; k += step) { if (apply(k) === 'stop') { drag = null; return; } if (k === i) break; }
    drag.last = i;
  }
  function onUp() { drag = null; }
  function apply(i) {
    const res = mark(i, mode);
    if (!res) return;
    render(); persist();
    if (res === 'mistake') { if (lives <= 0) { outOfLives(); return 'stop'; } return 'stop'; }
    checkWin();
  }

  async function outOfLives() {
    stopTimer();
    const v = await dialog({ hero: 'img/cats/cat09.png', title: 'Out of hearts', dismissible: false,
      text: 'You made three mistakes. Keep going with a second chance, or start this picture again.',
      buttons: [{ label: 'Second chance', value: 'more' }, { label: 'Start again', value: 'restart', cls: 'secondary' }] });
    if (v === 'restart') { p.current = null; save(); app.replace('pawgame', { idx }); return; }
    if (v === 'more') { lives = 1; render(); persist(); startTimer(); }
  }

  function showHint() {
    if (done) return;
    if (!S.unlimitedHints && hintsUsed >= FREE_HINTS) { toast('No hints left for this picture. You can turn on unlimited hints in Settings.', 3500); return; }
    const h = findHint(n, clues, state);
    if (!h) return;
    hintsUsed++;
    sfx.hint();
    const first = h.cells[0];
    state[first.i] = first.v;
    if (first.v === FILLED) autoCross(first.i);
    const names = h.cells.length > 1 ? `${h.cells.length} squares` : 'a square';
    q('hint-text').textContent = `Look at ${h.line} ${h.index + 1}. Its clue already decides ${names}. One is marked for you.`;
    q('hint').classList.add('show');
    (h.line === 'row' ? rowClueEls : colClueEls)[h.index].classList.add('hl');
    cells[first.i].classList.add('pop');
    render(); persist(); checkWin();
  }
  function hideHint() { q('hint').classList.remove('show'); $$('.hl', root).forEach((d) => d.classList.remove('hl')); }

  function startTimer() { stopTimer(); if (!done) tick = setInterval(() => { elapsed++; q('time').textContent = fmtTime(elapsed); if (elapsed % 5 === 0) persist(); }, 1000); }
  function stopTimer() { clearInterval(tick); tick = null; }
  const onVis = () => { if (document.hidden) { stopTimer(); persist(); } else if (!done && root.style.display !== 'none') startTimer(); };
  document.addEventListener('visibilitychange', onVis);

  function checkWin() {
    if (!sol.every((v, i) => v !== 1 || state[i] === FILLED)) return;
    done = true; stopTimer();
    if (!p.solved[idx]) { p.solved[idx] = { time: elapsed }; if (!mistakes.length) p.perfect = (p.perfect || 0) + 1; }
    p.level = Math.max(p.level, idx + 1);
    p.current = null;
    save(true);
    // reveal the colour picture with a sweep from the top-left corner
    sfx.win();
    cells.forEach((d, i) => {
      const col = colourAt(lv, i);
      setTimeout(() => { d.classList.add('reveal'); d.innerHTML = ''; d.style.background = col || 'transparent'; }, ((i % n) + Math.floor(i / n)) * 35);
    });
    $$('.paw-rclue, .paw-cclue', root).forEach((d) => d.classList.add('fade'));
    setTimeout(() => {
      confetti();
      const node = el(`<div class="meow-win"><div class="box paw-win">
        <div class="paw-win-art"></div>
        <h2>${nameOf(lv)}!</h2>
        <p>Puzzle ${idx + 1} solved in ${fmtTime(elapsed)}${mistakes.length ? '' : ' with no mistakes'}</p>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${idx + 1 < levels.length ? '<button class="btn paw-btn" data-act="next">Next puzzle</button>' : ''}
          <button class="btn secondary paw-sec" data-act="home">Back</button>
        </div></div></div>`);
      $('.paw-win-art', node).appendChild(pixelArt(lv, 150));
      document.getElementById('overlay-root').appendChild(node);
      node.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
        node.remove();
        if (a === 'next') app.replace('pawgame', { idx: idx + 1 }); else app.back();
      });
    }, (n * 2) * 35 + 700);
  }

  root.addEventListener('click', (e) => {
    const m = e.target.closest('[data-mode]');
    if (m) { mode = +m.dataset.mode; $$('[data-mode]', root).forEach((b) => b.classList.toggle('on', b === m)); sfx.tap(); return; }
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'hint') showHint();
  });

  (async () => {
    const L = await loadPawLevels();
    lv = L[idx]; n = lv.n;
    sol = [...lv.cells].map(Number);
    clues = puzzleClues(n, lv.cells);
    const cur = p.current && p.current.idx === idx && p.current.state.length === n * n ? p.current : null;
    state = cur ? cur.state : new Array(n * n).fill(UNKNOWN);
    lives = cur ? cur.lives : LIVES;
    hintsUsed = cur ? cur.hintsUsed : 0;
    elapsed = cur ? cur.elapsed : 0;
    mistakes = cur ? cur.mistakes || [] : [];
    q('size').textContent = `${n}×${n}`;
    build(); render(); startTimer();
    if (idx === 0 && !p.seenHelp) { p.seenHelp = true; save(); setTimeout(pawHelp, 300); }
  })();

  return {
    root,
    destroy() { stopTimer(); if (!done && state) persist(); save(true); document.removeEventListener('visibilitychange', onVis); },
    onHide() { stopTimer(); },
    onShow() { if (!done) startTimer(); },
  };
}
