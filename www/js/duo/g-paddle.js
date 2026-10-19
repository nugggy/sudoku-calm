// Paddle Ball: a two-player bat-and-ball game with spin, a rally that speeds up, and power-ups.
import { makeCanvas, worldTransform, trackPointers, syncLoop, tone, noise, shaker, scoreBar, r3, clamp } from './rt-kit.js';
import { W, H, BR, BAT_T, BAT_Y, HW, WIDE, WIN, MAXBALLS, newPaddle, stepPaddle, paddleOver, packPaddle } from './rt-paddle.js';

const COL = ['#ff7a1a', '#18b5a4'];
const GLOW = ['rgba(255,122,26,.45)', 'rgba(24,181,164,.45)'];

function art() {
  return `<svg class="rt-art" viewBox="0 0 120 80" aria-hidden="true">
    <rect x="6" y="6" width="108" height="68" rx="10" fill="#1d2440"/>
    <path d="M60 10V70" stroke="#4b5590" stroke-width="2" stroke-dasharray="5 5"/>
    <rect x="14" y="22" width="7" height="30" rx="3.5" fill="${COL[0]}"/><rect x="99" y="30" width="7" height="30" rx="3.5" fill="${COL[1]}"/>
    <circle cx="70" cy="33" r="5" fill="#fff"/><circle cx="62" cy="36" r="3.5" fill="#fff" opacity=".35"/><circle cx="55" cy="39" r="2.4" fill="#fff" opacity=".18"/>
  </svg>`;
}

export default {
  id: 'paddle', cat: 'action', name: 'Paddle Ball', tag: 'Bat the ball past your friend', realtime: true, art,
  help: [
    'Slide your bat left and right along your end. Do not let the ball past you.',
    'Where the ball meets your bat sets its angle, and moving the bat as you hit adds spin that curves it. Every hit makes the ball a little faster.',
    'Hit a ball through a power-up to collect it: Wide makes your bat longer for a while, Multi splits the ball into three.',
    `First to ${WIN} points wins.`,
  ],
  create(ctx) {
    const root = ctx.root;
    root.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'rt-game rt-paddle' + (ctx.local ? ' local' : '');
    const bar = scoreBar(ctx.names, ctx.local ? null : ctx.me);
    const stage = document.createElement('div');
    stage.className = 'rt-stage';
    wrap.append(bar.el, stage);
    root.appendChild(wrap);
    const cnv = makeCanvas(stage);
    const flip = !ctx.local && ctx.me === 1;
    const shake = shaker();
    const isHost = ctx.local || ctx.isHost;
    const state = isHost ? newPaddle() : null;
    if (state) state.serve.to = ctx.first ?? 0;
    wrap.__state = state; // read by the test harness
    const targets = [null, null];
    const pred = ctx.local ? null : { x: W / 2 };
    const trails = [[], [], []];
    let flash = null, lastScore = '';
    let tf = worldTransform(cnv.view, W, H, flip);

    const off = trackPointers(cnv.cv,
      (x, y) => { tf = worldTransform(cnv.view, W, H, flip); if (!ctx.local) return ctx.me; const [, wy] = tf.toWorld(x, y); return wy < H / 2 ? 1 : 0; },
      (p, x, y) => { const [wx] = tf.toWorld(x, y); targets[p] = { x: r3(wx) }; });

    function onEvent(ev) {
      if (ev.k === 'hit') {
        tone(330 + ev.v * 120, 0.06, { type: 'square', vol: 0.06 });
        if (ev.s) tone(900, 0.12, { vol: 0.03, slideTo: 1500 });
        if (ev.v > 1.8) shake.kick(3);
        if (ctx.local || ev.p === ctx.me) ctx.buzz?.(8);
      } else if (ev.k === 'wall') tone(220, 0.04, { type: 'triangle', vol: 0.05 });
      else if (ev.k === 'point') {
        flash = { p: ev.p, at: performance.now() }; shake.kick(6);
        const mine = ctx.local || ev.p === ctx.me;
        if (mine) [660, 880].forEach((f, i) => tone(f, 0.16, { type: 'triangle', delay: i * 0.07, vol: 0.08 }));
        else tone(260, 0.3, { type: 'sawtooth', vol: 0.05, slideTo: 130 });
        ctx.buzz?.(mine ? 25 : 50);
      } else if (ev.k === 'get') { [784, 988, 1319].forEach((f, i) => tone(f, 0.12, { delay: i * 0.05, vol: 0.06 })); }
      else if (ev.k === 'pu') tone(1200, 0.1, { vol: 0.03 });
      else if (ev.k === 'serve') noise(0.08, { vol: 0.05, freq: 1500 });
    }

    function drawCourt(c) {
      const dark = document.documentElement.dataset.theme === 'dark';
      c.fillStyle = dark ? '#121831' : '#1d2440';
      roundRect(c, -0.02, -0.02, W + 0.04, H + 0.04, 0.05); c.fill();
      c.strokeStyle = '#4b5590'; c.lineWidth = 0.01; c.setLineDash([0.03, 0.03]);
      c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke(); c.setLineDash([]);
      c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 0.006;
      c.strokeRect(0, 0, W, H);
    }
    function drawBat(c, x, i, wide) {
      const hw = wide ? WIDE : HW, y = BAT_Y[i];
      c.shadowColor = GLOW[i]; c.shadowBlur = 0.05 * tf.s;
      c.fillStyle = COL[i];
      roundRect(c, x - hw, y - BAT_T / 2, hw * 2, BAT_T, BAT_T / 2); c.fill();
      c.shadowBlur = 0;
      c.fillStyle = 'rgba(255,255,255,.35)'; roundRect(c, x - hw + 0.01, y - BAT_T / 2 + 0.004, hw * 2 - 0.02, BAT_T * 0.3, BAT_T * 0.15); c.fill();
    }
    function drawPU(c, pu) {
      const [k, x, y] = pu, t = performance.now() / 1000, r = 0.045 + Math.sin(t * 5) * 0.004;
      c.fillStyle = k === 'wide' ? '#ffd23f' : '#c77dff';
      c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 0.006; c.beginPath(); c.arc(x, y, r + 0.012, t * 2, t * 2 + 4.5); c.stroke();
      c.fillStyle = '#1d2440'; c.strokeStyle = '#1d2440'; c.lineWidth = 0.009; c.lineCap = 'round';
      if (k === 'wide') { // a double-headed arrow
        c.beginPath(); c.moveTo(x - 0.026, y); c.lineTo(x + 0.026, y); c.moveTo(x - 0.026, y); c.lineTo(x - 0.014, y - 0.012); c.moveTo(x - 0.026, y); c.lineTo(x - 0.014, y + 0.012);
        c.moveTo(x + 0.026, y); c.lineTo(x + 0.014, y - 0.012); c.moveTo(x + 0.026, y); c.lineTo(x + 0.014, y + 0.012); c.stroke();
      } else for (const [dx, dy] of [[0, -0.014], [-0.014, 0.01], [0.014, 0.01]]) { c.beginPath(); c.arc(x + dx, y + dy, 0.008, 0, 6.3); c.fill(); }
    }
    function drawBall(c, x, y, k) {
      const tr = trails[k], lt = tr[tr.length - 1];
      if (lt && Math.hypot(lt[0] - x, lt[1] - y) > 0.25) tr.length = 0;
      tr.push([x, y]); if (tr.length > 8) tr.shift();
      tr.forEach(([tx, ty], i) => { c.fillStyle = `rgba(255,255,255,${(i / tr.length) * 0.22})`; c.beginPath(); c.arc(tx, ty, BR * (0.5 + i / 16), 0, 6.3); c.fill(); });
      c.shadowColor = 'rgba(255,255,255,.8)'; c.shadowBlur = 0.03 * tf.s;
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, BR, 0, 6.3); c.fill(); c.shadowBlur = 0;
    }
    function render(view, _a, hostView) {
      const { c2: c, view: v } = cnv;
      tf = worldTransform(v, W, H, flip);
      c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0); c.clearRect(0, 0, v.w, v.h);
      const [sx, sy] = shake.offset();
      c.setTransform(v.dpr, 0, 0, v.dpr, sx * v.dpr, sy * v.dpr);
      c.translate(tf.ox, tf.oy); c.scale(tf.s, tf.s);
      if (flip) { c.translate(W, H); c.rotate(Math.PI); }
      drawCourt(c);
      let bats, balls = [], wide, pu, score, serveTo = null;
      if (hostView) {
        bats = [view.bat[0].x, view.bat[1].x]; wide = [view.bat[0].wide > 0, view.bat[1].wide > 0];
        balls = view.balls.map((b) => [b.x, b.y]); pu = view.pu ? [view.pu.k, view.pu.x, view.pu.y] : 0; score = view.score;
        if (!view.balls.length) serveTo = view.serve.to;
      } else if (view) {
        const n = view.n; bats = [n[0], n[1]];
        for (let i = 0; i < MAXBALLS; i++) if (n[2 + i * 2] > -5) balls.push([n[2 + i * 2], n[3 + i * 2]]);
        wide = [!!view.q[2], !!view.q[3]]; pu = view.q[4]; score = [view.q[0], view.q[1]];
        if (!balls.length) serveTo = view.q[5];
      }
      if (bats) {
        if (pred && !hostView) {
          const hw = wide[ctx.me] ? WIDE : HW, t = targets[ctx.me];
          if (t) { const tx = clamp(t.x, hw, W - hw), d = tx - pred.x, mx = 3.6 / 60; pred.x += Math.abs(d) > mx ? Math.sign(d) * mx : d; }
          pred.x = clamp(pred.x, hw, W - hw); bats[ctx.me] = pred.x;
        }
        if (pu) drawPU(c, pu);
        drawBat(c, bats[0], 0, wide[0]); drawBat(c, bats[1], 1, wide[1]);
        balls.forEach(([x, y], k) => drawBall(c, x, y, k));
        for (let k = balls.length; k < 3; k++) trails[k].length = 0;
        if (serveTo !== null) {
          c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.arc(W / 2, H / 2, BR, 0, 6.3); c.fill();
          // a small arrow pointing at the player about to receive the serve
          const dir = serveTo === 0 ? 1 : -1;
          c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 0.008; c.beginPath();
          c.moveTo(W / 2 - 0.03, H / 2 + dir * 0.07); c.lineTo(W / 2, H / 2 + dir * 0.1); c.lineTo(W / 2 + 0.03, H / 2 + dir * 0.07); c.stroke();
        }
      }
      if (score) { const k = score.join(':'); if (k !== lastScore) { lastScore = k; bar.set(score[0], score[1]); } }
      if (flash) {
        const t = (performance.now() - flash.at) / 1000;
        if (t > 0.9) flash = null;
        else {
          c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
          c.fillStyle = COL[flash.p]; c.globalAlpha = 0.18 * (1 - t / 0.9);
          c.fillRect(0, 0, v.w, v.h); c.globalAlpha = 1;
        }
      }
      if (!view && !hostView) {
        c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0); c.fillStyle = 'rgba(255,255,255,.7)'; c.font = '700 16px system-ui, sans-serif'; c.textAlign = 'center';
        c.fillText('Waiting for the table', v.w / 2, v.h / 2);
      }
    }

    const loop = syncLoop(ctx, {
      state, step: stepPaddle, pack: packPaddle, render, onEvent,
      input: () => (ctx.local ? [targets[0], targets[1]] : targets[ctx.me]),
      over: (s) => { const w = paddleOver(s); return w === null ? null : { winner: w, text: `${ctx.names[w] || 'Player ' + (w + 1)} wins ${s.score[w]} to ${s.score[1 - w]}` }; },
    });
    bar.mid(`First to ${WIN}`);
    return { destroy() { loop.stop(); off(); cnv.destroy(); } };
  },
};

function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
