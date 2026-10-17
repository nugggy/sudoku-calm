// Cosy Cat Sort engine.
// Shelves sit on either side of a centre aisle. Each shelf holds 4 cats, filled from the wall end,
// so only the cat nearest the aisle can be picked up (a run of matching cats at that end moves together).
// Four matching cats on one shelf go home. Mystery boxes open when they become the cat nearest the aisle.
// When a shelf is emptied, its back row (if any) drops in.
// Pure functions, shared by the game and the Node tests.

import { mulberry32 } from './sudoku-engine.js';

export const SLOTS = 4;
export const COSTUMES = 14;

const shuffle = (a, rng) => { for (let i = a.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clone = (s) => JSON.parse(JSON.stringify(s));

// Level recipe. Outfits are added every three levels until all 14 are in play, then shelves get
// scarcer (so more cats wait in back rows). Every tenth level is a Hard level with fewer free spots.
export function recipe(level) {
  const L = level + 1;
  const hard = L >= 10 && L % 10 === 0;
  const k = Math.min(COSTUMES, 3 + Math.floor((L - 1) / 3));
  let spare = Math.max(4, 6 - Math.floor(L / 15));
  let shelves = Math.min(10, k + 2);
  if (L > 60) shelves = Math.max(9, 10 - Math.floor((L - 60) / 60));
  let boxRate = L < 4 ? 0 : Math.min(0.35, (L - 3) * 0.02);
  if (hard) { spare = Math.max(3, spare - 1); boxRate = Math.min(0.45, boxRate + 0.1); }
  return { k, spare, shelves, boxRate, hold: 2, hard };
}

// ---------- Shelf helpers (slot 0 is at the wall, higher slots are nearer the aisle) ----------
export const count = (s) => s.slots.filter((c) => c !== null).length;
export const topIndex = (s) => count(s) - 1;
export const space = (s) => SLOTS - count(s);
// The run of matching, visible cats at the aisle end.
export function topRun(s) {
  const t = topIndex(s);
  if (t < 0 || s.hidden[t]) return { cat: null, n: 0 };
  let n = 1;
  while (t - n >= 0 && !s.hidden[t - n] && s.slots[t - n] === s.slots[t]) n++;
  return { cat: s.slots[t], n };
}
export const isComplete = (s) => count(s) === SLOTS && s.slots.every((c, i) => !s.hidden[i] && c === s.slots[0]);
export const freeSlots = (st) => st.shelves.reduce((a, s) => a + space(s), 0) + st.hold.filter((c) => c === null).length;
export const totalCats = (st) => st.k * SLOTS;
export const isWon = (st) => st.home.length === st.k;

export function newLevel(level, seed = 7777 + level * 104729) {
  const rng = mulberry32(seed);
  const r = recipe(level);
  for (let attempt = 0; attempt < 300; attempt++) {
    const cats = shuffle([...Array(r.k)].flatMap((_, c) => [c, c, c, c]), rng);
    const frontCount = Math.min(cats.length, r.shelves * SLOTS - r.spare);
    const front = cats.slice(0, frontCount), back = cats.slice(frontCount);
    // share the front cats out between shelves, each filled from the wall
    const fill = new Array(r.shelves).fill(0);
    for (let i = 0; i < frontCount; i++) {
      const open = fill.map((f, j) => (f < SLOTS ? j : -1)).filter((j) => j >= 0);
      fill[open[(rng() * open.length) | 0]]++;
    }
    let p = 0;
    const shelves = fill.map((f) => {
      const slots = new Array(SLOTS).fill(null);
      for (let i = 0; i < f; i++) slots[i] = front[p++];
      return { slots, hidden: new Array(SLOTS).fill(false), layers: [] };
    });
    while (back.length) {
      const s = shelves[(rng() * shelves.length) | 0];
      s.layers.push(back.splice(0, Math.min(back.length, 2 + ((rng() * 3) | 0))));
    }
    // mystery boxes: never the cat nearest the aisle
    for (const s of shelves) for (let i = 0; i < topIndex(s); i++) if (rng() < r.boxRate) s.hidden[i] = true;
    const state = { level, k: r.k, hard: r.hard, shelves, hold: new Array(r.hold).fill(null), home: [], moves: 0 };
    if (shelves.some(isComplete)) continue;
    if (solvable(state, rng)) return state;
  }
  throw new Error('could not build level ' + level);
}

function settle(st, si, events) {
  const s = st.shelves[si];
  const t = topIndex(s);
  if (t >= 0 && s.hidden[t]) { s.hidden[t] = false; events.push({ type: 'reveal', shelf: si, slot: t }); }
  if (count(s) === 0 && s.layers.length) {
    const layer = s.layers.shift();
    layer.forEach((c, i) => { s.slots[i] = c; s.hidden[i] = false; });
    events.push({ type: 'drop', shelf: si });
  }
}

// Moves cats. from: {shelf} or {hold}. to: {shelf} or {hold}.
// From a shelf, the whole matching run at the aisle end moves (as many as fit).
// Returns events for animation ({type:'move', cat, moves:[{from, to}]}, 'home', 'reveal', 'drop'), or null.
export function move(st, from, to) {
  if (from.shelf != null && to.shelf != null && from.shelf === to.shelf) return null;
  let cat, n;
  if (from.hold != null) {
    cat = st.hold[from.hold];
    if (cat === null || cat === undefined) return null;
    n = 1;
  } else {
    ({ cat, n } = topRun(st.shelves[from.shelf]));
    if (!n) return null;
  }
  const take = () => {
    if (from.hold != null) { st.hold[from.hold] = null; return { hold: from.hold }; }
    const s = st.shelves[from.shelf], slot = topIndex(s);
    s.slots[slot] = null;
    return { shelf: from.shelf, slot };
  };
  const moves = [];
  if (to.hold != null) {
    const free = st.hold.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0);
    if (to.hold >= 0 && st.hold[to.hold] === null) free.sort((a, b) => (a === to.hold ? -1 : b === to.hold ? 1 : 0));
    n = Math.min(n, free.length);
    if (!n) return null;
    for (let k = 0; k < n; k++) {
      const src = take();
      st.hold[free[k]] = cat;
      moves.push({ from: src, to: { hold: free[k] } });
    }
  } else {
    const d = st.shelves[to.shelf];
    n = Math.min(n, space(d));
    if (!n) return null;
    for (let k = 0; k < n; k++) {
      const src = take();
      const slot = count(d);
      d.slots[slot] = cat; d.hidden[slot] = false;
      moves.push({ from: src, to: { shelf: to.shelf, slot } });
    }
  }
  st.moves++;
  const events = [{ type: 'move', cat, moves }];
  if (to.shelf != null && isComplete(st.shelves[to.shelf])) {
    st.home.push(cat);
    st.shelves[to.shelf].slots.fill(null);
    events.push({ type: 'home', shelf: to.shelf, cat });
    settle(st, to.shelf, events);
  }
  if (from.shelf != null) settle(st, from.shelf, events);
  return events;
}

// Stuck when no legal move exists.
export function isStuck(st) {
  if (isWon(st)) return false;
  const holdFree = st.hold.some((c) => c === null);
  const shelfSpace = st.shelves.map(space);
  const sources = [];
  st.shelves.forEach((s, i) => { if (topRun(s).n) sources.push({ shelf: i }); });
  st.hold.forEach((c, i) => { if (c !== null) sources.push({ hold: i }); });
  for (const src of sources) {
    if (src.shelf != null && holdFree) return false;
    if (shelfSpace.some((sp, i) => sp > 0 && i !== src.shelf)) return false;
  }
  return true;
}

// Shuffle booster: rearranges every visible cat (shelves and baskets) without making instant sets.
export function shuffleCats(st, rng = Math.random) {
  const spots = [];
  st.shelves.forEach((s, si) => s.slots.forEach((c, i) => { if (c !== null && !s.hidden[i]) spots.push([si, i]); }));
  st.hold.forEach((c, i) => { if (c !== null) spots.push([-1, i]); });
  const cats = spots.map(([si, i]) => (si < 0 ? st.hold[i] : st.shelves[si].slots[i]));
  for (let t = 0; t < 30; t++) {
    shuffle(cats, rng);
    spots.forEach(([si, i], k) => { if (si < 0) st.hold[i] = cats[k]; else st.shelves[si].slots[i] = cats[k]; });
    if (!st.shelves.some(isComplete)) return;
  }
}

// ---------- Solvability check (randomised, heuristic playouts) ----------
function legalMoves(st) {
  const out = [];
  const srcs = [];
  st.shelves.forEach((s, i) => { const r = topRun(s); if (r.n) srcs.push({ from: { shelf: i }, cat: r.cat, n: r.n }); });
  st.hold.forEach((c, i) => { if (c !== null) srcs.push({ from: { hold: i }, cat: c, n: 1 }); });
  const holdFree = st.hold.indexOf(null);
  for (const src of srcs) {
    st.shelves.forEach((d, j) => {
      if (src.from.shelf === j || space(d) === 0) return;
      const r = topRun(d);
      const fromShelf = src.from.shelf != null ? st.shelves[src.from.shelf] : null;
      const moved = Math.min(src.n, space(d));
      let score = 0;
      if (r.cat === src.cat && r.n === count(d) && count(d) + moved === SLOTS) score += 200; // completes a set
      if (count(d) && r.cat === src.cat) score += 40 + 10 * r.n;
      if (!count(d)) score += src.n >= 2 ? 25 : 5;
      if (count(d) && r.cat !== src.cat) score -= 25;
      if (fromShelf) {
        const left = count(fromShelf) - moved;
        if (left > 0 && fromShelf.hidden[left - 1]) score += 30;      // opens a box
        if (left === 0 && fromShelf.layers.length) score += 20;       // drops a back row
        if (left === 0 && !fromShelf.layers.length && !count(d)) score -= 30; // pointless shuffle
      } else score += 15; // clearing a basket is good
      out.push({ from: src.from, to: { shelf: j }, score });
    });
    if (src.from.shelf != null && holdFree >= 0) out.push({ from: src.from, to: { hold: holdFree }, score: -10 });
  }
  return out;
}

function key(st) { return st.shelves.map((s) => s.slots.map((c, i) => (c === null ? '.' : s.hidden[i] ? '?' : c)).join(',')).join('|') + '#' + st.hold.join(','); }

function playout(st, rng) {
  const seen = new Set();
  for (let step = 0; step < 400; step++) {
    if (isWon(st)) return true;
    seen.add(key(st));
    const ms = legalMoves(st);
    if (!ms.length) return false;
    // prefer good moves, with some randomness; never revisit a position
    const ranked = ms.map((m) => ({ m, w: m.score + rng() * 30 })).sort((a, b) => b.w - a.w);
    let done = false;
    for (const { m } of ranked.slice(0, 6)) {
      const trial = clone(st);
      if (!move(trial, m.from, m.to) || seen.has(key(trial))) continue;
      move(st, m.from, m.to);
      done = true;
      break;
    }
    if (!done) return false;
  }
  return false;
}

export function solvable(state, rng, tries = 16) {
  for (let t = 0; t < tries; t++) if (playout(clone(state), rng)) return true;
  return false;
}

// Compact level format for the pre-built level file: cats are letters a..n, '?' marks a box.
export function encodeLevel(st) {
  const L = (c) => String.fromCharCode(97 + c);
  return [st.k, st.hard ? 1 : 0, st.shelves.map((sh) => [
    sh.slots.filter((c) => c !== null).map((c, i) => (sh.hidden[i] ? L(c).toUpperCase() : L(c))).join(''),
    sh.layers.map((l) => l.map(L).join('')).join(','),
  ])];
}
export function decodeLevel(level, data) {
  const [k, hard, shelves] = data;
  const N = (ch) => ch.toLowerCase().charCodeAt(0) - 97;
  return {
    level, k, hard: !!hard, hold: [null, null], home: [], moves: 0,
    shelves: shelves.map(([front, layers]) => {
      const slots = new Array(SLOTS).fill(null), hidden = new Array(SLOTS).fill(false);
      [...front].forEach((ch, i) => { slots[i] = N(ch); hidden[i] = ch !== ch.toLowerCase(); });
      return { slots, hidden, layers: layers ? layers.split(',').map((l) => [...l].map(N)) : [] };
    }),
  };
}

export { clone };
