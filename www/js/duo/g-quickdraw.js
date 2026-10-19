// Quick Draw: wait for the signal, then tap before your rival. Tapping too soon is a foul and gives
// the round away. The wait is random each round. First to 5.
//
// Taps are stamped with the host's clock (the guest estimates it from pings) and the host judges
// on those stamps, waiting a short grace time for the other phone's tap to arrive, so a slower
// link does not decide who was quicker.
import { stage, session, touches, keys, COL, COL_D, play, vib, img, ready } from './rtd-kit.js';

export const TO = 5, GRACE = 300, NO_TAP_MS = 2500;

// ---------- rules ----------
export function qdInit(now, rng) { const s = { sc: [0, 0], r: 0 }; qdReset(s, now, rng); return s; }
export function qdReset(s, now, rng) {
  s.r++; s.T0 = now; s.S = now + 1800 + Math.round((rng ? rng() : Math.random()) * 3500);
  s.taps = [null, null]; s.ph = 'wait'; s.w = null; s.why = ''; s.tm = 0;
}
export function qdTap(s, p, a) {
  if (s.ph !== 'wait' || a.r !== s.r || s.taps[p] !== null) return false;
  s.taps[p] = a.at;
  return true;
}
// undefined while waiting, otherwise {w: winner or null, why: 'foul' | 'faster' | 'none'}
export function qdJudge(s, now) {
  const t = s.taps, fouls = [0, 1].filter((i) => t[i] !== null && t[i] < s.S);
  if (fouls.length) {
    const first = fouls.reduce((a, b) => (t[a] <= t[b] ? a : b));
    if (now >= t[first] + GRACE) return { w: 1 - first, why: 'foul' };
    return undefined;
  }
  if (t[0] !== null && t[1] !== null) return { w: t[0] <= t[1] ? 0 : 1, why: 'faster' };
  const one = t[0] !== null ? 0 : t[1] !== null ? 1 : -1;
  if (one >= 0 && now >= t[one] + GRACE) return { w: one, why: 'faster' };
  if (one < 0 && now >= s.S + NO_TAP_MS) return { w: null, why: 'none' };
  return undefined;
}

export function quickdrawSpec(clock, rng) {
  return {
    init: () => qdInit(clock(), rng),
    input: () => null,
    action: (s, p, a) => { if (a.k === 'tap') qdTap(s, p, a); },
    step(s, _in, ev, now) {
      if (s.ph === 'over') {
        if (--s.tm <= 0) { if (Math.max(...s.sc) >= TO) s.ph = 'end'; else { qdReset(s, now, rng); ev({ k: 'round', r: s.r }); } }
        return;
      }
      if (s.ph !== 'wait') return;
      const j = qdJudge(s, now);
      if (!j) return;
      s.w = j.w; s.why = j.why;
      if (j.w !== null) s.sc[j.w]++;
      s.ph = 'over'; s.tm = 150;
      ev({ k: 'res', w: j.w, why: j.why, rt: s.taps.map((t) => (t === null ? null : Math.round(t - s.S))) });
    },
    result: (s) => (s.ph === 'end' ? { winner: s.sc[0] > s.sc[1] ? 0 : 1, sc: s.sc } : null),
    snap: (s) => ({ r: s.r, S: s.S, ph: s.ph, sc: s.sc.slice(), w: s.w, why: s.why, taps: s.taps.map((t) => (t === null ? null : Math.round(t - s.S))) }),
    apply: (gs, d) => ({ ...d, taps: d.taps.map((t) => (t === null ? null : t + d.S)) }),
  };
}

// ---------- screen ----------
const hat = (x, y, c) => `<path d="M${x - 13} ${y}h26M${x - 8} ${y}l2-9h12l2 9" stroke="${c}" stroke-width="4" fill="${c}" stroke-linejoin="round"/>`;
export const quickdrawCardArt = () => `<div class="rtd-art-img" aria-hidden="true"><svg viewBox="0 0 120 80" preserveAspectRatio="none"><rect width="120" height="80" fill="#f4a259"/><circle cx="60" cy="46" r="20" fill="#ffd36e"/><rect y="52" width="120" height="28" fill="#c9773a"/><text x="60" y="20" font-family="system-ui,sans-serif" font-size="14" font-weight="900" text-anchor="middle" fill="#7a1f1f">DRAW</text></svg><img class="fg" src="img/duo/quick_p0_draw.webp" alt="" style="left:4%;top:22%;width:36%;height:74%"><img class="fg" src="img/duo/quick_p1_idle.webp" alt="" style="right:4%;left:auto;top:22%;width:36%;height:74%;transform:scaleX(-1)"></div>`;
export const quickdrawCardArtSvg = () => `<svg class="rtd-art" viewBox="0 0 120 80" aria-hidden="true"><rect width="120" height="80" rx="10" fill="#f4a259"/><circle cx="60" cy="50" r="22" fill="#ffd36e"/><rect y="56" width="120" height="24" fill="#c9773a"/>
  <rect x="20" y="36" width="12" height="22" rx="4" fill="${COL_D[0]}"/><circle cx="26" cy="30" r="7" fill="#f1c9a5"/>${hat(26, 25, '#5a3418')}
  <rect x="88" y="36" width="12" height="22" rx="4" fill="${COL_D[1]}"/><circle cx="94" cy="30" r="7" fill="#f1c9a5"/>${hat(94, 25, '#3b2a1a')}
  <text x="60" y="22" font-family="system-ui,sans-serif" font-size="15" font-weight="900" text-anchor="middle" fill="#7a1f1f">DRAW</text></svg>`;

function create(ctx) {
  const st = stage(ctx, 'rtd-quick');
  const flip = () => !ctx.local && ctx.me === 1;
  const names = ctx.names || ['Player 1', 'Player 2'];
  let clockFn = () => performance.now();
  const spec = quickdrawSpec(() => clockFn(), ctx.rng);
  const mine = [null, null];   // this phone's own taps per round, shown at once
  const pose = (i, k) => img(`img/duo/quick_p${i}_${k}.webp`);
  const pics = [0, 1].map((i) => ({ idle: pose(i, 'idle'), draw: pose(i, 'draw'), hurt: pose(i, 'hurt') }));
  let myRound = 0, last = null, dead = false, signalled = 0;
  const ses = session(ctx, spec, {
    event(e) {
      if (e.k === 'round') { st.hideBanner(); signalled = 0; }
      if (e.k === 'res') {
        last = e;
        const t = e.why === 'foul' ? `${names[1 - e.w]} drew too soon` : e.why === 'none' ? 'Nobody drew' : `${names[e.w]} was quicker`;
        const sub = e.rt.map((r, i) => (r === null ? '' : `${names[i]} ${r < 0 ? 'too soon' : `${r} ms`}`)).filter(Boolean).join('   ');
        st.banner(t, sub, 2300);
        play(ctx, e.why === 'foul' ? 'error' : 'unit');
      }
    },
    draw(s) { if (s) draw(s); },
  });
  clockFn = ses.hostNow;

  function tap(p) {
    const s = ses.state; if (!s || dead || s.ph !== 'wait') return;
    if (s.r !== myRound) { myRound = s.r; mine[0] = mine[1] = null; }
    if (mine[p] !== null) return;
    const now = ses.hostNow();
    mine[p] = now;
    ses.act(p, { k: 'tap', r: s.r, at: now });
    if (now < s.S) { play(ctx, 'error'); vib(ctx, 120); } else { play(ctx, 'place'); vib(ctx, 30); }
  }
  const unT = touches(st.cv, ctx, st.view, flip, { down: (p) => tap(p) });
  const unK = keys(ctx, { down: (p, k) => { if (k === 'fire' || k === 'up') tap(p); } });

  // a standing cowboy seen from the side; mirror turns him to face left
  function cowboy(g, x, y, sc, i, drawn, mirror, hurt) {
    const pic = pics[i][hurt ? 'hurt' : drawn ? 'draw' : 'idle'];
    if (ready(pic)) {
      const h = 96 * sc, w = h * (pic.naturalWidth / pic.naturalHeight);
      g.save(); g.translate(x, y + 34 * sc); g.scale(mirror ? -1 : 1, 1);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, 0, w * 0.32, 6 * sc, 0, 0, Math.PI * 2); g.fill();
      g.drawImage(pic, -w / 2, -h, w, h);
      g.fillStyle = COL[i]; g.beginPath(); g.arc(0, -h - 8 * sc, 6 * sc, 0, Math.PI * 2); g.fill();
      g.restore();
      return;
    }
    g.save(); g.translate(x, y); g.scale(mirror ? -sc : sc, sc);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, 34, 20, 6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a2a1c'; g.fillRect(-9, 12, 7, 22); g.fillRect(2, 12, 7, 22);
    g.fillStyle = COL_D[i]; g.fillRect(-12, -12, 24, 28);
    g.fillStyle = COL[i]; g.fillRect(-12, -12, 24, 8);
    // drawing arm: down by the holster until the draw, then pointed forward
    g.strokeStyle = '#f1c9a5'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(12, -6); g.lineTo(drawn ? 30 : 16, drawn ? -12 : 12); g.stroke();
    if (drawn) { g.fillStyle = '#444'; g.fillRect(28, -16, 12, 6); }
    g.beginPath(); g.moveTo(-12, -6); g.lineTo(-17, 12); g.stroke();
    g.fillStyle = '#f1c9a5'; g.beginPath(); g.arc(0, -22, 10, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5a3418'; g.fillRect(-18, -30, 36, 5); g.fillRect(-10, -42, 20, 13);
    g.restore();
  }

  function draw(s) {
    const { g, view } = st, W = view.W, H = view.H, now = ses.hostNow();
    if (s.r !== myRound) { myRound = s.r; mine[0] = mine[1] = null; }
    const go = s.ph === 'wait' && now >= s.S;
    if (go && signalled !== s.r) { signalled = s.r; play(ctx, 'win'); vib(ctx, [30, 30, 30]); }
    st.begin(false);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, go ? '#ffefc2' : '#f08a4b'); sky.addColorStop(1, go ? '#ffd36e' : '#f4c27a');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffd36e'; g.beginPath(); g.arc(W / 2, H / 2, Math.min(W, H) * 0.22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c9773a'; g.fillRect(0, H * 0.18, W, H * 0.64);
    g.fillStyle = '#b8682f'; for (let k = 0; k < 9; k++) g.fillRect((k * 53) % W, H * (0.25 + (k * 0.071) % 0.5), 18, 4);
    // cacti at the sides
    [[W * 0.1, H * 0.5], [W * 0.88, H * 0.42]].forEach(([x, y]) => {
      g.fillStyle = '#3f7d3a'; g.fillRect(x - 5, y - 30, 10, 50); g.fillRect(x - 16, y - 16, 8, 18); g.fillRect(x + 8, y - 22, 8, 14);
    });
    const tapsNow = [0, 1].map((i) => (mine[i] !== null ? mine[i] : s.taps[i]));
    // this phone's player stands near and on the left; the rival is further away on the right, facing back
    const near = ctx.local ? 0 : ctx.me, far = 1 - near, k = Math.min(W, H) / 260;
    const drew = (i) => tapsNow[i] !== null && tapsNow[i] >= s.S;
    const lost = (i) => s.ph === 'over' && s.w !== null && s.w !== undefined && s.w !== i;
    st.plain();
    cowboy(g, W * 0.66, H * 0.36, k * 0.75, far, drew(far), true, lost(far));
    cowboy(g, W * 0.34, H * 0.72, k * 1.15, near, drew(near), false, lost(near));
    st.plain();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (s.ph === 'wait') {
      if (go) {
        g.fillStyle = '#7a1f1f'; g.font = `900 ${Math.round(Math.min(W, H) * 0.2)}px system-ui, sans-serif`;
        g.fillText('DRAW', W / 2, H / 2);
      } else {
        g.fillStyle = 'rgba(60,20,10,.75)'; g.font = '800 22px system-ui, sans-serif';
        g.fillText('Wait for it', W / 2, H / 2);
      }
    }
    // each player's own line: their reaction time, or a hint
    const line = (i, atBottom, upside) => {
      const y = atBottom ? H - 22 : 22;
      g.save(); if (upside) { g.translate(W / 2, y); g.rotate(Math.PI); g.translate(-W / 2, -y); }
      g.fillStyle = 'rgba(40,15,5,.8)'; g.font = '800 15px system-ui, sans-serif';
      const t = tapsNow[i];
      g.fillText(t === null ? (s.ph === 'wait' ? 'Tap when you see DRAW' : '') : t < s.S ? 'Too soon' : `${Math.round(t - s.S)} ms`, W / 2, y);
      g.restore();
    };
    const bottom = ctx.local ? 0 : ctx.me;
    line(bottom, true, false); line(1 - bottom, false, !!ctx.local);
    st.score(s.sc, `First to ${TO}`);
  }

  return { destroy() { dead = true; ses.destroy(); unT(); unK(); st.destroy(); } };
}

export default {
  id: 'quickdraw', name: 'Quick Draw', tag: 'Wait for the signal, then be first', realtime: true, cat: 'party',
  art: quickdrawCardArt,
  help: [
    'Hold steady and watch the screen. After a random wait the word DRAW appears.',
    'Tap as soon as you see it. The quicker tap wins the round, and both reaction times are shown.',
    'Tap before DRAW and it is a foul: your rival gets the round. First to 5 wins.',
    'On one phone, the first player taps the bottom half of the screen and the second player the top half.',
  ],
  create,
};
