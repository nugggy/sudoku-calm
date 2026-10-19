// Hatchling Dash: baby sea turtles crawl from the nest to the sea in four lanes. Tap left or right to move every
// hatchling one lane over, dodging scuttling crabs and the shadows of diving gulls. Score is hatchlings saved.
import { FX, snd, buzz, clamp, pic, shadow, banner, hearts, fillGrad } from './kit.js';

const LANES = 4;

export default {
  id: 'hatch', name: 'Hatchling Dash', blurb: 'Steer the baby turtles past crabs and gulls to the sea', unit: 'saved', unit1: 'saved',
  theme: ['#f6e2b4', '#ecd29c', '#4fb7d6'],
  how: [
    'Baby turtles hatch at the top of the beach and crawl down four lanes to the sea.',
    'Tap the left side of the screen to move every hatchling one lane left, or the right side to move them right.',
    'Crabs scuttle across the sand. A dark shadow means a gull is about to swoop, so move out of its lane. You can lose three hatchlings.',
    'Each wave brings more hatchlings, crawling a little faster.',
  ],
  thumb(g, w, h) {
    g.fillStyle = '#4fb7d6'; g.fillRect(0, h * 0.78, w, h);
    pic(g, 't_hatch', w * 0.3, h * 0.45, h * 0.32, { rot: 1.4 });
    pic(g, 't_hatch', w * 0.55, h * 0.62, h * 0.32, { rot: 1.7 });
    pic(g, 't_crab_top', w * 0.8, h * 0.35, h * 0.34, { rot: Math.PI / 2 });
  },
  create(ctx) {
    const fx = new FX();
    const cam = { toScreen: (x, y) => [x, y], zoom: 1 }; // FX in screen pixels (y down, so bursts use negative gravity)
    let wave = 0, waveLeft = 0, spawnT = 0, banT = 0, lives = 3, saved = 0, t = 0, ended = false;
    let hatchlings = [], crabs = [], gulls = [];
    const L = () => ({ w: ctx.W / LANES, top: ctx.H * 0.13, sea: ctx.H * 0.84 });
    const laneX = (i) => (i + 0.5) * L().w;
    const size = () => clamp(L().w * 0.46, 30, 64);

    function nextWave() {
      wave++; waveLeft = 3 + wave * 2; spawnT = 1.2; banT = 1.6;
      ctx.prompt(wave === 1 ? 'Tap left or right to steer' : '');
      snd.ding(wave);
    }
    nextWave();

    function hud() { ctx.hud({ left: `Wave ${wave}`, center: ctx.best ? `Best ${ctx.best}` : '', right: `${saved} saved` }); }
    hud();

    function down(x) {
      if (ended) return;
      const dir = x < ctx.W / 2 ? -1 : 1;
      let moved = false;
      for (const h of hatchlings) { const nl = clamp(h.lane + dir, 0, LANES - 1); if (nl !== h.lane) { h.lane = nl; moved = true; } }
      if (moved) { snd.tick(); buzz(8); }
      ctx.prompt('');
    }

    function lose(h, why) {
      h.gone = why; lives--; snd.fail(); buzz(40);
      fx.text(h.x, h.y - 20, why === 'gull' ? 'Snatched' : 'Pinched', { color: '#ffd0d0', size: 20 });
      if (lives <= 0 && !ended) { ended = true; ctx.finish(saved, `You saved ${saved} hatchling${saved === 1 ? '' : 's'} and reached wave ${wave}`); }
    }

    function update(dt) {
      t += dt; fx.update(dt);
      const { w, top, sea } = L(), s = size(), speed = ctx.H * (0.085 + 0.01 * Math.min(wave, 12));
      if (banT > 0) banT -= dt;
      // hatchlings
      if (!ended && waveLeft > 0) {
        spawnT -= dt;
        if (spawnT <= 0) {
          waveLeft--; spawnT = Math.max(0.55, 1.5 - wave * 0.09) * (0.8 + Math.random() * 0.4);
          const lane = (Math.random() * LANES) | 0;
          hatchlings.push({ lane, x: laneX(lane), y: top, sp: speed * (0.9 + Math.random() * 0.25), wob: Math.random() * 6 });
        }
      }
      for (const h of hatchlings) {
        if (h.gone) { h.fade = (h.fade || 0) + dt; if (h.gone === 'gull') h.y -= 260 * dt; continue; }
        h.x += (laneX(h.lane) - h.x) * Math.min(1, dt * 14);
        h.y += h.sp * dt;
        if (h.y >= sea) {
          h.gone = 'sea'; saved++; snd.splash(); buzz(10);
          fx.burst(h.x, sea, { n: 12, color: ['#ffffff', '#bfe6ff'], speed: 120, up: 0, size: 3, life: 0.6, grav: -300, dir: -Math.PI / 2, spread: 1.6 });
          fx.text(h.x, sea - 26, '+1', { color: '#fff', size: 22 });
          hud();
        }
      }
      hatchlings = hatchlings.filter((h) => !h.gone || (h.fade || 0) < 0.7);
      // crabs scuttle sideways across the sand, wrapping round
      const wantCrabs = Math.min(1 + Math.floor(wave / 2), 5);
      while (crabs.length < wantCrabs) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        crabs.push({ x: dir > 0 ? -40 : ctx.W + 40, y: top + 60 + Math.random() * (sea - top - 120), v: dir * ctx.W * (0.12 + Math.random() * 0.1 + wave * 0.01), pause: 0 });
      }
      for (const c of crabs) {
        if (c.pause > 0) { c.pause -= dt; continue; }
        c.x += c.v * dt;
        if (Math.random() < dt * 0.25) c.pause = 0.4 + Math.random() * 0.6;
        if ((c.v > 0 && c.x > ctx.W + 50) || (c.v < 0 && c.x < -50)) { c.x = c.v > 0 ? -40 : ctx.W + 40; c.y = top + 60 + Math.random() * (sea - top - 120); }
        for (const h of hatchlings) if (!h.gone && Math.abs(h.x - c.x) < s * 0.62 && Math.abs(h.y - c.y) < s * 0.4) lose(h, 'crab');
      }
      // gulls: a shadow warns where one will swoop
      if (!ended && wave >= 2 && Math.random() < dt * (0.22 + wave * 0.04) && gulls.length < 2) {
        const target = hatchlings.filter((h) => !h.gone && h.y < sea - 140);
        if (target.length) {
          const h = target[(Math.random() * target.length) | 0];
          gulls.push({ lane: h.lane, y: Math.min(sea - 30, h.y + h.sp * 1.4), t: 0, warn: 1.35, from: Math.random() < 0.5 ? -1 : 1, hit: false });
        }
      }
      for (const gl of gulls) {
        gl.t += dt;
        if (!gl.hit && gl.t >= gl.warn) {
          gl.hit = true; snd.squawk();
          for (const h of hatchlings) if (!h.gone && h.lane === gl.lane && Math.abs(h.y - gl.y) < s * 0.75) lose(h, 'gull');
        }
      }
      gulls = gulls.filter((gl) => gl.t < gl.warn + 0.8);
      // next wave when the beach is clear
      if (!ended && waveLeft === 0 && hatchlings.length === 0) nextWave();
      hud();
    }

    function draw(g) {
      const { w, top, sea } = L(), s = size(), W = ctx.W, H = ctx.H;
      fillGrad(g, 0, 0, 0, H, ['#f6e4b8', '#eed39f', '#e6c58c']); g.fillRect(0, 0, W, H);
      // lane guides in the sand
      g.strokeStyle = 'rgba(160,120,60,.16)'; g.lineWidth = 2; g.setLineDash([8, 12]);
      for (let i = 1; i < LANES; i++) { g.beginPath(); g.moveTo(i * w, top); g.lineTo(i * w, sea); g.stroke(); }
      g.setLineDash([]);
      // the nest: a sandy mound with eggs
      g.fillStyle = '#dcb877'; g.beginPath(); g.ellipse(W / 2, top - 10, W * 0.46, top * 0.7, 0, Math.PI, 0); g.fill();
      for (let i = 0; i < 9; i++) { g.fillStyle = '#fbf6e8'; g.beginPath(); g.ellipse(W * 0.2 + i * W * 0.075, top - 14 - (i % 2) * 6, 9, 11, 0, 0, Math.PI * 2); g.fill(); }
      // the sea
      fillGrad(g, 0, sea, 0, H, ['#7fd3e6', '#2f9fc4', '#1d7aa6']); g.fillRect(0, sea, W, H - sea);
      g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.moveTo(0, sea);
      for (let x = 0; x <= W; x += 10) g.lineTo(x, sea - 4 + Math.sin(x / 26 + t * 3) * 4);
      g.lineTo(W, sea + 8); g.lineTo(0, sea + 8); g.fill();
      // gull shadows and gulls
      for (const gl of gulls) {
        const x = laneX(gl.lane), k = Math.min(1, gl.t / gl.warn);
        g.fillStyle = `rgba(20,20,30,${0.12 + 0.3 * k})`; g.beginPath(); g.ellipse(x, gl.y, s * (0.9 - 0.3 * k), s * (0.4 - 0.12 * k), 0, 0, Math.PI * 2); g.fill();
        if (k > 0.55) { const p = (gl.t - gl.warn * 0.55) / (gl.warn * 0.45 + 0.8); const gx = x + gl.from * W * (1 - p) * 0.9, gy = gl.y - 40 * Math.sin(p * Math.PI); pic(g, 't_gull_top', gx, gy, s * 1.6, { rot: gl.from > 0 ? Math.PI : 0, flip: false }); }
      }
      for (const c of crabs) { shadow(g, c.x, c.y + s * 0.18, s * 0.8, 0.18); pic(g, 't_crab_top', c.x, c.y, s * 0.9, { rot: Math.PI / 2 + Math.sin(t * 18 + c.y) * 0.06 }); }
      for (const h of hatchlings) {
        const a = h.gone ? Math.max(0, 1 - (h.fade || 0) / 0.7) : 1;
        if (!h.gone) shadow(g, h.x, h.y + s * 0.2, s * 0.6, 0.15);
        pic(g, 't_hatch', h.x, h.y, s, { rot: Math.PI / 2 + Math.sin(t * 12 + h.wob) * 0.18, alpha: a });
      }
      fx.draw(g, cam);
      hearts(g, 18, H - 18, lives);
      if (banT > 0) banner(g, W, H * 0.9, `Wave ${wave}`, Math.min(1, banT * 2), 40);
    }
    return { update, draw, down };
  },
};
