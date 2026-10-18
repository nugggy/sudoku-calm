// Penguin Batting: the penguin jumps off an ice tower, the yeti swings a bat. Timing sets power and angle;
// then the penguin flies, bounces and belly-slides across the snow. Score is the distance in metres.
import { Camera, FX, Snowfall, sprite, bone, sky, ridge, clouds, distanceMarks, snd, buzz, clamp, fmt1, roundRect } from './kit.js';

const GRAV = 9.8;
const FPS = 30;          // swing animation speed (frames per second)
const CONTACT = 6.6;     // swing frame where the bat meets the penguin
const BAT_Y = 1.25;      // height of the sweet spot

export default {
  id: 'bat', name: 'Penguin Batting', blurb: 'Time the swing to whack the penguin as far as it will go', unit: 'm',
  theme: ['#7cc3f2', '#cfeaff', '#ffffff'],
  how: [
    'The penguin waddles to the edge of the ice tower and jumps. Tap anywhere to swing the bat.',
    'Hit it at waist height for the most power. Swing a little early to send it high, a little late to send it low and skimming.',
    'After it lands the penguin bounces and slides on its belly. Your score is how far it goes.',
  ],
  thumb(g, w, h) {
    g.fillStyle = '#fff'; g.fillRect(0, h * 0.78, w, h);
    sprite(g, 'yeti_swing', 7, w * 0.3, h * 0.92, h * 0.3);
    sprite(g, 'penguin', 0, w * 0.75, h * 0.42, h * 0.3, { rot: 0.9, anchor: 'center' });
  },
  create(ctx) {
    // start framed on the tower and the yeti; zoom so both fit the width
    const z0 = clamp(ctx.W / 7.2, 30, 70);
    const cam = new Camera(ctx, z0); cam.fx = 0.5; cam.fy = 0.8; cam.x = -1.3; cam.y = 1.6;
    const fx = new FX(), snow = new Snowfall(60, 4);
    // the penguin: waiting on top of the tower, falling, flying, sliding, stopped
    const P = { x: -2.7, y: 4.3, vx: 0, vy: 0, rot: 0, spin: 0, state: 'wait', waitT: 1.2 + Math.random() * 1.6, bounces: 0, best: 0 };
    const Ye = { swing: -1, done: false, mood: null, moodT: 0 };
    let t = 0, ended = false, result = '';
    ctx.hud({ left: ctx.best ? `Best ${fmt1(ctx.best)} m` : '', right: '0.0 m' });
    ctx.prompt('Get ready…');

    function swing() {
      if (Ye.swing >= 0) return;
      Ye.swing = 0; snd.swoosh(); ctx.prompt('');
    }
    function contact() {
      Ye.done = true;
      // only a penguin that has started falling and is near the bat can be hit
      const near = (P.state === 'fall' || P.state === 'wait') && Math.abs(P.x - 0.95) < 1.3;
      const dy = P.y - BAT_Y;
      const q = near ? 1 - Math.abs(dy) / 0.95 : -1;
      if (q <= 0) { snd.swoosh(); result = P.state === 'wait' ? 'Swung before the penguin jumped' : 'A clean miss'; if (P.state === 'wait') { P.state = 'fall'; P.vx = 0.8; P.vy = 1.5; } return; }
      const perfect = q > 0.9;
      const speed = 16 + 30 * Math.pow(q, 1.35) + (perfect ? 4 : 0);
      const ang = clamp(0.62 + dy * 0.75, 0.08, 1.35); // early (penguin still high) sends it up, late sends it low
      P.state = 'fly'; P.vx = Math.cos(ang) * speed; P.vy = Math.sin(ang) * speed; P.spin = 8 + speed * 0.4;
      snd.whack(Math.min(1, q + 0.2)); buzz(perfect ? [30, 30, 50] : 25); cam.shake(perfect ? 12 : 6, 0.35);
      fx.stars(P.x, P.y, perfect ? 18 : 10);
      fx.text(P.x + 0.3, P.y + 1.2, perfect ? 'Perfect!' : q > 0.7 ? 'Great hit' : q > 0.4 ? 'Good' : 'Clipped it', { color: perfect ? '#ffd447' : '#fff', size: perfect ? 30 : 22 });
    }

    function update(dt) {
      t += dt; cam.update(dt); fx.update(dt);
      if (Ye.swing >= 0) {
        const before = Ye.swing * FPS; Ye.swing += dt; const now = Ye.swing * FPS;
        if (!Ye.done && before < CONTACT && now >= CONTACT) contact();
      }
      if (Ye.mood) Ye.moodT += dt;
      if (P.state === 'wait') {
        P.waitT -= dt;
        // little waddle to the edge, then a hop
        P.x = -2.7 + Math.min(0.55, (1 - Math.max(0, P.waitT) / 3) * 0.55);
        if (P.waitT <= 0) { P.state = 'fall'; P.vx = 2.75 + Math.random() * 0.35; P.vy = 2.4; snd.pop(); ctx.prompt('Tap to swing!'); }
      } else if (P.state === 'fall') {
        P.vy -= GRAV * dt; P.x += P.vx * dt; P.y += P.vy * dt; P.rot += dt * 1.5;
        if (P.y <= 0.45) { P.y = 0.45; P.state = 'stop'; P.rot = Math.PI / 2; fx.snow(P.x, 0, 10, 3); snd.thud(); ctx.prompt(''); if (!result) result = 'The penguin landed at the yeti\'s feet'; finish(); }
      } else if (P.state === 'fly') {
        const sp = Math.hypot(P.vx, P.vy), drag = 0.0016 * sp;
        P.vx -= P.vx * drag * dt * 10; P.vy -= (GRAV + P.vy * drag * 10) * dt;
        P.x += P.vx * dt; P.y += P.vy * dt; P.rot += P.spin * dt;
        if (Math.random() < 0.5) fx.burst(P.x, P.y, { n: 1, color: 'rgba(255,255,255,.7)', speed: 0.3, up: 0, size: 0.12, life: 0.5, grav: 0 });
        if (P.y <= 0.35) {
          P.y = 0.35;
          const hard = -P.vy;
          if (hard > 6 && P.bounces < 3) { P.bounces++; P.vy = hard * 0.38; P.vx *= 0.78; P.spin *= 0.6; fx.snow(P.x, 0, 16, 5); snd.thud(); cam.shake(5, 0.2); }
          else { P.state = 'slide'; P.vy = 0; fx.snow(P.x, 0, 12, 4); snd.crunch(); }
        }
      } else if (P.state === 'slide') {
        P.vx = Math.max(0, P.vx - 4.2 * dt);
        P.x += P.vx * dt; P.rot += (Math.PI / 2 - (P.rot % (Math.PI * 2))) * Math.min(1, dt * 8);
        if (Math.random() < P.vx / 20) fx.burst(P.x - 0.3, 0.05, { n: 1, color: '#fff', speed: 1.5, up: 1.5, size: 0.14, life: 0.5, dir: Math.PI * 0.8, spread: 0.6 });
        if (P.vx <= 0.05) { P.state = 'stop'; result = P.x > 120 ? 'What a whack!' : P.x > 60 ? 'Nice hit' : 'Keep practising your timing'; finish(); }
      }
      // camera: frame the tower at the start, then chase the penguin and zoom out as it climbs
      if (P.state === 'fly' || P.state === 'slide' || (P.state === 'stop' && P.x > 3)) {
        cam.fx += (0.4 - cam.fx) * Math.min(1, dt * 2); cam.follow(P.x, Math.max(2, P.y * 0.55), dt, 5);
        cam.zoomTo(clamp(ctx.H * 0.62 / Math.max(6, P.y + 4), 14, 50), dt, 2.5);
      } else { cam.follow(-1.3, 1.6, dt, 4); cam.zoomTo(z0, dt); }
      const d = Math.max(0, P.x);
      ctx.hud({ left: ctx.best ? `Best ${fmt1(ctx.best)} m` : '', right: `${fmt1(d)} m` });
    }
    function finish() {
      if (ended) return; ended = true;
      const d = Math.max(0, P.x);
      Ye.mood = d > 60 ? 'yeti_yes' : d > 15 ? 'yeti_wave' : 'yeti_no'; Ye.moodT = 0;
      if (d > 60) snd.cheer(); else if (d < 15) snd.fail();
      ctx.finish(Math.round(d * 10) / 10, result);
    }

    function drawTower(g) {
      // a chunky block of ice the penguin stands on
      const [x0, y0] = cam.toScreen(-3.9, 0), [x1, y1] = cam.toScreen(-2.05, 4.3);
      const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, '#9fd4f2'); gr.addColorStop(1, '#e3f5ff');
      g.fillStyle = gr; g.strokeStyle = '#6aa8d0'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + (x1 - x0) * 0.08, y1); g.lineTo(x1, y1 + 4); g.lineTo(x1 + 4, y0); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse((x0 + x1) / 2, y1, (x1 - x0) * 0.55, 7, 0, 0, 6.283); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0 + 12, y0 - 10); g.lineTo(x0 + 18, y1 + 20); g.stroke();
    }
    function draw(g) {
      sky(g, ctx, ['#5fb2ec', '#a9daf8', '#e8f6ff']);
      clouds(g, ctx, cam, { t, count: 6, seed: 5 });
      const gyF = Math.min(0.97, cam.sy_(0) / ctx.H); // ground line as a fraction of the screen; the hills sink with it, then stay
      ridge(g, cam, { par: 0.05, yPar: 0, y: gyF - 0.06, amp: 0.36, width: 230, seed: 11, color: '#93b8dc', snow: { above: 0.45, color: '#f2f9ff' }, peaks: true });
      ridge(g, cam, { par: 0.15, yPar: 0, y: gyF - 0.02, amp: 0.2, width: 170, seed: 17, color: '#b4d2ee', snow: { above: 0.55, color: '#ffffff' } });
      ridge(g, cam, { par: 0.4, yPar: 0, y: gyF + 0.005, amp: 0.07, width: 120, seed: 23, color: '#d9ebf8' });
      // snow field
      const [, gy] = cam.toScreen(0, 0);
      const gr = g.createLinearGradient(0, gy, 0, ctx.H); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#d4e8f7');
      g.fillStyle = gr; g.fillRect(0, gy, ctx.W, ctx.H - gy);
      g.fillStyle = 'rgba(120,170,215,.25)'; g.fillRect(0, gy, ctx.W, 3);
      distanceMarks(g, cam, 0, { every: cam.zoom > 30 ? 10 : 25, from: 10 });
      // best-distance flag
      if (ctx.best > 0) { const [bx, by] = cam.toScreen(ctx.best, 0); if (bx > -40 && bx < ctx.W + 40) { g.fillStyle = '#e5484d'; g.fillRect(bx - 2, by - 54, 4, 54); g.beginPath(); g.moveTo(bx + 2, by - 54); g.lineTo(bx + 32, by - 45); g.lineTo(bx + 2, by - 36); g.fill(); g.font = '800 11px system-ui'; g.fillStyle = '#e5484d'; g.textAlign = 'center'; g.fillText('BEST', bx, by - 58); } }
      drawTower(g);
      // the yeti
      const [yx, yy] = cam.toScreen(0, 0);
      let name = 'yeti_idle', f = (t * 8) % 8;
      if (Ye.mood && Ye.swing * FPS >= 13) { name = Ye.mood; f = Math.min(9, Ye.moodT * 10) % 10; }
      else if (Ye.swing >= 0) { name = 'yeti_swing'; f = Math.min(13, Ye.swing * FPS); }
      sprite(g, name, f, yx, yy, cam.zoom);
      if (name === 'yeti_swing' || name === 'yeti_idle') {
        const h = bone(name, 'Middle1L', f), e = bone(name, 'LowerArmL', f);
        let dx = h.x - e.x, dy = h.y - e.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        // the bat points along the forearm, held at the hand
        const bx = h.x + dx * 0.62, by = h.y + dy * 0.62;
        const [sx, sy] = cam.toScreen(bx, by);
        sprite(g, 'bat', 0, sx, sy, cam.zoom, { anchor: 'center', rot: -Math.atan2(dy, dx) });
      }
      // shadow and penguin
      const [px, py] = cam.toScreen(P.x, P.y);
      if (P.state !== 'wait') { const [shx, shy] = cam.toScreen(P.x, 0); const a = clamp(1 - P.y / 30, 0.15, 0.5); g.fillStyle = `rgba(40,80,130,${a})`; g.beginPath(); g.ellipse(shx, shy + 2, cam.zoom * 0.45, cam.zoom * 0.12, 0, 0, 6.283); g.fill(); }
      if (P.state === 'wait') sprite(g, 'penguin', 0, ...cam.toScreen(P.x, 4.3 + Math.abs(Math.sin(t * 9)) * 0.06), cam.zoom, { rot: Math.sin(t * 9) * 0.08 });
      else sprite(g, 'penguin', 0, px, py, Math.max(cam.zoom, 30), { anchor: 'center', rot: P.rot }); // never smaller than ~30 px so it stays readable
      fx.draw(g, cam);
      snow.draw(g, ctx, cam, t);
      // off-screen pointer while the penguin is far above the view
      if (py < 0) { g.fillStyle = 'rgba(15,30,55,.6)'; roundRect(g, px - 30, 6, 60, 22, 11); g.fill(); g.fillStyle = '#fff'; g.font = '800 12px system-ui'; g.textAlign = 'center'; g.fillText(`↑ ${Math.round(P.y)} m`, px, 21); }
    }
    return { update, draw, down: swing };
  },
};
