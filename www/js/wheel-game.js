// Word Wheel: swipe the letters on the wheel to make words and fill the crossword.
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet, levelHome } from './kit.js';
import { loadWords } from './words.js';
import { paintScene } from './jigsaw-game.js';

const WW = () => store.wheel;
// A new backdrop every ten levels. img is the scene's picture (a path under img/) and land is drawn
// across the whole screen behind the game with the jigsaw scene painter (positions are fractions of the
// screen height, sizes fractions of its width).
const fences = (y, h) => [0.07, 0.21, 0.35, 0.49, 0.63, 0.77, 0.91].map((x) => ['scenery/fence', x, y, h]);
const SCENES = [
  { name: 'Beach', img: 'art/things/beach-umbrella.svg', sky: ['#5cc4f5', '#dff4ff'], land: [
    ['seagull', 0.84, 0.6, 0.05], ['seagull', 0.74, 0.63, 0.04], ['band', '#46b3ec', 0.7, 0.002, 3, 0], ['sailboat', 0.8, 0.745, 0.1], ['band', '#f7e2a8', 0.79, 0.006, 1.5, 2],
    ['scenery/treePalm', 0.07, 0.95, 0.44], ['scenery/treePalm', 0.95, 0.92, 0.32, 1], ['crab', 0.28, 0.995, 0.09], ['shell', 0.52, 0.99, 0.06], ['starfish', 0.74, 0.995, 0.08]] },
  { name: 'Forest', img: 'kenney/animals/owl.png', sky: ['#8fd8f5', '#e8f8ff'], land: [
    ['layer', 'backgrounds/mountains', 0.62, 0.3, '#c4e6da'], ['layer', 'backgrounds/hillsLarge', 0.68, 0.3, '#7fd6a6'], ['band', '#3fb87a', 0.78, 0.006, 1, 0],
    ['scenery/treePine', 0.24, 0.84, 0.3], ['scenery/treeLong', 0.78, 0.84, 0.3], ['scenery/treePine', 0.07, 0.93, 0.48], ['scenery/tree', 0.93, 0.92, 0.44],
    ['band', '#2ea566', 0.94, 0.004, 2, 1], ['fox', 0.22, 0.995, 0.18], ['mushroom', 0.8, 0.995, 0.08], ['hedgehog', 0.6, 0.995, 0.1]] },
  { name: 'Snow', img: 'art/things/snowman.svg', sky: ['#7fbdf0', '#e6f3ff'], land: [
    ['snowflake', 0.08, 0.22, 0.06], ['snowflake', 0.93, 0.3, 0.05], ['snowflake', 0.1, 0.5, 0.04], ['snowflake', 0.9, 0.56, 0.05],
    ['layer', 'backgrounds/mountains', 0.6, 0.3, '#eef6fc'], ['layer', 'backgrounds/hillsLarge', 0.68, 0.3, '#d6e8f6'], ['band', '#f4f9fd', 0.78, 0.006, 1.5, 0],
    ['scenery/treePineSnow', 0.08, 0.93, 0.44], ['scenery/treeSnow', 0.92, 0.9, 0.36], ['igloo', 0.76, 0.97, 0.16], ['snowman', 0.26, 0.98, 0.24], ['animals/penguin', 0.52, 0.995, 0.1]] },
  { name: 'Garden', img: 'art/things/sunflower.svg', sky: ['#ffd1e8', '#fff3d6'], land: [
    ['butterfly', 0.88, 0.56, 0.08], ['bee', 0.12, 0.6, 0.06], ['layer', 'backgrounds/hillsLarge', 0.64, 0.3, '#bde8a0'], ['layer', 'backgrounds/hills', 0.7, 0.26, '#9ad97a'],
    ['band', '#7ccf5c', 0.78, 0.006, 1, 0], ...fences(0.86, 0.1), ['sunflower', 0.08, 0.995, 0.34], ['tulip', 0.24, 0.995, 0.16], ['daisy', 0.5, 0.995, 0.14],
    ['daisy', 0.76, 0.995, 0.14], ['flower-pink', 0.92, 0.995, 0.22]] },
  { name: 'Space', img: 'art/things/planet.svg', sky: ['#1c1452', '#5a40b0'], ink: '#fff', land: [
    ['stars', 90, 5], ['scenery/moonFull', 0.1, 0.24, 0.1], ['planet', 0.88, 0.6, 0.2], ['comet', 0.86, 0.34, 0.12], ['band', '#a9b8c2', 0.84, 0.01, 1.5, 0],
    ['crater', 0.2, 0.92, 0.04], ['crater', 0.6, 0.97, 0.05], ['crater', 0.86, 0.9, 0.03], ['rocket', 0.11, 0.66, 0.2], ['ufo', 0.9, 0.8, 0.14]] },
  { name: 'Outback', img: 'art/things/kangaroo.svg', sky: ['#ffb36b', '#ffe9c4'], land: [
    ['layer', 'backgrounds/mountains', 0.64, 0.2, '#f0b080'], ['uluru', 0.68, 0.79, 0.12], ['band', '#d9733f', 0.78, 0.006, 1, 0], ['scenery/bushOrange1', 0.42, 0.8, 0.05],
    ['scenery/treeLong', 0.08, 0.88, 0.34], ['band', '#c9622f', 0.92, 0.004, 2, 1], ['kangaroo', 0.88, 0.995, 0.26, 1], ['scenery/bushOrange2', 0.22, 0.995, 0.08], ['koala', 0.58, 0.995, 0.12]] },
  { name: 'Ocean', img: 'art/things/fish.svg', sky: ['#6fd8f7', '#2f86d4'], land: [
    ['rays'], ['bubbles', 0.08, 0.46, 0.14], ['bubbles', 0.92, 0.36, 0.12], ['fish', 0.88, 0.66, 0.1, 1], ['fish-blue', 0.12, 0.72, 0.08], ['band', '#f3d9a4', 0.88, 0.006, 1.5, 1],
    ['seaweed', 0.05, 0.995, 0.26], ['seaweed', 0.95, 0.995, 0.22], ['seaweed', 0.32, 0.995, 0.14], ['coral', 0.78, 0.995, 0.16], ['starfish', 0.58, 0.995, 0.07], ['shell', 0.2, 0.995, 0.06]] },
  { name: 'Farm', img: 'art/things/tractor.svg', sky: ['#a7e0ff', '#f2ffd9'], land: [
    ['layer', 'backgrounds/hillsLarge', 0.62, 0.3, '#b5e48f'], ['layer', 'backgrounds/hills', 0.68, 0.26, '#8fd16a'], ['band', '#79c656', 0.77, 0.006, 1, 0],
    ['barn', 0.13, 0.8, 0.22], ['scenery/tree', 0.9, 0.79, 0.24], ['animals/pig', 0.1, 0.905, 0.1], ['animals/cow', 0.88, 0.905, 0.12], ...fences(0.92, 0.1),
    ['band', '#68b947', 0.94, 0.004, 2, 0], ['animals/chick', 0.3, 0.995, 0.06], ['haybale', 0.66, 0.995, 0.08]] },
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
    <canvas class="ww-land" data-el="land" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"></canvas>
    <header class="topbar" style="position:relative;z-index:1${scene.ink ? `;color:${scene.ink};--muted:${scene.ink}` : ''}"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">Level ${idx + 1}</div><button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="ww-grid-wrap"><div class="ww-grid" data-el="grid"></div></div>
    <div class="ww-word" data-el="word"></div>
    <div class="ww-bottom">
      <button class="ww-side" data-act="bonus" aria-label="Bonus words"><img src="img/art/ui/star.svg" alt=""><b data-el="bonus">0</b></button>
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

  // the landscape behind the game, painted once at the screen's size
  async function paintLand() {
    const w = root.clientWidth || innerWidth, h = root.clientHeight || innerHeight, dpr = window.devicePixelRatio || 1;
    const pic = await paintScene({ draw: scene.land }, Math.round(w * dpr), Math.round(h * dpr));
    const cv = q('land'); cv.width = pic.width; cv.height = pic.height; cv.getContext('2d').drawImage(pic, 0, 0);
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
    const v = await dialog({ hero: `img/${scene.img}`, title: 'Brilliant!', dismissible: false, text: `Level ${idx + 1} complete${bonusFound.length ? ` with ${bonusFound.length} bonus word${bonusFound.length === 1 ? '' : 's'}` : ''}.`,
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
    buildGrid(); buildWheel(); paintGrid(); paintLand();
    if (!ww.seenHelp) { ww.seenHelp = true; save(); setTimeout(wheelHelp, 300); }
  })();
  return { root };
}
