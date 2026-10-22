// Slither Snacks: glide round a glowing arena, eat snacks to grow, and make other snakes run into you.
// Run your head into another snake (or the edge) and you are out. Fourteen computer snakes, each with its own
// character, share the arena. For two players, it is also in Play Together (duo/g-snake.js).
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, esc, dialog } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet, levelHome } from './kit.js';
import { createWorld, addSnake, spawn, step, steer, think, makeBrain, bodyGrid, radiusOf } from './snake-engine.js';
import { drawWorld, SKINS, skinById, preload } from './snake-draw.js';

const SS = () => store.snake;
const BOTS = 14;
const SIM = 1 / 60;
const STICK = 46;
export const PACE = { relaxed: 0.75, normal: 1, fast: 1.35 };
export const SPEEDS = [['relaxed', 'Relaxed'], ['normal', 'Normal'], ['fast', 'Fast']];
export const BOT_NAMES = ['Noodle', 'Wiggles', 'Zigzag', 'Slinky', 'Biscuit', 'Pretzel', 'Jellybean', 'Squiggle', 'Doodle', 'Spaghetti',
  'Mochi', 'Twister', 'Pickles', 'Bubbles', 'Ziggy', 'Waffles', 'Sprout', 'Gizmo', 'Nugget', 'Sherbet', 'Pippin', 'Rascal'];
export const score = (s) => Math.round(s.mass * 10); // length shown to players

export const snakeHelp = (onClose) => helpSheet('How to play Slither Snacks', [
  'Touch anywhere and drag to steer, like a joystick. On a computer, use the arrow keys.',
  'Eat the glowing snacks to grow longer. Hold the boost button (or Space) to speed up. Boosting costs a little length, which drops behind you as snacks.',
  'If your head touches another snake, you are out, and your body turns into a trail of big snacks. The red edge of the arena knocks you out too.',
  'Get in front of other snakes so they run into you, then eat what they leave behind.',
  'You can also play against a friend on two phones: open Play Together and pick Slither Snacks.',
], 'ss-btn', onClose);

const skinTile = (sk, cls = '') => `<span class="ss-tile ${cls}" style="--a:${sk.cols[0]};--b:${sk.cols[1] || sk.cols[0]}"><i></i><img src="img/snake/${sk.face}.png" alt=""></span>`;
export const snakeCardArt = () => `<div class="art-snake"><span class="ss-wiggle">${[...Array(9)].map((_, k) => `<i style="--k:${k}"></i>`).join('')}</span>${skinTile(SKINS[3], 'ss-head')}<b class="ss-snack s1"></b><b class="ss-snack s2"></b><b class="ss-snack s3"></b></div>`;

// ---------- Home ----------
export function snakeHomeScreen(app) {
  const ss = SS();
  const screen = levelHome({
    app, cls: 'snake-theme', title: 'Slither Snacks', help: () => snakeHelp(),
    hero: `<div class="ss-hero">${snakeCardArt()}</div>`,
    play: () => ({ label: 'Play', sub: ss.best ? `Best length ${ss.best.toLocaleString('en-AU')}` : 'Eat, grow, outsmart' }),
    onPlay: () => app.go('snakegame', {}),
    extra: () => `<div class="section-title">Speed</div><div class="ss-speed">${SPEEDS.map(([k, l]) => `<button class="${(ss.speed || 'normal') === k ? 'on' : ''}" data-extra="speed:${k}">${l}</button>`).join('')}</div>
      <div class="section-title">Your snake</div><div class="ss-skins">${SKINS.map((sk) => `<button class="ss-skin ${sk.id === ss.skin ? 'on' : ''}" data-extra="skin:${sk.id}" aria-label="${sk.name}">${skinTile(sk)}<small>${sk.name}</small></button>`).join('')}</div>
      ${ss.played ? `<div class="ss-stats"><span><b>${ss.played}</b>games</span><span><b>${(ss.best || 0).toLocaleString('en-AU')}</b>best length</span><span><b>${ss.kills || 0}</b>most knock-outs</span></div>` : ''}`,
    onExtra(v) { const [k, id] = v.split(':'); if (k === 'speed') ss.speed = id; else ss.skin = id; save(); sfx.tap(); screen.refresh(); },
  });
  return screen;
}

// ---------- Game ----------
export function snakeGameScreen(app) {
  const ss = SS();
  preload();
  const root = el(`<section class="screen snake-theme ss-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">Slither Snacks</div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="ss-stage" data-el="stage"><canvas></canvas>
      <div class="ss-me"><b data-el="len">0</b><span data-el="rank"></span></div>
      <ol class="ss-board" data-el="board"></ol>
      <button class="ss-boost" data-el="boost" aria-label="Boost">${'<svg viewBox="0 0 24 24"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>'}</button>
      <div class="lg-stick ss-stick" data-el="stick"><i data-el="knob"></i></div>
      <div class="ss-tip" data-el="tip">Touch anywhere and drag to steer</div>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const stage = q('stage'), canvas = $('canvas', stage), g = canvas.getContext('2d');
  let w, me, brains, wait, alive = true, raf = 0, last = 0, acc = 0, state = 'play', boardAt = 0, boosting = false, keyBoost = false, lastSeen = null;
  const skins = new Map(), names = new Map();

  function newGame() {
    w = createWorld(Math.random, PACE[ss.speed] || 1);
    const mine = skinById(ss.skin);
    me = addSnake(w, { name: 'You', colourIdx: SKINS.indexOf(mine) % 9 });
    skins.set(me.id, mine); names.set(me.id, 'You');
    const pool = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < BOTS; i++) {
      const s = addSnake(w, { name: pool[i], colourIdx: i % 9 });
      skins.set(s.id, SKINS[(i + 1 + SKINS.indexOf(mine)) % SKINS.length]); names.set(s.id, pool[i]);
      spawn(w, s, 12 + Math.floor(Math.random() * 120)); // some start bigger, so the arena feels lived in
    }
    spawn(w, me);
    brains = w.snakes.map((s) => (s === me ? null : makeBrain(w.rng)));
    wait = w.snakes.map(() => 0);
    acc = 0; state = 'play'; boosting = false;
    q('tip').classList.remove('gone'); setTimeout(() => q('tip')?.classList.add('gone'), 3000);
    hud(true);
  }

  function hud(force) {
    if (me.alive) q('len').textContent = score(me).toLocaleString('en-AU');
    const now = performance.now();
    if (!force && now - boardAt < 500) return;
    boardAt = now;
    const top = w.snakes.filter((s) => s.alive).sort((a, b) => b.mass - a.mass);
    q('rank').textContent = me.alive ? `${top.indexOf(me) + 1} of ${top.length}` : '';
    const rows = top.slice(0, 6);
    if (me.alive && !rows.includes(me)) rows.push(me);
    q('board').innerHTML = rows.map((s) => `<li class="${s === me ? 'you' : ''}"><span>${top.indexOf(s) + 1}. ${esc(names.get(s.id))}</span><b>${score(s).toLocaleString('en-AU')}</b></li>`).join('');
  }

  function tick() {
    const grid = bodyGrid(w);
    w.snakes.forEach((s, i) => {
      if (s === me) return;
      if (s.alive) think(w, s, brains[i], SIM, grid);
      else if ((wait[i] += SIM) > 2 + (i % 4) * 0.5) { wait[i] = 0; brains[i] = makeBrain(w.rng); spawn(w, s, 12 + Math.floor(Math.random() * 30)); }
    });
    if (me.alive) me.boost = boosting || keyBoost;
    step(w, SIM);
    w.eaten = []; w.added = [];
    for (const e of w.events) {
      if (e.by === me.id) { sfx.unit(); buzz(30); }
      if (e.s === me.id) gameOver(e.by ? w.snakes[e.by - 1] : null);
    }
    w.events = [];
  }

  async function gameOver(by) {
    if (state !== 'play') return;
    state = 'over';
    stick.hide();
    const len = Math.round(me.best * 10), best = len > (ss.best || 0);
    ss.played = (ss.played || 0) + 1;
    if (best) ss.best = len;
    ss.kills = Math.max(ss.kills || 0, me.kills);
    save(true); hud(true); sfx.error(); buzz([60, 40, 60]);
    lastSeen = { x: me.pts[0]?.x ?? 0, y: me.pts[0]?.y ?? 0 };
    await new Promise((r) => setTimeout(r, 1200));
    if (!alive) return;
    const v = await dialog({
      hero: `img/snake/${skinById(ss.skin).face}.png`, title: best && ss.played > 1 ? 'New best' : 'Out of the game', dismissible: false,
      text: `${by ? `You ran into ${names.get(by.id)}.` : 'You hit the edge of the arena.'} Your longest was ${len.toLocaleString('en-AU')}${me.kills ? `, and you knocked out ${me.kills}` : ''}.`,
      buttons: [{ label: 'Play again', value: 'again' }, { label: 'Back', value: 'back', cls: 'ghost' }],
    });
    if (!alive) return;
    if (v === 'again') { lastSeen = null; newGame(); } else app.back();
  }

  // ----- input: a joystick wherever you touch, a boost button, or the keyboard -----
  const stickEl = q('stick'), knob = q('knob');
  const stick = { id: null, ox: 0, oy: 0, hide() { this.id = null; stickEl.classList.remove('on'); } };
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.ss-boost')) return;
    if (state !== 'play' || stick.id !== null) return;
    const r = stage.getBoundingClientRect();
    stick.id = e.pointerId; stick.ox = e.clientX - r.left; stick.oy = e.clientY - r.top;
    stickEl.style.left = `${stick.ox}px`; stickEl.style.top = `${stick.oy}px`; knob.style.transform = ''; stickEl.classList.add('on');
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
  const boostBtn = q('boost');
  const boostOn = (e) => { e.preventDefault(); e.stopPropagation(); boosting = true; boostBtn.classList.add('on'); try { boostBtn.setPointerCapture(e.pointerId); } catch { /* not needed */ } };
  const boostOff = () => { boosting = false; boostBtn.classList.remove('on'); };
  boostBtn.addEventListener('pointerdown', boostOn);
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => boostBtn.addEventListener(t, boostOff));
  const held = new Set();
  const KEYS = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
  const onKey = (e, down) => {
    if (e.code === 'Space') { e.preventDefault(); keyBoost = down; return; }
    if (!KEYS[e.code]) return;
    e.preventDefault();
    if (down) held.add(e.code); else held.delete(e.code);
    let x = 0, y = 0; for (const k of held) { x += KEYS[k][0]; y += KEYS[k][1]; }
    if ((x || y) && state === 'play') { steer(me, Math.atan2(y, x)); q('tip').classList.add('gone'); }
  };
  const kd = (e) => onKey(e, true), ku = (e) => onKey(e, false);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);

  // ----- drawing -----
  const view = { W: 0, H: 0, dpr: 1 };
  function fit() {
    const r = stage.getBoundingClientRect();
    view.dpr = Math.min(2.5, window.devicePixelRatio || 1); view.W = r.width; view.H = r.height;
    canvas.width = Math.round(view.W * view.dpr); canvas.height = Math.round(view.H * view.dpr);
    canvas.style.width = view.W + 'px'; canvas.style.height = view.H + 'px';
  }
  const ro = new ResizeObserver(fit); ro.observe(stage);

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
    } else if (state === 'over') {
      // the arena carries on behind the game-over message
      const grid = bodyGrid(w);
      w.snakes.forEach((s, i) => { if (s !== me && s.alive) think(w, s, brains[i], dt, grid); });
      step(w, Math.min(dt, SIM * 2)); w.eaten = []; w.added = []; w.events = [];
    }
    if (!view.W) fit();
    drawWorld(g, view, w, me.alive ? me : lastSeen, { skinOf: (s) => skins.get(s.id), nameOf: (s) => names.get(s.id), time: now / 1000, me: me.id });
  }

  const pause = () => { if (state === 'play') { state = 'paused'; stick.hide(); boostOff(); } };
  const resume = () => { if (state === 'paused' && alive) { state = 'play'; last = 0; } };
  const onVis = () => (document.hidden ? pause() : resume());
  document.addEventListener('visibilitychange', onVis);
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') { pause(); snakeHelp(resume); }
  });
  root.querySelector('.topbar').addEventListener('pointerdown', (e) => e.stopPropagation());

  newGame();
  if (!ss.seenHelp) { ss.seenHelp = true; save(); pause(); setTimeout(() => snakeHelp(resume), 300); }
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
