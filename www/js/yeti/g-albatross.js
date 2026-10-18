// Albatross Ride: the yeti stomps a see-saw to launch the penguin onto a passing albatross, then the penguin
// rides it across the outback. Flaps give lift but cost energy, and they work best close to the ground.
// Score is the distance in metres.
import { Camera, FX, sprite, sky, ridge, clouds, distanceMarks, snd, buzz, clamp, fmt1, roundRect, rng } from './kit.js';

const G = 9.8;
const PIV = { x: 0, y: 0.6 }, HALF = 1.8;            // see-saw pivot and half length
const TILT = Math.asin(PIV.y / HALF);                 // plank angle with one end on the ground
const ROCK = { x: -3.3, y: 1.35 };                    // the yeti waits on a rock behind the see-saw
const FLAP_COST = 0.11, RECHARGE = 0.055;
const TIRE = 45;   // seconds of riding until the albatross is worn out

// Where a world feature lives: updrafts and fish pickups, the same for every ride so it can be learnt.
function course() {
  const r = rng(41), drafts = [], fish = [], trees = [];
  for (let x = 70; x < 3000; x += 45 + r() * 70) trees.push({ x, h: 3.4 + r() * 3.2, seed: Math.floor(r() * 1000) });
  for (let x = 55; x < 3000; x += 70 + r() * 70) drafts.push({ x, w: 7 + r() * 4 });
  for (let x = 30; x < 3000; x += 22 + r() * 30) fish.push({ x, y: 1.6 + Math.pow(r(), 1.6) * 13, got: false });
  return { drafts, fish, trees };
}

// A small fish to collect (silver with a blue back), drawn in screen space.
function fishShape(g, x, y, s, t) {
  g.save(); g.translate(x, y); g.rotate(Math.sin(t * 5) * 0.15);
  g.fillStyle = 'rgba(255,240,170,.35)'; g.beginPath(); g.arc(0, 0, s * 1.15, 0, 6.283); g.fill();
  g.fillStyle = '#9fc7e6'; g.strokeStyle = '#2f5f8a'; g.lineWidth = Math.max(1, s * 0.12);
  g.beginPath(); g.ellipse(0, 0, s * 0.7, s * 0.36, 0, 0, 6.283); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-s * 0.6, 0); g.lineTo(-s * 1.05, -s * 0.38); g.lineTo(-s * 1.05, s * 0.38); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#4f86b8'; g.beginPath(); g.ellipse(0, -s * 0.12, s * 0.55, s * 0.16, 0, 0, 6.283); g.fill();
  g.fillStyle = '#123'; g.beginPath(); g.arc(s * 0.38, -s * 0.06, s * 0.08, 0, 6.283); g.fill();
  g.restore();
}
// A gum tree silhouette with a pale trunk and olive canopy.
function gumTree(g, x, y, s, seed) {
  const r = rng(seed);
  g.save(); g.translate(x, y);
  g.strokeStyle = '#efe2cf'; g.lineCap = 'round';
  g.lineWidth = s * 0.09; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(s * 0.05, -s * 0.5, -s * 0.05, -s * 0.8); g.stroke();
  g.lineWidth = s * 0.05; g.beginPath(); g.moveTo(0, -s * 0.45); g.quadraticCurveTo(s * 0.25, -s * 0.6, s * 0.3, -s * 0.85); g.stroke();
  g.beginPath(); g.moveTo(-s * 0.02, -s * 0.6); g.quadraticCurveTo(-s * 0.25, -s * 0.7, -s * 0.32, -s * 0.9); g.stroke();
  g.fillStyle = '#6f7d3c';
  for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse((r() - 0.5) * s * 0.75, -s * (0.85 + r() * 0.25), s * (0.18 + r() * 0.12), s * (0.1 + r() * 0.06), 0, 0, 6.283); g.fill(); }
  g.restore();
}

export default {
  id: 'albatross', name: 'Albatross Ride', blurb: 'Launch the penguin onto an albatross and fly across the outback', unit: 'm',
  theme: ['#f5a35e', '#fcd9a6', '#d77a45'],
  how: [
    'Hold your finger down to charge the bar on the left, then let go and the yeti jumps on the see-saw. Let go with the bar at the bird line to fling the penguin up to the albatross.',
    'The ring in the sky shows where the penguin meets the albatross. Let go early enough that the bird is gliding through the ring as the penguin gets there.',
    'Once you are riding, tap (or hold) to flap. Flaps use energy and are much stronger close to the ground, shown by the green glow. Energy refills while you glide.',
    'Rising warm air lifts you, and fish top up energy. Touching the ground ends the flight. Your score is how far the penguin gets.',
  ],
  thumb(g, w, h) {
    g.fillStyle = '#c45a2c'; g.fillRect(0, h * 0.8, w, h);
    sprite(g, 'albatross', 0, w * 0.55, h * 0.42, h * 0.32, { anchor: 'center' });
    sprite(g, 'penguin', 0, w * 0.53, h * 0.3, h * 0.24);
  },
  create(ctx) {
    const fx = new FX(), C = course();
    const Ha = 10.5 + Math.random() * 2.5;              // the albatross's cruising height before you catch it
    const z0 = clamp(Math.min(ctx.W / 12, ctx.H * 0.78 / (Ha + 4)), 18, 60);
    const cam = new Camera(ctx, z0); cam.fx = 0.5; cam.fy = 0.88; cam.x = 1; cam.y = 0;
    const B = { x: -20, y: Ha, vx: 5.4, vy: 0, flapT: 1, sinceFlap: 9, energy: 1, cap: 1 };  // the albatross
    const P = { x: PIV.x + HALF * Math.cos(TILT) - 0.2, y: 0.25, vx: 0, vy: 0, rot: 0, state: 'seat' }; // the penguin
    const Ye = { state: 'wait', t: 0, p: 0, x: ROCK.x, y: ROCK.y };
    let rideT = 0;
    let t = 0, plank = -TILT, plankTo = -TILT, ended = false, line = '', holding = false, meterT = 0, best = ctx.best;
    // power needed so the top of the penguin's flight reaches the albatross
    const pNeed = clamp((Math.sqrt(2 * G * (Ha - 0.6)) - 6.5) / 13.5, 0.05, 0.98);
    ctx.hud({ left: best ? `Best ${fmt1(best)} m` : '', right: '0.0 m' });
    ctx.prompt('Hold to charge, let go to jump');

    // the bar rises while you hold and sinks again if you hold too long
    const meterP = () => 0.5 - 0.5 * Math.cos(meterT * Math.PI * 2 / 2.2);
    // where the penguin reaches the albatross's height with a launch right on the bird line
    const vyN = 6.5 + 13.5 * pNeed, tReach = (vyN - Math.sqrt(Math.max(0, vyN * vyN - 2 * G * (Ha + 0.35 - 0.3)))) / G;
    const ring = { x: P.x + (1 + 2.3 * pNeed) * tReach, y: Ha + 0.35 };
    const plankEnd = (side) => ({ x: PIV.x + side * HALF * Math.cos(plank), y: PIV.y + side * HALF * Math.sin(plank) });


    function stomp() { // the yeti lands on the plank: flip it and fling the penguin
      plankTo = TILT; Ye.state = 'landed'; Ye.t = 0;
      const p = Ye.p;
      P.state = 'air'; P.vy = 6.5 + 13.5 * p; P.vx = 1.0 + 2.3 * p;
      snd.boing(0.8 + p * 0.5); buzz(30); cam.shake(8, 0.3);
      fx.dust(plankEnd(-1).x, 0.1, 16);
      const close = Math.abs(p - pNeed) < 0.06;
      fx.text(P.x, P.y + 1.6, close ? 'Right on the mark!' : p > pNeed ? 'Big launch' : 'A bit soft', { color: close ? '#ffd447' : '#fff', size: close ? 24 : 20 });
      ctx.prompt('');
    }
    function flap() {
      if (P.state !== 'ride' || B.falling) return;
      if (B.energy < FLAP_COST * 0.6) { if (B.sinceFlap > 0.4) { fx.text(B.x, B.y + 1.5, 'Out of puff', { size: 16 }); B.sinceFlap = 0; } return; }
      const eff = clamp(1.75 - B.y / 8.5, 0.35, 1.75);
      B.vy = Math.max(B.vy, -2) + 3.4 * eff; B.vx = Math.min(17, B.vx + 0.55 * eff);
      B.energy = Math.max(0, B.energy - FLAP_COST); B.flapT = 0; B.sinceFlap = 0;
      snd.flap(); buzz(8);
      fx.burst(B.x - 0.4, B.y - 0.3, { n: 4, color: ['#ffffff', '#e8eef5'], speed: 2, up: 0, size: 0.1, life: 0.6, grav: 3, dir: -Math.PI / 2 });
      if (eff > 1.45) fx.text(B.x + 0.5, B.y + 1.4, 'Power flap', { color: '#9cf28f', size: 15, life: 0.7 });
    }
    function down() {
      if (Ye.state === 'wait') { Ye.state = 'charge'; meterT = 0; snd.tick(); return; }
      if (P.state === 'ride') { holding = true; flap(); }
    }
    function up() {
      holding = false;
      if (Ye.state === 'charge') { Ye.state = 'crouch'; Ye.t = 0; Ye.p = meterP(); snd.swoosh(); }
    }

    function end(why) {
      if (ended) return; ended = true; line = why;
      const d = Math.max(0, P.x);
      if (d > 300) snd.cheer(); else if (d < 25) snd.fail();
      ctx.finish(Math.round(d * 10) / 10, line);
    }

    function update(dt) {
      t += dt; cam.update(dt); fx.update(dt);
      plank += (plankTo - plank) * Math.min(1, dt * 22);
      if (Ye.state === 'charge') meterT += dt;
      // the albatross glides back and forth across the sky until it carries the penguin
      if (P.state === 'seat' || P.state === 'air') {
        B.x += B.vx * dt; B.y = Ha + Math.sin(t * 1.4) * 0.35;
        if (B.x > 30) B.x = -30;
        B.flapT += dt; if (B.flapT > 2.2 && Math.random() < dt) B.flapT = 0;
      }
      // the yeti: crouch, jump in an arc from the rock to the high end of the plank, stomp
      if (Ye.state === 'crouch') { Ye.t += dt; if (Ye.t > 0.22) { Ye.state = 'jump'; Ye.t = 0; } }
      else if (Ye.state === 'jump') {
        Ye.t += dt; const T = 0.55, k = Math.min(1, Ye.t / T), end0 = plankEnd(-1);
        const peak = Math.max(ROCK.y, end0.y) + 0.8 + 2.4 * Ye.p;
        Ye.x = ROCK.x + (end0.x + 0.15 - ROCK.x) * k;
        Ye.y = (1 - k) * (1 - k) * ROCK.y + 2 * k * (1 - k) * peak + k * k * end0.y;
        if (k >= 1) stomp();
      } else if (Ye.state === 'landed') { Ye.t += dt; const e = plankEnd(-1); Ye.x = e.x + 0.15; Ye.y = e.y; }

      if (P.state === 'seat') { const e = plankEnd(1); P.x = e.x - 0.25; P.y = e.y + 0.05; P.rot = 0; }
      else if (P.state === 'air') {
        P.vy -= G * dt; P.x += P.vx * dt; P.y += P.vy * dt; P.rot += dt * 3;
        // catching the albatross: land on its back as you pass
        const dx = P.x - B.x, dy = P.y - (B.y + 0.35);
        if (Math.abs(dx) < 1.9 && dy > -1.4 && dy < 1.4) {
          P.state = 'ride'; B.vx = 9 + Math.max(0, P.vx); B.vy = Math.max(-1, P.vy * 0.25); B.energy = 1;
          snd.squawk(); snd.ding(3); buzz([20, 30, 20]); cam.shake(6, 0.25); fx.stars(P.x, P.y, 14);
          fx.text(P.x, P.y + 1.5, 'Got it!', { color: '#ffd447', size: 28 });
          ctx.prompt('Tap to flap. Lower flaps are stronger');
          setTimeout(() => { if (!ended) ctx.prompt(''); }, 2600);
        } else if (P.y <= 0.35 && P.vy < 0) {
          P.y = 0.35; P.state = 'slide'; P.vx *= 0.6; fx.dust(P.x, 0, 14); snd.thud();
          line = 'Missed the albatross';
        }
      } else if (P.state === 'ride') {
        B.sinceFlap += dt; B.flapT += dt; rideT += dt;
        B.cap = clamp(1 - rideT / TIRE, 0.12, 1); B.energy = Math.min(B.energy, B.cap);
        if (holding && B.sinceFlap > 0.3) flap();
        if (B.sinceFlap > 0.45) B.energy = Math.min(B.cap, B.energy + RECHARGE * dt);
        B.vy -= (B.falling ? 9 : 3.1) * dt; B.vy *= 1 - 0.55 * dt;
        B.vx += (9 - B.vx) * 0.12 * dt;
        if (B.y > 24) B.vy -= 5 * dt;
        for (const d of C.drafts) if (Math.abs(B.x - d.x) < d.w / 2 && B.y < 22) B.vy = Math.min(4.5, B.vy + 8 * dt);
        for (const f of C.fish) if (!f.got && Math.abs(B.x - f.x) < 1.4 && Math.abs(B.y + 0.3 - f.y) < 1.3) {
          f.got = true; rideT = Math.max(0, rideT - 3); B.energy = Math.min(B.cap, B.energy + 0.25); snd.pop(); snd.ding(5); fx.stars(f.x, f.y, 8);
          fx.text(f.x, f.y + 1, '+ energy', { color: '#9cf28f', size: 16 });
        }
        B.x += B.vx * dt; B.y += B.vy * dt;
        P.x = B.x - 0.15; P.y = B.y + 0.3; P.rot = -Math.atan2(B.vy, B.vx) * 0.6;
        let hitTree = null;
        if (!B.falling) for (const tr of C.trees) if (Math.abs(B.x - tr.x) < 1.3 && B.y < tr.h - 0.4) hitTree = tr;
        if (hitTree) { // clipped a gum tree: leaves everywhere and down we go
          B.vx *= 0.35; B.vy = -3; B.y = Math.min(B.y, hitTree.h - 0.5); B.x = hitTree.x - 1.35;
          fx.burst(B.x + 1, B.y, { n: 22, color: ['#6f7d3c', '#8a9a4a', '#5b6930'], speed: 6, up: 3, size: 0.18, life: 1.1, grav: 6 });
          snd.crunch(); cam.shake(12, 0.35); buzz(60);
          fx.text(B.x, B.y + 1.6, 'Gum tree!', { size: 24, color: '#ffd447' });
          line = 'Clipped a gum tree'; B.energy = 0; B.cap = 0; B.falling = true;
        }
        if (B.y < 0.75) {
          const gentle = B.vy > -2.2;
          P.state = 'slide'; P.vx = B.vx * (gentle ? 0.45 : 0.7); P.y = 0.35;
          B.vy = 0; B.y = 0.75; B.state = 'down';
          fx.dust(B.x, 0, 22); snd.thud(); cam.shake(gentle ? 4 : 10, 0.3); buzz(gentle ? 20 : 50);
          fx.text(B.x, 2.4, gentle ? 'Touchdown' : 'Crash landing!', { size: 22 });
          if (line !== 'Clipped a gum tree') line = gentle ? 'A tidy landing' : rideT > TIRE * 0.9 ? 'The albatross was worn out' : B.energy < 0.1 ? 'Ran out of puff' : 'Flew into the dirt';
        }
      } else if (P.state === 'slide') {
        P.vx = Math.max(0, P.vx - 6.5 * dt); P.x += P.vx * dt; P.rot += (Math.PI / 2 - P.rot) * Math.min(1, dt * 8);
        if (B.state === 'down') B.vx = Math.max(0, B.vx - 9 * dt), B.x += B.vx * dt;
        if (Math.random() < P.vx / 14) fx.dust(P.x - 0.3, 0.05, 1);
        if (P.vx <= 0.05) { P.state = 'stop'; end(line || 'Down to earth'); }
      }

      // camera: frame the see-saw and the albatross's height, then chase the penguin
      if (P.state === 'seat' || (P.state === 'air' && P.x < 2)) { cam.follow(1, 0, dt, 4); cam.zoomTo(z0, dt); }
      else {
        cam.fx += (0.36 - cam.fx) * Math.min(1, dt * 2); cam.fy += (0.82 - cam.fy) * Math.min(1, dt * 2);
        cam.follow(P.x, Math.max(0, P.y * 0.55 - 1.5), dt, 5);
        cam.zoomTo(clamp(ctx.H * 0.72 / (P.y + 7), 13, z0), dt, 2);
      }
      ctx.hud({ left: best ? `Best ${fmt1(best)} m` : '', right: `${fmt1(Math.max(0, P.x))} m` });
    }

    function drawGround(g) {
      const gy = cam.sy_(0);
      const gr = g.createLinearGradient(0, gy, 0, ctx.H); gr.addColorStop(0, '#cf6634'); gr.addColorStop(1, '#8e3a1c');
      g.fillStyle = gr; g.fillRect(0, gy, ctx.W, ctx.H - gy);
      // spinifex tufts at fixed spots along the ground
      const step = 3.1, first = Math.floor(cam.left / step) * step;
      g.strokeStyle = '#8f8a3a'; g.lineWidth = 1.5;
      for (let x = first; x < cam.right + step; x += step) {
        const k = Math.sin(x * 12.9898) * 43758.5453, r = k - Math.floor(k);
        const [sx] = cam.toScreen(x + r * 2, 0), s = cam.zoom * (0.25 + r * 0.25);
        for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(sx, gy); g.lineTo(sx + i * s * 0.25, gy - s * (0.7 + (i % 2 ? 0 : 0.3))); g.stroke(); }
      }
    }
    function drawSeeSaw(g) {
      const [px, py] = cam.toScreen(PIV.x, PIV.y), [bx, by] = cam.toScreen(PIV.x, 0), z = cam.zoom;
      g.fillStyle = '#6b4a2d'; g.beginPath(); g.moveTo(bx - z * 0.45, by); g.lineTo(px, py); g.lineTo(bx + z * 0.45, by); g.closePath(); g.fill();
      g.save(); g.translate(px, py); g.rotate(-plank);
      g.fillStyle = '#b07a45'; g.strokeStyle = '#6b4a2d'; g.lineWidth = 2;
      roundRect(g, -HALF * z, -z * 0.14, HALF * 2 * z, z * 0.2, z * 0.06); g.fill(); g.stroke();
      g.restore();
      // the yeti's rock
      const [rx, ry] = cam.toScreen(ROCK.x, ROCK.y), [, r0] = cam.toScreen(0, 0);
      g.fillStyle = '#a5532c'; g.beginPath(); g.moveTo(rx - z * 1.0, r0); g.lineTo(rx - z * 0.8, ry + 3); g.quadraticCurveTo(rx, ry - z * 0.15, rx + z * 0.75, ry + 4); g.lineTo(rx + z * 0.95, r0); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(rx - z * 0.8, ry + 3); g.quadraticCurveTo(rx, ry - z * 0.15, rx + z * 0.75, ry + 4); g.lineTo(rx, ry + z * 0.35); g.closePath(); g.fill();
    }
    function drawPowerMeter(g) {
      const x = 16, w = 18, top = ctx.H * 0.18, h = ctx.H * 0.5, p = Ye.state === 'wait' ? 0 : Ye.state === 'charge' ? meterP() : Ye.p;
      g.save();
      g.fillStyle = 'rgba(40,20,10,.5)'; roundRect(g, x - 3, top - 3, w + 6, h + 6, 10); g.fill();
      g.fillStyle = 'rgba(255,255,255,.2)'; roundRect(g, x, top, w, h, 8); g.fill();
      const gr = g.createLinearGradient(0, top + h, 0, top); gr.addColorStop(0, '#59d27a'); gr.addColorStop(0.6, '#ffd447'); gr.addColorStop(1, '#ff5a5f');
      g.fillStyle = gr; roundRect(g, x, top + h * (1 - p), w, Math.max(8, h * p), 8); g.fill();
      // the bird line: power that lifts the penguin up to the albatross
      const ly = top + h * (1 - pNeed);
      g.fillStyle = '#fff'; g.fillRect(x - 6, ly - 1.5, w + 12, 3);
      g.save(); g.translate(x + w + 10, ly); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(6, -7, 12, -2); g.quadraticCurveTo(16, -6, 22, 0); g.quadraticCurveTo(11, -2, 0, 0); g.fill(); g.restore();
      g.font = '800 11px system-ui'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText('POWER', x + w / 2, top + h + 18);
      g.restore();
    }
    function drawEnergy(g) {
      const w = Math.min(170, ctx.W * 0.42), x = (ctx.W - w) / 2, y = 48, e = B.energy;
      g.save();
      g.fillStyle = 'rgba(40,20,10,.5)'; roundRect(g, x - 3, y - 3, w + 6, 16, 8); g.fill();
      if (B.cap < 1) { g.fillStyle = 'rgba(30,10,5,.55)'; roundRect(g, x + w * B.cap, y, w * (1 - B.cap), 10, 5); g.fill(); }
      g.fillStyle = e < 0.15 ? '#ff5a5f' : e < 0.4 ? '#ffd447' : '#59d27a'; roundRect(g, x, y, Math.max(10, w * e), 10, 5); g.fill();
      g.font = '800 11px system-ui'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(B.cap < 0.35 ? 'ENERGY (TIRED)' : 'ENERGY', ctx.W / 2, y + 26);
      const eff = clamp(1.75 - B.y / 8.5, 0.35, 1.75);
      g.fillStyle = eff > 1.3 ? '#9cf28f' : 'rgba(255,255,255,.8)'; g.fillText(`Flap power ${Math.round(eff * 100 / 1.75)}%`, ctx.W / 2, y + 40);
      g.restore();
    }

    function draw(g) {
      sky(g, ctx, ['#e98b4f', '#f9c690', '#fff0d2']);
      // a low warm sun
      const sunX = ctx.W * 0.78 - cam.x * cam.zoom * 0.01, sunY = ctx.H * 0.3;
      const sg = g.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90); sg.addColorStop(0, 'rgba(255,250,220,1)'); sg.addColorStop(0.3, 'rgba(255,230,160,.8)'); sg.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = sg; g.beginPath(); g.arc(sunX, sunY, 90, 0, 6.283); g.fill();
      clouds(g, ctx, cam, { t, count: 4, seed: 8, alpha: 0.55, color: '#fff6e6', y1: 0.3 });
      const gyF = Math.min(0.97, cam.sy_(0) / ctx.H);
      ridge(g, cam, { par: 0.03, yPar: 0, y: gyF - 0.02, amp: 0.14, width: 320, seed: 31, color: '#b4624a' });
      ridge(g, cam, { par: 0.12, yPar: 0, y: gyF, amp: 0.08, width: 200, seed: 37, color: '#c27045' });
      // distant gum trees drift slowly
      const par = 0.35, spacing = 150;
      const off = cam.x * cam.zoom * par;
      for (let i = Math.floor(off / spacing) - 1; i < (off + ctx.W) / spacing + 1; i++) {
        const k = Math.sin(i * 78.233) * 43758.5453, r = k - Math.floor(k);
        gumTree(g, i * spacing - off + r * 60, gyF * ctx.H + 2, 48 + r * 40, i + 7);
      }
      drawGround(g);
      // the green glow near the ground marks where flaps are strongest
      if (P.state === 'ride') {
        const [, g0] = cam.toScreen(0, 0), [, g1] = cam.toScreen(0, 5);
        const gr = g.createLinearGradient(0, g1, 0, g0); gr.addColorStop(0, 'rgba(120,240,140,0)'); gr.addColorStop(1, 'rgba(120,240,140,.28)');
        g.fillStyle = gr; g.fillRect(0, g1, ctx.W, g0 - g1);
      }
      // updrafts: warm shimmering columns with rising specks
      for (const d of C.drafts) {
        if (d.x + d.w < cam.left - 5 || d.x - d.w > cam.right + 5) continue;
        const [x0, y0] = cam.toScreen(d.x - d.w / 2, 0), [x1, y1] = cam.toScreen(d.x + d.w / 2, 22);
        const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, 'rgba(255,230,170,0)'); gr.addColorStop(0.5, 'rgba(255,230,170,.32)'); gr.addColorStop(1, 'rgba(255,230,170,0)');
        g.fillStyle = gr; g.fillRect(x0, y1, x1 - x0, y0 - y1);
        g.fillStyle = 'rgba(255,255,255,.6)';
        for (let i = 0; i < 10; i++) { const fy = ((t * 0.35 + i / 10) % 1) * 20, fxx = d.x + Math.sin(i * 3.1 + t * 2) * d.w * 0.35; const [sx, sy] = cam.toScreen(fxx, fy); g.beginPath(); g.arc(sx, sy, 2, 0, 6.283); g.fill(); }
      }
      for (const tr of C.trees) { if (tr.x < cam.left - 4 || tr.x > cam.right + 4) continue; const [sx, sy] = cam.toScreen(tr.x, 0); gumTree(g, sx, sy, tr.h * cam.zoom / 1.05, tr.seed); }
      for (const f of C.fish) { if (f.got || f.x < cam.left - 2 || f.x > cam.right + 2) continue; const [sx, sy] = cam.toScreen(f.x, f.y); fishShape(g, sx, sy, Math.max(9, cam.zoom * 0.45), t + f.x); }
      distanceMarks(g, cam, 0, { every: cam.zoom > 28 ? 10 : 50, from: 10, color: '#7a2f12' });
      if (best > 0) { const [bx, by] = cam.toScreen(best, 0); if (bx > -40 && bx < ctx.W + 40) { g.fillStyle = '#ffd447'; g.fillRect(bx - 2, by - 54, 4, 54); g.beginPath(); g.moveTo(bx + 2, by - 54); g.lineTo(bx + 32, by - 45); g.lineTo(bx + 2, by - 36); g.fill(); g.font = '800 11px system-ui'; g.textAlign = 'center'; g.fillText('BEST', bx, by - 58); } }
      if (P.state === 'seat' || P.state === 'air') { // the meeting point, a soft dashed ring
        const [rx, ry] = cam.toScreen(ring.x, ring.y), rr = cam.zoom * 1.3;
        g.save(); g.setLineDash([6, 6]); g.lineDashOffset = -t * 12; g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2.5; g.beginPath(); g.arc(rx, ry, rr, 0, 6.283); g.stroke(); g.restore();
      }
      drawSeeSaw(g);
      // the yeti
      const [yx, yy] = cam.toScreen(Ye.x, Ye.y);
      let yf = (t * 8) % 8, yn = 'yeti_idle';
      if (Ye.state === 'crouch') { yn = 'yeti_jump'; yf = Math.min(6, Ye.t / 0.22 * 6); }
      else if (Ye.state === 'jump') { yn = 'yeti_jump'; yf = 7 + Math.min(3, Ye.t / 0.55 * 3); }
      else if (Ye.state === 'landed') { yn = Ye.t < 0.25 ? 'yeti_jump' : P.state === 'ride' || P.state === 'stop' && line === 'A tidy landing' ? 'yeti_yes' : 'yeti_wave'; yf = Ye.t < 0.25 ? 11 : (Ye.t * 10) % 8; }
      sprite(g, yn, yf, yx, yy, cam.zoom);
      // albatross with a wing beat (a quick vertical squash)
      const [ax, ay] = cam.toScreen(B.x, B.y), bsz = Math.max(cam.zoom, 22);
      const beat = B.flapT < 0.3 ? 1 - Math.sin(B.flapT / 0.3 * Math.PI) * 0.45 : 1;
      g.save(); g.translate(ax, ay); g.rotate(P.state === 'ride' ? -Math.atan2(B.vy, B.vx) * 0.5 : 0); g.scale(1, beat);
      sprite(g, 'albatross', 0, 0, 0, bsz, { anchor: 'center' });
      g.restore();
      // penguin
      const [px, py] = cam.toScreen(P.x, P.y), psz = Math.max(cam.zoom, 26);
      if (P.state === 'seat') sprite(g, 'penguin', 0, px, py, cam.zoom, { rot: plank * -1 });
      else if (P.state === 'ride') sprite(g, 'penguin', 0, px, py + psz * 0.05, psz * 0.85, { rot: P.rot });
      else sprite(g, 'penguin', 0, px, py, psz, { anchor: 'center', rot: P.rot });
      fx.draw(g, cam);
      if ((P.state === 'seat' || P.state === 'air') && ax < 10) { // the albatross is coming: an edge marker at its height
        const d = Math.max(0, cam.left - B.x);
        g.save(); g.translate(Ye.state === 'wait' || Ye.state === 'charge' ? 58 : 14, clamp(ay, 90, ctx.H - 80));
        g.fillStyle = 'rgba(60,25,10,.6)'; roundRect(g, 0, -15, 74, 30, 15); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.moveTo(8, 0); g.lineTo(17, -7); g.lineTo(17, 7); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(22, 2); g.quadraticCurveTo(28, -6, 34, -1); g.quadraticCurveTo(39, -6, 46, 2); g.quadraticCurveTo(34, -1, 22, 2); g.fill();
        g.font = '800 11px system-ui'; g.textAlign = 'left'; g.fillText(`${Math.round(d)} m`, 49, 4); g.restore();
      }
      if (Ye.state === 'wait' || Ye.state === 'charge' || Ye.state === 'crouch') drawPowerMeter(g);
      if (P.state === 'ride') drawEnergy(g);
      if (py < 0) { g.fillStyle = 'rgba(60,25,10,.6)'; roundRect(g, px - 30, 6, 60, 22, 11); g.fill(); g.fillStyle = '#fff'; g.font = '800 12px system-ui'; g.textAlign = 'center'; g.fillText(`↑ ${Math.round(P.y)} m`, px, 21); }
    }
    return { update, draw, down, up };
  },
};
