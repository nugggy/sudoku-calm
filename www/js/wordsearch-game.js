// Word Search: find the hidden words in a themed letter grid.
import { mulberry32 } from './sudoku-engine.js';
import { store, save, fmtTime } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, sheet, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';

const HUES = ['#ff6b8b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa', '#f783ac', '#38d9a9', '#ff8787', '#74c0fc', '#b197fc', '#ffc078', '#63e6be', '#e599f7'];
let themes = null;
async function loadThemes() {
  if (themes) return themes;
  try { themes = (await (await fetch('levels/wordsearch.json')).json()).themes; } catch { themes = []; }
  return themes;
}
const WS = () => store.ws;

// Level recipe: bigger grids, more words and more directions as you go.
export function wsSpec(level, T) {
  const n = level + 1;
  const theme = T[level % T.length];
  const size = n <= 8 ? 8 : n <= 24 ? 10 : 12;
  const count = n <= 8 ? 7 : n <= 24 ? 10 : 13;
  const dirs = n <= 8 ? [[0, 1], [1, 0]] : n <= 24 ? [[0, 1], [1, 0], [1, 1], [-1, 1]] : [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
  return { n, theme, size, count, dirs, seed: 777 + level * 131 };
}

function generate(spec) {
  const rng = mulberry32(spec.seed);
  const { size } = spec;
  for (let attempt = 0; attempt < 50; attempt++) {
    const words = spec.theme.words.filter((w) => w.length <= size).sort(() => rng() - 0.5).slice(0, spec.count).sort((a, b) => b.length - a.length);
    const grid = new Array(size * size).fill('');
    const placed = [];
    let ok = true;
    for (const w of words) {
      let done = false;
      for (let t = 0; t < 200 && !done; t++) {
        const [dr, dc] = spec.dirs[(rng() * spec.dirs.length) | 0];
        const r = (rng() * size) | 0, c = (rng() * size) | 0;
        const er = r + dr * (w.length - 1), ec = c + dc * (w.length - 1);
        if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
        let fits = true;
        for (let k = 0; k < w.length; k++) { const g = grid[(r + dr * k) * size + c + dc * k]; if (g && g !== w[k]) { fits = false; break; } }
        if (!fits) continue;
        for (let k = 0; k < w.length; k++) grid[(r + dr * k) * size + c + dc * k] = w[k];
        placed.push({ word: w, r, c, dr, dc });
        done = true;
      }
      if (!done) { ok = false; break; }
    }
    if (!ok) continue;
    const letters = 'AAABCDEEEEFGHIIIJKLMNNOOOPQRRSSTTTUUVWXYZ';
    for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = letters[(rng() * letters.length) | 0];
    return { grid, placed };
  }
  throw new Error('could not build word search');
}

export function wsHelp() {
  sheet(`<h2>How to play Word Search</h2><div class="help-body">
    <p>Find every word in the list. Drag your finger from the first letter to the last.</p>
    <p>Words run across and down at first. Later puzzles add diagonals, then words written backwards.</p>
    <p>The light bulb lights up the first letter of a word you have not found yet.</p>
  </div><button class="btn ws-btn" data-x>Let's find them</button>`, { onMount: (n, close) => { $('[data-x]', n).onclick = close; } });
}

// ---------- Home ----------
export function wsHomeScreen(app) {
  const root = el(`<section class="screen ws-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title"></div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  async function render() {
    const T = await loadThemes(), w = WS();
    const spec = wsSpec(w.level, T);
    body.innerHTML = `
      <div class="word-hero"><img src="img/themes/magnifying-glass-tilted-left.png" alt=""><img class="tilt" src="img/themes/${spec.theme.img}.png" alt=""></div>
      <h1 class="word-title">Word Search</h1>
      <button class="btn ws-btn" data-act="play">${w.current && w.current.level === w.level ? 'Continue' : 'Play'} puzzle ${w.level + 1}<small>${spec.theme.name} · ${spec.size}×${spec.size} · ${spec.count} words</small></button>
      <p class="word-sub">${w.level} puzzles solved</p>
      <div class="section-title">Themes</div>
      <div class="ws-themes">${T.map((t, i) => `<div class="ws-theme-card ${i < Math.min(w.level, T.length) || i === w.level % T.length ? 'seen' : ''}"><img src="img/themes/${t.img}.png" alt=""><span>${t.name}</span></div>`).join('')}</div>`;
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return wsHelp();
    if (a === 'play') return app.go('wsgame', { level: WS().level });
  });
  render();
  return { root, refresh: render };
}

// ---------- Game ----------
export function wsGameScreen(app, { level }) {
  const w = WS();
  const root = el(`<section class="screen ws-theme ws-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="ws-head"><img data-el="img" alt=""><span data-el="name"></span></div>
      <span class="cross-time" data-el="time">00:00</span>
      <button class="icon-btn" data-act="hint" aria-label="Hint">${icon.bulb}</button></header>
    <div class="ws-board-wrap"><div class="ws-board" data-el="board"><svg class="ws-lines" data-el="lines"></svg></div></div>
    <div class="ws-words" data-el="words"></div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  let spec, puzzle, found, elapsed = 0, done = false, tick = null, cell = 30, size = 8;

  function build() {
    size = spec.size;
    const board = q('board');
    cell = Math.floor(Math.min(innerWidth - 24, 520, innerHeight - 300) / size);
    board.style.setProperty('--wc', cell + 'px');
    board.style.width = board.style.height = cell * size + 'px';
    board.insertAdjacentHTML('beforeend', puzzle.grid.map((ch, i) => `<div class="wcell" data-i="${i}">${ch}</div>`).join(''));
    const svg = q('lines');
    svg.setAttribute('viewBox', `0 0 ${cell * size} ${cell * size}`);
    q('img').src = `img/themes/${spec.theme.img}.png`;
    q('name').textContent = spec.theme.name;
  }

  const centre = (r, c) => [c * cell + cell / 2, r * cell + cell / 2];
  function capsule(r1, c1, r2, c2, colour, cls = '') {
    const [x1, y1] = centre(r1, c1), [x2, y2] = centre(r2, c2);
    return `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colour}" stroke-width="${cell * 0.78}" stroke-linecap="round"/>`;
  }
  function renderLines(temp = '') {
    q('lines').innerHTML = puzzle.placed.map((p, k) => (found.includes(p.word) ? capsule(p.r, p.c, p.r + p.dr * (p.word.length - 1), p.c + p.dc * (p.word.length - 1), HUES[found.indexOf(p.word) % HUES.length] + 'b3', 'found') : '')).join('') + temp;
  }
  function renderWords() {
    q('words').innerHTML = puzzle.placed.map((p) => `<span class="${found.includes(p.word) ? 'got' : ''}" style="--hue:${HUES[found.indexOf(p.word) % HUES.length]}">${p.word}</span>`).join('');
  }

  // ---------- Drag to select ----------
  let start = null, last = null;
  const cellAt = (e) => { const r = q('board').getBoundingClientRect(); const c = Math.floor((e.clientX - r.left) / cell), rr = Math.floor((e.clientY - r.top) / cell); return c >= 0 && c < size && rr >= 0 && rr < size ? [rr, c] : null; };
  function snap(a, b) {
    // keep the selection to a straight line in one of eight directions
    const dr = b[0] - a[0], dc = b[1] - a[1];
    const len = Math.max(Math.abs(dr), Math.abs(dc));
    if (!len) return { cells: [a], dr: 0, dc: 0 };
    let sr = Math.round(dr / len), sc = Math.round(dc / len);
    const L = Math.abs(dr) && Math.abs(dc) && Math.abs(Math.abs(dr) - Math.abs(dc)) > len / 2 ? len : len;
    const cells = [];
    for (let k = 0; k <= L; k++) { const r = a[0] + sr * k, c = a[1] + sc * k; if (r < 0 || r >= size || c < 0 || c >= size) break; cells.push([r, c]); }
    return { cells, dr: sr, dc: sc };
  }
  const board = q('board');
  board.addEventListener('pointerdown', (e) => {
    if (done) return;
    const p = cellAt(e); if (!p) return;
    board.setPointerCapture(e.pointerId);
    start = p; last = p;
    renderLines(capsule(p[0], p[1], p[0], p[1], 'rgba(255,255,255,.6)', 'temp'));
    sfx.tap();
  });
  board.addEventListener('pointermove', (e) => {
    if (!start) return;
    const p = cellAt(e); if (!p) return;
    const s = snap(start, p);
    const end = s.cells[s.cells.length - 1];
    if (last && end[0] === last[0] && end[1] === last[1]) return;
    last = end;
    renderLines(capsule(start[0], start[1], end[0], end[1], 'rgba(255,255,255,.6)', 'temp'));
    buzz(4);
  });
  const finish = () => {
    if (!start) return;
    const s = snap(start, last || start);
    start = null;
    const word = s.cells.map(([r, c]) => puzzle.grid[r * size + c]).join('');
    const rev = [...word].reverse().join('');
    const hit = puzzle.placed.find((p) => !found.includes(p.word) && (p.word === word || p.word === rev) && s.cells.length === p.word.length
      && ((p.r === s.cells[0][0] && p.c === s.cells[0][1]) || (p.r === s.cells[s.cells.length - 1][0] && p.c === s.cells[s.cells.length - 1][1])));
    if (hit) {
      found.push(hit.word);
      sfx.unit(); buzz(20);
      s.cells.forEach(([r, c], k) => setTimeout(() => { const n = $(`.wcell[data-i="${r * size + c}"]`, root); n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop'); }, k * 35));
      persist();
      renderWords();
      checkWin();
    } else if (s.cells.length > 1) sfx.erase();
    renderLines();
  };
  board.addEventListener('pointerup', finish);
  board.addEventListener('pointercancel', finish);

  function hint() {
    const p = puzzle.placed.find((x) => !found.includes(x.word));
    if (!p || done) return;
    const n = $(`.wcell[data-i="${p.r * size + p.c}"]`, root);
    n.classList.remove('hinted'); void n.offsetWidth; n.classList.add('hinted');
    sfx.hint();
    toast(`Look for ${p.word}`);
  }

  function persist() { w.current = { level, found, elapsed }; save(); }

  function checkWin() {
    if (found.length < puzzle.placed.length) return;
    done = true; stopTimer();
    w.level = Math.max(w.level, level + 1);
    w.current = null;
    w.words = (w.words || 0) + puzzle.placed.length;
    save(true);
    sfx.win();
    $$('.wcell', root).forEach((n, i) => setTimeout(() => n.classList.add('wave'), ((i % size) + Math.floor(i / size)) * 30));
    setTimeout(async () => {
      confetti();
      const v = await dialog({ hero: `img/themes/${spec.theme.img}.png`, title: `${spec.theme.name} complete!`, dismissible: false,
        text: `All ${puzzle.placed.length} words found in ${fmtTime(elapsed)}`,
        buttons: [{ label: 'Next puzzle', value: 'next' }, { label: 'Back', value: 'back', cls: 'ghost' }] });
      if (v === 'next') app.replace('wsgame', { level: level + 1 }); else app.back();
    }, size * 60 + 400);
  }

  function startTimer() { stopTimer(); if (!done) tick = setInterval(() => { elapsed++; q('time').textContent = fmtTime(elapsed); if (elapsed % 5 === 0) persist(); }, 1000); }
  function stopTimer() { clearInterval(tick); tick = null; }
  const onVis = () => { if (document.hidden) { stopTimer(); persist(); } else if (!done && root.style.display !== 'none') startTimer(); };
  document.addEventListener('visibilitychange', onVis);

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'hint') hint();
  });

  (async () => {
    const T = await loadThemes();
    spec = wsSpec(level, T);
    puzzle = generate(spec);
    const cur = w.current && w.current.level === level ? w.current : null;
    found = cur ? cur.found.filter((x) => puzzle.placed.some((p) => p.word === x)) : [];
    elapsed = cur ? cur.elapsed : 0;
    requestAnimationFrame(() => { build(); renderLines(); renderWords(); startTimer(); });
    if (!w.seenHelp) { w.seenHelp = true; save(); setTimeout(wsHelp, 300); }
  })();

  return {
    root,
    destroy() { stopTimer(); if (!done && found) persist(); save(true); document.removeEventListener('visibilitychange', onVis); },
    onHide() { stopTimer(); },
    onShow() { if (!done) startTimer(); },
  };
}
