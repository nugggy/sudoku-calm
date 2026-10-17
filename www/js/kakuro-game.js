// Kakuro: fill the white squares so each run adds up to its clue, with no digit repeated in a run.
import { store, save, fmtTime } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet, levelHome } from './kit.js';
import { runsOf, combos } from './kakuro-engine.js';

const KK = () => store.kakuro;
let puzzles = null;
async function loadPuzzles() { if (!puzzles) { try { puzzles = (await (await fetch('levels/kakuro.json')).json()).puzzles; } catch { puzzles = []; } } return puzzles; }
export const kakuroHelp = () => helpSheet('How to play Kakuro', [
  'Fill every white square with a digit from 1 to 9.',
  'Each clue is the total of the run of squares beside it: the number in the top right is for the run going across, the number in the bottom left is for the run going down.',
  'A digit can only be used once in each run. The helper under the board lists every way to make the selected sum.',
], 'kakuro-btn');

export function kakuroHomeScreen(app) {
  return levelHome({
    app, cls: 'kakuro-theme', title: 'Kakuro', help: kakuroHelp, load: loadPuzzles,
    hero: `<div class="kk-hero"><div class="kk-clue"><span class="a">16</span><span class="d">17</span></div><div class="kk-w">7</div><div class="kk-w">9</div><div class="kk-w">8</div><div class="kk-w">9</div><div class="kk-clue"><span class="a">3</span></div></div>`,
    play: () => ({ label: `Play puzzle ${KK().level + 1}`, sub: puzzles && puzzles[KK().level] ? `${puzzles[KK().level].size}×${puzzles[KK().level].size}` : '' }),
    onPlay: () => app.go('kakurogame', { idx: Math.min(KK().level, puzzles.length - 1) }),
    levels: () => ({ count: puzzles.length, current: KK().level, done: (i) => i < KK().level }),
    onLevel: (i) => app.go('kakurogame', { idx: i }),
  });
}

export function kakuroGameScreen(app, { idx }) {
  const kk = KK(), S = store.settings;
  const root = el(`<section class="screen kakuro-theme kakuro-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">Kakuro ${idx + 1}</div><span class="cross-time" data-el="time">00:00</span>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="kk-wrap"><div class="kk-board" data-el="board"></div></div>
    <div class="kk-combos" data-el="combos"></div>
    <div class="tools kk-tools">
      <button class="tool" data-act="erase"><span class="ic">${icon.erase}</span>Erase</button>
      <button class="tool" data-act="notes"><span class="ic">${icon.pencil}</span>Notes<span class="badge" data-el="nb">OFF</span></button>
      <button class="tool" data-act="hint"><span class="ic">${icon.bulb}</span>Hint</button>
    </div>
    <div class="numpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button class="num" data-num="${d}">${d}</button>`).join('')}</div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  let P, size, sol, runs, sums, vals, notes, sel = -1, notesMode = false, elapsed = 0, tick = null, done = false;

  function build() {
    size = P.size;
    sol = [...P.cells].map((ch) => (ch === '#' ? 0 : +ch));
    runs = runsOf(size, size, (r, c) => r >= 0 && c >= 0 && r < size && c < size && sol[r * size + c] > 0);
    sums = runs.map((r) => r.cells.reduce((a, i) => a + sol[i], 0));
    const cs = Math.floor(Math.min((innerWidth - 20) / size, (innerHeight - 380) / size, 56));
    const b = q('board');
    b.style.gridTemplateColumns = `repeat(${size}, ${cs}px)`;
    b.style.setProperty('--ks', cs + 'px');
    let html = '';
    for (let i = 0; i < size * size; i++) {
      if (sol[i]) { html += `<div class="kc" data-i="${i}"><span class="v"></span><div class="kn">${'<i></i>'.repeat(9)}</div></div>`; continue; }
      const across = runs.findIndex((r) => r.dir === 'across' && r.clueAt === i), down = runs.findIndex((r) => r.dir === 'down' && r.clueAt === i);
      html += `<div class="kb ${across >= 0 || down >= 0 ? 'clue' : ''}">${across >= 0 ? `<span class="a" data-run="${across}">${sums[across]}</span>` : ''}${down >= 0 ? `<span class="d" data-run="${down}">${sums[down]}</span>` : ''}</div>`;
    }
    b.innerHTML = html;
  }
  const runsFor = (i) => runs.map((r, ri) => (r.cells.includes(i) ? ri : -1)).filter((x) => x >= 0);

  function render() {
    const active = sel >= 0 ? new Set(runsFor(sel).flatMap((ri) => runs[ri].cells)) : new Set();
    $$('.kc', root).forEach((n) => {
      const i = +n.dataset.i, v = vals[i];
      const dupe = v && runsFor(i).some((ri) => runs[ri].cells.some((j) => j !== i && vals[j] === v));
      n.className = 'kc' + (i === sel ? ' sel' : active.has(i) ? ' run' : '') + (v && S.autoCheck && v !== sol[i] ? ' wrong' : '') + (dupe ? ' dupe' : '');
      n.firstElementChild.textContent = v || '';
      const ns = n.lastElementChild.children;
      for (let d = 1; d <= 9; d++) ns[d - 1].textContent = !v && notes[i] & (1 << d) ? d : '';
    });
    $$('[data-run]', root).forEach((s) => { const r = runs[+s.dataset.run]; s.classList.toggle('done', r.cells.every((i) => vals[i] === sol[i])); });
    // combination helper for the selected square's runs
    if (sel >= 0) {
      q('combos').innerHTML = runsFor(sel).map((ri) => {
        const r = runs[ri], cs = combos(sums[ri], r.cells.length);
        const placed = r.cells.map((i) => vals[i]).filter(Boolean);
        return `<div><b>${r.dir === 'across' ? 'Across' : 'Down'} ${sums[ri]} in ${r.cells.length}</b>${cs.slice(0, 6).map((c) => `<span class="${placed.every((p) => c.includes(p)) ? '' : 'out'}">${c.join('+')}</span>`).join('')}${cs.length > 6 ? `<span>+${cs.length - 6} more</span>` : ''}</div>`;
      }).join('');
    } else q('combos').innerHTML = '<div class="hint">Tap a white square to see which digits can make its sums.</div>';
    q('nb').textContent = notesMode ? 'ON' : 'OFF';
    $('[data-act="notes"]', root).classList.toggle('on', notesMode);
  }

  function persist() { kk.current = { idx, vals, notes, elapsed }; save(); }

  function input(d) {
    if (sel < 0 || done) return;
    if (notesMode) { if (vals[sel]) return; notes[sel] ^= 1 << d; sfx.note(); render(); persist(); return; }
    vals[sel] = vals[sel] === d ? 0 : d;
    if (vals[sel]) { runsFor(sel).forEach((ri) => runs[ri].cells.forEach((j) => { notes[j] &= ~(1 << d); })); }
    const n = $(`.kc[data-i="${sel}"]`, root); n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop');
    if (vals[sel] && S.autoCheck && vals[sel] !== sol[sel]) { sfx.error(); buzz(25); } else sfx.place();
    // celebrate a finished run
    runsFor(sel).forEach((ri) => { if (runs[ri].cells.every((i) => vals[i] === sol[i])) { sfx.unit(); runs[ri].cells.forEach((i, k) => setTimeout(() => { const c = $(`.kc[data-i="${i}"]`, root); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); }, k * 50)); } });
    render(); persist(); checkWin();
  }

  async function checkWin() {
    if (!sol.every((v, i) => !v || vals[i] === v)) return;
    done = true; stopTimer();
    if (idx >= kk.level) kk.level = idx + 1;
    kk.current = null; save(true);
    sfx.win(); confetti();
    await new Promise((r) => setTimeout(r, 700));
    const v = await dialog({ hero: 'img/ui/input-numbers.png', title: 'Kakuro solved!', dismissible: false, text: `Puzzle ${idx + 1} in ${fmtTime(elapsed)}`, buttons: [...(idx + 1 < puzzles.length ? [{ label: 'Next puzzle', value: 'next' }] : []), { label: 'Back', value: 'back', cls: 'ghost' }] });
    if (v === 'next') app.replace('kakurogame', { idx: idx + 1 }); else app.back();
  }

  function startTimer() { stopTimer(); if (!done) tick = setInterval(() => { elapsed++; q('time').textContent = fmtTime(elapsed); if (elapsed % 5 === 0) persist(); }, 1000); }
  function stopTimer() { clearInterval(tick); tick = null; }

  root.addEventListener('click', (e) => {
    const c = e.target.closest('.kc'); if (c) { sel = +c.dataset.i; sfx.tap(); render(); return; }
    const n = e.target.closest('[data-num]'); if (n) return input(+n.dataset.num);
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') kakuroHelp();
    else if (a === 'notes') { notesMode = !notesMode; render(); }
    else if (a === 'erase' && sel >= 0) { vals[sel] = 0; notes[sel] = 0; sfx.erase(); render(); persist(); }
    else if (a === 'hint' && !done) {
      const target = sel >= 0 && vals[sel] !== sol[sel] ? sel : sol.findIndex((v, i) => v && vals[i] !== v);
      if (target < 0) return;
      sel = target; notesMode = false; sfx.hint(); input(sol[target]);
    }
  });

  (async () => {
    const all = await loadPuzzles();
    P = all[idx];
    const cur = kk.current && kk.current.idx === idx ? kk.current : null;
    vals = cur ? cur.vals : new Array(P.size * P.size).fill(0);
    notes = cur ? cur.notes : new Array(P.size * P.size).fill(0);
    elapsed = cur ? cur.elapsed : 0;
    build(); render(); startTimer();
    if (!kk.seenHelp) { kk.seenHelp = true; save(); setTimeout(kakuroHelp, 300); }
  })();
  return { root, destroy() { stopTimer(); if (!done && vals) persist(); save(true); }, onHide() { stopTimer(); }, onShow() { startTimer(); } };
}
