// Jump Mates drawing: the camera, the painted background, tiles, bodies, the two players and particles.
// Everything in the level is drawn in tile units (the canvas is scaled so 1 = one tile), so games can draw
// their own pieces the same way. view.px is the size of one screen pixel in tiles (for line widths).
import { clamp } from './engine.js';

export const COLOURS = ['#ff8a3d', '#3c9cff'];
export const DARK = ['#c4561a', '#1f63b8'];
export const NAMES = ['Pip', 'Bo'];

export const DEFAULT_THEME = {
  sky: ['#8fd3ff', '#dff4ff'], ground: '#8a5a3b', top: '#5fc35a', edge: '#5e3b25', brick: '#c96a4a', ledge: '#b88452',
  hills: ['#a6dca0', '#7cc47a'], deco: 'hills', water: '#3e9ce0', night: false,
};

// ---------- Camera ----------
// Frames both players. A level small enough to fit is shown whole; bigger levels follow the pair, zooming out
// as they spread apart. world.sepX and sepY (in tiles) keep them on screen together.
export class Cam {
  constructor() { this.x = 0; this.y = 0; this.s = 32; this.W = 0; this.H = 0; this.ready = false; }
  resize(W, H, world) {
    this.W = W; this.H = H;
    this.sMin = clamp(Math.min(W, H) / 16, 17, 34);
    this.sMax = this.sMin * 1.5;
    if (world) { world.sepX = W / this.sMin - 2.5; world.sepY = H / this.sMin - 1.5; }
    this.ready = false;
  }
  update(world, dt) {
    const G = world.game, alive = world.players.filter((p) => !p.dead);
    const ps = alive.length ? alive : world.players;
    let fx = 0, fy = 0;
    ps.forEach((p) => { fx += p.x + p.w / 2; fy += p.y + p.h / 2; });
    fx /= ps.length; fy /= ps.length;
    const spanX = ps.length > 1 ? Math.abs(ps[0].x - ps[1].x) : 0, spanY = ps.length > 1 ? Math.abs(ps[0].y - ps[1].y) : 0;
    const fit = Math.min(this.W / world.W, this.H / (world.H + 0.5));
    let s, target;
    if (fit >= this.sMin * 0.9 && !G.follow) { s = Math.min(fit, this.sMax * 1.3); target = null; }
    else { s = clamp(Math.min(this.W / (spanX + 6), this.H / (spanY + 5)), this.sMin, this.sMax); target = [fx, fy]; }
    const custom = G.camera?.(world, this, dt);
    if (custom) { if (custom.s) s = custom.s; if (custom.x !== undefined) target = [custom.x, custom.y]; }
    const k = this.ready ? 1 - Math.exp(-dt * 4) : 1;
    this.s += (s - this.s) * k;
    const vw = this.W / this.s, vh = this.H / this.s;
    let tx, ty;
    if (!target) { tx = (world.W - vw) / 2; ty = (world.H - vh) / 2 + 0.25; }
    else {
      tx = target[0] - vw / 2; ty = target[1] - vh * 0.55;
      tx = world.W <= vw ? (world.W - vw) / 2 : clamp(tx, 0, world.W - vw);
      const top = G.camTop ?? -4;
      ty = world.H <= vh ? (world.H - vh) / 2 : clamp(ty, top, world.H - vh + 0.6);
    }
    const kk = this.ready ? 1 - Math.exp(-dt * 6) : 1;
    this.x += (tx - this.x) * kk; this.y += (ty - this.y) * kk;
    this.ready = true;
  }
  get vw() { return this.W / this.s; }
  get vh() { return this.H / this.s; }
}

// ---------- Particles ----------
export class Parts {
  constructor() { this.list = []; this.texts = []; }
  burst(x, y, colour, n = 10, speed = 4, size = 0.12, up = 0) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8); this.list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, life: 0.5 + Math.random() * 0.4, t: 0, colour, size: size * (0.6 + Math.random() * 0.8), g: 10 }); }
  }
  puff(x, y, n = 6) { for (let i = 0; i < n; i++) this.list.push({ x: x + (Math.random() - 0.5) * 0.5, y, vx: (Math.random() - 0.5) * 2.5, vy: -Math.random() * 1.2, life: 0.4 + Math.random() * 0.2, t: 0, colour: 'rgba(255,255,255,.85)', size: 0.16 + Math.random() * 0.12, g: -1, grow: true }); }
  text(x, y, s, colour = '#fff') { this.texts.push({ x, y, s, colour, t: 0 }); }
  update(dt) {
    for (const p of this.list) { p.t += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.list = this.list.filter((p) => p.t < p.life);
    for (const q of this.texts) q.t += dt;
    this.texts = this.texts.filter((q) => q.t < 0.9);
  }
  draw(g) {
    for (const p of this.list) {
      const k = 1 - p.t / p.life;
      g.globalAlpha = Math.min(1, k * 1.5); g.fillStyle = p.colour;
      g.beginPath(); g.arc(p.x, p.y, p.size * (p.grow ? 1 + p.t * 3 : k), 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    for (const q of this.texts) {
      g.globalAlpha = 1 - q.t / 0.9; g.font = '900 0.55px system-ui, sans-serif'; g.textAlign = 'center';
      g.lineWidth = 0.12; g.strokeStyle = 'rgba(0,0,0,.45)'; g.strokeText(q.s, q.x, q.y - q.t * 1.2); g.fillStyle = q.colour; g.fillText(q.s, q.x, q.y - q.t * 1.2);
    }
    g.globalAlpha = 1;
  }
}

// What the renderer does with the engine's events (sounds are handled by the hub).
export function eventFx(parts, e, world) {
  const col = e.p >= 0 ? COLOURS[e.p] : '#fff';
  switch (e.k) {
    case 'coin': parts.burst(e.x, e.y, '#ffd23f', 8, 3, 0.09); break;
    case 'gem': parts.burst(e.x, e.y, '#7ff0ff', 14, 4, 0.11); parts.text(e.x, e.y - 0.4, 'Gem!', '#bff8ff'); break;
    case 'die': parts.burst(e.x, e.y, col, 18, 6, 0.16, 2); break;
    case 'spawn': case 'warp': parts.puff(e.x, e.y + 0.3, 8); break;
    case 'land': parts.puff(e.x, e.y, 4); break;
    case 'stomp': parts.burst(e.x, e.y, '#8a4fd8', 10, 4, 0.12); parts.puff(e.x, e.y, 5); break;
    case 'unlock': parts.burst(e.x, e.y, '#ffd23f', 16, 5, 0.12); break;
    case 'flag': parts.burst(e.x, e.y - 0.3, '#5fe07a', 12, 4, 0.1); parts.text(e.x, e.y - 0.8, 'Checkpoint', '#e6ffe9'); break;
    case 'key': parts.burst(e.x, e.y, '#ffd23f', 8, 3, 0.09); break;
    case 'win': world.players.forEach((p) => parts.burst(p.x + p.w / 2, p.y, COLOURS[p.id], 16, 5, 0.12, 2)); break;
    default: break;
  }
}

// ---------- Background ----------
function hash(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

export function drawSky(g, cam, th, t) {
  const gr = g.createLinearGradient(0, 0, 0, cam.H);
  gr.addColorStop(0, th.sky[0]); gr.addColorStop(1, th.sky[1]);
  g.fillStyle = gr; g.fillRect(0, 0, cam.W, cam.H);
  const deco = th.deco;
  if (deco === 'stars' || th.night) {
    g.fillStyle = 'rgba(255,255,255,.8)';
    for (let i = 0; i < 70; i++) { const x = ((hash(i, 1) * 3000 - cam.x * cam.s * 0.05) % cam.W + cam.W) % cam.W, y = hash(i, 2) * cam.H * 0.7; const tw = 0.5 + 0.5 * Math.sin(t * 2 + i); g.globalAlpha = 0.3 + tw * 0.6; g.fillRect(x, y, 2, 2); }
    g.globalAlpha = 1;
  }
  if (deco === 'hills' || deco === 'clouds') {
    // clouds
    g.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = 0; i < 6; i++) {
      const span = cam.W + 300, x = ((hash(i, 7) * span - cam.x * cam.s * 0.08 + t * 6) % span + span) % span - 150, y = 20 + hash(i, 8) * cam.H * 0.3, s = 30 + hash(i, 9) * 30;
      g.beginPath(); g.arc(x, y, s * 0.6, 0, 7); g.arc(x + s * 0.6, y - s * 0.2, s * 0.7, 0, 7); g.arc(x + s * 1.3, y, s * 0.55, 0, 7); g.fill();
    }
  }
  if (th.hills && deco !== 'cave') {
    th.hills.forEach((col, k) => {
      const par = 0.12 + k * 0.12, base = cam.H * (0.62 + k * 0.1) - (cam.y * cam.s * par * 0.4);
      g.fillStyle = col; g.beginPath(); g.moveTo(0, cam.H);
      for (let x = 0; x <= cam.W + 20; x += 20) {
        const wx = x + cam.x * cam.s * par, n = Math.sin(wx * 0.006 + k * 2) * 0.6 + Math.sin(wx * 0.013 + k) * 0.4;
        g.lineTo(x, base - n * cam.H * 0.08);
      }
      g.lineTo(cam.W, cam.H); g.fill();
    });
  }
  if (deco === 'cave') {
    g.fillStyle = 'rgba(0,0,0,.18)';
    for (let i = 0; i < 14; i++) { const x = ((hash(i, 3) * 2000 - cam.x * cam.s * 0.2) % (cam.W + 100) + cam.W + 100) % (cam.W + 100) - 50; g.beginPath(); g.moveTo(x - 20, 0); g.lineTo(x, 40 + hash(i, 4) * 70); g.lineTo(x + 20, 0); g.fill(); }
  }
}

// ---------- Tiles ----------
const isGround = (w, c, r) => { const t = w.tile(c, r); return !!t && (t.kind === 'ground'); };

export function drawTiles(g, w, cam, th, t) {
  const c0 = Math.max(0, Math.floor(cam.x) - 1), c1 = Math.min(w.W, Math.ceil(cam.x + cam.vw) + 1);
  const r0 = Math.max(0, Math.floor(cam.y) - 1), r1 = Math.min(w.H, Math.ceil(cam.y + cam.vh) + 1);
  const px = 1 / cam.s;
  // ground in one go: fill, then grass tops, then edge lines
  g.fillStyle = th.ground; g.beginPath();
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) if (isGround(w, c, r)) g.rect(c - px, r - px, 1 + px * 2, 1 + px * 2);
  // ground on the bottom row carries on down past the edge of the level
  if (r1 >= w.H) for (let c = c0; c < c1; c++) if (isGround(w, c, w.H - 1)) g.rect(c - px, w.H, 1 + px * 2, 40);
  g.fill();
  g.fillStyle = 'rgba(0,0,0,.08)'; g.beginPath();
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) if (isGround(w, c, r)) { const h = hash(c, r); if (h < 0.5) g.rect(c + 0.2 + h, r + 0.45 + h * 0.4, 0.14, 0.1); if (h > 0.7) g.rect(c + h * 0.6, r + 0.75, 0.1, 0.08); }
  g.fill();
  g.strokeStyle = th.edge; g.lineWidth = Math.max(px * 2, 0.05); g.beginPath();
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
    if (!isGround(w, c, r)) continue;
    if (!isGround(w, c - 1, r) && c > 0) { g.moveTo(c, r); g.lineTo(c, r + 1); }
    if (!isGround(w, c + 1, r) && c < w.W - 1) { g.moveTo(c + 1, r); g.lineTo(c + 1, r + 1); }
    if (!isGround(w, c, r + 1) && r < w.H - 1) { g.moveTo(c, r + 1); g.lineTo(c + 1, r + 1); }
  }
  g.stroke();
  g.fillStyle = th.top; g.beginPath();
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
    if (!isGround(w, c, r) || isGround(w, c, r - 1)) continue;
    g.moveTo(c - px, r - 0.04); g.lineTo(c + 1 + px, r - 0.04); g.lineTo(c + 1 + px, r + 0.2);
    for (let k = 4; k >= 0; k--) g.quadraticCurveTo(c + k * 0.25 + 0.125, r + 0.36, c + k * 0.25, r + 0.2);
    g.closePath();
  }
  g.fill();
  // everything else tile by tile
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
    const ch = w.grid[r][c];
    if (ch === '.' || ch === '#') continue;
    const tl = w.tiles[ch]; if (!tl) continue;
    if (tl.draw) { tl.draw(g, c, r, w, cam, t); continue; }
    drawTile(g, tl.kind, c, r, w, th, t, tl, px);
  }
}

export function drawTile(g, kind, c, r, w, th, t, tl = {}, px = 0.03) {
  switch (kind) {
    case 'brick': {
      g.fillStyle = th.brick; g.fillRect(c, r, 1, 1);
      g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 0.05; g.beginPath();
      g.moveTo(c, r + 0.5); g.lineTo(c + 1, r + 0.5); g.moveTo(c + 0.5, r); g.lineTo(c + 0.5, r + 0.5); g.moveTo(c + 0.25, r + 0.5); g.lineTo(c + 0.25, r + 1); g.moveTo(c + 0.75, r + 0.5); g.lineTo(c + 0.75, r + 1);
      g.stroke(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.strokeRect(c + 0.025, r + 0.025, 0.95, 0.95);
      break;
    }
    case 'crack': {
      g.fillStyle = '#9c8f84'; g.fillRect(c, r, 1, 1);
      g.strokeStyle = 'rgba(40,30,20,.6)'; g.lineWidth = 0.06; g.beginPath(); g.moveTo(c + 0.2, r); g.lineTo(c + 0.45, r + 0.4); g.lineTo(c + 0.3, r + 0.7); g.lineTo(c + 0.55, r + 1); g.moveTo(c + 0.45, r + 0.4); g.lineTo(c + 0.85, r + 0.5); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.3)'; g.strokeRect(c + 0.03, r + 0.03, 0.94, 0.94);
      break;
    }
    case 'ledge': {
      g.fillStyle = th.ledge; roundRect(g, c, r, 1, 0.28, 0.08); g.fill();
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(c, r + 0.2, 1, 0.08);
      g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(c + 0.15, r + 0.28, 0.08, 0.25); g.fillRect(c + 0.77, r + 0.28, 0.08, 0.25);
      break;
    }
    case 'spikes': case 'spikesDown': {
      const down = kind === 'spikesDown';
      g.fillStyle = '#d7dde6'; g.strokeStyle = '#6c7686'; g.lineWidth = 0.04; g.beginPath();
      for (let k = 0; k < 3; k++) { const x = c + 0.06 + k * 0.3; if (down) { g.moveTo(x, r); g.lineTo(x + 0.15, r + 0.55); g.lineTo(x + 0.3, r); } else { g.moveTo(x, r + 1); g.lineTo(x + 0.15, r + 0.45); g.lineTo(x + 0.3, r + 1); } }
      g.fill(); g.stroke();
      break;
    }
    case 'water': case 'lava': case 'goo': {
      const col = kind === 'lava' ? '#ff6a2b' : kind === 'goo' ? '#7ad23a' : th.water;
      const top = w.tiles[w.get(c, r - 1)]?.kind === kind;
      const y0 = top ? r : r + 0.3 + Math.sin(t * 3 + c) * 0.04;
      g.fillStyle = col; g.globalAlpha = 0.85; g.fillRect(c, y0, 1.01, r + 1 - y0); g.globalAlpha = 1;
      if (!top) { g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(c, y0, 1.01, 0.07); }
      if (kind === 'lava' && hash(c, Math.floor(t * 2)) > 0.92) { g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(c + 0.5, y0 + 0.2, 0.08, 0, 7); g.fill(); }
      break;
    }
    case 'exit': case 'exit1': case 'exit2': {
      const col = kind === 'exit1' ? COLOURS[0] : kind === 'exit2' ? COLOURS[1] : '#7a55c9';
      // a block of exit tiles is one door, drawn once from its bottom left tile
      const same = (x, y) => w.tiles[w.get(x, y)]?.kind === kind;
      if (same(c, r + 1) || same(c - 1, r)) break;
      let top = r; while (same(c, top - 1)) top--;
      let wd = 1; while (same(c + wd, r)) wd++;
      const h = Math.max(1.4, r + 1 - top), y = r + 1 - h, mid = c + wd / 2;
      g.fillStyle = 'rgba(0,0,0,.25)'; roundRect(g, c + 0.08, y, wd - 0.16, h, Math.min(0.5, wd / 2 - 0.1)); g.fill();
      g.fillStyle = col; roundRect(g, c + 0.14, y + 0.06, wd - 0.28, h - 0.06, Math.min(0.45, wd / 2 - 0.15)); g.fill();
      g.fillStyle = 'rgba(255,255,255,.25)'; roundRect(g, c + 0.26, y + 0.18, wd - 0.52, h - 0.3, Math.min(0.36, wd / 2 - 0.27)); g.fill();
      if (wd > 1) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(mid - 0.03, y + 0.2, 0.06, h - 0.2); }
      g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(c + wd - 0.32, r + 0.55, 0.06, 0, 7); g.fill();
      if (kind !== 'exit') { g.fillStyle = '#fff'; g.font = '900 0.4px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(kind === 'exit1' ? '1' : '2', mid, y + 0.55); }
      else { g.fillStyle = '#fff'; g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3); g.beginPath(); star(g, mid, y + 0.45, 0.16, 0.07); g.fill(); g.globalAlpha = 1; }
      break;
    }
    case 'coin': {
      const sq = Math.abs(Math.cos(t * 3 + c * 0.7));
      g.fillStyle = '#e8a812'; g.beginPath(); g.ellipse(c + 0.5, r + 0.5, 0.26 * sq + 0.04, 0.28, 0, 0, 7); g.fill();
      g.fillStyle = '#ffd84a'; g.beginPath(); g.ellipse(c + 0.5, r + 0.5, 0.19 * sq + 0.02, 0.21, 0, 0, 7); g.fill();
      break;
    }
    case 'gem': {
      const b = Math.sin(t * 3 + c) * 0.06;
      g.fillStyle = '#4fd8ef'; g.beginPath(); g.moveTo(c + 0.5, r + 0.15 + b); g.lineTo(c + 0.82, r + 0.42 + b); g.lineTo(c + 0.5, r + 0.88 + b); g.lineTo(c + 0.18, r + 0.42 + b); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.moveTo(c + 0.5, r + 0.15 + b); g.lineTo(c + 0.62, r + 0.42 + b); g.lineTo(c + 0.38, r + 0.42 + b); g.closePath(); g.fill();
      break;
    }
    case 'lock': {
      g.fillStyle = '#c99a2e'; g.fillRect(c, r, 1, 1); g.strokeStyle = '#8a6514'; g.lineWidth = 0.06; g.strokeRect(c + 0.03, r + 0.03, 0.94, 0.94);
      g.fillStyle = '#5a3f08'; g.beginPath(); g.arc(c + 0.5, r + 0.42, 0.12, 0, 7); g.fill(); g.fillRect(c + 0.45, r + 0.45, 0.1, 0.28);
      break;
    }
    case 'spring': {
      const since = t - (w.springT[`${c},${r}`] ?? -9), k = since < 0.25 ? Math.sin(since / 0.25 * Math.PI) : 0;
      g.strokeStyle = '#6c7686'; g.lineWidth = 0.07; g.beginPath();
      const top = r + 0.55 - k * 0.35;
      for (let i = 0; i <= 4; i++) { const y = r + 1 - (r + 1 - top) * (i / 4); g.lineTo(c + (i % 2 ? 0.7 : 0.3), y); }
      g.stroke();
      g.fillStyle = '#ff4f6d'; roundRect(g, c + 0.12, top - 0.12, 0.76, 0.16, 0.06); g.fill();
      g.fillStyle = '#6c7686'; g.fillRect(c + 0.15, r + 0.9, 0.7, 0.1);
      break;
    }
    case 'flag': {
      const on = w.flag === `${c},${r}`;
      g.fillStyle = '#6c5a4c'; g.fillRect(c + 0.42, r + 0.05, 0.07, 0.95);
      g.fillStyle = on ? '#4cd964' : '#c9c9c9';
      const wv = Math.sin(t * 5) * 0.05;
      g.beginPath(); g.moveTo(c + 0.49, r + 0.08); g.lineTo(c + 0.95, r + 0.22 + wv); g.lineTo(c + 0.49, r + 0.4); g.fill();
      break;
    }
    case 'plate': {
      const down = w.plateDown?.[`${c},${r}`];
      g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(c + 0.05, r + 0.9, 0.9, 0.1);
      g.fillStyle = plateColour(tl.key); roundRect(g, c + 0.1, r + (down ? 0.86 : 0.76), 0.8, down ? 0.1 : 0.2, 0.05); g.fill();
      break;
    }
    case 'gate': {
      const open = w.open[tl.key], col = plateColour(tl.key);
      if (open) { g.strokeStyle = col; g.globalAlpha = 0.45; g.lineWidth = 0.04; g.setLineDash([0.1, 0.1]); g.strokeRect(c + 0.08, r + 0.08, 0.84, 0.84); g.setLineDash([]); g.globalAlpha = 1; break; }
      g.fillStyle = col; g.fillRect(c, r, 1, 1);
      g.fillStyle = 'rgba(0,0,0,.18)'; for (let k = 0; k < 3; k++) g.fillRect(c + 0.12 + k * 0.3, r, 0.12, 1);
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 0.05; g.strokeRect(c + 0.025, r + 0.025, 0.95, 0.95);
      break;
    }
    case 'lever': {
      const on = w.open[tl.key];
      g.fillStyle = '#6c7686'; roundRect(g, c + 0.2, r + 0.78, 0.6, 0.22, 0.06); g.fill();
      g.save(); g.translate(c + 0.5, r + 0.85); g.rotate(on ? 0.6 : -0.6);
      g.fillStyle = '#4a3b2a'; g.fillRect(-0.04, -0.6, 0.08, 0.6); g.fillStyle = plateColour(tl.key); g.beginPath(); g.arc(0, -0.6, 0.11, 0, 7); g.fill();
      g.restore();
      break;
    }
    default: break;
  }
}
export const plateColour = (k) => ({ u: '#e8b32e', i: '#c95fd8', y: '#4ac0a8', j: '#ef6a5a' }[k] || '#aaa');

export function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
export function star(g, x, y, R, r, n = 5) { for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, d = i % 2 ? r : R; g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); } g.closePath(); }

// ---------- Bodies ----------
export function drawBodies(g, w, t) {
  for (const pl of w.plats) {
    if (!pl.alive) continue;
    g.fillStyle = '#7d8aa0'; roundRect(g, pl.x, pl.y, pl.w, pl.h, 0.12); g.fill();
    g.fillStyle = '#a9b6cc'; roundRect(g, pl.x + 0.05, pl.y + 0.03, pl.w - 0.1, pl.h * 0.45, 0.08); g.fill();
    g.fillStyle = '#ffd23f'; for (let k = 0.5; k < pl.w; k += 1) { g.beginPath(); g.arc(pl.x + k, pl.y + pl.h * 0.7, 0.05, 0, 7); g.fill(); }
  }
  for (const b of w.crates) {
    if (!b.alive) continue;
    const x = b.x, y = b.y, s = b.w;
    g.fillStyle = b.heavy ? '#6f7c8c' : '#c58a4a'; g.fillRect(x, y, s, s);
    g.strokeStyle = b.heavy ? '#3e4955' : '#7a4f22'; g.lineWidth = 0.07; g.strokeRect(x + 0.04, y + 0.04, s - 0.08, s - 0.08);
    g.beginPath(); g.moveTo(x + 0.08, y + 0.08); g.lineTo(x + s - 0.08, y + s - 0.08); g.moveTo(x + s - 0.08, y + 0.08); g.lineTo(x + 0.08, y + s - 0.08); g.stroke();
    if (b.heavy) { g.fillStyle = '#fff'; g.font = '900 0.3px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('2', x + s / 2, y + s / 2 + 0.1); }
  }
  for (const k of w.keys) {
    if (k.used) continue;
    const bob = k.by ? 0 : Math.sin(t * 3) * 0.08;
    drawKey(g, k.x, k.y + bob, 0.5);
  }
  for (const e of w.walkers) {
    if (!e.alive) { if ((e.deadT || 0) < 0.4) { g.globalAlpha = 1 - e.deadT / 0.4; g.fillStyle = '#8a4fd8'; g.beginPath(); g.ellipse(e.x + e.w / 2, e.y + e.h - 0.08, e.w / 2, 0.1, 0, 0, 7); g.fill(); g.globalAlpha = 1; } continue; }
    drawWalker(g, e, t);
  }
}
export function drawKey(g, x, y, s = 0.5) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = '#ffd23f'; g.strokeStyle = '#a77a08'; g.lineWidth = 0.1;
  g.beginPath(); g.arc(-0.35, 0, 0.3, 0, 7); g.fill(); g.stroke();
  g.fillRect(-0.1, -0.08, 0.75, 0.16); g.fillRect(0.4, 0.05, 0.12, 0.22); g.fillRect(0.58, 0.05, 0.1, 0.16);
  g.fillStyle = '#a77a08'; g.beginPath(); g.arc(-0.35, 0, 0.1, 0, 7); g.fill();
  g.restore();
}
export function drawWalker(g, e, t) {
  const x = e.x + e.w / 2, y = e.y + e.h, step = Math.sin(t * 12 + e.x * 3) * 0.05;
  g.fillStyle = '#5d2f9a';
  g.beginPath(); g.ellipse(x - 0.2, y - 0.04 + step, 0.1, 0.05, 0, 0, 7); g.ellipse(x + 0.2, y - 0.04 - step, 0.1, 0.05, 0, 0, 7); g.fill();
  g.fillStyle = e.colour || '#8a4fd8'; g.beginPath(); g.ellipse(x, y - 0.32, 0.4, 0.3, 0, Math.PI, 0); g.lineTo(x + 0.4, y - 0.1); g.lineTo(x - 0.4, y - 0.1); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.ellipse(x - 0.12, y - 0.48, 0.12, 0.06, -0.4, 0, 7); g.fill();
  const ex = x + e.dir * 0.15;
  g.fillStyle = '#fff'; g.beginPath(); g.arc(ex - 0.09, y - 0.3, 0.08, 0, 7); g.arc(ex + 0.09, y - 0.3, 0.08, 0, 7); g.fill();
  g.fillStyle = '#222'; g.beginPath(); g.arc(ex - 0.09 + e.dir * 0.03, y - 0.3, 0.04, 0, 7); g.arc(ex + 0.09 + e.dir * 0.03, y - 0.3, 0.04, 0, 7); g.fill();
  g.strokeStyle = '#222'; g.lineWidth = 0.04; g.beginPath(); g.moveTo(ex - 0.17, y - 0.42); g.lineTo(ex - 0.03, y - 0.38); g.moveTo(ex + 0.17, y - 0.42); g.lineTo(ex + 0.03, y - 0.38); g.stroke();
}

// One of the two players: a round little critter. Pip (1) has a leaf, Bo (2) has an antenna, so they differ
// by shape as well as colour.
export function drawPlayer(g, p, t, o = {}) {
  if (p.dead) return;
  const flick = p.safe > 0 && Math.floor(t * 14) % 2 === 0;
  if (flick) g.globalAlpha = 0.45;
  const run = Math.abs(p.vx) > 0.5 && p.ground ? t * 14 : 0;
  const sq = p.squash > 0 ? p.squash * 0.18 : p.squash < 0 ? p.squash * 0.12 : 0;
  const sx = 1 + sq, sy = 1 - sq;
  const cx = p.x + p.w / 2;
  const flip = p.gdir === -1;
  g.save();
  g.translate(cx, flip ? p.y : p.y + p.h);
  if (flip) g.scale(1, -1);
  g.scale(sx, sy);
  const W = p.w * 1.1, H = p.h * 1.02, col = o.colour || COLOURS[p.id], dark = o.dark || DARK[p.id];
  // feet
  g.fillStyle = dark;
  const f1 = run ? Math.sin(run) * 0.1 : 0;
  g.beginPath(); g.ellipse(-0.17 + f1, -0.05, 0.13, 0.07, 0, 0, 7); g.ellipse(0.17 - f1, -0.05, 0.13, 0.07, 0, 0, 7); g.fill();
  // body
  const bob = run ? Math.abs(Math.sin(run)) * 0.04 : 0;
  g.fillStyle = col; roundRect(g, -W / 2, -H - bob, W, H - 0.06, 0.32); g.fill();
  g.fillStyle = 'rgba(255,255,255,.22)'; roundRect(g, -W / 2 + 0.08, -H - bob + 0.06, W * 0.45, 0.2, 0.1); g.fill();
  // belly
  g.fillStyle = 'rgba(255,255,255,.2)'; g.beginPath(); g.ellipse(0, -0.3 - bob, W * 0.28, 0.17, 0, 0, 7); g.fill();
  // head piece
  if (p.id === 0) {
    g.fillStyle = '#4fbf4a'; g.beginPath(); g.moveTo(0, -H - bob); g.quadraticCurveTo(0.05, -H - 0.3 - bob, 0.3, -H - 0.28 - bob); g.quadraticCurveTo(0.2, -H - 0.06 - bob, 0, -H - bob); g.fill();
    g.strokeStyle = '#2f8a2b'; g.lineWidth = 0.03; g.stroke();
  } else {
    g.strokeStyle = dark; g.lineWidth = 0.05; g.beginPath(); g.moveTo(0, -H - bob); g.quadraticCurveTo(-0.05, -H - 0.18 - bob, -0.12, -H - 0.26 - bob); g.stroke();
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(-0.12, -H - 0.28 - bob, 0.08, 0, 7); g.fill();
  }
  // eyes look the way they are facing (and up when jumping)
  const blink = (Math.floor(t * 0.7 + p.id * 0.37) % 5 === 0 && (t * 0.7 + p.id * 0.37) % 1 < 0.12);
  const lx = p.face * 0.07, ly = (p.vy * p.gdir < -2 ? -0.04 : p.vy * p.gdir > 4 ? 0.03 : 0);
  const ey = -H * 0.62 - bob;
  for (const s of [-1, 1]) {
    const ex = s * 0.13 + p.face * 0.05;
    if (blink) { g.strokeStyle = '#222'; g.lineWidth = 0.04; g.beginPath(); g.moveTo(ex - 0.07, ey); g.lineTo(ex + 0.07, ey); g.stroke(); continue; }
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(ex, ey, 0.1, 0.12, 0, 0, 7); g.fill();
    g.fillStyle = '#222'; g.beginPath(); g.arc(ex + lx, ey + ly, 0.055, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(ex + lx + 0.02, ey + ly - 0.02, 0.018, 0, 7); g.fill();
  }
  // cheeks and mouth
  g.fillStyle = 'rgba(255,90,110,.35)'; g.beginPath(); g.ellipse(-0.24 + p.face * 0.04, ey + 0.14, 0.06, 0.035, 0, 0, 7); g.ellipse(0.24 + p.face * 0.04, ey + 0.14, 0.06, 0.035, 0, 0, 7); g.fill();
  g.strokeStyle = '#3a2418'; g.lineWidth = 0.035; g.beginPath();
  if (p.ground) g.arc(p.face * 0.05, ey + 0.12, 0.06, 0.2, Math.PI - 0.2); else { g.ellipse(p.face * 0.05, ey + 0.16, 0.04, 0.05, 0, 0, 7); }
  g.stroke();
  g.restore();
  g.globalAlpha = 1;
}

// A little marker above each player (1 or 2) so it is always clear who is who, and arrows for anyone off screen.
export function drawTags(g, w, cam) {
  for (const p of w.players) {
    if (p.dead) continue;
    const cx = p.x + p.w / 2, top = p.gdir === -1 ? p.y + p.h + 0.55 : p.y - 0.55;
    const inView = cx > cam.x && cx < cam.x + cam.vw && p.y + p.h > cam.y && p.y < cam.y + cam.vh;
    if (inView) {
      if (p.key) continue;
      g.globalAlpha = 0.85; g.fillStyle = COLOURS[p.id];
      g.beginPath(); g.moveTo(cx - 0.12, top); g.lineTo(cx + 0.12, top); g.lineTo(cx, top + 0.14); g.fill();
      g.globalAlpha = 1;
    } else {
      const x = clamp(cx, cam.x + 0.5, cam.x + cam.vw - 0.5), y = clamp(p.y + p.h / 2, cam.y + 0.5, cam.y + cam.vh - 0.5);
      g.fillStyle = COLOURS[p.id]; g.strokeStyle = '#fff'; g.lineWidth = 0.06;
      g.beginPath(); g.arc(x, y, 0.32, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = '900 0.36px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(p.id + 1), x, y + 0.02); g.textBaseline = 'alphabetic';
    }
  }
}

// ---------- The whole frame ----------
export function render(g, w, cam, parts, t) {
  const th = { ...DEFAULT_THEME, ...(w.game.theme || {}), ...(w.level.theme || {}) };
  drawSky(g, cam, th, t);
  g.save();
  g.scale(cam.s, cam.s);
  g.translate(-cam.x, -cam.y);
  const view = { x: cam.x, y: cam.y, w: cam.vw, h: cam.vh, px: 1 / cam.s, s: cam.s, theme: th };
  w.game.drawBack?.(g, w, view, t);
  drawTiles(g, w, cam, th, t);
  drawBodies(g, w, t);
  w.game.drawMid?.(g, w, view, t);
  for (const p of w.players) { if (w.game.drawPlayer) w.game.drawPlayer(g, p, t, w); else drawPlayer(g, p, t); }
  parts.draw(g);
  w.game.drawFront?.(g, w, view, t);
  drawTags(g, w, cam);
  g.restore();
  w.game.drawScreen?.(g, w, cam, t);
}
