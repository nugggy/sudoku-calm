// Web Swing: Spider-Man swings across the city. Hold to shoot a web up and ahead; it sticks to the first building it
// meets. Let go to fly off the swing. Touch the street and the run is over. Score is the distance in metres.
import { Camera, FX, snd, buzz, clamp, fmt } from '../yeti/kit.js';
import { drawHero, heroById, skyline } from './kit.js';

const GRAV = 22, WEB_ANGLE = 58 * Math.PI / 180, WEB_LEN = 19, HERO_H = 1.9;
const spidey = () => heroById('spidey');

export default {
  id: 'swing', name: 'Web Swing', blurb: 'Swing with Spider-Man across the city skyline', unit: 'm',
  theme: ['#ff9e7a', '#ffcf8a', '#ffe7c4'],
  star: spidey,
  how: [
    'Hold anywhere to shoot a web up and ahead. It sticks to the first building it reaches, and Spider-Man swings from it.',
    'Let go to fly off the swing. Letting go as you swing upwards throws you higher and further.',
    'Stay low enough for your web to reach the buildings ahead. If you hit a wall you slide off it, and if you touch the street the run is over.',
    'Grab the coins on the way. Score is how far you swing.',
  ],
  thumb(g, w, h) {
    skyline(g, w, h, 0, { par: 0, base: 1, tall: 0.75, col: '#c7745e', win: 'rgba(255,240,200,.5)', width: 26, seed: 4 });
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.85, 0); g.lineTo(w * 0.55, h * 0.45); g.stroke();
    drawHero(g, w * 0.5, h * 0.95, h * 0.55, { look: spidey().look, pose: 'swing', rot: 0.5 });
  },
  create(ctx) {
    const cam = new Camera(ctx, clamp(ctx.H / 28, 16, 34)); cam.fx = 0.3; cam.fy = 0.5;
    const fx = new FX();
    let seed = (Math.random() * 1e9) | 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    // buildings: { x, w, h }
    const blds = [{ x: -10, w: 16, h: 18 }];
    function grow(until) {
      while (blds[blds.length - 1].x < until) {
        const last = blds[blds.length - 1], gap = 3 + rnd() * 6;
        const dist = last.x / 400; // later buildings vary more
        blds.push({ x: last.x + last.w + gap, w: 6 + rnd() * 10, h: clamp(14 + rnd() * (16 + dist * 10) - dist * 3, 9, 46) });
      }
      while (blds.length > 4 && blds[1].x + blds[1].w < cam.left - 30) blds.shift();
    }
    grow(200);
    const coins = [];
    for (let x = 20; x < 200; x += 9 + Math.random() * 8) coins.push({ x, y: 8 + Math.random() * 14, got: false });
    let coinX = 200;
    const P = { x: 3, y: 18, vx: 0, vy: 0, web: null, len: 0 }; // waits on the first roof until the first web
    let t = 0, over = false, got = 0, maxX = 0, started = false;
    ctx.prompt('Hold to shoot a web');
    ctx.hud({ left: '0 m', right: '0 coins' });

    function cast() {
      // ray from the hero's hand up and ahead
      const ox = P.x, oy = P.y + HERO_H, dx = Math.cos(WEB_ANGLE), dy = Math.sin(WEB_ANGLE);
      let best = null;
      for (const b of blds) {
        // left wall
        if (dx > 0 && b.x > ox) { const s = (b.x - ox) / dx, y = oy + dy * s; if (s < WEB_LEN && y >= 0 && y <= b.h && (!best || s < best.s)) best = { s, x: b.x, y }; }
        // roof edge: allow sticking just under the roof line
        if (b.h > oy) { const s = (b.h - 0.3 - oy) / dy, x = ox + dx * s; if (s > 0 && s < WEB_LEN && x >= b.x && x <= b.x + b.w && (!best || s < best.s)) best = { s, x, y: b.h - 0.3 }; }
      }
      return best;
    }
    function attach() {
      const hit = cast();
      if (!hit) { snd.swoosh(); fx.text(P.x + 3, P.y + 4, 'No building in reach', { color: '#fff', size: 16 }); return; }
      P.web = { x: hit.x, y: hit.y }; P.len = Math.hypot(hit.x - P.x, hit.y - (P.y + HERO_H)) * 0.92;
      snd.spit(); buzz(8);
      if (!started) { started = true; ctx.prompt(''); }
    }
    return {
      down() { if (over) return; if (!started) { started = true; ctx.prompt(''); P.vx = 10; P.vy = 9; P.y += 0.2; } attach(); },
      up() { if (P.web) { P.web = null; snd.swoosh(); } },
      update(dt) {
        if (over) { fx.update(dt); cam.update(dt); return; }
        t += dt;
        if (!started) { cam.x = P.x; cam.y = P.y + 2; cam.update(dt); return; }
        P.vy -= GRAV * dt;
        P.x += P.vx * dt; P.y += P.vy * dt;
        if (P.web) {
          // rope: keep the hand within the web's length of the anchor, removing outward speed
          const hx = P.x, hy = P.y + HERO_H, dx = hx - P.web.x, dy = hy - P.web.y, d = Math.hypot(dx, dy);
          if (d > P.len) {
            const nx = dx / d, ny = dy / d;
            P.x -= nx * (d - P.len); P.y -= ny * (d - P.len);
            const out = P.vx * nx + P.vy * ny;
            if (out > 0) { P.vx -= out * nx; P.vy -= out * ny; }
          }
          P.len = Math.max(3, P.len - dt * 1.2); // the web reels in a little
        }
        const sp = Math.hypot(P.vx, P.vy); if (sp > 34) { P.vx *= 34 / sp; P.vy *= 34 / sp; }
        // walls
        for (const b of blds) {
          if (P.x + 0.4 > b.x && P.x - 0.4 < b.x + b.w && P.y < b.h) {
            if (P.y > b.h - 0.6 && P.vy <= 0) { P.y = b.h; P.vy = Math.abs(P.vy) * 0.25 + 4; snd.thud(); } // lands on a roof and hops
            else { P.x = b.x - 0.45; P.vx = -Math.abs(P.vx) * 0.2 - 1; P.web = null; snd.thud(); cam.shake(6); }
          }
        }
        maxX = Math.max(maxX, P.x);
        for (const c of coins) if (!c.got && Math.abs(c.x - P.x) < 1.3 && Math.abs(c.y - (P.y + 1)) < 1.5) { c.got = true; got++; snd.ding(got % 6); fx.stars(c.x, c.y, 8); }
        while (coinX < maxX + 220) { coinX += 9 + Math.random() * 10; coins.push({ x: coinX, y: 7 + Math.random() * 16, got: false }); }
        grow(maxX + 220);
        if (P.y <= 0) {
          P.y = 0; over = true; snd.fail(); cam.shake(10); fx.dust(P.x, 0.2, 20);
          const m = Math.max(0, maxX);
          ctx.finish(m, `${fmt(got)} coins grabbed`, { coins: Math.round(m / 12) + got * 2 });
        }
        cam.follow(P.x + 2, clamp(P.y + 2, 9, 40), dt, 4);
        cam.update(dt); fx.update(dt);
        ctx.hud({ left: `${fmt(Math.max(0, maxX))} m`, right: `${got} coins` });
      },
      draw(g) {
        const W = ctx.W, Hh = ctx.H;
        const sky = g.createLinearGradient(0, 0, 0, Hh); sky.addColorStop(0, '#3b4a8a'); sky.addColorStop(0.55, '#e7837a'); sky.addColorStop(1, '#ffd29a');
        g.fillStyle = sky; g.fillRect(0, 0, W, Hh);
        g.fillStyle = 'rgba(255,240,200,.85)'; g.beginPath(); g.arc(W * 0.78, Hh * 0.3, Math.min(W, Hh) * 0.08, 0, 6.283); g.fill();
        const camPx = cam.x * cam.zoom;
        skyline(g, W, Hh, camPx, { par: 0.12, base: 0.85, tall: 0.55, col: '#7d5f8f', win: null, width: 46, seed: 2 });
        skyline(g, W, Hh, camPx, { par: 0.3, base: 0.92, tall: 0.5, col: '#5a4a78', win: 'rgba(255,220,140,.35)', width: 58, seed: 7 });
        // street
        const [, sy] = cam.toScreen(0, 0);
        g.fillStyle = '#3a3a48'; g.fillRect(0, sy, W, Hh - sy);
        g.fillStyle = '#f2c230'; for (let x = Math.floor(cam.left / 6) * 6; x < cam.right + 6; x += 6) { const [px] = cam.toScreen(x, 0); g.fillRect(px, sy + 10, cam.zoom * 2.5, 3); }
        // buildings
        for (const b of blds) {
          const [x0, y0] = cam.toScreen(b.x, b.h), [x1, y1] = cam.toScreen(b.x + b.w, 0);
          if (x1 < -10 || x0 > W + 10) continue;
          const hue = (Math.abs(Math.floor(b.x)) * 37) % 3;
          g.fillStyle = ['#2f3d63', '#3d3358', '#33485a'][hue]; g.fillRect(x0, y0, x1 - x0, y1 - y0);
          g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x1 - (x1 - x0) * 0.18, y0, (x1 - x0) * 0.18, y1 - y0);
          g.fillStyle = '#1f2840'; g.fillRect(x0 - 2, y0 - 4, x1 - x0 + 4, 6);
          const cw = cam.zoom * 1.2, ch = cam.zoom * 1.6;
          g.fillStyle = 'rgba(255,214,120,.55)';
          for (let wy = y0 + ch * 0.6; wy < y1 - ch; wy += ch * 1.4) for (let wx = x0 + cw * 0.6; wx < x1 - cw * 1.2; wx += cw * 1.6) if (((wx * 3 + wy * 7) | 0) % 4) g.fillRect(wx, wy, cw, ch);
        }
        // coins
        for (const c of coins) if (!c.got) { const [x, y] = cam.toScreen(c.x, c.y); if (x < -20 || x > W + 20) continue; const r = cam.zoom * 0.5, s = Math.abs(Math.cos(t * 3 + c.x)); g.fillStyle = '#f2a91d'; g.beginPath(); g.ellipse(x, y, r * Math.max(0.2, s), r, 0, 0, 6.283); g.fill(); g.fillStyle = '#ffe27a'; g.beginPath(); g.ellipse(x, y, r * 0.7 * Math.max(0.2, s), r * 0.7, 0, 0, 6.283); g.fill(); }
        // web aim hint while falling with nothing to hold
        const [hx, hy] = cam.toScreen(P.x, P.y + HERO_H);
        if (!P.web && !over) {
          const hit = cast();
          g.setLineDash([3, 6]); g.strokeStyle = hit ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.18)'; g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + Math.cos(WEB_ANGLE) * cam.zoom * (hit ? hit.s : WEB_LEN), hy - Math.sin(WEB_ANGLE) * cam.zoom * (hit ? hit.s : WEB_LEN)); g.stroke(); g.setLineDash([]);
        }
        let rot = 0;
        if (P.web) {
          const [ax, ay] = cam.toScreen(P.web.x, P.web.y);
          g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(hx, hy); g.lineTo(ax, ay); g.stroke();
          g.fillStyle = '#fff'; g.beginPath(); g.arc(ax, ay, 3, 0, 6.283); g.fill();
          rot = Math.atan2(P.web.x - P.x, P.web.y - P.y - HERO_H);
        } else rot = clamp(P.vx * 0.03 - P.vy * 0.02, -0.6, 0.9);
        const [px, py] = cam.toScreen(P.x, P.y);
        drawHero(g, px, py, HERO_H * cam.zoom, { look: spidey().look, pose: P.web ? 'swing' : P.vy > 0 ? 'jump' : 'fall', rot, flow: clamp(-P.vx / 20, -1, 1), t });
        fx.draw(g, cam);
      },
    };
  },
};
