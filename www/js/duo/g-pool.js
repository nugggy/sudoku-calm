// 8 Ball pool on a portrait table: two players on one phone, two phones, or one player against the computer.
//
// Two phones: the host is in charge. Whoever's turn it is aims on their own phone (the other phone sees the
// cue move) and their shot goes to the host, which plays it to the end in an instant and sends the shot with
// the final layout. Both phones then animate the same shot from the same start and finish by taking the
// host's layout. The physics only uses exactly rounded maths so the two animations match anyway, but taking
// the host's numbers means a tiny difference between phones can never grow into a different game, and the
// host alone applies the rules. (Sending snapshots 25 times a second instead would make every shot look
// jerky on the guest, and pure lockstep would have nothing to fall back on if the phones ever disagreed.)
import { makeCanvas, tone, noise } from './rt-kit.js';
import * as P from './rt-pool.js';

const { W, H, R, RAIL, HEAD } = P;
const CU = 0.03; // cushion depth, drawn only
const GROUP = { s: 'Solids', t: 'Stripes' };
const NUDGE = 0.0035; // radians per tap of the fine aim buttons
const SLING = 0.42;   // pull back this far from the cue ball for full power

function art() {
  const ball = (x, y, c, stripe) => (stripe
    ? `<circle cx="${x}" cy="${y}" r="5" fill="#f6f3e8"/><rect x="${x - 5}" y="${y - 2.6}" width="10" height="5.2" fill="${c}" clip-path="circle(5px at ${x}px ${y}px)"/>`
    : `<circle cx="${x}" cy="${y}" r="5" fill="${c}"/>`);
  return `<svg class="rt-art" viewBox="0 0 120 80" aria-hidden="true">
    <rect x="4" y="6" width="112" height="68" rx="9" fill="#6b3f1d"/><rect x="11" y="13" width="98" height="54" rx="3" fill="#178a52"/>
    ${[[12, 14], [60, 12], [108, 14], [12, 66], [60, 68], [108, 66]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.4" fill="#111"/>`).join('')}
    ${ball(78, 40, '#151515')}${ball(87, 35, '#f2c014')}${ball(87, 45, '#1d4fc4', true)}${ball(96, 30, '#d42a2a', true)}${ball(96, 40, '#14834b')}${ball(96, 50, '#ef7316', true)}
    <circle cx="36" cy="40" r="5" fill="#f6f3e8"/><path d="M40 40H72" stroke="#fff" stroke-width="1.2" stroke-dasharray="2 2.5" opacity=".8"/>
    <path d="M6 44L29 41" stroke="#e8c48a" stroke-width="3" stroke-linecap="round"/><path d="M6 44L16 42.7" stroke="#3a2010" stroke-width="3.6" stroke-linecap="round"/>
  </svg>`;
}

export default {
  id: 'pool', cat: 'action', name: '8 Ball', tag: 'Pool for two, or take on the computer', realtime: false, ai: true, art,
  help: [
    'Touch the table to aim: the cue points where your finger is. A line and a ghost ball show where the cue ball will hit first. Or put your finger on the cue ball and pull back like a slingshot to aim and set the power together.',
    'Set the power with the slider, nudge the aim with the arrows, and tap Shoot. Tap the small ball to hit the cue ball high (it rolls on after the hit) or low (it comes back).',
    'The first player breaks from behind the line. The table is open until someone pots a ball after the break: that player takes that group (solids 1 to 7 or stripes 9 to 15) and the other player gets the rest.',
    'Pot one of your own balls and you play again. Potting the cue ball, missing every ball, or hitting the other group (or the 8) first is a foul, and your opponent gets ball in hand: they can drag the cue ball anywhere.',
    'Clear your group, then pot the 8 to win. Pot the 8 early, or scratch while potting it, and you lose.',
  ],
  create(ctx) {
    const root = ctx.root;
    root.innerHTML = `<div class="rt-game pool">
      <div class="pool-bar">${[0, 1].map((p) => `<div class="pool-p" data-p="${p}"><b class="pool-n"></b><span class="pool-g"></span></div>`).join('')}</div>
      <div class="pool-msg" data-el="msg"></div>
      <div class="rt-stage" data-el="stage"><div class="pool-banner" data-el="banner"></div></div>
      <div class="pool-panel" data-el="panel">
        <button class="pool-spin" data-el="spin" aria-label="Where to hit the cue ball"><i></i></button>
        <button class="pool-nudge" data-n="-1" aria-label="Turn the aim left"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
        <div class="pool-power" data-el="power" role="slider" aria-label="Power"><i></i><span>Power</span></div>
        <button class="pool-nudge" data-n="1" aria-label="Turn the aim right"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
        <button class="pool-shoot" data-el="shoot">Shoot</button>
      </div></div>`;
    const q = (k) => root.querySelector(`[data-el="${k}"]`);
    const cnv = makeCanvas(q('stage'));
    const s = P.newPool(ctx.rng, ctx.first ?? 0);
    const isHost = ctx.local || ctx.isHost;
    const names = ctx.names || ['Player 1', 'Player 2'];
    const nm = (p) => (ctx.ai && p === 1 ? 'The computer' : names[p]);
    root.querySelector('.pool').__state = s; // read by the test harness
    // phase: aim (waiting for a shot), wait (guest sent its shot), think and reveal (computer), strike (cue moving in), roll, over
    let phase = 'aim', aim = { dx: 0, dy: -1 }, power = 0.6, spin = 0, strike = null, rollAcc = 0, lastT = performance.now();
    let current = null, drag = null, lastAimSent = 0, raf = 0, nudgeT = 0, think = null;
    const pending = [], sinking = [];
    let tf = { s: 1, ox: 0, oy: 0 };

    const myTurn = () => !s.over && (ctx.ai ? s.turn === 0 : ctx.local || s.turn === ctx.me);
    const canAct = () => phase === 'aim' && myTurn();

    // ---------- Layout ----------
    function layout() {
      const v = cnv.view, TW = W + 2 * RAIL, TH = H + 2 * RAIL, pad = 6;
      const sc = Math.min((v.w - pad * 2) / TW, (v.h - pad * 2) / TH);
      tf = { s: sc, ox: (v.w - TW * sc) / 2 + RAIL * sc, oy: (v.h - TH * sc) / 2 + RAIL * sc };
    }
    const toWorld = (px, py) => [(px - tf.ox) / tf.s, (py - tf.oy) / tf.s];

    // ---------- Input ----------
    const cv = cnv.cv;
    cv.style.touchAction = 'none';
    const pt = (e) => { const r = cv.getBoundingClientRect(); layout(); return toWorld(e.clientX - r.left, e.clientY - r.top); };
    function aimAt(x, y) {
      const c = s.balls[0], dx = x - c.x, dy = y - c.y, d = Math.hypot(dx, dy);
      if (d < R * 0.6) return;
      aim = { dx: dx / d, dy: dy / d };
    }
    cv.addEventListener('pointerdown', (e) => {
      if (!canAct()) { if (!s.over && phase === 'aim' && !ctx.local) ctx.toast?.('Wait for your turn'); return; }
      const [x, y] = pt(e), c = s.balls[0], near = Math.hypot(x - c.x, y - c.y) < R * 2.6;
      drag = s.inHand && near ? { kind: 'place', ox: c.x - x, oy: c.y - y } : near ? { kind: 'sling', x0: x, y0: y } : { kind: 'aim' };
      if (drag.kind === 'aim') aimAt(x, y);
      try { cv.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      sendAim();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag || !canAct()) return;
      const [x, y] = pt(e), c = s.balls[0];
      if (drag.kind === 'place') {
        const nx = Math.min(W - R, Math.max(R, x + drag.ox)), ny = Math.min(H - R, Math.max(s.kitchen ? HEAD : R, y + drag.oy));
        if (P.canPlaceCue(s, nx, ny)) { c.x = nx; c.y = ny; }
      } else if (drag.kind === 'sling') {
        // pull back from the cue ball: aim the other way, power by how far
        const dx = c.x - x, dy = c.y - y, d = Math.hypot(dx, dy);
        if (d > R * 0.8) { aim = { dx: dx / d, dy: dy / d }; power = Math.min(1, Math.max(0.03, (d - R * 0.8) / SLING)); showPower(); }
      } else aimAt(x, y);
      sendAim();
    });
    const up = () => { if (drag) { drag = null; sendAim(true); } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

    // power slider
    const pw = q('power');
    const setPow = (e) => { const r = pw.getBoundingClientRect(); power = Math.min(1, Math.max(0.03, (e.clientX - r.left) / r.width)); showPower(); sendAim(); };
    pw.addEventListener('pointerdown', (e) => { if (!canAct()) return; pw.setPointerCapture?.(e.pointerId); pw.dataset.drag = '1'; setPow(e); });
    pw.addEventListener('pointermove', (e) => { if (pw.dataset.drag && canAct()) setPow(e); });
    const pwUp = () => { if (pw.dataset.drag) { delete pw.dataset.drag; sendAim(true); } };
    pw.addEventListener('pointerup', pwUp); pw.addEventListener('pointercancel', pwUp);
    function showPower() { pw.style.setProperty('--p', power.toFixed(3)); pw.setAttribute('aria-valuenow', Math.round(power * 100)); }
    // spin: tap high on the little ball for follow, low for draw, the middle for none
    q('spin').addEventListener('click', (e) => {
      if (!canAct()) return;
      const r = q('spin').getBoundingClientRect(), v = -((e.clientY - r.top) / r.height - 0.5) * 2.6;
      spin = Math.abs(v) < 0.3 ? 0 : Math.max(-1, Math.min(1, Math.round(v * 4) / 4));
      showSpin(); tone(880, 0.04, { type: 'triangle', vol: 0.05 }); sendAim(true);
    });
    function showSpin() { q('spin').style.setProperty('--s', spin); q('spin').setAttribute('aria-label', spin > 0 ? 'Follow: the cue ball rolls on' : spin < 0 ? 'Draw: the cue ball comes back' : 'Centre ball'); }
    // fine aim, repeating while held
    const nudge = (k) => { const c = Math.cos(k * NUDGE), sn = Math.sin(k * NUDGE); aim = { dx: aim.dx * c - aim.dy * sn, dy: aim.dx * sn + aim.dy * c }; sendAim(); };
    root.querySelectorAll('.pool-nudge').forEach((b) => {
      const k = +b.dataset.n;
      b.addEventListener('pointerdown', (e) => {
        if (!canAct()) return;
        e.preventDefault(); nudge(k);
        let n = 0; clearInterval(nudgeT);
        nudgeT = setInterval(() => { if (!canAct()) return clearInterval(nudgeT); n++; if (n > 5) nudge(k * (n > 20 ? 3 : 1)); }, 60);
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => b.addEventListener(ev, () => { clearInterval(nudgeT); sendAim(true); }));
    });
    q('shoot').addEventListener('click', () => shoot());

    // ---------- Shots ----------
    function myShot() {
      const c = s.balls[0], sh = { dx: aim.dx, dy: aim.dy, p: power, sp: spin };
      if (s.inHand) { sh.cx = c.x; sh.cy = c.y; }
      return P.roundShot(sh);
    }
    function shoot() {
      if (!canAct()) return;
      const shot = myShot();
      if (ctx.local || isHost) hostPlay(shot);
      else { phase = 'wait'; ctx.send({ t: 'shoot', shot, n: s.shots }); update(); }
    }
    // The host (or the only phone) works out where everything ends up, tells the guest, then animates it.
    function hostPlay(shot) {
      const t = P.cloneState(s);
      P.runShot(t, shot);
      const after = P.packPool(t);
      if (!ctx.local) ctx.send({ t: 'shot', shot, after, n: s.shots });
      play(shot, after);
    }
    function play(shot, after) {
      const c = s.balls[0];
      if (s.inHand && Number.isFinite(shot.cx) && P.canPlaceCue(s, shot.cx, shot.cy)) { c.x = shot.cx; c.y = shot.cy; }
      aim = { dx: shot.dx, dy: shot.dy }; power = shot.p; spin = shot.sp || 0; showPower(); showSpin();
      strike = { t0: performance.now(), shot, after };
      phase = 'strike'; update();
    }
    function startRoll() {
      const { shot, after } = strike;
      P.startShot(s, shot);
      current = after; strike = null; phase = 'roll'; rollAcc = 0;
      noise(0.05, { vol: 0.08 + power * 0.2, freq: 3000 }); tone(220 + power * 200, 0.05, { type: 'triangle', vol: 0.07 });
    }
    function endRoll() {
      P.unpackPool(s, current); // the host's numbers are final
      current = null;
      const L = s.last;
      if (s.over) {
        phase = 'over'; update();
        const o = s.over, w = o.winner, lose = 1 - w;
        const text = o.why === 'eight' ? `${nm(w)} potted the 8 ball` : o.why === 'early8' ? `${nm(lose)} potted the 8 ball too early`
          : o.why === 'scratch8' ? `${nm(lose)} potted the cue ball with the 8` : `${nm(lose)} fouled while potting the 8 ball`;
        setTimeout(() => ctx.end({ winner: w, text }), 1200);
        return;
      }
      if (L && L.foul) { banner(L.foul === 'scratch' ? 'Foul: cue ball potted' : L.foul === 'nohit' ? 'Foul: no ball hit' : 'Foul: wrong ball first', `${nm(s.turn)} has ball in hand`); ctx.buzz?.(40); }
      else if (L && L.assigned) banner(`${nm(L.p)} ${ctx.ai && L.p === 0 ? 'have' : 'has'} ${GROUP[s.groups[L.p]].toLowerCase()}`, '');
      phase = 'aim';
      // point the cue at the nearest ball this player may hit, and reset the spin
      const c = s.balls[0], t = P.legalTargets(s).map((n) => s.balls[n]).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
      if (t) aimAt(t.x, t.y);
      spin = 0; showSpin();
      if (myTurn() && !ctx.local) { tone(660, 0.1, { vol: 0.05 }); tone(990, 0.12, { vol: 0.05, delay: 0.08 }); ctx.buzz?.(15); }
      update();
      if (pending.length) setTimeout(() => { const m = pending.shift(); if (m) onMsg(m); }, 0);
      if (ctx.ai && s.turn === 1) startThink();
    }

    // ---------- Computer ----------
    function startThink() {
      phase = 'think';
      think = { it: P.aiThink(s, ctx.ai, Math.random), t0: performance.now(), shot: null };
      update();
    }
    function thinkTick(now) {
      if (!think.shot) {
        const until = performance.now() + 8;
        while (performance.now() < until) { const r = think.it.next(); if (r.done) { think.shot = r.value; break; } }
        if (!think.shot) return;
        const c = s.balls[0], sh = think.shot;
        think.from = { dx: aim.dx, dy: aim.dy, p: power, cx: c.x, cy: c.y };
        think.t1 = Math.max(now, think.t0 + 600);
        if (s.inHand && Number.isFinite(sh.cx)) { c.x = sh.cx; c.y = sh.cy; }
      }
      // reveal: the cue swings round to the chosen line and pulls back
      const f = Math.min(1, Math.max(0, (now - think.t1) / 700)), e = f * f * (3 - 2 * f), a = think.from, b = think.shot;
      const dx = a.dx + (b.dx - a.dx) * e, dy = a.dy + (b.dy - a.dy) * e, d = Math.hypot(dx, dy) || 1;
      aim = { dx: dx / d, dy: dy / d }; power = a.p + (b.p - a.p) * e; showPower();
      if (f >= 1 && now - think.t1 > 950) { const sh = think.shot; think = null; hostPlay(sh); }
    }

    // ---------- Network ----------
    function sendAim(force) {
      if (ctx.local || !canAct()) return;
      const now = performance.now();
      if (!force && now - lastAimSent < 70) return;
      lastAimSent = now;
      const c = s.balls[0], r = (v) => Math.round(v * 1e4) / 1e4;
      ctx.send({ t: 'aim', n: s.shots, dx: r(aim.dx), dy: r(aim.dy), p: r(power), sp: spin, cx: r(c.x), cy: r(c.y) });
    }
    function onMsg(m) {
      if (!m || s.over) return;
      if (m.t === 'aim' && phase === 'aim' && m.n === s.shots && s.turn !== ctx.me) {
        aim = { dx: m.dx, dy: m.dy }; power = m.p; spin = m.sp || 0; showPower(); showSpin();
        if (s.inHand && P.canPlaceCue(s, m.cx, m.cy)) { s.balls[0].x = m.cx; s.balls[0].y = m.cy; }
      } else if (m.t === 'shoot' && isHost) {
        if (phase !== 'aim') { pending.push(m); return; }
        if (m.n === s.shots && s.turn !== ctx.me) hostPlay(m.shot);
      } else if (m.t === 'shot' && !isHost) {
        if (phase !== 'aim' && phase !== 'wait') { pending.push(m); return; }
        if (m.n === s.shots) play(m.shot, m.after);
      }
    }
    const off = ctx.onMsg?.(onMsg);

    // ---------- Heads-up ----------
    const bar = root.querySelector('.pool-bar'), msg = q('msg');
    function dots(p) {
      const g = s.groups[p];
      if (!g) return `<small>${s.breakShot ? 'Break' : 'Open table'}</small>`;
      const left = s.balls.filter((b) => !b.in && P.groupOf(b.n) === g).map((b) => b.n);
      const list = left.length ? left : [8];
      return list.map((n) => `<i class="${n > 8 ? 'st' : ''}" style="--c:${P.ballColour(n)}"></i>`).join('');
    }
    function update() {
      bar.querySelectorAll('.pool-p').forEach((el) => {
        const p = +el.dataset.p;
        el.classList.toggle('on', !s.over && s.turn === p);
        el.querySelector('.pool-n').textContent = names[p] + (!ctx.local && p === ctx.me ? ' (you)' : '');
        el.querySelector('.pool-g').innerHTML = dots(p);
      });
      let t;
      if (s.over) t = '';
      else if (phase === 'think') t = 'The computer is thinking';
      else if (phase === 'wait' || phase === 'strike' || phase === 'roll') t = '';
      else {
        const who = ctx.ai ? (s.turn === 0 ? 'Your' : 'The computer\'s') : ctx.local ? `${names[s.turn]}'s` : s.turn === ctx.me ? 'Your' : `${names[s.turn]}'s`;
        t = s.breakShot ? `${who} break${myTurn() ? '. Drag the cue ball to place it behind the line' : ''}`
          : `${who} turn${s.inHand ? (myTurn() ? '. Ball in hand: drag the cue ball anywhere' : ', ball in hand') : ''}`;
      }
      if (t || s.over) msg.textContent = t;
      q('panel').classList.toggle('off', !canAct());
    }
    let banT = 0;
    function banner(title, sub) {
      const b = q('banner');
      b.innerHTML = `<b></b><small></small>`; b.querySelector('b').textContent = title; b.querySelector('small').textContent = sub;
      b.classList.add('show'); clearTimeout(banT); banT = setTimeout(() => b.classList.remove('show'), 1800);
    }

    // ---------- Sounds ----------
    let sounds = 0;
    function onEvent(ev) {
      if (sounds > 3) return;
      if (ev.k === 'hit') { sounds++; tone(1400 + Math.min(3, ev.v) * 300, 0.035, { type: 'triangle', vol: Math.min(0.14, 0.02 + ev.v * 0.05) }); }
      else if (ev.k === 'rail') { if (ev.v > 0.15) { sounds++; tone(140, 0.07, { type: 'sine', vol: Math.min(0.12, ev.v * 0.05) }); } }
      else if (ev.k === 'pot') {
        sounds++;
        sinking.push({ n: ev.n, p: ev.p, t0: performance.now() });
        tone(330, 0.16, { type: 'sine', vol: 0.12, slideTo: 120 }); noise(0.12, { vol: 0.08, freq: 500, delay: 0.05 });
        ctx.buzz?.(ev.n === 0 ? 50 : 18);
      }
    }

    // ---------- Drawing ----------
    // each ball's turn as a rotation matrix; it starts with its number facing up and its stripe across
    const balls3d = s.balls.map(() => ({ m: [0, 1, 0, 0, 0, -1, -1, 0, 0], cache: null, dirty: true }));
    // a little turn so the numbers do not all sit exactly the same way
    balls3d.forEach((o, n) => { if (n) rotate(o.m, 0, 0, 1, ((n * 2.39996) % 1) - 0.5); });
    const glyph = glyphs();

    function roll(dt) {
      s.balls.forEach((b, n) => {
        if (b.in || (!b.vx && !b.vy)) return;
        const v = Math.hypot(b.vx, b.vy), o = balls3d[n];
        rotate(o.m, b.vy / v, -b.vx / v, 0, (v * dt) / R);
        o.dirty = true;
      });
    }
    function drawTable(c) {
      const dark = document.documentElement.dataset.theme === 'dark';
      // wooden frame
      const wg = c.createLinearGradient(-RAIL, 0, W + RAIL, 0);
      wg.addColorStop(0, '#4f2c12'); wg.addColorStop(0.5, '#7a4521'); wg.addColorStop(1, '#4f2c12');
      c.fillStyle = wg; rr(c, -RAIL, -RAIL, W + 2 * RAIL, H + 2 * RAIL, 0.06); c.fill();
      c.strokeStyle = 'rgba(255,220,170,.18)'; c.lineWidth = 0.006; rr(c, -RAIL + 0.012, -RAIL + 0.012, W + 2 * RAIL - 0.024, H + 2 * RAIL - 0.024, 0.05); c.stroke();
      // cloth (also under the pocket mouths)
      const cg = c.createRadialGradient(W / 2, H * 0.45, 0.1, W / 2, H / 2, H * 0.75);
      cg.addColorStop(0, dark ? '#16804a' : '#1d9a58'); cg.addColorStop(1, dark ? '#0b5733' : '#0f6f40');
      c.fillStyle = cg; c.fillRect(-CU, -CU, W + 2 * CU, H + 2 * CU);
      // diamonds on the rails
      c.fillStyle = 'rgba(255,240,210,.8)';
      for (let k = 1; k < 4; k++) for (const y of [-RAIL / 2 - CU / 2, H + RAIL / 2 + CU / 2]) { c.beginPath(); c.arc((W * k) / 4, y, 0.008, 0, 6.3); c.fill(); }
      for (let k = 1; k < 8; k++) if (k !== 4) for (const x of [-RAIL / 2 - CU / 2, W + RAIL / 2 + CU / 2]) { c.beginPath(); c.arc(x, (H * k) / 8, 0.008, 0, 6.3); c.fill(); }
      // pockets
      for (const p of P.POCKETS) {
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r + 0.01);
        g.addColorStop(0, '#000'); g.addColorStop(0.75, '#0b0b0b'); g.addColorStop(1, '#2a2a2a');
        c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.r + 0.01, 0, 6.3); c.fill();
      }
      // cushions, cut back along the pocket jaws
      for (const poly of CUSHION_POLYS) {
        c.fillStyle = dark ? '#0d6a3c' : '#12814a';
        c.beginPath(); poly.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 0.004; c.beginPath(); c.moveTo(poly[0][0], poly[0][1]); c.lineTo(poly[1][0], poly[1][1]); c.stroke();
      }
      // head string and foot spot
      c.strokeStyle = 'rgba(255,255,255,.16)'; c.lineWidth = 0.004;
      c.beginPath(); c.moveTo(0, HEAD); c.lineTo(W, HEAD); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.arc(W / 2, P.FOOT, 0.007, 0, 6.3); c.fill();
      if (s.kitchen && s.inHand && phase === 'aim') { c.fillStyle = 'rgba(0,0,0,.14)'; c.fillRect(0, 0, W, HEAD); }
    }
    function drawBall(c, n, x, y, scale = 1) {
      const px = Math.max(8, Math.round(2 * R * tf.s * cnv.view.dpr)), o = balls3d[n];
      if (!o.cache || o.cache.width !== px) { o.cache = mkCanvas(px); o.dirty = true; }
      if (o.dirty) { paintBall(o.cache, n, o.m, glyph); o.dirty = false; }
      const r = R * scale;
      c.drawImage(o.cache, x - r, y - r, 2 * r, 2 * r);
    }
    function drawShadow(c, x, y) {
      const g = c.createRadialGradient(x + R * 0.35, y + R * 0.45, R * 0.3, x + R * 0.35, y + R * 0.45, R * 1.25);
      g.addColorStop(0, 'rgba(0,0,0,.42)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x + R * 0.35, y + R * 0.45, R * 1.25, 0, 6.3); c.fill();
    }
    function drawGuide(c) {
      const cue = s.balls[0], hit = P.aimContact(s, cue.x, cue.y, aim.dx, aim.dy);
      const legal = hit.ball === null || P.legalTargets(s).includes(hit.ball);
      c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 0.005; c.setLineDash([0.02, 0.014]);
      c.beginPath(); c.moveTo(cue.x + aim.dx * R, cue.y + aim.dy * R); c.lineTo(hit.gx - aim.dx * R, hit.gy - aim.dy * R); c.stroke();
      c.setLineDash([]);
      c.strokeStyle = legal ? 'rgba(255,255,255,.9)' : 'rgba(255,90,90,.95)'; c.lineWidth = 0.006;
      c.beginPath(); c.arc(hit.gx, hit.gy, R, 0, 6.3); c.stroke();
      if (!legal) {
        const k = R * 0.45; c.beginPath(); c.moveTo(hit.gx - k, hit.gy - k); c.lineTo(hit.gx + k, hit.gy + k); c.moveTo(hit.gx + k, hit.gy - k); c.lineTo(hit.gx - k, hit.gy + k); c.stroke();
      }
      if (hit.ball !== null) {
        // where the object ball goes, and where the cue ball glances off to
        const b = s.balls[hit.ball], nx = (b.x - hit.gx) / (2 * R), ny = (b.y - hit.gy) / (2 * R), full = aim.dx * nx + aim.dy * ny;
        c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 0.005;
        c.beginPath(); c.moveTo(b.x + nx * R, b.y + ny * R); c.lineTo(b.x + nx * (R + 0.06 + 0.3 * full), b.y + ny * (R + 0.06 + 0.3 * full)); c.stroke();
        const tx = aim.dx - full * nx, ty = aim.dy - full * ny, tl = Math.hypot(tx, ty);
        if (tl > 0.05) { c.strokeStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.moveTo(hit.gx, hit.gy); c.lineTo(hit.gx + (tx / tl) * 0.18 * tl, hit.gy + (ty / tl) * 0.18 * tl); c.stroke(); }
      }
    }
    function drawCue(c, pull) {
      const cue = s.balls[0], ux = -aim.dx, uy = -aim.dy, px = -uy, py = ux;
      const a = R + 0.012 + pull, L = 1.25, w0 = 0.0055, w1 = 0.013;
      const at = (d, w) => [cue.x + ux * d + px * w, cue.y + uy * d + py * w];
      const seg = (d0, d1, col) => {
        const k0 = w0 + (w1 - w0) * ((d0 - a) / L), k1 = w0 + (w1 - w0) * ((d1 - a) / L);
        const p = [at(d0, k0), at(d1, k1), at(d1, -k1), at(d0, -k0)];
        c.fillStyle = col; c.beginPath(); p.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill();
      };
      // shadow, then tip, ferrule, shaft, butt
      c.save(); c.translate(0.012, 0.018); c.globalAlpha = 0.25; seg(a, a + L, '#000'); c.restore();
      seg(a, a + 0.012, '#3f6fb8'); seg(a + 0.012, a + 0.03, '#f4efe4'); seg(a + 0.03, a + L * 0.62, '#e2bd83'); seg(a + L * 0.62, a + L * 0.66, '#1b1b1b'); seg(a + L * 0.66, a + L, '#4a2412');
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 0.003;
      const [hx0, hy0] = at(a + 0.03, w0 * 0.3), [hx1, hy1] = at(a + L * 0.62, w1 * 0.25);
      c.beginPath(); c.moveTo(hx0, hy0); c.lineTo(hx1, hy1); c.stroke();
    }
    function render(now) {
      const { c2: c, view: v } = cnv;
      layout();
      c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0); c.clearRect(0, 0, v.w, v.h);
      c.translate(tf.ox, tf.oy); c.scale(tf.s, tf.s);
      drawTable(c);
      // balls dropping into pockets
      for (let i = sinking.length - 1; i >= 0; i--) {
        const k = sinking[i], f = (now - k.t0) / 260;
        if (f >= 1) { sinking.splice(i, 1); continue; }
        const p = P.POCKETS[k.p];
        c.globalAlpha = 1 - f * 0.6; drawBall(c, k.n, p.x, p.y, 1 - f * 0.55); c.globalAlpha = 1;
      }
      const live = s.balls.filter((b) => !b.in);
      live.forEach((b) => drawShadow(c, b.x, b.y));
      live.forEach((b) => drawBall(c, b.n, b.x, b.y));
      const cue = s.balls[0];
      if (!cue.in && (phase === 'aim' || phase === 'think' || phase === 'strike' || phase === 'wait')) {
        if (s.inHand && phase === 'aim' && myTurn()) {
          const pulse = 0.5 + 0.5 * Math.sin(now / 220);
          c.strokeStyle = `rgba(255,255,255,${0.35 + pulse * 0.4})`; c.lineWidth = 0.006;
          c.beginPath(); c.arc(cue.x, cue.y, R * (1.5 + pulse * 0.25), 0, 6.3); c.stroke();
        }
        if (phase !== 'strike') drawGuide(c);
        let pull = power * 0.16;
        if (phase === 'strike') { const f = Math.min(1, (now - strike.t0) / 110); pull *= 1 - f * f; }
        drawCue(c, pull);
      }
    }

    function frame(now) {
      if (!ctx.alive()) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
      sounds = 0;
      if (phase === 'strike' && now - strike.t0 >= 110) startRoll();
      if (phase === 'think' && think) thinkTick(now);
      if (phase === 'roll') {
        rollAcc += dt;
        let moving = true, steps = 0;
        while (rollAcc >= P.DT && steps < 30) {
          const evs = [];
          moving = P.stepPool(s, evs);
          roll(P.DT);
          evs.forEach(onEvent);
          rollAcc -= P.DT; steps++;
          if (!moving) break;
        }
        if (!moving) endRoll();
      }
      render(now);
    }
    showPower(); showSpin(); update();
    raf = requestAnimationFrame(frame);
    if (ctx.ai && s.turn === 1) startThink();

    // state() and bot() are for tests: bot plays a computer shot straight away when it is this phone's turn.
    const bot = () => {
      if (!canAct()) return false;
      const sh = P.aiShot(s, 'medium', Math.random);
      aim = { dx: sh.dx, dy: sh.dy }; power = sh.p; spin = sh.sp;
      if (s.inHand && Number.isFinite(sh.cx)) { s.balls[0].x = sh.cx; s.balls[0].y = sh.cy; }
      shoot();
      return true;
    };
    return {
      destroy() { cancelAnimationFrame(raf); clearInterval(nudgeT); clearTimeout(banT); if (typeof off === 'function') off(); cnv.destroy(); },
      state: () => ({ ...P.packPool(s), phase }), bot,
    };
  },
};

// ---------- Ball pictures ----------
// The cushions as filled shapes: each straight cushion runs back to the rail along its two pocket jaws.
const CUSHION_POLYS = (() => {
  const main = P.CUSHIONS.filter((c) => Math.hypot(c.bx - c.ax, c.by - c.ay) > 0.2);
  const jaws = P.CUSHIONS.filter((c) => !main.includes(c));
  return main.map((m) => {
    const out = [[m.ax, m.ay], [m.bx, m.by]];
    for (const [x, y] of [[m.bx, m.by], [m.ax, m.ay]]) {
      const j = jaws.find((k) => k.ax === x && k.ay === y);
      const depth = Math.abs(m.ay === m.by ? j.by - j.ay : j.bx - j.ax), t = CU / depth;
      out.push([x + (j.bx - j.ax) * t, y + (j.by - j.ay) * t]);
    }
    return out;
  });
})();

function mkCanvas(px) { const c = document.createElement('canvas'); c.width = c.height = px; return c; }
// The numbers 1 to 15 as small alpha masks, read when painting the balls.
const GL = 48;
function glyphs() {
  const cv = mkCanvas(GL), g = cv.getContext('2d', { willReadFrequently: true }), out = [null];
  g.fillStyle = '#000'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let n = 1; n < 16; n++) {
    g.clearRect(0, 0, GL, GL);
    g.font = `800 ${n > 9 ? 24 : 29}px system-ui, sans-serif`;
    g.fillText(String(n), GL / 2, GL / 2 + 2);
    out.push(g.getImageData(0, 0, GL, GL).data);
  }
  return out;
}
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const IVORY = [246, 243, 232];
// light from the top left, a little towards the viewer
const LX = -0.42, LY = -0.58, LZ = -0.70, HL = Math.hypot(LX, LY, LZ - 1);
const HX = LX / HL, HY = LY / HL, HZ = (LZ - 1) / HL;
// Paints one ball as a lit sphere, turned by its rotation matrix m (world = m x ball; world x right, y down
// the screen, z into it): stripe round the ball's z axis, number circles on its x axis (red dots on the cue ball).
function paintBall(cv, n, m, gl) {
  const D = cv.width, g = cv.getContext('2d'), img = g.createImageData(D, D), d = img.data, h = D / 2;
  const col = hex(P.ballColour(n)), stripe = n > 8, mask = gl[n];
  for (let py = 0; py < D; py++) {
    for (let px = 0; px < D; px++) {
      const X = (px + 0.5 - h) / h, Y = (py + 0.5 - h) / h, q = X * X + Y * Y, i = (py * D + px) * 4;
      const dist = Math.sqrt(q), a = Math.min(1, Math.max(0, (1 - dist) * h + 0.5));
      if (a <= 0) { d[i + 3] = 0; continue; }
      const Z = -Math.sqrt(Math.max(0, 1 - q));
      const lx = m[0] * X + m[3] * Y + m[6] * Z, ly = m[1] * X + m[4] * Y + m[7] * Z, lz = m[2] * X + m[5] * Y + m[8] * Z;
      let c = n === 0 ? IVORY : stripe && Math.abs(lz) > 0.64 ? IVORY : col, ink = 0;
      const ax = Math.abs(lx);
      if (n === 0) { if (ax > 0.985) c = [205, 40, 40]; }
      else if (ax > 0.87) {
        c = IVORY;
        if (mask) {
          const u = (lx > 0 ? ly : -ly) / 0.5, v = -lz / 0.5;
          const gx = Math.floor((u * 0.5 + 0.5) * GL), gy = Math.floor((v * 0.5 + 0.5) * GL);
          if (gx >= 0 && gy >= 0 && gx < GL && gy < GL) ink = mask[(gy * GL + gx) * 4 + 3] / 255;
        }
      }
      const diff = Math.max(0, X * LX + Y * LY + Z * LZ), sh = 0.32 + 0.78 * diff;
      const sp = Math.pow(Math.max(0, X * HX + Y * HY + Z * HZ), 40) * 230 + Math.max(0, Y) * Math.max(0, -Z) * 10;
      d[i] = Math.min(255, c[0] * (1 - ink) * sh + 20 * ink + sp);
      d[i + 1] = Math.min(255, c[1] * (1 - ink) * sh + 20 * ink + sp);
      d[i + 2] = Math.min(255, c[2] * (1 - ink) * sh + 20 * ink + sp);
      d[i + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
}
// Turns a 3 x 3 rotation matrix (row major) by angle t about the unit axis (x, y, z), then keeps it square.
function rotate(m, x, y, z, t) {
  const c = Math.cos(t), sn = Math.sin(t), k = 1 - c;
  const r = [c + x * x * k, x * y * k - z * sn, x * z * k + y * sn, y * x * k + z * sn, c + y * y * k, y * z * k - x * sn, z * x * k - y * sn, z * y * k + x * sn, c + z * z * k];
  const o = m.slice();
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i * 3 + j] = r[i * 3] * o[j] + r[i * 3 + 1] * o[3 + j] + r[i * 3 + 2] * o[6 + j];
  // Gram-Schmidt on the columns so rounding never skews the ball
  const col = (j) => [m[j], m[3 + j], m[6 + j]], set = (j, v) => { m[j] = v[0]; m[3 + j] = v[1]; m[6 + j] = v[2]; };
  const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const a = nrm(col(0)), b0 = col(1), dp = a[0] * b0[0] + a[1] * b0[1] + a[2] * b0[2], b = nrm([b0[0] - a[0] * dp, b0[1] - a[1] * dp, b0[2] - a[2] * dp]);
  set(0, a); set(1, b); set(2, [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]);
}
function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
