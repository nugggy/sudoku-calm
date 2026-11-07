// 8 Ball pool: table, ball physics, rules and the computer player (no browser dependencies, so
// tools/test-pool.mjs runs it in Node). World units: the cloth is W x H, x to the right, y down the
// table. The break (head) end is at the bottom and the rack sits at the top.
// While balls move only + - * / and Math.sqrt are used (all exactly rounded in IEEE maths), so the same
// shot gives the same result on any phone. The two-phone game still sends the host's final layout after
// each shot as the last word (see g-pool.js).
export const W = 1, H = 2, R = 0.034, RAIL = 0.085;
export const HEAD = H * 0.75, FOOT = H * 0.25; // the break is played from below the head string; the rack's front ball sits on the foot spot
export const DT = 1 / 120;
const SUB = 4, DECEL = 0.85, STOP = 0.004, BALL_E = 0.95, RAIL_E = 0.75, MAXV = 5.5, MAX_STEPS = 120 * 40;
export const SOLID = 's', STRIPE = 't';
export const groupOf = (n) => (n > 0 && n < 8 ? SOLID : n > 8 ? STRIPE : null);
export const other = (g) => (g === SOLID ? STRIPE : SOLID);
// Standard colours: 1 yellow, 2 blue, 3 red, 4 purple, 5 orange, 6 green, 7 maroon, 8 black; 9 to 15 repeat them as stripes.
export const BALL_COL = ['#f6f3e8', '#f2c014', '#1d4fc4', '#d42a2a', '#5c2d91', '#ef7316', '#14834b', '#7c1d24', '#151515'];
export const ballColour = (n) => BALL_COL[n > 8 ? n - 8 : n];

// ---------- Table ----------
// Corner pockets open C along each rail from the corner; side pockets open S either side of the middle.
const C = 0.088, S = 0.066, J = 0.042;
export const POCKETS = [
  { x: -0.014, y: -0.014, r: 0.058 }, { x: W + 0.014, y: -0.014, r: 0.058 },
  { x: -0.046, y: H / 2, r: 0.054 }, { x: W + 0.046, y: H / 2, r: 0.054 },
  { x: -0.014, y: H + 0.014, r: 0.058 }, { x: W + 0.014, y: H + 0.014, r: 0.058 },
];
// Cushion lines (ball centres stay R away from them). The short angled ones are the pocket jaws; segment ends act as round knuckles.
export const CUSHIONS = (() => {
  const L = [];
  const add = (ax, ay, bx, by) => L.push({ ax, ay, bx, by });
  for (const y of [0, H]) {
    const d = y === 0 ? -1 : 1;
    add(C, y, W - C, y); add(C, y, C - J, y + d * J); add(W - C, y, W - C + J, y + d * J);
  }
  for (const x of [0, W]) {
    const d = x === 0 ? -1 : 1;
    add(x, C, x, H / 2 - S); add(x, H / 2 + S, x, H - C);
    add(x, C, x + d * J, C - J); add(x, H - C, x + d * J, H - C + J);
    add(x, H / 2 - S, x + d * J, H / 2 - S + 0.014); add(x, H / 2 + S, x + d * J, H / 2 + S - 0.014);
  }
  return L;
})();

// ---------- Setup ----------
// The rack: a triangle pointing at the breaker, the 8 in the middle of the third row, a solid and a stripe
// in the two back corners, and the rest shuffled with the shared random numbers.
export function newPool(rng = Math.random, first = 0) {
  const balls = [];
  for (let n = 0; n < 16; n++) balls.push({ n, x: 0, y: 0, vx: 0, vy: 0, in: false });
  const rest = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  // back corners: one of each group
  const sIdx = rest.findIndex((n) => n < 8), sBall = rest.splice(sIdx, 1)[0];
  const tIdx = rest.findIndex((n) => n > 8), tBall = rest.splice(tIdx, 1)[0];
  const swap = rng() < 0.5, order = [];
  const gap = 2 * R + 0.0004, rowH = gap * 0.8660254037844386;
  for (let row = 0; row < 5; row++) {
    for (let k = 0; k <= row; k++) {
      const n = row === 2 && k === 1 ? 8 : row === 4 && k === 0 ? (swap ? tBall : sBall) : row === 4 && k === 4 ? (swap ? sBall : tBall) : rest.shift();
      order.push({ row, k, n });
    }
  }
  for (const o of order) {
    const b = balls[o.n];
    b.x = W / 2 + (o.k - o.row / 2) * gap;
    b.y = FOOT - o.row * rowH;
  }
  const cue = balls[0];
  cue.x = W / 2; cue.y = HEAD + (H - HEAD) * 0.4;
  return {
    balls, turn: first, groups: [null, null], breakShot: true, inHand: true, kitchen: true,
    over: null, last: null, shots: 0, cur: null,
  };
}

export const onTable = (s, n) => !s.balls[n].in;
// Balls of group g still on the table.
export const left = (s, g) => s.balls.filter((b) => !b.in && groupOf(b.n) === g).length;
// Which balls player p may legally hit first.
export function legalTargets(s, p = s.turn) {
  const g = s.groups[p];
  const live = s.balls.filter((b) => b.n && !b.in);
  if (s.breakShot) return live.map((b) => b.n);
  if (!g) return live.filter((b) => b.n !== 8).map((b) => b.n);
  const mine = live.filter((b) => groupOf(b.n) === g).map((b) => b.n);
  return mine.length ? mine : [8];
}

// Can the cue ball go at (x, y)? Inside the cushions, not touching a ball, and behind the head string for the break.
export function canPlaceCue(s, x, y) {
  if (!(x >= R && x <= W - R && y >= R && y <= H - R)) return false;
  if (s.kitchen && y < HEAD) return false;
  for (const b of s.balls) if (b.n && !b.in && (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) < 4 * R * R * 1.0001) return false;
  return true;
}
// A free spot for the cue ball after it went in: the middle of the head area, or the nearest free point.
function respotCue(s) {
  const c = s.balls[0];
  c.in = false; c.vx = 0; c.vy = 0;
  for (let k = 0; k < 400; k++) {
    const x = W / 2 + (k % 2 ? 1 : -1) * Math.floor(k / 2) * 0.01 * ((k >> 4) % 2 ? 1 : 0.5), y = HEAD + (H - HEAD) * 0.4 - Math.floor(k / 40) * 0.05;
    if (canPlaceCue({ ...s, kitchen: false }, x, y)) { c.x = x; c.y = y; return; }
  }
  c.x = W / 2; c.y = H - R * 2;
}
// The 8 goes back on the foot spot (or the nearest free point up the table) if it is potted on the break.
function respotEight(s) {
  const e = s.balls[8];
  e.in = false; e.vx = 0; e.vy = 0;
  const free = (x, y) => s.balls.every((b) => b.n === 8 || b.in || (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) >= 4 * R * R);
  for (let d = 0; d < 1.6; d += 0.005) {
    for (const y of [FOOT - d, FOOT + d]) if (y > R && y < H - R && free(W / 2, y)) { e.x = W / 2; e.y = y; return; }
  }
}

// ---------- Physics ----------
// shot = { dx, dy (aim direction, any length), p (power 0 to 1), sp (spin: -1 draw to 1 follow), cx, cy (cue ball spot when in hand) }
export function startShot(s, shot) {
  const c = s.balls[0];
  if (s.inHand && Number.isFinite(shot.cx) && Number.isFinite(shot.cy) && canPlaceCue(s, shot.cx, shot.cy)) { c.x = shot.cx; c.y = shot.cy; }
  const d = Math.sqrt(shot.dx * shot.dx + shot.dy * shot.dy) || 1;
  const p = Math.max(0.02, Math.min(1, +shot.p || 0)), v = p * MAXV;
  c.vx = (shot.dx / d) * v; c.vy = (shot.dy / d) * v;
  const sp = Math.max(-1, Math.min(1, +shot.sp || 0));
  // follow or draw, given to the cue ball at its first contact: a little natural roll (none on the break,
  // which is played with stun), plus the spin chosen
  s.cur = { first: null, pots: [], rails: 0, roll: (s.breakShot ? 0 : 0.18) + sp * 0.55, steps: 0 };
  return s;
}

// One fixed step (DT). Pushes sound events into ev: {k: 'hit', v}, {k: 'rail', v}, {k: 'pot', n}. Returns true while anything moves.
export function stepPool(s, ev = []) {
  const bs = s.balls, cur = s.cur || (s.cur = { first: null, pots: [], rails: 0, roll: 0.18, steps: 0 });
  const dt = DT / SUB;
  for (let k = 0; k < SUB; k++) {
    for (const b of bs) if (!b.in && (b.vx || b.vy)) { b.x += b.vx * dt; b.y += b.vy * dt; }
    // ball against ball: equal masses, nearly elastic
    for (let i = 0; i < 16; i++) {
      const a = bs[i];
      if (a.in) continue;
      for (let j = i + 1; j < 16; j++) {
        const b = bs[j];
        if (b.in || (!a.vx && !a.vy && !b.vx && !b.vy)) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R) continue;
        const d = Math.sqrt(d2) || 1e-9, nx = d2 ? dx / d : 1, ny = d2 ? dy / d : 0, push = (2 * R - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (vn <= 0) continue;
        const cueHit = cur.first === null && (a.n === 0 || b.n === 0);
        const q = a.n === 0 ? a : b, o = q === a ? b : a, qvx = q.vx, qvy = q.vy;
        const e0 = a.vx * a.vx + a.vy * a.vy + b.vx * b.vx + b.vy * b.vy;
        const jn = ((1 + BALL_E) / 2) * vn;
        a.vx -= jn * nx; a.vy -= jn * ny; b.vx += jn * nx; b.vy += jn * ny;
        if (cueHit) {
          cur.first = o.n;
          // follow or draw: the cue ball carries on (or comes back) along its old line, in proportion to how full the hit was
          const sp = Math.sqrt(qvx * qvx + qvy * qvy);
          if (sp > 0) { const f = (cur.roll * vn) / sp; q.vx += qvx * f; q.vy += qvy * f; }
          // the spin can only give back energy the hit took away
          const room = e0 - (o.vx * o.vx + o.vy * o.vy), q2 = q.vx * q.vx + q.vy * q.vy;
          if (q2 > room) { const k = room > 0 ? Math.sqrt(room / q2) : 0; q.vx *= k; q.vy *= k; }
        }
        ev.push({ k: 'hit', v: Math.round(vn * 100) / 100 });
      }
    }
    // cushions (only balls near the edge can touch one)
    for (const b of bs) {
      if (b.in || (!b.vx && !b.vy)) continue;
      if (b.x > R + 0.002 && b.x < W - R - 0.002 && b.y > R + 0.002 && b.y < H - R - 0.002) continue;
      for (const c of CUSHIONS) {
        const ex = c.bx - c.ax, ey = c.by - c.ay, l2 = ex * ex + ey * ey;
        let t = ((b.x - c.ax) * ex + (b.y - c.ay) * ey) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = c.ax + ex * t, py = c.ay + ey * t, dx = b.x - px, dy = b.y - py, d2 = dx * dx + dy * dy;
        if (d2 >= R * R || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        b.x = px + nx * R; b.y = py + ny * R;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= (1 + RAIL_E) * vn * nx; b.vy -= (1 + RAIL_E) * vn * ny;
          // the cushion also grips the ball a little along its length
          const tx = -ny, ty = nx, vt = b.vx * tx + b.vy * ty;
          b.vx -= vt * 0.06 * tx; b.vy -= vt * 0.06 * ty;
          cur.rails++;
          ev.push({ k: 'rail', v: Math.round(-vn * 100) / 100 });
        }
      }
    }
    // pockets, with a safety net for anything that got past the cushions
    for (const b of bs) {
      if (b.in) continue;
      let hit = -1;
      for (let i = 0; i < 6; i++) { const p = POCKETS[i], dx = b.x - p.x, dy = b.y - p.y; if (dx * dx + dy * dy < p.r * p.r) { hit = i; break; } }
      if (hit < 0 && (b.x < -0.03 || b.x > W + 0.03 || b.y < -0.03 || b.y > H + 0.03)) {
        let best = 1e9;
        for (let i = 0; i < 6; i++) { const p = POCKETS[i], d2 = (b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y); if (d2 < best) { best = d2; hit = i; } }
      }
      if (hit >= 0) {
        b.in = true; b.vx = 0; b.vy = 0; b.x = POCKETS[hit].x; b.y = POCKETS[hit].y;
        cur.pots.push(b.n);
        ev.push({ k: 'pot', n: b.n, p: hit });
      }
    }
  }
  // rolling friction: a steady slow-down, then a stop
  let moving = false;
  for (const b of bs) {
    if (b.in || (!b.vx && !b.vy)) continue;
    let sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (sp > MAXV) { b.vx *= MAXV / sp; b.vy *= MAXV / sp; sp = MAXV; }
    const ns = sp - DECEL * DT;
    if (ns < STOP) { b.vx = 0; b.vy = 0; continue; }
    b.vx *= ns / sp; b.vy *= ns / sp;
    moving = true;
  }
  if (++cur.steps > MAX_STEPS) { for (const b of bs) { b.vx = 0; b.vy = 0; } moving = false; }
  return moving;
}

// ---------- Rules ----------
// Applies the result of a shot: out = { first: ball hit first or null, pots: [ball numbers in order] }.
// Fouls (cue ball in, nothing hit, wrong ball first) give the other player ball in hand anywhere.
// Potting the 8 wins only after clearing your group with a legal shot; otherwise it loses. On the break
// the table stays open, any pot keeps the turn, and an 8 that drops is put back on the foot spot.
export function judge(s, out) {
  const p = s.turn, o = 1 - p, mine = s.groups[p];
  const pots = out.pots.filter((n) => n !== 0), scratch = out.pots.includes(0);
  const brk = s.breakShot, eight = pots.includes(8);
  // my group was already cleared before this shot (the balls of it potted now were still up before)
  const cleared = !!mine && left(s, mine) + pots.filter((n) => groupOf(n) === mine).length === 0;
  let foul = null;
  if (scratch) foul = 'scratch';
  else if (out.first === null || out.first === undefined) foul = 'nohit';
  else if (!brk) {
    if (!mine) { if (out.first === 8) foul = 'wrong'; }
    else if (cleared) { if (out.first !== 8) foul = 'wrong'; }
    else if (groupOf(out.first) !== mine) foul = 'wrong';
  }
  const last = { p, foul, pots, first: out.first ?? null, assigned: false, cont: false };
  s.last = last; s.shots++;
  if (scratch) respotCue(s);
  if (eight && !brk) {
    const win = cleared && !foul;
    s.over = { winner: win ? p : o, why: win ? 'eight' : scratch ? 'scratch8' : foul ? 'foul8' : 'early8' };
    s.breakShot = false; s.inHand = false; s.kitchen = false;
    return last;
  }
  if (eight && brk) respotEight(s);
  if (!brk && !mine && !foul) {
    const g = pots.map(groupOf).find((x) => x);
    if (g) { s.groups[p] = g; s.groups[o] = other(g); last.assigned = true; }
  }
  const g = s.groups[p];
  last.cont = !foul && (brk ? pots.length > 0 : !!g && pots.some((n) => groupOf(n) === g));
  s.breakShot = false; s.kitchen = false;
  if (!last.cont) s.turn = o;
  s.inHand = !!foul;
  return last;
}

// Plays a whole shot straight through: start, move until everything stops, then the rules.
export function runShot(s, shot, ev) {
  startShot(s, shot);
  const e = ev || [];
  while (stepPool(s, e)) if (!ev) e.length = 0;
  return judge(s, s.cur);
}

export const cloneState = (s) => JSON.parse(JSON.stringify(s));

// Everything the other phone needs after a shot, with positions rounded so both phones hold the same numbers.
export function packPool(s) {
  return {
    b: s.balls.map((b) => (b.in ? 0 : [Math.round(b.x * 1e5) / 1e5, Math.round(b.y * 1e5) / 1e5])),
    turn: s.turn, g: s.groups.slice(), br: s.breakShot ? 1 : 0, ih: s.inHand ? 1 : 0, k: s.kitchen ? 1 : 0,
    over: s.over, last: s.last, shots: s.shots,
  };
}
export function unpackPool(s, p) {
  p.b.forEach((v, n) => { const b = s.balls[n]; b.vx = 0; b.vy = 0; if (v) { b.in = false; b.x = v[0]; b.y = v[1]; } else b.in = true; });
  s.turn = p.turn; s.groups = p.g.slice(); s.breakShot = !!p.br; s.inHand = !!p.ih; s.kitchen = !!p.k;
  s.over = p.over; s.last = p.last; s.shots = p.shots; s.cur = null;
  return s;
}

// ---------- Aim guide ----------
// Where a cue ball sent from (cx, cy) along (dx, dy) first touches something: { ball, gx, gy } for a ball
// (gx, gy is the ghost ball, where the cue ball will be at contact) or { ball: null, gx, gy } at a cushion.
export function aimContact(s, cx, cy, dx, dy) {
  const d = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / d, uy = dy / d;
  let best = Infinity, ball = null;
  for (const b of s.balls) {
    if (!b.n || b.in) continue;
    const ox = b.x - cx, oy = b.y - cy, t = ox * ux + oy * uy;
    if (t <= 0) continue;
    const q = ox * ox + oy * oy - t * t, rr = 4 * R * R;
    if (q > rr) continue;
    const tt = t - Math.sqrt(rr - q);
    if (tt < best) { best = tt; ball = b.n; }
  }
  // the cushion line the cue ball's centre would reach
  let wall = Infinity;
  if (ux > 0) wall = Math.min(wall, (W - R - cx) / ux); else if (ux < 0) wall = Math.min(wall, (R - cx) / ux);
  if (uy > 0) wall = Math.min(wall, (H - R - cy) / uy); else if (uy < 0) wall = Math.min(wall, (R - cy) / uy);
  if (wall < best) return { ball: null, gx: cx + ux * wall, gy: cy + uy * wall, ux, uy };
  return { ball, gx: cx + ux * best, gy: cy + uy * best, ux, uy };
}

// ---------- Computer player ----------
export const AI_LEVELS = {
  easy: { err: 0.03, perr: 0.16, tries: 24, plan: false },
  medium: { err: 0.011, perr: 0.07, tries: 60, plan: true },
  hard: { err: 0.0035, perr: 0.03, tries: 110, plan: true },
};
// Is the straight path from (ax, ay) to (bx, by) clear for a ball, ignoring the balls in skip?
function clearPath(s, ax, ay, bx, by, skip) {
  const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1e-9;
  for (const b of s.balls) {
    if (b.in || skip.includes(b.n)) continue;
    let t = ((b.x - ax) * ex + (b.y - ay) * ey) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + ex * t - b.x, py = ay + ey * t - b.y;
    if (px * px + py * py < 4 * R * R * 0.98) return false;
  }
  return true;
}
// Pocket aiming points, just inside each mouth.
const AIM_PTS = POCKETS.map((p, i) => (i === 2 || i === 3 ? { x: p.x < 0 ? 0 : W, y: H / 2 } : { x: p.x < 0 ? R * 0.5 : W - R * 0.5, y: p.y < 0 ? R * 0.5 : H - R * 0.5 }));
// Straight pots from (cx, cy): the ghost-ball aim for each legal target and pocket, best (straightest, shortest) first.
function potLines(s, cx, cy, targets) {
  const out = [];
  for (const n of targets) {
    const b = s.balls[n];
    for (const pk of AIM_PTS) {
      let ux = pk.x - b.x, uy = pk.y - b.y;
      const dl = Math.sqrt(ux * ux + uy * uy); ux /= dl; uy /= dl;
      const gx = b.x - ux * 2 * R, gy = b.y - uy * 2 * R;
      let ax = gx - cx, ay = gy - cy;
      const al = Math.sqrt(ax * ax + ay * ay);
      if (al < 1e-6) continue;
      ax /= al; ay /= al;
      const cut = ax * ux + ay * uy; // 1 is dead straight
      if (cut < 0.3) continue;
      if (!clearPath(s, cx, cy, gx, gy, [0, n]) || !clearPath(s, b.x, b.y, pk.x, pk.y, [0, n])) continue;
      out.push({ n, dx: ax, dy: ay, dist: al + dl, cut, score: cut * 2 - (al + dl) * 0.35 });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
// How many of player p's balls have an open pot from where the cue ball now sits (used to judge position).
function openPots(s, p) {
  if (s.balls[0].in) return 0;
  const t = legalTargets(s, p), seen = new Set();
  for (const l of potLines(s, s.balls[0].x, s.balls[0].y, t)) if (l.cut > 0.55) seen.add(l.n);
  return seen.size;
}
function gauss(rng) {
  let u = 0; while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// The computer's thinking, a few shots at a time so the screen keeps moving: next() simulates one more
// candidate and returns { done, value: shot }. aiShot runs it to the end in one go.
export function* aiThink(s, level = 'medium', rng = Math.random) {
  const L = AI_LEVELS[level] || AI_LEVELS.medium, p = s.turn;
  const cue = s.balls[0], targets = legalTargets(s, p);
  // the break: from just behind the head string, straight at the front ball, as hard as it can
  if (s.breakShot) {
    const cx = W / 2 + (rng() - 0.5) * 0.24, cy = HEAD + 0.08, apex = s.balls.filter((b) => b.n && !b.in).sort((a, b) => b.y - a.y)[0];
    const shot = { dx: apex.x - cx, dy: apex.y - cy, p: 0.92 + rng() * 0.08, sp: 0, cx, cy };
    return noisy(shot, L, rng);
  }
  // where the cue ball could go: as it is, or (ball in hand) straight behind a pot
  const spots = [];
  if (!s.inHand) spots.push([cue.x, cue.y]);
  else {
    for (const n of targets) {
      const b = s.balls[n];
      for (const pk of AIM_PTS) {
        let ux = pk.x - b.x, uy = pk.y - b.y;
        const dl = Math.sqrt(ux * ux + uy * uy); ux /= dl; uy /= dl;
        if (!clearPath(s, b.x, b.y, pk.x, pk.y, [0, n])) continue;
        for (const back of [0.16, 0.3]) {
          const x = b.x - ux * (2 * R + back), y = b.y - uy * (2 * R + back);
          if (canPlaceCue(s, x, y)) spots.push([x, y]);
        }
      }
    }
    for (let k = 0; spots.length < 6 && k < 60; k++) { const x = R + rng() * (W - 2 * R), y = R + rng() * (H - 2 * R); if (canPlaceCue(s, x, y)) spots.push([x, y]); }
    if (!spots.length) spots.push([cue.x, cue.y]);
  }
  // candidate shots: pots first, then plain hits on a legal ball, then a spread of angles
  const cands = [];
  for (const [cx, cy] of spots) {
    for (const l of potLines(s, cx, cy, targets).slice(0, 8)) {
      const base = Math.min(1, 0.22 + l.dist * 0.28 + (1 - l.cut) * 0.35);
      for (const pw of [base, Math.min(1, base * 1.45), base * 0.75]) for (const sp of L.plan ? [0, 0.7, -0.7] : [0]) cands.push({ dx: l.dx, dy: l.dy, p: pw, sp, cx, cy, pot: 1 });
    }
  }
  const [cx0, cy0] = spots[0];
  for (const n of targets) { const b = s.balls[n]; for (const pw of [0.35, 0.6]) cands.push({ dx: b.x - cx0, dy: b.y - cy0, p: pw, sp: 0, cx: cx0, cy: cy0 }); }
  for (let k = 0; k < 16; k++) { const a = rng() * Math.PI * 2; cands.push({ dx: Math.cos(a), dy: Math.sin(a), p: 0.3 + rng() * 0.5, sp: 0, cx: cx0, cy: cy0 }); }
  // pot candidates keep their order (best first); the rest are tried as time allows
  const pots = cands.filter((c) => c.pot), rest = cands.filter((c) => !c.pot);
  const list = pots.slice(0, Math.floor(L.tries * 0.75)).concat(rest).slice(0, L.tries);
  const score = (shot) => {
    const t = cloneState(s), r = runShot(t, shot);
    if (t.over) return t.over.winner === p ? 1000 : -1000;
    let sc = r.foul ? -150 : 0;
    const g = t.groups[p];
    sc += r.cont ? 100 + 12 * r.pots.length : -10;
    if (g) sc -= 8 * r.pots.filter((n) => groupOf(n) === other(g)).length;
    if (L.plan) sc += r.cont ? 9 * openPots(t, p) : -5 * openPots(t, 1 - p);
    return sc;
  };
  const scored = [];
  for (const c of list) {
    const shot = { dx: c.dx, dy: c.dy, p: c.p, sp: c.sp };
    if (s.inHand) { shot.cx = c.cx; shot.cy = c.cy; }
    scored.push({ shot, sc: score(shot) + rng() * 2 }); // the random bit breaks ties differently each time
    yield;
  }
  // the best few are tried again with this level's own wobble, so a shot that only works when perfect
  // (or that scratches when slightly off) loses out to a safer one
  scored.sort((a, b) => b.sc - a.sc);
  let best = scored[0], bestAvg = -Infinity;
  for (const c of scored.slice(0, 4)) {
    let sum = c.sc;
    for (let k = 0; k < 3; k++) { sum += score(noisy(c.shot, L, rng)); yield; }
    if (sum / 4 > bestAvg) { bestAvg = sum / 4; best = c; }
  }
  return noisy(best ? best.shot : { dx: 0, dy: -1, p: 0.5, sp: 0 }, L, rng);
}
// The level's aim and power error.
function noisy(shot, L, rng) {
  const a = gauss(rng) * L.err, c = Math.cos(a), sn = Math.sin(a);
  const out = { ...shot, dx: shot.dx * c - shot.dy * sn, dy: shot.dx * sn + shot.dy * c, p: Math.max(0.05, Math.min(1, shot.p * (1 + gauss(rng) * L.perr))) };
  return roundShot(out);
}
export function aiShot(s, level, rng) {
  const it = aiThink(s, level, rng);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}
// Rounds a shot's numbers so it travels between phones unchanged.
export function roundShot(sh) {
  const d = Math.sqrt(sh.dx * sh.dx + sh.dy * sh.dy) || 1, r = (v, k = 1e6) => Math.round(v * k) / k;
  const out = { dx: r(sh.dx / d), dy: r(sh.dy / d), p: r(sh.p, 1e4), sp: r(sh.sp || 0, 100) };
  if (Number.isFinite(sh.cx)) { out.cx = r(sh.cx, 1e5); out.cy = r(sh.cy, 1e5); }
  return out;
}
