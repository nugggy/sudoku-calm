import { newLevel, recipe, move, isWon, totalCats, topRun, isValidBoard } from '../www/js/sort-engine.js';
let fail = 0, worst = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('FAIL', msg); } };
const shelf = (slots, hidden = [false, false, false, false]) => ({ slots, hidden, layers: [] });

for (let L = 0; L < 300; L++) {
  const t0 = performance.now();
  let st;
  try { st = newLevel(L); } catch (e) { check(false, `build ${L}: ${e.message}`); continue; }
  const ms = performance.now() - t0; worst = Math.max(worst, ms);
  const cats = st.shelves.reduce((a, s) => a + s.slots.filter((c) => c !== null).length + s.layers.flat().length, 0);
  check(cats === totalCats(st), `count ${L}`);
  // shelves fill from the wall: no gaps before the last cat
  check(st.shelves.every((s) => s.slots.every((c, i) => c !== null || s.slots.slice(i).every((x) => x === null))), `packing ${L}`);
  // the cat nearest the aisle is never hidden; no level starts with a shelf that is already a set
  check(st.shelves.every((s) => { const t = s.slots.filter((c) => c !== null).length - 1; return t < 0 || !s.hidden[t]; }), `top hidden ${L}`);
  if (L % 30 === 0 || L === 9) { const r = recipe(L); console.log(`L${L + 1}${r.hard ? ' HARD' : ''}: k=${r.k} shelves=${r.shelves} back=${r.back} layers=${st.shelves.reduce((a, s) => a + s.layers.length, 0)} boxes=${st.shelves.reduce((a, s) => a + s.hidden.filter(Boolean).length, 0)} ${ms.toFixed(0)}ms`); }
}
check(JSON.stringify(newLevel(20)) === JSON.stringify(newLevel(20)), 'determinism');

// only the aisle-end run can move, and a matching run moves together
let st = { k: 2, shelves: [shelf([1, 0, 0, null]), shelf([null, null, null, null]), shelf([1, 1, 1, null])], hold: [null, null], home: [], moves: 0 };
check(topRun(st.shelves[0]).n === 2 && topRun(st.shelves[0]).cat === 0, 'top run');
let ev = move(st, { shelf: 0 }, { shelf: 1 });
check(ev && ev[0].moves.length === 2 && st.shelves[1].slots.join() === '0,0,,' && st.shelves[0].slots.join() === '1,,,', 'multi move');
ev = move(st, { shelf: 0 }, { shelf: 2 });
check(ev && ev.some((e) => e.type === 'home') && st.home.length === 1, 'set goes home');
// a run only moves as many as fit
st = { k: 2, shelves: [shelf([0, 0, 0, null]), shelf([1, 0, 0, null])], hold: [null, null], home: [], moves: 0 };
ev = move(st, { shelf: 0 }, { shelf: 1 });
check(ev && ev[0].moves.length === 1 && st.shelves[0].slots.join() === '0,0,,', 'partial move');
// a box opens when it reaches the aisle end
st = { k: 2, shelves: [shelf([1, 0, null, null], [true, false, false, false]), shelf([null, null, null, null])], hold: [null, null], home: [], moves: 0 };
ev = move(st, { shelf: 0 }, { shelf: 1 });
check(ev && ev.some((e) => e.type === 'reveal') && !st.shelves[0].hidden[0], 'reveal');
// a cat can only go next to the same outfit (or onto an empty shelf); baskets take anything
st = { k: 3, shelves: [shelf([0, 1, null, null]), shelf([2, null, null, null]), shelf([null, null, null, null])], hold: [null, null], home: [], moves: 0 };
check(move(st, { shelf: 0 }, { shelf: 1 }) === null, 'blocked by different outfit');
check(move(st, { shelf: 0 }, { shelf: 2 }) !== null, 'empty shelf allowed');
check(move(st, { shelf: 1 }, { hold: 0 }) !== null, 'basket takes any cat');
check(move(st, { hold: 0 }, { shelf: 0 }) === null, 'basket cat still needs a match');
// boards with a gap between cats (old saves) are rejected; packed boards are accepted
check(!isValidBoard({ shelves: [shelf([0, null, 1, 1])], hold: [null, null] }), 'gap board rejected');
check(isValidBoard({ shelves: [shelf([0, 1, 1, null])], hold: [null, null] }), 'packed board accepted');
// winning
st = { k: 1, shelves: [shelf([0, 0, 0, null]), shelf([0, null, null, null])], hold: [null, null], home: [], moves: 0 };
move(st, { shelf: 1 }, { shelf: 0 });
check(isWon(st), 'win');

console.log('worst build ms', worst.toFixed(0));
console.log(fail ? `${fail} FAILURES` : 'ALL PASS');
