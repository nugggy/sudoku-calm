// Jump Mates: twenty co-op platform games for two players on one device. The hub lists the games, and the
// play screen runs one with two sets of on-screen buttons, the keyboard and up to two game controllers.
// Games are modules (see README.md) built on engine.js; draw.js paints them.
import { store, save } from '../store.js';
import { icon } from '../icons.js';
import { el, $, $$, sheet, esc, confetti, toast, closeTopOverlay } from '../ui.js';
import { sfx } from '../sound.js';
import { native } from '../native.js';
import { snd, buzz } from '../yeti/kit.js';
import { makeWorld, STEP } from './engine.js';
import { Cam, Parts, render, eventFx, COLOURS, NAMES } from './draw.js';
import { createInput, menuPad } from './input.js';
import { MATES_GAMES } from './games.js';

export { MATES_GAMES };
const M = () => store.mates;
const byId = (id) => MATES_GAMES.find((g) => g.id === id);
const isEndless = (game) => !!game.endless;
const LEVEL_COUNT = MATES_GAMES.reduce((a, g) => a + (g.levels ? g.levels.length : 0), 0);

// Stars for a level: finished, every coin and gem, and nobody fell.
const starsOf = (gid, i) => M().done[gid]?.[i]?.s || 0;
const countStars = (s) => (s & 1) + ((s >> 1) & 1) + ((s >> 2) & 1);
export function matesStars() { let n = 0; for (const g of MATES_GAMES) if (g.levels) g.levels.forEach((_, i) => { n += countStars(starsOf(g.id, i)); }); return n; }
const firstOpen = (game) => { if (!game.levels) return 0; const d = M().done[game.id] || {}; const i = game.levels.findIndex((_, k) => !d[k]); return i < 0 ? 0 : i; };
const unlocked = (game, i) => i === 0 || !!M().done[game.id]?.[i - 1] || !!M().done[game.id]?.[i];
const fmtScore = (game, v) => `${Math.round(v).toLocaleString('en-AU')} ${v === 1 && game.endless.unit1 ? game.endless.unit1 : game.endless.unit}`;

function progressLine(game) {
  if (isEndless(game)) { const b = M().best[game.id]; return b ? `Best ${fmtScore(game, b)}` : 'Not played yet'; }
  const d = M().done[game.id] || {}, n = Object.keys(d).length;
  if (!n) return `${game.levels.length} levels`;
  const st = game.levels.reduce((a, _, i) => a + countStars(starsOf(game.id, i)), 0);
  return `${n} of ${game.levels.length} levels · ${st} of ${game.levels.length * 3} stars`;
}
export function matesProgress() {
  const played = MATES_GAMES.filter((g) => (isEndless(g) ? M().best[g.id] : Object.keys(M().done[g.id] || {}).length)).length;
  return played ? `${played} of ${MATES_GAMES.length} games played` : '20 games for two';
}

export function matesHelp(game) {
  const paras = game ? game.how : [
    'Twenty platform games for two players on one phone or tablet. Pip (orange, with a leaf) and Bo (blue, with an antenna) have to work together: most levels need both of you at the door.',
    'Each player has a set of buttons at the bottom of the screen: left and right on the outside, then the action button and the jump button. Hold jump for a higher jump. You can stand on your partner\'s head to reach higher ledges.',
    'Game controllers work too. Connect one or two (USB or Bluetooth): the stick or d-pad moves, A jumps, B or X is the action button and Start pauses. With one controller, the other player uses the screen. On a keyboard, player 1 uses A, D and W (E for action) and player 2 uses the arrow keys (Enter for action).',
    'Levels give a star for finishing, a star for every coin and gem, and a star if nobody falls. Some games are endless and keep your best score instead.',
  ];
  return new Promise((done) => sheet(`<h2>${esc(game ? game.name : 'Jump Mates')}</h2><div class="help-body">${paras.map((p) => `<p>${p}</p>`).join('')}</div><button class="btn mates-btn" data-x>Let's go</button>`,
    { onMount: (n, close) => { $('[data-x]', n).onclick = close; }, onClose: done }));
}

// ---------- Card art: Pip and Bo ----------
const buddy = (col, dark, kind, flip = false) => `<svg viewBox="0 0 60 64" ${flip ? 'style="transform:scaleX(-1)"' : ''} aria-hidden="true">
  <ellipse cx="20" cy="60" rx="9" ry="4" fill="${dark}"/><ellipse cx="40" cy="60" rx="9" ry="4" fill="${dark}"/>
  <rect x="6" y="16" width="48" height="44" rx="20" fill="${col}"/><rect x="12" y="20" width="22" height="10" rx="5" fill="#fff" opacity=".25"/>
  ${kind === 0 ? '<path d="M30 16 Q33 2 48 3 Q42 14 30 16Z" fill="#4fbf4a" stroke="#2f8a2b" stroke-width="1.5"/>' : `<path d="M30 16 Q27 8 22 4" stroke="${dark}" stroke-width="3" fill="none"/><circle cx="22" cy="4" r="4" fill="#ffd23f"/>`}
  <ellipse cx="25" cy="34" rx="5" ry="6" fill="#fff"/><ellipse cx="39" cy="34" rx="5" ry="6" fill="#fff"/><circle cx="27" cy="35" r="3" fill="#222"/><circle cx="41" cy="35" r="3" fill="#222"/>
  <path d="M28 44 Q32 48 36 44" stroke="#3a2418" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
export const matesCardArt = () => `<div class="art-mates">${buddy(COLOURS[0], '#c4561a', 0)}${buddy(COLOURS[1], '#1f63b8', 1, true)}</div>`;

// Draws a small picture of a game's first level (or an endless game's start) for its hub card.
function paintThumb(game, canvas) {
  const w = canvas.clientWidth || 132, h = canvas.clientHeight || 84, dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = w * dpr; canvas.height = h * dpr;
  const g = canvas.getContext('2d'); g.scale(dpr, dpr);
  try {
    const level = game.thumbLevel ? game.thumbLevel() : isEndless(game) ? game.endless.gen(7) : game.levels[0];
    const world = makeWorld(level, game, { seed: 7 });
    const cam = new Cam(); cam.resize(w, h, world);
    const [a, b] = world.players, cx = (a.x + b.x) / 2 + 0.4, cy = (a.y + b.y) / 2;
    cam.s = Math.max(9, Math.min(w / world.W, h / world.H, 14));
    if (w / cam.s >= world.W) cam.x = (world.W - w / cam.s) / 2; else cam.x = Math.max(0, Math.min(world.W - w / cam.s, cx - w / cam.s / 2));
    if (h / cam.s >= world.H) cam.y = (world.H - h / cam.s) / 2; else cam.y = Math.max(0, Math.min(world.H - h / cam.s, cy - h / cam.s * 0.55));
    cam.ready = true;
    world.game.thumbSetup?.(world);
    render(g, world, cam, new Parts(), 0.4);
  } catch (e) {
    g.fillStyle = '#9fd8ff'; g.fillRect(0, 0, w, h);
    console.warn('Jump Mates thumbnail', game.id, e);
  }
}

// ---------- Hub ----------
export function matesHubScreen(app) {
  const root = el(`<section class="screen mates-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">Jump Mates</div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  function padLine() {
    let n = 0; try { n = [...(navigator.getGamepads?.() || [])].filter((g) => g && g.connected).length; } catch { /* fine */ }
    return n ? `${n === 1 ? 'One controller' : `${n} controllers`} connected` : 'Connect a game controller, or play with the buttons on screen';
  }
  function render() {
    body.innerHTML = `<div class="mates-hero">${matesCardArt()}</div>
      <p class="mates-pads-line" data-el="pads">${esc(padLine())}</p>
      <div class="mates-list">${MATES_GAMES.map((gm, i) => `
        <button class="mates-card" data-g="${gm.id}">
          <canvas class="mates-thumb" data-thumb="${gm.id}"></canvas>
          <div class="mates-info"><b>${i + 1}. ${esc(gm.name)}</b><span>${esc(gm.blurb)}</span><em>${esc(progressLine(gm))}</em></div>
        </button>`).join('')}</div>
      <p class="mates-credit">Pip, Bo and every level are drawn by the app.</p>`;
    // thumbnails a few at a time, so the list appears straight away
    const cs = $$('[data-thumb]', body); let k = 0;
    const next = () => { if (!root.isConnected && k) return; for (let n = 0; n < 4 && k < cs.length; n++, k++) paintThumb(byId(cs[k].dataset.thumb), cs[k]); if (k < cs.length) requestAnimationFrame(next); };
    requestAnimationFrame(next);
  }
  const onPad = () => { const p = $('[data-el="pads"]', body); if (p) p.textContent = padLine(); };
  window.addEventListener('gamepadconnected', onPad); window.addEventListener('gamepaddisconnected', onPad);
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return matesHelp();
    const c = e.target.closest('[data-g]');
    if (c) { const gm = byId(c.dataset.g); app.go('matesgame', { id: gm.id, level: firstOpen(gm) }); }
  });
  render();
  return { root, refresh: render, destroy() { window.removeEventListener('gamepadconnected', onPad); window.removeEventListener('gamepaddisconnected', onPad); } };
}

// ---------- Playing ----------
const ARROW = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d === 'l' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg>`;
const JUMP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14l6-6 6 6"/><path d="M6 19h12"/></svg>';
// Both players get the same layout on their half: left thumb moves, right thumb has the action and jump buttons.
function padHTML(p, game) {
  const act = game.noAct ? '' : `<button class="mp-b act" data-mk="a" aria-label="${esc(game.actLabel || 'Action')}"><span>${esc(game.actLabel || 'Action')}</span></button>`;
  return `<div class="mp-pad p${p}" data-mp="${p}">
    <div class="mp-tag"><i></i>${NAMES[p]}</div>
    <div class="mp-row"><button class="mp-b mv" data-mk="l" aria-label="Left">${ARROW('l')}</button><button class="mp-b mv" data-mk="r" aria-label="Right">${ARROW('r')}</button>
      <span class="mp-gap"></span>${act}<button class="mp-b jump" data-mk="j" aria-label="Jump">${JUMP}</button></div>
    <div class="mp-padnote">${PADICON}${NAMES[p]} is on a controller</div></div>`;
}

export function matesGameScreen(app, { id, level = 0 }) {
  const game = byId(id);
  const endless = isEndless(game);
  const root = el(`<section class="screen mates-theme mates-play">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title" data-el="title"></div>
      ${endless ? '' : `<button class="icon-btn" data-act="levels" aria-label="Levels">${icon.grid}</button>`}
      <button class="icon-btn" data-act="pause" aria-label="Pause">${icon.pause}</button></header>
    <div class="mates-stage" data-el="stage">
      <canvas data-el="cv"></canvas>
      <div class="mates-hud"><span data-el="l"></span><span data-el="c"></span><span data-el="r"></span></div>
      <div class="mates-banner" data-el="banner"></div>
    </div>
    <div class="mates-pads">${padHTML(0, game)}${padHTML(1, game)}</div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const cv = q('cv'), stage = q('stage'), g = cv.getContext('2d');
  const input = createInput(root, { swap: () => !!M().padSwap });
  const menu = menuPad();
  const cam = new Cam(), parts = new Parts();
  let world = null, idx = level, raf = 0, last = 0, alive = true, paused = false, acc = 0, t = 0, overlay = null, bannerT = 0, seed = 0;

  input.onPads((has, n) => {
    root.classList.toggle('pad0', has[0]); root.classList.toggle('pad1', has[1]);
    if (world) requestAnimationFrame(resize);
    if (n) toast(has[0] && has[1] ? 'Controllers: one each' : has[0] ? `Controller: ${NAMES[0]} (player 1)` : `Controller: ${NAMES[1]} (player 2)`);
  });

  function banner(text, sec = 2.2) { const b = q('banner'); b.textContent = text; b.classList.toggle('show', !!text); bannerT = text ? sec : 0; }
  function hud() {
    if (!world) return;
    const custom = game.hud?.(world) || {};
    const coins = world.coinsTotal || world.gemsTotal ? `● ${world.coins}/${world.coinsTotal}${world.gemsTotal ? `  ◆ ${world.gems}/${world.gemsTotal}` : ''}` : '';
    const L = custom.left ?? (endless ? '' : coins), C = custom.center ?? '', R = custom.right ?? (endless ? '' : fmtT(world.t));
    if (L !== hud.l) { q('l').textContent = L; q('l').hidden = !L; hud.l = L; }
    if (C !== hud.c) { q('c').textContent = C; q('c').hidden = !C; hud.c = C; }
    if (R !== hud.r) { q('r').textContent = R; q('r').hidden = !R; hud.r = R; }
  }
  function title() { q('title').textContent = endless ? game.name : `${game.name} · ${idx + 1}`; }

  function start() {
    closeOverlay();
    seed = (Math.random() * 1e9) | 0;
    const lv = endless ? game.endless.gen(seed) : game.levels[idx];
    world = makeWorld(lv, game, { seed });
    parts.list = []; parts.texts = [];
    hud.l = hud.c = hud.r = null;
    cam.resize(cam.W || 1, cam.H || 1, world); cam.ready = false;
    resize();
    title(); hud();
    banner(endless ? game.name : lv.name ? lv.name : `Level ${idx + 1}`, 1.6);
    if (lv.tip) setTimeout(() => { if (world && world.level === lv && world.t < 3) banner(lv.tip, 3.2); }, 1700);
    M().played[game.id] = (M().played[game.id] || 0) + 1; save();
  }

  function resize() {
    const r = stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!r.width || !r.height) return;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    cam.resize(r.width, r.height, world);
  }

  function sounds(e) {
    switch (e.k) {
      case 'jump': snd.tick(); break;
      case 'coin': snd.ding((world.coins % 6)); buzz(4); break;
      case 'gem': snd.ding(6); setTimeout(() => snd.ding(9), 90); buzz(8); break;
      case 'die': snd.fail(); buzz([30, 40, 30]); break;
      case 'boing': snd.boing(1.2); break;
      case 'stomp': snd.thud(); buzz(10); break;
      case 'key': snd.pop(); break;
      case 'unlock': snd.whack(0.6); buzz(10); break;
      case 'plate': case 'lever': snd.tick(); break;
      case 'gateOpen': case 'gateShut': snd.thud(); break;
      case 'flag': snd.ding(3); break;
      case 'push': break;
      case 'land': break;
      case 'warp': snd.swoosh(); break;
      default: game.sound?.(e, snd);
    }
  }

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(1 / 20, Math.max(0, (now - last) / 1000)); last = now;
    if (overlay || paused) { pollMenu(); return; }
    if (!world) return;
    const inp = input.poll();
    if (inp.pauseP) { pause(); return; }
    world.players.forEach((p, i) => {
      const s = inp.players[i];
      p.in.x = s.x; p.in.up = s.up; p.in.down = s.down; p.in.jump = s.jump; p.in.act = s.act;
      p.in.jumpP ||= s.jumpP; p.in.actP ||= s.actP;
    });
    acc += dt;
    while (acc >= STEP) { world.step(STEP); acc -= STEP; }
    t += dt;
    for (const e of world.ev) { eventFx(parts, e, world); sounds(e); }
    world.ev.length = 0;
    parts.update(dt);
    cam.update(world, dt);
    g.save(); render(g, world, cam, parts, t); g.restore();
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner(''); }
    hud();
    // a short pause on the finished level before the result card
    if ((world.won || world.over) && !overlay) {
      overlay = 'pending';
      const w = world;
      setTimeout(() => { if (alive && world === w && overlay === 'pending') { if (w.won) levelDone(); else endlessDone(w.over); } }, w.won ? 600 : 900);
    }
  }

  // Controllers can drive the result card and pause menu: A picks the highlighted button, up/down moves, B backs out.
  function pollMenu() {
    const m = menu();
    if (!m.a && !m.b && !m.start && !m.up && !m.down) return;
    const top = document.getElementById('overlay-root').lastElementChild;
    const box = top || (overlay && overlay !== 'pending' ? overlay : null);
    if (!box) { if (m.start && paused) resume(); return; }
    const btns = $$('[data-r]:not([disabled]), [data-x]', box);
    if (m.b || (m.start && top)) { if (top) closeTopOverlay(); else btns.find((b) => b.dataset.r === 'back')?.click(); return; }
    if (!btns.length) return;
    let i = btns.findIndex((b) => b.classList.contains('focus'));
    if (i < 0) { i = Math.max(0, btns.findIndex((b) => b.classList.contains('cur'))); btns[i].classList.add('focus'); if (!m.a) return; }
    if (m.down || m.up) { btns[i].classList.remove('focus'); i = (i + (m.down ? 1 : btns.length - 1)) % btns.length; btns[i].classList.add('focus'); btns[i].scrollIntoView?.({ block: 'nearest' }); }
    if (m.a || (m.start && !top)) btns[i].click();
  }

  function closeOverlay() { if (overlay && overlay !== 'pending') overlay.remove(); overlay = null; }
  let lastCard = '';
  function card(html) {
    closeOverlay();
    lastCard = html;
    const node = el(`<div class="mates-result"><div class="box">${html}</div></div>`);
    root.appendChild(node); overlay = node;
    node.addEventListener('click', (e) => { const r = e.target.closest('[data-r]')?.dataset.r; if (r) onResult(r); });
    return node;
  }
  function onResult(r) {
    sfx.tap();
    if (r === 'next') { idx = Math.min(idx + 1, game.levels.length - 1); start(); }
    else if (r === 'again') start();
    else if (r === 'levels') { closeOverlay(); overlay = 'pending'; levels(true); }
    else if (r === 'back') { closeOverlay(); app.back(); }
  }

  function levelDone() {
    const w = world, d = (M().done[game.id] ||= {});
    const s = 1 | (w.coins >= w.coinsTotal && w.gems >= w.gemsTotal ? 2 : 0) | (w.deaths === 0 ? 4 : 0);
    const prev = d[idx] || { s: 0, t: 0 };
    const best = !prev.t || w.t < prev.t;
    d[idx] = { s: prev.s | s, t: best ? Math.round(w.t * 10) / 10 : prev.t };
    save(true);
    snd.cheer(); buzz([20, 40, 20]);
    if (countStars(s) === 3) confetti();
    const last = idx >= game.levels.length - 1;
    const st = (bit, label) => `<div class="st ${s & bit ? 'on' : ''}">${STAR}<small>${label}</small></div>`;
    card(`<div class="mates-faces">${matesCardArt()}</div>
      <h2>${last ? `All ${game.levels.length} levels done` : 'Level complete'}</h2>
      <div class="mates-stars">${st(1, 'Finished')}${st(2, w.coinsTotal || w.gemsTotal ? 'Every coin' : 'No coins here')}${st(4, w.deaths ? `${w.deaths} ${w.deaths === 1 ? 'fall' : 'falls'}` : 'No falls')}</div>
      <p class="sub">Time ${fmtT(w.t)}${!best && prev.t ? ` · best ${fmtT(prev.t)}` : prev.t && best ? ' · new best' : ''}</p>
      <div class="stack">
        ${last ? '' : '<button class="btn mates-btn" data-r="next">Next level</button>'}
        <button class="btn ${last ? 'mates-btn' : 'secondary'}" data-r="again">Play again</button>
        <button class="btn ghost" data-r="levels">Levels</button>
      </div>`);
  }
  function endlessDone({ score, line }) {
    score = Math.max(0, Math.round(score));
    const prev = M().best[game.id] || 0, isBest = score > prev;
    if (isBest) M().best[game.id] = score;
    save(true);
    if (isBest && score > 0) { snd.cheer(); confetti(); buzz([30, 50, 30]); } else sfx.tap();
    card(`${isBest && score > 0 ? '<div class="badge">New best</div>' : ''}<div class="mates-faces">${matesCardArt()}</div>
      <div class="big">${esc(fmtScore(game, score))}</div>
      ${line ? `<p>${esc(line)}</p>` : ''}
      <p class="sub">${prev ? (isBest ? `Previous best ${esc(fmtScore(game, prev))}` : `Best ${esc(fmtScore(game, prev))}`) : 'First score on the board'}</p>
      <div class="stack"><button class="btn mates-btn" data-r="again">Play again</button><button class="btn ghost" data-r="back">Back</button></div>`);
  }

  function levels(fromResult = false) {
    paused = true;
    sheet(`<div class="mates-sheet"><h2>${esc(game.name)}</h2><div class="mates-levels">${game.levels.map((lv, i) => {
      const s = starsOf(game.id, i), open = unlocked(game, i);
      return `<button class="lv ${M().done[game.id]?.[i] ? 'done' : ''} ${i === idx ? 'cur' : ''}" data-r="lv${i}" ${open ? '' : 'disabled'}><b>${i + 1}</b><i>${[1, 2, 4].map((b) => `<span class="${s & b ? 'on' : ''}"></span>`).join('')}</i></button>`;
    }).join('')}</div></div>`, {
      onMount(node, close) {
        node.addEventListener('click', (e) => { const b = e.target.closest('[data-r^="lv"]'); if (!b || b.disabled) return; idx = +b.dataset.r.slice(2); close(); start(); });
      },
      // dismissed from the result card: bring the card back
      onClose() { paused = false; last = performance.now(); if (fromResult && overlay === 'pending' && world?.won) card(lastCard); },
    });
  }

  function pause() {
    if (paused) return;
    paused = true;
    const one = (() => { try { return [...(navigator.getGamepads?.() || [])].filter((x) => x && x.connected).length === 1; } catch { return false; } })();
    sheet(`<div class="mates-sheet"><h2>Paused</h2>
      <button class="sheet-item" data-r="resume">Carry on</button>
      <button class="sheet-item" data-r="restart">${endless ? 'Start again' : 'Restart level'}</button>
      ${endless ? '' : '<button class="sheet-item" data-r="levelsP">Choose a level</button>'}
      ${one ? `<button class="sheet-item" data-r="swap">Give the controller to ${M().padSwap ? `${NAMES[0]} (player 1)` : `${NAMES[1]} (player 2)`}</button>` : ''}
      <button class="sheet-item" data-r="how">How to play</button>
      <button class="sheet-item" data-r="quit">Leave the game</button></div>`, {
      onMount(node, close) {
        node.addEventListener('click', (e) => {
          const r = e.target.closest('[data-r]')?.dataset.r; if (!r) return;
          close();
          if (r === 'restart') start();
          else if (r === 'levelsP') setTimeout(() => levels(), 0);
          else if (r === 'swap') { M().padSwap = !M().padSwap; save(); }
          else if (r === 'how') { paused = true; matesHelp(game).then(resume); }
          else if (r === 'quit') app.back();
        });
      },
      onClose() { setTimeout(() => { if (!document.querySelector('#overlay-root .backdrop')) resume(); }, 0); },
    });
  }
  function resume() { paused = false; last = performance.now(); acc = 0; }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'pause') pause();
    else if (a === 'levels') levels();
  });
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  const onVis = () => { if (document.hidden && !overlay && !paused && world) pause(); };
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(() => resize());
  ro.observe(stage);

  native.padCapture(true);
  (async () => {
    resize();
    start();
    if (!M().seen[game.id]) { M().seen[game.id] = true; save(); paused = true; await matesHelp(game); resume(); }
    last = performance.now();
    raf = requestAnimationFrame(frame);
  })();
  return {
    root,
    destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); input.destroy(); native.padCapture(false); document.removeEventListener('visibilitychange', onVis); },
    onHide() { paused = true; native.padCapture(false); },
    onShow() { native.padCapture(true); resume(); },
  };
}

const PADICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8h10a4 4 0 0 1 4 4.5l-.6 3.6a2.4 2.4 0 0 1-4.2 1.1L14.6 15H9.4l-1.6 2.2a2.4 2.4 0 0 1-4.2-1.1L3 12.5A4 4 0 0 1 7 8z"/><path d="M7.5 11v3M6 12.5h3"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"/></svg>';
const fmtT = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${String(r).padStart(2, '0')}`; };
export { LEVEL_COUNT };
