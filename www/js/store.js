// Persistent app data in localStorage. Everything lives on the device; nothing is sent anywhere.
import { DIFFICULTIES } from './sudoku-engine.js';

const KEY = 'sudokucalm.v1';

const emptyStats = () => ({ started: 0, won: 0, perfect: 0, bestTime: 0, totalTime: 0, streak: 0, bestStreak: 0, bestScore: 0 });

const defaults = () => ({
  settings: {
    theme: 'system',          // system | light | dark
    accent: 'blue',
    sound: true,
    vibrate: true,
    mistakeLimit: true,
    autoCheck: true,
    highlightArea: true,
    highlightSame: true,
    highlightDupes: true,
    autoRemoveNotes: true,
    hideUsed: true,
    showRemaining: false,
    showTimer: true,
    unlimitedHints: false,
    fontScale: 1,
    meowAutoX: false,
    meowTimer: true,
    autoUpdate: true,
    updateChannel: 'stable',  // stable | beta
  },
  game: null,                 // current Sudoku game
  dailyGame: null,            // current daily challenge game
  stats: Object.fromEntries(DIFFICULTIES.map((d) => [d, emptyStats()])),
  daily: {},                  // 'YYYY-MM-DD' -> {time, score}
  pool: {},                   // pre-generated puzzles per difficulty
  meow: { level: 0, best: {}, current: null, cat: 0, totalTime: 0, hints: 0 },
  sort: { level: 0, current: null, boosters: { undo: 5, shuffle: 3, slot: 3 } },
  treat: { level: 0, stars: {}, best: 0 },
  cross: { level: 0, done: {}, current: null },
  ws: { level: 0, current: null, words: 0 },
  g2048: { best: 0, current: null, games: 0 },
  mines: { best: {}, played: {}, won: {} },
  guess: { stats: { played: 0, won: 0, streak: 0, best: 0, dist: [0, 0, 0, 0, 0, 0] }, daily: {}, dailyState: null, practice: null },
  hashi: { level: 0, current: null },
  gridlock: { level: 0, best: {}, current: null },
  crate: { level: 0, best: {}, current: null },
  potion: { level: 0, current: null },
  chess: { current: null, level: 3, colour: 'w', flip: true, seenHelp: false, stats: { played: 0, won: 0, lost: 0, drawn: 0, bestLevelBeaten: 0 } },
  rope: { level: 0, stars: {}, seenHelp: false },
  snip: { level: 0, done: {}, name: '', seenHelp: false },
  turtle: { best: {}, played: {}, seen: {}, trek: { level: 0, stars: {} } },
  hero: { best: {}, played: {}, seen: {}, level: {}, stars: {}, coins: 0, look: null, owned: [], pick: 'spidey', name: '' },
  duo: { name: '', wins: {}, played: {}, seen: {}, via: 'wifi' },
  arrow: { level: 0, current: null, seenHelp: false },
  press: { reached: 0, seenHelp: false },
  yeti: { best: {}, played: {}, seen: {}, tourBest: 0 },
  moto: { coins: 0, owned: ['scooter'], bike: 'scooter', paint: {}, paints: ['factory'], rider: 'r1', best: {}, played: {}, seen: {}, level: {}, stars: {} },
  mahjong: { level: 0, best: {} },
  wheel: { level: 0, bonus: 0, hints: 5, current: null, revealed: {} },
  pipe: { level: 0 },
  spider: { current: null, played: {}, won: {}, best: {} },
  jigsaw: { level: 0, current: null, ghost: false },
  sticker: { placed: {}, done: {}, numbers: true, last: 0 },
  block: { best: 0, games: 0, current: null },
  sol: { draw: 1, current: null, next: {}, stats: { played: 0, won: 0, bestTime: 0, fewestMoves: 0, streak: 0, bestStreak: 0, bestScore: 0 } },
  meta: { installed: Date.now(), lastUpdateCheck: 0, skipVersion: '', opened: {}, openedSeeded: false },
});

function merge(base, saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return saved ?? base;
  const out = { ...base };
  for (const k of Object.keys(saved)) {
    out[k] = base && typeof base[k] === 'object' && base[k] && !Array.isArray(base[k]) ? merge(base[k], saved[k]) : saved[k];
  }
  return out;
}

function load() {
  try { return merge(defaults(), JSON.parse(localStorage.getItem(KEY) || 'null')); }
  catch { return defaults(); }
}

export const store = load();

let timer = null;
export function save(now = false) {
  clearTimeout(timer);
  const write = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage full or blocked */ } };
  if (now) write(); else timer = setTimeout(write, 250);
}

export function resetAll() {
  const keepSettings = store.settings;
  const fresh = defaults();
  Object.keys(store).forEach((k) => delete store[k]);
  Object.assign(store, fresh, { settings: keepSettings });
  save(true);
}

export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m).padStart(2, '0')) + ':' + String(s).padStart(2, '0');
}
