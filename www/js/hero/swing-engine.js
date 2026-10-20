// Web Swing engine: the city, the swing physics, tricks, pickups and challenges, with no browser code so the
// tests can run it. Units are metres, y grows upwards and the street is at y = 0. One input: press and release.
//   press while airborne: shoot a web at the best anchor ahead (a quick tap instead does a flip)
//   press on a roof or during a wall run: jump off, then web
//   release while swinging: let go (near the bottom of the forward swing gives a speed boost)

export const GRAV = 24, HERO_H = 1.9, REACH = 20, MAX_SPEED = 42, STEP = 1 / 120;
export const TAP = 0.16;            // a press shorter than this is a tap: a flip in the air, a hop on a roof
export const FLIP_TIME = 0.42;      // seconds per flip
export const SPAN = 12;             // the generator never leaves more than this between anchors
export const MILESTONE = 250;       // metres between milestone banners

export function rngOf(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- challenges ----------
// Three per run, picked from the pool by the run's seed. `need` is checked against the run's stats.
export const CHALLENGES = [
  { id: 'chain6', text: 'Chain 6 swings without landing', stat: 'bestCombo', need: 6, reward: 15 },
  { id: 'chain10', text: 'Chain 10 swings without landing', stat: 'bestCombo', need: 10, reward: 30 },
  { id: 'flips2', text: 'Do 2 flips in one jump', stat: 'bestFlipsJump', need: 2, reward: 15 },
  { id: 'flips3', text: 'Do 3 flips in one jump', stat: 'bestFlipsJump', need: 3, reward: 30 },
  { id: 'coins30', text: 'Collect 30 coins', stat: 'coins', need: 30, reward: 15 },
  { id: 'coins60', text: 'Collect 60 coins', stat: 'coins', need: 60, reward: 30 },
  { id: 'dist300', text: 'Swing 300 m', stat: 'dist', need: 300, reward: 15 },
  { id: 'dist600', text: 'Swing 600 m', stat: 'dist', need: 600, reward: 30 },
  { id: 'sweet5', text: 'Hit 5 perfect releases', stat: 'sweets', need: 5, reward: 20 },
  { id: 'rings4', text: 'Fly through 4 speed rings', stat: 'rings', need: 4, reward: 20 },
  { id: 'kick2', text: 'Kick 2 drones during a flip', stat: 'kicks', need: 2, reward: 25 },
  { id: 'wall2', text: 'Run up 2 walls', stat: 'walls', need: 2, reward: 20 },
];
export function pickChallenges(seed) {
  const r = rngOf(seed ^ 0x5eed), pool = CHALLENGES.slice(), out = [], stats = new Set();
  while (out.length < 3 && pool.length) {
    const c = pool.splice(Math.floor(r() * pool.length), 1)[0];
    if (stats.has(c.stat)) continue; // three different kinds of goal
    stats.add(c.stat); out.push({ ...c, done: false });
  }
  return out;
}

// ---------- the city ----------
// Buildings, anchors (roof corners, cranes on roofs, billboards and tower cranes standing in wide gaps),
// coin trails along good swing lines, speed rings and drones. Generated in chunks ahead of the hero.
function newWorld(seed) {
  const W = { rnd: rngOf(seed), blds: [], anchors: [], rings: [], coins: [], drones: [], props: [], endX: 0, lastAnchorX: -20 };
  const b0 = { x: -14, w: 20, h: 16 };
  W.blds.push(b0); W.endX = b0.x + b0.w;
  addAnchor(W, { x: b0.x + b0.w - 0.4, y: b0.h - 0.15, kind: 'corner' });
  addAnchor(W, { x: 2, y: b0.h + 9, kind: 'crane' }); W.props.push({ kind: 'crane', bx: -6, base: b0.h, x: 2, y: b0.h + 9 });
  return W;
}
function addAnchor(W, a) { W.anchors.push(a); W.lastAnchorX = Math.max(W.lastAnchorX, a.x); }
function grow(W, until) {
  const r = W.rnd;
  while (W.endX < until) {
    const prev = W.blds[W.blds.length - 1], d = Math.max(0, W.endX);
    const hard = Math.min(1, d / 1500);
    const gap = 3 + r() * (4 + 6 * hard);
    const w = 6 + r() * 10;
    const h = clamp(prev.h + (r() - 0.5) * (12 + 10 * hard), 10, 36 + 6 * hard);
    const b = { x: prev.x + prev.w + gap, w, h };
    // a tower crane standing in a wide gap, so there is always something to swing from
    const gapMid = prev.x + prev.w + gap / 2;
    // every gap gets something to swing through it: a tower crane over a wide gap, a cable between roof poles over a narrow one
    if (gap > 6.5 || b.x - W.lastAnchorX > SPAN) {
      const top = Math.max(prev.h, h) + 8 + r() * 4;
      addAnchor(W, { x: gapMid, y: top, kind: 'tower' }); W.props.push({ kind: 'tower', x: gapMid, y: top });
    } else {
      const top = Math.max(prev.h, h) + 7.5 + r() * 2;
      addAnchor(W, { x: gapMid, y: top, kind: 'wire' }); W.props.push({ kind: 'wire', x: gapMid, y: top, x0: prev.x + prev.w - 0.6, h0: prev.h, x1: b.x + 0.6, h1: h });
    }
    W.blds.push(b);
    // anchors on the building: front corner, sometimes a roof crane or a billboard, then the back corner
    addAnchor(W, { x: b.x + 0.4, y: h - 0.15, kind: 'corner' });
    if (w > 8 && r() < 0.35) {
      const bx = b.x + w * (0.25 + r() * 0.3), top = h + 9 + r() * 5, tip = Math.min(b.x + w + 4, bx + 6 + r() * 4);
      addAnchor(W, { x: tip, y: top, kind: 'crane' }); W.props.push({ kind: 'crane', bx, base: h, x: tip, y: top });
    } else if (r() < 0.4) {
      const cx = b.x + w * 0.5, top = h + 5.5 + r() * 2;
      addAnchor(W, { x: cx, y: top, kind: 'board' }); W.props.push({ kind: 'board', x: cx, y: top, w: Math.min(w * 0.7, 6), base: h, hue: Math.floor(r() * 4) });
    }
    addAnchor(W, { x: b.x + w - 0.4, y: h - 0.15, kind: 'corner' });
    // make sure there is a high anchor now and then, so a hero up high still has something above
    if (!W.anchors.some((a) => a.x > b.x + 1 && a.y >= h + 8)) { const cx = b.x + w * 0.6, top = h + 8.5 + r() * 2; addAnchor(W, { x: cx, y: top, kind: 'board' }); W.props.push({ kind: 'board', x: cx, y: top, w: Math.min(w * 0.7, 6), base: h, hue: Math.floor(r() * 4), tall: true }); }
    // pickups along the ideal line under an anchor
    const a = W.anchors[W.anchors.length - 2];
    if (d > 20 && r() < 0.45) {
      for (let k = 0; k < 6; k++) {
        const ang = -0.75 + k * 0.3, R = 8.5, x = a.x + Math.sin(ang) * R, y = a.y - Math.cos(ang) * R;
        if (y > 3 && !W.blds.some((q) => x > q.x - 0.5 && x < q.x + q.w + 0.5 && y < q.h + 0.8)) W.coins.push({ x, y, got: false });
      }
    }
    if (d > 60 && r() < 0.3 + 0.15 * hard) W.rings.push({ x: gapMid, y: Math.min(prev.h, h) + 5 + r() * 4, got: false });
    if (d > 120 && r() < 0.12 + 0.3 * hard) {
      const overGap = r() < 0.5;
      W.drones.push({ x: overGap ? gapMid : b.x + w * 0.5, y0: (overGap ? Math.max(prev.h, h) : h) + 4 + r() * 5, amp: 0.8 + r() * 1.6, ph: r() * 6.283, alive: true });
    }
    W.endX = b.x + w;
  }
}
function prune(W, behind) {
  const keep = (o) => (o.x + (o.w || 0)) > behind;
  if (W.blds.length > 6) { while (W.blds.length > 6 && !keep(W.blds[0])) W.blds.shift(); }
  for (const k of ['anchors', 'rings', 'coins', 'drones', 'props']) { const arr = W[k]; let i = 0; while (i < arr.length && arr[i].x < behind) i++; if (i) arr.splice(0, i); }
}
export const buildingAt = (W, x) => W.blds.find((b) => x >= b.x && x <= b.x + b.w);

// How far the swing from anchor a (web length L) dips below the front walls of the buildings it passes (0 when clear).
export function swingBlocked(W, x, a, L) {
  let worst = 0;
  for (const b of W.blds) {
    if (b.x <= x || b.x > a.x + L) continue;
    const off = b.x - a.x;
    const feet = Math.abs(off) < L ? a.y - Math.sqrt(L * L - off * off) - HERO_H : a.y - HERO_H;
    worst = Math.max(worst, b.h + 0.2 - feet);
  }
  return worst;
}
// The best anchor ahead of a hand at (x, hy): far enough ahead to give a good swing, above the hand, within reach.
export function bestAnchor(W, x, hy) {
  let best = null, score = Infinity;
  for (const a of W.anchors) {
    const dx = a.x - x, dy = a.y - hy;
    if (dx < 0.8 || dx > REACH || dy < 1.5) continue;
    const d = Math.hypot(dx, dy); if (d > REACH) continue;
    const s = Math.abs(dx - 9) + Math.abs(dy - 8) * 0.6 - (a.kind === 'crane' || a.kind === 'tower' ? 0.8 : 0) + swingBlocked(W, x, a, d * 0.95) * 4;
    if (s < score) { score = s; best = a; }
  }
  return best;
}

// ---------- a run ----------
export function createRun(seed) {
  const W = newWorld(seed);
  grow(W, 160);
  const S = {
    seed, W, t: 0, acc: 0, mode: 'start', x: 0, y: W.blds[0].h, vx: 0, vy: 0, rot: 0,
    web: null, len: 0, holding: false, holdT: 0, pre: null, pressWeb: false,
    flip: null, wall: null, vault: null, roof: W.blds[0],
    combo: 0, bestCombo: 0, flips: 0, flipsJump: 0, bestFlipsJump: 0, coins: 0, sweets: 0, rings: 0, kicks: 0, walls: 0, style: 0,
    dist: 0, milestone: MILESTONE, challenges: pickChallenges(seed), events: [], dead: false,
  };
  return S;
}
const ev = (S, k, o = {}) => S.events.push({ k, x: S.x, y: S.y, ...o });
const mult = (S) => 1 + Math.floor(S.combo / 3) * 0.5;
const speed = (S) => Math.hypot(S.vx, S.vy);
export function aim(S) { return S.mode === 'dead' ? null : bestAnchor(S.W, S.x, S.y + HERO_H); }
// Release timing: 1 inside the sweet spot (just past the bottom of a forward swing, rising), fading to 0 around it.
export function sweetness(S) {
  if (!S.web) return 0;
  const th = Math.atan2(S.x - S.web.x, S.web.y - (S.y + HERO_H));
  if (S.vx < 2) return 0;
  if (th >= 0.25 && th <= 0.85) return 1;
  const d = th < 0.25 ? 0.25 - th : th - 0.85;
  return Math.max(0, 1 - d / 0.35);
}

function attach(S) {
  const a = aim(S);
  if (!a) return false;
  if (S.flip) { S.flip = null; S.rot = 0; } // a web cancels an unfinished flip
  S.vault = null;
  S.web = { x: a.x, y: a.y, kind: a.kind };
  S.len = Math.hypot(a.x - S.x, a.y - (S.y + HERO_H)) * 0.95;
  S.mode = 'swing';
  S.combo++; S.bestCombo = Math.max(S.bestCombo, S.combo);
  S.flipsJump = 0;
  ev(S, 'web', { ax: a.x, ay: a.y, combo: S.combo });
  return true;
}
function jumpOff(S, vx, vy) { S.vault = null; S.mode = 'air'; S.vx = vx; S.vy = vy; S.roof = null; S.wall = null; S.y += 0.05; }

export function press(S) {
  if (S.dead || S.holding) return;
  S.holding = true; S.holdT = 0; S.pre = { vx: S.vx, vy: S.vy, mode: S.mode }; S.pressWeb = false;
  if (S.mode === 'start') { jumpOff(S, 10, 9); ev(S, 'start'); }
  else if (S.mode === 'roof') { jumpOff(S, Math.max(S.vx, 9), 9); ev(S, 'jump'); }
  else if (S.mode === 'wall') {
    // vault: spring up past the roof edge and drift onto the roof (or web from the top of the jump)
    const need = S.wall.b.h - S.y + 1.2;
    const b = S.wall.b; jumpOff(S, 0, Math.min(19, Math.sqrt(2 * GRAV * Math.max(0.6, need)))); S.vault = b; ev(S, 'kickoff');
  }
  if (S.mode === 'air' && S.pre.mode !== 'wall') {
    if (attach(S)) S.pressWeb = true;
    else if (S.pre.mode === 'air' || S.pre.mode === 'swing') doFlip(S); // nothing in reach: the press is a flip
    else ev(S, 'miss');
  }
}
export function release(S) {
  if (!S.holding) return;
  S.holding = false;
  if (S.mode !== 'swing' || !S.web) return;
  if (S.pressWeb && S.holdT < TAP && S.pre.mode === 'air') {
    // a quick tap in the air: take the web back and flip instead
    S.web = null; S.mode = 'air'; S.vx = S.pre.vx; S.vy = S.pre.vy; S.combo = Math.max(0, S.combo - 1);
    doFlip(S); return;
  }
  const sw = sweetness(S);
  S.web = null; S.mode = 'air';
  if (sw >= 1) { S.vx *= 1.15; S.vy = S.vy * 1.1 + 2.5; S.sweets++; S.style += Math.round(25 * mult(S)); ev(S, 'sweet'); }
  else ev(S, 'release');
}
function doFlip(S) {
  if (S.mode !== 'air') return;
  if (!S.flip) S.flip = { left: FLIP_TIME, queued: 0 }; else S.flip.queued++;
  ev(S, 'flipstart');
}

function landOnRoof(S, b) {
  const partial = S.flip ? (FLIP_TIME - S.flip.left) / FLIP_TIME : 0;
  const bad = S.flip && partial > 0.18 && partial < 0.82;
  S.mode = 'roof'; S.roof = b; S.y = b.h; S.vy = 0; S.flip = null; S.rot = 0; S.web = null; S.vault = null;
  if (bad) { S.vx *= 0.35; ev(S, 'badland', { combo: S.combo }); }
  else ev(S, 'land', { combo: S.combo });
  S.combo = 0; S.flipsJump = 0;
  S.vx = Math.max(S.vx, bad ? 3 : 7);
}

function sub(S, dt) {
  S.t += dt;
  if (S.holding) S.holdT += dt;
  if (S.mode === 'start' || S.mode === 'dead') return;
  if (S.mode === 'roof') {
    const b = S.roof;
    S.vx += (10 - S.vx) * Math.min(1, dt * 3);
    S.x += S.vx * dt;
    if (S.x > b.x + b.w) { jumpOff(S, S.vx, 6.5); ev(S, 'edge'); }
  } else if (S.mode === 'wall') {
    const w = S.wall;
    w.v -= 16 * dt; w.left -= dt;
    S.y += w.v * dt; S.x = w.b.x - 0.45;
    if (S.y >= w.b.h) { S.mode = 'roof'; S.roof = w.b; S.y = w.b.h; S.x = w.b.x + 0.3; S.vx = 7; S.wall = null; S.combo = 0; ev(S, 'land', { combo: 0 }); }
    else if (w.v <= 0 || w.left <= 0) { S.mode = 'air'; S.vx = -2; S.vy = 0; S.wall = null; ev(S, 'wallfall'); }
  } else {
    const px = S.x, py = S.y;
    S.vy -= GRAV * dt;
    S.x += S.vx * dt; S.y += S.vy * dt;
    if (S.web) {
      // the web keeps the hand within its length of the anchor and takes away outward speed
      const hx = S.x, hy = S.y + HERO_H, dx = hx - S.web.x, dy = hy - S.web.y, d = Math.hypot(dx, dy);
      if (d > S.len) {
        const nx = dx / d, ny = dy / d;
        S.x -= nx * (d - S.len); S.y -= ny * (d - S.len);
        const out = S.vx * nx + S.vy * ny;
        if (out > 0) { S.vx -= out * nx; S.vy -= out * ny; }
      }
      // holding reels the web in a little; the swing speeds up to keep its angular momentum
      if (S.holding && S.len > 5) {
        const nl = Math.max(5, S.len - dt * 1.6), k = S.len / nl;
        const nx = dx / (d || 1), ny = dy / (d || 1), out = S.vx * nx + S.vy * ny;
        const tx = S.vx - out * nx, ty = S.vy - out * ny;
        S.vx = out * nx + tx * Math.min(k, 1.01); S.vy = out * ny + ty * Math.min(k, 1.01);
        S.len = nl;
      }
    } else if (S.vault) {
      // vaulting off a wall: straight up until clear of the roof, then onto it
      S.vx = S.y > S.vault.h + 0.3 ? 3 : 0; S.x = Math.max(S.x, S.vault.x - 0.45);
      if (S.vy < 0 && S.y < S.vault.h) S.vault = null;
    } else {
      S.vx *= 1 - 0.04 * dt; // a little air drag, no steering
    }
    const sp = speed(S); if (sp > MAX_SPEED) { S.vx *= MAX_SPEED / sp; S.vy *= MAX_SPEED / sp; }
    // flips
    if (S.flip) {
      S.flip.left -= dt;
      S.rot = -6.283 * (1 - Math.max(0, S.flip.left) / FLIP_TIME);
      if (S.flip.left <= 0) {
        S.flips++; S.flipsJump++; S.bestFlipsJump = Math.max(S.bestFlipsJump, S.flipsJump);
        S.style += Math.round(50 * S.flipsJump * mult(S)); ev(S, 'flip', { n: S.flipsJump });
        if (S.flip.queued > 0) S.flip = { left: FLIP_TIME, queued: S.flip.queued - 1 }; else { S.flip = null; S.rot = 0; }
      }
    }
    // buildings: land on roofs, run up walls when fast, bounce off when slow
    for (const b of S.W.blds) {
      if (S.x + 0.4 <= b.x || S.x - 0.4 >= b.x + b.w || S.y >= b.h) continue;
      if (py >= b.h - 0.05 && S.vy <= 0) { landOnRoof(S, b); break; }
      if (px <= b.x + 0.3) {
        const v = speed(S);
        S.web = null; S.flip = null; S.rot = 0;
        if (v > 7 && S.y > 1) { S.mode = 'wall'; S.walls++; S.wall = { b, v: clamp(v * 0.7, 8, 15), left: 0.75 }; S.x = b.x - 0.45; S.vx = 0; S.vy = 0; ev(S, 'wall'); }
        else { S.x = b.x - 0.45; S.vx = -Math.abs(S.vx) * 0.2 - 1; ev(S, 'bonk'); }
        break;
      }
      if (px >= b.x + b.w - 0.3) { S.x = b.x + b.w + 0.45; S.vx = Math.abs(S.vx) * 0.2; S.web = null; if (S.mode === 'swing') S.mode = 'air'; ev(S, 'bonk'); break; }
      // came up from below a roof edge somehow: push out the top
      S.y = b.h; S.vy = Math.max(0, S.vy);
    }
    if (S.y <= 0 && S.mode !== 'roof' && S.mode !== 'wall') { S.y = 0; S.mode = 'dead'; S.dead = true; S.web = null; ev(S, 'dead'); return; }
  }
  // pickups and drones (hero centre about 1 m above the feet)
  const cx = S.x, cy = S.y + 1;
  for (const c of S.W.coins) if (!c.got && Math.abs(c.x - cx) < 1.1 && Math.abs(c.y - cy) < 1.3) { c.got = true; S.coins++; ev(S, 'coin', { n: S.coins, cx: c.x, cy: c.y }); }
  for (const r of S.W.rings) if (!r.got && Math.hypot(r.x - cx, r.y - cy) < 1.8) {
    r.got = true; S.rings++; S.style += Math.round(30 * mult(S));
    const sp = speed(S); if (sp > 1) { const k = Math.min(MAX_SPEED, sp * 1.12 + 2) / sp; S.vx *= k; S.vy *= k; }
    ev(S, 'ring', { cx: r.x, cy: r.y });
  }
  for (const d of S.W.drones) {
    if (!d.alive) continue;
    const dy = d.y0 + Math.sin(S.t * 1.5 + d.ph) * d.amp;
    if (Math.hypot(d.x - cx, dy - cy) > 1.3) continue;
    d.alive = false;
    if (S.flip) { S.kicks++; S.style += Math.round(80 * mult(S)); S.vy = Math.max(S.vy, 0) + 5; ev(S, 'kick', { cx: d.x, cy: dy }); }
    else { S.combo = 0; S.web = null; if (S.mode === 'swing') S.mode = 'air'; S.vx *= 0.5; S.vy = Math.min(S.vy, 2); ev(S, 'hit', { cx: d.x, cy: dy }); }
  }
  // distance, milestones and challenges
  if (S.x > S.dist) S.dist = S.x;
  if (S.dist >= S.milestone) { ev(S, 'milestone', { m: S.milestone }); S.milestone += MILESTONE; }
  for (const c of S.challenges) if (!c.done && S[c.stat] >= c.need) { c.done = true; ev(S, 'challenge', { text: c.text, reward: c.reward }); }
  grow(S.W, S.dist + 200);
  prune(S.W, S.x - 40);
}

// Advances the run by dt seconds in fixed steps. Events from this call are left in S.events for the screen.
export function step(S, dt) {
  S.acc += Math.min(dt, 0.1);
  while (S.acc >= STEP) { S.acc -= STEP; sub(S, STEP); if (S.dead) { S.acc = 0; break; } }
}
export function droneY(S, d) { return d.y0 + Math.sin(S.t * 1.5 + d.ph) * d.amp; }
export const comboMult = mult;
export function coinsEarned(S) { return Math.round(S.dist / 12) + S.coins + Math.round(S.style / 200) + S.challenges.filter((c) => c.done).reduce((a, c) => a + c.reward, 0); }
// For tests: build the city out to x without playing.
export function growTo(S, x) { grow(S.W, x); }
