// Bubble Pop: aim and shoot bubbles to make groups of three or more. 60 levels with a shot limit and stars, and an
// endless mode where new rows keep pushing down. Rules are in bubble-engine.js. The bubble shine is "Transparent
// Bubble" by aloknarula and the sea is "Underwater scene" by Scribe (both CC0, opengameart.org).
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, sheet, esc, confetti } from './ui.js';
import { sfx } from './sound.js';
import { snd, buzz } from './yeti/kit.js';
import { cbOn } from './cb.js';
import { COLS, rowLen, cellX, cellY, get, count, trace, place, points, level, LEVEL_COUNT, pushRows, nextColour, seeded, lowest, starsFor } from './bubble-engine.js';

const P = () => store.bubble;
const COLOURS = ['#ff4f6d', '#ff9f1c', '#ffd60a', '#2ec27e', '#2f9bff', '#9b5cff'];
const SYMBOLS = ['circle', 'triangle', 'square', 'diamond', 'star', 'cross'];
const MAX_ANGLE = 1.4;

export function bubbleHelp() {
  return new Promise((done) => sheet(`<h2>How to play Bubble Pop</h2><div class="help-body">
    <p>Touch above the launcher to aim, and lift your finger to shoot. The dotted line shows where the bubble will go, including bounces off the walls.</p>
    <p>Join three or more bubbles of the same colour to pop them. Any bubbles left hanging with nothing above them drop too, for bonus points.</p>
    <p>Tap the bubble waiting beside the launcher to swap it with the one you are about to shoot.</p>
    <p><b>Levels</b> give you a set number of shots to clear every bubble, with more stars for shots to spare. <b>Endless</b> adds two new rows every few shots. Keep the bubbles above the line for as long as you can.</p>
  </div><button class="btn bubble-btn" data-x>Let's play</button>`, { onMount: (n, close) => { $('[data-x]', n).onclick = close; }, onClose: done }));
}

// Card art: three glossy bubbles in CSS, with the real bubble shine on top.
const cssBubble = (col, size) => `<i class="bb" style="--c:${col};width:${size}px;height:${size}px"><img src="img/bubble/shine.webp" alt=""></i>`;
export const bubbleCardArt = () => `<div class="art-bubble">${cssBubble(COLOURS[4], 46)}${cssBubble(COLOURS[0], 58)}${cssBubble(COLOURS[2], 40)}</div>`;
export function bubbleProgress() {
  const p = P(), n = Object.keys(p.stars).length;
  if (!n && !p.best) return 'New game';
  return n ? `Level ${Math.min(LEVEL_COUNT, p.level + 1)}` : `Best ${p.best.toLocaleString('en-AU')}`;
}

// ---------- Pictures ----------
let shine = null;
const shineReady = new Promise((ok) => { const im = new Image(); im.onload = () => { shine = im; ok(); }; im.onerror = ok; im.src = 'img/bubble/shine.webp'; });
const sea = new Image(); sea.src = 'img/bubble/sea.webp';
// A bubble picture for each colour at the current size: a lit sphere, the soap-bubble shine, and a crisp rim.
const sprites = new Map();
function sprite(colour, px, cb) {
  const key = `${colour}|${px}|${cb}`;
  if (sprites.has(key)) return sprites.get(key);
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d'), r = px / 2, col = COLOURS[colour];
  const gr = g.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
  gr.addColorStop(0, mix(col, '#ffffff', 0.45)); gr.addColorStop(0.55, col); gr.addColorStop(1, mix(col, '#000000', 0.35));
  g.fillStyle = gr; g.beginPath(); g.arc(r, r, r * 0.96, 0, Math.PI * 2); g.fill();
  if (shine) { g.globalCompositeOperation = 'screen'; g.drawImage(shine, 0, 0, px, px); g.globalCompositeOperation = 'source-over'; }
  g.strokeStyle = mix(col, '#000000', 0.45); g.globalAlpha = 0.5; g.lineWidth = Math.max(1, px * 0.025); g.beginPath(); g.arc(r, r, r * 0.95, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
  if (cb) symbol(g, SYMBOLS[colour], r, r * 1.02, r * 0.38);
  sprites.set(key, c);
  if (sprites.size > 60) sprites.delete(sprites.keys().next().value);
  return c;
}
function symbol(g, kind, x, y, s) {
  g.save(); g.translate(x, y); g.fillStyle = 'rgba(255,255,255,.92)'; g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = s * 0.12; g.beginPath();
  if (kind === 'circle') g.arc(0, 0, s * 0.7, 0, Math.PI * 2);
  else if (kind === 'square') g.rect(-s * 0.62, -s * 0.62, s * 1.24, s * 1.24);
  else if (kind === 'triangle') { g.moveTo(0, -s * 0.8); g.lineTo(s * 0.75, s * 0.6); g.lineTo(-s * 0.75, s * 0.6); g.closePath(); }
  else if (kind === 'diamond') { g.moveTo(0, -s * 0.85); g.lineTo(s * 0.7, 0); g.lineTo(0, s * 0.85); g.lineTo(-s * 0.7, 0); g.closePath(); }
  else if (kind === 'star') for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? s * 0.38 : s * 0.85; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  else { const w = s * 0.28, l = s * 0.8; g.moveTo(-w, -l); g.lineTo(w, -l); g.lineTo(w, -w); g.lineTo(l, -w); g.lineTo(l, w); g.lineTo(w, w); g.lineTo(w, l); g.lineTo(-w, l); g.lineTo(-w, w); g.lineTo(-l, w); g.lineTo(-l, -w); g.lineTo(-w, -w); g.closePath(); }
  g.closePath(); g.fill(); g.stroke(); g.restore();
}
function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)), A = p(a), B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
}

// ---------- Home ----------
export function bubbleHomeScreen(app) {
  const root = el(`<section class="screen bubble-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">Bubble Pop</div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  function render() {
    const p = P(), total = Object.values(p.stars).reduce((a, b) => a + b, 0);
    body.innerHTML = `<div class="bubble-hero">${bubbleCardArt()}</div>
      <button class="bubble-endless" data-act="endless"><div><b>Endless</b><span>New rows keep coming. How long can you last?</span></div><em>${p.best ? `Best ${p.best.toLocaleString('en-AU')}` : 'Play'}</em></button>
      <div class="bubble-head"><b>Levels</b><span>${total} of ${LEVEL_COUNT * 3} stars</span></div>
      <div class="bubble-levels">${Array.from({ length: LEVEL_COUNT }, (_, i) => {
        const st = p.stars[i] || 0, open = i <= p.level;
        return `<button class="bubble-lv ${open ? '' : 'locked'} ${i === p.level ? 'cur' : ''}" data-lv="${i}" ${open ? '' : 'disabled'} aria-label="Level ${i + 1}"><b>${i + 1}</b><i>${[0, 1, 2].map((k) => `<s class="${k < st ? 'on' : ''}"></s>`).join('')}</i></button>`;
      }).join('')}</div>
      <p class="bubble-credit">Bubble shine by aloknarula and the sea by Scribe, both CC0 from opengameart.org.</p>`;
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return bubbleHelp();
    if (a === 'endless') { sfx.tap(); return app.go('bubblegame', { mode: 'endless' }); }
    const lv = e.target.closest('[data-lv]');
    if (lv && !lv.disabled) { sfx.tap(); app.go('bubblegame', { mode: 'level', n: +lv.dataset.lv }); }
  });
  render();
  if (!P().seenHelp) { P().seenHelp = true; save(); setTimeout(bubbleHelp, 300); }
  return { root, refresh: render };
}

// ---------- Play ----------
const ENDLESS_EVERY = 6; // shots between new rows in endless
export function bubbleGameScreen(app, { mode, n = 0 }) {
  const p = P();
  const root = el(`<section class="screen bubble-play">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title" data-el="title"></div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="bubble-stage" data-el="stage"><canvas data-el="cv"></canvas><div class="bubble-over" data-el="over"></div></div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const cv = q('cv'), stage = q('stage'), over = q('over'), g = cv.getContext('2d');
  let W = 0, H = 0, S = 0, top = 0, shooterY = 0, dangerY = 0, raf = 0, last = 0, alive = true;
  let b, colours, shots, shotsMax, rand, cur, nxt, score, fired, state, aim, flying, fx, deco, lvl, shake = 0;
  const cb = cbOn();

  function start() {
    if (mode === 'level') {
      lvl = level(n); b = lvl.board.map((r) => r.slice()); colours = lvl.colours; shots = shotsMax = lvl.shots; rand = seeded(lvl.seed + Date.now() % 1000);
      q('title').textContent = `Level ${n + 1}`;
    } else {
      rand = seeded(Date.now()); colours = 5; b = []; for (let i = 0; i < 3; i++) pushRows(b, rand, colours); shots = Infinity;
      q('title').textContent = 'Endless';
    }
    cur = nextColour(b, rand, colours); nxt = nextColour(b, rand, colours);
    score = 0; fired = 0; state = 'aim'; aim = null; flying = null; fx = []; card('');
  }

  function resize() {
    const r = stage.getBoundingClientRect(), dpr = Math.min(2.5, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = Math.min(W / COLS, (H - 40) / 16);
    top = 44; // room for the score bar
    shooterY = (H - top) / S - 1.3;
    dangerY = shooterY - 1.6;
    sprites.clear();
  }
  const px = (x) => (W - COLS * S) / 2 + x * S, py = (y) => top + y * S;
  const ux = (X) => (X - (W - COLS * S) / 2) / S, uy = (Y) => (Y - top) / S;
  const shooter = () => [COLS / 2, shooterY];
  const nextSpot = () => [COLS / 2 - 2.4, shooterY + 0.35];

  // ---------- input ----------
  function aimAt(X, Y) {
    const [sx, sy] = shooter(), dx = ux(X) - sx, dy = uy(Y) - sy;
    if (dy > -0.4) { aim = null; return; }
    aim = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, Math.atan2(dx, -dy)));
  }
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  let down = null;
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state !== 'aim') return;
    const [X, Y] = pos(e), [nx, ny] = nextSpot();
    if (Math.hypot(ux(X) - nx, uy(Y) - ny) < 0.9) { [cur, nxt] = [nxt, cur]; sfx.tap(); return; }
    down = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch { /* fine */ }
    aimAt(X, Y);
  });
  cv.addEventListener('pointermove', (e) => { if (down === e.pointerId && state === 'aim') aimAt(...pos(e)); });
  const up = (e) => { if (down !== e.pointerId) return; down = null; if (state === 'aim' && aim != null) shoot(aim); aim = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { down = null; aim = null; });

  function shoot(a) {
    const [sx, sy] = shooter(), t = trace(b, sx, sy, a);
    flying = { path: t.path, cell: t.cell, colour: cur, seg: 0, f: 0 };
    state = 'fly'; snd.swoosh();
  }
  // Moves the flying bubble along its path at a steady speed; returns when it lands.
  function fly(dt) {
    let left = dt * 24;
    while (left > 0 && flying) {
      const [x0, y0] = flying.path[flying.seg], [x1, y1] = flying.path[flying.seg + 1], len = Math.hypot(x1 - x0, y1 - y0) || 1e-6;
      const room = (1 - flying.f) * len;
      if (left < room) { flying.f += left / len; left = 0; }
      else { left -= room; flying.seg++; flying.f = 0; if (flying.seg >= flying.path.length - 1) land(); }
    }
  }
  function land() {
    const { cell: [r, c], colour } = flying; flying = null;
    const res = place(b, r, c, colour);
    fired++; if (mode === 'level') shots--;
    if (res.popped.length) {
      const pts = points(res); score += pts;
      res.popped.forEach(([a, z, col], i) => fx.push({ kind: 'pop', x: cellX(a, z), y: cellY(a), col, t: -i * 0.03 }));
      res.dropped.forEach(([a, z, col]) => fx.push({ kind: 'drop', x: cellX(a, z), y: cellY(a), col, vx: (rand() - 0.5) * 3, vy: -2 - rand() * 2, t: 0 }));
      fx.push({ kind: 'text', x: cellX(r, c), y: cellY(r), text: `+${pts}`, t: 0 });
      snd.pop(); if (res.dropped.length) setTimeout(() => snd.ding(Math.min(6, res.dropped.length)), 120);
      buzz(res.dropped.length ? [15, 30, 15] : 12);
    } else { sfx.place(); shake = 0.15; }
    if (mode === 'endless' && fired % ENDLESS_EVERY === 0) { pushRows(b, rand, colours); snd.thud(); if (fired % (ENDLESS_EVERY * 5) === 0 && colours < 6) colours++; }
    cur = nxt; nxt = nextColour(b, rand, colours);
    if (!coloursOk()) cur = nextColour(b, rand, colours);
    state = 'aim';
    check();
  }
  const coloursOk = () => !count(b) || b.flat().includes(cur);
  function check() {
    const low = lowest(b);
    if (mode === 'level' && !count(b)) return finish(true);
    if (low >= 0 && cellY(low) + 0.5 > dangerY) return finish(false, 'The bubbles reached the line');
    if (mode === 'level' && shots <= 0) return finish(false, 'Out of shots');
  }

  // ---------- drawing ----------
  function draw(dt) {
    g.globalAlpha = 1; g.clearRect(0, 0, W, H);
    // the sea, covering the stage
    if (sea.complete && sea.naturalWidth) { const k = Math.max(W / sea.naturalWidth, H / sea.naturalHeight); g.drawImage(sea, (W - sea.naturalWidth * k) / 2, H - sea.naturalHeight * k, sea.naturalWidth * k, sea.naturalHeight * k); }
    else { g.fillStyle = '#0d5fa8'; g.fillRect(0, 0, W, H); }
    g.fillStyle = 'rgba(4, 22, 48, .28)'; g.fillRect(0, 0, W, H);
    drawDeco(dt);
    // the field: a soft glass panel behind the bubbles
    const fx0 = px(0), fw = COLS * S;
    g.fillStyle = 'rgba(255,255,255,.06)'; roundRect(g, fx0 - 4, top - 4, fw + 8, (dangerY + 0.2) * S + 8, 14); g.fill();
    // danger line
    g.save(); g.setLineDash([8, 8]); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(fx0, py(dangerY)); g.lineTo(fx0 + fw, py(dangerY)); g.stroke(); g.restore();
    const ox = shake > 0 ? Math.sin(performance.now() / 20) * shake * 10 : 0; shake = Math.max(0, shake - dt);
    const R = Math.round(S * 1.02);
    g.save(); g.translate(ox, 0);
    for (let r = 0; r < b.length; r++) for (let c = 0; c < rowLen(r); c++) { const v = get(b, r, c); if (v >= 0) g.drawImage(sprite(v, R, cb), px(cellX(r, c)) - R / 2, py(cellY(r)) - R / 2, R, R); }
    g.restore();
    // aim guide: dots along the path, stopping where the bubble would land
    if (state === 'aim' && aim != null) {
      const [sx, sy] = shooter(), t = trace(b, sx, sy, aim);
      g.fillStyle = 'rgba(255,255,255,.85)';
      let d = 0.6;
      for (let i = 0; i < t.path.length - 1; i++) {
        const [x0, y0] = t.path[i], [x1, y1] = t.path[i + 1], len = Math.hypot(x1 - x0, y1 - y0);
        for (; d < len; d += 0.45) { const f = d / len; g.beginPath(); g.arc(px(x0 + (x1 - x0) * f), py(y0 + (y1 - y0) * f), S * 0.08, 0, Math.PI * 2); g.fill(); }
        d -= len;
      }
      if (t.cell) { const [r, c] = t.cell; g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.beginPath(); g.arc(px(cellX(r, c)), py(cellY(r)), R * 0.46, 0, Math.PI * 2); g.stroke(); }
    }
    // effects
    for (const f of fx) {
      f.t += dt;
      if (f.kind === 'pop' && f.t > 0) {
        const k = Math.min(1, f.t / 0.28), s = R * (1 + k * 0.5);
        g.globalAlpha = Math.max(0, 1 - k); g.drawImage(sprite(f.col, R, cb), px(f.x) - s / 2, py(f.y) - s / 2, s, s);
        g.strokeStyle = COLOURS[f.col]; g.lineWidth = 3 * (1 - k); g.beginPath(); g.arc(px(f.x), py(f.y), R * (0.6 + k), 0, Math.PI * 2); g.stroke();
        for (let i = 0; i < 6; i++) { const a = i * 1.047 + f.x; g.fillStyle = '#fff'; g.beginPath(); g.arc(px(f.x) + Math.cos(a) * R * (0.4 + k), py(f.y) + Math.sin(a) * R * (0.4 + k), S * 0.06 * (1 - k), 0, Math.PI * 2); g.fill(); }
        g.globalAlpha = 1; if (k >= 1) f.done = true;
      } else if (f.kind === 'drop') {
        f.vy += 30 * dt; f.x += f.vx * dt; f.y += f.vy * dt;
        g.globalAlpha = Math.max(0, 1 - f.t / 1.2); g.drawImage(sprite(f.col, R, cb), px(f.x) - R / 2, py(f.y) - R / 2, R, R); g.globalAlpha = 1;
        if (f.t > 1.2) f.done = true;
      } else if (f.kind === 'text') {
        g.globalAlpha = Math.max(0, 1 - f.t / 0.9); g.font = `800 ${Math.round(S * 0.55)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 4; g.strokeStyle = 'rgba(4,22,48,.6)'; g.strokeText(f.text, px(f.x), py(f.y - f.t * 1.2)); g.fillStyle = '#fff'; g.fillText(f.text, px(f.x), py(f.y - f.t * 1.2));
        g.globalAlpha = 1; if (f.t > 0.9) f.done = true;
      }
    }
    fx = fx.filter((f) => !f.done);
    // launcher: a ring with the arrow pointing where you aim, the bubble ready to shoot, and the next one to the left
    const [sx, sy] = shooter(), a = aim ?? 0;
    g.save(); g.translate(px(sx), py(sy));
    g.fillStyle = 'rgba(4,22,48,.35)'; g.beginPath(); g.arc(0, 0, R * 0.85, 0, Math.PI * 2); g.fill();
    g.rotate(a); g.fillStyle = 'rgba(255,255,255,.9)';
    g.beginPath(); g.moveTo(0, -R * 1.25); g.lineTo(R * 0.22, -R * 0.88); g.lineTo(-R * 0.22, -R * 0.88); g.closePath(); g.fill();
    g.restore();
    if (state !== 'fly' && state !== 'done') g.drawImage(sprite(cur, R, cb), px(sx) - R / 2, py(sy) - R / 2, R, R);
    if (flying) {
      const [x0, y0] = flying.path[flying.seg], [x1, y1] = flying.path[Math.min(flying.path.length - 1, flying.seg + 1)];
      g.drawImage(sprite(flying.colour, R, cb), px(x0 + (x1 - x0) * flying.f) - R / 2, py(y0 + (y1 - y0) * flying.f) - R / 2, R, R);
    }
    const [nx, ny] = nextSpot(), r2 = R * 0.72;
    g.drawImage(sprite(nxt, Math.round(r2), cb), px(nx) - r2 / 2, py(ny) - r2 / 2, r2, r2);
    g.font = `700 ${Math.max(11, Math.round(S * 0.3))}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = 'rgba(255,255,255,.8)';
    g.fillText('Tap to swap', px(nx), py(ny) + r2 * 0.6);
    drawHud();
  }
  function drawHud() {
    g.fillStyle = 'rgba(4,22,48,.55)'; roundRect(g, 10, 8, W - 20, 30, 15); g.fill();
    g.font = '800 15px system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    g.textAlign = 'left'; g.fillText(score.toLocaleString('en-AU'), 24, 23);
    g.textAlign = 'right';
    if (mode === 'level') g.fillText(`${shots} ${shots === 1 ? 'shot' : 'shots'} left`, W - 24, 23);
    else { const until = ENDLESS_EVERY - (fired % ENDLESS_EVERY); g.fillText(`New rows in ${until}`, W - 24, 23); }
    if (mode === 'endless' && p.best) { g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '700 12px system-ui, sans-serif'; g.fillText(`Best ${p.best.toLocaleString('en-AU')}`, W / 2, 23); }
  }
  // tiny bubbles rising through the sea behind the field
  function drawDeco(dt) {
    if (!deco) deco = Array.from({ length: 14 }, () => ({ x: Math.random(), y: Math.random(), s: 0.15 + Math.random() * 0.3, v: 0.02 + Math.random() * 0.05 }));
    if (!shine) return;
    g.globalAlpha = 0.35;
    for (const d of deco) { d.y -= d.v * dt; if (d.y < -0.05) { d.y = 1.05; d.x = Math.random(); } const s = d.s * S; g.drawImage(shine, d.x * W - s / 2, d.y * H - s / 2, s, s); }
    g.globalAlpha = 1;
  }

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    if (!W || H < 200) return;
    if (state === 'fly') fly(dt);
    draw(dt);
  }

  // ---------- results ----------
  function card(html) { over.innerHTML = html ? `<div class="bubble-card">${html}</div>` : ''; over.classList.toggle('show', !!html); }
  function finish(won, why = '') {
    state = 'done';
    if (mode === 'level') {
      if (won) {
        const st = starsFor(shots, shotsMax), bonus = shots * 50; score += bonus;
        p.stars[n] = Math.max(p.stars[n] || 0, st); if (p.level <= n) p.level = Math.min(LEVEL_COUNT - 1, n + 1); save(true);
        snd.cheer(); confetti(); buzz([30, 50, 30]);
        setTimeout(() => card(`<h3>Level ${n + 1} cleared</h3>
          <div class="bubble-stars">${[0, 1, 2].map((k) => `<span class="${k < st ? 'on' : ''}"></span>`).join('')}</div>
          <div class="big">${score.toLocaleString('en-AU')}</div><p class="sub">${shots} ${shots === 1 ? 'shot' : 'shots'} to spare, +${bonus} bonus</p>
          ${n + 1 < LEVEL_COUNT ? '<button class="btn bubble-btn" data-go="next">Next level</button>' : ''}
          <button class="btn ghost" data-go="again">Play again</button><button class="btn ghost" data-go="back">All levels</button>`), 600);
      } else {
        snd.fail();
        setTimeout(() => card(`<h3>${esc(why)}</h3><p class="sub">${count(b)} ${count(b) === 1 ? 'bubble' : 'bubbles'} left on level ${n + 1}</p>
          <button class="btn bubble-btn" data-go="again">Try again</button><button class="btn ghost" data-go="back">All levels</button>`), 500);
      }
    } else {
      const prev = p.best || 0, isBest = score > prev;
      if (isBest) p.best = score; p.games = (p.games || 0) + 1; save(true);
      if (isBest && score > 0) { snd.cheer(); confetti(); } else snd.fail();
      setTimeout(() => card(`${isBest && score > 0 ? '<div class="badge">New best</div>' : ''}<h3>${esc(why)}</h3>
        <div class="big">${score.toLocaleString('en-AU')}</div><p class="sub">${!score ? 'Join three or more of a colour to score' : isBest || !prev ? (prev ? `Previous best ${prev.toLocaleString('en-AU')}` : 'First score on the board') : `Best ${prev.toLocaleString('en-AU')}`}</p>
        <button class="btn bubble-btn" data-go="again">Play again</button><button class="btn ghost" data-go="back">Back</button>`), 500);
    }
  }
  over.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]')?.dataset.go; if (!go) return;
    if (go === 'again') start();
    else if (go === 'next') { n++; start(); }
    else if (go === 'back') app.back();
  });
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') bubbleHelp();
  });
  const ro = new ResizeObserver(() => resize());
  ro.observe(stage);
  shineReady.then(() => sprites.clear());
  start(); resize();
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
  return { root, destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); } };
}

function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
