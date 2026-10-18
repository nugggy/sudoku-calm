// Flamingo Golf: the yeti swings a flamingo like a golf club. Lock an angle, lock the power, and drive the penguin
// across the savanna. Five shots, each from where the last one stopped. The course repeats every 400 m, so you
// can learn it: giraffes fling you on, snakes bounce you up, acacias and elephants block low shots, and vultures
// grab penguins that fly too high. Score is the total distance in metres.
import { Camera, FX, sprite, bone, sky, ridge, clouds, distanceMarks, snd, buzz, clamp, fmt1, roundRect, arrow } from './kit.js';

const G = 9.8;
const SHOTS = 5;
const FPS = 30, CONTACT = 6.6;
const PERIOD = 400;
const VULTURE_HEIGHT = 15;   // penguins above this near an acacia get grabbed
// one stretch of course; it repeats every PERIOD metres
const PATTERN = [
  { k: 'giraffe', x: 55 }, { k: 'acacia', x: 130 }, { k: 'snake', x: 178 }, { k: 'elephant', x: 232 },
  { k: 'giraffe', x: 287 }, { k: 'snake', x: 322 }, { k: 'acacia', x: 366 },
];
const tri = (t, p) => { const f = (t / p) % 1; return f < 0.5 ? f * 2 : 2 - f * 2; }; // 0..1..0 sweep

// A far-off flat-topped tree silhouette.
function farTree(g, x, y, s, c) {
  g.fillStyle = c;
  g.fillRect(x - s * 0.04, y - s * 0.55, s * 0.08, s * 0.55);
  g.beginPath(); g.ellipse(x, y - s * 0.6, s * 0.55, s * 0.12, 0, 0, 6.283); g.fill();
}

export default {
  id: 'flamingo', name: 'Flamingo Golf', blurb: 'Drive the penguin across the savanna with a flamingo for a club', unit: 'm',
  theme: ['#f6c46b', '#fbe3a6', '#d9b45a'],
  how: [
    'Tap to stop the swinging arrow at the angle you want, then tap again to stop the power bar. The yeti swings the flamingo and off goes the penguin.',
    'You get five shots, and each one starts where the penguin stopped. Your score is the total distance.',
    'Giraffes catch penguins that fly past their heads and fling them further. Snakes on the ground bounce them up again.',
    'Acacia trees and elephants block low shots, and a vulture sits on every acacia ready to grab a penguin that flies too high. The course repeats every 400 m, so learn it and pick your angles.',
  ],
  thumb(g, w, h) {
    g.fillStyle = '#d9b45a'; g.fillRect(0, h * 0.82, w, h);
    sprite(g, 'acacia', 0, w * 0.82, h * 0.86, h * 0.1);
    sprite(g, 'giraffe', 0, w * 0.6, h * 0.86, h * 0.13);
    sprite(g, 'flamingo', 0, w * 0.22, h * 0.86, h * 0.3);
    sprite(g, 'penguin', 0, w * 0.4, h * 0.4, h * 0.22, { rot: 0.8, anchor: 'center' });
  },
  create(ctx) {
    const fx = new FX();
    const z0 = clamp(ctx.W / 7, 30, 66);
    const cam = new Camera(ctx, z0); cam.fx = 0.45; cam.fy = 0.8; cam.x = 0; cam.y = 1.4;
    // course features for the first few laps
    const F = [];
    for (let lap = 0; lap < 6; lap++) for (const p of PATTERN) F.push({ k: p.k, x: lap * PERIOD + p.x, used: -1 });
    const vultures = F.filter((f) => f.k === 'acacia').map((f) => ({ tree: f, x: f.x + 2.6, y: 5.75, state: 'perch', t: 0, used: -1 }));
    const P = { x: 0, y: 0, vx: 0, vy: 0, rot: 0, spin: 0, state: 'tee', held: null, heldT: 0 };
    let shot = 0, phase = 'aim', phaseT = 0, angle = 0.6, power = 0, swingT = -1, contacted = false, waitT = 0, t = 0, ended = false;
    let yetiX = -0.95, best = ctx.best, shotStart = 0, lastLine = '';

    const hud = () => ctx.hud({ left: `Shot ${Math.min(shot + 1, SHOTS)} of ${SHOTS}`, center: best ? `Best ${fmt1(best)} m` : '', right: `${fmt1(Math.max(0, P.x))} m` });
    hud();
    ctx.prompt('Tap to set the angle');

    function down() {
      if (phase === 'aim') { phase = 'power'; phaseT = 0; snd.tick(); ctx.prompt('Tap to set the power'); }
      else if (phase === 'power') { phase = 'swing'; swingT = 0; contacted = false; snd.swoosh(); ctx.prompt(''); }
    }

    function launch() {
      const sweet = power > 0.9;
      const speed = 11 + 27 * power + (sweet ? 2 : 0);
      P.state = 'fly'; P.vx = Math.cos(angle) * speed; P.vy = Math.sin(angle) * speed; P.spin = 6 + speed * 0.35; P.y = 0.5;
      snd.whack(0.4 + power * 0.6); snd.squawk(); buzz(sweet ? [25, 30, 40] : 22); cam.shake(sweet ? 10 : 5, 0.3);
      fx.burst(P.x, 0.6, { n: 14, color: ['#ff8fb3', '#ffd0df', '#ffffff'], speed: 5, up: 2, size: 0.13, life: 0.8 }); // feathers
      if (sweet) fx.text(P.x + 0.5, 2.6, 'Sweet spot!', { color: '#ffd447', size: 26 });
    }

    function nextShot() {
      shot++;
      if (shot >= SHOTS) { finish(); return; }
      phase = 'aim'; phaseT = 0; swingT = -1; P.state = 'tee'; P.y = 0; P.vx = P.vy = 0; P.rot = 0;
      shotStart = P.x; yetiX = P.x - 0.95;
      fx.dust(yetiX, 0, 10);
      ctx.prompt('Tap to set the angle');
      hud();
    }
    function finish() {
      if (ended) return; ended = true; phase = 'done';
      const d = Math.max(0, P.x);
      if (d > 500) snd.cheer(); else if (d < 150) snd.fail();
      ctx.finish(Math.round(d * 10) / 10, d > 600 ? 'A round to remember' : d > 400 ? 'Lovely round' : lastLine || 'Learn the course and try again');
    }

    // ---------- course interactions while the penguin is moving ----------
    function interact(dt) {
      for (const f of F) {
        if (Math.abs(f.x - P.x) > 8) continue;
        const dx = P.x - f.x;
        if (f.k === 'giraffe' && f.used !== shot && P.state === 'fly') {
          const hx = f.x + 1.25, hy = 5.05;
          if (Math.hypot(P.x - hx, P.y - hy) < 1.5) {
            f.used = shot; P.state = 'held'; P.held = f; P.heldT = 0; P.vx = Math.max(16, Math.hypot(P.vx, P.vy) * 0.9);
            snd.pop(); buzz(20); fx.text(hx, hy + 1.4, 'Giraffe fling!', { color: '#ffd447', size: 22 }); lastLine = 'The giraffes were on your side';
          }
        } else if (f.k === 'acacia') {
          if (P.state === 'fly' && Math.abs(dx) < 4.8 && P.y > 3.3 && P.y < 5.7) { // into the canopy: stuck, then drops
            P.vx = 0; P.vy = Math.min(0, P.vy) * 0.2; P.state = 'drop'; snd.crunch(); cam.shake(5, 0.2);
            fx.burst(P.x, P.y, { n: 18, color: ['#6e8f3a', '#86a84a', '#a5732e'], speed: 4, up: 2, size: 0.16, life: 1, grav: 6 });
            fx.text(P.x, P.y + 1.2, 'Stuck in a tree', { size: 20 }); lastLine = 'An acacia caught the penguin';
          } else if ((P.state === 'fly' || P.state === 'slide') && Math.abs(dx) < 0.45 && P.y < 3.3) { // the trunk
            P.x = f.x - 0.46 * Math.sign(P.vx || 1); P.vx = -P.vx * 0.25; snd.thud(); fx.dust(P.x, P.y, 8);
          }
        } else if (f.k === 'elephant' && f.used !== shot && (P.state === 'fly' || P.state === 'slide') && Math.abs(dx) < 2.2 && P.y < 3.3) {
          f.used = shot; P.x = f.x - 2.25; P.vx = -Math.abs(P.vx) * 0.35 - 1; P.vy = Math.max(3.5, Math.abs(P.vy) * 0.5); P.state = 'fly';
          snd.boing(0.6); cam.shake(8, 0.3); buzz(30); fx.dust(P.x, 1.5, 14);
          fx.text(f.x, 4.2, 'Bounced off an elephant', { size: 20 }); lastLine = 'Elephants make poor fairways';
        } else if (f.k === 'snake' && Math.abs(dx) < 1.0 && P.y < 1.2 && ((P.state === 'fly' && P.vy < 0) || P.state === 'slide')) {
          if (f.used === shot && f.cool > 0) continue;
          f.used = shot; f.cool = 0.4; P.state = 'fly'; P.vy = Math.max(9.5, Math.abs(P.vy) * 1.05); P.vx = Math.max(P.vx, 10); P.y = 1.2;
          snd.boing(1.3); buzz(20); fx.stars(P.x, 1, 10); fx.text(P.x, 2.6, 'Snake bounce!', { color: '#9cf28f', size: 22 });
        }
        if (f.cool) f.cool = Math.max(0, f.cool - dt);
      }
      // vultures: grab a penguin flying high near their tree
      for (const v of vultures) {
        if (v.state === 'perch' && P.state === 'fly' && v.used !== shot && P.y > VULTURE_HEIGHT && Math.abs(P.x - v.tree.x) < 22) {
          v.state = 'chase'; v.used = shot; snd.squawk();
        }
      }
    }

    function updateVultures(dt) {
      for (const v of vultures) {
        v.t += dt;
        if (v.state === 'chase') {
          const dx = P.x - v.x, dy = P.y - v.y, d = Math.hypot(dx, dy);
          if (P.state !== 'fly') { v.state = 'home'; continue; }
          const sp = 26 * dt; v.x += dx / d * Math.min(sp, d); v.y += dy / d * Math.min(sp, d);
          if (d < 1.1) {
            v.state = 'carry'; v.t = 0; v.fromX = P.x; v.fromY = P.y; P.state = 'carried'; P.held = v;
            snd.squawk(); buzz([20, 20, 40]); cam.shake(6, 0.25); fx.text(P.x, P.y + 1.5, 'Vulture!', { color: '#ff8a5c', size: 26 });
            lastLine = 'A vulture took a liking to the penguin';
          }
        } else if (v.state === 'carry') {
          const k = Math.min(1, v.t / 1.3), e = k * k * (3 - 2 * k);
          v.x = v.fromX + 9 * e; v.y = v.fromY + (3.2 - v.fromY) * e;
          P.x = v.x; P.y = v.y - 0.9; P.rot = Math.sin(t * 14) * 0.3;
          if (k >= 1) { v.state = 'home'; P.state = 'fly'; P.vx = 4; P.vy = 0; P.held = null; snd.pop(); }
        } else if (v.state === 'home') {
          const hx = v.tree.x + 2.6, hy = 5.75, dx = hx - v.x, dy = hy - v.y, d = Math.hypot(dx, dy);
          if (d < 0.3) { v.state = 'perch'; v.x = hx; v.y = hy; } else { const sp = 12 * dt; v.x += dx / d * Math.min(sp, d); v.y += dy / d * Math.min(sp, d); }
        }
      }
    }

    function update(dt) {
      t += dt; phaseT += dt; cam.update(dt); fx.update(dt);
      if (phase === 'aim') angle = 0.09 + tri(phaseT, 2.0) * (1.31 - 0.09);   // about 5 to 75 degrees
      if (phase === 'power') power = tri(phaseT + 0.0001, 1.25);
      if (phase === 'swing') {
        const before = swingT * FPS; swingT += dt; const now = swingT * FPS;
        if (!contacted && before < CONTACT && now >= CONTACT) { contacted = true; launch(); phase = 'fly'; }
      } else if (swingT >= 0) swingT += dt;
      updateVultures(dt);
      if (P.state === 'fly') {
        const sp = Math.hypot(P.vx, P.vy), drag = 0.0014 * sp;
        P.vx -= P.vx * drag * dt * 10; P.vy -= (G + P.vy * drag * 10) * dt;
        P.x += P.vx * dt; P.y += P.vy * dt; P.rot += P.spin * dt;
        if (Math.random() < 0.4) fx.burst(P.x, P.y, { n: 1, color: 'rgba(255,255,255,.6)', speed: 0.3, up: 0, size: 0.1, life: 0.45, grav: 0 });
        if (P.y <= 0.35) {
          P.y = 0.35;
          if (-P.vy > 5) { P.vy = -P.vy * 0.36; P.vx *= 0.74; P.spin *= 0.6; fx.dust(P.x, 0, 12); snd.thud(); }
          else { P.state = 'slide'; P.vy = 0; fx.dust(P.x, 0, 10); snd.crunch(); }
        }
      } else if (P.state === 'drop') {
        P.vy -= G * dt; P.y += P.vy * dt; P.rot += dt * 4;
        if (P.y <= 0.35) { P.y = 0.35; P.state = 'slide'; P.vx = 0; snd.thud(); fx.dust(P.x, 0, 8); }
      } else if (P.state === 'held') { // in a giraffe's mouth, then flung forward
        P.heldT += dt; const f = P.held;
        P.x = f.x + 1.35; P.y = 4.9 + Math.sin(P.heldT * 18) * 0.12; P.rot = Math.sin(P.heldT * 12) * 0.4;
        if (P.heldT > 0.55) { P.state = 'fly'; P.vy = 9.5; P.spin = 12; snd.whack(0.6); cam.shake(6, 0.25); fx.stars(P.x, P.y, 10); }
      } else if (P.state === 'slide') {
        P.vx = Math.sign(P.vx) * Math.max(0, Math.abs(P.vx) - 5.5 * dt);
        P.x += P.vx * dt; P.rot += (Math.PI / 2 - (((P.rot % 6.283) + 6.283) % 6.283)) * Math.min(1, dt * 8);
        if (Math.random() < Math.abs(P.vx) / 16) fx.dust(P.x - 0.3 * Math.sign(P.vx), 0.05, 1);
        if (Math.abs(P.vx) <= 0.05) {
          P.state = 'stop'; waitT = 0;
          // like a golf drop: a penguin resting under a tree or an elephant is moved to just in front of it
          const under = F.find((f) => (f.k === 'acacia' && Math.abs(P.x - f.x) < 5.8) || (f.k === 'elephant' && Math.abs(P.x - f.x) < 2.6));
          if (under) { P.x = under.x - (under.k === 'acacia' ? 14 : 7); fx.dust(P.x, 0, 10); fx.text(P.x, 3.4, 'Free drop', { size: 16 }); }
          const gain = P.x - shotStart;
          fx.text(P.x, 2.2, `${gain >= 0 ? '+' : ''}${fmt1(gain)} m`, { color: '#fff', size: 20 });
        }
      }
      if (P.state === 'fly' || P.state === 'slide' || P.state === 'held' || P.state === 'drop') interact(dt);
      if (P.state === 'stop' && phase !== 'done') { waitT += dt; if (waitT > 1.1) nextShot(); }

      // camera
      if (phase === 'aim' || phase === 'power' || phase === 'swing') {
        cam.fx += (0.45 - cam.fx) * Math.min(1, dt * 3); cam.fy += (0.8 - cam.fy) * Math.min(1, dt * 3);
        cam.follow(P.x, 1.4, dt, 4); cam.zoomTo(z0, dt, 3);
      } else {
        cam.fx += (0.4 - cam.fx) * Math.min(1, dt * 2); cam.fy += (0.76 - cam.fy) * Math.min(1, dt * 2);
        cam.follow(P.x, Math.max(1.6, P.y * 0.5), dt, 5);
        cam.zoomTo(clamp(ctx.H * 0.55 / Math.max(6, P.y + 5), 9, z0 * 0.9), dt, 2.5);
      }
      hud();
    }

    // ---------- drawing ----------
    function drawFeature(g, f) {
      const [sx, sy] = cam.toScreen(f.x, 0), z = cam.zoom;
      if (sx < -14 * z || sx > ctx.W + 14 * z) return;
      if (f.k === 'giraffe') sprite(g, 'giraffe', 0, sx, sy, z);
      else if (f.k === 'acacia') sprite(g, 'acacia', 0, sx, sy, z);
      else if (f.k === 'elephant') sprite(g, 'elephant', 0, sx, sy, z);
      else if (f.k === 'snake') sprite(g, 'snake', 0, sx, sy, z, { scale: 1 + (f.cool > 0 ? f.cool : 0) * 0.6 });
    }
    function drawMap(g) { // a strip showing the next stretch of course, so the pattern can be learnt
      const w = Math.min(ctx.W - 24, 330), x0 = (ctx.W - w) / 2, y0 = 44, span = 420, from = P.x - 20;
      g.save();
      g.fillStyle = 'rgba(70,45,10,.45)'; roundRect(g, x0, y0, w, 30, 10); g.fill();
      g.beginPath(); roundRect(g, x0, y0, w, 30, 10); g.clip();
      g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x0, y0 + 24, w, 2);
      for (const f of F) {
        const u = (f.x - from) / span; if (u < -0.05 || u > 1.05) continue;
        const sx = x0 + u * w, sy = y0 + 25;
        const name = f.k, sz = { giraffe: 4.2, acacia: 3.6, elephant: 5.2, snake: 11 }[name];
        sprite(g, name, 0, sx, sy, sz);
      }
      const pu = (P.x - from) / span;
      g.fillStyle = '#ffd447'; g.beginPath(); g.arc(x0 + pu * w, y0 + 22, 4, 0, 6.283); g.fill();
      g.restore();
    }

    function draw(g) {
      sky(g, ctx, ['#6fb7e8', '#bfe2f2', '#fbe8b8']);
      const sunX = ctx.W * 0.82, sunY = ctx.H * 0.22;
      const sg = g.createRadialGradient(sunX, sunY, 4, sunX, sunY, 70); sg.addColorStop(0, 'rgba(255,252,230,1)'); sg.addColorStop(0.35, 'rgba(255,240,180,.7)'); sg.addColorStop(1, 'rgba(255,230,150,0)');
      g.fillStyle = sg; g.beginPath(); g.arc(sunX, sunY, 70, 0, 6.283); g.fill();
      clouds(g, ctx, cam, { t, count: 5, seed: 13, alpha: 0.8 });
      const gyF = Math.min(0.97, cam.sy_(0) / ctx.H);
      ridge(g, cam, { par: 0.03, yPar: 0, y: gyF - 0.05, amp: 0.3, width: 400, seed: 51, color: '#a7a5c9', snow: { above: 0.72, color: '#f4f6ff' }, peaks: true });
      ridge(g, cam, { par: 0.1, yPar: 0, y: gyF - 0.01, amp: 0.08, width: 220, seed: 57, color: '#b9b07a' });
      // far trees
      const par = 0.25, spacing = 110, off = cam.x * cam.zoom * par;
      for (let i = Math.floor(off / spacing) - 1; i < (off + ctx.W) / spacing + 1; i++) {
        const k = Math.sin(i * 91.7) * 43758.5453, r = k - Math.floor(k);
        if (r < 0.35) continue;
        farTree(g, i * spacing - off + r * 50, gyF * ctx.H + 1, 30 + r * 26, '#8f8a4a');
      }
      ridge(g, cam, { par: 0.4, yPar: 0, y: gyF + 0.004, amp: 0.035, width: 140, seed: 61, color: '#cdb064' });
      // the grassy ground
      const gy = cam.sy_(0);
      const gr = g.createLinearGradient(0, gy, 0, ctx.H); gr.addColorStop(0, '#d9b45a'); gr.addColorStop(1, '#a8842e');
      g.fillStyle = gr; g.fillRect(0, gy, ctx.W, ctx.H - gy);
      g.strokeStyle = 'rgba(120,90,20,.45)'; g.lineWidth = 1.3;
      const step = 1.7, first = Math.floor(cam.left / step) * step;
      for (let x = first; x < cam.right + step; x += step) {
        const k = Math.sin(x * 4.13) * 43758.5453, r = k - Math.floor(k), [sx] = cam.toScreen(x + r, 0), s = cam.zoom * (0.2 + r * 0.25);
        g.beginPath(); g.moveTo(sx, gy); g.lineTo(sx - s * 0.3, gy - s); g.moveTo(sx, gy); g.lineTo(sx + s * 0.25, gy - s * 0.9); g.stroke();
      }
      distanceMarks(g, cam, 0, { every: cam.zoom > 22 ? 25 : 50, from: 25, color: '#7a5a16' });
      if (best > 0) { const [bx, by] = cam.toScreen(best, 0); if (bx > -40 && bx < ctx.W + 40) { g.fillStyle = '#e5484d'; g.fillRect(bx - 2, by - 54, 4, 54); g.beginPath(); g.moveTo(bx + 2, by - 54); g.lineTo(bx + 32, by - 45); g.lineTo(bx + 2, by - 36); g.fill(); g.font = '800 11px system-ui'; g.textAlign = 'center'; g.fillText('BEST', bx, by - 58); } }
      for (const f of F) if (f.k !== 'snake') drawFeature(g, f);
      for (const f of F) if (f.k === 'snake') drawFeature(g, f);
      // vultures
      for (const v of vultures) {
        const [vx, vy] = cam.toScreen(v.x, v.y);
        if (vx < -60 || vx > ctx.W + 60) continue;
        const flying = v.state !== 'perch';
        sprite(g, 'vulture', 0, vx, vy, Math.max(cam.zoom, flying ? 24 : 0), { anchor: flying ? 'center' : 'ground', rot: flying ? Math.sin(v.t * 10) * 0.15 : 0, flip: v.state === 'home' && v.tree.x + 2.6 < v.x });
      }
      // the yeti and its flamingo club
      const [yx, yy] = cam.toScreen(yetiX, 0);
      let yn = 'yeti_idle', yf = (t * 8) % 8;
      if (swingT >= 0 && swingT * FPS < 14) { yn = 'yeti_swing'; yf = Math.min(13, swingT * FPS); }
      else if (P.state === 'stop' && phase !== 'aim' && waitT > 0.2) { yn = P.x - shotStart > 80 ? 'yeti_yes' : 'yeti_wave'; yf = (waitT * 10) % 8; }
      sprite(g, yn, yf, yx, yy, cam.zoom);
      if (yn === 'yeti_idle') { // at address: the flamingo rests head down by the penguin
        const h = bone(yn, 'Middle1L', yf);
        const [sx, sy] = cam.toScreen(yetiX + h.x, h.y);
        sprite(g, 'flamingo', 0, sx, sy, cam.zoom * 0.6, { rot: 2.55 });
      } else if (yn === 'yeti_swing') {
        const h = bone(yn, 'Middle1L', yf), e = bone(yn, 'LowerArmL', yf);
        let dx = h.x - e.x, dy = h.y - e.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        // held by the legs: its feet in the yeti's hand, head out along the forearm like a club
        const [sx, sy] = cam.toScreen(yetiX + h.x - dx * 0.1, h.y - dy * 0.1);
        sprite(g, 'flamingo', 0, sx, sy, cam.zoom * 0.72, { rot: Math.atan2(dx, dy) });
      }
      // penguin
      const [px, py] = cam.toScreen(P.x, P.y), psz = Math.max(cam.zoom, 28);
      if (P.state === 'tee') sprite(g, 'penguin', 0, px, py, cam.zoom, { rot: Math.sin(t * 3) * 0.04 });
      else { if (P.y > 1) { const [shx, shy] = cam.toScreen(P.x, 0); g.fillStyle = 'rgba(90,60,10,.3)'; g.beginPath(); g.ellipse(shx, shy + 2, psz * 0.4, psz * 0.1, 0, 0, 6.283); g.fill(); } sprite(g, 'penguin', 0, px, py, psz, { anchor: 'center', rot: P.rot }); }
      // aiming arrow and power bar
      if (phase === 'aim' || phase === 'power') {
        const [ax, ay] = cam.toScreen(P.x + 0.2, 0.5);
        arrow(g, ax, ay, angle, 60 + (phase === 'power' ? power * 70 : 30), phase === 'aim' ? '#ffd447' : '#9cf28f');
        g.save(); g.font = '800 13px system-ui'; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(40,25,5,.6)'; g.lineWidth = 3; g.textAlign = 'left';
        const label = `${Math.round(angle * 180 / Math.PI)}°`; g.strokeText(label, ax + 12, ay + 22); g.fillText(label, ax + 12, ay + 22); g.restore();
      }
      if (phase === 'power') {
        const w = Math.min(240, ctx.W * 0.62), x = (ctx.W - w) / 2, y = ctx.H - 70;
        g.save(); g.fillStyle = 'rgba(40,25,5,.55)'; roundRect(g, x - 4, y - 4, w + 8, 26, 13); g.fill();
        g.fillStyle = 'rgba(255,255,255,.18)'; roundRect(g, x, y, w, 18, 9); g.fill();
        g.fillStyle = 'rgba(120,240,140,.4)'; g.fillRect(x + w * 0.9, y, w * 0.1, 18);
        const gr2 = g.createLinearGradient(x, 0, x + w, 0); gr2.addColorStop(0, '#59d27a'); gr2.addColorStop(0.7, '#ffd447'); gr2.addColorStop(1, '#ff5a5f');
        g.fillStyle = gr2; roundRect(g, x, y, Math.max(18, w * power), 18, 9); g.fill();
        g.font = '800 11px system-ui'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText('POWER', ctx.W / 2, y - 9); g.restore();
      }
      fx.draw(g, cam);
      drawMap(g);
      if (py < 80 && P.y > 3) { g.fillStyle = 'rgba(70,45,10,.6)'; roundRect(g, px - 30, 80, 60, 22, 11); g.fill(); g.fillStyle = '#fff'; g.font = '800 12px system-ui'; g.textAlign = 'center'; g.fillText(`↑ ${Math.round(P.y)} m`, px, 95); }
    }
    return { update, draw, down };
  },
};
