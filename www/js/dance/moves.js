// Dance Party moves: how the coach dances each one, what the phone in your hand should feel, and the gesture that
// stands in for it in Tap along mode. No browser dependencies (tools/test-dance.mjs runs the scoring on these).
//
// pose(t) gives the coach's pose t beats into the move, in the Marvel Heroes rig (hero/kit.js): la and ra are the arm
// angles (0 hangs down, PI points up; la swings out to the screen's right), ll and rl the legs, bend the bent-leg
// picture, lean tilts at the hips, drop moves the whole body down (negative is up) and x slides it sideways.
// The coach faces you like a mirror, so its left arm (la, on the screen's right) is your right hand with the phone.
//
// sig is what the phone should feel during the move (see score.js):
//   energy  'low' (hold still), 'mid' or 'high', from how hard the phone moves
//   vert    share of the movement that is up and down (0 sideways, 1 straight up and down); null = any direction
//   hits    beats within the move where the movement should peak, for timing
//   spin    true when the phone should turn (circles and rolls), if the phone has a gyroscope
// tap is the Tap along gesture: 'tap', 'hold', 'up', 'down', 'left' or 'right'.

const PI = Math.PI;
const STAND = { la: 0.12, ra: -0.12, ll: 0.04, rl: -0.04, bend: 0, lean: 0, drop: 0, x: 0 };
const KEYS = ['la', 'ra', 'll', 'rl', 'lean', 'drop', 'x'];
const ease = (f) => f * f * (3 - 2 * f);

// A pose from keyframes [[beat, partial pose], ...] that loops every `loop` beats (the last frame eases back to the first).
function frames(list, loop) {
  const full = list.map(([b, p]) => [b, { ...STAND, ...p }]);
  return (t) => {
    const u = ((t % loop) + loop) % loop;
    let i = full.length - 1;
    while (i > 0 && full[i][0] > u) i--;
    const [b0, p0] = full[i], [b1n, p1] = full[(i + 1) % full.length];
    const b1 = i + 1 < full.length ? b1n : loop + full[0][0];
    const f = b1 > b0 ? ease(Math.min(1, (u - b0) / (b1 - b0))) : 0;
    const out = { bend: f < 0.5 ? p0.bend : p1.bend };
    for (const k of KEYS) out[k] = p0[k] + (p1[k] - p0[k]) * f;
    return out;
  };
}
// A sharper hit: the pose snaps to `a` on each beat and relaxes towards `b` in between.
function hit(a, b, every = 1) {
  const A = { ...STAND, ...a }, B = { ...STAND, ...b };
  return (t) => {
    const u = (t % every) / every, f = u < 0.35 ? 0 : ease(Math.min(1, (u - 0.35) / 0.5));
    const out = { bend: f < 0.5 ? A.bend : B.bend };
    for (const k of KEYS) out[k] = A[k] + (B[k] - A[k]) * f;
    return out;
  };
}
const bounce = (t, d = 6) => Math.abs(Math.sin(t * PI)) * -d; // a small bob on every beat

export const MOVES = {
  point: {
    name: 'Disco point', len: 2, tap: 'up', key: 0,
    pose: frames([[0, { la: 2.6, ra: -0.35, lean: -0.08, x: 8, rl: -0.2 }], [0.6, { la: 2.5, ra: -0.3, lean: -0.08, x: 8, rl: -0.2 }], [1, { la: -0.5, ra: -0.2, lean: 0.08, x: -8, ll: 0.2 }], [1.6, { la: -0.45, ra: -0.2, lean: 0.08, x: -8, ll: 0.2 }]], 2),
    sig: { energy: 'mid', vert: 0.65, hits: [0, 1] },
  },
  punch: {
    name: 'Punch up', len: 2, tap: 'up', key: 0,
    pose: hit({ la: 3.05, ra: -0.5, drop: -6, ll: 0.12, rl: -0.12 }, { la: 0.9, ra: -0.6, drop: 4, bend: 1 }),
    sig: { energy: 'high', vert: 0.8, hits: [0, 1] },
  },
  wave: {
    name: 'Wave', len: 2, tap: 'right', key: 0,
    pose: (t) => ({ ...STAND, la: 2.55 + Math.sin(t * PI * 2) * 0.4, ra: -0.25, lean: Math.sin(t * PI) * 0.05, x: Math.sin(t * PI) * 6, drop: bounce(t, 4) }),
    sig: { energy: 'mid', vert: 0.25, hits: [0, 0.5, 1, 1.5], spin: true },
  },
  swing: {
    name: 'Side swing', len: 4, tap: 'left', key: 0,
    pose: frames([[0, { la: 1.35, ra: -0.25, x: 16, lean: -0.1, ll: 0.2 }], [1, { la: -0.35, ra: -1.35, x: -16, lean: 0.1, rl: -0.2 }]], 2),
    sig: { energy: 'mid', vert: 0.2, hits: [0, 1, 2, 3] },
  },
  shake: {
    name: 'Shake it', len: 2, tap: 'hold', key: 0.1,
    pose: (t) => { const j = Math.sin(t * PI * 8); return { ...STAND, la: 1.45 + j * 0.28, ra: -1.45 + j * 0.28, bend: 1, drop: 10, lean: j * 0.04, x: j * 3 }; },
    sig: { energy: 'high', vert: null, hits: [] },
  },
  clap: {
    name: 'Clap', len: 2, tap: 'tap', key: 0,
    pose: hit({ la: -0.2, ra: 0.2, drop: 2 }, { la: 0.95, ra: -0.95, drop: -2 }),
    sig: { energy: 'mid', vert: 0.3, hits: [0, 1] },
  },
  freeze: {
    name: 'Freeze', len: 2, tap: 'hold', key: 0.5,
    pose: frames([[0, { la: 2.75, ra: -0.5, lean: -0.16, ll: 0.3, x: 4 }], [0.25, { la: 2.8, ra: -0.55, lean: -0.18, ll: 0.32, x: 4 }], [1.9, { la: 2.8, ra: -0.55, lean: -0.18, ll: 0.32, x: 4 }]], 2),
    sig: { energy: 'low', vert: null, hits: [] },
  },
  jump: {
    name: 'Jump', len: 2, tap: 'up', key: 0,
    pose: hit({ la: 2.6, ra: -2.6, ll: 0.3, rl: -0.3, drop: -34 }, { la: 0.6, ra: -0.6, drop: 10, bend: 1 }),
    sig: { energy: 'high', vert: 0.85, hits: [0, 1] },
  },
  circle: {
    name: 'Big circle', len: 2, tap: 'down', key: 0.5,
    pose: (t) => ({ ...STAND, la: -0.5 + PI * (t % 2), ra: -0.3, lean: -Math.sin(PI * (t % 2)) * 0.08, drop: bounce(t, 4) }),
    sig: { energy: 'mid', vert: 0.5, hits: [], spin: true },
  },
  step: {
    name: 'Step touch', len: 2, tap: 'left', key: 0,
    pose: frames([[0, { la: 0.55, ra: -0.15, x: 18, ll: 0.3, rl: -0.04 }], [1, { la: 0.1, ra: -0.55, x: -18, ll: 0.04, rl: -0.3 }]], 2),
    sig: { energy: 'mid', vert: 0.3, hits: [0, 1] },
  },
  push: {
    name: 'Push down', len: 2, tap: 'down', key: 0,
    pose: hit({ la: 0.2, ra: -0.2, drop: 14, bend: 1 }, { la: 1.7, ra: -1.7, drop: -2 }),
    sig: { energy: 'mid', vert: 0.8, hits: [0, 1] },
  },
  roll: {
    name: 'Rolling arms', len: 2, tap: 'down', key: 0.25,
    pose: (t) => { const s = Math.sin(t * PI * 2), c = Math.cos(t * PI * 2); return { ...STAND, la: 1.0 + s * 0.4, ra: -1.0 + c * 0.4, x: s * 5, drop: bounce(t, 5) }; },
    sig: { energy: 'mid', vert: 0.45, hits: [], spin: true },
  },
  disco: {
    name: 'Hip point', len: 4, tap: 'right', key: 0,
    pose: frames([[0, { la: 2.3, ra: -0.6, x: 12, lean: -0.12, ll: 0.22 }], [1, { la: 0.5, ra: -0.6, x: 12, lean: -0.05 }], [2, { la: -0.4, ra: -2.3, x: -12, lean: 0.12, rl: -0.22 }], [3, { la: 0.6, ra: -0.5, x: -12, lean: 0.05 }]], 4),
    sig: { energy: 'mid', vert: 0.5, hits: [0, 1, 2, 3] },
  },
  // Gold moves end each section and are worth three times as much.
  star: {
    name: 'Star jump', len: 2, tap: 'up', key: 0.4, gold: true,
    pose: frames([[0, { la: 2.45, ra: -2.45, ll: 0.45, rl: -0.45, drop: -40 }], [0.5, { la: 2.4, ra: -2.4, ll: 0.4, rl: -0.4, drop: 0 }], [1.95, { la: 2.4, ra: -2.4, ll: 0.4, rl: -0.4, drop: 0 }]], 2),
    sig: { energy: 'mid', vert: 0.75, hits: [0] },
  },
  lasso: {
    name: 'Lasso', len: 2, tap: 'hold', key: 0.3, gold: true,
    pose: (t) => ({ ...STAND, la: 2.85 + Math.sin(t * PI * 2) * 0.35, ra: -0.6, x: Math.sin(t * PI) * 10, lean: -0.1, ll: 0.2, drop: bounce(t, 8) }),
    sig: { energy: 'mid', vert: 0.35, hits: [], spin: true },
  },
  pose: {
    name: 'Final pose', len: 2, tap: 'hold', key: 0.6, gold: true,
    pose: frames([[0, { la: 3.0, ra: -1.2, lean: -0.2, ll: 0.35, rl: -0.05, x: 6, drop: -10 }], [0.4, { la: 3.0, ra: -1.25, lean: -0.22, ll: 0.38, x: 6 }], [1.95, { la: 3.0, ra: -1.25, lean: -0.22, ll: 0.38, x: 6 }]], 2),
    sig: { energy: 'low', vert: null, hits: [] },
  },
};

// The coach between moves (intro and outro): a relaxed bob on the beat.
export const idlePose = (t) => ({ ...STAND, la: 0.35 + Math.sin(t * PI) * 0.12, ra: -0.35 - Math.sin(t * PI) * 0.12, drop: bounce(t, 5), x: Math.sin(t * PI / 2) * 4 });

// Moves by how early they appear: songs pick from the pools up to their level.
export const POOLS = [
  ['point', 'punch', 'swing', 'step', 'clap', 'jump'],
  ['wave', 'push'],
  ['circle', 'disco'],
  ['roll', 'freeze'],
  ['shake'],
];
export const GOLD = ['star', 'lasso'];
