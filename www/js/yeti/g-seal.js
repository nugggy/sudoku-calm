// Glacier Bounce: the yeti windmills the penguin and lets go; seals poking out of the glacier walls bounce it
// higher and higher. Score is the greatest height in metres.
import { Camera, FX, sprite, sky, snd, buzz, clamp, fmt, meter, arrow, noise1, rng } from './kit.js';

const GRAV = 9.8;
const WALL = 3.6;            // inner face of each wall, metres from the middle
const PR = 0.42;             // penguin radius
const PIVOT = { x: 0.35, y: 1.95 }, ARM = 1.25;
const SEAL_LEN = 1.75;       // how far a seal reaches out of the wall

export default {
  id: 'seal', name: 'Glacier Bounce', blurb: 'Spin, let go and bounce off the seals', unit: 'm',
  theme: ['#2f6fa8', '#8ec9ee', '#e3f4ff'],
  how: [
    'Tap once and the yeti starts spinning the penguin around. Tap again to let go. It flies off in the direction it is moving, shown by the arrow.',
    'Spin power peaks after about a second (watch the bar), then the yeti tires. Let go when the arrow points up.',
    'Seals pop in and out of the glacier walls. Touch one and it bounces the penguin much higher. Your score is the greatest height reached.',
  ],
  thumb(g, w, h) {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#8cc4e8'); gr.addColorStop(1, '#d8f0ff');
    g.fillStyle = gr; g.fillRect(0, 0, w * 0.18, h); g.fillRect(w * 0.82, 0, w * 0.18, h);
    sprite(g, 'seal', 0, w * 0.32, h * 0.48, h * 0.22);
    sprite(g, 'seal', 0, w * 0.68, h * 0.9, h * 0.22, { flip: true });
    sprite(g, 'penguin', 0, w * 0.52, h * 0.3, h * 0.26, { anchor: 'center', rot: -0.4 });
  },
  create(ctx) {
    const z0 = clamp(ctx.W / 9.4, 26, 60);
    const cam = new Camera(ctx, z0); cam.fx = 0.5; cam.fy = 0.72; cam.x = 0; cam.y = 2.2;
    const fx = new FX();
    const wallL = noise1(41), wallR = noise1(43);
    // seals at regular heights, alternating sides, each on its own rhythm
    const r = rng((Math.random() * 1e9) | 0);
    const seals = Array.from({ length: 40 }, (_, k) => ({ y: 7 + k * 6.6 + (r() - 0.5) * 1.2, side: k % 2 ? 1 : -1, period: 2.2 + r() * 1.4, phase: r() * 6.283, ext: 0, used: false, hit: 0 }));
    const P = { x: PIVOT.x + ARM, y: PIVOT.y, vx: 0, vy: 0, rot: 0, state: 'held', ang: 0, w: 0, spinT: 0 };
    let t = 0, maxY = 0, ended = false, combo = 0, lastBoost = -9, fellT = 0, bounces = 0, nudges = 3;
    ctx.hud({ left: ctx.best ? `Best ${fmt(ctx.best)} m` : '', right: '0 m' });
    ctx.prompt('Tap to start spinning');

    const power = (s) => (s < 1.15 ? 0.35 + 0.65 * Math.sin((s / 1.15) * Math.PI / 2) : Math.max(0.45, 1 - (s - 1.15) * 0.32));

    function down(x) {
      if (P.state === 'held') { P.state = 'spin'; P.spinT = 0; P.ang = 0; snd.swoosh(); ctx.prompt('Tap to let go'); }
      else if (P.state === 'spin') release();
      else if (P.state === 'fly') nudge(x < ctx.W / 2 ? -1 : 1);
    }
    // a little flipper-flap sideways, so the player can steer towards the next seal
    function nudge(dir) {
      if (nudges <= 0) return;
      nudges--;
      P.vx = clamp(P.vx * 0.35 + dir * 4.2, -8, 8); P.vy += 1.2;
      fx.burst(P.x - dir * 0.4, P.y, { n: 6, color: '#ffffff', speed: 2.5, up: 0, size: 0.14, life: 0.4, grav: 0, dir: dir > 0 ? Math.PI : 0, spread: 0.8 });
      snd.flap(); buzz(10); ctx.prompt('');
    }
    function release() {
      const p = power(P.spinT), v = 10 + 13.2 * p;
      P.vx = -Math.sin(P.ang) * v; P.vy = Math.cos(P.ang) * v; // counterclockwise travel direction
      P.state = 'fly'; P.rot = P.ang;
      snd.whack(p); buzz(20); fx.snow(P.x, P.y, 10, 3);
      fx.text(P.x, P.y + 1.2, p > 0.92 ? 'Perfect spin!' : p > 0.75 ? 'Good spin' : 'Weak spin', { color: p > 0.92 ? '#ffd447' : '#fff', size: p > 0.92 ? 26 : 20 });
      ctx.prompt('Tap left or right to steer');
    }
    function sealExt(s) {
      // out most of the time, ducking back into the wall for a moment each cycle
      const v = Math.sin((t * 6.283) / s.period + s.phase);
      return clamp((v + 0.35) * 2.2, 0, 1);
    }

    function update(dt) {
      t += dt; cam.update(dt); fx.update(dt);
      for (const s of seals) { s.ext += (sealExt(s) - s.ext) * Math.min(1, dt * 10); s.hit = Math.max(0, s.hit - dt); }
      if (P.state === 'held') {
        P.ang = Math.sin(t * 2) * 0.15; P.x = PIVOT.x + Math.cos(P.ang) * ARM; P.y = PIVOT.y + Math.sin(P.ang) * ARM;
      } else if (P.state === 'spin') {
        P.spinT += dt;
        P.w = 3 + 10 * Math.min(1, P.spinT / 1.1);
        P.ang += P.w * dt; P.rot = P.ang + Math.PI / 2;
        P.x = PIVOT.x + Math.cos(P.ang) * ARM; P.y = PIVOT.y + Math.sin(P.ang) * ARM;
        if (Math.floor((P.ang - P.w * dt) / 6.283) !== Math.floor(P.ang / 6.283)) snd.tick();
        if (P.spinT > 3.6) { fx.text(PIVOT.x, PIVOT.y + 1.6, 'Too dizzy!', { size: 20 }); release(); }
      } else if (P.state === 'fly') {
        P.vy -= GRAV * dt; P.vx *= 1 - 0.05 * dt;
        P.x += P.vx * dt; P.y += P.vy * dt; P.rot += (P.vx * 0.5 + 3) * dt;
        // glacier walls bounce it back with a bit less speed
        if (P.x > WALL - PR) { P.x = WALL - PR; P.vx = -Math.abs(P.vx) * 0.55; fx.snow(P.x + PR, P.y, 6, 2); snd.thud(); }
        if (P.x < -WALL + PR) { P.x = -WALL + PR; P.vx = Math.abs(P.vx) * 0.55; fx.snow(P.x - PR, P.y, 6, 2); snd.thud(); }
        for (const s of seals) {
          if (s.used || s.ext < 0.35 || Math.abs(P.y - s.y) > 0.55 + PR) continue; // each seal bounces the penguin once per throw
          const reach = s.ext * SEAL_LEN;
          const inside = s.side < 0 ? P.x - PR < -WALL + reach : P.x + PR > WALL - reach;
          if (!inside) continue;
          s.used = true; s.hit = 0.4; nudges = Math.min(3, nudges + 1); // every bounce earns back a steer
          combo = t - lastBoost < 2.2 ? combo + 1 : 1; lastBoost = t; bounces++;
          P.vy = Math.max(P.vy, 0) * 0.35 + 13 + Math.random() * 1.5 + Math.min(3, combo * 0.6);
          P.vx = -s.side * (4.8 + Math.random() * 2.2);
          fx.stars(P.x, P.y, 14); snd.boing(1 + Math.min(combo, 6) * 0.08); buzz(22); cam.shake(5, 0.2);
          fx.text(P.x, P.y + 1.2, combo > 1 ? `Boing x${combo}` : 'Boing!', { color: combo > 2 ? '#ffd447' : '#fff', size: 20 + Math.min(combo, 5) * 2 });
        }
        maxY = Math.max(maxY, P.y);
        if (P.vy < 0 && P.y < maxY - 1) fellT += dt; else fellT = 0;
        if (P.y <= PR) { P.y = PR; finish('Back down to the bottom'); }
        else if (P.y < maxY - 28 && P.vy < 0) finish('Fell out of sight');
      } else if (P.state === 'done') {
        if (P.y > PR) { P.vy -= GRAV * dt; P.y = Math.max(PR, P.y + P.vy * dt); P.x += P.vx * dt * 0.3; P.x = clamp(P.x, -WALL + PR, WALL - PR); }
      }
      // camera: frame the yeti at the start, then follow the penguin upwards and back down a little
      if (P.state === 'fly' || P.state === 'done') cam.follow(0, Math.max(2.2, P.y - 0.5), dt, 5);
      else cam.follow(0, 2.2, dt, 4);
      ctx.hud({ left: ctx.best ? `Best ${fmt(ctx.best)} m` : '', center: P.state === 'fly' ? `Steers ${nudges}` : '', right: `${fmt(Math.max(0, P.state === 'held' || P.state === 'spin' ? 0 : maxY))} m` });
    }
    function finish(line) {
      if (ended) return; ended = true; P.state = 'done';
      if (P.y <= PR + 0.01) { fx.snow(P.x, 0, 14, 4); snd.thud(); }
      const h = Math.round(maxY * 10) / 10;
      if (h > 60) snd.cheer(); else if (h < 20) snd.fail();
      ctx.finish(h, h > 80 ? 'Sky high!' : h > 40 ? `Nice bouncing. ${line}` : bounces ? line : 'Aim for the seals to bounce higher');
    }

    function drawWall(g, side) {
      const n = side < 0 ? wallL : wallR;
      const yTop = cam.top + 2, yBot = cam.bottom - 2;
      const x0 = side < 0 ? 0 : ctx.W;
      g.beginPath(); g.moveTo(x0, cam.sy_(yBot));
      for (let y = yBot; y <= yTop; y += 0.5) {
        const jag = (n(y * 0.45) - 0.5) * 0.7 + (n(y * 1.9 + 9) - 0.5) * 0.25;
        g.lineTo(cam.sx_(side * (WALL + 0.1 + jag)), cam.sy_(y));
      }
      g.lineTo(x0, cam.sy_(yTop)); g.closePath();
      const xa = cam.sx_(side * WALL), gr = g.createLinearGradient(x0, 0, xa, 0);
      gr.addColorStop(0, '#6fa9d6'); gr.addColorStop(0.7, '#b8def5'); gr.addColorStop(1, '#e9f7ff');
      g.fillStyle = gr; g.fill();
      g.strokeStyle = 'rgba(70,130,190,.5)'; g.lineWidth = 2; g.stroke();
      // cracks and height marks
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2;
      for (let y = Math.floor(yBot / 3) * 3; y < yTop; y += 3) {
        const k = n(y * 3.1) ; if (k < 0.55) continue;
        const xs = cam.sx_(side * (WALL + 0.6 + k)), ys = cam.sy_(y);
        g.beginPath(); g.moveTo(xs, ys); g.lineTo(xs - side * 10, ys - 14); g.lineTo(xs - side * 4, ys - 26); g.stroke();
      }
      if (side < 0) {
        g.font = '800 12px system-ui'; g.textAlign = 'left';
        for (let y = Math.max(10, Math.ceil(yBot / 10) * 10); y < yTop; y += 10) {
          const ys = cam.sy_(y), xs = cam.sx_(-WALL - 0.2);
          g.fillStyle = 'rgba(30,70,120,.55)'; g.fillRect(6, ys - 1, xs - 6, 2);
          g.fillStyle = '#fff'; g.fillText(`${y} m`, 8, ys - 5);
        }
      }
    }
    function drawSeal(g, s) {
      if (s.ext < 0.03) return;
      const reach = s.ext * SEAL_LEN;
      // the seal slides out of a hole in the ice; the wall is drawn on top, so only the part outside shows
      const cx = s.side < 0 ? -WALL + reach - 0.85 : WALL - reach + 0.85;
      const [sx, sy] = cam.toScreen(cx, s.y - 0.28);
      const bump = s.hit > 0 ? 1 + s.hit * 0.6 : 1;
      sprite(g, 'seal', 0, sx, sy, cam.zoom, { flip: s.side > 0, scale: bump, alpha: s.used && s.hit <= 0 ? 0.55 : 1 });
    }
    function drawHoles(g) {
      for (const s of seals) {
        if (s.y < cam.bottom - 2 || s.y > cam.top + 2) continue;
        const [hx, hy] = cam.toScreen(s.side * WALL, s.y);
        g.fillStyle = 'rgba(25,60,100,.75)'; g.beginPath(); g.ellipse(hx, hy, 7, cam.zoom * 0.42, 0, 0, 6.283); g.fill();
      }
    }
    function draw(g) {
      // the sky darkens as the penguin climbs
      const hk = clamp(cam.y / 120, 0, 1);
      sky(g, ctx, [mix('#9fd6f7', '#2a4f88', hk), mix('#cfeafb', '#5d8fc8', hk), mix('#eaf7ff', '#9cc7ea', hk)]);
      // far ice: soft vertical pillars sliding slowly for depth
      g.fillStyle = 'rgba(255,255,255,.18)';
      for (let i = 0; i < 7; i++) { const x = ((i * 97 + 30) % ctx.W), off = ((cam.y * cam.zoom * 0.25 + i * 140) % (ctx.H + 300)) - 150; g.fillRect(x, off, 22 + (i % 3) * 14, 260); }
      // floor
      const [, fy] = cam.toScreen(0, 0);
      if (fy < ctx.H) { g.fillStyle = '#f4fbff'; g.fillRect(0, fy, ctx.W, ctx.H - fy); g.fillStyle = 'rgba(120,170,215,.3)'; g.fillRect(0, fy, ctx.W, 3); }
      // best line
      if (ctx.best > 0) {
        const by = cam.sy_(ctx.best);
        if (by > -10 && by < ctx.H + 10) { g.strokeStyle = '#e5484d'; g.setLineDash([10, 8]); g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, by); g.lineTo(ctx.W, by); g.stroke(); g.setLineDash([]); g.font = '900 12px system-ui'; g.fillStyle = '#e5484d'; g.textAlign = 'right'; g.fillText(`BEST ${fmt(ctx.best)} m`, ctx.W - 10, by - 6); }
      }
      for (const s of seals) if (s.y > cam.bottom - 2 && s.y < cam.top + 2) drawSeal(g, s);
      drawWall(g, -1); drawWall(g, 1);
      drawHoles(g);
      // the yeti and the penguin
      const [yx, yy] = cam.toScreen(-0.2, 0);
      if (yy < ctx.H + 300) {
        const name = ended ? (maxY > 40 ? 'yeti_yes' : 'yeti_no') : 'yeti_idle';
        sprite(g, name, (t * 8) % 8, yx, yy, cam.zoom);
        if (P.state === 'spin') { // motion blur ring
          const [cx, cy] = cam.toScreen(PIVOT.x, PIVOT.y);
          g.strokeStyle = `rgba(255,255,255,${clamp(P.w / 13, 0, 0.35)})`; g.lineWidth = cam.zoom * 0.22; g.beginPath(); g.arc(cx, cy, ARM * cam.zoom, 0, 6.283); g.stroke();
        }
      }
      const [px, py] = cam.toScreen(P.x, P.y);
      sprite(g, 'penguin', 0, px, py, Math.max(cam.zoom, 28), { anchor: 'center', rot: -P.rot + (P.state === 'held' ? Math.PI / 2 : 0) });
      if (P.state === 'spin' || P.state === 'held') {
        const a = P.ang + Math.PI / 2;
        arrow(g, px, py, a, 54, power(P.spinT) > 0.92 && P.state === 'spin' ? '#7cf2a0' : '#ffd447');
      }
      if (P.state === 'spin') meter(g, ctx.W * 0.2, ctx.H - 46, ctx.W * 0.6, 14, power(P.spinT), { label: 'Spin power', sweet: [0.92, 1] });
      fx.draw(g, cam);
    }
    return { update, draw, down };
  },
};

function mix(a, b, k) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * k).toString(16).padStart(2, '0')).join('');
}
