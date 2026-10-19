// Shared pieces for the real-time Play Together games: a sized canvas, a host-authoritative
// sync loop (fixed 60 Hz on the host, snapshots ~25 Hz to the guest, interpolation on the guest),
// pointer handling with a mirrored view for player 1, and small synthesised sounds.

export const STEP = 1 / 60;
export const SNAP_MS = 40;      // host sends a snapshot every 40 ms (25 Hz)
export const DELAY_MS = 90;     // guest renders this far behind the newest snapshot

// ---------- Canvas ----------
// Fills `host` with a canvas and keeps it sized to the element at device resolution.
export function makeCanvas(host, cls = '') {
  const cv = document.createElement('canvas');
  cv.className = 'rt-canvas ' + cls;
  host.appendChild(cv);
  const c2 = cv.getContext('2d');
  const view = { w: 1, h: 1, dpr: 1 };
  const fit = () => {
    const r = host.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
    view.w = Math.max(1, r.width); view.h = Math.max(1, r.height); view.dpr = dpr;
    cv.width = Math.round(view.w * dpr); cv.height = Math.round(view.h * dpr);
    cv.style.width = view.w + 'px'; cv.style.height = view.h + 'px';
  };
  fit();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  ro?.observe(host);
  return { cv, c2, view, fit, destroy() { ro?.disconnect(); cv.remove(); } };
}

// Maps a world box (W x H, player 0 at the bottom) into the canvas, rotated 180 degrees for player 1.
export function worldTransform(view, W, H, flip, pad = 8) {
  const s = Math.min((view.w - pad * 2) / W, (view.h - pad * 2) / H);
  const ox = (view.w - W * s) / 2, oy = (view.h - H * s) / 2;
  return {
    s, ox, oy, flip,
    apply(c2, dpr) {
      c2.setTransform(dpr, 0, 0, dpr, 0, 0);
      c2.translate(ox, oy); c2.scale(s, s);
      if (flip) { c2.translate(W, H); c2.rotate(Math.PI); }
    },
    // screen (css px relative to canvas) -> world
    toWorld(px, py) {
      let x = (px - ox) / s, y = (py - oy) / s;
      if (flip) { x = W - x; y = H - y; }
      return [x, y];
    },
  };
}

// ---------- Pointers ----------
// Tracks every active pointer on `el`. `assign(xCss, yCss)` picks the player a new pointer controls
// (local mode splits the screen); `onMove(player, xCss, yCss, kind)` gets every change.
export function trackPointers(el, assign, onMove) {
  const owners = new Map();
  const pos = (e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e) => {
    const [x, y] = pos(e); const p = assign(x, y);
    if (p === null || p === undefined) return;
    owners.set(e.pointerId, p);
    try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    onMove(p, x, y, 'down'); e.preventDefault();
  };
  const move = (e) => { const p = owners.get(e.pointerId); if (p === undefined) return; const [x, y] = pos(e); onMove(p, x, y, 'move'); e.preventDefault(); };
  const up = (e) => { const p = owners.get(e.pointerId); if (p === undefined) return; owners.delete(e.pointerId); const [x, y] = pos(e); onMove(p, x, y, 'up'); };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.style.touchAction = 'none';
  return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
}

// ---------- Sync loop ----------
// opts: {
//   state,                               the simulation state (host and local mode)
//   step(state, inputs, events),         advance one fixed step; push sound/effect events into `events`
//   pack(state) -> {n: [numbers to interpolate], q: anything discrete},
//   input(),                             this phone's current input (any JSON); in local mode an array of two
//   render(view, alpha),                 view = state on host/local, or {n, q} interpolated on the guest
//   onEvent(ev),                         play an effect (both phones)
//   over(state) -> null | {winner, text} host decides the end of the game
// }
export function syncLoop(ctx, opts, env = {}) {
  const clock = env.now || (() => performance.now());
  const raf_ = env.raf || ((f) => requestAnimationFrame(f)), caf_ = env.caf || ((h) => cancelAnimationFrame(h));
  const later = env.later || ((f, ms) => setTimeout(f, ms));
  const host = ctx.local || ctx.isHost;
  const inputs = [null, null];
  const snaps = [];
  let acc = 0, last = clock(), lastSnap = 0, raf = 0, stopped = false, ended = false, seq = 0;
  let pendingEvents = [], lastSent = '', lastSentAt = 0;

  const unsub = ctx.onMsg?.((m) => {
    if (!m || stopped) return;
    if (host && m.t === 'i') inputs[ctx.me === 0 ? 1 : 0] = m.d;
    else if (!host && m.t === 's') {
      if (snaps.length && m.k <= snaps[snaps.length - 1].k) return;
      snaps.push({ k: m.k, at: clock(), n: m.n, q: m.q });
      while (snaps.length > 30) snaps.shift();
      (m.e || []).forEach((ev) => opts.onEvent?.(ev));
    } else if (!host && m.t === 'end' && !ended) { ended = true; later(() => ctx.end({ winner: m.w, text: m.x }), 900); }
  });

  function hostTick(now) {
    let dt = Math.min(0.25, (now - last) / 1000); last = now; acc += dt;
    if (ctx.local) { const both = opts.input(); inputs[0] = both[0]; inputs[1] = both[1]; }
    else inputs[ctx.me] = opts.input();
    let steps = 0;
    while (acc >= STEP && steps < 15) {
      const evs = [];
      opts.step(opts.state, inputs, evs);
      evs.forEach((ev) => { opts.onEvent?.(ev); pendingEvents.push(ev); });
      acc -= STEP; steps++;
      if (!ended) {
        const o = opts.over?.(opts.state);
        if (o) {
          ended = true;
          if (!ctx.local) { sendSnap(now); ctx.send({ t: 'end', w: o.winner, x: o.text }); }
          later(() => ctx.end(o), 900);
        }
      }
    }
    if (!ctx.local && now - lastSnap >= SNAP_MS) sendSnap(now);
    opts.render(opts.state, acc / STEP, true);
  }
  function sendSnap(now) {
    lastSnap = now;
    const p = opts.pack(opts.state);
    ctx.send({ t: 's', k: ++seq, n: p.n, q: p.q, e: pendingEvents.length ? pendingEvents : undefined });
    pendingEvents = [];
  }
  function guestTick(now) {
    const inp = opts.input(), js = JSON.stringify(inp);
    if (js !== lastSent || now - lastSentAt > 250) { ctx.send({ t: 'i', d: inp }); lastSent = js; lastSentAt = now; }
    if (!snaps.length) { opts.render(null, 0, false); return; }
    const t = now - DELAY_MS;
    let a = snaps[0], b = snaps[0];
    for (let i = snaps.length - 1; i >= 0; i--) { if (snaps[i].at <= t) { a = snaps[i]; b = snaps[i + 1] || snaps[i]; break; } }
    const f = b === a ? 0 : Math.max(0, Math.min(1, (t - a.at) / (b.at - a.at)));
    const n = a.n.map((v, i) => (b.n[i] === undefined || Math.abs(b.n[i] - v) > 0.5 ? (f < 0.5 ? v : b.n[i] ?? v) : v + (b.n[i] - v) * f));
    opts.render({ n, q: f < 0.5 ? a.q : b.q }, 0, false);
  }
  function frame(now) {
    if (stopped || (ctx.alive && !ctx.alive())) return;
    raf = raf_(frame);
    if (host) hostTick(now); else guestTick(now);
  }
  raf = raf_(frame);
  return {
    inputs,
    stop() { stopped = true; caf_(raf); if (typeof unsub === 'function') unsub(); },
    get ended() { return ended; },
  };
}

// ---------- Sound ----------
let actx = null;
function ac() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
const soundOn = () => { try { return JSON.parse(localStorage.getItem('sudokucalm.v1') || '{}')?.settings?.sound !== false; } catch { return true; } };
export function tone(freq, dur, { type = 'sine', vol = 0.1, delay = 0, slideTo = null } = {}) {
  if (!soundOn()) return;
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}
export function noise(dur, { vol = 0.2, delay = 0, freq = 900 } = {}) {
  if (!soundOn()) return;
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination); src.start(t);
}

// A short screen shake: call kick(amount) and read offset() each frame.
export function shaker() {
  let mag = 0, t0 = 0;
  return {
    kick(m) { mag = Math.max(mag * this.left(), m); t0 = performance.now(); },
    left() { return Math.max(0, 1 - (performance.now() - t0) / 260); },
    offset() { const k = mag * this.left(); return k < 0.2 ? [0, 0] : [(Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * 2 * k]; },
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const r3 = (v) => Math.round(v * 1000) / 1000;

// Score header used by the games: names with scores, the local player's name underlined.
export function scoreBar(names, me, cls = '') {
  const el = document.createElement('div');
  el.className = 'rt-score ' + cls;
  el.innerHTML = `<div class="rt-side p1"><b data-s="1">0</b><span></span></div><div class="rt-mid"></div><div class="rt-side p0"><span></span><b data-s="0">0</b></div>`;
  el.querySelector('.p0 span').textContent = names[0] || 'Player 1';
  el.querySelector('.p1 span').textContent = names[1] || 'Player 2';
  if (me === 0) el.querySelector('.p0').classList.add('me'); else if (me === 1) { el.querySelector('.p1').classList.add('me'); el.classList.add('swap'); }
  return {
    el,
    set(a, b) { const s0 = el.querySelector('[data-s="0"]'), s1 = el.querySelector('[data-s="1"]'); if (s0.textContent !== String(a)) { s0.textContent = a; pop(s0); } if (s1.textContent !== String(b)) { s1.textContent = b; pop(s1); } },
    mid(t) { el.querySelector('.rt-mid').textContent = t; },
  };
}
function pop(n) { n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop'); }
