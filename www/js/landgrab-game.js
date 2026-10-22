// Land Grab: glide around a big field, loop out from your land and back again to claim everything inside the loop.
// Cross your own trail and you are out. Cross someone else's trail and they are out, and their land becomes yours.
// Nine computer players play by the same rules and come back after they are knocked out.
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, esc, dialog } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet, levelHome } from './kit.js';
import { cbOn, symbolFor, symbolSvg } from './cb.js';
import { createDrawer } from './landgrab-draw.js';
import { N, MAPS, mapById, maskOf, holesOf, createWorld, addPlayer, spawn, step, steer, think, makeBrain, pct, cellAt } from './landgrab-engine.js';

const LG = () => store.landgrab;
const ART = 'img/kenney/animals-square/';
const SKINS = ['pig', 'panda', 'parrot', 'penguin', 'rabbit', 'monkey', 'giraffe', 'hippo', 'elephant', 'snake'];
const NAMES = { pig: 'Pig', panda: 'Panda', parrot: 'Parrot', penguin: 'Penguin', rabbit: 'Rabbit', monkey: 'Monkey', giraffe: 'Giraffe', hippo: 'Hippo', elephant: 'Elephant', snake: 'Snake' };
// land colour, and the darker edge underneath it
const COLOURS = [
  ['#ff5d8f', '#c63c69'], ['#3fb8f0', '#2486b5'], ['#ffb526', '#c98400'], ['#4cc76a', '#2f9449'], ['#9a6cf2', '#6f45c2'],
  ['#ff7a3d', '#c9541d'], ['#21c4b5', '#14897e'], ['#f2d92c', '#b9a10e'], ['#e9483f', '#ad2b24'], ['#5a7cf5', '#3a55c1'],
];
const BOTS = 9;
const SIM = 1 / 60;    // the game moves on in steps of this many seconds
const STICK = 46;      // how far the joystick knob can travel, in pixels
const PACE = { relaxed: 0.72, normal: 1, fast: 1.35 }; // the speed setting on the home screen
const SPEEDS = [['relaxed', 'Relaxed'], ['normal', 'Normal'], ['fast', 'Fast']];

export const landgrabHelp = (onClose) => helpSheet('How to play Land Grab', [
  'Touch anywhere and drag to steer, like a joystick. Let go and you carry straight on. On a computer, use the arrow keys or W, A, S and D.',
  'Leave your land and you draw a trail behind you. Get back to your land and the trail, and everything inside the loop, becomes yours.',
  'Cross someone else\'s trail and they are out, and all their land becomes yours. They can do the same to you, so do not stay away from home for too long.',
  'If you cross your own trail you are out. The edge of the field, water and rocks are walls: you just slide along them.',
  'Your score is how much of the field you own.',
], 'lg-btn', onClose);


const tile = (skin, cls = '') => `<span class="lg-tile ${cls}"><img src="${ART}${skin}.png" alt=""></span>`;
export const landgrabCardArt = () => `<div class="art-landgrab"><i class="lga-a"></i><i class="lga-b"></i><i class="lga-trail"></i>${tile('pig', 'lga-me')}</div>`;

// A small picture of a map's shape for the map picker (field in white, water blue, rocks grey).
const thumbs = {};
function mapThumb(map) {
  if (thumbs[map.id]) return thumbs[map.id];
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N), m = maskOf(map), holes = holesOf(m);
  const hole = map.hole === 'water' ? [143, 208, 242] : [120, 127, 139];
  for (let i = 0; i < N * N; i++) {
    const col = m[i] ? [255, 255, 255] : holes[i] ? hole : null, k = i * 4;
    if (!col) continue;
    img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return (thumbs[map.id] = c.toDataURL());
}

// ---------- Home ----------
export function landgrabHomeScreen(app) {
  const lg = LG();
  const map = () => mapById(lg.map);
  const screen = levelHome({
    app, cls: 'landgrab-theme landgrab-home', title: 'Land Grab', help: () => landgrabHelp(),
    hero: `<div class="lg-hero">${landgrabCardArt()}</div>`,
    play: () => { const b = lg.bests[map().id]; return { label: `Play ${map().name}`, sub: b ? `Best ${b.toFixed(1)}% of this map` : 'Claim the biggest patch' }; },
    onPlay: () => app.go('landgrabgame', {}),
    extra: () => `<div class="section-title">Speed</div><div class="lg-speed">${SPEEDS.map(([k, label]) => `<button class="${(lg.speed || 'normal') === k ? 'on' : ''}" data-extra="speed:${k}">${label}</button>`).join('')}</div>
      <div class="section-title">Map</div><div class="lg-maps">${MAPS.map((m) => `<button class="lg-map ${m.id === map().id ? 'on' : ''}" data-extra="map:${m.id}"><img src="${mapThumb(m)}" alt=""><span>${m.name}</span>${lg.bests[m.id] ? `<small>${lg.bests[m.id].toFixed(1)}%</small>` : ''}</button>`).join('')}</div>
      <div class="section-title">Your animal</div><div class="lg-skins">${SKINS.map((s) => `<button class="lg-skin ${s === lg.skin ? 'on' : ''}" data-extra="skin:${s}" aria-label="${NAMES[s]}">${tile(s)}</button>`).join('')}</div>
      ${lg.played ? `<div class="lg-stats"><span><b>${lg.played}</b>games</span><span><b>${lg.best.toFixed(1)}%</b>best land</span><span><b>${lg.kills}</b>most knock-outs</span></div>` : ''}`,
    onExtra(v) {
      const [k, id] = v.split(':');
      if (k === 'map') lg.map = id; else if (k === 'speed') lg.speed = id; else lg.skin = id;
      save(); sfx.tap(); screen.refresh();
    },
  });
  return screen;
}


// ---------- Game ----------
export function landgrabGameScreen(app) {
  const lg = LG();
  const root = el(`<section class="screen landgrab-theme lg-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title" data-el="title">Land Grab</div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="lg-stage" data-el="stage"><canvas></canvas>
      <div class="lg-me" data-el="me"><b data-el="pct">0%</b><span data-el="kills"></span></div>
      <ol class="lg-board" data-el="board"></ol>
      <div class="lg-stick" data-el="stick"><i data-el="knob"></i></div>
      <div class="lg-tip" data-el="tip">Touch anywhere and drag to steer</div>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const stage = q('stage'), canvas = $('canvas', stage), ctx = canvas.getContext('2d');
  let w, me, brains, wait, alive = true, raf = 0, last = 0, acc = 0, state = 'play', parts = [], boardAt = 0, thinkAt = 0;
  const drawer = createDrawer();

  function newGame() {
    w = createWorld(Math.random, mapById(lg.map), PACE[lg.speed] || 1);
    q('title').textContent = `Land Grab · ${w.map.name}`;
    const others = SKINS.filter((s) => s !== lg.skin);
    me = addPlayer(w, { name: 'You', skin: lg.skin, colour: COLOURS[0], human: true });
    for (let i = 0; i < BOTS; i++) addPlayer(w, { name: NAMES[others[i]], skin: others[i], colour: COLOURS[i + 1] });
    brains = w.players.map((p, i) => (p.human ? null : makeBrain(w.rng, 0.2 + ((i * 37) % 9) / 10)));
    wait = w.players.map(() => 0);
    spawn(w, me);
    for (const p of w.players) if (!p.human) spawn(w, p);
    // the field's shape and any lake or rocks inside it, as smooth outlines
    drawer.reset(w);
    parts = []; acc = 0; state = 'play';
    q('tip').classList.remove('gone');
    setTimeout(() => q('tip')?.classList.add('gone'), 3000);
    hud(true);
  }


  function hud(force) {
    q('pct').textContent = `${pct(me).toFixed(pct(me) < 10 ? 2 : 1)}%`;
    q('kills').textContent = me.kills ? `${me.kills} knocked out` : '';
    const now = performance.now();
    if (!force && now - boardAt < 400) return;
    boardAt = now;
    const top = w.players.filter((p) => p.alive).sort((a, b) => b.cells - a.cells);
    const rows = top.slice(0, 5);
    if (me.alive && !rows.includes(me)) rows.push(me);
    q('board').innerHTML = rows.map((p) => `<li class="${p.human ? 'you' : ''}"><i style="background:${p.colour[0]}">${cbOn() ? symbolSvg(symbolFor(p.id - 1), { size: 10, stroke: null }) : ''}</i><span>${top.indexOf(p) + 1}. ${esc(p.name)}</span><b>${pct(p).toFixed(1)}%</b></li>`).join('');
  }

  // ----- one step of the game -----
  function tick() {
    thinkAt -= SIM;
    const thinkNow = thinkAt <= 0; // bots decide about ten times a second, which is plenty
    if (thinkNow) thinkAt = 0.1;
    w.players.forEach((p, i) => {
      if (p.human || !thinkNow) return;
      if (p.alive) think(w, p, brains[i]);
      else if ((wait[i] += 0.1) > 3 && spawn(w, p)) { wait[i] = 0; brains[i] = makeBrain(w.rng, brains[i].level); }
    });
    step(w, SIM);
    for (const e of w.events) {
      const p = w.players[e.p - 1];
      if (e.k === 'claim') { if (p.human) { sfx.place(); buzz(10); } }
      else if (e.k === 'die') {
        burst(p);
        if (e.by === me.id) { sfx.unit(); buzz(30); }
        if (p.human) gameOver(e.by ? w.players[e.by - 1] : null);
      }
    }
    w.events = [];
    if (me.alive && pct(me) >= 99.5) gameOver(null, true);
  }

  function burst(p) {
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2, s = 4 + (k % 4) * 1.8;
      parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.7, c: p.colour[0], r: 0.2 + (k % 3) * 0.07 });
    }
  }

  async function gameOver(by, won = false) {
    if (state !== 'play') return;
    state = 'over';
    stick.hide();
    const score = me.bestPct;
    const mapId = w.map.id, was = lg.bests[mapId] || 0;
    const best = score > was, firstBest = best && was > 0;
    lg.played = (lg.played || 0) + 1;
    if (best) lg.bests[mapId] = score;
    lg.best = Math.max(lg.best || 0, score);
    lg.kills = Math.max(lg.kills || 0, me.kills);
    save(true);
    hud(true);
    if (won) sfx.win(); else sfx.error();
    const how = won ? 'The whole field is yours.' : by ? `${esc(by.name)} crossed your trail.` : 'You crossed your own trail.';
    await new Promise((r) => setTimeout(r, 700));
    if (!alive) return;
    const v = await dialog({
      hero: `${ART}${me.skin}.png`, title: won ? 'You own the field' : firstBest ? 'New best' : 'Knocked out', dismissible: false,
      text: `${how} You held ${score.toFixed(score < 10 ? 2 : 1)}% of the field${me.kills ? ` and knocked out ${me.kills}` : ''}.`,
      buttons: [{ label: 'Play again', value: 'again' }, { label: 'Back', value: 'back', cls: 'ghost' }],
    });
    if (!alive) return;
    if (v === 'again') newGame(); else app.back();
  }

  // ----- input: a joystick wherever you touch, or the keyboard -----
  const stickEl = q('stick'), knob = q('knob');
  const stick = {
    id: null, ox: 0, oy: 0,
    show(x, y) { this.ox = x; this.oy = y; stickEl.style.left = `${x}px`; stickEl.style.top = `${y}px`; knob.style.transform = ''; stickEl.classList.add('on'); },
    hide() { this.id = null; stickEl.classList.remove('on'); },
  };
  stage.addEventListener('pointerdown', (e) => {
    if (state !== 'play' || stick.id !== null) return;
    const r = stage.getBoundingClientRect();
    stick.id = e.pointerId; stick.show(e.clientX - r.left, e.clientY - r.top);
    try { stage.setPointerCapture(e.pointerId); } catch { /* not needed */ }
  });
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stick.id) return;
    const r = stage.getBoundingClientRect();
    let dx = e.clientX - r.left - stick.ox, dy = e.clientY - r.top - stick.oy;
    const len = Math.hypot(dx, dy);
    if (len > STICK) { dx *= STICK / len; dy *= STICK / len; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    if (len > 6 && state === 'play') { steer(me, Math.atan2(dy, dx)); q('tip').classList.add('gone'); }
  });
  ['pointerup', 'pointercancel'].forEach((t) => stage.addEventListener(t, (e) => { if (e.pointerId === stick.id) stick.hide(); }));
  const held = new Set();
  const KEYS = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
  const onKey = (e, down) => {
    if (!KEYS[e.code]) return;
    e.preventDefault();
    if (down) held.add(e.code); else held.delete(e.code);
    let x = 0, y = 0; for (const k of held) { x += KEYS[k][0]; y += KEYS[k][1]; }
    if ((x || y) && state === 'play') { steer(me, Math.atan2(y, x)); q('tip').classList.add('gone'); }
  };
  const kd = (e) => onKey(e, true), ku = (e) => onKey(e, false);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);

  // ----- drawing -----
  let cw = 0, ch = 0, dpr = 1;
  function fit() {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(3, window.devicePixelRatio || 1);
    cw = r.width; ch = r.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  }
  const ro = new ResizeObserver(fit); ro.observe(stage);

  function draw() {
    if (!cw) fit();
    drawer.draw(ctx, { W: cw, H: ch, dpr }, w, me, parts);
  }

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (state === 'play') {
      acc += dt;
      let n = 0;
      while (acc >= SIM && n < 8 && state === 'play') { acc -= SIM; tick(); n++; }
      if (n === 8) acc = 0;
      hud(false);
    }
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; p.life -= dt; }
    parts = parts.filter((p) => p.life > 0);
    draw();
  }

  // stop while the app is hidden or help is open
  const pause = () => { if (state === 'play') { state = 'paused'; stick.hide(); } };
  const resume = () => { if (state === 'paused' && alive) { state = 'play'; last = 0; } };
  const onVis = () => (document.hidden ? pause() : resume());
  document.addEventListener('visibilitychange', onVis);
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') { pause(); landgrabHelp(resume); }
  });
  // the topbar buttons should not start the joystick
  root.querySelector('.topbar').addEventListener('pointerdown', (e) => e.stopPropagation());

  newGame();
  if (!lg.seenHelp) { lg.seenHelp = true; save(); pause(); setTimeout(() => landgrabHelp(resume), 300); }
  raf = requestAnimationFrame(frame);
  return {
    root,
    destroy() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
      document.removeEventListener('visibilitychange', onVis); save(true);
    },
  };
}
