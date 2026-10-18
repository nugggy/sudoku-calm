// Icicle Climb: the yeti throws 12 icicles into an ice cliff and the penguin climbs them. A marker slides up and
// down the cliff; tap to throw an icicle at its height. The penguin can only hop up 1.2 m at a time, so icicles
// set too high wait unused (until a lower one bridges the gap) and icicles set too low waste a throw.
// Fish frozen in the ice are worth +2 m. Score is the height the penguin reaches, in metres.
import { Camera, FX, sprite, bone, sky, ridge, clouds, snd, buzz, clamp, lerp, fmt1, rng, roundRect } from './kit.js';

const GRAV = 9.8;
const WALL = 5.6;        // x of the cliff face
const REACH = 1.2;       // how high the penguin can hop
const ICICLES = 12;
const K = 0.8;           // icicle size (the sprite is 1.56 m long)
const TOP = 0.17;        // from an icicle's centre line to the surface the penguin stands on
const STAND_X = WALL - 0.7;
const THROW_FPS = 24, RELEASE = 6;

function fish(g, x, y, s, a = 1) {
  // a little fish frozen into the ice, facing left
  g.save(); g.globalAlpha = a; g.translate(x, y);
  g.fillStyle = '#ff9a3c'; g.strokeStyle = '#b4561a'; g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(0, 0, s, s * 0.48, 0, 0, 6.283); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(s * 0.8, 0); g.lineTo(s * 1.45, -s * 0.5); g.lineTo(s * 1.45, s * 0.5); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(-s * 0.5, -s * 0.1, s * 0.16, 0, 6.283); g.fill();
  g.fillStyle = '#222'; g.beginPath(); g.arc(-s * 0.53, -s * 0.1, s * 0.08, 0, 6.283); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(0, 0, s * 0.3, -1.2, 1.2); g.stroke();
  g.restore();
}

export default {
  id: 'icicle', name: 'Icicle Climb', blurb: 'Throw icicles into the cliff for the penguin to climb', unit: 'm',
  theme: ['#6c5fb8', '#c7a6e0', '#f4e9ff'],
  how: [
    'A marker slides up and down the ice cliff. Tap to throw an icicle at the marker\'s height.',
    'The penguin can only hop up 1.2 m at a time. The green band shows how far it can reach. An icicle above the band waits until a lower one bridges the gap, and an icicle below the penguin is wasted.',
    'You have 12 icicles and the marker speeds up after every throw. Grab the fish frozen in the ice for an extra 2 m, and watch out for snow flurries that make throws wobble.',
    'Your score is the height the penguin reaches.',
  ],
  thumb(g, w, h) {
    g.fillStyle = '#d9eefc'; g.fillRect(w * 0.68, 0, w * 0.32, h);
    g.fillStyle = '#fff'; g.fillRect(0, h * 0.86, w, h);
    [[0.78, 0.3], [0.62, 0.55], [0.7, 0.75]].forEach(([y, x]) => sprite(g, 'icicle', 0, w * x + w * 0.1, h * y, h * 0.22, { anchor: 'center', rot: -Math.PI / 2 }));
    sprite(g, 'penguin', 0, w * 0.6, h * 0.52, h * 0.28);
    sprite(g, 'yeti_throw', 6, w * 0.2, h * 0.98, h * 0.28);
  },
  create(ctx) {
    const R = rng((Math.random() * 1e9) | 0);
    const fx = new FX();
    const cam = new Camera(ctx, 40); cam.fx = 0; cam.fy = 0.95; cam.x = -1.3; cam.y = 0;
    const stuck = [];              // icicles in the wall: { y (centre), s (surface), used, state }
    const fishes = [[2.6, 5.4], [6.6, 9.6], [10.6, 13.6], [14.6, 17.6]].map(([a, b]) => ({ y: a + R() * (b - a), taken: false }));
    const P = { x: STAND_X, y: 0, hop: null, t: 0, look: 0 };
    let level = 0, bonus = 0, left = ICICLES, throws = 0, t = 0;
    let markY = 0.6, markDir = 1, throwT = -1, flying = null, busy = false, ended = false, endT = -1;
    let flurry = 0, nextFlurry = 6 + R() * 6, milestone = 5;
    const flakes = [];
    ctx.prompt('Tap to throw an icicle');

    const markLo = () => level + 0.25, markHi = () => level + 2.9;
    function speed() { return (1.5 + throws * 0.17) * (1 + 0.3 * Math.sin(t * 1.9)); }

    function throwIt() {
      if (busy || ended || left <= 0) return;
      busy = true; throwT = 0; left--; throws++;
      ctx.prompt(''); snd.swoosh();
      const target = markY;
      const spread = (0.06 + 0.045 * Math.max(0, target - level)) * (flurry > 0 ? 1.9 : 1);
      const wob = (R() + R() + R() - 1.5) * spread * 1.4;
      flying = { pending: true, target: target - TOP + wob };
    }
    function release() {
      const h = bone('yeti_throw', 'Middle1R', RELEASE);
      const x0 = 0.3 + h.x, y0 = h.y;
      const x1 = WALL - 0.55, y1 = flying.target;
      const T = clamp(0.32 + Math.abs(y1 - y0) * 0.02, 0.32, 0.6);
      Object.assign(flying, { pending: false, x: x0, y: y0, vx: (x1 - x0) / T, vy: (y1 - y0) / T + 0.5 * GRAV * T, T, age: 0, x1, y1 });
    }
    function land() {
      const y = flying.y1, s = y + TOP;
      const ic = { y, s, used: false, state: '', t: 0 };
      stuck.push(ic); flying = null;
      snd.crunch(); buzz(15); cam.shake(4, 0.2);
      fx.burst(WALL - 0.05, y, { n: 14, color: ['#ffffff', '#d8f1ff', '#a8dcff'], speed: 4, up: 1, size: 0.1, life: 0.6, dir: Math.PI, spread: 1.6 });
      if (s <= level + 0.05) { ic.state = 'low'; fx.text(WALL - 1.5, y + 0.5, 'Too low', { color: '#d6e2f0', size: 18 }); snd.fail(); }
      else if (s - level > REACH) { ic.state = 'high'; fx.text(WALL - 1.5, y + 0.5, 'Too high', { color: '#ff8a8a', size: 18 }); snd.thud(); }
      climb();
    }
    // hop to the highest icicle in reach, then look again (a too-high icicle may now be reachable)
    function climb() {
      const options = stuck.filter((c) => !c.used && c.state !== 'low' && c.s > level + 0.05 && c.s - level <= REACH);
      if (!options.length) { busy = false; afterTurn(); return; }
      const best = options.reduce((a, b) => (b.s > a.s ? b : a));
      // anything this skips past can no longer be used
      for (const c of stuck) if (!c.used && c.s <= best.s && c !== best) c.state = 'low';
      best.used = true; best.state = 'ok';
      P.hop = { x0: P.x, y0: P.y, x1: STAND_X, y1: best.s, t: 0, D: 0.42 };
      snd.boing(1 + level * 0.02);
    }
    function landed() {
      level = P.y;
      fx.snow(P.x, P.y, 8, 2.5);
      for (const f of fishes) if (!f.taken && Math.abs(f.y - (level + 0.5)) < 0.8) {
        f.taken = true; bonus += 2; fx.stars(WALL - 0.3, f.y, 14); fx.text(WALL - 1.2, f.y + 0.8, '+2 m fish!', { color: '#ffd447', size: 20 }); snd.ding(3); buzz([20, 30, 20]);
      }
      if (level + bonus >= milestone) { fx.text(STAND_X - 1, level + 1.6, `${milestone} m!`, { color: '#fff', size: 24 }); snd.ding(milestone / 5); milestone += 5; }
      climb();
    }
    function afterTurn() {
      if (left <= 0 && !ended) { endT = 0.9; }
      else if (!ended) ctx.prompt(throws < 2 ? 'Tap to throw an icicle' : '');
    }

    function update(dt) {
      t += dt; cam.update(dt); fx.update(dt);
      // marker
      if (!busy && !ended) {
        markY += markDir * speed() * dt;
        if (markY > markHi()) { markY = markHi(); markDir = -1; }
        if (markY < markLo()) { markY = markLo(); markDir = 1; }
      } else if (!busy) markY = clamp(markY, markLo(), markHi());
      // snow flurries now and then
      nextFlurry -= dt;
      if (nextFlurry <= 0 && flurry <= 0 && !ended) { flurry = 3.2; nextFlurry = 9 + R() * 8; snd.wind(2); fx.text(2.6, level + 3.4, 'Snow flurry!', { color: '#e8f4ff', size: 20 }); }
      if (flurry > 0) { flurry -= dt; for (let i = 0; i < 3; i++) flakes.push({ x: cam.left - 1, y: cam.bottom + R() * (cam.top - cam.bottom), v: 9 + R() * 6, s: 0.05 + R() * 0.08, t: 0 }); }
      for (const f of flakes) { f.x += f.v * dt; f.y += Math.sin(t * 6 + f.v) * dt * 1.5 - dt; f.t += dt; }
      for (let i = flakes.length - 1; i >= 0; i--) if (flakes[i].x > cam.right + 1) flakes.splice(i, 1);
      // throw
      if (throwT >= 0) { const before = throwT * THROW_FPS; throwT += dt; if (flying?.pending && before < RELEASE && throwT * THROW_FPS >= RELEASE) release(); if (throwT * THROW_FPS >= 11.9) throwT = -1; }
      if (flying && !flying.pending) {
        flying.age += dt; flying.vy -= GRAV * dt; flying.x += flying.vx * dt; flying.y += flying.vy * dt;
        if (flying.age >= flying.T) { flying.x = flying.x1; flying.y = flying.y1; land(); }
      }
      // penguin
      P.t += dt;
      if (P.hop) {
        const H = P.hop; H.t += dt; const k = Math.min(1, H.t / H.D);
        P.x = lerp(H.x0, H.x1, k); P.y = lerp(H.y0, H.y1, k) + Math.sin(k * Math.PI) * 0.7;
        if (k >= 1) { P.y = H.y1; P.hop = null; landed(); }
      }
      if (endT >= 0 && !ended) { endT -= dt; if (endT <= 0) finish(); }
      // camera: keep the yeti in view while the climb is low, then rise with the penguin
      const span = clamp(level + 4.8, 9, 14);
      cam.zoomTo(clamp(Math.min(ctx.W / (WALL + 2.4), ctx.H * 0.86 / span), 16, 70), dt, 3);
      cam.follow(-1.3, Math.max(0, level + 4.8 - 14 + 0.6), dt, 3);
      ctx.hud({ left: `Icicles ${left}`, center: `${fmt1(level + bonus)} m`, right: ctx.best ? `Best ${fmt1(ctx.best)} m` : '' });
    }
    function finish() {
      if (ended) return; ended = true; ctx.prompt('');
      const score = Math.round((level + bonus) * 10) / 10;
      const unused = stuck.filter((c) => c.state === 'high' && !c.used).length;
      if (score > (ctx.best || 0) && score > 0) snd.cheer(); else if (score < 5) snd.fail();
      ctx.finish(score, score >= 14 ? 'A champion climber' : unused ? `${unused} icicle${unused === 1 ? ' was' : 's were'} set too high to reach` : 'Out of icicles');
    }

    function drawCliff(g) {
      const [wx] = cam.toScreen(WALL, 0), [, gy] = cam.toScreen(0, 0);
      const gr = g.createLinearGradient(wx, 0, ctx.W, 0); gr.addColorStop(0, '#cfeaff'); gr.addColorStop(0.25, '#a9d6f5'); gr.addColorStop(1, '#7fb6e0');
      g.fillStyle = gr; g.fillRect(wx, 0, ctx.W - wx, gy + 2);
      // cracks and layers in the ice, fixed to the world so they scroll
      g.save(); g.beginPath(); g.rect(wx, 0, ctx.W - wx, gy); g.clip();
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2;
      const r = rng(77);
      for (let i = 0; i < 40; i++) {
        const y = i * 1.6 + r() * 0.8, x = WALL + 0.3 + r() * 2.2;
        const [sx, sy] = cam.toScreen(x, y);
        if (sy < -40 || sy > ctx.H + 40) continue;
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 10 + r() * 14, sy - 14 - r() * 20); g.lineTo(sx + 4 + r() * 20, sy - 40 - r() * 20); g.stroke();
      }
      g.strokeStyle = 'rgba(70,120,170,.18)'; g.lineWidth = 3;
      for (let y = 1; y < 60; y += 2.3) { const [, sy] = cam.toScreen(0, y); if (sy > -5 && sy < gy) { g.beginPath(); g.moveTo(wx, sy); g.lineTo(ctx.W, sy + 6); g.stroke(); } }
      g.restore();
      // the face edge
      g.fillStyle = '#eaf7ff'; g.fillRect(wx - 3, 0, 6, gy);
      // height ticks every metre on the face
      g.save(); g.font = '800 11px system-ui'; g.textAlign = 'left';
      for (let m = 1; m < 60; m++) {
        const [, sy] = cam.toScreen(0, m); if (sy < 0 || sy > gy) continue;
        g.fillStyle = 'rgba(40,90,140,.5)'; g.fillRect(wx + 3, sy - 1, m % 5 ? 8 : 16, 2);
        if (m % 5 === 0) { g.fillStyle = 'rgba(30,70,120,.75)'; g.fillText(`${m} m`, wx + 20, sy + 4); }
      }
      g.restore();
    }
    function drawIcicle(g, ic) {
      const [x, y] = cam.toScreen(WALL - 0.55, ic.y);
      sprite(g, 'icicle', 0, x, y, cam.zoom, { anchor: 'center', rot: -Math.PI / 2, scale: K, alpha: ic.state === 'low' ? 0.55 : 1 });
      if (ic.state === 'high' && !ic.used) {
        const [cx, cy] = cam.toScreen(WALL - 1.45, ic.y + 0.1), s = 6;
        g.save(); g.strokeStyle = '#e5484d'; g.lineWidth = 3.5; g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx - s, cy - s); g.lineTo(cx + s, cy + s); g.moveTo(cx + s, cy - s); g.lineTo(cx - s, cy + s); g.stroke(); g.restore();
      }
    }

    function draw(g) {
      sky(g, ctx, ['#2d2a6b', '#7a5aa8', '#e7a3c2', '#ffe0cf']);
      // a few stars high up
      g.fillStyle = 'rgba(255,255,255,.7)'; const sr = rng(5); for (let i = 0; i < 30; i++) { g.beginPath(); g.arc(sr() * ctx.W, sr() * ctx.H * 0.35, sr() * 1.4 + 0.3, 0, 6.283); g.fill(); }
      clouds(g, ctx, cam, { t, count: 4, seed: 12, y0: 0.12, y1: 0.4, alpha: 0.35, color: '#ffe9f2' });
      const gyF = Math.min(0.97, cam.sy_(0) / ctx.H);
      ridge(g, cam, { par: 0, yPar: 0, y: gyF - 0.03, amp: 0.3, width: 150, seed: 41, color: '#6f6aa8', snow: { above: 0.5, color: '#efe8ff' }, peaks: true });
      ridge(g, cam, { par: 0, yPar: 0, y: gyF + 0.005, amp: 0.1, width: 110, seed: 43, color: '#a99fd6' });
      const [, gy] = cam.toScreen(0, 0);
      if (gy < ctx.H) { const gg = g.createLinearGradient(0, gy, 0, ctx.H); gg.addColorStop(0, '#ffffff'); gg.addColorStop(1, '#dcd6f2'); g.fillStyle = gg; g.fillRect(0, gy, ctx.W, ctx.H - gy); }
      drawCliff(g);
      // fish frozen into the face
      for (const f of fishes) if (!f.taken) { const [x, y] = cam.toScreen(WALL + 0.45, f.y); fish(g, x, y, cam.zoom * 0.28, 0.85); }
      // the reach band and the marker
      if (!ended) {
        const [wx, b0] = cam.toScreen(WALL, level), [, b1] = cam.toScreen(WALL, level + REACH);
        g.fillStyle = 'rgba(90,220,130,.22)'; g.fillRect(wx - cam.zoom * 1.4, b1, cam.zoom * 1.4, b0 - b1);
        g.fillStyle = 'rgba(90,220,130,.7)'; g.fillRect(wx - cam.zoom * 1.4, b1 - 1, cam.zoom * 1.4, 2);
        if (!busy) {
          const ok = markY - level <= REACH;
          const [mx, my] = cam.toScreen(WALL, markY);
          g.save();
          g.strokeStyle = ok ? '#3ddc84' : '#ff6b6b'; g.lineWidth = 3; g.setLineDash([6, 5]);
          g.beginPath(); g.moveTo(mx - cam.zoom * 2.2, my); g.lineTo(mx + cam.zoom * 0.6, my); g.stroke(); g.setLineDash([]);
          g.fillStyle = ok ? '#3ddc84' : '#ff6b6b'; g.beginPath(); g.moveTo(mx - 2, my); g.lineTo(mx - 14, my - 8); g.lineTo(mx - 14, my + 8); g.closePath(); g.fill();
          g.beginPath(); g.arc(mx + cam.zoom * 0.25, my, 6 + Math.sin(t * 10) * 1.5, 0, 6.283); g.fill();
          g.restore();
        }
      }
      for (const ic of stuck) drawIcicle(g, ic);
      // the yeti and the pile of icicles left
      const [yx, yy] = cam.toScreen(0.3, 0);
      for (let i = 0; i < left; i++) { const [px, py] = cam.toScreen(-0.75 + (i % 4) * 0.2, 0.3 + Math.floor(i / 4) * 0.2); sprite(g, 'icicle', 0, px, py, cam.zoom, { anchor: 'center', rot: -Math.PI / 2 + 0.25 - (i % 3) * 0.12, scale: 0.42 }); }
      if (throwT >= 0) sprite(g, 'yeti_throw', Math.min(11, throwT * THROW_FPS), yx, yy, cam.zoom);
      else sprite(g, 'yeti_idle', (t * 8) % 8, yx, yy, cam.zoom);
      if (flying?.pending && throwT >= 0) { const h = bone('yeti_throw', 'Middle1R', Math.min(11, throwT * THROW_FPS)); const [hx, hy] = cam.toScreen(0.3 + h.x, h.y); sprite(g, 'icicle', 0, hx, hy, cam.zoom, { anchor: 'center', rot: -Math.PI / 2, scale: K * 0.9 }); }
      if (flying && !flying.pending) { const [fx1, fy1] = cam.toScreen(flying.x, flying.y); sprite(g, 'icicle', 0, fx1, fy1, cam.zoom, { anchor: 'center', rot: -Math.atan2(flying.vy, flying.vx) - Math.PI / 2, scale: K }); }
      // penguin
      const [px, py] = cam.toScreen(P.x, P.y);
      const bob = P.hop ? 0 : Math.abs(Math.sin(P.t * 3)) * 0.04 * cam.zoom;
      sprite(g, 'penguin', 0, px, py - bob, cam.zoom, { rot: P.hop ? Math.sin(P.hop.t * 20) * 0.25 : 0 });
      // snow flurry streaks
      g.fillStyle = 'rgba(255,255,255,.85)';
      for (const f of flakes) { const [x, y] = cam.toScreen(f.x, f.y); g.fillRect(x, y, Math.max(3, f.v * 1.4), Math.max(1.5, f.s * cam.zoom)); }
      fx.draw(g, cam);
      // where the yeti is when it has scrolled off the bottom
      if (yy > ctx.H + 10) { g.fillStyle = 'rgba(15,30,55,.55)'; roundRect(g, 10, ctx.H - 34, 92, 24, 12); g.fill(); g.fillStyle = '#fff'; g.font = '800 12px system-ui'; g.textAlign = 'center'; g.fillText('Yeti below', 56, ctx.H - 18); }
    }
    return { update, draw, down: throwIt };
  },
};
