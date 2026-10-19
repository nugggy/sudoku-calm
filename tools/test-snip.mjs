// Checks Snip Buddies: polygon snipping maths, determinism, that every level loads and settles,
// that every level can be solved in principle, and scripted solves for one level of each kind.
// Run with: node tools/test-snip.mjs
import * as E from '../www/js/snip-engine.js';
import { uShape, LEG_N, LEG_C, LEG_T } from '../www/js/snip-body.js';

const { K, LEVELS, BW, BH } = E;
let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('FAIL', msg); } };

// ---------- 1. snipping maths: area(A) = area(A - B) + area(A and B) ----------
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const rect = (x, y, w, h, a = 0) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([px, py]) => [x + px * Math.cos(a) - py * Math.sin(a), y + px * Math.sin(a) + py * Math.cos(a)]);
for (let i = 0; i < 300; i++) {
  const A = rect(rnd() * 2, rnd() * 2, 0.5 + rnd() * 2, 0.5 + rnd() * 2, rnd() * 3), B = rect(rnd() * 2, rnd() * 2, 0.5 + rnd() * 2, 0.5 + rnd() * 2, rnd() * 3);
  const diff = E.multiArea(E.difference(A, B));
  const both = E.multiArea(E.intersection(A, B));
  check(Math.abs(Math.abs(E.area(A)) - (diff + both)) < 1e-6, `area split ${i}: ${Math.abs(E.area(A))} vs ${diff} + ${both}`);
}

// ---------- 2. every level loads, settles and stays in the world ----------
for (let i = 0; i < LEVELS.length; i++) {
  const w = E.createWorld(i);
  for (let f = 0; f < 240; f++) E.step(w, [0, 0]);
  const bodies = [...w.buddies, ...w.props];
  check(bodies.every((b) => Number.isFinite(b.x) && Number.isFinite(b.y)), `level ${i + 1} has a broken position`);
  check(bodies.every((b) => b.x > 0 && b.x < E.W && b.y > 0 && b.y < E.H), `level ${i + 1}: something left the world`);
  check(w.buddies.every((b) => b.grounded), `level ${i + 1}: a buddy did not land`);
  check(w.buddies.every((b) => Math.abs(b.leg - LEG_N) < 1e-6), `level ${i + 1}: legs did not settle at their normal length`);
  check(!w.won, `level ${i + 1} is won without doing anything`);
}

// ---------- 3. determinism: the same inputs give the same result ----------
const script = (f) => [[K.R, K.R | K.J, K.L, K.RR, K.C, 0][Math.floor(f / 25) % 6], [K.L, K.RL, K.J, K.R | K.C, 0, K.L][Math.floor(f / 31) % 6]];
for (let i = 0; i < LEVELS.length; i++) {
  const run = () => { const w = E.createWorld(i); for (let f = 0; f < 400; f++) { E.step(w, script(f)); if (f === 150) E.snip(w, 0); if (f === 260) E.snip(w, 1); } return E.stateHash(w); };
  check(run() === run(), `level ${i + 1} is not deterministic`);
}

// ---------- 4. solvable in principle ----------
// A part fits in one buddy when, turned some quarter turn, it lies inside a fresh U (tried against its top, middle
// and bottom).
function fitsInBuddy(part) {
  const body = uShape(0, 0);
  for (let q = 0; q < 4; q++) {
    const c = Math.round(Math.cos((q * Math.PI) / 2)), sn = Math.round(Math.sin((q * Math.PI) / 2));
    const t = part.map(([x, y]) => [x * c - y * sn, x * sn + y * c]);
    const xs = t.map((v) => v[0]), ys = t.map((v) => v[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), pw = Math.max(...xs) - x0, ph = Math.max(...ys) - y0;
    if (pw > BW + 1e-6 || ph > BH + 1e-6) continue;
    for (const oy of [0, (BH - ph) / 2, BH - ph]) {
      const placed = t.map(([x, y]) => [x - x0 + (BW - pw) / 2, y - y0 + oy]);
      if (E.multiArea(E.difference(placed, body)) < 0.012) return true;
    }
  }
  return false;
}
const surfaces = (w) => w.statics.filter((s) => s.r).map((s) => ({ x0: s.r[0], x1: s.r[0] + s.r[2], y: s.r[1] }));
const surfaceBelow = (w, x, y) => surfaces(w).filter((s) => x >= s.x0 - 0.3 && x <= s.x1 + 0.3 && s.y >= y - 0.05).sort((a, b) => a.y - b.y)[0];
const REACH = 4.6; // standing on a buddy and jumping, with a point held up
for (let i = 0; i < LEVELS.length; i++) {
  const lv = LEVELS[i], w = E.createWorld(i), name = `level ${i + 1} (${lv.name})`;
  if (lv.type === 'fill') {
    for (const p of lv.parts) {
      check(fitsInBuddy(p), `${name}: a part does not fit inside one buddy`);
      check(Math.abs(E.area(p)) >= E.MIN_AREA, `${name}: a part is smaller than the smallest allowed buddy`);
    }
    // the lowest piece rests on a surface: on the ground (a buddy lying on its side) or at standing, stand-tall or crouching height
    const all = w.target.rings.flat(), bottom = Math.max(...all.map((q) => q[1]));
    const low = all.filter((q) => q[1] > bottom - 0.05), cx = low.reduce((t, q) => t + q[0], 0) / low.length;
    const s = surfaceBelow(w, cx, bottom);
    check(s && [0, LEG_N, LEG_T, LEG_C].some((h) => Math.abs(s.y - h - bottom) < 0.05), `${name}: the outline does not rest on a surface`);
  }
  if (lv.type === 'pop') for (const [x, y, r] of lv.balloons) { const s = surfaceBelow(w, x, y); check(s && s.y - (y + r) <= REACH, `${name}: a balloon is out of reach`); }
  if (lv.type === 'goal') {
    const [x, y, gw, gh] = lv.goal, s = surfaceBelow(w, x + gw / 2, y);
    check(lv.ball[2] * 2 < gw, `${name}: the ball is wider than the goal`);
    check(s && s.y - y <= REACH && s.y >= y, `${name}: the goal is out of reach`);
  }
  if (lv.type === 'press') {
    check(lv.buttons.length <= 2 + (lv.ball ? 1 : 0), `${name}: more buttons than things to press them`);
    for (const [x, y, bw, bh] of lv.buttons) { const s = surfaceBelow(w, x + bw / 2, y); check(s && s.y - y <= REACH, `${name}: a button is out of reach`); }
  }
}

// ---------- 5. scripted solves ----------
const steer = (b, x, tol = 0.06) => { const dx = x - b.x; return dx > tol ? K.R : dx < -tol ? K.L : 0; };
function solve(i, ctl, frames = 1200) {
  const w = E.createWorld(i);
  for (let f = 0; f < frames && !w.won; f++) E.step(w, ctl(w, f));
  return w;
}
// fill: walk into the outline
let w = solve(0, (w) => [steer(w.buddies[0], 4.35), steer(w.buddies[1], 5.65)]);
check(w.won, `scripted solve of level 1 failed (score ${w.score.toFixed(2)})`);
// fill: stand on your buddy
w = solve(2, (w) => { const [a, b] = w.buddies; return [steer(a, 5) | (Math.abs(a.x - b.x) < 1.6 && a.y > 10 && a.grounded ? K.J : 0), steer(b, 5)]; });
check(w.won, `scripted solve of level 3 failed (score ${w.score.toFixed(2)})`);
// pop: snip a point, turn it upwards, jump under the balloon
w = E.createWorld(3);
for (let f = 0; f < 20; f++) E.step(w, [0, K.RR]);
for (let f = 0; f < 70; f++) E.step(w, [K.R, 0]);
check(E.snip(w, 0) === 'ok', 'level 4: the snip did not cut');
{
  const B = w.buddies[1];
  const top = () => { const r = E.worldRing(B); let s = Infinity, sx = 0; for (const k of B.sharp) if (r[k][1] < s) { s = r[k][1]; sx = r[k][0]; } return { gap: s - Math.min(...r.map((p) => p[1])), sx }; };
  for (let f = 0; f < 200 && top().gap > 0.02; f++) E.step(w, [0, K.RR]);
  for (let f = 0; f < 400 && !w.won; f++) { const { sx } = top(); const dx = 5 - sx; E.step(w, [0, (dx > 0.05 ? K.R : dx < -0.05 ? K.L : 0) | (Math.abs(dx) < 0.15 ? K.J : 0)]); }
}
check(w.won, 'scripted solve of level 4 (pop) failed');
// press: one buddy on each button
w = solve(4, (w) => [steer(w.buddies[0], 1.6), steer(w.buddies[1], 8.4)]);
check(w.won, 'scripted solve of level 5 (press) failed');
// goal: push the ball up the ramp and into the gap
w = solve(6, (w) => { const [a] = w.buddies, ball = w.props[0]; return [steer(a, Math.min(7.4, ball.x), 0.02), 0]; }, 1500);
check(w.won, `scripted solve of level 7 (goal) failed (ball at ${w.props[0].x.toFixed(2)}, ${w.props[0].y.toFixed(2)})`);
// ---------- 5b. scripted solves of the leg levels, and proof that they need the legs ----------
const lvl = (name) => { const i = LEVELS.findIndex((l) => l.name === name); check(i >= 0, `no level called ${name}`); return i; };
// Tall order: one stands tall in the higher outline
w = solve(lvl('Tall order'), (w) => [steer(w.buddies[0], 4.25) | K.T, steer(w.buddies[1], 5.65)]);
check(w.won, `scripted solve of Tall order failed (score ${w.score.toFixed(2)})`);
w = solve(lvl('Tall order'), (w) => [steer(w.buddies[0], 4.25), steer(w.buddies[1], 5.65)], 600);
check(!w.won, 'Tall order should not be won without standing tall');
// Big and small: one tall, one crouching
w = solve(lvl('Big and small'), (w) => [steer(w.buddies[0], 4.35) | K.T, steer(w.buddies[1], 5.65) | K.C]);
check(w.won, `scripted solve of Big and small failed (score ${w.score.toFixed(2)})`);
w = solve(lvl('Big and small'), (w) => [steer(w.buddies[0], 4.35), steer(w.buddies[1], 5.65)], 600);
check(!w.won, 'Big and small should not be won standing normally');
// Duck down: crouch to get under the roof to the far button
w = solve(lvl('Duck down'), (w) => [steer(w.buddies[0], 1.2), steer(w.buddies[1], 7.2) | K.C]);
check(w.won, 'scripted solve of Duck down failed');
w = solve(lvl('Duck down'), (w) => [steer(w.buddies[0], 1.2), steer(w.buddies[1], 7.2)], 600);
check(!w.won && w.buddies[1].x < 5.2, `standing upright should not fit under the roof in Duck down (x ${w.buddies[1].x.toFixed(2)})`);
// Stilts: stand tall against the wall for the high button
w = solve(lvl('Stilts'), (w) => [steer(w.buddies[0], 0.4) | K.T, steer(w.buddies[1], 8.4)]);
check(w.won, 'scripted solve of Stilts failed');
w = solve(lvl('Stilts'), (w) => [steer(w.buddies[0], 0.4), steer(w.buddies[1], 8.4)], 600);
check(!w.won, 'Stilts should not be won without standing tall');
// Reach and duck: tall on the left, crouched under the shelf on the right
w = solve(lvl('Reach and duck'), (w) => [steer(w.buddies[0], 0.4) | K.T, steer(w.buddies[1], 9.6) | K.C]);
check(w.won, 'scripted solve of Reach and duck failed');
w = solve(lvl('Reach and duck'), (w) => [steer(w.buddies[0], 0.4) | K.T, steer(w.buddies[1], 9.6)], 600);
check(!w.won, 'Reach and duck should not be won without crouching under the shelf');

// a snip that would leave too little paper is refused, and reset gives back a full sheet
w = E.createWorld(0);
w.buddies[0].x = w.buddies[1].x; w.buddies[0].y = w.buddies[1].y;
check(E.snip(w, 0) === 'small', 'a snip that removes the whole buddy should be refused');
E.resetShape(w, 1);
check(Math.abs(w.buddies[1].area - E.BODY_AREA) < 1e-6, 'reset should give a full sheet');

// ---------- 6. legs: crouch and stand tall move the paper, never change its shape ----------
{
  const w = E.createWorld(0), b = w.buddies[0], shape0 = JSON.stringify(b.shape);
  for (let f = 0; f < 120; f++) E.step(w, [0, 0]);
  const y0 = b.y;
  for (let f = 0; f < 120; f++) E.step(w, [K.C, 0]);
  const yc = b.y;
  for (let f = 0; f < 120; f++) E.step(w, [K.T, 0]);
  const yt = b.y;
  check(yc - y0 > 0.25, `crouching should lower the paper (moved ${(yc - y0).toFixed(2)})`);
  check(y0 - yt > 0.45, `standing tall should lift the paper (moved ${(y0 - yt).toFixed(2)})`);
  check(JSON.stringify(b.shape) === shape0, 'the paper changed shape while crouching or standing tall');
  check(b.grounded, 'a buddy standing tall should still be on the ground');
  for (let f = 0; f < 60; f++) E.step(w, [K.RR, 0]);
  for (let f = 0; f < 90; f++) E.step(w, [0, 0]);
  check(b.leg < 0.03 && b.grounded, 'a buddy on its side should tuck its legs away and rest on the ground');
}

console.log(fail ? `\n${fail} check(s) failed` : `Snip Buddies: ${LEVELS.length} levels load, settle, are deterministic and solvable in principle; snipping maths, 10 scripted solves (5 of them leg puzzles) and the legs-needed checks pass.`);
process.exit(fail ? 1 : 0);
