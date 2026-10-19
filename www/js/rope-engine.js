// Sweet Drop engine: a sweet hanging on ropes, Verlet physics on a fixed timestep.
// Shared by the game screen, tools/gen-rope.mjs and tools/test-rope.mjs, so it has no browser dependencies.
//
// The board is W x H units with y pointing down. Each rope is a hard maximum-length link between its
// anchor and the sweet (so the swing is exact and the same in the game and the tests); the rope points
// you see are only simulated when `visual` is on, and never push the sweet.

export const W = 10, H = 15;
export const G = 26;            // gravity, units per second squared
export const CR = 0.42;         // sweet radius
export const DT = 1 / 60;
const SUB = 2, ITER = 8;
const STAR_R = 0.75, FROG_R = 1.1, BUBBLE_R = 0.75, LIFT = 0.32;
export const TIMEOUT = 9;       // seconds before a stuck sweet counts as lost in the solver

// Level format: {candy:[x,y], ropes:[[ax,ay,len]], frog:[x,y], stars:[[x,y]x3], bubbles?:[[x,y]], spikes?:[[x,y,w,h,dir]], hooks?:[[x,y,r]]}
export function makeWorld(L, visual = false) {
  const [cx, cy] = L.candy;
  const w = {
    t: 0, visual, state: 'play', got: 0, spin: 0,
    candy: { x: cx, y: cy, px: cx, py: cy },
    ropes: [], loose: [],
    stars: L.stars.map(([x, y]) => ({ x, y, got: false })),
    bubbles: (L.bubbles || []).map(([x, y]) => ({ x, y, held: false, gone: false })),
    hooks: (L.hooks || []).map(([x, y, r]) => ({ x, y, r, used: false })),
    spikes: (L.spikes || []).map(([x, y, w2, h, dir]) => ({ x, y, w: w2, h, dir: dir || 'up' })),
    frog: { x: L.frog[0], y: L.frog[1] },
  };
  for (const [ax, ay, len] of L.ropes) addRope(w, ax, ay, len);
  return w;
}

function addRope(w, ax, ay, len) {
  const c = w.candy, r = { ax, ay, len, cut: false, pts: null, seg: 0 };
  if (w.visual) {
    const n = Math.max(5, Math.round(len * 2.4));
    r.seg = len / n;
    r.pts = [];
    for (let i = 1; i < n; i++) { const t = i / n, x = ax + (c.x - ax) * t, y = ay + (c.y - ay) * t; r.pts.push({ x, y, px: x, py: y }); }
  }
  w.ropes.push(r);
}

export const heldBubble = (w) => w.bubbles.findIndex((b) => b.held && !b.gone);

// Things the player can do right now: cut an attached rope, or pop the bubble holding the sweet.
export function actions(w) {
  const out = [];
  w.ropes.forEach((r, i) => { if (!r.cut) out.push(i); });
  if (heldBubble(w) >= 0) out.push('pop');
  return out;
}

// seg = which rope segment was cut (for the dangling pieces in the game); the solver leaves it out.
export function act(w, a, seg) {
  if (a === 'pop') { const i = heldBubble(w); if (i >= 0) { w.bubbles[i].gone = true; w.bubbles[i].x = w.candy.x; w.bubbles[i].y = w.candy.y; } return; }
  const r = w.ropes[a]; if (!r || r.cut) return;
  r.cut = true;
  if (w.visual && r.pts) {
    const k = Math.max(0, Math.min(r.pts.length, seg ?? Math.floor(r.pts.length / 2)));
    // the anchor end keeps hanging; the sweet end trails behind the sweet for a moment
    w.loose.push({ fix: 'anchor', ax: r.ax, ay: r.ay, pts: r.pts.slice(0, k), seg: r.seg, life: Infinity });
    w.loose.push({ fix: 'candy', pts: r.pts.slice(k), seg: r.seg, life: 0.8 });
    r.pts = null;
  }
}

function verlet(p, ax, ay, h, damp) {
  const vx = (p.x - p.px) * damp, vy = (p.y - p.py) * damp;
  p.px = p.x; p.py = p.y;
  p.x += vx + ax * h * h; p.y += vy + ay * h * h;
}

// One-sided distance constraint between a and b (inverse masses wa, wb): only pulls when stretched.
function pull(a, b, len, wa, wb) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d <= len || d === 0 || wa + wb === 0) return;
  const k = (d - len) / d / (wa + wb);
  a.x += dx * k * wa; a.y += dy * k * wa;
  b.x -= dx * k * wb; b.y -= dy * k * wb;
}

function chain(pts, seg, head, tail) {
  // head/tail are fixed points (or null for a free end); points in between have inverse mass 1
  const all = [head, ...pts, tail].filter(Boolean);
  const fixedA = !!head, fixedB = !!tail;
  for (let i = 0; i < all.length - 1; i++) {
    const wa = i === 0 && fixedA ? 0 : 1, wb = i === all.length - 2 && fixedB ? 0 : 1;
    pull(all[i], all[i + 1], seg, wa, wb);
  }
}

export function step(w) {
  if (w.state !== 'play') return;
  const h = DT / SUB, c = w.candy, hb = heldBubble(w);
  for (let s = 0; s < SUB; s++) {
    verlet(c, 0, hb >= 0 ? -G * LIFT : G, h, hb >= 0 ? 0.972 : 0.9995);
    for (let k = 0; k < ITER; k++) for (const r of w.ropes) if (!r.cut) pull({ x: r.ax, y: r.ay }, c, r.len, 0, 1);
    if (w.visual) {
      for (const r of w.ropes) if (!r.cut && r.pts) {
        for (const p of r.pts) verlet(p, 0, G, h, 0.985);
        for (let k = 0; k < 6; k++) chain(r.pts, r.seg, { x: r.ax, y: r.ay }, c);
      }
      for (const l of w.loose) {
        for (const p of l.pts) verlet(p, 0, G, h, 0.98);
        for (let k = 0; k < 4; k++) chain(l.pts, l.seg, l.fix === 'anchor' ? { x: l.ax, y: l.ay } : null, l.fix === 'candy' ? c : null);
      }
    }
  }
  w.t += DT;
  w.spin += (c.x - c.px) * 3.2;
  if (w.visual) { for (const l of w.loose) l.life -= DT; w.loose = w.loose.filter((l) => l.life > 0 && l.pts.length); }
  if (hb >= 0) { w.bubbles[hb].x = c.x; w.bubbles[hb].y = c.y; }
  // pick-ups and triggers
  for (const st of w.stars) if (!st.got && Math.hypot(st.x - c.x, st.y - c.y) < STAR_R) { st.got = true; w.got++; w.event = 'star'; }
  for (const b of w.bubbles) if (!b.held && !b.gone && Math.hypot(b.x - c.x, b.y - c.y) < BUBBLE_R) { b.held = true; w.event = 'bubble'; }
  for (const k of w.hooks) if (!k.used && Math.hypot(k.x - c.x, k.y - c.y) < k.r) { k.used = true; addRope(w, k.x, k.y, k.r); w.event = 'hook'; }
  // endings
  if (Math.hypot(w.frog.x - c.x, w.frog.y - c.y) < FROG_R) { w.state = 'won'; return; }
  for (const sp of w.spikes) {
    const nx = Math.max(sp.x, Math.min(sp.x + sp.w, c.x)), ny = Math.max(sp.y, Math.min(sp.y + sp.h, c.y));
    if (Math.hypot(nx - c.x, ny - c.y) < CR * 0.8) { w.state = 'lost'; w.why = 'spikes'; return; }
  }
  if (c.x < -1.5 || c.x > W + 1.5 || c.y > H + 1.5 || c.y < -1.5) { w.state = 'lost'; w.why = 'away'; }
}

// Cheap copy for the solver (never used with visual ropes).
export function clone(w) {
  return {
    ...w, candy: { ...w.candy },
    ropes: w.ropes.map((r) => ({ ...r })), loose: [],
    stars: w.stars.map((s) => ({ ...s })), bubbles: w.bubbles.map((b) => ({ ...b })), hooks: w.hooks.map((k) => ({ ...k })),
  };
}

// Depth-first search over actions on a time grid (every `every` frames). Returns {plan, stars, path} for the
// best plan found (stops early at 3 stars), or null. plan = [[frame, action], ...].
export function solve(L, { every = 9, needStars = 3, budget = 4e6 } = {}) {
  let best = null, frames = 0;
  const maxF = Math.round(TIMEOUT / DT);
  function run(w, f, plan, path) {
    while (w.state === 'play' && f < maxF) {
      if (frames++ > budget) return;
      if (f % every === 0) {
        const acts = actions(w);
        for (const a of acts) {
          const w2 = clone(w); act(w2, a);
          run(w2, f, [...plan, [f, a]], path.slice());
          if (best && best.stars >= needStars) return;
        }
      }
      step(w); f++;
      if (f % 3 === 0) path.push([w.candy.x, w.candy.y]);
    }
    if (w.state === 'won' && (!best || w.got > best.stars)) best = { plan, stars: w.got, path };
  }
  run(makeWorld(L), 0, [], []);
  return best;
}

// Replays a plan and reports the result (used by the test).
export function replay(L, plan) {
  const w = makeWorld(L), maxF = Math.round(TIMEOUT / DT);
  let f = 0, i = 0;
  while (w.state === 'play' && f < maxF) {
    while (i < plan.length && plan[i][0] === f) act(w, plan[i++][1]);
    step(w); f++;
  }
  return { state: w.state, stars: w.got };
}
