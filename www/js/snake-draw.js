// Slither Snacks drawing, shared by the game screen and Play Together. Draws a world (or the guest's copy of one)
// on a canvas, following one snake with the camera. Snacks are Kenney's Particle Pack glow, tinted per colour;
// faces are Kenney's Shape Characters (both CC0).
import { R, radiusOf } from './snake-engine.js';

export const SNACK_TINTS = ['#ff4f6d', '#ffb11f', '#ffe84a', '#5ef07a', '#36e0d2', '#4aa8ff', '#9d7bff', '#ff6be0', '#ffffff'];
// skins: body stripe colours, and a face
export const SKINS = [
  { id: 'berry', name: 'Berry', cols: ['#ff5d8f', '#ffc1d6'], face: 'face_a' }, { id: 'ocean', name: 'Ocean', cols: ['#2fa8f0', '#bde8ff'], face: 'face_c' },
  { id: 'mango', name: 'Mango', cols: ['#ffb526', '#ff7a3d'], face: 'face_f' }, { id: 'lime', name: 'Lime', cols: ['#55d36a', '#d9ff8a'], face: 'face_e' },
  { id: 'grape', name: 'Grape', cols: ['#8e62f0', '#d2c2ff'], face: 'face_g' }, { id: 'tiger', name: 'Tiger', cols: ['#ff8a1f', '#2b2b2b'], face: 'face_k' },
  { id: 'mint', name: 'Mint', cols: ['#21c4b5', '#e6fffb'], face: 'face_b' }, { id: 'sunny', name: 'Sunny', cols: ['#ffe14a', '#ff9f1c', '#ffe14a'], face: 'face_d' },
  { id: 'cherry', name: 'Cherry', cols: ['#e9483f', '#ffffff'], face: 'face_h' }, { id: 'night', name: 'Night', cols: ['#3c4a8f', '#7b8cff', '#f0f3ff'], face: 'face_i' },
  { id: 'candy', name: 'Candy', cols: ['#ff6be0', '#6bd6ff', '#fff36b'], face: 'face_j' }, { id: 'rainbow', name: 'Rainbow', cols: ['#ff4f6d', '#ffb11f', '#ffe84a', '#5ef07a', '#4aa8ff', '#9d7bff'], face: 'face_l' },
];
export const skinById = (id) => SKINS.find((s) => s.id === id) || SKINS[0];

const IMG = {};
function img(n) { if (!IMG[n] && typeof Image !== 'undefined') { const i = new Image(); i.src = `img/snake/${n}.png`; IMG[n] = i; } return IMG[n]; }
const ready = (i) => i && i.complete && i.naturalWidth > 0;
export function preload() { img('glow'); SKINS.forEach((s) => img(s.face)); }

// the glow sprite tinted to one colour, made once per colour
const tinted = new Map();
function glowFor(col) {
  if (tinted.has(col)) return tinted.get(col);
  const g = img('glow');
  if (!ready(g)) return null;
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const x = c.getContext('2d');
  x.drawImage(g, 0, 0, 96, 96);
  x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, 96, 96);
  tinted.set(col, c);
  return c;
}

// view: {W, H, dpr}; world: {snakes, food (array or Map)}; follow: the snake to centre on (or a point {x, y})
// opts: {skinOf(snake), nameOf(snake), time, me (snake id)}
export function drawWorld(g, view, world, follow, opts = {}) {
  const { W, H, dpr } = view, t = opts.time || 0;
  const fr = follow && follow.pts && follow.pts.length ? radiusOf(follow.mass || 12) : 0.6;
  const scale = Math.min(W, H) / (24 + fr * 16); // zoom out a little as you grow
  const head = follow && follow.pts && follow.pts.length ? follow.pts[0] : follow || { x: 0, y: 0 };
  const cx = head.x, cy = head.y;
  const x0 = cx - W / 2 / scale, x1 = cx + W / 2 / scale, y0 = cy - H / 2 / scale, y1 = cy + H / 2 / scale;
  const vis = (x, y, m = 2) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;

  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#2a0f1c'; g.fillRect(0, 0, W, H); // beyond the edge
  g.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (W / 2 - cx * scale), dpr * (H / 2 - cy * scale));
  const px = 1 / scale;
  // the arena floor with a soft hexagon pattern
  g.save();
  g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#121a33'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  const hs = 2.2, hw = hs * Math.sqrt(3);
  g.strokeStyle = 'rgba(120,150,255,.07)'; g.lineWidth = 2 * px; g.beginPath();
  for (let row = Math.floor(y0 / (hs * 1.5)) - 1; row <= y1 / (hs * 1.5) + 1; row++) {
    const yy = row * hs * 1.5, off = (row & 1) * hw / 2;
    for (let col = Math.floor((x0 - off) / hw) - 1; col <= (x1 - off) / hw + 1; col++) {
      const xx = col * hw + off;
      for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3, b = a + Math.PI / 3; g.moveTo(xx + Math.cos(a) * hs, yy + Math.sin(a) * hs); g.lineTo(xx + Math.cos(b) * hs, yy + Math.sin(b) * hs); }
    }
  }
  g.stroke();
  g.restore();
  // the edge
  g.strokeStyle = '#ff4f6d'; g.lineWidth = 0.35; g.shadowColor = '#ff4f6d'; g.shadowBlur = 12;
  g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke(); g.shadowBlur = 0;

  // snacks: a tinted glow with a bright core, gently pulsing
  g.globalCompositeOperation = 'lighter';
  const foods = world.food instanceof Map ? world.food.values() : world.food;
  for (const f of foods) {
    if (!vis(f.x, f.y)) continue;
    const col = SNACK_TINTS[f.c % SNACK_TINTS.length], r = 0.2 + Math.sqrt(f.v) * 0.11, pulse = 1 + Math.sin(t * 3 + f.id) * 0.12;
    const gl = glowFor(col);
    if (gl) { const s = r * 5 * pulse; g.globalAlpha = 0.5; g.drawImage(gl, f.x - s / 2, f.y - s / 2, s, s); }
    g.globalAlpha = 1; g.fillStyle = col; g.beginPath(); g.arc(f.x, f.y, r, 0, Math.PI * 2); g.fill();
  }
  g.globalCompositeOperation = 'source-over';

  // snakes, smallest first so big ones sit on top
  const list = world.snakes.filter((s) => s.alive && s.pts && s.pts.length).sort((a, b) => a.mass - b.mass);
  for (const s of list) {
    const skin = opts.skinOf ? opts.skinOf(s) : SKINS[0], r = radiusOf(s.mass), pts = s.pts;
    if (!pts.some((p) => vis(p.x, p.y, r + 1))) continue;
    // boost glow under the body
    if (s.boost) {
      const gl = glowFor(skin.cols[0]);
      if (gl) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5; for (let k = 0; k < pts.length; k += 3) { const p = pts[k], z = r * 4.2; g.drawImage(gl, p.x - z / 2, p.y - z / 2, z, z); } g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    }
    // a darker outline, then the stripes on top, tail first
    g.fillStyle = 'rgba(0,0,0,.35)';
    for (let k = pts.length - 1; k >= 0; k--) { const p = pts[k]; if (!vis(p.x, p.y, r + 1)) continue; g.beginPath(); g.arc(p.x, p.y + r * 0.12, r * 1.08, 0, Math.PI * 2); g.fill(); }
    for (let k = pts.length - 1; k >= 0; k--) {
      const p = pts[k]; if (!vis(p.x, p.y, r + 1)) continue;
      g.fillStyle = skin.cols[Math.floor(k / 4) % skin.cols.length];
      g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill();
    }
    // a soft highlight down the back, for a rounded look
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = r * 0.5; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(p.x - r * 0.25, p.y - r * 0.3) : g.moveTo(p.x - r * 0.25, p.y - r * 0.3))); g.stroke();
    // head: a slightly bigger circle with a face looking where it is going
    const h = pts[0], hr = r * 1.18;
    g.fillStyle = skin.cols[0]; g.beginPath(); g.arc(h.x, h.y, hr, 0, Math.PI * 2); g.fill();
    const face = img(skin.face);
    if (ready(face)) {
      g.save(); g.translate(h.x, h.y); g.rotate(s.ang + Math.PI / 2);
      const fw = hr * 1.6, fh = fw * (face.naturalHeight / face.naturalWidth);
      g.drawImage(face, -fw / 2, -fh / 2 - hr * 0.15, fw, fh); g.restore();
    }
  }
  // names over heads, upright
  g.font = `700 ${Math.max(11, scale * 0.5) / scale}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'bottom';
  for (const s of list) {
    const h = s.pts[0], r = radiusOf(s.mass), name = opts.nameOf ? opts.nameOf(s) : '';
    if (!name || !vis(h.x, h.y)) continue;
    g.lineWidth = 3 * px; g.strokeStyle = 'rgba(10,14,30,.75)'; g.strokeText(name, h.x, h.y - r * 1.5);
    g.fillStyle = s.id === opts.me ? '#fff36b' : '#fff'; g.fillText(name, h.x, h.y - r * 1.5);
  }

  // minimap in the corner
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const mr = 34, mx = 14 + mr, my = H - 14 - mr, k = mr / R;
  g.fillStyle = 'rgba(10,14,30,.6)'; g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,79,109,.7)'; g.lineWidth = 1.5; g.stroke();
  for (const s of list) {
    const p = s.pts[0], mine = s.id === opts.me;
    g.fillStyle = mine ? '#fff36b' : 'rgba(255,255,255,.55)';
    g.beginPath(); g.arc(mx + p.x * k, my + p.y * k, mine ? 3.2 : Math.min(3, 1.2 + radiusOf(s.mass)), 0, Math.PI * 2); g.fill();
  }
}
