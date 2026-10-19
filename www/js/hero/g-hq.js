// Hero HQ: emergencies pop up around the city. Tap one, then tap the Avenger with the power it needs. Heroes fly out
// from the tower, sort it out and come back. A shift lasts two minutes; three missed emergencies end it early.
import { FX, snd, buzz, clamp, fmt, roundRect } from '../yeti/kit.js';
import { drawHero, HEROES, chosen, drawEmblem, starPath } from './kit.js';

const SHIFT = 120;
const POWERS = {
  agility: { name: 'Agility', col: '#d0232a' }, web: { name: 'Webs', col: '#b5334a' }, shield: { name: 'Shield', col: '#1f4ea3' }, leader: { name: 'Leader', col: '#3c6bdc' },
  flight: { name: 'Flight', col: '#e3762b' }, tech: { name: 'Tech', col: '#14a3a3' }, lightning: { name: 'Lightning', col: '#d9a520' },
  strength: { name: 'Strength', col: '#4c9a2a' }, stealth: { name: 'Stealth', col: '#4a4a5a' }, speed: { name: 'Speed', col: '#8a5bd6' }, cosmic: { name: 'Cosmic', col: '#ec5fa4' },
};
const JOBS = [
  ['Bridge giving way', 'strength'], ['Bus tipped over', 'strength'], ['Plane losing height', 'flight'], ['Window cleaner stranded', 'flight'],
  ['Robots on the square', 'shield'], ['Ferris wheel stuck', 'agility'], ['Crane swinging loose', 'web'], ['Scaffolding collapsing', 'web'], ['City blackout', 'lightning'],
  ['Storm over the harbour', 'lightning'], ['Spy in the lab', 'stealth'], ['Runaway train', 'speed'], ['Meteor incoming', 'cosmic'],
  ['Drone swarm', 'tech'], ['Crowd panicking', 'leader'], ['Bank vault break-in', 'stealth'], ['Car chase', 'speed'],
];
const SPEED = { iron: 1.6, thor: 1.5, marvel: 1.6, panther: 1.3, spidey: 1.2, widow: 1.0, cap: 1.0, hulk: 1.25, custom: 1.3 };

function powerIcon(g, p, x, y, r) {
  const P = POWERS[p];
  g.save(); g.translate(x, y);
  g.fillStyle = P.col; g.beginPath(); g.arc(0, 0, r, 0, 6.283); g.fill();
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = Math.max(1.5, r * 0.14); g.lineCap = 'round'; g.lineJoin = 'round';
  const s = r * 0.55;
  if (p === 'agility') { g.beginPath(); g.moveTo(-s * 0.8, s * 0.6); g.quadraticCurveTo(0, -s * 1.4, s * 0.8, s * 0.6); g.stroke(); g.beginPath(); g.arc(s * 0.8, s * 0.6, s * 0.22, 0, 6.283); g.fill(); }
  else if (p === 'web') { for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * s, Math.sin(a) * s); g.stroke(); } g.beginPath(); g.arc(0, 0, s * 0.55, 0, 6.283); g.stroke(); }
  else if (p === 'shield') { g.lineWidth = r * 0.12; g.beginPath(); g.arc(0, 0, s, 0, 6.283); g.stroke(); starPath(g, 0, 0, s * 0.55, s * 0.22); g.fill(); }
  else if (p === 'leader') { starPath(g, 0, 0, s, s * 0.42); g.fill(); }
  else if (p === 'flight') { g.beginPath(); g.moveTo(-s, s * 0.3); g.lineTo(s, -s * 0.6); g.lineTo(-s * 0.1, s * 0.1); g.lineTo(-s * 0.2, s * 0.8); g.closePath(); g.fill(); }
  else if (p === 'tech') { g.beginPath(); for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, rr = i % 2 ? s * 0.7 : s; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); g.fillStyle = POWERS[p].col; g.beginPath(); g.arc(0, 0, s * 0.35, 0, 6.283); g.fill(); }
  else if (p === 'lightning') drawEmblem(g, 'bolt', '#fff', 0, 0, s / 15);
  else if (p === 'strength') { g.fillRect(-s, -s * 0.15, s * 2, s * 0.3); g.fillRect(-s, -s * 0.55, s * 0.4, s * 1.1); g.fillRect(s * 0.6, -s * 0.55, s * 0.4, s * 1.1); }
  else if (p === 'stealth') { g.beginPath(); g.ellipse(0, 0, s, s * 0.5, 0, 0, 6.283); g.fill(); g.fillStyle = POWERS[p].col; g.beginPath(); g.arc(0, 0, s * 0.3, 0, 6.283); g.fill(); g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(-s, s * 0.8); g.lineTo(s, -s * 0.8); g.stroke(); }
  else if (p === 'speed') { for (const dx of [-s * 0.5, s * 0.3]) { g.beginPath(); g.moveTo(dx - s * 0.3, -s * 0.6); g.lineTo(dx + s * 0.3, 0); g.lineTo(dx - s * 0.3, s * 0.6); g.stroke(); } }
  else if (p === 'cosmic') { starPath(g, 0, 0, s, s * 0.4, 8); g.fill(); }
  g.restore();
}

export default {
  id: 'hq', name: 'Hero HQ', blurb: 'Send the right Avenger to every emergency', unit: 'pts',
  theme: ['#8ec9ff', '#cfe8ff', '#eef6ff'],
  how: [
    'Emergencies pop up around the city, each showing the power it needs. Tap an emergency, then tap a hero who has that power.',
    'Heroes fly out from the tower, take care of it and fly back. A busy hero cannot be sent again until they are home.',
    'The right power scores points, and quick saves in a row build a combo. Send the wrong hero and the emergency carries on.',
    'If an emergency\'s timer runs out, the city takes a hit. Three hits, or the end of the two-minute shift, and the shift is over.',
  ],
  thumb(g, w, h) {
    g.fillStyle = '#b8d7a6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8e8ee'; for (let i = 0; i < 4; i++) { g.fillRect(0, h * (0.2 + i * 0.22), w, 5); g.fillRect(w * (0.15 + i * 0.25), 0, 5, h); }
    powerIcon(g, 'strength', w * 0.25, h * 0.32, 11); powerIcon(g, 'flight', w * 0.7, h * 0.55, 11);
    drawHero(g, w * 0.5, h * 0.96, h * 0.5, { look: HEROES[2].look, pose: 'fly' });
  },
  create(ctx) {
    const fx = new FX();
    const Z = 30, fxCam = { toScreen: (x, y) => [x * Z, -y * Z], zoom: Z }; // particles work in metres, the map in px
    const me = chosen();
    const team = HEROES.slice(0, 8).map((h) => ({ ...h }));
    if (me.id === 'custom') team[7] = { ...me, powers: ['cosmic', 'flight'] };
    team.forEach((h) => { h.state = 'home'; h.x = 0; h.y = 0; h.t = 0; h.job = null; });
    const jobs = [];
    let t = 0, score = 0, combo = 0, strikes = 0, nextJob = 1.2, sel = null, selHero = null, over = false, saves = 0;
    let L = null; // layout
    function layout() {
      const W = ctx.W, Hh = ctx.H, barH = Math.min(170, Hh * 0.3);
      const cols = 4, cw = (W - 16) / cols, ch = barH / 2 - 6;
      L = { W, Hh, mapH: Hh - barH - 8, barY: Hh - barH, cw, ch,
        cards: team.map((_, i) => ({ x: 8 + (i % cols) * cw, y: Hh - barH + Math.floor(i / cols) * (ch + 6), w: cw - 6, h: ch })),
        hq: { x: W / 2, y: (Hh - barH) * 0.52 } };
      L.sites = [];
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + 0.3, r = 0.55 + (i % 3) * 0.15; L.sites.push({ x: W / 2 + Math.cos(a) * W * 0.42 * r, y: L.mapH * 0.52 + Math.sin(a) * L.mapH * 0.42 * r }); }
    }
    layout();
    const life = () => clamp(14 - t / 15, 8, 14);
    function spawn() {
      const free = L.sites.map((_, i) => i).filter((i) => !jobs.some((j) => j.site === i));
      if (!free.length) return;
      const site = free[(Math.random() * free.length) | 0];
      const [name, power] = JOBS[(Math.random() * JOBS.length) | 0];
      jobs.push({ site, name, power, t: 0, life: life(), hero: null, done: false });
      snd.tick();
    }
    function dispatch(job, hero) {
      if (hero.state !== 'home' || job.hero) return;
      const s = L.sites[job.site], d = Math.hypot(s.x - L.hq.x, s.y - L.hq.y) / Math.min(L.W, L.mapH);
      hero.state = 'out'; hero.job = job; hero.t = 0; hero.go = 0.6 + d * 1.6 / (SPEED[hero.id] || 1.2); job.hero = hero;
      sel = null; selHero = null; snd.swoosh(); buzz(8);
    }
    function arrive(hero) {
      const job = hero.job;
      if (hero.powers.includes(job.power)) {
        combo++; const pts = 100 + Math.round((1 - job.t / job.life) * 60) + (combo - 1) * 20;
        score += pts; saves++; job.done = true;
        const s = L.sites[job.site]; fx.text(s.x / Z, -(s.y - 20) / Z, `+${pts}`, { color: '#ffe27a', size: 20 }); fx.stars(s.x / Z, -s.y / Z, 10);
        snd.ding(Math.min(6, combo));
      } else {
        combo = 0; job.hero = null; const s = L.sites[job.site]; fx.text(s.x / Z, -(s.y - 20) / Z, 'Wrong power', { color: '#ff8a8a', size: 16 }); snd.thud();
      }
      hero.state = 'back'; hero.t = 0;
    }
    ctx.hud({ left: '2:00', center: '0 pts', right: 'Hits 0/3' });
    ctx.prompt('Tap an emergency, then a hero');
    return {
      resize: layout,
      down(x, y) {
        if (over) return;
        const card = L.cards.findIndex((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
        if (card >= 0) {
          const h = team[card];
          if (h.state !== 'home') { snd.tick(); return; }
          if (sel) dispatch(sel, h); else { selHero = selHero === h ? null : h; snd.tick(); }
          return;
        }
        let best = null, bd = 40;
        for (const j of jobs) if (!j.done && !j.hero) { const s = L.sites[j.site], d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = j; } }
        if (best) { if (selHero) dispatch(best, selHero); else { sel = sel === best ? null : best; snd.tick(); } ctx.prompt(''); }
      },
      update(dt) {
        fx.update(dt);
        if (over) return;
        t += dt;
        nextJob -= dt;
        if (nextJob <= 0) { spawn(); nextJob = clamp(4.2 - t / 40, 1.6, 4.2) * (0.7 + Math.random() * 0.6); }
        for (const j of jobs) {
          if (j.done) { j.fade = (j.fade || 0) + dt; continue; }
          if (!j.hero) j.t += dt;
          if (j.t >= j.life) { j.done = true; j.failed = true; strikes++; combo = 0; snd.fail(); buzz([40, 40, 40]); if (sel === j) sel = null; const s = L.sites[j.site]; fx.text(s.x / Z, -(s.y - 20) / Z, 'Missed', { color: '#ff6b6b', size: 18 }); }
        }
        for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].done && (jobs[i].fade || 0) > 0.8 && !team.some((h) => h.job === jobs[i] && h.state === 'out')) jobs.splice(i, 1);
        for (const h of team) {
          if (h.state === 'out') { h.t += dt; if (h.t >= h.go) arrive(h); }
          else if (h.state === 'back') { h.t += dt; if (h.t >= h.go) { h.state = 'home'; h.job = null; } }
        }
        const left = Math.max(0, SHIFT - t);
        ctx.hud({ left: `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`, center: `${fmt(score)} pts${combo > 1 ? ` x${combo}` : ''}`, right: `Hits ${strikes}/3` });
        if (left <= 0 || strikes >= 3) { over = true; ctx.finish(score, `${saves} emergencies handled`, { coins: Math.round(score / 40) }); }
      },
      draw(g) {
        const { W, Hh, mapH } = L;
        // city map
        g.fillStyle = '#a9d18e'; g.fillRect(0, 0, W, mapH + 8);
        g.fillStyle = '#7fb8e6'; g.beginPath(); g.moveTo(0, mapH * 0.82); g.quadraticCurveTo(W * 0.4, mapH * 0.7, W, mapH * 0.9); g.lineTo(W, mapH + 8); g.lineTo(0, mapH + 8); g.fill();
        g.fillStyle = '#e6e3ea';
        const step = Math.max(50, W / 6);
        for (let x = step / 2; x < W; x += step) g.fillRect(x, 0, 7, mapH * 0.84);
        for (let y = step / 2; y < mapH * 0.8; y += step) g.fillRect(0, y, W, 7);
        g.fillStyle = 'rgba(80,90,120,.28)';
        for (let x = step / 2 + 14; x < W; x += step) for (let y = step / 2 + 14; y < mapH * 0.78; y += step) { g.fillRect(x, y, step - 28, (step - 28) * 0.45); g.fillRect(x + (step - 28) * 0.5, y + (step - 28) * 0.55, (step - 28) * 0.5, (step - 28) * 0.4); }
        // the tower
        const hq = L.hq;
        g.fillStyle = '#d7dde8'; roundRect(g, hq.x - 22, hq.y - 30, 44, 60, 8); g.fill(); g.strokeStyle = '#7d8aa3'; g.lineWidth = 2; g.stroke();
        g.fillStyle = '#3c6bdc'; g.font = '900 26px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('A', hq.x, hq.y + 2);
        // flight paths and heroes in the air
        for (const h of team) {
          if (h.state === 'home' || !h.job) continue;
          const s = L.sites[h.job.site], k = clamp(h.t / h.go, 0, 1), f = h.state === 'out' ? k : 1 - k;
          const x = hq.x + (s.x - hq.x) * f, y = hq.y + (s.y - hq.y) * f - Math.sin(f * Math.PI) * 30;
          g.strokeStyle = 'rgba(255,255,255,.6)'; g.setLineDash([4, 6]); g.lineWidth = 2; g.beginPath(); g.moveTo(hq.x, hq.y); g.lineTo(s.x, s.y); g.stroke(); g.setLineDash([]);
          drawHero(g, x, y + 14, 34, { look: h.look, pose: 'fly', flip: s.x < hq.x });
        }
        // emergencies
        for (const j of jobs) {
          const s = L.sites[j.site], a = j.done ? Math.max(0, 1 - (j.fade || 0) / 0.8) : 1;
          g.save(); g.globalAlpha = a;
          const k = j.t / j.life, pulse = j.done ? 0 : Math.sin(t * 8) * (k > 0.7 ? 3 : 1);
          if (sel === j) { g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.arc(s.x, s.y, 27, 0, 6.283); g.stroke(); }
          g.fillStyle = j.failed ? '#7a7a7a' : j.done ? '#3fae6a' : '#ffffff'; g.beginPath(); g.arc(s.x, s.y, 22 + pulse, 0, 6.283); g.fill();
          if (!j.done) { g.strokeStyle = k > 0.7 ? '#e5383b' : '#f2a91d'; g.lineWidth = 4; g.beginPath(); g.arc(s.x, s.y, 22 + pulse, -Math.PI / 2, -Math.PI / 2 + (1 - k) * 6.283); g.stroke(); }
          powerIcon(g, j.power, s.x, s.y, 16);
          g.font = '800 11px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
          const tw = g.measureText(j.name).width + 10;
          g.fillStyle = 'rgba(20,30,60,.78)'; roundRect(g, s.x - tw / 2, s.y + 26, tw, 16, 8); g.fill();
          g.fillStyle = '#fff'; g.fillText(j.name, s.x, s.y + 28);
          g.restore();
        }
        // team bar
        g.fillStyle = 'rgba(20,28,52,.92)'; g.fillRect(0, L.barY - 6, W, Hh - L.barY + 6);
        team.forEach((h, i) => {
          const c = L.cards[i], ready = h.state === 'home';
          const match = sel && h.powers.includes(sel.power) && ready;
          g.fillStyle = selHero === h ? '#3c6bdc' : match ? 'rgba(242,194,48,.35)' : 'rgba(255,255,255,.1)'; roundRect(g, c.x, c.y, c.w, c.h, 10); g.fill();
          if (match) { g.strokeStyle = '#f2c230'; g.lineWidth = 2; g.stroke(); }
          g.save(); g.beginPath(); g.rect(c.x, c.y, c.w, c.h); g.clip();
          drawHero(g, c.x + c.h * 0.36, c.y + c.h * 1.1, c.h * 1.15, { look: h.look, alpha: ready ? 1 : 0.35 });
          g.restore();
          g.font = '800 10px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillStyle = '#fff';
          const nm = { cap: 'Cap', marvel: 'Capt. Marvel', panther: 'Panther', widow: 'Black Widow' }[h.id] || h.name;
          g.fillText(nm, c.x + c.h * 0.7, c.y + 5);
          h.powers.forEach((p, k) => powerIcon(g, p, c.x + c.h * 0.7 + 9 + k * 20, c.y + c.h - 13, 9));
          if (!ready) { g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '800 10px system-ui, sans-serif'; g.fillText(h.state === 'out' ? 'Out' : 'Returning', c.x + c.h * 0.7, c.y + 18); }
        });
        fx.draw(g, fxCam);
      },
    };
  },
};
