// Checks Slither Snacks: eating grows a snake, boosting costs length, running into a body or the edge
// knocks a snake out and turns it into snacks, and long bot-only games stay sane (bots eat, grow, fight
// and come back, nothing leaves the arena, nobody's body tears apart). Also checks the Play Together
// snapshot round trip. Run with: node tools/test-snake.mjs
import { mulberry32 } from '../www/js/sudoku-engine.js';
import * as E from '../www/js/snake-engine.js';

const DT = 1 / 60;
let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; if (fail < 30) console.log('FAIL', msg); } };
const at = (s, x, y, ang) => { s.alive = true; s.ang = ang; s.pts = [...Array(30)].map((_, k) => ({ x: x - Math.cos(ang) * k * 0.34, y: y - Math.sin(ang) * k * 0.34 })); };

// 1. eating
{
  const w = E.createWorld(mulberry32(1)); w.food = [];
  const s = E.addSnake(w, { name: 'a' }); at(s, 0, 0, 0); s.mass = 12;
  w.food.push({ id: 9999, x: 2, y: 0, v: 5, c: 0 });
  for (let t = 0; t < 0.5; t += DT) { E.steer(s, 0); E.step(w, DT); }
  check(s.mass >= 17, `eat: grew to ${s.mass}`);
  check(!w.food.some((f) => f.id === 9999), 'eat: snack gone');
}
// 2. boosting is faster and costs length
{
  const w = E.createWorld(mulberry32(2));
  const a = E.addSnake(w, { name: 'a' }), b = E.addSnake(w, { name: 'b' });
  at(a, -20, -10, 0); at(b, -20, 10, 0); a.mass = b.mass = 60; w.food = [];
  for (let t = 0; t < 1; t += DT) { E.steer(a, 0, true); E.steer(b, 0, false); E.step(w, DT); }
  check(a.pts[0].x > b.pts[0].x + 3, `boost: faster (${a.pts[0].x.toFixed(1)} vs ${b.pts[0].x.toFixed(1)})`);
  check(a.mass < 58, `boost: costs mass (${a.mass.toFixed(1)})`);
  check(w.food.length > 0, 'boost: drops snacks');
}
// 3. head into a body: out, and the body becomes snacks; the other snake gets the kill
{
  const w = E.createWorld(mulberry32(3)); w.food = [];
  const a = E.addSnake(w, { name: 'a' }), b = E.addSnake(w, { name: 'b' });
  at(b, 5, 0, Math.PI / 2); b.pts = [...Array(90)].map((_, k) => ({ x: 5, y: 6 - k * 0.34 })); b.mass = 200;
  at(a, 0, 0, 0); a.mass = 20;
  for (let t = 0; t < 1.5 && a.alive; t += DT) { E.steer(a, 0); E.steer(b, Math.PI / 2); E.step(w, DT); }
  check(!a.alive, 'crash: out');
  check(b.alive && b.kills === 1, 'crash: the other snake gets the kill');
  check(w.food.length >= 3, `crash: became snacks (${w.food.length})`);
}
// 4. the edge knocks you out
{
  const w = E.createWorld(mulberry32(4));
  const a = E.addSnake(w, { name: 'a' }); at(a, E.R - 4, 0, 0);
  for (let t = 0; t < 2 && a.alive; t += DT) { E.steer(a, 0); E.step(w, DT); }
  check(!a.alive, 'edge: out');
}
// 5. long bot games at every speed
let deaths = 0, kills = 0, biggest = 0, eatenTotal = 0;
for (let g = 0; g < 9; g++) {
  const pace = [0.75, 1, 1.35][g % 3];
  const w = E.createWorld(mulberry32(100 + g), pace);
  const brains = [];
  for (let i = 0; i < 12; i++) { const s = E.addSnake(w, { name: 'b' + i, colourIdx: i % 9 }); E.spawn(w, s, 12 + i * 4); brains.push(E.makeBrain(w.rng)); }
  const wait = new Array(12).fill(0);
  for (let f = 0; f < 60 * 120; f++) { // two minutes
    const grid = E.bodyGrid(w);
    w.snakes.forEach((s, i) => { if (s.alive) E.think(w, s, brains[i], DT, grid); else if ((wait[i] += DT) > 2) { wait[i] = 0; E.spawn(w, s); brains[i] = E.makeBrain(w.rng); } });
    E.step(w, DT);
    eatenTotal += w.eaten.length; w.eaten = []; w.added = [];
    for (const e of w.events) { deaths++; if (e.by) kills++; }
    w.events = [];
    if (f % 30 === 0) for (const s of w.snakes) {
      if (!s.alive) continue;
      check(s.pts.every((p) => Number.isFinite(p.x) && Math.hypot(p.x, p.y) < E.R + 2), `game ${g}: ${s.name} outside the arena`);
      for (let k = 1; k < s.pts.length; k++) if (Math.hypot(s.pts[k].x - s.pts[k - 1].x, s.pts[k].y - s.pts[k - 1].y) > 0.36) { check(false, `game ${g}: ${s.name} body tore apart`); break; }
      biggest = Math.max(biggest, s.mass);
    }
    if (fail > 20) break;
  }
  check(w.food.length > 350, `game ${g}: arena kept stocked (${w.food.length})`);
}
console.log(`bots over 18 minutes: ${eatenTotal} snacks eaten, ${deaths} knocked out (${kills} by other snakes), biggest snake ${biggest.toFixed(0)}`);
check(eatenTotal > 5000, 'bots eat');
check(deaths > 10, 'bots knock each other out sometimes');
check(biggest > 60, 'bots grow');
// 6. Play Together snapshots: the guest's picture matches the host's world
{
  const w = E.createWorld(mulberry32(7));
  for (let i = 0; i < 4; i++) E.spawn(w, E.addSnake(w, { name: 's' + i }));
  let view = E.unpack(null, E.packSnakes(w), E.packFood(w, true));
  for (let f = 0; f < 200; f++) { E.step(w, DT); if (f % 3 === 0) view = E.unpack(view, E.packSnakes(w), E.packFood(w, false)); }
  check(view.food.size === w.food.length, `snapshot: food ${view.food.size} vs ${w.food.length}`);
  for (const s of w.snakes) {
    const v = view.snakes.find((x) => x.id === s.id);
    check(v && v.alive === s.alive, `snapshot: snake ${s.id} alive matches`);
    if (s.alive) check(Math.hypot(v.pts[0].x - s.pts[0].x, v.pts[0].y - s.pts[0].y) < 1.2, `snapshot: snake ${s.id} head close`);
  }
  const bytes = JSON.stringify({ s: E.packSnakes(w), f: E.packFood(w, false) }).length;
  console.log(`a snapshot is about ${bytes} bytes`);
  check(bytes < 12000, 'snapshot: small enough to send 20 times a second');
}
console.log(fail ? `${fail} FAILED` : 'all passed');
process.exit(fail ? 1 : 0);
