// Jump Mates engine: tile physics for two players and the shared level pieces every game can use.
// Pure logic, no DOM, so tools/test-mates.mjs can run it in Node. See README.md for the level legend and game API.
//
// Units are tiles: x runs right, y runs DOWN (like the level text), and tile (c, r) covers [c, c+1) x [r, r+1).
// Bodies (players, crates, walkers) are boxes { x, y, w, h } with (x, y) their top left corner.

// Movement tuning. A player jumps a little over 3 tiles high and clears a 5 tile gap; standing on their
// partner's head adds about 1 tile. Each world gets its own copy (world.P), so a game can change it.
export const PHYS = {
  g: 42, jump: 17, run: 7, accel: 70, air: 45, fall: 22, coyote: 0.1, buffer: 0.13, cut: 0.42,
  spring: 25, stomp: 11, walker: 2, plat: 2.5, slip: 1,
};
export const PW = 0.72, PH = 0.9;
export const STEP = 1 / 120;

// The base legend. A tile is { solid, oneway, hazard: [x0, y0, x1, y1] box inside the tile or fn(world, p, c, r),
// touch(world, body, c, r), bump(world, body, c, r) when a body runs into a solid tile, kind (for drawing) }.
// solid and hazard may be functions (world, body) -> bool. Games add or replace entries with `tiles`.
const gateTile = (k) => ({ kind: 'gate', key: k, solid: (w) => !w.open[k] });
export const BASE_TILES = {
  '#': { solid: true, kind: 'ground' },
  'B': { solid: true, kind: 'brick' },
  'x': { solid: true, kind: 'crack' },
  '=': { oneway: true, kind: 'ledge' },
  '^': { hazard: [0.12, 0.5, 0.88, 1], kind: 'spikes' },
  'v': { hazard: [0.12, 0, 0.88, 0.5], kind: 'spikesDown' },
  '~': { hazard: [0, 0.35, 1, 1], kind: 'water' },
  'E': { kind: 'exit' },
  'a': { kind: 'exit1' },
  'b': { kind: 'exit2' },
  'o': { kind: 'coin', touch(w, b, c, r) { if (b.player) { w.set(c, r, '.'); w.coins++; w.emit('coin', c + 0.5, r + 0.5, b); } } },
  '*': { kind: 'gem', touch(w, b, c, r) { if (b.player) { w.set(c, r, '.'); w.gems++; w.emit('gem', c + 0.5, r + 0.5, b); } } },
  'K': { solid: true, kind: 'lock', bump(w, b, c, r) { if (b.player && b.key) { w.useKey(b); w.set(c, r, '.'); w.emit('unlock', c + 0.5, r + 0.5, b); } } },
  's': { kind: 'spring', touch(w, b, c, r) { if (b.vy * b.gdir >= 0 && b.y + b.h > r + 0.55) { b.vy = -w.P.spring * b.gdir; b.noCut = true; b.on = null; b.ground = false; w.springT[`${c},${r}`] = w.t; w.emit('boing', c + 0.5, r + 1, b); } } },
  'F': { kind: 'flag', touch(w, b, c, r) { if (b.player && w.flag !== `${c},${r}`) { w.flag = `${c},${r}`; w.players.forEach((p) => { p.sx = c + 0.5 - p.w / 2 + (p.id ? 0.4 : -0.4); p.sy = r + 1 - p.h; }); w.emit('flag', c + 0.5, r + 0.5, b); } } },
  'u': { kind: 'plate', key: 'u' }, 'i': { kind: 'plate', key: 'i' }, 'y': { kind: 'plate', key: 'y' },
  'U': gateTile('u'), 'I': gateTile('i'), 'Y': gateTile('y'),
  'j': { kind: 'lever', key: 'j' },
  'J': { kind: 'gate', key: 'j', solid: (w) => !w.open.j },
  '|': { kind: 'stop' },
};
const PLATE_KEYS = ['u', 'i', 'y'];

// Turns level text into a world. `game` may supply tiles, setup(world) and the rest of the hooks (see README).
export function makeWorld(level, game = {}, opts = {}) {
  const rows = level.rows.map((r) => r.replace(/ /g, '.'));
  const H = rows.length, W = Math.max(...rows.map((r) => r.length));
  const tiles = { ...BASE_TILES, ...(game.tiles || {}) };
  const w = {
    W, H, level, game, tiles, P: { ...PHYS, ...(game.phys || {}), ...(level.phys || {}) },
    grid: rows.map((r) => r.padEnd(W, '.').split('')),
    t: 0, coins: 0, coinsTotal: 0, gems: 0, gemsTotal: 0, deaths: 0, won: false, over: null, exitT: 0,
    players: [], crates: [], walkers: [], plats: [], keys: [], ents: [],
    open: {}, flag: null, springT: {}, ev: [], sepX: Infinity, sepY: Infinity, data: {},
    rng: mulberry(opts.seed ?? 1),
  };
  Object.assign(w, worldApi);
  // pull bodies out of the text
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const ch = w.grid[r][c];
      if (ch === '1' || ch === '2') { w.players[+ch - 1] = makePlayer(+ch - 1, c, r); w.grid[r][c] = '.'; }
      else if (ch === 'C' || ch === 'H') { w.crates.push(makeBody({ kind: 'crate', x: c + 0.01, y: r + 0.02, w: 0.98, h: 0.98, heavy: ch === 'H', crate: true })); w.grid[r][c] = '.'; }
      else if (ch === 'e') { w.walkers.push(makeBody({ kind: 'walker', x: c + 0.1, y: r + 0.35, w: 0.8, h: 0.65, dir: -1 })); w.grid[r][c] = '.'; }
      else if (ch === 'k') { w.keys.push({ x: c + 0.5, y: r + 0.5, hx: c + 0.5, hy: r + 0.5, by: null }); w.grid[r][c] = '.'; }
      else if (ch === 'M' || ch === 'N') {
        let n = 1; while (w.grid[r][c + n] === ch) n++;
        w.plats.push(makeBody({ kind: 'plat', x: c, y: r, w: n, h: 0.4, vx: ch === 'M' ? w.P.plat : 0, vy: ch === 'N' ? -w.P.plat * 0.8 : 0 }));
        for (let k = 0; k < n; k++) w.grid[r][c + k] = '.';
      } else if (ch === 'o') w.coinsTotal++;
      else if (ch === '*') w.gemsTotal++;
    }
  }
  if (!w.players[0] || !w.players[1]) throw new Error(`level "${level.name || '?'}" needs a 1 and a 2`);
  w.hasOwnExits = rows.some((r) => r.includes('a') || r.includes('b'));
  w.rescan();
  updateSwitches(w);
  game.setup?.(w);
  return w;
}

function makeBody(o) { return { vx: 0, vy: 0, gdir: 1, ground: false, on: null, dx: 0, dy: 0, alive: true, ...o }; }
function makePlayer(id, c, r) {
  const x = c + 0.5 - PW / 2, y = r + 1 - PH;
  return makeBody({ kind: 'player', player: true, id, x, y, w: PW, h: PH, sx: x, sy: y, face: id ? -1 : 1,
    coyote: 0, buffer: 0, dead: 0, safe: 0, key: null, inExit: false, air: 0, squash: 0, run: 0, apart: 0,
    in: { x: 0, up: false, down: false, jump: false, act: false, jumpP: false, actP: false } });
}

const worldApi = {
  get(c, r) { if (c < 0 || c >= this.W) return '#'; if (r < 0 || r >= this.H) return '.'; return this.grid[r][c]; },
  set(c, r, ch) { if (c >= 0 && c < this.W && r >= 0 && r < this.H) this.grid[r][c] = ch; },
  tile(c, r) { return this.tiles[this.get(c, r)]; },
  emit(k, x, y, b = null, extra = {}) { this.ev.push({ k, x, y, p: b && b.player ? b.id : -1, ...extra }); },
  solidAt(c, r, b) { const t = this.tile(c, r); if (!t || !t.solid) return false; return typeof t.solid === 'function' ? t.solid(this, b, c, r) : true; },
  kill(p, why = '') { killPlayer(this, p, why); },
  useKey(p) { const k = this.keys.find((q) => q.by === p); if (k) { k.used = true; k.by = null; } p.key = null; },
  finish(score, line = '') { if (!this.over) this.over = { score, line }; },
  partner(p) { return this.players[1 - p.id]; },
  // every tile overlapping a box, as [c, r]
  cells(x, y, wd, ht) { const out = []; for (let r = Math.floor(y); r < Math.ceil(y + ht); r++) for (let c = Math.floor(x); c < Math.ceil(x + wd); c++) out.push([c, r]); return out; },
  step(dt = STEP) { stepWorld(this, dt); },
  // Finds plates and gates again (call after a game adds or removes them with set()).
  rescan() {
    this.plateCells = []; this.gateCells = [];
    for (let r = 0; r < this.H; r++) for (let c = 0; c < this.W; c++) {
      const t = this.tiles[this.grid[r][c]]; if (!t) continue;
      if (t.kind === 'plate') this.plateCells.push([c, r, t.key]);
      else if (t.kind === 'gate') this.gateCells.push([c, r, t.key]);
    }
  },
};

export function overlap(a, b, m = 0) { return a.x + m < b.x + b.w && b.x + m < a.x + a.w && a.y + m < b.y + b.h && b.y + m < a.y + a.h; }

// ---------- Movement and collision ----------
// Solid boxes for a body: crates (all sides) except itself.
function solidBodies(w, b) { return w.crates.filter((c) => c !== b && c.alive); }
// Surfaces a body can land on from above: platforms, players and walkers' backs are not included (walkers hurt).
function tops(w, b) {
  const out = w.plats.filter((p) => p.alive);
  for (const p of w.players) if (p !== b && !p.dead && p.gdir === 1 && !(b.player && b.gdir !== 1)) out.push(p);
  if (w.game.tops) out.push(...w.game.tops(w, b));
  return out;
}

// Moves a body sideways, stopping at solid tiles and crates. Players push crates. Returns the distance moved.
export function moveX(w, b, dx) {
  if (!dx) return 0;
  const x0 = b.x;
  let nx = b.x + dx;
  const r0 = Math.floor(b.y + 0.001), r1 = Math.ceil(b.y + b.h - 0.001);
  if (dx > 0) {
    const c = Math.floor(nx + b.w - 0.0001);
    for (let r = r0; r < r1; r++) if (w.solidAt(c, r, b)) { nx = Math.min(nx, c - b.w); w.tile(c, r).bump?.(w, b, c, r); }
  } else {
    const c = Math.floor(nx);
    for (let r = r0; r < r1; r++) if (w.solidAt(c, r, b)) { nx = Math.max(nx, c + 1); w.tile(c, r).bump?.(w, b, c, r); }
  }
  for (const o of solidBodies(w, b)) {
    if (!(b.y + 0.01 < o.y + o.h && o.y + 0.01 < b.y + b.h)) continue;
    if (dx > 0 && b.x + b.w <= o.x + 0.001 && nx + b.w > o.x) {
      if (b.player || b.crate) pushCrate(w, o, nx + b.w - o.x, b);
      nx = Math.min(nx, o.x - b.w);
    } else if (dx < 0 && b.x >= o.x + o.w - 0.001 && nx < o.x + o.w) {
      if (b.player || b.crate) pushCrate(w, o, nx - (o.x + o.w), b);
      nx = Math.max(nx, o.x + o.w);
    }
  }
  if (b.player && !b.dead) {
    const q = w.partner(b);
    if (!q.dead && Number.isFinite(w.sepX)) {
      const cq = q.x + q.w / 2;
      nx = Math.max(cq - w.sepX - b.w / 2, Math.min(cq + w.sepX - b.w / 2, nx));
      if ((dx > 0 && nx < b.x) || (dx < 0 && nx > b.x)) nx = b.x; // never pulled backwards by the leash
    }
  }
  b.x = nx;
  const moved = b.x - x0;
  if (moved) carryRiders(w, b, moved, 0);
  return moved;
}

// Players (and pushed crates) shove a crate along. A heavy crate only moves with both players pushing together.
function pushCrate(w, o, dx, by) {
  if (!dx) return;
  if (o.heavy) {
    o.pushers = o.pushers || new Set(); o.pushers.add(by.player ? by.id : 'c');
    if (o.pushers.size < 2 && !(by.crate)) return;
  }
  const lim = by.player ? Math.sign(dx) * Math.min(Math.abs(dx), (o.heavy ? 2.2 : 4.5) * STEP * 1.01) : dx;
  o.pushed = Math.sign(dx);
  moveX(w, o, lim);
}

// Moves a body up or down. Lands on solid tiles, one-way ledges, crates and top surfaces (players, platforms).
export function moveY(w, b, dy) {
  if (!dy) return 0;
  const y0 = b.y, landing = Math.sign(dy) === b.gdir;
  let ny = b.y + dy, hit = null;
  const c0 = Math.floor(b.x + 0.001), c1 = Math.ceil(b.x + b.w - 0.001);
  if (dy > 0) {
    const r = Math.floor(ny + b.h - 0.0001), was = b.y + b.h;
    for (let c = c0; c < c1; c++) {
      const t = w.tile(c, r);
      const oneway = t && t.oneway && b.gdir === 1 && was <= r + 0.02 && !(b.player && b.in.down && b.dropT > 0);
      if (w.solidAt(c, r, b) || oneway) { if (r - b.h < ny) { ny = r - b.h; hit = 'tile'; } if (!oneway) t.bump?.(w, b, c, r); }
    }
    for (const o of solidBodies(w, b)) if (b.x + 0.01 < o.x + o.w && o.x + 0.01 < b.x + b.w && was <= o.y + 0.001 && ny + b.h > o.y) { if (o.y - b.h < ny) { ny = o.y - b.h; hit = o; } }
    if (b.gdir === 1) for (const o of tops(w, b)) if (b.x + 0.02 < o.x + o.w && o.x + 0.02 < b.x + b.w && was <= o.y + 0.02 && ny + b.h > o.y) { if (o.y - b.h < ny) { ny = o.y - b.h; hit = o; } }
  } else {
    const r = Math.floor(ny);
    for (let c = c0; c < c1; c++) if (w.solidAt(c, r, b)) { if (r + 1 > ny) { ny = r + 1; hit = 'tile'; } w.tile(c, r).bump?.(w, b, c, r); }
    for (const o of solidBodies(w, b)) if (b.x + 0.01 < o.x + o.w && o.x + 0.01 < b.x + b.w && b.y >= o.y + o.h - 0.001 && ny < o.y + o.h) { if (o.y + o.h > ny) { ny = o.y + o.h; hit = o; } }
  }
  b.y = ny;
  if (hit) {
    if (landing) { b.ground = true; b.on = hit; } else if (b.player && b.vy * b.gdir < 0) w.emit('bonk', b.x + b.w / 2, dy < 0 ? b.y : b.y + b.h, b);
    b.vy = 0;
  }
  const moved = b.y - y0;
  if (moved) carryRiders(w, b, 0, moved);
  return moved;
}

// Anything standing on `b` moves with it.
function carryRiders(w, b, dx, dy) {
  if (b.carrying) return; // no loops
  b.carrying = true;
  for (const r of [...w.players, ...w.crates, ...w.walkers]) {
    if (r === b || r.on !== b || r.dead) continue;
    if (dy < 0) { r.y += dy; } // being lifted: go straight up with it, then sort out the sides
    if (dx) moveX(w, r, dx);
    if (dy > 0) moveY(w, r, dy);
  }
  b.carrying = false;
}

// ---------- Players ----------
function killPlayer(w, p, why) {
  if (p.dead || p.safe > 0 || w.won) return;
  p.dead = 0.9; p.vx = p.vy = 0; p.on = null;
  w.deaths++;
  if (p.key) { const k = w.keys.find((q) => q.by === p); if (k) { k.by = null; k.x = k.hx; k.y = k.hy; } p.key = null; }
  w.emit('die', p.x + p.w / 2, p.y + p.h / 2, p, { why });
  w.game.onDie?.(w, p, why);
}
function respawn(w, p) {
  p.dead = 0; p.safe = 1.2; p.vx = p.vy = 0; p.gdir = p.gdir0 ?? 1;
  const q = w.partner(p);
  // a respawn point covered by a crate or the partner is nudged clear
  p.x = p.sx; p.y = p.sy;
  if (!q.dead && overlap(p, q)) p.x = q.x + (p.id ? q.w : -p.w);
  w.game.onRespawn?.(w, p);
  w.emit('spawn', p.x + p.w / 2, p.y + p.h / 2, p);
}

function stepPlayer(w, p, dt) {
  const P = w.P, I = p.in;
  if (p.dead) { p.dead -= dt; if (p.dead <= 0) respawn(w, p); return; }
  if (p.safe > 0) p.safe -= dt;
  p.dropT = I.down ? (p.dropT || 0) + dt : 0;
  if (w.game.control?.(w, p, dt) === false) return; // the game moved this player itself
  const slip = (p.ground && p.on === 'tile' && tileUnder(w, p)?.ice) ? P.slip * 0.12 : 1;
  const target = I.x * P.run * (p.speed ?? 1);
  const acc = (p.ground ? P.accel : P.air) * slip;
  if (target > p.vx) p.vx = Math.min(target, p.vx + acc * dt);
  else if (target < p.vx) p.vx = Math.max(target, p.vx - acc * dt);
  if (I.x) p.face = Math.sign(I.x);
  // jumping, with a little grace before landing (buffer) and after leaving a ledge (coyote time)
  if (I.jumpP) p.buffer = P.buffer;
  else p.buffer = Math.max(0, p.buffer - dt);
  p.coyote = p.ground ? P.coyote : Math.max(0, p.coyote - dt);
  if (p.buffer > 0 && p.coyote > 0 && w.game.canJump?.(w, p) !== false) {
    p.vy = -P.jump * p.gdir * (p.jumpK ?? 1); p.buffer = 0; p.coyote = 0; p.ground = false; p.on = null; p.squash = -1;
    w.emit('jump', p.x + p.w / 2, p.y + p.h, p);
  }
  if (p.vy * p.gdir >= 0) p.noCut = false;
  if (!I.jump && !p.noCut && p.vy * p.gdir < -P.jump * P.cut) p.vy = -P.jump * P.cut * p.gdir;
  p.vy += P.g * p.gdir * (p.grav ?? 1) * dt;
  const maxFall = P.fall * (p.fallK ?? 1);
  if (p.vy * p.gdir > maxFall) p.vy = maxFall * p.gdir;
}
function tileUnder(w, b) {
  const r = b.gdir === 1 ? Math.floor(b.y + b.h + 0.05) : Math.floor(b.y - 0.05);
  return w.tile(Math.floor(b.x + b.w / 2), r);
}

function integrate(w, b, dt) {
  const wasGround = b.ground;
  b.ground = false;
  const prevOn = b.on;
  b.on = null;
  moveX(w, b, b.vx * dt);
  moveY(w, b, b.vy * dt);
  if (!b.ground && wasGround && b.vy * b.gdir >= 0) {
    // stay stuck to what we stood on unless jumping (stops a jitter when walking off moving things)
    const probe = moveProbe(w, b);
    if (probe) { b.ground = true; b.on = probe; }
  }
  if (b.player && b.ground && !wasGround) { b.squash = Math.min(1, b.air * 2); if (b.air > 0.25) w.emit('land', b.x + b.w / 2, b.gdir === 1 ? b.y + b.h : b.y, b); }
  b.air = b.ground ? 0 : (b.air || 0) + dt;
  if (prevOn && prevOn !== b.on && prevOn.pushers) prevOn.pushers.delete(b.id);
}
// Is there ground right under the body (within a hair)? Used to keep contact on slopes of moving things.
function moveProbe(w, b) {
  const save = b.y, vy = b.vy;
  b.vy = 0;
  const saveCarry = b.carrying; b.carrying = true; // probe must not drag riders
  const d = moveY(w, b, 0.02 * b.gdir);
  b.carrying = saveCarry;
  const on = b.ground ? b.on : null;
  b.y = save; b.vy = vy; b.ground = false;
  if (on && Math.abs(d) < 0.019) { b.y = save + d; return on; }
  return null;
}

// Coins, spikes, springs, exits and anything else a player touches.
function touchTiles(w, p) {
  if (p.dead) return;
  for (const [c, r] of w.cells(p.x, p.y, p.w, p.h)) {
    const t = w.tile(c, r); if (!t) continue;
    t.touch?.(w, p, c, r);
    if (t.hazard && p.safe <= 0) {
      if (typeof t.hazard === 'function') { if (t.hazard(w, p, c, r)) w.kill(p, t.kind); }
      else { const [x0, y0, x1, y1] = t.hazard, m = 0.08; if (p.x + m < c + x1 && c + x0 < p.x + p.w - m && p.y + m < r + y1 && r + y0 < p.y + p.h - m) w.kill(p, t.kind); }
    }
  }
  if (p.y > w.H + 2 || p.y < -w.H - 6) w.kill(p, 'fall');
  // keys follow whoever picked them up
  for (const k of w.keys) if (!k.used && !k.by && !p.key && Math.abs(k.x - (p.x + p.w / 2)) < 0.7 && Math.abs(k.y - (p.y + p.h / 2)) < 0.8) { k.by = p; p.key = k; w.emit('key', k.x, k.y, p); }
  // levers flip with the act button
  if (p.in.actP) for (const [c, r] of w.cells(p.x - 0.2, p.y, p.w + 0.4, p.h)) if (w.tile(c, r)?.kind === 'lever') { const k = w.tile(c, r).key; w.open[k] = !w.open[k]; w.emit('lever', c + 0.5, r + 0.5, p, { on: w.open[k] }); p.in.actP = false; break; }
}

// Pressure plates hold gates open while a player, crate or walker stands on them; levers toggle theirs.
function updateSwitches(w) {
  const pressed = {};
  for (const [c, r, key] of w.plateCells) {
    const box = { x: c + 0.05, y: r + 0.6, w: 0.9, h: 0.4 };
    const down = [...w.players.filter((p) => !p.dead), ...w.crates, ...w.walkers.filter((e) => e.alive)].some((b) => overlap(b, box));
    w.plateDown = w.plateDown || {};
    if (down !== !!w.plateDown[`${c},${r}`]) { w.plateDown[`${c},${r}`] = down; if (w.t > 0) w.emit(down ? 'plate' : 'plateUp', c + 0.5, r + 1); }
    if (down) pressed[key] = true;
  }
  for (const k of PLATE_KEYS) {
    const want = !!pressed[k];
    if (w.open[k] && !want && gateBlocked(w, k)) continue; // never close a gate on top of someone
    if (!!w.open[k] !== want && w.t > 0) w.emit(want ? 'gateOpen' : 'gateShut', 0, 0, null, { key: k });
    w.open[k] = want;
  }
}
function gateBlocked(w, k) {
  const bodies = [...w.players.filter((p) => !p.dead), ...w.crates, ...w.walkers.filter((e) => e.alive)];
  return w.gateCells.some(([c, r, key]) => key === k && bodies.some((b) => overlap(b, { x: c, y: r, w: 1, h: 1 }, 0.02)));
}

// ---------- Platforms, crates and walkers ----------
function stepPlats(w, dt) {
  for (const pl of w.plats) {
    if (!pl.alive) continue;
    const blocked = (x, y) => {
      for (const [c, r] of w.cells(x, y, pl.w, pl.h)) { const ch = w.get(c, r); if (ch === '|' || w.solidAt(c, r, pl)) return true; }
      return false;
    };
    if (pl.vx) { let nx = pl.x + pl.vx * dt; if (blocked(nx, pl.y)) { pl.vx = -pl.vx; nx = pl.x; } const d = nx - pl.x; pl.x = nx; pl.dx = d; carryRiders(w, pl, d, 0); }
    if (pl.vy) { let ny = pl.y + pl.vy * dt; if (blocked(pl.x, ny)) { pl.vy = -pl.vy; ny = pl.y; } const d = ny - pl.y; pl.y = ny; pl.dy = d; carryRiders(w, pl, 0, d); }
  }
}
function stepCrates(w, dt) {
  for (const b of w.crates) {
    if (!b.alive) continue;
    b.vy = Math.min(w.P.fall, b.vy + w.P.g * dt);
    b.ground = false; b.on = null;
    moveY(w, b, b.vy * dt);
    if (b.pushed && w.t - (b.pushT || 0) > 0.05) w.emit('push', b.x + b.w / 2, b.y + b.h, null);
    if (b.pushed) b.pushT = w.t;
    b.pushed = 0;
    if (b.pushers) b.pushers.clear();
    if (b.y > w.H + 3) b.alive = false;
  }
}
function stepWalkers(w, dt) {
  for (const e of w.walkers) {
    if (!e.alive) { e.deadT = (e.deadT || 0) + dt; continue; }
    if (w.game.walker?.(w, e, dt) === false) continue;
    e.vy = Math.min(w.P.fall, e.vy + w.P.g * dt);
    const before = e.x;
    const sp = (e.speed ?? w.P.walker) * e.dir;
    moveX(w, e, sp * dt);
    if (Math.abs(e.x - before) < Math.abs(sp * dt) * 0.5) e.dir = -e.dir;
    e.ground = false; e.on = null;
    moveY(w, e, e.vy * dt);
    // turn round at ledges
    if (e.ground) {
      const fc = Math.floor(e.dir > 0 ? e.x + e.w + 0.05 : e.x - 0.05), fr = Math.floor(e.y + e.h + 0.1);
      const t = w.tile(fc, fr);
      if (!w.solidAt(fc, fr, e) && !(t && t.oneway) && !w.crates.some((c) => c.alive && overlap(c, { x: fc + 0.2, y: fr, w: 0.6, h: 0.5 })) && !w.plats.some((pl) => overlap(pl, { x: fc + 0.2, y: fr, w: 0.6, h: 0.5 }))) e.dir = -e.dir;
    }
    if (e.y > w.H + 3) e.alive = false;
    for (const p of w.players) {
      if (p.dead || !overlap(p, e, 0.05)) continue;
      if (p.vy > 0 && p.y + p.h - p.vy * dt * 2 <= e.y + 0.35) { e.alive = false; p.vy = -w.P.stomp; p.noCut = true; w.emit('stomp', e.x + e.w / 2, e.y, p); w.game.onStomp?.(w, e, p); }
      else if (p.safe <= 0) w.kill(p, 'walker');
    }
  }
}

// ---------- One step ----------
function stepWorld(w, dt) {
  if (w.won || w.over) { w.t += dt; return; }
  w.t += dt;
  w.game.preStep?.(w, dt);
  stepPlats(w, dt);
  for (const p of w.players) stepPlayer(w, p, dt);
  for (const p of w.players) if (!p.dead) integrate(w, p, dt);
  for (const p of w.players) touchTiles(w, p);
  for (const p of w.players) if (p.in.actP && !p.dead) w.game.act?.(w, p);
  stepCrates(w, dt);
  stepWalkers(w, dt);
  updateSwitches(w);
  for (const k of w.keys) if (k.by) { const tx = k.by.x + k.by.w / 2 - k.by.face * 0.5, ty = k.by.y - 0.1; k.x += (tx - k.x) * Math.min(1, dt * 12); k.y += (ty - k.y) * Math.min(1, dt * 12); }
  w.game.update?.(w, dt);
  for (const p of w.players) { p.in.jumpP = false; p.in.actP = false; if (p.squash > 0) p.squash = Math.max(0, p.squash - dt * 5); else if (p.squash < 0) p.squash = Math.min(0, p.squash + dt * 5); }
  // too far apart up and down: after a moment the stranded player pops over to their partner
  if (Number.isFinite(w.sepY)) {
    const [a, b] = w.players;
    if (!a.dead && !b.dead && Math.abs(a.y - b.y) > w.sepY) {
      const low = a.y * a.gdir > b.y * b.gdir ? a : b, high = w.partner(low);
      low.apart += dt;
      if (low.apart > 1.2 && high.ground) { low.x = high.x; low.y = high.y - 0.05; low.vx = low.vy = 0; low.apart = 0; low.safe = 0.8; w.emit('warp', low.x + low.w / 2, low.y + low.h / 2, low); }
    } else { a.apart = 0; b.apart = 0; }
  }
  checkExit(w, dt);
}

// Both players standing in the exit (or each in their own door) for a moment wins the level.
function checkExit(w, dt) {
  if (w.game.won) { if (w.game.won(w)) win(w); return; }
  const inside = (p, kinds) => !p.dead && w.cells(p.x + 0.15, p.y + 0.1, p.w - 0.3, p.h - 0.2).some(([c, r]) => kinds.includes(w.tile(c, r)?.kind));
  const [a, b] = w.players;
  a.inExit = inside(a, w.hasOwnExits ? ['exit1', 'exit'] : ['exit']);
  b.inExit = inside(b, w.hasOwnExits ? ['exit2', 'exit'] : ['exit']);
  if (a.inExit && b.inExit && (w.game.canExit?.(w) ?? true)) { w.exitT += dt; if (w.exitT > 0.35) win(w); }
  else w.exitT = 0;
}
function win(w) { if (w.won) return; w.won = true; w.emit('win', 0, 0); }

// ---------- Helpers for games ----------
export function mulberry(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const centre = (b) => [b.x + b.w / 2, b.y + b.h / 2];
// Runs the world for `sec` seconds with the given inputs per player (for tests and bots).
export function simulate(w, sec, inputs = [{}, {}]) {
  const n = Math.round(sec / STEP);
  for (let i = 0; i < n; i++) {
    w.players.forEach((p, k) => Object.assign(p.in, { x: 0, jump: false, act: false, down: false, up: false }, typeof inputs[k] === 'function' ? inputs[k](w, p, i) : inputs[k]));
    w.step(STEP);
    if (w.won || w.over) break;
  }
  return w;
}
