// Air Hockey simulation (no browser dependencies). Player 0 defends the bottom goal, player 1 the top.
export const W = 1, H = 1.6, GOAL = 0.34, MR = 0.072, PR = 0.042, WIN = 7;
const MAXV = 3.3, MSPEED = 4.2, SUB = 4, DT = 1 / 60;

export function newHockey(serveTo = 0) {
  const s = {
    puck: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
    m: [{ x: W / 2, y: H - 0.18, vx: 0, vy: 0 }, { x: W / 2, y: 0.18, vx: 0, vy: 0 }],
    score: [0, 0], pause: 40, steps: 0,
  };
  placePuck(s, serveTo);
  return s;
}
// The puck waits in the half of the player who serves (the one who just conceded).
function placePuck(s, p) {
  s.puck.x = W / 2; s.puck.y = p === 0 ? H * 0.68 : H * 0.32; s.puck.vx = 0; s.puck.vy = 0;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function limits(p) {
  return p === 0 ? [MR, W - MR, H / 2 + MR * 0.6, H - MR] : [MR, W - MR, MR, H / 2 - MR * 0.6];
}

// Moves player i's mallet towards target t at a capped speed (also used by the guest to predict its own mallet).
export function moveMallet(m, t, i) {
  const [x0, x1, y0, y1] = limits(i), ox = m.x, oy = m.y;
  if (t && Number.isFinite(t.x) && Number.isFinite(t.y)) {
    const tx = clamp(t.x, x0, x1), ty = clamp(t.y, y0, y1), dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy), mx = MSPEED * DT;
    if (d > mx) { m.x += (dx / d) * mx; m.y += (dy / d) * mx; } else { m.x = tx; m.y = ty; }
  }
  m.x = clamp(m.x, x0, x1); m.y = clamp(m.y, y0, y1);
  m.vx = (m.x - ox) / DT; m.vy = (m.y - oy) / DT;
}
// inputs[i]: {x, y} target in world units, or null to stay put.
export function stepHockey(s, inputs, ev) {
  s.steps++;
  for (let i = 0; i < 2; i++) moveMallet(s.m[i], inputs[i], i);
  if (s.pause > 0) { s.pause--; return; }
  const p = s.puck;
  for (let k = 0; k < SUB; k++) {
    const dt = DT / SUB;
    p.x += p.vx * dt; p.y += p.vy * dt;
    // mallets first, then the walls, so a mallet can never push the puck through a wall
    for (let i = 0; i < 2; i++) { const m = s.m[i]; bounce(p, m.x, m.y, MR, m.vx, m.vy, 0.92, ev, 'hit', i); }
    // side walls
    if (p.x < PR) { p.x = PR; if (p.vx < 0) { p.vx = -p.vx * 0.9; ev.push({ k: 'wall', v: r2(Math.abs(p.vx)) }); } }
    if (p.x > W - PR) { p.x = W - PR; if (p.vx > 0) { p.vx = -p.vx * 0.9; ev.push({ k: 'wall', v: r2(Math.abs(p.vx)) }); } }
    const inMouth = Math.abs(p.x - W / 2) < GOAL / 2 - PR * 0.3;
    // end walls, open at the goal mouth
    if (!inMouth) {
      if (p.y < PR) { p.y = PR; if (p.vy < 0) { p.vy = -p.vy * 0.9; ev.push({ k: 'wall', v: r2(Math.abs(p.vy)) }); } }
      if (p.y > H - PR) { p.y = H - PR; if (p.vy > 0) { p.vy = -p.vy * 0.9; ev.push({ k: 'wall', v: r2(Math.abs(p.vy)) }); } }
    } else {
      // goal posts are round corners
      for (const px of [W / 2 - GOAL / 2, W / 2 + GOAL / 2]) for (const py of [0, H]) bounce(p, px, py, 0, 0, 0, 0.85, ev, 'wall');
    }
    // if a mallet still overlaps the puck (pinned against a wall), the mallet gives way, so the puck never gets stuck
    for (let i = 0; i < 2; i++) {
      const m = s.m[i], dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy), min = MR + PR;
      if (d < min && d > 0) { const [x0, x1, y0, y1] = limits(i); m.x = clamp(p.x + (dx / d) * min, x0, x1); m.y = clamp(p.y + (dy / d) * min, y0, y1); }
    }
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > MAXV) { p.vx *= MAXV / sp; p.vy *= MAXV / sp; }
    if (p.y < -PR) { goal(s, 0, ev); return; }
    if (p.y > H + PR) { goal(s, 1, ev); return; }
  }
  p.vx *= 0.9975; p.vy *= 0.9975;
  // a puck stuck in a corner gets a tiny nudge towards the middle
  if (Math.hypot(p.vx, p.vy) < 0.02) { p.vx += (W / 2 - p.x) * 0.002; }
}
function r2(v) { return Math.round(v * 100) / 100; }
// Circle-circle bounce of the puck off a body at (bx, by) with radius br moving at (bvx, bvy).
function bounce(p, bx, by, br, bvx, bvy, e, ev, kind, who) {
  const dx = p.x - bx, dy = p.y - by, d = Math.hypot(dx, dy), min = br + PR;
  if (d >= min || d === 0) return;
  const nx = dx / d, ny = dy / d;
  p.x = bx + nx * min; p.y = by + ny * min;
  const rvx = p.vx - bvx, rvy = p.vy - bvy, vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    p.vx -= (1 + e) * vn * nx; p.vy -= (1 + e) * vn * ny;
    ev.push(kind === 'hit' ? { k: 'hit', v: r2(-vn), p: who } : { k: 'wall', v: r2(-vn) });
  }
}
function goal(s, scorer, ev) {
  s.score[scorer]++;
  ev.push({ k: 'goal', p: scorer });
  s.pause = 70;
  placePuck(s, scorer === 0 ? 1 : 0);
}
export const hockeyOver = (s) => (s.score[0] >= WIN ? 0 : s.score[1] >= WIN ? 1 : null);
export const packHockey = (s) => ({ n: [s.puck.x, s.puck.y, s.m[0].x, s.m[0].y, s.m[1].x, s.m[1].y].map((v) => Math.round(v * 1e4) / 1e4), q: [s.score[0], s.score[1], s.pause > 0 ? 1 : 0] });
