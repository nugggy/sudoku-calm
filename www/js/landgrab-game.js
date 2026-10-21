// Land Grab: move around a big field, loop out from your land and back again to claim everything inside the loop.
// Touch the edge or your own trail and you are out. Cross someone else's trail and they are out.
// Nine computer players play by the same rules and come back after they are knocked out.
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, esc, dialog } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet, levelHome } from './kit.js';
import { cbOn, symbolFor, symbolSvg, drawSymbol } from './cb.js';
import { N, TICK, DIRS, MAPS, mapById, maskOf, holesOf, createWorld, addPlayer, spawn, step, steer, think, makeBrain, pct } from './landgrab-engine.js';

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
  { field: '#f3f5f9', outside: '#cfd6e1', water: '#8fd0f2', rock: '#9aa1ad', rockLip: '#6f7682' },
  { field: '#1f232c', outside: '#14161c', water: '#1d4f6e', rock: '#4a505c', rockLip: '#30353f' },
];
const BOTS = 9;
const VIEW = 26; // about this many cells across the shorter side of the screen

export const landgrabHelp = (onClose) => helpSheet('How to play Land Grab', [
  'Swipe to steer. On a computer, use the arrow keys or W, A, S and D. You never stop moving, and you cannot turn straight back.',
  'Leave your land and you draw a trail behind you. Get back to your land and the trail, and everything inside the loop, becomes yours.',
  'You are out if you touch the edge of the field or cross your own trail.',
  'Cross someone else\'s trail and they are out. They can do the same to you, so do not stay away from home for too long.',
  'Your score is how much of the field you own. Take all of a player\'s land and they are out too.',
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
      <div class="lg-tip" data-el="tip">Swipe to steer</div>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const stage = q('stage'), canvas = $('canvas', stage), ctx = canvas.getContext('2d');
  let w, me, brains, wait, alive = true, raf = 0, last = 0, acc = 0, state = 'play', turns = [], parts = [], boardAt = 0;
  // the land is drawn into a tiny image, one pixel per cell, and scaled up without smoothing so the edges stay sharp
  const land = document.createElement('canvas'), lip = document.createElement('canvas');
  land.width = lip.width = N; land.height = lip.height = N;
  const landCtx = land.getContext('2d'), lipCtx = lip.getContext('2d');
  const landImg = landCtx.createImageData(N, N), lipImg = lipCtx.createImageData(N, N);
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  let pal = [], palLip = [];
  const imgs = {};
  for (const s of SKINS) { const im = new Image(); im.src = `${ART}${s}.png`; imgs[s] = im; }

  function newGame() {
    w = createWorld(Math.random, mapById(lg.map));
    paintField(dark());
    q('title').textContent = `Land Grab · ${w.map.name}`;
    const others = SKINS.filter((s) => s !== lg.skin);
    me = addPlayer(w, { name: 'You', skin: lg.skin, colour: COLOURS[0], human: true });
    for (let i = 0; i < BOTS; i++) addPlayer(w, { name: NAMES[others[i]], skin: others[i], colour: COLOURS[i + 1] });
    pal = w.players.map((p) => rgb(p.colour[0])); palLip = w.players.map((p) => rgb(p.colour[1]));
    brains = w.players.map((p, i) => (p.human ? null : makeBrain(w.rng, 0.2 + ((i * 37) % 9) / 10)));
    wait = w.players.map(() => 0);
    spawn(w, me);
    for (const p of w.players) if (!p.human) spawn(w, p);
    turns = []; parts = []; acc = 0; state = 'play';
    q('tip').classList.remove('gone');
    setTimeout(() => q('tip')?.classList.add('gone'), 2600);
    paintLand(); hud(true);
  }

  // The map: a cover image for every cell that is not field (outside, water or rock), the darker edge under rocks,
  // and the outline drawn along every side where field meets non-field.
  const field = { cover: document.createElement('canvas'), lip: document.createElement('canvas'), edge: null, dark: null };
  field.cover.width = field.lip.width = N; field.cover.height = field.lip.height = N;
  function paintField(d) {
    field.dark = d;
    const cols = FIELD[d ? 1 : 0], o = w.open, hole = w.map.hole;
    const cover = field.cover.getContext('2d'), lipC = field.lip.getContext('2d');
    const ci = cover.createImageData(N, N), li = lipC.createImageData(N, N);
    const outside = rgb(cols.outside), inner = rgb(hole ? cols[hole] : cols.outside), innerLip = rgb(hole === 'rock' ? cols.rockLip : cols[hole] || cols.outside);
    const holes = holesOf(o);
    for (let i = 0; i < N * N; i++) {
      if (o[i]) continue;
      const c = holes[i] ? inner : outside, k = i * 4;
      ci.data[k] = c[0]; ci.data[k + 1] = c[1]; ci.data[k + 2] = c[2]; ci.data[k + 3] = 255;
      if (holes[i] && hole === 'rock') { li.data[k] = innerLip[0]; li.data[k + 1] = innerLip[1]; li.data[k + 2] = innerLip[2]; li.data[k + 3] = 255; }
    }
    cover.putImageData(ci, 0, 0); lipC.putImageData(li, 0, 0);
    const edge = new Path2D();
    const isOpen = (x, y) => x >= 0 && y >= 0 && x < N && y < N && o[y * N + x];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!o[y * N + x]) continue;
      if (!isOpen(x, y - 1)) { edge.moveTo(x, y); edge.lineTo(x + 1, y); }
      if (!isOpen(x, y + 1)) { edge.moveTo(x, y + 1); edge.lineTo(x + 1, y + 1); }
      if (!isOpen(x - 1, y)) { edge.moveTo(x, y); edge.lineTo(x, y + 1); }
      if (!isOpen(x + 1, y)) { edge.moveTo(x + 1, y); edge.lineTo(x + 1, y + 1); }
    }
    field.edge = edge;
  }

  function paintLand() {
    const a = landImg.data, b = lipImg.data, o = w.owner;
    for (let i = 0; i < N * N; i++) {
      const id = o[i], k = i * 4;
      if (!id) { a[k + 3] = 0; b[k + 3] = 0; continue; }
      const c = pal[id - 1], d = palLip[id - 1];
      a[k] = c[0]; a[k + 1] = c[1]; a[k + 2] = c[2]; a[k + 3] = 255;
      b[k] = d[0]; b[k + 1] = d[1]; b[k + 2] = d[2]; b[k + 3] = 255;
    }
    landCtx.putImageData(landImg, 0, 0); lipCtx.putImageData(lipImg, 0, 0);
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

  // ----- the game clock -----
  function tick() {
    if (turns.length) steer(me, turns.shift());
    w.players.forEach((p, i) => {
      if (p.human) return;
      if (p.alive) think(w, p, brains[i]);
      else if (++wait[i] > 3 / TICK && spawn(w, p)) { wait[i] = 0; brains[i] = makeBrain(w.rng, brains[i].level); }
    });
    step(w);
    let landChanged = false;
    for (const e of w.events) {
      const p = w.players[e.p - 1];
      if (e.k === 'claim') { landChanged = true; if (p.human) { sfx.place(); buzz(10); } }
      else if (e.k === 'die') {
        landChanged = true;
        burst(p);
        if (e.by === me.id) { sfx.unit(); buzz(30); }
        if (p.human) { const by = e.by ? w.players[e.by - 1] : null; gameOver(by); }
      }
    }
    w.events = [];
    if (landChanged) paintLand();
    hud(false);
    if (me.alive && pct(me) >= 99.5) gameOver(null, true);
  }

  function burst(p) {
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2, s = 3 + (k % 4) * 1.5;
      parts.push({ x: p.x + 0.5, y: p.y + 0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.7, c: p.colour[0], r: 0.18 + (k % 3) * 0.06 });
    }
  }

  async function gameOver(by, won = false) {
    if (state !== 'play') return;
    state = 'over';
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
    const how = won ? 'The whole field is yours.'
      : by ? `${esc(by.name)} crossed your trail.`
      : !inField(me) ? 'You ran into the edge of the field.'
      : !w.open[me.y * N + me.x] ? (w.map.hole === 'water' ? 'You fell in the lake.' : w.map.hole === 'rock' ? 'You ran into a rock.' : 'You ran into the edge of the field.')
      : 'You crossed your own trail.';
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
  const inField = (p) => p.x >= 0 && p.y >= 0 && p.x < N && p.y < N;

  // ----- input: swipes anywhere on the field, or the keyboard -----
  let swipe = null;
  const turn = (d) => {
    if (state !== 'play') return;
    const lastDir = turns.length ? turns[turns.length - 1] : (me.want >= 0 ? me.want : me.dir);
    if (d === lastDir || (d + 2) % 4 === lastDir) return;
    if (turns.length < 2) turns.push(d);
    q('tip').classList.add('gone');
  };
  stage.addEventListener('pointerdown', (e) => { swipe = { x: e.clientX, y: e.clientY, id: e.pointerId }; try { stage.setPointerCapture(e.pointerId); } catch { /* not needed */ } });
  stage.addEventListener('pointermove', (e) => {
    if (!swipe || swipe.id !== e.pointerId) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
    swipe.x = e.clientX; swipe.y = e.clientY; // keep going: one finger can steer several times
  });
  ['pointerup', 'pointercancel'].forEach((t) => stage.addEventListener(t, () => { swipe = null; }));
  const KEYS = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
  const onKey = (e) => { const d = KEYS[e.code]; if (d === undefined) return; e.preventDefault(); if (!e.repeat) turn(d); };
  window.addEventListener('keydown', onKey);

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

  function draw(t) {
    if (!cw) fit();
    const cs = Math.max(14, Math.min(cw, ch) / VIEW); // pixels per cell
    const lerp = (p) => [p.px + (p.x - p.px) * t, p.py + (p.y - p.py) * t];
    const [mx, my] = me.alive || state === 'play' ? lerp(me) : [me.x, me.y];
    const ox = cw / 2 - (mx + 0.5) * cs, oy = ch / 2 - (my + 0.5) * cs;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const d = dark();
    if (d !== field.dark) paintField(d);
    ctx.fillStyle = FIELD[d ? 1 : 0].outside; ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = FIELD[d ? 1 : 0].field;
    ctx.fillRect(ox, oy, N * cs, N * cs);
    // faint grid on the part that is showing
    const c0 = Math.max(0, Math.floor(-ox / cs)), c1 = Math.min(N, Math.ceil((cw - ox) / cs)), r0 = Math.max(0, Math.floor(-oy / cs)), r1 = Math.min(N, Math.ceil((ch - oy) / cs));
    ctx.strokeStyle = d ? 'rgba(255,255,255,.04)' : 'rgba(40,60,100,.06)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = c0; x <= c1; x++) { const sx = Math.round(ox + x * cs) + 0.5; ctx.moveTo(sx, oy + r0 * cs); ctx.lineTo(sx, oy + r1 * cs); }
    for (let y = r0; y <= r1; y++) { const sy = Math.round(oy + y * cs) + 0.5; ctx.moveTo(ox + c0 * cs, sy); ctx.lineTo(ox + c1 * cs, sy); }
    ctx.stroke();
    // the map's shape: cover everything that is not field, then outline the edge
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(field.lip, ox, oy + cs * 0.22, N * cs, N * cs);
    ctx.drawImage(field.cover, ox, oy, N * cs, N * cs);
    ctx.save(); ctx.translate(ox, oy); ctx.scale(cs, cs);
    ctx.strokeStyle = d ? '#ff6b6b' : '#e9483f'; ctx.lineWidth = Math.max(2, cs * 0.12) / cs; ctx.lineJoin = 'round';
    ctx.stroke(field.edge);
    ctx.restore();
    // land: the darker edge first, nudged down, then the land on top
    ctx.drawImage(lip, ox, oy + cs * 0.22, N * cs, N * cs);
    ctx.drawImage(land, ox, oy, N * cs, N * cs);
    // colourblind mode: each player's symbol repeats faintly across their land, so whose land is whose does not rest on colour
    if (cbOn()) {
      for (let y = r0; y < r1; y++) for (let x = c0; x < c1; x++) {
        if ((x + 2 * y) % 5) continue;
        const id = w.owner[y * N + x];
        if (id) drawSymbol(ctx, symbolFor(id - 1), ox + (x + 0.5) * cs, oy + (y + 0.5) * cs, cs * 0.34, 'rgba(255,255,255,.7)', null);
      }
    }
    // trails, see-through, and stretched to the moving head
    for (const p of w.players) {
      if (!p.alive || !p.trail.length) continue;
      ctx.fillStyle = p.colour[0]; ctx.globalAlpha = 0.5;
      for (let k = 0; k < p.trail.length - 1; k++) { const i = p.trail[k]; ctx.fillRect(ox + (i % N) * cs, oy + ((i / N) | 0) * cs, cs, cs); }
      const [hx, hy] = lerp(p), lx = p.px, ly = p.py;
      const x0 = Math.min(lx, hx), y0 = Math.min(ly, hy);
      if (p.trail.length > 1 || w.owner[ly * N + lx] !== p.id) ctx.fillRect(ox + x0 * cs, oy + y0 * cs, (Math.abs(hx - lx) + 1) * cs, (Math.abs(hy - ly) + 1) * cs);
      ctx.globalAlpha = 1;
    }
    // players
    for (const p of w.players) {
      if (!p.alive) continue;
      const [x, y] = lerp(p), s = cs * 1.3, px = ox + (x + 0.5) * cs - s / 2, py = oy + (y + 0.5) * cs - s / 2;
      if (px < -s * 2 || py < -s * 2 || px > cw + s || py > ch + s) continue;
      ctx.fillStyle = p.colour[1];
      roundRect(px, py + s * 0.12, s, s, s * 0.18); ctx.fill();
      ctx.fillStyle = p.colour[0];
      roundRect(px, py, s, s, s * 0.18); ctx.fill();
      const im = imgs[p.skin];
      if (im.complete && im.naturalWidth) { const iw = s * 0.86, ih = iw * (im.naturalHeight / im.naturalWidth); ctx.drawImage(im, px + (s - iw) / 2, py + (s - ih) / 2 + s * 0.02, iw, ih); }
      ctx.font = `700 ${Math.round(Math.max(11, cs * 0.5))}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,24,36,.65)'; ctx.strokeText(p.name, px + s / 2, py - 3);
      ctx.fillStyle = '#fff'; ctx.fillText(p.name, px + s / 2, py - 3);
    }
    for (const q2 of parts) { ctx.globalAlpha = Math.max(0, q2.life / 0.7); ctx.fillStyle = q2.c; ctx.fillRect(ox + (q2.x - q2.r) * cs, oy + (q2.y - q2.r) * cs, q2.r * 2 * cs, q2.r * 2 * cs); }
    ctx.globalAlpha = 1;
  }
  function roundRect(x, y, wd, ht, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, wd, ht, r) : ctx.rect(x, y, wd, ht); }

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (state === 'play') {
      acc += dt;
      let n = 0;
      while (acc >= TICK && n < 4 && state === 'play') { acc -= TICK; tick(); n++; }
      if (n === 4) acc = 0;
    }
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; p.life -= dt; }
    parts = parts.filter((p) => p.life > 0);
    draw(state === 'play' ? Math.min(1, acc / TICK) : 1);
  }

  // stop while the app is hidden or help is open
  const pause = () => { if (state === 'play') state = 'paused'; };
  const resume = () => { if (state === 'paused' && alive) { state = 'play'; last = 0; } };
  const onVis = () => (document.hidden ? pause() : resume());
  document.addEventListener('visibilitychange', onVis);
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') { pause(); landgrabHelp(resume); }
  });

  newGame();
  if (!lg.seenHelp) { lg.seenHelp = true; save(); pause(); setTimeout(() => landgrabHelp(resume), 300); }
  raf = requestAnimationFrame(frame);
  return {
    root,
    destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis); save(true); },
  };
}
