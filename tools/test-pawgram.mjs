import { solveLine, puzzleClues, solve, findHint } from '../www/js/pawgram-engine.js';
let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('FAIL', msg); } };
const L = (s) => [...s].map((c) => (c === '?' ? -1 : c === '#' ? 1 : 0));
const S = (a) => a.map((v) => (v === -1 ? '?' : v === 1 ? '#' : '.')).join('');
check(S(solveLine(L('??????????'), [8])) === '??######??', 'overlap 8 in 10');
check(S(solveLine(L('?????'), [5])) === '#####', 'full line');
check(S(solveLine(L('?????'), [0])) === '.....', 'empty line');
check(S(solveLine(L('?????'), [1, 1, 1])) === '#.#.#', '1 1 1 in 5');
check(S(solveLine(L('#????'), [2])) === '##...', 'anchored start');
check(solveLine(L('##.##'), [3]) === null, 'contradiction');
check(S(solveLine(L('??.??'), [2])) === '??.??', 'two places');
// brute force cross-check on random lines
for (let t = 0; t < 3000; t++) {
  const n = 1 + Math.floor(Math.random() * 9);
  const truth = [...Array(n)].map(() => (Math.random() < 0.5 ? 1 : 0));
  const clue = (() => { const o = []; let r = 0; for (const v of truth) { if (v) r++; else if (r) { o.push(r); r = 0; } } if (r) o.push(r); return o.length ? o : [0]; })();
  const line = truth.map((v) => (Math.random() < 0.4 ? v : -1));
  const got = solveLine(line, clue);
  // brute force: all 2^n lines matching clue and known cells
  const fill = new Array(n).fill(false), emp = new Array(n).fill(false);
  for (let m = 0; m < 1 << n; m++) {
    const cand = [...Array(n)].map((_, i) => (m >> i) & 1);
    if (cand.some((v, i) => line[i] !== -1 && line[i] !== v)) continue;
    const cc = (() => { const o = []; let r = 0; for (const v of cand) { if (v) r++; else if (r) { o.push(r); r = 0; } } if (r) o.push(r); return o.length ? o : [0]; })();
    if (cc.join() !== clue.join()) continue;
    cand.forEach((v, i) => { if (v) fill[i] = true; else emp[i] = true; });
  }
  const want = line.map((v, i) => (fill[i] && !emp[i] ? 1 : !fill[i] && emp[i] ? 0 : v === -1 ? -1 : v));
  if (!got || S(got) !== S(want)) { fail++; if (fail < 5) console.log('FAIL random', S(line), clue, got && S(got), S(want)); }
}
// whole puzzle
const heart = '0110110' + '1111111' + '1111111' + '0111110' + '0011100' + '0001000' + '0000000';
const cl = puzzleClues(7, heart);
const r = solve(7, cl);
check(r.solved && r.grid.join('') === heart, 'heart solves');
check(findHint(7, cl, new Array(49).fill(-1)) !== null, 'hint on empty board');
console.log(fail ? `${fail} FAILURES` : 'ALL PASS');
