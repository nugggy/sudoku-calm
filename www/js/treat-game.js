// Treat Twist: a match-3 game. Swap neighbouring candies to make lines of three or more.
import { mulberry32 } from './sudoku-engine.js';
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, sheet, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';
import { candySvg, CANDY_COLOURS, CANDY_NAMES } from './treat-art.js';

const N = 8, BOMB = 9;
const T = () => store.treat;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { candySvg };

// ---------- Levels ----------
// Every level is built from its number, so it is always the same board and goal.
export function levelSpec(L) {
  const rng = mulberry32(31337 + L * 7919);
  const n = L + 1;
  const kinds = ['score', 'collect', 'jelly'];
  const kind = n <= 2 ? 'score' : kinds[n % 3];
  const types = n < 6 ? 5 : 6;
  const moves = Math.max(14, 26 - Math.floor(n / 6));
  const holes = new Set();
  if (n > 4 && rng() < 0.6) {
    const k = 1 + ((rng() * 2) | 0);
    for (const [r0, c0] of [[0, 0], [0, N - k], [N - k, 0], [N - k, N - k]]) for (let r = 0; r < k; r++) for (let c = 0; c < k; c++) holes.add((r0 + r) * N + c0 + c);
  }
  if (n > 12 && rng() < 0.35) [27, 28, 35, 36].forEach((i) => holes.add(i));
  const spec = { n, kind, types, moves, holes: [...holes], seed: 1000 + L * 13 };
  if (kind === 'score') spec.target = Math.round((2500 + n * 450) / 100) * 100;
  if (kind === 'collect') {
    const a = (rng() * types) | 0, b = (a + 1 + ((rng() * (types - 1)) | 0)) % types;
    const amt = 12 + Math.floor(n * 1.2);
    spec.collect = { [a]: amt, [b]: Math.round(amt * 0.8) };
    spec.target = 1000 + n * 200;
  }
  if (kind === 'jelly') {
    const jelly = [];
    for (let i = 0; i < N * N; i++) if (!holes.has(i) && rng() < Math.min(0.75, 0.3 + n * 0.012)) jelly.push(i);
    spec.jelly = jelly.length ? jelly : [27, 28, 35, 36];
    spec.target = 1000 + n * 200;
  }
  spec.stars = [spec.target, Math.round(spec.target * 1.6), Math.round(spec.target * 2.4)];
  return spec;
}

export function treatHelp() {
  sheet(`<h2>How to play Treat Twist</h2><div class="help-body">
    <p>Swipe a candy to swap it with its neighbour. Line up three or more of the same candy to collect them.</p>
    <p><b>Four in a row</b> makes a striped candy that clears a whole row or column. <b>An L or T shape</b> makes a wrapped candy that bursts. <b>Five in a row</b> makes a sprinkle ball that clears every candy of the kind you swap it with.</p>
    <p>Swap two special candies together for an even bigger effect.</p>
    <p>Reach the level goal before you run out of moves. Moves left over turn into a treat feast of bonus points.</p>
  </div><button class="btn treat-btn" data-x>Let's twist</button>`, { onMount: (n, close) => { $('[data-x]', n).onclick = close; } });
}

function goalText(spec) {
  if (spec.kind === 'score') return `Score ${spec.target.toLocaleString('en-AU')} points`;
  if (spec.kind === 'collect') return 'Collect ' + Object.entries(spec.collect).map(([t, n]) => `${n} ${CANDY_NAMES[t]}`).join(' and ');
  return 'Clear all the jelly';
}

// ---------- Home ----------
export function treatHomeScreen(app) {
  const root = el(`<section class="screen treat-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title"></div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  function render() {
    const t = T(), next = t.level;
    const spec = levelSpec(next);
    const total = Object.values(t.stars).reduce((a, b) => a + b, 0);
    const show = Math.max(30, Math.ceil((next + 15) / 5) * 5);
    body.innerHTML = `
      <div class="treat-hero">${[0, 1, 2, 3, 4, 5].map((k) => `<div class="hero-candy" style="animation-delay:${k * 0.12}s">${candySvg(k)}</div>`).join('')}</div>
      <h1 class="treat-title">Treat Twist</h1>
      <button class="btn treat-btn" data-act="play">Play level ${next + 1}<small>${goalText(spec)}</small></button>
      <div class="treat-total"><img src="img/art/ui/star.svg" alt=""> ${total} stars collected</div>
      <div class="treat-map">${[...Array(show)].map((_, i) => {
        const s = t.stars[i] || 0;
        return `<button class="treat-node ${i < next ? 'done' : ''} ${i === next ? 'current' : ''}" data-idx="${i}" ${i > next ? 'disabled' : ''}><b>${i + 1}</b><span>${'★'.repeat(s)}${'☆'.repeat(i < next ? 3 - s : 0)}</span></button>`;
      }).join('')}</div>`;
    setTimeout(() => $('.treat-node.current', body)?.scrollIntoView({ block: 'center' }), 0);
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return treatHelp();
    if (a === 'play') return app.go('treatgame', { level: T().level });
    const b = e.target.closest('[data-idx]');
    if (b) app.go('treatgame', { level: +b.dataset.idx });
  });
  render();
  return { root, refresh: render };
}

// ---------- Particle effects ----------
function makeFx(canvas) {
  const ctx = canvas.getContext('2d');
  const items = [];
  let running = false, w = 0, h = 0;
  function size(px) {
    const dpr = window.devicePixelRatio || 1;
    w = h = px;
    canvas.width = canvas.height = px * dpr;
    canvas.style.width = canvas.style.height = px + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function loop() {
    ctx.clearRect(0, 0, w, h);
    for (let k = items.length - 1; k >= 0; k--) {
      const p = items[k];
      p.t++;
      const life = p.t / p.life;
      if (life >= 1) { items.splice(k, 1); continue; }
      ctx.globalAlpha = 1 - life;
      if (p.kind === 'spark') {
        p.vy += 0.25; p.x += p.vx; p.y += p.vy; p.a += p.va;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
        ctx.fillStyle = p.col;
        if (p.star) { ctx.beginPath(); for (let i = 0; i < 5; i++) { const an = (i * 4 * Math.PI) / 5; ctx.lineTo(Math.cos(an) * p.r, Math.sin(an) * p.r); } ctx.fill(); }
        else ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.7);
        ctx.restore();
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = p.col; ctx.lineWidth = 6 * (1 - life);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * Math.sqrt(life), 0, Math.PI * 2); ctx.stroke();
      } else if (p.kind === 'beam') {
        const g = p.dir === 'h' ? ctx.createLinearGradient(0, p.y - p.th, 0, p.y + p.th) : ctx.createLinearGradient(p.x - p.th, 0, p.x + p.th, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        const reach = Math.min(1, life * 3);
        if (p.dir === 'h') ctx.fillRect(p.x - w * reach, p.y - p.th, w * reach * 2, p.th * 2);
        else ctx.fillRect(p.x - p.th, p.y - h * reach, p.th * 2, h * reach * 2);
      } else if (p.kind === 'zap') {
        ctx.strokeStyle = p.col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
        const steps = 6;
        for (let i = 1; i <= steps; i++) { const f = i / steps; ctx.lineTo(p.x + (p.x2 - p.x) * f + (i < steps ? (Math.random() - 0.5) * 14 : 0), p.y + (p.y2 - p.y) * f + (i < steps ? (Math.random() - 0.5) * 14 : 0)); }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    if (items.length) requestAnimationFrame(loop); else running = false;
  }
  function start() { if (!running) { running = true; requestAnimationFrame(loop); } }
  return {
    size,
    burst(x, y, col, n = 10, power = 1) {
      for (let i = 0; i < n; i++) {
        const an = Math.random() * Math.PI * 2, sp = (2 + Math.random() * 4) * power;
        items.push({ kind: 'spark', x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 2, r: 4 + Math.random() * 5, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, col: Math.random() < 0.25 ? '#fff' : col, star: Math.random() < 0.35, t: 0, life: 32 + Math.random() * 18 });
      }
      start();
    },
    ring(x, y, col, r1) { items.push({ kind: 'ring', x, y, r0: 6, r1, col, t: 0, life: 30 }); start(); },
    beam(x, y, dir, th) { items.push({ kind: 'beam', x, y, dir, th, t: 0, life: 26 }); start(); },
    zap(x, y, x2, y2, col) { items.push({ kind: 'zap', x, y, x2, y2, col, t: 0, life: 18 }); start(); },
  };
}

// ---------- Game ----------
export function treatGameScreen(app, { level }) {
  const spec = levelSpec(level);
  const holes = new Set(spec.holes);
  const rng = mulberry32(spec.seed);
  const rand = () => (rng() * spec.types) | 0;
  let idc = 0;
  const tile = (t, sp = null) => ({ t, sp, id: ++idc });
  let grid = new Array(N * N).fill(null);
  const jelly = new Map((spec.jelly || []).map((i) => [i, 1]));
  let movesLeft = spec.moves, score = 0, busy = false, extraUsed = false, over = false;
  const collected = {};
  const R = (i) => Math.floor(i / N), C = (i) => i % N;
  const at = (r, c) => (r < 0 || r >= N || c < 0 || c >= N || holes.has(r * N + c) ? undefined : grid[r * N + c]);

  for (let i = 0; i < N * N; i++) {
    if (holes.has(i)) continue;
    let t;
    do { t = rand(); } while ((C(i) >= 2 && at(R(i), C(i) - 1)?.t === t && at(R(i), C(i) - 2)?.t === t) || (R(i) >= 2 && at(R(i) - 1, C(i))?.t === t && at(R(i) - 2, C(i))?.t === t));
    grid[i] = tile(t);
  }

  const root = el(`<section class="screen treat-theme treat-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">Level ${level + 1}</div><button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="treat-hud">
      <div class="hud-moves" data-el="moves-box"><b data-el="moves"></b><span>moves</span></div>
      <div class="hud-goal" data-el="goal"></div>
      <div class="hud-score"><b data-el="score">0</b><div class="hud-bar"><i data-el="bar"></i><s style="left:${(spec.stars[0] / spec.stars[2]) * 100}%"></s><s style="left:${(spec.stars[1] / spec.stars[2]) * 100}%"></s></div></div>
    </div>
    <div class="treat-board-wrap" data-el="wrap"><div class="treat-board" data-el="board"><canvas class="treat-fx" data-el="fx"></canvas></div><div class="combo-text" data-el="pop"></div></div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const board = q('board');
  const fx = makeFx(q('fx'));
  const tileEls = new Map();
  let cell = 40;

  function layout() {
    const w = Math.min(innerWidth - 20, 520, innerHeight - 250);
    cell = Math.floor(w / N);
    board.style.width = board.style.height = cell * N + 'px';
    board.style.setProperty('--tc', cell + 'px');
    fx.size(cell * N);
    $$('.tcell', board).forEach((n) => n.remove());
    for (let i = 0; i < N * N; i++) {
      if (holes.has(i)) continue;
      board.prepend(el(`<div class="tcell ${(R(i) + C(i)) % 2 ? 'alt' : ''} ${jelly.get(i) ? 'jelly' : ''}" data-cell="${i}" style="transform:translate(${C(i) * cell}px,${R(i) * cell}px)"></div>`));
    }
  }
  const centre = (i) => [C(i) * cell + cell / 2, R(i) * cell + cell / 2];

  function render(spawnFrom = null) {
    const live = new Set();
    grid.forEach((t, i) => {
      if (!t) return;
      live.add(t.id);
      let n = tileEls.get(t.id);
      if (!n) {
        n = el('<div class="ttile"></div>');
        board.appendChild(n); tileEls.set(t.id, n);
        const startRow = spawnFrom && spawnFrom.has(t.id) ? spawnFrom.get(t.id) : R(i);
        n.style.transition = 'none';
        n.style.transform = `translate(${C(i) * cell}px,${startRow * cell}px)`;
        void n.offsetWidth; n.style.transition = '';
        if (spawnFrom && spawnFrom.has(t.id)) n.classList.add('land');
      }
      const key = t.t + ':' + t.sp;
      if (n.dataset.k !== key) { n.innerHTML = candySvg(t.t, t.sp); n.dataset.k = key; if (t.sp || t.t === BOMB) n.classList.add('born'); }
      n.classList.toggle('special', !!t.sp || t.t === BOMB);
      n.style.transform = `translate(${C(i) * cell}px,${R(i) * cell}px)`;
      n.dataset.i = i;
    });
    for (const [id, n] of tileEls) if (!live.has(id)) { n.remove(); tileEls.delete(id); }
    $$('.tcell', board).forEach((c) => c.classList.toggle('jelly', !!jelly.get(+c.dataset.cell)));
    hud();
  }

  function hud() {
    q('moves').textContent = movesLeft;
    q('moves-box').classList.toggle('low', movesLeft <= 5 && !over);
    q('score').textContent = score.toLocaleString('en-AU');
    q('bar').style.width = Math.min(100, (score / spec.stars[2]) * 100) + '%';
    let g = '';
    if (spec.kind === 'score') g = `<span>Reach</span><b>${spec.target.toLocaleString('en-AU')}</b>`;
    else if (spec.kind === 'collect') g = Object.entries(spec.collect).map(([t, n]) => { const left = Math.max(0, n - (collected[t] || 0)); return `<div class="goal-item" data-goal="${t}">${candySvg(+t)}<b>${left ? left : '✓'}</b></div>`; }).join('');
    else g = `<div class="goal-item"><span class="jelly-swatch"></span><b>${[...jelly.values()].filter(Boolean).length || '✓'}</b></div>`;
    if (q('goal').innerHTML !== g) q('goal').innerHTML = g;
  }

  // ---------- Matching ----------
  function findMatches() {
    const runs = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N;) {
      const t = at(r, c); let e = c + 1;
      if (t && t.t !== BOMB) while (at(r, e) && at(r, e).t === t.t) e++;
      if (t && t.t !== BOMB && e - c >= 3) runs.push({ cells: [...Array(e - c)].map((_, k) => r * N + c + k), dir: 'h' });
      c = e;
    }
    for (let c = 0; c < N; c++) for (let r = 0; r < N;) {
      const t = at(r, c); let e = r + 1;
      if (t && t.t !== BOMB) while (at(e, c) && at(e, c).t === t.t) e++;
      if (t && t.t !== BOMB && e - r >= 3) runs.push({ cells: [...Array(e - r)].map((_, k) => (r + k) * N + c), dir: 'v' });
      r = e;
    }
    return runs;
  }

  // Cells that clear, including chain reactions from special candies (with their visual effects).
  function expand(cells) {
    const out = new Set(cells), queue = [...cells];
    while (queue.length) {
      const i = queue.pop(), t = grid[i];
      if (!t || !t.sp || t.fired) continue;
      t.fired = true;
      const [x, y] = centre(i);
      const add = (k) => { if (k >= 0 && !holes.has(k) && grid[k] && !out.has(k)) { out.add(k); queue.push(k); } };
      if (t.sp === 'h') { fx.beam(x, y, 'h', cell * 0.35); for (let c = 0; c < N; c++) add(R(i) * N + c); }
      if (t.sp === 'v') { fx.beam(x, y, 'v', cell * 0.35); for (let r = 0; r < N; r++) add(r * N + C(i)); }
      if (t.sp === 'wrap') { fx.ring(x, y, CANDY_COLOURS[t.t], cell * 2.2); shake(1); for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const r = R(i) + dr, c = C(i) + dc; if (r >= 0 && r < N && c >= 0 && c < N) add(r * N + c); } }
    }
    return out;
  }

  function shake(level = 1) {
    const w = q('wrap');
    w.classList.remove('shake1', 'shake2'); void w.offsetWidth;
    w.classList.add(level > 1 ? 'shake2' : 'shake1');
    buzz(level > 1 ? 45 : 20);
  }

  function floatScore(points, cells) {
    if (!cells.length) return;
    const xs = cells.map((i) => centre(i)[0]), ys = cells.map((i) => centre(i)[1]);
    const n = el(`<div class="float-score">+${points}</div>`);
    n.style.left = xs.reduce((a, b) => a + b, 0) / xs.length + 'px';
    n.style.top = ys.reduce((a, b) => a + b, 0) / ys.length + 'px';
    board.appendChild(n);
    setTimeout(() => n.remove(), 900);
  }

  // Collected candies fly up to the goal box.
  function flyToGoal(t, i) {
    const goal = $(`[data-goal="${t}"]`, root);
    if (!goal) return;
    const br = board.getBoundingClientRect(), gr = goal.getBoundingClientRect();
    const [x, y] = centre(i);
    const n = el(`<div class="fly-candy">${candySvg(t)}</div>`);
    Object.assign(n.style, { left: br.left + x - cell * 0.35 + 'px', top: br.top + y - cell * 0.35 + 'px', width: cell * 0.7 + 'px', height: cell * 0.7 + 'px' });
    document.body.appendChild(n);
    const dx = gr.left + 6 - (br.left + x - cell * 0.35), dy = gr.top + 4 - (br.top + y - cell * 0.35);
    n.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 40}px) scale(1.2)`, offset: 0.5 }, { transform: `translate(${dx}px,${dy}px) scale(.6)` }], { duration: 520, easing: 'ease-in' })
      .finished.then(() => { n.remove(); goal.classList.remove('bump'); void goal.offsetWidth; goal.classList.add('bump'); hud(); }).catch(() => n.remove());
  }

  async function clearCells(set, created = new Map(), basePoints = 60) {
    let flown = 0;
    for (const i of set) {
      const t = grid[i]; if (!t) continue;
      const [x, y] = centre(i);
      fx.burst(x, y, t.t === BOMB ? '#fff' : CANDY_COLOURS[t.t], t.sp ? 16 : 9, t.sp ? 1.4 : 1);
      if (t.t !== BOMB) {
        collected[t.t] = (collected[t.t] || 0) + 1;
        if (spec.collect && spec.collect[t.t] && flown < 6) { flyToGoal(t.t, i); flown++; }
      }
      if (jelly.get(i)) { jelly.set(i, 0); fx.burst(x, y, '#ff8cc0', 6, 0.7); }
      const n = tileEls.get(t.id);
      if (n) n.classList.add('pop');
    }
    const points = set.size * basePoints;
    score += points;
    floatScore(points, [...set]);
    await sleep(210);
    for (const i of set) grid[i] = created.has(i) ? created.get(i) : null;
    render();
  }

  function gravity() {
    const spawn = new Map();
    for (let c = 0; c < N; c++) {
      const col = [];
      for (let r = N - 1; r >= 0; r--) if (!holes.has(r * N + c) && grid[r * N + c]) col.push(grid[r * N + c]);
      let k = 0, newCount = 0;
      for (let r = N - 1; r >= 0; r--) {
        if (holes.has(r * N + c)) continue;
        if (k < col.length) grid[r * N + c] = col[k++];
        else { const t = tile(rand()); grid[r * N + c] = t; newCount++; spawn.set(t.id, -newCount); }
      }
    }
    render(spawn);
  }

  const COMBO_WORDS = ['', '', 'Sweet!', 'Tasty!', 'Delicious!', 'Divine!', 'Sugar rush!'];
  async function resolve(swapCells = []) {
    let chain = 0;
    for (;;) {
      const runs = findMatches();
      if (!runs.length) break;
      chain++;
      const created = new Map(), all = new Set(), counts = new Map();
      runs.forEach((r) => r.cells.forEach((i) => counts.set(i, (counts.get(i) || 0) + 1)));
      const pickSpot = (cells) => cells.find((i) => swapCells.includes(i)) ?? cells[Math.floor(cells.length / 2)];
      for (const r of runs) {
        r.cells.forEach((i) => all.add(i));
        const cross = r.cells.find((i) => counts.get(i) > 1);
        const t = grid[r.cells[0]].t;
        if (r.cells.length >= 5) created.set(pickSpot(r.cells), tile(BOMB));
        else if (cross !== undefined && !created.has(cross)) created.set(cross, tile(t, 'wrap'));
        else if (r.cells.length === 4) created.set(pickSpot(r.cells), tile(t, r.dir === 'h' ? 'v' : 'h'));
      }
      const set = expand([...all].filter((i) => !created.has(i) || grid[i]?.sp));
      created.forEach((_, i) => set.add(i));
      if (chain > 1) popText(COMBO_WORDS[Math.min(chain, 6)]);
      if (chain > 2 || set.size >= 10) shake(chain > 3 ? 2 : 1);
      if (created.size) sfx.hint();
      sfx[chain > 1 ? 'unit' : 'place']();
      await clearCells(set, created, 60 + (chain - 1) * 40);
      await sleep(60);
      gravity();
      await sleep(240);
      swapCells = [];
    }
  }

  function popText(t) { const p = q('pop'); p.textContent = t; p.classList.remove('show'); void p.offsetWidth; p.classList.add('show'); }

  // ---------- Swapping ----------
  function swapGrid(a, b) { [grid[a], grid[b]] = [grid[b], grid[a]]; }
  async function trySwap(a, b) {
    if (busy || over) return;
    if (holes.has(a) || holes.has(b) || !grid[a] || !grid[b]) return;
    busy = true;
    hideHint();
    const ta = grid[a], tb = grid[b];
    swapGrid(a, b); render(); sfx.tap();
    await sleep(170);
    if (ta.t === BOMB || tb.t === BOMB) {
      const other = ta.t === BOMB ? tb : ta;
      const bombAt = ta.t === BOMB ? b : a;
      const set = new Set([a, b]);
      if (other.t === BOMB) grid.forEach((t, i) => { if (t) set.add(i); });
      else grid.forEach((t, i) => { if (t && t.t === other.t) { if (other.sp) t.sp = other.sp === 'wrap' ? 'wrap' : (Math.random() < 0.5 ? 'h' : 'v'); set.add(i); } });
      const [bx, by] = centre(bombAt);
      fx.ring(bx, by, '#fff', cell * 4);
      set.forEach((i) => { if (i !== bombAt) { const [x, y] = centre(i); fx.zap(bx, by, x, y, CANDY_COLOURS[(Math.random() * 6) | 0]); } });
      movesLeft--; shake(2); popText('Sprinkle blast!'); sfx.unit();
      await sleep(250);
      await clearCells(expand([...set]), new Map(), 90);
      gravity(); await sleep(240);
      await resolve();
      return afterMove();
    }
    if (ta.sp && tb.sp) {
      const set = new Set([a, b]);
      if (ta.sp === 'wrap' && tb.sp === 'wrap') { for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) { const r = R(b) + dr, c = C(b) + dc; if (r >= 0 && r < N && c >= 0 && c < N && grid[r * N + c]) set.add(r * N + c); } fx.ring(...centre(b), '#fff', cell * 3.5); }
      else if (ta.sp === 'wrap' || tb.sp === 'wrap') { for (let d = -1; d <= 1; d++) { for (let c = 0; c < N; c++) { const r = R(b) + d; if (r >= 0 && r < N && grid[r * N + c]) set.add(r * N + c); } for (let r = 0; r < N; r++) { const c = C(b) + d; if (c >= 0 && c < N && grid[r * N + c]) set.add(r * N + c); } } fx.beam(...centre(b), 'h', cell * 1.2); fx.beam(...centre(b), 'v', cell * 1.2); }
      else { for (let c = 0; c < N; c++) if (grid[R(b) * N + c]) set.add(R(b) * N + c); for (let r = 0; r < N; r++) if (grid[r * N + C(b)]) set.add(r * N + C(b)); fx.beam(...centre(b), 'h', cell * 0.4); fx.beam(...centre(b), 'v', cell * 0.4); }
      ta.fired = tb.fired = true;
      movesLeft--; shake(2); popText('Mega combo!');
      await clearCells(expand([...set]), new Map(), 90);
      gravity(); await sleep(240);
      await resolve();
      return afterMove();
    }
    if (!findMatches().length) {
      swapGrid(a, b); render(); buzz(15);
      tileEls.get(ta.id)?.classList.add('nope'); tileEls.get(tb.id)?.classList.add('nope');
      await sleep(260);
      tileEls.get(ta.id)?.classList.remove('nope'); tileEls.get(tb.id)?.classList.remove('nope');
      busy = false;
      return;
    }
    movesLeft--;
    await resolve([a, b]);
    afterMove();
  }

  const otherGoalsMet = () => {
    if (spec.kind === 'collect') return Object.entries(spec.collect).every(([t, n]) => (collected[t] || 0) >= n);
    if (spec.kind === 'jelly') return [...jelly.values()].every((v) => !v);
    return true;
  };
  const goalMet = () => score >= spec.target && otherGoalsMet();

  function possibleMove() {
    for (let i = 0; i < N * N; i++) for (const j of [i + 1, i + N]) {
      if (j >= N * N || (j === i + 1 && C(i) === N - 1) || !grid[i] || !grid[j]) continue;
      if (grid[i].t === BOMB || grid[j].t === BOMB || (grid[i].sp && grid[j].sp)) return [i, j];
      swapGrid(i, j); const ok = findMatches().length > 0; swapGrid(i, j);
      if (ok) return [i, j];
    }
    return null;
  }

  async function afterMove() {
    hud();
    if (goalMet() || (spec.kind !== 'score' && otherGoalsMet() && movesLeft === 0)) return win();
    if (movesLeft <= 0) return lose();
    if (!possibleMove()) {
      popText('Shuffle!'); await sleep(500);
      for (let tries = 0; tries < 20; tries++) {
        const live = grid.map((t, i) => (t ? i : -1)).filter((i) => i >= 0);
        const ts = live.map((i) => grid[i]).sort(() => Math.random() - 0.5);
        live.forEach((i, k) => { grid[i] = ts[k]; });
        if (!findMatches().length && possibleMove()) break;
      }
      render(); await sleep(250);
    }
    busy = false;
    armHint();
  }

  // Leftover moves become striped candies that all go off together.
  async function treatFeast() {
    if (movesLeft <= 0) return;
    popText('Treat feast!');
    while (movesLeft > 0) {
      const options = grid.map((t, i) => (t && !t.sp && t.t !== BOMB ? i : -1)).filter((i) => i >= 0);
      if (!options.length) break;
      const i = options[(Math.random() * options.length) | 0];
      grid[i].sp = Math.random() < 0.5 ? 'h' : 'v';
      movesLeft--;
      score += 120;
      const [x, y] = centre(i);
      fx.burst(x, y, '#fff', 6, 0.6);
      render(); sfx.note();
      await sleep(110);
    }
    await sleep(250);
    const specials = grid.map((t, i) => (t && t.sp ? i : -1)).filter((i) => i >= 0);
    if (specials.length) { shake(2); await clearCells(expand(specials), new Map(), 60); gravity(); await sleep(260); await resolve(); }
  }

  async function win() {
    over = true;
    hud();
    await treatFeast();
    const stars = score >= spec.stars[2] ? 3 : score >= spec.stars[1] ? 2 : 1;
    const t = T();
    t.stars[level] = Math.max(t.stars[level] || 0, stars);
    if (level >= t.level) t.level = level + 1;
    t.best = Math.max(t.best || 0, score);
    save(true);
    sfx.win(); confetti(3000);
    showResult(stars);
  }

  // Animated result card: stars land one at a time and the score counts up.
  function showResult(stars) {
    const titles = ['Treat-tastic!', 'Sweet success!', 'Delicious!', 'Sugar star!'];
    const node = el(`<div class="treat-result"><div class="tr-card">
      <div class="tr-ribbon">${titles[(Math.random() * titles.length) | 0]}</div>
      <div class="tr-stars">${[0, 1, 2].map((k) => `<div class="tr-star" data-k="${k}">★</div>`).join('')}</div>
      <div class="tr-level">Level ${level + 1}</div>
      <div class="tr-score" data-el="final">0</div>
      <div class="tr-candies">${[0, 1, 2, 3, 4, 5].map((k) => `<div style="animation-delay:${k * 0.1}s">${candySvg(k)}</div>`).join('')}</div>
      <div class="tr-actions">
        <button class="btn treat-btn" data-act="next">Next level</button>
        <button class="btn ghost" data-act="back">Back</button>
      </div></div></div>`);
    document.getElementById('overlay-root').appendChild(node);
    const fin = $('[data-el="final"]', node);
    const t0 = performance.now();
    (function count(now) { const f = Math.min(1, (now - t0) / 900); fin.textContent = Math.round(score * (1 - Math.pow(1 - f, 3))).toLocaleString('en-AU'); if (f < 1) requestAnimationFrame(count); })(t0);
    $$('.tr-star', node).forEach((s, k) => { if (k < stars) setTimeout(() => { s.classList.add('on'); sfx.place(); buzz(15); }, 500 + k * 380); });
    node.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
      node.remove();
      if (a === 'next') app.replace('treatgame', { level: level + 1 }); else app.back();
    });
  }

  function lose() {
    sfx.error();
    const node = el(`<div class="treat-result"><div class="tr-card">
      <div class="tr-ribbon sad">Out of moves</div>
      <div class="tr-sad">${candySvg(0)}</div>
      <p class="tr-msg">${goalText(spec)}. So close!</p>
      <div class="tr-actions">
        ${extraUsed ? '' : '<button class="btn treat-btn" data-act="more">Take 5 more moves</button>'}
        <button class="btn ${extraUsed ? 'treat-btn' : 'secondary'}" data-act="retry">Try again</button>
        <button class="btn ghost" data-act="back">Back</button>
      </div></div></div>`);
    document.getElementById('overlay-root').appendChild(node);
    node.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
      node.remove();
      if (a === 'more') { extraUsed = true; movesLeft = 5; busy = false; hud(); armHint(); popText('+5 moves'); }
      else if (a === 'retry') app.replace('treatgame', { level });
      else { over = true; app.back(); }
    });
  }

  let hintTimer = null;
  function armHint() { clearTimeout(hintTimer); hintTimer = setTimeout(() => { if (busy || over) return; const m = possibleMove(); if (m) m.forEach((i) => tileEls.get(grid[i].id)?.classList.add('hint')); }, 5000); }
  function hideHint() { clearTimeout(hintTimer); $$('.ttile.hint', board).forEach((n) => n.classList.remove('hint')); }

  // ---------- Input: swipe or tap-tap ----------
  let start = null, selected = -1;
  const cellAt = (e) => { const r = board.getBoundingClientRect(); const c = Math.floor((e.clientX - r.left) / cell), rr = Math.floor((e.clientY - r.top) / cell); return c >= 0 && c < N && rr >= 0 && rr < N ? rr * N + c : -1; };
  board.addEventListener('pointerdown', (e) => {
    const i = cellAt(e); if (i < 0 || busy || over) return;
    board.setPointerCapture(e.pointerId);
    start = { i, x: e.clientX, y: e.clientY, done: false };
  });
  board.addEventListener('pointermove', (e) => {
    if (!start || start.done) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < cell * 0.35) return;
    start.done = true;
    const i = start.i;
    const j = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? (C(i) < N - 1 ? i + 1 : -1) : (C(i) > 0 ? i - 1 : -1)) : (dy > 0 ? (R(i) < N - 1 ? i + N : -1) : (R(i) > 0 ? i - N : -1));
    clearSel();
    if (j >= 0) trySwap(i, j);
  });
  board.addEventListener('pointerup', () => {
    if (!start) return;
    const s = start; start = null;
    if (s.done) return;
    if (selected >= 0 && selected !== s.i && (Math.abs(selected - s.i) === N || (Math.abs(selected - s.i) === 1 && R(selected) === R(s.i)))) { const a = selected; clearSel(); trySwap(a, s.i); return; }
    clearSel();
    if (grid[s.i]) { selected = s.i; tileEls.get(grid[s.i].id)?.classList.add('sel'); sfx.tap(); }
  });
  function clearSel() { if (selected >= 0 && grid[selected]) tileEls.get(grid[selected].id)?.classList.remove('sel'); selected = -1; }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') treatHelp();
  });

  requestAnimationFrame(() => {
    layout(); render(); armHint();
    if (level === 0 && !T().seenHelp) { T().seenHelp = true; save(); setTimeout(treatHelp, 300); }
    toast(goalText(spec), 2600);
  });
  return { root, destroy() { clearTimeout(hintTimer); over = true; $$('.fly-candy').forEach((n) => n.remove()); $$('.treat-result').forEach((n) => n.remove()); } };
}
