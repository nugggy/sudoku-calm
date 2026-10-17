// Minesweeper with no-guess boards: every board can be cleared with logic from the first tap.
import { store, save, fmtTime } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, dialog, confetti, sheet } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet } from './kit.js';

export const LEVELS = { easy: { w: 9, h: 9, m: 10, label: 'Easy' }, medium: { w: 10, h: 13, m: 22, label: 'Medium' }, hard: { w: 12, h: 16, m: 38, label: 'Hard' } };
const M = () => store.mines;
export const minesHelp = () => helpSheet('How to play Minesweeper', [
  'Tap a square to dig. Numbers show how many mines touch that square, including diagonally.',
  'Long-press, or switch on flag mode, to plant a flag where you think a mine is.',
  'Tap a number whose mines are all flagged to dig every square around it at once.',
  'Every board here can be solved with logic alone, and your first tap is always safe.',
], 'mines-btn');

// ---------- Engine ----------
const nbrs = (w, h, i) => { const r = Math.floor(i / w), c = i % w, out = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < h && cc >= 0 && cc < w) out.push(rr * w + cc); } return out; };

function counts(w, h, mines) { return [...Array(w * h)].map((_, i) => (mines.has(i) ? -1 : nbrs(w, h, i).filter((k) => mines.has(k)).length)); }

// Logic solver: single-square rules plus the subset rule. Returns true if it clears the board without guessing.
function solvable(w, h, mines, first) {
  const num = counts(w, h, mines);
  const open = new Set(), flag = new Set();
  const reveal = (i) => { const stack = [i]; while (stack.length) { const k = stack.pop(); if (open.has(k)) continue; open.add(k); if (num[k] === 0) nbrs(w, h, k).forEach((n) => { if (!open.has(n)) stack.push(n); }); } };
  reveal(first);
  for (let guard = 0; guard < 500; guard++) {
    let progress = false;
    const cons = [];
    for (const i of open) {
      if (num[i] <= 0) continue;
      const unknown = nbrs(w, h, i).filter((k) => !open.has(k) && !flag.has(k));
      const need = num[i] - nbrs(w, h, i).filter((k) => flag.has(k)).length;
      if (!unknown.length) continue;
      if (need === 0) { unknown.forEach(reveal); progress = true; }
      else if (need === unknown.length) { unknown.forEach((k) => flag.add(k)); progress = true; }
      else cons.push({ cells: unknown, need });
    }
    if (!progress) {
      // subset rule: if A's cells are inside B's, the difference holds B.need - A.need mines
      outer: for (const a of cons) for (const b of cons) {
        if (a === b || a.cells.length >= b.cells.length) continue;
        if (!a.cells.every((k) => b.cells.includes(k))) continue;
        const diff = b.cells.filter((k) => !a.cells.includes(k)), need = b.need - a.need;
        if (need === 0) { diff.forEach(reveal); progress = true; break outer; }
        if (need === diff.length) { diff.forEach((k) => flag.add(k)); progress = true; break outer; }
      }
    }
    if (open.size + mines.size === w * h) return true;
    if (!progress) return false;
  }
  return false;
}

function makeBoard(w, h, m, first) {
  const safe = new Set([first, ...nbrs(w, h, first)]);
  let mines;
  for (let t = 0; t < 400; t++) {
    mines = new Set();
    while (mines.size < m) { const i = (Math.random() * w * h) | 0; if (!safe.has(i)) mines.add(i); }
    if (solvable(w, h, mines, first)) return mines;
  }
  return mines; // extremely rare fallback
}

// ---------- Home ----------
export function minesHomeScreen(app) {
  const root = el(`<section class="screen mines-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title"></div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  function render() {
    const m = M();
    body.innerHTML = `<div class="kit-hero"><img src="img/ui/bomb.png" alt=""><img class="tilt" src="img/ui/triangular-flag.png" alt=""></div><h1 class="kit-title">Minesweeper</h1>
      ${Object.entries(LEVELS).map(([k, L]) => `<button class="mines-level" data-lv="${k}"><b>${L.label}</b><span>${L.w}×${L.h} · ${L.m} mines</span><em>${m.best[k] ? 'Best ' + fmtTime(m.best[k]) : 'Not cleared yet'}</em></button>`).join('')}
      <p class="word-sub">Every board can be cleared without guessing.</p>`;
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return minesHelp();
    const b = e.target.closest('[data-lv]');
    if (b) app.go('minesgame', { lv: b.dataset.lv });
  });
  render();
  return { root, refresh: render };
}

// ---------- Game ----------
export function minesGameScreen(app, { lv }) {
  const L = LEVELS[lv], m = M();
  const { w, h } = L;
  const root = el(`<section class="screen mines-theme mines-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="mines-hud"><span><img src="img/ui/triangular-flag.png" alt=""><b data-el="left">${L.m}</b></span><span><img src="img/ui/calendar.png" alt=""><b data-el="time">00:00</b></span></div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="mines-wrap"><div class="mines-board" data-el="board" style="grid-template-columns:repeat(${w}, var(--mc))"></div></div>
    <div class="mines-bar">
      <button class="mines-mode" data-act="mode"><span class="dig on">⛏ Dig</span><span class="flg"><img src="img/ui/triangular-flag.png" alt=""> Flag</span></button>
      <button class="btn small mines-btn" data-act="new">New board</button>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const board = q('board');
  let mines = null, num = null, open, flags, flagMode = false, done = false, elapsed = 0, tick = null;

  function build() {
    const size = Math.floor(Math.min((innerWidth - 20) / w, (innerHeight - 220) / h, 44));
    board.style.setProperty('--mc', size + 'px');
    board.innerHTML = [...Array(w * h)].map((_, i) => `<div class="mcell2 ${(Math.floor(i / w) + i % w) % 2 ? 'alt' : ''}" data-i="${i}"></div>`).join('');
    open = new Set(); flags = new Set(); mines = null; done = false; elapsed = 0;
    q('left').textContent = L.m; q('time').textContent = '00:00';
    stopTimer();
  }
  const cellEl = (i) => board.children[i];

  function revealFrom(i) {
    const stack = [i], order = [];
    while (stack.length) {
      const k = stack.pop();
      if (open.has(k) || flags.has(k)) continue;
      open.add(k); order.push(k);
      if (num[k] === 0) nbrs(w, h, k).forEach((n) => { if (!open.has(n)) stack.push(n); });
    }
    // reveal ripples outwards from the tap
    const r0 = Math.floor(i / w), c0 = i % w;
    order.forEach((k) => {
      const d = Math.hypot(Math.floor(k / w) - r0, (k % w) - c0);
      setTimeout(() => { const n = cellEl(k); n.classList.add('open'); if (num[k] > 0) { n.textContent = num[k]; n.dataset.n = num[k]; } }, d * 28);
    });
    if (order.length > 1) sfx.unit(); else sfx.tap();
  }

  function dig(i) {
    if (done || flags.has(i)) return;
    if (!mines) { mines = makeBoard(w, h, L.m, i); num = counts(w, h, mines); startTimer(); }
    if (open.has(i)) { chord(i); return; }
    if (mines.has(i)) return boom(i);
    revealFrom(i);
    checkWin();
  }
  function chord(i) {
    if (!num[i]) return;
    const around = nbrs(w, h, i);
    if (around.filter((k) => flags.has(k)).length !== num[i]) { buzz(10); return; }
    const hidden = around.filter((k) => !open.has(k) && !flags.has(k));
    for (const k of hidden) if (mines.has(k)) return boom(k);
    hidden.forEach(revealFrom);
    checkWin();
  }
  function toggleFlag(i) {
    if (done || open.has(i)) return;
    if (flags.has(i)) { flags.delete(i); cellEl(i).innerHTML = ''; cellEl(i).classList.remove('flag'); }
    else { flags.add(i); cellEl(i).innerHTML = '<img src="img/ui/triangular-flag.png" alt="flag">'; cellEl(i).classList.add('flag'); }
    q('left').textContent = L.m - flags.size;
    sfx.note(); buzz(20);
  }

  async function boom(i) {
    done = true; stopTimer();
    m.played[lv] = (m.played[lv] || 0) + 1; save();
    sfx.error(); buzz([60, 40, 60]);
    cellEl(i).classList.add('hit');
    const list = [...mines].sort((a, b) => Math.hypot(Math.floor(a / w) - Math.floor(i / w), a % w - i % w) - Math.hypot(Math.floor(b / w) - Math.floor(i / w), b % w - i % w));
    list.forEach((k, n) => setTimeout(() => { const c = cellEl(k); if (!flags.has(k)) { c.classList.add('mine'); c.innerHTML = '<img src="img/ui/bomb.png" alt="mine">'; } if (n % 3 === 0) sfx.cross(); }, 120 + n * 60));
    flags.forEach((k) => { if (!mines.has(k)) cellEl(k).classList.add('wrong'); });
    root.querySelector('.mines-wrap').classList.add('quake');
    await new Promise((r) => setTimeout(r, 800 + list.length * 60));
    const v = await dialog({ hero: 'img/ui/collision.png', title: 'Boom!', dismissible: false, text: 'You hit a mine. Every board can be solved by logic, so try again.', buttons: [{ label: 'Try a new board', value: 'new' }, { label: 'Back', value: 'back', cls: 'ghost' }] });
    if (v === 'new') build(); else app.back();
  }

  async function checkWin() {
    if (open.size + mines.size !== w * h || done) return;
    done = true; stopTimer();
    m.played[lv] = (m.played[lv] || 0) + 1;
    m.won[lv] = (m.won[lv] || 0) + 1;
    const best = !m.best[lv] || elapsed < m.best[lv];
    if (best) m.best[lv] = elapsed;
    save(true);
    mines.forEach((k) => { if (!flags.has(k)) { flags.add(k); cellEl(k).innerHTML = '<img src="img/ui/triangular-flag.png" alt="flag">'; cellEl(k).classList.add('flag'); } });
    sfx.win(); setTimeout(confetti, 300);
    await new Promise((r) => setTimeout(r, 900));
    const v = await dialog({ hero: 'img/ui/trophy.png', title: 'Board cleared!', dismissible: false, text: `${L.label} in ${fmtTime(elapsed)}${best ? '\nNew best time!' : ''}`, buttons: [{ label: 'Play again', value: 'new' }, { label: 'Back', value: 'back', cls: 'ghost' }] });
    if (v === 'new') build(); else app.back();
  }

  function startTimer() { stopTimer(); tick = setInterval(() => { elapsed++; q('time').textContent = fmtTime(elapsed); }, 1000); }
  function stopTimer() { clearInterval(tick); tick = null; }

  // tap to dig (or flag in flag mode), long-press to flag
  let press = null;
  board.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.mcell2'); if (!c) return;
    const i = +c.dataset.i;
    press = { i, long: false, t: setTimeout(() => { press.long = true; toggleFlag(i); }, 380) };
  });
  const endPress = (cancel) => { if (!press) return; clearTimeout(press.t); const p = press; press = null; if (cancel || p.long) return; if (flagMode && !open.has(p.i)) toggleFlag(p.i); else dig(p.i); };
  board.addEventListener('pointerup', () => endPress(false));
  board.addEventListener('pointercancel', () => endPress(true));
  board.addEventListener('pointerleave', () => endPress(true));
  board.addEventListener('contextmenu', (e) => e.preventDefault());

  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') minesHelp();
    else if (a === 'mode') { flagMode = !flagMode; $('.dig', root).classList.toggle('on', !flagMode); $('.flg', root).classList.toggle('on', flagMode); sfx.tap(); }
    else if (a === 'new') { if (mines && !done) { const ok = await dialog({ title: 'Start a new board?', buttons: [{ label: 'New board', value: true }, { label: 'Cancel', value: false, cls: 'ghost' }] }); if (!ok) return; } build(); }
  });

  requestAnimationFrame(() => { build(); if (!m.seenHelp) { m.seenHelp = true; save(); setTimeout(minesHelp, 300); } });
  return { root, destroy() { stopTimer(); }, onHide() { stopTimer(); }, onShow() { if (mines && !done) startTimer(); } };
}
export { makeBoard, solvable, counts };
