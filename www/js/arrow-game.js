// Arrow Away: tap the arrows to send them off the board. An arrow only gets out if nothing is in its way.
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet, levelHome } from './kit.js';
import { makeLevel, levelShape, canExit, occupancy, isSolved, hint, DIRS } from './arrow-engine.js';

const AB = () => store.arrow;
const HEARTS = 3, HINTS = 3, SPEED = 18; // cells per second
export const arrowHelp = () => helpSheet('How to play Arrow Away', [
  'Tap an arrow to send it off the board. It slides out in the direction its head points, and its tail follows the same path.',
  'An arrow can only leave if nothing is in front of it. If another arrow is in the way, it bumps into it and comes back, and you lose a heart.',
  'You have 3 hearts for each level. Clear every arrow to finish the level.',
  'Stuck? The hint button shows an arrow that can leave right now. You get 3 hints per level.',
], 'arrow-btn');

const levelCache = new Map();
function level(i) {
  if (!levelCache.has(i)) { levelCache.set(i, makeLevel(i)); if (levelCache.size > 6) levelCache.delete(levelCache.keys().next().value); }
  return levelCache.get(i);
}

// ---------- Drawing ----------
const pt = (k, w) => [k % w + 0.5, Math.floor(k / w) + 0.5];
const fmt = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
const HEAD = 'M0.36,0L-0.14,-0.3L-0.06,0L-0.14,0.3Z';
const ANG = [-90, 0, 90, 180];

// The track an arrow follows: its own cell centres from tail to head, then straight on for `extra` cells.
function track(a, w, extra) {
  const pts = a.cells.map((k) => pt(k, w)), [dx, dy] = DIRS[a.dir], h = pts[pts.length - 1];
  for (let s = 1; s <= extra; s++) pts.push([h[0] + dx * s, h[1] + dy * s]);
  return pts;
}
// Points are one unit apart, so the piece of track from s to s + len is easy to cut out.
function cut(pts, s, len) {
  const at = (u) => { const i = Math.min(pts.length - 2, Math.max(0, Math.floor(u))), f = u - i; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]; };
  const out = [at(s)];
  for (let i = Math.floor(s) + 1; i < s + len; i++) out.push(pts[i]);
  out.push(at(s + len));
  return out;
}
function arrowSVG(a, id, w, cls = '') {
  const pts = a.cells.map((k) => pt(k, w)), h = pts[pts.length - 1];
  return `<g class="ar c${a.c} ${cls}" data-id="${id}"><polyline points="${pts.map(fmt).join(' ')}"/><path d="${HEAD}" transform="translate(${fmt(h)}) rotate(${ANG[a.dir]})"/></g>`;
}

// Card and home art: a few winding arrows on a dot grid.
function miniArt(cls) {
  const w = 5, h = 4;
  const arrows = [{ cells: [15, 10, 5, 6, 7], dir: 1, c: 0 }, { cells: [16, 17, 18, 13, 8], dir: 0, c: 1 }, { cells: [12, 11], dir: 3, c: 3 },
    { cells: [19, 14, 9, 4], dir: 0, c: 2 }, { cells: [3, 2, 1, 0], dir: 3, c: 4 }];
  const dots = [...Array(w * h).keys()].map((k) => `<circle cx="${k % w + 0.5}" cy="${Math.floor(k / w) + 0.5}" r="0.07"/>`).join('');
  return `<svg class="${cls}" viewBox="-0.2 -0.2 ${w + 0.4} ${h + 0.4}" aria-hidden="true"><g class="ar-dots">${dots}</g>${arrows.map((a, i) => arrowSVG(a, i, w)).join('')}</svg>`;
}
export const arrowCardArt = () => `<div class="art-arrow">${miniArt('ar-mini')}</div>`;

// ---------- Home ----------
export function arrowHomeScreen(app) {
  return levelHome({
    app, cls: 'arrow-theme', title: 'Arrow Away', help: arrowHelp,
    hero: `<div class="ar-hero">${miniArt('ar-mini')}</div>`,
    play: () => { const s = levelShape(AB().level); return { label: `Play level ${AB().level + 1}`, sub: `${s.w} × ${s.h} grid` }; },
    onPlay: () => app.go('arrowgame', { idx: AB().level }),
    levels: () => ({ count: Math.max(30, Math.ceil((AB().level + 15) / 5) * 5), current: AB().level, done: (i) => i < AB().level }),
    onLevel: (i) => app.go('arrowgame', { idx: i }),
  });
}

// ---------- Game ----------
const heartSVG = (on) => `<svg class="ar-heart ${on ? '' : 'lost'}" viewBox="0 0 24 24"><path d="M12 21C5 15.5 2 12.3 2 8.4 2 5.4 4.4 3 7.3 3c1.9 0 3.6 1 4.7 2.6C13.1 4 14.8 3 16.7 3 19.6 3 22 5.4 22 8.4c0 3.9-3 7.1-10 12.6z"/></svg>`;

export function arrowGameScreen(app, { idx }) {
  const ab = AB();
  const L = level(idx), { w, h, mask, arrows } = L;
  let removed = arrows.map(() => false), hearts = HEARTS, hints = HINTS, done = false, alive = true;
  const moving = new Set(); // arrows currently sliding
  const cur = ab.current && ab.current.idx === idx ? ab.current : null;
  if (cur && cur.removed?.length === arrows.length) { removed = cur.removed.slice(); hearts = cur.hearts; hints = cur.hints; }

  const root = el(`<section class="screen arrow-theme arrow-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">Level ${idx + 1}</div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="ar-info"><span class="ar-hearts" data-el="hearts"></span><span data-el="left"></span></div>
    <div class="ar-wrap" data-el="wrap"><svg class="ar-board" data-el="board" viewBox="-0.15 -0.15 ${w + 0.3} ${h + 0.3}"></svg></div>
    <div class="ar-bar">
      <button class="ar-tool" data-act="hint"><span class="ar-round">${icon.bulb}<b data-el="hints"></b></span>Hint</button>
      <button class="ar-tool" data-act="restart"><span class="ar-round">${icon.restart}</span>Restart</button>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const board = q('board'), wrap = q('wrap');

  function persist() { if (!done) { ab.current = { idx, removed, hearts, hints }; save(); } }

  function render() {
    const dots = mask.map((m, k) => (m ? `<circle cx="${k % w + 0.5}" cy="${Math.floor(k / w) + 0.5}" r="0.07"/>` : '')).join('');
    board.innerHTML = `<g class="ar-dots">${dots}</g><g data-el="arrows">${arrows.map((a, id) => (removed[id] ? '' : arrowSVG(a, id, w))).join('')}</g>`;
    hud();
  }
  function hud() {
    q('hearts').innerHTML = [...Array(HEARTS)].map((_, i) => heartSVG(i < hearts)).join('');
    q('left').textContent = `${removed.filter((r) => !r).length} arrows left`;
    q('hints').textContent = hints;
    q('hints').classList.toggle('none', !hints);
  }
  // Keep the board as large as the space allows (the SVG scales, so this only sets its box).
  function fit() {
    const W = wrap.clientWidth - 20, H = wrap.clientHeight - 20;
    const cs = Math.max(8, Math.min(W / (w + 0.3), H / (h + 0.3), 64));
    board.style.width = `${cs * (w + 0.3)}px`; board.style.height = `${cs * (h + 0.3)}px`;
  }

  const gOf = (id) => $(`.ar[data-id="${id}"]`, board);
  function pose(g, pts, s, len) {
    const p = cut(pts, s, len), a = p[p.length - 1], b = p[p.length - 2];
    g.firstElementChild.setAttribute('points', p.map(fmt).join(' '));
    g.lastElementChild.setAttribute('transform', `translate(${fmt(a)}) rotate(${Math.atan2(a[1] - b[1], a[0] - b[0]) * 180 / Math.PI})`);
  }
  function slide(ms, fn) {
    return new Promise((resolve) => {
      const t0 = performance.now(); let end = false;
      const finish = () => { if (end) return; end = true; fn(1); resolve(); };
      const step = (now) => { if (end || !alive) return; const t = Math.min(1, (now - t0) / ms); fn(t); if (t < 1) requestAnimationFrame(step); else finish(); };
      requestAnimationFrame(step);
      setTimeout(finish, ms + 400); // in case animation frames are paused
    });
  }

  async function fire(id) {
    if (done || removed[id] || moving.has(id)) return;
    const a = arrows[id], g = gOf(id), len = a.cells.length - 1;
    g.classList.remove('hint');
    $$hint().forEach((n) => n.classList.remove('hint'));
    const r = canExit(L, removed, id);
    moving.add(id);
    if (r.ok) {
      removed[id] = true; persist(); hud();
      sfx.place(); buzz(8);
      // run until the tail has left the board, plus a little so it clears the edge
      const dist = r.edgeSteps + len + 1, pts = track(a, w, dist + 1);
      g.classList.add('go');
      await slide(Math.max(260, (dist / SPEED) * 1000), (t) => pose(g, pts, dist * t * (0.55 + 0.45 * t), len));
      g.remove(); moving.delete(id);
      if (alive && isSolved(L, removed) && !moving.size) win();
      return;
    }
    // blocked: run up to the blocker, bump it, and come back
    const reach = r.blockSteps - 1 + 0.32, pts = track(a, w, r.blockSteps + 1), bg = gOf(r.blocker);
    await slide(Math.max(140, (reach / SPEED) * 1000), (t) => pose(g, pts, reach * t * t, len));
    if (!alive) return;
    sfx.error();
    g.classList.add('bad'); bg?.classList.remove('bump'); void bg?.getBBox(); bg?.classList.add('bump');
    hearts = Math.max(0, hearts - 1); persist(); hud();
    const hz = q('hearts').children[hearts]; hz?.classList.add('pop');
    await slide(Math.max(160, (reach / SPEED) * 1400), (t) => pose(g, pts, reach * (1 - t), len));
    if (!alive) return;
    pose(g, pts, 0, len);
    setTimeout(() => { g.classList.remove('bad'); bg?.classList.remove('bump'); }, 380);
    moving.delete(id);
    if (!hearts) lose();
  }
  const $$hint = () => [...board.querySelectorAll('.ar.hint')];

  async function lose() {
    if (done) return;
    done = true; ab.current = null; save(true);
    const v = await dialog({
      hero: 'img/art/ui/collision.svg', title: 'Out of hearts', dismissible: false,
      text: 'Arrows bumped into each other three times. Have another go.',
      buttons: [{ label: 'Try again', value: 'again' }, { label: 'Back', value: 'back', cls: 'ghost' }],
    });
    if (v === 'again') app.replace('arrowgame', { idx }); else app.back();
  }

  async function win() {
    done = true;
    if (idx >= ab.level) ab.level = idx + 1;
    ab.current = null; save(true);
    sfx.win(); confetti();
    await new Promise((r) => setTimeout(r, 900));
    if (!alive) return;
    const v = await dialog({
      hero: 'img/art/ui/trophy.svg', title: 'All clear', dismissible: false,
      text: `Level ${idx + 1} done${hearts === HEARTS ? ' without a single bump' : ''}.`,
      buttons: [{ label: 'Next level', value: 'next' }, { label: 'Back', value: 'back', cls: 'ghost' }],
    });
    if (v === 'next') app.replace('arrowgame', { idx: idx + 1 }); else app.back();
  }

  // Map a tap to the nearest arrow cell, so thin lines are easy to hit.
  board.addEventListener('pointerdown', (e) => {
    if (done) return;
    const rc = board.getBoundingClientRect(), u = (w + 0.3) / rc.width;
    const x = (e.clientX - rc.left) * u - 0.15, y = (e.clientY - rc.top) * u - 0.15;
    const occ = occupancy(L, removed);
    let best = -1, bd = 0.8 * 0.8;
    for (let cy = Math.floor(y) - 1; cy <= Math.floor(y) + 1; cy++) {
      for (let cx = Math.floor(x) - 1; cx <= Math.floor(x) + 1; cx++) {
        if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
        const o = occ[cy * w + cx]; if (o < 0) continue;
        const d = (cx + 0.5 - x) ** 2 + (cy + 0.5 - y) ** 2;
        if (d < bd) { bd = d; best = o; }
      }
    }
    if (best >= 0) fire(best);
  });

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') arrowHelp();
    else if (done) return;
    else if (a === 'restart') {
      if (moving.size) return;
      removed = arrows.map(() => false); hearts = HEARTS; hints = HINTS; persist(); render();
    } else if (a === 'hint') {
      if ($$hint().length) return;
      if (!hints) { toast('No hints left for this level'); return; }
      const id = hint(L, removed.map((r, i) => r || moving.has(i)));
      if (id < 0) return;
      hints--; persist(); hud(); sfx.hint();
      gOf(id)?.classList.add('hint');
    }
  });

  const ro = new ResizeObserver(fit);
  render();
  ro.observe(wrap);
  requestAnimationFrame(fit);
  if (!ab.seenHelp) { ab.seenHelp = true; save(); setTimeout(arrowHelp, 350); }
  return { root, destroy() { alive = false; ro.disconnect(); persist(); save(true); } };
}
