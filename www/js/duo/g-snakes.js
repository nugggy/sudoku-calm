// Snakes and Ladders: roll and race from 1 to 100, up the ladders and down the snakes.
// Dice: the phone whose turn it is draws the number from ctx.rng and sends it ({k: 'roll', d}), so both phones
// always show the same roll. Against the computer the level makes no difference (it is all luck), so the hub
// skips the level choice (aiLevels: false).
import { LADDERS, SNAKES, snlCell, snlNew, snlRoll } from './snakes-rules.js';
import { frame, mover, canAct, turnText, finish, winText, fx, sleep, PCOL, PSYM } from './tbc-ui.js';
import { who } from './core.js';
import { aiTurn } from './ai-board.js';
import { cbOn, symbolSvg } from '../cb.js';

const PAWN = ['img/duo/pawn_red.webp', 'img/duo/pawn_blue.webp'];
const HEAD = 'img/kenney/animals/snake.png';
// Snake colours: body, darker edge and pattern, and the hue turn that tints the green head picture to match.
const SKINS = [
  { body: '#56b45a', dark: '#2f7a34', hue: 0 },
  { body: '#9273dc', dark: '#5a3fa6', hue: 125 },
  { body: '#ef8c3e', dark: '#b2561a', hue: -105 },
  { body: '#2fa9bd', dark: '#19717f', hue: 50 },
];
// The board in cell units: x 0..10 from the left, y 0..10 from the top, with the start mat below row 1 (y 10..11).
const centre = (n) => { if (!n) return [0.55, 10.55]; const { col, row } = snlCell(n); return [col + 0.5, 9.5 - row]; };

// A snake's body as points from head to tail: a gentle S-curve along the line between the two squares.
function snakePath(head, tail, n = 64) {
  const [hx, hy] = centre(head), [tx, ty] = centre(tail);
  const dx = tx - hx, dy = ty - hy, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
  const waves = Math.max(1, Math.round(len / 1.7)), amp = Math.min(0.42, 0.16 + len * 0.04);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, w = Math.sin(Math.PI * waves * t) * amp * Math.sqrt(Math.sin(Math.PI * t));
    pts.push([hx + dx * t + nx * w, hy + dy * t + ny * w]);
  }
  return pts;
}
const SNAKE_LIST = Object.entries(SNAKES).map(([h, t], i) => ({ head: +h, tail: t, skin: SKINS[i % SKINS.length], pts: snakePath(+h, t) }));
const LADDER_LIST = Object.entries(LADDERS).map(([f, t]) => ({ foot: +f, top: t }));

// Square colours: soft pastel rows, each row in two alternating tones.
const HUES = [32, 150, 205, 268, 345];
const sqCol = (row, col, dark) => {
  const h = HUES[row % HUES.length], alt = (row + col) % 2;
  return dark ? `hsl(${h} ${alt ? 22 : 18}% ${alt ? 25 : 20}%)` : `hsl(${h} ${alt ? 62 : 70}% ${alt ? 86 : 92}%)`;
};

function drawLadder(c, u, { foot, top }) {
  const [x1, y1] = centre(foot), [x2, y2] = centre(top);
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const half = 0.2, lw = 0.085;
  // the rails run a little past the two squares' centres
  const a = [x1 - ux * 0.18, y1 - uy * 0.18], b = [x2 + ux * 0.12, y2 + uy * 0.12];
  const rail = (side, sx = 0, sy = 0) => [[(a[0] + nx * half * side) * u + sx, (a[1] + ny * half * side) * u + sy], [(b[0] + nx * half * side) * u + sx, (b[1] + ny * half * side) * u + sy]];
  c.lineCap = 'round';
  // soft shadow first
  c.strokeStyle = 'rgba(40, 20, 0, .22)'; c.lineWidth = lw * u;
  for (const sd of [-1, 1]) { const [p, q] = rail(sd, u * 0.06, u * 0.09); c.beginPath(); c.moveTo(...p); c.lineTo(...q); c.stroke(); }
  // rungs
  const steps = Math.floor((len + 0.3) / 0.42);
  for (let k = 1; k < steps; k++) {
    const t = k / steps, cx = (a[0] + (b[0] - a[0]) * t) * u, cy = (a[1] + (b[1] - a[1]) * t) * u;
    const g = c.createLinearGradient(cx, cy - u * 0.04, cx, cy + u * 0.04);
    g.addColorStop(0, '#e2ab6c'); g.addColorStop(1, '#a8692f');
    c.strokeStyle = g; c.lineWidth = u * 0.065;
    c.beginPath(); c.moveTo(cx - nx * half * u, cy - ny * half * u); c.lineTo(cx + nx * half * u, cy + ny * half * u); c.stroke();
  }
  // rails, shaded across their width
  for (const sd of [-1, 1]) {
    const [p, q] = rail(sd), g = c.createLinearGradient(p[0] - nx * lw * u / 2, p[1] - ny * lw * u / 2, p[0] + nx * lw * u / 2, p[1] + ny * lw * u / 2);
    g.addColorStop(0, '#f0c287'); g.addColorStop(0.45, '#c88645'); g.addColorStop(1, '#7d4a1f');
    c.strokeStyle = g; c.lineWidth = lw * u;
    c.beginPath(); c.moveTo(...p); c.lineTo(...q); c.stroke();
  }
}

function drawSnake(c, u, s, head) {
  const pts = s.pts.map(([x, y]) => [x * u, y * u]), n = pts.length;
  // normals and a body that tapers from the neck to a point at the tail
  const L = [], R = [], W = [], N = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[Math.max(0, i - 1)], [bx, by] = pts[Math.min(n - 1, i + 1)], len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = -(by - ay) / len, ny = (bx - ax) / len, t = i / (n - 1), w = u * (0.05 + 0.18 * Math.pow(1 - t, 0.8));
    N.push([nx, ny]); W.push(w);
    L.push([pts[i][0] + nx * w, pts[i][1] + ny * w]); R.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
  }
  const outline = () => { c.beginPath(); c.moveTo(...L[0]); L.forEach((p) => c.lineTo(...p)); for (let i = n - 1; i >= 0; i--) c.lineTo(...R[i]); c.closePath(); };
  c.save();
  c.shadowColor = 'rgba(0, 0, 0, .28)'; c.shadowBlur = u * 0.12; c.shadowOffsetX = u * 0.04; c.shadowOffsetY = u * 0.07;
  outline(); c.fillStyle = s.skin.body; c.fill();
  c.restore();
  c.save();
  outline(); c.clip();
  // the darker side, then diamonds down the back, then a soft shine along the other side
  c.lineJoin = 'round'; c.lineCap = 'round';
  const along = (off, from = 0) => { c.beginPath(); for (let i = from; i < n; i++) { const p = [pts[i][0] + N[i][0] * W[i] * off, pts[i][1] + N[i][1] * W[i] * off]; i === from ? c.moveTo(...p) : c.lineTo(...p); } };
  along(-0.75); c.strokeStyle = 'rgba(0, 0, 0, .22)'; c.lineWidth = u * 0.12; c.stroke();
  c.fillStyle = s.skin.dark;
  for (let i = 4; i < n - 3; i += 4) {
    const [x, y] = pts[i], [nx, ny] = N[i], tx = ny, ty = -nx, w = W[i] * 0.62, l = u * 0.11;
    c.globalAlpha = 0.75;
    c.beginPath(); c.moveTo(x + tx * l, y + ty * l); c.lineTo(x + nx * w, y + ny * w); c.lineTo(x - tx * l, y - ty * l); c.lineTo(x - nx * w, y - ny * w); c.closePath(); c.fill();
  }
  c.globalAlpha = 1;
  along(0.45, 2); c.strokeStyle = 'rgba(255, 255, 255, .3)'; c.lineWidth = u * 0.06; c.stroke();
  c.restore();
  outline(); c.strokeStyle = s.skin.dark; c.lineWidth = Math.max(1, u * 0.025); c.stroke();
  // the head picture, turned so the eyes face away from the body and tinted to the snake's colour
  if (head && head.complete && head.naturalWidth) {
    const [hx, hy] = pts[0], [bx, by] = pts[3], ang = Math.atan2(hx - bx, -(hy - by)), sz = u * 0.74;
    c.save();
    c.translate(hx, hy); c.rotate(ang);
    if (s.skin.hue) c.filter = `hue-rotate(${s.skin.hue}deg)`;
    c.drawImage(head, -sz / 2, -sz * 0.55, sz, sz * (head.naturalHeight / head.naturalWidth));
    c.restore();
  }
}

// Draws the board, ladders and snakes into the canvas at css size w (the height is 1.1 w, with the start mat).
function drawBoard(cv, w, head) {
  const dpr = Math.min(3, window.devicePixelRatio || 1), dark = document.documentElement.dataset.theme === 'dark';
  cv.width = Math.round(w * dpr); cv.height = Math.round(w * 1.1 * dpr);
  const c = cv.getContext('2d'), u = (w * dpr) / 10;
  c.clearRect(0, 0, cv.width, cv.height);
  const r = u * 0.3;
  c.save();
  c.beginPath(); c.roundRect(0, 0, u * 10, u * 10, r); c.clip();
  for (let n = 1; n <= 100; n++) {
    const { col, row } = snlCell(n), x = col * u, y = (9 - row) * u;
    c.fillStyle = n === 100 ? (dark ? '#6b5418' : '#ffd870') : sqCol(row, col, dark);
    c.fillRect(x, y, u + 0.5, u + 0.5);
  }
  c.restore();
  c.strokeStyle = dark ? 'rgba(255, 255, 255, .12)' : 'rgba(70, 50, 40, .14)'; c.lineWidth = Math.max(1, dpr);
  c.beginPath(); c.roundRect(0.5, 0.5, u * 10 - 1, u * 10 - 1, r); c.stroke();
  // start mat under square 1
  c.fillStyle = dark ? 'rgba(255, 255, 255, .08)' : 'rgba(70, 50, 40, .08)';
  c.beginPath(); c.roundRect(u * 0.05, u * 10.12, u * 2.2, u * 0.84, u * 0.25); c.fill();
  c.fillStyle = dark ? 'rgba(255, 255, 255, .5)' : 'rgba(70, 50, 40, .5)';
  c.font = `800 ${Math.round(u * 0.24)}px system-ui, sans-serif`; c.textAlign = 'right'; c.textBaseline = 'middle';
  c.fillText('Start', u * 2.1, u * 10.55);
  LADDER_LIST.forEach((l) => drawLadder(c, u, l));
  SNAKE_LIST.forEach((s) => drawSnake(c, u, s, head));
  // the numbers go on top, with a soft halo in the square's colour so they stay readable over the art
  c.textBaseline = 'top'; c.textAlign = 'left'; c.lineJoin = 'round';
  for (let n = 1; n <= 100; n++) {
    const { col, row } = snlCell(n), x = col * u + u * 0.08, y = (9 - row) * u + u * 0.07;
    c.font = `800 ${Math.round(u * (n === 100 ? 0.3 : 0.24))}px system-ui, sans-serif`;
    c.strokeStyle = n === 100 ? (dark ? '#6b5418' : '#ffd870') : sqCol(row, col, dark); c.lineWidth = u * 0.07;
    c.strokeText(String(n), x, y);
    c.fillStyle = dark ? 'rgba(255, 255, 255, .7)' : 'rgba(70, 50, 40, .66)';
    c.fillText(String(n), x, y);
  }
}

// Card art for the hub: a corner of the board with a ladder, a snake and both counters.
const artSnake = () => {
  const p = 'M70 12 C 58 20, 80 30, 66 38 S 64 54, 52 58';
  return `<svg class="sn-art" viewBox="0 0 96 64" aria-hidden="true"><defs><clipPath id="sn-art-c"><rect width="96" height="64" rx="8"/></clipPath></defs>
    <g clip-path="url(#sn-art-c)">${[...Array(24)].map((_, i) => { const x = (i % 6) * 16, y = Math.floor(i / 6) * 16, row = 3 - Math.floor(i / 6); return `<rect x="${x}" y="${y}" width="16" height="16" fill="${sqCol(row, i % 6, false)}"/>`; }).join('')}</g>
    <g stroke-linecap="round"><path d="M14 58 L34 10 M26 62 L46 14" stroke="#a8692f" stroke-width="3"/>${[0, 1, 2, 3, 4].map((k) => { const t = 0.12 + k * 0.19, x = 14 + 20 * t, y = 58 - 48 * t; return `<path d="M${x} ${y} l12 4" stroke="#d29a5c" stroke-width="2.4"/>`; }).join('')}</g>
    <path d="${p}" fill="none" stroke="#2f7a34" stroke-width="8" stroke-linecap="round"/><path d="${p}" fill="none" stroke="#56b45a" stroke-width="5.5" stroke-linecap="round"/><path d="${p}" fill="none" stroke="#2f7a34" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round"/>
    <image href="${HEAD}" x="60" y="1" width="20" height="22"/><image href="${PAWN[0]}" x="76" y="38" width="18" height="18"/><image href="${PAWN[1]}" x="2" y="22" width="18" height="18"/></svg>`;
};

export default {
  id: 'snakes', name: 'Snakes and Ladders', tag: 'Climb the ladders, dodge the snakes', realtime: false, cat: 'board', ai: true, aiLevels: false,
  art: artSnake,
  help: [
    'Race your counter from the start to square 100. Tap the die to roll, and your counter moves that many squares, following the numbers up the board.',
    'Stop at the foot of a ladder to climb it. Stop on a snake\'s head and you slide down to its tail.',
    'A 6 earns another roll. You need the exact number to land on 100: roll too much and you count up to 100, then bounce back the rest of the way.',
    'The first to reach 100 wins. It is all down to the dice, so there are no levels when you play the computer.',
  ],
  create(ctx) {
    const s = snlNew(ctx.first);
    const ui = frame(ctx, 'tbc-snakes');
    let shown = s.pos.slice(), face = 6, fast = false, thinking = false, size = 0;
    const wait = (ms) => sleep(fast ? 0 : ms);
    ui.body.innerHTML = `<div class="sn-board"><canvas></canvas><div class="sn-layer"></div></div>
      <div class="ld-tray"><button class="ld-die" type="button" aria-label="Roll the die"><img alt="" src="img/duo/die_6.webp"></button></div>`;
    const board = ui.body.querySelector('.sn-board'), cv = board.querySelector('canvas'), layer = board.querySelector('.sn-layer');
    const dieBtn = ui.body.querySelector('.ld-die'), dieImg = dieBtn.querySelector('img'), tray = ui.body.querySelector('.ld-tray');
    [1, 2, 3, 4, 5, 6].forEach((n) => { new Image().src = `img/duo/die_${n}.webp`; });
    const head = new Image();
    head.onload = () => { if (size && ctx.alive()) drawBoard(cv, size, head); };
    head.src = HEAD;
    const counters = [0, 1].map((p) => {
      const b = document.createElement('i');
      b.className = `sn-pawn p${p}`;
      b.style.backgroundImage = `url(${PAWN[p]})`;
      b.innerHTML = cbOn() ? symbolSvg(PSYM[p], { size: 12, cls: 'cb-sym ld-sym' }) : '';
      layer.appendChild(b);
      return b;
    });

    // the board fills the width, or the height left over by the bar, status line and die
    const fit = () => {
      const w = ui.body.clientWidth - 24, h = (ui.body.clientHeight - tray.offsetHeight - 24) / 1.1;
      if (w <= 0 || h <= 0) return;
      const sz = Math.floor(Math.min(w, h, 560));
      if (sz === size) return;
      size = sz;
      board.style.width = sz + 'px'; board.style.height = Math.round(sz * 1.1) + 'px';
      drawBoard(cv, sz, head);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(ui.body);

    // Places a counter at a point in cell units; both counters on one square stand side by side.
    const put = (p, [x, y]) => { const b = counters[p]; b.style.left = `${x * 10}%`; b.style.top = `${(y / 11) * 100}%`; b.style.zIndex = Math.round(y * 10) + p; };
    function place() {
      const same = shown[0] === shown[1];
      [0, 1].forEach((p) => {
        const [x, y] = centre(shown[p]);
        put(p, [x + (same ? (p ? 0.2 : -0.2) : shown[p] ? 0 : p * 0.7), y]);
        counters[p].style.setProperty('--sc', same && shown[p] ? 0.85 : 1);
      });
      ui.score(shown);
    }

    // Slides a counter along a list of points (cell units) over ms milliseconds.
    function glide(p, pts, ms) {
      if (fast) return Promise.resolve();
      const b = counters[p];
      b.classList.add('glide');
      return new Promise((done) => {
        const t0 = performance.now();
        const step = (now) => {
          if (!ctx.alive()) return done();
          const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          const f = e * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), k = f - i;
          put(p, [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k]);
          if (t < 1) requestAnimationFrame(step); else { b.classList.remove('glide'); done(); }
        };
        requestAnimationFrame(step);
      });
    }

    function render() {
      place();
      const p = s.turn, act = canAct(ctx, p) && !s.over && !m.busy;
      dieImg.src = `img/duo/die_${face}.webp`;
      dieBtn.style.setProperty('--pc', PCOL[p]);
      dieBtn.classList.toggle('can', act);
      ui.turn(s.over ? -1 : p);
      if (!s.over) ui.status(act ? `${turnText(ctx, p)}: tap the die to roll` : turnText(ctx, p));
      ui.el.querySelector('.tbc-status').classList.toggle('ai-think', !!ctx.ai && p === 1 && !s.over);
    }

    async function tumble(d) {
      dieBtn.classList.add('roll');
      fx(ctx, 'tap');
      for (let k = 0; k < 7; k++) {
        face = 1 + ((face + Math.floor(Math.random() * 5)) % 6);
        dieImg.src = `img/duo/die_${face}.webp`;
        await wait(65);
      }
      face = d; dieImg.src = `img/duo/die_${face}.webp`;
      dieBtn.classList.remove('roll');
      fx(ctx, 'move');
      await wait(260);
    }

    const m = mover(ctx, async (mv) => {
      // the screen keeps showing this player's turn until the roll has played out
      render();
      const p = s.turn, r = snlRoll(s, mv.d);
      if (!r) return;
      await tumble(mv.d);
      // walk square by square (bouncing back from 100 if the roll was too big), then take any ladder or snake
      const b = counters[p];
      for (const n of r.steps) {
        if (n < shown[p] && r.bounce && shown[p] === 100) ctx.toast && ctx.toast('Too far: bounce back');
        shown[p] = n; place();
        b.classList.remove('hop'); void b.offsetWidth; b.classList.add('hop');
        fx(ctx, 'soft');
        await wait(210);
        if (!ctx.alive()) return;
      }
      b.classList.remove('hop');
      if (r.jump) {
        const up = r.jump.kind === 'ladder';
        await wait(160);
        fx(ctx, up ? 'good' : 'bad');
        ctx.toast && ctx.toast(up ? who(ctx, p, 'climb a ladder', 'climbs a ladder') : who(ctx, p, 'slide down a snake', 'slides down a snake'));
        const pts = up ? [centre(r.jump.from), centre(r.jump.to)] : SNAKE_LIST.find((x) => x.head === r.jump.from).pts;
        const dist = up ? Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) : pts.length / 14;
        await glide(p, pts, 380 + dist * 150);
        shown[p] = r.to; place();
      }
      if (s.over) {
        render();
        ui.status(winText(ctx, s.winner)); fx(ctx, 'win');
        finish(ctx, s.winner, winText(ctx, s.winner, ', first to 100'));
      } else if (r.extra) ctx.toast && ctx.toast(who(ctx, p, 'roll again', 'rolls again'));
    }, () => { render(); computer(); });

    // against the computer: it rolls for player 1 after a short pause
    function computer() {
      if (!ctx.ai || s.turn !== 1 || s.over || m.busy || thinking) return;
      thinking = true;
      aiTurn(ctx, () => ({ k: 'roll', d: roll() }), (mv) => { thinking = false; m.local(mv); });
    }
    const roll = () => 1 + Math.floor(ctx.rng() * 6);

    dieBtn.addEventListener('click', () => {
      if (s.over || m.busy) return;
      if (!canAct(ctx, s.turn)) { fx(ctx, 'bad'); return; }
      m.local({ k: 'roll', d: roll() });
    });
    ctx.onMsg((msg) => { if (msg.t === 'mv') m.remote(msg.m); });
    render();
    fit();
    computer();
    // state() and bot() are for tests: bot rolls when it is this phone's turn, without the animations.
    const bot = () => {
      fast = true;
      if (s.over || m.busy || !canAct(ctx, s.turn)) return false;
      m.local({ k: 'roll', d: roll() });
      return true;
    };
    return { destroy() { ro.disconnect(); ctx.root.innerHTML = ''; }, state: () => ({ pos: s.pos, turn: s.turn, over: s.over, winner: s.winner }), bot };
  },
};
