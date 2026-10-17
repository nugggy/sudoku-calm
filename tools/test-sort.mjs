import { newLevel, recipe, move, isWon, solvable, clone, totalCats } from '../www/js/sort-engine.js';
import { mulberry32 } from '../www/js/sudoku-engine.js';
let fail = 0, worst = 0;
for (let L = 0; L < 120; L++) {
  const t0 = performance.now();
  let st;
  try { st = newLevel(L); } catch (e) { fail++; console.log('FAIL build', L, e.message); continue; }
  const ms = performance.now() - t0; worst = Math.max(worst, ms);
  const cats = st.shelves.reduce((a, s) => a + s.slots.filter((c) => c !== null).length + s.layers.flat().length, 0);
  if (cats !== totalCats(st)) { fail++; console.log('FAIL count', L); }
  if (L % 15 === 0) { const r = recipe(L); console.log(`L${L + 1}: k=${r.k} shelves=${r.shelves} spare=${r.spare} layers=${st.shelves.reduce((a, s) => a + s.layers.length, 0)} boxes=${st.shelves.reduce((a, s) => a + s.hidden.filter(Boolean).length, 0)} ${ms.toFixed(0)}ms`); }
}
// deterministic
if (JSON.stringify(newLevel(20)) !== JSON.stringify(newLevel(20))) { fail++; console.log('FAIL determinism'); }
// a shelf completes and goes home
const st = { level: 0, k: 1, shelves: [{ slots: [0, 0, 0, null], hidden: [false, false, false, false], layers: [] }, { slots: [0, null, null, null], hidden: [false, false, false, false], layers: [] }], hold: [null, null], home: [], moves: 0 };
const ev = move(st, { shelf: 1, slot: 0 }, { shelf: 0 });
if (!ev.some((e) => e.type === 'home') || !isWon(st)) { fail++; console.log('FAIL home'); }
console.log('worst build ms', worst.toFixed(0));
console.log(fail ? `${fail} FAILURES` : 'ALL PASS');
