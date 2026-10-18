// Delivery Dash: a top-down town. Hold and drag towards where you want to ride; the bike turns towards your
// finger and speeds up, and slows when you let go. Collect orders at shops (up to three at once) and deliver
// them to the glowing houses while they are still hot. A three-minute shift; tips are the score.
import { Camera, FX, sprite, snd, buzz, clamp, fmt, roundRect, rng, sizeOf } from '../yeti/kit.js';
import { drawBike, stat } from './kit.js';

const N = 7;              // blocks across and down
const P = 44;             // distance between road centrelines (m)
const RW = 11;            // road width including kerbs
const FOOT = 2.2;         // footpath around each block (rideable)
const SIZE = N * P;       // the map spans 0..SIZE on both axes (roads on the edges too)
const LANE = 2.4;         // car lane offset from the centreline (left side of the road)
const SHIFT = 180;        // seconds
const FOODS = ['burger', 'pizza', 'donut-sprinkles', 'fries', 'taco', 'hot-dog', 'sushi-salmon', 'ice-cream', 'cup-coffee', 'cake', 'sandwich', 'chinese', 'waffle', 'cupcake', 'soda', 'pancakes'];
const ORDER_COL = ['#ff8a1f', '#20b8c8', '#a35ce6'];
const CARS = ['sedan', 'taxi', 'van', 'suv', 'hatchback-sports', 'police', 'delivery', 'sedan-sports'];
const BIKE_R = 0.9;

export default {
  id: 'delivery', name: 'Delivery Dash', blurb: 'Pick up food and deliver it while it is still hot', unit: 'pts',
  theme: ['#a9dd8a', '#d6efc4', '#f3faec'],
  how: [
    'Hold anywhere and drag towards where you want to go. The bike turns towards your finger and speeds up. Let go to slow down.',
    'Shops with a food bubble have an order waiting. Ride up to the shop door to collect it. You can carry three orders at once.',
    'Each order goes to a glowing house. The arrows at the edge of the screen and the map in the corner show the way. Hot food earns bigger tips, so be quick.',
    'Cars drive on the left. Bumping one knocks you about and cools your food. The shift lasts three minutes.',
  ],
  thumb(g, w, h) {
    g.fillStyle = '#86c35f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5a5e66'; g.fillRect(0, h * 0.42, w, h * 0.26); g.fillRect(w * 0.42, 0, w * 0.22, h);
    sprite(g, 'house_c_top', 0, w * 0.18, h * 0.18, h / 15, { anchor: 'center' });
    sprite(g, 'shop_d_top', 0, w * 0.85, h * 0.85, h / 15, { anchor: 'center' });
    drawBike(g, w * 0.53, h * 0.55, h / 8, { view: 'top', rot: -0.5 });
    g.fillStyle = '#fff'; g.beginPath(); g.arc(w * 0.82, h * 0.28, h * 0.17, 0, 6.283); g.fill();
    sprite(g, 'food_pizza', 0, w * 0.82, h * 0.28, h * 0.22, { anchor: 'center' });
  },
  create(ctx) {
    const R = rng((Math.random() * 1e9) | 0);
    const sp = stat('speed'), pw = stat('power'), hd = stat('handling'), gp = stat('grip');
    const VMAX = 11 + 7 * sp, ACC = 6 + 7 * pw, TURN = 2.3 + 2 * hd, LATG = 7 + 7 * gp;
    const zoomBase = () => clamp(ctx.W / 46, 6.5, 12);
    const cam = new Camera(ctx, zoomBase()); cam.fx = 0.5; cam.fy = 0.55;
    const fx = new FX();

    // ---------- town ----------
    // block (i, j) spans x in [i*P + RW/2, (i+1)*P - RW/2] and the same for y. Kinds: houses, shops or a park.
    const blocks = [], shops = [], houses = [];
    const kinds = [];
    for (let k = 0; k < N * N; k++) kinds.push(k % 5 === 1 ? 'shops' : k % 7 === 3 ? 'park' : 'houses');
    for (let k = kinds.length - 1; k > 0; k--) { const j = (R() * (k + 1)) | 0; [kinds[k], kinds[j]] = [kinds[j], kinds[k]]; }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x0 = i * P + RW / 2, y0 = j * P + RW / 2, x1 = (i + 1) * P - RW / 2, y1 = (j + 1) * P - RW / 2;
      const kind = (i === 3 && j === 3) ? 'park' : kinds[i * N + j];
      const b = { i, j, x0, y0, x1, y1, kind, items: [] };
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, half = (x1 - x0) / 2;
      if (kind === 'houses') {
        // four lots; each house faces the nearer outside street, with its door on the footpath
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const hx = cx + sx * half * 0.5, hy = cy + sy * half * 0.5;
          const facingX = R() < 0.5;
          const door = facingX ? { x: cx + sx * (half - FOOT * 0.5), y: hy } : { x: hx, y: cy + sy * (half - FOOT * 0.5) };
          const h = { x: hx, y: hy, sprite: `house_${'abcdefghkl'[(R() * 10) | 0]}_top`, rot: ((R() * 4) | 0) * Math.PI / 2, hue: (R() * 360) | 0, door, block: b };
          houses.push(h); b.items.push(h);
        }
      } else if (kind === 'shops') {
        for (const s of [-1, 1]) {
          const along = R() < 0.5;
          const hx = along ? cx + s * half * 0.48 : cx, hy = along ? cy : cy + s * half * 0.48;
          const door = along ? { x: hx, y: cy + (R() < 0.5 ? -1 : 1) * (half - FOOT * 0.5) } : { x: cx + (R() < 0.5 ? -1 : 1) * (half - FOOT * 0.5), y: hy };
          const sh = { x: hx, y: hy, sprite: `shop_${'abcdefgh'[(R() * 8) | 0]}_top`, rot: ((R() * 4) | 0) * Math.PI / 2, hue: ((R() * 6) | 0) * 60, door, block: b, order: null, cool: R() * 6 };
          shops.push(sh); b.items.push(sh);
        }
      } else {
        for (let k = 0; k < 9; k++) b.items.push({ tree: true, x: x0 + 5 + R() * (x1 - x0 - 10), y: y0 + 5 + R() * (y1 - y0 - 10), small: R() < 0.4, rot: R() * 6 });
        b.pond = { x: cx + (R() - 0.5) * 6, y: cy + (R() - 0.5) * 6, r: 5 + R() * 3 };
      }
      blocks.push(b);
    }
    const blockAt = (x, y) => { const i = Math.floor(x / P), j = Math.floor(y / P); return i >= 0 && j >= 0 && i < N && j < N ? blocks[i * N + j] : null; };

    // ---------- the rider ----------
    const B = { x: 3 * P, y: 3 * P, a: Math.PI / 2, v: 0, stun: 0, lean: 0 }; // an intersection in the middle of town
    let finger = null, t = 0, left = SHIFT, tips = 0, delivered = 0, bag = [], ended = false, moved = false, thudT = 0, bumps = 0, colourNext = 0;

    // ---------- orders ----------
    function openOrders() {
      const waiting = shops.filter((s) => s.order).length;
      if (waiting >= 3) return;
      const free = shops.filter((s) => !s.order && s.cool <= 0);
      if (!free.length) return;
      // prefer shops not too far away so the player always has something within reach
      free.sort((a, b) => Math.hypot(a.door.x - B.x, a.door.y - B.y) - Math.hypot(b.door.x - B.x, b.door.y - B.y));
      const s = free[Math.min(free.length - 1, (R() * Math.min(4, free.length)) | 0)];
      s.order = { food: FOODS[(R() * FOODS.length) | 0], born: t };
    }
    function collect(s) {
      const far = houses.filter((h) => { const d = Math.hypot(h.door.x - s.door.x, h.door.y - s.door.y); return d > 50 && d < 230 && !bag.some((o) => o.house === h); });
      const house = far[(R() * far.length) | 0] || houses[0];
      const dist = Math.abs(house.door.x - s.door.x) + Math.abs(house.door.y - s.door.y);
      const limit = 14 + dist / (7 + 3 * sp);
      bag.push({ food: s.order.food, house, limit, time: limit, col: ORDER_COL[colourNext++ % 3] });
      s.order = null; s.cool = 4 + R() * 5;
      snd.pop(); snd.ding(1); buzz(15);
      fx.text(s.door.x, s.door.y + 3, 'Order collected', { color: '#fff', size: 18 });
    }
    function deliver(o) {
      const heat = clamp(o.time / o.limit, 0, 1);
      const tip = o.time > 0 ? Math.round(6 + 14 * heat + (heat > 0.6 ? 4 : 0)) : 2;
      tips += tip; delivered++;
      bag = bag.filter((x) => x !== o);
      snd.ding(4); snd.cheer(); buzz([20, 30, 20]);
      fx.stars(o.house.door.x, o.house.door.y, 16);
      fx.text(o.house.door.x, o.house.door.y + 3, o.time <= 0 ? `Cold food  +${tip}` : heat > 0.6 ? `Still hot!  +${tip}` : `Delivered  +${tip}`, { color: heat > 0.6 ? '#ffd447' : '#fff', size: 20 });
    }

    // ---------- traffic ----------
    // Cars move between intersections along the left lane and choose a new street at each one.
    const cars = [];
    const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    function addCar() {
      const horiz = R() < 0.5, line = ((R() * (N + 1)) | 0) * P, pos = ((R() * N) | 0) * P;
      const d = (R() * 2) | 0;
      const dir = horiz ? (d ? 0 : 2) : (d ? 1 : 3);
      const c = { nx: horiz ? pos : line, ny: horiz ? line : pos, dir, s: 0, v: 7 + R() * 4, name: CARS[(R() * CARS.length) | 0], wait: 0 };
      // don't spawn on top of the rider
      const p = carPos(c); if (Math.hypot(p.x - B.x, p.y - B.y) < 30) return;
      cars.push(c);
    }
    function carPos(c) {
      const [dx, dy] = DIRS[c.dir];
      return { x: c.nx + dx * c.s - dy * LANE, y: c.ny + dy * c.s + dx * LANE, a: Math.atan2(dy, dx) };
    }
    for (let k = 0; k < 18; k++) addCar();

    function bump(px, py) {
      if (B.stun > 0) return;
      B.stun = 0.8; bumps++;
      const ang = Math.atan2(B.y - py, B.x - px);
      B.x += Math.cos(ang) * 1.2; B.y += Math.sin(ang) * 1.2; B.v = -3;
      for (const o of bag) o.time = Math.max(0, o.time - 3);
      snd.thud(); snd.squawk(); buzz([40, 30, 40]); cam.shake(8, 0.3);
      fx.text(B.x, B.y + 2.5, 'Bump! Food cooled', { color: '#ff6b5e', size: 18 });
    }

    // ---------- update ----------
    ctx.prompt('Hold and drag towards where you want to ride');
    function update(dt) {
      t += dt; fx.update(dt); cam.update(dt);
      if (ended) return;
      left -= dt;
      if (left <= 0) { left = 0; return end(); }
      for (const s of shops) s.cool -= dt;
      if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) openOrders();
      for (const o of bag) o.time -= dt;

      // steering towards the finger
      B.stun = Math.max(0, B.stun - dt); thudT -= dt;
      let throttle = 0;
      if (finger && B.stun <= 0) {
        const [wx, wy] = cam.toWorld(finger[0], finger[1]);
        const d = Math.hypot(wx - B.x, wy - B.y);
        if (d > 1.5) {
          const want = Math.atan2(wy - B.y, wx - B.x);
          let da = want - B.a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
          const maxTurn = Math.min(TURN, LATG / Math.max(2, B.v)) * dt;
          const turn = clamp(da, -maxTurn, maxTurn);
          B.a += turn; B.lean += (clamp(turn / dt / TURN, -1, 1) - B.lean) * Math.min(1, dt * 8);
          throttle = Math.abs(da) > 2.2 ? 0.2 : clamp(d / 8, 0.25, 1);
        }
      } else B.lean *= 1 - Math.min(1, dt * 6);
      if (throttle > 0) B.v = Math.min(VMAX * throttle, B.v + ACC * dt) + (B.v > VMAX * throttle ? -9 * dt : 0);
      else B.v = Math.max(0, B.v - 9 * dt);
      if (B.v < 0) B.v = Math.min(0, B.v + 12 * dt);
      B.x += Math.cos(B.a) * B.v * dt; B.y += Math.sin(B.a) * B.v * dt;
      B.x = clamp(B.x, -RW / 2 + BIKE_R, SIZE + RW / 2 - BIKE_R); B.y = clamp(B.y, -RW / 2 + BIKE_R, SIZE + RW / 2 - BIKE_R);
      // the solid part of a block is inside the footpath
      for (const b of [blockAt(B.x, B.y), blockAt(B.x + 3, B.y), blockAt(B.x - 3, B.y), blockAt(B.x, B.y + 3), blockAt(B.x, B.y - 3)]) {
        if (!b) continue;
        const x0 = b.x0 + FOOT, x1 = b.x1 - FOOT, y0 = b.y0 + FOOT, y1 = b.y1 - FOOT;
        const nx = clamp(B.x, x0, x1), ny = clamp(B.y, y0, y1), dx = B.x - nx, dy = B.y - ny, d = Math.hypot(dx, dy);
        if (d < BIKE_R) {
          if (d > 0.001) { B.x = nx + dx / d * BIKE_R; B.y = ny + dy / d * BIKE_R; }
          else { const pushes = [[x0 - BIKE_R - B.x, 0], [x1 + BIKE_R - B.x, 0], [0, y0 - BIKE_R - B.y], [0, y1 + BIKE_R - B.y]].sort((a, c) => Math.hypot(...a) - Math.hypot(...c)); B.x += pushes[0][0]; B.y += pushes[0][1]; }
          if (B.v > 6 && thudT <= 0) { snd.thud(); thudT = 0.5; fx.dust(B.x, B.y, 6); }
          B.v *= 0.6;
        }
      }
      if (B.v > 2) moved = true;
      if (moved && t > 3) ctx.prompt('');

      // pickups and drop-offs
      for (const s of shops) if (s.order && bag.length < 3 && Math.hypot(s.door.x - B.x, s.door.y - B.y) < 4.2) collect(s);
      for (const o of [...bag]) if (Math.hypot(o.house.door.x - B.x, o.house.door.y - B.y) < 4.2) deliver(o);
      if (bag.length >= 3 && shops.some((s) => s.order && Math.hypot(s.door.x - B.x, s.door.y - B.y) < 4.2) && Math.floor(t * 2) !== Math.floor((t - dt) * 2)) fx.text(B.x, B.y + 2, 'Bag full', { color: '#ffd447', size: 16, life: 0.8 });

      // traffic
      if (cars.length < 18 && R() < dt) addCar();
      for (const c of cars) {
        const p = carPos(c);
        // slow for the rider just ahead
        const ahead = Math.hypot(B.x - (p.x + Math.cos(p.a) * 5), B.y - (p.y + Math.sin(p.a) * 5)) < 4;
        const sv = ahead ? 0 : c.v;
        c.s += sv * dt;
        if (c.s >= P) {
          const [dx, dy] = DIRS[c.dir];
          c.nx += dx * P; c.ny += dy * P; c.s -= P;
          const opts = [c.dir, (c.dir + 1) % 4, (c.dir + 3) % 4].filter((d) => { const [ex, ey] = DIRS[d]; const x = c.nx + ex * P, y = c.ny + ey * P; return x >= 0 && y >= 0 && x <= SIZE && y <= SIZE; });
          c.dir = opts.length ? opts[(R() * opts.length) | 0] : (c.dir + 2) % 4;
        }
        // collision with the rider (car as two circles along its length)
        for (const k of [-1.2, 1.2]) { const cx = p.x + Math.cos(p.a) * k, cy = p.y + Math.sin(p.a) * k; if (Math.hypot(cx - B.x, cy - B.y) < 1.15 + BIKE_R * 0.7) { bump(cx, cy); break; } }
      }

      // camera looks a little ahead of the bike
      cam.follow(B.x + Math.cos(B.a) * B.v * 0.35, B.y + Math.sin(B.a) * B.v * 0.35, dt, 4);
      cam.zoomTo(zoomBase() * (1 - B.v / 90), dt, 1.5);
      const mm = Math.floor(left / 60), ss = Math.floor(left % 60);
      ctx.hud({ left: `${fmt(tips)} pts`, center: `${mm}:${String(ss).padStart(2, '0')}`, right: `Bag ${bag.length}/3` });
    }
    function end() {
      if (ended) return; ended = true;
      snd.cheer();
      ctx.finish(tips, `${delivered} ${delivered === 1 ? 'delivery' : 'deliveries'}${bumps ? `, ${bumps} ${bumps === 1 ? 'bump' : 'bumps'}` : ', no bumps'}`, { coins: Math.round(tips * 0.6) });
    }

    // ---------- drawing ----------
    function draw(g) {
      const z = cam.zoom;
      g.fillStyle = '#7cbf55'; g.fillRect(0, 0, ctx.W, ctx.H);
      const L = cam.left - 6, Rt = cam.right + 6, T = cam.top + 6, Bm = cam.bottom - 6;
      // outside the town: a hedge
      g.fillStyle = '#5c9e43';
      const [ox0, oy0] = cam.toScreen(-RW / 2, SIZE + RW / 2), [ox1, oy1] = cam.toScreen(SIZE + RW / 2, -RW / 2);
      g.fillRect(0, 0, ctx.W, Math.max(0, oy0)); g.fillRect(0, oy1, ctx.W, ctx.H); g.fillRect(0, 0, Math.max(0, ox0), ctx.H); g.fillRect(ox1, 0, ctx.W, ctx.H);
      // roads
      g.fillStyle = '#5a5e66';
      for (let k = 0; k <= N; k++) {
        const c = k * P;
        if (c + RW / 2 >= L && c - RW / 2 <= Rt) { const [x0] = cam.toScreen(c - RW / 2, 0), [x1] = cam.toScreen(c + RW / 2, 0); g.fillRect(x0, oy0, x1 - x0, oy1 - oy0); }
        if (c + RW / 2 >= Bm && c - RW / 2 <= T) { const [, y0] = cam.toScreen(0, c + RW / 2), [, y1] = cam.toScreen(0, c - RW / 2); g.fillRect(ox0, y0, ox1 - ox0, y1 - y0); }
      }
      // lane lines: dashed centre lines between intersections
      g.fillStyle = 'rgba(255,255,255,.85)';
      const dw = Math.max(1.5, z * 0.22);
      for (let k = 0; k <= N; k++) for (let m = 0; m < N; m++) {
        const c = k * P, a = m * P + RW / 2 + 1, b = (m + 1) * P - RW / 2 - 1;
        for (let s = a; s < b; s += 4) {
          if (c >= L && c <= Rt && s >= Bm && s <= T) { const [x, y] = cam.toScreen(c, s + 2); g.fillRect(x - dw / 2, y, dw, 2 * z); }
          if (c >= Bm && c <= T && s >= L && s <= Rt) { const [x, y] = cam.toScreen(s, c); g.fillRect(x, y - dw / 2, 2 * z, dw); }
        }
      }
      // blocks
      for (const b of blocks) {
        if (b.x1 < L || b.x0 > Rt || b.y1 < Bm || b.y0 > T) continue;
        const [x0, y0] = cam.toScreen(b.x0, b.y1), [x1, y1] = cam.toScreen(b.x1, b.y0);
        g.fillStyle = '#d9d6cf'; roundRect(g, x0, y0, x1 - x0, y1 - y0, z * 1.5); g.fill();
        const f = FOOT * z;
        g.fillStyle = b.kind === 'park' ? '#8fd16a' : b.kind === 'shops' ? '#c9c3b8' : '#9ad377';
        roundRect(g, x0 + f, y0 + f, x1 - x0 - 2 * f, y1 - y0 - 2 * f, z); g.fill();
        if (b.pond) { const [px, py] = cam.toScreen(b.pond.x, b.pond.y); g.fillStyle = '#5fb7e8'; g.beginPath(); g.ellipse(px, py, b.pond.r * z, b.pond.r * z * 0.7, 0.3, 0, 6.283); g.fill(); g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2; g.stroke(); }
        for (const it of b.items) {
          const [ix, iy] = cam.toScreen(it.x, it.y);
          if (it.tree) { sprite(g, it.small ? 'tree_small_top' : 'tree_top', 0, ix, iy, z * 2.6, { anchor: 'center', rot: it.rot }); continue; }
          if (it.hue) g.filter = `hue-rotate(${it.hue}deg)`;
          sprite(g, it.sprite, 0, ix, iy, z, { anchor: 'center', rot: it.rot });
          g.filter = 'none';
        }
      }
      // drop-off glows and pickup bubbles
      for (const o of bag) {
        const [hx, hy] = cam.toScreen(o.house.door.x, o.house.door.y), pulse = 1 + Math.sin(t * 6) * 0.12;
        g.strokeStyle = o.col; g.lineWidth = 4; g.globalAlpha = 0.85; g.beginPath(); g.arc(hx, hy, 4.2 * z * pulse, 0, 6.283); g.stroke();
        g.fillStyle = o.col; g.globalAlpha = 0.18; g.fill(); g.globalAlpha = 1;
        const [cx, cy] = cam.toScreen(o.house.x, o.house.y);
        g.strokeStyle = o.col; g.lineWidth = 5; g.globalAlpha = 0.5 + Math.sin(t * 6) * 0.2; const hs = sizeOf(o.house.sprite);
        roundRect(g, cx - hs.w * z / 2, cy - hs.h * z / 2, hs.w * z, hs.h * z, 6); g.stroke(); g.globalAlpha = 1;
      }
      for (const s of shops) {
        if (!s.order) continue;
        const [dx, dy] = cam.toScreen(s.door.x, s.door.y);
        g.strokeStyle = '#ffd447'; g.lineWidth = 3; g.setLineDash([6, 5]); g.beginPath(); g.arc(dx, dy, 4.2 * z, 0, 6.283); g.stroke(); g.setLineDash([]);
        const by = dy - 3.4 * z + Math.sin(t * 4 + s.x) * 3;
        g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.arc(dx + 2, by + 3, 2 * z, 0, 6.283); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(dx, by, 2 * z, 0, 6.283); g.fill();
        g.beginPath(); g.moveTo(dx - z * 0.6, by + z * 1.7); g.lineTo(dx, by + z * 2.7); g.lineTo(dx + z * 0.6, by + z * 1.7); g.fill();
        sprite(g, `food_${s.order.food}`, 0, dx, by, z * 2.6, { anchor: 'center' });
      }
      // traffic
      for (const c of cars) {
        const p = carPos(c); if (p.x < L || p.x > Rt || p.y < Bm || p.y > T) continue;
        const [x, y] = cam.toScreen(p.x, p.y);
        g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(x + 3, y + 4, z * 2.1, z * 1.2, -p.a, 0, 6.283); g.fill();
        sprite(g, `car_${c.name}_top`, 0, x, y, z * 1.1, { anchor: 'center', rot: -p.a });
      }
      // the rider
      const [bx, by] = cam.toScreen(B.x, B.y);
      g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(bx + 3, by + 4, z * 1.9, z * 0.85, -B.a, 0, 6.283); g.fill();
      drawBike(g, bx, by, z * 2, { view: 'top', rot: -B.a, alpha: B.stun > 0 && Math.floor(t * 12) % 2 ? 0.5 : 1 });
      // food box on the back
      if (bag.length) { const bxx = bx - Math.cos(B.a) * z * 1.4, byy = by + Math.sin(B.a) * z * 1.4; g.save(); g.translate(bxx, byy); g.rotate(-B.a); g.fillStyle = '#e8452c'; roundRect(g, -z * 0.5, -z * 0.45, z, z * 0.9, 3); g.fill(); g.fillStyle = '#fff'; g.fillRect(-z * 0.08, -z * 0.45, z * 0.16, z * 0.9); g.restore(); }
      fx.draw(g, cam);
      drawPointers(g); drawBag(g); drawMap(g);
    }
    // arrows at the screen edge for targets that are off screen
    function drawPointers(g) {
      const targets = [...bag.map((o) => ({ x: o.house.door.x, y: o.house.door.y, col: o.col, food: o.food })), ...(bag.length < 3 ? shops.filter((s) => s.order).map((s) => ({ x: s.door.x, y: s.door.y, col: '#ffd447', food: s.order.food })) : [])];
      const m = 30, top = 52;
      for (const p of targets) {
        const [sx, sy] = cam.toScreen(p.x, p.y);
        if (sx > m && sx < ctx.W - m && sy > top && sy < ctx.H - m) continue;
        const cx = ctx.W / 2, cy = ctx.H / 2, a = Math.atan2(sy - cy, sx - cx);
        const k = Math.min((ctx.W / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (ctx.H / 2 - m - 14) / Math.abs(Math.sin(a) || 1e-6));
        const x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k;
        g.save(); g.translate(x, y);
        g.fillStyle = p.col; g.strokeStyle = 'rgba(40,20,5,.6)'; g.lineWidth = 2;
        g.beginPath(); g.arc(0, 0, 17, 0, 6.283); g.fill(); g.stroke();
        g.save(); g.rotate(a); g.beginPath(); g.moveTo(27, 0); g.lineTo(17, -7); g.lineTo(17, 7); g.closePath(); g.fill(); g.stroke(); g.restore();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 13, 0, 6.283); g.fill();
        sprite(g, `food_${p.food}`, 0, 0, 0, 20, { anchor: 'center' });
        g.restore();
      }
    }
    // the orders being carried, with heat bars
    function drawBag(g) {
      const y = ctx.H - 52;
      bag.forEach((o, i) => {
        const x = 12 + i * 70, heat = clamp(o.time / o.limit, 0, 1);
        g.fillStyle = 'rgba(40,22,10,.6)'; roundRect(g, x, y, 62, 42, 12); g.fill();
        g.fillStyle = o.col; g.beginPath(); g.arc(x + 14, y + 14, 6, 0, 6.283); g.fill();
        sprite(g, `food_${o.food}`, 0, x + 36, y + 18, 26, { anchor: 'center' });
        g.fillStyle = 'rgba(255,255,255,.25)'; roundRect(g, x + 7, y + 32, 48, 5, 2.5); g.fill();
        g.fillStyle = heat > 0.6 ? '#ff7a2a' : heat > 0.25 ? '#ffd447' : '#8fc7ff'; roundRect(g, x + 7, y + 32, Math.max(5, 48 * heat), 5, 2.5); g.fill();
      });
    }
    function drawMap(g) {
      const S = 86, x0 = ctx.W - S - 10, y0 = 44, k = S / (SIZE + RW);
      g.fillStyle = 'rgba(40,22,10,.55)'; roundRect(g, x0 - 4, y0 - 4, S + 8, S + 8, 10); g.fill();
      g.fillStyle = '#86c35f'; g.fillRect(x0, y0, S, S);
      g.fillStyle = '#d0ccc4';
      const mx = (x) => x0 + (x + RW / 2) * k, my = (y) => y0 + S - (y + RW / 2) * k;
      for (let i = 0; i <= N; i++) { g.fillRect(mx(i * P) - 1.5, y0, 3, S); g.fillRect(x0, my(i * P) - 1.5, S, 3); }
      for (const s of shops) if (s.order) { g.fillStyle = '#ffd447'; g.beginPath(); g.arc(mx(s.door.x), my(s.door.y), 3.2, 0, 6.283); g.fill(); }
      for (const o of bag) { g.fillStyle = o.col; g.beginPath(); g.arc(mx(o.house.door.x), my(o.house.door.y), 3.6, 0, 6.283); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.stroke(); }
      g.save(); g.translate(mx(B.x), my(B.y)); g.rotate(-B.a); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(5, 0); g.lineTo(-3.5, -3.5); g.lineTo(-3.5, 3.5); g.closePath(); g.fill(); g.restore();
    }
    return {
      update, draw,
      down(x, y) { finger = [x, y]; },
      move(x, y) { finger = [x, y]; },
      up() { finger = null; },
    };
  },
};
