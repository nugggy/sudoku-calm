// Checks every Sweet Drop level: the solver must find a way to feed the frog, and a way to collect all
// three stars on the way. Run with: node tools/test-rope.mjs
import { LEVELS } from '../www/js/rope-levels.js';
import { solve, replay, W, H } from '../www/js/rope-engine.js';

let fail = 0;
const t0 = Date.now();
LEVELS.forEach((L, i) => {
  const inside = [L.candy, L.frog, ...L.stars].every(([x, y]) => x >= 0 && x <= W && y >= 0 && y <= H);
  const taut = L.ropes.every(([ax, ay, len]) => Math.hypot(ax - L.candy[0], ay - L.candy[1]) <= len + 1e-6);
  const sol = solve(L);
  const ok = sol && replay(L, sol.plan).state === 'won';
  const msg = `level ${String(i + 1).padStart(2)}: ${ok ? `won, ${sol.stars} stars` : 'NOT WINNABLE'}${inside ? '' : ', off the board'}${taut ? '' : ', rope too short'}`;
  if (!ok || sol.stars < 3 || !inside || !taut) { fail++; console.log('FAIL', msg); } else console.log(msg);
});
console.log(`${LEVELS.length} levels checked in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${fail} failed`);
if (fail) process.exit(1);
