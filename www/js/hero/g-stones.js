// Infinity Stones: travel to six worlds and solve each world's puzzle to claim its stone.
// Space: slide the vault tiles back into place. Mind: repeat the pattern. Reality: turn the pipes so the energy flows.
// Power: switch off every orb. Time: push the relics onto the glyphs. Soul: find every matching pair of heroes.
import { FX, snd, buzz, clamp, roundRect } from '../yeti/kit.js';
import { cbOn } from '../cb.js';
import { H, drawHero, chosen, STONES, drawStone, POWER_GEMS, drawGem, HEROES, starPath } from './kit.js';
import { slideStart, slideMove, slideSolved, slideBest, lightsStart, lightsPress, lightsSolved, pipesStart, pipesFlow, pipesSolved, rotate,
  sokoParse, sokoStep, sokoSolved, sokoBest, memoryDeal, patternSeq } from './stones-engine.js';

const WORLDS = [
  { place: 'The Tesseract vault', sky: ['#0b1a4a', '#1f3f99'], tip: 'Slide the tiles to rebuild the picture.' },
  { place: 'The Mind lab', sky: ['#3a2f05', '#a8860f'], tip: 'Watch the gems light up, then tap them in the same order.' },
  { place: 'Svartalfheim', sky: ['#2a0608', '#7a1218'], tip: 'Turn the pipes so the energy flows through every tile to the stone.' },
  { place: 'Morag', sky: ['#1d0b33', '#5a2d91'], tip: 'Tapping an orb flips it and its neighbours. Switch them all off.' },
  { place: 'Kamar-Taj', sky: ['#062a12', '#1d7a3a'], tip: 'Swipe to walk. Push both relics onto the glowing glyphs.' },
  { place: 'Vormir', sky: ['#2e1a05', '#a85a14'], tip: 'Turn cards two at a time and find every pair.' },
];

export default {
  id: 'stones', name: 'Infinity Stones', blurb: 'Six worlds, six puzzles, six Infinity Stones', unit: '', levels: 6,
  theme: ['#3a1d6e', '#8f5bd6', '#f2c230'],
  levelName: (i) => STONES[i].name,
  resultTitle: (i) => `${STONES[i].name} claimed`,
  progress: (h) => { const n = h.level.stones || 0; return n >= 6 ? 'All six stones claimed' : `${n} of 6 stones`; },
  how: [
    'Visit six worlds and solve each one\'s puzzle to claim its Infinity Stone: Space, Mind, Reality, Power, Time and Soul.',
    'Every world has a different puzzle. The tip at the bottom of the screen explains it.',
    'Solve it quickly or in few moves for more stars. Claim all six to complete the set.',
  ],
  thumb(g, w, h) {
    STONES.forEach((s, i) => drawStone(g, s, w * (0.14 + i * 0.145), h * (0.5 + (i % 2 ? 0.12 : -0.12)), h * 0.32));
  },
  create(ctx) {
    const i = ctx.level, stone = STONES[i], world = WORLDS[i];
    const fx = new FX();
    let L = null, t = 0, over = false, moves = 0, mistakes = 0, wonT = 0;
    const seed = ((Math.random() * 1e9) | 0);
    function layout() {
      const size = Math.min(ctx.W - 24, ctx.H - 210);
      L = { size, x: (ctx.W - size) / 2, y: 92 };
    }
    layout();
    const fxCam = { toScreen: (x, y) => [x, y], zoom: 30 };
    const hud = () => ctx.hud({ left: world.place, right: puzzle.counter ? puzzle.counter() : `Moves ${moves}` });
    function solved(stars, line) {
      if (over) return;
      over = true; wonT = 0.001; snd.cheer(); buzz([30, 40, 60]);
      setTimeout(() => ctx.finish(stars, line, { coins: 20 + stars * 12, stars, passed: true }), 1500);
    }

    // ---------- the six puzzles ----------
    const puzzles = [
      // Space: 3x3 sliding picture
      () => {
        const b = slideStart(seed); const best = slideBest(b);
        const pic = document.createElement('canvas'); pic.width = pic.height = 300;
        { const g = pic.getContext('2d'); const gr = g.createRadialGradient(150, 150, 10, 150, 150, 220); gr.addColorStop(0, '#3a6bff'); gr.addColorStop(1, '#06102e'); g.fillStyle = gr; g.fillRect(0, 0, 300, 300);
          for (let k = 0; k < 70; k++) { g.fillStyle = `rgba(255,255,255,${0.3 + (k % 5) / 7})`; g.fillRect((k * 97) % 300, (k * 53) % 300, 2, 2); }
          g.strokeStyle = 'rgba(160,200,255,.55)'; g.lineWidth = 8; g.strokeRect(70, 70, 160, 160);
          drawStone(g, stone, 150, 150, 120); }
        return {
          counter: () => `Moves ${moves}`,
          down(x, y) {
            const n = 3, cs = L.size / n, c = Math.floor((x - L.x) / cs), r = Math.floor((y - L.y) / cs);
            if (r < 0 || c < 0 || r >= n || c >= n) return;
            if (slideMove(b, r * n + c)) { moves++; snd.tick(); hud(); if (slideSolved(b)) solved(moves <= best + 6 ? 3 : moves <= best + 20 ? 2 : 1, `Solved in ${moves} moves (best possible ${best})`); }
          },
          draw(g) {
            const n = 3, cs = L.size / n;
            b.forEach((v, k) => {
              if (!v && !over) return;
              const src = (over ? k : v - 1), sr = Math.floor(src / n), sc = src % n, r = Math.floor(k / n), c = k % n;
              g.drawImage(pic, sc * 100, sr * 100, 100, 100, L.x + c * cs + 2, L.y + r * cs + 2, cs - 4, cs - 4);
              if (!over) { g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '800 14px system-ui'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(v, L.x + c * cs + 8, L.y + r * cs + 6); }
            });
          },
        };
      },
      // Mind: pattern of six gem pads
      () => {
        const seq = patternSeq(seed, 7), pads = 6;
        let round = 3, show = 0, step = 0, input = 0, flash = -1, flashT = 0, wait = 1;
        const padPos = (k) => { const a = -Math.PI / 2 + k * (Math.PI * 2 / pads), r = L.size * 0.34; return [L.x + L.size / 2 + Math.cos(a) * r, L.y + L.size / 2 + Math.sin(a) * r]; };
        const light = (k) => { flash = k; flashT = 0.42; snd.ding(k); };
        return {
          counter: () => `Round ${round - 2} of 5`,
          update(dt) {
            if (flashT > 0) flashT -= dt;
            if (show) { wait -= dt; if (wait <= 0) { if (step < round) { light(seq[step]); step++; wait = 0.62; } else { show = 0; input = 0; } } }
            else if (wait > 0) { wait -= dt; if (wait <= 0) { show = 1; step = 0; wait = 0.3; } }
          },
          down(x, y) {
            if (show || wait > 0 || over) return;
            for (let k = 0; k < pads; k++) {
              const [px, py] = padPos(k);
              if (Math.hypot(px - x, py - y) > L.size * 0.13) continue;
              light(k);
              if (k === seq[input]) { input++; if (input >= round) { if (round >= 7) solved(mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1, mistakes ? `${mistakes} slip${mistakes === 1 ? '' : 's'} on the way` : 'A perfect memory'); else { round++; wait = 0.9; hud(); } } }
              else { mistakes++; snd.thud(); buzz(30); wait = 1; ctx.prompt('Watch again'); setTimeout(() => ctx.prompt(''), 900); }
              return;
            }
          },
          draw(g) {
            g.fillStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.arc(L.x + L.size / 2, L.y + L.size / 2, L.size * 0.47, 0, 6.283); g.fill();
            drawStone(g, stone, L.x + L.size / 2, L.y + L.size / 2, L.size * (over ? 0.36 : 0.18), over);
            for (let k = 0; k < pads; k++) {
              const [px, py] = padPos(k), on = flash === k && flashT > 0;
              g.fillStyle = on ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(px, py, L.size * 0.12, 0, 6.283); g.fill();
              drawGem(g, POWER_GEMS[k].img, px, py, L.size * (on ? 0.2 : 0.15), { glow: on ? POWER_GEMS[k].col : '' });
            }
            if (!over) { g.fillStyle = '#fff'; g.font = '800 14px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(show || wait > 0 ? 'Watch' : 'Your turn', L.x + L.size / 2, L.y + L.size / 2 + L.size * 0.14); }
          },
        };
      },
      // Reality: rotate pipes
      () => {
        const p = pipesStart(seed), n = p.n, tiles = p.tiles, spin = new Array(n * n).fill(0);
        return {
          counter: () => `Turns ${moves}`,
          update(dt) { for (let k = 0; k < spin.length; k++) if (spin[k]) spin[k] = Math.max(0, spin[k] - dt * 8); },
          down(x, y) {
            const cs = L.size / n, c = Math.floor((x - L.x) / cs), r = Math.floor((y - L.y) / cs);
            if (r < 0 || c < 0 || r >= n || c >= n || over) return;
            const k = r * n + c; tiles[k] = rotate(tiles[k]); spin[k] = 1; moves++; snd.tick(); hud();
            if (pipesSolved(tiles, n)) solved(moves <= n * n * 1.2 ? 3 : moves <= n * n * 2 ? 2 : 1, `Energy flowing after ${moves} turns`);
          },
          draw(g) {
            const cs = L.size / n, lit = pipesFlow(tiles, n), mid = Math.floor(n / 2);
            // colourblind mode: powered pipes also carry a bright dashed core that flows, so they stand out without the red
            const cb = cbOn(), flow = (performance.now() / 1000) * cs * 0.6;
            for (let k = 0; k < n * n; k++) {
              const r = Math.floor(k / n), c = k % n, cx = L.x + (c + 0.5) * cs, cy = L.y + (r + 0.5) * cs;
              g.fillStyle = 'rgba(0,0,0,.3)'; roundRect(g, cx - cs / 2 + 2, cy - cs / 2 + 2, cs - 4, cs - 4, 8); g.fill();
              g.save(); g.translate(cx, cy); g.rotate(-spin[k] * Math.PI / 2);
              const on = lit.has(k);
              for (const [bit, dx, dy] of [[1, 0, -1], [2, 1, 0], [4, 0, 1], [8, -1, 0]]) if (tiles[k] & bit) {
                g.strokeStyle = on ? '#ff4d4d' : '#6d5a5a'; g.lineWidth = cs * 0.22; g.lineCap = 'round';
                if (on) { g.shadowColor = '#ff2b2b'; g.shadowBlur = 10; }
                g.beginPath(); g.moveTo(0, 0); g.lineTo(dx * cs / 2, dy * cs / 2); g.stroke(); g.shadowBlur = 0;
                if (on && cb) {
                  g.strokeStyle = '#fff7d6'; g.lineWidth = cs * 0.08; g.setLineDash([cs * 0.07, cs * 0.11]); g.lineDashOffset = -flow;
                  g.stroke(); g.setLineDash([]); g.lineDashOffset = 0;
                }
              }
              g.fillStyle = on ? '#ff8080' : '#8a7777'; g.beginPath(); g.arc(0, 0, cs * 0.14, 0, 6.283); g.fill();
              if (on && cb) { g.fillStyle = '#fff7d6'; g.beginPath(); g.arc(0, 0, cs * 0.07, 0, 6.283); g.fill(); }
              g.restore();
            }
            g.fillStyle = '#ff4d4d'; g.beginPath(); g.arc(L.x - 6, L.y + (mid + 0.5) * cs, 8, 0, 6.283); g.fill();
            drawStone(g, stone, L.x + L.size + 4, L.y + (mid + 0.5) * cs, cs * 0.7, over);
          },
        };
      },
      // Power: lights out
      () => {
        const n = 5, { board, presses } = lightsStart(seed, n, 7);
        return {
          counter: () => `Taps ${moves}`,
          down(x, y) {
            const cs = L.size / n, c = Math.floor((x - L.x) / cs), r = Math.floor((y - L.y) / cs);
            if (r < 0 || c < 0 || r >= n || c >= n || over) return;
            lightsPress(board, r * n + c, n); moves++; snd.pop(); hud();
            if (lightsSolved(board)) solved(moves <= presses + 2 ? 3 : moves <= presses * 2 + 4 ? 2 : 1, `Every orb dark after ${moves} taps`);
          },
          draw(g) {
            const cs = L.size / n;
            board.forEach((v, k) => {
              const r = Math.floor(k / n), c = k % n, cx = L.x + (c + 0.5) * cs, cy = L.y + (r + 0.5) * cs;
              g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.arc(cx, cy, cs * 0.42, 0, 6.283); g.fill();
              if (v) { g.shadowColor = stone.col; g.shadowBlur = 16; g.fillStyle = '#c58cff'; g.beginPath(); g.arc(cx, cy, cs * 0.34, 0, 6.283); g.fill(); g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(cx - cs * 0.1, cy - cs * 0.1, cs * 0.1, 0, 6.283); g.fill(); }
              else { g.fillStyle = '#3a2457'; g.beginPath(); g.arc(cx, cy, cs * 0.3, 0, 6.283); g.fill(); }
            });
            if (over) drawStone(g, stone, L.x + L.size / 2, L.y + L.size / 2, L.size * 0.4);
          },
        };
      },
      // Time: sokoban
      () => {
        let s = sokoParse(); const start = s, best = sokoBest(s); let sw = null; const hist = [];
        const go = (d) => { const nxt = sokoStep(s, d); if (!nxt) { snd.thud(); return; } hist.push(s); const pushed = nxt.boxes !== s.boxes && [...nxt.boxes].some((b) => !s.boxes.has(b)); s = nxt; moves++; pushed ? snd.whack(0.4) : snd.tick(); hud(); if (sokoSolved(s)) solved(moves <= best + 4 ? 3 : moves <= best + 16 ? 2 : 1, `Relics placed in ${moves} steps (best possible ${best})`); };
        return {
          counter: () => `Steps ${moves}`,
          down(x, y) {
            if (over) return;
            if (y > L.y + L.size + 6 && x < 110 && hist.length) { s = hist.pop(); moves++; snd.tick(); hud(); return; }
            if (y > L.y + L.size + 6 && x > ctx.W - 110) { s = start; hist.length = 0; moves = 0; hud(); return; }
            sw = { x, y };
          },
          up(x, y) {
            if (!sw || over) return;
            const dx = x - sw.x, dy = y - sw.y; sw = null;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) { // a tap: step towards it
              const cs = L.size / s.w, pc = s.player % s.w, pr = Math.floor(s.player / s.w), tc = (x - L.x) / cs - 0.5, tr = (y - L.y) / cs - 0.5;
              const ddx = tc - pc, ddy = tr - pr; if (Math.max(Math.abs(ddx), Math.abs(ddy)) < 0.5) return;
              go(Math.abs(ddx) > Math.abs(ddy) ? (ddx > 0 ? 'r' : 'l') : (ddy > 0 ? 'd' : 'u')); return;
            }
            go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : (dy > 0 ? 'd' : 'u'));
          },
          draw(g) {
            const cs = L.size / s.w;
            for (let r = 0; r < s.h; r++) for (let c = 0; c < s.w; c++) {
              const k = r * s.w + c, x = L.x + c * cs, y = L.y + r * cs;
              if (s.walls.has(k)) { g.fillStyle = '#5a3d1f'; g.fillRect(x, y, cs, cs); g.fillStyle = '#7a5530'; g.fillRect(x + 2, y + 2, cs - 4, cs * 0.4); continue; }
              g.fillStyle = (r + c) % 2 ? '#c9b48a' : '#d6c39a'; g.fillRect(x, y, cs, cs);
              if (s.goals.has(k)) { g.strokeStyle = '#3bb54a'; g.lineWidth = 3; g.shadowColor = '#3bb54a'; g.shadowBlur = 8; starPath(g, x + cs / 2, y + cs / 2, cs * 0.34, cs * 0.14, 8); g.stroke(); g.shadowBlur = 0; }
            }
            for (const b of s.boxes) { const x = L.x + (b % s.w) * cs, y = L.y + Math.floor(b / s.w) * cs, on = s.goals.has(b); g.fillStyle = on ? '#3bb54a' : '#b07a2a'; roundRect(g, x + 4, y + 4, cs - 8, cs - 8, 8); g.fill(); g.strokeStyle = '#4a2f10'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#f2c230'; g.beginPath(); g.arc(x + cs / 2, y + cs / 2, cs * 0.14, 0, 6.283); g.fill(); }
            const px = L.x + (s.player % s.w + 0.5) * cs, py = L.y + (Math.floor(s.player / s.w) + 1) * cs - 2;
            drawHero(g, px, py, cs * 1.05, { look: chosen().look, pose: 'stand', t });
            if (over) drawStone(g, stone, L.x + L.size / 2, L.y + L.size / 2, L.size * 0.35);
            const by = L.y + L.size + 10;
            g.fillStyle = 'rgba(255,255,255,.15)'; roundRect(g, 12, by, 90, 34, 17); g.fill(); roundRect(g, ctx.W - 102, by, 90, 34, 17); g.fill();
            g.fillStyle = '#fff'; g.font = '800 13px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Undo', 57, by + 17); g.fillText('Restart', ctx.W - 57, by + 17);
          },
        };
      },
      // Soul: memory pairs of heroes
      () => {
        const cards = memoryDeal(seed), up = new Set(), found = new Set(); let pick = [], hold = 0;
        const flip = cards.map(() => 0);
        return {
          counter: () => `Pairs ${found.size / 2} of 8`,
          update(dt) {
            if (hold > 0) { hold -= dt; if (hold <= 0) { pick.forEach((k) => up.delete(k)); pick = []; } }
            cards.forEach((_, k) => { const want = up.has(k) || found.has(k) || over ? 1 : 0; flip[k] += (want - flip[k]) * Math.min(1, dt * 12); });
          },
          down(x, y) {
            if (hold > 0 || over) return;
            const n = 4, cs = L.size / n, c = Math.floor((x - L.x) / cs), r = Math.floor((y - L.y) / cs);
            if (r < 0 || c < 0 || r >= n || c >= n) return;
            const k = r * n + c; if (up.has(k) || found.has(k)) return;
            up.add(k); pick.push(k); snd.tick();
            if (pick.length === 2) {
              moves++;
              if (cards[pick[0]] === cards[pick[1]]) { pick.forEach((q) => found.add(q)); pick = []; snd.ding(found.size / 2); hud(); if (found.size === 16) solved(moves <= 12 ? 3 : moves <= 18 ? 2 : 1, `All pairs found in ${moves} turns`); }
              else { hold = 0.8; mistakes++; }
            }
          },
          draw(g) {
            const n = 4, cs = L.size / n;
            cards.forEach((v, k) => {
              const r = Math.floor(k / n), c = k % n, cx = L.x + (c + 0.5) * cs, cy = L.y + (r + 0.5) * cs, f = flip[k], sx = Math.abs(Math.cos(f * Math.PI));
              g.save(); g.translate(cx, cy); g.scale(Math.max(0.05, sx), 1);
              const face = f > 0.5;
              g.fillStyle = face ? (found.has(k) ? '#ffe9c2' : '#fff6e8') : '#a85a14'; roundRect(g, -cs / 2 + 4, -cs / 2 + 4, cs - 8, cs - 8, 10); g.fill();
              if (face) { g.beginPath(); g.rect(-cs / 2 + 4, -cs / 2 + 4, cs - 8, cs - 8); g.clip(); drawHero(g, 0, cs * 0.75, cs * 1.25, { look: HEROES[v].look }); }
              else { drawStone(g, stone, 0, 0, cs * 0.4, false); }
              g.restore();
            });
            if (over) drawStone(g, stone, L.x + L.size / 2, L.y + L.size / 2, L.size * 0.4);
          },
        };
      },
    ];
    const puzzle = puzzles[i]();
    hud();
    return {
      resize: layout,
      down: (x, y) => puzzle.down?.(x, y),
      move: (x, y) => puzzle.move?.(x, y),
      up: (x, y) => puzzle.up?.(x, y),
      update(dt) { t += dt; fx.update(dt); puzzle.update?.(dt); if (wonT) wonT += dt; },
      draw(g) {
        const W = ctx.W, Hh = ctx.H;
        const bg = g.createLinearGradient(0, 0, 0, Hh); bg.addColorStop(0, world.sky[0]); bg.addColorStop(1, world.sky[1]);
        g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
        for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(255,255,255,${0.15 + 0.25 * Math.abs(Math.sin(t + k))})`; g.fillRect((k * 131) % W, (k * 71) % (Hh * 0.6), 2, 2); }
        // the stones collected so far
        const have = Math.max(H().level.stones || 0, over ? i + 1 : 0);
        STONES.forEach((s, k) => { const x = W / 2 + (k - 2.5) * 40, y = 64; g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.arc(x, y, 15, 0, 6.283); g.fill(); if (k < have || (over && k === i)) drawStone(g, s, x, y, 26, k === i); else drawStone(g, s, x, y, 22, false), g.fillStyle = 'rgba(0,0,0,.55)', g.beginPath(), g.arc(x, y, 13, 0, 6.283), g.fill(); });
        puzzle.draw(g);
        if (wonT) { const a = Math.min(1, wonT * 2); g.fillStyle = `rgba(255,255,255,${0.25 * (1 - a)})`; g.fillRect(0, 0, W, Hh); drawStone(g, stone, W / 2, L.y + L.size / 2, L.size * (0.2 + 0.25 * a)); }
        g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '600 13px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
        if (!over) g.fillText(world.tip, W / 2, Math.min(Hh - 22, L.y + L.size + (i === 4 ? 54 : 14)));
        fx.draw(g, fxCam);
      },
    };
  },
};
