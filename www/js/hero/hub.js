// Marvel Heroes: the hub (seven games and the Hero Builder), the builder itself, and the screen that runs a game.
// Unofficial fan project: Marvel characters and names belong to Marvel. All hero artwork is drawn by the app on top of
// Kenney's CC0 Toon Characters; see kit.js.
//
// A game module exports default { id, name, blurb, unit ('m' | 'pts' | ...), how: [paragraphs], theme: [3 colours],
//   levels?: number of levels (ctx.level is then the level index and the hub keeps level progress),
//   thumb?(g, w, h), create(ctx) -> { update(dt), draw(g), down?(x, y), up?(x, y), move?(x, y), destroy?() } }.
// ctx gives: W, H (CSS px), t, best, level, hud({ left, center, right }), prompt(text),
//   finish(score, line, { coins, stars, passed }) to end the game. Higher scores are always better.
import { store, save } from '../store.js';
import { icon } from '../icons.js';
import { el, $, $$, sheet, esc, confetti, toast } from '../ui.js';
import { sfx } from '../sound.js';
import { snd, buzz, fmt, fmt1 } from '../yeti/kit.js';
import { loadHero, H, HEROES, BUILD, chosen, defaultLook, drawHero, addCoins, drawEmblem } from './kit.js';
import swing from './g-swing.js';
import hq from './g-hq.js';
import match from './g-match.js';
import throwGame from './g-shield.js';
import lockdown from './g-lockdown.js';
import stones from './g-stones.js';

export const HERO_GAMES = [swing, hq, match, throwGame, lockdown, stones];
const byId = (id) => HERO_GAMES.find((g) => g.id === id);
const scoreText = (game, v) => (game.unit === 'm' ? fmt1(v, 'm') : game.unit === 'pts' ? fmt(v, 'pts') : fmt(v, game.unit || ''));
const coinHTML = (n) => `<span class="hero-coins"><i></i>${fmt(n)}</span>`;

export function heroHelp(game) {
  const paras = game ? game.how : [
    'Seven games with Earth\'s mightiest heroes: swing with Spider-Man, throw Captain America\'s shield, run Avengers HQ, match power gems, lock up villains and gather the six Infinity Stones.',
    'Every game earns coins. Spend them in the Hero Builder on masks, capes, emblems and gear, then pick a hero or design your own. Your chosen hero joins in Power Match, Hero HQ and the Infinity Stones quest.',
    'This is an unofficial fan game. Marvel characters belong to Marvel.',
  ];
  return new Promise((done) => sheet(`<h2>${esc(game ? game.name : 'Marvel Heroes')}</h2><div class="help-body">${paras.map((p) => `<p>${p}</p>`).join('')}</div><button class="btn hero-btn" data-x>Assemble</button>`,
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
  });
}
// Landing card art: three heroes side by side, drawn when the card is shown.
export function heroCardArt() {
  const id = `hc${Math.random().toString(36).slice(2, 8)}`;
  loadHero().then(() => {
    const c = document.getElementById(id); if (!c) return;
    paintCanvas(c, (g, w, h) => {
      drawHero(g, w * 0.22, h * 0.98, h * 0.82, { look: HEROES[1].look, pose: 'stand' });
      drawHero(g, w * 0.78, h * 0.98, h * 0.82, { look: HEROES[2].look, pose: 'stand', flip: true });
      drawHero(g, w * 0.5, h * 1.0, h * 0.95, { look: HEROES[0].look, pose: 'cheer' });
    });
  });
  return `<canvas class="art-hero" id="${id}"></canvas>`;
}

// ---------- Hub ----------
export function heroHubScreen(app) {
  const root = el(`<section class="screen hero-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">Marvel Heroes</div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  function render() {
    const h = H(), me = chosen();
    body.innerHTML = `
      <div class="hero-top">${coinHTML(h.coins)}</div>
      <button class="hero-builder-card" data-act="builder">
        <canvas class="hero-preview" data-hero></canvas>
        <div><b>${esc(me.name)}</b><span>Your hero for Power Match, Hero HQ and the Infinity Stones</span><em>Hero Builder</em></div>
      </button>
      <div class="hero-list">${HERO_GAMES.map((gm) => {
        const lv = gm.levels ? (h.level[gm.id] || 0) : null;
        return `<button class="hero-card" data-g="${gm.id}">
          <canvas class="hero-thumb" data-thumb="${gm.id}"></canvas>
          <div class="hero-info"><b>${esc(gm.name)}</b><span>${esc(gm.blurb)}</span>
          <em>${gm.levels ? (gm.progress ? gm.progress(h) : `Level ${Math.min(lv + 1, gm.levels)} of ${gm.levels}`) : h.best[gm.id] ? `Best ${scoreText(gm, h.best[gm.id])}` : 'Not played yet'}</em></div>
        </button>`;
      }).join('')}</div>
      <p class="hero-credit">An unofficial fan game. Marvel characters and names belong to Marvel. Heroes are drawn on Kenney's Toon Characters (CC0); Thor's hammer is by OZZYBOI and the arc reactor by Heiko Jakob (CC-BY 3.0). See About for credits.</p>`;
    loadHero().then(() => {
      $$('[data-thumb]', body).forEach((c) => paintThumb(byId(c.dataset.thumb), c));
      const hero = $('[data-hero]', body); if (hero) paintCanvas(hero, (g, w, hh) => drawHero(g, w / 2, hh * 0.97, hh * 0.9, { look: me.look, pose: 'cheer' }));
    });
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return heroHelp();
    if (a === 'builder') return app.go('herobuilder');
    const c = e.target.closest('[data-g]');
    if (c) { const gm = byId(c.dataset.g); app.go('herogame', { id: gm.id, level: gm.levels ? Math.min(H().level[gm.id] || 0, gm.levels - 1) : 0 }); }
  });
  render();
  return { root, refresh: render };
}

// ---------- Hero Builder ----------
export function heroBuilderScreen(app) {
  const root = el(`<section class="screen hero-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">Hero Builder</div><div class="hero-top-coins" data-el="coins"></div></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  let tab = 'mask';
  const owned = (kind, id) => { const it = BUILD[kind].find((x) => x.id === id); return !it || !it.price || H().owned.includes(`${kind}:${id}`); };
  function look() { const h = H(); if (!h.look) h.look = defaultLook(); return h.look; }
  function swatches(key) { return `<div class="hero-swatches">${BUILD.colours.map((c) => `<button class="${look()[key] === c ? 'on' : ''}" data-col="${key}" data-v="${c}" style="background:${c}" aria-label="Colour"></button>`).join('')}</div>`; }
  function render() {
    const h = H(), me = chosen(), custom = h.pick === 'custom' || !h.pick;
    $('[data-el="coins"]', root).innerHTML = coinHTML(h.coins);
    const items = BUILD[tab] || [];
    body.innerHTML = `
      <canvas class="hero-show" data-show></canvas>
      <div class="section-title">Pick a hero</div>
      <div class="hero-roster">${HEROES.map((r) => `<button class="${h.pick === r.id ? 'on' : ''}" data-pick="${r.id}"><canvas data-mini="${r.id}"></canvas><b>${esc(r.name)}</b></button>`).join('')}
        <button class="${custom ? 'on' : ''}" data-pick="custom"><canvas data-mini="custom"></canvas><b>Your hero</b></button></div>
      <div class="section-title">Design your own</div>
      <div class="hero-tabs">${[['base', 'Face'], ['mask', 'Mask'], ['cape', 'Cape'], ['emblem', 'Emblem'], ['prop', 'Gear'], ['colour', 'Colours']].map(([k, n]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('')}</div>
      ${tab === 'colour' ? `<div class="hero-colours"><b>Suit</b>${swatches('top')}<b>Legs</b>${swatches('legs')}<b>Mask</b>${swatches('maskCol')}<b>Cape</b>${swatches('capeCol')}<b>Emblem</b>${swatches('emblemCol')}</div>`
        : `<div class="hero-items">${items.map((it) => { const has = owned(tab, it.id), on = look()[tab] === it.id; return `<button class="${on ? 'on' : ''} ${has ? '' : 'locked'}" data-item="${it.id}"><canvas data-item-c="${it.id}"></canvas><b>${esc(it.name)}</b><small>${has ? (on ? 'Wearing' : 'Owned') : coinHTML(it.price)}</small></button>`; }).join('')}</div>`}
      <p class="hero-note">Changes in this section apply to Your hero.</p>`;
    loadHero().then(() => {
      paintCanvas($('[data-show]', body), (g, w, hh) => {
        const gr = g.createRadialGradient(w / 2, hh * 0.9, 10, w / 2, hh * 0.6, w * 0.6); gr.addColorStop(0, 'rgba(255,215,90,.55)'); gr.addColorStop(1, 'rgba(255,215,90,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, hh);
        g.fillStyle = 'rgba(20,20,40,.2)'; g.beginPath(); g.ellipse(w / 2, hh * 0.94, 60, 9, 0, 0, 6.283); g.fill();
        drawHero(g, w / 2, hh * 0.94, hh * 0.86, { look: me.look, pose: 'stand', flow: 0.25 });
      });
      $$('[data-mini]', body).forEach((c) => { const r = c.dataset.mini === 'custom' ? { look: look() } : HEROES.find((x) => x.id === c.dataset.mini); paintCanvas(c, (g, w, hh) => drawHero(g, w / 2, hh * 0.98, hh * 0.92, { look: r.look })); });
      $$('[data-item-c]', body).forEach((c) => paintCanvas(c, (g, w, hh) => {
        const L = { ...look(), [tab]: c.dataset.itemC };
        if (tab === 'emblem') { g.fillStyle = L.top; g.beginPath(); g.arc(w / 2, hh / 2, hh * 0.42, 0, 6.283); g.fill(); drawEmblem(g, L.emblem, L.emblemCol, w / 2, hh / 2, hh / 40); }
        else drawHero(g, w / 2, hh * 0.98, hh * 0.9, { look: L, pose: tab === 'prop' ? 'throw' : 'stand', flow: 0.3 });
      }));
    });
  }
  root.addEventListener('click', (e) => {
    const h = H();
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    const p = e.target.closest('[data-pick]'); if (p) { h.pick = p.dataset.pick; save(); sfx.place(); return render(); }
    const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; sfx.tap(); return render(); }
    const c = e.target.closest('[data-col]'); if (c) { look()[c.dataset.col] = c.dataset.v; h.pick = 'custom'; save(); sfx.tap(); return render(); }
    const it = e.target.closest('[data-item]');
    if (it) {
      const id = it.dataset.item, item = BUILD[tab].find((x) => x.id === id);
      if (!owned(tab, id)) {
        if (h.coins < item.price) { toast(`You need ${fmt(item.price - h.coins)} more coins`); sfx.error(); return; }
        h.coins -= item.price; h.owned.push(`${tab}:${id}`); snd.cheer(); confetti();
      }
      look()[tab] = id; h.pick = 'custom'; save(true); sfx.place(); return render();
    }
  });
  render();
  return { root, refresh: render };
}

// ---------- A game ----------
export function heroGameScreen(app, { id, level = 0 }) {
  const game = byId(id);
  const h = H();
  const root = el(`<section class="screen hero-theme hero-play">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">${esc(game.name)}${game.levels ? `<small>${esc(game.levelName ? game.levelName(level) : `Level ${level + 1}`)}</small>` : ''}</div>
      ${game.levels ? `<button class="icon-btn" data-act="levels" aria-label="Levels">${icon.grid}</button>` : ''}
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="hero-stage" data-el="stage">
      <canvas data-el="cv"></canvas>
      <div class="hero-hud"><span data-el="l"></span><span data-el="c"></span><span data-el="r"></span></div>
      <div class="hero-prompt" data-el="prompt"></div>
      <div class="hero-loading" data-el="loading">Suiting up</div>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const cv = q('cv'), stage = q('stage'), g = cv.getContext('2d');
  let inst = null, raf = 0, last = 0, alive = true, paused = false, over = false;
  const ctx = {
    W: 0, H: 0, t: 0, best: h.best[id] || 0, level, game, stage,
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
    over = false; ctx.t = 0; ctx.best = h.best[id] || 0;
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
    const prev = h.best[id] || 0, isBest = !game.levels && score > prev;
    if (isBest) h.best[id] = score;
    h.played[id] = (h.played[id] || 0) + 1;
    if (game.levels && stars !== null) { const k = `${id}:${level}`; h.stars[k] = Math.max(h.stars[k] || 0, stars); }
    if (game.levels && passed && level + 1 > (h.level[id] || 0)) h.level[id] = Math.min(game.levels, level + 1);
    coins = Math.max(0, Math.round(coins));
    if (coins) addCoins(coins);
    save(true);
    if ((isBest && score > 0) || passed) { snd.cheer(); confetti(); buzz([30, 50, 30]); } else sfx.tap();
    const nextLevel = game.levels && passed && level + 1 < game.levels;
    const node = el(`<div class="hero-result"><div class="box">
      ${isBest && score > 0 ? '<div class="badge">New best</div>' : ''}
      ${stars !== null ? `<div class="hero-stars">${[0, 1, 2].map((i) => `<i class="${i < stars ? 'on' : ''}"></i>`).join('')}</div>` : '<canvas class="cheer" data-cheer></canvas>'}
      <div class="big">${game.levels && passed === false ? 'Try again' : esc(game.levels ? (game.resultTitle ? game.resultTitle(level) : 'Level complete') : scoreText(game, score))}</div>
      ${line ? `<p>${esc(line)}</p>` : ''}
      ${!game.levels ? `<p class="sub">${isBest || !prev ? (prev ? `Previous best ${esc(scoreText(game, prev))}` : 'First score on the board') : `Best ${esc(scoreText(game, prev))}`}</p>` : ''}
      ${coins ? `<div class="earned">+${coinHTML(coins)} coins</div>` : ''}
      <div class="stack">
        ${nextLevel ? '<button class="btn hero-btn" data-r="next">Next level</button>' : ''}
        <button class="btn ${nextLevel ? 'secondary' : 'hero-btn'}" data-r="again">${game.levels ? (passed ? 'Replay level' : 'Try again') : 'Play again'}</button>
        <button class="btn ghost" data-r="back">Back</button>
      </div></div></div>`);
    root.appendChild(node);
    const ch = $('[data-cheer]', node); if (ch) paintCanvas(ch, (gg, w, hh) => drawHero(gg, w / 2, hh * 0.98, hh * 0.92, { look: (game.star ? game.star() : chosen()).look, pose: 'cheer' }));
    node.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]')?.dataset.r; if (!r) return;
      node.remove();
      if (r === 'next') app.replace('herogame', { id, level: level + 1 });
      else if (r === 'again') start();
      else app.back();
    });
  }
  function levelSheet() {
    const unlocked = Math.min(h.level[id] || 0, game.levels - 1);
    paused = true;
    sheet(`<h2>${esc(game.name)}</h2><div class="hero-levels ${game.levels <= 6 ? 'wide' : ''}">${Array.from({ length: game.levels }, (_, i) => {
      const s = h.stars[`${id}:${i}`] || 0;
      return `<button data-lv="${i}" ${i > unlocked ? 'disabled' : ''} class="${i === level ? 'cur' : ''}">${game.levels <= 6 && game.levelName ? esc(game.levelName(i)) : i + 1}<small>${[0, 1, 2].map((k) => `<i class="${k < s ? 'on' : ''}"></i>`).join('')}</small></button>`;
    }).join('')}</div>`, {
      onMount(n, close) { n.addEventListener('click', (e) => { const b = e.target.closest('[data-lv]'); if (!b) return; close(); app.replace('herogame', { id, level: +b.dataset.lv }); }); },
      onClose() { paused = false; last = performance.now(); },
    });
  }
  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'levels') levelSheet();
    else if (a === 'help') { paused = true; await heroHelp(game); paused = false; last = performance.now(); }
  });
  const onVis = () => { if (document.hidden) paused = true; else { paused = false; last = performance.now(); } };
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(() => resize());
  (async () => {
    await loadHero();
    if (!alive) return;
    q('loading').remove();
    resize(); ro.observe(stage);
    const first = !h.seen[id];
    if (first) { h.seen[id] = true; save(); paused = true; start(); await heroHelp(game); paused = false; }
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
