// Llama Spit: the yeti holds a llama at the foot of a terraced mountain pasture. Drag to aim, let go to spit.
// Penguins peek out from behind rocks and bushes or waddle across the terraces; spit on them for points.
// Ibex and rams don't like it (points off), but an ox walking past is worth extra time. Score is points.
import { Camera, FX, sprite, bone, sizeOf, sky, ridge, clouds, snd, buzz, clamp, lerp, rng, roundRect } from './kit.js';

const GRAV = 9.8;
const TIME = 60;         // seconds on the clock at the start
const MAX_ESCAPE = 10;   // penguins that get away before the game ends
const S = 1.5;           // targets are drawn a little larger than life so they read on a phone
const FG = 1.45;         // the yeti and llama are in the foreground, so they are drawn a little larger again
// terraces: y = height of the terrace top, a = where its front edge starts (metres)
const LEDGES = [{ y: 0, a: -3 }, { y: 4, a: 4.8 }, { y: 8, a: 7.3 }, { y: 12, a: 9.8 }, { y: 16, a: 12.2 }];
const RIGHT = 17.5;      // right edge of the field
const KINDS = {
  penguin: { spr: 'penguin', speed: 1.2 },
  ibex: { spr: 'ibex', speed: 1.6 },
  ram: { spr: 'ram', speed: 1.4 },
  ox: { spr: 'ox', speed: 1.5 },
};

// cover objects the animals hide behind, drawn with paths
function drawRock(g, x, y, s, seed) {
  const r = rng(seed);
  g.fillStyle = '#8d97a6'; g.strokeStyle = '#5c6675'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x - s * 0.95, y);
  g.lineTo(x - s * (0.8 + r() * 0.15), y - s * (0.45 + r() * 0.15));
  g.lineTo(x - s * (0.35 + r() * 0.1), y - s * (0.85 + r() * 0.1));
  g.lineTo(x + s * (0.2 + r() * 0.15), y - s * (0.95 + r() * 0.05));
  g.lineTo(x + s * (0.75 + r() * 0.1), y - s * (0.55 + r() * 0.15));
  g.lineTo(x + s, y); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.moveTo(x - s * 0.5, y - s * 0.7); g.lineTo(x + s * 0.1, y - s * 0.85); g.lineTo(x - s * 0.1, y - s * 0.5); g.closePath(); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x - s * 0.05, y - s * 0.88, s * 0.42, s * 0.1, -0.1, 0, 6.283); g.fill();
}
function drawBush(g, x, y, s) {
  const blob = (bx, by, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(bx, by, r, 0, 6.283); g.fill(); };
  blob(x - s * 0.55, y - s * 0.35, s * 0.42, '#3f8f4a'); blob(x + s * 0.55, y - s * 0.35, s * 0.42, '#3f8f4a');
  blob(x, y - s * 0.6, s * 0.55, '#4fa35a'); blob(x - s * 0.25, y - s * 0.7, s * 0.3, '#66b96f');
  blob(x + s * 0.3, y - s * 0.45, s * 0.35, '#58ab62');
  g.fillStyle = '#e5484d'; [[-0.4, -0.55], [0.25, -0.85], [0.6, -0.4], [-0.1, -0.3]].forEach(([dx, dy]) => { g.beginPath(); g.arc(x + dx * s, y + dy * s, s * 0.06, 0, 6.283); g.fill(); });
}
function drawFence(g, x0, x1, y, h) {
  g.strokeStyle = '#8a5a32'; g.lineWidth = Math.max(2, h * 0.12); g.lineCap = 'round';
  for (let x = x0; x <= x1; x += h * 1.1) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke(); }
  g.lineWidth = Math.max(1.5, h * 0.09);
  [0.35, 0.75].forEach((k) => { g.beginPath(); g.moveTo(x0, y - h * k); g.lineTo(x1, y - h * k); g.stroke(); });
}

export default {
  id: 'spit', name: 'Llama Spit', blurb: 'Spit on the penguins, not the other animals', unit: 'pts',
  theme: ['#8fd0f7', '#cdeccb', '#7cc46b'],
  how: [
    'Drag your finger to aim the llama and let go to spit. The further you drag from the llama, the harder it spits. The dotted line shows where the spit starts to go.',
    'Penguins peek out from behind rocks and bushes or waddle across the hills. Hit them for points: far away and quick hits score more, and hitting several in a row builds a combo.',
    'Leave the ibex and the rams alone, they cost you points. Hit the ox as it walks past for 5 extra seconds.',
    'The game ends when the time runs out or when 10 penguins get away.',
  ],
  thumb(g, w, h) {
    g.fillStyle = '#6fbf5f'; g.beginPath(); g.moveTo(0, h * 0.7); g.quadraticCurveTo(w * 0.6, h * 0.55, w, h * 0.68); g.lineTo(w, h); g.lineTo(0, h); g.fill();
    sprite(g, 'llama', 0, w * 0.27, h * 0.97, h * 0.3);
    sprite(g, 'penguin', 0, w * 0.78, h * 0.66, h * 0.32);
    g.fillStyle = 'rgba(225,245,215,.95)'; [[0.5, 0.36, 4], [0.6, 0.33, 3], [0.68, 0.36, 2.4]].forEach(([x, y, r]) => { g.beginPath(); g.arc(w * x, h * y, r, 0, 6.283); g.fill(); });
  },
  create(ctx) {
    const cam = new Camera(ctx, clamp(Math.min(ctx.W / (RIGHT + 3.2), ctx.H * 0.8 / 21), 12, 40));
    cam.fx = 0; cam.fy = 0.95; cam.x = -3.2; cam.y = 0;
    const fx = new FX();
    const R = rng((Math.random() * 1e9) | 0);
    // covers on each terrace (never on the bottom one, where the llama is)
    const covers = [];
    LEDGES.forEach((L, li) => {
      const from = Math.max(L.a + 1.2, li === 0 ? 5 : L.a + 1.2);
      let x = from + R() * 1.2;
      while (x < RIGHT - 0.8) { covers.push({ li, x, kind: R() < 0.5 ? 'rock' : 'bush', s: 0.8 + R() * 0.35, seed: (R() * 1e6) | 0 }); x += 2.6 + R() * 2.4; }
    });
    const fences = LEDGES.slice(1).map((L, i) => (R() < 0.6 ? { li: i + 1, x0: L.a + 0.6 + R() * 2, len: 2 + R() * 3 } : null)).filter(Boolean);
    let t = 0, timeLeft = TIME, score = 0, escaped = 0, combo = 0, hits = 0, shots = 0, ended = false, spawnT = 1.0;
    let aim = null, cool = 0, recoil = 0;
    const gobs = [], splats = [], targets = [];

    const mouth = () => {
      const b = bone('llama', 'Head', 0);
      return { x: 0.4 + (b.x + 0.32) * FG, y: 0.9 + (b.y - 0.16) * FG };
    };
    // the aim: direction from the mouth to the finger, power from how far the finger is
    function launch(px, py) {
      const [wx, wy] = cam.toWorld(px, py), m = mouth();
      let dx = wx - m.x, dy = wy - m.y; const d = Math.hypot(dx, dy) || 1;
      let ang = Math.atan2(dy, dx); ang = clamp(ang, -0.35, 1.45);
      const v = clamp(5 + d * 0.95, 7, 24);
      return { x: m.x, y: m.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v };
    }
    function spawn() {
      const p = Math.min(1, t / TIME);
      const active = targets.filter((q) => !q.gone);
      if (active.length >= 3 + Math.round(p * 2)) return;
      const roll = R();
      const hasOx = active.some((q) => q.kind === 'ox');
      const kind = roll < 0.66 ? 'penguin' : roll < 0.76 ? 'ibex' : roll < 0.86 ? 'ram' : hasOx ? 'penguin' : 'ox';
      const li = kind === 'ox' ? (R() < 0.5 ? 1 : 2) : 1 + Math.floor(R() * (LEDGES.length - 1));
      const L = LEDGES[li], sz = sizeOf(KINDS[kind].spr);
      const myCovers = covers.filter((c) => c.li === li);
      const T = { kind, li, sz, x: 0, dir: 1, rise: 0, state: 'in', t: 0, seen: 0, hp: 1, gone: false, rot: 0, vy: 0, vx: 0, y: L.y };
      if (kind !== 'ox' && myCovers.length && R() < 0.62) {
        // peek out from behind a cover for a moment
        const c = myCovers[Math.floor(R() * myCovers.length)];
        if (targets.some((q) => !q.gone && q.cover === c)) return;
        Object.assign(T, { mode: 'peek', cover: c, x: c.x + (R() - 0.5) * 0.4, stay: lerp(2.0, 1.0, p) + R() * 0.6, dir: R() < 0.5 ? 1 : -1 });
      } else {
        // waddle across the terrace (the ox walks the full width)
        const dir = R() < 0.5 ? 1 : -1;
        const speed = KINDS[kind].speed * (kind === 'penguin' ? lerp(1, 1.9, p) : 1) * (0.85 + R() * 0.3);
        Object.assign(T, { mode: 'walk', dir, speed, x: dir > 0 ? L.a + 0.4 : RIGHT + 1, rise: 1, state: 'walk' });
      }
      targets.push(T);
    }
    // visible box of a target in world units: [left, right, bottom, top]
    function box(T) {
      const w = T.sz.w * S, h = T.sz.h * S, L = LEDGES[T.li];
      const feet = T.y - (1 - T.rise) * h;
      return [T.x - w * 0.32, T.x + w * 0.32, Math.max(feet, L.y - (T.mode === 'peek' ? 0 : 0.2)), feet + h * 0.92];
    }
    function hit(T, gob) {
      const L = LEDGES[T.li];
      if (T.kind === 'penguin') {
        combo++; hits++;
        const dist = Math.hypot(T.x, L.y);
        const quick = T.seen < 0.7 ? 40 : 0;
        const mult = Math.min(3, 1 + (combo - 1) * 0.25);
        const pts = Math.round((50 + dist * 4 + quick) * mult);
        score += pts;
        fx.text(T.x, L.y + T.sz.h * S + 0.4, `+${pts}`, { color: '#ffd447', size: 22 });
        if (quick) fx.text(T.x, L.y + T.sz.h * S + 1.4, 'Quick!', { color: '#fff', size: 16 });
        if (combo >= 3) fx.text(T.x - 1, L.y + T.sz.h * S + 2.2, `Combo x${combo}`, { color: '#7ef0a4', size: 16 });
        T.state = 'tumble'; T.vx = gob.vx * 0.25 + 1.5; T.vy = 5.5; T.spin = (R() < 0.5 ? -1 : 1) * 9;
        snd.boing(1 + Math.min(0.6, combo * 0.08)); buzz(20);
      } else if (T.kind === 'ox') {
        timeLeft += 5; score += 20;
        fx.text(T.x, L.y + T.sz.h * S + 0.5, '+5 seconds', { color: '#7ef0a4', size: 22 });
        T.state = 'happy'; T.used = true; T.t = 0; snd.ding(4); buzz(20);
      } else {
        combo = 0; score = Math.max(0, score - 60);
        fx.text(T.x, L.y + T.sz.h * S + 0.5, '-60', { color: '#ff6b6b', size: 22 });
        T.state = 'angry'; T.t = 0; T.dir = gob.vx > 0 ? 1 : -1; T.speed = 4.5; snd.thud(); buzz([40, 30, 40]); cam.shake(5, 0.25);
      }
      fx.burst(gob.x, gob.y, { n: 14, color: ['#e9f7d8', '#c9eab0', '#ffffff'], speed: 4, up: 2, size: 0.13, life: 0.6 });
    }
    function escape(T) {
      if (T.kind !== 'penguin' || T.gone || ended) return;
      escaped++; combo = 0;
      fx.text(clamp(T.x, 1, RIGHT - 1), LEDGES[T.li].y + 1.8, 'Got away', { color: '#ffb3b3', size: 15 });
      snd.tick();
      if (escaped >= MAX_ESCAPE) end('Too many penguins got away');
    }
    function end(line) {
      if (ended) return; ended = true; aim = null; ctx.prompt('');
      const acc = shots ? Math.round((hits / shots) * 100) : 0;
      if (score > (ctx.best || 0) && score > 0) snd.cheer(); else snd.fail();
      ctx.finish(score, `${line}. ${hits} penguin${hits === 1 ? '' : 's'} hit, ${acc}% of spits on target`);
    }

    ctx.prompt('Drag to aim, let go to spit');
    function update(dt) {
      t += dt; cam.update(dt); fx.update(dt);
      if (!ended) {
        timeLeft -= dt;
        if (timeLeft <= 0) { timeLeft = 0; end('Time is up'); }
        spawnT -= dt;
        if (spawnT <= 0) { spawn(); const p = Math.min(1, t / TIME); spawnT = lerp(1.5, 0.7, p) + R() * 0.6; }
      }
      cool = Math.max(0, cool - dt); recoil = Math.max(0, recoil - dt * 4);
      for (const T of targets) {
        if (T.gone) continue;
        T.t += dt; if (T.rise > 0.4) T.seen += dt;
        const L = LEDGES[T.li];
        if (T.state === 'in') { T.rise = Math.min(1, T.rise + dt * 4); if (T.rise >= 1) { T.state = 'up'; T.t = 0; } }
        else if (T.state === 'up') { if (T.t > T.stay) T.state = 'out'; }
        else if (T.state === 'out') { T.rise -= dt * 4; if (T.rise <= 0) { escape(T); T.gone = true; } }
        else if (T.state === 'walk') { T.x += T.dir * T.speed * dt; if ((T.dir > 0 && T.x > RIGHT + 1.2) || (T.dir < 0 && T.x < L.a - 0.2)) { escape(T); T.gone = true; } }
        else if (T.state === 'tumble') { T.vy -= GRAV * dt; T.x += T.vx * dt; T.y += T.vy * dt; T.rot += T.spin * dt; if (T.y < L.y - 6) T.gone = true; }
        else if (T.state === 'angry') { if (T.t > 0.5) T.x += T.dir * T.speed * dt; if (T.x > RIGHT + 2 || T.x < L.a - 2) T.gone = true; }
        else if (T.state === 'happy') { T.x += T.dir * T.speed * 0.6 * dt; if (T.t > 0.8) T.state = 'walk'; }
      }
      for (let i = targets.length - 1; i >= 0; i--) if (targets[i].gone) targets.splice(i, 1);
      for (const G of gobs) {
        if (G.done) continue;
        const py = G.y;
        G.vy -= GRAV * dt; G.x += G.vx * dt; G.y += G.vy * dt;
        G.trail.push([G.x, G.y]); if (G.trail.length > 7) G.trail.shift();
        for (const T of targets) {
          if (!['in', 'up', 'out', 'walk'].includes(T.state) || T.used) continue; // an ox only gives its bonus once
          const [l, r, b, tp] = box(T);
          if (G.x > l - 0.18 && G.x < r + 0.18 && G.y > b - 0.18 && G.y < tp + 0.18) { G.done = true; G.hit = true; hit(T, G); break; }
        }
        if (G.done) continue;
        // lands on the terrace it is over when it drops through its top
        for (let li = LEDGES.length - 1; li >= 0; li--) {
          const L = LEDGES[li];
          if (G.x >= L.a + (li ? 0.5 : -9) && py >= L.y && G.y < L.y && G.vy < 0) { G.done = true; splats.push({ x: G.x, y: L.y, t: 0 }); fx.burst(G.x, L.y, { n: 8, color: ['#e9f7d8', '#c9eab0'], speed: 2.5, up: 1.5, size: 0.11, life: 0.5 }); break; }
        }
        if (!G.done && (G.x > RIGHT + 3 || G.y < -2)) G.done = true;
        if (G.done && !G.hit) { combo = 0; snd.crunch(); }
      }
      for (let i = gobs.length - 1; i >= 0; i--) if (gobs[i].done) gobs.splice(i, 1);
      for (const s of splats) s.t += dt;
      while (splats.length && splats[0].t > 4) splats.shift();
      const secs = Math.ceil(timeLeft);
      ctx.hud({ left: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, center: `${score} pts`, right: `Escaped ${escaped}/${MAX_ESCAPE}` });
    }

    function down(x, y) { if (ended) return; aim = launch(x, y); }
    function move(x, y) { if (aim && !ended) aim = launch(x, y); }
    function up(x, y) {
      if (!aim || ended) { aim = null; return; }
      const a = launch(x, y); aim = null;
      if (cool > 0) return;
      cool = 0.3; recoil = 1; shots++;
      gobs.push({ ...a, trail: [], done: false });
      snd.spit(); buzz(10); ctx.prompt('');
    }

    function ledgeFace(g, L, next, color, top) {
      // the hill band of one terrace: a slope up from the terrace below, then flat to the right
      const [ax, ay] = cam.toScreen(L.a, next ? next.y : L.y), [bx, by] = cam.toScreen(L.a + 1.6, L.y);
      const [, gy] = cam.toScreen(0, next ? next.y : -3);
      g.fillStyle = color;
      g.beginPath(); g.moveTo(ax - 2, gy + 2); g.lineTo(ax, ay);
      g.bezierCurveTo(ax + (bx - ax) * 0.4, ay, ax + (bx - ax) * 0.5, by, bx, by);
      g.lineTo(ctx.W + 10, by); g.lineTo(ctx.W + 10, gy + 2); g.closePath(); g.fill();
      g.fillStyle = top; g.fillRect(bx, by, ctx.W - bx + 10, Math.max(3, cam.zoom * 0.12));
    }
    function drawTarget(g, T) {
      const L = LEDGES[T.li], h = T.sz.h * S;
      const [x, y] = cam.toScreen(T.x, T.y - (1 - T.rise) * h);
      const flip = T.dir < 0;
      const name = KINDS[T.kind].spr;
      const bob = T.state === 'walk' || T.state === 'happy' ? Math.abs(Math.sin(T.t * 9)) * 0.05 * cam.zoom : 0;
      const fr = T.kind === 'ox' ? (T.t * 10) % 8 : 0;
      if (T.state === 'tumble') { sprite(g, name, 0, x, y - h * cam.zoom * 0.5, cam.zoom, { anchor: 'center', rot: T.rot, scale: S, flip }); return; }
      // peeking animals are clipped at the terrace top, so they rise from behind their cover
      g.save();
      if (T.mode === 'peek') { const [, cy] = cam.toScreen(0, L.y); g.beginPath(); g.rect(0, 0, ctx.W, cy + 1); g.clip(); }
      sprite(g, name, fr, x, y - bob, cam.zoom, { scale: S, flip, rot: T.state === 'walk' && T.kind === 'penguin' ? Math.sin(T.t * 9) * 0.08 : 0 });
      g.restore();
      if (T.state === 'angry') {
        const [hx, hy] = cam.toScreen(T.x, L.y + h + 0.3);
        g.save(); g.strokeStyle = '#e5484d'; g.lineWidth = 3; g.lineCap = 'round';
        for (let k = 0; k < 3; k++) { const a = -0.9 + k * 0.6, r0 = 6, r1 = 14 + Math.sin(T.t * 20 + k) * 2; g.beginPath(); g.moveTo(hx + Math.sin(a) * r0, hy - Math.cos(a) * r0); g.lineTo(hx + Math.sin(a) * r1, hy - Math.cos(a) * r1); g.stroke(); }
        g.restore();
      }
      if (T.state === 'happy') { const [hx, hy] = cam.toScreen(T.x, L.y + h + 0.2); g.fillStyle = '#ffd447'; g.font = '900 16px system-ui'; g.textAlign = 'center'; g.fillText('+5 s', hx, hy - Math.min(1, T.t * 3) * 10); }
    }

    function draw(g) {
      sky(g, ctx, ['#69b9ef', '#b7e1fb', '#eef9ff']);
      clouds(g, ctx, cam, { t, count: 5, seed: 8, y0: 0.04, y1: 0.22 });
      const [, topY] = cam.toScreen(0, LEDGES[LEDGES.length - 1].y);
      const topF = topY / ctx.H;
      ridge(g, cam, { par: 0, yPar: 0, y: topF + 0.02, amp: 0.3, width: 160, seed: 31, color: '#8fb3d9', snow: { above: 0.45, color: '#f4fbff' }, peaks: true });
      ridge(g, cam, { par: 0, yPar: 0, y: topF + 0.03, amp: 0.12, width: 110, seed: 37, color: '#9cc98a' });
      const greens = ['#5fb05a', '#68b862', '#72c06a', '#7dc873', '#88cf7c'], tops = ['#86c97a', '#8fd283', '#99d98c', '#a3e095', '#addf9e'];
      // terraces from the far (top) one down to the near one; each one's animals and covers before the nearer band
      for (let li = LEDGES.length - 1; li >= 0; li--) {
        const L = LEDGES[li], next = LEDGES[li - 1];
        ledgeFace(g, L, next, greens[LEDGES.length - 1 - li], tops[LEDGES.length - 1 - li]);
        for (const f of fences) if (f.li === li) { const [x0, y0] = cam.toScreen(f.x0, L.y), [x1] = cam.toScreen(f.x0 + f.len, L.y); drawFence(g, x0, x1, y0, cam.zoom * 0.85); }
        for (const s of splats) if (Math.abs(s.y - L.y) < 0.01) { const [sx, sy] = cam.toScreen(s.x, s.y); g.fillStyle = `rgba(214,240,190,${Math.max(0, 0.9 - s.t / 4)})`; g.beginPath(); g.ellipse(sx, sy, cam.zoom * 0.32, cam.zoom * 0.08, 0, 0, 6.283); g.fill(); }
        for (const T of targets) if (T.li === li && T.state !== 'tumble') drawTarget(g, T);
        for (const c of covers) if (c.li === li) { const [cx, cy] = cam.toScreen(c.x, L.y); if (c.kind === 'rock') drawRock(g, cx, cy + 2, c.s * cam.zoom * 1.05, c.seed); else drawBush(g, cx, cy + 2, c.s * cam.zoom * 1.1); }
      }
      // the yeti holding the llama up
      const [yx, yy] = cam.toScreen(-1.1, 0);
      sprite(g, 'yeti_idle', (t * 8) % 8, yx, yy, cam.zoom * FG);
      const [lx, ly] = cam.toScreen(0.4, 0.9);
      sprite(g, 'llama', 0, lx, ly, cam.zoom * FG, { rot: -recoil * 0.12 });
      // tumbling penguins fly over everything
      for (const T of targets) if (T.state === 'tumble') drawTarget(g, T);
      // spit
      for (const G of gobs) {
        G.trail.forEach(([x, y], i) => { const [sx, sy] = cam.toScreen(x, y); g.fillStyle = `rgba(230,248,215,${(i + 1) / G.trail.length * 0.5})`; g.beginPath(); g.arc(sx, sy, cam.zoom * 0.08 * (i + 1) / G.trail.length + 1, 0, 6.283); g.fill(); });
        const [sx, sy] = cam.toScreen(G.x, G.y);
        g.fillStyle = '#e9f7d8'; g.strokeStyle = '#8cbf72'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(sx, sy, Math.max(4, cam.zoom * 0.17), 0, 6.283); g.fill(); g.stroke();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(sx - 2, sy - 2, Math.max(1.5, cam.zoom * 0.05), 0, 6.283); g.fill();
      }
      // dotted aim arc for the first part of the flight
      if (aim) {
        let x = aim.x, y = aim.y, vx = aim.vx, vy = aim.vy;
        for (let i = 0; i < 16; i++) {
          for (let k = 0; k < 3; k++) { vy -= GRAV * 0.012; x += vx * 0.012; y += vy * 0.012; }
          const [sx, sy] = cam.toScreen(x, y);
          g.fillStyle = `rgba(255,255,255,${1 - i / 16})`; g.strokeStyle = 'rgba(30,60,40,.5)'; g.lineWidth = 1;
          g.beginPath(); g.arc(sx, sy, 3.6 - i * 0.12, 0, 6.283); g.fill(); g.stroke();
        }
      }
      fx.draw(g, cam);
      // combo badge
      if (combo >= 2 && !ended) {
        g.save(); g.fillStyle = 'rgba(15,30,55,.55)'; roundRect(g, ctx.W / 2 - 46, 40, 92, 24, 12); g.fill();
        g.fillStyle = '#7ef0a4'; g.font = '900 14px system-ui'; g.textAlign = 'center'; g.fillText(`Combo x${combo}`, ctx.W / 2, 57); g.restore();
      }
    }
    return { update, draw, down, move, up };
  },
};
