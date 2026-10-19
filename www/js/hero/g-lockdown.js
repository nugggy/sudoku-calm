// Villain Lockdown: a villain is loose in the Raft's corridor. Slide the containment cells out of the way so the
// villain's pod can be pushed into the holding cell on the right. Uses the Gridlock engine (6x6 sliding blocks);
// every level was checked by its solver (tools/gen-hero.mjs).
import { FX, snd, buzz, clamp, roundRect } from '../yeti/kit.js';
import { drawHero, chosen, drawVillain, VILLAINS } from './kit.js';
import { parse, range, grid, N, EXIT_ROW } from '../gridlock-engine.js';
import { LOCKDOWN } from './lockdown-levels.js';

export default {
  id: 'lockdown', name: 'Villain Lockdown', blurb: 'Slide the cells aside and lock the villain away', unit: '', levels: LOCKDOWN.length,
  theme: ['#5d6d7e', '#95a5b8', '#d5dde6'],
  how: [
    'A villain\'s pod is stuck in the corridor. Drag the containment cells along their tracks to clear a path.',
    'Cells only slide the way they point: long ways along a row or down a column.',
    'Slide the villain\'s pod right into the glowing holding cell to lock them away.',
    'Finish within the target number of moves for three stars.',
  ],
  levelName: (i) => `Level ${i + 1}`,
  thumb(g, w, h) {
    const c = h / 4;
    g.fillStyle = '#2a3340'; g.fillRect(w * 0.1, h * 0.1, c * 4.4, h * 0.8);
    g.fillStyle = '#7d8aa0'; roundRect(g, w * 0.13, h * 0.15, c * 0.9, c * 1.9, 6); g.fill();
    g.fillStyle = '#a24c4c'; roundRect(g, w * 0.13 + c, h * 0.42, c * 1.9, c * 0.9, 6); g.fill();
    drawVillain(g, 'loki', w * 0.13 + c * 1.95, h * 0.42 + c * 0.45, c * 0.38);
  },
  create(ctx) {
    const lv = LOCKDOWN[ctx.level];
    const { vs, pos: start, walls } = parse(lv.board);
    let pos = start.slice();
    const villain = VILLAINS[ctx.level % VILLAINS.length];
    const fx = new FX();
    let L = null, drag = null, moves = 0, over = false, t = 0, history = [], winT = 0;
    const vis = pos.map((p) => p); // smoothed positions
    function layout() {
      const size = Math.min(ctx.W - 40, ctx.H - 170), cs = size / N;
      L = { cs, x: (ctx.W - size) / 2 - 8, y: 60, size };
    }
    layout();
    const fxCam = { toScreen: (x, y) => [L.x + x * L.cs, L.y + y * L.cs], get zoom() { return L.cs; } };
    const hud = () => ctx.hud({ left: `Moves ${moves}`, center: villain.name, right: `Target ${lv.par}` });
    hud();
    const rectOf = (i, p = vis[i]) => { const v = vs[i]; return v.h ? { x: p, y: v.line, w: v.len, h: 1 } : { x: v.line, y: p, w: 1, h: v.len }; };
    function hit(px, py) {
      const x = (px - L.x) / L.cs, y = (py - L.y) / L.cs;
      for (let i = 0; i < vs.length; i++) { const r = rectOf(i, pos[i]); if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i; }
      return -1;
    }
    function done() {
      over = true; winT = 0.001; snd.cheer(); buzz([30, 40, 30]);
      const stars = moves <= lv.par ? 3 : moves <= lv.par + 4 ? 2 : 1;
      setTimeout(() => ctx.finish(stars, `${villain.name} locked away in ${moves} moves (target ${lv.par})`, { coins: 15 + stars * 8, stars, passed: true }), 700);
    }
    return {
      resize: layout,
      down(x, y) {
        if (over) return;
        if (y > L.y + L.size + 16 && x < ctx.W / 2 && history.length) { pos = history.pop(); moves = Math.max(0, moves - 1); snd.tick(); hud(); return; }
        const i = hit(x, y); if (i < 0) return;
        const g0 = grid(vs, pos, walls);
        drag = { i, x, y, p0: pos[i], range: range(vs, pos, i, g0) };
        snd.tick();
      },
      move(x, y) {
        if (!drag) return;
        const v = vs[drag.i], d = ((v.h ? x - drag.x : y - drag.y) / L.cs);
        const [lo, hi] = drag.range;
        vis[drag.i] = clamp(drag.p0 + d, lo, hi + (drag.i === 0 && hi === N - 2 ? 0.5 : 0));
      },
      up() {
        if (!drag) return;
        const i = drag.i, np = clamp(Math.round(vis[i]), drag.range[0], drag.range[1]);
        if (np !== drag.p0) { history.push(pos.slice()); pos[i] = np; moves++; snd.tick(); hud(); }
        drag = null;
        if (pos[0] === N - 2) done();
      },
      update(dt) {
        t += dt; fx.update(dt);
        for (let i = 0; i < vs.length; i++) if (!drag || drag.i !== i) vis[i] += (pos[i] + (over && i === 0 ? Math.min(2, winT * 4) : 0) - vis[i]) * Math.min(1, dt * 18);
        if (winT) winT += dt;
      },
      draw(g) {
        const W = ctx.W, Hh = ctx.H, { x: bx, y: by, cs, size } = L;
        const bg = g.createLinearGradient(0, 0, 0, Hh); bg.addColorStop(0, '#1d2633'); bg.addColorStop(1, '#3a4656');
        g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
        g.fillStyle = '#121820'; roundRect(g, bx - 10, by - 10, size + 20, size + 20, 14); g.fill();
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { g.fillStyle = (r + c) % 2 ? '#2a3442' : '#2f3a4a'; g.fillRect(bx + c * cs, by + r * cs, cs, cs); }
        // holding cell
        const ey = by + EXIT_ROW * cs;
        const glow = 0.5 + Math.sin(t * 4) * 0.3;
        g.fillStyle = `rgba(80,200,255,${0.25 + glow * 0.25})`; g.fillRect(bx + size + 4, ey + 4, cs * 0.9, cs - 8);
        g.strokeStyle = `rgba(120,220,255,${0.6 + glow * 0.4})`; g.lineWidth = 3; g.strokeRect(bx + size + 4, ey + 4, cs * 0.9, cs - 8);
        g.strokeStyle = 'rgba(200,240,255,.7)'; g.lineWidth = 2; for (let k = 1; k < 4; k++) { const x = bx + size + 4 + k * cs * 0.22; g.beginPath(); g.moveTo(x, ey + 6); g.lineTo(x, ey + cs - 6); g.stroke(); }
        for (const w of walls) { const r = Math.floor(w / N), c = w % N; g.fillStyle = '#0c1016'; g.fillRect(bx + c * cs + 3, by + r * cs + 3, cs - 6, cs - 6); }
        // cells
        g.save(); g.beginPath(); g.rect(bx - 10, by - 10, size + 20 + cs, size + 20); g.clip();
        for (let i = vs.length - 1; i >= 0; i--) {
          const r = rectOf(i), x = bx + r.x * cs + 4, y = by + r.y * cs + 4, w = r.w * cs - 8, h = r.h * cs - 8;
          if (i === 0) {
            g.fillStyle = '#7a2d38'; roundRect(g, x, y, w, h, 12); g.fill();
            g.strokeStyle = '#ff6b6b'; g.lineWidth = 3; g.stroke();
            g.fillStyle = 'rgba(255,255,255,.12)'; roundRect(g, x + 6, y + 6, w - 12, h * 0.35, 8); g.fill();
            drawVillain(g, villain.id, x + w * 0.5, y + h * 0.55, h * 0.36);
          } else {
            const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#9aa7bd'); gr.addColorStop(1, '#6c7891');
            g.fillStyle = gr; roundRect(g, x, y, w, h, 10); g.fill();
            g.strokeStyle = '#3d4658'; g.lineWidth = 2; g.stroke();
            g.fillStyle = 'rgba(30,40,55,.55)';
            const n = Math.max(r.w, r.h);
            for (let k = 0; k < n; k++) { const cx = r.w > 1 ? x + (k + 0.5) * (w / n) : x + w / 2, cy = r.h > 1 ? y + (k + 0.5) * (h / n) : y + h / 2; g.beginPath(); g.arc(cx, cy, cs * 0.12, 0, 6.283); g.fill(); }
            g.fillStyle = '#f2c230'; g.fillRect(x + 6, y + 6, 6, 6);
          }
        }
        g.restore();
        // bottom: undo and the hero watching
        const uy = by + size + 22;
        g.fillStyle = history.length ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.06)'; roundRect(g, 16, uy, 96, 40, 20); g.fill();
        g.fillStyle = history.length ? '#fff' : 'rgba(255,255,255,.4)'; g.font = '800 14px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Undo', 64, uy + 20);
        drawHero(g, W - 60, Math.min(Hh - 6, uy + 110), Math.min(110, Hh - uy - 10), { look: chosen().look, pose: over ? 'cheer' : 'stand', t });
        fx.draw(g, fxCam);
      },
    };
  },
};
