// Air Hockey for two phones (or two players on one phone). The host runs the table; the guest
// sends where its finger is and draws its own mallet straight away so it feels instant.
import { makeCanvas, worldTransform, trackPointers, syncLoop, tone, noise, shaker, scoreBar, r3 } from './rt-kit.js';
import { W, H, GOAL, MR, PR, WIN, newHockey, stepHockey, hockeyOver, packHockey, moveMallet } from './rt-hockey.js';

const COL = ['#ff4d5e', '#2f8cff'];
const DARK = ['#b3182f', '#1559b8'];

function art() {
  return `<svg class="rt-art" viewBox="0 0 120 80" aria-hidden="true">
    <rect x="6" y="6" width="108" height="68" rx="14" fill="#e9f6ff" stroke="#9cc8e8" stroke-width="3"/>
    <path d="M60 8V72" stroke="#ff8a95" stroke-width="2"/><circle cx="60" cy="40" r="13" fill="none" stroke="#ff8a95" stroke-width="2"/>
    <rect x="2" y="27" width="5" height="26" rx="2" fill="#24344d"/><rect x="113" y="27" width="5" height="26" rx="2" fill="#24344d"/>
    <circle cx="30" cy="46" r="11" fill="${COL[0]}"/><circle cx="30" cy="46" r="5" fill="${DARK[0]}"/>
    <circle cx="92" cy="30" r="11" fill="${COL[1]}"/><circle cx="92" cy="30" r="5" fill="${DARK[1]}"/>
    <circle cx="62" cy="34" r="6" fill="#26303d"/><circle cx="60.5" cy="32.5" r="2" fill="#fff" opacity=".5"/>
  </svg>`;
}

export default {
  id: 'hockey', cat: 'action', name: 'Air Hockey', tag: 'Slam the puck past your friend', realtime: true, art,
  help: [
    'Drag your mallet around your half of the table and hit the puck into the goal at the far end.',
    'You can only move in your own half. Hit the puck while your mallet is moving to send it faster.',
    `First to ${WIN} goals wins. After a goal, the player who let it in gets the puck.`,
  ],
  create(ctx) {
    const root = ctx.root;
    root.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'rt-game rt-hockey' + (ctx.local ? ' local' : '');
    const bar = scoreBar(ctx.names, ctx.local ? null : ctx.me);
    const stage = document.createElement('div');
    stage.className = 'rt-stage';
    wrap.append(bar.el, stage);
    root.appendChild(wrap);
    const cnv = makeCanvas(stage);
    const flip = !ctx.local && ctx.me === 1;
    const shake = shaker();
    const isHost = ctx.local || ctx.isHost;
    const state = isHost ? newHockey(ctx.first ?? 0) : null;
    wrap.__state = state; // read by the test harness
    const targets = [null, null];
    const pred = ctx.local ? null : { x: W / 2, y: ctx.me === 0 ? H - 0.18 : 0.18, vx: 0, vy: 0 };
    const trail = [];
    let flash = null, lastScore = '';
    let tf = worldTransform(cnv.view, W, H, flip);

    const off = trackPointers(cnv.cv,
      (x, y) => { tf = worldTransform(cnv.view, W, H, flip); if (!ctx.local) return ctx.me; const [, wy] = tf.toWorld(x, y); return wy < H / 2 ? 1 : 0; },
      (p, x, y) => { const [wx, wy] = tf.toWorld(x, y); targets[p] = { x: r3(wx), y: r3(wy - (p === 0 ? 0.02 : -0.02)) }; });

    function onEvent(ev) {
      if (ev.k === 'hit') {
        tone(180 + Math.min(4, ev.v) * 90, 0.07, { type: 'triangle', vol: 0.12 }); noise(0.05, { vol: 0.12, freq: 2200 });
        if (ev.v > 1.6) shake.kick(Math.min(7, ev.v * 1.8));
        if (ctx.local || ev.p === ctx.me) ctx.buzz?.(ev.v > 1.6 ? 22 : 10);
      } else if (ev.k === 'wall') {
        if (ev.v > 0.2) tone(120 + Math.min(3, ev.v) * 40, 0.05, { type: 'square', vol: 0.04 });
      } else if (ev.k === 'goal') {
        flash = { p: ev.p, at: performance.now() };
        shake.kick(9);
        const mine = ctx.local || ev.p === ctx.me;
        if (mine) [523, 659, 784].forEach((f, i) => tone(f, 0.22, { type: 'triangle', delay: i * 0.08, vol: 0.09 }));
        else tone(300, 0.35, { type: 'sawtooth', vol: 0.05, slideTo: 140 });
        ctx.buzz?.(mine ? [30, 40, 30] : 60);
      }
    }

    function drawTable(c) {
      const dark = document.documentElement.dataset.theme === 'dark';
      // rink
      c.fillStyle = dark ? '#16243a' : '#eaf6ff';
      roundRect(c, -0.03, -0.03, W + 0.06, H + 0.06, 0.08); c.fill();
      c.lineWidth = 0.028; c.strokeStyle = dark ? '#3b5d86' : '#9cc8e8'; c.stroke();
      // air holes
      c.fillStyle = dark ? 'rgba(160,200,255,.08)' : 'rgba(40,90,140,.08)';
      for (let y = 0.06; y < H; y += 0.08) for (let x = 0.06; x < W; x += 0.08) { c.beginPath(); c.arc(x, y, 0.006, 0, 6.3); c.fill(); }
      c.strokeStyle = dark ? 'rgba(255,120,140,.55)' : 'rgba(230,60,80,.55)'; c.lineWidth = 0.008;
      c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke();
      c.beginPath(); c.arc(W / 2, H / 2, 0.14, 0, 6.3); c.stroke();
      c.strokeStyle = dark ? 'rgba(120,170,255,.5)' : 'rgba(40,110,220,.45)';
      c.beginPath(); c.arc(W / 2, 0, GOAL / 2 + 0.04, 0, Math.PI); c.stroke();
      c.beginPath(); c.arc(W / 2, H, GOAL / 2 + 0.04, Math.PI, 2 * Math.PI); c.stroke();
      // goals
      c.fillStyle = '#1c2533';
      roundRect(c, W / 2 - GOAL / 2, -0.035, GOAL, 0.03, 0.012); c.fill();
      roundRect(c, W / 2 - GOAL / 2, H + 0.005, GOAL, 0.03, 0.012); c.fill();
    }
    function drawMallet(c, x, y, i) {
      c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.arc(x + 0.008, y + 0.012, MR, 0, 6.3); c.fill();
      c.fillStyle = COL[i]; c.beginPath(); c.arc(x, y, MR, 0, 6.3); c.fill();
      c.strokeStyle = DARK[i]; c.lineWidth = 0.012; c.beginPath(); c.arc(x, y, MR * 0.72, 0, 6.3); c.stroke();
      c.fillStyle = DARK[i]; c.beginPath(); c.arc(x, y, MR * 0.4, 0, 6.3); c.fill();
      c.fillStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.arc(x - MR * 0.15, y - MR * 0.18, MR * 0.16, 0, 6.3); c.fill();
    }
    function drawPuck(c, x, y) {
      const lt = trail[trail.length - 1];
      if (lt && Math.hypot(lt[0] - x, lt[1] - y) > 0.25) trail.length = 0; // the puck was put back for a serve
      trail.push([x, y]); if (trail.length > 7) trail.shift();
      trail.forEach(([tx, ty], i) => { c.fillStyle = `rgba(40,55,75,${(i / trail.length) * 0.12})`; c.beginPath(); c.arc(tx, ty, PR * (0.6 + i / 20), 0, 6.3); c.fill(); });
      c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.arc(x + 0.006, y + 0.009, PR, 0, 6.3); c.fill();
      // a dark puck on the light table, a pale one on the dark table
      c.fillStyle = document.documentElement.dataset.theme === 'dark' ? '#e3ebf5' : '#232c38'; c.beginPath(); c.arc(x, y, PR, 0, 6.3); c.fill();
      c.strokeStyle = '#f5b400'; c.lineWidth = 0.008; c.beginPath(); c.arc(x, y, PR * 0.62, 0, 6.3); c.stroke();
    }
    function render(view, _a, hostView) {
      const { c2: c, view: v } = cnv;
      tf = worldTransform(v, W, H, flip);
      c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0); c.clearRect(0, 0, v.w, v.h);
      const [sx, sy] = shake.offset();
      c.setTransform(v.dpr, 0, 0, v.dpr, sx * v.dpr, sy * v.dpr);
      c.translate(tf.ox, tf.oy); c.scale(tf.s, tf.s);
      if (flip) { c.translate(W, H); c.rotate(Math.PI); }
      drawTable(c);
      let puck, m0, m1, score;
      if (hostView) { puck = [view.puck.x, view.puck.y]; m0 = [view.m[0].x, view.m[0].y]; m1 = [view.m[1].x, view.m[1].y]; score = view.score; }
      else if (view) { const n = view.n; puck = [n[0], n[1]]; m0 = [n[2], n[3]]; m1 = [n[4], n[5]]; score = [view.q[0], view.q[1]]; }
      if (pred && !hostView) { moveMallet(pred, targets[ctx.me], ctx.me); if (ctx.me === 0) m0 = [pred.x, pred.y]; else m1 = [pred.x, pred.y]; }
      if (puck) {
        drawMallet(c, m1[0], m1[1], 1); drawMallet(c, m0[0], m0[1], 0);
        drawPuck(c, puck[0], puck[1]);
      }
      if (score) { const k = score.join(':'); if (k !== lastScore) { lastScore = k; bar.set(score[0], score[1]); } }
      // a big GOAL banner, drawn upright for whoever is looking
      if (flash) {
        const t = (performance.now() - flash.at) / 1000;
        if (t > 1.3) flash = null;
        else {
          c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
          c.globalAlpha = Math.min(1, (1.3 - t) * 3);
          c.fillStyle = COL[flash.p]; c.font = `900 ${Math.round(v.w * 0.14)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
          const sc = 1 + Math.max(0, 0.3 - t) * 1.5;
          c.translate(v.w / 2, v.h / 2); c.scale(sc, sc);
          if (ctx.local && flash.p === 1) c.rotate(Math.PI);
          c.fillText('GOAL', 0, 0); c.globalAlpha = 1;
        }
      }
      if (!view && !hostView) {
        c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0); c.fillStyle = 'rgba(0,0,0,.45)'; c.font = '700 16px system-ui, sans-serif'; c.textAlign = 'center';
        c.fillText('Waiting for the table', v.w / 2, v.h / 2);
      }
    }

    const loop = syncLoop(ctx, {
      state, step: stepHockey, pack: packHockey, render, onEvent,
      input: () => (ctx.local ? [targets[0], targets[1]] : targets[ctx.me]),
      over: (s) => { const w = hockeyOver(s); return w === null ? null : { winner: w, text: `${ctx.names[w] || 'Player ' + (w + 1)} wins ${s.score[w]} to ${s.score[1 - w]}` }; },
    });
    bar.mid(`First to ${WIN}`);
    return { destroy() { loop.stop(); off(); cnv.destroy(); } };
  },
};

function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
