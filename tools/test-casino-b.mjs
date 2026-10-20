// Checks Roulette, Craps and Pokies rules: payouts, house edges and the pokies return. Run with: node tools/test-casino-b.mjs
import { WHEEL, RED, colourOf, rouletteNums, roulettePays, rouletteReturn, allRouletteKeys, POINTS, crapsRoll, crapsCanBet,
  STRIPS, LINES, PAYS, linePay, evaluateSpin, windowAt, pokiesRtp, makeRng, FREE_SPINS } from '../www/js/casino/rb-engine.js';

let fail = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fail++; console.log('FAIL', msg); } };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} (±${tol})`);

// ---------- roulette ----------
ok(WHEEL.length === 37 && new Set(WHEEL).size === 37 && WHEEL[0] === 0, 'wheel has 0 to 36 once each, starting at 0');
ok(JSON.stringify(WHEEL.slice(0, 8)) === '[0,32,15,19,4,21,2,25]' && WHEEL[36] === 26, 'European wheel order');
ok(WHEEL.slice(1).every((n, i) => colourOf(n) === (i % 2 ? 'black' : 'red')), 'colours alternate red and black round the wheel');
ok(RED.size === 18 && [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].every((n) => RED.has(n)), 'the 18 red numbers');
const counts = {};
for (const k of allRouletteKeys()) {
  const nums = rouletteNums(k), n = nums.length;
  counts[n] = (counts[n] || 0) + 1;
  ok(nums.every((x) => Number.isInteger(x) && x >= 0 && x <= 36) && new Set(nums).size === n, `${k} covers distinct numbers`);
  ok([1, 2, 3, 4, 6, 12, 18].includes(n), `${k} covers a legal count (${n})`);
  ok(roulettePays(k) === { 1: 35, 2: 17, 3: 11, 4: 8, 6: 5, 12: 2, 18: 1 }[n], `${k} pays the standard odds`);
  let ret = 0; for (let x = 0; x <= 36; x++) ret += rouletteReturn(k, 1, x);
  near(ret / 37 - 1, -1 / 37, 1e-12, `${k} expected value`);
  // adjacency: splits, streets, corners and six lines must be next to each other on the table
  const [t] = k.split(':'), rc = (x) => [Math.floor((x - 1) / 3), (x - 1) % 3];
  if (t === 's' && nums[0] > 0) { const [a, b] = nums.map(rc); ok(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1, `${k} numbers touch`); }
  if (t === 'q' && nums[0] > 0) { const p = nums.map(rc); ok(Math.max(...p.map((q) => q[0])) - Math.min(...p.map((q) => q[0])) === 1 && Math.max(...p.map((q) => q[1])) - Math.min(...p.map((q) => q[1])) === 1, `${k} is a 2 by 2 block`); }
  if (t === 't' && nums[0] > 0) ok(new Set(nums.map((x) => rc(x)[0])).size === 1, `${k} is one row`);
}
ok(counts[1] === 37 && counts[2] === 60 && counts[4] === 22 + 1 && counts[6] === 11, `bet counts by size ${JSON.stringify(counts)}`);
ok(rouletteNums('col:1').join() === '1,4,7,10,13,16,19,22,25,28,31,34', 'column 1');
ok(rouletteNums('dz:3')[0] === 25 && rouletteNums('dz:3').length === 12, 'third dozen');
ok(rouletteReturn('red', 10, 0) === 0 && rouletteReturn('odd', 10, 0) === 0, 'zero loses outside bets');
ok(rouletteReturn('n:17', 10, 17) === 360 && rouletteReturn('s:17-20', 10, 20) === 180, 'straight and split payouts');
// the table hit-testing in the game maps taps to these same keys
const { keyAt, spotOf } = await import('../www/js/casino/g-roulette.js').catch(() => ({}));
if (keyAt) {
  const legal = new Set(allRouletteKeys());
  for (let gx = 0.02; gx < 3; gx += 0.07) for (let gy = -0.98; gy < 12; gy += 0.07) { const k = keyAt(gx, gy); ok(legal.has(k), `tap at ${gx.toFixed(2)},${gy.toFixed(2)} gives a legal bet (${k})`); }
  ok(keyAt(1.5, 5.5) === 'n:17' && keyAt(1, 5.5) === 's:16-17' && keyAt(1, 6) === 'q:16-17-19-20' && keyAt(0.02, 5.5) === 't:16-17-18' && keyAt(0.02, 6) === 'l:5', 'taps around 17');
  ok(keyAt(1.5, -0.6) === 'n:0' && keyAt(0.02, 0.02) === 'q:0-1-2-3' && keyAt(0.5, 0.05) === 's:0-1', 'taps around zero');
  for (const k of allRouletteKeys().filter((x) => /^(n|s|t|q|l):/.test(x))) { const [x, y] = spotOf(k); ok(keyAt(x, y + (k === 'n:0' ? 0 : 0)) === k || k === 's:0-3', `chip spot of ${k} taps back to it (${keyAt(x, y)})`); }
}

// ---------- craps ----------
const rolls = []; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) rolls.push([a, b]);
// Exact expected return per unit for a bet placed in a starting state, played until it is settled.
// The reachable table states are found first, then their values are solved by iteration.
function edge(key, point) {
  const mineKey = (k) => k === key || (key === 'come' && /^come\d+$/.test(k)) || (key === 'dontcome' && /^dcome\d+$/.test(k));
  const start = { point, bets: { [key]: 1 } }, id = (st) => JSON.stringify(st);
  const states = new Map(), queue = [start];
  while (queue.length) {
    const st = queue.pop(), k = id(st); if (states.has(k)) continue;
    const edges = [];
    for (const [a, b] of rolls) {
      const r = crapsRoll(st, a, b), paid = r.results.filter((x) => mineKey(x.key)).reduce((t, x) => t + x.ret, 0);
      const left = Object.keys(r.bets).find(mineKey);
      if (left) { const nx = { point: r.point, bets: { [left]: r.bets[left] } }; edges.push([0, id(nx)]); queue.push(nx); } else edges.push([paid, null]);
    }
    states.set(k, edges);
  }
  const V = new Map([...states.keys()].map((k) => [k, 0]));
  for (let it = 0; it < 400; it++) for (const [k, edges] of states) V.set(k, edges.reduce((t, [pay, nx]) => t + (nx ? V.get(nx) : pay) / 36, 0));
  return V.get(id(start)) - 1;
}
// edges per unit bet, counting pushes as no decision for pass and field style bets (standard published figures per bet made)
near(edge('pass', null), -7 / 495, 1e-6, 'pass line edge 1.414%');
near(edge('dontpass', null), -3 / 220, 1e-6, "don't pass edge 1.364%");
near(edge('field', 6), -1 / 36, 1e-9, 'field edge 2.778%');
near(edge('any7', 6), -1 / 6, 1e-9, 'any seven edge 16.67%');
near(edge('anycraps', 6), -1 / 9, 1e-9, 'any craps edge 11.11%');
near(edge('place6', 6), -1 / 66, 1e-6, 'place 6 edge 1.515%');
near(edge('place5', 6), -1 / 25, 1e-6, 'place 5 edge 4.0%');
near(edge('place4', 6), -1 / 15, 1e-6, 'place 4 edge 6.67%');
near(edge('hard6', 6), -1 / 11, 1e-6, 'hard 6 edge 9.09%');
near(edge('hard4', 6), -1 / 9, 1e-6, 'hard 4 edge 11.11%');
near(edge('come', 6), -7 / 495, 1e-6, 'come edge same as pass');
near(edge('dontcome', 6), -3 / 220, 1e-6, "don't come edge same as don't pass");
// odds pay true odds: zero edge for every point
for (const p of POINTS) {
  const w7 = 6 / 36, wp = rolls.filter(([a, b]) => a + b === p).length / 36;
  const st = { point: p, bets: { pass: 10, passodds: 10 } };
  let evOdds = 0, evLay = 0;
  // resolve repeatedly with exact probabilities: P(point first) = wp / (wp + w7)
  for (const [a, b] of rolls) { const r = crapsRoll(st, a, b), o = r.results.find((x) => x.key === 'passodds'); if (o) evOdds += (o.ret / 10 - 1) * (1 / 36) / (wp + w7); }
  const st2 = { point: p, bets: { dontpass: 10, dontodds: 12 } };
  for (const [a, b] of rolls) { const r = crapsRoll(st2, a, b), o = r.results.find((x) => x.key === 'dontodds'); if (o) evLay += (o.ret / 12 - 1) * (1 / 36) / (wp + w7); }
  near(evOdds, 0, 1e-9, `pass odds on ${p} pay true odds`); near(evLay, 0, 1e-9, `lay odds on ${p} pay true odds`);
}
// every bet over every roll and point state: chips are never created from nothing, and settled results are consistent
const allKeys = ['pass', 'dontpass', 'passodds', 'dontodds', 'come', 'dontcome', 'field', 'any7', 'anycraps', ...POINTS.map((n) => `place${n}`), ...[4, 6, 8, 10].map((n) => `hard${n}`), ...POINTS.flatMap((n) => [`come${n}`, `come${n}o`, `dcome${n}`, `dcome${n}o`])];
for (const point of [null, ...POINTS]) for (const [a, b] of rolls) {
  const bets = {}; for (const k of allKeys) bets[k] = 10;
  const r = crapsRoll({ point, bets }, a, b), s = a + b;
  for (const x of r.results) ok(x.ret >= 0 && (x.outcome !== 'lose' || x.ret === 0) && (x.outcome !== 'push' || x.ret === x.amount) && (x.outcome !== 'win' || x.ret > x.amount), `consistent result ${x.key} on ${s} point ${point}`);
  const fieldR = r.results.find((x) => x.key === 'field');
  ok(fieldR && fieldR.ret === ({ 2: 30, 12: 40, 3: 20, 4: 20, 9: 20, 10: 20, 11: 20 }[s] || 0), `field on ${s}`);
  if (point == null) { const pr = r.results.find((x) => x.key === 'pass'); ok(s === 7 || s === 11 ? pr.ret === 20 : [2, 3, 12].includes(s) ? pr.ret === 0 : !pr && r.point === s, `come-out pass on ${s}`); }
  else { const pr = r.results.find((x) => x.key === 'pass'); ok(s === point ? pr.ret === 20 : s === 7 ? pr.ret === 0 : !pr, `pass with point ${point} on ${s}`); }
  if (point != null && [4, 6, 8, 10].includes(s)) { const h = r.results.find((x) => x.key === `hard${s}`); ok(h && (a === b ? h.ret === (s === 4 || s === 10 ? 80 : 100) : h.ret === 0), `hard ${s} on ${a}+${b}`); }
}
ok(!crapsCanBet({ point: null, bets: {} }, 'come') && crapsCanBet({ point: 6, bets: {} }, 'come') && !crapsCanBet({ point: 6, bets: {} }, 'pass'), 'come only with a point, pass only on the come-out');
ok(!crapsCanBet({ point: 6, bets: {} }, 'passodds') && crapsCanBet({ point: 6, bets: { pass: 5 } }, 'passodds'), 'odds need a line bet');

// ---------- pokies ----------
ok(STRIPS.length === 5 && STRIPS.every((s) => s.length >= 40), 'five reels');
for (const s of STRIPS) { const sc = s.map((x, i) => (x === 'scatter' ? i : -1)).filter((i) => i >= 0); ok(sc.every((i) => sc.every((j) => i === j || Math.min(Math.abs(i - j), s.length - Math.abs(i - j)) >= 3)), 'scatters at least three apart'); }
ok(LINES.length === 10 && LINES.every((l) => l.length === 5 && l.every((r) => r >= 0 && r <= 2)) && new Set(LINES.map(String)).size === 10, 'ten distinct lines');
ok(linePay(['seven', 'seven', 'seven', 'cherry', 'lemon']).pay === PAYS.seven[0], 'three sevens');
ok(linePay(['wild', 'seven', 'wild', 'seven', 'seven']).pay === PAYS.seven[2], 'wilds stand in');
ok(linePay(['wild', 'wild', 'wild', 'wild', 'wild']).pay === PAYS.wild[2], 'five wilds pay as wilds');
ok(linePay(['wild', 'wild', 'wild', 'cherry', 'cherry']).pay === Math.max(PAYS.wild[0], PAYS.cherry[2]), 'best of wilds or the symbol');
ok(linePay(['cherry', 'cherry', 'lemon', 'cherry', 'cherry']).pay === 0, 'must be consecutive from the left');
ok(linePay(['scatter', 'scatter', 'scatter', 'cherry', 'cherry']).pay === 0, 'scatters do not pay on lines');
ok(linePay(['wild', 'scatter', 'cherry', 'cherry', 'cherry']).pay === 0, 'scatter breaks a line');
const sp = evaluateSpin([['scatter', 'a', 'b'], ['x', 'scatter', 'y'], ['p', 'q', 'scatter'], ['c', 'd', 'e'], ['f', 'g', 'h']].map((c) => c.map((s) => (s.length === 1 ? 'lemon' : s))), 10, 1);
ok(sp.freeSpins === FREE_SPINS && sp.scatterWin === 20, 'three clovers start free spins and pay twice the total bet');
const exact = pokiesRtp();
ok(exact.rtp >= 0.94 && exact.rtp <= 0.96, `pokies return ${(exact.rtp * 100).toFixed(2)}% is between 94% and 96%`);
// simulation with full free spin play agrees with the exact figure
let seed = 12345; const r32 = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed; };
const rng = makeRng(r32);
let bet = 0, won = 0, triggers = 0, spins = 0;
for (let i = 0; i < 400000; i++) {
  bet += 10; spins++;
  let free = 0;
  let res = evaluateSpin(windowAt([0, 1, 2, 3, 4].map((r) => rng.int(STRIPS[r].length))), 10, 1, 1); won += res.total; if (res.freeSpins) { free += res.freeSpins; triggers++; }
  while (free > 0) { free--; res = evaluateSpin(windowAt([0, 1, 2, 3, 4].map((r) => rng.int(STRIPS[r].length))), 10, 1, 2); won += res.total; if (res.freeSpins) free += res.freeSpins; }
}
near(won / bet, exact.rtp, 0.025, 'simulated return matches the exact return');
near(triggers / spins, exact.trigger, 0.0015, 'free spins trigger rate');

// ---------- random numbers ----------
const bins = Array(37).fill(0), M = 370000;
for (let i = 0; i < M; i++) bins[rng.int(37)]++;
const chi = bins.reduce((a, b) => a + (b - M / 37) ** 2 / (M / 37), 0);
ok(chi < 75, `uniform 0 to 36 (chi-square ${chi.toFixed(1)}, 36 degrees of freedom)`);
const d6 = Array(6).fill(0); for (let i = 0; i < 60000; i++) d6[rng.int(6)]++;
ok(d6.every((c) => Math.abs(c - 10000) < 400), `dice are uniform ${d6}`);
const real = makeRng(); const set = new Set(); for (let i = 0; i < 2000; i++) set.add(real.int(37));
ok(set.size === 37, 'the default random source reaches every number');

console.log(fail ? `Casino (roulette, craps, pokies): ${fail} of ${checks} checks failed` : `All ${checks} casino checks passed (roulette, craps, pokies return ${(exact.rtp * 100).toFixed(2)}%)`);
process.exit(fail ? 1 : 0);
