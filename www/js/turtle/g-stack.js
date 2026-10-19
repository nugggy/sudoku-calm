// Shell Stack: turtles and tortoises swing from a crane. Tap to drop each one onto the tower. Land it squarely:
// if the weight above any shell hangs past its edge, the tower topples. Three turtles may miss the tower.
import { FX, snd, buzz, clamp, pic, hearts, fillGrad, puffCloud } from './kit.js';

const NAMES = ['t_sea', 't_tort', 't_box'];

export default {
  id: 'stack', name: 'Shell Stack', blurb: 'Drop the swinging turtles onto a wobbly tower', unit: 'turtles', unit1: 'turtle',
  theme: ['#8fd2f2', '#d5f0fb', '#9bd07a'],
  how: [
    'A turtle swings from the crane. Tap to let it go and it drops straight down onto the tower.',
    'Land it right on top of the one below. A perfect drop snaps into place and earns a bonus.',
    'If too much weight hangs over the edge of any shell, the whole tower topples. If a turtle misses the tower completely you lose one of three tries.',
  ],
  thumb(g, w, h) {
    g.fillStyle = '#7cbf5a'; g.fillRect(0, h * 0.88, w, h);
    pic(g, 't_tort', w * 0.5, h * 0.78, h * 0.5); pic(g, 't_sea', w * 0.53, h * 0.55, h * 0.5); pic(g, 't_box', w * 0.47, h * 0.3, h * 0.45);
  },
  create(ctx) {
    const fx = new FX();
    const W = () => ctx.W, H = () => ctx.H;
    const PW = () => clamp(ctx.W * 0.34, 90, 170);     // piece width in px
    const PH = () => PW() * 0.42;                       // height a piece adds to the tower
    const ground = () => ctx.H * 0.86;
    const base = { x: 0, w: 0 };
    let tower = [], cur = null, fall = null, lost = [], camY = 0, lives = 3, t = 0, swingT = 0, ended = false, perfectRun = 0, score = 0, toppling = null, n = 0;
    const cam = { toScreen: (x, y) => [x, ground() - (y - camY)], zoom: 1 };
    const hud = () => ctx.hud({ left: ctx.best ? `Best ${ctx.best}` : '', right: `${score} stacked` });

    function layout() { base.x = ctx.W / 2; base.w = PW() * 1.15; }
    layout();
    function newPiece() { cur = { name: NAMES[n++ % NAMES.length] }; swingT = Math.random() * 2; }
    newPiece(); hud();
    ctx.prompt('Tap to drop');

    const topY = () => tower.length * PH();
    const topX = () => (tower.length ? tower[tower.length - 1].x : base.x);
    const topW = () => (tower.length ? PW() : base.w);
    const ropeLen = () => ctx.H * 0.16;
    const pivot = () => [ctx.W / 2, topY() + ctx.H * 0.62];
    const swingAng = () => Math.sin(swingT * (1.6 + Math.min(1.4, score * 0.06))) * 0.85;
    // the hook sweeps from side to side but never so far that the turtle leaves the screen
const hookPos = () => { const [px, py] = pivot(), a = swingAng(), reach = Math.max(10, ctx.W / 2 - PW() * 0.6); return [px + (Math.sin(a) / Math.sin(0.85)) * reach, py - Math.cos(a) * ropeLen()]; };

    function down() {
      if (ended || fall || !cur) return;
      ctx.prompt('');
      const [hx, hy] = hookPos();
      fall = { name: cur.name, x: hx, y: hy - PH() * 0.9, vy: 0 };
      cur = null; snd.swoosh();
    }

    // Is the tower stable? For every shell, the weight resting on it must be centred over it.
    function unstable() {
      for (let i = tower.length - 2; i >= -1; i--) {
        let sum = 0, k = 0;
        for (let j = i + 1; j < tower.length; j++) { sum += tower[j].x; k++; }
        const com = sum / k, cx = i < 0 ? base.x : tower[i].x, hw = (i < 0 ? base.w : PW()) / 2;
        if (Math.abs(com - cx) > hw * 0.98) return { at: i + 1, dir: Math.sign(com - cx) };
      }
      return null;
    }

    function land() {
      const dx = fall.x - topX(), w = PW();
      // misses the tower, or hangs so far over the edge that it slides straight off
      if (Math.abs(dx) > Math.min((topW() + w) / 2 * 0.82, topW() / 2 * 0.98)) {
        // missed the tower: it tumbles off
        lost.push({ ...fall, vx: Math.sign(dx || 1) * 60, rot: 0, vr: Math.sign(dx || 1) * 3 });
        lives--; perfectRun = 0; snd.fail(); buzz(40);
        fx.text(fall.x, fall.y + 30, 'Missed', { color: '#ffd0d0', size: 22 });
        fall = null;
        if (lives <= 0) { ended = true; ctx.finish(score, `${score} turtles stacked`); } else newPiece();
        return;
      }
      let x = fall.x, perfect = false;
      if (Math.abs(dx) < w * 0.07) { x = topX(); perfect = true; }
      tower.push({ name: fall.name, x });
      fall = null;
      score += 1;
      if (perfect) { perfectRun++; score += perfectRun >= 3 ? 1 : 0; snd.ding(perfectRun); fx.text(x, topY() + 20, perfectRun >= 3 ? 'Perfect +1' : 'Perfect', { color: '#ffd447', size: 24 }); fx.burst(x, topY(), { n: 10, color: ['#ffd447', '#fff3b0'], speed: 140, up: 60, size: 3, life: 0.7, grav: 200 }); buzz(15); }
      else { perfectRun = 0; snd.thud(); buzz(10); }
      const u = unstable();
      if (u) { toppling = { from: u.at, dir: u.dir, t: 0 }; ended = true; snd.fail(); buzz([40, 60, 40]); score = Math.max(0, u.at); ctx.finish(score, `The tower toppled at ${score} turtle${score === 1 ? '' : 's'}`); }
      else newPiece();
      hud();
    }

    function update(dt) {
      t += dt; swingT += dt; fx.update(dt);
      if (ctx.W / 2 !== base.x) layout();
      if (fall) { fall.vy += ctx.H * 2.4 * dt; fall.y -= fall.vy * dt; if (fall.y <= topY()) { fall.y = topY(); land(); } }
      for (const p of lost) { p.vy = (p.vy || 0) + ctx.H * 2.4 * dt; p.y -= p.vy * dt; p.x += p.vx * dt; p.rot += p.vr * dt; }
      lost = lost.filter((p) => p.y > camY - ctx.H);
      if (toppling) toppling.t += dt;
      const want = Math.max(0, topY() - ctx.H * 0.3);
      camY += (want - camY) * Math.min(1, dt * 3);
    }

    function drawPiece(g, name, x, y, rot = 0) {
      const [sx, sy] = cam.toScreen(x, y);
      pic(g, name, sx, sy - PH() * 0.5, PW(), { rot });
    }
    function draw(g) {
      const w = ctx.W, h = ctx.H;
      // the sky gets darker the higher the tower goes
      const k = clamp(camY / (ctx.H * 6), 0, 1);
      fillGrad(g, 0, 0, 0, h, [`hsl(${200 + k * 30} 70% ${78 - k * 45}%)`, `hsl(${195 + k * 20} 70% ${90 - k * 40}%)`]); g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.85)';
      for (let i = 0; i < 5; i++) puffCloud(g, ((i * 151) % w), ((i * 233 + camY * 0.3) % (h + 120)) - 60, 34 + (i % 3) * 10);
      const [, gy] = cam.toScreen(0, 0);
      fillGrad(g, 0, gy, 0, h, ['#8fcf63', '#5fa843']); g.fillRect(0, gy, w, Math.max(0, h - gy));
      // the base rock
      g.fillStyle = '#9c9488'; g.beginPath(); g.ellipse(base.x, gy, base.w / 2, PH() * 0.6, 0, Math.PI, 0); g.fill();
      // tower (leaning over when it topples)
      tower.forEach((p, i) => {
        let rot = 0, x = p.x, y = i * PH();
        if (toppling && i >= toppling.from) { const a = Math.min(1.4, toppling.t * toppling.t * 2.5) * toppling.dir, py = toppling.from * PH(), px = toppling.from ? tower[toppling.from - 1].x : base.x; const dx = x - px, dy = y - py; x = px + dx * Math.cos(a) + dy * Math.sin(a); y = py - dx * Math.sin(a) + dy * Math.cos(a); rot = a; }
        drawPiece(g, p.name, x, y, rot);
      });
      for (const p of lost) drawPiece(g, p.name, p.x, p.y, p.rot);
      if (fall) drawPiece(g, fall.name, fall.x, fall.y);
      // crane and swinging turtle
      if (cur && !ended) {
        const [px, py] = pivot(), [hx, hy] = hookPos(), [spx, spy] = cam.toScreen(px, py), [shx, shy] = cam.toScreen(hx, hy);
        g.fillStyle = '#e0a12f'; g.fillRect(0, spy - 8, w, 10);
        g.strokeStyle = '#4a4a4a'; g.lineWidth = 2; g.beginPath(); g.moveTo(spx, spy); g.lineTo(shx, shy); g.stroke();
        g.fillStyle = '#4a4a4a'; g.beginPath(); g.arc(shx, shy, 4, 0, Math.PI * 2); g.fill();
        pic(g, cur.name, shx, shy + PH() * 0.55, PW(), { rot: swingAng() * 0.3 });
        // a guide line to show where it will land
        g.strokeStyle = 'rgba(255,255,255,.35)'; g.setLineDash([4, 8]); g.beginPath(); g.moveTo(shx, shy + PH()); g.lineTo(shx, cam.toScreen(0, topY())[1]); g.stroke(); g.setLineDash([]);
      }
      fx.draw(g, cam);
      hearts(g, 18, h - 18, lives);
    }
    return { update, draw, down };
  },
};
