// Turtle Race: tap in a steady rhythm to paddle your turtle down a 60 m sandy track against three rivals.
// Each tap gives a push, but tapping too fast burns stamina and an exhausted turtle needs a rest.
// Score comes from your finishing time, with a bonus for your place.
import { FX, snd, buzz, clamp, pic, fillGrad, roundRect, banner } from './kit.js';

const LEN = 60;
const RIVALS = [{ name: 'Myrtle', pic: 't_tort', top: 3.7 }, { name: 'Shelly', pic: 't_box', top: 4.05 }, { name: 'Speedy', pic: 't_tort', top: 4.35 }];

export default {
  id: 'race', name: 'Turtle Race', blurb: 'Tap a steady beat to win the 60 m dash', unit: 'pts',
  theme: ['#9fd9ef', '#e8f3d0', '#e7c98e'],
  how: [
    'Wait for Go, then tap anywhere to paddle. Every tap pushes your turtle along.',
    'Find a steady beat, about three or four taps a second. Tapping faster than that wears your turtle out, and a tired turtle stops to catch its breath. Keep an eye on the stamina bar.',
    'Your score comes from your time, plus a bonus for first, second or third place.',
  ],
  thumb(g, w, h) {
    g.fillStyle = '#e7c98e'; g.fillRect(0, h * 0.3, w, h);
    pic(g, 't_tort', w * 0.4, h * 0.45, h * 0.42); pic(g, 't_sea', w * 0.6, h * 0.78, h * 0.45);
    g.fillStyle = '#222'; for (let i = 0; i < 6; i++) g.fillRect(w * 0.88, h * 0.3 + i * h * 0.12, 6, h * 0.06);
  },
  create(ctx) {
    const fx = new FX(), cam = { toScreen: (x, y) => [x, y], zoom: 1 };
    const me = { x: 0, v: 0, stam: 1, tired: 0, lastTap: -1, done: 0, bob: 0 };
    const rivals = RIVALS.map((r) => ({ ...r, x: 0, v: 0, done: 0, phase: Math.random() * 6, surge: 0 }));
    let t = 0, count = 3.2, finished = [], ended = false, beat = 0, feedback = '', fbT = 0;
    const hud = () => ctx.hud({ left: ctx.best ? `Best ${ctx.best}` : '', center: count > 0 ? '' : `${Math.max(0, t).toFixed(1)} s`, right: `${Math.min(LEN, Math.floor(me.x))} / ${LEN} m` });
    hud();

    function down() {
      if (ended || me.done) return;
      if (count > 0) { feedback = 'Wait for Go'; fbT = 0.8; return; }
      const gap = me.lastTap < 0 ? 0.3 : t - me.lastTap;
      me.lastTap = t;
      if (me.tired > 0) { snd.tick(); return; }
      let push, cost;
      if (gap < 0.17) { push = 0.35; cost = 0.13; feedback = 'Too fast'; }
      else if (gap < 0.36) { push = 1; cost = 0.045; feedback = gap < 0.22 ? 'Quick' : 'Good rhythm'; beat++; }
      else { push = 0.85; cost = 0.02; feedback = 'Faster'; }
      fbT = 0.5;
      me.v = Math.min(5.4, me.v + push * 1.45);
      me.stam = Math.max(0, me.stam - cost);
      if (me.stam <= 0) { me.tired = 1.6; feedback = 'Out of puff'; fbT = 1.2; snd.fail(); buzz(30); }
      else { snd.tick(); buzz(4); }
      me.bob = 1;
    }

    function update(dt) {
      if (count > 0) {
        const before = Math.ceil(count); count -= dt;
        if (Math.ceil(count) !== before && count > 0) snd.ding(0);
        if (count <= 0) { snd.ding(4); t = 0; }
        return;
      }
      t += dt; fx.update(dt); fbT -= dt;
      // you
      me.v = Math.max(0, me.v - me.v * 1.15 * dt);
      if (me.tired > 0) { me.tired -= dt; me.v *= 1 - dt * 3; if (me.tired <= 0) me.stam = 0.45; }
      else me.stam = Math.min(1, me.stam + 0.11 * dt);
      me.bob = Math.max(0, me.bob - dt * 5);
      if (!me.done) { me.x += me.v * dt; if (me.x >= LEN) { me.x = LEN; me.done = t; finished.push('you'); snd.cheer(); } }
      // rivals: each paddles at its own pace with the odd burst and rest
      for (const r of rivals) {
        if (r.done) { r.x += r.v * dt; r.v *= 1 - dt * 2; continue; }
        if (r.surge > 0) r.surge -= dt; else if (Math.random() < dt * 0.25) r.surge = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random());
        const target = r.top * (r.surge > 0 ? 1.08 : r.surge < 0 ? 0.88 : 1) * Math.min(1, 0.4 + t * 0.6);
        r.v += (target - r.v) * Math.min(1, dt * 2);
        r.x += r.v * dt;
        if (r.x >= LEN) { r.x = LEN; r.done = t; finished.push(r.name); }
      }
      if (me.done && !ended) {
        ended = true;
        const place = finished.indexOf('you') + 1;
        const score = Math.round(6000 / me.done) + [300, 150, 50, 0][place - 1];
        const ord = ['1st', '2nd', '3rd', '4th'][place - 1];
        ctx.finish(score, `You came ${ord} in ${me.done.toFixed(1)} s${beat > 40 ? ', with a lovely rhythm' : ''}`);
      }
      hud();
    }

    function draw(g) {
      const W = ctx.W, H = ctx.H;
      const pxm = W / 9;                                     // pixels per metre
      const camX = clamp(me.x - 5.2, 0, LEN - 7);
      const sx = (m) => (m - camX) * pxm + W * 0.08;
      const trackTop = H * 0.26, laneH = (H * 0.58) / 4;
      fillGrad(g, 0, 0, 0, trackTop, ['#7fcde9', '#c6ecf7']); g.fillRect(0, 0, W, trackTop);
      // the sea behind the beach
      g.fillStyle = '#4fb2d6'; g.fillRect(0, trackTop - 26, W, 26);
      fillGrad(g, 0, trackTop, 0, H, ['#efd59e', '#e3c182']); g.fillRect(0, trackTop, W, H - trackTop);
      for (let i = 0; i <= 4; i++) { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(0, trackTop + i * laneH - 1, W, 2); }
      // distance marks and the finish line
      g.fillStyle = 'rgba(120,80,30,.45)'; g.font = '800 12px system-ui, sans-serif'; g.textAlign = 'center';
      for (let m = 10; m < LEN; m += 10) { const x = sx(m); if (x > -20 && x < W + 20) { g.fillRect(x - 1, trackTop, 2, laneH * 4); g.fillText(`${m} m`, x, trackTop - 32); } }
      const fxl = sx(LEN);
      for (let k = 0; k < 16; k++) { g.fillStyle = k % 2 ? '#222' : '#fff'; g.fillRect(fxl + (Math.floor(k / 8) ? 6 : 0) - 6, trackTop + (k % 8) * (laneH * 4 / 8), 6, laneH * 4 / 8); }
      const size = Math.min(laneH * 1.3, pxm * 1.6);
      const runners = [...rivals.map((r, i) => ({ ...r, lane: i })), { name: 'You', pic: 't_sea', x: me.x, lane: 3, you: true }];
      for (const r of runners) {
        const y = trackTop + (r.lane + 0.55) * laneH, x = sx(r.x) - size * 0.1;
        const wob = Math.sin(t * (r.you ? 14 : 11) + (r.phase || 0)) * 0.05 * (r.you ? (me.v > 0.3 ? 1 : 0) : 1);
        g.fillStyle = 'rgba(80,50,20,.18)'; g.beginPath(); g.ellipse(x, y + size * 0.22, size * 0.45, size * 0.09, 0, 0, Math.PI * 2); g.fill();
        pic(g, r.pic, x, y - (r.you ? me.bob * 4 : 0), size, { rot: wob });
        g.font = '800 11px system-ui, sans-serif'; g.fillStyle = r.you ? '#c2410c' : 'rgba(80,50,20,.75)';
        g.fillText(r.name, x, y - size * 0.42);
      }
      // stamina and feedback
      const bw = Math.min(W * 0.7, 300), bx = (W - bw) / 2, by = H - 38;
      g.fillStyle = 'rgba(40,30,10,.35)'; roundRect(g, bx - 3, by - 3, bw + 6, 20, 10); g.fill();
      g.fillStyle = me.tired > 0 ? '#e5484d' : me.stam < 0.3 ? '#f59e0b' : '#3fae6a'; roundRect(g, bx, by, Math.max(14, bw * me.stam), 14, 7); g.fill();
      g.fillStyle = '#5a3d17'; g.font = '800 12px system-ui, sans-serif'; g.fillText(me.tired > 0 ? 'Catching breath' : 'Stamina', W / 2, by - 8);
      if (fbT > 0 && feedback) { g.globalAlpha = Math.min(1, fbT * 3); g.font = '900 22px system-ui, sans-serif'; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(60,40,10,.6)'; g.lineWidth = 5; g.strokeText(feedback, W / 2, trackTop - 46 > 40 ? trackTop - 46 : 70); g.fillText(feedback, W / 2, trackTop - 46 > 40 ? trackTop - 46 : 70); g.globalAlpha = 1; }
      // a strip at the top showing where everyone is on the whole track
      const mx0 = W * 0.12, mw = W * 0.76, my = trackTop - 14;
      g.fillStyle = 'rgba(255,255,255,.6)'; roundRect(g, mx0, my - 3, mw, 6, 3); g.fill();
      for (const r of runners) { g.fillStyle = r.you ? '#e2591b' : '#6b4a22'; g.beginPath(); g.arc(mx0 + mw * Math.min(1, r.x / LEN), my, r.you ? 6 : 4.5, 0, Math.PI * 2); g.fill(); }
      if (count > 0) banner(g, W, H, count > 3 ? 'Ready' : String(Math.ceil(count)), 1, 60);
      else if (t < 0.7) banner(g, W, H, 'Go', 1 - t / 0.7, 70);
      fx.draw(g, cam);
    }
    return { update, draw, down };
  },
};
