// Cosy Cat Sort engine. Shelves hold 4 cats each. Gather 4 matching cats on one shelf and they go home.
// Mystery boxes hide a cat until a neighbouring slot changes. Shelves can have back layers that drop in when the shelf empties.
// Pure functions, shared by the game and the Node tests.

import { mulberry32 } from './sudoku-engine.js';

export const SLOTS = 4;
export const COSTUMES = 10;

const shuffle = (a, rng) => { for (let i = a.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clone = (s) => JSON.parse(JSON.stringify(s));

// Level recipe: more costumes, fewer spare slots, more boxes and layers as levels rise.
export function recipe(level) {
  const L = level + 1;
  const k = Math.min(COSTUMES, 3 + Math.floor((L - 1) / 2));
  const spare = Math.max(2, 5 - Math.floor(L / 8));         // empty front slots at the start
  let shelves = Math.min(10, k + (L < 8 ? 2 : 1));
  if (L > 16) shelves = Math.max(6, shelves - Math.floor((L - 16) / 12)); // fewer shelves means deeper layers
  const boxRate = L < 4 ? 0 : Math.min(0.3, (L - 3) * 0.025);
  return { k, spare, shelves, boxRate, hold: 2 };
}

export function newLevel(level, seed = 7777 + level * 104729) {
  const rng = mulberry32(seed);
  const r = recipe(level);
  for (let attempt = 0; attempt < 200; attempt++) {
    const cats = shuffle([...Array(r.k)].flatMap((_, c) => [c, c, c, c]), rng);
    const frontCount = Math.min(cats.length, r.shelves * SLOTS - r.spare);
    const front = cats.slice(0, frontCount), back = cats.slice(frontCount);
    // spread front cats and gaps randomly over the shelves
    const positions = shuffle([...Array(r.shelves * SLOTS).keys()], rng).slice(0, frontCount).sort((a, b) => a - b);
    const shelves = [...Array(r.shelves)].map(() => ({ slots: new Array(SLOTS).fill(null), hidden: new Array(SLOTS).fill(false), layers: [] }));
    positions.forEach((p, i) => { shelves[(p / SLOTS) | 0].slots[p % SLOTS] = front[i]; });
    // back layers go behind random shelves, up to 4 cats per layer
    while (back.length) {
      const s = shelves[(rng() * shelves.length) | 0];
      const n = Math.min(back.length, 2 + ((rng() * 3) | 0));
      s.layers.push(back.splice(0, n));
    }
    // mystery boxes: at most 2 per shelf, never on a shelf without a free neighbour to reveal it
    for (const s of shelves) {
      let boxes = 0;
      for (let i = 0; i < SLOTS; i++) if (s.slots[i] !== null && boxes < 2 && rng() < r.boxRate) { s.hidden[i] = true; boxes++; }
    }
    const state = { level, k: r.k, shelves, hold: new Array(r.hold).fill(null), home: [], moves: 0 };
    if (shelves.some((s) => isComplete(s))) continue;
    if (solvable(state, rng)) return state;
  }
  throw new Error('could not build level ' + level);
}

export const isComplete = (s) => s.slots.every((c, i) => c !== null && !s.hidden[i] && c === s.slots[0]);
export const freeSlots = (st) => st.shelves.reduce((a, s) => a + s.slots.filter((c) => c === null).length, 0) + st.hold.filter((c) => c === null).length;
export const totalCats = (st) => st.k * SLOTS;
export const isWon = (st) => st.home.length === st.k;

function reveal(s, i) {
  for (const j of [i - 1, i + 1]) if (j >= 0 && j < SLOTS && s.hidden[j]) s.hidden[j] = false;
}

// Moves a cat. from: {hold:i} or {shelf:s, slot:i}. to: {hold:i} or {shelf:s} (first empty slot) or {shelf:s, slot:i}.
// Returns a list of events for animation, or null if the move is not allowed.
export function move(st, from, to) {
  const src = from.hold != null ? null : st.shelves[from.shelf];
  const cat = src ? src.slots[from.slot] : st.hold[from.hold];
  if (cat === null || cat === undefined || (src && src.hidden[from.slot])) return null;
  let dstShelf = null, dstIndex;
  if (to.hold != null) {
    dstIndex = to.hold >= 0 && st.hold[to.hold] === null ? to.hold : st.hold.indexOf(null);
    if (dstIndex < 0) return null;
  } else {
    dstShelf = st.shelves[to.shelf];
    dstIndex = to.slot != null && dstShelf.slots[to.slot] === null ? to.slot : dstShelf.slots.indexOf(null);
    if (dstIndex < 0 || dstShelf === src) return null;
  }
  const events = [];
  if (src) { src.slots[from.slot] = null; reveal(src, from.slot); } else st.hold[from.hold] = null;
  if (dstShelf) { dstShelf.slots[dstIndex] = cat; reveal(dstShelf, dstIndex); } else st.hold[dstIndex] = cat;
  st.moves++;
  events.push({ type: 'move', cat, from, to: dstShelf ? { shelf: to.shelf, slot: dstIndex } : { hold: dstIndex } });
  if (dstShelf && isComplete(dstShelf)) {
    st.home.push(cat);
    dstShelf.slots.fill(null);
    events.push({ type: 'home', shelf: to.shelf, cat });
  }
  for (const [s, idx] of [[src, from.shelf], [dstShelf, to.shelf]]) {
    if (s && s.slots.every((c) => c === null) && s.layers.length) {
      const layer = s.layers.shift();
      layer.forEach((c, i) => { s.slots[i] = c; s.hidden[i] = false; });
      events.push({ type: 'drop', shelf: idx });
    }
  }
  return events;
}

// True when nothing can move: every slot is full (shelves and holding spots).
export const isStuck = (st) => !isWon(st) && freeSlots(st) === 0;

// Shuffle booster: rearrange every visible cat on the shelves (holding spots too) without creating instant sets.
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

// ---------- Solvability check (randomised greedy playouts) ----------
function emptySpots(st, exceptShelf) {
  const out = [];
  st.shelves.forEach((s, si) => { if (si !== exceptShelf) s.slots.forEach((c, i) => { if (c === null) out.push({ shelf: si, slot: i }); }); });
  st.hold.forEach((c, i) => { if (c === null) out.push({ hold: i }); });
  return out;
}
function locate(st) {
  const where = [...Array(st.k)].map(() => []);
  st.shelves.forEach((s, si) => s.slots.forEach((c, i) => { if (c !== null && !s.hidden[i]) where[c].push({ shelf: si, slot: i }); }));
  st.hold.forEach((c, i) => { if (c !== null) where[c].push({ hold: i }); });
  return where;
}

function playout(st, rng) {
  for (let step = 0; step < 600; step++) {
    if (isWon(st)) return true;
    const where = locate(st);
    let acted = false;
    // 1. gather a colour that is fully visible
    const ready = shuffle([...Array(st.k).keys()].filter((c) => where[c].length === SLOTS), rng);
    for (const c of ready) {
      const counts = st.shelves.map((s) => s.slots.some((x, i) => s.hidden[i]) ? -1 : s.slots.filter((x) => x === c).length);
      const X = counts.indexOf(Math.max(...counts));
      if (counts[X] < 0) continue;
      const shelf = st.shelves[X];
      const outsiders = shelf.slots.map((x, i) => (x !== null && x !== c ? i : -1)).filter((i) => i >= 0);
      if (emptySpots(st, X).length < outsiders.length) continue;
      for (const i of outsiders) move(st, { shelf: X, slot: i }, emptySpots(st, X)[0]);
      for (const p of locate(st)[c]) if (p.shelf !== X) move(st, p, { shelf: X });
      acted = true; break;
    }
    if (acted) continue;
    // 2. reveal a mystery box by moving a neighbour
    const boxShelves = shuffle(st.shelves.map((s, si) => si).filter((si) => st.shelves[si].hidden.some(Boolean)), rng);
    for (const si of boxShelves) {
      const s = st.shelves[si];
      const empty = s.slots.findIndex((c, i) => c === null && ((i > 0 && s.hidden[i - 1]) || (i < SLOTS - 1 && s.hidden[i + 1])));
      const spots = emptySpots(st, si);
      if (empty >= 0) {
        const donor = locate(st).flat().find((p) => p.shelf !== si);
        if (donor) { move(st, donor, { shelf: si, slot: empty }); acted = true; break; }
      }
      const nb = s.slots.findIndex((c, i) => c !== null && !s.hidden[i] && ((i > 0 && s.hidden[i - 1]) || (i < SLOTS - 1 && s.hidden[i + 1])));
      if (nb >= 0 && spots.length) { move(st, { shelf: si, slot: nb }, spots[(rng() * spots.length) | 0]); acted = true; break; }
    }
    if (acted) continue;
    // 3. empty a shelf that has a back layer
    const layered = shuffle(st.shelves.map((s, si) => si).filter((si) => st.shelves[si].layers.length && !st.shelves[si].hidden.some(Boolean)), rng)
      .sort((a, b) => st.shelves[a].slots.filter((c) => c !== null).length - st.shelves[b].slots.filter((c) => c !== null).length);
    for (const si of layered) {
      const s = st.shelves[si];
      const cats = s.slots.map((c, i) => (c !== null ? i : -1)).filter((i) => i >= 0);
      if (emptySpots(st, si).length < cats.length) continue;
      for (const i of cats) move(st, { shelf: si, slot: i }, emptySpots(st, si)[0]);
      acted = true; break;
    }
    if (!acted) return false;
  }
  return false;
}

export function solvable(state, rng, tries = 24) {
  for (let t = 0; t < tries; t++) if (playout(clone(state), rng)) return true;
  return false;
}

export { clone };
