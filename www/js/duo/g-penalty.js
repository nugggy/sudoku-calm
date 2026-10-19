// Penalty Shootout: take turns to shoot and keep goal. The shooter swipes up to kick (the swipe sets
// the direction, height, pace and curve); the keeper drags along the line and flicks to dive.
// Five kicks each, then sudden death.
import { stage, session, touches, keys, COL, COL_D, play, vib, clamp, lerp, img, ready } from './rtd-kit.js';

export const BAR = 0.667, BALL_R = 0.07, KEEP_R = 0.13, KEEP_SPEED = 2.6, REACH = 0.62, DIVE_TICKS = 16, ARM = 0.26;
const DT = 1 / 60;

// ---------- rules ----------
// ball position on the goal plane at progress u (0 at the spot, 1 on the line)
export function ballAt(shot, u) {
  return { x: shot.ex * u + shot.c * 0.45 * Math.sin(Math.PI * u), h: shot.eh * u + 0.15 * shot.eh * Math.sin(Math.PI * u) };
}
// a swipe on the shooter's screen (start a, end b, its widest sideways bend, its duration) turned into a shot
export function shotFromSwipe(a, b, bend, ms, W, H) {
  const up = (a.y - b.y) / H;
  if (up < 0.06) return null;
  const ex = clamp((b.x - a.x) / (W * 0.32), -1.8, 1.8);
  const eh = clamp((up - 0.12) / 0.4, 0, 1.15) * 0.9;
  const speed = (a.y - b.y) / Math.max(40, ms);              // px per ms
  const T = clamp(1.25 - speed * 0.35, 0.55, 1.2);
  const c = clamp(bend / (W * 0.12), -1, 1);
  return { ex: +ex.toFixed(3), eh: +eh.toFixed(3), T: +T.toFixed(3), c: +c.toFixed(3) };
}
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, l = vx * vx + vy * vy;
  const t = l ? clamp(((px - ax) * vx + (py - ay) * vy) / l, 0, 1) : 0;
  return Math.hypot(px - ax - vx * t, py - ay - vy * t);
}
// the keeper as a capsule (two end points and a radius) on the goal plane
export function keeperShape(kx, dive) {
  if (!dive) return [kx, 0.08, kx, 0.5];
  const r = REACH * Math.min(1, dive.p);
  return [kx, 0.3, kx + dive.vx * r, 0.3 + dive.vy * r];
}
// what happens when the ball reaches the line: 'goal', 'save', 'post', 'wide' or 'over'
export function judgeShot(shot, kx, dive) {
  const { x, h } = ballAt(shot, 1), ax = Math.abs(x);
  if (h > BAR + BALL_R) return 'over';
  if (ax > 1 + BALL_R) return 'wide';
  if (ax > 1 - BALL_R || h > BAR - BALL_R) return 'post';
  const [x0, y0, x1, y1] = keeperShape(kx, dive);
  if (segDist(x, h, x0, y0, x1, y1) <= KEEP_R + BALL_R) return 'save';
  // a standing keeper also has arms spread out to the sides
  if (!dive && segDist(x, h, kx - ARM, 0.44, kx + ARM, 0.44) <= 0.06 + BALL_R) return 'save';
  return 'goal';
}
// winner after the kicks so far, or undefined while the shootout goes on
export function penWinner(g, t) {
  if (t[0] <= 5 && t[1] <= 5) {
    if (g[0] > g[1] + (5 - t[1])) return 0;
    if (g[1] > g[0] + (5 - t[0])) return 1;
    if (!(t[0] === 5 && t[1] === 5)) return undefined;
  }
  if (t[0] === t[1] && g[0] !== g[1]) return g[0] > g[1] ? 0 : 1;
  return undefined;
}
export function penInit(first = 0) {
  return { first, k: 0, goals: [0, 0], taken: [0, 0], hist: [[], []], ph: 'aim', tm: 0, kx: 0, dive: null, shot: null, t: 0, res: '', w: undefined, aimT: 0 };
}
export const shooterOf = (s) => (s.first + s.k) % 2;
export function penShoot(s, p, a) {
  if (s.ph !== 'aim' || p !== shooterOf(s) || s.aimT < 30) return false;
  s.shot = { ex: +a.ex, eh: +a.eh, T: clamp(+a.T, 0.55, 1.2), c: clamp(+a.c, -1, 1) }; s.t = 0; s.ph = 'fly';
  return true;
}
export function penDive(s, p, a) {
  if ((s.ph !== 'aim' && s.ph !== 'fly') || p === shooterOf(s) || s.dive) return false;
  const l = Math.hypot(a.x, a.y) || 1;
  s.dive = { vx: a.x / l, vy: Math.max(-0.25, a.y / l), p: 0 };
  return true;
}
// one tick of the keeper and ball; returns the result when the ball reaches the line
export function penTick(s, target) {
  if (s.dive) s.dive.p = Math.min(1, s.dive.p + 1 / DIVE_TICKS);
  else if (typeof target === 'number') {
    const d = clamp(target, -1, 1) - s.kx, m = KEEP_SPEED * DT;
    s.kx += clamp(d, -m, m);
  }
  if (s.ph === 'aim') s.aimT++;
  if (s.ph !== 'fly') return null;
  s.t += DT;
  if (s.t < s.shot.T) return null;
  return judgeShot(s.shot, s.kx, s.dive);
}

export const penaltySpec = (first) => ({
  init: () => penInit(first),
  input: () => ({ x: 0 }),
  action(s, p, a, ev) {
    if (a.k === 'shot' && penShoot(s, p, a)) ev({ k: 'kick', shot: s.shot, n: s.k });
    if (a.k === 'dive' && penDive(s, p, a)) ev({ k: 'dive', n: s.k });
  },
  step(s, inputs, ev) {
    if (s.ph === 'res') {
      if (--s.tm <= 0) {
        const w = penWinner(s.goals, s.taken);
        if (w !== undefined) { s.w = w; s.ph = 'end'; return; }
        s.k++; s.ph = 'aim'; s.kx = 0; s.dive = null; s.shot = null; s.t = 0; s.aimT = 0; s.res = '';
        ev({ k: 'next', n: s.k });
      }
      return;
    }
    if (s.ph === 'end') return;
    const keeper = 1 - shooterOf(s);
    const res = penTick(s, inputs[keeper] && inputs[keeper].x);
    if (!res) return;
    const sh = shooterOf(s);
    s.taken[sh]++; if (res === 'goal') s.goals[sh]++;
    s.hist[sh].push(res === 'goal' ? 1 : 0);
    s.res = res; s.ph = 'res'; s.tm = 110;
    ev({ k: 'res', res, sh, n: s.k });
  },
  result: (s) => (s.ph === 'end' ? { winner: s.w, sc: s.goals } : null),
  snap: (s) => ({ k: s.k, goals: s.goals.slice(), taken: s.taken.slice(), hist: s.hist, ph: s.ph, tm: s.tm, kx: +s.kx.toFixed(3),
    dive: s.dive && { vx: +s.dive.vx.toFixed(3), vy: +s.dive.vy.toFixed(3), p: +s.dive.p.toFixed(3) }, shot: s.shot, t: +s.t.toFixed(3), res: s.res, first: s.first, w: s.w, aimT: s.aimT }),
  apply(gs, d, now) { return { prev: gs ? gs.cur : null, cur: { ...d, at: now } }; },
});

// ---------- screen ----------
export const penaltyCardArt = () => `<div class="rtd-art-img" aria-hidden="true"><svg viewBox="0 0 120 80" preserveAspectRatio="none"><rect width="120" height="80" fill="#3f9b4b"/><path d="M0 50h120M0 70h120" stroke="#48a955" stroke-width="10"/><path d="M14 44V8h92v36" stroke="#fff" stroke-width="4" fill="rgba(255,255,255,.12)"/><path d="M18 14h84M18 22h84M18 30h84M18 38h84M30 8v36M46 8v36M62 8v36M78 8v36M94 8v36" stroke="rgba(255,255,255,.3)" stroke-width="1"/><circle cx="28" cy="66" r="7" fill="#fff" stroke="#222" stroke-width="1.5"/><circle cx="28" cy="66" r="2.6" fill="#222"/></svg><img class="fg" src="img/duo/penalty_keeper1.webp" alt="" style="left:40%;top:6%;width:34%;height:54%;transform:rotate(18deg)"></div>`;
export const penaltyCardArtSvg = () => `<svg class="rtd-art" viewBox="0 0 120 80" aria-hidden="true"><rect width="120" height="80" rx="10" fill="#3f9b4b"/>
  <path d="M0 22h120M0 44h120M0 66h120" stroke="#48a955" stroke-width="11"/><path d="M22 34V10h76v24" stroke="#fff" stroke-width="4" fill="none"/>
  <path d="M26 12h68M26 18h68M26 24h68M26 30h68M34 10v24M46 10v24M58 10v24M70 10v24M82 10v24" stroke="rgba(255,255,255,.35)" stroke-width="1"/>
  <rect x="62" y="16" width="9" height="16" rx="4" fill="${COL[1]}" transform="rotate(-35 66 24)"/><circle cx="74" cy="15" r="4" fill="#f1c9a5"/>
  <circle cx="40" cy="62" r="7" fill="#fff" stroke="#222" stroke-width="1.5"/><path d="M40 57l3 3-1 4h-4l-1-4z" fill="#222"/></svg>`;

function create(ctx) {
  const st = stage(ctx, 'rtd-penalty');
  const names = ctx.names || ['Player 1', 'Player 2'];
  const first = ctx.first === 1 ? 1 : 0;
  const spec = penaltySpec(first);
  const pics = { keeper: [img('img/duo/penalty_keeper0.webp'), img('img/duo/penalty_keeper1.webp')] };
  let dead = false, localShot = null, localDive = null, localKx = 0, localKick = -1, shake = 0, myTarget = 0;
  const ses = session(ctx, spec, {
    event(e) {
      if (e.k === 'kick') play(ctx, 'place');
      if (e.k === 'dive') play(ctx, 'tap');
      if (e.k === 'next') st.hideBanner();
      if (e.k === 'res') {
        const msg = { goal: 'Goal', save: 'Saved', post: 'Off the post', wide: 'Wide', over: 'Over the bar' }[e.res];
        st.banner(msg, `${names[e.sh]} ${e.res === 'goal' ? 'scores' : 'misses'}`, 1600);
        if (e.res === 'goal') { play(ctx, 'unit'); vib(ctx, 50); } else { play(ctx, 'error'); }
        if (e.res === 'post') shake = 6;
      }
    },
    draw(s, isHost) { if (s) draw(isHost ? s : guestState(s)); },
    frame() {
      // this phone's keeper moves at once (prediction); the host has the final say
      const s = ses.state; if (!s) return;
      const d = clamp(myTarget - localKx, -KEEP_SPEED * DT, KEEP_SPEED * DT);
      if (!localDive) localKx += d;
      if (localDive) localDive.p = Math.min(1, localDive.p + 1 / DIVE_TICKS);
    },
  });

  // guest: the ball flies on this phone's own clock from when the kick was seen
  const seenShot = {};
  function guestState(gs) {
    const c = gs.cur, p = gs.prev;
    const out = { ...c };
    const t = p ? clamp((performance.now() - c.at) / Math.max(16, c.at - p.at), 0, 1) : 1;
    if (p && p.k === c.k) out.kx = lerp(p.kx, c.kx, t);
    if (c.shot && c.ph === 'fly') {
      if (!seenShot[c.k]) seenShot[c.k] = performance.now() - c.t * 1000;
      out.t = Math.min(c.shot.T, (performance.now() - seenShot[c.k]) / 1000);
    }
    return out;
  }

  // ---------- controls ----------
  const role = (p, s) => (p === shooterOf(s) ? 'shoot' : 'keep');
  const swipes = new Map();
  const goalGeom = () => { const W = st.view.W, H = st.view.H, gw = Math.min(W * 0.8, H * 0.62); return { gw, gx: W / 2, gy: H * 0.38, sx: W / 2, sy: H * 0.84 }; };
  const toGoalX = (x) => clamp((x - goalGeom().gx) / (goalGeom().gw / 2), -1, 1);
  const unT = touches(st.cv, ctx, st.view, () => false, {
    down: (p, x, y, id) => {
      const s = ses.state; if (!s || dead) return;
      const st0 = s.cur || s;
      swipes.set(id, { p, pts: [{ x, y, t: performance.now() }], role: role(p, st0) });
      if (role(p, st0) === 'keep') keepTo(p, x);
    },
    move: (p, x, y, id) => {
      const w = swipes.get(id); if (!w) return;
      w.pts.push({ x, y, t: performance.now() }); if (w.pts.length > 60) w.pts.splice(1, 1);
      if (w.role === 'keep') {
        keepTo(p, x);
        // a quick flick dives
        const n = w.pts.length, a = w.pts[Math.max(0, n - 5)], b = w.pts[n - 1], dt = b.t - a.t;
        if (dt > 0 && Math.hypot(b.x - a.x, b.y - a.y) / dt > 1.3 && !w.dived) { w.dived = true; dive(p, b.x - a.x, a.y - b.y); }
      }
    },
    up: (p, x, y, id) => {
      const w = swipes.get(id); swipes.delete(id); if (!w || w.role !== 'shoot') return;
      const a = w.pts[0], b = w.pts[w.pts.length - 1];
      // widest sideways bend of the path from the straight line
      let bend = 0; const vx = b.x - a.x, vy = b.y - a.y, l = Math.hypot(vx, vy) || 1;
      for (const q of w.pts) { const d = ((q.x - a.x) * vy - (q.y - a.y) * vx) / l; if (Math.abs(d) > Math.abs(bend)) bend = d; }
      const shot = shotFromSwipe(a, b, -bend, b.t - a.t, st.view.W, st.view.H);
      if (shot) shoot(p, shot);
    },
  });
  function keepTo(p, x) {
    const gx = Math.round(toGoalX(x) * 100) / 100;
    ses.setInput(p, { x: gx });
    if (!ctx.local && p === ctx.me) myTarget = gx;
  }
  function dive(p, dx, dy) {
    ses.act(p, { k: 'dive', x: dx, y: dy });
    if (!ctx.local && !ses.host && p === ctx.me) { const l = Math.hypot(dx, dy) || 1; localDive = { vx: dx / l, vy: Math.max(-0.25, dy / l), p: 0 }; }
  }
  function shoot(p, shot) {
    ses.act(p, { k: 'shot', ...shot });
    const s = ses.state, c = s && (s.cur || s);
    if (!ctx.local && !ses.host && p === ctx.me && c && c.ph === 'aim') localShot = { shot, at: performance.now() };
  }
  const unK = keys(ctx, {
    down: (p, k) => {
      const s = ses.state; if (!s) return; const st0 = s.cur || s;
      if (role(p, st0) === 'shoot') {
        const aim = { left: -0.75, right: 0.75, up: 0, fire: 0.3 }[k];
        if (aim !== undefined) shoot(p, { ex: aim, eh: k === 'up' ? 0.5 : 0.25, T: 0.8, c: 0 });
      } else {
        if (k === 'left' || k === 'right') { const x = k === 'left' ? -0.8 : 0.8; ses.setInput(p, { x }); if (p === ctx.me) myTarget = x; }
        if (k === 'up' || k === 'fire') dive(p, 0, 1);
      }
    },
  });

  // ---------- drawing ----------
  function draw(s) {
    const { g, view } = st, W = view.W, H = view.H;
    const { gw, gx, gy, sx, sy } = goalGeom(), u = gw / 2;
    const X = (x) => gx + x * u, Y = (h) => gy - h * u;
    // this phone's predictions while playing on two phones as the guest
    const me = ctx.me, sh = shooterOf(s), meKeep = !ctx.local && !ses.host && me !== sh;
    if (s.k !== localKick) { localKick = s.k; localShot = null; localDive = null; localKx = 0; myTarget = 0; }
    let kx = s.kx, dv = s.dive, t = s.t, shot = s.shot;
    if (meKeep && s.ph !== 'res') { kx = localKx; dv = localDive || dv; }
    if (!ctx.local && !ses.host && me === sh && localShot && s.ph !== 'res') { shot = localShot.shot; t = Math.min(shot.T, (performance.now() - localShot.at) / 1000); }
    st.begin(false);
    if (shake > 0) { g.translate((Math.random() - 0.5) * shake, 0); shake *= 0.85; if (shake < 0.4) shake = 0; }
    // pitch with mowing stripes and the box in perspective
    g.fillStyle = '#3f9b4b'; g.fillRect(-10, -10, W + 20, H + 20);
    for (let k = 0; k < 9; k++) { g.fillStyle = k % 2 ? '#47a854' : '#3f9b4b'; g.fillRect(-10, gy + (k * (H - gy)) / 8, W + 20, (H - gy) / 8 + 1); }
    g.fillStyle = '#2f7c3a'; g.fillRect(-10, -10, W + 20, gy - u * BAR - 30);
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, gy); g.lineTo(W, gy); g.stroke();
    g.beginPath(); g.moveTo(X(-1.55), gy); g.lineTo(X(-2.1), gy + (sy - gy) * 0.55); g.lineTo(X(2.1), gy + (sy - gy) * 0.55); g.lineTo(X(1.55), gy); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(sx, sy, 5, 3, 0, 0, Math.PI * 2); g.fill();
    // net and frame
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(X(-1), Y(BAR), 2 * u, BAR * u);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1;
    for (let k = -10; k <= 10; k++) { g.beginPath(); g.moveTo(X(k / 10), Y(BAR)); g.lineTo(X(k / 10), gy); g.stroke(); }
    for (let k = 0; k <= 7; k++) { g.beginPath(); g.moveTo(X(-1), Y((k / 7) * BAR)); g.lineTo(X(1), Y((k / 7) * BAR)); g.stroke(); }
    g.strokeStyle = '#fff'; g.lineWidth = Math.max(4, u * 0.05); g.lineCap = 'round';
    g.beginPath(); g.moveTo(X(-1), gy); g.lineTo(X(-1), Y(BAR)); g.lineTo(X(1), Y(BAR)); g.lineTo(X(1), gy); g.stroke();
    // keeper
    const keeper = 1 - sh;
    const [x0, y0, x1, y1] = keeperShape(kx, dv);
    const kimg = pics.keeper[keeper];
    if (ready(kimg)) {
      // standing: feet on the line; diving: the body tips over along the dive
      const h = 0.66 * u, w = h * (kimg.naturalWidth / kimg.naturalHeight);
      const cxk = dv ? (x0 + x1) / 2 : kx, cyk = dv ? (y0 + y1) / 2 : 0.31;
      const ang = dv ? Math.atan2(-(y1 - y0), x1 - x0) + Math.PI / 2 : 0;
      g.save(); g.translate(X(cxk), Y(cyk)); g.rotate(ang);
      g.fillStyle = COL[keeper]; g.globalAlpha = 0.35; g.beginPath(); g.ellipse(0, 0, w * 0.45, h * 0.5, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.drawImage(kimg, -w / 2, -h / 2, w, h); g.restore();
    } else {
      g.strokeStyle = COL_D[keeper]; g.lineWidth = KEEP_R * 2 * u; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke();
      g.strokeStyle = COL[keeper]; g.lineWidth = KEEP_R * 1.4 * u;
      g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke();
      g.fillStyle = '#f1c9a5'; g.beginPath(); g.arc(X(x1 + (x1 - x0) * 0.15), Y(y1 + (y1 - y0) * 0.15 + (dv ? 0 : 0.12)), KEEP_R * 0.75 * u, 0, Math.PI * 2); g.fill();
    }
    // ball: from the spot to the goal plane, shrinking with distance
    let bx = sx, by = sy, br = Math.max(9, W * 0.045);
    if (shot && (s.ph === 'fly' || s.ph === 'res' || t > 0)) {
      const uu = clamp(t / shot.T, 0, 1), e = 1 - (1 - uu) * (1 - uu), q = ballAt(shot, uu);
      bx = lerp(sx, X(q.x), e); by = lerp(sy, Y(q.h), e); br = lerp(br, BALL_R * u, e);
    }
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(bx + 2, Math.max(by, gy) + br * 0.6, br, br * 0.35, 0, 0, Math.PI * 2); g.fill();
    // the ball: white with a ring of dark patches
    g.fillStyle = '#fff'; g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#222'; g.lineWidth = Math.max(1, br * 0.1); g.stroke();
    g.fillStyle = '#222'; g.beginPath(); g.arc(bx, by, br * 0.32, 0, Math.PI * 2); g.fill();
    for (let q = 0; q < 5; q++) { const a = q * 1.2566 - 1.57; g.beginPath(); g.arc(bx + Math.cos(a) * br * 0.78, by + Math.sin(a) * br * 0.78, br * 0.2, 0, Math.PI * 2); g.fill(); }
    // swipe trails under fingers
    for (const w of swipes.values()) {
      if (w.role !== 'shoot' || w.pts.length < 2) continue;
      g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath();
      w.pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.stroke();
    }
    // tally of kicks for each player
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = '700 12px system-ui, sans-serif';
    [0, 1].forEach((i, row) => {
      const y = 16 + row * 20;
      g.fillStyle = COL[i]; g.fillText(names[i], 10, y);
      const n = Math.max(5, s.hist[i].length);
      for (let k = 0; k < n; k++) {
        const cx = 104 + k * 16, v = s.hist[i][k];
        g.beginPath(); g.arc(cx, y, 6, 0, Math.PI * 2);
        g.fillStyle = v === 1 ? '#3ddc84' : v === 0 ? '#e5383b' : 'rgba(255,255,255,.25)'; g.fill();
      }
    });
    // whose turn and what to do
    g.textAlign = 'center';
    const hint = (p, y, flipText) => {
      g.save(); if (flipText) { g.translate(W / 2, y); g.rotate(Math.PI); g.translate(-W / 2, -y); }
      g.fillStyle = 'rgba(255,255,255,.95)'; g.font = '800 15px system-ui, sans-serif';
      const txt = s.ph !== 'aim' ? '' : p === sh ? `${ctx.local ? names[p] + ': ' : ''}Swipe up from the ball to shoot` : `${ctx.local ? names[p] + ': ' : ''}Drag to move, flick to dive`;
      g.fillText(txt, W / 2, y); g.restore();
    };
    if (ctx.local) { hint(0, H - 18, false); hint(1, gy - u * BAR - 46, false); }
    else hint(me, H - 18, false);
    st.score(s.goals, s.taken[0] >= 5 && s.taken[1] >= 5 ? 'Sudden death' : `Kick ${Math.min(5, Math.floor(s.k / 2) + 1)} of 5`);
  }

  return { destroy() { dead = true; ses.destroy(); unT(); unK(); st.destroy(); } };
}

export default {
  id: 'penalty', name: 'Penalty Shootout', tag: 'Shoot, save and hold your nerve', realtime: true, cat: 'action',
  art: penaltyCardArt,
  help: [
    'You take turns to shoot and to keep goal. Five kicks each, then sudden death if it is level.',
    'Shooting: swipe up from the ball. Swipe left or right to aim, longer for a higher shot, faster for more pace, and bend the swipe to curl the ball. Too long and it sails over the bar.',
    'Keeping: drag left and right to move along the line, then flick in any direction to dive. You only get one dive per kick, so time it well.',
    'On one phone, the bottom half of the screen belongs to the first player and the top half to the second.',
  ],
  create,
};
