// Land Grab rules, kept apart from drawing so they can be tested on their own.
// Players glide freely: each has a position and a heading, and turns smoothly towards where it is steered.
// Land is kept on a fine grid of cells underneath. Leaving your land lays a trail across the cells you pass;
// getting back home claims the trail and everything it encloses. Crossing someone's trail knocks them out and
// their land becomes yours; crossing your own trail knocks you out. The edge of the field, water and rocks are
// walls you slide along.
export const N = 120;                // the field is N by N cells
export const SPEED = 7.5;            // cells a second
export const TURN = 4.4;             // radians a second: how sharply anyone can turn
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // grid neighbours: up, right, down, left
const START = 3.2;                   // radius of a new player's patch of land, in cells
const HEAD = 0.8;                    // heads closer than this have run into each other

// The field's shape, in fractions of the square (u, v from 0 to 1). Cells outside it, under water or under rocks are walls.
// hole: what the closed-off cells inside the field look like ('water' or 'rock'); everything else is plain outside.
const ROCKS = [[0.25, 0.23, 0.06], [0.73, 0.27, 0.07], [0.5, 0.5, 0.08], [0.23, 0.71, 0.07], [0.76, 0.76, 0.06], [0.49, 0.18, 0.035], [0.49, 0.85, 0.045], [0.14, 0.47, 0.035], [0.87, 0.51, 0.035]];
const UV = (f) => (x, y) => f((x + 0.5) / N - 0.5, (y + 0.5) / N - 0.5);
export const MAPS = [
  { id: 'classic', name: 'Classic', shape: () => true },
  { id: 'round', name: 'Round', shape: UV((u, v) => u * u + v * v <= 0.5 * 0.5) },
  { id: 'lake', name: 'Lake', hole: 'water', shape: UV((u, v) => u * u + v * v > 0.167 * 0.167) },
  { id: 'cross', name: 'Cross', shape: UV((u, v) => Math.abs(u) <= 0.222 || Math.abs(v) <= 0.222) },
  { id: 'diamond', name: 'Diamond', shape: UV((u, v) => Math.abs(u) + Math.abs(v) <= 0.644) },
  { id: 'rocks', name: 'Rocks', hole: 'rock', shape: UV((u, v) => ROCKS.every(([rx, ry, r]) => (u + 0.5 - rx) ** 2 + (v + 0.5 - ry) ** 2 > r * r)) },
];
export const mapById = (id) => MAPS.find((m) => m.id === id) || MAPS[0];

export function maskOf(map) {
  const m = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) m[y * N + x] = map.shape(x, y) ? 1 : 0;
  return m;
}

// Closed cells that are not joined to the border of the square: the water or rocks inside the field.
export function holesOf(open) {
  const outer = new Uint8Array(N * N), stack = [];
  for (let k = 0; k < N; k++) for (const i of [k, (N - 1) * N + k, k * N, k * N + N - 1]) if (!open[i] && !outer[i]) { outer[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop(), x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const j = ny * N + nx; if (!open[j] && !outer[j]) { outer[j] = 1; stack.push(j); }
    }
  }
  const holes = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) holes[i] = !open[i] && !outer[i] ? 1 : 0;
  return holes;
}

// pace: how fast everyone moves, from the player's speed setting (1 is normal)
export function createWorld(rng = Math.random, map = MAPS[0], pace = 1) {
  const open = maskOf(map);
  let area = 0; for (let i = 0; i < N * N; i++) area += open[i];
  return {
    owner: new Uint8Array(N * N), trail: new Uint8Array(N * N), order: new Int32Array(N * N), open, area, map,
    players: [], time: 0, rng, events: [], changed: new Set(), pace, // changed: players whose land changed since the page last drew it
  };
}

// id is 1-based so 0 can mean "nobody" in owner and trail.
export function addPlayer(w, props) {
  const p = { id: w.players.length + 1, x: 0, y: 0, ang: 0, want: null, alive: false, cells: 0, kills: 0, trail: [], path: [], box: null, bestPct: 0, area: w.area, ...props };
  w.players.push(p);
  return p;
}

const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
export const open = (w, x, y) => inside(x, y) && w.open[y * N + x] === 1;
const openAt = (w, fx, fy) => open(w, Math.floor(fx), Math.floor(fy));
export const pct = (p) => (p.cells / p.area) * 100;
export const cellAt = (x, y) => Math.floor(y) * N + Math.floor(x);
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// Put a player down on a clear patch, away from everyone else's heads.
export function spawn(w, p) {
  const R = Math.ceil(START) + 1;
  const ok = (cx, cy) => {
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      if (!open(w, x, y)) return false;
      const i = y * N + x; if (w.owner[i] || w.trail[i]) return false;
    }
    return w.players.every((q) => !q.alive || q === p || Math.hypot(q.x - cx, q.y - cy) > 18);
  };
  let cx = -1, cy = -1;
  for (let t = 0; t < 500; t++) {
    const x = R + 2 + ((w.rng() * (N - 2 * R - 4)) | 0), y = R + 2 + ((w.rng() * (N - 2 * R - 4)) | 0);
    if (ok(x, y)) { cx = x; cy = y; break; }
  }
  if (cx < 0) return false; // the field is too full for now: try again later
  p.alive = true; p.x = cx + 0.5; p.y = cy + 0.5; p.trail = []; p.path = []; p.cells = 0; p.kills = 0;
  p.ang = w.rng() * Math.PI * 2 - Math.PI; p.want = null; p.bestPct = 0;
  p.box = { x0: cx - R, y0: cy - R, x1: cx + R, y1: cy + R };
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= START * START) setOwner(w, y * N + x, p.id);
  w.changed.add(p.id);
  return true;
}

function setOwner(w, i, id) {
  const was = w.owner[i];
  if (was === id) return;
  if (was) { w.players[was - 1].cells--; w.changed.add(was); }
  w.owner[i] = id;
  if (id) { w.players[id - 1].cells++; w.changed.add(id); }
  if (w.dirty) w.dirty.push(i, id); // Play Together: the host sends these cell changes to the guest
}

// Steer towards an angle (radians, 0 = right, down is positive), or null to carry straight on.
export function steer(p, angle) { p.want = angle; }

// Knock a player out. Whoever did it takes all their land; otherwise the land goes back to nobody.
export function kill(w, p, by = null) {
  if (!p.alive) return;
  p.alive = false;
  for (const i of p.trail) if (w.trail[i] === p.id) w.trail[i] = 0;
  p.trail = []; p.path = [];
  const heir = by && by !== p && by.alive ? by : null;
  for (let i = 0; i < N * N; i++) if (w.owner[i] === p.id) setOwner(w, i, heir ? heir.id : 0);
  if (heir) { const b = heir.box, q = p.box; b.x0 = Math.min(b.x0, q.x0); b.y0 = Math.min(b.y0, q.y0); b.x1 = Math.max(b.x1, q.x1); b.y1 = Math.max(b.y1, q.y1); }
  if (by && by !== p) by.kills++;
  w.events.push({ k: 'die', p: p.id, by: by && by !== p ? by.id : 0 });
}

// The cells a straight move from (x0,y0) to (x1,y1) passes through, in order, not counting the first.
function cellsAlong(x0, y0, x1, y1) {
  const out = [];
  let cx = Math.floor(x0), cy = Math.floor(y0);
  const ex = Math.floor(x1), ey = Math.floor(y1), dx = x1 - x0, dy = y1 - y0;
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  let tMaxX = dx ? ((dx > 0 ? cx + 1 - x0 : x0 - cx) / Math.abs(dx)) : Infinity;
  let tMaxY = dy ? ((dy > 0 ? cy + 1 - y0 : y0 - cy) / Math.abs(dy)) : Infinity;
  const tdx = dx ? 1 / Math.abs(dx) : Infinity, tdy = dy ? 1 / Math.abs(dy) : Infinity;
  for (let guard = 0; (cx !== ex || cy !== ey) && guard < 16; guard++) {
    if (tMaxX < tMaxY) { cx += sx; tMaxX += tdx; } else { cy += sy; tMaxY += tdy; }
    out.push(cy * N + cx);
  }
  return out;
}

// Move everyone on by dt seconds, then sort out who ran into what.
export function step(w, dt) {
  w.time += dt;
  const movers = w.players.filter((p) => p.alive);
  const dead = new Map(); // player -> who knocked them out (or null)
  const out = (p, by) => { if (!dead.has(p)) dead.set(p, by); };
  for (const p of movers) {
    // turning keeps pace with speed, so curves are the same shape at any speed
    const sp = SPEED * w.pace, tr = TURN * w.pace;
    if (p.want !== null && p.want !== undefined) { const d = wrap(p.want - p.ang); p.ang = wrap(p.ang + Math.max(-tr * dt, Math.min(tr * dt, d))); }
    let nx = p.x + Math.cos(p.ang) * sp * dt, ny = p.y + Math.sin(p.ang) * sp * dt;
    // walls: slide along them rather than stop dead
    if (!openAt(w, nx, ny)) {
      if (openAt(w, nx, p.y)) ny = p.y;
      else if (openAt(w, p.x, ny)) nx = p.x;
      else { nx = p.x; ny = p.y; }
    }
    const from = [p.x, p.y];
    p.x = nx; p.y = ny;
    for (const i of cellsAlong(from[0], from[1], nx, ny)) {
      if (!w.open[i]) continue;
      const t = w.trail[i];
      if (t && t !== p.id) out(w.players[t - 1], p);
      if (t === p.id && w.order[i] < p.trail.length - 4) out(p, null); // ran over its own trail (the last few cells are under its head)
      if (w.owner[i] === p.id) { if (p.trail.length && !dead.has(p)) capture(w, p); }
      else if (t !== p.id) { w.trail[i] = p.id; w.order[i] = p.trail.length; p.trail.push(i); }
    }
    // the trail as a line, for drawing: a point every quarter cell or so
    if (p.trail.length) {
      const last = p.path[p.path.length - 1];
      if (!last || Math.hypot(last[0] - p.x, last[1] - p.y) > 0.25) p.path.push([p.x, p.y]);
    } else p.path = [];
  }
  // heads meeting: whoever is on their own land survives
  for (let a = 0; a < movers.length; a++) for (let b = a + 1; b < movers.length; b++) {
    const p = movers[a], q = movers[b];
    if (Math.hypot(p.x - q.x, p.y - q.y) > HEAD) continue;
    const pHome = w.owner[cellAt(p.x, p.y)] === p.id, qHome = w.owner[cellAt(q.x, q.y)] === q.id;
    if (pHome && qHome) continue;
    if (pHome) out(q, p); else if (qHome) out(p, q); else { out(p, null); out(q, null); }
  }
  for (const [p, by] of dead) kill(w, p, by && !dead.has(by) ? by : null);
  for (const p of w.players) if (p.alive) p.bestPct = Math.max(p.bestPct, pct(p));
}

// Home again: the trail becomes land, and so does every cell it closed off from the outside.
export function capture(w, p) {
  const b = p.box;
  for (const i of p.trail) {
    if (w.trail[i] === p.id) w.trail[i] = 0;
    const x = i % N, y = (i / N) | 0;
    if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
    claim(w, p, i);
  }
  p.trail = []; p.path = [];
  // flood from just outside the box through cells that are not ours; whatever the flood cannot reach is enclosed
  const x0 = b.x0 - 1, y0 = b.y0 - 1, bw = b.x1 - b.x0 + 3, bh = b.y1 - b.y0 + 3;
  const seen = new Uint8Array(bw * bh), stack = [];
  const push = (lx, ly) => {
    if (lx < 0 || ly < 0 || lx >= bw || ly >= bh) return;
    const k = ly * bw + lx; if (seen[k]) return;
    const x = x0 + lx, y = y0 + ly;
    if (inside(x, y) && w.owner[y * N + x] === p.id) return;
    seen[k] = 1; stack.push(k);
  };
  for (let lx = 0; lx < bw; lx++) { push(lx, 0); push(lx, bh - 1); }
  for (let ly = 0; ly < bh; ly++) { push(0, ly); push(bw - 1, ly); }
  while (stack.length) {
    const k = stack.pop(), lx = k % bw, ly = (k / bw) | 0;
    push(lx + 1, ly); push(lx - 1, ly); push(lx, ly + 1); push(lx, ly - 1);
  }
  for (let ly = 1; ly < bh - 1; ly++) for (let lx = 1; lx < bw - 1; lx++) {
    if (seen[ly * bw + lx]) continue;
    const x = x0 + lx, y = y0 + ly, i = y * N + x;
    if (inside(x, y) && w.owner[i] !== p.id && w.open[i]) claim(w, p, i); // a lake or rock inside the loop stays as it is
  }
  takeSevered(w, p);
  w.events.push({ k: 'claim', p: p.id });
}

function claim(w, p, i) {
  const was = w.owner[i];
  setOwner(w, i, p.id);
  // took the last of someone's land: they are out
  if (was && was !== p.id) { const q = w.players[was - 1]; (w.cut ||= new Set()).add(q); if (q.alive && q.cells === 0) kill(w, q, p); }
}

// ---------- computer players ----------
// Each bot heads out a little way, curves round alongside its land and comes back to close the loop.
// It cuts the loop short and runs home when someone gets close enough to cut its trail first,
// and now and then goes after a trail that is close by.
export function makeBrain(rng, level = 0.5) {
  return { plan: [], level, wander: rng() * Math.PI * 2, think: 0 };
}

// Breadth first search from the head to the nearest cell of our own land, never touching our trail.
// Returns how many cells away it is and a point a few cells along the way to aim at.
function homePath(w, p, limit = 90) {
  const start = cellAt(p.x, p.y);
  const prev = new Map([[start, -1]]);
  let frontier = [start];
  for (let d = 0; d < limit && frontier.length; d++) {
    const next = [];
    for (const c of frontier) {
      const cx = c % N, cy = (c / N) | 0;
      for (const [dx, dy] of DIRS) {
        const x = cx + dx, y = cy + dy;
        if (!open(w, x, y)) continue;
        const i = y * N + x;
        if (prev.has(i) || (w.trail[i] === p.id && w.order[i] < p.trail.length - 4)) continue;
        prev.set(i, c);
        if (w.owner[i] === p.id) {
          const path = []; let s = i;
          while (s !== -1 && s !== start) { path.push(s); s = prev.get(s); }
          path.reverse();
          const aim = path[Math.min(path.length - 1, 3)];
          return { len: path.length, x: (aim % N) + 0.5, y: ((aim / N) | 0) + 0.5 };
        }
        next.push(i);
      }
    }
    frontier = next;
  }
  return null;
}

// How far a bot can go along an angle before a wall or its own trail (in cells, up to max).
function room(w, p, ang, max = 14) {
  const c = Math.cos(ang), s = Math.sin(ang);
  for (let d = 1; d <= max; d++) {
    const x = p.x + c * d, y = p.y + s * d, i = cellAt(x, y);
    if (!openAt(w, x, y) || (w.trail[i] === p.id && w.order[i] < p.trail.length - 4)) return d - 1;
  }
  return max;
}

export function think(w, p, br) {
  const rng = w.rng, home = w.owner[cellAt(p.x, p.y)] === p.id;
  let aim = null; // a point to head for
  if (!home && p.trail.length) {
    const hp = homePath(w, p);
    // how soon could someone reach our trail?
    let threat = Infinity;
    for (const q of w.players) {
      if (!q.alive || q === p || Math.hypot(q.x - p.x, q.y - p.y) > 40) continue;
      for (let k = 0; k < p.trail.length; k += 3) {
        const i = p.trail[k], d = Math.hypot(q.x - (i % N) - 0.5, q.y - ((i / N) | 0) - 0.5);
        if (d < threat) threat = d;
      }
    }
    const margin = 3 + (1 - br.level) * 6;
    if (hp && (threat <= hp.len + margin || p.trail.length > 25 + br.level * 55)) br.plan = [];
    if (br.plan.length) {
      const wp = br.plan[0];
      if (Math.hypot(wp[0] - p.x, wp[1] - p.y) < 1.5) br.plan.shift();
    }
    if (br.plan.length) aim = br.plan[0];
    else if (hp) aim = [hp.x, hp.y];
    // a trail within reach that we can cut before its owner gets home
    if (br.level > 0.3 && hp && hp.len < 8 && rng() < br.level * 0.5) {
      const prey = huntTarget(w, p);
      if (prey) aim = prey;
    }
  } else {
    br.plan = [];
    // at home: pick a way out with room to spare, and plan a loop: out, along, and back
    if (br.out === undefined || rng() < 0.02) {
      let best = null;
      for (let k = 0; k < 10; k++) {
        const a = rng() * Math.PI * 2, r = room(w, p, a, 30) + rng() * 6;
        if (!best || r > best.r) best = { a, r };
      }
      br.out = best.a; br.turn = rng() < 0.5 ? 1 : -1;
      const grow = 1 + Math.min(2, p.cells / 900);
      br.d1 = (3 + rng() * 6) * grow * (0.6 + br.level); br.d2 = (4 + rng() * 9) * grow * (0.6 + br.level);
    }
    aim = [p.x + Math.cos(br.out) * 6, p.y + Math.sin(br.out) * 6];
  }
  // just left home: lay out the loop as points to pass through
  if (!home && br.out !== undefined && p.trail.length <= 2 && !br.plan.length) {
    const u = [Math.cos(br.out), Math.sin(br.out)], v = [-u[1] * br.turn, u[0] * br.turn];
    const p1 = [p.x + u[0] * br.d1, p.y + u[1] * br.d1], p2 = [p1[0] + v[0] * br.d2, p1[1] + v[1] * br.d2];
    br.plan = [p1, p2, [p2[0] - u[0] * (br.d1 + 2), p2[1] - u[1] * (br.d1 + 2)]];
    br.out = undefined;
    aim = br.plan[0];
  }
  let want = aim ? Math.atan2(aim[1] - p.y, aim[0] - p.x) : p.ang;
  // never steer into a wall or our own trail: look ahead and pick the clearest nearby heading
  if (room(w, p, want, 4) < 3) {
    let best = want, bestR = -1;
    for (const off of [0.4, -0.4, 0.8, -0.8, 1.3, -1.3, 1.9, -1.9, 2.6, -2.6]) {
      const r = room(w, p, want + off, 6);
      if (r > bestR) { bestR = r; best = want + off; }
    }
    want = best;
  }
  steer(p, want);
}

function huntTarget(w, p) {
  let best = null, bestD = 9;
  for (const q of w.players) {
    if (!q.alive || q === p || !q.trail.length) continue;
    for (let k = 0; k < q.trail.length; k += 2) {
      const i = q.trail[k], x = (i % N) + 0.5, y = ((i / N) | 0) + 0.5, d = Math.hypot(x - p.x, y - p.y);
      if (d < bestD && room(w, p, Math.atan2(y - p.y, x - p.x), Math.ceil(d)) >= Math.floor(d) - 1) { best = [x, y]; bestD = d; }
    }
  }
  return best;
}

// After a capture cuts through someone's land, any piece of their land left cut off from the rest goes to the
// player who cut it. The owner keeps the piece they are standing on, or their biggest piece if they are out roaming.
function takeSevered(w, p) {
  const hit = w.cut; w.cut = null;
  if (!hit) return;
  for (const q of hit) {
    if (!q.alive || !q.cells) continue;
    const seen = new Uint8Array(N * N), parts = [];
    for (let i = 0; i < N * N; i++) {
      if (w.owner[i] !== q.id || seen[i]) continue;
      const part = [i], stack = [i]; seen[i] = 1;
      while (stack.length) {
        const c = stack.pop(), x = c % N, y = (c / N) | 0;
        for (const [dx, dy] of DIRS) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const j = ny * N + nx;
          if (seen[j] || w.owner[j] !== q.id) continue;
          seen[j] = 1; part.push(j); stack.push(j);
        }
      }
      parts.push(part);
    }
    if (parts.length < 2) continue;
    const at = cellAt(q.x, q.y);
    const keep = parts.find((pt) => pt.includes(at)) || parts.reduce((a, b) => (b.length > a.length ? b : a));
    const b = p.box;
    for (const part of parts) {
      if (part === keep) continue;
      for (const i of part) {
        setOwner(w, i, p.id);
        const x = i % N, y = (i / N) | 0;
        if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
      }
    }
  }
}
