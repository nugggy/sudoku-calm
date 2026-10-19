// Checks Snip Buddies: polygon snipping maths, determinism, that every level loads and settles,
// that every level can be solved in principle, and scripted solves for one level of each kind.
// Run with: node tools/test-snip.mjs
import * as E from '../www/js/snip-engine.js';

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
  check(!w.won, `level ${i + 1} is won without doing anything`);
}

// ---------- 3. determinism: the same inputs give the same result ----------
const script = (f) => [[K.R, K.R | K.J, K.L, K.RR, K.C, 0][Math.floor(f / 25) % 6], [K.L, K.RL, K.J, K.R | K.C, 0, K.L][Math.floor(f / 31) % 6]];
for (let i = 0; i < LEVELS.length; i++) {
  const run = () => { const w = E.createWorld(i); for (let f = 0; f < 400; f++) { E.step(w, script(f)); if (f === 150) E.snip(w, 0); if (f === 260) E.snip(w, 1); } return E.stateHash(w); };
  check(run() === run(), `level ${i + 1} is not deterministic`);
}

// ---------- 4. solvable in principle ----------
const surfaces = (w) => w.statics.filter((s) => s.r).map((s) => ({ x0: s.r[0], x1: s.r[0] + s.r[2], y: s.r[1] }));
const surfaceBelow = (w, x, y) => surfaces(w).filter((s) => x >= s.x0 - 0.3 && x <= s.x1 + 0.3 && s.y >= y - 0.05).sort((a, b) => a.y - b.y)[0];
const REACH = 4.6; // standing on a buddy and jumping, with a point held up
for (let i = 0; i < LEVELS.length; i++) {
  const lv = LEVELS[i], w = E.createWorld(i), name = `level ${i + 1} (${lv.name})`;
  if (lv.type === 'fill') {
    for (const p of lv.parts) {
      const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]), pw = Math.max(...xs) - Math.min(...xs), ph = Math.max(...ys) - Math.min(...ys);
      check((pw <= BW + 1e-6 && ph <= BH + 1e-6) || (pw <= BH + 1e-6 && ph <= BW + 1e-6), `${name}: a part does not fit inside one buddy`);
      check(Math.abs(E.area(p)) >= E.MIN_AREA, `${name}: a part is smaller than the smallest allowed buddy`);
    }
    const ys = w.target.ring.map((q) => q[1]), bottom = Math.max(...ys);
    const cx = w.target.ring.reduce((s, q) => s + q[0], 0) / w.target.ring.length;
    const s = surfaceBelow(w, cx, bottom);
    check(s && Math.abs(s.y - bottom) < 0.05, `${name}: the outline does not rest on a surface`);
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
w = solve(2, (w) => { const [a, b] = w.buddies; return [steer(a, 5) | (Math.abs(a.x - b.x) < 1.6 && a.y > 11 && a.grounded ? K.J : 0), steer(b, 5)]; });
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
// a snip that would leave too little paper is refused, and reset gives back a full sheet
w = E.createWorld(0);
w.buddies[0].x = w.buddies[1].x; w.buddies[0].y = w.buddies[1].y;
check(E.snip(w, 0) === 'small', 'a snip that removes the whole buddy should be refused');
E.resetShape(w, 1);
check(Math.abs(w.buddies[1].area - BW * BH) < 1e-6, 'reset should give a full sheet');

console.log(fail ? `\n${fail} check(s) failed` : `Snip Buddies: ${LEVELS.length} levels load, settle, are deterministic and solvable in principle; snipping maths and 5 scripted solves pass.`);
process.exit(fail ? 1 : 0);
