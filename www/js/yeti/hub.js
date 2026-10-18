// Yeti Games: the hub (all 11 games with best scores, plus the Grand Tour) and the screen that runs a game.
//
// A game module exports default { id, name, blurb, unit, how: [paragraphs], theme: [css colours], thumb?(g, w, h),
//   create(ctx) -> { update(dt), draw(g), down?(x, y), up?(x, y), move?(x, y), destroy?() } }.
// ctx gives: W, H (canvas size in CSS px), t (seconds since start), best (previous best score),
//   hud({ left, center, right }) top chips, prompt(text) a big hint in the middle ('' hides it),
//   finish(score, line) ends the game and shows the result card. Higher scores are always better.
import { store, save } from '../store.js';
import { icon } from '../icons.js';
import { el, $, $$, sheet, esc, confetti } from '../ui.js';
import { sfx } from '../sound.js';
import { loadSprites, sprite, SPR, snd, buzz, fmt, fmt1 } from './kit.js';
import bat from './g-bat.js';
import orca from './g-orca.js';
import seal from './g-seal.js';
import albatross from './g-albatross.js';
import flamingo from './g-flamingo.js';
import wave from './g-wave.js';
import stage from './g-stage.js';
import freeride from './g-freeride.js';
import jungle from './g-jungle.js';
import spit from './g-spit.js';
import icicle from './g-icicle.js';

export const YETI_GAMES = [bat, orca, seal, albatross, flamingo, wave, stage, freeride, jungle, spit, icicle];
const Y = () => store.yeti;
const byId = (id) => YETI_GAMES.find((g) => g.id === id);
// Grand Tour: each game's score becomes tour points, about 1,000 for a strong result, so metres and trick
// points count equally. PAR is that strong result for each game.
const PAR = { bat: 100, orca: 300, seal: 80, albatross: 300, flamingo: 400, wave: 5000, stage: 150, freeride: 9000, jungle: 150, spit: 1500, icicle: 16 };
const tourPoints = (id, score) => Math.round((1000 * score) / (PAR[id] || 100));
// metres keep one decimal place, points are whole numbers
const scoreText = (game, v) => (game.unit === 'm' ? fmt1(v, 'm') : fmt(v, 'pts'));
const tidy = (game, v) => Math.max(0, game.unit === 'm' ? Math.round(v * 10) / 10 : Math.round(v));

export function yetiHelp(game) {
  const paras = game ? game.how : [
    'Eleven quick sports for a yeti and a very brave penguin. Each game takes a minute or two and keeps your best score.',
    'Tap a game to play it, or take the Grand Tour to play all eleven in a row for one big total. Each game turns its score into tour points (about 1,000 for a great result), so every game counts the same.',
  ];
  return new Promise((done) => sheet(`<h2>${esc(game ? game.name : 'Yeti Games')}</h2><div class="help-body">${paras.map((p) => `<p>${p}</p>`).join('')}</div><button class="btn yeti-btn" data-x>Let's go</button>`,
    { onMount: (n, close) => { $('[data-x]', n).onclick = close; }, onClose: done }));
}

// Card art: a little painted scene from the game's theme colours plus its own drawing (or a yeti and a penguin).
function paintThumb(game, canvas) {
  const w = canvas.clientWidth || 120, h = canvas.clientHeight || 80, dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = w * dpr; canvas.height = h * dpr;
  const g = canvas.getContext('2d'); g.scale(dpr, dpr);
  const [a, b, c] = game.theme || ['#bfe3ff', '#e8f6ff', '#ffffff'];
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, a); gr.addColorStop(0.7, b); gr.addColorStop(1, c);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  if (game.thumb) game.thumb(g, w, h);
  else { sprite(g, 'yeti_idle', 0, w * 0.38, h * 0.95, h * 0.33); sprite(g, 'penguin', 0, w * 0.72, h * 0.95, h * 0.33); }
}
export function yetiCardArt() {
  return '<div class="art-yeti"><img src="img/yeti/yeti_front.webp" alt=""><img class="pg" src="img/yeti/penguin_front.webp" alt=""></div>';
}

// ---------- Hub ----------
export function yetiHubScreen(app) {
  const root = el(`<section class="screen yeti-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">Yeti Games</div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  function render() {
    const y = Y();
    body.innerHTML = `
      <div class="yeti-hero"><img src="img/yeti/yeti_front.webp" alt=""><img class="pg" src="img/yeti/penguin_front.webp" alt=""></div>
      <button class="btn yeti-btn yeti-tour" data-act="tour">Grand Tour<small>All 11 games in a row${y.tourBest ? ` · best ${fmt(y.tourBest)} points` : ''}</small></button>
      <div class="yeti-list">${YETI_GAMES.map((gm, i) => `
        <button class="yeti-card" data-g="${gm.id}">
          <canvas class="yeti-thumb" data-thumb="${gm.id}"></canvas>
          <div class="yeti-info"><b>${i + 1}. ${esc(gm.name)}</b><span>${esc(gm.blurb)}</span>
          <em>${y.best[gm.id] ? `Best ${scoreText(gm, y.best[gm.id])}` : 'Not played yet'}</em></div>
        </button>`).join('')}</div>
      <p class="yeti-credit">Characters and animals are low-poly models by Quaternius, Poly by Google and others, used under CC0 and CC-BY. See About for credits.</p>`;
    loadSprites().then(() => $$('[data-thumb]', body).forEach((c) => paintThumb(byId(c.dataset.thumb), c)));
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return yetiHelp();
    if (a === 'tour') return app.go('yetigame', { id: YETI_GAMES[0].id, tour: { i: 0, total: 0, scores: [] } });
    const c = e.target.closest('[data-g]');
    if (c) app.go('yetigame', { id: c.dataset.g });
  });
  render();
  return { root, refresh: render };
}

// ---------- A game ----------
export function yetiGameScreen(app, { id, tour = null }) {
  const game = byId(id);
  const y = Y();
  const root = el(`<section class="screen yeti-theme yeti-play">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">${tour ? `<small>Grand Tour ${tour.i + 1}/11</small>` : ''}${esc(game.name)}</div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="yeti-stage" data-el="stage">
      <canvas data-el="cv"></canvas>
      <div class="yeti-hud"><span data-el="l"></span><span data-el="c"></span><span data-el="r"></span></div>
      <div class="yeti-prompt" data-el="prompt"></div>
      <div class="yeti-loading" data-el="loading">Warming up…</div>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const cv = q('cv'), stage = q('stage'), g = cv.getContext('2d');
  let inst = null, raf = 0, last = 0, alive = true, paused = false, over = false;
  const ctx = {
    W: 0, H: 0, t: 0, best: y.best[id] || 0, game,
    hud({ left = '', center = '', right = '' } = {}) { q('l').textContent = left; q('c').textContent = center; q('r').textContent = right; q('l').hidden = !left; q('c').hidden = !center; q('r').hidden = !right; },
    prompt(text) { const p = q('prompt'); if (text) { p.textContent = text; p.classList.add('show'); } else p.classList.remove('show'); },
    finish(score, line = '') { if (!over) { over = true; setTimeout(() => results(tidy(game, score), line), 900); } },
  };

  function resize() {
    const r = stage.getBoundingClientRect(), dpr = Math.min(2.5, window.devicePixelRatio || 1);
    ctx.W = r.width; ctx.H = r.height;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000)); last = now;
    if (!inst || paused) return;
    ctx.t += dt;
    // two half steps keep fast physics smooth on slower phones
    inst.update(dt / 2); inst.update(dt / 2);
    g.save(); inst.draw(g); g.restore();
  }
  function start() {
    over = false; ctx.t = 0; ctx.best = y.best[id] || 0;
    ctx.hud({}); ctx.prompt('');
    if (inst?.destroy) inst.destroy();
    inst = game.create(ctx);
  }

  // Touch input in canvas pixels. Multi-touch is treated as one finger.
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  let downId = null;
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!inst || paused || over) return; downId = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch { /* fine */ } inst.down?.(...pos(e)); });
  cv.addEventListener('pointermove', (e) => { if (!inst || paused || downId === null) return; inst.move?.(...pos(e)); });
  const up = (e) => { if (downId === null) return; downId = null; if (inst && !paused) inst.up?.(...pos(e)); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  function results(score, line) {
    if (!alive) return;
    const prev = y.best[id] || 0, isBest = score > prev;
    if (isBest) y.best[id] = score;
    y.played[id] = (y.played[id] || 0) + 1;
    let tourNext = null, tourDone = false;
    if (tour) {
      tour.total += tourPoints(id, score); tour.scores.push(score);
      if (tour.i + 1 < YETI_GAMES.length) tourNext = { i: tour.i + 1, total: tour.total, scores: tour.scores };
      else { tourDone = true; if (tour.total > (y.tourBest || 0)) y.tourBest = tour.total; }
    }
    save(true);
    if (isBest && score > 0) { snd.cheer(); confetti(); buzz([30, 50, 30]); } else sfx.tap();
    const node = el(`<div class="yeti-result"><div class="box">
      ${isBest && score > 0 ? '<div class="badge">New best!</div>' : ''}
      <img src="img/yeti/${isBest ? 'yeti_front' : 'penguin_front'}.webp" alt="">
      <div class="big">${esc(scoreText(game, score))}</div>
      ${line ? `<p>${esc(line)}</p>` : ''}
      <p class="sub">${isBest || !prev ? (prev ? `Previous best ${esc(scoreText(game, prev))}` : 'First score on the board') : `Best ${esc(scoreText(game, prev))}`}</p>
      ${tour ? `<div class="tour">+${fmt(tourPoints(id, score))} tour points<br>Grand Tour total <b>${fmt(tour.total)}</b> points${tourDone ? (tour.total >= (y.tourBest || 0) ? ' · new tour best' : ` · best ${fmt(y.tourBest)}`) : ` · game ${tour.i + 1} of 11`}</div>` : ''}
      <div class="stack">
        ${tourNext ? `<button class="btn yeti-btn" data-r="next">Next: ${esc(YETI_GAMES[tourNext.i].name)}</button>` : `<button class="btn yeti-btn" data-r="again">${tourDone ? 'Play the tour again' : 'Play again'}</button>`}
        <button class="btn ghost" data-r="back">${tour && !tourDone ? 'Stop the tour' : 'Back'}</button>
      </div></div></div>`);
    root.appendChild(node);
    node.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]')?.dataset.r; if (!r) return;
      node.remove();
      if (r === 'next') app.replace('yetigame', { id: YETI_GAMES[tourNext.i].id, tour: tourNext });
      else if (r === 'again') { if (tourDone) app.replace('yetigame', { id: YETI_GAMES[0].id, tour: { i: 0, total: 0, scores: [] } }); else start(); }
      else app.back();
    });
  }

  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') { paused = true; await yetiHelp(game); paused = false; last = performance.now(); }
  });
  const onVis = () => { if (document.hidden) paused = true; else { paused = false; last = performance.now(); } };
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(() => resize());

  (async () => {
    await loadSprites();
    if (!alive) return;
    q('loading').remove();
    resize(); ro.observe(stage);
    const first = !y.seen[id];
    if (first) { y.seen[id] = true; save(); paused = true; start(); await yetiHelp(game); paused = false; }
    else start();
    last = performance.now();
    raf = requestAnimationFrame(frame);
  })();
  return {
    root,
    destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); inst?.destroy?.(); },
    onHide() { paused = true; },
    onShow() { paused = false; last = performance.now(); },
  };
}
export { SPR };
