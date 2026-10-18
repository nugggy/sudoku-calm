// Checks Pressure Point levels on a virtual clock: every level must be winnable by some way of playing,
// and pressing the wrong number of times must not win. Run with: node tools/test-press.mjs
import { FIXED, makeLevel, levelTime, resetLevels } from '../www/js/press-levels.js';

// endless levels are random, so every strategy gets the same seed and therefore the same level
let seed = 1;
Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('FAIL', msg); } };
const STEP = 0.02;

// Plays one level with a strategy: {press: k} | {wait} | {onGo} | {holdGo} | {holdEnd} | {hold: secs} | {frac: f} | {bg: k}
function play(i, mem, strat) {
  const spec = makeLevel(i);
  const queue = []; let now = 0, art = '', text = '';
  const a = {
    n: 0, bgN: 0, t: 0, frac: 0, held: 0, holding: false, flag: {}, mem, level: i + 1,
    go() { a.flag.go = true; }, setText: (t) => { text = t; }, setFace() {}, setArt: (h) => { art = h; },
    after: (ms, fn) => queue.push({ at: now + ms / 1000, fn }),
    every: (ms, fn) => { const tick = { at: now + ms / 1000, ms, fn, every: true }; queue.push(tick); },
  };
  a.need = typeof spec.need === 'function' ? spec.need(a) : spec.need;
  text = typeof spec.text === 'function' ? spec.text(a) : spec.text;
  a.time = levelTime(spec, text, a.need, i);
  if (spec.init) spec.init(a);
  let pressesLeft = strat.press ?? 0, bgLeft = strat.bg ?? 0, nextPress = 0.3, downAt = 0;
  const down = () => { a.n++; a.holding = true; downAt = now; return spec.tap(a); };
  const up = () => { a.holding = false; a.held = now - downAt; return spec.up ? spec.up(a) : undefined; };
  for (now = 0; now <= a.time + 1e-9; now += STEP) {
    a.t = now; a.frac = Math.min(1, now / a.time);
    for (const q of queue.filter((x) => x.at <= now)) {
      if (q.every) { if (q.fn() === false) queue.splice(queue.indexOf(q), 1); else q.at += q.ms / 1000; }
      else { queue.splice(queue.indexOf(q), 1); q.fn(); }
    }
    if (a.holding) a.held = now - downAt;
    let r;
    if (strat.press && pressesLeft && now >= nextPress) { pressesLeft--; nextPress = now + 0.12; r = down() ?? up(); }
    else if (strat.bg && bgLeft && now >= nextPress) { bgLeft--; nextPress = now + 0.2; a.bgN++; r = spec.bg ? spec.bg(a) : undefined; }
    else if (strat.onGo && a.flag.go) { r = down() ?? up(); }
    else if (strat.frac && a.frac >= strat.frac + 0.03 && !a.n) { r = down() ?? up(); }
    else if ((strat.holdGo || strat.holdEnd || strat.hold) && !a.n && now >= 0.3) r = down();
    else if (strat.holdGo && a.holding && a.flag.go) r = up();
    else if (strat.hold && a.holding && now - downAt >= strat.hold) r = up();
    if (r) return { r, text, art, n: a.n };
    if (a.frac >= 1) return { r: spec.end(a), text, art };
  }
  return { r: spec.end(a), text, art };
}

const STRATS = [{ wait: 1 }, ...[...Array(16)].map((_, k) => ({ press: k + 1 })), { onGo: 1 }, { holdGo: 1 }, { holdEnd: 1 }, { hold: 2 },
  { frac: 0.5 }, { frac: 0.75 }, { bg: 1 }, { bg: 2 }, { bg: 3 }];
const name = (s) => Object.entries(s).map(([k, v]) => `${k}${v === 1 && k !== 'press' && k !== 'bg' ? '' : ' ' + v}`).join();

for (let round = 0; round < 25; round++) {
  let mem = {};
  for (let i = 0; i < FIXED + 120; i++) {
    if (i % 10 === 0) mem = {};
    const wins = [];
    for (const s of STRATS) {
      // memory is shared through the block, so replay from a copy and keep the one from the first strategy
      const m = JSON.parse(JSON.stringify(mem));
      let res;
      seed = 1 + round * 100003 + i * 7919; resetLevels();
      try { res = play(i, m, s); } catch (e) { check(false, `level ${i + 1} threw with ${name(s)}: ${e.message}`); continue; }
      if (res.r === 'win') wins.push(s.press ? `press ${res.n}` : name(s));
      if (s.wait) Object.assign(mem, m);
    }
    check(wins.length > 0, `level ${i + 1} cannot be won`);
    const pressWins = [...new Set(wins.filter((w) => w.startsWith('press ')))];
    check(pressWins.length <= 1, `level ${i + 1} is won by several press counts: ${pressWins.join(' / ')}`);
    if (round === 0 && i < FIXED) console.log(String(i + 1).padStart(3), [...new Set(wins)].join(' | '));
  }
}
console.log(fail ? `${fail} problems` : 'All Pressure Point levels OK');
process.exit(fail ? 1 : 0);
