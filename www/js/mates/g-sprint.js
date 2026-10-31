// Scroll Sprint: the screen scrolls right on its own, slowly getting faster. Fall into a pit, hit spikes or a beetle,
// or drop off the left edge and you pop back in next to your partner for one of 3 shared hearts.
// Score: metres the screen has travelled, plus 5 for every coin.
// The course is built from 40 column chunks that each start and end on flat ground at the same height, so a chunk
// depends only on the seed and its number: the level is generated ahead of the screen as you go.
import { mulberry, clamp, moveX } from './engine.js';
import { reachable } from './g-lava.js';

const H = 14, BASE = 10, CH = 40, START = 12, FIRST = 9, HEARTS = 3, COIN = 5;

function chunk(seed, k) {
  const rng = mulberry((seed * 7919 + k * 104729 + 13) >>> 0), ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const g = Array.from({ length: H }, () => Array(CH).fill('.'));
  const d = Math.min(1, k / 10);
  let c = 0, h = BASE;
  const col = (x, top) => { for (let r = top; r < H; r++) g[r][x] = '#'; };
  const flat = (n) => { for (let i = 0; i < n && c < CH; i++) col(c++, h); };
  flat(3);
  while (c < CH - 12) {
    const f = rng();
    if (f < 0.3) {
      // a pit: up to 4 wide on the level, 3 going up
      const nh = clamp(h + ri(-2, 2), 6, 11), wd = h - nh >= 1 ? ri(2, 3) : ri(2, 3 + (d > 0.3 ? 1 : 0));
      for (let i = 1; i < wd - 1 || (wd === 2 && i === 1); i++) g[Math.min(h, nh) - 3][c + i] = 'o';
      c += wd; h = nh; flat(ri(2, 4));
    } else if (f < 0.5) {
      h = clamp(h + [-2, -1, 1, 2, 3][ri(0, 4)], 6, 11); flat(ri(2, 5));
    } else if (f < 0.62 + d * 0.08) {
      flat(2);
      for (let n = ri(1, 2); n > 0; n--) { col(c, h); g[h - 1][c++] = '^'; }
      flat(2);
    } else if (f < 0.8) {
      // a wide pit with a ledge in the middle
      const wd = ri(5, 7);
      for (let x = c + 2; x <= c + wd - 3; x++) { g[h - 1][x] = '='; g[h - 3][x] = 'o'; }
      c += wd; flat(2);
    } else {
      const n = ri(4, 7), x0 = c;
      flat(n);
      if (rng() < 0.4 + d * 0.3) g[h - 1][x0 + n - 2] = 'e';
      else for (let x = x0 + 1; x < x0 + n - 1; x++) g[h - 2][x] = 'o';
    }
  }
  while (c < CH - 4) flat(1);
  h = BASE; flat(4);
  return g.map((row) => row.join(''));
}

function gen(seed) {
  const rows = Array.from({ length: H }, (_, r) => (r < BASE ? '.' : '#').repeat(START).split(''));
  rows[BASE - 1][3] = '1'; rows[BASE - 1][5] = '2';
  const out = rows.map((r) => r.join(''));
  for (let k = 0; k < FIRST; k++) chunk(seed, k).forEach((row, r) => { out[r] += row; });
  return { name: 'Scroll Sprint', rows: out, seed };
}

// Adds the next chunk to the right of a running world.
function extend(w) {
  const d = w.data, x0 = w.W;
  chunk(d.seed, d.next++).forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === 'e') { w.walkers.push({ kind: 'walker', x: x0 + c + 0.1, y: r + 0.35, w: 0.8, h: 0.65, dir: -1, vx: 0, vy: 0, gdir: 1, ground: false, on: null, dx: 0, dy: 0, alive: true }); ch = '.'; }
    w.grid[r].push(ch);
  }));
  w.W += CH;
}

const score = (w) => Math.floor(w.data.camX) + w.coins * COIN;
// The top of the ground in column c, if it is safe to stand on.
function surface(w, c) {
  for (let r = 1; r < w.H; r++) {
    const t = w.tile(c, r);
    if (t && t.hazard) return -1;
    if (w.solidAt(c, r) || (t && t.oneway)) return r;
  }
  return -1;
}
// Puts p back on screen next to their partner, or further in on safe ground if the partner is near the edge too.
function bringBack(w, p) {
  const d = w.data, q = w.partner(p);
  let spot = null;
  const ok = !q.dead && q.x > d.camX + 3 && q.y < w.H;
  if (ok && q.ground) spot = [q.x, q.y];
  const base = Math.floor(ok ? q.x + q.w / 2 : Math.max(d.camX + d.vw * 0.35, q.dead ? 0 : q.x + 3));
  for (let i = 0; i < 24 && !spot; i++) {
    const c = base + (i % 2 ? -(i + 1) / 2 : i / 2), r = c >= d.camX + 1 ? surface(w, c) : -1;
    if (r > 0) spot = [c + 0.5 - p.w / 2, r - p.h - 0.01];
  }
  [p.x, p.y] = spot || [d.camX + d.vw * 0.4, 0];
  p.vx = p.vy = 0; p.on = null; p.safe = 1.5;
  w.emit('warp', p.x + p.w / 2, p.y + p.h / 2, p);
}
function hurt(w) {
  const d = w.data;
  d.hearts = Math.max(0, d.hearts - 1);
  w.emit('heart', 0, 0);
  if (!d.hearts) { const m = Math.floor(d.camX); w.finish(score(w), w.coins ? `${m} metres run, plus ${w.coins} ${w.coins === 1 ? 'coin' : 'coins'} worth ${w.coins * COIN}.` : `${m} metres run.`); }
}

export default {
  id: 'sprint', name: 'Scroll Sprint', blurb: 'Keep up with the screen as it races along', noAct: true, follow: true,
  how: [
    'The screen moves to the right by itself, and it slowly gets faster. Run and jump to keep up.',
    'Fall into a pit, touch spikes or a beetle, or get left behind the left edge, and you pop back in next to your partner. That costs one of your 3 shared hearts.',
    'Your score is how far the screen travels, in metres. Every coin adds 5 more.',
  ],
  theme: { sky: ['#7fc8ff', '#e8f6ff'], hills: ['#b9e2a0', '#8fcf7a'] },
  endless: { unit: 'metres', unit1: 'metre', gen },
  setup(w) { Object.assign(w.data, { seed: w.level.seed ?? 1, next: FIRST, camX: 0, v: 0, vw: 22, hearts: HEARTS }); },
  update(w, dt) {
    const d = w.data;
    d.v = w.t < 2 ? 0 : Math.min(6, 2.4 + (w.t - 2) * 0.025);
    d.camX += d.v * dt;
    while (w.W - (d.camX + d.vw) < 50) extend(w);
    if (w.walkers.length > 20) w.walkers = w.walkers.filter((e) => e.x > d.camX - 8);
    for (const p of w.players) {
      if (p.dead || w.over) continue;
      if (p.x + p.w < d.camX - 0.1 || p.y > w.H + 0.3) { bringBack(w, p); hurt(w); continue; }
      // the right edge of the screen holds you back
      const lim = d.camX + d.vw - 0.4;
      if (p.x + p.w > lim) { moveX(w, p, lim - p.x - p.w); p.vx = Math.min(p.vx, 0); }
    }
  },
  onDie(w) { hurt(w); },
  onRespawn(w, p) { bringBack(w, p); },
  camera(w, cam) {
    const d = w.data, s = clamp(cam.H / (w.H + 0.5), cam.sMin * 0.8, cam.sMax * 1.2);
    d.vw = cam.W / s;
    const live = w.players.filter((p) => !p.dead), y = live.length ? live.reduce((a, p) => a + p.y + p.h / 2, 0) / live.length : w.H / 2;
    // aim a little ahead to make up for the camera's easing, so what you see matches the real edge
    return { x: d.camX + d.vw / 2 + d.v / 6, y, s };
  },
  hud(w) { const h = w.data.hearts; return { left: '♥'.repeat(h) + '♡'.repeat(HEARTS - h), center: `${Math.floor(w.data.camX)} m`, right: `● ${w.coins}` }; },
  sound(e, snd) { if (e.k === 'heart') snd.fail?.(); },
  drawFront(g, w, v) {
    const x = w.data.camX, gr = g.createLinearGradient(x, 0, x + 1.2, 0);
    gr.addColorStop(0, 'rgba(255,60,60,.35)'); gr.addColorStop(1, 'rgba(255,60,60,0)');
    g.fillStyle = gr; g.fillRect(x - 1, v.y - 1, 2.2, v.h + 2);
  },
  tests(assert, { makeWorld, simulate }) {
    const game = this;
    assert(JSON.stringify(gen(9)) === JSON.stringify(gen(9)) && JSON.stringify(chunk(9, 30)) === JSON.stringify(chunk(9, 30)), 'sprint: generation follows the seed');
    for (const seed of [1, 2, 3, 99, 4242, 12345]) {
      const lv = gen(seed), rr = reachable(lv.rows), W = lv.rows[0].length;
      assert(W <= 400 && [...rr.seen].some((k) => +k.split(',')[0] >= W - 3), `sprint seed ${seed}: the whole course can be run`);
      // later chunks, as added during a long run
      const far = gen(seed).rows.map((r) => r.slice(0, START));
      for (let k = 30; k < 38; k++) chunk(seed, k).forEach((row, r) => { far[r] += row; });
      const rf = reachable(far);
      assert([...rf.seen].some((k) => +k.split(',')[0] >= far[0].length - 3), `sprint seed ${seed}: later chunks can be run too`);
    }
    // left behind: back next to your partner for a heart; out of hearts ends the run
    let w = makeWorld(gen(3), game, { seed: 3 });
    const [a, b] = w.players;
    a.x = 13.14; a.y = BASE - a.h - 0.01; w.data.camX = 8;
    simulate(w, 0.2);
    assert(w.data.hearts === 2 && Math.abs(b.x - a.x) < 1 && Math.abs(b.y - a.y) < 1, 'sprint: left behind costs a heart and pops you next to your partner');
    w.data.camX = a.x + 3; simulate(w, 0.1);
    assert(!!w.over && w.data.hearts === 0 && w.over.score === 16, `sprint: the run ends when the hearts run out (${w.over?.score})`);
    // standing still: the screen leaves you behind three times
    w = makeWorld(gen(4), game, { seed: 4 });
    simulate(w, 120);
    assert(!!w.over && w.data.hearts === 0 && w.over.score > 3, 'sprint: standing still ends the run');
    // the course keeps growing ahead of the screen
    w = makeWorld(gen(5), game, { seed: 5 });
    const W0 = w.W; w.data.camX = W0 - 30; w.players.forEach((p) => { p.safe = 1e9; });
    simulate(w, 0.1);
    assert(w.W > W0 && w.grid.every((r) => r.length === w.W), 'sprint: more course is added as you go');
  },
};
