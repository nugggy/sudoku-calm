// Sumo Bumpers: two bumper cars in a round ring. Drag to steer, tap to dash, knock your rival out.
// The ring shrinks if a round drags on. First to 3.
import { stage, session, touches, keys, COL, COL_D, play, vib, clamp, lerp, img, ready } from './rtd-kit.js';

export const TO = 3, BR = 0.14, ACC = 3.4, DAMP = 0.986, VMAX = 1.45, DASH = 1.25, DASH_CD = 110, PUSH = 0.28;
const DT = 1 / 60;

// ---------- rules (host) ----------
export function sumoInit() { const s = { sc: [0, 0], r: 0 }; sumoReset(s); return s; }
export function sumoReset(s) {
  s.p = [{ x: 0, y: 0.5, vx: 0, vy: 0, cd: 0, out: 0, hx: 0, hy: -1 }, { x: 0, y: -0.5, vx: 0, vy: 0, cd: 0, out: 0, hx: 0, hy: 1 }];
  s.R = 1; s.ph = 'count'; s.tm = 100; s.run = 0; s.w = null; s.r++;
}
export function sumoDash(s, i) {
  const p = s.p[i];
  if (s.ph !== 'run' || p.cd > 0 || p.out) return false;
  p.vx += p.hx * DASH; p.vy += p.hy * DASH; p.cd = DASH_CD;
  return true;
}
// moves both bumpers one tick with joystick inputs [{x, y}] and resolves a collision; returns true on a hit
export function sumoPhysics(s, inputs) {
  let hit = false;
  s.p.forEach((p, i) => {
    if (p.out) return;
    const j = inputs[i] || { x: 0, y: 0 };
    const jl = Math.hypot(j.x, j.y), jx = jl > 1 ? j.x / jl : j.x, jy = jl > 1 ? j.y / jl : j.y;
    if (jl > 0.15) { p.hx = jx / Math.max(1e-6, Math.hypot(jx, jy)); p.hy = jy / Math.max(1e-6, Math.hypot(jx, jy)); }
    p.vx += jx * ACC * DT; p.vy += jy * ACC * DT;
    p.vx *= DAMP; p.vy *= DAMP;
    const v = Math.hypot(p.vx, p.vy), cap = p.cd > DASH_CD - 20 ? VMAX + DASH : VMAX;
    if (v > cap) { p.vx *= cap / v; p.vy *= cap / v; }
    p.x += p.vx * DT; p.y += p.vy * DT;
    if (p.cd > 0) p.cd--;
  });
  const [a, b] = s.p;
  if (!a.out && !b.out) {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d < 2 * BR && d > 1e-6) {
      const nx = dx / d, ny = dy / d, rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv < 0) {
        // equal masses, a bouncy hit plus a little extra shove so bumps feel strong
        const jmp = -rv + PUSH * Math.min(1, -rv * 2 + 0.3);
        a.vx -= nx * jmp; a.vy -= ny * jmp; b.vx += nx * jmp; b.vy += ny * jmp;
        hit = true;
      }
      const ov = (2 * BR - d) / 2;
      a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
    }
  }
  return hit;
}
// who is out of the ring this tick (a bumper is out once its centre passes the edge)
export function sumoOut(s) { return s.p.map((p) => p.out || Math.hypot(p.x, p.y) > s.R + 0.02); }

export const sumoSpec = {
  init: sumoInit,
  input: () => ({ x: 0, y: 0 }),
  action: (s, p, a, ev) => { if (a.k === 'dash' && sumoDash(s, p)) ev({ k: 'dash', p }); },
  step(s, inputs, ev) {
    if (s.ph === 'count') { if (--s.tm <= 0) { s.ph = 'run'; ev({ k: 'go' }); } return; }
    if (s.ph === 'over') {
      // let a knocked-out bumper keep sliding off the edge
      sumoPhysics(s, [{ x: 0, y: 0 }, { x: 0, y: 0 }]);
      if (--s.tm <= 0) { if (Math.max(...s.sc) >= TO) s.ph = 'end'; else { sumoReset(s); ev({ k: 'round' }); } }
      return;
    }
    if (s.ph !== 'run') return;
    s.run++;
    if (s.run > 1500) s.R = Math.max(0.55, 1 - ((s.run - 1500) / 1200) * 0.45);
    if (sumoPhysics(s, inputs)) ev({ k: 'hit' });
    const out = sumoOut(s);
    if (out[0] || out[1]) {
      out.forEach((o, i) => { if (o) s.p[i].out = 1; });
      s.w = out[0] && out[1] ? null : out[0] ? 1 : 0;
      if (s.w !== null) s.sc[s.w]++;
      s.ph = 'over'; s.tm = 110;
      ev({ k: 'out', w: s.w });
    }
  },
  result: (s) => (s.ph === 'end' ? { winner: s.sc[0] > s.sc[1] ? 0 : 1, sc: s.sc } : null),
  snap: (s) => ({ p: s.p.map((p) => [p.x, p.y, p.vx, p.vy, p.cd, p.out, p.hx, p.hy].map((v) => Math.round(v * 1000) / 1000)), R: Math.round(s.R * 1000) / 1000, ph: s.ph, tm: s.tm, sc: s.sc.slice(), w: s.w, r: s.r }),
  apply(gs, d, now) {
    const cur = { ...d, p: d.p.map(([x, y, vx, vy, cd, out, hx, hy]) => ({ x, y, vx, vy, cd, out, hx, hy })), at: now };
    if (!gs || gs.cur.r !== d.r) return { prev: cur, cur };
    return { prev: gs.cur, cur };
  },
};

// guest view: blend the last two snapshots, and run this phone's own bumper slightly ahead so steering feels immediate
function guestView(gs, me) {
  const { prev, cur } = gs, now = performance.now();
  const span = Math.max(16, cur.at - prev.at), t = clamp((now - cur.at) / span, 0, 1);
  const p = cur.p.map((q, i) => {
    const o = prev.p[i];
    const v = { ...q, x: lerp(o.x, q.x, t), y: lerp(o.y, q.y, t) };
    if (i === me && !q.out) { const ahead = Math.min(0.12, (now - cur.at) / 1000 + 0.05); v.x = q.x + q.vx * ahead; v.y = q.y + q.vy * ahead; }
    return v;
  });
  return { ...cur, p, R: lerp(prev.R, cur.R, t) };
}

// ---------- screen ----------
export const sumoCardArt = () => `<div class="rtd-art-img" aria-hidden="true"><svg viewBox="0 0 120 80" preserveAspectRatio="none"><rect width="120" height="80" fill="#2b2140"/><ellipse cx="60" cy="40" rx="36" ry="34" fill="#e9d3a6" stroke="#fff" stroke-width="3"/></svg><img class="fg" src="img/duo/sumo_body0.webp" alt="" style="left:28%;top:42%;width:24%;height:36%"><img class="fg" src="img/duo/sumo_face0.webp" alt="" style="left:32%;top:48%;width:16%;height:24%"><img class="fg" src="img/duo/sumo_body1.webp" alt="" style="left:50%;top:18%;width:24%;height:36%"><img class="fg" src="img/duo/sumo_face1.webp" alt="" style="left:54%;top:24%;width:16%;height:24%"></div>`;
export const sumoCardArtSvg = () => `<svg class="rtd-art" viewBox="0 0 120 80" aria-hidden="true"><rect width="120" height="80" rx="10" fill="#2b2140"/>
  <circle cx="60" cy="40" r="34" fill="#e9d3a6" stroke="#fff" stroke-width="3"/><circle cx="60" cy="40" r="26" fill="none" stroke="#c9a46a" stroke-width="1.5" stroke-dasharray="4 4"/>
  <circle cx="48" cy="48" r="11" fill="${COL[0]}" stroke="${COL_D[0]}" stroke-width="3"/><circle cx="72" cy="30" r="11" fill="${COL[1]}" stroke="${COL_D[1]}" stroke-width="3"/>
  <circle cx="51" cy="45" r="2.4" fill="#fff"/><circle cx="56" cy="47" r="2.4" fill="#fff"/><circle cx="69" cy="33" r="2.4" fill="#fff"/><circle cx="64" cy="31" r="2.4" fill="#fff"/></svg>`;

function create(ctx) {
  const st = stage(ctx, 'rtd-sumo');
  const flip = () => !ctx.local && ctx.me === 1;
  let dead = false, shake = 0;
  const pics = { body: [img('img/duo/sumo_body0.webp'), img('img/duo/sumo_body1.webp')], face: [img('img/duo/sumo_face0.webp'), img('img/duo/sumo_face1.webp')], hurt: img('img/duo/sumo_face_hurt.webp') };
  const names = ctx.names || ['Player 1', 'Player 2'];
  const ses = session(ctx, sumoSpec, {
    event(e) {
      if (e.k === 'go') { st.banner('Push', '', 700); play(ctx, 'place'); }
      if (e.k === 'round') st.hideBanner();
      if (e.k === 'hit') { shake = 8; play(ctx, 'cross'); vib(ctx, 25); }
      if (e.k === 'dash') play(ctx, 'note');
      if (e.k === 'out') { play(ctx, 'unit'); vib(ctx, 60); st.banner(e.w == null ? 'Both out' : `${names[e.w]} wins the round`, '', 1600); }
    },
    draw(s, isHost) { if (!s) return; draw(isHost ? s : guestView(s, ctx.me)); },
  });

  // drag anywhere for a joystick (60 px is full power); a quick tap dashes
  const sticks = new Map();      // pointer -> {p, x0, y0, x, y, t}
  const unit = () => Math.min(st.view.W, st.view.H) * 0.15;
  const push = (p) => {
    let jx = 0, jy = 0;
    for (const k of sticks.values()) if (k.p === p) { jx = (k.x - k.x0) / unit(); jy = (k.y - k.y0) / unit(); }
    const l = Math.hypot(jx, jy); if (l > 1) { jx /= l; jy /= l; }
    ses.setInput(p, { x: Math.round(jx * 100) / 100, y: Math.round(jy * 100) / 100 });
  };
  const unT = touches(st.cv, ctx, st.view, flip, {
    down: (p, x, y, id) => { for (const [k, v] of sticks) if (v.p === p) sticks.delete(k); sticks.set(id, { p, x0: x, y0: y, x, y, t: performance.now() }); },
    move: (p, x, y, id) => { const k = sticks.get(id); if (!k) return; k.x = x; k.y = y; push(p); },
    up: (p, x, y, id) => {
      const k = sticks.get(id); sticks.delete(id);
      if (k && performance.now() - k.t < 230 && Math.hypot(x - k.x0, y - k.y0) < 14) ses.act(p, { k: 'dash' });
      push(p);
    },
  });
  const held = [{}, {}];
  const keyStick = (p) => {
    let x = (held[p].right ? 1 : 0) - (held[p].left ? 1 : 0), y = (held[p].down ? 1 : 0) - (held[p].up ? 1 : 0);
    if (flip() && p === ctx.me) { x = -x; y = -y; }
    ses.setInput(p, { x, y });
  };
  const unK = keys(ctx, {
    down: (p, k) => { if (k === 'fire') ses.act(p, { k: 'dash' }); else { held[p][k] = 1; keyStick(p); } },
    up: (p, k) => { if (k !== 'fire') { held[p][k] = 0; keyStick(p); } },
  });

  function draw(s) {
    const { g, view } = st, W = view.W, H = view.H;
    const sc = Math.min(W, H) * 0.44, cx = W / 2, cy = H / 2;
    st.begin(flip());
    if (shake > 0) { g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= 0.85; if (shake < 0.5) shake = 0; }
    // floor
    const bg = g.createRadialGradient(cx, cy, sc * 0.4, cx, cy, Math.max(W, H) * 0.75);
    bg.addColorStop(0, '#3a2d57'); bg.addColorStop(1, '#1a1428');
    g.fillStyle = bg; g.fillRect(-20, -20, W + 40, H + 40);
    // ring (the full ring shows faintly once it starts shrinking)
    g.fillStyle = 'rgba(233,211,166,.18)'; g.beginPath(); g.arc(cx, cy, sc, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e9d3a6'; g.beginPath(); g.arc(cx, cy, sc * s.R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = 'rgba(160,110,50,.45)'; g.lineWidth = 2; g.setLineDash([8, 8]);
    g.beginPath(); g.arc(cx, cy, sc * s.R * 0.78, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    // start lines
    g.fillStyle = 'rgba(120,70,30,.5)'; g.fillRect(cx - sc * 0.18, cy - sc * 0.08 - 2, sc * 0.36, 4); g.fillRect(cx - sc * 0.18, cy + sc * 0.08 - 2, sc * 0.36, 4);
    s.p.forEach((p, i) => {
      const x = cx + p.x * sc, y = cy + p.y * sc, r = BR * sc, ang = Math.atan2(p.hy, p.hx);
      g.save(); g.translate(x, y);
      if (p.out) g.globalAlpha = 0.55;
      g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(3, 5, r, r * 0.95, 0, 0, Math.PI * 2); g.fill();
      if (ready(pics.body[i])) {
        // a bumper ring in the player's colour round the character
        g.fillStyle = COL_D[i]; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
        g.drawImage(pics.body[i], -r * 0.86, -r * 0.86, r * 1.72, r * 1.72);
      } else {
        g.fillStyle = COL_D[i]; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = COL[i]; g.beginPath(); g.arc(0, 0, r * 0.8, 0, Math.PI * 2); g.fill();
      }
      // cooldown ring for the dash
      if (p.cd > 0) { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - p.cd / DASH_CD)); g.stroke(); }
      const face = p.out ? pics.hurt : pics.face[i];
      if (ready(face)) {
        // the face looks the way the bumper is heading but stays upright for this phone
        g.translate(p.hx * r * 0.18, p.hy * r * 0.18); if (flip()) g.rotate(Math.PI);
        g.drawImage(face, -r * 0.62, -r * 0.62, r * 1.24, r * 1.24);
      } else {
        g.rotate(ang);
        g.fillStyle = '#fff'; [-1, 1].forEach((k) => { g.beginPath(); g.arc(r * 0.38, k * r * 0.3, r * 0.2, 0, Math.PI * 2); g.fill(); });
        g.fillStyle = '#1b1b2e'; [-1, 1].forEach((k) => { g.beginPath(); g.arc(r * 0.45, k * r * 0.3, r * 0.1, 0, Math.PI * 2); g.fill(); });
      }
      g.restore();
    });
    // joysticks under the fingers on this phone
    for (const k of sticks.values()) {
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(k.x0, k.y0, unit(), 0, Math.PI * 2); g.stroke();
      const dx = k.x - k.x0, dy = k.y - k.y0, l = Math.hypot(dx, dy), m = l > unit() ? unit() / l : 1;
      g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(k.x0 + dx * m, k.y0 + dy * m, 16, 0, Math.PI * 2); g.fill();
    }
    st.plain();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (s.ph === 'count') { g.fillStyle = '#fff'; g.font = '800 64px system-ui, sans-serif'; g.fillText(String(Math.ceil(s.tm / 34)), W / 2, H / 2); }
    else if (s.ph === 'run' && s.R < 1 && s.R > 0.56) { g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '700 13px system-ui, sans-serif'; g.fillText('The ring is shrinking', W / 2, 18); }
    st.score(s.sc, `First to ${TO}`);
  }

  return { destroy() { dead = true; ses.destroy(); unT(); unK(); st.destroy(); } };
}

export default {
  id: 'sumo', name: 'Sumo Bumpers', tag: 'Bump your rival out of the ring', realtime: true, cat: 'action',
  art: sumoCardArt,
  help: [
    'Drag anywhere to steer your bumper car, like a joystick. The further you drag, the harder you push.',
    'Tap quickly to dash in the direction you are facing. The ring around your car shows when the dash is ready again.',
    'Knock your rival out of the ring to win the round. If a round goes on too long, the ring starts to shrink. First to 3 rounds wins.',
  ],
  create,
};
