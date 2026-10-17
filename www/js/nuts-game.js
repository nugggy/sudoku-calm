// Nuts & Bolts: sort coloured nuts so each bolt holds one colour.
import { mulberry32 } from './sudoku-engine.js';
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet, levelHome } from './kit.js';

const CAP = 4;
export const NUT_COLOURS = ['#ff4d6d', '#ff9f1c', '#ffd60a', '#2ec4b6', '#3a86ff', '#8338ec', '#ff70a6', '#70e000', '#8d99ae', '#a0522d'];
const NB = () => store.nuts;
export const nutsHelp = () => helpSheet('How to play Nuts & Bolts', [
  'Tap a bolt to unscrew its top nut, then tap another bolt to drop it on.',
  'A nut can only go onto an empty bolt or onto a nut of the same colour. Matching nuts on top move together.',
  'Sort every colour onto its own bolt to finish the level. Every level can be solved.',
], 'nuts-btn');

// ---------- Engine ----------
export function recipe(level) {
  const n = level + 1;
  const k = Math.min(10, 3 + Math.floor((n - 1) / 4));
  return { k, bolts: k + 2 }; // two spare bolts, like classic sort puzzles
}
const topRun = (b) => { if (!b.length) return { c: null, n: 0 }; const c = b[b.length - 1]; let n = 1; while (n < b.length && b[b.length - 1 - n] === c) n++; return { c, n }; };
const canMove = (s, a, b) => { if (a === b || !s[a].length || s[b].length >= CAP) return false; const t = s[b][s[b].length - 1]; return t === undefined || t === s[a][s[a].length - 1]; };
function doMove(s, a, b) {
  const { c, n } = topRun(s[a]);
  const k = Math.min(n, CAP - s[b].length);
  for (let i = 0; i < k; i++) { s[a].pop(); s[b].push(c); }
  return k;
}
const solved = (s) => s.every((b) => !b.length || (b.length === CAP && b.every((x) => x === b[0])));
const key = (s) => s.map((b) => b.join('')).sort().join('|');

export function solve(start, limit = 60000) {
  const seen = new Set(); let nodes = 0; const path = [];
  function dfs(s) {
    if (solved(s)) return true;
    const k = key(s); if (seen.has(k) || ++nodes > limit) return false; seen.add(k);
    const moves = [];
    for (let a = 0; a < s.length; a++) for (let b = 0; b < s.length; b++) {
      if (!canMove(s, a, b)) continue;
      const run = topRun(s[a]);
      if (!s[b].length && run.n === s[a].length) continue; // pointless: whole bolt to an empty bolt
      moves.push([a, b, (s[b].length ? 10 : 0) + run.n]);
    }
    moves.sort((x, y) => y[2] - x[2]);
    for (const [a, b] of moves) {
      const t = s.map((x) => x.slice()); doMove(t, a, b);
      path.push([a, b]);
      if (dfs(t)) return true;
      path.pop();
      if (nodes > limit) return false;
    }
    return false;
  }
  return dfs(start.map((b) => b.slice())) ? path : null;
}

export function makeLevel(level) {
  const { k, bolts } = recipe(level);
  const rng = mulberry32(5150 + level * 7717);
  for (let t = 0; t < 200; t++) {
    const nuts = []; for (let c = 0; c < k; c++) for (let i = 0; i < CAP; i++) nuts.push(c);
    for (let i = nuts.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [nuts[i], nuts[j]] = [nuts[j], nuts[i]]; }
    const s = [...Array(bolts)].map(() => []);
    nuts.forEach((c, i) => s[Math.floor(i / CAP)].push(c));
    if (s.some((b) => b.length === CAP && b.every((x) => x === b[0]))) continue;
    if (solve(s)) return s;
  }
  throw new Error('no level ' + level);
}

// ---------- Home ----------
export function nutsHomeScreen(app) {
  return levelHome({
    app, cls: 'nuts-theme', title: 'Nuts &amp; Bolts', help: nutsHelp,
    hero: `<div class="nuts-hero">${[0, 4, 2].map((c) => `<div class="nh-bolt">${[c, (c + 3) % 10, c].map((x) => `<i class="nut" style="--nc:${NUT_COLOURS[x]}"></i>`).join('')}</div>`).join('')}</div>`,
    play: () => ({ label: `Play level ${NB().level + 1}`, sub: `${recipe(NB().level).k} colours` }),
    onPlay: () => app.go('nutsgame', { level: NB().level }),
    levels: () => ({ count: Math.max(30, Math.ceil((NB().level + 15) / 5) * 5), current: NB().level, done: (i) => i < NB().level }),
    onLevel: (i) => app.go('nutsgame', { level: i }),
  });
}

// ---------- Game ----------
export function nutsGameScreen(app, { level }) {
  const nb = NB();
  let s = makeLevel(level), history = [], sel = -1, busy = false, extra = false, moves = 0;
  const root = el(`<section class="screen nuts-theme nuts-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">Level ${level + 1}</div><button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="nuts-area" data-el="area"></div>
    <div class="nuts-bar">
      <button class="sort-boost" data-act="undo" aria-label="Undo">${icon.undo}</button>
      <button class="sort-boost" data-act="restart" aria-label="Restart">${icon.restart}</button>
      <button class="sort-boost" data-act="bolt" aria-label="Extra bolt">${icon.plus}<span class="plus" data-el="bolt">1</span></button>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const area = q('area');

  function render(lift = -1) {
    const perRow = s.length <= 6 ? s.length : Math.ceil(s.length / 2);
    area.style.setProperty('--per', perRow);
    area.innerHTML = s.map((b, i) => {
      const run = i === lift ? topRun(b).n : 0;
      return `<div class="bolt ${i === sel ? 'sel' : ''} ${b.length === CAP && b.every((x) => x === b[0]) ? 'full' : ''}" data-b="${i}"><div class="rod"></div>
        <div class="stack">${b.map((c, j) => `<i class="nut ${j >= b.length - run ? 'up' : ''}" style="--nc:${NUT_COLOURS[c]}"></i>`).join('')}</div><div class="plate"></div></div>`;
    }).join('');
    $('[data-act="undo"]', root).disabled = !history.length;
    q('bolt').textContent = extra ? '0' : '1';
    q('bolt').classList.toggle('none', extra);
  }

  async function animateMove(a, b, n, colour) {
    const fromNuts = $$(`.bolt[data-b="${a}"] .nut`, area).slice(-n).map((x) => x.getBoundingClientRect());
    render();
    const toNuts = $$(`.bolt[data-b="${b}"] .nut`, area).slice(-n);
    toNuts.forEach((x) => (x.style.visibility = 'hidden'));
    await Promise.all(toNuts.map((t, i) => {
      const fr = fromNuts[fromNuts.length - 1 - i] || fromNuts[0], tr = t.getBoundingClientRect();
      const g = el(`<i class="nut flying" style="--nc:${NUT_COLOURS[colour]};left:${fr.left}px;top:${fr.top}px;width:${fr.width}px;height:${fr.height}px"></i>`);
      document.body.appendChild(g);
      const dx = tr.left - fr.left, dy = tr.top - fr.top;
      const anim = g.animate([{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${dx / 2}px,${Math.min(dy, 0) - 70}px) rotate(180deg)`, offset: 0.5 }, { transform: `translate(${dx}px,${dy}px) rotate(360deg)` }], { duration: 360, delay: i * 50, easing: 'ease-in-out', fill: 'forwards' });
      return Promise.race([anim.finished, new Promise((r) => setTimeout(r, 600))]).then(() => { g.remove(); t.style.visibility = ''; });
    }));
  }

  async function tap(i) {
    if (busy) return;
    if (sel < 0) { if (!s[i].length) return; sel = i; sfx.tap(); render(i); return; }
    if (sel === i) { sel = -1; render(); return; }
    if (!canMove(s, sel, i)) { if (s[i].length) { sel = i; render(i); } else { sel = -1; render(); } buzz(15); return; }
    busy = true;
    history.push(s.map((b) => b.slice()));
    const a = sel; sel = -1;
    const colour = s[a][s[a].length - 1];
    const n = doMove(s, a, i);
    moves++;
    sfx.place();
    await animateMove(a, i, n, colour);
    if (s[i].length === CAP && s[i].every((x) => x === s[i][0])) { sfx.unit(); buzz(20); const bEl = $(`.bolt[data-b="${i}"]`, area); bEl.classList.add('done'); }
    busy = false;
    if (solved(s)) win();
  }

  async function win() {
    if (level >= nb.level) nb.level = level + 1;
    save(true);
    sfx.win(); confetti();
    $$('.bolt.full', area).forEach((b, i) => setTimeout(() => b.classList.add('celebrate'), i * 90));
    await new Promise((r) => setTimeout(r, 900));
    const v = await dialog({ hero: 'img/ui/nut-and-bolt.png', title: 'All sorted!', dismissible: false, text: `Level ${level + 1} in ${moves} moves`, buttons: [{ label: 'Next level', value: 'next' }, { label: 'Back', value: 'back', cls: 'ghost' }] });
    if (v === 'next') app.replace('nutsgame', { level: level + 1 }); else app.back();
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-b]');
    if (b) return tap(+b.dataset.b);
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') nutsHelp();
    else if (a === 'undo' && history.length && !busy) { s = history.pop(); sel = -1; sfx.erase(); render(); }
    else if (a === 'restart' && !busy) { s = makeLevel(level); history = []; sel = -1; extra = false; moves = 0; render(); }
    else if (a === 'bolt' && !busy) { if (extra) { toast('You already added the extra bolt'); return; } extra = true; s.push([]); sfx.hint(); render(); }
  });

  render();
  if (!nb.seenHelp) { nb.seenHelp = true; save(); setTimeout(nutsHelp, 300); }
  return { root, destroy() { $$('.nut.flying').forEach((n) => n.remove()); } };
}
