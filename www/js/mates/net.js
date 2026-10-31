// Jump Mates on two phones. The host phone runs the world and sends a picture of it (a snapshot) about 30 times a
// second; the guest phone builds the same level from the same seed, shows the host's snapshots and sends its
// buttons back. Snapshots are generic, so every game's own state (w.data, extra bodies, changed tiles) comes along.

// The connection, shared by the lobby and the play screen.
export const net = { role: null, peer: '', inGame: false };
export const isNet = () => net.role === 'host' || net.role === 'guest';

// World fields that never change during play, or that the guest rebuilds itself.
const SKIP = new Set(['W', 'H', 'level', 'game', 'tiles', 'grid', 'rng', 'ev', 'plateCells', 'gateCells']);
// Lists of bodies. A reference to one of these (a player standing on a crate, a key carried by a player)
// is sent as its place in the list, so the guest's copy points at the right thing.
export const LISTS = ['players', 'crates', 'walkers', 'plats', 'keys', 'ents'];
const r3 = (v) => Math.round(v * 1000) / 1000;

function encode(w) {
  const where = new Map();
  for (const L of LISTS) (w[L] || []).forEach((o, i) => { if (o && typeof o === 'object') where.set(o, [L, i]); });
  const stack = new Set();
  const enc = (v, top) => {
    if (typeof v === 'number') return Number.isFinite(v) ? r3(v) : { $n: String(v) };
    if (v === null || typeof v !== 'object') return typeof v === 'function' || v === undefined ? undefined : v;
    if (v instanceof Set || v instanceof Map) return undefined;
    if (!top && where.has(v)) return { $r: where.get(v) };
    if (stack.has(v)) return null; // a loop inside a game's own data
    stack.add(v);
    let out;
    if (Array.isArray(v)) out = v.map((x) => { const e = enc(x); return e === undefined ? null : e; });
    else { out = {}; for (const k in v) { if (k === 'carrying') continue; const e = enc(v[k]); if (e !== undefined) out[k] = e; } }
    stack.delete(v);
    return out;
  };
  const s = {};
  for (const k in w) {
    if (SKIP.has(k) || typeof w[k] === 'function') continue;
    if (LISTS.includes(k)) s[k] = (w[k] || []).map((o) => enc(o, true));
    else { const e = enc(w[k]); if (e !== undefined) s[k] = e; }
  }
  return s;
}

// Host: a snapshot of the world. The tile grid is only sent when it has changed since the last one.
export function snapshot(w, frame, sent) {
  const msg = { t: 's', f: frame, w: encode(w) };
  const g = w.grid.map((r) => r.join('')).join('\n');
  if (g !== sent.grid) { msg.g = g; sent.grid = g; }
  return msg;
}

// Guest: turns a snapshot back into objects (references resolved within the snapshot itself).
export function decode(msg) {
  const REF = '$ref';
  const dec = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if (v.$n !== undefined) return Number(v.$n);
    if (v.$r) return { [REF]: v.$r };
    if (Array.isArray(v)) return v.map(dec);
    const o = {}; for (const k in v) o[k] = dec(v[k]); return o;
  };
  const out = {};
  for (const k in msg.w) out[k] = LISTS.includes(k) ? msg.w[k].map((o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).map(([kk, v]) => [kk, dec(v)])) : o)) : dec(msg.w[k]);
  // swap each placeholder for the real body; bodies themselves are not walked into again
  const fix = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if (v[REF]) { const [L, i] = v[REF]; return out[L]?.[i] ?? null; }
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = fix(v[i]); return v; }
    for (const k in v) v[k] = fix(v[k]);
    return v;
  };
  for (const k in out) {
    if (LISTS.includes(k)) out[k].forEach((o) => { if (o && typeof o === 'object') for (const kk in o) o[kk] = fix(o[kk]); });
    else out[k] = fix(out[k]);
  }
  // where every body was, for smoothing between snapshots
  const pos = {};
  for (const L of LISTS) if (Array.isArray(out[L])) pos[L] = out[L].map((o) => (o && typeof o.x === 'number' ? [o.x, o.y] : null));
  return { f: msg.f, s: out, g: msg.g, pos };
}

// Guest: puts a decoded snapshot into the world, with bodies placed part of the way (k from 0 to 1) to the next one.
export function apply(w, a, b, k) {
  for (const key in a.s) w[key] = a.s[key];
  for (const L of LISTS) {
    const pa = a.pos[L], pb = b && b.pos[L], list = a.s[L];
    if (!pa || !list) continue;
    for (let i = 0; i < list.length; i++) {
      const A = pa[i], B = pb && pb[i];
      if (!A || !list[i]) continue;
      // no smoothing across big jumps (a respawn, a warp, a new body in that slot)
      const ok = B && k > 0 && Math.abs(B[0] - A[0]) < 2 && Math.abs(B[1] - A[1]) < 2;
      list[i].x = ok ? A[0] + (B[0] - A[0]) * k : A[0]; list[i].y = ok ? A[1] + (B[1] - A[1]) * k : A[1];
    }
  }
}
// Guest: a new grid from the host.
export function setGrid(w, g) {
  w.grid = g.split('\n').map((r) => r.split(''));
  w.H = w.grid.length; w.W = Math.max(...w.grid.map((r) => r.length));
  w.rescan();
}
