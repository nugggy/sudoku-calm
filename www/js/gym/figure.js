// Tumble Coach figure: a pictogram gymnast posed by joint angles and drawn as SVG.
// Angles are in degrees, clockwise from straight up, so 90 points right (the way the gymnast faces side on).
//   t   torso, hip to neck (0 standing, 90 lying face down with the head to the right, -90 lying on the back)
//   h   head nod (positive tucks the chin)
//   a1/a2 arms from the torso line (0 by the ears, 180 by the sides, 90 reaching forward), e1/e2 elbow bend
//   l1/l2 legs from the torso line (180 straight, 90 piked forward, above 180 behind), k1/k2 knee bend
//   x   travel along the floor, lift height in the air. The figure is dropped onto the floor (or a box) each frame.
// Side view: limb 1 is the near side, limb 2 the far side. Front view mirrors limb 2 so a1 = a2 is symmetrical.

const D = Math.PI / 180;
const dir = (a) => [Math.sin(a * D), -Math.cos(a * D)];
const add = (p, a, len) => { const [dx, dy] = dir(a); return [p[0] + dx * len, p[1] + dy * len]; };
export const LEN = { torso: 31, neck: 3, head: 8, upper: 15, fore: 14, thigh: 19, shin: 19 };
const KEYS = ['x', 'lift', 't', 'h', 'a1', 'e1', 'a2', 'e2', 'l1', 'k1', 'l2', 'k2'];
export const STAND = { x: 0, lift: 0, t: 0, h: 0, a1: 180, e1: 0, a2: 180, e2: 0, l1: 180, k1: 0, l2: 180, k2: 0 };

// Fill in a keyframe from its shorthands: a sets both arms, e both elbows, l both legs, k both knees.
export function full(f) {
  const p = { ...STAND };
  for (const k of ['a', 'e', 'l', 'k']) if (f[k] != null) { p[k + 1] = f[k]; p[k + 2] = f[k]; }
  for (const k of KEYS) if (f[k] != null) p[k] = f[k];
  p.view = f.view || 'side';
  return p;
}

const ease = (u) => u * u * (3 - 2 * u);
export function mix(p, q, u) {
  const s = ease(Math.max(0, Math.min(1, u))), o = {};
  for (const k of KEYS) o[k] = p[k] + (q[k] - p[k]) * s;
  o.view = s < 0.5 ? p.view : q.view;
  return o;
}

// Joint positions with the hip at the origin.
export function joints(p) {
  const front = p.view !== 'side', H = [0, 0];
  const N = add(H, p.t, LEN.torso);
  const head = add(N, p.t + p.h, LEN.neck + LEN.head);
  const sh = front ? 6 : 0, hp = front ? 4 : 0;
  const S1 = add(N, p.t + 90, sh), S2 = add(N, p.t - 90, sh), H1 = add(H, p.t + 90, hp), H2 = add(H, p.t - 90, hp);
  const m = front ? -1 : 1; // front view mirrors the second side
  const arm = (S, a, e, sg) => { const el = add(S, p.t + sg * a, LEN.upper); return [S, el, add(el, p.t + sg * (a - e), LEN.fore)]; };
  const leg = (Hh, l, k, sg) => { const kn = add(Hh, p.t + sg * l, LEN.thigh); return [Hh, kn, add(kn, p.t + sg * (l + k), LEN.shin)]; };
  return { H, N, head, arm1: arm(S1, p.a1, p.e1, 1), arm2: arm(S2, p.a2, p.e2, m), leg1: leg(H1, p.l1, p.k1, 1), leg2: leg(H2, p.l2, p.k2, m) };
}

// Box tops (as negative y) under a point, or the floor.
const surface = (props, x) => {
  let y = 0;
  for (const b of props || []) if (x >= b.x - 1 && x <= b.x + b.w + 1) y = Math.min(y, -b.h);
  return y;
};
const R = { head: LEN.head, hand: 3, foot: 3.5, body: 5 };

// Place the posed figure in the world: x along the floor, resting on whatever is below it.
export function place(p, props) {
  const j = joints(p);
  const pts = [[j.head, R.head], [j.H, R.body], [j.N, R.body], ...['arm1', 'arm2'].flatMap((k) => [[j[k][1], 3.5], [j[k][2], R.hand]]), ...['leg1', 'leg2'].flatMap((k) => [[j[k][1], 4], [j[k][2], R.foot]])];
  let off = Infinity;
  for (const [[x, y], r] of pts) off = Math.min(off, surface(props, x + p.x) - (y + r));
  off -= p.lift;
  const mv = ([x, y]) => [x + p.x, y + off];
  const out = { H: mv(j.H), N: mv(j.N), head: mv(j.head), view: p.view, t: p.t, h: p.h };
  for (const k of ['arm1', 'arm2', 'leg1', 'leg2']) out[k] = j[k].map(mv);
  return out;
}

const f1 = (n) => Math.round(n * 10) / 10;
const line = (pts, w, cls) => `<polyline class="${cls}" points="${pts.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ')}" stroke-width="${w}"/>`;

// The SVG for one placed figure. hl lists body parts to ring: head, hands, feet, hips, knees, shoulders.
export function figureSvg(w, { hl = [], ghost = false } = {}) {
  const side = w.view === 'side', back = w.view === 'back';
  const limb = (k, cls) => line(w[k], k.startsWith('leg') ? 8 : 6.5, cls);
  const far = side ? 'gf-far' : 'gf-limb';
  const [hx, hy] = w.head;
  // hair bun at the back of the head, a face that looks the way the body faces
  const backDir = dir(w.t + w.h - (side ? 100 : 0));
  const bun = side ? `<circle class="gf-hair" cx="${f1(hx + backDir[0] * 7)}" cy="${f1(hy + backDir[1] * 7)}" r="3.6"/>` : `<circle class="gf-hair" cx="${f1(hx + dir(w.t + w.h)[0] * 7.5)}" cy="${f1(hy + dir(w.t + w.h)[1] * 7.5)}" r="3.8"/>`;
  let face = '';
  if (side) { const e = dir(w.t + w.h + 75); face = `<circle class="gf-eye" cx="${f1(hx + e[0] * 4.6)}" cy="${f1(hy + e[1] * 4.6)}" r="1.25"/>`; }
  else if (!back) {
    const up = dir(w.t + w.h), rt = dir(w.t + w.h + 90);
    const pt = (u, r) => [hx + up[0] * u + rt[0] * r, hy + up[1] * u + rt[1] * r];
    const at = (u, r) => pt(u, r).map(f1).join(',');
    const eye = (r) => { const [x, y] = pt(1.5, r); return `<circle class="gf-eye" cx="${f1(x)}" cy="${f1(y)}" r="1.15"/>`; };
    face = `${eye(2.8)}${eye(-2.8)}<path class="gf-smile" d="M${at(-2.2, 2.6)} Q${at(-4.6, 0)} ${at(-2.2, -2.6)}"/>`;
  }
  const torso = `<line class="gf-suit" x1="${f1(w.H[0])}" y1="${f1(w.H[1])}" x2="${f1(w.N[0])}" y2="${f1(w.N[1])}" stroke-width="${side ? 11 : 15}"/>`;
  const ring = (p) => `<circle class="gf-hl" cx="${f1(p[0])}" cy="${f1(p[1])}" r="7"/>`;
  const spots = { head: [w.head], hands: [w.arm1[2], w.arm2[2]], feet: [w.leg1[2], w.leg2[2]], hips: [w.H], knees: [w.leg1[1], w.leg2[1]], shoulders: [w.N] };
  return `<g class="gfig${ghost ? ' ghost' : ''}">${hl.flatMap((k) => spots[k] || []).map(ring).join('')}
    ${limb('arm2', far)}${limb('leg2', far)}${bun}${limb('leg1', 'gf-limb')}${torso}
    <circle class="gf-head" cx="${f1(hx)}" cy="${f1(hy)}" r="${LEN.head}"/>${face}${limb('arm1', 'gf-limb')}</g>`;
}

export function propsSvg(props) {
  return (props || []).map((b) => b.type === 'box'
    ? `<rect class="gf-box" x="${b.x}" y="${-b.h}" width="${b.w}" height="${b.h}" rx="3"/>`
    : `<rect class="gf-mat" x="${b.x}" y="${-b.h}" width="${b.w}" height="${b.h + 1}" rx="2"/>`).join('');
}

// Bounding box of a set of placed figures and props, padded.
export function bounds(placed, props, pad = 14) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = 0;
  const take = ([x, y], r = 6) => { x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r); };
  for (const w of placed) { take(w.head, 12); take(w.H); take(w.N); for (const k of ['arm1', 'arm2', 'leg1', 'leg2']) w[k].forEach((p) => take(p)); }
  for (const b of props || []) { take([b.x, -(b.h || 0)], 0); take([b.x + b.w, 0], 0); }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: Math.max(y1, 6) - y0 + pad + 6 };
}

// A complete still picture of one pose, for cards and step thumbnails.
export function stillSvg(frame, { props = [], hl = [], cls = '', box = null, mirror = false } = {}) {
  const w = place(full(frame), props);
  const b = box || bounds([w], props.filter((p) => Math.abs(p.x - w.H[0]) < 80));
  const fl = mirror ? ` transform="translate(${f1(2 * b.x + b.w)},0) scale(-1,1)"` : '';
  return `<svg class="gym-svg ${cls}" viewBox="${f1(b.x)} ${f1(b.y)} ${f1(b.w)} ${f1(b.h)}" aria-hidden="true"><g${fl}>
    <line class="gf-floor" x1="${f1(b.x)}" y1="0.5" x2="${f1(b.x + b.w)}" y2="0.5"/>${propsSvg(props)}${figureSvg(w, { hl })}</g></svg>`;
}
