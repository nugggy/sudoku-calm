// Treat Twist: a match-3 saga. Swap neighbouring candies to make lines, make special treats and clear each level's goal.
// The rules live in treat-engine.js; this file draws the map and the board and animates what the engine reports.
// Candy art is Melissa Krautheim's CC0 "Candy Match 3" set (see tools/treat/art.txt), cut and tinted by tools/treat/build-art.mjs.
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, sheet, toast, confetti, esc } from './ui.js';
import { sfx, buzz } from './sound.js';
import * as E from './treat-engine.js';

const T = () => store.treat;
const WORLD = 15;
const WORLDS = [
  { name: 'Lollipop Meadow', filter: 'none', tint: '#ff7ab6', field: ['#ffc4e0', '#ffe6f2'] },
  { name: 'Gumdrop Hills', filter: 'hue-rotate(35deg) saturate(1.1)', tint: '#ff9b4a', field: ['#ffd09e', '#fff0dc'] },
  { name: 'Minty Glade', filter: 'hue-rotate(115deg) saturate(.9)', tint: '#2fbf9a', field: ['#a6f0dc', '#e2fbf3'] },
  { name: 'Toffee Sunset', filter: 'sepia(.45) saturate(1.5) hue-rotate(-15deg)', tint: '#e8893a', field: ['#ffc98a', '#ffe8cc'] },
  { name: 'Berry Twilight', filter: 'hue-rotate(250deg) saturate(1.1) brightness(.9)', tint: '#9a5cf0', field: ['#d2b8ff', '#efe4ff'] },
  { name: 'Caramel Canyon', filter: 'sepia(.7) saturate(1.8) hue-rotate(-25deg) brightness(.95)', tint: '#d2762b', field: ['#e8b88a', '#f7e3c8'] },
  { name: 'Midnight Fudge', filter: 'brightness(.55) saturate(1.3) hue-rotate(195deg)', tint: '#5d6bff', field: ['#5a5fb8', '#8f86d6'] },
  { name: 'Rainbow Peaks', filter: 'saturate(1.6) contrast(1.05)', tint: '#ff4fa3', field: ['#a9dcff', '#e3f3ff'] },
];
const worldOf = (i) => WORLDS[Math.floor(i / WORLD) % WORLDS.length];
const CANDY_NAMES = ['golden beans', 'blue drops', 'cherry trios', 'green gobstoppers', 'grape gems', 'pink stars'];
const BOOSTERS = [
  { id: 'hammer', name: 'Lollipop hammer', tip: 'Smash any one candy or blocker' },
  { id: 'swap', name: 'Free swap', tip: 'Swap any two neighbours, even without a match' },
  { id: 'shuffle', name: 'Shuffle', tip: 'Mix up the candies' },
  { id: 'moves', name: '+5 moves', tip: 'Five more moves' },
];
const boosters = () => { const b = T().boosters || (T().boosters = { hammer: 2, swap: 2, shuffle: 2, moves: 1 }); return b; };

// ---------- pictures ----------
const IMG = {};
function img(name) { if (!IMG[name]) { const im = new Image(); im.src = `img/treat/${name}.webp`; IMG[name] = im; } return IMG[name]; }
const ready = (im) => im.complete && im.naturalWidth > 0;
function itemImg(kind, c, s) {
  if (kind === E.BOMB) return 'bomb';
  if (kind === E.ING) return `ing${c}`;
  if (s === E.STRIPE_H) return `c${c}_h`;
  if (s === E.STRIPE_V) return `c${c}_v`;
  if (s === E.WRAPPED || s === E.PRIMED) return `c${c}_w`;
  return `c${c}`;
}
const candyTag = (c, cls = '') => `<img class="${cls}" src="img/treat/c${c}.webp" alt="">`;
['c0', 'c1', 'c2', 'c3', 'c4', 'c5'].forEach(img);

// ---------- levels ----------
let LEVELS = null;
async function loadLevels() {
  if (!LEVELS) { try { LEVELS = (await (await fetch('levels/treat.json')).json()).levels; } catch { LEVELS = []; } }
  return LEVELS;
}
export function levelCount() { return LEVELS ? LEVELS.length : 120; }

// ---------- sound ----------
// Little synthesised pops, chimes and a sung "voice" for the combo words.
let actx = null;
function ac() {
  if (!store.settings.sound) return null;
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(f, dur, { type = 'sine', vol = 0.1, delay = 0, slide = null } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.03);
}
function noise(dur, { vol = 0.15, delay = 0, freq = 1200, q = 1 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay, n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = b; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
  s.connect(f).connect(g).connect(c.destination); s.start(t);
}
// A sung word: a buzzy note through two moving vowel filters, which reads as a cheerful voice.
function voice(notes, vowels) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime, o = c.createOscillator(), g = c.createGain(), f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), mix = c.createGain();
  o.type = 'sawtooth'; f1.type = 'bandpass'; f2.type = 'bandpass'; f1.Q.value = 9; f2.Q.value = 12;
  const V = { a: [800, 1200], e: [500, 1900], i: [330, 2300], o: [500, 900], u: [330, 800] };
  let t = t0;
  notes.forEach(([freq, dur], k) => {
    const v = V[vowels[k % vowels.length]];
    o.frequency.setTargetAtTime(freq, t, 0.02); f1.frequency.setTargetAtTime(v[0], t, 0.03); f2.frequency.setTargetAtTime(v[1], t, 0.03);
    t += dur;
  });
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.32, t0 + 0.04); g.gain.setValueAtTime(0.32, t - 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  mix.gain.value = 0.6;
  o.connect(f1).connect(g); o.connect(f2).connect(mix).connect(g); g.connect(c.destination);
  o.start(t0); o.stop(t + 0.1);
}
const snd = {
  swap() { tone(520, 0.08, { type: 'triangle', vol: 0.06, slide: 700 }); },
  nope() { tone(220, 0.12, { type: 'triangle', vol: 0.07, slide: 160 }); tone(200, 0.12, { type: 'triangle', vol: 0.06, delay: 0.12, slide: 150 }); },
  pop(cascade) { const f = 600 * Math.pow(1.122, Math.min(10, cascade)); tone(f, 0.09, { vol: 0.09, slide: f * 1.5 }); noise(0.05, { vol: 0.05, freq: 3000 }); },
  special() { [880, 1175, 1568].forEach((f, k) => tone(f, 0.16, { vol: 0.06, type: 'triangle', delay: k * 0.05 })); },
  line() { noise(0.35, { vol: 0.16, freq: 1800, q: 0.7 }); tone(1400, 0.3, { vol: 0.05, slide: 300 }); },
  blast() { noise(0.4, { vol: 0.25, freq: 400, q: 0.6 }); tone(140, 0.35, { vol: 0.14, slide: 50 }); },
  bomb() { for (let k = 0; k < 6; k++) tone(900 + k * 220, 0.12, { vol: 0.05, type: 'square', delay: k * 0.045 }); noise(0.5, { vol: 0.12, freq: 2500, delay: 0.25 }); },
  crack() { noise(0.12, { vol: 0.18, freq: 900, q: 2 }); },
  drop() { tone(300, 0.06, { vol: 0.03, type: 'triangle', slide: 240 }); },
  coin() { tone(1320, 0.07, { vol: 0.05, type: 'square' }); tone(1760, 0.12, { vol: 0.05, type: 'square', delay: 0.06 }); },
  word(k) {
    const w = [[[523, 0.16], [659, 0.3]], [[587, 0.14], [784, 0.34]], [[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.3]], [[659, 0.1], [784, 0.1], [988, 0.1], [1175, 0.1], [1319, 0.34]]][Math.min(3, k)];
    voice(w, ['e', 'i', 'a', 'o', 'u']);
  },
};

// ---------- help ----------
export function treatHelp() {
  sheet(`<h2>How to play Treat Twist</h2><div class="help-body tt-help">
    <p>Swipe a candy into its neighbour to swap them. Line up three or more of the same candy and they pop.</p>
    <p><b>Four in a row</b> makes a ${candyTag(1, 'tt-inline')} striped treat that clears a whole row or column. <b>An L or T shape</b> makes a ${'<img class="tt-inline" src="img/treat/c2_w.webp" alt="">'} wrapped treat that bursts twice. <b>Five in a row</b> makes a ${'<img class="tt-inline" src="img/treat/bomb.webp" alt="">'} rainbow bomb that clears every candy of the colour you swap it with.</p>
    <p>Swap two special treats together for huge effects: two striped treats clear a cross, striped and wrapped clear three rows and three columns, and two rainbow bombs clear the whole board.</p>
    <p>Each level has a goal: reach a score, clear the ${'<img class="tt-inline" src="img/treat/jelly.webp" alt="">'} jelly, collect candies, crunch the ${'<img class="tt-inline" src="img/treat/frost2.webp" alt="">'} biscuits, stop the ${'<img class="tt-inline" src="img/treat/choc.webp" alt="">'} chocolate (it grows when you leave it alone), break ${'<img class="tt-inline" src="img/treat/lock.webp" alt="">'} liquorice locks, or bring the ${'<img class="tt-inline" src="img/treat/ing0.webp" alt="">'} sweets down to the bottom.</p>
    <p>Moves left over start a <b>Treat Party</b>: each one becomes a striped treat for bonus points.</p>
    <p>Boosters are earned as you play. There are no lives, no waiting and no ads.</p>
  </div><button class="btn tt-btn" data-x>Let's play</button>`, { onMount: (n, close) => { $('[data-x]', n).onclick = close; } });
}

function goalSummary(lv) {
  const g = lv.goal, parts = [];
  if (g.score) parts.push(`Score ${g.score.toLocaleString('en-AU')}`);
  if (g.jelly) parts.push('Clear the jelly');
  if (g.frost) parts.push('Crunch the biscuits');
  if (g.choc) parts.push('Clear the chocolate');
  if (g.ing) parts.push(`Bring down ${g.ing} sweet${g.ing > 1 ? 's' : ''}`);
  if (g.collect) parts.push('Collect ' + Object.entries(g.collect).map(([c, n]) => `${n} ${CANDY_NAMES[c]}`).join(' and '));
  return parts.join(', ');
}
function goalIcons(lv) {
  const g = lv.goal, out = [];
  if (g.score) out.push({ key: 'score', html: '<img src="img/art/ui/star.svg" alt="">', need: g.score });
  if (g.jelly) out.push({ key: 'jelly', html: '<img src="img/treat/jelly.webp" alt="">' });
  if (g.frost) out.push({ key: 'frost', html: '<img src="img/treat/frost2.webp" alt="">' });
  if (g.choc) out.push({ key: 'choc', html: '<img src="img/treat/choc.webp" alt="">' });
  if (g.ing) out.push({ key: 'ing', html: '<img src="img/treat/ing0.webp" alt="">', need: g.ing });
  if (g.collect) for (const [c, n] of Object.entries(g.collect)) out.push({ key: `c${c}`, html: candyTag(c), need: n });
  return out;
}

// ---------- card art ----------
export function treatCardArt() {
  return `<div class="art-treat2">${[0, 5, 2, 3, 'bomb', 1, 4, '2_h', 0].map((k) => `<img src="img/treat/${typeof k === 'number' ? `c${k}` : k === 'bomb' ? 'bomb' : `c${k}`}.webp" alt="">`).join('')}</div>`;
}

// ---------- map ----------
export function treatHomeScreen(app) {
  const root = el(`<section class="screen tt-theme tt-mapscreen">
    <header class="topbar tt-topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">Treat Twist</div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="tt-mapbar"><span class="tt-pill" data-el="stars"></span><span class="tt-pill tt-boost-pill" data-el="boost"></span></div>
    <div class="tt-map scroll" data-el="map"></div>
    <div class="tt-playbar"><button class="btn tt-btn tt-play" data-act="play"></button></div></section>`);
  const map = $('[data-el="map"]', root);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const NODE_GAP = 86;
  async function render() {
    await loadLevels();
    const t = T(), count = LEVELS.length, cur = Math.min(t.level, count - 1);
    const shown = Math.min(count, Math.max(WORLD * 2, (Math.floor(cur / WORLD) + 2) * WORLD));
    const total = Object.values(t.stars).reduce((a, b) => a + b, 0);
    q('stars').innerHTML = `<img src="img/art/ui/star.svg" alt=""> ${total}`;
    const b = boosters();
    q('boost').innerHTML = `<img src="img/treat/lollipop.webp" alt=""> ${b.hammer + b.swap + b.shuffle + b.moves} boosters`;
    $('[data-act="play"]', root).innerHTML = t.level >= count ? `Play level ${count} again<small>Every level finished</small>` : `Play level ${cur + 1}<small>${esc(goalSummary(LEVELS[cur]))}</small>`;
    // worlds stack from the bottom up, like a road climbing a candy mountain
    let html = '';
    for (let wi = Math.ceil(shown / WORLD) - 1; wi >= 0; wi--) {
      const W = WORLDS[wi % WORLDS.length], first = wi * WORLD, last = Math.min(shown, first + WORLD);
      const nodes = [];
      for (let i = first; i < last; i++) {
        const k = i - first, y = (WORLD - 1 - k) * NODE_GAP + 300, x = 50 + Math.sin(k * 0.9 + wi) * 30;
        nodes.push({ i, x, y });
      }
      const h = WORLD * NODE_GAP + 330;
      const path = nodes.map((p, k) => `${k ? 'L' : 'M'}${p.x * 3.6},${p.y}`).join(' ');
      // candy decorations scattered beside the road
      let deco = '';
      const dr = (k) => { const v = Math.sin((wi * 97 + k) * 12.9898) * 43758.5453; return v - Math.floor(v); };
      for (let k = 0; k < 9; k++) {
        const y = 330 + dr(k) * (h - 400), p = nodes.reduce((a, n) => (Math.abs(n.y - y) < Math.abs(a.y - y) ? n : a), nodes[0]);
        const side = p.x > 50 ? 0.04 + dr(k + 50) * 0.2 : 0.76 + dr(k + 50) * 0.2, size = 34 + dr(k + 9) * 34;
        const name = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'bomb', 'ing0', 'c2_w'][Math.floor(dr(k + 20) * 9)];
        deco += `<img class="tt-deco" src="img/treat/${name}.webp" alt="" style="left:${(side * 100).toFixed(1)}%;top:${y.toFixed(0)}px;width:${size.toFixed(0)}px;transform:rotate(${((dr(k + 30) - 0.5) * 50).toFixed(0)}deg)">`;
      }
      html += `<div class="tt-world" style="height:${h}px;--tint:${W.tint};--field-a:${W.field[0]};--field-b:${W.field[1]}">
        <div class="tt-world-bg" style="filter:${W.filter}"></div>${deco}
        <svg class="tt-road" viewBox="0 0 360 ${h}" preserveAspectRatio="none"><path d="${path}" class="tt-road-a"/><path d="${path}" class="tt-road-b"/></svg>
        <div class="tt-world-name">${esc(W.name)}<small>Levels ${first + 1} to ${first + WORLD}</small></div>
        ${nodes.map(({ i, x, y }) => {
          const s = t.stars[i] || 0, done = i < t.level, current = i === cur && t.level < count, locked = i > t.level;
          return `<button class="tt-node ${done ? 'done' : ''} ${current ? 'current' : ''} ${locked ? 'locked' : ''}" data-lv="${i}" style="left:${x}%;top:${y}px" ${locked ? 'disabled' : ''}>
            <b>${i + 1}</b>${done ? `<span class="tt-nstars">${[0, 1, 2].map((k) => `<i class="${k < s ? 'on' : ''}"></i>`).join('')}</span>` : ''}
            ${current ? `<img class="tt-marker" src="img/treat/c5.webp" alt="">` : ''}</button>`;
        }).join('')}</div>`;
    }
    if (shown < count) html = `<div class="tt-more">More worlds to discover</div>` + html;
    map.innerHTML = html;
    requestAnimationFrame(() => { const c = $('.tt-node.current', map) || $('.tt-node.done', map); if (c) c.scrollIntoView({ block: 'center' }); else map.scrollTop = map.scrollHeight; });
  }
  function open(i) {
    const lv = LEVELS[i], s = T().stars[i] || 0;
    sheet(`<div class="tt-start"><div class="tt-start-ribbon">Level ${i + 1}</div>
      <div class="tt-start-stars">${[0, 1, 2].map((k) => `<i class="${k < s ? 'on' : ''}"></i>`).join('')}</div>
      <div class="tt-start-goals">${goalIcons(lv).map((g) => `<div class="tt-sg">${g.html}<b>${g.key === 'score' ? g.need.toLocaleString('en-AU') : g.need ? g.need : ''}</b></div>`).join('')}</div>
      <p>${esc(goalSummary(lv))} in ${lv.moves} moves.</p>
      <button class="btn tt-btn" data-go>Play</button></div>`, {
      onMount(n, close) { $('[data-go]', n).onclick = () => { close(); app.go('treatgame', { level: i }); }; },
    });
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return treatHelp();
    if (a === 'play') return open(Math.min(T().level, LEVELS.length - 1));
    const n = e.target.closest('[data-lv]');
    if (n) { sfx.tap(); open(+n.dataset.lv); }
  });
  render();
  if (!T().seenHelp) { T().seenHelp = true; save(); setTimeout(treatHelp, 400); }
  return { root, refresh: render };
}

// ---------- tweening ----------
const ease = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  fall: (t) => (t < 0.82 ? Math.pow(t / 0.82, 2) : 1 - Math.sin(((t - 0.82) / 0.18) * Math.PI) * 0.06),
};

// ---------- game ----------
export function treatGameScreen(app, { level }) {
  const root = el(`<section class="screen tt-theme tt-game">
    <div class="tt-gamebg" style="filter:${worldOf(level).filter}"></div>
    <header class="topbar tt-topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">Level ${level + 1}</div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="tt-hud">
      <div class="tt-moves"><b data-el="moves">0</b><span>moves</span></div>
      <div class="tt-goals" data-el="goals"></div>
      <div class="tt-scorebox"><b data-el="score">0</b><div class="tt-bar"><i data-el="bar"></i><s data-el="m1"></s><s data-el="m2"></s><s data-el="m3"></s></div></div>
    </div>
    <div class="tt-boardwrap" data-el="wrap"><canvas class="tt-canvas" data-el="cv"></canvas><div class="tt-callout" data-el="callout"></div></div>
    <div class="tt-boosters" data-el="boosters"></div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const wrap = q('wrap'), cv = q('cv'), ctx = cv.getContext('2d');
  let lv = null, st = null, alive = true, busy = true, over = false, cs = 40, dpr = 1, ox = 0, oy = 0;
  let sprites = new Map(); // id -> {x, y, sc, a, rot, kind, c, s, dx, dy}
  let pops = [], parts = [], beams = [], floats = [], rings = [], bolts = [];
  let chocTold = false, hintCells = null, hintTimer = 0, armed = null, sel = -1, shakeT = 0, shakeMag = 0, lastFrame = 0, idleT = 0;
  const burst = img('burst'), tileImgs = ['jelly', 'jellytop', 'frost1', 'frost2', 'frost3', 'choc', 'lock', 'ing0', 'ing1', 'bomb'];
  tileImgs.forEach(img);

  // ----- layout -----
  function layout() {
    if (!st) return;
    const r = wrap.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return; // not laid out yet; the resize observer calls again
    dpr = Math.min(3, window.devicePixelRatio || 1);
    cs = Math.floor(Math.min((r.width - 16) / st.w, (r.height - 16) / st.h, 64));
    const W = cs * st.w, H = cs * st.h;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
  }

  // ----- sprites follow the engine state -----
  function sync() {
    const next = new Map();
    for (let i = 0; i < st.n; i++) {
      if (!st.cell[i] || st.kind[i] === E.NONE) continue;
      const id = st.id[i], x = i % st.w, y = Math.floor(i / st.w);
      const sp = sprites.get(id) || { sc: 1, a: 1, rot: 0 };
      Object.assign(sp, { x, y, kind: st.kind[i], c: st.c[i], s: st.s[i] });
      next.set(id, sp);
    }
    sprites = next;
  }
  const cellXY = (i) => [i % st.w, Math.floor(i / st.w)];

  // ----- drawing -----
  const dark = () => document.documentElement.dataset.theme === 'dark';
  function drawImg(name, x, y, size, alpha = 1, sc = 1, rot = 0) {
    const im = img(name); if (!ready(im)) return;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate((x + 0.5) * cs, (y + 0.5) * cs); if (rot) ctx.rotate(rot); ctx.scale(sc, sc);
    ctx.drawImage(im, -size * cs / 2, -size * cs / 2, size * cs, size * cs); ctx.restore();
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function draw(now) {
    if (cs < 8) return;
    const t = now / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (shakeT > 0) { const m = shakeMag * shakeT; ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m); }
    // tile backing
    for (let i = 0; i < st.n; i++) {
      if (!st.cell[i]) continue;
      const [x, y] = cellXY(i);
      ctx.fillStyle = dark() ? ((x + y) % 2 ? 'rgba(40,22,70,.62)' : 'rgba(55,30,90,.62)') : ((x + y) % 2 ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.38)');
      roundRect(x * cs + 1, y * cs + 1, cs - 2, cs - 2, cs * 0.16); ctx.fill();
      if (st.jelly[i]) { drawImg('jelly', x, y, 1.0, st.jelly[i] > 1 ? 0.95 : 0.55); if (st.jelly[i] > 1) drawImg('jellytop', x, y, 1.0, 0.85); }
    }
    // hint shimmer
    const hintOn = hintCells && !busy;
    // candies
    for (const [id, sp] of sprites) {
      let sc = sp.sc, extra = 0;
      const i = Math.round(sp.y) * st.w + Math.round(sp.x);
      if (hintOn && hintCells.includes(i)) { sc *= 1 + 0.08 * Math.sin(t * 9); extra = 1; }
      if (sel === i && !busy) sc *= 1.12;
      if (sp.s === E.PRIMED) sc *= 1 + 0.07 * Math.sin(t * 14);
      if (sp.kind === E.BOMB) sp.rot = t * 0.9;
      drawImg(itemImg(sp.kind, sp.c, sp.s), sp.x, sp.y, 0.9, sp.a, sc, sp.rot);
      if (extra) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; drawImg(itemImg(sp.kind, sp.c, sp.s), sp.x, sp.y, 0.9, 0.25 + 0.2 * Math.sin(t * 9), sc); ctx.restore(); }
    }
    // blockers and locks on top
    for (let i = 0; i < st.n; i++) {
      if (!st.cell[i]) continue;
      const [x, y] = cellXY(i);
      if (st.frost[i]) drawImg(`frost${st.frost[i]}`, x, y, 0.98);
      if (st.choc[i]) drawImg('choc', x, y, 0.98);
      if (st.lock[i]) drawImg('lock', x, y, 0.95, 0.95);
      if (st.exit[i]) {
        ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(90,20,60,.6)'; ctx.shadowBlur = 3; ctx.beginPath();
        const cx = (x + 0.5) * cs, by = (y + 1) * cs - 3; ctx.moveTo(cx - cs * 0.15, by - cs * 0.15); ctx.lineTo(cx + cs * 0.15, by - cs * 0.15); ctx.lineTo(cx, by); ctx.closePath(); ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
    // popping candies
    for (const p of pops) drawImg(p.name, p.x, p.y, 0.9, Math.max(0, 1 - p.t), p.t < 0.35 ? 1 + p.t * 0.6 : Math.max(0, 1.2 * (1 - (p.t - 0.35) / 0.65)));
    // beams from striped treats
    for (const b of beams) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const a = Math.sin(Math.min(1, b.t) * Math.PI), wdt = cs * (0.4 + 0.7 * a);
      const g = b.dir === 'row' ? ctx.createLinearGradient(0, (b.y + 0.5) * cs - wdt / 2, 0, (b.y + 0.5) * cs + wdt / 2) : ctx.createLinearGradient((b.x + 0.5) * cs - wdt / 2, 0, (b.x + 0.5) * cs + wdt / 2, 0);
      g.addColorStop(0, 'rgba(255,120,200,0)'); g.addColorStop(0.3, `rgba(255,140,210,${0.55 * a})`); g.addColorStop(0.5, `rgba(255,255,255,${a})`); g.addColorStop(0.7, `rgba(255,140,210,${0.55 * a})`); g.addColorStop(1, 'rgba(255,120,200,0)');
      ctx.fillStyle = g;
      if (b.dir === 'row') ctx.fillRect(0, (b.y + 0.5) * cs - wdt / 2, st.w * cs, wdt); else ctx.fillRect((b.x + 0.5) * cs - wdt / 2, 0, wdt, st.h * cs);
      ctx.restore();
    }
    // rings from wrapped treats
    for (const r of rings) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,240,200,${1 - r.t})`; ctx.lineWidth = cs * 0.25 * (1 - r.t);
      ctx.beginPath(); ctx.arc((r.x + 0.5) * cs, (r.y + 0.5) * cs, cs * (0.4 + r.size * r.t), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    // lightning from rainbow bombs
    for (const b of bolts) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,255,255,${1 - b.t})`; ctx.lineWidth = 2.5; ctx.shadowColor = '#ff6ad5'; ctx.shadowBlur = 10;
      for (const [tx, ty] of b.to) {
        ctx.beginPath(); ctx.moveTo((b.x + 0.5) * cs, (b.y + 0.5) * cs);
        const steps = 5;
        for (let k = 1; k <= steps; k++) { const f = k / steps, jx = k < steps ? (Math.random() - 0.5) * cs * 0.4 : 0, jy = k < steps ? (Math.random() - 0.5) * cs * 0.4 : 0; ctx.lineTo((b.x + (tx - b.x) * f + 0.5) * cs + jx, (b.y + (ty - b.y) * f + 0.5) * cs + jy); }
        ctx.stroke();
      }
      ctx.restore();
    }
    // bursts and sparkles
    for (const p of parts) {
      if (p.type === 'burst') {
        if (!ready(burst)) continue;
        const f = Math.min(7, Math.floor(p.t * 8)), fx = (f % 4) * 140, fy = Math.floor(f / 4) * 140, size = cs * 1.5;
        ctx.save(); ctx.filter = `hue-rotate(${p.hue}deg) saturate(1.3)`; ctx.globalAlpha = 0.95;
        ctx.drawImage(burst, fx, fy, 140, 140, (p.x + 0.5) * cs - size / 2, (p.y + 0.5) * cs - size / 2, size, size); ctx.restore();
      } else {
        ctx.save(); ctx.globalAlpha = Math.max(0, 1 - p.t); ctx.fillStyle = p.col;
        ctx.translate(p.x * cs, p.y * cs); ctx.rotate(p.t * 6);
        const r = cs * p.r; ctx.beginPath();
        for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4, rr = k % 2 ? r * 0.4 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }
    // floating scores
    for (const f of floats) {
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - Math.max(0, f.t - 0.6) / 0.4);
      ctx.font = `900 ${Math.round(cs * 0.42)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(80,20,60,.85)'; const y = (f.y + 0.5 - f.t * 0.6) * cs;
      ctx.strokeText(f.text, (f.x + 0.5) * cs, y); ctx.fillStyle = f.col; ctx.fillText(f.text, (f.x + 0.5) * cs, y); ctx.restore();
    }
  }
  function frame(now) {
    if (!alive) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000); lastFrame = now;
    for (const list of [pops, parts, beams, floats, rings, bolts]) {
      for (const p of list) { p.t += dt / (p.dur || 0.4); if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 6 * dt; } }
      for (let k = list.length - 1; k >= 0; k--) if (list[k].t >= 1) list.splice(k, 1);
    }
    shakeT = Math.max(0, shakeT - dt * 2.5);
    if (!busy && !over) { idleT += dt; if (idleT > 5 && !hintCells) { const m = E.findMoves(st, 1)[0]; if (m) hintCells = m; } }
    if (st) draw(now);
  }
  function tween(ms, fn) {
    return new Promise((resolve) => {
      const t0 = performance.now(); let done = false;
      const finish = () => { if (done) return; done = true; fn(1); resolve(); };
      const stepF = (now) => { if (done || !alive) return finish(); const k = Math.min(1, (now - t0) / ms); fn(k); if (k < 1) requestAnimationFrame(stepF); else finish(); };
      requestAnimationFrame(stepF); setTimeout(finish, ms + 500);
    });
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const HUE = [-30, 160, -60, 60, 230, 0]; // the pink burst turned to each candy colour
  const COL = ['#ffc02e', '#3fa9ff', '#ff4d4d', '#38d158', '#b05cff', '#ff5cb8'];
  function sparkle(x, y, col, n = 6) { for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 2.5; parts.push({ type: 'spark', x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, r: 0.08 + Math.random() * 0.07, col, t: 0, dur: 0.6 + Math.random() * 0.3 }); } }
  function shake(mag) { shakeT = 1; shakeMag = mag; }
  function callout(text, k = 0) {
    const c = q('callout'); c.textContent = text; c.className = 'tt-callout'; void c.offsetWidth; c.className = `tt-callout show w${Math.min(3, k)}`;
    snd.word(k);
  }

  // ----- HUD -----
  function hud(bump = null) {
    q('moves').textContent = st.moves;
    q('moves').parentElement.classList.toggle('low', st.moves <= 5 && !over);
    q('score').textContent = st.score.toLocaleString('en-AU');
    const top = lv.stars[2] * 1.08;
    q('bar').style.width = Math.min(100, (st.score / top) * 100) + '%';
    lv.stars.forEach((s, k) => { const m = q(`m${k + 1}`); m.style.left = Math.min(98, (s / top) * 100) + '%'; m.classList.toggle('on', st.score >= s); });
    const status = E.goalStatus(st), icons = goalIcons(lv);
    q('goals').innerHTML = icons.map((g) => {
      const s = status.find((x) => (g.key.startsWith('c') && x.type === 'collect' ? `c${x.c}` === g.key : x.type === g.key));
      if (!s) return '';
      let txt = '';
      if (g.key === 'score') txt = s.done ? '' : (s.need - s.have).toLocaleString('en-AU');
      else if (s.left !== undefined) txt = s.done ? '' : s.left;
      return `<div class="tt-goal ${s.done ? 'done' : ''} ${bump === g.key ? 'bump' : ''}" data-goal="${g.key}">${g.html}<b>${txt}</b>${s.done ? '<i class="tt-tick"></i>' : ''}</div>`;
    }).join('');
  }
  function renderBoosters() {
    const b = boosters();
    q('boosters').innerHTML = BOOSTERS.map((x) => `<button class="tt-booster ${armed === x.id ? 'armed' : ''} ${b[x.id] ? '' : 'empty'}" data-boost="${x.id}" aria-label="${x.name}">
      <span class="tt-bicon tt-b-${x.id}">${x.id === 'hammer' ? '<img src="img/treat/lollipop.webp" alt="">' : x.id === 'swap' ? '<svg viewBox="0 0 24 24"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>' : x.id === 'shuffle' ? icon.refresh : '<b>+5</b>'}</span>
      <i>${b[x.id]}</i></button>`).join('');
  }
  // fly a little candy from the board to its goal
  function flyToGoal(c, i) {
    const g = $(`[data-goal="c${c}"]`, root); if (!g) return;
    const [x, y] = cellXY(i), r = cv.getBoundingClientRect(), gr = g.getBoundingClientRect();
    const n = el(`<img class="tt-fly" src="img/treat/c${c}.webp" alt="" style="left:${r.left + (x + 0.5) * cs}px;top:${r.top + (y + 0.5) * cs}px;width:${cs * 0.8}px;height:${cs * 0.8}px">`);
    document.body.appendChild(n);
    requestAnimationFrame(() => { n.style.transform = `translate(${gr.left + gr.width / 2 - (r.left + (x + 0.5) * cs)}px, ${gr.top + gr.height / 2 - (r.top + (y + 0.5) * cs)}px) scale(.5)`; n.style.opacity = '.4'; });
    setTimeout(() => n.remove(), 650);
  }

  // ----- playing out engine phases -----
  async function playPhase(ev) {
    if (ev.phase === 'clear') {
      let lineFx = false, blastFx = false, bombFx = false;
      for (const f of ev.fired) {
        const [x, y] = cellXY(f.i);
        if (f.type === 'row' || f.type === 'cross') beams.push({ dir: 'row', x, y, t: 0, dur: 0.45 });
        if (f.type === 'col' || f.type === 'cross') beams.push({ dir: 'col', x, y, t: 0, dur: 0.45 });
        if (f.type === 'bigcross') for (let d = -1; d <= 1; d++) { beams.push({ dir: 'row', x, y: y + d, t: 0, dur: 0.5 }); beams.push({ dir: 'col', x: x + d, y, t: 0, dur: 0.5 }); }
        if (f.type === 'row' || f.type === 'col' || f.type === 'cross' || f.type === 'bigcross') lineFx = true;
        if (f.type === 'blast') { rings.push({ x, y, size: f.cells.length > 12 ? 2.4 : 1.4, t: 0, dur: 0.45 }); blastFx = true; }
        if (f.type === 'colour' || f.type === 'all') { bolts.push({ x, y, to: f.cells.slice(0, 40).map(cellXY), t: 0, dur: 0.55 }); bombFx = true; }
      }
      if (bombFx) { snd.bomb(); buzz([30, 40, 30]); shake(10); await wait(380); }
      if (lineFx) { snd.line(); buzz(25); shake(5); }
      if (blastFx) { snd.blast(); buzz(35); shake(8); }
      if (ev.combo) callout({ cross: 'Crisscross!', bigcross: 'Mega cross!', bigblast: 'Kaboom!', bomb: 'Rainbow!', bombstripe: 'Stripe storm!', bombwrap: 'Big bang!', bombbomb: 'Sugar quake!' }[ev.combo] || 'Wow!', 3);
      // pops
      for (const c of ev.cleared) {
        const [x, y] = cellXY(c.i), sp = c.id && sprites.get(c.id);
        pops.push({ name: itemImg(c.k, c.c, c.s), x, y, t: 0, dur: 0.28 });
        if (sp) sprites.delete(c.id);
        if (c.c >= 0 && c.k === E.CANDY) parts.push({ type: 'burst', x, y, hue: HUE[c.c], t: 0, dur: 0.45 });
        if (c.k === E.CANDY && lv.goal.collect && lv.goal.collect[c.c] !== undefined) flyToGoal(c.c, c.i);
      }
      for (const h of ev.hits) {
        const [x, y] = cellXY(h.i);
        if (h.type === 'frost' || h.type === 'choc') { sparkle(x, y, h.type === 'choc' ? '#7a4a2a' : '#e8c48a', 8); snd.crack(); }
        if (h.type === 'lock') sparkle(x, y, '#3a2228', 8);
        if (h.type === 'jelly') sparkle(x, y, '#ff8fd0', 5);
      }
      for (const g of ev.groups) {
        const cx = g.cells.reduce((a, i) => a + (i % st.w), 0) / g.cells.length, cy = g.cells.reduce((a, i) => a + Math.floor(i / st.w), 0) / g.cells.length;
        floats.push({ text: String(g.pts), x: cx, y: cy, col: COL[g.c] || '#fff', t: 0, dur: 0.9 });
      }
      if (ev.cleared.length) snd.pop(ev.cascade);
      if (ev.created.length) { snd.special(); buzz(20); }
      // after the treats fire, the cascade words
      if (!ev.combo && ev.cascade >= 1 && ev.groups.length) {
        const k = ev.cascade;
        if (k === 2) callout('Sweet!', 0); else if (k === 3) callout('Yum!', 1); else if (k === 4) callout('Delightful!', 2); else if (k >= 5) { callout('Sugar rush!', 3); shake(6); }
      }
      if (ev.converted) for (const c of ev.converted) { const [x, y] = cellXY(c.i); sparkle(x, y, '#fff', 4); }
      await wait(ev.fired.length ? 260 : 170);
      sync();
      for (const c of ev.created) { const sp = sprites.get(c.id); if (sp) { sp.sc = 0.2; tween(320, (k) => { sp.sc = 0.2 + 0.8 * ease.back(k); }); } }
      hud(ev.collected.length ? `c${ev.collected[0]}` : null);
      await wait(ev.created.length ? 160 : 60);
    } else if (ev.phase === 'fall') {
      // start each candy where it was (new ones stack above the column) and let them drop with a little bounce
      const starts = new Map(), stackAbove = new Map();
      for (const m of ev.moves) starts.set(m.id, cellXY(m.from));
      for (const s of ev.spawned) {
        const x = s.i % st.w, k = (stackAbove.get(x) || 0) + 1; stackAbove.set(x, k);
        starts.set(s.id, [x, Math.floor(s.i / st.w) - k]);
      }
      for (const g of ev.ing) { const [x, y] = cellXY(g.i); pops.push({ name: `ing${g.c}`, x, y, t: 0, dur: 0.5 }); snd.coin(); sparkle(x, y, '#ffd84a', 10); }
      sync();
      const moving = [];
      for (const [id, sp] of sprites) {
        const s = starts.get(id); if (!s) continue;
        const from = { x: s[0], y: s[1] }, to = { x: sp.x, y: sp.y }, dist = Math.hypot(to.x - from.x, to.y - from.y);
        sp.x = from.x; sp.y = from.y;
        moving.push({ sp, from, to, dist });
      }
      if (moving.length) {
        const longest = Math.max(...moving.map((m) => m.dist));
        await tween(140 + longest * 55, (k) => {
          for (const m of moving) {
            const kk = Math.min(1, k * (longest / Math.max(0.6, m.dist)) ** 0.35);
            const e = ease.fall(kk);
            m.sp.x = m.from.x + (m.to.x - m.from.x) * e; m.sp.y = m.from.y + (m.to.y - m.from.y) * e;
          }
        });
        snd.drop();
      }
      if (ev.ing.length) hud('ing');
    }
  }
  async function resolveMove() {
    let e;
    while (alive && (e = E.step(st))) await playPhase(e);
    if (!alive) return;
    const out = E.endMove(st);
    if (out.spread !== null) { sync(); const [x, y] = cellXY(out.spread); sparkle(x, y, '#6b3a1e', 10); if (!chocTold) { chocTold = true; toast('Break the chocolate, or it spreads after each move', 2200); } }
    if (out.shuffled) { callout('Shuffle!', 1); await shuffleAnim(); }
    sync(); hud();
  }
  async function shuffleAnim() {
    const list = [...sprites.values()];
    await tween(280, (k) => { for (const sp of list) { sp.sc = 1 - 0.7 * ease.inOut(k); sp.rot = k * 4; } });
    sync();
    const list2 = [...sprites.values()];
    await tween(320, (k) => { for (const sp of list2) { sp.sc = 0.3 + 0.7 * ease.back(k); sp.rot = (1 - k) * 4; } });
    for (const sp of list2) sp.rot = 0;
  }

  // ----- the player's moves -----
  async function attemptSwap(a, b, free = false) {
    if (busy || over) return;
    hintCells = null; idleT = 0; sel = -1;
    const pa = sprites.get(st.id[a]), pb = sprites.get(st.id[b]);
    const [ax, ay] = cellXY(a), [bx, by] = cellXY(b);
    const ok = E.trySwap(st, a, b, { free });
    busy = true;
    snd.swap();
    if (!ok) {
      await tween(130, (k) => { const e = ease.out(k) * 0.45; if (pa) { pa.x = ax + (bx - ax) * e; pa.y = ay + (by - ay) * e; } if (pb) { pb.x = bx + (ax - bx) * e; pb.y = by + (ay - by) * e; } });
      snd.nope(); buzz(15);
      await tween(200, (k) => { const e = 0.45 * (1 - ease.back(k)); if (pa) { pa.x = ax + (bx - ax) * e; pa.y = ay + (by - ay) * e; } if (pb) { pb.x = bx + (ax - bx) * e; pb.y = by + (ay - by) * e; } });
      if (pa) { pa.x = ax; pa.y = ay; } if (pb) { pb.x = bx; pb.y = by; }
      busy = false; return;
    }
    await tween(170, (k) => { const e = ease.back(k); if (pa) { pa.x = ax + (bx - ax) * e; pa.y = ay + (by - ay) * e; } if (pb) { pb.x = bx + (ax - bx) * e; pb.y = by + (ay - by) * e; } });
    hud();
    await resolveMove();
    busy = false;
    afterMove();
  }
  async function afterMove() {
    if (over || !alive) return;
    if (E.goalDone(st)) return win();
    if (st.moves <= 0) return lose();
  }

  // ----- input: swipe or tap-tap -----
  let down = null;
  const cellAt = (e) => { const r = cv.getBoundingClientRect(); const x = Math.floor((e.clientX - r.left) / cs), y = Math.floor((e.clientY - r.top) / cs); if (x < 0 || y < 0 || x >= st.w || y >= st.h) return -1; return y * st.w + x; };
  cv.addEventListener('pointerdown', (e) => {
    if (!st || busy || over) return;
    e.preventDefault(); idleT = 0; hintCells = null;
    const i = cellAt(e); if (i < 0 || !st.cell[i]) return;
    if (armed === 'hammer') { useHammer(i); return; }
    down = { i, x: e.clientX, y: e.clientY, used: false };
    try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!down || down.used) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < cs * 0.32) return;
    down.used = true;
    const x = down.i % st.w, y = Math.floor(down.i / st.w);
    let b = -1;
    if (Math.abs(dx) > Math.abs(dy)) { if (dx > 0 && x < st.w - 1) b = down.i + 1; else if (dx < 0 && x > 0) b = down.i - 1; }
    else if (dy > 0 && y < st.h - 1) b = down.i + st.w; else if (dy < 0 && y > 0) b = down.i - st.w;
    if (b >= 0 && st.cell[b]) { const free = armed === 'swap'; if (free) spendBooster('swap'); attemptSwap(down.i, b, free); }
  });
  cv.addEventListener('pointerup', () => {
    if (!down) return;
    const i = down.i, used = down.used; down = null;
    if (used) return;
    if (sel >= 0 && sel !== i && E.adjacent(st, sel, i)) { const a = sel; sel = -1; const free = armed === 'swap'; if (free) spendBooster('swap'); attemptSwap(a, i, free); return; }
    sel = sel === i ? -1 : (E.movable(st, i) ? i : -1);
    if (sel >= 0) sfx.tap();
  });

  // ----- boosters -----
  function spendBooster(id) { const b = boosters(); if (b[id] > 0) b[id]--; save(); armed = null; renderBoosters(); }
  async function useHammer(i) {
    if (!E.hammer(st, i)) { snd.nope(); return; }
    spendBooster('hammer');
    busy = true;
    const [x, y] = cellXY(i);
    pops.push({ name: 'lollipop', x, y: y - 0.6, t: 0, dur: 0.35 }); shake(5); buzz(30);
    await wait(180);
    await resolveMove();
    busy = false; afterMove();
  }
  q('boosters').addEventListener('click', async (e) => {
    const bt = e.target.closest('[data-boost]'); if (!bt || busy || over) return;
    const id = bt.dataset.boost, b = boosters();
    if (!b[id]) { toast('Earn boosters by finishing levels. You get one every few levels and for three stars.', 2600); return; }
    if (id === 'hammer' || id === 'swap') {
      armed = armed === id ? null : id; renderBoosters();
      if (armed) toast(id === 'hammer' ? 'Tap a candy or blocker to smash it' : 'Swipe any two neighbours to swap them', 1800);
      return;
    }
    if (id === 'shuffle') { spendBooster('shuffle'); busy = true; E.shuffle(st); await shuffleAnim(); busy = false; hintCells = null; return; }
    if (id === 'moves') { spendBooster('moves'); st.moves += 5; hud(); callout('+5 moves', 1); }
  });

  // ----- winning and losing -----
  async function win() {
    over = true; busy = true;
    await wait(250);
    if (st.moves > 0) {
      callout('Treat Party!', 3);
      await wait(700);
      let r;
      while (alive && (r = E.partyStep(st))) {
        sync(); hud();
        if (r.converted.length) { const c = r.converted[0]; const [x, y] = cellXY(c.i); sparkle(x, y, '#fff', 6); snd.special(); await wait(90); }
        let e; while (alive && (e = E.step(st))) await playPhase(e);
      }
    }
    if (!alive) return;
    sync(); hud();
    const t = T(), stars = E.starsFor(st, lv.stars);
    const firstTime = level >= t.level, prevStars = t.stars[level] || 0;
    if (stars > prevStars) t.stars[level] = stars;
    if (firstTime) t.level = level + 1;
    if (st.score > (t.best || 0)) t.best = st.score;
    // earn boosters: one every third level, and one for each first three-star finish
    const earned = [];
    if (firstTime && (level + 1) % 3 === 0) earned.push(BOOSTERS[(level / 3) % 4 | 0]);
    if (stars === 3 && prevStars < 3) earned.push(BOOSTERS[(level + 2) % 4]);
    earned.forEach((b) => { boosters()[b.id]++; });
    save(true);
    sfx.win(); confetti(3000);
    const last = level + 1 >= LEVELS.length;
    const node = el(`<div class="tt-result"><div class="tt-rcard">
      <div class="tt-ribbon">Level ${level + 1} complete</div>
      <div class="tt-rstars">${[0, 1, 2].map((k) => `<i></i>`).join('')}</div>
      <div class="tt-rscore">0</div>
      ${earned.length ? `<div class="tt-reward">${earned.map((b) => `<span>You earned: ${esc(b.name)}</span>`).join('')}</div>` : ''}
      <div class="tt-ractions">${last ? '' : '<button class="btn tt-btn" data-r="next">Next level</button>'}<button class="btn secondary tt-btn2" data-r="again">Play again</button><button class="btn ghost" data-r="map">Map</button></div>
    </div></div>`);
    root.appendChild(node);
    const sc = $('.tt-rscore', node), t0 = performance.now();
    (function count(now) { const f = Math.min(1, (now - t0) / 900); sc.textContent = Math.round(st.score * (1 - Math.pow(1 - f, 3))).toLocaleString('en-AU'); if (f < 1 && alive) requestAnimationFrame(count); })(t0);
    $$('.tt-rstars i', node).forEach((s, k) => { if (k < stars) setTimeout(() => { s.classList.add('on'); tone(660 + k * 220, 0.25, { type: 'triangle', vol: 0.08 }); buzz(15); }, 600 + k * 380); });
    node.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]')?.dataset.r; if (!r) return;
      node.remove();
      if (r === 'next') app.replace('treatgame', { level: level + 1 });
      else if (r === 'again') app.replace('treatgame', { level });
      else app.back();
    });
  }
  function lose() {
    over = true; busy = true;
    const b = boosters(), left = E.goalStatus(st).filter((x) => !x.done);
    const node = el(`<div class="tt-result"><div class="tt-rcard">
      <div class="tt-ribbon sad">Out of moves</div>
      <div class="tt-rgoals">${goalIcons(lv).filter((g) => left.some((x) => (g.key.startsWith('c') && x.type === 'collect' ? `c${x.c}` === g.key : x.type === g.key))).map((g) => {
        const s = left.find((x) => (g.key.startsWith('c') && x.type === 'collect' ? `c${x.c}` === g.key : x.type === g.key));
        return `<div class="tt-goal">${g.html}<b>${g.key === 'score' ? (s.need - s.have).toLocaleString('en-AU') : s.left}</b></div>`;
      }).join('')}</div>
      <p>So close. ${b.moves ? 'Use a +5 moves booster to keep going?' : 'Try again for a fresh board.'}</p>
      <div class="tt-ractions">${b.moves ? `<button class="btn tt-btn" data-r="more">+5 moves (${b.moves} left)</button>` : ''}<button class="btn ${b.moves ? 'secondary tt-btn2' : 'tt-btn'}" data-r="again">Try again</button><button class="btn ghost" data-r="map">Map</button></div>
    </div></div>`);
    root.appendChild(node);
    sfx.error();
    node.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]')?.dataset.r; if (!r) return;
      node.remove();
      if (r === 'more') { spendBooster('moves'); st.moves += 5; over = false; busy = false; hud(); callout('+5 moves', 1); }
      else if (r === 'again') app.replace('treatgame', { level });
      else app.back();
    });
  }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') treatHelp();
  });

  const ro = new ResizeObserver(() => layout());
  loadLevels().then(async () => {
    if (!alive) return;
    lv = LEVELS[level];
    if (!lv) { toast('Could not load this level'); return; }
    st = E.createState(lv, (Date.now() & 0x7fffffff) ^ (level * 7919));
    sync(); layout(); hud(); renderBoosters();
    ro.observe(wrap);
    requestAnimationFrame(frame);
    // candies tumble in at the start
    const list = [...sprites.values()];
    for (const sp of list) { sp.y0 = sp.y; sp.y = sp.y - st.h - 1; }
    await tween(520, (k) => { for (const sp of list) { const kk = Math.max(0, Math.min(1, k * 1.4 - (sp.x / st.w) * 0.4)); sp.y = sp.y0 - (st.h + 1) * (1 - ease.fall(kk)); } });
    for (const sp of list) { sp.y = sp.y0; delete sp.y0; }
    busy = false;
  });
  // a handle on the screen element for scripted checks: the state, a swap and whether it is busy
  root.__tt = { state: () => st, swap: (a, b) => attemptSwap(a, b), busy: () => busy, over: () => over };
  return { root, destroy() { alive = false; ro.disconnect(); } };
}
