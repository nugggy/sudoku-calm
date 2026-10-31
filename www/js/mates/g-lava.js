// Lava Climb: an endless climb up a tall shaft of ledges while lava rises from below, slowly speeding up.
// Touch the lava and the run is over for both of you. Score: the highest ledge the lower of you has stood on.
// Also exports reachable(), the jump-limit check the generated games use to prove their levels are playable.
import { mulberry, clamp } from './engine.js';
import { NAMES } from './draw.js';

// Cells a player can stand in and get to from the 1 and 2, jumping `up` tiles at most and crossing gaps of 4
// at the same height (3 going up 1 or 2, 2 going up 3). Jumps follow an up, across, down arc through clear cells.
export function reachable(rows, o = {}) {
  const { up = 3, solid = '#BxPK', oneway = '=', hazard = '^v~', fall = 14 } = o;
  const H = rows.length, W = Math.max(...rows.map((r) => r.length));
  const at = (c, r) => (c < 0 || c >= W ? '#' : r < 0 || r >= H ? '.' : rows[r][c] || '.');
  const hard = (c, r) => solid.includes(at(c, r));
  const clear = (c, r) => !hard(c, r) && !hazard.includes(at(c, r));
  const stand = (c, r) => r >= 0 && r < H - 1 && clear(c, r) && (hard(c, r + 1) || oneway.includes(at(c, r + 1)));
  const arc = (c, r, c2, r2) => {
    for (let h = Math.min(r, r2); h >= r - up; h--) {
      if (!clear(c, h)) return false;
      let ok = true;
      for (let x = Math.min(c, c2); x <= Math.max(c, c2) && ok; x++) ok = clear(x, h);
      for (let y = h; y <= r2 && ok; y++) ok = clear(c2, y);
      if (ok) return true;
    }
    return false;
  };
  const seen = new Set(), q = [];
  rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '1' || ch === '2') { seen.add(`${c},${r}`); q.push([c, r]); } }));
  while (q.length) {
    const [c, r] = q.pop();
    for (let r2 = Math.max(0, r - up); r2 <= Math.min(H - 2, r + fall); r2++) {
      const dy = r - r2, dx = dy >= 3 ? 3 : dy >= 1 ? 4 : 5;
      for (let c2 = c - dx; c2 <= c + dx; c2++) {
        const k = `${c2},${r2}`;
        if (!seen.has(k) && stand(c2, r2) && arc(c, r, c2, r2)) { seen.add(k); q.push([c2, r2]); }
      }
    }
  }
  const all = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (stand(c, r)) all.push([c, r]);
  return { seen, all, has: (c, r) => seen.has(`${c},${r}`) };
}

const W = 20, H = 290, TOP = 6;
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// A zigzag of ledges from the floor to the top, each 2 or 3 rows above the last and close enough sideways.
// Solid ledges sit beside the one below (never over it) and never two in a row, so nothing blocks the next jump.
function gen(seed) {
  const rng = mulberry(seed), ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  for (let r = 0; r < H; r++) g[r][0] = g[r][W - 1] = 'B';
  g[H - 1].fill('#');
  g[H - 2][8] = '1'; g[H - 2][11] = '2';
  let cur = { r: H - 1, a: 1, b: W - 2 }, wasSolid = true;
  while (cur.r - TOP > 3) {
    const k = (H - cur.r) / H;
    let dy = rng() < 0.3 + k * 0.45 ? 3 : 2;
    if (cur.r - dy - TOP < 2) dy = cur.r - TOP - 2;
    const r = cur.r - dy, len = Math.max(2, ri(3, 6) - (k > 0.5 ? 1 : 0)), gapMax = dy === 3 ? 2 : 3;
    const cands = [];
    for (let a = 1; a + len - 1 <= W - 2; a++) { const gap = Math.max(a - cur.b - 1, cur.a - (a + len - 1) - 1); if (gap <= gapMax) cands.push([a, gap]); }
    const moving = cands.filter(([, gap]) => gap >= -1);
    const [a, gap] = pick(rng, moving.length && rng() < 0.75 ? moving : cands);
    const solid = !wasSolid && gap >= 0 && rng() < 0.3, b = a + len - 1;
    for (let c = a; c <= b; c++) g[r][c] = solid ? '#' : '=';
    // a spare ledge on the same row, well clear of the path
    if (rng() < 0.45) {
      const l2 = ri(2, 3), a2 = ri(1, W - 1 - l2);
      if (a2 + l2 - 1 < a - 2 || a2 > b + 2) for (let c = a2; c < a2 + l2; c++) g[r][c] = '=';
    }
    if (k > 0.04 && len >= 4 && rng() < 0.12 + k * 0.12) g[r - 1][ri(a + 1, b - 1)] = 'e';
    else if (len >= 3 && rng() < 0.07) g[r - 1][rng() < 0.5 ? a : b] = 's';
    cur = { r, a, b }; wasSolid = solid;
  }
  for (let c = 1; c < W - 1; c++) g[TOP][c] = '=';
  return { name: 'Lava Climb', rows: g.map((row) => row.join('')) };
}
const pick = (rng, list) => list[Math.floor(rng() * list.length)];

const feet = (p) => p.y + p.h;

export default {
  id: 'lava', name: 'Lava Climb', blurb: 'Climb together before the lava catches you', noAct: true, follow: true,
  how: [
    'Lava is rising from below, and it slowly speeds up. Climb the ledges as high as you can.',
    'If either of you touches the lava, the run is over for both of you. Stay close and help each other up.',
    'Your score is the highest ledge the lower of you has stood on, in metres. Springs give you a big boost, and you can stomp the beetles from above.',
  ],
  theme: { sky: ['#2a1630', '#7a3428'], deco: 'stars', hills: null, ground: '#5b4650', top: '#8f7a84', edge: '#352830', brick: '#6e4a48', ledge: '#b07a56' },
  endless: { unit: 'metres', unit1: 'metre', gen },
  setup(w) { Object.assign(w.data, { lava: w.H + 2.5, best: 0, speed: 0 }); w.players.forEach((p) => { p.hgt = 0; }); },
  // the camera keeps the lower player in view, so the engine's pull-together warp is not needed
  preStep(w) { w.sepY = Infinity; },
  update(w, dt) {
    const d = w.data, ps = w.players;
    for (const p of ps) if (!p.dead && p.ground) { p.hgt = Math.max(0, Math.round(w.H - 1 - feet(p))); p.lastX = p.x; p.lastY = p.y; }
    d.best = Math.max(d.best, Math.min(ps[0].hgt, ps[1].hgt));
    const live = ps.filter((p) => !p.dead), low = live.length ? Math.max(...live.map(feet)) : d.lava;
    // speeds up over time, and catches up quickly if you get well ahead of it
    d.speed = Math.min(2, 0.45 + w.t * 0.008) + Math.max(0, d.lava - low - 14) * 0.3;
    if (w.t > 2) d.lava -= d.speed * dt;
    for (const p of live) if (feet(p) > d.lava + 0.25) { w.emit('die', p.x + p.w / 2, d.lava, p); w.finish(d.best, `${NAMES[p.id]} touched the lava after ${fmtT(w.t)}.`); return; }
    if (d.best >= w.H - 1 - TOP) w.finish(d.best, 'You both made it to the very top.');
  },
  // a beetle knock sends you back to your partner, not to the bottom
  onRespawn(w, p) {
    const q = w.partner(p);
    if (!q.dead) { p.x = q.x; p.y = q.y; } else if (q.lastX !== undefined) { p.x = q.lastX; p.y = q.lastY; }
  },
  camera(w, cam) {
    const live = w.players.filter((p) => !p.dead), ps = live.length ? live : w.players;
    const ys = ps.map((p) => p.y + p.h / 2), lo = Math.max(...ys), hi = Math.min(...ys);
    const s = clamp(Math.min(cam.H / (lo - hi + 8), cam.W / (w.W + 1)), cam.sMin * 0.7, cam.sMin);
    const vh = cam.H / s;
    // centre on the pair, but never lose sight of the lower one (nearest the lava)
    return { x: w.W / 2, y: Math.max((lo + hi) / 2, lo - vh * 0.45 + 3), s };
  },
  hud(w) {
    const live = w.players.filter((p) => !p.dead), low = live.length ? Math.max(...live.map(feet)) : 0;
    return { left: `▲ ${w.data.best} m`, center: `Lava ${Math.max(0, Math.floor(w.data.lava - low))} m below`, right: fmtT(w.t) };
  },
  drawFront(g, w, v, t) {
    const y = w.data.lava;
    if (y > v.y + v.h + 3) return;
    const x0 = Math.floor(v.x) - 1, x1 = v.x + v.w + 1, bottom = Math.max(y, v.y + v.h) + 2;
    const glow = g.createLinearGradient(0, y - 3.5, 0, y);
    glow.addColorStop(0, 'rgba(255,110,40,0)'); glow.addColorStop(1, 'rgba(255,120,40,.5)');
    g.fillStyle = glow; g.fillRect(x0, y - 3.5, x1 - x0, 3.5);
    const wave = (x) => y + Math.sin(x * 1.3 + t * 2.5) * 0.12 + Math.sin(x * 0.55 - t * 1.7) * 0.08;
    const body = g.createLinearGradient(0, y, 0, y + 5);
    body.addColorStop(0, '#ffb23f'); body.addColorStop(0.12, '#ff6a2b'); body.addColorStop(1, '#a8221a');
    g.fillStyle = body; g.beginPath(); g.moveTo(x0, bottom);
    for (let x = x0; x <= x1 + 0.5; x += 0.5) g.lineTo(x, wave(x));
    g.lineTo(x1 + 0.5, bottom); g.closePath(); g.fill();
    g.strokeStyle = '#ffe07a'; g.lineWidth = 0.08; g.beginPath();
    for (let x = x0; x <= x1 + 0.5; x += 0.5) g.lineTo(x, wave(x) + 0.03);
    g.stroke();
    g.fillStyle = '#ffd23f';
    for (let i = 0; i < 10; i++) {
      const ph = (t * 0.6 + i * 0.37) % 1, n = Math.floor(t * 0.6 + i * 0.37), bx = v.x + ((i * 7.31 + n * 3.7) % 1) * v.w;
      g.globalAlpha = 1 - ph; g.beginPath(); g.arc(bx, wave(bx) + 0.5 - ph * 0.8, 0.12 * (1 - ph) + 0.03, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  },
  tests(assert, { makeWorld, simulate }) {
    const game = this;
    assert(JSON.stringify(gen(42)) === JSON.stringify(gen(42)) && JSON.stringify(gen(42)) !== JSON.stringify(gen(43)), 'lava: generation follows the seed');
    for (const seed of [1, 2, 3, 7, 99, 500, 12345, 777777]) {
      const lv = gen(seed), rr = reachable(lv.rows);
      assert(lv.rows.length <= 300 && rr.has(1, TOP - 1), `lava seed ${seed}: the top can be reached with 3 tile jumps`);
    }
    // lava rises, then ends the run when it reaches a player who stands still
    let w = makeWorld(gen(3), game, { seed: 3 });
    const y0 = w.data.lava;
    simulate(w, 4);
    assert(w.data.lava < y0 && !w.over, 'lava: rises without ending the run straight away');
    simulate(w, 60);
    assert(!!w.over && w.over.score === 0 && /lava/.test(w.over.line), 'lava: touching the lava ends the run');
    // standing on a ledge 10 or more up scores its height for the lower player
    w = makeWorld(gen(5), game, { seed: 5 }); w.walkers = [];
    const rr = reachable(w.level.rows), [c, r] = [...rr.seen].map((k) => k.split(',').map(Number)).find(([, r]) => w.H - 2 - r >= 10 && w.H - 2 - r <= 14);
    w.players.forEach((p) => { p.x = c + 0.14; p.y = r + 1 - p.h - 0.02; p.vy = 0; });
    simulate(w, 0.5);
    assert(w.data.best === w.H - 2 - r, `lava: score is the height stood on (${w.data.best} vs ${w.H - 2 - r})`);
    // a beetle knock puts you back with your partner
    w.players[0].safe = 0; w.kill(w.players[0], 'walker'); simulate(w, 1.2);
    assert(!w.players[0].dead && Math.abs(w.players[0].y - w.players[1].y) < 1.5, 'lava: a knocked player comes back next to their partner');
  },
};
