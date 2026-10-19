// Snip Buddies engine: two paper buddies with polygon bodies, simple physics, snipping and level goals.
// No browser dependencies, so the game screen and tools/test-snip.mjs share it. Fully deterministic:
// the same level and the same inputs always give the same result (no Math.random, fixed time step).
import pc from './vendor/polygon-clipping/polygon-clipping.js';
import { LEVELS, DEFAULT_FLOOR } from './snip-levels.js';
import { BW, BH, LEG_N, LEG_C, LEG_T, uShape } from './snip-body.js';

export { LEVELS };
export const W = 10, H = 13;
export { BW, BH, LEG_N, LEG_C, LEG_T };
export const MIN_AREA = 0.3;                // a snip may not leave less paper than this
export const FILL_WIN = 0.82;               // fill score needed to finish a fill level
export const DT = 1 / 60;
const SUB = 2, G = 30, SPEED = 4.2, JUMP = 12, ROT = 2.4;
const LEG_RATE = 3.2;      // how fast legs bend or stretch, units a second
const LEG_HW = 0.42;       // half the width of the leg support (both legs and boots)
const UPRIGHT = 0.7;       // tilt (radians) past which the legs tuck away and the paper rests on the ground
// input bits (T: stand tall)
export const K = { L: 1, R: 2, J: 4, C: 8, RL: 16, RR: 32, T: 64 };

// ---------- polygon helpers (rings are arrays of [x, y], not closed) ----------
export function area(r) { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
const ccw = (r) => (area(r) < 0 ? r.slice().reverse() : r);
export function centroid(r) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n], f = p[0] * q[1] - q[0] * p[1]; a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f; }
  if (Math.abs(a) < 1e-9) return [r[0][0], r[0][1]];
  return [cx / (3 * a), cy / (3 * a)];
}
export function inside(x, y, r) {
  let c = false;
  for (let i = 0, n = r.length, j = n - 1; i < n; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
// Nearest edge of a CCW ring to a point: distance and the edge's outward normal.
function nearest(x, y, r, act) {
  let bd = Infinity, nx = 0, ny = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    if (act && !act[i]) continue;
    const a = r[i], b = r[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey || 1e-12;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / L2));
    const dx = x - (a[0] + ex * t), dy = y - (a[1] + ey * t), d = dx * dx + dy * dy;
    if (d < bd) { bd = d; const L = Math.sqrt(L2); nx = ey / L; ny = -ex / L; }
  }
  return { d: Math.sqrt(bd), nx, ny };
}
// Removes repeated and nearly straight points.
export function simplify(r, eps = 0.012) {
  let out = r.filter((p, i) => { const q = r[(i + r.length - 1) % r.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.01; });
  for (let pass = 0; pass < 3 && out.length > 3; pass++) {
    out = out.filter((p, i) => {
      const a = out[(i + out.length - 1) % out.length], b = out[(i + 1) % out.length];
      const ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1e-9;
      return Math.abs((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / L > eps;
    });
  }
  return out;
}
// Extra points along long edges so corners of other shapes cannot slip through the middle of an edge.
function resample(r, max) {
  const out = [];
  for (let i = 0, n = r.length; i < n; i++) {
    const a = r[i], b = r[(i + 1) % n], k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / max));
    for (let j = 0; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  return out;
}
const bbox = (r) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of r) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } return [x0, y0, x1, y1]; };
const rectRing = ([x, y, w, h]) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const circleRing = (x, y, r, n = 20) => [...Array(n)].map((_, i) => [x + r * Math.cos((i / n) * Math.PI * 2), y + r * Math.sin((i / n) * Math.PI * 2)]);
// polygon-clipping works on closed rings; these helpers convert both ways and keep the biggest piece.
const mp = (r) => [[r.map((p) => [p[0], p[1]])]];
const ringsArea = (m) => m.reduce((s, poly) => s + poly.reduce((t, ring, k) => t + (k ? -1 : 1) * Math.abs(area(ring.slice(0, -1))), 0), 0);
export function difference(a, b) { return pc.difference(mp(a), mp(b)); }
export function intersection(a, b) { return pc.intersection(mp(a), mp(b)); }
export function multiArea(m) { return ringsArea(m); }

// Vertices sharp enough to pop a balloon (inside angle under 75 degrees).
function sharpPoints(shape) {
  const out = [], n = shape.length;
  for (let i = 0; i < n; i++) {
    const a = shape[(i + n - 1) % n], p = shape[i], b = shape[(i + 1) % n];
    const ux = a[0] - p[0], uy = a[1] - p[1], vx = b[0] - p[0], vy = b[1] - p[1];
    const cross = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]);
    if (cross <= 0) continue; // a dent, not a point
    const ang = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1))));
    if (ang < (75 * Math.PI) / 180) out.push(i);
  }
  return out;
}

// ---------- bodies ----------
function setShape(b, shape) {
  b.shape = shape;
  b.col = resample(shape, 0.14);
  b.sharp = b.kind === 'buddy' ? sharpPoints(shape) : [];
  b.area = Math.abs(area(shape));
}
// A fresh sheet centred on its middle, and where the face sits on it.
const FRESH = (() => { const u = ccw(uShape(-BW / 2, -BH / 2)), [cx, cy] = centroid(u); return { ring: u.map(([x, y]) => [x - cx, y - cy]), top: -BH / 2 - cy, bottom: BH / 2 - cy }; })();
export const BODY_AREA = Math.abs(area(FRESH.ring));
const FACE0 = [0, FRESH.top + 0.62];
export const freshShape = () => FRESH.ring.map((p) => p.slice());
// Spawn points in the levels give the middle of the old 1.7 tall sheet on the ground, so the feet are 0.85 below.
function makeBuddy(i, x, y) {
  const foot = y + 0.85, by = foot - LEG_N - FRESH.bottom;
  const b = { kind: 'buddy', i, x, y: by, a: 0, vx: 0, vy: 0, leg: LEG_N, im: 1, grounded: false, gvx: 0, jumpT: 0, face: FACE0.slice(), spawn: [x, by] };
  setShape(b, freshShape());
  return b;
}
function makeBall(x, y, r) {
  const b = { kind: 'ball', x, y, a: 0, vx: 0, vy: 0, im: 2.5, r, spawn: [x, y] };
  setShape(b, circleRing(0, 0, r, 22));
  return b;
}
// World ring of a body: it turns and moves (the paper never squashes; the legs do the bending).
export function worldRing(b, ring = b.shape) {
  const c = Math.cos(b.a), s = Math.sin(b.a);
  return ring.map(([px, py]) => [b.x + px * c - py * s, b.y + px * s + py * c]);
}

// ---------- legs ----------
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const isUpright = (b) => Math.abs(wrapA(b.a)) < UPRIGHT;
// Where the legs join the paper: the lowest point of the paper close under the middle (world y).
export function hipY(b, wr = worldRing(b, b.col)) {
  let y = -Infinity, any = -Infinity;
  for (const p of wr) { if (p[1] > any) any = p[1]; if (Math.abs(p[0] - b.x) <= LEG_HW + 0.03 && p[1] > y) y = p[1]; }
  return y > -Infinity ? y : any;
}
// The legs as something solid: an upright box under the paper, from just inside the paper down to the feet.
export function legRing(b, wr) {
  if (b.kind !== 'buddy' || b.leg < 0.03) return null;
  const hy = hipY(b, wr);
  return resample(rectRing([b.x - LEG_HW, hy - 0.12, LEG_HW * 2, b.leg + 0.12]), 0.14);
}
// Leg length the controls ask for.
const legWant = (b, k) => (!isUpright(b) ? 0 : k & K.C ? LEG_C : k & K.T ? LEG_T : LEG_N);

// ---------- world ----------
export function createWorld(idx) {
  const lv = LEVELS[idx];
  const statics = [];
  const addStatic = (s) => {
    const ring = ccw(s.r ? rectRing(s.r) : s.p);
    statics.push({ ring, col: resample(ring, 0.3), bb: bbox(ring), r: s.r || null });
  };
  [...(lv.floor || DEFAULT_FLOOR), ...(lv.static || [])].forEach(addStatic);
  addStatic({ r: [-1, -6, 1, 20] }); addStatic({ r: [W, -6, 1, 20] });
  // Edges buried in other solid pieces (a ramp's base on the floor, seams between blocks) must not push,
  // or corners catch on them. An edge is live when the point just outside its middle is open space.
  for (const st of statics) {
    const r = st.col;
    st.act = r.map((a, i) => {
      const b = r[(i + 1) % r.length], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1;
      const mx = (a[0] + b[0]) / 2 + (ey / L) * 0.03, my = (a[1] + b[1]) / 2 - (ex / L) * 0.03;
      return !statics.some((o) => o !== st && inside(mx, my, o.ring));
    });
  }
  const w = {
    idx, lv, frame: 0, statics,
    buddies: lv.spawn.map(([x, y], i) => makeBuddy(i, x, y)),
    props: lv.ball ? [makeBall(...lv.ball)] : [],
    balloons: (lv.balloons || []).map(([x, y, r]) => ({ x, y, r, popped: false, ring: ccw(circleRing(x, y, r, 18)) })),
    buttons: (lv.buttons || []).map(([x, y, w2, h]) => ({ x, y, w: w2, h, on: false })),
    goal: lv.goal || null,
    target: null, score: 0, hold: 0, won: false, events: [],
  };
  if (lv.parts) {
    const u = pc.union(...lv.parts.map(mp));
    // the outline can be in several pieces (a buddy standing on another leaves a gap for the legs)
    const rings = u.map((poly) => ccw(poly[0].slice(0, -1)));
    w.target = { ring: rings[0], rings, area: ringsArea(u), mp: u };
  }
  return w;
}

// oneWay (buddy on buddy): paper buddies pass in front of each other, so they only push apart when one
// lands on top of the other. That lets them overlap to snip and still give each other a lift.
// Ag and Bg are all the solid pieces of each body (paper and legs), which move together.
// legsOf: which side ('A' or 'B') the piece is legs; legs can stand on a buddy but are never stood on.
function resolvePair(A, Ar, Ag, B, Br, Bg, Bstatic, oneWay = false, Bact = null, legsOf = null) {
  // deepest point of either shape inside the other gives the push direction (from B towards A)
  let best = null;
  for (const v of Ar) if (inside(v[0], v[1], Br)) { const e = nearest(v[0], v[1], Br, Bact); if (e.d < Infinity && (!best || e.d > best.d)) best = e; }
  for (const v of Br) if (inside(v[0], v[1], Ar)) { const e = nearest(v[0], v[1], Ar); if (!best || e.d > best.d) best = { d: e.d, nx: -e.nx, ny: -e.ny }; }
  if (!best || best.d < 1e-5) return false;
  if (oneWay) {
    if (Math.abs(best.ny) < 0.6 || best.d > 0.35) return false;
    const top = best.ny < 0 ? A : B, low = top === A ? B : A;
    if (top.vy - low.vy < -0.5) return false; // jumping up through: no push
    if ((legsOf === 'A' && top !== A) || (legsOf === 'B' && top !== B)) return false;
  }
  const { nx, ny } = best, d = Math.min(best.d, 0.5);
  const wa = A.im, wb = Bstatic ? 0 : B.im, sum = wa + wb;
  const da = (d * wa) / sum, db = (d * wb) / sum;
  A.x += nx * da; A.y += ny * da; for (const r of Ag) shift(r, nx * da, ny * da);
  if (!Bstatic) { B.x -= nx * db; B.y -= ny * db; for (const r of Bg) shift(r, -nx * db, -ny * db); }
  // velocities: stop moving into each other, with a little bounce for the ball and some friction
  const bvx = Bstatic ? 0 : B.vx, bvy = Bstatic ? 0 : B.vy;
  const rvx = A.vx - bvx, rvy = A.vy - bvy, vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    const e = A.kind === 'ball' || B?.kind === 'ball' ? 0.15 : 0;
    const j = -(1 + e) * vn / sum;
    A.vx += j * wa * nx; A.vy += j * wa * ny;
    if (!Bstatic) { B.vx -= j * wb * nx; B.vy -= j * wb * ny; }
    // rolling friction for the ball (buddies get their grip from the walk control instead)
    const tx = -ny, ty = nx, vt = rvx * tx + rvy * ty;
    const mu = A.kind === 'ball' || B?.kind === 'ball' ? 0.03 : 0;
    const jt = (-vt * mu) / sum;
    A.vx += jt * wa * tx; A.vy += jt * wa * ty;
    if (!Bstatic) { B.vx -= jt * wb * tx; B.vy -= jt * wb * ty; }
  }
  if (ny < -0.55) { A.grounded = true; A.gvx = bvx; }
  if (!Bstatic && -ny < -0.55) { B.grounded = true; B.gvx = A.vx; }
  return true;
}
function shift(r, dx, dy) { for (const p of r) { p[0] += dx; p[1] += dy; } }
const overlaps = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

// One fixed step (1/60 s). inputs: [bits for buddy 0, bits for buddy 1].
export function step(w, inputs) {
  const h = DT / SUB;
  for (let s = 0; s < SUB; s++) {
    for (const b of w.buddies) {
      const k = inputs[b.i] | 0;
      const dir = (k & K.R ? 1 : 0) - (k & K.L ? 1 : 0);
      const target = dir * SPEED + (b.grounded ? b.gvx : 0);
      const acc = b.grounded ? 40 : 18;
      if (dir || b.grounded) b.vx += Math.max(-acc * h, Math.min(acc * h, target - b.vx));
      b.jumpT = Math.max(0, b.jumpT - h);
      if (k & K.J && b.grounded && b.jumpT === 0) { b.vy = -JUMP; b.jumpT = 0.3; b.grounded = false; }
      b.a += ((k & K.RR ? 1 : 0) - (k & K.RL ? 1 : 0)) * ROT * h;
      b.leg += Math.max(-LEG_RATE * h, Math.min(LEG_RATE * h, legWant(b, k) - b.leg));
    }
    const dyn = [...w.buddies, ...w.props];
    for (const b of dyn) {
      b.vy = Math.min(18, b.vy + G * h);
      b.x += b.vx * h; b.y += b.vy * h;
      if (b.kind === 'ball') b.a += (b.vx * h) / b.r;
      b.grounded = false;
    }
    // balloons pop on a sharp point, otherwise they act as solid circles
    for (const bl of w.balloons) {
      if (bl.popped) continue;
      for (const b of w.buddies) {
        const wr = worldRing(b);
        if (b.sharp.some((i) => Math.hypot(wr[i][0] - bl.x, wr[i][1] - bl.y) < bl.r + 0.04)) { bl.popped = true; w.events.push({ k: 'pop', x: bl.x, y: bl.y }); break; }
      }
    }
    // each body is its paper plus, for an upright buddy, its legs
    const groups = dyn.map((b) => { const r = worldRing(b, b.col), l = legRing(b, r); return l ? [r, l] : [r]; });
    for (let it = 0; it < 5; it++) {
      let any = false;
      for (let i = 0; i < dyn.length; i++) {
        const A = dyn[i], Ag = groups[i];
        for (let pa = 0; pa < Ag.length; pa++) {
          const Ar = Ag[pa];
          for (const st of w.statics) if (overlaps(bbox(Ar), st.bb) && resolvePair(A, Ar, Ag, null, st.col, null, true, false, st.act)) any = true;
          for (const bl of w.balloons) if (!bl.popped && overlaps(bbox(Ar), [bl.x - bl.r, bl.y - bl.r, bl.x + bl.r, bl.y + bl.r]) && resolvePair(A, Ar, Ag, null, bl.ring, null, true)) any = true;
          for (let j = i + 1; j < dyn.length; j++) {
            const B = dyn[j], Bg = groups[j], buddies = A.kind === 'buddy' && B.kind === 'buddy';
            for (let pb = 0; pb < Bg.length; pb++) {
              if (buddies && pa === 1 && pb === 1) continue; // legs pass each other
              if (overlaps(bbox(Ar), bbox(Bg[pb])) && resolvePair(A, Ar, Ag, B, Bg[pb], Bg, false, buddies, null, buddies ? (pa === 1 ? 'A' : pb === 1 ? 'B' : null) : null)) any = true;
            }
          }
        }
      }
      if (!any) break;
    }
    // fell out of the world: back to the start
    for (const b of dyn) if (b.y > H + 4) { b.x = b.spawn[0]; b.y = b.spawn[1]; b.vx = b.vy = 0; w.events.push({ k: 'respawn', who: b.kind === 'buddy' ? b.i : -1 }); }
  }
  w.frame++;
  if (!w.won) checkGoal(w);
}

function checkGoal(w) {
  const lv = w.lv;
  let ok = false;
  if (lv.type === 'fill') {
    if (w.frame % 6) return; // the shape maths is the slow part, so it runs ten times a second
    try {
      const u = pc.union(mp(worldRing(w.buddies[0])), mp(worldRing(w.buddies[1])));
      const inter = pc.intersection(u, w.target.mp);
      const ua = ringsArea(u), ia = ringsArea(inter);
      w.score = Math.max(0, (ia - (ua - ia)) / w.target.area);
    } catch { w.score = 0; }
    ok = w.score >= FILL_WIN;
    w.hold = ok ? w.hold + 6 * DT : 0;
    if (w.hold >= 0.6) win(w);
    return;
  }
  if (lv.type === 'pop') ok = w.balloons.every((b) => b.popped);
  if (lv.type === 'goal') { const [x, y, gw, gh] = w.goal, b = w.props[0]; ok = b.x > x && b.x < x + gw && b.y > y && b.y < y + gh; }
  if (lv.type === 'press') {
    const rings = [...w.buddies, ...w.props].flatMap((b) => { const r = worldRing(b, b.col), l = legRing(b, r); return l ? [r, l] : [r]; });
    for (const bt of w.buttons) {
      const was = bt.on;
      bt.on = rings.some((r) => r.some((p) => p[0] > bt.x && p[0] < bt.x + bt.w && p[1] > bt.y - 0.1 && p[1] < bt.y + bt.h + 0.05));
      if (bt.on && !was) w.events.push({ k: 'press' });
    }
    ok = w.buttons.every((b) => b.on);
  }
  w.score = lv.type === 'pop' ? w.balloons.filter((b) => b.popped).length : lv.type === 'press' ? w.buttons.filter((b) => b.on).length : ok ? 1 : 0;
  w.hold = ok ? w.hold + DT : 0;
  if (w.hold >= (lv.type === 'pop' ? 0.2 : 0.5)) win(w);
}
function win(w) { w.won = true; w.events.push({ k: 'win' }); }

// ---------- snipping ----------
// Buddy p snips buddy 1 - p: the part of the partner under the snipper is cut away. Returns 'ok', 'none' or 'small'.
export function snip(w, p) {
  const me = w.buddies[p], other = w.buddies[1 - p];
  const A = worldRing(other), B = worldRing(me);
  let res;
  try { res = pc.difference(mp(A), mp(B)); } catch { return 'none'; }
  if (!res.length) return 'small';
  let best = null, bestA = 0;
  for (const poly of res) { const a = Math.abs(area(poly[0].slice(0, -1))); if (a > bestA) { bestA = a; best = poly[0].slice(0, -1); } }
  if (bestA > other.area - 0.004) return 'none';
  if (bestA < MIN_AREA) return 'small';
  // back into the partner's own frame, then re-centre on the new middle so it turns about its new centre
  const c = Math.cos(-other.a), s = Math.sin(-other.a);
  let local = best.map(([x, y]) => { const dx = x - other.x, dy = y - other.y; return [dx * c - dy * s, dx * s + dy * c]; });
  local = ccw(simplify(local));
  if (local.length < 3) return 'small';
  const [cx, cy] = centroid(local);
  local = local.map(([x, y]) => [x - cx, y - cy]);
  const ca = Math.cos(other.a), sa = Math.sin(other.a);
  other.x += cx * ca - cy * sa; other.y += cx * sa + cy * ca;
  other.face = [other.face[0] - cx, other.face[1] - cy];
  setShape(other, local);
  w.events.push({ k: 'snip', by: p });
  return 'ok';
}
export function resetShape(w, p) {
  const b = w.buddies[p];
  const ca = Math.cos(b.a), sa = Math.sin(b.a), dx = b.face[0] - FACE0[0], dy = b.face[1] - FACE0[1];
  // put the original sheet back where the face is, so the buddy does not jump around
  b.x += dx * ca - dy * sa; b.y += dx * sa + dy * ca;
  b.face = FACE0.slice();
  setShape(b, freshShape());
  b.y -= 0.05;
}
// Shape data sent over the network and applied on the other phone.
export const shapeOf = (b) => ({ s: b.shape.map((p) => [+p[0].toFixed(4), +p[1].toFixed(4)]), f: b.face.map((v) => +v.toFixed(4)) });
export function applyShape(b, d) { b.face = d.f; setShape(b, d.s); }
// A short fingerprint of the moving parts, used by the tests to check determinism.
export const stateHash = (w) => [...w.buddies, ...w.props].map((b) => [b.x, b.y, b.a, b.vx, b.vy, b.leg || 0].map((v) => v.toFixed(6)).join(',')).join('|') + `|${w.score}|${w.won}`;
