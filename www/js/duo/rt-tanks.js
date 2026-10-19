// Tank Duel simulation (no browser dependencies). Turn-based artillery on destructible hills.
// Everything here is deterministic: the same state and shot give the same result on both phones.
export const W = 1, H = 1.0, COLS = 200, TANK_W = 0.095, HP = 100;
export const WEAPONS = {
  shell: { name: 'Shell', r: 0.055, dmg: 34, stock: Infinity },
  big: { name: 'Big shell', r: 0.095, dmg: 48, stock: 2 },
  bounce: { name: 'Bouncer', r: 0.05, dmg: 30, stock: 3, bounces: 2 },
};
const G = 1.0, DT = 1 / 120;

// rand: a seeded generator shared by both phones (only used here when the game starts).
export function newTanks(rand, first = 0) {
  const ph = [rand() * 6.28, rand() * 6.28, rand() * 6.28], amp = [0.09 + rand() * 0.05, 0.05 + rand() * 0.03, 0.008 + rand() * 0.006];
  const hill = 0.6 + rand() * 0.6, h = [];
  for (let i = 0; i < COLS; i++) {
    const x = i / (COLS - 1);
    let y = 0.3 + amp[0] * Math.sin(x * 6.3 + ph[0]) + amp[1] * Math.sin(x * 13.1 + ph[1]) + amp[2] * Math.sin(x * 29 + ph[2]);
    // a hill in the middle so shots have to arc
    y += 0.14 * Math.exp(-(((x - 0.5) / 0.16) ** 2)) * hill;
    h.push(y);
  }
  const s = {
    h, wind: Math.round((rand() * 2 - 1) * 100) / 100, turn: first, shots: 0,
    tanks: [
      { x: 0.12 + rand() * 0.06, hp: HP, stock: { big: 2, bounce: 3 }, aim: { a: 45, p: 0.6 } },
      { x: 0.82 + rand() * 0.06, hp: HP, stock: { big: 2, bounce: 3 }, aim: { a: 135, p: 0.6 } },
    ],
  };
  for (const t of s.tanks) flatten(s, t.x, 0.06);
  return s;
}
function flatten(s, x, half) {
  const i0 = Math.max(0, colOf(x - half)), i1 = Math.min(COLS - 1, colOf(x + half));
  let sum = 0; for (let i = i0; i <= i1; i++) sum += s.h[i];
  const y = sum / (i1 - i0 + 1);
  for (let i = i0; i <= i1; i++) s.h[i] = y;
}
const colOf = (x) => Math.round(x * (COLS - 1));
export function groundAt(s, x) {
  const f = Math.max(0, Math.min(COLS - 1, x * (COLS - 1))), i = Math.floor(f), j = Math.min(COLS - 1, i + 1);
  return s.h[i] + (s.h[j] - s.h[i]) * (f - i);
}
export const tankY = (s, t) => groundAt(s, t.x);
export function barrelTip(s, t, a) {
  const r = (a * Math.PI) / 180, y = tankY(s, t) + 0.041;
  return [t.x + Math.cos(r) * 0.06, y + Math.sin(r) * 0.06];
}
export const speedOf = (p) => 0.3 + p * 1.5;

// Fires a shot for the player whose turn it is. Returns { path: [[x, y], ...] (one point per 1/60 s),
// booms: [{x, y, r}], damage: [d0, d1] } and changes the state (terrain, hp, stock, turn).
export function fire(s, shot) {
  const who = s.turn, t = s.tanks[who], wpn = WEAPONS[shot.w] ? shot.w : 'shell', def = WEAPONS[wpn];
  const a = Math.max(0, Math.min(180, shot.a)), p = Math.max(0.05, Math.min(1, shot.p));
  t.aim = { a, p };
  if (wpn !== 'shell') { if (!(t.stock[wpn] > 0)) return fire(s, { a, p, w: 'shell' }); t.stock[wpn]--; }
  let [x, y] = barrelTip(s, t, a);
  const sp = speedOf(p), r = (a * Math.PI) / 180;
  let vx = Math.cos(r) * sp, vy = Math.sin(r) * sp, bounces = def.bounces || 0;
  const path = [[x, y]], booms = [], damage = [0, 0];
  let hit = null;
  for (let n = 1; n <= 120 * 14 && !hit; n++) {
    vx += s.wind * 0.22 * DT; vy -= G * DT;
    x += vx * DT; y += vy * DT;
    if (n % 2 === 0) path.push([x, y]);
    if (x < -0.4 || x > 1.4 || y < -0.2) { hit = 'miss'; break; }
    // a tank's hull
    for (let i = 0; i < 2; i++) {
      if (i === who && n < 30) continue;
      const tk = s.tanks[i];
      if (Math.abs(x - tk.x) < TANK_W / 2 + 0.008 && y > tankY(s, tk) - 0.004 && y < tankY(s, tk) + 0.075) { hit = 'tank'; break; }
    }
    if (hit) break;
    if (x >= 0 && x <= 1 && y <= groundAt(s, x)) {
      if (bounces > 0) {
        bounces--;
        // reflect off the slope of the ground, losing some speed
        const dx = 0.01, sl = (groundAt(s, x + dx) - groundAt(s, x - dx)) / (2 * dx), len = Math.hypot(sl, 1), nx = -sl / len, ny = 1 / len;
        const vn = vx * nx + vy * ny;
        vx = (vx - 2 * vn * nx) * 0.62; vy = (vy - 2 * vn * ny) * 0.62;
        y = groundAt(s, x) + 0.003;
        booms.push({ x, y, r: 0.012, bounce: 1, at: path.length });
        continue;
      }
      hit = 'ground';
    }
  }
  path.push([x, y]);
  if (hit !== 'miss') {
    const R = def.r;
    booms.push({ x, y, r: R, at: path.length });
    // crater
    for (let i = 0; i < COLS; i++) {
      const cx = i / (COLS - 1), dx = cx - x;
      if (Math.abs(dx) >= R) continue;
      const bottom = y - Math.sqrt(R * R - dx * dx);
      if (s.h[i] > bottom) s.h[i] = Math.max(0.03, bottom);
    }
    for (let i = 0; i < 2; i++) {
      const tk = s.tanks[i], d = Math.hypot(tk.x - x, tankY(s, tk) + 0.03 - y), reach = R + 0.04;
      if (d < reach) {
        let dmg = Math.round(def.dmg * (1 - d / reach) ** 0.7);
        if (hit === 'tank' && d < 0.07) dmg = Math.max(dmg, Math.round(def.dmg * 0.8));
        dmg = Math.max(dmg, 4);
        damage[i] = Math.min(tk.hp, dmg); tk.hp = Math.max(0, tk.hp - dmg);
      }
    }
  }
  s.shots++;
  s.turn = who === 0 ? 1 : 0;
  return { path, booms, damage, hit };
}
export const tanksOver = (s) => {
  const d0 = s.tanks[0].hp <= 0, d1 = s.tanks[1].hp <= 0;
  if (d0 && d1) return { winner: null };
  if (d0) return { winner: 1 };
  if (d1) return { winner: 0 };
  return null;
};
// Compact copy of the state for the host to send after each shot, so both phones end up identical.
export const packTanks = (s) => ({ h: s.h.map((v) => Math.round(v * 1e5)), w: s.wind, t: s.turn, n: s.shots, k: s.tanks.map((t) => [Math.round(t.x * 1e5), t.hp, t.stock.big, t.stock.bounce, t.aim.a, t.aim.p]) });
export function unpackTanks(s, p) {
  s.h = p.h.map((v) => v / 1e5); s.wind = p.w; s.turn = p.t; s.shots = p.n;
  p.k.forEach((k, i) => { const t = s.tanks[i]; t.x = k[0] / 1e5; t.hp = k[1]; t.stock.big = k[2]; t.stock.bounce = k[3]; t.aim = { a: k[4], p: k[5] }; });
}
export function hashTanks(s) {
  let h = 0;
  for (const v of s.h) h = (h * 31 + Math.round(v * 1e5)) | 0;
  for (const t of s.tanks) h = (h * 31 + t.hp * 7 + Math.round(t.x * 1e5)) | 0;
  return h;
}
