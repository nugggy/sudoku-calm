// Coin Rush: 90 seconds in a one-screen arena of platforms. Coins keep popping up in spots you can reach, a gem
// worth 5 shows up now and then for a few seconds, and beetles wander about (stomped ones come back later).
// A fall or a beetle knock costs 2 seconds. Score: coins collected together, gems counting 5.
import { mulberry } from './engine.js';
import { reachable } from './g-lava.js';

const W = 34, H = 16, TIME = 90, ON_BOARD = 4, PENALTY = 2;

// Rows of platforms 3 apart over a floor with a pit or two. Any platform piece you could not reach is removed.
function gen(seed) {
  const rng = mulberry(seed), ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  for (let r = 0; r < H; r++) g[r][0] = g[r][W - 1] = 'B';
  g[H - 1].fill('#');
  for (let n = ri(1, 2), tries = 0; n > 0 && tries < 20; tries++) {
    const wd = ri(2, 3), a = ri(3, W - 4 - wd);
    if (a + wd > 12 && a < 22) continue; // keep the middle (where you start) solid
    if (g[H - 1].slice(a - 3, a + wd + 3).includes('.')) continue;
    for (let c = a; c < a + wd; c++) g[H - 1][c] = '.';
    n--;
  }
  for (const r of [12, 9, 6, 3]) {
    let c = ri(1, 4);
    while (c < W - 4) {
      const len = Math.min(ri(3, 7), W - 1 - c), ch = r < 12 && rng() < 0.3 ? '#' : '=';
      for (let k = 0; k < len; k++) g[r][c + k] = ch;
      c += len + ri(2, 5);
    }
  }
  g[H - 2][15] = '1'; g[H - 2][18] = '2';
  let rows = g.map((row) => row.join(''));
  const rr = reachable(rows);
  for (const [c, r] of rr.all) if (!rr.has(c, r) && r + 1 < H - 1) g[r + 1][c] = '.';
  // beetles on a few of the longer platforms
  let spots = reachable(rows = g.map((row) => row.join(''))).all.filter(([c, r]) => r < H - 3 && g[r + 1][c - 1] !== '.' && g[r + 1][c + 1] !== '.');
  for (let n = ri(2, 3); n > 0 && spots.length; n--) {
    const [c, r] = spots[Math.floor(rng() * spots.length)];
    g[r][c] = 'e'; spots = spots.filter(([c2, r2]) => r2 !== r || Math.abs(c2 - c) > 4);
  }
  return { name: 'Coin Rush', rows: g.map((row) => row.join('')) };
}

const score = (w) => w.coins + w.gems * 5;
const left = (w) => Math.max(0, TIME - w.t - w.data.pen);

// A free spot (standing height or one above) well away from both players.
function freeSpot(w) {
  const d = w.data;
  for (let k = 0; k < 40; k++) {
    const [c, r] = d.spots[Math.floor(w.rng() * d.spots.length)];
    if (w.get(c, r) !== '.') continue;
    if (w.players.some((p) => Math.abs(p.x + p.w / 2 - c - 0.5) + Math.abs(p.y + p.h / 2 - r - 0.5) < 4)) continue;
    return [c, r];
  }
  return null;
}

export default {
  id: 'rush', name: 'Coin Rush', blurb: 'Grab as many coins as you can in 90 seconds', noAct: true,
  how: [
    'You have 90 seconds to collect as many coins as you can between you. New coins keep popping up around the arena.',
    'Now and then a gem appears for a few seconds. It is worth 5 coins, so race for it.',
    'Beetles wander the platforms. Stomp them from above. Falling into a pit or bumping a beetle costs 2 seconds.',
  ],
  theme: { sky: ['#ffd7a8', '#fff4dc'], hills: ['#f2c98f', '#e3ae6c'] },
  endless: { unit: 'coins', unit1: 'coin', gen },
  setup(w) {
    const rr = reachable(w.level.rows);
    const spots = [];
    for (const [c, r] of [...rr.seen].map((k) => k.split(',').map(Number))) { spots.push([c, r]); if (r > 0 && w.get(c, r - 1) === '.' && !w.solidAt(c, r - 1)) spots.push([c, r - 1]); }
    Object.assign(w.data, { spots, pen: 0, wait: 0, gemIn: 12, gemAt: null, gemT: 0, pops: [] });
    for (let n = 0; n < ON_BOARD; n++) { const s = freeSpot(w); if (s) w.set(s[0], s[1], 'o'); }
  },
  update(w, dt) {
    const d = w.data;
    let n = 0;
    for (const [c, r] of d.spots) if (w.get(c, r) === 'o') n++;
    if (n < ON_BOARD && (d.wait -= dt) <= 0) { const s = freeSpot(w); if (s) { w.set(s[0], s[1], 'o'); w.emit('appear', s[0] + 0.5, s[1] + 0.5); } d.wait = 0.35; }
    if (d.gemAt) {
      const [c, r] = d.gemAt;
      if (w.get(c, r) !== '*') d.gemAt = null;
      else if ((d.gemT -= dt) <= 0) { w.set(c, r, '.'); d.gemAt = null; }
    } else if ((d.gemIn -= dt) <= 0) {
      const s = freeSpot(w);
      if (s) { w.set(s[0], s[1], '*'); d.gemAt = s; d.gemT = 7; w.emit('appear', s[0] + 0.5, s[1] + 0.5); }
      d.gemIn = 12 + w.rng() * 6;
    }
    // stomped beetles wander back in a while later
    for (const e of w.walkers) if (!e.alive && e.deadT > 7) { const s = freeSpot(w); if (s) Object.assign(e, { alive: true, deadT: 0, x: s[0] + 0.1, y: s[1] + 0.35, vy: 0, dir: w.rng() < 0.5 ? -1 : 1 }); }
    d.pops = d.pops.filter((q) => w.t - q.t < 1.2);
    if (left(w) <= 0) { const s = score(w); w.finish(s, `${w.coins} ${w.coins === 1 ? 'coin' : 'coins'} and ${w.gems} ${w.gems === 1 ? 'gem' : 'gems'} in 90 seconds.`); }
  },
  onDie(w) { w.data.pen += PENALTY; },
  onRespawn(w, p) { w.data.pops.push({ x: p.x + p.w / 2, y: p.y - 0.4, t: w.t }); },
  // the arena fits the screen
  camera(w, cam) { const s = Math.min(cam.W / w.W, cam.H / (w.H + 0.5)); return { x: w.W / 2, y: w.H / 2, s: Math.max(s, cam.sMin * 0.7) }; },
  hud(w) { const s = Math.ceil(left(w)); return { left: `● ${score(w)}`, right: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }; },
  sound(e, snd) { if (e.k === 'appear') snd.pop?.(); },
  drawFront(g, w) {
    g.font = '900 0.55px system-ui, sans-serif'; g.textAlign = 'center';
    for (const q of w.data.pops) {
      const k = (w.t - q.t) / 1.2;
      g.globalAlpha = 1 - k; g.lineWidth = 0.12; g.strokeStyle = 'rgba(0,0,0,.45)'; g.fillStyle = '#ff5a4a';
      g.strokeText(`-${PENALTY} s`, q.x, q.y - k); g.fillText(`-${PENALTY} s`, q.x, q.y - k);
    }
    g.globalAlpha = 1;
    // a ring that shrinks as the gem runs out of time
    const d = w.data;
    if (d.gemAt) { g.strokeStyle = 'rgba(127,240,255,.8)'; g.lineWidth = 0.06; g.beginPath(); g.arc(d.gemAt[0] + 0.5, d.gemAt[1] + 0.5, 0.55, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (d.gemT / 7)); g.stroke(); }
  },
  tests(assert, { makeWorld, simulate }) {
    const game = this;
    assert(JSON.stringify(gen(8)) === JSON.stringify(gen(8)), 'rush: generation follows the seed');
    for (const seed of [1, 2, 3, 99, 4242, 12345]) {
      const lv = gen(seed), rr = reachable(lv.rows);
      assert(rr.all.every(([c, r]) => rr.has(c, r)), `rush seed ${seed}: every platform can be reached`);
      const w = makeWorld(lv, game, { seed });
      assert(w.data.spots.length > 40 && w.data.spots.every(([c, r]) => !w.solidAt(c, r)), `rush seed ${seed}: plenty of open coin spots`);
    }
    // coins and gems add up; the board refills; the round ends at 90 seconds with the score
    const w = makeWorld(gen(5), game, { seed: 5 });
    w.walkers.forEach((e) => { e.alive = false; e.deadT = -1e9; });
    const p = w.players[0], c = Math.floor(p.x + p.w / 2), r = Math.floor(p.y + 0.5);
    w.set(c, r, 'o'); simulate(w, 0.1);
    assert(w.coins === 1, 'rush: touching a coin collects it');
    simulate(w, 1);
    let n = 0; for (const [x, y] of w.data.spots) if (w.get(x, y) === 'o') n++;
    assert(n === ON_BOARD, `rush: coins keep appearing (${n} on the board)`);
    w.set(c, r, '*'); simulate(w, 0.1);
    assert(score(w) === 6, 'rush: a gem is worth 5');
    w.players[1].safe = 0; w.kill(w.players[1], 'fall');
    assert(Math.abs(left(w) - (TIME - w.t - 2)) < 1e-6, 'rush: a fall costs 2 seconds');
    simulate(w, 80);
    assert(!w.over, 'rush: still going before time is up');
    simulate(w, 20);
    assert(!!w.over && w.over.score === 6 && w.t > TIME - 3 && w.t < TIME - 1.5, `rush: ends after 90 seconds less penalties with the coin score (${w.over?.score}, ${w.t.toFixed(1)} s)`);
  },
};
