// Tug of War: tap as fast as you can to pull the flag over your line. Keeping a steady beat gives a
// rhythm bonus. 20 second rounds, best of 3.
//
// Fair judging over a laggy link: every tap is stamped with the host's clock (the guest estimates
// it from pings), and the host judges the rope a moment in the past, once both phones' taps for
// that moment have arrived, rather than by when messages turn up.
import { stage, session, touches, keys, COL, COL_D, play, vib, clamp, img, ready } from './rtd-kit.js';

export const ROUND_MS = 20000, WIN = 40, TO = 2, GRACE = 240, COUNT_MS = 3000;

// ---------- rules ----------
// a tapper remembers its last tap and gap; a tap that keeps the beat (within 22 % of the last gap,
// between 80 and 260 ms) pulls 1.3 instead of 1
export const newTapper = () => ({ n: 0, p: 0, last: -1, gap: 0, bonus: false });
export function tugTap(t, at) {
  const gap = t.last < 0 ? 0 : at - t.last;
  t.bonus = !!(t.gap && gap >= 80 && gap <= 260 && Math.abs(gap - t.gap) <= t.gap * 0.22);
  t.p = Math.round((t.p + (t.bonus ? 1.3 : 1)) * 10) / 10;
  t.n++; t.gap = gap; t.last = at;
  return t.p;
}
// total pull of one player at host time J, from their [time, total] history
export function pullAt(hist, J) { let v = 0; for (const [t, p] of hist) { if (t <= J) v = Math.max(v, p); } return v; }
// the round result at host time now: 0 or 1 for a winner, null for a tied round, undefined while it runs
export function tugJudge(s, now) {
  const J = now - GRACE;
  if (J >= s.S) {
    const d = pullAt(s.h[0], Math.min(J, s.S + ROUND_MS)) - pullAt(s.h[1], Math.min(J, s.S + ROUND_MS));
    if (d >= WIN) return 0;
    if (d <= -WIN) return 1;
  }
  if (J >= s.S + ROUND_MS) {
    const d = pullAt(s.h[0], s.S + ROUND_MS) - pullAt(s.h[1], s.S + ROUND_MS);
    return d > 0 ? 0 : d < 0 ? 1 : null;
  }
  return undefined;
}
export function tugInit(now = 0) { const s = { sc: [0, 0], r: 0 }; tugReset(s, now); return s; }
export function tugReset(s, now) { s.r++; s.S = now + COUNT_MS; s.h = [[], []]; s.p = [0, 0]; s.ph = 'count'; s.w = null; s.tm = 0; }
export function tugAddTap(s, p, a) {
  if (a.r !== s.r || s.ph !== 'run' && s.ph !== 'count') return false;
  if (a.at < s.S || a.at > s.S + ROUND_MS) return false;
  s.h[p].push([a.at, a.p]); s.p[p] = Math.max(s.p[p], a.p);
  return true;
}

export function tugSpec(clock) {
  return {
    init: () => tugInit(clock()),
    input: () => null,
    action: (s, p, a) => { if (a.k === 'tap') tugAddTap(s, p, a); },
    step(s, _in, ev, now) {
      if (s.ph === 'count') { if (now >= s.S) { s.ph = 'run'; ev({ k: 'go', r: s.r }); } return; }
      if (s.ph === 'over') { if (--s.tm <= 0) { if (Math.max(...s.sc) >= TO) s.ph = 'end'; else { tugReset(s, now); ev({ k: 'round', r: s.r }); } } return; }
      if (s.ph !== 'run') return;
      const w = tugJudge(s, now);
      if (w === undefined) return;
      s.w = w; if (w !== null) s.sc[w]++;
      s.ph = 'over'; s.tm = 120;
      ev({ k: 'won', w, p: s.p.slice() });
    },
    result: (s) => (s.ph === 'end' ? { winner: s.sc[0] > s.sc[1] ? 0 : 1, sc: s.sc } : null),
    snap: (s) => ({ r: s.r, S: s.S, ph: s.ph, sc: s.sc.slice(), p: s.p.slice(), w: s.w }),
    apply: (gs, d) => ({ ...d }),
  };
}

// ---------- screen ----------
export const tugCardArt = () => `<div class="rtd-art-img" aria-hidden="true"><svg viewBox="0 0 120 80" preserveAspectRatio="none"><rect width="120" height="40" fill="#9ed8ff"/><rect y="40" width="120" height="40" fill="#6cc04a"/><path d="M0 52H120" stroke="#8a5a2b" stroke-width="4"/><path d="M60 52v10" stroke="#fff" stroke-width="2"/><path d="M61 53l10 4-10 4z" fill="#e5383b"/></svg><img class="fg" src="img/duo/tug_team0.webp" alt="" style="left:4%;top:18%;width:34%;height:72%;transform:rotate(-10deg)"><img class="fg" src="img/duo/tug_team1.webp" alt="" style="right:4%;left:auto;top:18%;width:34%;height:72%;transform:scaleX(-1) rotate(-10deg)"></div>`;
export const tugCardArtSvg = () => `<svg class="rtd-art" viewBox="0 0 120 80" aria-hidden="true"><rect width="120" height="80" rx="10" fill="#8fd0ff"/><rect y="52" width="120" height="28" fill="#6cc04a"/>
  <path d="M8 46Q60 52 112 46" stroke="#a0662f" stroke-width="5" fill="none"/><path d="M60 40V58" stroke="#e5383b" stroke-width="5"/>
  <circle cx="16" cy="30" r="8" fill="${COL[0]}"/><rect x="11" y="38" width="10" height="16" rx="4" fill="${COL_D[0]}"/><circle cx="104" cy="30" r="8" fill="${COL[1]}"/><rect x="99" y="38" width="10" height="16" rx="4" fill="${COL_D[1]}"/>
  <path d="M50 52V60M70 52V60" stroke="#fff" stroke-width="3" stroke-dasharray="3 2"/></svg>`;

function create(ctx) {
  const st = stage(ctx, 'rtd-tug');
  const flip = () => !ctx.local && ctx.me === 1;
  const names = ctx.names || ['Player 1', 'Player 2'];
  let clockFn = () => performance.now();
  const spec = tugSpec(() => clockFn());
  const tappers = [newTapper(), newTapper()];
  const pics = { team: [img('img/duo/tug_team0.webp'), img('img/duo/tug_team1.webp')] };
  let myRound = 0, flash = [0, 0], dead = false;
  const ses = session(ctx, spec, {
    event(e) {
      if (e.k === 'go') { st.banner('Pull', '', 700); play(ctx, 'place'); vib(ctx, 40); }
      if (e.k === 'round') st.hideBanner();
      if (e.k === 'won') { play(ctx, 'unit'); st.banner(e.w == null ? 'A tie' : `${names[e.w]} wins the round`, '', 1800); }
    },
    draw(s) { if (s) draw(s); },
  });
  clockFn = ses.hostNow;

  function tap(p) {
    const s = ses.state; if (!s || dead) return;
    if (s.r !== myRound) { myRound = s.r; tappers[0] = newTapper(); tappers[1] = newTapper(); }
    const now = ses.hostNow();
    if (now < s.S || now > s.S + ROUND_MS || s.ph === 'over' || s.ph === 'end') return;
    const total = tugTap(tappers[p], now);
    flash[p] = performance.now();
    ses.act(p, { k: 'tap', r: s.r, p: total, at: now });
    vib(ctx, 8);
  }
  const unT = touches(st.cv, ctx, st.view, flip, { down: (p) => tap(p) });
  const unK = keys(ctx, { down: (p, k) => { if (k === 'fire' || k === 'up') tap(p); } });

  // Side-on view: this phone's team on the left (player 0 on one phone), pulling the rope left.
  function draw(s) {
    const { g, view } = st, W = view.W, H = view.H, now = ses.hostNow();
    if (s.r !== myRound && s.ph === 'count') { myRound = s.r; tappers[0] = newTapper(); tappers[1] = newTapper(); }
    // this phone's own pull shows straight away; the other player's comes from the host
    const pull = [0, 1].map((i) => (ctx.local || i !== ctx.me || s.r !== myRound ? s.p[i] : Math.max(s.p[i], tappers[i].p)));
    const near = ctx.local ? 0 : ctx.me, far = 1 - near;
    const lineX = W * 0.3, off = (clamp(pull[near] - pull[far], -WIN, WIN) / WIN) * lineX;   // positive: rope moves left
    const ropeY = H * 0.6, cx = W / 2 - off;
    st.begin(false);
    const sky = g.createLinearGradient(0, 0, 0, H * 0.5); sky.addColorStop(0, '#7cc7ff'); sky.addColorStop(1, '#d6efff');
    g.fillStyle = sky; g.fillRect(0, 0, W, H * 0.5);
    g.fillStyle = '#9fd18a'; g.beginPath(); g.ellipse(W * 0.2, H * 0.5, W * 0.45, H * 0.09, 0, Math.PI, 0); g.ellipse(W * 0.85, H * 0.5, W * 0.4, H * 0.07, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#6cc04a'; g.fillRect(0, H * 0.5, W, H * 0.5);
    g.fillStyle = '#62b442'; for (let k = 0; k < 6; k++) g.fillRect(0, H * 0.5 + (k * H) / 12, W, H / 24);
    // tap zones on one phone: player 0 taps the bottom half, player 1 the top half
    if (ctx.local) { g.fillStyle = COL[1] + '22'; g.fillRect(0, 0, W, H / 2); g.fillStyle = COL[0] + '22'; g.fillRect(0, H / 2, W, H / 2); }
    // mud pit and the two lines
    g.fillStyle = '#8a5a2b'; g.beginPath(); g.ellipse(W / 2, ropeY + H * 0.1, W * 0.2, H * 0.035, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#a06a35'; g.beginPath(); g.ellipse(W / 2, ropeY + H * 0.1 - 2, W * 0.16, H * 0.022, 0, 0, Math.PI * 2); g.fill();
    g.lineWidth = 4; g.setLineDash([10, 7]);
    [[W / 2 - lineX, near], [W / 2 + lineX, far]].forEach(([x, i]) => { g.strokeStyle = COL[i]; g.beginPath(); g.moveTo(x, ropeY - H * 0.12); g.lineTo(x, ropeY + H * 0.16); g.stroke(); });
    g.setLineDash([]);
    // the teams: three pullers each, leaning back, moving with the rope
    const fresh = (i) => performance.now() - flash[i] < 120;
    const team = (i, side) => {
      const pic = pics.team[i], h = Math.min(H * 0.17, W * 0.24), w = ready(pic) ? h * (pic.naturalWidth / pic.naturalHeight) : h * 0.75;
      for (let k = 0; k < 3; k++) {
        const x = cx + side * (W * 0.16 + k * w * 0.62), lean = (fresh(i) ? 0.2 : 0.12) * -side;
        g.save(); g.translate(x, ropeY + h * 0.42); g.rotate(lean); g.scale(side < 0 ? 1 : -1, 1);
        g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(0, 0, w * 0.4, h * 0.06, 0, 0, Math.PI * 2); g.fill();
        if (ready(pic)) g.drawImage(pic, -w / 2, -h, w, h);
        else { g.fillStyle = COL_D[i]; g.fillRect(-w * 0.2, -h * 0.75, w * 0.4, h * 0.75); g.fillStyle = COL[i]; g.beginPath(); g.arc(0, -h * 0.85, w * 0.22, 0, Math.PI * 2); g.fill(); }
        g.restore();
      }
      // team colour band on the rope
      g.fillStyle = COL[i]; g.fillRect(cx + side * W * 0.12 - 6, ropeY - 7, 12, 14);
    };
    // rope
    g.strokeStyle = '#7a4a1e'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - W, ropeY); g.lineTo(cx + W, ropeY); g.stroke();
    g.strokeStyle = '#b77b3e'; g.lineWidth = 5; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(cx - W, ropeY); g.lineTo(cx + W, ropeY); g.stroke(); g.setLineDash([]);
    team(near, -1); team(far, 1);
    // red flag hanging from the middle of the rope
    g.fillStyle = '#fff'; g.fillRect(cx - 2, ropeY, 4, H * 0.07);
    g.fillStyle = '#e5383b'; g.beginPath(); g.moveTo(cx + 2, ropeY + 4); g.lineTo(cx + 30, ropeY + H * 0.03); g.lineTo(cx + 2, ropeY + H * 0.06); g.closePath(); g.fill();
    // text: on one phone the top half reads upside down for the player sitting opposite
    const left = Math.max(0, Math.ceil((s.S + ROUND_MS - now) / 1000));
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(20,40,60,.8)'; g.font = '900 30px system-ui, sans-serif';
    if (s.ph === 'run') g.fillText(`${left}`, W / 2, H * 0.12);
    const say = (i, y, upside) => {
      g.save(); if (upside) { g.translate(W / 2, y); g.rotate(Math.PI); g.translate(-W / 2, -y); }
      const t = tappers[i];
      g.fillStyle = 'rgba(20,40,20,.85)'; g.font = '800 16px system-ui, sans-serif';
      const who = ctx.local ? `${names[i]}: ` : '';
      const label = s.ph === 'count' ? (now < s.S ? `${who}get ready ${Math.max(1, Math.ceil((s.S - now) / 1000))}` : `${who}pull`)
        : s.ph === 'run' ? `${who}tap tap tap${t.bonus ? '  Rhythm bonus' : ''}` : '';
      g.fillText(label, W / 2, y); g.restore();
    };
    say(near, H - 22, false);
    if (ctx.local) say(far, 22, true);
    st.score(s.sc, 'Best of 3');
  }

  return { destroy() { dead = true; ses.destroy(); unT(); unK(); st.destroy(); } };
}

export default {
  id: 'tug', name: 'Tug of War', tag: 'Tap faster to pull the flag your way', realtime: true, cat: 'party',
  art: tugCardArt,
  help: [
    'Tap as fast as you can. Every tap pulls the rope towards your team.',
    'Keep a steady beat for a rhythm bonus: taps that match your last gap pull harder than wild mashing.',
    'Pull the red flag over your line to win the round, or be ahead when the 20 seconds run out. Best of 3.',
    'On one phone, the first player taps the bottom half of the screen and the second player the top half.',
  ],
  create,
};
