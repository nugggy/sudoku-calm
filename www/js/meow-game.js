// Meowdoku: home tab, game screen, level map and cat collection.
import { decodeLevel, generateLevel, conflicts, findHint, neighbours8, UNKNOWN, CROSS, CAT } from './meow-engine.js';
import { store, save, fmtTime } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, sheet, confetti, toast } from './ui.js';
import { sfx, buzz } from './sound.js';
import { cbOn, symbolFor, symbolSvg } from './cb.js';

export const CATS = [
  { img: 'cat01.svg', name: 'Mango' }, { img: 'cat02.svg', name: 'Biscuit' }, { img: 'cat03.svg', name: 'Pepper' },
  { img: 'cat04.svg', name: 'Rosie' }, { img: 'cat05.svg', name: 'Smudge' }, { img: 'cat06.svg', name: 'Patches' },
  { img: 'cat07.svg', name: 'Ziggy' }, { img: 'cat08.svg', name: 'Shadow' }, { img: 'cat09.svg', name: 'Misty' },
  { img: 'cat10.svg', name: 'Grumbles' }, { img: 'cat11.svg', name: 'Toffee' }, { img: 'cat12.svg', name: 'Cocoa' },
  { img: 'cat13.svg', name: 'Tiger' }, { img: 'cat14.svg', name: 'Leo' },
];
const UNLOCK_EVERY = 10; // a new cat every 10 levels
const LIVES = 3;         // wrong cats allowed per level
const DOUBLE_MS = 400;   // two taps on one cell within this time place a cat; a later second tap only clears the cross
const heartSvg = '<svg viewBox="0 0 24 24"><path d="M12 21C5 16.3 2 12.6 2 8.6 2 5.5 4.4 3.2 7.3 3.2c1.9 0 3.6 1 4.7 2.6 1.1-1.6 2.8-2.6 4.7-2.6 2.9 0 5.3 2.3 5.3 5.4 0 4-3 7.7-10 12.4z"/></svg>';
export const catUnlocked = (k) => store.meow.level >= k * UNLOCK_EVERY;
export const catSrc = (k = store.meow.cat) => `img/art/cats/${CATS[k].img}`;

const COLOURS = ['#e3bb45', '#e8a7c0', '#9b80d6', '#c4678c', '#7cc4a4', '#7fb2e5', '#f0956a', '#b5cf6b', '#a0764e', '#a9a9d9', '#6fc3c9', '#e35d5b', '#90a4ae'];

let levelList = null;
export async function loadLevels() {
  if (levelList) return levelList;
  try {
    const r = await fetch('levels/meow-levels.json');
    levelList = (await r.json()).levels;
  } catch { levelList = []; }
  return levelList;
}
export const TOTAL_LEVELS_LABEL = () => (levelList ? levelList.length : 1000);
export function sizeOfLevel(idx) {
  if (levelList && idx < levelList.length) return +levelList[idx].split(':')[0];
  return 11; // endless levels after the pre-built set
}
function getLevel(idx) {
  if (levelList && idx < levelList.length) return decodeLevel(levelList[idx]);
  // Endless mode beyond the hand-picked set: generated from the level number, so it is always the same board.
  const lv = generateLevel(sizeOfLevel(idx), 900001 + idx * 31);
  return { n: lv.n, regions: lv.regions, solution: lv.solution };
}

// ---------- Help ----------
export function meowHelp() {
  const cat = catSrc();
  sheet(`<h2>How to play</h2><div class="help-body">
    <p>Place one cat in every <b>row</b>, every <b>column</b> and every <b>colour region</b>.</p>${cbOn() ? `
    <p>Each region has a thick outline and its own small symbol in the corner of every cell.</p>` : ''}
    <p>Cats need personal space. Two cats can never touch, not even corner to corner.</p>
    <div class="demo">
      <div><span></span>Empty</div>
      <div><span style="color:#5a4a42">${icon.x.replace('<svg', '<svg width="20" height="20" style="opacity:.6"')}</span>Tap</div>
      <div><span><img src="${cat}" alt=""></span>Double-tap</div>
    </div>
    <p>Tap a cell to cross it out, and tap it again later to clear it. Drag across cells to cross out lots at once.</p>
    <p>To place a cat, <b>double-tap</b> a cell quickly. Tapping a crossed-out cell again later never turns it into a cat.</p>
    <p>You have <b>3 lives</b> on each level. A cat in the wrong cell costs a life and that cell gets crossed out.</p>
    <p>Stuck? The hint button finds mistakes first, then shows you the next logical move and why it works. You never need to guess.</p>
  </div><button class="meow-btn" data-x>Let's play</button>`, { onMount: (n, close) => $('[data-x]', n).onclick = close });
}

// ---------- Home tab ----------
export function meowHomeScreen(app) {
  const root = el(`<section class="screen meow-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title"></div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button>
      <button class="icon-btn" data-act="settings" aria-label="Settings">${icon.gear}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  async function render() {
    await loadLevels();
    const m = store.meow;
    const lvl = m.level;
    const n = sizeOfLevel(lvl);
    const unlocked = CATS.filter((_, k) => catUnlocked(k)).length;
    const nextUnlock = CATS.findIndex((_, k) => !catUnlocked(k));
    const resume = m.current && m.current.idx === lvl;
    body.innerHTML = `
      <div class="meow-home-hero"><img src="${catSrc()}" alt=""><h1>Meowdoku</h1><p>Level ${lvl + 1} · ${n}×${n} board</p></div>
      <button class="meow-btn" data-act="play">${resume ? 'Continue' : 'Play'} level ${lvl + 1}<small>${resume ? fmtTime(m.current.elapsed) : 'One cat per row, column and colour'}</small></button>
      <div style="height:14px"></div>
      <div class="meow-card" style="display:flex;align-items:center;gap:14px">
        <img src="img/art/ui/paw-prints.svg" alt="" style="width:48px;height:48px">
        <div style="flex:1"><b>${lvl} of ${TOTAL_LEVELS_LABEL()}+ levels solved</b>
          <div class="progress" style="margin:8px 0 0"><i style="width:${Math.min(100, lvl / TOTAL_LEVELS_LABEL() * 100)}%;background:#f08a4b"></i></div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
        <button class="meow-btn alt" data-act="levels">Levels<small>Replay any solved board</small></button>
        <button class="meow-btn alt" data-act="cats">Cats ${unlocked}/${CATS.length}<small>${nextUnlock < 0 ? 'All collected' : `Next at level ${nextUnlock * UNLOCK_EVERY}`}</small></button>
      </div>
      <div class="section-title">Your record</div>
      <div class="meow-card">
        <div class="stat-row"><img src="img/art/ui/trophy.svg" alt=""><span class="k">Levels solved</span><span class="v">${lvl}</span></div>
        <div class="stat-row"><img src="img/art/ui/calendar.svg" alt=""><span class="k">Total time</span><span class="v">${fmtTime(m.totalTime)}</span></div>
        <div class="stat-row"><img src="img/art/ui/light-bulb.svg" alt=""><span class="k">Hints used</span><span class="v">${m.hints}</span></div>
      </div>`;
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'play') app.go('meowgame', { idx: store.meow.level });
    else if (a === 'levels') app.go('meowlevels');
    else if (a === 'cats') app.go('meowcats');
    else if (a === 'help') meowHelp();
    else if (a === 'settings') app.go('settings');
  });
  render();
  return { root, refresh: render };
}

// ---------- Game ----------
export function meowGameScreen(app, { idx }) {
  const S = store.settings, m = store.meow;
  const level = getLevel(idx);
  const { n, regions } = level;
  const isSol = (i) => level.solution[(i / n) | 0] === i % n;
  let state, history, elapsed, lives;
  if (m.current && m.current.idx === idx && m.current.state.length === n * n) ({ state, history, elapsed, lives = LIVES } = m.current);
  else { state = new Array(n * n).fill(UNKNOWN); history = []; elapsed = 0; lives = LIVES; }
  // cats only ever go where they belong; games saved before lives existed may still hold wrong ones
  state.forEach((s, i) => { if (s === CAT && !isSol(i)) state[i] = UNKNOWN; });
  const cur = () => (m.current = { idx, state, history, elapsed, lives });
  let done = false, tick = null, hint = null;

  const root = el(`<section class="screen meow-theme meow-game">
    <header class="meow-header">
      <button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="cat-count"><img src="${catSrc()}" alt=""><span><span class="got" data-el="got">0</span>/${n}</span></div>
      <div class="meow-lives" data-el="lives" aria-label="Lives"></div>
      <div class="title">Level ${idx + 1}</div>
      <button class="round-btn" data-act="help" aria-label="How to play">${icon.help}</button>
      <button class="round-btn" data-act="settings" aria-label="Settings">${icon.gear}</button>
    </header>
    <div class="rules"><div>1 cat in each colour region</div><div>1 cat in every row and column</div><div>Cats can't touch, even diagonally</div></div>
    <div class="mboard-wrap"><div class="mboard" style="grid-template-columns:repeat(${n},minmax(0,1fr));grid-template-rows:repeat(${n},minmax(0,1fr));--mgap:${n > 10 ? 2 : n > 8 ? 3 : n > 6 ? 4 : 6}px;--mrad:${n > 10 ? 4 : n > 8 ? 5 : 8}px"></div></div>
    <div class="meow-hint" data-el="hint"><img src="img/art/ui/light-bulb.svg" alt=""><span data-el="hint-text"></span><button class="pill-btn" data-act="apply" style="flex-shrink:0;background:#f08a4b">Do it</button></div>
    <div class="meow-tools">
      <button class="round-btn" data-act="undo" aria-label="Undo">${icon.undo}</button>
      <button class="round-btn" data-act="restart" aria-label="Restart">${icon.restart}</button>
      <button class="round-btn" data-act="hint" aria-label="Hint"><img src="img/art/ui/light-bulb.svg" alt=""></button>
    </div>
    <div class="meow-timer" data-el="timer"></div>
  </section>`);
  const boardEl = $('.mboard', root);
  // colourblind mode: thick walls where regions meet, and a small symbol per region in each cell's corner
  const cb = cbOn(), wall = n > 10 ? 1.5 : 2;
  const sym = (i) => cb ? `<i class="msym">${symbolSvg(symbolFor(regions[i]), { size: 12, fill: 'rgba(60, 40, 30, .45)', stroke: 'none', cls: '' })}</i>` : '';
  function walls(i) {
    const r = (i / n) | 0, c = i % n, R = regions[i];
    const side = (rr, cc) => (rr < 0 || cc < 0 || rr >= n || cc >= n ? wall * 2 : regions[rr * n + cc] !== R ? wall : 0);
    const [t, rt, b, l] = [side(r - 1, c), side(r, c + 1), side(r + 1, c), side(r, c - 1)];
    return [t && `inset 0 ${t}px 0 var(--mwall)`, rt && `inset -${rt}px 0 0 var(--mwall)`, b && `inset 0 -${b}px 0 var(--mwall)`, l && `inset ${l}px 0 0 var(--mwall)`, 'inset 0 0 0 .5px rgba(60, 40, 30, .16)'].filter(Boolean).join(',');
  }
  if (cb) boardEl.classList.add('cb');
  for (let i = 0; i < n * n; i++) {
    // every region has its own colour (there are more colours than regions)
    boardEl.appendChild(el(`<div class="mcell" data-i="${i}" style="background:${COLOURS[regions[i] % COLOURS.length]}${cb ? `;--rb:${walls(i)}` : ''}">${sym(i)}</div>`));
  }
  const cells = $$('.mcell', boardEl);
  const q = (k) => $(`[data-el="${k}"]`, root);

  function blockedCells() {
    const set = new Set();
    state.forEach((s, i) => {
      if (s !== CAT) return;
      const r = (i / n) | 0, c = i % n;
      for (let k = 0; k < n * n; k++) if (k !== i && (((k / n) | 0) === r || k % n === c || regions[k] === regions[i])) set.add(k);
      neighbours8(n, i).forEach((k) => set.add(k));
    });
    return set;
  }

  function render() {
    const bad = conflicts(n, regions, state);
    const blocked = S.meowAutoX ? blockedCells() : null;
    const src = catSrc();
    cells.forEach((c, i) => {
      const s = state[i];
      const want = s === CAT ? 'cat' : s === CROSS ? 'x' : blocked && blocked.has(i) ? 'dot' : '';
      if (c.dataset.show !== want) {
        c.dataset.show = want;
        c.innerHTML = sym(i) + (want === 'cat' ? `<img src="${src}" alt="cat">` : want === 'x' ? `<span class="x" style="color:#5a4a42">${icon.x}</span>` : want === 'dot' ? '<span class="dot"></span>' : '');
        if (want === 'x') c.querySelector('.x svg').style.cssText = 'width:100%;height:100%';
      }
      c.classList.toggle('bad', bad.has(i));
      c.classList.toggle('hint', !!hint && hint.cells.includes(i));
      c.classList.toggle('focus', !!hint && !!hint.focus && hint.focus.includes(i) && !hint.cells.includes(i));
    });
    q('got').textContent = state.filter((s) => s === CAT).length;
    renderLives();
    q('timer').textContent = S.meowTimer ? fmtTime(elapsed) : '';
  }

  function renderLives(lost = false) {
    q('lives').innerHTML = [...Array(LIVES)].map((_, k) => `<i class="${k < lives ? '' : 'lost'} ${lost && k === lives ? 'pop' : ''}">${heartSvg}</i>`).join('');
    q('lives').setAttribute('aria-label', `${lives} ${lives === 1 ? 'life' : 'lives'} left`);
  }

  function startTimer() {
    clearInterval(tick);
    if (done) return;
    tick = setInterval(() => { elapsed++; cur(); if (S.meowTimer) q('timer').textContent = fmtTime(elapsed); if (elapsed % 5 === 0) save(); }, 1000);
  }
  const stopTimer = () => { clearInterval(tick); tick = null; };
  const onVis = () => { if (document.hidden) { stopTimer(); save(true); } else if (!done && root.isConnected && root.style.display !== 'none') startTimer(); };
  document.addEventListener('visibilitychange', onVis);

  function clearHint() { hint = null; q('hint').classList.remove('show'); }

  function commit(changes) {
    if (!changes.length) return;
    history.push(changes);
    if (history.length > 400) history.shift();
    cur(); save();
    render();
    checkWin();
  }

  function checkWin() {
    const cats = state.filter((s) => s === CAT).length;
    if (cats !== n || conflicts(n, regions, state).size) return;
    done = true; stopTimer();
    const firstTime = idx >= m.level;
    const beforeUnlocked = CATS.filter((_, k) => catUnlocked(k)).length;
    m.totalTime += elapsed;
    if (!m.best[idx] || elapsed < m.best[idx]) m.best[idx] = elapsed;
    if (firstTime) m.level = idx + 1;
    m.current = null;
    save(true);
    const newCat = CATS.findIndex((_, k) => catUnlocked(k) && k >= beforeUnlocked);
    cells.forEach((c, i) => { if (state[i] === CAT) setTimeout(() => c.classList.add('win'), 80 * ((i / n) | 0)); });
    sfx.meowWin();
    setTimeout(() => {
      confetti();
      const node = el(`<div class="meow-win"><div class="box">
        <img src="${catSrc()}" alt="">
        <h2>Purr-fect!</h2>
        <p>Level ${idx + 1} solved in ${fmtTime(elapsed)}</p>
        ${newCat >= 0 ? `<div class="unlock"><img src="${catSrc(newCat)}" alt=""><div>New cat unlocked<br><span style="font-weight:400;opacity:.75">${CATS[newCat].name} joined your collection</span></div></div>` : ''}
        <div class="stack" style="display:flex;flex-direction:column;gap:10px">
          <button class="meow-btn" data-act="next">Next level</button>
          ${newCat >= 0 ? '<button class="meow-btn alt" data-act="use">Play with ' + CATS[newCat].name + '</button>' : ''}
          <button class="meow-btn alt" data-act="home">Back</button>
        </div></div></div>`);
      document.getElementById('overlay-root').appendChild(node);
      node.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
        node.remove();
        if (a === 'use') { m.cat = newCat; save(); app.replace('meowgame', { idx: idx + 1 }); }
        else if (a === 'next') app.replace('meowgame', { idx: idx + 1 });
        else app.back();
      });
    }, 900);
  }

  // ---------- Input: tap crosses out, a quick double-tap places a cat, drag paints crosses ----------
  let gesture = null, lastTap = null;
  function tryCat(i) {
    clearHint();
    const s = state[i];
    if (isSol(i)) { state[i] = CAT; sfx.cat(); buzz(12); commit([[i, s]]); return; }
    // wrong cell: the cat won't stay, the cell is crossed out, and a life is gone
    lives = Math.max(0, lives - 1);
    state[i] = CROSS;
    sfx.error(); buzz([60, 40, 60]);
    cur(); save(true);
    render(); renderLives(true);
    cells[i].classList.remove('wrong'); void cells[i].offsetWidth; cells[i].classList.add('wrong');
    if (lives <= 0) outOfLives();
    else toast(`Not there. ${lives} ${lives === 1 ? 'life' : 'lives'} left`);
  }
  function outOfLives() {
    done = true; stopTimer();
    m.current = null; save(true);
    document.getElementById('toast').classList.remove('show'); // the "lives left" note no longer applies
    setTimeout(() => {
      const node = el(`<div class="meow-win"><div class="box">
        <img src="${catSrc()}" alt="" style="animation:none">
        <h2>Out of lives</h2>
        <p>Three cats went in the wrong place. Have another go at level ${idx + 1}.</p>
        <div class="stack" style="display:flex;flex-direction:column;gap:10px">
          <button class="meow-btn" data-act="again">Try again</button>
          <button class="meow-btn alt" data-act="home">Back</button>
        </div></div></div>`);
      document.getElementById('overlay-root').appendChild(node);
      node.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
        node.remove();
        if (a === 'again') app.replace('meowgame', { idx }); else app.back();
      });
    }, 700);
  }
  const cellAt = (x, y) => { const t = document.elementFromPoint(x, y); const c = t && t.closest('.mcell'); return c && boardEl.contains(c) ? +c.dataset.i : -1; };
  boardEl.addEventListener('pointerdown', (e) => {
    if (done) return;
    const i = cellAt(e.clientX, e.clientY); if (i < 0) return;
    boardEl.setPointerCapture(e.pointerId);
    gesture = { start: i, moved: false, mode: state[i] === CROSS ? 'clear' : 'cross', changes: [], seen: new Set() };
  });
  boardEl.addEventListener('contextmenu', (e) => e.preventDefault());
  boardEl.addEventListener('dblclick', (e) => e.preventDefault());
  function paint(i) {
    if (gesture.seen.has(i)) return;
    gesture.seen.add(i);
    const s = state[i];
    if (gesture.mode === 'cross' && s === UNKNOWN) { gesture.changes.push([i, s]); state[i] = CROSS; sfx.cross(); }
    else if (gesture.mode === 'clear' && s === CROSS) { gesture.changes.push([i, s]); state[i] = UNKNOWN; sfx.cross(); }
  }
  boardEl.addEventListener('pointermove', (e) => {
    if (!gesture) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0) return;
    if (i !== gesture.start && !gesture.moved) { gesture.moved = true; lastTap = null; clearHint(); paint(gesture.start); }
    if (gesture.moved) { paint(i); render(); }
  });
  const end = () => {
    if (!gesture) return;
    const gs = gesture; gesture = null;
    if (done) return;
    if (gs.moved) { commit(gs.changes); return; }
    const i = gs.start, s = state[i], now = performance.now();
    if (s === CAT) { lastTap = null; toast('That cat is in the right place'); return; }
    // second tap in quick succession: take back the first tap's change, then try a cat
    if (lastTap && lastTap.i === i && now - lastTap.at < DOUBLE_MS) {
      const first = lastTap; lastTap = null;
      const h = history[history.length - 1];
      if (h && h.length === 1 && h[0][0] === i) history.pop();
      state[i] = first.was;
      tryCat(i);
      return;
    }
    clearHint();
    state[i] = s === UNKNOWN ? CROSS : UNKNOWN;
    if (s === UNKNOWN) sfx.cross(); else sfx.tap();
    lastTap = { i, at: now, was: s };
    commit([[i, s]]);
    // a slow second tap only clears the cross, so remind them a few times how cats go in
    // (waits a moment, so the tip doesn't show when this tap turns out to be the start of a double-tap)
    if (s === CROSS && (m.dblTips || 0) < 3) {
      const t = lastTap;
      setTimeout(() => { if (lastTap === t && !done) { m.dblTips = (m.dblTips || 0) + 1; save(); toast('To place a cat, double-tap a cell quickly', 2600); } }, DOUBLE_MS);
    }
  };
  boardEl.addEventListener('pointerup', end);
  boardEl.addEventListener('pointercancel', end);

  function showHint() {
    if (done) return;
    const h = findHint(level, state);
    hint = h;
    m.hints++; save();
    sfx.hint();
    q('hint-text').textContent = h.message;
    $('[data-act="apply"]', root).textContent = h.kind === 'mistake' ? 'Fix it' : h.kind === 'cat' ? 'Place cat' : 'Cross out';
    q('hint').classList.add('show');
    render();
  }
  function applyHint() {
    if (!hint) return;
    const changes = [];
    for (const i of hint.cells) {
      const target = hint.kind === 'mistake' ? (state[i] === CAT ? UNKNOWN : CAT) : hint.kind === 'cat' ? CAT : CROSS;
      if (state[i] !== target) { changes.push([i, state[i]]); state[i] = target; }
    }
    if (hint.kind === 'cat') sfx.cat(); else sfx.cross();
    clearHint();
    commit(changes);
  }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    switch (a) {
      case 'back': app.back(); break;
      case 'help': meowHelp(); break;
      case 'settings': app.go('settings'); break;
      case 'hint': showHint(); break;
      case 'apply': applyHint(); break;
      case 'undo': {
        if (done || !history.length) break;
        clearHint();
        const ch = history.pop();
        for (let k = ch.length - 1; k >= 0; k--) state[ch[k][0]] = ch[k][1] === CAT && !isSol(ch[k][0]) ? UNKNOWN : ch[k][1];
        sfx.tap(); cur(); save(); render();
        break;
      }
      case 'restart':
        if (done || !state.some((s) => s !== UNKNOWN)) break;
        clearHint();
        history.push(state.map((s, i) => [i, s]).filter(([, s]) => s !== UNKNOWN));
        state.fill(UNKNOWN);
        sfx.erase(); cur(); save(); render(); toast('Board cleared. Undo brings it back.');
        break;
    }
  });

  render();
  startTimer();
  if (idx === 0 && !m.current && !m.seenHelp) { m.seenHelp = true; save(); setTimeout(meowHelp, 300); }
  return {
    root,
    destroy() { stopTimer(); if (!done) cur(); save(true); document.removeEventListener('visibilitychange', onVis); },
    onHide() { stopTimer(); save(true); },
    onShow() { render(); startTimer(); },
  };
}

// ---------- Level map ----------
export function meowLevelsScreen(app) {
  const root = el(`<section class="screen meow-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">Levels</div><div class="spacer"></div></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  loadLevels().then(() => {
    const total = Math.max(levelList.length, store.meow.level + 1);
    let html = '', lastSize = 0;
    for (let i = 0; i < total; i++) {
      const sz = sizeOfLevel(i);
      if (sz !== lastSize) { if (lastSize) html += '</div>'; html += `<div class="size-head">${sz}×${sz} boards${i >= levelList.length ? ' (endless)' : ''}</div><div class="level-grid">`; lastSize = sz; }
      const doneL = i < store.meow.level, curL = i === store.meow.level;
      html += `<button class="level-dot ${doneL ? 'done' : ''} ${curL ? 'current' : ''}" data-idx="${i}" ${i > store.meow.level ? 'disabled' : ''}>${i + 1}</button>`;
    }
    body.innerHTML = html + '</div>';
    const cur = $('.level-dot.current', body);
    cur && cur.scrollIntoView({ block: 'center' });
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="back"]')) return app.back();
    const b = e.target.closest('[data-idx]');
    if (b) app.go('meowgame', { idx: +b.dataset.idx });
  });
  return { root };
}

// ---------- Cat collection ----------
export function meowCatsScreen(app) {
  const root = el(`<section class="screen meow-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">Cat collection</div><div class="spacer"></div></header>
    <div class="scroll"><p style="opacity:.7;margin:4px 4px 14px">Solve levels to adopt new cats. Tap a cat to play with it.</p><div class="cat-grid"></div></div></section>`);
  const grid = $('.cat-grid', root);
  function render() {
    grid.innerHTML = CATS.map((c, k) => {
      const un = catUnlocked(k);
      return `<button class="cat-tile ${un ? '' : 'locked'} ${store.meow.cat === k ? 'on' : ''}" data-k="${k}"><img src="img/art/cats/${c.img}" alt="">${un ? c.name : `Level ${k * UNLOCK_EVERY}`}</button>`;
    }).join('');
  }
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="back"]')) return app.back();
    const t = e.target.closest('[data-k]'); if (!t) return;
    const k = +t.dataset.k;
    if (!catUnlocked(k)) { toast(`Solve level ${k * UNLOCK_EVERY} to adopt this cat`); return; }
    store.meow.cat = k; save(); sfx.cat(); render();
  });
  render();
  return { root };
}
