// Web Swing: Spider-Man swings across the city. The rules, the city and the scoring live in swing-engine.js;
// this file draws it and turns events into sound, particles and banners.
import { Camera, FX, snd, buzz, clamp, lerp, fmt, roundRect } from '../yeti/kit.js';
import { drawHero, heroById, skyline, drawRobot, runPose } from './kit.js';
import { store, save } from '../store.js';
import * as E from './swing-engine.js';

const spidey = () => heroById('spidey');

// Sky, skyline and building colours through the day. The city goes from day to dusk to night and back as you swing.
const PHASES = [
  { at: 0, top: '#5aa9e6', bot: '#cfe9ff', far: '#9fbfdc', near: '#7f9fc2', bld: ['#4a6a95', '#56628f', '#4b7590'], win: 0.15, sun: '#fff6c8', moon: 0 },
  { at: 0.28, top: '#5aa9e6', bot: '#d9eeff', far: '#9fbfdc', near: '#7f9fc2', bld: ['#4a6a95', '#56628f', '#4b7590'], win: 0.15, sun: '#fff6c8', moon: 0 },
  { at: 0.42, top: '#3b4a8a', bot: '#ffb486', far: '#b07a90', near: '#7d5f8f', bld: ['#3a3f6a', '#47395f', '#3a4a66'], win: 0.5, sun: '#ffd29a', moon: 0 },
  { at: 0.56, top: '#0c1430', bot: '#2b2f5e', far: '#2a3260', near: '#1f2750', bld: ['#1b2240', '#221d3c', '#1a2a3e'], win: 0.85, sun: '#f4f1ff', moon: 1 },
  { at: 0.86, top: '#0c1430', bot: '#2b2f5e', far: '#2a3260', near: '#1f2750', bld: ['#1b2240', '#221d3c', '#1a2a3e'], win: 0.85, sun: '#f4f1ff', moon: 1 },
  { at: 1, top: '#5aa9e6', bot: '#cfe9ff', far: '#9fbfdc', near: '#7f9fc2', bld: ['#4a6a95', '#56628f', '#4b7590'], win: 0.15, sun: '#fff6c8', moon: 0 },
];
const DAY = 1800; // metres for one full day
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`; };
function phaseAt(d) {
  const p = ((d % DAY) + DAY) % DAY / DAY;
  let i = 0; while (i < PHASES.length - 2 && p > PHASES[i + 1].at) i++;
  const A = PHASES[i], B = PHASES[i + 1], t = clamp((p - A.at) / (B.at - A.at || 1), 0, 1);
  return { top: mix(A.top, B.top, t), bot: mix(A.bot, B.bot, t), far: mix(A.far, B.far, t), near: mix(A.near, B.near, t), bld: A.bld.map((c, k) => mix(c, B.bld[k], t)), win: lerp(A.win, B.win, t), sun: mix(A.sun, B.sun, t), moon: lerp(A.moon, B.moon, t), dusk: Math.max(0, 1 - Math.abs(p - 0.45) / 0.12) };
}

const FLIP_WORDS = ['', 'Flip!', 'Double flip!', 'Triple flip!', 'Quad flip!'];

export default {
  id: 'swing', name: 'Web Swing', blurb: 'Swing with Spider-Man across the city skyline', unit: 'm',
  theme: ['#ff9e7a', '#ffcf8a', '#ffe7c4'],
  star: spidey,
  how: [
    'Hold anywhere to shoot a web at the glowing target ahead, and keep holding to swing. Holding also reels the web in a little, which speeds you up.',
    'Let go to fly. Let go just after the bottom of a forward swing, when Spider-Man glows gold, for a perfect release and a burst of speed.',
    'Quick tap in the air to flip. Each flip in the same jump scores more, but land a flip halfway round and you lose your combo. Flip into a drone to kick it out of the sky.',
    'Swing again before you land to build a combo. Hit a wall fast and you run up it, so tap to vault onto the roof. On a roof you run, and tap to jump off.',
    'Fly through speed rings, grab coins, and finish the three challenges shown at the start for bonus coins. Touch the street and the run is over.',
  ],
  thumb(g, w, h) {
    skyline(g, w, h, 0, { par: 0, base: 1, tall: 0.75, col: '#c7745e', win: 'rgba(255,240,200,.5)', width: 26, seed: 4 });
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.85, 0); g.lineTo(w * 0.55, h * 0.45); g.stroke();
    drawHero(g, w * 0.5, h * 0.95, h * 0.55, { look: spidey().look, pose: 'swing', rot: 0.5 });
  },
  create(ctx) {
    const baseZoom = clamp(ctx.H / 30, 14, 30);
    const cam = new Camera(ctx, baseZoom); cam.fx = 0.32; cam.fy = 0.55;
    const fx = new FX();
    const S = E.createRun((Math.random() * 1e9) | 0);
    cam.x = S.x + 4; cam.y = S.y + 3;
    if (typeof window !== 'undefined') window.__swingRun = S; // lets automated checks drive and inspect a run
    const hs = store.hero, ghost = hs.swingGhost && hs.swingGhost.p ? hs.swingGhost : null;
    const rec = []; let recT = 0;
    let t = 0, over = false, banner = null, flash = 0, speedFx = 0;
    const lines = Array.from({ length: 26 }, (_, i) => ({ y: (i * 37) % 100 / 100, x: (i * 53) % 100 / 100, l: 0.3 + ((i * 17) % 10) / 14 }));
    ctx.prompt('Hold to swing');
    ctx.hud({ left: '0 m', right: '0 coins' });
    // floating words: if several come close together, stack them so they do not print over each other
    let sayT = -9, sayN = 0;
    const say = (text, color = '#fff', size = 22) => { sayN = t - sayT < 0.6 ? sayN + 1 : 0; sayT = t; fx.text(S.x + 1.5, S.y + HERO_TOP() + 1.5 + sayN * 1.7, text, { color, size }); };
    const HERO_TOP = () => E.HERO_H + 0.6;
    function showBanner(text, sub = '', color = '#ffd447') { banner = { text, sub, color, t: 0 }; }

    function react(e) {
      switch (e.k) {
        case 'start': ctx.prompt(''); snd.boing(1); break;
        case 'jump': snd.boing(1.1); break;
        case 'web': snd.spit(); buzz(6); if (e.combo >= 2 && e.combo % 5 === 0) say(`Combo x${e.combo}`, '#7fe3ff', 24); break;
        case 'miss': snd.swoosh(); say('Nothing in reach', '#ffffff', 15); break;
        case 'release': snd.swoosh(); break;
        case 'sweet': snd.swoosh(); snd.boing(1.6); flash = 0.25; say('Perfect!', '#ffd447', 24); fx.burst(S.x, S.y + 1, { n: 14, color: ['#ffd447', '#fff3b0'], speed: 6, size: 0.14, life: 0.6, grav: 2 }); break;
        case 'flipstart': snd.flap(); break;
        case 'flip': say(FLIP_WORDS[Math.min(4, e.n)] || `${e.n} flips!`, '#ff8ad8', 22 + Math.min(8, e.n * 2)); snd.ding(4 + e.n); break;
        case 'land': snd.thud(); fx.dust(S.x, S.y, 8); if (e.combo >= 3) say(`${e.combo} swing combo`, '#7fe3ff', 18); break;
        case 'badland': snd.thud(); snd.crunch(); cam.shake(8); fx.dust(S.x, S.y, 14); say('Ouch! Combo lost', '#ff7a7a', 18); buzz(30); break;
        case 'edge': snd.flap(); break;
        case 'wall': snd.whack(0.4); fx.dust(S.x + 0.4, S.y + 0.5, 6); say('Wall run!', '#ffffff', 18); break;
        case 'kickoff': snd.boing(1.3); break;
        case 'wallfall': snd.swoosh(); break;
        case 'bonk': snd.thud(); cam.shake(6); buzz(20); break;
        case 'coin': snd.ding(e.n % 7); fx.stars(e.cx, e.cy, 6); break;
        case 'ring': snd.ding(9); snd.boing(1.8); flash = 0.2; fx.burst(e.cx, e.cy, { n: 18, color: ['#7fe3ff', '#ffffff', '#4fc3ff'], speed: 8, size: 0.15, life: 0.6, grav: 0 }); say('Speed ring!', '#7fe3ff', 18); break;
        case 'kick': snd.whack(1); cam.shake(12, 0.35); buzz([20, 30, 20]); fx.burst(e.cx, e.cy, { n: 22, color: ['#c9ced6', '#ff9f43', '#ffd447', '#6b7280'], speed: 9, size: 0.2, life: 0.8, grav: 10 }); say('Drone kicked!', '#ffd447', 22); break;
        case 'hit': snd.crunch(); cam.shake(10); buzz(40); fx.burst(e.cx, e.cy, { n: 16, color: ['#c9ced6', '#ff6b6b'], speed: 7, size: 0.18, life: 0.7, grav: 10 }); say('Drone hit you!', '#ff7a7a', 18); break;
        case 'milestone': [0, 1, 2].forEach((i) => setTimeout(() => snd.ding(6 + i * 2), i * 90)); showBanner(`${fmt(e.m)} m`, 'Keep swinging'); break;
        case 'challenge': snd.cheer(); buzz([20, 40, 20]); showBanner('Challenge done', `${e.text}  +${e.reward} coins`, '#7dff9a'); break;
        case 'dead': finish(); break;
        default: break;
      }
    }
    function finish() {
      over = true; snd.fail(); cam.shake(12); fx.dust(S.x, 0.2, 20); buzz(60);
      const d = Math.max(0, S.dist), done = S.challenges.filter((c) => c.done).length;
      if (d > (ctx.best || 0) && rec.length > 4) { hs.swingGhost = { d: Math.round(d), p: rec }; save(); }
      ctx.finish(d, done ? `${done} of 3 challenges done` : 'No challenges this time', {
        coins: E.coinsEarned(S),
        stats: [['Best combo', `x${S.bestCombo}`], ['Flips', String(S.flips)], ['Perfect releases', String(S.sweets)], ['Speed rings', String(S.rings)], ['Drones kicked', String(S.kicks)], ['Coins grabbed', String(S.coins)]],
        challenges: S.challenges.map((c) => ({ text: c.text, done: c.done, reward: c.reward })),
      });
    }

    // ---------- drawing helpers ----------
    const W0 = () => ctx.W, H0 = () => ctx.H;
    const sc = (x, y) => cam.toScreen(x, y);
    function drawBuilding(g, b, ph) {
      const [x0, y0] = sc(b.x, b.h), [x1, y1] = sc(b.x + b.w, 0);
      if (x1 < -20 || x0 > W0() + 20) return;
      const k = (Math.abs(Math.floor(b.x * 7)) % 3);
      g.fillStyle = ph.bld[k]; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x1 - (x1 - x0) * 0.16, y0, (x1 - x0) * 0.16, y1 - y0);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x0 - 2, y0 - 4, x1 - x0 + 4, 5);
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x0 - 2, y0 - 4, x1 - x0 + 4, 1.5);
      const cw = cam.zoom * 1.1, ch = cam.zoom * 1.5, lit = ph.win;
      for (let wy = y0 + ch * 0.7; wy < y1 - ch * 0.5; wy += ch * 1.45) {
        for (let wx = x0 + cw * 0.6; wx < x1 - cw * 1.1; wx += cw * 1.6) {
          const h = ((Math.floor(wx / cw) * 73856093) ^ (Math.floor((wy - y0) / ch) * 19349663) ^ Math.floor(b.x * 31)) >>> 0;
          const on = (h % 100) / 100 < lit;
          g.fillStyle = on ? 'rgba(255,214,120,.85)' : 'rgba(255,255,255,.09)';
          g.fillRect(wx, wy, cw, ch);
        }
      }
      // a water tank on some roofs
      if (Math.floor(b.x) % 3 === 0 && b.w > 7) {
        const [tx, ty] = sc(b.x + b.w * 0.72, b.h), s = cam.zoom;
        g.fillStyle = '#6b4a35'; g.fillRect(tx - s * 0.9, ty - s * 2.2, s * 1.8, s * 1.4);
        g.fillStyle = '#4a3326'; g.beginPath(); g.moveTo(tx - s * 1.1, ty - s * 2.2); g.lineTo(tx, ty - s * 2.9); g.lineTo(tx + s * 1.1, ty - s * 2.2); g.fill();
        g.strokeStyle = '#3a2a1e'; g.lineWidth = Math.max(1, s * 0.12); g.beginPath(); g.moveTo(tx - s * 0.7, ty - s * 0.8); g.lineTo(tx - s * 0.7, ty); g.moveTo(tx + s * 0.7, ty - s * 0.8); g.lineTo(tx + s * 0.7, ty); g.stroke();
      }
    }
    function lattice(g, xa, ya, xb, yb, wpx, col) {
      g.strokeStyle = col; g.lineWidth = Math.max(1, wpx * 0.12);
      const n = Math.max(2, Math.round(Math.hypot(xb - xa, yb - ya) / (wpx * 1.4)));
      const nx = -(yb - ya), ny = xb - xa, L = Math.hypot(nx, ny) || 1, ox = nx / L * wpx / 2, oy = ny / L * wpx / 2;
      g.beginPath(); g.moveTo(xa + ox, ya + oy); g.lineTo(xb + ox, yb + oy); g.moveTo(xa - ox, ya - oy); g.lineTo(xb - ox, yb - oy);
      for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n; g.moveTo(lerp(xa, xb, t0) + ox, lerp(ya, yb, t0) + oy); g.lineTo(lerp(xa, xb, t1) - ox, lerp(ya, yb, t1) - oy); }
      g.stroke();
    }
    function drawProp(g, p, ph) {
      const z = cam.zoom, col = ph.moon > 0.5 ? '#e0a83a' : '#f2b531';
      if (p.kind === 'crane' || p.kind === 'tower') {
        const baseX = p.kind === 'crane' ? p.bx : p.x - 1.5, baseY = p.kind === 'crane' ? p.base : 0;
        const [bx, by] = sc(baseX, baseY), [tx, ty] = sc(baseX, p.y + 0.6), [hx, hy] = sc(p.x, p.y + 0.6), [ax, ay] = sc(p.x, p.y);
        if (Math.max(bx, hx) < -40 || Math.min(bx, hx) > W0() + 40) return;
        lattice(g, bx, by, tx, ty, z * 0.9, col);
        lattice(g, sc(baseX - 3, 0)[0], ty, hx + z * 0.6, hy, z * 0.7, col);
        g.fillStyle = '#3d3d48'; g.fillRect(sc(baseX - 3.4, 0)[0], ty - z * 0.2, z * 1.4, z * 1.1);
        g.strokeStyle = 'rgba(30,30,40,.8)'; g.lineWidth = 1; g.beginPath(); g.moveTo(hx, hy); g.lineTo(ax, ay); g.stroke();
        g.fillStyle = '#d9d9df'; g.beginPath(); g.arc(ax, ay, Math.max(2, z * 0.22), 0, 6.283); g.fill();
      } else if (p.kind === 'board') {
        const [cx, cy] = sc(p.x, p.y), [, by] = sc(p.x, p.base), wpx = p.w * z, hpx = z * 2.6;
        if (cx + wpx < -20 || cx - wpx > W0() + 20) return;
        g.strokeStyle = '#2b2b33'; g.lineWidth = Math.max(1.5, z * 0.18);
        g.beginPath(); g.moveTo(cx - wpx * 0.3, by); g.lineTo(cx - wpx * 0.3, cy + hpx * 0.6); g.moveTo(cx + wpx * 0.3, by); g.lineTo(cx + wpx * 0.3, cy + hpx * 0.6); g.stroke();
        const cols = [['#e23636', '#ffd447'], ['#2b6cb0', '#ffffff'], ['#16a085', '#f1c40f'], ['#8e44ad', '#ff8ad8']][p.hue || 0];
        g.fillStyle = cols[0]; roundRect(g, cx - wpx / 2, cy, wpx, hpx, z * 0.2); g.fill();
        g.fillStyle = cols[1]; g.fillRect(cx - wpx * 0.4, cy + hpx * 0.32, wpx * 0.8, hpx * 0.14); g.fillRect(cx - wpx * 0.4, cy + hpx * 0.58, wpx * 0.55, hpx * 0.1);
        if (ph.moon > 0.4) { g.fillStyle = 'rgba(255,255,255,.12)'; roundRect(g, cx - wpx / 2, cy, wpx, hpx, z * 0.2); g.fill(); }
      } else if (p.kind === 'wire') {
        const [x0, y0] = sc(p.x0, p.h0), [x1, y1] = sc(p.x1, p.h1), [, t0] = sc(p.x0, p.y + 0.8), [, t1] = sc(p.x1, p.y + 0.8), [ax, ay] = sc(p.x, p.y);
        if (x1 < -20 || x0 > W0() + 20) return;
        g.strokeStyle = '#2b2b33'; g.lineWidth = Math.max(1.5, z * 0.15);
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, t0); g.moveTo(x1, y1); g.lineTo(x1, t1); g.stroke();
        g.strokeStyle = 'rgba(25,25,35,.85)'; g.lineWidth = Math.max(1, z * 0.07);
        g.beginPath(); g.moveTo(x0, t0); g.quadraticCurveTo(ax, ay + (ay - (t0 + t1) / 2), x1, t1); g.stroke();
        g.fillStyle = '#d9d9df'; g.beginPath(); g.arc(ax, ay, Math.max(2, z * 0.2), 0, 6.283); g.fill();
      }
    }
    function sky(g, ph) {
      const W = W0(), H = H0();
      const sk = g.createLinearGradient(0, 0, 0, H); sk.addColorStop(0, ph.top); sk.addColorStop(1, ph.bot);
      g.fillStyle = sk; g.fillRect(0, 0, W, H);
      if (ph.moon > 0.05) { // stars
        g.fillStyle = `rgba(255,255,255,${0.7 * ph.moon})`;
        for (let i = 0; i < 40; i++) { const x = ((i * 97 + 13) % 100) / 100 * W, y = ((i * 61 + 7) % 60) / 100 * H; g.fillRect(x, y, 1.6, 1.6); }
      }
      const r = Math.min(W, H) * 0.07;
      g.fillStyle = ph.sun; g.globalAlpha = 0.9; g.beginPath(); g.arc(W * 0.8, H * (0.22 + 0.1 * ph.dusk), r, 0, 6.283); g.fill(); g.globalAlpha = 1;
      if (ph.moon > 0.5) { g.fillStyle = ph.top; g.beginPath(); g.arc(W * 0.8 + r * 0.45, H * 0.22 - r * 0.2, r * 0.85, 0, 6.283); g.fill(); }
      const camPx = cam.x * cam.zoom;
      skyline(g, W, H, camPx, { par: 0.1, base: 0.86, tall: 0.55, col: ph.far, win: null, width: 46, seed: 2 });
      skyline(g, W, H, camPx, { par: 0.28, base: 0.93, tall: 0.5, col: ph.near, win: ph.win > 0.4 ? 'rgba(255,220,140,.4)' : null, width: 58, seed: 7 });
    }

    return {
      down() { if (!over) E.press(S); },
      up() { if (!over) E.release(S); },
      update(dt) {
        t += dt;
        if (banner) { banner.t += dt; if (banner.t > 2.2) banner = null; }
        flash = Math.max(0, flash - dt);
        if (!over) {
          E.step(S, dt);
          for (const e of S.events) react(e);
          S.events.length = 0;
          if (S.mode !== 'start') { recT += dt; if (recT >= 0.1) { recT -= 0.1; if (rec.length < 6000) rec.push(Math.round(S.x * 10), Math.round(S.y * 10)); } }
        }
        const sp = Math.hypot(S.vx, S.vy);
        speedFx += ((sp > 20 ? Math.min(1, (sp - 20) / 15) : 0) - speedFx) * Math.min(1, dt * 4);
        cam.zoomTo(baseZoom * (1 - Math.min(0.3, 0.22 * speedFx + (S.y > 26 ? Math.min(0.15, (S.y - 26) / 60) : 0))), dt, 2);
        cam.follow(S.x + clamp(S.vx * 0.25, -2, 6), clamp(S.y + 3, 10, 44), dt, 4);
        cam.update(dt); fx.update(dt);
        ctx.hud({ left: `${fmt(Math.max(0, S.dist))} m`, center: S.combo >= 2 ? `Combo x${S.combo}` : '', right: `${S.coins} coins` });
      },
      draw(g) {
        const W = W0(), H = H0(), ph = phaseAt(S.dist);
        sky(g, ph);
        // street
        const [, sy] = sc(0, 0);
        g.fillStyle = ph.moon > 0.5 ? '#1c1c26' : '#3a3a48'; g.fillRect(0, sy, W, H - sy);
        g.fillStyle = '#f2c230'; for (let x = Math.floor(cam.left / 6) * 6; x < cam.right + 6; x += 6) { const [px] = sc(x, 0); g.fillRect(px, sy + 10, cam.zoom * 2.5, 3); }
        // best distance marker
        if (ctx.best > 20) {
          const [bx] = sc(ctx.best, 0);
          if (bx > -20 && bx < W + 20) { g.setLineDash([6, 6]); g.strokeStyle = 'rgba(255,212,71,.75)'; g.lineWidth = 2; g.beginPath(); g.moveTo(bx, 0); g.lineTo(bx, sy); g.stroke(); g.setLineDash([]); g.fillStyle = '#ffd447'; g.font = '800 13px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('Best', bx, sy - 8); }
        }
        for (const p of S.W.props) if (p.kind === 'tower') drawProp(g, p, ph);
        for (const b of S.W.blds) drawBuilding(g, b, ph);
        for (const p of S.W.props) if (p.kind !== 'tower') drawProp(g, p, ph);
        // rings
        for (const r of S.W.rings) {
          if (r.got) continue;
          const [x, y] = sc(r.x, r.y); if (x < -40 || x > W + 40) continue;
          const R = cam.zoom * 1.6, pulse = 1 + 0.06 * Math.sin(t * 6 + r.x);
          g.save(); g.shadowColor = '#4fc3ff'; g.shadowBlur = 12; g.lineWidth = cam.zoom * 0.35; g.strokeStyle = '#7fe3ff';
          g.beginPath(); g.ellipse(x, y, R * 0.45 * pulse, R * pulse, 0, 0, 6.283); g.stroke();
          g.lineWidth = cam.zoom * 0.12; g.strokeStyle = '#ffffff'; g.beginPath(); g.ellipse(x, y, R * 0.45 * pulse, R * pulse, 0, 0, 6.283); g.stroke(); g.restore();
        }
        // coins
        for (const c of S.W.coins) {
          if (c.got) continue;
          const [x, y] = sc(c.x, c.y); if (x < -20 || x > W + 20) continue;
          const r = cam.zoom * 0.5, s = Math.max(0.2, Math.abs(Math.cos(t * 3 + c.x)));
          g.fillStyle = '#c47f0e'; g.beginPath(); g.ellipse(x, y, r * s, r, 0, 0, 6.283); g.fill();
          g.fillStyle = '#ffd447'; g.beginPath(); g.ellipse(x, y, r * 0.78 * s, r * 0.8, 0, 0, 6.283); g.fill();
          g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(x - r * 0.2 * s, y - r * 0.25, r * 0.2 * s, r * 0.25, 0, 0, 6.283); g.fill();
        }
        // drones
        for (const d of S.W.drones) {
          if (!d.alive) continue;
          const [x, y] = sc(d.x, E.droneY(S, d)); if (x < -40 || x > W + 40) continue;
          drawRobot(g, x, y, cam.zoom * 2, { colour: 'blue', rot: Math.sin(t * 2 + d.ph) * 0.15 });
          g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1.5; const pw = cam.zoom * (0.6 + 0.4 * Math.abs(Math.sin(t * 30)));
          g.beginPath(); g.moveTo(x - pw, y - cam.zoom * 1.15); g.lineTo(x + pw, y - cam.zoom * 1.15); g.stroke();
        }
        // ghost of the best run, racing along at the same time
        if (ghost && S.mode !== 'start' && !over) {
          const i = Math.min(ghost.p.length / 2 - 1, Math.floor((S.t - 0) / 0.1)) * 2;
          if (i >= 0) { const [gx, gy] = sc(ghost.p[i] / 10, ghost.p[i + 1] / 10); if (gx > -40 && gx < W + 40) { drawHero(g, gx, gy, E.HERO_H * cam.zoom, { look: spidey().look, pose: 'fall', alpha: 0.28, t }); g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '700 11px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('Best run', gx, gy - E.HERO_H * cam.zoom - 6); } }
        }
        const [hx, hy] = sc(S.x, S.y + E.HERO_H);
        // aim: a target on the anchor the next web will grab
        if (!S.web && !over && S.mode !== 'dead') {
          const a = E.aim(S);
          if (a) {
            const [ax, ay] = sc(a.x, a.y), pr = cam.zoom * (0.6 + 0.12 * Math.sin(t * 8));
            g.setLineDash([3, 6]); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(hx, hy); g.lineTo(ax, ay); g.stroke(); g.setLineDash([]);
            g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.arc(ax, ay, pr, 0, 6.283); g.stroke();
            g.beginPath(); g.moveTo(ax - pr * 1.5, ay); g.lineTo(ax - pr * 0.6, ay); g.moveTo(ax + pr * 0.6, ay); g.lineTo(ax + pr * 1.5, ay); g.moveTo(ax, ay - pr * 1.5); g.lineTo(ax, ay - pr * 0.6); g.moveTo(ax, ay + pr * 0.6); g.lineTo(ax, ay + pr * 1.5); g.stroke();
          }
        }
        // web and the release glow
        let rot = 0, pose = 'fall';
        const sweet = E.sweetness(S);
        if (S.web) {
          const [ax, ay] = sc(S.web.x, S.web.y);
          g.strokeStyle = '#ffffff'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(hx, hy); g.lineTo(ax, ay); g.stroke();
          g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 5; g.beginPath(); g.moveTo(hx, hy); g.lineTo(ax, ay); g.stroke();
          g.fillStyle = '#fff'; g.beginPath(); g.arc(ax, ay, 3.5, 0, 6.283); g.fill();
          rot = Math.atan2(S.web.x - S.x, S.web.y - S.y - E.HERO_H); pose = 'swing';
        } else if (S.mode === 'roof') { pose = runPose(t); rot = 0; }
        else if (S.mode === 'wall') { pose = runPose(t * 1.4); rot = -1.45; }
        else { rot = clamp(S.vx * 0.03 - S.vy * 0.02, -0.6, 0.9) + S.rot; pose = S.flip ? 'crouch' : S.vy > 0 ? 'jump' : 'fall'; }
        if (sweet > 0) {
          const [cx, cy] = sc(S.x, S.y + 1);
          g.save(); g.globalAlpha = 0.25 + 0.55 * sweet; const rg = g.createRadialGradient(cx, cy, 0, cx, cy, cam.zoom * 2.4);
          rg.addColorStop(0, sweet >= 1 ? 'rgba(255,212,71,.95)' : 'rgba(255,255,255,.6)'); rg.addColorStop(1, 'rgba(255,212,71,0)');
          g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, cam.zoom * 2.4, 0, 6.283); g.fill(); g.restore();
        }
        const [px, py] = sc(S.x, S.y);
        drawHero(g, px, py, E.HERO_H * cam.zoom, { look: spidey().look, pose, rot, flow: clamp(-S.vx / 20, -1, 1), t });
        fx.draw(g, cam);
        // speed lines
        if (speedFx > 0.05) {
          g.strokeStyle = `rgba(255,255,255,${0.35 * speedFx})`; g.lineWidth = 2;
          g.beginPath();
          for (const l of lines) { const x = W - ((l.x * W + t * 900 * (0.6 + l.l)) % (W * 1.2)), y = l.y * H; g.moveTo(x, y); g.lineTo(x + W * 0.12 * l.l * speedFx, y); }
          g.stroke();
        }
        if (flash > 0) { g.fillStyle = `rgba(255,240,200,${flash})`; g.fillRect(0, 0, W, H); }
        // challenges: a card before the first swing, then small chips while you play
        g.textAlign = 'left';
        if (S.mode === 'start') {
          const cw = Math.min(W - 32, 320), cx = (W - cw) / 2, cy = H * 0.2, chh = 40 + S.challenges.length * 28;
          g.fillStyle = 'rgba(20,24,48,.82)'; roundRect(g, cx, cy, cw, chh, 14); g.fill();
          g.fillStyle = '#ffd447'; g.font = '800 15px system-ui, sans-serif'; g.fillText('This run', cx + 16, cy + 26);
          g.font = '600 14px system-ui, sans-serif';
          S.challenges.forEach((c, i) => { g.fillStyle = '#ffffff'; g.fillText(`${c.text}`, cx + 16, cy + 54 + i * 28); g.fillStyle = '#ffd447'; g.textAlign = 'right'; g.fillText(`+${c.reward}`, cx + cw - 16, cy + 54 + i * 28); g.textAlign = 'left'; });
        } else if (!over) {
          g.font = '700 11px system-ui, sans-serif';
          S.challenges.forEach((c, i) => {
            const y = H - 14 - (S.challenges.length - 1 - i) * 22, text = `${c.done ? 'Done: ' : ''}${c.text}`, w = g.measureText(text).width + 18;
            g.fillStyle = c.done ? 'rgba(46,160,90,.85)' : 'rgba(20,24,48,.6)'; roundRect(g, 10, y - 15, w, 19, 9); g.fill();
            g.fillStyle = '#fff'; g.fillText(text, 19, y - 2);
          });
        }
        if (banner) {
          const a = Math.min(1, banner.t * 4, (2.2 - banner.t) * 3), y = H * 0.24 - (1 - Math.min(1, banner.t * 4)) * 20;
          g.save(); g.globalAlpha = Math.max(0, a); g.textAlign = 'center';
          g.font = '900 34px system-ui, sans-serif'; g.lineWidth = 6; g.strokeStyle = 'rgba(20,24,48,.8)'; g.strokeText(banner.text, W / 2, y); g.fillStyle = banner.color; g.fillText(banner.text, W / 2, y);
          if (banner.sub) { g.font = '700 14px system-ui, sans-serif'; g.lineWidth = 4; g.strokeText(banner.sub, W / 2, y + 24); g.fillStyle = '#fff'; g.fillText(banner.sub, W / 2, y + 24); }
          g.restore();
        }
      },
    };
  },
};
