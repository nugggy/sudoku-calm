// Pipeline: connect each pair of matching dots with a pipe, and fill every square.
import { mulberry32 } from './sudoku-engine.js';
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet, levelHome } from './kit.js';

export const PIPE_COLOURS = ['#ff3b5c', '#2f8cff', '#ffd21f', '#2ecc71', '#ff8c1a', '#a45cf0', '#18d6d6', '#ff6fd8', '#8b5a2b', '#9aa5b1'];
const PL = () => store.pipe;
export const pipeHelp = () => helpSheet('How to play Pipeline', [
  'Drag from a dot to draw a pipe to the other dot of the same colour.',
  'Pipes cannot cross. Drawing over another pipe cuts it, and dragging back along your own pipe shortens it.',
  'Connect every pair and fill every square to finish. A hint draws one pipe for you.',
], 'pipe-btn');

export function recipe(level) {
  const n = level + 1;
  const size = n <= 15 ? 5 : n <= 40 ? 6 : n <= 80 ? 7 : n <= 130 ? 8 : 9;
  const k = Math.min(PIPE_COLOURS.length, size - 1 + (n % 3 === 0 ? 1 : 0));
  return { size, k };
}

// Split the grid into k random paths by joining neighbouring path ends.
export function makeLevel(level) {
  const { size, k } = recipe(level);
  const rng = mulberry32(31415 + level * 2711);
  const N = size * size;
  const nb = (i) => { const r = Math.floor(i / size), c = i % size, o = []; if (r) o.push(i - size); if (r < size - 1) o.push(i + size); if (c) o.push(i - 1); if (c < size - 1) o.push(i + 1); return o; };
  for (let attempt = 0; attempt < 2000; attempt++) {
    let paths = [...Array(N)].map((_, i) => [i]);
    const owner = [...Array(N)].map((_, i) => i);
    let guard = 0;
    while (paths.filter(Boolean).length > k && guard++ < N * 60) {
      const live = paths.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
      // prefer extending short paths
      live.sort((a, b) => paths[a].length - paths[b].length + (rng() - 0.5) * 4);
      const a = live[0], pa = paths[a];
      const endA = rng() < 0.5 ? 0 : pa.length - 1;
      const cell = pa[endA];
      const opts = nb(cell).filter((j) => { const b = owner[j]; if (b === a) return false; const pb = paths[b]; return pb[0] === j || pb[pb.length - 1] === j; });
      if (!opts.length) continue;
      const j = opts[(rng() * opts.length) | 0], b = owner[j];
      let A = endA === 0 ? pa.slice().reverse() : pa.slice();
      let B = paths[b][0] === j ? paths[b].slice() : paths[b].slice().reverse();
      const joined = A.concat(B);
      paths[a] = joined; paths[b] = null;
      joined.forEach((x) => (owner[x] = a));
    }
    const final = paths.filter(Boolean);
    if (final.length !== k || final.some((p) => p.length < 3)) continue;
    // reject paths that run straight alongside themselves (they make trivial or ambiguous boards)
    return { size, paths: final };
  }
  throw new Error('no pipe level ' + level);
}

export function pipeHomeScreen(app) {
  return levelHome({
    app, cls: 'pipe-theme', title: 'Pipeline', help: pipeHelp,
    hero: `<svg class="pipe-hero" viewBox="0 0 120 80"><path d="M15 15 H60 V45 H105" stroke="#ff3b5c" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 65 H45 V45" stroke="#2f8cff" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="15" cy="15" r="11" fill="#ff3b5c"/><circle cx="105" cy="45" r="11" fill="#ff3b5c"/><circle cx="15" cy="65" r="11" fill="#2f8cff"/><circle cx="45" cy="45" r="11" fill="#2f8cff"/></svg>`,
    play: () => { const r = recipe(PL().level); return { label: `Play level ${PL().level + 1}`, sub: `${r.size}×${r.size} · ${r.k} pipes` }; },
    onPlay: () => app.go('pipegame', { level: PL().level }),
    levels: () => ({ count: Math.max(30, Math.ceil((PL().level + 15) / 5) * 5), current: PL().level, done: (i) => i < PL().level }),
    onLevel: (i) => app.go('pipegame', { level: i }),
  });
}

export function pipeGameScreen(app, { level }) {
  const pl = PL();
  const { size, paths: solution } = makeLevel(level);
  const dots = new Map(); solution.forEach((p, c) => { dots.set(p[0], c); dots.set(p[p.length - 1], c); });
  let pipes = solution.map(() => []); // player paths per colour
  let done = false, moves = 0;
  const root = el(`<section class="screen pipe-theme pipe-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">Level ${level + 1}</div><button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="pipe-info"><span>Pipes <b data-el="flows">0/${solution.length}</b></span><span>Filled <b data-el="fill">0%</b></span></div>
    <div class="pipe-wrap"><div class="pipe-board" data-el="board"><svg data-el="svg"></svg></div></div>
    <div class="pipe-bar">
      <button class="sort-boost" data-act="restart" aria-label="Clear board">${icon.restart}</button>
      <button class="sort-boost hint-btn" data-act="hint" aria-label="Hint"><img src="img/ui/light-bulb.png" alt=""></button>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const board = q('board');
  let cell = 50;

  function layout() {
    cell = Math.floor(Math.min(innerWidth - 24, 520, innerHeight - 260) / size);
    board.style.width = board.style.height = cell * size + 'px';
    board.style.setProperty('--pc', cell + 'px');
    q('svg').setAttribute('viewBox', `0 0 ${cell * size} ${cell * size}`);
  }
  const ctr = (i) => [(i % size) * cell + cell / 2, Math.floor(i / size) * cell + cell / 2];
  const ownerOf = (i) => pipes.findIndex((p) => p.includes(i));
  const connected = (c) => { const p = pipes[c]; if (p.length < 2) return false; const ends = solution[c]; return (p[0] === ends[0] && p[p.length - 1] === ends[ends.length - 1]) || (p[0] === ends[ends.length - 1] && p[p.length - 1] === ends[0]); };

  function render() {
    let svg = '';
    // faint fill behind each pipe
    pipes.forEach((p, c) => p.forEach((i) => { const [x, y] = ctr(i); svg += `<rect x="${x - cell / 2}" y="${y - cell / 2}" width="${cell}" height="${cell}" fill="${PIPE_COLOURS[c]}" opacity=".18"/>`; }));
    // grid lines
    for (let k = 1; k < size; k++) svg += `<line x1="${k * cell}" y1="0" x2="${k * cell}" y2="${size * cell}" class="pg"/><line x1="0" y1="${k * cell}" x2="${size * cell}" y2="${k * cell}" class="pg"/>`;
    pipes.forEach((p, c) => { if (p.length > 1) svg += `<polyline class="${connected(c) ? 'conn' : ''}" points="${p.map((i) => ctr(i).join(',')).join(' ')}" stroke="${PIPE_COLOURS[c]}" stroke-width="${cell * 0.36}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`; });
    for (const [i, c] of dots) { const [x, y] = ctr(i); svg += `<circle cx="${x}" cy="${y}" r="${cell * 0.34}" fill="${PIPE_COLOURS[c]}" class="${connected(c) ? 'conn-dot' : ''}"/>`; }
    q('svg').innerHTML = svg;
    const filled = new Set(pipes.flat()); for (const i of dots.keys()) filled.add(i);
    q('flows').textContent = `${solution.filter((_, c) => connected(c)).length}/${solution.length}`;
    q('fill').textContent = Math.round((filled.size / (size * size)) * 100) + '%';
  }

  // ---------- Drawing ----------
  let drawing = -1;
  const cellAt = (e) => { const r = board.getBoundingClientRect(); const c = Math.floor((e.clientX - r.left) / cell), rr = Math.floor((e.clientY - r.top) / cell); return c >= 0 && c < size && rr >= 0 && rr < size ? rr * size + c : -1; };
  const adjacent = (a, b) => Math.abs(a - b) === size || (Math.abs(a - b) === 1 && Math.floor(a / size) === Math.floor(b / size));
  board.addEventListener('pointerdown', (e) => {
    if (done) return;
    const i = cellAt(e); if (i < 0) return;
    board.setPointerCapture(e.pointerId);
    if (dots.has(i)) { drawing = dots.get(i); pipes[drawing] = [i]; }
    else { const o = ownerOf(i); if (o < 0) return; drawing = o; pipes[o] = pipes[o].slice(0, pipes[o].indexOf(i) + 1); }
    sfx.tap(); render();
  });
  board.addEventListener('pointermove', (e) => {
    if (drawing < 0) return;
    const i = cellAt(e); if (i < 0) return;
    const p = pipes[drawing];
    const last = p[p.length - 1];
    if (i === last) return;
    if (p.length > 1 && p[p.length - 2] === i) { p.pop(); render(); return; } // backtrack
    if (!adjacent(last, i)) return;
    if (connected(drawing)) return; // already finished; drag back to change it
    if (dots.has(i) && dots.get(i) !== drawing) return; // cannot pass through another colour's dot
    if (p.includes(i)) { pipes[drawing] = p.slice(0, p.indexOf(i) + 1); render(); return; }
    const o = ownerOf(i);
    if (o >= 0 && o !== drawing) { pipes[o] = pipes[o].slice(0, pipes[o].indexOf(i)); sfx.cross(); } // cut the other pipe
    p.push(i);
    buzz(4);
    if (connected(drawing)) { sfx.place(); buzz(15); }
    render();
  });
  const end = () => { if (drawing < 0) return; drawing = -1; moves++; save(); checkWin(); };
  board.addEventListener('pointerup', end);
  board.addEventListener('pointercancel', end);

  async function checkWin() {
    if (!solution.every((_, c) => connected(c))) return;
    const filled = new Set(pipes.flat());
    if (filled.size < size * size) { toast('Every pipe is connected. Now fill every square.'); return; }
    done = true;
    if (level >= pl.level) pl.level = level + 1;
    save(true);
    sfx.win(); confetti();
    $$('polyline', q('svg')).forEach((n) => n.classList.add('win'));
    await new Promise((r) => setTimeout(r, 900));
    const v = await dialog({ hero: 'img/ui/sparkles.png', title: 'Perfect flow!', dismissible: false, text: `Level ${level + 1} complete`, buttons: [{ label: 'Next level', value: 'next' }, { label: 'Back', value: 'back', cls: 'ghost' }] });
    if (v === 'next') app.replace('pipegame', { level: level + 1 }); else app.back();
  }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') pipeHelp();
    else if (a === 'restart') { pipes = solution.map(() => []); render(); sfx.erase(); }
    else if (a === 'hint' && !done) {
      const c = solution.findIndex((s, ci) => !connected(ci) || pipes[ci].join() !== s.join() && pipes[ci].slice().reverse().join() !== s.join());
      if (c < 0) return;
      // clear anything in the way, then draw the true pipe
      solution[c].forEach((i) => { const o = ownerOf(i); if (o >= 0 && o !== c) pipes[o] = pipes[o].slice(0, pipes[o].indexOf(i)); });
      pipes[c] = solution[c].slice();
      sfx.hint(); render(); checkWin();
    }
  });

  requestAnimationFrame(() => { layout(); render(); if (!pl.seenHelp) { pl.seenHelp = true; save(); setTimeout(pipeHelp, 300); } });
  return { root };
}
