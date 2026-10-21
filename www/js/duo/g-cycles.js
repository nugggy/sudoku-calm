// Light Cycles: two riders leave walls of light behind them. Swipe to turn; whoever crashes into a
// wall or a trail loses the round. First to 5.
import { stage, session, touches, keys, COL, play, vib, winText, img } from './rtd-kit.js';
import { cbOn, drawSymbol, symbolSvg } from '../cb.js';

// Colourblind mode: a symbol for each rider (on the bike and in the score bar), and player 1's wall is hollow.
const CSYM = ['ring', 'cross'];

// Riders are the Kenney Racing Pack motorbikes (CC0), drawn nose first in the direction of travel.
let BIKE = null; // loaded when a game starts, so the rules can still run in Node tests

export const GW = 28, GH = 44, TO = 5;
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];           // 0 up, 1 right, 2 down, 3 left (board coordinates)
const KEY_DIR = { up: 0, right: 1, down: 2, left: 3 };

// ---------- rules (host) ----------
export function cyclesInit() {
  const s = { grid: new Uint8Array(GW * GH), p: [], q: [[], []], r: 0, sc: [0, 0], ph: 'count', tm: 0, mv: [[], []], w: null, acc: 0, run: 0, speed: 5 };
  cyclesReset(s);
  return s;
}
export function cyclesReset(s) {
  s.grid.fill(0);
  s.p = [{ x: 9, y: GH - 5, d: 0, a: 1 }, { x: GW - 10, y: 4, d: 2, a: 1 }];
  s.q = [[], []]; s.mv = [[], []];
  s.p.forEach((p, i) => { s.grid[p.y * GW + p.x] = i + 1; s.mv[i].push(p.x, p.y); });
  s.ph = 'count'; s.tm = 100; s.r++; s.acc = 0; s.run = 0; s.speed = 5; s.w = null;
}
export function cyclesTurn(s, p, d) {
  if (s.ph === 'end' || !s.p[p].a || !(d >= 0 && d <= 3)) return;
  if (s.q[p].length < 3) s.q[p].push(d);
}
// one move of both riders; returns the round winner (0, 1), -1 for a double crash, or undefined if both live
export function cyclesMove(s) {
  const nx = [], ny = [], dead = [false, false];
  for (let i = 0; i < 2; i++) {
    const p = s.p[i];
    // skip queued turns that would reverse or repeat the heading
    while (s.q[i].length) { const d = s.q[i].shift(); if (d !== p.d && d !== (p.d + 2) % 4) { p.d = d; break; } }
    nx[i] = p.x + DX[p.d]; ny[i] = p.y + DY[p.d];
    if (nx[i] < 0 || ny[i] < 0 || nx[i] >= GW || ny[i] >= GH || s.grid[ny[i] * GW + nx[i]]) dead[i] = true;
  }
  if (nx[0] === nx[1] && ny[0] === ny[1]) dead[0] = dead[1] = true;
  for (let i = 0; i < 2; i++) {
    const p = s.p[i];
    if (dead[i]) { p.a = 0; continue; }
    p.x = nx[i]; p.y = ny[i];
    s.grid[p.y * GW + p.x] = i + 1; s.mv[i].push(p.x, p.y);
  }
  if (dead[0] && dead[1]) return -1;
  if (dead[0]) return 1;
  if (dead[1]) return 0;
  return undefined;
}

export const cyclesSpec = {
  init: cyclesInit,
  input: () => null,
  action: (s, p, a) => cyclesTurn(s, p, a.d),
  step(s, _in, ev) {
    if (s.ph === 'count') { if (--s.tm <= 0) { s.ph = 'run'; ev({ k: 'go' }); } return; }
    if (s.ph === 'over') {
      if (--s.tm <= 0) { if (Math.max(...s.sc) >= TO) s.ph = 'end'; else { cyclesReset(s); ev({ k: 'round', r: s.r }); } }
      return;
    }
    if (s.ph !== 'run') return;
    s.run++;
    // speed up a little every 8 seconds so rounds cannot last for ever
    s.speed = s.run > 960 ? 3 : s.run > 480 ? 4 : 5;
    if (++s.acc < s.speed) return;
    s.acc = 0;
    const w = cyclesMove(s);
    if (w === undefined) return;
    s.w = w < 0 ? null : w;
    if (s.w !== null) s.sc[s.w]++;
    s.ph = 'over'; s.tm = 110;
    ev({ k: 'crash', w: s.w, at: s.p.map((p) => [p.x, p.y, p.a]) });
  },
  result: (s) => (s.ph === 'end' ? { winner: s.sc[0] > s.sc[1] ? 0 : 1, sc: s.sc } : null),
  snap(s) {
    const d = { p: s.p.map((p) => [p.x, p.y, p.d, p.a]), m: s.mv, r: s.r, sc: s.sc.slice(), ph: s.ph, tm: s.tm, w: s.w };
    s.mv = [[], []];
    return d;
  },
  apply(gs, d) {
    if (!gs || gs.r !== d.r) gs = { grid: new Uint8Array(GW * GH), r: d.r };
    d.m.forEach((cells, i) => { for (let k = 0; k < cells.length; k += 2) gs.grid[cells[k + 1] * GW + cells[k]] = i + 1; });
    gs.p = d.p.map(([x, y, dd, a]) => ({ x, y, d: dd, a }));
    gs.sc = d.sc; gs.ph = d.ph; gs.tm = d.tm; gs.w = d.w;
    return gs;
  },
};

// ---------- screen ----------
export const cyclesCardArt = () => `<svg class="rtd-art" viewBox="0 0 120 80" aria-hidden="true"><rect width="120" height="80" rx="10" fill="#0b1124"/>
  <path d="M10 70V40H44V18H70" stroke="${COL[0]}" stroke-width="5" fill="none" stroke-linejoin="round" stroke-linecap="round"/><path d="M110 10V34H80V58H58" stroke="${COL[1]}" stroke-width="5" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
  <image href="img/duo/cycle_red.webp" x="66" y="9" width="8" height="18" transform="rotate(90 70 18)"/><image href="img/duo/cycle_blue.webp" x="54" y="49" width="8" height="18" transform="rotate(-90 58 58)"/></svg>`;

function create(ctx) {
  BIKE = BIKE || [img('img/duo/cycle_red.webp'), img('img/duo/cycle_blue.webp')];
  const st = stage(ctx, 'rtd-cycles');
  const flip = () => !ctx.local && ctx.me === 1;
  if (cbOn()) {
    const me = ctx.local ? 0 : ctx.me;
    [['.rtd-top i', 1 - me], ['.rtd-bot i', me]].forEach(([sel, p]) => { const d = st.wrap.querySelector(sel); if (d) { d.classList.add('cb-dot'); d.innerHTML = symbolSvg(CSYM[p], { size: 12 }); } });
  }
  let crashFx = null, dead = false;
  const ses = session(ctx, cyclesSpec, {
    event(e) {
      if (e.k === 'go') { st.banner('Go', '', 700); play(ctx, 'place'); }
      if (e.k === 'round') st.hideBanner();
      if (e.k === 'crash') {
        crashFx = { at: e.at, t: performance.now() };
        play(ctx, 'error'); vib(ctx, 80);
        const names = ctx.names || ['Player 1', 'Player 2'];
        st.banner(e.w == null ? 'Both crashed' : `${names[e.w]} wins the round`, '', 1600);
      }
    },
    draw(s) { if (s && s.p) draw(s); },
  });
  const turn = (p, d) => { if (!dead) ses.act(p, { d }); play(ctx, 'tap'); };

  // swipes: each 22 px of travel in a new direction is a turn, so one gesture can make a zig-zag
  const start = new Map();
  const unT = touches(st.cv, ctx, st.view, flip, {
    down: (p, x, y, id) => start.set(id, { x, y }),
    move: (p, x, y, id) => {
      const a = start.get(id); if (!a) return;
      const dx = x - a.x, dy = y - a.y;
      if (Math.hypot(dx, dy) < 22) return;
      turn(p, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
      start.set(id, { x, y });
    },
    up: (p, x, y, id) => start.delete(id),
  });
  const unK = keys(ctx, { down: (p, k) => { if (KEY_DIR[k] === undefined) return; let d = KEY_DIR[k]; if (flip() && p === ctx.me) d = (d + 2) % 4; turn(p, d); } });

  function draw(s) {
    const { g, view } = st, W = view.W, H = view.H;
    const c = Math.floor(Math.min(W / GW, H / GH) * 10) / 10, bw = c * GW, bh = c * GH, ox = (W - bw) / 2, oy = (H - bh) / 2;
    st.begin(flip());
    g.fillStyle = '#0b1124'; g.fillRect(ox, oy, bw, bh);
    g.strokeStyle = 'rgba(120,160,255,.08)'; g.lineWidth = 1; g.beginPath();
    for (let x = 0; x <= GW; x++) { g.moveTo(ox + x * c, oy); g.lineTo(ox + x * c, oy + bh); }
    for (let y = 0; y <= GH; y++) { g.moveTo(ox, oy + y * c); g.lineTo(ox + bw, oy + y * c); }
    g.stroke();
    g.strokeStyle = 'rgba(160,190,255,.55)'; g.lineWidth = 2; g.strokeRect(ox, oy, bw, bh);
    for (let i = 0; i < 2; i++) {
      g.fillStyle = COL[i]; g.shadowColor = COL[i]; g.shadowBlur = c * 0.8;
      for (let k = 0; k < s.grid.length; k++) if (s.grid[k] === i + 1) g.fillRect(ox + (k % GW) * c + 1, oy + Math.floor(k / GW) * c + 1, c - 2, c - 2);
    }
    g.shadowBlur = 0;
    const cb = cbOn();
    if (cb) {
      // player 1's wall gets a dark hole in every block, so the two walls differ by pattern as well as colour
      const h = Math.max(2, c * 0.4), o = (c - h) / 2;
      g.fillStyle = '#0b1124';
      for (let k = 0; k < s.grid.length; k++) if (s.grid[k] === 2) g.fillRect(ox + (k % GW) * c + o, oy + Math.floor(k / GW) * c + o, h, h);
    }
    s.p.forEach((p, i) => {
      const cx = ox + (p.x + 0.5) * c, cy = oy + (p.y + 0.5) * c;
      const bk = BIKE[i];
      if (bk.complete && bk.naturalWidth) {
        const bh2 = c * 2.6, bw2 = bh2 * bk.naturalWidth / bk.naturalHeight;
        g.save(); g.translate(cx, cy); g.rotate(p.d * Math.PI / 2); if (!p.a) g.globalAlpha = 0.45;
        g.drawImage(bk, -bw2 / 2, -bh2 / 2, bw2, bh2); g.restore();
      } else {
        g.fillStyle = p.a ? '#fff' : '#555'; g.beginPath(); g.arc(cx, cy, c * 0.62, 0, Math.PI * 2); g.fill();
        g.strokeStyle = COL[i]; g.lineWidth = 2.5; g.stroke();
        if (p.a) { g.fillStyle = COL[i]; g.beginPath(); g.arc(cx + DX[p.d] * c * 0.3, cy + DY[p.d] * c * 0.3, c * 0.2, 0, Math.PI * 2); g.fill(); }
      }
      // both symbols look the same upside down, so they read correctly on the flipped board too
      if (cb) { g.save(); if (!p.a) g.globalAlpha = 0.6; drawSymbol(g, CSYM[i], cx, cy, Math.max(5, c * 0.75), '#fff', 'rgba(0,0,0,.7)'); g.restore(); }
    });
    if (crashFx && s.ph === 'over') {
      const t = (performance.now() - crashFx.t) / 600;
      crashFx.at.forEach(([x, y, a]) => {
        if (a) return;
        g.strokeStyle = `rgba(255,255,255,${Math.max(0, 1 - t)})`; g.lineWidth = 3;
        g.beginPath(); g.arc(ox + (x + 0.5) * c, oy + (y + 0.5) * c, c * (1 + t * 4), 0, Math.PI * 2); g.stroke();
      });
    }
    st.plain();
    if (s.ph === 'count' && s.tm > 0) {
      g.fillStyle = 'rgba(255,255,255,.92)'; g.font = `800 ${Math.round(c * 6)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(Math.ceil(s.tm / 34)), W / 2, H / 2);
      g.font = `700 ${Math.round(c * 1.3)}px system-ui, sans-serif`; g.fillText('Swipe to turn', W / 2, H / 2 + c * 4.5);
    }
    st.score(s.sc, `First to ${TO}`);
  }

  return { destroy() { dead = true; ses.destroy(); unT(); unK(); st.destroy(); } };
}

export default {
  id: 'cycles', name: 'Light Cycles', tag: 'Box your rival in with walls of light', realtime: true, cat: 'action',
  art: cyclesCardArt,
  help: [
    'You each ride a light cycle that leaves a glowing wall behind it. Swipe up, down, left or right to turn.',
    'Crash into a wall, the edge or a trail and your rival wins the round. If you both crash at once, nobody scores.',
    'The cycles speed up the longer a round goes. First to 5 rounds wins.',
  ],
  create,
};
