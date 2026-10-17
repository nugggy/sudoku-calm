// Island Hop (Hashiwokakero): join every island into one group with bridges that match the island numbers.
import { store, save, fmtTime } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet, levelHome } from './kit.js';
import { boardOf, buildBoard, edgeToward, isSolved, logicSolve } from './hashi-engine.js';

const HS = () => store.hashi;
const TIERS = ['', 'Easy', 'Medium', 'Hard', 'Expert'];
let puzzles = null;
async function loadPuzzles() { if (!puzzles) { try { puzzles = (await (await fetch('levels/hashi.json')).json()).puzzles; } catch { puzzles = []; } } return puzzles; }

export const hashiHelp = () => helpSheet('How to play Island Hop', [
  'Join all the islands into one group by building bridges between them.',
  'The number on each island is how many bridges it needs. Bridges run straight across or down, cannot cross each other, and two islands can share one or two bridges.',
  'Drag from an island toward a neighbour to build a bridge. Do it again for a double bridge, and once more to take it away. You can also tap the water between two islands.',
  'An island turns green when it has just the right number of bridges, and red when it has too many.',
], 'hashi-btn');

// ---------- Drawing (shared by the board, the home hero and the card art) ----------
// Wooden plank bridge between two points, single or double, c is the cell size.
function bridgeSvg(x1, y1, x2, y2, count, c, cls = '') {
  const horiz = y1 === y2, R = c * 0.36;
  // stop at the beaches so the planks meet the sand
  if (horiz) { x1 += R; x2 -= R; } else { y1 += R; y2 -= R; }
  const lanes = count === 2 ? [-c * 0.14, c * 0.14] : [0], pw = count === 2 ? c * 0.2 : c * 0.3;
  const pt = Math.max(3, c * 0.12), gap = Math.max(2, c * 0.07), rope = Math.max(1.3, c * 0.045);
  let s = `<g class="hs-bridge ${cls}">`;
  for (const o of lanes) {
    const [ax, ay, bx, by] = horiz ? [x1, y1 + o, x2, y2 + o] : [x1 + o, y1, x2 + o, y2];
    const [nx, ny] = horiz ? [0, pw / 2] : [pw / 2, 0];
    s += `<line class="pl-dk" x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke-width="${pw + 2}" stroke-dasharray="${pt + 1.4} ${gap - 1.4}" stroke-dashoffset=".7"/>`
      + `<line class="pl" x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke-width="${pw}" stroke-dasharray="${pt} ${gap}"/>`
      + `<line class="rope" x1="${ax - nx}" y1="${ay - ny}" x2="${bx - nx}" y2="${by - ny}" stroke-width="${rope}"/>`
      + `<line class="rope" x1="${ax + nx}" y1="${ay + ny}" x2="${bx + nx}" y2="${by + ny}" stroke-width="${rope}"/>`;
  }
  return s + '</g>';
}

// Round sandy island with its number; the top grows grass once the island is complete.
function islandSvg(x, y, n, c, i = -1) {
  const R = c * 0.4;
  return `<g class="hs-isl" ${i >= 0 ? `data-i="${i}"` : ''} transform="translate(${x} ${y})"><g class="body">
    <circle class="shoal" r="${R * 1.2}"/><circle class="beach" r="${R}" cy="${c * 0.025}"/>
    <circle class="top" r="${R * 0.76}" cy="${-c * 0.02}"/><circle class="shine" r="${R * 0.3}" cx="${-R * 0.32}" cy="${-R * 0.4}"/>
    <text class="num" y="${c * 0.005}" font-size="${c * 0.44}">${n}</text></g></g>`;
}

// A little fixed scene used by the home hero and the picker card.
function miniScene(c, cls) {
  const B = buildBoard(3, 3, '3.2...2.1');
  const counts = [2, 1, 0, 1]; // edges: top, left, right, bottom
  const pos = (isl) => [(isl.c + 0.5) * c, (isl.r + 0.5) * c];
  let s = `<svg class="${cls}" viewBox="0 0 ${3 * c} ${3 * c}">`;
  B.edges.forEach((e, ei) => { if (counts[ei]) { const [x1, y1] = pos(B.islands[e.a]), [x2, y2] = pos(B.islands[e.b]); s += bridgeSvg(x1, y1, x2, y2, counts[ei], c); } });
  B.islands.forEach((isl, i) => { const [x, y] = pos(isl); s += islandSvg(x, y, isl.n, c, i).replace('class="hs-isl"', 'class="hs-isl done"'); });
  return s + '</svg>';
}

export const hashiCardArt = () => `<div class="art-hashi">${miniScene(30, 'art-hashi-svg')}</div>`;

export function hashiHomeScreen(app) {
  return levelHome({
    app, cls: 'hashi-theme', title: 'Island Hop', help: hashiHelp, load: loadPuzzles,
    hero: `<div class="hs-hero">${miniScene(44, 'hs-hero-svg')}<img class="hs-ship" src="img/kenney/pirate-ships/ship (2).png" alt=""></div>`,
    play: () => {
      const i = Math.min(HS().level, puzzles.length - 1), p = puzzles[i];
      return { label: HS().level >= puzzles.length ? 'Play again' : `Play level ${i + 1}`, sub: p ? `${p.w}×${p.h} · ${TIERS[p.d]}` : '' };
    },
    onPlay: () => app.go('hashigame', { idx: Math.min(HS().level, puzzles.length - 1) }),
    levels: () => ({ count: puzzles.length, current: HS().level, done: (i) => i < HS().level }),
    onLevel: (i) => app.go('hashigame', { idx: i }),
  });
}

export function hashiGameScreen(app, { idx }) {
  const hs = HS();
  const root = el(`<section class="screen hashi-theme hashi-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">Level ${idx + 1}</div><span class="cross-time" data-el="time">00:00</span>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="hs-info"><span class="hs-tier" data-el="tier"></span><span>Islands <b data-el="prog">0/0</b></span></div>
    <div class="hs-wrap" data-el="wrap"><div class="hs-board" data-el="board"><svg data-el="svg"><g class="hs-grid"></g><g class="hs-bridges"></g><g class="hs-ghost"></g><g class="hs-islands"></g></svg></div></div>
    <div class="tools hs-tools">
      <button class="tool" data-act="undo"><span class="ic">${icon.undo}</span>Undo</button>
      <button class="tool" data-act="restart"><span class="ic">${icon.restart}</span>Restart</button>
      <button class="tool" data-act="hint"><span class="ic">${icon.bulb}</span>Hint</button>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const board = q('board'), svg = q('svg');
  const layer = (k) => $(`.hs-${k}`, svg);
  let P, B, sol, counts, c = 40, pad = 12, sel = -1, undo = [], elapsed = 0, tick = null, done = false, order = null, glowEdge = -1, fresh = -1;

  const pos = (a) => [(B.islands[a].c + 0.5) * c, (B.islands[a].r + 0.5) * c];
  const total = (a) => B.islands[a].edges.reduce((s, ei) => s + counts[ei], 0);
  const other = (ei, a) => (B.edges[ei].a === a ? B.edges[ei].b : B.edges[ei].a);

  function layout() {
    const r = q('wrap').getBoundingClientRect();
    const availW = (r.width || innerWidth) - 8, availH = (r.height || innerHeight - 240) - 12;
    // a margin of sea around the edge islands
    c = Math.floor(Math.min(availW / (P.w + 0.5), availH / (P.h + 0.5), 62));
    pad = Math.round(c * 0.25);
    const W = c * P.w + pad * 2, H = c * P.h + pad * 2;
    board.style.width = W + 'px'; board.style.height = H + 'px';
    board.style.setProperty('--hc', c + 'px');
    svg.setAttribute('viewBox', `${-pad} ${-pad} ${W} ${H}`);
    // faint grid of dots at the cell centres helps line things up on bigger boards
    let g = '';
    for (let rr = 0; rr < P.h; rr++) for (let cc = 0; cc < P.w; cc++) g += `<circle cx="${(cc + 0.5) * c}" cy="${(rr + 0.5) * c}" r="${Math.max(1.2, c * 0.04)}"/>`;
    layer('grid').innerHTML = g;
    layer('islands').innerHTML = B.islands.map((isl, i) => { const [x, y] = pos(i); return islandSvg(x, y, isl.n, c, i); }).join('');
    render();
  }

  function render() {
    let s = '';
    B.edges.forEach((e, ei) => {
      if (!counts[ei]) return;
      const [x1, y1] = pos(e.a), [x2, y2] = pos(e.b);
      s += bridgeSvg(x1, y1, x2, y2, counts[ei], c, ei === glowEdge ? 'glow' : ei === fresh ? 'new' : '').replace('<g class="hs-bridge', `<g data-e="${ei}" class="hs-bridge`);
    });
    layer('bridges').innerHTML = s;
    fresh = -1; // only the bridge just built fades in
    const cand = new Set(sel >= 0 ? B.islands[sel].edges.map((ei) => other(ei, sel)) : []);
    let full = 0;
    $$('.hs-isl', svg).forEach((g) => {
      const i = +g.dataset.i, t = total(i), n = B.islands[i].n;
      if (t === n) full++;
      g.classList.toggle('done', t === n);
      g.classList.toggle('over', t > n);
      g.classList.toggle('sel', i === sel);
      g.classList.toggle('cand', cand.has(i));
    });
    q('prog').textContent = `${full}/${B.islands.length}`;
  }

  const popIsland = (i, cls = 'pop') => { const g = $(`.hs-isl[data-i="${i}"]`, svg); if (!g) return; g.classList.remove(cls); void g.getBBox(); g.classList.add(cls); };

  function persist() { hs.current = done ? null : { idx, b: counts.join(''), t: elapsed }; save(); }

  // Add a bridge on an edge, cycling none -> one -> two -> none.
  function cycle(ei) {
    if (done || ei < 0) return;
    const next = (counts[ei] + 1) % 3;
    if (next === 1) {
      const block = B.edges[ei].cross.filter((x) => counts[x]);
      if (block.length) {
        sfx.error(); buzz(30);
        block.forEach((x) => { const n = $(`[data-e="${x}"]`, svg); if (n) { n.classList.remove('clash'); void n.getBBox(); n.classList.add('clash'); } });
        toast('Bridges cannot cross', 1400);
        return;
      }
    }
    undo.push(counts.slice());
    counts[ei] = next;
    glowEdge = -1; fresh = ei;
    const ends = [B.edges[ei].a, B.edges[ei].b];
    render();
    const completed = ends.filter((a) => total(a) === B.islands[a].n);
    const over = ends.filter((a) => total(a) > B.islands[a].n);
    if (over.length) { sfx.cross(); buzz(20); over.forEach((a) => popIsland(a, 'shake')); }
    else if (completed.length && next) { sfx.unit(); buzz(12); completed.forEach((a) => popIsland(a)); }
    else if (next) { sfx.place(); buzz(8); }
    else sfx.erase();
    persist(); checkWin();
  }

  async function checkWin() {
    if (!B.islands.every((isl, a) => total(a) === isl.n)) return;
    if (!isSolved(B, counts)) { toast('Every island is full, but they are not all joined up yet'); return; }
    done = true; stopTimer(); sel = -1;
    if (idx >= hs.level) hs.level = idx + 1;
    hs.current = null; save(true);
    render();
    // a ripple of little hops across the islands
    B.islands.forEach((isl, i) => setTimeout(() => popIsland(i, 'hop'), (isl.r + isl.c) * 45));
    sfx.win(); confetti();
    await new Promise((r) => setTimeout(r, 1000));
    const more = idx + 1 < puzzles.length;
    const v = await dialog({ hero: 'img/art/ui/trophy.svg', title: 'All islands joined!', dismissible: false, text: `Level ${idx + 1} in ${fmtTime(elapsed)}`, buttons: [...(more ? [{ label: 'Next level', value: 'next', cls: 'hashi-btn' }] : []), { label: 'Back', value: 'back', cls: 'ghost' }] });
    if (v === 'next') app.replace('hashigame', { idx: idx + 1 }); else app.back();
  }

  function hint() {
    if (done) return;
    // first take away a bridge that should not be there, otherwise build the next one a solver would find
    let ei = counts.findIndex((v, e) => v > sol[e]);
    if (ei < 0) {
      if (!order) order = logicSolve(B).order;
      ei = order.find((e) => counts[e] < sol[e]) ?? sol.findIndex((v, e) => counts[e] < v);
    }
    if (ei < 0) return;
    undo.push(counts.slice());
    counts[ei] = sol[ei];
    glowEdge = ei; sel = -1;
    sfx.hint(); render();
    [B.edges[ei].a, B.edges[ei].b].forEach((a) => popIsland(a, total(a) === B.islands[a].n ? 'pop' : 'glow'));
    persist(); checkWin();
  }

  // ---------- Input: drag from an island, tap the water between two islands, or tap two islands ----------
  let down = null;
  const local = (e) => { const r = board.getBoundingClientRect(); return [e.clientX - r.left - pad, e.clientY - r.top - pad]; };
  function islandAt(x, y) {
    let best = -1, bd = c * 0.6;
    B.islands.forEach((_, i) => { const [ix, iy] = pos(i), d = Math.hypot(ix - x, iy - y); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function edgeAt(x, y) {
    let best = -1, bd = c * 0.45;
    B.edges.forEach((e, ei) => {
      const [x1, y1] = pos(e.a), [x2, y2] = pos(e.b);
      const d = e.horiz ? (x > x1 && x < x2 ? Math.abs(y - y1) : 1e9) : (y > y1 && y < y2 ? Math.abs(x - x1) : 1e9);
      if (d < bd) { bd = d; best = ei; }
    });
    return best;
  }
  function ghost(ei) {
    if (ei < 0) { layer('ghost').innerHTML = ''; return; }
    const e = B.edges[ei], [x1, y1] = pos(e.a), [x2, y2] = pos(e.b);
    layer('ghost').innerHTML = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${c * 0.34}"/>`;
  }
  board.addEventListener('pointerdown', (e) => {
    if (done || !B) return;
    const [x, y] = local(e);
    down = { x, y, isl: islandAt(x, y), edge: -1 };
    try { board.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    if (down.isl >= 0) popIsland(down.isl, 'press');
  });
  board.addEventListener('pointermove', (e) => {
    if (!down || down.isl < 0) return;
    const [x, y] = local(e), dx = x - down.x, dy = y - down.y;
    let ei = -1;
    if (Math.hypot(dx, dy) > c * 0.35) ei = Math.abs(dx) > Math.abs(dy) ? edgeToward(B, down.isl, 0, Math.sign(dx)) : edgeToward(B, down.isl, Math.sign(dy), 0);
    if (ei !== down.edge) { down.edge = ei; ghost(ei); if (ei >= 0) buzz(4); }
  });
  board.addEventListener('pointerup', (e) => {
    if (!down) return;
    const d = down; down = null; ghost(-1);
    if (d.edge >= 0) { sel = -1; cycle(d.edge); return; }
    const [x, y] = local(e);
    if (Math.hypot(x - d.x, y - d.y) > c * 0.35) { render(); return; }
    if (d.isl >= 0) {
      const link = sel >= 0 && sel !== d.isl ? B.islands[sel].edges.find((ei) => other(ei, sel) === d.isl) : undefined;
      if (link !== undefined) { sel = -1; cycle(link); return; }
      sel = sel === d.isl ? -1 : d.isl; sfx.tap(); render(); return;
    }
    const ei = edgeAt(x, y);
    sel = -1;
    if (ei >= 0) cycle(ei); else render();
  });
  board.addEventListener('pointercancel', () => { down = null; ghost(-1); });

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') hashiHelp();
    else if (a === 'undo' && !done) {
      if (!undo.length) return;
      counts = undo.pop(); glowEdge = -1; sel = -1; sfx.erase(); render(); persist();
    } else if (a === 'restart' && !done) {
      if (!counts.some(Boolean)) return;
      undo.push(counts.slice()); counts.fill(0); glowEdge = -1; sel = -1; sfx.erase(); render(); persist();
      toast('Board cleared. Undo brings it back.', 1600);
    } else if (a === 'hint') hint();
  });

  function startTimer() { stopTimer(); if (!done && P) tick = setInterval(() => { elapsed++; q('time').textContent = fmtTime(elapsed); if (elapsed % 5 === 0) persist(); }, 1000); }
  function stopTimer() { clearInterval(tick); tick = null; }
  const onResize = () => { if (P) layout(); };
  addEventListener('resize', onResize);

  (async () => {
    const all = await loadPuzzles();
    P = all[idx];
    if (!P) { app.back(); return; }
    B = boardOf(P); sol = [...P.s].map(Number);
    const cur = hs.current && hs.current.idx === idx && hs.current.b.length === sol.length ? hs.current : null;
    counts = cur ? [...cur.b].map(Number) : sol.map(() => 0);
    elapsed = cur ? cur.t : 0;
    q('time').textContent = fmtTime(elapsed);
    q('tier').textContent = `${P.w}×${P.h} · ${TIERS[P.d]}`;
    q('tier').classList.add('t' + P.d);
    requestAnimationFrame(() => { layout(); startTimer(); });
    if (!hs.seenHelp) { hs.seenHelp = true; save(); setTimeout(hashiHelp, 300); }
  })();
  return {
    root,
    destroy() { stopTimer(); removeEventListener('resize', onResize); if (!done && counts) persist(); save(true); },
    onHide() { stopTimer(); },
    onShow() { startTimer(); },
  };
}
