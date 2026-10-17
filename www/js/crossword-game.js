// Crosswords: mini to medium freeform crosswords with an on-screen keyboard.
import { store, save, fmtTime } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, sheet, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';

let puzzles = null;
async function loadPuzzles() {
  if (puzzles) return puzzles;
  try { puzzles = (await (await fetch('levels/crosswords.json')).json()).puzzles; } catch { puzzles = []; }
  return puzzles;
}
const X = () => store.cross;
const sizeLabel = (p) => (p.entries.length <= 8 ? 'Mini' : p.entries.length <= 12 ? 'Midi' : 'Maxi');

export function crossHelp() {
  sheet(`<h2>How to play Crosswords</h2><div class="help-body">
    <p>Tap a square, then type with the keyboard. Tap the same square again, or the clue bar, to switch between across and down.</p>
    <p>Use the arrows on the clue bar to move between clues, or open the clue list.</p>
    <p>Stuck? <b>Letter</b> reveals the selected square, <b>Check</b> marks wrong letters in red, and <b>Reveal</b> fills in the whole word.</p>
  </div><button class="btn cross-btn" data-x>Got it</button>`, { onMount: (n, close) => { $('[data-x]', n).onclick = close; } });
}

// ---------- Home ----------
export function crossHomeScreen(app) {
  const root = el(`<section class="screen cross-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title"></div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  async function render() {
    const P = await loadPuzzles(), x = X();
    const next = Math.min(x.level, P.length - 1);
    const solved = Object.keys(x.done).length;
    body.innerHTML = `
      <div class="word-hero"><img src="img/themes/newspaper.png" alt=""><img class="tilt" src="img/themes/pencil.png" alt=""></div>
      <h1 class="word-title">Crosswords</h1>
      <button class="btn cross-btn" data-act="play">${x.current && x.current.idx === next ? 'Continue' : 'Play'} puzzle ${next + 1}<small>${sizeLabel(P[next])} · ${P[next].entries.length} clues</small></button>
      <p class="word-sub">${solved} of ${P.length} solved</p>
      <div class="cross-list">${P.map((p, i) => `<button class="cross-item ${x.done[i] ? 'done' : ''} ${i === next ? 'current' : ''}" data-idx="${i}" ${i > x.level && !x.done[i] ? 'disabled' : ''}><b>${x.done[i] ? '✓' : i + 1}</b><span>${sizeLabel(p)}</span></button>`).join('')}</div>`;
    setTimeout(() => $('.cross-item.current', body)?.scrollIntoView({ block: 'center' }), 0);
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return crossHelp();
    if (a === 'play') return app.go('crossgame', { idx: Math.min(X().level, (puzzles || [1]).length - 1) });
    const b = e.target.closest('[data-idx]');
    if (b) app.go('crossgame', { idx: +b.dataset.idx });
  });
  render();
  return { root, refresh: render };
}

// ---------- Game ----------
export function crossGameScreen(app, { idx }) {
  const x = X();
  const root = el(`<section class="screen cross-theme cross-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">Crossword ${idx + 1}</div><span class="cross-time" data-el="time">00:00</span>
      <button class="icon-btn" data-act="list" aria-label="All clues">${icon.grid}</button></header>
    <div class="cross-board-wrap"><div class="cross-board" data-el="board"></div></div>
    <div class="cross-clue">
      <button data-act="prev" aria-label="Previous clue">${icon.chevL}</button>
      <div class="cross-clue-text" data-act="flip"><b data-el="clue-num"></b><span data-el="clue"></span></div>
      <button data-act="next" aria-label="Next clue">${icon.chevR}</button>
    </div>
    <div class="cross-tools">
      <button data-act="letter">${icon.bulb}Letter</button>
      <button data-act="check">${icon.info}Check</button>
      <button data-act="reveal">${icon.restart}Reveal</button>
    </div>
    <div class="cross-keys" data-el="keys">${['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map((row, ri) => `<div class="krow">${[...row].map((k) => `<button data-key="${k}">${k}</button>`).join('')}${ri === 2 ? `<button class="wide" data-key="DEL" aria-label="Delete">⌫</button>` : ''}</div>`).join('')}</div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  let P, W, H, cells, letters, sel = null, dir = 'across', elapsed = 0, done = false, tick = null;
  const key = (r, c) => r * 100 + c;

  function build() {
    W = P.w; H = P.h;
    cells = new Map(); // key -> {r, c, ch, num, across: entryIdx, down: entryIdx}
    P.entries.forEach((e, ei) => {
      for (let k = 0; k < e.word.length; k++) {
        const r = e.r + (e.dir === 'down' ? k : 0), c = e.c + (e.dir === 'across' ? k : 0);
        const cl = cells.get(key(r, c)) || { r, c, ch: e.word[k] };
        cl[e.dir] = ei;
        if (k === 0) cl.num = e.num;
        cells.set(key(r, c), cl);
      }
    });
    const board = q('board');
    const size = Math.floor(Math.min((innerWidth - 24) / W, (innerHeight - 440) / H, 52));
    board.style.setProperty('--cs', size + 'px');
    board.style.gridTemplateColumns = `repeat(${W}, var(--cs))`;
    let html = '';
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const cl = cells.get(key(r, c));
      html += cl ? `<div class="ccell" data-k="${key(r, c)}">${cl.num ? `<i>${cl.num}</i>` : ''}<span></span></div>` : '<div class="cgap"></div>';
    }
    board.innerHTML = html;
  }

  const entryAt = (cl, d) => (cl ? cl[d] : undefined);
  const entryCells = (ei) => { const e = P.entries[ei]; return [...Array(e.word.length)].map((_, k) => key(e.r + (e.dir === 'down' ? k : 0), e.c + (e.dir === 'across' ? k : 0))); };
  const currentEntry = () => entryAt(cells.get(sel), dir);
  const entryDone = (ei) => entryCells(ei).every((k) => letters[k] === cells.get(k).ch);

  function render() {
    const ei = currentEntry();
    const inWord = new Set(ei !== undefined ? entryCells(ei) : []);
    $$('.ccell', root).forEach((n) => {
      const k = +n.dataset.k;
      n.lastElementChild.textContent = letters[k] || '';
      n.classList.toggle('sel', k === sel);
      n.classList.toggle('word', inWord.has(k) && k !== sel);
    });
    if (ei !== undefined) {
      const e = P.entries[ei];
      q('clue-num').textContent = `${e.num} ${e.dir === 'across' ? 'Across' : 'Down'}`;
      q('clue').textContent = e.clue;
    }
    q('time').textContent = fmtTime(elapsed);
  }

  function select(k, toggle = true) {
    const cl = cells.get(k);
    if (!cl) return;
    if (k === sel && toggle && cl.across !== undefined && cl.down !== undefined) dir = dir === 'across' ? 'down' : 'across';
    else if (cl[dir] === undefined) dir = dir === 'across' ? 'down' : 'across';
    sel = k;
    sfx.tap();
    render();
  }

  function gotoEntry(ei, firstEmpty = true) {
    const ks = entryCells(ei);
    dir = P.entries[ei].dir;
    sel = (firstEmpty && ks.find((k) => !letters[k])) || ks[0];
    render();
  }
  function stepEntry(delta) {
    const order = P.entries.map((_, i) => i);
    const cur = currentEntry() ?? 0;
    let i = order.indexOf(cur);
    for (let n = 0; n < order.length; n++) {
      i = (i + delta + order.length) % order.length;
      if (!entryDone(order[i]) || n === order.length - 1) { gotoEntry(order[i]); return; }
    }
  }

  function persist() { x.current = { idx, letters, elapsed }; save(); }

  function type(ch) {
    if (done || sel === null) return;
    const ei = currentEntry();
    const ks = entryCells(ei);
    if (ch === 'DEL') {
      if (letters[sel]) delete letters[sel];
      else { const i = ks.indexOf(sel); if (i > 0) { sel = ks[i - 1]; delete letters[sel]; } }
      $$('.ccell.bad', root).forEach((n) => n.classList.remove('bad'));
      sfx.erase(); render(); persist();
      return;
    }
    letters[sel] = ch;
    sfx.note();
    const cellEl = $(`.ccell[data-k="${sel}"]`, root); cellEl.classList.remove('bad', 'typed'); void cellEl.offsetWidth; cellEl.classList.add('typed');
    // finished words flash
    for (const d of ['across', 'down']) {
      const e = entryAt(cells.get(sel), d);
      if (e !== undefined && entryDone(e)) entryCells(e).forEach((k, i) => setTimeout(() => { const n = $(`.ccell[data-k="${k}"]`, root); n.classList.remove('ok'); void n.offsetWidth; n.classList.add('ok'); }, i * 40));
    }
    const i = ks.indexOf(sel);
    const nextEmpty = ks.slice(i + 1).find((k) => !letters[k]);
    if (nextEmpty !== undefined) sel = nextEmpty;
    else if (ks.every((k) => letters[k])) { render(); persist(); if (!checkWin()) stepEntry(1); return; }
    else if (i < ks.length - 1) sel = ks[i + 1];
    render(); persist();
    checkWin();
  }

  function checkWin() {
    if (![...cells.keys()].every((k) => letters[k] === cells.get(k).ch)) {
      if ([...cells.keys()].every((k) => letters[k])) toast('Every square is filled, but something is not quite right');
      return false;
    }
    done = true; stopTimer();
    x.done[idx] = { time: elapsed };
    x.level = Math.max(x.level, idx + 1);
    x.current = null;
    save(true);
    sfx.win();
    $$('.ccell', root).forEach((n, i) => setTimeout(() => n.classList.add('win'), i * 18));
    setTimeout(async () => {
      confetti();
      const v = await dialog({ hero: 'img/themes/newspaper.png', title: 'Crossword solved!', dismissible: false,
        text: `Puzzle ${idx + 1} in ${fmtTime(elapsed)}`,
        buttons: [...(idx + 1 < P.length ? [{ label: 'Next crossword', value: 'next' }] : []), { label: 'Back', value: 'back', cls: 'ghost' }] });
      if (v === 'next') app.replace('crossgame', { idx: idx + 1 }); else app.back();
    }, 900);
    return true;
  }

  function clueList() {
    const list = (d) => P.entries.map((e, i) => ({ e, i })).filter(({ e }) => e.dir === d)
      .map(({ e, i }) => `<button class="clue-row ${entryDone(i) ? 'done' : ''}" data-ei="${i}"><b>${e.num}</b>${e.clue}</button>`).join('');
    sheet(`<h2>Clues</h2><div class="clue-cols"><div><h3>Across</h3>${list('across')}</div><div><h3>Down</h3>${list('down')}</div></div>`, {
      onMount(node, close) { node.addEventListener('click', (e) => { const b = e.target.closest('[data-ei]'); if (b) { close(); gotoEntry(+b.dataset.ei); } }); },
    });
  }

  function startTimer() { stopTimer(); if (!done) tick = setInterval(() => { elapsed++; q('time').textContent = fmtTime(elapsed); if (elapsed % 5 === 0) persist(); }, 1000); }
  function stopTimer() { clearInterval(tick); tick = null; }
  const onVis = () => { if (document.hidden) { stopTimer(); persist(); } else if (!done && root.style.display !== 'none') startTimer(); };
  document.addEventListener('visibilitychange', onVis);
  const onKey = (e) => { if (/^[a-z]$/i.test(e.key)) type(e.key.toUpperCase()); else if (e.key === 'Backspace') type('DEL'); };
  document.addEventListener('keydown', onKey);

  root.addEventListener('click', async (e) => {
    const c = e.target.closest('.ccell');
    if (c) return select(+c.dataset.k);
    const k = e.target.closest('[data-key]');
    if (k) { type(k.dataset.key); buzz(5); return; }
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'list') clueList();
    else if (a === 'prev') stepEntry(-1);
    else if (a === 'next') stepEntry(1);
    else if (a === 'flip' && sel !== null) { const cl = cells.get(sel); if (cl.across !== undefined && cl.down !== undefined) { dir = dir === 'across' ? 'down' : 'across'; render(); } }
    else if (a === 'letter' && sel !== null && !done) { letters[sel] = cells.get(sel).ch; sfx.hint(); const n = $(`.ccell[data-k="${sel}"]`, root); n.classList.add('revealed'); type(cells.get(sel).ch); }
    else if (a === 'check' && !done) {
      let wrong = 0;
      $$('.ccell', root).forEach((n) => { const kk = +n.dataset.k; const bad = letters[kk] && letters[kk] !== cells.get(kk).ch; n.classList.toggle('bad', !!bad); if (bad) wrong++; });
      if (wrong) { sfx.error(); toast(`${wrong} letter${wrong === 1 ? '' : 's'} to fix`); } else toast('Everything so far is right');
    } else if (a === 'reveal' && sel !== null && !done) {
      const ok = await dialog({ title: 'Reveal this word?', buttons: [{ label: 'Reveal', value: true }, { label: 'Cancel', value: false, cls: 'ghost' }] });
      if (!ok) return;
      entryCells(currentEntry()).forEach((kk) => { letters[kk] = cells.get(kk).ch; $(`.ccell[data-k="${kk}"]`, root).classList.add('revealed'); });
      sfx.hint(); render(); persist(); if (!checkWin()) stepEntry(1);
    }
  });

  (async () => {
    const all = await loadPuzzles();
    P = all[idx];
    const cur = x.current && x.current.idx === idx ? x.current : null;
    letters = cur ? cur.letters : {};
    elapsed = cur ? cur.elapsed : 0;
    build();
    gotoEntry(0);
    startTimer();
    if (!x.seenHelp) { x.seenHelp = true; save(); setTimeout(crossHelp, 300); }
  })();

  return {
    root,
    destroy() { stopTimer(); if (!done && letters) persist(); save(true); document.removeEventListener('visibilitychange', onVis); document.removeEventListener('keydown', onKey); },
    onHide() { stopTimer(); },
    onShow() { if (!done) startTimer(); },
  };
}
