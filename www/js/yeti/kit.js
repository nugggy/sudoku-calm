// Yeti Games engine: sprites, camera, painted backgrounds, particles, sounds and helpers shared by all 11 games.
// Games work in metres (the yeti is 2.4 m tall, the penguin 1 m) with y pointing UP; the camera turns that into
// screen pixels. Each game is a module exporting { id, name, blurb, how, unit, create(ctx) } (see hub.js).
import { store } from '../store.js';
import { native } from '../native.js';

// ---------- Sprites ----------
// Rendered from 3D models by tools/yeti (see tools/yeti/models.txt for credits). Strips of frames share one crop.
export const SPR = {};
export const IMG = {};
const loading = {};
// Loads a sprite set (img/yeti for the Yeti Games, img/moto for the motorbike games). Names are unique across sets.
export function loadSprites(dir = 'img/yeti') {
  if (!loading[dir]) loading[dir] = (async () => {
    const meta = await (await fetch(`${dir}/sprites.json`)).json();
    await Promise.all(Object.entries(meta).map(([k, m]) => new Promise((ok) => {
      const im = new Image(); im.onload = ok; im.onerror = ok; im.src = `${dir}/${k}.webp`;
      IMG[k] = im; SPR[k] = m;
    })));
  })();
  return loading[dir];
}

// Draws frame `f` of sprite `name` so its ground point (or centre) sits at screen point (x, y).
// `size` is screen pixels per metre. Options: rot (radians, clockwise on screen), flip (mirror), alpha,
// anchor: 'ground' (default, the point under its feet) or 'center', scale (extra multiplier).
export function sprite(g, name, f, x, y, size, o = {}) {
  const m = SPR[name], im = IMG[name];
  if (!m || !im || !im.complete) return;
  const fr = ((Math.floor(f) % m.n) + m.n) % m.n;
  const k = (size / m.px) * (o.scale || 1);
  const ax = o.anchor === 'center' ? m.w / 2 : m.ax, ay = o.anchor === 'center' ? m.h / 2 : m.ay;
  g.save();
  g.translate(x, y);
  if (o.rot) g.rotate(o.rot);
  if (o.flip) g.scale(-1, 1);
  if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
  g.drawImage(im, fr * m.w, 0, m.w, m.h, -ax * k, -ay * k, m.w * k, m.h * k);
  g.restore();
}
// Where a tracked bone is in frame f, in metres relative to the sprite's ground point (y up). Flip mirrors x.
export function bone(name, b, f, flip = false) {
  const m = SPR[name];
  if (!m || !m.track || !m.track[b]) return { x: 0, y: 0 };
  const fr = ((Math.floor(f) % m.n) + m.n) % m.n;
  const [tx, ty] = m.track[b][fr];
  const x = (tx - m.ax) / m.px;
  return { x: flip ? -x : x, y: (m.ay - ty) / m.px };
}
// Size of a sprite in metres.
export const sizeOf = (name) => { const m = SPR[name]; return m ? { w: m.w / m.px, h: m.h / m.px } : { w: 1, h: 1 }; };
export const frames = (name) => (SPR[name] ? SPR[name].n : 1);

// ---------- Camera ----------
// Follows a point in metres. zoom = screen pixels per metre. (fx, fy) is where the focus sits on screen (0..1).
export class Camera {
  constructor(ctx, zoom = 40) { this.ctx = ctx; this.x = 0; this.y = 0; this.zoom = zoom; this.fx = 0.5; this.fy = 0.6; this.shakeT = 0; this.shakeA = 0; this.sx = 0; this.sy = 0; }
  sx_(x) { return (x - this.x) * this.zoom + this.ctx.W * this.fx + this.sx; }
  sy_(y) { return (this.y - y) * this.zoom + this.ctx.H * this.fy + this.sy; }
  toScreen(x, y) { return [this.sx_(x), this.sy_(y)]; }
  toWorld(px, py) { return [(px - this.ctx.W * this.fx - this.sx) / this.zoom + this.x, this.y - (py - this.ctx.H * this.fy - this.sy) / this.zoom]; }
  // Eases towards a target; k is how quickly (per second).
  follow(x, y, dt, k = 6) { const a = 1 - Math.exp(-k * dt); this.x += (x - this.x) * a; this.y += (y - this.y) * a; }
  zoomTo(z, dt, k = 3) { const a = 1 - Math.exp(-k * dt); this.zoom += (z - this.zoom) * a; }
  shake(amount = 8, time = 0.3) { this.shakeA = Math.max(this.shakeA, amount); this.shakeT = Math.max(this.shakeT, time); }
  update(dt) {
    if (this.shakeT > 0) { this.shakeT -= dt; const a = this.shakeA * Math.max(0, this.shakeT) / 0.3; this.sx = (Math.random() - 0.5) * 2 * a; this.sy = (Math.random() - 0.5) * 2 * a; }
    else { this.sx = this.sy = 0; this.shakeA = 0; }
  }
  // left/right edges of the view in metres
  get left() { return this.toWorld(0, 0)[0]; }
  get right() { return this.toWorld(this.ctx.W, 0)[0]; }
  get top() { return this.toWorld(0, 0)[1]; }
  get bottom() { return this.toWorld(0, this.ctx.H)[1]; }
}

// ---------- Painted scenery ----------
export function rng(seed = 1) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Smooth 1D noise, repeatable for a seed.
export function noise1(seed) {
  const r = rng(seed), N = 256, v = Array.from({ length: N }, () => r());
  return (x) => { const i = Math.floor(x), f = x - i, a = v[((i % N) + N) % N], b = v[(((i + 1) % N) + N) % N], t = f * f * (3 - 2 * f); return a + (b - a) * t; };
}
export function sky(g, ctx, stops) {
  const gr = g.createLinearGradient(0, 0, 0, ctx.H);
  stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c));
  g.fillStyle = gr; g.fillRect(0, 0, ctx.W, ctx.H);
}
// A parallax ridge of mountains or hills, measured in screen terms so it looks the same at any zoom.
// y = where the ridge foot sits (fraction of screen height), amp = tallest peak (fraction of screen height),
// width = typical distance between peaks in screen px, par = horizontal parallax (0 = fixed, 1 = moves with the
// world), yPar = vertical parallax. snow = { above: 0..1 of amp, color } paints white caps on the tall parts.
export function ridge(g, cam, { par = 0.3, yPar = par * 0.5, y = 0.7, amp = 0.25, width = 260, seed = 1, color = '#9fb8d6', snow = null, peaks = false }) {
  const n = noise1(seed), W = cam.ctx.W, H = cam.ctx.H;
  const step = 5, scroll = cam.x * cam.zoom * par, lift = cam.y * cam.zoom * yPar;
  const pts = [];
  for (let px = -step; px <= W + step; px += step) {
    const u = (px + scroll) / width;
    let h = n(u) * 0.75 + n(u * 2.3 + 50) * 0.25; // 0..1
    if (peaks) h = Math.pow(h, 1.7) * 1.25;
    pts.push([px, H * y - h * amp * H + lift, h]);
  }
  g.fillStyle = color;
  g.beginPath(); g.moveTo(pts[0][0], H + 10);
  for (const [x, yy] of pts) g.lineTo(x, yy);
  g.lineTo(W + step, H + 10); g.closePath(); g.fill();
  if (snow) {
    const lim = snow.above ?? 0.6;
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (const [x, yy] of pts) g.lineTo(x, yy);
    for (let i = pts.length - 1; i >= 0; i--) { const [x, yy, h] = pts[i]; g.lineTo(x, yy + (h > lim ? (h - lim) * amp * H * 0.9 + 2 : 0)); }
    g.closePath(); g.fillStyle = snow.color || '#fff'; g.fill();
  }
}
// Soft cartoon clouds drifting across, in screen space with a little parallax.
export function clouds(g, ctx, cam, { seed = 3, count = 6, par = 0.08, y0 = 0.08, y1 = 0.4, alpha = 0.9, color = '#fff', t = 0 } = {}) {
  const r = rng(seed), W = ctx.W + 400;
  g.save(); g.globalAlpha = alpha; g.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const s = 0.6 + r() * 0.9, speed = 4 + r() * 8;
    const x = ((r() * W - cam.x * cam.zoom * par + t * speed) % W + W) % W - 200;
    const y = ctx.H * (y0 + r() * (y1 - y0)) + cam.y * cam.zoom * par * 0.3;
    puffCloud(g, x, y, 60 * s);
  }
  g.restore();
}
export function puffCloud(g, x, y, s) {
  g.beginPath();
  g.ellipse(x, y, s, s * 0.42, 0, 0, Math.PI * 2);
  g.ellipse(x - s * 0.55, y + s * 0.08, s * 0.5, s * 0.32, 0, 0, Math.PI * 2);
  g.ellipse(x + s * 0.5, y + s * 0.05, s * 0.55, s * 0.36, 0, 0, Math.PI * 2);
  g.ellipse(x - s * 0.1, y - s * 0.28, s * 0.5, s * 0.42, 0, 0, Math.PI * 2);
  g.fill();
}
// Falling snow in screen space (cheap, purely decorative).
export class Snowfall {
  constructor(n = 70, seed = 9) { const r = rng(seed); this.p = Array.from({ length: n }, () => ({ x: r(), y: r(), s: 1 + r() * 2.4, v: 0.04 + r() * 0.08, w: r() * 6 })); }
  draw(g, ctx, cam, t) {
    g.save(); g.fillStyle = 'rgba(255,255,255,.85)';
    for (const p of this.p) {
      const x = ((p.x * ctx.W - cam.x * cam.zoom * 0.15 + Math.sin(t * 0.8 + p.w) * 12) % ctx.W + ctx.W) % ctx.W;
      const y = ((p.y + t * p.v) % 1) * ctx.H;
      g.beginPath(); g.arc(x, y, p.s, 0, 6.283); g.fill();
    }
    g.restore();
  }
}
// Distance markers along the ground (every `every` metres), drawn as little flags with numbers.
export function distanceMarks(g, cam, groundY, { every = 50, from = 0, color = '#5a7aa6', ink = '#fff' } = {}) {
  const first = Math.max(from, Math.ceil(cam.left / every) * every);
  g.save(); g.font = `800 ${Math.max(11, Math.min(15, cam.zoom * 0.5))}px system-ui, sans-serif`; g.textAlign = 'center';
  for (let d = first; d <= cam.right + every; d += every) {
    const [x, y] = cam.toScreen(d, typeof groundY === 'function' ? groundY(d) : groundY);
    g.fillStyle = color; g.fillRect(x - 1.5, y - 34, 3, 34);
    g.beginPath(); g.moveTo(x + 1.5, y - 34); g.lineTo(x + 30, y - 27); g.lineTo(x + 1.5, y - 20); g.fill();
    g.fillStyle = ink; g.fillText(`${d}`, x + 12, y - 23.5);
  }
  g.restore();
}

// ---------- Particles ----------
export class FX {
  constructor() { this.p = []; this.txt = []; }
  // A burst of round particles at world point (x, y).
  burst(x, y, { n = 12, color = '#fff', speed = 6, up = 3, size = 0.18, life = 0.8, grav = 12, spread = Math.PI * 2, dir = Math.PI / 2 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread, v = speed * (0.4 + Math.random() * 0.8);
      this.p.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + up * Math.random(), s: size * (0.6 + Math.random() * 0.8), life, t: 0, color: Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color, grav });
    }
  }
  snow(x, y, n = 14, speed = 5) { this.burst(x, y, { n, color: ['#ffffff', '#eaf4ff', '#d6e8fb'], speed, up: 3, size: 0.22, life: 0.9 }); }
  splash(x, y, n = 18) { this.burst(x, y, { n, color: ['#ffffff', '#bfe6ff', '#7cc8f2'], speed: 7, up: 6, size: 0.2, life: 1, grav: 14, spread: 1.6 }); }
  dust(x, y, n = 12) { this.burst(x, y, { n, color: ['#e5c79a', '#d9b27c', '#f2dcb8'], speed: 4, up: 2, size: 0.22, life: 0.9, grav: 6 }); }
  stars(x, y, n = 10) { this.burst(x, y, { n, color: ['#ffd447', '#fff3b0', '#ff9f43'], speed: 7, up: 2, size: 0.16, life: 0.7, grav: 4 }); }
  // Floating text in world space ("+50", "Perfect!").
  text(x, y, s, { color = '#fff', size = 22, life = 1.1 } = {}) { this.txt.push({ x, y, s, color, size, life, t: 0 }); }
  update(dt) {
    for (const q of this.p) { q.t += dt; q.vy -= q.grav * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
    this.p = this.p.filter((q) => q.t < q.life);
    for (const q of this.txt) q.t += dt;
    this.txt = this.txt.filter((q) => q.t < q.life);
  }
  draw(g, cam) {
    for (const q of this.p) {
      const [x, y] = cam.toScreen(q.x, q.y);
      g.globalAlpha = Math.max(0, 1 - q.t / q.life); g.fillStyle = q.color;
      g.beginPath(); g.arc(x, y, Math.max(0.5, q.s * cam.zoom), 0, 6.283); g.fill();
    }
    g.globalAlpha = 1;
    g.save(); g.textAlign = 'center'; g.lineJoin = 'round';
    for (const q of this.txt) {
      const [x, y] = cam.toScreen(q.x, q.y + q.t * 1.2);
      const a = Math.min(1, (q.life - q.t) * 3), pop = 1 + Math.max(0, 0.25 - q.t) * 1.6;
      g.globalAlpha = a; g.font = `900 ${q.size * pop}px system-ui, sans-serif`;
      g.strokeStyle = 'rgba(20,30,50,.75)'; g.lineWidth = 5; g.strokeText(q.s, x, y); g.fillStyle = q.color; g.fillText(q.s, x, y);
    }
    g.restore(); g.globalAlpha = 1;
  }
}

// ---------- Sounds (synthesised, no files) ----------
let ac = null;
function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } } if (ac.state === 'suspended') ac.resume(); return ac; }
const on = () => store.settings.sound;
function tone(f, d, { type = 'sine', vol = 0.1, delay = 0, to = null, attack = 0.005 } = {}) {
  const c = audio(); if (!c) return;
  const t = c.currentTime + delay, o = c.createOscillator(), gn = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
  gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + attack); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(gn).connect(c.destination); o.start(t); o.stop(t + d + 0.03);
}
function noise(d, { vol = 0.2, delay = 0, lp = 2000, hp = 100, sweep = null } = {}) {
  const c = audio(); if (!c) return;
  const t = c.currentTime + delay, len = Math.ceil(c.sampleRate * d), buf = c.createBuffer(1, len, c.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const f1 = c.createBiquadFilter(); f1.type = 'lowpass'; f1.frequency.setValueAtTime(lp, t); if (sweep) f1.frequency.exponentialRampToValueAtTime(sweep, t + d);
  const f2 = c.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = hp;
  const gn = c.createGain(); gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(f1).connect(f2).connect(gn).connect(c.destination); src.start(t); src.stop(t + d + 0.02);
}
export const snd = {
  whack(power = 1) { if (!on()) return; noise(0.12, { vol: 0.35 * power + 0.1, lp: 3500 }); tone(180, 0.18, { type: 'triangle', vol: 0.2, to: 70 }); },
  swoosh() { if (on()) noise(0.25, { vol: 0.12, lp: 600, sweep: 3000, hp: 300 }); },
  thud() { if (!on()) return; tone(110, 0.2, { type: 'sine', vol: 0.25, to: 50 }); noise(0.08, { vol: 0.12, lp: 800 }); },
  crunch() { if (on()) noise(0.18, { vol: 0.18, lp: 1600, hp: 400 }); },
  splash() { if (on()) noise(0.5, { vol: 0.25, lp: 2500, sweep: 400, hp: 200 }); },
  boing(p = 1) { if (on()) tone(220 * p, 0.3, { type: 'triangle', vol: 0.14, to: 520 * p }); },
  squawk() { if (!on()) return; tone(900, 0.08, { type: 'sawtooth', vol: 0.05, to: 600 }); tone(1100, 0.1, { type: 'sawtooth', vol: 0.05, to: 700, delay: 0.09 }); },
  pop() { if (on()) tone(600, 0.08, { type: 'sine', vol: 0.12, to: 1200 }); },
  tick() { if (on()) tone(1500, 0.03, { vol: 0.04 }); },
  flap() { if (on()) noise(0.12, { vol: 0.12, lp: 900, hp: 150 }); },
  spit() { if (!on()) return; noise(0.1, { vol: 0.16, lp: 2500, hp: 800 }); tone(300, 0.08, { type: 'square', vol: 0.03, to: 150 }); },
  cheer() { if (!on()) return; for (let i = 0; i < 6; i++) noise(0.5, { vol: 0.05, lp: 3000 - i * 200, hp: 500, delay: i * 0.05 }); [523, 659, 784].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.07, delay: 0.1 + i * 0.08 })); },
  fail() { if (on()) [330, 262, 196].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.08, delay: i * 0.12 })); },
  ding(i = 0) { if (on()) tone(784 * Math.pow(1.06, i), 0.18, { type: 'triangle', vol: 0.08 }); },
  wind(d = 1) { if (on()) noise(d, { vol: 0.06, lp: 500, hp: 100 }); },
};
export function buzz(p = 15) { if (store.settings.vibrate) native.vibrate(p); }

// ---------- Small helpers ----------
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const fmt = (v, unit = '') => `${Math.round(v).toLocaleString('en-AU')}${unit ? ` ${unit}` : ''}`;
export const fmt1 = (v, unit = '') => `${(Math.round(v * 10) / 10).toLocaleString('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ''}`;
// A shaded round "power" meter drawn on the canvas (0..1), used for timing bars.
export function meter(g, x, y, w, h, v, { label = '', sweet = null, color = '#ffd447' } = {}) {
  g.save();
  g.fillStyle = 'rgba(15,25,45,.55)'; roundRect(g, x - 3, y - 3, w + 6, h + 6, (h + 6) / 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,.18)'; roundRect(g, x, y, w, h, h / 2); g.fill();
  if (sweet) { g.fillStyle = 'rgba(80,220,120,.45)'; g.fillRect(x + w * sweet[0], y, w * (sweet[1] - sweet[0]), h); }
  const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, '#59d27a'); gr.addColorStop(0.6, color); gr.addColorStop(1, '#ff5a5f');
  g.fillStyle = gr; roundRect(g, x, y, Math.max(h, w * clamp(v, 0, 1)), h, h / 2); g.fill();
  if (label) { g.font = '800 12px system-ui, sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(label, x + 2, y - 7); }
  g.restore();
}
export function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
// An aiming arrow drawn at screen point (x, y) pointing at angle a (radians, 0 = right, positive = up).
export function arrow(g, x, y, a, len = 70, color = '#ffd447') {
  g.save(); g.translate(x, y); g.rotate(-a);
  g.fillStyle = 'rgba(15,25,45,.35)'; g.fillRect(0, -6, len, 12);
  g.fillStyle = color; g.strokeStyle = 'rgba(15,25,45,.6)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -4); g.lineTo(len - 14, -4); g.lineTo(len - 14, -11); g.lineTo(len, 0); g.lineTo(len - 14, 11); g.lineTo(len - 14, 4); g.lineTo(0, 4); g.closePath(); g.fill(); g.stroke();
  g.restore();
}
