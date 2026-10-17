// Crate Mate: push every crate onto a marked spot (Sokoban). Swipe, use the pad, or tap a square to walk there.
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet, levelHome } from './kit.js';
import { parseLevel, step, walkPath, cornerStuck, frozenSquare, DIRS } from './crate-engine.js';

const CR = () => store.crate;
const IMG = 'img/kenney/sokoban/';
const T = { wall: 'block_08', floor: 'ground_04', spot: 'environment_10', crate: 'crate_02', done: 'crate_45' };
// Worker frames by facing (up, right, down, left): [standing, step a, step b]
const FACE = [['player_24', 'player_01', 'player_02'], ['player_09', 'player_10', 'player_11'], ['player_22', 'player_21', 'player_23'], ['player_12', 'player_13', 'player_14']];
const STEP_MS = 115;

let levels = null;
async function loadLevels() { if (!levels) { try { levels = (await (await fetch('levels/crate.json')).json()).levels; } catch { levels = []; } } return levels; }

export const crateHelp = () => helpSheet('How to play Crate Mate', [
  'Push every crate onto a green spot. A crate turns green when it is in place.',
  'Swipe anywhere or use the arrow pad to step. Tap a square to walk straight there, or tap a crate next to you to push it.',
  'You can only push, never pull, and only one crate at a time. A crate pushed into a corner is stuck, so undo is your friend.',
  'Par is the fewest pushes the level can be solved in.',
], 'crate-btn');

// A small diorama of tiles from a few rows of level text, used for the card art and the home hero.
function scene(rows, cs, cls) {
  const tiles = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '_') return;
    const pos = `left:${x * cs}px;top:${y * cs}px;width:${cs}px;height:${cs}px`;
    if (ch === '#') { tiles.push(`<img src="${IMG}${T.wall}.png" style="${pos}" alt="">`); return; }
    tiles.push(`<img src="${IMG}${T.floor}.png" style="${pos}" alt="">`);
    if ('.+'.includes(ch)) tiles.push(`<img src="${IMG}${T.spot}.png" style="${pos}" alt="">`);
    if (ch === '$') tiles.push(`<img src="${IMG}${T.crate}.png" style="${pos}" alt="">`);
    if (ch === '*') tiles.push(`<img src="${IMG}${T.done}.png" style="${pos}" alt="">`);
    if (ch === '@') tiles.push(`<img src="${IMG}${FACE[1][1]}.png" style="${pos}" alt="">`);
  }));
  return `<div class="cr-scene ${cls}" style="width:${rows[0].length * cs}px;height:${rows.length * cs}px">${tiles.join('')}</div>`;
}
export const crateCardArt = () => `<div class="art-crate">${scene(['#####', '#@$.#', '#*  #', '#####'], 24, 'art-crate-scene')}</div>`;

export function crateHomeScreen(app) {
  const cr = CR();
  return levelHome({
    app, cls: 'crate-theme', title: 'Crate Mate', help: crateHelp, load: loadLevels,
    hero: scene(['_#####_', '##   ##', '#@$  .#', '# * $ #', '#   . #', '#######'], 26, 'crate-hero'),
    play: () => {
      const i = Math.min(cr.level, levels.length - 1), L = levels[i];
      if (!L) return { label: 'Play' };
      const resume = cr.current && cr.current.idx === i && cr.current.path;
      return { label: `${resume ? 'Continue' : 'Play'} level ${i + 1}`, sub: `${L.boxes} ${L.boxes === 1 ? 'crate' : 'crates'} · par ${L.pushes} pushes` };
    },
    onPlay: () => levels.length && app.go('crategame', { idx: Math.min(cr.level, levels.length - 1) }),
    levels: () => ({ count: levels.length, current: Math.min(cr.level, levels.length - 1), done: (i) => i < cr.level || !!cr.best[i] }),
    onLevel: (i) => app.go('crategame', { idx: i }),
  });
}

export function crateGameScreen(app, { idx }) {
  const cr = CR();
  const root = el(`<section class="screen crate-theme crate-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">Level ${idx + 1}</div><button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="cr-hud">
      <div><small>Moves</small><b data-el="moves">0</b></div>
      <div><small>Pushes</small><b data-el="pushes">0</b></div>
      <div><small>Par</small><b data-el="par">-</b></div>
      <div><small>Best</small><b data-el="best">-</b></div>
    </div>
    <div class="cr-wrap" data-el="wrap"><div class="cr-board" data-el="board"><div class="cr-static" data-el="static"></div></div></div>
    <div class="cr-bar">
      <button class="cr-round" data-act="undo" aria-label="Undo">${icon.undo}<span>Undo</span></button>
      <div class="cr-pad">${['up', 'left', 'right', 'down'].map((d) => `<button class="cr-key ${d}" data-dir="${d[0]}" aria-label="Step ${d}"><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button>`).join('')}</div>
      <button class="cr-round" data-act="restart" aria-label="Restart">${icon.restart}<span>Restart</span></button>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const wrap = q('wrap'), board = q('board');
  let lv, L, boxes, player, face = 2, moves = 0, pushes = 0, history = [], path = '', group = 0, saved = null;
  let crateEls = [], playerEl, cs = 40, queue = [], busy = false, done = false, stuckWarned = false, walkFrame = 0;
  const landing = new Set();

  function build() {
    L = levels[idx];
    lv = parseLevel(L.rows);
    q('par').textContent = L.pushes;
    const st = q('static');
    let html = '';
    for (let i = 0; i < lv.w * lv.h; i++) {
      const x = i % lv.w, y = (i / lv.w) | 0;
      if (lv.wall[i] && !nearInside(i)) continue;
      const kind = lv.inside[i] ? 'floor' : lv.wall[i] ? 'wall' : '';
      if (!kind) continue;
      html += `<i class="t ${kind}" style="--x:${x};--y:${y}"></i>`;
      if (lv.goal[i]) html += `<i class="t spot" style="--x:${x};--y:${y}"></i>`;
    }
    st.innerHTML = html;
    crateEls = lv.boxes.map(() => { const n = el('<div class="cr-crate"><i></i></div>'); board.appendChild(n); return n; });
    playerEl = el('<div class="cr-player"><i></i></div>'); board.appendChild(playerEl);
    reset();
    // resume a level left part way through
    if (cr.current && cr.current.idx === idx && cr.current.path) replay(cr.current.path);
    layout(); render(true);
  }
  const nearInside = (i) => { const x = i % lv.w, y = (i / lv.w) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const cx = x + dx, cy = y + dy; if (cx >= 0 && cy >= 0 && cx < lv.w && cy < lv.h && lv.inside[cy * lv.w + cx]) return true; } return false; };

  function reset() { boxes = lv.boxes.slice(); player = lv.player; face = 2; moves = 0; pushes = 0; history = []; path = ''; done = false; stuckWarned = false; }

  function layout() {
    const r = wrap.getBoundingClientRect();
    cs = Math.max(16, Math.floor(Math.min((r.width - 16) / lv.w, (r.height - 16) / lv.h, 68)));
    board.style.width = cs * lv.w + 'px'; board.style.height = cs * lv.h + 'px';
    board.style.setProperty('--cs', cs + 'px');
    render(true);
  }

  // ---------- Moves ----------
  function tryMove(d, g) {
    const t = step(lv, player, d);
    if (t < 0) return null;
    const bi = boxes.indexOf(t);
    let pushed = -1;
    if (bi >= 0) {
      const t2 = step(lv, t, d);
      if (t2 < 0 || boxes.includes(t2)) return null;
      history.push({ player, boxes: boxes.slice(), moves, pushes, face, g });
      boxes[bi] = t2; pushes++; pushed = bi;
    } else history.push({ player, boxes: boxes.slice(), moves, pushes, face, g });
    player = t; face = d; moves++;
    path += pushed >= 0 ? DIRS[d].toUpperCase() : DIRS[d];
    return { pushed };
  }

  function replay(p) {
    for (const ch of p) { const d = 'urdl'.indexOf(ch.toLowerCase()); if (d < 0 || !tryMove(d, ++group)) break; }
  }

  // Steps queue: swipes, the pad and tap-to-walk all feed it, and it plays one step at a time.
  function enqueue(dirs, replace = false) {
    if (done) return;
    if (replace || queue.g) queue = dirs.slice(); else queue.push(...dirs); // a swipe cancels a walk in progress
    pump();
  }
  function pump() {
    if (busy || done) return;
    if (!queue.length) { render(); return; }
    const d = queue.shift();
    const res = tryMove(d, queue.g || ++group); // a tap-walk undoes as one move
    if (!res) { queue = []; face = d; bump(d); render(); return; }
    busy = true; walkFrame ^= 1;
    if (res.pushed >= 0) afterPush(res.pushed);
    render(false, true);
    persist();
    setTimeout(() => { busy = false; if (!checkWin()) pump(); }, STEP_MS);
  }
  function bump(d) {
    buzz(8);
    playerEl.firstElementChild.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${DX(d) * cs * 0.12}px,${DY(d) * cs * 0.12}px)` }, { transform: 'translate(0,0)' }], { duration: 160 });
  }
  const DX = (d) => [0, 1, 0, -1][d], DY = (d) => [-1, 0, 1, 0][d];

  function afterPush(bi) {
    const b = boxes[bi], inner = crateEls[bi].firstElementChild;
    if (lv.goal[b]) {
      // turn green and pop as the crate lands, not as it sets off
      landing.add(bi);
      setTimeout(() => {
        landing.delete(bi);
        if (boxes[bi] !== b) return;
        crateEls[bi].classList.add('on');
        sfx.place(); buzz(12);
        inner.classList.remove('pop'); void inner.offsetWidth; inner.classList.add('pop');
      }, STEP_MS - 15);
    } else sfx.cross();
    // gentle deadlock hint: a crate that can never move again, away from a spot
    const occ = new Uint8Array(lv.w * lv.h); boxes.forEach((x) => (occ[x] = 1));
    if (!lv.goal[b] && (cornerStuck(lv, b) || frozenSquare(lv, occ, b)) && !stuckWarned) {
      stuckWarned = true;
      setTimeout(() => toast('That crate is stuck now. Undo to free it.', 2600), STEP_MS);
    }
  }

  function stuckSet() {
    const occ = new Uint8Array(lv.w * lv.h); boxes.forEach((x) => (occ[x] = 1));
    return new Set(boxes.filter((b) => !lv.goal[b] && (cornerStuck(lv, b) || frozenSquare(lv, occ, b))));
  }

  // ---------- Drawing ----------
  function render(instant = false, walking = false) {
    const pos = (i) => `translate(${(i % lv.w) * cs}px,${((i / lv.w) | 0) * cs}px)`;
    board.classList.toggle('instant', instant);
    const stuck = stuckSet();
    boxes.forEach((b, k) => {
      const n = crateEls[k];
      n.style.transform = pos(b);
      if (!landing.has(k)) n.classList.toggle('on', !!lv.goal[b]);
      n.classList.toggle('stuck', stuck.has(b));
    });
    playerEl.style.transform = pos(player);
    const frame = walking ? 1 + walkFrame : 0;
    playerEl.firstElementChild.style.backgroundImage = `url(${IMG}${FACE[face][frame]}.png)`;
    if (walking) { clearTimeout(playerEl._idle); playerEl._idle = setTimeout(() => { if (!busy) playerEl.firstElementChild.style.backgroundImage = `url(${IMG}${FACE[face][0]}.png)`; }, STEP_MS + 40); }
    q('moves').textContent = moves; q('pushes').textContent = pushes;
    const b = cr.best[idx]; q('best').textContent = b ? b.m : '-';
    $('[data-act="undo"]', root).disabled = !history.length && !saved;
    if (instant) { void board.offsetWidth; board.classList.remove('instant'); }
  }

  function persist() { cr.current = { idx, path }; save(); }

  function undo() {
    if (done) return;
    queue = [];
    if (!history.length) {
      if (!saved) return;
      ({ boxes, player, face, moves, pushes, history, path } = saved); saved = null;
    } else {
      const g = history[history.length - 1].g;
      let h;
      while (history.length && history[history.length - 1].g === g) { h = history.pop(); path = path.slice(0, -1); }
      ({ player, boxes, moves, pushes, face } = h);
    }
    sfx.erase(); persist(); render();
  }
  function restart() {
    if (done || !moves) return;
    queue = [];
    saved = { boxes, player, face, moves, pushes, history, path }; // one undo brings the attempt back
    reset(); sfx.erase(); persist(); render(true);
  }

  function checkWin() {
    if (done || !boxes.every((b) => lv.goal[b])) return false;
    done = true; queue = [];
    win();
    return true;
  }
  async function win() {
    const prev = cr.best[idx];
    const best = { m: Math.min(prev ? prev.m : Infinity, moves), p: Math.min(prev ? prev.p : Infinity, pushes) };
    const record = prev && (moves < prev.m || pushes < prev.p);
    cr.best[idx] = best;
    if (idx >= cr.level) cr.level = idx + 1;
    cr.current = null; save(true);
    render();
    crateEls.forEach((n, k) => setTimeout(() => { const i = n.firstElementChild; i.classList.remove('pop'); void i.offsetWidth; i.classList.add('pop'); }, 120 + k * 90));
    sfx.win(); confetti();
    await new Promise((r) => setTimeout(r, 900));
    const perfect = pushes === L.pushes;
    const v = await dialog({
      hero: 'img/art/ui/trophy.svg', title: 'All crates in place!', dismissible: false,
      text: `Level ${idx + 1} in ${moves} moves and ${pushes} pushes`,
      notes: perfect ? 'Perfect: you matched par on pushes.' : record ? 'New best for this level.' : `Par is ${L.pushes} pushes. Can you match it?`,
      buttons: [...(idx + 1 < levels.length ? [{ label: 'Next level', value: 'next' }] : []), { label: 'Play again', value: 'again', cls: 'ghost' }, { label: 'Back', value: 'back', cls: 'ghost' }],
    });
    if (v === 'next') app.replace('crategame', { idx: idx + 1 });
    else if (v === 'again') app.replace('crategame', { idx });
    else app.back();
  }

  // ---------- Input ----------
  let pt = null;
  wrap.addEventListener('pointerdown', (e) => {
    if (!lv) return;
    pt = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, swiped: false };
    try { wrap.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!pt || e.pointerId !== pt.id) return;
    const dx = e.clientX - pt.x, dy = e.clientY - pt.y, th = Math.max(26, cs * 0.7);
    if (Math.max(Math.abs(dx), Math.abs(dy)) < th) return;
    const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
    pt.x = e.clientX; pt.y = e.clientY; pt.swiped = true;
    if (queue.length < 1) enqueue([d]); // keep dragging to keep walking, without running ahead
  });
  const endPointer = (e) => {
    if (!pt || e.pointerId !== pt.id) return;
    const moved = Math.hypot(e.clientX - pt.x0, e.clientY - pt.y0);
    const wasSwipe = pt.swiped; pt = null;
    if (wasSwipe || moved > 12 || e.type === 'pointercancel') return;
    tapAt(e.clientX, e.clientY);
  };
  wrap.addEventListener('pointerup', endPointer);
  wrap.addEventListener('pointercancel', endPointer);

  function tapAt(cx, cy) {
    if (done) return;
    const r = board.getBoundingClientRect();
    const x = Math.floor((cx - r.left) / cs), y = Math.floor((cy - r.top) / cs);
    if (x < 0 || y < 0 || x >= lv.w || y >= lv.h) return;
    const i = y * lv.w + x;
    if (!lv.inside[i] || i === player) return;
    const bi = boxes.indexOf(i);
    if (bi >= 0) {
      const d = [0, 1, 2, 3].find((dd) => step(lv, player, dd) === i);
      if (d !== undefined) { enqueue([d], true); return; }
      buzz(8); return;
    }
    const p = walkPath(lv, new Set(boxes), player, i);
    if (!p) { buzz(8); return; }
    sfx.tap();
    group++; queue = p.slice(); queue.g = group; pump();
  }

  // the pad repeats while held
  let hold = null;
  const stopHold = () => { clearTimeout(hold); clearInterval(hold); hold = null; };
  root.addEventListener('pointerdown', (e) => {
    const k = e.target.closest('[data-dir]'); if (!k) return;
    e.preventDefault();
    const d = 'urdl'.indexOf(k.dataset.dir);
    k.classList.add('held');
    enqueue([d]);
    stopHold();
    hold = setTimeout(() => { hold = setInterval(() => { if (!queue.length) enqueue([d]); }, STEP_MS + 10); }, 320);
    const up = () => { k.classList.remove('held'); stopHold(); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  });

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') crateHelp();
    else if (a === 'undo') undo();
    else if (a === 'restart') restart();
  });

  const onKey = (e) => {
    if (!root.isConnected || root.style.display === 'none' || document.querySelector('#overlay-root > *')) return;
    const d = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3 }[e.key];
    if (d !== undefined) { e.preventDefault(); if (queue.length < 2) enqueue([d]); }
    else if (e.key === 'z' || e.key === 'Backspace') undo();
    else if (e.key === 'r') restart();
  };
  document.addEventListener('keydown', onKey);
  const onResize = () => lv && layout();
  window.addEventListener('resize', onResize);

  loadLevels().then(() => {
    if (!levels[idx]) { toast('Level not found'); return; }
    build();
    requestAnimationFrame(() => layout());
    if (!cr.seenHelp) { cr.seenHelp = true; save(); setTimeout(crateHelp, 300); }
  });

  return {
    root,
    onShow() { lv && layout(); },
    destroy() { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); stopHold(); },
  };
}
