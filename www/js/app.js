// App shell: navigation, home, statistics, settings and updates.
import { DIFFICULTIES, DIFFICULTY_LABELS } from './sudoku-engine.js';
import { store, save, resetAll, fmtTime } from './store.js';
import { icon, logoSvg } from './icons.js';
import { el, $, $$, sheet, dialog, toast, closeTopOverlay, esc } from './ui.js';
import { sfx } from './sound.js';
import { native, checkForUpdate, REPO } from './native.js';
import { sudokuScreen, startGame, continueLabel, prefetch } from './sudoku-game.js';
import { sortHomeScreen, sortGameScreen, sortLevelsScreen, sortHelp } from './sort-game.js';
import { meowHomeScreen, meowGameScreen, meowLevelsScreen, meowCatsScreen, loadLevels, meowHelp } from './meow-game.js';

// ---------- Theme ----------
const mq = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const S = store.settings;
  const dark = S.theme === 'dark' || (S.theme === 'system' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.accent = S.accent;
  updateBars();
}
function updateBars() {
  requestAnimationFrame(() => {
    const top = stack[stack.length - 1];
    const bg = top ? getComputedStyle(top.inst.root).backgroundColor : getComputedStyle(document.body).backgroundColor;
    const [r, g, b] = (bg.match(/\d+/g) || [255, 255, 255]).map(Number);
    const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
    native.setBars(hex, (r * 299 + g * 587 + b * 114) / 1000 > 140);
    document.body.style.background = bg;
  });
}
mq.addEventListener?.('change', applyTheme);

// ---------- Navigation ----------
const TABS = [
  { id: 'home', label: 'Main', icon: icon.home },
  { id: 'meow', label: 'Meowdoku', img: 'img/cats/cat01.png' },
  { id: 'sort', label: 'Cat Sort', img: 'img/cats/cat12.png' },
  { id: 'me', label: 'Me', icon: icon.chart },
];
const SCREENS = {
  home: homeScreen, meow: meowHomeScreen, me: statsScreen,
  sort: sortHomeScreen, sortgame: sortGameScreen, sortlevels: sortLevelsScreen,
  sudoku: sudokuScreen, meowgame: meowGameScreen, meowlevels: meowLevelsScreen, meowcats: meowCatsScreen,
  settings: settingsScreen, about: aboutScreen,
};
const stack = [];
const screensEl = document.getElementById('screens');
const tabbar = document.getElementById('tabbar');

function mount(name, params = {}) {
  const inst = SCREENS[name](app, params);
  screensEl.appendChild(inst.root);
  return { name, params, inst };
}
function unmount(entry) {
  entry.inst.destroy && entry.inst.destroy();
  entry.inst.root.remove();
}
function afterChange() {
  const top = stack[stack.length - 1];
  const isTab = TABS.some((t) => t.id === top.name) && stack.length === 1;
  tabbar.classList.toggle('hidden', !isTab);
  $$('.tab', tabbar).forEach((t) => t.classList.toggle('active', t.dataset.tab === top.name));
  updateBars();
}

const app = {
  go(name, params) {
    const prev = stack[stack.length - 1];
    if (prev) { prev.inst.onHide && prev.inst.onHide(); prev.inst.root.style.display = 'none'; }
    stack.push(mount(name, params));
    afterChange();
  },
  replace(name, params) {
    const top = stack.pop();
    if (top) unmount(top);
    stack.push(mount(name, params));
    afterChange();
  },
  reset(name, params) {
    while (stack.length) unmount(stack.pop());
    stack.push(mount(name, params));
    afterChange();
  },
  // Returns false when there is nowhere left to go (Android then closes the app).
  back() {
    const win = document.querySelector('.win, .meow-win');
    if (win) { win.remove(); const n = stack[stack.length - 1]?.name || ''; app.reset(n.startsWith('meow') ? 'meow' : n.startsWith('sort') ? 'sort' : 'home'); return true; }
    if (closeTopOverlay()) return true;
    if (stack.length > 1) {
      unmount(stack.pop());
      const top = stack[stack.length - 1];
      top.inst.root.style.display = '';
      top.inst.onShow ? top.inst.onShow() : top.inst.refresh && top.inst.refresh();
      afterChange();
      return true;
    }
    if (stack[0].name !== 'home') { app.reset('home'); return true; }
    return false;
  },
  applyTheme,
  newGameSheet,
  async startSudoku(difficulty, daily = null) {
    const close = sheet(`<div style="display:flex;flex-direction:column;align-items:center;gap:14px;padding:18px 0 8px"><div class="spinner"></div><div style="color:var(--muted)">Creating your ${DIFFICULTY_LABELS[difficulty].toLowerCase()} puzzle</div></div>`);
    await startGame(difficulty, daily);
    close();
    app.go('sudoku', { daily: !!daily });
  },
};
window.__scBack = () => app.back();

tabbar.innerHTML = TABS.map((t) => `<button class="tab" data-tab="${t.id}">${t.img ? `<img src="${t.img}" alt="">` : t.icon}${t.label}</button>`).join('');
tabbar.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]'); if (!t) return;
  sfx.tap();
  if (stack[0]?.name !== t.dataset.tab || stack.length > 1) app.reset(t.dataset.tab);
});

// ---------- New game sheet ----------
function newGameSheet() {
  sheet(`<h2>New game</h2>
    ${DIFFICULTIES.map((d, k) => `<button class="sheet-item" data-d="${d}">${DIFFICULTY_LABELS[d]}<span class="dots">${DIFFICULTIES.map((_, j) => `<i class="${j <= k ? 'on' : ''}"></i>`).join('')}</span></button>`).join('')}
    ${store.game && !store.game.done ? `<button class="sheet-item" data-restart>${icon.restart}Restart current puzzle</button>` : ''}`, {
    onMount(node, close) {
      node.addEventListener('click', (e) => {
        const b = e.target.closest('[data-d]');
        if (b) { close(); app.startSudoku(b.dataset.d); return; }
        if (e.target.closest('[data-restart]')) {
          close();
          const g = store.game;
          Object.assign(g, { board: g.puzzle, notes: new Array(81).fill(0), mistakes: 0, hintsUsed: 0, elapsed: 0, score: 0, history: [], units: new Array(27).fill(false) });
          save(true);
          app.go('sudoku');
        }
      });
    },
  });
}

function sudokuRules() {
  sheet(`<h2>How to play Sudoku</h2><div class="help-body">
    <p>Fill the grid so every row, every column and every 3×3 box contains the numbers 1 to 9, each exactly once.</p>
    <p>Tap a cell, then tap a number. Turn on <b>Notes</b> to jot down possible numbers in small print.</p>
    <p>Wrong numbers turn red and count as a mistake. Three mistakes ends the game, but you always get a free second chance. You can switch the limit off in Settings.</p>
    <p>Completing a row, column or box earns bonus points. Faster solving scores more.</p>
    <p><b>Hint</b> explains the next logical move rather than just filling in a number.</p>
  </div><button class="btn" data-x>Got it</button>`, { onMount: (n, close) => { $('[data-x]', n).onclick = close; } });
}

// ---------- Home ----------
function homeScreen() {
  const root = el(`<section class="screen with-tabbar">
    <header class="topbar"><button class="icon-btn" data-act="rules" aria-label="How to play">${icon.help}</button><div class="title"></div>
      <button class="icon-btn" data-act="settings" aria-label="Settings">${icon.gear}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  function render() {
    const cont = continueLabel();
    const wins = DIFFICULTIES.reduce((a, d) => a + store.stats[d].won, 0);
    const best = Math.max(...DIFFICULTIES.map((d) => store.stats[d].bestStreak));
    body.innerHTML = `
      <div class="home-hero">${logoSvg}<div class="app-name">Sudoku <span>Calm</span></div><div class="tagline">No ads. No interruptions. Just puzzles.</div></div>
      <div class="home-actions" style="margin-top:28px">
        ${cont ? `<button class="btn" data-act="continue">Continue game<small>${esc(cont)}</small></button>` : ''}
        <button class="btn ${cont ? 'secondary' : ''}" data-act="new">New game</button>
      </div>
      <div class="home-streak"><div><b>${wins}</b>Games won</div><div><b>${best}</b>Best streak</div><div><b>${DIFFICULTIES.reduce((a, d) => a + store.stats[d].perfect, 0)}</b>Perfect games</div></div>`;
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'continue') app.go('sudoku');
    else if (a === 'new') newGameSheet();
    else if (a === 'settings') app.go('settings');
    else if (a === 'rules') sudokuRules();
  });
  render();
  return { root, refresh: render };
}

// ---------- Statistics ----------
function statsScreen() {
  let diff = store.game?.difficulty || 'easy';
  const root = el(`<section class="screen with-tabbar">
    <header class="topbar"><div class="spacer"></div><div class="title">Statistics</div><button class="icon-btn" data-act="settings" aria-label="Settings">${icon.gear}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  function render() {
    const s = store.stats[diff];
    const rate = s.started ? Math.round((s.won / s.started) * 100) : 0;
    const row = (img, k, v) => `<div class="stat-row"><img src="img/ui/${img}.png" alt=""><span class="k">${k}</span><span class="v">${v}</span></div>`;
    body.innerHTML = `
      <div class="chips">${DIFFICULTIES.map((d) => `<button class="chip ${d === diff ? 'active' : ''}" data-d="${d}">${DIFFICULTY_LABELS[d]}</button>`).join('')}</div>
      <div class="section-title">Games</div>
      <div class="card stat-group">
        ${row('puzzle-piece', 'Games started', s.started)}
        ${row('trophy', 'Games won', s.won)}
        ${row('bar-chart', 'Win rate', rate + '%')}
        ${row('star', 'Wins with no mistakes', s.perfect)}
      </div>
      <div class="section-title">Time</div>
      <div class="card stat-group">
        ${row('sports-medal', 'Best time', s.bestTime ? fmtTime(s.bestTime) : '-')}
        ${row('calendar', 'Average time', s.won ? fmtTime(s.totalTime / s.won) : '-')}
      </div>
      <div class="section-title">Streaks and score</div>
      <div class="card stat-group">
        ${row('fire', 'Current win streak', s.streak)}
        ${row('crown', 'Best win streak', s.bestStreak)}
        ${row('gem-stone', 'Best score', s.bestScore.toLocaleString('en-AU'))}
      </div>
      <div class="section-title">Cosy Cat Sort</div>
      <div class="card stat-group">
        ${row('party-popper', 'Levels finished', store.sort.level)}
      </div>
      <div class="section-title">Meowdoku</div>
      <div class="card stat-group">
        ${row('paw-prints', 'Levels solved', store.meow.level)}
        ${row('calendar', 'Time spent', fmtTime(store.meow.totalTime))}
      </div>`;
  }
  root.addEventListener('click', (e) => {
    const c = e.target.closest('[data-d]');
    if (c) { diff = c.dataset.d; sfx.tap(); render(); }
    if (e.target.closest('[data-act="settings"]')) app.go('settings');
  });
  render();
  return { root, refresh: render };
}

// ---------- Settings ----------
function settingsScreen() {
  const S = store.settings;
  const root = el(`<section class="screen">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">Settings</div><div class="spacer"></div></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  const toggle = (k, label, sub = '') => `<button class="set-row" data-toggle="${k}"><div class="txt">${label}${sub ? `<small>${sub}</small>` : ''}</div><div class="switch ${S[k] ? 'on' : ''}"></div></button>`;
  const seg = (k, opts) => `<div class="seg" data-seg="${k}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(S[k]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  function render() {
    body.innerHTML = `
      <div class="section-title">Appearance</div>
      <div class="card set-group">
        <div class="set-row"><div class="txt">Theme</div>${seg('theme', [['light', 'Light'], ['dark', 'Dark'], ['system', 'Auto']])}</div>
        <div class="set-row"><div class="txt">Colour</div><div class="swatches">
          ${[['blue', '#3c6bdc'], ['green', '#2f9e66'], ['purple', '#7a5bd6'], ['pink', '#d4507c'], ['orange', '#e07b28']].map(([k, c]) => `<button class="swatch ${S.accent === k ? 'on' : ''}" data-accent="${k}" style="background:${c};color:${c}" aria-label="${k}"></button>`).join('')}</div></div>
        <div class="set-row"><div class="txt">Number size</div>${seg('fontScale', [[0.9, 'Small'], [1, 'Normal'], [1.12, 'Large']])}</div>
      </div>
      <div class="section-title">Sound and feel</div>
      <div class="card set-group">
        ${toggle('sound', 'Sound effects')}
        ${toggle('vibrate', 'Vibration')}
      </div>
      <div class="section-title">Sudoku</div>
      <div class="card set-group">
        ${toggle('autoCheck', 'Auto-check mistakes', 'Wrong numbers turn red straight away')}
        ${toggle('mistakeLimit', 'Mistake limit', 'The game ends after 3 mistakes')}
        ${toggle('highlightDupes', 'Highlight duplicates', 'Show clashing numbers in the same row, column or box')}
        ${toggle('highlightArea', 'Highlight areas', 'Shade the row, column and box of the selected cell')}
        ${toggle('highlightSame', 'Highlight identical numbers')}
        ${toggle('autoRemoveNotes', 'Auto-remove notes', 'Clear notes when the number is placed nearby')}
        ${toggle('hideUsed', 'Hide used numbers', 'Remove a number from the keypad once all nine are placed')}
        ${toggle('showRemaining', 'Show remaining count', 'Small counter under each keypad number')}
        ${toggle('showTimer', 'Show timer')}
        ${toggle('unlimitedHints', 'Unlimited hints', 'Otherwise you get 3 per game')}
      </div>
      <div class="section-title">Meowdoku</div>
      <div class="card set-group">
        ${toggle('meowAutoX', 'Show blocked cells', 'Mark cells that a cat already rules out with a small dot')}
        ${toggle('meowTimer', 'Show timer')}
      </div>
      <div class="section-title">Updates</div>
      <div class="card set-group">
        ${toggle('autoUpdate', 'Check for updates automatically')}
        <div class="set-row"><div class="txt">Update channel<small>Beta gets new features first, but they may be rough</small></div>${seg('updateChannel', [['stable', 'Stable'], ['beta', 'Beta']])}</div>
        <button class="set-row" data-act="check"><div class="txt">Check for updates now</div><div class="val">v${esc(native.versionName())}</div></button>
      </div>
      <div class="section-title">More</div>
      <div class="card set-group">
        <button class="set-row" data-act="rules"><div class="txt">How to play Sudoku</div></button>
        <button class="set-row" data-act="meowrules"><div class="txt">How to play Meowdoku</div></button>
        <button class="set-row" data-act="sortrules"><div class="txt">How to play Cosy Cat Sort</div></button>
        <button class="set-row" data-act="about"><div class="txt">About and credits</div></button>
        <button class="set-row" data-act="reset"><div class="txt" style="color:var(--err)">Reset all progress</div></button>
      </div>`;
  }
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-toggle]');
    if (t) { const k = t.dataset.toggle; S[k] = !S[k]; save(); sfx.tap(); render(); return; }
    const sb = e.target.closest('[data-seg] button');
    if (sb) {
      const k = sb.parentElement.dataset.seg;
      S[k] = k === 'fontScale' ? +sb.dataset.v : sb.dataset.v;
      save(); applyTheme(); render(); return;
    }
    const sw = e.target.closest('[data-accent]');
    if (sw) { S.accent = sw.dataset.accent; save(); applyTheme(); render(); return; }
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'check') runUpdateCheck(true);
    else if (a === 'rules') sudokuRules();
    else if (a === 'meowrules') meowHelp();
    else if (a === 'sortrules') sortHelp();
    else if (a === 'about') app.go('about');
    else if (a === 'reset') {
      const ok = await dialog({ title: 'Reset all progress?', text: 'This deletes your statistics, saved games, Meowdoku levels and Cat Sort levels. Your settings stay. This cannot be undone.',
        buttons: [{ label: 'Reset everything', value: true, cls: 'danger' }, { label: 'Cancel', value: false, cls: 'ghost' }] });
      if (ok) { resetAll(); toast('Progress reset'); }
    }
  });
  render();
  return { root, refresh: render };
}

// ---------- About ----------
function aboutScreen() {
  const root = el(`<section class="screen">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">About</div><div class="spacer"></div></header>
    <div class="scroll">
      <div class="home-hero">${logoSvg}<div class="app-name">Sudoku <span>Calm</span></div><div class="tagline">Version ${esc(native.versionName())}</div></div>
      <div class="card credits">
        <p>An ad-free collection of logic puzzles. Every Sudoku is generated on your phone with exactly one solution, and every Meowdoku level can be solved with logic alone.</p><br>
        <p>Your progress stays on this device. The app only goes online to check GitHub for updates, which you can turn off in Settings.</p><br>
        <p><b>Artwork.</b> Cat and icon images are from Microsoft Fluent Emoji, used under the MIT licence. Copyright (c) Microsoft Corporation.</p><br>
        <p><b>Inspiration.</b> Sudoku Calm is an independent app. It is not made by, endorsed by or affiliated with Easybrain or Oakever Games. Meowdoku and Cosy Cat Sort are our own takes on those game styles, with original artwork.</p><br>
        <p><a href="#" data-act="src">Source code and releases on GitHub</a></p>
      </div>
    </div></section>`);
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    if (a === 'src') { e.preventDefault(); native.openUrl(`https://github.com/${REPO}`); }
  });
  return { root };
}

// ---------- Updates ----------
async function runUpdateCheck(manual = false) {
  const meta = store.meta;
  if (manual) toast('Checking for updates');
  try {
    const u = await checkForUpdate(store.settings.updateChannel);
    meta.lastUpdateCheck = Date.now(); save();
    if (!u) { if (manual) toast('You have the latest version'); return; }
    if (!manual && meta.skipVersion === u.version) return;
    const mb = u.size ? ` (${(u.size / 1048576).toFixed(1)} MB)` : '';
    const v = await dialog({
      hero: 'img/ui/party-popper.png', title: 'Update available',
      text: `Version ${u.version}${u.prerelease ? ' beta' : ''} is ready to install${mb}.`,
      notes: u.notes,
      buttons: [{ label: 'Update now', value: 'go' }, { label: 'Later', value: 'later', cls: 'secondary' }, { label: 'Skip this version', value: 'skip', cls: 'ghost' }],
    });
    if (v === 'go') {
      window.__scUpdateProgress = (p) => toast(p >= 100 ? 'Download complete. Opening the installer' : `Downloading update ${p}%`, p >= 100 ? 3000 : 6000);
      window.__scUpdateFailed = () => toast('The update could not be downloaded. Check your connection and try again from Settings.', 5000);
      native.downloadAndInstall(u.url, u.version);
      toast('Downloading update', 4000);
    }
    else if (v === 'skip') { meta.skipVersion = u.version; save(); }
  } catch (err) {
    if (manual) toast('Could not reach GitHub. Check your connection.');
  }
}

// ---------- Boot ----------
applyTheme();
app.reset('home');
loadLevels();
prefetch('easy');
setTimeout(() => {
  const S = store.settings;
  if (native.isApp && S.autoUpdate && Date.now() - store.meta.lastUpdateCheck > 6 * 3600 * 1000) runUpdateCheck(false);
}, 2500);
// Resume audio context on first touch (browsers require a gesture).
document.addEventListener('pointerdown', () => sfx.tap && null, { once: true });
