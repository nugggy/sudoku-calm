// Rush Hour Rider: top-down highway, riding up the screen through traffic on the left side of the road.
// Follow the finger left and right to change lanes. Near misses build a combo, oncoming lanes on two-way
// stretches score double, roadworks close lanes, trucks and police change lanes. One touch of anything ends it.
import { Camera, FX, sprite, snd, buzz, clamp, fmt, roundRect, sizeOf } from '../yeti/kit.js';
import { drawBike, stat, coinIcon } from './kit.js';

const LW = 3.3;            // lane width (m)
const CS = 1.12, BS = 1.45; // cartoon scale for cars and the bike, so they read well on a phone
const LANES = 4;
const ROAD = LW * LANES;    // road width; x = 0 is the left edge of the road
const SHOULDER = 1.4;       // sealed shoulder each side the bike may use
const UP = -Math.PI / 2;    // sprites face right; this turns them to face up the screen
const CARS = ['sedan', 'taxi', 'van', 'suv', 'hatchback-sports', 'sedan-sports', 'suv-luxury', 'delivery', 'ambulance'];
const TRUCKS = ['truck', 'garbage-truck', 'firetruck'];
const laneX = (l) => LW * (l + 0.5);

// Two-way stretches: the two right lanes carry oncoming traffic. Roadworks: one lane closed for a while.
const TWO_WAY = [];
for (let k = 0, y = 1100; k < 40; k++, y += 1300 + (k % 3) * 250) TWO_WAY.push([y, y + 420 + (k % 2) * 120]);
const twoWayAt = (y) => TWO_WAY.find(([a, b]) => y >= a && y <= b) || null;
const WORKS = [];
for (let k = 0, y = 520; k < 60; k++, y += 560 + ((k * 137) % 300)) { if (!TWO_WAY.some(([a, b]) => y > a - 160 && y < b + 120)) WORKS.push({ a: y, b: y + 70 + (k % 3) * 25, lane: (k * 7 + 1) % LANES }); }
const worksAt = (y) => WORKS.filter((w) => y >= w.a - 12 && y <= w.b);
// is lane l closed (or oncoming) at distance y for traffic going our way?
const laneOpen = (l, y) => !(twoWayAt(y) && l >= 2) && !WORKS.some((w) => w.lane === l && y >= w.a - 25 && y <= w.b + 5);

export default {
  id: 'traffic', name: 'Rush Hour Rider', blurb: 'Weave through the traffic as the speed keeps climbing', unit: 'pts',
  theme: ['#9bd27a', '#c9e7a8', '#eef7e2'],
  how: [
    'Hold anywhere and slide your finger left and right: the bike follows it across the lanes. Your speed keeps climbing.',
    'Pass close to cars for near misses. Chain them quickly for a combo. On two-way stretches the right lanes carry oncoming traffic and score double, if you dare.',
    'Watch for roadworks closing a lane, trucks indicating before they change lanes and police cars weaving about. Grab coins on the way. One touch of a car, cone or barrier ends the ride.',
    'Faster bikes reach higher speeds, and bikes with better handling and grip change lanes more sharply.',
  ],
  thumb(g, w, h) {
    g.fillStyle = '#4b4f57'; g.fillRect(w * 0.12, 0, w * 0.76, h);
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.setLineDash([8, 8]);
    for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(w * (0.12 + 0.253 * i), 0); g.lineTo(w * (0.12 + 0.253 * i), h); g.stroke(); }
    g.setLineDash([]);
    sprite(g, 'car_taxi_top', 0, w * 0.25, h * 0.3, h / 9, { anchor: 'center', rot: UP });
    sprite(g, 'car_truck_top', 0, w * 0.75, h * 0.42, h / 9, { anchor: 'center', rot: UP });
    drawBike(g, w * 0.5, h * 0.72, h / 7.5, { view: 'top', rot: UP - 0.15 });
  },
  create(ctx) {
    const cam = new Camera(ctx, 22); cam.fx = 0.5; cam.fy = 0.8;
    const fx = new FX();
    const sp = stat('speed'), pw = stat('power'), hd = stat('handling'), gr = stat('grip');
    const VMAX = 30 + 14 * sp, ACC = 0.55 + 0.6 * pw;            // m/s, m/s per second of climb
    const LAT = 9 + 6 * hd, LATACC = 30 + 30 * gr;               // sideways speed and how quickly it responds
    const B = { x: laneX(0), y: 0, v: 17, vx: 0, tx: laneX(0), crashed: false, spin: 0, crashT: 0 };
    let cars = [], coins = [], t = 0, score = 0, dist = 0, combo = 0, comboT = 0, nearCount = 0, coinGot = 0, ended = false, steered = false, spawnY = 40, coinY = 120;
    let finger = null;

    function zoomFor() { return clamp(ctx.W / (ROAD + SHOULDER * 2 + 5.5), 14, 34); }
    cam.zoom = zoomFor();
    ctx.prompt('Hold and slide left or right to steer');

    function addCar(y, lane, oncoming) {
      const truck = !oncoming && Math.random() < 0.18;
      const police = !truck && Math.random() < (dist > 600 ? 0.1 : 0.03);
      const name = truck ? TRUCKS[(Math.random() * TRUCKS.length) | 0] : police ? 'police' : CARS[(Math.random() * CARS.length) | 0];
      const s = sizeOf(`car_${name}_top`);
      const base = oncoming ? -(15 + Math.random() * 7) : 11 + lane * 2.4 + Math.random() * 4 + Math.min(6, dist / 900);
      cars.push({ name, x: laneX(lane), y, lane, v: base, len: s.w * CS, wid: Math.min(2.05, s.h * 0.82) * CS, oncoming, truck, police, target: lane, blink: 0, nextMove: 2 + Math.random() * 5, passed: false, wobble: Math.random() * 6 });
    }
    // Spawns a "row" of traffic ahead, always leaving at least one open lane that is reachable.
    function spawnRow(y) {
      const tw = twoWayAt(y);
      const open = [...Array(LANES).keys()].filter((l) => laneOpen(l, y));
      const density = Math.min(0.62, 0.3 + dist / 9000);
      const picks = open.filter(() => Math.random() < density);
      if (picks.length >= open.length) picks.splice((Math.random() * picks.length) | 0, 1);
      for (const l of picks) addCar(y + Math.random() * 6, l, false);
      if (tw) for (const l of [2, 3]) if (Math.random() < 0.38) addCar(y + 40 + Math.random() * 20, l, true);
    }
    function addCoinLine(y) {
      const l = (Math.random() * LANES) | 0;
      if (!laneOpen(l, y) || !laneOpen(l, y + 30)) return;
      for (let i = 0; i < 6; i++) coins.push({ x: laneX(l), y: y + i * 5, got: false });
    }

    function crash(what) {
      if (B.crashed) return;
      B.crashed = true; B.crashT = 0; B.spin = (Math.random() < 0.5 ? -1 : 1) * 9;
      snd.thud(); snd.crunch(); buzz([60, 40, 90]); cam.shake(14, 0.5);
      fx.burst(B.x, B.y + 1, { n: 26, color: ['#ffd447', '#ff9f43', '#fff'], speed: 9, up: 0, size: 0.14, life: 0.7, grav: 0 });
      fx.text(ROAD / 2, B.y + 4, what, { color: '#ff6b5e', size: 24 });
      setTimeout(() => finish(what), 900);
    }
    function finish(what) {
      if (ended) return; ended = true;
      const total = Math.round(score);
      const coinsEarned = Math.round(total / 14) + coinGot; // a decent run of 500 pts pays about 40 coins
      ctx.finish(total, `${fmt(dist)} m ridden, ${nearCount} near ${nearCount === 1 ? 'miss' : 'misses'}. ${what}`, { coins: coinsEarned });
    }

    function update(dt) {
      t += dt; fx.update(dt); cam.update(dt);
      if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }
      if (B.crashed) {
        B.crashT += dt; B.v = Math.max(0, B.v - 40 * dt); B.y += B.v * dt; B.spin *= 0.97;
        cam.follow(ROAD / 2, B.y, dt, 6);
        return;
      }
      // speed climbs steadily towards the bike's top speed
      B.v = Math.min(VMAX, B.v + ACC * dt * (B.v < 24 ? 2.2 : 1));
      // steering: chase the finger's x
      if (finger !== null) B.tx = clamp(cam.toWorld(finger, 0)[0], -SHOULDER + 0.5, ROAD + SHOULDER - 0.5);
      const want = clamp((B.tx - B.x) * 6, -LAT, LAT);
      B.vx += clamp(want - B.vx, -LATACC * dt, LATACC * dt);
      B.x = clamp(B.x + B.vx * dt, -SHOULDER + 0.45, ROAD + SHOULDER - 0.45);
      const dy = B.v * dt; B.y += dy; dist += dy;
      const tw = twoWayAt(B.y), inOncoming = tw && B.x > LW * 2 - 0.2;
      score += dy * 0.5 * (inOncoming ? 2 : 1);
      if (inOncoming && Math.random() < dt * 2) fx.text(B.x, B.y + 4, 'x2', { color: '#ffd447', size: 16, life: 0.6 });

      // traffic ahead
      while (spawnY < B.y + 90) { spawnRow(spawnY); spawnY += clamp(26 - dist / 600, 13, 26) + Math.random() * 10; }
      while (coinY < B.y + 90) { if (Math.random() < 0.55) addCoinLine(coinY); coinY += 90 + Math.random() * 80; }
      for (const c of cars) {
        c.y += c.v * dt;
        if (!c.oncoming) {
          // merge out of lanes that are closing ahead (roadworks or the start of a two-way stretch)
          if (c.target === c.lane && (!laneOpen(c.lane, c.y + 35) || (c.police && (c.nextMove -= dt) < 0) || (c.truck && (c.nextMove -= dt) < 0))) {
            const opts = [c.lane - 1, c.lane + 1].filter((l) => l >= 0 && l < LANES && laneOpen(l, c.y + 35) && !cars.some((o) => o !== c && !o.oncoming && Math.abs(laneX(l) - o.x) < 1.6 && Math.abs(o.y - c.y) < 10));
            if (opts.length) { c.target = opts[(Math.random() * opts.length) | 0]; c.blink = c.police ? 0.4 : 1.1; }
            c.nextMove = c.police ? 1.5 + Math.random() * 2.5 : 4 + Math.random() * 6;
            if (!laneOpen(c.lane, c.y + 10) && c.target === c.lane) c.v = Math.max(0, c.v - 12 * dt); // stuck: brake
          }
          if (c.blink > 0) c.blink -= dt;
          else if (c.target !== c.lane) {
            const tx = laneX(c.target), s = Math.sign(tx - c.x), mv = (c.police ? 4 : 2.4) * dt;
            if (Math.abs(tx - c.x) <= mv) { c.x = tx; c.lane = c.target; } else c.x += s * mv;
          }
          // don't drive into the back of the car in front
          const ahead = cars.find((o) => o !== c && !o.oncoming && Math.abs(o.x - c.x) < 1.5 && o.y > c.y && o.y - c.y < c.len + 4);
          if (ahead) c.v = Math.min(c.v, ahead.v);
        }
        // near miss: we just went past it, close and fast
        const rel = c.oncoming ? B.v - c.v : B.v - c.v;
        const side = Math.abs(c.x - B.x) - c.wid / 2 - 0.4;
        if (!c.passed && B.y > c.y && rel > 4) {
          c.passed = true;
          if (side < 1.25 && side > -0.2) {
            combo = Math.min(combo + 1, 10); comboT = 3; nearCount++;
            const pts = 40 * combo * (c.oncoming ? 2 : 1);
            score += pts; snd.ding(combo); buzz(12);
            fx.text(B.x + (c.x > B.x ? -1.5 : 1.5), B.y + 2.5, combo > 1 ? `Near miss x${combo}  +${pts}` : `Near miss +${pts}`, { color: c.oncoming ? '#ff9f43' : '#fff', size: 18 });
          }
        }
        // collision
        if (Math.abs(c.x - B.x) < c.wid / 2 + 0.5 && Math.abs(c.y - B.y) < c.len / 2 - 0.2 + 1.3) crash(c.police ? 'Pulled over by the police car' : c.truck ? 'Flattened by a truck' : 'Crashed into a car');
      }
      cars = cars.filter((c) => c.y > B.y - 40 && c.y < B.y + 200);
      // roadworks: the closed lane is solid from the first cone to the end
      for (const w of worksAt(B.y)) {
        const x0 = laneX(w.lane) - LW / 2 + 0.2, x1 = laneX(w.lane) + LW / 2 - 0.2;
        const taper = clamp((B.y - (w.a - 12)) / 12, 0, 1); // the cones angle in over the first 12 m
        const left = w.lane >= 2 ? x1 - (x1 - x0) * taper : x0, right = w.lane >= 2 ? x1 : x0 + (x1 - x0) * taper;
        if (B.x + 0.5 > left && B.x - 0.5 < right && B.y > w.a - 12) crash('Ran into the roadworks');
      }
      // coins
      for (const c of coins) if (!c.got && Math.abs(c.x - B.x) < 1.1 && Math.abs(c.y - B.y) < 1.4) { c.got = true; coinGot++; score += 10; snd.pop(); fx.stars(c.x, c.y, 6); }
      coins = coins.filter((c) => c.y > B.y - 20 && !c.got);

      cam.zoomTo(zoomFor() * (1 - (B.v - 17) / 140), dt, 2);
      cam.fy = 0.85; cam.x = ROAD / 2; cam.y = B.y;
      ctx.hud({ left: `${fmt(score)} pts`, center: `${Math.round(B.v * 3.6)} km/h`, right: combo > 1 ? `Combo x${combo}` : `${fmt(dist)} m` });
    }

    // ---------- drawing ----------
    function treeAt(i, side) { // a repeatable scatter of verge trees and planters
      const h = Math.sin(i * 12.9898 + side * 78.233) * 43758.5453; const r = h - Math.floor(h);
      return r;
    }
    function draw(g) {
      const z = cam.zoom;
      const [rx0] = cam.toScreen(0, 0), [rx1] = cam.toScreen(ROAD, 0);
      const s0 = cam.toScreen(-SHOULDER, 0)[0], s1 = cam.toScreen(ROAD + SHOULDER, 0)[0];
      // verge
      g.fillStyle = '#86c35f'; g.fillRect(0, 0, ctx.W, ctx.H);
      const yTop = cam.top, yBot = cam.bottom;
      // grass stripes for a sense of speed
      g.fillStyle = 'rgba(255,255,255,.07)';
      for (let y = Math.floor(yBot / 8) * 8; y < yTop; y += 8) if (Math.floor(y / 8) % 2 === 0) { const sy = cam.toScreen(0, y)[1]; g.fillRect(0, sy - 8 * z, s0, 8 * z); g.fillRect(s1, sy - 8 * z, ctx.W - s1, 8 * z); }
      // shoulder and road
      g.fillStyle = '#9a9ea6'; g.fillRect(s0, 0, s1 - s0, ctx.H);
      g.fillStyle = '#4b4f57'; g.fillRect(rx0, 0, rx1 - rx0, ctx.H);
      g.fillStyle = 'rgba(255,255,255,.03)'; for (let i = 0; i < 6; i++) g.fillRect(rx0 + (rx1 - rx0) * (0.1 + i * 0.16), 0, 3, ctx.H);
      // edge lines
      g.fillStyle = '#f4f4f4'; g.fillRect(rx0 + 2, 0, 3, ctx.H); g.fillRect(rx1 - 5, 0, 3, ctx.H);
      // lane lines: dashed, or a double barrier line on two-way stretches
      for (let l = 1; l < LANES; l++) {
        const x = cam.toScreen(LW * l, 0)[0];
        for (let y = Math.floor(yBot / 12) * 12; y < yTop + 12; y += 12) {
          const sy = cam.toScreen(0, y)[1];
          const tw = twoWayAt(y + 3);
          if (l === 2 && tw) { g.fillStyle = '#ffd447'; g.fillRect(x - 4, sy - 12 * z, 3, 12 * z + 1); g.fillRect(x + 1, sy - 12 * z, 3, 12 * z + 1); }
          else { g.fillStyle = '#f4f4f4'; g.fillRect(x - 1.5, sy - 3 * z, 3, 3 * z); }
        }
      }
      // two-way warning signs painted on the road and an arrow for oncoming lanes
      for (const [a, b] of TWO_WAY) {
        if (a - 60 > yTop || b < yBot) continue;
        for (const ly of [a - 50, a - 25]) {
          const [x, sy] = cam.toScreen(LW * 3, ly);
          g.save(); g.translate(x, sy); g.fillStyle = 'rgba(255,212,71,.9)'; g.font = `900 ${Math.max(10, z * 0.9)}px system-ui`; g.textAlign = 'center';
          g.fillText('TWO-WAY', 0, 0); g.fillText('AHEAD', 0, z * 1.1); g.restore();
        }
        for (let y = a + 20; y < b; y += 45) for (const l of [2, 3]) { const [x, sy] = cam.toScreen(laneX(l), y); g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(x, sy + z * 1.4); g.lineTo(x - z * 0.7, sy); g.lineTo(x - z * 0.25, sy); g.lineTo(x - z * 0.25, sy - z * 1.4); g.lineTo(x + z * 0.25, sy - z * 1.4); g.lineTo(x + z * 0.25, sy); g.lineTo(x + z * 0.7, sy); g.closePath(); g.fill(); }
      }
      // verge trees
      for (let i = Math.floor(yBot / 9) - 1; i < yTop / 9 + 1; i++) for (const side of [0, 1]) {
        const r = treeAt(i, side); if (r < 0.45) continue;
        const wx = side ? ROAD + SHOULDER + 1.2 + r * 2 : -SHOULDER - 1.2 - r * 2;
        const [x, sy] = cam.toScreen(wx, i * 9 + r * 5);
        sprite(g, r > 0.8 ? 'planter_top' : r > 0.62 ? 'tree_top' : 'tree_small_top', 0, x, sy, z * 2.2, { anchor: 'center', rot: r * 6 });
      }
      // roadworks
      for (const w of WORKS) {
        if (w.a - 20 > yTop || w.b < yBot) continue;
        const cx = laneX(w.lane), x0 = cx - LW / 2 + 0.4, x1 = cx + LW / 2 - 0.4;
        // hatched closed lane
        const [hx0, hy0] = cam.toScreen(x0, w.b), [hx1, hy1] = cam.toScreen(x1, w.a);
        g.fillStyle = 'rgba(255,170,40,.18)'; g.fillRect(hx0, hy0, hx1 - hx0, hy1 - hy0);
        for (let k = 0; k <= 6; k++) { const yy = w.a - 12 + k * 2; const [sx, sy] = cam.toScreen(w.lane >= 2 ? x1 - (x1 - x0) * (k / 6) : x0 + (x1 - x0) * (k / 6), yy); sprite(g, 'cone_top', 0, sx, sy, z * 1.3, { anchor: 'center' }); }
        for (let y = w.a; y <= w.b; y += 4) for (const xx of [x0, x1]) { const [sx, sy] = cam.toScreen(xx, y); sprite(g, 'cone_top', 0, sx, sy, z * 1.3, { anchor: 'center' }); }
        const [bx, by] = cam.toScreen(cx, w.a - 1);
        sprite(g, 'barrier_top', 0, bx, by, z, { anchor: 'center' });
        // flashing arrow board
        const on = Math.floor(t * 3) % 2 === 0;
        g.fillStyle = '#222'; roundRect(g, bx - z * 1.1, by + z * 0.8, z * 2.2, z * 1.1, 4); g.fill();
        if (on) { g.fillStyle = '#ffb21e'; g.beginPath(); const d = w.lane >= 2 ? -1 : 1; g.moveTo(bx + d * z * 0.8, by + z * 1.35); g.lineTo(bx - d * z * 0.3, by + z * 0.95); g.lineTo(bx - d * z * 0.3, by + z * 1.75); g.closePath(); g.fill(); }
      }
      // coins
      for (const c of coins) { const [x, sy] = cam.toScreen(c.x, c.y); if (sy > -20 && sy < ctx.H + 20) coinIcon(g, x, sy, z * 0.42, t * 5 + c.y); }
      // cars
      for (const c of cars) {
        const [x, sy] = cam.toScreen(c.x, c.y);
        if (sy < -c.len * z || sy > ctx.H + c.len * z) continue;
        const rot = (c.oncoming ? Math.PI / 2 : UP) + (c.target !== c.lane && c.blink <= 0 ? Math.sign(laneX(c.target) - c.x) * 0.12 : 0);
        g.fillStyle = 'rgba(0,0,0,.22)'; roundRect(g, x - c.wid * z / 2 + 3, sy - c.len * z / 2 + 4, c.wid * z, c.len * z, 6); g.fill();
        sprite(g, `car_${c.name}_top`, 0, x, sy, z * CS, { anchor: 'center', rot });
        // indicators and police lights
        if (c.blink > 0 && Math.floor(t * 6) % 2 === 0) { const d = Math.sign(laneX(c.target) - c.x); g.fillStyle = '#ffb21e'; for (const e of [-1, 1]) { g.beginPath(); g.arc(x + d * c.wid * z * 0.48, sy + e * c.len * z * 0.45, Math.max(2.5, z * 0.2), 0, 6.283); g.fill(); } }
        if (c.police) { const p = Math.floor(t * 8) % 2; g.fillStyle = p ? 'rgba(255,60,60,.55)' : 'rgba(60,120,255,.55)'; g.beginPath(); g.arc(x, sy, z * 1.6, 0, 6.283); g.fill(); }
      }
      // the bike
      const [bx, by] = cam.toScreen(B.x, B.y);
      g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(bx + 3, by + 4, z * 0.6, z * 1.45, 0, 0, 6.283); g.fill();
      drawBike(g, bx, by, z * BS, { view: 'top', rot: UP + (B.crashed ? B.crashT * B.spin : clamp(B.vx / LAT, -1, 1) * 0.32) });
      if (!B.crashed && B.v > 30) { g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; for (let i = 0; i < 4; i++) { const xx = bx + (i - 1.5) * z * 0.35, l = (B.v - 28) * 1.6; g.beginPath(); g.moveTo(xx, by + z * 1.2); g.lineTo(xx, by + z * 1.2 + l); g.stroke(); } }
      fx.draw(g, cam);
      // speed vignette
      if (B.v > 34) { const a = clamp((B.v - 34) / 16, 0, 0.35); const vg = g.createRadialGradient(ctx.W / 2, ctx.H / 2, ctx.H * 0.3, ctx.W / 2, ctx.H / 2, ctx.H * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${a})`); g.fillStyle = vg; g.fillRect(0, 0, ctx.W, ctx.H); }
    }
    return {
      update, draw,
      down(x) { finger = x; if (!steered) { steered = true; ctx.prompt(''); } },
      move(x) { finger = x; },
      up() { finger = null; },
    };
  },
};
