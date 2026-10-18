// Moto Mania: the hub (six motorbike games and the garage), the garage itself, and the screen that runs a game.
//
// A game module exports default { id, name, blurb, unit ('m' | 'pts' | 's' ...), how: [paragraphs], theme: [3 colours],
//   levels?: number of levels (then ctx.level is the level index and the hub keeps level progress),
//   thumb?(g, w, h), create(ctx) -> { update(dt), draw(g), down?(x, y), up?(x, y), move?(x, y), destroy?() } }.
// ctx gives: W, H (CSS px), t, best, level, stage (the element holding the canvas, for a WebGL canvas placed underneath:
//   give it class 'moto-gl'), hud({ left, center, right }), prompt(text),
//   finish(score, line, { coins, stars, passed }) to end the game: coins are added to the wallet, stars (0-3) and
//   passed (true unlocks the next level) matter for level games. Higher scores are always better.
import { store, save } from '../store.js';
import { icon } from '../icons.js';
import { el, $, $$, sheet, esc, confetti, toast } from '../ui.js';
import { sfx } from '../sound.js';
import { snd, buzz, fmt, fmt1 } from '../yeti/kit.js';
import { loadMoto, M, BIKES, PAINTS, RIDERS, ride, drawBike, addCoins, coinIcon, bikeById } from './kit.js';
import rush from './g-rush.js';
import hill from './g-hill.js';
import stunt from './g-stunt.js';
import traffic from './g-traffic.js';
import park from './g-park.js';
import delivery from './g-delivery.js';

export const MOTO_GAMES = [rush, hill, stunt, traffic, park, delivery];
const byId = (id) => MOTO_GAMES.find((g) => g.id === id);
const scoreText = (game, v) => (game.unit === 'm' ? fmt1(v, 'm') : game.unit === 'pts' ? fmt(v, 'pts') : fmt(v, game.unit || ''));
const coinHTML = (n) => `<span class="moto-coins"><i></i>${fmt(n)}</span>`;

export function motoHelp(game) {
  const paras = game ? game.how : [
    'Six motorbike games that share one garage. Every game earns coins.',
    'Spend coins in the garage on new bikes and paint, and pick your rider. The bike you choose rides in every game, and each bike handles differently.',
  ];
  return new Promise((done) => sheet(`<h2>${esc(game ? game.name : 'Moto Mania')}</h2><div class="help-body">${paras.map((p) => `<p>${p}</p>`).join('')}</div><button class="btn moto-btn" data-x>Let's ride</button>`,
    { onMount: (n, close) => { $('[data-x]', n).onclick = close; }, onClose: done }));
}

function paintCanvas(canvas, fn) {
  const w = canvas.clientWidth || 120, h = canvas.clientHeight || 80, dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = w * dpr; canvas.height = h * dpr;
  const g = canvas.getContext('2d'); g.scale(dpr, dpr); fn(g, w, h);
}
function paintThumb(game, canvas) {
  paintCanvas(canvas, (g, w, h) => {
    const [a, b, c] = game.theme || ['#ffd27a', '#ffe9c2', '#fff6e8'];
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, a); gr.addColorStop(0.7, b); gr.addColorStop(1, c);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    if (game.thumb) game.thumb(g, w, h);
    else drawBike(g, w * 0.5, h * 0.92, h * 0.34);
  });
}
export function motoCardArt() {
  const { bike } = ride();
  return `<div class="art-moto"><img src="img/moto/bike_${bike.id}.webp" alt=""><img class="rd" src="img/moto/bike_${bike.id}__${M().rider}.webp" alt=""></div>`;
}

// ---------- Hub ----------
export function motoHubScreen(app) {
  const root = el(`<section class="screen moto-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">Moto Mania</div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  function render() {
    const m = M(), r = ride();
    body.innerHTML = `
      <div class="moto-top">${coinHTML(m.coins)}</div>
      <button class="moto-garage-card" data-act="garage">
        <canvas class="moto-hero" data-hero></canvas>
        <div><b>${esc(r.bike.name)}</b><span>${esc(r.rider.name)} · ${esc(r.paint.name)} paint</span><em>Open the garage</em></div>
      </button>
      <div class="moto-list">${MOTO_GAMES.map((gm) => {
        const lv = gm.levels ? (m.level[gm.id] || 0) : null;
        return `<button class="moto-card" data-g="${gm.id}">
          <canvas class="moto-thumb" data-thumb="${gm.id}"></canvas>
          <div class="moto-info"><b>${esc(gm.name)}</b><span>${esc(gm.blurb)}</span>
          <em>${gm.levels ? `Level ${Math.min(lv + 1, gm.levels)} of ${gm.levels}` : m.best[gm.id] ? `Best ${scoreText(gm, m.best[gm.id])}` : 'Not played yet'}</em></div>
        </button>`;
      }).join('')}</div>
      <p class="moto-credit">Bikes are low-poly models by Poly by Google and Corentin Fatus (CC-BY 3.0); riders, cars and scenery are by Kenney (CC0). See About for credits.</p>`;
    loadMoto().then(() => {
      $$('[data-thumb]', body).forEach((c) => paintThumb(byId(c.dataset.thumb), c));
      const hero = $('[data-hero]', body); if (hero) paintCanvas(hero, (g, w, h) => drawBike(g, w / 2, h * 0.95, h * 0.5));
    });
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return motoHelp();
    if (a === 'garage') return app.go('motogarage');
    const c = e.target.closest('[data-g]');
    if (c) { const gm = byId(c.dataset.g); app.go('motogame', { id: gm.id, level: gm.levels ? Math.min(M().level[gm.id] || 0, gm.levels - 1) : 0 }); }
  });
  render();
  return { root, refresh: render };
}

// ---------- Garage ----------
export function motoGarageScreen(app) {
  const root = el(`<section class="screen moto-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">Garage</div><div class="moto-top-coins" data-el="coins"></div></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  let view = M().bike;
  const bar = (v) => `<span class="moto-bar"><i style="width:${(v / 5) * 100}%"></i></span>`;
  function render() {
    const m = M(), b = bikeById(view), owned = m.owned.includes(b.id), paintId = m.paint[b.id] || 'factory';
    $('[data-el="coins"]', root).innerHTML = coinHTML(m.coins);
    body.innerHTML = `
      <canvas class="moto-show" data-show></canvas>
      <div class="moto-bike-tabs">${BIKES.map((x) => `<button class="${x.id === view ? 'on' : ''} ${m.owned.includes(x.id) ? '' : 'locked'}" data-bike="${x.id}"><img src="img/moto/bike_${x.id}.webp" alt=""></button>`).join('')}</div>
      <div class="moto-spec"><h2>${esc(b.name)}</h2><p>${esc(b.blurb)}</p>
        <div class="moto-stats">${['speed', 'power', 'grip', 'handling'].map((s) => `<div><span>${s[0].toUpperCase() + s.slice(1)}</span>${bar(b.stats[s])}</div>`).join('')}</div>
        ${owned ? (m.bike === b.id ? '<button class="btn moto-btn" disabled>Riding this bike</button>' : '<button class="btn moto-btn" data-act="ride">Ride this bike</button>')
          : `<button class="btn moto-btn ${m.coins < b.price ? 'poor' : ''}" data-act="buy">Buy for ${coinHTML(b.price)}</button>`}
      </div>
      <div class="section-title">Paint</div>
      <div class="moto-paints">${PAINTS.map((p) => { const has = m.paints.includes(p.id); return `<button class="${p.id === paintId ? 'on' : ''}" data-paint="${p.id}"><canvas data-swatch="${p.id}"></canvas><b>${esc(p.name)}</b><small>${has ? (p.id === paintId ? 'On this bike' : 'Owned') : coinHTML(p.price)}</small></button>`; }).join('')}</div>
      <div class="section-title">Rider</div>
      <div class="moto-riders">${RIDERS.map((r) => `<button class="${r.id === m.rider ? 'on' : ''}" data-rider="${r.id}"><img src="img/moto/rider_${r.id}_cheer.webp" alt="" style="object-position:0 0"><b>${esc(r.name)}</b></button>`).join('')}</div>`;
    loadMoto().then(() => {
      paintCanvas($('[data-show]', body), (g, w, h) => {
        const gr = g.createRadialGradient(w / 2, h * 0.9, 10, w / 2, h * 0.7, w * 0.6); gr.addColorStop(0, 'rgba(255,210,120,.55)'); gr.addColorStop(1, 'rgba(255,210,120,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(60,40,20,.18)'; g.beginPath(); g.ellipse(w / 2, h * 0.92, w * 0.36, 10, 0, 0, 6.283); g.fill();
        drawBike(g, w / 2, h * 0.92, h * 0.42, { bike: b.id, paint: paintId, alpha: owned ? 1 : 0.92 });
      });
      $$('[data-swatch]', body).forEach((c) => paintCanvas(c, (g, w, h) => drawBike(g, w / 2, h * 0.95, h * 0.62, { bike: b.id, paint: c.dataset.swatch, rider: false })));
    });
  }
  root.addEventListener('click', (e) => {
    const m = M();
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    const bk = e.target.closest('[data-bike]'); if (bk) { view = bk.dataset.bike; sfx.tap(); return render(); }
    const b = bikeById(view);
    if (a === 'buy') {
      if (m.coins < b.price) { toast(`You need ${fmt(b.price - m.coins)} more coins`); sfx.error(); return; }
      m.coins -= b.price; m.owned.push(b.id); m.bike = b.id; save(true); snd.cheer(); confetti(); return render();
    }
    if (a === 'ride') { m.bike = b.id; save(); sfx.place(); return render(); }
    const p = e.target.closest('[data-paint]');
    if (p) {
      const pid = p.dataset.paint, paint = PAINTS.find((x) => x.id === pid);
      if (!m.owned.includes(b.id)) { toast('Buy this bike first, then paint it'); return; }
      if (!m.paints.includes(pid)) {
        if (m.coins < paint.price) { toast(`You need ${fmt(paint.price - m.coins)} more coins`); sfx.error(); return; }
        m.coins -= paint.price; m.paints.push(pid); snd.ding(2);
      }
      m.paint[b.id] = pid; save(true); sfx.place(); return render();
    }
    const r = e.target.closest('[data-rider]'); if (r) { m.rider = r.dataset.rider; save(); sfx.place(); return render(); }
  });
  render();
  return { root, refresh: render };
}

// ---------- A game ----------
export function motoGameScreen(app, { id, level = 0 }) {
  const game = byId(id);
  const m = M();
  const root = el(`<section class="screen moto-theme moto-play">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">${esc(game.name)}${game.levels ? `<small>Level ${level + 1}</small>` : ''}</div>
      ${game.levels ? `<button class="icon-btn" data-act="levels" aria-label="Levels">${icon.grid}</button>` : ''}
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="moto-stage" data-el="stage">
      <canvas data-el="cv"></canvas>
      <div class="moto-hud"><span data-el="l"></span><span data-el="c"></span><span data-el="r"></span></div>
      <div class="moto-prompt" data-el="prompt"></div>
      <div class="moto-loading" data-el="loading">Warming up the engine…</div>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const cv = q('cv'), stage = q('stage'), g = cv.getContext('2d');
  let inst = null, raf = 0, last = 0, alive = true, paused = false, over = false;
  const ctx = {
    W: 0, H: 0, t: 0, best: m.best[id] || 0, level, game, stage,
    hud({ left = '', center = '', right = '' } = {}) { q('l').textContent = left; q('c').textContent = center; q('r').textContent = right; q('l').hidden = !left; q('c').hidden = !center; q('r').hidden = !right; },
    prompt(text) { const p = q('prompt'); if (text) { p.textContent = text; p.classList.add('show'); } else p.classList.remove('show'); },
    finish(score, line = '', extra = {}) { if (!over) { over = true; setTimeout(() => results(score, line, extra), 900); } },
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
    over = false; ctx.t = 0; ctx.best = m.best[id] || 0;
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

  function results(rawScore, line, { coins = 0, stars = null, passed = null } = {}) {
    if (!alive) return;
    const score = Math.max(0, game.unit === 'm' ? Math.round(rawScore * 10) / 10 : Math.round(rawScore));
    const prev = m.best[id] || 0, isBest = !game.levels && score > prev;
    if (isBest) m.best[id] = score;
    m.played[id] = (m.played[id] || 0) + 1;
    if (game.levels && stars !== null) { const k = `${id}:${level}`; m.stars[k] = Math.max(m.stars[k] || 0, stars); }
    if (game.levels && passed && level + 1 > (m.level[id] || 0)) m.level[id] = Math.min(game.levels, level + 1);
    coins = Math.max(0, Math.round(coins));
    if (coins) addCoins(coins);
    save(true);
    if ((isBest && score > 0) || passed) { snd.cheer(); confetti(); buzz([30, 50, 30]); } else sfx.tap();
    const nextLevel = game.levels && passed && level + 1 < game.levels;
    const node = el(`<div class="moto-result"><div class="box">
      ${isBest && score > 0 ? '<div class="badge">New best!</div>' : ''}
      ${stars !== null ? `<div class="moto-stars">${[0, 1, 2].map((i) => `<i class="${i < stars ? 'on' : ''}"></i>`).join('')}</div>` : `<img src="img/moto/rider_${m.rider}_cheer.webp" alt="" class="cheer">`}
      <div class="big">${game.levels && passed === false ? 'Try again' : esc(scoreText(game, score))}</div>
      ${line ? `<p>${esc(line)}</p>` : ''}
      ${!game.levels ? `<p class="sub">${isBest || !prev ? (prev ? `Previous best ${esc(scoreText(game, prev))}` : 'First score on the board') : `Best ${esc(scoreText(game, prev))}`}</p>` : ''}
      ${coins ? `<div class="earned">+${coinHTML(coins)} coins</div>` : ''}
      <div class="stack">
        ${nextLevel ? '<button class="btn moto-btn" data-r="next">Next level</button>' : ''}
        <button class="btn ${nextLevel ? 'secondary' : 'moto-btn'}" data-r="again">${game.levels ? (passed ? 'Replay level' : 'Try again') : 'Ride again'}</button>
        <button class="btn ghost" data-r="back">Back</button>
      </div></div></div>`);
    root.appendChild(node);
    node.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]')?.dataset.r; if (!r) return;
      node.remove();
      if (r === 'next') app.replace('motogame', { id, level: level + 1 });
      else if (r === 'again') start();
      else app.back();
    });
  }
  function levelSheet() {
    const unlocked = Math.min(m.level[id] || 0, game.levels - 1);
    paused = true;
    sheet(`<h2>${esc(game.name)} levels</h2><div class="moto-levels">${Array.from({ length: game.levels }, (_, i) => {
      const s = m.stars[`${id}:${i}`] || 0;
      return `<button data-lv="${i}" ${i > unlocked ? 'disabled' : ''} class="${i === level ? 'cur' : ''}">${i + 1}<small>${[0, 1, 2].map((k) => `<i class="${k < s ? 'on' : ''}"></i>`).join('')}</small></button>`;
    }).join('')}</div>`, {
      onMount(n, close) { n.addEventListener('click', (e) => { const b = e.target.closest('[data-lv]'); if (!b) return; close(); app.replace('motogame', { id, level: +b.dataset.lv }); }); },
      onClose() { paused = false; last = performance.now(); },
    });
  }
  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'levels') levelSheet();
    else if (a === 'help') { paused = true; await motoHelp(game); paused = false; last = performance.now(); }
  });
  const onVis = () => { if (document.hidden) paused = true; else { paused = false; last = performance.now(); } };
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(() => resize());
  (async () => {
    await loadMoto();
    if (!alive) return;
    q('loading').remove();
    resize(); ro.observe(stage);
    const first = !m.seen[id];
    if (first) { m.seen[id] = true; save(); paused = true; start(); await motoHelp(game); paused = false; }
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
