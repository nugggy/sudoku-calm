// Treat Twist: a match-3 game. Swap neighbouring treats to make lines of three or more.
import { mulberry32 } from './sudoku-engine.js';
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, sheet, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';

const N = 8, TYPES = 6, BOMB = 9;
const IMG = (t) => (t === BOMB ? 'img/cats/cat01.png' : `img/treats/t${t}.png`);
const NAMES = ['strawberries', 'oranges', 'lemons', 'apples', 'fish', 'grapes'];
const T = () => store.treat;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Levels ----------
// Every level is built from its number, so it is always the same board and goal.
export function levelSpec(L) {
  const rng = mulberry32(31337 + L * 7919);
  const n = L + 1;
  const kinds = ['score', 'collect', 'jelly'];
  const kind = n <= 2 ? 'score' : kinds[n % 3];
  const types = n < 6 ? 5 : 6;
  const moves = Math.max(14, 26 - Math.floor(n / 6));
  // board shape: later levels lose some corners or a centre block
  const holes = new Set();
  if (n > 4 && rng() < 0.6) {
    const k = 1 + ((rng() * 2) | 0);
    for (const [r0, c0] of [[0, 0], [0, N - k], [N - k, 0], [N - k, N - k]]) for (let r = 0; r < k; r++) for (let c = 0; c < k; c++) holes.add((r0 + r) * N + c0 + c);
  }
  if (n > 12 && rng() < 0.35) [27, 28, 35, 36].forEach((i) => holes.add(i));
  const spec = { n, kind, types, moves, holes: [...holes], seed: 1000 + L * 13 };
  const playable = N * N - holes.size;
  if (kind === 'score') spec.target = Math.round((2500 + n * 450) / 100) * 100;
  if (kind === 'collect') {
    const a = (rng() * types) | 0, b = (a + 1 + ((rng() * (types - 1)) | 0)) % types;
    const amt = 12 + Math.floor(n * 1.2);
    spec.collect = { [a]: amt, [b]: Math.round(amt * 0.8) };
    spec.target = 1000 + n * 200;
  }
  if (kind === 'jelly') {
    const jelly = [];
    for (let i = 0; i < N * N; i++) if (!holes.has(i) && rng() < Math.min(0.75, 0.3 + n * 0.012)) jelly.push(i);
    spec.jelly = jelly.length ? jelly : [27, 28, 35, 36];
    spec.target = 1000 + n * 200;
    void playable;
  }
  spec.stars = [spec.target, Math.round(spec.target * 1.6), Math.round(spec.target * 2.4)];
  return spec;
}

export function treatHelp() {
  sheet(`<h2>How to play Treat Twist</h2><div class="help-body">
    <p>Swipe a treat to swap it with its neighbour. Line up three or more of the same treat to collect them.</p>
    <p><b>Four in a row</b> makes a striped treat that clears a whole row or column. <b>An L or T shape</b> makes a wrapped treat that bursts. <b>Five in a row</b> makes a cat that clears every treat of the kind you swap it with.</p>
    <p>Swap two special treats together for an even bigger effect.</p>
    <p>Reach the level goal before you run out of moves. Moves left over turn into bonus points.</p>
  </div><button class="btn treat-btn" data-x>Let's twist</button>`, { onMount: (n, close) => { $('[data-x]', n).onclick = close; } });
}

function goalText(spec) {
  if (spec.kind === 'score') return `Score ${spec.target.toLocaleString('en-AU')} points`;
  if (spec.kind === 'collect') return 'Collect ' + Object.entries(spec.collect).map(([t, n]) => `${n} ${NAMES[t]}`).join(' and ');
  return 'Clear all the jelly';
}

// ---------- Home ----------
export function treatHomeScreen(app) {
  const root = el(`<section class="screen treat-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title"></div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  function render() {
    const t = T(), next = t.level;
    const spec = levelSpec(next);
    const total = Object.values(t.stars).reduce((a, b) => a + b, 0);
    const show = Math.max(30, Math.ceil((next + 15) / 5) * 5);
    body.innerHTML = `
      <div class="treat-hero">${[0, 1, 2, 3, 4, 5].map((k) => `<img src="${IMG(k)}" style="animation-delay:${k * 0.12}s" alt="">`).join('')}</div>
      <h1 class="treat-title">Treat Twist</h1>
      <button class="btn treat-btn" data-act="play">Play level ${next + 1}<small>${goalText(spec)}</small></button>
      <div class="treat-total"><img src="img/ui/star.png" alt=""> ${total} stars collected</div>
      <div class="treat-map">${[...Array(show)].map((_, i) => {
        const s = t.stars[i] || 0;
        return `<button class="treat-node ${i < next ? 'done' : ''} ${i === next ? 'current' : ''}" data-idx="${i}" ${i > next ? 'disabled' : ''}><b>${i + 1}</b><span>${'★'.repeat(s)}${'☆'.repeat(i < next ? 3 - s : 0)}</span></button>`;
      }).join('')}</div>`;
    setTimeout(() => $('.treat-node.current', body)?.scrollIntoView({ block: 'center' }), 0);
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return treatHelp();
    if (a === 'play') return app.go('treatgame', { level: T().level });
    const b = e.target.closest('[data-idx]');
    if (b) app.go('treatgame', { level: +b.dataset.idx });
  });
  render();
  return { root, refresh: render };
}

// ---------- Game ----------
export function treatGameScreen(app, { level }) {
  const spec = levelSpec(level);
  const holes = new Set(spec.holes);
  const rng = mulberry32(spec.seed);
  const rand = () => (rng() * spec.types) | 0;
  let idc = 0;
  const tile = (t, sp = null) => ({ t, sp, id: ++idc });
  let grid = new Array(N * N).fill(null);
  const jelly = new Map((spec.jelly || []).map((i) => [i, 1]));
  let movesLeft = spec.moves, score = 0, busy = false, extraUsed = false, over = false;
  const collected = {};
  const R = (i) => Math.floor(i / N), C = (i) => i % N;
  const at = (r, c) => (r < 0 || r >= N || c < 0 || c >= N || holes.has(r * N + c) ? undefined : grid[r * N + c]);

  // fill without starting matches
  for (let i = 0; i < N * N; i++) {
    if (holes.has(i)) continue;
    let t;
    do { t = rand(); } while ((C(i) >= 2 && at(R(i), C(i) - 1)?.t === t && at(R(i), C(i) - 2)?.t === t) || (R(i) >= 2 && at(R(i) - 1, C(i))?.t === t && at(R(i) - 2, C(i))?.t === t));
    grid[i] = tile(t);
  }

  const root = el(`<section class="screen treat-theme treat-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">Level ${level + 1}</div><button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="treat-hud">
      <div class="hud-moves"><b data-el="moves"></b><span>moves</span></div>
      <div class="hud-goal" data-el="goal"></div>
      <div class="hud-score"><b data-el="score">0</b><div class="hud-bar"><i data-el="bar"></i></div></div>
    </div>
    <div class="treat-board-wrap"><div class="treat-board" data-el="board"></div><div class="block-pop treat-pop" data-el="pop"></div></div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const board = q('board');
  const tileEls = new Map();
  let cell = 40;

  function layout() {
    const w = Math.min(innerWidth - 20, 520, innerHeight - 260);
    cell = Math.floor(w / N);
    board.style.width = board.style.height = cell * N + 'px';
    board.style.setProperty('--tc', cell + 'px');
    $$('.tcell', board).forEach((n) => n.remove());
    for (let i = 0; i < N * N; i++) {
      if (holes.has(i)) continue;
      board.prepend(el(`<div class="tcell ${(R(i) + C(i)) % 2 ? 'alt' : ''} ${jelly.get(i) ? 'jelly' : ''}" data-cell="${i}" style="transform:translate(${C(i) * cell}px,${R(i) * cell}px)"></div>`));
    }
  }

  function render(spawnFrom = null) {
    const live = new Set();
    grid.forEach((t, i) => {
      if (!t) return;
      live.add(t.id);
      let n = tileEls.get(t.id);
      if (!n) {
        n = el(`<div class="ttile"><img src="${IMG(t.t)}" alt=""></div>`);
        board.appendChild(n); tileEls.set(t.id, n);
        const startRow = spawnFrom && spawnFrom.has(t.id) ? spawnFrom.get(t.id) : R(i);
        n.style.transition = 'none';
        n.style.transform = `translate(${C(i) * cell}px,${startRow * cell}px)`;
        void n.offsetWidth; n.style.transition = '';
      }
      n.className = 'ttile' + (t.sp ? ' sp-' + t.sp : '');
      n.firstElementChild.src = IMG(t.t);
      n.style.transform = `translate(${C(i) * cell}px,${R(i) * cell}px)`;
      n.dataset.i = i;
    });
    for (const [id, n] of tileEls) if (!live.has(id)) { n.remove(); tileEls.delete(id); }
    $$('.tcell', board).forEach((c) => c.classList.toggle('jelly', !!jelly.get(+c.dataset.cell)));
    hud();
  }

  function hud() {
    q('moves').textContent = movesLeft;
    q('score').textContent = score.toLocaleString('en-AU');
    q('bar').style.width = Math.min(100, (score / spec.stars[2]) * 100) + '%';
    let g = '';
    if (spec.kind === 'score') g = `<span>Reach</span><b>${spec.target.toLocaleString('en-AU')}</b>`;
    else if (spec.kind === 'collect') g = Object.entries(spec.collect).map(([t, n]) => `<div class="goal-item"><img src="${IMG(+t)}" alt=""><b>${Math.max(0, n - (collected[t] || 0))}</b></div>`).join('');
    else g = `<div class="goal-item"><span class="jelly-swatch"></span><b>${[...jelly.values()].filter(Boolean).length}</b></div>`;
    q('goal').innerHTML = g;
  }

  // ---------- Matching ----------
  function findMatches() {
    const runs = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N;) {
      const t = at(r, c); let e = c + 1;
      if (t && t.t !== BOMB) while (at(r, e) && at(r, e).t === t.t) e++;
      if (t && t.t !== BOMB && e - c >= 3) runs.push({ cells: [...Array(e - c)].map((_, k) => r * N + c + k), dir: 'h' });
      c = e;
    }
    for (let c = 0; c < N; c++) for (let r = 0; r < N;) {
      const t = at(r, c); let e = r + 1;
      if (t && t.t !== BOMB) while (at(e, c) && at(e, c).t === t.t) e++;
      if (t && t.t !== BOMB && e - r >= 3) runs.push({ cells: [...Array(e - r)].map((_, k) => (r + k) * N + c), dir: 'v' });
      r = e;
    }
    return runs;
  }

  // Works out which cells clear, including chain reactions from special treats.
  function expand(cells) {
    const out = new Set(cells), queue = [...cells];
    while (queue.length) {
      const i = queue.pop(), t = grid[i];
      if (!t || !t.sp || t.fired) continue;
      t.fired = true;
      const add = (k) => { if (k >= 0 && !holes.has(k) && grid[k] && !out.has(k)) { out.add(k); queue.push(k); } };
      if (t.sp === 'h') for (let c = 0; c < N; c++) add(R(i) * N + c);
      if (t.sp === 'v') for (let r = 0; r < N; r++) add(r * N + C(i));
      if (t.sp === 'wrap') for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const r = R(i) + dr, c = C(i) + dc; if (r >= 0 && r < N && c >= 0 && c < N) add(r * N + c); }
    }
    return out;
  }

  async function clearCells(set, created = new Map()) {
    // effects and points
    for (const i of set) {
      const t = grid[i]; if (!t) continue;
      if (t.t !== BOMB) collected[t.t] = (collected[t.t] || 0) + 1;
      if (jelly.get(i)) jelly.set(i, 0);
      const n = tileEls.get(t.id);
      if (n) n.classList.add('pop');
    }
    score += set.size * 60;
    await sleep(200);
    for (const i of set) {
      if (created.has(i)) { grid[i] = created.get(i); continue; }
      grid[i] = null;
    }
    render();
  }

  function gravity() {
    const spawn = new Map();
    for (let c = 0; c < N; c++) {
      const col = [];
      for (let r = N - 1; r >= 0; r--) if (!holes.has(r * N + c) && grid[r * N + c]) col.push(grid[r * N + c]);
      let k = 0, newCount = 0;
      for (let r = N - 1; r >= 0; r--) {
        if (holes.has(r * N + c)) continue;
        if (k < col.length) grid[r * N + c] = col[k++];
        else { const t = tile(rand()); grid[r * N + c] = t; newCount++; spawn.set(t.id, -newCount); }
      }
    }
    render(spawn);
  }

  // Resolve all matches until the board settles. `swap` marks where specials appear.
  async function resolve(swapCells = []) {
    let chain = 0;
    for (;;) {
      const runs = findMatches();
      if (!runs.length) break;
      chain++;
      const created = new Map();
      const all = new Set();
      // specials from long runs and crossings
      const counts = new Map();
      runs.forEach((r) => r.cells.forEach((i) => counts.set(i, (counts.get(i) || 0) + 1)));
      const pickSpot = (cells) => cells.find((i) => swapCells.includes(i)) ?? cells[Math.floor(cells.length / 2)];
      for (const r of runs) {
        r.cells.forEach((i) => all.add(i));
        const cross = r.cells.find((i) => counts.get(i) > 1);
        const t = grid[r.cells[0]].t;
        if (r.cells.length >= 5) created.set(pickSpot(r.cells), tile(BOMB));
        else if (cross !== undefined && !created.has(cross)) created.set(cross, tile(t, 'wrap'));
        else if (r.cells.length === 4) created.set(pickSpot(r.cells), tile(t, r.dir === 'h' ? 'v' : 'h'));
      }
      const set = expand([...all].filter((i) => !created.has(i) || grid[i]?.sp));
      created.forEach((_, i) => set.add(i));
      if (chain > 1) popText(['', '', 'Sweet!', 'Tasty!', 'Delicious!', 'Purrfect!'][Math.min(chain, 5)]);
      sfx[chain > 1 ? 'unit' : 'place']();
      score += (chain - 1) * 40 * set.size;
      await clearCells(set, created);
      await sleep(60);
      gravity();
      await sleep(240);
      swapCells = [];
    }
  }

  function popText(t) { const p = q('pop'); p.innerHTML = t; p.classList.remove('show'); void p.offsetWidth; p.classList.add('show'); }

  // ---------- Swapping ----------
  function swapGrid(a, b) { [grid[a], grid[b]] = [grid[b], grid[a]]; }
  async function trySwap(a, b) {
    if (busy || over) return;
    if (holes.has(a) || holes.has(b) || !grid[a] || !grid[b]) return;
    busy = true;
    hideHint();
    const ta = grid[a], tb = grid[b];
    swapGrid(a, b); render(); sfx.tap();
    await sleep(170);
    // special combinations
    if (ta.t === BOMB || tb.t === BOMB) {
      const other = ta.t === BOMB ? tb : ta;
      const set = new Set([a, b]);
      if (other.t === BOMB) grid.forEach((t, i) => { if (t) set.add(i); });
      else grid.forEach((t, i) => { if (t && t.t === other.t) { if (other.sp) t.sp = other.sp === 'wrap' ? 'wrap' : (Math.random() < 0.5 ? 'h' : 'v'); set.add(i); } });
      movesLeft--; buzz(30); popText('Cat-astrophic!');
      await clearCells(expand([...set]));
      gravity(); await sleep(240);
      await resolve();
      return afterMove();
    }
    if (ta.sp && tb.sp) {
      const set = new Set([a, b]);
      if (ta.sp === 'wrap' && tb.sp === 'wrap') { for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) { const r = R(b) + dr, c = C(b) + dc; if (r >= 0 && r < N && c >= 0 && c < N && grid[r * N + c]) set.add(r * N + c); } }
      else if (ta.sp === 'wrap' || tb.sp === 'wrap') { for (let d = -1; d <= 1; d++) { for (let c = 0; c < N; c++) { const r = R(b) + d; if (r >= 0 && r < N && grid[r * N + c]) set.add(r * N + c); } for (let r = 0; r < N; r++) { const c = C(b) + d; if (c >= 0 && c < N && grid[r * N + c]) set.add(r * N + c); } } }
      else { for (let c = 0; c < N; c++) if (grid[R(b) * N + c]) set.add(R(b) * N + c); for (let r = 0; r < N; r++) if (grid[r * N + C(b)]) set.add(r * N + C(b)); }
      ta.fired = tb.fired = true;
      movesLeft--; buzz(30);
      await clearCells(expand([...set]));
      gravity(); await sleep(240);
      await resolve();
      return afterMove();
    }
    if (!findMatches().length) {
      swapGrid(a, b); render(); buzz(15);
      await sleep(170);
      busy = false;
      return;
    }
    movesLeft--;
    await resolve([a, b]);
    afterMove();
  }

  function goalMet() {
    if (score < spec.target) return false;
    if (spec.kind === 'collect') return Object.entries(spec.collect).every(([t, n]) => (collected[t] || 0) >= n);
    if (spec.kind === 'jelly') return [...jelly.values()].every((v) => !v);
    return true;
  }
  function goalMetExceptScore() {
    if (spec.kind === 'collect') return Object.entries(spec.collect).every(([t, n]) => (collected[t] || 0) >= n);
    if (spec.kind === 'jelly') return [...jelly.values()].every((v) => !v);
    return false;
  }

  function possibleMove() {
    for (let i = 0; i < N * N; i++) for (const j of [i + 1, i + N]) {
      if (j >= N * N || (j === i + 1 && C(i) === N - 1) || !grid[i] || !grid[j]) continue;
      if (grid[i].t === BOMB || grid[j].t === BOMB || (grid[i].sp && grid[j].sp)) return [i, j];
      swapGrid(i, j); const ok = findMatches().length > 0; swapGrid(i, j);
      if (ok) return [i, j];
    }
    return null;
  }

  async function afterMove() {
    hud();
    // collect/jelly goals also need the score target, which is usually reached along the way
    if (goalMet() || (goalMetExceptScore() && movesLeft === 0)) return win();
    if (movesLeft <= 0) return lose();
    if (!possibleMove()) {
      popText('Shuffling'); await sleep(500);
      for (let tries = 0; tries < 20; tries++) {
        const live = grid.map((t, i) => (t ? i : -1)).filter((i) => i >= 0);
        const ts = live.map((i) => grid[i]).sort(() => Math.random() - 0.5);
        live.forEach((i, k) => { grid[i] = ts[k]; });
        if (!findMatches().length && possibleMove()) break;
      }
      render(); await sleep(250);
    }
    busy = false;
    armHint();
  }

  async function win() {
    over = true;
    // leftover moves become bonus points
    if (movesLeft > 0) { popText('Bonus time!'); for (; movesLeft > 0; movesLeft--) { score += 250; hud(); sfx.note(); await sleep(90); } }
    const stars = score >= spec.stars[2] ? 3 : score >= spec.stars[1] ? 2 : 1;
    const t = T();
    t.stars[level] = Math.max(t.stars[level] || 0, stars);
    if (level >= t.level) t.level = level + 1;
    t.best = Math.max(t.best || 0, score);
    save(true);
    sfx.win(); confetti();
    await sleep(500);
    const v = await dialog({ hero: 'img/cats/cat04.png', title: `Level ${level + 1} complete!`, dismissible: false,
      text: `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}\nScore ${score.toLocaleString('en-AU')}`,
      buttons: [{ label: 'Next level', value: 'next' }, { label: 'Back', value: 'back', cls: 'ghost' }] });
    if (v === 'next') app.replace('treatgame', { level: level + 1 }); else app.back();
  }

  async function lose() {
    sfx.error();
    const opts = [];
    if (!extraUsed) opts.push({ label: 'Take 5 more moves', value: 'more' });
    opts.push({ label: 'Try again', value: 'retry', cls: opts.length ? 'secondary' : '' }, { label: 'Back', value: 'back', cls: 'ghost' });
    const v = await dialog({ hero: 'img/cats/cat09.png', title: 'Out of moves', dismissible: false, text: `${goalText(spec)}. So close!`, buttons: opts });
    if (v === 'more') { extraUsed = true; movesLeft = 5; busy = false; hud(); armHint(); }
    else if (v === 'retry') app.replace('treatgame', { level });
    else { over = true; app.back(); }
  }

  // Idle hint: after a few seconds, wiggle a possible move.
  let hintTimer = null;
  function armHint() { clearTimeout(hintTimer); hintTimer = setTimeout(() => { if (busy || over) return; const m = possibleMove(); if (m) m.forEach((i) => tileEls.get(grid[i].id)?.classList.add('hint')); }, 5000); }
  function hideHint() { clearTimeout(hintTimer); $$('.ttile.hint', board).forEach((n) => n.classList.remove('hint')); }

  // ---------- Input: swipe or tap-tap ----------
  let start = null, selected = -1;
  const cellAt = (e) => { const r = board.getBoundingClientRect(); const c = Math.floor((e.clientX - r.left) / cell), rr = Math.floor((e.clientY - r.top) / cell); return c >= 0 && c < N && rr >= 0 && rr < N ? rr * N + c : -1; };
  board.addEventListener('pointerdown', (e) => {
    const i = cellAt(e); if (i < 0 || busy || over) return;
    board.setPointerCapture(e.pointerId);
    start = { i, x: e.clientX, y: e.clientY, done: false };
  });
  board.addEventListener('pointermove', (e) => {
    if (!start || start.done) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < cell * 0.35) return;
    start.done = true;
    const i = start.i;
    const j = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? (C(i) < N - 1 ? i + 1 : -1) : (C(i) > 0 ? i - 1 : -1)) : (dy > 0 ? (R(i) < N - 1 ? i + N : -1) : (R(i) > 0 ? i - N : -1));
    clearSel();
    if (j >= 0) trySwap(i, j);
  });
  board.addEventListener('pointerup', () => {
    if (!start) return;
    const s = start; start = null;
    if (s.done) return;
    // tap-tap: select, then tap a neighbour
    if (selected >= 0 && selected !== s.i && (Math.abs(selected - s.i) === N || (Math.abs(selected - s.i) === 1 && R(selected) === R(s.i)))) { const a = selected; clearSel(); trySwap(a, s.i); return; }
    clearSel();
    if (grid[s.i]) { selected = s.i; tileEls.get(grid[s.i].id)?.classList.add('sel'); sfx.tap(); }
  });
  function clearSel() { if (selected >= 0 && grid[selected]) tileEls.get(grid[selected].id)?.classList.remove('sel'); selected = -1; }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') treatHelp();
  });

  requestAnimationFrame(() => {
    layout(); render(); armHint();
    if (level === 0 && !T().seenHelp) { T().seenHelp = true; save(); setTimeout(treatHelp, 300); }
    toast(goalText(spec), 2600);
  });
  return { root, destroy() { clearTimeout(hintTimer); over = true; } };
}
