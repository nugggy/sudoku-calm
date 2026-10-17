// Mahjong Garden: classic mahjong solitaire. Match free pairs of identical tiles until the board is clear.
import { mulberry32 } from './sudoku-engine.js';
import { store, save, fmtTime } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet, levelHome } from './kit.js';

const FACES = 36;
const MJ = () => store.mahjong;
export const mahjongHelp = () => helpSheet('How to play Mahjong Garden', [
  'Tap two matching tiles to remove them. A tile can only be picked when it is free: nothing on top of it, and nothing touching its left or right side.',
  'Clear every tile to win. Every deal can be cleared.',
  'Stuck? Use a hint, undo a move, or shuffle the tiles that are left.',
], 'mj-btn');

// Layouts: rectangles in tile units (x, y, w, h, height); a rectangle can be offset by half a tile.
const LAYOUTS = [
  { name: 'Little Pyramid', layers: [[0, 0, 6, 4, 0], [0.5, 0.5, 5, 3, 1], [1, 1, 4, 2, 2], [2, 1.5, 2, 1, 3]] },
  { name: 'Twin Towers', layers: [[0, 0, 7, 5, 0], [0, 0, 2, 5, 1], [5, 0, 2, 5, 1], [0.5, 1, 1, 3, 2], [5.5, 1, 1, 3, 2]] },
  { name: 'Garden Bed', layers: [[0, 0, 8, 5, 0], [1, 0.5, 6, 4, 1], [2, 1, 4, 3, 2], [3, 1.5, 2, 2, 3]] },
  { name: 'Butterfly', layers: [[0, 0, 3, 6, 0], [5, 0, 3, 6, 0], [3, 1, 2, 4, 0], [0.5, 1, 2, 4, 1], [5.5, 1, 2, 4, 1], [3, 2, 2, 2, 1]] },
  { name: 'Fortress', layers: [[0, 0, 8, 6, 0], [0.5, 0.5, 7, 5, 1], [1, 1, 6, 4, 2], [2, 1.5, 4, 3, 3], [3, 2, 2, 2, 4]] },
  { name: 'Staircase', layers: [[0, 0, 8, 6, 0], [0, 0, 6, 6, 1], [0, 0, 4, 6, 2], [0, 0, 2, 6, 3], [0.5, 2, 1, 2, 4]] },
];

function positions(layout) {
  const pos = [];
  layout.layers.forEach(([x0, y0, w, h, z]) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pos.push({ x: x0 + x, y: y0 + y, z }); });
  if (pos.length % 2) pos.pop(); // pairs only
  return pos;
}

const overlapsAbove = (a, b) => b.z === a.z + 1 && Math.abs(b.x - a.x) < 1 && Math.abs(b.y - a.y) < 1;
const sideBlock = (a, b, dir) => b.z === a.z && Math.abs(b.y - a.y) < 1 && Math.abs(b.x - (a.x + dir)) < 0.5;
export function isFree(t, live) {
  if (live.some((o) => o !== t && overlapsAbove(t, o))) return false;
  const left = live.some((o) => o !== t && sideBlock(t, o, -1));
  const right = live.some((o) => o !== t && sideBlock(t, o, 1));
  return !left || !right;
}

// Deal by removing free pairs in reverse: playing the removals forwards always clears the board.
function assignFaces(tiles, rng, faces) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const live = tiles.slice();
    const pairs = [];
    let ok = true;
    while (live.length) {
      const free = live.filter((t) => isFree(t, live));
      if (free.length < 2) { ok = false; break; }
      const a = free[(rng() * free.length) | 0];
      let b; do { b = free[(rng() * free.length) | 0]; } while (b === a);
      pairs.push([a, b]);
      live.splice(live.indexOf(a), 1); live.splice(live.indexOf(b), 1);
    }
    if (!ok) continue;
    const order = faces ? faces.slice() : null;
    pairs.forEach(([a, b], i) => { const f = order ? order[i] : ((rng() * FACES) | 0); a.f = f; b.f = f; });
    return true;
  }
  return false;
}

export function deal(level) {
  const layout = LAYOUTS[level % LAYOUTS.length];
  const rng = mulberry32(8080 + level * 313);
  const tiles = positions(layout).map((p, id) => ({ ...p, id }));
  // spread the faces evenly so each face appears in two or four tiles
  const pairsNeeded = tiles.length / 2;
  const faceOrder = [...Array(pairsNeeded)].map((_, i) => (i % FACES)).sort(() => rng() - 0.5);
  assignFaces(tiles, rng, faceOrder);
  return { layout, tiles };
}

// ---------- Home ----------
export function mahjongHomeScreen(app) {
  return levelHome({
    app, cls: 'mj-theme', title: 'Mahjong Garden', help: mahjongHelp,
    hero: `<div class="mj-hero">${[0, 13, 22, 31].map((f, i) => `<div class="mj-tile" style="transform:rotate(${(i - 1.5) * 8}deg)"><img src="img/art/mahjong/m${String(f).padStart(2, '0')}.svg" alt=""></div>`).join('')}</div>`,
    play: () => ({ label: `Play board ${MJ().level + 1}`, sub: LAYOUTS[MJ().level % LAYOUTS.length].name }),
    onPlay: () => app.go('mjgame', { level: MJ().level }),
    levels: () => ({ heading: 'Boards', count: Math.max(24, Math.ceil((MJ().level + 12) / 6) * 6), current: MJ().level, done: (i) => i < MJ().level }),
    onLevel: (i) => app.go('mjgame', { level: i }),
  });
}

// ---------- Game ----------
export function mahjongGameScreen(app, { level }) {
  const mj = MJ();
  const { layout, tiles } = deal(level);
  let live = tiles.slice(), sel = null, history = [], elapsed = 0, tick = null, done = false;
  const root = el(`<section class="screen mj-theme mj-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">${layout.name}</div><span class="cross-time" data-el="time">00:00</span>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="mj-info"><span data-el="left"></span><span data-el="pairs"></span></div>
    <div class="mj-area" data-el="area"><div class="mj-board" data-el="board"></div></div>
    <div class="mj-bar">
      <button class="sort-boost" data-act="undo" aria-label="Undo">${icon.undo}</button>
      <button class="sort-boost hint-btn" data-act="hint" aria-label="Hint"><img src="img/art/ui/light-bulb.svg" alt=""></button>
      <button class="sort-boost" data-act="shuffle" aria-label="Shuffle">${icon.refresh}</button>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const board = q('board');
  let tw = 40, th = 52, depth = 5;

  function layoutSize() {
    const maxX = Math.max(...tiles.map((t) => t.x)) + 1, maxY = Math.max(...tiles.map((t) => t.y)) + 1, maxZ = Math.max(...tiles.map((t) => t.z));
    const area = q('area').getBoundingClientRect();
    tw = Math.floor(Math.min((area.width - 24) / (maxX + maxZ * 0.12), ((area.height - 24) / (maxY + maxZ * 0.12)) / 1.3, 64));
    th = Math.round(tw * 1.3); depth = Math.max(3, Math.round(tw * 0.12));
    board.style.width = maxX * tw + maxZ * depth + 'px';
    board.style.height = maxY * th + maxZ * depth + 'px';
    board.style.setProperty('--tw', tw + 'px'); board.style.setProperty('--th', th + 'px'); board.style.setProperty('--dp', depth + 'px');
  }

  function render() {
    const maxZ = Math.max(...tiles.map((t) => t.z));
    board.innerHTML = live.slice().sort((a, b) => a.z - b.z || a.y - b.y || b.x - a.x).map((t) => {
      const free = isFree(t, live);
      const x = t.x * tw + (maxZ - t.z) * depth, y = t.y * th + (maxZ - t.z) * depth;
      return `<div class="mj-tile ${free ? 'free' : 'blocked'} ${sel === t ? 'sel' : ''}" data-id="${t.id}" style="left:${x}px;top:${y}px;z-index:${t.z * 100 + Math.round(t.y * 2) * 5 + Math.round(10 - t.x)}"><img src="img/art/mahjong/m${String(t.f).padStart(2, '0')}.svg" alt=""></div>`;
    }).join('');
    q('left').textContent = `${live.length} tiles left`;
    q('pairs').textContent = `${movesAvailable().length} matches available`;
    $('[data-act="undo"]', root).disabled = !history.length;
  }

  function movesAvailable() {
    const free = live.filter((t) => isFree(t, live));
    const out = [];
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) if (free[i].f === free[j].f) out.push([free[i], free[j]]);
    return out;
  }

  function tap(t) {
    if (done) return;
    if (!isFree(t, live)) { const n = $(`.mj-tile[data-id="${t.id}"]`, board); n.classList.remove('nope'); void n.offsetWidth; n.classList.add('nope'); buzz(15); return; }
    if (!sel) { sel = t; sfx.tap(); render(); return; }
    if (sel === t) { sel = null; render(); return; }
    if (sel.f !== t.f) { sel = t; sfx.tap(); render(); return; }
    const a = sel, b = t;
    sel = null;
    history.push(live.slice());
    [a, b].forEach((x) => { const n = $(`.mj-tile[data-id="${x.id}"]`, board); n.classList.add('gone'); });
    sfx.place(); buzz(12);
    setTimeout(() => {
      live = live.filter((x) => x !== a && x !== b);
      render();
      if (!live.length) return win();
      if (!movesAvailable().length) stuck();
    }, 260);
  }

  async function stuck() {
    const v = await dialog({ hero: 'img/art/ui/thinking-face.svg', title: 'No matches left', text: 'Shuffle the remaining tiles, or undo your last move.', buttons: [{ label: 'Shuffle', value: 'shuffle' }, { label: 'Undo', value: 'undo', cls: 'secondary' }] });
    if (v === 'shuffle') shuffle(); else if (v === 'undo') undo();
  }

  function shuffle() {
    const rng = Math.random;
    const faces = []; for (let i = 0; i < live.length; i += 2) faces.push(live[i].f);
    // re-deal the remaining tiles so they can still all be cleared
    const pairsFaces = []; const counts = {};
    live.forEach((t) => { counts[t.f] = (counts[t.f] || 0) + 1; });
    for (const f of Object.keys(counts)) for (let i = 0; i < counts[f] / 2; i++) pairsFaces.push(+f);
    pairsFaces.sort(() => rng() - 0.5);
    assignFaces(live, rng, pairsFaces);
    history = []; sel = null;
    sfx.cross(); render();
    $$('.mj-tile', board).forEach((n, i) => { n.style.animationDelay = i * 8 + 'ms'; n.classList.add('shuffled'); });
  }
  function undo() { if (!history.length) return; live = history.pop(); sel = null; sfx.erase(); render(); }
  function hint() {
    const m = movesAvailable()[0];
    if (!m) return stuck();
    m.forEach((t) => { const n = $(`.mj-tile[data-id="${t.id}"]`, board); n.classList.remove('hinted'); void n.offsetWidth; n.classList.add('hinted'); });
    sfx.hint();
  }

  async function win() {
    done = true; stopTimer();
    if (level >= mj.level) mj.level = level + 1;
    if (!mj.best[level] || elapsed < mj.best[level]) mj.best[level] = elapsed;
    save(true);
    sfx.win(); confetti();
    const v = await dialog({ hero: 'img/art/mahjong/m34.svg', title: 'Garden cleared!', dismissible: false, text: `${layout.name} in ${fmtTime(elapsed)}`, buttons: [{ label: 'Next board', value: 'next' }, { label: 'Back', value: 'back', cls: 'ghost' }] });
    if (v === 'next') app.replace('mjgame', { level: level + 1 }); else app.back();
  }

  function startTimer() { stopTimer(); if (!done) tick = setInterval(() => { elapsed++; q('time').textContent = fmtTime(elapsed); }, 1000); }
  function stopTimer() { clearInterval(tick); tick = null; }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('.mj-tile');
    if (t) return tap(live.find((x) => x.id === +t.dataset.id));
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') mahjongHelp();
    else if (a === 'undo') undo();
    else if (a === 'hint') hint();
    else if (a === 'shuffle') shuffle();
  });
  const onResize = () => { layoutSize(); render(); };
  window.addEventListener('resize', onResize);
  requestAnimationFrame(() => { layoutSize(); render(); startTimer(); if (!mj.seenHelp) { mj.seenHelp = true; save(); setTimeout(mahjongHelp, 300); } });
  return { root, destroy() { stopTimer(); window.removeEventListener('resize', onResize); }, onHide() { stopTimer(); }, onShow() { startTimer(); } };
}
