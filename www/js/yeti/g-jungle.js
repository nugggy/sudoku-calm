// Jungle Swing: the yeti whirls around a branch by one hand; tap to let go and fly to the next branch. Every
// branch wears out: green turns gold when you jump off it, gold turns red, and a red branch snaps, which makes
// three new branches sprout higher up. Climb the 50 levels of the tree. Score is the height reached in metres,
// plus a time bonus for reaching the top.
import { Camera, FX, sprite, bone, ridge, rng, snd, buzz, clamp, fmt, roundRect } from './kit.js';
import { cbOn } from '../cb.js';

const GRAV = 9.8;
const LEVELS = 50;
const GAP = 2.3;             // height between branch levels (m)
const Y0 = 2.4;              // height of the lowest level
const TOP = Y0 + (LEVELS - 1) * GAP;
const TRUNK = 0.55;          // half the trunk's width
const VTOP = 3.3;            // speed at the top of a swing (m/s), keeps him looping over the branch
const REACH = 0.95;          // how close his hand must pass to a branch to grab it
const POSE = 'yeti_wave', POSE_F = 5; // one arm straight up: the hanging pose
const COLOURS = [['#6fbf3f', '#3f7d22'], ['#f2c230', '#a8800f'], ['#e5534b', '#9c2a24']]; // green, gold, red (fill, edge)

export default {
  id: 'jungle', name: 'Jungle Swing', blurb: 'Whirl from branch to branch up a giant jungle tree', unit: 'm',
  theme: ['#9fe0b8', '#4fae6f', '#2c6e43'],
  how: [
    'The yeti spins around a branch by one hand. Tap to let go: he flies off the way he is swinging and grabs any branch his hand passes close to.',
    'Let go on the upswing to fly higher. The faint dots show where he would go.',
    'Branches wear out. Jump off a green branch and it turns gold, then red. Jump off a red branch and it snaps, and three new branches sprout further up the tree.',
    'There are not enough branches to climb straight to the top, so you will need to wear some out.',
    'Fall to the jungle floor and you tumble: tap to leap back onto the lowest branch. The third tumble ends the climb. Score is the height you reach, with a time bonus at the very top.',
  ],
  thumb(g, w, h) {
    g.fillStyle = '#6b4a2b'; g.fillRect(w * 0.44, 0, w * 0.12, h);
    g.fillStyle = '#6fbf3f'; g.fillRect(w * 0.56, h * 0.28, w * 0.26, h * 0.05); g.fillRect(w * 0.16, h * 0.7, w * 0.28, h * 0.05);
    g.fillStyle = '#f2c230'; g.fillRect(w * 0.56, h * 0.82, w * 0.22, h * 0.05);
    sprite(g, POSE, POSE_F, w * 0.74, h * 1.1, h * 0.27, { rot: -0.5 });
  },
  create(ctx) {
    const zoom = clamp(ctx.W / 8.4, 34, 64);
    const cam = new Camera(ctx, zoom); cam.fx = 0.5; cam.fy = 0.55; cam.x = 0; cam.y = Y0 + 3;
    const fx = new FX();
    const r = rng(1 + ((Math.random() * 1e6) | 0));
    // the hand is the pivot; the body's centre sits this far from it (in the pose's own frame)
    const hand0 = bone(POSE, 'Middle1L', POSE_F);
    const C_REL = { x: -0.13 - hand0.x * 0, y: 1.2 - hand0.y }; // body centre relative to the hand, unrotated
    const RAD = Math.hypot(C_REL.x, C_REL.y);
    const BASE = Math.atan2(C_REL.x, -C_REL.y); // the pose's own lean when hanging straight down

    // ---------- branches ----------
    // slots[level] = branch or null. A branch: { level, side (-1 left, 1 right), len, wear 0..2, grow 0..1 }
    const slots = new Array(LEVELS).fill(null);
    let side = r() < 0.5 ? -1 : 1;
    for (let k = 0; k < 25; k++) { slots[k] = { level: k, side, len: 1.6 + r() * 0.8, wear: 0, grow: 1 }; side = r() < 0.5 ? -side : side; }
    const falling = []; // snapped branches tumbling down
    const yOf = (k) => Y0 + k * GAP;
    const seg = (b) => ({ x0: b.side * (TRUNK + 0.15), x1: b.side * (TRUNK + b.len * b.grow), y: yOf(b.level) });

    // ---------- the yeti ----------
    // hanging: pivot (px, py), angle phi (0 = straight down, positive = swung to the right/anticlockwise), dir +-1
    // flying: body centre (x, y), velocity, phi keeps turning at spin
    const Y = { mode: 'hang', branch: slots[0], px: 0, py: 0, phi: -1.2, dir: 1, x: 0, y: 0, vx: 0, vy: 0, spin: 0, last: null, lastT: 0, frame: POSE_F };
    { const s = seg(Y.branch); Y.px = (s.x0 + s.x1) * 0.62; Y.py = s.y; }
    let t = 0, ended = false, highest = Y.py, topReached = false, hintT = 0, grabs = 0, tumbles = 0, groundT = 0;
    const TUMBLES = 3;
    ctx.hud({ left: '0:00', center: `${fmt(highest)} m`, right: `Tumbles ${TUMBLES}` });
    ctx.prompt('Tap to let go');

    const speedAt = (phi) => Math.sqrt(VTOP * VTOP + 2 * GRAV * RAD * (1 + Math.cos(phi)));
    const bodyFrom = (px, py, phi) => ({ x: px + Math.sin(phi) * RAD, y: py - Math.cos(phi) * RAD });
    const handFrom = (x, y, phi) => ({ x: x - Math.sin(phi) * RAD, y: y + Math.cos(phi) * RAD });

    function release() {
      if (Y.mode === 'ground' && !ended && groundT > 0.5) return leapBack();
      if (Y.mode !== 'hang' || ended) return;
      const b = Y.branch, v = speedAt(Y.phi), w = Y.dir * v / RAD;
      const c = bodyFrom(Y.px, Y.py, Y.phi);
      Y.mode = 'fly'; Y.x = c.x; Y.y = c.y;
      Y.vx = w * RAD * Math.cos(Y.phi); Y.vy = w * RAD * Math.sin(Y.phi);
      Y.spin = w * 0.55; Y.last = b; Y.lastT = t;
      snd.swoosh(); buzz(10); ctx.prompt('');
      wear(b);
    }
    function wear(b) {
      if (b.wear < 2) { b.wear++; snd.tick(); return; }
      // red branch: it snaps and falls, and three new ones sprout in the next empty levels up the tree
      slots[b.level] = null;
      const s = seg(b);
      falling.push({ b, x: (s.x0 + s.x1) / 2, y: s.y, vx: b.side * 1.2, vy: 1.5, rot: 0, vr: b.side * (2 + r() * 2), t: 0 });
      snd.crunch(); cam.shake(6, 0.25); buzz([20, 20, 40]);
      fx.burst((s.x0 + s.x1) / 2, s.y, { n: 14, color: ['#8a5a2b', '#6fbf3f', '#b98a4e'], speed: 4, up: 2, size: 0.12, life: 0.8 });
      fx.text((s.x0 + s.x1) / 2, s.y + 0.8, 'Snap!', { color: '#ff8a80', size: 24 });
      let grown = 0;
      for (let k = b.level + 1; k < LEVELS && grown < 3; k++) {
        if (slots[k]) continue;
        const sd = r() < 0.5 ? -1 : 1;
        slots[k] = { level: k, side: sd, len: 1.6 + r() * 0.9, wear: 0, grow: 0 };
        grown++;
      }
      if (grown) setTimeout(() => { if (!ended) { snd.pop(); } }, 250);
    }
    function grab(b, hx, hy) {
      const s = seg(b);
      const lo = Math.min(s.x0, s.x1), hi = Math.max(s.x0, s.x1);
      Y.px = clamp(hx, lo + 0.1, hi); Y.py = s.y;
      // keep the swing going the way he was travelling
      const dx = Y.x - Y.px, dy = Y.y - Y.py;
      Y.phi = Math.atan2(dx, -dy);
      const cross = dx * Y.vy - dy * Y.vx;
      Y.dir = cross >= 0 ? 1 : -1;
      Y.mode = 'hang'; Y.branch = b; grabs++;
      snd.thud(); buzz(15);
      fx.burst(Y.px, Y.py, { n: 8, color: ['#6fbf3f', '#a5e36b'], speed: 2.5, up: 1, size: 0.1, life: 0.6 });
      if (Y.py > highest + 0.1) {
        const gain = Y.py - highest;
        highest = Y.py;
        const lvl = b.level + 1;
        if (lvl % 10 === 0) { fx.text(Y.px, Y.py + 1.2, `Level ${lvl}!`, { color: '#ffd447', size: 26 }); snd.cheer(); }
        else fx.text(Y.px, Y.py + 1, `+${gain.toFixed(1)} m`, { color: '#fff', size: 18 });
      }
      if (b.level === LEVELS - 1) win();
    }
    function win() {
      if (ended) return;
      topReached = true; ended = true;
      const bonus = Math.max(0, Math.round((300 - t) * 0.5));
      snd.cheer(); fx.stars(Y.px, Y.py + 1, 30); cam.shake(8, 0.4);
      ctx.prompt('You made it to the top!');
      ctx.finish(Math.round(TOP + bonus), `Top of the tree in ${mmss(t)}, time bonus ${bonus} m`);
    }
    // landed on the jungle floor: a tumble, or the end of the climb on the third one
    function tumble() {
      tumbles++; groundT = 0;
      snd.thud(); cam.shake(8, 0.3); buzz([40, 30, 40]);
      fx.burst(Y.x, 0.2, { n: 16, color: ['#5fae45', '#8fd16a', '#3f8a35'], speed: 4, up: 2, size: 0.14, life: 0.8 });
      if (tumbles >= TUMBLES) return fallOut();
      fx.text(Y.x, 3, `Tumble ${tumbles} of ${TUMBLES}`, { color: '#ffd447', size: 22 });
      ctx.prompt('Tap to leap back up');
    }
    // a big jump from the floor that catches the lowest branch
    function leapBack() {
      const b = slots.find(Boolean);
      if (!b) return fallOut();
      const sg = seg(b), tx = (sg.x0 + sg.x1) * 0.6;
      Y.mode = 'fly'; Y.x = tx; Y.y = 1.4; Y.vx = 0; Y.vy = Math.sqrt(2 * GRAV * (sg.y - 1.4 + RAD + 0.4)); Y.phi = 0; Y.spin = 0;
      Y.last = null; snd.boing(); ctx.prompt('');
    }
    function fallOut() {
      if (ended) return; ended = true;
      snd.fail();
      const h = Math.round(highest);
      ctx.finish(h, h > 60 ? 'A mighty climb' : h > 25 ? 'Nice swinging' : 'Down to the jungle floor');
    }
    const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

    // nearest branch his hand passes within reach of (not the one he just left, for a moment)
    function findGrab(h) {
      const k0 = Math.max(0, Math.floor((h.y - Y0) / GAP) - 1), k1 = Math.min(LEVELS - 1, k0 + 3);
      let best = null, bd = REACH;
      for (let k = k0; k <= k1; k++) {
        const b = slots[k]; if (!b || b.grow < 0.6) continue;
        if (b === Y.last && t - Y.lastT < 0.45) continue;
        const s = seg(b), lo = Math.min(s.x0, s.x1), hi = Math.max(s.x0, s.x1);
        const cx = clamp(h.x, lo, hi), d = Math.hypot(h.x - cx, h.y - s.y);
        if (d < bd) { bd = d; best = b; }
      }
      return best;
    }

    function update(dt) {
      t += dt; cam.update(dt); fx.update(dt);
      for (const b of slots) if (b && b.grow < 1) b.grow = Math.min(1, b.grow + dt * 1.6);
      for (const f of falling) { f.t += dt; f.vy -= GRAV * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt; }
      while (falling.length && falling[0].t > 4) falling.shift();
      if (Y.mode === 'hang') {
        const w = Y.dir * speedAt(Y.phi) / RAD;
        Y.phi += w * dt;
        if (Y.phi > Math.PI) Y.phi -= Math.PI * 2; else if (Y.phi < -Math.PI) Y.phi += Math.PI * 2;
        const c = bodyFrom(Y.px, Y.py, Y.phi); Y.x = c.x; Y.y = c.y;
        // nudge new players when there is nothing above to reach
        hintT += dt;
        const above = slots.slice(Y.branch.level + 1, Y.branch.level + 3).some(Boolean);
        if (!above && hintT > 2.5 && !ended) { ctx.prompt(Y.branch.wear === 2 ? `Jump off this ${cbOn() ? 'cracked' : 'red'} branch to snap it` : 'No branch above. Wear branches out to grow more'); hintT = -6; }
      } else if (Y.mode === 'fly') {
        Y.vy -= GRAV * dt; Y.x += Y.vx * dt; Y.y += Y.vy * dt;
        // in the air he straightens up and reaches for the next branch with his raised hand
        { const d = Math.atan2(Math.sin(-Y.phi), Math.cos(-Y.phi)); Y.phi += d * Math.min(1, dt * 6); }
        const h = handFrom(Y.x, Y.y, Y.phi);
        const b = findGrab(h);
        if (b) { grab(b, h.x, h.y); const c = bodyFrom(Y.px, Y.py, Y.phi); Y.x = c.x; Y.y = c.y; hintT = 0; }
        else if (Y.y - 1.4 <= 0) { Y.y = 1.4; Y.vx = 0; Y.vy = 0; Y.phi = 0; Y.mode = 'ground'; tumble(); }
      } else if (Y.mode === 'ground') groundT += dt;
      // camera: keep the tree centred, follow his height with a little look-ahead upwards
      const lookY = (Y.mode === 'hang' ? Y.py : Y.y) + 2.2;
      cam.follow(clamp(Y.x * 0.35, -1.5, 1.5), Math.max(cam.ctx.H * 0.45 / cam.zoom, lookY), dt, Y.mode === 'fly' ? 3 : 2.2);
      ctx.hud({ left: mmss(t), center: `${fmt(highest)} m`, right: `Tumbles ${TUMBLES - tumbles}` });
    }

    // ---------- drawing ----------
    const leafy = (g, x, y, s, c1, c2) => {
      g.fillStyle = c2; g.beginPath(); g.ellipse(x, y + s * 0.15, s * 1.05, s * 0.55, 0, 0, 6.283); g.fill();
      g.fillStyle = c1; g.beginPath(); g.ellipse(x - s * 0.35, y, s * 0.6, s * 0.42, -0.3, 0, 6.283); g.ellipse(x + s * 0.4, y - s * 0.05, s * 0.62, s * 0.4, 0.3, 0, 6.283); g.ellipse(x, y - s * 0.25, s * 0.5, s * 0.38, 0, 0, 6.283); g.fill();
    };
    function drawBackdrop(g) {
      const W = ctx.W, H = ctx.H;
      const climb = clamp(cam.y / TOP, 0, 1);
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, climb > 0.8 ? '#8fd3f5' : '#b9ecd2'); gr.addColorStop(1, climb > 0.8 ? '#cfeffd' : '#5aa874');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      // layers of jungle drift down as he climbs
      const sink = (cam.y * cam.zoom) * 0.08 / H;
      ridge(g, cam, { par: 0.05, yPar: 0, y: 0.55 + sink, amp: 0.35, width: 70, seed: 31, color: 'rgba(60,140,90,.55)' });
      ridge(g, cam, { par: 0.12, yPar: 0, y: 0.75 + sink * 1.6, amp: 0.4, width: 55, seed: 37, color: 'rgba(40,110,70,.7)' });
      ridge(g, cam, { par: 0.2, yPar: 0, y: 0.95 + sink * 2.4, amp: 0.45, width: 45, seed: 41, color: 'rgba(28,85,52,.85)' });
      // hanging vines in the middle distance
      g.strokeStyle = 'rgba(40,100,55,.55)'; g.lineWidth = 2;
      const off = (cam.y * cam.zoom * 0.3) % 160;
      for (let i = 0; i < 6; i++) {
        const x = ((i * 97 + 30) % (W + 40)) - 20, len = 120 + (i % 3) * 70;
        g.beginPath(); for (let y = -20; y < len; y += 8) g.lineTo(x + Math.sin((y + off + t * 20) / 30 + i) * 6, y + off - 160 + (i % 2) * 40); g.stroke();
      }
    }
    function drawTrunk(g) {
      const [xl] = cam.toScreen(-TRUNK, 0), [xr] = cam.toScreen(TRUNK, 0);
      const yTop = Math.max(0, cam.toScreen(0, TOP + 3)[1]), yBot = Math.min(ctx.H, cam.toScreen(0, 0)[1]);
      if (yBot <= yTop) return;
      const gr = g.createLinearGradient(xl, 0, xr, 0); gr.addColorStop(0, '#4d331c'); gr.addColorStop(0.45, '#7a5532'); gr.addColorStop(1, '#4a3019');
      g.fillStyle = gr; g.fillRect(xl, yTop, xr - xl, yBot - yTop);
      // bark grooves and knots, fixed to the tree as it scrolls
      g.strokeStyle = 'rgba(30,18,8,.35)'; g.lineWidth = 2;
      const w0 = cam.toWorld(0, yBot)[1], w1 = cam.toWorld(0, yTop)[1];
      for (let i = 0; i < 5; i++) {
        const bx = -TRUNK + (i + 0.5) * (TRUNK * 2 / 5);
        g.beginPath();
        for (let wy = Math.floor(w0); wy <= w1 + 1; wy += 0.5) { const [sx, sy] = cam.toScreen(bx + Math.sin(wy * 0.9 + i * 2) * 0.06, wy); g.lineTo(sx, sy); }
        g.stroke();
      }
      for (let k = Math.max(0, Math.floor((w0 - Y0) / 4)); k * 4 < w1; k++) {
        const [kx, ky] = cam.toScreen(((k * 37) % 7) / 7 * 1.0 - 0.5, k * 4 + 1.3);
        g.fillStyle = 'rgba(40,24,10,.5)'; g.beginPath(); g.ellipse(kx, ky, cam.zoom * 0.12, cam.zoom * 0.2, 0, 0, 6.283); g.fill();
      }
      // a vine spiralling round the trunk
      g.strokeStyle = '#3f8a3a'; g.lineWidth = Math.max(2, cam.zoom * 0.07);
      g.beginPath();
      for (let wy = Math.floor(w0); wy <= w1 + 1; wy += 0.25) { const [sx, sy] = cam.toScreen(Math.sin(wy * 0.8) * TRUNK * 0.95, wy); if (Math.cos(wy * 0.8) > 0) g.lineTo(sx, sy); else g.moveTo(sx, sy); }
      g.stroke();
      // the canopy at the top
      const [, cy] = cam.toScreen(0, TOP + 2.5);
      if (cy > -200) { const [cx] = cam.toScreen(0, 0); for (let i = -3; i <= 3; i++) leafy(g, cx + i * cam.zoom * 1.3, cy + Math.abs(i) * cam.zoom * 0.4, cam.zoom * 1.4, '#5fb84a', '#3c8a35'); }
      // the jungle floor
      const [, gy] = cam.toScreen(0, 0);
      if (gy < ctx.H + 20) {
        g.fillStyle = '#3c7d34'; g.fillRect(0, gy, ctx.W, ctx.H - gy + 2);
        for (let i = 0; i < 8; i++) leafy(g, (i * 71) % ctx.W, gy + 4, cam.zoom * 0.9, '#5fae45', '#3f8a35');
      }
    }
    function drawBranch(g, b, x, y, rot = 0, alpha = 1) {
      const s = seg(b), L = Math.abs(s.x1 - s.x0);
      const [c1, c2] = COLOURS[b.wear];
      g.save(); g.globalAlpha = alpha;
      const [sx, sy] = cam.toScreen(x ?? s.x0, y ?? s.y);
      g.translate(sx, sy); g.rotate(rot); if (b.side < 0) g.scale(-1, 1);
      const z = cam.zoom, th = 0.2 * z;
      g.fillStyle = c1; g.strokeStyle = c2; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-0.2 * z, -th); g.lineTo(L * z, -th * 0.4); g.lineTo(L * z + 4, 0); g.lineTo(L * z, th * 0.4); g.lineTo(-0.2 * z, th); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.moveTo(0.2 * z, -th * 0.2); g.lineTo(L * z * 0.85, -th * 0.05); g.stroke();
      // colourblind mode: wear shows as cracks too (one for gold, two deep ones for red)
      if (b.wear && cbOn()) {
        g.strokeStyle = 'rgba(30,14,4,.9)'; g.lineWidth = Math.max(2, z * 0.05); g.lineJoin = 'round'; g.lineCap = 'round';
        for (const f of b.wear === 1 ? [0.5] : [0.32, 0.64]) {
          const cx = f * L * z, h = th * (1 - f * 0.6), d = b.wear === 1 ? 0.6 : 1; // a gold crack runs part way, a red one right through
          g.beginPath(); g.moveTo(cx - z * 0.04, -h); g.lineTo(cx + z * 0.06, -h * 0.3); g.lineTo(cx - z * 0.05, h * (2 * d - 1) * 0.4); g.lineTo(cx + z * 0.04, h * (2 * d - 1)); g.stroke();
        }
      }
      leafy(g, L * z * 0.92, -th * 1.3, z * 0.42 * b.grow, '#7ccf52', '#4b9a35');
      g.restore();
    }
    function drawYeti(g) {
      if (Y.mode === 'ground') { const [sx, sy] = cam.toScreen(Y.x, 0); sprite(g, ended ? 'yeti_fall' : 'yeti_hit', ended ? 7 : Math.min(7, groundT * 12), sx, sy, cam.zoom); return; }
      // rotate the hanging pose about his hand so the hand stays on the branch
      const hp = Y.mode === 'hang' ? { x: Y.px, y: Y.py } : handFrom(Y.x, Y.y, Y.phi);
      const rot = Y.phi - BASE;
      const hb = bone(POSE, 'Middle1L', POSE_F);
      const ax = hp.x - (Math.cos(rot) * hb.x - Math.sin(rot) * hb.y), ay = hp.y - (Math.sin(rot) * hb.x + Math.cos(rot) * hb.y);
      const [sx, sy] = cam.toScreen(ax, ay);
      sprite(g, POSE, POSE_F, sx, sy, cam.zoom, { rot: -rot });
    }
    function drawGuide(g) {
      if (Y.mode !== 'hang' || ended) return;
      const v = speedAt(Y.phi), w = Y.dir * v / RAD, c = bodyFrom(Y.px, Y.py, Y.phi);
      let x = c.x, y = c.y, vx = w * RAD * Math.cos(Y.phi), vy = w * RAD * Math.sin(Y.phi);
      g.fillStyle = 'rgba(255,255,255,.55)';
      for (let i = 1; i <= 6; i++) { const st = 0.07; for (let k = 0; k < 2; k++) { vy -= GRAV * st / 2; x += vx * st / 2; y += vy * st / 2; } const [sx, sy] = cam.toScreen(x, y); g.beginPath(); g.arc(sx, sy, 3.4 - i * 0.35, 0, 6.283); g.fill(); }
    }
    function draw(g) {
      drawBackdrop(g);
      drawTrunk(g);
      const vis0 = Math.max(0, Math.floor((cam.bottom - Y0) / GAP) - 1), vis1 = Math.min(LEVELS - 1, Math.ceil((cam.top - Y0) / GAP) + 1);
      for (let k = vis0; k <= vis1; k++) if (slots[k]) drawBranch(g, slots[k]);
      for (const f of falling) drawBranch(g, f.b, f.x - f.b.side * f.b.len / 2, f.y, f.rot, clamp(1 - f.t / 4, 0, 1));
      // level numbers on the trunk every 10 levels
      g.save(); g.font = '900 13px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(255,240,200,.75)';
      for (let k = 9; k < LEVELS; k += 10) { const [lx, ly] = cam.toScreen(0, yOf(k) + 1); if (ly > -20 && ly < ctx.H + 20) g.fillText(k + 1 === LEVELS ? 'TOP' : `${k + 1}`, lx, ly); }
      g.restore();
      drawGuide(g);
      drawYeti(g);
      fx.draw(g, cam);
      // progress bar up the side
      const bh = ctx.H * 0.5, bx = ctx.W - 16, by = ctx.H * 0.25;
      g.fillStyle = 'rgba(10,40,20,.45)'; roundRect(g, bx - 4, by - 4, 10, bh + 8, 5); g.fill();
      g.fillStyle = '#ffd447'; const f = clamp((highest - Y0) / (TOP - Y0), 0, 1); roundRect(g, bx - 1, by + bh * (1 - f), 4, bh * f + 1, 2); g.fill();
    }
    return { update, draw, down: release };
  },
};
