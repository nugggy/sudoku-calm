// Slither Snacks rules, kept apart from drawing so they can be tested on their own (and run by the host phone
// in Play Together). A round arena full of glowing snacks. Snakes glide towards where they are steered, grow as
// they eat, and can boost (which costs a little length, dropped behind as snacks). Run your head into another
// snake, or into the edge, and you are out: your body turns into a trail of big snacks for everyone else.
// Distances are in arena units; a new snake is about half a unit thick.
export const R = 64;              // arena radius
const SEG = 0.34;                 // spacing between body points
const SPEED = 7, BOOST = 12.5;    // units a second
const TURN = 4.6;                 // radians a second for a new snake; bigger snakes turn more slowly
const START = 12;                 // mass of a new snake
const FOOD_DENSITY = 0.05;        // snacks per square unit the arena keeps topped up to
export const SNACK_COLOURS = 9;   // food colour index range

const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const radiusOf = (mass) => 0.45 + Math.min(1.15, Math.sqrt(mass) * 0.032);
export const lengthOf = (mass) => 4 + mass * 0.12;            // body length in units
const pointsOf = (mass) => Math.max(8, Math.round(lengthOf(mass) / SEG));

// pace: the speed setting (1 is normal)
export function createWorld(rng = Math.random, pace = 1) {
  const w = { snakes: [], food: [], nextFood: 1, time: 0, rng, pace, events: [], eaten: [], added: [] };
  const target = Math.round(Math.PI * R * R * FOOD_DENSITY);
  for (let i = 0; i < target; i++) addFood(w, null, null, 1 + Math.floor(rng() * 2));
  w.eaten = []; w.added = [];
  return w;
}

// food: {id, x, y, v (how much it grows you), c (colour index)}
function addFood(w, x, y, v, c) {
  if (x === null) { const a = w.rng() * Math.PI * 2, d = Math.sqrt(w.rng()) * (R - 1.5); x = Math.cos(a) * d; y = Math.sin(a) * d; }
  const f = { id: w.nextFood++, x, y, v, c: c ?? Math.floor(w.rng() * SNACK_COLOURS) };
  w.food.push(f); w.added.push(f);
  return f;
}

export function addSnake(w, props) {
  const s = { id: w.snakes.length + 1, alive: false, pts: [], ang: 0, want: null, boost: false, mass: START, kills: 0, best: 0, dropT: 0, ...props };
  w.snakes.push(s);
  return s;
}

// Put a snake down somewhere clear of other heads and bodies, pointing roughly at the middle.
export function spawn(w, s, mass = START) {
  let x = 0, y = 0;
  for (let t = 0; t < 60; t++) {
    const a = w.rng() * Math.PI * 2, d = Math.sqrt(w.rng()) * (R - 10);
    x = Math.cos(a) * d; y = Math.sin(a) * d;
    const clear = w.snakes.every((o) => !o.alive || o === s || o.pts.every((p, k) => k % 4 || Math.hypot(p.x - x, p.y - y) > 8));
    if (clear) break;
  }
  s.alive = true; s.mass = mass; s.kills = 0; s.boost = false; s.want = null; s.best = mass;
  s.ang = Math.atan2(-y, -x) + (w.rng() - 0.5) * 1.6;
  const n = pointsOf(mass);
  s.pts = [...Array(n)].map((_, k) => ({ x: x - Math.cos(s.ang) * k * SEG, y: y - Math.sin(s.ang) * k * SEG }));
  return s;
}

export function steer(s, angle, boost) { s.want = angle; if (boost !== undefined) s.boost = boost; }

// Knock a snake out: its body becomes big snacks along where it lay.
export function kill(w, s, by = null) {
  if (!s.alive) return;
  s.alive = false;
  const pts = s.pts, total = s.mass * 0.8, n = Math.max(1, Math.floor(pts.length / 3)), each = total / n;
  for (let k = 0; k < pts.length; k += 3) {
    const p = pts[k], j = 0.4;
    addFood(w, p.x + (w.rng() - 0.5) * j, p.y + (w.rng() - 0.5) * j, Math.max(1, each), s.colourIdx ?? Math.floor(w.rng() * SNACK_COLOURS));
  }
  s.pts = [];
  if (by && by !== s) by.kills++;
  w.events.push({ k: 'die', s: s.id, by: by && by !== s ? by.id : 0 });
}

// A spatial grid of every body point, so collision checks only look nearby.
const CELL = 3, GN = Math.ceil((2 * R + 8) / CELL);
const gkey = (x, y) => Math.floor((x + R + 4) / CELL) * GN + Math.floor((y + R + 4) / CELL);
function bodyGrid(w) {
  const g = new Map();
  for (const s of w.snakes) {
    if (!s.alive) continue;
    const r = radiusOf(s.mass);
    s.pts.forEach((p, k) => { const kk = gkey(p.x, p.y); let b = g.get(kk); if (!b) g.set(kk, (b = [])); b.push(s, k, p.x, p.y, r); });
  }
  return g;
}
export function near(g, x, y, fn) {
  const cx = Math.floor((x + R + 4) / CELL), cy = Math.floor((y + R + 4) / CELL);
  for (let i = cx - 1; i <= cx + 1; i++) for (let j = cy - 1; j <= cy + 1; j++) {
    const b = g.get(i * GN + j); if (!b) continue;
    for (let q = 0; q < b.length; q += 5) fn(b[q], b[q + 1], b[q + 2], b[q + 3], b[q + 4]);
  }
}

// Move everything on by dt seconds.
export function step(w, dt) {
  w.time += dt;
  const live = w.snakes.filter((s) => s.alive);
  for (const s of live) {
    const r = radiusOf(s.mass);
    const turn = (TURN * w.pace) / (1 + (r - 0.45) * 1.4);
    if (s.want !== null && s.want !== undefined) { const d = wrap(s.want - s.ang); s.ang = wrap(s.ang + Math.max(-turn * dt, Math.min(turn * dt, d))); }
    const boosting = s.boost && s.mass > START + 2;
    const v = (boosting ? BOOST : SPEED) * w.pace;
    const head = s.pts[0];
    head.x += Math.cos(s.ang) * v * dt; head.y += Math.sin(s.ang) * v * dt;
    // the body follows the head like a chain
    for (let k = 1; k < s.pts.length; k++) {
      const a = s.pts[k - 1], b = s.pts[k], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d > SEG) { b.x = a.x + (dx / d) * SEG; b.y = a.y + (dy / d) * SEG; }
    }
    // boosting burns length, dropped behind as small snacks
    if (boosting) {
      s.mass -= 4.5 * dt; s.dropT -= dt;
      if (s.dropT <= 0) { const t = s.pts[s.pts.length - 1]; addFood(w, t.x, t.y, 1.5, s.colourIdx); s.dropT = 0.28; }
    }
    // grow or shrink towards the length the mass calls for
    const want = pointsOf(s.mass);
    while (s.pts.length < want) { const t = s.pts[s.pts.length - 1]; s.pts.push({ x: t.x, y: t.y }); }
    while (s.pts.length > want) s.pts.pop();
  }
  // eating: anything within reach of a head
  const fg = new Map();
  w.food.forEach((f, i) => { const kk = gkey(f.x, f.y); let b = fg.get(kk); if (!b) fg.set(kk, (b = [])); b.push(i); });
  const gone = new Set();
  for (const s of live) {
    const h = s.pts[0], reach = radiusOf(s.mass) + 0.75;
    const cx = Math.floor((h.x + R + 4) / CELL), cy = Math.floor((h.y + R + 4) / CELL);
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cy - 1; j <= cy + 1; j++) {
      for (const fi of fg.get(i * GN + j) || []) {
        if (gone.has(fi)) continue;
        const f = w.food[fi];
        if ((f.x - h.x) ** 2 + (f.y - h.y) ** 2 < reach * reach) { gone.add(fi); s.mass += f.v; w.eaten.push(f.id); }
      }
    }
    s.best = Math.max(s.best, s.mass);
  }
  if (gone.size) w.food = w.food.filter((_, i) => !gone.has(i));
  // collisions: a head that touches another snake's body is out; so is one that reaches the edge
  const g = bodyGrid(w), dead = new Map();
  for (const s of live) {
    const h = s.pts[0], r = radiusOf(s.mass);
    if (Math.hypot(h.x, h.y) + r > R) { dead.set(s, null); continue; }
    near(g, h.x, h.y, (o, k, x, y, ro) => {
      if (o === s || dead.has(s)) return;
      if ((x - h.x) ** 2 + (y - h.y) ** 2 < (ro + r * 0.55) ** 2) dead.set(s, k === 0 && radiusOf(o.mass) <= r ? null : o);
    });
  }
  for (const [s, by] of dead) kill(w, s, by && !dead.has(by) ? by : null);
  // keep the arena stocked
  const target = Math.round(Math.PI * R * R * FOOD_DENSITY);
  for (let i = Math.min(6, target - w.food.length); i > 0; i--) addFood(w, null, null, 1 + Math.floor(w.rng() * 2)); // a few at a time
}

// ---------- computer snakes ----------
// Every bot has its own character and thinks on its own rhythm, so no two move alike.
export function makeBrain(rng) {
  return {
    greed: 0.4 + rng() * 0.6,        // how much it goes out of its way for food
    aggro: rng(),                    // how keen it is to cut other snakes off
    care: 0.6 + rng() * 0.8,         // how far ahead it looks for danger
    zip: rng(),                      // how often it boosts
    wander: rng() * Math.PI * 2, next: rng() * 0.2, target: null, boostT: 0,
  };
}

// danger along a heading: 0 is clear, 1 is a wall of trouble right ahead
function danger(w, g, s, ang, look) {
  const h = s.pts[0], r = radiusOf(s.mass);
  let worst = 0;
  for (let d = 1; d <= look; d += 0.8) {
    const x = h.x + Math.cos(ang) * d, y = h.y + Math.sin(ang) * d, close = 1 - d / (look + 1);
    if (Math.hypot(x, y) + r > R - 0.5) return Math.max(worst, close);
    near(g, x, y, (o, k, px, py, ro) => {
      if (o === s && k < 14) return; // its own neck does not count
      if ((px - x) ** 2 + (py - y) ** 2 < (ro + r + 0.35) ** 2) worst = Math.max(worst, close);
    });
    if (worst >= close) break;
  }
  return worst;
}

export function think(w, s, br, dt, g) {
  br.next -= dt;
  if (br.next > 0) return;
  br.next = 0.06 + w.rng() * 0.14; // each bot decides on its own beat
  const h = s.pts[0], r = radiusOf(s.mass);
  let aim = null, boost = false;
  // hunt: get ahead of a smaller snake's head and cut across it
  if (br.aggro > 0.45) {
    let best = null;
    for (const o of w.snakes) {
      if (!o.alive || o === s || o.mass > s.mass * 1.3) continue;
      const oh = o.pts[0], d = Math.hypot(oh.x - h.x, oh.y - h.y);
      if (d < 14 * br.aggro && (!best || d < best.d)) best = { o, d };
    }
    if (best) {
      const oh = best.o.pts[0], lead = 3 + best.d * 0.4;
      aim = [oh.x + Math.cos(best.o.ang) * lead, oh.y + Math.sin(best.o.ang) * lead];
      boost = s.mass > 30 && br.zip > 0.4 && best.d < 9;
    }
  }
  // food: the richest spot nearby (snacks left by a fallen snake are worth a dash)
  if (!aim) {
    let best = null;
    const range = 7 + br.greed * 9;
    for (const f of w.food) {
      const dx = f.x - h.x, dy = f.y - h.y;
      if (Math.abs(dx) > range || Math.abs(dy) > range) continue;
      const d = Math.hypot(dx, dy) + 0.5, ahead = Math.cos(Math.atan2(dy, dx) - s.ang);
      const score = (f.v * (1 + br.greed)) / d * (0.6 + 0.4 * ahead);
      if (!best || score > best.score) best = { f, score };
    }
    if (best) { aim = [best.f.x, best.f.y]; boost = best.f.v >= 3 && s.mass > 25 && br.zip > 0.55 && w.rng() < 0.5; }
  }
  // wander gently, and head back in from the edge
  if (!aim) {
    br.wander += (w.rng() - 0.5) * 0.8;
    aim = [h.x + Math.cos(br.wander) * 10, h.y + Math.sin(br.wander) * 10];
  }
  if (Math.hypot(h.x, h.y) > R - 10) aim = [0, 0];
  let want = Math.atan2(aim[1] - h.y, aim[0] - h.x);
  // look ahead: if the way is blocked, take the clearest heading near the one wanted
  const look = (5 + r * 4) * br.care;
  if (danger(w, g, s, want, look) > 0.05) {
    let bestA = want, bestD = Infinity;
    for (const off of [0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.2, -2.2, 2.9, -2.9]) {
      const d = danger(w, g, s, want + off, look) + Math.abs(off) * 0.04;
      if (d < bestD) { bestD = d; bestA = want + off; }
    }
    want = bestA; boost = false;
  }
  steer(s, want, boost);
}
export { bodyGrid };

// ---------- for Play Together: what the host sends, and how the guest rebuilds it ----------
// Snakes go as head, heading, mass and a few body points; the guest fills in the rest of each body by
// drawing a smooth line through them. Food goes as changes since the last snapshot, with a full list now and then.
const r1 = (v) => Math.round(v * 10) / 10;
export function packSnakes(w) {
  return w.snakes.map((s) => (s.alive
    ? [s.id, 1, r1(s.ang), Math.round(s.mass), s.boost ? 1 : 0, s.kills, s.pts.filter((_, k) => k % 4 === 0 || k === s.pts.length - 1).flatMap((p) => [r1(p.x), r1(p.y)])]
    : [s.id, 0]));
}
export function packFood(w, full) {
  const out = full ? { all: w.food.map((f) => [f.id, r1(f.x), r1(f.y), Math.round(f.v * 10) / 10, f.c]) }
    : { add: w.added.map((f) => [f.id, r1(f.x), r1(f.y), Math.round(f.v * 10) / 10, f.c]), del: w.eaten };
  w.added = []; w.eaten = [];
  return out;
}
// guest side: rebuild a world-like object good enough to draw
export function unpack(view, snakes, food) {
  view = view || { snakes: [], food: new Map() };
  for (const a of snakes) {
    const [id, alive] = a;
    let s = view.snakes.find((x) => x.id === id);
    if (!s) { s = { id, alive: false, pts: [] }; view.snakes.push(s); }
    s.alive = !!alive;
    if (!alive) { s.pts = []; continue; }
    s.ang = a[2]; s.mass = a[3]; s.boost = !!a[4]; s.kills = a[5];
    const k = a[6], pts = [];
    for (let i = 0; i + 3 < k.length; i += 2) {
      for (let t = 0; t < 4; t++) { const f = t / 4; pts.push({ x: k[i] + (k[i + 2] - k[i]) * f, y: k[i + 1] + (k[i + 3] - k[i + 1]) * f }); }
    }
    pts.push({ x: k[k.length - 2], y: k[k.length - 1] });
    s.pts = pts;
  }
  if (food) {
    if (food.all) { view.food = new Map(food.all.map((f) => [f[0], { id: f[0], x: f[1], y: f[2], v: f[3], c: f[4] }])); }
    else { for (const id of food.del || []) view.food.delete(id); for (const f of food.add || []) view.food.set(f[0], { id: f[0], x: f[1], y: f[2], v: f[3], c: f[4] }); }
  }
  return view;
}
