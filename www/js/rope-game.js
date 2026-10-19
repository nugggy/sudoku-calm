// Sweet Drop: swipe to cut the ropes and swing the sweet into the frog's mouth, collecting stars on the way.
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet, levelHome } from './kit.js';
import { W, H, CR, DT, makeWorld, step, act, heldBubble } from './rope-engine.js';
import { LEVELS } from './rope-levels.js';

const RB = () => store.rope;
export const ropeHelp = () => helpSheet('How to play Sweet Drop', [
  'Swipe across a rope to cut it. The sweet swings and falls, so time your cuts to send it into the frog\'s mouth.',
  'Pick up the three stars on the way for a perfect level.',
  'A bubble catches the sweet and floats it upwards. Tap the bubble to pop it.',
  'A dotted circle is a hook. When the sweet comes inside it, a new rope grabs the sweet.',
  'Keep the sweet away from spikes and the edges of the screen. Restart any time with the button at the top.',
], 'rope-btn');

const IMG = {};
for (const [k, src] of Object.entries({ candy: 'img/rope/candy.png', star: 'img/rope/star.png', bubble: 'img/rope/bubble.png', spikes: 'img/rope/spikes.png', frog: 'img/kenney/animals/frog.png' })) {
  if (typeof Image !== 'undefined') { IMG[k] = new Image(); IMG[k].src = src; }
}
const ready = (im) => im && im.complete && im.naturalWidth;

// ---------- Picker and home art ----------
const artHTML = (cls) => `<div class="${cls}"><i class="rp-pin"></i><i class="rp-line"></i><img class="rp-candy" src="img/rope/candy.png" alt="">
  <img class="rp-star" src="img/rope/star.png" alt=""><img class="rp-frog" src="img/kenney/animals/frog.png" alt=""></div>`;
export const ropeCardArt = () => artHTML('art-rope');
const starRow = (n) => `<span class="rp-lvst">${[0, 1, 2].map((k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('')}</span>`;
const totalStars = () => Object.values(RB().stars).reduce((a, b) => a + b, 0);

// ---------- Home ----------
export function ropeHomeScreen(app) {
  return levelHome({
    app, cls: 'rope-theme', title: 'Sweet Drop', help: ropeHelp,
    hero: artHTML('rp-hero'),
    play: () => {
      const all = RB().level >= LEVELS.length;
      return { label: all ? 'Play again' : `Play level ${RB().level + 1}`, sub: `${totalStars()} of ${LEVELS.length * 3} stars` };
    },
    onPlay: () => app.go('ropegame', { idx: RB().level >= LEVELS.length ? 0 : RB().level }),
    levels: () => ({ count: LEVELS.length, current: RB().level, done: (i) => i < RB().level, label: (i) => `${i + 1}${i < RB().level ? starRow(RB().stars[i] || 0) : ''}` }),
    onLevel: (i) => app.go('ropegame', { idx: i }),
  });
}

// ---------- Game ----------
// Does segment p1-p2 cross segment p3-p4? Returns true when it does.
function crosses(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (!d) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export function ropeGameScreen(app, { idx }) {
  const rb = RB(), L = LEVELS[idx];
  let w = null, alive = true, raf = 0, last = 0, acc = 0, ended = false, chomp = 0, clock = 0;
  let trail = [], parts = [], pointer = null;
  const root = el(`<section class="screen rope-theme rope-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">Level ${idx + 1}</div>
      <button class="icon-btn" data-act="restart" aria-label="Restart">${icon.restart}</button>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="rp-hud" data-el="hud">${[0, 1, 2].map(() => '<img src="img/rope/star.png" alt="">').join('')}</div>
    <div class="rp-wrap" data-el="wrap"><canvas class="rp-canvas" data-el="cv"></canvas></div>
  </section>`);
  const wrap = $('[data-el="wrap"]', root), cv = $('[data-el="cv"]', root), ctx = cv.getContext('2d');
  let s = 30, ox = 0, oy = 0, dpr = 1, boardFill = 'rgba(255,255,255,.35)';

  function layout() {
    dpr = window.devicePixelRatio || 1;
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    if (!cw || !ch) return;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    s = Math.min(cw / W, ch / H);
    ox = (cw - W * s) / 2; oy = (ch - H * s) / 2;
    boardFill = getComputedStyle(root).getPropertyValue('--rp-board').trim() || boardFill;
  }
  const toWorld = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left - ox) / s, y: (e.clientY - r.top - oy) / s }; };

  function hud() { $$('img', $('[data-el="hud"]', root)).forEach((im, k) => im.classList.toggle('on', k < (w ? w.got : 0))); }

  function start() {
    w = makeWorld(L, true);
    ended = false; chomp = 0; trail = []; parts = []; acc = 0;
    hud();
  }

  function burst(x, y, col, n = 10, sp = 5) {
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + Math.random() * 0.4, v = sp * (0.6 + Math.random() * 0.6); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6, col, r: 0.09 + Math.random() * 0.07 }); }
  }

  // ---------- input: swipe to cut, tap a bubble to pop it ----------
  cv.addEventListener('pointerdown', (e) => {
    if (!w || ended) return;
    cv.setPointerCapture?.(e.pointerId);
    const p = toWorld(e); pointer = p;
    trail.push({ x: p.x, y: p.y, t: clock, start: true });
    const hb = heldBubble(w);
    if (hb >= 0 && Math.hypot(p.x - w.candy.x, p.y - w.candy.y) < 1.3) { act(w, 'pop'); burst(w.candy.x, w.candy.y, '#bfefff', 12, 4); sfx.erase(); buzz(12); }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!pointer || !w || ended) return;
    const p = toWorld(e);
    w.ropes.forEach((r, i) => {
      if (r.cut) return;
      const line = [{ x: r.ax, y: r.ay }, ...(r.pts || []), w.candy];
      for (let k = 0; k < line.length - 1; k++) {
        if (crosses(pointer, p, line[k], line[k + 1])) { act(w, i, k); sfx.cross(); buzz(10); break; }
      }
    });
    trail.push({ x: p.x, y: p.y, t: clock });
    pointer = p;
  });
  const up = () => { pointer = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

  // ---------- endings ----------
  async function win() {
    ended = true; chomp = 0.001;
    sfx.place();
    const got = w.got, prev = rb.stars[idx] || 0;
    rb.stars[idx] = Math.max(prev, got);
    if (idx >= rb.level) rb.level = idx + 1;
    save(true);
    await new Promise((r) => setTimeout(r, 700));
    if (!alive) return;
    sfx.win(); if (got === 3) confetti();
    const lastLevel = idx + 1 >= LEVELS.length;
    const v = await dialog({
      hero: 'img/rope/star.png', dismissible: false,
      title: lastLevel ? 'Every sweet delivered' : got === 3 ? 'Perfect' : 'Yum',
      text: lastLevel ? `You fed the frog in all ${LEVELS.length} levels and collected ${totalStars()} stars.` : `Level ${idx + 1}: ${got} of 3 stars${got < 3 ? '. Try again for all three' : ''}`,
      buttons: lastLevel ? [{ label: 'Back', value: 'back' }, { label: 'Play again', value: 'again', cls: 'ghost' }]
        : [{ label: 'Next level', value: 'next' }, { label: 'Play again', value: 'again', cls: 'secondary' }, { label: 'Back', value: 'back', cls: 'ghost' }],
    });
    if (!alive) return;
    if (v === 'next') app.replace('ropegame', { idx: idx + 1 });
    else if (v === 'again') start();
    else app.back();
  }
  function lose() {
    ended = true;
    sfx.error();
    if (w.why === 'spikes') burst(w.candy.x, w.candy.y, '#e5383b', 14, 5);
    toast(w.why === 'spikes' ? 'Ouch, the spikes got it. Try again' : 'The sweet got away. Try again', 1600);
    setTimeout(() => { if (alive && ended && w && w.state === 'lost') start(); }, 1100);
  }

  // ---------- drawing ----------
  const X = (x) => ox + x * s, Y = (y) => oy + y * s;
  function pin(x, y) {
    ctx.beginPath(); ctx.arc(X(x), Y(y), 0.22 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#d9dee6'; ctx.fill(); ctx.lineWidth = 0.07 * s; ctx.strokeStyle = '#5b6170'; ctx.stroke();
    ctx.beginPath(); ctx.arc(X(x), Y(y), 0.07 * s, 0, Math.PI * 2); ctx.fillStyle = '#5b6170'; ctx.fill();
  }
  function ropeLine(pts) {
    if (pts.length < 2) return;
    ctx.beginPath(); ctx.moveTo(X(pts[0].x), Y(pts[0].y));
    for (let k = 1; k < pts.length; k++) ctx.lineTo(X(pts[k].x), Y(pts[k].y));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = 0.15 * s; ctx.strokeStyle = '#7a4c26'; ctx.setLineDash([]); ctx.stroke();
    ctx.lineWidth = 0.08 * s; ctx.strokeStyle = '#d9a066'; ctx.setLineDash([0.16 * s, 0.14 * s]); ctx.stroke();
    ctx.setLineDash([]);
  }
  function spikes(sp) {
    const horiz = sp.dir === 'up' || sp.dir === 'down';
    const len = horiz ? sp.w : sp.h, thick = horiz ? sp.h : sp.w;
    ctx.save();
    ctx.translate(X(sp.x + sp.w / 2), Y(sp.y + sp.h / 2));
    ctx.rotate({ up: 0, down: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 }[sp.dir] || 0);
    const t = thick * 1.25, n = Math.max(1, Math.round(len / (t * 95 / 53))), tw = len / n;
    ctx.fillStyle = '#5b6170';
    ctx.fillRect((-len / 2) * s, (thick / 2 - 0.14) * s, len * s, 0.14 * s);
    // the spikes are pale blue, so darken them on the light background
    if (document.documentElement.dataset.theme !== 'dark') ctx.filter = 'brightness(.6) saturate(1.3)';
    if (ready(IMG.spikes)) for (let k = 0; k < n; k++) ctx.drawImage(IMG.spikes, (-len / 2 + k * tw) * s, (thick / 2 - t) * s, tw * s, t * s);
    ctx.filter = 'none';
    ctx.restore();
  }
  function frog(dt) {
    const f = w.frog, c = w.candy, near = ended && w.state === 'won' ? 1 : Math.max(0, 1 - (Math.hypot(c.x - f.x, c.y - f.y) - 1) / 3);
    const sz = 2.2, im = IMG.frog;
    let sx = 1 + Math.sin(clock * 3) * 0.015, sy = 1 - Math.sin(clock * 3) * 0.015;
    if (chomp) { chomp += dt; const k = Math.min(1, chomp / 0.5); sx = 1 + Math.sin(k * Math.PI * 3) * 0.12 * (1 - k); sy = 1 - Math.sin(k * Math.PI * 3) * 0.14 * (1 - k); }
    else { sy += near * 0.06; sx -= near * 0.03; }
    // lily pad under the frog
    ctx.beginPath(); ctx.ellipse(X(f.x), Y(f.y + 1.05), 1.35 * s, 0.38 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#4caf50'; ctx.fill(); ctx.lineWidth = 0.06 * s; ctx.strokeStyle = '#2e7d32'; ctx.stroke();
    ctx.save();
    ctx.translate(X(f.x), Y(f.y + 1.0)); ctx.scale(sx, sy);
    const hgt = sz * 144 / 130;
    if (ready(im)) ctx.drawImage(im, -sz / 2 * s, -hgt * s, sz * s, hgt * s);
    // open mouth as the sweet comes close
    if (!chomp && near > 0.05) {
      ctx.beginPath(); ctx.ellipse(0, -hgt * 0.56 * s, 0.42 * near * s, 0.26 * near * s, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#8b1e2d'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, -hgt * 0.5 * s, 0.22 * near * s, 0.1 * near * s, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#e66a7a'; ctx.fill();
    }
    ctx.restore();
  }
  function bubble(x, y, z, alpha) {
    ctx.beginPath(); ctx.arc(X(x), Y(y), z / 2 * 0.92 * s, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(170,225,255,.28)'; ctx.fill();
    ctx.lineWidth = 0.06 * s; ctx.strokeStyle = 'rgba(70,160,225,.55)'; ctx.stroke();
    if (ready(IMG.bubble)) { ctx.globalAlpha = alpha; ctx.drawImage(IMG.bubble, X(x - z / 2), Y(y - z / 2), z * s, z * s); ctx.globalAlpha = 1; }
    ctx.beginPath(); ctx.ellipse(X(x - z * 0.2), Y(y - z * 0.22), 0.16 * s, 0.09 * s, -0.7, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fill();
  }
  function draw(dt) {
    const cw = cv.width / dpr, ch = cv.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    // board panel
    ctx.fillStyle = boardFill;
    const r = 0.5 * s;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(ox, oy, W * s, H * s, r) : ctx.rect(ox, oy, W * s, H * s); ctx.fill();
    if (!w) return;
    // hooks
    for (const k of w.hooks) {
      if (k.used) { pin(k.x, k.y); continue; }
      ctx.beginPath(); ctx.arc(X(k.x), Y(k.y), k.r * s, 0, Math.PI * 2);
      ctx.setLineDash([0.18 * s, 0.16 * s]); ctx.lineWidth = 0.06 * s; ctx.strokeStyle = 'rgba(122,76,38,.55)'; ctx.stroke(); ctx.setLineDash([]);
      pin(k.x, k.y);
    }
    for (const sp of w.spikes) spikes(sp);
    // stars
    for (const st of w.stars) if (!st.got && ready(IMG.star)) {
      const b = Math.sin(clock * 2.4 + st.x) * 0.08, z = 1.0;
      ctx.drawImage(IMG.star, X(st.x - z / 2), Y(st.y - z / 2 + b), z * s, z * s);
    }
    frog(dt);
    // ropes and anchors
    for (const l of w.loose) ropeLine(l.fix === 'anchor' ? [{ x: l.ax, y: l.ay }, ...l.pts] : [...l.pts, w.candy]);
    for (const rp of w.ropes) if (!rp.cut) ropeLine([{ x: rp.ax, y: rp.ay }, ...rp.pts, w.candy]);
    for (const rp of w.ropes) if (!w.hooks.some((k) => k.x === rp.ax && k.y === rp.ay)) pin(rp.ax, rp.ay);
    // idle bubbles
    for (const b of w.bubbles) if (!b.held && !b.gone) bubble(b.x, b.y, 1.6 + Math.sin(clock * 3 + b.x) * 0.05, 0.9);
    // the sweet
    const c = w.candy;
    if (!(ended && w.state === 'won')) {
      ctx.save(); ctx.translate(X(c.x), Y(c.y)); ctx.rotate(w.spin);
      const z = CR * 2.3;
      if (ready(IMG.candy)) ctx.drawImage(IMG.candy, -z / 2 * s, -z / 2 * s, z * s, z * s);
      ctx.restore();
      if (heldBubble(w) >= 0) bubble(c.x, c.y, 1.55 + Math.sin(clock * 5) * 0.06, 0.85);
    }
    // particles
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, p.life / 0.6);
      ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), p.r * s, 0, Math.PI * 2); ctx.fillStyle = p.col; ctx.fill();
    }
    ctx.globalAlpha = 1;
    // swipe trail
    trail = trail.filter((t) => clock - t.t < 0.22);
    if (trail.length > 1) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let k = 1; k < trail.length; k++) {
        if (trail[k].start) continue;
        const a = 1 - (clock - trail[k].t) / 0.22;
        ctx.beginPath(); ctx.moveTo(X(trail[k - 1].x), Y(trail[k - 1].y)); ctx.lineTo(X(trail[k].x), Y(trail[k].y));
        ctx.lineWidth = 0.14 * s * a + 1; ctx.strokeStyle = `rgba(255,255,255,${(a * 0.9).toFixed(2)})`; ctx.stroke();
      }
    }
  }

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    clock += dt;
    if (w && w.state === 'play') {
      acc += dt;
      while (acc >= DT && w.state === 'play') {
        step(w); acc -= DT;
        if (w.event) {
          if (w.event === 'star') { const st = w.stars.filter((x) => x.got).pop(); burst(st.x, st.y, '#ffd34d', 12, 5); sfx.note(); sfx.unit(); hud(); }
          else if (w.event === 'bubble') sfx.place();
          else if (w.event === 'hook') sfx.tap();
          w.event = null;
        }
      }
      if (w.state === 'won') win();
      else if (w.state === 'lost') lose();
    }
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 8 * dt; p.life -= dt; }
    parts = parts.filter((p) => p.life > 0);
    draw(dt);
  }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') ropeHelp();
    else if (a === 'restart') { sfx.tap(); start(); }
  });

  const ro = new ResizeObserver(() => layout());
  ro.observe(wrap);
  layout(); start();
  raf = requestAnimationFrame(frame);
  if (!rb.seenHelp) { rb.seenHelp = true; save(); setTimeout(ropeHelp, 350); }
  else if (idx === 0) setTimeout(() => toast('Swipe across the rope to cut it'), 500);
  return {
    root,
    onHide() { cancelAnimationFrame(raf); },
    onShow() { last = 0; raf = requestAnimationFrame(frame); },
    destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); },
  };
}
