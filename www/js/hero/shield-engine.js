// Shield Throw engine: a room with walls, Ultron drones, and a shield thrown in a straight line that bounces off walls.
// No browser dependencies: tools/test-hero.mjs checks that every level can be cleared within its par.
import { rngOf } from './match-engine.js';

export const ROOM = { w: 10, h: 14 }, CAP = { x: 5, y: 1.1 }, DRONE_R = 0.5, SHIELD_R = 0.3, BOUNCES = 3, REACH = 36;
export const SHIELD_LEVELS = 36;

function outer() { const { w, h } = ROOM; return [[0, 0, w, 0], [w, 0, w, h], [w, h, 0, h], [0, h, 0, 0]]; }

// Follows a throw at angle a (radians, 0 = right, PI/2 = straight up). alive[i] says which drones are still up.
// -> { pts: [[x, y], ...], hits: [{ i, bank }] } where bank is how many walls the shield had bounced off before the hit.
export function trace(level, a, alive = level.drones.map(() => true)) {
  const segs = outer().concat(level.walls);
  let x = CAP.x, y = CAP.y, dx = Math.cos(a), dy = Math.sin(a), left = REACH;
  const pts = [[x, y]], hits = [], seen = new Set();
  for (let bank = 0; bank <= BOUNCES && left > 0; bank++) {
    // nearest wall along the ray
    let best = Infinity, nx = 0, ny = 0;
    for (const [x1, y1, x2, y2] of segs) {
      const ex = x2 - x1, ey = y2 - y1, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((x1 - x) * ey - (y1 - y) * ex) / den, u = ((x1 - x) * dy - (y1 - y) * dx) / den;
      if (t > 1e-6 && u >= -0.001 && u <= 1.001 && t < best) { best = t; const len = Math.hypot(ex, ey); nx = -ey / len; ny = ex / len; }
    }
    const t = Math.min(best, left);
    // drones along this leg
    level.drones.forEach((d, i) => {
      if (!alive[i] || seen.has(i)) return;
      const px = d.x - x, py = d.y - y, along = px * dx + py * dy;
      if (along < 0 || along > t) return;
      if (Math.hypot(px - dx * along, py - dy * along) <= DRONE_R + SHIELD_R) { seen.add(i); hits.push({ i, bank, at: along + (REACH - left) }); }
    });
    x += dx * t; y += dy * t; left -= t; pts.push([x, y]);
    if (best === Infinity || left <= 0) break;
    const dot = dx * nx + dy * ny; dx -= 2 * dot * nx; dy -= 2 * dot * ny;
    x += dx * 1e-4; y += dy * 1e-4;
  }
  hits.sort((p, q) => p.at - q.at);
  return { pts, hits };
}

const ANGLES = []; for (let d = 4; d <= 176; d += 0.25) ANGLES.push(d * Math.PI / 180);
// Greedy plan: each throw takes the angle that knocks out the most drones. -> list of angles, or null if stuck.
export function plan(level, maxThrows = 8) {
  const alive = level.drones.map(() => true), out = [];
  while (alive.some(Boolean)) {
    if (out.length >= maxThrows) return null;
    let bestA = null, bestN = 0;
    for (const a of ANGLES) { const n = trace(level, a, alive).hits.length; if (n > bestN) { bestN = n; bestA = a; } }
    if (!bestN) return null;
    for (const h of trace(level, bestA, alive).hits) alive[h.i] = false;
    out.push(bestA);
  }
  return out;
}

// Level i, built from a fixed seed so it is the same on every phone. -> { walls, drones, par }
const cache = new Map();
export function shieldLevel(i) {
  if (cache.has(i)) return cache.get(i);
  const rng = rngOf(4242 + i * 977);
  const nDrones = Math.min(6, 1 + Math.floor(i / 5) + (i % 3 === 2 ? 1 : 0));
  const nWalls = Math.min(4, Math.floor((i + 2) / 6));
  for (let attempt = 0; ; attempt++) {
    const walls = [];
    for (let k = 0; k < nWalls; k++) {
      const horiz = rng() < 0.6, len = 2 + rng() * 3.5;
      const x = 1 + rng() * (ROOM.w - 2 - (horiz ? len : 0)), y = 4 + rng() * (ROOM.h - 6 - (horiz ? 0 : len));
      walls.push(horiz ? [x, y, x + len, y] : [x, y, x, y + len]);
    }
    const drones = [];
    for (let k = 0; k < nDrones * 30 && drones.length < nDrones; k++) {
      const d = { x: 1 + rng() * (ROOM.w - 2), y: 4 + rng() * (ROOM.h - 5) };
      if (drones.some((e) => Math.hypot(e.x - d.x, e.y - d.y) < 1.8)) continue;
      if (walls.some(([x1, y1, x2, y2]) => distSeg(d.x, d.y, x1, y1, x2, y2) < DRONE_R + 0.5)) continue;
      drones.push(d);
    }
    if (drones.length < nDrones) continue;
    const lvl = { walls, drones };
    const p = plan(lvl, 6);
    if (!p) continue;
    const minPar = i < 5 ? 1 : i < 18 ? 2 : 3;
    if (p.length < minPar && attempt < 160) continue;
    // later levels should need a bank shot somewhere, so some drone must be hidden from a straight throw
    if (i >= 8 && attempt < 60) {
      const direct = drones.map((d, k) => ANGLES.some((a) => { const tr = trace(lvl, a); return tr.hits.some((h) => h.i === k && h.bank === 0); }));
      if (direct.every(Boolean)) continue;
    }
    lvl.par = p.length;
    cache.set(i, lvl);
    return lvl;
  }
}
function distSeg(px, py, x1, y1, x2, y2) {
  const ex = x2 - x1, ey = y2 - y1, l = ex * ex + ey * ey;
  const t = l ? Math.max(0, Math.min(1, ((px - x1) * ex + (py - y1) * ey) / l)) : 0;
  return Math.hypot(px - x1 - ex * t, py - y1 - ey * t);
}
