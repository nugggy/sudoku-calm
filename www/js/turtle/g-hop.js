// River Hop: an endless crossing game seen from above. Tap to hop forward, swipe to hop sideways or back.
// Roads have cars; the river current is too strong to swim, so ride the logs and lily pads.
// Score is the furthest row reached.
import { sprite } from '../yeti/kit.js';
import { FX, snd, buzz, clamp, pic, fillGrad } from './kit.js';

const COLS = 7;
const CARS = ['sedan', 'taxi', 'van', 'suv', 'police', 'truck', 'delivery'];

export default {
  id: 'hop', name: 'River Hop', blurb: 'Hop across roads and ride logs over the river', unit: 'rows', unit1: 'row',
  theme: ['#7cc95a', '#5aa0d8', '#6b6f78'],
  how: [
    'Tap to hop forward. Swipe left or right to hop sideways, or swipe down to hop back.',
    'Watch for cars on the roads. The river is flowing too fast to swim across, so hop onto logs and lily pads and ride them over. Do not get carried off the side of the screen.',
    'Keep moving. A turtle that sits still for too long gets spotted by a hungry gull.',
  ],
  thumb(g, w, h) {
    g.fillStyle = '#5aa0d8'; g.fillRect(0, h * 0.15, w, h * 0.35); g.fillStyle = '#6b6f78'; g.fillRect(0, h * 0.62, w, h * 0.25);
    pic(g, 't_log', w * 0.3, h * 0.32, w * 0.4); pic(g, 't_lilypad', w * 0.78, h * 0.32, h * 0.3);
    sprite(g, 'car_taxi_top', 0, w * 0.75, h * 0.74, 9, { anchor: 'center' });
    pic(g, 't_sea_top', w * 0.32, h * 0.33, h * 0.32, { rot: -Math.PI / 2 });
  },
  create(ctx) {
    const fx = new FX();
    const rows = new Map();
    let seed = (Math.random() * 1e9) | 0;
    const R = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x80000000; };
    const P = { x: 3, row: 0, hop: 0, fromX: 3, fromRow: 0, dead: false, idle: 0, face: -Math.PI / 2 };
    let best = 0, camRow = 0, t = 0, ended = false, down0 = null, gull = null, lastType = 'grass';

    function makeRow(r) {
      if (r < 3) return { type: 'grass', blocks: r === 0 ? [] : [0, 6].filter(() => R() < 0.5) };
      let type;
      const k = R();
      if (lastType === 'grass') type = k < 0.5 ? 'road' : 'river';
      else if (k < 0.3) type = 'grass';
      else type = k < 0.65 ? 'road' : 'river';
      lastType = type;
      const lvl = Math.min(1, r / 150), dir = R() < 0.5 ? -1 : 1;
      if (type === 'grass') { const blocks = []; for (let c = 0; c < COLS; c++) if (R() < 0.18) blocks.push(c); return { type, blocks }; }
      if (type === 'road') {
        const v = dir * (1.2 + R() * 1.6 + lvl * 1.8), n = 1 + ((R() * (2 + lvl * 1.5)) | 0), items = [];
        const gap = (COLS + 4) / n;
        for (let i = 0; i < n; i++) items.push({ x: i * gap + R() * gap * 0.4, len: 2, name: CARS[(R() * CARS.length) | 0] });
        return { type, v, items };
      }
      const pads = R() < 0.4, v = dir * (0.9 + R() * 1.1 + lvl * 1), items = [];
      const len = pads ? 1 : 2 + ((R() * 2) | 0), n = pads ? 3 + ((R() * 2) | 0) : 2 + ((R() * 2 - lvl) | 0);
      const span = COLS + 4, gap = span / Math.max(1, n);
      for (let i = 0; i < n; i++) items.push({ x: i * gap, len, pad: pads });
      return { type, v, items };
    }
    const row = (r) => { if (!rows.has(r)) rows.set(r, makeRow(r)); return rows.get(r); };
    for (let r = 0; r < 20; r++) row(r);

    const C = () => ctx.W / COLS;
    const screenY = (r) => ctx.H * 0.72 - (r - camRow) * C();
    const hud = () => ctx.hud({ left: ctx.best ? `Best ${ctx.best}` : '', right: `${best} rows` });
    hud();
    ctx.prompt('Tap to hop');

    // wraps an item position into the span the row cycles through (a little wider than the screen)
    const wrap = (x) => { const span = COLS + 4; return ((x + 2) % span + span) % span - 2; };
    const under = (rw, x) => rw.items.find((it) => { const ix = wrap(it.x); return x > ix - 0.15 && x < ix + it.len + 0.15; });

    function die(why, kind) {
      if (P.dead) return; P.dead = kind || true; ended = true; snd.fail(); buzz([40, 60, 40]);
      if (kind === 'water') snd.splash();
      ctx.finish(best, why);
    }
    function hop(dx, dr) {
      if (ended || P.hop > 0) return;
      ctx.prompt('');
      const nx = clamp(Math.round(P.x) + dx, 0, COLS - 1), nr = Math.max(0, P.row + dr);
      const target = row(nr);
      if (target.type === 'grass' && target.blocks.includes(nx)) { snd.thud(); P.face = dx ? (dx > 0 ? 0 : Math.PI) : dr > 0 ? -Math.PI / 2 : Math.PI / 2; return; }
      P.fromX = P.x; P.fromRow = P.row;
      P.x = row(P.row).type === 'river' && dx === 0 ? P.x : nx;
      if (target.type !== 'river') P.x = nx;
      P.row = nr; P.hop = 0.13; P.idle = 0;
      P.face = dx ? (dx > 0 ? 0 : Math.PI) : dr > 0 ? -Math.PI / 2 : Math.PI / 2;
      snd.tick(); buzz(5);
      if (P.row > best) { best = P.row; hud(); }
    }

    function down(x, y) { down0 = [x, y]; }
    function up(x, y) {
      if (!down0) return;
      const dx = x - down0[0], dy = y - down0[1]; down0 = null;
      if (Math.hypot(dx, dy) < 24) return hop(0, 1);
      if (Math.abs(dx) > Math.abs(dy)) hop(dx > 0 ? 1 : -1, 0); else hop(0, dy < 0 ? 1 : -1);
    }

    function update(dt) {
      t += dt; fx.update(dt);
      for (let r = Math.floor(camRow) - 4; r < camRow + 16; r++) { const rw = row(r); if (rw.items) for (const it of rw.items) it.x += rw.v * dt; }
      if (P.hop > 0) P.hop = Math.max(0, P.hop - dt);
      const rw = row(P.row);
      if (!ended) {
        P.idle += dt;
        if (rw.type === 'river' && P.hop === 0) {
          const it = under(rw, P.x);
          if (!it) die('Swept away by the river', 'water');
          else { P.x += rw.v * dt; if (P.x < -0.4 || P.x > COLS - 0.6) die('Carried off by the current', 'water'); }
        }
        if (rw.type === 'road') for (const it of rw.items) { const ix = wrap(it.x); if (P.x + 0.32 > ix && P.x - 0.32 < ix + it.len) { die('Hit by a car', 'car'); break; } }
        if (P.idle > 7 && !gull) { gull = { t: 0 }; snd.squawk(); }
      }
      if (gull) { gull.t += dt; if (gull.t > 0.8 && !ended) die('A hungry gull spotted you dawdling', 'gull'); }
      camRow += (Math.max(camRow, P.row - 1) - camRow) * Math.min(1, dt * 4);
      if (P.row < camRow - 3.5 && !ended) die('Left behind', 'gull');
    }

    function draw(g) {
      const W = ctx.W, H = ctx.H, c = C();
      const r0 = Math.floor(camRow - (H * 0.28) / c) - 1, r1 = Math.ceil(camRow + (H * 0.72) / c) + 1;
      for (let r = r0; r <= r1; r++) {
        const rw = row(r), y = screenY(r) - c / 2;
        if (rw.type === 'grass') { g.fillStyle = r % 2 ? '#86cf5f' : '#7cc656'; g.fillRect(0, y, W, c + 1); for (const b of rw.blocks) sprite(g, 'tree_small_top', 0, (b + 0.5) * c, y + c / 2, c * 0.85, { anchor: 'center' }); }
        else if (rw.type === 'road') {
          g.fillStyle = '#5d626b'; g.fillRect(0, y, W, c + 1);
          g.fillStyle = 'rgba(255,255,255,.5)'; for (let x = 0; x < W; x += c) g.fillRect(x + c * 0.2, y + c / 2 - 1.5, c * 0.5, 3);
          for (const it of rw.items) { const ix = wrap(it.x); sprite(g, `car_${it.name}_top`, 0, (ix + it.len / 2) * c, y + c / 2, c * 0.44, { anchor: 'center', rot: rw.v > 0 ? 0 : Math.PI }); }
        } else {
          fillGrad(g, 0, y, 0, y + c, ['#4f9ad6', '#3d87c6']); g.fillRect(0, y, W, c + 1);
          g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2;
          for (let x = 0; x < W; x += c * 0.9) { const ox = ((x + t * rw.v * c * 0.6) % W + W) % W; g.beginPath(); g.moveTo(ox, y + c * 0.3); g.lineTo(ox + c * 0.3, y + c * 0.3); g.stroke(); }
          for (const it of rw.items) {
            const ix = wrap(it.x);
            if (it.pad) pic(g, 't_lilypad', (ix + 0.5) * c, y + c / 2, c * 0.95, { rot: ix * 0.7 });
            else pic(g, 't_log', (ix + it.len / 2) * c, y + c / 2, c * it.len);
          }
        }
      }
      // the turtle, with a little hop arc
      const k = P.hop > 0 ? 1 - P.hop / 0.13 : 1;
      const rr = P.fromRow + (P.row - P.fromRow) * k, px = (P.fromX + (P.x - P.fromX) * (P.hop > 0 ? k : 1));
      const lift = P.hop > 0 ? Math.sin(k * Math.PI) * c * 0.25 : 0;
      const sx = (px + 0.5) * c, sy = screenY(rr) - lift;
      if (P.dead === 'water') { g.globalAlpha = 0.5; }
      if (P.dead !== 'gull' || !gull || gull.t < 0.8) pic(g, 't_hatch', sx, sy, c * 0.8 * (P.dead === 'car' ? 1.1 : 1), { rot: P.face });
      g.globalAlpha = 1;
      if (gull) { const p = Math.min(1, gull.t / 0.8); pic(g, 't_gull_top', sx + (1 - p) * W, sy - (1 - p) * c * 2 - (gull.t > 0.8 ? (gull.t - 0.8) * c * 4 : 0), c * 2, { rot: Math.PI }); }
      fx.draw(g, { toScreen: (x, y) => [x, y], zoom: 1 });
    }
    return { update, draw, down, up };
  },
};
