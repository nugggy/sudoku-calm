// Freeride: a snowboard race down a mountain against ten belly-sliding penguins. Tap to jump, hold in the air
// to flip, land with the board along the slope. Ibex on the rocks launch you sky high. Bumping a penguin slows
// it, then makes it angry and faster. Score is trick points plus a bonus for your finishing place.
import { Camera, FX, Snowfall, sprite, sky, ridge, clouds, snd, buzz, clamp, fmt, rng, roundRect } from './kit.js';

const G = 9.8;
const DX = 0.5;              // terrain sample spacing (metres)
const FIN = 1450;            // finish line
const TAU = Math.PI * 2;
const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
const PLACE_BONUS = [3000, 2200, 1700, 1300, 1000, 800, 600, 450, 300, 150, 0];
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;

// Builds the mountain: long runs, moguls, kickers with a drop after the lip, and rocks with an ibex on top.
function buildCourse(seed) {
  const r = rng(seed);
  const ys = [], kickers = [], ibexes = [], trees = [];
  let y = 0;
  const push = (yy) => { ys.push(yy); y = yy; };
  // start: a gentle shelf before the drop-in
  for (let s = 0; s < 24; s += DX) push(-Math.tan(0.06) * s);
  let lastType = '';
  while (ys.length * DX < FIN + 160) {
    const x0 = ys.length * DX, y0 = y;
    if (x0 > FIN - 10) { // runout after the finish
      for (let s = DX; s <= 160; s += DX) push(y0 - Math.tan(0.07) * s);
      break;
    }
    const roll = r();
    let type = roll < 0.36 ? 'run' : roll < 0.6 ? 'kicker' : roll < 0.76 ? 'moguls' : roll < 0.9 ? 'ibex' : 'run';
    if (type === lastType && type !== 'run') type = 'run';
    if (x0 < 60) type = 'run';
    lastType = type;
    if (type === 'run') {
      const len = 30 + r() * 45, th = 0.22 + r() * 0.2, amp = r() * 0.5;
      for (let s = DX; s <= len; s += DX) push(y0 - Math.tan(th) * s + amp * Math.sin((TAU * s) / 14) * Math.sin((Math.PI * s) / len));
    } else if (type === 'moguls') {
      const len = 28 + r() * 14, th = 0.24;
      for (let s = DX; s <= len; s += DX) push(y0 - Math.tan(th) * s + 0.75 * Math.sin((TAU * s) / 7) * Math.sin((Math.PI * s) / len));
    } else if (type === 'kicker') {
      // run-in, a curved ramp, then the lip and a drop onto a steep landing
      const th = 0.24, R = 7, rise = 1.4 + r() * 0.5, drop = 2.5 + r() * 2.5;
      for (let s = DX; s <= 10; s += DX) push(y0 - Math.tan(th) * s);
      const yr = y;
      for (let s = DX; s <= R; s += DX) push(yr - Math.tan(th) * s + rise * Math.pow(s / R, 2));
      kickers.push({ x: ys.length * DX, y });
      const yl = y - rise - drop;
      for (let s = DX; s <= 42; s += DX) push(yl - Math.tan(0.48) * s * Math.min(1, 0.45 + s / 16)); // long steep landing
    } else if (type === 'ibex') {
      const th = 0.18;
      for (let s = DX; s <= 8; s += DX) push(y0 - Math.tan(th) * s);
      const yb = y;
      for (let s = DX; s <= 6; s += DX) push(yb - Math.tan(th) * s + 1.3 * Math.sin((Math.PI * s) / 6));
      ibexes.push({ x: ys.length * DX - 3, used: false, t: 0 }); // on top of the rock
      for (let s = DX; s <= 12; s += DX) push(yb - Math.tan(th) * 6 - Math.tan(0.3) * s);
    }
  }
  for (let x = 20; x < FIN + 100; x += 6 + r() * 16) trees.push({ x, s: 0.8 + r() * 0.7, back: r() < 0.6 });
  const ground = (x) => {
    const i = x / DX;
    if (i <= 0) return ys[0] - (x < 0 ? x * 0.06 : 0);
    if (i >= ys.length - 1) return ys[ys.length - 1];
    const k = Math.floor(i), f = i - k;
    return ys[k] + (ys[k + 1] - ys[k]) * f;
  };
  const angle = (x) => Math.atan2(ground(x + 0.35) - ground(x - 0.35), 0.7);
  return { ys, ground, angle, kickers, ibexes, trees };
}

export default {
  id: 'freeride', name: 'Freeride', blurb: 'Race penguins down the mountain and throw tricks', unit: 'pts',
  theme: ['#6fb6ea', '#d4ecfb', '#ffffff'],
  how: [
    'The yeti races ten penguins down the mountain on a snowboard. Gravity does the steering.',
    'Tap to jump. Keep holding in the air to flip, and let go to stop. Land with the board along the slope or you will crash and lose speed.',
    'Jump off the kickers for big air. Ibex standing on the rocks will butt you high into the sky.',
    'Bumping a penguin slows it down, but it soon gets angry and speeds up. You score trick points plus a bonus for where you finish.',
  ],
  thumb(g, w, h) {
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, h * 0.45); g.lineTo(w, h * 0.95); g.lineTo(w, h); g.lineTo(0, h); g.fill();
    g.save(); g.translate(w * 0.4, h * 0.42); g.rotate(-0.15);
    sprite(g, 'snowboard', 0, 0, 0, h * 0.26); sprite(g, 'yeti_air', 2, 0, -h * 0.02, h * 0.24); g.restore();
    sprite(g, 'penguin', 0, w * 0.8, h * 0.8, h * 0.3, { anchor: 'center', rot: Math.PI / 2 + 0.4 });
  },
  create(ctx) {
    const C = buildCourse(Math.floor(Math.random() * 1e9));
    const cam = new Camera(ctx, clamp(ctx.W / 14, 18, 40)); cam.fx = 0.4; cam.fy = 0.5;
    const fx = new FX(), snow = new Snowfall(50, 13);
    let t = 0, score = 0, combo = 1, ended = false, finished = false, finishT = 0, place = 0, started = false, tipShown = false;
    const rider = (x, mu, k) => ({ x, y: C.ground(x), vx: 0, vy: 0, ground: true, mu, k, rot: C.angle(x), airT: 0 });
    const Y = Object.assign(rider(0, 0.022, 0.0017), { soft: true, state: 'ground', spinHeld: false, holdT: 0, spinV: 0, spun: 0, crashT: 0, peak: 0, bumpCd: 0 });
    const pens = Array.from({ length: 10 }, (_, i) => Object.assign(rider(6 - i * 1.6 + (i % 2) * 0.5, 0.024 + Math.random() * 0.016, 0.0018 + Math.random() * 0.0006), { slowT: 0, angryT: 0, cd: 0, done: false, finT: 0, rot: 0, id: i }));
    ctx.hud({ left: '0 pts', center: '', right: '' });

    // Moves one rider along the snow: glued to the ground unless the ground falls away beneath it.
    function step(r, dt, mu, k) {
      if (r.ground) {
        const th = C.angle(r.x), tx = Math.cos(th), ty = Math.sin(th);
        let s = r.vx * tx + r.vy * ty;
        s += (-G * Math.sin(th) - mu * G * Math.cos(th) * Math.sign(s || 1) - k * s * Math.abs(s)) * dt;
        if (s < 0.5 && th > -0.05) s = Math.max(0, s);
        if (s < 3 && r.push !== false) s += 4 * dt; // a little skate push so nobody gets stuck in a dip
        r.vx = s * tx; r.vy = s * ty;
        r.x += r.vx * dt; r.y += r.vy * dt;
        const gy = C.ground(r.x);
        if (r.y - gy > 0.22) { r.ground = false; r.airT = 0; return 'takeoff'; }
        r.y = gy;
      } else {
        r.airT += dt;
        r.vy -= G * dt; r.vx -= r.vx * 0.0008 * Math.abs(r.vx) * dt;
        r.x += r.vx * dt; r.y += r.vy * dt;
        const gy = C.ground(r.x);
        if (r.y <= gy) {
          r.y = gy;
          const th = C.angle(r.x), tx = Math.cos(th), ty = Math.sin(th);
          // landing on the snow soaks up some of the fall but keeps most of the speed
          const v = Math.hypot(r.vx, r.vy), along = v ? (r.vx * tx + r.vy * ty) / v : 1;
          const s = v * (r.soft ? 0.86 + 0.14 * Math.max(0, along) : 0.55 + 0.45 * Math.max(0, along)); // the yeti bends his knees
          r.vx = s * tx; r.vy = s * ty; r.ground = true;
          return 'land';
        }
      }
      return '';
    }

    function landYeti() {
      const th = C.angle(Y.x), off = Math.abs(wrap(Y.rot - th));
      const flips = Math.round(Math.abs(Y.spun) / TAU), air = Y.airT, height = Y.peak - C.ground(Y.x);
      if (air < 0.35 && flips === 0) { Y.rot = th; return; } // just a bump
      if (off > 0.65) { crash(); return; }
      Y.rot = th; fx.snow(Y.x, Y.y, 14, 5); snd.crunch();
      if (flips) { const b = 1 + 0.06 * flips; Y.vx *= b; Y.vy *= b; } // a clean flip gives a little burst of speed
      if (flips === 0 && air < 0.8) return;
      const pts = Math.round((flips * 500 + air * 60 + Math.max(0, height) * 8) * combo);
      score += pts;
      const name = flips >= 3 ? 'Triple flip!' : flips === 2 ? 'Double flip!' : flips === 1 ? 'Backflip' : air > 2 ? 'Huge air' : 'Nice air';
      fx.text(Y.x + 1, Y.y + 3, `${name} +${fmt(pts)}`, { color: flips >= 2 ? '#ffd447' : '#ffffff', size: flips >= 2 ? 26 : 21 });
      if (combo > 1) fx.text(Y.x + 1, Y.y + 4.2, `Combo x${combo}`, { color: '#7cf0c8', size: 17 });
      combo = Math.min(4, combo + (flips > 0 ? 1 : 0));
      snd.ding(flips * 2 + combo); buzz(flips >= 2 ? [20, 30, 40] : 15);
      if (flips) fx.stars(Y.x, Y.y + 1, 8 + flips * 5);
    }
    function crash() {
      Y.state = 'crash'; Y.crashT = 0; combo = 1;
      const th = C.angle(Y.x); const s = Math.hypot(Y.vx, Y.vy) * 0.5;
      Y.vx = Math.cos(th) * s; Y.vy = Math.sin(th) * s; Y.ground = true; Y.y = C.ground(Y.x);
      fx.snow(Y.x, Y.y, 26, 7); snd.thud(); buzz([40, 30, 60]); cam.shake(10, 0.4);
      fx.text(Y.x, Y.y + 2.6, 'Crash!', { color: '#ff8a8a', size: 26 });
    }

    function update(dt) {
      t += dt; cam.update(dt); fx.update(dt);
      // countdown
      if (!started) {
        const c = 3 - Math.floor(t / 0.8);
        ctx.prompt(c > 0 ? String(c) : 'Go!');
        if (t >= 2.4) { started = true; snd.ding(5); setTimeout(() => { if (!tipShown) ctx.prompt('Tap to jump, hold in the air to flip'); }, 600); }
        else if (Math.floor((t - dt) / 0.8) !== Math.floor(t / 0.8)) snd.tick();
      }
      if (started) {
        // the yeti
        if (Y.state === 'crash') {
          Y.crashT += dt; step(Y, dt, 0.12, 0.004);
          if (Y.crashT > 1.0) { Y.state = 'ground'; Y.rot = C.angle(Y.x); }
        } else if (!finished || Y.x < FIN + 120) {
          const was = Y.ground;
          const ev = step(Y, dt, Y.mu, Y.k);
          if (ev === 'takeoff') { Y.state = 'air'; Y.spun = 0; Y.peak = Y.y; Y.spinV = 0; }
          if (!Y.ground) {
            Y.peak = Math.max(Y.peak, Y.y);
            if (Y.spinHeld) Y.holdT += dt;
            const target = Y.spinHeld && Y.holdT > 0.12 ? 7.2 : 0;
            Y.spinV += (target - Y.spinV) * Math.min(1, dt * (target ? 9 : 7));
            Y.rot += Y.spinV * dt; Y.spun += Y.spinV * dt;
            // when not flipping, the yeti eases the board towards the slope below to get ready to land
            if (target === 0 && Math.abs(Y.spinV) < 1.5) { const want = Y.rot + wrap(C.angle(Y.x + Y.vx * 0.3) - Y.rot); Y.rot += (want - Y.rot) * Math.min(1, dt * 2.6); }
          } else {
            if (!was && ev === 'land') { Y.state = 'ground'; landYeti(); }
            Y.rot += (C.angle(Y.x) - Y.rot) * Math.min(1, dt * 12);
            if (Math.random() < Math.hypot(Y.vx, Y.vy) / 40) fx.burst(Y.x - 0.6, Y.y + 0.05, { n: 1, color: '#fff', speed: 2, up: 2, size: 0.13, life: 0.5, dir: Math.PI * 0.8, spread: 0.6 });
          }
        }
        // ibex on the rocks
        for (const b of C.ibexes) {
          if (b.used) { b.t += dt; continue; }
          const by = C.ground(b.x);
          if (Y.state !== 'crash' && Math.abs(Y.x - b.x) < 1.1 && Y.y - by < 1.8 && Y.y - by > -0.5) {
            b.used = true; Y.ground = false; Y.state = 'air'; Y.vy = 17; Y.vx = Math.max(Y.vx, 13); Y.spun = 0; Y.peak = Y.y; Y.airT = 0;
            score += 100; fx.text(Y.x, Y.y + 2.5, 'Ibex launch! +100', { color: '#ffd447', size: 24 }); fx.stars(Y.x, Y.y + 0.5, 14);
            snd.boing(0.8); snd.whack(0.5); buzz([25, 25, 40]); cam.shake(8, 0.3);
          }
        }
        // penguins: belly slide; far leaders tire a little and stragglers try harder, so the race stays close
        for (const p of pens) {
          if (p.done && p.x > FIN + 60) continue;
          p.slowT = Math.max(0, p.slowT - dt); p.angryT = Math.max(0, p.angryT - dt); p.cd = Math.max(0, p.cd - dt);
          const gap = p.x - Y.x;
          let mu = p.mu, k = p.k;
          if (gap > 30) k *= 1 + Math.min(0.7, (gap - 30) / 90);
          if (gap < -40) k *= Math.max(0.8, 1 - (-gap - 40) / 220);
          if (p.slowT > 0) k *= 3;
          if (p.angryT > 0) { k *= 0.72; mu *= 0.6; }
          step(p, dt, mu, k);
          p.rot = p.ground ? Math.PI / 2 - C.angle(p.x) : p.rot + dt * 2;
          if (!p.done && p.x >= FIN) { p.done = true; p.finT = t; }
          // bumping into the yeti
          if (p.cd === 0 && Y.state !== 'crash' && Math.abs(p.x - Y.x) < 1.1 && Math.abs(p.y - Y.y) < 1.1) {
            p.cd = 3; p.slowT = 1.5; p.angryT = 7.5;
            Y.vx *= 0.9; Y.vy *= 0.9;
            score += 25; fx.text(p.x, p.y + 1.6, 'Bump +25', { color: '#fff', size: 18 }); fx.snow(p.x, p.y, 10, 4);
            snd.thud(); snd.squawk(); buzz(15);
          }
        }
        if (!finished && Y.x >= FIN) {
          finished = true; finishT = t;
          place = 1 + pens.filter((p) => p.done).length;
          const bonus = PLACE_BONUS[place - 1] || 0;
          score += bonus;
          fx.text(Y.x, Y.y + 3.5, `${ordinal(place)} place +${fmt(bonus)}`, { color: '#ffd447', size: 28 });
          fx.stars(Y.x, Y.y + 2, 30); snd.cheer(); buzz([30, 40, 60]);
          ctx.prompt(place === 1 ? 'You won the race!' : `Finished ${ordinal(place)}`);
        }
        if (finished && !ended && (t - finishT > 2.2)) {
          ended = true;
          ctx.finish(score, place === 1 ? 'First down the mountain' : `Finished ${ordinal(place)} of 11`);
        }
        if (!ended && t > 200) { ended = true; ctx.finish(score, 'Out of time'); }
      }
      // camera: look ahead downhill, zoom out with speed and height
      const sp = Math.hypot(Y.vx, Y.vy), above = Y.ground ? 0 : Math.max(0, Y.y - C.ground(Y.x));
      cam.zoomTo(clamp(ctx.W / (10 + sp * 0.16 + above * 0.8), 11, 44), dt, 2);
      cam.follow(Y.x + 1 + sp * 0.05, Y.y - 0.5 + above * 0.35, dt, 7);
      const ahead = pens.filter((p) => (p.done && (!finished || p.finT < finishT)) || (!p.done && !finished && p.x > Y.x)).length;
      const pos = finished ? place : 1 + ahead;
      ctx.hud({ left: `${fmt(score)} pts`, center: started ? `${ordinal(pos)} of 11` : '', right: started ? (finished ? 'Finished' : `${Math.max(0, Math.round(FIN - Y.x))} m to go`) : '' });
    }

    function drawPine(g, x, y, s, alpha = 1) {
      const z = cam.zoom * s, [sx, sy] = cam.toScreen(x, y);
      g.globalAlpha = alpha;
      g.fillStyle = '#6b4a2e'; g.fillRect(sx - z * 0.12, sy - z * 0.6, z * 0.24, z * 0.6);
      g.fillStyle = '#2f7a55';
      for (let i = 0; i < 3; i++) { const w = z * (1.1 - i * 0.25), yy = sy - z * (0.5 + i * 0.75); g.beginPath(); g.moveTo(sx - w, yy); g.lineTo(sx, yy - z * 1.15); g.lineTo(sx + w, yy); g.closePath(); g.fill(); }
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 3; i++) { const w = z * (0.5 - i * 0.1), yy = sy - z * (0.5 + i * 0.75) - z * 0.7; g.beginPath(); g.moveTo(sx - w, yy + z * 0.25); g.lineTo(sx, yy - z * 0.45); g.lineTo(sx + w, yy + z * 0.25); g.closePath(); g.fill(); }
      g.globalAlpha = 1;
    }
    function drawBanner(g, x, label, checker) {
      const gy = C.ground(x), [l1, b1] = cam.toScreen(x - 2.5, gy), [r1, b2] = cam.toScreen(x + 2.5, C.ground(x + 2.5));
      const hgt = 4.2 * cam.zoom;
      g.fillStyle = '#5b5f6b'; g.fillRect(l1 - 2, b1 - hgt, 4, hgt); g.fillRect(r1 - 2, b2 - hgt, 4, hgt);
      const top = Math.min(b1, b2) - hgt;
      if (checker) {
        const cw = (r1 - l1) / 10;
        for (let i = 0; i < 10; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#222' : '#fff'; g.fillRect(l1 + i * cw, top + j * cw * 0.9, cw + 0.5, cw * 0.9 + 0.5); }
      } else { g.fillStyle = '#e5484d'; g.fillRect(l1, top, r1 - l1, cam.zoom * 0.9); }
      g.font = `900 ${Math.max(11, cam.zoom * 0.6)}px system-ui, sans-serif`; g.textAlign = 'center';
      g.fillStyle = checker ? '#e5484d' : '#fff'; g.fillText(label, (l1 + r1) / 2, top + (checker ? -6 : cam.zoom * 0.66));
    }
    function draw(g) {
      sky(g, ctx, ['#4f9fe0', '#9fd2f5', '#eaf6ff']);
      clouds(g, ctx, cam, { t, count: 5, seed: 12, y1: 0.3 });
      ridge(g, cam, { par: 0.02, yPar: 0, y: 0.62, amp: 0.38, width: 210, seed: 61, color: '#92b6da', snow: { above: 0.45, color: '#f4faff' }, peaks: true });
      ridge(g, cam, { par: 0.06, yPar: 0, y: 0.72, amp: 0.2, width: 150, seed: 67, color: '#bcd5ec', snow: { above: 0.5, color: '#ffffff' } });
      // pines in the back row stand on a softer copy of the slope
      for (const tr of C.trees) if (tr.back && tr.x > cam.left - 5 && tr.x < cam.right + 5) drawPine(g, tr.x, C.ground(tr.x) + 2.2, tr.s * 0.8, 0.55);
      // the slope
      const x0 = cam.left - 2, x1 = cam.right + 2, stepX = 4 / cam.zoom;
      g.beginPath(); g.moveTo(...cam.toScreen(x0, C.ground(x0) - 400));
      for (let x = x0; x <= x1; x += stepX) g.lineTo(...cam.toScreen(x, C.ground(x)));
      g.lineTo(...cam.toScreen(x1, C.ground(x1) - 400)); g.closePath();
      const [, gy] = cam.toScreen(Y.x, Y.y);
      const gr = g.createLinearGradient(0, gy - 40, 0, gy + ctx.H * 0.6); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#c8def2');
      g.fillStyle = gr; g.fill();
      g.strokeStyle = '#9cc4e6'; g.lineWidth = 2;
      g.beginPath(); for (let x = x0; x <= x1; x += stepX) { const [sx, sy] = cam.toScreen(x, C.ground(x)); if (x === x0) g.moveTo(sx, sy); else g.lineTo(sx, sy); } g.stroke();
      // kicker lips get a little red flag
      for (const k of C.kickers) if (k.x > x0 && k.x < x1) { const [sx, sy] = cam.toScreen(k.x, k.y); g.fillStyle = '#555'; g.fillRect(sx - 1, sy - cam.zoom * 1.6, 2, cam.zoom * 1.6); g.fillStyle = '#e5484d'; g.beginPath(); g.moveTo(sx + 1, sy - cam.zoom * 1.6); g.lineTo(sx + cam.zoom * 0.8, sy - cam.zoom * 1.35); g.lineTo(sx + 1, sy - cam.zoom * 1.1); g.fill(); }
      for (const tr of C.trees) if (!tr.back && tr.x > cam.left - 5 && tr.x < cam.right + 5) drawPine(g, tr.x, C.ground(tr.x), tr.s * 0.7, 1);
      drawBanner(g, 2, 'START', false);
      drawBanner(g, FIN, 'FINISH', true);
      // ibex on their rocks
      for (const b of C.ibexes) {
        if (b.x < x0 - 4 || b.x > x1 + 4) continue;
        const by = C.ground(b.x), [sx, sy] = cam.toScreen(b.x, by);
        g.fillStyle = '#8a8f99'; g.beginPath(); g.ellipse(sx, sy + 4, cam.zoom * 1.4, cam.zoom * 0.7, 0, Math.PI, TAU); g.fill();
        if (!b.used) sprite(g, 'ibex', 0, sx, sy - 2, cam.zoom, { flip: true });
        else { const [ix, iy] = cam.toScreen(b.x - b.t * 3, by + b.t * 2 - b.t * b.t * 4); sprite(g, 'ibex', 0, ix, iy, cam.zoom, { flip: true, rot: -b.t * 4, alpha: clamp(1.5 - b.t, 0, 1) }); }
      }
      // penguins
      for (const p of pens) {
        if (p.x < x0 - 3 || p.x > x1 + 3) continue;
        const [px, py] = cam.toScreen(p.x, p.y + 0.32);
        sprite(g, 'penguin', 0, px, py, cam.zoom, { anchor: 'center', rot: p.rot });
        if (p.angryT > 0) { // red steam from an angry penguin
          g.strokeStyle = `rgba(230,60,60,${Math.min(1, p.angryT)})`; g.lineWidth = 2; g.lineCap = 'round';
          for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2, ox = px - cam.zoom * (0.2 + i * 0.25), oy = py - cam.zoom * 0.6 - ((a * 6) % 14); g.beginPath(); g.moveTo(ox, oy); g.quadraticCurveTo(ox + 4, oy - 5, ox, oy - 10); g.stroke(); }
        }
      }
      // the yeti
      const [sx, sy] = cam.toScreen(Y.x, Y.y);
      if (Y.state === 'crash') {
        sprite(g, 'yeti_fall', Math.min(9, Y.crashT * 9), sx, sy, cam.zoom);
        const [bx, by] = cam.toScreen(Y.x + 1 + Y.crashT * 2, Y.y + 1 + Math.sin(Y.crashT * 4) * 0.8);
        sprite(g, 'snowboard', 0, bx, by, cam.zoom, { anchor: 'center', rot: Y.crashT * 9 });
      } else {
        g.save(); g.translate(sx, sy); g.rotate(-Y.rot);
        sprite(g, 'snowboard', 0, 0, 0, cam.zoom);
        if (Y.ground) sprite(g, 'yeti_crouch', 0, -0.1 * cam.zoom, -0.1 * cam.zoom, cam.zoom * 0.95);
        else sprite(g, 'yeti_air', (t * 8) % 6, 0, -0.05 * cam.zoom, cam.zoom * 0.9);
        g.restore();
      }
      fx.draw(g, cam);
      snow.draw(g, ctx, cam, t);
      // progress bar along the bottom: you and the penguins
      const bw = ctx.W - 40, by0 = ctx.H - 18;
      g.fillStyle = 'rgba(15,30,55,.45)'; roundRect(g, 18, by0 - 4, bw + 4, 10, 5); g.fill();
      for (const p of pens) { g.fillStyle = p.angryT > 0 ? '#ff6b6b' : '#1d2b3a'; g.beginPath(); g.arc(20 + bw * clamp(p.x / FIN, 0, 1), by0 + 1, 3, 0, TAU); g.fill(); }
      g.fillStyle = '#ffd447'; g.strokeStyle = '#1d2b3a'; g.lineWidth = 2; g.beginPath(); g.arc(20 + bw * clamp(Y.x / FIN, 0, 1), by0 + 1, 5.5, 0, TAU); g.fill(); g.stroke();
    }
    return {
      update, draw,
      down() {
        if (!started || finished) return;
        if (!tipShown && t > 3) { tipShown = true; ctx.prompt(''); }
        Y.spinHeld = true; Y.holdT = 0;
        if (Y.state === 'ground' && Y.ground) {
          // ollie: pop up off the slope (a kicker lip right ahead adds a little)
          const th = C.angle(Y.x), nearLip = C.kickers.some((k) => k.x - Y.x > -0.5 && k.x - Y.x < 3);
          const pop = nearLip ? 7.5 : 4.3;
          Y.vx += -Math.sin(th) * pop * 0.4; Y.vy += Math.cos(th) * pop;
          Y.ground = false; Y.state = 'air'; Y.airT = 0; Y.spun = 0; Y.peak = Y.y; Y.y += 0.05;
          snd.swoosh(); fx.snow(Y.x, Y.y, 6, 3);
        }
      },
      up() { Y.spinHeld = false; },
    };
  },
};
