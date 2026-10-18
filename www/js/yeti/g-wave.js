// Big Wave: the yeti surfs a huge curling wave. Hold to carve up the face, let go to drop. Fly off the lip,
// hold in the air to spin, and land with the board matching the wave. Hit the penguins the wave tosses up.
// The wave shrinks over the round; score is trick points plus penguin bonuses.
import { Camera, FX, sprite, sky, ridge, clouds, snd, buzz, clamp, fmt } from './kit.js';

const DURATION = 72;     // seconds until the wave has gone flat
const H0 = 9;            // starting wave height in metres
const AIR_G = 14;        // gravity in the air (a little floaty)
const TAU = Math.PI * 2;
const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };

// The wave in its own frame: flat sea at y = 0 for x < 0, the face rising to the crest at (xc, h),
// and the back sloping away to the right.
function waveShape(h) {
  const xc = h * 0.95;
  const face = (x) => (x <= 0 ? 0 : x >= xc ? h * Math.exp(-(x - xc) / (1.5 * h)) : h * Math.pow(x / xc, 2.2));
  const slope = (x) => { if (x <= 0) return 0; if (x >= xc) return -Math.exp(-(x - xc) / (1.5 * h)) / 1.5; return (2.2 * h / xc) * Math.pow(x / xc, 1.2); };
  return { h, xc, face, slope };
}

export default {
  id: 'wave', name: 'Big Wave', blurb: 'Surf the monster wave and pull off spins', unit: 'pts',
  theme: ['#3fa9e8', '#7fd3f2', '#1b7fb4'],
  how: [
    'Hold anywhere to carve up the face of the wave. Let go to drop back down.',
    'Reach the lip with plenty of speed and the yeti flies into the air. Press and hold in the air to spin, and let go to stop.',
    'Land with the board pointing along the wave to score. Each full spin is worth 360, bigger air scores more, and clean tricks in a row build a combo. A bad landing is a wipeout.',
    'The wave tosses penguins into the air. Hit them for bonus points. The wave slowly shrinks, and the round ends when it goes flat.',
  ],
  thumb(g, w, h) {
    // a little curling wave with the yeti on top
    const gr = g.createLinearGradient(0, h * 0.2, 0, h); gr.addColorStop(0, '#5fd0ee'); gr.addColorStop(1, '#0b5f92');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * 0.85);
    g.bezierCurveTo(w * 0.35, h * 0.85, w * 0.62, h * 0.7, w * 0.72, h * 0.22);
    g.bezierCurveTo(w * 0.62, h * 0.12, w * 0.5, h * 0.22, w * 0.52, h * 0.34);
    g.bezierCurveTo(w * 0.78, h * 0.18, w * 0.9, h * 0.5, w, h * 0.62); g.lineTo(w, h); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(w * 0.72, h * 0.22); g.bezierCurveTo(w * 0.62, h * 0.12, w * 0.5, h * 0.22, w * 0.52, h * 0.34); g.stroke();
    g.save(); g.translate(w * 0.42, h * 0.6); g.rotate(-0.55);
    sprite(g, 'surfboard', 0, 0, 0, h * 0.2); sprite(g, 'yeti_crouch', 0, 0, -h * 0.03, h * 0.2); g.restore();
  },
  create(ctx) {
    const cam = new Camera(ctx, 30); cam.fx = 0.5; cam.fy = 0.6;
    const bgCam = { ctx, x: 0, y: 0, zoom: 1, fx: 0.5 }; // fake camera that only drives the scenery scroll
    const fx = new FX();
    let t = 0, score = 0, combo = 1, holding = false, ended = false, tips = 0;
    let W = waveShape(H0);
    // the yeti: riding on the face, in the air, or wiped out
    const Y = { state: 'ride', x: W.xc * 0.35, y: 0, v: 0, vx: 0, vy: 0, rot: 0, spinV: 0, spun: 0, airT: 0, peak: 0, spinHeld: false, wipeT: 0, wx: 0, wy: 0 };
    const pens = [];
    let penT = 2.5, lastTrickT = 0;
    const foam = Array.from({ length: 14 }, (_, i) => ({ u: i / 14, k: Math.random() }));
    ctx.prompt('Hold to ride up the wave. Let go to drop.');

    const yetiCentre = () => ({ x: Y.x - Math.sin(Y.rot) * 1.3, y: Y.y + Math.cos(Y.rot) * 1.3 });

    function trickLanded(clean) {
      const rotations = Math.round(Math.abs(Y.spun) / TAU);
      const height = Math.max(0, Y.peak - W.h);
      if (!clean) return;
      if (rotations === 0 && height < 1.2) return; // just a little hop
      const base = rotations * 360 + Math.round(height * 25) + Math.round(Y.airT * 20);
      const pts = base * combo;
      score += pts;
      const name = rotations >= 3 ? `${rotations * 360} spin!` : rotations === 2 ? '720!' : rotations === 1 ? '360' : 'Big air';
      fx.text(Y.x, Y.y + 2.6, `${name} +${fmt(pts)}`, { color: rotations >= 2 ? '#ffd447' : '#fff', size: rotations >= 2 ? 28 : 22 });
      if (combo > 1) fx.text(Y.x, Y.y + 3.6, `Combo x${combo}`, { color: '#7cf0c8', size: 18 });
      combo = Math.min(5, combo + 1); lastTrickT = t;
      snd.ding(Math.min(6, rotations + combo)); buzz(rotations >= 2 ? [20, 30, 40] : 20);
      fx.stars(Y.x, Y.y + 1, 8 + rotations * 4);
    }
    function wipeout() {
      Y.state = 'wipe'; Y.wipeT = 0; Y.wx = Y.x; Y.wy = Y.y; combo = 1;
      fx.splash(Y.x, Y.y, 30); snd.splash(); buzz([40, 40, 60]); cam.shake(10, 0.4);
      fx.text(Y.x, Y.y + 2.2, 'Wipeout!', { color: '#ff8a8a', size: 26 });
    }
    function launch() {
      Y.state = 'air'; Y.vx = 1.2; Y.vy = Math.max(6, Y.v * 1.15 + 2); Y.spinV = 0; Y.spun = 0; Y.airT = 0; Y.peak = Y.y; Y.spinHeld = false;
      fx.splash(Y.x, Y.y, 16); snd.swoosh();
      if (tips === 1) { tips = 2; ctx.prompt('Press and hold in the air to spin'); setTimeout(() => { if (tips === 2) ctx.prompt(''); }, 2600); }
    }

    function update(dt) {
      t += dt; cam.update(dt); fx.update(dt);
      // the wave shrinks as the round goes on
      const life = clamp(t / DURATION, 0, 1);
      W = waveShape(H0 * (1 - 0.8 * life));
      bgCam.x -= 9 * dt;
      // penguins tossed up by the wave
      penT -= dt;
      if (penT <= 0 && t < DURATION - 2) {
        penT = 1.8 + Math.random() * 2.2;
        pens.push({ x: -3 - Math.random() * 3, y: 0, vx: 2.5 + Math.random() * 2.8, vy: 9 + Math.random() * 5 * (W.h / H0) + W.h * 0.35, rot: 0, spin: (Math.random() - 0.5) * 8, hit: false, life: 0 });
      }
      for (const p of pens) {
        p.life += dt; p.vy -= 9.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
        if (!p.hit && Y.state !== 'wipe') {
          const c = yetiCentre();
          if (Math.hypot(p.x - c.x, p.y - c.y) < 1.15) {
            p.hit = true; p.vx = 9 + Math.random() * 4; p.vy = 9; p.spin = 14;
            const pts = 150 * combo; score += pts;
            fx.text(p.x, p.y + 1.2, `Penguin +${fmt(pts)}`, { color: '#ffd447', size: 22 }); fx.stars(p.x, p.y, 12);
            snd.whack(0.8); snd.squawk(); buzz(25); cam.shake(5, 0.2);
          }
        }
        if (p.y < W.face(p.x) - 0.3 && p.vy < 0 && !p.splashed) { p.splashed = true; fx.splash(p.x, Math.max(0, W.face(p.x)), 10); }
      }
      for (let i = pens.length - 1; i >= 0; i--) if (pens[i].y < -6 || pens[i].x > W.xc + 30) pens.splice(i, 1);

      if (Y.state === 'ride') {
        const s = W.slope(Y.x), th = Math.atan(s);
        let a = (holding ? 30 : 0) - 15 * Math.sin(th) - 1.3 * Y.v;
        if (Y.x < 0) a += -Y.x * 10; // the wave carries him back from the flat water
        Y.v += a * dt; Y.x += Y.v * dt;
        Y.x = Math.max(-3, Y.x);
        if (Y.x >= W.xc) {
          if (Y.v > 3.5) { Y.x = W.xc; Y.y = W.h; launch(); }
          else { Y.x = W.xc - 0.05; Y.v = Math.min(0, Y.v); }
        }
        if (Y.state === 'ride') {
          Y.y = W.face(Y.x);
          // the board leans to the slope
          Y.rot += (th - Y.rot) * Math.min(1, dt * 14);
          if (Math.random() < Math.abs(Y.v) / 25) fx.burst(Y.x - 0.8, Y.y, { n: 1, color: ['#ffffff', '#bfefff'], speed: 2, up: 2.5, size: 0.14, life: 0.5, dir: Math.PI * 0.75, spread: 0.8 });
        }
        if (combo > 1 && t - lastTrickT > 9) { combo = 1; fx.text(Y.x, Y.y + 2.5, 'Combo lost', { color: '#cfe8ff', size: 16 }); }
      } else if (Y.state === 'air') {
        Y.airT += dt;
        Y.vx -= 5.5 * dt; Y.vy -= AIR_G * dt;
        Y.x = Math.max(-1.5, Y.x + Y.vx * dt); Y.y += Y.vy * dt; Y.peak = Math.max(Y.peak, Y.y);
        // hold to spin backwards; let go and the spin stops quickly
        const target = Y.spinHeld ? 8 : 0;
        Y.spinV += (target - Y.spinV) * Math.min(1, dt * (Y.spinHeld ? 10 : 7));
        Y.rot += Y.spinV * dt; Y.spun += Y.spinV * dt;
        const ground = W.face(Y.x);
        if (Y.vy < 0 && Y.y <= ground) {
          Y.y = ground;
          const th = Math.atan(W.slope(Y.x));
          const off = Math.abs(wrap(Y.rot - th));
          if (off < 0.62) {
            trickLanded(true);
            Y.state = 'ride'; Y.rot = th; Y.v = Y.x > W.xc ? -2 : -1.5; Y.spinV = 0;
            if (Y.x > W.xc) Y.x = W.xc - 0.2;
            fx.splash(Y.x, Y.y, 14); snd.splash();
          } else wipeout();
        }
      } else if (Y.state === 'wipe') {
        Y.wipeT += dt;
        if (Y.wipeT > 2) {
          Y.state = 'ride'; Y.x = W.xc * 0.3; Y.y = W.face(Y.x); Y.v = 0; Y.rot = Math.atan(W.slope(Y.x));
          fx.splash(Y.x, Y.y, 10);
        }
      }

      // camera keeps the whole wave in view and rises with big air
      const z = clamp(Math.min(ctx.W / (W.xc * 1.7 + 5), ctx.H * 0.46 / Math.max(2.6, W.h)), 16, 80);
      cam.zoomTo(z, dt, 1.5);
      const focusY = Math.max(W.h * 0.5, (Y.state === 'air' ? Y.y : 0) - ctx.H * 0.25 / cam.zoom);
      cam.follow(W.xc * 0.45, focusY, dt, 3);

      const left = Math.max(0, DURATION - t);
      ctx.hud({ left: `${fmt(score)} pts`, center: combo > 1 ? `Combo x${combo}` : '', right: `0:${String(Math.ceil(left)).padStart(2, '0')}` });
      if (!ended && t >= DURATION && (Y.state !== 'air' || t > DURATION + 4)) {
        ended = true; ctx.prompt('');
        snd.cheer();
        ctx.finish(score, score > 6000 ? 'Legendary surfing' : score > 2500 ? 'Great session' : 'The wave has gone flat');
      }
      if (tips === 0 && t > 3 && Y.x > W.xc * 0.6) { tips = 1; ctx.prompt('Hit the lip with speed to fly'); }
      if (tips === 1 && t > 12) ctx.prompt('');
    }

    function drawWave(g) {
      const xs = [];
      const xL = cam.left - 2, xR = cam.right + 2;
      // the face and back as one outline
      g.beginPath();
      const [sx0, sy0] = cam.toScreen(xL, -20); g.moveTo(sx0, sy0);
      for (let x = xL; x <= xR; x += 0.25) { const [sx, sy] = cam.toScreen(x, W.face(x)); g.lineTo(sx, sy); xs.push([x, sx, sy]); }
      const [sx1, sy1] = cam.toScreen(xR, -20); g.lineTo(sx1, sy1); g.closePath();
      const [, top] = cam.toScreen(0, W.h), [, bot] = cam.toScreen(0, 0);
      const gr = g.createLinearGradient(0, top, 0, bot + 40);
      gr.addColorStop(0, '#8fe6f4'); gr.addColorStop(0.25, '#3cc0e0'); gr.addColorStop(0.7, '#1279b2'); gr.addColorStop(1, '#0a5384');
      g.fillStyle = gr; g.fill();
      // foam streaks sliding down the face
      g.save(); g.clip();
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineCap = 'round';
      for (const f of foam) {
        const u = (f.u + t * 0.12) % 1, y = W.h * (1 - u) * 0.95;
        const x = W.xc * Math.pow(Math.max(0, y) / W.h, 1 / 2.2);
        const [ax, ay] = cam.toScreen(x - 0.4 - f.k * 1.5, y), [bx, by] = cam.toScreen(x + 0.6, y + 0.1);
        g.lineWidth = 2 + f.k * 3; g.globalAlpha = 0.3 + 0.5 * (1 - u);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      }
      g.restore();
      // the curling lip: a mass of water thrown forward over the face, tip pointing down
      const [cx, cy] = cam.toScreen(W.xc, W.h), L = W.h * cam.zoom;
      const yIn = W.h * 0.62, xIn = W.xc * Math.pow(yIn / W.h, 1 / 2.2);
      const [fx2, fy2] = cam.toScreen(xIn, yIn);
      const tipX = cx - L * 0.55, tipY = cy + L * 0.2;
      // the hollow under the curl (the barrel) is deep water, not sky
      const yB = W.h * 0.3, xB = W.xc * Math.pow(yB / W.h, 1 / 2.2), [bx2, by2] = cam.toScreen(xB, yB);
      const barrel = g.createLinearGradient(tipX, 0, fx2, 0); barrel.addColorStop(0, '#2c9fcc'); barrel.addColorStop(1, '#13709f');
      g.fillStyle = barrel;
      g.beginPath(); g.moveTo(tipX, tipY); g.quadraticCurveTo(tipX + L * 0.05, by2 - L * 0.05, bx2, by2);
      for (let y = yB; y <= yIn; y += W.h * 0.05) { const [px, py] = cam.toScreen(W.xc * Math.pow(y / W.h, 1 / 2.2), y); g.lineTo(px, py); }
      g.lineTo(fx2, fy2); g.quadraticCurveTo(cx - L * 0.38, cy + L * 0.04, tipX, tipY); g.fill();
      const lipGr = g.createLinearGradient(0, cy - L * 0.3, 0, fy2);
      lipGr.addColorStop(0, '#9becf6'); lipGr.addColorStop(1, '#2aa6d2');
      g.fillStyle = lipGr;
      g.beginPath(); g.moveTo(cx + L * 0.08, cy + L * 0.06);
      g.bezierCurveTo(cx + L * 0.04, cy - L * 0.3, cx - L * 0.45, cy - L * 0.26, tipX, tipY);
      g.quadraticCurveTo(cx - L * 0.38, cy + L * 0.04, fx2, fy2);
      g.lineTo(cx, cy + L * 0.02); g.closePath(); g.fill();
      // shadow under the curl so it reads as overhanging
      g.fillStyle = 'rgba(8,60,100,.28)';
      g.beginPath(); g.moveTo(tipX, tipY); g.quadraticCurveTo(cx - L * 0.38, cy + L * 0.04, fx2, fy2); g.lineTo(fx2 - L * 0.05, fy2 + L * 0.12); g.quadraticCurveTo(cx - L * 0.42, cy + L * 0.2, tipX, tipY); g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(3, L * 0.06); g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx + L * 0.08, cy + L * 0.04); g.bezierCurveTo(cx + L * 0.04, cy - L * 0.3, cx - L * 0.45, cy - L * 0.26, tipX, tipY); g.stroke();
      g.lineWidth = Math.max(1.5, L * 0.02); g.strokeStyle = 'rgba(255,255,255,.7)';
      g.beginPath(); g.moveTo(tipX, tipY); g.quadraticCurveTo(cx - L * 0.38, cy + L * 0.04, fx2, fy2); g.stroke();
      // spray off the lip
      if (Math.random() < 0.6) fx.burst(W.xc - W.h * 0.4 * Math.random(), W.h + W.h * 0.15, { n: 1, color: ['#ffffff', '#dff7ff'], speed: 2, up: 2, size: 0.12, life: 0.7, dir: Math.PI * 0.9, spread: 0.7, grav: 5 });
      // white water at the foot of the wave
      g.fillStyle = 'rgba(255,255,255,.55)';
      for (let i = 0; i < 9; i++) { const x = -1.5 + i * 0.5 + Math.sin(t * 3 + i) * 0.2, [px, py] = cam.toScreen(x, 0.1); g.beginPath(); g.ellipse(px, py, 10 + (i % 3) * 5, 4, 0, 0, TAU); g.fill(); }
    }
    function drawYeti(g) {
      if (Y.state === 'wipe') {
        const [sx, sy] = cam.toScreen(Y.wx - Y.wipeT * 1.5, Math.max(W.face(Y.wx) - 0.8, Y.wy - Y.wipeT * 3));
        sprite(g, 'yeti_fall', Math.min(9, Y.wipeT * 8), sx, sy, cam.zoom, { alpha: clamp(2.2 - Y.wipeT, 0, 1) });
        const [bx, by] = cam.toScreen(Y.wx + Y.wipeT * 2, Y.wy + Math.sin(Y.wipeT * 3) * 1.5);
        sprite(g, 'surfboard', 0, bx, by, cam.zoom, { anchor: 'center', rot: Y.wipeT * 5 });
        return;
      }
      const [sx, sy] = cam.toScreen(Y.x, Y.y);
      g.save(); g.translate(sx, sy); g.rotate(-Y.rot);
      sprite(g, 'surfboard', 0, 0, 0, cam.zoom);
      sprite(g, 'yeti_crouch', 0, -0.1 * cam.zoom, -0.22 * cam.zoom, cam.zoom * 0.95);
      g.restore();
    }
    function draw(g) {
      sky(g, ctx, ['#2f8fdc', '#7cc8f2', '#dff4ff']);
      // sun
      g.fillStyle = 'rgba(255,240,170,.9)'; g.beginPath(); g.arc(ctx.W * 0.82, ctx.H * 0.14, 26, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,240,170,.25)'; g.beginPath(); g.arc(ctx.W * 0.82, ctx.H * 0.14, 44, 0, TAU); g.fill();
      clouds(g, ctx, bgCam, { t, count: 5, seed: 8, y1: 0.3 });
      const horizon = Math.min(0.9, cam.sy_(0) / ctx.H) - 0.04;
      ridge(g, bgCam, { par: 0.1, yPar: 0, y: horizon, amp: 0.08, width: 140, seed: 41, color: '#5e9c7c', peaks: true });
      ridge(g, bgCam, { par: 0.25, yPar: 0, y: horizon + 0.012, amp: 0.035, width: 90, seed: 43, color: '#7cb894' });
      // open sea up to the horizon
      const hy = horizon * ctx.H + 2;
      const sg = g.createLinearGradient(0, hy, 0, ctx.H); sg.addColorStop(0, '#4fb8e2'); sg.addColorStop(1, '#0d5f94');
      g.fillStyle = sg; g.fillRect(0, hy, ctx.W, ctx.H - hy);
      drawWave(g);
      for (const p of pens) { const [px, py] = cam.toScreen(p.x, p.y); sprite(g, 'penguin', 0, px, py, Math.max(cam.zoom, 26), { anchor: 'center', rot: p.rot }); }
      drawYeti(g);
      fx.draw(g, cam);
      // where the yeti is when he flies above the screen
      if (Y.state === 'air') { const [px, py] = cam.toScreen(Y.x, Y.y); if (py < 0) { g.fillStyle = 'rgba(15,30,55,.6)'; g.beginPath(); g.moveTo(px, 6); g.lineTo(px - 9, 22); g.lineTo(px + 9, 22); g.fill(); } }
    }
    return {
      update, draw,
      down() { holding = true; if (Y.state === 'air') Y.spinHeld = true; },
      up() { holding = false; Y.spinHeld = false; if (tips === 0 && t > 0.5) ctx.prompt(''); },
    };
  },
};
