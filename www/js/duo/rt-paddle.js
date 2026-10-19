// Paddle Ball simulation (no browser dependencies). Player 0's bat is at the bottom, player 1's at the top.
export const W = 1, H = 1.6, BR = 0.022, BAT_T = 0.026, BAT_Y = [H - 0.09, 0.09], HW = 0.11, WIDE = 0.18, WIN = 11, MAXBALLS = 3;
const DT = 1 / 60, BAT_SPEED = 3.6, BASE = 0.95, TOP = 2.5;

export function newPaddle(rand = Math.random) {
  return {
    rand,
    bat: [{ x: W / 2, vx: 0, wide: 0 }, { x: W / 2, vx: 0, wide: 0 }],
    balls: [], score: [0, 0], serve: { to: 0, wait: 70 }, pu: null, puWait: 420, steps: 0, rally: 0,
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const batHalf = (b) => (b.wide > 0 ? WIDE : HW);

function launch(s, x, y, dirY, speed) {
  const a = (s.rand() - 0.5) * 0.8;
  s.balls.push({ x, y, vx: Math.sin(a) * speed, vy: Math.cos(a) * speed * dirY, spin: 0, sp: speed, last: -1 });
}

// inputs[i]: {x} target, or null.
export function stepPaddle(s, inputs, ev) {
  s.steps++;
  for (let i = 0; i < 2; i++) {
    const b = s.bat[i], t = inputs[i], hw = batHalf(b), ox = b.x;
    if (t && Number.isFinite(t.x)) { const tx = clamp(t.x, hw, W - hw), d = tx - b.x, mx = BAT_SPEED * DT; b.x += Math.abs(d) > mx ? Math.sign(d) * mx : d; }
    b.x = clamp(b.x, hw, W - hw);
    b.vx = (b.x - ox) / DT;
    if (b.wide > 0 && --b.wide === 0) ev.push({ k: 'shrink', p: i });
  }
  if (!s.balls.length) {
    if (s.serve.wait > 0) { s.serve.wait--; return; }
    launch(s, W / 2, H / 2, s.serve.to === 0 ? 1 : -1, BASE);
    s.rally = 0;
    ev.push({ k: 'serve' });
  }
  // power-ups appear in the middle of the table now and then
  if (!s.pu && --s.puWait <= 0) {
    s.pu = { k: s.rand() < 0.5 ? 'wide' : 'multi', x: 0.15 + s.rand() * 0.7, y: H / 2 + (s.rand() - 0.5) * 0.4, t: 600 };
    ev.push({ k: 'pu' });
  }
  if (s.pu && --s.pu.t <= 0) { s.pu = null; s.puWait = 480 + Math.floor(s.rand() * 300); }
  for (let bi = s.balls.length - 1; bi >= 0; bi--) {
    const ball = s.balls[bi];
    ball.vx += ball.spin * DT; ball.spin *= 0.985;
    // keep the ball moving mostly up and down the table
    const sp = Math.hypot(ball.vx, ball.vy), minVy = sp * 0.42;
    if (Math.abs(ball.vy) < minVy) { ball.vy = Math.sign(ball.vy || 1) * minVy; const f = Math.sqrt(Math.max(0, sp * sp - minVy * minVy)); ball.vx = Math.sign(ball.vx || 1) * f; }
    for (let k = 0; k < 3; k++) {
      const dt = DT / 3;
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      if (ball.x < BR) { ball.x = BR; ball.vx = Math.abs(ball.vx); ball.spin *= -0.5; ev.push({ k: 'wall' }); }
      if (ball.x > W - BR) { ball.x = W - BR; ball.vx = -Math.abs(ball.vx); ball.spin *= -0.5; ev.push({ k: 'wall' }); }
      for (let i = 0; i < 2; i++) {
        const b = s.bat[i], hw = batHalf(b), by = BAT_Y[i], toward = i === 0 ? ball.vy > 0 : ball.vy < 0;
        if (!toward) continue;
        const face = i === 0 ? by - BAT_T / 2 - BR : by + BAT_T / 2 + BR;
        const crossed = i === 0 ? ball.y >= face && ball.y <= by + BAT_T : ball.y <= face && ball.y >= by - BAT_T;
        if (crossed && Math.abs(ball.x - b.x) <= hw + BR * 0.6) {
          const off = clamp((ball.x - b.x) / hw, -1, 1), ang = off * 1.0;
          ball.sp = Math.min(TOP, ball.sp * 1.05);
          ball.vx = Math.sin(ang) * ball.sp + b.vx * 0.22;
          ball.vy = Math.cos(ang) * ball.sp * (i === 0 ? -1 : 1);
          ball.spin = clamp(b.vx * 0.9, -3, 3);
          ball.y = face; ball.last = i; s.rally++;
          ev.push({ k: 'hit', p: i, v: Math.round(ball.sp * 100) / 100, s: Math.abs(ball.spin) > 0.8 ? 1 : 0 });
        }
      }
      if (s.pu && Math.hypot(ball.x - s.pu.x, ball.y - s.pu.y) < BR + 0.045 && ball.last >= 0) collect(s, ball, ev);
    }
    if (ball.y > H + BR * 2 || ball.y < -BR * 2) {
      const scorer = ball.y > H ? 1 : 0;
      s.balls.splice(bi, 1);
      s.score[scorer]++;
      ev.push({ k: 'point', p: scorer });
      if (!s.balls.length) s.serve = { to: scorer === 0 ? 1 : 0, wait: 70 };
    }
  }
}
function collect(s, ball, ev) {
  const p = ball.last, k = s.pu.k;
  if (k === 'wide') s.bat[p].wide = 480;
  else {
    for (const turn of [-0.45, 0.45]) {
      if (s.balls.length >= MAXBALLS) break;
      const c = Math.cos(turn), sn = Math.sin(turn);
      s.balls.push({ x: ball.x, y: ball.y, vx: ball.vx * c - ball.vy * sn, vy: ball.vx * sn + ball.vy * c, spin: 0, sp: ball.sp, last: p });
    }
  }
  ev.push({ k: 'get', p, w: k });
  s.pu = null; s.puWait = 480 + Math.floor(s.rand() * 300);
}
export const paddleOver = (s) => (s.score[0] >= WIN ? 0 : s.score[1] >= WIN ? 1 : null);
const q4 = (v) => Math.round(v * 1e4) / 1e4;
export function packPaddle(s) {
  const n = [q4(s.bat[0].x), q4(s.bat[1].x)];
  for (let i = 0; i < MAXBALLS; i++) { const b = s.balls[i]; n.push(b ? q4(b.x) : -9, b ? q4(b.y) : -9); }
  return { n, q: [s.score[0], s.score[1], s.bat[0].wide > 0 ? 1 : 0, s.bat[1].wide > 0 ? 1 : 0, s.pu ? [s.pu.k, q4(s.pu.x), q4(s.pu.y)] : 0, s.balls.length ? 0 : s.serve.to] };
}
