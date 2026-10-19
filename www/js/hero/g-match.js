// Power Match: swap neighbouring power gems to make lines of three or more. Every gem cleared charges your hero's
// special move; when the meter is full, tap the hero, then tap the board to unleash it. Each level has a goal and a
// move limit.
import { FX, snd, buzz, clamp, fmt, roundRect } from '../yeti/kit.js';
import { drawHero, chosen, POWER_GEMS, drawGem } from './kit.js';
import { newBoard, findMatches, swapMakesMatch, collapse, findMove, shuffle, rngOf, matchLevel, MATCH_LEVELS } from './match-engine.js';

const N = 8, CHARGE = 36;
// What each hero's special clears, around the tapped cell (r, c).
const SPECIALS = {
  spidey: { name: 'Web blast', cells: (b, r, c) => cross(r, c) },
  cap: { name: 'Shield bounce', cells: (b, r, c) => diag(r, c) },
  iron: { name: 'Repulsor beams', cells: (b, r, c) => rows([r, r + (r < N - 1 ? 1 : -1)]) },
  thor: { name: 'Lightning strike', cells: (b, r, c) => { const k = b[r][c], out = []; b.forEach((row, rr) => row.forEach((v, cc) => { if (v === k) out.push(rr * N + cc); })); return out; } },
  hulk: { name: 'Hulk smash', cells: (b, r, c) => box(r, c, 2) },
  widow: { name: 'Widow\'s bite', cells: (b, r, c) => cols([c, c + (c < N - 1 ? 1 : -1)]) },
  panther: { name: 'Vibranium claws', cells: (b, r, c) => cols([c - 1, c, c + 1]) },
  marvel: { name: 'Photon blast', cells: (b, r, c) => rows([r - 1, r, r + 1]) },
  custom: { name: 'Super burst', cells: (b, r, c) => box(r, c, 1).concat(cross(r, c)) },
};
const ok = (r, c) => r >= 0 && c >= 0 && r < N && c < N;
const cross = (r, c) => { const o = []; for (let i = 0; i < N; i++) { o.push(r * N + i); o.push(i * N + c); } return o; };
const diag = (r, c) => { const o = []; for (let d = -N; d <= N; d++) { if (ok(r + d, c + d)) o.push((r + d) * N + c + d); if (ok(r + d, c - d)) o.push((r + d) * N + c - d); } return o; };
const rows = (rs) => rs.filter((r) => r >= 0 && r < N).flatMap((r) => [...Array(N)].map((_, c) => r * N + c));
const cols = (cs) => cs.filter((c) => c >= 0 && c < N).flatMap((c) => [...Array(N)].map((_, r) => r * N + c));
const box = (r, c, k) => { const o = []; for (let dr = -k; dr <= k; dr++) for (let dc = -k; dc <= k; dc++) if (ok(r + dr, c + dc)) o.push((r + dr) * N + c + dc); return o; };

export default {
  id: 'match', name: 'Power Match', blurb: 'Match power gems and charge your hero\'s special move', unit: 'pts', levels: MATCH_LEVELS,
  theme: ['#5b3aa8', '#8f6bd6', '#c9b3ff'],
  how: [
    'Swipe a gem into its neighbour to swap them. Make a line of three or more of the same gem to clear it.',
    'Every gem you clear charges your hero. When the meter is full, tap your hero, then tap the board to unleash a special move. Each hero has their own, from Thor\'s lightning to a Hulk smash.',
    'Meet the goal before you run out of moves. Moves left over earn extra stars.',
    'Pick your hero in the Hero Builder.',
  ],
  thumb(g, w, h) {
    const s = h / 3.2;
    [[0, 1, 2, 0], [3, 3, 4, 3], [5, 1, 2, 1]].forEach((row, r) => row.forEach((k, c) => drawGem(g, POWER_GEMS[k].img, w * 0.2 + c * s * 1.05, h * 0.2 + r * s * 1.0, s * 0.95)));
  },
  create(ctx) {
    const lv = matchLevel(ctx.level), K = lv.kinds;
    const rng = rngOf(((Math.random() * 1e9) | 0) + ctx.level);
    const me = chosen(), sp = SPECIALS[me.id] || SPECIALS.custom;
    let b = newBoard(rng, N, K);
    const vis = b.map((row) => row.map(() => ({ dy: 0, s: 1, dx: 0 })));
    const fx = new FX();
    let score = 0, moves = lv.moves, charge = 0, armed = false, busy = false, over = false, t = 0, chain = 0;
    const got = new Array(6).fill(0);
    let L = null, drag = null, sel = null, queue = [];
    function layout() {
      const size = Math.min(ctx.W - 16, ctx.H - 190), cs = size / N;
      L = { cs, x: (ctx.W - size) / 2, y: 56, size, panelY: 56 + size + 14 };
    }
    layout();
    const Z = 30, fxCam = { toScreen: (x, y) => [x * Z, -y * Z], zoom: Z };
    const cellAt = (x, y) => { const c = Math.floor((x - L.x) / L.cs), r = Math.floor((y - L.y) / L.cs); return ok(r, c) ? [r, c] : null; };
    const centre = (r, c) => [L.x + (c + 0.5) * L.cs, L.y + (r + 0.5) * L.cs];
    const goalDone = () => (lv.goal === 'score' ? score >= lv.target : lv.want.every((w) => got[w.kind] >= w.n));
    function hud() {
      const goal = lv.goal === 'score' ? `${fmt(score)} / ${fmt(lv.target)}` : lv.want.map((w) => `${POWER_GEMS[w.kind].name} ${Math.min(got[w.kind], w.n)}/${w.n}`).join('  ');
      ctx.hud({ left: `Moves ${moves}`, center: goal, right: lv.goal === 'score' ? '' : fmt(score) });
    }
    hud();
    const wait = (s) => new Promise((ok2) => queue.push({ t: s, ok: ok2 }));
    async function clear(cells, special = false) {
      const set = [...new Set(cells)];
      chain++;
      for (const i of set) { const r = Math.floor(i / N), c = i % N; const k = b[r][c]; if (k >= 0) { got[k]++; vis[r][c].pop = 0.0001; const [x, y] = centre(r, c); fx.burst(x / Z, -y / Z, { n: 3, color: POWER_GEMS[k].col, speed: 3, size: 0.12, life: 0.5, grav: 4 }); } }
      const pts = set.length * 10 * Math.min(5, chain);
      score += pts;
      if (!special) charge = Math.min(CHARGE, charge + set.length);
      const [x, y] = centre(Math.floor(set[0] / N), set[0] % N);
      fx.text(x / Z, -y / Z, `+${pts}`, { color: '#fff', size: 18 });
      snd.pop(); if (chain > 1) snd.ding(chain);
      await wait(0.18);
      const falls = collapse(b, set, rng, K);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { vis[r][c].pop = 0; vis[r][c].s = 1; }
      for (const f of falls) vis[f.to][f.c].dy = (f.from - f.to) * L.cs;
      await wait(0.28);
    }
    async function resolve() {
      let m = findMatches(b);
      while (m.size) { await clear([...m]); m = findMatches(b); }
      chain = 0;
      if (!findMove(b)) { shuffle(b, rng); fx.text(ctx.W / 2 / Z, -(L.y + L.size / 2) / Z, 'Shuffle', { color: '#fff', size: 22 }); }
      hud();
      if (goalDone()) { over = true; const stars = moves >= 6 ? 3 : moves >= 2 ? 2 : 1; ctx.finish(score, `${fmt(score)} points with ${moves} moves to spare`, { coins: 20 + stars * 10 + moves * 2, stars, passed: true }); }
      else if (moves <= 0) { over = true; snd.fail(); ctx.finish(score, 'Out of moves', { coins: 5, stars: 0, passed: false }); }
    }
    async function trySwap(r1, c1, r2, c2) {
      if (busy || over) return;
      busy = true; sel = null;
      const animSwap = async (back) => { const dx = (c2 - c1) * L.cs, dy = (r2 - r1) * L.cs; vis[r1][c1].sx = dx; vis[r1][c1].sy = dy; vis[r2][c2].sx = -dx; vis[r2][c2].sy = -dy; vis[r1][c1].swap = vis[r2][c2].swap = 0; await wait(0.16); };
      if (swapMakesMatch(b, r1, c1, r2, c2)) {
        await animSwap();
        [b[r1][c1], b[r2][c2]] = [b[r2][c2], b[r1][c1]];
        clearSwap();
        moves--; snd.tick(); await resolve();
      } else {
        await animSwap(); clearSwap(); snd.thud(); buzz(10);
      }
      busy = false;
    }
    function clearSwap() { for (const row of vis) for (const v of row) { v.sx = v.sy = 0; v.swap = undefined; } }
    async function special(r, c) {
      busy = true; armed = false; charge = 0;
      fx.text(ctx.W / 2 / Z, -(L.y + 30) / Z, sp.name, { color: '#ffe27a', size: 26, life: 1.4 });
      snd.whack(1.2); buzz([20, 30, 40]);
      await clear(sp.cells(b, r, c).filter((i) => i >= 0 && i < N * N), true);
      await resolve();
      busy = false;
    }
    return {
      resize: layout,
      down(x, y) {
        if (over || busy) return;
        if (y > L.panelY && x < ctx.W * 0.45) { if (charge >= CHARGE) { armed = !armed; snd.boing(); } else { ctx.prompt('Clear more gems to charge your hero'); setTimeout(() => ctx.prompt(''), 1400); } return; }
        const cell = cellAt(x, y); if (!cell) return;
        if (armed) { special(...cell); return; }
        if (sel && Math.abs(sel[0] - cell[0]) + Math.abs(sel[1] - cell[1]) === 1) { trySwap(sel[0], sel[1], cell[0], cell[1]); return; }
        sel = cell; drag = { x, y, cell };
      },
      move(x, y) {
        if (!drag || busy) return;
        const dx = x - drag.x, dy = y - drag.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > L.cs * 0.4) {
          const [r, c] = drag.cell, r2 = r + (Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0), c2 = c + (Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0);
          drag = null;
          if (ok(r2, c2)) trySwap(r, c, r2, c2);
        }
      },
      up() { drag = null; },
      update(dt) {
        t += dt; fx.update(dt);
        for (let i = queue.length - 1; i >= 0; i--) { queue[i].t -= dt; if (queue[i].t <= 0) { const q = queue[i]; queue.splice(i, 1); q.ok(); } }
        for (const row of vis) for (const v of row) {
          if (v.dy) { v.dy = v.dy < 0 ? Math.min(0, v.dy + dt * L.cs * 14) : 0; }
          if (v.swap !== undefined) v.swap = Math.min(1, v.swap + dt / 0.16);
          if (v.pop) v.pop = Math.min(1, v.pop + dt / 0.18);
        }
      },
      draw(g) {
        const W = ctx.W, Hh = ctx.H;
        const bg = g.createLinearGradient(0, 0, 0, Hh); bg.addColorStop(0, '#2a1d5c'); bg.addColorStop(1, '#5b3aa8');
        g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
        g.fillStyle = 'rgba(255,255,255,.08)'; roundRect(g, L.x - 6, L.y - 6, L.size + 12, L.size + 12, 14); g.fill();
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { g.fillStyle = (r + c) % 2 ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.12)'; g.fillRect(L.x + c * L.cs, L.y + r * L.cs, L.cs, L.cs); }
        if (sel) { g.strokeStyle = '#ffe27a'; g.lineWidth = 3; g.strokeRect(L.x + sel[1] * L.cs + 2, L.y + sel[0] * L.cs + 2, L.cs - 4, L.cs - 4); }
        g.save(); g.beginPath(); g.rect(L.x, L.y, L.size, L.size); g.clip();
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          const k = b[r][c]; if (k < 0) continue;
          const v = vis[r][c];
          let [x, y] = centre(r, c);
          y += v.dy;
          if (v.swap !== undefined) { x += v.sx * v.swap; y += v.sy * v.swap; }
          const s = v.pop ? 1 - v.pop : 1;
          if (s <= 0) continue;
          drawGem(g, POWER_GEMS[k].img, x, y, L.cs * 0.84 * s);
        }
        g.restore();
        // hero panel
        const py = L.panelY, ph = Hh - py - 8, full = charge >= CHARGE;
        g.fillStyle = armed ? 'rgba(255,226,122,.35)' : 'rgba(0,0,0,.25)'; roundRect(g, 8, py, W * 0.45 - 8, ph, 14); g.fill();
        if (full) { g.strokeStyle = `rgba(255,226,122,${0.6 + Math.sin(t * 6) * 0.4})`; g.lineWidth = 3; g.stroke(); }
        const hs = Math.min(ph - 8, 110), mx = 8 + hs * 0.78, mw = W * 0.45 - mx - 8;
        drawHero(g, 8 + hs * 0.4, py + Math.min(ph, hs + 30) - 6, hs, { look: me.look, pose: armed ? 'punch' : full ? 'cheer' : 'stand', flow: 0.3, t });
        g.fillStyle = '#fff'; g.font = '800 12px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
        g.save(); g.beginPath(); g.rect(mx, py, mw, ph); g.clip();
        g.fillText(me.name, mx, py + 8);
        g.font = '600 11px system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(sp.name, mx, py + 24);
        g.restore();
        g.fillStyle = 'rgba(255,255,255,.15)'; roundRect(g, mx, py + 42, mw, 10, 5); g.fill();
        g.fillStyle = full ? '#ffe27a' : '#8fd3ff'; roundRect(g, mx, py + 42, Math.max(10, mw * charge / CHARGE), 10, 5); g.fill();
        if (full) { g.fillStyle = '#ffe27a'; g.fillText(armed ? 'Tap the board' : 'Tap to use', mx, py + 58); }
        // goal panel
        const gx = W * 0.45 + 6, gw = W - gx - 8;
        g.fillStyle = 'rgba(0,0,0,.25)'; roundRect(g, gx, py, gw, ph, 14); g.fill();
        g.fillStyle = '#fff'; g.font = '800 12px system-ui, sans-serif'; g.fillText('Goal', gx + 10, py + 8);
        if (lv.goal === 'score') { g.font = '900 20px system-ui, sans-serif'; g.fillText(`${fmt(lv.target)} pts`, gx + 10, py + 26); }
        else lv.want.forEach((w, i) => { drawGem(g, POWER_GEMS[w.kind].img, gx + 22, py + 38 + i * 30, 24); g.font = '900 16px system-ui, sans-serif'; g.fillText(`${Math.max(0, w.n - got[w.kind])} left`, gx + 40, py + 30 + i * 30); });
        fx.draw(g, fxCam);
      },
    };
  },
};
