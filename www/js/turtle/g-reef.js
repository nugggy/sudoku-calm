// Reef Glide: a sea turtle swims an endless reef. Hold to swim up, let go to glide down. Slip through gaps in the
// jellyfish swarms, steer round drifting fishing nets and munch seagrass. Score is metres plus seagrass bonuses.
import { FX, snd, buzz, clamp, pic, fillGrad, roundRect } from './kit.js';

export default {
  id: 'reef', name: 'Reef Glide', blurb: 'Hold to swim up, glide past jellyfish and nets', unit: 'pts',
  theme: ['#2a8fc0', '#5cc6dc', '#e7d6a6'],
  how: [
    'Hold your finger down to swim up. Let go and the turtle glides gently down.',
    'Swim through the gaps in the jellyfish swarms and keep clear of drifting fishing nets. One touch ends the swim.',
    'Seagrass is a turtle\'s favourite snack. Each bunch you eat is worth 5 points on top of the distance.',
  ],
  thumb(g, w, h) {
    g.fillStyle = '#e7d6a6'; g.fillRect(0, h * 0.86, w, h);
    pic(g, 't_jelly', w * 0.75, h * 0.25, h * 0.3); pic(g, 't_jelly', w * 0.8, h * 0.62, h * 0.3);
    pic(g, 't_swim', w * 0.36, h * 0.48, h * 0.62, { rot: -0.15 });
  },
  create(ctx) {
    const fx = new FX(), cam = { toScreen: (x, y) => [x, y], zoom: 1 };
    const T = { y: ctx.H * 0.45, vy: 0, rot: 0 };
    let hold = false, started = false, ended = false, t = 0, dist = 0, grass = 0, nextAt = 0, obs = [], food = [], deco = [];
    const S = () => clamp(ctx.W * 0.2, 54, 100);           // turtle length in px (about 1 m)
    const top = () => 30, floor = () => ctx.H * 0.88;
    const speed = () => S() * (2.6 + Math.min(2.6, dist / S() / 120));
    ctx.prompt('Hold to swim up');
    const score = () => Math.floor(dist / S()) + grass * 5;
    const hud = () => ctx.hud({ left: ctx.best ? `Best ${ctx.best}` : '', right: `${score()} pts` });
    hud();
    for (let i = 0; i < 7; i++) deco.push({ x: Math.random() * ctx.W * 1.5, kind: Math.random() < 0.5 ? 't_coral' : 't_seaweed', s: 0.6 + Math.random() * 0.7 });
    const fish = Array.from({ length: 5 }, (_, i) => ({ x: Math.random() * ctx.W, y: 60 + Math.random() * ctx.H * 0.6, v: 20 + Math.random() * 30, s: 0.35 + Math.random() * 0.25, k: i }));

    function spawn(x) {
      const s = S(), r = Math.random(), lo = top() + s * 0.6, hi = floor() - s * 0.6;
      if (r < 0.62 || dist < s * 8) {
        // a column of jellyfish with one gap
        const gap = clamp(ctx.H * (0.34 - dist / s / 4000), ctx.H * 0.24, ctx.H * 0.34);
        const gy = lo + gap / 2 + Math.random() * Math.max(1, hi - lo - gap);
        const js = s * 0.62, step = js * 0.8;
        for (let y = top() + js * 0.3; y < floor(); y += step) if (Math.abs(y - gy) > gap / 2) obs.push({ type: 'jelly', x: x + (Math.random() - 0.5) * 12, y, r: js * 0.36, s: js, ph: Math.random() * 6 });
        food.push({ x: x + s * 1.6, y: gy, ph: Math.random() * 6 });
      } else {
        const w = s * (1.1 + Math.random() * 0.7), h = s * (0.9 + Math.random() * 0.6);
        obs.push({ type: 'net', x, y: lo + Math.random() * (hi - lo - h) + h / 2, w, h, ph: Math.random() * 6, amp: s * 0.5 });
        food.push({ x: x + s * 0.2, y: Math.random() < 0.5 ? top() + s * 0.7 : floor() - s * 0.7, ph: 0 });
      }
    }

    function down() { hold = true; if (!started) { started = true; ctx.prompt(''); } }
    function up() { hold = false; }

    function end(why) {
      if (ended) return; ended = true; snd.thud(); buzz(40);
      fx.burst(ctx.W * 0.28, T.y, { n: 16, color: ['#ffffff', '#bfe6ff'], speed: 120, up: 0, size: 3, life: 0.7, grav: 0 });
      ctx.finish(score(), `${why} after ${Math.floor(dist / S())} m, with ${grass} bunch${grass === 1 ? '' : 'es'} of seagrass`);
    }

    function update(dt) {
      t += dt; fx.update(dt);
      const s = S(), tx = ctx.W * 0.28;
      if (!started) { T.y = ctx.H * 0.45 + Math.sin(t * 2) * 8; return; }
      if (!ended) {
        T.vy += (hold ? -s * 9 : s * 4.2) * dt;
        T.vy = clamp(T.vy, -s * 3.2, s * 2.6);
        T.y += T.vy * dt;
        if (T.y < top() + s * 0.25) { T.y = top() + s * 0.25; T.vy = Math.max(0, T.vy); }
        if (T.y > floor() - s * 0.2) { T.y = floor() - s * 0.2; T.vy = Math.min(0, T.vy); }
        T.rot = clamp(T.vy / (s * 6), -0.45, 0.45);
        const v = speed() * dt; dist += v;
        for (const o of obs) o.x -= v;
        for (const f of food) f.x -= v;
        for (const d of deco) { d.x -= v * 0.6; if (d.x < -s * 2) { d.x += ctx.W + s * 4; d.kind = Math.random() < 0.5 ? 't_coral' : 't_seaweed'; } }
        nextAt -= v;
        if (nextAt <= 0) { spawn(ctx.W + s); nextAt = clamp(ctx.W * 0.62 - dist / s * 0.4, s * 2.6, ctx.W); }
        obs = obs.filter((o) => o.x > -s * 2); food = food.filter((f) => f.x > -s && !f.eaten);
        // collisions: the turtle is an ellipse, roughly a circle on its shell plus one on its head
        const pts = [[tx, T.y, s * 0.26], [tx + s * 0.34, T.y + T.rot * s * 0.3, s * 0.12]];
        for (const o of obs) {
          if (o.type === 'jelly') { const oy = o.y + Math.sin(t * 2 + o.ph) * 6; for (const [px, py, pr] of pts) if (Math.hypot(px - o.x, py - oy) < pr + o.r) return end('Stung by a jellyfish'); }
          else { const oy = o.y + Math.sin(t * 0.9 + o.ph) * o.amp; for (const [px, py, pr] of pts) { const cx = clamp(px, o.x - o.w / 2, o.x + o.w / 2), cy = clamp(py, oy - o.h / 2, oy + o.h / 2); if (Math.hypot(px - cx, py - cy) < pr) return end('Tangled in a net'); } }
        }
        for (const f of food) if (!f.eaten && Math.hypot(tx + s * 0.25 - f.x, T.y - f.y) < s * 0.45) {
          f.eaten = true; grass++; snd.pop(); buzz(8); fx.text(f.x, f.y - 18, '+5', { color: '#d6ffb0', size: 20 });
        }
        if (Math.random() < dt * 6) fx.burst(tx - s * 0.4, T.y - s * 0.1, { n: 1, color: 'rgba(255,255,255,.7)', speed: 20, up: 0, size: 2 + Math.random() * 2, life: 1.2, grav: 30, dir: -Math.PI / 2, spread: 0.6 });
        hud();
      }
      for (const f of fish) { f.x -= f.v * dt + (ended ? 0 : speed() * dt * 0.25); if (f.x < -60) { f.x = ctx.W + 60; f.y = 60 + Math.random() * ctx.H * 0.6; } }
    }

    function draw(g) {
      const W = ctx.W, H = ctx.H, s = S(), fl = floor();
      fillGrad(g, 0, 0, 0, H, ['#4fc3dd', '#2393bf', '#16628e']); g.fillRect(0, 0, W, H);
      // light rays from the surface
      g.save(); g.globalAlpha = 0.09; g.fillStyle = '#fff';
      for (let i = 0; i < 5; i++) { const x = ((i * 173 - dist * 0.05) % (W + 200) + W + 200) % (W + 200) - 100; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 60, 0); g.lineTo(x + 150, H); g.lineTo(x + 40, H); g.fill(); }
      g.restore();
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, 0, W, top() - 18);
      for (const f of fish) pic(g, 't_fish', f.x, f.y, s * f.s, { flip: true, alpha: 0.75, rot: Math.sin(t * 3 + f.k) * 0.05 });
      // sand floor and reef plants
      fillGrad(g, 0, fl, 0, H, ['#e9d7a5', '#d7bf86']); g.fillRect(0, fl, W, H - fl);
      for (const d of deco) pic(g, d.kind, d.x, fl - s * 0.35 * d.s, s * 0.9 * d.s);
      for (const f of food) if (!f.eaten) pic(g, 't_seagrass', f.x, f.y + Math.sin(t * 3 + f.ph) * 4, s * 0.55, { rot: Math.sin(t * 2 + f.ph) * 0.15 });
      for (const o of obs) {
        if (o.type === 'jelly') pic(g, 't_jelly', o.x, o.y + Math.sin(t * 2 + o.ph) * 6, o.s, { rot: Math.sin(t * 1.5 + o.ph) * 0.1 });
        else {
          const oy = o.y + Math.sin(t * 0.9 + o.ph) * o.amp, x0 = o.x - o.w / 2, y0 = oy - o.h / 2;
          g.save(); g.strokeStyle = 'rgba(235,240,230,.85)'; g.lineWidth = 2;
          roundRect(g, x0, y0, o.w, o.h, 8); g.stroke(); g.clip();
          g.lineWidth = 1.4; g.beginPath();
          for (let k = -o.h; k < o.w + o.h; k += 14) { g.moveTo(x0 + k, y0); g.lineTo(x0 + k - o.h, y0 + o.h); g.moveTo(x0 + k - o.h, y0); g.lineTo(x0 + k, y0 + o.h); }
          g.stroke(); g.restore();
          g.fillStyle = '#ff8a3d'; for (const [fx0, fy0] of [[x0, y0], [x0 + o.w, y0]]) { g.beginPath(); g.arc(fx0, fy0, 6, 0, Math.PI * 2); g.fill(); }
        }
      }
      pic(g, 't_swim', W * 0.28, T.y, s, { rot: T.rot + Math.sin(t * 4) * 0.04 });
      fx.draw(g, cam);
    }
    return { update, draw, down, up };
  },
};
