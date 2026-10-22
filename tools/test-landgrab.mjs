// Checks Land Grab: claiming land with a loop, the ways to be knocked out, walls that do not knock you out,
// taking over a knocked-out player's land, and long bot-only games on every map
// (land counts stay consistent, bots grow, fight and come back, nobody ends up inside a wall).
// Run with: node tools/test-landgrab.mjs
import { mulberry32 } from '../www/js/sudoku-engine.js';
import * as E from '../www/js/landgrab-engine.js';

const { N } = E;
const DT = 1 / 60;
let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('FAIL', msg); } };
const recount = (w, p) => { let n = 0; for (let i = 0; i < N * N; i++) if (w.owner[i] === p.id) n++; return n; };

// a hand-placed player with a round patch of land at (cx, cy), heading along ang
function place(w, p, cx, cy, ang) {
  p.alive = true; p.x = cx + 0.5; p.y = cy + 0.5; p.ang = ang; p.trail = []; p.path = []; p.box = { x0: cx - 4, y0: cy - 4, x1: cx + 4, y1: cy + 4 };
  for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= 9) { w.owner[y * N + x] = p.id; p.cells++; }
}
// steer one player towards an angle for some seconds (everyone else carries on)
const drive = (w, p, ang, secs) => { for (let t = 0; t < secs; t += DT) { E.steer(p, ang); E.step(w, DT); } };
const R = 0, D = Math.PI / 2, L = Math.PI, U = -Math.PI / 2;

// 1. a loop out and back claims the enclosed area
{
  const w = E.createWorld(mulberry32(1)), p = E.addPlayer(w, { name: 'a' });
  place(w, p, 40, 40, R);
  drive(w, p, R, 1.4); drive(w, p, D, 1.4); drive(w, p, L, 1.4); drive(w, p, U, 1.8);
  check(p.alive, 'loop: still alive');
  check(p.trail.length === 0, 'loop: trail claimed');
  check(w.owner[45 * N + 45] === p.id, 'loop: enclosed cell claimed');
  check(recount(w, p) === p.cells, `loop: count ${p.cells} vs ${recount(w, p)}`);
  check(p.cells > 29 + 60, `loop: grew to ${p.cells}`);
}
// 2. crossing your own trail knocks you out
{
  const w = E.createWorld(mulberry32(2)), p = E.addPlayer(w, { name: 'a' });
  place(w, p, 40, 40, R);
  drive(w, p, R, 1.6); drive(w, p, D, 0.8); drive(w, p, L, 0.8); drive(w, p, U, 1.2);
  check(!p.alive, 'self cross: out');
  check(recount(w, p) === 0 && p.cells === 0, 'self cross: land cleared');
}
// 3. the edge is a wall: you slide along it and stay in
{
  const w = E.createWorld(mulberry32(3)), p = E.addPlayer(w, { name: 'a' });
  place(w, p, 6, 40, L);
  drive(w, p, L, 2);
  check(p.alive, 'edge: still in');
  check(p.x >= 0 && p.x < 1.2, `edge: against the wall (x ${p.x.toFixed(2)})`);
  drive(w, p, L - 0.6, 1); // at an angle into the wall (left and down): slides down along it
  check(p.alive && p.x >= 0 && p.y > 41, `edge: slid along (y ${p.y.toFixed(1)})`);
}
// 4. crossing someone's trail knocks them out, and their land becomes yours
{
  const w = E.createWorld(mulberry32(4)), a = E.addPlayer(w, { name: 'a' }), b = E.addPlayer(w, { name: 'b' });
  place(w, a, 30, 30, R); place(w, b, 40, 60, U);
  const aLand = a.cells, bBefore = b.cells;
  for (let t = 0; t < 1.3; t += DT) { E.steer(a, R); E.steer(b, R); E.step(w, DT); } // a lays a trail along y≈30
  b.x = 42.5; b.y = 36.5; b.ang = U; b.trail = []; b.path = [];
  for (let t = 0; t < 1.2 && a.alive; t += DT) { E.steer(a, R); E.steer(b, U); E.step(w, DT); }
  check(!a.alive, 'cut: trail owner out');
  check(b.alive && b.kills === 1, 'cut: cutter alive with a kill');
  check(b.cells >= bBefore + aLand - 1, `cut: land handed over (${b.cells} from ${bBefore} + ${aLand})`);
  check(recount(w, b) === b.cells && recount(w, a) === 0, 'cut: counts match');
}
// 5. water is a wall too
{
  const w = E.createWorld(mulberry32(5), E.mapById('lake')), p = E.addPlayer(w, { name: 'a' });
  place(w, p, 30, 60, R);
  drive(w, p, R, 3);
  check(p.alive && w.open[E.cellAt(p.x, p.y)] === 1, 'lake: stopped at the water, still in');
}
// 6. long bot-only games on every map
let deaths = 0, peak = 0, claims = 0, kills = 0, handed = 0;
for (let g = 0; g < 12; g++) {
  const w = E.createWorld(mulberry32(100 + g), E.MAPS[g % E.MAPS.length]);
  const brains = [];
  for (let i = 0; i < 10; i++) { const p = E.addPlayer(w, { name: 'b' + i }); E.spawn(w, p); brains.push(E.makeBrain(w.rng, 0.2 + (i % 5) * 0.18)); }
  const wait = new Array(10).fill(0);
  for (let f = 0; f < 60 * 180; f++) { // three minutes
    if (f % 6 === 0) w.players.forEach((p, i) => { if (p.alive) E.think(w, p, brains[i]); else if (++wait[i] > 30 && E.spawn(w, p)) { wait[i] = 0; brains[i] = E.makeBrain(w.rng, brains[i].level); } });
    E.step(w, DT);
    for (const p of w.players) if (p.alive) check(Number.isFinite(p.x) && w.open[E.cellAt(p.x, p.y)] === 1, `game ${g}: ${p.name} is inside a wall at ${p.x},${p.y}`);
    for (const e of w.events) { if (e.k === 'die') { deaths++; if (e.by) { kills++; handed++; } } else if (e.k === 'claim') claims++; }
    w.events = [];
    if (fail > 20) break;
  }
  for (let i = 0; i < N * N; i++) if (!w.open[i]) check(!w.owner[i] && !w.trail[i], `game ${g}: closed cell ${i} taken`);
  for (const p of w.players) { check(recount(w, p) === p.cells, `game ${g}: ${p.name} count ${p.cells} vs ${recount(w, p)}`); peak = Math.max(peak, E.pct(p)); }
  let tr = 0; for (let i = 0; i < N * N; i++) if (w.trail[i]) tr++;
  check(tr === w.players.reduce((s, p) => s + (p.alive ? p.trail.length : 0), 0), `game ${g}: trail cells match`);
}
console.log(`bots over 36 minutes on all maps: ${claims} claims, ${deaths} knocked out (${kills} by others), biggest ${peak.toFixed(1)}%`);
check(claims > 1000, 'bots claim land');
check(peak > 4, 'bots grow');
check(deaths > 20 && deaths < 1200, 'bots get knocked out sometimes, not constantly');
console.log(fail ? `${fail} FAILED` : 'all passed');
process.exit(fail ? 1 : 0);
