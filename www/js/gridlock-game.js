// Gridlock: slide the cars and trucks around the car park until the red car can drive out.
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet, levelHome } from './kit.js';
import { parse, range, grid, solve, isGoal, N } from './gridlock-engine.js';

const GL = () => store.gridlock;
const CARS = 'img/kenney/cars/';
let levels = null;
async function loadLevels() {
  if (!levels) {
    try { levels = (await (await fetch('levels/gridlock.json')).json()).levels.map((s) => ({ board: s.slice(0, 36), opt: +s.slice(36) })); } catch { levels = []; }
  }
  return levels;
}

export const gridlockHelp = () => helpSheet('How to play Gridlock', [
  'The red car is boxed in. Clear a path so it can drive out of the exit on the right.',
  'Drag any car or truck to slide it. Vehicles only move forwards and backwards, never sideways, and they cannot pass through each other.',
  'Each slide counts as one move, however far it goes. Finish in the target number of moves for three stars.',
  'Stuck? Hint shows the best next move from where you are.',
], 'gl-btn');

// Stars for a finish: 3 at the target, 2 for a little over, 1 for any escape.
export function starsFor(moves, opt) {
  if (!moves) return 0;
  if (moves <= opt) return 3;
  return moves <= opt + Math.max(3, Math.round(opt * 0.3)) ? 2 : 1;
}
const starSvg = (on) => `<svg class="gl-star ${on ? 'on' : ''}" viewBox="0 0 24 24"><path d="M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>`;
const starRow = (n) => [1, 2, 3].map((k) => starSvg(k <= n)).join('');

// ---------- Vehicle art ----------
// Kenney cars point up; trucks are drawn here in the same flat style (cab plus trailer).
const PAINT = {
  blue: ['#2f95d0', '#298dc6', '#16628e'], green: ['#39c272', '#30b668', '#14773d'],
  yellow: ['#ffcc00', '#e5ba10', '#9f800a'], black: ['#5d5b5b', '#4f4c4c', '#3a3535'],
};
const TRUCKS = [['blue', 'white'], ['green', 'green'], ['yellow', 'yellow'], ['black', 'white'], ['blue', 'blue'], ['yellow', 'black']];
function truckSvg(cab, box) {
  const [m, s, d] = PAINT[cab];
  const [tm, ts, td] = box === 'white' ? ['#eeeeee', '#d9d9d9', '#9aa0a6'] : PAINT[box];
  let ribs = '';
  for (let y = 68; y < 180; y += 14) ribs += `<rect x="4" y="${y}" width="52" height="3" fill="${ts}"/>`;
  return `<svg viewBox="0 0 60 190" preserveAspectRatio="none" aria-hidden="true">
    <rect x="0" y="17" width="5" height="9" rx="2" fill="${d}"/><rect x="55" y="17" width="5" height="9" rx="2" fill="${d}"/>
    <rect x="3" y="1" width="54" height="47" rx="13" fill="${d}"/><rect x="6" y="4" width="48" height="41" rx="10" fill="${m}"/>
    <rect x="10" y="14" width="40" height="12" rx="3" fill="#eeeeee"/><rect x="10" y="14" width="40" height="4" rx="2" fill="#fff"/>
    <rect x="12" y="30" width="36" height="11" rx="3" fill="${s}"/>
    <rect x="23" y="46" width="14" height="9" fill="#3a3535"/>
    <rect x="1" y="52" width="58" height="137" rx="6" fill="${td}"/><rect x="4" y="55" width="52" height="131" rx="4" fill="${tm}"/>
    ${ribs}<rect x="9" y="59" width="5" height="123" rx="2" fill="#fff" opacity=".3"/>
  </svg>`;
}

// Deterministic paint and facing per vehicle so a level always looks the same.
function looks(v, i, idx) {
  const h = (idx * 31 + i * 17 + v.id.charCodeAt(0) * 7) >>> 0;
  if (i === 0) return { art: `<img src="${CARS}car_red_1.png" alt="">`, turn: 90 };
  const turn = v.h ? (h % 2 ? 90 : -90) : (h % 3 ? 0 : 180);
  if (v.len === 3) { const [c, b] = TRUCKS[h % TRUCKS.length]; return { art: truckSvg(c, b), turn }; }
  const colour = ['blue', 'green', 'yellow', 'black'][(h >> 2) % 4];
  return { art: `<img src="${CARS}car_${colour}_${1 + ((h >> 4) % 5)}.png" alt="">`, turn };
}

// Small car park for the picker card and the home screen.
export function gridlockCardArt(cls = 'art-gridlock') {
  return `<div class="${cls} gl-mini">
    <div class="glm-lot"><i class="glm-red"><img src="${CARS}car_red_1.png" alt=""></i>
      <i class="glm-truck">${truckSvg('yellow', 'yellow')}</i>
      <i class="glm-blue"><img src="${CARS}car_blue_2.png" alt=""></i></div>
    <img class="glm-arrow" src="${CARS}arrow_yellow.png" alt=""></div>`;
}

// ---------- Home ----------
export function gridlockHomeScreen(app) {
  const gl = GL();
  const cur = () => Math.min(gl.level, Math.max(0, levels.length - 1));
  return levelHome({
    app, cls: 'gridlock-theme', title: 'Gridlock', help: gridlockHelp, load: loadLevels,
    hero: gridlockCardArt('gl-hero'),
    play: () => (levels.length ? { label: gl.current ? `Continue level ${gl.current.idx + 1}` : `Play level ${cur() + 1}`, sub: `Target ${levels[gl.current ? gl.current.idx : cur()].opt} moves` } : { label: 'Play' }),
    onPlay: () => levels.length && app.go('gridlockgame', { idx: gl.current ? gl.current.idx : cur() }),
    levels: () => ({
      count: levels.length, current: cur(), done: (i) => gl.best[i] != null,
      label: (i) => `${i + 1}${gl.best[i] != null ? `<span class="gl-lvstars">${starRow(starsFor(gl.best[i], levels[i].opt))}</span>` : ''}`,
    }),
    onLevel: (i) => app.go('gridlockgame', { idx: i }),
  });
}

// ---------- Game ----------
export function gridlockGameScreen(app, { idx }) {
  const gl = GL();
  const root = el(`<section class="screen gridlock-theme gl-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">Level ${idx + 1}</div><button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="gl-wrap"><div class="gl-stats">
      <div class="gl-stat"><span>Moves</span><b data-el="moves">0</b></div>
      <div class="gl-stat target"><span>Target</span><b data-el="opt">-</b></div>
      <div class="gl-stat"><span>Best</span><b data-el="best">-</b></div>
    </div>
    <div class="gl-meter" data-el="meter"></div>
    <div class="gl-board" data-el="board">
      <img class="gl-deco tyres" src="${CARS}tires_red.png" alt=""><img class="gl-deco tyres2" src="${CARS}tires_white.png" alt="">
      <img class="gl-deco cone c1" src="${CARS}cone_straight.png" alt=""><img class="gl-deco cone c2" src="${CARS}cone_straight.png" alt="">
      <img class="gl-deco barrel" src="${CARS}barrel_red.png" alt="">
      <div class="gl-exit"><img src="${CARS}arrow_yellow.png" alt=""></div>
      <div class="gl-lot" data-el="lot"></div>
    </div></div>
    <div class="gl-bar">
      <button class="gl-tool" data-act="undo" aria-label="Undo"><span class="ic">${icon.undo}</span>Undo</button>
      <button class="gl-tool" data-act="restart" aria-label="Restart"><span class="ic">${icon.restart}</span>Restart</button>
      <button class="gl-tool hint" data-act="hint" aria-label="Hint"><span class="ic">${icon.bulb}</span>Hint</button>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const lot = q('lot');
  let L, vs, pos, history = [], moves = 0, cell = 56, busy = false, done = false, plan = null, carEls = [];

  function persist() { gl.current = done || !moves ? null : { idx, board: L.board, pos: pos.slice(), moves, history }; save(); }

  function layout() {
    const w = Math.min(innerWidth, 560) - 20 - 26 - 22; // margins, kerb, exit lane
    const h = innerHeight - 56 - 120 - 120;
    cell = Math.max(36, Math.floor(Math.min(w, h, 80 * N) / N));
    root.style.setProperty('--gc', cell + 'px');
    carEls.forEach((c, i) => place(i, pos[i], false));
  }

  function build() {
    lot.innerHTML = '';
    carEls = vs.map((v, i) => {
      const { art, turn } = looks(v, i, idx);
      const c = el(`<div class="gl-car ${i === 0 ? 'red' : ''} ${v.len === 3 ? 'truck' : ''} ${v.h ? 'across' : 'down'}" data-v="${i}" style="--len:${v.len};--turn:${turn}deg"><div class="gl-sprite">${art}</div></div>`);
      lot.appendChild(c);
      return c;
    });
    layout();
  }

  // Put vehicle i at position p (in cells, may be fractional while dragging).
  function place(i, p, animate = true, ms = 160) {
    const v = vs[i], c = carEls[i];
    c.style.transition = animate ? `transform ${ms}ms cubic-bezier(.25,.9,.35,1.15)` : 'none';
    const x = (v.h ? p : v.line) * cell, y = (v.h ? v.line : p) * cell;
    c.style.transform = `translate(${x}px,${y}px)`;
  }

  function render() {
    q('moves').textContent = moves;
    q('opt').textContent = L.opt;
    q('best').textContent = gl.best[idx] ?? '-';
    // live stars: what you would get if you finished on the next move
    q('meter').innerHTML = starRow(done ? starsFor(moves, L.opt) : starsFor(moves + 1, L.opt));
    $('[data-act="undo"]', root).disabled = !history.length || done;
  }

  function commit(i, from, to) {
    if (from === to) return;
    history.push([i, from]);
    moves++;
    if (!plan || plan[0][0] !== i || plan[0][1] !== to) plan = null; else plan.shift();
    render(); persist();
    if (isGoal(pos)) win();
  }

  // ---------- Dragging ----------
  let drag = null;
  lot.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.gl-car');
    if (!c || busy || done || drag) return;
    const i = +c.dataset.v, v = vs[i];
    const [lo, hi] = range(vs, pos, i, grid(vs, pos));
    drag = { i, lo, hi, start: v.h ? e.clientX : e.clientY, from: pos[i], at: pos[i], edge: false, id: e.pointerId };
    try { c.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    c.classList.add('lift');
    sfx.tap();
  });
  lot.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const v = vs[drag.i];
    const raw = drag.from + ((v.h ? e.clientX : e.clientY) - drag.start) / cell;
    const p = Math.max(drag.lo, Math.min(drag.hi, raw));
    // a tiny bump when a vehicle runs into something
    const atEdge = p !== raw && Math.abs(p - raw) > 0.05;
    if (atEdge && !drag.edge) buzz(6);
    drag.edge = atEdge;
    drag.at = p;
    place(drag.i, p, false);
  });
  const release = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { i, from } = drag;
    carEls[i].classList.remove('lift');
    const to = Math.round(drag.at);
    drag = null;
    pos[i] = to;
    place(i, to);
    if (to !== from) sfx.place();
    commit(i, from, to);
  };
  lot.addEventListener('pointerup', release);
  lot.addEventListener('pointercancel', release);

  // ---------- Hint, undo, restart ----------
  async function hint() {
    if (busy || done) return;
    if (!plan) {
      busy = true;
      await new Promise((r) => setTimeout(r, 20));
      plan = solve(vs, pos);
      busy = false;
    }
    if (!plan || !plan.length) { toast('No way out from here. Try Restart.'); return; }
    const [i, to] = plan[0];
    busy = true;
    sfx.hint();
    const c = carEls[i];
    c.classList.add('hinted');
    await new Promise((r) => setTimeout(r, 450));
    const from = pos[i];
    pos[i] = to;
    place(i, to, true, 420);
    await new Promise((r) => setTimeout(r, 430));
    c.classList.remove('hinted');
    busy = false;
    commit(i, from, to);
  }

  function undo() {
    if (busy || done || !history.length) return;
    const [i, from] = history.pop();
    pos[i] = from; moves--; plan = null;
    place(i, from);
    sfx.erase(); render(); persist();
  }

  function restart() {
    if (busy || done) return;
    ({ pos } = parse(L.board));
    history = []; moves = 0; plan = null;
    carEls.forEach((_, i) => place(i, pos[i], true, 300));
    sfx.erase(); render(); persist();
  }

  // ---------- Win ----------
  async function win() {
    done = true; busy = true;
    const prevBest = gl.best[idx];
    if (prevBest == null || moves < prevBest) gl.best[idx] = moves;
    if (idx >= gl.level) gl.level = Math.min(idx + 1, levels.length - 1);
    persist(); save(true);
    render();
    // the red car pulls away through the exit
    const red = carEls[0];
    red.classList.add('driving');
    red.style.transition = 'transform .75s cubic-bezier(.55,0,.9,.45)';
    red.style.transform = `translate(${(N + 3) * cell}px,${vs[0].line * cell}px)`;
    sfx.unit(); buzz(20);
    await new Promise((r) => setTimeout(r, 750));
    sfx.win(); confetti();
    await new Promise((r) => setTimeout(r, 350));
    const stars = starsFor(moves, L.opt);
    const last = idx + 1 >= levels.length;
    const p = dialog({
      hero: 'img/art/ui/trophy.svg', dismissible: false,
      title: stars === 3 ? (moves < L.opt ? 'Better than the target!' : 'Perfect parking!') : stars === 2 ? 'Nicely done!' : 'You got out!',
      text: `Level ${idx + 1} in ${moves} moves. Target ${L.opt}.${prevBest != null && moves < prevBest ? ' New best.' : ''}`,
      buttons: [...(last ? [] : [{ label: 'Next level', value: 'next' }]), { label: 'Play again', value: 'again', cls: 'secondary' }, { label: 'Back', value: 'back', cls: 'ghost' }],
    });
    // stars under the title (the dialog is already in the page)
    const h = $$('#overlay-root .dialog h2').pop();
    if (h) h.insertAdjacentHTML('afterend', `<div class="gl-winstars">${starRow(stars)}</div>`);
    const v = await p;
    if (v === 'next') app.replace('gridlockgame', { idx: idx + 1 });
    else if (v === 'again') app.replace('gridlockgame', { idx });
    else app.back();
  }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') gridlockHelp();
    else if (a === 'undo') undo();
    else if (a === 'restart') restart();
    else if (a === 'hint') hint();
  });
  addEventListener('resize', layout);

  (async () => {
    await loadLevels();
    L = levels[idx];
    if (!L) { app.back(); return; }
    ({ vs, pos } = parse(L.board));
    const cur = gl.current && gl.current.idx === idx ? gl.current : null;
    if (cur && cur.board === L.board) { pos = cur.pos.slice(); moves = cur.moves; history = cur.history || []; }
    build(); render();
    if (!gl.seenHelp) { gl.seenHelp = true; save(); setTimeout(gridlockHelp, 300); }
  })();

  return { root, destroy() { removeEventListener('resize', layout); } };
}
