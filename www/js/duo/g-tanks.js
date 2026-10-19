// Tank Duel: turn-based artillery on hills that blow apart. Both phones build the same hills from the
// shared seed; the host decides every shot and sends the result, and both phones play the same animation.
import { makeCanvas, tone, noise, shaker, clamp } from './rt-kit.js';
import { W, H, COLS, TANK_W, HP, WEAPONS, newTanks, fire, tanksOver, packTanks, unpackTanks, groundAt, tankY, barrelTip, speedOf } from './rt-tanks.js';

const COL = ['#3fae49', '#d64541'];
const IMG = {};
// Kenney Tanks pack (CC0): hull, tracks and turret are drawn as separate pieces so the turret can aim.
const SPRITES = { body0: 'tanks_body_green', body1: 'tanks_body_grey', tracks: 'tanks_tracks', turret: 'tanks_turret', shell: 'tanks_shell', big: 'tanks_bigshell', boom1: 'tanks_boom1', boom2: 'tanks_boom2', boom3: 'tanks_boom3', boom4: 'tanks_boom4', cloud: 'tanks_cloud' };
function loadSprites() {
  for (const [k, f] of Object.entries(SPRITES)) {
    if (IMG[k]) continue;
    const im = new Image(); im.src = `img/duo/${f}.png`; IMG[k] = im;
  }
}
const ready = (k) => IMG[k] && IMG[k].complete && IMG[k].naturalWidth > 0;

function art() {
  return `<div class="rt-art tanks-art"><img src="img/duo/tanks_card_green.png" alt="" class="t0"><img src="img/duo/tanks_card_grey.png" alt="" class="t1"><svg viewBox="0 0 120 80" aria-hidden="true"><path d="M0 64Q30 44 60 58T120 52V80H0Z" fill="#6fb24a"/><path d="M0 70Q30 52 60 66T120 60V80H0Z" fill="#8a5a33"/><path d="M28 40Q60 -4 92 34" stroke="#fff" stroke-width="2" stroke-dasharray="3 4" fill="none"/></svg></div>`;
}

export default {
  id: 'tanks', cat: 'action', name: 'Tank Duel', tag: 'Take turns lobbing shells over the hills', realtime: true, art,
  help: [
    'Take turns firing at your friend\'s tank. Drag on the battlefield to aim: the direction sets the angle and the distance from your tank sets the power. Then tap Fire.',
    'Watch the wind. It changes every turn and pushes shells left or right.',
    'Shells dig craters in the hills. The Big shell (two per game) makes a much bigger blast, and the Bouncer (three per game) bounces twice before it goes off.',
    'The first tank to lose all its health loses the game.',
  ],
  create(ctx) {
    loadSprites();
    const root = ctx.root;
    root.innerHTML = `<div class="rt-game rt-tanks${ctx.local ? ' local' : ''}">
      <div class="tk-hud"><div class="tk-turn" data-el="turn"></div><div class="tk-wind" data-el="wind"></div></div>
      <div class="rt-stage" data-el="stage"></div>
      <div class="tk-panel">
        <div class="tk-weapons" data-el="weapons"></div>
        <div class="tk-row"><div class="tk-read" data-el="read"></div><button class="tk-fire" data-el="fire">Fire</button></div>
      </div></div>`;
    const q = (k) => root.querySelector(`[data-el="${k}"]`);
    const cnv = makeCanvas(q('stage'));
    const shake = shaker();
    const s = newTanks(ctx.rng || Math.random, ctx.first ?? 0);
    const isHost = ctx.local || ctx.isHost;
    root.querySelector('.rt-tanks').__state = s; // read by the test harness
    let weapon = 'shell', anim = null, busy = false, over = false, dragging = false, lastAimSent = 0;
    const floats = [];
    let tf = null;

    const myTurn = () => !over && !busy && (ctx.local || s.turn === ctx.me);
    const nameOf = (i) => ctx.names?.[i] || `Player ${i + 1}`;

    function layout() {
      const v = cnv.view, sc = Math.min(v.w / W, v.h / H);
      tf = { s: sc, ox: (v.w - W * sc) / 2, oy: (v.h - H * sc) / 2 };
    }
    const toWorld = (px, py) => [(px - tf.ox) / tf.s, H - (py - tf.oy) / tf.s];
    // world y is measured up from the bottom; the canvas draws downwards
    const X = (x) => x, Y = (y) => H - y;

    // ----- input -----
    function aimFrom(px, py) {
      layout();
      const t = s.tanks[s.turn], [wx, wy] = toWorld(px, py), ty = tankY(s, t) + 0.041;
      const dx = wx - t.x, dy = wy - ty;
      if (Math.hypot(dx, dy) < 0.02) return;
      let a = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (a < -90) a = 180; else if (a < 0) a = 0;
      t.aim = { a: Math.round(a), p: Math.round(clamp(Math.hypot(dx, dy) / 0.5, 0.05, 1) * 100) / 100 };
      const now = performance.now();
      if (!ctx.local && now - lastAimSent > 90) { lastAimSent = now; ctx.send({ t: 'aim', p: s.turn, a: t.aim.a, w: t.aim.p }); }
      updatePanel();
    }
    const cv = cnv.cv;
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', (e) => { if (!myTurn()) return; dragging = true; try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ } const r = cv.getBoundingClientRect(); aimFrom(e.clientX - r.left, e.clientY - r.top); });
    cv.addEventListener('pointermove', (e) => { if (!dragging || !myTurn()) return; const r = cv.getBoundingClientRect(); aimFrom(e.clientX - r.left, e.clientY - r.top); });
    const stopDrag = () => { if (dragging && !ctx.local) { const t = s.tanks[s.turn]; ctx.send({ t: 'aim', p: s.turn, a: t.aim.a, w: t.aim.p }); } dragging = false; };
    cv.addEventListener('pointerup', stopDrag); cv.addEventListener('pointercancel', stopDrag);

    q('weapons').addEventListener('click', (e) => {
      const b = e.target.closest('[data-w]'); if (!b || !myTurn()) return;
      const w = b.dataset.w, t = s.tanks[s.turn];
      if (w !== 'shell' && !(t.stock[w] > 0)) { ctx.toast?.('None left'); return; }
      weapon = w; tone(880, 0.04, { type: 'triangle', vol: 0.05 }); updatePanel();
    });
    q('fire').addEventListener('click', () => {
      if (!myTurn()) return;
      const t = s.tanks[s.turn], shot = { a: t.aim.a, p: t.aim.p, w: weapon };
      busy = true; updatePanel();
      if (isHost) hostFire(shot); else ctx.send({ t: 'fire', shot, n: s.shots });
    });

    // ----- network -----
    function hostFire(shot) {
      const before = s.h.slice(), shooter = s.turn;
      const res = fire(s, shot);
      s.wind = Math.round((Math.random() * 2 - 1) * 100) / 100;
      const after = packTanks(s);
      unpackTanks(s, after); // round the host's own numbers the same way, so both phones match exactly
      if (!ctx.local) ctx.send({ t: 'shot', shot, after });
      play(res, before, shooter, shot);
    }
    const unsub = ctx.onMsg?.((m) => {
      if (!m) return;
      if (m.t === 'aim' && m.p === s.turn && !(ctx.local) && s.turn !== ctx.me) { s.tanks[m.p].aim = { a: m.a, p: m.w }; updatePanel(); }
      else if (m.t === 'fire' && isHost && s.turn !== ctx.me && !busy && !over && m.n === s.shots) { busy = true; hostFire(m.shot); }
      else if (m.t === 'shot' && !isHost) {
        const before = s.h.slice(), shooter = s.turn;
        busy = true;
        const res = fire(s, m.shot);
        unpackTanks(s, m.after); // the host's numbers win, so both phones stay identical
        play(res, before, shooter, m.shot);
      }
    });

    // ----- shot animation -----
    function play(res, before, shooter, shot) {
      weapon = 'shell';
      const t = s.tanks[shooter]; t.aim = { a: shot.a, p: shot.p };
      anim = { res, before, shooter, i: 0, boomAt: null, t0: performance.now(), big: shot.w === 'big' };
      noise(0.25, { vol: 0.25, freq: 700 }); tone(110, 0.25, { type: 'sawtooth', vol: 0.06, slideTo: 60 });
      shake.kick(2);
      updatePanel();
    }
    function finishShot() {
      const { res, shooter } = anim;
      anim = null; busy = false;
      res.damage.forEach((d, i) => { if (d > 0) floats.push({ x: s.tanks[i].x, y: tankY(s, s.tanks[i]) + 0.09, txt: `-${d}`, at: performance.now(), c: '#ff4040' }); });
      if (!res.damage.some((d) => d > 0)) floats.push({ x: res.path[res.path.length - 1][0], y: Math.max(0.1, res.path[res.path.length - 1][1]) + 0.05, txt: res.hit === 'miss' ? 'Miss' : 'Close', at: performance.now(), c: '#fff' });
      const o = tanksOver(s);
      if (o) {
        over = true;
        const txt = o.winner === null ? 'Both tanks are out. It is a draw.' : `${nameOf(o.winner)} wins the duel`;
        setTimeout(() => ctx.end({ winner: o.winner, text: txt }), 1300);
      } else {
        const mine = ctx.local || s.turn === ctx.me;
        if (mine) { tone(660, 0.1, { vol: 0.05 }); tone(990, 0.12, { vol: 0.05, delay: 0.08 }); ctx.buzz?.(15); }
      }
      updatePanel();
      void shooter;
    }

    // ----- panel -----
    function updatePanel() {
      const t = s.tanks[s.turn], mine = myTurn() || (busy && (ctx.local || s.turn === ctx.me));
      q('turn').textContent = over ? 'Game over' : busy ? 'Firing' : ctx.local ? `${nameOf(s.turn)} to fire` : s.turn === ctx.me ? 'Your turn' : `${nameOf(s.turn)} is aiming`;
      q('turn').style.setProperty('--c', COL[s.turn]);
      const w = s.wind, dir = w > 0.04 ? 'right' : w < -0.04 ? 'left' : '';
      q('wind').innerHTML = `<span>Wind</span><i class="${dir}" style="--w:${Math.abs(w)}"></i><b>${Math.round(Math.abs(w) * 10)}</b>`;
      q('weapons').innerHTML = Object.entries(WEAPONS).map(([k, d]) => {
        const left = k === 'shell' ? '' : `<small>${t.stock[k]}</small>`;
        return `<button class="tk-w ${weapon === k ? 'on' : ''}" data-w="${k}" ${!mine || (k !== 'shell' && !(t.stock[k] > 0)) ? 'disabled' : ''}><span class="tk-ic tk-ic-${k}"></span>${d.name}${left}</button>`;
      }).join('');
      q('read').innerHTML = `<span>Angle <b>${Math.round(t.aim.a)}°</b></span><span>Power <b>${Math.round(t.aim.p * 100)}</b></span>`;
      q('fire').disabled = !myTurn();
      root.querySelector('.rt-tanks').classList.toggle('waiting', !mine);
    }

    // ----- drawing -----
    function drawTank(c, i, heights) {
      const t = s.tanks[i], gy = groundOn(heights, t.x), x = t.x, y = Y(gy);
      // tilt with the slope under the tank
      const sl = (groundOn(heights, t.x + 0.03) - groundOn(heights, t.x - 0.03)) / 0.06, tilt = -Math.atan(sl);
      const a = (t.aim.a * Math.PI) / 180;
      c.save(); c.translate(x, y); c.rotate(tilt);
      const bw = TANK_W, bh = TANK_W * 0.62;
      // barrel pivots at the turret
      c.save(); c.translate(0, -bh * 0.7); c.rotate(-a - tilt);
      if (ready('turret')) { const im = IMG.turret, L = 0.062, Wd = L * (im.naturalHeight / im.naturalWidth); c.drawImage(im, 0, -Wd / 2, L, Wd); }
      else { c.fillStyle = '#3a3a3a'; c.fillRect(0, -0.006, 0.05, 0.012); }
      c.restore();
      if (ready('body' + i) && ready('tracks')) {
        const hull = IMG['body' + i], tr = IMG.tracks, th = bw * 0.9 * (tr.naturalHeight / tr.naturalWidth), hh = bw * (hull.naturalHeight / hull.naturalWidth);
        if (i === 1) c.scale(-1, 1); // the right-hand tank faces left
        c.drawImage(tr, -bw * 0.45, -th, bw * 0.9, th);
        c.drawImage(hull, -bw / 2, -th * 0.55 - hh, bw, hh);
      } else {
        c.fillStyle = COL[i]; roundRect(c, -bw / 2, -bh, bw, bh * 0.75, 0.01); c.fill();
        c.fillStyle = '#333'; roundRect(c, -bw / 2, -bh * 0.3, bw, bh * 0.32, 0.008); c.fill();
        c.fillStyle = COL[i]; c.beginPath(); c.arc(0, -bh * 0.75, bh * 0.38, Math.PI, 0); c.fill();
      }
      c.restore();
      // health bar and name
      const hb = 0.12, hy = y - 0.105;
      c.fillStyle = 'rgba(0,0,0,.35)'; roundRect(c, x - hb / 2, hy, hb, 0.016, 0.008); c.fill();
      c.fillStyle = t.hp > 50 ? '#3ddc84' : t.hp > 25 ? '#ffc93c' : '#ff4d4d'; roundRect(c, x - hb / 2, hy, hb * (t.hp / HP), 0.016, 0.008); c.fill();
      c.fillStyle = '#fff'; c.font = '800 0.032px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'bottom';
      c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 0.006; const label = ctx.local || i !== ctx.me ? nameOf(i) : 'You';
      c.strokeText(label, x, hy - 0.006); c.fillText(label, x, hy - 0.006);
      if (s.turn === i && !busy && !over) { c.fillStyle = COL[i]; c.beginPath(); c.moveTo(x, hy - 0.05); c.lineTo(x - 0.012, hy - 0.07); c.lineTo(x + 0.012, hy - 0.07); c.fill(); }
    }
    const groundOn = (heights, x) => { const f = clamp(x, 0, 1) * (COLS - 1), i = Math.floor(f), j = Math.min(COLS - 1, i + 1); return heights[i] + (heights[j] - heights[i]) * (f - i); };
    function drawGround(c, heights) {
      const dark = document.documentElement.dataset.theme === 'dark';
      // the ground runs past the edges and down into any spare space below the battlefield
      c.beginPath(); c.moveTo(-1, H + 2); c.lineTo(-1, Y(heights[0]));
      for (let i = 0; i < COLS; i++) c.lineTo(i / (COLS - 1), Y(heights[i]));
      c.lineTo(2, Y(heights[COLS - 1])); c.lineTo(2, H + 2); c.closePath();
      const g = c.createLinearGradient(0, Y(0.6), 0, H);
      g.addColorStop(0, dark ? '#6a4a2c' : '#a5703f'); g.addColorStop(1, dark ? '#3c2817' : '#6d4424');
      c.fillStyle = g; c.fill();
      c.beginPath();
      for (let i = 0; i < COLS; i++) { const p = [i / (COLS - 1), Y(heights[i])]; if (i) c.lineTo(...p); else c.moveTo(...p); }
      c.strokeStyle = dark ? '#4f8f3a' : '#6cc04a'; c.lineWidth = 0.018; c.lineJoin = 'round'; c.stroke();
    }
    function drawSky(c, v) {
      const dark = document.documentElement.dataset.theme === 'dark';
      const g = c.createLinearGradient(0, 0, 0, v.h);
      g.addColorStop(0, dark ? '#101a33' : '#7cc4f2'); g.addColorStop(1, dark ? '#2b3557' : '#d8f0ff');
      c.fillStyle = g; c.fillRect(0, 0, v.w, v.h);
    }
    function drawClouds(c) {
      const t = performance.now() / 1000;
      for (const [k, y, sc] of [[0, 0.12, 0.2], [1, 0.25, 0.15], [2, 0.08, 0.12]]) {
        const x = ((k * 0.37 + t * 0.01 * (1 + s.wind * 2)) % 1.4 + 1.4) % 1.4 - 0.2;
        if (ready('cloud')) { const im = IMG.cloud; c.globalAlpha = 0.85; c.drawImage(im, x, y, sc, sc * (im.naturalHeight / im.naturalWidth)); c.globalAlpha = 1; }
        else { c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.ellipse(x + sc / 2, y + 0.03, sc / 2, 0.03, 0, 0, 6.3); c.fill(); }
      }
    }
    function drawBoom(c, x, y, r, f) {
      // f runs 0..1 through the explosion
      const k = Math.min(4, 1 + Math.floor(f * 4));
      if (ready('boom' + k)) { const im = IMG['boom' + k], d = r * (2.2 + f * 1.2); c.globalAlpha = k === 4 ? Math.max(0, 1 - (f - 0.75) * 4) : 1; c.drawImage(im, x - d / 2, Y(y) - d / 2, d, d); c.globalAlpha = 1; }
      else { c.fillStyle = `rgba(255,${150 - f * 100},40,${1 - f})`; c.beginPath(); c.arc(x, Y(y), r * (0.5 + f), 0, 6.3); c.fill(); }
    }
    function frame() {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const { c2: c, view: v } = cnv;
      layout();
      c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
      drawSky(c, v);
      const [sx, sy] = shake.offset();
      c.setTransform(v.dpr * tf.s, 0, 0, v.dpr * tf.s, (tf.ox + sx) * v.dpr, (tf.oy + sy) * v.dpr);
      drawClouds(c);
      let heights = s.h, shell = null, boom = null;
      if (anim) {
        const el = (performance.now() - anim.t0) / 1000, idx = Math.floor(el * 60), path = anim.res.path;
        const finalBoom = anim.res.booms[anim.res.booms.length - 1];
        const boomStart = finalBoom && !finalBoom.bounce ? finalBoom.at : null;
        if (idx < path.length - 1) { shell = path[idx]; heights = anim.before; }
        else {
          if (anim.boomAt === null) {
            anim.boomAt = performance.now();
            if (boomStart !== null) { const R = finalBoom.r; noise(0.5, { vol: 0.35, freq: 500 + 2000 * (0.05 / R) }); tone(70, 0.4, { type: 'sawtooth', vol: 0.08, slideTo: 40 }); shake.kick(R > 0.07 ? 12 : 7); ctx.buzz?.(R > 0.07 ? 60 : 35); }
          }
          const bf = (performance.now() - anim.boomAt) / 550;
          if (boomStart !== null && bf < 1) boom = { ...finalBoom, f: bf };
          if (bf >= 1.15) finishShot();
        }
        // bounce puffs along the way
        if (anim) for (const b of anim.res.booms) if (b.bounce && idx >= b.at && idx < b.at + 10) { if (idx === b.at) tone(300, 0.06, { type: 'square', vol: 0.05 }); drawBoom(c, b.x, b.y, 0.03, (idx - b.at) / 10); }
      }
      drawGround(c, heights);
      drawTank(c, 0, heights); drawTank(c, 1, heights);
      // aim guide: a short dotted arc from the barrel in the aimed direction (not the whole flight)
      if (!busy && !over && (ctx.local || s.turn === ctx.me)) {
        const t = s.tanks[s.turn], [bx, by] = barrelTip(s, t, t.aim.a), r = (t.aim.a * Math.PI) / 180, sp = speedOf(t.aim.p);
        c.fillStyle = 'rgba(255,255,255,.85)';
        for (let k = 1; k <= 7; k++) { const tt = k * 0.035, x = bx + Math.cos(r) * sp * tt, y = by + Math.sin(r) * sp * tt - 0.5 * tt * tt; c.beginPath(); c.arc(x, Y(y), 0.006, 0, 6.3); c.fill(); }
      }
      if (shell) {
        const [x, y] = shell;
        if (ready('shell')) { const im = anim.big && ready('big') ? IMG.big : IMG.shell, L = anim.big ? 0.036 : 0.024, prev = anim.res.path[Math.max(0, Math.floor(((performance.now() - anim.t0) / 1000) * 60) - 1)], ang = Math.atan2(-(y - prev[1]), x - prev[0]); c.save(); c.translate(x, Y(y)); c.rotate(ang); c.drawImage(im, -L / 2, -L * 0.25, L, L * 0.5); c.restore(); }
        else { c.fillStyle = '#222'; c.beginPath(); c.arc(x, Y(y), 0.01, 0, 6.3); c.fill(); }
        if (y > H) { // above the top of the screen: a little arrow shows where it is
          c.fillStyle = 'rgba(30,40,60,.75)'; const ax = clamp(x, 0.03, W - 0.03), sz = 0.022 - Math.min(0.01, (y - H) * 0.02);
          c.beginPath(); c.moveTo(ax, 0.008); c.lineTo(ax - sz, 0.008 + sz * 1.4); c.lineTo(ax + sz, 0.008 + sz * 1.4); c.fill();
        }
      }
      if (boom) drawBoom(c, boom.x, boom.y, boom.r, boom.f);
      // floating damage numbers
      const now = performance.now();
      for (let i = floats.length - 1; i >= 0; i--) {
        const f = floats[i], t = (now - f.at) / 1200;
        if (t >= 1) { floats.splice(i, 1); continue; }
        c.globalAlpha = 1 - t; c.fillStyle = f.c; c.font = '900 0.05px system-ui, sans-serif'; c.textAlign = 'center';
        c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 0.008; c.strokeText(f.txt, f.x, Y(f.y + t * 0.06)); c.fillText(f.txt, f.x, Y(f.y + t * 0.06)); c.globalAlpha = 1;
      }
    }
    let alive = true, raf = requestAnimationFrame(frame);
    updatePanel();
    return { destroy() { alive = false; cancelAnimationFrame(raf); if (typeof unsub === 'function') unsub(); cnv.destroy(); } };
  },
};

function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
