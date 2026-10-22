// Land Grab drawing, shared by the game screen and Play Together: the field, smooth land, trails and players,
// following one point with the camera. The world can be the real one (solo, or the host in Play Together)
// or the guest's copy built from the host's snapshots; both have the same shape.
import { N, holesOf } from './landgrab-engine.js';
import { cbOn, symbolFor, drawSymbol } from './cb.js';

const ART = 'img/kenney/animals-square/';
// light and dark looks for the field, what lies outside it, and the water and rocks inside some maps
export const FIELD = [
  { field: '#f3f5f9', outside: '#cfd6e1', water: '#8fd0f2', rock: '#9aa1ad', rockLip: '#6f7682', grid: 'rgba(40,60,100,.06)', edge: '#e9483f' },
  { field: '#1f232c', outside: '#14161c', water: '#1d4f6e', rock: '#4a505c', rockLip: '#30353f', grid: 'rgba(255,255,255,.04)', edge: '#ff6b6b' },
];
export const VIEW = 34; // about this many cells across the shorter side of the screen
const dark = () => document.documentElement.dataset.theme === 'dark';

// ---------- Smooth outlines ----------
// Land is kept as cells, but drawn as smooth shapes: trace the outline between cells that are in and cells that
// are out (marching squares), then round it off (Chaikin's corner cutting). Returns a Path2D in cell units.
const MS = [null, [3, 2], [2, 1], [3, 1], [0, 1], [[0, 1], [3, 2]], [0, 2], [0, 3], [0, 3], [0, 2], [[0, 3], [2, 1]], [0, 1], [3, 1], [2, 1], [3, 2], null];
export function outline(isIn, box = { x0: 0, y0: 0, x1: N - 1, y1: N - 1 }) {
  const val = (x, y) => (x >= 0 && y >= 0 && x < N && y < N && isIn(y * N + x) ? 1 : 0);
  const adj = new Map();
  // edge midpoints sit on half cells, so twice their position is a whole number (offset by 4 to stay positive at the edge)
  const key = (x2, y2) => (x2 + 4) * 1024 + (y2 + 4);
  const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (let y = Math.max(-1, box.y0 - 1); y <= Math.min(N - 1, box.y1 + 1); y++) {
    for (let x = Math.max(-1, box.x0 - 1); x <= Math.min(N - 1, box.x1 + 1); x++) {
      const c = val(x, y) * 8 + val(x + 1, y) * 4 + val(x + 1, y + 1) * 2 + val(x, y + 1);
      const m = MS[c];
      if (!m) continue;
      // the four edge midpoints of this square of cell centres: top, right, bottom, left (doubled)
      const mid = [key(2 * x + 2, 2 * y + 1), key(2 * x + 3, 2 * y + 2), key(2 * x + 2, 2 * y + 3), key(2 * x + 1, 2 * y + 2)];
      for (const pair of Array.isArray(m[0]) ? m : [m]) link(mid[pair[0]], mid[pair[1]]);
    }
  }
  const path = new Path2D(), seen = new Set();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    let loop = [], prev = -1, cur = start;
    while (!seen.has(cur)) {
      seen.add(cur); loop.push([((cur >> 10) - 4) / 2, ((cur & 1023) - 4) / 2]);
      const nb = adj.get(cur), next = nb[0] !== prev ? nb[0] : nb[1];
      prev = cur; cur = next;
      if (cur === undefined) break;
    }
    if (loop.length < 3) continue;
    // ease out the staircase the cells leave: each point moves to the average of its neighbours, a few times over
    for (let it = 0; it < 3 && loop.length > 6; it++) {
      const n = loop.length;
      loop = loop.map((_, i) => {
        let sx = 0, sy = 0;
        for (let d = -2; d <= 2; d++) { const p = loop[(i + d + n) % n]; sx += p[0]; sy += p[1]; }
        return [sx / 5, sy / 5];
      });
    }
    for (let it = 0; it < 2; it++) { // round the corners off
      const out = [];
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      loop = out;
    }
    path.moveTo(loop[0][0], loop[0][1]);
    for (let i = 1; i < loop.length; i++) path.lineTo(loop[i][0], loop[i][1]);
    path.closePath();
  }
  return path;
}

// One drawer per screen: it keeps each player's outline and only rebuilds those whose land changed (w.changed).
export function createDrawer() {
  let landPaths = [], field = null;
  const imgs = {};
  const face = (skin) => { if (!imgs[skin]) { const im = new Image(); im.src = `${ART}${skin}.png`; imgs[skin] = im; } return imgs[skin]; };
  return {
    // a new world (or a new map): trace the field's shape and start the land outlines afresh
    reset(w) {
      const holes = holesOf(w.open);
      field = { path: outline((i) => w.open[i] === 1), holes: w.map.hole ? outline((i) => holes[i] === 1) : null };
      landPaths = w.players.map(() => null);
      w.players.forEach((p) => w.changed.add(p.id));
    },
    // view: {W, H, dpr}; follow: {x, y} for the camera; parts: little squares flying off when someone is knocked out
    draw(ctx, view, w, follow, parts = []) {
      for (const id of w.changed) { const p = w.players[id - 1]; landPaths[id - 1] = p && p.cells ? outline((i) => w.owner[i] === id, p.box) : null; }
      w.changed.clear();
      const { W: cw, H: ch, dpr } = view;
      const cs = Math.max(12, Math.min(cw, ch) / VIEW); // pixels per cell
      const ox = cw / 2 - follow.x * cs, oy = ch / 2 - follow.y * cs;
      const F = FIELD[dark() ? 1 : 0];
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = F.outside; ctx.fillRect(0, 0, cw, ch);
      // everything else is drawn in cell units
      ctx.setTransform(dpr * cs, 0, 0, dpr * cs, dpr * ox, dpr * oy);
      const px = 1 / cs; // one screen pixel
      ctx.fillStyle = F.field; ctx.fill(field.path, 'evenodd');
      // a faint grid every four cells on the part that is showing
      const c0 = Math.max(0, Math.floor(-ox / cs / 4) * 4), c1 = Math.min(N, (cw - ox) / cs), r0 = Math.max(0, Math.floor(-oy / cs / 4) * 4), r1 = Math.min(N, (ch - oy) / cs);
      ctx.save(); ctx.clip(field.path, 'evenodd');
      ctx.strokeStyle = F.grid; ctx.lineWidth = px; ctx.beginPath();
      for (let x = c0; x <= c1; x += 4) { ctx.moveTo(x, r0); ctx.lineTo(x, r1); }
      for (let y = r0; y <= r1; y += 4) { ctx.moveTo(c0, y); ctx.lineTo(c1, y); }
      ctx.stroke(); ctx.restore();
      // water or rocks inside the field (rocks stand up a little)
      if (field.holes) {
        if (w.map.hole === 'rock') { ctx.save(); ctx.translate(0, 0.3); ctx.fillStyle = F.rockLip; ctx.fill(field.holes, 'evenodd'); ctx.restore(); }
        ctx.fillStyle = F[w.map.hole]; ctx.fill(field.holes, 'evenodd');
      }
      ctx.strokeStyle = F.edge; ctx.lineWidth = Math.max(2 * px, 0.14); ctx.lineJoin = 'round'; ctx.stroke(field.path);
      // land: a darker edge nudged down, then the land on top
      w.players.forEach((p, i) => { const path = landPaths[i]; if (!path) return; ctx.save(); ctx.translate(0, 0.28); ctx.fillStyle = p.colour[1]; ctx.fill(path, 'evenodd'); ctx.restore(); });
      w.players.forEach((p, i) => { const path = landPaths[i]; if (!path) return; ctx.fillStyle = p.colour[0]; ctx.fill(path, 'evenodd'); });
      // colourblind mode: each player's symbol repeats faintly across their land, so whose land is whose does not rest on colour
      if (cbOn()) {
        for (let y = Math.floor(r0); y < r1; y += 3) for (let x = Math.floor(c0) + (y % 2) * 2; x < c1; x += 4) {
          const id = w.owner[y * N + x];
          if (id) drawSymbol(ctx, symbolFor(id - 1), x + 0.5, y + 0.5, 0.45, 'rgba(255,255,255,.7)', null);
        }
      }
      // trails: a soft band from where the player left home to their head
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const p of w.players) {
        if (!p.alive || !p.path.length) continue;
        ctx.strokeStyle = p.colour[0]; ctx.globalAlpha = 0.55; ctx.lineWidth = 0.95;
        ctx.beginPath(); ctx.moveTo(p.path[0][0], p.path[0][1]);
        for (let k = 1; k < p.path.length; k++) ctx.lineTo(p.path[k][0], p.path[k][1]);
        ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // players: their animal on a block of their colour, with their name above
      for (const p of w.players) {
        if (!p.alive) continue;
        const s = 1.7, x = p.x - s / 2, y = p.y - s / 2;
        if ((x + s) * cs + ox < -40 || x * cs + ox > cw + 40 || (y + s) * cs + oy < -40 || y * cs + oy > ch + 40) continue;
        ctx.fillStyle = p.colour[1]; ctx.beginPath(); ctx.roundRect(x, y + 0.22, s, s, 0.32); ctx.fill();
        ctx.fillStyle = p.colour[0]; ctx.beginPath(); ctx.roundRect(x, y, s, s, 0.32); ctx.fill();
        const im = face(p.skin);
        if (im.complete && im.naturalWidth) { const iw = s * 0.86, ih = iw * (im.naturalHeight / im.naturalWidth); ctx.drawImage(im, p.x - iw / 2, p.y - ih / 2 + 0.03, iw, ih); }
        ctx.font = `700 ${Math.max(11, cs * 0.55) / cs}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.lineWidth = 3 * px; ctx.strokeStyle = 'rgba(20,24,36,.65)'; ctx.strokeText(p.name, p.x, y - 0.15);
        ctx.fillStyle = '#fff'; ctx.fillText(p.name, p.x, y - 0.15);
      }
      for (const b of parts) { ctx.globalAlpha = Math.max(0, b.life / 0.7); ctx.fillStyle = b.c; ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2); }
      ctx.globalAlpha = 1;
    },
  };
}
