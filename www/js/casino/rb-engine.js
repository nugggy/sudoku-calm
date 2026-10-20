// Casino Night rules for Roulette, Craps and Pokies. No browser code, so tools/test-casino-b.mjs can check
// every payout and the house edge exactly. Play chips only.

// ---------- random numbers ----------
// Uniform integer in [0, n) without modulo bias. `rand32` returns a uniform unsigned 32-bit integer.
export function makeRng(rand32) {
  const r32 = rand32 || (() => {
    if (globalThis.crypto && globalThis.crypto.getRandomValues) { const a = new Uint32Array(1); globalThis.crypto.getRandomValues(a); return a[0]; }
    return Math.floor(Math.random() * 4294967296);
  });
  const int = (n) => {
    const lim = 4294967296 - (4294967296 % n);
    let x; do { x = r32(); } while (x >= lim);
    return x % n;
  };
  return { int, float: () => r32() / 4294967296 };
}

// ---------- roulette ----------
// Single-zero (European) wheel, numbers in the order they sit on the wheel, clockwise from zero.
export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const colourOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
// The table: 12 rows of three, row r holds r*3+1 .. r*3+3 (columns 1, 2 and 3).
const at = (r, c) => r * 3 + c + 1;

// Bet keys: n:17 straight, s:a-b split, t:a-b-c street or trio, q:a-b-c-d corner or first four, l:r six line (rows r and r+1),
// dz:1-3 dozens, col:1-3 columns, red, black, odd, even, low (1-18), high (19-36).
export function rouletteNums(key) {
  const [k, v] = key.split(':');
  const list = () => v.split('-').map(Number);
  switch (k) {
    case 'n': case 's': case 't': case 'q': return list();
    case 'l': { const r = +v; return [0, 1, 2].flatMap((c) => [at(r, c), at(r + 1, c)]).sort((a, b) => a - b); }
    case 'dz': return [...Array(12)].map((_, i) => (+v - 1) * 12 + i + 1);
    case 'col': return [...Array(12)].map((_, r) => at(r, +v - 1));
    case 'red': return [...RED].sort((a, b) => a - b);
    case 'black': return [...Array(36)].map((_, i) => i + 1).filter((n) => !RED.has(n));
    case 'odd': return [...Array(18)].map((_, i) => i * 2 + 1);
    case 'even': return [...Array(18)].map((_, i) => i * 2 + 2);
    case 'low': return [...Array(18)].map((_, i) => i + 1);
    case 'high': return [...Array(18)].map((_, i) => i + 19);
  }
  return [];
}
// Payout odds ("35 to 1") for a bet covering n numbers: every bet returns 36 units per number covered.
export const roulettePays = (key) => 36 / rouletteNums(key).length - 1;
// Chips returned (stake plus winnings) for a bet when `n` comes up.
export const rouletteReturn = (key, amount, n) => (rouletteNums(key).includes(n) ? amount * (1 + roulettePays(key)) : 0);
export const BET_NAMES = { dz: ['1st 12', '2nd 12', '3rd 12'], col: ['Column 1', 'Column 2', 'Column 3'] };
export function rouletteLabel(key) {
  const [k, v] = key.split(':'), nums = rouletteNums(key);
  if (k === 'n') return `Straight ${v}`;
  if (k === 's') return `Split ${nums.join('/')}`;
  if (k === 't') return nums[0] === 0 ? `Trio ${nums.join('/')}` : `Street ${nums.join('/')}`;
  if (k === 'q') return nums[0] === 0 ? 'First four' : `Corner ${nums.join('/')}`;
  if (k === 'l') return `Six line ${nums[0]} to ${nums[5]}`;
  if (k === 'dz' || k === 'col') return BET_NAMES[k][+v - 1];
  return { red: 'Red', black: 'Black', odd: 'Odd', even: 'Even', low: '1 to 18', high: '19 to 36' }[key] || key;
}
// Every legal inside bet key, used by the tests and by hit-testing on the table.
export function allRouletteKeys() {
  const keys = [];
  for (let n = 0; n <= 36; n++) keys.push(`n:${n}`);
  for (let r = 0; r < 12; r++) for (let c = 0; c < 3; c++) {
    if (c < 2) keys.push(`s:${at(r, c)}-${at(r, c + 1)}`);
    if (r < 11) keys.push(`s:${at(r, c)}-${at(r + 1, c)}`);
    if (c < 2 && r < 11) keys.push(`q:${at(r, c)}-${at(r, c + 1)}-${at(r + 1, c)}-${at(r + 1, c + 1)}`);
  }
  for (let c = 0; c < 3; c++) keys.push(`s:0-${c + 1}`);
  keys.push('t:0-1-2', 't:0-2-3', 'q:0-1-2-3');
  for (let r = 0; r < 12; r++) keys.push(`t:${at(r, 0)}-${at(r, 1)}-${at(r, 2)}`);
  for (let r = 0; r < 11; r++) keys.push(`l:${r}`);
  keys.push('dz:1', 'dz:2', 'dz:3', 'col:1', 'col:2', 'col:3', 'red', 'black', 'odd', 'even', 'low', 'high');
  return keys;
}

// ---------- craps ----------
export const POINTS = [4, 5, 6, 8, 9, 10];
// [win, stake] ratios.
const TRUE_ODDS = { 4: [2, 1], 10: [2, 1], 5: [3, 2], 9: [3, 2], 6: [6, 5], 8: [6, 5] };   // taking odds on pass and come
const LAY_ODDS = { 4: [1, 2], 10: [1, 2], 5: [2, 3], 9: [2, 3], 6: [5, 6], 8: [5, 6] };   // laying odds on don't pass and don't come
const PLACE = { 4: [9, 5], 10: [9, 5], 5: [7, 5], 9: [7, 5], 6: [7, 6], 8: [7, 6] };
const win = (amt, [w, s]) => amt + (amt * w) / s; // stake back plus winnings
export const MAX_ODDS = { 4: 3, 10: 3, 5: 4, 9: 4, 6: 5, 8: 5 }; // 3-4-5 times the line bet
export const CRAPS_BETS = {
  pass: { name: 'Pass line', help: 'Wins on 7 or 11 on the come-out roll and loses on 2, 3 or 12. Any other number becomes the point: then it wins if the point rolls again before a 7. Pays even money.' },
  dontpass: { name: "Don't pass", help: 'The opposite of the pass line. Wins on 2 or 3 on the come-out, ties on 12, loses on 7 or 11. After a point is set it wins if a 7 rolls before the point. Pays even money.' },
  come: { name: 'Come', help: 'Like a pass line bet made after the point is set. The next roll is its own come-out: 7 or 11 wins, 2, 3 or 12 loses, and any other number moves the bet onto that number, which must roll again before a 7.' },
  dontcome: { name: "Don't come", help: "Like don't pass, made after the point is set. 2 or 3 wins, 12 ties, 7 or 11 loses, and any other number moves the bet onto that number: then a 7 before that number wins." },
  odds: { name: 'Odds', help: 'Extra chips behind a pass, come, don\'t pass or don\'t come bet once it has a number. Pays true odds, so the casino has no edge on it: 2 to 1 on 4 and 10, 3 to 2 on 5 and 9, 6 to 5 on 6 and 8 (laying odds pays the reverse). Up to 3, 4 or 5 times your line bet.' },
  place: { name: 'Place', help: 'Bet that a number rolls before a 7. Pays 9 to 5 on 4 and 10, 7 to 5 on 5 and 9, 7 to 6 on 6 and 8. Place bets are off (they sit out) on the come-out roll.' },
  field: { name: 'Field', help: 'A one-roll bet. Wins on 2, 3, 4, 9, 10, 11 or 12 and loses on 5, 6, 7 or 8. Pays even money, 2 to 1 on a 2 and 3 to 1 on a 12.' },
  any7: { name: 'Any seven', help: 'A one-roll bet that the next roll is a 7. Pays 4 to 1.' },
  anycraps: { name: 'Any craps', help: 'A one-roll bet that the next roll is 2, 3 or 12. Pays 7 to 1.' },
  hard: { name: 'Hardways', help: 'Bet that a number rolls as a pair (2 and 2 for hard 4) before it rolls any other way or a 7 rolls. Hard 4 and hard 10 pay 7 to 1, hard 6 and hard 8 pay 9 to 1. Off on the come-out roll.' },
};
// Bet keys: pass, dontpass, passodds, dontodds, come (waiting), dontcome (waiting), come4 / come4o, dcome4 / dcome4o,
// place4, field, any7, anycraps, hard4 / hard6 / hard8 / hard10.
// Rolls the dice for a table state {point, bets}. Returns {point, bets, results: [{key, amount, ret, outcome}]} where `ret`
// is the chips paid back (0 for a loss, the stake for a push, stake plus winnings for a win).
export function crapsRoll(state, d1, d2) {
  const sum = d1 + d2, hard = d1 === d2, on = state.point != null;
  const bets = { ...state.bets }, results = [];
  const settle = (key, ret, outcome) => { const amount = bets[key]; if (!amount) return; results.push({ key, amount, ret, outcome }); delete bets[key]; };
  const W = (key, odds) => settle(key, odds ? win(bets[key], odds) : bets[key] * 2, 'win');
  const L = (key) => settle(key, 0, 'lose');
  const P = (key) => settle(key, bets[key], 'push');
  // one-roll bets
  if (bets.field) { if ([3, 4, 9, 10, 11].includes(sum)) W('field'); else if (sum === 2) W('field', [2, 1]); else if (sum === 12) W('field', [3, 1]); else L('field'); }
  if (bets.any7) { if (sum === 7) W('any7', [4, 1]); else L('any7'); }
  if (bets.anycraps) { if ([2, 3, 12].includes(sum)) W('anycraps', [7, 1]); else L('anycraps'); }
  // hardways and place bets work only while a point is on
  if (on) {
    for (const n of [4, 6, 8, 10]) {
      const k = `hard${n}`; if (!bets[k]) continue;
      if (sum === n && hard) W(k, n === 4 || n === 10 ? [7, 1] : [9, 1]); else if (sum === 7 || sum === n) L(k);
    }
    for (const n of POINTS) { const k = `place${n}`; if (!bets[k]) continue; if (sum === n) W(k, PLACE[n]); else if (sum === 7) L(k); }
  }
  // come and don't come numbers already set
  for (const n of POINTS) {
    const c = `come${n}`, co = `come${n}o`, d = `dcome${n}`, dO = `dcome${n}o`;
    if (bets[c]) {
      if (sum === n) { W(c); if (bets[co]) (on ? W(co, TRUE_ODDS[n]) : P(co)); } // odds on come bets are off on the come-out roll
      else if (sum === 7) { L(c); if (bets[co]) (on ? L(co) : P(co)); }
    } else if (bets[co]) P(co);
    if (bets[d]) {
      if (sum === 7) { W(d); if (bets[dO]) W(dO, LAY_ODDS[n]); }
      else if (sum === n) { L(d); if (bets[dO]) L(dO); }
    } else if (bets[dO]) P(dO);
  }
  // waiting come and don't come bets (only placed while a point is on)
  if (bets.come) {
    if (sum === 7 || sum === 11) W('come'); else if ([2, 3, 12].includes(sum)) L('come');
    else { bets[`come${sum}`] = (bets[`come${sum}`] || 0) + bets.come; delete bets.come; }
  }
  if (bets.dontcome) {
    if (sum === 2 || sum === 3) W('dontcome'); else if (sum === 12) P('dontcome'); else if (sum === 7 || sum === 11) L('dontcome');
    else { bets[`dcome${sum}`] = (bets[`dcome${sum}`] || 0) + bets.dontcome; delete bets.dontcome; }
  }
  // the line
  let point = state.point;
  if (!on) {
    if (sum === 7 || sum === 11) { W('pass'); L('dontpass'); }
    else if (sum === 2 || sum === 3) { L('pass'); W('dontpass'); }
    else if (sum === 12) { L('pass'); P('dontpass'); }
    else point = sum;
  } else if (sum === point) {
    W('pass'); if (bets.passodds) W('passodds', TRUE_ODDS[point]);
    L('dontpass'); if (bets.dontodds) L('dontodds');
    point = null;
  } else if (sum === 7) {
    L('pass'); if (bets.passodds) L('passodds');
    W('dontpass'); if (bets.dontodds) W('dontodds', LAY_ODDS[state.point]);
    point = null;
  }
  return { point, bets, results, sum, hard };
}
// Which bets may be added in this state, and the most odds allowed behind a line bet.
export function crapsCanBet(state, key) {
  const on = state.point != null, b = state.bets;
  if (key === 'come' || key === 'dontcome' || /^hard|^place/.test(key)) return on;
  if (key === 'pass' || key === 'dontpass') return !on;
  if (key === 'passodds') return on && !!b.pass;
  if (key === 'dontodds') return on && !!b.dontpass;
  if (/^come\d+o$/.test(key)) return !!b[key.slice(0, -1)];
  if (/^dcome\d+o$/.test(key)) return !!b[key.slice(0, -1)];
  return ['field', 'any7', 'anycraps'].includes(key);
}
export function crapsOddsLimit(state, key) {
  const b = state.bets;
  if (key === 'passodds') return (b.pass || 0) * MAX_ODDS[state.point];
  if (key === 'dontodds') return (b.dontpass || 0) * 6;
  const m = key.match(/^(d?)come(\d+)o$/); if (!m) return Infinity;
  const base = b[`${m[1] ? 'dcome' : 'come'}${m[2]}`] || 0;
  return m[1] ? base * 6 : base * MAX_ODDS[+m[2]];
}

// ---------- pokies ----------
// 5 reels by 3 rows, up to 10 lines. Wild (rainbow 7) stands in for anything but the scatter.
// Three or more clovers anywhere start 10 free spins at double pay (free spins can start again).
export const SYMBOLS = {
  cherry: { name: 'Cherries', img: 'pokies_cherry' }, lemon: { name: 'Lemon', img: 'pokies_lemon' }, melon: { name: 'Melon', img: 'pokies_melon' },
  bell: { name: 'Bell', img: 'pokies_bell' }, heart: { name: 'Heart', img: 'pokies_heart' }, shoe: { name: 'Horseshoe', img: 'pokies_horseshoe' },
  bar: { name: 'Bar', img: 'pokies_bar1' }, bar2: { name: 'Double bar', img: 'pokies_bar2' }, bar3: { name: 'Triple bar', img: 'pokies_bar3' },
  seven: { name: 'Seven', img: 'pokies_seven' }, wild: { name: 'Wild', img: 'pokies_seven_rainbow' }, scatter: { name: 'Lucky clover', img: 'pokies_clover' },
};
// Line pays, times the bet per line, for 3, 4 and 5 in a row from the left.
export const PAYS = {
  cherry: [10, 25, 75], lemon: [12, 30, 100], melon: [15, 40, 120], bell: [20, 50, 180], heart: [25, 60, 250], shoe: [30, 75, 300],
  bar: [40, 100, 400], bar2: [50, 150, 600], bar3: [75, 250, 1000], seven: [125, 500, 2500], wild: [250, 1250, 5000],
};
// Scatter pays, times the total bet, for 3, 4 and 5 clovers anywhere.
export const SCATTER_PAYS = [2, 10, 50];
export const FREE_SPINS = 10, FREE_MULT = 2;
export const LINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1],
];
// Reel strips (symbol counts per reel), shuffled into a fixed order so scatters sit at least three apart.
// The return is worked out exactly by pokiesRtp() and checked by the tests; it comes out at about 95%.
const COUNTS = [
  { cherry: 8, lemon: 9, melon: 6, bell: 5, heart: 5, shoe: 4, bar: 4, bar2: 3, bar3: 2, seven: 2, wild: 1, scatter: 2 },
  { cherry: 8, lemon: 9, melon: 6, bell: 5, heart: 5, shoe: 4, bar: 4, bar2: 3, bar3: 2, seven: 2, wild: 2, scatter: 2 },
  { cherry: 8, lemon: 9, melon: 6, bell: 5, heart: 5, shoe: 4, bar: 4, bar2: 3, bar3: 2, seven: 2, wild: 2, scatter: 2 },
  { cherry: 8, lemon: 9, melon: 6, bell: 5, heart: 5, shoe: 4, bar: 4, bar2: 3, bar3: 2, seven: 2, wild: 2, scatter: 2 },
  { cherry: 8, lemon: 9, melon: 6, bell: 5, heart: 5, shoe: 4, bar: 4, bar2: 3, bar3: 2, seven: 2, wild: 1, scatter: 2 },
];
// Builds a strip with an even spread: symbols placed by a fixed stride so no symbol bunches up and scatters stay apart.
function buildStrip(counts, seed) {
  const syms = Object.entries(counts).flatMap(([s, k]) => Array(k).fill(s));
  let x = seed >>> 0; const rnd = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
  for (let tries = 0; tries < 5000; tries++) {
    const a = syms.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    const n = a.length, sc = a.map((s, i) => (s === 'scatter' ? i : -1)).filter((i) => i >= 0);
    const ok = sc.every((i, k) => sc.every((j, l) => l === k || Math.min(Math.abs(i - j), n - Math.abs(i - j)) >= 3));
    if (ok) return a;
  }
  throw new Error('could not build reel strip');
}
export function setStrips(counts) { STRIPS.length = 0; counts.forEach((c, i) => STRIPS.push(buildStrip(c, 977 + i * 131))); }
export const STRIPS = [];
setStrips(COUNTS);
// The 3 x 5 window for reel stops (the top row's index on each strip).
export const windowAt = (stops) => stops.map((s, r) => [0, 1, 2].map((k) => STRIPS[r][(s + k) % STRIPS[r].length]));
// Pay for one line of five symbols, times the line bet, and how many symbols count from the left.
export function linePay(syms) {
  // best of: a run of wilds paying as wilds, or a run of the first real symbol with wilds standing in
  let wildRun = 0; while (wildRun < 5 && syms[wildRun] === 'wild') wildRun++;
  const wildPay = wildRun >= 3 ? PAYS.wild[wildRun - 3] : 0;
  const target = syms.find((s) => s !== 'wild');
  let best = { pay: wildPay, count: wildRun, sym: 'wild' };
  if (target && target !== 'scatter') {
    let run = 0; while (run < 5 && (syms[run] === target || syms[run] === 'wild')) run++;
    const p = run >= 3 ? PAYS[target][run - 3] : 0;
    if (p > best.pay) best = { pay: p, count: run, sym: target };
  }
  return best.pay ? best : { pay: 0, count: 0, sym: null };
}
// Evaluates a spin: line wins (only the first `lines` lines are played) and scatters. Amounts are in chips.
export function evaluateSpin(win3x5, lines, betPerLine, mult = 1) {
  const wins = [];
  for (let i = 0; i < lines; i++) {
    const syms = LINES[i].map((row, r) => win3x5[r][row]);
    const lp = linePay(syms);
    if (lp.pay) wins.push({ line: i, count: lp.count, sym: lp.sym, amount: lp.pay * betPerLine * mult });
  }
  const scatters = []; win3x5.forEach((col, r) => col.forEach((s, k) => { if (s === 'scatter') scatters.push([r, k]); }));
  const total = lines * betPerLine;
  const scatterWin = scatters.length >= 3 ? SCATTER_PAYS[Math.min(5, scatters.length) - 3] * total * mult : 0;
  return { wins, scatters, scatterWin, freeSpins: scatters.length >= 3 ? FREE_SPINS : 0, total: wins.reduce((a, w) => a + w.amount, 0) + scatterWin };
}
// Exact return to player (as a fraction of the total bet), assuming all 10 lines; with fewer lines the line part is the same
// per line, so the return does not depend on the number of lines.
export function pokiesRtp() {
  const N = STRIPS.map((s) => s.length);
  const prob = STRIPS.map((s) => { const p = {}; s.forEach((x) => { p[x] = (p[x] || 0) + 1 / s.length; }); return p; });
  const names = Object.keys(SYMBOLS);
  // line return per line bet: every line sees each reel's symbol with the strip's frequency, independently
  let line = 0;
  const rec = (r, syms, pr) => {
    if (r === 5) { line += pr * linePay(syms).pay; return; }
    for (const s of names) { const q = prob[r][s] || 0; if (q) rec(r + 1, [...syms, s], pr * q); }
  };
  rec(0, [], 1);
  // scatters: chance a reel shows a clover in its three visible rows (they are at least three apart, so at most one)
  const ps = STRIPS.map((s, r) => s.filter((x) => x === 'scatter').length * 3 / N[r]);
  let dist = [1]; // distribution of scatter count
  for (const p of ps) { const nd = Array(dist.length + 1).fill(0); dist.forEach((v, k) => { nd[k] += v * (1 - p); nd[k + 1] += v * p; }); dist = nd; }
  const trigger = dist.slice(3).reduce((a, b) => a + b, 0);
  const scatter = SCATTER_PAYS.reduce((a, pay, i) => a + pay * dist[i + 3], 0);
  const base = line + scatter; // per unit of total bet (line part is per line bet = per unit when divided across lines)
  const freeSpinsExpected = FREE_SPINS / (1 - FREE_SPINS * trigger);
  const free = trigger * freeSpinsExpected * FREE_MULT * base;
  return { line, scatter, trigger, base, free, rtp: base + free };
}
