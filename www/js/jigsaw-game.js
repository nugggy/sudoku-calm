// Jigsaw: drag interlocking pieces of a cartoon scene into place.
import { mulberry32 } from './sudoku-engine.js';
import { store, save, fmtTime } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet, levelHome } from './kit.js';

const JG = () => store.jigsaw;
// Scenes: background gradient, optional ground, and pictures placed in 0..1 units [image, x, y, size]
export const SCENES = [
  { name: 'Beach', sky: ['#6fd0ff', '#d9f4ff'], ground: ['#ffe29a', 0.72], sea: ['#3aa7e8', 0.58], items: [['sun', 0.8, 0.15, 0.22], ['cloud', 0.25, 0.14, 0.2], ['sailboat', 0.45, 0.48, 0.2], ['palm-tree', 0.16, 0.6, 0.34], ['beach-with-umbrella', 0.62, 0.74, 0.28], ['crab', 0.88, 0.88, 0.14], ['spiral-shell', 0.32, 0.9, 0.11]] },
  { name: 'Farm', sky: ['#9fdcff', '#f0fbff'], ground: ['#8fd16a', 0.62], items: [['sun', 0.85, 0.13, 0.18], ['house', 0.2, 0.5, 0.3], ['tractor', 0.66, 0.6, 0.28], ['cow', 0.38, 0.8, 0.24], ['pig', 0.78, 0.86, 0.18], ['chicken', 0.1, 0.86, 0.14], ['sunflower', 0.55, 0.88, 0.14]] },
  { name: 'Space', sky: ['#130d3a', '#4a2c8f'], items: [['ringed-planet', 0.72, 0.28, 0.34], ['full-moon', 0.2, 0.2, 0.22], ['rocket', 0.36, 0.62, 0.3], ['flying-saucer', 0.76, 0.72, 0.24], ['star', 0.5, 0.12, 0.08], ['star', 0.9, 0.5, 0.07], ['star', 0.1, 0.55, 0.06], ['star', 0.58, 0.9, 0.07]] },
  { name: 'Ocean', sky: ['#1a7ccf', '#7fe0ff'], ground: ['#f3d9a4', 0.86], items: [['spouting-whale', 0.62, 0.3, 0.38], ['tropical-fish', 0.2, 0.32, 0.18], ['octopus', 0.26, 0.7, 0.26], ['turtle', 0.75, 0.68, 0.24], ['spiral-shell', 0.52, 0.9, 0.12], ['crab', 0.1, 0.92, 0.12]] },
  { name: 'Forest', sky: ['#b8ecff', '#f3fff0'], ground: ['#5fb85a', 0.66], items: [['deciduous-tree', 0.2, 0.5, 0.36], ['evergreen-tree', 0.78, 0.46, 0.38], ['evergreen-tree', 0.5, 0.52, 0.24], ['fox', 0.42, 0.82, 0.22], ['owl', 0.2, 0.3, 0.13], ['hedgehog', 0.78, 0.86, 0.16], ['mushroom', 0.6, 0.9, 0.12]] },
  { name: 'Café', sky: ['#ffe2c7', '#fff6ec'], ground: ['#c98b5a', 0.7], items: [['hot-beverage', 0.3, 0.55, 0.3], ['teapot', 0.72, 0.5, 0.3], ['croissant', 0.22, 0.86, 0.22], ['doughnut', 0.55, 0.86, 0.2], ['cupcake', 0.84, 0.84, 0.2], ['sun', 0.82, 0.14, 0.14]] },
  { name: 'Garden', sky: ['#c6f0ff', '#fff5fb'], ground: ['#86d06a', 0.68], items: [['sunflower', 0.2, 0.52, 0.32], ['tulip', 0.5, 0.66, 0.22], ['rose', 0.78, 0.62, 0.24], ['butterfly', 0.62, 0.24, 0.2], ['honeybee', 0.3, 0.2, 0.14], ['snail', 0.36, 0.9, 0.14], ['tulip', 0.9, 0.88, 0.14]] },
  { name: 'Winter', sky: ['#a8d4ff', '#ecf6ff'], ground: ['#ffffff', 0.68], items: [['snowman', 0.3, 0.6, 0.34], ['christmas-tree', 0.74, 0.52, 0.36], ['penguin', 0.56, 0.86, 0.2], ['snowflake', 0.14, 0.16, 0.12], ['snowflake', 0.5, 0.12, 0.09], ['snowflake', 0.88, 0.2, 0.1], ['cloud', 0.3, 0.12, 0.18]] },
  { name: 'Outback', sky: ['#ffb36b', '#ffe7c2'], ground: ['#d9733f', 0.68], items: [['sun', 0.24, 0.22, 0.26], ['kangaroo', 0.66, 0.56, 0.36], ['koala', 0.24, 0.72, 0.24], ['cactus', 0.88, 0.8, 0.18], ['cloud', 0.75, 0.14, 0.18]] },
  { name: 'Party', sky: ['#ffd1ec', '#fff3c4'], items: [['birthday-cake', 0.5, 0.66, 0.34], ['balloon', 0.16, 0.26, 0.2], ['balloon', 0.84, 0.22, 0.2], ['party-popper', 0.2, 0.74, 0.22], ['teddy-bear', 0.82, 0.74, 0.24], ['crown', 0.5, 0.28, 0.2]] },
  { name: 'Jungle', sky: ['#9be7a0', '#e9ffe0'], ground: ['#3f9e4f', 0.7], items: [['palm-tree', 0.82, 0.48, 0.38], ['monkey-face', 0.24, 0.3, 0.22], ['parrot', 0.6, 0.22, 0.2], ['lion', 0.3, 0.72, 0.28], ['elephant', 0.68, 0.78, 0.3], ['banana', 0.1, 0.9, 0.12]] },
  { name: 'City', sky: ['#8fd3ff', '#eaf7ff'], ground: ['#9aa5b1', 0.74], items: [['ferris-wheel', 0.72, 0.4, 0.4], ['house', 0.22, 0.5, 0.3], ['bus', 0.34, 0.84, 0.28], ['taxi', 0.76, 0.86, 0.22], ['bicycle', 0.1, 0.9, 0.16], ['sun', 0.4, 0.13, 0.14], ['rainbow', 0.2, 0.18, 0.22]] },
];

export const sizeFor = (level) => Math.min(7, 3 + Math.floor(level / SCENES.length));
export const sceneFor = (level) => SCENES[level % SCENES.length];

export const jigsawHelp = () => helpSheet('How to play Jigsaw', [
  'Drag pieces from the tray onto the board. When a piece is close to its spot it clicks into place.',
  'Tap the grid button at the top to see a faint copy of the picture on the board.',
  'Each new round of pictures has more pieces, from 9 up to 49.',
], 'jig-btn');

const imgCache = new Map();
function loadImg(src) { if (!imgCache.has(src)) imgCache.set(src, new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; })); return imgCache.get(src); }

// Paints a scene onto a square canvas of size S (device pixels).
export async function paintScene(scene, S) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, S); g.addColorStop(0, scene.sky[0]); g.addColorStop(1, scene.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  if (scene.sea) { ctx.fillStyle = scene.sea[0]; ctx.fillRect(0, S * scene.sea[1], S, S); }
  if (scene.ground) { ctx.fillStyle = scene.ground[0]; ctx.beginPath(); ctx.moveTo(0, S * scene.ground[1]); ctx.quadraticCurveTo(S * 0.5, S * (scene.ground[1] - 0.06), S, S * scene.ground[1]); ctx.lineTo(S, S); ctx.lineTo(0, S); ctx.fill(); }
  const imgs = await Promise.all(scene.items.map(([n]) => loadImg(`img/scene/${n}.png`)));
  scene.items.forEach(([, x, y, sz], k) => { const im = imgs[k]; if (!im) return; const d = sz * S; ctx.drawImage(im, x * S - d / 2, y * S - d / 2, d, d); });
  return c;
}

// Jigsaw edge: a classic tab drawn along the edge from (x0,y0) to (x1,y1); dir is +1 (out) or -1 (in), 0 for flat.
function edge(p, x0, y0, x1, y1, dir) {
  if (!dir) { p.lineTo(x1, y1); return; }
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len, nx = -uy * dir, ny = ux * dir; // normal pointing out of the piece when dir = 1
  const P = (a, b) => [x0 + ux * a * len + nx * b * len, y0 + uy * a * len + ny * b * len];
  const pts = [[0.35, 0], [0.38, -0.02], [0.36, 0.18], [0.5, 0.22], [0.64, 0.18], [0.62, -0.02], [0.65, 0]];
  p.lineTo(...P(...pts[0]));
  p.bezierCurveTo(...P(...pts[1]), ...P(...pts[2]), ...P(...pts[3]));
  p.bezierCurveTo(...P(...pts[4]), ...P(...pts[5]), ...P(...pts[6]));
  p.lineTo(x1, y1);
}

export function jigsawHomeScreen(app) {
  return levelHome({
    app, cls: 'jig-theme', title: 'Jigsaw', help: jigsawHelp,
    hero: '<div class="jig-hero"><img src="img/themes/puzzle-piece.png" alt=""></div>',
    play: () => ({ label: `Play puzzle ${JG().level + 1}`, sub: `${sceneFor(JG().level).name} · ${sizeFor(JG().level) ** 2} pieces` }),
    onPlay: () => app.go('jiggame', { level: JG().level }),
    levels: () => ({ heading: 'Pictures', count: Math.max(SCENES.length * 2, Math.ceil((JG().level + 12) / 12) * 12), current: JG().level, done: (i) => i < JG().level, label: (i) => `<span class="jl">${sizeFor(i) ** 2}</span>${i + 1}` }),
    onLevel: (i) => app.go('jiggame', { level: i }),
  });
}

export function jigsawGameScreen(app, { level }) {
  const jg = JG();
  const scene = sceneFor(level), n = sizeFor(level);
  const root = el(`<section class="screen jig-theme jig-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">${scene.name}</div><span class="cross-time" data-el="count"></span>
      <button class="icon-btn" data-act="ghost" aria-label="Show picture">${icon.grid}</button></header>
    <div class="jig-play" data-el="play"><div class="jig-board" data-el="board"><canvas class="jig-ghost" data-el="ghost"></canvas></div><div class="jig-tray" data-el="tray"></div></div>
    <div class="jig-bar"><button class="sort-boost hint-btn" data-act="hint" aria-label="Hint"><img src="img/ui/light-bulb.png" alt=""></button></div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  let S, cell, pieces = [], placed, done = false, start = Date.now();
  const rng = mulberry32(1234 + level * 99);
  const TRAY_SCALE = 0.62;

  async function build() {
    const play = q('play').getBoundingClientRect();
    S = Math.floor(Math.min(play.width - 20, (play.height - 20) * 0.62, 520));
    cell = S / n;
    const board = q('board');
    board.style.width = board.style.height = S + 'px';
    const dpr = window.devicePixelRatio || 1;
    const pic = await paintScene(scene, Math.round(S * dpr));
    const ghost = q('ghost'); ghost.width = ghost.height = pic.width; ghost.style.width = ghost.style.height = S + 'px';
    ghost.getContext('2d').drawImage(pic, 0, 0);
    ghost.classList.toggle('on', !!jg.ghost);
    // random tab directions for inside edges
    const hEdge = [...Array(n)].map(() => [...Array(n + 1)].map((_, k) => (k === 0 || k === n ? 0 : rng() < 0.5 ? 1 : -1)));
    const vEdge = [...Array(n + 1)].map((_, k) => [...Array(n)].map(() => (k === 0 || k === n ? 0 : rng() < 0.5 ? 1 : -1)));
    const pad = cell * 0.25;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const cv = document.createElement('canvas');
      const w = cell + pad * 2;
      cv.width = cv.height = Math.ceil(w * dpr);
      cv.style.width = cv.style.height = w + 'px';
      const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
      const p = new Path2D();
      const x0 = pad, y0 = pad, x1 = pad + cell, y1 = pad + cell;
      p.moveTo(x0, y0);
      edge(p, x0, y0, x1, y0, -vEdge[r][c] || 0);          // top: the edge belongs to the row above, flipped
      edge(p, x1, y0, x1, y1, hEdge[r][c + 1]);             // right
      edge(p, x1, y1, x0, y1, vEdge[r + 1][c]);             // bottom
      edge(p, x0, y1, x0, y0, -hEdge[r][c] || 0);           // left
      p.closePath();
      ctx.save(); ctx.clip(p);
      ctx.drawImage(pic, (c * cell - pad) * dpr, (r * cell - pad) * dpr, w * dpr, w * dpr, 0, 0, w, w);
      ctx.restore();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke(p);
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.translate(0.8, 0.8); ctx.stroke(p);
      const wrap = el('<div class="jig-piece"></div>');
      wrap.appendChild(cv);
      wrap.dataset.k = r * n + c;
      pieces.push({ k: r * n + c, r, c, el: wrap, w, pad });
    }
    layoutPieces();
  }

  function layoutPieces() {
    const board = q('board'), tray = q('tray');
    const play = q('play');
    pieces.forEach((pc) => {
      if (placed.has(pc.k)) {
        board.appendChild(pc.el);
        Object.assign(pc.el.style, { left: pc.c * cell - pc.pad + 'px', top: pc.r * cell - pc.pad + 'px', transform: 'none' });
        pc.el.classList.add('locked');
      }
    });
    // shuffle the rest into the tray
    const loose = pieces.filter((pc) => !placed.has(pc.k)).sort(() => rng() - 0.5);
    const tr = tray.getBoundingClientRect(), pr = play.getBoundingClientRect();
    const sw = pieces[0].w * TRAY_SCALE;
    const cols = Math.max(1, Math.floor((tr.width - 10) / (sw * 0.78)));
    loose.forEach((pc, i) => {
      play.appendChild(pc.el);
      const col = i % cols, row = Math.floor(i / cols);
      pc.x = tr.left - pr.left + 6 + col * sw * 0.78 + (rng() - 0.5) * 6;
      pc.y = tr.top - pr.top + 6 + (row % Math.max(1, Math.floor((tr.height - sw) / (sw * 0.55)) + 1)) * sw * 0.55 + (rng() - 0.5) * 6;
      Object.assign(pc.el.style, { left: pc.x + 'px', top: pc.y + 'px', transform: `scale(${TRAY_SCALE})`, transformOrigin: '0 0' });
      pc.el.style.zIndex = 10 + i;
    });
    q('count').textContent = `${placed.size}/${n * n}`;
  }

  // ---------- Drag ----------
  let drag = null, z = 1000;
  const play = q('play');
  play.addEventListener('pointerdown', (e) => {
    const pe = e.target.closest('.jig-piece'); if (!pe || pe.classList.contains('locked') || done) return;
    const pc = pieces.find((p) => p.k === +pe.dataset.k);
    play.setPointerCapture(e.pointerId);
    const pr = play.getBoundingClientRect();
    // lift to full size under the finger
    const rect = pe.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height;
    pe.style.transform = 'scale(1)'; pe.style.zIndex = ++z; pe.classList.add('dragging');
    drag = { pc, fx, fy, pr };
    move(e);
    sfx.tap();
  });
  function move(e) {
    const { pc, fx, fy, pr } = drag;
    pc.x = e.clientX - pr.left - fx * pc.w; pc.y = e.clientY - pr.top - fy * pc.w - 30;
    pc.el.style.left = pc.x + 'px'; pc.el.style.top = pc.y + 'px';
  }
  play.addEventListener('pointermove', (e) => { if (drag) move(e); });
  const end = () => {
    if (!drag) return;
    const { pc, pr } = drag; drag = null;
    pc.el.classList.remove('dragging');
    const br = q('board').getBoundingClientRect();
    const tx = br.left - pr.left + pc.c * cell - pc.pad, ty = br.top - pr.top + pc.r * cell - pc.pad;
    if (Math.hypot(pc.x - tx, pc.y - ty) < cell * 0.32) snap(pc);
    else if (pc.y > br.bottom - pr.top - 10) { pc.el.style.transform = `scale(${TRAY_SCALE})`; } // dropped back in the tray
  };
  play.addEventListener('pointerup', end);
  play.addEventListener('pointercancel', end);

  function snap(pc) {
    placed.add(pc.k);
    q('board').appendChild(pc.el);
    Object.assign(pc.el.style, { left: pc.c * cell - pc.pad + 'px', top: pc.r * cell - pc.pad + 'px', transform: 'none', zIndex: 1 });
    pc.el.classList.add('locked', 'snap');
    sfx.place(); buzz(12);
    jg.current = { level, placed: [...placed] }; save();
    q('count').textContent = `${placed.size}/${n * n}`;
    if (placed.size === n * n) win();
  }

  async function win() {
    done = true;
    if (level >= jg.level) jg.level = level + 1;
    jg.current = null; save(true);
    q('board').classList.add('complete');
    sfx.win(); confetti(3000);
    await new Promise((r) => setTimeout(r, 1100));
    const v = await dialog({ hero: `img/scene/${scene.items[0][0]}.png`, title: 'Picture complete!', dismissible: false, text: `${scene.name}, ${n * n} pieces in ${fmtTime((Date.now() - start) / 1000)}`, buttons: [{ label: 'Next puzzle', value: 'next' }, { label: 'Back', value: 'back', cls: 'ghost' }] });
    if (v === 'next') app.replace('jiggame', { level: level + 1 }); else app.back();
  }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'ghost') { jg.ghost = !jg.ghost; save(); q('ghost').classList.toggle('on', jg.ghost); sfx.tap(); }
    else if (a === 'hint' && !done) { const pc = pieces.find((p) => !placed.has(p.k)); if (pc) { sfx.hint(); snap(pc); } }
  });

  placed = new Set(jg.current && jg.current.level === level ? jg.current.placed : []);
  requestAnimationFrame(() => { build(); if (!jg.seenHelp) { jg.seenHelp = true; save(); setTimeout(jigsawHelp, 300); } });
  return { root };
}
