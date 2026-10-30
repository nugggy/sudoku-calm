// Paint Pixels: colour by numbers. Pick a colour, then tap or drag across the squares with its number until the picture appears.
// Over 1,000 public-domain and original pictures in 20 categories. Metadata is in levels/paint/index.json and the cells
// for each category in one .bin file (one byte per square, a palette index or 255 for background). Built by tools/paint.
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, esc, sheet, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';
import { native } from './native.js';
import { helpSheet } from './kit.js';
import { Board, renderThumb, EMPTY } from './paint-board.js';

const PP = () => store.paint;
const LEVELS = ['Easy', 'Medium', 'Hard'];
const fmt = (n) => n.toLocaleString('en-AU');

export const paintHelp = () => helpSheet('How to play Paint Pixels', [
  'Pick a colour at the bottom, then tap or drag over the squares with its number. Squares of the chosen colour are shaded so they are easy to spot.',
  'Pinch to zoom, and drag from anywhere you are not painting to move around. Double-tap to zoom in close enough to read the numbers, or back out again.',
  'Long-press a square to pick up its colour. Stuck? The light bulb finds the next square of your colour.',
  'Your progress is saved as you go. Finished pictures can be shared from the menu.',
], 'px-btn');

// A pixel heart, painted on the left and still numbered on the right.
const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
export const paintCardArt = () => `<div class="art-paint">${HEART.map((row, y) => [...row].map((ch, x) => ch === '.' ? '<i></i>'
  : x + y < 6 ? `<i class="on" style="background:${['#ff5d73', '#ff8a5c', '#ffb347'][(x + y) % 3]}"></i>` : '<i class="num">1</i>').join('')).join('')}</div>`;

// ---------- Library ----------
let categories = [];
const byId = new Map();
const bins = new Map();
const cache = new Map();
let loading = null;

function loadLibrary() {
  loading ||= fetch('levels/paint/index.json').then((r) => r.json()).then((index) => {
    categories = index.categories;
    for (const c of categories) for (const p of c.puzzles) { p.category = c.id; byId.set(p.id, p); }
  }).catch(() => { loading = null; });
  return loading;
}
const allPuzzles = () => categories.flatMap((c) => c.puzzles);

async function loadPuzzle(id) {
  if (cache.has(id)) return cache.get(id);
  const meta = byId.get(id);
  const cat = categories.find((c) => c.id === meta.category);
  if (!bins.has(cat.id)) bins.set(cat.id, fetch('levels/paint/' + cat.file).then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b)));
  const bin = await bins.get(cat.id);
  const cells = bin.subarray(meta.offset, meta.offset + meta.w * meta.h);
  const counts = new Array(meta.palette.length).fill(0);
  let total = 0;
  for (const v of cells) if (v !== EMPTY) { counts[v]++; total++; }
  const puzzle = { ...meta, cells, total, counts };
  cache.set(id, puzzle);
  return puzzle;
}

// A steady picture of the day from the whole library.
function dailyPuzzle(date = new Date()) {
  const all = allPuzzles();
  if (!all.length) return null;
  const day = Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);
  const h = ((day * 2654435761) ^ ((day * 2654435761) >>> 13)) >>> 0;
  return all[h % all.length];
}

// ---------- Saved progress ----------
// store.paint.pics holds a summary per picture. The painted squares themselves are a bitset in their own
// localStorage key, so the main save stays small. A bitset without a summary (after Reset all progress) is ignored.
const KEY = (id) => `gamehub.paint.${id}`;

function loadFilled(id, size) {
  const filled = new Uint8Array(size);
  if (!PP().pics[id]) return filled;
  try {
    const raw = localStorage.getItem(KEY(id));
    if (raw) {
      const s = atob(raw);
      for (let i = 0; i < size; i++) if (s.charCodeAt(i >> 3) & (1 << (i & 7))) filled[i] = 1;
    }
  } catch { /* corrupt entry: start fresh */ }
  return filled;
}

function saveFilled(id, filled, count, total) {
  const bits = new Uint8Array((filled.length + 7) >> 3);
  for (let i = 0; i < filled.length; i++) if (filled[i]) bits[i >> 3] |= 1 << (i & 7);
  let s = '';
  for (let i = 0; i < bits.length; i += 0x8000) s += String.fromCharCode(...bits.subarray(i, i + 0x8000));
  try { localStorage.setItem(KEY(id), btoa(s)); } catch { /* storage full */ }
  PP().pics[id] = { filled: count, total, completed: count >= total, updated: Date.now() };
  save();
}

function resetPicture(id) {
  try { localStorage.removeItem(KEY(id)); } catch { /* ignore */ }
  delete PP().pics[id];
  save();
}

function toggleFavourite(id) {
  const favs = PP().favs, i = favs.indexOf(id);
  if (i >= 0) favs.splice(i, 1); else favs.unshift(id);
  save();
  return i < 0;
}

export const paintProgress = () => {
  const pics = Object.values(PP().pics), done = pics.filter((s) => s.completed).length;
  return done ? `${fmt(done)} ${done === 1 ? 'picture' : 'pictures'} painted` : pics.length ? `${pics.length} in progress` : 'Over 1,000 pictures';
};

// ---------- Thumbnails (drawn as cards scroll into view) ----------
let thumbObserver = null;
function observeThumb(canvas) {
  thumbObserver ||= new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      thumbObserver.unobserve(e.target);
      drawThumb(e.target);
    }
  }, { rootMargin: '300px' });
  thumbObserver.observe(canvas);
}

async function drawThumb(canvas) {
  const id = canvas.dataset.id, p = await loadPuzzle(id), s = PP().pics[id];
  renderThumb(canvas, p, p.cells, s && !s.completed ? loadFilled(id, p.cells.length) : null, !!s?.completed);
  canvas.classList.add('ready');
}

function cardMeta(p) {
  const s = PP().pics[p.id], pct = s ? Math.floor((s.filled / s.total) * 100) : 0;
  return `<span class="px-level l${p.level}">${LEVELS[p.level]}</span>
    ${PP().favs.includes(p.id) ? `<span class="px-fav">${icon.heart}</span>` : ''}
    ${s?.completed ? `<span class="px-done">${icon.check}</span>` : s ? `<span class="px-pct">${pct}%</span>` : ''}
    ${s && !s.completed ? `<span class="px-bar"><i style="width:${pct}%"></i></span>` : ''}`;
}

function card(p) {
  const c = el(`<button class="px-card" data-id="${p.id}" aria-label="${esc(p.title)}">
    <div class="px-thumb"><canvas data-id="${p.id}"></canvas></div><div class="px-meta">${cardMeta(p)}</div></button>`);
  observeThumb($('canvas', c));
  return c;
}

// Adds cards a page at a time as the player scrolls, so 1,000 pictures stay smooth.
function grid(items, container) {
  if (!items.length) { container.appendChild(el('<p class="px-empty">Nothing here yet.</p>')); return; }
  const g = el('<div class="px-grid"></div>'), sentinel = el('<div class="px-sentinel"></div>');
  container.append(g, sentinel);
  let shown = 0;
  const io = new IntersectionObserver((e) => e[0].isIntersecting && more(), { rootMargin: '600px' });
  function more() {
    items.slice(shown, shown + 36).forEach((p) => g.appendChild(card(p)));
    shown = Math.min(items.length, shown + 36);
    if (shown >= items.length) { sentinel.remove(); io.disconnect(); }
  }
  more();
  if (shown < items.length) io.observe(sentinel);
}

// ---------- Home: library and My Art ----------
export function paintHomeScreen(app) {
  const root = el(`<section class="screen paint-theme px-home">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">Paint Pixels</div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button>
      <button class="icon-btn" data-act="settings" aria-label="Paint Pixels settings">${icon.gear}</button></header>
    <div class="scroll"><div class="px-loading"><div class="spinner"></div></div></div></section>`);
  const body = $('.scroll', root);
  const lib = { cat: 'all', level: -1, query: '' };
  let tab = 'library', mineTab = 'progress';

  function render() {
    body.innerHTML = `<div class="seg px-tabs"><button data-tab="library" class="${tab === 'library' ? 'on' : ''}">Library</button><button data-tab="mine" class="${tab === 'mine' ? 'on' : ''}">My Art</button></div><div data-el="view"></div>`;
    if (tab === 'library') renderLibrary($('[data-el="view"]', body)); else renderMine($('[data-el="view"]', body));
  }

  function inProgress() {
    return Object.entries(PP().pics).filter(([id, s]) => !s.completed && byId.has(id))
      .sort((a, b) => b[1].updated - a[1].updated).slice(0, 12).map(([id]) => byId.get(id));
  }

  function renderLibrary(v) {
    const daily = dailyPuzzle();
    v.innerHTML = `
      ${daily ? `<button class="px-daily" data-id="${daily.id}"><div class="px-daily-thumb"><canvas data-id="${daily.id}"></canvas></div>
        <div class="px-daily-text"><span class="px-eyebrow">Picture of the day</span><b>${esc(daily.title)}</b><small>${esc(daily.artist)}</small><span class="px-go">Start painting</span></div></button>` : ''}
      <div data-el="continue"></div>
      <div class="px-filters">
        <label class="game-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
          <input type="search" data-el="q" placeholder="Search pictures" aria-label="Search pictures" autocomplete="off" enterkeyhint="search" value="${esc(lib.query)}"></label>
        <div class="px-chips">${[{ id: 'all', name: 'All' }, ...categories].map((c) => `<button class="px-chip ${lib.cat === c.id ? 'on' : ''}" data-cat="${c.id}">${esc(c.name)}</button>`).join('')}</div>
        <div class="seg px-levels">${['All', ...LEVELS].map((n, i) => `<button data-level="${i - 1}" class="${lib.level === i - 1 ? 'on' : ''}">${n}</button>`).join('')}</div>
      </div>
      <div data-el="results"></div>`;
    if (daily) observeThumb($('.px-daily canvas', v));
    renderContinue();
    results();
    requestAnimationFrame(() => $('.px-chip.on', v)?.scrollIntoView({ inline: 'center', block: 'nearest' }));
  }

  function renderContinue() {
    const box = $('[data-el="continue"]', body);
    if (!box) return;
    const list = inProgress();
    box.innerHTML = list.length ? '<div class="section-title">Continue painting</div><div class="px-row"></div>' : '';
    list.forEach((p) => $('.px-row', box).appendChild(card(p)));
  }

  function results() {
    const r = $('[data-el="results"]', body), q = lib.query.toLowerCase();
    const items = (lib.cat === 'all' ? allPuzzles() : categories.find((c) => c.id === lib.cat)?.puzzles || [])
      .filter((p) => lib.level < 0 || p.level === lib.level)
      .filter((p) => !q || p.title.toLowerCase().includes(q) || p.artist.toLowerCase().includes(q));
    r.innerHTML = `<p class="px-count">${fmt(items.length)} pictures</p>`;
    grid(items, r);
  }

  function renderMine(v) {
    const pics = PP().pics, done = Object.values(pics).filter((s) => s.completed).length;
    const squares = Object.values(pics).reduce((n, s) => n + s.filled, 0);
    v.innerHTML = `<div class="px-stats"><div><b>${fmt(done)}</b>finished</div><div><b>${fmt(Object.keys(pics).length - done)}</b>in progress</div><div><b>${fmt(squares)}</b>squares painted</div></div>
      <div class="seg px-mine-tabs">${[['progress', 'In progress'], ['done', 'Finished'], ['favs', 'Favourites']].map(([k, l]) => `<button data-mine="${k}" class="${mineTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div data-el="mine"></div>`;
    const list = mineTab === 'favs' ? PP().favs.map((id) => byId.get(id)).filter(Boolean)
      : Object.entries(pics).filter(([, s]) => s.completed === (mineTab === 'done')).sort((a, b) => b[1].updated - a[1].updated).map(([id]) => byId.get(id)).filter(Boolean);
    grid(list, $('[data-el="mine"]', v));
  }

  // Back from a picture: update the cards in place so the scroll position is kept.
  function refresh() {
    if (!categories.length) return;
    if (tab === 'mine') { const top = body.scrollTop; render(); body.scrollTop = top; return; }
    $$('.px-grid .px-card', body).forEach((c) => {
      $('.px-meta', c).innerHTML = cardMeta(byId.get(c.dataset.id));
      const cv = $('canvas', c);
      if (cv.classList.contains('ready')) drawThumb(cv);
    });
    const d = $('.px-daily canvas', body);
    if (d?.classList.contains('ready')) drawThumb(d);
    renderContinue();
  }

  let debounce = 0;
  body.addEventListener('input', (e) => {
    if (!e.target.matches('[data-el="q"]')) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => { lib.query = e.target.value.trim(); results(); }, 200);
  });
  body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-el="q"]')) e.target.blur(); });
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return paintHelp();
    if (a === 'settings') return paintSettings();
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; sfx.tap(); render(); body.scrollTop = 0; return; }
    const m = e.target.closest('[data-mine]');
    if (m) { mineTab = m.dataset.mine; sfx.tap(); render(); return; }
    const c = e.target.closest('[data-cat]');
    if (c) { lib.cat = c.dataset.cat; sfx.tap(); $$('.px-chip', body).forEach((x) => x.classList.toggle('on', x === c)); results(); return; }
    const l = e.target.closest('[data-level]');
    if (l) { lib.level = +l.dataset.level; sfx.tap(); $$('[data-level]', body).forEach((x) => x.classList.toggle('on', x === l)); results(); return; }
    const p = e.target.closest('[data-id]');
    if (p) { sfx.tap(); app.go('paintgame', { id: p.dataset.id }); }
  });

  loadLibrary().then(() => {
    if (!categories.length) { body.innerHTML = '<p class="px-empty">The pictures could not be loaded.</p>'; return; }
    render();
  });
  return { root, refresh };
}

function paintSettings() {
  const row = (k, label, sub) => `<button class="set-row" data-k="${k}"><div class="txt">${label}<small>${sub}</small></div><div class="switch ${PP()[k] ? 'on' : ''}"></div></button>`;
  sheet(`<h2>Paint Pixels settings</h2><div class="px-set">
    ${row('grid', 'Grid lines', 'Outline unpainted squares when zoomed in')}
    ${row('autoNext', 'Next colour automatically', 'Move on to the next colour when one is finished')}</div>
    <p class="px-set-note">Sound and vibration follow the GameHub settings.</p>`, {
    onMount(node) {
      node.addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]'); if (!b) return;
        PP()[b.dataset.k] = !PP()[b.dataset.k]; save(); sfx.tap();
        $('.switch', b).classList.toggle('on', PP()[b.dataset.k]);
      });
    },
  });
}

// ---------- Painting ----------
export function paintGameScreen(app, { id }) {
  const root = el(`<section class="screen paint-theme px-play">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title px-title"><b data-el="name"></b><small data-el="pt"></small></div>
      <button class="icon-btn" data-act="hint" aria-label="Find a square">${icon.bulb}</button>
      <button class="icon-btn" data-act="more" aria-label="More">${icon.info}</button></header>
    <div class="px-progress"><i data-el="bar"></i></div>
    <div class="px-host" data-el="host">
      <div class="px-zoom"><button class="icon-btn" data-act="zin" aria-label="Zoom in">${icon.plus}</button>
        <button class="icon-btn" data-act="zout" aria-label="Zoom out">${icon.minus}</button>
        <button class="icon-btn" data-act="zfit" aria-label="Fit picture">${icon.fit}</button></div>
      <div class="px-loading"><div class="spinner"></div></div>
    </div>
    <nav class="px-palette" data-el="pal"></nav></section>`);
  const host = $('[data-el="host"]', root), pal = $('[data-el="pal"]', root);
  let b = null, puzzle = null, meta = null, filled = null, finished = false, saveTimer = 0, gone = false;
  const swatches = [];

  const keep = (now = false) => {
    clearTimeout(saveTimer);
    const write = () => b && saveFilled(id, filled, b.filledCount, puzzle.total);
    if (now) write(); else saveTimer = setTimeout(write, 600);
  };
  const updateProgress = () => {
    const pct = (b.filledCount / puzzle.total) * 100;
    $('[data-el="pt"]', root).textContent = `${Math.floor(pct)}% · ${fmt(puzzle.total - b.filledCount)} left`;
    $('[data-el="bar"]', root).style.width = pct + '%';
  };
  const updateSwatch = (c) => {
    const s = swatches[c]; if (!s) return;
    const pct = puzzle.counts[c] ? b.doneByColour[c] / puzzle.counts[c] : 1;
    s.style.setProperty('--p', String(pct * 360));
    s.classList.toggle('complete', pct >= 1);
  };
  const select = (c) => {
    b.select(c);
    swatches.forEach((s, i) => s.classList.toggle('on', i === c));
    swatches[c]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  };
  const nextColour = (from) => {
    const n = puzzle.palette.length;
    for (let k = 1; k <= n; k++) { const c = (from + k) % n; if (b.doneByColour[c] < puzzle.counts[c]) return c; }
    return -1;
  };

  async function start() {
    await loadLibrary();
    meta = byId.get(id);
    if (!meta) { app.back(); return; }
    puzzle = await loadPuzzle(id);
    if (gone) return;
    filled = loadFilled(id, puzzle.cells.length);
    $('[data-el="name"]', root).textContent = meta.title;
    $('.px-loading', host).remove();
    b = new Board(host, puzzle, filled, {
      onFill() { sfx.paint(); updateProgress(); updateSwatch(b.selected); keep(); },
      onColourDone(c) {
        updateSwatch(c);
        if (b.filledCount >= puzzle.total) return;
        sfx.colourDone();
        const n = nextColour(c);
        if (n >= 0 && PP().autoNext) select(n);
      },
      onComplete() {
        keep(true);
        if (finished) return;
        finished = true;
        setTimeout(celebrate, 350);
      },
      onWrong() {
        sfx.error();
        const sw = swatches[b.selected];
        sw?.classList.remove('nudge'); void sw?.offsetWidth; sw?.classList.add('nudge');
      },
      onPick(c) { buzz(); select(c); toast(`Colour ${c + 1} selected`); },
    });
    b.showGrid = PP().grid;
    puzzle.palette.forEach((hex, c) => {
      if (!puzzle.counts[c]) return;
      const [r, g, bl] = [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16));
      const light = r * 0.299 + g * 0.587 + bl * 0.114 > 150;
      const s = el(`<button class="px-swatch ${light ? 'light' : ''}" style="--c:${hex}" aria-label="Colour ${c + 1}"><span>${c + 1}</span><em>${icon.check}</em></button>`);
      s.addEventListener('click', () => { sfx.tap(); select(c); });
      swatches[c] = s;
      pal.appendChild(s);
      updateSwatch(c);
    });
    updateProgress();
    finished = b.filledCount >= puzzle.total;
    const first = nextColour(-1);
    select(first >= 0 ? first : 0);
  }

  function celebrate() {
    sfx.win(); confetti();
    const snap = b.snapshot(Math.max(4, Math.floor(480 / Math.max(meta.w, meta.h))), true);
    sheet(`<div class="px-celebrate"><span class="px-eyebrow">Masterpiece complete</span><img src="${snap.toDataURL()}" alt="">
        <h2>${esc(meta.title)}</h2><p>${esc(meta.artist)}</p></div>
      <button class="btn px-btn" data-a="next">Paint another</button>
      <button class="btn secondary" data-a="share">Share</button>
      <button class="btn ghost" data-a="lib">Back to the library</button>`, {
      onMount(node, close) {
        node.addEventListener('click', (e) => {
          const a = e.target.closest('[data-a]')?.dataset.a;
          if (a === 'share') share(true);
          else if (a === 'lib') { close(); app.back(); }
          else if (a === 'next') {
            close();
            const pool = categories.find((c) => c.id === meta.category).puzzles.filter((p) => !PP().pics[p.id]?.completed && p.id !== meta.id);
            const from = pool.length ? pool : allPuzzles();
            app.replace('paintgame', { id: from[Math.floor(Math.random() * from.length)].id });
          }
        });
      },
    });
  }

  async function share(complete) {
    const canvas = b.snapshot(Math.max(6, Math.floor(1080 / Math.max(meta.w, meta.h))), complete);
    const name = 'paint-pixels-' + meta.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '.png';
    const r = await native.shareImage(canvas, name, `I painted "${meta.title}" in GameHub`);
    if (r === 'saved') toast('Picture saved');
  }

  function more() {
    const fav = PP().favs.includes(id);
    sheet(`<h2>${esc(meta.title)}</h2>
      <p class="px-info">${esc(meta.artist)}${meta.date ? ', ' + esc(meta.date) : ''}<br>${LEVELS[meta.level]} · ${meta.w}×${meta.h} · ${puzzle.counts.filter(Boolean).length} colours · ${fmt(puzzle.total)} squares<br>${esc(meta.licence)}</p>
      <button class="sheet-item" data-a="fav">${icon.heart}${fav ? 'Remove from favourites' : 'Add to favourites'}</button>
      <button class="sheet-item" data-a="share">${icon.share}Share picture</button>
      <button class="sheet-item" data-a="source">${icon.info}View the original</button>
      <button class="sheet-item" data-a="reset">${icon.restart}Start again</button>`, {
      onMount(node, close) {
        node.addEventListener('click', async (e) => {
          const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
          close();
          if (a === 'fav') toast(toggleFavourite(id) ? 'Added to favourites' : 'Removed from favourites');
          else if (a === 'share') share(b.filledCount >= puzzle.total);
          else if (a === 'source') native.openUrl(meta.source);
          else if (a === 'reset') {
            const ok = await dialog({ title: 'Start again?', text: 'Your progress on this picture will be cleared.',
              buttons: [{ label: 'Start again', value: true, cls: 'danger' }, { label: 'Cancel', value: false, cls: 'ghost' }] });
            if (ok) { clearTimeout(saveTimer); b.destroy(); b = null; resetPicture(id); app.replace('paintgame', { id }); }
          }
        });
      },
    });
  }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (!b) return;
    if (a === 'zin') b.zoomBy(1.5);
    else if (a === 'zout') b.zoomBy(1 / 1.5);
    else if (a === 'zfit') b.fit();
    else if (a === 'more') more();
    else if (a === 'hint') {
      if (b.doneByColour[b.selected] >= puzzle.counts[b.selected]) { const n = nextColour(b.selected); if (n < 0) return; select(n); }
      sfx.hint(); b.hint();
    }
  });

  start();
  return {
    root,
    onHide: () => keep(true),
    destroy() { gone = true; if (b) { keep(true); b.destroy(); } },
  };
}
