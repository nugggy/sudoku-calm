// Checks Pressure Point levels on a virtual clock: every level must be winnable by some way of playing,
// pressing the wrong number of times must not win, and tapping the wrong picture must not win.
// Run with: node tools/test-press.mjs
import { createRun, levelTime, FIXED } from '../www/js/press-levels.js';

// levels are random, so every strategy gets the same seed and therefore the same level
let seed = 1;
Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; if (fail < 40) console.log('FAIL', msg); } };
const STEP = 0.02;
const targetsIn = (html) => [...html.matchAll(/data-t="([^"]*)" data-k="(\d+)"/g)].map((m) => ({ t: m[1], k: +m[2] }));

// Plays one level with a strategy:
// {press: k} | {wait} | {onGo} | {holdGo} | {holdEnd} | {hold: secs} | {frac: f} | {bg: k} | {pressAfterGo: k}
// | {pick: t} (tap the first tile showing t) | {pickAll: t} (tap every tile showing t) | {pickSeq: 'asc' | 'desc'}
function play(run, i, mem, strat) {
  const spec = run.level(i);
  const queue = []; let now = 0, art = typeof spec.art === 'function' ? '' : spec.art || '', text = '';
  const a = {
    n: 0, bgN: 0, t: 0, frac: 0, held: 0, holding: false, flag: {}, mem, level: i + 1,
    go() { a.flag.go = true; }, setText: (t) => { text = t; }, setFace() {}, setArt: (h) => { art = h; }, moveBtn() {},
    after: (ms, fn) => queue.push({ at: now + ms / 1000, fn }),
    every: (ms, fn) => { queue.push({ at: now + ms / 1000, ms, fn, every: true }); },
  };
  a.need = typeof spec.need === 'function' ? spec.need(a) : spec.need;
  text = typeof spec.text === 'function' ? spec.text(a) : spec.text;
  a.time = levelTime(spec, text, a.need, i);
  if (spec.init) spec.init(a);
  let pressesLeft = strat.press ?? strat.pressAfterGo ?? 0, bgLeft = strat.bg ?? 0, next = 0.3, downAt = 0, picks = null;
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
    const tilesNow = targetsIn(art);
    if ((strat.pick !== undefined || strat.pickAll !== undefined || strat.pickSeq) && spec.pick && now >= 0.5 && !a.flag.wait && tilesNow.length) {
      if (!picks) {
        if (strat.pick !== undefined) picks = tilesNow.filter((x) => x.t === strat.pick).slice(0, 1);
        else if (strat.pickAll !== undefined) picks = tilesNow.filter((x) => x.t === strat.pickAll);
        else picks = [...tilesNow].sort((x, y) => (strat.pickSeq === 'asc' ? +x.t - +y.t : +y.t - +x.t));
      }
      if (picks.length && now >= next) { const p = picks.shift(); next = now + 0.25; r = spec.pick(a, p.t, p.k); }
    } else if (strat.press && pressesLeft && now >= next) { pressesLeft--; next = now + 0.12; r = down() ?? up(); }
    else if (strat.pressAfterGo && pressesLeft && a.flag.go && now >= next) { pressesLeft--; next = now + 0.12; r = down() ?? up(); }
    else if (strat.bg && bgLeft && now >= next) { bgLeft--; next = now + 0.2; a.bgN++; r = spec.bg ? spec.bg(a) : undefined; }
    else if (strat.onGo && a.flag.go) { r = down() ?? up(); }
    else if (strat.frac && a.frac >= strat.frac + 0.03 && !a.n) { r = down() ?? up(); }
    else if ((strat.holdGo || strat.holdEnd || strat.hold) && !a.n && now >= 0.3) r = down();
    else if (strat.holdGo && a.holding && a.flag.go) r = up();
    else if (strat.hold && a.holding && now - downAt >= strat.hold) r = up();
    if (r) return { r, kind: spec.kind, n: a.n, tiles: tilesNow };
  }
  return { r: spec.end(a), kind: spec.kind, tiles: targetsIn(art) };
}

const BASE = [{ wait: 1 }, ...[...Array(16)].map((_, k) => ({ press: k + 1 })), ...[...Array(6)].map((_, k) => ({ pressAfterGo: k + 1 })),
  { onGo: 1 }, { holdGo: 1 }, { holdEnd: 1 }, { hold: 2 }, { hold: 3 }, { frac: 0.5 }, { frac: 0.75 }, { bg: 1 }, { bg: 2 }, { bg: 3 },
  { pickSeq: 'asc' }, { pickSeq: 'desc' }];
const name = (s) => Object.entries(s).map(([k, v]) => `${k} ${v}`).join();

const kinds = new Map();
for (const cb of [false, true]) {
  for (let round = 0; round < (cb ? 6 : 30); round++) {
    let mem = {}, run = null;
    for (let i = 0; i < FIXED + 60; i++) {
      if (i % 10 === 0) { mem = {}; }
      const lvlSeed = 1 + round * 100003 + i * 7919 + (cb ? 77 : 0);
      // the block is planned when its first level is made; every strategy then sees the same plan and level
      if (i % 10 === 0) { seed = lvlSeed; run = createRun({ recent: [], cb }); }
      seed = lvlSeed;
      const probe = run.level(i);
      seed = lvlSeed;
      const first = play(run, i, JSON.parse(JSON.stringify(mem)), { wait: 1 });
      const tileValues = [...new Set(first.tiles.map((x) => x.t))];
      const strats = [...BASE, ...tileValues.flatMap((t) => [{ pick: t }, { pickAll: t }])];
      const wins = [];
      for (const s of strats) {
        const m = JSON.parse(JSON.stringify(mem));
        seed = lvlSeed;
        let res;
        try { res = play(run, i, m, s); } catch (e) { check(false, `level ${i + 1} (${probe.kind}) threw with ${name(s)}: ${e.message}`); continue; }
        if (res.r === 'win') wins.push(s.press ? `press ${res.n}` : name(s));
        if (s.wait) Object.assign(mem, m);
      }
      kinds.set(probe.kind, (kinds.get(probe.kind) || 0) + 1);
      check(cb ? probe.kind !== 'stroop' : true, `level ${i + 1}: colour-only task in colourblind mode`);
      check(wins.length > 0, `level ${i + 1} (${probe.kind}) cannot be won`);
      const pressWins = [...new Set(wins.filter((w) => w.startsWith('press ')))];
      check(pressWins.length <= 1, `level ${i + 1} (${probe.kind}) is won by several press counts: ${pressWins.join(' / ')}`);
      const pickWins = [...new Set(wins.filter((w) => w.startsWith('pick ')))];
      check(pickWins.length <= 1, `level ${i + 1} (${probe.kind}) is won by tapping different pictures: ${pickWins.join(' / ')}`);
      check(!(pickWins.length && pressWins.length), `level ${i + 1} (${probe.kind}) is won both by tapping a picture and by pressing`);
    }
  }
}
const ids = [...kinds.keys()];
console.log(`${ids.length} kinds of task seen: ${ids.sort().join(', ')}`);
console.log(fail ? `${fail} problems` : 'All Pressure Point levels OK');
process.exit(fail ? 1 : 0);
