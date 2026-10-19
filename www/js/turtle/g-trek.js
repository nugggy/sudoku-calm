// Tortoise Trek: a sliding puzzle. Swipe and the tortoise slides until it bumps into a rock or the edge, or sinks
// into mud. Bring it to rest on the lettuce. 30 levels, each checked by a solver (tools/test-turtle.mjs).
// Score is the number of levels cleared; progress carries over between visits.
import { store, save } from '../store.js';
import { snd, buzz, pic, fillGrad, roundRect, FX } from './kit.js';
import { parse, path } from './trek-engine.js';
import { LEVELS } from './trek-levels.js';

const FACE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

export default {
  id: 'trek', name: 'Tortoise Trek', blurb: 'Slide the tortoise to the lettuce in 30 puzzles', unit: 'levels', unit1: 'level',
  theme: ['#9bd27a', '#d9efb8', '#e9dcb0'],
  how: [
    'Swipe up, down, left or right and the tortoise slides that way until it bumps into a rock or the edge of the field. Mud stops it straight away.',
    'Get the tortoise to stop on the lettuce. Sliding over it does not count.',
    'Finish in the fewest slides for three stars. Undo takes back a slide. The arrows at the top move between levels you have unlocked.',
  ],
  thumb(g, w, h) {
    g.fillStyle = 'rgba(80,120,40,.25)'; for (let i = 0; i < 4; i++) g.fillRect(w * 0.1 + i * w * 0.2, h * 0.1, 1, h * 0.8);
    pic(g, 't_rock_top', w * 0.78, h * 0.3, h * 0.36); pic(g, 't_lettuce', w * 0.62, h * 0.72, h * 0.32);
    pic(g, 't_tort_top', w * 0.25, h * 0.5, h * 0.48);
  },
  create(ctx) {
    const tb = store.turtle;
    if (!tb.trek) tb.trek = { level: 0, stars: {} };
    const TR = tb.trek;
    const fx = new FX(), cam = { toScreen: (x, y) => [x, y], zoom: 1 };
    let idx = Math.min(TR.level, LEVELS.length - 1), lv, pos, moves, hist, anim, face, won, t = 0, down0 = null;

    function load(i) {
      idx = i; lv = parse(LEVELS[i].rows); pos = lv.start; moves = 0; hist = []; anim = null; face = 'right'; won = false;
      hud();
    }
    const cleared = () => Object.keys(TR.stars).length;
    function hud() { ctx.hud({ left: `Level ${idx + 1} of ${LEVELS.length}`, center: `Par ${LEVELS[idx].par}`, right: `${moves} slide${moves === 1 ? '' : 's'}` }); }
    load(idx);
    ctx.record(cleared());
    if (idx === 0 && !TR.stars[0]) ctx.prompt('Swipe to slide');

    function geom() {
      const top = 92, bottom = 96, pad = 12;
      const c = Math.floor(Math.min((ctx.W - pad * 2) / lv.w, (ctx.H - top - bottom) / lv.h));
      return { c, x0: (ctx.W - c * lv.w) / 2, y0: top + (ctx.H - top - bottom - c * lv.h) / 2 };
    }
    function buttons() {
      const y = ctx.H - 70, bw = Math.min(130, ctx.W * 0.36);
      return [{ id: 'undo', label: 'Undo', x: ctx.W / 2 - bw - 8, y, w: bw, h: 50 }, { id: 'restart', label: 'Restart', x: ctx.W / 2 + 8, y, w: bw, h: 50 },
        { id: 'prev', label: '<', x: 12, y: 44, w: 44, h: 40 }, { id: 'next', label: '>', x: ctx.W - 56, y: 44, w: 44, h: 40 }];
    }
    const canNext = () => idx + 1 < LEVELS.length && idx + 1 <= TR.level;

    function go(d) {
      if (anim || won) return;
      ctx.prompt('');
      const p = path(lv, pos, d);
      face = d;
      if (p.length < 2) { snd.thud(); buzz(8); return; }
      hist.push(pos); moves++;
      anim = { p, k: 0 }; snd.swoosh(); hud();
    }
    function arrive() {
      pos = anim.p[anim.p.length - 1]; anim = null;
      if (lv.cells[pos] === 'o') snd.thud(); else snd.tick();
      if (pos === lv.goal) {
        won = true;
        const par = LEVELS[idx].par, stars = moves <= par ? 3 : moves <= par + 2 ? 2 : 1;
        TR.stars[idx] = Math.max(TR.stars[idx] || 0, stars);
        if (idx + 1 > TR.level) TR.level = Math.min(LEVELS.length - 1, idx + 1);
        save();
        ctx.record(cleared());
        snd.cheer(); buzz([20, 40, 20]);
        const { c, x0, y0 } = geom();
        fx.burst(x0 + ((pos % lv.w) + 0.5) * c, y0 + (Math.floor(pos / lv.w) + 0.5) * c, { n: 18, color: ['#ffd447', '#9be36b', '#ffffff'], speed: 160, up: 0, size: 3.5, life: 0.9, grav: 0 });
        if (cleared() === LEVELS.length && idx === LEVELS.length - 1) setTimeout(() => ctx.finish(LEVELS.length, 'Every level cleared. What a trek.'), 1200);
        else setTimeout(() => { if (idx + 1 < LEVELS.length) load(idx + 1); }, 1500);
      }
    }

    function down(x, y) {
      const b = buttons().find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
      if (b) {
        if (b.id === 'undo' && hist.length && !anim && !won) { pos = hist.pop(); moves--; snd.tick(); hud(); }
        else if (b.id === 'restart' && !won) load(idx);
        else if (b.id === 'prev' && idx > 0) load(idx - 1);
        else if (b.id === 'next' && canNext()) load(idx + 1);
        return;
      }
      down0 = [x, y];
    }
    function up(x, y) {
      if (!down0) return;
      const dx = x - down0[0], dy = y - down0[1]; down0 = null;
      if (Math.hypot(dx, dy) < 22) {
        // a tap: slide towards the tapped square
        const { c, x0, y0 } = geom(), px = x0 + ((pos % lv.w) + 0.5) * c, py = y0 + (Math.floor(pos / lv.w) + 0.5) * c;
        const ex = x - px, ey = y - py;
        if (Math.hypot(ex, ey) < c * 0.5) return;
        return go(Math.abs(ex) > Math.abs(ey) ? (ex > 0 ? 'right' : 'left') : ey > 0 ? 'down' : 'up');
      }
      go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    }

    function update(dt) {
      t += dt; fx.update(dt);
      if (anim) { anim.k += dt * 14; if (anim.k >= anim.p.length - 1) arrive(); }
    }

    function draw(g) {
      const W = ctx.W, H = ctx.H, { c, x0, y0 } = geom();
      fillGrad(g, 0, 0, 0, H, ['#cfe9a8', '#e6f2c8', '#efe6c2']); g.fillRect(0, 0, W, H);
      // the field
      g.fillStyle = '#b9d98a'; roundRect(g, x0 - 6, y0 - 6, c * lv.w + 12, c * lv.h + 12, 14); g.fill();
      for (let i = 0; i < lv.cells.length; i++) {
        const x = x0 + (i % lv.w) * c, y = y0 + Math.floor(i / lv.w) * c;
        g.fillStyle = (Math.floor(i / lv.w) + i % lv.w) % 2 ? '#e4d3a0' : '#ead9a8'; g.fillRect(x, y, c, c);
        if (lv.cells[i] === 'o') { g.fillStyle = '#8a6a43'; g.beginPath(); g.ellipse(x + c / 2, y + c / 2, c * 0.42, c * 0.34, 0.3, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(x + c * 0.4, y + c * 0.4, c * 0.12, c * 0.07, 0.3, 0, Math.PI * 2); g.fill(); }
      }
      for (let i = 0; i < lv.cells.length; i++) if (lv.cells[i] === '#') pic(g, 't_rock_top', x0 + (i % lv.w + 0.5) * c, y0 + (Math.floor(i / lv.w) + 0.5) * c, c * 0.95, { rot: (i * 1.7) % 6.28 });
      if (!won) pic(g, 't_lettuce', x0 + (lv.goal % lv.w + 0.5) * c, y0 + (Math.floor(lv.goal / lv.w) + 0.5) * c, c * 0.78, { rot: Math.sin(t * 2) * 0.08 });
      // tortoise
      let tx, ty;
      if (anim) { const k = Math.min(anim.p.length - 1, anim.k), a = Math.floor(k), b = Math.min(anim.p.length - 1, a + 1), f = k - a; const pa = anim.p[a], pb = anim.p[b]; tx = (pa % lv.w) + ((pb % lv.w) - (pa % lv.w)) * f; ty = Math.floor(pa / lv.w) + (Math.floor(pb / lv.w) - Math.floor(pa / lv.w)) * f; }
      else { tx = pos % lv.w; ty = Math.floor(pos / lv.w); }
      pic(g, 't_tort_top', x0 + (tx + 0.5) * c, y0 + (ty + 0.5) * c, c * 0.9 * (won ? 1 + Math.sin(t * 10) * 0.05 : 1), { rot: FACE[face] });
      fx.draw(g, cam);
      // buttons and stars
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const b of buttons()) {
        const off = (b.id === 'prev' && idx === 0) || (b.id === 'next' && !canNext()) || (b.id === 'undo' && !hist.length);
        g.globalAlpha = off ? 0.35 : 1;
        g.fillStyle = '#4f8a2b'; roundRect(g, b.x, b.y + 3, b.w, b.h, 14); g.fill();
        g.fillStyle = '#6aaa3c'; roundRect(g, b.x, b.y, b.w, b.h, 14); g.fill();
        g.fillStyle = '#fff'; g.font = `800 ${b.id === 'prev' || b.id === 'next' ? 22 : 17}px system-ui, sans-serif`; g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
        g.globalAlpha = 1;
      }
      const st = TR.stars[idx] || 0;
      for (let k = 0; k < 3; k++) { g.fillStyle = k < st ? '#f2b631' : 'rgba(0,0,0,.15)'; star(g, W / 2 - 26 + k * 26, 64, 10); }
      if (won) { g.font = '900 30px system-ui, sans-serif'; g.lineWidth = 6; g.strokeStyle = 'rgba(40,70,20,.7)'; g.strokeText('Lettuce reached', W / 2, y0 - 22 < 92 ? H * 0.5 : y0 - 22); g.fillStyle = '#fff'; g.fillText('Lettuce reached', W / 2, y0 - 22 < 92 ? H * 0.5 : y0 - 22); }
      g.textBaseline = 'alphabetic';
    }
    function star(g, x, y, r) { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }
    return { update, draw, down, up };
  },
};
