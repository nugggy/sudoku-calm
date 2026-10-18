// Orca Splash: the penguin dives in, the orca leaps and tail-slaps it towards a target on an ice pillar.
// The launch is a little off, so the yeti throws snowballs at the flying penguin to knock it onto the bullseye.
// Five penguins; the score is the sum of the rings hit.
import { Camera, FX, Snowfall, sprite, bone, sky, clouds, ridge, snd, buzz, clamp, fmt } from './kit.js';

const G = 6.5;            // gentle gravity so there is time to aim
const ROUNDS = 5;
const BALLS = 2;          // snowballs per penguin
const YX = -3.7, FLOE = 0.55; // yeti position on the floe
const TX = 8.8, TY = 4.4;    // target centre
const RINGS = [[0.55, 100], [1.25, 50], [2.05, 25], [2.85, 10]];
const TR = RINGS[RINGS.length - 1][0];
const THROW_FPS = 30, RELEASE = 5;

export default {
  id: 'orca', name: 'Orca Splash', blurb: 'Snowball the flying penguin onto the bullseye', unit: 'pts',
  theme: ['#5fb4ea', '#bfe6fb', '#2f86c4'],
  how: [
    'The penguin dives in, and the orca leaps up and slaps it with its tail towards the target.',
    'The slap is never quite right. While the penguin is flying, tap where you want a snowball to go. A hit knocks the penguin in the direction you threw.',
    'You get two snowballs per penguin and five penguins. Watch the flag on the target for wind. The rings score 10, 25, 50 and 100.',
  ],
  thumb(g, w, h) {
    g.fillStyle = '#2f86c4'; g.fillRect(0, h * 0.72, w, h);
    sprite(g, 'orca', 0, w * 0.42, h * 0.86, h * 0.13, { rot: -0.35 });
    target(g, w * 0.84, h * 0.4, h * 0.26);
    sprite(g, 'penguin', 0, w * 0.6, h * 0.3, h * 0.24, { anchor: 'center', rot: 0.8 });
  },
  create(ctx) {
    const z0 = clamp(ctx.W / 17.6, 14, 36);
    const cam = new Camera(ctx, z0); cam.fx = 0; cam.fy = 0.7; cam.x = -5.7; cam.y = 0;
    const fx = new FX(), snow = new Snowfall(40, 12);
    let t = 0, round = 0, score = 0, ended = false, hits = { 100: 0, 50: 0, 25: 0, 10: 0 };
    const P = { x: 0, y: 0, vx: 0, vy: 0, rot: 0, state: 'idle' };
    const O = { t: -1, x: 3, y: -3, rot: 0, slapped: false };
    const Ye = { throwT: -1, pending: null };
    let balls = BALLS, wind = 0, phase = 'intro', phaseT = 0, stuck = null, splashes = [];
    const shots = [];

    function newRound() {
      round++; balls = BALLS; wind = Math.round((Math.random() * 2.4 - 1.2) * 10) / 10;
      P.x = YX + 0.9; P.y = FLOE; P.vx = 0; P.vy = 0; P.rot = 0; P.state = 'waddle';
      O.t = -1; O.slapped = false; stuck = null;
      phase = 'waddle'; phaseT = 0;
      ctx.prompt(round === 1 ? 'Here comes the orca…' : '');
      hud();
    }
    function hud() { ctx.hud({ left: `Penguin ${Math.min(round, ROUNDS)}/${ROUNDS}`, center: `${fmt(score)} pts`, right: `Snowballs ${balls}` }); }

    function launch() {
      // aim roughly at the bullseye, then spoil it a bit so the player has to help
      const sx = 1.2, sy = 1.1;
      const T = 1.75 + Math.random() * 0.35;
      let vx = (TX - sx) / T, vy = (TY - sy + 0.5 * G * T * T) / T;
      const miss = (Math.random() < 0.5 ? -1 : 1) * (0.08 + Math.random() * 0.13);
      vx *= 1 + miss * (Math.random() < 0.5 ? 1 : -0.6); vy *= 1 + miss;
      P.x = sx; P.y = sy; P.vx = vx; P.vy = vy; P.state = 'fly';
      snd.whack(0.7); buzz(20); cam.shake(6, 0.25);
      fx.splash(sx, 0, 14); fx.text(sx, sy + 1.2, 'Slap!', { size: 22 });
      ctx.prompt(balls ? 'Tap to throw a snowball' : '');
    }

    function throwAt(px, py) {
      if (balls <= 0 || P.state !== 'fly' || Ye.throwT >= 0) return;
      balls--; hud();
      const [wx, wy] = cam.toWorld(px, py);
      Ye.throwT = 0; Ye.pending = { wx, wy };
      ctx.prompt('');
    }
    function release() {
      const h = bone('yeti_throw', 'Middle1R', RELEASE);
      const sx = YX + h.x, sy = FLOE + h.y;
      let dx = Ye.pending.wx - sx, dy = Ye.pending.wy - sy; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      shots.push({ x: sx, y: sy, vx: dx * 28, vy: dy * 28, dx, dy, life: 1.2 });
      snd.swoosh();
    }

    function scoreHit(r) {
      for (const [rad, pts] of RINGS) if (r <= rad) return pts;
      return 0;
    }
    function landOnTarget() {
      const pts = scoreHit(Math.abs(P.y - TY)); // the board faces the penguin, so the height on it picks the ring
      P.state = 'stuck'; stuck = { y: P.y, t: 0 };
      P.x = TX - 0.45; P.vx = 0; P.vy = 0;
      score += pts; if (pts) hits[pts]++;
      hud();
      if (pts === 100) { fx.stars(P.x, P.y, 26); fx.text(P.x - 1.2, P.y + 1.4, 'Bullseye!', { color: '#ffd447', size: 32 }); snd.cheer(); buzz([30, 40, 60]); cam.shake(10, 0.4); }
      else if (pts) { fx.stars(P.x, P.y, 12); fx.text(P.x - 1, P.y + 1.2, `+${pts}`, { color: '#fff', size: 26 }); snd.ding(pts / 25); buzz(25); cam.shake(5, 0.25); }
      else { fx.text(P.x - 1, P.y + 1, 'Missed the rings', { size: 18 }); snd.thud(); }
      snd.thud();
      endRound(1.6);
    }
    function sploosh() {
      P.state = 'sunk'; fx.splash(P.x, 0, 26); snd.splash(); splashes.push({ x: P.x, t: 0 });
      fx.text(P.x, 1.4, 'Splash', { size: 18 });
      endRound(1.3);
    }
    function endRound(wait) { phase = 'after'; phaseT = -wait; ctx.prompt(''); }

    function update(dt) {
      t += dt; phaseT += dt; cam.update(dt); fx.update(dt);
      for (const s of splashes) s.t += dt; splashes = splashes.filter((s) => s.t < 1.2);
      if (phase === 'intro') { if (phaseT > 0.6) newRound(); }
      else if (phase === 'waddle') {
        // waddle to the edge of the floe, then dive in
        P.x = YX + 0.9 + Math.min(1.1, phaseT * 1.1); P.y = FLOE + Math.abs(Math.sin(t * 10)) * 0.05;
        if (phaseT > 1.1) { phase = 'dive'; phaseT = 0; P.state = 'dive'; P.vx = 2.6; P.vy = 3; snd.pop(); }
      } else if (phase === 'dive') {
        P.vy -= 9.8 * dt; P.x += P.vx * dt; P.y += P.vy * dt; P.rot += dt * 4;
        if (P.y < 0) { fx.splash(P.x, 0, 12); snd.splash(); P.state = 'under'; phase = 'orca'; phaseT = 0; O.t = 0; }
      } else if (phase === 'orca') {
        if (O.slapped) { phase = 'fly'; phaseT = 0; }
      } else if (phase === 'after') {
        if (stuck) { stuck.t += dt; if (stuck.t > 0.7) { P.y -= dt * 1.4; P.rot += dt * 0.6; } }
        if (phaseT >= 0) {
          if (round >= ROUNDS) finish();
          else newRound();
        }
      }
      // the orca leaps from the right, arcs up and slaps with its tail near the top of the leap, then dives back in
      if (O.t >= 0) {
        O.t += dt;
        const u = clamp(O.t / 1.5, 0, 1);
        O.x = 3.6 - u * 4.8; O.y = -2.4 + Math.sin(u * Math.PI) * 4.2; O.rot = (u - 0.5) * 1.5;
        if (u > 0.04 && !O.splash1) { O.splash1 = true; fx.splash(3.4, 0, 18); snd.splash(); }
        if (!O.slapped && u >= 0.42) { O.slapped = true; launch(); }
        if (u >= 1) { O.splash1 = false; fx.splash(O.x, 0, 22); snd.splash(); O.t = -1; }
      }
      if (phase === 'fly') {
        if (P.state === 'fly') {
          P.vx += wind * dt; P.vy -= G * dt; P.x += P.vx * dt; P.y += P.vy * dt; P.rot += dt * 5;
          if (Math.random() < 0.5) fx.burst(P.x, P.y, { n: 1, color: 'rgba(255,255,255,.7)', speed: 0.3, up: 0, size: 0.1, life: 0.4, grav: 0 });
          // the board face
          if (P.x >= TX - 0.45 && P.x - P.vx * dt < TX - 0.45 + 0.01 && Math.abs(P.y - TY) <= TR + 0.3) landOnTarget();
          else if (P.y <= 0) sploosh();
          else if (P.x > TX + 4 || P.x < -12) sploosh();
        }
      }
      if (Ye.throwT >= 0) {
        const before = Ye.throwT * THROW_FPS; Ye.throwT += dt; const now = Ye.throwT * THROW_FPS;
        if (before < RELEASE && now >= RELEASE && Ye.pending) release();
        if (now >= 11.9) Ye.throwT = -1;
      }
      for (const s of shots) {
        s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
        if (P.state === 'fly' && Math.hypot(s.x - P.x, s.y - P.y) < 0.75) {
          s.life = 0; P.vx += s.dx * 5.5; P.vy += s.dy * 5.5;
          fx.snow(s.x, s.y, 16, 5); snd.whack(0.45); buzz(18); cam.shake(4, 0.2);
          fx.text(P.x, P.y + 1, 'Hit!', { size: 20, color: '#bfe6ff' });
          if (balls) ctx.prompt('');
        }
        if (s.y < 0 && s.life > 0) { s.life = 0; fx.splash(s.x, 0, 5); }
      }
      for (let i = shots.length - 1; i >= 0; i--) if (shots[i].life <= 0) shots.splice(i, 1);
    }
    function finish() {
      if (ended) return; ended = true;
      const line = hits[100] ? `${hits[100]} bullseye${hits[100] > 1 ? 's' : ''}` : score >= 100 ? 'Sharp shooting' : score > 0 ? 'Watch the wind and aim ahead of the penguin' : 'Throw your snowballs to steer the penguin';
      ctx.finish(score, line);
    }

    function drawWater(g) {
      const [, wy] = cam.toScreen(0, 0);
      const gr = g.createLinearGradient(0, wy, 0, ctx.H); gr.addColorStop(0, '#3a95d3'); gr.addColorStop(1, '#155a92');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(0, ctx.H);
      for (let x = 0; x <= ctx.W + 8; x += 8) g.lineTo(x, wy + Math.sin(x * 0.035 + t * 2) * 3 + Math.sin(x * 0.011 - t) * 2);
      g.lineTo(ctx.W, ctx.H); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.beginPath();
      for (let x = 0; x <= ctx.W + 8; x += 8) { const y = wy + Math.sin(x * 0.035 + t * 2) * 3 + Math.sin(x * 0.011 - t) * 2; if (x) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2;
      for (let i = 0; i < 6; i++) { const y = wy + 18 + i * 22, o = (t * 18 + i * 60) % 140; g.beginPath(); for (let x = -o; x < ctx.W; x += 140) { g.moveTo(x, y); g.lineTo(x + 40, y); } g.stroke(); }
    }
    function drawFloe(g) {
      const [x0, y0] = cam.toScreen(-6.6, -0.3), [x1, y1] = cam.toScreen(-1.9, FLOE);
      g.fillStyle = '#e8f6ff'; g.strokeStyle = '#7fb6dc'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x0, y1 + 3); g.lineTo(x1, y1); g.lineTo(x1 + 6, y0); g.lineTo(x0 - 6, y0); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = 'rgba(120,180,225,.4)'; g.fillRect(x0, y1 + (y0 - y1) * 0.55, x1 - x0, (y0 - y1) * 0.45);
    }
    function drawTarget(g) {
      // an ice pillar rising from the sea with the target painted on its face
      const [px0, pyTop] = cam.toScreen(TX - 0.4, TY + TR + 0.8), [px1, pyBot] = cam.toScreen(TX + 1.6, -0.3);
      const gr = g.createLinearGradient(px0, 0, px1, 0); gr.addColorStop(0, '#d8f0ff'); gr.addColorStop(1, '#8cc4e8');
      g.fillStyle = gr; g.strokeStyle = '#6aa8d0'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(px0, pyBot); g.lineTo(px0 + 4, pyTop + 8); g.lineTo((px0 + px1) / 2, pyTop); g.lineTo(px1, pyTop + 12); g.lineTo(px1 + 3, pyBot); g.closePath(); g.fill(); g.stroke();
      const [cx, cy] = cam.toScreen(TX - 0.35, TY);
      target(g, cx, cy, TR * cam.zoom, 0.42);
      // wind flag on top
      const [fx0, fy0] = cam.toScreen(TX + 0.6, TY + TR + 0.8);
      g.fillStyle = '#6b4a2a'; g.fillRect(fx0 - 1.5, fy0 - 40, 3, 40);
      const s = clamp(wind / 1.2, -1, 1), len = 10 + Math.abs(s) * 26, dir = s >= 0 ? 1 : -1, flap = Math.sin(t * 12) * 3;
      g.fillStyle = '#e5484d'; g.beginPath(); g.moveTo(fx0, fy0 - 40); g.lineTo(fx0 + dir * len, fy0 - 34 + flap); g.lineTo(fx0, fy0 - 27); g.closePath(); g.fill();
      g.font = '800 11px system-ui'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(15,30,55,.6)'; g.lineWidth = 3;
      const wt = wind === 0 ? 'Calm' : `Wind ${wind > 0 ? 'right' : 'left'} ${Math.abs(wind).toFixed(1)}`;
      g.strokeText(wt, fx0, fy0 - 46); g.fillText(wt, fx0, fy0 - 46);
    }
    function draw(g) {
      sky(g, ctx, ['#4aa6e6', '#9fd6f7', '#e4f5ff']);
      clouds(g, ctx, cam, { t, count: 5, seed: 8 });
      const wyF = cam.sy_(0) / ctx.H;
      ridge(g, cam, { par: 0, yPar: 0, y: wyF, amp: 0.2, width: 200, seed: 31, color: '#a3c6e6', snow: { above: 0.4, color: '#f4fbff' }, peaks: true });
      ridge(g, cam, { par: 0, yPar: 0, y: wyF + 0.002, amp: 0.06, width: 90, seed: 37, color: '#dff1fc' });
      drawTarget(g);
      // the orca behind the water line while it leaps
      if (O.t >= 0) { const [ox, oy] = cam.toScreen(O.x, O.y); sprite(g, 'orca', 0, ox, oy, cam.zoom, { anchor: 'center', rot: O.rot }); }
      drawWater(g);
      for (const s of splashes) { const [sx, sy] = cam.toScreen(s.x, 0); g.strokeStyle = `rgba(255,255,255,${1 - s.t})`; g.lineWidth = 3; g.beginPath(); g.ellipse(sx, sy, 10 + s.t * 40, 3 + s.t * 8, 0, 0, 6.283); g.stroke(); }
      drawFloe(g);
      // the yeti
      const [yx, yy] = cam.toScreen(YX, FLOE);
      if (Ye.throwT >= 0) sprite(g, 'yeti_throw', Math.min(11, Ye.throwT * THROW_FPS), yx, yy, cam.zoom);
      else sprite(g, 'yeti_idle', (t * 8) % 8, yx, yy, cam.zoom);
      // snowball in hand while one is left
      if (Ye.throwT < 0 && balls > 0 && P.state === 'fly') { const h = bone('yeti_idle', 'Middle1R', (t * 8) % 8); const [hx, hy] = cam.toScreen(YX + h.x, FLOE + h.y); ball(g, hx, hy, 0.24 * cam.zoom); }
      // penguin
      if (P.state === 'waddle' || P.state === 'dive' || P.state === 'fly' || P.state === 'stuck') {
        const ps = Math.max(cam.zoom, 24);
        if (P.state === 'waddle') sprite(g, 'penguin', 0, ...cam.toScreen(P.x, P.y), ps, { rot: Math.sin(t * 10) * 0.08 });
        else sprite(g, 'penguin', 0, ...cam.toScreen(P.x, P.y), ps, { anchor: 'center', rot: P.state === 'stuck' ? -Math.PI / 2 + Math.sin(t * 3) * 0.05 : P.rot });
      }
      for (const s of shots) { const [sx, sy] = cam.toScreen(s.x, s.y); ball(g, sx, sy, 0.26 * cam.zoom); }
      fx.draw(g, cam);
      snow.draw(g, ctx, cam, t);
      // where the penguin will be: a faint dotted guide while it flies (ignores wind), to help aiming
      if (P.state === 'fly' && balls > 0) {
        g.fillStyle = 'rgba(255,255,255,.55)';
        let x = P.x, y = P.y, vx = P.vx, vy = P.vy;
        for (let i = 0; i < 14; i++) { for (let k = 0; k < 4; k++) { vx += wind * 0.025; vy -= G * 0.025; x += vx * 0.025; y += vy * 0.025; } if (y < 0) break; const [sx, sy] = cam.toScreen(x, y); g.beginPath(); g.arc(sx, sy, 2.2, 0, 6.283); g.fill(); }
      }
    }
    function ball(g, x, y, r) {
      r = Math.max(4, r);
      g.fillStyle = '#ffffff'; g.strokeStyle = '#9cc6e6'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); g.stroke();
      g.fillStyle = '#d9ecfa'; g.beginPath(); g.arc(x + r * 0.25, y + r * 0.25, r * 0.55, 0, 6.283); g.fill();
    }
    return { update, draw, down: throwAt };
  },
};

// A round target: white, blue, red rings and a gold bullseye. tilt squashes it to look like it faces left.
function target(g, x, y, R, tilt = 1) {
  const cols = ['#ffffff', '#3c7be0', '#e5484d', '#ffcf3f'];
  g.save(); g.translate(x, y); g.scale(tilt, 1);
  g.fillStyle = 'rgba(20,40,70,.25)'; g.beginPath(); g.arc(3, 3, R, 0, 6.283); g.fill();
  RINGS.slice().reverse().forEach(([r], i) => { g.fillStyle = cols[i]; g.beginPath(); g.arc(0, 0, (r / TR) * R, 0, 6.283); g.fill(); g.strokeStyle = 'rgba(20,40,70,.35)'; g.lineWidth = 1.5 / tilt; g.stroke(); });
  g.restore();
}
