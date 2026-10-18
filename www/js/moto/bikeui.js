// Drawing and input shared by Hill Rider and Stunt Park: pedals, terrain, the bike on its physics body,
// the rider tumbling off after a crash, fuel cans and the like. Physics lives in bikephys.js.
import { sprite, roundRect, clamp } from '../yeti/kit.js';
import { drawBike, ride, stat, wheels } from './kit.js';
import { Bike } from './bikephys.js';

// A bike for the chosen garage bike and its stats.
export function makeBike(x, y, gravity = 9.8) {
  const id = ride().bike.id;
  return new Bike(x, y, wheels(id), { speed: stat('speed'), power: stat('power'), grip: stat('grip'), handling: stat('handling') }, { gravity });
}

// Two big pedals: left half brakes (and tips forward in the air), right half accelerates (and tips back).
export function pedalInput() {
  const s = { gas: false, brake: false, active: false };
  const set = (ctx, x) => { s.gas = x >= ctx.W / 2; s.brake = !s.gas; };
  return {
    state: s,
    down(ctx, x) { s.active = true; set(ctx, x); },
    move(ctx, x) { if (s.active) set(ctx, x); },
    up() { s.active = false; s.gas = s.brake = false; },
  };
}
export function drawPedals(g, ctx, s) {
  const w = Math.min(110, ctx.W * 0.28), h = 74, y = ctx.H - h - 14;
  const pedal = (x, on, gas) => {
    g.save();
    g.globalAlpha = on ? 0.95 : 0.6;
    g.fillStyle = 'rgba(30,18,10,.45)'; roundRect(g, x, y + 5, w, h, 18); g.fill();
    const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, gas ? '#7ad86b' : '#ff8a6a'); gr.addColorStop(1, gas ? '#2f9e44' : '#d9442a');
    g.fillStyle = gr; roundRect(g, x, y + (on ? 4 : 0), w, h, 18); g.fill();
    // ridges on the pedal
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 4; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const yy = y + (on ? 4 : 0) + 18 + i * 14; g.beginPath(); g.moveTo(x + 22, yy); g.lineTo(x + w - 22, yy); g.stroke(); }
    g.fillStyle = '#fff'; g.font = '900 13px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText(gas ? 'GAS' : 'BRAKE', x + w / 2, y + (on ? 4 : 0) + h - 10);
    g.restore();
  };
  pedal(14, s.brake, false);
  pedal(ctx.W - w - 14, s.gas, true);
}

// Fills the ground under the terrain line between the screen edges and draws its top edge.
export function drawTerrain(g, cam, T, { fill = ['#7cc35a', '#5a9a3e'], edge = '#4d8a33', edgeW = 0.35, top = null } = {}) {
  const L = cam.left - 2, R = cam.right + 2, H = cam.ctx.H;
  const i0 = Math.max(0, T.find(L) - 1), i1 = Math.min(T.p.length - 1, T.find(R) + 1);
  if (i1 <= i0) return;
  g.beginPath();
  const [sx0] = cam.toScreen(T.p[i0][0], 0);
  g.moveTo(sx0, H + 20);
  for (let i = i0; i <= i1; i++) { const [x, y] = cam.toScreen(T.p[i][0], T.p[i][1]); g.lineTo(x, y); }
  const [sx1] = cam.toScreen(T.p[i1][0], 0);
  g.lineTo(sx1, H + 20); g.closePath();
  const gr = g.createLinearGradient(0, cam.sy_(cam.y + 4), 0, H); gr.addColorStop(0, fill[0]); gr.addColorStop(1, fill[1]);
  g.fillStyle = gr; g.fill();
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = edge; g.lineWidth = Math.max(3, edgeW * cam.zoom);
  g.beginPath();
  for (let i = i0; i <= i1; i++) { const [x, y] = cam.toScreen(T.p[i][0], T.p[i][1]); if (i === i0) g.moveTo(x, y + g.lineWidth / 2); else g.lineTo(x, y + g.lineWidth / 2); }
  g.stroke();
  if (top) { g.strokeStyle = top; g.lineWidth = Math.max(1.5, edgeW * 0.35 * cam.zoom); g.beginPath(); for (let i = i0; i <= i1; i++) { const [x, y] = cam.toScreen(T.p[i][0], T.p[i][1]); if (i === i0) g.moveTo(x, y + 1); else g.lineTo(x, y + 1); } g.stroke(); }
  g.restore();
}

// The bike where its physics body is. A crashed bike is drawn without its rider.
export function drawPhysBike(g, cam, b) {
  const [x, y] = cam.toScreen(b.x, b.y);
  drawBike(g, x, y, cam.zoom, { rot: -b.a, rider: !b.crashed });
  // dust from the rear tyre when it spins on the ground
  return [x, y];
}

// The rider flying off after a crash: a little body with its own gravity and bounces.
export class Tumble {
  constructor(b) {
    const [hx, hy] = b.world(-0.1, 0.8);
    this.x = hx; this.y = hy; this.vx = b.vx * 0.8 + 1; this.vy = Math.max(2, b.vy + 4); this.rot = -b.a; this.vr = 6; this.t = 0;
    this.id = ride().rider.id;
  }
  update(dt, T, g = 9.8) {
    this.t += dt; this.vy -= g * dt; this.x += this.vx * dt; this.y += this.vy * dt; this.rot += this.vr * dt;
    const gy = T.heightAt(this.x) + 0.35;
    if (this.y < gy) { this.y = gy; this.vy = Math.abs(this.vy) * 0.35; this.vx *= 0.7; this.vr *= 0.6; }
  }
  draw(g, cam) {
    const [x, y] = cam.toScreen(this.x, this.y);
    sprite(g, `rider_${this.id}_tumble`, Math.min(5, this.t * 9), x, y, cam.zoom, { anchor: 'center', rot: this.rot * 0.3 });
  }
}

// A red jerry can (fuel), drawn with paths at screen point (x, y), size in px.
export function fuelCan(g, x, y, s, t = 0) {
  g.save(); g.translate(x, y + Math.sin(t * 3) * s * 0.06); g.rotate(-0.12);
  g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(0, s * 0.62, s * 0.4, s * 0.08, 0, 0, 6.283); g.fill();
  g.fillStyle = '#d8342a'; roundRect(g, -s * 0.36, -s * 0.38, s * 0.72, s * 0.96, s * 0.12); g.fill();
  g.fillStyle = '#ff5a45'; roundRect(g, -s * 0.3, -s * 0.32, s * 0.3, s * 0.84, s * 0.08); g.fill();
  g.fillStyle = '#9c1f18'; g.fillRect(-s * 0.1, -s * 0.56, s * 0.2, s * 0.2);
  g.strokeStyle = '#9c1f18'; g.lineWidth = s * 0.08; g.beginPath(); g.moveTo(s * 0.05, -s * 0.38); g.lineTo(s * 0.3, -s * 0.52); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = s * 0.07; g.beginPath(); g.moveTo(-s * 0.2, -s * 0.1); g.lineTo(s * 0.2, s * 0.3); g.moveTo(s * 0.2, -s * 0.1); g.lineTo(-s * 0.2, s * 0.3); g.stroke();
  g.restore();
}
// A fuel gauge (0..1) drawn top-left under the HUD.
export function fuelGauge(g, ctx, f, warn) {
  const x = 12, y = 44, w = Math.min(150, ctx.W * 0.38), h = 14;
  g.save();
  g.fillStyle = 'rgba(40,22,10,.6)'; roundRect(g, x, y, w + 30, h + 8, 11); g.fill();
  fuelCan(g, x + 13, y + 10, 16);
  g.fillStyle = 'rgba(255,255,255,.2)'; roundRect(g, x + 26, y + 4, w, h, 7); g.fill();
  const c = f > 0.5 ? '#6fd34f' : f > 0.25 ? '#ffc531' : '#ff5a45';
  g.globalAlpha = warn && f < 0.25 && Math.sin(ctx.t * 12) > 0 ? 0.45 : 1;
  g.fillStyle = c; roundRect(g, x + 26, y + 4, Math.max(h, w * clamp(f, 0, 1)), h, 7); g.fill();
  g.restore();
}

// A hint bubble over the bike when it is tipping too far in the air: the most common beginner crash.
export function airHint(g, cam, b, input, slope = 0) {
  if (b.onGround || b.crashed || b.airT < 0.3) return;
  const tilt = b.a - Math.atan(slope);
  const msg = input.gas && tilt > 0.75 ? 'Let go of GAS!' : input.brake && tilt < -0.75 ? 'Let go of BRAKE!' : '';
  if (!msg) return;
  const [x, y] = cam.toScreen(b.x, b.y + 2.6);
  g.save(); g.font = '900 15px system-ui, sans-serif'; g.textAlign = 'center';
  const w = g.measureText(msg).width + 20;
  g.fillStyle = 'rgba(229,72,77,.92)'; roundRect(g, x - w / 2, y - 22, w, 28, 14); g.fill();
  g.beginPath(); g.moveTo(x - 6, y + 6); g.lineTo(x + 6, y + 6); g.lineTo(x, y + 13); g.fill();
  g.fillStyle = '#fff'; g.fillText(msg, x, y - 3); g.restore();
}
