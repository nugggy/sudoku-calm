// Shield Throw: Captain America aims his shield at Ultron's drones. Drag to aim, let go to throw. The shield bounces off
// walls, so bank shots reach drones hiding behind them. Clear the room in as few throws as you can.
import { FX, snd, buzz, clamp, roundRect } from '../yeti/kit.js';
import { drawHero, heroById, shield, drawRobot } from './kit.js';
import { ROOM, CAP, DRONE_R, trace, SHIELD_LEVELS } from './shield-engine.js';
import { SHIELD } from './shield-levels.js';

const cap = () => heroById('cap');
const COLOURS = ['blue', 'green', 'red', 'yellow'];

export default {
  id: 'shield', name: 'Shield Throw', blurb: 'Bank Captain America\'s shield off the walls to stop Ultron\'s drones', unit: '', levels: SHIELD_LEVELS,
  theme: ['#9fb6d9', '#d5e1f2', '#f1f5fb'],
  star: cap,
  how: [
    'Drag anywhere to aim Captain America\'s shield, then let go to throw it.',
    'The shield flies straight and bounces off walls up to three times, knocking out every drone it touches on the way.',
    'Clear every drone to finish the room. You earn a star for clearing it, a star for doing it within par, and a star for a trick shot: a drone hit after a bounce.',
    'The dotted line shows the shield\'s path to the first wall.',
  ],
  thumb(g, w, h) {
    g.fillStyle = '#4b5d7e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.setLineDash([4, 5]); g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.3, h * 0.85); g.lineTo(w * 0.85, h * 0.4); g.lineTo(w * 0.6, h * 0.1); g.stroke(); g.setLineDash([]);
    drawRobot(g, w * 0.6, h * 0.22, h * 0.26); shield(g, w * 0.75, h * 0.48, h * 0.12, 0.6);
    drawHero(g, w * 0.22, h * 0.98, h * 0.55, { look: cap().look, pose: 'throw' });
  },
  create(ctx) {
    const lvl = SHIELD[ctx.level];
    const alive = lvl.drones.map(() => true), hurt = lvl.drones.map(() => 0);
    const fx = new FX();
    let L = null, aim = null, flying = null, throws = 0, trick = false, over = false, t = 0;
    function layout() {
      const k = Math.min((ctx.W - 16) / ROOM.w, (ctx.H - 70) / ROOM.h);
      L = { k, x: (ctx.W - ROOM.w * k) / 2, y: 44 + ((ctx.H - 70) - ROOM.h * k) / 2 };
    }
    layout();
    const S = (x, y) => [L.x + x * L.k, L.y + (ROOM.h - y) * L.k];
    const W2 = (px, py) => [(px - L.x) / L.k, ROOM.h - (py - L.y) / L.k];
    const fxCam = { toScreen: (x, y) => S(x, y), get zoom() { return L.k; } };
    const hud = () => ctx.hud({ left: `Throws ${throws}`, center: `Par ${lvl.par}`, right: `${alive.filter(Boolean).length} drones` });
    hud();
    ctx.prompt('Drag to aim, let go to throw');
    function angleTo(px, py) { const [x, y] = W2(px, py); return clamp(Math.atan2(y - CAP.y, x - CAP.x), 0.07, Math.PI - 0.07); }
    function throwAt(a) {
      const tr = trace(lvl, a, alive);
      // path length so the shield can travel it at a steady speed
      let len = 0; const legs = [];
      for (let i = 1; i < tr.pts.length; i++) { const [x0, y0] = tr.pts[i - 1], [x1, y1] = tr.pts[i]; const l = Math.hypot(x1 - x0, y1 - y0); legs.push({ x0, y0, x1, y1, l, at: len }); len += l; }
      flying = { tr, legs, len, d: 0, done: new Set() };
      throws++; snd.swoosh(); buzz(10); ctx.prompt(''); hud();
    }
    function finishThrow() {
      flying = null;
      const left = alive.filter(Boolean).length;
      if (!left) {
        over = true;
        const stars = 1 + (throws <= lvl.par ? 1 : 0) + (trick ? 1 : 0);
        ctx.finish(stars, `Cleared in ${throws} throw${throws === 1 ? '' : 's'} (par ${lvl.par})${trick ? ', with a trick shot' : ''}`, { coins: 15 + stars * 10, stars, passed: true });
      } else if (throws >= lvl.par + 4) { over = true; snd.fail(); ctx.finish(0, 'The drones got away. Try a different angle.', { coins: 3, stars: 0, passed: false }); }
    }
    return {
      resize: layout,
      down(x, y) { if (over || flying) return; aim = angleTo(x, y); },
      move(x, y) { if (aim !== null) aim = angleTo(x, y); },
      up(x, y) { if (aim === null || over || flying) return; const a = angleTo(x, y); aim = null; throwAt(a); },
      update(dt) {
        t += dt; fx.update(dt);
        for (let i = 0; i < hurt.length; i++) if (hurt[i]) hurt[i] += dt;
        if (!flying) return;
        flying.d += dt * 16;
        for (const h of flying.tr.hits) if (!flying.done.has(h.i) && flying.d >= h.at) {
          flying.done.add(h.i); alive[h.i] = false; hurt[h.i] = 0.001;
          const d = lvl.drones[h.i];
          fx.burst(d.x, d.y, { n: 14, color: ['#ff4d4d', '#c3c8d2', '#ffd447'], speed: 5, size: 0.12, life: 0.7, grav: 6 });
          snd.whack(1); buzz(15);
          if (h.bank > 0) { trick = true; fx.text(d.x, d.y + 0.8, h.bank > 1 ? 'Double bank' : 'Trick shot', { color: '#ffe27a', size: 18 }); }
          hud();
        }
        if (flying.d >= flying.len) finishThrow();
      },
      draw(g) {
        const W = ctx.W, Hh = ctx.H;
        g.fillStyle = '#2b3550'; g.fillRect(0, 0, W, Hh);
        const [rx, ry] = S(0, ROOM.h), rw = ROOM.w * L.k, rh = ROOM.h * L.k;
        const fl = g.createLinearGradient(0, ry, 0, ry + rh); fl.addColorStop(0, '#4b5d7e'); fl.addColorStop(1, '#6a7fa3');
        g.fillStyle = fl; g.fillRect(rx, ry, rw, rh);
        g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1;
        for (let x = 1; x < ROOM.w; x++) { const [a] = S(x, 0); g.beginPath(); g.moveTo(a, ry); g.lineTo(a, ry + rh); g.stroke(); }
        for (let y = 1; y < ROOM.h; y++) { const [, b] = S(0, y); g.beginPath(); g.moveTo(rx, b); g.lineTo(rx + rw, b); g.stroke(); }
        g.strokeStyle = '#c3cbe0'; g.lineWidth = 6; g.strokeRect(rx, ry, rw, rh);
        g.lineCap = 'round';
        for (const [x1, y1, x2, y2] of lvl.walls) { const [a, b] = S(x1, y1), [c, d] = S(x2, y2); g.strokeStyle = '#1d2438'; g.lineWidth = 12; g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); g.strokeStyle = '#c3cbe0'; g.lineWidth = 7; g.stroke(); }
        g.lineCap = 'butt';
        // drones
        lvl.drones.forEach((d, i) => {
          const [x, y] = S(d.x, d.y);
          if (alive[i]) drawRobot(g, x, y + Math.sin(t * 3 + i) * 3, DRONE_R * 2.2 * L.k, { colour: COLOURS[i % 4], flip: d.x > CAP.x });
          else if (hurt[i] < 0.6) drawRobot(g, x, y + hurt[i] * 60, DRONE_R * 2.2 * L.k, { colour: COLOURS[i % 4], state: 'Hurt', rot: hurt[i] * 6, alpha: 1 - hurt[i] / 0.6 });
        });
        // aim guide
        if (aim !== null && !flying) {
          const tr = trace(lvl, aim, alive);
          g.setLineDash([5, 7]); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2;
          const [a, b] = S(tr.pts[0][0], tr.pts[0][1]), [c, d] = S(tr.pts[1][0], tr.pts[1][1]);
          g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); g.setLineDash([]);
        }
        // Cap
        const [cx, cy] = S(CAP.x, CAP.y - 0.9);
        const thrower = cap().look;
        drawHero(g, cx, cy, 2.1 * L.k, { look: flying ? { ...thrower, prop: 'none' } : thrower, pose: flying || aim !== null ? 'throw' : 'stand' });
        if (flying) {
          let p = flying.legs[flying.legs.length - 1], at = flying.d;
          for (const leg of flying.legs) if (at <= leg.at + leg.l) { p = leg; break; }
          const f = clamp((at - p.at) / p.l, 0, 1), [x, y] = S(p.x0 + (p.x1 - p.x0) * f, p.y0 + (p.y1 - p.y0) * f);
          shield(g, x, y, 0.42 * L.k, t * 18, 0.85);
        }
        fx.draw(g, fxCam);
      },
    };
  },
};
