// Bike Park: a crowded car park seen from above. Slide the other bikes, cars and trucks along their own direction
// until your bike can ride out through the gate at the end of its row. 60 levels, each checked by a solver.
import { store } from '../store.js';
import { FX, sprite, snd, buzz, clamp, roundRect, SPR, IMG } from '../yeti/kit.js';
import { drawBike, ride, coinIcon } from './kit.js';
import { parse, solve, range, grid, isGoal, W, H } from './park-engine.js';

const LEVELS = 60;
let data = null;
async function loadLevels() { if (!data) { try { data = await (await fetch('levels/bikepark.json')).json(); } catch { data = { levels: [], par: [] }; } } return data; }

const OTHER_BIKES = ['scooter', 'dirt', 'cruiser', 'sport', 'chopper'];
const CARS = ['sedan', 'taxi', 'suv', 'police', 'hatchback-sports', 'sedan-sports', 'suv-luxury', 'race', 'van'];
const TRUCKS = ['firetruck', 'garbage-truck', 'delivery', 'ambulance', 'truck'];
const RIDER_IDS = ['r1', 'r2', 'r3', 'r4'];
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

// A little engine note, made on the spot (rises as the bike pulls away).
let ac = null;
function rev() {
  if (!store.settings.sound) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const t = ac.currentTime, o = ac.createOscillator(), o2 = ac.createOscillator(), gn = ac.createGain(), f = ac.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.9);
    o2.frequency.setValueAtTime(27, t); o2.frequency.exponentialRampToValueAtTime(80, t + 0.9);
    f.type = 'lowpass'; f.frequency.value = 900;
    gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(0.12, t + 0.08); gn.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    o.connect(f); o2.connect(f); f.connect(gn).connect(ac.destination);
    o.start(t); o2.start(t); o.stop(t + 1.2); o2.stop(t + 1.2);
  } catch { /* no sound */ }
}

export default {
  id: 'park', name: 'Bike Park', blurb: 'Slide the traffic aside and ride out of a packed car park', unit: 'pts', levels: LEVELS,
  theme: ['#9aa3ad', '#c7ccd2', '#e3e6ea'],
  how: [
    'Your bike is boxed in. Drag the other bikes, cars and trucks to slide them along the way they face, then ride your bike out through the open gate at the end of its row.',
    'Cones, planters and pillars never move. Some car parks have a gate at both ends of your row, so you can leave either way.',
    'Par is the fewest moves it can be done in. Finish in par for three stars, within five extra moves for two. Undo and restart are free; a hint shows the best next move but caps that level at two stars.',
  ],
  thumb(g, w, h) {
    g.fillStyle = '#5a616b'; roundRect(g, 6, 6, w - 12, h - 12, 8); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1;
    for (let k = 1; k < 5; k++) { g.beginPath(); g.moveTo(6 + (w - 12) * k / 5, 8); g.lineTo(6 + (w - 12) * k / 5, h - 8); g.stroke(); }
    sprite(g, 'car_taxi_top', 0, w * 0.3, h * 0.3, 14, { anchor: 'center' });
    sprite(g, 'car_firetruck_top', 0, w * 0.68, h * 0.42, 12, { anchor: 'center', rot: Math.PI / 2 });
    drawBike(g, w * 0.32, h * 0.66, 24, { view: 'top' });
    g.fillStyle = '#f4d03f'; g.fillRect(w - 10, h * 0.6, 4, h * 0.14);
  },
  create(ctx) {
    const fx = new FX();
    let P = null, pos = null, anim = [], par = 0, moves = 0, history = [], hint = null, usedHint = false;
    let drag = null, won = false, winT = 0, ready = false, t = 0, gate = 0, intro = 0, look = [];
    const L = { c: 40, ox: 0, oy: 0, bw: 0, bh: 0, bar: 0 };
    const buttons = [{ id: 'undo', label: 'Undo' }, { id: 'restart', label: 'Restart' }, { id: 'hint', label: 'Hint' }];

    loadLevels().then(() => {
      const lv = data.levels[ctx.level];
      if (!lv) { ctx.prompt('This level could not be loaded'); return; }
      P = parse(lv); pos = P.pos.slice(); anim = pos.slice(); par = data.par[ctx.level];
      // pick how each vehicle looks once, so it stays the same when you undo or restart
      look = P.vs.map((v) => {
        const k = hash(P.board + v.id);
        if (v.kind === 'bike') return { bike: OTHER_BIKES[k % OTHER_BIKES.length], rider: k % 3 === 0 ? null : RIDER_IDS[k % 4] };
        if (v.kind === 'truck') return { sprite: `car_${TRUCKS[k % TRUCKS.length]}_top` };
        if (v.kind === 'car') return { sprite: `car_${CARS[k % CARS.length]}_top` };
        return {};
      });
      ready = true; hud();
      ctx.prompt(ctx.level === 0 ? 'Drag the traffic to clear a path, then ride out' : '');
      if (ctx.level === 0) setTimeout(() => ctx.prompt(''), 3200);
    });

    function hud() { ctx.hud({ left: `Moves ${moves}`, center: `Par ${par}`, right: usedHint ? 'Hint used' : '' }); }
    function layout() {
      L.bar = 74;
      const avW = ctx.W - 20, avH = ctx.H - 52 - L.bar;
      L.c = Math.floor(Math.min(avW / (W + 0.95), avH / (H + 0.7)));
      L.bw = W * L.c; L.bh = H * L.c;
      L.ox = Math.round((ctx.W - L.bw) / 2); L.oy = Math.round(46 + (avH - L.bh) / 2 + 4);
    }
    const cellXY = (col, row) => [L.ox + col * L.c, L.oy + row * L.c];
    function hit(x, y) {
      const col = Math.floor((x - L.ox) / L.c), row = Math.floor((y - L.oy) / L.c);
      if (col < 0 || row < 0 || col >= W || row >= H) return -1;
      const g = grid(P.vs, pos, P.walls), v = g[row * W + col];
      return v > 0 ? v - 1 : -1;
    }
    function button(x, y) {
      const bw = Math.min(110, (ctx.W - 40) / 3), by = ctx.H - L.bar + 12;
      for (let k = 0; k < 3; k++) { const bx = ctx.W / 2 + (k - 1) * (bw + 10) - bw / 2; if (x >= bx && x <= bx + bw && y >= by && y <= by + 46) return buttons[k].id; }
      return null;
    }
    function commit(i, p) {
      history.push(pos.slice()); pos[i] = p; moves++; hint = null; hud();
      snd.tick(); buzz(8);
      if (isGoal(P, pos)) win();
    }
    function win() {
      won = true; winT = 0; ctx.prompt('');
      rev(); snd.ding(3); buzz([20, 40, 20]);
      const stars = usedHint ? Math.min(2, starsFor(moves)) : starsFor(moves);
      const before = store.moto.stars[`park:${ctx.level}`] || 0;
      const coins = Math.max(0, stars - before) * 6 + (before === 0 ? 4 : 1); // mostly paid once per new star
      const score = Math.max(10, 100 - Math.max(0, moves - par) * 5);
      const line = moves <= par ? `Out in ${moves} moves. That's par!` : `Out in ${moves} moves (par ${par})`;
      setTimeout(() => ctx.finish(score, line, { stars, passed: true, coins }), 900);
    }
    const starsFor = (m) => (m <= par ? 3 : m <= par + 5 ? 2 : 1);

    function useHint() {
      if (won) return;
      const s = solve(P, pos);
      if (!s || !s.length) return;
      hint = { i: s[0][0], p: s[0][1], t: 0 };
      if (!usedHint) { usedHint = true; hud(); }
      snd.ding(1);
    }

    function down(x, y) {
      if (!ready || won) return;
      const b = button(x, y);
      if (b === 'undo') { if (history.length) { pos = history.pop(); moves = Math.max(0, moves - 1); hint = null; hud(); snd.swoosh(); } else snd.tick(); return; }
      if (b === 'restart') { if (moves) { history.push(pos.slice()); pos = P.pos.slice(); moves = 0; hint = null; hud(); snd.swoosh(); } return; }
      if (b === 'hint') { useHint(); return; }
      const i = hit(x, y); if (i < 0) return;
      const [lo, hi] = range(P.vs, pos, i, grid(P.vs, pos, P.walls));
      const v = P.vs[i];
      // your bike may run past the end of its row once the way is clear
      drag = { i, start: v.h ? x : y, from: pos[i], lo, hi, raw: pos[i], moved: false };
    }
    function move(x, y) {
      if (!drag) return;
      const v = P.vs[drag.i];
      const raw = drag.from + ((v.h ? x : y) - drag.start) / L.c;
      if (Math.abs(raw - drag.from) > 0.08) drag.moved = true;
      drag.raw = raw;
      // rubber band past the limits
      let shown = raw;
      if (raw < drag.lo) shown = drag.lo - (drag.lo - raw) * 0.22;
      if (raw > drag.hi) shown = drag.hi + (raw - drag.hi) * 0.22;
      anim[drag.i] = shown;
    }
    function up() {
      if (!drag) return;
      const d = drag; drag = null;
      const target = clamp(Math.round(d.raw), d.lo, d.hi);
      if ((d.raw < d.lo - 0.3 || d.raw > d.hi + 0.3)) { snd.thud(); buzz(15); }
      if (target !== pos[d.i]) commit(d.i, target);
      else if (!d.moved) { // a tap: give the vehicle a small wiggle so it is clear it needs dragging
        const v = P.vs[d.i]; anim[d.i] = pos[d.i] + (d.lo === d.hi ? 0.06 : 0.12) * (Math.random() < 0.5 ? -1 : 1); if (d.lo === d.hi) snd.thud(); }
    }

    function update(dt) {
      t += dt; intro = Math.min(1, intro + dt * 2.5); fx.update(dt);
      if (!ready) return;
      layout();
      for (let i = 0; i < anim.length; i++) if (!drag || drag.i !== i) anim[i] += (pos[i] - anim[i]) * Math.min(1, dt * 16);
      if (hint) hint.t += dt;
      if (won) {
        winT += dt; gate = Math.min(1, gate + dt * 3);
        // your bike accelerates out through the gate
        const dir = P.both && pos[0] === 0 ? -1 : 1;
        anim[0] += dir * (winT * winT * 18) * dt;
        if (Math.random() < 0.6) { const [bx, by] = bikeCentre(); fx.burst((bx - dir * L.c) / L.c, -(by) / L.c, { n: 1, color: 'rgba(200,200,200,.6)', speed: 1, up: 0.5, size: 0.12, life: 0.6, grav: -1 }); }
      }
    }
    function bikeCentre() { const v = P.vs[0]; const [x, y] = cellXY(anim[0], v.line); return [x + L.c, y + L.c / 2]; }

    // ---------- drawing ----------
    function drawLot(g) {
      // surroundings: a footpath and a little grass
      g.fillStyle = '#a7c48b'; g.fillRect(0, 0, ctx.W, ctx.H);
      g.fillStyle = '#d6d0c4'; roundRect(g, L.ox - L.c * 0.45, L.oy - L.c * 0.35, L.bw + L.c * 0.9, L.bh + L.c * 0.7, 14); g.fill();
      // asphalt with a fine speckle
      g.fillStyle = '#4c525b'; roundRect(g, L.ox - 4, L.oy - 4, L.bw + 8, L.bh + 8, 8); g.fill();
      g.save(); g.beginPath(); g.rect(L.ox, L.oy, L.bw, L.bh); g.clip();
      for (let k = 0; k < 140; k++) { const r = hash(String(k)) ; g.fillStyle = k % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)'; g.fillRect(L.ox + (r % 997) / 997 * L.bw, L.oy + ((r >> 8) % 991) / 991 * L.bh, 3, 3); }
      // exit lane, slightly lighter, with painted arrows
      const [, ry] = cellXY(0, P.row);
      g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(L.ox, ry, L.bw, L.c);
      g.fillStyle = 'rgba(255,255,255,.35)';
      for (let col = 0; col < W; col++) {
        const [ax] = cellXY(col, P.row), cx = ax + L.c / 2, cy = ry + L.c / 2, s = L.c * 0.16;
        const dirs = P.both ? [-1, 1] : [1];
        for (const d of dirs) { g.beginPath(); g.moveTo(cx + d * s * 1.4 + (P.both ? d * s * 0.6 : 0), cy); g.lineTo(cx - d * s * 0.2 + (P.both ? d * s * 0.6 : 0), cy - s); g.lineTo(cx - d * s * 0.2 + (P.both ? d * s * 0.6 : 0), cy + s); g.closePath(); g.fill(); }
      }
      // bay lines
      g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 2; g.setLineDash([L.c * 0.3, L.c * 0.18]);
      for (let k = 1; k < W; k++) { g.beginPath(); g.moveTo(L.ox + k * L.c, L.oy); g.lineTo(L.ox + k * L.c, L.oy + L.bh); g.stroke(); }
      for (let k = 1; k < H; k++) { if (k === P.row || k === P.row + 1) continue; g.beginPath(); g.moveTo(L.ox, L.oy + k * L.c); g.lineTo(L.ox + L.bw, L.oy + k * L.c); g.stroke(); }
      g.setLineDash([]);
      g.strokeStyle = '#f4d03f'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(L.ox, ry); g.lineTo(L.ox + L.bw, ry); g.moveTo(L.ox, ry + L.c); g.lineTo(L.ox + L.bw, ry + L.c); g.stroke();
      g.restore();
      // kerb all round, with gaps for the gates
      g.strokeStyle = '#eceae4'; g.lineWidth = 6; g.lineCap = 'round';
      const k0 = L.oy, k1 = L.oy + L.bh;
      g.beginPath();
      g.moveTo(L.ox - 3, k0 - 3); g.lineTo(L.ox + L.bw + 3, k0 - 3);
      g.moveTo(L.ox - 3, k1 + 3); g.lineTo(L.ox + L.bw + 3, k1 + 3);
      g.moveTo(L.ox + L.bw + 3, k0 - 3); g.lineTo(L.ox + L.bw + 3, ry); g.moveTo(L.ox + L.bw + 3, ry + L.c); g.lineTo(L.ox + L.bw + 3, k1 + 3);
      if (P.both) { g.moveTo(L.ox - 3, k0 - 3); g.lineTo(L.ox - 3, ry); g.moveTo(L.ox - 3, ry + L.c); g.lineTo(L.ox - 3, k1 + 3); }
      else { g.moveTo(L.ox - 3, k0 - 3); g.lineTo(L.ox - 3, k1 + 3); }
      g.stroke();
      // road beyond each gate
      const road = (x0, w) => { g.fillStyle = '#4c525b'; g.fillRect(x0, ry - 4, w, L.c + 8); g.fillStyle = '#f4d03f'; for (let k = 0; k < 3; k++) g.fillRect(x0 + (w > 0 ? 6 + k * 14 : w + 6 + k * 14), ry + L.c / 2 - 2, 8, 4); };
      road(L.ox + L.bw + 3, ctx.W - (L.ox + L.bw + 3));
      if (P.both) road(0, L.ox - 3);
      drawGate(g, L.ox + L.bw + 3, ry, 1);
      if (P.both) drawGate(g, L.ox - 3, ry, -1);
    }
    function drawGate(g, x, y, side) {
      // a striped boom gate that lifts when you win
      const len = L.c * 0.92, a = -gate * Math.PI * 0.45 * side;
      g.save(); g.translate(x, y + 4);
      g.fillStyle = '#3a3f46'; roundRect(g, -6, -10, 12, 14, 3); g.fill();
      g.rotate(Math.PI / 2 + a);
      for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#ffffff' : '#e5484d'; g.fillRect(k * len / 6, -3, len / 6 + 0.5, 6); }
      g.restore();
      g.fillStyle = '#e5484d'; g.beginPath(); g.arc(x, y + L.c - 4, 4, 0, 6.283); g.fill();
    }
    function drawFixed(g) {
      P.walls.forEach((w) => {
        const ch = P.board[w], col = w % W, row = Math.floor(w / W);
        const [x, y] = cellXY(col, row), cx = x + L.c / 2, cy = y + L.c / 2;
        if (ch === 'x') { sprite(g, 'cone_top', 0, cx, cy, L.c * 1.1, { anchor: 'center' }); sprite(g, 'cone_top', 0, cx - L.c * 0.22, cy + L.c * 0.2, L.c * 0.8, { anchor: 'center' }); }
        else if (ch === '#') { g.fillStyle = '#8a6a48'; roundRect(g, x + L.c * 0.1, y + L.c * 0.1, L.c * 0.8, L.c * 0.8, 6); g.fill(); g.fillStyle = '#5c9a45'; g.beginPath(); g.arc(cx, cy, L.c * 0.32, 0, 6.283); g.fill(); sprite(g, 'tree_small_top', 0, cx, cy, L.c * 0.9, { anchor: 'center' }); }
        else { // concrete pillar with hazard stripes
          g.fillStyle = '#b9bdc3'; roundRect(g, x + L.c * 0.18, y + L.c * 0.18, L.c * 0.64, L.c * 0.64, 4); g.fill();
          g.save(); g.beginPath(); g.rect(x + L.c * 0.18, y + L.c * 0.18, L.c * 0.64, L.c * 0.64); g.clip();
          g.strokeStyle = '#f4c430'; g.lineWidth = L.c * 0.09;
          for (let k = -3; k < 4; k++) { g.beginPath(); g.moveTo(x + k * L.c * 0.2, y + L.c); g.lineTo(x + k * L.c * 0.2 + L.c, y); g.stroke(); }
          g.restore(); g.fillStyle = '#d7dadf'; roundRect(g, x + L.c * 0.3, y + L.c * 0.3, L.c * 0.4, L.c * 0.4, 3); g.fill();
        }
      });
    }
    function drawVehicle(g, i, a) {
      const v = P.vs[i], lk = look[i];
      const col = v.h ? a : v.line, row = v.h ? v.line : a;
      const [x, y] = cellXY(col, row);
      const cx = x + (v.h ? v.len : 1) * L.c / 2, cy = y + (v.h ? 1 : v.len) * L.c / 2;
      const rot = v.h ? 0 : Math.PI / 2;
      const pop = intro < 1 ? 0.7 + 0.3 * Math.min(1, intro * (1 + i * 0.06)) : 1;
      // soft shadow
      g.fillStyle = 'rgba(0,0,0,.22)';
      roundRect(g, cx - (v.h ? v.len * L.c : L.c) / 2 + 5, cy - (v.h ? L.c : v.len * L.c) / 2 + 7, (v.h ? v.len * L.c : L.c) - 10, (v.h ? L.c : v.len * L.c) - 10, 8); g.fill();
      if (i === 0 || v.kind === 'bike') {
        const id = i === 0 ? ride().bike.id : lk.bike;
        const m = SPR[`bike_${id}_top`]; if (!m) return;
        const lenPx = v.len * L.c * 0.9, size = (lenPx / m.w) * m.px * pop;
        if (i === 0) { // glow so your bike stands out
          const pulse = 0.5 + 0.5 * Math.sin(t * 4);
          g.save(); g.shadowColor = `rgba(255,200,60,${0.55 + pulse * 0.35})`; g.shadowBlur = 16;
          g.fillStyle = 'rgba(255,214,90,.28)'; roundRect(g, cx - lenPx / 2 - 2, cy - L.c * 0.42, lenPx + 4, L.c * 0.84, L.c * 0.3); g.fill(); g.restore();
          g.strokeStyle = '#ffc531'; g.lineWidth = 2.5; roundRect(g, cx - lenPx / 2 - 2, cy - L.c * 0.42, lenPx + 4, L.c * 0.84, L.c * 0.3); g.stroke();
          drawBike(g, cx, cy, size, { view: 'top', rot });
          if (t < 4 && !won) { // point out your bike at the start
            const a = Math.min(1, (4 - t) * 1.5), ty = cy - L.c * 0.62;
            g.globalAlpha = a; g.fillStyle = '#ffc531'; roundRect(g, cx - 22, ty - 12, 44, 20, 10); g.fill();
            g.beginPath(); g.moveTo(cx - 5, ty + 8); g.lineTo(cx + 5, ty + 8); g.lineTo(cx, ty + 13); g.fill();
            g.fillStyle = '#3b2a1e'; g.font = '900 12px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('YOU', cx, ty - 2); g.textBaseline = 'alphabetic'; g.globalAlpha = 1;
          }
        } else drawBike(g, cx, cy, size, { view: 'top', rot, bike: id, riderId: lk.rider || 'r1', rider: !!lk.rider, paint: 'factory' });
        return;
      }
      const m = SPR[lk.sprite]; if (!m) return;
      // cars and trucks fill their bay lengthwise; a slight stretch keeps chunky toy cars in their lanes
      const lenPx = v.len * L.c * 0.94, widPx = L.c * (v.kind === 'truck' ? 0.98 : 0.92);
      g.save(); g.translate(cx, cy); g.rotate(rot); g.scale(pop, pop);
      g.drawImage(IMG[lk.sprite], 0, 0, m.w, m.h, -lenPx / 2, -widPx / 2, lenPx, widPx);
      g.restore();
    }
    function drawHint(g) {
      if (!hint || won) return;
      const v = P.vs[hint.i];
      const col = v.h ? hint.p : v.line, row = v.h ? v.line : hint.p;
      const [x, y] = cellXY(col, row), a = 0.45 + 0.35 * Math.sin(hint.t * 6);
      g.save(); g.setLineDash([8, 6]); g.lineWidth = 3; g.strokeStyle = `rgba(255,220,80,${a + 0.2})`; g.fillStyle = `rgba(255,220,80,${a * 0.35})`;
      roundRect(g, x + 3, y + 3, (v.h ? v.len : 1) * L.c - 6, (v.h ? 1 : v.len) * L.c - 6, 10); g.fill(); g.stroke(); g.restore();
      // arrow from the vehicle towards its target
      const from = v.h ? L.ox + (anim[hint.i] + v.len / 2) * L.c : L.oy + (anim[hint.i] + v.len / 2) * L.c;
      const to = v.h ? L.ox + (hint.p + v.len / 2) * L.c : L.oy + (hint.p + v.len / 2) * L.c;
      const mid = v.h ? L.oy + (v.line + 0.5) * L.c : L.ox + (v.line + 0.5) * L.c;
      g.strokeStyle = '#ffd447'; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); if (v.h) { g.moveTo(from, mid); g.lineTo(to, mid); } else { g.moveTo(mid, from); g.lineTo(mid, to); } g.stroke();
    }
    function drawBar(g) {
      const bw = Math.min(110, (ctx.W - 40) / 3), by = ctx.H - L.bar + 12;
      buttons.forEach((b, k) => {
        const bx = ctx.W / 2 + (k - 1) * (bw + 10) - bw / 2;
        const off = (b.id === 'undo' && !history.length) || (b.id === 'restart' && !moves);
        g.fillStyle = 'rgba(40,25,10,.25)'; roundRect(g, bx, by + 4, bw, 46, 23); g.fill();
        g.fillStyle = off ? '#d8d2c8' : b.id === 'hint' ? '#ffd447' : '#ffffff'; roundRect(g, bx, by, bw, 46, 23); g.fill();
        g.fillStyle = off ? '#9a9286' : '#3b2a1e'; g.font = '800 16px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(b.label, bx + bw / 2, by + 23);
      });
      g.textBaseline = 'alphabetic';
    }
    function draw(g) {
      if (!ready) { g.fillStyle = '#a7c48b'; g.fillRect(0, 0, ctx.W, ctx.H); return; }
      layout();
      drawLot(g);
      drawFixed(g);
      drawHint(g);
      // others first, your bike on top
      for (let i = 1; i < P.vs.length; i++) drawVehicle(g, i, anim[i]);
      g.save(); g.beginPath(); g.rect(won ? 0 : L.ox - 2, 0, won ? ctx.W : L.bw + 4, ctx.H); g.clip(); drawVehicle(g, 0, anim[0]); g.restore();
      const cam = { toScreen: (x, y) => [x * L.c, -y * L.c], zoom: L.c };
      fx.draw(g, cam);
      drawBar(g);
    }
    return { update, draw, down, move, up };
  },
};
