// Dance Party: every routine fits its song and lands on whole beats, and the scoring tells good dancing from
// standing still or dancing off the beat, using made-up phone movement.
//   node tools/test-dance.mjs
import { existsSync, statSync } from 'node:fs';
import { MOVES, POOLS, GOLD } from '../www/js/dance/moves.js';
import { routine } from '../www/js/dance/choreo.js';
import { SONGS } from '../www/js/dance/songs.js';
import { makeSensor, judgeMotion, gradeOf, judgeTap, maxPoints, movePoints, MAX_SCORE, starsFor } from '../www/js/dance/score.js';

let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log('FAIL', msg); } };

// ---------- Moves ----------
for (const [id, m] of Object.entries(MOVES)) {
  for (let t = 0; t <= m.len; t += 0.05) {
    const p = m.pose(t);
    for (const k of ['la', 'ra', 'll', 'rl', 'lean', 'drop', 'x']) check(Number.isFinite(p[k]), `${id} pose ${k} at ${t}`);
  }
  check(['tap', 'hold', 'up', 'down', 'left', 'right'].includes(m.tap), `${id} tap gesture`);
  check(m.sig.hits.every((h) => h >= 0 && h < m.len), `${id} hits inside the move`);
}
for (const id of [...POOLS.flat(), ...GOLD]) check(MOVES[id], `pool move ${id} exists`);

// ---------- Routines ----------
for (const s of SONGS) {
  check(existsSync(`www/${s.src}`) && statSync(`www/${s.src}`).size > 100000, `${s.id} audio file`);
  check(s.bpm > 60 && s.beats > 100, `${s.id} beat data`);
  const r = routine(s), again = routine(s);
  check(JSON.stringify(r) === JSON.stringify(again), `${s.id} routine is the same every time`);
  let beat = r[0].beat;
  for (const m of r) { check(m.beat === beat, `${s.id} moves follow on at beat ${beat}`); beat += m.len; }
  check(beat <= s.beats, `${s.id} routine ends (${beat}) before the song (${s.beats})`);
  check(s.beats - beat <= 40, `${s.id} routine covers most of the song (${beat} of ${s.beats})`);
  const golds = r.filter((m) => m.gold).length, kinds = new Set(r.map((m) => m.id)).size;
  check(golds >= 3, `${s.id} has gold moves (${golds})`);
  console.log(`${s.title.padEnd(18)} level ${s.level}  ${r.length} moves, ${kinds} kinds, ${golds} gold, beats ${r[0].beat} to ${beat} of ${s.beats}`);
}
const level = (id) => new Set(routine(SONGS.find((s) => s.id === id)).map((m) => m.id)).size;
check(level('done') > level('kitsune'), 'harder songs use more kinds of move');

// ---------- Motion scoring ----------
const BEAT = 0.5, RATE = 60;
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
// Simulated phone movement for a move: peaks on the hits (or steady movement), split between up-down and sideways.
function simulate(sig, { scale = 1, shift = 0, still = false, vert = sig.vert } = {}) {
  const sens = makeSensor(), len = 2, A = { low: 0.2, mid: 6, high: 12 }[sig.energy] * scale;
  const v = vert == null ? 0.5 : vert;
  for (let i = -30; i < len * BEAT * RATE + 10; i++) {
    const t = i / RATE, u = t / BEAT;
    let mag;
    if (still) mag = 0.15 * (rand() - 0.5);
    else if (sig.hits.length) mag = sig.hits.reduce((n, h) => n + Math.exp(-(((u - h - shift) / 0.12) ** 2)), 0) * A * 1.6 + (rand() - 0.5) * A * 0.15;
    else mag = Math.sin(u * Math.PI * 4) * A * 1.3;
    const up = mag * Math.sqrt(v), side = mag * Math.sqrt(1 - v);
    sens.feed(t, { x: side, y: up, z: 0 }, { x: side, y: 9.81 + up, z: 0 }, sig.spin && !still ? { alpha: 150, beta: 40, gamma: 20 } : { alpha: 2, beta: 1, gamma: 1 });
  }
  return judgeMotion(sig, sens.between(0, len * BEAT), 0, BEAT);
}
for (const [id, m] of Object.entries(MOVES)) {
  const good = simulate(m.sig), still = simulate(m.sig, { still: true });
  console.log(`${id.padEnd(7)} danced ${good.toFixed(2)} (${gradeOf(good).name})  still ${still.toFixed(2)} (${gradeOf(still).name})`);
  if (m.sig.energy === 'low') { check(good >= 0.8, `${id}: holding still is Perfect`); check(simulate({ ...m.sig, energy: 'high' }, {}) >= 0 && simulateWild(m) < 0.45, `${id}: waving about is not Good`); continue; }
  check(good >= 0.62, `${id}: dancing it well scores Super or better (${good.toFixed(2)})`);
  check(still < 0.28, `${id}: standing still is a miss (${still.toFixed(2)})`);
  check(simulate(m.sig, { scale: 0.45 }) < good, `${id}: half-hearted scores less`);
  if (m.sig.hits.length && m.sig.hits.length <= 2) check(simulate(m.sig, { shift: 0.5 }) < good - 0.1, `${id}: off the beat scores less`);
  if (m.sig.vert != null && m.sig.vert >= 0.7) check(simulate(m.sig, { vert: 0.05 }) < good, `${id}: sideways instead of up and down scores less`);
}
function simulateWild(m) { const s = makeSensor(); for (let i = 0; i < 70; i++) { const a = Math.sin(i) * 12; s.feed(i / RATE, { x: a, y: a, z: 0 }, { x: a, y: 9.81 + a, z: 0 }, null); } return judgeMotion(m.sig, s.samples, 0, BEAT); }

// a phone with no linear acceleration reading (only acceleration including gravity) still works
{
  const sens = makeSensor();
  for (let i = -60; i < 60; i++) { const u = i / RATE / BEAT; const up = 12 * 1.6 * [0, 1].reduce((n, h) => n + Math.exp(-(((u - h) / 0.12) ** 2)), 0); sens.feed(i / RATE, null, { x: 0, y: 9.81 + up, z: 0 }, null); }
  const q = judgeMotion(MOVES.punch.sig, sens.between(0, 1), 0, BEAT);
  check(q >= 0.45, `punch from gravity-only readings is Good or better (${q.toFixed(2)})`);
}

// ---------- Tap along and points ----------
check(gradeOf(judgeTap(0.02, true)).id === 'perfect', 'tap on the beat is Perfect');
check(gradeOf(judgeTap(0.2, true)).id === 'ok', 'tap 200 ms late is OK');
check(gradeOf(judgeTap(0.02, false)).id === 'ok', 'wrong gesture on the beat is only OK');
check(gradeOf(judgeTap(0.4, true)).id === 'x', 'tap far off is a miss');
for (const s of SONGS) {
  const r = routine(s), best = r.reduce((n, m) => n + movePoints(gradeOf(1), m.gold), 0);
  check(best === maxPoints(r), `${s.id}: all Perfect is the maximum`);
  check(starsFor(MAX_SCORE) === 5, 'a full score has five stars');
}

console.log(fails ? `${fails} failed` : 'All Dance Party checks passed');
process.exit(fails ? 1 : 0);
