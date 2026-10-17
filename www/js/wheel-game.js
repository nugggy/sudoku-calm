// Word Wheel: swipe the letters on the wheel to make words and fill the crossword.
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet, levelHome } from './kit.js';
import { loadWords } from './words.js';

const WW = () => store.wheel;
// A new backdrop every ten levels
const SCENES = [
  { name: 'Beach', img: 'palm-tree', sky: ['#7fd3ff', '#ffe7b3'] },
  { name: 'Forest', img: 'evergreen-tree', sky: ['#9be7a0', '#e9f7d8'] },
  { name: 'Snow', img: 'snowman', sky: ['#c9e4ff', '#f4f9ff'] },
  { name: 'Garden', img: 'sunflower', sky: ['#ffd1e8', '#fff3d6'] },
  { name: 'Space', img: 'ringed-planet', sky: ['#4b3c9e', '#c4a8ff'] },
  { name: 'Outback', img: 'kangaroo', sky: ['#ffb36b', '#ffe9c4'] },
  { name: 'Ocean', img: 'spouting-whale', sky: ['#5ab8ff', '#bff0ff'] },
  { name: 'Farm', img: 'tractor', sky: ['#a7e0ff', '#f2ffd9'] },
];
let levels = null;
async function loadLevels() { if (!levels) { try { levels = (await (await fetch('levels/wordwheel.json')).json()).levels; } catch { levels = []; } } return levels; }
const sceneOf = (i) => SCENES[Math.floor(i / 10) % SCENES.length];

export const wheelHelp = () => helpSheet('How to play Word Wheel', [
  'Swipe across the letters on the wheel to spell a word, then lift your finger.',
  'Words that fit the crossword drop into place. Other real words count as bonus words, and every five bonus words earns a free hint.',
  'Shuffle the wheel to see the letters differently. A hint reveals one letter in the crossword.',
], 'wheel-btn');

export function wheelHomeScreen(app) {
  return levelHome({
    app, cls: 'wheel-theme', title: 'Word Wheel', help: wheelHelp, load: loadLevels,
    hero: `<div class="wheel-hero">${'WORDS'.split('').map((ch, i) => `<i style="transform:rotate(${i * 72}deg) translate(0,-46px) rotate(${-i * 72}deg)">${ch}</i>`).join('')}</div>`,
    play: () => ({ label: `Play level ${WW().level + 1}`, sub: `${sceneOf(WW().level).name} · ${levels && levels[WW().level] ? levels[WW().level].letters.length + ' letters' : ''}` }),
    onPlay: () => app.go('wheelgame', { idx: Math.min(WW().level, levels.length - 1) }),
    levels: () => ({ count: Math.min(levels.length, Math.max(30, Math.ceil((WW().level + 15) / 5) * 5)), current: WW().level, done: (i) => i < WW().level }),
    onLevel: (i) => app.go('wheelgame', { idx: i }),
    extra: () => `<p class="word-sub">${WW().bonus} bonus words · ${WW().hints} hints</p>`,
  });
}

export function wheelGameScreen(app, { idx }) {
  const ww = WW();
  const scene = sceneOf(idx);
  const root = el(`<section class="screen wheel-theme wheel-game" style="--sky1:${scene.sky[0]};--sky2:${scene.sky[1]}">
    <img class="wheel-scene" src="img/scene/${scene.img}.png" alt="">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">Level ${idx + 1}</div><button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="ww-grid-wrap"><div class="ww-grid" data-el="grid"></div></div>
    <div class="ww-word" data-el="word"></div>
    <div class="ww-bottom">
      <button class="ww-side" data-act="bonus" aria-label="Bonus words"><img src="img/ui/star.png" alt=""><b data-el="bonus">0</b></button>
      <div class="ww-wheel" data-el="wheel"><svg class="ww-line" data-el="line"></svg></div>
      <div class="ww-side col"><button data-act="shuffle" aria-label="Shuffle">${icon.refresh}</button><button data-act="hint" aria-label="Hint">${icon.bulb}<span data-el="hints"></span></button></div>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  let L, W, found, bonusFound, letters, cellMap, done = false;
  const key = (r, c) => r * 100 + c;

  function buildGrid() {
    cellMap = new Map();
    L.words.forEach((e, wi) => { for (let k = 0; k < e.w.length; k++) { const r = e.r + (e.dir === 'down' ? k : 0), c = e.c + (e.dir === 'across' ? k : 0); const cl = cellMap.get(key(r, c)) || { r, c, ch: e.w[k], words: [] }; cl.words.push(wi); cellMap.set(key(r, c), cl); } });
    const size = Math.floor(Math.min((innerWidth - 32) / L.w, (innerHeight * 0.4) / L.h, 48));
    const g = q('grid');
    g.style.gridTemplateColumns = `repeat(${L.w}, ${size}px)`;
    g.style.setProperty('--gs', size + 'px');
    let html = '';
    for (let r = 0; r < L.h; r++) for (let c = 0; c < L.w; c++) html += cellMap.has(key(r, c)) ? `<div class="wwc" data-k="${key(r, c)}"></div>` : '<div></div>';
    g.innerHTML = html;
  }
  function paintGrid(animateWord = -1) {
    for (const [k, cl] of cellMap) {
      const n = $(`.wwc[data-k="${k}"]`, root);
      const shown = cl.words.some((wi) => found.includes(L.words[wi].w)) || ww.revealed?.[idx]?.includes(k);
      if (shown && !n.textContent) {
        const delay = animateWord >= 0 && cl.words.includes(animateWord) ? L.words[animateWord].w.indexOf(cl.ch) * 70 : 0;
        setTimeout(() => { n.textContent = cl.ch.toUpperCase(); n.classList.add('on'); }, delay);
      }
    }
    q('bonus').textContent = ww.bonus;
    q('hints').textContent = ww.hints;
  }

  function buildWheel() {
    const wheel = q('wheel');
    $$('.ww-letter', wheel).forEach((n) => n.remove());
    const n = letters.length, R = 38; // percent of wheel radius
    letters.forEach((ch, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      wheel.insertAdjacentHTML('beforeend', `<div class="ww-letter" data-i="${i}" style="left:${50 + Math.cos(a) * R}%;top:${50 + Math.sin(a) * R}%">${ch.toUpperCase()}</div>`);
    });
  }

  // ---------- Swipe over letters ----------
  let path = null;
  const wheel = q('wheel');
  const letterAt = (x, y) => { for (const n of $$('.ww-letter', wheel)) { const r = n.getBoundingClientRect(); if (Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)) < r.width * 0.62) return +n.dataset.i; } return -1; };
  function drawPath(px, py) {
    const wr = wheel.getBoundingClientRect();
    const pts = path.map((i) => { const r = $(`.ww-letter[data-i="${i}"]`, wheel).getBoundingClientRect(); return [r.left + r.width / 2 - wr.left, r.top + r.height / 2 - wr.top]; });
    if (px !== undefined) pts.push([px - wr.left, py - wr.top]);
    q('line').setAttribute('viewBox', `0 0 ${wr.width} ${wr.height}`);
    q('line').innerHTML = pts.length > 1 ? `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="rgba(255,255,255,.9)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>` : '';
    $$('.ww-letter', wheel).forEach((n) => n.classList.toggle('on', path.includes(+n.dataset.i)));
    q('word').textContent = path.map((i) => letters[i].toUpperCase()).join('');
    q('word').classList.toggle('show', path.length > 0);
  }
  wheel.addEventListener('pointerdown', (e) => {
    if (done) return;
    const i = letterAt(e.clientX, e.clientY); if (i < 0) return;
    wheel.setPointerCapture(e.pointerId);
    path = [i]; sfx.tap(); drawPath(e.clientX, e.clientY);
  });
  wheel.addEventListener('pointermove', (e) => {
    if (!path) return;
    const i = letterAt(e.clientX, e.clientY);
    if (i >= 0 && !path.includes(i)) { path.push(i); sfx.note(); buzz(5); }
    else if (i >= 0 && path.length > 1 && path[path.length - 2] === i) path.pop(); // slide back to undo a letter
    drawPath(e.clientX, e.clientY);
  });
  const end = () => {
    if (!path) return;
    const word = path.map((i) => letters[i]).join('');
    path = null;
    q('line').innerHTML = '';
    $$('.ww-letter', wheel).forEach((n) => n.classList.remove('on'));
    check(word);
  };
  wheel.addEventListener('pointerup', end);
  wheel.addEventListener('pointercancel', end);

  function flashWord(cls) { const w = q('word'); w.classList.remove('good', 'bad', 'bonus', 'dup'); void w.offsetWidth; w.classList.add(cls); setTimeout(() => w.classList.remove('show'), 650); }

  function check(word) {
    if (word.length < 3) { q('word').classList.remove('show'); return; }
    const wi = L.words.findIndex((e) => e.w === word);
    if (wi >= 0) {
      if (found.includes(word)) { flashWord('dup'); toast('Already found'); return; }
      found.push(word); sfx.unit(); buzz(20); flashWord('good');
      paintGrid(wi); persist();
      if (found.length === L.words.length) win();
      return;
    }
    if (W.valid.has(word)) {
      if (bonusFound.includes(word)) { flashWord('dup'); toast('Bonus word already found'); return; }
      bonusFound.push(word); ww.bonus++;
      if (ww.bonus % 5 === 0) { ww.hints++; toast('Five bonus words. You earned a hint!'); }
      sfx.hint(); flashWord('bonus');
      const b = $('[data-act="bonus"]', root); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
      paintGrid(); persist();
      return;
    }
    flashWord('bad'); sfx.error(); buzz(25);
    wheel.classList.remove('nope'); void wheel.offsetWidth; wheel.classList.add('nope');
  }

  function hint() {
    if (done) return;
    if (ww.hints <= 0) { toast('Find five bonus words to earn a hint'); return; }
    const hidden = [...cellMap.entries()].filter(([k, cl]) => !cl.words.some((wi) => found.includes(L.words[wi].w)) && !(ww.revealed?.[idx] || []).includes(k));
    if (!hidden.length) return;
    const [k] = hidden[(Math.random() * hidden.length) | 0];
    ww.revealed = ww.revealed || {}; (ww.revealed[idx] ||= []).push(k);
    ww.hints--;
    sfx.hint(); paintGrid(); persist();
    // a word whose letters are all revealed counts as found
    L.words.forEach((e) => { if (!found.includes(e.w) && [...e.w].every((_, kk) => ww.revealed[idx].includes(key(e.r + (e.dir === 'down' ? kk : 0), e.c + (e.dir === 'across' ? kk : 0))))) found.push(e.w); });
    if (found.length === L.words.length) win();
  }

  function persist() { ww.current = { idx, found, bonusFound }; save(); }

  async function win() {
    done = true;
    if (idx >= ww.level) ww.level = idx + 1;
    ww.current = null;
    if (ww.revealed) delete ww.revealed[idx];
    save(true);
    sfx.win(); confetti();
    $$('.wwc', root).forEach((n, i) => setTimeout(() => n.classList.add('win'), i * 30));
    await new Promise((r) => setTimeout(r, 900));
    const v = await dialog({ hero: `img/scene/${scene.img}.png`, title: 'Brilliant!', dismissible: false, text: `Level ${idx + 1} complete${bonusFound.length ? ` with ${bonusFound.length} bonus word${bonusFound.length === 1 ? '' : 's'}` : ''}.`,
      buttons: [...(idx + 1 < levels.length ? [{ label: 'Next level', value: 'next' }] : []), { label: 'Back', value: 'back', cls: 'ghost' }] });
    if (v === 'next') app.replace('wheelgame', { idx: idx + 1 }); else app.back();
  }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') wheelHelp();
    else if (a === 'shuffle') { letters.sort(() => Math.random() - 0.5); buildWheel(); sfx.cross(); wheel.classList.remove('spin'); void wheel.offsetWidth; wheel.classList.add('spin'); }
    else if (a === 'hint') hint();
    else if (a === 'bonus') toast(bonusFound.length ? `Bonus words: ${bonusFound.map((w) => w.toUpperCase()).join(', ')}` : 'Real words that are not in the crossword count as bonus words', 3500);
  });

  (async () => {
    [W] = await Promise.all([loadWords(), loadLevels()]);
    L = levels[idx];
    letters = [...L.letters];
    const cur = ww.current && ww.current.idx === idx ? ww.current : null;
    found = cur ? cur.found : [];
    bonusFound = cur ? cur.bonusFound : [];
    buildGrid(); buildWheel(); paintGrid();
    if (!ww.seenHelp) { ww.seenHelp = true; save(); setTimeout(wheelHelp, 300); }
  })();
  return { root };
}
