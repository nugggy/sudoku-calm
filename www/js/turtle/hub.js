// Turtle Bay: the hub (eight games with best scores) and the screen that runs a game.
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
import { loadTurtle, pic, snd, buzz, fmt } from './kit.js';
import hatch from './g-hatch.js';
import reef from './g-reef.js';
import jelly from './g-jelly.js';
import stack from './g-stack.js';
import hop from './g-hop.js';
import match from './g-match.js';
import trek from './g-trek.js';
import race from './g-race.js';

export const TURTLE_GAMES = [hatch, reef, jelly, stack, hop, match, trek, race];
const T = () => store.turtle;
const byId = (id) => TURTLE_GAMES.find((g) => g.id === id);
const scoreText = (game, v) => fmt(v, v === 1 && game.unit1 ? game.unit1 : game.unit);

export function turtleHelp(game) {
  const paras = game ? game.how : [
    'Eight quick games starring sea turtles, tortoises and their friends. Each one keeps your best score.',
    'Tap a game to play. Most need only one thumb, and a round takes a minute or two.',
  ];
  return new Promise((done) => sheet(`<h2>${esc(game ? game.name : 'Turtle Bay')}</h2><div class="help-body">${paras.map((p) => `<p>${p}</p>`).join('')}</div><button class="btn turtle-btn" data-x>Let's go</button>`,
    { onMount: (n, close) => { $('[data-x]', n).onclick = close; }, onClose: done }));
}

function paintThumb(game, canvas) {
  const w = canvas.clientWidth || 112, h = canvas.clientHeight || 76, dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = w * dpr; canvas.height = h * dpr;
  const g = canvas.getContext('2d'); g.scale(dpr, dpr);
  const [a, b, c] = game.theme || ['#7fd3e6', '#c8f0f2', '#f4e3b5'];
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, a); gr.addColorStop(0.65, b); gr.addColorStop(1, c);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  if (game.thumb) game.thumb(g, w, h); else pic(g, 't_sea', w / 2, h / 2, w * 0.6);
}

const hero = (cls) => `<div class="${cls}"><img src="img/turtle/t_front.webp" alt=""><img class="tt" src="img/turtle/t_tort_front.webp" alt=""></div>`;
export const turtleCardArt = () => hero('art-turtle');

// ---------- Hub ----------
export function turtleHubScreen(app) {
  const root = el(`<section class="screen turtle-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">Turtle Bay</div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  function render() {
    const tb = T();
    body.innerHTML = `${hero('turtle-hero')}
      <div class="turtle-list">${TURTLE_GAMES.map((gm, i) => `
        <button class="turtle-card" data-g="${gm.id}">
          <canvas class="turtle-thumb" data-thumb="${gm.id}"></canvas>
          <div class="turtle-info"><b>${i + 1}. ${esc(gm.name)}</b><span>${esc(gm.blurb)}</span>
          <em>${tb.best[gm.id] ? `Best ${esc(scoreText(gm, tb.best[gm.id]))}` : 'Not played yet'}</em></div>
        </button>`).join('')}</div>
      <p class="turtle-credit">Turtles and their friends are low-poly models from poly.pizza and Kenney, used under CC0 and CC-BY. See About for credits.</p>`;
    loadTurtle().then(() => $$('[data-thumb]', body).forEach((c) => paintThumb(byId(c.dataset.thumb), c)));
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return turtleHelp();
    const c = e.target.closest('[data-g]');
    if (c) app.go('turtlegame', { id: c.dataset.g });
  });
  render();
  return { root, refresh: render };
}

// ---------- A game ----------
export function turtleGameScreen(app, { id }) {
  const game = byId(id);
  const tb = T();
  const root = el(`<section class="screen turtle-theme turtle-play">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">${esc(game.name)}</div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="turtle-stage" data-el="stage">
      <canvas data-el="cv"></canvas>
      <div class="turtle-hud"><span data-el="l"></span><span data-el="c"></span><span data-el="r"></span></div>
      <div class="turtle-prompt" data-el="prompt"></div>
      <div class="turtle-loading" data-el="loading">Loading</div>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const cv = q('cv'), stage = q('stage'), g = cv.getContext('2d');
  let inst = null, raf = 0, last = 0, alive = true, paused = false, over = false;
  const ctx = {
    W: 0, H: 0, t: 0, best: tb.best[id] || 0, game,
    hud({ left = '', center = '', right = '' } = {}) { q('l').textContent = left; q('c').textContent = center; q('r').textContent = right; q('l').hidden = !left; q('c').hidden = !center; q('r').hidden = !right; },
    prompt(text) { const p = q('prompt'); if (text) { p.textContent = text; p.classList.add('show'); } else p.classList.remove('show'); },
    finish(score, line = '') { if (!over) { over = true; setTimeout(() => results(Math.max(0, Math.round(score)), line), 900); } },
    // for games that keep progress between rounds (Tortoise Trek): records a best score without ending the round
    record(score) { if (score > (tb.best[id] || 0)) { tb.best[id] = score; save(); } },
  };

  function resize() {
    const r = stage.getBoundingClientRect(), dpr = Math.min(2.5, window.devicePixelRatio || 1);
    ctx.W = r.width; ctx.H = r.height;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    inst?.resize?.();
  }
  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000)); last = now;
    if (!inst || paused) return;
    ctx.t += dt;
    inst.update(dt / 2); inst.update(dt / 2);
    g.save(); inst.draw(g); g.restore();
  }
  function start() {
    over = false; ctx.t = 0; ctx.best = tb.best[id] || 0;
    ctx.hud({}); ctx.prompt('');
    if (inst?.destroy) inst.destroy();
    inst = game.create(ctx);
  }

  const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  let downId = null;
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!inst || paused || over) return; downId = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch { /* fine */ } inst.down?.(...pos(e)); });
  cv.addEventListener('pointermove', (e) => { if (!inst || paused || downId === null) return; inst.move?.(...pos(e)); });
  const up = (e) => { if (downId === null) return; downId = null; if (inst && !paused) inst.up?.(...pos(e)); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  function results(score, line) {
    if (!alive) return;
    const prev = tb.best[id] || 0, isBest = score > prev;
    if (isBest) tb.best[id] = score;
    tb.played[id] = (tb.played[id] || 0) + 1;
    save(true);
    if (isBest && score > 0) { snd.cheer(); confetti(); buzz([30, 50, 30]); } else sfx.tap();
    const node = el(`<div class="turtle-result"><div class="box">
      ${isBest && score > 0 ? '<div class="badge">New best</div>' : ''}
      <img src="img/turtle/${isBest ? 't_front' : 't_tort_front'}.webp" alt="">
      <div class="big">${esc(scoreText(game, score))}</div>
      ${line ? `<p>${esc(line)}</p>` : ''}
      <p class="sub">${isBest || !prev ? (prev ? `Previous best ${esc(scoreText(game, prev))}` : 'First score on the board') : `Best ${esc(scoreText(game, prev))}`}</p>
      <div class="stack">
        <button class="btn turtle-btn" data-r="again">Play again</button>
        <button class="btn ghost" data-r="back">Back</button>
      </div></div></div>`);
    root.appendChild(node);
    node.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]')?.dataset.r; if (!r) return;
      node.remove();
      if (r === 'again') start(); else app.back();
    });
  }

  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') { paused = true; await turtleHelp(game); paused = false; last = performance.now(); }
  });
  const onVis = () => { if (document.hidden) paused = true; else { paused = false; last = performance.now(); } };
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(() => resize());

  (async () => {
    await loadTurtle();
    if (!alive) return;
    q('loading').remove();
    resize(); ro.observe(stage);
    const first = !tb.seen[id];
    if (first) { tb.seen[id] = true; save(); paused = true; start(); await turtleHelp(game); paused = false; }
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
