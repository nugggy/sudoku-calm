// Slither Snacks for two phones: both players share one arena with ten computer snakes. Steer with a joystick
// wherever you touch, hold the button to boost. When one of you is knocked out, the other wins the round.
// First to 3. The host phone runs the arena (snake-engine.js); the guest sends its stick and boost.
import { stage, session, touches, keys, COL, play, vib } from './rtd-kit.js';
import { createWorld, addSnake, spawn, step, steer, think, makeBrain, bodyGrid, packSnakes, packFood, unpack } from '../snake-engine.js';
import { drawWorld, SKINS, skinById, preload } from '../snake-draw.js';
import { BOT_NAMES, PACE, score } from '../snake-game.js';
import { store } from '../store.js';

export const TO = 3, BOTS = 10;
const STICK = 46;
const SIM = 1 / 60;

// ---------- rules (host) ----------
function newRound(s) {
  for (let p = 0; p < 2; p++) spawn(s.w, s.w.snakes[p]);
  s.ph = 'play'; s.tm = 0; s.round++;
}
export function snakeInit(names = ['Player 1', 'Player 2'], pace = 1, rng = Math.random) {
  const w = createWorld(rng, pace);
  const bots = BOT_NAMES.slice().sort(() => rng() - 0.5);
  const meta = { names: [], skins: [] };
  // the two players are snakes 1 and 2, in the players' colours; then the computer snakes
  const playerSkins = ['mango', 'ocean'];
  for (let p = 0; p < 2; p++) { addSnake(w, { name: names[p], colourIdx: p ? 5 : 1 }); meta.names.push(names[p]); meta.skins.push(playerSkins[p]); }
  for (let i = 0; i < BOTS; i++) {
    const sn = addSnake(w, { name: bots[i], colourIdx: i % 9 });
    meta.names.push(bots[i]); meta.skins.push(SKINS[(i + 2) % SKINS.length].id);
    spawn(w, sn, 12 + Math.floor(rng() * 90));
  }
  const s = { w, meta, brains: w.snakes.map((sn, i) => (i < 2 ? null : makeBrain(rng))), wait: w.snakes.map(() => 0), sc: [0, 0], ph: 'play', tm: 0, round: 0, n: 0, winner: null };
  newRound(s);
  return s;
}
export function snakeStep(s, inputs, ev) {
  const w = s.w, grid = bodyGrid(w);
  for (let p = 0; p < 2; p++) {
    const sn = w.snakes[p], i = inputs[p] || {};
    if (sn.alive && s.ph === 'play') steer(sn, typeof i.a === 'number' ? i.a : null, !!i.b);
  }
  w.snakes.forEach((sn, i) => {
    if (i < 2) return;
    if (sn.alive) think(w, sn, s.brains[i], SIM, grid);
    else if ((s.wait[i] += SIM) > 2.5) { s.wait[i] = 0; s.brains[i] = makeBrain(w.rng); spawn(w, sn, 12 + Math.floor(w.rng() * 30)); }
  });
  step(w, SIM);
  const out = [];
  for (const e of w.events) {
    if (e.s <= 2) { out.push(e.s - 1); ev({ k: 'out', p: e.s - 1, by: e.by ? s.meta.names[e.by - 1] : '' }); }
    else if (e.by && e.by <= 2) ev({ k: 'ko', p: e.by - 1 });
  }
  w.events = [];
  if (s.ph === 'play' && out.length) {
    // one of you is out: the other wins the round (both at once: nobody scores)
    const alive = [0, 1].filter((p) => w.snakes[p].alive);
    if (alive.length === 1) s.sc[alive[0]]++;
    s.ph = 'over'; s.tm = 110;
    for (const p of alive) steer(w.snakes[p], null, false);
    ev({ k: 'round', w: alive.length === 1 ? alive[0] : -1 });
  } else if (s.ph === 'over' && --s.tm <= 0) {
    if (Math.max(...s.sc) >= TO) { s.ph = 'end'; s.winner = s.sc[0] > s.sc[1] ? 0 : 1; }
    else { for (let p = 0; p < 2; p++) if (w.snakes[p].alive) { w.snakes[p].alive = false; w.snakes[p].pts = []; } newRound(s); }
  }
}
// what the guest gets: snakes every time, snacks as changes with a full list every two seconds
export function snakeSnap(s) {
  const full = s.n++ % 60 === 0;
  return { s: packSnakes(s.w), f: packFood(s.w, full), sc: s.sc, ph: s.ph, m: full ? s.meta : undefined };
}
export function snakeApply(gs, d) {
  gs = gs || { view: null, meta: null, sc: [0, 0], ph: 'play' };
  if (d.m) gs.meta = d.m;
  gs.view = unpack(gs.view, d.s, gs.view || d.f?.all ? d.f : null);
  gs.sc = d.sc; gs.ph = d.ph;
  return gs;
}

// ---------- screen ----------
function create(ctx) {
  preload();
  const st = stage(ctx, 'snake-duo');
  const names = ctx.names || ['Player 1', 'Player 2'];
  const pace = PACE[store.snake?.speed] || 1;
  let dead = false, boosting = false, stickAng = null, keyAng = null;
  const ses = session(ctx, {
    init: () => snakeInit(names, pace, ctx.rng),
    input: () => ({ a: null, b: 0 }),
    step: (s, inputs, ev) => snakeStep(s, inputs, ev),
    snap: snakeSnap,
    apply: snakeApply,
    result: (s) => (s.ph === 'end' ? { winner: s.winner, sc: s.sc } : null),
  }, {
    event(e) {
      if (e.k === 'out') {
        const mine = e.p === ses?.me;
        st.banner(mine ? 'You are out' : `${names[e.p]} is out`, e.by ? `Ran into ${e.by}` : 'Hit the edge', 1600);
        play(ctx, mine ? 'error' : 'unit'); vib(ctx, mine ? [60, 40, 60] : 25);
      } else if (e.k === 'ko' && e.p === ses?.me) { play(ctx, 'unit'); vib(ctx, 25); }
    },
    draw(s, host) {
      if (!s) return;
      const world = host ? s.w : s.view, meta = s.meta;
      if (!world || !meta) return;
      const mine = world.snakes.find((x) => x.id === ses.me + 1);
      if (mine && mine.alive && mine.pts.length) last = { x: mine.pts[0].x, y: mine.pts[0].y };
      drawWorld(st.g, st.view, world, mine && mine.alive && mine.pts.length ? mine : last, {
        skinOf: (sn) => skinById(meta.skins[sn.id - 1]), nameOf: (sn) => meta.names[sn.id - 1], time: performance.now() / 1000, me: ses.me + 1,
      });
      const myLen = mine && mine.alive ? score(mine) : 0;
      st.score(s.sc, mine && mine.alive ? `Length ${myLen.toLocaleString('en-AU')} · first to ${TO}` : `First to ${TO}`);
    },
  });
  let last = { x: 0, y: 0 };
  const send = () => ses.setInput(ses.me, { a: stickAng ?? keyAng, b: boosting ? 1 : 0 });

  // joystick wherever you touch, and a boost button
  const stickEl = document.createElement('div'); stickEl.className = 'lg-stick ss-stick'; stickEl.innerHTML = '<i></i>';
  const boostBtn = document.createElement('button'); boostBtn.className = 'ss-boost'; boostBtn.setAttribute('aria-label', 'Boost');
  boostBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>';
  st.st.append(stickEl, boostBtn);
  const knob = stickEl.firstChild;
  let sid = null, ox = 0, oy = 0;
  const unT = touches(st.cv, ctx, st.view, () => false, {
    down: (p, x, y, id) => { if (sid !== null) return; sid = id; ox = x; oy = y; stickEl.style.left = `${x}px`; stickEl.style.top = `${y}px`; knob.style.transform = ''; stickEl.classList.add('on'); },
    move: (p, x, y, id) => {
      if (id !== sid) return;
      let dx = x - ox, dy = y - oy; const len = Math.hypot(dx, dy);
      if (len > STICK) { dx *= STICK / len; dy *= STICK / len; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      if (len > 6) { stickAng = Math.round(Math.atan2(dy, dx) * 100) / 100; send(); }
    },
    up: (p, x, y, id) => { if (id === sid) { sid = null; stickEl.classList.remove('on'); } },
  });
  const bOn = (e) => { e.preventDefault(); e.stopPropagation(); boosting = true; boostBtn.classList.add('on'); try { boostBtn.setPointerCapture(e.pointerId); } catch { /* not needed */ } send(); };
  const bOff = () => { if (!boosting) return; boosting = false; boostBtn.classList.remove('on'); send(); };
  boostBtn.addEventListener('pointerdown', bOn);
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => boostBtn.addEventListener(t, bOff));
  const held = new Set(), DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const unK = keys(ctx, {
    down: (p, k) => { if (k === 'fire') { boosting = true; send(); return; } if (!DIR[k]) return; held.add(k); aim(); },
    up: (p, k) => { if (k === 'fire') { boosting = false; send(); return; } held.delete(k); aim(); },
  });
  function aim() { let x = 0, y = 0; for (const k of held) { x += DIR[k][0]; y += DIR[k][1]; } if (x || y) { keyAng = Math.atan2(y, x); stickAng = null; send(); } }

  st.banner('Slither Snacks', `Knock out ${names[1 - (ctx.local ? 0 : ctx.me)]} to win the round. First to ${TO}.`, 2600);
  return { destroy() { dead = true; ses.destroy(); unT(); unK(); st.destroy(); } };
}

const cardArt = () => `<div class="duo-art-snake"><span style="background:${COL[0]}"></span><span style="background:${COL[1]}"></span><img src="img/snake/face_f.png" alt=""><img src="img/snake/face_c.png" alt=""></div>`;

export default {
  id: 'snake', name: 'Slither Snacks', tag: 'Grow your snake, make your friend crash', realtime: true, cat: 'action', twoPhones: true,
  art: cardArt,
  help: [
    'You each have a snake in an arena full of snacks and ten computer snakes. Touch anywhere and drag to steer, and hold the lightning button to boost.',
    'Eat snacks to grow. If your head touches another snake, or the red edge, you are out.',
    'When one of you is knocked out, the other wins the round. First to 3 rounds wins.',
  ],
  create,
};
