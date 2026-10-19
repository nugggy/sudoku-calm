// Jelly Snack: jellyfish drift down and the turtle at the bottom slides to catch them. Plastic bags look just like
// jellyfish, so dodge those (three bags and the meal is over). Score is jellyfish eaten.
import { FX, snd, buzz, clamp, pic, hearts, fillGrad } from './kit.js';

// the bag picture is a paper bag; drained of colour and see-through it reads as a plastic one
const BAG = { filter: 'saturate(0) brightness(1.35)', alpha: 0.85 };

export default {
  id: 'jelly', name: 'Jelly Snack', blurb: 'Catch the jellyfish, dodge the plastic bags', unit: 'eaten', unit1: 'eaten',
  theme: ['#3fa9cf', '#7fd0e3', '#c7eef3'],
  how: [
    'Slide your finger left and right and the turtle follows it along the bottom of the screen.',
    'Catch the jellyfish as they drift down. Catching several in a row builds a combo worth extra.',
    'Plastic bags look a lot like jellyfish to a turtle. Keep away from them: three bags and the meal is over.',
  ],
  thumb(g, w, h) {
    pic(g, 't_jelly', w * 0.3, h * 0.25, h * 0.3); pic(g, 't_bag', w * 0.72, h * 0.32, h * 0.3, BAG); pic(g, 't_jelly', w * 0.55, h * 0.5, h * 0.26);
    pic(g, 't_hatch', w * 0.45, h * 0.84, h * 0.5, { rot: -Math.PI / 2 });
  },
  create(ctx) {
    const fx = new FX(), cam = { toScreen: (x, y) => [x, y], zoom: 1 };
    let x = ctx.W / 2, target = ctx.W / 2, items = [], spawnT = 0.8, t = 0, eaten = 0, combo = 0, lives = 3, ended = false, toldBag = false, flash = 0;
    const S = () => clamp(ctx.W * 0.24, 60, 110);
    const ty = () => ctx.H - S() * 0.62;
    const hud = () => ctx.hud({ left: ctx.best ? `Best ${ctx.best}` : '', center: combo > 1 ? `Combo x${combo}` : '', right: `${eaten} eaten` });
    hud();
    ctx.prompt('Slide to move');

    const level = () => Math.min(1, t / 120);
    function spawn() {
      const s = S(), r = Math.random(), bagChance = 0.18 + level() * 0.17;
      const kind = r < bagChance ? 'bag' : r > 0.96 ? 'grass' : 'jelly';
      items.push({ kind, x: s * 0.4 + Math.random() * (ctx.W - s * 0.8), y: -s * 0.4, v: ctx.H * (0.16 + level() * 0.2) * (0.85 + Math.random() * 0.35), ph: Math.random() * 6, sw: (Math.random() - 0.5) * 30 });
    }

    function down(px) { target = px; ctx.prompt(''); }
    function move(px) { target = px; }

    function update(dt) {
      t += dt; fx.update(dt); flash = Math.max(0, flash - dt);
      const s = S();
      x += (clamp(target, s * 0.35, ctx.W - s * 0.35) - x) * Math.min(1, dt * 16);
      if (ended) return;
      spawnT -= dt;
      if (spawnT <= 0) { spawn(); spawnT = Math.max(0.32, 0.95 - level() * 0.6) * (0.7 + Math.random() * 0.6); }
      const my = ty() - s * 0.3; // the turtle's mouth
      for (const it of items) {
        it.y += it.v * dt; it.x += Math.sin(t * 1.6 + it.ph) * it.sw * dt;
        if (!it.done && Math.abs(it.x - x) < s * 0.42 && Math.abs(it.y - my) < s * 0.3) {
          it.done = true;
          if (it.kind === 'bag') {
            lives--; combo = 0; flash = 0.35; snd.fail(); buzz([40, 40, 40]);
            fx.text(it.x, it.y - 20, 'Yuck, plastic', { color: '#ffd0d0', size: 20 });
            if (!toldBag) { toldBag = true; ctx.prompt('Bags in the sea look like jellyfish. Bin your rubbish.'); setTimeout(() => !ended && ctx.prompt(''), 2600); }
            if (lives <= 0) { ended = true; ctx.finish(eaten, `${eaten} jellyfish eaten`); }
          } else {
            combo++; const pts = (it.kind === 'grass' ? 3 : 1) + (combo >= 5 ? 1 : 0); eaten += pts;
            snd.pop(); buzz(6);
            fx.text(it.x, it.y - 18, combo >= 5 ? `+${pts} combo` : `+${pts}`, { color: '#fff7b0', size: 20 });
            fx.burst(it.x, it.y, { n: 8, color: ['#ffd1f0', '#ffffff'], speed: 90, up: 0, size: 2.5, life: 0.5, grav: 0 });
          }
        } else if (!it.done && it.y > ctx.H + s * 0.5) { it.done = true; if (it.kind === 'jelly') combo = 0; }
      }
      items = items.filter((it) => !it.done);
      hud();
    }

    function draw(g) {
      const W = ctx.W, H = ctx.H, s = S();
      fillGrad(g, 0, 0, 0, H, ['#1e7fae', '#3aa9cf', '#8fd8e6']); g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,.06)';
      for (let i = 0; i < 12; i++) { const bx = (i * 89.7) % W, by = H - ((t * 30 + i * 117) % (H + 40)); g.beginPath(); g.arc(bx, by, 3 + (i % 3) * 2, 0, Math.PI * 2); g.fill(); }
      for (const it of items) {
        const name = it.kind === 'bag' ? 't_bag' : it.kind === 'grass' ? 't_seagrass' : 't_jelly';
        pic(g, name, it.x, it.y, s * (it.kind === 'grass' ? 0.5 : 0.56), { rot: Math.sin(t * 2 + it.ph) * 0.18, ...(it.kind === 'bag' ? BAG : {}) });
      }
      pic(g, 't_hatch', x, ty(), s, { rot: -Math.PI / 2 + Math.sin(t * 6) * 0.05 });
      fx.draw(g, cam);
      if (flash > 0) { g.fillStyle = `rgba(255,60,60,${flash * 0.5})`; g.fillRect(0, 0, W, H); }
      hearts(g, 18, 50, lives);
    }
    return { update, draw, down, move };
  },
};
