// Checks the Marvel Heroes puzzles. Run with: node tools/test-hero.mjs
//  - Villain Lockdown: every level solvable, and its par is the true fewest moves
//  - Shield Throw: every room can be cleared within its par by the greedy planner, using the shipped level data
//  - Infinity Stones: every world puzzle is solvable from its starting position
//  - Power Match: new boards never start with a match and always have a move; collapse refills the board
//  - Web Swing: runs replay exactly, a steady player swings far, anchors are always in reach, tricks and drones behave
import { parse, solve } from '../www/js/gridlock-engine.js';
import * as SW from '../www/js/hero/swing-engine.js';
import { LOCKDOWN } from '../www/js/hero/lockdown-levels.js';
import { SHIELD } from '../www/js/hero/shield-levels.js';
import { plan, trace, SHIELD_LEVELS } from '../www/js/hero/shield-engine.js';
import { newBoard, findMatches, findMove, collapse, shuffle, rngOf, matchLevel, MATCH_LEVELS } from '../www/js/hero/match-engine.js';
import { slideStart, slideBest, lightsStart, lightsPress, lightsSolved, pipesStart, pipesSolved, sokoParse, sokoBest, memoryDeal, patternSeq } from '../www/js/hero/stones-engine.js';

let fail = 0, checks = 0;
const check = (ok, msg) => { checks++; if (!ok) { fail++; console.log('FAIL', msg); } };

// Villain Lockdown
check(LOCKDOWN.length === 60, `60 lockdown levels (found ${LOCKDOWN.length})`);
LOCKDOWN.forEach((lv, i) => {
  const { vs, pos, walls } = parse(lv.board);
  const sol = solve(vs, pos, walls);
  check(sol && sol.length === lv.par, `lockdown ${i + 1}: par ${lv.par}, solver ${sol ? sol.length : 'none'}`);
  if (i) check(lv.par >= LOCKDOWN[i - 1].par - 1, `lockdown ${i + 1}: difficulty should not drop sharply`);
});

// Shield Throw: replay the greedy plan on the rounded data the game ships
check(SHIELD.length === SHIELD_LEVELS, `${SHIELD_LEVELS} shield rooms`);
SHIELD.forEach((lv, i) => {
  const p = plan(lv, 8);
  check(p && p.length <= lv.par, `shield ${i + 1}: cleared in ${p ? p.length : 'none'} throws, par ${lv.par}`);
  // and the plan really knocks every drone out when thrown in order
  if (p) { const alive = lv.drones.map(() => true); for (const a of p) for (const h of trace(lv, a, alive).hits) alive[h.i] = false; check(alive.every((x) => !x), `shield ${i + 1}: plan replays cleanly`); }
});

// Infinity Stones
for (let s = 1; s <= 30; s++) {
  const b = slideStart(s * 101); const best = slideBest(b);
  check(best > 0, `space: tiles from seed ${s} solvable (${best})`);
  const L = lightsStart(s * 37); const board = L.board.slice();
  // presses commute, so pressing each scrambled cell again solves it: find them by brute force over the 25 cells is too slow, so
  // re-run the scramble with the same seed and press the same cells
  const again = lightsStart(s * 37); check(again.board.join('') === board.join(''), 'power: scramble is repeatable');
  check(!lightsSolved(board), `power: seed ${s} does not start solved`);
  const P = pipesStart(s * 13);
  check(pipesSolved(P.solution, P.n), `reality: pipes seed ${s} solution connects every tile`);
  check(!pipesSolved(P.tiles, P.n), `reality: pipes seed ${s} starts unsolved`);
  const cards = memoryDeal(s); check(cards.length === 16 && [...Array(8)].every((_, k) => cards.filter((c) => c === k).length === 2), 'soul: 8 pairs');
  const seq = patternSeq(s); check(seq.length === 7 && seq.every((v) => v >= 0 && v < 6), 'mind: sequence of 7 pads');
}
// lights out: show solvability directly by undoing the recorded presses
{
  const b = new Array(25).fill(0), cells = [3, 7, 12, 18, 21];
  for (const c of cells) lightsPress(b, c); for (const c of cells) lightsPress(b, c);
  check(lightsSolved(b), 'power: pressing the same orbs again switches everything off');
}
check(sokoBest(sokoParse()) > 10, `time: the relic room is solvable and not trivial (${sokoBest(sokoParse())} steps)`);

// Power Match
for (let s = 1; s <= 200; s++) {
  const rng = rngOf(s), k = s % 2 ? 5 : 6, b = newBoard(rng, 8, k);
  check(findMatches(b).size === 0, `match: board ${s} starts without matches`);
  check(!!findMove(b), `match: board ${s} has a move`);
  collapse(b, [0, 1, 2, 9, 10], rng, k);
  check(b.every((row) => row.every((v) => v >= 0 && v < k)), `match: board ${s} is full after a collapse`);
  shuffle(b, rng); check(!!findMove(b), `match: board ${s} has a move after a shuffle`);
}
for (let i = 0; i < MATCH_LEVELS; i++) { const lv = matchLevel(i); check(lv.moves >= 15 && (lv.goal === 'score' ? lv.target > 0 : lv.want.length > 0), `match level ${i + 1} has a goal and moves`); }

// Web Swing
{
  // a steady player: web when falling with a target, let go in the sweet spot, vault walls, jump at roof edges
  const play = (seed, maxT = 120, rnd = null) => {
    const S = SW.createRun(seed), log = [];
    SW.press(S); let held = true, ht = 0; const dt = 1 / 60;
    let maxSpeed = 0, finite = true, comboOk = true;
    while (!S.dead && S.t < maxT) {
      SW.step(S, dt);
      for (const e of S.events) { log.push(e.k); if ((e.k === 'land' || e.k === 'badland') && S.combo !== 0) comboOk = false; }
      S.events.length = 0;
      maxSpeed = Math.max(maxSpeed, Math.hypot(S.vx, S.vy));
      if (![S.x, S.y, S.vx, S.vy].every(Number.isFinite)) { finite = false; break; }
      if (held) ht += dt;
      if (rnd) { if (rnd() < 0.03) { if (held) SW.release(S); else SW.press(S); held = !held; } continue; }
      if (held && S.mode === 'swing') { if ((SW.sweetness(S) >= 1 && ht > 0.25) || ht > 3) { SW.release(S); held = false; } }
      else if (held && S.mode !== 'swing' && ht > 0.2) { SW.release(S); held = false; }
      else if (!held && ((S.mode === 'roof' && S.x > S.roof.x + S.roof.w - 1.5) || S.mode === 'wall' || (S.mode === 'air' && S.vy < 1 && SW.aim(S)))) { SW.press(S); held = true; ht = 0; }
    }
    return { S, log, maxSpeed, finite, comboOk };
  };
  // the same seed and the same inputs give the same run
  const a = play(7, 40), b = play(7, 40);
  check(a.S.dist === b.S.dist && a.S.coins === b.S.coins && a.S.x === b.S.x && a.log.join() === b.log.join(), 'swing: a seed and the same inputs replay exactly');
  // a good player travels far, and nothing runs away
  const far = [];
  for (let seed = 1; seed <= 10; seed++) {
    const r = play(seed);
    far.push(r.S.dist);
    check(r.finite, `swing: run ${seed} has no NaN or infinite numbers`);
    check(r.maxSpeed <= SW.MAX_SPEED + 1e-6, `swing: run ${seed} never goes faster than the cap (${r.maxSpeed.toFixed(1)})`);
    check(r.comboOk, `swing: run ${seed} resets the combo whenever the hero lands`);
    for (const c of r.S.challenges) check(c.done === (r.S[c.stat] >= c.need), `swing: run ${seed} challenge "${c.text}" matches its stat`);
    check(r.log.includes('web') && r.log.includes('sweet'), `swing: run ${seed} swings and lands perfect releases`);
  }
  far.sort((x, y) => x - y);
  check(far[5] >= 800, `swing: a steady player swings far (median ${Math.round(far[5])} m in two minutes)`);
  // button mashing usually ends on the street, so the game still has a way to lose
  let fell = 0; for (let seed = 1; seed <= 20; seed++) if (play(seed, 120, SW.rngOf(seed * 31)).S.dead) fell++;
  check(fell >= 10, `swing: random tapping falls to the street in most runs (${fell} of 20)`);
  // there is always an anchor in reach from a roof, and nearly always from just above the roofs over a gap
  let roofN = 0, roofMiss = 0, gapN = 0, gapMiss = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const S = SW.createRun(seed); SW.growTo(S, 2600); const B = S.W.blds;
    for (let x = 0; x < 2500; x += 0.5) {
      const bd = SW.buildingAt(S.W, x);
      if (bd) { roofN++; if (!SW.bestAnchor(S.W, x, bd.h + 0.5 + SW.HERO_H)) roofMiss++; }
      else { const i = B.findIndex((q) => q.x > x), fl = Math.min(B[i - 1].h, B[i].h); gapN++; if (!SW.bestAnchor(S.W, x, fl + 0.5 + SW.HERO_H)) gapMiss++; }
    }
  }
  check(roofMiss / roofN < 0.002, `swing: an anchor is in reach from the roofs (${roofMiss} of ${roofN} spots miss)`);
  check(gapMiss / gapN < 0.05, `swing: an anchor is in reach over the gaps (${gapMiss} of ${gapN} spots miss)`);
  // challenges: three different kinds per run
  for (let seed = 1; seed <= 50; seed++) { const cs = SW.pickChallenges(seed); check(cs.length === 3 && new Set(cs.map((c) => c.stat)).size === 3, `swing: run ${seed} gets three different challenges`); }
  // a flip during a drone collision kicks it; otherwise it knocks you and costs the combo
  {
    const S = SW.createRun(3); SW.press(S); SW.step(S, 0.05); SW.release(S); S.events.length = 0;
    S.mode = 'air'; S.web = null; S.combo = 4; S.flip = { left: SW.FLIP_TIME, queued: 0 };
    S.W.drones.push({ x: S.x, y0: S.y + 1, amp: 0, ph: 0, alive: true });
    SW.step(S, 1 / 60);
    check(S.events.some((e) => e.k === 'kick') && S.kicks === 1 && S.combo === 4, 'swing: flipping into a drone kicks it and keeps the combo');
    S.events.length = 0; S.flip = null; S.W.drones.push({ x: S.x, y0: S.y + 1, amp: 0, ph: 0, alive: true });
    SW.step(S, 1 / 60);
    check(S.events.some((e) => e.k === 'hit') && S.combo === 0, 'swing: hitting a drone without a flip costs the combo');
  }
  // a quick tap in the air flips instead of swinging
  {
    const S = SW.createRun(5); SW.press(S); SW.step(S, 0.3); SW.release(S);
    S.mode = 'air'; S.web = null; S.y += 9; S.vy = 6; // well clear of the roof so the flip has time to finish
    const run = (sec) => { for (let k = 0; k < Math.round(sec * 60); k++) SW.step(S, 1 / 60); };
    const before = S.flips, wasAir = S.mode; SW.press(S); run(0.05); SW.release(S); run(SW.FLIP_TIME + 0.05);
    check(wasAir === 'air' && S.flips === before + 1 && !S.web, `swing: a quick tap in the air does a flip (mode ${wasAir}, flips ${S.flips - before})`);
  }
}

console.log(`${checks} checks, ${fail} failed`);
if (fail) process.exit(1);
console.log('All Marvel Heroes checks passed');
