// Checks the Play Together real-time games Light Cycles, Tug of War, Quick Draw, Sumo Bumpers and
// Penalty Shootout: rules, physics, fair judging over a laggy link, and a host and guest playing
// whole matches over a delayed link and agreeing on the score. Run with: node tools/test-duo-d.mjs
import { GW, GH, cyclesInit, cyclesTurn, cyclesMove, cyclesSpec } from '../www/js/duo/g-cycles.js';
import { sumoInit, sumoPhysics, sumoOut, sumoDash, sumoSpec, BR, DASH_CD } from '../www/js/duo/g-sumo.js';
import { newTapper, tugTap, pullAt, tugJudge, tugInit, tugAddTap, tugSpec, ROUND_MS, WIN, GRACE as TUG_GRACE } from '../www/js/duo/g-tug.js';
import { qdInit, qdTap, qdJudge, quickdrawSpec, GRACE as QD_GRACE } from '../www/js/duo/g-quickdraw.js';
import { judgeShot, shotFromSwipe, penWinner, penInit, penShoot, penDive, penTick, penaltySpec, shooterOf, BAR } from '../www/js/duo/g-penalty.js';

let fail = 0, pass = 0;
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log('FAIL', msg); } };
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const STEP = 1000 / 60;

// ---------- Light Cycles ----------
{
  let s = cyclesInit();
  check(s.p[0].d === 0 && s.p[1].d === 2, 'cycles start headings');
  cyclesTurn(s, 0, 2); cyclesMove(s);
  check(s.p[0].d === 0, 'cycles ignore a reversing turn');
  cyclesTurn(s, 0, 3); cyclesMove(s);
  check(s.p[0].d === 3 && s.grid[s.p[0].y * GW + s.p[0].x] === 1, 'cycles turn and leave a trail');
  // drive player 0 into the left wall
  s = cyclesInit(); cyclesTurn(s, 0, 3);
  let w; for (let i = 0; i < 40 && w === undefined; i++) w = cyclesMove(s);
  check(w === 1 && !s.p[0].a && s.p[1].a, 'cycles wall crash gives the round to the other rider');
  // player 0 heads right into a wall of player 1's trail
  s = cyclesInit(); s.grid.fill(0);
  for (let y = 0; y < GH; y++) s.grid[y * GW + 20] = 2;
  s.p[0] = { x: 10, y: 30, d: 1, a: 1 }; s.p[1] = { x: 25, y: 5, d: 2, a: 1 };
  w = undefined;
  for (let i = 0; i < 40 && w === undefined; i++) w = cyclesMove(s);
  check(w === 1 && s.p[0].x === 19, 'cycles crash into a trail');
  // head-on into the same cell
  s = cyclesInit(); s.p[0] = { x: 10, y: 20, d: 1, a: 1 }; s.p[1] = { x: 12, y: 20, d: 3, a: 1 }; s.grid.fill(0);
  w = cyclesMove(s);
  check(w === -1, 'cycles head-on into the same cell is a double crash');
  // swapping cells (passing through each other) is also a crash
  s = cyclesInit(); s.grid.fill(0); s.p[0] = { x: 10, y: 20, d: 1, a: 1 }; s.p[1] = { x: 11, y: 20, d: 3, a: 1 };
  s.grid[20 * GW + 10] = 1; s.grid[20 * GW + 11] = 2;
  check(cyclesMove(s) === -1, 'cycles cannot pass through each other');
  check(GW > 10 && GH > 10, 'cycles board size');
}

// ---------- Sumo Bumpers ----------
{
  const s = sumoInit(); s.ph = 'run';
  // drive player 0 straight up into player 1 until player 1 leaves the ring
  let out = [false, false], minGap = Infinity, hit = false;
  for (let i = 0; i < 1200 && !out[1] && !out[0]; i++) {
    hit = sumoPhysics(s, [{ x: 0, y: -1 }, { x: 0, y: 0 }]) || hit;
    minGap = Math.min(minGap, Math.hypot(s.p[0].x - s.p[1].x, s.p[0].y - s.p[1].y));
    out = sumoOut(s);
  }
  check(hit && s.p[1].vy < 0, 'sumo: a push moves the other bumper');
  check(minGap >= 2 * BR - 1e-6, 'sumo: bumpers never overlap after a step');
  check(out[1] && !out[0], 'sumo: pushing a still bumper knocks it out of the ring');
  // dash and its cooldown
  const t = sumoInit(); t.ph = 'run';
  check(sumoDash(t, 0) && t.p[0].cd === DASH_CD, 'sumo: dash works');
  check(!sumoDash(t, 0), 'sumo: dash has a cooldown');
  // a long random brawl keeps numbers finite
  const u = sumoInit(); u.ph = 'run'; let ok = true;
  for (let i = 0; i < 3000; i++) { sumoPhysics(u, [{ x: rnd() * 2 - 1, y: rnd() * 2 - 1 }, { x: rnd() * 2 - 1, y: rnd() * 2 - 1 }]); if (u.p.some((p) => !Number.isFinite(p.x + p.y + p.vx + p.vy))) ok = false; }
  check(ok, 'sumo: physics stays finite');
}

// ---------- Tug of War ----------
{
  const t = newTapper();
  [0, 150, 300, 450, 600].forEach((at) => tugTap(t, at));
  check(t.n === 5 && t.bonus && t.p > 5, 'tug: a steady beat earns the rhythm bonus');
  const m = newTapper();
  [0, 150, 500, 520, 900].forEach((at) => tugTap(m, at));
  check(m.p === 5 && !m.bonus, 'tug: uneven taps earn no bonus');
  check(pullAt([[10, 1], [20, 2], [30, 3]], 25) === 2, 'tug: pull at a time');
  // threshold win, judged a grace period in the past
  const s = tugInit(0); s.ph = 'run';
  for (let k = 1; k <= WIN; k++) tugAddTap(s, 0, { r: s.r, p: k, at: s.S + k * 100 });
  const at = s.S + WIN * 100;
  check(tugJudge(s, at) === undefined, 'tug: not judged before the grace time');
  check(tugJudge(s, at + TUG_GRACE) === 0, 'tug: player 0 pulls the flag over the line');
  // a late-arriving tap (sent before the moment being judged) still counts
  const s2 = tugInit(0); s2.ph = 'run';
  for (let k = 1; k <= WIN - 1; k++) tugAddTap(s2, 0, { r: s2.r, p: k, at: s2.S + k * 100 });
  tugAddTap(s2, 1, { r: s2.r, p: 3, at: s2.S + 50 });
  check(tugJudge(s2, s2.S + 5000) === undefined, 'tug: 39 vs 3 is not over the line');
  // time runs out: the one ahead wins; taps stamped after the end are refused
  const s3 = tugInit(0); s3.ph = 'run';
  tugAddTap(s3, 0, { r: s3.r, p: 10, at: s3.S + 1000 }); tugAddTap(s3, 1, { r: s3.r, p: 12, at: s3.S + 2000 });
  check(!tugAddTap(s3, 0, { r: s3.r, p: 99, at: s3.S + ROUND_MS + 5 }), 'tug: a tap after the whistle is refused');
  check(tugJudge(s3, s3.S + ROUND_MS + TUG_GRACE) === 1, 'tug: ahead at the end wins');
  check(!tugAddTap(s3, 0, { r: s3.r + 1, p: 5, at: s3.S + 3000 }), 'tug: taps from another round are refused');
}

// ---------- Quick Draw ----------
{
  const s = qdInit(0, () => 0.5);
  qdTap(s, 0, { r: s.r, at: s.S - 100 });
  check(qdJudge(s, s.S) === undefined, 'quick draw: waits a grace time after a foul');
  check(qdJudge(s, s.S - 100 + QD_GRACE)?.w === 1, 'quick draw: an early tap is a foul');
  const t = qdInit(0, () => 0.2);
  qdTap(t, 1, { r: t.r, at: t.S + 180 }); qdTap(t, 0, { r: t.r, at: t.S + 240 });
  const j = qdJudge(t, t.S + 300);
  check(j && j.w === 1 && j.why === 'faster', 'quick draw: the quicker tap wins');
  check(!qdTap(t, 1, { r: t.r, at: t.S + 10 }), 'quick draw: only the first tap counts');
  const u = qdInit(0, () => 0.2);
  qdTap(u, 0, { r: u.r, at: u.S + 400 });
  check(qdJudge(u, u.S + 400 + QD_GRACE - 1) === undefined && qdJudge(u, u.S + 400 + QD_GRACE)?.w === 0, 'quick draw: a lone tap wins after the grace time');
  const v = qdInit(0, () => 0.2);
  check(qdJudge(v, v.S + 3000)?.why === 'none', 'quick draw: nobody tapping replays the round');
  // both foul: the earlier foul loses
  const f = qdInit(0, () => 0.2);
  qdTap(f, 1, { r: f.r, at: f.S - 300 }); qdTap(f, 0, { r: f.r, at: f.S - 100 });
  check(qdJudge(f, f.S)?.w === 0, 'quick draw: the earlier foul loses');
}

// ---------- clock estimate ----------
// The guest pings the host and keeps the fastest round trip, as rtd-kit's session does. With uneven
// one-way delays the estimate is off by at most half the difference, which should be small.
function estimateOffset(trueOffset, lat) {
  let best = Infinity, off = 0;
  for (let i = 0; i < 8; i++) {
    const go = lat(), back = lat(), c = 1000 + i * 300;     // guest clock when the ping is sent
    const h = c + trueOffset + go, now = c + go + back;      // host clock on arrival, guest clock on the reply
    const rtt = now - c;
    if (rtt < best) { best = rtt; off = h + rtt / 2 - now; }
  }
  return off;
}
{
  let worst = 0;
  for (let k = 0; k < 200; k++) {
    const trueOffset = (rnd() - 0.5) * 1e6;
    const est = estimateOffset(trueOffset, () => 40 + rnd() * 80);
    worst = Math.max(worst, Math.abs(est - trueOffset));
  }
  check(worst < 45, `clock estimate within 45 ms with 40 to 120 ms of jitter (worst ${worst.toFixed(1)} ms)`);
}

// ---------- host and guest over a delayed link ----------
// Runs a spec as the host and a guest copy fed by delayed snapshots; the guest's actions reach the
// host late too. bots(side, view, nowHost) return {input, acts} for each tick.
function runPair(spec, bots, { ticks = 60 * 240, lag = 7, jitter = 4, clockErr = 0 } = {}) {
  const s = spec.init();
  const toGuest = [], toHost = [];
  let gs, tick = 0, result = null, gResult = null;
  const inputs = [spec.input(), spec.input()];
  const deliverAt = () => tick + lag + Math.floor(rnd() * jitter);
  for (; tick < ticks; tick++) {
    const nowHost = tick * STEP;
    // guest messages arriving at the host, in order
    while (toHost.length && toHost[0].at <= tick) { const m = toHost.shift(); if (m.i) inputs[1] = m.i; if (m.a) spec.action(s, 1, m.a, () => {}); }
    const hb = bots(0, s, nowHost, true);
    inputs[0] = hb.input ?? inputs[0];
    (hb.acts || []).forEach((a) => spec.action(s, 0, typeof a === 'function' ? a(nowHost) : a, () => {}));
    spec.step(s, inputs, () => {}, nowHost);
    const x = spec.result(s);
    if (tick % 2 === 0) {
      const at = Math.max(deliverAt(), toGuest.length ? toGuest[toGuest.length - 1].at : 0);
      toGuest.push({ at, d: JSON.parse(JSON.stringify(spec.snap(s))), x });
    }
    while (toGuest.length && toGuest[0].at <= tick) { const m = toGuest.shift(); gs = spec.apply(gs, m.d, nowHost); if (m.x) gResult = m.x; }
    if (gs) {
      // the guest's estimate of the host clock is off by clockErr
      const gb = bots(1, gs.cur || gs, nowHost + clockErr, false);
      const at = () => Math.max(deliverAt(), toHost.length ? toHost[toHost.length - 1].at : 0);
      if (gb.input) toHost.push({ at: at(), i: JSON.parse(JSON.stringify(gb.input)) });
      (gb.acts || []).forEach((a) => toHost.push({ at: at(), a: JSON.parse(JSON.stringify(typeof a === 'function' ? a(nowHost + clockErr) : a)) }));
    }
    if (x) result = x;
    if (result && gResult) break;
  }
  return { s, gs, result, gResult, tick };
}

const agree = (name, r, key = 'sc') => {
  check(!!r.result, `${name}: the match finishes (stopped at tick ${r.tick})`);
  check(!!r.gResult, `${name}: the guest learns the result`);
  const g = r.gs && (r.gs.cur || r.gs);
  check(r.result && r.gResult && r.result.winner === r.gResult.winner, `${name}: both phones agree on the winner`);
  check(g && JSON.stringify(g[key]) === JSON.stringify(r.s[key]), `${name}: both phones show the same score ${JSON.stringify(r.s[key])} / ${JSON.stringify(g && g[key])}`);
};

// Light Cycles: both riders turn at random now and then, steering away from the edge
{
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  const bot = (side, v) => {
    if (!v.p || v.ph !== 'run' || rnd() > 0.06) return {};
    const p = v.p[side]; let d = Math.floor(rnd() * 4);
    const nx = p.x + DX[d] * 3, ny = p.y + DY[d] * 3;
    if (nx < 1 || ny < 1 || nx >= GW - 1 || ny >= GH - 1) d = (d + 1) % 4;
    return { acts: [{ d }] };
  };
  for (let k = 0; k < 4; k++) agree('Light Cycles', runPair(cyclesSpec, bot, { ticks: 60 * 600 }));
}
// Sumo: both chase each other and dash sometimes
{
  const bot = (side, v) => {
    if (!v.p) return {};
    const a = v.p[side], b = v.p[1 - side];
    const dx = b.x - a.x + (rnd() - 0.5) * 0.3, dy = b.y - a.y + (rnd() - 0.5) * 0.3, l = Math.hypot(dx, dy) || 1;
    return { input: { x: +(dx / l).toFixed(2), y: +(dy / l).toFixed(2) }, acts: rnd() < 0.01 ? [{ k: 'dash' }] : [] };
  };
  for (let k = 0; k < 4; k++) agree('Sumo Bumpers', runPair(sumoSpec, bot, { ticks: 60 * 600 }));
}
// Tug of War: each side taps at its own rate, stamping taps with its view of the host clock
{
  for (const err of [0, 25, -25]) {
    const tap = [newTapper(), newTapper()], round = [0, 0];
    const rate = [0.11, 0.1];
    const spec = tugSpec(() => 0);
    const bot = (side, v, now) => {
      if (v.ph !== 'run' && v.ph !== 'count') return {};
      if (v.r !== round[side]) { round[side] = v.r; tap[side] = newTapper(); }
      if (now < v.S || now > v.S + ROUND_MS || rnd() > rate[side]) return {};
      const p = tugTap(tap[side], now);
      return { acts: [{ k: 'tap', r: v.r, p, at: now }] };
    };
    agree(`Tug of War (clock error ${err} ms)`, runPair(spec, bot, { ticks: 60 * 200, clockErr: err }));
  }
}
// Quick Draw: the guest reacts in 200 ms and the host in 260 ms; despite the lag the guest should win most rounds
{
  const spec = quickdrawSpec(() => 0, () => rnd());
  const tapped = [0, 0];
  const react = [260, 200];
  const bot = (side, v, now) => {
    if (v.ph !== 'wait' || tapped[side] === v.r || now < v.S + react[side]) return {};
    tapped[side] = v.r;
    return { acts: [{ k: 'tap', r: v.r, at: now }] };
  };
  const r = runPair(spec, bot, { ticks: 60 * 240, lag: 9, jitter: 3, clockErr: 15 });
  agree('Quick Draw', r);
  check(r.result && r.result.winner === 1, 'Quick Draw: the quicker guest wins despite the lag');
}
// Penalty: shooters pick a random corner; keepers guess a side and dive
{
  const bot = (side, v) => {
    if (v.ph !== 'aim' && v.ph !== 'fly') return {};
    const sh = shooterOf(v);
    if (side === sh) return v.ph === 'aim' && v.aimT > 40 && rnd() < 0.05 ? { acts: [{ k: 'shot', ex: +(rnd() * 1.6 - 0.8).toFixed(2), eh: +(rnd() * 0.5).toFixed(2), T: 0.8, c: 0 }] } : {};
    const tx = rnd() < 0.5 ? -0.4 : 0.4;
    return { input: { x: tx }, acts: v.ph === 'fly' && rnd() < 0.08 ? [{ k: 'dive', x: tx, y: 0.3 }] : [] };
  };
  for (let k = 0; k < 4; k++) agree('Penalty Shootout', runPair(penaltySpec(k % 2), bot, { ticks: 60 * 600 }), 'goals');
}

// ---------- Penalty rules ----------
{
  const centre = { ex: 0, eh: 0.3, T: 0.8, c: 0 };
  check(judgeShot(centre, 0, null) === 'save', 'penalty: a central shot hits a central keeper');
  const corner = { ex: 0.85, eh: 0.5, T: 0.8, c: 0 };
  check(judgeShot(corner, 0, null) === 'goal', 'penalty: a top corner beats a keeper who stays put');
  check(judgeShot(corner, 0.3, { vx: 0.7, vy: 0.5, p: 1 }) === 'save', 'penalty: a good dive saves the top corner');
  check(judgeShot({ ex: 0.25, eh: 0.44, T: 0.8, c: 0 }, 0, null) === 'save', 'penalty: a standing keeper saves with an outstretched arm');
  check(judgeShot({ ex: 0.3, eh: 0.12, T: 0.8, c: 0 }, 0, null) === 'goal', 'penalty: low past a standing keeper is a goal');
  check(judgeShot({ ex: 1.5, eh: 0.2, T: 0.8, c: 0 }, 0, null) === 'wide', 'penalty: wide');
  check(judgeShot({ ex: 0.2, eh: BAR + 0.2, T: 0.8, c: 0 }, 0, null) === 'over', 'penalty: over the bar');
  check(judgeShot({ ex: 0.98, eh: 0.3, T: 0.8, c: 0 }, 0, null) === 'post', 'penalty: off the post');
  check(judgeShot({ ex: -0.7, eh: 0.15, T: 0.8, c: 0.8 }, -0.7, null) === 'save', 'penalty: curl that ends on the keeper is saved');
  const sw = shotFromSwipe({ x: 200, y: 700 }, { x: 200, y: 400 }, 0, 250, 400, 800);
  check(sw && Math.abs(sw.ex) < 0.01 && sw.eh > 0 && sw.eh < BAR, 'penalty: a straight medium swipe goes straight on target');
  check(shotFromSwipe({ x: 200, y: 700 }, { x: 205, y: 690 }, 0, 100, 400, 800) === null, 'penalty: a tiny swipe is not a shot');
  const hard = shotFromSwipe({ x: 200, y: 700 }, { x: 200, y: 150 }, 0, 120, 400, 800);
  check(hard.eh > BAR, 'penalty: a very long swipe sails over');
  check(penWinner([3, 0], [3, 3]) === 0, 'penalty: 3-0 after three each cannot be caught');
  check(penWinner([3, 1], [3, 3]) === undefined, 'penalty: 3-1 after three each goes on');
  check(penWinner([4, 4], [5, 5]) === undefined, 'penalty: level after five each goes to sudden death');
  check(penWinner([5, 4], [6, 6]) === 0, 'penalty: sudden death decided after a pair');
  check(penWinner([5, 4], [6, 5]) === undefined, 'penalty: sudden death waits for the pair');
  const s = penInit(1);
  check(shooterOf(s) === 1, 'penalty: first shooter follows ctx.first');
  check(!penShoot(s, 1, centre), 'penalty: no shot in the first half second of a kick');
  for (let i = 0; i < 31; i++) penTick(s, 0);
  check(!penShoot(s, 0, centre) && penShoot(s, 1, centre), 'penalty: only the shooter can shoot');
  check(penDive(s, 0, { x: 1, y: 0.2 }) && !penDive(s, 0, { x: -1, y: 0 }), 'penalty: one dive per kick');
  let res = null; for (let i = 0; i < 120 && !res; i++) res = penTick(s, 0);
  check(!!res, 'penalty: the ball reaches the line');
}

console.log(`${pass} checks passed, ${fail} failed`);
if (fail) process.exit(1);
console.log('All Play Together real-time checks (fork D) passed');
