// Dance Party routines. Each song gets the same routine every time (seeded by its id) so it can be learnt:
// two bars to get ready, then sections of eight bars that repeat like verses and choruses, each ending on a gold
// move, and a final pose. No browser dependencies.
import { MOVES, POOLS, GOLD } from './moves.js';

function rng(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

const INTRO = 8, SECTION = 32, PHRASE = 8;

// One eight-beat phrase. Easier songs repeat each move so it lasts four beats.
function phrase(r, pool, level) {
  const pick = () => pool[Math.floor(r() * pool.length)];
  const out = [];
  let b = 0;
  while (b < PHRASE) {
    const id = pick(), m = MOVES[id];
    if (b + m.len > PHRASE) continue;
    const reps = m.len === 4 || level >= 4 || (level === 3 && r() < 0.5) ? 1 : 2;
    for (let i = 0; i < reps && b + m.len <= PHRASE; i++) { out.push(id); b += m.len; }
  }
  return out;
}

// A section: four phrases in a pattern such as A A B B or A B A C, with the last two beats a gold move.
function section(r, pool, level) {
  const a = phrase(r, pool, level), b = phrase(r, pool, level), c = phrase(r, pool, level);
  const shapes = [[a, a, b, b], [a, b, a, b], [a, b, a, c], [a, a, b, c]];
  const list = shapes[Math.floor(r() * shapes.length)].flat();
  // swap the end for the gold move, keeping whole moves
  let beats = list.reduce((n, id) => n + MOVES[id].len, 0);
  while (beats > SECTION - 2) beats -= MOVES[list.pop()].len;
  while (beats < SECTION - 2) { list.push('clap'); beats += 2; }
  list.push(GOLD[Math.floor(r() * GOLD.length)]);
  return list;
}

// song: { id, beats, level (1 to 6) }. Returns [{ id, beat, len, gold }] in order.
export function routine(song) {
  const r = rng(`dance:${song.id}`);
  const pool = POOLS.slice(0, Math.min(POOLS.length, 1 + Math.floor((song.level - 1) / 2) + (song.level >= 5 ? 2 : 0))).flat();
  const sections = { A: section(r, pool, song.level), B: section(r, pool, song.level), C: section(r, pool, song.level) };
  const order = ['A', 'B', 'A', 'C', 'B', 'C', 'A', 'B', 'C'];
  const out = [];
  let beat = INTRO;
  const end = song.beats - 8; // the last two bars are the final pose and the fade
  for (let s = 0; beat + SECTION <= end; s++) {
    for (const id of sections[order[s % order.length]]) { out.push({ id, beat, len: MOVES[id].len, gold: !!MOVES[id].gold }); beat += MOVES[id].len; }
  }
  // fill up to the end with the first phrases of A, then strike the final pose
  for (const id of sections.A) { if (beat + MOVES[id].len > end) break; if (MOVES[id].gold) continue; out.push({ id, beat, len: MOVES[id].len, gold: false }); beat += MOVES[id].len; }
  out.push({ id: 'pose', beat, len: 2, gold: true });
  return out;
}
