// Pokies: a 5 reel, 3 row machine with up to 10 lines, a wild and free spins.
// Every reel stop is drawn at random the moment you spin and the reels simply scroll to it: no near-miss tricks.
import { el, $, sheet } from '../ui.js';
import { STRIPS, SYMBOLS, PAYS, SCATTER_PAYS, LINES, FREE_SPINS, FREE_MULT, windowAt, evaluateSpin, pokiesRtp, makeRng } from './rb-engine.js';
import { rbSound } from './rb-sound.js';
import { store, save } from '../store.js';

const rng = makeRng();
const BETS = [1, 2, 5, 10, 25];
const LINE_COLOURS = ['#ffd23f', '#ff5d73', '#38b6ff', '#3ddc84', '#c77dff', '#ff9f1c', '#2ec4b6', '#f15bb5', '#a0e426', '#ffffff'];
const imgs = {};
for (const [k, s] of Object.entries(SYMBOLS)) { const im = new Image(); im.src = `img/casino/${s.img}.webp`; imgs[k] = im; }
const RTP = Math.round(pokiesRtp().rtp * 1000) / 10;

export default {
  id: 'pokies', name: 'Pokies', tag: 'Five reels, ten lines, free spins',
  art: () => `<div class="rb-art-pokies">${['seven', 'cherry', 'bell'].map((k) => `<span><img src="img/casino/${SYMBOLS[k].img}.webp" alt=""></span>`).join('')}</div>`,
  help: [
    'Choose how many lines to play (1 to 10) and the bet on each line, then tap Spin. The total bet is lines times the bet per line.',
    'Three or more of the same symbol on a played line, starting from the left reel, wins that symbol\'s prize times your line bet. The rainbow seven is wild and stands in for any symbol except the clover.',
    `Three or more lucky clovers anywhere pay a prize and start ${FREE_SPINS} free spins at double pay. Free spins can start again during free spins.`,
    `Every reel stop is random and the machine returns about ${RTP}% of what is bet over a long time, so on average you lose a little. Tap Pays to see every prize. These are play chips only.`,
  ],
  create(ctx) {
    const { root, wallet, ui } = ctx;
    const C = store.casino || {};
    const P = C.pokies || (C.pokies = { lines: 10, bet: 1 });
    let stops = STRIPS.map((s) => rng.int(s.length)), pos = stops.map((s) => s); // pos: fractional top index per reel
    let spinning = false, alive = true, free = P.free || 0, freeWon = P.freeWon || 0, showWins = null, raf = 0;
    root.innerHTML = '';
    const node = el(`<div class="rb pk">
      <div class="rb-top pk-top"><span class="pk-rtp">Returns about ${RTP}% over time</span><button class="cs-btn" data-act="pays">Pays</button></div>
      <div class="pk-machine">
        <div class="pk-marquee"><span>LUCKY</span> <b>SEVENS</b></div>
        <div class="pk-free" data-el="free" hidden></div>
        <div class="pk-reels" data-el="reels"><canvas data-el="cv"></canvas></div>
        <div class="pk-win" data-el="win">Good luck</div>
      </div>
      <div class="pk-controls">
        <div class="pk-ctl"><small>Lines</small><div><button class="pk-step" data-act="lines-">-</button><b data-el="lines"></b><button class="pk-step" data-act="lines+">+</button></div></div>
        <div class="pk-ctl"><small>Bet per line</small><div><button class="pk-step" data-act="bet-">-</button><b data-el="bet"></b><button class="pk-step" data-act="bet+">+</button></div></div>
        <div class="pk-ctl"><small>Total bet</small><div><b data-el="total"></b></div></div>
      </div>
      <div class="rb-bar"><div class="rb-actions"><button class="cs-btn gold pk-spin" data-act="spin">Spin</button></div></div>
    </div>`);
    root.appendChild(node);
    const q = (k) => $(`[data-el="${k}"]`, node);
    const cv = q('cv'), g = cv.getContext('2d');
    let W = 0, H = 0, cellW = 0, cellH = 0, dpr = 1;

    const totalBet = () => P.lines * P.bet;
    function renderControls() {
      q('lines').textContent = P.lines; q('bet').textContent = P.bet; q('total').textContent = ui.fmt(totalBet());
      node.querySelector('.pk-spin').textContent = free ? `Free spin (${free} left)` : 'Spin';
      q('free').hidden = !free && !freeWon; q('free').innerHTML = free ? `Free spins: <b>${free}</b> left · double pay · won ${ui.fmt(freeWon)}` : freeWon ? `Free spins won ${ui.fmt(freeWon)}` : '';
    }
    function fit() {
      const r = q('reels').getBoundingClientRect(); dpr = Math.min(3, window.devicePixelRatio || 1);
      W = r.width; H = r.height; cellW = W / 5; cellH = H / 3;
      cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
      draw(performance.now());
    }
    // Draws the reels at their (possibly fractional) positions, plus win lines when showing a result.
    function draw(now, blur = [0, 0, 0, 0, 0]) {
      if (!W) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      for (let r = 0; r < 5; r++) {
        const strip = STRIPS[r], n = strip.length, p = ((pos[r] % n) + n) % n, base = Math.floor(p), off = p - base;
        g.save(); g.beginPath(); g.rect(r * cellW + 2, 0, cellW - 4, H); g.clip();
        const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#d9dde6'); grd.addColorStop(0.15, '#fff'); grd.addColorStop(0.85, '#fff'); grd.addColorStop(1, '#d9dde6');
        g.fillStyle = grd; g.fillRect(r * cellW + 2, 0, cellW - 4, H);
        for (let k = -1; k <= 3; k++) {
          const sym = strip[(base + k + n) % n], y = (k - off) * cellH;
          const im = imgs[sym]; if (!im.complete || !im.naturalWidth) continue;
          const s = Math.min(cellW * 0.74 / im.naturalWidth, cellH * 0.74 / im.naturalHeight), w = im.naturalWidth * s, h = im.naturalHeight * s;
          const x = r * cellW + (cellW - w) / 2, yy = y + (cellH - h) / 2;
          if (blur[r] > 0.05) { g.globalAlpha = 0.45; g.drawImage(im, x, yy - blur[r] * cellH * 0.25, w, h); g.drawImage(im, x, yy + blur[r] * cellH * 0.25, w, h); g.globalAlpha = 1; }
          else g.drawImage(im, x, yy, w, h);
        }
        g.restore();
      }
      if (showWins) drawWins(now);
    }
    function drawWins(now) {
      const { res } = showWins, list = res.wins;
      const k = list.length ? Math.floor(now / 1100) % list.length : -1;
      list.forEach((w, i) => {
        if (k !== i && list.length > 1) return;
        const pts = LINES[w.line].map((row, r) => [r * cellW + cellW / 2, row * cellH + cellH / 2]);
        g.strokeStyle = LINE_COLOURS[w.line]; g.lineWidth = 4; g.lineJoin = 'round'; g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 4;
        g.beginPath(); pts.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.shadowBlur = 0;
        for (let r = 0; r < w.count; r++) { const [x, y] = pts[r]; g.lineWidth = 3; g.strokeRect(x - cellW / 2 + 5, y - cellH / 2 + 4, cellW - 10, cellH - 8); }
      });
      res.scatters.forEach(([r, row]) => { g.strokeStyle = '#3ddc84'; g.lineWidth = 3; g.beginPath(); g.arc(r * cellW + cellW / 2, row * cellH + cellH / 2, Math.min(cellW, cellH) * 0.45, 0, Math.PI * 2); g.stroke(); });
      if (list.length > 1) q('win').innerHTML = `Line ${list[k].line + 1}: ${list[k].count} × ${SYMBOLS[list[k].sym].name} pays <b>${ui.fmt(list[k].amount)}</b> · total <b>${ui.fmt(showWins.total)}</b>`;
    }
    function loop(now) { if (!alive) return; raf = requestAnimationFrame(loop); if (!spinning && showWins) draw(now); }

    async function spin() {
      if (spinning) return;
      const isFree = free > 0;
      if (!isFree) {
        if (!(await ui.needChips(ctx, totalBet()))) return;
        if (!wallet.take(totalBet())) return;
        freeWon = 0;
      } else free--;
      spinning = true; showWins = null; node.classList.add('spinning');
      q('win').textContent = isFree ? 'Free spin' : 'Spinning'; renderControls();
      const target = STRIPS.map((s) => rng.int(s.length)); // the result, drawn before the reels move
      rbSound.spin();
      await animateTo(target);
      if (!alive) return;
      stops = target;
      const res = evaluateSpin(windowAt(stops), P.lines, P.bet, isFree ? FREE_MULT : 1);
      if (res.total) { wallet.give(res.total); if (isFree) freeWon += res.total; }
      if (res.freeSpins) free += res.freeSpins;
      const net = res.total - (isFree ? 0 : totalBet());
      ctx.stats.record(net > 0 ? 'win' : net < 0 ? 'lose' : 'push', net);
      showWins = res.total ? { res, total: res.total } : null;
      if (res.freeSpins) { rbSound.chime(); ui.banner(root, { text: `${res.scatters.length} clovers: ${FREE_SPINS} free spins`, amount: res.scatterWin, win: true, ms: 2200 }); ctx.buzz([30, 60, 30]); }
      else if (res.total >= totalBet() * 10) { rbSound.chime(); ui.banner(root, { text: 'Big win', amount: res.total, win: true }); ctx.buzz([30, 40, 30]); }
      else if (res.total) { [0, 1, 2].forEach((k) => rbSound.coin(k)); }
      q('win').innerHTML = res.total ? `Win <b>${ui.fmt(res.total)}</b>${isFree ? ' (double pay)' : ''}` : isFree ? 'No win this spin' : 'No win. Spin again?';
      spinning = false; node.classList.remove('spinning'); renderControls(); draw(performance.now());
      if (free > 0 && alive) setTimeout(() => { if (alive && !spinning) spin(); }, 1300); // free spins play themselves
    }
    // Scrolls each reel forward to its target stop, stopping left to right with a small bounce.
    function animateTo(target) {
      return new Promise((resolve) => {
        const start = pos.slice(), t0 = performance.now();
        const dist = target.map((t, r) => { const n = STRIPS[r].length, from = ((start[r] % n) + n) % n; let d = (t - from + n) % n; return d + n * (2 + r); }); // whole turns plus the way to the stop
        const dur = target.map((_, r) => 1100 + r * 330);
        let stopped = [false, false, false, false, false];
        const step = (now) => {
          if (!alive) return resolve();
          const blur = [0, 0, 0, 0, 0];
          for (let r = 0; r < 5; r++) {
            const t = Math.min(1, (now - t0) / dur[r]);
            // ease out with a small overshoot at the end
            const e = t < 1 ? 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI) * 0.012 * (t > 0.8 ? 1 : 0) : 1;
            pos[r] = start[r] + dist[r] * e;
            blur[r] = t < 0.85 ? 1 - t : 0;
            if (t >= 1 && !stopped[r]) { stopped[r] = true; pos[r] = target[r]; rbSound.reelStop(); }
          }
          draw(now, blur);
          if (stopped.every(Boolean)) resolve(); else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        setTimeout(() => { pos = target.slice(); resolve(); }, dur[4] + 1500);
      });
    }
    function paysSheet() {
      const row = (k) => `<div class="pk-pay"><img src="img/casino/${SYMBOLS[k].img}.webp" alt=""><span>${SYMBOLS[k].name}</span><b>${PAYS[k].map((p, i) => `${i + 3}: ${p}`).join(' · ')}</b></div>`;
      sheet(`<h2>Pays</h2><div class="pk-pays">
        <p>Prizes are times your bet per line, for 3, 4 or 5 in a row on a played line, starting from the left reel.</p>
        ${['wild', 'seven', 'bar3', 'bar2', 'bar', 'shoe', 'heart', 'bell', 'melon', 'lemon', 'cherry'].map(row).join('')}
        <div class="pk-pay"><img src="img/casino/${SYMBOLS.scatter.img}.webp" alt=""><span>Lucky clover</span><b>${SCATTER_PAYS.map((p, i) => `${i + 3}: ${p}`).join(' · ')} times total bet</b></div>
        <p>The rainbow seven is wild: it stands in for every symbol except the clover. Three or more clovers anywhere start ${FREE_SPINS} free spins at double pay.</p>
        <p>The ten lines run across the middle, top and bottom rows, in V shapes and zigzags. Lines are played in order, so 5 lines means lines 1 to 5.</p>
        <p>The machine returns about ${RTP}% of all chips bet over a long time. Every stop is random.</p></div>
        <button class="btn" data-x>Close</button>`, { onMount: (n, close) => { $('[data-x]', n).onclick = close; } });
    }

    node.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
      if (a === 'spin') return spin();
      if (a === 'pays') return paysSheet();
      if (spinning || free) return;
      if (a === 'lines+') P.lines = Math.min(10, P.lines + 1); else if (a === 'lines-') P.lines = Math.max(1, P.lines - 1);
      else if (a === 'bet+') P.bet = BETS[Math.min(BETS.length - 1, BETS.indexOf(P.bet) + 1)] || 1; else if (a === 'bet-') P.bet = BETS[Math.max(0, BETS.indexOf(P.bet) - 1)] || 1;
      ctx.sfx.tap(); save(); renderControls();
    });
    const ro = new ResizeObserver(fit); ro.observe(q('reels'));
    Object.values(imgs).forEach((im) => { if (!im.complete) im.addEventListener('load', () => draw(performance.now()), { once: true }); });
    renderControls(); raf = requestAnimationFrame(loop);
    if (free) setTimeout(() => { if (alive && !spinning) spin(); }, 1200); // carry on with free spins left from last time
    return { destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); P.free = free; P.freeWon = free ? freeWon : 0; save(); } };
  },
};
