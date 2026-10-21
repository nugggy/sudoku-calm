// Potion Pour: pour coloured potions between flasks until every flask holds a single colour.
import { store, save } from './store.js';
import { cbOn } from './cb.js';
import { icon } from './icons.js';
import { el, $, $$, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet, levelHome } from './kit.js';
import { CAP, topRun, canPour, pour, isFull, isSolved, recipe, decode, LEVEL_COUNT } from './potion-engine.js';

const PB = () => store.potion;
const UNDOS = 5;
const LIFT = 18;
export const potionHelp = () => helpSheet('How to play Potion Pour', [
  'Tap a flask to pick it up, then tap another flask to pour into it.',
  'Potion only pours onto the same colour or into an empty flask. All the matching layers on top pour together, as many as will fit.',
  'Fill every flask with a single colour to finish the level. A finished flask gets a cork.',
  'Stuck? Each level gives you 5 undos and one extra empty flask. The shapes button in the top bar adds a symbol to every colour.',
], 'potion-btn');

let levels = null;
async function loadLevels() { if (!levels) { try { levels = (await (await fetch('levels/potion.json')).json()).levels; } catch { levels = []; } } return levels; }

// ---------- Colours and symbols ----------
// Each colour has its own symbol, so colours can be told apart without relying on hue.
const SYM = {
  heart: 'M0,4.5C-6.5,0-5.5-5-2.6-5C-1.2-5,0-3.8,0-3C0-3.8,1.2-5,2.6-5C5.5-5,6.5,0,0,4.5Z',
  drop: 'M0-5.5C2.6-1.8,4.2,0.4,4.2,2A4.2,4.2,0,0,1-4.2,2C-4.2,0.4-2.6-1.8,0-5.5Z',
  star: 'M0-5.5L1.6-1.8L5.4-1.6L2.5,0.9L3.4,4.8L0,2.7L-3.4,4.8L-2.5,0.9L-5.4-1.6L-1.6-1.8Z',
  leaf: 'M-4.5,4.5C-4.5-2,-0.5-5,5-5C5,0.5,1.5,4.5,-4.5,4.5Z',
  moon: 'M1.5-5.2A5.2,5.2,0,1,0,5.2,2A4.2,4.2,0,1,1,1.5-5.2Z',
  tri: 'M0-5L5.2,4.2L-5.2,4.2Z',
  circle: 'M-4.4,0A4.4,4.4,0,1,0,4.4,0A4.4,4.4,0,1,0,-4.4,0Z',
  diamond: 'M0-5.6L4.4,0L0,5.6L-4.4,0Z',
  square: 'M-4-4H4V4H-4Z',
  plus: 'M-1.7-5H1.7V-1.7H5V1.7H1.7V5H-1.7V1.7H-5V-1.7H-1.7Z',
  bolt: 'M1.2-5.8L-4.2,0.8H-0.3L-1.2,5.8L4.2-0.8H0.3Z',
  ring: 'M-4.8,0A4.8,4.8,0,1,0,4.8,0A4.8,4.8,0,1,0,-4.8,0ZM-2.1,0A2.1,2.1,0,1,1,2.1,0A2.1,2.1,0,1,1,-2.1,0Z',
};
export const POTIONS = [
  { c: '#e5383b', s: 'heart' }, { c: '#2f80ed', s: 'drop' }, { c: '#ffd23f', s: 'star', dark: 1 }, { c: '#3bb54a', s: 'leaf' },
  { c: '#9b51e0', s: 'moon' }, { c: '#ff8c1a', s: 'tri', dark: 1 }, { c: '#ff8cc6', s: 'circle', dark: 1 }, { c: '#22d3c5', s: 'diamond', dark: 1 },
  { c: '#8d5a2b', s: 'square' }, { c: '#26307e', s: 'plus' }, { c: '#b5e655', s: 'bolt', dark: 1 }, { c: '#ece8e1', s: 'ring', dark: 1 },
];

// ---------- Flask geometry ----------
// Flasks are drawn in a 60 x 168 box (viewBox y from -8 so a cork fits above the lip).
// INNER is the inside of the glass, used to clip the liquid and to work out where it sits when tilted.
const VB_Y = -8, VB_H = 168;
const INNER_D = 'M22,6H38V31C38,40,51,42,51,52V128C51,144,42,151,30,151C18,151,9,144,9,128V52C9,42,22,40,22,31Z';
const OUTER_D = 'M18,9V30C18,37,5,40,5,51V128C5,148,16,155,30,155C44,155,55,148,55,128V51C55,40,42,37,42,30V9Z';
const FULL_Y = 52, BOTTOM_Y = 151, LH = (BOTTOM_Y - FULL_Y) / CAP;
function cubic(p0, p1, p2, p3, n = 10) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return out;
}
const INNER = [[22, 6], [38, 6], [38, 31], ...cubic([38, 31], [38, 40], [51, 42], [51, 52]), [51, 128], ...cubic([51, 128], [51, 144], [42, 151], [30, 151]),
  ...cubic([30, 151], [18, 151], [9, 144], [9, 128]), [9, 52], ...cubic([9, 52], [9, 42], [22, 40], [22, 31])];

// Area of the inside of the flask that lies "below" depth h, where depth is measured along gravity g.
function areaBelow(g, h) {
  const pts = [], n = INNER.length;
  for (let i = 0; i < n; i++) {
    const p = INNER[i], q = INNER[(i + 1) % n];
    const dp = p[0] * g[0] + p[1] * g[1] - h, dq = q[0] * g[0] + q[1] * g[1] - h;
    if (dp >= 0) pts.push(p);
    if ((dp >= 0) !== (dq >= 0)) { const t = dp / (dp - dq); pts.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a) / 2;
}
// Cumulative area of whole layers at rest, so a tilted flask keeps the same amount of potion.
const CUM = [...Array(CAP + 1)].map((_, k) => (k ? areaBelow([0, 1], BOTTOM_Y - k * LH) : 0));
const areaOf = (f) => { const k = Math.max(0, Math.min(CAP - 1, Math.floor(f))); return CUM[k] + (f - k) * (CUM[k + 1] - CUM[k]); };
const gOf = (th) => [Math.sin(th), Math.cos(th)];
function levelFor(g, area) {
  let lo = Infinity, hi = -Infinity;
  for (const p of INNER) { const d = p[0] * g[0] + p[1] * g[1]; lo = Math.min(lo, d); hi = Math.max(hi, d); }
  if (area <= 0) return hi;
  for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (areaBelow(g, m) > area) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
// Tilt at which the surface of f layers just reaches the mouth (clockwise, pouring to the right).
const ANG = [...Array(CAP * 20 + 1)].map((_, i) => {
  const area = areaOf(i / 20); let lo = 0, hi = 1.95;
  if (!i) return hi;
  for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2, g = gOf(m); if (38 * g[0] + 6 * g[1] >= levelFor(g, area)) hi = m; else lo = m; }
  return hi;
});
const angleFor = (f) => { const x = Math.max(0, Math.min(CAP * 20, f * 20)), i = Math.floor(x), j = Math.min(CAP * 20, i + 1); return ANG[i] + (ANG[j] - ANG[i]) * (x - i); };

// Liquid bands for segments [{c, n}] (bottom first, n in layers) with the flask tilted by th radians.
function liquidSVG(segs, th = 0, symbols = false) {
  const g = gOf(th), u = [g[1], -g[0]], R = 300;
  const pt = (h, s) => `${(g[0] * h + u[0] * s).toFixed(2)},${(g[1] * h + u[1] * s).toFixed(2)}`;
  let out = '', syms = '', cum = 0, prev = 400, topH = null;
  for (const sg of segs) {
    if (sg.n <= 0.001) continue;
    cum += sg.n;
    const h = levelFor(g, areaOf(cum)), P = POTIONS[sg.c];
    out += `<polygon points="${pt(h, -R)} ${pt(h, R)} ${pt(prev + 2, R)} ${pt(prev + 2, -R)}" fill="${P.c}"/>`;
    if (symbols && !th && sg.n > 0.6) {
      const cy = (h + Math.min(prev, BOTTOM_Y - 2)) / 2;
      syms += `<path d="${SYM[P.s]}" transform="translate(30 ${cy.toFixed(1)}) scale(1.3)" fill="${P.dark ? 'rgba(40,25,20,.62)' : 'rgba(255,255,255,.85)'}"/>`;
    }
    prev = h; topH = h;
  }
  // a lighter rim on the surface reads as the meniscus of the potion
  if (topH !== null) out += `<polygon points="${pt(topH, -R)} ${pt(topH, R)} ${pt(topH + 3, R)} ${pt(topH + 3, -R)}" fill="#fff" opacity=".28"/>`;
  return out + syms;
}

let uid = 0;
function flaskSVG(segs, { cork = false, symbols = false, pop = false } = {}) {
  const id = `ppc${++uid}`;
  return `<svg class="pp-svg" viewBox="0 ${VB_Y} 60 ${VB_H}" aria-hidden="true">
    <defs><clipPath id="${id}"><path d="${INNER_D}"/></clipPath></defs>
    <path class="pp-glass" d="${OUTER_D}"/>
    <g class="pp-liq" clip-path="url(#${id})">${liquidSVG(segs, 0, symbols)}</g>
    <g clip-path="url(#${id})"><path d="M44,50h9v100h-9z" fill="#000" opacity=".1"/></g>
    <path class="pp-line" d="${OUTER_D}"/>
    <path d="M11.5,60V124C11.5,134,13,139,16,142" class="pp-shine"/><path d="M21,14V27" class="pp-shine s2"/><circle cx="46" cy="62" r="2.2" fill="#fff" opacity=".55"/>
    <rect class="pp-lip" x="14" y="1" width="32" height="9" rx="3.5"/>
    ${cork ? `<g class="pp-cork ${pop ? 'pop' : ''}"><rect x="19" y="-7" width="22" height="17" rx="3.5"/><path d="M19.5,-2.5h21" class="pp-cork-l"/><circle cx="25" cy="3.5" r="1.1"/><circle cx="34" cy="-0.5" r="1"/><circle cx="31" cy="5" r=".9"/><path d="M17,11.5q13,4,26,0" class="pp-twine"/></g>` : ''}
  </svg>`;
}
const segsOf = (layers) => layers.map((c) => ({ c, n: 1 }));

// ---------- Picker and home art ----------
function shelfArt(cls) {
  const b = (layers, cork) => `<div class="pp-mini">${flaskSVG(segsOf(layers), { cork })}</div>`;
  return `<div class="${cls}">${b([1, 4, 4, 1], false)}${b([0, 0, 0, 0], true)}${b([2, 3, 2], false)}</div>`;
}
export const potionCardArt = () => shelfArt('art-potion');

// ---------- Home ----------
export function potionHomeScreen(app) {
  return levelHome({
    app, cls: 'potion-theme', title: 'Potion Pour', help: potionHelp, load: loadLevels,
    hero: shelfArt('pp-hero'),
    play: () => {
      const i = Math.min(PB().level, LEVEL_COUNT - 1);
      return { label: PB().level >= LEVEL_COUNT ? 'Play again' : `Play level ${i + 1}`, sub: `${recipe(i).k} colours` };
    },
    onPlay: () => app.go('potiongame', { idx: Math.min(PB().level, (levels.length || 1) - 1) }),
    levels: () => ({ count: Math.min(levels.length, Math.max(30, Math.ceil((PB().level + 15) / 5) * 5)), current: PB().level, done: (i) => i < PB().level }),
    onLevel: (i) => app.go('potiongame', { idx: i }),
  });
}

// ---------- Game ----------
// Shop decoration: a garland of drying herbs and two warm lanterns hanging along the top wall.
const herb = (x, y, c) => `<g transform="translate(${x} ${y})"><path d="M0,0V8" stroke="#7a4a22" stroke-width="1.4"/><rect x="-3.5" y="7" width="7" height="4" rx="1.5" fill="#c0392b"/>
  <path d="M-1,11C-9,20,-9,30,-6,36M0,11C0,22,1,30,0,38M1,11C9,20,9,30,6,36" stroke="${c}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <ellipse cx="-6" cy="24" rx="2.6" ry="5" transform="rotate(20 -6 24)" fill="${c}"/><ellipse cx="6" cy="24" rx="2.6" ry="5" transform="rotate(-20 6 24)" fill="${c}"/>
  <ellipse cx="0" cy="30" rx="2.6" ry="5.5" fill="${c}"/><ellipse cx="-5" cy="34" rx="2.2" ry="4.4" transform="rotate(25 -5 34)" fill="${c}"/><ellipse cx="5" cy="34" rx="2.2" ry="4.4" transform="rotate(-25 5 34)" fill="${c}"/></g>`;
const lantern = (x, y) => `<g transform="translate(${x} ${y})"><path d="M0,0V10" stroke="#5a3a24" stroke-width="1.4"/><circle class="pp-glow" cx="0" cy="30" r="26"/>
  <path d="M-8,12H8L6,17H-6Z" fill="#5a3a24"/><rect x="-9" y="17" width="18" height="24" rx="5" fill="#ffd27a" stroke="#5a3a24" stroke-width="2"/>
  <path d="M-3,22C-6,27,-6,32,-3,36" stroke="#fff" stroke-width="1.6" fill="none" opacity=".7" stroke-linecap="round"/><path d="M0,31c-2-3,2-5,0-8c3,2,3,6,0,8z" fill="#ff8a2a"/>
  <path d="M-7,41H7L5,45H-5Z" fill="#5a3a24"/></g>`;
const DECO = `<svg viewBox="0 0 400 96" preserveAspectRatio="xMidYMin meet"><defs><radialGradient id="ppGlow"><stop offset="0" stop-color="#ffd27a" stop-opacity=".8"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient></defs><path d="M-10,6Q100,34,200,16T410,8" stroke="#7a4a22" stroke-width="1.6" fill="none"/>
  ${herb(48, 14, '#7f9b4c')}${lantern(112, 24)}${herb(170, 19, '#9a7bb8')}${herb(236, 15, '#c08a4a')}${lantern(296, 12)}${herb(356, 9, '#6d9a7a')}</svg>`;

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
function tween(ms, fn) {
  return new Promise((resolve) => {
    const t0 = performance.now(); let done = false;
    const finish = () => { if (done) return; done = true; fn(1); resolve(); };
    const step = (now) => { if (done) return; const t = Math.min(1, (now - t0) / ms); fn(t); if (t < 1) requestAnimationFrame(step); else finish(); };
    requestAnimationFrame(step);
    setTimeout(finish, ms + 400); // in case animation frames are paused
  });
}

export function potionGameScreen(app, { idx }) {
  const pb = PB();
  // symbols show with this game's own toggle, or always while colourblind mode is on
  const symOn = () => cbOn() || !!pb.symbols;
  let s = null, start = null, hist = [], undos = UNDOS, extra = false, moves = 0, sel = -1, busy = false, done = false, alive = true;
  const root = el(`<section class="screen potion-theme potion-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">Level ${idx + 1}</div>
      <button class="icon-btn pp-symbtn" data-act="symbols" aria-label="Colour symbols"><svg viewBox="0 0 24 24"><circle cx="7" cy="7.5" r="4"/><path d="M17 3.5l4.5 8h-9z"/><rect x="3" y="14" width="8" height="7" rx="1"/><path d="M17 13.5l1.3 2.8 3 .3-2.3 2 .7 3-2.7-1.6-2.7 1.6.7-3-2.3-2 3-.3z"/></svg></button>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="pp-deco" aria-hidden="true">${DECO}</div>
    <div class="pp-info"><span data-el="cols"></span><span data-el="moves">Moves 0</span></div>
    <div class="pp-shop" data-el="area"></div>
    <div class="pp-bar">
      <button class="pp-tool" data-act="undo"><span class="pp-round">${icon.undo}<b data-el="undos">${UNDOS}</b></span>Undo</button>
      <button class="pp-tool" data-act="restart"><span class="pp-round">${icon.restart}</span>Restart</button>
      <button class="pp-tool" data-act="flask"><span class="pp-round">${icon.plus}<b data-el="flask">1</b></span>Flask</button>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const area = q('area');
  let fw = 50;

  function persist() { if (s && !done) { pb.current = { idx, s, hist, undos, extra, moves }; save(); } }

  // Works out flask size from the space available: one row up to 6 flasks, otherwise two rows.
  function layout() {
    if (!s) return;
    const n = s.length, per = n <= 6 ? n : Math.ceil(n / 2), rows = n <= 6 ? 1 : 2;
    const gap = per > 6 ? 6 : 12, W = area.clientWidth - 24, H = area.clientHeight;
    const byW = (W - (per - 1) * gap) / per, byH = (H / rows - 46 - LIFT) / (VB_H / 60);
    fw = Math.max(28, Math.floor(Math.min(byW, byH, rows === 1 ? 76 : 64)));
    area.style.setProperty('--gap', gap + 'px');
  }

  function flaskHTML(i, pop) {
    const f = s[i];
    return `<button class="pf ${i === sel ? 'sel' : ''}" data-f="${i}" style="width:${fw}px" aria-label="Flask ${i + 1}">
      <div class="pf-b">${flaskSVG(segsOf(f), { cork: isFull(f), symbols: symOn(), pop: i === pop })}</div></button>`;
  }
  function render(pop = -1) {
    if (!s) return;
    layout();
    const n = s.length, per = n <= 6 ? n : Math.ceil(n / 2);
    const rows = n <= 6 ? [[...s.keys()]] : [[...s.keys()].slice(0, per), [...s.keys()].slice(per)];
    area.innerHTML = rows.map((r) => `<div class="pp-row">${r.map((i) => flaskHTML(i, pop)).join('')}</div>`).join('');
    q('undos').textContent = undos;
    q('undos').classList.toggle('none', !undos);
    $('[data-act="undo"]', root).classList.toggle('off', !undos || !hist.length);
    q('flask').textContent = extra ? '0' : '1';
    q('flask').classList.toggle('none', extra);
    $('[data-act="flask"]', root).classList.toggle('off', extra);
    q('moves').textContent = `Moves ${moves}`;
    q('cols').textContent = `${recipe(idx).k} colours`;
    root.classList.toggle('symbols', symOn());
    if (pop >= 0) sparkle(pop);
  }

  function sparkle(i) {
    const f = $(`.pf[data-f="${i}"]`, area); if (!f) return;
    const box = el(`<div class="pp-spark">${[...Array(8)].map((_, k) => `<i style="--a:${k * 45 + 20}deg;--d:${k % 2 ? 26 : 38}px"><svg viewBox="-5 -5 10 10"><path d="M0-5L1.3-1.3L5,0L1.3,1.3L0,5L-1.3,1.3L-5,0L-1.3-1.3Z"/></svg></i>`).join('')}</div>`);
    f.appendChild(box);
    setTimeout(() => box.remove(), 1000);
  }

  // The pour: lift over the target, tilt until the potion reaches the lip, stream it across, then return.
  async function animatePour(a, b, n, colour, before) {
    const fa = $(`.pf[data-f="${a}"]`, area), fb = $(`.pf[data-f="${b}"]`, area);
    const body = $('.pf-b', fa), liqA = $('.pp-liq', fa), liqB = $('.pp-liq', fb);
    if (!fa || !fb || !liqA || !liqB) return;
    const rr = root.getBoundingClientRect(), ra = fa.getBoundingClientRect(), rb = fb.getBoundingClientRect();
    const sc = ra.width / 60, px = (x, y) => [x * sc, (y - VB_Y) * sc];
    let dir = rb.left > ra.left ? 1 : rb.left < ra.left ? -1 : (rb.left + rb.width / 2 > rr.left + rr.width / 2 ? -1 : 1);
    // the tilted body trails behind the mouth, so come in from the other side when it would leave the screen
    const cx = rb.left - rr.left + rb.width / 2, reach = ra.height * 0.95;
    if (dir < 0 && cx + reach > rr.width) dir = 1; else if (dir > 0 && cx - reach < 0) dir = -1;
    const O = px(30, 6), L = px(dir > 0 ? 46 : 14, 3);
    const E = [ra.left - rr.left, ra.top - rr.top];
    const D = [rb.left - rr.left + rb.width / 2, rb.top - rr.top + (1 - VB_Y) * (rb.width / 60) - 10];
    const rot = (v, th) => [v[0] * Math.cos(th) - v[1] * Math.sin(th), v[0] * Math.sin(th) + v[1] * Math.cos(th)];
    const Tfor = (th) => { const r = rot([L[0] - O[0], L[1] - O[1]], th); return [D[0] - E[0] - O[0] - r[0], D[1] - E[1] - O[1] - r[1]]; };
    const lift = fa.classList.contains('sel') ? -LIFT : 0;
    const srcBase = segsOf(s[a]), tgtBase = segsOf(before.tgt);
    const f0 = before.src.length, fEnd = s[a].length;
    const set = (T, th) => { body.style.transform = `translate(${T[0].toFixed(1)}px,${T[1].toFixed(1)}px) rotate(${(th * 180 / Math.PI).toFixed(2)}deg)`; };
    body.style.transformOrigin = `${O[0]}px ${O[1]}px`;
    body.style.transition = 'none';
    fa.classList.add('pouring'); fa.classList.remove('sel');
    const srcLiq = (left, th) => { liqA.innerHTML = liquidSVG([...srcBase, { c: colour, n: left }], th); };
    // 1. move over the target and start tilting
    const thStart = dir * angleFor(f0);
    await tween(300, (t) => {
      const e = ease(t), th = thStart * e * 0.92, T = Tfor(th);
      set([T[0] * e, lift + (T[1] - lift) * e], th); srcLiq(n, th);
    });
    // 2. pour: the tilt follows the level so the potion keeps cresting the lip
    const stream = el(`<div class="pp-stream" style="--pc:${POTIONS[colour].c};left:${D[0]}px;top:${D[1]}px;width:${Math.max(4, 6 * sc).toFixed(1)}px"></div>`);
    root.appendChild(stream);
    const tgtTop = (fill) => rb.top - rr.top + (levelFor([0, 1], areaOf(fill)) - VB_Y) * (rb.width / 60);
    sfx.place();
    await tween(260 + 150 * n, (t) => {
      const left = n * (1 - t), th = dir * angleFor(fEnd + left);
      set(Tfor(th), th); srcLiq(left, th);
      const got = n * Math.max(0, Math.min(1, (t - 0.08) / 0.92));
      liqB.innerHTML = liquidSVG([...tgtBase, { c: colour, n: got }], 0, symOn() && got > 0.99 * n);
      stream.style.height = `${Math.max(0, tgtTop(before.tgt.length + got) - D[1]) * Math.min(1, t * 6)}px`;
    });
    // 3. stream breaks off and the flask goes home
    const endTh = dir * angleFor(fEnd), T1 = Tfor(endTh);
    stream.classList.add('end');
    setTimeout(() => stream.remove(), 220);
    await tween(280, (t) => {
      const e = ease(t), th = endTh * (1 - e);
      set([T1[0] * (1 - e), T1[1] * (1 - e)], th); srcLiq(0, th);
    });
    body.style.transform = ''; body.style.transition = ''; fa.classList.remove('pouring');
  }

  const usefulMove = () => s.some((f, a) => f.length && !isFull(f) && s.some((g, b) => canPour(s, a, b) && !(!g.length && topRun(f).n === f.length)));

  async function tap(i) {
    if (busy || done || !s) return;
    if (sel < 0) { if (!s[i].length || isFull(s[i])) { buzz(10); return; } sel = i; sfx.tap(); setSel(); return; }
    if (sel === i) { sel = -1; setSel(); return; }
    if (!canPour(s, sel, i)) {
      sfx.error();
      const t = $(`.pf[data-f="${i}"]`, area); t?.classList.remove('nope'); void t?.offsetWidth; t?.classList.add('nope');
      if (s[i].length && !isFull(s[i])) { sel = i; setSel(); }
      return;
    }
    busy = true;
    const a = sel; sel = -1;
    hist.push(s.map((f) => f.slice())); if (hist.length > UNDOS) hist.shift();
    const before = { src: s[a].slice(), tgt: s[i].slice() }, colour = s[a][s[a].length - 1];
    const n = pour(s, a, i);
    moves++;
    persist();
    await animatePour(a, i, n, colour, before);
    if (!alive) return;
    const finished = isFull(s[i]);
    render(finished ? i : -1);
    if (finished) { sfx.unit(); buzz(20); }
    busy = false;
    if (isSolved(s)) win();
    else if (!usefulMove()) toast(undos && hist.length ? 'No moves left. Try undo or an extra flask' : 'No moves left. Try an extra flask or restart', 3200);
  }
  function setSel() { $$('.pf', area).forEach((f) => f.classList.toggle('sel', +f.dataset.f === sel)); }

  async function win() {
    done = true;
    if (idx >= pb.level) pb.level = idx + 1;
    pb.current = null; save(true);
    sfx.win(); confetti();
    $$('.pf', area).forEach((f, k) => setTimeout(() => f.classList.add('cheer'), k * 70));
    await new Promise((r) => setTimeout(r, 1000));
    if (!alive) return;
    const last = idx + 1 >= levels.length;
    const v = await dialog({
      hero: 'img/art/ui/trophy.svg', title: last ? 'Every potion brewed' : 'Potions sorted', dismissible: false,
      text: last ? `You finished all ${levels.length} levels. Well done.` : `Level ${idx + 1} in ${moves} moves`,
      buttons: last ? [{ label: 'Back', value: 'back' }] : [{ label: 'Next level', value: 'next' }, { label: 'Back', value: 'back', cls: 'ghost' }],
    });
    if (v === 'next') app.replace('potiongame', { idx: idx + 1 }); else app.back();
  }

  function restart() {
    s = start.map((f) => f.slice()); hist = []; undos = UNDOS; extra = false; moves = 0; sel = -1;
    persist(); render();
  }

  root.addEventListener('click', (e) => {
    const f = e.target.closest('[data-f]');
    if (f) return tap(+f.dataset.f);
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') potionHelp();
    else if (a === 'symbols') {
      if (cbOn()) { toast('Symbols stay on while colourblind mode is on in Settings'); return; }
      pb.symbols = !pb.symbols; save(); render(); toast(pb.symbols ? 'Colour symbols on' : 'Colour symbols off');
    }
    else if (!s || busy || done) return;
    else if (a === 'undo') {
      if (!undos) { toast('No undos left for this level'); return; }
      if (!hist.length) { toast('Nothing to undo'); return; }
      s = hist.pop(); undos--; sel = -1; moves = Math.max(0, moves - 1); sfx.erase(); persist(); render();
    } else if (a === 'restart') restart();
    else if (a === 'flask') {
      if (extra) { toast('You already added the extra flask'); return; }
      extra = true; s.push([]); hist.forEach((h) => h.push([])); sel = -1; sfx.hint(); persist(); render();
      $(`.pf[data-f="${s.length - 1}"]`, area)?.classList.add('appear');
    }
  });

  const ro = new ResizeObserver(() => { if (!busy) render(); });
  loadLevels().then(() => {
    if (!alive) return;
    if (!levels[idx]) { toast('Could not load this level'); return; }
    start = decode(levels[idx]);
    const cur = pb.current && pb.current.idx === idx ? pb.current : null;
    if (cur) ({ s, hist, undos, extra, moves } = cur);
    else s = start.map((f) => f.slice());
    render();
    ro.observe(area);
  });
  if (!pb.seenHelp) { pb.seenHelp = true; save(); setTimeout(potionHelp, 350); }
  return { root, destroy() { alive = false; ro.disconnect(); persist(); save(true); } };
}
