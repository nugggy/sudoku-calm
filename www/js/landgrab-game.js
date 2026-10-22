// Land Grab: glide around a big field, loop out from your land and back again to claim everything inside the loop.
// Cross your own trail and you are out. Cross someone else's trail and they are out, and their land becomes yours.
// Nine computer players play by the same rules and come back after they are knocked out.
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, esc, dialog } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet, levelHome } from './kit.js';
import { cbOn, symbolFor, symbolSvg, drawSymbol } from './cb.js';
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
// light and dark looks for the field, what lies outside it, and the water and rocks inside some maps
const FIELD = [
  { field: '#f3f5f9', outside: '#cfd6e1', water: '#8fd0f2', rock: '#9aa1ad', rockLip: '#6f7682', grid: 'rgba(40,60,100,.06)', edge: '#e9483f' },
  { field: '#1f232c', outside: '#14161c', water: '#1d4f6e', rock: '#4a505c', rockLip: '#30353f', grid: 'rgba(255,255,255,.04)', edge: '#ff6b6b' },
];
const BOTS = 9;
const VIEW = 34;       // about this many cells across the shorter side of the screen
const SIM = 1 / 60;    // the game moves on in steps of this many seconds
const STICK = 46;      // how far the joystick knob can travel, in pixels

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
    extra: () => `<div class="section-title">Map</div><div class="lg-maps">${MAPS.map((m) => `<button class="lg-map ${m.id === map().id ? 'on' : ''}" data-extra="map:${m.id}"><img src="${mapThumb(m)}" alt=""><span>${m.name}</span>${lg.bests[m.id] ? `<small>${lg.bests[m.id].toFixed(1)}%</small>` : ''}</button>`).join('')}</div>
      <div class="section-title">Your animal</div><div class="lg-skins">${SKINS.map((s) => `<button class="lg-skin ${s === lg.skin ? 'on' : ''}" data-extra="skin:${s}" aria-label="${NAMES[s]}">${tile(s)}</button>`).join('')}</div>
      ${lg.played ? `<div class="lg-stats"><span><b>${lg.played}</b>games</span><span><b>${lg.best.toFixed(1)}%</b>best land</span><span><b>${lg.kills}</b>most knock-outs</span></div>` : ''}`,
    onExtra(v) {
      const [k, id] = v.split(':');
      if (k === 'map') lg.map = id; else lg.skin = id;
      save(); sfx.tap(); screen.refresh();
    },
  });
  return screen;
}


// ---------- Smooth outlines ----------
// Land is kept as cells, but drawn as smooth shapes: trace the outline between cells that are in and cells that
// are out (marching squares), then round it off (Chaikin's corner cutting). Returns a Path2D in cell units.
const MS = [null, [3, 2], [2, 1], [3, 1], [0, 1], [[0, 1], [3, 2]], [0, 2], [0, 3], [0, 3], [0, 2], [[0, 3], [2, 1]], [0, 1], [3, 1], [2, 1], [3, 2], null];
function outline(isIn, box = { x0: 0, y0: 0, x1: N - 1, y1: N - 1 }) {
  const val = (x, y) => (x >= 0 && y >= 0 && x < N && y < N && isIn(y * N + x) ? 1 : 0);
  const adj = new Map();
  // edge midpoints sit on half cells, so twice their position is a whole number (offset by 4 to stay positive at the edge)
  const key = (x2, y2) => (x2 + 4) * 1024 + (y2 + 4);
  const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (let y = Math.max(-1, box.y0 - 1); y <= Math.min(N - 1, box.y1 + 1); y++) {
    for (let x = Math.max(-1, box.x0 - 1); x <= Math.min(N - 1, box.x1 + 1); x++) {
      const c = val(x, y) * 8 + val(x + 1, y) * 4 + val(x + 1, y + 1) * 2 + val(x, y + 1);
      const m = MS[c];
      if (!m) continue;
      // the four edge midpoints of this square of cell centres: top, right, bottom, left (doubled)
      const mid = [key(2 * x + 2, 2 * y + 1), key(2 * x + 3, 2 * y + 2), key(2 * x + 2, 2 * y + 3), key(2 * x + 1, 2 * y + 2)];
      for (const pair of Array.isArray(m[0]) ? m : [m]) link(mid[pair[0]], mid[pair[1]]);
    }
  }
  const path = new Path2D(), seen = new Set();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    let loop = [], prev = -1, cur = start;
    while (!seen.has(cur)) {
      seen.add(cur); loop.push([((cur >> 10) - 4) / 2, ((cur & 1023) - 4) / 2]);
      const nb = adj.get(cur), next = nb[0] !== prev ? nb[0] : nb[1];
      prev = cur; cur = next;
      if (cur === undefined) break;
    }
    if (loop.length < 3) continue;
    // ease out the staircase the cells leave: each point moves to the average of its neighbours, a few times over
    for (let it = 0; it < 3 && loop.length > 6; it++) {
      const n = loop.length;
      loop = loop.map((_, i) => {
        let sx = 0, sy = 0;
        for (let d = -2; d <= 2; d++) { const p = loop[(i + d + n) % n]; sx += p[0]; sy += p[1]; }
        return [sx / 5, sy / 5];
      });
    }
    for (let it = 0; it < 2; it++) { // round the corners off
      const out = [];
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      loop = out;
    }
    path.moveTo(loop[0][0], loop[0][1]);
    for (let i = 1; i < loop.length; i++) path.lineTo(loop[i][0], loop[i][1]);
    path.closePath();
  }
  return path;
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
  let landPaths = [], field = { path: null, holes: null, dark: null };
  const imgs = {};
  for (const s of SKINS) { const im = new Image(); im.src = `${ART}${s}.png`; imgs[s] = im; }

  function newGame() {
    w = createWorld(Math.random, mapById(lg.map));
    q('title').textContent = `Land Grab · ${w.map.name}`;
    const others = SKINS.filter((s) => s !== lg.skin);
    me = addPlayer(w, { name: 'You', skin: lg.skin, colour: COLOURS[0], human: true });
    for (let i = 0; i < BOTS; i++) addPlayer(w, { name: NAMES[others[i]], skin: others[i], colour: COLOURS[i + 1] });
    brains = w.players.map((p, i) => (p.human ? null : makeBrain(w.rng, 0.2 + ((i * 37) % 9) / 10)));
    wait = w.players.map(() => 0);
    spawn(w, me);
    for (const p of w.players) if (!p.human) spawn(w, p);
    // the field's shape and any lake or rocks inside it, as smooth outlines
    const holes = holesOf(w.open);
    field = { path: outline((i) => w.open[i] === 1), holes: w.map.hole ? outline((i) => holes[i] === 1) : null, dark: null };
    landPaths = w.players.map(() => null);
    parts = []; acc = 0; state = 'play';
    q('tip').classList.remove('gone');
    setTimeout(() => q('tip')?.classList.add('gone'), 3000);
    hud(true);
  }

  // rebuild the outline of any player whose land changed
  function refreshLand() {
    for (const id of w.changed) { const p = w.players[id - 1]; landPaths[id - 1] = p.cells ? outline((i) => w.owner[i] === id, p.box) : null; }
    w.changed.clear();
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
  const dark = () => document.documentElement.dataset.theme === 'dark';

  function draw() {
    if (!cw) fit();
    refreshLand();
    const cs = Math.max(12, Math.min(cw, ch) / VIEW); // pixels per cell
    const ox = cw / 2 - me.x * cs, oy = ch / 2 - me.y * cs;
    const d = dark(), F = FIELD[d ? 1 : 0];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = F.outside; ctx.fillRect(0, 0, cw, ch);
    // everything else is drawn in cell units
    ctx.setTransform(dpr * cs, 0, 0, dpr * cs, dpr * ox, dpr * oy);
    const px = 1 / cs; // one screen pixel
    ctx.fillStyle = F.field; ctx.fill(field.path, 'evenodd');
    // a faint grid every four cells on the part that is showing
    const c0 = Math.max(0, Math.floor(-ox / cs / 4) * 4), c1 = Math.min(N, (cw - ox) / cs), r0 = Math.max(0, Math.floor(-oy / cs / 4) * 4), r1 = Math.min(N, (ch - oy) / cs);
    ctx.save(); ctx.clip(field.path, 'evenodd');
    ctx.strokeStyle = F.grid; ctx.lineWidth = px; ctx.beginPath();
    for (let x = c0; x <= c1; x += 4) { ctx.moveTo(x, r0); ctx.lineTo(x, r1); }
    for (let y = r0; y <= r1; y += 4) { ctx.moveTo(c0, y); ctx.lineTo(c1, y); }
    ctx.stroke(); ctx.restore();
    // water or rocks inside the field (rocks stand up a little)
    if (field.holes) {
      if (w.map.hole === 'rock') { ctx.save(); ctx.translate(0, 0.3); ctx.fillStyle = F.rockLip; ctx.fill(field.holes, 'evenodd'); ctx.restore(); }
      ctx.fillStyle = F[w.map.hole]; ctx.fill(field.holes, 'evenodd');
    }
    ctx.strokeStyle = F.edge; ctx.lineWidth = Math.max(2 * px, 0.14); ctx.lineJoin = 'round'; ctx.stroke(field.path);
    // land: a darker edge nudged down, then the land on top
    w.players.forEach((p, i) => { const path = landPaths[i]; if (!path) return; ctx.save(); ctx.translate(0, 0.28); ctx.fillStyle = p.colour[1]; ctx.fill(path, 'evenodd'); ctx.restore(); });
    w.players.forEach((p, i) => { const path = landPaths[i]; if (!path) return; ctx.fillStyle = p.colour[0]; ctx.fill(path, 'evenodd'); });
    // colourblind mode: each player's symbol repeats faintly across their land, so whose land is whose does not rest on colour
    if (cbOn()) {
      for (let y = Math.floor(r0); y < r1; y += 3) for (let x = Math.floor(c0) + (y % 2) * 2; x < c1; x += 4) {
        const id = w.owner[y * N + x];
        if (id) drawSymbol(ctx, symbolFor(id - 1), x + 0.5, y + 0.5, 0.45, 'rgba(255,255,255,.7)', null);
      }
    }
    // trails: a soft band from where the player left home to their head
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const p of w.players) {
      if (!p.alive || !p.path.length) continue;
      ctx.strokeStyle = p.colour[0]; ctx.globalAlpha = 0.55; ctx.lineWidth = 0.95;
      ctx.beginPath(); ctx.moveTo(p.path[0][0], p.path[0][1]);
      for (let k = 1; k < p.path.length; k++) ctx.lineTo(p.path[k][0], p.path[k][1]);
      ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // players: their animal on a block of their colour, with their name above
    for (const p of w.players) {
      if (!p.alive) continue;
      const s = 1.7, x = p.x - s / 2, y = p.y - s / 2;
      if ((x + s) * cs + ox < -40 || x * cs + ox > cw + 40 || (y + s) * cs + oy < -40 || y * cs + oy > ch + 40) continue;
      ctx.fillStyle = p.colour[1]; ctx.beginPath(); ctx.roundRect(x, y + 0.22, s, s, 0.32); ctx.fill();
      ctx.fillStyle = p.colour[0]; ctx.beginPath(); ctx.roundRect(x, y, s, s, 0.32); ctx.fill();
      const im = imgs[p.skin];
      if (im.complete && im.naturalWidth) { const iw = s * 0.86, ih = iw * (im.naturalHeight / im.naturalWidth); ctx.drawImage(im, p.x - iw / 2, p.y - ih / 2 + 0.03, iw, ih); }
      ctx.font = `700 ${Math.max(11, cs * 0.55) / cs}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3 * px; ctx.strokeStyle = 'rgba(20,24,36,.65)'; ctx.strokeText(p.name, p.x, y - 0.15);
      ctx.fillStyle = '#fff'; ctx.fillText(p.name, p.x, y - 0.15);
    }
    for (const b of parts) { ctx.globalAlpha = Math.max(0, b.life / 0.7); ctx.fillStyle = b.c; ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2); }
    ctx.globalAlpha = 1;
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
