// Stunt Park: 20 hand-made stunt tracks with ramps, gaps and parked cars. Ride to the finish under par and land
// flips for three stars. A crash sends you back to the last checkpoint with a time penalty.
import { store } from '../store.js';
import { Camera, FX, sprite, sky, ridge, clouds, snd, buzz, clamp, fmt, roundRect } from '../yeti/kit.js';
import { drawBike } from './kit.js';
import { LEVELS, buildLevel } from './stunt-levels.js';
import { makeBike, pedalInput, drawPedals, drawTerrain, drawPhysBike, Tumble, airHint } from './bikeui.js';

const PENALTY = 3; // seconds added for a crash
const clock = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

export default {
  id: 'stunt', name: 'Stunt Park', blurb: 'Jump cars and canyons, land flips, beat par', unit: 'pts', levels: LEVELS.length,
  theme: ['#8fd0ff', '#d8f1ff', '#f5d27a'],
  how: [
    'Hold the right side for gas and the left side to brake. In the air, gas tips the bike back and the brake tips it forward.',
    'Clear the jumps and ride through the finish gate. One star for finishing, two for beating the par time, three for beating par and landing the number of flips shown at the start.',
    'Crash, fall into a gap or get stuck and you go back to the last checkpoint flag, with 3 seconds added to your time.',
    'Smash crates for bonus points. Coins come mostly from earning new stars.',
  ],
  thumb(g, w, h) {
    g.fillStyle = '#d8a35c'; g.fillRect(0, h * 0.82, w, h);
    g.fillStyle = '#c48a44'; g.beginPath(); g.moveTo(w * 0.05, h * 0.82); g.lineTo(w * 0.32, h * 0.82); g.lineTo(w * 0.32, h * 0.6); g.closePath(); g.fill();
    sprite(g, 'car_sedan', 0, w * 0.62, h * 0.84, h * 0.13);
    drawBike(g, w * 0.55, h * 0.42, h * 0.2, { rot: -0.5 });
  },
  create(ctx) {
    const L = buildLevel(ctx.level), lv = L.lv;
    const T = L.T;
    const bike = makeBike(1, 0.03);
    const pedals = pedalInput();
    const cam = new Camera(ctx, clamp(ctx.W / 10.5, 30, 50)); cam.fx = 0.33; cam.fy = 0.6; cam.x = 6; cam.y = 1.6;
    const fx = new FX();
    const prevStars = store.moto.stars[`stunt:${ctx.level}`] || 0;
    let t = 0, time = 0, running = false, done = false, flips = 0, air = 0, smashes = 0, crashes = 0, cp = 0, cpIdx = 0, tumble = null, respawnT = 0, prog = 0, progT = 0;
    const crates = L.crates.map((c) => ({ ...c, y: T.heightAt(c.x) }));
    ctx.prompt(`Hold GAS to go. Par ${L.par} s${lv.flips ? `, ${lv.flips} flip${lv.flips > 1 ? 's' : ''} for three stars` : ''}`);
    const hud = () => ctx.hud({ left: `${clock(time)} / ${L.par} s`, center: lv.flips ? `Flips ${flips}/${lv.flips}` : `Flips ${flips}`, right: `Level ${ctx.level + 1}` });
    hud();

    function crash(why) {
      if (respawnT > 0 || done) return;
      crashes++; respawnT = 1.3; time += PENALTY;
      if (!tumble && why !== 'stuck') tumble = new Tumble(bike);
      snd.thud(); snd.fail(); buzz([60, 40, 60]); cam.shake(10, 0.35);
      ctx.prompt(why === 'pit' ? 'Into the gap! +3 s' : why === 'stuck' ? 'Stuck! Back to the flag +3 s' : 'Crash! +3 s');
    }
    function finishRun() {
      done = true; running = false;
      const under = time <= L.par, stars = 1 + (under ? 1 : 0) + (under && flips >= lv.flips ? 1 : 0);
      const score = Math.max(0, Math.round((L.par * 1.6 - time) * 40) + flips * 150 + Math.round(air * 30) + smashes * 50 - crashes * 100);
      const coins = 10 + Math.max(0, stars - prevStars) * 20;
      snd.cheer(); buzz([30, 40, 30]); fx.stars(bike.x, bike.y + 1.5, 24);
      fx.text(bike.x + 1, bike.y + 2.5, stars === 3 ? 'Perfect run!' : 'Finished!', { color: '#ffd447', size: 28, life: 1.6 });
      const line = `${clock(time)} (par ${L.par} s) · ${flips} flip${flips === 1 ? '' : 's'}${crashes ? ` · ${crashes} crash${crashes > 1 ? 'es' : ''}` : ''}`;
      ctx.prompt('');
      ctx.finish(score, line, { stars, passed: true, coins });
    }

    function update(dt) {
      t += dt; fx.update(dt); cam.update(dt);
      const input = done || respawnT > 0 ? { brake: false, gas: false } : pedals.state;
      if (!running && !done && input.gas) { running = true; ctx.prompt(''); }
      if (running) time += dt;
      const ev = bike.step(dt, T, running ? input : { brake: true });
      if (ev.bump > 6) { snd.thud(); cam.shake(Math.min(9, ev.bump), 0.2); fx.dust(bike.x, T.heightAt(bike.x), 8); }
      if (ev.landed && !bike.crashed && respawnT <= 0) {
        air += ev.airT;
        if (ev.flips > 0) { flips += ev.flips; fx.text(bike.x, bike.y + 2.4, `${ev.flips > 1 ? `${ev.flips}x ` : ''}${ev.back ? 'Backflip' : 'Front flip'}!`, { color: '#ffd447', size: 26 }); snd.cheer(); buzz([20, 30, 20]); }
        else if (ev.airT > 1.3) { fx.text(bike.x, bike.y + 2.2, 'Clean landing', { color: '#fff', size: 18 }); snd.ding(2); }
      }
      if (ev.crashed) crash('crash');
      // fell into a gap
      if (respawnT <= 0 && L.pits.some(([a, z, y]) => bike.x > a - 0.5 && bike.x < z + 0.5 && bike.y < y - 3)) crash('pit');
      // no progress for a while (wedged against something)
      if (running && respawnT <= 0) { if (!input.gas || bike.x > prog + 0.6) { prog = Math.max(prog, bike.x); progT = 0; } else if ((progT += dt) > 4) crash('stuck'); }
      if (tumble) tumble.update(dt, T, bike.g);
      if (respawnT > 0) {
        respawnT -= dt;
        if (respawnT <= 0) { bike.reset(cp + 1.5, T); tumble = null; prog = bike.x; progT = 0; ctx.prompt(''); fx.snow(bike.x, T.heightAt(bike.x) + 0.5, 10); }
      }
      // checkpoints
      if (!bike.crashed) for (let i = cpIdx + 1; i < L.cps.length; i++) if (bike.x > L.cps[i]) { cpIdx = i; cp = L.cps[i]; fx.text(cp, T.heightAt(cp) + 3, 'Checkpoint', { color: '#7ad86b', size: 20 }); snd.ding(3); }
      // crates
      const [bx, by] = bike.centre();
      for (const c of crates) {
        if (!c.hit && Math.abs(c.x - bx) < 1 && Math.abs(c.y + 0.5 - by) < 1.2 && bike.speed > 2) {
          c.hit = true; c.vx = bike.vx * 1.1 + 2; c.vy = 3 + Math.random() * 3; c.vr = (Math.random() - 0.3) * 10;
          smashes++; snd.crunch(); fx.burst(c.x, c.y + 0.5, { n: 10, color: ['#c68642', '#e0a35a', '#8d5a2b'], speed: 5, size: 0.15 }); fx.text(c.x, c.y + 1.6, 'Smash! +50', { color: '#ffd447', size: 18 });
        }
        if (c.hit) {
          c.vy -= 9.8 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
          const gy = T.heightAt(c.x); if (c.y < gy) { c.y = gy; c.vy = Math.abs(c.vy) * 0.3; c.vx *= 0.7; c.vr *= 0.6; }
        }
      }
      if (!done && running && !bike.crashed && respawnT <= 0 && bike.x > L.finish) finishRun();
      // camera
      cam.zoomTo(clamp(ctx.W / 10.5, 30, 50) * (1 - Math.min(0.25, bike.speed / 80)), dt, 2);
      cam.follow(bike.x + clamp(bike.vx * 0.3, -2, 6), bike.y + 1.4, dt, 4);
      if (!done) hud();
    }

    function draw(g) {
      sky(g, ctx, ['#6cbcf2', '#bfe6ff', '#fff4dc']);
      clouds(g, ctx, cam, { t, count: 6, seed: 4 });
      const gy = Math.min(0.92, cam.sy_(0) / ctx.H);
      ridge(g, cam, { par: 0.06, yPar: 0, y: gy - 0.08, amp: 0.26, width: 220, seed: 31, color: '#a8c7e0' });
      ridge(g, cam, { par: 0.2, yPar: 0, y: gy - 0.01, amp: 0.12, width: 140, seed: 41, color: '#9bc58c' });
      // scenery behind the track
      for (const d of L.decor) {
        if (d.x < cam.left - 10 || d.x > cam.right + 10) continue;
        const [x, y] = cam.toScreen(d.x, T.heightAt(d.x) + 0.1);
        sprite(g, d.kind, 0, x, y, cam.zoom * (d.kind === 'grandstand' ? 0.9 : 1), { alpha: 0.95 });
      }
      drawTerrain(g, cam, T, { fill: ['#d9a861', '#a8743a'], edge: '#8a5a2b', top: '#f0c98a', edgeW: 0.3 });
      // pits get a dark mouth so gaps read clearly
      for (const [a, z, y] of L.pits) { if (z < cam.left || a > cam.right) continue; const [x0, y0] = cam.toScreen(a, y), [x1] = cam.toScreen(z, y); const gr = g.createLinearGradient(0, y0, 0, y0 + cam.zoom * 6); gr.addColorStop(0, 'rgba(40,20,5,.15)'); gr.addColorStop(1, 'rgba(20,10,0,.75)'); g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, ctx.H - y0); }
      for (const c of L.cars) { if (c.x < cam.left - 6 || c.x > cam.right + 6) continue; const [x, y] = cam.toScreen(c.x, c.y); sprite(g, `car_${c.name}`, 0, x, y, cam.zoom); }
      // checkpoint flags and the finish gate
      L.cps.slice(1).forEach((x0, i) => {
        if (x0 < cam.left - 2 || x0 > cam.right + 2) return;
        const [x, y] = cam.toScreen(x0, T.heightAt(x0)), passed = i + 1 <= cpIdx;
        g.fillStyle = '#5a4a3a'; g.fillRect(x - 2, y - cam.zoom * 2.2, 4, cam.zoom * 2.2);
        g.fillStyle = passed ? '#4fbf3f' : '#ff8a3d'; g.beginPath(); g.moveTo(x + 2, y - cam.zoom * 2.2); g.lineTo(x + cam.zoom * 0.9, y - cam.zoom * 1.9); g.lineTo(x + 2, y - cam.zoom * 1.6); g.fill();
      });
      if (L.finish > cam.left - 8 && L.finish < cam.right + 8) {
        const [x, y] = cam.toScreen(L.finish, T.heightAt(L.finish));
        for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#222' : '#fff'; g.fillRect(x - cam.zoom * 0.3 + j * cam.zoom * 0.3, y - 1 + i * 3 - 9, cam.zoom * 0.3, 3); }
        sprite(g, 'banner_tower', 0, x, y, cam.zoom * 1.2);
        g.save(); g.font = `900 ${Math.max(12, cam.zoom * 0.5)}px system-ui`; g.textAlign = 'center'; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(40,20,5,.7)'; g.lineWidth = 4; g.strokeText('FINISH', x, y - cam.zoom * 6.4); g.fillText('FINISH', x, y - cam.zoom * 6.4); g.restore();
      }
      for (const c of crates) { if (c.x < cam.left - 2 || c.x > cam.right + 2) continue; const [x, y] = cam.toScreen(c.x, c.y); sprite(g, 'crate', 0, x, y, cam.zoom, { rot: c.rot }); }
      if (respawnT <= 0 || !bike.crashed) drawPhysBike(g, cam, bike);
      else { g.save(); g.globalAlpha = Math.max(0, respawnT / 1.3); drawPhysBike(g, cam, bike); g.restore(); }
      if (tumble) tumble.draw(g, cam);
      airHint(g, cam, bike, pedals.state, T.slopeAt(bike.x + 3));
      fx.draw(g, cam);
      // progress strip along the bottom of the HUD
      const w = ctx.W - 40, p = clamp(bike.x / L.finish, 0, 1);
      g.fillStyle = 'rgba(40,22,10,.45)'; roundRect(g, 20, 44, w, 6, 3); g.fill();
      L.cps.slice(1).forEach((x0) => { g.fillStyle = '#ff8a3d'; g.fillRect(20 + w * (x0 / L.finish) - 1, 42, 2, 10); });
      g.fillStyle = '#ffd447'; roundRect(g, 20, 44, Math.max(6, w * p), 6, 3); g.fill();
      drawPedals(g, ctx, pedals.state);
    }
    return { update, draw, down(x) { pedals.down(ctx, x); }, move(x) { pedals.move(ctx, x); }, up() { pedals.up(); } };
  },
};
