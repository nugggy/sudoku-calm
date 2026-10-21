// Checks Land Grab: capture and enclosure, the ways to be knocked out, and long bot-only games
// (land counts stay consistent, bots grow, fight and come back).
// Run with: node tools/test-landgrab.mjs
import { mulberry32 } from '../www/js/sudoku-engine.js';
import * as E from '../www/js/landgrab-engine.js';

const { N } = E;
let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('FAIL', msg); } };
const recount = (w, p) => { let n = 0; for (let i = 0; i < N * N; i++) if (w.owner[i] === p.id) n++; return n; };

// a hand-placed player with a 5x5 home at (cx, cy)
function place(w, p, cx, cy, dir) {
  p.alive = true; p.x = p.px = cx; p.y = p.py = cy; p.dir = dir; p.trail = []; p.box = { x0: cx - 2, y0: cy - 2, x1: cx + 2, y1: cy + 2 };
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) { w.owner[y * N + x] = p.id; p.cells++; }
}
const go = (w, p, d, n) => { for (let k = 0; k < n; k++) { E.steer(p, d); E.step(w); } };

// 1. a loop out and back claims the enclosed area
{
  const w = E.createWorld(mulberry32(1)), p = E.addPlayer(w, { name: 'a' });
  place(w, p, 20, 20, 1);
  go(w, p, 1, 6);  // right: 2 cells inside, then out to x=26
  go(w, p, 2, 6);  // down to y=26
  go(w, p, 3, 6);  // left to x=20
  go(w, p, 0, 4);  // up into home (y=22)
  check(p.alive, 'loop: still alive');
  check(p.trail.length === 0, 'loop: trail claimed');
  check(w.owner[24 * N + 24] === p.id, 'loop: enclosed cell claimed');
  check(recount(w, p) === p.cells, `loop: count ${p.cells} vs ${recount(w, p)}`);
  check(p.cells > 25 + 30, `loop: grew to ${p.cells}`);
}
// 2. crossing your own trail knocks you out
{
  const w = E.createWorld(mulberry32(2)), p = E.addPlayer(w, { name: 'a' });
  place(w, p, 20, 20, 1);
  go(w, p, 1, 6); go(w, p, 2, 3); go(w, p, 3, 2); go(w, p, 0, 3);
  check(!p.alive, 'self cross: out');
  check(recount(w, p) === 0 && p.cells === 0, 'self cross: land cleared');
}
// 3. the edge knocks you out
{
  const w = E.createWorld(mulberry32(3)), p = E.addPlayer(w, { name: 'a' });
  place(w, p, 3, 20, 3);
  go(w, p, 3, 4);
  check(!p.alive, 'edge: out');
}
// 4. crossing someone's trail knocks them out and counts as a kill
{
  const w = E.createWorld(mulberry32(4)), a = E.addPlayer(w, { name: 'a' }), b = E.addPlayer(w, { name: 'b' });
  place(w, a, 20, 20, 1); place(w, b, 40, 30, 0);
  go(w, a, 1, 8); // a's trail runs along y=20 from x=23
  // b comes up through x=25
  b.x = 25; b.y = 23; b.dir = 0; b.px = 25; b.py = 24;
  for (let k = 0; k < 3; k++) { E.steer(b, 0); E.step(w); }
  check(!a.alive, 'cut: trail owner out');
  check(b.alive && b.kills === 1, 'cut: cutter alive with a kill');
}
// 5. turning straight back is ignored
{
  const w = E.createWorld(mulberry32(5)), p = E.addPlayer(w, { name: 'a' });
  place(w, p, 20, 20, 1);
  go(w, p, 1, 4); E.steer(p, 3); E.step(w);
  check(p.alive && p.dir === 1, 'no reverse');
}
// 6. long bot-only games
let deaths = 0, peak = 0, claims = 0, kills = 0;
for (let g = 0; g < 12; g++) {
  const w = E.createWorld(mulberry32(100 + g), E.MAPS[g % E.MAPS.length]);
  const brains = [];
  for (let i = 0; i < 10; i++) { const p = E.addPlayer(w, { name: 'b' + i }); E.spawn(w, p); brains.push(E.makeBrain(w.rng, 0.2 + (i % 5) * 0.18)); }
  const wait = new Array(10).fill(0);
  for (let t = 0; t < 8 * 240; t++) { // four minutes
    w.players.forEach((p, i) => { if (p.alive) E.think(w, p, brains[i]); else if (++wait[i] > 24 && E.spawn(w, p)) { wait[i] = 0; brains[i] = E.makeBrain(w.rng, brains[i].level); } });
    E.step(w);
    for (const e of w.events) { if (e.k === 'die') { deaths++; if (e.by) kills++; } else if (e.k === 'claim') claims++; }
    w.events = [];
  }
  for (let i = 0; i < N * N; i++) if (!w.open[i]) check(!w.owner[i] && !w.trail[i], `game ${g}: closed cell ${i} taken`);
  for (const p of w.players) { check(recount(w, p) === p.cells, `game ${g}: ${p.name} count ${p.cells} vs ${recount(w, p)}`); peak = Math.max(peak, E.pct(p)); }
  let tr = 0; for (let i = 0; i < N * N; i++) if (w.trail[i]) tr++;
  check(tr === w.players.reduce((s, p) => s + (p.alive ? p.trail.length : 0), 0), `game ${g}: trail cells match`);
}
console.log(`bots over 48 minutes on all maps: ${claims} claims, ${deaths} knocked out (${kills} by others), biggest ${peak.toFixed(1)}%`);
check(claims > 1000, 'bots claim land');
check(peak > 4, 'bots grow');
check(deaths > 20 && deaths < 1200, 'bots get knocked out sometimes, not constantly');
console.log(fail ? `${fail} FAILED` : 'all passed');
process.exit(fail ? 1 : 0);
