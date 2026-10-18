// Hill Rider: an endless hill climb. Hold the right side for gas, the left side to brake. Watch the fuel, grab
// fuel cans and coins, flip for bonuses, and don't land on your head. Score is the distance in metres.
import { Camera, FX, sprite, sky, ridge, clouds, noise1, rng, snd, buzz, clamp, lerp, fmt } from '../yeti/kit.js';
import { drawBike, coinIcon } from './kit.js';
import { Terrain } from './bikephys.js';
import { makeBike, pedalInput, drawPedals, drawTerrain, drawPhysBike, Tumble, airHint, fuelCan, fuelGauge } from './bikeui.js';

const STAGES = [
  { name: 'Countryside', from: -1e9, sky: ['#6fbdf0', '#bfe6ff', '#eef9ff'], far: '#a9cfa6', near: '#86bb7f', fill: ['#7cc35a', '#4d8a33'], edge: '#3f7a28', top: '#a6e57f', deco: ['tree_round', 'tree_oak', 'tree_pine'], grav: 9.8 },
  { name: 'Desert', from: 700, sky: ['#f2a35a', '#ffd79a', '#fff0d6'], far: '#e9b886', near: '#d69a62', fill: ['#efc27a', '#c58a4a'], edge: '#b0763a', top: '#ffe0a6', deco: ['cactus', 'rock_small', 'cactus', 'rock_big'], grav: 9.8 },
  { name: 'Snowy Mountains', from: 1500, sky: ['#86aedb', '#cfe2f5', '#f4f9ff'], far: '#b8cbe1', near: '#9fb5cf', fill: ['#ffffff', '#c8dbef'], edge: '#98b4d3', top: '#ffffff', deco: ['tree_pine', 'tree_pine', 'rock_big'], grav: 9.8 },
  { name: 'The Moon', from: 2500, sky: ['#070a22', '#151a45', '#262a5c'], far: '#3a3e5c', near: '#2b2e48', fill: ['#c3c6d4', '#7f8296'], edge: '#6a6d82', top: '#e2e4ee', deco: ['rock_big', 'rock_small'], grav: 3.4 },
];
const stageAt = (x) => { let s = 0; STAGES.forEach((st, i) => { if (x >= st.from) s = i; }); return s; };
const mix = (a, b, t) => { const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const A = p(a), B = p(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };

export default {
  id: 'hill', name: 'Hill Rider', blurb: 'Climb endless hills without landing on your head', unit: 'm',
  theme: ['#6fbdf0', '#bfe6ff', '#9ad16f'],
  how: [
    'Hold the right side of the screen for gas and the left side to brake or reverse.',
    'In the air, gas tips the bike back and the brake tips it forward. Land on both wheels. If your rider\'s head touches the ground, the ride is over.',
    'Fuel runs down as you ride. Grab red fuel cans to fill up, and coins for the garage. Flips earn bonus coins.',
    'The hills get bigger as you go: Countryside, Desert, Snowy Mountains, and finally the Moon with its low gravity. Faster and grippier bikes go further.',
  ],
  thumb(g, w, h) {
    g.fillStyle = '#5a9a3e'; g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * 0.8); g.quadraticCurveTo(w * 0.4, h * 0.5, w, h * 0.72); g.lineTo(w, h); g.fill();
    drawBike(g, w * 0.48, h * 0.7, h * 0.28, { rot: -0.25 });
    fuelCan(g, w * 0.85, h * 0.5, h * 0.22);
  },
  create(ctx) {
    const seed = (Math.random() * 1e9) | 0;
    const n1 = noise1(seed), n2 = noise1(seed + 7), n3 = noise1(seed + 13);
    const T = new Terrain();
    const height = (x) => {
      if (x < 25) return 0;
      const d = clamp((x - 25) / 2600, 0, 1), fade = clamp((x - 25) / 35, 0, 1);
      const moon = x > 2500 ? 1.35 : 1;
      const big = (n1(x * 0.021) - 0.5) * (17 + 26 * d) * moon, mid = (n2(x * 0.07) - 0.5) * (3.5 + 5 * d), small = (n3(x * 0.22) - 0.5) * (0.35 + 0.5 * d);
      return (big + mid + small + x * 0.012) * fade;
    };
    const gen = (to) => { let x = T.p.length ? T.lastX : -40; while (x < to) { x += 1.4; T.push(x, height(x)); } };
    gen(200);
    // fuel cans and coins
    const fuel = []; for (let x = 130, k = 0; x < 20000; k++) { fuel.push({ x, got: false }); x += Math.min(330, 170 + 22 * k); }
    const coins = []; for (let x = 45; x < 20000; x += 48 + ((x * 7) % 23)) for (let i = 0; i < 5; i++) coins.push({ x: x + i * 1.9, got: false });
    const deco = []; { const r = rng(seed + 3); for (let x = 8; x < 20000; x += 10 + r() * 22) deco.push({ x, k: r(), s: 0.8 + r() * 0.5 }); }
    const bike = makeBike(0, 0.03);
    const pedals = pedalInput();
    const cam = new Camera(ctx, clamp(ctx.W / 10, 30, 52)); cam.fx = 0.35; cam.fy = 0.56; cam.x = 4; cam.y = 1.5;
    const fx = new FX();
    let t = 0, fuelLeft = 1, maxX = 0, got = 0, flips = 0, flipCoins = 0, ended = false, endT = 0, tumble = null, stillT = 0, started = false, stage = 0, announce = 0, outOfFuel = false;
    ctx.prompt('Hold the right side to ride');

    function end(line) {
      if (ended) return; ended = true;
      const d = Math.max(0, maxX);
      ctx.finish(d, line, { coins: got + Math.floor(d / 20) + flipCoins });
    }
    function update(dt) {
      t += dt; fx.update(dt); cam.update(dt);
      gen(cam.right + 120);
      const input = !ended && !outOfFuel ? pedals.state : { gas: false, brake: pedals.state.brake };
      if (input.gas && !started) { started = true; ctx.prompt(''); }
      const ev = bike.step(dt, T, input);
      // stage changes as you ride (the Moon has low gravity)
      const s = stageAt(bike.x);
      if (s !== stage) { stage = s; bike.g = STAGES[s].grav; announce = 2.5; fx.text(bike.x + 4, bike.y + 3, STAGES[s].name, { color: '#ffd447', size: 28, life: 2 }); snd.cheer(); }
      if (announce > 0) announce -= dt;
      if (ev.bump > 6) { snd.thud(); cam.shake(Math.min(10, ev.bump), 0.2); fx.dust(bike.x, T.heightAt(bike.x), 8); }
      if (ev.landed && !bike.crashed) {
        if (ev.flips > 0) {
          flips += ev.flips; const bonus = ev.flips === 1 ? 25 : ev.flips === 2 ? 60 : 100 * ev.flips;
          flipCoins += 3 * ev.flips;
          fx.text(bike.x, bike.y + 2.4, `${ev.flips > 1 ? `${ev.flips}x ` : ''}${ev.back ? 'Backflip' : 'Front flip'}! +${bonus}`, { color: '#ffd447', size: 24 }); snd.cheer(); buzz([20, 30, 20]);
          fuelLeft = Math.min(1, fuelLeft + 0.04 * ev.flips);
        } else if (ev.airT > 1.4) { fx.text(bike.x, bike.y + 2.2, 'Big air!', { color: '#fff', size: 20 }); snd.ding(1); }
      }
      if (ev.crashed) { tumble = new Tumble(bike); snd.thud(); snd.fail(); buzz([60, 40, 80]); cam.shake(12, 0.4); fx.dust(bike.x, bike.y + 0.6, 16); ctx.prompt('Ouch!'); }
      if (tumble) tumble.update(dt, T, bike.g);
      // fuel
      if (started && !bike.crashed) fuelLeft -= dt * (1 / 58) * (input.gas ? 1.35 : 1);
      if (fuelLeft <= 0 && !outOfFuel) { fuelLeft = 0; outOfFuel = true; ctx.prompt('Out of fuel!'); snd.fail(); }
      if (!bike.crashed && !ended) maxX = Math.max(maxX, bike.x);
      // pickups
      const [cx, cy] = bike.centre();
      for (const f of fuel) { if (f.got || Math.abs(f.x - cx) > 1.6) continue; const fy = T.heightAt(f.x) + 0.7; if (Math.hypot(f.x - cx, fy - cy) < 1.5) { f.got = true; fuelLeft = 1; outOfFuel = false; snd.ding(4); buzz(20); fx.text(f.x, fy + 1, 'Fuel!', { color: '#ff7a5a', size: 22 }); fx.stars(f.x, fy, 10); } }
      for (const c of coins) { if (c.got || Math.abs(c.x - cx) > 1.3) continue; const y = T.heightAt(c.x) + 1.3; if (Math.hypot(c.x - cx, y - cy) < 1.25) { c.got = true; got++; snd.pop(); fx.burst(c.x, y, { n: 6, color: ['#ffd447', '#fff3b0'], speed: 3, size: 0.12, life: 0.4 }); } }
      // endings
      if (bike.crashed) { endT += dt; if (endT > 2) end('Wiped out'); }
      else if (outOfFuel) { stillT = bike.speed < 0.6 ? stillT + dt : 0; endT += dt; if (stillT > 1.2 || endT > 9) end('Ran out of fuel'); }
      // camera
      const z = clamp(ctx.W / 10, 30, 52) * (1 - Math.min(0.28, bike.speed / 70));
      cam.zoomTo(z, dt, 2);
      cam.follow(bike.x + clamp(bike.vx * 0.35, -3, 7), bike.y + 1.6, dt, 4);
      const st = STAGES[stage];
      ctx.hud({ left: ctx.best ? `Best ${fmt(ctx.best)} m` : st.name, center: `${fmt(Math.max(0, maxX))} m`, right: `${got} coins` });
    }

    function draw(g) {
      // blend the scenery when crossing into the next stage
      const sx = cam.x, si = stageAt(sx), next = STAGES[si + 1];
      const tb = next ? clamp((sx - (next.from - 80)) / 80, 0, 1) : 0;
      const A = STAGES[si], B = next || A, c = (k, i) => (i === undefined ? mix(A[k], B[k], tb) : mix(A[k][i], B[k][i], tb));
      sky(g, ctx, [c('sky', 0), c('sky', 1), c('sky', 2)]);
      if (si === 3 || (next && si === 2 && tb > 0)) { const r = rng(5); g.fillStyle = `rgba(255,255,255,${si === 3 ? 0.85 : tb})`; for (let i = 0; i < 80; i++) { const x = (r() * ctx.W * 2 - cam.x * cam.zoom * 0.02) % ctx.W; g.fillRect((x + ctx.W) % ctx.W, r() * ctx.H * 0.6, 1.6, 1.6); } }
      if (si < 3) clouds(g, ctx, cam, { t, count: 5, seed: 7, alpha: 0.85 * (1 - (si === 2 ? tb : 0)) });
      const gy = Math.min(0.92, cam.sy_(T.heightAt(cam.x)) / ctx.H);
      ridge(g, cam, { par: 0.06, yPar: 0, y: gy - 0.1, amp: 0.3, width: 240, seed: 11 + si, color: c('far'), peaks: si === 2, snow: si === 2 ? { above: 0.5, color: '#fff' } : null });
      ridge(g, cam, { par: 0.18, yPar: 0, y: gy - 0.02, amp: 0.16, width: 150, seed: 21 + si, color: c('near') });
      // scenery stands just behind the track (drawn before the ground, so the track edge passes in front)
      for (const d of deco) {
        if (d.x < cam.left - 6 || d.x > cam.right + 6) continue;
        const st = STAGES[stageAt(d.x)], name = st.deco[Math.floor(d.k * st.deco.length)];
        const [x, y] = cam.toScreen(d.x, T.heightAt(d.x) + 0.15);
        sprite(g, name, 0, x, y, cam.zoom * d.s * (name.startsWith('rock') ? 0.55 : 0.85));
      }
      drawTerrain(g, cam, T, { fill: [c('fill', 0), c('fill', 1)], edge: c('edge'), top: c('top') });
      // stage gates
      for (const st of STAGES.slice(1)) {
        if (st.from < cam.left - 6 || st.from > cam.right + 6) continue;
        const [x, y] = cam.toScreen(st.from, T.heightAt(st.from));
        sprite(g, 'banner_tower', 0, x - cam.zoom * 2.4, y, cam.zoom); sprite(g, 'banner_tower', 0, x + cam.zoom * 2.4, y, cam.zoom);
        g.save(); g.font = `900 ${Math.max(12, cam.zoom * 0.55)}px system-ui, sans-serif`; g.textAlign = 'center'; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(40,20,10,.7)'; g.lineWidth = 4;
        g.strokeText(st.name, x, y - cam.zoom * 4.2); g.fillText(st.name, x, y - cam.zoom * 4.2); g.restore();
      }
      // best distance flag
      if (ctx.best > 0 && ctx.best > cam.left - 4 && ctx.best < cam.right + 4) {
        const [bx, by] = cam.toScreen(ctx.best, T.heightAt(ctx.best));
        g.fillStyle = '#e5484d'; g.fillRect(bx - 2, by - 60, 4, 60); g.beginPath(); g.moveTo(bx + 2, by - 60); g.lineTo(bx + 34, by - 50); g.lineTo(bx + 2, by - 40); g.fill();
        g.font = '800 11px system-ui'; g.textAlign = 'center'; g.fillText('BEST', bx, by - 64);
      }
      for (const f of fuel) { if (f.got || f.x < cam.left - 2 || f.x > cam.right + 2) continue; const [x, y] = cam.toScreen(f.x, T.heightAt(f.x) + 0.75); fuelCan(g, x, y, cam.zoom * 0.95, t); }
      for (const c0 of coins) { if (c0.got || c0.x < cam.left - 2 || c0.x > cam.right + 2) continue; const [x, y] = cam.toScreen(c0.x, T.heightAt(c0.x) + 1.3); coinIcon(g, x, y, cam.zoom * 0.32, t * 4 + c0.x); }
      drawPhysBike(g, cam, bike);
      if (tumble) tumble.draw(g, cam);
      airHint(g, cam, bike, pedals.state, T.slopeAt(bike.x + 3));
      fx.draw(g, cam);
      fuelGauge(g, ctx, fuelLeft, true);
      drawPedals(g, ctx, pedals.state);
      if (announce > 0) { g.save(); g.globalAlpha = Math.min(1, announce); g.font = '900 26px system-ui'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(40,20,10,.7)'; g.lineWidth = 5; const s = `Welcome to ${STAGES[stage].name}`; g.strokeText(s, ctx.W / 2, ctx.H * 0.3); g.fillText(s, ctx.W / 2, ctx.H * 0.3); g.restore(); }
    }
    return {
      update, draw,
      down(x) { pedals.down(ctx, x); },
      move(x) { pedals.move(ctx, x); },
      up() { pedals.up(); },
    };
  },
};
