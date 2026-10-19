// Shell Match: a memory game. Turn over two cards at a time and find every pair of turtle pictures.
// Three board sizes; bigger boards and quicker finishes score more.
import { snd, buzz, clamp, pic, fillGrad, roundRect, FX } from './kit.js';

export const MATCH_PICS = ['t_sea', 't_tort', 't_box', 't_hatch', 't_front', 't_tort_front', 't_tort_top', 't_swim', 't_grey', 't_long'];
const SIZES = [{ label: 'Small', cols: 3, rows: 4 }, { label: 'Medium', cols: 4, rows: 4 }, { label: 'Large', cols: 4, rows: 5 }];

export default {
  id: 'match', name: 'Shell Match', blurb: 'Find the pairs of turtle pictures', unit: 'pts',
  theme: ['#5fb7a6', '#a8e0cf', '#f1e8c9'],
  how: [
    'Choose a board size, then tap two cards to turn them over. If the pictures match, they stay face up.',
    'Find every pair. You score points for each pair, a bonus for finishing quickly, and lose a few points for each wrong guess.',
    'Large boards are worth the most.',
  ],
  thumb(g, w, h) {
    const cw = w * 0.22, ch = h * 0.7;
    [[0.2, 't_sea'], [0.45, null], [0.7, 't_sea']].forEach(([fx0, p]) => {
      g.fillStyle = p ? '#fffaf0' : '#2f8f7a'; roundRect(g, w * fx0 - cw / 2 + w * 0.05, h * 0.15, cw, ch, 6); g.fill();
      if (p) pic(g, p, w * fx0 + w * 0.05, h * 0.5, cw * 0.85);
    });
  },
  create(ctx) {
    const fx = new FX(), cam = { toScreen: (x, y) => [x, y], zoom: 1 };
    let mode = 'pick', size = null, cards = [], open = [], lock = 0, t = 0, time = 0, misses = 0, found = 0, ended = false;
    ctx.hud({ left: ctx.best ? `Best ${ctx.best}` : '' });

    function start(sz) {
      size = sz; mode = 'play'; time = 0; misses = 0; found = 0;
      const pairs = (sz.cols * sz.rows) / 2;
      const pics = MATCH_PICS.slice().sort(() => Math.random() - 0.5).slice(0, pairs);
      const deck = [...pics, ...pics].sort(() => Math.random() - 0.5);
      cards = deck.map((p, i) => ({ p, i, up: false, done: false, flip: 0 }));
      snd.swoosh();
    }
    function geom() {
      const top = 54, pad = 12, W = ctx.W - pad * 2, H = ctx.H - top - pad - 20;
      const cw = Math.min(W / size.cols, (H / size.rows) * 0.78), ch = cw / 0.78;
      const x0 = (ctx.W - cw * size.cols) / 2, y0 = top + (H - ch * size.rows) / 2;
      return { cw, ch, x0, y0 };
    }
    function buttons() {
      const bw = Math.min(ctx.W * 0.7, 280), bh = 64, x = (ctx.W - bw) / 2;
      return SIZES.map((s, i) => ({ s, x, y: ctx.H * 0.36 + i * (bh + 16), w: bw, h: bh }));
    }
    const pairs = () => (size.cols * size.rows) / 2;
    const scoreNow = () => Math.max(pairs() * 20, Math.round(pairs() * 100 + Math.max(0, pairs() * 7 - time) * 15 - misses * 10));

    function down(x, y) {
      if (mode === 'pick') { const b = buttons().find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h); if (b) start(b.s); return; }
      if (mode !== 'play' || lock > 0) return;
      const { cw, ch, x0, y0 } = geom();
      const c = Math.floor((x - x0) / cw), r = Math.floor((y - y0) / ch);
      if (c < 0 || r < 0 || c >= size.cols || r >= size.rows) return;
      const card = cards[r * size.cols + c];
      if (!card || card.up || card.done) return;
      card.up = true; open.push(card); snd.tick(); buzz(5);
      if (open.length === 2) {
        const [a, b] = open;
        if (a.p === b.p) {
          a.done = b.done = true; open = []; found++; snd.ding(found); buzz(12);
          const cx = x0 + ((b.i % size.cols) + 0.5) * cw, cy = y0 + (Math.floor(b.i / size.cols) + 0.5) * ch;
          fx.burst(cx, cy, { n: 10, color: ['#ffd447', '#ffffff'], speed: 120, up: 0, size: 3, life: 0.6, grav: 0 });
          if (found === pairs()) { mode = 'done'; ended = true; const s = scoreNow(); setTimeout(() => ctx.finish(s, `${size.label} board in ${Math.round(time)} s with ${misses} wrong guess${misses === 1 ? '' : 'es'}`), 500); }
        } else { misses++; lock = 0.8; }
      }
    }

    function update(dt) {
      t += dt; fx.update(dt);
      if (mode === 'play') time += dt;
      if (lock > 0) { lock -= dt; if (lock <= 0) { for (const c of open) c.up = false; open = []; } }
      for (const c of cards) c.flip += ((c.up || c.done ? 1 : 0) - c.flip) * Math.min(1, dt * 14);
      if (mode === 'play') ctx.hud({ left: ctx.best ? `Best ${ctx.best}` : '', center: `${Math.floor(time)} s`, right: `${found} of ${pairs()} pairs` });
    }

    function back(g, x, y, w, h) {
      fillGrad(g, x, y, x, y + h, ['#3aa48c', '#25745f']); roundRect(g, x, y, w, h, 10); g.fill();
      // a shell pattern of hexagons
      g.save(); roundRect(g, x, y, w, h, 10); g.clip();
      g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 2;
      const r = w * 0.16;
      for (let yy = y; yy < y + h + r; yy += r * 1.5) for (let xx = x + ((Math.round((yy - y) / (r * 1.5)) % 2) * r * 0.87); xx < x + w + r; xx += r * 1.74) {
        g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(xx + Math.cos(a) * r, yy + Math.sin(a) * r); } g.closePath(); g.stroke();
      }
      g.restore();
    }
    function draw(g) {
      const W = ctx.W, H = ctx.H;
      fillGrad(g, 0, 0, 0, H, ['#bfe9dc', '#e8f6ef', '#f6eedb']); g.fillRect(0, 0, W, H);
      if (mode === 'pick') {
        g.textAlign = 'center'; g.fillStyle = '#21594c'; g.font = '900 24px system-ui, sans-serif'; g.fillText('Choose a board', W / 2, H * 0.27);
        pic(g, 't_front', W / 2, H * 0.16, Math.min(W * 0.3, 120));
        for (const b of buttons()) {
          g.fillStyle = '#2f9a80'; roundRect(g, b.x, b.y + 4, b.w, b.h, 18); g.fillStyle = '#1f6f5b'; g.fill();
          g.fillStyle = '#35ac8f'; roundRect(g, b.x, b.y, b.w, b.h, 18); g.fill();
          g.fillStyle = '#fff'; g.font = '800 20px system-ui, sans-serif'; g.fillText(b.s.label, b.x + b.w / 2, b.y + 28);
          g.font = '600 13px system-ui, sans-serif'; g.fillText(`${(b.s.cols * b.s.rows) / 2} pairs`, b.x + b.w / 2, b.y + 48);
        }
        return;
      }
      const { cw, ch, x0, y0 } = geom(), m = 5;
      for (const c of cards) {
        const cx = x0 + (c.i % size.cols) * cw + m, cy = y0 + Math.floor(c.i / size.cols) * ch + m, w = cw - m * 2, h = ch - m * 2;
        const k = Math.cos(c.flip * Math.PI), sx = Math.abs(k);
        g.save(); g.translate(cx + w / 2, cy + h / 2); g.scale(Math.max(0.02, sx), 1); g.translate(-(cx + w / 2), -(cy + h / 2));
        if (k > 0) back(g, cx, cy, w, h);
        else {
          g.fillStyle = c.done ? '#fff6d8' : '#fffdf6'; roundRect(g, cx, cy, w, h, 10); g.fill();
          g.strokeStyle = c.done ? '#f0c24a' : 'rgba(0,0,0,.12)'; g.lineWidth = 2; g.stroke();
          pic(g, c.p, cx + w / 2, cy + h / 2, w * 0.82);
        }
        g.restore();
      }
      fx.draw(g, cam);
    }
    return { update, draw, down };
  },
};
