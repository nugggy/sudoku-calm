// Checks the real-time Play Together games: Air Hockey and Paddle Ball physics stay sane over long
// random games, Tank Duel shots are deterministic, and a host and guest linked over a laggy pretend
// connection finish a whole game agreeing on the score. Run with: node tools/test-duo-rt.mjs
import { mulberry32 } from '../www/js/sudoku-engine.js';
import * as HK from '../www/js/duo/rt-hockey.js';
import * as PD from '../www/js/duo/rt-paddle.js';
import * as TK from '../www/js/duo/rt-tanks.js';
import { syncLoop } from '../www/js/duo/rt-kit.js';

let fail = 0, checks = 0;
const check = (ok, msg) => { checks++; if (!ok) { fail++; console.log('FAIL', msg); } };
const t0 = Date.now();

// ---------- Air Hockey ----------
{
  const rnd = mulberry32(7);
  let goals = 0, games = 0, maxSteps = 0;
  for (let g = 0; g < 30; g++) {
    const s = HK.newHockey(g % 2);
    const tgt = [{ x: 0.5, y: 1.4 }, { x: 0.5, y: 0.2 }];
    let ev = [], evGoals = 0, n = 0;
    while (HK.hockeyOver(s) === null && n < 60 * 60 * 15) {
      // chase the puck with some noise, like a keen player
      for (let i = 0; i < 2; i++) if (n % 6 === 0) tgt[i] = { x: s.puck.x + (rnd() - 0.5) * 0.3, y: s.puck.y + (i === 0 ? 0.06 : -0.06) + (rnd() - 0.5) * 0.2 };
      ev = [];
      HK.stepHockey(s, tgt, ev);
      evGoals += ev.filter((e) => e.k === 'goal').length;
      const p = s.puck, mouth = Math.abs(p.x - HK.W / 2) < HK.GOAL / 2;
      if (!(p.x >= HK.PR - 1e-9 && p.x <= HK.W - HK.PR + 1e-9)) { check(false, `hockey puck x out of bounds ${p.x}`); break; }
      if (!mouth && !(p.y >= HK.PR - 1e-9 && p.y <= HK.H - HK.PR + 1e-9)) { check(false, `hockey puck y through the wall ${p.y} at x ${p.x}`); break; }
      if (Math.hypot(p.vx, p.vy) > 3.31) { check(false, 'hockey puck over the speed cap'); break; }
      for (let i = 0; i < 2; i++) { const m = s.m[i]; if (i === 0 ? m.y < HK.H / 2 : m.y > HK.H / 2) { check(false, `mallet ${i} left its half`); break; } }
      n++;
    }
    games++; goals += evGoals; maxSteps = Math.max(maxSteps, n);
    check(evGoals === s.score[0] + s.score[1], `hockey game ${g}: goal events ${evGoals} match score ${s.score}`);
  }
  // a straight shot into the top goal scores for player 0
  const s = HK.newHockey(0); s.pause = 0; s.puck = { x: 0.5, y: 0.5, vx: 0, vy: -2.5 };
  for (let i = 0; i < 120; i++) HK.stepHockey(s, [null, { x: 0.05, y: 0.1 }], []);
  check(s.score[0] === 1 && s.score[1] === 0, 'hockey: straight shot scores for player 0');
  // a shot into the side of the top wall bounces back
  const b = HK.newHockey(0); b.pause = 0; b.puck = { x: 0.1, y: 0.5, vx: 0, vy: -2.5 };
  for (let i = 0; i < 30; i++) HK.stepHockey(b, [null, { x: 0.9, y: 0.1 }], []);
  check(b.score[0] === 0 && b.puck.vy > 0, 'hockey: shot beside the goal bounces off the end wall');
  console.log(`Air Hockey: ${games} random games, ${goals} goals, longest ${(maxSteps / 60).toFixed(0)} s`);
}

// ---------- Paddle Ball ----------
{
  let games = 0, points = 0, pus = 0;
  for (let g = 0; g < 20; g++) {
    const rnd = mulberry32(100 + g), s = PD.newPaddle(rnd);
    let n = 0, evPoints = 0;
    while (PD.paddleOver(s) === null && n < 60 * 60 * 20) {
      // each bat tracks the nearest ball heading its way, imperfectly
      const tg = [0, 1].map((i) => {
        const b = s.balls.filter((x) => (i === 0 ? x.vy > 0 : x.vy < 0)).sort((a, c) => (i === 0 ? c.y - a.y : a.y - c.y))[0];
        return { x: b ? b.x + (rnd() - 0.5) * 0.28 : 0.5 };
      });
      const ev = [];
      PD.stepPaddle(s, tg, ev);
      evPoints += ev.filter((e) => e.k === 'point').length; pus += ev.filter((e) => e.k === 'get').length;
      for (const b of s.balls) if (b.x < PD.BR - 1e-9 || b.x > PD.W - PD.BR + 1e-9) { check(false, `paddle ball x out of bounds ${b.x}`); break; }
      check(s.balls.length <= PD.MAXBALLS, 'paddle: too many balls');
      n++;
    }
    games++; points += evPoints;
    check(PD.paddleOver(s) !== null, `paddle game ${g} finished`);
    check(evPoints === s.score[0] + s.score[1], `paddle game ${g}: point events match score`);
  }
  check(pus > 0, 'paddle: power-ups were collected at least once');
  console.log(`Paddle Ball: ${games} random games, ${points} points, ${pus} power-ups collected`);
}

// ---------- Tank Duel ----------
{
  const a = TK.newTanks(mulberry32(42), 0), b = TK.newTanks(mulberry32(42), 0);
  check(JSON.stringify(a) === JSON.stringify(b), 'tanks: same seed builds the same battlefield');
  check(TK.hashTanks(TK.newTanks(mulberry32(43), 0)) !== TK.hashTanks(a), 'tanks: different seeds give different hills');
  // the same shots give the same results on two copies
  const rnd = mulberry32(5);
  let hits = 0;
  for (let k = 0; k < 40 && !TK.tanksOver(a); k++) {
    const shot = { a: a.turn === 0 ? 20 + rnd() * 60 : 100 + rnd() * 60, p: 0.4 + rnd() * 0.6, w: ['shell', 'big', 'bounce'][k % 3] };
    const wind = Math.round((rnd() * 2 - 1) * 100) / 100;
    const ra = TK.fire(a, shot), rb = TK.fire(b, shot);
    a.wind = wind; b.wind = wind;
    check(JSON.stringify(ra) === JSON.stringify(rb) && TK.hashTanks(a) === TK.hashTanks(b), `tanks: shot ${k} is deterministic`);
    if (ra.damage.some((d) => d > 0)) hits++;
    // packing and unpacking keeps the state
    const c = TK.newTanks(mulberry32(1), 0); TK.unpackTanks(c, TK.packTanks(a));
    check(TK.hashTanks(c) === TK.hashTanks(a), `tanks: pack and unpack round trip after shot ${k}`);
  }
  // craters lower the ground and a well-aimed shell damages the other tank
  const s = TK.newTanks(mulberry32(9), 0); s.wind = 0;
  let found = null;
  for (let ang = 20; ang <= 80 && !found; ang += 1) for (let p = 0.3; p <= 1 && !found; p += 0.01) {
    const c = JSON.parse(JSON.stringify(s)), r = TK.fire(c, { a: ang, p, w: 'shell' });
    if (r.damage[1] > 0) found = { ang, p, r, c };
  }
  check(!!found, 'tanks: some shot hits the other tank with no wind');
  if (found) {
    const [x] = found.r.path[found.r.path.length - 1], i = Math.round(Math.max(0, Math.min(1, x)) * (TK.COLS - 1));
    check(found.c.h[i] < s.h[i] || found.r.hit === 'tank', 'tanks: the blast digs a crater');
    check(found.c.tanks[1].hp < TK.HP && found.c.turn === 1, 'tanks: damage taken and the turn passes');
  }
  console.log(`Tank Duel: deterministic over ${a.shots} shots (${hits} hit), hit search ${found ? `found ${found.ang} degrees` : 'failed'}`);
}

// ---------- Host and guest over a laggy link ----------
// A pretend pair of phones: messages arrive 60 to 120 ms late with jitter, in order (like TCP).
function linkedPair(seed) {
  const rnd = mulberry32(seed);
  let now = 0;
  const queue = [], rafs = [[], []];
  const ends = [null, null], listeners = [[], []];
  let lastDeliver = [0, 0];
  const mk = (me) => ({
    me, local: false, isHost: me === 0, first: 0, names: ['Ana', 'Ben'],
    send(obj) { const to = 1 - me, at = Math.max(lastDeliver[to], now + 60 + rnd() * 60); lastDeliver[to] = at; queue.push({ at, to, msg: JSON.parse(JSON.stringify(obj)) }); },
    onMsg(fn) { listeners[me].push(fn); return () => { listeners[me] = listeners[me].filter((f) => f !== fn); }; },
    end(r) { if (!ends[me]) ends[me] = r; },
    alive: () => true,
  });
  const env = (me) => ({ now: () => now, raf: (f) => { rafs[me].push(f); return rafs[me].length; }, caf: () => {}, later: (f, ms) => queue.push({ at: now + ms, fn: f }) });
  function run(ms) {
    const until = now + ms;
    while (now < until) {
      now += 1000 / 60 + (rnd() - 0.5) * 4;   // slightly uneven frames
      queue.sort((x, y) => x.at - y.at);
      while (queue.length && queue[0].at <= now) { const q = queue.shift(); if (q.fn) q.fn(); else listeners[q.to].forEach((f) => f(q.msg)); }
      for (const me of [0, 1]) { const fs = rafs[me]; rafs[me] = []; fs.forEach((f) => f(now)); }
    }
  }
  return { ctx: [mk(0), mk(1)], env, run, ends, get now() { return now; } };
}

{
  const L = linkedPair(3);
  const state = HK.newHockey(0);
  const rnd = mulberry32(11);
  let guestView = null, hostTarget = { x: 0.5, y: 1.4 }, guestTarget = { x: 0.5, y: 0.2 }, frames = 0;
  const common = { step: HK.stepHockey, pack: HK.packHockey, onEvent() {}, over: (s) => { const w = HK.hockeyOver(s); return w === null ? null : { winner: w, text: `${['Ana', 'Ben'][w]} wins ${s.score[w]} to ${s.score[1 - w]}` }; } };
  const host = syncLoop(L.ctx[0], { ...common, state, input: () => hostTarget, render() { frames++; } }, L.env(0));
  const guest = syncLoop(L.ctx[1], { ...common, state: null, input: () => guestTarget, render(v) { if (v) guestView = v; } }, L.env(1));
  for (let k = 0; k < 60 * 15 && !(L.ends[0] && L.ends[1]); k++) {
    // both players chase the puck; the guest only knows the puck from its snapshots
    hostTarget = { x: state.puck.x + (rnd() - 0.5) * 0.25, y: state.puck.y + 0.05 };
    if (guestView) guestTarget = { x: guestView.n[0] + (rnd() - 0.5) * 0.25, y: guestView.n[1] - 0.05 };
    L.run(1000);
  }
  host.stop(); guest.stop();
  check(!!L.ends[0] && !!L.ends[1], 'linked hockey: both phones reached the end');
  check(JSON.stringify(L.ends[0]) === JSON.stringify(L.ends[1]), `linked hockey: both phones agree on the result (${L.ends[0]?.text} / ${L.ends[1]?.text})`);
  check(guestView && guestView.q[0] === state.score[0] && guestView.q[1] === state.score[1], `linked hockey: guest shows the final score ${state.score} (guest ${guestView?.q})`);
  check(state.steps > 0 && Math.abs(state.steps / 60 - L.now / 1000) < 1.5, 'linked hockey: host ran at 60 steps a second');
  console.log(`Linked Air Hockey: ${L.ends[0]?.text} after ${(L.now / 1000).toFixed(0)} s of play, ${frames} host frames`);
}
{
  const L = linkedPair(8);
  const state = PD.newPaddle(mulberry32(4));
  let guestView = null, hx = 0.5, gx = 0.5;
  const common = { step: PD.stepPaddle, pack: PD.packPaddle, onEvent() {}, over: (s) => { const w = PD.paddleOver(s); return w === null ? null : { winner: w, text: `${w} wins ${s.score[w]} to ${s.score[1 - w]}` }; } };
  const host = syncLoop(L.ctx[0], { ...common, state, input: () => ({ x: hx }), render() {} }, L.env(0));
  const guest = syncLoop(L.ctx[1], { ...common, state: null, input: () => ({ x: gx }), render(v) { if (v) guestView = v; } }, L.env(1));
  const rnd = mulberry32(12);
  for (let k = 0; k < 60 * 20 && !(L.ends[0] && L.ends[1]); k++) {
    const b = state.balls[0]; hx = b ? b.x + (rnd() - 0.5) * 0.3 : 0.5;
    if (guestView && guestView.n[2] > -5) gx = guestView.n[2] + (rnd() - 0.5) * 0.3;
    L.run(250);
  }
  host.stop(); guest.stop();
  check(JSON.stringify(L.ends[0]) === JSON.stringify(L.ends[1]) && !!L.ends[0], 'linked paddle: both phones agree on the result');
  check(guestView && guestView.q[0] === state.score[0] && guestView.q[1] === state.score[1], 'linked paddle: guest shows the final score');
  console.log(`Linked Paddle Ball: ${L.ends[0]?.text} after ${(L.now / 1000).toFixed(0)} s`);
}
{
  // Tank Duel over the link: the guest replays the host's shots and must end identical.
  const A = TK.newTanks(mulberry32(77), 0), B = TK.newTanks(mulberry32(77), 0);
  const rnd = mulberry32(13);
  let n = 0;
  // a simple aiming player: tries a spread of shots on a copy and fires the best one, with some error
  const aim = (S) => {
    let best = null;
    for (let k = 0; k < 60; k++) {
      const shot = { a: S.turn === 0 ? 15 + rnd() * 65 : 100 + rnd() * 65, p: 0.3 + rnd() * 0.7, w: ['shell', 'big', 'bounce'][k % 3] };
      const c = JSON.parse(JSON.stringify(S)); c.tanks.forEach((t) => { t.stock.big = 9; t.stock.bounce = 9; });
      const r = TK.fire(c, shot), d = r.damage[1 - S.turn] - r.damage[S.turn];
      if (!best || d > best.d) best = { shot, d };
    }
    return best.shot;
  };
  while (!TK.tanksOver(A) && n < 200) {
    const shot = aim(A);
    TK.fire(A, shot); A.wind = Math.round((rnd() * 2 - 1) * 100) / 100;
    const msg = JSON.parse(JSON.stringify({ shot, after: TK.packTanks(A) }));
    TK.fire(B, msg.shot); TK.unpackTanks(B, msg.after);
    check(TK.hashTanks(A) === TK.hashTanks(B), `linked tanks: in step after shot ${n}`);
    n++;
  }
  check(!!TK.tanksOver(A) && JSON.stringify(TK.tanksOver(A)) === JSON.stringify(TK.tanksOver(B)), 'linked tanks: both phones agree who won');
  console.log(`Linked Tank Duel: finished after ${n} shots, winner ${TK.tanksOver(A)?.winner}`);
}

console.log(`${checks} checks, ${fail} failed, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (fail) process.exit(1);
console.log('All real-time Play Together checks passed');
