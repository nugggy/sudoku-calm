// Turtle Bay: shared helpers. The games reuse the Yeti Games engine (camera, particles, sounds) and add
// pic(), which draws one of the Turtle Bay sprites (rendered from 3D models by tools/turtle) by name.
// Every Turtle Bay sprite is rendered one unit long, so `size` is simply the picture's width in pixels.
import { loadSprites, sprite, SPR } from '../yeti/kit.js';

export { FX, Camera, snd, buzz, clamp, lerp, ease, fmt, fmt1, roundRect, rng, puffCloud } from '../yeti/kit.js';
export { SPR };

let ready = null;
// Loads the turtle sprites plus the top-down cars from Moto Mania (River Hop uses them).
export function loadTurtle() {
  if (!ready) ready = Promise.all([loadSprites('img/turtle').catch(() => {}), loadSprites('img/moto').catch(() => {})]);
  return ready;
}

// Draws sprite `name` centred on (x, y), `size` pixels wide. Options as for sprite() (rot, flip, alpha, scale)
// plus filter, a canvas filter string.
export function pic(g, name, x, y, size, o = {}) {
  const m = SPR[name];
  if (!m) { placeholder(g, name, x, y, size, o); return; }
  // sprites are rendered one unit long (px pixels per unit), so this makes the picture `size` px wide
  if (o.filter) { g.save(); g.filter = o.filter; }
  sprite(g, name, o.f || 0, x, y, size, { anchor: 'center', ...o });
  if (o.filter) g.restore();
}
// Stand-in shape for a picture that has not loaded (keeps the games playable offline in a browser).
function placeholder(g, name, x, y, size, o) {
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  g.save(); g.translate(x, y); if (o.rot) g.rotate(o.rot); if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
  g.fillStyle = `hsl(${h % 360} 55% 50%)`; g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
  g.beginPath(); g.ellipse(0, 0, size / 2, size * 0.3, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.restore();
}
// Height of a sprite when drawn `size` px wide (for stacking and hit boxes).
export const picH = (name, size) => { const m = SPR[name]; return m ? (m.h / m.w) * size * (m.w / m.px) : size * 0.6; };
export const picW = (name, size) => { const m = SPR[name]; return m ? (m.w / m.px) * size : size; };

// A soft drop shadow under something on the ground.
export function shadow(g, x, y, w, a = 0.22) {
  g.fillStyle = `rgba(30,40,40,${a})`;
  g.beginPath(); g.ellipse(x, y, w / 2, w / 7, 0, 0, Math.PI * 2); g.fill();
}

// Sand, sea and sky gradients used across the games.
export function fillGrad(g, x0, y0, x1, y1, stops) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c));
  g.fillStyle = gr;
}
export function sandFill(g, W, H, t = 0) {
  fillGrad(g, 0, 0, 0, H, ['#f4dfb0', '#ecd09a', '#e3c287']);
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(160,120,60,.12)';
  for (let i = 0; i < 70; i++) { const x = (i * 97.3) % W, y = (i * 53.7 + t) % H; g.fillRect(x, y, 2, 2); }
}
// Big text in the middle of the canvas (countdowns, level names).
export function banner(g, W, H, text, a = 1, size = 46) {
  g.save(); g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.font = `900 ${size}px system-ui, sans-serif`;
  g.strokeStyle = 'rgba(10,40,50,.7)'; g.lineWidth = 7; g.strokeText(text, W / 2, H / 2);
  g.fillStyle = '#fff'; g.fillText(text, W / 2, H / 2);
  g.restore();
}
// Little hearts drawn on the canvas for lives.
export function hearts(g, x, y, n, of = 3) {
  for (let i = 0; i < of; i++) {
    const cx = x + i * 22;
    g.fillStyle = i < n ? '#ff5a6e' : 'rgba(255,255,255,.35)';
    g.beginPath(); g.moveTo(cx, y + 6);
    g.bezierCurveTo(cx - 10, y - 2, cx - 6, y - 10, cx, y - 4);
    g.bezierCurveTo(cx + 6, y - 10, cx + 10, y - 2, cx, y + 6); g.fill();
  }
}
