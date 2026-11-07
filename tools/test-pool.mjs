// Checks 8 Ball (www/js/duo/rt-pool.js): the rules for the break, groups, fouls and the 8; the physics
// (energy only goes down, balls stay on the table and never overlap, every pocket takes a ball, shots end);
// two phones agree after each shot; and the computer plays legal shots and finishes games at every level.
// Run with: node tools/test-pool.mjs
import { mulberry32 } from '../www/js/sudoku-engine.js';
import * as P from '../www/js/duo/rt-pool.js';

let fail = 0, checks = 0;
const check = (ok, msg) => { checks++; if (!ok) { fail++; console.log('FAIL', msg); } };
const t0 = Date.now();
const SOLIDS = [1, 2, 3, 4, 5, 6, 7], STRIPES = [9, 10, 11, 12, 13, 14, 15];
// A position after the break with the given balls already potted and groups set.
function mid({ turn = 0, groups = ['s', 't'], gone = [] } = {}) {
  const s = P.newPool(mulberry32(4), 0);
  s.breakShot = false; s.inHand = false; s.kitchen = false; s.turn = turn; s.groups = groups.slice();
  for (const n of gone) s.balls[n].in = true;
  return s;
}
// Pots the given balls (as the physics would have) and judges the shot.
function shot(s, first, pots) { for (const n of pots) s.balls[n].in = true; return P.judge(s, { first, pots }); }

// ---------- Rules ----------
{
  let s = P.newPool(mulberry32(1), 0);
  check(s.breakShot && s.inHand && s.kitchen && s.groups[0] === null, 'new game: break, ball in hand behind the line, open table');
  check(P.canPlaceCue(s, 0.5, P.HEAD + 0.1) && !P.canPlaceCue(s, 0.5, P.HEAD - 0.1), 'break: cue ball only behind the head string');
  const r = shot(s, 4, [3, 12]);
  check(r.cont && !r.foul && s.turn === 0 && s.groups[0] === null && !s.breakShot, 'break: a pot keeps the turn and the table stays open');

  s = P.newPool(mulberry32(1), 0);
  shot(s, 4, []);
  check(s.turn === 1 && !s.inHand && !s.last.foul, 'break: no pot passes the turn without a foul');

  s = P.newPool(mulberry32(1), 1);
  shot(s, 4, [0]);
  check(s.turn === 0 && s.inHand && !s.kitchen && s.last.foul === 'scratch' && !s.balls[0].in, 'break: scratch gives ball in hand anywhere, cue ball back on the table');

  s = P.newPool(mulberry32(1), 0);
  shot(s, 4, [8]);
  check(!s.over && !s.balls[8].in && s.turn === 0, 'break: the 8 going down is put back, game on, breaker continues');

  s = mid({ groups: [null, null] });
  let q = shot(s, 3, [3]);
  check(q.assigned && s.groups[0] === 's' && s.groups[1] === 't' && s.turn === 0, 'open table: first legal pot sets the groups and keeps the turn');
  s = mid({ groups: [null, null], turn: 1 });
  shot(s, 2, [11, 2]);
  check(s.groups[1] === 't' && s.groups[0] === 's' && s.turn === 1, 'open table: the first ball potted decides the group');
  s = mid({ groups: [null, null] });
  q = shot(s, 8, [5]);
  check(q.foul === 'wrong' && s.groups[0] === null && s.turn === 1 && s.inHand, 'open table: hitting the 8 first is a foul and assigns nothing');

  s = mid();
  q = shot(s, 12, []);
  check(q.foul === 'wrong' && s.turn === 1 && s.inHand, "foul: hitting the other group's ball first");
  s = mid();
  q = shot(s, 12, [12]);
  check(q.foul === 'wrong' && s.turn === 1 && s.inHand && !q.cont, "foul: potting their ball after hitting it first doesn't keep the turn");
  s = mid();
  q = shot(s, null, []);
  check(q.foul === 'nohit' && s.turn === 1 && s.inHand, 'foul: hitting nothing');
  s = mid();
  q = shot(s, 2, [2, 0]);
  check(q.foul === 'scratch' && s.turn === 1 && s.inHand && !s.balls[0].in, 'foul: scratch even when a ball of your own went in');
  s = mid();
  q = shot(s, 2, [10]);
  check(!q.foul && s.turn === 1 && !s.inHand, 'legal hit that only pots their ball passes the turn, no foul');
  s = mid();
  q = shot(s, 2, [2, 10]);
  check(!q.foul && q.cont && s.turn === 0, 'potting your own and theirs keeps the turn');

  s = mid({ gone: SOLIDS });
  q = shot(s, 8, [8]);
  check(s.over && s.over.winner === 0 && s.over.why === 'eight', '8 ball: legally potted after clearing the group wins');
  s = mid({ turn: 1, gone: STRIPES });
  shot(s, 8, [8]);
  check(s.over && s.over.winner === 1, '8 ball: stripes player wins too');
  s = mid();
  shot(s, 2, [8]);
  check(s.over && s.over.winner === 1 && s.over.why === 'early8', '8 ball: potted before clearing the group loses');
  s = mid({ gone: SOLIDS });
  shot(s, 8, [8, 0]);
  check(s.over && s.over.winner === 1 && s.over.why === 'scratch8', '8 ball: scratching on the 8 loses');
  s = mid({ gone: SOLIDS.slice(1) });
  shot(s, 1, [1, 8]);
  check(s.over && s.over.winner === 1, '8 ball: the last group ball and the 8 in one shot loses');
  s = mid({ gone: SOLIDS });
  shot(s, 12, [8]);
  check(s.over && s.over.winner === 1 && s.over.why === 'foul8', '8 ball: potted off a foul loses');
  s = mid({ groups: [null, null] });
  shot(s, 3, [8]);
  check(s.over && s.over.winner === 1, '8 ball: potted on an open table loses');
  s = mid({ gone: SOLIDS });
  q = shot(s, 12, []);
  check(q.foul === 'wrong', 'group cleared: the 8 must be hit first');
  check(P.legalTargets(s, 0).join() === '8', 'group cleared: only the 8 is a legal target');
}

// ---------- Physics ----------
const ke = (s) => s.balls.reduce((a, b) => a + (b.in ? 0 : b.vx * b.vx + b.vy * b.vy), 0);
function sane(s, tag) {
  for (const b of s.balls) {
    if (b.in) continue;
    if (!(b.x > -0.03 && b.x < P.W + 0.03 && b.y > -0.03 && b.y < P.H + 0.03)) { check(false, `${tag}: ball ${b.n} off the table at ${b.x.toFixed(3)}, ${b.y.toFixed(3)}`); return false; }
    // away from the pocket mouths, a ball centre never crosses the cushion line
    const nearPocket = P.POCKETS.some((p) => Math.hypot(b.x - p.x, b.y - p.y) < 0.16);
    if (!nearPocket && !(b.x >= P.R - 1e-6 && b.x <= P.W - P.R + 1e-6 && b.y >= P.R - 1e-6 && b.y <= P.H - P.R + 1e-6)) { check(false, `${tag}: ball ${b.n} inside a cushion at ${b.x.toFixed(4)}, ${b.y.toFixed(4)}`); return false; }
  }
  return true;
}
{
  const rnd = mulberry32(21);
  let shots = 0, pots = 0, rises = 0, longest = 0, overlaps = 0;
  for (let g = 0; g < 40; g++) {
    const s = P.newPool(mulberry32(100 + g), g % 2);
    for (let k = 0; k < 14 && !s.over; k++) {
      const cue = s.balls[0], a = rnd() * Math.PI * 2;
      const sh = { dx: Math.cos(a), dy: Math.sin(a), p: 0.15 + rnd() * 0.85, sp: 0 };
      if (k === 0) Object.assign(sh, { dx: (rnd() - 0.5) * 0.1, dy: -1, p: 1, cx: 0.5 + (rnd() - 0.5) * 0.3, cy: P.HEAD + 0.1 });
      else if (s.inHand) Object.assign(sh, { cx: cue.x, cy: cue.y });
      P.startShot(s, sh);
      let e = ke(s), n = 0;
      while (P.stepPool(s, [])) {
        const e2 = ke(s);
        if (e2 > e * (1 + 1e-9) + 1e-12) rises++;
        e = e2; n++;
        if (n % 30 === 0 && !sane(s, `game ${g} shot ${k} step ${n}`)) break;
      }
      longest = Math.max(longest, n);
      check(n < 120 * 40, `game ${g} shot ${k}: balls stop`);
      sane(s, `game ${g} shot ${k} at rest`);
      for (let i = 0; i < 16; i++) for (let j = i + 1; j < 16; j++) {
        const a2 = s.balls[i], b2 = s.balls[j];
        if (!a2.in && !b2.in && Math.hypot(a2.x - b2.x, a2.y - b2.y) < 2 * P.R - 1e-4) overlaps++;
      }
      pots += s.cur.pots.length;
      P.judge(s, s.cur);
      shots++;
    }
  }
  check(rises === 0, `energy rose in ${rises} steps (plain shots with no spin should only lose energy)`);
  check(overlaps === 0, `${overlaps} pairs of balls overlapping at rest`);
  console.log(`Physics: ${shots} random shots, ${pots} balls potted, longest shot ${(longest / 120).toFixed(1)} s`);

  // every pocket takes a straight shot, and the cue ball following it in is a scratch
  P.POCKETS.forEach((pk, i) => {
    const s = mid({ gone: [...SOLIDS, ...STRIPES, 8].filter((n) => n !== 1) });
    const cx = Math.min(P.W - 0.2, Math.max(0.2, pk.x)), cy = Math.min(P.H - 0.25, Math.max(0.25, pk.y));
    const ux = pk.x - cx, uy = pk.y - cy, l = Math.hypot(ux, uy);
    const ob = s.balls[1], cue = s.balls[0];
    ob.x = cx + (ux / l) * 0.1; ob.y = cy + (uy / l) * 0.1; cue.x = cx - (ux / l) * 0.2; cue.y = cy - (uy / l) * 0.2;
    P.startShot(s, { dx: ux, dy: uy, p: 0.45, sp: -1 });
    while (P.stepPool(s, []));
    check(s.cur.pots.includes(1) && !s.cur.pots.includes(0), `pocket ${i}: straight shot goes in, the cue ball stays out with draw`);
    const t = mid({ gone: [...SOLIDS, ...STRIPES, 8] });
    t.balls[0].x = cx; t.balls[0].y = cy;
    P.startShot(t, { dx: ux, dy: uy, p: 0.4, sp: 0 });
    while (P.stepPool(t, []));
    check(t.cur.pots[0] === 0 && P.judge(t, t.cur).foul === 'scratch', `pocket ${i}: the cue ball alone goes in as a scratch`);
  });
  // a ball rolled along the top cushion past the side pocket region and into the corner
  const s = mid({ gone: [...SOLIDS, ...STRIPES, 8] });
  s.balls[0].x = P.R; s.balls[0].y = P.H * 0.8;
  P.startShot(s, { dx: 0, dy: -1, p: 0.9, sp: 0 });
  while (P.stepPool(s, []));
  check(s.cur.pots.length === 0 || s.cur.pots[0] === 0, 'a ball running down the side cushion stays on the table or drops in a pocket');
  // a head-on hit with stun (draw cancels the natural roll) leaves the cue ball almost dead
  const h = mid({ gone: [...SOLIDS, ...STRIPES, 8].filter((n) => n !== 1) });
  h.balls[0].x = 0.5; h.balls[0].y = 1.4; h.balls[1].x = 0.5; h.balls[1].y = 1.0;
  P.startShot(h, { dx: 0, dy: -1, p: 0.5, sp: -0.3273 });
  for (let k = 0; k < 40; k++) P.stepPool(h, []);
  check(Math.abs(h.balls[0].vy) < 0.1 && h.balls[1].vy < -1, 'head-on stun shot: object ball takes the speed, cue ball stops');
  // the aim guide finds the ball the cue ball will hit first
  const g = mid({ gone: [...SOLIDS, ...STRIPES, 8].filter((n) => n !== 1) });
  g.balls[1].x = 0.5; g.balls[1].y = 1.0;
  const a = P.aimContact(g, 0.5, 1.4, 0, -1);
  check(a.ball === 1 && Math.abs(a.gy - (1.0 + 2 * P.R)) < 1e-9, 'aim guide: ghost ball touches the first ball in line');
  const b2 = P.aimContact(g, 0.5, 1.4, 1, 0);
  check(a && b2.ball === null && Math.abs(b2.gx - (P.W - P.R)) < 1e-9, 'aim guide: stops at the cushion when nothing is in the way');
}

// ---------- Two phones ----------
// The host plays each shot and sends the shot and its final layout; the guest plays the same shot and adopts the layout.
{
  const A = P.newPool(mulberry32(77), 0), B = P.newPool(mulberry32(77), 0), rnd = mulberry32(5);
  check(JSON.stringify(P.packPool(A)) === JSON.stringify(P.packPool(B)), 'two phones: the same seed gives the same rack');
  let n = 0, same = 0;
  while (!A.over && n < 300) {
    const sh = P.aiShot(A, ['easy', 'medium', 'hard'][n % 3], rnd);
    const host = P.cloneState(A);
    P.runShot(host, sh);
    const msg = JSON.parse(JSON.stringify({ shot: sh, after: P.packPool(host) }));
    P.runShot(A, sh); P.unpackPool(A, P.packPool(A));
    P.runShot(B, msg.shot);
    if (JSON.stringify(P.packPool(B)) === JSON.stringify(msg.after)) same++;
    P.unpackPool(B, msg.after);
    check(JSON.stringify(P.packPool(A)) === JSON.stringify(P.packPool(B)), `two phones: agree after shot ${n}`);
    n++;
  }
  check(!!A.over && JSON.stringify(A.over) === JSON.stringify(B.over), 'two phones: both agree who won');
  check(same === n, `two phones: the guest's own simulation matched the host's in ${same} of ${n} shots`);
  console.log(`Two phones: ${n} shots, winner ${A.over?.winner} (${A.over?.why})`);
}

// ---------- Computer player ----------
{
  // an easy straight pot near a corner: every level takes it
  for (const lv of ['easy', 'medium', 'hard']) {
    let ok = 0;
    for (let k = 0; k < 10; k++) {
      const s = mid({ gone: [2, 3, 4, 5, 6, 7] });
      // own ball 1 a short way from the bottom-left corner, cue ball behind it on the same line
      s.balls[1].x = 0.18; s.balls[1].y = P.H - 0.18; s.balls[0].x = 0.38; s.balls[0].y = P.H - 0.38;
      for (const b of s.balls) if (b.n > 1 && !b.in && b.y > P.H - 0.6) b.y -= 0.6; // clear the area
      const r = P.runShot(s, P.aiShot(s, lv, mulberry32(k + 1)));
      if (r.pots.includes(1) && !r.foul) ok++;
    }
    check(ok >= (lv === 'easy' ? 6 : 9), `computer (${lv}): pots a simple straight shot (${ok} of 10)`);
  }
  // whole games against itself: the computer's shots are mostly legal and every game finishes
  for (const lv of ['easy', 'medium', 'hard']) {
    let shots = 0, fouls = 0, games = 0, potted = 0;
    for (let g = 0; g < 4; g++) {
      const s = P.newPool(mulberry32(300 + g), g % 2), rnd = mulberry32(400 + g);
      let n = 0;
      while (!s.over && n < 250) {
        const sh = P.aiShot(s, lv, rnd);
        check(Number.isFinite(sh.dx) && Number.isFinite(sh.dy) && sh.p > 0 && sh.p <= 1, `computer (${lv}): shot numbers are sane`);
        if (s.inHand) check(P.canPlaceCue(s, sh.cx, sh.cy), `computer (${lv}): places the cue ball legally`);
        const r = P.runShot(s, sh);
        if (r.foul) fouls++;
        potted += r.pots.filter((x) => x && x !== 8).length;
        n++;
      }
      check(!!s.over, `computer (${lv}) game ${g}: finishes (after ${n} shots)`);
      shots += n; games++;
    }
    const rate = fouls / shots;
    check(rate < (lv === 'easy' ? 0.3 : lv === 'medium' ? 0.15 : 0.1), `computer (${lv}): foul rate ${(rate * 100).toFixed(0)}%`);
    console.log(`Computer (${lv}): ${games} games, ${(shots / games).toFixed(0)} shots a game, ${(rate * 100).toFixed(0)}% fouls`);
  }
  // a first legal shot from the break position after the other player's break
  const s = P.newPool(mulberry32(9), 0);
  P.runShot(s, { dx: 0, dy: -1, p: 1, sp: 0, cx: 0.5, cy: P.HEAD + 0.1 });
  let legal = 0;
  for (let k = 0; k < 10; k++) { const t = P.cloneState(s); if (!P.runShot(t, P.aiShot(t, 'medium', mulberry32(k))).foul) legal++; }
  check(legal >= 8, `computer (medium): legal shots after a break (${legal} of 10)`);
}

console.log(`${checks} checks, ${fail} failed, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (fail) process.exit(1);
console.log('All 8 Ball checks passed');
