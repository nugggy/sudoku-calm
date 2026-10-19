// Shared plumbing for the real-time Play Together games (Light Cycles, Tug of War, Quick Draw,
// Sumo Bumpers, Penalty Shootout): a canvas stage, a fixed 60 Hz loop, a host-authoritative
// session (snapshots, events, actions), clock sync with the host, and touch input that knows
// which player a finger belongs to.
//
// Network model: the host runs the game. The guest sends its input (and one-off actions such as
// a turn or a shot) and draws what the host's snapshots say, predicting its own control locally.
// On one phone ("local") the same code runs with both players' input coming from the two halves
// of the screen, player 0 at the bottom and player 1 at the top.

export const STEP = 1000 / 60;
export const COL = ['#ff8a3d', '#2fb8ff'];       // player 0 and player 1, the same on both phones
export const COL_D = ['#c25412', '#0f7fbf'];

// ---------- message routing ----------
// ctx.onMsg takes one listener per game; route by message type and ignore everything after destroy.
function router(ctx, alive) {
  const hs = {};
  ctx.onMsg?.((m) => { if (!alive() || !m || typeof m !== 'object') return; hs[m.t]?.(m); });
  return { on: (t, fn) => { hs[t] = fn; } };
}

// ---------- stage ----------
// Builds the screen: a score bar, a canvas that fills the rest, and a banner for big messages.
export function stage(ctx, cls) {
  ctx.root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = `rtd ${cls}`;
  wrap.innerHTML = `<div class="rtd-bar"><div class="rtd-side rtd-top"><i></i><span></span><b></b></div><div class="rtd-mid"></div><div class="rtd-side rtd-bot"><b></b><span></span><i></i></div></div>
    <div class="rtd-stage"><canvas></canvas><div class="rtd-banner"><b></b><small></small></div></div>`;
  ctx.root.appendChild(wrap);
  const cv = wrap.querySelector('canvas'), st = wrap.querySelector('.rtd-stage');
  const g = cv.getContext('2d');
  const view = { W: 300, H: 500, dpr: 1 };
  function fit() {
    const r = st.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
    view.W = Math.max(50, r.width); view.H = Math.max(50, r.height); view.dpr = dpr;
    cv.width = Math.round(view.W * dpr); cv.height = Math.round(view.H * dpr);
    cv.style.width = view.W + 'px'; cv.style.height = view.H + 'px';
  }
  const ro = new ResizeObserver(fit); ro.observe(st); fit();
  // the player shown at the top of this phone goes on the left of the bar
  const local = !!ctx.local, me = local ? 0 : ctx.me, top = 1 - me;
  const names = ctx.names || ['Player 1', 'Player 2'];
  const sTop = wrap.querySelector('.rtd-top'), sBot = wrap.querySelector('.rtd-bot');
  sTop.querySelector('span').textContent = names[top]; sTop.querySelector('i').style.background = COL[top];
  sBot.querySelector('span').textContent = local ? names[me] : `${names[me]} (you)`; sBot.querySelector('i').style.background = COL[me];
  let bannerT = 0;
  const ban = wrap.querySelector('.rtd-banner');
  return {
    wrap, cv, g, view, st,
    score(sc, mid = '') {
      sTop.querySelector('b').textContent = sc[top]; sBot.querySelector('b').textContent = sc[me];
      wrap.querySelector('.rtd-mid').textContent = mid;
    },
    banner(title, sub = '', ms = 1400) {
      ban.querySelector('b').textContent = title; ban.querySelector('small').textContent = sub;
      ban.classList.add('show'); clearTimeout(bannerT);
      if (ms) bannerT = setTimeout(() => ban.classList.remove('show'), ms);
    },
    hideBanner() { ban.classList.remove('show'); },
    // start drawing a frame in CSS pixels; flip turns the board round so this phone's player is at the bottom
    begin(flip = false) {
      g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      g.clearRect(0, 0, view.W, view.H);
      if (flip) { g.translate(view.W, view.H); g.rotate(Math.PI); }
    },
    plain() { g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); },
    destroy() { ro.disconnect(); clearTimeout(bannerT); },
  };
}

// ---------- fixed-step loop ----------
export function loop(tick, draw) {
  let last = performance.now(), acc = 0, raf = 0, dead = false;
  const f = (now) => {
    if (dead) return;
    acc += Math.min(250, now - last); last = now;
    while (acc >= STEP) { tick(); acc -= STEP; }
    draw(acc / STEP);
    raf = requestAnimationFrame(f);
  };
  raf = requestAnimationFrame(f);
  // keep the simulation going when frames are throttled (for example two phones side by side in a test page)
  const iv = setInterval(() => { if (!dead && performance.now() - last > 120) f(performance.now()); }, 100);
  return () => { dead = true; cancelAnimationFrame(raf); clearInterval(iv); };
}

// ---------- session ----------
// spec (game rules, host side): init() -> state; input() -> default input; step(s, inputs, ev);
//   action(s, p, a, ev) for one-off actions; snap(s) -> data for the guest; result(s) -> null | {winner, text}
// spec (guest side): apply(gs, data, now) -> guest state (gs starts as undefined)
// hooks: event(e) for sounds and banners (both phones), draw(state, isHostState), frame() every tick
export function session(ctx, spec, hooks = {}) {
  let dead = false;
  const alive = () => !dead && (ctx.alive ? ctx.alive() : true);
  const local = !!ctx.local, host = local || !!ctx.isHost, me = local ? 0 : ctx.me, other = 1 - me;
  const R = router(ctx, alive);
  const s = host ? spec.init() : null;
  let gs;
  const inputs = [spec.input(), spec.input()];
  const acts = [];
  let pending = [], tick = 0, ended = false, sentIn = '', inAt = 0;
  // clock: guest estimates hostTime = performance.now() + offset from the fastest ping round trip
  let offset = 0, bestRtt = Infinity, pings = 0;
  const hostNow = () => performance.now() + (host ? 0 : offset);

  const ev = (e) => { if (!local) pending.push(e); hooks.event?.(e); };
  function finish(x) {
    if (ended) return; ended = true;
    const res = { winner: x.winner ?? null, text: x.text || (x.sc ? winText(ctx.names || ['Player 1', 'Player 2'], x.sc, x.winner ?? null) : '') };
    setTimeout(() => { if (alive()) ctx.end?.(res); }, 1700);
  }

  if (!local) {
    if (host) {
      R.on('in', (m) => { inputs[other] = m.i; });
      R.on('act', (m) => { acts.push([other, m.a]); });
      R.on('ping', (m) => ctx.send({ t: 'pong', c: m.c, h: performance.now() }));
    } else {
      R.on('s', (m) => {
        gs = spec.apply(gs, m.d, performance.now());
        (m.e || []).forEach((e) => hooks.event?.(e));
        if (m.x) finish(m.x);
      });
      R.on('pong', (m) => {
        const now = performance.now(), rtt = now - m.c;
        if (rtt <= bestRtt * 1.2 || pings < 3) { if (rtt < bestRtt) bestRtt = rtt; offset = m.h + rtt / 2 - now; }
      });
    }
  }
  const ping = () => { if (!host && alive()) { pings++; ctx.send({ t: 'ping', c: performance.now() }); } };
  if (!host) { [0, 120, 260, 420, 640].forEach((d) => setTimeout(ping, d)); }
  const pingIv = !host ? setInterval(ping, 2500) : 0;

  const stop = loop(() => {
    if (!alive()) return;
    tick++;
    if (host) {
      while (acts.length) { const [p, a] = acts.shift(); spec.action?.(s, p, a, ev); }
      spec.step(s, inputs, ev, hostNow());
      const x = spec.result(s);
      if (!local && tick % 2 === 0) { ctx.send({ t: 's', d: spec.snap(s), e: pending, x: x || undefined }); pending = []; }
      if (x) finish(x);
    } else if (tick % 3 === 0) {
      // resend the input now and then even if unchanged, in case the host started late
      const j = JSON.stringify(inputs[me]);
      if (j !== sentIn || tick - inAt > 30) { sentIn = j; inAt = tick; ctx.send({ t: 'in', i: inputs[me] }); }
    }
    hooks.frame?.(tick);
  }, (alpha) => { if (alive()) hooks.draw?.(host ? s : gs, host, alpha); });

  return {
    host, local, me, other, hostNow,
    get state() { return host ? s : gs; },
    // p is the player whose control this is (always me when playing on two phones)
    setInput(p, obj) {
      inputs[p] = obj;
      if (!host) {
        const j = JSON.stringify(obj);
        if (j !== sentIn) { sentIn = j; inAt = tick; ctx.send({ t: 'in', i: obj }); }
      }
    },
    input: (p) => inputs[p],
    act(p, a) { if (host) acts.push([p, a]); else ctx.send({ t: 'act', a }); },
    destroy() { dead = true; stop(); clearInterval(pingIv); },
  };
}

// ---------- touch ----------
// Calls down/move/up with (player, x, y, id, raw) in board coordinates: on a flipped phone the
// point is turned round so it matches what the board drawing uses. In local mode the top half of
// the screen belongs to player 1 and the bottom half to player 0.
export function touches(el, ctx, view, flip, h) {
  const local = !!ctx.local, me = local ? 0 : ctx.me;
  const owner = new Map();
  const pt = (e) => {
    const r = el.getBoundingClientRect();
    let x = e.clientX - r.left, y = e.clientY - r.top;
    const raw = { x, y };
    if (flip()) { x = view.W - x; y = view.H - y; }
    return { x, y, raw };
  };
  const onDown = (e) => {
    e.preventDefault();
    const p = pt(e);
    const who = local ? (p.raw.y < view.H / 2 ? 1 : 0) : me;
    owner.set(e.pointerId, who);
    try { el.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    h.down?.(who, p.x, p.y, e.pointerId, p.raw);
  };
  const onMove = (e) => { if (!owner.has(e.pointerId)) return; const p = pt(e); h.move?.(owner.get(e.pointerId), p.x, p.y, e.pointerId, p.raw); };
  const onUp = (e) => { if (!owner.has(e.pointerId)) return; const p = pt(e); const who = owner.get(e.pointerId); owner.delete(e.pointerId); h.up?.(who, p.x, p.y, e.pointerId, p.raw); };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.style.touchAction = 'none';
  return () => { el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp); };
}

// Keyboard for desktop testing: arrows (and space) for player 0 or this phone's player, WASD (and Q) for player 1 on one phone.
export function keys(ctx, h) {
  const local = !!ctx.local, me = local ? 0 : ctx.me;
  const map = { ArrowUp: [me, 'up'], ArrowDown: [me, 'down'], ArrowLeft: [me, 'left'], ArrowRight: [me, 'right'], ' ': [me, 'fire'], Enter: [me, 'fire'] };
  if (local) Object.assign(map, { w: [1, 'up'], s: [1, 'down'], a: [1, 'left'], d: [1, 'right'], q: [1, 'fire'] });
  const kd = (e) => { const k = map[e.key]; if (!k || e.repeat) return; e.preventDefault(); h.down?.(k[0], k[1]); };
  const ku = (e) => { const k = map[e.key]; if (!k) return; h.up?.(k[0], k[1]); };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
}

// ---------- small helpers ----------
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const play = (ctx, k) => { try { ctx.sfx?.[k]?.(); } catch { /* sound is optional */ } };
export const vib = (ctx, p) => { try { ctx.buzz?.(p); } catch { /* vibration is optional */ } };
export function img(src) { const i = new Image(); i.src = src; return i; }
export const ready = (i) => i && i.complete && i.naturalWidth > 0;
export function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
export function winText(names, sc, w) { return w == null ? `A draw, ${sc[0]} all` : `${names[w]} wins ${sc[w]} to ${sc[1 - w]}`; }
