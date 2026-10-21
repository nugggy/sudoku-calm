// Roulette: single-zero wheel. Tap the table to place chips on any bet, spin, and watch the ball settle.
// The number is drawn fairly before the spin starts and the animation is made to land on it.
import { el, $ } from '../ui.js';
import { WHEEL, colourOf, rouletteNums, rouletteReturn, roulettePays, rouletteLabel, makeRng } from './rb-engine.js';
import { rbSound } from './rb-sound.js';
import { store, save } from '../store.js';
import { cbOn } from '../cb.js';

const rng = makeRng();
const at = (r, c) => r * 3 + c + 1;
const asc = (...a) => a.sort((x, y) => x - y).join('-');
const E = 0.27; // how close to a line counts as a split, street or corner

// Bet key for a tap at grid position (gx, gy) in cell units; gy below 0 is the zero cell.
function keyAt(gx, gy) {
  gx = Math.max(0, Math.min(2.999, gx));
  if (gy < -E) return 'n:0';
  if (gy < 0) gy = 0; // just above row 0 counts as its top edge
  gy = Math.min(11.999, gy);
  const c = Math.floor(gx), r = Math.floor(gy), fx = gx - c, fy = gy - r;
  const vx = fx < E ? c : fx > 1 - E ? c + 1 : null, hy = fy < E ? r : fy > 1 - E ? r + 1 : null;
  if (vx != null && hy != null) {
    if (hy === 0) return ['q:0-1-2-3', 't:0-1-2', 't:0-2-3', 's:0-3'][vx];
    if (vx === 0) return hy === 12 ? `t:${asc(at(11, 0), at(11, 1), at(11, 2))}` : `l:${hy - 1}`;
    if (vx === 3) return hy === 12 ? `n:${at(11, 2)}` : `s:${asc(at(hy - 1, 2), at(hy, 2))}`;
    if (hy === 12) return `s:${asc(at(11, vx - 1), at(11, vx))}`;
    return `q:${asc(at(hy - 1, vx - 1), at(hy - 1, vx), at(hy, vx - 1), at(hy, vx))}`;
  }
  if (vx != null) {
    if (vx === 0) return `t:${asc(at(r, 0), at(r, 1), at(r, 2))}`;
    if (vx === 3) return `n:${at(r, 2)}`;
    return `s:${asc(at(r, vx - 1), at(r, vx))}`;
  }
  if (hy != null) {
    if (hy === 0) return `s:0-${c + 1}`;
    if (hy === 12) return `n:${at(11, c)}`;
    return `s:${asc(at(hy - 1, c), at(hy, c))}`;
  }
  return `n:${at(r, c)}`;
}
// Where a chip sits for an inside bet, in cell units (same frame as keyAt).
function spotOf(key) {
  const [k] = key.split(':'), nums = rouletteNums(key);
  const pos = (n) => [((n - 1) % 3) + 0.5, Math.floor((n - 1) / 3) + 0.5];
  if (k === 'n') return nums[0] === 0 ? [1.5, -0.5] : pos(nums[0]);
  if (k === 'l') { const r = Math.floor((nums[0] - 1) / 3); return [0, r + 1]; }
  if (nums[0] === 0) {
    if (k === 's') return [nums[1] - 0.5, 0];
    if (k === 't') return [nums[2] === 2 ? 1 : 2, 0];
    return [0, 0];
  }
  if (k === 't') return [0, Math.floor((nums[0] - 1) / 3) + 0.5];
  const ps = nums.map(pos);
  return [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length];
}

const OUTSIDE = [['low', '1-18'], ['even', 'Even'], ['red', ''], ['black', ''], ['odd', 'Odd'], ['high', '19-36']];

export default {
  id: 'roulette', name: 'Roulette', tag: 'Single zero, every bet on the table',
  art: () => `<svg viewBox="0 0 100 100" class="rb-art-wheel">${wheelSVG()}</svg>`,
  help: [
    'Pick a chip, then tap the table to place it. Tap a number for a straight bet (35 to 1), the line between two numbers for a split (17 to 1), the left edge of a row for a street (11 to 1), a corner where four numbers meet (8 to 1) or the left edge between two rows for a six line (5 to 1).',
    'Outside bets: dozens and columns pay 2 to 1. Red, black, odd, even, 1 to 18 and 19 to 36 pay even money. Zero loses every outside bet.',
    'Tap Spin. The number is drawn fairly the moment you spin, and the ball is shown landing on it. Rebet places your last bets again, Undo takes back the last chip and Clear takes them all back.',
    'The wheel has one zero, so the house edge is 2.7% on every bet. These are play chips only.',
  ],
  create(ctx) {
    const { root, wallet, ui } = ctx;
    const R = store.casino || {};
    const st = R.roulette || (R.roulette = { history: [], last: null });
    let bets = {}, order = [], spinning = false, alive = true;
    root.innerHTML = '';
    const node = el(`<div class="rb rl">
      <div class="rb-top"><div class="rl-hist" data-el="hist"></div></div>
      <div class="rl-info" data-el="info">Pick a chip and tap the table</div>
      <div class="rl-tablewrap" data-el="wrap"><div class="rl-table" data-el="table">
        <div class="rl-dozens">${[1, 2, 3].map((d) => `<button class="rl-out" data-bet="dz:${d}">${['1st 12', '2nd 12', '3rd 12'][d - 1]}</button>`).join('')}</div>
        <div class="rl-main"><div class="rl-zero" data-el="zero"><span class="rl-num green">0</span></div>
          <div class="rl-grid" data-el="grid">${[...Array(12)].map((_, r) => [0, 1, 2].map((c) => { const n = at(r, c); return `<div class="rl-cell"><span class="rl-num ${colourOf(n)}">${n}</span></div>`; }).join('')).join('')}</div>
          <div class="rl-cols">${[1, 2, 3].map((c) => `<button class="rl-out" data-bet="col:${c}">2 to 1</button>`).join('')}</div>
          <div class="rl-chips" data-el="chips"></div></div>
        <div class="rl-outside">${OUTSIDE.map(([k, t]) => `<button class="rl-out ${k}" data-bet="${k}">${k === 'red' || k === 'black' ? `<i></i><span class="rl-cbw">${k === 'red' ? 'Red' : 'Black'}</span>` : t}</button>`).join('')}</div>
      </div></div>
      <div class="rb-bar"><div data-el="picker"></div>
        <div class="rb-actions"><button class="cs-btn" data-act="undo">Undo</button><button class="cs-btn" data-act="clear">Clear</button><button class="cs-btn" data-act="rebet">Rebet</button><button class="cs-btn gold" data-act="spin">Spin</button></div>
        <div class="rb-total" data-el="total"></div></div>
      <div class="rl-wheelbox" data-el="wheelbox" hidden><canvas data-el="wheel"></canvas><div class="rl-result" data-el="result"></div></div>
    </div>`);
    root.appendChild(node);
    const q = (k) => $(`[data-el="${k}"]`, node);
    const picker = ui.betPicker({}); q('picker').appendChild(picker);
    const grid = q('grid'), zero = q('zero'), chips = q('chips');

    const total = () => Object.values(bets).reduce((a, b) => a + b, 0);
    function renderBets() {
      const g = grid.getBoundingClientRect(), base = chips.getBoundingClientRect();
      const cw = g.width / 3, ch = g.height / 12, ox = g.left - base.left, oy = g.top - base.top;
      chips.innerHTML = Object.entries(bets).filter(([k]) => /^(n|s|t|q|l):/.test(k)).map(([k, v]) => {
        const [x, y] = spotOf(k);
        return `<div class="rl-chip" style="left:${ox + x * cw}px;top:${oy + y * ch}px">${chipHTML(v)}</div>`;
      }).join('');
      node.querySelectorAll('[data-bet]').forEach((b) => { const v = bets[b.dataset.bet]; b.querySelector('.rl-chip')?.remove(); if (v) b.insertAdjacentHTML('beforeend', `<div class="rl-chip in">${chipHTML(v)}</div>`); });
      q('total').textContent = total() ? `Bet ${ui.fmt(total())}` : '';
    }
    function chipHTML(v) {
      const top = [...ui.CHIPS].reverse().find((c) => c <= v) || ui.CHIPS[0];
      return `<img src="${ui.chipImg(top)}" alt=""><b>${v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'K' : v}</b>`;
    }
    function renderHistory() {
      const h = st.history.slice(-12).reverse();
      const counts = {}; st.history.slice(-100).forEach((n) => { counts[n] = (counts[n] || 0) + 1; });
      const seen = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const hot = seen.slice(0, 3).map(([n]) => +n), cold = [...Array(37).keys()].filter((n) => !counts[n]).slice(0, 3);
      q('hist').innerHTML = `<div class="rl-recent">${h.map((n, i) => `<span class="rl-ball ${colourOf(n)} ${i ? '' : 'last'}">${n}</span>`).join('') || '<small>No spins yet</small>'}</div>
        ${st.history.length >= 10 ? `<div class="rl-hc"><small>Hot</small>${hot.map((n) => `<span class="rl-ball sm ${colourOf(n)}">${n}</span>`).join('')}<small>Cold</small>${(cold.length ? cold : seen.slice(-3).map(([n]) => +n)).map((n) => `<span class="rl-ball sm ${colourOf(n)}">${n}</span>`).join('')}</div>` : ''}`;
    }
    async function place(key) {
      if (spinning) return;
      const v = picker.selected();
      if (!(await ui.needChips(ctx, v))) return;
      if (!wallet.take(v)) return;
      bets[key] = (bets[key] || 0) + v; order.push([key, v]);
      rbSound.chip(); ctx.buzz(8);
      q('info').textContent = `${rouletteLabel(key)} pays ${roulettePays(key)} to 1 · ${ui.fmt(bets[key])} on it`;
      renderBets();
    }
    function undo() { const o = order.pop(); if (!o) return; const [k, v] = o; bets[k] -= v; if (!bets[k]) delete bets[k]; wallet.give(v); ctx.sfx.erase(); renderBets(); }
    function clear() { const t = total(); if (!t) return; wallet.give(t); bets = {}; order = []; ctx.sfx.erase(); renderBets(); q('info').textContent = 'Bets cleared'; }
    async function rebet() {
      if (spinning || !st.last) return;
      const t = Object.values(st.last).reduce((a, b) => a + b, 0);
      if (!(await ui.needChips(ctx, t))) return;
      if (!wallet.take(t)) return;
      for (const [k, v] of Object.entries(st.last)) { bets[k] = (bets[k] || 0) + v; order.push([k, v]); }
      rbSound.chip(); renderBets(); q('info').textContent = `Placed last bets again (${ui.fmt(t)})`;
    }

    grid.addEventListener('click', (e) => { const g = grid.getBoundingClientRect(); place(keyAt((e.clientX - g.left) / (g.width / 3), (e.clientY - g.top) / (g.height / 12))); });
    zero.addEventListener('click', (e) => { const z = zero.getBoundingClientRect(), g = grid.getBoundingClientRect(); place(keyAt((e.clientX - g.left) / (g.width / 3), -1 + (e.clientY - z.top) / z.height)); });
    node.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bet]'); if (b) return place(b.dataset.bet);
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'undo') undo(); else if (a === 'clear') clear(); else if (a === 'rebet') rebet(); else if (a === 'spin') spin();
    });

    // ----- the wheel -----
    const box = q('wheelbox'), cv = q('wheel'), c2 = cv.getContext('2d');
    async function spin() {
      if (spinning) return;
      if (!total()) { ctx.toast('Place a bet first'); return; }
      spinning = true; node.classList.add('spinning');
      const pocket = rng.int(37), n = WHEEL[pocket]; // drawn now, before any animation
      st.last = { ...bets }; save();
      box.hidden = false; q('result').textContent = ''; q('result').className = 'rl-result';
      const size = Math.min(box.clientWidth - 24, box.clientHeight - 90, 420), dpr = Math.min(3, window.devicePixelRatio || 1);
      cv.width = size * dpr; cv.height = size * dpr; cv.style.width = cv.style.height = size + 'px';
      await animateWheel(c2, size, dpr, pocket, () => alive);
      if (!alive) return;
      st.history.push(n); if (st.history.length > 200) st.history.shift(); save();
      const ret = Object.entries(bets).reduce((a, [k, v]) => a + rouletteReturn(k, v, n), 0), staked = total(), net = ret - staked;
      q('result').innerHTML = `<span class="rl-ball big ${colourOf(n)}">${n}</span><b>${n === 0 ? 'Zero' : `${colourOf(n) === 'red' ? 'Red' : 'Black'} ${n % 2 ? 'odd' : 'even'}`}</b>`;
      q('result').classList.add('show');
      await wait(1400);
      if (!alive) return;
      box.hidden = true;
      // highlight the winning number and pay out
      const cells = grid.querySelectorAll('.rl-cell'); const cellEl = n ? cells[n - 1] : zero;
      cellEl.classList.add('rl-hit'); setTimeout(() => cellEl.classList.remove('rl-hit'), 2600);
      if (ret) { wallet.give(ret); rbSound.chime(); }
      ctx.stats.record(net > 0 ? 'win' : net < 0 ? 'lose' : 'push', net);
      ui.banner(root, { text: net > 0 ? `${n} wins` : ret ? `${n}: some back` : `${n}: no win`, amount: net > 0 ? net : ret ? ret : 0, win: net > 0 });
      q('info').textContent = ret ? `Paid ${ui.fmt(ret)} on ${n}` : `${n} ${n ? colourOf(n) : 'green'}. Tap Rebet to go again.`;
      bets = {}; order = []; renderBets(); renderHistory();
      spinning = false; node.classList.remove('spinning');
    }

    const ro = new ResizeObserver(() => renderBets()); ro.observe(grid);
    renderHistory(); renderBets();
    return { destroy() { alive = false; ro.disconnect(); const t = total(); if (t && !spinning) wallet.give(t); } };
  },
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- wheel drawing ----------
const TAU = Math.PI * 2, SEG = TAU / 37;
function wheelSVG() {
  // small static wheel for the hub card
  const parts = WHEEL.map((n, i) => {
    const a0 = i * SEG - Math.PI / 2 - SEG / 2, a1 = a0 + SEG, r = 46;
    const p = (a, rr) => `${50 + Math.cos(a) * rr},${50 + Math.sin(a) * rr}`;
    return `<path d="M${p(a0, 30)}L${p(a0, r)}A${r},${r} 0 0 1 ${p(a1, r)}L${p(a1, 30)}A30,30 0 0 0 ${p(a0, 30)}Z" fill="${n === 0 ? '#1d8f4e' : colourOf(n) === 'red' ? '#c8102e' : '#1b1b1f'}"/>`;
  }).join('');
  return `<circle cx="50" cy="50" r="49" fill="#7a4a1f"/>${parts}<circle cx="50" cy="50" r="30" fill="#a8722f"/><circle cx="50" cy="50" r="22" fill="#c9954c"/><circle cx="50" cy="50" r="6" fill="#f2d48a"/><circle cx="62" cy="14" r="3.4" fill="#fff"/>`;
}
function drawWheel(g, size, rot, ballA, ballR, t) {
  const c = size / 2, R = size * 0.48;
  g.clearRect(0, 0, size, size);
  // wooden rim and ball track
  let gr = g.createRadialGradient(c, c, R * 0.7, c, c, R);
  gr.addColorStop(0, '#5b3414'); gr.addColorStop(0.7, '#8a5a2b'); gr.addColorStop(1, '#3a200b');
  g.fillStyle = gr; g.beginPath(); g.arc(c, c, R, 0, TAU); g.fill();
  g.fillStyle = '#2a1608'; g.beginPath(); g.arc(c, c, R * 0.86, 0, TAU); g.fill();
  gr = g.createRadialGradient(c, c - R * 0.2, R * 0.2, c, c, R * 0.85); gr.addColorStop(0, '#d9c7a6'); gr.addColorStop(1, '#8c7752');
  g.fillStyle = gr; g.beginPath(); g.arc(c, c, R * 0.84, 0, TAU); g.fill();
  // pockets
  g.save(); g.translate(c, c); g.rotate(rot);
  const r0 = R * 0.5, r1 = R * 0.74, rn = R * 0.66;
  const cb = cbOn(); // colourblind mode: a small white dot marks each red pocket
  WHEEL.forEach((n, i) => {
    const a0 = i * SEG - Math.PI / 2 - SEG / 2, a1 = a0 + SEG;
    g.fillStyle = n === 0 ? '#1d8f4e' : colourOf(n) === 'red' ? '#c8102e' : '#1b1b1f';
    g.beginPath(); g.arc(0, 0, r1, a0, a1); g.arc(0, 0, r0, a1, a0, true); g.closePath(); g.fill();
    g.strokeStyle = '#e8c56a'; g.lineWidth = Math.max(1, size * 0.004); g.beginPath(); g.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0); g.lineTo(Math.cos(a0) * r1, Math.sin(a0) * r1); g.stroke();
    g.save(); g.rotate(i * SEG); g.fillStyle = '#fff'; g.font = `700 ${Math.round(size * 0.034)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(n), 0, -rn);
    if (cb && colourOf(n) === 'red') { g.beginPath(); g.arc(0, -R * 0.55, size * 0.008, 0, TAU); g.fill(); }
    g.restore();
  });
  g.strokeStyle = '#e8c56a'; g.lineWidth = size * 0.008; g.beginPath(); g.arc(0, 0, r1, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, r0, 0, TAU); g.stroke();
  // cone and turret
  gr = g.createRadialGradient(-R * 0.1, -R * 0.12, R * 0.05, 0, 0, r0); gr.addColorStop(0, '#e2b56a'); gr.addColorStop(1, '#7a4a1f');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r0 * 0.96, 0, TAU); g.fill();
  g.strokeStyle = '#f2d48a'; g.lineWidth = size * 0.012;
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; g.beginPath(); g.moveTo(Math.cos(a) * R * 0.06, Math.sin(a) * R * 0.06); g.lineTo(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3); g.stroke(); }
  g.fillStyle = '#f7dc96'; g.beginPath(); g.arc(0, 0, R * 0.08, 0, TAU); g.fill();
  g.restore();
  // ball
  const bx = c + Math.cos(ballA - Math.PI / 2) * ballR * R, by = c + Math.sin(ballA - Math.PI / 2) * ballR * R, br = size * 0.022;
  g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(bx + br * 0.3, by + br * 0.4, br, 0, TAU); g.fill();
  gr = g.createRadialGradient(bx - br * 0.4, by - br * 0.4, br * 0.1, bx, by, br); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#bfc4cc');
  g.fillStyle = gr; g.beginPath(); g.arc(bx, by, br, 0, TAU); g.fill();
}
// Spins the wheel one way and the ball the other, so the ball comes to rest in `pocket`.
function animateWheel(g, size, dpr, pocket, alive) {
  return new Promise((resolve) => {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const T = 6200, drop = 0.58, settle = 0.84;
    const rot0 = Math.random() * TAU, wheelTurns = 1.6 + Math.random() * 0.6;
    const ballTrack = 0.79, ballPocket = 0.62, ballTurns = 7 + Math.floor(Math.random() * 3);
    const t0 = performance.now(); let lastTick = 0;
    const easeOut = (x) => 1 - Math.pow(1 - x, 3);
    const frame = (now) => {
      if (!alive()) return resolve();
      const t = Math.min(1, (now - t0) / T);
      const rot = rot0 + wheelTurns * TAU * easeOut(t); // the wheel spins clockwise and slows down
      // the ball's angle relative to the wheel: winds down to the pocket's angle and stays there
      // (it starts many turns ahead and unwinds, so the ball travels anticlockwise against the wheel)
      const rel = pocket * SEG + ballTurns * TAU * (1 - easeOut(Math.min(1, t / settle)));
      let r;
      if (t < drop) r = ballTrack;
      else if (t < settle) { const k = (t - drop) / (settle - drop); r = ballTrack + (ballPocket - ballTrack) * k + Math.abs(Math.sin(k * Math.PI * 4)) * 0.05 * (1 - k); }
      else r = ballPocket;
      drawWheel(g, size, rot, rot + rel, r, t);
      if (t > drop && t < settle && now - lastTick > 70 + (t - drop) * 400) { lastTick = now; rbSound.tick(0.06); }
      if (t < 1) requestAnimationFrame(frame); else { rbSound.thud(); resolve(); }
    };
    requestAnimationFrame(frame);
    setTimeout(() => resolve(), T + 1500); // in case animation frames stop
  });
}
export { keyAt, spotOf };
