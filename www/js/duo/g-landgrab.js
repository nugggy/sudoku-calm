// Land Grab for two phones: both players and eight computer animals share one field. Steer with a joystick
// wherever you touch. After two and a half minutes, whoever holds more of the field wins. Knocked out? You are
// back in three seconds with a fresh patch. The host phone runs the field (landgrab-engine.js) on its map and
// speed; the guest sends its stick and draws what the host sends.
import { stage, session, touches, keys, play, vib } from './rtd-kit.js';
import { N, createWorld, addPlayer, spawn, step, steer, think, makeBrain, pct, mapById, maskOf } from '../landgrab-engine.js';
import { createDrawer } from '../landgrab-draw.js';
import { store } from '../store.js';

const MATCH = 150;       // seconds in a match
const BOTS = 8, STICK = 46, SIM = 1 / 60;
const PACE = { relaxed: 0.72, normal: 1, fast: 1.35 };
const SKINS = ['pig', 'panda', 'parrot', 'penguin', 'rabbit', 'monkey', 'giraffe', 'hippo', 'elephant', 'snake'];
const BOT_NAMES = { panda: 'Panda', parrot: 'Parrot', penguin: 'Penguin', rabbit: 'Rabbit', monkey: 'Monkey', giraffe: 'Giraffe', hippo: 'Hippo', elephant: 'Elephant' };
// the two players in Play Together's orange and blue, then the animals
const COLOURS = [['#ff8a3d', '#c25412'], ['#2fb8ff', '#0f7fbf'], ['#ffb526', '#c98400'], ['#4cc76a', '#2f9449'], ['#9a6cf2', '#6f45c2'],
  ['#ff5d8f', '#c63c69'], ['#21c4b5', '#14897e'], ['#f2d92c', '#b9a10e'], ['#e9483f', '#ad2b24'], ['#5a7cf5', '#3a55c1']];

// ---------- rules (host) ----------
export function lgInit(names = ['Player 1', 'Player 2'], mapId = 'classic', pace = 1, rng = Math.random) {
  const w = createWorld(rng, mapById(mapId), pace);
  w.dirty = [];
  const skins = ['pig', 'snake', ...Object.keys(BOT_NAMES)];
  skins.forEach((sk, i) => addPlayer(w, { name: i < 2 ? names[i] : BOT_NAMES[sk], skin: sk, colour: COLOURS[i] }));
  w.players.forEach((p) => spawn(w, p));
  const meta = { map: mapId, players: w.players.map((p) => [p.name, p.skin, p.colour]) };
  return { w, meta, brains: w.players.map((p, i) => (i < 2 ? null : makeBrain(rng, 0.25 + (i % 4) * 0.18))), wait: w.players.map(() => 0), t: 0, ph: 'play', n: 0, winner: null, think: 0 };
}
export function lgStep(s, inputs, ev) {
  const w = s.w;
  if (s.ph !== 'play') return;
  s.t += SIM;
  const thinkNow = (s.think -= SIM) <= 0;
  if (thinkNow) s.think = 0.1;
  w.players.forEach((p, i) => {
    if (i < 2) {
      if (p.alive) { const a = inputs[i]?.a; if (typeof a === 'number') steer(p, a); }
      else if ((s.wait[i] += SIM) > 3 && spawn(w, p)) { s.wait[i] = 0; ev({ k: 'back', p: i }); }
      return;
    }
    if (!thinkNow) return;
    if (p.alive) think(w, p, s.brains[i]);
    else if ((s.wait[i] += 0.1) > 3 && spawn(w, p)) { s.wait[i] = 0; s.brains[i] = makeBrain(w.rng, s.brains[i].level); }
  });
  step(w, SIM);
  for (const e of w.events) {
    if (e.k === 'die' && e.p <= 2) ev({ k: 'out', p: e.p - 1, by: e.by ? w.players[e.by - 1].name : '' });
    else if (e.k === 'die' && e.by && e.by <= 2) ev({ k: 'ko', p: e.by - 1 });
    else if (e.k === 'claim' && e.p <= 2) ev({ k: 'claim', p: e.p - 1 });
  }
  w.events = [];
  if (s.t >= MATCH) {
    const a = w.players[0].cells, b = w.players[1].cells;
    s.ph = 'end'; s.winner = a === b ? null : a > b ? 0 : 1;
  }
}
const r1 = (v) => Math.round(v * 10) / 10;
// the whole owner grid as runs of [owner, count], for the first snapshot and every few seconds after
const runs = (o) => { const out = []; let cur = o[0], n = 0; for (let i = 0; i < o.length; i++) { if (o[i] === cur) n++; else { out.push(cur, n); cur = o[i]; n = 1; } } out.push(cur, n); return out; };
export function lgSnap(s) {
  const w = s.w, full = s.n++ % 90 === 0;
  const d = {
    t: Math.round(s.t * 10) / 10, ph: s.ph,
    p: w.players.map((p) => [p.alive ? 1 : 0, r1(p.x), r1(p.y), p.cells, p.alive ? p.path.filter((_, k) => k % 3 === 0).flatMap((q) => [r1(q[0]), r1(q[1])]) : []]),
  };
  if (full) { d.m = s.meta; d.all = runs(w.owner); } else d.c = w.dirty;
  w.dirty = [];
  return d;
}
// guest: a world-like object the drawer understands
export function lgApply(gs, d) {
  if (!gs && !d.m) return gs; // wait for the first full snapshot
  if (!gs || d.m && d.m.map !== gs.meta.map) {
    const map = mapById(d.m.map), open = maskOf(map);
    let area = 0; for (let i = 0; i < N * N; i++) area += open[i];
    gs = { meta: d.m, w: { map, open, area, owner: new Uint8Array(N * N), changed: new Set(), players: d.m.players.map(([name, skin, colour], i) => ({ id: i + 1, name, skin, colour, alive: false, x: 0, y: 0, path: [], cells: 0, area, box: { x0: 0, y0: 0, x1: N - 1, y1: N - 1 } })) }, fresh: true };
  }
  const w = gs.w;
  if (d.all) { let i = 0; for (let k = 0; k < d.all.length; k += 2) { w.owner.fill(d.all[k], i, i + d.all[k + 1]); i += d.all[k + 1]; } w.players.forEach((p) => w.changed.add(p.id)); }
  if (d.c) for (let k = 0; k < d.c.length; k += 2) { const was = w.owner[d.c[k]]; w.owner[d.c[k]] = d.c[k + 1]; if (was) w.changed.add(was); if (d.c[k + 1]) w.changed.add(d.c[k + 1]); }
  d.p.forEach(([alive, x, y, cells, path], i) => {
    const p = w.players[i]; p.alive = !!alive; p.x = x; p.y = y; p.cells = cells;
    p.path = []; for (let k = 0; k + 1 < path.length; k += 2) p.path.push([path[k], path[k + 1]]);
  });
  gs.t = d.t; gs.ph = d.ph;
  return gs;
}

// ---------- screen ----------
function create(ctx) {
  const st = stage(ctx, 'landgrab-duo');
  const names = ctx.names || ['Player 1', 'Player 2'];
  const lgs = store.landgrab || {};
  const drawer = createDrawer();
  let drawnWorld = null, stickAng = null, keyAng = null, last = { x: N / 2, y: N / 2 };
  const ses = session(ctx, {
    init: () => lgInit(names, lgs.map || 'classic', PACE[lgs.speed] || 1, ctx.rng),
    input: () => ({ a: null }),
    step: lgStep,
    snap: lgSnap,
    apply: lgApply,
    result: (s) => (s.ph === 'end' ? { winner: s.winner, text: endText(s) } : null),
  }, {
    event(e) {
      const mine = e.p === ses?.me;
      if (e.k === 'out') { st.banner(mine ? 'You are out' : `${names[e.p]} is out`, e.by ? `${e.by} crossed the trail. Back in 3 seconds.` : 'Crossed their own trail. Back in 3 seconds.', 1800); play(ctx, mine ? 'error' : 'unit'); vib(ctx, mine ? [60, 40, 60] : 20); }
      else if (e.k === 'ko' && mine) { play(ctx, 'unit'); vib(ctx, 25); }
      else if (e.k === 'claim' && mine) { play(ctx, 'place'); vib(ctx, 10); }
      else if (e.k === 'back' && mine) st.banner('Back in', 'A fresh patch of land', 1100);
    },
    draw(s, host) {
      const w = host ? s?.w : s?.w;
      if (!w) return;
      if (drawnWorld !== w) { drawer.reset(w); drawnWorld = w; }
      const mine = w.players[ses.me];
      if (mine.alive) last = { x: mine.x, y: mine.y };
      drawer.draw(st.g, st.view, w, last);
      const sc = [pct(w.players[0]), pct(w.players[1])].map((v) => `${v.toFixed(1)}%`);
      const left = Math.max(0, Math.ceil(MATCH - (s.t || 0))), clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      st.score(sc, `${clock} left`);
    },
  });
  function endText(s) {
    const a = pct(s.w.players[0]), b = pct(s.w.players[1]);
    if (s.winner === null) return `A draw, ${a.toFixed(1)}% each`;
    return `${names[s.winner]} wins with ${Math.max(a, b).toFixed(1)}% of the field to ${Math.min(a, b).toFixed(1)}%`;
  }
  const send = () => ses.setInput(ses.me, { a: stickAng ?? keyAng });

  // a joystick wherever you touch
  const stickEl = document.createElement('div'); stickEl.className = 'lg-stick'; stickEl.innerHTML = '<i></i>';
  st.st.append(stickEl);
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
  const held = new Set(), DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const unK = keys(ctx, {
    down: (p, k) => { if (!DIR[k]) return; held.add(k); aim(); },
    up: (p, k) => { held.delete(k); aim(); },
  });
  function aim() { let x = 0, y = 0; for (const k of held) { x += DIR[k][0]; y += DIR[k][1]; } if (x || y) { keyAng = Math.atan2(y, x); stickAng = null; send(); } }

  st.banner('Land Grab', `Most land after ${MATCH / 60 | 0}½ minutes wins. Touch and drag to steer.`, 2800);
  return { destroy() { ses.destroy(); unT(); unK(); st.destroy(); } };
}

const cardArt = () => `<div class="duo-art-lg"><i class="a"></i><i class="b"></i><img src="img/kenney/animals-square/pig.png" alt=""><img src="img/kenney/animals-square/snake.png" alt=""></div>`;

export default {
  id: 'landgrab', name: 'Land Grab', tag: 'Loop out and claim more land than your friend', realtime: true, cat: 'action', twoPhones: true,
  art: cardArt,
  help: [
    'You each start with a small patch of land, sharing the field with eight computer animals. Touch anywhere and drag to steer.',
    'Leave your land and you draw a trail. Get home and everything inside the loop is yours. Cut off part of someone\'s land and that piece is yours too.',
    'Cross a trail and its owner is out and you take all their land. Cross your own and you are out. Either way you are back in three seconds.',
    'The game lasts two and a half minutes. Whoever holds more of the field at the end wins. The map and speed are the host\'s Land Grab settings.',
  ],
  create,
};
