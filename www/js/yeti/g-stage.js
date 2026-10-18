// Stage Dive: the yeti runs across the stage, leaps into a crowd of headbanging penguins and crowd-surfs.
// Ten taps make the penguins underneath push him up and forward. Pushes are strong when he is low over a
// packed part of the crowd and wasted when he is high up or over a gap. Score is the distance in metres.
import { Camera, FX, sprite, rng, snd, buzz, clamp, fmt1, roundRect } from './kit.js';

const STAGE_H = 1.6;      // stage height (m); the stage edge is at x = 0
const RUN = 5.4;          // run-up speed (m/s)
const GRAV = 8.6;
const TAPS = 10;
const LEN = 260;          // length of the crowd (m)
const CELL = 0.25;        // crowd grid resolution (m)
const LIE = 0.42;         // half the yeti's thickness when lying flat
// lying pose: yeti_fall frame 8, mirrored so his head points the way he travels
const LIE_FRAME = 8, LIE_DX = 1.09, LIE_DY = 0.41;

// Builds the crowd: clusters of penguins separated by gaps. The first 21 m are packed solid; after that the
// clusters get shorter and thinner and the gaps wider the further back you go.
function makeCrowd(seed) {
  const r = rng(seed + 7), people = [], spans = [];
  for (let x = 1.2, first = true; x < LEN;) {
    const far = Math.min(1, x / 180);
    const len = first ? 21 : 5 + r() * (11 - 5 * far);
    spans.push([x, x + len, first ? 0.95 : clamp(0.95 - far * 0.35 - r() * 0.25, 0.45, 0.95)]);
    x += len + (first ? 0 : 0.9 + r() * (1.2 + far * 3.2));
    first = false;
  }
  const dens = (x) => { for (const [a, b, d] of spans) if (x >= a && x < b) return d; return 0; };
  for (let x = 1.2; x < LEN;) {
    const d = dens(x);
    if (d > 0 && r() < d) {
      const s = 0.82 + r() * 0.34;
      people.push({ x: x + (r() - 0.5) * 0.12, s, front: r() < 0.7, flip: r() < 0.5, ph: r() * 6.28, back: false, hop: 0 });
      if (r() < 0.55) people.push({ x: x + 0.2 + (r() - 0.5) * 0.15, s: s * 0.9, front: r() < 0.7, flip: r() < 0.5, ph: r() * 6.28, back: true, hop: 0 });
    }
    x += d > 0 ? 0.36 + r() * 0.16 : 0.5;
  }
  // grid of crowd height and packing, used for support and push strength
  const N = Math.ceil(LEN / CELL), top = new Float32Array(N), pack = new Float32Array(N);
  for (const p of people) {
    if (p.back) continue;
    const i0 = Math.floor((p.x - 0.45) / CELL), i1 = Math.floor((p.x + 0.45) / CELL);
    for (let i = Math.max(0, i0); i <= Math.min(N - 1, i1); i++) { top[i] = Math.max(top[i], p.s * 0.98); pack[i] += 1; }
  }
  for (let i = 0; i < N; i++) pack[i] = clamp(pack[i] / 3.2, 0, 1);
  return { people, top, pack, N };
}

// A little open hand, used for the taps left.
function hand(g, x, y, s, on) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = on ? '#ffe2b8' : 'rgba(255,255,255,.18)';
  g.strokeStyle = on ? '#7a4a22' : 'rgba(255,255,255,.25)'; g.lineWidth = 1.4;
  g.beginPath(); g.ellipse(0, 3, 5.2, 5, 0, 0, 6.283); g.fill(); g.stroke();
  for (const [fx, h] of [[-3.6, 6], [-1.2, 7.5], [1.2, 7.2], [3.5, 5.8]]) { roundRect(g, fx - 1.1, -h, 2.2, h + 1, 1.1); g.fill(); g.stroke(); }
  g.beginPath(); g.ellipse(-5.6, 3.8, 1.3, 3, -0.9, 0, 6.283); g.fill(); g.stroke();
  g.restore();
}

export default {
  id: 'stage', name: 'Stage Dive', blurb: 'Leap into the penguin mosh pit and surf the crowd', unit: 'm',
  theme: ['#2a1640', '#4a2466', '#1a0f2a'],
  how: [
    'The yeti runs across the stage. Tap to leap, as close to the edge as you dare, for the biggest jump.',
    'Then you get 10 taps. Each tap makes the penguins underneath push the yeti up and forward.',
    'Pushes work best when he is low over a packed part of the crowd. Tap while he is high in the air or over a gap and the push is wasted.',
    'If he drops through a gap to the floor, the dive is over. Your score is how far he travels.',
  ],
  thumb(g, w, h) {
    for (let i = 0; i < 3; i++) { const gr = g.createLinearGradient(w * (0.2 + i * 0.3), 0, w * (0.2 + i * 0.3), h); gr.addColorStop(0, ['rgba(255,80,200,.45)', 'rgba(80,200,255,.45)', 'rgba(255,220,80,.45)'][i]); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(w * (0.2 + i * 0.3), 0); g.lineTo(w * (0.05 + i * 0.3), h); g.lineTo(w * (0.38 + i * 0.3), h); g.fill(); }
    for (let i = 0; i < 7; i++) sprite(g, 'penguin_front', 0, w * (0.08 + i * 0.14), h * 1.02, h * 0.36, { rot: (i % 2 ? 0.12 : -0.12) });
    sprite(g, 'yeti_fall', LIE_FRAME, w * 0.42, h * 0.62, h * 0.24, { flip: true });
  },
  create(ctx) {
    const zoom = clamp(ctx.W / 7.4, 34, 70);
    const cam = new Camera(ctx, zoom); cam.fx = 0.36; cam.fy = 0.8; cam.x = -3; cam.y = 1.8;
    const fx = new FX();
    const crowd = makeCrowd(1 + ((Math.random() * 1e6) | 0));
    const Y = { x: -8.5, y: STAGE_H, vx: 0, vy: 0, state: 'run', t: 0, tilt: 0, best: 0 };
    let t = 0, taps = TAPS, ended = false, line = '', stillT = 0, lastPush = -9, promptT = 0;
    const cell = (x) => clamp(Math.floor(x / CELL), 0, crowd.N - 1);
    const topAt = (x) => (x < 0 || x >= LEN ? 0 : crowd.top[cell(x)]);
    const packAt = (x) => (x < 0 || x >= LEN ? 0 : crowd.pack[cell(x)]);
    ctx.hud({ left: ctx.best ? `Best ${fmt1(ctx.best)} m` : '', center: `Taps ${TAPS}`, right: '0.0 m' });
    ctx.prompt('Tap to leap off the stage!');

    function leap() {
      // timing: the closer to the edge, the better the launch
      const q = clamp(1 - Math.abs(Y.x + 0.25) / 3.2, 0.15, 1);
      const perfect = q > 0.9;
      Y.state = 'air'; Y.vx = 4 + 5.2 * q + (perfect ? 0.8 : 0); Y.vy = 3.4 + 3.8 * q;
      Y.t = 0; snd.swoosh(); buzz(20);
      fx.text(Y.x + 0.5, Y.y + 2.6, perfect ? 'Perfect leap!' : q > 0.65 ? 'Big leap' : q > 0.4 ? 'Good leap' : 'Bit early', { color: perfect ? '#ffd447' : '#fff', size: perfect ? 28 : 22 });
      if (perfect) { fx.stars(Y.x, Y.y + 1, 14); snd.cheer(); }
      ctx.prompt('Tap to get the crowd pushing!'); promptT = 2.2;
    }
    // how hard the penguins could push right now (0..1): packed crowd underneath, yeti low over it
    function strength() {
      const top = topAt(Y.x), pk = packAt(Y.x);
      const h = Y.y - LIE - top;
      return top > 0 ? pk * clamp(1 - Math.max(0, h - 0.15) / 2.4, 0, 1) : 0;
    }
    function push() {
      if (taps <= 0) return;
      taps--;
      const top = topAt(Y.x);
      const s = strength();
      lastPush = t;
      // penguins under the yeti hop up with their flippers raised
      for (const p of crowd.people) if (Math.abs(p.x - Y.x) < 1.6) p.hop = 0.35 * (0.4 + s);
      if (s <= 0.05) {
        fx.text(Y.x, Y.y + 1.4, top > 0 ? 'Too high!' : 'Nobody there!', { color: '#ff9f9f', size: 20 });
        snd.flap(); buzz(10);
      } else {
        Y.vy = Math.max(Y.vy, 0) + 2.4 + 5.6 * s;
        Y.vx = Math.min(11.5, Y.vx + 0.5 + 3.4 * s);
        Y.state = 'air';
        snd.boing(0.8 + s * 0.6); buzz(s > 0.75 ? [20, 30, 20] : 14);
        fx.burst(Y.x, Y.y - 0.3, { n: 8 + Math.round(s * 10), color: ['#ffd447', '#ff7ad9', '#7ce0ff'], speed: 4 + 4 * s, up: 3, size: 0.12, life: 0.7, grav: 7 });
        fx.text(Y.x, Y.y + 1.5, s > 0.8 ? 'Huge push!' : s > 0.55 ? 'Nice push' : 'Weak push', { color: s > 0.8 ? '#ffd447' : '#fff', size: s > 0.8 ? 26 : 20 });
        if (s > 0.8) { snd.cheer(); cam.shake(6, 0.25); }
      }
      ctx.prompt(''); promptT = 0;
    }

    function finish(why) {
      if (ended) return; ended = true;
      const d = Math.max(0, Y.x);
      line = why || (d > 90 ? 'Crowd-surfing legend!' : d > 45 ? 'The crowd loved it' : 'Rock on, try again');
      if (d > 45) snd.cheer(); else snd.fail();
      ctx.prompt('');
      ctx.finish(Math.round(d * 10) / 10, line);
    }

    function update(dt) {
      t += dt; cam.update(dt); fx.update(dt);
      if (promptT > 0 && (promptT -= dt) <= 0) ctx.prompt('');
      for (const p of crowd.people) if (p.hop > 0) p.hop = Math.max(0, p.hop - dt);
      if (Y.state === 'run') {
        Y.t += dt; Y.x += RUN * dt;
        if (Y.x > 0.35) { // ran off the edge without leaping
          Y.state = 'air'; Y.vx = 3; Y.vy = 0.5; snd.flap();
          fx.text(Y.x, Y.y + 2.4, 'Oops, too late!', { color: '#ff9f9f', size: 20 });
          ctx.prompt('Tap to get the crowd pushing!'); promptT = 2.2;
        }
      } else if (Y.state === 'air' || Y.state === 'surf') {
        Y.t += dt;
        const top = topAt(Y.x);
        if (Y.state === 'air') {
          Y.vy -= GRAV * dt; Y.x += Y.vx * dt; Y.y += Y.vy * dt;
          Y.vx = Math.max(0, Y.vx - 0.25 * dt);
          if (top > 0 && Y.vy <= 0 && Y.y - LIE <= top + 0.02 && Y.y - LIE > top - 0.5) { Y.state = 'surf'; Y.y = top + LIE; Y.vy = 0; snd.thud(); fx.burst(Y.x, top + 0.2, { n: 6, color: '#fff', speed: 2, up: 1, size: 0.1, life: 0.4 }); }
        } else {
          // carried along on the crowd: the penguins pass him forward, slowing over thinner parts
          const pk = packAt(Y.x);
          Y.vx = Math.max(0, Y.vx - (2.6 - 1.4 * pk) * dt);
          Y.x += Y.vx * dt;
          const nt = topAt(Y.x);
          if (nt <= 0.05) { Y.state = 'air'; Y.vy = -0.5; }
          else Y.y += (nt + LIE + Math.sin(t * 13) * 0.03 - Y.y) * Math.min(1, dt * 14);
        }
        if (Y.y - LIE <= 0) { // dropped through a gap
          Y.y = LIE; Y.state = 'floor'; Y.vx *= 0.25; Y.vy = 0;
          snd.thud(); cam.shake(10, 0.35); buzz([40, 30, 40]); fx.dust(Y.x, 0.1, 16);
          fx.text(Y.x, 2.4, 'Thud!', { color: '#ff9f9f', size: 26 });
        }
        if (Y.state === 'surf' && Y.vx < 0.15) {
          stillT += dt;
          if (!taps && stillT > 0.6) finish();
          else if (taps && stillT > 0.4) ctx.prompt('Tap to get the crowd pushing!');
        } else stillT = 0;
      } else if (Y.state === 'floor') {
        Y.vx = Math.max(0, Y.vx - 8 * dt); Y.x += Y.vx * dt;
        if (Y.vx <= 0.02) finish('Dropped through a gap to the floor');
      }
      Y.tilt += ((Y.state === 'air' ? clamp(-Y.vy * 0.05, -0.35, 0.45) : 0) - Y.tilt) * Math.min(1, dt * 6);
      // camera: wide on the stage, then chase the yeti
      if (Y.state === 'run') cam.follow(Math.max(-3.2, Y.x + 2), 1.9, dt, 4);
      else cam.follow(Y.x + 1.2, Math.max(1.9, Y.y * 0.6 + 0.8), dt, 4);
      ctx.hud({ left: ctx.best ? `Best ${fmt1(ctx.best)} m` : '', center: `Taps ${taps}`, right: `${fmt1(Math.max(0, Y.x))} m` });
    }

    function down() {
      if (ended) return;
      if (Y.state === 'run') leap();
      else if (Y.state === 'air' || Y.state === 'surf') push();
    }

    // ---------- drawing ----------
    function drawHall(g) {
      const W = ctx.W, H = ctx.H;
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#120a24'); gr.addColorStop(0.6, '#2a1546'); gr.addColorStop(1, '#170c28');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      // back wall panels with a slow parallax
      const off = -(cam.x * cam.zoom * 0.3) % 90;
      g.fillStyle = 'rgba(255,255,255,.035)';
      for (let x = off - 90; x < W + 90; x += 90) g.fillRect(x, H * 0.08, 3, H * 0.62);
      // neon banner
      const bx = W * 0.5 - cam.x * cam.zoom * 0.18 - 120, by = H * 0.2;
      if (bx > -320 && bx < W + 20) {
        g.save(); g.font = '900 34px system-ui, sans-serif'; g.textAlign = 'center';
        const pulse = 0.65 + 0.35 * Math.abs(Math.sin(t * Math.PI * 2.2 / 2));
        g.shadowColor = '#ff4fd8'; g.shadowBlur = 18 * pulse; g.fillStyle = `rgba(255,140,230,${0.55 + 0.4 * pulse})`;
        g.fillText('YETI ROCKS', bx + 120, by); g.restore();
      }
      // sweeping spotlights from a truss
      g.save(); g.globalCompositeOperation = 'lighter';
      const cols = ['255,70,200', '70,200,255', '255,220,70', '140,255,120'];
      for (let i = 0; i < 5; i++) {
        const sx = ((i * 0.23 + 0.08) * W - cam.x * cam.zoom * 0.12) % (W * 1.15) - W * 0.05;
        const a = Math.sin(t * (0.6 + i * 0.17) + i * 1.7) * 0.5;
        const ex = sx + Math.sin(a) * H, ey = H * 0.95;
        const lg = g.createLinearGradient(sx, 0, ex, ey); lg.addColorStop(0, `rgba(${cols[i % 4]},.42)`); lg.addColorStop(1, `rgba(${cols[i % 4]},0)`);
        g.fillStyle = lg; g.beginPath(); g.moveTo(sx - 6, 18); g.lineTo(ex - 70, ey); g.lineTo(ex + 70, ey); g.lineTo(sx + 6, 18); g.fill();
      }
      g.restore();
      // truss and lamps
      g.fillStyle = '#3a3a48'; g.fillRect(0, 10, W, 8);
      g.strokeStyle = '#4a4a5c'; g.lineWidth = 1.5; g.beginPath();
      for (let x = -((cam.x * cam.zoom * 0.12) % 16); x < W; x += 16) { g.moveTo(x, 10); g.lineTo(x + 8, 18); g.moveTo(x + 8, 18); g.lineTo(x + 16, 10); }
      g.stroke();
      for (let i = 0; i < 5; i++) { const sx = ((i * 0.23 + 0.08) * W - cam.x * cam.zoom * 0.12) % (W * 1.15) - W * 0.05; g.fillStyle = '#22222c'; g.fillRect(sx - 8, 16, 16, 12); g.fillStyle = `rgb(${cols[i % 4]})`; g.fillRect(sx - 6, 26, 12, 3); }
    }
    function drawStage(g) {
      const [x0, y0] = cam.toScreen(-30, STAGE_H), [x1, y1] = cam.toScreen(0, 0);
      if (x1 < -10) return;
      g.fillStyle = '#2b2236'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.fillStyle = '#4b3a5c'; g.fillRect(x0, y0, x1 - x0, 6);
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1;
      for (let x = x1; x > x0; x -= cam.zoom * 0.9) { g.beginPath(); g.moveTo(x, y0 + 6); g.lineTo(x, y1); g.stroke(); }
      // footlights along the edge
      for (let i = 0; i < 12; i++) { const [lx, ly] = cam.toScreen(-0.4 - i * 1.1, STAGE_H); g.fillStyle = i % 2 ? '#ffd447' : '#ff7ad9'; g.beginPath(); g.arc(lx, ly + 3, 2.4, 0, 6.283); g.fill(); }
      // speaker stacks and a mic stand
      for (const sxm of [-9.6, -12.2]) {
        for (let k = 0; k < 2; k++) {
          const [a, b] = cam.toScreen(sxm, STAGE_H + 1.25 * (k + 1)), s = cam.zoom * 1.2;
          g.fillStyle = '#16131c'; roundRect(g, a, b, s * 1.6, s, 4); g.fill();
          g.strokeStyle = '#3c3548'; g.lineWidth = 2; g.stroke();
          const beat = 1 + Math.max(0, Math.sin(t * Math.PI * 4.4)) * 0.08;
          g.fillStyle = '#2c2836'; g.beginPath(); g.arc(a + s * 0.5, b + s * 0.5, s * 0.33 * beat, 0, 6.283); g.arc(a + s * 1.15, b + s * 0.5, s * 0.22 * beat, 0, 6.283); g.fill();
          g.fillStyle = '#55506a'; g.beginPath(); g.arc(a + s * 0.5, b + s * 0.5, s * 0.1, 0, 6.283); g.fill();
        }
      }
      const [mx, my] = cam.toScreen(-5.5, STAGE_H), [, mt] = cam.toScreen(0, STAGE_H + 1.9);
      g.strokeStyle = '#8c8c9c'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(mx, my); g.lineTo(mx, mt); g.lineTo(mx + 10, mt - 6); g.stroke();
      g.fillStyle = '#222'; g.beginPath(); g.ellipse(mx + 12, mt - 7, 5, 3.5, -0.5, 0, 6.283); g.fill();
    }
    function drawCrowd(g, back) {
      const beat = t * Math.PI * 2 * 2.2 / 2; // about 132 beats a minute
      const L = cam.left - 1, R = cam.right + 1;
      for (const p of crowd.people) {
        if (p.back !== back || p.x < L || p.x > R) continue;
        const bob = Math.abs(Math.sin(beat + p.ph * 0.15)) * 0.08 + p.hop;
        const [sx, sy] = cam.toScreen(p.x, (back ? 0.12 : 0) + bob);
        const rot = Math.sin(beat * 2 + p.ph) * 0.13;
        sprite(g, p.front ? 'penguin_front' : 'penguin', 0, sx, sy, cam.zoom * p.s, { rot, flip: p.flip, alpha: back ? 0.55 : 1 });
        if (!back && p.hop > 0.05) { // flippers up
          const [hx, hy] = cam.toScreen(p.x, p.s * 0.85 + bob);
          g.strokeStyle = '#1a1a22'; g.lineWidth = Math.max(2, cam.zoom * 0.08); g.lineCap = 'round';
          g.beginPath(); g.moveTo(hx - cam.zoom * 0.18, hy + cam.zoom * 0.2); g.lineTo(hx - cam.zoom * 0.28, hy - cam.zoom * 0.2); g.moveTo(hx + cam.zoom * 0.18, hy + cam.zoom * 0.2); g.lineTo(hx + cam.zoom * 0.28, hy - cam.zoom * 0.2); g.stroke();
        }
      }
    }
    function drawYeti(g) {
      if (Y.state === 'run') {
        const [x, y] = cam.toScreen(Y.x, Y.y);
        sprite(g, 'yeti_run', Y.t * 14, x, y, cam.zoom);
        return;
      }
      if (Y.state === 'air' && Y.t < 0.35 && Y.x < 3) { // the take-off, still upright
        const [x, y] = cam.toScreen(Y.x, Y.y - 1.2);
        sprite(g, 'yeti_jump', 8 + Y.t * 8, x, y, cam.zoom, { rot: Y.t * 2.2 });
        return;
      }
      // lying flat, head first, tilting with the flight
      const [cx, cy] = cam.toScreen(Y.x, Y.y);
      g.save(); g.translate(cx, cy); g.rotate(Y.tilt + (Y.state === 'surf' ? Math.sin(t * 9) * 0.04 : 0));
      sprite(g, 'yeti_fall', LIE_FRAME, -LIE_DX * cam.zoom, LIE_DY * cam.zoom, cam.zoom, { flip: true });
      g.restore();
    }
    function drawFloorMarks(g) {
      const every = 10, [, fy] = cam.toScreen(0, 0);
      g.fillStyle = '#100820'; g.fillRect(0, fy, ctx.W, ctx.H - fy);
      g.save(); g.font = '800 12px system-ui, sans-serif'; g.textAlign = 'center';
      for (let d = Math.max(10, Math.ceil(cam.left / every) * every); d <= cam.right + every; d += every) {
        const [x] = cam.toScreen(d, 0);
        g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x - 1, fy, 2, 10);
        g.fillStyle = 'rgba(255,255,255,.55)'; g.fillText(`${d} m`, x, fy + 24);
      }
      if (ctx.best > 0) { const [bx] = cam.toScreen(ctx.best, 0); g.fillStyle = '#ff5a6e'; g.fillRect(bx - 1.5, fy, 3, 14); g.fillText('BEST', bx, fy + 38); }
      g.restore();
    }
    function draw(g) {
      drawHall(g);
      drawFloorMarks(g);
      drawStage(g);
      drawCrowd(g, true);
      if ((Y.state === 'air' || Y.state === 'surf') && taps > 0 && Y.x > 1) {
        const st = strength(), top = topAt(Y.x);
        if (top > 0) {
          const [gx, gy] = cam.toScreen(Y.x, top);
          const col = st > 0.7 ? '90,255,140' : st > 0.35 ? '255,210,80' : '255,110,110';
          const gr = g.createRadialGradient(gx, gy, 2, gx, gy, cam.zoom * 1.6);
          gr.addColorStop(0, `rgba(${col},${0.25 + st * 0.45})`); gr.addColorStop(1, `rgba(${col},0)`);
          g.fillStyle = gr; g.beginPath(); g.ellipse(gx, gy, cam.zoom * 1.6, cam.zoom * 0.7, 0, 0, 6.283); g.fill();
        }
      }
      drawYeti(g);
      drawCrowd(g, false);
      fx.draw(g, cam);
      // taps left
      const s = 1.05, gap = 18, x0 = ctx.W / 2 - (TAPS - 1) * gap / 2, y0 = 56;
      g.fillStyle = 'rgba(10,5,20,.55)'; roundRect(g, x0 - 16, y0 - 16, (TAPS - 1) * gap + 32, 28, 14); g.fill();
      for (let i = 0; i < TAPS; i++) hand(g, x0 + i * gap, y0, s, i < taps);
      if (t - lastPush < 0.15) { g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, 0, ctx.W, ctx.H); }
    }
    return { update, draw, down };
  },
};
