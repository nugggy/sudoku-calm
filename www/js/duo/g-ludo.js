// Ludo: roll a 6 to bring a pawn out, race all four round the board and up your home column.
// Dice: the phone whose turn it is draws the number from ctx.rng and sends it with the roll ({k: 'roll', d}),
// so both phones always show the same roll; the other phone applies exactly what it receives.
import { LUDO, LUDO_TRACK, LUDO_CORNER, ludoCell, ludoNew, ludoRoll, ludoMove, ludoMoves, ludoTarget } from './ludo-rules.js';
import { frame, mover, canAct, turnText, viewer, finish, winText, fx, sleep, PCOL, PSYM } from './tbc-ui.js';
import { who } from './core.js';
import { ludoAi, aiTurn } from './ai-board.js';
import { cbOn, symbolSvg } from '../cb.js';

// Corner colours clockwise from the top left. Player 0 (red) sits bottom left and player 1 (blue) top right;
// the other two corners are drawn faded as in a four-player board.
const COL = ['#4fae6e', PCOL[1], '#f0b93a', PCOL[0]];
const PAWN = ['img/duo/pawn_red.webp', 'img/duo/pawn_blue.webp'];
const USED = new Set(LUDO_CORNER);
const YARD = [[0, 0], [9, 0], [9, 9], [0, 9]];
// Turns a point (in board units, 0 to 15) a quarter clockwise round the centre q times.
const spin = (x, y, q) => { for (let k = 0; k < q; k++) [x, y] = [15 - y, x]; return [x, y]; };
const star = (cx, cy, r, rot) => `<path class="ld-star"${rot ? ` transform="rotate(180 ${cx} ${cy})"` : ''} d="${[...Array(10)].map((_, k) => { const a = (Math.PI / 5) * k - Math.PI / 2, rr = k % 2 ? r * 0.45 : r; return `${k ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(3)} ${(cy + Math.sin(a) * rr).toFixed(3)}`; }).join('')}Z"/>`;

// The board as an SVG in board units, turned half round when player 1 looks at it on their own phone.
function boardSvg(rot = false) {
  const o = ['<rect class="ld-bg" width="15" height="15" rx=".6"/>'];
  const cell = (c, r, fill, idle) => `<rect x="${c + 0.05}" y="${r + 0.05}" width=".9" height=".9" rx=".14" ${fill ? `fill="${fill}"${idle ? ' opacity=".42"' : ''}` : 'class="ld-sq"'}/>`;
  for (let q = 0; q < 4; q++) {
    const [ox, oy] = YARD[q], idle = !USED.has(q);
    o.push(`<g${idle ? ' opacity=".42"' : ''}><rect x="${ox + 0.2}" y="${oy + 0.2}" width="5.6" height="5.6" rx=".55" fill="${COL[q]}"/><rect class="ld-in" x="${ox + 1}" y="${oy + 1}" width="4" height="4" rx=".45"/>
      ${[[2, 2], [4, 2], [2, 4], [4, 4]].map(([x, y]) => `<circle cx="${ox + x}" cy="${oy + y}" r=".62" fill="${COL[q]}" opacity=".3"/>`).join('')}</g>`);
  }
  LUDO_TRACK.forEach(([c, r], a) => {
    const q = a % 13 === 0 ? a / 13 : -1;
    o.push(cell(c, r, q >= 0 ? COL[q] : null, q >= 0 && !USED.has(q)));
    if (a % 13 === 8) o.push(star(c + 0.5, r + 0.5, 0.36, rot)); // stars stay upright when the board is turned
  });
  for (let q = 0; q < 4; q++) {
    for (let k = 1; k <= 5; k++) { const [c, r] = spin(k, 7, q); o.push(cell(c, r, COL[q], !USED.has(q))); }
    // the start squares are safe too: a small ring marks them
    const [sc, sr] = LUDO_TRACK[q * 13];
    o.push(`<circle cx="${sc + 0.5}" cy="${sr + 0.5}" r=".24" fill="none" stroke="#fff" stroke-width=".09" opacity=".9"/>`);
    const tri = [[6, 6], [6, 9], [7.5, 7.5]].map(([x, y]) => spin(x, y, q).join(' ')).join(' ');
    o.push(`<polygon points="${tri}" fill="${COL[q]}"${USED.has(q) ? '' : ' opacity=".42"'}/>`);
  }
  o.push('<rect x="6" y="6" width="3" height="3" fill="none" class="ld-edge"/>');
  return `<svg class="ld-svg" viewBox="0 0 15 15" aria-hidden="true"><g${rot ? ' transform="rotate(180 7.5 7.5)"' : ''}>${o.join('')}</g></svg>`;
}

// Where a pawn stands, in board units: its yard spot, its square, or a row in its triangle when home.
function spot(p, k, rel) {
  const q = LUDO_CORNER[p];
  if (rel < 0) { const [ox, oy] = YARD[q]; return [ox + 2 + (k % 2) * 2, oy + 2 + Math.floor(k / 2) * 2]; }
  if (rel >= LUDO.HOME) return spin(6.62, 6.9 + k * 0.4, q);
  const [c, r] = ludoCell(p, rel);
  return [c + 0.5, r + 0.5];
}

export default {
  id: 'ludo', name: 'Ludo', tag: 'Roll a six, race your pawns home', realtime: false, cat: 'board', ai: true,
  art: () => `<div class="ld-art">${boardSvg()}<i style="left:16%;top:70%;background-image:url(${PAWN[0]})"></i><i style="left:63%;top:24%;background-image:url(${PAWN[1]})"></i><img src="img/duo/die_5.webp" alt=""></div>`,
  help: [
    'Each player has four pawns in their corner. Roll a 6 to bring a pawn out onto your start square, then race it clockwise round the board and up your coloured home column into the centre.',
    'Tap the die to roll, then tap a glowing pawn to move it. A 6 earns another roll, but a third 6 in a row ends your turn. If no pawn can move, the turn passes.',
    'Land on the other player\'s pawn to send it back to their corner. Pawns are safe on the start squares (with a ring) and the squares with a star, and your own pawns can share a square.',
    'You need the exact number to reach home. The first to get all four pawns home wins.',
  ],
  create(ctx) {
    const s = ludoNew(ctx.first);
    const ui = frame(ctx, 'tbc-ludo');
    const rot = viewer(ctx) === 1;
    // shown: where the pawns are drawn (it trails s.pos while a move animates); face: the die face on show
    let shown = s.pos.map((a) => a.slice()), face = 6, fast = false, thinking = false;
    const wait = (ms) => sleep(fast ? 0 : ms);
    ui.body.innerHTML = `<div class="ld-board">${boardSvg(rot)}<div class="ld-layer"></div></div>
      <div class="ld-tray"><button class="ld-die" type="button" aria-label="Roll the die"><img alt="" src="img/duo/die_6.webp"></button></div>`;
    const board = ui.body.querySelector('.ld-board'), layer = ui.body.querySelector('.ld-layer');
    const dieBtn = ui.body.querySelector('.ld-die'), dieImg = dieBtn.querySelector('img'), tray = ui.body.querySelector('.ld-tray');
    [1, 2, 3, 4, 5, 6].forEach((n) => { new Image().src = `img/duo/die_${n}.webp`; });
    const sym = (p) => (cbOn() ? symbolSvg(PSYM[p], { size: 12, cls: 'cb-sym ld-sym' }) : '');
    const pawns = [0, 1].map((p) => [0, 1, 2, 3].map((k) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `ld-pawn p${p}`; b.dataset.p = p; b.dataset.k = k;
      b.style.backgroundImage = `url(${PAWN[p]})`;
      b.innerHTML = sym(p);
      layer.appendChild(b);
      return b;
    }));
    const pct = ([x, y]) => (rot ? [15 - x, 15 - y] : [x, y]).map((v) => `${((v / 15) * 100).toFixed(3)}%`);

    // the board fills the width, or the height left over by the bar, status line and die
    const fit = () => {
      const w = ui.body.clientWidth - 24, h = ui.body.clientHeight - tray.offsetHeight - 24;
      if (w <= 0 || h <= 0) return;
      const sz = Math.floor(Math.min(w, h, 560));
      board.style.width = board.style.height = sz + 'px';
    };
    const ro = new ResizeObserver(fit);
    ro.observe(ui.body);

    // Places every pawn. Pawns sharing a square sit side by side, a little smaller.
    function place() {
      const at = new Map();
      [0, 1].forEach((p) => shown[p].forEach((rel, k) => {
        if (rel < 0 || rel >= LUDO.HOME) return;
        const key = spot(p, k, rel).join();
        if (!at.has(key)) at.set(key, []);
        at.get(key).push([p, k]);
      }));
      [0, 1].forEach((p) => shown[p].forEach((rel, k) => {
        let [x, y] = spot(p, k, rel);
        let sc = rel >= LUDO.HOME ? 0.62 : 1;
        const group = rel >= 0 && rel < LUDO.HOME ? at.get([x, y].join()) : null;
        if (group && group.length > 1) {
          const i = group.findIndex(([pp, kk]) => pp === p && kk === k), n = group.length;
          x += (i - (n - 1) / 2) * (0.62 / Math.max(2, n - 1)) * (rot ? -1 : 1);
          sc = 0.8;
        }
        const [l, t] = pct([x, y]), b = pawns[p][k];
        b.style.left = l; b.style.top = t; b.style.setProperty('--sc', sc);
        b.style.zIndex = Math.round((rot ? 15 - y : y) * 10);
      }));
      ui.score(shown.map((a) => `${a.filter((r) => r >= LUDO.HOME).length}/4`));
    }

    function render() {
      place();
      const p = s.turn, act = canAct(ctx, p) && !s.over && !m.busy;
      const moves = act && s.roll ? ludoMoves(s) : [];
      pawns.forEach((row, pp) => row.forEach((b, k) => {
        const go = pp === p && moves.includes(k);
        b.classList.toggle('go', go);
        b.classList.toggle('only', go && moves.length === 1);
      }));
      // a ring on each square a glowing pawn would reach
      layer.querySelectorAll('.ld-dest').forEach((n) => n.remove());
      const seen = new Set();
      for (const k of moves) {
        const to = ludoTarget(s, p, k, s.roll), xy = to >= LUDO.HOME ? spin(6.62, 7.5, LUDO_CORNER[p]) : spot(p, k, to), key = xy.join();
        if (seen.has(key)) continue;
        seen.add(key);
        const d = document.createElement('i');
        d.className = 'ld-dest';
        [d.style.left, d.style.top] = pct(xy);
        d.style.setProperty('--pc', PCOL[p]);
        layer.appendChild(d);
      }
      dieImg.src = `img/duo/die_${face}.webp`;
      dieBtn.style.setProperty('--pc', PCOL[p]);
      dieBtn.classList.toggle('can', act && !s.roll);
      ui.turn(s.over ? -1 : p);
      if (!s.over) {
        const you = ctx.ai || !ctx.local ? 'You' : ctx.names[p];
        ui.status(!canAct(ctx, p) ? turnText(ctx, p) : m.busy ? turnText(ctx, p) : s.roll ? `${you} rolled ${s.roll}: tap a glowing pawn` : `${turnText(ctx, p)}: tap the die to roll`);
      }
      ui.el.querySelector('.tbc-status').classList.toggle('ai-think', !!ctx.ai && p === 1 && !s.over);
    }

    // The die tumbles through a few faces (just for show) and lands on the number rolled.
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
      const p = s.turn;
      // the screen keeps showing this player's turn until the roll or move has played out
      render();
      if (mv.k === 'roll') {
        const r = ludoRoll(s, mv.d);
        if (!r) return;
        await tumble(mv.d);
        if (r.forfeit) { ctx.toast && ctx.toast('Three 6s in a row: the turn passes'); fx(ctx, 'bad'); await wait(1100); }
        else if (r.pass) { ctx.toast && ctx.toast(who(ctx, p, 'can\'t move', 'can\'t move')); await wait(900); }
        return;
      }
      const r = ludoMove(s, mv.i);
      if (!r) return;
      // step square by square, then send any captured pawn back to its corner
      const b = pawns[p][r.k];
      for (const rel of r.path) {
        shown[p][r.k] = rel; place();
        b.classList.remove('hop'); void b.offsetWidth; b.classList.add('hop');
        fx(ctx, 'soft');
        await wait(r.path.length > 1 ? 170 : 260);
        if (!ctx.alive()) return;
      }
      b.classList.remove('hop');
      if (r.captured.length) {
        fx(ctx, 'good');
        ctx.toast && ctx.toast(who(ctx, p, 'send a pawn back', 'sends a pawn back'));
        for (const j of r.captured) { pawns[1 - p][j].classList.add('back'); shown[1 - p][j] = -1; }
        place();
        await wait(650);
        r.captured.forEach((j) => pawns[1 - p][j].classList.remove('back'));
      } else if (r.home) fx(ctx, 'good');
      shown = s.pos.map((a) => a.slice());
      if (s.over) {
        render();
        ui.status(winText(ctx, s.winner)); fx(ctx, 'win');
        finish(ctx, s.winner, winText(ctx, s.winner, ', all four pawns home'));
      } else if (r.extra) ctx.toast && ctx.toast(who(ctx, p, 'roll again', 'rolls again'));
    }, () => { render(); computer(); });

    // against the computer: it rolls, then picks a pawn, each after a short pause
    function computer() {
      if (!ctx.ai || s.turn !== 1 || s.over || m.busy || thinking) return;
      thinking = true;
      aiTurn(ctx, () => (s.roll ? { k: 'move', i: ludoAi(s, ctx.ai) } : { k: 'roll', d: roll() }), (mv) => { thinking = false; m.local(mv); });
    }
    const roll = () => 1 + Math.floor(ctx.rng() * 6);

    dieBtn.addEventListener('click', () => {
      if (s.over || m.busy) return;
      if (!canAct(ctx, s.turn) || s.roll) { fx(ctx, 'bad'); return; }
      m.local({ k: 'roll', d: roll() });
    });
    layer.addEventListener('click', (e) => {
      const b = e.target.closest('.ld-pawn');
      if (!b || s.over || m.busy) return;
      const p = +b.dataset.p, k = +b.dataset.k;
      if (!canAct(ctx, s.turn) || !s.roll) { fx(ctx, 'bad'); return; }
      // a tap on a pawn sharing a square with a legal one of the same player moves the legal one
      const moves = ludoMoves(s);
      const pick = p !== s.turn ? -1 : moves.includes(k) ? k : moves.find((j) => s.pos[p][j] === s.pos[p][k] && s.pos[p][k] >= 0);
      if (pick === undefined || pick < 0) { fx(ctx, 'bad'); return; }
      m.local({ k: 'move', i: pick });
    });
    ctx.onMsg((msg) => { if (msg.t === 'mv') m.remote(msg.m); });
    render();
    fit();
    computer();
    // state() and bot() are for tests: bot plays a random legal roll or move when it is this phone's turn, without the animations.
    const bot = () => {
      fast = true;
      if (s.over || m.busy || !canAct(ctx, s.turn)) return false;
      const moves = ludoMoves(s);
      m.local(s.roll ? { k: 'move', i: moves[Math.floor(Math.random() * moves.length)] } : { k: 'roll', d: roll() });
      return true;
    };
    return { destroy() { ro.disconnect(); ctx.root.innerHTML = ''; }, state: () => ({ pos: s.pos, turn: s.turn, roll: s.roll, over: s.over, winner: s.winner }), bot };
  },
};
