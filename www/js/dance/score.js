// Dance Party scoring. No browser dependencies, so tools/test-dance.mjs can feed it made-up phone movement.
//
// Phone in hand: the motion sensor gives movement (acceleration without gravity, m/s²), the direction of gravity and,
// on most phones, how fast the phone turns. Each move compares what the phone felt with the move's signature
// (moves.js): how hard it moved, how much of it was up and down, whether it peaked on the beats, and whether it turned.
// It does not need to know how the phone is held, so any grip works.
// Tap along: one gesture per move, judged on timing, with the right gesture needed for the top grades.

export const GRADES = [
  { id: 'perfect', name: 'Perfect', min: 0.8, pts: 100, col: '#ffe14d' },
  { id: 'super', name: 'Super', min: 0.62, pts: 75, col: '#7cf29a' },
  { id: 'good', name: 'Good', min: 0.45, pts: 50, col: '#6fd3ff' },
  { id: 'ok', name: 'OK', min: 0.28, pts: 20, col: '#c9b8ff' },
  { id: 'x', name: 'Missed', min: -1, pts: 0, col: '#ff7a8a' },
];
export const gradeOf = (q) => GRADES.find((g) => q >= g.min);
export const movePoints = (grade, gold) => (gold ? (grade.pts >= 50 ? grade.pts * 3 : 0) : grade.pts);

// Score out of 10,000, and the stars it earns.
export const MAX_SCORE = 10000;
export const STAR_AT = [2000, 4000, 6000, 7500, 8800];
export const starsFor = (score) => STAR_AT.filter((s) => score >= s).length;
export function maxPoints(list) { return list.reduce((n, m) => n + (m.gold ? 300 : 100), 0); }

const TARGET = { low: 0.6, mid: 4, high: 8.5 }; // typical movement (RMS, m/s²)
const clamp = (v) => Math.max(0, Math.min(1, v));

// Turns the sensor stream into samples: { t, lx, ly, lz (movement), gx, gy, gz (gravity, unit), rot (rad/s or null) }.
// feed(t, accel or null, accelWithGravity, rotationRate or null), t in song seconds.
export function makeSensor() {
  let g = null, last = null;
  const samples = [];
  return {
    samples,
    feed(t, acc, accG, rr) {
      if (!accG || accG.x == null) return;
      const dt = last == null ? 0.016 : Math.max(0.001, Math.min(0.1, t - last)); last = t;
      if (!g) g = { x: accG.x, y: accG.y, z: accG.z };
      const k = Math.min(1, dt / 0.6); // gravity follows slowly
      g.x += (accG.x - g.x) * k; g.y += (accG.y - g.y) * k; g.z += (accG.z - g.z) * k;
      const gl = Math.hypot(g.x, g.y, g.z) || 1;
      const lin = acc && acc.x != null ? acc : { x: accG.x - g.x, y: accG.y - g.y, z: accG.z - g.z };
      const rot = rr && rr.alpha != null ? Math.hypot(rr.alpha, rr.beta, rr.gamma) * (Math.PI / 180) : null; // degrees a second
      samples.push({ t, lx: lin.x, ly: lin.y, lz: lin.z, gx: g.x / gl, gy: g.y / gl, gz: g.z / gl, rot });
      if (samples.length > 4000) samples.splice(0, 1000);
    },
    // samples between two song times
    between(a, b) { return samples.filter((s) => s.t >= a && s.t <= b); },
    get lastAt() { return last; },
  };
}

// How well a stretch of samples matches a move: 0 to 1. t0 is the move's first beat (song seconds), beat is seconds per beat.
export function judgeMotion(sig, samples, t0, beat) {
  if (samples.length < 4) return 0;
  let e2 = 0, v2 = 0, rot2 = 0, nRot = 0;
  for (const s of samples) {
    const m2 = s.lx * s.lx + s.ly * s.ly + s.lz * s.lz;
    const up = s.lx * s.gx + s.ly * s.gy + s.lz * s.gz;
    e2 += m2; v2 += up * up;
    if (s.rot != null) { rot2 += s.rot * s.rot; nRot++; }
  }
  const E = Math.sqrt(e2 / samples.length);
  if (sig.energy === 'low') return clamp(1 - (E - 1.4) / 3);

  const target = TARGET[sig.energy], r = E / target;
  const energy = r >= 0.7 ? clamp(1 - (r - 2.5) / 2.5) : clamp((r - 0.2) / 0.5);
  const parts = [[energy, 0.5]];
  if (sig.vert != null && e2 > 0) parts.push([clamp(1 - Math.max(0, Math.abs(v2 / e2 - sig.vert) - 0.25) * 2), 0.15]);
  if (sig.hits.length) {
    // movement close to the beats compared with the move as a whole
    let near = 0, nn = 0, all = 0;
    for (const s of samples) {
      const m = Math.hypot(s.lx, s.ly, s.lz), u = (s.t - t0) / beat;
      all += m;
      if (sig.hits.some((h) => Math.abs(u - h) < 0.22)) { near += m; nn++; }
    }
    const ratio = nn && all ? (near / nn) / (all / samples.length) : 1;
    parts.push([clamp((ratio - 0.85) / 0.45), 0.25]);
  }
  if (sig.spin && nRot) parts.push([clamp(Math.sqrt(rot2 / nRot) / 2.2), 0.1]);
  const w = parts.reduce((n, [, k]) => n + k, 0);
  let q = parts.reduce((n, [v, k]) => n + v * k, 0) / w;
  if (r < 0.3) q *= 0.4; // barely moving is a miss, whatever the timing
  return q;
}

// Tap along: how far off the beat (seconds) and whether the gesture was right.
export function judgeTap(dt, right) {
  const a = Math.abs(dt);
  const q = a <= 0.06 ? 1 : a <= 0.11 ? 0.7 : a <= 0.17 ? 0.5 : a <= 0.26 ? 0.3 : 0;
  return right ? q : Math.min(q, 0.3);
}
export const TAP_WINDOW = 0.26;
