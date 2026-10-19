// Rules for the turn-based Play Together games. No browser dependencies, so tools/test-duo.mjs can check them.

// ---------- Connect Four: 7 columns x 6 rows, b[r * 7 + c], row 0 at the top. 0 empty, 1 player 0, 2 player 1 ----------
export const C4 = { W: 7, H: 6 };
export const c4New = () => new Array(42).fill(0);
export function c4Drop(b, col, p) {
  if (col < 0 || col >= 7) return -1;
  for (let r = 5; r >= 0; r--) if (!b[r * 7 + col]) { b[r * 7 + col] = p + 1; return r; }
  return -1;
}
export const c4CanDrop = (b, col) => col >= 0 && col < 7 && !b[col];
export function c4Win(b) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
    const v = b[r * 7 + c]; if (!v) continue;
    for (const [dr, dc] of dirs) {
      const cells = [r * 7 + c];
      for (let k = 1; k < 4; k++) {
        const rr = r + dr * k, cc = c + dc * k;
        if (rr < 0 || rr >= 6 || cc < 0 || cc >= 7 || b[rr * 7 + cc] !== v) break;
        cells.push(rr * 7 + cc);
      }
      if (cells.length === 4) return { player: v - 1, cells };
    }
  }
  return null;
}
export const c4Full = (b) => b.slice(0, 7).every(Boolean);

// ---------- Noughts and Crosses ----------
export const TTT_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export function tttWin(b) {
  for (const l of TTT_LINES) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return { player: b[l[0]] - 1, cells: l };
  return null;
}
export const tttFull = (b) => b.every(Boolean);

// ---------- Dots and Boxes: n x n boxes. Edge ids: 'h' + r + '_' + c (r 0..n, c 0..n-1), 'v' + r + '_' + c (r 0..n-1, c 0..n) ----------
export function dbNew(n) { return { n, edges: {}, boxes: new Array(n * n).fill(-1), score: [0, 0] }; }
export function dbEdges(n) {
  const out = [];
  for (let r = 0; r <= n; r++) for (let c = 0; c < n; c++) out.push(`h${r}_${c}`);
  for (let r = 0; r < n; r++) for (let c = 0; c <= n; c++) out.push(`v${r}_${c}`);
  return out;
}
const boxEdges = (r, c) => [`h${r}_${c}`, `h${r + 1}_${c}`, `v${r}_${c}`, `v${r}_${c + 1}`];
function edgeBoxes(n, e) {
  const [r, c] = e.slice(1).split('_').map(Number), out = [];
  if (e[0] === 'h') { if (r > 0) out.push([r - 1, c]); if (r < n) out.push([r, c]); }
  else { if (c > 0) out.push([r, c - 1]); if (c < n) out.push([r, c]); }
  return out;
}
// Draws an edge for player p. Returns the list of boxes completed (player goes again when it is not empty), or null if illegal.
export function dbPlay(s, e, p) {
  if (s.edges[e] !== undefined || !dbEdges(s.n).includes(e)) return null;
  s.edges[e] = p;
  const made = [];
  for (const [r, c] of edgeBoxes(s.n, e)) {
    if (boxEdges(r, c).every((x) => s.edges[x] !== undefined)) { s.boxes[r * s.n + c] = p; s.score[p]++; made.push(r * s.n + c); }
  }
  return made;
}
export const dbOver = (s) => s.boxes.every((b) => b >= 0);

// ---------- Reversi: 8 x 8, 0 empty, 1 player 0 (dark), 2 player 1 (light) ----------
const R8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
export function rvNew(first = 0) {
  const b = new Array(64).fill(0);
  // the player who moves first plays dark, which starts on d5 and e4
  const d = first + 1, l = 2 - first;
  b[27] = l; b[36] = l; b[28] = d; b[35] = d;
  return b;
}
export function rvFlips(b, i, p) {
  if (b[i]) return [];
  const me = p + 1, them = 2 - p, r0 = i >> 3, c0 = i & 7, out = [];
  for (const [dr, dc] of R8) {
    const run = [];
    let r = r0 + dr, c = c0 + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === them) { run.push(r * 8 + c); r += dr; c += dc; }
    if (run.length && r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === me) out.push(...run);
  }
  return out;
}
export const rvMoves = (b, p) => b.map((_, i) => i).filter((i) => rvFlips(b, i, p).length);
export function rvPlay(b, i, p) {
  const f = rvFlips(b, i, p);
  if (!f.length) return null;
  b[i] = p + 1; f.forEach((k) => { b[k] = p + 1; });
  return f;
}
export const rvCount = (b) => [b.filter((v) => v === 1).length, b.filter((v) => v === 2).length];
// Who moves after p played: the other player, or p again when the other has no move, or -1 when neither can.
export function rvNext(b, p) {
  if (rvMoves(b, 1 - p).length) return 1 - p;
  if (rvMoves(b, p).length) return p;
  return -1;
}

// ---------- English draughts: 8 x 8, play on dark squares ((r + c) odd).
// 0 empty, 1 man of player 0, 2 king of player 0, 3 man of player 1, 4 king of player 1.
// Player 0 starts on rows 5 to 7 and moves up the board (towards row 0); player 1 starts on rows 0 to 2. ----------
export const drOwner = (v) => (v === 1 || v === 2 ? 0 : v === 3 || v === 4 ? 1 : -1);
export const drKing = (v) => v === 2 || v === 4;
export function drNew() {
  const b = new Array(64).fill(0);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if ((r + c) % 2 === 0) continue;
    if (r < 3) b[r * 8 + c] = 3; else if (r > 4) b[r * 8 + c] = 1;
  }
  return b;
}
const drDirs = (v) => (drKing(v) ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : drOwner(v) === 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]);
const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
// Every capture sequence from square s, as {path: [s, ...landings], caps: [...captured squares]}.
function drJumps(b, s, v, path, caps, out) {
  const r = s >> 3, c = s & 7;
  let any = false;
  for (const [dr, dc] of drDirs(v)) {
    const mr = r + dr, mc = c + dc, tr = r + 2 * dr, tc = c + 2 * dc;
    if (!inB(tr, tc)) continue;
    const mid = mr * 8 + mc, to = tr * 8 + tc;
    if (drOwner(b[mid]) !== 1 - drOwner(v) || caps.includes(mid) || (b[to] && to !== path[0])) continue;
    any = true;
    const p2 = [...path, to], c2 = [...caps, mid];
    // a man that reaches the far row is crowned and its move ends there
    const crowned = !drKing(v) && ((drOwner(v) === 0 && tr === 0) || (drOwner(v) === 1 && tr === 7));
    if (crowned) out.push({ path: p2, caps: c2 });
    else drJumps(b, to, v, p2, c2, out);
  }
  if (!any && caps.length) out.push({ path, caps });
}
// All legal moves for player p. Captures are compulsory, and a capture must be carried on to the end.
export function drMoves(b, p) {
  const caps = [], steps = [];
  for (let s = 0; s < 64; s++) {
    const v = b[s];
    if (drOwner(v) !== p) continue;
    drJumps(b, s, v, [s], [], caps);
    const r = s >> 3, c = s & 7;
    for (const [dr, dc] of drDirs(v)) { const tr = r + dr, tc = c + dc; if (inB(tr, tc) && !b[tr * 8 + tc]) steps.push({ path: [s, tr * 8 + tc], caps: [] }); }
  }
  return caps.length ? caps : steps;
}
// Plays a move. Returns true when the piece was crowned.
export function drPlay(b, mv) {
  const from = mv.path[0], to = mv.path[mv.path.length - 1];
  const v0 = b[from];
  let v = v0;
  b[from] = 0;
  mv.caps.forEach((k) => { b[k] = 0; });
  const r = to >> 3;
  if (v === 1 && r === 0) v = 2;
  if (v === 3 && r === 7) v = 4;
  b[to] = v;
  return v !== v0; // true when the piece was crowned
}
export const drKey = (mv) => mv.path.join('-');
export const drCount = (b) => [b.filter((v) => drOwner(v) === 0).length, b.filter((v) => drOwner(v) === 1).length];

// ---------- Battleships: 10 x 10, cells r * 10 + c. A fleet is [{len, cells: [...]}] ----------
export const FLEET = [5, 4, 3, 3, 2];
export const SHIP_NAMES = { 5: 'carrier', 4: 'battleship', 3: 'cruiser', 2: 'patrol boat' };
export function shipCells(r, c, len, vert) {
  const out = [];
  for (let k = 0; k < len; k++) {
    const rr = r + (vert ? k : 0), cc = c + (vert ? 0 : k);
    if (rr < 0 || rr > 9 || cc < 0 || cc > 9) return null;
    out.push(rr * 10 + cc);
  }
  return out;
}
// Ships may not overlap. They may touch, as in the classic game.
export function fleetValid(ships) {
  const seen = new Set();
  for (const s of ships) for (const k of s.cells) { if (k < 0 || k > 99 || seen.has(k)) return false; seen.add(k); }
  return ships.length === FLEET.length && FLEET.slice().sort().join() === ships.map((s) => s.cells.length).sort().join();
}
export function randomFleet(rng) {
  for (let tries = 0; tries < 500; tries++) {
    const ships = [], used = new Set();
    let ok = true;
    for (const len of FLEET) {
      let placed = false;
      for (let t = 0; t < 200 && !placed; t++) {
        const vert = rng() < 0.5, r = Math.floor(rng() * 10), c = Math.floor(rng() * 10);
        const cells = shipCells(r, c, len, vert);
        if (!cells || cells.some((k) => used.has(k))) continue;
        cells.forEach((k) => used.add(k));
        ships.push({ len, vert, r, c, cells });
        placed = true;
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
  return null;
}
// The defender answers a shot. hits is a Set of cells already hit on this fleet (updated here).
// Returns {r: 'miss' | 'hit' | 'sunk', ship: cells when sunk, over: true when the whole fleet is sunk}.
export function answerShot(ships, hits, i) {
  const ship = ships.find((s) => s.cells.includes(i));
  if (!ship) return { r: 'miss' };
  hits.add(i);
  if (!ship.cells.every((k) => hits.has(k))) return { r: 'hit' };
  const over = ships.every((s) => s.cells.every((k) => hits.has(k)));
  return { r: 'sunk', ship: ship.cells, over };
}
