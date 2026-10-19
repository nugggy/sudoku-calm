// App shell: game picker, navigation, statistics, settings and updates.
import { DIFFICULTIES, DIFFICULTY_LABELS } from './sudoku-engine.js';
import { store, save, resetAll, fmtTime, todayKey } from './store.js';
import { icon, logoSvg, brandSvg } from './icons.js';
import { el, $, $$, sheet, dialog, toast, closeTopOverlay, esc } from './ui.js';
import { sfx } from './sound.js';
import { native, checkForUpdate, REPO } from './native.js';
import { sudokuScreen, startGame, continueLabel, prefetch } from './sudoku-game.js';
import { sortHomeScreen, sortGameScreen, sortLevelsScreen, sortHelp, cutie } from './sort-game.js';
import { solitaireScreen, solHelp } from './solitaire-game.js';
import { treatHomeScreen, treatGameScreen, treatHelp, candySvg } from './treat-game.js';
import { blockScreen, blockHelp } from './block-game.js';
import { screen2048, help2048 } from './g2048.js';
import { minesHomeScreen, minesGameScreen, minesHelp } from './mines-game.js';
import { guessHomeScreen, guessGameScreen, guessHelp } from './guess-game.js';
import { hashiHomeScreen, hashiGameScreen, hashiHelp, hashiCardArt } from './hashi-game.js';
import { gridlockHomeScreen, gridlockGameScreen, gridlockHelp, gridlockCardArt } from './gridlock-game.js';
import { crateHomeScreen, crateGameScreen, crateHelp, crateCardArt } from './crate-game.js';
import { arrowHomeScreen, arrowGameScreen, arrowHelp, arrowCardArt } from './arrow-game.js';
import { chessHomeScreen, chessGameScreen, chessHelp, chessCardArt } from './chess-game.js';
import { ropeHomeScreen, ropeGameScreen, ropeHelp, ropeCardArt } from './rope-game.js';
import { snipHomeScreen, snipLobbyScreen, snipGameScreen, snipHelp, snipCardArt } from './snip-game.js';
import { turtleHubScreen, turtleGameScreen, turtleHelp, turtleCardArt, TURTLE_GAMES } from './turtle/hub.js';
import { heroHubScreen, heroBuilderScreen, heroGameScreen, heroHelp, heroCardArt } from './hero/hub.js';
import { potionHomeScreen, potionGameScreen, potionHelp, potionCardArt } from './potion-game.js';
import { motoHubScreen, motoGarageScreen, motoGameScreen, motoHelp, motoCardArt } from './moto/hub.js';
import { yetiHubScreen, yetiGameScreen, yetiHelp, yetiCardArt, YETI_GAMES } from './yeti/hub.js';
import { pressHomeScreen, pressGameScreen, pressHelp, pressCardArt } from './press-game.js';
import { mahjongHomeScreen, mahjongGameScreen, mahjongHelp } from './mahjong-game.js';
import { wheelHomeScreen, wheelGameScreen, wheelHelp } from './wheel-game.js';
import { pipeHomeScreen, pipeGameScreen, pipeHelp } from './pipe-game.js';
import { spiderHomeScreen, spiderGameScreen, spiderHelp } from './spider-game.js';
import { jigsawHomeScreen, jigsawGameScreen, jigsawHelp } from './jigsaw-game.js';
import { stickerHomeScreen, stickerGameScreen, stickerHelp, stickerCardArt } from './sticker-game.js';
import { crossHomeScreen, crossGameScreen, crossHelp } from './crossword-game.js';
import { wsHomeScreen, wsGameScreen, wsHelp } from './wordsearch-game.js';
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
  { id: 'games', label: 'Games', icon: icon.grid },
  { id: 'me', label: 'Me', icon: icon.chart },
];
const SCREENS = {
  games: landingScreen, home: homeScreen, meow: meowHomeScreen, me: statsScreen,
  sort: sortHomeScreen, sortgame: sortGameScreen, sortlevels: sortLevelsScreen,
  solitaire: solitaireScreen,
  treat: treatHomeScreen, treatgame: treatGameScreen, block: blockScreen,
  cross: crossHomeScreen, crossgame: crossGameScreen, ws: wsHomeScreen, wsgame: wsGameScreen,
  g2048: screen2048, mines: minesHomeScreen, minesgame: minesGameScreen, guess: guessHomeScreen, guessgame: guessGameScreen,
  hashi: hashiHomeScreen, hashigame: hashiGameScreen, gridlock: gridlockHomeScreen, gridlockgame: gridlockGameScreen, crate: crateHomeScreen, crategame: crateGameScreen, potion: potionHomeScreen, potiongame: potionGameScreen, arrow: arrowHomeScreen, arrowgame: arrowGameScreen, chess: chessHomeScreen, chessgame: chessGameScreen, rope: ropeHomeScreen, ropegame: ropeGameScreen, snip: snipHomeScreen, sniplobby: snipLobbyScreen, snipgame: snipGameScreen, turtle: turtleHubScreen, turtlegame: turtleGameScreen, hero: heroHubScreen, herobuilder: heroBuilderScreen, herogame: heroGameScreen, press: pressHomeScreen, pressgame: pressGameScreen, yeti: yetiHubScreen, yetigame: yetiGameScreen, moto: motoHubScreen, motogarage: motoGarageScreen, motogame: motoGameScreen,
  mahjong: mahjongHomeScreen, mjgame: mahjongGameScreen,
  wheel: wheelHomeScreen, wheelgame: wheelGameScreen, pipe: pipeHomeScreen, pipegame: pipeGameScreen,
  spider: spiderHomeScreen, spidergame: spiderGameScreen,
  jigsaw: jigsawHomeScreen, jiggame: jigsawGameScreen, sticker: stickerHomeScreen, stickergame: stickerGameScreen,
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
    // a win screen is showing: close it and leave the finished game
    const win = document.querySelector('.win, .meow-win');
    if (win) win.remove();
    else if (closeTopOverlay()) return true;
    if (stack.length > 1) {
      unmount(stack.pop());
      const top = stack[stack.length - 1];
      top.inst.root.style.display = '';
      top.inst.onShow ? top.inst.onShow() : top.inst.refresh && top.inst.refresh();
      afterChange();
      return true;
    }
    if (stack[0].name !== 'games') { app.reset('games'); return true; }
    return false;
  },
  // Go back to a screen further down the stack (for example a game's home after a win).
  backTo(name, params) {
    document.querySelectorAll('.win, .meow-win').forEach((w) => w.remove());
    const i = stack.map((e) => e.name).lastIndexOf(name);
    if (i < 0) { app.reset('games'); app.go(name, params); return; }
    while (stack.length > i + 1) unmount(stack.pop());
    const top = stack[stack.length - 1];
    top.inst.root.style.display = '';
    top.inst.onShow ? top.inst.onShow() : top.inst.refresh && top.inst.refresh();
    afterChange();
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


// ---------- Game picker (landing page) ----------
// Each game: where it opens, its artwork, and a short progress line.
export const GAMES = [];
const CATEGORIES = ['Numbers', 'Logic', 'Words', 'Cards and tiles', 'Casual'];
export function registerGame(g) { GAMES.push(g); }

registerGame({
  id: 'sudoku', cat: 'Numbers', screen: 'home', name: 'Sudoku', tag: 'The classic numbers puzzle', theme: 'g-sudoku',
  art: () => `<div class="art-sudoku">${logoSvg}</div>`,
  progress: () => continueLabel() ? `Game in progress · ${continueLabel()}` : `${DIFFICULTIES.reduce((a, d) => a + store.stats[d].won, 0)} solved`,
});
registerGame({
  id: 'cross', cat: 'Words', screen: 'cross', name: 'Crosswords', tag: 'Mini to maxi, clued in plain English', theme: 'g-cross',
  art: () => `<div class="art-cross">${'C,A,T,#,O,#,W,#,A,R,#,D,S,U,N,#,#,O,B,#,E,G,G,#,D'.split(',').map((ch) => `<i class="${ch === '#' ? 'blk' : ''}">${ch === '#' ? '' : ch}</i>`).join('')}</div>`,
  progress: () => `${Object.keys(store.cross.done).length} solved`,
});
registerGame({
  id: 'ws', cat: 'Words', screen: 'ws', name: 'Word Search', tag: 'Find the hidden words', theme: 'g-ws',
  art: () => `<div class="art-ws"><div class="art-ws-grid">${'PUZCATEWORDLSEAFINDK'.split('').map((ch, i) => `<i class="${[4, 5, 6].includes(i) ? 'hl' : [12, 13, 14, 15].includes(i) ? 'hl2' : ''}">${ch}</i>`).join('')}</div><img src="img/art/ui/magnifier.svg" alt=""></div>`,
  progress: () => `Puzzle ${store.ws.level + 1}`,
});
registerGame({
  id: 'sol', cat: 'Cards and tiles', screen: 'solitaire', name: 'Solitaire', tag: 'Classic Klondike, every deal winnable', theme: 'g-sol',
  art: () => `<div class="art-sol">${[['A', '♠', ''], ['K', '♥', 'red'], ['Q', '♦', 'red']].map(([r, s, c], i) => `<div class="mini-card ${c}" style="transform:rotate(${(i - 1) * 12}deg) translateY(${Math.abs(i - 1) * 6}px)"><b>${r}</b><i>${s}</i></div>`).join('')}</div>`,
  progress: () => store.sol.current ? 'Game in progress' : `${store.sol.stats.won} won`,
});
registerGame({
  id: 'treat', cat: 'Casual', screen: 'treat', name: 'Treat Twist', tag: 'Swap and match the candies', theme: 'g-treat',
  art: () => `<div class="art-treat">${[0, 4, 2, 5, 1, 3, 4, 0, 2].map((t) => candySvg(t)).join('')}</div>`,
  progress: () => `Level ${store.treat.level + 1}`,
});
registerGame({
  id: 'block', cat: 'Casual', screen: 'block', name: 'Block Pounce', tag: 'Fit the blocks, clear the lines', theme: 'g-block',
  art: () => `<div class="art-block">${'1100011101111011001110011'.split('').map((v, i) => `<i style="${v === '1' ? `background:${['#ff5d73', '#38b6ff', '#ffd23f', '#3ddc84', '#8f6bff'][i % 5]}` : ''}"></i>`).join('')}</div>`,
  progress: () => (store.block.best ? `Best ${store.block.best.toLocaleString('en-AU')}` : 'New game'),
});
registerGame({
  id: 'meow', cat: 'Logic', screen: 'meow', name: 'Meowdoku', tag: 'One cat per row, column and colour', theme: 'g-meow',
  art: () => `<div class="art-meow">${['#e3bb45', '#e8a7c0', '#9b80d6', '#7cc4a4', '#e3bb45', '#7fb2e5', '#e8a7c0', '#f0956a', '#9b80d6'].map((c, i) => `<i style="background:${c}">${i === 4 ? '<img src="img/art/cats/cat01.svg" alt="">' : ''}</i>`).join('')}</div>`,
  progress: () => `Level ${store.meow.level + 1}`,
});
registerGame({
  id: 'sort', cat: 'Casual', screen: 'sort', name: 'Cosy Cat Sort', tag: 'Send matching cats home', theme: 'g-sort',
  art: () => `<div class="art-sort">${[1, 0, 4].map((k) => `<div class="cutie">${cutie(k)}</div>`).join('')}<div class="sort-plank"></div></div>`,
  progress: () => `Level ${store.sort.level + 1}`,
});

registerGame({
  id: '2048', cat: 'Numbers', screen: 'g2048', name: '2048', tag: 'Slide and merge the tiles', theme: 'g-2048',
  art: () => '<div class="art-2048"><i data-v="2">2</i><i data-v="8">8</i><i data-v="128">128</i><i data-v="2048">2048</i></div>',
  progress: () => (store.g2048.best ? `Best ${store.g2048.best.toLocaleString('en-AU')}` : 'New game'),
});
registerGame({
  id: 'mines', cat: 'Logic', screen: 'mines', name: 'Minesweeper', tag: 'No guessing needed', theme: 'g-mines',
  art: () => '<div class="art-mines"><i></i><i class="o">1</i><i class="o">2</i><i><img src="img/art/ui/triangular-flag.svg" alt=""></i><i class="o"></i><i class="o">1</i><i class="o">1</i><i><img src="img/art/ui/bomb.svg" alt=""></i><i></i></div>',
  progress: () => `${Object.values(store.mines.won).reduce((a, b) => a + b, 0)} cleared`,
});
registerGame({
  id: 'pipe', cat: 'Logic', screen: 'pipe', name: 'Pipeline', tag: 'Join the dots, fill the grid', theme: 'g-pipe',
  art: () => '<svg class="art-pipe" viewBox="0 0 120 80"><path d="M15 15 H60 V45 H105" stroke="#ff3b5c" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 65 H45 V45" stroke="#ffd21f" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="15" cy="15" r="11" fill="#ff3b5c"/><circle cx="105" cy="45" r="11" fill="#ff3b5c"/><circle cx="15" cy="65" r="11" fill="#ffd21f"/><circle cx="45" cy="45" r="11" fill="#ffd21f"/></svg>',
  progress: () => `Level ${store.pipe.level + 1}`,
});
registerGame({
  id: 'guess', cat: 'Words', screen: 'guess', name: 'Guesswork', tag: 'Five letters, six tries', theme: 'g-guess',
  art: () => `<div class="art-guess">${'WORDS'.split('').map((ch, i) => `<i class="${['g', 'y', 'x', 'g', 'y'][i]}">${ch}</i>`).join('')}</div>`,
  progress: () => (store.guess.daily[todayKey()] ? 'Daily done' : 'New daily word'),
});
registerGame({
  id: 'wheel', cat: 'Words', screen: 'wheel', name: 'Word Wheel', tag: 'Swipe letters into words', theme: 'g-wheel',
  art: () => `<div class="art-wheel">${'PLAYS'.split('').map((ch, i) => `<i style="transform:rotate(${i * 72}deg) translate(0,-30px) rotate(${-i * 72}deg)">${ch}</i>`).join('')}</div>`,
  progress: () => `Level ${store.wheel.level + 1}`,
});
registerGame({
  id: 'spider', cat: 'Cards and tiles', screen: 'spider', name: 'Spider Solitaire', tag: 'One, two or four suits', theme: 'g-spider',
  art: () => '<div class="art-sol art-spider"><div class="mini-card"><b>K</b><i>♠</i></div><div class="mini-card"><b>Q</b><i>♠</i></div><img src="img/art/ui/spider.svg" alt=""></div>',
  progress: () => (store.spider.current ? 'Game in progress' : `${Object.values(store.spider.won).reduce((a, b) => a + b, 0)} won`),
});
registerGame({
  id: 'mahjong', cat: 'Cards and tiles', screen: 'mahjong', name: 'Mahjong Garden', tag: 'Match the free tiles', theme: 'g-mahjong',
  art: () => '<div class="art-mj"><div class="mj-tile"><img src="img/art/mahjong/m31.svg" alt=""></div><div class="mj-tile"><img src="img/art/mahjong/m31.svg" alt=""></div><div class="mj-tile"><img src="img/art/mahjong/m34.svg" alt=""></div></div>',
  progress: () => `Board ${store.mahjong.level + 1}`,
});
registerGame({
  id: 'jigsaw', cat: 'Casual', screen: 'jigsaw', name: 'Jigsaw', tag: 'Piece together cartoon scenes', theme: 'g-jigsaw',
  art: () => '<div class="art-jig"><img src="img/art/ui/puzzle-piece.svg" alt=""><img src="img/kenney/scenery/treePalm.png" alt=""></div>',
  progress: () => `Puzzle ${store.jigsaw.level + 1}`,
});
registerGame({
  id: 'sticker', cat: 'Casual', screen: 'sticker', name: 'Sticker Studio', tag: 'Fill cosy scenes with stickers', theme: 'g-sticker',
  art: () => stickerCardArt(),
  progress: () => `${Object.keys(store.sticker.done).length} of 50 scenes`,
});
registerGame({
  id: 'hashi', cat: 'Logic', screen: 'hashi', name: 'Island Hop', tag: 'Join the islands with bridges', theme: 'g-hashi',
  art: () => hashiCardArt(),
  progress: () => `Level ${store.hashi.level + 1}`,
});
registerGame({
  id: 'gridlock', cat: 'Logic', screen: 'gridlock', name: 'Gridlock', tag: 'Slide the cars, free the red one', theme: 'g-gridlock',
  art: () => gridlockCardArt(),
  progress: () => `Level ${store.gridlock.level + 1}`,
});
registerGame({
  id: 'crate', cat: 'Logic', screen: 'crate', name: 'Crate Mate', tag: 'Push every crate onto its spot', theme: 'g-crate',
  art: () => crateCardArt(),
  progress: () => `Level ${store.crate.level + 1}`,
});
registerGame({
  id: 'chess', cat: 'Logic', screen: 'chess', name: 'Chess', tag: 'Play the computer or a friend', theme: 'g-chess',
  art: () => chessCardArt(),
  progress: () => (store.chess.current ? 'Game in progress' : store.chess.stats.played ? `${store.chess.stats.won} won` : 'New game'),
});
registerGame({
  id: 'arrow', cat: 'Logic', screen: 'arrow', name: 'Arrow Away', tag: 'Tap the arrows out of the maze', theme: 'g-arrow',
  art: () => arrowCardArt(),
  progress: () => `Level ${store.arrow.level + 1}`,
});
registerGame({
  id: 'potion', cat: 'Casual', screen: 'potion', name: 'Potion Pour', tag: 'Pour until every flask is one colour', theme: 'g-potion',
  art: () => potionCardArt(),
  progress: () => `Level ${store.potion.level + 1}`,
});
registerGame({
  id: 'rope', cat: 'Casual', screen: 'rope', name: 'Sweet Drop', tag: 'Cut the ropes, feed the frog', theme: 'g-rope',
  art: () => ropeCardArt(),
  progress: () => `Level ${Math.min(store.rope.level + 1, 44)}`,
});
registerGame({
  id: 'snip', cat: 'Casual', screen: 'snip', name: 'Snip Buddies', tag: 'Team up, snip each other into shape', theme: 'g-snip',
  art: () => snipCardArt(),
  progress: () => { const n = Object.keys(store.snip.done).length; return n ? `${n} of 22 solved` : 'Play with a friend'; },
});
registerGame({
  id: 'moto', cat: 'Casual', screen: 'moto', name: 'Moto Mania', tag: 'Six motorbike games and a garage', theme: 'g-moto',
  art: () => motoCardArt(),
  progress: () => `${(store.moto.coins || 0).toLocaleString('en-AU')} coins`,
});
registerGame({
  id: 'turtle', cat: 'Casual', screen: 'turtle', name: 'Turtle Bay', tag: 'Eight games starring turtles', theme: 'g-turtle',
  art: () => turtleCardArt(),
  progress: () => { const n = Object.keys(store.turtle.best).length; return n ? `${n} of ${TURTLE_GAMES.length} played` : 'New game'; },
});
registerGame({
  id: 'hero', cat: 'Casual', screen: 'hero', name: 'Marvel Heroes', tag: "Seven games with Earth's mightiest heroes", theme: 'g-hero',
  art: () => heroCardArt(),
  progress: () => `${(store.hero.coins || 0).toLocaleString('en-AU')} coins`,
});
registerGame({
  id: 'yeti', cat: 'Casual', screen: 'yeti', name: 'Yeti Games', tag: 'Eleven silly sports for a yeti and a penguin', theme: 'g-yeti',
  art: () => yetiCardArt(),
  progress: () => { const n = Object.keys(store.yeti.best).length; return n ? `${n} of ${YETI_GAMES.length} played` : 'New game'; },
});
registerGame({
  id: 'press', cat: 'Casual', screen: 'press', name: 'Pressure Point', tag: 'One button, one tricky rule', theme: 'g-press',
  art: () => pressCardArt(),
  progress: () => (store.press.reached ? `Best: level ${store.press.reached}` : 'New game'),
});

function landingScreen() {
  const root = el(`<section class="screen landing with-tabbar">
    <header class="topbar"><div class="spacer"></div><div class="title"></div>
      <button class="icon-btn" data-act="settings" aria-label="Settings">${icon.gear}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  function greeting() {
    const h = Number(new Date().toLocaleString('en-AU', { hour: 'numeric', hour12: false, timeZone: 'Australia/Sydney' }));
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }
  function render() {
    body.innerHTML = `
      <div class="brand-row">${brandSvg}<span>GameHub</span></div>
      <div class="landing-head"><h1>${greeting()}</h1><p>What would you like to play?</p></div>
      ${CATEGORIES.map((cat) => `<div class="cat-title">${cat}</div><div class="game-grid">${GAMES.filter((g) => g.cat === cat).map((g) => `
        <button class="game-card ${g.theme}" data-game="${g.id}">
          <div class="game-art">${g.art()}</div>
          <div class="game-name">${esc(g.name)}</div>
          <div class="game-tag">${esc(g.tag)}</div>
          <div class="game-progress">${esc(g.progress())}</div>
        </button>`).join('')}</div>`).join('')}
      <p class="landing-foot">No ads. No interruptions. Just puzzles.</p>`;
  }
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="settings"]')) return app.go('settings');
    const c = e.target.closest('[data-game]');
    if (!c) return;
    sfx.tap();
    const g = GAMES.find((x) => x.id === c.dataset.game);
    app.go(g.screen, g.params);
  });
  render();
  return { root, refresh: render };
}

// ---------- Sudoku home ----------
function homeScreen() {
  const root = el(`<section class="screen">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title"></div>
      <button class="icon-btn" data-act="rules" aria-label="How to play">${icon.help}</button>
      <button class="icon-btn" data-act="settings" aria-label="Settings">${icon.gear}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  function render() {
    const cont = continueLabel();
    const wins = DIFFICULTIES.reduce((a, d) => a + store.stats[d].won, 0);
    const best = Math.max(...DIFFICULTIES.map((d) => store.stats[d].bestStreak));
    body.innerHTML = `
      <div class="home-hero">${logoSvg}<div class="app-name">Sudoku</div><div class="tagline">Six levels, from Easy to Extreme</div></div>
      <div class="home-actions" style="margin-top:28px">
        ${cont ? `<button class="btn" data-act="continue">Continue game<small>${esc(cont)}</small></button>` : ''}
        <button class="btn ${cont ? 'secondary' : ''}" data-act="new">New game</button>
      </div>
      <div class="home-streak"><div><b>${wins}</b>Games won</div><div><b>${best}</b>Best streak</div><div><b>${DIFFICULTIES.reduce((a, d) => a + store.stats[d].perfect, 0)}</b>Perfect games</div></div>`;
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'continue') app.go('sudoku');
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
    const row = (img, k, v) => `<div class="stat-row"><img src="img/art/ui/${img}.svg" alt=""><span class="k">${k}</span><span class="v">${v}</span></div>`;
    body.innerHTML = `
      <div class="section-title" style="margin-top:4px">Sudoku</div>
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
      <div class="section-title">More games</div>
      <div class="card stat-group">
        ${row('crown', '2048 best score', (store.g2048.best || 0).toLocaleString('en-AU'))}
        ${row('trophy', 'Minesweeper boards cleared', Object.values(store.mines.won).reduce((a, b) => a + b, 0))}
        ${row('fire', 'Guesswork streak', store.guess.stats.streak)}
        ${row('star', 'Guesswork words solved', store.guess.stats.won)}
        ${row('sparkles', 'Pipeline levels', store.pipe.level)}
        ${row('gem-stone', 'Word Wheel levels', store.wheel.level)}
        ${row('sports-medal', 'Mahjong boards cleared', store.mahjong.level)}
        ${row('trophy', 'Spider Solitaire games won', Object.values(store.spider.won).reduce((a, b) => a + b, 0))}
        ${row('star', 'Jigsaws completed', store.jigsaw.level)}
        ${row('sparkles', 'Sticker scenes finished', Object.keys(store.sticker.done).length)}
        ${row('fire', 'Pressure Point best level', store.press.reached)}
        ${row('sparkles', 'Arrow Away levels', store.arrow.level)}
        ${row('star', 'Sweet Drop stars', Object.values(store.rope.stars).reduce((a, b) => a + b, 0))}
        ${row('star', 'Infinity Stones claimed', store.hero.level.stones || 0)}
        ${row('crown', 'Chess games won', store.chess.stats.won)}
        ${row('trophy', 'Chess best level beaten', store.chess.stats.bestLevelBeaten || '-')}
      </div>
      <div class="section-title">Crosswords</div>
      <div class="card stat-group">
        ${row('trophy', 'Crosswords solved', Object.keys(store.cross.done).length)}
      </div>
      <div class="section-title">Word Search</div>
      <div class="card stat-group">
        ${row('trophy', 'Puzzles solved', store.ws.level)}
        ${row('star', 'Words found', store.ws.words || 0)}
      </div>
      <div class="section-title">Treat Twist</div>
      <div class="card stat-group">
        ${row('trophy', 'Levels finished', store.treat.level)}
        ${row('star', 'Stars collected', Object.values(store.treat.stars).reduce((a, b) => a + b, 0))}
      </div>
      <div class="section-title">Block Pounce</div>
      <div class="card stat-group">
        ${row('crown', 'Best score', (store.block.best || 0).toLocaleString('en-AU'))}
        ${row('puzzle-piece', 'Games played', store.block.games || 0)}
      </div>
      <div class="section-title">Solitaire</div>
      <div class="card stat-group">
        ${row('puzzle-piece', 'Games played', store.sol.stats.played)}
        ${row('trophy', 'Games won', store.sol.stats.won)}
        ${row('sports-medal', 'Best time', store.sol.stats.bestTime ? fmtTime(store.sol.stats.bestTime) : '-')}
        ${row('fire', 'Best win streak', store.sol.stats.bestStreak)}
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
        <button class="set-row" data-act="solrules"><div class="txt">How to play Solitaire</div></button>
        <button class="set-row" data-act="rules-more"><div class="txt">How to play the other games</div></button>
        <button class="set-row" data-act="crossrules"><div class="txt">How to play Crosswords</div></button>
        <button class="set-row" data-act="wsrules"><div class="txt">How to play Word Search</div></button>
        <button class="set-row" data-act="treatrules"><div class="txt">How to play Treat Twist</div></button>
        <button class="set-row" data-act="blockrules"><div class="txt">How to play Block Pounce</div></button>
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
    const sw = e.target.closest('.swatch[data-accent]');
    if (sw) { S.accent = sw.dataset.accent; save(); applyTheme(); render(); return; }
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'check') runUpdateCheck(true);
    else if (a === 'rules') sudokuRules();
    else if (a === 'meowrules') meowHelp();
    else if (a === 'sortrules') sortHelp();
    else if (a === 'solrules') solHelp();
    else if (a === 'treatrules') treatHelp();
    else if (a === 'crossrules') crossHelp();
    else if (a === 'rules-more') sheet(`<h2>How to play</h2>${[['2048', '2048'], ['mines', 'Minesweeper'], ['guess', 'Guesswork'], ['wheel', 'Word Wheel'], ['pipe', 'Pipeline'], ['mahjong', 'Mahjong Garden'], ['spider', 'Spider Solitaire'], ['jigsaw', 'Jigsaw'], ['sticker', 'Sticker Studio'], ['hashi', 'Island Hop'], ['gridlock', 'Gridlock'], ['crate', 'Crate Mate'], ['potion', 'Potion Pour'], ['arrow', 'Arrow Away'], ['chess', 'Chess'], ['rope', 'Sweet Drop'], ['snip', 'Snip Buddies'], ['turtle', 'Turtle Bay'], ['hero', 'Marvel Heroes'], ['press', 'Pressure Point'], ['yeti', 'Yeti Games'], ['moto', 'Moto Mania']].map(([k, n]) => `<button class="sheet-item" data-h="${k}">${n}</button>`).join('')}`, {
      onMount(node, close) { node.addEventListener('click', (ev) => { const b = ev.target.closest('[data-h]'); if (!b) return; close(); ({ 2048: help2048, mines: minesHelp, guess: guessHelp, wheel: wheelHelp, pipe: pipeHelp, mahjong: mahjongHelp, spider: spiderHelp, jigsaw: jigsawHelp, sticker: stickerHelp, hashi: hashiHelp, gridlock: gridlockHelp, crate: crateHelp, potion: potionHelp, arrow: arrowHelp, chess: chessHelp, rope: ropeHelp, snip: snipHelp, turtle: () => turtleHelp(), hero: () => heroHelp(), press: () => pressHelp(), yeti: () => yetiHelp(), moto: () => motoHelp() })[b.dataset.h](); }); },
    });
    else if (a === 'wsrules') wsHelp();
    else if (a === 'blockrules') blockHelp();
    else if (a === 'about') app.go('about');
    else if (a === 'reset') {
      const ok = await dialog({ title: 'Reset all progress?', text: 'This deletes your statistics, saved games, progress in every game. Your settings stay. This cannot be undone.',
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
      <div class="home-hero">${brandSvg}<div class="app-name">GameHub</div><div class="tagline">Version ${esc(native.versionName())}</div></div>
      <div class="card credits">
        <p>An ad-free collection of logic puzzles. Every Sudoku is generated on your phone with exactly one solution, and every Meowdoku level can be solved with logic alone.</p><br>
        <p>Your progress stays on this device. The app only goes online to check GitHub for updates, which you can turn off in Settings.</p><br>
        <p><b>Words.</b> Word lists are based on SCOWL, copyright Kevin Atkinson and contributors, used under its permissive licence (see levels/WORDLIST-LICENSE.txt).</p><br>
        <p><b>Chess.</b> The chess pieces are the Cburnett set by Colin M.L. Burnett, from Wikimedia Commons, used under the BSD licence (see img/chess/LICENSE.txt).</p><br>
        <p><b>Sweet Drop.</b> The sweet, stars, bubbles and spikes are from Kenney's Platformer Art Candy and Jumper Pack, and the frog is from Kenney's Animal Pack (kenney.nl, CC0).</p><br>
        <p><b>Snip Buddies.</b> Faces, tiles, balloons and clouds are from Kenney's Shape Characters and Background Elements (kenney.nl, CC0). Snipping uses polygon-clipping by Mike Fogel (MIT licence), with splaytree (MIT) and robust-predicates (Unlicense).</p><br>
        <p><b>Turtle Bay.</b> The turtles, tortoises, crab, jellyfish, gull, kelp, coral and lily pad are by Poly by Google, the green turtle by jeremy, the long-necked turtle by Crispy_Prawn and the seagrass by Laney XR Labs, all under CC-BY 3.0 (creativecommons.org/licenses/by/3.0). The fish, lettuce, log and rock are by Quaternius and the bag by Kenney (CC0). All were found on poly.pizza and rendered into pictures for this app. River Hop's cars and trees come from Moto Mania.</p><br>
        <p><b>Marvel Heroes.</b> An unofficial fan project, not made or endorsed by Marvel or Disney. Marvel characters, names and related marks belong to Marvel. All hero artwork is drawn by the app on Kenney's Toon Characters; robots and gems are from Kenney's Robot Pack and Puzzle Pack 2 (kenney.nl, CC0). Thor's hammer is "mjolner" by OZZYBOI and the arc reactor is "Arc Reactor" by Heiko Jakob, both from poly.pizza under CC-BY 3.0 (creativecommons.org/licenses/by/3.0).</p><br>
        <p><b>Moto Mania.</b> The motorbikes and the scooter are by Poly by Google, and the dirt bike is by Corentin Fatus, all under CC-BY 3.0 (creativecommons.org/licenses/by/3.0), found on poly.pizza. Riders, cars, roads, buildings, food and scenery are from Kenney's Mini Characters, Car Kit, City Kits, Racing Kit, Food Kit and Nature Kit (kenney.nl, CC0). 3D drawing uses three.js (MIT licence).</p><br>
        <p><b>Yeti Games.</b> The yeti, llama, ox and snake are by Quaternius (CC0). The penguin, orca, seal, albatross (a gull), giraffe, elephant, vulture, acacia, ibex, bighorn ram, surfboard and icicle are by Poly by Google, and the flamingo is by Хмара Сергей, all under CC-BY 3.0 (creativecommons.org/licenses/by/3.0). The snowboard is by Geldvillager and the bat by CreativeTrio (CC0). All were found on poly.pizza and rendered into pictures for this app.</p><br>
        <p><b>Artwork.</b> Animal, scenery and vehicle pictures are by Kenney (kenney.nl), released into the public domain under CC0. All other illustrations, including the cats, icons and Mahjong tiles, are original to GameHub.</p><br>
        <p><b>Inspiration.</b> GameHub is an independent app. It is not made by, endorsed by or affiliated with Easybrain, Oakever Games, Easetouch, King, Hungry Studio or any other game maker. Its games are our own takes on popular puzzle styles, with original artwork and names.</p><br>
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
let updateBusy = false; // one check (and one update dialog) at a time
async function runUpdateCheck(manual = false) {
  const meta = store.meta;
  if (updateBusy) return;
  updateBusy = true;
  if (manual) toast('Checking for updates');
  try {
    const u = await checkForUpdate(store.settings.updateChannel);
    meta.lastUpdateCheck = Date.now(); save();
    if (!u) { if (manual) toast('You have the latest version'); return; }
    if (!manual && meta.skipVersion === u.version) return;
    const mb = u.size ? ` (${(u.size / 1048576).toFixed(1)} MB)` : '';
    const v = await dialog({
      hero: 'img/art/ui/party-popper.svg', title: 'Update available',
      text: `Version ${u.version}${u.prerelease ? ' beta' : ''} is ready to install${mb}.`,
      notes: u.notes,
      buttons: [{ label: 'Update now', value: 'go' }, { label: 'Later', value: 'later', cls: 'secondary' }, { label: 'Skip this version', value: 'skip', cls: 'ghost' }],
      backdrop: false, // a stray tap outside should not throw the update away (back still closes it)
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
  } finally { updateBusy = false; }
}

// ---------- Boot ----------
applyTheme();
app.reset('games');
loadLevels();
prefetch('easy');
// Check for a new version every time the app opens, and again when it comes back after a while
// (Android often resumes the app rather than starting it fresh).
const autoCheck = () => { if (native.isApp && store.settings.autoUpdate) runUpdateCheck(false); };
setTimeout(autoCheck, 1500);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() - store.meta.lastUpdateCheck > 10 * 60 * 1000) autoCheck();
});
// Resume audio context on first touch (browsers require a gesture).
document.addEventListener('pointerdown', () => sfx.tap && null, { once: true });
